/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EINE WAHRHEIT DARÜBER, OB EIN STICHTAG IM GÜLTIGKEITSFENSTER LIEGT (U6.8)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner-Freigabe 2026-10-01 (Punkt 12 der Entscheidungsliste).
 *
 * WARUM DIESES MODUL ÜBERHAUPT ENTSTEHT. Die Bedingung "heute liegt im Fenster"
 * wird jetzt zum ZWEITEN Mal gebraucht: U6.2 baute sie fuer `vendor_pool`, U6.8
 * braucht sie fuer `contracts`. Sie dort ein zweites Mal von Hand hinzuschreiben
 * waere genau die Fehlerklasse, die diese Phase dreimal geliefert hat - die
 * Pool-Regel stand am Ende VIERFACH im Baum, zwei Fassungen davon aus einer
 * einzigen Welle.
 *
 * Und es ist nicht bei zwei Stellen zu Ende: eine Breitenmessung am 2026-10-01
 * hat vier WEITERE Stellen derselben Klasse gefunden (supplierPoolService ohne
 * jedes Fenster, marketplaceService mit zwei Wahrheiten ueber `availability_to`,
 * assignmentStaffingService, workerService). Sie sind owner-gebunden und noch
 * nicht gebaut - aber wenn sie kommen, kommen sie hierher.
 *
 * WAS DIE REGEL IST, und beide Haelften sind gemessen, nicht geraten:
 *
 *   NULL heisst UNBEGRENZT, auf beiden Seiten. Gemessen: valid_from und
 *   valid_until sind in vendor_pool UND in contracts nullbar. Ein Fenster ohne
 *   Beginn gilt seit immer, eines ohne Ende bis immer.
 *
 *   BEIDE GRENZEN SCHLIESSEN EIN. Am Tag des Beginns gilt es, am Tag des Endes
 *   auch. Ein Off-by-one kostet hier genau einen Tag - und zwar immer den, an
 *   dem jemand arbeitet.
 *
 * DER STICHTAG KOMMT VON AUSSEN, als gebundener Parameter. Nicht CURRENT_DATE:
 * gemessen am 2026-10-01 pinnte NICHTS im Repo die Zeitzone der Datenbank, sie
 * kam vom Host (Migration 227 pinnt sie seitdem). Ein Riegel soll nicht an einer
 * Einstellung haengen, die jemand zuruecksetzen kann. CURRENT_DATE bleibt
 * erlaubt, weil Lesepfade es legitim benutzen - aber ein Riegel bindet.
 */

/* Nur Bezeichner, die wir selbst schreiben - keine Nutzereingabe. Die Pruefung
   ist trotzdem da, weil der naechste Aufrufer das nicht wissen kann. */
const BEZEICHNER = /^[a-z_][a-z0-9_]*$/i;
const AUSDRUCK = /^(\$\d+(::\w+)?|[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?|CURRENT_DATE)$/i;

function pruefe(name, wert, muster) {
  const s = String(wert ?? "");
  if (!muster.test(s)) throw new Error("FENSTER_SQL_UNGUELTIG: " + name + "=" + s);
  return s;
}

/**
 * Die Fensterbedingung als AND-verknuepftes Paar, OHNE fuehrendes AND.
 *
 * @param {object} opts
 * @param {string} opts.alias   Tabellenalias, z. B. "vp" oder "c"
 * @param {string} opts.datum   Platzhalter ($3) oder CURRENT_DATE als Stichtag
 * @param {string} [opts.von]   Spaltenname des Fensterbeginns, Vorgabe "valid_from"
 * @param {string} [opts.bis]   Spaltenname des Fensterendes, Vorgabe "valid_until"
 */
export function gueltigkeitsfensterSql(opts = {}) {
  const alias = pruefe("alias", opts.alias ?? "t", BEZEICHNER);
  const von = pruefe("von", opts.von ?? "valid_from", BEZEICHNER);
  const bis = pruefe("bis", opts.bis ?? "valid_until", BEZEICHNER);
  const datum = pruefe("datum", opts.datum, AUSDRUCK);
  /* Ein Platzhalter braucht die Typangabe, CURRENT_DATE nicht - sonst entsteht
     CURRENT_DATE::date, und das ist zwar gueltig, aber Laerm im Abfragetext. */
  const tag = /^\$\d+$/.test(datum) ? datum + "::date" : datum;
  return `(${alias}.${von} IS NULL OR ${alias}.${von} <= ${tag})
        AND (${alias}.${bis} IS NULL OR ${alias}.${bis} >= ${tag})`;
}
