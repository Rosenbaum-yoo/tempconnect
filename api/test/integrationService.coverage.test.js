/**
 * integrationService.coverage.test.js
 *
 * Comprehensive BEHAVIOR coverage for services/integrationService.js.
 *
 * Strategy:
 *  - A local `trackingPool` records every { sql, params } and dispatches based on
 *    SQL substrings, so multi-helper functions (which fire several queries) are
 *    driven by ONE pattern-routing pool. This lets us assert SQL shape + params
 *    + query counts robustly (more reliable than an ordered sequencePool).
 *  - integrationService calls the REAL integrationAdapters.sendIntegrationEvent,
 *    which ends in `fetch`. We replace globalThis.fetch per-test to deterministically
 *    drive the ok/failed branches without touching the network.
 *
 * No source file is modified.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import * as svc from "../services/integrationService.js";

/* ── fetch control ────────────────────────────────────────── */

const realFetch = globalThis.fetch;

/** Make fetch resolve to a Response-like object with the given status. */
function fetchOk(status = 200) {
  globalThis.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => ""
  });
}

/** Make fetch resolve to a non-ok HTTP response (drives result.ok === false). */
function fetchHttpError(status = 500, body = "boom") {
  globalThis.fetch = async () => ({
    ok: false,
    status,
    text: async () => body
  });
}

/** Make fetch reject (network-level error → result.ok === false, no status). */
function fetchThrow(message = "ECONNREFUSED") {
  globalThis.fetch = async () => {
    throw new Error(message);
  };
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

/* ── tracking pool ────────────────────────────────────────── */

/**
 * Build a pool that records all queries and dispatches via a matcher list.
 * @param {Array<{ match: (sql:string)=>boolean, result: object | ((sql,params)=>object) }>} routes
 * @returns {{ pool, calls }} pool + recorded calls array
 */
function trackingPool(routes = []) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    for (const r of routes) {
      if (r.match(sql)) {
        return typeof r.result === "function" ? r.result(sql, params) : r.result;
      }
    }
    return { rows: [], rowCount: 0 };
  };
  const pool = {
    query,
    connect: async () => ({ query, release: () => {} })
  };
  return { pool, calls };
}

const has = (needle) => (sql) => typeof sql === "string" && sql.includes(needle);

/* ─────────────────────────────────────────────────────────── */
/* generateSigningSecret / computeSignature                     */
/* ─────────────────────────────────────────────────────────── */

describe("integrationService — signing primitives", () => {
  it("generateSigningSecret returns 64 lowercase hex chars (32 bytes)", () => {
    const s = svc.generateSigningSecret();
    assert.equal(typeof s, "string");
    assert.equal(s.length, 64);
    assert.match(s, /^[0-9a-f]{64}$/);
  });

  it("generateSigningSecret is non-deterministic", () => {
    assert.notEqual(svc.generateSigningSecret(), svc.generateSigningSecret());
  });

  it("computeSignature is deterministic for same payload+secret", () => {
    const a = svc.computeSignature('{"x":1}', "secret");
    const b = svc.computeSignature('{"x":1}', "secret");
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{64}$/); // sha256 hex digest
  });

  it("computeSignature differs when payload or secret differs", () => {
    assert.notEqual(svc.computeSignature('{"x":1}', "s"), svc.computeSignature('{"x":2}', "s"));
    assert.notEqual(svc.computeSignature('{"x":1}', "s1"), svc.computeSignature('{"x":1}', "s2"));
  });
});

/* ─────────────────────────────────────────────────────────── */
/* getSupportedEvents / SUPPORTED_EVENTS                        */
/* ─────────────────────────────────────────────────────────── */

describe("integrationService — supported events", () => {
  it("getSupportedEvents maps every SUPPORTED_EVENTS entry to {key,label}", () => {
    const list = svc.getSupportedEvents();
    assert.equal(list.length, svc.SUPPORTED_EVENTS.length);
    for (const item of list) {
      assert.ok(svc.SUPPORTED_EVENTS.includes(item.key));
      assert.equal(item.label, item.key);
    }
  });

  it("SUPPORTED_EVENTS has no duplicates", () => {
    assert.equal(new Set(svc.SUPPORTED_EVENTS).size, svc.SUPPORTED_EVENTS.length);
  });
});

/* ─────────────────────────────────────────────────────────── */
/* listIntegrations                                             */
/* ─────────────────────────────────────────────────────────── */

describe("integrationService — listIntegrations", () => {
  it("queries org-scoped, masks webhook_url, returns rows", async () => {
    const expected = [{ id: "i1", webhook_url_masked: "https://hooks.slack.c••••••" }];
    const { pool, calls } = trackingPool([
      { match: has("FROM org_integrations"), result: { rows: expected, rowCount: 1 } }
    ]);
    const rows = await svc.listIntegrations(pool, "org-1");
    assert.deepEqual(rows, expected);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].params, ["org-1"]);
    assert.ok(calls[0].sql.includes("webhook_url_masked"), "must select masked url");
    assert.ok(calls[0].sql.includes("WHERE org_id = $1"), "must be org-scoped");
    assert.ok(!/SELECT \*/.test(calls[0].sql), "must NOT select * (no raw webhook_url)");
  });

  it("returns empty array when no integrations", async () => {
    const { pool } = trackingPool();
    assert.deepEqual(await svc.listIntegrations(pool, "org-empty"), []);
  });
});

/* ─────────────────────────────────────────────────────────── */
/* getIntegration                                               */
/* ─────────────────────────────────────────────────────────── */

describe("integrationService — getIntegration", () => {
  it("returns the row scoped by id + org", async () => {
    const row = { id: "i1", org_id: "org-1", webhook_url: "https://x" };
    const { pool, calls } = trackingPool([
      { match: has("FROM org_integrations WHERE id = $1 AND org_id = $2"), result: { rows: [row] } }
    ]);
    const res = await svc.getIntegration(pool, "i1", "org-1");
    assert.deepEqual(res, row);
    assert.deepEqual(calls[0].params, ["i1", "org-1"]);
  });

  it("returns null when not found", async () => {
    const { pool } = trackingPool();
    assert.equal(await svc.getIntegration(pool, "missing", "org-1"), null);
  });
});

/* ─────────────────────────────────────────────────────────── */
/* createIntegration                                            */
/* ─────────────────────────────────────────────────────────── */

describe("integrationService — createIntegration", () => {
  it("filters unsupported events, generates secret, passes correct params", async () => {
    const created = { id: "new", org_id: "org-1", signing_secret: "captured-by-row" };
    const { pool, calls } = trackingPool([
      { match: has("INSERT INTO org_integrations"), result: { rows: [created] } }
    ]);
    const res = await svc.createIntegration(pool, "org-1", {
      provider: "slack",
      label: "My Slack",
      webhook_url: "https://hooks.slack.com/abc",
      enabled_events: ["offer.received", "not.a.real.event", "invoice.paid"],
      created_by: "user-9"
    });
    assert.deepEqual(res, created);
    const p = calls[0].params;
    // [orgId, provider, label, webhook_url, filteredEvents, created_by, signingSecret]
    assert.equal(p[0], "org-1");
    assert.equal(p[1], "slack");
    assert.equal(p[2], "My Slack");
    assert.equal(p[3], "https://hooks.slack.com/abc");
    assert.deepEqual(p[4], ["offer.received", "invoice.paid"], "unsupported event filtered out");
    assert.equal(p[5], "user-9");
    assert.match(p[6], /^[0-9a-f]{64}$/, "auto-generated signing secret");
  });

  it("defaults label to '' and created_by to null; empty events → []", async () => {
    const { pool, calls } = trackingPool([
      { match: has("INSERT INTO org_integrations"), result: { rows: [{ id: "x" }] } }
    ]);
    await svc.createIntegration(pool, "org-2", {
      provider: "teams",
      webhook_url: "https://teams"
    });
    const p = calls[0].params;
    assert.equal(p[2], "", "label defaults to empty string");
    assert.deepEqual(p[4], [], "missing enabled_events → empty array");
    assert.equal(p[5], null, "created_by defaults to null");
  });
});

/* ─────────────────────────────────────────────────────────── */
/* updateIntegration                                            */
/* ─────────────────────────────────────────────────────────── */

describe("integrationService — updateIntegration", () => {
  const existing = {
    id: "i1",
    org_id: "org-1",
    label: "Old",
    webhook_url: "https://old",
    enabled_events: ["offer.received"],
    is_active: true
  };

  it("returns null when integration does not exist (no UPDATE issued)", async () => {
    const { pool, calls } = trackingPool([
      { match: has("FROM org_integrations WHERE id = $1 AND org_id = $2"), result: { rows: [] } }
    ]);
    const res = await svc.updateIntegration(pool, "i1", "org-1", { label: "New" });
    assert.equal(res, null);
    assert.equal(calls.length, 1, "only the existence SELECT runs");
    assert.ok(!calls.some((c) => c.sql.includes("UPDATE org_integrations")), "no UPDATE on missing row");
  });

  it("merges provided fields and keeps existing for undefined ones", async () => {
    const updatedRow = { ...existing, label: "New" };
    const { pool, calls } = trackingPool([
      { match: has("FROM org_integrations WHERE id = $1 AND org_id = $2"), result: { rows: [existing] } },
      { match: has("UPDATE org_integrations"), result: { rows: [updatedRow] } }
    ]);
    const res = await svc.updateIntegration(pool, "i1", "org-1", { label: "New" });
    assert.deepEqual(res, updatedRow);
    const upd = calls.find((c) => c.sql.includes("UPDATE org_integrations"));
    // params: [id, org, label, webhook_url, enabled_events, is_active]
    assert.deepEqual(upd.params, ["i1", "org-1", "New", "https://old", ["offer.received"], true]);
  });

  it("filters enabled_events when provided", async () => {
    const { pool, calls } = trackingPool([
      { match: has("FROM org_integrations WHERE id = $1 AND org_id = $2"), result: { rows: [existing] } },
      { match: has("UPDATE org_integrations"), result: { rows: [{ id: "i1" }] } }
    ]);
    await svc.updateIntegration(pool, "i1", "org-1", {
      enabled_events: ["invoice.paid", "garbage.event"]
    });
    const upd = calls.find((c) => c.sql.includes("UPDATE org_integrations"));
    assert.deepEqual(upd.params[4], ["invoice.paid"], "garbage event removed");
  });

  it("handles is_active=false (falsy but defined) without reverting", async () => {
    const { pool, calls } = trackingPool([
      { match: has("FROM org_integrations WHERE id = $1 AND org_id = $2"), result: { rows: [existing] } },
      { match: has("UPDATE org_integrations"), result: { rows: [{ id: "i1" }] } }
    ]);
    await svc.updateIntegration(pool, "i1", "org-1", { is_active: false });
    const upd = calls.find((c) => c.sql.includes("UPDATE org_integrations"));
    assert.equal(upd.params[5], false, "explicit false is honored, not reverted to existing true");
  });

  it("returns null if UPDATE affects no row (rows[0] undefined)", async () => {
    const { pool } = trackingPool([
      { match: has("FROM org_integrations WHERE id = $1 AND org_id = $2"), result: { rows: [existing] } },
      { match: has("UPDATE org_integrations"), result: { rows: [] } }
    ]);
    const res = await svc.updateIntegration(pool, "i1", "org-1", { label: "X" });
    assert.equal(res, null);
  });
});

/* ─────────────────────────────────────────────────────────── */
/* deleteIntegration                                            */
/* ─────────────────────────────────────────────────────────── */

describe("integrationService — deleteIntegration", () => {
  it("returns true when a row was deleted", async () => {
    const { pool, calls } = trackingPool([
      { match: has("DELETE FROM org_integrations"), result: { rowCount: 1 } }
    ]);
    assert.equal(await svc.deleteIntegration(pool, "i1", "org-1"), true);
    assert.deepEqual(calls[0].params, ["i1", "org-1"]);
    assert.ok(calls[0].sql.includes("org_id = $2"), "org-scoped delete");
  });

  it("returns false when nothing was deleted", async () => {
    const { pool } = trackingPool([
      { match: has("DELETE FROM org_integrations"), result: { rowCount: 0 } }
    ]);
    assert.equal(await svc.deleteIntegration(pool, "i1", "wrong-org"), false);
  });
});

/* ─────────────────────────────────────────────────────────── */
/* testIntegration                                              */
/* ─────────────────────────────────────────────────────────── */

describe("integrationService — testIntegration", () => {
  it("returns NOT_FOUND when integration missing", async () => {
    const { pool } = trackingPool();
    const res = await svc.testIntegration(pool, "i1", "org-1");
    assert.deepEqual(res, { ok: false, error: "NOT_FOUND" });
  });

  it("returns NO_WEBHOOK_URL when webhook_url is empty", async () => {
    const { pool } = trackingPool([
      {
        match: has("FROM org_integrations WHERE id = $1 AND org_id = $2"),
        result: { rows: [{ id: "i1", provider: "slack", webhook_url: null }] }
      }
    ]);
    const res = await svc.testIntegration(pool, "i1", "org-1");
    assert.deepEqual(res, { ok: false, error: "NO_WEBHOOK_URL" });
  });

  it("on success: returns ok and writes last_success_at / clears last_error", async () => {
    fetchOk(200);
    const { pool, calls } = trackingPool([
      {
        match: has("FROM org_integrations WHERE id = $1 AND org_id = $2"),
        result: { rows: [{ id: "i1", provider: "slack", webhook_url: "https://hooks" }] }
      }
    ]);
    const res = await svc.testIntegration(pool, "i1", "org-1");
    assert.equal(res.ok, true);
    const upd = calls.find((c) => c.sql.includes("last_success_at = NOW()"));
    assert.ok(upd, "success-path UPDATE issued");
    assert.ok(upd.sql.includes("last_error = NULL"), "clears last_error on success");
    assert.deepEqual(upd.params, ["i1"]);
  });

  it("on failure: returns not-ok and records last_error", async () => {
    fetchHttpError(500, "server down");
    const { pool, calls } = trackingPool([
      {
        match: has("FROM org_integrations WHERE id = $1 AND org_id = $2"),
        result: { rows: [{ id: "i1", provider: "slack", webhook_url: "https://hooks" }] }
      }
    ]);
    const res = await svc.testIntegration(pool, "i1", "org-1");
    assert.equal(res.ok, false);
    const upd = calls.find((c) => c.sql.includes("SET last_error = $2"));
    assert.ok(upd, "failure-path UPDATE issued");
    assert.equal(upd.params[0], "i1");
    assert.ok(typeof upd.params[1] === "string" && upd.params[1].length > 0, "error message stored");
  });
});

/* ─────────────────────────────────────────────────────────── */
/* dispatchToIntegrations                                       */
/* ─────────────────────────────────────────────────────────── */

describe("integrationService — dispatchToIntegrations", () => {
  it("no-op (no queries) when orgId is missing", async () => {
    const { pool, calls } = trackingPool();
    const res = await svc.dispatchToIntegrations(pool, "offer.received", {});
    assert.equal(res, undefined);
    assert.equal(calls.length, 0, "must not query without orgId");
  });

  it("returns early when no matching active integrations", async () => {
    const { pool, calls } = trackingPool([
      { match: has("WHERE org_id = $1 AND is_active = TRUE"), result: { rows: [] } }
    ]);
    await svc.dispatchToIntegrations(pool, "offer.received", { orgId: "org-1" });
    assert.equal(calls.length, 1, "only the lookup query runs, then early return");
  });

  it("resolves org name when not supplied, then dispatches + logs delivery (success)", async () => {
    fetchOk(204);
    const { pool, calls } = trackingPool([
      {
        match: has("WHERE org_id = $1 AND is_active = TRUE"),
        result: { rows: [{ id: "intg-1", provider: "slack", webhook_url: "https://h", signing_secret: "sec" }] }
      },
      { match: has("FROM organizations WHERE id = $1"), result: { rows: [{ name: "ACME" }] } }
    ]);
    await svc.dispatchToIntegrations(pool, "offer.received", {
      orgId: "org-1",
      message: "hi",
      entityType: "offer",
      entityId: "o-9"
    });
    const orgLookup = calls.find((c) => c.sql.includes("FROM organizations WHERE id = $1"));
    assert.ok(orgLookup, "org name resolved when not provided");

    const insert = calls.find((c) => c.sql.includes("INSERT INTO webhook_deliveries"));
    assert.ok(insert, "delivery logged");
    // params: [intg.id, eventKey, payload, status, http_status, error, completed_at, next_retry_at]
    assert.equal(insert.params[0], "intg-1");
    assert.equal(insert.params[1], "offer.received");
    assert.equal(insert.params[3], "success");
    assert.equal(insert.params[7], null, "no next_retry_at on success");
    const payload = JSON.parse(insert.params[2]);
    assert.equal(payload.event, "offer.received");
    assert.equal(payload.entityId, "o-9");

    const statusUpd = calls.find((c) => c.sql.includes("last_success_at = NOW()"));
    assert.ok(statusUpd, "integration success status updated");
  });

  it("skips org-name lookup when orgName is supplied in context", async () => {
    fetchOk(200);
    const { pool, calls } = trackingPool([
      {
        match: has("WHERE org_id = $1 AND is_active = TRUE"),
        result: { rows: [{ id: "intg-1", provider: "slack", webhook_url: "https://h", signing_secret: null }] }
      }
    ]);
    await svc.dispatchToIntegrations(pool, "offer.received", { orgId: "org-1", orgName: "Provided" });
    assert.ok(
      !calls.some((c) => c.sql.includes("FROM organizations WHERE id = $1")),
      "no org lookup when orgName provided"
    );
  });

  it("on delivery failure: logs failed status with next_retry_at and records integration error", async () => {
    fetchHttpError(502, "bad gateway");
    const { pool, calls } = trackingPool([
      {
        match: has("WHERE org_id = $1 AND is_active = TRUE"),
        result: { rows: [{ id: "intg-1", provider: "teams", webhook_url: "https://h", signing_secret: "s" }] }
      },
      { match: has("FROM organizations WHERE id = $1"), result: { rows: [{ name: "ACME" }] } }
    ]);
    await svc.dispatchToIntegrations(pool, "invoice.issued", { orgId: "org-1", message: "m" });
    const insert = calls.find((c) => c.sql.includes("INSERT INTO webhook_deliveries"));
    assert.equal(insert.params[3], "failed");
    assert.ok(insert.params[7] instanceof Date, "next_retry_at is a Date on failure");
    assert.equal(insert.params[6], null, "completed_at null on failure");
    const errUpd = calls.find((c) => c.sql.includes("SET last_error = $2"));
    assert.ok(errUpd, "integration last_error updated on failure");
  });

  it("never throws even when the lookup query rejects (suppressed)", async () => {
    const pool = {
      query: async () => {
        throw new Error("db exploded");
      },
      connect: async () => ({ query: async () => { throw new Error("db exploded"); }, release() {} })
    };
    await assert.doesNotReject(
      svc.dispatchToIntegrations(pool, "offer.received", { orgId: "org-1" })
    );
  });

  it("continues (logs warning, no throw) when delivery-log INSERT fails", async () => {
    fetchOk(200);
    const { pool } = trackingPool([
      {
        match: has("WHERE org_id = $1 AND is_active = TRUE"),
        result: { rows: [{ id: "intg-1", provider: "slack", webhook_url: "https://h", signing_secret: null }] }
      },
      { match: has("FROM organizations WHERE id = $1"), result: { rows: [{ name: "ACME" }] } },
      {
        match: has("INSERT INTO webhook_deliveries"),
        result: () => {
          throw new Error("log insert failed");
        }
      }
    ]);
    await assert.doesNotReject(
      svc.dispatchToIntegrations(pool, "offer.received", { orgId: "org-1", message: "m" })
    );
  });
});

/* ─────────────────────────────────────────────────────────── */
/* getDeliveryLog                                               */
/* ─────────────────────────────────────────────────────────── */

describe("integrationService — getDeliveryLog", () => {
  it("returns null when integration not owned by org", async () => {
    const { pool, calls } = trackingPool([
      { match: has("FROM org_integrations WHERE id = $1 AND org_id = $2"), result: { rows: [] } }
    ]);
    const res = await svc.getDeliveryLog(pool, "i1", "org-1");
    assert.equal(res, null);
    assert.ok(!calls.some((c) => c.sql.includes("FROM webhook_deliveries")), "no log query when not owned");
  });

  it("returns deliveries and clamps the limit upper bound to 200", async () => {
    const logs = [{ id: "d1", event_key: "offer.received", status: "success" }];
    const { pool, calls } = trackingPool([
      { match: has("FROM org_integrations WHERE id = $1 AND org_id = $2"), result: { rows: [{ id: "i1" }] } },
      { match: has("FROM webhook_deliveries"), result: { rows: logs } }
    ]);
    const res = await svc.getDeliveryLog(pool, "i1", "org-1", 9999);
    assert.deepEqual(res, logs);
    const logQ = calls.find((c) => c.sql.includes("FROM webhook_deliveries"));
    assert.deepEqual(logQ.params, ["i1", 200], "limit clamped to 200");
  });

  it("clamps the limit lower bound to 1", async () => {
    const { pool, calls } = trackingPool([
      { match: has("FROM org_integrations WHERE id = $1 AND org_id = $2"), result: { rows: [{ id: "i1" }] } },
      { match: has("FROM webhook_deliveries"), result: { rows: [] } }
    ]);
    await svc.getDeliveryLog(pool, "i1", "org-1", 0);
    const logQ = calls.find((c) => c.sql.includes("FROM webhook_deliveries"));
    assert.equal(logQ.params[1], 1, "limit clamped to min 1");
  });

  it("uses default limit of 50 when not provided", async () => {
    const { pool, calls } = trackingPool([
      { match: has("FROM org_integrations WHERE id = $1 AND org_id = $2"), result: { rows: [{ id: "i1" }] } },
      { match: has("FROM webhook_deliveries"), result: { rows: [] } }
    ]);
    await svc.getDeliveryLog(pool, "i1", "org-1");
    const logQ = calls.find((c) => c.sql.includes("FROM webhook_deliveries"));
    assert.equal(logQ.params[1], 50);
  });
});

/* ─────────────────────────────────────────────────────────── */
/* retryFailedDeliveries                                        */
/* ─────────────────────────────────────────────────────────── */

describe("integrationService — retryFailedDeliveries", () => {
  it("returns zeros when nothing is due", async () => {
    const { pool, calls } = trackingPool([
      { match: has("FROM webhook_deliveries wd"), result: { rows: [] } }
    ]);
    const res = await svc.retryFailedDeliveries(pool);
    assert.deepEqual(res, { retried: 0, succeeded: 0, failed: 0 });
    assert.equal(calls.length, 1, "only the selection query runs");
  });

  it("retries a due delivery, marks retrying, then success on ok response", async () => {
    fetchOk(200);
    const due = {
      id: "d1",
      integration_id: "intg-1",
      event_key: "offer.received",
      payload: JSON.stringify({ event: "offer.received", message: "m" }),
      attempt: 0,
      max_attempts: 3,
      provider: "slack",
      webhook_url: "https://h",
      signing_secret: "sec"
    };
    const { pool, calls } = trackingPool([
      { match: has("FROM webhook_deliveries wd"), result: { rows: [due] } }
    ]);
    const res = await svc.retryFailedDeliveries(pool);
    assert.deepEqual(res, { retried: 1, succeeded: 1, failed: 0 });

    const retrying = calls.find((c) => c.sql.includes("SET status = 'retrying'"));
    assert.ok(retrying, "marked as retrying");
    assert.deepEqual(retrying.params, ["d1", 1], "attempt incremented to 1");

    const success = calls.find((c) => c.sql.includes("SET status = 'success'"));
    assert.ok(success, "marked success");
    assert.ok(calls.some((c) => c.sql.includes("last_success_at = NOW()")), "integration status bumped");
  });

  it("parses an object payload directly (no JSON.parse) and still dispatches", async () => {
    fetchOk(201);
    const due = {
      id: "d2",
      integration_id: "intg-1",
      event_key: "invoice.paid",
      payload: { event: "invoice.paid", message: "already-object" },
      attempt: 1,
      max_attempts: 3,
      provider: "teams",
      webhook_url: "https://h",
      signing_secret: null
    };
    const { pool } = trackingPool([
      { match: has("FROM webhook_deliveries wd"), result: { rows: [due] } }
    ]);
    const res = await svc.retryFailedDeliveries(pool);
    assert.equal(res.succeeded, 1);
  });

  it("on failure below max: schedules next_retry_at (exponential)", async () => {
    fetchHttpError(500, "err");
    const due = {
      id: "d3",
      integration_id: "intg-1",
      event_key: "offer.received",
      payload: JSON.stringify({ event: "offer.received" }),
      attempt: 1,
      max_attempts: 5,
      provider: "slack",
      webhook_url: "https://h",
      signing_secret: null
    };
    const { pool, calls } = trackingPool([
      { match: has("FROM webhook_deliveries wd"), result: { rows: [due] } }
    ]);
    const res = await svc.retryFailedDeliveries(pool);
    assert.deepEqual(res, { retried: 1, succeeded: 0, failed: 1 });
    const failUpd = calls.find((c) => c.sql.includes("SET status = $2"));
    assert.ok(failUpd, "failure UPDATE issued");
    // params: [id, status, http_status, error, next_retry_at]
    assert.equal(failUpd.params[1], "failed");
    assert.ok(failUpd.params[4] instanceof Date, "next_retry_at scheduled when below max");
  });

  it("on failure reaching max attempts: next_retry_at is null (gives up)", async () => {
    fetchThrow("network down");
    const due = {
      id: "d4",
      integration_id: "intg-1",
      event_key: "offer.received",
      payload: JSON.stringify({ event: "offer.received" }),
      attempt: 2,
      max_attempts: 3, // newAttempt=3 >= 3 → reachedMax
      provider: "slack",
      webhook_url: "https://h",
      signing_secret: null
    };
    const { pool, calls } = trackingPool([
      { match: has("FROM webhook_deliveries wd"), result: { rows: [due] } }
    ]);
    const res = await svc.retryFailedDeliveries(pool);
    assert.equal(res.failed, 1);
    const failUpd = calls.find((c) => c.sql.includes("SET status = $2"));
    assert.equal(failUpd.params[4], null, "next_retry_at null when max attempts reached");
  });
});

/* ─────────────────────────────────────────────────────────── */
/* cleanupOldDeliveries                                         */
/* ─────────────────────────────────────────────────────────── */

describe("integrationService — cleanupOldDeliveries", () => {
  it("deletes with default 30 days and returns rowCount", async () => {
    const { pool, calls } = trackingPool([
      { match: has("DELETE FROM webhook_deliveries"), result: { rowCount: 7 } }
    ]);
    const res = await svc.cleanupOldDeliveries(pool);
    assert.equal(res, 7);
    assert.deepEqual(calls[0].params, ["30"], "days passed as string");
    assert.ok(calls[0].sql.includes("INTERVAL"), "uses interval arithmetic");
  });

  it("passes a custom daysOld value", async () => {
    const { pool, calls } = trackingPool([
      { match: has("DELETE FROM webhook_deliveries"), result: { rowCount: 0 } }
    ]);
    const res = await svc.cleanupOldDeliveries(pool, 90);
    assert.equal(res, 0);
    assert.deepEqual(calls[0].params, ["90"]);
  });
});
