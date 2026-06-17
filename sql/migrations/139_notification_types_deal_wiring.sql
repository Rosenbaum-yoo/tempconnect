-- 139_notification_types_deal_wiring.sql
-- Schliesst die Drift zwischen notificationMatrix/Surface-Map und dem
-- notifications.type CHECK-Constraint. Vier Typen werden bereits dispatched bzw.
-- gemappt, fehlten aber im Constraint -> die INSERTs scheiterten still:
--   * offer_counter_received  (marketplace.js offer.countered  -> Matrix :77, Surface deals)
--   * offer_withdrawn         (marketplace.js offer.withdrawn   -> Matrix :84, Surface deals)
--   * deal_cancelled          (marketplace.js deal.agreement_cancelled, Surface deals)
--   * milestone               (bountyService Meilenstein, Surface bounties)
-- Additiv + idempotent. Rollback: Constraint erneut droppen und ohne die vier
-- Typen neu setzen (kein Datenverlust, da nur Wertebereich erweitert wird).

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  -- Requisitions
  'requisition_approval','requisition_filled','requisition_cancelled',
  -- Offers (offer_counter_received + offer_withdrawn neu)
  'offer_received','offer_accepted','offer_rejected','offer_counter_received','offer_withdrawn',
  -- Compliance / Trust Center
  'compliance_expiring','compliance_expired','compliance_verified',
  -- SLA / Mein Unternehmen
  'sla_warning','sla_breached',
  -- Vendor Pool
  'vendor_pool_change','vendor_pool_blocked','supplier_invited','supplier_reputation_updated','distribution_stage_advanced',
  -- Capacity / Demand (Marktplatz)
  'capacity_interest','capacity_expiring','capacity_match','capacity_stale','demand_match',
  -- Deal-Lifecycle (deal_cancelled neu)
  'deal_offer_sent','deal_accepted','deal_confirmed','deal_assignment_started','deal_completed','deal_cancelled',
  -- Worker / Disponent
  'worker_assignment_new','worker_assignment_changed','worker_assignment_pending_confirmation','worker_assignment_confirmed','worker_assignment_declined',
  'worker_submission_correction_requested','worker_submission_accepted','worker_submission_rejected','worker_shift_reminder','worker_unavailable_reported',
  -- Subscription / Plan
  'subscription_request_submitted','subscription_request_under_review','subscription_request_needs_clarification','subscription_request_offered',
  'subscription_request_accepted','subscription_request_active','subscription_request_rejected','subscription_request_cancelled',
  'subscription_request_expired','subscription_request_expiring_soon','subscription_request_activation_failed','enterprise_request_received',
  -- Gamification (milestone neu)
  'milestone',
  -- Catch-all
  'general','system'
]::text[]));
