/**
 * Auto-Audit Middleware — garantiert, dass jede Mutation geloggt wird.
 *
 * Nutzung in Routes:
 *   res.locals.audit = { action: 'payment.create', entity_type: 'payment_session', entity_id: session.id };
 *   res.locals.audit.old_values = { status: 'pending' };
 *   res.locals.audit.new_values = { status: 'completed' };
 *   res.locals.audit.action_type = 'CREATE';  // optional, wird sonst auto-abgeleitet
 *   res.locals.audit.status = 'DENIED';       // optional, wird aus HTTP-Status abgeleitet
 *
 * Die Middleware schreibt den Audit-Eintrag NACH dem Response (res 'finish' Event).
 * Loggt SUCCESS (2xx), DENIED (4xx) und FAILED (5xx) Events.
 * Wenn res.locals.audit nicht gesetzt ist UND die Methode mutierend ist, wird ein Fallback-Log geschrieben.
 */

import { writeAudit, deriveActionType, resolveAuditActor, withMachineActor, bestimmeAuditOrg } from "../services/auditLog.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Leitet Audit-Status aus HTTP-Statuscode ab */
function deriveAuditStatus(httpStatus) {
  if (httpStatus >= 200 && httpStatus < 300) return 'SUCCESS';
  if (httpStatus >= 400 && httpStatus < 500) return 'DENIED';
  if (httpStatus >= 500) return 'FAILED';
  return 'SUCCESS';
}

/** Pfade die keine Audit-Warnung bei fehlender Markierung erzeugen */
const SKIP_WARNING_PATHS = ["/api/csrf", "/health", "/api/health", "/metrics"];

/**
 * @param {import('pg').Pool} pool
 * @param {{ logger: import('pino').Logger }} opts
 */
export function auditWriteMiddleware(pool, opts = {}) {
  const { logger } = opts;

  return (req, res, next) => {
    if (!MUTATING_METHODS.has(req.method)) return next();

    res.on("finish", async () => {
      const audit = res.locals?.audit;

      if (!audit?.action) {
        // Fallback: unmarkierte Mutation warnen (Entwickler-Hinweis)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (logger && !SKIP_WARNING_PATHS.some(p => req.path.includes(p))) {
            logger.warn(
              { method: req.method, path: req.originalUrl || req.path, userId: req.session?.userId },
              "Mutation ohne Audit-Markierung (res.locals.audit fehlt)"
            );
          }
        }
        return;
      }

      // Audit-Status: explizit gesetzt > aus HTTP-Code abgeleitet
      const auditStatus = audit.status || deriveAuditStatus(res.statusCode);
      const actionType = audit.action_type || deriveActionType(audit.action);

      // Akteur zentral aufloesen: Session ODER Maschine (API-Key/M2M). Frueher stand hier
      // nur `req.session?.userId` — jeder API-Key-Request lief dadurch als `null` durch und
      // war von einem Systemlauf nicht zu unterscheiden (Produktionspfeiler 5).
      const { actor_id, machine } = resolveAuditActor(req);

        /* Die Organisation kommt aus der Quelle der Wahrheit, nicht aus dem
         * Anfragekontext (8.1.1). Eine Route, die es besser weiss, uebergibt
         * `res.locals.audit.org_id`. Begruendung: `bestimmeAuditOrg`. */

      try {
        await writeAudit(pool, {
          action: audit.action,
          action_type: actionType,
          status: auditStatus,
          entity_type: audit.entity_type || "unknown",
          entity_id: audit.entity_id ? String(audit.entity_id) : null,
          actor_id,
          org_id: bestimmeAuditOrg(req, actor_id, audit.org_id),
          details: withMachineActor(audit.details || null, machine),
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
