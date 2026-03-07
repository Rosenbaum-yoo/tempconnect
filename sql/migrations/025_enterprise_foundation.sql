-- 025: Enterprise Foundation — audit enhancements, notification preferences, activity feed
-- ================================================================

-- 1. Extend audit_log with old/new values, IP, user-agent
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS old_values JSONB;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS new_values JSONB;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- 2. Notification preferences (user-level)
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_category TEXT NOT NULL,
  channel_in_app BOOLEAN NOT NULL DEFAULT TRUE,
  channel_email BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, event_category)
);
CREATE INDEX IF NOT EXISTS notification_preferences_user_idx ON notification_preferences(user_id);

-- 3. Extend platform_events CHECK to accept more event types
ALTER TABLE platform_events DROP CONSTRAINT IF EXISTS platform_events_event_type_check;
ALTER TABLE platform_events ADD CONSTRAINT platform_events_event_type_check CHECK (
  event_type IN (
    -- existing
    'supplier_invited', 'supplier_approved', 'supplier_blocked',
    'requisition_created', 'requisition_distributed', 'requisition_filled',
    'offer_submitted', 'deal_completed', 'deal_cancelled',
    'rating_submitted',
    'capacity_published', 'capacity_expired', 'capacity_filled',
    'assignment_started', 'assignment_completed',
    -- new
    'profile_updated', 'search_job_created', 'search_job_closed',
    'offer_created', 'offer_accepted', 'offer_rejected', 'offer_withdrawn',
    'document_uploaded', 'document_verified', 'document_expired',
    'org_created', 'org_updated', 'member_added', 'member_removed',
    'role_changed', 'login', 'password_changed',
    'capacity_interest', 'match_found', 'notification_sent'
  )
);

-- 4. Activity feed view (union of platform_events + recent audit actions)
CREATE OR REPLACE VIEW activity_feed AS
  SELECT
    pe.id,
    pe.event_type AS action,
    pe.actor_id,
    pe.org_id,
    pe.entity_type,
    pe.entity_id::TEXT AS entity_id,
    pe.metadata,
    pe.created_at,
    u.email AS actor_email,
    u.company_name AS actor_company,
    u.contact_person AS actor_name
  FROM platform_events pe
  LEFT JOIN users u ON u.id = pe.actor_id
  ORDER BY pe.created_at DESC;
