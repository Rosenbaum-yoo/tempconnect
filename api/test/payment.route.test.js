/**
 * Payment route handler tests.
 * Covers GET /config, POST /checkout, POST /confirm,
 * POST /webhook/stripe, GET /history.
 * Uses mock deps — no database or Stripe required.
 *
 * Run: node --test --test-force-exit test/payment.route.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPaymentRouter } from "../routes/payment.js";

// ── Mock helpers ──────────────────────────────────────────────

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

// ── Utility: invoke a route handler directly ──────────────────
// The router uses Express Router, so we extract handlers for direct testing.
// Instead of spinning up express, we invoke the route handler functions directly
// by extracting them from the router stack.

function findHandler(router, method, pathFragment) {
  for (const layer of router.stack) {
    if (layer.route) {
      const routePath = layer.route.path;
      const routeMethod = Object.keys(layer.route.methods)[0];
      if (routeMethod === method && routePath.includes(pathFragment)) {
        // Return the last handler (the actual handler, not middleware)
        const handlers = layer.route.stack.map(s => s.handle);
        return handlers[handlers.length - 1];
      }
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${pathFragment} not found`);
}

// ═══════════════════════════════════════════════════════════════
// GET /payment/config
// ═══════════════════════════════════════════════════════════════

describe("GET /payment/config", () => {
  it("returns demo mode with no Stripe by default", () => {
    const router = createPaymentRouter(baseDeps());
    const handler = findHandler(router, "get", "/payment/config");
    const res = mockRes();

    handler(mockReq(), res);

    assert.strictEqual(res._json.mode, "demo");
    assert.strictEqual(res._json.stripe_enabled, false);
    assert.strictEqual(res._json.stripe_customer_portal_enabled, false);
    assert.strictEqual(res._json.stripe_customer_portal_endpoint, null);
    assert.strictEqual(res._json.paypal_enabled, false);
    assert.ok(res._json.plans);
  });

  it("returns stripe_enabled when key is set", () => {
    const deps = baseDeps(null, {
      config: { PAYMENT_MODE: "live", STRIPE_SECRET_KEY: "sk_test_xxx", STRIPE_PUBLISHABLE_KEY: "pk_test_xxx" }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "get", "/payment/config");
    const res = mockRes();

    handler(mockReq(), res);

    assert.strictEqual(res._json.mode, "live");
    assert.strictEqual(res._json.stripe_enabled, true);
    assert.strictEqual(res._json.stripe_customer_portal_enabled, false);
    assert.strictEqual(res._json.stripe_publishable_key, "pk_test_xxx");
  });

  it("returns customer portal endpoint when Stripe Billing Portal is available", () => {
    const deps = baseDeps(null, {
      config: { PAYMENT_MODE: "live", STRIPE_SECRET_KEY: "sk_test_xxx" },
      stripe: { billingPortal: { sessions: { create: () => ({}) } } }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "get", "/payment/config");
    const res = mockRes();

    handler(mockReq(), res);

    assert.strictEqual(res._json.stripe_customer_portal_enabled, true);
    assert.strictEqual(res._json.stripe_customer_portal_endpoint, "/api/payment/customer-portal");
  });

  it("returns paypal_enabled when client ID is set", () => {
    const deps = baseDeps(null, {
      config: { PAYMENT_MODE: "demo", PAYPAL_CLIENT_ID: "paypal-123" }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "get", "/payment/config");
    const res = mockRes();

    handler(mockReq(), res);

    assert.strictEqual(res._json.paypal_enabled, true);
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /payment/customer-portal
// ═══════════════════════════════════════════════════════════════

describe("POST /payment/customer-portal", () => {
  it("returns 404 when Stripe Customer Portal is unavailable", async () => {
    const router = createPaymentRouter(baseDeps(returnPool()));
    const handler = findHandler(router, "post", "/payment/customer-portal");
    const res = mockRes();

    await handler(mockReq(), res);

    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "STRIPE_CUSTOMER_PORTAL_UNAVAILABLE");
  });

  it("returns 404 when no completed Stripe session exists", async () => {
    const deps = baseDeps(returnPool([]), {
      config: { PAYMENT_MODE: "live", STRIPE_SECRET_KEY: "sk_test_xxx" },
      stripe: { billingPortal: { sessions: { create: () => ({}) } } }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/customer-portal");
    const res = mockRes();

    await handler(mockReq(), res);

    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "STRIPE_CUSTOMER_NOT_FOUND");
  });

  it("creates Stripe Billing Portal session and sanitizes return_url", async () => {
    let capturedReturnUrl = null;
    const pool = returnPool([{ id: "ps-1", stripe_session_id: "cs_123", org_id: "org-1" }]);
    const mockStripe = {
      checkout: { sessions: { retrieve: () => ({ customer: "cus_123" }) } },
      billingPortal: {
        sessions: {
          create: (opts) => {
            capturedReturnUrl = opts.return_url;
            return { url: "https://billing.stripe.com/session/abc" };
          }
        }
      }
    };
    const deps = baseDeps(pool, {
      config: { PAYMENT_MODE: "live", STRIPE_SECRET_KEY: "sk_test_xxx", BASE_URL: "https://tempconnect.test" },
      stripe: mockStripe
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/customer-portal");
    const req = mockReq({ body: { return_url: "https://evil.example/back" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.url, "https://billing.stripe.com/session/abc");
    assert.strictEqual(capturedReturnUrl, "https://tempconnect.test/public/sla_abo.html");
    assert.strictEqual(res.locals.audit.action, "payment.customer_portal.create");
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /payment/checkout
// ═══════════════════════════════════════════════════════════════

describe("POST /payment/checkout", () => {
  it("rejects invalid plan", async () => {
    const router = createPaymentRouter(baseDeps());
    const handler = findHandler(router, "post", "/payment/checkout");
    const req = mockReq({ body: { plan: "SUPER_PLAN" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "INVALID_PLAN");
  });

  it("demo checkout returns checkout_id and mode demo", async () => {
    const pool = returnPool();
    const deps = baseDeps(pool);
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/checkout");
    const req = mockReq({ body: { plan: "PLUS" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.mode, "demo");
    assert.strictEqual(res._json.plan, "PLUS");
    assert.ok(res._json.checkout_id);
    assert.strictEqual(res._json.currency, "EUR");
    assert.ok(res.locals.audit);
    assert.strictEqual(res.locals.audit.action, "payment.checkout");
  });

  it("demo checkout works for all valid plans (BASIS/PLUS/PRO)", async () => {
    for (const plan of ["BASIS", "PLUS", "PRO"]) {
      const router = createPaymentRouter(baseDeps(returnPool()));
      const handler = findHandler(router, "post", "/payment/checkout");
      const req = mockReq({ body: { plan } });
      const res = mockRes();

      await handler(req, res);

      assert.strictEqual(res._json.plan, plan);
      assert.ok(res._json.amount > 0);
    }
  });

  it("stripe checkout creates stripe session and returns redirect", async () => {
    const stripeSessionId = "cs_test_123";
    const stripeUrl = "https://checkout.stripe.com/pay/cs_test_123";
    const mockStripe = {
      checkout: {
        sessions: {
          create: () => ({ id: stripeSessionId, url: stripeUrl })
        }
      }
    };
    const deps = baseDeps(returnPool(), {
      config: { PAYMENT_MODE: "live", STRIPE_SECRET_KEY: "sk_test_xxx" },
      stripe: mockStripe
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/checkout");
    const req = mockReq({ body: { plan: "PRO", payment_method: "stripe" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._json.mode, "stripe");
    assert.strictEqual(res._json.stripe_session_id, stripeSessionId);
    assert.strictEqual(res._json.redirect_url, stripeUrl);
  });

  it("stripe error returns 500 STRIPE_ERROR", async () => {
    const mockStripe = {
      checkout: {
        sessions: {
          create: () => { throw new Error("Card declined"); }
        }
      }
    };
    const deps = baseDeps(returnPool(), {
      config: { PAYMENT_MODE: "live", STRIPE_SECRET_KEY: "sk_test_xxx" },
      stripe: mockStripe
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/checkout");
    const req = mockReq({ body: { plan: "PLUS", payment_method: "stripe" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error, "STRIPE_ERROR");
    assert.strictEqual(res._json.message, "Card declined");
  });

  it("paypal checkout returns redirect url", async () => {
    const deps = baseDeps(returnPool(), {
      config: { PAYMENT_MODE: "live", PAYPAL_CLIENT_ID: "paypal-123" }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/checkout");
    const req = mockReq({ body: { plan: "BASIS", payment_method: "paypal" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._json.mode, "paypal");
    assert.ok(res._json.redirect_url.includes("paypal.com"));
  });

  it("unsupported payment method returns 400", async () => {
    const deps = baseDeps(returnPool(), {
      config: { PAYMENT_MODE: "live" }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/checkout");
    const req = mockReq({ body: { plan: "PLUS", payment_method: "bitcoin" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "PAYMENT_METHOD_NOT_AVAILABLE");
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /payment/confirm
// ═══════════════════════════════════════════════════════════════

describe("POST /payment/confirm", () => {
  it("rejects missing checkout_id", async () => {
    const router = createPaymentRouter(baseDeps());
    const handler = findHandler(router, "post", "/payment/confirm");
    const req = mockReq({ body: {} });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "MISSING_CHECKOUT_ID");
  });

  it("returns 404 when session not found", async () => {
    // getPaymentSession returns null (no rows)
    const pool = returnPool([]);
    const deps = baseDeps(pool);
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/confirm");
    const req = mockReq({ body: { checkout_id: "nonexistent" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "SESSION_NOT_FOUND");
  });

  it("returns 400 when session already completed", async () => {
    const pool = sequencePool(
      { rows: [{ status: "completed", plan: "PLUS", method: "demo", amount: 29 }] }
    );
    const deps = baseDeps(pool);
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/confirm");
    const req = mockReq({ body: { checkout_id: "abc123" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "ALREADY_COMPLETED");
  });

  it("demo confirm activates plan and sends mail", async () => {
    let mailSent = false;
    let capturedInvoiceOpts = null;
    const pool = sequencePool(
      // getPaymentSession
      { rows: [{ status: "pending", plan: "PLUS", method: "demo", amount: 29, org_id: null }] },
      // activatePlan
      { rows: [] },
      { rows: [] },
      // completePaymentSession
      { rows: [] }
    );
    const deps = baseDeps(pool, {
      sendMail: (_email, _subject) => { mailSent = true; },
      getUserAndPlan: () => ({ email: "user@test.de", plan: "PLUS" }),
      invoiceService: {
        createInvoice: (_pool, opts) => {
          capturedInvoiceOpts = opts;
          return { id: "inv-1" };
        }
      }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/confirm");
    const req = mockReq({ body: { checkout_id: "checkout-1" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.ok, true);
    assert.ok(res._json.user);
    assert.ok(mailSent);
    assert.ok(res.locals.audit);
    assert.strictEqual(res.locals.audit.action, "payment.confirm");
    assert.ok(capturedInvoiceOpts);
    assert.strictEqual(capturedInvoiceOpts.plan, "PLUS");
    assert.strictEqual(capturedInvoiceOpts.amountCents, 2900);
    assert.strictEqual(capturedInvoiceOpts.orgId, null);
  });

  it("demo confirm still succeeds when invoice creation fails", async () => {
    const pool = sequencePool(
      { rows: [{ status: "pending", plan: "PRO", method: "demo", amount: 49, org_id: null }] },
      // activatePlan schliesst seit P9/C2 zuerst das bisherige Abo (UPDATE) und
      // legt dann das neue an (INSERT) — zwei Abfragen statt einer.
      { rows: [] },
      { rows: [] },
      { rows: [] } // completePaymentSession
    );
    const deps = baseDeps(pool, {
      sendMail: () => {},
      getUserAndPlan: () => ({ email: "u@t.de", plan: "PRO" }),
      invoiceService: {
        createInvoice: () => { throw new Error("invoice failed"); }
      }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/confirm");
    const req = mockReq({ body: { checkout_id: "checkout-2" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.ok, true);
  });

  it("non-demo non-paid session returns 402 PAYMENT_PENDING", async () => {
    const pool = sequencePool(
      { rows: [{ status: "pending", plan: "PRO", method: "stripe", amount: 49 }] }
    );
    const deps = baseDeps(pool, {
      config: { PAYMENT_MODE: "live" }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/confirm");
    const req = mockReq({ body: { checkout_id: "checkout-3" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 402);
    assert.strictEqual(res._json.error, "PAYMENT_PENDING");
  });

  it("DB error returns 500 SERVER_ERROR", async () => {
    const pool = { query: () => { throw new Error("DB down"); } };
    const deps = baseDeps(pool);
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/confirm");
    const req = mockReq({ body: { checkout_id: "checkout-4" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error, "SERVER_ERROR");
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /payment/webhook/stripe
// ═══════════════════════════════════════════════════════════════

describe("POST /payment/webhook/stripe", () => {
  it("returns 400 when stripe is not configured", async () => {
    const deps = baseDeps(returnPool(), { stripe: null });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/webhook/stripe");
    const res = mockRes();

    await handler(mockReq(), res);

    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "STRIPE_NOT_CONFIGURED");
  });

  it("returns 400 when webhook secret not set", async () => {
    const mockStripe = { webhooks: { constructEvent: () => {} } };
    const deps = baseDeps(returnPool(), {
      stripe: mockStripe,
      config: { PAYMENT_MODE: "live", STRIPE_WEBHOOK_SECRET: "" }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/webhook/stripe");
    const req = mockReq({ headers: { "stripe-signature": "sig_123" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "WEBHOOK_SECRET_REQUIRED");
  });

  it("returns 400 on invalid signature", async () => {
    const mockStripe = {
      webhooks: {
        constructEvent: () => { throw new Error("Invalid signature"); }
      }
    };
    const deps = baseDeps(returnPool(), {
      stripe: mockStripe,
      config: { PAYMENT_MODE: "live", STRIPE_WEBHOOK_SECRET: "whsec_test" }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/webhook/stripe");
    const req = mockReq({ headers: { "stripe-signature": "bad_sig" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "INVALID_SIGNATURE");
  });

  it("checkout.session.completed activates plan", async () => {
    const pool = sequencePool(
      { rows: [{ status: "pending" }] },  // getPaymentSessionStatus
      // activatePlan: seit P9/C2 erst das bisherige Abo schliessen (UPDATE),
      // dann das neue anlegen (INSERT).
      { rows: [] },
      { rows: [] },
      { rows: [{ org_id: null }] },         // getPaymentSession (org fallback)
      { rows: [] }                          // completePaymentSession
    );
    let mailSent = false;
    let capturedInvoiceOpts = null;
    const mockStripe = {
      webhooks: {
        constructEvent: () => ({
          type: "checkout.session.completed",
          data: {
            object: {
              metadata: { checkout_id: "ck-1", plan: "PLUS", user_id: "42" },
              payment_intent: "pi_xxx",
              subscription: "sub_xxx"
            }
          }
        })
      }
    };
    const deps = baseDeps(pool, {
      stripe: mockStripe,
      config: { PAYMENT_MODE: "live", STRIPE_WEBHOOK_SECRET: "whsec_test" },
      sendMail: () => { mailSent = true; },
      getUserAndPlan: () => ({ email: "u@t.de", plan: "PLUS" }),
      invoiceService: {
        createInvoice: (_pool, opts) => {
          capturedInvoiceOpts = opts;
          return { id: "inv-1" };
        }
      }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/webhook/stripe");
    const req = mockReq({ headers: { "stripe-signature": "valid_sig" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._json.received, true);
    assert.ok(mailSent);
    assert.ok(capturedInvoiceOpts);
    assert.strictEqual(capturedInvoiceOpts.plan, "PLUS");
    assert.strictEqual(capturedInvoiceOpts.amountCents, 49900);
    assert.strictEqual(capturedInvoiceOpts.paymentSessionId, "ck-1");
  });

  it("checkout.session.completed skips already-completed session", async () => {
    const pool = sequencePool(
      { rows: [{ status: "completed" }] }  // getPaymentSessionStatus returns completed
    );
    const mockStripe = {
      webhooks: {
        constructEvent: () => ({
          type: "checkout.session.completed",
          data: {
            object: {
              metadata: { checkout_id: "ck-2", plan: "PRO", user_id: "42" },
              payment_intent: "pi_xxx",
              subscription: "sub_xxx"
            }
          }
        })
      }
    };
    const deps = baseDeps(pool, {
      stripe: mockStripe,
      config: { PAYMENT_MODE: "live", STRIPE_WEBHOOK_SECRET: "whsec_test" }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/webhook/stripe");
    const req = mockReq({ headers: { "stripe-signature": "valid_sig" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._json.received, true);
  });

  it("customer.subscription.deleted sets user to FREE", async () => {
    const pool = sequencePool(
      { rows: [{ user_id: 99 }] },  // getPaymentSessionByStripeSubscriptionId
      { rows: [] }                   // activatePlan
    );
    const mockStripe = {
      webhooks: {
        constructEvent: () => ({
          type: "customer.subscription.deleted",
          data: { object: { id: "sub_cancel_1" } }
        })
      }
    };
    const deps = baseDeps(pool, {
      stripe: mockStripe,
      config: { PAYMENT_MODE: "live", STRIPE_WEBHOOK_SECRET: "whsec_test" }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/webhook/stripe");
    const req = mockReq({ headers: { "stripe-signature": "valid_sig" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._json.received, true);
  });

  it("invoice.payment_failed is logged for observability without side effects", async () => {
    // Slice 3: Enterprise-Dunning ist operator-getrieben — der Webhook darf
    // KEINE Mutation, KEINE Mail und KEINEN Auto-Cancel auslösen, nur protokollieren.
    let warnCalled = false;
    let mailSent = false;
    const mockStripe = {
      webhooks: {
        constructEvent: () => ({
          type: "invoice.payment_failed",
          data: { object: { subscription: "sub_x", id: "in_x", attempt_count: 2, next_payment_attempt: 1893456000 } }
        })
      }
    };
    const deps = baseDeps(
      // Pool wirft bei jeder Query → beweist, dass der Pfad die DB nicht anfasst.
      { query: () => { throw new Error("payment_failed must not touch the DB"); } },
      {
        stripe: mockStripe,
        config: { PAYMENT_MODE: "live", STRIPE_WEBHOOK_SECRET: "whsec_test" },
        sendMail: () => { mailSent = true; },
        logger: { info() {}, warn() { warnCalled = true; }, error() {}, debug() {}, trace() {}, fatal() {} }
      }
    );
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/webhook/stripe");
    const req = mockReq({ headers: { "stripe-signature": "valid_sig" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._json.received, true);
    assert.strictEqual(warnCalled, true, "logger.warn protokolliert den Fehlversuch");
    assert.strictEqual(mailSent, false, "keine Kunden-Mail bei payment_failed");
  });

  it("unknown event type is acknowledged gracefully", async () => {
    const mockStripe = {
      webhooks: {
        constructEvent: () => ({
          type: "invoice.paid",
          data: { object: {} }
        })
      }
    };
    const deps = baseDeps(returnPool(), {
      stripe: mockStripe,
      config: { PAYMENT_MODE: "live", STRIPE_WEBHOOK_SECRET: "whsec_test" }
    });
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "post", "/payment/webhook/stripe");
    const req = mockReq({ headers: { "stripe-signature": "valid_sig" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._json.received, true);
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /payment/webhook/paypal
// ═══════════════════════════════════════════════════════════════

describe("POST /payment/webhook/paypal", () => {
  it("acknowledges any request", () => {
    const router = createPaymentRouter(baseDeps());
    const handler = findHandler(router, "post", "/payment/webhook/paypal");
    const res = mockRes();

    handler(mockReq(), res);

    assert.strictEqual(res._json.received, true);
  });
});

// ═══════════════════════════════════════════════════════════════
// GET /payment/history
// ═══════════════════════════════════════════════════════════════

describe("GET /payment/history", () => {
  it("returns payment history rows", async () => {
    const rows = [
      { id: "p1", plan: "PLUS", amount: 29, status: "completed" },
      { id: "p2", plan: "PRO", amount: 49, status: "pending" }
    ];
    const pool = returnPool(rows);
    const deps = baseDeps(pool);
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "get", "/payment/history");
    const req = mockReq();
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 200);
    assert.deepStrictEqual(res._json, rows);
  });

  it("returns 500 on DB error", async () => {
    const pool = { query: () => { throw new Error("DB down"); } };
    const deps = baseDeps(pool);
    const router = createPaymentRouter(deps);
    const handler = findHandler(router, "get", "/payment/history");
    const req = mockReq();
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error, "SERVER_ERROR");
  });
});
