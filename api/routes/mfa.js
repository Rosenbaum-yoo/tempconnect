import { Router } from "express";
import * as mfaService from "../services/mfaService.js";

export function createMFARouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();

  router.get("/mfa/status", requireAuth, async (req, res) => {
    try {
      const status = await mfaService.getMFAStatus(pool, req.session.userId);
      res.json(status);
    } catch (e) { logger.error({ err: e }, "GET /mfa/status"); res.status(500).json({ error: "SERVER_ERROR" }); }
  });

  router.post("/mfa/setup", requireAuth, async (req, res) => {
    try {
      const result = await mfaService.generateSecret(pool, req.session.userId);
      res.locals.audit = { action: "mfa.setup", entity_type: "user", entity_id: req.session.userId };
      res.json(result);
    } catch (e) { logger.error({ err: e }, "POST /mfa/setup"); res.status(500).json({ error: "SERVER_ERROR" }); }
  });

  router.post("/mfa/enable", requireAuth, async (req, res) => {
    try {
      const { token } = req.body || {};
      if (!token) return res.status(400).json({ error: "TOKEN_REQUIRED" });
      const result = await mfaService.enableMFA(pool, req.session.userId, token);
      if (result.error) return res.status(400).json({ error: result.error });
      res.locals.audit = { action: "mfa.enable", entity_type: "user", entity_id: req.session.userId };
      res.json(result);
    } catch (e) { logger.error({ err: e }, "POST /mfa/enable"); res.status(500).json({ error: "SERVER_ERROR" }); }
  });

  router.post("/mfa/verify", requireAuth, async (req, res) => {
    try {
      const { token } = req.body || {};
      if (!token) return res.status(400).json({ error: "TOKEN_REQUIRED" });
      const result = await mfaService.verifyToken(pool, req.session.userId, token);
      if (!result.valid) return res.status(401).json({ error: "INVALID_TOKEN" });
      // MFA-Verifikations-Zeitstempel in Session setzen (wird von requireMfa-Middleware geprüft)
      req.session.mfaVerifiedAt = Date.now();
      res.locals.audit = { action: "mfa.verify", entity_type: "user", entity_id: req.session.userId, details: { valid: true } };
      res.json({ ok: true, ...result });
    } catch (e) { logger.error({ err: e }, "POST /mfa/verify"); res.status(500).json({ error: "SERVER_ERROR" }); }
  });

  router.post("/mfa/disable", requireAuth, async (req, res) => {
    try {
      const { token } = req.body || {};
      if (!token) return res.status(400).json({ error: "TOKEN_REQUIRED" });
      const result = await mfaService.disableMFA(pool, req.session.userId, token);
      if (result.error) return res.status(400).json({ error: result.error });
      res.locals.audit = { action: "mfa.disable", entity_type: "user", entity_id: req.session.userId };
      res.json(result);
    } catch (e) { logger.error({ err: e }, "POST /mfa/disable"); res.status(500).json({ error: "SERVER_ERROR" }); }
  });

  return router;
}
