-- =============================================================================
-- Migration 121: Operativer Incident-Track (SCC Operations)
--
-- Schliesst die vom Schema vorgezeichnete, nie geschlossene Luecke:
--   warp_executions.incident_id (Mig 108, Zeile 126) ist ein UUID-Feld ohne FK
--   und ohne Zieltabelle. Abgeleitete Betriebssignale (SLA, Staffing, fehl-
--   geschlagene Automation, Mail-Fehler) sind heute fluechtig — kein Ort, an dem
--   ein Operator einen Vorfall eroeffnet, quittiert, mit Grund schliesst und der
--   ueberdauert. Diese Migration legt genau diesen Ort an.
--
-- Tabelle:
--   ops_incidents — operativer Incident-Track, Staff/Operator-skopiert.
--
-- Einordnung (wichtig):
--   - Staff-Ops-Tabelle wie staff_control_audit_log / warp_executions:
--     KEINE Row-Level-Security (Mig 116 erzwingt RLS NICHT blanket, nur auf
--     explizit tenant-skopierten Tabellen). Operatoren arbeiten plattformweit
--     ueber die getrennte /staff-Session (requireStaff). Kein Cross-Org-403.
--   - org_id ist NUR informativ (welche Org ist betroffen), KEINE Tenant-Grenze.
--   - Audit laeuft NICHT ueber audit_log, sondern ueber staff_control_audit_log
--     (writeStaffAudit, entityType='ops_incident', entityId=<id>). Daher KEINE
--     audit_id-Spalte hier — die Verknuepfung traegt der Audit-Eintrag.
--
-- Add-only, vollstaendig rueckwaertskompatibel. Kein Bestandsdatum wird veraendert.
--
-- Rollback-Strategie:
--   DROP TABLE IF EXISTS ops_incidents CASCADE;
--   (Tabelle ist additiv; der warp_executions.incident_id-Hook bleibt danach
--    einfach wieder verwaist — Zustand wie vor dieser Migration. Kein Datenverlust
--    an Bestandstabellen.)
--
-- Phase 5 Finalisierung — 2026-06-02
-- =============================================================================

BEGIN;

SET client_min_messages TO WARNING;

-- ---------------------------------------------------------------------------
-- ops_incidents — operativer Incident-Track
--   Statusmaschine: open -> acknowledged -> resolved
--   severity spiegelt warp_executions.risk_level (low/medium/high/critical).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ops_incidents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  severity         TEXT NOT NULL DEFAULT 'medium'
                   CHECK (severity IN ('low','medium','high','critical')),
  status           TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','acknowledged','resolved')),
  source           TEXT NOT NULL DEFAULT 'manual'
                   CHECK (source IN ('manual','sla','staffing','infra','automation','email')),
  signal_code      TEXT,
  org_id           UUID,
  details          JSONB NOT NULL DEFAULT '{}',
  opened_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  opened_reason    TEXT NOT NULL,
  acknowledged_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at  TIMESTAMPTZ,
  resolved_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at      TIMESTAMPTZ,
  resolution_note  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ops_incidents
  IS 'Operativer Incident-Track (SCC Operations). Staff-Ops-Tabelle ohne RLS, plattformweit. Audit via staff_control_audit_log (entityType=ops_incident).';
COMMENT ON COLUMN ops_incidents.severity
  IS 'Spiegelt warp_executions.risk_level: low/medium/high/critical.';
COMMENT ON COLUMN ops_incidents.status
  IS 'Statusmaschine: open -> acknowledged -> resolved. Keine Ruecksprung-Uebergaenge.';
COMMENT ON COLUMN ops_incidents.source
  IS 'Herkunft: manual (Operator) oder abgeleitet (sla/staffing/infra/automation/email).';
COMMENT ON COLUMN ops_incidents.signal_code
  IS 'Optionaler Signal-Code bei abgeleiteten Incidents, z.B. SLA_COMPLIANCE_LOW.';
COMMENT ON COLUMN ops_incidents.org_id
  IS 'NUR informativ (welche Org ist betroffen). KEINE Tenant-Grenze, kein RLS-Boundary.';
COMMENT ON COLUMN ops_incidents.opened_reason
  IS 'Pflicht-Begruendung bei Eroeffnung (CLAUDE.md: reason bei kritischen Aktionen).';

-- "offene Incidents, neueste zuerst" — deckt die Default-Listen-Query indexgestuetzt
CREATE INDEX IF NOT EXISTS idx_ops_incidents_status_created
  ON ops_incidents(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_incidents_severity
  ON ops_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_ops_incidents_org
  ON ops_incidents(org_id)
  WHERE org_id IS NOT NULL;

-- Hinweis: Der verwaiste Hook warp_executions.incident_id (Mig 108) wird hier
-- BEWUSST NICHT mit FK verdrahtet — separater, optionaler Owner-Schritt
-- (siehe proposal_incident_model_owner_gate.md §6.3). Bei Bedarf:
--   ALTER TABLE warp_executions
--     ADD CONSTRAINT fk_warp_exec_incident
--     FOREIGN KEY (incident_id) REFERENCES ops_incidents(id) ON DELETE SET NULL;

COMMIT;
