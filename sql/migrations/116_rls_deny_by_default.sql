-- =============================================================================
-- 116_rls_deny_by_default.sql — RLS Deny-by-Default (WAVE 05)
-- =============================================================================
-- Vorgänger: 031_rls_prep.sql (RLS aktiviert mit IS NULL Wildcard)
--
-- Ziel: Kein Tenant-Datenleck durch fehlenden DB-Kontext.
--
-- Strategie:
--   1. IS NULL-Wildcard-Policies entfernen (war: jede Verbindung ohne org-context
--      sah alle Daten — gefährlich bei Bug oder fehlerhafter Middleware)
--
--   2. Explizite Staff-Bypass-Policy einführen:
--      `current_setting('app.rls_bypass', TRUE) = 'staff'`
--      Nur Verbindungen mit explizitem SET LOCAL app.rls_bypass = 'staff' bypassen RLS.
--      Dies passiert ausschließlich in api/utils/orgContext.js::withStaffContext().
--
--   3. Hilfsfunktionen aktualisieren / ergänzen.
--
--   4. Weitere tenant-scoped Tabellen mit RLS absichern.
--
-- Rollback-Strategie:
--   Im Notfall: Für jede Tabelle `ALTER TABLE x DISABLE ROW LEVEL SECURITY;`
--   oder IS NULL-Policies temporär wiederherstellen.
--   Kein Datenverlust — nur Abfragefilterung.
--
-- Performance:
--   RLS-Policies werden pro Zeile evaluiert. Die STABLE-Funktion `current_org_id()`
--   wird vom Planner gecacht. Kein Index-Overhead durch Policy selbst.
--
-- WAVE 05 — Phase 2 Finalisierung — 2026-05-26
-- =============================================================================

BEGIN;

-- ── Hilfsfunktionen ───────────────────────────────────────────────────────────

-- Bereits vorhanden aus 031_rls_prep.sql:
-- current_org_id() RETURNS UUID — liest app.current_org_id Session-Variable

-- NEU: Staff-Bypass-Check
CREATE OR REPLACE FUNCTION is_staff_context() RETURNS BOOLEAN AS $$
  SELECT current_setting('app.rls_bypass', TRUE) = 'staff'
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── requisitions ──────────────────────────────────────────────────────────────

-- Altes IS NULL Wildcard entfernen
DROP POLICY IF EXISTS req_no_ctx ON requisitions;

-- Staff-Bypass: Cross-Org-Zugriff nur für expliziten Staff-Context
CREATE POLICY req_staff_bypass ON requisitions
  USING (is_staff_context());

-- Bestehende Org-Policy bleibt:
-- req_same_org: USING (org_id = current_org_id())

-- ── timesheets ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS ts_no_ctx ON timesheets;

CREATE POLICY ts_staff_bypass ON timesheets
  USING (is_staff_context());

-- Bestehende Org-Policy bleibt:
-- ts_same_org: USING (org_id = current_org_id() OR supplier_org_id = current_org_id())

-- ── invoices ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS inv_no_ctx ON invoices;

CREATE POLICY inv_staff_bypass ON invoices
  USING (is_staff_context());

-- Bestehende Org-Policy bleibt:
-- inv_same_org: USING (org_id = current_org_id())

-- ── org_memberships ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS om_no_ctx ON org_memberships;

CREATE POLICY om_staff_bypass ON org_memberships
  USING (is_staff_context());

-- Bestehende Org-Policy bleibt:
-- om_same_org: USING (org_id = current_org_id())

-- ── vendor_pool_entries ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS vpe_no_ctx ON vendor_pool_entries;

CREATE POLICY vpe_staff_bypass ON vendor_pool_entries
  USING (is_staff_context());

-- Bestehende Org-Policy bleibt:
-- vpe_same_org: USING (org_id = current_org_id() OR supplier_org_id = current_org_id())

-- ── compliance_documents ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS cd_no_ctx ON compliance_documents;

CREATE POLICY cd_staff_bypass ON compliance_documents
  USING (is_staff_context());

-- Bestehende Org-Policy bleibt:
-- cd_same_org: USING (org_id = current_org_id() OR supplier_org_id = current_org_id())

-- ── Weitere kritische tenant-scoped Tabellen absichern ────────────────────────

-- subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY sub_staff_bypass ON subscriptions
  USING (is_staff_context());

CREATE POLICY sub_same_org ON subscriptions
  USING (org_id = current_org_id());

-- subscription_requests
ALTER TABLE subscription_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY subreq_staff_bypass ON subscription_requests
  USING (is_staff_context());

CREATE POLICY subreq_same_org ON subscription_requests
  USING (org_id = current_org_id());

-- deals (commercial_offers)
ALTER TABLE commercial_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY co_staff_bypass ON commercial_offers
  USING (is_staff_context());

CREATE POLICY co_same_org ON commercial_offers
  USING (buyer_org_id = current_org_id() OR seller_org_id = current_org_id());

-- audit_log: Staff liest alles; Org sieht nur eigene Einträge
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY al_staff_bypass ON audit_log
  USING (is_staff_context());

CREATE POLICY al_same_org ON audit_log
  USING (org_id = current_org_id() OR org_id IS NULL);

-- ── FORCE ROW LEVEL SECURITY (auch für Superuser) ────────────────────────────
-- Verhindert, dass Superuser-Verbindungen (z. B. Hetzner Managed DB admin-Account)
-- RLS unbewusst umgehen.
-- ACHTUNG: Migrations-Verbindung wird zum Superuser — Migrations müssen außerhalb
-- von Transaktionen mit FORCE RLS kompatibel sein (ODER Migration-User erhält BYPASSRLS).

-- Für jetzt nur auf den kritischsten Tabellen aktivieren.
ALTER TABLE requisitions FORCE ROW LEVEL SECURITY;
ALTER TABLE timesheets FORCE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;

COMMIT;

-- =============================================================================
-- Verifikation (nach Migration ausführen):
--
-- 1. Ohne Kontext: SELECT COUNT(*) FROM requisitions → muss 0 zurückgeben
--    (oder ERROR "permission denied" je nach Policy-Konfiguration)
--
-- 2. Mit Org-Kontext:
--    SET app.current_org_id = '<uuid>';
--    SELECT COUNT(*) FROM requisitions → Nur org-eigene Rows
--
-- 3. Mit Staff-Bypass:
--    SET app.rls_bypass = 'staff';
--    SELECT COUNT(*) FROM requisitions → Alle Rows
-- =============================================================================
