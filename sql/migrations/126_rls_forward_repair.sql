-- =============================================================================
-- 126_rls_forward_repair.sql — Bestands-DB Forward-Repair fuer 116 (Tier-2)
-- =============================================================================
-- KONTEXT:
--   116_rls_deny_by_default.sql ist transaktional (BEGIN..COMMIT). Auf Bestands-
--   DBs, die mit dem frueheren UNGEHAERTETEN Migrations-Runner (ohne ON_ERROR_STOP)
--   liefen, riss der erste in 116 maskierte Defekt (Verweise auf nicht existente
--   Spalten/Tabellen: subscriptions.org_id, commercial_offers.buyer/seller_org_id,
--   vendor_pool_entries) die GESAMTE 116-Transaktion in den Rollback — 116 wurde
--   aber faelschlich als "applied" verbucht. Ergebnis: der Deny-by-Default-
--   Backstop (Funktion is_staff_context(), Staff-Bypass-Policies, entfernte
--   IS-NULL-Wildcards, FORCE RLS, RLS auf subscription_requests/commercial_offers/
--   audit_log) wurde auf KEINER Bestands-DB jemals real angewandt.
--
--   Da 116 bereits als applied verbucht ist, laeuft es nie erneut. Diese Migration
--   stellt den INTENDIERTEN END-ZUSTAND von 116 idempotent her — auf Bestands-DBs
--   erstmals, auf frisch installierten DBs (wo das gehaertete 116 bereits korrekt
--   lief) als folgenloser No-Op (DROP IF EXISTS + identisches CREATE).
--
-- SICHERHEITSWIRKUNG (Aktivierung beim NAECHSTEN migrate-Lauf!):
--   Danach gilt fuer requisitions/timesheets/invoices Deny-by-Default: eine
--   DB-Verbindung OHNE org-Kontext (app.current_org_id) und OHNE Staff-Bypass
--   (app.rls_bypass='staff') sieht 0 Zeilen statt — wie bisher ueber die
--   IS-NULL-Wildcard — alle. Die App setzt diesen Kontext bereits
--   (api/middleware/orgContext.js, api/utils/orgContext.js withOrgContext/
--   withStaffContext). Postgres-Superuser- und BYPASSRLS-Verbindungen (lokaler
--   tempconnect-Superuser, Migrations-Connection) umgehen RLS generell und sind
--   unberuehrt. Auf Managed-DB (nicht-Superuser App-User) wird der Backstop
--   wirksam — exakt der fuer zahlende Kunden geforderte Mandanten-Schutz.
--
-- RESILIENZ (Lehre aus dem 116-Vorfall):
--   KEINE umschliessende Transaktion. Jede Tabelle wird in einem eigenen, per
--   to_regclass abgesicherten DO-Block repariert. Ein fehlendes Objekt ueberspringt
--   nur SEINEN Block und reisst nie den gesamten Sicherheits-Backstop mit.
--
-- IDEMPOTENZ:
--   Jede Policy wird vor dem Anlegen via DROP POLICY IF EXISTS entfernt; ENABLE/
--   FORCE ROW LEVEL SECURITY sind von Natur aus idempotent. DROP+CREATE laeuft je
--   Tabelle in EINEM DO-Block (= eine Transaktion) — fuer Aussenstehende atomar,
--   keine Sicherheitsluecke zwischen Drop und Create.
--
-- ROLLBACK:
--   Im Notfall pro Tabelle: ALTER TABLE x NO FORCE ROW LEVEL SECURITY; und/oder
--   DROP POLICY <name> ON x; — kein Datenverlust, nur Aenderung der Filterung.
-- =============================================================================

-- ── Hilfsfunktionen (idempotent; auf Bestands-DBs fehlte is_staff_context()) ──
CREATE OR REPLACE FUNCTION current_org_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_org_id', TRUE), '')::UUID;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_staff_context() RETURNS BOOLEAN AS $$
  SELECT current_setting('app.rls_bypass', TRUE) = 'staff'
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── requisitions (Org-Isolation + Staff-Bypass + FORCE) ───────────────────────
DO $repair_req$
BEGIN
  IF to_regclass('public.requisitions') IS NULL THEN
    RAISE NOTICE '126: requisitions fehlt — uebersprungen.'; RETURN;
  END IF;
  ALTER TABLE requisitions ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS req_no_ctx ON requisitions;                      -- IS-NULL-Wildcard entfernen
  DROP POLICY IF EXISTS req_same_org ON requisitions;
  CREATE POLICY req_same_org ON requisitions USING (org_id = current_org_id());
  DROP POLICY IF EXISTS req_staff_bypass ON requisitions;
  CREATE POLICY req_staff_bypass ON requisitions USING (is_staff_context());
  ALTER TABLE requisitions FORCE ROW LEVEL SECURITY;
END $repair_req$;

-- ── timesheets (org_id ODER supplier_org_id + Staff-Bypass + FORCE) ───────────
DO $repair_ts$
BEGIN
  IF to_regclass('public.timesheets') IS NULL THEN
    RAISE NOTICE '126: timesheets fehlt — uebersprungen.'; RETURN;
  END IF;
  ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS ts_no_ctx ON timesheets;
  DROP POLICY IF EXISTS ts_same_org ON timesheets;
  CREATE POLICY ts_same_org ON timesheets
    USING (org_id = current_org_id() OR supplier_org_id = current_org_id());
  DROP POLICY IF EXISTS ts_staff_bypass ON timesheets;
  CREATE POLICY ts_staff_bypass ON timesheets USING (is_staff_context());
  ALTER TABLE timesheets FORCE ROW LEVEL SECURITY;
END $repair_ts$;

-- ── invoices (Org-Isolation + Staff-Bypass + FORCE) ───────────────────────────
DO $repair_inv$
BEGIN
  IF to_regclass('public.invoices') IS NULL THEN
    RAISE NOTICE '126: invoices fehlt — uebersprungen.'; RETURN;
  END IF;
  ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS inv_no_ctx ON invoices;
  DROP POLICY IF EXISTS inv_same_org ON invoices;
  CREATE POLICY inv_same_org ON invoices USING (org_id = current_org_id());
  DROP POLICY IF EXISTS inv_staff_bypass ON invoices;
  CREATE POLICY inv_staff_bypass ON invoices USING (is_staff_context());
  ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
END $repair_inv$;

-- ── org_memberships (Org-Isolation + Staff-Bypass; kein FORCE — wie 116) ───────
DO $repair_om$
BEGIN
  IF to_regclass('public.org_memberships') IS NULL THEN
    RAISE NOTICE '126: org_memberships fehlt — uebersprungen.'; RETURN;
  END IF;
  ALTER TABLE org_memberships ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS om_no_ctx ON org_memberships;
  DROP POLICY IF EXISTS om_same_org ON org_memberships;
  CREATE POLICY om_same_org ON org_memberships USING (org_id = current_org_id());
  DROP POLICY IF EXISTS om_staff_bypass ON org_memberships;
  CREATE POLICY om_staff_bypass ON org_memberships USING (is_staff_context());
END $repair_om$;

-- ── compliance_documents (reine org_id-Isolation; KEINE supplier_org_id) ───────
DO $repair_cd$
BEGIN
  IF to_regclass('public.compliance_documents') IS NULL THEN
    RAISE NOTICE '126: compliance_documents fehlt — uebersprungen.'; RETURN;
  END IF;
  ALTER TABLE compliance_documents ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS cd_no_ctx ON compliance_documents;
  DROP POLICY IF EXISTS cd_same_org ON compliance_documents;
  CREATE POLICY cd_same_org ON compliance_documents USING (org_id = current_org_id());
  DROP POLICY IF EXISTS cd_staff_bypass ON compliance_documents;
  CREATE POLICY cd_staff_bypass ON compliance_documents USING (is_staff_context());
END $repair_cd$;

-- ── vendor_pool_entries (out of scope — Tabelle existiert nicht; Guard) ────────
DO $repair_vpe$
BEGIN
  IF to_regclass('public.vendor_pool_entries') IS NULL THEN
    RAISE NOTICE '126: vendor_pool_entries fehlt — uebersprungen (out of scope).'; RETURN;
  END IF;
  ALTER TABLE vendor_pool_entries ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS vpe_no_ctx ON vendor_pool_entries;
  DROP POLICY IF EXISTS vpe_same_org ON vendor_pool_entries;
  CREATE POLICY vpe_same_org ON vendor_pool_entries
    USING (org_id = current_org_id() OR supplier_org_id = current_org_id());
  DROP POLICY IF EXISTS vpe_staff_bypass ON vendor_pool_entries;
  CREATE POLICY vpe_staff_bypass ON vendor_pool_entries USING (is_staff_context());
END $repair_vpe$;

-- ── subscription_requests (RLS NEU aktivieren; 116-only, auf Bestand fehlend) ──
DO $repair_subreq$
BEGIN
  IF to_regclass('public.subscription_requests') IS NULL THEN
    RAISE NOTICE '126: subscription_requests fehlt — uebersprungen.'; RETURN;
  END IF;
  ALTER TABLE subscription_requests ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS subreq_staff_bypass ON subscription_requests;
  CREATE POLICY subreq_staff_bypass ON subscription_requests USING (is_staff_context());
  DROP POLICY IF EXISTS subreq_same_org ON subscription_requests;
  CREATE POLICY subreq_same_org ON subscription_requests USING (org_id = current_org_id());
END $repair_subreq$;

-- ── commercial_offers (Mig 108; EIN-org-besitzt via org_id, kein buyer/seller) ─
DO $repair_co$
BEGIN
  IF to_regclass('public.commercial_offers') IS NULL THEN
    RAISE NOTICE '126: commercial_offers fehlt — uebersprungen.'; RETURN;
  END IF;
  ALTER TABLE commercial_offers ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS co_staff_bypass ON commercial_offers;
  CREATE POLICY co_staff_bypass ON commercial_offers USING (is_staff_context());
  DROP POLICY IF EXISTS co_same_org ON commercial_offers;
  CREATE POLICY co_same_org ON commercial_offers USING (org_id = current_org_id());
END $repair_co$;

-- ── audit_log (Staff sieht alles; Org sieht eigene + globale NULL-org-Eintraege) ─
DO $repair_al$
BEGIN
  IF to_regclass('public.audit_log') IS NULL THEN
    RAISE NOTICE '126: audit_log fehlt — uebersprungen.'; RETURN;
  END IF;
  ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS al_staff_bypass ON audit_log;
  CREATE POLICY al_staff_bypass ON audit_log USING (is_staff_context());
  DROP POLICY IF EXISTS al_same_org ON audit_log;
  CREATE POLICY al_same_org ON audit_log USING (org_id = current_org_id() OR org_id IS NULL);
END $repair_al$;

DO $$ BEGIN
  RAISE NOTICE '126_rls_forward_repair.sql: Deny-by-Default-Backstop (116-Endzustand) idempotent hergestellt.';
END $$;
