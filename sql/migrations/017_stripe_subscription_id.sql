-- Migration: 017_stripe_subscription_id
-- Stripe-Abo: subscription_id speichern für Webhook customer.subscription.deleted (Kündigung → User auf FREE)

ALTER TABLE payment_sessions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

CREATE INDEX IF NOT EXISTS payment_sessions_stripe_subscription_id_idx
  ON payment_sessions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
