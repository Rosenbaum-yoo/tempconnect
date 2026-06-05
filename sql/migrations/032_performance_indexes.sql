-- =============================================================================
-- 032_performance_indexes.sql – Enterprise Performance Index Layer
-- =============================================================================
-- Composite indexes for the most frequent query patterns under production load.
-- All indexes use CREATE INDEX IF NOT EXISTS so the migration is idempotent.
-- CONCURRENTLY cannot be used inside a transaction; run AFTER migration applies.
-- =============================================================================

-- ── requisitions ─────────────────────────────────────────────────────────────
-- Primary list query: org + status filter, ordered by created_at
CREATE INDEX IF NOT EXISTS req_org_status_created_idx
  ON requisitions (org_id, status, created_at DESC);

-- Assigned-to filter (program manager / dispatcher workload view)
CREATE INDEX IF NOT EXISTS req_org_assigned_status_idx
  ON requisitions (org_id, assigned_to, status)
  WHERE assigned_to IS NOT NULL;

-- Urgency-based escalation queue
CREATE INDEX IF NOT EXISTS req_urgency_status_idx
  ON requisitions (urgency, status, created_at DESC)
  WHERE status IN ('OPEN', 'IN_REVIEW', 'SHORTLISTED');

-- Full-text search on title + role (used by /search endpoint)
CREATE INDEX IF NOT EXISTS req_fts_idx
  ON requisitions USING GIN (to_tsvector('german', coalesce(title,'') || ' ' || coalesce(role,'')));

-- ── capacity_posts ────────────────────────────────────────────────────────────
-- Active posts by location (used by marketplace)
CREATE INDEX IF NOT EXISTS cap_active_geo_idx
  ON capacity_posts (is_active, location_lat, location_lng)
  WHERE is_active = TRUE;

-- Supplier's own posts list
CREATE INDEX IF NOT EXISTS cap_supplier_status_idx
  ON capacity_posts (supplier_company_id, status, created_at DESC);

-- Role-based search
CREATE INDEX IF NOT EXISTS cap_role_active_idx
  ON capacity_posts (role, is_active, availability_from)
  WHERE is_active = TRUE;

-- Full-text on role + description
-- HINWEIS (2026-06-04): capacity_posts.description existiert im Schema nicht
-- (nie angelegt, keine App-Referenz). Ungeschuetzt brach der Index-Build die
-- Migration ab (frueher stumm maskiert). Guard -> Index nur wenn die Spalte
-- vorhanden ist; sonst sauberer No-Op (dieser FTS-Index wird nirgends genutzt).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'capacity_posts' AND column_name = 'description'
  ) THEN
    EXECUTE $idx$CREATE INDEX IF NOT EXISTS cap_fts_idx ON capacity_posts USING GIN (to_tsvector('german', coalesce(role,'') || ' ' || coalesce(description,'')))$idx$;
  ELSE
    RAISE NOTICE '032: capacity_posts.description fehlt — cap_fts_idx uebersprungen (out of scope).';
  END IF;
END $$;

-- ── worker_time_submissions ────────────────────────────────────────────────
-- Reviewer queue: pending submissions per org
CREATE INDEX IF NOT EXISTS wts_org_status_idx
  ON worker_time_submissions (org_id, status, created_at DESC)
  WHERE status IN ('submitted', 'under_review');

-- Worker's own submission history
CREATE INDEX IF NOT EXISTS wts_worker_week_idx
  ON worker_time_submissions (worker_user_id, week_start DESC);

-- Supplier's submission management
CREATE INDEX IF NOT EXISTS wts_supplier_status_idx
  ON worker_time_submissions (supplier_org_id, status, week_start DESC);

-- ── timesheets ─────────────────────────────────────────────────────────────
-- Already indexed in 027_timesheets.sql; add cross-org approved for billing
CREATE INDEX IF NOT EXISTS ts_org_approved_idx
  ON timesheets (org_id, approved_at DESC)
  WHERE status = 'approved';

-- ── org_memberships ─────────────────────────────────────────────────────────
-- User's membership lookup (used at every authenticated request)
CREATE INDEX IF NOT EXISTS om_user_org_active_idx
  ON org_memberships (user_id, org_id, is_active)
  WHERE is_active = TRUE;

-- Org member list (admin console)
CREATE INDEX IF NOT EXISTS om_org_role_idx
  ON org_memberships (org_id, role_key, is_active);

-- ── audit_log ─────────────────────────────────────────────────────────────
-- Recent activity per entity
CREATE INDEX IF NOT EXISTS audit_entity_time_idx
  ON audit_log (entity_type, entity_id, created_at DESC);

-- Actor activity (user audit trail)
CREATE INDEX IF NOT EXISTS audit_actor_time_idx
  ON audit_log (actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;

-- ── notifications ─────────────────────────────────────────────────────────
-- User inbox query (most frequent: unread first)
CREATE INDEX IF NOT EXISTS notif_user_unread_idx
  ON notifications (user_id, is_read, created_at DESC)
  WHERE is_read = FALSE;

-- ── invoices ─────────────────────────────────────────────────────────────
-- Already covered in 030_invoicing.sql; add overdue detection scan
CREATE INDEX IF NOT EXISTS inv_overdue_idx
  ON invoices (due_at, status)
  WHERE status IN ('issued', 'overdue') AND due_at IS NOT NULL;

-- ── deals / requests ─────────────────────────────────────────────────────
-- HINWEIS (2026-06-04): Eine Tabelle "deals" wird im gesamten Migrations-Baum
-- NIE angelegt. Das Domaenenkonzept lebt als commercial_offers (mit
-- buyer_org_id/seller_org_id — andere Spalten, daher kein 1:1-Rename moeglich).
-- Ungeschuetzt brachen diese Indizes die Migration ab (frueher stumm maskiert).
-- Guard -> No-Op solange keine "deals"-Tabelle existiert; bringt ein Feature
-- spaeter eine solche Tabelle mit, liefert es seine Indizes in eigener Migration.
DO $$
BEGIN
  IF to_regclass('public.deals') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS deals_company_status_idx ON deals (company_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS deals_agency_status_idx  ON deals (agency_id, status, created_at DESC);
  ELSE
    RAISE NOTICE '032: Tabelle deals fehlt — deals_*_status_idx uebersprungen (Konzept lebt als commercial_offers, out of scope).';
  END IF;
END $$;

-- ── vendor_pool_entries ───────────────────────────────────────────────────
-- Fast preferred-vendor lookup for matching engine.
-- HINWEIS (2026-06-04): vendor_pool_entries wird nirgends angelegt (out of scope,
-- vgl. 031/116). Guard -> No-Op solange die Tabelle fehlt.
DO $$
BEGIN
  IF to_regclass('public.vendor_pool_entries') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS vpe_org_tier_idx ON vendor_pool_entries (org_id, tier, supplier_org_id);
  ELSE
    RAISE NOTICE '032: vendor_pool_entries fehlt — vpe_org_tier_idx uebersprungen (out of scope).';
  END IF;
END $$;
