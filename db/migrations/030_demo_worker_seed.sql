-- ============================================================
-- Migration 030: Demo-Seed Worker Self-Service Modul
-- Erzeugt: Worker-Accounts, Invites, Assignment-Links und
--          Submissions in allen Status-Werten für Demo-Zwecke.
-- Demo-Orgs: Mustermann Logistik GmbH  (aaaa0001-0000-0000-0000-000000000001)
--            Demo Zeitarbeit GmbH      (bbbb0001-0000-0000-0000-000000000001)
-- ============================================================

-- ── Hilfs-Variable: Demo Zeitarbeit Dispatcher-User ─────────
-- Wir nutzen den ersten agency-User als invited_by / actor
-- (falls kein dedizierter Admin-User existiert).

-- ── 1. Worker-Accounts (users.role = 'worker') ───────────────
INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
VALUES
  ('a1b2c3d4-0001-0000-0000-000000000001', 'max.muster@worker-demo.de',
   '$2b$10$demoHashForMaxMustermannWorkerSeedOnly.11111', 'worker', NOW(), NOW()),
  ('a1b2c3d4-0002-0000-0000-000000000002', 'anna.kraft@worker-demo.de',
   '$2b$10$demoHashForAnnaKraftWorkerSeedOnlyXXXXX.22222', 'worker', NOW(), NOW()),
  ('a1b2c3d4-0003-0000-0000-000000000003', 'lukas.bauer@worker-demo.de',
   '$2b$10$demoHashForLukasBauerWorkerSeedOnlyXXX.33333', 'worker', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ── 2. Worker-Profile ────────────────────────────────────────
-- supplier_org_id = Demo Zeitarbeit GmbH
INSERT INTO worker_profiles
  (id, user_id, supplier_org_id, first_name, last_name, personnel_number, is_active, created_at, updated_at)
VALUES
  ('b1000001-0000-0000-0000-000000000001',
   'a1b2c3d4-0001-0000-0000-000000000001',
   'bbbb0001-0000-0000-0000-000000000001',
   'Max', 'Mustermann', 'W-0001', TRUE, NOW(), NOW()),
  ('b1000001-0000-0000-0000-000000000002',
   'a1b2c3d4-0002-0000-0000-000000000002',
   'bbbb0001-0000-0000-0000-000000000001',
   'Anna', 'Kraft', 'W-0002', TRUE, NOW(), NOW()),
  ('b1000001-0000-0000-0000-000000000003',
   'a1b2c3d4-0003-0000-0000-000000000003',
   'bbbb0001-0000-0000-0000-000000000001',
   'Lukas', 'Bauer', 'W-0003', FALSE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ── 3. org_memberships für Worker ───────────────────────────
INSERT INTO org_memberships (id, user_id, org_id, role_key, created_at, updated_at)
VALUES
  ('c1000001-0000-0000-0000-000000000001',
   'a1b2c3d4-0001-0000-0000-000000000001',
   'bbbb0001-0000-0000-0000-000000000001', 'worker', NOW(), NOW()),
  ('c1000001-0000-0000-0000-000000000002',
   'a1b2c3d4-0002-0000-0000-000000000002',
   'bbbb0001-0000-0000-0000-000000000001', 'worker', NOW(), NOW()),
  ('c1000001-0000-0000-0000-000000000003',
   'a1b2c3d4-0003-0000-0000-000000000003',
   'bbbb0001-0000-0000-0000-000000000001', 'worker', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ── 4. Invite-Tokens ─────────────────────────────────────────
-- invited_by = erster agency-User der Demo Zeitarbeit GmbH
INSERT INTO worker_invites
  (id, supplier_org_id, email, first_name, last_name, token, token_hash,
   invited_by, worker_user_id, status, created_at, expires_at)
VALUES
  ('d1000001-0000-0000-0000-000000000001',
   'bbbb0001-0000-0000-0000-000000000001',
   'max.muster@worker-demo.de', 'Max', 'Mustermann',
   'demo-invite-max-0001', encode(sha256('demo-invite-max-0001'::bytea), 'hex'),
   (SELECT id FROM users WHERE role='agency' LIMIT 1),
   'a1b2c3d4-0001-0000-0000-000000000001',
   'accepted', NOW() - INTERVAL '3 days', NOW() + INTERVAL '7 days'),
  ('d1000001-0000-0000-0000-000000000002',
   'bbbb0001-0000-0000-0000-000000000001',
   'new.worker@pending-demo.de', 'Petra', 'Neu',
   'demo-invite-pending-0002', encode(sha256('demo-invite-pending-0002'::bytea), 'hex'),
   (SELECT id FROM users WHERE role='agency' LIMIT 1),
   NULL,
   'pending', NOW(), NOW() + INTERVAL '7 days')
ON CONFLICT (id) DO NOTHING;

-- ── 5. Demo-Assignment (Einsatz Mustermann Logistik) ─────────
-- Wir legen 2 Assignments an: einen aktiven und einen beendeten.
INSERT INTO assignments
  (id, org_id, supplier_org_id, worker_description, worker_count,
   start_date, planned_end_date, hourly_rate_cents, status, created_at, updated_at)
VALUES
  ('e1000001-0000-0000-0000-000000000001',
   'aaaa0001-0000-0000-0000-000000000001',
   'bbbb0001-0000-0000-0000-000000000001',
   'Kommissionierer / Staplerfahrer Lager Nord', 2,
   '2025-01-06', '2025-06-30', 1850, 'active', NOW(), NOW()),
  ('e1000001-0000-0000-0000-000000000002',
   'aaaa0001-0000-0000-0000-000000000001',
   'bbbb0001-0000-0000-0000-000000000001',
   'Lagerhelfer Nachtschicht', 1,
   '2025-01-15', '2025-03-31', 1600, 'completed', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ── 6. Worker-Assignment-Links ───────────────────────────────
INSERT INTO worker_assignment_links
  (id, worker_user_id, assignment_id, org_id, supplier_org_id,
   role, start_date, is_active, created_at, updated_at)
VALUES
  ('f1000001-0000-0000-0000-000000000001',
   'a1b2c3d4-0001-0000-0000-000000000001',
   'e1000001-0000-0000-0000-000000000001',
   'aaaa0001-0000-0000-0000-000000000001',
   'bbbb0001-0000-0000-0000-000000000001',
   'primary', '2025-01-06', TRUE, NOW(), NOW()),
  ('f1000001-0000-0000-0000-000000000002',
   'a1b2c3d4-0002-0000-0000-000000000002',
   'e1000001-0000-0000-0000-000000000001',
   'aaaa0001-0000-0000-0000-000000000001',
   'bbbb0001-0000-0000-0000-000000000001',
   'primary', '2025-02-01', TRUE, NOW(), NOW()),
  ('f1000001-0000-0000-0000-000000000003',
   'a1b2c3d4-0003-0000-0000-000000000003',
   'e1000001-0000-0000-0000-000000000002',
   'aaaa0001-0000-0000-0000-000000000001',
   'bbbb0001-0000-0000-0000-000000000001',
   'primary', '2025-01-15', FALSE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ── 7. Submissions in ALLEN Status-Zuständen ─────────────────

-- 7a. DRAFT — Max, KW 13
INSERT INTO worker_time_submissions
  (id, worker_user_id, worker_assignment_link_id, org_id, supplier_org_id,
   week_start, week_end, status, total_hours, overtime_hours, created_at, updated_at)
VALUES (
  '10000001-0000-0000-0000-000000000001',
  'a1b2c3d4-0001-0000-0000-000000000001',
  'f1000001-0000-0000-0000-000000000001',
  'aaaa0001-0000-0000-0000-000000000001',
  'bbbb0001-0000-0000-0000-000000000001',
  '2025-03-24', '2025-03-30', 'draft', 32.0, 0.0, NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

-- 7b. SUBMITTED — Anna, KW 12
INSERT INTO worker_time_submissions
  (id, worker_user_id, worker_assignment_link_id, org_id, supplier_org_id,
   week_start, week_end, status, total_hours, overtime_hours,
   submitted_at, submitted_by, created_at, updated_at)
VALUES (
  '10000001-0000-0000-0000-000000000002',
  'a1b2c3d4-0002-0000-0000-000000000002',
  'f1000001-0000-0000-0000-000000000002',
  'aaaa0001-0000-0000-0000-000000000001',
  'bbbb0001-0000-0000-0000-000000000001',
  '2025-03-17', '2025-03-23', 'submitted', 40.0, 0.0,
  NOW() - INTERVAL '1 day',
  'a1b2c3d4-0002-0000-0000-000000000002',
  NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'
) ON CONFLICT (id) DO NOTHING;

-- 7c. UNDER_REVIEW — Max, KW 11
INSERT INTO worker_time_submissions
  (id, worker_user_id, worker_assignment_link_id, org_id, supplier_org_id,
   week_start, week_end, status, total_hours, overtime_hours,
   submitted_at, submitted_by, reviewed_at, reviewed_by, created_at, updated_at)
VALUES (
  '10000001-0000-0000-0000-000000000003',
  'a1b2c3d4-0001-0000-0000-000000000001',
  'f1000001-0000-0000-0000-000000000001',
  'aaaa0001-0000-0000-0000-000000000001',
  'bbbb0001-0000-0000-0000-000000000001',
  '2025-03-10', '2025-03-16', 'under_review', 38.5, 0.0,
  NOW() - INTERVAL '5 days', 'a1b2c3d4-0001-0000-0000-000000000001',
  NOW() - INTERVAL '4 days', (SELECT id FROM users WHERE role='agency' LIMIT 1),
  NOW() - INTERVAL '6 days', NOW() - INTERVAL '4 days'
) ON CONFLICT (id) DO NOTHING;

-- 7d. NEEDS_CORRECTION — Anna, KW 10
INSERT INTO worker_time_submissions
  (id, worker_user_id, worker_assignment_link_id, org_id, supplier_org_id,
   week_start, week_end, status, total_hours, overtime_hours,
   submitted_at, submitted_by, correction_note, created_at, updated_at)
VALUES (
  '10000001-0000-0000-0000-000000000004',
  'a1b2c3d4-0002-0000-0000-000000000002',
  'f1000001-0000-0000-0000-000000000002',
  'aaaa0001-0000-0000-0000-000000000001',
  'bbbb0001-0000-0000-0000-000000000001',
  '2025-03-03', '2025-03-09', 'needs_correction', 42.0, 2.0,
  NOW() - INTERVAL '9 days', 'a1b2c3d4-0002-0000-0000-000000000002',
  'Bitte Montag-Stunden überprüfen – Schicht endete laut Dienstplan um 14:00 Uhr.',
  NOW() - INTERVAL '10 days', NOW() - INTERVAL '7 days'
) ON CONFLICT (id) DO NOTHING;

-- 7e. ACCEPTED_INTO_TIMESHEET — Max, KW 9
INSERT INTO worker_time_submissions
  (id, worker_user_id, worker_assignment_link_id, org_id, supplier_org_id,
   week_start, week_end, status, total_hours, overtime_hours,
   submitted_at, submitted_by, accepted_at, accepted_by, created_at, updated_at)
VALUES (
  '10000001-0000-0000-0000-000000000005',
  'a1b2c3d4-0001-0000-0000-000000000001',
  'f1000001-0000-0000-0000-000000000001',
  'aaaa0001-0000-0000-0000-000000000001',
  'bbbb0001-0000-0000-0000-000000000001',
  '2025-02-24', '2025-03-02', 'accepted_into_timesheet', 40.0, 0.0,
  NOW() - INTERVAL '14 days', 'a1b2c3d4-0001-0000-0000-000000000001',
  NOW() - INTERVAL '12 days', (SELECT id FROM users WHERE role='agency' LIMIT 1),
  NOW() - INTERVAL '15 days', NOW() - INTERVAL '12 days'
) ON CONFLICT (id) DO NOTHING;

-- 7f. REJECTED — Lukas, KW 8
INSERT INTO worker_time_submissions
  (id, worker_user_id, worker_assignment_link_id, org_id, supplier_org_id,
   week_start, week_end, status, total_hours, overtime_hours,
   submitted_at, submitted_by, rejected_at, rejected_by, reviewer_comment, created_at, updated_at)
VALUES (
  '10000001-0000-0000-0000-000000000006',
  'a1b2c3d4-0003-0000-0000-000000000003',
  'f1000001-0000-0000-0000-000000000003',
  'aaaa0001-0000-0000-0000-000000000001',
  'bbbb0001-0000-0000-0000-000000000001',
  '2025-02-17', '2025-02-23', 'rejected', 25.0, 0.0,
  NOW() - INTERVAL '20 days', 'a1b2c3d4-0003-0000-0000-000000000003',
  NOW() - INTERVAL '18 days', (SELECT id FROM users WHERE role='agency' LIMIT 1),
  'Einsatz wurde vorzeitig beendet – Einreichung nicht relevant.',
  NOW() - INTERVAL '22 days', NOW() - INTERVAL '18 days'
) ON CONFLICT (id) DO NOTHING;

-- ── 8. Tageseinträge ─────────────────────────────────────────

-- Einträge für Submission 7b (submitted, Anna KW 12)
INSERT INTO worker_time_submission_entries
  (id, submission_id, work_date, hours_regular, hours_overtime, break_minutes, shift_start, shift_end)
VALUES
  ('20000001-b002-0000-0000-000000000001', '10000001-0000-0000-0000-000000000002', '2025-03-17', 8.0, 0, 30, '07:00', '15:30'),
  ('20000001-b002-0000-0000-000000000002', '10000001-0000-0000-0000-000000000002', '2025-03-18', 8.0, 0, 30, '07:00', '15:30'),
  ('20000001-b002-0000-0000-000000000003', '10000001-0000-0000-0000-000000000002', '2025-03-19', 8.0, 0, 30, '07:00', '15:30'),
  ('20000001-b002-0000-0000-000000000004', '10000001-0000-0000-0000-000000000002', '2025-03-20', 8.0, 0, 30, '07:00', '15:30'),
  ('20000001-b002-0000-0000-000000000005', '10000001-0000-0000-0000-000000000002', '2025-03-21', 8.0, 0, 30, '07:00', '15:30')
ON CONFLICT (id) DO NOTHING;

-- Einträge für Submission 7c (under_review, Max KW 11)
INSERT INTO worker_time_submission_entries
  (id, submission_id, work_date, hours_regular, hours_overtime, break_minutes, shift_start, shift_end)
VALUES
  ('20000001-b003-0000-0000-000000000001', '10000001-0000-0000-0000-000000000003', '2025-03-10', 8.0, 0, 45, '06:00', '15:00'),
  ('20000001-b003-0000-0000-000000000002', '10000001-0000-0000-0000-000000000003', '2025-03-11', 8.0, 0, 45, '06:00', '15:00'),
  ('20000001-b003-0000-0000-000000000003', '10000001-0000-0000-0000-000000000003', '2025-03-12', 7.5, 0, 30, '06:00', '13:30'),
  ('20000001-b003-0000-0000-000000000004', '10000001-0000-0000-0000-000000000003', '2025-03-13', 7.5, 0, 30, '06:00', '13:30'),
  ('20000001-b003-0000-0000-000000000005', '10000001-0000-0000-0000-000000000003', '2025-03-14', 7.5, 0, 30, '06:00', '13:30')
ON CONFLICT (id) DO NOTHING;

-- Einträge für Submission 7d (needs_correction, Anna KW 10)
INSERT INTO worker_time_submission_entries
  (id, submission_id, work_date, hours_regular, hours_overtime, break_minutes, shift_start, shift_end)
VALUES
  ('20000001-b004-0000-0000-000000000001', '10000001-0000-0000-0000-000000000004', '2025-03-03', 10.0, 2.0, 30, '07:00', '17:30'),
  ('20000001-b004-0000-0000-000000000002', '10000001-0000-0000-0000-000000000004', '2025-03-04',  8.0, 0.0, 30, '07:00', '15:30'),
  ('20000001-b004-0000-0000-000000000003', '10000001-0000-0000-0000-000000000004', '2025-03-05',  8.0, 0.0, 30, '07:00', '15:30'),
  ('20000001-b004-0000-0000-000000000004', '10000001-0000-0000-0000-000000000004', '2025-03-06',  8.0, 0.0, 30, '07:00', '15:30'),
  ('20000001-b004-0000-0000-000000000005', '10000001-0000-0000-0000-000000000004', '2025-03-07',  8.0, 0.0, 30, '07:00', '15:30')
ON CONFLICT (id) DO NOTHING;

-- ── 9. Audit-Events ──────────────────────────────────────────
INSERT INTO worker_submission_events (id, submission_id, event_type, actor_id, note, created_at)
VALUES
  ('30000001-0000-0000-0000-000000000001',
   '10000001-0000-0000-0000-000000000002', 'submitted',
   'a1b2c3d4-0002-0000-0000-000000000002', NULL, NOW() - INTERVAL '1 day'),
  ('30000001-0000-0000-0000-000000000002',
   '10000001-0000-0000-0000-000000000003', 'submitted',
   'a1b2c3d4-0001-0000-0000-000000000001', NULL, NOW() - INTERVAL '5 days'),
  ('30000001-0000-0000-0000-000000000003',
   '10000001-0000-0000-0000-000000000003', 'review_started',
   (SELECT id FROM users WHERE role='agency' LIMIT 1),
   NULL, NOW() - INTERVAL '4 days'),
  ('30000001-0000-0000-0000-000000000004',
   '10000001-0000-0000-0000-000000000004', 'correction_requested',
   (SELECT id FROM users WHERE role='agency' LIMIT 1),
   'Bitte Montag-Stunden überprüfen', NOW() - INTERVAL '7 days'),
  ('30000001-0000-0000-0000-000000000005',
   '10000001-0000-0000-0000-000000000005', 'accepted',
   (SELECT id FROM users WHERE role='agency' LIMIT 1),
   NULL, NOW() - INTERVAL '12 days'),
  ('30000001-0000-0000-0000-000000000006',
   '10000001-0000-0000-0000-000000000006', 'rejected',
   (SELECT id FROM users WHERE role='agency' LIMIT 1),
   'Einsatz vorzeitig beendet', NOW() - INTERVAL '18 days')
ON CONFLICT (id) DO NOTHING;

-- ── 10. Billing-Snapshot ─────────────────────────────────────
INSERT INTO worker_billing_snapshots
  (id, org_id, snapshot_month, active_workers, active_seats, submitted_ts, approved_ts, plan, created_at)
VALUES (
  '40000001-0000-0000-0000-000000000001',
  'bbbb0001-0000-0000-0000-000000000001',
  TO_CHAR(CURRENT_DATE, 'YYYY-MM'),
  2, 3, 6, 1, 'NOTDIENST', NOW()
) ON CONFLICT (id) DO NOTHING;

-- ── Ende Migration 030 ───────────────────────────────────────
