-- 054_referral_program.sql
-- Pilotkunden-Programm & Referral-Cashback-System
--
-- Pilotkunden:  1 Monat gratis + bis zu 6 weitere Gratismonate (je geworbener Kunde + Umfrage)
-- Geworbene:    1 Monat gratis, dann kostenpflichtig. Geld zurueck (max 6 Monate) per eigenem Referral + Umfrage.

BEGIN;

-- ══════════════════════════════════════════════════════════════
-- 1. referral_codes — eindeutiger Empfehlungscode pro User
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS referral_codes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code           TEXT NOT NULL UNIQUE,
  is_pilot       BOOLEAN NOT NULL DEFAULT FALSE,
  pilot_free_months_base INT NOT NULL DEFAULT 0,     -- 1 fuer Pilotkunden
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON referral_codes(user_id);

-- ══════════════════════════════════════════════════════════════
-- 2. referrals — geworbene Kunden je Werber
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS referrals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  referred_email    TEXT NOT NULL,
  referral_code     TEXT NOT NULL,
  -- Status-Flow: pending -> registered -> survey_done -> active
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','registered','survey_done','active','expired')),
  survey_completed  BOOLEAN NOT NULL DEFAULT FALSE,
  survey_completed_at TIMESTAMPTZ,
  reward_type       TEXT NOT NULL DEFAULT 'free_month'
                      CHECK (reward_type IN ('free_month','cashback')),
  reward_applied    BOOLEAN NOT NULL DEFAULT FALSE,
  reward_applied_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code     ON referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_status   ON referrals(status);

-- ══════════════════════════════════════════════════════════════
-- 3. referral_surveys — Umfragen der geworbenen Kunden
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS referral_surveys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id     UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Umfrage-Felder (einfach gehalten, erweiterbar)
  rating          INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feedback        TEXT,
  how_found       TEXT,
  would_recommend BOOLEAN NOT NULL DEFAULT TRUE,
  completed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(referral_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_surveys_user ON referral_surveys(user_id);

-- ══════════════════════════════════════════════════════════════
-- 4. referral_rewards — Abrechnungs-Ledger (Gratis-Monate / Cashback)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS referral_rewards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referral_id     UUID REFERENCES referrals(id) ON DELETE SET NULL,
  reward_type     TEXT NOT NULL CHECK (reward_type IN ('free_month','cashback','pilot_base')),
  amount_eur      NUMERIC(10,2) DEFAULT 0,            -- bei cashback: Betrag
  month_label     TEXT,                                -- z.B. '2026-04' fuer welchen Monat
  applied_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  description     TEXT
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_user ON referral_rewards(user_id);

COMMIT;
