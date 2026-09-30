-- Migration 207: Der Steuersatz gehoert an die Position
--
-- BEFUND (2026-08-29): Eine Rechnung konnte nur EINEN Steuersatz tragen. Der
-- Satz stand allein auf `invoices`, die Positionen hatten kein Steuermerkmal.
-- Eine Rechnung mit 19 % Ueberlassung und 7 % Nebenleistung waere mit
-- einheitlichem Satz herausgegangen — und KEIN Validator haette es bemerkt,
-- weil alle Summen dann rechnerisch aufgehen. Der Fehler faellt erst beim
-- Finanzamt auf, und dann ist es der Beleg des Kunden.
--
-- Die Norm verlangt das Merkmal ohnehin an der Zeile: BT-151 (Kategorie) ist
-- nach BR-CO-04 Pflicht, BT-152 (Satz) faktisch auch. Und die Verknuepfung
-- zwischen Position und Steueraufschluesselung (BG-23) laeuft AUSSCHLIESSLICH
-- ueber das Wertepaar (Kategorie, Satz) — es gibt keinen Schluessel, keine ID,
-- keinen Verweis. Ohne das Merkmal an der Position ist eine zweite
-- Aufschluesselung nicht bildbar.
--
-- ROLLBACK:
--   ALTER TABLE invoice_items DROP COLUMN IF EXISTS tax_rate_pct;
--   ALTER TABLE invoice_items DROP COLUMN IF EXISTS tax_category;
--   ALTER TABLE invoice_items DROP COLUMN IF EXISTS tax_exemption_reason;
--
-- Gefahrlos, solange keine Rechnung mit gemischten Saetzen existiert: der
-- Generator faellt dann auf den Kopfsatz zurueck, wie vor dieser Migration.
-- Wurde bereits eine gemischte Rechnung gestellt, ist der Rollback KEINE
-- Option — der Beleg verlore seine Aufschluesselung.

SET client_min_messages TO WARNING;

BEGIN;

-- Vier Schritte in dieser Reihenfolge. Wer NOT NULL vor dem Backfill setzt,
-- bricht auf jeder bestehenden Zeile.

-- (1) Nullable anlegen. Typgleich mit invoices.tax_rate_pct (Migration 030):
--     ein abweichender Typ liesse Rundung und Vergleich zwischen Kopf und
--     Position auseinanderdriften.
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS tax_rate_pct NUMERIC(5,2);

-- Die Kategorie nach UNTDID 5305 — genau die Codes, die der Generator heute
-- erzeugt. Was das XML nicht kennt, darf die Spalte nicht zulassen.
-- 'O' (nicht steuerbar) fehlt bewusst: BR-O-11 verbietet jede Kombination mit
-- anderen Kategorien, eine solche Rechnung muesste fachlich getrennt werden.
-- Das ist eine Produktfrage, keine Spaltenfrage.
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS tax_category TEXT NOT NULL DEFAULT 'S';

-- BT-120: der Befreiungsgrund kommt heute aus einem Funktionsargument, also
-- aus dem Aufrufkontext statt aus dem Beleg. Bei Kategorie S ist er nach
-- BR-S-10 VERBOTEN, bei E und AE nach BR-E-10/BR-AE-10 PFLICHT — diese
-- Bedingung gehoert in den Generator, nicht in einen CHECK: sie haengt an der
-- Kategorie und laesst sich zeilenweise nicht sinnvoll erzwingen.
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS tax_exemption_reason TEXT;

-- (2) Backfill. Die Bestandszeilen tragen den Rechnungssatz heute IMPLIZIT —
--     das macht ihn explizit, ohne einen Betrag zu bewegen.
--     Satz 0 wird auf 'E' abgebildet, NICHT auf 'AE': Reverse Charge hat im
--     ganzen Repo keinen Aufrufer, es ging nie eine AE-Rechnung hinaus. Eine
--     Bestandszeile mit 0 % kann folglich keine AE-Zeile sein; sie als solche
--     zu backfillen weckte eine Faehigkeit, die stromaufwaerts niemand
--     erzeugen kann.
UPDATE invoice_items i
   SET tax_rate_pct = v.tax_rate_pct,
       tax_category = CASE WHEN v.tax_rate_pct > 0 THEN 'S' ELSE 'E' END
  FROM invoices v
 WHERE v.id = i.invoice_id
   AND i.tax_rate_pct IS NULL;

-- Zeilen ohne Elternrechnung (dürfte es nicht geben, aber der Backfill soll
-- keine NULL zurücklassen, sonst scheitert Schritt 4).
UPDATE invoice_items SET tax_rate_pct = 19.00 WHERE tax_rate_pct IS NULL;

-- (3) Default setzen — derselbe wie auf invoices.tax_rate_pct. Ein abweichender
--     Default waere eine zweite, stille Wahrheit.
ALTER TABLE invoice_items
  ALTER COLUMN tax_rate_pct SET DEFAULT 19.00;

-- (4) Erst jetzt NOT NULL.
ALTER TABLE invoice_items
  ALTER COLUMN tax_rate_pct SET NOT NULL;

-- Die Wertelisten und die Stimmigkeit an der Quelle festhalten. Ohne den
-- zweiten CHECK entstuende genau der in sich widerspruechliche Beleg, den der
-- Generator spaeter nur noch ablehnen kann: Kategorie "steuerfrei" mit 19 %,
-- oder "Normalsatz" mit 0 %.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_tax_category_chk'
  ) THEN
    ALTER TABLE invoice_items
      ADD CONSTRAINT invoice_items_tax_category_chk
      CHECK (tax_category IN ('S','AE','E','Z'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_tax_stimmig_chk'
  ) THEN
    ALTER TABLE invoice_items
      ADD CONSTRAINT invoice_items_tax_stimmig_chk
      CHECK (
        (tax_category = 'S'  AND tax_rate_pct > 0) OR
        (tax_category IN ('E','AE','Z') AND tax_rate_pct = 0)
      );
  END IF;
END $$;

COMMENT ON COLUMN invoice_items.tax_rate_pct IS
  'Steuersatz dieser Position (BT-152). Erlaubt mehrere Saetze je Rechnung; '
  'die Aufschluesselung (BG-23) entsteht durch Gruppierung nach dem Paar '
  '(tax_category, tax_rate_pct).';
COMMENT ON COLUMN invoice_items.tax_category IS
  'Steuerkategorie nach UNTDID 5305 (BT-151): S Normalsatz, AE Reverse Charge, '
  'E steuerfrei, Z Nullsatz. Nur Codes, die der XML-Generator kennt.';
COMMENT ON COLUMN invoice_items.tax_exemption_reason IS
  'Befreiungsgrund (BT-120). Bei Kategorie S nach BR-S-10 verboten, bei E und '
  'AE nach BR-E-10/BR-AE-10 Pflicht.';

COMMIT;
