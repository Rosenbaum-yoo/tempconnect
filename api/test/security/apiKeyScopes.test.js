/**
 * API Key Scope Enforcement — Invoice Routes
 *
 * Beweist, dass requireScope() tatsaechlich in den Middleware-Chains
 * der Finance-Routen verdrahtet ist und Scope-Verletzungen mit 403 ablehnt.
 *
 * Strategie: requireAuth wird als noop uebergeben (simuliert erfolgreiche Auth).
 * Statt Auth-Mocks werden direkt req.isApiKeyAuth + req.apiKeyScopes gesetzt —
 * requireScope liest diese Felder und trifft seine Entscheidung, bevor die DB befragt wird.
 *
 * Abgedeckte Routen (erste Welle Scope-Enforcement):
 *   GET  /invoices              ← read:invoices
 *   GET  /invoices/export       ← read:invoices
 *   GET  /invoices/:id          ← read:invoices
 *   POST /invoices/:id/void     ← write:invoices
 *   POST /invoices/:id/paid     ← write:invoices
 *
 * Run: node --test --test-force-exit api/test/security/apiKeyScopes.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createInvoicesRouter } from "../../routes/invoices.js";

/* ── Shared test infra ──────────────────────────────────── */

function makePool() {
  return { query: async () => ({ rows: [], rowCount: 0 }) };
}

function makeLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, fatal() {} };
}

/** requireAuth noop — assumes auth already succeeded upstream. */
function alwaysPassAuth(_req, _res, next) { next(); }

function makeInvoicesRouter() {
  return createInvoicesRouter({
    pool: makePool(),
    requireAuth: alwaysPassAuth,
    logger: makeLogger()
  });
}

/**
 * Hits a route on the given router with fine-grained control over API-key fields.
 * @param {object} router
 * @param {object} opts
 * @param {string} opts.method
 * @param {string} opts.path
 * @param {boolean} [opts.isApiKeyAuth=false]
 * @param {string[]} [opts.apiKeyScopes=[]]
 * @param {object} [opts.session={}]
 * @param {string|null} [opts.orgId=null]
 */
async function hitRoute(router, { method = "GET", path, isApiKeyAuth = false, apiKeyScopes = [], session = {}, orgId = null } = {}) {
  return new Promise((resolve) => {
    const req = {
      method,
      path,
      url: path,
      isApiKeyAuth,
      apiKeyScopes,
      orgId,
      session,
      body: {},
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

function extractParams(path) {
  const params = {};
  path.split("/").forEach((seg) => {
    if (/^[0-9a-f-]{8,}$/i.test(seg) || /^\d+$/.test(seg)) {
      params.id = seg;
    }
  });
  return params;
}

/* ── GET /invoices ──────────────────────────────────────── */

describe("Scope enforcement: GET /invoices", () => {
  it("API-Key ohne read:invoices → 403 SCOPE_INSUFFICIENT", async () => {
    const router = makeInvoicesRouter();
    const res = await hitRoute(router, {
      method: "GET",
      path: "/invoices",
      isApiKeyAuth: true,
      apiKeyScopes: ["write:timesheets"]
    });
    assert.equal(res._status, 403, "Kein read:invoices muss 403 liefern");
    assert.equal(res._body?.error?.code, "SCOPE_INSUFFICIENT");
  });

  it("API-Key mit leeren Scopes → 403 (kein Vollzugriff mehr)", async () => {
    const router = makeInvoicesRouter();
    const res = await hitRoute(router, {
      method: "GET",
      path: "/invoices",
      isApiKeyAuth: true,
      apiKeyScopes: []
    });
    assert.equal(res._status, 403, "Leere Scopes duerfen keinen Vollzugriff gewaehren");
  });

  it("API-Key mit read:invoices kommt durch Scope-Check", async () => {
    const router = makeInvoicesRouter();
    const res = await hitRoute(router, {
      method: "GET",
      path: "/invoices",
      isApiKeyAuth: true,
      apiKeyScopes: ["read:invoices"],
      orgId: "org-1"
    });
    // Scope-Check passiert; DB-Aufruf liefert leere Liste → 200 mit {items:[]}
    assert.notEqual(res._status, 403, "read:invoices muss den Scope-Check bestehen");
  });

  it("Session-User umgeht Scope-Check vollstaendig", async () => {
    const router = makeInvoicesRouter();
    const res = await hitRoute(router, {
      method: "GET",
      path: "/invoices",
      isApiKeyAuth: false,  // Session-Auth
      apiKeyScopes: [],     // keine Scopes (irrelevant fuer Session)
      session: { userId: "user-session-1" },
      orgId: "org-1"
    });
    assert.notEqual(res._status, 403, "Session-User darf nicht am Scope-Check scheitern");
  });
});

/* ── GET /invoices/export ───────────────────────────────── */

describe("Scope enforcement: GET /invoices/export", () => {
  it("API-Key ohne read:invoices → 403", async () => {
    const router = makeInvoicesRouter();
    const res = await hitRoute(router, {
      method: "GET",
      path: "/invoices/export",
      isApiKeyAuth: true,
      apiKeyScopes: ["write:timesheets"]
    });
    assert.equal(res._status, 403);
    assert.equal(res._body?.error?.code, "SCOPE_INSUFFICIENT");
  });

  it("Session-User kommt durch Scope-Check (scheitert ggf. an RBAC, nicht Scope)", async () => {
    const router = makeInvoicesRouter();
    const res = await hitRoute(router, {
      method: "GET",
      path: "/invoices/export",
      isApiKeyAuth: false,
      session: { userId: "user-finance" },
      orgId: "org-1"
    });
    // RBAC kann 403 liefern — aber nie SCOPE_INSUFFICIENT fuer Session-User
    const isScopeError = res._body?.error?.code === "SCOPE_INSUFFICIENT";
    assert.ok(!isScopeError, "Session-User darf nicht am Scope-Check scheitern");
  });
});

/* ── GET /invoices/:id ──────────────────────────────────── */

describe("Scope enforcement: GET /invoices/:id", () => {
  it("API-Key ohne read:invoices → 403", async () => {
    const router = makeInvoicesRouter();
    const res = await hitRoute(router, {
      method: "GET",
      path: "/invoices/00000000-0000-0000-0000-000000000001",
      isApiKeyAuth: true,
      apiKeyScopes: ["write:requisitions"]
    });
    assert.equal(res._status, 403);
    assert.equal(res._body?.error?.code, "SCOPE_INSUFFICIENT");
  });

  it("API-Key mit write:invoices impliziert read:invoices (kommt durch)", async () => {
    const router = makeInvoicesRouter();
    const res = await hitRoute(router, {
      method: "GET",
      path: "/invoices/00000000-0000-0000-0000-000000000001",
      isApiKeyAuth: true,
      apiKeyScopes: ["write:invoices"],
      orgId: "org-1"
    });
    // write:invoices impliziert read:invoices laut hasScope-Logik
    assert.notEqual(res._status, 403, "write:invoices muss read:invoices implizieren");
  });
});

/* ── POST /invoices/:id/void ────────────────────────────── */

describe("Scope enforcement: POST /invoices/:id/void", () => {
  it("API-Key ohne write:invoices → 403", async () => {
    const router = makeInvoicesRouter();
    const res = await hitRoute(router, {
      method: "POST",
      path: "/invoices/00000000-0000-0000-0000-000000000001/void",
      isApiKeyAuth: true,
      apiKeyScopes: ["read:invoices"]
    });
    assert.equal(res._status, 403);
    assert.equal(res._body?.error?.code, "SCOPE_INSUFFICIENT");
  });

  it("API-Key mit write:invoices kommt durch Scope-Check", async () => {
    const router = makeInvoicesRouter();
    const res = await hitRoute(router, {
      method: "POST",
      path: "/invoices/00000000-0000-0000-0000-000000000001/void",
      isApiKeyAuth: true,
      apiKeyScopes: ["write:invoices"],
      orgId: "org-1",
      session: {}
    });
    // Scope-Check bestanden; scheitert ggf. an RBAC oder DB-Lookup — aber nicht 403 SCOPE_INSUFFICIENT
    const isScopeError = res._body?.error?.code === "SCOPE_INSUFFICIENT";
    assert.ok(!isScopeError, "write:invoices darf nicht am Scope-Check scheitern");
  });

  it("Session-User umgeht Scope-Check bei POST void", async () => {
    const router = makeInvoicesRouter();
    const res = await hitRoute(router, {
      method: "POST",
      path: "/invoices/00000000-0000-0000-0000-000000000001/void",
      isApiKeyAuth: false,
      session: { userId: "billing-admin" },
      orgId: "org-1"
    });
    const isScopeError = res._body?.error?.code === "SCOPE_INSUFFICIENT";
    assert.ok(!isScopeError, "Session-User darf nicht am Scope-Check scheitern");
  });
});

/* ── POST /invoices/:id/paid ────────────────────────────── */

describe("Scope enforcement: POST /invoices/:id/paid", () => {
  it("API-Key ohne write:invoices → 403", async () => {
    const router = makeInvoicesRouter();
    const res = await hitRoute(router, {
      method: "POST",
      path: "/invoices/00000000-0000-0000-0000-000000000001/paid",
      isApiKeyAuth: true,
      apiKeyScopes: ["read:invoices"]
    });
    assert.equal(res._status, 403);
    assert.equal(res._body?.error?.code, "SCOPE_INSUFFICIENT");
  });

  it("API-Key mit admin-Scope hat implizit alle Scopes (kommt durch)", async () => {
    const router = makeInvoicesRouter();
    const res = await hitRoute(router, {
      method: "POST",
      path: "/invoices/00000000-0000-0000-0000-000000000001/paid",
      isApiKeyAuth: true,
      apiKeyScopes: ["admin"],
      orgId: "org-1",
      session: {}
    });
    const isScopeError = res._body?.error?.code === "SCOPE_INSUFFICIENT";
    assert.ok(!isScopeError, "admin-Scope muss write:invoices implizieren");
  });
});
