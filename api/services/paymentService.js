/**
 * Payment-Service: SQL-Queries fuer Zahlungen und Abo-Verwaltung.
 */

/** Payment-Session erstellen. */
export async function createPaymentSession(pool, { id, userId, plan, amount, method, stripeSessionId }) {
  if (stripeSessionId) {
    await pool.query(
      "INSERT INTO payment_sessions (id, user_id, plan, amount, method, status, stripe_session_id, created_at) VALUES ($1, $2, $3, $4, $5, 'pending', $6, NOW())",
      [id, userId, plan, amount, method, stripeSessionId]
    );
  } else {
    await pool.query(
      "INSERT INTO payment_sessions (id, user_id, plan, amount, method, status, created_at) VALUES ($1, $2, $3, $4, $5, 'pending', NOW())",
      [id, userId, plan, amount, method]
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

/** Abo aktivieren (neuen Subscriptions-Eintrag). */
export async function activatePlan(pool, userId, plan) {
  await pool.query(
    "INSERT INTO subscriptions (user_id, plan, status) VALUES ($1, $2, 'active')",
    [userId, plan]
  );
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
