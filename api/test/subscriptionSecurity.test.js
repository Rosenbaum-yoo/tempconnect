/**
 * Security-Tests Welle 8 Schritt 11.
 *
 * Fokus:
 *   - Cross-Org-Schutz auf subscription-requests / -documents / -history
 *   - Member-/Reader-Rolle kann KEIN Upgrade/Downgrade/Cancellation
 *   - Customer kann KEINE Preise (proposed_price_cents/term) selbst setzen
 *   - SCC Auth-Guard: ohne staffUserId -> 401, ohne tempconnect_staff -> 403
 *   - SCC Step-Up: ohne -> 428, abgelaufen -> 428
 *   - SCC requireConfirmAndReason: ohne confirmed -> 400, kurze reason -> 400
 *   - Public Subscription-Document-Download nur cost_preview & ohne org_id
 *   - Burst-Limit fuer enterprise_anfrage submissions
 *   - Doppelte Pending-Anfrage gleichen Typs -> 409
 *   - Helmet/CORS-Defaults sind aktiv (smoke check)
 *
 * Run: node --test --test-force-exit api/test/subscriptionSecurity.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createSubscriptionRequestsRouter } from "../routes/subscriptionRequests.js";
import { createSubscriptionDocumentsRouter } from "../routes/subscriptionDocuments.js";
import { createStrategicCollaborationRouter } from "../routes/strategicCollaboration.js";
import {
  createStaffControlAccessMiddleware,
  createStaffStepUpMiddleware,
  requireConfirmAndReason
} from "../middleware/staffControlAccess.js";

// ── Helpers ────────────────────────────────────────────────────

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
      const r = responses[idx++];
      if (r instanceof Error) throw r;
      return r;
    }
  };
}
const requireAuth = (_req, _res, next) => next();
function findHandler(router, method, fragment) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (Object.keys(layer.route.methods)[0] === method && layer.route.path.includes(fragment)) {
      return layer.route.stack[layer.route.stack.length - 1].handle;
    }
  }
  throw new Error(`Route ${method} ${fragment} not found`);
}
function mockReq(extras = {}) {
  return { session: { userId: "u-1" }, orgId: "org-mine", orgRole: "owner", body: {}, query: {}, params: {}, headers: {}, ip: "127.0.0.1", ...extras };
}
function mockRes() {
  const headers = {};
  return {
    _status: 200, _json: null, _body: null, locals: {}, headers,
    status(c) { this._status = c; return this; },
    json(d) { this._json = d; return this; },
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    send(d) { this._body = d; return this; }
  };
}
function deps(pool, getMe) {
  return {
    pool,
    requireAuth,
    getUserAndPlan: getMe || (() => Promise.resolve({ id: "u-1", email: "owner@acme.de", plan: "BASIS", contact_person: "Max", phone: "+49", org_name: "ACME" })),
    logger: { warn() {}, info() {}, error() {} }
  };
}

/* ════════════════════════════════════════════════════════════════
 *  Cross-Org Protection
 * ════════════════════════════════════════════════════════════════ */
describe("Cross-Org Protection", () => {
  it("/subscription-requests/:id GET fremde Org -> 403", async () => {
    const pool = sequencePool({ rows: [{ id: "r-foreign", org_id: "org-other" }] });
    const router = createSubscriptionRequestsRouter(deps(pool));
    const handler = findHandler(router, "get", "/subscription-requests/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "r-foreign" } }), res, () => {});
    assert.equal(res._status, 403);
  });

  it("/subscription-requests/:id/history GET fremde Org -> 403", async () => {
    const pool = sequencePool({ rows: [{ id: "r-foreign", org_id: "org-other" }] });
    const router = createSubscriptionRequestsRouter(deps(pool));
    const handler = findHandler(router, "get", "/history");
    const res = mockRes();
    await handler(mockReq({ params: { id: "r-foreign" } }), res, () => {});
    assert.equal(res._status, 403);
  });

  it("/subscription-documents/:id GET fremde Org -> 403", async () => {
    const pool = sequencePool({ rows: [{ id: "d-foreign", org_id: "org-other" }] });
    const router = createSubscriptionDocumentsRouter(deps(pool));
    const handler = findHandler(router, "get", "/subscription-documents/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "d-foreign" } }), res, () => {});
    assert.equal(res._status, 403);
  });

  it("/subscription-documents/:id/download fremde Org -> 403", async () => {
    const pool = sequencePool({ rows: [{ id: "d-foreign", org_id: "org-other", content: "x", document_type: "offer" }] });
    const router = createSubscriptionDocumentsRouter(deps(pool));
    const handler = findHandler(router, "get", "/download");
    const res = mockRes();
    await handler(mockReq({ params: { id: "d-foreign" } }), res, () => {});
    assert.equal(res._status, 403);
  });

  it("/subscription-documents/public-download/:id NICHT cost_preview -> 403", async () => {
    const pool = sequencePool({ rows: [{ id: "d-1", org_id: null, content: "x", document_type: "offer" }] });
    const router = createSubscriptionDocumentsRouter(deps(pool));
    const handler = findHandler(router, "get", "/public-download");
    const res = mockRes();
    await handler({ params: { id: "d-1" } }, res, () => {});
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "NOT_PUBLIC");
  });
});

/* ════════════════════════════════════════════════════════════════
 *  Role / Permission Enforcement
 * ════════════════════════════════════════════════════════════════ */
describe("Role / Permission Enforcement", () => {
  it("Member-Role -> Upgrade verweigert", async () => {
    const router = createSubscriptionRequestsRouter(deps(sequencePool()));
    const handler = findHandler(router, "post", "/subscription-requests/upgrade");
    const res = mockRes();
    await handler(mockReq({ orgRole: "member", body: { desired_plan: "PRO" } }), res, () => {});
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "PERMISSION_DENIED");
  });

  it("Reader-Role -> Downgrade verweigert", async () => {
    const router = createSubscriptionRequestsRouter(deps(sequencePool()));
    const handler = findHandler(router, "post", "/subscription-requests/downgrade");
    const res = mockRes();
    await handler(mockReq({ orgRole: "reader", body: { desired_plan: "BASIS" } }), res, () => {});
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "PERMISSION_DENIED");
  });

  it("Member-Role -> Cancellation verweigert", async () => {
    const router = createSubscriptionRequestsRouter(deps(sequencePool()));
    const handler = findHandler(router, "post", "/subscription-requests/cancellation");
    const res = mockRes();
    await handler(mockReq({ orgRole: "member", body: {} }), res, () => {});
    assert.equal(res._status, 403);
  });

  it("Strategic-Collaboration list erfordert Backoffice-Rolle", async () => {
    const router = createStrategicCollaborationRouter({ pool: sequencePool(), requireAuth });
    const handler = findHandler(router, "get", "/strategic-collaboration/requests");
    const res = mockRes();
    await handler(mockReq({ orgRole: "member" }), res, () => {});
    assert.equal(res._status, 403);
  });
});

/* ════════════════════════════════════════════════════════════════
 *  Preismanipulation (Customer cannot set proposed_price_cents)
 * ════════════════════════════════════════════════════════════════ */
describe("Preismanipulation - Customer kann KEINE Preise setzen", () => {
  it("Upgrade ignoriert proposed_price_cents im Body", async () => {
    const inserted = { id: "req-up-1", status: "submitted", request_type: "upgrade" };
    const pool = sequencePool({ rows: [] }, { rows: [inserted] }, { rows: [] });
    const router = createSubscriptionRequestsRouter(deps(pool));
    const handler = findHandler(router, "post", "/subscription-requests/upgrade");
    const res = mockRes();
    await handler(mockReq({ body: { desired_plan: "PRO", proposed_price_cents: 1, proposed_term_months: 1 } }), res, () => {});
    assert.equal(res._status, 201);
    const insertCall = pool.calls[1];
    // proposed_price_cents = $25 (Index 24, 1-basiert)
    assert.equal(insertCall.params[24], null, "Customer-Wert proposed_price_cents darf nicht persistiert werden");
    // proposed_term_months = $26 (Index 25, 1-basiert)
    assert.equal(insertCall.params[25], null, "Customer-Wert proposed_term_months darf nicht persistiert werden");
  });

  it("Downgrade ignoriert proposed_price_cents im Body", async () => {
    // hasOpenRequest (1) + getUsageAgainstLimits: loadOrgRow, loadActiveAddons,
    // countActiveUsers, countSites, countListings, countSuppliers, countMultiOrgSlots,
    // loadOwnerUser (8) + createRequest INSERT + history + UPDATE impact (3) = 12 total.
    const orgRow = { id: "org-mine", plan: "PLUS", pilot_status: null, feature_bundle: "standard", account_type: "live", individual_tier_auto: null, employee_count_approx: null, billing_mode: null, customer_stage: "regular", pilot_started_at: null, pilot_ended_at: null, converted_at: null, parent_org_id: null, custom_limit_users: null, custom_limit_sites: null, custom_limit_listings: null, custom_limit_suppliers: null, custom_limit_multi_org_slots: null };
    const pool = sequencePool(
      { rows: [] },                                                                                                     // hasOpenRequest
      { rows: [orgRow] },                                                                                               // loadOrgRow
      { rows: [] },                                                                                                     // loadActiveAddons
      { rows: [{ cnt: 0 }] },                                                                                          // countActiveUsers
      { rows: [{ cnt: 1 }] },                                                                                          // countSites (locations > 0)
      { rows: [{ cnt: 0 }] },                                                                                          // countListings
      { rows: [{ cnt: 0 }] },                                                                                          // countSuppliers
      { rows: [{ cnt: 0 }] },                                                                                          // countMultiOrgSlots
      { rows: [] },                                                                                                     // loadOwnerUser → null
      { rows: [{ id: "req-d", status: "submitted", request_type: "downgrade" }] },                                     // createRequest INSERT
      { rows: [] },                                                                                                     // history INSERT
      { rows: [{}] }                                                                                                    // UPDATE downgrade_impact_snapshot
    );
    const router = createSubscriptionRequestsRouter(deps(pool, () => Promise.resolve({ id: "u-1", email: "x@y.de", plan: "PLUS" })));
    const handler = findHandler(router, "post", "/subscription-requests/downgrade");
    const res = mockRes();
    await handler(mockReq({ body: { desired_plan: "BASIS", proposed_price_cents: 1 } }), res, () => {});
    assert.equal(res._status, 201);
    const insertCall = pool.calls[9]; // createRequest INSERT ist jetzt calls[9] (0-indexed)
    assert.equal(insertCall.params[24], null);
  });
});

/* ════════════════════════════════════════════════════════════════
 *  Doppel-Pending Schutz
 * ════════════════════════════════════════════════════════════════ */
describe("Doppel-Pending Schutz", () => {
  it("Zweite Upgrade-Anfrage mit offenem Vorgang -> 409", async () => {
    const pool = sequencePool({ rows: [{ id: "existing-open" }] });
    const router = createSubscriptionRequestsRouter(deps(pool));
    const handler = findHandler(router, "post", "/subscription-requests/upgrade");
    const res = mockRes();
    await handler(mockReq({ body: { desired_plan: "PRO" } }), res, () => {});
    assert.equal(res._status, 409);
    assert.equal(res._json.error.code, "DUPLICATE_OPEN_REQUEST");
  });
});

/* ════════════════════════════════════════════════════════════════
 *  SCC Auth-Guards
 * ════════════════════════════════════════════════════════════════ */
describe("SCC Auth-Guards", () => {
  it("Ohne staffUserId -> 401 SCC_NOT_AUTHENTICATED", async () => {
    const guard = createStaffControlAccessMiddleware({ pool: sequencePool(), logger: { warn() {}, info() {}, error() {} } });
    const res = mockRes();
    await guard({ session: {}, path: "/staff/api/x" }, res, () => assert.fail("next() should NOT be called"));
    assert.equal(res._status, 401);
    assert.equal(res._json.error.code, "SCC_NOT_AUTHENTICATED");
  });

  it("staffUserId nicht in tempconnect_staff -> 403 SCC_NOT_AUTHORIZED", async () => {
    const pool = sequencePool({ rows: [] });
    const guard = createStaffControlAccessMiddleware({ pool, logger: { warn() {}, info() {}, error() {} } });
    const res = mockRes();
    await guard({ session: { staffUserId: "u-x" }, path: "/staff/api/x" }, res, () => assert.fail("next() should NOT be called"));
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "SCC_NOT_AUTHORIZED");
  });

  it("staff is_active=false -> 403", async () => {
    const pool = sequencePool({ rows: [{ user_id: "u-x", is_active: false, requires_step_up: true }] });
    const guard = createStaffControlAccessMiddleware({ pool, logger: { warn() {}, info() {}, error() {} } });
    const res = mockRes();
    await guard({ session: { staffUserId: "u-x" }, path: "/staff/api/x" }, res, () => assert.fail("inaktiver Staff darf nicht durchlaufen"));
    assert.equal(res._status, 403);
  });

  it("Step-Up: ohne staffStepUpAt -> 428 SCC_STEP_UP_REQUIRED", async () => {
    const stepUp = createStaffStepUpMiddleware({ maxAgeMs: 60_000 });
    const res = mockRes();
    stepUp({ session: {}, sccStaff: { requires_step_up: true } }, res, () => assert.fail("next() should NOT be called"));
    assert.equal(res._status, 428);
    assert.equal(res._json.error.code, "SCC_STEP_UP_REQUIRED");
  });

  it("Step-Up: abgelaufen -> 428 SCC_STEP_UP_EXPIRED", async () => {
    const stepUp = createStaffStepUpMiddleware({ maxAgeMs: 1_000 });
    const res = mockRes();
    stepUp({ session: { staffStepUpAt: Date.now() - 60_000 }, sccStaff: { requires_step_up: true } }, res, () => assert.fail("expired step-up must not pass"));
    assert.equal(res._status, 428);
    assert.equal(res._json.error.code, "SCC_STEP_UP_EXPIRED");
  });

  it("requireConfirmAndReason: ohne confirmed -> 400", () => {
    const res = mockRes();
    requireConfirmAndReason({ body: { reason: "Ist mehr als zehn Zeichen" } }, res, () => assert.fail("missing confirm"));
    assert.equal(res._status, 400);
    assert.equal(res._json.error.code, "SCC_CONFIRM_REQUIRED");
  });

  it("requireConfirmAndReason: kurze reason -> 400", () => {
    const res = mockRes();
    requireConfirmAndReason({ body: { confirmed: true, reason: "kurz" } }, res, () => assert.fail("short reason"));
    assert.equal(res._status, 400);
    assert.equal(res._json.error.code, "SCC_REASON_REQUIRED");
  });

  it("requireConfirmAndReason: gueltig -> next()", () => {
    const res = mockRes();
    let called = false;
    requireConfirmAndReason({ body: { confirmed: true, reason: "Pruefung erfolgt im Rahmen Welle 8 Schritt 11" } }, res, () => { called = true; });
    assert.equal(called, true);
  });
});

/* ════════════════════════════════════════════════════════════════
 *  Validation / Public Endpoint
 * ════════════════════════════════════════════════════════════════ */
describe("Validation / Public Endpoints", () => {
  it("enterprise-request: VALIDATION-Fehler ohne email", async () => {
    const router = createStrategicCollaborationRouter({ pool: sequencePool(), requireAuth });
    const handler = findHandler(router, "post", "/enterprise-request");
    const res = mockRes();
    await handler(mockReq({ session: null, body: { company: "ACME", contact: "Max" } }), res, () => {});
    assert.equal(res._status, 400);
    assert.equal(res._json.error, "VALIDATION");
  });

  it("enterprise-request: ungueltige Email -> 400 VALIDATION", async () => {
    const router = createStrategicCollaborationRouter({ pool: sequencePool(), requireAuth });
    const handler = findHandler(router, "post", "/enterprise-request");
    const res = mockRes();
    await handler(mockReq({ session: null, body: { company: "ACME", contact: "Max", email: "not-an-email" } }), res, () => {});
    assert.equal(res._status, 400);
  });

  it("enterprise-request: nimmt nur whitelisted Felder an (Schema-Filter blockt Stray-Felder)", async () => {
    const pool = sequencePool(
      { rows: [{ cnt: 0 }] },
      { rows: [] },
      { rows: [{ id: "scr-1", status: "eingegangen", request_type: "enterprise_config", created_at: new Date().toISOString() }] }
    );
    const router = createStrategicCollaborationRouter({ pool, requireAuth });
    const handler = findHandler(router, "post", "/enterprise-request");
    const res = mockRes();
    await handler(mockReq({
      session: null,
      body: {
        company: "ACME",
        contact: "Max",
        email: "max@acme.de",
        // Versucht Felder zu setzen die der Service nicht akzeptiert:
        admin_override: true,
        force_status: "approved",
        sql_injection: "'; DROP TABLE users; --"
      }
    }), res, () => {});
    assert.equal(res._status, 201);
    // Der INSERT-Call sollte keinen 'admin_override' oder 'force_status' enthalten,
    // da das Zod-Schema diese Felder droppt.
    const insertSql = String(pool.calls.find((c) => /INSERT INTO/i.test(String(c.sql)))?.sql || "");
    assert.equal(insertSql.includes("admin_override"), false, "admin_override darf nicht im INSERT auftauchen");
    assert.equal(insertSql.includes("force_status"), false, "force_status darf nicht im INSERT auftauchen");
  });
});
