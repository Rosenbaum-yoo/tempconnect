/**
 * Audit-Write Middleware Tests — Prueft, dass die Auto-Audit-Middleware korrekt arbeitet.
 *
 * Run: node --test test/audit-write.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { EventEmitter } from "node:events";
import { auditWriteMiddleware } from "../middleware/auditWrite.js";

/** Erstellt ein minimales Mock-Response-Objekt (EventEmitter) */
function mockRes(statusCode = 200) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  res.locals = {};
  return res;
}

/** Erstellt ein minimales Mock-Request-Objekt */
function mockReq(method = "POST", path = "/api/test") {
  return {
    method,
    path,
    originalUrl: path,
    ip: "127.0.0.1",
    headers: { "user-agent": "test-agent" },
    session: { userId: "user-123" },
    orgId: "org-456"
  };
}

/** Mock-Pool, der geschriebene Audit-Eintraege sammelt */
function mockPool() {
  const written = [];
  return {
    written,
    query: async (sql, params) => {
      written.push({ sql, params });
      return { rows: [], rowCount: 1 };
    }
  };
}

/** Helper: wartet bis nach dem naechsten Tick (damit 'finish'-Handler laufen) */
function nextTick() {
  return new Promise(resolve => setTimeout(resolve, 20));
}

describe("auditWriteMiddleware", () => {
  it("writes audit entry when res.locals.audit is set on 2xx POST", async () => {
    const pool = mockPool();
    const mw = auditWriteMiddleware(pool, { logger: null });
    const req = mockReq("POST", "/api/contracts");
    const res = mockRes(201);
    let nextCalled = false;

    mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, "next() muss aufgerufen werden");

    // Route-Handler setzt Audit
    res.locals.audit = {
      action: "contract.create",
      entity_type: "contract",
      entity_id: "c-789",
      details: { title: "Test" }
    };

    res.emit("finish");
    await nextTick();

    assert.strictEqual(pool.written.length, 1, "Genau 1 Audit-Eintrag geschrieben");
    const params = pool.written[0].params;
    assert.ok(params.some(p => p === "contract.create"), "action ist 'contract.create'");
    assert.ok(params.some(p => p === "contract"), "entity_type ist 'contract'");
    assert.ok(params.some(p => p === "c-789"), "entity_id ist 'c-789'");
    assert.ok(params.some(p => p === "user-123"), "actor_id ist 'user-123'");
    assert.ok(params.some(p => p === "org-456"), "org_id ist 'org-456'");
  });

  it("skips audit for GET requests", async () => {
    const pool = mockPool();
    const mw = auditWriteMiddleware(pool, { logger: null });
    const req = mockReq("GET", "/api/contracts");
    const res = mockRes(200);
    let nextCalled = false;

    mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);

    res.emit("finish");
    await nextTick();

    assert.strictEqual(pool.written.length, 0, "Kein Audit fuer GET");
  });

  it("logs DENIED audit for non-2xx responses when audit is set", async () => {
    const pool = mockPool();
    const mw = auditWriteMiddleware(pool, { logger: null });
    const req = mockReq("POST", "/api/contracts");
    const res = mockRes(400);

    mw(req, res, () => {});
    res.locals.audit = { action: "contract.create", entity_type: "contract", entity_id: "c-1" };

    res.emit("finish");
    await nextTick();

    // Seit Audit-Trail-Erweiterung werden 4xx-Events als DENIED geloggt
    assert.strictEqual(pool.written.length, 1, "Audit wird geschrieben mit DENIED-Status");
    const params = pool.written[0].params;
    assert.ok(params.includes("DENIED"), "Status ist DENIED");
  });

  it("logs warning for unmarked mutation (no res.locals.audit)", async () => {
    const pool = mockPool();
    const warnings = [];
    const logger = { warn: (data, msg) => warnings.push({ data, msg }), error: () => {} };
    const mw = auditWriteMiddleware(pool, { logger });
    const req = mockReq("POST", "/api/something");
    const res = mockRes(200);

    mw(req, res, () => {});
    // res.locals.audit NOT set

    res.emit("finish");
    await nextTick();

    assert.strictEqual(pool.written.length, 0, "Kein Audit geschrieben");
    assert.strictEqual(warnings.length, 1, "Genau 1 Warnung geloggt");
    assert.ok(warnings[0].msg.includes("Audit-Markierung"), "Warnung erwaehnt fehlende Markierung");
  });

  it("handles writeAudit errors gracefully", async () => {
    const errors = [];
    const logger = { warn: () => {}, error: (data, msg) => errors.push({ data, msg }) };
    const failPool = {
      query: async () => { throw new Error("DB down"); }
    };
    const mw = auditWriteMiddleware(failPool, { logger });
    const req = mockReq("POST", "/api/test");
    const res = mockRes(200);

    mw(req, res, () => {});
    res.locals.audit = { action: "test.op", entity_type: "test", entity_id: "1" };

    res.emit("finish");
    await nextTick();

    // Error wurde geloggt, kein Crash
    assert.strictEqual(errors.length, 1, "1 Error geloggt");
    assert.ok(errors[0].msg.includes("Audit-Write fehlgeschlagen"), "Error-Message passt");
  });

  it("writes old_values and new_values when provided", async () => {
    const pool = mockPool();
    const mw = auditWriteMiddleware(pool, { logger: null });
    const req = mockReq("PATCH", "/api/contracts/c-1");
    const res = mockRes(200);

    mw(req, res, () => {});
    res.locals.audit = {
      action: "contract.update",
      entity_type: "contract",
      entity_id: "c-1",
      old_values: { status: "ACTIVE" },
      new_values: { status: "TERMINATED" }
    };

    res.emit("finish");
    await nextTick();

    assert.strictEqual(pool.written.length, 1);
    const params = pool.written[0].params;
    // writeAudit ruft JSON.stringify auf old_values/new_values
    const hasOld = params.some(p => typeof p === "string" && p.includes('"ACTIVE"'));
    const hasNew = params.some(p => typeof p === "string" && p.includes('"TERMINATED"'));
    assert.ok(hasOld, "old_values als JSON-String enthalten");
    assert.ok(hasNew, "new_values als JSON-String enthalten");
  });
});

/**
 * Maschinen-Auth durch die Auto-Middleware.
 *
 * Die Middleware ist der Weg, ueber den die MEISTEN Mutationen auditiert werden
 * (`res.locals.audit`). Sie loeste den Akteur frueher nur aus `req.session.userId` auf —
 * ein API-Key-Request (workers, timesheets, requisitions, invoices, assignments, …)
 * landete dadurch als `actor_id: null` in der Zeile und war von einem Systemlauf nicht
 * zu unterscheiden. Seitdem kommt der Akteur aus `resolveAuditActor`.
 */
describe("auditWriteMiddleware — Maschinen-Auth (API-Key/M2M)", () => {
  /** Request ohne Session, aber mit API-Key-Kontext. */
  function apiKeyReq(over = {}) {
    return {
      method: "POST", path: "/api/timesheets", originalUrl: "/api/timesheets",
      ip: "127.0.0.1", headers: { "user-agent": "partner-integration/1.0" },
      orgId: "org-456",
      isApiKeyAuth: true, apiKeyId: "key-42", apiKeyOwnerUserId: "owner-9",
      ...over
    };
  }

  /** details-Spalte ist Parameter 5 des INSERT. */
  const details = (pool) => JSON.parse(pool.written[0].params[4]);

  it("schreibt den Key-Ersteller als Verantwortlichen statt null", async () => {
    const pool = mockPool();
    const mw = auditWriteMiddleware(pool, { logger: null });
    const req = apiKeyReq();
    const res = mockRes(201);

    mw(req, res, () => {});
    res.locals.audit = { action: "timesheet.create", entity_type: "timesheet", entity_id: "ts-1" };
    res.emit("finish");
    await nextTick();

    assert.strictEqual(pool.written.length, 1);
    assert.strictEqual(pool.written[0].params[0], "owner-9", "actor_id-Spalte");
    const d = details(pool);
    assert.strictEqual(d.responsible_actor_user_id, "owner-9");
    assert.strictEqual(d.actor_type, "api_key");
    assert.strictEqual(d.api_key_id, "key-42");
  });

  it("erhaelt die fachlichen Details der Route", async () => {
    const pool = mockPool();
    const mw = auditWriteMiddleware(pool, { logger: null });
    const res = mockRes(200);

    mw(apiKeyReq(), res, () => {});
    res.locals.audit = {
      action: "worker.update", entity_type: "worker", entity_id: "w-1",
      details: { changed_fields: ["email"] }
    };
    res.emit("finish");
    await nextTick();

    const d = details(pool);
    assert.deepStrictEqual(d.changed_fields, ["email"], "Route-Details bleiben erhalten");
    assert.strictEqual(d.actor_type, "api_key");
  });

  it("M2M-JWT wird als m2m_token gefuehrt", async () => {
    const pool = mockPool();
    const mw = auditWriteMiddleware(pool, { logger: null });
    const res = mockRes(200);

    mw(apiKeyReq({ isM2mToken: true }), res, () => {});
    res.locals.audit = { action: "invoice.update", entity_type: "invoice", entity_id: "i-1" };
    res.emit("finish");
    await nextTick();

    assert.strictEqual(details(pool).actor_type, "m2m_token");
  });

  it("Session-Request bleibt unveraendert (kein Maschinen-Kontext)", async () => {
    // Regressionsschutz: die Aenderung darf bestehende Audit-Zeilen nicht anfassen.
    const pool = mockPool();
    const mw = auditWriteMiddleware(pool, { logger: null });
    const res = mockRes(201);

    mw(mockReq("POST", "/api/contracts"), res, () => {});
    res.locals.audit = { action: "contract.create", entity_type: "contract", entity_id: "c-1" };
    res.emit("finish");
    await nextTick();

    const d = details(pool);
    assert.strictEqual(d.responsible_actor_user_id, "user-123");
    assert.strictEqual(d.actor_type, undefined, "Session-Eintraege bekommen keinen Maschinen-Kontext");
    assert.strictEqual(d.api_key_id, undefined);
  });
});
