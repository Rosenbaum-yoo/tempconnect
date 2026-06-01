-- =============================================================================
-- Migration 100: Wirksamkeits- und Impact-Felder fuer subscription_requests
--
-- Bestehende `subscription_requests` (Migration 099) bekommen die Daten,
-- die fuer einen sauberen Upgrade-/Downgrade-/Kuendigungsfluss gebraucht
-- werden:
--
--   - effective_from           Wann tritt die Aenderung fachlich in Kraft?
--                              (Wirksamkeitsdatum aus Sicht der Plattform-Features)
--   - billing_effective_from   Wann startet die abrechnungsrelevante Wirkung?
--                              (kann von effective_from abweichen, z.B.
--                              prorata-Buchung oder zum naechsten Zyklus)
--   - effective_until          Optionales Ablaufdatum (z.B. fuer Pilot-Slot)
--   - cancellation_effective_at Bei request_type='cancellation': wann wirksam.
--   - downgrade_impact_snapshot JSONB-Snapshot der Impact-Pruefung
--                              (users_over_limit, sites_over_limit,
--                              features_lost[], blocking_processes[]).
--                              Wird bei Anlage einer downgrade-Anfrage
--                              gespeichert, damit Staff exakt sieht,
--                              was der Kunde zum Anfragezeitpunkt sah.
--
-- Alle Felder sind nullable; Bestandsdaten bleiben unangetastet.
-- =============================================================================

BEGIN;

ALTER TABLE subscription_requests
  ADD COLUMN IF NOT EXISTS effective_from TIMESTAMPTZ NULL;

ALTER TABLE subscription_requests
  ADD COLUMN IF NOT EXISTS billing_effective_from TIMESTAMPTZ NULL;

ALTER TABLE subscription_requests
  ADD COLUMN IF NOT EXISTS effective_until TIMESTAMPTZ NULL;

ALTER TABLE subscription_requests
  ADD COLUMN IF NOT EXISTS cancellation_effective_at TIMESTAMPTZ NULL;

ALTER TABLE subscription_requests
  ADD COLUMN IF NOT EXISTS downgrade_impact_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Index fuer Cron/Backfill: Welche akzeptierten/aktiven Anfragen werden in
-- den naechsten Tagen wirksam?
CREATE INDEX IF NOT EXISTS idx_subreq_effective_from
  ON subscription_requests(effective_from)
  WHERE effective_from IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subreq_cancellation_effective
  ON subscription_requests(cancellation_effective_at)
  WHERE cancellation_effective_at IS NOT NULL
    AND status NOT IN ('rejected','cancelled','expired');

COMMIT;
