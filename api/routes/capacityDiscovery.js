/**
 * Capacity Discovery REST-Router: aggregated capacity visibility.
 */
import { Router } from "express";
import * as capacityDiscovery from "../services/capacityDiscoveryService.js";

export function createCapacityDiscoveryRouter(deps) {
  const { pool, requireAuth } = deps;
  const router = Router();

  /** GET /capacity-discovery/by-role — aggregated by role */
  router.get("/capacity-discovery/by-role", requireAuth, async (req, res) => {
    const data = await capacityDiscovery.aggregateByRole(pool, {
      city: req.query.city || null,
      worker_category: req.query.worker_category || null,
      limit: parseInt(req.query.limit, 10) || 50
    });
    res.json({ items: data });
  });

  /** GET /capacity-discovery/by-region — aggregated by region */
  router.get("/capacity-discovery/by-region", requireAuth, async (req, res) => {
    const data = await capacityDiscovery.aggregateByRegion(pool, {
      role: req.query.role || null,
      worker_category: req.query.worker_category || null,
      limit: parseInt(req.query.limit, 10) || 50
    });
    res.json({ items: data });
  });

  /** GET /capacity-discovery/by-category — aggregated by worker category */
  router.get("/capacity-discovery/by-category", requireAuth, async (req, res) => {
    const data = await capacityDiscovery.aggregateByCategory(pool, {
      city: req.query.city || null,
      limit: parseInt(req.query.limit, 10) || 50
    });
    res.json({ items: data });
  });

  /** GET /capacity-discovery/summary — human-readable availability summaries */
  router.get("/capacity-discovery/summary", requireAuth, async (req, res) => {
    const data = await capacityDiscovery.getAvailabilitySummary(pool, {
      city: req.query.city || null,
      role: req.query.role || null,
      limit: parseInt(req.query.limit, 10) || 20
    });
    res.json({ summaries: data });
  });

  return router;
}
