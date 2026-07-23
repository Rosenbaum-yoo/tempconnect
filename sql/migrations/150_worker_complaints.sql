-- 150_worker_complaints.sql
-- Beschwerde-Meldung (P3.2): ein einsetzendes Unternehmen meldet ein Problem mit einer
-- Kraft → die Zeitarbeitsfirma (Disponent) wird benachrichtigt und kann reagieren
-- (z.B. Ersatz via P1.1). Add-only/idempotent. Ergänzt zusätzlich den Notification-Typ
-- 'worker_complaint_filed' (sonst scheitert der Dispatcher-Alert am type-CHECK bzw. fällt
-- auf 'general' zurück). Bestehende Typen unverändert übernommen (aufbauend auf 141).
--
-- Rollback: DROP TABLE IF EXISTS worker_complaints;  (+ Constraint ohne den neuen Typ neu setzen)

BEGIN;

CREATE TABLE IF NOT EXISTS worker_complaints (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  worker_user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_org_id    uuid REFERENCES organizations(id) ON DELETE SET NULL,
  assignment_link_id uuid REFERENCES worker_assignment_links(id) ON DELETE SET NULL,
  severity           text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high')),
  reason             text NOT NULL,
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  created_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT NOW(),
  updated_at         timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS worker_complaints_company_idx  ON worker_complaints(company_org_id, status);
CREATE INDEX IF NOT EXISTS worker_complaints_supplier_idx ON worker_complaints(supplier_org_id, status);
CREATE INDEX IF NOT EXISTS worker_complaints_worker_idx   ON worker_complaints(worker_user_id);

COMMENT ON TABLE worker_complaints IS 'Beschwerde-Meldung (P3.2): Käufer-Org meldet Problem mit einer Kraft → Agentur benachrichtigt.';

-- Notification-Typ ergänzen (Dispatcher-Alert bei neuer Beschwerde). Vollständige Liste aus 141
-- übernommen + 'worker_complaint_filed'.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'requisition_approval','requisition_filled','requisition_cancelled',
  'offer_received','offer_accepted','offer_rejected','offer_counter_received','offer_withdrawn',
  'compliance_expiring','compliance_expired','compliance_verified',
  'sla_warning','sla_breached',
  'vendor_pool_change','vendor_pool_blocked','supplier_invited','supplier_reputation_updated','distribution_stage_advanced',
  'capacity_interest','capacity_expiring','capacity_match','capacity_stale','demand_match',
  'deal_offer_sent','deal_accepted','deal_confirmed','deal_assignment_started','deal_staffing_ready','deal_completed','deal_cancelled',
  'worker_assignment_new','worker_assignment_changed','worker_assignment_pending_confirmation','worker_assignment_confirmed','worker_assignment_declined',
  'worker_submission_correction_requested','worker_submission_accepted','worker_submission_rejected','worker_shift_reminder','worker_unavailable_reported',
  'worker_staffing_request_new','worker_staffing_request_reminder','worker_staffing_request_question',
  'worker_staffing_choice_request','worker_staffing_choice_submitted','worker_staffing_choice_declined',
  'worker_submission_submitted','worker_submission_corrected','worker_submission_sent_to_customer',
  'worker_document_verified','worker_document_rejected','worker_document_expiring','worker_document_expired',
  -- Beschwerde (neu in 150)
  'worker_complaint_filed',
  'subscription_request_submitted','subscription_request_under_review','subscription_request_needs_clarification','subscription_request_offered',
  'subscription_request_accepted','subscription_request_active','subscription_request_rejected','subscription_request_cancelled',
  'subscription_request_expired','subscription_request_expiring_soon','subscription_request_activation_failed','enterprise_request_received',
  'milestone',
  'general','system'
]::text[]));

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '150_worker_complaints.sql: Migration erfolgreich angewendet.';
END $$;
