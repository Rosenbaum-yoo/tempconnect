/**
 * TempConnect API – entry point. App is built in app.js; here we create and listen.
 */
import { createApp } from "./app.js";
import { config, logger } from "./config/index.js";
import { pool } from "./db/pool.js";
import { initMonitoring, captureException } from "./utils/monitoring.js";
import { startWorkers, stopWorkers } from "./workers/index.js";
import { closeAll as closeQueues } from "./queue/queues.js";
import { validateEnv } from "./config/envValidator.js";

await initMonitoring({ environment: config.NODE_ENV });

// ── Zentrale ENV-Validierung (Zod) ──────────────────────────
try {
  validateEnv(logger);
  logger.info("ENV-Validierung bestanden");
} catch (e) {
  logger.fatal(e.message);
  process.exit(1);
}

// Unhandled Rejection / Uncaught Exception
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason instanceof Error ? reason.message : String(reason) }, "Unhandled Promise Rejection");
  captureException(reason instanceof Error ? reason : new Error(String(reason)));
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err: err.message, stack: err.stack }, "Uncaught Exception – Server wird beendet");
  captureException(err);
  process.exit(1);
});

const app = await createApp();
const PORT = config.PORT || 3000;
const server = app.listen(PORT, () => {
  /*
   * S4.3 — DER STAND STEHT IM STARTPROTOKOLL.
   *
   * Der Container bedient den HAUPTBAUM (`…/12_tempconnect_docker(D)/api → /app`),
   * nicht den Arbeitsbaum, in dem gerade entwickelt wird. Wer aus einem gruenen
   * Worktree auf einen laufenden Container schliesst, schliesst auf die falsche
   * Datei — und das ist in diesem Projekt schon passiert. Bis hierher blieb nur
   * `ps -o etime` und ein Dateivergleich, um zu sehen, ob ein Container den
   * letzten Merge ueberhaupt kennt.
   *
   * `APP_COMMIT` wird beim Bauen gesetzt (siehe api/Dockerfile). Fehlt der Wert,
   * steht "unbekannt" da — auch das ist eine Aussage, und eine ehrlichere als
   * gar keine Zeile.
   */
  logger.info({
    port: PORT,
    commit: process.env.APP_COMMIT || "unbekannt",
    node: process.version,
    umgebung: config.NODE_ENV || "development"
  }, "TempConnect API gestartet");
  /* Der Mahnlauf braucht den echten Versandweg aus `createApp` — siehe dort. */
  startWorkers({ sendMail: app.locals.sendMail });
});

// Graceful Shutdown – offene Connections sauber schliessen
function gracefulShutdown(signal) {
  logger.info({ signal }, "Shutdown-Signal empfangen, Server wird heruntergefahren...");
  server.close(async () => {
    try {
      await stopWorkers();
      await closeQueues();
      await pool.end();
      logger.info("DB-Pool geschlossen");
    } catch (e) {
      logger.error({ err: e.message }, "Fehler beim Schliessen des DB-Pools");
    }
    process.exit(0);
  });
  // Falls der Server nicht innerhalb von 15s beendet, hart stoppen
  setTimeout(() => {
    logger.warn("Graceful Shutdown Timeout – erzwinge Exit");
    process.exit(1);
  }, 15000);
}
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
