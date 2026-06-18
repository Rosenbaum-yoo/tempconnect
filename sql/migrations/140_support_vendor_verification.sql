-- 140_support_vendor_verification.sql
-- Externer Support (BPO, z.B. Indien) — Sicherheits-Gate auf Vendor-Ebene.
-- Externe Support-Agenten duerfen NUR arbeiten, wenn ihr Vendor von TempConnect
-- ausdruecklich VERIFIZIERT (status='active') wurde — und optional nur aus
-- freigegebenen IP-Netzen (allowed_ip_cidrs). Default-Status 'pending' = gesperrt,
-- bis ein Owner/Staff den Vendor verifiziert. 'suspended' = sofortiger Kill-Switch.
-- Additiv + idempotent. Rollback: Spalten droppen (kein Datenverlust am Kernmodell).

ALTER TABLE support_vendors
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID,
  ADD COLUMN IF NOT EXISTS allowed_ip_cidrs TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Wertebereich des Status absichern (idempotent neu setzen).
ALTER TABLE support_vendors DROP CONSTRAINT IF EXISTS support_vendors_status_check;
ALTER TABLE support_vendors ADD CONSTRAINT support_vendors_status_check
  CHECK (status IN ('pending', 'active', 'suspended'));

-- Bestandsdaten: bereits aktive Vendors gelten als verifiziert (Abwaertskompatibilitaet).
UPDATE support_vendors SET status = 'active', verified_at = COALESCE(verified_at, NOW())
  WHERE is_active = TRUE AND status = 'pending';

COMMENT ON COLUMN support_vendors.status IS 'pending=nicht verifiziert (gesperrt), active=verifiziert, suspended=Kill-Switch';
COMMENT ON COLUMN support_vendors.allowed_ip_cidrs IS 'Optionale IP-Allowlist (CIDR) fuer externe Agenten dieses Vendors; leer = keine IP-Beschraenkung';
