-- 060: Bounty Tier System — Bronze bis Diamant
-- Jeder Tier hat ein max. Discount-Cap und Aufstiegsbedingungen.

BEGIN;

-- ══════════════════════════════════════════════════════════════
-- 1. bounty_tiers — Statische Tier-Definitionen
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bounty_tiers (
  id            SERIAL PRIMARY KEY,
  key           TEXT UNIQUE NOT NULL,
  name_de       TEXT NOT NULL,
  icon          TEXT NOT NULL,
  color         TEXT NOT NULL,
  bg_color      TEXT NOT NULL,
  sort_order    INT NOT NULL DEFAULT 0,
  max_discount_pct  NUMERIC(4,1) NOT NULL,
  -- Aufstiegsbedingungen (JSON)
  conditions    JSONB NOT NULL DEFAULT '{}'
);

INSERT INTO bounty_tiers (key, name_de, icon, color, bg_color, sort_order, max_discount_pct, conditions) VALUES
  ('bronze',   'Bronze',   '🥉', '#cd7f32', 'rgba(205,127,50,.12)',  1,  8.0, '{"min_bounties": 1, "min_months": 0}'),
  ('silver',   'Silber',   '🥈', '#c0c0c0', 'rgba(192,192,192,.12)', 2, 10.0, '{"min_bounties": 3, "min_months": 3}'),
  ('gold',     'Gold',     '🥇', '#ffd700', 'rgba(255,215,0,.12)',   3, 15.0, '{"min_bounties": 5, "min_months": 6, "min_deals": 10}'),
  ('platinum', 'Platin',   '💠', '#e5e4e2', 'rgba(229,228,226,.15)', 4, 20.0, '{"min_bounties": 8, "min_months": 18, "min_deals": 50, "min_avg_rating": 4.2}'),
  ('diamond',  'Diamant',  '💎', '#b9f2ff', 'rgba(185,242,255,.15)', 5, 25.0, '{"min_bounties": 10, "min_months": 60, "min_deals": 100, "min_avg_rating": 4.5, "zero_complaints_12m": true, "top_10_pct": true}')
ON CONFLICT (key) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- 2. user_bounty_tiers — Aktueller Tier pro User
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_bounty_tiers (
  id            SERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier_key      TEXT NOT NULL REFERENCES bounty_tiers(key),
  promoted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_bounty_tiers_user ON user_bounty_tiers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bounty_tiers_tier ON user_bounty_tiers(tier_key);

COMMIT;
