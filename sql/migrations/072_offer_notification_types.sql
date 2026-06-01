-- Migration 072: Counterparty-first Offer Notification Types
-- Adds: offer_counter_received, offer_withdrawn to notifications type constraint.
-- Preserves ALL existing types including worker module types from migration 071.
-- Add-only. Fully backward-compatible.

BEGIN;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    -- enterprise core
    'requisition_approval','requisition_filled','requisition_cancelled',
    'offer_received','offer_accepted','offer_rejected',
    -- counterparty-first offer events (NEW)
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
    -- worker module (from migration 071)
    'worker_assignment_new','worker_assignment_changed',
    'worker_assignment_pending_confirmation',
    'worker_assignment_confirmed','worker_assignment_declined',
    'worker_submission_correction_requested',
    'worker_submission_accepted','worker_submission_rejected',
    'worker_shift_reminder',
    -- generic
    'general','system'
  ));

COMMIT;
