-- 118_staff_identity_hardening.sql
-- SCC WAVE 01: tempconnect_staff um Identity-Felder erweitern.
-- Ziel: Rollen, MFA-Tracking, Access-Review, Ablaufdatum, Zugangsbegründung.
-- Idempotent: alle ALTER TABLE ... ADD COLUMN IF NOT EXISTS.

BEGIN;

-- ── Neue Spalten für Staff-Identity ─────────────────────────────────────────

-- Rolle innerhalb SCC (für zukünftiges granulares RBAC in WAVE 11)
-- Werte: 'staff_admin' | 'staff_commercial' | 'staff_ops' | 'staff_support' | 'staff_audit' | 'staff_member'
ALTER TABLE tempconnect_staff
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'staff_member';

-- Optionaler Sub-Scope (z.B. 'commercial_only', 'ops_readonly')
ALTER TABLE tempconnect_staff
  ADD COLUMN IF NOT EXISTS scope TEXT;

-- Letzter MFA-Zeitpunkt (gesetzt bei erfolgreichem TOTP/WebAuthn, WAVE 02)
ALTER TABLE tempconnect_staff
  ADD COLUMN IF NOT EXISTS last_mfa_at TIMESTAMPTZ;

-- Access-Review-Tracking (monatlicher Review, WAVE 11)
ALTER TABLE tempconnect_staff
  ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;
ALTER TABLE tempconnect_staff
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);

-- Begründung warum diese Person Staff-Zugang hat
ALTER TABLE tempconnect_staff
  ADD COLUMN IF NOT EXISTS access_reason TEXT;

-- Optionales Ablaufdatum (für zeitlich begrenzte Zugänge, z.B. externe Berater)
ALTER TABLE tempconnect_staff
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- ── Indizes ──────────────────────────────────────────────────────────────────

-- Schnelle Abfrage ablaufender Zugänge (Cron oder Review-Report)
CREATE INDEX IF NOT EXISTS idx_tempconnect_staff_expires_at
  ON tempconnect_staff(expires_at)
  WHERE expires_at IS NOT NULL;

-- Role-basierte Abfragen (für zukünftiges RBAC)
CREATE INDEX IF NOT EXISTS idx_tempconnect_staff_role
  ON tempconnect_staff(role)
  WHERE is_active = TRUE;

-- ── Kommentar ─────────────────────────────────────────────────────────────────
COMMENT ON COLUMN tempconnect_staff.role IS 'SCC-Rolle: staff_admin | staff_commercial | staff_ops | staff_support | staff_audit | staff_member';
COMMENT ON COLUMN tempconnect_staff.scope IS 'Optionaler Sub-Scope für granulares Zugriffsmodell (WAVE 11)';
COMMENT ON COLUMN tempconnect_staff.last_mfa_at IS 'Zeitpunkt letzter erfolgreicher MFA-Authentifizierung (TOTP/WebAuthn)';
COMMENT ON COLUMN tempconnect_staff.last_reviewed_at IS 'Zeitpunkt letzter Access-Review-Bestätigung';
COMMENT ON COLUMN tempconnect_staff.reviewed_by IS 'Wer den letzten Access-Review durchgeführt hat';
COMMENT ON COLUMN tempconnect_staff.access_reason IS 'Begründung für Staff-Zugang (wer, warum, welche Funktion)';
COMMENT ON COLUMN tempconnect_staff.expires_at IS 'Optionales Ablaufdatum — NULL = kein Ablauf. Prüfung in createStaffControlAccessMiddleware (WAVE 11)';

COMMIT;
