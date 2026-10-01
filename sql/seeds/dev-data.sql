-- =============================================================================
-- TempConnect – Entwicklungs-Seed-Daten (NUR LOKALE ENTWICKLUNG)
-- =============================================================================
-- Geladen wird diese Datei ueber scripts/dev/seed-data.sh.
-- (Der fruehere Kopf behauptete "AUSSCHLIESSLICH via
-- docker-compose.override.yml" - das war keine wirksame Zusage: die
-- override-Datei ist ungetrackt und existiert nur auf Entwicklerrechnern,
-- waehrend jeder psql-Aufruf die Datei direkt laden konnte. Die Zusage
-- steht jetzt als SPERRE unten, nicht als Satz hier oben.)
--
-- Passwort beider Demo-Accounts: password123
-- =============================================================================

BEGIN;

-- ── SPERRE (2026-10-01) ──────────────────────────────────────
-- Diese Saat legt ANMELDBARE Konten an. Sie laeuft nur mit ausdruecklich
-- gesetztem Schalter app.seed_demo_world - identisch zur Sperre in
-- sql/migrations/052_demo_seed_world.sql.
--
-- WARUM HIER und nicht im ladenden Skript: gemessen am 2026-10-01 trug nur
-- scripts/dev/seed-data.sh einen Schutz, und der prueft NODE_ENV der SHELL,
-- waehrend geschrieben wird in die Datenbank des CONTAINERS. Auf einem
-- Produktions-Host hat die Shell eines Betreibers ueblicherweise kein
-- NODE_ENV - der Riegel fiel damit auf "development" zurueck und liess
-- durch. Zusaetzlich dokumentierte docs/SALES_DEMO_PATH.md einen
-- Direktaufruf (psql $DATABASE_URL < ...), der das Skript und damit JEDE
-- Pruefung umging. Eine Sperre in der Datei, die die Zeilen anlegt, gilt
-- fuer jeden Ladeweg.
--
-- Gesetzt wird der Schalter von scripts/dev/seed-data.sh (Saaten) bzw.
-- sql/migrate.sh (Migrationskette), beide aus der Umgebungsvariable
-- SEED_DEMO_WORLD. Ohne Schalter bricht die TRANSAKTION ab: keine einzige
-- Zeile entsteht, auch nicht aus den Anweisungen darunter.
DO $sperre_saat$
BEGIN
  IF current_setting('app.seed_demo_world', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION
      'dev-data.sql: SEED_DEMO_WORLD nicht aktiv - Saat verweigert. Anmeldbare Demo-Konten entstehen nur mit ausdruecklich gesetztem Schalter (prod-sicher).';
  END IF;
END $sperre_saat$;
-- ──────────────────────────────────────────────────────────────────────────────


-- Demo-Unternehmen (company, PLUS-Plan)
INSERT INTO users (role, email, password_hash, company_name, phone, is_verified)
VALUES (
  'company',
  'demo@firma.de',
  '$2b$10$UeHLVjBbRRQeGx03tWS73O6X4MZ4pWk0zBP4PtPrdHk2Jc.OTsKpK',
  'Demo GmbH',
  '+49 40 000000',
  TRUE
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO subscriptions (user_id, plan, status)
SELECT u.id, 'PLUS', 'active'
FROM users u
WHERE u.email = 'demo@firma.de'
  AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id);

-- Test-Zeitarbeitsfirma (agency, PLUS-Plan)
INSERT INTO users (role, email, password_hash, company_name, phone, is_verified)
VALUES (
  'agency',
  'test@agentur.de',
  '$2b$10$UeHLVjBbRRQeGx03tWS73O6X4MZ4pWk0zBP4PtPrdHk2Jc.OTsKpK',
  'Test Zeitarbeit GmbH',
  '+49 30 123456',
  TRUE
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO subscriptions (user_id, plan, status)
SELECT u.id, 'PLUS', 'active'
FROM users u
WHERE u.email = 'test@agentur.de'
  AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id);

-- Demo-Listings fuer Test-Agentur
INSERT INTO listings (owner_id, type, category, region, qty, start_date, note, notdienst)
SELECT u.id, 'supply', 'Pflege / Betreuung', 'Hamburg', 3, CURRENT_DATE + INTERVAL '2 days', 'Erfahrene Pflegekraefte sofort verfuegbar', TRUE
FROM users u
WHERE u.email = 'test@agentur.de'
  AND NOT EXISTS (
    SELECT 1 FROM listings l
    WHERE l.owner_id = u.id AND l.category = 'Pflege / Betreuung' AND l.region = 'Hamburg'
  );

INSERT INTO listings (owner_id, type, category, region, qty, start_date, note, notdienst)
SELECT u.id, 'supply', 'Lager / Kommissionierung', 'Berlin', 5, CURRENT_DATE + INTERVAL '1 day', 'Lagerarbeiter mit Staplerschein', FALSE
FROM users u
WHERE u.email = 'test@agentur.de'
  AND NOT EXISTS (
    SELECT 1 FROM listings l
    WHERE l.owner_id = u.id AND l.category = 'Lager / Kommissionierung' AND l.region = 'Berlin'
  );

-- OCC Owner Control Center (NUR DEV, NIE automatisch in Production):
-- INSERT INTO occ_owner_access (user_id, occ_role, notes)
-- VALUES ('<deine-dev-user-id>', 'owner', 'dev seed - nur lokal');

COMMIT;
