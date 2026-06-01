/**
 * Spend Analytics Service — Procurement-Kostenanalyse.
 *
 * Spend-Definition:
 *   Actual Spend   = SUM(timesheets.total_hours × assignments.hourly_rate_cents) für approved Timesheets
 *   Overtime Spend  = SUM(timesheets.overtime_hours × rate × 1.25)
 *   Projected Spend = rate × 40h/Woche × verbleibende Wochen (aktive Assignments)
 *   Over-Rate Spend = Delta wo Ist > Rate-Card-Target
 *
 * Alle Queries org-scoped (Buyer-Perspektive), Beträge in Cent (EUR).
 */
import { buildAssignmentActivePredicateSql } from "./assignmentLifecycleService.js";

const spendAssignmentIsCurrentSql = buildAssignmentActivePredicateSql({ assignmentAlias: "a" });

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function dateFilterClause(filters, params, alias = "t") {
  const clauses = [];
  if (filters.dateFrom) {
    params.push(filters.dateFrom);
    clauses.push(`${alias}.week_start >= $${params.length}::date`);
  }
  if (filters.dateTo) {
    params.push(filters.dateTo);
    clauses.push(`${alias}.week_start <= $${params.length}::date`);
  }
  return clauses.join(" AND ");
}

function optionalFilter(filters, params, clauses, alias = "a") {
  if (filters.vendorId) {
    params.push(filters.vendorId);
    clauses.push(`${alias}.supplier_org_id = $${params.length}`);
  }
  if (filters.category) {
    params.push(`%${filters.category}%`);
    clauses.push(`r.role ILIKE $${params.length}`);
  }
  if (filters.region) {
    params.push(`%${filters.region}%`);
    clauses.push(`(ol.city ILIKE $${params.length} OR ol.name ILIKE $${params.length})`);
  }
  if (filters.assignmentStatus) {
    params.push(filters.assignmentStatus);
    clauses.push(`${alias}.status = $${params.length}`);
  }
  // Location-Scope: filtert Timesheets/Assignments nach Standort der verknuepften Requisition.
  // Assignments ohne Requisition (r.location_id IS NULL) werden bei Standortfilter NICHT gezaehlt
  // — sie koennen keinem Standort zugeordnet werden und verzerren den Standort-Spend.
  if (filters.locationId) {
    params.push(filters.locationId);
    clauses.push(`r.location_id = $${params.length}::uuid`);
  }
}

/* ── Spend Summary (KPI Tiles) ─────────────────────────────────────────── */

/**
 * KPI-Aggregate: Total Spend, Vendor Count, Avg Rate, Over-Rate Spend, Projected Spend.
 */
export async function getSpendSummary(pool, orgId, filters = {}) {
  const params = [orgId];
  const where = ["a.org_id = $1", "t.status = 'approved'"];
  const dateW = dateFilterClause(filters, params, "t");
  if (dateW) where.push(dateW);
  optionalFilter(filters, params, where);

  const { rows: [row] } = await pool.query(
    `SELECT
       COALESCE(SUM(t.total_hours * a.hourly_rate_cents), 0)::bigint AS total_spend_cents,
       COALESCE(SUM(t.overtime_hours * a.hourly_rate_cents * 1.25), 0)::bigint AS overtime_spend_cents,
       COUNT(DISTINCT a.id)::int AS assignment_count,
       COUNT(DISTINCT a.supplier_org_id)::int AS vendor_count,
       ROUND(AVG(a.hourly_rate_cents))::int AS avg_rate_cents,
       COUNT(DISTINCT t.id)::int AS timesheet_count,
       COALESCE(SUM(t.total_hours), 0)::numeric(12,2) AS total_hours
     FROM timesheets t
     JOIN assignments a ON a.id = t.assignment_id
     LEFT JOIN requisitions r ON r.id = a.requisition_id
     LEFT JOIN org_locations ol ON ol.id = r.location_id
     WHERE ${where.join(" AND ")}`,
    params
  );

  // Projected spend for active assignments (gleicher Location-Scope wie Actual-Spend)
  const projParams = [orgId];
  const projWhere = ["a.org_id = $1", "a.status = 'active'", spendAssignmentIsCurrentSql];
  optionalFilter(filters, projParams, projWhere);  // inklusive locationId-Filter wenn gesetzt
  const { rows: [proj] } = await pool.query(
    `SELECT COALESCE(SUM(
       a.hourly_rate_cents * 40 *
       GREATEST(((COALESCE(a.planned_end_date, CURRENT_DATE + 90) - CURRENT_DATE)::numeric / 7), 0)
     ), 0)::bigint AS projected_spend_cents,
     COUNT(*)::int AS active_assignments
     FROM assignments a
     LEFT JOIN requisitions r ON r.id = a.requisition_id
     LEFT JOIN org_locations ol ON ol.id = r.location_id
     WHERE ${projWhere.join(" AND ")}`,
    projParams
  );

  // Over-rate spend (vs Rate Cards, graceful if no cards)
  let overRateSpendCents = 0;
  let overRateCount = 0;
  try {
    const overParams = [orgId];
    const overWhere = ["a.org_id = $1", "t.status = 'approved'"];
    const overDateW = dateFilterClause(filters, overParams, "t");
    if (overDateW) overWhere.push(overDateW);
    optionalFilter(filters, overParams, overWhere);
    const { rows: [ovr] } = await pool.query(
      `SELECT
         COALESCE(SUM((a.hourly_rate_cents - rc.target_rate_cents) * t.total_hours), 0)::bigint AS over_rate_spend_cents,
         COUNT(DISTINCT a.id)::int AS over_rate_count
       FROM timesheets t
       JOIN assignments a ON a.id = t.assignment_id
       LEFT JOIN requisitions r ON r.id = a.requisition_id
       LEFT JOIN org_locations ol ON ol.id = r.location_id
       JOIN rate_cards rc ON rc.org_id = a.org_id
         AND rc.role_category ILIKE COALESCE(
           (SELECT req.role FROM requisitions req WHERE req.id = a.requisition_id),
           'NO_MATCH'
         )
         AND rc.status = 'active'
         AND rc.valid_from <= t.week_start
         AND (rc.valid_to IS NULL OR rc.valid_to >= t.week_start)
       WHERE ${overWhere.join(" AND ")}
         AND a.hourly_rate_cents > rc.target_rate_cents`,
      overParams
    );
    overRateSpendCents = ovr?.over_rate_spend_cents || 0;
    overRateCount = ovr?.over_rate_count || 0;
  } catch {
    // rate_cards table may not exist yet — graceful degradation
  }

  return {
    total_spend_cents: row?.total_spend_cents || 0,
    overtime_spend_cents: row?.overtime_spend_cents || 0,
    projected_spend_cents: proj?.projected_spend_cents || 0,
    over_rate_spend_cents: overRateSpendCents,
    over_rate_count: overRateCount,
    assignment_count: row?.assignment_count || 0,
    active_assignments: proj?.active_assignments || 0,
    vendor_count: row?.vendor_count || 0,
    avg_rate_cents: row?.avg_rate_cents || 0,
    timesheet_count: row?.timesheet_count || 0,
    total_hours: parseFloat(row?.total_hours) || 0
  };
}

/* ── Spend by Vendor ───────────────────────────────────────────────────── */

export async function getSpendByVendor(pool, orgId, filters = {}) {
  const params = [orgId];
  const where = ["a.org_id = $1", "t.status = 'approved'"];
  const dateW = dateFilterClause(filters, params, "t");
  if (dateW) where.push(dateW);
  optionalFilter(filters, params, where);

  const limit = Math.min(filters.limit || 20, 100);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT
       a.supplier_org_id,
       so.name AS supplier_name,
       COALESCE(SUM(t.total_hours * a.hourly_rate_cents), 0)::bigint AS spend_cents,
       COALESCE(SUM(t.total_hours), 0)::numeric(12,2) AS hours,
       ROUND(AVG(a.hourly_rate_cents))::int AS avg_rate_cents,
       COUNT(DISTINCT a.id)::int AS assignment_count
     FROM timesheets t
     JOIN assignments a ON a.id = t.assignment_id
     LEFT JOIN organizations so ON so.id = a.supplier_org_id
     LEFT JOIN requisitions r ON r.id = a.requisition_id
     LEFT JOIN org_locations ol ON ol.id = r.location_id
     WHERE ${where.join(" AND ")}
     GROUP BY a.supplier_org_id, so.name
     ORDER BY spend_cents DESC
     LIMIT $${params.length}`,
    params
  );
  return rows;
}

/* ── Spend by Category (Role) ──────────────────────────────────────────── */

export async function getSpendByCategory(pool, orgId, filters = {}) {
  const params = [orgId];
  const where = ["a.org_id = $1", "t.status = 'approved'"];
  const dateW = dateFilterClause(filters, params, "t");
  if (dateW) where.push(dateW);
  optionalFilter(filters, params, where);

  const { rows } = await pool.query(
    `SELECT
       COALESCE(r.role, 'Unbekannt') AS category,
       COALESCE(SUM(t.total_hours * a.hourly_rate_cents), 0)::bigint AS spend_cents,
       COALESCE(SUM(t.total_hours), 0)::numeric(12,2) AS hours,
       ROUND(AVG(a.hourly_rate_cents))::int AS avg_rate_cents,
       COUNT(DISTINCT a.id)::int AS assignment_count
     FROM timesheets t
     JOIN assignments a ON a.id = t.assignment_id
     LEFT JOIN requisitions r ON r.id = a.requisition_id
     LEFT JOIN org_locations ol ON ol.id = r.location_id
     WHERE ${where.join(" AND ")}
     GROUP BY r.role
     ORDER BY spend_cents DESC`,
    params
  );
  return rows;
}

/* ── Spend by Region ───────────────────────────────────────────────────── */

export async function getSpendByRegion(pool, orgId, filters = {}) {
  const params = [orgId];
  const where = ["a.org_id = $1", "t.status = 'approved'"];
  const dateW = dateFilterClause(filters, params, "t");
  if (dateW) where.push(dateW);
  optionalFilter(filters, params, where);

  const { rows } = await pool.query(
    `SELECT
       COALESCE(ol.city, ol.name, 'Unbekannt') AS region,
       COALESCE(SUM(t.total_hours * a.hourly_rate_cents), 0)::bigint AS spend_cents,
       COALESCE(SUM(t.total_hours), 0)::numeric(12,2) AS hours,
       ROUND(AVG(a.hourly_rate_cents))::int AS avg_rate_cents,
       COUNT(DISTINCT a.id)::int AS assignment_count
     FROM timesheets t
     JOIN assignments a ON a.id = t.assignment_id
     LEFT JOIN requisitions r ON r.id = a.requisition_id
     LEFT JOIN org_locations ol ON ol.id = r.location_id
     WHERE ${where.join(" AND ")}
     GROUP BY ol.city, ol.name
     ORDER BY spend_cents DESC`,
    params
  );
  return rows;
}

/* ── Spend over Time (monthly) ─────────────────────────────────────────── */

export async function getSpendOverTime(pool, orgId, filters = {}) {
  const params = [orgId];
  const where = ["a.org_id = $1", "t.status = 'approved'"];
  const dateW = dateFilterClause(filters, params, "t");
  if (dateW) where.push(dateW);
  optionalFilter(filters, params, where);

  // Whitelist + Parameterisierung: Template-Literal wird vermieden, um SQL-Injection bei
  // zukuenftigen Code-Aenderungen auszuschliessen. PostgreSQL unterstuetzt date_trunc($N, ...).
  const granularity = filters.granularity === "quarterly" ? "quarter" : "month";
  params.push(granularity);
  const granIdx = params.length;

  const { rows } = await pool.query(
    `SELECT
       DATE_TRUNC($${granIdx}, t.week_start)::date AS period,
       COALESCE(SUM(t.total_hours * a.hourly_rate_cents), 0)::bigint AS spend_cents,
       COALESCE(SUM(t.total_hours), 0)::numeric(12,2) AS hours,
       ROUND(AVG(a.hourly_rate_cents))::int AS avg_rate_cents,
       COUNT(DISTINCT a.id)::int AS assignment_count
     FROM timesheets t
     JOIN assignments a ON a.id = t.assignment_id
     LEFT JOIN requisitions r ON r.id = a.requisition_id
     LEFT JOIN org_locations ol ON ol.id = r.location_id
     WHERE ${where.join(" AND ")}
     GROUP BY period
     ORDER BY period ASC`,
    params
  );
  return rows;
}

/* ── Rate Comparison (Ist vs. Rate Card) ───────────────────────────────── */

export async function getRateComparison(pool, orgId, filters = {}) {
  const params = [orgId];
  const where = ["a.org_id = $1", "t.status = 'approved'"];
  const dateW = dateFilterClause(filters, params, "t");
  if (dateW) where.push(dateW);
  optionalFilter(filters, params, where);

  try {
    const { rows } = await pool.query(
      `SELECT
         r.role AS category,
         so.name AS supplier_name,
         ROUND(AVG(a.hourly_rate_cents))::int AS actual_avg_cents,
         ROUND(AVG(rc.target_rate_cents))::int AS target_avg_cents,
         ROUND(AVG(rc.max_rate_cents))::int AS max_avg_cents,
         ROUND(AVG(a.hourly_rate_cents) - AVG(rc.target_rate_cents))::int AS deviation_cents,
         ROUND(100.0 * (AVG(a.hourly_rate_cents) - AVG(rc.target_rate_cents))
               / NULLIF(AVG(rc.target_rate_cents), 0), 1) AS deviation_pct,
         COUNT(DISTINCT a.id)::int AS assignment_count
       FROM timesheets t
       JOIN assignments a ON a.id = t.assignment_id
       LEFT JOIN requisitions r ON r.id = a.requisition_id
       LEFT JOIN organizations so ON so.id = a.supplier_org_id
       LEFT JOIN org_locations ol ON ol.id = r.location_id
       LEFT JOIN rate_cards rc ON rc.org_id = a.org_id
         AND rc.role_category ILIKE r.role
         AND rc.status = 'active'
         AND rc.valid_from <= t.week_start
         AND (rc.valid_to IS NULL OR rc.valid_to >= t.week_start)
       WHERE ${where.join(" AND ")}
         AND r.role IS NOT NULL
       GROUP BY r.role, so.name
       HAVING AVG(rc.target_rate_cents) IS NOT NULL
       ORDER BY deviation_cents DESC`,
      params
    );
    return rows;
  } catch {
    // rate_cards table may not exist — graceful
    return [];
  }
}

/* ── Top Cost Drivers ──────────────────────────────────────────────────── */

export async function getTopCostDrivers(pool, orgId, filters = {}) {
  const params = [orgId];
  const where = ["a.org_id = $1", "t.status = 'approved'"];
  const dateW = dateFilterClause(filters, params, "t");
  if (dateW) where.push(dateW);
  optionalFilter(filters, params, where);

  const limit = Math.min(filters.limit || 10, 50);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT
       COALESCE(r.role, 'Unbekannt') AS category,
       so.name AS supplier_name,
       COALESCE(SUM(t.total_hours * a.hourly_rate_cents), 0)::bigint AS spend_cents,
       COALESCE(SUM(t.total_hours), 0)::numeric(12,2) AS hours,
       ROUND(AVG(a.hourly_rate_cents))::int AS avg_rate_cents,
       COUNT(DISTINCT a.id)::int AS assignment_count
     FROM timesheets t
     JOIN assignments a ON a.id = t.assignment_id
     LEFT JOIN requisitions r ON r.id = a.requisition_id
     LEFT JOIN organizations so ON so.id = a.supplier_org_id
     LEFT JOIN org_locations ol ON ol.id = r.location_id
     WHERE ${where.join(" AND ")}
     GROUP BY r.role, so.name
     ORDER BY spend_cents DESC
     LIMIT $${params.length}`,
    params
  );
  return rows;
}

/* ── Spend Trends (MoM) ───────────────────────────────────────────────── */

export async function getSpendTrends(pool, orgId, filters = {}) {
  const params = [orgId];
  const where = ["a.org_id = $1", "t.status = 'approved'"];
  // Default: letzte 12 Monate
  if (!filters.dateFrom) {
    where.push("t.week_start >= NOW() - INTERVAL '12 months'");
  } else {
    const dateW = dateFilterClause(filters, params, "t");
    if (dateW) where.push(dateW);
  }
  optionalFilter(filters, params, where);

  const { rows } = await pool.query(
    `WITH monthly AS (
       SELECT
         DATE_TRUNC('month', t.week_start)::date AS period,
         COALESCE(SUM(t.total_hours * a.hourly_rate_cents), 0)::bigint AS spend_cents,
         COALESCE(SUM(t.total_hours), 0)::numeric(12,2) AS hours
       FROM timesheets t
       JOIN assignments a ON a.id = t.assignment_id
       LEFT JOIN requisitions r ON r.id = a.requisition_id
       LEFT JOIN org_locations ol ON ol.id = r.location_id
       WHERE ${where.join(" AND ")}
       GROUP BY period
       ORDER BY period ASC
     )
     SELECT
       m.period,
       m.spend_cents,
       m.hours,
       LAG(m.spend_cents) OVER (ORDER BY m.period) AS prev_spend_cents,
       CASE WHEN LAG(m.spend_cents) OVER (ORDER BY m.period) > 0
         THEN ROUND(100.0 * (m.spend_cents - LAG(m.spend_cents) OVER (ORDER BY m.period))
              / LAG(m.spend_cents) OVER (ORDER BY m.period), 1)
         ELSE NULL
       END AS mom_change_pct
     FROM monthly m`,
    params
  );
  return rows;
}
