-- SLA Messpunkte (Go-Live Premium): Beweisführung, Timeline, MET/BREACHED
-- Add-only, kompatibel mit 011.

-- 1) Neue Spalten requests
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS sla_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_matching_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_notification_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_met_at TIMESTAMPTZ;

-- Backfill: sla_started_at = created_at wo SLA-relevant (capacity_id nicht null)
UPDATE requests SET sla_started_at = created_at
 WHERE capacity_id IS NOT NULL AND sla_respond_by IS NOT NULL AND sla_started_at IS NULL;

-- 2) sla_status erweitern: RUNNING, MET hinzufügen (OK bleibt für Rückwärtskompatibilität)
ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_sla_status_check;
ALTER TABLE requests ADD CONSTRAINT requests_sla_status_check
  CHECK (sla_status IN ('OK','RUNNING','MET','BREACHED','RESOLVED'));

UPDATE requests SET sla_status = 'RUNNING' WHERE sla_status = 'OK' AND status = 'SENT' AND capacity_id IS NOT NULL;

-- 3) sla_events: neue Eventtypen
ALTER TABLE sla_events DROP CONSTRAINT IF EXISTS sla_events_event_type_check;
ALTER TABLE sla_events ADD CONSTRAINT sla_events_event_type_check
  CHECK (event_type IN (
    'deadline_set','breached','resolved','escalated',
    'SLA_STARTED','MATCHING_ATTEMPT','NOTIFICATION_SENT','SLA_MET','SLA_BREACHED'
  ));

-- 4) Index für Cron: RUNNING + sla_respond_by
CREATE INDEX IF NOT EXISTS requests_sla_scan_running_idx
  ON requests(receiver_id, sla_respond_by)
  WHERE sla_status IN ('OK','RUNNING') AND status = 'SENT';
