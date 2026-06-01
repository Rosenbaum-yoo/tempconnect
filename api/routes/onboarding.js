/**
 * Enterprise Onboarding Router — persistent checklist endpoints.
 */
import { Router } from "express";
import * as onboardingService from "../services/onboardingService.js";
import * as userService from "../services/userService.js";

export function createOnboardingRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();

  /**
   * GET /onboarding/status — full onboarding checklist with auto-detection.
   */
  router.get("/onboarding/status", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const me = await userService.getUserAndPlan(pool, userId);
      if (!me) return res.status(404).json({ success: false, error: { code: "USER_NOT_FOUND" } });

      const status = await onboardingService.getOnboardingStatus(pool, userId, {
        role: me.role || "company",
        orgId: req.orgId || null,
        onboardingCompleted: me.onboarding_completed || false
      });

      res.json({ success: true, data: status });
    } catch (e) {
      logger.error({ err: e }, "onboarding status");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  /**
   * POST /onboarding/complete-step — manually mark a step as completed.
   * Body: { step: "step_key" }
   */
  router.post("/onboarding/complete-step", requireAuth, async (req, res) => {
    try {
      const stepKey = String(req.body?.step || "").trim();
      if (!stepKey) {
        return res.status(400).json({ success: false, error: { code: "MISSING_STEP", message: "step ist erforderlich." } });
      }

      const ok = await onboardingService.completeStep(
        pool, req.session.userId, stepKey, req.orgId || null
      );

      if (!ok) {
        return res.status(400).json({ success: false, error: { code: "INVALID_STEP", message: "Ungültiger Schritt." } });
      }

      res.locals.audit = {
        action: "onboarding.complete_step",
        entity_type: "onboarding",
        entity_id: stepKey,
        details: { step: stepKey }
      };
      res.json({ success: true, data: { step: stepKey, completed: true } });
    } catch (e) {
      logger.error({ err: e }, "onboarding complete-step");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  /**
   * POST /onboarding/dismiss — dismiss the onboarding checklist.
   */
  router.post("/onboarding/dismiss", requireAuth, async (req, res) => {
    try {
      await onboardingService.dismissChecklist(pool, req.session.userId, req.orgId || null);
      res.locals.audit = {
        action: "onboarding.dismiss",
        entity_type: "onboarding",
        entity_id: String(req.session.userId)
      };
      res.json({ success: true, data: { dismissed: true } });
    } catch (e) {
      logger.error({ err: e }, "onboarding dismiss");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  return router;
}
