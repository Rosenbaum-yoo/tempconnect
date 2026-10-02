-- =============================================================
-- Demo Timesheets Seed (DEV only)
-- Adds: 2 orgs, memberships, ENTERPRISE subscriptions, 4 demo
-- timesheets (draft / submitted / approved / rejected) with entries.
-- Login:  demo@firma.de    (company / buyer)
--         dennissss@gmail.com  (agency / supplier)
-- =============================================================

-- ── RELATIVE WOCHEN (2026-10-02) ──────────────────────────────────────────────
-- Diese Saat trug 25 FESTE Daten: vier Wochen im Februar/Maerz 2026. Die
-- Kommentare sagten dabei immer schon "current week" / "last week" - gemeint war
-- also von Anfang an relativ, implementiert war absolut. Am 2026-10-02 zeigte die
-- Verkaufsdemo damit sieben Monate alte Stundenzettel, und zwar LAUTLOS: ein
-- fester Wert wird nicht falsch, er wird nur jeden Tag unwahrer.
--
-- Jetzt rechnet die Datei: date_trunc('week', CURRENT_DATE) ist der Montag der
-- laufenden Woche (ISO, Montag zuerst - passt zu DACH). Die vier Zettel liegen
-- bei 0, -7, -14 und -21 Tagen, die Eintraege Mo-Fr darin.
--
-- Erzwungen von api/test/probebuehneBesetzung.test.js (Y6.2): kein festes Datum
-- in IRGENDEINER Saat. Die Probe liest das VERZEICHNIS, nicht eine Datei - eine
-- neue Saat mit festem Datum kommt daran nicht vorbei.
--
-- Zur Zeitzone: CURRENT_DATE erbt die Zone der Datenbank. Das ist ein bekannter,
-- eigener Punkt (todayDE() schuetzt nur JS-Pfade) und betrifft hier allenfalls
-- einen Tag am Wochenanfang - fuer eine Demo-Woche ohne Belang.
-- ─────────────────────────────────────────────────────────────────────────────

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
      'demo-timesheets.sql: SEED_DEMO_WORLD nicht aktiv - Saat verweigert. Anmeldbare Demo-Konten entstehen nur mit ausdruecklich gesetztem Schalter (prod-sicher).';
  END IF;
END $sperre_saat$;
-- ──────────────────────────────────────────────────────────────────────────────


-- 1) Orgs ------------------------------------------------------
INSERT INTO organizations (id, name, slug, type, plan, billing_email, is_active)
VALUES
  ('aaaa0001-0000-0000-0000-000000000001',
   'Mustermann Logistik GmbH', 'mustermann-logistik', 'company', 'ENTERPRISE',
   'billing@mustermann-logistik.de', true),
  ('bbbb0001-0000-0000-0000-000000000001',
   'Demo Zeitarbeit GmbH',     'demo-zeitarbeit',     'agency',   'ENTERPRISE',
   'billing@demo-zeitarbeit.de',     true)
ON CONFLICT (id) DO NOTHING;

-- 2) Org-Memberships -------------------------------------------
--    demo@firma.de        -> buyer org as owner
--    dennissss@gmail.com  -> supplier org as owner
INSERT INTO org_memberships (user_id, org_id, role_key, is_active)
VALUES
  ('00357101-f057-4883-b1ce-46feeac43c9c',
   'aaaa0001-0000-0000-0000-000000000001', 'owner', true),
  ('aa9a57c8-ae03-476d-84e4-47e10888295b',
   'bbbb0001-0000-0000-0000-000000000001', 'owner', true)
ON CONFLICT (user_id, org_id) DO NOTHING;

-- 3) ENTERPRISE Subscriptions ----------------------------------
INSERT INTO subscriptions (user_id, plan, status)
VALUES
  ('00357101-f057-4883-b1ce-46feeac43c9c', 'ENTERPRISE', 'active'),
  ('aa9a57c8-ae03-476d-84e4-47e10888295b', 'ENTERPRISE', 'active')
ON CONFLICT DO NOTHING;

-- 4) Demo Timesheets -------------------------------------------
-- TS-1: DRAFT  (current week)
INSERT INTO timesheets
  (id, org_id, supplier_org_id, worker_name, worker_identifier,
   week_start, week_end, status, notes)
VALUES
  ('cccc0001-0000-0000-0000-000000000001',
   'aaaa0001-0000-0000-0000-000000000001',
   'bbbb0001-0000-0000-0000-000000000001',
   'Max Mustermann', 'MA-1001',
   date_trunc('week', CURRENT_DATE)::date, (date_trunc('week', CURRENT_DATE)::date + 4),
   'draft', 'Aktueller Entwurf – noch in Bearbeitung.')
ON CONFLICT DO NOTHING;

-- Entries for TS-1 (Mon + Tue only, still drafting)
INSERT INTO timesheet_entries
  (timesheet_id, work_date, hours_regular, hours_overtime,
   break_minutes, shift_start, shift_end)
VALUES
  ('cccc0001-0000-0000-0000-000000000001', date_trunc('week', CURRENT_DATE)::date, 8, 0, 30, '08:00', '16:30'),
  ('cccc0001-0000-0000-0000-000000000001', (date_trunc('week', CURRENT_DATE)::date + 1), 8, 1, 30, '07:30', '17:00')
ON CONFLICT DO NOTHING;

-- Recalc totals for TS-1
UPDATE timesheets SET
  total_hours    = (SELECT COALESCE(SUM(hours_regular + hours_overtime), 0) FROM timesheet_entries WHERE timesheet_id = 'cccc0001-0000-0000-0000-000000000001'),
  overtime_hours = (SELECT COALESCE(SUM(hours_overtime), 0)                 FROM timesheet_entries WHERE timesheet_id = 'cccc0001-0000-0000-0000-000000000001')
WHERE id = 'cccc0001-0000-0000-0000-000000000001';

-- TS-2: SUBMITTED  (last week – Mon 2026-02-23)
INSERT INTO timesheets
  (id, org_id, supplier_org_id, worker_name, worker_identifier,
   week_start, week_end, status, submitted_at,
   submitted_by, notes)
VALUES
  ('cccc0002-0000-0000-0000-000000000001',
   'aaaa0001-0000-0000-0000-000000000001',
   'bbbb0001-0000-0000-0000-000000000001',
   'Erika Schmidt', 'MA-1002',
   (date_trunc('week', CURRENT_DATE)::date - 7), (date_trunc('week', CURRENT_DATE)::date - 3),
   'submitted', NOW() - INTERVAL '2 days',
   'aa9a57c8-ae03-476d-84e4-47e10888295b',
   'Regulaere Arbeitswoche KW09.')
ON CONFLICT DO NOTHING;

INSERT INTO timesheet_entries
  (timesheet_id, work_date, hours_regular, hours_overtime, break_minutes, shift_start, shift_end)
VALUES
  ('cccc0002-0000-0000-0000-000000000001', (date_trunc('week', CURRENT_DATE)::date - 7), 8, 0, 30, '08:00', '16:30'),
  ('cccc0002-0000-0000-0000-000000000001', (date_trunc('week', CURRENT_DATE)::date - 6), 8, 0, 30, '08:00', '16:30'),
  ('cccc0002-0000-0000-0000-000000000001', (date_trunc('week', CURRENT_DATE)::date - 5), 8, 2, 30, '07:00', '17:30'),
  ('cccc0002-0000-0000-0000-000000000001', (date_trunc('week', CURRENT_DATE)::date - 4), 8, 0, 30, '08:00', '16:30'),
  ('cccc0002-0000-0000-0000-000000000001', (date_trunc('week', CURRENT_DATE)::date - 3), 8, 0, 30, '08:00', '16:30')
ON CONFLICT DO NOTHING;

UPDATE timesheets SET
  total_hours    = (SELECT COALESCE(SUM(hours_regular + hours_overtime), 0) FROM timesheet_entries WHERE timesheet_id = 'cccc0002-0000-0000-0000-000000000001'),
  overtime_hours = (SELECT COALESCE(SUM(hours_overtime), 0)                 FROM timesheet_entries WHERE timesheet_id = 'cccc0002-0000-0000-0000-000000000001')
WHERE id = 'cccc0002-0000-0000-0000-000000000001';

-- TS-3: APPROVED  (2 weeks ago – Mon 2026-02-16)
INSERT INTO timesheets
  (id, org_id, supplier_org_id, worker_name, worker_identifier,
   week_start, week_end, status, submitted_at, submitted_by,
   approved_at, approved_by)
VALUES
  ('cccc0003-0000-0000-0000-000000000001',
   'aaaa0001-0000-0000-0000-000000000001',
   'bbbb0001-0000-0000-0000-000000000001',
   'Hans Weber', 'MA-1003',
   (date_trunc('week', CURRENT_DATE)::date - 14), (date_trunc('week', CURRENT_DATE)::date - 10),
   'approved',
   NOW() - INTERVAL '9 days',  'aa9a57c8-ae03-476d-84e4-47e10888295b',
   NOW() - INTERVAL '7 days',  '00357101-f057-4883-b1ce-46feeac43c9c')
ON CONFLICT DO NOTHING;

INSERT INTO timesheet_entries
  (timesheet_id, work_date, hours_regular, hours_overtime, break_minutes, shift_start, shift_end)
VALUES
  ('cccc0003-0000-0000-0000-000000000001', (date_trunc('week', CURRENT_DATE)::date - 14), 8, 0, 30, '08:00', '16:30'),
  ('cccc0003-0000-0000-0000-000000000001', (date_trunc('week', CURRENT_DATE)::date - 13), 8, 0, 30, '08:00', '16:30'),
  ('cccc0003-0000-0000-0000-000000000001', (date_trunc('week', CURRENT_DATE)::date - 12), 8, 0, 30, '08:00', '16:30'),
  ('cccc0003-0000-0000-0000-000000000001', (date_trunc('week', CURRENT_DATE)::date - 11), 8, 0, 30, '08:00', '16:30'),
  ('cccc0003-0000-0000-0000-000000000001', (date_trunc('week', CURRENT_DATE)::date - 10), 8, 0, 30, '08:00', '16:30')
ON CONFLICT DO NOTHING;

UPDATE timesheets SET
  total_hours    = (SELECT COALESCE(SUM(hours_regular + hours_overtime), 0) FROM timesheet_entries WHERE timesheet_id = 'cccc0003-0000-0000-0000-000000000001'),
  overtime_hours = (SELECT COALESCE(SUM(hours_overtime), 0)                 FROM timesheet_entries WHERE timesheet_id = 'cccc0003-0000-0000-0000-000000000001')
WHERE id = 'cccc0003-0000-0000-0000-000000000001';

-- TS-4: REJECTED  (3 weeks ago – Mon 2026-02-09)
INSERT INTO timesheets
  (id, org_id, supplier_org_id, worker_name, worker_identifier,
   week_start, week_end, status, submitted_at, submitted_by,
   rejected_at, rejected_by, rejection_reason)
VALUES
  ('cccc0004-0000-0000-0000-000000000001',
   'aaaa0001-0000-0000-0000-000000000001',
   'bbbb0001-0000-0000-0000-000000000001',
   'Lisa Müller', 'MA-1004',
   (date_trunc('week', CURRENT_DATE)::date - 21), (date_trunc('week', CURRENT_DATE)::date - 17),
   'rejected',
   NOW() - INTERVAL '16 days', 'aa9a57c8-ae03-476d-84e4-47e10888295b',
   NOW() - INTERVAL '14 days', '00357101-f057-4883-b1ce-46feeac43c9c',
   'Stunden fuer Freitag stimmen nicht mit dem Einsatzplan ueberein. Bitte korrigieren und erneut einreichen.')
ON CONFLICT DO NOTHING;

INSERT INTO timesheet_entries
  (timesheet_id, work_date, hours_regular, hours_overtime, break_minutes, shift_start, shift_end)
VALUES
  ('cccc0004-0000-0000-0000-000000000001', (date_trunc('week', CURRENT_DATE)::date - 21), 8, 0, 30, '08:00', '16:30'),
  ('cccc0004-0000-0000-0000-000000000001', (date_trunc('week', CURRENT_DATE)::date - 20), 8, 0, 30, '08:00', '16:30'),
  ('cccc0004-0000-0000-0000-000000000001', (date_trunc('week', CURRENT_DATE)::date - 19), 8, 0, 30, '08:00', '16:30'),
  ('cccc0004-0000-0000-0000-000000000001', (date_trunc('week', CURRENT_DATE)::date - 18), 8, 0, 30, '08:00', '16:30'),
  ('cccc0004-0000-0000-0000-000000000001', (date_trunc('week', CURRENT_DATE)::date - 17), 12, 0, 30, '06:00', '18:30')
ON CONFLICT DO NOTHING;

UPDATE timesheets SET
  total_hours    = (SELECT COALESCE(SUM(hours_regular + hours_overtime), 0) FROM timesheet_entries WHERE timesheet_id = 'cccc0004-0000-0000-0000-000000000001'),
  overtime_hours = (SELECT COALESCE(SUM(hours_overtime), 0)                 FROM timesheet_entries WHERE timesheet_id = 'cccc0004-0000-0000-0000-000000000001')
WHERE id = 'cccc0004-0000-0000-0000-000000000001';

COMMIT;

-- Quick verification
SELECT status, worker_name, week_start, total_hours
FROM timesheets
WHERE org_id = 'aaaa0001-0000-0000-0000-000000000001'
ORDER BY week_start DESC;
