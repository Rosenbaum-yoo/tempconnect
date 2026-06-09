-- 128_org_invitations.sql — Org-Mitglieder-Einladung (Fixplan 3.3 / §0 Enterprise-Luecke).
-- Token wird NIE im Klartext gespeichert (nur SHA-256-Hash). role_key auf admin/member begrenzt
-- (kein 'owner'/'worker' per Invite -> kein Privilege-Escalation). Pro (org,email) max. 1 offene Einladung.
-- Rollback: DROP TABLE org_invitations;

CREATE TABLE IF NOT EXISTS org_invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email        text NOT NULL,
  role_key     text NOT NULL DEFAULT 'member' CHECK (role_key IN ('admin','member')),
  token_hash   text NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  invited_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  accepted_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  accepted_at  timestamptz
);

-- Nur EINE offene Einladung pro Org+Email (Re-Invite erst nach Revoke/Accept/Expire moeglich).
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_invitations_pending
  ON org_invitations (org_id, lower(email)) WHERE status = 'pending';
-- Schneller Token-Lookup nur fuer offene Einladungen.
CREATE INDEX IF NOT EXISTS idx_org_invitations_token
  ON org_invitations (token_hash) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_org_invitations_org
  ON org_invitations (org_id, status);
