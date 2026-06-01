/**
 * Listing Analytics Service.
 * Tracks views, clicks, matches, and deals per capacity listing.
 * Provides per-listing stats and supplier-level dashboard aggregation.
 *
 * Pure-logic helpers (unit-testable):
 *   computeConversionFunnel
 */

import { trackEvent } from "./eventTrackingService.js";

/* ── Pure-logic: Conversion Funnel ──────────────────────── */

/**
 * Compute conversion funnel percentages from raw counters.
 * Returns rates as 0-100, null when denominator is 0.
 *
 * @param {{ view_count: number, click_count: number, match_count: number, deal_count: number }} stats
 * @returns {{ click_rate: number|null, match_rate: number|null, deal_rate: number|null }}
 */
export function computeConversionFunnel(stats) {
  const v = Number(stats?.view_count) || 0;
  const c = Number(stats?.click_count) || 0;
  const m = Number(stats?.match_count) || 0;
  const d = Number(stats?.deal_count) || 0;

  return {
    view_count: v,
    click_count: c,
    match_count: m,
    deal_count: d,
    click_rate: v > 0 ? Math.round((c / v) * 10000) / 100 : null,
    match_rate: c > 0 ? Math.round((m / c) * 10000) / 100 : null,
    deal_rate:  m > 0 ? Math.round((d / m) * 10000) / 100 : null
  };
}

/* ── Increment helpers (UPSERT pattern) ────────────────── */

/**
 * Record a listing view. Increments view_count and fires listing_viewed event.
 */
export async function recordView(pool, capacityPostId, actorId) {
  await pool.query(
    `INSERT INTO listing_analytics (capacity_post_id, view_count, last_viewed_at, updated_at)
     VALUES ($1, 1, NOW(), NOW())
     ON CONFLICT (capacity_post_id) DO UPDATE SET
       view_count = listing_analytics.view_count + 1,
       last_viewed_at = NOW(),
       updated_at = NOW()`,
    [capacityPostId]
  );
  try {
    await trackEvent(pool, {
      event_type: 'listing_viewed',
      actor_id: actorId || null,
      entity_type: 'capacity_post',
      entity_id: capacityPostId
    });
  } catch { /* non-critical: analytics event failure must not block the view */ }
}

/**
 * Record a listing click. Increments click_count and fires listing_clicked event.
 */
export async function recordClick(pool, capacityPostId, actorId) {
  await pool.query(
    `INSERT INTO listing_analytics (capacity_post_id, click_count, updated_at)
     VALUES ($1, 1, NOW())
     ON CONFLICT (capacity_post_id) DO UPDATE SET
       click_count = listing_analytics.click_count + 1,
       updated_at = NOW()`,
    [capacityPostId]
  );
  try {
    await trackEvent(pool, {
      event_type: 'listing_clicked',
      actor_id: actorId || null,
      entity_type: 'capacity_post',
      entity_id: capacityPostId
    });
  } catch { /* non-critical */ }
}

/**
 * Record a match for a listing. Increments match_count and fires listing_matched event.
 */
export async function recordMatch(pool, capacityPostId) {
  await pool.query(
    `INSERT INTO listing_analytics (capacity_post_id, match_count, updated_at)
     VALUES ($1, 1, NOW())
     ON CONFLICT (capacity_post_id) DO UPDATE SET
       match_count = listing_analytics.match_count + 1,
       updated_at = NOW()`,
    [capacityPostId]
  );
  try {
    await trackEvent(pool, {
      event_type: 'listing_matched',
      entity_type: 'capacity_post',
      entity_id: capacityPostId
    });
  } catch { /* non-critical */ }
}

/**
 * Record a deal for a listing. Increments deal_count.
 */
export async function recordDeal(pool, capacityPostId) {
  await pool.query(
    `INSERT INTO listing_analytics (capacity_post_id, deal_count, updated_at)
     VALUES ($1, 1, NOW())
     ON CONFLICT (capacity_post_id) DO UPDATE SET
       deal_count = listing_analytics.deal_count + 1,
       updated_at = NOW()`,
    [capacityPostId]
  );
}

/* ── Query helpers ─────────────────────────────────────── */

/**
 * Get analytics for a single listing with conversion funnel.
 */
export async function getListingStats(pool, capacityPostId) {
  const { rows } = await pool.query(
    `SELECT la.*, cp.title, cp.role, cp.status, cp.created_at AS listing_created_at
     FROM listing_analytics la
     JOIN capacity_posts cp ON cp.id = la.capacity_post_id
     WHERE la.capacity_post_id = $1`,
    [capacityPostId]
  );
  if (rows.length === 0) {
    return { capacity_post_id: capacityPostId, view_count: 0, click_count: 0, match_count: 0, deal_count: 0, funnel: computeConversionFunnel({ view_count: 0, click_count: 0, match_count: 0, deal_count: 0 }) };
  }
  const stats = rows[0];
  return { ...stats, funnel: computeConversionFunnel(stats) };
}

/**
 * Get aggregated analytics dashboard for all of a supplier's listings.
 * Returns per-listing breakdown + totals + overall funnel.
 */
export async function getSupplierDashboard(pool, supplierId) {
  // Per-listing stats
  const { rows: listings } = await pool.query(
    `SELECT la.*, cp.title, cp.role, cp.status
     FROM listing_analytics la
     JOIN capacity_posts cp ON cp.id = la.capacity_post_id
     WHERE cp.supplier_company_id = $1
     ORDER BY la.updated_at DESC`,
    [supplierId]
  );

  // Totals
  const totals = { view_count: 0, click_count: 0, match_count: 0, deal_count: 0 };
  for (const l of listings) {
    totals.view_count  += l.view_count  || 0;
    totals.click_count += l.click_count || 0;
    totals.match_count += l.match_count || 0;
    totals.deal_count  += l.deal_count  || 0;
  }

  return {
    listings: listings.map(l => ({ ...l, funnel: computeConversionFunnel(l) })),
    totals,
    funnel: computeConversionFunnel(totals),
    listing_count: listings.length
  };
}
