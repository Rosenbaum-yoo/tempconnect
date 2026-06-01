-- =============================================================================
-- Migration 076: Worker Document Expiry Steering
-- Adds reminder state for worker proofs and registers dedicated worker document
-- notification types for verification, rejection and deadline steering.
-- =============================================================================

BEGIN;

ALTER TABLE worker_profile_documents
  ADD COLUMN IF NOT EXISTS expiry_reminder_sent_at TIMESTAMPTZ;

ALTER TABLE worker_profile_documents
  ADD COLUMN IF NOT EXISTS expiry_notice_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS worker_profile_documents_deadline_idx
  ON worker_profile_documents(status, valid_until)
  WHERE status = 'verified' AND valid_until IS NOT NULL;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type IN (
      -- enterprise core
      'requisition_approval','requisition_filled','requisition_cancelled',
      'offer_received','offer_accepted','offer_rejected',
      'offer_counter_received','offer_withdrawn',
      'compliance_expiring','compliance_expired','compliance_verified',
      'sla_warning','sla_breached',
      'vendor_pool_change','vendor_pool_blocked',
      'capacity_interest','capacity_expiring','capacity_match','capacity_stale',
      'deal_confirmed','deal_assignment_started','deal_completed',
      'deal_offer_sent','deal_accepted',
      'demand_match',
      'supplier_invited','supplier_reputation_updated',
      'distribution_stage_advanced',
      -- worker module
      'worker_assignment_new','worker_assignment_changed',
      'worker_assignment_pending_confirmation',
      'worker_assignment_confirmed','worker_assignment_declined',
      'worker_submission_correction_requested',
      'worker_submission_accepted','worker_submission_rejected',
      'worker_shift_reminder',
      'worker_unavailable_reported',
      'worker_submission_submitted',
      'worker_submission_corrected',
      'worker_submission_sent_to_customer',
      -- NEW: worker document steering
      'worker_document_verified',
      'worker_document_rejected',
      'worker_document_expiring',
      'worker_document_expired',
      -- generic
      'general','system'
    )
  );

COMMIT;
