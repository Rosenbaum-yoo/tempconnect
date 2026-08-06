-- Migration 162: Vermittlungsrelevante Angaben zur Einsatzkraft
-- =============================================================================
-- Owner-Entscheidung 2026-08-06 (B7 aus dem Ursprungsprompt-Audit).
--
-- DIE LEITFRAGE WAR NICHT "was koennte man erfassen", SONDERN
-- "was aendert eine Vermittlungsentscheidung". Alles andere ist Haftung ohne
-- Gegenwert. Bewusst NICHT aufgenommen: IBAN, Sozialversicherungsnummer,
-- Steuer-ID. Sie verbessern die Vermittlung um null und machen ein Datenleck
-- meldepflichtig und existenzbedrohend — sie gehoeren ins Lohnsystem der
-- Zeitarbeitsfirma, nicht in eine Vermittlungsplattform.
--
-- EBENFALLS NICHT HIER: die Arbeitserlaubnis. Sie laeuft ueber die vorhandene
-- Nachweis-Verwaltung (worker_profile_documents, Kategorie 'permit') — dort hat
-- sie bereits Gueltigkeitsdatum, Ablauf-Erinnerung und Pruefstatus. Eine zweite
-- Wahrheit daneben waere genau der Fehler, den dieses Projekt sonst vermeidet.
--
-- WARUM VOLLJAEHRIGKEIT ALS JA/NEIN STATT GEBURTSDATUM
-- Fuer die Vermittlung zaehlt genau eine Schwelle: Das Jugendarbeitsschutzgesetz
-- verbietet unter 18 Nachtarbeit, Gefahrstoffe und lange Schichten. Das exakte
-- Datum beantwortet keine weitere Frage — es ist nur ein zusaetzliches
-- personenbezogenes Datum. NULL heisst "nicht beantwortet", nicht "minderjaehrig":
-- eine unbeantwortete Frage darf niemanden von Einsaetzen ausschliessen.
--
-- ALLE FELDER SIND OPTIONAL (Owner-Entscheidung): sie zaehlen in den
-- Aufnahme-Fortschritt, blockieren die Einsatzbereitschaft aber nicht. Welche
-- Angabe noetig ist, haengt am Einsatz — eine feste Pflicht waere fuer die
-- Haelfte der Faelle falsch und wuerde die Aufnahme ausbremsen.
--
-- Rollback:
--   ALTER TABLE worker_profiles
--     DROP COLUMN IF EXISTS is_of_age,
--     DROP COLUMN IF EXISTS driving_licence_classes,
--     DROP COLUMN IF EXISTS has_own_vehicle,
--     DROP COLUMN IF EXISTS shift_readiness,
--     DROP COLUMN IF EXISTS emergency_contact_name,
--     DROP COLUMN IF EXISTS emergency_contact_phone;
--   DROP INDEX IF EXISTS worker_profiles_shift_readiness_idx;
--   DROP INDEX IF EXISTS worker_profiles_licence_idx;
-- =============================================================================

SET client_min_messages TO WARNING;

BEGIN;

ALTER TABLE worker_profiles
  -- Jugendarbeitsschutz: NULL = nicht beantwortet (schliesst niemanden aus).
  ADD COLUMN IF NOT EXISTS is_of_age BOOLEAN,

  -- Fuehrerschein: Klassen als Menge, damit "wer hat CE?" eine Abfrage ist und
  -- keine Textsuche. Freitext waere hier fatal — "CE", "C/E", "Lkw" sind
  -- dasselbe und wuerden das Matching zerlegen.
  ADD COLUMN IF NOT EXISTS driving_licence_classes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS has_own_vehicle BOOLEAN,

  -- Schichtbereitschaft: dieselbe Ueberlegung. Ohne sie schlaegt das Matching
  -- Einsaetze vor, die die Kraft gar nicht annehmen kann.
  ADD COLUMN IF NOT EXISTS shift_readiness TEXT[] NOT NULL DEFAULT '{}',

  -- Arbeitsschutz: bei einem Unfall auf fremdem Werksgelaende weiss sonst
  -- niemand, wen man anruft. Sichtbar nur fuer die eigene Zeitarbeitsfirma.
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;

-- GIN, weil beide Spalten mit Mengen-Operatoren gesucht werden
-- (shift_readiness && ARRAY['night'], driving_licence_classes @> ARRAY['CE']) —
-- genau das Muster, das capacity_posts.skill_tags schon nutzt.
CREATE INDEX IF NOT EXISTS worker_profiles_shift_readiness_idx
  ON worker_profiles USING GIN (shift_readiness);
CREATE INDEX IF NOT EXISTS worker_profiles_licence_idx
  ON worker_profiles USING GIN (driving_licence_classes);

COMMIT;
