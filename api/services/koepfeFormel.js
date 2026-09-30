/**
 * Die EINE Formel: wie viele MENSCHEN stehen hinter einer Gruppe von Angeboten?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM ES DIESE DATEI GIBT (M4c.4, 2026-09-26)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner-Vorgabe zu M4c: Volumen entsteht durch DARSTELLUNGEN, nie durch
 * mehrfache Verfuegbarkeit. "Ein Mensch, fuenfmal gebucht, waere Betrug."
 *
 * Die Zahlen "N Kraefte verfuegbar" summierten bis hierher die Kopfzahl der
 * ANGEBOTE. Solange jeder Mensch hoechstens ein Angebot hatte, war das dasselbe.
 * Seit M4c.1 traegt eine Kraft mit vier Faehigkeiten fuenf Darstellungen — vier
 * Einzelangebote und ein Gesamtangebot. Dieselbe Summe haette daraus fuenf
 * Kraefte gemacht. Das Beispiel im Plan: "128 verfuegbare Kraefte", weil 32
 * Menschen je vier Faehigkeiten tragen.
 *
 * DIE ZAHL IST DIE WICHTIGSTE DES PRODUKTS. Ein Unternehmen entscheidet an ihr,
 * ob es ausschreibt. Ist sie viermal zu hoch, schreibt es aus und bekommt
 * niemanden — und das merkt es nicht bei uns, sondern bei seinem Kunden.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ZWEI ARTEN VON KOEPFEN, UND SIE WERDEN VERSCHIEDEN GEZAEHLT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Personengebundene Angebote (worker_profile_id gesetzt) nennen EINEN Menschen.
 * Beliebig viele Darstellungen desselben Menschen sind EIN Kopf — gezaehlt wird
 * er deshalb ueber COUNT(DISTINCT worker_profile_id).
 *
 * Pauschale Angebote (worker_profile_id NULL — die alten `legacy`-Eintraege und
 * "pauschal N Helfer ohne konkrete Personen", von Migration 146 ausdruecklich
 * erlaubt) nennen niemanden. Dort IST die Kopfzahl die Zahl der Menschen, und
 * zwar die noch freie. Gemessen am 2026-09-26: von 32 beworbenen Koepfen waren
 * 31 pauschal — die Summe ist heute also nicht falsch, weil kaum jemand
 * personengebunden im Markt steht. Sie WIRD falsch, sobald M4c.1 wirkt.
 *
 * Die Summe der beiden ist die ehrliche Zahl. Das Doppelzaehlen kann sie nicht
 * mehr: ein Mensch ist im ersten Summanden genau einmal, und im zweiten gar
 * nicht.
 *
 * EIN EIGENES MODUL OHNE ABHAENGIGKEITEN, wie `zusageFormel.js`: die Formel wird
 * von fuenf Aggregaten und vom Feed gebraucht, und keiner von ihnen soll dafuer
 * einen anderen importieren muessen.
 */

const ALIAS = /^[a-z_][a-z0-9_]*$/i;
const AUSDRUCK = /^[A-Za-z0-9_().*, +-]+$/;

/**
 * @param {string} restSql SQL-Ausdruck fuer die noch freie Kopfzahl EINER Zeile
 *        (z. B. `GREATEST(cp.headcount - …, 0)` oder ein Alias wie `je.rest`)
 * @param {string} profilSpalte Spalte mit der worker_profiles.id der Zeile
 * @returns {string} ein Aggregat-Ausdruck: die Zahl der MENSCHEN in der Gruppe
 */
export function verfuegbareKoepfeSql(restSql, profilSpalte = "cp.worker_profile_id") {
  /* Beide landen unmaskiert im SQL. Sie kommen aus dem eigenen Code — die
     Schranke steht trotzdem hier, nicht im Vertrauen auf kuenftige Aufrufer. */
  /* `-` muss erlaubt sein (`headcount - committed`), und damit kommt `--`
     durch — ein SQL-Kommentar, der den Rest der Zeile verschluckt. Gefunden von
     der eigenen Probe, nicht gedacht: die Zeichenklasse allein reicht hier
     nicht, es braucht die ausdrueckliche Abweisung. */
  const rest = String(restSql);
  if (!AUSDRUCK.test(rest) || rest.includes("--")) throw new Error("KOEPFE_REST_UNGUELTIG");
  /* GENAU zwei Teile. Die erste Fassung zerlegte und griff nur die ersten zwei —
     `cp.a.b` kam damit durch, weil der dritte Teil stillschweigend wegfiel,
     waehrend die ganze Zeichenkette unveraendert ins SQL wanderte. Auch das hat
     die eigene Probe gefunden; eine Schranke, die ihren Rest verschweigt, ist
     keine. */
  const teile = String(profilSpalte).split(".");
  if (teile.length !== 2 || !teile.every((t) => ALIAS.test(t))) {
    throw new Error("KOEPFE_SPALTE_UNGUELTIG");
  }
  return `(
    COUNT(DISTINCT ${profilSpalte})
    + COALESCE(SUM(CASE WHEN ${profilSpalte} IS NULL THEN ${restSql} ELSE 0 END), 0)
  )::int`;
}
