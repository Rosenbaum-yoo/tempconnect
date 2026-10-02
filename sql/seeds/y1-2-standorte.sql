-- =============================================================================
-- Y1 · DIE PROBEBÜHNE — eine BENANNTE Besetzung, nicht mehr Masse
-- =============================================================================
-- Welle Y, Abschnitt Y1 (docs/features/Y_PROBEBUEHNE.md).
--
-- WARUM DIESE DATEI. Gemessen am 2026-10-01: 2940 Organisationen, und davon
-- hat GENAU EINE mehr als einen Standort. Mitgliedschaften mit Standortbindung:
-- NULL von 252. Organisationen mit mehr als einem Standort UND mehr als einem
-- Mitglied: KEINE. Die Standortgrenze aus Welle U ist damit nicht „dünn
-- belegt", sondern **nicht vorführbar**: der Vorgang „ich melde mich als
-- Standortleitung Hamburg an und darf Berlin nicht sehen" lässt sich heute
-- nicht einmal herstellen.
--
-- Mehr Organisationen ändern das nicht. In der Woche vor dieser Messung kamen
-- 374 dazu und keine einzige strukturelle Lücke schloss sich. Es fehlen keine
-- Daten, es fehlt eine BESETZUNG: wenige Konten, von denen man weiß, wofür sie
-- stehen.
--
-- -----------------------------------------------------------------------------
-- KEIN PASSWORT IN DIESER DATEI.
--
-- Bei Y1.2 war das der Unterschied zu den drei älteren Saaten: `052` trug
-- `DemoPass2026!` sechsmal als Hash mit dem Klartext im Kopf, `demo-sales.sql`
-- und `dev-data.sql` je einen festen Hash — im Klartext im öffentlichen Repo.
-- SEIT OWNER-PUNKT 16 (2026-10-02) IST DAS KEIN UNTERSCHIED MEHR, SONDERN DIE
-- REGEL: alle sechs Dateien hashen beim Laden. Diese Datei war die erste.
-- Sie nimmt das Passwort aus dem Schalter
-- `app.seed_passwort` und hasht es ERST BEIM LADEN mit `pgcrypto`
-- (`crypt(…, gen_salt('bf', 10))` → `$2a$10$…`, dasselbe Format, das 71
-- bestehende Konten tragen und das `bcryptjs.compare` prüft).
--
-- Ohne Schalter: Abbruch. Es gibt KEINE Vorgabe — ein Vorgabe-Passwort wäre
-- genau das, was hier vermieden wird. Gesetzt wird er von
-- `scripts/dev/seed-data.sh` aus der Umgebungsvariable `SEED_PASSWORT`.
--
-- -----------------------------------------------------------------------------
-- STABILE KENNUNGEN, damit ein zweiter Lauf nichts verdoppelt. Alle UUIDs
-- beginnen mit `b0` (für Bühne) — so ist jede Zeile dieser Saat auf einen Blick erkennbar
-- und notfalls in einem Zug entfernbar. Hex-gültig: ein `y` wäre keine UUID, und
-- der erste Entwurf dieser Datei hatte genau diesen Fehler.
-- =============================================================================

BEGIN;

-- ── SPERRE (2026-10-01) ──────────────────────────────────────────────────────
-- Diese Saat legt ANMELDBARE Konten an. Sie läuft nur mit ausdrücklich
-- gesetztem Schalter app.seed_demo_world - identisch zur Sperre in
-- sql/migrations/052_demo_seed_world.sql und in den drei Saaten daneben.
-- Ohne Schalter bricht die TRANSAKTION ab: keine einzige Zeile entsteht.
DO $sperre_saat$
BEGIN
  IF current_setting('app.seed_demo_world', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION
      'y1-2-standorte.sql: SEED_DEMO_WORLD nicht aktiv - Saat verweigert. Anmeldbare Demo-Konten entstehen nur mit ausdruecklich gesetztem Schalter (prod-sicher).';
  END IF;
END $sperre_saat$;
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Das Passwort kommt von aussen, nie aus dieser Datei ──────────────────────
DO $passwort$
BEGIN
  IF coalesce(current_setting('app.seed_passwort', true), '') = '' THEN
    RAISE EXCEPTION
      'y1-2-standorte.sql: app.seed_passwort ist nicht gesetzt. Diese Saat traegt ABSICHTLICH kein Passwort im Repo (Y6.3) und kennt keine Vorgabe. Aufruf: SEED_DEMO_WORLD=true SEED_PASSWORT=<geheim> ./scripts/dev/seed-data.sh --file=y1-2-standorte.sql';
  END IF;
  IF length(current_setting('app.seed_passwort', true)) < 12 THEN
    RAISE EXCEPTION
      'y1-2-standorte.sql: app.seed_passwort ist kuerzer als 12 Zeichen. Diese Konten sind anmeldbar; ein kurzes Passwort macht die Buehne zur Tuer.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    RAISE EXCEPTION
      'y1-2-standorte.sql: pgcrypto fehlt - ohne crypt() muesste der Hash in der Datei stehen, und genau das soll nicht sein.';
  END IF;
END $passwort$;

-- =============================================================================
-- Y1.2 · EINE FIRMA MIT DREI STANDORTEN UND DREI MENSCHEN
-- =============================================================================
-- Der wertvollste Posten der Welle: erst hiermit wird Welle U durchspielbar.
--
-- DREI ROLLEN, DREI SICHTWEITEN — das ist der ganze Zweck:
--
--   Verwaltung (admin, OHNE Standortbindung)      sieht alle drei Standorte
--   Disposition (hiring_manager, OHNE Bindung)    sieht alle drei Standorte
--   Standortleitung Hamburg (member, AN Hamburg)  sieht NUR Hamburg
--
-- Die dritte Zeile ist der Punkt. `org_memberships.location_id` war im ganzen
-- Bestand 0-mal gesetzt; ab hier ist sie einmal gesetzt, und zwar an einer
-- Organisation, die mehr als einen Standort hat. Vorher konnte die Grenze
-- nichts beweisen, weil es keine zweite Person an einem anderen Standort gab.
--
-- ACHTUNG, GEMESSENE FALLE: die Standorttabelle heisst `org_locations`, nicht
-- `locations`. Daneben existiert `company_locations` — die haengt an `user_id`
-- statt an `org_id`, traegt eine einzige Zeile und ist das Modell von vor den
-- Organisationen. ALLE sieben location_id-Fremdschluessel der Plattform
-- (assignments, capacity_posts, org_departments, org_memberships, rate_cards,
-- requisitions, vendor_pool) zeigen auf `org_locations`, und zwar
-- ZUSAMMENGESETZT mit org_id. Eine Saat, die `company_locations` fuellt, saehe
-- richtig aus und wuerde nichts beweisen.
-- =============================================================================

-- 1) Die Organisation. PLUS, damit Standort-Funktionen ueberhaupt greifen.
INSERT INTO organizations (id, name, slug, type, plan, billing_email, is_active)
VALUES (
  'b0000000-0000-4000-8000-000000000001',
  'Nordlicht Logistik GmbH',
  'y1-nordlicht-logistik',
  'company',
  'PLUS',
  'rechnung@probebuehne.tempconnect.de',
  TRUE
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, plan = EXCLUDED.plan, is_active = EXCLUDED.is_active;

-- 2) Drei Standorte. Hamburg ist Hauptsitz, damit der Standardfall belegt ist.
INSERT INTO org_locations (id, org_id, name, street, city, postal_code, country, is_hq, is_active)
VALUES
  ('b0000000-0000-4000-8000-00000000a001',
   'b0000000-0000-4000-8000-000000000001',
   'Hamburg Hafen', 'Am Sandtorkai 48', 'Hamburg', '20457', 'DE', TRUE,  TRUE),
  ('b0000000-0000-4000-8000-00000000a002',
   'b0000000-0000-4000-8000-000000000001',
   'Berlin Schoenefeld', 'Flughafenstrasse 1', 'Schoenefeld', '12529', 'DE', FALSE, TRUE),
  ('b0000000-0000-4000-8000-00000000a003',
   'b0000000-0000-4000-8000-000000000001',
   'Muenchen Nord', 'Ingolstaedter Str. 120', 'Muenchen', '80807', 'DE', FALSE, TRUE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, city = EXCLUDED.city, is_hq = EXCLUDED.is_hq, is_active = EXCLUDED.is_active;

-- 3) Je Standort eine Abteilung — damit auch die zweite Ebene der
--    Standortbindung (org_departments.location_id) belegt ist und nicht nur
--    behauptet wird.
INSERT INTO org_departments (id, org_id, location_id, name, cost_center)
VALUES
  ('b0000000-0000-4000-8000-00000000b001',
   'b0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-00000000a001', 'Umschlag Hafen',      'HH-100'),
  ('b0000000-0000-4000-8000-00000000b002',
   'b0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-00000000a002', 'Luftfracht',          'BE-200'),
  ('b0000000-0000-4000-8000-00000000b003',
   'b0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-00000000a003', 'Kontraktlogistik',    'MU-300')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, location_id = EXCLUDED.location_id, cost_center = EXCLUDED.cost_center;

-- 4) Drei Menschen. Der Hash entsteht HIER, aus dem Schalter — nicht in der Datei.
INSERT INTO users (id, role, email, password_hash, company_name, contact_person, phone, is_verified, org_id, is_demo)
VALUES
  ('b0000000-0000-4000-8000-00000000c001', 'company',
   'verwaltung@probebuehne.tempconnect.de',
   crypt(current_setting('app.seed_passwort'), gen_salt('bf', 10)),
   'Nordlicht Logistik GmbH', 'Birte Ahrens', '+49 40 300100', TRUE,
   'b0000000-0000-4000-8000-000000000001', TRUE),
  ('b0000000-0000-4000-8000-00000000c002', 'company',
   'disposition@probebuehne.tempconnect.de',
   crypt(current_setting('app.seed_passwort'), gen_salt('bf', 10)),
   'Nordlicht Logistik GmbH', 'Kerem Yildiz', '+49 40 300200', TRUE,
   'b0000000-0000-4000-8000-000000000001', TRUE),
  ('b0000000-0000-4000-8000-00000000c003', 'company',
   'standort.hamburg@probebuehne.tempconnect.de',
   crypt(current_setting('app.seed_passwort'), gen_salt('bf', 10)),
   'Nordlicht Logistik GmbH', 'Marit Clausen', '+49 40 300300', TRUE,
   'b0000000-0000-4000-8000-000000000001', TRUE)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  contact_person = EXCLUDED.contact_person,
  is_verified = EXCLUDED.is_verified,
  org_id = EXCLUDED.org_id,
  is_demo = EXCLUDED.is_demo;

-- 5) Die Mitgliedschaften — und HIER liegt der eigentliche Beweis.
--    Zwei ohne Standortbindung (org-weite Sicht), eine MIT (Standortleitung).
INSERT INTO org_memberships (user_id, org_id, role_key, location_id, is_active)
VALUES
  ('b0000000-0000-4000-8000-00000000c001',
   'b0000000-0000-4000-8000-000000000001', 'admin',          NULL, TRUE),
  ('b0000000-0000-4000-8000-00000000c002',
   'b0000000-0000-4000-8000-000000000001', 'hiring_manager', NULL, TRUE),
  ('b0000000-0000-4000-8000-00000000c003',
   'b0000000-0000-4000-8000-000000000001', 'member',
   'b0000000-0000-4000-8000-00000000a001', TRUE)
ON CONFLICT (user_id, org_id) DO UPDATE SET
  role_key = EXCLUDED.role_key,
  location_id = EXCLUDED.location_id,
  is_active = EXCLUDED.is_active;

-- 6) Ein Abonnement, damit die Organisation nicht auf der DEMO-Vorgabe haengt
--    und die Standort-Funktionen wirklich freigeschaltet sind.
--    subscriptions haengt an user_id (nicht an org_id) — gemessen, nicht geraten.
INSERT INTO subscriptions (user_id, plan, status)
SELECT 'b0000000-0000-4000-8000-00000000c001', 'PLUS', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions s
   WHERE s.user_id = 'b0000000-0000-4000-8000-00000000c001'
);

COMMIT;
