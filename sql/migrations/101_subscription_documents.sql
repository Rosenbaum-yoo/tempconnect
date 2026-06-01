-- =============================================================================
-- Migration 101: subscription_documents
--
-- Eigener Dokument-Speicher fuer Tarif-/Vertrags-relevante Dokumente:
--   - cost_preview              Unverbindliche Kostenvorschau (kein Vertrag)
--   - plan_overview             Tarifuebersicht-Snapshot
--   - offer                     Verbindliches Angebot durch Staff
--   - order_confirmation        Auftragsbestaetigung nach Approval
--   - change_confirmation       Bestaetigung Upgrade/Downgrade
--   - cancellation_confirmation Kuendigungsbestaetigung
--
-- Bewusst getrennt von:
--   - `invoices` (Migration 030)        Steuerliche Rechnungen mit eigener Logik
--   - `deal_documents` (Migration 084)  Einsatzvereinbarungen / Konditionsblaetter
--   - `offer_assets`  (Migration 037)   Deal-Anhaenge
--
-- Eigene Nummernkreise pro Dokumenttyp via Sequenz `subscription_document_seq`.
-- Format: <PREFIX>-<JJJJ>-<6-stellig>, z.B. KV-2026-000123 fuer Kostenvorschau,
-- ANG-2026-000045 fuer Angebote.
-- =============================================================================

BEGIN;

CREATE SEQUENCE IF NOT EXISTS subscription_document_seq;

CREATE TABLE IF NOT EXISTS subscription_documents (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type            TEXT NOT NULL CHECK (document_type IN (
    'cost_preview', 'plan_overview', 'offer',
    'order_confirmation', 'change_confirmation', 'cancellation_confirmation'
  )),
  document_number          TEXT NOT NULL UNIQUE,
  status                   TEXT NOT NULL DEFAULT 'issued' CHECK (status IN (
    'draft', 'issued', 'superseded', 'archived'
  )),

  -- Bindung (nullable fuer Public-cost_preview)
  org_id                   UUID NULL REFERENCES organizations(id) ON DELETE SET NULL,
  subscription_request_id  UUID NULL REFERENCES subscription_requests(id) ON DELETE SET NULL,

  -- Inhalt
  title                    TEXT NOT NULL,
  format                   TEXT NOT NULL DEFAULT 'html' CHECK (format IN ('html','pdf')),
  content                  TEXT NOT NULL,             -- Voll-HTML oder PDF-Base64-Marker
  content_hash             TEXT NOT NULL,             -- sha256 ueber content
  data_snapshot            JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Metadaten
  contact_email            TEXT NULL,
  contact_name             TEXT NULL,
  total_cents              INTEGER NULL CHECK (total_cents IS NULL OR total_cents >= 0),
  currency                 TEXT NOT NULL DEFAULT 'EUR',
  effective_from           TIMESTAMPTZ NULL,
  effective_until          TIMESTAMPTZ NULL,

  -- Audit
  issued_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  issued_by                UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  download_count           INTEGER NOT NULL DEFAULT 0,
  last_downloaded_at       TIMESTAMPTZ NULL,
  last_downloaded_by       UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  superseded_by            UUID NULL REFERENCES subscription_documents(id) ON DELETE SET NULL,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subdoc_org_created
  ON subscription_documents(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subdoc_request
  ON subscription_documents(subscription_request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subdoc_type_status
  ON subscription_documents(document_type, status);

COMMIT;
