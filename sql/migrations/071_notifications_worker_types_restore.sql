-- Migration 071: Restore worker notification types in notifications_type_check
-- Root cause: later migration 043 overwrote the constraint and dropped worker_* types.
-- This migration keeps marketplace/deal additions and re-adds all worker notification types.

BEGIN;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type IN (
      -- enterprise core
      'requisition_approval','requisition_filled','requisition_cancelled',
      'offer_received','offer_accepted','offer_rejected',
      'compliance_expiring','compliance_expired','compliance_verified',
      'sla_warning','sla_breached',
      'vendor_pool_change','vendor_pool_blocked',
      'capacity_interest','capacity_expiring','capacity_match','capacity_stale',
      'deal_confirmed','deal_assignment_started','deal_completed',
      'supplier_invited','supplier_reputation_updated',
      'distribution_stage_advanced',
      -- marketplace mechanics (043)
      'deal_offer_sent','deal_accepted','demand_match',
      -- worker module (restored)
      'worker_assignment_new','worker_assignment_changed',
      'worker_assignment_pending_confirmation',
      'worker_assignment_confirmed','worker_assignment_declined',
      'worker_submission_correction_requested',
      'worker_submission_accepted','worker_submission_rejected',
      'worker_shift_reminder',
      -- generic
      'general','system'
    )
  );

COMMIT;

