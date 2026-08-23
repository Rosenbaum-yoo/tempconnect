-- Migration 187: Die Rechnung braucht eine Anschrift (E-Rechnungspflicht / EN 16931)
--
-- Ab 01.01.2027 muss jedes inlaendische Unternehmen mit mehr als 800.000 EUR Vorjahresumsatz
-- inlaendische B2B-Rechnungen strukturiert nach EN 16931 ausstellen (XRechnung/ZUGFeRD),
-- ab 01.01.2028 alle. Ein PDF ist keine E-Rechnung.
--
-- BEFUND: `organizations` traegt bisher nur name/legal_name/tax_id/billing_email. Die Norm
-- verlangt fuer BEIDE Seiten eine vollstaendige Postanschrift und fuer den Verkaeufer eine
-- Steuer-Identifikation. Ohne diese Felder ist keine konforme Rechnung erzeugbar — die
-- Adressdaten lagen bisher nur auf `users` (003_profile_legal) und auf `org_locations`,
-- also nicht auf der Rechtsperson, die tatsaechlich Rechnungssteller/-empfaenger ist.
--
-- Zuordnung zu den Geschaeftsbegriffen der Norm (BT = Business Term):
--   billing_street       → BT-35 (Verkaeufer) / BT-50 (Kaeufer)  Adresszeile 1
--   billing_address_2    → BT-36 / BT-51                          Adresszeile 2
--   billing_postal_code  → BT-38 / BT-53                          Postleitzahl
--   billing_city         → BT-37 / BT-52                          Ort
--   billing_country_code → BT-40 / BT-55                          Laendercode ISO 3166-1 alpha-2
--   vat_id               → BT-31 (Verkaeufer) / BT-48 (Kaeufer)   USt-IdNr.
--   tax_id (vorhanden)   → BT-32                                  Steuernummer (Alternative zu BT-31)
--   iban/bic             → BT-84/BT-86                            Zahlungsverbindung (Ueberweisung)
--
-- Add-only, rueckwaertskompatibel, keine Pflichtfelder auf Datenbankebene: Bestandsorgs
-- bleiben gueltig. Die Vollstaendigkeitspruefung gehoert in den Rechnungsgenerator, der
-- fehlende Felder benennen kann — ein NOT NULL wuerde hier nur bestehende Zeilen brechen,
-- ohne irgendjemandem zu sagen, was fehlt.
--
-- Rollback:
--   ALTER TABLE organizations
--     DROP COLUMN IF EXISTS billing_street,
--     DROP COLUMN IF EXISTS billing_address_2,
--     DROP COLUMN IF EXISTS billing_postal_code,
--     DROP COLUMN IF EXISTS billing_city,
--     DROP COLUMN IF EXISTS billing_country_code,
--     DROP COLUMN IF EXISTS vat_id,
--     DROP COLUMN IF EXISTS iban,
--     DROP COLUMN IF EXISTS bic;

SET client_min_messages TO WARNING;

BEGIN;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_street       TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_address_2    TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_postal_code  TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_city         TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_country_code TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS vat_id               TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS iban                 TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS bic                  TEXT;

-- Laendercode: genau zwei Grossbuchstaben (ISO 3166-1 alpha-2). NULL bleibt erlaubt,
-- damit Bestandszeilen nicht brechen; der Generator setzt den Default 'DE' selbst.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_billing_country_code_chk'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_billing_country_code_chk
      CHECK (billing_country_code IS NULL OR billing_country_code ~ '^[A-Z]{2}$');
  END IF;
END $$;

COMMENT ON COLUMN organizations.billing_street       IS 'EN 16931 BT-35/BT-50: Adresszeile 1 der Rechnungsanschrift.';
COMMENT ON COLUMN organizations.billing_address_2    IS 'EN 16931 BT-36/BT-51: Adresszeile 2 (Zusatz, optional).';
COMMENT ON COLUMN organizations.billing_postal_code  IS 'EN 16931 BT-38/BT-53: Postleitzahl der Rechnungsanschrift.';
COMMENT ON COLUMN organizations.billing_city         IS 'EN 16931 BT-37/BT-52: Ort der Rechnungsanschrift.';
COMMENT ON COLUMN organizations.billing_country_code IS 'EN 16931 BT-40/BT-55: Laendercode ISO 3166-1 alpha-2 (Default im Generator: DE).';
COMMENT ON COLUMN organizations.vat_id               IS 'EN 16931 BT-31/BT-48: USt-IdNr. Fuer den Rechnungssteller Pflicht, sofern keine Steuernummer (tax_id, BT-32) vorliegt.';
COMMENT ON COLUMN organizations.iban                 IS 'EN 16931 BT-84: IBAN fuer die Ueberweisung.';
COMMENT ON COLUMN organizations.bic                  IS 'EN 16931 BT-86: BIC des Zahlungsdienstleisters (optional).';

COMMIT;
