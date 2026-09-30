/**
 * Abweichende Tarifgrenzen je Org-Typ (M1.8).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WORUM ES GEHT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner-Entscheid M-E5: eigene Grenzen je Org-Typ — Struktur jetzt, Werte
 * spaeter. Abnahmekriterium: **ein geaenderter Wert wirkt ohne Neubau.**
 *
 * Das schliesst eine Konstante im Quelltext aus. Die Werte stehen deshalb in
 * `plan_grenze_je_orgtyp` (Migration 214), und dieser Dienst liest sie.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE TABELLE HAELT NUR ABWEICHUNGEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Leer heisst: beide Seiten teilen den Wert aus `userService.PLAN_LIMITS`.
 * Das ist keine Bequemlichkeit, sondern die Lehre aus M1.7 vom selben Tag:
 * dort stand eine zweite Tabelle mit denselben Grenzen, sie gewann, weil sie
 * im Schreibpfad sass, und eine PRO-Agentur wurde bei der 51. Anzeige
 * gesperrt. Waere diese Tabelle hier mit den heutigen Werten befuellt, waere
 * dieselbe Doppelung sofort zurueck.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BEWUSST OHNE ZWISCHENSPEICHER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der erste Anlauf hatte einen — 60 Sekunden Haltezeit, um die Abfrage zu
 * sparen. Er ist wieder raus, aus einem gemessenen Grund: mit Speicher stellt
 * derselbe Aufruf MAL EINE Abfrage und mal keine, je nachdem, was vorher lief.
 * Fuer Muster-Pool-Proben, die Abfragen der Reihe nach zaehlen, ist das kein
 * Detail, sondern eine Wackelquelle — `entitlementService.test.js` wurde
 * dadurch abhaengig von der Reihenfolge SEINER EIGENEN Tests.
 *
 * Der Preis ist gering: die Tabelle ist im Auslieferungszustand leer, die
 * Abfrage laeuft ueber den Primaerschluessel, und der Aufruf, der sie
 * ausloest, macht ohnehin schon ein halbes Dutzend Abfragen. Dafuer stimmt
 * "ohne Neubau" jetzt ohne Sternchen — eine Aenderung wirkt sofort, nicht
 * "innerhalb einer Minute".
 */

import { logger } from "../config/index.js";

/** Die Org-Typen, die es gibt (gemessen: 1872 company, 694 agency). */
export const ORG_TYPEN = Object.freeze(["company", "agency"]);

/**
 * Alle Abweichungen als verschachtelte Karte:
 *   { [org_type]: { [plan]: { [metrik]: wert } } }
 *
 * Wirft NIE. Fehlt die Tabelle oder die Datenbank, ist die ehrliche Antwort
 * "keine Abweichungen" — also der Auslieferungszustand, in dem beide Seiten
 * denselben Wert teilen. Ein Fehler an dieser Stelle darf keine Grenze
 * verschieben, weder nach oben noch nach unten.
 */
export async function ladeAbweichungen(pool) {
  if (!pool || typeof pool.query !== "function") return {};

  try {
    const { rows } = await pool.query(
      `SELECT org_type, plan, metrik, wert FROM plan_grenze_je_orgtyp`
    );
    const karte = {};
    for (const r of rows || []) {
      const typ = String(r.org_type || "");
      const plan = String(r.plan || "");
      const metrik = String(r.metrik || "");
      const wert = Number(r.wert);
      if (!typ || !plan || !metrik || !Number.isFinite(wert)) continue;
      karte[typ] = karte[typ] || {};
      karte[typ][plan] = karte[typ][plan] || {};
      karte[typ][plan][metrik] = wert;
    }
    return karte;
  } catch (e) {
    logger.warn({ err: e?.message }, "Org-Typ-Grenzen konnten nicht gelesen werden");
    return {};
  }
}

/**
 * Die Abweichungen fuer EINEN Org-Typ und Plan — flach, bereit zum Mischen.
 *
 * Ein unbekannter Org-Typ liefert `{}`, nicht `null`: er faellt damit auf die
 * Code-Vorgabe zurueck. Alles andere waere eine Grenze aus Versehen.
 */
export function abweichungFuer(karte, orgType, plan) {
  const typ = String(orgType || "");
  const p = String(plan || "");
  return (karte && karte[typ] && karte[typ][p]) || {};
}
