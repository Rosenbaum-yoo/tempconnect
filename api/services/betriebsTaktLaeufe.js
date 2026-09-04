/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE FUENF LAEUFE — EINE WAHRHEIT FUER BEIDE AUSLOESER (M1.9, 2026-09-04)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner-Entscheid 2026-09-04: alle fuenf verbliebenen Takte werden eingeplant.
 * Bis dahin gab es sie nur als internen HTTP-Endpunkt, den jemand von Hand
 * anstossen musste — gemessen am 2026-09-03 tat das niemand.
 *
 * WARUM DIESES MODUL UEBERHAUPT EXISTIERT
 * Jeder der fuenf Endpunkte macht mehr als einen Dienstaufruf: er ruft den
 * Dienst, schreibt bei Wirkung einen Audit-Eintrag, und zwei von ihnen pruefen
 * vorher einen Kill-Switch. Haette der Takt diese Schritte nachgebaut, staenden
 * zwei Fassungen desselben Ablaufs nebeneinander — und die zweite waere genau
 * dort abgewichen, wo es teuer wird: ein Lauf ohne Audit-Eintrag, oder einer,
 * der den Kill-Switch nicht kennt und Mahnungen verschickt, die abgeschaltet
 * sein sollten.
 *
 * Deshalb: der Ablauf steht EINMAL hier. Der Endpunkt ist die Handkurbel, der
 * Takt der Motor — beide drehen dieselbe Welle.
 *
 * WAS DIESE FUNKTIONEN NICHT TUN
 * Sie schreiben keinen Herzschlag. Der entsteht auf beiden Wegen von selbst:
 * am Endpunkt durch die Middleware in `routes/internal.js`, am Takt durch
 * `instrumentWorker` in `utils/metrics.js`. Ein dritter Schreiber hier haette
 * pro Lauf zwei Zeilen erzeugt.
 *
 * Sie fangen auch keine Fehler. Ein gescheiterter Lauf MUSS nach oben
 * durchschlagen: am Endpunkt wird daraus HTTP 500, am Takt ein `failed`-Job —
 * und beides faerbt den Herzschlag auf `fehler`. Wer hier ein `catch` einzieht,
 * macht aus einem sichtbaren Ausfall einen stillen.
 */

import * as capacityService from "./capacityService.js";
import * as invoiceService from "./invoiceService.js";
import * as recurringBillingService from "./recurringBillingService.js";
import * as subscriptionLifecycle from "./subscriptionLifecycleService.js";
import * as workerService from "./workerService.js";
import * as auditLog from "./auditLog.js";
import * as stateMachine from "./stateMachine.js";

/** Abgelaufene Reservierungen freigeben. Bindet sonst Kapazitaet, die niemand mehr braucht. */
export async function expireReservations(pool, { batchSize = 100 } = {}) {
  const groesse = Math.min(500, Math.max(1, Number(batchSize) || 100));
  const { expired } = await capacityService.expireReservationsBatch(pool, groesse);
  if (expired > 0) {
    await stateMachine.logTransition(pool, {
      entityType: "RESERVATION", from: "active", to: "expired",
      details: { count: expired, batchSize: groesse }
    });
    await auditLog.writeAudit(pool, {
      action: "reservation.expiry_batch", entity_type: "capacity_reservation",
      details: { expired, batchSize: groesse }
    });
  }
  return { expired };
}

/** Faellige Rechnungen auf `overdue` setzen — die Vorstufe der Mahnstrecke. */
export async function invoiceOverdueScan(pool) {
  const overdueMarked = await invoiceService.markOverdueInvoices(pool);
  if (overdueMarked > 0) {
    await auditLog.writeAudit(pool, {
      action: "invoice.overdue_batch", entity_type: "invoice",
      details: { overdue_marked: overdueMarked }
    });
  }
  return { overdue_marked: overdueMarked };
}

/**
 * Wiederkehrende Abo-Rechnungen erzeugen.
 *
 * DER KILL-SWITCH STEHT HIER, NICHT AM ENDPUNKT. `RECURRING_BILLING_ENABLED`
 * ist per Vorgabe AUS. Ein eingeplanter Takt, der den Schalter nicht kennt,
 * waere die teuerste Art, diese Entscheidung zu unterlaufen: er erzeugte beim
 * ersten Lauf Folgerechnungen fuer ALLE faelligen Zeitraeume rueckwirkend.
 */
export async function recurringBilling(pool, { config, logger } = {}) {
  if (!config?.RECURRING_BILLING_ENABLED) {
    return { disabled: true, reason: "RECURRING_BILLING_ENABLED=false" };
  }
  const result = await recurringBillingService.generateRecurringInvoices(pool, { logger });
  if (result.invoiced > 0 || result.skipped > 0) {
    await auditLog.writeAudit(pool, {
      action: "subscription.recurring_billing_batch", entity_type: "subscription",
      details: {
        invoiced: result.invoiced, skipped: result.skipped,
        processed: result.processed, failed: result.failed.length
      }
    });
  }
  return result;
}

/**
 * Gestaffelte Zahlungserinnerungen fuer ueberfaellige Rechnungen.
 *
 * Die folgenreichste der fuenf: jeder Lauf kann Post an einen echten Kunden
 * ausloesen. Auch hier steht der Schalter (`DUNNING_ENABLED`, per Vorgabe AUS)
 * im gemeinsamen Ablauf, nicht am Endpunkt.
 */
export async function dunningSweep(pool, { config, logger, sendMail } = {}) {
  if (!config?.DUNNING_ENABLED) {
    return { disabled: true, reason: "DUNNING_ENABLED=false" };
  }
  /*
   * EINGESCHALTET, ABER OHNE VERSANDWEG — DAS MUSS LAUT SEIN.
   *
   * `runDunningSweep` gibt ohne Mailer `{ note: "NO_MAILER" }` zurueck und
   * markiert bewusst nichts: eine Erinnerung soll nicht als "verschickt" gelten,
   * wenn sie es nicht ist. Richtig — aber fuer den TAKT waere das Ergebnis ein
   * gelungener Lauf: Job `completed`, Herzschlag gruen, Kachel "laeuft". Die
   * Mahnstrecke waere eingeschaltet und stumm, und nichts wuerde es zeigen.
   *
   * Der Fall entsteht nur auf dem Takt-Weg (der Endpunkt bekommt `sendMail`
   * immer aus `deps`) — naemlich dann, wenn `startWorkers` ohne den Versandweg
   * aufgerufen wird. Genau deshalb steht hier ein Wurf und kein `if`-Zweig mit
   * Rueckgabewert: der Lauf soll scheitern, sichtbar, jede Nacht neu.
   */
  if (typeof sendMail !== "function") {
    throw new Error(
      "DUNNING_ENABLED ist gesetzt, aber dem Mahnlauf wurde kein Versandweg gereicht. "
      + "Er wuerde ohne Wirkung als gelungen gelten. Siehe startWorkers({ sendMail }) "
      + "in api/server.js."
    );
  }
  const result = await recurringBillingService.runDunningSweep(pool, {
    sendMail, logger, baseUrl: config?.BASE_URL || ""
  });
  if (result.reminded > 0) {
    await auditLog.writeAudit(pool, {
      action: "invoice.dunning_batch", entity_type: "invoice",
      details: { reminded: result.reminded, processed: result.processed, failed: result.failed.length }
    });
  }
  return result;
}

/** Abo-Lebenszyklus: Verfall, Aktivierung zum Stichtag, Kuendigungen. Idempotent. */
export async function subscriptionLifecycleTick(pool, { logger, sendMail, batchSize = 100 } = {}) {
  const groesse = Math.min(500, Math.max(1, Number(batchSize) || 100));
  const result = await subscriptionLifecycle.runLifecycleTick(pool, {
    batchSize: groesse, deps: { sendMail, logger }
  });
  const verarbeitet =
    (result.expiry?.processed || 0) +
    (result.activation?.processed || 0) +
    (result.cancellation?.processed || 0);
  if (verarbeitet > 0) {
    await auditLog.writeAudit(pool, {
      action: "subscription_request.lifecycle_tick", entity_type: "subscription_request",
      details: {
        expired: result.expiry?.expired || 0,
        activated: result.activation?.activated || 0,
        cancellations_applied: result.cancellation?.revoked || 0,
        failed_total:
          (result.expiry?.failed?.length || 0) +
          (result.activation?.failed?.length || 0) +
          (result.cancellation?.failed?.length || 0),
        batch_size: groesse
      }
    });
  }
  return result;
}

/**
 * Wiedervorlage fuer nicht angenommene Portal-Einladungen (M3.5).
 *
 * Erinnert wird, was in den naechsten 48 Stunden ABLAEUFT — nicht, was alt ist.
 * Das nennt dem Menschen einen Grund, jetzt zu handeln, und verhindert beim
 * ersten Lauf einen Schwall aus vergessenen Einladungen. Genau EINMAL je
 * Einladung; wer schon von Hand erinnert hat, unterbricht die Automatik.
 *
 * OHNE VERSANDWEG WIRD GEWORFEN, nicht still nichts getan — dieselbe
 * Entscheidung wie beim Mahnlauf. `sendeEinladungsErinnerungen` markiert dann
 * zwar nichts (sie gibt `NO_MAILER` zurueck), aber fuer den TAKT waere das ein
 * gelungener Lauf: Herzschlag gruen, Kachel "laeuft", und keine einzige
 * Erinnerung geht hinaus.
 */
export async function einladungErinnerung(pool, { config, logger, sendMail } = {}) {
  if (typeof sendMail !== "function") {
    throw new Error(
      "Der Erinnerungslauf hat keinen Versandweg bekommen. Er wuerde ohne Wirkung "
      + "als gelungen gelten. Siehe startWorkers({ sendMail }) in api/server.js."
    );
  }
  const ergebnis = await workerService.sendeEinladungsErinnerungen(pool, {
    sendMail, logger, baseUrl: config?.BASE_URL || ""
  });
  if (ergebnis.erinnert > 0) {
    await auditLog.writeAudit(pool, {
      action: "worker.invite_reminder_batch", entity_type: "worker_invite",
      details: {
        erinnert: ergebnis.erinnert,
        geprueft: ergebnis.geprueft,
        fehlgeschlagen: ergebnis.fehlgeschlagen
      }
    });
  }
  return ergebnis;
}

/**
 * Der Auftragsname aus `betriebsTaktService.TAKTE` auf den Lauf abbilden.
 *
 * Bewusst hier und nicht im Arbeiter: so gibt es EINEN Ort, an dem sichtbar ist,
 * welche Namen ueberhaupt gefahren werden koennen — und ein Test kann ihn gegen
 * die Registratur halten, ohne den Arbeiter zu starten.
 */
export const LAEUFE = Object.freeze({
  "expire-reservations": expireReservations,
  "invoice-overdue-scan": invoiceOverdueScan,
  "recurring-billing": recurringBilling,
  "dunning-sweep": dunningSweep,
  "subscription-lifecycle-tick": subscriptionLifecycleTick,
  "einladung-erinnerung": einladungErinnerung
});
