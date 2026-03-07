import { Router } from "express";
import { PLAN_LIMITS } from "../services/userService.js";
import { PLAN, planFeatures } from "../config/planFeatures.js";

/**
 * @param {{}} _deps
 */
export function createPlansRouter(_deps) {
  const router = Router();
  router.get("/plans", (req, res) => {
    res.json(PLAN_LIMITS);
  });
  router.get("/plan-features", (req, res) => {
    res.json({ PLAN, planFeatures });
  });
  return router;
}
