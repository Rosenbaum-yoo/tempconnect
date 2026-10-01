/**
 * Worker bootstrap — starts all BullMQ workers.
 * Called once from server.js after the app has started.
 */

import { isQueueAvailable } from "../queue/connection.js";
import { startEmailWorker } from "./emailWorker.js";
import { startMatchWorker } from "./matchWorker.js";
import { startCapacityWorker } from "./capacityWorker.js";
import { startStaffingWorker } from "./staffingWorker.js";
import { startBetriebsWorker } from "./betriebsWorker.js";
import { instrumentWorker, registerQueueMetrics } from "../utils/metrics.js";
import { emailQueue, matchQueue, capacityQueue, staffingQueue, betriebQueue } from "../queue/queues.js";
import { logger } from "../config/index.js";
import { pool } from "../db/pool.js";

const _workers = [];

/**
 * Plant die wiederkehrenden Capacity-Sweeps (BullMQ Job Scheduler, idempotent via Scheduler-ID,
 * ueberlebt Neustarts ohne Duplikate). Bisher gab es zwar den capacity-Worker, aber NICHTS
 * hat die Jobs eingeplant -> Expiry lief nie. Taeglich 03:00:
 *  - capacity-expiry: abgelaufene Angebote (Supply availability_to/valid_until + Demand end_date) -> status='expired'
 *  - capacity-stale-check: ueberfaellige Eintraege zur Reconfirmation melden
 */
function scheduleCapacitySweeps() {
  const q = capacityQueue();
  if (!q || typeof q.upsertJobScheduler !== "function") return;
  q.upsertJobScheduler("capacity-expiry-daily", { pattern: "0 3 * * *" }, { name: "capacity-expiry" })
    .catch((e) => logger.warn({ err: e.message }, "Could not schedule capacity-expiry sweep"));
  q.upsertJobScheduler("capacity-stale-daily", { pattern: "30 3 * * *" }, { name: "capacity-stale-check" })
    .catch((e) => logger.warn({ err: e.message }, "Could not schedule capacity-stale sweep"));
  /* P10/E5 — Aufbewahrung des Zustands-Protokolls (24 Monate). Taeglich 04:00,
   * nach den Capacity-Sweeps. Ohne Redis laeuft dieser Takt nicht; die Tabelle
   * waechst dann weiter. Deshalb steht die Frist zusaetzlich als Funktion in der
   * Datenbank (Mig 179) und laesst sich jederzeit von Hand ausloesen:
   *   SELECT worker_status_events_aufraeumen(); */
  q.upsertJobScheduler("worker-status-events-retention-daily", { pattern: "0 4 * * *" }, { name: "worker-status-events-retention" })
    .catch((e) => logger.warn({ err: e.message }, "Could not schedule status-events retention sweep"));
  /* Ersatz-Frist (Plan I, 8.2): 4-h-Verfall + 2-h-Erinnerung. Alle 10 Minuten,
   * nicht taeglich — eine 4-h-Frist mit Tagestakt waere eine Attrappe. Das
   * Mengen-UPDATE im Sweep ist idempotent; kollidiert dieser Takt mit dem
   * internen Endpunkt, aendert der zweite Lauf nichts. Ohne Redis laeuft
   * dieser Takt nicht — dann traegt der Riegel in confirm/decline die Frist
   * allein (keine Zusage nach Verfall), nur das Wieder-Oeffnen wartet auf den
   * internen Endpunkt. */
  q.upsertJobScheduler("ersatz-frist-10min", { pattern: "*/10 * * * *" }, { name: "ersatz-frist" })
    .catch((e) => logger.warn({ err: e.message }, "Could not schedule ersatz-frist sweep"));
}

/**
 * M1.2 — DIE TAKTE, DIE ES NOCH NICHT GAB.
 *
 * `upsertJobScheduler` ist idempotent und ueberlebt Neustarts ohne Duplikate —
 * dieselbe Bauart wie die Capacity-Sweeps darueber.
 *
 * WARUM ALLE 15 MINUTEN: an `staffing-maintenance` haengen der Verfall von
 * Einladungen und das automatische Nachruecken. Beides sind Fristen im
 * Stundenbereich; ein Tagestakt waere dafuer eine Attrappe. Das Soll steht
 * zusaetzlich in `betriebsTaktService.TAKTE` — dort liest der Waechter es.
 *
 * OHNE REDIS LAEUFT DIESER TAKT NICHT. Dann bleibt der interne Endpunkt der
 * Weg, und der Herzschlag zeigt genau das: die Aufgabe steht auf `still`.
 * Das ist der Unterschied zu vorher — das Schweigen ist jetzt sichtbar.
 */
function scheduleBetriebsTakte() {
  const q = staffingQueue();
  if (!q || typeof q.upsertJobScheduler !== "function") return;
  q.upsertJobScheduler("staffing-maintenance-15min", { pattern: "*/15 * * * *" },
    { name: "staffing-maintenance" })
    .catch((e) => logger.warn({ err: e.message }, "Could not schedule staffing-maintenance"));
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE FUENF, DIE NIE LIEFEN (M1.9, Owner-Entscheid 2026-09-04)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Gemessen am 2026-09-03: von zehn erwarteten Takten waren fuenf eingeplant.
 * Die anderen fuenf hatten einen internen Endpunkt und keinen Ausloeser —
 * Geld und Lebenszyklus. Der Owner hat entschieden, ALLE fuenf einzuplanen.
 *
 * WAS DAS IM BETRIEB HEISST — DREI WIRKEN SOFORT, ZWEI NICHT:
 *
 *   sofort wirksam, sobald Redis da ist:
 *     invoice-overdue-scan         setzt faellige Rechnungen auf 'overdue'
 *     subscription-lifecycle-tick  aktiviert/beendet Abos zum Stichtag
 *     expire-reservations          gibt gebundene Kapazitaet frei
 *
 *   weiterhin durch ihren Schalter gehalten (beide per Vorgabe AUS):
 *     recurring-billing            RECURRING_BILLING_ENABLED
 *     dunning-sweep                DUNNING_ENABLED
 *
 * Die beiden folgenreichsten — Folgerechnungen und Mahnpost an echte Kunden —
 * entstehen also NICHT durch diese Einplanung, sondern erst durch das bewusste
 * Umlegen ihres Schalters. Der Schalter wird im gemeinsamen Ablauf geprueft
 * (`services/betriebsTaktLaeufe.js`), nicht am Endpunkt; ein Takt kann ihn
 * damit nicht umgehen.
 *
 * REIHENFOLGE IN DER NACHT, und sie ist kein Zufall:
 *   02:10 recurring-billing   erzeugt die Folgerechnungen
 *   02:20 invoice-overdue-scan  setzt faellige davon auf 'overdue'
 *   02:40 dunning-sweep       mahnt, was 'overdue' ist
 * Umgekehrt gereiht braeuchte jede Stufe einen Tag Vorlauf.
 *
 * Ohne Redis passiert nichts: `startWorkers` steigt vorher aus, und die
 * internen Endpunkte bleiben der Handlauf.
 */
function scheduleBetriebsWirtschaft() {
  const q = betriebQueue();
  if (!q || typeof q.upsertJobScheduler !== "function") return;

  q.upsertJobScheduler("recurring-billing-daily", { pattern: "10 2 * * *" }, { name: "recurring-billing" })
    .catch((e) => logger.warn({ err: e.message }, "Could not schedule recurring-billing"));
  q.upsertJobScheduler("invoice-overdue-scan-daily", { pattern: "20 2 * * *" }, { name: "invoice-overdue-scan" })
    .catch((e) => logger.warn({ err: e.message }, "Could not schedule invoice-overdue-scan"));
  q.upsertJobScheduler("dunning-sweep-daily", { pattern: "40 2 * * *" }, { name: "dunning-sweep" })
    .catch((e) => logger.warn({ err: e.message }, "Could not schedule dunning-sweep"));

  /* Stuendlich, nicht taeglich: ein Abo mit Beginn 09:00 soll um 09:05 wirksam
   * sein, nicht am naechsten Morgen — der Kunde hat bezahlt und wartet. Dasselbe
   * fuer Reservierungen: eine Frist im Stundenbereich mit Tagestakt waere eine
   * Attrappe. */
  q.upsertJobScheduler("subscription-lifecycle-hourly", { pattern: "5 * * * *" }, { name: "subscription-lifecycle-tick" })
    .catch((e) => logger.warn({ err: e.message }, "Could not schedule subscription-lifecycle-tick"));
  q.upsertJobScheduler("expire-reservations-hourly", { pattern: "35 * * * *" }, { name: "expire-reservations" })
    .catch((e) => logger.warn({ err: e.message }, "Could not schedule expire-reservations"));

  /* M3.5 — die Wiedervorlage. Taeglich 09:00: eine Erinnerung, die um 02:40
   * ankommt, wird morgens zwischen der Nachtpost uebersehen. Erinnert wird, was
   * in 48 Stunden ablaeuft — der Takt darf also ruhig einen Tag ausfallen, ohne
   * dass jemand seine Frist verpasst. */
  q.upsertJobScheduler("einladung-erinnerung-daily", { pattern: "0 9 * * *" }, { name: "einladung-erinnerung" })
    .catch((e) => logger.warn({ err: e.message }, "Could not schedule einladung-erinnerung"));

  /* N3.5 — die Profil-Rangliste. 02:50: nach der Nachtwirtschaft, vor den
   * Kapazitaets-Sweeps um 03:00. Bis zum 2026-09-19 lief sie nie; der Dienst
   * war vollstaendig, hatte aber keinen Ausloeser. */
  q.upsertJobScheduler("profil-rangliste-daily", { pattern: "50 2 * * *" }, { name: "profil-rangliste" })
    .catch((e) => logger.warn({ err: e.message }, "Could not schedule profil-rangliste"));

  /* Produkt-Mitteilungen in Paketen (2026-10-01). Jede Minute — 20 Mails je
   * Paket ist dieselbe Drosselung wie im Mail-Arbeiter. Hier und nicht in der
   * "email"-Warteschlange: der Lauf braucht die Empfaengerliste und schreibt je
   * Mail ihren Ausgang; ein Auftrag je Mail in Redis wuesste davon nichts. Ohne
   * Arbeit ist ein Lauf eine einzige Abfrage. */
  q.upsertJobScheduler("produkt-update-pakete-1min", { pattern: "* * * * *" }, { name: "produkt-update-pakete" })
    .catch((e) => logger.warn({ err: e.message }, "Could not schedule produkt-update-pakete"));
}

export function startWorkers(deps = {}) {
  if (!isQueueAvailable()) {
    logger.info("Redis not configured — background workers disabled");
    return;
  }

  const email = startEmailWorker();
  if (email) { instrumentWorker(email, "email", { pool }); _workers.push(email); }

  const match = startMatchWorker();
  if (match) { instrumentWorker(match, "match", { pool }); _workers.push(match); }

  const capacity = startCapacityWorker();
  if (capacity) {
    instrumentWorker(capacity, "capacity", { pool });
    _workers.push(capacity);
    scheduleCapacitySweeps();
  }

  const staffing = startStaffingWorker();
  if (staffing) {
    instrumentWorker(staffing, "staffing", { pool });
    _workers.push(staffing);
    /* Der Takt gehoert an den Arbeiter, der ihn verarbeitet. Ohne
     * laufenden Staffing-Arbeiter waere ein eingeplanter Job eine Zeile
     * in Redis, die niemand abholt. */
    scheduleBetriebsTakte();
  }

  const betrieb = startBetriebsWorker({ sendMail: deps.sendMail });
  if (betrieb) {
    instrumentWorker(betrieb, "betrieb", { pool });
    _workers.push(betrieb);
    /* Wie bei den anderen: der Takt gehoert an den Arbeiter, der ihn
     * verarbeitet. Ohne laufenden Arbeiter waere die Einplanung eine Zeile in
     * Redis, die niemand abholt — und der Herzschlag bliebe still, obwohl
     * "eingeplant" in der Registratur steht. */
    scheduleBetriebsWirtschaft();
  }

  // Register queue gauges (waiting/active counts) for Prometheus scraping
  const queues = [
    { name: "email", queue: emailQueue() },
    { name: "match", queue: matchQueue() },
    { name: "capacity", queue: capacityQueue() },
    { name: "staffing", queue: staffingQueue() },
    { name: "betrieb", queue: betriebQueue() }
  ].filter(q => q.queue);
  registerQueueMetrics(queues);

  logger.info({ count: _workers.length }, "Background workers started");
}

export async function stopWorkers() {
  for (const w of _workers) {
    try { await w.close(); } catch (e) { logger.warn({ err: e.message }, "Error stopping worker"); }
  }
  _workers.length = 0;
}
