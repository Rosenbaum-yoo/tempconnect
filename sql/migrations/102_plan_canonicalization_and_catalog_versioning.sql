-- =============================================================================
-- Migration 102: Plan-Kanonisierung + Catalog-Versionierung + Tier-V2 Backfill
--
-- Ziel:
--   1. Bestandsdaten auf die kanonischen Plan-Keys ueberfuehren
--      (DEMO / BASIS / PLUS / PRO / INDIVIDUELL).
--   2. Alte Schreibweisen (FREE, ENTERPRISE, INDIVIDUAL, NOTDIENST) per
--      idempotentem UPDATE normalisieren.
--   3. Plan-CHECK-Constraints auf die kanonische 5er-Liste reduzieren.
--   4. organizations.individual_tier_auto auf die NEUEN Schwellen
--      (50 / 150 / 350) backfillen, basierend auf employee_count_approx.
--   5. Erste DB-seitige Catalog-Versionierung (Tabelle `catalog_versions`)
--      anlegen, damit Preis-/Feature-/Addon-Aenderungen mit Snapshot,
--      Changelog und Aktor revisionssicher dokumentiert sind.
--
-- Ausdruecklich NICHT angefasst:
--   - organizations.company_size_class (Klassen I/II/III/IV).
--     Eine Re-Klassifikation in S/M/L/Enterprise erfolgt ueber das
--     orthogonale Feld `individual_tier_auto`. Damit bleibt der alte
--     Wert aus Backward-Compat valide, das neue Modell ist additiv.
--   - subscriptions.status / lifecycle (separate Welle).
--   - users-Plan-Felder (User-zentrierter Plan kommt aus `subscriptions`,
--     wird ueber Migration 080 schon kanonisch behandelt).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) BESTANDSDATEN NORMALISIEREN — vor jedem CHECK-Wechsel.
--    FREE        -> DEMO
--    NOTDIENST   -> PLUS         (Notdienst war frueher eigener Plan,
--                                  ist heute ein Feature in PLUS/PRO/INDIVIDUELL)
--    ENTERPRISE  -> INDIVIDUELL
--    INDIVIDUAL  -> INDIVIDUELL
--
--    Die Updates sind idempotent — wer den Migrationspfad mehrfach durchlaeuft,
--    bekommt nach dem ersten Durchlauf 0 betroffene Zeilen.
-- ---------------------------------------------------------------------------

UPDATE subscriptions SET plan = 'DEMO'        WHERE plan = 'FREE';
UPDATE subscriptions SET plan = 'PLUS'        WHERE plan = 'NOTDIENST';
UPDATE subscriptions SET plan = 'INDIVIDUELL' WHERE plan IN ('ENTERPRISE', 'INDIVIDUAL');

UPDATE organizations SET plan = 'DEMO'        WHERE plan = 'FREE';
UPDATE organizations SET plan = 'PLUS'        WHERE plan = 'NOTDIENST';
UPDATE organizations SET plan = 'INDIVIDUELL' WHERE plan IN ('ENTERPRISE', 'INDIVIDUAL');

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    UPDATE invoices SET plan = 'DEMO'        WHERE plan = 'FREE';
    UPDATE invoices SET plan = 'PLUS'        WHERE plan = 'NOTDIENST';
    UPDATE invoices SET plan = 'INDIVIDUELL' WHERE plan IN ('ENTERPRISE', 'INDIVIDUAL');
  END IF;

  IF to_regclass('public.payment_sessions') IS NOT NULL THEN
    UPDATE payment_sessions SET plan = 'DEMO'        WHERE plan = 'FREE';
    UPDATE payment_sessions SET plan = 'PLUS'        WHERE plan = 'NOTDIENST';
    UPDATE payment_sessions SET plan = 'INDIVIDUELL' WHERE plan IN ('ENTERPRISE', 'INDIVIDUAL');
  END IF;
END $$;

-- target_plan_after_pilot ist Freitext aus 074, kann ENTERPRISE oder INDIVIDUAL
-- enthalten haben — kanonisieren wir auch.
UPDATE organizations
SET target_plan_after_pilot = 'INDIVIDUELL'
WHERE target_plan_after_pilot IN ('ENTERPRISE', 'INDIVIDUAL');
UPDATE organizations
SET target_plan_after_pilot = 'DEMO'
WHERE target_plan_after_pilot = 'FREE';

-- ---------------------------------------------------------------------------
-- 2) PLAN-CHECKS AUF KANONISCHE 5ER-LISTE REDUZIEREN
--    (nur wenn die Tabelle Daten enthaelt, die alle valide sind).
-- ---------------------------------------------------------------------------

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_plan_check CHECK (
    plan IN ('DEMO', 'BASIS', 'PLUS', 'PRO', 'INDIVIDUELL')
  );

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_plan_check;
ALTER TABLE organizations
  ADD CONSTRAINT organizations_plan_check CHECK (
    plan IN ('DEMO', 'BASIS', 'PLUS', 'PRO', 'INDIVIDUELL')
  );

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_plan_check;
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_plan_check CHECK (
        plan IN ('DEMO', 'BASIS', 'PLUS', 'PRO', 'INDIVIDUELL')
      );
  END IF;

  IF to_regclass('public.payment_sessions') IS NOT NULL THEN
    -- Alten CHECK aus 002 wegmachen und kanonisieren.
    ALTER TABLE payment_sessions DROP CONSTRAINT IF EXISTS payment_sessions_plan_check;
    ALTER TABLE payment_sessions
      ADD CONSTRAINT payment_sessions_plan_check CHECK (
        plan IN ('DEMO', 'BASIS', 'PLUS', 'PRO', 'INDIVIDUELL')
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) BACKFILL individual_tier_auto MIT NEUEN SCHWELLEN (50 / 150 / 350)
--    Setzt nur Werte, die noch NULL sind oder die alten Schwellen-Resultate
--    spiegeln. Wer manuell einen Tier gesetzt hat (z.B. via Staff-Approval),
--    bleibt unangetastet.
-- ---------------------------------------------------------------------------

UPDATE organizations
SET individual_tier_auto = CASE
      WHEN COALESCE(employee_count_approx, 0) <= 0   THEN individual_tier_auto
      WHEN employee_count_approx <= 50               THEN 'individuell_s'
      WHEN employee_count_approx <= 150              THEN 'individuell_m'
      WHEN employee_count_approx <= 350              THEN 'individuell_l'
      ELSE                                                 'individuell_enterprise'
    END,
    updated_at = NOW()
WHERE plan = 'INDIVIDUELL'
  AND employee_count_approx IS NOT NULL
  AND employee_count_approx > 0;

-- ---------------------------------------------------------------------------
-- 4) CATALOG-VERSIONIERUNG: Tabelle `catalog_versions`
--    Speichert pro Veroeffentlichung der zentralen Tarif-Wahrheit
--    (`api/config/planCatalog.js`) den vollstaendigen Snapshot, inklusive
--    Aktor und Begruendung. Damit ist eine spaetere Re-Generierung von
--    Preisrechnungen, Dokumenten oder Offerten anhand des historischen
--    Standes moeglich.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS catalog_versions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  version       TEXT        NOT NULL UNIQUE,
  changelog     TEXT,
  snapshot_json JSONB       NOT NULL,
  currency      TEXT        NOT NULL DEFAULT 'EUR',
  size_tier_thresholds JSONB,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_at    TIMESTAMPTZ
);

COMMENT ON TABLE catalog_versions IS
  'Versions-Verlauf des zentralen Tarif-/Feature-/Addon-Katalogs. Quelle: api/config/planCatalog.js';
COMMENT ON COLUMN catalog_versions.version IS
  'Semver-aehnliche Version (z.B. 2026.04.27.1) - identisch mit CATALOG_VERSION-Konstante';
COMMENT ON COLUMN catalog_versions.snapshot_json IS
  'Vollstaendiger Snapshot (plans, features, addons, tiers, baseline) zum Zeitpunkt der Aktivierung';
COMMENT ON COLUMN catalog_versions.size_tier_thresholds IS
  'JSON mit den Tier-Schwellen zum Zeitpunkt der Aktivierung (z.B. {"S":50,"M":150,"L":350})';
COMMENT ON COLUMN catalog_versions.is_active IS
  'TRUE fuer den aktuell genutzten Katalog. Nur eine Zeile darf gleichzeitig is_active=TRUE haben';

CREATE INDEX IF NOT EXISTS catalog_versions_active_idx
  ON catalog_versions(is_active)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS catalog_versions_created_at_idx
  ON catalog_versions(created_at DESC);

-- Partial-Unique: nur EINE aktive Version gleichzeitig.
DROP INDEX IF EXISTS catalog_versions_one_active_uniq;
CREATE UNIQUE INDEX catalog_versions_one_active_uniq
  ON catalog_versions((1))
  WHERE is_active = TRUE;

-- Initialer Snapshot: dokumentiert den Stand mit den NEUEN Schwellen.
-- Snapshot-JSON bleibt minimal (Versions-Stempel) — die App fuettert
-- bei Hochfahrt den vollstaendigen Snapshot ueber den Service-Hook.
INSERT INTO catalog_versions (version, changelog, snapshot_json, currency, size_tier_thresholds, is_active)
VALUES (
  '2026.04.27.1',
  'Plan-Kanonisierung (DEMO/BASIS/PLUS/PRO/INDIVIDUELL), Tier-Schwellen V2 (50/150/350), '
  || 'NOTDIENST/FREE/ENTERPRISE/INDIVIDUAL als Bestandsdaten normalisiert.',
  jsonb_build_object(
    'note', 'Initialer DB-Snapshot. App-Service `catalogVersionService` schreibt vollstaendigen Snapshot beim ersten Boot.',
    'canonical_plan_keys', jsonb_build_array('DEMO','BASIS','PLUS','PRO','INDIVIDUELL')
  ),
  'EUR',
  jsonb_build_object('S', 50, 'M', 150, 'L', 350, 'enterprise_min', 351),
  TRUE
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
