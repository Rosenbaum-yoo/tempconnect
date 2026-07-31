-- 157: Verfuegbarkeit einer Einsatzkraft — strukturiert, aber als UEBERSTEUERUNG
--      (Multi-Skill Welle 2, Owner-Vorgabe: "manuelle Erfassung auf das Minimum").
--
-- DIE IDEE
-- Nicht fragen, was das System wissen kann. Die drei Angaben, die der Angebotsgenerator
-- (Welle 3) braucht, lassen sich fast immer herleiten:
--
--   verfuegbar ab  <- Ende des letzten Einsatzes (`worker_assignment_links.end_date`)
--   Umfang         <- `worker_assignment_links.default_hours_per_day`
--   Einsatzradius  <- `org_settings.default_radius_km` (gehoert an den Betrieb, nicht
--                     an jede Kraft einzeln)
--
-- Diese Spalten sind deshalb ausdruecklich **NULL-bar** und bedeuten:
--   NULL  = "nichts gesagt" -> ableiten bzw. erben
--   Wert  = "die Kraft (oder der Disponent) hat es ausdruecklich anders gesagt"
--
-- Ein Default-Wert waere hier falsch: er wuerde die Herleitung stumm ueberschreiben, und
-- niemand koennte spaeter unterscheiden, ob "40 Stunden" eine Aussage oder eine Annahme
-- ist. Genau diese Unterscheidung braucht die Oberflaeche, um ehrlich anzuzeigen
-- ("abgeleitet aus dem Einsatz bis 15.09." statt eines leeren Feldes).
--
-- Fuer eine NEUE Kraft ohne Historie bleiben damit zwei Fragen im Aufnahme-Assistenten
-- (ab wann, wie viel) — der Radius wird geerbt. Fuer den Bestand: keine.
--
-- Rollback:
--   ALTER TABLE worker_profiles
--     DROP COLUMN IF EXISTS available_from,
--     DROP COLUMN IF EXISTS weekly_hours,
--     DROP COLUMN IF EXISTS travel_radius_km;

BEGIN;

SET client_min_messages TO WARNING;

ALTER TABLE worker_profiles
  ADD COLUMN IF NOT EXISTS available_from   DATE,
  ADD COLUMN IF NOT EXISTS weekly_hours     NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS travel_radius_km INTEGER;

-- Plausibilitaet: unsinnige Werte gar nicht erst zulassen. Bewusst grosszuegig —
-- Teilzeit ab 1 Stunde, und 500 km deckt auch Montage-Einsaetze ab.
ALTER TABLE worker_profiles DROP CONSTRAINT IF EXISTS worker_profiles_weekly_hours_check;
ALTER TABLE worker_profiles ADD CONSTRAINT worker_profiles_weekly_hours_check
  CHECK (weekly_hours IS NULL OR (weekly_hours > 0 AND weekly_hours <= 80));

ALTER TABLE worker_profiles DROP CONSTRAINT IF EXISTS worker_profiles_travel_radius_check;
ALTER TABLE worker_profiles ADD CONSTRAINT worker_profiles_travel_radius_check
  CHECK (travel_radius_km IS NULL OR (travel_radius_km >= 1 AND travel_radius_km <= 500));

COMMENT ON COLUMN worker_profiles.available_from IS
  'Ausdrueckliche Angabe "verfuegbar ab". NULL = aus dem letzten Einsatz herleiten (siehe workerAvailabilityService).';
COMMENT ON COLUMN worker_profiles.weekly_hours IS
  'Ausdruecklicher Wochenumfang. NULL = aus default_hours_per_day der Einsaetze herleiten.';
COMMENT ON COLUMN worker_profiles.travel_radius_km IS
  'Ausdruecklicher Einsatzradius der Kraft. NULL = org_settings.default_radius_km erben.';

-- Der Angebotsgenerator fragt "wer ist ab wann verfuegbar" pro Lieferanten-Org.
-- Partiell, weil eine ausdrueckliche Angabe die Ausnahme sein soll.
CREATE INDEX IF NOT EXISTS worker_profiles_available_from_idx
  ON worker_profiles(supplier_org_id, available_from)
  WHERE available_from IS NOT NULL;

COMMIT;
