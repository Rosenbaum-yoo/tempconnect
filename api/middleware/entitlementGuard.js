/**
 * entitlementGuard.js — Backend-Guards fuer die Entitlement-Engine.
 *
 * Liefert konsistente Fehler-Envelopes:
 *   { error: { code, message, feature?, plan?, current?, limit?, subscription_status? } }
 *
 * Codes (verbindlich):
 *   - NOT_AUTHENTICATED     (401) Session fehlt
 *   - ORG_REQUIRED          (403) Keine Org im Kontext
 *   - SUBSCRIPTION_INACTIVE (403) Subscription nicht aktiv (canceled/past_due)
 *   - FEATURE_NOT_ENABLED   (403) Feature nicht im Plan enthalten
 *   - FEATURE_PENDING_APPROVAL (409) Feature wartet auf Staff-Freigabe
 *   - FEATURE_NOT_MATURE    (403) Maturity-Gate aktiv
 *   - PLAN_LIMIT_REACHED    (429) Usage-Limit erreicht
 *   - FORBIDDEN_CROSS_ORG   (403) Versuch, fremde Org-Daten zu schreiben
 */

import * as entitlement from "../services/entitlementService.js";

/**
 * Verlangt aktives Abo der req.orgId. Public-/Demo-Pfade NICHT damit schuetzen.
 */
export function requireActiveSubscription(deps) {
  const { pool } = deps || {};
  return async (req, res, next) => {
    if (!req.session?.userId) return res.status(401).json({ error: { code: "NOT_AUTHENTICATED" } });
    const orgId = req.orgId || null;
    if (!orgId) return res.status(403).json({ error: { code: "ORG_REQUIRED" } });
    try {
      const ent = await entitlement.getOrganizationEntitlements(pool, orgId);
      if (!ent.subscription?.active) {
        return res.status(403).json({
          error: {
            code: "SUBSCRIPTION_INACTIVE",
            message: "Subscription ist nicht aktiv.",
            subscription_status: ent.subscription?.status || null
          }
        });
      }
      req.entitlements = ent;
      next();
    } catch (e) {
      next(e);
    }
  };
}

/**
 * Verlangt, dass das Feature fuer die aktuelle Org freigeschaltet ist.
 * Schreibt `req.entitlements` fuer downstream Handler, damit der Snapshot
 * nicht erneut geladen wird.
 */
export function requireOrgFeature(featureKey, deps) {
  const { pool, logger } = deps || {};
  return async (req, res, next) => {
    if (!req.session?.userId) return res.status(401).json({ error: { code: "NOT_AUTHENTICATED" } });
    const orgId = req.orgId || null;
    if (!orgId) return res.status(403).json({ error: { code: "ORG_REQUIRED", feature: featureKey } });
    try {
      const ent = await entitlement.getOrganizationEntitlements(pool, orgId);
      if (!ent.subscription?.active) {
        return res.status(403).json({
          error: {
            code: "SUBSCRIPTION_INACTIVE",
            message: "Das Abo ist nicht aktiv. Bitte Abo reaktivieren, um diese Funktion zu nutzen.",
            feature: featureKey,
            plan: ent.effective_plan,
            subscription_status: ent.subscription?.status || null,
            requires_staff_approval: false
          }
        });
      }
      const check = await entitlement.canUseFeature(pool, orgId, featureKey);
      if (!check.allowed) {
        const status = check.code === "FEATURE_PENDING_APPROVAL" ? 409 : 403;
        if (logger?.warn) {
          logger.warn(
            { featureKey, code: check.code, plan: ent.effective_plan, orgId },
            "entitlement gate violation"
          );
        }
        return res.status(status).json({
          error: {
            code: check.code,
            message: check.message || null,
            feature: featureKey,
            plan: ent.effective_plan,
            subscription_status: ent.subscription?.status || null,
            requires_staff_approval: check.requires_staff_approval || false
          }
        });
      }
      req.entitlements = ent;
      next();
    } catch (e) {
      next(e);
    }
  };
}

/**
 * Verlangt, dass das Plan-Limit fuer eine Metric noch nicht ueberschritten ist.
 * `metric` ist eines der Keys aus `usageMeteringService.checkUsageLimit`.
 */
export function requireOrgLimit(metric, deps) {
  const { pool, logger } = deps || {};
  return async (req, res, next) => {
    if (!req.session?.userId) return res.status(401).json({ error: { code: "NOT_AUTHENTICATED" } });
    const orgId = req.orgId || null;
    if (!orgId) return res.status(403).json({ error: { code: "ORG_REQUIRED", metric } });
    try {
      const usage = await entitlement.getUsageAgainstLimits(pool, orgId);
      const m = usage?.[metric];
      if (!m) {
        return res.status(400).json({ error: { code: "INVALID_LIMIT_METRIC", metric } });
      }
      if (m.allowed === false) {
        if (logger?.warn) {
          logger.warn({ metric, orgId, current: m.current, limit: m.limit }, "plan limit reached");
        }
        return res.status(429).json({
          error: {
            code: "PLAN_LIMIT_REACHED",
            metric,
            current: m.current,
            limit: m.limit
          }
        });
      }
      req.usage = usage;
      next();
    } catch (e) {
      next(e);
    }
  };
}

/**
 * Stellt sicher, dass `req.locationId` durch orgContextMiddleware gesetzt wurde.
 * Verwenden nach requireAuth + orgContextMiddleware in der Middleware-Kette.
 * Passiert ohne DB-Query (reine req-Property-Pruefung).
 */
export function requireLocationContext(req, res, next) {
  if (!req.locationId) {
    return res.status(403).json({
      error: {
        code: "NO_LOCATION_CONTEXT",
        message: "Standort-Kontext erforderlich. Bitte Standort auswählen."
      }
    });
  }
  next();
}

/**
 * Feature-Gate: Verlangt, dass die Org das Feature `multi_location` hat.
 * Kurz-Wrapper um requireOrgFeature fuer location-spezifische Routen.
 * Schreibt zusaetzlich `req.entitlements` fuer downstream Handler.
 */
export function requireMultiLocationFeature(deps) {
  return requireOrgFeature("multi_location", deps);
}

/**
 * Stellt sicher, dass der Aufrufer NICHT versucht, fremde Org-Daten zu
 * mutieren. Erwartet eine `extractTargetOrgId(req)`-Funktion die aus der
 * Route den Ziel-orgId zieht.
 */
export function requireSameOrg(extractTargetOrgId) {
  return (req, res, next) => {
    if (!req.session?.userId) return res.status(401).json({ error: { code: "NOT_AUTHENTICATED" } });
    const myOrg = req.orgId || null;
    const target = extractTargetOrgId(req);
    if (!target) return res.status(400).json({ error: { code: "TARGET_ORG_REQUIRED" } });
    if (!myOrg || String(myOrg) !== String(target)) {
      return res.status(403).json({
        error: { code: "FORBIDDEN_CROSS_ORG", my_org_id: myOrg || null, target_org_id: target }
      });
    }
    next();
  };
}
