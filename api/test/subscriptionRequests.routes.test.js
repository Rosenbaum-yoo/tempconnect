/**
 * subscriptionRequests routes + service-extensions tests (Welle 8 Schritt 8).
 *
 * Verifiziert:
 *   - POST /subscription-requests/upgrade legt Anfrage an + Audit
 *   - POST /subscription-requests/downgrade blockt bei Listings ueber Limit
 *     ohne acknowledge_impact, akzeptiert mit acknowledge_impact
 *   - POST /subscription-requests/cancellation legt Anfrage mit
 *     cancellation_effective_at an
 *   - Doppelte Pending-Anfrage je type wird mit 409 abgelehnt
 *   - GET /subscription-requests/:id 403 fuer fremde Org
 *   - applyApprovedChange transitioniert nur aus 'accepted'
 *   - previewDowngradeImpact erkennt features_lost und blocked
 *
 * Run: node --test --test-force-exit api/test/subscriptionRequests.routes.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createSubscriptionRequestsRouter } from "../routes/subscriptionRequests.js";
import * as subreq from "../services/subscriptionRequestService.js";

// ── Helper ─────────────────────────────────────────────────────

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

function transactionPool(...responses) {
  let idx = 0;
  const calls = [];
  let released = false;
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(String(sql).trim())) {
        return { rows: [] };
      }
      if (idx >= responses.length) {
        throw new Error(`Unexpected query #${idx + 1}: ${String(sql).slice(0, 80)}`);
      }
      const r = responses[idx++];
      if (r instanceof Error) throw r;
      return r;
    },
    release: () => { released = true; }
  };
  return {
    calls,
    connect: async () => client,
    get released() { return released; }
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
  return {
    session: { userId: "u-1" },
    orgId: "org-1",
    orgRole: "owner",
    body: {},
    query: {},
    params: {},
    ...extras
  };
}

function mockRes() {
  const res = {
    _status: 200,
    _json: null,
    locals: {},
    status(c) { this._status = c; return this; },
    json(d) { this._json = d; return this; }
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

function baseOrgRow(overrides = {}) {
  return {
    id: "org-1",
    name: "ACME",
    type: "company",
    plan: "PLUS",
    pilot_status: null,
    feature_bundle: "standard",
    account_type: "live",
    individual_tier_auto: null,
    employee_count_approx: null,
    billing_mode: null,
    customer_stage: "regular",
    pilot_started_at: null,
    pilot_ended_at: null,
    converted_at: null,
    parent_org_id: null,
    is_active: true,
    custom_limit_users: null,
    custom_limit_sites: null,
    custom_limit_listings: null,
    custom_limit_suppliers: null,
    custom_limit_multi_org_slots: null,
    ...overrides
  };
}

function entitlementUsageResponses({
  users = 1,
  sites = 1,
  listings = 0,
  suppliers = 0,
  multiOrgSlots = 1,
  orgOverrides = {}
} = {}) {
  return [
    { rows: [baseOrgRow(orgOverrides)] },      // loadOrgRow
    { rows: [] },                              // loadActiveAddons aus org_active_addons
    { rows: [{ cnt: users }] },                // countActiveUsers
    { rows: [{ cnt: sites }] },                // countSites (locations > 0, kein departments-Fallback)
    { rows: [{ cnt: listings }] },             // countListings
    { rows: [{ cnt: suppliers }] },            // countSuppliers
    { rows: [{ cnt: multiOrgSlots }] },        // countMultiOrgSlots
    { rows: [] }                               // loadOwnerUser -> keine Request-Usage-Queries
  ];
}

// ── POST /subscription-requests/upgrade ────────────────────────

describe("POST /subscription-requests/upgrade", () => {
  it("201 + audit, wenn Pflichtfelder valid", async () => {
    // 1. hasOpenRequest -> empty
    // 2. createRequest INSERT
    // 3. createRequest history INSERT
    const inserted = { id: "req-up-1", status: "submitted", request_type: "upgrade" };
    const pool = sequencePool(
      { rows: [] },                         // hasOpenRequest
      { rows: [inserted] },                 // createRequest INSERT
      { rows: [] }                          // history insert
    );
    const router = createSubscriptionRequestsRouter(deps(pool));
    const handler = findHandler(router, "post", "/subscription-requests/upgrade");
    const req = mockReq({ body: { desired_plan: "PRO" } });
    const res = mockRes();
    await handler(req, res, (e) => { if (e) throw e; });
    assert.equal(res._status, 201);
    assert.equal(res._json.data.id, "req-up-1");
    assert.equal(res.locals.audit.action, "subscription_request.upgrade.create");
  });

  it("409 DUPLICATE_OPEN_REQUEST wenn schon Pending", async () => {
    const pool = sequencePool({ rows: [{}] }); // hasOpenRequest -> ja
    const router = createSubscriptionRequestsRouter(deps(pool));
    const handler = findHandler(router, "post", "/subscription-requests/upgrade");
    const req = mockReq({ body: { desired_plan: "PRO" } });
    const res = mockRes();
    await handler(req, res, () => {});
    assert.equal(res._status, 409);
    assert.equal(res._json.error.code, "DUPLICATE_OPEN_REQUEST");
  });

  it("400 VALIDATION ohne desired_plan", async () => {
    const pool = sequencePool();
    const router = createSubscriptionRequestsRouter(deps(pool));
    const handler = findHandler(router, "post", "/subscription-requests/upgrade");
    const res = mockRes();
    await handler(mockReq({ body: {} }), res, () => {});
    assert.equal(res._status, 400);
    assert.equal(res._json.error.code, "VALIDATION");
  });

  it("403 PERMISSION_DENIED ohne billing-Rolle", async () => {
    const pool = sequencePool();
    const router = createSubscriptionRequestsRouter(deps(pool));
    const handler = findHandler(router, "post", "/subscription-requests/upgrade");
    const res = mockRes();
    await handler(mockReq({ orgRole: "member", body: { desired_plan: "PRO" } }), res, () => {});
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "PERMISSION_DENIED");
  });
});

// ── POST /subscription-requests/downgrade ──────────────────────

describe("POST /subscription-requests/downgrade", () => {
  it("409 DOWNGRADE_BLOCKED wenn Listings ueber Limit + ohne acknowledge_impact", async () => {
    const pool = sequencePool(
      { rows: [] },                             // hasOpenRequest
      ...entitlementUsageResponses({ users: 2, sites: 1, listings: 25, suppliers: 0, multiOrgSlots: 1 })
    );
    const router = createSubscriptionRequestsRouter(deps(pool, () => Promise.resolve({ id: "u-1", email: "x@y.de", plan: "PLUS", org_name: "ACME" })));
    const handler = findHandler(router, "post", "/subscription-requests/downgrade");
    const res = mockRes();
    await handler(mockReq({ body: { desired_plan: "BASIS" } }), res, () => {});
    assert.equal(res._status, 409);
    assert.equal(res._json.error.code, "DOWNGRADE_BLOCKED");
    assert.ok(res._json.error.impact.blocked, "impact.blocked = true");
  });

  it("201 wenn acknowledge_impact=true trotz Block", async () => {
    const inserted = { id: "req-dn-1", status: "submitted", request_type: "downgrade" };
    const pool = sequencePool(
      { rows: [] },                             // hasOpenRequest
      ...entitlementUsageResponses({ users: 2, sites: 1, listings: 25, suppliers: 0, multiOrgSlots: 1 }),
      { rows: [inserted] },                     // createRequest INSERT
      { rows: [] },                             // history INSERT
      { rows: [{ id: "req-dn-1" }] }            // UPDATE downgrade_impact_snapshot
    );
    const router = createSubscriptionRequestsRouter(deps(pool, () => Promise.resolve({ id: "u-1", email: "x@y.de", plan: "PLUS" })));
    const handler = findHandler(router, "post", "/subscription-requests/downgrade");
    const res = mockRes();
    await handler(mockReq({ body: { desired_plan: "BASIS", acknowledge_impact: true } }), res, () => {});
    assert.equal(res._status, 201);
    assert.equal(res._json.data.id, "req-dn-1");
    assert.ok(res._json.data.impact, "impact dabei");
  });
});

// ── POST /subscription-requests/cancellation ──────────────────

describe("POST /subscription-requests/cancellation", () => {
  it("201 mit cancellation_effective_at gesetzt", async () => {
    const inserted = { id: "req-cn-1", status: "submitted", request_type: "cancellation" };
    const pool = sequencePool(
      { rows: [] },                            // hasOpenRequest
      { rows: [inserted] },                    // createRequest INSERT
      { rows: [] },                            // history INSERT
      { rows: [{ id: "req-cn-1" }] }           // UPDATE cancellation_effective_at
    );
    const router = createSubscriptionRequestsRouter(deps(pool));
    const handler = findHandler(router, "post", "/subscription-requests/cancellation");
    const req = mockReq({ body: { cancellation_effective_at: "2026-12-31", reason: "Vertrag laeuft aus" } });
    const res = mockRes();
    await handler(req, res, () => {});
    assert.equal(res._status, 201);
    assert.equal(res._json.data.id, "req-cn-1");
    assert.equal(res.locals.audit.action, "subscription_request.cancellation.create");
  });
});

// ── GET /:id Cross-Org-Schutz ─────────────────────────────────

describe("GET /subscription-requests/:id", () => {
  it("403 FORBIDDEN_CROSS_ORG bei fremder Org", async () => {
    const pool = sequencePool({ rows: [{ id: "r1", org_id: "other-org" }] });
    const router = createSubscriptionRequestsRouter(deps(pool));
    const handler = findHandler(router, "get", "/subscription-requests/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "r1" } }), res, () => {});
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "FORBIDDEN_CROSS_ORG");
  });

  it("404 wenn Request nicht existiert", async () => {
    const pool = sequencePool({ rows: [] });
    const router = createSubscriptionRequestsRouter(deps(pool));
    const handler = findHandler(router, "get", "/subscription-requests/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "missing" } }), res, () => {});
    assert.equal(res._status, 404);
  });
});

// ── applyApprovedChange ───────────────────────────────────────

describe("subreq.applyApprovedChange", () => {
  it("NOT_ACCEPTED wenn Status != accepted", async () => {
    const pool = sequencePool({ rows: [{ id: "r1", status: "submitted", request_type: "upgrade" }] });
    const r = await subreq.applyApprovedChange(pool, { requestId: "r1", actorUserId: "staff-1" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "NOT_ACCEPTED");
  });

  it("PAYMENT_NOT_VERIFIED: NEW_INDIVIDUAL mit offener Stripe-Session ist NICHT (z.B. via Staff) aktivierbar", async () => {
    // Self-Service-Anfrage (new_individual) mit offener Stripe-Payment-Session →
    // nur der Webhook (verifiedPayment) darf aktivieren; Staff/Cron werden geblockt.
    const pool = transactionPool(
      { rows: [{ id: "ri", status: "accepted", request_type: subreq.REQUEST_TYPES.NEW_INDIVIDUAL, org_id: "o1", user_id: "u1", desired_plan: "INDIVIDUELL", current_plan: "DEMO" }] },
      { rows: [{ exists: 1 }] } // payment_sessions: offene Stripe-Session vorhanden
    );
    const r = await subreq.applyApprovedChange(pool, { requestId: "ri", actorUserId: "staff-1" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "PAYMENT_NOT_VERIFIED");
    assert.ok(pool.calls.some((c) => /payment_sessions/i.test(c.sql)), "Diskriminator-Query lief");
    assert.ok(!pool.calls.some((c) => /UPDATE organizations/i.test(c.sql)), "keine Aktivierung (kein org-Update)");
    assert.ok(!pool.calls.some((c) => /SET status = 'active'/i.test(c.sql)), "Anfrage NICHT aktiviert");
  });

  it("verifiedPayment=true umgeht den Diskriminator (Webhook-Pfad) — keine payment_sessions-Pruefung", async () => {
    // Mit verifiedPayment wird die payment_sessions-Pruefung übersprungen und der normale
    // Apply-Pfad betreten. Der läuft hier in die (bewusst erschöpfte) Mock-Sequenz — der
    // konkrete Folgefehler ist egal; entscheidend ist: KEINE payment_sessions-Query.
    const pool = transactionPool(
      { rows: [{ id: "ri", status: "accepted", request_type: subreq.REQUEST_TYPES.NEW_INDIVIDUAL, org_id: "o1", user_id: "u1", desired_plan: "INDIVIDUELL", current_plan: "DEMO" }] }
    );
    try {
      await subreq.applyApprovedChange(pool, { requestId: "ri", actorUserId: "staff-1", verifiedPayment: true });
    } catch { /* Apply-Pfad nach dem Diskriminator-Skip läuft in die erschöpfte Sequenz — erwartet */ }
    assert.ok(!pool.calls.some((c) => /payment_sessions/i.test(c.sql)), "Diskriminator bei verifiedPayment übersprungen");
  });
  it("schreibt accepted -> active atomar mit BEGIN/COMMIT, Live-Updates, History, Audit und bestehendem Dokument", async () => {
    const frozenQuote = { catalog_version: "test-cat", plan: "PRO", proposed_price_cents: 79900 };
    const pool = transactionPool(
      { rows: [{ id: "r1", status: "accepted", request_type: "upgrade", org_id: "o1", user_id: "u1", desired_plan: "PRO", current_plan: "PLUS", cancellation_effective_at: null, effective_from: null }] },
      { rows: [{ id: "r1", quote_frozen_at: new Date().toISOString(), quote_snapshot: frozenQuote }] },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [{ id: "r1", status: "active", activated_at: new Date().toISOString() }] },
      { rows: [{ id: "doc-existing", document_type: "change_confirmation", document_number: "AE-2026-000001", status: "issued" }] },
      { rows: [] },
      { rows: [] }
    );
    const r = await subreq.applyApprovedChange(pool, { requestId: "r1", actorUserId: "staff-1" });
    assert.equal(r.ok, true);
    assert.equal(r.row.status, "active");
    assert.equal(r.document.document_type, "change_confirmation");
    assert.equal(r.document.already_exists, true);
    assert.ok(pool.calls.some((c) => c.sql === "BEGIN"));
    assert.ok(pool.calls.some((c) => c.sql === "COMMIT"));
    assert.ok(pool.released);
    assert.ok(pool.calls.some((c) => /UPDATE organizations/i.test(c.sql)));
    assert.ok(pool.calls.some((c) => /UPDATE subscriptions/i.test(c.sql)));
  });

  it("Fehler in einem kritischen Write rollt die Transaktion zurueck", async () => {
    const pool = transactionPool(
      { rows: [{ id: "r1", status: "accepted", request_type: "upgrade", org_id: "o1", user_id: "u1", desired_plan: "PRO", current_plan: "PLUS" }] },
      { rows: [{ id: "r1", quote_frozen_at: new Date().toISOString(), quote_snapshot: { plan: "PRO", catalog_version: "test-cat" } }] },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      new Error("SUBSCRIPTION_WRITE_FAILED")
    );
    await assert.rejects(
      subreq.applyApprovedChange(pool, { requestId: "r1", actorUserId: "staff-1" }),
      /SUBSCRIPTION_WRITE_FAILED/
    );
    assert.ok(pool.calls.some((c) => c.sql === "ROLLBACK"));
    assert.ok(!pool.calls.some((c) => /SET status = 'active'/i.test(c.sql)), "Request wurde nach Fehler nicht aktiviert");
  });

  it("erzeugt bei Upgrade automatisch eine Aenderungsbestaetigung", async () => {
    const req = {
      id: "r-up", status: "accepted", request_type: "upgrade",
      org_id: "o1", user_id: "u1", contact_email: "owner@acme.de",
      desired_plan: "PRO", current_plan: "PLUS",
      quote_frozen_at: new Date().toISOString(),
      quote_snapshot: { catalog_version: "test-cat", plan: "PRO", proposed_price_cents: 79900 }
    };
    const pool = transactionPool(
      { rows: [req] },
      { rows: [req] },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [{ id: "r-up", status: "active" }] },
      { rows: [] },
      { rows: [{ ...req, org_name: "ACME" }] },
      { rows: [{ n: 11 }] },
      { rows: [{ id: "doc-up", document_type: "change_confirmation", document_number: "AE-2026-000011", status: "issued" }] },
      { rows: [] },
      { rows: [] },
      { rows: [] }
    );
    const r = await subreq.applyApprovedChange(pool, { requestId: "r-up", actorUserId: "staff-1" });
    assert.equal(r.ok, true);
    assert.equal(r.document.document_type, "change_confirmation");
    const insertDoc = pool.calls.find((c) => /INSERT INTO subscription_documents/i.test(c.sql));
    assert.equal(insertDoc.params[0], "change_confirmation");
  });

  it("zweiter Lauf nutzt vorhandenes issued-Dokument und erzeugt kein Duplikat", async () => {
    const req = {
      id: "r-idem", status: "accepted", request_type: "pilot",
      org_id: "o1", user_id: "u1", desired_plan: "INDIVIDUELL", current_plan: "DEMO"
    };
    const pool = transactionPool(
      { rows: [req] },
      { rows: [{ ...req, quote_frozen_at: new Date().toISOString(), quote_snapshot: { catalog_version: "test-cat", plan: "INDIVIDUELL" } }] },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [{ id: "r-idem", status: "active" }] },
      { rows: [{ id: "doc-existing", document_type: "order_confirmation", document_number: "AB-2026-000001", status: "issued" }] },
      { rows: [] },
      { rows: [] }
    );
    const r = await subreq.applyApprovedChange(pool, { requestId: "r-idem", actorUserId: "staff-1" });
    assert.equal(r.ok, true);
    assert.equal(r.document.document_type, "order_confirmation");
    assert.equal(r.document.already_exists, true);
    assert.ok(!pool.calls.some((c) => /INSERT INTO subscription_documents/i.test(c.sql)));
  });

  it("Cancellation: setzt subscriptions.status=canceling + cancel_at und erzeugt Kuendigungsbestaetigung", async () => {
    const cancelAt = "2026-12-31T00:00:00.000Z";
    const pool = transactionPool(
      { rows: [{ id: "r2", status: "accepted", request_type: "cancellation", org_id: "o1", user_id: "u1", desired_plan: null, current_plan: "PLUS", cancellation_effective_at: cancelAt, effective_from: null }] },
      { rows: [{ id: "r2", quote_frozen_at: new Date().toISOString(), quote_snapshot: { catalog_version: "test-cat", plan: "PLUS" } }] },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [{ id: "r2", status: "active" }] },
      { rows: [{ id: "doc-c", document_type: "cancellation_confirmation", document_number: "KB-2026-000001", status: "issued" }] },
      { rows: [] },
      { rows: [] }
    );
    const r = await subreq.applyApprovedChange(pool, { requestId: "r2", actorUserId: "staff-1" });
    assert.equal(r.ok, true);
    assert.equal(r.document.document_type, "cancellation_confirmation");
    const subUpdate = pool.calls.find((c) => /UPDATE subscriptions/i.test(c.sql));
    assert.match(subUpdate.sql, /status\s*=\s*'canceling'/i);
    assert.equal(subUpdate.params[1], cancelAt);
    const docSelect = pool.calls.find((c) => /FROM subscription_documents/i.test(c.sql));
    assert.equal(docSelect.params[1], "cancellation_confirmation");
  });
});

// ── previewDowngradeImpact ───────────────────────────────────

describe("subreq.previewDowngradeImpact", () => {
  it("erkennt features_lost zwischen PRO und BASIS", async () => {
    const pool = sequencePool(
      ...entitlementUsageResponses({ users: 1, sites: 1, listings: 0, suppliers: 0, multiOrgSlots: 1, orgOverrides: { plan: "PRO" } })
    );
    const r = await subreq.previewDowngradeImpact(pool, { orgId: "o1", currentPlan: "PRO", desiredPlan: "BASIS" });
    assert.equal(r.current_plan, "PRO");
    assert.equal(r.desired_plan, "BASIS");
    assert.ok(Array.isArray(r.features_lost));
    assert.ok(r.features_lost.length > 0, "PRO->BASIS verliert Features");
    assert.equal(r.blocked, false);
  });

  it("blocked=true wenn listings_count > listings_limit_after", async () => {
    const pool = sequencePool(
      ...entitlementUsageResponses({ users: 2, sites: 1, listings: 25, suppliers: 0, multiOrgSlots: 1 })
    );
    const r = await subreq.previewDowngradeImpact(pool, { orgId: "o1", currentPlan: "PLUS", desiredPlan: "BASIS" });
    assert.equal(r.blocked, true);
    assert.ok(r.blocking_processes.some((p) => p.kind === "listings_over_limit"));
  });

  it("ohne orgId -> Default-Snapshot ohne DB-Calls", async () => {
    const pool = sequencePool();
    const r = await subreq.previewDowngradeImpact(pool, { orgId: null, currentPlan: "PRO", desiredPlan: "BASIS" });
    assert.equal(r.users_count, 0);
    assert.equal(r.listings_count, 0);
    assert.equal(pool.calls.length, 0);
  });
});
