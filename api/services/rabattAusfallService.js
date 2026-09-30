/**
 * Der stille Ausfall wird laut — Welle K1.1.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DER ANLASS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der Treue-Rabatt laeuft automatisch und traegt echtes Geld: 55 Kunden mit
 * aktivem Abo haengen daran (gemessen 2026-08-29 gegen die laufende Datenbank).
 * Faellt die Ermittlung aus, passiert heute nichts Sichtbares — an ZWEI Stellen,
 * mit sehr verschiedenen Folgen:
 *
 *   (a) `stelle = 'rabattsatz'`
 *       Die Summen-Abfrage in `getUserDiscount` wirft. `recurringBillingService`
 *       faengt das und stellt die Rechnung OHNE Rabatt. Einziger Zeuge: eine
 *       `logger.warn`-Zeile. Ein Kunde mit 8 % zahlt den vollen Preis.
 *
 *   (b) `stelle = 'stufe'`
 *       Die Stufen-Abfrage wirft. `getUserTier` faengt den Fehler SELBST ab und
 *       liefert `null`; `getUserMaxDiscount` macht daraus die Voreinstellung 8 %.
 *       Das ist nicht von "hat noch keine Stufe" zu unterscheiden — es gibt
 *       nicht einmal ein Log. Ein Diamant-Kunde (Deckel 25 %) wird dadurch auf
 *       8 % gestutzt.
 *
 * (b) ist der schwerere Fall, weil er den Fehlerpfad aus (a) gar nicht erst
 * erreicht: `getUserMaxDiscount` kann nicht werfen, also ist der Ersatzwert 25
 * in `bountyService` unerreichbar. Ein bestehender Test haelt genau das fest
 * (`bountyService.coverage.test.js`) — die Zahlen bleiben unveraendert, nur die
 * Blindheit endet.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM EINE ZEILE UND KEINE MELDUNG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Es gibt heute keinen Kanal, der das Team erreicht (Uebergabe: `K4-B1`).
 * `notificationMatrix.dispatch()` kennt nur org- und vorgangsbezogene
 * Empfaenger und ueberspringt einen unbekannten Ereignis-Schluessel wortlos
 * (`sent: 0`, kein Fehler); `writeStaffAudit()` verlangt zwingend eine
 * handelnde Person und wirft ohne sie — ein Systemlauf hat keine.
 *
 * Welle K4 hat daraus gezaehlt statt einen Kanal zu erfinden. K1 haelt fest und
 * zeigt es in der Staff-Flaeche. Zu behaupten, es ginge eine Meldung raus, waere
 * genau die stille Fehlerklasse, gegen die diese Welle antritt.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS HIER NIE PASSIERT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Werfen. Dieser Dienst laeuft ausschliesslich auf Fehlerpfaden — wenn er dort
 * selbst wirft, macht er aus einem Rabatt-Ausfall einen Rechnungs-Ausfall.
 * Dieselbe Regel wie beim Feed-Rueckfall aus K4: ein Zusatzweg darf den Hauptweg
 * nie umbringen.
 */

import { logger } from "../config/index.js";
import { todayDE } from "../utils/dateDE.js";

/** Die beiden Stellen, an denen die Ermittlung ausfallen kann. */
export const STELLEN = Object.freeze(["rabattsatz", "stufe"]);

/**
 * Wie viel Text von einer Fehlermeldung aufgehoben wird.
 *
 * Ein Postgres-Fehler bringt gern einen ganzen Query-Plan mit. Die Spalte ist
 * TEXT, koennte das also tragen — aber eine Flaeche, die 4 kB Stacktrace zeigt,
 * ist wieder unlesbar, und genau darum geht es hier.
 */
const GRUND_MAX = 400;

/** Erster Tag des Monats in Europe/Berlin — nie ein roher UTC-Schnitt. */
export function abrechnungsmonatDE(heute = todayDE()) {
  const iso = String(heute || todayDE());
  return iso.slice(0, 7) + "-01";
}

/** Macht aus einem beliebigen Fehler eine Zeile, die jemand lesen kann. */
export function grundText(fehler) {
  const roh = fehler instanceof Error
    ? (fehler.message || fehler.name || "FEHLER")
    : (typeof fehler === "string" ? fehler : String(fehler ?? "FEHLER"));
  const eine = roh.replace(/\s+/g, " ").trim() || "FEHLER";
  return eine.length > GRUND_MAX ? eine.slice(0, GRUND_MAX - 1) + "…" : eine;
}

/**
 * Haelt einen Ausfall fest. Eine Zeile je Kunde, Monat und Stelle; weitere
 * Vorfaelle zaehlen hoch.
 *
 * WIRFT NIE. Liefert die Id der Zeile oder `null`.
 *
 * @param {import('pg').Pool} pool
 * @param {object} a
 * @param {string} a.userId            der betroffene Kunde
 * @param {string|null} [a.orgId]      seine Organisation, soweit bekannt
 * @param {string} a.stelle            'rabattsatz' | 'stufe'
 * @param {unknown} a.fehler           der aufgetretene Fehler
 * @param {number} [a.angesetztPct]    was ersatzweise gegolten hat
 * @param {number|null} [a.nettoCents] Betrag, auf den der Rabatt gewirkt haette
 * @param {string} [a.monat]           Abrechnungsmonat (Vorgabe: laufender)
 */
export async function ausfallFesthalten(pool, a = {}) {
  try {
    const userId = a.userId;
    if (!userId) return null;
    if (!STELLEN.includes(a.stelle)) {
      /* Eine unbekannte Stelle waere an der Datenbankregel gescheitert — und
       * ein Fehler beim Festhalten eines Fehlers ist besonders unangenehm zu
       * lesen. Lieber hier abbiegen und es sagen. */
      logger.warn({ stelle: a.stelle }, "Rabatt-Ausfall mit unbekannter Stelle nicht festgehalten");
      return null;
    }

    const monat = a.monat || abrechnungsmonatDE();
    const angesetzt = Number.isFinite(Number(a.angesetztPct)) ? Number(a.angesetztPct) : 0;
    const netto = Number.isFinite(Number(a.nettoCents)) ? Math.max(0, Math.round(Number(a.nettoCents))) : null;

    const { rows } = await pool.query(
      `INSERT INTO rabatt_ausfaelle
         (user_id, org_id, abrechnungsmonat, stelle, grund, angesetzt_pct, netto_cents)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7)
       ON CONFLICT (user_id, abrechnungsmonat, stelle) DO UPDATE
         SET vorfaelle  = rabatt_ausfaelle.vorfaelle + 1,
             zuletzt_am = NOW(),
             grund      = EXCLUDED.grund,
             org_id     = COALESCE(EXCLUDED.org_id, rabatt_ausfaelle.org_id),
             netto_cents = COALESCE(EXCLUDED.netto_cents, rabatt_ausfaelle.netto_cents)
       RETURNING id`,
      [userId, a.orgId || null, monat, a.stelle, grundText(a.fehler), angesetzt, netto]
    );

    /* Auf ERROR, nicht auf WARN: eine Rechnung ohne den zugesagten Rabatt ist
     * kein Normalzustand. Die Zeile in der Datenbank ist der bleibende Befund,
     * das Log nur der Alarm fuer den, der gerade hinsieht. */
    logger.error(
      { user_id: userId, monat, stelle: a.stelle, angesetzt_pct: angesetzt, grund: grundText(a.fehler) },
      "Rabatt-Ermittlung ausgefallen — Befund festgehalten"
    );

    return rows[0]?.id ?? null;
  } catch (e) {
    logger.warn({ err: e?.message }, "Rabatt-Ausfall nicht festgehalten — die Abrechnung selbst ist unberuehrt");
    return null;
  }
}

/**
 * Traegt nach, welche Rechnung aus dem Ausfall entstanden ist.
 *
 * Erst dadurch wird der Befund pruefbar: "diese Rechnung ging ohne Rabatt raus".
 * Ohne den Beleg bliebe es bei "irgendwann im August".
 *
 * WIRFT NIE.
 */
export async function rechnungNachtragen(pool, ausfallId, rechnungId) {
  try {
    if (!ausfallId || !rechnungId) return false;
    await pool.query(
      `UPDATE rabatt_ausfaelle SET rechnung_id = $2 WHERE id = $1`,
      [ausfallId, rechnungId]
    );
    return true;
  } catch (e) {
    logger.warn({ err: e?.message }, "Rabatt-Ausfall: Rechnung nicht nachgetragen");
    return false;
  }
}

/**
 * Die Ausfaelle eines Kunden, neueste zuerst. Fuer die Einzelfall-Ansicht (K1.2).
 *
 * Dieser Weg WIRFT, im Gegensatz zu den Schreibwegen: er laeuft in einer
 * Staff-Flaeche, und ein leeres Ergebnis waere dort nicht von "keine Ausfaelle"
 * zu unterscheiden. Genau die Verwechslung, gegen die diese Welle antritt.
 */
export async function ausfaelleFuerNutzer(pool, userId, opts = {}) {
  const grenze = Math.min(200, Math.max(1, Number(opts.limit) || 24));
  const { rows } = await pool.query(
    `SELECT a.id, a.abrechnungsmonat, a.stelle, a.grund, a.angesetzt_pct,
            a.netto_cents, a.rechnung_id, a.vorfaelle, a.zuerst_am, a.zuletzt_am,
            i.invoice_number, i.discount_pct AS rechnung_rabatt_pct
       FROM rabatt_ausfaelle a
       LEFT JOIN invoices i ON i.id = a.rechnung_id
      WHERE a.user_id = $1
      ORDER BY a.abrechnungsmonat DESC, a.zuletzt_am DESC
      LIMIT $2`,
    [userId, grenze]
  );
  return rows;
}

/**
 * Alle Ausfaelle eines Monats — die Uebersicht, die zeigt, ob ein Lauf
 * flaechendeckend danebengegangen ist oder nur einen Kunden getroffen hat.
 *
 * WIRFT (Lesepfad einer Staff-Flaeche, siehe oben).
 */
export async function ausfaelleImMonat(pool, monat, opts = {}) {
  const grenze = Math.min(500, Math.max(1, Number(opts.limit) || 200));
  const { rows } = await pool.query(
    `SELECT a.id, a.user_id, a.org_id, a.abrechnungsmonat, a.stelle, a.grund,
            a.angesetzt_pct, a.netto_cents, a.rechnung_id, a.vorfaelle,
            a.zuerst_am, a.zuletzt_am,
            u.email AS kunde_email, o.name AS org_name,
            i.invoice_number
       FROM rabatt_ausfaelle a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN organizations o ON o.id = a.org_id
       LEFT JOIN invoices i ON i.id = a.rechnung_id
      WHERE a.abrechnungsmonat = $1::date
      ORDER BY a.zuletzt_am DESC
      LIMIT $2`,
    [monat, grenze]
  );
  return rows;
}
