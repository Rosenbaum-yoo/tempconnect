/**
 * Staff Control Center — Betreiber-Kill-Switch Routes (Phase 1, Mig 127).
 *
 * Verifiziert die Routen-GLUE der zwei neuen Endpunkte
 *   POST /customers/:orgId/suspend     (High Step-up)
 *   POST /customers/:orgId/reactivate  (Medium Step-up)
 * — also genau das, was NICHT in orgAccessSuspensionService liegt:
 * HTTP-Status-Mapping (ORG_NOT_FOUND=404 / ALREADY_SUSPENDED|NOT_SUSPENDED=409
 * / sonst 400) und das Audit auf BEIDEN Pfaden (Erfolg=ok, Fehler=error) mit
 * korrektem action/risk_level/entity_id. Mutationslogik selbst: siehe
 * orgAccessSuspension.test.js. RBAC/Step-up/Confirm: staffControlCenter.test.js.
 *
 * Direkter Handler-Aufruf mit Mock-Pool nach gleichem Muster wie
 * staffSubscriptionRequests.routes.test.js (Middleware-Layer werden
 * uebersprungen — req.sccActorId/sccReason sind im echten Mount durch
 * requireStaff/requireConfirmAndReason garantiert und hier simuliert).
 *
 * Run: node --test --test-force-exit api/test/staffControlCenter.killSwitch.routes.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createStaffControlCenterRouter } from "../routes/staffControlCenter.js";

const ORG = "11111111-1111-1111-1111-111111111111";

function sequencePool(...responses) {
  let idx = 0;
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (idx >= responses.length) {
        throw new Error(`Unexpected query #${idx + 1}: ${String(sql).slice(0, 80)}`);
      }
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

function mockReq(overrides = {}) {
  return {
    sccStaff: { user_id: "staff-1", email: "ops@tempconnect.de", requires_step_up: false },
    sccActorId: "staff-1",
    sccReason: "Rechnung #123 seit 30 Tagen offen",
    sccConfirmed: true,
    session: { staffStepUpAt: Date.now() },
    headers: {},
    ip: "127.0.0.1",
    body: { confirmed: true, reason: "Rechnung #123 seit 30 Tagen offen" },
    query: {},
    params: {},
    ...overrides
  };
}

function mockRes() {
  const res = {
    _status: 200, _json: null, locals: {},
    status(code) { res._status = code; return res; },
    json(data) { res._json = data; return res; }
  };
  return res;
}

function findHandler(router, method, pathFragment) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (Object.keys(layer.route.methods)[0] === method && layer.route.path === pathFragment) {
      return layer.route.stack.map((s) => s.handle);
    }
  }
  throw new Error(`Route ${method} ${pathFragment} not found`);
}

async function callFinal(router, method, path, req, res) {
  const handlers = findHandler(router, method, path);
  await handlers[handlers.length - 1](req, res);
}

function makeRouter(pool) {
  return createStaffControlCenterRouter({ pool, logger: { warn() {}, error() {}, info() {} } });
}

const auditCall = (pool) => pool.calls.find((c) => /staff_control_audit_log/.test(c.sql));
const suspendedRow = (over = {}) => ({
  id: ORG, name: "Acme GmbH", plan: "PRO", customer_stage: "live",
  access_suspended_at: "2026-06-05T10:00:00.000Z",
  access_suspended_reason: "Rechnung #123 seit 30 Tagen offen",
  access_suspended_kind: "non_payment", access_suspended_by: "staff-1",
  ...over
});
const auditOk = { rows: [{ id: "aud-1", created_at: "2026-06-05T10:00:00.000Z" }] };

describe("POST /customers/:orgId/suspend", () => {
  it("Erfolg -> 200, data gemappt, kind aus Body -> UPDATE, Audit ok/high", async () => {
    const pool = sequencePool({ rowCount: 1, rows: [suspendedRow()] }, auditOk);
    const req = mockReq({ params: { orgId: ORG }, body: { confirmed: true, reason: "Rechnung #123 seit 30 Tagen offen", kind: "non_payment" } });
    const res = mockRes();
    await callFinal(makeRouter(pool), "post", "/customers/:orgId/suspend", req, res);

    assert.equal(res._status, 200);
    assert.equal(res._json.success, true);
    assert.equal(res._json.data.suspended, true);
    assert.equal(res._json.data.suspended_kind, "non_payment");
    // kind aus Body floss in den Service-UPDATE ($4)
    assert.equal(pool.calls[0].params[3], "non_payment");
    // Audit: Erfolgspfad
    const a = auditCall(pool);
    assert.ok(a, "Audit-INSERT geschrieben");
    assert.equal(a.params[2], "staff_control.customer.access_suspend"); // action
    assert.equal(a.params[4], ORG);                                     // entity_id
    assert.equal(a.params[5], "ok");                                    // status
    assert.equal(a.params[8], "high");                                  // risk_level
  });

  it("ALREADY_SUSPENDED -> 409 + Fehler-Audit (status=error)", async () => {
    const pool = sequencePool(
      { rowCount: 0, rows: [] },                                            // UPDATE: kein Treffer
      { rowCount: 1, rows: [{ access_suspended_at: "2026-06-01T00:00:00Z" }] }, // SELECT: existiert
      auditOk                                                               // Fehler-Audit
    );
    const req = mockReq({ params: { orgId: ORG } });
    const res = mockRes();
    await callFinal(makeRouter(pool), "post", "/customers/:orgId/suspend", req, res);

    assert.equal(res._status, 409);
    assert.equal(res._json.success, false);
    assert.equal(res._json.error.code, "ALREADY_SUSPENDED");
    const a = auditCall(pool);
    assert.equal(a.params[5], "error");
    assert.equal(a.params[8], "high");
  });

  it("ORG_NOT_FOUND -> 404", async () => {
    const pool = sequencePool({ rowCount: 0, rows: [] }, { rowCount: 0, rows: [] }, auditOk);
    const req = mockReq({ params: { orgId: ORG } });
    const res = mockRes();
    await callFinal(makeRouter(pool), "post", "/customers/:orgId/suspend", req, res);
    assert.equal(res._status, 404);
    assert.equal(res._json.error.code, "ORG_NOT_FOUND");
  });

  it("INVALID_ORG_ID -> 400 (Service lehnt ab, kein UPDATE)", async () => {
    const pool = sequencePool(auditOk); // nur das Fehler-Audit
    const req = mockReq({ params: { orgId: "nope" } });
    const res = mockRes();
    await callFinal(makeRouter(pool), "post", "/customers/:orgId/suspend", req, res);
    assert.equal(res._status, 400);
    assert.equal(res._json.error.code, "INVALID_ORG_ID");
    // erste (und einzige) Query ist das Audit, KEIN UPDATE organizations
    assert.equal(pool.calls.length, 1);
    assert.match(pool.calls[0].sql, /staff_control_audit_log/);
  });
});

describe("POST /customers/:orgId/reactivate", () => {
  it("Erfolg -> 200, Audit reactivate/medium", async () => {
    const pool = sequencePool(
      { rowCount: 1, rows: [suspendedRow({ access_suspended_at: null, access_suspended_reason: null, access_suspended_kind: null, access_suspended_by: null })] },
      auditOk
    );
    const req = mockReq({ params: { orgId: ORG }, body: { confirmed: true, reason: "Zahlung eingegangen, Freigabe" } });
    const res = mockRes();
    await callFinal(makeRouter(pool), "post", "/customers/:orgId/reactivate", req, res);

    assert.equal(res._status, 200);
    assert.equal(res._json.success, true);
    assert.equal(res._json.data.suspended, false);
    const a = auditCall(pool);
    assert.equal(a.params[2], "staff_control.customer.access_reactivate");
    assert.equal(a.params[5], "ok");
    assert.equal(a.params[8], "medium");
  });

  it("NOT_SUSPENDED -> 409 + Fehler-Audit", async () => {
    const pool = sequencePool(
      { rowCount: 0, rows: [] },
      { rowCount: 1, rows: [{ access_suspended_at: null }] },
      auditOk
    );
    const req = mockReq({ params: { orgId: ORG } });
    const res = mockRes();
    await callFinal(makeRouter(pool), "post", "/customers/:orgId/reactivate", req, res);
    assert.equal(res._status, 409);
    assert.equal(res._json.error.code, "NOT_SUSPENDED");
    assert.equal(auditCall(pool).params[5], "error");
  });

  it("ORG_NOT_FOUND -> 404", async () => {
    const pool = sequencePool({ rowCount: 0, rows: [] }, { rowCount: 0, rows: [] }, auditOk);
    const req = mockReq({ params: { orgId: ORG } });
    const res = mockRes();
    await callFinal(makeRouter(pool), "post", "/customers/:orgId/reactivate", req, res);
    assert.equal(res._status, 404);
    assert.equal(res._json.error.code, "ORG_NOT_FOUND");
  });
});
