/**
 * G1.5 — Admin/Staff/OCC Surface-Isolation (Security)
 *
 * Verifiziert:
 *   1. Alle /admin/* Routen liefern 403 fuer nicht-Admin-Rollen (company user, recruiter, viewer)
 *   2. /admin/control-center hat jetzt requireAdmin (Regression-Guard fuer gefundene Luecke)
 *   3. SCC-Routen liefern 401 ohne staffUserId (komplett separate Session)
 *   4. ADMIN_PANEL_OPEN=false loesst keine Bypass-Pfade aus
 *   5. requireAdmin erlaubt owner, admin, platform_admin — blockiert alles andere
 *
 * Run: node --test --test-force-exit api/test/security/adminRoutes.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAdminRouter } from "../../routes/admin.js";
import { createStaffControlAccessMiddleware } from "../../middleware/staffControlAccess.js";

/* ── Mock-Infra ───────────────────────────────────────── */

function makePool(rows = []) {
  return { query: async () => ({ rows, rowCount: rows.length }) };
}

function makeLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, fatal() {} };
}

/** Baut einen minimalen Router und fragt eine Route ab. */
async function hitRoute(router, { method = "GET", path, session = {} } = {}) {
  return new Promise((resolve) => {
    const req = {
      method,
      path,
      url: path,
      session,
      orgRole: session.orgRole || null,
      orgMembership: session.orgMembership || null,
      body: {},
      query: {},
      params: {},
      headers: {},
      ip: "127.0.0.1"
    };
    const res = {
      _status: 200,
      _body: null,
      status(c) { this._status = c; return this; },
      json(b) { this._body = b; resolve(this); return this; },
      send(b) { this._body = b; resolve(this); return this; },
      setHeader() { return this; }
    };
    // Express router.handle(req, res, next)
    router.handle(req, res, (err) => {
      if (err) { res._status = 500; res._body = { error: String(err) }; }
      resolve(res);
    });
  });
}

/** Erstellt den Admin-Router mit ADMIN_PANEL_OPEN=false (Production-Modus). */
function makeAdminRouter({ adminPanelOpen = false, orgRole = null } = {}) {
  const pool = makePool();
  const logger = makeLogger();

  async function getUserAndPlan(userId) {
    return userId ? { id: userId, plan: "PLUS", org_id: "org-1", role: "company", org_role: orgRole } : null;
  }

  return createAdminRouter({
    pool,
    requireAuth: (req, res, next) => {
      if (!req.session?.userId) return res.status(401).json({ error: "NOT_AUTHENTICATED" });
      next();
    },
    logger,
    config: { ADMIN_PANEL_OPEN: adminPanelOpen },
    getUserAndPlan
  });
}

/* ── 1. requireAdmin Whitelist ────────────────────────── */

describe("G1.5: requireAdmin — Whitelist (owner/admin/platform_admin)", () => {
  const ADMIN_ROUTES = [
    "/admin/users",
    "/admin/organizations",
    "/admin/requests",
    "/admin/audit-log",
    "/admin/metrics",
    "/admin/revenue",
    "/admin/system-health",
    "/admin/visibility-audit",
    "/admin/feature-overrides",
    "/admin/feature-keys",
    "/admin/activity-feed"
  ];

  it("company-User (recruiter) bekommt 403 auf allen Admin-Routen", async () => {
    const router = makeAdminRouter({ orgRole: "recruiter" });
    for (const path of ADMIN_ROUTES) {
      const res = await hitRoute(router, {
        path,
        session: { userId: "user-1", orgRole: "recruiter" }
      });
      assert.equal(res._status, 403,
        `Erwartet 403 fuer recruiter auf ${path}, bekam ${res._status}`);
      assert.equal(res._body?.success, false);
      assert.equal(res._body?.error?.code, "ADMIN_REQUIRED");
    }
  });

  it("company-User (viewer) bekommt 403 auf allen Admin-Routen", async () => {
    const router = makeAdminRouter({ orgRole: "viewer" });
    for (const path of ADMIN_ROUTES) {
      const res = await hitRoute(router, {
        path,
        session: { userId: "user-2", orgRole: "viewer" }
      });
      assert.equal(res._status, 403,
        `Erwartet 403 fuer viewer auf ${path}, bekam ${res._status}`);
    }
  });

  it("hiring_manager bekommt 403 auf allen Admin-Routen", async () => {
    const router = makeAdminRouter({ orgRole: "hiring_manager" });
    for (const path of ADMIN_ROUTES) {
      const res = await hitRoute(router, {
        path,
        session: { userId: "user-3", orgRole: "hiring_manager" }
      });
      assert.equal(res._status, 403,
        `Erwartet 403 fuer hiring_manager auf ${path}, bekam ${res._status}`);
    }
  });

  /*
   * Diese beiden Proben pruefen den TORWAECHTER, nicht eine bestimmte Route.
   *
   * Bis 2026-08-21 taten sie das ueber /admin/visibility-audit, ausdruecklich
   * weil diese Route "ausschliesslich requireAdmin als Gate" hatte. Damit hing
   * die Probe daran, welche Route zufaellig KEINE zweite Pruefung besitzt — und
   * sie brach, als 8.1.1 (d) genau dort eine zweite Pruefung einzog
   * (Plattformkonfiguration gehoert nicht auf eine Kundenflaeche).
   *
   * Die Aussage bleibt unveraendert: `requireAdmin` laesst `owner` und `admin`
   * durch, auch ueber den Legacy-Pfad `session.userRole`. Geprueft wird sie
   * jetzt am Waechter selbst, nicht an einer Route — damit kann keine kuenftige
   * Scope-Haertung sie wieder sproede machen.
   *
   * Was die Routen DAHINTER dann noch pruefen, ist Sache der Routen-Tests
   * (`admin.route.coverage.test.js`) — und genau diese Trennung fehlte hier.
   */
  function requireAdminAus(router) {
    // requireAdmin steht auf jeder Route als vorletzte Schicht vor dem Handler.
    for (const layer of router.stack) {
      if (!layer.route || layer.route.path !== "/admin/users") continue;
      const stack = layer.route.stack;
      return stack[stack.length - 2].handle;
    }
    throw new Error("Route /admin/users nicht gefunden");
  }

  function torPassiert(session, orgRole = null) {
    const guard = requireAdminAus(makeAdminRouter({ orgRole }));
    let durchgelassen = false;
    let status = 200;
    guard(
      { session, orgRole, orgMembership: null, path: "/admin/users", headers: {} },
      { status(c) { status = c; return this; }, json() { return this; } },
      () => { durchgelassen = true; }
    );
    return { durchgelassen, status };
  }

  it("owner passiert requireAdmin (Whitelist via session.userRole-Fallback)", () => {
    const { durchgelassen } = torPassiert({ userId: "user-owner", userRole: "owner" });
    assert.equal(durchgelassen, true, "owner muss requireAdmin passieren");
  });

  it("admin-Rolle passiert requireAdmin (via session.userRole-Fallback)", () => {
    const { durchgelassen } = torPassiert({ userId: "user-admin", userRole: "admin" });
    assert.equal(durchgelassen, true, "admin muss requireAdmin passieren");
  });

  it("die Whitelist ist nicht offen — eine fremde Rolle passiert nicht", () => {
    /* Gegenprobe: ohne sie koennte `torPassiert` immer true liefern und beide
     * Proben darueber waeren still gruen. */
    const { durchgelassen, status } = torPassiert({ userId: "user-x", userRole: "recruiter" });
    assert.equal(durchgelassen, false, "recruiter darf requireAdmin nicht passieren");
    assert.equal(status, 403);
  });
});

/* ── 2. /admin/control-center Regression-Guard ────────── */

describe("G1.5: /admin/control-center — requireAdmin (Regression-Guard)", () => {
  it("recruiter bekommt 403 auf /admin/control-center", async () => {
    const router = makeAdminRouter({ orgRole: "recruiter" });
    const res = await hitRoute(router, {
      path: "/admin/control-center",
      session: { userId: "user-rec", orgRole: "recruiter" }
    });
    assert.equal(res._status, 403,
      "/admin/control-center muss requireAdmin haben — recruiter darf keinen Zugriff bekommen");
    assert.equal(res._body?.error?.code, "ADMIN_REQUIRED");
  });

  it("member bekommt 403 auf /admin/control-center", async () => {
    const router = makeAdminRouter({ orgRole: "member" });
    const res = await hitRoute(router, {
      path: "/admin/control-center",
      session: { userId: "user-mem", orgRole: "member" }
    });
    assert.equal(res._status, 403);
  });

  it("Unauthenticated bekommt 401 (nicht 200 oder 500)", async () => {
    const router = makeAdminRouter();
    const res = await hitRoute(router, {
      path: "/admin/control-center",
      session: {} // kein userId
    });
    assert.equal(res._status, 401);
  });
});

/* ── 3. ADMIN_PANEL_OPEN=false — kein Bypass ─────────── */

describe("G1.5: ADMIN_PANEL_OPEN=false — kein Bypass fuer normale User", () => {
  it("ADMIN_PANEL_OPEN=false: recruiter bekommt weiterhin 403", async () => {
    const router = makeAdminRouter({ adminPanelOpen: false, orgRole: "recruiter" });
    const res = await hitRoute(router, {
      path: "/admin/users",
      session: { userId: "user-bypass-test", orgRole: "recruiter" }
    });
    assert.equal(res._status, 403,
      "ADMIN_PANEL_OPEN=false darf keinen Bypass ausloesen");
  });

  it("ADMIN_PANEL_OPEN=true: Bypass ist im Env dokumentiert (NICHT fuer Prod)", async () => {
    // ADMIN_PANEL_OPEN=true ist ein Dev-Bypass. Dieser Test dokumentiert, dass:
    //   1) In unserem laufenden Docker-Container ist ADMIN_PANEL_OPEN=false (korrekt)
    //   2) Der Bypass existiert im Code — muss aktiv ueberwacht werden (nie in Prod=true)
    // Wir pruefen den Nicht-Bypass-Fall: ADMIN_PANEL_OPEN=false blockiert recruiter weiterhin.
    const router = makeAdminRouter({ adminPanelOpen: false });
    const res = await hitRoute(router, {
      path: "/admin/users",
      session: { userId: "user-prod-check", userRole: "recruiter" }
    });
    assert.equal(res._status, 403,
      "ADMIN_PANEL_OPEN=false (Production-Standard): recruiter muss geblockt werden");
  });
});

/* ── 4. SCC Guard — komplett separate Session ────────── */

describe("G1.5: SCC Guard — 401 ohne staffUserId (separate Session)", () => {
  it("normaler API-Request ohne staffUserId → 401 SCC_NOT_AUTHENTICATED", async () => {
    const sccGuard = createStaffControlAccessMiddleware({
      pool: makePool([]),
      logger: makeLogger()
    });

    const result = await new Promise((resolve) => {
      const req = { session: {}, path: "/staff/api/test" };
      const res = {
        _status: null,
        _body: null,
        status(c) { this._status = c; return this; },
        json(b) { this._body = b; resolve(this); return this; }
      };
      sccGuard(req, res, () => resolve({ _status: 200 }));
    });

    assert.equal(result._status, 401);
    assert.equal(result._body?.error?.code, "SCC_NOT_AUTHENTICATED");
  });

  it("normale Platform-Session (userId gesetzt, kein staffUserId) → 401", async () => {
    const sccGuard = createStaffControlAccessMiddleware({
      pool: makePool([]),
      logger: makeLogger()
    });

    const result = await new Promise((resolve) => {
      const req = {
        // Normale Platform-Session — hat userId aber KEIN staffUserId
        session: { userId: "platform-user-123" },
        path: "/staff/api/customers"
      };
      const res = {
        _status: null, _body: null,
        status(c) { this._status = c; return this; },
        json(b) { this._body = b; resolve(this); return this; }
      };
      sccGuard(req, res, () => resolve({ _status: 200 }));
    });

    assert.equal(result._status, 401,
      "Platform-Session (userId ohne staffUserId) muss SCC-401 liefern");
    assert.equal(result._body?.error?.code, "SCC_NOT_AUTHENTICATED");
  });

  it("staffUserId gesetzt, aber nicht in tempconnect_staff → 403 SCC_NOT_AUTHORIZED", async () => {
    const sccGuard = createStaffControlAccessMiddleware({
      pool: makePool([]), // Leere Tabelle → kein Staff-Eintrag
      logger: makeLogger()
    });

    const result = await new Promise((resolve) => {
      const req = {
        session: { staffUserId: "unknown-staff-id" },
        path: "/staff/api/customers"
      };
      const res = {
        _status: null, _body: null,
        status(c) { this._status = c; return this; },
        json(b) { this._body = b; resolve(this); return this; }
      };
      sccGuard(req, res, () => resolve({ _status: 200 }));
    });

    assert.equal(result._status, 403,
      "Unbekannter staffUserId muss 403 SCC_NOT_AUTHORIZED liefern");
    assert.equal(result._body?.error?.code, "SCC_NOT_AUTHORIZED");
  });
});

/* ── 5. Admin-Route vollständigkeit ─────────────────── */

describe("G1.5: Admin-Routen-Vollstaendigkeit — alle kritischen Routen haben Guard", () => {
  const CRITICAL_ROUTES = [
    "/admin/control-center",    // war die Luecke — jetzt gefixed
    "/admin/users",
    "/admin/organizations",
    "/admin/audit-log",
    "/admin/metrics",
    "/admin/revenue",
    "/admin/system-health",
    "/admin/audit-log/export/csv",
    "/admin/feature-overrides"
  ];

  it("Alle kritischen Admin-Routen blockieren Zugriff fuer dispatcher", async () => {
    const router = makeAdminRouter({ orgRole: "dispatcher" });
    let allBlocked = true;
    for (const path of CRITICAL_ROUTES) {
      const res = await hitRoute(router, {
        path,
        session: { userId: "disp-user", orgRole: "dispatcher" }
      });
      if (res._status !== 403) {
        allBlocked = false;
        assert.fail(`Route ${path} blockiert dispatcher NICHT (Status: ${res._status})`);
      }
    }
    assert.ok(allBlocked, "Alle kritischen Routen sollen dispatcher mit 403 abweisen");
  });
});
