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
      const [{ runStaffingMaintenance }, { sweepMarktpraesenz }] = await Promise.all([
        import("../services/assignmentStaffingService.js"),
        import("../services/marktpraesenzService.js")
      ]);
      const wartung = await runStaffingMaintenance(pool, {
        limit: job.data?.limit || 25,
        cooldownMinutes: job.data?.cooldownMinutes || 15
      });
      /* Die Marktbefuellung laeuft NACH der Wartung: sie soll den Bestand
       * sehen, den die Wartung gerade freigegeben hat. */
      const markt = await sweepMarktpraesenz(pool);
      logger.info({ jobId: job.id, ...wartung, markt }, "Staffing maintenance tick completed");
      return { ...wartung, marktpraesenz: markt };
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
