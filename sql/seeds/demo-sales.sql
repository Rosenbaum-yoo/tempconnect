-- =============================================================================
-- TempConnect – Sales-Demo-Seed-Daten (NUR DEMO-UMGEBUNG)
-- =============================================================================
-- Zweck: Realistische Demo-Daten fuer Vertriebsgespräche und Produkt-Demos.
-- Ladebefehl: SEED_DEMO_WORLD=true ./scripts/dev/seed-data.sh --file=demo-sales.sql
-- (Der fruehere Befehl 'psql $DATABASE_URL < ...' ging an jeder Pruefung
--  vorbei. Seit 2026-10-01 sperrt die Datei sich selbst - siehe SPERRE unten.)
--
-- ACHTUNG: NIEMALS in Produktionsumgebung ausfuehren!
-- Das Passwort steht NICHT in dieser Datei - es kommt aus `app.seed_passwort`
-- und wird beim Laden gehasht (Owner-Punkt 16, siehe Sperre unten).
--
-- Demo-Accounts:
--   demo-hr@mustermann-gmbh.de  (company, PLUS-Plan)
--   demo-dispatch@toptemp.de    (agency, PRO-Plan)
--   demo-worker@example.de      (worker)
--
--   Passwort fuer alle drei: der Wert von SEED_PASSWORT beim Laden.
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
      'demo-sales.sql: SEED_DEMO_WORLD nicht aktiv - Saat verweigert. Anmeldbare Demo-Konten entstehen nur mit ausdruecklich gesetztem Schalter (prod-sicher).';
  END IF;
END $sperre_saat$;
-- ──────────────────────────────────────────────────────────────────────────────
-- DAS PASSWORT STEHT NICHT IM REPO (Owner-Punkt 16, 2026-10-02)
--
-- Diese Saat trug einen FESTEN bcrypt-Hash, und der Kopf nannte ein Passwort
-- dazu. GEMESSEN am 2026-10-02 passte der Hash zu diesem Passwort NICHT - und
-- auch zu keinem von acht weiteren Kandidaten. Die 3 Konten waren mit den
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
    RAISE NOTICE 'demo-sales.sql: pgcrypto angelegt (nur dev - crypt() hasht beim Laden).';
  END IF;

  /* Ohne Passwort KEINE Zeile. Anders als Migration 052 (die in der
     automatischen Migrationskette haengt und sich deshalb nur VERWEIGERT) darf
     diese Saat laut abbrechen: sie wird von Hand aufgerufen, und dort ist ein
     lauter Fehler der richtige Lehrer. crypt('') liefert sonst einen GUELTIGEN
     Hash fuer das leere Passwort - anmeldbar fuer jeden, der es versucht. */
  IF coalesce(current_setting('app.seed_passwort', true), '') = '' THEN
    RAISE EXCEPTION
      'demo-sales.sql: app.seed_passwort ist nicht gesetzt. Diese Saat traegt ABSICHTLICH kein Passwort im Repo (Owner-Punkt 16) und kennt keine Vorgabe. Aufruf: SEED_DEMO_WORLD=true SEED_PASSWORT=<geheim> ./scripts/dev/seed-data.sh';
  END IF;
  IF length(current_setting('app.seed_passwort', true)) < 12 THEN
    RAISE EXCEPTION
      'demo-sales.sql: app.seed_passwort ist kuerzer als 12 Zeichen. Diese Konten sind anmeldbar; ein kurzes Passwort macht die Saat zur Tuer.';
  END IF;
END $passwort$;
-- ──────────────────────────────────────────────────────────────────────────────

-- ──────────────────────────────────────────────────────────────────────────────


-- ---------------------------------------------------------------------------
-- 1) Demo-Nutzer anlegen
-- ---------------------------------------------------------------------------

-- HR-Manager (company, PLUS-Plan) — "Bedarfsseite"
INSERT INTO users (role, email, password_hash, company_name, phone, is_verified)
VALUES (
  'company',
  'demo-hr@mustermann-gmbh.de',
  crypt(current_setting('app.seed_passwort'), gen_salt('bf', 10)),
  'Mustermann GmbH',
  '+49 40 123456',
  TRUE
)
ON CONFLICT (email) DO NOTHING;

-- Agenturdisponent (agency, PRO-Plan) — "Angebotsseite"
INSERT INTO users (role, email, password_hash, company_name, phone, is_verified)
VALUES (
  'agency',
  'demo-dispatch@toptemp.de',
  crypt(current_setting('app.seed_passwort'), gen_salt('bf', 10)),
  'TopTemp Zeitarbeit GmbH',
  '+49 30 987654',
  TRUE
)
ON CONFLICT (email) DO NOTHING;

-- Zeitarbeitskraft (worker)
INSERT INTO users (role, email, password_hash, company_name, phone, is_verified)
VALUES (
  'worker',
  'demo-worker@example.de',
  crypt(current_setting('app.seed_passwort'), gen_salt('bf', 10)),
  NULL,
  '+49 170 1234567',
  TRUE
)
ON CONFLICT (email) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Subscriptions
-- ---------------------------------------------------------------------------

-- PLUS fuer HR-Manager
INSERT INTO subscriptions (user_id, plan, status, current_period_start, current_period_end)
SELECT u.id, 'PLUS', 'active',
       NOW() - INTERVAL '15 days',
       NOW() + INTERVAL '15 days'
FROM users u
WHERE u.email = 'demo-hr@mustermann-gmbh.de'
  AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id);

-- PRO fuer Agenturdisponent
INSERT INTO subscriptions (user_id, plan, status, current_period_start, current_period_end)
SELECT u.id, 'PRO', 'active',
       NOW() - INTERVAL '10 days',
       NOW() + INTERVAL '20 days'
FROM users u
WHERE u.email = 'demo-dispatch@toptemp.de'
  AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id);

-- ---------------------------------------------------------------------------
-- 3) Listings (Angebotsseite — TopTemp stellt Kräfte bereit)
-- ---------------------------------------------------------------------------

INSERT INTO listings (owner_id, type, category, region, qty, start_date, note, notdienst)
SELECT u.id, 'supply', 'Pflege / Betreuung', 'Hamburg', 5,
       CURRENT_DATE + INTERVAL '3 days',
       'Erfahrene Pflegekraefte (Examinierte Krankenpfleger, mind. 3 Jahre Erfahrung). Soforteinsatz möglich.',
       TRUE
FROM users u WHERE u.email = 'demo-dispatch@toptemp.de'
ON CONFLICT DO NOTHING;

INSERT INTO listings (owner_id, type, category, region, qty, start_date, note, notdienst)
SELECT u.id, 'supply', 'Lager / Kommissionierung', 'Hamburg', 8,
       CURRENT_DATE + INTERVAL '1 day',
       'Lagerarbeiter mit Staplerschein (Schein liegt vor). Frühschicht + Spätschicht möglich.',
       FALSE
FROM users u WHERE u.email = 'demo-dispatch@toptemp.de'
ON CONFLICT DO NOTHING;

INSERT INTO listings (owner_id, type, category, region, qty, start_date, note, notdienst)
SELECT u.id, 'supply', 'Büro / Verwaltung', 'Berlin', 3,
       CURRENT_DATE + INTERVAL '7 days',
       'Kaufmännische Fachkräfte mit SAP-Kenntnissen. Sofort verfügbar nach Briefing.',
       FALSE
FROM users u WHERE u.email = 'demo-dispatch@toptemp.de'
ON CONFLICT DO NOTHING;

-- Bedarfsseite — Mustermann GmbH sucht Kräfte
INSERT INTO listings (owner_id, type, category, region, qty, start_date, note, notdienst)
SELECT u.id, 'demand', 'Lager / Kommissionierung', 'Hamburg', 6,
       CURRENT_DATE + INTERVAL '2 days',
       'Dringend: Saisonspitze in unserem Hamburger Lager. Mindest-Einsatzdauer 2 Wochen.',
       FALSE
FROM users u WHERE u.email = 'demo-hr@mustermann-gmbh.de'
ON CONFLICT DO NOTHING;

INSERT INTO listings (owner_id, type, category, region, qty, start_date, note, notdienst)
SELECT u.id, 'demand', 'Pflege / Betreuung', 'Hamburg', 2,
       CURRENT_DATE + INTERVAL '1 day',
       'Notfallbedarf Nachtschicht. Exam. Krankenpfleger erforderlich.',
       TRUE
FROM users u WHERE u.email = 'demo-hr@mustermann-gmbh.de'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4) Demo-Anfragen (Requests: Demand -> Supply)
--    Verbindet Mustermann-Bedarf mit TopTemp-Angebot
-- ---------------------------------------------------------------------------

-- Pending request (STATUS: SENT — zeigt "offene Anfrage" in der Demo)
INSERT INTO requests (listing_id, requester_id, receiver_id, message, priority, status, contact_email)
SELECT
  l_demand.id,
  u_company.id,
  u_agency.id,
  'Guten Tag, wir benötigen dringend 4 Lagerarbeiter mit Staplerschein für nächste Woche. Bitte melden Sie sich kurzfristig.',
  'NORMAL',
  'SENT',
  'demo-hr@mustermann-gmbh.de'
FROM
  listings l_demand
  JOIN users u_company ON u_company.email = 'demo-hr@mustermann-gmbh.de'
  JOIN users u_agency  ON u_agency.email  = 'demo-dispatch@toptemp.de'
  JOIN listings l_supply ON l_supply.owner_id = u_agency.id AND l_supply.category = 'Lager / Kommissionierung'
WHERE l_demand.owner_id = u_company.id AND l_demand.category = 'Lager / Kommissionierung'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Accepted request (STATUS: ACCEPTED — zeigt "laufender Einsatz")
INSERT INTO requests (listing_id, requester_id, receiver_id, message, priority, status, contact_email)
SELECT
  l_demand.id,
  u_company.id,
  u_agency.id,
  'Pflegekräfte für Nachtschicht dringend gesucht. Bitte sofort zurückmelden.',
  'NOTDIENST',
  'ACCEPTED',
  'demo-hr@mustermann-gmbh.de'
FROM
  listings l_demand
  JOIN users u_company ON u_company.email = 'demo-hr@mustermann-gmbh.de'
  JOIN users u_agency  ON u_agency.email  = 'demo-dispatch@toptemp.de'
WHERE l_demand.owner_id = u_company.id AND l_demand.category = 'Pflege / Betreuung'
LIMIT 1
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5) Aufräumhinweis
-- ---------------------------------------------------------------------------
-- Demo-Daten loeschen:
--   DELETE FROM users
--   WHERE email IN (
--     'demo-hr@mustermann-gmbh.de',
--     'demo-dispatch@toptemp.de',
--     'demo-worker@example.de'
--   );
-- (CASCADE loescht subscriptions, listings, requests automatisch)

COMMIT;
