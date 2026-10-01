-- =============================================================================
-- Y1.3 · DIE ZUSTÄNDE, DIE NIEMAND JE GESEHEN HAT
-- =============================================================================
-- Welle Y, Abschnitt Y1.3 (docs/features/Y_PROBEBUEHNE.md).
--
-- Der Plan verlangt vier Sonderzustände: Pilotkunde, gekündigt, wegen
-- Zahlungsausfall gesperrt, Abo läuft in drei Tagen ab.
--
-- GEMESSEN AM 2026-10-01 SIND ES ZWÖLF. Nicht vier — zwölf legale Zustände haben
-- in **2940 Organisationen und 344 Abonnements** kein einziges Beispiel:
--
--   organizations.pilot_status          ended · converted · blocked · exception
--   organizations.access_suspended_kind non_payment · manual · security
--   subscriptions.status                past_due · canceling
--   organizations.individual_tier_auto  individuell_s · individuell_l
--   organizations.customer_stage        demo · live
--
-- Dazu: **null** Abonnements laufen in den nächsten sieben Tagen ab. Die
-- Verlängerungs- und Ablaufoberfläche ist mit echten Daten nie gezeigt worden.
--
-- `customer_stage = 'live'` ist der auffälligste Eintrag der Liste: **keine
-- einzige Organisation steht im Zustand „live"**. Der Zustand, in dem ein
-- zahlender Kunde die meiste Zeit verbringt, hat kein Beispiel.
--
-- Jeder unbesetzte Zustand ist eine Oberfläche, die niemand je gesehen hat — und
-- ein Codepfad, den kein Mensch je ausgelöst hat. Deshalb besetzt diese Saat
-- ALLE ZWÖLF, nicht die vier aus dem Plan.
--
-- -----------------------------------------------------------------------------
-- ZWÖLF ORGANISATIONEN, JEDE MIT GENAU EINEM ZWECK, und der Zweck steht im
-- NAMEN. Wer die Liste in der Verwaltung sieht, weiß ohne Nachschlagen, wofür
-- jede Zeile da ist. Zwei tragen bewusst zwei Zustände, weil die Kombination die
-- realistische ist: „wegen Zahlungsausfall gesperrt" geht mit einem Abonnement
-- in `past_due` einher, und „Pilot übernommen" ist genau der Übergang nach
-- `customer_stage = 'live'`.
--
-- Was Y1.1 verlangt, ist bereits erfüllt: alle zehn Kombinationen aus Plan und
-- Art (DEMO/BASIS/PLUS/PRO/INDIVIDUELL × company/agency) existieren im Bestand
-- schon. Was dort fehlte, waren die Größenstufen — `individuell_s` und
-- `individuell_l` stehen deshalb hier mit drin.
--
-- KEIN PASSWORT IN DIESER DATEI. Gleicher Mechanismus wie in den beiden anderen
-- Y1-Saaten: `app.seed_passwort` + `pgcrypto`, Hash entsteht beim Laden.
-- Kennungen beginnen mit `b3` (hex-gültig).
-- =============================================================================

BEGIN;

-- ── SPERRE (2026-10-01) ──────────────────────────────────────────────────────
DO $sperre_saat$
BEGIN
  IF current_setting('app.seed_demo_world', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION
      'y1-3-sonderzustaende.sql: SEED_DEMO_WORLD nicht aktiv - Saat verweigert. Anmeldbare Demo-Konten entstehen nur mit ausdruecklich gesetztem Schalter (prod-sicher).';
  END IF;
END $sperre_saat$;
-- ─────────────────────────────────────────────────────────────────────────────

DO $passwort$
BEGIN
  IF coalesce(current_setting('app.seed_passwort', true), '') = '' THEN
    RAISE EXCEPTION
      'y1-3-sonderzustaende.sql: app.seed_passwort ist nicht gesetzt. Diese Saat traegt ABSICHTLICH kein Passwort im Repo (Y6.3) und kennt keine Vorgabe.';
  END IF;
  IF length(current_setting('app.seed_passwort', true)) < 12 THEN
    RAISE EXCEPTION
      'y1-3-sonderzustaende.sql: app.seed_passwort ist kuerzer als 12 Zeichen. Diese Konten sind anmeldbar; ein kurzes Passwort macht die Buehne zur Tuer.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    RAISE EXCEPTION
      'y1-3-sonderzustaende.sql: pgcrypto fehlt - ohne crypt() muesste der Hash in der Datei stehen.';
  END IF;
END $passwort$;

-- 1) Die zwölf Organisationen. Der Zweck steht im Namen.
INSERT INTO organizations (
  id, name, slug, type, plan, billing_email, is_active,
  pilot_status, has_used_pilot, pilot_started_at, pilot_ended_at, converted_at,
  pilot_exception_allowed, pilot_exception_reason,
  access_suspended_at, access_suspended_kind, access_suspended_reason,
  individual_tier_auto, company_size_class, customer_stage, billing_mode
)
VALUES
  -- pilot_status: vier von sechs Werten waren unbesetzt
  ('b3000000-0000-4000-8000-000000000001', 'Pilot beendet GmbH', 'y1-pilot-beendet',
   'company', 'PLUS', 'rechnung@pilot-beendet.probebuehne.tempconnect.de', TRUE,
   'ended', TRUE, now() - interval '120 days', now() - interval '30 days', NULL,
   FALSE, NULL, NULL, NULL, NULL, NULL, NULL, 'pilot', 'standard_catalog'),

  ('b3000000-0000-4000-8000-000000000002', 'Pilot uebernommen GmbH', 'y1-pilot-uebernommen',
   'company', 'PRO', 'rechnung@pilot-uebernommen.probebuehne.tempconnect.de', TRUE,
   'converted', TRUE, now() - interval '200 days', now() - interval '90 days', now() - interval '88 days',
   FALSE, NULL, NULL, NULL, NULL, NULL, NULL, 'live', 'standard_catalog'),

  ('b3000000-0000-4000-8000-000000000003', 'Pilot gesperrt GmbH', 'y1-pilot-gesperrt',
   'agency', 'DEMO', 'rechnung@pilot-gesperrt.probebuehne.tempconnect.de', TRUE,
   'blocked', TRUE, now() - interval '300 days', now() - interval '240 days', NULL,
   FALSE, NULL, NULL, NULL, NULL, NULL, NULL, 'demo', 'standard_catalog'),

  ('b3000000-0000-4000-8000-000000000004', 'Pilot Ausnahme GmbH', 'y1-pilot-ausnahme',
   'company', 'PLUS', 'rechnung@pilot-ausnahme.probebuehne.tempconnect.de', TRUE,
   'exception', TRUE, now() - interval '60 days', NULL, NULL,
   TRUE, 'Probebuehne Y1.3: zweiter Pilot nach Standortwechsel, vom Owner freigegeben.',
   NULL, NULL, NULL, NULL, NULL, 'pilot', 'pilot_contract'),

  -- access_suspended_kind: drei von fuenf Werten waren unbesetzt
  ('b3000000-0000-4000-8000-000000000005', 'Zahlungsausfall GmbH', 'y1-zahlungsausfall',
   'company', 'PLUS', 'rechnung@zahlungsausfall.probebuehne.tempconnect.de', TRUE,
   'eligible', FALSE, NULL, NULL, NULL, FALSE, NULL,
   now() - interval '9 days', 'non_payment',
   'Probebuehne Y1.3: zwei Rechnungen offen, Mahnstufe 2 erreicht.',
   NULL, NULL, 'live', 'standard_catalog'),

  ('b3000000-0000-4000-8000-000000000006', 'Manuell gesperrt GmbH', 'y1-manuell-gesperrt',
   'agency', 'BASIS', 'rechnung@manuell-gesperrt.probebuehne.tempconnect.de', TRUE,
   'eligible', FALSE, NULL, NULL, NULL, FALSE, NULL,
   now() - interval '3 days', 'manual',
   'Probebuehne Y1.3: auf Wunsch des Kunden vorlaeufig stillgelegt.',
   NULL, NULL, 'live', 'standard_catalog'),

  ('b3000000-0000-4000-8000-000000000007', 'Sicherheitssperre GmbH', 'y1-sicherheitssperre',
   'company', 'PRO', 'rechnung@sicherheitssperre.probebuehne.tempconnect.de', TRUE,
   'eligible', FALSE, NULL, NULL, NULL, FALSE, NULL,
   now() - interval '1 day', 'security',
   'Probebuehne Y1.3: verdaechtige Anmeldungen, Zugang bis zur Klaerung gesperrt.',
   NULL, NULL, 'live', 'standard_catalog'),

  -- subscriptions.status: zwei von vier Werten waren unbesetzt
  ('b3000000-0000-4000-8000-000000000008', 'Kuendigung laeuft GmbH', 'y1-kuendigung-laeuft',
   'company', 'PLUS', 'rechnung@kuendigung.probebuehne.tempconnect.de', TRUE,
   'eligible', FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, NULL, NULL,
   NULL, NULL, 'live', 'standard_catalog'),

  -- individual_tier_auto: zwei von vier Groessenstufen waren unbesetzt (Y1.1)
  ('b3000000-0000-4000-8000-000000000009', 'Individuell S GmbH', 'y1-individuell-s',
   'company', 'INDIVIDUELL', 'rechnung@individuell-s.probebuehne.tempconnect.de', TRUE,
   'eligible', FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, NULL, NULL,
   'individuell_s', 'I', 'live', 'individual_contract'),

  ('b3000000-0000-4000-8000-00000000000a', 'Individuell L GmbH', 'y1-individuell-l',
   'agency', 'INDIVIDUELL', 'rechnung@individuell-l.probebuehne.tempconnect.de', TRUE,
   'eligible', FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, NULL, NULL,
   'individuell_l', 'III', 'live', 'individual_contract'),

  -- customer_stage: 'demo' und 'live' waren unbesetzt. 'live' traegt oben schon
  -- mehrere; 'demo' bekommt hier eine eigene Zeile mit DEMO-Plan.
  ('b3000000-0000-4000-8000-00000000000b', 'Demo-Phase GmbH', 'y1-demo-phase',
   'company', 'DEMO', 'rechnung@demo-phase.probebuehne.tempconnect.de', TRUE,
   'eligible', FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, NULL, NULL,
   NULL, NULL, 'demo', 'standard_catalog'),

  -- Abo laeuft in drei Tagen ab: null solche Abos im Bestand
  ('b3000000-0000-4000-8000-00000000000c', 'Ablauf in drei Tagen GmbH', 'y1-ablauf-drei-tage',
   'agency', 'PRO', 'rechnung@ablauf.probebuehne.tempconnect.de', TRUE,
   'eligible', FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, NULL, NULL,
   NULL, NULL, 'live', 'standard_catalog')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, plan = EXCLUDED.plan, type = EXCLUDED.type,
  pilot_status = EXCLUDED.pilot_status, has_used_pilot = EXCLUDED.has_used_pilot,
  pilot_started_at = EXCLUDED.pilot_started_at, pilot_ended_at = EXCLUDED.pilot_ended_at,
  converted_at = EXCLUDED.converted_at,
  pilot_exception_allowed = EXCLUDED.pilot_exception_allowed,
  pilot_exception_reason = EXCLUDED.pilot_exception_reason,
  access_suspended_at = EXCLUDED.access_suspended_at,
  access_suspended_kind = EXCLUDED.access_suspended_kind,
  access_suspended_reason = EXCLUDED.access_suspended_reason,
  individual_tier_auto = EXCLUDED.individual_tier_auto,
  company_size_class = EXCLUDED.company_size_class,
  customer_stage = EXCLUDED.customer_stage,
  billing_mode = EXCLUDED.billing_mode;

-- 2) Je Organisation ein anmeldbares Konto. „Jeder Zustand ist anmeldbar" ist
--    die Abnahmebedingung des Plans — ein Zustand, in den man sich nicht
--    einloggen kann, zeigt seine Oberfläche nicht.
INSERT INTO users (id, role, email, password_hash, company_name, contact_person, is_verified, org_id, is_demo)
SELECT
  ('b3000000-0000-4000-8000-00000000c0' || o.nr)::uuid,
  o.art,
  o.mail,
  crypt(current_setting('app.seed_passwort'), gen_salt('bf', 10)),
  g.name,
  o.person,
  TRUE,
  g.id,
  TRUE
FROM (VALUES
  ('01', 'company', 'pilot-beendet@probebuehne.tempconnect.de',     'Hanna Reinhold'),
  ('02', 'company', 'pilot-uebernommen@probebuehne.tempconnect.de', 'Tobias Steen'),
  ('03', 'agency',  'pilot-gesperrt@probebuehne.tempconnect.de',    'Nadja Wolters'),
  ('04', 'company', 'pilot-ausnahme@probebuehne.tempconnect.de',    'Lars Petersen'),
  ('05', 'company', 'zahlungsausfall@probebuehne.tempconnect.de',   'Ines Falk'),
  ('06', 'agency',  'manuell-gesperrt@probebuehne.tempconnect.de',  'Rafael Ortiz'),
  ('07', 'company', 'sicherheitssperre@probebuehne.tempconnect.de', 'Clara Dorn'),
  ('08', 'company', 'kuendigung@probebuehne.tempconnect.de',        'Nils Gerber'),
  ('09', 'company', 'individuell-s@probebuehne.tempconnect.de',     'Marion Lenz'),
  ('0a', 'agency',  'individuell-l@probebuehne.tempconnect.de',     'Ferdinand Krau'),
  ('0b', 'company', 'demo-phase@probebuehne.tempconnect.de',        'Elif Sahin'),
  ('0c', 'agency',  'ablauf-drei-tage@probebuehne.tempconnect.de',  'Bernd Quast')
) AS o(nr, art, mail, person)
JOIN organizations g ON g.id = ('b3000000-0000-4000-8000-0000000000' || o.nr)::uuid
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  contact_person = EXCLUDED.contact_person,
  company_name = EXCLUDED.company_name,
  is_verified = EXCLUDED.is_verified,
  org_id = EXCLUDED.org_id,
  is_demo = EXCLUDED.is_demo;

INSERT INTO org_memberships (user_id, org_id, role_key, is_active)
SELECT u.id, u.org_id, 'owner', TRUE
  FROM users u
 WHERE u.id::text LIKE 'b3000000-0000-4000-8000-00000000c0%'
   AND u.org_id IS NOT NULL
ON CONFLICT (user_id, org_id) DO UPDATE SET
  role_key = EXCLUDED.role_key, is_active = EXCLUDED.is_active;

-- 3) Die Abonnements — hier liegen die restlichen unbesetzten Zustände.
--    `subscriptions` hängt an `user_id`, nicht an `org_id` (gemessen).
INSERT INTO subscriptions
  (user_id, plan, status, current_period_start, current_period_end,
   cancel_requested_at, cancel_at, canceled_at, cancel_source, cancel_reason)
SELECT
  ('b3000000-0000-4000-8000-00000000c0' || s.nr)::uuid,
  s.plan, s.status,
  s.beginn, s.ende,
  s.gekuendigt_am, s.endet_am, s.beendet_am, s.quelle, s.grund
FROM (VALUES
  -- past_due: war unbesetzt. Geht mit der Zahlungsausfall-Sperre einher.
  ('05', 'PLUS', 'past_due',
   (CURRENT_DATE - 25)::timestamptz, (CURRENT_DATE + 5)::timestamptz,
   NULL::timestamptz, NULL::timestamptz, NULL::timestamptz, NULL::text,
   NULL::text),
  -- canceling: war unbesetzt. Gekuendigt, laeuft aber noch bis Periodenende.
  ('08', 'PLUS', 'canceling',
   (CURRENT_DATE - 10)::timestamptz, (CURRENT_DATE + 20)::timestamptz,
   (CURRENT_DATE - 2)::timestamptz, (CURRENT_DATE + 20)::timestamptz, NULL::timestamptz,
   'self_service'::text,
   'Probebuehne Y1.3: zum Periodenende gekuendigt, Zugang laeuft noch.'::text),
  -- Abo laeuft in DREI Tagen ab: null solche Abos im Bestand.
  ('0c', 'PRO', 'active',
   (CURRENT_DATE - 27)::timestamptz, (CURRENT_DATE + 3)::timestamptz,
   NULL::timestamptz, NULL::timestamptz, NULL::timestamptz, NULL::text, NULL::text),
  -- Und je ein gewoehnliches Abo fuer die uebrigen, damit jedes Konto einen
  -- Plan traegt und nicht auf der DEMO-Vorgabe der Organisation haengt.
  ('02', 'PRO',         'active', (CURRENT_DATE - 15)::timestamptz, (CURRENT_DATE + 15)::timestamptz, NULL::timestamptz, NULL::timestamptz, NULL::timestamptz, NULL::text, NULL::text),
  ('09', 'INDIVIDUELL', 'active', (CURRENT_DATE - 15)::timestamptz, (CURRENT_DATE + 15)::timestamptz, NULL::timestamptz, NULL::timestamptz, NULL::timestamptz, NULL::text, NULL::text),
  ('0a', 'INDIVIDUELL', 'active', (CURRENT_DATE - 15)::timestamptz, (CURRENT_DATE + 15)::timestamptz, NULL::timestamptz, NULL::timestamptz, NULL::timestamptz, NULL::text, NULL::text)
) AS s(nr, plan, status, beginn, ende, gekuendigt_am, endet_am, beendet_am, quelle, grund)
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions x
   WHERE x.user_id = ('b3000000-0000-4000-8000-00000000c0' || s.nr)::uuid
);

-- Notbremse: sind nach dieser Saat wirklich alle zwoelf Zustaende besetzt? Ohne
-- diese Pruefung koennte ein Tippfehler in einem Wert die Saat erfolgreich
-- durchlaufen lassen und einen Zustand weiter unbesetzt hinterlassen - der
-- Befund waere dann "erledigt" und waere es nicht.
DO $vollstaendig$
DECLARE fehlt text[] := '{}';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE pilot_status = 'ended')      THEN fehlt := fehlt || 'pilot_status=ended'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE pilot_status = 'converted')  THEN fehlt := fehlt || 'pilot_status=converted'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE pilot_status = 'blocked')    THEN fehlt := fehlt || 'pilot_status=blocked'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE pilot_status = 'exception')  THEN fehlt := fehlt || 'pilot_status=exception'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE access_suspended_kind = 'non_payment') THEN fehlt := fehlt || 'access_suspended_kind=non_payment'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE access_suspended_kind = 'manual')      THEN fehlt := fehlt || 'access_suspended_kind=manual'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE access_suspended_kind = 'security')    THEN fehlt := fehlt || 'access_suspended_kind=security'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE individual_tier_auto = 'individuell_s') THEN fehlt := fehlt || 'individual_tier_auto=individuell_s'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE individual_tier_auto = 'individuell_l') THEN fehlt := fehlt || 'individual_tier_auto=individuell_l'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE customer_stage = 'demo')     THEN fehlt := fehlt || 'customer_stage=demo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE customer_stage = 'live')     THEN fehlt := fehlt || 'customer_stage=live'; END IF;
  IF NOT EXISTS (SELECT 1 FROM subscriptions WHERE status = 'past_due')         THEN fehlt := fehlt || 'subscriptions.status=past_due'; END IF;
  IF NOT EXISTS (SELECT 1 FROM subscriptions WHERE status = 'canceling')        THEN fehlt := fehlt || 'subscriptions.status=canceling'; END IF;
  IF NOT EXISTS (SELECT 1 FROM subscriptions WHERE current_period_end::date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7)
    THEN fehlt := fehlt || 'Abo laeuft in <=7 Tagen ab'; END IF;
  IF array_length(fehlt, 1) > 0 THEN
    RAISE EXCEPTION
      'y1-3-sonderzustaende.sql: nach der Saat sind diese Zustaende WEITER unbesetzt: %. Ein Wert oben passt nicht zum CHECK oder eine Zeile wurde nicht eingefuegt - die Saat waere wirkungslos und saehe erfolgreich aus.', array_to_string(fehlt, ', ');
  END IF;
END $vollstaendig$;

COMMIT;
