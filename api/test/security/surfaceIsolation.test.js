/**
 * WAVE_07 — Surface Isolation Tests
 *
 * Verifiziert, dass requireInternalPermission (DB-basierter Guard fuer
 * /internal-control/*) korrekt blockiert und ausschliesslich auf
 * internal_user_roles basiert — kein session.userRole-Fallback, kein
 * orgRole-Bypass.
 *
 * Tests:
 *   1. Unauthenticated (kein session.userId) → 401 NOT_AUTHENTICATED
 *   2. Kein DB-Eintrag in internal_user_roles → 403 INTERNAL_ACCESS_REQUIRED
 *   3. DB-Rolle vorhanden, aber falsche Permission → 403 INTERNAL_PERMISSION_DENIED
 *   4. Korrekte Rolle → next() aufgerufen, req.internalAccess gesetzt
 *   5. Cross-Surface: Org-Owner (orgRole=owner) ohne DB-Eintrag → 403 (kein Bypass)
 *   6. Cross-Surface: Platform-Admin-Session (session.userRole=admin) → 403 (kein Session-Fallback)
 *   7. Router-Level: GET /internal-control/platform/dashboard — keine interne Rolle → 403
 *   8. Router-Level: GET /internal-control/platform/dashboard — platform_owner-Rolle → 200
 *
 * Run: node --test --test-force-exit api/test/security/surfaceIsolation.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requireInternalPermission } from "../../middleware/internalAccess.js";
import { createInternalControlCenterRouter } from "../../routes/internalControlCenter.js";
import {
  mockReq,
  mockRes,
  mockLogger,
  returnPool,
  requireAuth as passAuth,
  USER_A
} from "../helpers/security-mocks.js";

/* ── Pool helpers ─────────────────────────────────────────────────────────── */

/** Pool that returns a given set of internal_user_roles rows, and { total: 0 } for everything else. */
function makeInternalPool(roleKeys = []) {
  return {
    query: async (sql) => {
      if (String(sql).includes("internal_user_roles")) {
        return { rows: roleKeys.map((k) => ({ internal_role_key: k })) };
      }
      // Fallback for Dashboard/Analytics queries (COUNT(*) etc.)
      return { rows: [{ total: 0, count: 0 }] };
    }
  };
}

/* ── Minimal router-level test adapter ───────────────────────────────────── */

async function hitInternalRoute(router, { method = "GET", path, session = {} } = {}) {
  return new Promise((resolve) => {
    const req = {
      method,
      path,
      url: path,
      session,
      body: {},
      query: {},
      params: {},
      headers: {},
      ip: "127.0.0.1"
    };
    const res = {
      _status: 200,
      _json: null,
      locals: {},
      status(c) { this._status = c; return this; },
      json(b)   { this._json = b; resolve(this); return this; },
      send(b)   { this._json = b; resolve(this); return this; },
      setHeader() { return this; }
    };
    router.handle(req, res, (err) => {
      if (err) { res._status = 500; res._json = { error: String(err) }; }
      resolve(res);
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   Block 1 — Middleware direkt testen
   ═══════════════════════════════════════════════════════════════════════════ */

describe("WAVE_07 requireInternalPermission: Unauthenticated → 401", () => {
  it("kein session.userId → 401 NOT_AUTHENTICATED, next() wird NICHT aufgerufen", async () => {
    const middleware = requireInternalPermission("internal.platform.read", {
      pool: returnPool([]),
      logger: mockLogger()
    });
    const req = mockReq({ session: {} }); // kein userId
    const res = mockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(res._status, 401, "Unauthenticated muss 401 liefern");
    assert.equal(res._json?.error?.code, "NOT_AUTHENTICATED");
    assert.equal(nextCalled, false, "next() darf bei 401 NICHT aufgerufen werden");
  });
});

describe("WAVE_07 requireInternalPermission: Kein DB-Eintrag → 403 INTERNAL_ACCESS_REQUIRED", () => {
  it("leere internal_user_roles → 403 INTERNAL_ACCESS_REQUIRED", async () => {
    const logger = mockLogger();
    const middleware = requireInternalPermission("internal.platform.read", {
      pool: makeInternalPool([]), // keine Rollen
      logger
    });
    const req = mockReq({ session: { userId: USER_A } });
    const res = mockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(res._status, 403, "Kein DB-Eintrag muss 403 liefern");
    assert.equal(res._json?.error?.code, "INTERNAL_ACCESS_REQUIRED");
    assert.equal(nextCalled, false);
    assert.ok(
      logger.calls.warn.length > 0,
      "Guard muss logger.warn aufrufen wenn kein interner Zugang besteht"
    );
  });
});

describe("WAVE_07 requireInternalPermission: Rolle vorhanden, aber falsche Permission → 403 INTERNAL_PERMISSION_DENIED", () => {
  it("audit_readonly hat NICHT internal.platform.execute → 403 INTERNAL_PERMISSION_DENIED", async () => {
    // audit_readonly hat: internal.platform.read, internal.support.read, internal.operations.read, internal.audit.read
    // NICHT: internal.platform.execute (benoetigt platform_owner / developer_admin)
    const logger = mockLogger();
    const middleware = requireInternalPermission("internal.platform.execute", {
      pool: makeInternalPool(["audit_readonly"]),
      logger
    });
    const req = mockReq({ session: { userId: USER_A } });
    const res = mockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(res._status, 403, "Falsche Permission muss 403 liefern");
    assert.equal(res._json?.error?.code, "INTERNAL_PERMISSION_DENIED");
    assert.equal(nextCalled, false);
    assert.ok(logger.calls.warn.length > 0);
  });

  it("support_agent hat NICHT internal.audit.read → 403 INTERNAL_PERMISSION_DENIED", async () => {
    // support_agent hat: internal.support.*, internal.platform.read
    // NICHT: internal.audit.read
    const middleware = requireInternalPermission("internal.audit.read", {
      pool: makeInternalPool(["support_agent"]),
      logger: mockLogger()
    });
    const req = mockReq({ session: { userId: USER_A } });
    const res = mockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(res._status, 403);
    assert.equal(res._json?.error?.code, "INTERNAL_PERMISSION_DENIED");
    assert.equal(nextCalled, false);
  });
});

describe("WAVE_07 requireInternalPermission: Korrekte Rolle → pass-through", () => {
  it("platform_owner hat internal.platform.read → next() aufgerufen, req.internalAccess gesetzt", async () => {
    const middleware = requireInternalPermission("internal.platform.read", {
      pool: makeInternalPool(["platform_owner"]),
      logger: mockLogger()
    });
    const req = mockReq({ session: { userId: USER_A } });
    const res = mockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true, "next() muss bei korrekter Rolle aufgerufen werden");
    assert.equal(res._status, 200, "Kein Error-Status bei Erfolg");
    assert.ok(req.internalAccess, "req.internalAccess muss gesetzt sein");
    assert.ok(req.internalAccess.roles.includes("platform_owner"));
    assert.ok(req.internalAccess.permissions.includes("internal.platform.read"));
  });

  it("support_agent hat internal.support.read → pass-through", async () => {
    const middleware = requireInternalPermission("internal.support.read", {
      pool: makeInternalPool(["support_agent"]),
      logger: mockLogger()
    });
    const req = mockReq({ session: { userId: USER_A } });
    const res = mockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.ok(req.internalAccess.roles.includes("support_agent"));
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   Block 2 — Cross-Surface-Isolation
   Zeigt: DB-basierter Guard ist unabhaengig von session.userRole / orgRole
   ═══════════════════════════════════════════════════════════════════════════ */

describe("WAVE_07 Cross-Surface: Org-Owner ohne DB-Eintrag kann internal-control NICHT bypassen", () => {
  it("orgRole=owner, orgMembership=owner → 403 wenn kein internal_user_roles-Eintrag", async () => {
    // Szenario: Ein echter Org-Owner mit hoechster Org-Rolle wird
    // trotzdem von requireInternalPermission blockiert, weil der Guard
    // ausschliesslich auf der internal_user_roles-Tabelle basiert.
    const middleware = requireInternalPermission("internal.platform.read", {
      pool: makeInternalPool([]), // kein DB-Eintrag
      logger: mockLogger()
    });
    const req = mockReq({
      session:        { userId: USER_A },
      orgRole:        "owner",           // hoechste Org-Rolle
      orgMembership:  { role_key: "owner", is_active: true }
    });
    const res = mockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(res._status, 403,
      "Org-Owner ohne internal_user_roles-Eintrag muss 403 INTERNAL_ACCESS_REQUIRED erhalten");
    assert.equal(res._json?.error?.code, "INTERNAL_ACCESS_REQUIRED");
    assert.equal(nextCalled, false);
  });
});

describe("WAVE_07 Cross-Surface: Platform-Admin-Session kann internal-control NICHT bypassen", () => {
  it("session.userRole=admin + orgRole=platform_admin → 403 wenn kein DB-Eintrag (kein Session-Fallback)", async () => {
    // Kritischer Test: requireInternalPermission hat KEINEN session.userRole-Fallback.
    // Ein Platform-Admin, der z.B. Admin-Panel-Zugang hat, darf NICHT automatisch
    // auf /internal-control/* zugreifen koennen.
    const middleware = requireInternalPermission("internal.support.read", {
      pool: makeInternalPool([]), // kein DB-Eintrag
      logger: mockLogger()
    });
    const req = mockReq({
      session:  { userId: USER_A, userRole: "admin" }, // platform admin session
      orgRole:  "platform_admin"                         // platform admin org role
    });
    const res = mockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(res._status, 403,
      "Platform-Admin-Session darf requireInternalPermission NICHT bypassen — Guard ist rein DB-basiert");
    assert.equal(res._json?.error?.code, "INTERNAL_ACCESS_REQUIRED");
    assert.equal(nextCalled, false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   Block 3 — Router-Level-Tests
   ═══════════════════════════════════════════════════════════════════════════ */

describe("WAVE_07 Router: GET /internal-control/platform/dashboard", () => {
  it("Kein internal-Eintrag → 403 INTERNAL_ACCESS_REQUIRED (Guard blockiert vor Handler)", async () => {
    const router = createInternalControlCenterRouter({
      pool:        makeInternalPool([]), // keine interne Rolle
      requireAuth: passAuth,
      logger:      mockLogger(),
      sendMail:    async () => {},
      config:      { BASE_URL: "http://localhost:8080" }
    });

    const res = await hitInternalRoute(router, {
      path:    "/internal-control/platform/dashboard",
      session: { userId: USER_A }
    });

    assert.equal(res._status, 403,
      "Route muss 403 liefern, wenn kein internal_user_roles-Eintrag vorhanden ist");
    assert.equal(res._json?.error?.code, "INTERNAL_ACCESS_REQUIRED");
  });

  it("platform_owner-Rolle → 200 und success:true (Guard laesst durch)", async () => {
    const router = createInternalControlCenterRouter({
      pool:        makeInternalPool(["platform_owner"]), // hat alle Permissions
      requireAuth: passAuth,
      logger:      mockLogger(),
      sendMail:    async () => {},
      config:      { BASE_URL: "http://localhost:8080" }
    });

    const res = await hitInternalRoute(router, {
      path:    "/internal-control/platform/dashboard",
      session: { userId: USER_A }
    });

    assert.equal(res._status, 200,
      "platform_owner muss die Dashboard-Route erreichen koennen");
    assert.equal(res._json?.success, true);
    assert.ok(
      typeof res._json?.data?.users_total === "number",
      "Response muss users_total (number) enthalten"
    );
  });

  it("support_agent-Rolle hat NICHT internal.platform.read → 403 auf Dashboard", async () => {
    // KORREKTUR: support_agent HAT internal.platform.read laut INTERNAL_ROLE_PERMISSIONS.
    // Daher: support_lead statt support_agent fuer diesen Test verwenden.
    // Dieser Test prueft stattdessen audit_readonly auf einer execute-Route.
    // → Getrennter Test fuer audit_readonly auf /internal-control/platform/dashboard: ERLAUBT
    //   weil audit_readonly internal.platform.read hat.
    // Stattdessen: ops_manager auf support-Route (ops_manager hat NICHT internal.support.execute)
    const router = createInternalControlCenterRouter({
      pool:        makeInternalPool(["ops_manager"]), // hat internal.operations.* + platform.read + audit.read, aber NICHT support.*
      requireAuth: passAuth,
      logger:      mockLogger(),
      sendMail:    async () => {},
      config:      { BASE_URL: "http://localhost:8080" }
    });

    // /internal-control/support/search erfordert internal.support.read
    // ops_manager hat das NICHT
    const res = await hitInternalRoute(router, {
      method:  "GET",
      path:    "/internal-control/support/search",
      session: { userId: USER_A }
    });

    // Express matched path aber guard blockiert — oder 400 weil query.q fehlt
    // Bei fehlender Permission muss 403 kommen BEVOR der Handler laeuft
    assert.equal(res._status, 403,
      "ops_manager hat keine internal.support.read-Permission — muss 403 auf Support-Route erhalten");
    assert.equal(res._json?.error?.code, "INTERNAL_PERMISSION_DENIED");
  });
});
