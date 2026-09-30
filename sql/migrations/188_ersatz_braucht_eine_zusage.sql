-- =============================================================================
-- 188_ersatz_braucht_eine_zusage.sql — der Ersatz wird gefragt (8.2)
-- =============================================================================
-- BEFUND (gemessen am 2026-08-21 am Code):
--
--   Es gibt ZWEI Wege, denselben Einsatz zu besetzen — und nur einer fragt den
--   Menschen, den er besetzt:
--
--     POST /staffing-assignments/:id/quick-assign
--         legt den Link als `pending_confirmation` an und ruft
--         `notifyAssignmentPendingConfirmation`. Der Arbeiter sagt zu oder ab.
--
--     POST /worker-assignment-links/:id/replace   (die Ersatz-Zuweisung)
--         legt den Link als `auto_confirmed` an und ruft `notifyAssignmentNew`
--         ("du hast einen neuen Einsatz"). Eine Absage ist damit UNMOEGLICH:
--         `declineAssignment` verlangt ausdruecklich `pending_confirmation`.
--
--   Owner-Vorgabe (Plan I, Abschnitt 8.2): "Der Ersatz-Mitarbeiter muss
--   benachrichtigt werden und annehmen oder ablehnen koennen — genau wie bei
--   einer regulaeren Zuweisung. Eine Zuweisung, die der Zugewiesene nicht
--   bestaetigt hat, ist eine Absichtserklaerung, keine Besetzung."
--
-- WARUM DAFUER EINE SPALTE NOETIG IST
--   Sobald der Ersatz zusagen MUSS, darf die Kundenmeldung "Ersatz gestellt"
--   nicht mehr beim Zuweisen rausgehen — sie waere wieder ein Versprechen. Genau
--   das wollte Welle G4b abstellen ("die Ersatz-Meldung geht erst nach echter
--   Neubesetzung raus"). Die Meldung wandert deshalb an die BESTAETIGUNG.
--
--   Dort muss erkennbar sein, dass dieser Einsatz ein Ersatz ist — und fuer WEN.
--   Bisher stand das nirgends in den Daten: der Zusammenhang lebte nur im Ablauf
--   der Route. Ein Zusammenhang, der nur im Ablauf lebt, ist beim naechsten
--   Aufrufer weg.
--
-- `ersetzt_link_id` zeigt auf den Link des Ausgefallenen. NULL heisst: keine
-- Ersatz-Zuweisung, sondern eine regulaere.
--
-- RESILIENZ: kein umschliessendes BEGIN; jeder Schritt per to_regclass
-- abgesichert (Lehre aus dem 116-Vorfall).
-- IDEMPOTENZ: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
-- ROLLBACK: ALTER TABLE worker_assignment_links DROP COLUMN ersetzt_link_id;
--   Datenverlust beschraenkt sich auf die Ersatz-Zuordnung, die es vorher gar
--   nicht gab.
-- =============================================================================

DO $ersatz_spalte$
BEGIN
  IF to_regclass('public.worker_assignment_links') IS NULL THEN
    RAISE NOTICE '188: worker_assignment_links fehlt — uebersprungen.'; RETURN;
  END IF;

  ALTER TABLE worker_assignment_links
    ADD COLUMN IF NOT EXISTS ersetzt_link_id UUID
      REFERENCES worker_assignment_links(id) ON DELETE SET NULL;

  COMMENT ON COLUMN worker_assignment_links.ersetzt_link_id IS
    'Bei einer Ersatz-Zuweisung: der Link des Ausgefallenen. NULL = regulaere Zuweisung. '
    'Traegt den Zusammenhang, damit die Kundenmeldung erst bei der ZUSAGE des Ersatzes '
    'rausgeht und nicht schon beim Zuweisen (Welle G4b: erst nach echter Neubesetzung).';

  RAISE NOTICE '188: ersetzt_link_id angelegt.';
END $ersatz_spalte$;

-- Gesucht wird immer "welcher Link ersetzt diesen hier" — also ueber die
-- Zielspalte. Teilindex, weil die Spalte fuer die grosse Mehrheit NULL bleibt.
DO $ersatz_index$
BEGIN
  IF to_regclass('public.worker_assignment_links') IS NULL THEN RETURN; END IF;
  CREATE INDEX IF NOT EXISTS idx_wal_ersetzt_link
    ON worker_assignment_links (ersetzt_link_id)
    WHERE ersetzt_link_id IS NOT NULL;
  RAISE NOTICE '188: Teilindex idx_wal_ersetzt_link angelegt.';
END $ersatz_index$;

-- =============================================================================
-- Bestand: bereits bestehende Ersatz-Zuweisungen bleiben `auto_confirmed` und
-- ohne `ersetzt_link_id`. Sie NACHTRAEGLICH auf `pending_confirmation` zu setzen
-- waere falsch — diese Einsaetze laufen, die Menschen stehen bereits beim Kunden.
-- Eine Zusage rueckwirkend einzufordern wuerde laufende Besetzungen in Frage
-- stellen. Die neue Regel gilt ab der naechsten Ersatz-Zuweisung.
-- =============================================================================
