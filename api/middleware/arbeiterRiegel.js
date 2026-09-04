/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DER RIEGEL VOR DER PLATTFORM-API (M2.6, Owner-Entscheid 2026-09-03)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Eine Arbeitersitzung erreicht ab hier nur noch, was in
 * `config/arbeiterRiegel.js` steht. Alles andere: 403. **Fail-closed** — eine
 * neue Route ist fuer Arbeiter zu, bis jemand sie eintraegt.
 *
 * WARUM DER FEHLERFALL BEWUSST UMGEKEHRT IST
 * Bis heute war er andersherum: eine neue Route war fuer Arbeiter OFFEN, bis
 * jemand sie schloss. Vergessen hiess dort: Firmendaten gehen an einen
 * Menschen, der sie nicht sehen sollte — still, denn niemand beschwert sich
 * ueber zu viele Daten. Vergessen heisst ab jetzt: eine Portalfunktion
 * antwortet 403. Das faellt beim ersten Klick auf.
 *
 * WO ER HAENGT, UND WARUM GENAU DORT
 * Am v1-ROUTER, als dessen erste Schicht — nicht an `app.use("/api/v1", …)`.
 * Der Router ist ZWEIMAL montiert (`/api/v1` und `/api`, letzteres fuer die
 * bestehende Oberflaeche). Ein Riegel am Mount `/api/v1` waere ueber `/api`
 * vollstaendig zu umgehen gewesen, und zwar unauffaellig: der geschuetzte Pfad
 * haette funktioniert, der ungeschuetzte auch.
 *
 * Er haengt ausserdem NACH `orgContextMiddleware` (app.js), die global vor
 * beiden Mounts laeuft — sonst waere `req.orgMembership` leer und jede Sitzung
 * saehe aus wie keine Arbeitersitzung. Ein Riegel, der niemanden erkennt,
 * meldet nichts und schuetzt nichts. Eine Probe haelt diese Reihenfolge fest.
 *
 * WEN ER NICHT ANFASST
 * Alles, was keine Arbeitersitzung ist. Fuer Unternehmen, Agenturen und
 * Maschinenschluessel aendert sich nichts — `arbeiterSitzung(req)` entscheidet,
 * und dieselbe Funktion entscheidet auch fuer `verweigereArbeiter`. Zwei
 * Kopien dieser Frage waeren zwei Riegel, die sich irgendwann uneinig sind.
 */

import { arbeiterSitzung } from "./orgAccess.js";
import { istErlaubt } from "../config/arbeiterRiegel.js";

export function arbeiterRiegel(deps = {}) {
  const { logger } = deps;

  return function arbeiterRiegelMiddleware(req, res, next) {
    const { istArbeiter, rolle, sitzungsRolle } = arbeiterSitzung(req);
    if (!istArbeiter) return next();

    /*
     * `req.path` ist INNERHALB eines Routers relativ zu dessen Mount — fuer
     * `/api/v1/worker/me` und `/api/worker/me` gleichermassen `/worker/me`.
     * Genau deshalb steht der Riegel am Router und nicht am Mount: er muss den
     * Weg nur EINMAL kennen, egal ueber welche der beiden Adressen er kommt.
     */
    if (istErlaubt(req.method, req.path)) return next();

    logger?.warn?.(
      {
        userId: req.session?.userId || null,
        orgId: req.orgId || null,
        rolle, sitzungsRolle,
        methode: req.method,
        pfad: req.path
      },
      "Arbeiterriegel: Weg nicht freigegeben"
    );

    return res.status(403).json({
      error: "WORKER_ROUTE_NOT_ALLOWED",
      message: "Dieser Weg gehoert zur Verwaltung der Organisation und steht dem "
        + "Einsatzportal nicht offen."
    });
  };
}
