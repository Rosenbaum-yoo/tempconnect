-- Migration 163: Storno-Erfassung (P8 Welle A)
-- =============================================================================
-- Die Storno-MECHANIK war bereits vollstaendig: dealAgreementService.cancelAgreement
-- prueft den Zustandsautomaten, schreibt Audit und dreht die operativen
-- Nebenwirkungen zurueck (Einsatz storniert, Reservierungen frei, Invites
-- gecancelt). Wirkungslos war sie trotzdem — weil niemand messen konnte, WER aus
-- WELCHEM Grund und mit WELCHEM Vorlauf storniert.
--
-- WARUM EINE EIGENE TABELLE UND KEINE SPALTEN AN offers
-- `offers` wird in jedem Feed-Aufruf gelesen; sie ist die heisseste Tabelle der
-- Plattform. Storno-Details braucht dort niemand. Da 'cancelled' ein Endzustand
-- ist (stateMachine.js: cancelled -> []), ist die Beziehung 1:1 — der UNIQUE-Index
-- auf offer_id haelt das fest.
--
-- WARUM DER GRUND EIN ENUM IST UND KEIN FREITEXT
-- Aus "Kunde hat kurzfristig abgesagt" laesst sich keine Quote rechnen. Freitext
-- ist fuer Menschen (Spalte `note`), das Enum ist fuer die Statistik. Ohne diese
-- Trennung entsteht in einem Jahr ein Feld mit 400 Formulierungen desselben
-- Sachverhalts — derselbe Fehler, den der kuratierte Skill-Katalog vermeidet.
--
-- WARUM HIER NUR ROHDATEN STEHEN UND KEIN FERTIGES GEWICHT
-- Die Gewichtung (Owner-Entscheidung: <48h doppelt, >=14 Tage gar nicht; Kunden-
-- Absage und Krankheit zaehlen nicht) wird in Welle B aus diesen Rohdaten
-- gerechnet, nicht hier eingefroren. Grund: Die Regeln werden sich einspielen.
-- Waere das Gewicht gespeichert, muesste man bei jeder Regelaenderung Altdaten
-- nachziehen — und wer das vergisst, hat zwei Wahrheiten. Die Rohdaten dagegen
-- sind zeitlos wahr.
--
-- Rollback:
--   DROP TABLE IF EXISTS offer_cancellations;
-- =============================================================================

SET client_min_messages TO WARNING;

BEGIN;

CREATE TABLE IF NOT EXISTS offer_cancellations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id              UUID NOT NULL UNIQUE REFERENCES offers(id) ON DELETE CASCADE,

  -- Geschlossene Liste. 'other' ist bewusst dabei: ohne Sammelposten waehlen
  -- Nutzer irgendetwas Falsches, und dann luegen ALLE Kategorien.
  reason_code           TEXT NOT NULL CHECK (reason_code IN (
                          'customer_cancelled',  -- der Kunde der Agentur hat abgesagt
                          'worker_sick',         -- Kraft erkrankt
                          'worker_quit',         -- Kraft abgesprungen
                          'date_moved',          -- Termin verschoben
                          'mistake',             -- Fehleingabe
                          'other'
                        )),
  -- Fuer Menschen, nicht fuer Statistik.
  note                  TEXT,

  cancelled_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Welche SEITE storniert hat, ist die wichtigere Information als welche Person:
  -- dieselbe Begruendung wiegt je nach Seite anders (eine Kunden-Absage trifft die
  -- Agentur unverschuldet, das Unternehmen dagegen nicht).
  cancelled_by_side     TEXT NOT NULL CHECK (cancelled_by_side IN ('company', 'agency')),

  -- Rohdaten fuer die Gewichtung in Welle B
  assignment_start_date DATE,     -- NULL, wenn nie ein Beginn feststand
  -- Negativ = nach Einsatzbeginn storniert. Das ist kein Fehler, sondern der
  -- teuerste Fall ueberhaupt und muss unterscheidbar bleiben.
  lead_time_hours       INTEGER,  -- NULL, wenn kein Beginn bekannt

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Traegt die Auswertung "alle Stornos einer Org im Zeitraum" (Welle B).
CREATE INDEX IF NOT EXISTS offer_cancellations_created_idx
  ON offer_cancellations(created_at DESC);
CREATE INDEX IF NOT EXISTS offer_cancellations_reason_idx
  ON offer_cancellations(reason_code, cancelled_by_side);

COMMIT;
