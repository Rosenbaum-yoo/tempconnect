/**
 * OCC Access Middleware Tests
 * Testet: requireOwnerControlAccess (Allowlist-Guard)
 *
 * Run: node --test --test-force-exit test/occAccess.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requireOwnerControlAccess } from "../middleware/requireOwnerControlAccess.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeSequentialPool(...responses) {
  let idx = 0;
  return {
    query: async () => {
      const r = responses[idx++];
      if (r instanceof Error) throw r;
      return r ?? { rows: [], rowCount: 0 };
    },
  };
}

function makeFlexPool(handler) {
  return { query: async (sql, params) => handler(sql, params) };
}

function makeReq(userId = null) {
  return {
    session: { userId },
    path: "/owner-control/bootstrap",
    method: "GET",
    ip: "127.0.0.1",
  };
}

function makeRes() {
  return {
    statusCode: 200,
    jsonBody: null,
    status(code) { this.statusCode = code; return this; },
    json(body)  { this.jsonBody  = body;  return this; },
  };
}

function mockLogger() {
  return { warn() {}, error() {}, info() {} };
}

// ── 401 — keine Session ────────────────────────────────────────────────────────

describe("requireOwnerControlAccess — keine Session", () => {
  it("gibt 401 zurück wenn session.userId fehlt", async () => {
    const mw = requireOwnerControlAccess({ pool: makeSequentialPool(), logger: mockLogger() });
    const req = makeReq(null);
    const res = makeRes();
    let nextCalled = false;

    await mw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false, "next() darf nicht aufgerufen werden");
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.jsonBody.success, false);
    assert.strictEqual(res.jsonBody.error.code, "NOT_AUTHENTICATED");
  });

  it("schreibt keine DB-Query wenn keine Session vorhanden", async () => {
    let queryCalled = false;
    const pool = makeFlexPool(() => { queryCalled = true; return { rows: [], rowCount: 0 }; });
    const mw = requireOwnerControlAccess({ pool, logger: mockLogger() });

    await mw(makeReq(null), makeRes(), () => {});

    assert.strictEqual(queryCalled, false, "kein DB-Zugriff ohne Session");
  });
});

// ── 403 — User nicht in Allowlist ─────────────────────────────────────────────

describe("requireOwnerControlAccess — User nicht in occ_owner_access", () => {
  it("gibt 403 OCC_FORBIDDEN zurück wenn User nicht in Allowlist", async () => {
    // 1. SELECT occ_owner_access → leer
    // 2. writeAccessAudit INSERT → (catch inside writeAccessAudit, failure ok)
    const pool = makeSequentialPool(
      { rows: [], rowCount: 0 },  // SELECT occ_owner_access
      { rows: [] }                // writeAccessAudit INSERT (best-effort)
    );
    const mw = requireOwnerControlAccess({ pool, logger: mockLogger() });
    const req = makeReq("user-not-in-list");
    const res = makeRes();
    let nextCalled = false;

    await mw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false, "next() darf nicht aufgerufen werden");
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.jsonBody.success, false);
    assert.strictEqual(res.jsonBody.error.code, "OCC_FORBIDDEN");
  });

  it("schreibt Audit-Eintrag bei 403 (best-effort)", async () => {
    const calls = [];
    const pool = makeFlexPool((sql) => {
      calls.push(sql.trim().slice(0, 20));
      return { rows: [], rowCount: 0 };
    });
    const mw = requireOwnerControlAccess({ pool, logger: mockLogger() });

    await mw(makeReq("user-forbidden"), makeRes(), () => {});

    // Mindestens 2 Calls: SELECT + INSERT (audit)
    assert.ok(calls.length >= 2, `erwartet >= 2 DB-Calls, bekam ${calls.length}`);
    const hasInsert = calls.some((s) => s.toUpperCase().startsWith("INSERT"));
    assert.ok(hasInsert, "writeAccessAudit muss INSERT ausführen");
  });

  it("gibt 403 auch wenn writeAccessAudit-INSERT fehlschlägt", async () => {
    const pool = makeSequentialPool(
      { rows: [], rowCount: 0 },  // SELECT occ_owner_access → leer
      new Error("DB nicht erreichbar") // writeAccessAudit wirft → catch() → kein Fehler
    );
    const mw = requireOwnerControlAccess({ pool, logger: mockLogger() });
    const res = makeRes();

    await mw(makeReq("user-x"), res, () => {});

    // Trotz Audit-Fehler: 403 muss gesendet werden
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.jsonBody.error.code, "OCC_FORBIDDEN");
  });
});

// ── 200 — User in Allowlist ───────────────────────────────────────────────────

describe("requireOwnerControlAccess — User in occ_owner_access", () => {
  it("setzt req.occAccess und ruft next() auf", async () => {
    const pool = makeFlexPool((sql) => {
      if (sql.includes("occ_owner_access")) {
        return { rows: [{ id: "occ-row-1", occ_role: "owner" }], rowCount: 1 };
      }
      return { rows: [] }; // Fallback für andere Queries
    });
    const mw = requireOwnerControlAccess({ pool, logger: mockLogger() });
    const req = makeReq("owner-user-1");
    const res = makeRes();
    let nextCalled = false;

    await mw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true, "next() muss aufgerufen werden");
    assert.strictEqual(res.statusCode, 200, "kein Fehler-Statuscode");
    assert.ok(req.occAccess, "req.occAccess muss gesetzt sein");
    assert.strictEqual(req.occAccess.user_id, "owner-user-1");
    assert.strictEqual(req.occAccess.occ_role, "owner");
  });

  it("akzeptiert occ_role = co-owner", async () => {
    const pool = makeFlexPool((sql) => {
      if (sql.includes("occ_owner_access")) {
        return { rows: [{ id: "occ-row-2", occ_role: "co-owner" }], rowCount: 1 };
      }
      return { rows: [] };
    });
    const mw = requireOwnerControlAccess({ pool, logger: mockLogger() });
    const req = makeReq("co-owner-user-1");

    await mw(req, makeRes(), () => {});

    assert.strictEqual(req.occAccess?.occ_role, "co-owner");
  });

  it("gibt 500 wenn DB bei SELECT wirft", async () => {
    const pool = makeSequentialPool(new Error("Verbindungsfehler"));
    const mw = requireOwnerControlAccess({ pool, logger: mockLogger() });
    const res = makeRes();
    let nextCalled = false;

    await mw(makeReq("some-user"), res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.jsonBody.error.code, "SERVER_ERROR");
  });
});
