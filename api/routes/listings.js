import { z } from "zod";
import { Router } from "express";
import * as geoService from "../services/geoService.js";
import * as listingService from "../services/listingService.js";

const listingSchema = z.object({
  category: z.string().min(1).max(120),
  region: z.string().min(1).max(120),
  qty: z.number().int().min(1).max(999),
  start_date: z.string().optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
  notdienst: z.boolean().optional().default(false),
  postal_code: z.string().max(20).optional().nullable(),
  city: z.string().max(120).optional().nullable()
});

/**
 * @param {{ pool, getUserAndPlan, requireAuth, requireFeature, logger }} deps
 */
export function createListingsRouter(deps) {
  const { pool, getUserAndPlan, requireAuth, requireFeature, logger } = deps;
  const router = Router();
  const legacyAccess = requireFeature("legacy_access");

  router.get("/listings", requireAuth, legacyAccess, async (req, res) => {
    const rows = await listingService.searchListings(pool, {
      type: String(req.query.type || ""),
      category: String(req.query.category || ""),
      region: String(req.query.region || ""),
      notdienst: String(req.query.notdienst || ""),
      centerLat: req.query.center_lat != null ? parseFloat(req.query.center_lat) : NaN,
      centerLng: req.query.center_lng != null ? parseFloat(req.query.center_lng) : NaN,
      radiusKm: req.query.radius_km != null ? parseFloat(req.query.radius_km) : NaN
    });
    res.json(rows);
  });

  router.get("/my/listings", requireAuth, legacyAccess, async (req, res) => {
    const rows = await listingService.getMyListings(pool, req.session.userId);
    res.json(rows);
  });

  router.post("/listings", requireAuth, legacyAccess, async (req, res) => {
    const parsed = listingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

    const me = req.user || await getUserAndPlan(req.session.userId);
    if (me.limits.listings !== -1 && me.usage.listings_count >= me.limits.listings) {
      return res.status(403).json({ error: "LIMIT_REACHED", type: "listings", limit: me.limits.listings, current: me.usage.listings_count });
    }

    const type = (me.role === "agency") ? "supply" : "demand";
    const { category, region, qty, start_date, note, notdienst, postal_code, city } = parsed.data;
    const listing = await listingService.createListing(pool, req.session.userId, type, parsed.data);
    res.locals.audit = { action: "listing.create", entity_type: "listing", entity_id: listing.id, details: { type, category, region } };

    try {
      if (postal_code || city) {
        const coords = await geoService.geocode(postal_code || null, city || null);
        if (coords) return res.json(await listingService.updateListingGeo(pool, listing.id, coords.lat, coords.lng));
      }
    } catch (e) {
      logger.warn({ err: e?.message }, "Geocoding fuer Listing fehlgeschlagen");
    }
    res.json(listing);
  });

  router.put("/listings/:id", requireAuth, legacyAccess, async (req, res) => {
    const parsed = listingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

    const id = String(req.params.id);
    const { postal_code, city } = parsed.data;
    const listing = await listingService.updateListing(pool, id, req.session.userId, parsed.data);
    if (!listing) return res.status(404).json({ error: "NOT_FOUND" });
    res.locals.audit = { action: "listing.update", entity_type: "listing", entity_id: id, details: { changed_fields: Object.keys(parsed.data) } };

    try {
      if (postal_code || city) {
        const coords = await geoService.geocode(postal_code || null, city || null);
        if (coords) return res.json(await listingService.updateListingGeo(pool, listing.id, coords.lat, coords.lng));
        await listingService.clearListingGeo(pool, listing.id);
      } else {
        await listingService.clearListingGeo(pool, listing.id);
      }
    } catch (e) {
      logger.warn({ err: e?.message }, "Geocoding fuer Listing-Update fehlgeschlagen");
    }
    res.json(listing);
  });

  router.delete("/listings/:id", requireAuth, legacyAccess, async (req, res) => {
    const deleted = await listingService.softDeleteListing(pool, String(req.params.id), req.session.userId);
    if (!deleted) return res.status(404).json({ error: "NOT_FOUND" });
    res.locals.audit = { action: "listing.delete", entity_type: "listing", entity_id: req.params.id };
    res.json({ ok: true });
  });

  return router;
}
