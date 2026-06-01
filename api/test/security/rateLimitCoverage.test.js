/**
 * G3.4 — Rate-Limit Coverage (WAVE_06 Security Audit)
 *
 * Verifiziert, dass Rate-Limiter tatsaechlich in den Middleware-Chains
 * der kritischen Routen verdrahtet sind.
 *
 * Strategie: Wir ersetzen den Limiter durch einen "alwaysBlock"-Mock (→ 429)
 * und pruefen, dass die Route 429 liefert. Wenn der Limiter NICHT verdrahtet
 * waere, wuerde die Route einen anderen Status (200/401/etc.) liefern.
 *
 * Abgedeckte Luecken (vor WAVE_06 nur apiLimiter — der GETs ueberspringt):
 *   - GET /invoices/export              ← requestLimiter
 *   - GET /invoices/operational/:id/export/csv ← requestLimiter
 *   - GET /admin/audit-log/export/csv   ← requestLimiter (nach requireAdmin)
 *   - POST /sso/callback                ← authLimiter
 *   - POST /worker-invites              ← requestLimiter (Email-Bomb-Schutz)
 *   - POST /worker-invites/:id/resend   ← requestLimiter (Email-Bomb-Schutz)
 *
 * Regression-Guards (vor WAVE_06 bereits korrekt verdrahtet):
 *   - POST /auth/login     ← authLimiter
 *   - POST /auth/register  ← authLimiter
 *
 * Run: node --test --test-force-exit api/test/security/rateLimitCoverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createInvoicesRouter } from "../../routes/invoices.js";
import { createAdminRouter } from "../../routes/admin.js";
import { createSSORouter } from "../../routes/sso.js";
import { createWorkersRouter } from "../../routes/workers.js";
import { createAuthRouter } from "../../routes/auth.js";

/* ── Mock-Infra ───────────────────────────────────────── */

function makePool(rows = []) {
  return { query: async () => ({ rows, rowCount: rows.length }) };
}

function makeLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, fatal() {} };
}

/** Limiter-Mock: blockiert immer mit 429. */
function alwaysBlock429(req, res, _next) {
  res.status(429).json({ error: "RATE_LIMIT", message: "Test: immer blockiert." });
}

/** Limiter-Mock: laesst immer durch. */
function alwaysAllow(_req, _res, next) { next(); }

/** requireAuth-Mock: erlaubt alle Requests mit userId in Session, blockiert sonst mit 401. */
function makeRequireAuth() {
  return (req, res, next) => {
    if (!req.session?.userId) return res.status(401).json({ error: "NOT_AUTHENTICATED" });
    next();
  };
}

/**
 * Minimaler Express-Router-Test-Adapter.
 * Ruft router.handle(req, res, next) auf und liefert { _status, _body }.
 */
async function hitRoute(router, { method = "GET", path, session = {}, body = {} } = {}) {
  return new Promise((resolve) => {
    const req = {
      method,
      path,
      url: path,
      session,
      orgRole: session.orgRole || null,
      orgMembership: session.orgMembership || null,
      orgId: session.orgId || null,
      body,
      query: {},
      params: extractParams(path),
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
    router.handle(req, res, (err) => {
      if (err) { res._status = 500; res._body = { error: String(err) }; }
      resolve(res);
    });
  });
}

/** Extrahiert einfache URL-Parameter (z.B. :id aus Pfad). */
function extractParams(path) {
  const segments = path.split("/");
  const params = {};
  // Fuer unsere Tests: vorletztes Segment als "id" wenn UUID-artig
  segments.forEach((seg, i) => {
    if (/^[0-9a-f-]{8,}$/i.test(seg) || /^\d+$/.test(seg)) {
      params.id = seg;
    }
  });
  return params;
}

/* ── Finance Exports ─────────────────────────────────── */

describe("G3.4: Finance-Export-Routen haben requestLimiter verdrahtet", () => {
  function makeInvoicesRouter({ useLimiter = alwaysBlock429 } = {}) {
    return createInvoicesRouter({
      pool: makePool([]),
      requireAuth: makeRequireAuth(),
      logger: makeLogger(),
      requestLimiter: useLimiter
    });
  }

  it("GET /invoices/export — requestLimiter ist in der Middleware-Chain (429 wenn blockiert)", async () => {
    const router = makeInvoicesRouter({ useLimiter: alwaysBlock429 });
    const res = await hitRoute(router, {
      method: "GET",
      path: "/invoices/export",
      session: { userId: "user-finance" }
    });
    assert.equal(res._status, 429,
      "GET /invoices/export muss requestLimiter haben — ohne Limiter kaeme 200 oder 403, nicht 429");
    assert.equal(res._body?.error, "RATE_LIMIT");
  });

  it("GET /invoices/export — kein 429 wenn Limiter erlaubt (apiLimiter=alwaysAllow)", async () => {
    // Dieser Test beweist, dass der Limiter der einzige Grund fuer 429 ist.
    // Mit alwaysAllow kommen wir durch den Limiter, scheitern aber ggf. am rperm oder DB — kein 429.
    const router = makeInvoicesRouter({ useLimiter: alwaysAllow });
    const res = await hitRoute(router, {
      method: "GET",
      path: "/invoices/export",
      session: { userId: "user-finance" }
    });
    assert.notEqual(res._status, 429,
      "Mit alwaysAllow-Limiter darf kein 429 kommen (Limiter ist nicht festgebacken)");
  });

  it("GET /invoices/operational/:id/export/csv — requestLimiter ist verdrahtet", async () => {
    const router = makeInvoicesRouter({ useLimiter: alwaysBlock429 });
    const res = await hitRoute(router, {
      method: "GET",
      path: "/invoices/operational/inv-0001/export/csv",
      session: { userId: "user-finance" }
    });
    assert.equal(res._status, 429,
      "GET /invoices/operational/:id/export/csv muss requestLimiter haben");
  });
});

/* ── Admin Audit Export ──────────────────────────────── */

describe("G3.4: Admin Audit-Log-Export hat requestLimiter verdrahtet", () => {
  function makeAdminRouterWithLimiter(limiter) {
    return createAdminRouter({
      pool: makePool([]),
      requireAuth: makeRequireAuth(),
      logger: makeLogger(),
      config: { ADMIN_PANEL_OPEN: false },
      getUserAndPlan: async (userId) => userId
        ? { id: userId, plan: "PLUS", org_id: "org-1", role: "company" }
        : null,
      requestLimiter: limiter
    });
  }

  it("GET /admin/audit-log/export/csv — requestLimiter blockiert (429) nach requireAdmin", async () => {
    const router = makeAdminRouterWithLimiter(alwaysBlock429);
    const res = await hitRoute(router, {
      method: "GET",
      path: "/admin/audit-log/export/csv",
      // session.userRole='admin' damit requireAdmin durchlaesst, dann trifft exportLimiter
      session: { userId: "admin-user", userRole: "admin" }
    });
    assert.equal(res._status, 429,
      "GET /admin/audit-log/export/csv muss exportLimiter nach requireAdmin haben");
  });

  it("GET /admin/audit-log/export/csv — requireAdmin blockt ZUERST (403 vor Limiter)", async () => {
    // Wenn requireAdmin blockiert, soll der Limiter NICHT aufgerufen werden.
    // Reihenfolge: requireAuth → requireAdmin → exportLimiter
    const router = makeAdminRouterWithLimiter(alwaysBlock429);
    const res = await hitRoute(router, {
      method: "GET",
      path: "/admin/audit-log/export/csv",
      session: { userId: "recruiter-user", userRole: "recruiter" }
    });
    assert.equal(res._status, 403,
      "requireAdmin muss VOR dem Limiter stehen — Recruiter bekommt 403, nicht 429");
    assert.equal(res._body?.error?.code, "ADMIN_REQUIRED");
  });
});

/* ── SSO Callback ────────────────────────────────────── */

describe("G3.4: SSO-Callback hat authLimiter verdrahtet", () => {
  function makeSSORouter(authLimiter) {
    return createSSORouter({
      pool: makePool([]),
      config: { BASE_URL: "http://localhost:8080", SSO_ENABLED: false },
      requireAuth: makeRequireAuth(),
      logger: makeLogger(),
      getUserAndPlan: async () => null,
      authLimiter
    });
  }

  it("POST /sso/callback — authLimiter ist verdrahtet (429 wenn blockiert)", async () => {
    const router = makeSSORouter(alwaysBlock429);
    const res = await hitRoute(router, {
      method: "POST",
      path: "/sso/callback",
      session: {},
      body: {}
    });
    assert.equal(res._status, 429,
      "POST /sso/callback muss authLimiter haben — Auth-Endpunkt darf nicht unlimitiert sein");
  });

  it("POST /sso/callback — kein 429 wenn Limiter durchlaesst", async () => {
    const router = makeSSORouter(alwaysAllow);
    const res = await hitRoute(router, {
      method: "POST",
      path: "/sso/callback",
      session: {},
      body: {}
    });
    assert.notEqual(res._status, 429,
      "alwaysAllow-Limiter darf keinen 429 erzeugen");
  });
});

/* ── Worker Invites (Email-Bomb-Schutz) ─────────────── */

describe("G3.4: Worker-Invite-Endpunkte haben requestLimiter (Email-Bomb-Schutz)", () => {
  function makeWorkersRouter(limiter) {
    return createWorkersRouter({
      pool: makePool([]),
      requireAuth: makeRequireAuth(),
      logger: makeLogger(),
      config: { BASE_URL: "http://localhost:8080" },
      getUserAndPlan: async (userId) => userId
        ? { id: userId, plan: "PLUS", org_id: "org-1", role: "company", features: { worker_management: true } }
        : null,
      requestLimiter: limiter,
      sendMail: async () => {}
    });
  }

  it("POST /worker-invites — inviteLimiter ist verdrahtet (429 wenn blockiert)", async () => {
    const router = makeWorkersRouter(alwaysBlock429);
    const res = await hitRoute(router, {
      method: "POST",
      path: "/worker-invites",
      session: { userId: "org-admin", orgId: "org-1" },
      body: { email: "test@example.com", first_name: "Max", last_name: "Muster" }
    });
    assert.equal(res._status, 429,
      "POST /worker-invites muss inviteLimiter haben — sonst Email-Bombing moeglich");
  });

  it("POST /worker-invites/:id/resend — inviteLimiter ist verdrahtet (429 wenn blockiert)", async () => {
    const router = makeWorkersRouter(alwaysBlock429);
    const res = await hitRoute(router, {
      method: "POST",
      path: "/worker-invites/inv-abc123/resend",
      session: { userId: "org-admin", orgId: "org-1" },
      body: {}
    });
    assert.equal(res._status, 429,
      "POST /worker-invites/:id/resend muss inviteLimiter haben — Resend ist besonders missbrauchsanfaellig");
  });
});

/* ── Regression Guards (bereits korrekt vor WAVE_06) ─── */

describe("G3.4: Regression — Auth-Routen haben authLimiter (unveraendert)", () => {
  function makeAuthRouter(authLimiter) {
    return createAuthRouter({
      pool: makePool([]),
      config: { BASE_URL: "http://localhost:8080", SESSION_SECRET: "test" },
      requireAuth: makeRequireAuth(),
      logger: makeLogger(),
      getUserAndPlan: async () => null,
      sendMail: async () => {},
      authLimiter
    });
  }

  it("POST /auth/login — authLimiter ist verdrahtet (Regression-Guard)", async () => {
    const router = makeAuthRouter(alwaysBlock429);
    const res = await hitRoute(router, {
      method: "POST",
      path: "/auth/login",
      session: {},
      body: { email: "test@example.com", password: "secret" }
    });
    assert.equal(res._status, 429,
      "POST /auth/login muss authLimiter haben — Brute-Force-Schutz darf nicht fehlen");
  });

  it("POST /auth/register — authLimiter ist verdrahtet (Regression-Guard)", async () => {
    const router = makeAuthRouter(alwaysBlock429);
    const res = await hitRoute(router, {
      method: "POST",
      path: "/auth/register",
      session: {},
      body: { email: "new@example.com", password: "secret123" }
    });
    assert.equal(res._status, 429,
      "POST /auth/register muss authLimiter haben");
  });
});
