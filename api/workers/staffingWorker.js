/**
 * Staffing worker — processes background delivery jobs for worker staffing requests.
 * Keeps invite delivery and reminder notifications queue-based and retry-capable.
 */

import { Worker } from "bullmq";
import { getConnectionOpts } from "../queue/connection.js";
import { logger } from "../config/index.js";
import { pool } from "../db/pool.js";

export function startStaffingWorker() {
  const conn = getConnectionOpts();
  if (!conn) return null;

  const worker = new Worker("staffing", async (job) => {
    logger.info({ jobId: job.id, jobName: job.name }, "Processing staffing job");

    /*
     * M1.2 — DER TAKT, DER EIN JAHR LANG FEHLTE.
     *
     * Gemessen (M0, 2026-09-01): `sweepMarktpraesenz` hatte genau einen
     * Aufrufer, und der war ein HTTP-Endpunkt, den im ganzen Stack niemand
     * rief. Der Mechanismus war vollstaendig gebaut (Mig 200/201) — er lief
     * nur nicht. An derselben Zeile hingen ausserdem das automatische
     * Nachruecken und der Verfall von Einladungen.
     *
     * Der Takt ruft die Dienste DIREKT, nicht den eigenen HTTP-Endpunkt: ein
     * Dienst, der sich selbst ueber das Netz aufruft, braucht ein Geheimnis,
     * eine erreichbare Adresse und einen zweiten Fehlerpfad — fuer nichts.
     *
     * Der interne Endpunkt bleibt bestehen. Er ist der Weg, einen Lauf von
     * Hand anzustossen, und der Herzschlag unterscheidet beide sauber
     * (`quelle`: 'takt' gegen 'intern').
     */
    if (job.name === "staffing-maintenance") {
      const [{ runStaffingMaintenance }, { runMarktTakt }] = await Promise.all([
        import("../services/assignmentStaffingService.js"),
        import("../services/marktTakt.js")
      ]);
      const wartung = await runStaffingMaintenance(pool, {
        limit: job.data?.limit || 25,
        cooldownMinutes: job.data?.cooldownMinutes || 15
      });
      /*
       * M4c.3b — HIER FEHLTE DIE RESERVIERUNG.
       *
       * Hier stand `sweepMarktpraesenz(pool)` allein. Der interne Endpunkt ruft
       * VIER Schritte; dieser Takt nahm bei seiner Entstehung (M1.2) zwei davon
       * mit. Gemessen am 2026-09-24: `sweepReservations` hatte nur den Endpunkt
       * als Aufrufer, und den ruft niemand — eine Kraft mit aktivem Einsatz
       * stand zwoelf Tage buchbar im Markt. Die Reservierung war nicht kaputt,
       * sie lief nie.
       *
       * `runMarktTakt` haelt die Reihenfolge jetzt an einer Stelle, fuer Takt
       * UND Endpunkt. Die Marktbefuellung laeuft weiterhin NACH der Wartung:
       * sie soll den Bestand sehen, den die Wartung gerade freigegeben hat.
       */
      const markt = await runMarktTakt(pool);
      logger.info({ jobId: job.id, ...wartung, markt }, "Staffing maintenance tick completed");
      return { ...wartung, marktpraesenz: markt.marktpraesenz, reservierung: markt.reservierung, markt_fehler: markt.fehler };
    }

    /* Vorgabe unveraendert: der Zustellweg. */
    const { processStaffingDeliveryJob } = await import("../services/assignmentStaffingService.js");
    return processStaffingDeliveryJob(pool, {
      inviteId: job.data?.inviteId,
      kind: job.data?.kind || "initial"
    });
  }, {
    connection: conn,
    concurrency: 6
  });

  worker.on("completed", (job) => logger.info({ jobId: job.id, jobName: job.name }, "Staffing job completed"));
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err: err.message }, "Staffing job failed"));

  return worker;
}
