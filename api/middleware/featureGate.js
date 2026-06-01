/**
 * requireFeature(featureKey): ensure user's plan has access to the feature.
 * Plan from getUserAndPlan; default DEMO if user/plan unknown.
 * On violation: 403 with code FEATURE_NOT_ALLOWED and server-side log.
 */

import { hasFeature } from "../config/planFeatures.js";

const DEFAULT_PLAN = "DEMO";

/**
 * @param {string} featureKey - Key from planFeatures (e.g. legacy_access, sla_access)
 * @param {{ getUserAndPlan: (userId: string) => Promise<{ plan: string, id: string } | null>, logger: { warn: (o: object, msg: string) => void } }} deps
 * @returns {import('express').RequestHandler}
 */
export function requireFeature(featureKey, deps) {
  const { getUserAndPlan, logger } = deps;
  return async (req, res, next) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "NOT_AUTHENTICATED" });
    }
    const me = await getUserAndPlan(req.session.userId, { orgId: req.orgId || null });
    const plan = me?.plan ?? DEFAULT_PLAN;
    // Pilot-Kontext durchreichen damit isPilotCustomer() in hasFeature() greift
    const featureOpts = {
      pilot_status: me?.pilot?.pilot_status || null,
      customer_stage: me?.customer_stage || null
    };
    if (!hasFeature(plan, featureKey, featureOpts)) {
      logger.warn(
        { featureKey, userId: req.session.userId, plan },
        "Feature gate violation"
      );
      return res.status(403).json({
        ok: false,
        error: "FEATURE_NOT_ALLOWED",
        code: "FEATURE_NOT_ALLOWED",
        feature: featureKey,
        plan
      });
    }
    req.user = me;
    next();
  };
}
