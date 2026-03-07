-- Profil um Kontakt/Adresse/USt-IdNr. erweitern (rechtliche Mindestanforderungen)
-- Einzige Stelle fuer diese Spalten – init.sql enthaelt sie nicht
ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS street TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS vat_id TEXT;
