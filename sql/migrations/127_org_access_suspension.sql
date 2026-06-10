-- =============================================================================
-- Migration 127: Org-Access-Suspension (Betreiber-Kill-Switch)
--
-- ZWECK (Owner-Vorgabe, 2026-06-05):
--   Der Staff/Operator muss bei NICHT-ZAHLUNG (oder anderem schweren Grund) den
--   Zugang einer Kunden-Org sperren und spaeter wieder freigeben koennen. Die
--   Aktivierung von Tarifen bleibt zahlungsgetrieben (Stripe-Webhook) — der
--   Staff steuert AUSSCHLIESSLICH diesen Kill-Switch (Sperren/Entsperren) plus
--   Monitoring. KEINE manuelle Tarif-Aktivierung aus dem Staff-Center.
--
-- ENFORCEMENT (bewusst SOFT-LOCK, kein Login-Lock):
--   computeSubscriptionStatus() (api/services/entitlementService.js) prueft
--   access_suspended_at als HOECHSTE Prioritaet (vor pilot/individual_contract/
--   subscription.status) und liefert dann { active:false, status:'suspended' }.
--   evaluateFeature() blockt damit alle Feature-Pfade (SUBSCRIPTION_INACTIVE),
--   aber Login/Session bleiben unberuehrt — der Kunde sieht die Sperre + Grund
--   und kann zahlen/Kontakt aufnehmen. Ein harter Login-Lock ist optional spaeter.
--
-- Spalten auf organizations (add-only, nullable; NULL = aktiv/nicht gesperrt):
--   access_suspended_at      TIMESTAMPTZ — Sperr-Zeitpunkt (DER Enforcement-Schalter)
--   access_suspended_reason  TEXT        — Pflicht-Begruendung des Operators
--   access_suspended_by      UUID        — handelnder Staff/User (Audit traegt Details)
--   access_suspended_kind    TEXT        — Kategorie (non_payment Default-Use-Case)
--
-- ABGRENZUNG (bewusst NICHT angefasst):
--   - organizations.is_active bleibt unberuehrt (anderer Lebenszyklus: Org
--     deaktiviert/geloescht != temporaer gesperrt). Kein Overload.
--   - subscriptions.status (active/past_due/...) bleibt die zahlungsgetriebene
--     Wahrheit; die past_due-Grace-Logik in entitlementService bleibt wie sie ist.
--     Suspension ist der MANUELLE Operator-Override obendrueber.
--   - Audit laeuft ueber staff_control_audit_log (writeStaffAudit), NICHT hier.
--
-- IDEMPOTENZ: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS — erneuter
--   Lauf ist folgenloser No-Op. Eine umschliessende Transaktion (reine DDL auf
--   einer Tabelle, kein Forward-Repair-Risiko wie 116/126).
--
-- ROLLBACK:
--   ALTER TABLE organizations
--     DROP COLUMN IF EXISTS access_suspended_at,
--     DROP COLUMN IF EXISTS access_suspended_reason,
--     DROP COLUMN IF EXISTS access_suspended_by,
--     DROP COLUMN IF EXISTS access_suspended_kind;
--   DROP INDEX IF EXISTS idx_organizations_access_suspended;
--   (Kein Datenverlust an anderen Spalten; nach Drop ist jede Org wieder "aktiv".)
--
-- Phase 5 Finalisierung — 2026-06-05
-- =============================================================================

BEGIN;

SET client_min_messages TO WARNING;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS access_suspended_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS access_suspended_by     UUID,
  ADD COLUMN IF NOT EXISTS access_suspended_kind   TEXT;

-- Kategorie-Whitelist. Neue Arten brauchen eine neue Migration (kontrolliertes
-- Wachstum). NULL ist erlaubt (Spalte ist nur bei aktiver Sperre gesetzt).
DO $check_kind$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_access_suspended_kind_check'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_access_suspended_kind_check
      CHECK (access_suspended_kind IS NULL OR access_suspended_kind IN
        ('non_payment','manual','compliance','security','other'));
  END IF;
END $check_kind$;

COMMENT ON COLUMN organizations.access_suspended_at
  IS 'Betreiber-Kill-Switch: NULL = aktiv, gesetzt = Zugang gesperrt (Soft-Lock via entitlementService.computeSubscriptionStatus, hoechste Prioritaet). Kein Login-Lock.';
COMMENT ON COLUMN organizations.access_suspended_reason
  IS 'Pflicht-Begruendung des Operators bei Sperrung (CLAUDE.md: reason bei kritischen Aktionen). Wird dem Kunden als Sperr-Hinweis gezeigt.';
COMMENT ON COLUMN organizations.access_suspended_by
  IS 'User-ID des sperrenden Staff/Operators (kein FK; vollstaendige Nachvollziehbarkeit traegt staff_control_audit_log).';
COMMENT ON COLUMN organizations.access_suspended_kind
  IS 'Sperr-Kategorie: non_payment (Haupt-Use-Case) | manual | compliance | security | other.';

-- Monitoring-Pfad ("welche Orgs sind aktuell gesperrt?"): partieller Index, nur
-- gesperrte Zeilen — kein Overhead auf dem heissen Pfad der aktiven Orgs.
CREATE INDEX IF NOT EXISTS idx_organizations_access_suspended
  ON organizations (access_suspended_at DESC)
  WHERE access_suspended_at IS NOT NULL;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '127_org_access_suspension.sql: organizations.access_suspended_* + Monitoring-Index angelegt.';
END $$;
