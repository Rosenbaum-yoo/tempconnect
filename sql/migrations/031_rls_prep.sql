-- =============================================================================
-- 031_rls_prep.sql – Row-Level Security (RLS) Preparation
-- =============================================================================
-- Enables RLS policies on org-scoped tables as a defence-in-depth layer.
-- The application RBAC remains the primary enforcement layer.
-- RLS is the database-level backstop preventing cross-tenant data leakage
-- in case of application bugs or direct DB access.
--
-- Strategy: Use a session variable `app.current_org_id` that the API sets at
-- connection time via SET LOCAL. Policies filter rows by this variable.
--
-- NOTE: RLS is currently PERMISSIVE (not enforced) until SET LOCAL is wired
-- in the connection pool. This migration sets up the foundation but does NOT
-- break existing behaviour (policies use FORCE ROW LEVEL SECURITY only where
-- safe to do so incrementally).
-- =============================================================================

-- ── Helper: current_org_id session variable ───────────────────────────────
-- The API layer sets this per-request: SET LOCAL app.current_org_id = 'uuid';
-- Falls back to NULL (no RLS filtering) if not set — safe for service accounts.

CREATE OR REPLACE FUNCTION current_org_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_org_id', TRUE), '')::UUID;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── requisitions ────────────────────────────────────────────────────────────
ALTER TABLE requisitions ENABLE ROW LEVEL SECURITY;

-- Allow full access when org context is not set (service-account / migrations)
CREATE POLICY req_no_ctx ON requisitions
  USING (current_org_id() IS NULL);

-- Allow access when row's org matches current session org
CREATE POLICY req_same_org ON requisitions
  USING (org_id = current_org_id());

-- ── timesheets ───────────────────────────────────────────────────────────────
ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY ts_no_ctx ON timesheets
  USING (current_org_id() IS NULL);

CREATE POLICY ts_same_org ON timesheets
  USING (org_id = current_org_id() OR supplier_org_id = current_org_id());

-- ── invoices ─────────────────────────────────────────────────────────────────
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY inv_no_ctx ON invoices
  USING (current_org_id() IS NULL);

CREATE POLICY inv_same_org ON invoices
  USING (org_id = current_org_id());

-- ── org_memberships ──────────────────────────────────────────────────────────
-- Prevent users from querying memberships outside their orgs
ALTER TABLE org_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY om_no_ctx ON org_memberships
  USING (current_org_id() IS NULL);

CREATE POLICY om_same_org ON org_memberships
  USING (org_id = current_org_id());

-- ── vendor_pool_entries ──────────────────────────────────────────────────────
-- HINWEIS (2026-06-04): vendor_pool_entries wird im Migrations-Baum NIRGENDS
-- angelegt (Feature out of scope, keine App-Referenz). Ungeschuetzt brach diese
-- Stelle die gesamte Migration ab (frueher stumm maskiert). Guard -> No-Op
-- solange die Tabelle fehlt; bringt das Feature spaeter seine Tabelle mit,
-- greift die RLS-Praeparation in dessen eigener Migration.
DO $$
BEGIN
  IF to_regclass('public.vendor_pool_entries') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE vendor_pool_entries ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY vpe_no_ctx ON vendor_pool_entries USING (current_org_id() IS NULL)';
    EXECUTE 'CREATE POLICY vpe_same_org ON vendor_pool_entries USING (org_id = current_org_id() OR supplier_org_id = current_org_id())';
  ELSE
    RAISE NOTICE '031: vendor_pool_entries fehlt — RLS-Prep uebersprungen (out of scope).';
  END IF;
END $$;

-- ── compliance_documents ─────────────────────────────────────────────────────
ALTER TABLE compliance_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY cd_no_ctx ON compliance_documents
  USING (current_org_id() IS NULL);

-- HINWEIS (2026-06-04): compliance_documents hat KEINE supplier_org_id-Spalte
-- (Schema 019: org_id ist die einzige Eigentuemer-Dimension). Die urspruengliche
-- "OR supplier_org_id = current_org_id()"-Klausel war ein Copy-Paste aus dem
-- timesheets-Muster und referenzierte eine nicht existente Spalte -> ERROR brach
-- die Migration ab (vom ungehaerteten Runner frueher stumm maskiert; cd_same_org
-- wurde real nie angelegt). Korrekt: reine org_id-Isolation — jede Org sieht
-- ausschliesslich ihre eigenen Compliance-Dokumente.
CREATE POLICY cd_same_org ON compliance_documents
  USING (org_id = current_org_id());

-- ── Comment: how to wire this in the API ─────────────────────────────────────
-- In api/middleware/orgContext.js, after setting req.orgId, add:
--   await pool.query("SET LOCAL app.current_org_id = $1", [req.orgId]);
-- This works with a transaction-scoped connection from pool.connect().
-- For simple pool.query() calls, use SET SESSION instead (less strict).
