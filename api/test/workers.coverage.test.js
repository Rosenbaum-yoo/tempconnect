/**
 * Unit coverage for the BullMQ workers (api/workers/*).
 *
 * Redis/BullMQ is NOT available in the test env. Strategy:
 *
 *   - The processor function each `start*Worker()` registers is the 2nd arg of
 *     `new Worker(name, processor, opts)`. BullMQ stores it on `worker.processFn`.
 *     We construct the REAL worker (inert: it never actually drains a queue here)
 *     and then invoke `worker.processFn(fakeJob)` directly to exercise the real
 *     job-processing logic end-to-end through the real services.
 *
 *   - `config.REDIS_URL` is set BEFORE importing the worker modules so that
 *     `getConnectionOpts()` returns a connection object and `start*Worker()`
 *     does NOT short-circuit to `null`.
 *
 *   - The workers (and the services they dynamically import) use the shared
 *     `pool` from `../db/pool.js`. We mutate that exported pool object's
 *     `query`/`connect` methods to a SQL-pattern-routing tracking pool, so the
 *     real service call graph runs against deterministic in-memory results and
 *     we can assert SQL shape, params and query counts.
 *
 * No source file is modified. Only this test file is created.
 */

import assert from "node:assert/strict";
import { describe, it, before, after, beforeEach } from "node:test";

// ── Enable the queue layer BEFORE importing any worker module ───────────────
const { config } = await import("../config/index.js");
const _origRedisUrl = config.REDIS_URL;
config.REDIS_URL = "redis://127.0.0.1:6379";

// ── Take over the shared pg pool with a routing tracking pool ───────────────
const { pool } = await import("../db/pool.js");
const _origQuery = pool.query.bind(pool);
const _origConnect = pool.connect.bind(pool);

/**
 * Build a tracking pool wired onto the shared `pool` object.
 * `handler(sql, params)` returns a pg-result-like object ({ rows, rowCount }),
 * or undefined to fall back to the empty default. Every call is recorded.
 */
function installTrackingPool(handler) {
  const calls = [];
  const queryFn = async (sql, params) => {
    const text = typeof sql === "string" ? sql : sql?.text ?? "";
    calls.push({ sql: text, params: params ?? sql?.values });
    const TX = ["BEGIN", "COMMIT", "ROLLBACK"];
    if (TX.includes(text.trim().toUpperCase())) return { rows: [], rowCount: 0 };
    const res = handler ? handler(text, params ?? sql?.values) : undefined;
    if (res) return { rowCount: res.rows ? res.rows.length : 0, ...res };
    return { rows: [], rowCount: 0 };
  };
  pool.query = queryFn;
  pool.connect = async () => ({ query: queryFn, release: () => {} });
  return calls;
}

function restorePool() {
  pool.query = _origQuery;
  pool.connect = _origConnect;
}

// ── Import worker modules (now with REDIS_URL set) ──────────────────────────
const emailWorkerMod = await import("../workers/emailWorker.js");
const matchWorkerMod = await import("../workers/matchWorker.js");
const capacityWorkerMod = await import("../workers/capacityWorker.js");
const staffingWorkerMod = await import("../workers/staffingWorker.js");
const indexMod = await import("../workers/index.js");
const nodemailerMod = await import("nodemailer");
const nodemailer = nodemailerMod.default;

/**
 * Force emailService.getTransporter() down the SMTP path and intercept the
 * built transporter via nodemailer.createTransport. ESM namespace members of
 * emailService are non-configurable (can't stub sendMail directly), so this is
 * the real seam: the worker calls the real emailService.sendMail, which builds a
 * transporter through nodemailer — which we capture here.
 *
 * emailService caches `_transporter` after the first build, so we install ONE
 * capturing transporter whose behavior is switched via `_transportState`.
 */
const _emailSent = [];
const _transportState = { mode: "ok" }; // "ok" | "throw"
const _capturingTransport = {
  sendMail: async (msg) => {
    if (_transportState.mode === "throw") throw new Error("SMTP_DOWN");
    _emailSent.push(msg);
    return { messageId: "captured-1", accepted: [msg.to], rejected: [] };
  },
  verify: async () => true,
  close: () => {}
};
// Route emailService onto our capturing transport: force the SMTP provider so
// resolveEmailProvider() derives SMTP and getTransporter() builds a transporter.
const _origEmailProvider = config.EMAIL_PROVIDER;
config.EMAIL_PROVIDER = "smtp";
config.SMTP_HOST = "smtp.test.local";
config.SMTP_PORT = 587;
const _origCreateTransport = nodemailer.createTransport;
nodemailer.createTransport = () => _capturingTransport;

// Keep created workers so we can close them at the end (avoid leaked timers).
const _createdWorkers = [];
function track(w) { if (w) _createdWorkers.push(w); return w; }

after(async () => {
  for (const w of _createdWorkers) {
    try { await w.close(true); } catch { /* ignore */ }
  }
  restorePool();
  config.REDIS_URL = _origRedisUrl;
  nodemailer.createTransport = _origCreateTransport;
  config.EMAIL_PROVIDER = _origEmailProvider;
});

// ════════════════════════════════════════════════════════════════════════════
// emailWorker
// ════════════════════════════════════════════════════════════════════════════
describe("emailWorker.startEmailWorker", () => {
  it("returns null when no Redis connection is configured", async () => {
    const prev = config.REDIS_URL;
    config.REDIS_URL = "";
    // connection.js caches _connection, but getConnectionOpts checks REDIS_URL
    // first, so clearing it forces the null path.
    try {
      const w = emailWorkerMod.startEmailWorker();
      assert.equal(w, null, "no Redis → null worker");
    } finally {
      config.REDIS_URL = prev;
    }
  });

  it("constructs a worker exposing a processor function", () => {
    const w = track(emailWorkerMod.startEmailWorker());
    assert.ok(w, "worker created when Redis configured");
    assert.equal(typeof w.processFn, "function", "processor captured on processFn");
    assert.equal(w.name, "email", "queue name is 'email'");
  });

  it("processor delegates the job payload to the email transport", async () => {
    const w = track(emailWorkerMod.startEmailWorker());
    _transportState.mode = "ok";
    _emailSent.length = 0;
    const job = {
      id: "job-email-1",
      data: { to: "a@b.de", subject: "Hi", html: "<b>x</b>", text: "x", templateName: "welcome" }
    };
    const out = await w.processFn(job);
    assert.equal(out, undefined, "processor returns nothing (fire-and-forget await)");
    assert.equal(_emailSent.length, 1, "exactly one mail dispatched through the transport");
    const msg = _emailSent[0];
    assert.equal(msg.to, "a@b.de", "recipient forwarded");
    assert.equal(msg.subject, "Hi", "subject forwarded");
    assert.equal(msg.html, "<b>x</b>", "html forwarded");
    assert.equal(msg.text, "x", "text forwarded");
    assert.equal("templateName" in msg, false,
      "templateName is NOT forwarded to the transport (worker drops it)");
  });

  it("processor propagates transport errors (so BullMQ can retry)", async () => {
    const w = track(emailWorkerMod.startEmailWorker());
    _transportState.mode = "throw";
    try {
      await assert.rejects(
        () => w.processFn({ id: "j", data: { to: "x@y.de", subject: "s" } }),
        /SMTP_DOWN/,
        "transport failure bubbles out of the processor"
      );
    } finally {
      _transportState.mode = "ok";
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// matchWorker
// ════════════════════════════════════════════════════════════════════════════
describe("matchWorker.startMatchWorker", () => {
  it("returns null without Redis", () => {
    const prev = config.REDIS_URL;
    config.REDIS_URL = "";
    try {
      assert.equal(matchWorkerMod.startMatchWorker(), null);
    } finally {
      config.REDIS_URL = prev;
    }
  });

  it("constructs a 'match' worker with a processor", () => {
    const w = track(matchWorkerMod.startMatchWorker());
    assert.ok(w);
    assert.equal(w.name, "match");
    assert.equal(typeof w.processFn, "function");
  });

  it("processor returns zero-match shape when the demand request does not exist", async () => {
    // findMatches() looks up demand_requests by id; empty → returns [].
    const calls = installTrackingPool((sql) => {
      if (/FROM demand_requests WHERE id = \$1/.test(sql)) return { rows: [] };
      return { rows: [] };
    });
    try {
      const w = track(matchWorkerMod.startMatchWorker());
      const out = await w.processFn({ id: "m1", data: { requestId: "00000000-0000-0000-0000-000000000000" } });
      assert.deepEqual(out, { matchCount: 0, topScore: null },
        "no demand request → 0 matches, null top score");
      // The demand_requests lookup actually ran with the requestId param.
      const lookup = calls.find(c => /FROM demand_requests WHERE id = \$1/.test(c.sql));
      assert.ok(lookup, "demand_requests lookup query executed");
      assert.deepEqual(lookup.params, ["00000000-0000-0000-0000-000000000000"],
        "requestId passed as the bound parameter");
    } finally {
      restorePool();
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// capacityWorker
// ════════════════════════════════════════════════════════════════════════════
describe("capacityWorker.startCapacityWorker", () => {
  it("returns null without Redis", () => {
    const prev = config.REDIS_URL;
    config.REDIS_URL = "";
    try {
      assert.equal(capacityWorkerMod.startCapacityWorker(), null);
    } finally {
      config.REDIS_URL = prev;
    }
  });

  it("constructs a 'capacity' worker with a processor", () => {
    const w = track(capacityWorkerMod.startCapacityWorker());
    assert.ok(w);
    assert.equal(w.name, "capacity");
    assert.equal(typeof w.processFn, "function");
  });

  it("capacity-expiry expires posts + demand and returns merged counts", async () => {
    const calls = installTrackingPool((sql) => {
      if (/UPDATE capacity_posts SET status = 'expired'/.test(sql)) {
        return { rows: [{ id: "p1", supplier_company_id: "s1" }, { id: "p2", supplier_company_id: "s2" }] };
      }
      if (/UPDATE demand_requests SET status = 'expired'/.test(sql)) {
        return { rows: [{ id: "d1", requester_company_id: "r1" }] };
      }
      return { rows: [] }; // dispatch() internals → no-op rows
    });
    try {
      const w = track(capacityWorkerMod.startCapacityWorker());
      const out = await w.processFn({ id: "c1", name: "capacity-expiry", data: {} });
      assert.equal(out.expired, 2, "two capacity posts expired");
      assert.deepEqual(out.entries.map(e => e.id), ["p1", "p2"], "expired entry ids returned");
      assert.equal(out.demandExpired, 1, "one demand request expired");
      // Both expiry UPDATEs ran.
      assert.ok(calls.some(c => /UPDATE capacity_posts SET status = 'expired'/.test(c.sql)));
      assert.ok(calls.some(c => /UPDATE demand_requests SET status = 'expired'/.test(c.sql)));
    } finally {
      restorePool();
    }
  });

  it("capacity-expiry with no expired entries returns empty result and skips notifications", async () => {
    const calls = installTrackingPool(() => ({ rows: [] }));
    try {
      const w = track(capacityWorkerMod.startCapacityWorker());
      const out = await w.processFn({ id: "c2", name: "capacity-expiry", data: { batchSize: 50 } });
      assert.equal(out.expired, 0);
      assert.equal(out.demandExpired, 0);
      assert.deepEqual(out.entries, []);
      // Only the two UPDATE queries — no dispatch() lookups since entries empty.
      const updates = calls.filter(c => /UPDATE (capacity_posts|demand_requests)/.test(c.sql));
      assert.equal(updates.length, 2, "exactly the two expiry UPDATEs ran");
    } finally {
      restorePool();
    }
  });

  it("capacity-stale-check returns staleCount and passes staleDays param", async () => {
    const calls = installTrackingPool((sql) => {
      if (/FROM capacity_posts\s+WHERE status = 'active'/.test(sql) && /last_confirmed_at/.test(sql)) {
        return { rows: [
          { id: "p1", supplier_company_id: "s1", title: "A", last_confirmed_at: null },
          { id: "p2", supplier_company_id: "s2", title: "B", last_confirmed_at: null }
        ] };
      }
      return { rows: [] };
    });
    try {
      const w = track(capacityWorkerMod.startCapacityWorker());
      const out = await w.processFn({ id: "c3", name: "capacity-stale-check", data: { staleDays: 10 } });
      assert.deepEqual(out, { staleCount: 2 }, "stale count reflects returned rows");
      const staleQ = calls.find(c => /FROM capacity_posts/.test(c.sql) && /LIMIT \$2/.test(c.sql));
      assert.ok(staleQ, "findStaleEntries SELECT ran");
      assert.equal(staleQ.params[0], 10, "staleDays forwarded as $1");
      assert.equal(staleQ.params[1], 100, "batchSize default 100 as $2");
    } finally {
      restorePool();
    }
  });

  it("capacity-stale-check defaults staleDays to 7 when not provided", async () => {
    const calls = installTrackingPool(() => ({ rows: [] }));
    try {
      const w = track(capacityWorkerMod.startCapacityWorker());
      const out = await w.processFn({ id: "c4", name: "capacity-stale-check", data: {} });
      assert.deepEqual(out, { staleCount: 0 });
      const staleQ = calls.find(c => /FROM capacity_posts/.test(c.sql) && /LIMIT \$2/.test(c.sql));
      assert.ok(staleQ);
      assert.equal(staleQ.params[0], 7, "default staleDays = 7");
    } finally {
      restorePool();
    }
  });

  it("unknown job name is skipped without touching the DB", async () => {
    const calls = installTrackingPool(() => ({ rows: [] }));
    try {
      const w = track(capacityWorkerMod.startCapacityWorker());
      const out = await w.processFn({ id: "c5", name: "totally-unknown", data: {} });
      assert.deepEqual(out, { skipped: true }, "unknown job type → skipped:true");
      assert.equal(calls.length, 0, "no SQL executed for unknown job");
    } finally {
      restorePool();
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// staffingWorker
// ════════════════════════════════════════════════════════════════════════════
describe("staffingWorker.startStaffingWorker", () => {
  it("returns null without Redis", () => {
    const prev = config.REDIS_URL;
    config.REDIS_URL = "";
    try {
      assert.equal(staffingWorkerMod.startStaffingWorker(), null);
    } finally {
      config.REDIS_URL = prev;
    }
  });

  it("constructs a 'staffing' worker with a processor", () => {
    const w = track(staffingWorkerMod.startStaffingWorker());
    assert.ok(w);
    assert.equal(w.name, "staffing");
    assert.equal(typeof w.processFn, "function");
  });

  it("processor skips with INVITE_NOT_FOUND when the invite does not exist", async () => {
    // deliverStaffingInviteNotification → loadInviteDeliveryContext returns no row.
    const calls = installTrackingPool(() => ({ rows: [] }));
    try {
      const w = track(staffingWorkerMod.startStaffingWorker());
      const out = await w.processFn({
        id: "s1",
        name: "staffing-deliver",
        data: { inviteId: "11111111-1111-1111-1111-111111111111", kind: "initial" }
      });
      assert.deepEqual(out, { skipped: "INVITE_NOT_FOUND" },
        "missing invite → skipped INVITE_NOT_FOUND");
      // The invite delivery context lookup ran with the inviteId param.
      const lookup = calls.find(c => /assignment_staffing_invites/.test(c.sql));
      assert.ok(lookup, "invite lookup query executed");
      assert.ok(
        (lookup.params || []).includes("11111111-1111-1111-1111-111111111111"),
        "inviteId bound into the lookup"
      );
    } finally {
      restorePool();
    }
  });

  it("processor defaults kind to 'initial' when omitted", async () => {
    // With an empty pool the result is still INVITE_NOT_FOUND, but the call must
    // not throw on a missing kind — exercising the `kind || "initial"` default.
    installTrackingPool(() => ({ rows: [] }));
    try {
      const w = track(staffingWorkerMod.startStaffingWorker());
      const out = await w.processFn({
        id: "s2", name: "staffing-deliver",
        data: { inviteId: "22222222-2222-2222-2222-222222222222" }
      });
      assert.deepEqual(out, { skipped: "INVITE_NOT_FOUND" });
    } finally {
      restorePool();
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// index.js — bootstrap orchestration
// ════════════════════════════════════════════════════════════════════════════
describe("workers/index.js bootstrap", () => {
  it("exposes startWorkers and stopWorkers", () => {
    assert.equal(typeof indexMod.startWorkers, "function");
    assert.equal(typeof indexMod.stopWorkers, "function");
  });

  it("startWorkers is a no-op when Redis is unavailable", async () => {
    const prev = config.REDIS_URL;
    config.REDIS_URL = "";
    try {
      // Must not throw, must not start anything; stopWorkers stays clean.
      assert.equal(indexMod.startWorkers(), undefined,
        "disabled path returns undefined without constructing workers");
      await assert.doesNotReject(() => indexMod.stopWorkers(),
        "stopWorkers is safe to call with no workers");
    } finally {
      config.REDIS_URL = prev;
    }
  });

  it("stopWorkers is idempotent (safe to call repeatedly)", async () => {
    await assert.doesNotReject(() => indexMod.stopWorkers());
    await assert.doesNotReject(() => indexMod.stopWorkers());
  });
});
