/**
 * Org Context Middleware — resolves org_id for every authenticated request.
 * Lightweight: uses session cache to avoid repeated DB queries.
 * Attaches: req.orgId, req.orgRole, req.orgName
 * Non-blocking: if resolution fails, request continues (backward-compat for users without org).
 */

import * as rbacService from "../services/rbacService.js";

export function orgContextMiddleware(pool) {
  return async (req, res, next) => {
    if (!req.session?.userId) return next();

    // Explicit org from request takes priority (validate UUID format)
    let explicitOrg = req.headers["x-org-id"] || req.query?.org_id || req.body?.org_id;
    if (explicitOrg && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(explicitOrg))) {
      explicitOrg = null; // Reject non-UUID org_id — prevents injection
    }

    try {
      if (explicitOrg) {
        // Validate membership
        const m = await rbacService.getMembership(pool, req.session.userId, explicitOrg);
        if (m) {
          req.orgId = m.org_id;
          req.orgRole = m.role_key;
          req.orgName = m.org_name;
          req.orgMembership = m;
        }
      } else if (req.session._orgCache) {
        // Use session cache
        req.orgId = req.session._orgCache.orgId;
        req.orgRole = req.session._orgCache.role;
        req.orgName = req.session._orgCache.name;
      } else {
        // Resolve primary org, cache in session
        const m = await rbacService.getPrimaryOrg(pool, req.session.userId);
        if (m) {
          req.orgId = m.org_id;
          req.orgRole = m.role_key;
          req.orgName = m.org_name;
          req.orgMembership = m;
          req.session._orgCache = { orgId: m.org_id, role: m.role_key, name: m.org_name };
        }
      }
    } catch {
      // Non-blocking — continue without org context
    }

    next();
  };
}
