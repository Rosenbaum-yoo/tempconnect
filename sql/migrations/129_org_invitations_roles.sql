-- 129_org_invitations_roles.sql — Einladbare Rollen erweitern (Owner-Wunsch 2026-06-10).
-- Die Mitgliederverwaltung (updateMemberRole) kennt laengst alle org-internen Rollen; nur die
-- Einladung war auf admin/member begrenzt. Jetzt deckungsgleich mit der Mitgliederverwaltung —
-- AUSSER:
--   owner          -> Eigentuemerschaft nie per E-Mail-Invite (kein Privilege-Escalation)
--   worker         -> eigenes Worker-Modul (andere org_type-Welt)
--   platform_admin -> Plattform-Ebene, nicht org-intern per Invite vergebbar
-- Add-only/idempotent (CHECK-Tausch). Default bleibt 'member'. org_memberships.role_key
-- (Mig 029) erlaubt alle Zielrollen bereits -> Accept-Pfad unveraendert sicher.
-- Rollback:
--   ALTER TABLE org_invitations DROP CONSTRAINT IF EXISTS org_invitations_role_key_check;
--   ALTER TABLE org_invitations ADD CONSTRAINT org_invitations_role_key_check
--     CHECK (role_key IN ('admin','member'));

ALTER TABLE org_invitations DROP CONSTRAINT IF EXISTS org_invitations_role_key_check;
ALTER TABLE org_invitations ADD CONSTRAINT org_invitations_role_key_check
  CHECK (role_key IN (
    'admin','program_manager','hiring_manager','supplier_manager',
    'finance','recruiter','dispatcher','member','supplier_user','viewer'
  ));
