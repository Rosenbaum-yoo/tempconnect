/**
 * Der EINE Titel eines Gesamtangebots — fuer die Hand UND fuer den Takt.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM EIN EIGENES MODUL (M4c.1, 2026-09-24)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ein Gesamtangebot entsteht auf zwei Wegen:
 *
 *   capacityOfferGeneratorService  von Hand (`buildBundleOfferData`, JavaScript)
 *   marktpraesenzService           vom Takt (`BUENDEL_MATERIALISIEREN_SQL`, SQL)
 *
 * Der Takt kann die JavaScript-Funktion nicht aufrufen — er schreibt in EINER
 * Anweisung fuer alle Kraefte der Plattform. Die naheliegende Loesung waere eine
 * Abschrift des Titels im SQL gewesen, gepinnt durch eine Probe. Das haette die
 * zweite Wahrheit nur ueberwacht, nicht beseitigt: jede Aenderung am Wortlaut
 * haette an zwei Stellen erfolgen muessen, und die Probe haette erst hinterher
 * gemeldet, dass eine vergessen wurde.
 *
 * Hier stehen deshalb die BESTANDTEILE einmal, und beide Wege setzen sie ein:
 * JavaScript baut den Text, SQL baut den Ausdruck. Ein neuer Wortlaut wirkt
 * sofort auf beiden Seiten; einer, der nur auf einer wirkt, ist nicht moeglich.
 *
 * Wie `zusageFormel.js`: ein eigenes Modul ohne Abhaengigkeiten, damit keiner
 * der beiden Dienste den anderen importieren muss.
 */

/* Der Gedankenstrich ist U+2013, kein Bindestrich — so stand es schon immer in
   `buildBundleOfferData`, und so steht es in jedem vorhandenen Gesamtangebot. */
export const BUENDEL_TITEL_VORSATZ = "Allround-Kraft – ";
export const BUENDEL_TITEL_NACHSATZ = " Fähigkeiten";

/* Die Bestandteile landen als SQL-Zeichenkettenliterale im Takt. Ein Apostroph
   darin beendete das Literal mitten im Satz — die Anweisung scheiterte fuer die
   ganze Plattform, oder schlimmer: sie liefe mit verschobenem Text weiter. Die
   Schranke steht hier, beim Laden, nicht im Vertrauen auf kuenftige Aenderungen. */
for (const teil of [BUENDEL_TITEL_VORSATZ, BUENDEL_TITEL_NACHSATZ]) {
  if (teil.includes("'") || teil.includes("\\")) throw new Error("BUENDEL_TITEL_UNZULAESSIGES_ZEICHEN");
}

/**
 * @param {number} anzahl Zahl der freigegebenen Katalog-Faehigkeiten
 * @returns {string} der Titel, wie ihn der Markt zeigt
 */
export function buendelTitel(anzahl) {
  return `${BUENDEL_TITEL_VORSATZ}${anzahl}${BUENDEL_TITEL_NACHSATZ}`;
}

/* Nur ein Aggregat- oder Spaltenausdruck, keine Zeichenketten, keine Kommentare:
   der Ausdruck kommt aus dem eigenen Code, die Schranke steht trotzdem hier. */
const AUSDRUCK = /^[A-Za-z0-9_().*, ]+$/;

/**
 * @param {string} anzahlSql SQL-Ausdruck, der die Zahl liefert (z. B. `COUNT(*)`)
 * @returns {string} ein SQL-Ausdruck, der genau `buendelTitel(anzahl)` ergibt
 */
export function buendelTitelSql(anzahlSql) {
  if (!AUSDRUCK.test(String(anzahlSql))) throw new Error("BUENDEL_TITEL_AUSDRUCK_UNGUELTIG");
  return `'${BUENDEL_TITEL_VORSATZ}' || (${anzahlSql})::text || '${BUENDEL_TITEL_NACHSATZ}'`;
}
