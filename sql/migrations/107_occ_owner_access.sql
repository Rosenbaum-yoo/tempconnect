-- =============================================================================
-- Migration 107: Owner Control Center Access + Decisions
--
-- Ziel:
--   1) Explizite OCC-Allowlist auf User-ID-Basis (keine Rollen-Abkuerzung)
--   2) Entscheidungs-Domain fuer OCC-Requests
--
-- Hinweis:
--   Zugriff auf OCC darf nur manuell freigeschaltet werden (SQL/Admin-CLI),
--   niemals automatisch in Production.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS occ_owner_access (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  occ_role      TEXT NOT NULL DEFAULT 'owner'
                CHECK (occ_role IN ('owner', 'co-owner')),
  granted_by    UUID REFERENCES users(id),
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at    TIMESTAMPTZ,
  notes         TEXT,
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_occ_owner_access_user
  ON occ_owner_access(user_id)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE occ_owner_access IS
  'Explizite OCC-Freigabeliste. Nur aktiv eingetragene User duerfen das Owner Control Center nutzen.';

CREATE TABLE IF NOT EXISTS occ_decisions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type               TEXT NOT NULL,
  title              TEXT NOT NULL,
  description        TEXT,
  requestor_id       UUID REFERENCES users(id),
  requestor_email    TEXT,
  org_id             UUID REFERENCES organizations(id),
  org_name           TEXT,
  risk_level         TEXT NOT NULL DEFAULT 'medium',
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','rejected','cancelled')),
  commercial_context JSONB,
  decided_by         UUID REFERENCES users(id),
  decided_at         TIMESTAMPTZ,
  decision_reason    TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_occ_decisions_status
  ON occ_decisions(status)
  WHERE status = 'pending';

COMMENT ON TABLE occ_decisions IS
  'Owner-Control-Entscheidungen fuer kommerzielle/anfragebezogene Freigaben.';

COMMIT;
