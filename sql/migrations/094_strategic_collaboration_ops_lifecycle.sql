-- 094_strategic_collaboration_ops_lifecycle.sql
-- Internal ops lifecycle + assignment for strategic collaboration/enterprise requests.

ALTER TABLE strategic_collaboration_requests
  ADD COLUMN IF NOT EXISTS assigned_to_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS assigned_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ops_notes TEXT NULL;

UPDATE strategic_collaboration_requests
  SET status = CASE status
    WHEN 'neu' THEN 'eingegangen'
    WHEN 'qualifiziert' THEN 'rueckfrage_offen'
    WHEN 'in_pruefung' THEN 'rueckfrage_offen'
    WHEN 'kontaktiert' THEN 'rueckfrage_offen'
    WHEN 'in_abstimmung' THEN 'angebot_erstellt'
    WHEN 'verworfen' THEN 'abgelehnt'
    ELSE status
  END
WHERE status IN ('neu', 'qualifiziert', 'in_pruefung', 'kontaktiert', 'in_abstimmung', 'verworfen');

UPDATE strategic_collaboration_requests
  SET status_updated_at = COALESCE(status_updated_at, created_at)
WHERE status_updated_at IS NULL;

ALTER TABLE strategic_collaboration_requests
  DROP CONSTRAINT IF EXISTS strategic_collaboration_requests_status_check;

ALTER TABLE strategic_collaboration_requests
  ADD CONSTRAINT strategic_collaboration_requests_status_check CHECK (
    status IN ('eingegangen', 'rueckfrage_offen', 'angebot_erstellt', 'bestaetigt', 'aktiviert', 'abgelehnt', 'abgeschlossen')
  );

ALTER TABLE strategic_collaboration_requests
  ALTER COLUMN status SET DEFAULT 'eingegangen';

CREATE INDEX IF NOT EXISTS idx_scr_assigned_to_created
  ON strategic_collaboration_requests (assigned_to_user_id, created_at DESC);
