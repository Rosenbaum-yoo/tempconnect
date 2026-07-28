/**
 * pg-Typparser — DATE bleibt ein Kalendertag.
 *
 * DAS PROBLEM (echter, kundenrelevanter Fehler, gefunden ueber
 * `test/integration/contract.flow.test.js`):
 *   Der pg-Treiber macht aus einer DATE-Spalte per Default ein JS-`Date` um
 *   **lokale** Mitternacht. `JSON.stringify` schreibt das dann als UTC-Zeitpunkt
 *   in die Antwort. Aus dem Vertragsende `2026-04-01` wurde so
 *   `"2026-03-31T22:00:00.000Z"` — und jede Anzeige, die auf UTC formatiert
 *   (`.slice(0,10)`, `toISOString()`, `toLocaleDateString('de-DE',{timeZone:'UTC'})`),
 *   zeigte den **31.03.** statt des 01.04. Ein Vertragsende, ein Sperrdatum oder
 *   ein Wochenende, das einen Tag zu frueh erscheint, ist kein Schoenheitsfehler:
 *   danach wird abgerechnet und disponiert.
 *
 * WARUM ES IM SOMMER NICHT AUFFIEL: der Versatz betraegt in Berlin 1–2 Stunden.
 * Er kippt das Datum nur, weil lokale Mitternacht **vor** UTC-Mitternacht liegt —
 * also ganzjaehrig, aber nur bei UTC-basierter Formatierung sichtbar. In der
 * lokalen Formatierung stimmte es zufaellig, deshalb blieb es lange unentdeckt.
 *
 * DIE LOESUNG: DATE (OID 1082) unveraendert als Zeichenkette durchreichen.
 * Ein Kalendertag hat keine Zeitzone — genau so soll er auch in der Antwort
 * stehen: `"2026-04-01"`.
 *
 * BEWUSST NICHT GEAENDERT:
 *   - 1114 `timestamp without time zone` und 1184 `timestamptz`: das sind echte
 *     Zeitpunkte, die UTC-Serialisierung ist dort richtig.
 *   - 1700 `numeric`: bleibt Zeichenkette. Eine Umwandlung nach Number waere ein
 *     Praezisionsverlust bei Geldbetraegen.
 *
 * WIRKUNG: `pg` haelt die Parser modulweit, nicht pro Pool. Dieser Import wirkt
 * daher fuer jeden Pool im Prozess — auch fuer die der Integrationstests.
 * Deshalb wird er in `db/pool.js` **vor** dem ersten Query ausgefuehrt.
 */

import pg from "pg";

/** OID der DATE-Spalte in PostgreSQL. */
export const DATE_OID = 1082;

/** OIDs, die absichtlich beim Default-Verhalten bleiben (siehe Kopfkommentar). */
export const UNCHANGED_OIDS = Object.freeze({
  TIMESTAMP: 1114,
  TIMESTAMPTZ: 1184,
  NUMERIC: 1700
});

let applied = false;

/**
 * Setzt die Typparser. Idempotent — mehrfacher Aufruf ist ein No-Op.
 * @returns {boolean} true beim ersten Aufruf, danach false
 */
export function applyTypeParsers() {
  if (applied) return false;
  // Rohwert durchreichen: Postgres liefert DATE bereits als 'YYYY-MM-DD'.
  pg.types.setTypeParser(DATE_OID, (value) => value);
  applied = true;
  return true;
}

applyTypeParsers();
