/**
 * orgBoundary.js — Cross-Entity Boundary Guards fuer Multi-Location.
 *
 * Prueft, dass location_id / department_id aus Request-Body oder -Params
 * zur aktuellen Org des Aufrufers gehoeren. Verhindert Cross-Org-Injection.
 *
 * Voraussetzungen: requireAuth + orgContextMiddleware (req.orgId muss gesetzt sein).
 *
 * Exportierte Guards:
 *   requireLocationBelongsToOrg(extractLocationId?)
 *   requireDepartmentBelongsToOrg(extractDepartmentId?)
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validiert, dass eine `location_id` aus dem Request zur Org des Aufrufers gehoert
 * und aktiv ist. Setzt `req.validatedLocationId` und `req.validatedLocationName`.
 *
 * @param {(req: import('express').Request) => string | null | undefined} [extractLocationId]
 *   Funktion zum Extrahieren der location_id aus dem Request.
 *   Default: liest aus `req.body.location_id`, `req.params.location_id`, `req.query.location_id`.
 *   Gibt `null` zurueck → Guard wird uebersprungen (optional location).
 *   Gibt eine ID zurueck → wird validiert.
 *
 * @param {{ pool: import('pg').Pool, optional?: boolean }} deps
 *   `optional`: Wenn true, wird fehlende/ungueltige location_id toleriert (kein 4xx).
 *               Sinnvoll, wenn location_id bei Erstellung optional ist.
 */
export function requireLocationBelongsToOrg(extractLocationId, deps = {}) {
  const { pool, optional = false } = deps;

  return async (req, res, next) => {
    const orgId = req.orgId || null;
    if (!orgId) {
      return res.status(403).json({ error: { code: "ORG_REQUIRED" } });
    }

    // Extraktion
    const rawId = extractLocationId
      ? extractLocationId(req)
      : (req.body?.location_id || req.params?.location_id || req.query?.location_id || null);

    // Kein locationId angegeben
    if (!rawId) {
      if (optional) return next();
      return res.status(400).json({
        error: { code: "LOCATION_ID_REQUIRED", message: "Standort-ID erforderlich." }
      });
    }

    // Format-Pruefung
    if (!UUID_RE.test(String(rawId))) {
      return res.status(400).json({
        error: { code: "INVALID_LOCATION_ID", message: "Ungueltige Standort-ID." }
      });
    }

    try {
      const { rows } = await pool.query(
        "SELECT id, name FROM org_locations WHERE id = $1 AND org_id = $2 AND is_active = TRUE",
        [rawId, orgId]
      );
      const loc = rows[0];
      if (!loc) {
        if (optional) return next(); // nicht gefunden, aber optional → tolerieren
        return res.status(404).json({
          error: {
            code: "LOCATION_NOT_FOUND",
            message: "Standort nicht gefunden oder nicht zugaenglich."
          }
        });
      }
      // Validierte Werte an Request haengen
      req.validatedLocationId = loc.id;
      req.validatedLocationName = loc.name;
      next();
    } catch (e) {
      next(e);
    }
  };
}

/**
 * Validiert, dass eine `department_id` aus dem Request zur Org des Aufrufers gehoert
 * und aktiv ist. Setzt `req.validatedDepartmentId` und `req.validatedDepartmentName`.
 *
 * @param {(req: import('express').Request) => string | null | undefined} [extractDepartmentId]
 * @param {{ pool: import('pg').Pool, optional?: boolean }} deps
 */
export function requireDepartmentBelongsToOrg(extractDepartmentId, deps = {}) {
  const { pool, optional = false } = deps;

  return async (req, res, next) => {
    const orgId = req.orgId || null;
    if (!orgId) {
      return res.status(403).json({ error: { code: "ORG_REQUIRED" } });
    }

    const rawId = extractDepartmentId
      ? extractDepartmentId(req)
      : (req.body?.department_id || req.params?.department_id || req.query?.department_id || null);

    if (!rawId) {
      if (optional) return next();
      return res.status(400).json({
        error: { code: "DEPARTMENT_ID_REQUIRED", message: "Abteilungs-ID erforderlich." }
      });
    }

    if (!UUID_RE.test(String(rawId))) {
      return res.status(400).json({
        error: { code: "INVALID_DEPARTMENT_ID", message: "Ungueltige Abteilungs-ID." }
      });
    }

    try {
      const { rows } = await pool.query(
        "SELECT id, name FROM org_departments WHERE id = $1 AND org_id = $2 AND is_active = TRUE",
        [rawId, orgId]
      );
      const dept = rows[0];
      if (!dept) {
        if (optional) return next();
        return res.status(404).json({
          error: {
            code: "DEPARTMENT_NOT_FOUND",
            message: "Abteilung nicht gefunden oder nicht zugaenglich."
          }
        });
      }
      req.validatedDepartmentId = dept.id;
      req.validatedDepartmentName = dept.name;
      next();
    } catch (e) {
      next(e);
    }
  };
}
