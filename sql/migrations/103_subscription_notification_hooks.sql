-- =============================================================================
-- Migration 103: Subscription Notification Hooks (Welle 8 Schritt 15)
--
-- Ziel:
--   1. `notifications_type_check` um Subscription- und Enterprise-Event-Typen
--      erweitern (additiv, ohne bestehende Werte zu droppen).
--   2. NEUE Tabelle `subscription_notification_log` als Idempotency-Schicht:
--      pro (kontext, event, recipient_role, recipient_user) genau EIN Eintrag
--      \u2014 verhindert doppelte Customer-/Staff-Notifications bei Retries oder
--      gleichzeitigen Status-Transitions.
--   3. Tabelle haelt zusaetzlich `dispatched_via` ('db' | 'email' | 'both' |
--      'skipped') und `mail_status` ('ok' | 'failed' | 'no_smtp' | 'skipped').
--      Mail-Fehler sind dadurch beobachtbar, ohne dass die ausloesende
--      Status-Transition abbricht.
--
-- Bewusst NICHT angefasst:
--   - `notifications` Schema bleibt erhalten (nur CHECK-Constraint erweitert).
--   - `notification_preferences` bleibt unveraendert (Channel-Toggle pro User).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) notifications.type_check erweitern um Subscription/Enterprise-Events
-- ---------------------------------------------------------------------------
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type IN (
      -- enterprise core (bestehend)
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
      -- worker module
      'worker_assignment_new','worker_assignment_changed',
      'worker_assignment_pending_confirmation',
      'worker_assignment_confirmed','worker_assignment_declined',
      'worker_submission_correction_requested',
      'worker_submission_accepted','worker_submission_rejected',
      'worker_shift_reminder',
      'worker_unavailable_reported',
      -- NEU Welle 8 Schritt 15: Subscription / Enterprise Notifications
      'subscription_request_submitted',
      'subscription_request_under_review',
      'subscription_request_needs_clarification',
      'subscription_request_offered',
      'subscription_request_accepted',
      'subscription_request_active',
      'subscription_request_rejected',
      'subscription_request_cancelled',
      'subscription_request_expired',
      'subscription_request_expiring_soon',
      'subscription_request_activation_failed',
      'enterprise_request_received',
      -- generic
      'general','system'
    )
  );

-- ---------------------------------------------------------------------------
-- 2) subscription_notification_log: Idempotency + Mail-Beobachtbarkeit
--
--    `idempotency_key` ist die kanonische Form
--    `<context_type>:<context_id>:<event_key>:<recipient_role>:<recipient_user_id>`
--    z.B. `subscription_request:<uuid>:status_offered:customer:<owner-uuid>`
--    oder `enterprise_request:<uuid>:received:staff:<staff-uuid>`.
--    Die App schreibt diese Form ueber den `subscriptionNotificationService`.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key   TEXT        NOT NULL,
  context_type      TEXT        NOT NULL
    CHECK (context_type IN ('subscription_request', 'enterprise_request')),
  context_id        UUID        NOT NULL,
  event_key         TEXT        NOT NULL,
  recipient_role    TEXT        NOT NULL
    CHECK (recipient_role IN ('customer', 'staff')),
  recipient_user_id UUID        REFERENCES users(id) ON DELETE SET NULL,
  recipient_email   TEXT,
  notification_id   UUID        REFERENCES notifications(id) ON DELETE SET NULL,
  dispatched_via    TEXT        NOT NULL DEFAULT 'db'
    CHECK (dispatched_via IN ('db', 'email', 'both', 'skipped')),
  mail_status       TEXT
    CHECK (mail_status IS NULL OR mail_status IN ('ok', 'failed', 'no_smtp', 'skipped')),
  mail_message_id   TEXT,
  mail_error        TEXT,
  payload           JSONB       NOT NULL DEFAULT '{}'::JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pro Idempotency-Schluessel exakt EIN Eintrag.
CREATE UNIQUE INDEX IF NOT EXISTS subscription_notification_log_idem_uniq
  ON subscription_notification_log(idempotency_key);

CREATE INDEX IF NOT EXISTS subscription_notification_log_context_idx
  ON subscription_notification_log(context_type, context_id);

CREATE INDEX IF NOT EXISTS subscription_notification_log_event_idx
  ON subscription_notification_log(event_key);

CREATE INDEX IF NOT EXISTS subscription_notification_log_created_idx
  ON subscription_notification_log(created_at DESC);

COMMENT ON TABLE subscription_notification_log IS
  'Welle 8 Schritt 15 - Idempotency + Mail-Beobachtbarkeit fuer Subscription-/Enterprise-Notifications.';
COMMENT ON COLUMN subscription_notification_log.idempotency_key IS
  'Kanonisch: <context_type>:<context_id>:<event_key>:<recipient_role>:<recipient_user_id>';
COMMENT ON COLUMN subscription_notification_log.dispatched_via IS
  'db=nur in-app, email=nur Mail, both=in-app + Mail, skipped=praeferenz/no-recipient';
COMMENT ON COLUMN subscription_notification_log.mail_status IS
  'ok=Mail versendet (oder Dev-Mode geloggt), failed=SMTP-Fehler, no_smtp=Service nicht konfiguriert, skipped=Praeferenz aus';

COMMIT;
