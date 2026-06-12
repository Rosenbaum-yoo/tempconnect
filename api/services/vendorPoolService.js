/**
 * Vendor Pool Service: Verwaltung der zugelassenen Lieferanten pro Client-Org.
 * Tiers: PREFERRED, SECONDARY, TRIAL, RESTRICTED, BLOCKED.
 * Aktionen: hinzufuegen, Tier aendern, sperren, entfernen, auflisten.
 * VMS-Erweiterung: History-Logging, Notes, enriched list mit KPIs, Dashboard.
 */

import { assertLocationBelongsToOrg, assertDepartmentBelongsToOrg } from "../utils/orgBoundary.js";
import { swallow } from "../utils/logger.js";

export const VALID_TIERS = ['PREFERRED', 'SECONDARY', 'TRIAL', 'RESTRICTED', 'BLOCKED'];
export const VALID_STATUSES = ['active', 'suspended', 'removed'];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function buildActivityWindow(days = 30) {
  const to = new Date();
  const from = new Date(to.getTime() - ((days - 1) * MS_PER_DAY));
  const dateFrom = from.toISOString().slice(0, 10);
  return {
    date_from: dateFrom,
    date_from_timestamp: `${dateFrom}T00:00:00.000Z`
  };
}

/* ── Kern-Operationen ──────────────────────────────────── */

export async function addToPool(pool, data) {
  // Org-Boundary: Standort und Abteilung muessen zur Client-Org gehoeren.
  await assertLocationBelongsToOrg(pool, data.location_id, data.client_org_id);
  await assertDepartmentBelongsToOrg(pool, data.department_id, data.client_org_id);

  const { rows } = await pool.query(
    `INSERT INTO vendor_pool
     (client_org_id, supplier_org_id, tier, status, category,
      location_id, department_id, assigned_by, reason, valid_from, valid_until)
     VALUES ($1,$2,$3,'active',$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (client_org_id, supplier_org_id, category, location_id, department_id)
     DO UPDATE SET tier = EXCLUDED.tier, status = 'active', reason = EXCLUDED.reason,
                   assigned_by = EXCLUDED.assigned_by, valid_from = EXCLUDED.valid_from,
                   valid_until = EXCLUDED.valid_until, updated_at = NOW()
     RETURNING *`,
    [
      data.client_org_id, data.supplier_org_id,
      data.tier || 'SECONDARY', data.category || null,
      data.location_id || null, data.department_id || null,
      data.assigned_by || null, data.reason || null,
      data.valid_from || null, data.valid_until || null
    ]
  );
  return rows[0];
}

export async function changeTier(pool, entryId, newTier, actorId, reason) {
  if (!VALID_TIERS.includes(newTier)) throw new Error('Ungueltiger Tier: ' + newTier);
  // Fetch old value for history
  const { rows: oldRows } = await pool.query('SELECT tier FROM vendor_pool WHERE id = $1', [entryId]);
  const oldTier = oldRows[0]?.tier || null;
  const { rows } = await pool.query(
    `UPDATE vendor_pool SET tier = $2, assigned_by = $3, reason = $4, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [entryId, newTier, actorId, reason || null]
  );
  if (rows[0] && oldTier !== newTier) {
    await _writeHistory(pool, entryId, 'tier', oldTier, newTier, actorId, reason).catch(swallow("vendorPoolService"));
  }
  return rows[0] || null;
}

export async function changeStatus(pool, entryId, newStatus, actorId, reason) {
  if (!VALID_STATUSES.includes(newStatus)) throw new Error('Ungueltiger Status: ' + newStatus);
  // Fetch old value for history
  const { rows: oldRows } = await pool.query('SELECT status FROM vendor_pool WHERE id = $1', [entryId]);
  const oldStatus = oldRows[0]?.status || null;
  const { rows } = await pool.query(
    `UPDATE vendor_pool SET status = $2, assigned_by = $3, reason = $4, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [entryId, newStatus, actorId, reason || null]
  );
  if (rows[0] && oldStatus !== newStatus) {
    await _writeHistory(pool, entryId, 'status', oldStatus, newStatus, actorId, reason).catch(swallow("vendorPoolService"));
  }
  return rows[0] || null;
}

export async function blockVendor(pool, clientOrgId, supplierOrgId, actorId, reason) {
  const { rows } = await pool.query(
    `UPDATE vendor_pool SET tier = 'BLOCKED', status = 'suspended',
            assigned_by = $3, reason = $4, updated_at = NOW()
     WHERE client_org_id = $1 AND supplier_org_id = $2
     RETURNING *`,
    [clientOrgId, supplierOrgId, actorId, reason || null]
  );
  return rows;
}

export async function removeFromPool(pool, entryId) {
  const { rows } = await pool.query(
    `UPDATE vendor_pool SET status = 'removed', updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [entryId]
  );
  return rows[0] || null;
}

/* ── Abfragen ─────────────────────────────────────────── */

export async function listForClient(pool, clientOrgId, filters = {}) {
  const params = [clientOrgId];
  const where = ['vp.client_org_id = $1'];
  let idx = 2;

  if (filters.tier) { where.push(`vp.tier = $${idx}`); params.push(filters.tier); idx++; }
  if (filters.status) { where.push(`vp.status = $${idx}`); params.push(filters.status); idx++; }
  else { where.push(`vp.status != 'removed'`); }
  if (filters.category) { where.push(`vp.category = $${idx}`); params.push(filters.category); idx++; }

  const limit = Math.min(200, filters.limit || 100);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT vp.*, so.name AS supplier_org_name, so.type AS supplier_org_type,
            u.email AS assigned_by_email, u.company_name AS assigned_by_name,
            ol.name AS location_name, od.name AS department_name
     FROM vendor_pool vp
     LEFT JOIN organizations so ON so.id = vp.supplier_org_id
     LEFT JOIN users u ON u.id = vp.assigned_by
     LEFT JOIN org_locations ol ON ol.id = vp.location_id
     LEFT JOIN org_departments od ON od.id = vp.department_id
     WHERE ${where.join(' AND ')}
     ORDER BY CASE vp.tier
       WHEN 'PREFERRED' THEN 1 WHEN 'SECONDARY' THEN 2
       WHEN 'TRIAL' THEN 3 WHEN 'RESTRICTED' THEN 4 WHEN 'BLOCKED' THEN 5
     END, vp.updated_at DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

export async function listForSupplier(pool, supplierOrgId, filters = {}) {
  const params = [supplierOrgId];
  const where = ['vp.supplier_org_id = $1', `vp.status = 'active'`];
  const idx = 2;

  const limit = Math.min(200, filters.limit || 100);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT vp.*, co.name AS client_org_name, co.type AS client_org_type
     FROM vendor_pool vp
     LEFT JOIN organizations co ON co.id = vp.client_org_id
     WHERE ${where.join(' AND ')}
     ORDER BY vp.tier ASC, vp.created_at DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

export async function getEntry(pool, entryId) {
  const { rows } = await pool.query(
    `SELECT vp.*, so.name AS supplier_org_name, co.name AS client_org_name
     FROM vendor_pool vp
     LEFT JOIN organizations so ON so.id = vp.supplier_org_id
     LEFT JOIN organizations co ON co.id = vp.client_org_id
     WHERE vp.id = $1`,
    [entryId]
  );
  return rows[0] || null;
}

/** Ist der Supplier im Pool des Clients (aktiv, nicht blocked)? */
export async function isInPool(pool, clientOrgId, supplierOrgId) {
  const { rows } = await pool.query(
    `SELECT id, tier, status FROM vendor_pool
     WHERE client_org_id = $1 AND supplier_org_id = $2 AND status = 'active' AND tier != 'BLOCKED'
     LIMIT 1`,
    [clientOrgId, supplierOrgId]
  );
  return rows[0] || null;
}

/** Statistik fuer Client-Org: Anzahl nach Tier */
export async function poolStats(pool, clientOrgId) {
  const { rows } = await pool.query(
    `SELECT tier, COUNT(*)::int AS count
     FROM vendor_pool
     WHERE client_org_id = $1 AND status = 'active'
     GROUP BY tier
     ORDER BY tier`,
    [clientOrgId]
  );
  const stats = { PREFERRED: 0, SECONDARY: 0, TRIAL: 0, RESTRICTED: 0, BLOCKED: 0, total: 0 };
  for (const r of rows) {
    stats[r.tier] = r.count;
    stats.total += r.count;
  }
  return stats;
}

/* ── History ──────────────────────────────────────────── */

/** Internal: write history record for tier/status changes */
async function _writeHistory(pool, vendorPoolId, field, oldValue, newValue, changedBy, reason) {
  await pool.query(
    `INSERT INTO vendor_pool_history (vendor_pool_id, field_changed, old_value, new_value, changed_by, reason)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [vendorPoolId, field, oldValue, newValue, changedBy || null, reason || null]
  );
}

/** Get change history for a vendor_pool entry */
export async function getHistory(pool, vendorPoolId, limit = 50) {
  const safeLimit = Math.min(200, Math.max(1, limit));
  const { rows } = await pool.query(
    `SELECT h.*, u.email AS changed_by_email, u.contact_person AS changed_by_name
     FROM vendor_pool_history h
     LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.vendor_pool_id = $1
     ORDER BY h.created_at DESC
     LIMIT $2`,
    [vendorPoolId, safeLimit]
  );
  return rows;
}

/* ── Notes ────────────────────────────────────────────── */

/** Add a note to a vendor_pool entry */
export async function addNote(pool, vendorPoolId, authorId, text) {
  if (!text || !text.trim()) throw new Error('Note text required');
  const { rows } = await pool.query(
    `INSERT INTO vendor_pool_notes (vendor_pool_id, author_id, note_text)
     VALUES ($1, $2, $3) RETURNING *`,
    [vendorPoolId, authorId, text.trim()]
  );
  return rows[0];
}

/** List notes for a vendor_pool entry */
export async function listNotes(pool, vendorPoolId, limit = 50) {
  const safeLimit = Math.min(200, Math.max(1, limit));
  const { rows } = await pool.query(
    `SELECT n.*, u.email AS author_email, u.contact_person AS author_name
     FROM vendor_pool_notes n
     LEFT JOIN users u ON u.id = n.author_id
     WHERE n.vendor_pool_id = $1
     ORDER BY n.created_at DESC
     LIMIT $2`,
    [vendorPoolId, safeLimit]
  );
  return rows;
}

/* ── Enriched List (with KPIs) ────────────────────────── */

/**
 * List vendors for client with inline KPI summary.
 * JOINs supplier_reputation + supplier_metrics for each vendor.
 */
export async function listForClientEnriched(pool, clientOrgId, filters = {}) {
  const params = [clientOrgId];
  const where = ['vp.client_org_id = $1'];
  let idx = 2;
  const activityScope = filters.activity_scope === 'buyer_activity_30d';

  if (filters.tier) { where.push(`vp.tier = $${idx}`); params.push(filters.tier); idx++; }
  if (filters.status) { where.push(`vp.status = $${idx}`); params.push(filters.status); idx++; }
  else if (activityScope) { where.push(`vp.status = 'active'`); }
  else { where.push(`vp.status != 'removed'`); }
  if (filters.category) { where.push(`vp.category = $${idx}`); params.push(filters.category); idx++; }
  let activityJoin = '';
  if (activityScope) {
    const window = buildActivityWindow(30);
    const activityTimestampIdx = idx;
    params.push(window.date_from_timestamp);
    idx++;
    const activityDateIdx = idx;
    params.push(window.date_from);
    idx++;
    activityJoin = `
     JOIN (
       SELECT DISTINCT vendor_id
       FROM (
         SELECT rc.supplier_org_id AS vendor_id
         FROM requisition_candidates rc
         JOIN requisitions r ON r.id = rc.requisition_id
         WHERE r.org_id = $1
           AND rc.supplier_org_id IS NOT NULL
           AND rc.created_at >= $${activityTimestampIdx}::timestamptz
         UNION
         SELECT a.supplier_org_id AS vendor_id
         FROM assignments a
         LEFT JOIN timesheets t
           ON t.assignment_id = a.id
          AND t.status = 'approved'
          AND t.week_start >= $${activityDateIdx}::date
         WHERE a.org_id = $1
           AND a.supplier_org_id IS NOT NULL
           AND (
             a.created_at >= $${activityTimestampIdx}::timestamptz
             OR a.updated_at >= $${activityTimestampIdx}::timestamptz
             OR t.id IS NOT NULL
           )
       ) activity_scope
     ) av ON av.vendor_id = vp.supplier_org_id`;
  }

  const limit = Math.min(200, filters.limit || 100);
  const limitIdx = idx;
  params.push(limit);
  const selectColumns = `vp.*, so.name AS supplier_org_name, so.type AS supplier_org_type,
            u.email AS assigned_by_email, u.contact_person AS assigned_by_name,
            ol.name AS location_name, od.name AS department_name,
            sr.reputation_score, sr.grade AS reputation_grade,
            sr.avg_stars, sr.response_time_score, sr.deal_success_rate,
            sr.total_deals, sr.completed_deals, sr.activity_score,
            sm.avg_rating AS metrics_avg_rating,
            CASE WHEN sm.requests_received > 0
              THEN ROUND((sm.requests_accepted::numeric / sm.requests_received) * 100, 1)
              ELSE NULL END AS fill_rate_pct,
            CASE WHEN sm.requests_received > 0
              THEN ROUND((sm.sla_breaches::numeric / sm.requests_received) * 100, 1)
              ELSE NULL END AS sla_breach_rate_pct`;

  if (activityScope) {
    const { rows } = await pool.query(
      `WITH scoped_rows AS (
         SELECT DISTINCT ON (vp.supplier_org_id) ${selectColumns}
         FROM vendor_pool vp
         LEFT JOIN organizations so ON so.id = vp.supplier_org_id
         LEFT JOIN users u ON u.id = vp.assigned_by
         LEFT JOIN org_locations ol ON ol.id = vp.location_id
         LEFT JOIN org_departments od ON od.id = vp.department_id
         LEFT JOIN supplier_reputation sr ON sr.supplier_id = vp.supplier_org_id
         LEFT JOIN supplier_metrics sm ON sm.agency_id = vp.supplier_org_id AND sm.window_days = 30
         ${activityJoin}
         WHERE ${where.join(' AND ')}
         ORDER BY vp.supplier_org_id,
           CASE vp.tier
             WHEN 'PREFERRED' THEN 1 WHEN 'SECONDARY' THEN 2
             WHEN 'TRIAL' THEN 3 WHEN 'RESTRICTED' THEN 4 WHEN 'BLOCKED' THEN 5
           END,
           sr.reputation_score DESC NULLS LAST,
           vp.updated_at DESC
       )
       SELECT *
       FROM scoped_rows
       ORDER BY CASE tier
         WHEN 'PREFERRED' THEN 1 WHEN 'SECONDARY' THEN 2
         WHEN 'TRIAL' THEN 3 WHEN 'RESTRICTED' THEN 4 WHEN 'BLOCKED' THEN 5
       END, reputation_score DESC NULLS LAST, updated_at DESC
       LIMIT $${limitIdx}`,
      params
    );
    return rows;
  }

  const { rows } = await pool.query(
    `SELECT ${selectColumns}
     FROM vendor_pool vp
     LEFT JOIN organizations so ON so.id = vp.supplier_org_id
     LEFT JOIN users u ON u.id = vp.assigned_by
     LEFT JOIN org_locations ol ON ol.id = vp.location_id
     LEFT JOIN org_departments od ON od.id = vp.department_id
     LEFT JOIN supplier_reputation sr ON sr.supplier_id = vp.supplier_org_id
     LEFT JOIN supplier_metrics sm ON sm.agency_id = vp.supplier_org_id AND sm.window_days = 30
     WHERE ${where.join(' AND ')}
     ORDER BY CASE vp.tier
       WHEN 'PREFERRED' THEN 1 WHEN 'SECONDARY' THEN 2
       WHEN 'TRIAL' THEN 3 WHEN 'RESTRICTED' THEN 4 WHEN 'BLOCKED' THEN 5
     END, sr.reputation_score DESC NULLS LAST, vp.updated_at DESC
     LIMIT $${limitIdx}`,
    params
  );
  return rows;
}

/* ── Preferred Vendor Premium ─────────────────────────── */

/**
 * Optimierte Liste der PREFERRED-Vendors eines Clients mit KPIs.
 * Filter: category, location_id, department_id.
 */
export async function getPreferredVendors(pool, clientOrgId, filters = {}) {
  const params = [clientOrgId];
  const where = ["vp.client_org_id = $1", "vp.tier = 'PREFERRED'", "vp.status = 'active'"];
  let idx = 2;

  if (filters.category) { where.push(`vp.category = $${idx}`); params.push(filters.category); idx++; }
  if (filters.location_id) { where.push(`vp.location_id = $${idx}`); params.push(filters.location_id); idx++; }
  if (filters.department_id) { where.push(`vp.department_id = $${idx}`); params.push(filters.department_id); idx++; }

  const limit = Math.min(200, filters.limit || 100);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT vp.*, so.name AS supplier_org_name, so.type AS supplier_org_type,
            ol.name AS location_name, od.name AS department_name,
            sr.reputation_score, sr.grade AS reputation_grade,
            sr.avg_stars, sr.deal_success_rate,
            CASE WHEN sm.requests_received > 0
              THEN ROUND((sm.requests_accepted::numeric / sm.requests_received) * 100, 1)
              ELSE NULL END AS fill_rate_pct,
            (SELECT COUNT(*)::int FROM capacity_posts cp
             WHERE cp.supplier_company_id = vp.supplier_org_id AND cp.is_active = TRUE
            ) AS active_capacity_count
     FROM vendor_pool vp
     LEFT JOIN organizations so ON so.id = vp.supplier_org_id
     LEFT JOIN org_locations ol ON ol.id = vp.location_id
     LEFT JOIN org_departments od ON od.id = vp.department_id
     LEFT JOIN supplier_reputation sr ON sr.supplier_id = vp.supplier_org_id
     LEFT JOIN supplier_metrics sm ON sm.agency_id = vp.supplier_org_id AND sm.window_days = 30
     WHERE ${where.join(' AND ')}
     ORDER BY sr.reputation_score DESC NULLS LAST, vp.updated_at DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

/**
 * Aggregierte Preferred-Vendor-Uebersicht fuer Dashboard.
 * Counts, avg KPIs, abgedeckte Kategorien/Standorte, Top 5.
 */
export async function getPreferredSummary(pool, clientOrgId) {
  // Count + avg KPIs
  const { rows: aggRows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total_preferred,
       ROUND(AVG(sr.reputation_score)::numeric, 1) AS avg_reputation,
       ROUND(AVG(sr.avg_stars)::numeric, 2) AS avg_stars,
       ROUND(AVG(sr.deal_success_rate)::numeric, 1) AS avg_deal_success,
       COUNT(DISTINCT vp.category) FILTER (WHERE vp.category IS NOT NULL)::int AS categories_covered,
       COUNT(DISTINCT vp.location_id) FILTER (WHERE vp.location_id IS NOT NULL)::int AS locations_covered,
       COUNT(DISTINCT vp.department_id) FILTER (WHERE vp.department_id IS NOT NULL)::int AS departments_covered
     FROM vendor_pool vp
     LEFT JOIN supplier_reputation sr ON sr.supplier_id = vp.supplier_org_id
     WHERE vp.client_org_id = $1 AND vp.tier = 'PREFERRED' AND vp.status = 'active'`,
    [clientOrgId]
  );
  const agg = aggRows[0] || {};

  // Top 5 preferred by reputation
  const { rows: top5 } = await pool.query(
    `SELECT vp.id, so.name AS supplier_name, vp.category,
            sr.reputation_score, sr.grade, sr.avg_stars
     FROM vendor_pool vp
     JOIN organizations so ON so.id = vp.supplier_org_id
     LEFT JOIN supplier_reputation sr ON sr.supplier_id = vp.supplier_org_id
     WHERE vp.client_org_id = $1 AND vp.tier = 'PREFERRED' AND vp.status = 'active'
     ORDER BY sr.reputation_score DESC NULLS LAST
     LIMIT 5`,
    [clientOrgId]
  );

  return {
    total_preferred: agg.total_preferred || 0,
    avg_reputation: agg.avg_reputation != null ? Number(agg.avg_reputation) : null,
    avg_stars: agg.avg_stars != null ? Number(agg.avg_stars) : null,
    avg_deal_success: agg.avg_deal_success != null ? Number(agg.avg_deal_success) : null,
    coverage: {
      categories: agg.categories_covered || 0,
      locations: agg.locations_covered || 0,
      departments: agg.departments_covered || 0
    },
    top_performers: top5
  };
}

/**
 * Batch: mehrere Vendor-Pool-Eintraege auf PREFERRED setzen.
 * Schreibt History fuer jede Aenderung.
 */
export async function bulkSetPreferred(pool, clientOrgId, entryIds, actorId, reason) {
  if (!entryIds || entryIds.length === 0) return [];
  const results = [];
  for (const entryId of entryIds) {
    // Verify entry belongs to client
    const entry = await getEntry(pool, entryId);
    if (!entry || entry.client_org_id !== clientOrgId) continue;
    if (entry.tier === 'PREFERRED') { results.push(entry); continue; }
    const updated = await changeTier(pool, entryId, 'PREFERRED', actorId, reason || 'Bulk preferred promotion');
    if (updated) results.push(updated);
  }
  return results;
}

/**
 * Preferred -> SECONDARY zurueckstufen mit History.
 */
export async function demoteFromPreferred(pool, entryId, actorId, reason) {
  const entry = await getEntry(pool, entryId);
  if (!entry || entry.tier !== 'PREFERRED') return null;
  return changeTier(pool, entryId, 'SECONDARY', actorId, reason || 'Demoted from preferred');
}

/**
 * Coverage-Analyse: welche Kategorien/Standorte/Fachbereiche hat der
 * Client mit PREFERRED abgedeckt, und welche SECONDARY existieren als Luecken.
 */
export async function getPoolCoverage(pool, clientOrgId) {
  // Preferred coverage
  const { rows: prefRows } = await pool.query(
    `SELECT vp.category, ol.name AS location_name, od.name AS department_name,
            COUNT(*)::int AS vendor_count
     FROM vendor_pool vp
     LEFT JOIN org_locations ol ON ol.id = vp.location_id
     LEFT JOIN org_departments od ON od.id = vp.department_id
     WHERE vp.client_org_id = $1 AND vp.tier = 'PREFERRED' AND vp.status = 'active'
     GROUP BY vp.category, ol.name, od.name
     ORDER BY vendor_count DESC`,
    [clientOrgId]
  );

  // Non-preferred active vendors (potential gaps)
  const { rows: gapRows } = await pool.query(
    `SELECT vp.category, ol.name AS location_name, od.name AS department_name,
            COUNT(*)::int AS vendor_count, vp.tier
     FROM vendor_pool vp
     LEFT JOIN org_locations ol ON ol.id = vp.location_id
     LEFT JOIN org_departments od ON od.id = vp.department_id
     WHERE vp.client_org_id = $1 AND vp.tier IN ('SECONDARY','TRIAL') AND vp.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM vendor_pool vp2
         WHERE vp2.client_org_id = $1 AND vp2.tier = 'PREFERRED' AND vp2.status = 'active'
           AND vp2.category IS NOT DISTINCT FROM vp.category
           AND vp2.location_id IS NOT DISTINCT FROM vp.location_id
           AND vp2.department_id IS NOT DISTINCT FROM vp.department_id
       )
     GROUP BY vp.category, ol.name, od.name, vp.tier
     ORDER BY vendor_count DESC`,
    [clientOrgId]
  );

  return { covered: prefRows, gaps: gapRows };
}

/**
 * Auto-Suggest: SECONDARY/TRIAL-Vendors mit bester Reputation + Fill-Rate
 * als Kandidaten fuer Preferred-Promotion.
 */
export async function suggestForPreferred(pool, clientOrgId, limit = 10) {
  const safeLimit = Math.min(50, Math.max(1, limit));
  const { rows } = await pool.query(
    `SELECT vp.id AS entry_id, vp.supplier_org_id, so.name AS supplier_name,
            vp.tier, vp.category,
            sr.reputation_score, sr.grade, sr.avg_stars, sr.deal_success_rate,
            CASE WHEN sm.requests_received > 0
              THEN ROUND((sm.requests_accepted::numeric / sm.requests_received) * 100, 1)
              ELSE NULL END AS fill_rate_pct
     FROM vendor_pool vp
     JOIN organizations so ON so.id = vp.supplier_org_id
     LEFT JOIN supplier_reputation sr ON sr.supplier_id = vp.supplier_org_id
     LEFT JOIN supplier_metrics sm ON sm.agency_id = vp.supplier_org_id AND sm.window_days = 30
     WHERE vp.client_org_id = $1 AND vp.tier IN ('SECONDARY','TRIAL') AND vp.status = 'active'
       AND sr.reputation_score IS NOT NULL AND sr.reputation_score >= 50
     ORDER BY sr.reputation_score DESC, sr.avg_stars DESC NULLS LAST
     LIMIT $2`,
    [clientOrgId, safeLimit]
  );
  return rows;
}

/**
 * Aggregierte Workforce-Kapazitaet der Preferred Vendors.
 * Zaehlt aktive Capacity Posts und deren workers_count.
 */
export async function getWorkforceCapacity(pool, clientOrgId) {
  const { rows } = await pool.query(
    `SELECT vp.supplier_org_id, so.name AS supplier_name,
            COUNT(cp.id)::int AS capacity_posts,
            COALESCE(SUM(cp.workers_count), 0)::int AS total_workers,
            ARRAY_AGG(DISTINCT cp.role) FILTER (WHERE cp.role IS NOT NULL) AS roles
     FROM vendor_pool vp
     JOIN organizations so ON so.id = vp.supplier_org_id
     LEFT JOIN capacity_posts cp ON cp.supplier_company_id = vp.supplier_org_id AND cp.is_active = TRUE
     WHERE vp.client_org_id = $1 AND vp.tier = 'PREFERRED' AND vp.status = 'active'
     GROUP BY vp.supplier_org_id, so.name
     ORDER BY total_workers DESC, capacity_posts DESC`,
    [clientOrgId]
  );
  const totals = rows.reduce((acc, r) => {
    acc.total_posts += r.capacity_posts;
    acc.total_workers += r.total_workers;
    return acc;
  }, { total_posts: 0, total_workers: 0 });
  return { vendors: rows, totals };
}

/* ── Vendor Dashboard KPIs ────────────────────────────── */

/**
 * Aggregierte KPI-Uebersicht fuer das Vendor-Pool-Dashboard.
 * Liefert: Pool-Zusammensetzung, durchschn. Bewertungen, Top/Bottom 5.
 */
export async function getVendorDashboard(pool, clientOrgId) {
  // Pool composition by tier
  const tierStats = await poolStats(pool, clientOrgId);

  // Status composition
  const { rows: statusRows } = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM vendor_pool WHERE client_org_id = $1
     GROUP BY status ORDER BY status`,
    [clientOrgId]
  );
  const statusStats = {};
  for (const r of statusRows) statusStats[r.status] = r.count;

  // Aggregate KPIs across all active vendors
  const { rows: aggRows } = await pool.query(
    `SELECT
       ROUND(AVG(sr.reputation_score)::numeric, 1) AS avg_reputation,
       ROUND(AVG(sr.avg_stars)::numeric, 2) AS avg_stars,
       ROUND(AVG(sr.deal_success_rate)::numeric, 1) AS avg_deal_success,
       COUNT(*) FILTER (WHERE sr.grade IN ('GOLD','PLATINUM'))::int AS top_grade_count
     FROM vendor_pool vp
     LEFT JOIN supplier_reputation sr ON sr.supplier_id = vp.supplier_org_id
     WHERE vp.client_org_id = $1 AND vp.status = 'active'`,
    [clientOrgId]
  );
  const agg = aggRows[0] || {};

  // Top 5 by reputation
  const { rows: top5 } = await pool.query(
    `SELECT vp.id, so.name AS supplier_name, vp.tier,
            sr.reputation_score, sr.grade, sr.avg_stars
     FROM vendor_pool vp
     JOIN organizations so ON so.id = vp.supplier_org_id
     LEFT JOIN supplier_reputation sr ON sr.supplier_id = vp.supplier_org_id
     WHERE vp.client_org_id = $1 AND vp.status = 'active'
     ORDER BY sr.reputation_score DESC NULLS LAST
     LIMIT 5`,
    [clientOrgId]
  );

  // Bottom 5 by reputation (non-null only)
  const { rows: bottom5 } = await pool.query(
    `SELECT vp.id, so.name AS supplier_name, vp.tier,
            sr.reputation_score, sr.grade, sr.avg_stars
     FROM vendor_pool vp
     JOIN organizations so ON so.id = vp.supplier_org_id
     LEFT JOIN supplier_reputation sr ON sr.supplier_id = vp.supplier_org_id
     WHERE vp.client_org_id = $1 AND vp.status = 'active' AND sr.reputation_score IS NOT NULL
     ORDER BY sr.reputation_score ASC
     LIMIT 5`,
    [clientOrgId]
  );

  // Recent changes (last 10)
  const { rows: recentChanges } = await pool.query(
    `SELECT h.*, u.contact_person AS changed_by_name, so.name AS supplier_name
     FROM vendor_pool_history h
     JOIN vendor_pool vp ON vp.id = h.vendor_pool_id
     JOIN organizations so ON so.id = vp.supplier_org_id
     LEFT JOIN users u ON u.id = h.changed_by
     WHERE vp.client_org_id = $1
     ORDER BY h.created_at DESC
     LIMIT 10`,
    [clientOrgId]
  );

  return {
    pool_composition: tierStats,
    status_composition: statusStats,
    kpis: {
      avg_reputation: agg.avg_reputation != null ? Number(agg.avg_reputation) : null,
      avg_stars: agg.avg_stars != null ? Number(agg.avg_stars) : null,
      avg_deal_success: agg.avg_deal_success != null ? Number(agg.avg_deal_success) : null,
      top_grade_count: agg.top_grade_count || 0
    },
    top_performers: top5,
    underperformers: bottom5,
    recent_changes: recentChanges
  };
}
