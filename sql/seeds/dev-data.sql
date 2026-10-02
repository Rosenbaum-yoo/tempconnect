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
-- Passwort beider Demo-Accounts: der Wert von SEED_PASSWORT beim Laden - es
-- steht NICHT in dieser Datei (Owner-Punkt 16, siehe Sperre unten).
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
-- DAS PASSWORT STEHT NICHT IM REPO (Owner-Punkt 16, 2026-10-02)
--
-- Diese Saat trug einen FESTEN bcrypt-Hash, und der Kopf nannte ein Passwort
-- dazu. GEMESSEN am 2026-10-02 passte der Hash zu diesem Passwort NICHT - und
-- auch zu keinem von acht weiteren Kandidaten. Die 2 Konten waren mit den
-- dokumentierten Zugangsdaten also unbenutzbar, waehrend das Repo behauptete,
-- sie seien es. Der Umbau repariert das und nimmt gleichzeitig das Passwort aus
-- dem oeffentlichen Repo: gehasht wird ERST BEIM LADEN aus `app.seed_passwort`
-- (gesetzt von scripts/dev/seed-data.sh aus SEED_PASSWORT), genau wie in den
-- Y-Saaten und in Migration 052.
--
-- Keine Vorgabe. Ein Vorgabe-Passwort waere genau das, was hier abgeschafft wird.
-- ──────────────────────────────────────────────────────────────────────────────
DO $passwort$
BEGIN
  /* pgcrypto liefert crypt()/gen_salt(). GEMESSEN: nichts im Repo legte die
     Erweiterung an - nicht init.sql (nur uuid-ossp), keine Migration. Migration
     052 tut es seit heute, aber nur wenn die Kette MIT Demo-Welt lief; wer ohne
     sie migriert und danach saet, haette sie nicht. Also selbst anlegen. */
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pgcrypto';
    RAISE NOTICE 'dev-data.sql: pgcrypto angelegt (nur dev - crypt() hasht beim Laden).';
  END IF;

  /* Ohne Passwort KEINE Zeile. Anders als Migration 052 (die in der
     automatischen Migrationskette haengt und sich deshalb nur VERWEIGERT) darf
     diese Saat laut abbrechen: sie wird von Hand aufgerufen, und dort ist ein
     lauter Fehler der richtige Lehrer. crypt('') liefert sonst einen GUELTIGEN
     Hash fuer das leere Passwort - anmeldbar fuer jeden, der es versucht. */
  IF coalesce(current_setting('app.seed_passwort', true), '') = '' THEN
    RAISE EXCEPTION
      'dev-data.sql: app.seed_passwort ist nicht gesetzt. Diese Saat traegt ABSICHTLICH kein Passwort im Repo (Owner-Punkt 16) und kennt keine Vorgabe. Aufruf: SEED_DEMO_WORLD=true SEED_PASSWORT=<geheim> ./scripts/dev/seed-data.sh';
  END IF;
  IF length(current_setting('app.seed_passwort', true)) < 12 THEN
    RAISE EXCEPTION
      'dev-data.sql: app.seed_passwort ist kuerzer als 12 Zeichen. Diese Konten sind anmeldbar; ein kurzes Passwort macht die Saat zur Tuer.';
  END IF;
END $passwort$;
-- ──────────────────────────────────────────────────────────────────────────────

-- ──────────────────────────────────────────────────────────────────────────────


-- Demo-Unternehmen (company, PLUS-Plan)
INSERT INTO users (role, email, password_hash, company_name, phone, is_verified)
VALUES (
  'company',
  'demo@firma.de',
  crypt(current_setting('app.seed_passwort'), gen_salt('bf', 10)),
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
  crypt(current_setting('app.seed_passwort'), gen_salt('bf', 10)),
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
