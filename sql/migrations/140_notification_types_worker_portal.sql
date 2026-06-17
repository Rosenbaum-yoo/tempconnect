-- 140_notification_types_worker_portal.sql
-- Schliesst die Drift zwischen workerNotificationService.notifyWorker() und dem
-- notifications.type CHECK-Constraint. 13 worker_* Typen werden bereits emittiert
-- (Einsatzportal: Staffing-Anfragen, Auswahl, Stundenzettel-Status, Dokument-Pruefung),
-- fehlten aber im Constraint -> der INSERT scheiterte mit notifications_type_check und
-- der Service degradierte still auf type='general' (Backstop in notifyWorker bleibt
-- erhalten, greift nun aber nur noch bei echtem Schema-Drift):
--   worker_staffing_request_new        (notifyStaffingRequestNew)
--   worker_staffing_request_reminder   (notifyStaffingRequestReminder)
--   worker_staffing_request_question   (notifyStaffingQuestionToDispatcher)
--   worker_staffing_choice_request     (notifyStaffingChoiceRequest)
--   worker_staffing_choice_submitted   (notifyStaffingChoiceSubmittedToDispatcher)
--   worker_staffing_choice_declined    (notifyStaffingChoiceDeclinedToDispatcher)
--   worker_submission_submitted        (notifySubmissionSubmitted)
--   worker_submission_corrected        (notifySubmissionCorrected)
--   worker_submission_sent_to_customer (notifySubmissionSentToCustomer)
--   worker_document_verified           (notifyWorkerDocumentVerified)
--   worker_document_rejected           (notifyWorkerDocumentRejected)
--   worker_document_expiring           (notifyWorkerDocumentExpiring)
--   worker_document_expired            (notifyWorkerDocumentExpired)
-- Diese Typen haben KEINE enterprise.html-Hub-Card-Surface (Einsatzportal nutzt
-- eigene Seiten) -> notificationSurfaceMap.surfaceForType() -> null = bell-only.
-- Additiv + idempotent (DROP IF EXISTS + ADD). Rollback: Constraint erneut droppen
-- und ohne die 13 Typen neu setzen (kein Datenverlust, da nur Wertebereich erweitert
-- wird). Aufbauend auf 139; bestehende Typen unveraendert uebernommen.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  -- Requisitions
  'requisition_approval','requisition_filled','requisition_cancelled',
  -- Offers
  'offer_received','offer_accepted','offer_rejected','offer_counter_received','offer_withdrawn',
  -- Compliance / Trust Center
  'compliance_expiring','compliance_expired','compliance_verified',
  -- SLA / Mein Unternehmen
  'sla_warning','sla_breached',
  -- Vendor Pool
  'vendor_pool_change','vendor_pool_blocked','supplier_invited','supplier_reputation_updated','distribution_stage_advanced',
  -- Capacity / Demand (Marktplatz)
  'capacity_interest','capacity_expiring','capacity_match','capacity_stale','demand_match',
  -- Deal-Lifecycle
  'deal_offer_sent','deal_accepted','deal_confirmed','deal_assignment_started','deal_completed','deal_cancelled',
  -- Worker / Disponent — Assignments (Bestand)
  'worker_assignment_new','worker_assignment_changed','worker_assignment_pending_confirmation','worker_assignment_confirmed','worker_assignment_declined',
  'worker_submission_correction_requested','worker_submission_accepted','worker_submission_rejected','worker_shift_reminder','worker_unavailable_reported',
  -- Worker / Disponent — Staffing-Anfragen + Auswahl (neu in 140)
  'worker_staffing_request_new','worker_staffing_request_reminder','worker_staffing_request_question',
  'worker_staffing_choice_request','worker_staffing_choice_submitted','worker_staffing_choice_declined',
  -- Worker / Disponent — Stundenzettel-Workflow + Dokument-Pruefung (neu in 140)
  'worker_submission_submitted','worker_submission_corrected','worker_submission_sent_to_customer',
  'worker_document_verified','worker_document_rejected','worker_document_expiring','worker_document_expired',
  -- Subscription / Plan
  'subscription_request_submitted','subscription_request_under_review','subscription_request_needs_clarification','subscription_request_offered',
  'subscription_request_accepted','subscription_request_active','subscription_request_rejected','subscription_request_cancelled',
  'subscription_request_expired','subscription_request_expiring_soon','subscription_request_activation_failed','enterprise_request_received',
  -- Gamification
  'milestone',
  -- Catch-all
  'general','system'
]::text[]));
