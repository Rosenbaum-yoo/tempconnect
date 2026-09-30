/**
 * Die EINE Formel: wie viele Personen belegt ein Angebot (`offers`-Zeile)
 * verbindlich von einem Kapazitaetsangebot?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM EIN EIGENES MODUL (Welle N2.8, 2026-09-13)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Diese Rechnung stand DREIMAL im Repo, jeweils als eigene Abschrift:
 *
 *   capacityExchangeService   Handelsstand (`getCapacityCommercialStates`) und
 *                             seit N2.8 der Feed-Filter auf die freie Kopfzahl
 *   marketplaceService        Treffer beim Anlegen eines Bedarfs, Marktplatz
 *   capacityDiscoveryService  "N Kraefte verfuegbar" in fuenf Aggregaten
 *
 * Heute sind die drei gleichwertig. Aendert sich die Regel — ein neuer
 * Vereinbarungsstatus, eine andere Mengenquelle —, haette man sie an drei
 * Stellen aendern muessen, und der Markt haette danach drei verschiedene
 * Wahrheiten ueber dieselben freien Plaetze gekannt: der Feed zeigt ein
 * Angebot, die Suche zaehlt es nicht, der Handelsstand sperrt es.
 *
 * EIN EIGENES MODUL OHNE ABHAENGIGKEITEN, damit keiner der drei Dienste den
 * anderen importieren muss. `marketplaceService` importiert bereits
 * `capacityExchangeService`; die umgekehrte Richtung waere ein Zirkel.
 */

const ALIAS = /^[a-z_][a-z0-9_]*$/i;

/**
 * @param {string} o Alias der `offers`-Zeile
 * @param {string} d Alias der zugehoerigen `demand_requests`-Zeile
 * @returns {string} Ein SQL-`CASE`-Ausdruck, der je Angebotszeile die belegte
 *          Kopfzahl liefert — zum Summieren.
 */
export function zugesagtJeAngebotSql(o = "o", d = "d") {
  /* Die Aliase landen unmaskiert im SQL. Sie kommen aus dem eigenen Code — die
     Schranke steht trotzdem hier, nicht im Vertrauen auf kuenftige Aufrufer. */
  if (!ALIAS.test(String(o)) || !ALIAS.test(String(d))) throw new Error("ZUSAGE_ALIAS_UNGUELTIG");
  return `CASE
           WHEN ${o}.status = 'accepted'
             AND COALESCE(${o}.agreement_status, 'none') NOT IN ('cancelled', 'expired')
           THEN GREATEST(COALESCE(${o}.offered_quantity, ${d}.headcount, 0), 0)
           ELSE 0
         END`;
}
