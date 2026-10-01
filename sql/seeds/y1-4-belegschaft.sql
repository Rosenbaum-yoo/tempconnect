-- =============================================================================
-- Y1.4 · EINE ZEITARBEITSFIRMA MIT VOLLSTÄNDIGER BELEGSCHAFT
-- =============================================================================
-- Welle Y, Abschnitt Y1.4 (docs/features/Y_PROBEBUEHNE.md).
--
-- WARUM. Gemessen am 2026-10-01: 33 Arbeiterprofile, davon **3 mit
-- Fähigkeiten**. Der Marktplatz kann damit nicht wirken — und das ist keine
-- Geschmacksfrage: `sweepMarktpraesenz()` legt ein automatisches Angebot nur
-- an, wenn eine Kraft **sechs** Bedingungen erfüllt, und die sechste ist eine
-- freigegebene Katalog-Fähigkeit. Ohne sie entsteht kein Angebot, der Markt
-- bleibt leer, und `api/test/marktpraesenz.service.test.js` kann seinen
-- Schalter-Zyklus nicht prüfen (dort steht seit dem 2026-10-01 eine absichtlich
-- ROTE Zusicherung, die genau diese Bühne verlangt).
--
-- DIE SECHS BEDINGUNGEN, gemessen aus `PRAESENZ_BEDINGUNGEN`:
--   1. wp.is_active = TRUE
--   2. wp.marktpraesenz_deaktiviert = FALSE
--   3. wp.city ist gesetzt und nicht leer
--   4. heute nicht abwesend
--   5. die Organisation hat ein aktives Mitglied mit role_key <> 'worker'
--      — sonst gäbe es niemanden, der auf ein Angebot antwortet
--   6. mindestens eine Fähigkeit mit is_active = TRUE AND status = 'approved'
--
-- Bedingung 5 ist die, die man nicht errät: eine Agentur ohne Disponenten
-- erzeugt KEINE Angebote, auch wenn alle Kräfte vollständig sind.
--
-- -----------------------------------------------------------------------------
-- DIE BÜHNE HÄNGT ZUSAMMEN. Der Einsatz der beiden gebundenen Kräfte läuft bei
-- **Nordlicht Logistik GmbH am Standort Hamburg Hafen** — der Organisation aus
-- `y1-2-standorte.sql` (Y1.2). Damit trägt die Standortgrenze aus Welle U zum
-- ersten Mal einen echten Geschäftsvorgang: die Standortleitung Hamburg sieht
-- diesen Einsatz, eine Standortleitung Berlin würde ihn nicht sehen.
--
-- -----------------------------------------------------------------------------
-- WER AM MARKT SICHTBAR IST, UND WARUM NICHT — das ist der eigentliche Wert.
-- Die Oberfläche „Deine Kräfte, die niemand findet" (N7.3) nennt je Mensch die
-- fehlende Bedingung. Dafür braucht sie Fälle, und die stehen hier:
--
--   W01–W04  vollständig                      → im Markt sichtbar
--   W05      vollständig, heute VERSPÄTET     → sichtbar (Verspätung verdeckt nicht)
--   W06      vollständig, heute KRANK         → unsichtbar, Grund: abwesend
--   W07, W08 vollständig, aber IM EINSATZ     → unsichtbar, Grund: gebunden
--   W09–W12  ohne Katalog-Fähigkeit           → unsichtbar, Grund: Bedingung 6
--
-- Acht Kräfte tragen Fähigkeiten (W01–W08), vier nicht. Zwei sind im Einsatz,
-- eine krank, eine verspätet — genau die Besetzung, die der Plan verlangt.
--
-- ZEHN DER ZWÖLF HABEN KEIN PORTALKONTO, und das ist Absicht.
-- `worker_profiles_identitaet_chk` verlangt **entweder** `user_id` **oder**
-- eine `personnel_number` — gemessen erst beim Laden, der erste Entwurf dieser
-- Datei scheiterte daran. Die Bedingung beschreibt aber genau den echten Fall:
-- eine Zeitarbeitsfirma führt ihre Leute mit Personalnummer, und nur ein Teil
-- hat einen Zugang. Alle 33 bestehenden Profile haben ein Konto; hiermit ist
-- der häufigere Fall zum ersten Mal belegt. Die zwei im Einsatz brauchen ein
-- Konto (`worker_assignment_links` hängt an `worker_user_id`) und tragen die
-- Nummer zusätzlich.
--
-- KEIN PASSWORT IN DIESER DATEI, gleicher Mechanismus wie y1-2-standorte.sql:
-- das Passwort kommt aus `app.seed_passwort` und wird beim Laden gehasht.
-- Kennungen beginnen mit `b1` (hex-gültig), damit die Bühne erkennbar bleibt.
-- =============================================================================

BEGIN;

-- ── SPERRE (2026-10-01) ──────────────────────────────────────────────────────
DO $sperre_saat$
BEGIN
  IF current_setting('app.seed_demo_world', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION
      'y1-4-belegschaft.sql: SEED_DEMO_WORLD nicht aktiv - Saat verweigert. Anmeldbare Demo-Konten entstehen nur mit ausdruecklich gesetztem Schalter (prod-sicher).';
  END IF;
END $sperre_saat$;
-- ─────────────────────────────────────────────────────────────────────────────

DO $passwort$
BEGIN
  IF coalesce(current_setting('app.seed_passwort', true), '') = '' THEN
    RAISE EXCEPTION
      'y1-4-belegschaft.sql: app.seed_passwort ist nicht gesetzt. Diese Saat traegt ABSICHTLICH kein Passwort im Repo (Y6.3) und kennt keine Vorgabe.';
  END IF;
  IF length(current_setting('app.seed_passwort', true)) < 12 THEN
    RAISE EXCEPTION
      'y1-4-belegschaft.sql: app.seed_passwort ist kuerzer als 12 Zeichen. Diese Konten sind anmeldbar; ein kurzes Passwort macht die Buehne zur Tuer.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    RAISE EXCEPTION
      'y1-4-belegschaft.sql: pgcrypto fehlt - ohne crypt() muesste der Hash in der Datei stehen.';
  END IF;
  -- Der Katalog muss besetzt sein, sonst entstehen Kraefte ohne Faehigkeiten und
  -- die Buehne beweist genau das Gegenteil von dem, was sie soll.
  IF (SELECT count(*) FROM platform_skills WHERE is_active AND status = 'approved') < 20 THEN
    RAISE EXCEPTION
      'y1-4-belegschaft.sql: weniger als 20 freigegebene Katalog-Faehigkeiten. Ohne Katalog traegt keine Kraft eine Faehigkeit, und der Markt bliebe leer - die Saat waere wirkungslos und saehe erfolgreich aus.';
  END IF;
END $passwort$;

-- 1) Die Zeitarbeitsfirma. PRO, weil davon im Bestand nur drei existieren.
INSERT INTO organizations (id, name, slug, type, plan, billing_email, is_active)
VALUES (
  'b1000000-0000-4000-8000-000000000001',
  'Hanse Personal Service GmbH',
  'y1-hanse-personal',
  'agency',
  'PRO',
  'rechnung@hanse.probebuehne.tempconnect.de',
  TRUE
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, plan = EXCLUDED.plan, is_active = EXCLUDED.is_active;

-- 2) Der Disponent — Bedingung 5. Ohne ihn entsteht KEIN einziges Angebot,
--    egal wie vollstaendig die Kraefte sind.
INSERT INTO users (id, role, email, password_hash, company_name, contact_person, phone, is_verified, org_id, is_demo)
VALUES
  ('b1000000-0000-4000-8000-00000000c001', 'agency',
   'disponent@hanse.probebuehne.tempconnect.de',
   crypt(current_setting('app.seed_passwort'), gen_salt('bf', 10)),
   'Hanse Personal Service GmbH', 'Silke Brandt', '+49 40 500100', TRUE,
   'b1000000-0000-4000-8000-000000000001', TRUE),
  -- Die beiden Kraefte im Einsatz brauchen ein Konto: worker_assignment_links
  -- haengt an worker_user_id, nicht am Profil.
  ('b1000000-0000-4000-8000-00000000c007', 'worker',
   'kraft07@hanse.probebuehne.tempconnect.de',
   crypt(current_setting('app.seed_passwort'), gen_salt('bf', 10)),
   NULL, 'Tomasz Nowak', '+49 40 500207', TRUE,
   'b1000000-0000-4000-8000-000000000001', TRUE),
  ('b1000000-0000-4000-8000-00000000c008', 'worker',
   'kraft08@hanse.probebuehne.tempconnect.de',
   crypt(current_setting('app.seed_passwort'), gen_salt('bf', 10)),
   NULL, 'Amina Toure', '+49 40 500208', TRUE,
   'b1000000-0000-4000-8000-000000000001', TRUE)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  contact_person = EXCLUDED.contact_person,
  is_verified = EXCLUDED.is_verified,
  org_id = EXCLUDED.org_id,
  is_demo = EXCLUDED.is_demo;

INSERT INTO org_memberships (user_id, org_id, role_key, location_id, is_active)
VALUES
  ('b1000000-0000-4000-8000-00000000c001',
   'b1000000-0000-4000-8000-000000000001', 'dispatcher', NULL, TRUE),
  ('b1000000-0000-4000-8000-00000000c007',
   'b1000000-0000-4000-8000-000000000001', 'worker',     NULL, TRUE),
  ('b1000000-0000-4000-8000-00000000c008',
   'b1000000-0000-4000-8000-000000000001', 'worker',     NULL, TRUE)
ON CONFLICT (user_id, org_id) DO UPDATE SET
  role_key = EXCLUDED.role_key, is_active = EXCLUDED.is_active;

INSERT INTO subscriptions (user_id, plan, status)
SELECT 'b1000000-0000-4000-8000-00000000c001', 'PRO', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions s WHERE s.user_id = 'b1000000-0000-4000-8000-00000000c001'
);

-- 3) Zwölf Kräfte. Alle aktiv, Marktpräsenz an, Wohnort gesetzt —
--    Bedingungen 1 bis 3 also durchgehend erfüllt. Was danach fehlt, ist je
--    Kraft ABSICHTLICH verschieden.
INSERT INTO worker_profiles
  (id, user_id, personnel_number, supplier_org_id, first_name, last_name, city, postal_code,
   is_active, marktpraesenz_deaktiviert, einsetzbar_bis)
VALUES
  ('b1000000-0000-4000-8000-00000000d001', NULL, 'HPS-001', 'b1000000-0000-4000-8000-000000000001',
   'Jonas',   'Harms',     'Hamburg',  '20535', TRUE, FALSE, CURRENT_DATE + 180),
  ('b1000000-0000-4000-8000-00000000d002', NULL, 'HPS-002', 'b1000000-0000-4000-8000-000000000001',
   'Leyla',   'Demir',     'Hamburg',  '22767', TRUE, FALSE, CURRENT_DATE + 180),
  ('b1000000-0000-4000-8000-00000000d003', NULL, 'HPS-003', 'b1000000-0000-4000-8000-000000000001',
   'Piotr',   'Lewandow',  'Hamburg',  '21073', TRUE, FALSE, CURRENT_DATE + 180),
  ('b1000000-0000-4000-8000-00000000d004', NULL, 'HPS-004', 'b1000000-0000-4000-8000-000000000001',
   'Sanna',   'Virtanen',  'Luebeck',  '23552', TRUE, FALSE, CURRENT_DATE + 180),
  ('b1000000-0000-4000-8000-00000000d005', NULL, 'HPS-005', 'b1000000-0000-4000-8000-000000000001',
   'Mehmet',  'Kaya',      'Hamburg',  '20095', TRUE, FALSE, CURRENT_DATE + 180),
  ('b1000000-0000-4000-8000-00000000d006', NULL, 'HPS-006', 'b1000000-0000-4000-8000-000000000001',
   'Greta',   'Olsen',     'Hamburg',  '22299', TRUE, FALSE, CURRENT_DATE + 180),
  ('b1000000-0000-4000-8000-00000000d007', 'b1000000-0000-4000-8000-00000000c007', 'HPS-007',
   'b1000000-0000-4000-8000-000000000001',
   'Tomasz',  'Nowak',     'Hamburg',  '21107', TRUE, FALSE, CURRENT_DATE + 180),
  ('b1000000-0000-4000-8000-00000000d008', 'b1000000-0000-4000-8000-00000000c008', 'HPS-008',
   'b1000000-0000-4000-8000-000000000001',
   'Amina',   'Toure',     'Hamburg',  '20257', TRUE, FALSE, CURRENT_DATE + 180),
  ('b1000000-0000-4000-8000-00000000d009', NULL, 'HPS-009', 'b1000000-0000-4000-8000-000000000001',
   'Dennis',  'Brinkmann', 'Hamburg',  '22525', TRUE, FALSE, NULL),
  ('b1000000-0000-4000-8000-00000000d010', NULL, 'HPS-010', 'b1000000-0000-4000-8000-000000000001',
   'Ivana',   'Horvat',    'Hamburg',  '20457', TRUE, FALSE, NULL),
  ('b1000000-0000-4000-8000-00000000d011', NULL, 'HPS-011', 'b1000000-0000-4000-8000-000000000001',
   'Samuel',  'Addo',      'Norderstedt', '22846', TRUE, FALSE, NULL),
  ('b1000000-0000-4000-8000-00000000d012', NULL, 'HPS-012', 'b1000000-0000-4000-8000-000000000001',
   'Yuki',    'Tanaka',    'Hamburg',  '22765', TRUE, FALSE, NULL)
ON CONFLICT (id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  personnel_number = EXCLUDED.personnel_number,
  city = EXCLUDED.city,
  postal_code = EXCLUDED.postal_code,
  is_active = EXCLUDED.is_active,
  marktpraesenz_deaktiviert = EXCLUDED.marktpraesenz_deaktiviert,
  einsetzbar_bis = EXCLUDED.einsetzbar_bis;

-- 4) Die Fähigkeiten — Bedingung 6. ACHT Kräfte (W01–W08) bekommen je eine
--    freigegebene Katalog-Fähigkeit, vier bleiben ohne.
--
--    GESUCHT WIRD ÜBER DEN NAMEN, nicht über eine hartkodierte Kennung. Die
--    Katalog-UUIDs unterscheiden sich je Installation; eine Saat mit fester
--    Kennung wäre auf einer frischen Datenbank still wirkungslos — die
--    INSERT..SELECT fände nichts und legte keine Zeile an, ohne zu scheitern.
--    Darum steht unten eine Notbremse, die genau das zum Fehler macht.
INSERT INTO worker_profile_skills
  (worker_profile_id, skill_id, proficiency, years_experience, is_primary, certified, source)
SELECT z.profil::uuid, ps.id, z.stufe, z.jahre, TRUE, FALSE, 'agency'
  FROM (VALUES
    ('b1000000-0000-4000-8000-00000000d001', 'Lagerhelfer:in',          'advanced',     6),
    ('b1000000-0000-4000-8000-00000000d002', 'Kommissionierer:in',      'expert',       9),
    ('b1000000-0000-4000-8000-00000000d003', 'Staplerfahrer:in',        'advanced',     4),
    ('b1000000-0000-4000-8000-00000000d004', 'Bauhelfer:in',            'intermediate', 2),
    ('b1000000-0000-4000-8000-00000000d005', 'Auslieferungsfahrer:in',  'advanced',     7),
    ('b1000000-0000-4000-8000-00000000d006', 'Allrounder / Aushilfe',   'beginner',     1),
    ('b1000000-0000-4000-8000-00000000d007', 'Produktionshelfer:in',    'advanced',     5),
    ('b1000000-0000-4000-8000-00000000d008', 'Bankettservice',          'intermediate', 3)
  ) AS z(profil, fertigkeit, stufe, jahre)
  JOIN platform_skills ps
    ON ps.name = z.fertigkeit AND ps.is_active = TRUE AND ps.status = 'approved'
ON CONFLICT (worker_profile_id, skill_id) DO UPDATE SET
  proficiency = EXCLUDED.proficiency,
  years_experience = EXCLUDED.years_experience,
  is_primary = EXCLUDED.is_primary;

-- Notbremse: traegt nicht jede der acht Kraefte wirklich eine Faehigkeit, war
-- ein Katalogname falsch geschrieben oder nicht freigegeben. Ohne diese Pruefung
-- liefe die Saat erfolgreich durch und die Buehne waere leer.
DO $faehigkeiten$
DECLARE n integer;
BEGIN
  SELECT count(DISTINCT worker_profile_id) INTO n
    FROM worker_profile_skills
   WHERE worker_profile_id::text LIKE 'b1000000-%';
  IF n <> 8 THEN
    RAISE EXCEPTION
      'y1-4-belegschaft.sql: % von 8 Kraeften haben eine Katalog-Faehigkeit. Ein Name in der Liste oben passt zu keiner freigegebenen Faehigkeit in platform_skills - die INSERT..SELECT findet dann lautlos nichts. Namen gegen den Katalog pruefen.', n;
  END IF;
END $faehigkeiten$;

-- 5) W06 ist heute KRANK — Bedingung 4 fällt, die Kraft verschwindet aus dem
--    Markt und die Oberfläche nennt den Grund.
INSERT INTO worker_absences
  (id, worker_profile_id, supplier_org_id, art, von, bis, quelle, zustand, notiz)
VALUES
  ('b1000000-0000-4000-8000-00000000e001',
   'b1000000-0000-4000-8000-00000000d006',
   'b1000000-0000-4000-8000-000000000001',
   'krank', CURRENT_DATE, CURRENT_DATE + 2, 'disponent', 'wirksam',
   'Probebuehne: zeigt den Zustand "heute abwesend" im Markt und in der Live-Belegschaft.')
ON CONFLICT (id) DO UPDATE SET
  von = EXCLUDED.von, bis = EXCLUDED.bis, zustand = EXCLUDED.zustand, aufgehoben_am = NULL;

-- 6) W05 ist heute VERSPÄTET — sichtbar bleibt sie, aber die Live-Belegschaft
--    zeigt die Meldung. Verspätung ist kein Grund, ein Angebot zurückzunehmen.
INSERT INTO worker_delays
  (id, worker_profile_id, supplier_org_id, gilt_fuer, minuten, notiz)
VALUES
  ('b1000000-0000-4000-8000-00000000e002',
   'b1000000-0000-4000-8000-00000000d005',
   'b1000000-0000-4000-8000-000000000001',
   CURRENT_DATE, 45,
   'Probebuehne: zeigt eine Verspaetung, die den Markt NICHT veraendert.')
ON CONFLICT (id) DO UPDATE SET
  gilt_fuer = EXCLUDED.gilt_fuer, minuten = EXCLUDED.minuten;

-- 7) W07 und W08 sind IM EINSATZ — bei Nordlicht Logistik, Standort Hamburg
--    Hafen. Damit traegt die Standortgrenze aus Welle U einen echten Vorgang.
--    Läuft nur, wenn y1-2-standorte.sql geladen ist; sonst fehlt die
--    Kundenorganisation, und das wird gesagt statt uebersprungen.
DO $einsatz$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = 'b0000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION
      'y1-4-belegschaft.sql: Nordlicht Logistik GmbH fehlt. Der Einsatz der beiden gebundenen Kraefte laeuft bei dieser Kundenorganisation aus y1-2-standorte.sql (Y1.2) - bitte diese Saat zuerst laden. Ohne sie waere die Belegschaft da, aber niemand im Einsatz, und der Grund "gebunden" haette kein Beispiel.';
  END IF;
END $einsatz$;

INSERT INTO assignments
  (id, org_id, supplier_org_id, location_id, department_id,
   worker_count, requested_quantity, filled_quantity, start_date, planned_end_date,
   status, staffing_status, worker_description)
VALUES (
  'b1000000-0000-4000-8000-00000000f001',
  'b0000000-0000-4000-8000-000000000001',   -- Nordlicht Logistik (Kunde)
  'b1000000-0000-4000-8000-000000000001',   -- Hanse Personal (Lieferant)
  'b0000000-0000-4000-8000-00000000a001',   -- Standort Hamburg Hafen
  'b0000000-0000-4000-8000-00000000b001',   -- Abteilung Umschlag Hafen
  2, 2, 2, CURRENT_DATE - 7, CURRENT_DATE + 60,
  'active', 'filled',
  'Zwei Umschlagkraefte, Frueh- und Spaetschicht (Probebuehne Y1.4)'
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status, staffing_status = EXCLUDED.staffing_status,
  filled_quantity = EXCLUDED.filled_quantity, planned_end_date = EXCLUDED.planned_end_date;

INSERT INTO worker_assignment_links
  (id, worker_user_id, assignment_id, org_id, supplier_org_id, role,
   start_date, end_date, is_active, worker_confirmation_status)
VALUES
  ('b1000000-0000-4000-8000-00000000f011',
   'b1000000-0000-4000-8000-00000000c007',
   'b1000000-0000-4000-8000-00000000f001',
   'b0000000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-000000000001',
   'primary', CURRENT_DATE - 7, CURRENT_DATE + 60, TRUE, 'auto_confirmed'),
  ('b1000000-0000-4000-8000-00000000f012',
   'b1000000-0000-4000-8000-00000000c008',
   'b1000000-0000-4000-8000-00000000f001',
   'b0000000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-000000000001',
   'primary', CURRENT_DATE - 7, CURRENT_DATE + 60, TRUE, 'auto_confirmed')
ON CONFLICT (id) DO UPDATE SET
  is_active = EXCLUDED.is_active,
  end_date = EXCLUDED.end_date,
  worker_confirmation_status = EXCLUDED.worker_confirmation_status;

COMMIT;
