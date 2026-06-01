/**
 * Notifications API – type/severity filter & RBAC tests.
 * Uses mock pool — no database required.
 *
 * Run: node --test --test-force-exit test/notifications-filter.test.js
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createNotificationsRouter } from "../routes/notifications.js";

// ── Mock helpers ────────────────────────────────────────────

function mockPool() {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("COUNT")) return { rows: [{ unread: 3, count: 3 }], rowCount: 1 };
      if (sql.includes("UPDATE")) return { rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }
  };
}

function mockReq(query = {}, session = { userId: "user-1" }) {
  return { query, session, orgId: null, params: {}, body: {} };
}

function mockRes() {
  let _status = 200;
  let _data = null;
  return {
    locals: {},
    status(code) { _status = code; return this; },
    json(data) { _data = data; return this; },
    get _status() { return _status; },
    get _data() { return _data; }
  };
}

function requireAuth(req, res, next) { next(); }

// ═══════════════════════════════════════════════════════════════
// Type filter
// ═══════════════════════════════════════════════════════════════

describe("GET /api/notifications — type filter", () => {
  let pool;

  beforeEach(() => { pool = mockPool(); });

  it("passes type filter as ANY($x::text[]) when provided", async () => {
    const router = createNotificationsRouter({ pool, requireAuth });
    const handler = router.stack.find(l => l.route && l.route.path === "/notifications" && l.route.methods.get).route.stack[1].handle;

    const req = mockReq({ type: "offer_received,deal_confirmed" });
    const res = mockRes();
    await handler(req, res);

    // First query is the SELECT, second is the COUNT
    const selectCall = pool.calls[0];
    assert.ok(selectCall.sql.includes("n.type = ANY("), "Should include type filter in SQL");
    // params should contain the types array
    const typesParam = selectCall.params.find(p => Array.isArray(p));
    assert.deepStrictEqual(typesParam, ["offer_received", "deal_confirmed"]);
  });

  it("omits type filter when not provided", async () => {
    const router = createNotificationsRouter({ pool, requireAuth });
    const handler = router.stack.find(l => l.route && l.route.path === "/notifications" && l.route.methods.get).route.stack[1].handle;

    const req = mockReq({});
    const res = mockRes();
    await handler(req, res);

    const selectCall = pool.calls[0];
    assert.ok(!selectCall.sql.includes("n.type = ANY("), "Should NOT include type filter when not provided");
  });

  it("handles single type value", async () => {
    const router = createNotificationsRouter({ pool, requireAuth });
    const handler = router.stack.find(l => l.route && l.route.path === "/notifications" && l.route.methods.get).route.stack[1].handle;

    const req = mockReq({ type: "compliance_expiring" });
    const res = mockRes();
    await handler(req, res);

    const selectCall = pool.calls[0];
    const typesParam = selectCall.params.find(p => Array.isArray(p));
    assert.deepStrictEqual(typesParam, ["compliance_expiring"]);
  });
});

// ═══════════════════════════════════════════════════════════════
// Severity filter
// ═══════════════════════════════════════════════════════════════

describe("GET /api/notifications — severity filter", () => {
  let pool;

  beforeEach(() => { pool = mockPool(); });

  it("passes severity filter when provided", async () => {
    const router = createNotificationsRouter({ pool, requireAuth });
    const handler = router.stack.find(l => l.route && l.route.path === "/notifications" && l.route.methods.get).route.stack[1].handle;

    const req = mockReq({ severity: "warning" });
    const res = mockRes();
    await handler(req, res);

    const selectCall = pool.calls[0];
    assert.ok(selectCall.sql.includes("n.severity ="), "Should include severity filter in SQL");
    assert.ok(selectCall.params.includes("warning"));
  });
});

// ═══════════════════════════════════════════════════════════════
// RBAC – user_id scoping
// ═══════════════════════════════════════════════════════════════

describe("GET /api/notifications — RBAC user_id scoping", () => {
  let pool;

  beforeEach(() => { pool = mockPool(); });

  it("always scopes query to session userId", async () => {
    const router = createNotificationsRouter({ pool, requireAuth });
    const handler = router.stack.find(l => l.route && l.route.path === "/notifications" && l.route.methods.get).route.stack[1].handle;

    const req = mockReq({}, { userId: "user-xyz" });
    const res = mockRes();
    await handler(req, res);

    const selectCall = pool.calls[0];
    assert.ok(selectCall.sql.includes("n.user_id = $1"), "Should always filter by user_id");
    assert.strictEqual(selectCall.params[0], "user-xyz", "First param should be session userId");
  });

  it("cannot access other user's notifications by injecting user_id", async () => {
    const router = createNotificationsRouter({ pool, requireAuth });
    const handler = router.stack.find(l => l.route && l.route.path === "/notifications" && l.route.methods.get).route.stack[1].handle;

    // Attacker tries to pass a different user_id — it should be ignored
    const req = mockReq({ user_id: "attacker-id" }, { userId: "user-1" });
    const res = mockRes();
    await handler(req, res);

    const selectCall = pool.calls[0];
    assert.strictEqual(selectCall.params[0], "user-1", "Should use session userId, not query param");
    assert.ok(!selectCall.params.includes("attacker-id"), "Attacker ID should not appear in params");
  });
});

// ═══════════════════════════════════════════════════════════════
// Combined filters
// ═══════════════════════════════════════════════════════════════

describe("GET /api/notifications — combined filters", () => {
  let pool;

  beforeEach(() => { pool = mockPool(); });

  it("applies type + severity + unread filters together", async () => {
    const router = createNotificationsRouter({ pool, requireAuth });
    const handler = router.stack.find(l => l.route && l.route.path === "/notifications" && l.route.methods.get).route.stack[1].handle;

    const req = mockReq({ type: "offer_received", severity: "info", unread: "true" });
    const res = mockRes();
    await handler(req, res);

    const selectCall = pool.calls[0];
    assert.ok(selectCall.sql.includes("n.user_id = $1"), "Has user_id filter");
    assert.ok(selectCall.sql.includes("n.is_read = FALSE"), "Has unread filter");
    assert.ok(selectCall.sql.includes("n.type = ANY("), "Has type filter");
    assert.ok(selectCall.sql.includes("n.severity ="), "Has severity filter");
  });

  it("returns JSON with items array", async () => {
    const router = createNotificationsRouter({ pool, requireAuth });
    const handler = router.stack.find(l => l.route && l.route.path === "/notifications" && l.route.methods.get).route.stack[1].handle;

    const req = mockReq({});
    const res = mockRes();
    await handler(req, res);

    assert.ok(Array.isArray(res._data.items), "Response should have items array");
    assert.strictEqual(typeof res._data.unread_count, "number", "Response should have unread_count");
  });
});
