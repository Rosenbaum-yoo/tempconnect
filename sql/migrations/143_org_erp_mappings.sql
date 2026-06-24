-- 143_org_erp_mappings.sql
-- Konnektor-Registry für den SAP/HR-Add-on (Integrations-Epic A.3): verknüpft eine
-- TempConnect-Org mit ihrem externen ERP-/HR-/Lohn-System (SAP SuccessFactors/HCM, DATEV,
-- zvoove, Personio, generic). Hält Mandant/Client-ID, Ziel-Endpoint, Sync-Konfiguration
-- und -Status. Damit wissen Outbound-Events + spätere Konnektoren (Welle C), WOHIN und in
-- WELCHEM Format Daten gehen. Org-scoped (keine RLS — Isolation im Service-Layer, wie
-- org_integrations Mig 130). Add-only/idempotent (IF NOT EXISTS).
--
-- Rollback: DROP TABLE IF EXISTS org_erp_mappings;

CREATE TABLE IF NOT EXISTS org_erp_mappings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  system_type        text NOT NULL CHECK (system_type IN ('sap_successfactors','sap_hcm','datev','zvoove','personio','generic')),
  external_client_id text,                                   -- SAP Client# / DATEV-Mandant / zvoove-Mandant
  label              text NOT NULL DEFAULT '',
  endpoint_url       text,                                   -- optionaler Ziel-Endpoint (Push)
  sync_config        jsonb NOT NULL DEFAULT '{}'::jsonb,     -- z.B. {"format":"datev_csv","cost_center_field":"kostenstelle"}
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','disabled')),
  last_sync_at       timestamptz,
  last_error         text,
  created_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT NOW(),
  updated_at         timestamptz NOT NULL DEFAULT NOW()
);

-- Genau EIN Mapping pro (Org, Zielsystem) — eindeutige Anbindung je System.
CREATE UNIQUE INDEX IF NOT EXISTS org_erp_mappings_org_system_idx ON org_erp_mappings(org_id, system_type);
CREATE INDEX IF NOT EXISTS org_erp_mappings_org_idx ON org_erp_mappings(org_id, status);

COMMENT ON TABLE  org_erp_mappings IS 'Konnektor-Registry: Org ↔ externes ERP/HR/Lohn-System (SAP/DATEV/zvoove/…). Integrations-Epic A.3.';
COMMENT ON COLUMN org_erp_mappings.sync_config IS 'JSONB: Format/Feld-Mapping/Filter je Zielsystem (z.B. DATEV-CSV-Variante, Kostenstellen-Feld).';
