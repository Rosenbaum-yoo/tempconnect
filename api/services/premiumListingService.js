/**
 * premiumListingService — Premium-Anzeige im Marktplatz.
 * Einmalige In-App-Gebuehr je Anzeige: Listing wird fuer N Tage hervorgehoben/priorisiert
 * (featured_until + placement_boost_level), die Gebuehr landet als offener Posten in
 * premium_listing_charges und wird von createInvoice auf die NAECHSTE Monatsrechnung
 * addiert (manual-first — kein Sofort-Charge, keine neue Payment-Dependency).
 */

import { PREMIUM_LISTING } from "../config/planCatalog.js";

/**
 * Anzeige als Premium hervorheben + Gebuehr als offenen Rechnungsposten erfassen.
 * Ownership wird serverseitig erzwungen (Update greift nur auf eigene Listings).
 * @returns {{ ok:true, listing, charge, price_cents, featured_until } | { ok:false, error }}
 */
export async function featureListing(pool, { listingType, listingId, userId, orgId }) {
  if (!orgId) return { ok: false, error: "ORG_CONTEXT_REQUIRED" };
  if (!["capacity", "demand"].includes(listingType)) return { ok: false, error: "VALIDATION" };

  const days = PREMIUM_LISTING.duration_days;
  let updated;
  if (listingType === "capacity") {
    const { rows } = await pool.query(
      `UPDATE capacity_posts
          SET featured_until = NOW() + ($3 || ' days')::interval,
              placement_boost_level = GREATEST(placement_boost_level, 3),
              updated_at = NOW()
        WHERE id = $1 AND supplier_company_id = $2
          AND (featured_until IS NULL OR featured_until < NOW())
        RETURNING id, title, featured_until`,
      [listingId, userId, String(days)]
    );
    updated = rows[0];
  } else {
    const { rows } = await pool.query(
      `UPDATE demand_requests
          SET featured_until = NOW() + ($3 || ' days')::interval,
              updated_at = NOW()
        WHERE id = $1 AND requester_company_id = $2
          AND (featured_until IS NULL OR featured_until < NOW())
        RETURNING id, title, featured_until`,
      [listingId, userId, String(days)]
    );
    updated = rows[0];
  }
  if (!updated) {
    // Entweder fremdes/unbekanntes Listing ODER bereits Premium — unterscheiden fuer die UI.
    const probe = await pool.query(
      listingType === "capacity"
        ? "SELECT featured_until FROM capacity_posts WHERE id = $1 AND supplier_company_id = $2"
        : "SELECT featured_until FROM demand_requests WHERE id = $1 AND requester_company_id = $2",
      [listingId, userId]
    );
    if (!probe.rows[0]) return { ok: false, error: "NOT_FOUND" };
    return { ok: false, error: "ALREADY_FEATURED", featured_until: probe.rows[0].featured_until };
  }

  const { rows: chargeRows } = await pool.query(
    `INSERT INTO premium_listing_charges
       (org_id, user_id, listing_type, listing_id, description, amount_cents, currency)
     VALUES ($1, $2, $3, $4, $5, $6, 'EUR')
     RETURNING *`,
    [
      orgId, userId, listingType, listingId,
      `Premium-Anzeige (${days} Tage): ${String(updated.title || "").slice(0, 120)}`,
      PREMIUM_LISTING.price_cents
    ]
  );

  return {
    ok: true,
    listing: updated,
    charge: chargeRows[0],
    price_cents: PREMIUM_LISTING.price_cents,
    featured_until: updated.featured_until
  };
}

/**
 * Offene Premium-Posten einer Org fuer die Rechnungserstellung laden (FOR UPDATE, im Caller-TX).
 * Schema-tolerant: existiert die Tabelle (noch) nicht, kommt [] zurueck.
 */
export async function lockPendingCharges(client, orgId) {
  const { rows: reg } = await client.query("SELECT to_regclass('public.premium_listing_charges') AS t");
  if (!reg[0] || !reg[0].t) return [];
  const { rows } = await client.query(
    `SELECT id, description, amount_cents FROM premium_listing_charges
      WHERE org_id = $1 AND status = 'pending'
      ORDER BY created_at ASC
      FOR UPDATE`,
    [orgId]
  );
  return rows;
}

/** Posten nach Rechnungsstellung als 'invoiced' markieren (im Caller-TX). */
export async function markChargesInvoiced(client, chargeIds, invoiceId) {
  if (!chargeIds || !chargeIds.length) return 0;
  const { rowCount } = await client.query(
    `UPDATE premium_listing_charges
        SET status = 'invoiced', invoice_id = $2, invoiced_at = NOW()
      WHERE id = ANY($1::uuid[]) AND status = 'pending'`,
    [chargeIds, invoiceId]
  );
  return rowCount;
}
