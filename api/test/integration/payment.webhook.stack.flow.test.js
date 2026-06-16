/**
 * Regression-Test fuer die zwei Webhook-Middleware-Ketten-Blocker (Pre-Launch-Review 2026-06-16):
 *   (1) Globaler express.json() darf den Stripe-Roh-Body NICHT vor der HMAC-Signaturpruefung
 *       (constructEvent) konsumieren  -> sonst 400 INVALID_SIGNATURE bei JEDEM Webhook.
 *   (2) Globaler csrfProtect MUSS /payment/webhook/* ausnehmen (sessionlos, HMAC-gesichert)
 *       -> sonst 403 CSRF_INVALID vor dem Handler. Achtung: csrfProtect ist unter
 *       app.use("/api/", …) gemountet → req.path ist um /api gekuerzt, die /vN-Version
 *       bleibt (z.B. "/v1/payment/webhook/stripe") — die Exemption muss das tolerieren.
 *
 * WICHTIG: geht durch die VOLL aufgebaute App (createApp), NICHT via findHandler — nur so
 * wird die echte Middleware-Kette (express.json verify -> csrfProtect -> Route) durchlaufen.
 * Genau diese Kette umgehen die bestehenden findHandler-Tests, weshalb beide Defekte test-blind waren.
 *
 * Kein DB-Schreibzugriff: ein valide signiertes Event eines UNBEHANDELTEN Typs mappt zu
 * kind:"ignored" und endet bei res.json({received:true}) ohne Pool-Query.
 *
 * Run (Container mit DB): node --test --test-force-exit test/integration/payment.webhook.stack.flow.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";

// DB-Gate wie alle Integrationstests (Session-Store/Middleware brauchen die DB).
const hasDb = !!(
  process.env.DATABASE_URL ||
  (process.env.DB_HOST && process.env.POSTGRES_PASSWORD)
);

// Stripe-Konfiguration VOR dem Import von app.js setzen (config liest env beim Import).
// node --test isoliert jede Datei in einem eigenen Prozess -> config ist hier frisch.
const WEBHOOK_SECRET = "whsec_stack_regression_test";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_stack_regression_dummy";
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.PAYMENT_MODE = "live";

// App + Stripe EINMAL bauen: prom-client registriert globale Metriken (db_pool_total_count) —
// ein zweiter createApp()-Aufruf im selben Prozess wuerfe "metric already registered".
const createApp = hasDb ? (await import("../../app.js")).createApp : null;
const Stripe = hasDb ? (await import("stripe")).default : null;
const app = hasDb ? await createApp() : null;
const stripe = hasDb ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

describe("Stripe-Webhook durch die echte App-Middleware-Kette (Roh-Body + CSRF-Exemption)", () => {
  it("valide signiertes Event passiert CSRF + Roh-Body-Parsing -> 200 received (kein 403, kein 400)", async (t) => {
    if (!hasDb) { t.skip("Keine DB konfiguriert (Integrationstest)"); return; }
    // Unbehandelter Event-Typ -> mapStripeEvent => kind:"ignored" => 200 ohne DB-Query.
    const payload = JSON.stringify({ id: "evt_stack_probe", type: "tc.stack.probe", data: { object: {} } });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });

    const res = await supertest(app)
      .post("/api/v1/payment/webhook/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", header)
      .send(payload);

    assert.notStrictEqual(res.status, 403, "csrfProtect muss /payment/webhook/* ausnehmen (403 = CSRF blockt)");
    assert.notStrictEqual(res.status, 400, "Roh-Body muss constructEvent erreichen (400 = Body geparst/leer)");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body?.received, true);
  });

  it("ungueltige Signatur wird mit 400 abgewiesen (HMAC-Pruefung weiterhin aktiv)", async (t) => {
    if (!hasDb) { t.skip("Keine DB konfiguriert (Integrationstest)"); return; }
    const payload = JSON.stringify({ id: "evt_bad_sig", type: "tc.stack.probe", data: { object: {} } });

    const res = await supertest(app)
      .post("/api/v1/payment/webhook/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "t=123,v1=deadbeefdeadbeef")
      .send(payload);

    assert.notStrictEqual(res.status, 403, "auch hier kein CSRF-403 (Exemption greift)");
    assert.strictEqual(res.status, 400);
  });
});
