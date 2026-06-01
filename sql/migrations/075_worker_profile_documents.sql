-- =============================================================================
-- Migration 075: Worker Profile Documents
-- Adds internal document / proof records directly to the worker module so the
-- employee hub can manage qualifications and supporting evidence without a
-- parallel shadow system.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS worker_profile_documents (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_org_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category          TEXT        NOT NULL DEFAULT 'qualification'
                    CHECK (category = ANY (ARRAY['qualification','identity','permit','medical','training','other'])),
  title             TEXT        NOT NULL,
  qualification_name TEXT,
  issuer            TEXT,
  file_ref          TEXT,
  original_name     TEXT,
  mime_type         TEXT,
  file_size_bytes   INTEGER     CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  valid_from        DATE,
  valid_until       DATE,
  status            TEXT        NOT NULL DEFAULT 'pending_review'
                    CHECK (status = ANY (ARRAY['pending_review','verified','rejected','archived'])),
  notes             TEXT,
  review_note       TEXT,
  uploaded_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  verified_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  verified_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS worker_profile_documents_worker_idx
  ON worker_profile_documents(worker_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS worker_profile_documents_supplier_status_idx
  ON worker_profile_documents(supplier_org_id, status, valid_until);

CREATE INDEX IF NOT EXISTS worker_profile_documents_qualification_idx
  ON worker_profile_documents(worker_user_id, qualification_name);

COMMIT;
