-- Handelsregisternummer im Profil (rechtliche Angabe)
ALTER TABLE users ADD COLUMN IF NOT EXISTS handelsregister_number TEXT;
