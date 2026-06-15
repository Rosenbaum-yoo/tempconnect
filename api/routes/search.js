/**
 * Unified Search Route — Enterprise Search Endpoint.
 *
 * GET  /api/search?q=...&type=...&limit=...  — Plattformweite Suche
 * POST /api/search/reindex/:indexName         — Admin: Index neu aufbauen
 * POST /api/search/reindex                    — Admin: Alle Indexes neu aufbauen
 * GET  /api/search/status                     — Search-Engine Status
 */

import { Router } from "express";
import * as searchService from "../services/searchService.js";
import * as searchHistory from "../services/searchHistoryService.js";
import { domainLogger } from "../utils/logger.js";
import { ok, fail } from "../utils/response.js";

/**
 * @param {{ pool, requireAuth, config, logger }} deps
 */
export function createSearchRouter(deps) {
  const { pool, requireAuth, config } = deps;
  const router = Router();

  /* ── GET /search — Unified Search ─────────────────────── */
  router.get("/search", requireAuth, async (req, res, next) => {
    try {
      const q = (req.query.q || "").trim();
      if (!q) return fail(res, "VALIDATION", "Suchbegriff (q) erforderlich");
      if (q.length < 2) return fail(res, "VALIDATION", "Suchbegriff muss mind. 2 Zeichen lang sein");

      const type = req.query.type || "all";
      const available = [...searchService.getAvailableIndexes(), "all"];
      if (!available.includes(type)) {
        return fail(res, "VALIDATION", `Ungueltiger Typ. Erlaubt: ${available.join(", ")}`);
      }

      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const offset = Math.max(parseInt(req.query.offset) || 0, 0);

      // viewerOrgId scoped org-private Domains (requisitions). Marktplatz/Verzeichnis-Domains
      // sind statisch sichtbarkeits-gefiltert im Service.
      const result = await searchService.search(pool, q, { type, limit, offset, viewerOrgId: req.orgId || null });

      // Such-Historie aufzeichnen — fire-and-forget, soft-fail: die Suchantwort haengt nie daran.
      const uid = req.session?.userId;
      if (uid) {
        searchHistory
          .recordSearch(pool, { userId: uid, orgId: req.orgId || null, query: q, type, resultCount: result.total })
          .catch(() => {});
      }

      // Domain Event loggen
      domainLogger.searchPerformed({
        query: q,
        type,
        resultCount: result.total,
        durationMs: result.durationMs,
        source: result.source
      });

      return ok(res, {
        query: q,
        type,
        ...result
      });
    } catch (err) {
      next(err);
    }
  });

  /* ── GET /search/recent — persoenliche letzte Suchen (Topbar) ── */
  router.get("/search/recent", requireAuth, async (req, res, next) => {
    try {
      const items = await searchHistory.getRecentSearches(pool, req.session?.userId, req.query.limit);
      return ok(res, { items });
    } catch (err) {
      next(err);
    }
  });

  /* ── DELETE /search/recent — Historie loeschen (einzeln via ?query= oder komplett) ── */
  router.delete("/search/recent", requireAuth, async (req, res, next) => {
    try {
      const removed = await searchHistory.clearHistory(pool, req.session?.userId, { query: req.query.query || null });
      return ok(res, { removed });
    } catch (err) {
      next(err);
    }
  });

  /* ── GET /search/status — Engine Status ───────────────── */
  router.get("/search/status", requireAuth, async (req, res, next) => {
    try {
      const status = await searchService.getSearchStatus();
      return ok(res, {
        ...status,
        availableIndexes: searchService.getAvailableIndexes()
      });
    } catch (err) {
      next(err);
    }
  });

  /* ── POST /search/reindex/:indexName — Admin Reindex ──── */
  router.post("/search/reindex/:indexName", requireAuth, async (req, res, next) => {
    try {
      const secret = req.headers["x-admin-secret"] || req.query.secret;
      if (!config.ADMIN_SECRET || secret !== config.ADMIN_SECRET) {
        return fail(res, "FORBIDDEN", "Admin-Zugriff erforderlich", 403);
      }

      const { indexName } = req.params;
      if (!searchService.getAvailableIndexes().includes(indexName)) {
        return fail(res, "NOT_FOUND", `Index "${indexName}" nicht gefunden`);
      }

      const result = await searchService.reindexAll(pool, indexName);
      res.locals.audit = { action: "search.reindex", entity_type: "search_index", details: { indexName } };
      return ok(res, { index: indexName, ...result });
    } catch (err) {
      next(err);
    }
  });

  /* ── POST /search/reindex — Admin Reindex All ─────────── */
  router.post("/search/reindex", requireAuth, async (req, res, next) => {
    try {
      const secret = req.headers["x-admin-secret"] || req.query.secret;
      if (!config.ADMIN_SECRET || secret !== config.ADMIN_SECRET) {
        return fail(res, "FORBIDDEN", "Admin-Zugriff erforderlich", 403);
      }

      const results = await searchService.reindexAllIndexes(pool);
      res.locals.audit = { action: "search.reindex_all", entity_type: "search_index" };
      return ok(res, results);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
