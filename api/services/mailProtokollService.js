/**
 * Versandprotokoll je Zweck (M1.3).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WORUM ES GEHT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Gemessen am 2026-09-02: beide Mailwege melden ohne Versandweg Erfolg.
 * `app.js` gibt `true` zurueck, `emailService.js` liefert `accepted: [to]`.
 * Von 42 Aufrufern pruefen 6 die Rueckgabe — die anderen 36 koennen einen
 * Fehlschlag gar nicht bemerken.
 *
 * Zwei Antworten darauf, und sie greifen ineinander:
 *
 *   1. DER RIEGEL (`versandwegPflicht`): in Produktion ohne Versandweg wird
 *      hart abgelehnt statt still Erfolg gemeldet. Damit kann der schlimmste
 *      Fall gar nicht mehr eintreten.
 *   2. DIE SICHT (`mailNotieren` / `mailStand`): jeder Versuch wird je Zweck
 *      und Kalendertag gezaehlt. Damit bleibt auch der Fehlschlag sichtbar,
 *      den ein Aufrufer ignoriert — und die 36 ungeprueften Rueckgaben sind
 *      nicht mehr blind.
 *
 * Der Riegel haengt bewusst NICHT an der Tabelle: ein Rollback der Migration
 * nimmt die Sicht, nicht den Schutz.
 *
 * `mailNotieren` wirft NIE. Eine Protokollzeile darf keinen Versand
 * verhindern — sonst waere die Beobachtung selbst der Ausfall.
 */

import { logger } from "../config/index.js";
import { todayDE } from "../utils/dateDE.js";

/**
 * Der Sammelposten fuer Aufrufer, die noch keinen Zweck angeben.
 *
 * Er steht ABSICHTLICH in derselben Uebersicht wie die benannten Zwecke: eine
 * wachsende Zahl unter "unbenannt" ist der sichtbare Rest der Arbeit. Ein
 * stiller Default, der nirgends auftaucht, waere genau die Sorte Loch, gegen
 * die dieser Dienst gebaut ist.
 */
export const ZWECK_UNBENANNT = "unbenannt";

/** Zwecke, die in der Uebersicht immer erscheinen — auch mit null Versuchen. */
export const ZWECKE_ERWARTET = Object.freeze([
  "worker-einladung",
  "registrierung",
  "passwort-zuruecksetzen",
  "zahlungserinnerung"
]);

/** Der Fehler, den ein Versand ohne Versandweg in Produktion wirft. */
export class KeinVersandweg extends Error {
  constructor(grund) {
    super(grund || "Kein E-Mail-Versandweg");
    this.name = "KeinVersandweg";
    this.code = "MAIL_NO_TRANSPORT";
    /* 503 und nicht 500: die Anfrage war richtig, der Dienst ist es nicht. */
    this.status = 503;
  }
}

/** Zweck normalisieren — leer, zu lang oder unbrauchbar wird zum Sammelposten. */
export function zweckNormalisieren(zweck) {
  const roh = String(zweck ?? "").trim().toLowerCase();
  if (!roh) return ZWECK_UNBENANNT;
  /* Dieselbe Zeichenmenge wie eine URL-Marke: alles andere waere ein Zweck,
   * den niemand tippen kann, und in der Uebersicht ein Fremdkoerper. */
  const sauber = roh.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!sauber) return ZWECK_UNBENANNT;
  return sauber.slice(0, 64);
}

/**
 * Einen Versandversuch festhalten. Wirft NIE.
 *
 * @param {import('pg').Pool} pool
 * @param {{zweck?: string, ergebnis?: 'zugestellt'|'fehlgeschlagen'|'ohne_versandweg',
 *          weg?: string|null, fehler?: string|null}} versuch
 * @returns {Promise<boolean>} true, wenn geschrieben wurde
 */
export async function mailNotieren(pool, versuch = {}) {
  if (!pool || typeof pool.query !== "function") return false;

  const zweck = zweckNormalisieren(versuch.zweck);
  const ergebnis = ["zugestellt", "fehlgeschlagen", "ohne_versandweg"].includes(versuch.ergebnis)
    ? versuch.ergebnis
    : "zugestellt";
  const weg = versuch.weg ? String(versuch.weg).slice(0, 32) : null;
  /* Gekuerzt, nicht verworfen: eine Zeile, die wegen eines langen
   * Stapelverlaufs nicht geschrieben wird, ist der schlechteste Zustand. */
  const fehler = ergebnis === "zugestellt" || !versuch.fehler
    ? null
    : String(versuch.fehler).slice(0, 500);

  try {
    await pool.query(
      `INSERT INTO mail_versand
         (zweck, tag, versucht, zugestellt, fehlgeschlagen, ohne_versandweg,
          letzter_weg, letzter_fehler, letzter_fehler_um, letzte_um)
       VALUES ($1, $2::date, 1,
               CASE WHEN $3 = 'zugestellt'      THEN 1 ELSE 0 END,
               CASE WHEN $3 = 'fehlgeschlagen'  THEN 1 ELSE 0 END,
               CASE WHEN $3 = 'ohne_versandweg' THEN 1 ELSE 0 END,
               $4, $5,
               CASE WHEN $5 IS NULL THEN NULL ELSE NOW() END, NOW())
       ON CONFLICT (zweck, tag) DO UPDATE
         SET versucht        = mail_versand.versucht + 1,
             zugestellt      = mail_versand.zugestellt      + EXCLUDED.zugestellt,
             fehlgeschlagen  = mail_versand.fehlgeschlagen  + EXCLUDED.fehlgeschlagen,
             ohne_versandweg = mail_versand.ohne_versandweg + EXCLUDED.ohne_versandweg,
             letzter_weg     = EXCLUDED.letzter_weg,
             /* Der Grund des letzten Fehlschlags bleibt stehen, bis ein
              * neuer kommt — sonst waere er genau dann weg, wenn jemand
              * nachsieht. Ein gelungener Versand loescht ihn NICHT: dass
              * heute frueh dreimal nichts ankam, bleibt der Befund. */
             letzter_fehler    = COALESCE(EXCLUDED.letzter_fehler, mail_versand.letzter_fehler),
             letzter_fehler_um = COALESCE(EXCLUDED.letzter_fehler_um, mail_versand.letzter_fehler_um),
             letzte_um         = NOW()`,
      [zweck, todayDE(), ergebnis, weg, fehler]
    );
    return true;
  } catch (e) {
    logger.warn({ err: e?.message, zweck }, "Mailversand konnte nicht protokolliert werden");
    return false;
  }
}

/**
 * Der Stand je Zweck ueber die letzten Tage.
 *
 * Geht von der ERWARTUNG aus, nicht nur von der Tabelle: die Zwecke aus
 * `ZWECKE_ERWARTET` erscheinen auch dann, wenn es zu ihnen keine einzige
 * Zeile gibt. Genau dieselbe Ueberlegung wie beim Betriebstakt — ein Zweck,
 * zu dem NICHTS gesendet wurde, ist der Befund, den eine Tabellenabfrage
 * uebersieht, weil er keine Zeile hat.
 *
 * Wirft nicht: fehlt die Tabelle, ist die ehrliche Antwort ein leerer Stand
 * mit gesetztem `verfuegbar: false`, nicht ein Fehler, der die ganze
 * Operations-Sicht mitnimmt.
 */
export async function mailStand(pool, { tage = 7 } = {}) {
  /* Ein unbrauchbarer Wert faellt auf den Standard zurueck, NICHT auf die
   * untere Grenze: wer versehentlich -5 uebergibt, bekaeme sonst still ein
   * Fenster von einem Tag und laese daraus 'alles ruhig'. */
  const roh = Number(tage);
  const fenster = Number.isFinite(roh) && roh >= 1 ? Math.min(Math.trunc(roh), 90) : 7;
  const leer = {
    verfuegbar: false,
    fenster_tage: fenster,
    zwecke: [],
    zusammenfassung: { zwecke: 0, versucht: 0, zugestellt: 0, fehlgeschlagen: 0, ohne_versandweg: 0, stumm: 0 }
  };
  if (!pool || typeof pool.query !== "function") return leer;

  let zeilen = [];
  try {
    const { rows } = await pool.query(
      `SELECT zweck,
              SUM(versucht)::bigint        AS versucht,
              SUM(zugestellt)::bigint      AS zugestellt,
              SUM(fehlgeschlagen)::bigint  AS fehlgeschlagen,
              SUM(ohne_versandweg)::bigint AS ohne_versandweg,
              MAX(letzte_um)               AS letzte_um,
              MAX(letzter_weg)             AS letzter_weg,
              (ARRAY_REMOVE(ARRAY_AGG(letzter_fehler ORDER BY tag DESC), NULL))[1] AS letzter_fehler
         FROM mail_versand
        WHERE tag >= (CURRENT_DATE - ($1::int - 1))
        GROUP BY zweck
        ORDER BY zweck`,
      [fenster]
    );
    zeilen = rows || [];
  } catch (e) {
    logger.warn({ err: e?.message }, "Mail-Versandprotokoll konnte nicht gelesen werden");
    return leer;
  }

  const nachZweck = new Map(zeilen.map((r) => [r.zweck, r]));
  const alle = [...new Set([...ZWECKE_ERWARTET, ...nachZweck.keys()])].sort();

  const zwecke = alle.map((zweck) => {
    const r = nachZweck.get(zweck);
    const versucht = Number(r?.versucht || 0);
    const fehlgeschlagen = Number(r?.fehlgeschlagen || 0);
    const ohneWeg = Number(r?.ohne_versandweg || 0);
    return {
      zweck,
      erwartet: ZWECKE_ERWARTET.includes(zweck),
      versucht,
      zugestellt: Number(r?.zugestellt || 0),
      fehlgeschlagen,
      ohne_versandweg: ohneWeg,
      /* "stumm" heisst: in diesem Fenster kein einziger Versuch. Bei einem
       * erwarteten Zweck ist das ein Befund, kein Leerzustand. */
      stumm: versucht === 0,
      letzte_um: r?.letzte_um || null,
      letzter_weg: r?.letzter_weg || null,
      letzter_fehler: r?.letzter_fehler || null,
      /* Auffaellig ist, was scheitert ODER was ohne Weg blieb ODER was
       * erwartet wird und schweigt. */
      auffaellig: fehlgeschlagen > 0 || ohneWeg > 0
        || (versucht === 0 && ZWECKE_ERWARTET.includes(zweck))
    };
  });

  const summe = (feld) => zwecke.reduce((n, z) => n + z[feld], 0);
  return {
    verfuegbar: true,
    fenster_tage: fenster,
    zwecke,
    zusammenfassung: {
      zwecke: zwecke.length,
      versucht: summe("versucht"),
      zugestellt: summe("zugestellt"),
      fehlgeschlagen: summe("fehlgeschlagen"),
      ohne_versandweg: summe("ohne_versandweg"),
      stumm: zwecke.filter((z) => z.stumm && z.erwartet).length
    }
  };
}
