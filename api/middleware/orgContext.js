/**
 * Org Context Middleware — resolves org_id and location_id for every authenticated request.
 *
 * Attaches:
 *   req.orgId           — active organisation UUID
 *   req.orgRole         — active role_key in that org
 *   req.orgName         — org display name
 *   req.orgMembership   — full membership row (when loaded fresh from DB)
 *   req.locationId      — active location UUID (if any)
 *   req.locationName    — location display name
 *   req.locationScope   — 'bound' | 'active' | 'org' | null
 *                         BEFUND M0-B8 (2026-08-15): Dieses Feld wird derzeit
 *                         von KEINER Route und keinem Dienst gelesen — geprüft
 *                         über api/, frontend/ und e2e/. Es bleibt trotzdem
 *                         stehen: die Reporting-Antworten bauen ihren
 *                         `scope`-Block heute selbst zusammen, und dieses Feld
 *                         ist die natürliche Quelle, sobald das vereinheitlicht
 *                         wird. Wer es entfernt, nimmt die Antwort auf eine
 *                         Frage weg, die die Enterprise-Regel „Scope-Transparenz"
 *                         ohnehin stellt.
 *   req.departmentId    — department UUID from membership (if any)
 *
 * Security rules enforced here:
 *   1. X-Org-Id header with invalid UUID → 400 (not silent fallback)
 *   2. X-Location-Id header with invalid UUID → 400
 *   3. X-Location-Id that does not belong to req.orgId → 403
 *   4. Membership bound to a location → X-Location-Id must match, else 403
 *   5. query/body location_id not used as middleware-level scope (only headers matter)
 *   6. Org switch via X-Org-Id clears the stale location cache
 *
 * Non-blocking for unexpected DB errors: middleware always calls next() on error.
 * Explicit bad inputs (rules 1-4) do block and return an HTTP error code.
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

    // ── Header extraction + early UUID validation ────────────────────────────

    const explicitOrgHeader    = req.headers["x-org-id"]      || null;
    const explicitLocHeader    = req.headers["x-location-id"] || null;

    // Rule 1: X-Org-Id present but not a valid UUID → 400 immediately
    if (explicitOrgHeader && !UUID_RE.test(explicitOrgHeader)) {
      return res.status(400).json({ error: "INVALID_ORG_ID", message: "X-Org-Id muss eine gültige UUID sein." });
    }

    // Rule 2: X-Location-Id present but not a valid UUID → 400 immediately
    if (explicitLocHeader && !UUID_RE.test(explicitLocHeader)) {
      return res.status(400).json({ error: "INVALID_LOCATION_ID", message: "X-Location-Id muss eine gültige UUID sein." });
    }

    // query/body org_id accepted as fallback (silently drop if invalid)
    let fallbackOrg = req.query?.org_id || req.body?.org_id || null;
    if (fallbackOrg && !UUID_RE.test(String(fallbackOrg))) fallbackOrg = null;

    const explicitOrg = explicitOrgHeader || fallbackOrg;

    try {
      let membership = null;

      // ── Org resolution ────────────────────────────────────────────────────
      if (explicitOrg) {
        membership = await rbacService.getMembership(pool, req.session.userId, explicitOrg);
        if (membership) {
          req.orgId = membership.org_id;
          req.orgRole = membership.role_key;
          req.orgName = membership.org_name;
          req.orgMembership = membership;

          if (explicitOrgHeader) {
            // Rule 6: org switched via header — clear stale location cache
            if (req.session._orgCache?.orgId && req.session._orgCache.orgId !== membership.org_id) {
              delete req.session._locationCache;
            }
            req.session._orgCache = {
              orgId: membership.org_id,
              role:  membership.role_key,
              name:  membership.org_name,
              defaultLocationId: membership.location_id || null,
            };
          }
        }
      }

      // ── Rueckfall: der Kontext bleibt NIE leer, nur weil ein Wunsch nicht aufging
      //
      // SICHERHEIT (Regel 7, ergaenzt 2026-07-26 — Audit-Backlog C-11):
      // Frueher endete die Aufloesung hier mit `req.orgId === null`, wenn
      // `explicitOrg` eine Org nannte, in der der Nutzer keine Mitgliedschaft hat.
      // Das war kein harmloser Leerwert: 45 Routen pruefen die Org-Grenze als
      //     if (req.orgId && ressource.org_id !== req.orgId) return 403;
      // — eine Pruefung, die sich bei `null` selbst abschaltet. Sie fiel damit
      // genau im Angriffsfall aus. Neun dieser Routen (u. a.
      // `GET /organizations/:id/members|locations|departments`) laufen ohne
      // vorgelagerten Permission-Guard; dort war es ein erreichbares Cross-Org-Leck:
      // fremde org_id einmal im Pfad, einmal als `?org_id=` — und die Mitglieder-
      // liste kam zurueck. Nachgestellt in
      // `test/integration/orgContextBoundary.security.test.js`.
      //
      // Ein nicht aufloesbarer Org-Wunsch wird deshalb verworfen wie ein
      // ungueltiger UUID-Wert, und der Kontext faellt auf die eigene Org zurueck.
      // Die Grenzpruefungen der Routen laufen dann wieder und antworten sauber mit
      // ORG_BOUNDARY_VIOLATION statt Daten auszuliefern.
      if (!req.orgId) {
        if (req.session._orgCache) {
          // Session cache: org already resolved, skip DB
          req.orgId   = req.session._orgCache.orgId;
          req.orgRole = req.session._orgCache.role;
          req.orgName = req.session._orgCache.name;
          // req.orgMembership intentionally not set (avoid stale data on cache path)
        } else {
          // No usable org wish, no cache: resolve from users.org_id / first membership
          membership = await rbacService.getPrimaryOrg(pool, req.session.userId);
          if (membership) {
            req.orgId = membership.org_id;
            req.orgRole = membership.role_key;
            req.orgName = membership.org_name;
            req.orgMembership = membership;
            req.session._orgCache = {
              orgId: membership.org_id,
              role:  membership.role_key,
              name:  membership.org_name,
              defaultLocationId: membership.location_id || null,
            };
          }
        }
      }

      // ── Set departmentId from membership ──────────────────────────────────
      const activeMembership = req.orgMembership || membership;
      if (activeMembership?.department_id) {
        req.departmentId = activeMembership.department_id;
      }

      // ── Location resolution ───────────────────────────────────────────────
      if (!req.orgId) {
        req.locationScope = null;
        return next();
      }

      // Membership's bound location (the one assigned in org_memberships.location_id)
      const membershipLocationId =
        activeMembership?.location_id ||
        req.session._orgCache?.defaultLocationId ||
        null;
      const isBound = !!membershipLocationId;

      if (explicitLocHeader) {
        // Rule 4: location-bound membership cannot switch to another location
        if (isBound && explicitLocHeader !== membershipLocationId) {
          return res.status(403).json({
            error:   "LOCATION_ACCESS_DENIED",
            message: "Ihre Mitgliedschaft ist auf einen festen Standort beschränkt."
          });
        }

        const loc = await resolveLocation(pool, req.orgId, explicitLocHeader);
        if (!loc) {
          // Rule 3: location not in org → 403
          return res.status(403).json({
            error:   "LOCATION_NOT_IN_ORG",
            message: "Der Standort gehört nicht zu Ihrer Organisation oder ist inaktiv."
          });
        }

        req.locationId    = loc.id;
        req.locationName  = loc.name;
        req.locationScope = isBound ? 'bound' : 'active';
        // Persist explicitly chosen location in session (header = intentional choice)
        req.session._locationCache = { locationId: loc.id, locationName: loc.name };

      } else if (req.session._locationCache) {
        const cached = req.session._locationCache;

        // Binding enforcement against stale cache: if membership is bound to a
        // different location than what the cache holds, reset it.
        if (isBound && cached.locationId !== membershipLocationId) {
          delete req.session._locationCache;
          // Will fall through to membership-default below
        } else {
          const loc = await resolveLocation(pool, req.orgId, cached.locationId);
          if (loc) {
            req.locationId    = loc.id;
            req.locationName  = loc.name;
            req.locationScope = isBound ? 'bound' : 'active';
          } else {
            // Cached location deleted/deactivated: reset and fall through
            delete req.session._locationCache;
          }
        }
      }

      // If still unresolved: fall back to membership's assigned default location
      if (!req.locationId && membershipLocationId) {
        const loc = await resolveLocation(pool, req.orgId, membershipLocationId);
        if (loc) {
          req.locationId    = loc.id;
          req.locationName  = loc.name;
          req.locationScope = 'bound';
        }
      }

      // Final scope: if no location resolved, user sees org-wide
      if (!req.locationScope) {
        req.locationScope = 'org';
      }

    } catch {
      // Unexpected DB error — non-blocking, continue without location context
    }

    // ── RLS-Helper: SET LOCAL für Transaktions-Clients ──────────────────────
    // Services können req.setOrgContext(client) aufrufen um in einer bereits
    // laufenden Transaktion den Org-Context zu setzen.
    // Empfehlung: withOrgContext(pool, req.orgId, fn) aus utils/orgContext.js verwenden —
    // das macht SET LOCAL automatisch am Transaction-Anfang.
    if (req.orgId) {
      req.setOrgContext = async (client) => {
        await client.query("SET LOCAL app.current_org_id = $1", [req.orgId]);
        await client.query("SET LOCAL app.rls_bypass = $1", [""]);
      };
    }

    next();
  };
}
