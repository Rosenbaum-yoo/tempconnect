/**
 * Router-handler coverage for routes/support.js (createSupportRouter / buildSupportRouter).
 *
 * Strategy: the support handlers all funnel DB access through pool.query(sql, params)
 * (mutations additionally go through pool.connect() -> BEGIN/COMMIT). We drive the
 * REAL handler + real helper code with a SQL-substring-dispatching tracking pool and
 * a manually-populated req (req.supportAgent / supportAllowedActions / supportMaskingRules /
 * supportFeatures), which is what requireSupportAccess would set. Middleware
 * (requireAuth / supportRateLimit / requireSupportAccess / requireSupportFeature /
 * externalLookupGuard) is bypassed by invoking only the LAST handler in each route
 * stack — same idiom as requests.route.coverage.test.js / admin.route.coverage.test.js.
 *
 * ALL support handlers respond inline via res.status().json() (errors are caught and
 * mapped to 500 inline — never next(err)), so every assertion checks res._status/_json.
 *
 * Run: node --test --test-force-exit test/support.route.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSupportRouter } from "../routes/support.js";

/* ── Mocks ─────────────────────────────────────────────────────────────── */

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

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
    // pool.connect() -> client with query + release (needed by mutation handlers)
    connect: async () => ({ query, release() {} }),
    find(substr) {
      return calls.filter((c) => c.sql.includes(substr));
    }
  };
}

/** Build a supportAgent + the request fields requireSupportAccess would attach. */
function makeAgent(overrides = {}) {
  const role = overrides.role ?? "internal_support_lead";
  return {
    id: overrides.id ?? "agent-1",
    user_id: overrides.user_id ?? "u1",
    role,
    scope: overrides.scope ?? (role.startsWith("external") ? "external" : "internal"),
    vendor_id: overrides.vendor_id ?? null,
    vendor_name: overrides.vendor_name ?? null,
    data_scope: overrides.data_scope ?? "all",
    allowed_queues: overrides.allowed_queues ?? [],
    allowed_case_types: overrides.allowed_case_types ?? [],
    allowed_actions:
      overrides.allowed_actions ??
      [ "accept", "assign", "change_status", "change_priority", "add_note", "escalate", "resend_verification", "resend_invite", "close" ],
    is_active: true,
    display_name: overrides.display_name ?? "Lead Agent"
  };
}

function mockReq(agent, overrides = {}) {
  return {
    session: { userId: agent.user_id },
    params: {},
    query: {},
    body: {},
    headers: {},
    ip: "127.0.0.1",
    get: () => "",
    supportAgent: agent,
    supportAllowedActions: agent.allowed_actions,
    supportMaskingRules: { mask_email: false },
    supportFeatures: {
      user_lookup: true, org_lookup: true, knowledge_base: true,
      supervisor_view: true, audit_view: true, quality_metrics: true
    },
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
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; return res; },
    set() { return res; },
    type() { return res; },
    send(payload) { res._send = payload; return res; },
    end() { return res; }
  };
  return res;
}

function makeDeps(pool, configOverrides = {}) {
  return {
    pool,
    logger: mockLogger(),
    requireAuth: (_req, _res, next) => next(),
    supportRateLimit: (_req, _res, next) => next(),
    sendMail: async () => true,
    config: { SUPPORT_OPS_ENABLED: true, BASE_URL: "https://x.test", ...configOverrides }
  };
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

/* A loadCaseRow base-select matcher (used by detail + action handlers). */
const CASE_SELECT = "FROM support_cases sc";
const CASE_LATERAL = "ROW_NUMBER";

function caseRow(overrides = {}) {
  return {
    id: overrides.id ?? "case-1",
    case_number: overrides.case_number ?? "SC-1001",
    subject: overrides.subject ?? "Login broken",
    description: overrides.description ?? "details",
    status: overrides.status ?? "open",
    priority: overrides.priority ?? "normal",
    case_type: overrides.case_type ?? "general",
    queue_id: overrides.queue_id ?? "q1",
    queue_name: overrides.queue_name ?? "General",
    assigned_to_agent_id: overrides.assigned_to_agent_id ?? null,
    assigned_to_name: overrides.assigned_to_name ?? null,
    reporter_user_id: overrides.reporter_user_id ?? "rep-1",
    reporter_email: overrides.reporter_email ?? "r@x.de",
    reporter_name: overrides.reporter_name ?? "Reporter",
    reporter_org_id: overrides.reporter_org_id ?? "org-1",
    org_name: overrides.org_name ?? "ACME",
    is_escalated: overrides.is_escalated ?? false,
    escalation_target: overrides.escalation_target ?? null,
    sla_state: "ok",
    sla_resolution_deadline: null,
    sla_hours_remaining: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    reporter_is_verified: true,
    reporter_org_count: 1,
    org_member_count: 3,
    ...overrides
  };
}

/* ── Router shape ──────────────────────────────────────────────────────── */

describe("support router — registration", () => {
  it("registers all expected routes", () => {
    const router = createSupportRouter(makeDeps(trackingPool()));
    const seen = new Set(
      router.stack
        .filter((l) => l.route)
        .map((l) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`)
    );
    for (const r of [
      "get /support/bootstrap",
      "get /support/cases",
      "get /support/cases/:id",
      "post /support/cases/:id/action",
      "get /support/lookup/users",
      "get /support/lookup/orgs",
      "get /support/escalations",
      "post /support/escalations",
      "get /support/knowledge",
      "get /support/knowledge/categories",
      "get /support/quality/metrics",
      "get /support/quality/agents",
      "get /support/quality/sla",
      "get /support/audit",
      "get /support/supervisor/overview",
      "get /support/supervisor/agents",
      "post /support/user-actions"
    ]) {
      assert.ok(seen.has(r), `missing route: ${r}`);
    }
  });
});

/* ── GET /support/bootstrap ────────────────────────────────────────────── */

describe("GET /support/bootstrap", () => {
  it("200 returns identity + queues + sla_summary", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM support_queues sq") && s.includes("open_count"),
        respond: { rows: [{ id: "q1", name: "General", type: "general", open_count: 5, sla_at_risk: 1 }] } },
      { match: (s) => s.includes("sc.assigned_to_agent_id = $1::uuid") && s.includes("AS n"),
        respond: { rows: [{ n: 4 }] } },
      { match: (s) => s.includes("FROM support_escalations se"),
        respond: { rows: [{ n: 2 }] } },
      { match: (s) => s.includes("AS open_assigned"),
        respond: { rows: [{ open_assigned: 4, sla_at_risk: 1, sla_breached: 0 }] } },
      { match: (s) => s.includes("FROM users u") && s.includes("display_name"),
        respond: { rows: [{ id: "u1", email: "agent@tc.de", display_name: "Lead Agent" }] } }
    ]);
    const agent = makeAgent({ role: "internal_support_lead" });
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "get", "/support/bootstrap");
    const res = mockRes();
    await handler(mockReq(agent), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.queues.length, 1);
    assert.strictEqual(res._json.queues[0].open_count, 5);
    assert.strictEqual(res._json.sla_summary.escalations_pending, 2);
    assert.strictEqual(res._json.identity.role, "internal_support_lead");
    assert.ok(res._json.features);
  });

  it("500 SERVER_ERROR when a query throws", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM support_queues sq"), respond: () => { throw new Error("db down"); } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "get", "/support/bootstrap");
    const res = mockRes();
    await handler(mockReq(makeAgent()), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error, "SERVER_ERROR");
  });
});

/* ── GET /support/cases ────────────────────────────────────────────────── */

describe("GET /support/cases", () => {
  it("200 returns paginated items + total", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT COUNT(*)::int AS n") && s.includes("FROM support_cases sc"),
        respond: { rows: [{ n: 1 }] } },
      { match: (s) => s.includes(CASE_SELECT) && s.includes("ORDER BY sc.updated_at DESC"),
        respond: { rows: [ caseRow() ] } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "get", "/support/cases");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { query: { status: "open", priority: "normal", search: "Login", assigned_to_me: "1", sla_at_risk: "1", is_escalated: "1" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.total, 1);
    assert.strictEqual(res._json.items.length, 1);
    assert.strictEqual(res._json.items[0].case_number, "SC-1001");
  });

  it("500 SERVER_ERROR when listing query throws", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT COUNT(*)::int AS n"), respond: () => { throw new Error("boom"); } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "get", "/support/cases");
    const res = mockRes();
    await handler(mockReq(makeAgent()), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error, "SERVER_ERROR");
  });
});

/* ── GET /support/cases/:id ────────────────────────────────────────────── */

describe("GET /support/cases/:id", () => {
  it("404 CASE_NOT_FOUND when no row", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes(CASE_SELECT) && s.includes("LIMIT 1"), respond: { rows: [] } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "get", "/support/cases/:id");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { params: { id: "missing" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "CASE_NOT_FOUND");
  });

  it("200 returns case detail with notes + timeline", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes(CASE_SELECT) && s.includes("LIMIT 1"), respond: { rows: [ caseRow() ] } },
      { match: (s) => s.includes("FROM support_case_notes n"),
        respond: { rows: [{ id: "n1", case_id: "case-1", note_type: "internal", body: "hi", created_at: "2026-01-01", author_name: "Agent" }] } },
      { match: (s) => s.includes("FROM support_case_events e"),
        respond: { rows: [{ id: "e1", case_id: "case-1", event: "case_accepted", detail: { action: "accept" }, created_at: "2026-01-01", actor_name: "Agent" }] } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "get", "/support/cases/:id");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { params: { id: "case-1" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.id, "case-1");
    assert.strictEqual(res._json.notes.length, 1);
    assert.strictEqual(res._json.timeline.length, 1);
    assert.ok(Array.isArray(res._json.allowed_actions));
  });

  it("500 SERVER_ERROR when detail query throws", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes(CASE_SELECT) && s.includes("LIMIT 1"), respond: () => { throw new Error("boom"); } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "get", "/support/cases/:id");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { params: { id: "case-1" } }), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error, "SERVER_ERROR");
  });
});

/* ── POST /support/cases/:id/action ────────────────────────────────────── */

describe("POST /support/cases/:id/action", () => {
  function actionPool(extra = []) {
    return trackingPool([
      { match: (s) => s.includes(CASE_SELECT) && s.includes("LIMIT 1"), respond: { rows: [ caseRow() ] } },
      { match: (s) => s.includes("FROM support_case_notes n"), respond: { rows: [] } },
      { match: (s) => s.includes("FROM support_case_events e"), respond: { rows: [] } },
      ...extra
    ]);
  }

  it("400 INVALID_ACTION for unknown action", async () => {
    const handler = getHandler(createSupportRouter(makeDeps(trackingPool())), "post", "/support/cases/:id/action");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { params: { id: "case-1" }, body: { action: "nonsense" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "INVALID_ACTION");
  });

  it("400 CASE_ID_MISMATCH when body.case_id differs from URL", async () => {
    const handler = getHandler(createSupportRouter(makeDeps(trackingPool())), "post", "/support/cases/:id/action");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { params: { id: "case-1" }, body: { action: "accept", case_id: "other" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "CASE_ID_MISMATCH");
  });

  it("404 CASE_NOT_FOUND when case missing", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes(CASE_SELECT) && s.includes("LIMIT 1"), respond: { rows: [] } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "post", "/support/cases/:id/action");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { params: { id: "case-1" }, body: { action: "accept" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "CASE_NOT_FOUND");
  });

  it("403 PERMISSION_DENIED when action not allowed for role", async () => {
    // auditor has no actions
    const pool = actionPool();
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "post", "/support/cases/:id/action");
    const res = mockRes();
    const agent = makeAgent({ role: "support_auditor", allowed_actions: [] });
    await handler(mockReq(agent, { params: { id: "case-1" }, body: { action: "accept" } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "PERMISSION_DENIED");
  });

  it("200 accept assigns the case + records audit", async () => {
    const pool = actionPool();
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "post", "/support/cases/:id/action");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { params: { id: "case-1" }, body: { action: "accept" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.ok(pool.find("UPDATE support_cases").length >= 1);
    assert.ok(pool.find("INSERT INTO support_audit_log").length >= 1);
    assert.ok(pool.find("INSERT INTO support_case_events").length >= 1);
  });

  it("400 ASSIGNEE_REQUIRED when assign without assignee_id", async () => {
    const pool = actionPool();
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "post", "/support/cases/:id/action");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { params: { id: "case-1" }, body: { action: "assign" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "ASSIGNEE_REQUIRED");
  });

  it("404 ASSIGNEE_NOT_FOUND when assignee inactive/missing", async () => {
    const pool = actionPool([
      { match: (s) => s.includes("FROM support_agents sa") && s.includes("sa.id = $1::uuid"), respond: { rows: [] } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "post", "/support/cases/:id/action");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { params: { id: "case-1" }, body: { action: "assign", assignee_id: "ag-9" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "ASSIGNEE_NOT_FOUND");
  });

  it("200 assign succeeds with valid assignee", async () => {
    const pool = actionPool([
      { match: (s) => s.includes("FROM support_agents sa") && s.includes("sa.id = $1::uuid"),
        respond: { rows: [{ id: "ag-9", vendor_id: null }] } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "post", "/support/cases/:id/action");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { params: { id: "case-1" }, body: { action: "assign", assignee_id: "ag-9" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
  });

  it("400 INVALID_STATUS for change_status with bad status", async () => {
    const pool = actionPool();
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "post", "/support/cases/:id/action");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { params: { id: "case-1" }, body: { action: "change_status", new_status: "bogus" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "INVALID_STATUS");
  });

  it("200 change_status to in_progress", async () => {
    const pool = actionPool();
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "post", "/support/cases/:id/action");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { params: { id: "case-1" }, body: { action: "change_status", new_status: "in_progress" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
  });

  it("400 INVALID_PRIORITY for change_priority with bad priority", async () => {
    const pool = actionPool();
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "post", "/support/cases/:id/action");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { params: { id: "case-1" }, body: { action: "change_priority", new_priority: "bogus" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "INVALID_PRIORITY");
  });

  it("200 change_priority to high", async () => {
    const pool = actionPool();
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "post", "/support/cases/:id/action");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { params: { id: "case-1" }, body: { action: "change_priority", new_priority: "high" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
  });

  it("400 NOTE_REQUIRED when add_note without note", async () => {
    const pool = actionPool();
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "post", "/support/cases/:id/action");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { params: { id: "case-1" }, body: { action: "add_note" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "NOTE_REQUIRED");
  });

  it("400 INVALID_NOTE_TYPE when add_note with bad note_type", async () => {
    const pool = actionPool();
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "post", "/support/cases/:id/action");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { params: { id: "case-1" }, body: { action: "add_note", note: "x", note_type: "weird" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "INVALID_NOTE_TYPE");
  });

  it("200 add_note succeeds", async () => {
    const pool = actionPool();
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "post", "/support/cases/:id/action");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { params: { id: "case-1" }, body: { action: "add_note", note: "internal note", note_type: "internal" } }), res);
    assert.strictEqual(res._status, 200);
    assert.ok(pool.find("INSERT INTO support_case_notes").length >= 1);
  });

  it("400 INVALID_TARGET when escalate with bad target", async () => {
    const pool = actionPool();
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "post", "/support/cases/:id/action");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { params: { id: "case-1" }, body: { action: "escalate", target: "nope", reason: "x".repeat(25) } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "INVALID_TARGET");
  });

  it("400 ESCALATION_REASON_REQUIRED when escalate reason too short", async () => {
    const pool = actionPool();
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "post", "/support/cases/:id/action");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { params: { id: "case-1" }, body: { action: "escalate", target: "ops", reason: "short" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "ESCALATION_REASON_REQUIRED");
  });

  it("200 escalate to ops creates occ + escalation + ops signal", async () => {
    const pool = actionPool([
      { match: (s) => s.includes("INSERT INTO occ_decisions"), respond: { rows: [{ id: "occ-1" }] } },
      { match: (s) => s.includes("INSERT INTO support_escalations"), respond: { rows: [{ id: "esc-1" }] } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "post", "/support/cases/:id/action");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { params: { id: "case-1" }, body: { action: "escalate", target: "ops", reason: "This is a sufficiently long escalation reason." } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.ok(pool.find("INSERT INTO occ_decisions").length >= 1);
    assert.ok(pool.find("INSERT INTO risk_signals").length >= 1);
  });

  it("400 CLOSE_REASON_REQUIRED when close without reason", async () => {
    const pool = actionPool();
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "post", "/support/cases/:id/action");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { params: { id: "case-1" }, body: { action: "close" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "CLOSE_REASON_REQUIRED");
  });

  it("200 close with reason succeeds", async () => {
    const pool = actionPool();
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "post", "/support/cases/:id/action");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { params: { id: "case-1" }, body: { action: "close", reason: "Resolved by phone." } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
  });

  it("500 SERVER_ERROR + ROLLBACK when an update throws mid-transaction", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes(CASE_SELECT) && s.includes("LIMIT 1"), respond: { rows: [ caseRow() ] } },
      { match: (s) => s.includes("UPDATE support_cases"), respond: () => { throw new Error("db down"); } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "post", "/support/cases/:id/action");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { params: { id: "case-1" }, body: { action: "accept" } }), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error, "SERVER_ERROR");
    assert.ok(pool.find("ROLLBACK").length >= 1);
  });
});

/* ── GET /support/lookup/users ─────────────────────────────────────────── */

describe("GET /support/lookup/users", () => {
  it("400 SEARCH_TOO_SHORT for <3 char search", async () => {
    const handler = getHandler(createSupportRouter(makeDeps(trackingPool())), "get", "/support/lookup/users");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { query: { search: "ab" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "SEARCH_TOO_SHORT");
  });

  it("200 returns masked items + audit", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("COUNT(DISTINCT u.id)::int AS n"), respond: { rows: [{ n: 1 }] } },
      { match: (s) => s.includes("FROM users u") && s.includes("open_case_count"),
        respond: { rows: [{ id: "rep-1", email: "r@x.de", contact_person: "Rep", company_name: null, is_verified: true, created_at: "2026-01-01", org_count: 2, open_case_count: 1 }] } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "get", "/support/lookup/users");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { query: { search: "rep" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.items.length, 1);
    assert.strictEqual(res._json.total, 1);
    assert.ok(pool.find("INSERT INTO support_audit_log").length >= 1);
  });

  it("500 SERVER_ERROR when count query throws", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("COUNT(DISTINCT u.id)::int AS n"), respond: () => { throw new Error("boom"); } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "get", "/support/lookup/users");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { query: { search: "rep" } }), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error, "SERVER_ERROR");
  });
});

/* ── GET /support/lookup/orgs ──────────────────────────────────────────── */

describe("GET /support/lookup/orgs", () => {
  it("400 SEARCH_TOO_SHORT for <2 char search", async () => {
    const handler = getHandler(createSupportRouter(makeDeps(trackingPool())), "get", "/support/lookup/orgs");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { query: { search: "a" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "SEARCH_TOO_SHORT");
  });

  it("200 returns orgs + recent cases + audit", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("COUNT(DISTINCT org.id)::int AS n"), respond: { rows: [{ n: 1 }] } },
      { match: (s) => s.includes("FROM organizations org") && s.includes("open_case_count"),
        respond: { rows: [{ id: "org-1", name: "ACME", plan: "PRO", is_active: true, created_at: "2026-01-01", member_count: 3, open_case_count: 2 }] } },
      { match: (s) => s.includes(CASE_LATERAL), respond: { rows: [ { ...caseRow(), reporter_org_id: "org-1", rn: 1 } ] } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "get", "/support/lookup/orgs");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { query: { search: "ac" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.items.length, 1);
    assert.strictEqual(res._json.items[0].org_name, "ACME");
    assert.strictEqual(res._json.items[0].recent_cases.length, 1);
    assert.ok(pool.find("INSERT INTO support_audit_log").length >= 1);
  });
});

/* ── GET /support/escalations ──────────────────────────────────────────── */

describe("GET /support/escalations", () => {
  it("200 returns escalation items", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT COUNT(*)::int AS n") && s.includes("FROM support_escalations se"),
        respond: { rows: [{ n: 1 }] } },
      { match: (s) => s.includes("se.resolution_note"),
        respond: { rows: [{ id: "esc-1", case_id: "case-1", target: "ops", reason: "r", priority: "high", summary: "s", status: "pending", created_at: "2026-01-01", resolved_at: null, resolution_note: null, case_number: "SC-1", case_subject: "subj", created_by_name: "Agent" }] } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "get", "/support/escalations");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { query: { status: "pending", target: "ops", search: "SC" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.items.length, 1);
    assert.strictEqual(res._json.items[0].target, "ops");
  });

  it("500 SERVER_ERROR when query throws", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT COUNT(*)::int AS n") && s.includes("FROM support_escalations se"),
        respond: () => { throw new Error("boom"); } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "get", "/support/escalations");
    const res = mockRes();
    await handler(mockReq(makeAgent()), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error, "SERVER_ERROR");
  });
});

/* ── POST /support/escalations ─────────────────────────────────────────── */

const VALID_UUID = "11111111-1111-1111-1111-111111111111";

describe("POST /support/escalations", () => {
  it("400 CASE_ID_REQUIRED when case_id missing/invalid", async () => {
    const handler = getHandler(createSupportRouter(makeDeps(trackingPool())), "post", "/support/escalations");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { body: { case_id: "not-a-uuid", target: "ops", reason: "x".repeat(25), summary: "s" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "CASE_ID_REQUIRED");
  });

  it("400 INVALID_TARGET for bad target", async () => {
    const handler = getHandler(createSupportRouter(makeDeps(trackingPool())), "post", "/support/escalations");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { body: { case_id: VALID_UUID, target: "bad", reason: "x".repeat(25), summary: "s" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "INVALID_TARGET");
  });

  it("400 ESCALATION_REASON_REQUIRED for short reason", async () => {
    const handler = getHandler(createSupportRouter(makeDeps(trackingPool())), "post", "/support/escalations");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { body: { case_id: VALID_UUID, target: "ops", reason: "short", summary: "s" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "ESCALATION_REASON_REQUIRED");
  });

  it("400 SUMMARY_REQUIRED when summary missing", async () => {
    const handler = getHandler(createSupportRouter(makeDeps(trackingPool())), "post", "/support/escalations");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { body: { case_id: VALID_UUID, target: "ops", reason: "x".repeat(25) } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "SUMMARY_REQUIRED");
  });

  it("403 PERMISSION_DENIED when role cannot escalate", async () => {
    const agent = makeAgent({ role: "internal_support_agent", allowed_actions: [ "accept", "add_note" ] });
    const handler = getHandler(createSupportRouter(makeDeps(trackingPool())), "post", "/support/escalations");
    const res = mockRes();
    await handler(mockReq(agent, { body: { case_id: VALID_UUID, target: "ops", reason: "x".repeat(25), summary: "s" } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "PERMISSION_DENIED");
  });

  it("404 CASE_NOT_FOUND when case missing", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes(CASE_SELECT) && s.includes("LIMIT 1"), respond: { rows: [] } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "post", "/support/escalations");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { body: { case_id: VALID_UUID, target: "ops", reason: "x".repeat(25), summary: "s" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "CASE_NOT_FOUND");
  });

  it("200 success creates escalation + occ + ops signal", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes(CASE_SELECT) && s.includes("LIMIT 1"), respond: { rows: [ caseRow() ] } },
      { match: (s) => s.includes("INSERT INTO occ_decisions"), respond: { rows: [{ id: "occ-1" }] } },
      { match: (s) => s.includes("INSERT INTO support_escalations"), respond: { rows: [{ id: "esc-1" }] } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "post", "/support/escalations");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { body: { case_id: VALID_UUID, target: "ops", reason: "This reason is definitely long enough.", summary: "summary" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.strictEqual(res._json.escalation_id, "esc-1");
    assert.ok(pool.find("INSERT INTO risk_signals").length >= 1);
  });
});

/* ── GET /support/knowledge ────────────────────────────────────────────── */

describe("GET /support/knowledge", () => {
  it("200 returns articles + audit", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM support_knowledge") && s.includes("allowed_roles"),
        respond: { rows: [{ id: "k1", category: "billing", title: "T", body: "B", tags: ["a"], allowed_roles: ["internal_support_lead"] }] } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "get", "/support/knowledge");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { query: { category: "billing", search: "T" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.length, 1);
    assert.strictEqual(res._json[0].title, "T");
    assert.ok(pool.find("INSERT INTO support_audit_log").length >= 1);
  });

  it("500 SERVER_ERROR when query throws", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM support_knowledge"), respond: () => { throw new Error("boom"); } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "get", "/support/knowledge");
    const res = mockRes();
    await handler(mockReq(makeAgent()), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error, "SERVER_ERROR");
  });
});

/* ── GET /support/knowledge/categories ─────────────────────────────────── */

describe("GET /support/knowledge/categories", () => {
  it("200 returns category list", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT DISTINCT category"),
        respond: { rows: [{ category: "billing" }, { category: "onboarding" }] } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "get", "/support/knowledge/categories");
    const res = mockRes();
    await handler(mockReq(makeAgent()), res);
    assert.strictEqual(res._status, 200);
    assert.deepStrictEqual(res._json, [ "billing", "onboarding" ]);
  });
});

/* ── GET /support/quality/metrics ──────────────────────────────────────── */

describe("GET /support/quality/metrics", () => {
  it("200 returns aggregated metrics", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("AS total_cases"),
        respond: { rows: [{ total_cases: 10, resolved_cases: 7, avg_first_response_h: 1.5, avg_resolution_h: 12.0, sla_met_percent: 90.0, escalation_rate_percent: 10.0, reopen_rate_percent: 5.0 }] } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "get", "/support/quality/metrics");
    const res = mockRes();
    await handler(mockReq(makeAgent()), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.total_cases, 10);
    assert.strictEqual(res._json.resolved_cases, 7);
    assert.strictEqual(res._json.period, "last_30_days");
  });
});

/* ── GET /support/quality/agents ───────────────────────────────────────── */

describe("GET /support/quality/agents", () => {
  it("200 returns agent rows (lead scope)", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM support_agents sa") && s.includes("avg_first_response_h"),
        respond: { rows: [{ agent_id: "a1", role: "internal_support_agent", vendor_name: null, display_name: "Agent A", open_cases: 3, sla_at_risk: 1, avg_first_response_h: 2.0, avg_resolution_h: 8.0 }] } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "get", "/support/quality/agents");
    const res = mockRes();
    await handler(mockReq(makeAgent({ role: "internal_support_lead" })), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.length, 1);
    assert.strictEqual(res._json[0].open_cases, 3);
  });

  it("200 supervisor scope (external) filters by vendor", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM support_agents sa") && s.includes("avg_first_response_h"), respond: { rows: [] } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "get", "/support/quality/agents");
    const res = mockRes();
    await handler(mockReq(makeAgent({ role: "external_support_supervisor", scope: "external", vendor_id: "v1" })), res);
    assert.strictEqual(res._status, 200);
    assert.deepStrictEqual(res._json, []);
  });
});

/* ── GET /support/quality/sla ──────────────────────────────────────────── */

describe("GET /support/quality/sla", () => {
  it("200 returns per-queue sla rows", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM support_queues sq") && s.includes("sla_met_percent"),
        respond: { rows: [{ queue_id: "q1", queue_name: "General", type: "general", open: 4, at_risk: 1, breached: 0, sla_met_percent: 95.0 }] } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "get", "/support/quality/sla");
    const res = mockRes();
    await handler(mockReq(makeAgent()), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json[0].queue_name, "General");
    assert.strictEqual(res._json[0].sla_met_percent, 95);
  });
});

/* ── GET /support/audit ────────────────────────────────────────────────── */

describe("GET /support/audit", () => {
  it("200 returns audit feed items", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT COUNT(*)::int AS n") && s.includes("FROM support_audit_log sal"),
        respond: { rows: [{ n: 1 }] } },
      { match: (s) => s.includes("sal.action, sal.reason"),
        respond: { rows: [{ id: "al1", action: "case_accepted", reason: "r", created_at: "2026-01-01", case_ref: "SC-1", actor_name: "Agent" }] } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "get", "/support/audit");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { query: { search: "SC", action: "case_accepted" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.items.length, 1);
    assert.strictEqual(res._json.items[0].action, "case_accepted");
  });

  it("500 SERVER_ERROR when query throws", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM support_audit_log sal"), respond: () => { throw new Error("boom"); } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "get", "/support/audit");
    const res = mockRes();
    await handler(mockReq(makeAgent()), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error, "SERVER_ERROR");
  });
});

/* ── GET /support/supervisor/overview ──────────────────────────────────── */

describe("GET /support/supervisor/overview", () => {
  it("403 PERMISSION_DENIED for non-supervisor role", async () => {
    const handler = getHandler(createSupportRouter(makeDeps(trackingPool())), "get", "/support/supervisor/overview");
    const res = mockRes();
    await handler(mockReq(makeAgent({ role: "internal_support_agent" })), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "PERMISSION_DENIED");
  });

  it("200 returns summary + queues for supervisor", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("AS total_open"),
        respond: { rows: [{ total_open: 12, sla_at_risk: 3, sla_breached: 1 }] } },
      { match: (s) => s.includes("FROM support_escalations se") && s.includes("AS n"),
        respond: { rows: [{ n: 2 }] } },
      { match: (s) => s.includes("AS agents_active"),
        respond: { rows: [{ queue_id: "q1", queue_name: "General", type: "general", open_count: 6, sla_at_risk: 1, sla_breached: 0, agents_active: 2, oldest_open_h: 10.5 }] } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "get", "/support/supervisor/overview");
    const res = mockRes();
    await handler(mockReq(makeAgent({ role: "internal_support_lead" })), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.total_open, 12);
    assert.strictEqual(res._json.escalations_pending, 2);
    assert.strictEqual(res._json.queues.length, 1);
  });
});

/* ── GET /support/supervisor/agents ────────────────────────────────────── */

describe("GET /support/supervisor/agents", () => {
  it("403 PERMISSION_DENIED for non-supervisor role", async () => {
    const handler = getHandler(createSupportRouter(makeDeps(trackingPool())), "get", "/support/supervisor/agents");
    const res = mockRes();
    await handler(mockReq(makeAgent({ role: "support_auditor" })), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "PERMISSION_DENIED");
  });

  it("200 returns agent rows for supervisor", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM support_agents sa") && s.includes("avg_resolution_h"),
        respond: { rows: [{ agent_id: "a1", role: "internal_support_agent", vendor_name: null, display_name: "Agent A", open_cases: 2, sla_at_risk: 0, avg_first_response_h: 1.0, avg_resolution_h: 5.0 }] } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "get", "/support/supervisor/agents");
    const res = mockRes();
    await handler(mockReq(makeAgent({ role: "internal_support_lead" })), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.length, 1);
    assert.strictEqual(res._json[0].agent_id, "a1");
  });
});

/* ── POST /support/user-actions ────────────────────────────────────────── */

describe("POST /support/user-actions", () => {
  it("400 INVALID_ACTION for unsupported action", async () => {
    const handler = getHandler(createSupportRouter(makeDeps(trackingPool())), "post", "/support/user-actions");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { body: { action: "delete_user", reason: "x".repeat(10), user_id_masked: "usr-1" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "INVALID_ACTION");
  });

  it("400 REASON_REQUIRED when reason too short", async () => {
    const handler = getHandler(createSupportRouter(makeDeps(trackingPool())), "post", "/support/user-actions");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { body: { action: "resend_invite", reason: "short", user_id_masked: "usr-1" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "REASON_REQUIRED");
  });

  it("400 USER_ID_REQUIRED when user_id_masked missing", async () => {
    const handler = getHandler(createSupportRouter(makeDeps(trackingPool())), "post", "/support/user-actions");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { body: { action: "resend_invite", reason: "long enough reason" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "USER_ID_REQUIRED");
  });

  it("404 USER_NOT_FOUND when masked id cannot be resolved", async () => {
    // unresolvable masked id (not a uuid, not short/hash pattern) -> resolveMaskedUserId returns null
    const handler = getHandler(createSupportRouter(makeDeps(trackingPool())), "post", "/support/user-actions");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { body: { action: "resend_invite", reason: "long enough reason", user_id_masked: "garbage-id" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "USER_NOT_FOUND");
  });

  it("200 resend_invite succeeds for resolvable uuid", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT email") && s.includes("FROM users"),
        respond: { rows: [{ email: "user@x.de" }] } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "post", "/support/user-actions");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { body: { action: "resend_invite", reason: "long enough reason", user_id_masked: VALID_UUID } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.strictEqual(res._json.action, "resend_invite");
    assert.ok(pool.find("INSERT INTO support_audit_log").length >= 1);
  });

  it("404 USER_NOT_FOUND for resend_invite when user email missing", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT email") && s.includes("FROM users"), respond: { rows: [] } }
    ]);
    const handler = getHandler(createSupportRouter(makeDeps(pool)), "post", "/support/user-actions");
    const res = mockRes();
    await handler(mockReq(makeAgent(), { body: { action: "resend_invite", reason: "long enough reason", user_id_masked: VALID_UUID } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "USER_NOT_FOUND");
  });
});
