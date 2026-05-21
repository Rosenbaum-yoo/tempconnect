/**
 * Org Context Middleware — resolves org_id and location_id for every authenticated request.
 * Lightweight: uses session cache to avoid repeated DB queries.
 * Attaches: req.orgId, req.orgRole, req.orgName, req.orgMembership
 *           req.locationId, req.locationName
 * Non-blocking: if resolution fails, request continues (backward-compat for users without org).
 */

import * as rbacService from "../services/rbacService.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a location belongs to the given org and is active.
 * Returns { id, name } or null.
 */
async function resolveLocation(pool, orgId, locationId) {
  if (!orgId || !locationId) return null;
  const { rows } = await pool.query(
    "SELECT id, name FROM org_locations WHERE id = $1 AND org_id = $2 AND is_active = TRUE",
    [locationId, orgId]
  );
  return rows[0] || null;
}

export function orgContextMiddleware(pool) {
  return async (req, res, next) => {
    if (!req.session?.userId) return next();

    // ── Org resolution ──────────────────────────────────────────────────────
    // Explicit org from request takes priority (validate UUID format)
    const explicitOrgHeader = req.headers["x-org-id"];
    let explicitOrg = explicitOrgHeader || req.query?.org_id || req.body?.org_id;
    if (explicitOrg && !UUID_RE.test(String(explicitOrg))) {
      explicitOrg = null; // Reject non-UUID org_id — prevents injection
    }

    try {
      let membership = null;

      if (explicitOrg) {
        // Validate membership for explicit org
        membership = await rbacService.getMembership(pool, req.session.userId, explicitOrg);
        if (membership) {
          req.orgId = membership.org_id;
          req.orgRole = membership.role_key;
          req.orgName = membership.org_name;
          req.orgMembership = membership;
          if (explicitOrgHeader) {
            req.session._orgCache = {
              orgId: membership.org_id,
              role: membership.role_key,
              name: membership.org_name,
              defaultLocationId: membership.location_id || null,
            };
          }
        }
      } else if (req.session._orgCache) {
        // Use session cache (no DB query)
        req.orgId = req.session._orgCache.orgId;
        req.orgRole = req.session._orgCache.role;
        req.orgName = req.session._orgCache.name;
        // req.orgMembership intentionally not set in cache path (avoid stale data)
      } else {
        // Resolve primary org, cache in session
        membership = await rbacService.getPrimaryOrg(pool, req.session.userId);
        if (membership) {
          req.orgId = membership.org_id;
          req.orgRole = membership.role_key;
          req.orgName = membership.org_name;
          req.orgMembership = membership;
          req.session._orgCache = {
            orgId: membership.org_id,
            role: membership.role_key,
            name: membership.org_name,
            defaultLocationId: membership.location_id || null,
          };
        }
      }

      // ── Location resolution ─────────────────────────────────────────────────
      // Only meaningful when we have an org context
      if (req.orgId) {
        const explicitLocHeader = req.headers["x-location-id"];
        let explicitLoc = explicitLocHeader || req.query?.location_id;
        if (explicitLoc && !UUID_RE.test(String(explicitLoc))) {
          explicitLoc = null; // Reject non-UUID — prevents injection
        }

        if (explicitLoc) {
          // Validate: location must belong to the resolved org and be active
          const loc = await resolveLocation(pool, req.orgId, explicitLoc);
          if (loc) {
            req.locationId = loc.id;
            req.locationName = loc.name;
            // Only persist to session if sent via header (not query param)
            if (explicitLocHeader) {
              req.session._locationCache = { locationId: loc.id, locationName: loc.name };
            }
          }
        } else if (req.session._locationCache) {
          // Session cache — re-validate (org could have changed, location could be deleted)
          const cached = req.session._locationCache;
          const loc = await resolveLocation(pool, req.orgId, cached.locationId);
          if (loc) {
            req.locationId = loc.id;
            req.locationName = loc.name;
          } else {
            // Location no longer valid — clear cache, fall back to default
            delete req.session._locationCache;
          }
        } else {
          // Fall back to membership's assigned default location
          const defaultLocId =
            (req.orgMembership || membership)?.location_id ||
            req.session._orgCache?.defaultLocationId ||
            null;
          if (defaultLocId) {
            const loc = await resolveLocation(pool, req.orgId, defaultLocId);
            if (loc) {
              req.locationId = loc.id;
              req.locationName = loc.name;
            }
          }
        }
      }
    } catch {
      // Non-blocking — continue without location context
    }

    next();
  };
}
