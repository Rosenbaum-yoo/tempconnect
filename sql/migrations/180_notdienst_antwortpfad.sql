-- 180_notdienst_antwortpfad.sql
-- Nachtrag zu den Owner-Abschnitten 2-4 (P9) — Befund P1-15
--
-- WARUM DIESE MIGRATION
-- Welle A3 hat den Defekt gemeldet und ausdruecklich NICHT behoben
-- ("Gemeldet, aber nicht in A3 behoben", docs/features/P9_...md). Die
-- Vollstaendigkeitspruefung der Abschnitte 2-4 am 2026-08-13 hat ihn erneut
-- bestaetigt — an der echten Datenbank, nicht aus dem Code geschlossen:
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'demand_requests'
--      AND column_name IN ('supplier_response_count','first_supplier_response_at');
--   -> 0 Zeilen (die Tabelle hat 40 Spalten, diese beiden sind nicht darunter)
--
-- `emergencyStaffingService` liest und schreibt sie an vier Stellen. Folge:
--   POST /api/emergency/:id/respond   -> 500
--   GET  /api/emergency/dashboard     -> 500
--
-- Das ist der NOTDIENST. Wer ihn braucht, braucht ihn sofort — und bekam einen
-- Serverfehler.
--
-- WARUM ES NIEMAND GEMERKT HAT
-- Die Tests dazu sind gruen, weil ihre Attrappen die Spalten erfinden. Genau die
-- Lektion, die sich durch dieses Repo zieht: ein Test, der das ERGEBNIS prueft
-- statt WELCHE Abfrage lief, beweist nichts. Deshalb liegt der Beleg fuer diese
-- Migration in einem DB-gestuetzten Test, nicht in einem weiteren Mock.
--
-- WARUM SPALTEN UND KEINE ABLEITUNG
-- Die Zahl liesse sich theoretisch aus den SLA-Ereignissen zaehlen. Der Dienst
-- pflegt sie aber ausdruecklich idempotent (`COALESCE(first_..., NOW())`) und
-- liest sie im Dashboard aggregiert ueber alle Notfaelle. Eine Ableitung waere
-- bei jedem Dashboard-Aufruf ein Join ueber die Ereignistabelle — teurer und
-- ohne Gewinn. Die Spalten bilden ab, was der Code ohnehin fuehrt.
--
-- DEFAULT 0, NICHT NULL: "noch keine Antwort" ist die wahre Aussage ueber jeden
-- Bestandsdatensatz. Ein NULL-Zustand erfaende eine Ungewissheit, die es nicht
-- gibt — und `supplier_response_count + 1` liefe darauf ins Leere.
--
-- ROLLBACK
--   ALTER TABLE demand_requests
--     DROP COLUMN IF EXISTS supplier_response_count,
--     DROP COLUMN IF EXISTS first_supplier_response_at;

SET client_min_messages TO WARNING;

BEGIN;

ALTER TABLE demand_requests
  ADD COLUMN IF NOT EXISTS supplier_response_count   INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_supplier_response_at TIMESTAMPTZ;

ALTER TABLE demand_requests DROP CONSTRAINT IF EXISTS demand_requests_response_count_chk;
ALTER TABLE demand_requests ADD CONSTRAINT demand_requests_response_count_chk
  CHECK (supplier_response_count >= 0);

-- Ein Zeitstempel ohne Zaehler (oder umgekehrt) waere ein Widerspruch in der
-- Akte: entweder es hat jemand geantwortet, oder nicht.
ALTER TABLE demand_requests DROP CONSTRAINT IF EXISTS demand_requests_response_stimmig_chk;
ALTER TABLE demand_requests ADD CONSTRAINT demand_requests_response_stimmig_chk
  CHECK ((supplier_response_count = 0) = (first_supplier_response_at IS NULL));

COMMENT ON COLUMN demand_requests.supplier_response_count IS
  'Wie viele Lieferanten auf diesen Notfall reagiert haben. Wird von emergencyStaffingService.recordSupplierResponse hochgezaehlt.';
COMMENT ON COLUMN demand_requests.first_supplier_response_at IS
  'Zeitpunkt der ERSTEN Reaktion — Grundlage der Reaktionszeit im Notdienst-Dashboard. Wird nur einmal gesetzt (COALESCE), spaetere Antworten aendern ihn nicht.';

/* Das Dashboard fragt "offene Notfaelle ohne Antwort" — ein Teil-Index darauf,
 * weil genau diese Menge klein bleiben soll und der Rest nicht interessiert. */
CREATE INDEX IF NOT EXISTS demand_requests_ohne_antwort_idx
  ON demand_requests (created_at DESC)
  WHERE supplier_response_count = 0;

COMMIT;
