/**
 * Workforce Analytics Service.
 * Provides KPIs: response time, time-to-fill, offers per request,
 * deal conversion rate, supplier response performance.
 */

/* ── Workforce Analytics (combined) ───────────────────── */

/**
 * @param {import('pg').Pool} pool
 * @param {string|null} orgId - scope to org, or null for platform-wide
 * @param {number} days - look-back window
 */
export async function getWorkforceAnalytics(pool, orgId = null, days = 30) {
  const params = [days];
  let orgClause = '';
  if (orgId) { params.push(orgId); orgClause = `AND r.requester_id IN (SELECT id FROM users WHERE org_id = $${params.length})`; }

  // Base metrics from requests table
  const { rows: base } = await pool.query(
    `SELECT
       COUNT(*)::int AS total_requests,
       COUNT(*) FILTER (WHERE r.status IN ('ACCEPTED','CONFIRMED','FILLED','FINALIZED','COMPLETED','ASSIGNMENT_STARTED'))::int AS accepted_requests,
       COUNT(*) FILTER (WHERE r.status IN ('FILLED','FINALIZED','COMPLETED'))::int AS filled_requests,
       COUNT(*) FILTER (WHERE r.status = 'FINALIZED')::int AS finalized_requests,
       COUNT(*) FILTER (WHERE r.status = 'COMPLETED')::int AS completed_requests,
       ROUND(AVG(EXTRACT(EPOCH FROM (
         CASE WHEN r.status IN ('ACCEPTED','CONFIRMED','FILLED','FINALIZED','COMPLETED','ASSIGNMENT_STARTED')
              THEN r.updated_at ELSE NULL END
         - r.created_at)) / 3600)
         FILTER (WHERE r.status IN ('ACCEPTED','CONFIRMED','FILLED','FINALIZED','COMPLETED','ASSIGNMENT_STARTED')), 1
       ) AS avg_response_time_hours,
       ROUND(AVG(EXTRACT(EPOCH FROM (
         CASE WHEN r.status IN ('FILLED','FINALIZED','COMPLETED')
              THEN r.updated_at ELSE NULL END
         - r.created_at)) / 3600)
         FILTER (WHERE r.status IN ('FILLED','FINALIZED','COMPLETED')), 1
       ) AS avg_time_to_fill_hours
     FROM requests r
     WHERE r.created_at >= NOW() - ($1 || ' days')::interval ${orgClause}`,
    params
  );
  const m = base[0];

  // Offers per request (from requisition_candidates)
  const rParams = [days];
  let rOrgClause = '';
  if (orgId) { rParams.push(orgId); rOrgClause = `AND req.org_id = $${rParams.length}`; }

  const { rows: offerRows } = await pool.query(
    `SELECT
       COUNT(DISTINCT req.id)::int AS requisitions_with_candidates,
       COUNT(rc.id)::int AS total_candidates,
       ROUND(COUNT(rc.id)::numeric / NULLIF(COUNT(DISTINCT req.id), 0), 2) AS offers_per_request
     FROM requisitions req
     LEFT JOIN requisition_candidates rc ON rc.requisition_id = req.id
     WHERE req.created_at >= NOW() - ($1 || ' days')::interval ${rOrgClause}`,
    rParams
  );

  const totalDeals = (m.finalized_requests || 0) + (m.completed_requests || 0);
  const conversionRate = m.total_requests > 0
    ? Math.round((totalDeals / m.total_requests) * 1000) / 1000
    : 0;

  return {
    period_days: days,
    total_requests: m.total_requests,
    accepted_requests: m.accepted_requests,
    filled_requests: m.filled_requests,
    completed_deals: totalDeals,
    avg_response_time_hours: m.avg_response_time_hours != null ? Number(m.avg_response_time_hours) : null,
    avg_time_to_fill_hours: m.avg_time_to_fill_hours != null ? Number(m.avg_time_to_fill_hours) : null,
    offers_per_request: offerRows[0]?.offers_per_request != null ? Number(offerRows[0].offers_per_request) : null,
    deal_conversion_rate: conversionRate
  };
}

/* ── Conversion Funnel ────────────────────────────────── */

export async function getConversionFunnel(pool, orgId = null, days = 30) {
  const params = [days];
  let orgClause = '';
  if (orgId) { params.push(orgId); orgClause = `AND r.requester_id IN (SELECT id FROM users WHERE org_id = $${params.length})`; }

  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS sent,
       COUNT(*) FILTER (WHERE r.status IN ('ACCEPTED','CONFIRMED','FILLED','FINALIZED','COMPLETED','ASSIGNMENT_STARTED'))::int AS accepted,
       COUNT(*) FILTER (WHERE r.status IN ('FILLED','FINALIZED','COMPLETED'))::int AS filled,
       COUNT(*) FILTER (WHERE r.status IN ('FINALIZED','COMPLETED'))::int AS finalized,
       COUNT(*) FILTER (WHERE r.status = 'DECLINED')::int AS declined,
       COUNT(*) FILTER (WHERE r.status = 'CANCELED')::int AS cancelled
     FROM requests r
     WHERE r.created_at >= NOW() - ($1 || ' days')::interval ${orgClause}`,
    params
  );
  return rows[0];
}

/* ── Supplier Response Performance ────────────────────── */

/**
 * Top suppliers ranked by average response speed.
 */
export async function supplierResponsePerformance(pool, orgId = null, days = 30, limit = 20) {
  const params = [days, limit];
  let orgClause = '';
  if (orgId) { params.push(orgId); orgClause = `AND r.requester_id IN (SELECT id FROM users WHERE org_id = $${params.length})`; }

  const { rows } = await pool.query(
    `SELECT
       r.receiver_id AS supplier_id,
       u.company_name AS supplier_name,
       COUNT(*)::int AS total_requests,
       COUNT(*) FILTER (WHERE r.status IN ('ACCEPTED','CONFIRMED','FILLED','FINALIZED','COMPLETED'))::int AS accepted,
       ROUND(AVG(EXTRACT(EPOCH FROM (r.updated_at - r.created_at)) / 3600)
         FILTER (WHERE r.status NOT IN ('SENT','CREATED')), 1
       ) AS avg_response_hours,
       ROUND(
         COUNT(*) FILTER (WHERE r.status IN ('FILLED','FINALIZED','COMPLETED'))::numeric
         / NULLIF(COUNT(*), 0), 3
       ) AS fill_rate
     FROM requests r
     JOIN users u ON u.id = r.receiver_id
     WHERE r.created_at >= NOW() - ($1 || ' days')::interval
       AND r.receiver_id IS NOT NULL
       ${orgClause}
     GROUP BY r.receiver_id, u.company_name
     HAVING COUNT(*) >= 1
     ORDER BY avg_response_hours ASC NULLS LAST
     LIMIT $2`,
    params
  );
  return rows;
}
