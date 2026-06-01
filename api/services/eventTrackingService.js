/**
 * Platform Event Tracking Service.
 * Writes structured events to platform_events for analytics dashboards.
 */

const VALID_EVENT_TYPES = [
  'supplier_invited', 'supplier_approved', 'supplier_blocked',
  'requisition_created', 'requisition_distributed', 'requisition_filled',
  'offer_submitted', 'deal_completed', 'deal_cancelled',
  'rating_submitted',
  'capacity_published', 'capacity_expired', 'capacity_filled',
  'assignment_started', 'assignment_completed',
  // Enterprise Foundation (migration 025)
  'profile_updated', 'search_job_created', 'search_job_closed',
  'offer_created', 'offer_accepted', 'offer_rejected', 'offer_withdrawn', 'offer_countered',
  'document_uploaded', 'document_verified', 'document_expired',
  'org_created', 'org_updated', 'member_added', 'member_removed',
  'role_changed', 'login', 'password_changed',
  'capacity_interest', 'match_found', 'notification_sent',
  // Premium Inserat analytics (migration 045)
  'listing_viewed', 'listing_clicked', 'listing_matched'
];

/**
 * Record a platform event.
 * @param {import('pg').Pool} pool
 * @param {Object} event
 * @param {string} event.event_type
 * @param {string} [event.actor_id]
 * @param {string} [event.org_id]
 * @param {string} [event.entity_type]
 * @param {string} [event.entity_id]
 * @param {string} [event.target_org_id]
 * @param {Object} [event.metadata]
 */
export async function trackEvent(pool, event) {
  if (!VALID_EVENT_TYPES.includes(event.event_type)) {
    throw new Error('Invalid event_type: ' + event.event_type);
  }
  const { rows } = await pool.query(
    `INSERT INTO platform_events
     (event_type, actor_id, org_id, entity_type, entity_id, target_org_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      event.event_type,
      event.actor_id || null,
      event.org_id || null,
      event.entity_type || null,
      event.entity_id || null,
      event.target_org_id || null,
      event.metadata ? JSON.stringify(event.metadata) : '{}'
    ]
  );
  return rows[0];
}

/**
 * Query platform events with optional filters.
 */
export async function queryEvents(pool, filters = {}) {
  const params = [];
  const where = [];
  let idx = 1;

  if (filters.event_type) {
    where.push(`pe.event_type = $${idx}`); params.push(filters.event_type); idx++;
  }
  if (filters.org_id) {
    where.push(`(pe.org_id = $${idx} OR pe.target_org_id = $${idx})`); params.push(filters.org_id); idx++;
  }
  if (filters.actor_id) {
    where.push(`pe.actor_id = $${idx}`); params.push(filters.actor_id); idx++;
  }
  if (filters.entity_type) {
    where.push(`pe.entity_type = $${idx}`); params.push(filters.entity_type); idx++;
  }
  if (filters.from_date) {
    where.push(`pe.created_at >= $${idx}`); params.push(filters.from_date); idx++;
  }
  if (filters.to_date) {
    where.push(`pe.created_at <= $${idx}`); params.push(filters.to_date); idx++;
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(500, filters.limit || 100);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT pe.*,
            u.email AS actor_email, u.company_name AS actor_name
     FROM platform_events pe
     LEFT JOIN users u ON u.id = pe.actor_id
     ${whereClause}
     ORDER BY pe.created_at DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

/**
 * Aggregated event counts by type, optionally scoped to an org and time window.
 */
export async function eventCounts(pool, orgId = null, days = 30) {
  const params = [days];
  let orgClause = '';
  if (orgId) {
    params.push(orgId);
    orgClause = `AND (pe.org_id = $${params.length} OR pe.target_org_id = $${params.length})`;
  }

  const { rows } = await pool.query(
    `SELECT pe.event_type, COUNT(*)::int AS count
     FROM platform_events pe
     WHERE pe.created_at >= NOW() - ($1 || ' days')::interval ${orgClause}
     GROUP BY pe.event_type
     ORDER BY count DESC`,
    params
  );

  const totals = {};
  let total = 0;
  for (const r of rows) {
    totals[r.event_type] = r.count;
    total += r.count;
  }
  return { period_days: days, total, by_type: totals };
}
