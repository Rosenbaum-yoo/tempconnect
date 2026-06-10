/**
 * billingProviderService tests (Phase D, Slice 1).
 * Reine Funktionen, keine DB/Stripe nötig.
 *
 * Run: node --test --test-force-exit test/billingProviderService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BILLING_PROVIDERS,
  looksLikePlaceholder,
  isStripeConfigured,
  resolveBillingProvider,
  describeBilling,
  mapStripeEvent
} from "../services/billingProviderService.js";

// ── Konstanten ────────────────────────────────────────────────
describe("BILLING_PROVIDERS", () => {
  it("exposes the three canonical providers", () => {
    assert.deepStrictEqual(
      Object.values(BILLING_PROVIDERS).sort(),
      ["disabled", "manual", "stripe"]
    );
  });
});

// ── Platzhalter-Erkennung ─────────────────────────────────────
describe("looksLikePlaceholder", () => {
  it("treats empty/whitespace as placeholder", () => {
    assert.strictEqual(looksLikePlaceholder(""), true);
    assert.strictEqual(looksLikePlaceholder("   "), true);
    assert.strictEqual(looksLikePlaceholder(undefined), true);
  });
  it("flags example-file placeholders", () => {
    assert.strictEqual(looksLikePlaceholder("sk_test_DEIN_KEY"), true);
    assert.strictEqual(looksLikePlaceholder("whsec_DEIN_SECRET"), true);
    assert.strictEqual(looksLikePlaceholder("xxxxxxxx"), true);
  });
  it("accepts a real-looking key (consistent with config.stripe_enabled)", () => {
    // "sk_test_xxx" (3 x) ist KEIN Platzhalter – exakt der Wert aus payment.route.test.js
    assert.strictEqual(looksLikePlaceholder("sk_test_xxx"), false);
    assert.strictEqual(looksLikePlaceholder("sk_live_realKey123"), false);
  });
  it("isStripeConfigured reflects placeholder logic", () => {
    assert.strictEqual(isStripeConfigured({ STRIPE_SECRET_KEY: "sk_test_xxx" }), true);
    assert.strictEqual(isStripeConfigured({ STRIPE_SECRET_KEY: "" }), false);
    assert.strictEqual(isStripeConfigured({}), false);
  });
});

// ── Provider-Auflösung ────────────────────────────────────────
describe("resolveBillingProvider", () => {
  it("explicit provider always wins", () => {
    for (const p of ["stripe", "manual", "disabled"]) {
      const r = resolveBillingProvider({ BILLING_PROVIDER: p, PAYMENT_MODE: "demo" });
      assert.strictEqual(r.provider, p);
      assert.strictEqual(r.source, "explicit");
    }
  });

  it("explicit is case-insensitive and trimmed", () => {
    const r = resolveBillingProvider({ BILLING_PROVIDER: "  STRIPE  " });
    assert.strictEqual(r.provider, "stripe");
    assert.strictEqual(r.source, "explicit");
  });

  it("derives stripe when key present and mode is not demo", () => {
    const r = resolveBillingProvider({ PAYMENT_MODE: "live", STRIPE_SECRET_KEY: "sk_test_xxx" });
    assert.strictEqual(r.provider, "stripe");
    assert.strictEqual(r.source, "derived");
    assert.strictEqual(r.stripe_configured, true);
  });

  it("derives manual in demo mode even with a key", () => {
    const r = resolveBillingProvider({ PAYMENT_MODE: "demo", STRIPE_SECRET_KEY: "sk_test_xxx" });
    assert.strictEqual(r.provider, "manual");
    assert.strictEqual(r.source, "derived");
  });

  it("derives manual when no real key even if mode is live", () => {
    const r = resolveBillingProvider({ PAYMENT_MODE: "live", STRIPE_SECRET_KEY: "" });
    assert.strictEqual(r.provider, "manual");
    assert.strictEqual(r.stripe_configured, false);
  });

  it("invalid explicit value falls back to derivation", () => {
    const r = resolveBillingProvider({ BILLING_PROVIDER: "stipe", PAYMENT_MODE: "demo" });
    assert.strictEqual(r.provider, "manual");
    assert.strictEqual(r.source, "derived");
  });

  it("opts.stripeConfigured overrides key inspection", () => {
    const r = resolveBillingProvider({ PAYMENT_MODE: "live" }, { stripeConfigured: true });
    assert.strictEqual(r.provider, "stripe");
  });

  it("defaults to manual on empty config (no keys, demo)", () => {
    const r = resolveBillingProvider({});
    assert.strictEqual(r.provider, "manual");
    assert.strictEqual(r.payment_mode, "demo");
  });
});

// ── Fähigkeiten / Selbstauskunft ──────────────────────────────
describe("describeBilling", () => {
  it("stripe with key+webhook: full self-service capabilities, no warnings", () => {
    const d = describeBilling({
      BILLING_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_test_xxx",
      STRIPE_WEBHOOK_SECRET: "whsec_real"
    });
    assert.strictEqual(d.provider, "stripe");
    assert.strictEqual(d.capabilities.self_service_checkout, true);
    assert.strictEqual(d.capabilities.recurring, true);
    assert.strictEqual(d.capabilities.customer_portal, true);
    assert.strictEqual(d.capabilities.webhooks, true);
    assert.strictEqual(d.capabilities.manual_invoicing, false);
    assert.deepStrictEqual(d.warnings, []);
  });

  it("stripe explicit WITHOUT key degrades honestly and warns", () => {
    const d = describeBilling({ BILLING_PROVIDER: "stripe", STRIPE_SECRET_KEY: "" });
    assert.strictEqual(d.provider, "stripe");
    assert.strictEqual(d.stripe_configured, false);
    assert.strictEqual(d.capabilities.self_service_checkout, false);
    assert.strictEqual(d.capabilities.webhooks, false);
    assert.ok(d.warnings.some((w) => w.includes("STRIPE_SECRET_KEY")));
  });

  it("stripe with key but missing webhook secret: checkout yes, webhooks no + warning", () => {
    const d = describeBilling({
      BILLING_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_test_xxx",
      STRIPE_WEBHOOK_SECRET: ""
    });
    assert.strictEqual(d.capabilities.self_service_checkout, true);
    assert.strictEqual(d.capabilities.webhooks, false);
    assert.ok(d.warnings.some((w) => w.includes("STRIPE_WEBHOOK_SECRET")));
  });

  it("manual provider: invoicing capability, no self-service", () => {
    const d = describeBilling({ BILLING_PROVIDER: "manual" });
    assert.strictEqual(d.provider, "manual");
    assert.strictEqual(d.capabilities.manual_invoicing, true);
    assert.strictEqual(d.capabilities.self_service_checkout, false);
    assert.strictEqual(d.capabilities.recurring, false);
    assert.deepStrictEqual(d.warnings, []);
  });

  it("disabled provider: all capabilities false", () => {
    const d = describeBilling({ BILLING_PROVIDER: "disabled" });
    assert.strictEqual(d.provider, "disabled");
    assert.strictEqual(d.capabilities.self_service_checkout, false);
    assert.strictEqual(d.capabilities.manual_invoicing, false);
    assert.strictEqual(d.capabilities.webhooks, false);
  });

  it("invalid explicit provider warns and falls back to manual", () => {
    const d = describeBilling({ BILLING_PROVIDER: "stipe" });
    assert.strictEqual(d.provider, "manual");
    assert.strictEqual(d.source, "derived");
    assert.ok(d.warnings.some((w) => w.includes("Unbekannter BILLING_PROVIDER")));
  });

  it("default (empty config) resolves to manual with invoicing", () => {
    const d = describeBilling({});
    assert.strictEqual(d.provider, "manual");
    assert.strictEqual(d.capabilities.manual_invoicing, true);
  });
});

// ── Event-Normalisierung ──────────────────────────────────────
describe("mapStripeEvent", () => {
  it("checkout.session.completed → activation with all fields", () => {
    const intent = mapStripeEvent({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { checkout_id: "ck-1", plan: "PLUS", user_id: "42", org_id: "org-9" },
          payment_intent: "pi_xxx",
          subscription: "sub_xxx",
          invoice: "in_xxx"
        }
      }
    });
    assert.strictEqual(intent.kind, "activation");
    assert.strictEqual(intent.checkout_id, "ck-1");
    assert.strictEqual(intent.plan, "PLUS");
    assert.strictEqual(intent.user_id, "42");
    assert.strictEqual(intent.org_id, "org-9");
    assert.strictEqual(intent.stripe_payment_intent, "pi_xxx");
    assert.strictEqual(intent.stripe_subscription_id, "sub_xxx");
    assert.strictEqual(intent.stripe_invoice_id, "in_xxx");
  });

  it("activation tolerates missing optional fields (null, not undefined)", () => {
    const intent = mapStripeEvent({
      type: "checkout.session.completed",
      data: { object: { metadata: { checkout_id: "ck-1", plan: "BASIS", user_id: "7" } } }
    });
    assert.strictEqual(intent.org_id, null);
    assert.strictEqual(intent.stripe_payment_intent, null);
    assert.strictEqual(intent.stripe_subscription_id, null);
    assert.strictEqual(intent.stripe_invoice_id, null);
    // Phase 2 (Slice B/C): neue additive Felder defaulten auf null.
    assert.strictEqual(intent.request_id, null);
    assert.strictEqual(intent.amount_total, null);
    assert.strictEqual(intent.amount_subtotal, null);
    assert.strictEqual(intent.currency, null);
  });

  it("activation carries request_id + bezahlte Betraege fuer den Manipulationsschutz (Slice B/C)", () => {
    const intent = mapStripeEvent({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { checkout_id: "ck-9", plan: "INDIVIDUELL", user_id: "42", org_id: "org-1", request_id: "req-7" },
          amount_total: 362300,
          amount_subtotal: 362300,
          currency: "eur",
          subscription: "sub_ind",
          invoice: "in_ind"
        }
      }
    });
    assert.strictEqual(intent.kind, "activation");
    assert.strictEqual(intent.request_id, "req-7");
    assert.strictEqual(intent.amount_total, 362300);
    assert.strictEqual(intent.amount_subtotal, 362300);
    assert.strictEqual(intent.currency, "eur");
    assert.strictEqual(intent.stripe_subscription_id, "sub_ind");
  });

  it("customer.subscription.deleted → cancellation", () => {
    const intent = mapStripeEvent({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_cancel_1" } }
    });
    assert.strictEqual(intent.kind, "cancellation");
    assert.strictEqual(intent.stripe_subscription_id, "sub_cancel_1");
  });

  it("invoice.payment_failed → payment_failed (dunning seam)", () => {
    const intent = mapStripeEvent({
      type: "invoice.payment_failed",
      data: { object: { id: "in_fail", subscription: "sub_x", attempt_count: 2, next_payment_attempt: 123 } }
    });
    assert.strictEqual(intent.kind, "payment_failed");
    assert.strictEqual(intent.stripe_subscription_id, "sub_x");
    assert.strictEqual(intent.stripe_invoice_id, "in_fail");
    assert.strictEqual(intent.attempt_count, 2);
    assert.strictEqual(intent.next_payment_attempt, 123);
  });

  it("unknown event type → ignored", () => {
    const intent = mapStripeEvent({ type: "invoice.paid", data: { object: {} } });
    assert.strictEqual(intent.kind, "ignored");
    assert.strictEqual(intent.type, "invoice.paid");
  });

  it("empty/garbage event is safe → ignored", () => {
    assert.strictEqual(mapStripeEvent().kind, "ignored");
    assert.strictEqual(mapStripeEvent({}).kind, "ignored");
    assert.strictEqual(mapStripeEvent({ type: "x" }).kind, "ignored");
  });
});
