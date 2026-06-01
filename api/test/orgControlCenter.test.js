/**
 * Organization Control Center Test Suite
 * Tests: API Key generation + hashing, Router-Endpunkt-Struktur.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  generateApiKey,
  hashKey
} from "../services/apiKeyService.js";

import { createOrgControlCenterRouter } from "../routes/orgControlCenter.js";
import {
  returnPool, mockReq, mockRes, baseDeps,
  findHandlerExact, getMiddlewareCount,
  ORG_A, USER_A
} from "./helpers/security-mocks.js";

const mockNext = () => {};

/* ── API Key Generation ──────────────────────────────────── */

describe("API Key Service — generateApiKey", () => {
  it("erzeugt Key mit tc_live_ Prefix", () => {
    const { key } = generateApiKey();
    assert.ok(key.startsWith("tc_live_"), "Key muss mit tc_live_ beginnen");
  });

  it("Key hat korrekte Laenge (8 Prefix + 64 hex = 72 chars)", () => {
    const { key } = generateApiKey();
    assert.equal(key.length, 72, "tc_live_ (8) + 64 hex chars");
  });

  it("prefix ist die ersten 16 Zeichen des Keys", () => {
    const { key, prefix } = generateApiKey();
    assert.equal(prefix, key.slice(0, 16));
  });

  it("hash ist ein 64-char SHA-256 hex string", () => {
    const { hash } = generateApiKey();
    assert.equal(hash.length, 64);
    assert.ok(/^[0-9a-f]{64}$/.test(hash), "Hash muss lowercase hex sein");
  });

  it("erzeugt einzigartige Keys", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    assert.notEqual(a.key, b.key);
    assert.notEqual(a.hash, b.hash);
  });

  it("Hash stimmt mit separatem hashKey() ueberein", () => {
    const { key, hash } = generateApiKey();
    assert.equal(hashKey(key), hash);
  });
});

/* ── hashKey ─────────────────────────────────────────────── */

describe("API Key Service — hashKey", () => {
  it("ist deterministisch", () => {
    const input = "tc_live_abc123";
    assert.equal(hashKey(input), hashKey(input));
  });

  it("aendert sich bei unterschiedlichem Input", () => {
    assert.notEqual(hashKey("key_a"), hashKey("key_b"));
  });

  it("gibt 64-char hex zurueck", () => {
    const h = hashKey("test-key-value");
    assert.equal(h.length, 64);
    assert.ok(/^[0-9a-f]{64}$/.test(h));
  });
});

/* ── Router Modul-Struktur ───────────────────────────────── */

// Mock-Dependencies fuer Router-Erstellung (Middleware + Logger)
const noop = (_req, _res, next) => next();
const mockDeps = { pool: {}, requireAuth: noop, logger: { error() {}, info() {}, warn() {} } };

describe("Org Control Center Router — Modul", () => {
  it("exportiert createOrgControlCenterRouter als Funktion", async () => {
    const mod = await import("../routes/orgControlCenter.js");
    assert.equal(typeof mod.createOrgControlCenterRouter, "function");
  });

  it("gibt einen Router mit .stack zurueck", async () => {
    const { createOrgControlCenterRouter } = await import("../routes/orgControlCenter.js");
    const router = createOrgControlCenterRouter(mockDeps);
    assert.ok(router.stack, "Router muss einen stack haben");
    assert.ok(router.stack.length > 0, "Router muss Routen registriert haben");
  });

  it("registriert alle erwarteten Pfade", async () => {
    const { createOrgControlCenterRouter } = await import("../routes/orgControlCenter.js");
    const router = createOrgControlCenterRouter(mockDeps);
    const paths = router.stack
      .filter(l => l.route)
      .map(l => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);

    const expected = [
      "GET /org/overview",
      "GET /org/members",
      "PATCH /org/members/:userId",
      "DELETE /org/members/:userId",
      "PATCH /org/members/:membershipId/role",
      "PATCH /org/members/:membershipId/scope",
      "GET /org/api-keys",
      "POST /org/api-keys",
      "DELETE /org/api-keys/:id",
      "GET /org/webhooks",
      "GET /org/audit-log",
      "GET /org/usage",
      "GET /org/security",
      "PATCH /org/security",
      "GET /org/locations",
      "POST /org/locations",
      "PATCH /org/locations/:locId",
      "DELETE /org/locations/:locId",
      "GET /org/departments",
      "POST /org/departments",
      "PATCH /org/departments/:deptId",
      "DELETE /org/departments/:deptId"
    ];

    for (const ep of expected) {
      assert.ok(
        paths.includes(ep),
        `Fehlender Endpunkt: ${ep}. Vorhanden: ${paths.join(", ")}`
      );
    }
  });
});

/* ── Multi-Standort Route Handler ───────────────────────── */

describe("Org Control Center Router — Standorte & Member-Scope", () => {
  it("GET /org/locations gibt Standort-Liste zurueck (200)", async () => {
    const locs = [{ id: "loc-1", name: "HQ", is_hq: true }];
    const router = createOrgControlCenterRouter(baseDeps(returnPool(locs)));
    const handler = findHandlerExact(router, "get", "/org/locations");
    const req = mockReq();
    const res = mockRes();
    await handler(req, res, mockNext);
    assert.equal(res._json.success, true);
    assert.equal(res._json.data.items.length, 1);
    assert.equal(res._json.data.total, 1);
  });

  it("POST /org/locations erstellt Standort und antwortet 201", async () => {
    const newLoc = { id: "loc-new", name: "Berlin", city: "Berlin", org_id: ORG_A, is_hq: false };
    const router = createOrgControlCenterRouter(baseDeps(returnPool([newLoc])));
    const handler = findHandlerExact(router, "post", "/org/locations");
    const req = mockReq({ body: { name: "Berlin", city: "Berlin" } });
    const res = mockRes();
    await handler(req, res, mockNext);
    assert.equal(res._status, 201);
    assert.equal(res._json.success, true);
    assert.equal(res._json.data.name, "Berlin");
  });

  it("POST /org/locations hat sitesLimitGate (mindestens 5 Middleware-Stufen)", () => {
    const router = createOrgControlCenterRouter(baseDeps(returnPool([])));
    const count = getMiddlewareCount(router, "post", "/org/locations");
    assert.ok(count >= 5, `POST /org/locations braucht sitesLimitGate (gefunden: ${count})`);
  });

  it("POST /org/departments gibt 403 LOCATION_NOT_IN_ORG bei Fremd-Org location_id", async () => {
    // Leere Rows → assertLocationBelongsToOrg wirft OrgBoundaryError → Route antwortet 403
    const router = createOrgControlCenterRouter(baseDeps(returnPool([])));
    const handler = findHandlerExact(router, "post", "/org/departments");
    const req = mockReq({
      body: { name: "IT-Abt", location_id: "11111111-1111-1111-1111-111111111111" }
    });
    const res = mockRes();
    await handler(req, res, mockNext);
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "LOCATION_NOT_IN_ORG");
  });

  it("PATCH /org/members/:membershipId/role aendert Rolle, Scope bleibt erhalten (200)", async () => {
    const membership = {
      id: "m-1", org_id: ORG_A, user_id: USER_A,
      role_key: "admin", location_id: "loc-1", department_id: null
    };
    const router = createOrgControlCenterRouter(baseDeps(returnPool([membership])));
    const handler = findHandlerExact(router, "patch", "/org/members/:membershipId/role");
    const req = mockReq({
      params: { membershipId: "m-1" },
      body: { role_key: "admin" }
    });
    const res = mockRes();
    await handler(req, res, mockNext);
    assert.equal(res._json.success, true);
    assert.ok(res._json.data, "Antwort muss data enthalten");
    assert.equal(res._json.data.location_id, "loc-1", "Scope location_id unveraendert");
  });

  it("PATCH /org/members/:membershipId/scope aendert Scope, Rolle bleibt erhalten (200)", async () => {
    const membership = {
      id: "m-1", org_id: ORG_A, user_id: USER_A,
      role_key: "member", location_id: null, department_id: null
    };
    // location_id: null → Boundary-Check wird uebersprungen → 1 Query (UPDATE)
    const router = createOrgControlCenterRouter(baseDeps(returnPool([membership])));
    const handler = findHandlerExact(router, "patch", "/org/members/:membershipId/scope");
    const req = mockReq({
      params: { membershipId: "m-1" },
      body: { location_id: null, department_id: null }
    });
    const res = mockRes();
    await handler(req, res, mockNext);
    assert.equal(res._json.success, true);
    assert.ok(res._json.data, "Antwort muss data enthalten");
    assert.equal(res._json.data.role_key, "member", "Rolle unveraendert");
  });

  it("PATCH /org/members/:membershipId/scope gibt 403 bei Fremd-Org location_id", async () => {
    // Leere Rows → assertLocationBelongsToOrg wirft OrgBoundaryError → Route antwortet 403
    const router = createOrgControlCenterRouter(baseDeps(returnPool([])));
    const handler = findHandlerExact(router, "patch", "/org/members/:membershipId/scope");
    const req = mockReq({
      params: { membershipId: "m-1" },
      body: { location_id: "11111111-1111-1111-1111-111111111111", department_id: null }
    });
    const res = mockRes();
    await handler(req, res, mockNext);
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "ORG_BOUNDARY_VIOLATION");
  });
});

/* ── Key Format Validierung ──────────────────────────────── */

describe("API Key Service — Format-Sicherheit", () => {
  it("Key enthaelt nur erlaubte Zeichen (Prefix + hex)", () => {
    for (let i = 0; i < 10; i++) {
      const { key } = generateApiKey();
      assert.ok(
        /^tc_live_[0-9a-f]{64}$/.test(key),
        `Ungueltiges Key-Format: ${key}`
      );
    }
  });

  it("Prefix hat immer exakt 16 Zeichen", () => {
    for (let i = 0; i < 10; i++) {
      const { prefix } = generateApiKey();
      assert.equal(prefix.length, 16);
    }
  });

  it("Hash aendert sich wenn Key sich aendert", () => {
    // Simuliert: gleicher Random-Teil mit anderem Prefix wuerde anderen Hash geben
    const h1 = hashKey("tc_live_aaaa");
    const h2 = hashKey("tc_live_bbbb");
    assert.notEqual(h1, h2);
  });
});
