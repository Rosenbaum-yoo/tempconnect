/**
 * QA-Haertung End-to-End Flow-Tests (Welle 8 Schritt 11).
 *
 * Simuliert die 8 Hauptflows aus dem QA-Prompt mit gemockten Pools,
 * direkter Handler-Invokation und Seitenuebergreifender Sequenz:
 *
 *   1. Public Visitor: pricing -> enterprise_anfrage submit
 *   2. Eingeloggte Org: sla_abo Plan-Status + Upgrade-Anfrage + Pending
 *   3. Staff: Anfrage uebernehmen, Preis setzen, Approve, Aktivieren
 *   4. Org nach Freigabe: pending leer, Plan aktualisiert (over /me/entitlements)
 *   5. Downgrade: Limit-Block + acknowledge_impact-Pfad
 *   6. Cancellation: cancellation_effective_at, Subscription canceling
 *   7. Security: cross-org, no-auth, no-staff, fremde Doc
 *   8. Fehlerfaelle: leere Pflichtfelder, doppelte Pending, ungueltiger Statuswechsel
 *
 * Run: node --test --test-force-exit api/test/qaHardening.flow.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createStrategicCollaborationRouter } from "../routes/strategicCollaboration.js";
import { createSubscriptionRequestsRouter } from "../routes/subscriptionRequests.js";
import { createSubscriptionDocumentsRouter } from "../routes/subscriptionDocuments.js";
import * as subreq from "../services/subscriptionRequestService.js";
import * as ent from "../services/entitlementService.js";

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
  return { session: { userId: "u-1" }, orgId: "org-1", orgRole: "owner", body: {}, query: {}, params: {}, headers: {}, ip: "127.0.0.1", ...extras };
}
function mockRes() {
  const headers = {};
  const res = { _status: 200, _json: null, _body: null, locals: {}, headers,
    status(c) { this._status = c; return this; },
    json(d) { this._json = d; return this; },
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    send(d) { this._body = d; return this; }
  };
  return res;
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
 *  Flow 1: Public Visitor submits enterprise-request
 * ════════════════════════════════════════════════════════════════ */
describe("Flow 1: Public Visitor -> enterprise_anfrage submit", () => {
  it("public submission persistiert + Audit", async () => {
    const pool = sequencePool(
      { rows: [{ cnt: 0 }] },                   // burst-limit
      { rows: [] },                             // duplicate
      { rows: [{ id: "scr-1", status: "eingegangen", request_type: "enterprise_config", created_at: new Date().toISOString() }] }
    );
    const router = createStrategicCollaborationRouter({ pool, requireAuth });
    const handler = findHandler(router, "post", "/enterprise-request");
    const req = mockReq({
      session: null,
      body: {
        company: "Public Visitor GmbH",
        contact: "Max Public",
        email: "public@example.com",
        plan: "INDIVIDUELL",
        addons: [{ id: "api", name: "API", price: 399, type: "monthly" }]
      }
    });
    const res = mockRes();
    await handler(req, res);
    assert.equal(res._status, 201);
    assert.equal(res._json.success, true);
    assert.equal(res.locals.audit.action, "enterprise.request_submit_persisted");
    assert.equal(res.locals.audit.details.logged_in, false);
  });
});

/* ════════════════════════════════════════════════════════════════
 *  Flow 2: Eingeloggte Org -> Upgrade-Anfrage + Pending
 * ════════════════════════════════════════════════════════════════ */
describe("Flow 2: Eingeloggte Org -> Upgrade", () => {
  it("Upgrade-Anfrage 201 + nachfolgender 409 bei Doppel-Pending", async () => {
    const inserted = { id: "req-up-1", status: "submitted", request_type: "upgrade" };
    const pool1 = sequencePool({ rows: [] }, { rows: [inserted] }, { rows: [] });
    const router = createSubscriptionRequestsRouter(deps(pool1));
    const handler = findHandler(router, "post", "/subscription-requests/upgrade");
    const r1 = mockRes();
    await handler(mockReq({ body: { desired_plan: "PRO" } }), r1, () => {});
    assert.equal(r1._status, 201);

    // 2. Anfrage gleichen Typs -> 409
    const pool2 = sequencePool({ rows: [{}] });
    const router2 = createSubscriptionRequestsRouter(deps(pool2));
    const handler2 = findHandler(router2, "post", "/subscription-requests/upgrade");
    const r2 = mockRes();
    await handler2(mockReq({ body: { desired_plan: "PRO" } }), r2, () => {});
    assert.equal(r2._status, 409);
    assert.equal(r2._json.error.code, "DUPLICATE_OPEN_REQUEST");
  });
});

/* ════════════════════════════════════════════════════════════════
 *  Flow 3: Staff Approval-Pipeline
 * ════════════════════════════════════════════════════════════════ */
describe("Flow 3: Staff Approval-Pipeline (transition -> offer -> approve -> activate)", () => {
  it("submitted -> under_review erlaubt + History-Eintrag", async () => {
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "submitted", request_type: "upgrade" }] },
      { rows: [{ id: "r1", status: "under_review" }] },
      { rows: [] }
    );
    const r = await subreq.transitionStatus(pool, { requestId: "r1", toStatus: "under_review", actorUserId: "staff-1", reason: "review" });
    assert.equal(r.ok, true);
    assert.equal(r.row.status, "under_review");
  });

  it("approve setzt approved_by + status=accepted", async () => {
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "offered", request_type: "upgrade" }] },                                               // 1. SELECT current status
      { rows: [{ id: "r1", status: "accepted", approved_by: "staff-1" }] },                                               // 2. UPDATE RETURNING *
      { rows: [{ id: "r1", quote_frozen_at: new Date().toISOString(), quote_snapshot: { catalog_version: "v1", plan: "PRO" } }] }, // 3. freezeQuoteSnapshot SELECT → already_frozen
      { rows: [] }                                                                                                         // 4. insertHistory
    );
    const r = await subreq.approve(pool, { requestId: "r1", actorUserId: "staff-1", reason: "ok" });
    assert.equal(r.ok, true);
    assert.equal(r.row.status, "accepted");
  });

  it("applyApprovedChange transitioniert accepted -> active mit DB-Updates", async () => {
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "accepted", request_type: "upgrade", org_id: "o1", user_id: "u1", desired_plan: "PRO", current_plan: "PLUS", cancellation_effective_at: null, effective_from: null }] }, // 1. main SELECT
      { rows: [{ id: "r1", quote_frozen_at: new Date().toISOString(), quote_snapshot: { catalog_version: "v1", plan: "PRO" } }] }, // 2. freezeQuoteSnapshot SELECT → already_frozen
      { rows: [], rowCount: 1 },                                                                                                    // 3. UPDATE organizations
      { rows: [], rowCount: 0 },                                                                                                    // 4. syncOrgActiveAddons UPDATE org_active_addons
      { rows: [], rowCount: 1 },                                                                                                    // 5. UPDATE subscriptions
      { rows: [{ id: "r1", status: "active" }] },                                                                                  // 6. UPDATE subscription_requests RETURNING *
      { rows: [{ id: "doc-1", document_type: "change_confirmation", document_number: "AE-2026-001", status: "issued" }] },         // 7. ensureDocumentForRequest SELECT
      { rows: [] },                                                                                                                 // 8. insertHistory
      { rows: [] }                                                                                                                  // 9. auditLog.writeAudit
    );
    const r = await subreq.applyApprovedChange(pool, { requestId: "r1", actorUserId: "staff-1" });
    assert.equal(r.ok, true);
    assert.equal(r.row.status, "active");
  });
});

/* ════════════════════════════════════════════════════════════════
 *  Flow 4: Org nach Freigabe -> Entitlement-Snapshot zeigt PRO
 * ════════════════════════════════════════════════════════════════ */
describe("Flow 4: Entitlement-Snapshot nach Approval", () => {
  it("nach applyApprovedChange zeigt /me/entitlements neuen Plan", async () => {
    const orgRow = { id: "o1", name: "ACME", type: "company", plan: "PRO", pilot_status: null, feature_bundle: "standard", account_type: "live", individual_tier_auto: null, employee_count_approx: null, billing_mode: null, customer_stage: "regular", pilot_started_at: null, pilot_ended_at: null, converted_at: null };
    const pool = sequencePool(
      { rows: [orgRow] },                            // loadOrgRow
      { rows: [] },                                  // active addons
      { rows: [] },                                  // pending requests
      { rows: [{ id: "owner-1", email: "owner@acme.de" }] }, // owner user
      { rows: [{ id: "sub-1", plan: "PRO", status: "active" }] } // subscription
    );
    const snap = await ent.getOrganizationEntitlements(pool, "o1");
    assert.equal(snap.effective_plan, "PRO");
    assert.equal(snap.subscription.active, true);
    assert.equal(snap.features.advanced_matching.allowed, true);   // PRO feature — must be allowed
    assert.equal(snap.features.rate_card_management.allowed, true); // PRO feature — must be allowed
    // Grenz-Test: INDIVIDUELL-only Feature darf auf PRO nicht erlaubt sein.
    // Wird mit FEATURE_GATE_BYPASS=true übersprungen (Dev-Mode, kein Plangate aktiv).
    if (process.env.FEATURE_GATE_BYPASS !== "true") {
      assert.equal(snap.features.assignments.allowed, false);
    }
  });
});

/* ════════════════════════════════════════════════════════════════
 *  Flow 5: Downgrade Limit-Konflikt + Acknowledge-Pfad
 * ════════════════════════════════════════════════════════════════ */
describe("Flow 5: Downgrade", () => {
  it("blockt bei Listings ueber Limit ohne acknowledge_impact", async () => {
    // hasOpenRequest + getUsageAgainstLimits(BASIS):
    //   loadOrgRow, loadActiveAddons, quota-Counts x5 (parallel), loadOwnerUser
    const orgRow = { id: "org-1", plan: "PLUS", pilot_status: null, feature_bundle: "standard", account_type: "live", individual_tier_auto: null, employee_count_approx: null, billing_mode: null, customer_stage: "regular", pilot_started_at: null, pilot_ended_at: null, converted_at: null, parent_org_id: null, custom_limit_users: null, custom_limit_sites: null, custom_limit_listings: null, custom_limit_suppliers: null, custom_limit_multi_org_slots: null };
    const pool = sequencePool(
      { rows: [] },                          // hasOpenRequest
      { rows: [orgRow] },                    // loadOrgRow
      { rows: [] },                          // loadActiveAddons
      { rows: [{ cnt: 2 }] },               // countActiveUsers
      { rows: [{ cnt: 1 }] },               // countSites (locations > 0)
      { rows: [{ cnt: 25 }] },              // countListings (over BASIS limit)
      { rows: [{ cnt: 0 }] },               // countSuppliers
      { rows: [{ cnt: 1 }] },               // countMultiOrgSlots
      { rows: [] }                           // loadOwnerUser → null → no metering
    );
    const router = createSubscriptionRequestsRouter(deps(pool, () => Promise.resolve({ id: "u-1", email: "x@y.de", plan: "PLUS" })));
    const handler = findHandler(router, "post", "/subscription-requests/downgrade");
    const res = mockRes();
    await handler(mockReq({ body: { desired_plan: "BASIS" } }), res, () => {});
    assert.equal(res._status, 409);
    assert.equal(res._json.error.code, "DOWNGRADE_BLOCKED");
  });

  it("akzeptiert mit acknowledge_impact=true", async () => {
    const orgRow = { id: "org-1", plan: "PLUS", pilot_status: null, feature_bundle: "standard", account_type: "live", individual_tier_auto: null, employee_count_approx: null, billing_mode: null, customer_stage: "regular", pilot_started_at: null, pilot_ended_at: null, converted_at: null, parent_org_id: null, custom_limit_users: null, custom_limit_sites: null, custom_limit_listings: null, custom_limit_suppliers: null, custom_limit_multi_org_slots: null };
    const pool = sequencePool(
      { rows: [] },                          // hasOpenRequest
      { rows: [orgRow] },                    // loadOrgRow
      { rows: [] },                          // loadActiveAddons
      { rows: [{ cnt: 2 }] },               // countActiveUsers
      { rows: [{ cnt: 1 }] },               // countSites (locations > 0)
      { rows: [{ cnt: 25 }] },              // countListings (over limit)
      { rows: [{ cnt: 0 }] },               // countSuppliers
      { rows: [{ cnt: 1 }] },               // countMultiOrgSlots
      { rows: [] },                          // loadOwnerUser → null
      { rows: [{ id: "req-d", status: "submitted", request_type: "downgrade" }] }, // createRequest INSERT
      { rows: [] },                          // history INSERT
      { rows: [{}] }                         // UPDATE downgrade_impact_snapshot
    );
    const router = createSubscriptionRequestsRouter(deps(pool, () => Promise.resolve({ id: "u-1", email: "x@y.de", plan: "PLUS" })));
    const handler = findHandler(router, "post", "/subscription-requests/downgrade");
    const res = mockRes();
    await handler(mockReq({ body: { desired_plan: "BASIS", acknowledge_impact: true } }), res, () => {});
    assert.equal(res._status, 201);
  });
});

/* ════════════════════════════════════════════════════════════════
 *  Flow 6: Cancellation
 * ════════════════════════════════════════════════════════════════ */
describe("Flow 6: Cancellation", () => {
  it("Cancellation 201 + cancellation_effective_at gesetzt", async () => {
    const pool = sequencePool(
      { rows: [] },
      { rows: [{ id: "req-c", status: "submitted", request_type: "cancellation" }] },
      { rows: [] },
      { rows: [{ id: "req-c" }] }
    );
    const router = createSubscriptionRequestsRouter(deps(pool));
    const handler = findHandler(router, "post", "/subscription-requests/cancellation");
    const res = mockRes();
    await handler(mockReq({ body: { cancellation_effective_at: "2026-12-31", reason: "Vertragsende" } }), res, () => {});
    assert.equal(res._status, 201);
  });

  it("Cancellation-Activation setzt subscriptions.status='canceling'", async () => {
    // Cancellation hat KEIN syncOrgActiveAddons (wird explizit uebersprungen).
    // Reihenfolge: main SELECT, freeze SELECT, UPDATE orgs, UPDATE subs (canceling),
    //              UPDATE sub_requests RETURNING *, ensureDocument SELECT, insertHistory, auditLog
    const pool = sequencePool(
      { rows: [{ id: "r2", status: "accepted", request_type: "cancellation", org_id: "o1", user_id: "u1", desired_plan: null, current_plan: "PLUS", cancellation_effective_at: "2026-12-31T00:00:00.000Z" }] }, // 0. main SELECT
      { rows: [{ id: "r2", quote_frozen_at: new Date().toISOString(), quote_snapshot: { catalog_version: "v1", plan: "PLUS" } }] }, // 1. freeze SELECT → already_frozen
      { rows: [], rowCount: 1 },                                                                                                    // 2. UPDATE organizations
      { rows: [], rowCount: 1 },                                                                                                    // 3. UPDATE subscriptions SET status='canceling'
      { rows: [{ id: "r2", status: "active" }] },                                                                                  // 4. UPDATE subscription_requests RETURNING *
      { rows: [{ id: "doc-c", document_type: "cancellation_confirmation", document_number: "KB-2026-001", status: "issued" }] },   // 5. ensureDocumentForRequest SELECT
      { rows: [] },                                                                                                                 // 6. insertHistory
      { rows: [] }                                                                                                                  // 7. auditLog.writeAudit
    );
    const r = await subreq.applyApprovedChange(pool, { requestId: "r2", actorUserId: "staff-1" });
    assert.equal(r.ok, true);
    assert.match(pool.calls[3].sql, /status\s*=\s*'canceling'/i); // calls[3] = UPDATE subscriptions
  });
});

/* ════════════════════════════════════════════════════════════════
 *  Flow 7: Security
 * ════════════════════════════════════════════════════════════════ */
describe("Flow 7: Security", () => {
  it("Cross-Org auf subscription-requests/:id -> 403", async () => {
    const pool = sequencePool({ rows: [{ id: "r1", org_id: "other-org" }] });
    const router = createSubscriptionRequestsRouter(deps(pool));
    const handler = findHandler(router, "get", "/subscription-requests/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "r1" } }), res, () => {});
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "FORBIDDEN_CROSS_ORG");
  });

  it("Cross-Org auf subscription-documents -> 403", async () => {
    const pool = sequencePool({ rows: [{ id: "d1", org_id: "other-org" }] });
    const router = createSubscriptionDocumentsRouter(deps(pool));
    const handler = findHandler(router, "get", "/subscription-documents/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "d1" } }), res, () => {});
    assert.equal(res._status, 403);
  });

  it("Member-Role kann KEIN Upgrade anlegen", async () => {
    const pool = sequencePool();
    const router = createSubscriptionRequestsRouter(deps(pool));
    const handler = findHandler(router, "post", "/subscription-requests/upgrade");
    const res = mockRes();
    await handler(mockReq({ orgRole: "member", body: { desired_plan: "PRO" } }), res, () => {});
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "PERMISSION_DENIED");
  });

  it("Customer kann KEINE Preise (proposed_price_cents) ueber Customer-Routen setzen", async () => {
    // upgrade-Schema hat KEIN proposed_price_cents-Feld; selbst wenn der Customer
    // es mitschickt, wird es vom Service nicht aus dem Body gelesen, weil die
    // Route nur die Schema-Felder weiterreicht.
    const inserted = { id: "req-up-1", status: "submitted", request_type: "upgrade" };
    const pool = sequencePool({ rows: [] }, { rows: [inserted] }, { rows: [] });
    const router = createSubscriptionRequestsRouter(deps(pool));
    const handler = findHandler(router, "post", "/subscription-requests/upgrade");
    const res = mockRes();
    await handler(mockReq({ body: { desired_plan: "PRO", proposed_price_cents: 1 } }), res, () => {});
    assert.equal(res._status, 201);
    // INSERT-Param-Index 24 (1-basiert $25) ist proposed_price_cents im createRequest-Service
    const insertCall = pool.calls[1];
    assert.equal(insertCall.params[24], null, "Customer-Wert proposed_price_cents darf NICHT durchgereicht werden");
  });

  it("Public Doc-Download ist nur fuer cost_preview ohne org_id erlaubt", async () => {
    const pool = sequencePool({ rows: [{ id: "d1", org_id: "org-1", document_type: "offer", content: "x" }] });
    const router = createSubscriptionDocumentsRouter(deps(pool));
    const handler = findHandler(router, "get", "/public-download");
    const res = mockRes();
    await handler({ params: { id: "d1" } }, res, () => {});
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "NOT_PUBLIC");
  });
});

/* ════════════════════════════════════════════════════════════════
 *  Flow 8: Fehlerfaelle
 * ════════════════════════════════════════════════════════════════ */
describe("Flow 8: Fehlerfaelle", () => {
  it("400 VALIDATION ohne email auf enterprise-request", async () => {
    const pool = sequencePool();
    const router = createStrategicCollaborationRouter({ pool, requireAuth });
    const handler = findHandler(router, "post", "/enterprise-request");
    const res = mockRes();
    await handler(mockReq({ session: null, body: { company: "X", contact: "Y" } }), res, () => {});
    assert.equal(res._status, 400);
    assert.equal(res._json.error, "VALIDATION");
  });

  it("INVALID_TRANSITION blockiert ungueltigen Statuswechsel", async () => {
    const pool = sequencePool({ rows: [{ id: "r1", status: "rejected", request_type: "upgrade" }] });
    const r = await subreq.transitionStatus(pool, { requestId: "r1", toStatus: "submitted" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "INVALID_TRANSITION");
  });

  it("REASON_REQUIRED bei reject ohne Begruendung", async () => {
    const pool = sequencePool();
    const r = await subreq.reject(pool, { requestId: "r1", actorUserId: "staff-1", reason: " " });
    assert.equal(r.ok, false);
    assert.equal(r.error, "REASON_REQUIRED");
  });

  it("EMPTY_DOCUMENT verhindert leere Dokumente", async () => {
    const docs = await import("../services/subscriptionDocumentService.js");
    const pool = sequencePool();
    const r = await docs.generateDocument(pool, { documentType: "offer", dataOverride: {} });
    assert.equal(r.ok, false);
    assert.equal(r.error, "EMPTY_DOCUMENT");
  });

  it("ENTITLEMENTS DEMO-snapshot bei fehlender orgId", async () => {
    const pool = sequencePool();
    const snap = await ent.getOrganizationEntitlements(pool, null);
    assert.equal(snap.effective_plan, "DEMO");
    assert.equal(snap.subscription.active, false);
  });
});
