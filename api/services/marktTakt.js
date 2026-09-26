/**
 * Der Markt-Takt: Befuellung UND Reservierung, in dieser Reihenfolge, EINMAL.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM DIESE DATEI EXISTIERT (M4c.3b, Audit-Befund F3, 2026-09-24)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `sweepMarktpraesenz` legt Angebote an. `sweepReservations` nimmt die Angebote
 * gebundener Kraefte wieder aus dem Markt. Die zweite MUSS nach der ersten
 * laufen, und `marktpraesenzService` sagt das auch ausdruecklich: "Der Aufrufer
 * (Cron staffing-maintenance) laesst DANACH sweepReservations laufen, damit
 * Angebote gebundener Kraefte pausiert sind, bevor irgendjemand den Feed liest."
 *
 * Gemessen am 2026-09-24: der Satz galt nur fuer den internen HTTP-Endpunkt —
 * und den ruft niemand. Der eingeplante 15-Minuten-Takt
 * (`workers/staffingWorker.js`) rief `runStaffingMaintenance` und
 * `sweepMarktpraesenz`, und dann war er fertig. Welle M1.2 hatte beim Umzug vom
 * Endpunkt in den Takt zwei der vier Schritte mitgenommen.
 *
 * DER BEWEIS STEHT IN DEN DATEN, nicht in der Ueberlegung: eine Kraft mit einer
 * aktiven, unbefristeten Einsatz-Verknuepfung seit dem 2026-07-29 hatte sechs
 * automatisch erzeugte Angebote vom 2026-08-26 — `worker_reserved` blieb bei
 * FALSE, und sie standen ZWOELF TAGE aktiv und buchbar im Markt, bis eine
 * Abwesenheit sie archivierte. Zwoelf Tage lang war ein Mensch im Einsatz und
 * gleichzeitig kaeuflich.
 *
 * Die Reservierung war also nicht kaputt. Sie lief nie.
 *
 * Deshalb steht die Reihenfolge jetzt an EINER Stelle, und beide Aufrufer — der
 * Takt und der Endpunkt — benutzen sie. Zwei Aufrufer, die ihre Reihenfolge
 * selbst zusammensetzen, sind genau die Bauart, in der ein Schritt verloren
 * geht, ohne dass etwas rot wird: es fehlt ja nichts, es passiert nur nichts.
 *
 * JEDER SCHRITT FUER SICH. Der Sweep laeuft ohne Transaktion, und ein Fehler in
 * der Befuellung hat bisher auch die Reservierung mitgenommen (Befund F2) —
 * obwohl die zweite von der ersten nicht abhaengt. Ein Schritt, der scheitert,
 * wird gemeldet und haelt die anderen nicht auf.
 */
import { createServiceLogger } from "../utils/logger.js";
import { sweepMarktpraesenz } from "./marktpraesenzService.js";
import { sweepReservations } from "./workerOfferReservationService.js";

const logger = createServiceLogger("markt-takt");

/** Die Schritte in ihrer verbindlichen Reihenfolge — erst befuellen, dann binden. */
export const TAKT_SCHRITTE = Object.freeze([
  Object.freeze({ name: "marktpraesenz", fn: sweepMarktpraesenz }),
  Object.freeze({ name: "reservierung", fn: sweepReservations })
]);

/**
 * Laeuft alle Schritte. Ein gescheiterter Schritt haelt die folgenden NICHT auf;
 * sein Fehler steht im Ergebnis unter `fehler`.
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<{marktpraesenz: object|null, reservierung: object|null, fehler: Array<{schritt: string, fehler: string}>}>}
 */
export async function runMarktTakt(pool) {
  const ergebnis = { fehler: [] };
  for (const schritt of TAKT_SCHRITTE) {
    try {
      ergebnis[schritt.name] = await schritt.fn(pool);
    } catch (err) {
      ergebnis[schritt.name] = null;
      ergebnis.fehler.push({ schritt: schritt.name, fehler: err.message });
      /* Kein stiller Ausfall: der Fehler kommt in die Antwort UND ins Log. Ein
         Takt, der die Haelfte seiner Arbeit verliert, muss das sagen — vorher
         sah ein halber Lauf von aussen wie ein ganzer aus. */
      logger.error({ err: err.message, schritt: schritt.name }, "Markt-Takt: Schritt gescheitert");
    }
  }
  return ergebnis;
}
