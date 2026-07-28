-- 154: Benachrichtigungstyp fuer die Kunden-Sperre einer Kraft (Audit-Backlog C-9).
--
-- Warum eine eigene Migration: `notifications.type` haengt an einem CHECK-Constraint.
-- Ein neuer Typ ohne Eintrag laesst den INSERT **still** scheitern — die Benachrichtigung
-- verschwindet spurlos, das Feature wirkt gebaut und tut nichts. Diese Falle steht in
-- SKILL.md als harte Lehre; deshalb kommt der Typ hier vor dem Code.
--
-- Vollstaendige Liste aus Migration 150 uebernommen + 'worker_blocked_by_company'.
--
-- Rollback: Constraint auf die Liste aus 150 zuruecksetzen (Typ vorher aus
-- notifications loeschen, sonst schlaegt das Wiederanlegen fehl).

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'requisition_approval','requisition_filled','requisition_cancelled',
  'offer_received','offer_accepted','offer_rejected','offer_counter_received','offer_withdrawn',
  'compliance_expiring','compliance_expired','compliance_verified',
  'sla_warning','sla_breached',
  'vendor_pool_change','vendor_pool_blocked','supplier_invited','supplier_reputation_updated','distribution_stage_advanced',
  'capacity_interest','capacity_expiring','capacity_match','capacity_stale',
  'demand_match',
  'deal_offer_sent','deal_accepted','deal_confirmed','deal_completed','deal_cancelled','deal_assignment_started','deal_staffing_ready',
  'emergency_request','emergency_escalation',
  'timesheet_submitted','timesheet_approved','timesheet_rejected','timesheet_signed',
  'worker_assignment_new','worker_assignment_changed','worker_assignment_pending_confirmation','worker_assignment_confirmed','worker_assignment_declined',
  'worker_submission_correction_requested','worker_submission_accepted','worker_submission_rejected','worker_shift_reminder','worker_unavailable_reported',
  'worker_staffing_request_new','worker_staffing_request_reminder','worker_staffing_request_question',
  'worker_staffing_choice_request','worker_staffing_choice_submitted','worker_staffing_choice_declined',
  'worker_submission_submitted','worker_submission_corrected','worker_submission_sent_to_customer',
  'worker_document_verified','worker_document_rejected','worker_document_expiring','worker_document_expired',
  'worker_complaint_filed',
  -- Kunden-Sperre (neu in 154): das Einsatzunternehmen sperrt eine Kraft -> Agentur erfaehrt es aktiv
  'worker_blocked_by_company',
  'subscription_request_submitted','subscription_request_under_review','subscription_request_needs_clarification','subscription_request_offered',
  'subscription_request_accepted','subscription_request_active','subscription_request_rejected','subscription_request_cancelled',
  'subscription_request_expired','subscription_request_expiring_soon','subscription_request_activation_failed','enterprise_request_received',
  'milestone',
  'general','system'
]::text[]));

COMMENT ON CONSTRAINT notifications_type_check ON notifications IS
  'Erlaubte Benachrichtigungstypen. Neuer Typ = neue Migration, sonst scheitert der INSERT still.';
