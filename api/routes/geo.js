import { Router } from "express";
import * as geoService from "../services/geoService.js";

/**
 * @param {{ requireAuth }} deps
 */
export function createGeoRouter(deps) {
  const { requireAuth } = deps;
  const router = Router();

  router.get("/geo/coordinates", requireAuth, async (req, res) => {
    const q = String(req.query.q || req.query.place || "").trim();
    const postal_code = String(req.query.postal_code || req.query.plz || "").trim();
    const city = String(req.query.city || req.query.ort || "").trim();
    let coords = null;
    if (q) coords = await geoService.geocodeQuery(q);
    else if (postal_code || city) coords = await geoService.geocode(postal_code || null, city || null);
    if (!coords) return res.status(404).json({ error: "GEO_NOT_FOUND", message: "Ort oder PLZ konnte nicht zugeordnet werden." });
    res.json(coords);
  });

  return router;
}
