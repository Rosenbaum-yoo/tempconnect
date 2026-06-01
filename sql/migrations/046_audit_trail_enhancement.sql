-- 046: Audit Trail Enhancement
-- Erweitert audit_log um action_type + status fuer professionelles Audit Trail.
-- Append-only Prinzip bleibt erhalten.
-- ================================================================

-- 1. Neue Spalten
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS action_type TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'SUCCESS';

-- 2. CHECK-Constraints
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_type_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_type_check CHECK (
  action_type IS NULL OR action_type IN (
    'CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE',
    'LOGIN', 'ROLE_CHANGE', 'PERMISSION_CHANGE',
    'APPROVAL', 'SUBMISSION', 'SECURITY', 'CONFIG_CHANGE'
  )
);

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_status_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_status_check CHECK (
  status IN ('SUCCESS', 'DENIED', 'FAILED')
);

-- 3. Performance-Indexes fuer Audit-Views
CREATE INDEX IF NOT EXISTS audit_log_action_type_idx
  ON audit_log(action_type) WHERE action_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_log_status_idx
  ON audit_log(status) WHERE status != 'SUCCESS';

-- Composite-Index fuer Org-Audit-View (Phase 6): schnelle org-scoped Abfragen
CREATE INDEX IF NOT EXISTS audit_log_org_created_desc_idx
  ON audit_log(org_id, created_at DESC) WHERE org_id IS NOT NULL;

-- Composite-Index fuer Resource-Lookup (Phase 7: Recent Changes)
CREATE INDEX IF NOT EXISTS audit_log_resource_lookup_idx
  ON audit_log(entity_type, entity_id, created_at DESC)
  WHERE entity_id IS NOT NULL;

-- 4. Backfill: bestehende Rows bekommen status + action_type per Heuristik
UPDATE audit_log SET status = 'SUCCESS' WHERE status IS NULL;

UPDATE audit_log SET action_type = CASE
  WHEN action ILIKE '%.create'        THEN 'CREATE'
  WHEN action ILIKE '%.add%'          THEN 'CREATE'
  WHEN action ILIKE '%.update'        THEN 'UPDATE'
  WHEN action ILIKE '%.delete%'       THEN 'DELETE'
  WHEN action ILIKE '%.remove%'       THEN 'DELETE'
  WHEN action ILIKE '%.deactivate%'   THEN 'DELETE'
  WHEN action ILIKE '%.approve%'      THEN 'APPROVAL'
  WHEN action ILIKE '%.reject%'       THEN 'APPROVAL'
  WHEN action ILIKE '%.submit%'       THEN 'SUBMISSION'
  WHEN action ILIKE 'auth.login'      THEN 'LOGIN'
  WHEN action ILIKE 'auth.logout'     THEN 'LOGIN'
  WHEN action ILIKE 'auth.register'   THEN 'CREATE'
  WHEN action ILIKE 'auth.password%'  THEN 'SECURITY'
  WHEN action ILIKE 'auth.forgot%'    THEN 'SECURITY'
  WHEN action ILIKE '%.role%'         THEN 'ROLE_CHANGE'
  WHEN action ILIKE '%.status%'       THEN 'STATUS_CHANGE'
  WHEN action ILIKE '%.accept%'       THEN 'STATUS_CHANGE'
  WHEN action ILIKE '%.cancel%'       THEN 'STATUS_CHANGE'
  WHEN action ILIKE '%.close%'        THEN 'STATUS_CHANGE'
  WHEN action ILIKE '%.complete%'     THEN 'STATUS_CHANGE'
  WHEN action ILIKE '%.finalize%'     THEN 'STATUS_CHANGE'
  ELSE 'UPDATE'
END
WHERE action_type IS NULL;

COMMENT ON COLUMN audit_log.action_type IS 'Kategorie: CREATE, UPDATE, DELETE, STATUS_CHANGE, LOGIN, ROLE_CHANGE, PERMISSION_CHANGE, APPROVAL, SUBMISSION, SECURITY, CONFIG_CHANGE';
COMMENT ON COLUMN audit_log.status IS 'Ergebnis: SUCCESS, DENIED, FAILED';
