/**
 * Router-handler coverage for routes/occ/warp.js (createOccWarpRouter).
 *
 * Strategy: every handler funnels through pool.query(sql, params) via the safe*
 * helpers (safeQuery/safeScalar/tableExists swallow errors internally) plus a
 * couple of raw inserts (insertAuditRow swallows, startExecution can throw).
 * We drive the REAL handlers with a SQL-substring-dispatching tracking pool and
 * assert response shape / status. Guards (warpExecutionRateLimit, mfaGuard) are
 * bypassed by invoking only the LAST handler in each route's stack — the same
 * idiom the repo's reporting.route.test.js / requests.route.coverage.test.js use.
 *
 * Every handler in this file responds INLINE via res.status().json() — there is
 * no try/catch→next(err) path, so we assert res._status / res._json directly.
 *
 * Run: node --test --test-force-exit test/occ_warp.route.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createOccWarpRouter } from "../routes/occ/warp.js";

/* ── Mocks ─────────────────────────────────────────────────────────────── */

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

/**
 * Tracking pool. `routes` is an ordered list of { match(sql)->bool, respond }.
 * respond may be a value ({rows}) or a fn(sql, params)->{rows}. First match wins;
 * unmatched queries return { rows: [] } so non-critical paths degrade to no-ops.
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
    // withTransaction(pool, fn) needs connect() → client with query + release.
    connect: async () => ({ query, release() {} }),
    find(substr) {
      return calls.filter((c) => c.sql.includes(substr));
    }
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
  const res = {
    _status: 200,
    _json: null,
    _body: null,
    status(code) { res._status = code; return res; },
    json(payload) { res._json = payload; return res; },
    send(payload) { res._body = payload; return res; },
    set() { return res; },
    type() { return res; },
    end() { return res; }
  };
  return res;
}

function makeRouter(pool) {
  return createOccWarpRouter({ pool, logger: mockLogger(), config: {} });
}

/** Extract { method, path, handle } for each registered route (last handler in stack). */
function extractHandlers(router) {
  return router.stack
    .filter((l) => l.route)
    .map((l) => ({
      method: Object.keys(l.route.methods)[0],
      path: l.route.path,
      handle: l.route.stack[l.route.stack.length - 1].handle
    }));
}

function getHandler(router, method, path) {
  const h = extractHandlers(router).find((x) => x.method === method && x.path === path);
  assert.ok(h, `handler ${method.toUpperCase()} ${path} not found`);
  return h.handle;
}

/** Match helpers for the tracking pool. */
const m = (sub) => (sql) => sql.includes(sub);

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe("createOccWarpRouter — route registration", () => {
  it("registers all six warp routes", () => {
    const router = makeRouter(trackingPool());
    const handlers = extractHandlers(router).map((h) => `${h.method.toUpperCase()} ${h.path}`);
    assert.deepEqual(
      handlers.sort(),
      [
        "GET /warp/command-registry",
        "GET /warp/history",
        "GET /warp/hosts",
        "GET /warp/runbooks",
        "POST /warp/dry-run",
        "POST /warp/execute"
      ].sort()
    );
  });
});

describe("GET /warp/hosts", () => {
  it("maps host rows and applies defaults for nullish fields", async () => {
    const pool = trackingPool([
      {
        match: m("FROM warp_hosts"),
        respond: {
          rows: [
            {
              id: "h1",
              name: "prod-hetzner-01",
              role: null,
              env: null,
              status: null,
              ssh_ready: true,
              allowed_actions: ["deploy"],
              last_used_at: "2026-06-01T10:00:00Z",
              last_used_by: "owner@x",
              connection_notes: "note"
            },
            {
              id: "h2",
              name: "stage",
              role: "secondary",
              env: "staging",
              status: "down",
              ssh_ready: "yes", // non-true → false
              allowed_actions: null, // not array → []
              last_used_at: null,
              last_used_by: null,
              connection_notes: null
            }
          ]
        }
      }
    ]);
    const handle = getHandler(makeRouter(pool), "get", "/warp/hosts");
    const res = mockRes();
    await handle(mockReq(), res, () => {});

    assert.equal(res._status, 200);
    assert.equal(res._json.success, true);
    const hosts = res._json.data.hosts;
    assert.equal(hosts.length, 2);
    // defaults applied
    assert.equal(hosts[0].role, "primary");
    assert.equal(hosts[0].env, "production");
    assert.equal(hosts[0].status, "unknown");
    assert.equal(hosts[0].ssh_ready, true);
    assert.deepEqual(hosts[0].allowed_actions, ["deploy"]);
    assert.equal(hosts[0].last_used_at, "2026-06-01T10:00:00.000Z");
    // non-true ssh_ready → false; null array → []
    assert.equal(hosts[1].ssh_ready, false);
    assert.deepEqual(hosts[1].allowed_actions, []);
    assert.equal(hosts[1].last_used_at, null);
  });

  it("returns empty list when the query throws (safeQuery fallback)", async () => {
    const pool = trackingPool([
      { match: m("FROM warp_hosts"), respond: () => { throw new Error("db down"); } }
    ]);
    const handle = getHandler(makeRouter(pool), "get", "/warp/hosts");
    const res = mockRes();
    await handle(mockReq(), res, () => {});

    assert.equal(res._status, 200);
    assert.deepEqual(res._json.data.hosts, []);
  });
});

describe("GET /warp/runbooks", () => {
  it("maps runbook rows with default-true confirm/reason flags", async () => {
    const pool = trackingPool([
      {
        match: m("FROM warp_runbooks"),
        respond: {
          rows: [
            {
              id: "rb1",
              name: "Deploy",
              description: null,
              category: null,
              risk_level: null,
              requires_confirm: false, // explicit false → false
              requires_reason: undefined, // !== false → true
              target_hosts: "nope", // not array → []
              steps: [{ label: "a" }],
              preconditions: null,
              estimated_duration_s: undefined, // ?? null
              last_executed_at: "2026-06-02T00:00:00Z",
              last_status: "success"
            }
          ]
        }
      }
    ]);
    const handle = getHandler(makeRouter(pool), "get", "/warp/runbooks");
    const res = mockRes();
    await handle(mockReq(), res, () => {});

    assert.equal(res._json.success, true);
    const rb = res._json.data.runbooks[0];
    assert.equal(rb.category, "maintenance");
    assert.equal(rb.risk_level, "medium");
    assert.equal(rb.requires_confirm, false);
    assert.equal(rb.requires_reason, true);
    assert.deepEqual(rb.target_hosts, []);
    assert.deepEqual(rb.steps, [{ label: "a" }]);
    assert.deepEqual(rb.preconditions, []);
    assert.equal(rb.estimated_duration_s, null);
    assert.equal(rb.last_executed_at, "2026-06-02T00:00:00.000Z");
  });
});

describe("POST /warp/execute & /warp/dry-run — handleExecution branches", () => {
  function postHandlers() {
    const router = makeRouter(trackingPool());
    return {
      execute: getHandler(router, "post", "/warp/execute")
    };
  }

  it("400 CONFIRM_REQUIRED when confirmed !== true", async () => {
    const handle = postHandlers().execute;
    const res = mockRes();
    await handle(mockReq({ body: { reason: "long enough reason" } }), res, () => {});
    assert.equal(res._status, 400);
    assert.equal(res._json.error.code, "CONFIRM_REQUIRED");
  });

  it("400 REASON_TOO_SHORT when reason < 10 chars", async () => {
    const handle = postHandlers().execute;
    const res = mockRes();
    await handle(mockReq({ body: { confirmed: true, reason: "short" } }), res, () => {});
    assert.equal(res._status, 400);
    assert.equal(res._json.error.code, "REASON_TOO_SHORT");
  });

  it("400 RUNBOOK_ID_REQUIRED when runbook_id missing", async () => {
    const handle = postHandlers().execute;
    const res = mockRes();
    await handle(mockReq({ body: { confirmed: true, reason: "valid reason text" } }), res, () => {});
    assert.equal(res._status, 400);
    assert.equal(res._json.error.code, "RUNBOOK_ID_REQUIRED");
  });

  it("404 RUNBOOKS_NOT_AVAILABLE when warp_runbooks table is missing", async () => {
    // tableExists → information_schema query returns no rows → false
    const pool = trackingPool([
      { match: m("information_schema.tables"), respond: { rows: [] } }
    ]);
    const handle = getHandler(makeRouter(pool), "post", "/warp/execute");
    const res = mockRes();
    await handle(mockReq({ body: { confirmed: true, reason: "valid reason text", runbook_id: "rb1" } }), res, () => {});
    assert.equal(res._status, 404);
    assert.equal(res._json.error.code, "RUNBOOKS_NOT_AVAILABLE");
  });

  it("404 RUNBOOK_NOT_FOUND when runbook row missing", async () => {
    const pool = trackingPool([
      { match: m("information_schema.tables"), respond: { rows: [{ "?column?": 1 }] } },
      { match: m("FROM warp_runbooks"), respond: { rows: [] } }
    ]);
    const handle = getHandler(makeRouter(pool), "post", "/warp/execute");
    const res = mockRes();
    await handle(mockReq({ body: { confirmed: true, reason: "valid reason text", runbook_id: "rb1" } }), res, () => {});
    assert.equal(res._status, 404);
    assert.equal(res._json.error.code, "RUNBOOK_NOT_FOUND");
  });

  it("500 EXECUTIONS_NOT_AVAILABLE when warp_executions table is missing", async () => {
    const pool = trackingPool([
      // first tableExists (warp_runbooks) → true; second (warp_executions) → false
      {
        match: m("information_schema.tables"),
        respond: (_sql, params) => (params[0] === "warp_executions" ? { rows: [] } : { rows: [{ ok: 1 }] })
      },
      {
        match: m("FROM warp_runbooks"),
        respond: { rows: [{ id: "rb1", name: "Deploy", risk_level: "high", target_hosts: ["prod"], steps: [] }] }
      },
      { match: m("FROM users"), respond: { rows: [{ email: "owner@x" }] } },
      { match: m("INSERT INTO audit_log"), respond: { rows: [{ id: 99 }] } }
    ]);
    const handle = getHandler(makeRouter(pool), "post", "/warp/execute");
    const res = mockRes();
    await handle(mockReq({ body: { confirmed: true, reason: "valid reason text", runbook_id: "rb1" } }), res, () => {});
    assert.equal(res._status, 500);
    assert.equal(res._json.error.code, "EXECUTIONS_NOT_AVAILABLE");
  });

  it("500 EXECUTION_CREATE_FAILED when startExecution returns no id", async () => {
    const pool = trackingPool([
      { match: m("information_schema.tables"), respond: { rows: [{ ok: 1 }] } },
      {
        match: m("FROM warp_runbooks"),
        respond: { rows: [{ id: "rb1", name: "Deploy", risk_level: "high", target_hosts: ["prod"], steps: [] }] }
      },
      { match: m("FROM users"), respond: { rows: [{ email: "owner@x" }] } },
      { match: m("INSERT INTO audit_log"), respond: { rows: [{ id: 99 }] } },
      { match: m("INSERT INTO warp_executions"), respond: { rows: [] } } // no id
    ]);
    const handle = getHandler(makeRouter(pool), "post", "/warp/execute");
    const res = mockRes();
    await handle(mockReq({ body: { confirmed: true, reason: "valid reason text", runbook_id: "rb1" } }), res, () => {});
    assert.equal(res._status, 500);
    assert.equal(res._json.error.code, "EXECUTION_CREATE_FAILED");
  });

  it("200 success — execute (dry_run=false), uses requested host_name + command_key + audit insert", async () => {
    const pool = trackingPool([
      { match: m("information_schema.tables"), respond: { rows: [{ ok: 1 }] } },
      {
        match: m("FROM warp_runbooks"),
        respond: { rows: [{ id: "rb1", name: "Deploy", risk_level: "high", target_hosts: ["prod-default"], steps: [] }] }
      },
      { match: m("FROM users"), respond: { rows: [{ email: "owner@tempconnect" }] } },
      { match: m("INSERT INTO audit_log"), respond: { rows: [{ id: 4242 }] } },
      { match: m("INSERT INTO warp_executions"), respond: { rows: [{ id: "exec-1", status: "started" }] } }
    ]);
    const handle = getHandler(makeRouter(pool), "post", "/warp/execute");
    const res = mockRes();
    await handle(
      mockReq({
        body: {
          confirmed: true,
          reason: "valid reason text",
          runbook_id: "rb1",
          host_name: "prod-custom",
          command_key: "DEPLOY"
        }
      }),
      res,
      () => {}
    );

    assert.equal(res._status, 200);
    assert.equal(res._json.success, true);
    assert.equal(res._json.data.execution_id, "exec-1");
    assert.equal(res._json.data.status, "started");
    assert.equal(res._json.data.runbook_name, "Deploy");
    assert.equal(res._json.data.host_name, "prod-custom"); // requested host wins over runbook default
    assert.equal(res._json.data.command_key, "deploy"); // lowercased
    assert.equal(res._json.data.audit_id, "4242"); // stringified

    // audit action for non-dry-run
    const auditCall = pool.find("INSERT INTO audit_log")[0];
    assert.ok(auditCall, "audit_log insert was called");
    assert.equal(auditCall.params[1], "owner_control.warp.execute");

    // dry_run flag stored false in warp_executions insert
    const execCall = pool.find("INSERT INTO warp_executions")[0];
    assert.equal(execCall.params[6], false); // dry_run param
  });

  it("200 success — dry-run (dry_run=true) falls back to runbook target host and dry_run audit action", async () => {
    const pool = trackingPool([
      { match: m("information_schema.tables"), respond: { rows: [{ ok: 1 }] } },
      {
        match: m("FROM warp_runbooks"),
        respond: { rows: [{ id: "rb2", name: "Backup", risk_level: null, target_hosts: ["prod-fallback"], steps: [] }] }
      },
      { match: m("FROM users"), respond: { rows: [{ email: "owner@x" }] } },
      { match: m("INSERT INTO audit_log"), respond: { rows: [{ id: 7 }] } },
      { match: m("INSERT INTO warp_executions"), respond: { rows: [{ id: "exec-dry", status: "started" }] } }
    ]);
    const handle = getHandler(makeRouter(pool), "post", "/warp/dry-run");
    const res = mockRes();
    await handle(
      mockReq({ body: { confirmed: true, reason: "valid reason text", runbook_id: "rb2" } }),
      res,
      () => {}
    );

    assert.equal(res._status, 200);
    assert.equal(res._json.data.host_name, "prod-fallback"); // runbook default used
    assert.equal(res._json.data.command_key, null); // none supplied

    const auditCall = pool.find("INSERT INTO audit_log")[0];
    assert.equal(auditCall.params[1], "owner_control.warp.dry_run");

    const execCall = pool.find("INSERT INTO warp_executions")[0];
    assert.equal(execCall.params[6], true); // dry_run true
  });

  it("200 success — audit insert failure (returns null id) still proceeds and emits null audit_id", async () => {
    const pool = trackingPool([
      { match: m("information_schema.tables"), respond: { rows: [{ ok: 1 }] } },
      {
        match: m("FROM warp_runbooks"),
        respond: { rows: [{ id: "rb1", name: "Deploy", risk_level: "high", target_hosts: [], steps: [] }] }
      },
      { match: m("FROM users"), respond: { rows: [{ email: "owner@x" }] } },
      { match: m("INSERT INTO audit_log"), respond: () => { throw new Error("audit table gone"); } },
      { match: m("INSERT INTO warp_executions"), respond: { rows: [{ id: "exec-2", status: "started" }] } }
    ]);
    const handle = getHandler(makeRouter(pool), "post", "/warp/execute");
    const res = mockRes();
    await handle(
      mockReq({ body: { confirmed: true, reason: "valid reason text", runbook_id: "rb1" } }),
      res,
      () => {}
    );

    assert.equal(res._status, 200);
    assert.equal(res._json.data.audit_id, null); // insertAuditRow swallowed the throw
    assert.equal(res._json.data.host_name, null); // empty target_hosts + no requested host
  });
});

describe("GET /warp/history", () => {
  it("paginates: trims to per_page, sets has_more, reports total", async () => {
    // per_page=2 → query asks for 3 (perPage+1); return 3 rows → has_more true
    const pool = trackingPool([
      {
        match: m("FROM warp_executions") , // SELECT list
        respond: (sql) => {
          if (sql.includes("COUNT(*)")) return { rows: [{ n: 42 }] };
          return {
            rows: [
              { id: "e1", status: "success", dry_run: true, step_results: [{ s: 1 }], audit_id: 5, started_at: "2026-06-01T00:00:00Z" },
              { id: "e2", status: null, dry_run: "no", step_results: null, audit_id: null, started_at: null },
              { id: "e3", status: "failed", dry_run: false, step_results: [], audit_id: 0, started_at: null }
            ]
          };
        }
      }
    ]);
    const handle = getHandler(makeRouter(pool), "get", "/warp/history");
    const res = mockRes();
    await handle(mockReq({ query: { page: "1", per_page: "2" } }), res, () => {});

    assert.equal(res._status, 200);
    assert.equal(res._json.success, true);
    assert.equal(res._json.data.items.length, 2); // trimmed to per_page
    assert.equal(res._json.data.has_more, true);
    assert.equal(res._json.data.total, 42);

    const it0 = res._json.data.items[0];
    assert.equal(it0.id, "e1");
    assert.equal(it0.dry_run, true);
    assert.deepEqual(it0.step_results, [{ s: 1 }]);
    assert.equal(it0.audit_id, "5"); // stringified
    assert.equal(it0.started_at, "2026-06-01T00:00:00.000Z");

    const it1 = res._json.data.items[1];
    assert.equal(it1.status, "unknown");
    assert.equal(it1.dry_run, false); // "no" !== true
    assert.deepEqual(it1.step_results, []); // null → []
    assert.equal(it1.audit_id, null);

    // LIMIT param = perPage+1 = 3, OFFSET = 0
    const listCall = pool.find("LIMIT $1 OFFSET $2")[0];
    assert.ok(listCall);
    assert.equal(listCall.params[0], 3);
    assert.equal(listCall.params[1], 0);
  });

  it("computes offset from page (page=3, per_page=10 → offset 20) and has_more=false when not over limit", async () => {
    const pool = trackingPool([
      {
        match: m("FROM warp_executions"),
        respond: (sql) => {
          if (sql.includes("COUNT(*)")) return { rows: [{ n: 5 }] };
          return { rows: [{ id: "x1", started_at: null }] }; // 1 row < per_page → has_more false
        }
      }
    ]);
    const handle = getHandler(makeRouter(pool), "get", "/warp/history");
    const res = mockRes();
    await handle(mockReq({ query: { page: "3", per_page: "10" } }), res, () => {});

    assert.equal(res._json.data.has_more, false);
    assert.equal(res._json.data.total, 5);
    const listCall = pool.find("LIMIT $1 OFFSET $2")[0];
    assert.equal(listCall.params[0], 11); // perPage+1
    assert.equal(listCall.params[1], 20); // (3-1)*10
  });
});

describe("GET /warp/command-registry", () => {
  it("returns the frozen command registry as plain clones", async () => {
    const handle = getHandler(makeRouter(trackingPool()), "get", "/warp/command-registry");
    const res = mockRes();
    await handle(mockReq(), res, () => {});

    assert.equal(res._status, 200);
    assert.equal(res._json.success, true);
    const cmds = res._json.data.allowed_commands;
    assert.equal(cmds.length, 5);
    const keys = cmds.map((c) => c.key);
    assert.deepEqual(keys, ["deploy", "restart_service", "backup_trigger", "health_check", "raw_shell"]);
    // raw_shell must be flagged forbidden + critical
    const rawShell = cmds.find((c) => c.key === "raw_shell");
    assert.equal(rawShell.forbidden, true);
    assert.equal(rawShell.risk_level, "critical");
    // clone, not the frozen original → mutable
    cmds[0].key = "mutated";
    assert.equal(cmds[0].key, "mutated");
  });
});
