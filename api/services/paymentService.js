/**
 * Payment-Service: SQL-Queries fuer Zahlungen und Abo-Verwaltung.
 */

import { withTransaction } from "../utils/transaction.js";

/** Payment-Session erstellen. */
export async function createPaymentSession(pool, { id, userId, plan, amount, method, stripeSessionId, orgId = null, requestId = null }) {
  if (stripeSessionId) {
    await pool.query(
      "INSERT INTO payment_sessions (id, user_id, plan, amount, method, org_id, status, stripe_session_id, request_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, NOW())",
      [id, userId, plan, amount, method, orgId, stripeSessionId, requestId]
    );
  } else {
    await pool.query(
      "INSERT INTO payment_sessions (id, user_id, plan, amount, method, org_id, status, request_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, NOW())",
      [id, userId, plan, amount, method, orgId, requestId]
    );
  }
}

/** Payment-Session laden. */
export async function getPaymentSession(pool, id, userId) {
  const r = await pool.query(
    "SELECT * FROM payment_sessions WHERE id=$1 AND user_id=$2",
    [id, userId]
  );
  return r.rows[0] || null;
}

/**
 * Payment-Session abschliessen.
 * @param {object} opts - Optional: stripePaymentIntent (einmalig), stripeSubscriptionId (Abo, für Kündigungs-Webhook)
 */
export async function completePaymentSession(pool, id, opts) {
  const pi = opts?.stripePaymentIntent ?? (typeof opts === "string" ? opts : null);
  const subId = opts?.stripeSubscriptionId ?? null;
  if (subId) {
    await pool.query(
      "UPDATE payment_sessions SET status='completed', stripe_payment_intent=$1, stripe_subscription_id=$2, completed_at=NOW() WHERE id=$3",
      [pi || null, subId, id]
    );
  } else if (pi) {
    await pool.query(
      "UPDATE payment_sessions SET status='completed', stripe_payment_intent=$1, completed_at=NOW() WHERE id=$2",
      [pi, id]
    );
  } else {
    await pool.query(
      "UPDATE payment_sessions SET status='completed', completed_at=NOW() WHERE id=$1",
      [id]
    );
  }
}

/** Für Webhook customer.subscription.deleted: User anhand Stripe-Subscription-ID ermitteln. */
export async function getPaymentSessionByStripeSubscriptionId(pool, stripeSubscriptionId) {
  const r = await pool.query(
    "SELECT id, user_id, plan FROM payment_sessions WHERE stripe_subscription_id=$1 AND status='completed' ORDER BY completed_at DESC LIMIT 1",
    [stripeSubscriptionId]
  );
  return r.rows[0] || null;
}

/** Letzte Stripe-Checkout-Session fuer das Customer Portal finden. */
export async function getLatestStripeSessionForCustomerPortal(pool, { userId, orgId = null }) {
  const params = [userId];
  let orgFilter = "";
  if (orgId) {
    params.push(orgId);
    orgFilter = ` AND (org_id = $${params.length} OR org_id IS NULL)`;
  }
  const r = await pool.query(
    `SELECT id, user_id, org_id, stripe_session_id, stripe_subscription_id
       FROM payment_sessions
      WHERE user_id = $1
        AND method = 'stripe'
        AND stripe_session_id IS NOT NULL
        AND status = 'completed'
        ${orgFilter}
      ORDER BY completed_at DESC NULLS LAST, created_at DESC
      LIMIT 1`,
    params
  );
  return r.rows[0] || null;
}

/** Abo aktivieren (neuen Subscriptions-Eintrag). */
export async function activatePlan(pool, userId, plan) {
  let normalizedPlan = String(plan || "FREE").toUpperCase();
  if (normalizedPlan === "DEMO") normalizedPlan = "FREE";
  if (normalizedPlan === "ENTERPRISE" || normalizedPlan === "INDIVIDUAL") normalizedPlan = "INDIVIDUELL";
  const interval = ["FREE", "DEMO"].includes(normalizedPlan) ? "14 days" : "1 month";

  // P9/C2: Erst das alte Abo schliessen, dann das neue anlegen — in EINER
  // Transaktion.
  //
  // Vorher wurde nur eingefuegt. Jede Planaenderung liess die alte Zeile auf
  // 'active' stehen: im Bestand 341 Zeilen fuer 312 Nutzer. Die Anzeige merkte
  // davon nichts (ueberall gewinnt die neueste Zeile), die monatliche
  // Folgerechnung aber schon — sie waehlt nach `status = 'active'` und haette
  // 290 Zeilen bei 263 Nutzern aufgegriffen: 27 Kunden mit zwei Rechnungen fuer
  // denselben Monat.
  //
  // 'canceled' ist der richtige Endzustand: das Abo endet, weil ein anderes an
  // seine Stelle tritt. `canceled_at` haelt fest, wann.
  await withTransaction(pool, async (client) => {
    await client.query(
      `UPDATE subscriptions
          SET status = 'canceled',
              canceled_at = COALESCE(canceled_at, NOW()),
              cancel_source = COALESCE(cancel_source, 'plan_replaced'),
              updated_at = NOW()
        WHERE user_id = $1
          AND status IN ('active', 'past_due', 'canceling')`,
      [userId]
    );
    await client.query(
      `INSERT INTO subscriptions (user_id, plan, status, current_period_start, current_period_end)
       VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '${interval}')`,
      [userId, normalizedPlan]
    );
  });
}

/** Payment-Session Status pruefen (fuer Webhook-Idempotenz). */
export async function getPaymentSessionStatus(pool, id) {
  const r = await pool.query("SELECT status FROM payment_sessions WHERE id=$1", [id]);
  return r.rows[0]?.status || null;
}

/** Zahlungshistorie laden. */
export async function getPaymentHistory(pool, userId) {
  const r = await pool.query(
    "SELECT id, plan, amount, method, status, created_at, completed_at FROM payment_sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20",
    [userId]
  );
  return r.rows;
}
