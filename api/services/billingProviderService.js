/**
 * Billing-Provider-Abstraktion (Phase D, Slice 1).
 *
 * Zweck: EINE Wahrheitsquelle dafür,
 *   (a) welcher Abrechnungsweg aktiv ist — Self-Service-Stripe vs. Rechnung/Vertrag
 *       (DE-B2B) vs. aus — und
 *   (b) was ein eingehendes Stripe-Webhook-Event fachlich bedeutet.
 *
 * Rein funktional, ohne DB/IO → vollständig unit-testbar und in payment.js additiv
 * (preserve-first) einsetzbar. Es wird KEIN externer Key benötigt, um den Code zu
 * bauen oder zu betreiben: "manual" ist der zukunftssichere Default. Echte
 * Stripe-Keys bleiben Owner-/Betriebssache (Gate-10 / Risiko R2).
 */

export const BILLING_PROVIDERS = Object.freeze({
  STRIPE: "stripe",
  MANUAL: "manual",
  DISABLED: "disabled"
});

const VALID_PROVIDERS = new Set(Object.values(BILLING_PROVIDERS));

// Spiegelt api/config/index.js – ein gesetzter, aber offensichtlich unechter Key
// (Platzhalter aus .env.example) zählt nicht als "konfiguriert".
const PLACEHOLDER_PATTERNS = [
  "dev_secret_change_me", "HIER_", "DEIN_", "PLACEHOLDER",
  "superlangundzufaellig", "sk_test_DEIN", "pk_test_DEIN", "whsec_DEIN", "xxxxxxxx"
];

export function looksLikePlaceholder(val) {
  if (!val || String(val).trim() === "") return true;
  return PLACEHOLDER_PATTERNS.some((p) => String(val).trim().includes(p));
}

/** Echter (nicht-Platzhalter) Stripe-Secret-Key vorhanden? */
export function isStripeConfigured(config = {}) {
  return !looksLikePlaceholder(config.STRIPE_SECRET_KEY);
}

/**
 * Bestimmt den aktiven Billing-Provider.
 *   - Explizites BILLING_PROVIDER (stripe|manual|disabled) gewinnt immer.
 *   - Sonst rückwärtskompatible Ableitung: Stripe nur, wenn ein echter
 *     Stripe-Key vorhanden ist UND PAYMENT_MODE != "demo"; andernfalls "manual".
 * @returns {{provider:string, source:"explicit"|"derived", payment_mode:string, stripe_configured:boolean}}
 */
export function resolveBillingProvider(config = {}, opts = {}) {
  const explicit = String(config.BILLING_PROVIDER || "").toLowerCase().trim();
  const paymentMode = String(config.PAYMENT_MODE || "demo").toLowerCase().trim();
  const stripeConfigured = typeof opts.stripeConfigured === "boolean"
    ? opts.stripeConfigured
    : isStripeConfigured(config);

  if (VALID_PROVIDERS.has(explicit)) {
    return { provider: explicit, source: "explicit", payment_mode: paymentMode, stripe_configured: stripeConfigured };
  }

  const derived = (stripeConfigured && paymentMode !== "demo")
    ? BILLING_PROVIDERS.STRIPE
    : BILLING_PROVIDERS.MANUAL;
  return { provider: derived, source: "derived", payment_mode: paymentMode, stripe_configured: stripeConfigured };
}

/**
 * Ehrliche Selbstauskunft für /payment/config und SCC-Billing-Sicht:
 * welcher Provider, woraus abgeleitet, welche Fähigkeiten real verfügbar sind,
 * plus Warnungen bei Fehlkonfiguration (Provider=stripe ohne Key etc.).
 */
export function describeBilling(config = {}, opts = {}) {
  const resolution = resolveBillingProvider(config, opts);
  const { provider, stripe_configured: stripeConfigured } = resolution;
  const webhookConfigured = !looksLikePlaceholder(config.STRIPE_WEBHOOK_SECRET);
  const stripeActive = provider === BILLING_PROVIDERS.STRIPE && stripeConfigured;

  const capabilities = {
    self_service_checkout: stripeActive,
    recurring: stripeActive,
    customer_portal: stripeActive,
    webhooks: stripeActive && webhookConfigured,
    manual_invoicing: provider === BILLING_PROVIDERS.MANUAL
  };

  const warnings = [];
  const explicitRaw = String(config.BILLING_PROVIDER || "").toLowerCase().trim();
  if (explicitRaw && !VALID_PROVIDERS.has(explicitRaw)) {
    warnings.push(`Unbekannter BILLING_PROVIDER="${explicitRaw}" – abgeleiteter Provider "${provider}" wird genutzt.`);
  }
  if (provider === BILLING_PROVIDERS.STRIPE && !stripeConfigured) {
    warnings.push("BILLING_PROVIDER=stripe, aber STRIPE_SECRET_KEY fehlt/Platzhalter – Self-Service-Checkout deaktiviert.");
  }
  if (stripeActive && !webhookConfigured) {
    warnings.push("STRIPE_WEBHOOK_SECRET fehlt/Platzhalter – Aktivierungen per Webhook werden nicht verarbeitet.");
  }

  return {
    provider,
    source: resolution.source,
    payment_mode: resolution.payment_mode,
    stripe_configured: stripeConfigured,
    capabilities,
    warnings
  };
}

/**
 * Normalisiert ein Stripe-Webhook-Event in eine provider-unabhängige Absicht.
 * Zentralisiert die Event-Semantik, damit payment.js (und künftige Provider)
 * EINE Stelle haben, an der "was bedeutet dieses Event" entschieden wird.
 *   checkout.session.completed   → kind "activation"
 *   customer.subscription.deleted → kind "cancellation"
 *   invoice.payment_failed        → kind "payment_failed" (Dunning-Naht, Slice 3)
 *   sonst                         → kind "ignored"
 */
export function mapStripeEvent(event = {}) {
  const type = event?.type || "";
  const obj = (event?.data && event.data.object) || {};

  switch (type) {
    case "checkout.session.completed": {
      const md = obj.metadata || {};
      return {
        kind: "activation",
        type,
        checkout_id: md.checkout_id || null,
        plan: md.plan || null,
        user_id: md.user_id || null,
        org_id: md.org_id || null,
        // Self-Service-INDIVIDUELL: verknuepft das Event mit der zugrunde
        // liegenden subscription_request (Slice B/C). Fuer BASIS/PLUS/PRO bleibt
        // dies null → der bestehende Aktivierungspfad ist unveraendert.
        request_id: md.request_id || null,
        // Befund P1-22: Guthabenkauf. Steht die Kennung im Metadatensatz, war
        // es kein Abo-Checkout, sondern ein Einmalkauf von Guthaben — der
        // Webhook schreibt dann gut statt zu aktivieren.
        credit_package_id: md.credit_package_id || null,
        // Bezahlte Betraege (in Cent) fuer den Manipulationsschutz: der Webhook
        // verifiziert sie gegen den server-eingefrorenen Preis, bevor aktiviert
        // wird. amount_subtotal = netto (ohne Steuer); amount_total inkl. Steuer.
        amount_total: Number.isFinite(obj.amount_total) ? obj.amount_total : null,
        amount_subtotal: Number.isFinite(obj.amount_subtotal) ? obj.amount_subtotal : null,
        currency: obj.currency || null,
        stripe_payment_intent: obj.payment_intent || null,
        stripe_subscription_id: obj.subscription || null,
        stripe_invoice_id: obj.invoice || null
      };
    }
    case "customer.subscription.deleted":
      return { kind: "cancellation", type, stripe_subscription_id: obj.id || null };
    case "invoice.payment_failed":
      return {
        kind: "payment_failed",
        type,
        stripe_subscription_id: obj.subscription || null,
        stripe_invoice_id: obj.id || null,
        attempt_count: Number.isFinite(obj.attempt_count) ? obj.attempt_count : null,
        next_payment_attempt: obj.next_payment_attempt || null
      };
    default:
      return { kind: "ignored", type };
  }
}
