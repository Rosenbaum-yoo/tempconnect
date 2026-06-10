-- 131_document_center.sql — Zentraler Dokumenten-Tresor / PDF-Center (Owner-Request, Lock-in).
-- Bewusst GETRENNT von compliance_documents (deren Ampel-/Verifizierungs-Workflow bleibt dort):
-- hier liegen ORG-EIGENE Geschaeftsdokumente (Rechnungen, Vertraege, Policies, Reports, Zertifikate)
-- zum sicheren Ablegen, Verwalten und als PDF Herunterladen — fuer Unternehmen UND Agenturen.
-- Add-only/idempotent. Rollback: DROP TABLE IF EXISTS document_center;

CREATE TABLE IF NOT EXISTS document_center (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_type       text NOT NULL DEFAULT 'other'
                        CHECK (document_type IN ('invoice','contract','policy','certificate','report','correspondence','other')),
  content_category    text NOT NULL DEFAULT 'operational'
                        CHECK (content_category IN ('financial','legal','operational','hr','other')),
  title               text NOT NULL,
  file_ref            text,
  original_name       text,
  mime_type           text,
  file_size_bytes     bigint,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  uploaded_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  source              text NOT NULL DEFAULT 'upload' CHECK (source IN ('upload','invoice','system')),
  source_ref          text,
  valid_from          date,
  valid_until         date,
  retention_delete_at timestamptz,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT NOW(),
  updated_at          timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS document_center_org_idx  ON document_center (org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS document_center_type_idx ON document_center (org_id, document_type);
-- Retention-Sweep (DSGVO/GoBD): partieller Index, nur Zeilen mit gesetztem Loeschdatum.
CREATE INDEX IF NOT EXISTS document_center_retention_idx ON document_center (retention_delete_at) WHERE retention_delete_at IS NOT NULL;
