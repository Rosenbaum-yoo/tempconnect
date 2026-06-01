/**
 * API Key Security Test Suite
 * Tests: Scope-Katalog, hasScope-Logik, validateScopes, Middleware-Exports, Router-Endpoints.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  VALID_SCOPES,
  getValidScopes,
  validateScopes,
  hasScope,
  generateApiKey,
  hashKey
} from "../services/apiKeyService.js";

/* ── Scope-Katalog ───────────────────────────────────────── */

describe("API Key Scopes — Katalog", () => {
  it("enthaelt Basis-Scopes read, write, admin", () => {
    assert.ok(VALID_SCOPES.includes("read"));
    assert.ok(VALID_SCOPES.includes("write"));
    assert.ok(VALID_SCOPES.includes("admin"));
  });

  it("enthaelt granulare Resource-Scopes", () => {
    const granular = VALID_SCOPES.filter(s => s.includes(":"));
    assert.ok(granular.length >= 8, `Mindestens 8 granulare Scopes, gefunden: ${granular.length}`);
  });

  it("keine Duplikate im Katalog", () => {
    const set = new Set(VALID_SCOPES);
    assert.equal(set.size, VALID_SCOPES.length);
  });

  it("getValidScopes gibt strukturierte Liste zurueck", () => {
    const scopes = getValidScopes();
    assert.ok(Array.isArray(scopes));
    assert.equal(scopes.length, VALID_SCOPES.length);
    assert.ok(scopes[0].key);
    assert.ok(scopes[0].category);
  });
});

/* ── validateScopes ──────────────────────────────────────── */

describe("API Key Scopes — validateScopes", () => {
  it("akzeptiert gueltige Scopes", () => {
    const result = validateScopes(["read", "write:timesheets"]);
    assert.ok(result.valid);
    assert.equal(result.invalid.length, 0);
  });

  it("erkennt ungueltige Scopes", () => {
    const result = validateScopes(["read", "delete:everything"]);
    assert.ok(!result.valid);
    assert.deepEqual(result.invalid, ["delete:everything"]);
  });

  it("leeres Array ist gueltig", () => {
    const result = validateScopes([]);
    assert.ok(result.valid);
  });

  it("null ist ungueltig", () => {
    const result = validateScopes(null);
    assert.ok(!result.valid);
  });
});

/* ── hasScope ────────────────────────────────────────────── */

describe("API Key Scopes — hasScope", () => {
  it("admin impliziert alle Scopes", () => {
    assert.ok(hasScope(["admin"], "read"));
    assert.ok(hasScope(["admin"], "write:timesheets"));
    assert.ok(hasScope(["admin"], "read:audit"));
  });

  it("exakter Match funktioniert", () => {
    assert.ok(hasScope(["read:timesheets"], "read:timesheets"));
    assert.ok(!hasScope(["read:timesheets"], "write:timesheets"));
  });

  it("write impliziert read auf Basis-Level", () => {
    assert.ok(hasScope(["write"], "read"));
    assert.ok(!hasScope(["read"], "write"));
  });

  it("write:X impliziert read:X granular", () => {
    assert.ok(hasScope(["write:timesheets"], "read:timesheets"));
    assert.ok(!hasScope(["write:timesheets"], "read:invoices"));
  });

  it("Basis read deckt read:* ab", () => {
    assert.ok(hasScope(["read"], "read:timesheets"));
    assert.ok(hasScope(["read"], "read:audit"));
  });

  it("Basis write deckt write:* ab", () => {
    assert.ok(hasScope(["write"], "write:requisitions"));
  });

  it("leere Scopes geben false", () => {
    assert.ok(!hasScope([], "read"));
    assert.ok(!hasScope(null, "read"));
  });
});

/* ── Middleware-Exports ──────────────────────────────────── */

describe("API Key Auth Middleware — Exports", () => {
  it("exportiert apiKeyAuthMiddleware als Funktion", async () => {
    const mod = await import("../middleware/apiKeyAuth.js");
    assert.equal(typeof mod.apiKeyAuthMiddleware, "function");
  });

  it("exportiert requireScope als Funktion", async () => {
    const mod = await import("../middleware/apiKeyAuth.js");
    assert.equal(typeof mod.requireScope, "function");
  });

  it("apiKeyAuthMiddleware gibt Middleware zurueck", async () => {
    const { apiKeyAuthMiddleware } = await import("../middleware/apiKeyAuth.js");
    const mw = apiKeyAuthMiddleware({}, { logger: { warn(){}, error(){} } });
    assert.equal(typeof mw, "function");
  });

  it("requireScope gibt Middleware zurueck", async () => {
    const { requireScope } = await import("../middleware/apiKeyAuth.js");
    const mw = requireScope("read");
    assert.equal(typeof mw, "function");
  });
});

/* ── Router-Endpoints ────────────────────────────────────── */

describe("Org Control Center Router — API Key Endpoints", () => {
  it("enthaelt Rotate-Endpoint", async () => {
    const { createOrgControlCenterRouter } = await import("../routes/orgControlCenter.js");
    const noop = (_r, _s, n) => n();
    const router = createOrgControlCenterRouter({ pool: {}, requireAuth: noop, logger: { error(){}, info(){}, warn(){} } });
    const paths = router.stack.filter(l => l.route).map(l => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);
    assert.ok(paths.includes("POST /org/api-keys/:id/rotate"), `Rotate fehlt. Vorhanden: ${paths.join(", ")}`);
  });

  it("enthaelt Scopes-Endpoint", async () => {
    const { createOrgControlCenterRouter } = await import("../routes/orgControlCenter.js");
    const noop = (_r, _s, n) => n();
    const router = createOrgControlCenterRouter({ pool: {}, requireAuth: noop, logger: { error(){}, info(){}, warn(){} } });
    const paths = router.stack.filter(l => l.route).map(l => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);
    assert.ok(paths.includes("GET /org/api-keys/scopes"), `Scopes fehlt. Vorhanden: ${paths.join(", ")}`);
  });
});

/* ── Middleware-Ausfuehrung ──────────────────────────────── */

import { apiKeyAuthMiddleware, requireScope } from "../middleware/apiKeyAuth.js";

function mockReq(headers = {}) {
  return { headers, session: {} };
}

function mockRes() {
  const res = { _status: null, _json: null, status(c) { res._status = c; return res; }, json(d) { res._json = d; return res; } };
  return res;
}

function mockLogger() {
  const logs = { warn: [], error: [] };
  return { logs, warn: (d, m) => logs.warn.push({ d, m }), error: (d, m) => logs.error.push({ d, m }) };
}

describe("apiKeyAuthMiddleware — kein Key", () => {
  it("ruft next() auf ohne API-Key Header", async () => {
    const mw = apiKeyAuthMiddleware({}, { logger: mockLogger() });
    const req = mockReq({});
    let called = false;
    await mw(req, mockRes(), () => { called = true; });
    assert.ok(called);
    assert.equal(req.isApiKeyAuth, undefined);
  });

  it("ignoriert Bearer-Token ohne tc_live_ Praefix", async () => {
    const mw = apiKeyAuthMiddleware({}, { logger: mockLogger() });
    let called = false;
    await mw(mockReq({ authorization: "Bearer some_token" }), mockRes(), () => { called = true; });
    assert.ok(called);
  });

  it("ignoriert X-API-Key ohne tc_live_ Praefix", async () => {
    const mw = apiKeyAuthMiddleware({}, { logger: mockLogger() });
    let called = false;
    await mw(mockReq({ "x-api-key": "invalid_prefix" }), mockRes(), () => { called = true; });
    assert.ok(called);
  });
});

describe("apiKeyAuthMiddleware — gueltiger Key", () => {
  const record = { id: "k1", org_id: "org-1", scopes: ["read"] };
  const pool = { query: async () => ({ rows: [record] }) };

  it("setzt Auth-Felder bei X-API-Key", async () => {
    const mw = apiKeyAuthMiddleware(pool, { logger: mockLogger() });
    const req = mockReq({ "x-api-key": "tc_live_" + "a".repeat(64) });
    await mw(req, mockRes(), () => {});
    assert.equal(req.isApiKeyAuth, true);
    assert.equal(req.orgId, "org-1");
    assert.equal(req.apiKeyId, "k1");
    assert.deepEqual(req.apiKeyScopes, ["read"]);
  });

  it("setzt Auth-Felder bei Bearer tc_live_*", async () => {
    const mw = apiKeyAuthMiddleware(pool, { logger: mockLogger() });
    const req = mockReq({ authorization: "Bearer tc_live_" + "b".repeat(64) });
    await mw(req, mockRes(), () => {});
    assert.equal(req.isApiKeyAuth, true);
    assert.equal(req.orgId, "org-1");
  });

  it("setzt leeres Array wenn scopes null", async () => {
    const p = { query: async () => ({ rows: [{ id: "k2", org_id: "o2", scopes: null }] }) };
    const mw = apiKeyAuthMiddleware(p, { logger: mockLogger() });
    const req = mockReq({ "x-api-key": "tc_live_" + "c".repeat(64) });
    await mw(req, mockRes(), () => {});
    assert.deepEqual(req.apiKeyScopes, []);
  });
});

describe("apiKeyAuthMiddleware — ungueltiger/fehlender Key", () => {
  it("gibt 401 bei unbekanntem Key", async () => {
    const pool = { query: async () => ({ rows: [] }) };
    const logger = mockLogger();
    const mw = apiKeyAuthMiddleware(pool, { logger });
    const res = mockRes();
    let called = false;
    await mw(mockReq({ "x-api-key": "tc_live_" + "f".repeat(64) }), res, () => { called = true; });
    assert.equal(called, false);
    assert.equal(res._status, 401);
    assert.equal(res._json.error.code, "API_KEY_INVALID");
    assert.equal(logger.logs.warn.length, 1);
  });

  it("gibt 500 bei DB-Fehler", async () => {
    const pool = { query: async () => { throw new Error("down"); } };
    const logger = mockLogger();
    const mw = apiKeyAuthMiddleware(pool, { logger });
    const res = mockRes();
    await mw(mockReq({ "x-api-key": "tc_live_" + "d".repeat(64) }), res, () => {});
    assert.equal(res._status, 500);
    assert.equal(res._json.error.code, "SERVER_ERROR");
    assert.equal(logger.logs.error.length, 1);
  });
});

describe("requireScope — Middleware", () => {
  it("Session-Auth: kein Scope-Check", () => {
    const mw = requireScope("admin");
    let called = false;
    mw({ isApiKeyAuth: false }, mockRes(), () => { called = true; });
    assert.ok(called);
  });

  it("API-Key: Scope vorhanden → next()", () => {
    const mw = requireScope("read");
    let called = false;
    mw({ isApiKeyAuth: true, apiKeyScopes: ["read"] }, mockRes(), () => { called = true; });
    assert.ok(called);
  });

  it("API-Key: Scope fehlt → 403", () => {
    const mw = requireScope("write:timesheets");
    const res = mockRes();
    mw({ isApiKeyAuth: true, apiKeyScopes: ["read"] }, res, () => {});
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "SCOPE_INSUFFICIENT");
  });

  it("API-Key: leere Scopes → 403 (kein Vollzugriff)", () => {
    const mw = requireScope("admin");
    const res = mockRes();
    mw({ isApiKeyAuth: true, apiKeyScopes: [] }, res, () => {});
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "SCOPE_INSUFFICIENT");
  });
});
