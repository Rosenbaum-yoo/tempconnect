-- =============================================================
-- Demo Timesheets Seed (DEV only)
-- Adds: 2 orgs, memberships, ENTERPRISE subscriptions, 4 demo
-- timesheets (draft / submitted / approved / rejected) with entries.
-- Login:  demo@firma.de    (company / buyer)
--         dennissss@gmail.com  (agency / supplier)
-- =============================================================

BEGIN;

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
   '2026-03-02', '2026-03-06',
   'draft', 'Aktueller Entwurf – noch in Bearbeitung.')
ON CONFLICT DO NOTHING;

-- Entries for TS-1 (Mon + Tue only, still drafting)
INSERT INTO timesheet_entries
  (timesheet_id, work_date, hours_regular, hours_overtime,
   break_minutes, shift_start, shift_end)
VALUES
  ('cccc0001-0000-0000-0000-000000000001', '2026-03-02', 8, 0, 30, '08:00', '16:30'),
  ('cccc0001-0000-0000-0000-000000000001', '2026-03-03', 8, 1, 30, '07:30', '17:00')
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
   '2026-02-23', '2026-02-27',
   'submitted', NOW() - INTERVAL '2 days',
   'aa9a57c8-ae03-476d-84e4-47e10888295b',
   'Regulaere Arbeitswoche KW09.')
ON CONFLICT DO NOTHING;

INSERT INTO timesheet_entries
  (timesheet_id, work_date, hours_regular, hours_overtime, break_minutes, shift_start, shift_end)
VALUES
  ('cccc0002-0000-0000-0000-000000000001', '2026-02-23', 8, 0, 30, '08:00', '16:30'),
  ('cccc0002-0000-0000-0000-000000000001', '2026-02-24', 8, 0, 30, '08:00', '16:30'),
  ('cccc0002-0000-0000-0000-000000000001', '2026-02-25', 8, 2, 30, '07:00', '17:30'),
  ('cccc0002-0000-0000-0000-000000000001', '2026-02-26', 8, 0, 30, '08:00', '16:30'),
  ('cccc0002-0000-0000-0000-000000000001', '2026-02-27', 8, 0, 30, '08:00', '16:30')
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
   '2026-02-16', '2026-02-20',
   'approved',
   NOW() - INTERVAL '9 days',  'aa9a57c8-ae03-476d-84e4-47e10888295b',
   NOW() - INTERVAL '7 days',  '00357101-f057-4883-b1ce-46feeac43c9c')
ON CONFLICT DO NOTHING;

INSERT INTO timesheet_entries
  (timesheet_id, work_date, hours_regular, hours_overtime, break_minutes, shift_start, shift_end)
VALUES
  ('cccc0003-0000-0000-0000-000000000001', '2026-02-16', 8, 0, 30, '08:00', '16:30'),
  ('cccc0003-0000-0000-0000-000000000001', '2026-02-17', 8, 0, 30, '08:00', '16:30'),
  ('cccc0003-0000-0000-0000-000000000001', '2026-02-18', 8, 0, 30, '08:00', '16:30'),
  ('cccc0003-0000-0000-0000-000000000001', '2026-02-19', 8, 0, 30, '08:00', '16:30'),
  ('cccc0003-0000-0000-0000-000000000001', '2026-02-20', 8, 0, 30, '08:00', '16:30')
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
   '2026-02-09', '2026-02-13',
   'rejected',
   NOW() - INTERVAL '16 days', 'aa9a57c8-ae03-476d-84e4-47e10888295b',
   NOW() - INTERVAL '14 days', '00357101-f057-4883-b1ce-46feeac43c9c',
   'Stunden fuer Freitag stimmen nicht mit dem Einsatzplan ueberein. Bitte korrigieren und erneut einreichen.')
ON CONFLICT DO NOTHING;

INSERT INTO timesheet_entries
  (timesheet_id, work_date, hours_regular, hours_overtime, break_minutes, shift_start, shift_end)
VALUES
  ('cccc0004-0000-0000-0000-000000000001', '2026-02-09', 8, 0, 30, '08:00', '16:30'),
  ('cccc0004-0000-0000-0000-000000000001', '2026-02-10', 8, 0, 30, '08:00', '16:30'),
  ('cccc0004-0000-0000-0000-000000000001', '2026-02-11', 8, 0, 30, '08:00', '16:30'),
  ('cccc0004-0000-0000-0000-000000000001', '2026-02-12', 8, 0, 30, '08:00', '16:30'),
  ('cccc0004-0000-0000-0000-000000000001', '2026-02-13', 12, 0, 30, '06:00', '18:30')
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
