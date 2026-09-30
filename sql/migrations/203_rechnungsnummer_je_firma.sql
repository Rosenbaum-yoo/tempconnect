-- =============================================================================
-- 203_rechnungsnummer_je_firma.sql — der eigene Nummernkreis und der eingefrorene Satz
-- =============================================================================
-- OWNER-ENTSCHEID (2026-08-26, J_LIVE_BELEGSCHAFT_MARKTPLATZ.md §6):
--   "Ja, eigener lueckenloser Nummernkreis je Zeitarbeitsfirma, bevor die erste
--   echte Rechnung das Haus verlaesst."
--
-- BEFUND 1 — GETEILTE SEQUENZ. `nextInvoiceNumber` zieht aus der globalen
--   `invoice_number_seq` (Mig 030), die sich die operative Rechnung mit der
--   Abo-Rechnung der Plattform teilt (invoiceService.js:44). Jede Abo-Rechnung
--   reisst damit eine Luecke in den Kreis der Zeitarbeitsfirma. Rechtlich ist
--   eine Luecke nicht verboten (§ 14 Abs. 4 Nr. 4 UStG verlangt Einmaligkeit,
--   nicht Lueckenlosigkeit) — erklaeren muss sie der Rechnungssteller trotzdem,
--   und zwar dem Pruefer. Das ist die Arbeit, die wir ihm abnehmen.
--
-- BEFUND 2 — ZU FRUEHE VERGABE. Die Nummer fiel im ENTWURF. Ein verworfener
--   Entwurf hinterliess eine Luecke, die niemand mehr zuordnen kann. Gemessen
--   am 2026-08-28: Sequenzstand 1024 bei NULL existierenden Rechnungen.
--   Die Nummer gehoert an das Stellen (`issue`), nicht an das Erzeugen.
--
-- WAS DIESE MIGRATION LIEFERT
--   (a) `invoice_number_sequences` — je (Org, Jahr) ein eigener Zaehler. Eine
--       Tabelle statt einer Postgres-Sequenz je Org: Sequenzen lassen sich nicht
--       transaktional zuruecksetzen, sind nicht aufzaehlbar und muessten fuer
--       jede neue Org per DDL entstehen. Die Zeile hier wird beim Stellen unter
--       einer Zeilensperre hochgezaehlt — dieselbe Transaktion wie die Rechnung.
--   (b) `invoices.invoice_number` darf NULL sein, solange die Rechnung Entwurf
--       ist. UNIQUE traegt NULLs beliebig oft (Postgres-Semantik) — genau
--       richtig fuer Entwuerfe ohne Nummer.
--   (b2) DIE EINDEUTIGKEIT WIRD ZWEIGETEILT. Der bisherige UNIQUE lag auf
--       `invoice_number` ALLEIN und war damit plattformweit. Genau das
--       verhindert firmeneigene Kreise: beginnt jede Firma bei 1, traegt die
--       zweite Firma dieselbe RE-2026-000001 und laeuft in den Index.
--       (Gefunden 2026-08-28 beim ersten DB-gebundenen Lauf — der Fehler steckte
--       in dieser Migration selbst, nicht im Bestand.)
--       Deshalb zwei PARTIELLE Indizes statt einem:
--         operativ   -> UNIQUE (supplier_org_id, invoice_number): je Firma
--                       einmalig, ueber Firmen hinweg darf sie sich wiederholen.
--         uebrige    -> UNIQUE (invoice_number): die Abo-Rechnung der Plattform
--                       bleibt plattformweit einmalig, dort ist TempConnect
--                       selbst Rechnungssteller mit genau EINEM Kreis.
--   (c) `invoices.rate_cents_frozen` — der Stundensatz, mit dem gerechnet wurde,
--       liegt AN DER RECHNUNG statt am Einsatz. Der Einsatzsatz
--       (`assignments.hourly_rate_cents`) steht in der Update-Whitelist und ist
--       jederzeit aenderbar; eine gestellte Rechnung darf sich davon nicht mehr
--       bewegen.
--
-- BESTAND: Es existiert KEINE Rechnung (operativ wie Abo, gemessen 2026-08-28).
--   Deshalb ohne Datenmigration; nichts muss nachgetragen werden.
--
-- ABGRENZUNG: Die Abo-Rechnung der Plattform bleibt bei der globalen Sequenz.
--   Dort ist TempConnect selbst Rechnungssteller mit genau einem Kreis — das ist
--   der Normalfall, fuer den `invoice_number_seq` gebaut wurde.
--
-- RESILIENZ: kein umschliessendes BEGIN; jeder Schritt per to_regclass.
-- IDEMPOTENZ: CREATE TABLE / ADD COLUMN / CREATE INDEX je IF NOT EXISTS.
-- ROLLBACK:
--   DROP INDEX invoices_nummer_je_firma_idx;
--   DROP INDEX invoices_nummer_plattform_idx;
--   ALTER TABLE invoices ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);
--     -- setzt voraus, dass keine zwei Firmen dieselbe Nummer tragen
--   ALTER TABLE invoices ALTER COLUMN invoice_number SET NOT NULL;  -- nur wenn
--     keine Entwuerfe ohne Nummer existieren, sonst diese vorher stellen/verwerfen
--   ALTER TABLE invoices DROP COLUMN rate_cents_frozen;
--   DROP TABLE invoice_number_sequences;
--   Der Code faellt damit auf die globale Sequenz zurueck (Stand vor J7).
-- =============================================================================

SET client_min_messages TO WARNING;

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NULL THEN
    RAISE NOTICE '203: invoices fehlt — uebersprungen';
    RETURN;
  END IF;

  -- (a) Der Zaehler je Organisation und Jahr.
  --
  -- Warum (org, jahr) und nicht nur (org): der Kreis beginnt jedes Jahr neu bei
  -- 1 — so ist die Nummer aus sich heraus lesbar (RE-2026-000001) und ein
  -- Jahreswechsel erzeugt keine Sprungstelle im Kreis.
  IF to_regclass('public.invoice_number_sequences') IS NULL THEN
    CREATE TABLE invoice_number_sequences (
      supplier_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      jahr            INT  NOT NULL CHECK (jahr BETWEEN 2000 AND 2200),
      letzte_nummer   INT  NOT NULL DEFAULT 0 CHECK (letzte_nummer >= 0),
      praefix         TEXT NOT NULL DEFAULT 'RE',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (supplier_org_id, jahr)
    );
    COMMENT ON TABLE invoice_number_sequences IS
      'Rechnungsnummernkreis je Zeitarbeitsfirma und Jahr (Welle J7, Owner-Entscheid 2026-08-26). Wird beim STELLEN einer Rechnung unter Zeilensperre hochgezaehlt — nie beim Entwurf, sonst reisst ein verworfener Entwurf eine Luecke. Die Abo-Rechnung der Plattform nutzt weiterhin die globale invoice_number_seq.';
    COMMENT ON COLUMN invoice_number_sequences.praefix IS
      'Frei waehlbares Praefix der Firma (Vorgabe RE). Ergibt <praefix>-<jahr>-<6-stellig>, z. B. RE-2026-000001.';
  END IF;

  -- (b) Der Entwurf traegt noch keine Nummer.
  --
  -- Der bestehende UNIQUE-Index bleibt unveraendert: Postgres erlaubt beliebig
  -- viele NULLs in einem UNIQUE — genau das brauchen Entwuerfe.
  BEGIN
    ALTER TABLE invoices ALTER COLUMN invoice_number DROP NOT NULL;
  EXCEPTION WHEN others THEN
    RAISE NOTICE '203: invoice_number war bereits nullable';
  END;
  COMMENT ON COLUMN invoices.invoice_number IS
    'Rechnungsnummer. NULL, solange die Rechnung Entwurf ist — vergeben wird sie erst beim Stellen (Welle J7). Operative Rechnungen ziehen aus invoice_number_sequences (je Firma/Jahr), Abo-Rechnungen aus der globalen invoice_number_seq.';

  -- (c) Der Satz, mit dem gerechnet wurde — an der Rechnung, nicht am Einsatz.
  ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS rate_cents_frozen INT;
  COMMENT ON COLUMN invoices.rate_cents_frozen IS
    'Der Stundensatz in Cent, mit dem diese Rechnung gerechnet wurde (Welle J7). Eingefroren beim Erzeugen: assignments.hourly_rate_cents steht in der Update-Whitelist und ist jederzeit aenderbar — eine erzeugte Rechnung darf sich davon nicht mehr bewegen.';
END $$;

-- Nachschlagen der offenen Kreise einer Firma (Staff-Aufsicht, Jahreswechsel).
CREATE INDEX IF NOT EXISTS invoice_number_sequences_jahr_idx
  ON invoice_number_sequences (jahr, supplier_org_id);

-- (b2) Die Eindeutigkeit wird zweigeteilt — siehe Kopf.
DO $$
BEGIN
  IF to_regclass('public.invoices') IS NULL THEN RETURN; END IF;

  -- Erst die neuen Indizes, dann den alten fallen lassen: so ist die
  -- Eindeutigkeit zu keinem Zeitpunkt ungeschuetzt.
  CREATE UNIQUE INDEX IF NOT EXISTS invoices_nummer_je_firma_idx
    ON invoices (supplier_org_id, invoice_number)
    WHERE invoice_type = 'operational' AND invoice_number IS NOT NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS invoices_nummer_plattform_idx
    ON invoices (invoice_number)
    WHERE invoice_type <> 'operational' AND invoice_number IS NOT NULL;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.invoices'::regclass
       AND conname = 'invoices_invoice_number_key'
  ) THEN
    ALTER TABLE invoices DROP CONSTRAINT invoices_invoice_number_key;
    RAISE NOTICE '203: plattformweiter UNIQUE auf invoice_number durch zwei partielle ersetzt';
  END IF;
END $$;
