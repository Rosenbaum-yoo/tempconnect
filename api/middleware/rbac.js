/**
 * RBAC-Middleware: requirePermission(permissionKey) und requireRole(roleKey).
 * Nutzt rbacService fuer Org-Membership-Pruefung.
 * Rueckwaertskompatibel: wenn kein org_id im Request, wird die primaere Org des Users verwendet.
 */

import * as rbacService from "../services/rbacService.js";

/**
 * Express-Middleware: pruefe ob der User die angegebene Permission hat.
 * org_id wird aus req.body.org_id, req.query.org_id oder req.params.org_id gelesen,
 * Fallback auf die primaere Org des Users.
 *
 * @param {string} permission – z.B. 'requisition.create'
 * @param {{ pool, logger }} deps
 * @returns {import('express').RequestHandler}
 */
export function requirePermission(permission, deps) {
  const { pool, logger } = deps;
  return async (req, res, next) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "NOT_AUTHENTICATED" });
    }
    const orgId = req.body?.org_id || req.query?.org_id || req.params?.org_id;
    let membership;

    if (orgId) {
      const result = await rbacService.checkPermission(pool, req.session.userId, orgId, permission);
      if (!result.allowed) {
        logger.warn(
          { permission, userId: req.session.userId, orgId, reason: result.reason },
          "RBAC permission denied"
        );
        return res.status(403).json({
          error: "PERMISSION_DENIED",
          permission,
          reason: result.reason
        });
      }
      membership = result.membership;
    } else {
      // Fallback: primaere Org
      membership = await rbacService.getPrimaryOrg(pool, req.session.userId);
      if (membership) {
        if (!rbacService.hasPermission(membership.role_key, permission)) {
          logger.warn(
            { permission, userId: req.session.userId, orgId: membership.org_id, role: membership.role_key },
            "RBAC permission denied (primary org)"
          );
          return res.status(403).json({
            error: "PERMISSION_DENIED",
            permission,
            reason: "PERMISSION_DENIED"
          });
        }
      }
      // Kein Org-Membership = Legacy-User, durchlassen (rueckwaertskompatibel)
    }

    // Membership-Daten an Request haengen fuer nachfolgende Handler
    req.orgMembership = membership || null;
    req.orgId = membership?.org_id || orgId || null;
    next();
  };
}

/**
 * Express-Middleware: pruefe ob der User eine bestimmte Rolle in der Org hat.
 * Einfacher als requirePermission – prueft nur die Rolle direkt.
 *
 * @param {string[]} allowedRoles – z.B. ['owner', 'admin', 'program_manager']
 * @param {{ pool, logger }} deps
 * @returns {import('express').RequestHandler}
 */
export function requireRole(allowedRoles, deps) {
  const { pool, logger } = deps;
  return async (req, res, next) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "NOT_AUTHENTICATED" });
    }
    const orgId = req.body?.org_id || req.query?.org_id || req.params?.org_id;
    let membership;

    if (orgId) {
      membership = await rbacService.getMembership(pool, req.session.userId, orgId);
    } else {
      membership = await rbacService.getPrimaryOrg(pool, req.session.userId);
    }

    if (membership && !allowedRoles.includes(membership.role_key)) {
      logger.warn(
        { allowedRoles, userId: req.session.userId, orgId: membership?.org_id, role: membership?.role_key },
        "RBAC role denied"
      );
      return res.status(403).json({
        error: "ROLE_DENIED",
        required: allowedRoles,
        current: membership?.role_key
      });
    }

    req.orgMembership = membership || null;
    req.orgId = membership?.org_id || orgId || null;
    next();
  };
}
