/**
 * Reporting-Service: KPIs, Executive Dashboard, Requisition-Statistik,
 * Vendor-Performance, Compliance-Uebersicht, Time-to-Fill, SLA-Reports.
 */

/* ── Requisition KPIs ─────────────────────────────────── */

export async function requisitionKpis(pool, orgId = null) {
  const orgClause = orgId ? 'WHERE r.org_id = $1' : '';
  const params = orgId ? [orgId] : [];

  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE r.status = 'OPEN')::int AS open,
       COUNT(*) FILTER (WHERE r.status = 'IN_REVIEW')::int AS in_review,
       COUNT(*) FILTER (WHERE r.status = 'SHORTLISTED')::int AS shortlisted,
       COUNT(*) FILTER (WHERE r.status = 'FILLED')::int AS filled,
       COUNT(*) FILTER (WHERE r.status = 'CLOSED')::int AS closed,
       COUNT(*) FILTER (WHERE r.status = 'CANCELLED')::int AS cancelled,
       COUNT(*) FILTER (WHERE r.status = 'DRAFT')::int AS draft,
       COUNT(*) FILTER (WHERE r.status = 'PENDING_APPROVAL')::int AS pending_approval,
       COUNT(*) FILTER (WHERE r.urgency = 'urgent' AND r.status IN ('OPEN','IN_REVIEW'))::int AS urgent_open,
       ROUND(AVG(EXTRACT(EPOCH FROM (r.filled_at - r.created_at)) / 3600)
         FILTER (WHERE r.filled_at IS NOT NULL), 1) AS avg_time_to_fill_hours,
       ROUND(AVG(EXTRACT(EPOCH FROM (r.approved_at - r.created_at)) / 3600)
         FILTER (WHERE r.approved_at IS NOT NULL), 1) AS avg_time_to_approve_hours
     FROM requisitions r
     ${orgClause}`,
    params
  );
  return rows[0];
}

/* ── Requisition pro Zeitraum (fuer Charts) ───────────── */

export async function requisitionsByPeriod(pool, orgId = null, days = 30) {
  const params = [days];
  let orgClause = '';
  if (orgId) { params.push(orgId); orgClause = `AND r.org_id = $${params.length}`; }

  const { rows } = await pool.query(
    `SELECT DATE_TRUNC('day', r.created_at)::date AS day,
            COUNT(*)::int AS created,
            COUNT(*) FILTER (WHERE r.status = 'FILLED')::int AS filled,
            COUNT(*) FILTER (WHERE r.status = 'CANCELLED')::int AS cancelled
     FROM requisitions r
     WHERE r.created_at >= NOW() - ($1 || ' days')::interval ${orgClause}
     GROUP BY day ORDER BY day ASC`,
    params
  );
  return rows;
}

/* ── Vendor Performance ──────────────────────────────── */

export async function vendorPerformance(pool, clientOrgId, limit = 20) {
  const { rows } = await pool.query(
    `SELECT
       vp.supplier_org_id,
       so.name AS supplier_name,
       vp.tier,
       COUNT(DISTINCT rc.id)::int AS total_candidates,
       COUNT(DISTINCT rc.id) FILTER (WHERE rc.status = 'shortlisted')::int AS shortlisted,
       COUNT(DISTINCT rc.id) FILTER (WHERE rc.status = 'accepted')::int AS accepted,
       COUNT(DISTINCT rc.id) FILTER (WHERE rc.status = 'rejected')::int AS rejected,
       ROUND(AVG(rc.match_score), 1) AS avg_match_score
     FROM vendor_pool vp
     LEFT JOIN organizations so ON so.id = vp.supplier_org_id
     LEFT JOIN requisition_candidates rc ON rc.supplier_org_id = vp.supplier_org_id
     WHERE vp.client_org_id = $1 AND vp.status = 'active'
     GROUP BY vp.supplier_org_id, so.name, vp.tier
     ORDER BY accepted DESC, shortlisted DESC
     LIMIT $2`,
    [clientOrgId, limit]
  );
  return rows;
}

/* ── Compliance Uebersicht ───────────────────────────── */

export async function complianceSummary(pool, orgId = null) {
  const orgClause = orgId ? 'WHERE cd.org_id = $1' : '';
  const params = orgId ? [orgId] : [];

  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total_documents,
       COUNT(*) FILTER (WHERE cd.status = 'verified')::int AS verified,
       COUNT(*) FILTER (WHERE cd.status = 'pending')::int AS pending,
       COUNT(*) FILTER (WHERE cd.status = 'rejected')::int AS rejected,
       COUNT(*) FILTER (WHERE cd.status = 'expired')::int AS expired,
       COUNT(*) FILTER (WHERE cd.status = 'verified' AND cd.valid_until IS NOT NULL
                        AND cd.valid_until <= NOW() + INTERVAL '30 days')::int AS expiring_soon
     FROM compliance_documents cd
     ${orgClause}`,
    params
  );
  return rows[0];
}

/* ── SLA Report ──────────────────────────────────────── */

export async function slaReport(pool, orgId = null, days = 30) {
  const params = [days];
  let orgClause = '';
  if (orgId) { params.push(orgId); orgClause = `AND r.org_id = $${params.length}`; }

  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total_with_sla,
       COUNT(*) FILTER (WHERE r.sla_status = 'MET')::int AS sla_met,
       COUNT(*) FILTER (WHERE r.sla_status = 'BREACHED')::int AS sla_breached,
       COUNT(*) FILTER (WHERE r.sla_status = 'RUNNING')::int AS sla_running,
       ROUND(100.0 * COUNT(*) FILTER (WHERE r.sla_status = 'MET')
             / NULLIF(COUNT(*) FILTER (WHERE r.sla_status IN ('MET','BREACHED')), 0), 1) AS sla_compliance_pct
     FROM requisitions r
     WHERE r.sla_minutes IS NOT NULL
       AND r.created_at >= NOW() - ($1 || ' days')::interval
       ${orgClause}`,
    params
  );
  return rows[0];
}

/* ── Executive Dashboard (kombiniert) ────────────────── */

export async function executiveDashboard(pool, orgId = null) {
  const [reqKpis, compliance, sla] = await Promise.all([
    requisitionKpis(pool, orgId),
    complianceSummary(pool, orgId),
    slaReport(pool, orgId, 30)
  ]);

  // Allgemeine Plattform-Statistik
  const { rows: platform } = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM users WHERE is_active = TRUE) AS total_users,
       (SELECT COUNT(*)::int FROM organizations WHERE is_active = TRUE) AS total_orgs,
       (SELECT COUNT(*)::int FROM capacity_posts WHERE is_active = TRUE) AS active_capacity_posts,
       (SELECT COUNT(*)::int FROM demand_requests WHERE status = 'open') AS open_demands,
       (SELECT COUNT(*)::int FROM vendor_pool WHERE status = 'active') AS active_vendor_entries`
  );

  return {
    requisitions: reqKpis,
    compliance,
    sla,
    platform: platform[0]
  };
}

/* ── Top-Rollen (meistgesuchte) ──────────────────────── */

export async function topRoles(pool, orgId = null, limit = 10) {
  const params = [limit];
  let orgClause = '';
  if (orgId) { params.push(orgId); orgClause = `WHERE r.org_id = $${params.length}`; }

  const { rows } = await pool.query(
    `SELECT r.role, COUNT(*)::int AS count,
            COUNT(*) FILTER (WHERE r.status = 'FILLED')::int AS filled
     FROM requisitions r
     ${orgClause}
     GROUP BY r.role ORDER BY count DESC LIMIT $1`,
    params
  );
  return rows;
}
