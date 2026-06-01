-- =============================================================================
-- Migration 084: Deal Documents, Dossier und Signatur-Vorbereitung
-- Erweitert die Dealabschluss-Domaene um:
--   1. deal_documents: Metadaten-Tabelle fuer generierte + hochgeladene Abschlussdokumente
--   2. offers: Signatur-Felder fuer vorbereitete E-Signatur-Integration
--   3. offer_assets: neuer asset_type 'deal_document' fuer Dealakten
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. deal_documents: Abschlussdokumente mit Metadaten und Versionierung
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deal_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'conditions_sheet', 'agreement', 'summary', 'amendment', 'cancellation'
  )),
  version INT NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'generated' CHECK (source IN ('generated', 'uploaded')),
  -- Fuer generierte Docs: HTML-Content-Hash fuer Aenderungserkennung
  content_hash TEXT,
  -- Fuer hochgeladene Docs: Verweis auf offer_assets
  asset_id UUID REFERENCES offer_assets(id) ON DELETE SET NULL,
  -- Metadaten
  generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'current' CHECK (status IN ('current', 'superseded', 'archived')),
  agreement_ref TEXT,
  agreement_version INT,
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE deal_documents IS 'Metadaten aller Dealabschluss-Dokumente (generiert + hochgeladen)';
COMMENT ON COLUMN deal_documents.document_type IS 'conditions_sheet=Verhandlungsstand, agreement=Einsatzvereinbarung, summary=Zusammenfassung, amendment=Nachtrag, cancellation=Stornierungsdokument';
COMMENT ON COLUMN deal_documents.source IS 'generated=vom System erzeugt, uploaded=vom Nutzer hochgeladen';
COMMENT ON COLUMN deal_documents.content_hash IS 'SHA-256 des generierten HTML-Contents fuer Aenderungserkennung';
COMMENT ON COLUMN deal_documents.status IS 'current=aktuelle Version, superseded=durch neuere Version ersetzt, archived=archiviert';

CREATE INDEX IF NOT EXISTS deal_documents_offer_idx ON deal_documents(offer_id);
CREATE INDEX IF NOT EXISTS deal_documents_type_idx ON deal_documents(offer_id, document_type) WHERE status = 'current';

-- ---------------------------------------------------------------------------
-- 2. offer_assets: neuer asset_type 'deal_document' fuer Dealakten-Uploads
-- ---------------------------------------------------------------------------
-- Erweitere den CHECK-Constraint fuer asset_type (falls vorhanden)
-- Die Tabelle nutzt bereits keinen CHECK-Constraint auf asset_type,
-- daher genuegt es, den neuen Typ in der Anwendungslogik zu akzeptieren.
-- Sicherheitshalber: Spalten fuer Dealakten-Upload / Rueckverweis
ALTER TABLE offer_assets
  ADD COLUMN IF NOT EXISTS marketplace_offer_id UUID REFERENCES offers(id) ON DELETE SET NULL;
ALTER TABLE offer_assets
  ADD COLUMN IF NOT EXISTS deal_document_id UUID REFERENCES deal_documents(id) ON DELETE SET NULL;
COMMENT ON COLUMN offer_assets.marketplace_offer_id IS 'Optionaler Verweis auf ein echtes Marketplace-Offer (offers-Tabelle) fuer Dealakten-Uploads';

COMMENT ON COLUMN offer_assets.deal_document_id IS 'Optionaler Rueckverweis auf deal_documents fuer Dealakten-zugehoerige Uploads';

CREATE INDEX IF NOT EXISTS offer_assets_marketplace_offer_idx
  ON offer_assets(marketplace_offer_id) WHERE marketplace_offer_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. offers: Signatur-Felder (E-Signatur-Vorbereitung)
-- ---------------------------------------------------------------------------
ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS signature_required BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS signature_status TEXT
    CHECK (signature_status IS NULL OR signature_status IN (
      'not_required', 'pending', 'partially_signed', 'fully_signed', 'failed', 'expired'
    ));

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS signed_by_party_a UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS signed_by_party_b UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS signature_provider TEXT;

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS signature_reference TEXT;

-- Default: bestehende Offers ohne Signaturpflicht
UPDATE offers SET signature_status = 'not_required' WHERE signature_status IS NULL;

COMMENT ON COLUMN offers.signature_required IS 'Ob fuer dieses Agreement eine E-Signatur erforderlich ist';
COMMENT ON COLUMN offers.signature_status IS 'not_required|pending|partially_signed|fully_signed|failed|expired';
COMMENT ON COLUMN offers.signed_by_party_a IS 'User-ID der Partei A (Requester) die signiert hat';
COMMENT ON COLUMN offers.signed_by_party_b IS 'User-ID der Partei B (Supplier) die signiert hat';
COMMENT ON COLUMN offers.signature_provider IS 'E-Signatur-Provider (z.B. docusign, yousign, adobe_sign) – fuer spaetere Integration';
COMMENT ON COLUMN offers.signature_reference IS 'Externe Referenz-ID des Signatur-Providers';

-- ---------------------------------------------------------------------------
-- 4. Indices fuer Performance
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS offers_signature_status_idx
  ON offers(signature_status) WHERE signature_status IS NOT NULL AND signature_status NOT IN ('not_required');

COMMIT;
