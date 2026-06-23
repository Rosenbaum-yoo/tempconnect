/**
 * Router-handler coverage for routes/occ/automation.js (createOccAutomationRouter).
 *
 * Strategy: the route handlers all funnel through pool.query(sql, params) via the
 * _helpers.js safeQuery/safeScalar/tableExists wrappers and a direct insertAuditRow.
 * We drive the REAL handlers with a SQL-substring-dispatching tracking pool.
 * The mfaGuard middleware (requireMfa) is bypassed because getHandler extracts only
 * the LAST handle in the route stack — the actual handler — the same idiom the
 * repo's requests.route.coverage.test.js / reporting.route.test.js use.
 *
 * All handlers use INLINE res.status().json() (safeQuery swallows DB errors, so
 * there are no try/catch→next(err) paths). We therefore assert res._status/_json
 * directly throughout.
 *
 * Run (cwd api/): node --test --test-force-exit test/occ_automation.route.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createOccAutomationRouter } from "../routes/occ/automation.js";

/* ── Mocks ─────────────────────────────────────────────────────────────── */

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

/**
 * Tracking pool. `routes` is an ordered list of { match(sql)->bool, respond }.
 * First matching entry wins; unmatched queries return { rows: [] } so soft-fail
 * paths (audit writes, missing tables → handled by tableExists) degrade cleanly.
 * connect() included per the route-test contract (withTransaction safety).
 */
function trackingPool(routes = []) {
  const calls = [];
  const query = async (sql, params = []) => {
    const text = typeof sql === "string" ? sql : sql?.text ?? "";
    calls.push({ sql: text, params });
    for (const r of routes) {
      if (r.match(text)) {
        const out = typeof r.respond === "function" ? r.respond(text, params) : r.respond;
        return out ?? { rows: [], rowCount: 0 };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return {
    calls,
    query,
    connect: async () => ({ query, release() {} }),
    find(substr) {
      return calls.filter((c) => c.sql.includes(substr));
    }
  };
}

/** Both `automation_jobs` and `warp_executions` exist (tableExists → true). */
function tablesExistRoute() {
  return {
    match: (s) => s.includes("FROM information_schema.tables"),
    respond: { rows: [{ "?column?": 1 }] }
  };
}

function mockReq(overrides = {}) {
  return {
    session: { userId: "u1" },
    occAccess: { user_id: "owner-1" },
    params: {},
    query: {},
    body: {},
    headers: {},
    ip: "127.0.0.1",
    get: () => "",
    ...overrides
  };
}

function mockRes() {
  const headers = {};
  const res = {
    _status: 200,
    _json: null,
    _send: null,
    _headers: headers,
    status(code) { res._status = code; return res; },
    json(payload) { res._json = payload; return res; },
    set(name, value) { if (name) headers[String(name).toLowerCase()] = value; return res; },
    type() { return res; },
    send(payload) { res._send = payload; return res; },
    end() { return res; }
  };
  return res;
}

function makeDeps(pool) {
  return { pool, logger: mockLogger() };
}

function getHandler(router, method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    if (!layer.route.methods[method]) continue;
    const stack = layer.route.stack;
    return stack[stack.length - 1].handle;
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}

/* ── Router shape ──────────────────────────────────────────────────────── */

describe("occ automation router — registration", () => {
  it("registers all expected routes", () => {
    const router = createOccAutomationRouter(makeDeps(trackingPool()));
    const seen = new Set(
      router.stack
        .filter((l) => l.route)
        .map((l) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`)
    );
    for (const r of [
      "get /automation/jobs",
      "post /automation/trigger",
      "get /automation/history",
      "get /automation/schedules"
    ]) {
      assert.ok(seen.has(r), `missing route: ${r}`);
    }
  });

  it("mounts the mfaGuard middleware before the trigger handler", () => {
    const router = createOccAutomationRouter(makeDeps(trackingPool()));
    const layer = router.stack.find((l) => l.route && l.route.path === "/automation/trigger");
    // [mfaGuard, handler] → 2 handles in the stack
    assert.strictEqual(layer.route.stack.length, 2);
  });
});

/* ── GET /automation/jobs ──────────────────────────────────────────────── */

describe("GET /automation/jobs", () => {
  it("maps job rows with normalized defaults", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("FROM automation_jobs") && s.includes("ORDER BY name ASC"),
        respond: {
          rows: [
            {
              id: "job-1",
              name: "Nightly Sweep",
              description: null,
              category: null,
              trigger: null,
              schedule: null,
              status: null,
              risk_level: null,
              runbook_id: null,
              last_run_at: "2026-01-01T00:00:00Z",
              last_run_status: null,
              next_run_at: null,
              retry_on_failure: true,
              max_retries: null,
              requires_confirm: true
            }
          ]
        }
      }
    ]);
    const handler = getHandler(createOccAutomationRouter(makeDeps(pool)), "get", "/automation/jobs");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    const job = res._json.data.jobs[0];
    assert.strictEqual(job.id, "job-1");
    assert.strictEqual(job.description, null);
    assert.strictEqual(job.category, "maintenance"); // default
    assert.strictEqual(job.trigger, "manual"); // default
    assert.strictEqual(job.status, "disabled"); // default
    assert.strictEqual(job.risk_level, "low"); // default
    assert.strictEqual(job.last_run_at, "2026-01-01T00:00:00.000Z");
    assert.strictEqual(job.retry_on_failure, true);
    assert.strictEqual(job.max_retries, 0); // null → 0
    assert.strictEqual(job.requires_confirm, true);
  });

  it("returns empty jobs array (zero-state, no crash)", async () => {
    const pool = trackingPool(); // unmatched → { rows: [] }
    const handler = getHandler(createOccAutomationRouter(makeDeps(pool)), "get", "/automation/jobs");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.deepStrictEqual(res._json.data.jobs, []);
    assert.strictEqual(res._json.error, null);
  });
});

/* ── POST /automation/trigger ──────────────────────────────────────────── */

describe("POST /automation/trigger", () => {
  it("400 CONFIRM_REQUIRED when confirmed !== true", async () => {
    const pool = trackingPool();
    const handler = getHandler(createOccAutomationRouter(makeDeps(pool)), "post", "/automation/trigger");
    const res = mockRes();
    await handler(mockReq({ body: { reason: "valid reason here", job_id: "job-1" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "CONFIRM_REQUIRED");
  });

  it("400 REASON_TOO_SHORT when reason under 10 chars", async () => {
    const pool = trackingPool();
    const handler = getHandler(createOccAutomationRouter(makeDeps(pool)), "post", "/automation/trigger");
    const res = mockRes();
    await handler(mockReq({ body: { confirmed: true, reason: "short", job_id: "job-1" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "REASON_TOO_SHORT");
  });

  it("400 JOB_ID_REQUIRED when job_id missing after valid mutation body", async () => {
    const pool = trackingPool();
    const handler = getHandler(createOccAutomationRouter(makeDeps(pool)), "post", "/automation/trigger");
    const res = mockRes();
    await handler(mockReq({ body: { confirmed: true, reason: "a valid reason here" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "JOB_ID_REQUIRED");
  });

  it("500 AUTOMATION_NOT_AVAILABLE when required tables are missing", async () => {
    // tableExists → false (no information_schema rows matched)
    const pool = trackingPool();
    const handler = getHandler(createOccAutomationRouter(makeDeps(pool)), "post", "/automation/trigger");
    const res = mockRes();
    await handler(mockReq({ body: { confirmed: true, reason: "a valid reason here", job_id: "job-1" } }), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "AUTOMATION_NOT_AVAILABLE");
  });

  it("404 JOB_NOT_FOUND when job lookup is empty", async () => {
    const pool = trackingPool([
      tablesExistRoute(),
      {
        match: (s) => s.includes("FROM automation_jobs aj") && s.includes("LEFT JOIN warp_runbooks"),
        respond: { rows: [] }
      }
    ]);
    const handler = getHandler(createOccAutomationRouter(makeDeps(pool)), "post", "/automation/trigger");
    const res = mockRes();
    await handler(mockReq({ body: { confirmed: true, reason: "a valid reason here", job_id: "job-1" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "JOB_NOT_FOUND");
  });

  it("409 JOB_DISABLED when job status is disabled", async () => {
    const pool = trackingPool([
      tablesExistRoute(),
      {
        match: (s) => s.includes("FROM automation_jobs aj") && s.includes("LEFT JOIN warp_runbooks"),
        respond: { rows: [{ id: "job-1", name: "X", status: "disabled", risk_level: "low", runbook_id: null, runbook_name: null }] }
      }
    ]);
    const handler = getHandler(createOccAutomationRouter(makeDeps(pool)), "post", "/automation/trigger");
    const res = mockRes();
    await handler(mockReq({ body: { confirmed: true, reason: "a valid reason here", job_id: "job-1" } }), res);
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._json.error.code, "JOB_DISABLED");
  });

  it("500 TRIGGER_FAILED when execution insert returns no row", async () => {
    const pool = trackingPool([
      tablesExistRoute(),
      {
        match: (s) => s.includes("FROM automation_jobs aj") && s.includes("LEFT JOIN warp_runbooks"),
        respond: { rows: [{ id: "job-1", name: "X", status: "enabled", risk_level: "high", runbook_id: "rb-1", runbook_name: "RB" }] }
      },
      // users email lookup → fallback used; audit insert → unmatched (no-op)
      {
        match: (s) => s.includes("INSERT INTO warp_executions"),
        respond: { rows: [] } // no row → TRIGGER_FAILED
      }
    ]);
    const handler = getHandler(createOccAutomationRouter(makeDeps(pool)), "post", "/automation/trigger");
    const res = mockRes();
    await handler(mockReq({ body: { confirmed: true, reason: "a valid reason here", job_id: "job-1" } }), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "TRIGGER_FAILED");
  });

  it("200 success: inserts execution + audit, updates job, returns execution_id", async () => {
    const pool = trackingPool([
      tablesExistRoute(),
      {
        match: (s) => s.includes("FROM automation_jobs aj") && s.includes("LEFT JOIN warp_runbooks"),
        respond: { rows: [{ id: "job-1", name: "Nightly", status: "enabled", risk_level: "medium", runbook_id: "rb-1", runbook_name: "Runbook A" }] }
      },
      {
        match: (s) => s.includes("SELECT email FROM users WHERE id = $1"),
        respond: { rows: [{ email: "owner@tempconnect.local" }] }
      },
      {
        match: (s) => s.includes("INSERT INTO audit_log"),
        respond: { rows: [{ id: 4242 }] }
      },
      {
        match: (s) => s.includes("INSERT INTO warp_executions"),
        respond: { rows: [{ id: "exec-1", status: "started" }] }
      },
      {
        match: (s) => s.includes("UPDATE automation_jobs"),
        respond: { rows: [] }
      }
    ]);
    const handler = getHandler(createOccAutomationRouter(makeDeps(pool)), "post", "/automation/trigger");
    const res = mockRes();
    await handler(mockReq({ body: { confirmed: true, reason: "trigger this job now", job_id: "job-1" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.strictEqual(res._json.data.execution_id, "exec-1");
    assert.strictEqual(res._json.data.status, "started");
    assert.strictEqual(res._json.data.audit_id, "4242"); // stringified

    // audit insert carried the actor + reason + risk_level
    const audit = pool.find("INSERT INTO audit_log")[0];
    assert.ok(audit, "audit insert issued");
    assert.strictEqual(audit.params[0], "owner-1"); // actorId from occAccess.user_id
    assert.strictEqual(audit.params[3], "job-1"); // entity_id stringified
    const details = JSON.parse(audit.params[4]);
    assert.strictEqual(details.reason, "trigger this job now");
    assert.strictEqual(details.confirmed, true);
    assert.strictEqual(details.risk_level, "medium");

    // execution insert carried reason + risk_level + linked audit id
    const exec = pool.find("INSERT INTO warp_executions")[0];
    assert.ok(exec);
    assert.strictEqual(exec.params[8], "trigger this job now"); // reason ($9)
    assert.strictEqual(exec.params[9], "medium"); // risk_level ($10)
    assert.strictEqual(exec.params[11], 4242); // audit_id ($12)

    // job marked as last-run
    assert.strictEqual(pool.find("UPDATE automation_jobs").length, 1);
  });

  it("200 success with null audit id rendered as null", async () => {
    const pool = trackingPool([
      tablesExistRoute(),
      {
        match: (s) => s.includes("FROM automation_jobs aj") && s.includes("LEFT JOIN warp_runbooks"),
        respond: { rows: [{ id: "job-9", name: "J", status: "enabled", risk_level: null, runbook_id: null, runbook_name: null }] }
      },
      // audit insert throws → insertAuditRow swallows → auditId null
      {
        match: (s) => s.includes("INSERT INTO audit_log"),
        respond: () => { throw new Error("audit write failed"); }
      },
      {
        match: (s) => s.includes("INSERT INTO warp_executions"),
        respond: { rows: [{ id: "exec-9", status: "started" }] }
      }
    ]);
    const handler = getHandler(createOccAutomationRouter(makeDeps(pool)), "post", "/automation/trigger");
    const res = mockRes();
    await handler(mockReq({ body: { confirmed: true, reason: "another valid reason", job_id: "job-9" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.execution_id, "exec-9");
    assert.strictEqual(res._json.data.audit_id, null);
  });
});

/* ── GET /automation/history ───────────────────────────────────────────── */

describe("GET /automation/history", () => {
  it("paginates: has_more=true when extra row fetched, slices to per_page", async () => {
    // per_page=2 → query fetches LIMIT 3; respond with 3 rows → has_more true, sliced to 2
    const rows = [
      { id: "e1", runbook_id: "rb1", runbook_name: "A", status: "ok", dry_run: false, step_results: '[{"step":0}]', audit_id: 7, started_at: "2026-01-03T00:00:00Z" },
      { id: "e2", runbook_id: null, runbook_name: null, status: null, dry_run: true, step_results: null, audit_id: null, started_at: "2026-01-02T00:00:00Z" },
      { id: "e3", runbook_id: null, runbook_name: null, status: "x", dry_run: false, step_results: "not-json", audit_id: null, started_at: "2026-01-01T00:00:00Z" }
    ];
    const pool = trackingPool([
      {
        match: (s) => s.includes("FROM warp_executions") && s.includes("trigger_source = 'automation'") && s.includes("LIMIT $1 OFFSET $2"),
        respond: { rows }
      },
      {
        match: (s) => s.includes("SELECT COUNT(*)::int AS n FROM warp_executions"),
        respond: { rows: [{ n: 42 }] }
      }
    ]);
    const handler = getHandler(createOccAutomationRouter(makeDeps(pool)), "get", "/automation/history");
    const res = mockRes();
    await handler(mockReq({ query: { page: "1", per_page: "2" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.has_more, true);
    assert.strictEqual(res._json.data.items.length, 2); // sliced
    assert.strictEqual(res._json.data.total, 42);

    // first item: parsed step_results + stringified audit_id + iso dates + defaults
    const it0 = res._json.data.items[0];
    assert.strictEqual(it0.id, "e1");
    assert.strictEqual(it0.audit_id, "7");
    assert.deepStrictEqual(it0.step_results, [{ step: 0 }]);
    assert.strictEqual(it0.started_at, "2026-01-03T00:00:00.000Z");

    // second item: nulls/defaults applied
    const it1 = res._json.data.items[1];
    assert.strictEqual(it1.status, "unknown"); // default
    assert.strictEqual(it1.risk_level, "low"); // default
    assert.strictEqual(it1.dry_run, true);
    assert.deepStrictEqual(it1.step_results, []); // null → []

    // pagination params: LIMIT per_page+1, OFFSET (page-1)*per_page
    const q = pool.find("LIMIT $1 OFFSET $2")[0];
    assert.strictEqual(q.params[0], 3); // 2 + 1
    assert.strictEqual(q.params[1], 0);
  });

  it("has_more=false and correct offset for page 2", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("FROM warp_executions") && s.includes("LIMIT $1 OFFSET $2"),
        respond: { rows: [{ id: "e1", started_at: "2026-01-01T00:00:00Z", step_results: [] }] }
      },
      {
        match: (s) => s.includes("SELECT COUNT(*)::int AS n FROM warp_executions"),
        respond: { rows: [{ n: 1 }] }
      }
    ]);
    const handler = getHandler(createOccAutomationRouter(makeDeps(pool)), "get", "/automation/history");
    const res = mockRes();
    await handler(mockReq({ query: { page: "2", per_page: "30" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.has_more, false);
    assert.strictEqual(res._json.data.items.length, 1);
    const q = pool.find("LIMIT $1 OFFSET $2")[0];
    assert.strictEqual(q.params[0], 31); // 30 + 1
    assert.strictEqual(q.params[1], 30); // (2-1)*30
  });

  it("zero-state: empty history, total 0", async () => {
    const pool = trackingPool(); // all unmatched → []
    const handler = getHandler(createOccAutomationRouter(makeDeps(pool)), "get", "/automation/history");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.deepStrictEqual(res._json.data.items, []);
    assert.strictEqual(res._json.data.total, 0);
    assert.strictEqual(res._json.data.has_more, false);
  });
});

/* ── GET /automation/schedules ─────────────────────────────────────────── */

describe("GET /automation/schedules", () => {
  it("maps schedules with enabled flag derived from status", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("FROM automation_jobs") && s.includes("WHERE schedule IS NOT NULL"),
        respond: {
          rows: [
            { id: "s1", name: "Daily", schedule: "0 0 * * *", next_run_at: "2026-02-01T00:00:00Z", status: "enabled", risk_level: "low" },
            { id: "s2", name: "Hourly", schedule: "0 * * * *", next_run_at: null, status: "running", risk_level: null },
            { id: "s3", name: "Off", schedule: "0 6 * * *", next_run_at: null, status: "disabled", risk_level: "high" }
          ]
        }
      }
    ]);
    const handler = getHandler(createOccAutomationRouter(makeDeps(pool)), "get", "/automation/schedules");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    const sch = res._json.data.schedules;
    assert.strictEqual(sch.length, 3);
    assert.strictEqual(sch[0].cron, "0 0 * * *");
    assert.strictEqual(sch[0].next_run, "2026-02-01T00:00:00.000Z");
    assert.strictEqual(sch[0].enabled, true); // enabled
    assert.strictEqual(sch[0].job_id, "s1");
    assert.strictEqual(sch[1].enabled, true); // running
    assert.strictEqual(sch[1].risk_level, "low"); // null → default
    assert.strictEqual(sch[2].enabled, false); // disabled
  });

  it("zero-state: empty schedules array", async () => {
    const pool = trackingPool();
    const handler = getHandler(createOccAutomationRouter(makeDeps(pool)), "get", "/automation/schedules");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.deepStrictEqual(res._json.data.schedules, []);
    assert.strictEqual(res._json.error, null);
  });
});
