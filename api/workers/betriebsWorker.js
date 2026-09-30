/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DER MOTOR FUER DIE FUENF (M1.9, Owner-Entscheid 2026-09-04)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Fuenf Automatismen waren vollstaendig gebaut, hatten einen internen Endpunkt
 * — und keinen Ausloeser. Gemessen am 2026-09-03: niemand rief sie.
 *
 * WARUM EINE EIGENE WARTESCHLANGE
 * Der naheliegende Weg waere gewesen, sie in `staffing` mitlaufen zu lassen;
 * dort steht bereits ein Takt. Dagegen sprechen drei Dinge, und alle drei
 * kosten spaeter mehr, als die Datei hier heute kostet:
 *
 *   1. Der Name ist die Diagnose. Der Herzschlag heisst `${queue}:${job}` —
 *      "staffing:dunning-sweep" waere eine Mahnstrecke unter dem Namen der
 *      Personalvermittlung. Wer in einem Jahr ein Protokoll liest, sucht falsch.
 *   2. Diese fuenf fassen Geld an. Eine eigene Warteschlange heisst eigene
 *      Nebenlaeufigkeit und eigene Fehlerflaeche: eine haengende Mahnstrecke
 *      blockiert nicht die Zustellung von Einladungen.
 *   3. Ein Takt gehoert an den Arbeiter, der ihn verarbeitet. Die Einplanung
 *      steht deshalb in `workers/index.js` direkt neben dem Start DIESES
 *      Arbeiters — sonst laege ein Auftrag in Redis, den niemand abholt.
 *
 * DIE ABLAEUFE STEHEN NICHT HIER. Sie stehen in
 * `services/betriebsTaktLaeufe.js` und werden vom internen Endpunkt genauso
 * benutzt. Dieser Arbeiter ist nur der zweite Ausloeser, nicht die zweite
 * Fassung.
 *
 * KEIN try/catch. Ein gescheiterter Lauf muss ein `failed`-Job werden — daran
 * haengt der Herzschlag (`utils/metrics.js`), und daran haengt die Kachel im
 * Staff CC. Ein geschluckter Fehler waere ein Takt, der still nichts tut, und
 * das ist genau der Zustand, gegen den diese ganze Phase gebaut wurde.
 */

import { Worker } from "bullmq";
import { getConnectionOpts } from "../queue/connection.js";
import { logger, config } from "../config/index.js";
import { pool } from "../db/pool.js";
import { LAEUFE } from "../services/betriebsTaktLaeufe.js";

export function startBetriebsWorker(deps = {}) {
  const conn = getConnectionOpts();
  if (!conn) return null;

  const sendMail = deps.sendMail || null;

  const worker = new Worker("betrieb", async (job) => {
    const lauf = LAEUFE[job.name];
    if (!lauf) {
      /* Ein unbekannter Auftragsname ist ein Fehler, kein Achselzucken: er
       * entsteht nur, wenn eine Einplanung und die Ablauf-Tabelle
       * auseinanderlaufen — und ein stilles `return` liesse den Herzschlag
       * dabei auf "ok" stehen. */
      throw new Error(`Unbekannter Betriebstakt: ${job.name}`);
    }
    logger.info({ jobId: job.id, jobName: job.name }, "Betriebstakt gestartet");
    const ergebnis = await lauf(pool, {
      config, logger, sendMail,
      batchSize: job.data?.batchSize || job.data?.batch_size
    });
    logger.info({ jobId: job.id, jobName: job.name, ...ergebnis }, "Betriebstakt beendet");
    return ergebnis;
  }, {
    connection: conn,
    /* Bewusst 1: diese Laeufe sind Mengenoperationen ueber dieselben Tabellen.
     * Zwei gleichzeitige Mahnlaeufe waeren kein Geschwindigkeitsgewinn, sondern
     * ein Wettlauf um dieselben Rechnungen. */
    concurrency: 1
  });

  worker.on("completed", (job) => logger.info({ jobId: job.id, jobName: job.name }, "Betriebstakt abgeschlossen"));
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, jobName: job?.name, err: err.message }, "Betriebstakt gescheitert"));

  return worker;
}
