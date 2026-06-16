/**
 * Self-Service INDIVIDUELL: Checkout-Route (Slice B) + Webhook-Aktivierungsbruecke
 * mit Manipulationsschutz (Slice C).
 *
 * Spiegelt die Mock-Helfer aus payment.route.test.js. Kein echtes Stripe, keine DB:
 *   - paymentService.* (createPaymentSession/getPaymentSessionStatus/completePaymentSession)
 *     trifft das ECHTE Modul → wird ueber den Mock-Pool sequenziert.
 *   - subscriptionRequestService/quoteSnapshotService/auditLog/invoiceService werden
 *     via DI gestubbt (Real-Modul-Fallback in payment.js), damit die ~20 Pool-Queries
 *     der Service-Transaktionen NICHT sequenziert werden muessen.
 *
 * Run: node --test --test-force-exit test/payment.individuell.route.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPaymentRouter } from "../routes/payment.js";
import { STATUS } from "../services/subscriptionRequestService.js";
import { PLAN } from "../config/planFeatures.js";
import { INDIVIDUELL_BASELINE } from "../config/planCatalog.js";

// ── Preis-Konstanten (Katalog-Wahrheit) ──────────────────────
const BASE = INDIVIDUELL_BASELINE.base_monthly_cents;          // 249900
const INCLUDED = INDIVIDUELL_BASELINE.seats_included;          // 50
const EXTRA = INDIVIDUELL_BASELINE.extra_seat_cents_per_month; // 2900
const API_ADDON_CENTS = 39900;                                 // ADDON_CATALOG "api" (staff:false)
const SLA99_ADDON_CENTS = 44900;                               // ADDON_CATALOG "sla99" (staff:true)

// 75 Sitze + API-Add-on: 249900 + 25*2900 + 39900 = 362300
const SEATS = 75;
const EXPECTED_MONTHLY = BASE + (SEATS - INCLUDED) * EXTRA + API_ADDON_CENTS;

// ── Mock helpers (identisch zu payment.route.test.js) ─────────

function returnPool(rows = []) {
  return { query: () => ({ rows }) };
}

function sequencePool(...responses) {
  let idx = 0;
  return {
    query: () => {
      if (idx >= responses.length) throw new Error(`Unexpected query #${idx + 1}`);
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

function mockReq(overrides = {}) {
  return {
    session: { userId: 42 },
    headers: {},
    query: {},
    body: {},
    orgId: "org-1",
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

const requireAuth = (req, _res, next) => next();

function baseDeps(poolOverride, extras = {}) {
  return {
    pool: poolOverride || returnPool(),
    config: { PAYMENT_MODE: "demo" },
    stripe: null,
    sendMail: () => {},
    getUserAndPlan: () => ({ email: "user@test.de", plan: "FREE" }),
    requireAuth,
    logger: mockLogger(),
    ...extras
  };
}

function findHandler(router, method, pathFragment) {
  for (const layer of router.stack) {
    if (layer.route) {
      const routePath = layer.route.path;
      const routeMethod = Object.keys(layer.route.methods)[0];
      if (routeMethod === method && routePath.includes(pathFragment)) {
        const handlers = layer.route.stack.map(s => s.handle);
        return handlers[handlers.length - 1];
      }
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${pathFragment} not found`);
}

// Stub-Fabrik fuer die injizierten Services. Jeder Stub merkt sich seine Aufrufe,
// damit Tests "wurde aktiviert / wurde NICHT aktiviert" beweisen koennen.
function subReqStubs(overrides = {}) {
  const calls = { create: null, getArg: null, approve: null, apply: null, getCalled: false };
  const stub = {
    createRequest: (_pool, opts) => { calls.create = opts; return { id: "req-1" }; },
    getRequest: (_pool, id) => { calls.getCalled = true; calls.getArg = id; return overrides.reqRow ?? null; },
    approve: (_pool, opts) => { calls.approve = opts; return overrides.approveResult ?? { ok: true, row: {} }; },
    applyApprovedChange: (_pool, opts) => { calls.apply = opts; return overrides.applyResult ?? { ok: true, target_plan: PLAN.INDIVIDUELL }; },
    ...overrides.fns
  };
  return { stub, calls };
}

// ═══════════════════════════════════════════════════════════════
// Slice B — POST /payment/checkout/individuell
// ═══════════════════════════════════════════════════════════════

describe("POST /payment/checkout/individuell (Slice B)", () => {
  it("ungueltige Auswahl => 200 ok:false + errors, KEINE Anfrage, kein Geldfluss", async () => {
    let createCalled = false;
    const deps = baseDeps(returnPool(), {
      subscriptionRequestService: {
        createRequest: () => { createCalled = true; return { id: "should-not-happen" }; }
      }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/checkout/individuell");
    const req = mockReq({ body: { seats: 0 } }); // INVALID_SEATS
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.ok, false);
    assert.ok(Array.isArray(res._json.errors));
    assert.ok(res._json.errors.some((e) => e.code === "INVALID_SEATS"));
    assert.strictEqual(createCalled, false, "keine Anfrage bei ungueltiger Auswahl");
  });

  it("fehlende org_id => 400 ORG_REQUIRED (kein Service-Aufruf)", async () => {
    let createCalled = false;
    const deps = baseDeps(returnPool(), {
      subscriptionRequestService: { createRequest: () => { createCalled = true; return { id: "x" }; } }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/checkout/individuell");
    const req = mockReq({ orgId: null, body: { seats: SEATS } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "ORG_REQUIRED");
    assert.strictEqual(createCalled, false);
  });

  it("reines Self-Service + Stripe verfuegbar => mode:stripe, Anfrage erzeugt, Quote eingefroren, korrekte Stripe-Session", async () => {
    let capturedStripeOpts = null;
    const mockStripe = {
      checkout: { sessions: { create: (opts) => { capturedStripeOpts = opts; return { id: "cs_ind_1", url: "https://checkout.stripe.com/pay/cs_ind_1" }; } } }
    };
    const { stub, calls } = subReqStubs();
    let freezeArg = null;
    const deps = baseDeps(returnPool(), {
      config: { PAYMENT_MODE: "live", STRIPE_SECRET_KEY: "sk_test_xxx" },
      stripe: mockStripe,
      getUserAndPlan: () => ({ email: "boss@firma.de", plan: "BASIS" }),
      subscriptionRequestService: stub,
      quoteSnapshotService: { freezeQuoteSnapshot: (_pool, opts) => { freezeArg = opts; return { ok: true, snapshot: { proposed_price_cents: EXPECTED_MONTHLY } }; } }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/checkout/individuell");
    const req = mockReq({ body: { seats: SEATS, addons: ["api"] } });
    const res = mockRes();

    await handler(req, res);

    // Antwort
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.ok, true);
    assert.strictEqual(res._json.mode, "stripe");
    assert.strictEqual(res._json.request_id, "req-1");
    assert.ok(res._json.checkout_id, "checkout_id vorhanden");
    assert.strictEqual(res._json.stripe_session_id, "cs_ind_1");
    assert.strictEqual(res._json.redirect_url, "https://checkout.stripe.com/pay/cs_ind_1");
    assert.strictEqual(res._json.total_monthly_cents, EXPECTED_MONTHLY);

    // Anfrage-Erzeugung: server-gerechneter Preis ist die Vertragsbasis
    assert.strictEqual(calls.create.request_type, "new_individual");
    assert.strictEqual(calls.create.desired_plan, PLAN.INDIVIDUELL);
    assert.strictEqual(calls.create.proposed_price_cents, EXPECTED_MONTHLY);
    assert.strictEqual(calls.create.user_count, SEATS);

    // Quote eingefroren fuer genau diese Anfrage
    assert.strictEqual(freezeArg.requestId, "req-1");

    // Stripe-Session: konsolidierte recurring-Position == server-Preis, Metadata verknuepft request_id
    assert.strictEqual(capturedStripeOpts.mode, "subscription");
    assert.strictEqual(capturedStripeOpts.line_items[0].price_data.unit_amount, EXPECTED_MONTHLY);
    assert.strictEqual(capturedStripeOpts.line_items[0].price_data.recurring.interval, "month");
    assert.strictEqual(capturedStripeOpts.metadata.request_id, "req-1");
    assert.strictEqual(capturedStripeOpts.metadata.checkout_id, res._json.checkout_id);
    assert.strictEqual(capturedStripeOpts.metadata.plan, PLAN.INDIVIDUELL);
    assert.strictEqual(capturedStripeOpts.metadata.org_id, "org-1");

    // Audit
    assert.strictEqual(res.locals.audit.action, "payment.checkout.individuell");
    assert.strictEqual(res.locals.audit.entity_id, res._json.checkout_id);
  });

  it("freigabepflichtiges Add-on (sla99) => mode:inquiry, KEIN Stripe-Aufruf trotz konfiguriertem Stripe", async () => {
    let stripeCalled = false;
    const mockStripe = {
      checkout: { sessions: { create: () => { stripeCalled = true; throw new Error("stripe darf nicht aufgerufen werden"); } } }
    };
    const { stub, calls } = subReqStubs();
    const deps = baseDeps(returnPool(), {
      config: { PAYMENT_MODE: "live", STRIPE_SECRET_KEY: "sk_test_xxx" },
      stripe: mockStripe,
      subscriptionRequestService: stub,
      quoteSnapshotService: { freezeQuoteSnapshot: () => ({ ok: true, snapshot: {} }) }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/checkout/individuell");
    const req = mockReq({ body: { seats: 60, addons: ["sla99"] } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.ok, true);
    assert.strictEqual(res._json.mode, "inquiry");
    assert.strictEqual(res._json.requires_staff_approval, true);
    assert.strictEqual(res._json.request_id, "req-1");
    assert.strictEqual(stripeCalled, false, "kein Checkout fuer freigabepflichtige Auswahl");
    assert.ok(calls.create, "Anfrage wird trotzdem erzeugt");
    assert.strictEqual(res.locals.audit.action, "subscription_request.self_service_created");
  });

  it("kein Stripe (Default manual/demo) => mode:inquiry auch bei reinem Self-Service", async () => {
    const { stub, calls } = subReqStubs();
    const deps = baseDeps(returnPool(), {
      // baseDeps default: PAYMENT_MODE demo, stripe null
      subscriptionRequestService: stub,
      quoteSnapshotService: { freezeQuoteSnapshot: () => ({ ok: true, snapshot: {} }) }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/checkout/individuell");
    const req = mockReq({ body: { seats: SEATS, addons: ["api"] } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._json.mode, "inquiry");
    assert.strictEqual(res._json.requires_staff_approval, false, "API-Add-on ist nicht freigabepflichtig");
    assert.strictEqual(res._json.total_monthly_cents, EXPECTED_MONTHLY);
    assert.ok(calls.create);
  });

  it("Service-Fehler (CONTACT_EMAIL_REQUIRED) => propagierter 4xx-Status, kein Geldfluss", async () => {
    const deps = baseDeps(returnPool(), {
      subscriptionRequestService: {
        createRequest: () => { const e = new Error("contact email required"); e.code = "CONTACT_EMAIL_REQUIRED"; e.status = 400; throw e; }
      }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/checkout/individuell");
    const req = mockReq({ body: { seats: SEATS, addons: ["api"] } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "CONTACT_EMAIL_REQUIRED");
  });

  it("Quote-Freeze scheitert => 500 QUOTE_FREEZE_FAILED (kein Checkout)", async () => {
    let stripeCalled = false;
    const { stub } = subReqStubs();
    const deps = baseDeps(returnPool(), {
      config: { PAYMENT_MODE: "live", STRIPE_SECRET_KEY: "sk_test_xxx" },
      stripe: { checkout: { sessions: { create: () => { stripeCalled = true; return {}; } } } },
      subscriptionRequestService: stub,
      quoteSnapshotService: { freezeQuoteSnapshot: () => ({ ok: false, error: "freeze boom" }) }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/checkout/individuell");
    const req = mockReq({ body: { seats: SEATS, addons: ["api"] } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error, "QUOTE_FREEZE_FAILED");
    assert.strictEqual(stripeCalled, false, "ohne eingefrorenen Vertragspreis kein Checkout");
  });
});

// ═══════════════════════════════════════════════════════════════
// Slice C — Webhook-Aktivierungsbruecke + Manipulationsschutz
// ═══════════════════════════════════════════════════════════════

function webhookDeps(pool, eventObject, extras = {}) {
  const mockStripe = {
    webhooks: {
      constructEvent: () => ({
        type: "checkout.session.completed",
        data: { object: eventObject }
      })
    }
  };
  return baseDeps(pool, {
    stripe: mockStripe,
    config: { PAYMENT_MODE: "live", STRIPE_WEBHOOK_SECRET: "whsec_test" },
    ...extras
  });
}

describe("POST /payment/webhook/stripe — INDIVIDUELL-Aktivierung (Slice C)", () => {
  const activationEvent = (overrides = {}) => ({
    metadata: { checkout_id: "ck-1", request_id: "req-1", plan: PLAN.INDIVIDUELL, user_id: "42", org_id: "org-9" },
    amount_total: EXPECTED_MONTHLY,
    amount_subtotal: EXPECTED_MONTHLY,
    currency: "eur",
    payment_intent: "pi_ind",
    subscription: "sub_ind",
    invoice: "in_ind",
    ...overrides
  });

  it("Happy Path: bezahlter Betrag == eingefrorener Preis => approve + applyApprovedChange + Session + Rechnung + Mail", async () => {
    const pool = sequencePool(
      { rows: [{ status: "pending" }] }, // getPaymentSessionStatus
      { rows: [] }                        // completePaymentSession
    );
    let mailSent = false;
    let capturedInvoiceOpts = null;
    const { stub, calls } = subReqStubs({
      reqRow: { id: "req-1", org_id: "org-9", status: STATUS.SUBMITTED, quote_snapshot: { proposed_price_cents: EXPECTED_MONTHLY } }
    });
    const deps = webhookDeps(pool, activationEvent(), {
      subscriptionRequestService: stub,
      sendMail: () => { mailSent = true; },
      getUserAndPlan: () => ({ email: "boss@firma.de", plan: PLAN.INDIVIDUELL }),
      invoiceService: { createInvoice: (_pool, opts) => { capturedInvoiceOpts = opts; return { id: "inv-1" }; } }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/webhook/stripe");
    const req = mockReq({ headers: { "stripe-signature": "valid_sig" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._json.received, true);
    // Aktivierungskette wurde durchlaufen
    assert.ok(calls.approve, "approve aufgerufen (Status war submitted, nicht accepted)");
    assert.strictEqual(calls.approve.requestId, "req-1");
    assert.ok(calls.apply, "applyApprovedChange aufgerufen");
    assert.strictEqual(calls.apply.requestId, "req-1");
    // Rechnung mit TATSAECHLICH bezahltem Betrag
    assert.ok(capturedInvoiceOpts);
    assert.strictEqual(capturedInvoiceOpts.plan, PLAN.INDIVIDUELL);
    assert.strictEqual(capturedInvoiceOpts.amountCents, EXPECTED_MONTHLY);
    assert.strictEqual(capturedInvoiceOpts.paymentSessionId, "ck-1");
    assert.strictEqual(capturedInvoiceOpts.stripeInvoiceId, "in_ind");
    assert.strictEqual(mailSent, true);
  });

  it("Manipulationsschutz: bezahlter Betrag != eingefrorener Preis => KEINE Aktivierung, Audit, keine Mail", async () => {
    // Nur getPaymentSessionStatus darf die DB beruehren; completePaymentSession NICHT.
    const pool = sequencePool({ rows: [{ status: "pending" }] });
    let mailSent = false;
    let auditCaptured = null;
    const { stub, calls } = subReqStubs({
      reqRow: { id: "req-1", org_id: "org-9", status: STATUS.SUBMITTED, quote_snapshot: { proposed_price_cents: EXPECTED_MONTHLY } }
    });
    const deps = webhookDeps(pool, activationEvent({ amount_subtotal: 999999, amount_total: 999999 }), {
      subscriptionRequestService: stub,
      sendMail: () => { mailSent = true; },
      auditLog: { writeAudit: (_pool, entry) => { auditCaptured = entry; } },
      invoiceService: { createInvoice: () => { throw new Error("Rechnung darf nicht erzeugt werden"); } }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/webhook/stripe");
    const req = mockReq({ headers: { "stripe-signature": "valid_sig" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._json.received, true);
    assert.strictEqual(calls.approve, null, "kein approve bei Betragsabweichung");
    assert.strictEqual(calls.apply, null, "kein applyApprovedChange bei Betragsabweichung");
    assert.ok(auditCaptured, "Mismatch wird auditiert");
    assert.strictEqual(auditCaptured.action, "subscription_request.payment_amount_mismatch");
    assert.strictEqual(auditCaptured.entity_id, "req-1");
    assert.strictEqual(auditCaptured.details.expected_cents, EXPECTED_MONTHLY);
    assert.strictEqual(auditCaptured.details.paid_cents, 999999);
    assert.strictEqual(mailSent, false);
  });

  it("Idempotenz: bereits abgeschlossene Session => kein getRequest, keine Aktivierung", async () => {
    const pool = sequencePool({ rows: [{ status: "completed" }] }); // getPaymentSessionStatus
    const { stub, calls } = subReqStubs({
      reqRow: { id: "req-1", status: STATUS.SUBMITTED, quote_snapshot: { proposed_price_cents: EXPECTED_MONTHLY } }
    });
    const deps = webhookDeps(pool, activationEvent(), { subscriptionRequestService: stub });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/webhook/stripe");
    const req = mockReq({ headers: { "stripe-signature": "valid_sig" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._json.received, true);
    assert.strictEqual(calls.getCalled, false, "abgeschlossene Session wird sofort uebersprungen");
    assert.strictEqual(calls.apply, null);
  });

  it("Bereits aktiv: nur Payment-Session schliessen, NICHT erneut aktivieren", async () => {
    const pool = sequencePool(
      { rows: [{ status: "pending" }] }, // getPaymentSessionStatus
      { rows: [] }                        // completePaymentSession
    );
    const { stub, calls } = subReqStubs({
      reqRow: { id: "req-1", org_id: "org-9", status: STATUS.ACTIVE, quote_snapshot: { proposed_price_cents: EXPECTED_MONTHLY } }
    });
    const deps = webhookDeps(pool, activationEvent(), { subscriptionRequestService: stub });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/webhook/stripe");
    const req = mockReq({ headers: { "stripe-signature": "valid_sig" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._json.received, true);
    assert.strictEqual(calls.approve, null, "keine erneute Annahme");
    assert.strictEqual(calls.apply, null, "keine erneute Aktivierung");
  });

  it("Manipulationsschutz Waehrung: korrekte Cent-Summe, aber falsche Waehrung => KEINE Aktivierung, Audit, keine Mail", async () => {
    const pool = sequencePool({ rows: [{ status: "pending" }] });
    let mailSent = false;
    let auditCaptured = null;
    const { stub, calls } = subReqStubs({
      reqRow: { id: "req-1", org_id: "org-9", status: STATUS.SUBMITTED, quote_snapshot: { proposed_price_cents: EXPECTED_MONTHLY, currency: "EUR" } }
    });
    // Betrag korrekt (EXPECTED_MONTHLY), aber Waehrung usd statt eur → muss blockieren.
    const deps = webhookDeps(pool, activationEvent({ currency: "usd" }), {
      subscriptionRequestService: stub,
      sendMail: () => { mailSent = true; },
      auditLog: { writeAudit: (_pool, entry) => { auditCaptured = entry; } },
      invoiceService: { createInvoice: () => { throw new Error("Rechnung darf nicht erzeugt werden"); } }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/webhook/stripe");
    const req = mockReq({ headers: { "stripe-signature": "valid_sig" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._json.received, true);
    assert.strictEqual(calls.approve, null, "kein approve bei Waehrungsabweichung");
    assert.strictEqual(calls.apply, null, "kein applyApprovedChange bei Waehrungsabweichung");
    assert.ok(auditCaptured, "Waehrungs-Mismatch wird auditiert");
    assert.strictEqual(auditCaptured.action, "subscription_request.payment_amount_mismatch");
    assert.strictEqual(auditCaptured.details.expected_currency, "eur");
    assert.strictEqual(mailSent, false);
  });
});
