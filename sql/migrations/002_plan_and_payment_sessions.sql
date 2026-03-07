-- Migration: 002_plan_and_payment_sessions
-- 1) subscriptions.plan: STARTER/PRO -> FREE/BASIS/PLUS (Legacy-Migration)
-- 2) payment_sessions Tabelle (einzige Definition – nicht in init.sql)

UPDATE subscriptions SET plan = 'BASIS' WHERE plan = 'STARTER';
UPDATE subscriptions SET plan = 'PLUS'  WHERE plan = 'PRO';

-- Plan-Constraint vereinheitlichen (idempotent)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'subscriptions'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%plan%'
  ) LOOP
    EXECUTE 'ALTER TABLE subscriptions DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'subscriptions'::regclass AND conname = 'subscriptions_plan_check'
  ) THEN
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_check
      CHECK (plan IN ('FREE','BASIS','PLUS','NOTDIENST'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS payment_sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('FREE','BASIS','PLUS','NOTDIENST')),
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  method TEXT NOT NULL CHECK (method IN ('demo','stripe','paypal')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','expired')),
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS payment_sessions_user_id_idx ON payment_sessions(user_id);
