/**
 * Staff Control Center - Subscription Requests Routes.
 *
 * Verifiziert die neuen `/staff/api/subscription-requests` Endpoints aus
 * Welle 8 Schritt 4. Mocked Pool, direkter Handler-Aufruf nach gleichem
 * Muster wie payment.route.test.js.
 *
 * Run: node --test --test-force-exit api/test/staffSubscriptionRequests.routes.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createStaffControlCenterRouter } from "../routes/staffControlCenter.js";

// ── Mocks ───────────────────────────────────────────────────────

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
    sccReason: "Test-Begruendung mit ausreichender Laenge",
    sccConfirmed: true,
    session: { staffStepUpAt: Date.now() },
    headers: {},
    ip: "127.0.0.1",
    body: { confirmed: true, reason: "Test-Begruendung mit ausreichender Laenge" },
    query: {},
    params: {},
    ...overrides
  };
}

function mockRes() {
  const res = {
    _status: 200,
    _json: null,
    locals: {},
    status(code) { res._status = code; return res; },
    json(data) { res._json = data; return res; }
  };
  return res;
}

function findHandler(router, method, pathFragment) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (Object.keys(layer.route.methods)[0] === method && layer.route.path === pathFragment) {
      const handlers = layer.route.stack.map((s) => s.handle);
      return handlers; // Liste aller Middlewares + Final Handler
    }
  }
  throw new Error(`Route ${method} ${pathFragment} not found`);
}

/**
 * Ruft die Handler-Kette manuell auf. Da requireStaff/requireStepUp/
 * requireConfirmAndReason auf req.sccStaff/sccReason setzen, simulieren
 * wir das in `mockReq` und ueberspringen die ersten Middleware-Layer
 * (sind im echten App-Mount durch app.js + staffControlAccess gewaehrleistet).
 */
async function callFinal(router, method, path, req, res) {
  const handlers = findHandler(router, method, path);
  // Letzter Handler ist der eigentliche Routen-Code.
  const finalHandler = handlers[handlers.length - 1];
  await finalHandler(req, res);
}

function makeRouter(pool) {
  return createStaffControlCenterRouter({ pool, logger: { warn() {}, error() {}, info() {} } });
}

// ── Tests ───────────────────────────────────────────────────────

describe("GET /subscription-requests", () => {
  it("liefert items + counters", async () => {
    const pool = sequencePool(
      { rows: [{ id: "r1", request_type: "upgrade", status: "submitted", contact_email: "x@y.de", org_name: "ACME" }] }, // listInbox
      { rows: [{ request_type: "upgrade", cnt: 1 }] }, // counters per type
      { rows: [{ cnt: 0 }] } // mine_open
    );
    const router = makeRouter(pool);
    const req = mockReq({ query: { quick_filter: "open" } });
    const res = mockRes();
    await callFinal(router, "get", "/subscription-requests", req, res);
    assert.equal(res._status, 200);
    assert.equal(res._json.success, true);
    assert.equal(res._json.data.items.length, 1);
    assert.equal(res._json.data.counters.total_open, 1);
  });
});

describe("GET /subscription-requests/:id", () => {
  it("liefert detail + history + allowed_next + can_bypass_staff", async () => {
    const detailRow = {
      id: "r1", request_type: "upgrade", status: "submitted",
      contact_email: "x@y.de", desired_plan: "PLUS", current_plan: "BASIS",
      org_id: null, user_id: null, source_strategic_request_id: null
    };
    const pool = sequencePool(
      { rows: [detailRow] },                                 // main SELECT
      { rows: [{ id: "h1", from_status: null, to_status: "submitted" }] } // history
      // user_id null -> kein subscription select; source null -> kein lead select
    );
    const router = makeRouter(pool);
    const req = mockReq({ params: { id: "r1" } });
    const res = mockRes();
    await callFinal(router, "get", "/subscription-requests/:id", req, res);
    assert.equal(res._status, 200);
    assert.ok(Array.isArray(res._json.data.allowed_next));
    assert.ok(res._json.data.allowed_next.includes("under_review"));
    // BASIS->PLUS ohne INDIVIDUELL -> Self-Service
    assert.equal(res._json.data.can_bypass_staff, true);
  });

  it("404 wenn nicht gefunden", async () => {
    const pool = sequencePool({ rows: [] });
    const router = makeRouter(pool);
    const req = mockReq({ params: { id: "missing" } });
    const res = mockRes();
    await callFinal(router, "get", "/subscription-requests/:id", req, res);
    assert.equal(res._status, 404);
    assert.equal(res._json.error.code, "REQUEST_NOT_FOUND");
  });
});

describe("POST /subscription-requests/:id/transition", () => {
  it("erlaubt submitted -> under_review und schreibt Audit", async () => {
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "submitted", request_type: "upgrade" }] }, // service: SELECT current
      { rows: [{ id: "r1", status: "under_review" }] },                       // service: UPDATE
      { rows: [] },                                                           // service: history insert
      { rows: [] }                                                            // route: writeStaffAudit ok
    );
    const router = makeRouter(pool);
    const req = mockReq({
      params: { id: "r1" },
      body: { confirmed: true, reason: "Test-Begruendung mit ausreichender Laenge", next_status: "under_review" }
    });
    const res = mockRes();
    await callFinal(router, "post", "/subscription-requests/:id/transition", req, res);
    assert.equal(res._status, 200);
    assert.equal(res._json.success, true);
    assert.ok(
      pool.calls.some((c) => /INSERT INTO staff_control_audit_log/i.test(c.sql)),
      "Staff-Audit-Insert wurde geschrieben"
    );
  });

  it("400 wenn next_status fehlt", async () => {
    const pool = sequencePool();
    const router = makeRouter(pool);
    const req = mockReq({ params: { id: "r1" }, body: { confirmed: true, reason: "Test-Begruendung lang genug" } });
    const res = mockRes();
    await callFinal(router, "post", "/subscription-requests/:id/transition", req, res);
    assert.equal(res._status, 400);
    assert.equal(res._json.error.code, "MISSING_NEXT_STATUS");
  });

  it("409 bei INVALID_TRANSITION + schreibt error-Audit", async () => {
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "rejected", request_type: "upgrade" }] }, // SELECT current
      { rows: [] }                                                           // route writeStaffAudit (error path)
    );
    const router = makeRouter(pool);
    const req = mockReq({
      params: { id: "r1" },
      body: { confirmed: true, reason: "Test-Begruendung mit ausreichender Laenge", next_status: "submitted" }
    });
    const res = mockRes();
    await callFinal(router, "post", "/subscription-requests/:id/transition", req, res);
    assert.equal(res._status, 409);
    assert.equal(res._json.error.code, "INVALID_TRANSITION");
  });
});

describe("POST /subscription-requests/:id/reject", () => {
  it("rejected -> 200 + audit", async () => {
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "submitted", request_type: "upgrade" }] }, // SELECT
      { rows: [{ id: "r1", status: "rejected", rejection_reason: "Test-Begruendung mit ausreichender Laenge" }] }, // UPDATE
      { rows: [] },                                                           // history insert
      { rows: [] }                                                            // staff audit
    );
    const router = makeRouter(pool);
    const req = mockReq({
      params: { id: "r1" },
      body: { confirmed: true, reason: "Test-Begruendung mit ausreichender Laenge" }
    });
    const res = mockRes();
    await callFinal(router, "post", "/subscription-requests/:id/reject", req, res);
    assert.equal(res._status, 200);
    assert.equal(res._json.data.status, "rejected");
  });
});

describe("POST /subscription-requests/:id/activate", () => {
  it("activate aus accepted -> 200 mit Auto-Dokumentstatus", async () => {
    // Reihenfolge applyApprovedChange (upgrade, kein Transaction-Wrapping da kein connect()):
    // 0. main SELECT, 1. freeze SELECT → already_frozen, 2. UPDATE organizations,
    // 3. syncOrgActiveAddons UPDATE org_active_addons, 4. UPDATE subscriptions,
    // 5. UPDATE subscription_requests RETURNING *, 6. ensureDocument SELECT,
    // 7. insertHistory, 8. auditLog — + 9. writeStaffAudit (Route-Ebene)
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "accepted", request_type: "upgrade", org_id: "org-1", user_id: "u-1", desired_plan: "PRO", current_plan: "PLUS" }] }, // 0. main SELECT
      { rows: [{ id: "r1", quote_frozen_at: new Date().toISOString(), quote_snapshot: { catalog_version: "test-cat", plan: "PRO" } }] },                  // 1. freeze SELECT → already_frozen
      { rows: [], rowCount: 1 },                                                                                                                           // 2. UPDATE organizations
      { rows: [], rowCount: 0 },                                                                                                                           // 3. syncOrgActiveAddons UPDATE org_active_addons
      { rows: [], rowCount: 1 },                                                                                                                           // 4. UPDATE subscriptions
      { rows: [{ id: "r1", status: "active", request_type: "upgrade" }] },                                                                                // 5. UPDATE subscription_requests RETURNING *
      { rows: [{ id: "doc-ae", document_type: "change_confirmation", document_number: "AE-2026-000001", status: "issued" }] },                            // 6. ensureDocument SELECT (existing)
      { rows: [] },                                                                                                                                        // 7. insertHistory
      { rows: [] },                                                                                                                                        // 8. auditLog
      { rows: [] }                                                                                                                                         // 9. writeStaffAudit
    );
    const router = makeRouter(pool);
    const req = mockReq({
      params: { id: "r1" },
      body: { confirmed: true, reason: "Aktivierung nach Approval freigegeben" }
    });
    const res = mockRes();
    await callFinal(router, "post", "/subscription-requests/:id/activate", req, res);
    assert.equal(res._status, 200);
    assert.equal(res._json.data.status, "active");
    assert.equal(res._json.data.document.document_type, "change_confirmation");
    assert.equal(res._json.data.document.download_available, true);
  });

  it("activate aus submitted -> 409", async () => {
    const pool = sequencePool({ rows: [{ id: "r1", status: "submitted", request_type: "upgrade" }] });
    const router = makeRouter(pool);
    const req = mockReq({
      params: { id: "r1" },
      body: { confirmed: true, reason: "Versuch direkte Aktivierung ohne Approval" }
    });
    const res = mockRes();
    await callFinal(router, "post", "/subscription-requests/:id/activate", req, res);
    assert.equal(res._status, 409);
    assert.equal(res._json.error.code, "NOT_ACCEPTED");
  });
});

describe("POST /subscription-requests/:id/offer", () => {
  it("setzt staff_notes + price + term und erzeugt idempotentes Angebotsdokument", async () => {
    const frozenAt = new Date().toISOString();
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "under_review", staff_notes: "neu", proposed_price_cents: 250000, proposed_term_months: 12, quote_frozen_at: frozenAt, quote_snapshot: { catalog_version: "test-cat", plan: "INDIVIDUELL" } }] },
      { rows: [] },
      { rows: [{ id: "r1", quote_frozen_at: frozenAt, quote_snapshot: { catalog_version: "test-cat", plan: "INDIVIDUELL" } }] },
      { rows: [{ id: "doc-offer", document_type: "offer", document_number: "ANG-2026-000001", status: "issued" }] },
      { rows: [] }
    );
    const router = makeRouter(pool);
    const req = mockReq({
      params: { id: "r1" },
      body: {
        confirmed: true, reason: "Angebots-Eckdaten setzen",
        staff_notes: "neu", proposed_price_cents: 250000, proposed_term_months: 12
      }
    });
    const res = mockRes();
    await callFinal(router, "post", "/subscription-requests/:id/offer", req, res);
    assert.equal(res._status, 200);
    assert.equal(res._json.data.proposed_price_cents, 250000);
    assert.equal(res._json.data.document.document_type, "offer");
    assert.equal(res._json.data.document.already_exists, true);
  });

  it("400 NO_FIELDS wenn keine update-Felder gesetzt sind", async () => {
    const pool = sequencePool();
    const router = makeRouter(pool);
    const req = mockReq({
      params: { id: "r1" },
      body: { confirmed: true, reason: "Leerer Offer-Update" }
    });
    const res = mockRes();
    await callFinal(router, "post", "/subscription-requests/:id/offer", req, res);
    assert.equal(res._status, 400);
    assert.equal(res._json.error.code, "NO_FIELDS");
  });
});

describe("GET /subscription-requests-meta", () => {
  it("liefert request_types + statuses + allowed_transitions", async () => {
    const pool = sequencePool();
    const router = makeRouter(pool);
    const req = mockReq();
    const res = mockRes();
    await callFinal(router, "get", "/subscription-requests-meta", req, res);
    assert.equal(res._status, 200);
    const data = res._json.data;
    assert.ok(data.request_types.includes("upgrade"));
    assert.ok(data.statuses.includes("under_review"));
    assert.ok(Array.isArray(data.allowed_transitions.submitted));
    assert.ok(data.allowed_transitions.submitted.includes("under_review"));
  });
});
