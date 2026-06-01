-- 053_bounty_system.sql
-- Bounty-System: Gamification, Loyalitaets-Rabatte, Meilensteine

BEGIN;

-- ══════════════════════════════════════════════════════════════
-- 1. bounties — Katalog aller verfuegbaren Bounty-Typen
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bounties (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key           TEXT UNIQUE NOT NULL,
  name_de       TEXT NOT NULL,
  description_de TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('performance','activity','loyalty','community')),
  icon          TEXT NOT NULL DEFAULT '🏆',
  discount_pct  NUMERIC(4,1) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 20),
  -- Threshold definition (evaluated by bountyService)
  threshold_type TEXT NOT NULL DEFAULT 'custom',
  threshold_value JSONB NOT NULL DEFAULT '{}',
  -- Recurring = verfaellt wenn Bedingung nicht mehr erfuellt
  is_recurring  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════
-- 2. user_bounties — Zuordnung User <-> verdiente Bounties
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_bounties (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bounty_id   UUID NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
  earned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  progress    NUMERIC(5,2) DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, bounty_id)
);

CREATE INDEX IF NOT EXISTS idx_user_bounties_user   ON user_bounties(user_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_bounties_bounty  ON user_bounties(bounty_id);

-- ══════════════════════════════════════════════════════════════
-- 3. user_milestones — Meilenstein-Events
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_milestones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone_key   TEXT NOT NULL,
  milestone_label TEXT NOT NULL,
  icon            TEXT NOT NULL DEFAULT '🎯',
  reached_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified        BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(user_id, milestone_key)
);

CREATE INDEX IF NOT EXISTS idx_user_milestones_user ON user_milestones(user_id);

-- ══════════════════════════════════════════════════════════════
-- 4. Seed: Bounty-Definitionen
-- ══════════════════════════════════════════════════════════════

-- ── Performance-Bounties ─────────────────────────────────────
INSERT INTO bounties (key, name_de, description_de, category, icon, discount_pct, threshold_type, threshold_value, is_recurring, sort_order) VALUES
  ('reliability_seal',   'Zuverlaessigkeits-Siegel',  '6 Monate durchgehend Ø 4.5+ Sterne bei Zuverlaessigkeit',                        'performance', '🛡️', 3.0, 'avg_reliability_6m',   '{"min_stars": 4.5, "months": 6}',    TRUE,  1),
  ('top_supplier',       'Top-Supplier-Status',       '12 Monate durchgehend im Top 10% des Leaderboards',                               'performance', '👑', 5.0, 'top_percentile_12m',   '{"percentile": 10, "months": 12}',   TRUE,  2),
  ('zero_complaint',     'Null-Beschwerde-Streak',    '12 Monate ohne Beanstandung oder Storno',                                         'performance', '✨', 3.0, 'zero_complaints_12m',  '{"months": 12}',                     TRUE,  3),
  ('communication_pro',  'Kommunikations-Profi',      'Ø 4.8+ bei Communication-Rating ueber 20+ Bewertungen',                           'performance', '💬', 2.0, 'avg_communication',    '{"min_stars": 4.8, "min_ratings": 20}', TRUE, 4)
ON CONFLICT (key) DO NOTHING;

-- ── Aktivitaets-Bounties ─────────────────────────────────────
INSERT INTO bounties (key, name_de, description_de, category, icon, discount_pct, threshold_type, threshold_value, is_recurring, sort_order) VALUES
  ('power_user',         'Power User',                '50+ erfolgreiche Matches auf der Plattform',                                      'activity', '⚡', 2.0, 'completed_deals',      '{"min_deals": 50}',                  FALSE, 10),
  ('blitz_responder',    'Blitz-Responder',           'Ø Antwortzeit unter 30 Min bei 90%+ der Anfragen (3 Monate)',                     'activity', '🚀', 3.0, 'response_time_3m',     '{"max_minutes": 30, "min_rate": 90, "months": 3}', TRUE, 11),
  ('emergency_hero',     'Notdienst-Held',            '10+ erfolgreich besetzte Emergency-Anfragen',                                     'activity', '🦸', 2.0, 'emergency_deals',      '{"min_deals": 10}',                  FALSE, 12),
  ('marketplace_active', 'Marktplatz-Aktiv',          'Mind. 5 aktive Kapazitaeten pro Monat ueber 6 Monate',                            'activity', '📊', 2.0, 'active_listings_6m',   '{"min_listings": 5, "months": 6}',   TRUE,  13)
ON CONFLICT (key) DO NOTHING;

-- ── Loyalitaets-Bounties ─────────────────────────────────────
INSERT INTO bounties (key, name_de, description_de, category, icon, discount_pct, threshold_type, threshold_value, is_recurring, sort_order) VALUES
  ('loyalty_1y',         '1 Jahr TempConnect',        '12 Monate aktives Abo auf der Plattform',                                         'loyalty', '🎂', 5.0, 'subscription_age',     '{"months": 12}',                    FALSE, 20),
  ('loyalty_2y',         '2 Jahre TempConnect',        '24 Monate aktives Abo (ersetzt 1-Jahres-Bounty)',                                 'loyalty', '🏅', 8.0, 'subscription_age',     '{"months": 24, "replaces": "loyalty_1y"}', FALSE, 21),
  ('founding_member',    'Gruendungsmitglied',        'Registrierung im ersten Jahr der Plattform (vor 2027)',                            'loyalty', '🌟', 3.0, 'registration_before',  '{"before": "2027-01-01"}',           FALSE, 22)
ON CONFLICT (key) DO NOTHING;

-- ── Community-Bounties ───────────────────────────────────────
INSERT INTO bounties (key, name_de, description_de, category, icon, discount_pct, threshold_type, threshold_value, is_recurring, sort_order) VALUES
  ('network_builder',    'Netzwerk-Builder',          '5 Unternehmen erfolgreich geworben (Referral)',                                    'community', '🤝', 5.0, 'referrals',            '{"min_referrals": 5}',              FALSE, 30),
  ('rating_champion',    'Bewertungs-Champion',       '50+ abgegebene Bewertungen (foerdert Datenqualitaet)',                             'community', '⭐', 2.0, 'ratings_given',        '{"min_ratings": 50}',               FALSE, 31),
  ('onboarding_mentor',  'Onboarding-Mentor',         '3 neuen Nutzern beim Einstieg geholfen',                                          'community', '🎓', 2.0, 'mentoring',            '{"min_mentored": 3}',               FALSE, 32)
ON CONFLICT (key) DO NOTHING;

COMMIT;
