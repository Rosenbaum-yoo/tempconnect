/**
 * Auto-Audit Middleware — garantiert, dass jede Mutation geloggt wird.
 *
 * Nutzung in Routes:
 *   res.locals.audit = { action: 'payment.create', entity_type: 'payment_session', entity_id: session.id };
 *   res.locals.audit.old_values = { status: 'pending' };
 *   res.locals.audit.new_values = { status: 'completed' };
 *
 * Die Middleware schreibt den Audit-Eintrag NACH dem Response (res 'finish' Event).
 * Wenn res.locals.audit nicht gesetzt ist UND die Methode mutierend ist, wird ein Fallback-Log geschrieben.
 */

import { writeAudit } from "../services/auditLog.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * @param {import('pg').Pool} pool
 * @param {{ logger: import('pino').Logger }} opts
 */
export function auditWriteMiddleware(pool, opts = {}) {
  const { logger } = opts;

  return (req, res, next) => {
    if (!MUTATING_METHODS.has(req.method)) return next();

    res.on("finish", async () => {
      // Nur bei erfolgreichen Mutationen loggen (2xx)
      if (res.statusCode < 200 || res.statusCode >= 300) return;

      const audit = res.locals?.audit;
      if (!audit?.action) {
        // Fallback: unmarkierte Mutation warnen (Entwickler-Hinweis)
        if (logger && req.path !== "/api/csrf" && !req.path.includes("/health")) {
          logger.warn(
            { method: req.method, path: req.originalUrl || req.path, userId: req.session?.userId },
            "Mutation ohne Audit-Markierung (res.locals.audit fehlt)"
          );
        }
        return;
      }

      try {
        await writeAudit(pool, {
          action: audit.action,
          entity_type: audit.entity_type || "unknown",
          entity_id: audit.entity_id ? String(audit.entity_id) : null,
          actor_id: req.session?.userId || null,
          org_id: req.orgId || null,
          details: audit.details || null,
          old_values: audit.old_values || null,
          new_values: audit.new_values || null,
          ip_address: req.ip || null,
          user_agent: (req.headers?.["user-agent"] || "").slice(0, 500) || null,
          request_id: audit.request_id || null,
          capacity_id: audit.capacity_id || null,
          reservation_id: audit.reservation_id || null
        });
      } catch (err) {
        // Audit-Fehler duerfen den Request nicht brechen, nur loggen
        if (logger) {
          logger.error({ err: err.message, audit }, "Audit-Write fehlgeschlagen");
        }
      }
    });

    next();
  };
}
