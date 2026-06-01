import { Router } from "express";
import * as creditService from "../services/creditService.js";

export function createCreditsRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();

  router.get("/credits/balance", requireAuth, async (req, res) => {
    try {
      const account = await creditService.getBalance(pool, req.session.userId);
      res.json(account);
    } catch (e) { logger.error({ err: e }, "GET /credits/balance"); res.status(500).json({ error: "SERVER_ERROR" }); }
  });

  router.get("/credits/transactions", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 50;
      const rows = await creditService.getTransactionHistory(pool, req.session.userId, limit);
      res.json({ transactions: rows });
    } catch (e) { logger.error({ err: e }, "GET /credits/transactions"); res.status(500).json({ error: "SERVER_ERROR" }); }
  });

  router.get("/credits/packages", async (_req, res) => {
    try {
      const packages = await creditService.getPackages(pool);
      res.json({ packages });
    } catch (e) { logger.error({ err: e }, "GET /credits/packages"); res.status(500).json({ error: "SERVER_ERROR" }); }
  });

  router.post("/credits/purchase", requireAuth, async (req, res) => {
    try {
      const { package_id } = req.body || {};
      if (!package_id) return res.status(400).json({ error: "PACKAGE_ID_REQUIRED" });
      const result = await creditService.purchasePackage(pool, req.session.userId, package_id);
      if (result.error) return res.status(400).json({ error: result.error });
      res.locals.audit = {
        action: "credits.purchase",
        entity_type: "credit_transaction",
        entity_id: result?.transaction?.id || null,
        details: { package_id }
      };
      res.json(result);
    } catch (e) { logger.error({ err: e }, "POST /credits/purchase"); res.status(500).json({ error: "SERVER_ERROR" }); }
  });

  return router;
}
