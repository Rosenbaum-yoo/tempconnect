-- 170_rechnung_bounty_rabatt.sql
-- P9 Spur A / Welle A4 — der Bounty-Rabatt erreicht die Rechnung
--
-- WARUM DIESE MIGRATION
-- Die Plattform zeigt seit jeher einen Treue-Rabatt an ("6 % gespart") und stellt
-- den vollen Betrag in Rechnung. `getUserDiscount()` hatte ausschliesslich
-- Anzeige-Aufrufer; im gesamten Geldpfad (invoiceService, recurringBillingService,
-- paymentService, planCatalog) kam das Wort `discount` nicht ein einziges Mal vor.
-- Das ist der schwerste Einzelbefund der P9-Bestandsaufnahme: ein Preisversprechen
-- ohne Wirkung.
--
-- WARUM EIGENE SPALTEN UND KEIN STILLER ABZUG
-- Der Rabatt koennte einfach `amount_cents` senken. Dann waere spaeter nicht mehr
-- nachvollziehbar, WARUM eine Rechnung niedriger war — bei einer Nachfrage des
-- Kunden oder der Steuerpruefung stuende eine Zahl ohne Herkunft. Deshalb:
-- Bruttobetrag, Rabattsatz und Rabattbetrag getrennt, `amount_cents` bleibt in
-- seiner bisherigen Bedeutung (Netto vor Steuer, nach Rabatt).
--
-- WARUM KEINE MINUS-POSITION IN invoice_items
-- Der naheliegende Weg waere eine Rabattzeile mit negativem Betrag. `invoice_items`
-- hat aber CHECK (unit_amount_cents >= 0) und CHECK (total_cents >= 0). Eine
-- Geld-Schutzregel aufzuweichen, um eine Darstellung zu ermoeglichen, waere der
-- falsche Tausch. Die Spalten hier weisen den Rabatt genauso getrennt aus.
--
-- EINGEFROREN: Der Satz steht in der Zeile. Verliert der Kunde das Bounty im Juni,
-- bleibt die Mai-Rechnung unveraendert — sie ist ein Beleg, kein Ausblick.
--
-- RUECKWAERTSPROBE: Ohne Rabatt ist `discount_pct = 0`, `discount_amount_cents = 0`
-- und `gross_amount_cents = amount_cents`. Betrag und Steuer sind dann identisch
-- zum Stand vor dieser Migration.
--
-- ROLLBACK
--   DROP TRIGGER IF EXISTS trg_rechnung_bruttobetrag ON invoices;
--   DROP FUNCTION IF EXISTS rechnung_bruttobetrag_pflegen();
--   ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_rabatt_stimmig;
--   ALTER TABLE invoices DROP COLUMN IF EXISTS discount_source;
--   ALTER TABLE invoices DROP COLUMN IF EXISTS discount_amount_cents;
--   ALTER TABLE invoices DROP COLUMN IF EXISTS discount_pct;
--   ALTER TABLE invoices DROP COLUMN IF EXISTS gross_amount_cents;

BEGIN;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS gross_amount_cents    INTEGER,
  ADD COLUMN IF NOT EXISTS discount_pct          NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount_cents INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_source       TEXT;

-- Bestandszeilen: ohne Rabatt ist der Bruttobetrag der Betrag.
UPDATE invoices SET gross_amount_cents = amount_cents WHERE gross_amount_cents IS NULL;

-- Es gibt mehr als einen Schreibpfad auf `invoices`. `operationalInvoiceService`
-- legt operative Rechnungen an, ohne die neuen Spalten zu kennen, und rechnet bei
-- Korrekturen `amount_cents` aus der Positionssumme NEU — ohne den Bruttobetrag
-- mitzuziehen. Beides wuerde an der Pruefregel unten scheitern: der erste Fall an
-- NOT NULL, der zweite an der Stimmigkeit.
--
-- Statt jeden Schreiber einzeln nachzuruesten (und den naechsten zu vergessen),
-- haengt die Folge an der Ursache: ohne Rabatt ist der Bruttobetrag definitionsgemaess
-- der Betrag, und das setzt die Datenbank selbst. Wer einen Rabatt ausweist, muss
-- beide Werte bewusst liefern — genau dort soll es auffallen.
CREATE OR REPLACE FUNCTION rechnung_bruttobetrag_pflegen()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(NEW.discount_amount_cents, 0) = 0 THEN
    NEW.gross_amount_cents := NEW.amount_cents;
  ELSIF NEW.gross_amount_cents IS NULL THEN
    NEW.gross_amount_cents := NEW.amount_cents + NEW.discount_amount_cents;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION rechnung_bruttobetrag_pflegen() IS
  'Haelt gross_amount_cents fuer rabattfreie Rechnungen automatisch gleich amount_cents — damit fremde Schreibpfade (operative Rechnungen, Korrekturen) die Stimmigkeitsregel nicht verletzen.';

DROP TRIGGER IF EXISTS trg_rechnung_bruttobetrag ON invoices;
CREATE TRIGGER trg_rechnung_bruttobetrag
BEFORE INSERT OR UPDATE OF amount_cents, discount_amount_cents, gross_amount_cents ON invoices
FOR EACH ROW
EXECUTE FUNCTION rechnung_bruttobetrag_pflegen();

ALTER TABLE invoices
  ALTER COLUMN gross_amount_cents SET NOT NULL;

-- Die Rechnung muss in sich aufgehen. Ohne diese Regel koennte ein spaeterer
-- Schreibpfad einen Rabatt ausweisen, ohne ihn abzuziehen — die Zeile saehe
-- korrekt aus und waere es nicht.
ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_rabatt_stimmig;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_rabatt_stimmig
  CHECK (
    discount_pct >= 0
    AND discount_amount_cents >= 0
    AND gross_amount_cents - discount_amount_cents = amount_cents
  );

COMMENT ON COLUMN invoices.gross_amount_cents IS
  'Netto vor Rabatt (Plan + Einmalgebuehren). Ohne Rabatt gleich amount_cents.';
COMMENT ON COLUMN invoices.discount_pct IS
  'Zum Rechnungszeitpunkt eingefrorener Rabattsatz. Ein spaeterer Bounty-Verlust aendert diese Zeile nicht.';
COMMENT ON COLUMN invoices.discount_amount_cents IS
  'Abgezogener Betrag in Cent. gross_amount_cents - discount_amount_cents = amount_cents.';
COMMENT ON COLUMN invoices.discount_source IS
  'Woher der Rabatt stammt, z. B. "bounty". NULL = kein Rabatt.';

COMMIT;
