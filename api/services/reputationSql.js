/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE EINE ANTWORT AUF "WIE KOMMT MAN VON EINER ORGANISATION ZU IHRER REPUTATION"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WARUM ES DIESES MODUL GIBT — gemessen am 2026-09-27, nicht vermutet:
 *
 * `supplier_reputation` ist auf `supplier_id` geschluesselt, und diese Spalte
 * hat einen Fremdschluessel auf `users(id)`. Es ist also die Reputation eines
 * NUTZERS (des Eigentuemers der Zeitarbeitsfirma), obwohl der Name nach einer
 * Firma klingt. `vendor_pool.supplier_org_id` dagegen zeigt per Fremdschluessel
 * auf `organizations(id)`.
 *
 * ELF Stellen in `vendorPoolService.js` haben trotzdem
 *
 *     LEFT JOIN supplier_reputation sr ON sr.supplier_id = vp.supplier_org_id
 *
 * geschrieben. Ein Nutzer-Schluessel gegen einen Org-Schluessel trifft nie — und
 * weil es ein LEFT JOIN ist, gibt es keinen Fehler, nur lauter NULL. Die ganze
 * Lieferantenverwaltung hat deshalb KEINE Reputation angezeigt: keine Note, kein
 * Grade, keine Sterne, und die Liste der schwaechsten Lieferanten (mit
 * `WHERE sr.reputation_score IS NOT NULL`) war dauerhaft leer.
 *
 * DER RICHTIGE WEG geht ueber den Eigentuemer, und er stand schon in
 * `profileRankingService`: `org_memberships` mit `role_key = 'owner'`. Genau
 * dieser Weg steht jetzt EINMAL hier, statt elfmal verstreut — dasselbe Muster
 * wie `zusageFormel.js`, `bindungSql.js` und `koepfeFormel.js`: wer die Frage
 * neu stellt, bekommt dieselbe Antwort, und ein Fehler ist an einer Stelle zu
 * beheben statt an zwoelf.
 *
 * HIER STAND ETWAS FALSCHES, UND ES WAR SCHAEDLICH (berichtigt am 2026-09-28,
 * Welle Z, Z17). Der Satz lautete:
 *
 *     "NICHT FUER supplier_metrics: `supplier_metrics.agency_id` zeigt selbst
 *      auf `organizations` und wird direkt an der Org verbunden. Diese Joins
 *      waren richtig und bleiben unangetastet — wer sie mitkorrigiert, bricht
 *      sie."
 *
 * Gemessen am 2026-09-28 gegen die laufende Datenbank:
 *
 *     supplier_metrics | FOREIGN KEY (agency_id) REFERENCES users(id) ON DELETE CASCADE
 *
 * `agency_id` zeigt auf NUTZER, genau wie `supplier_reputation.supplier_id`.
 * Der Schreiber bestaetigt es: `supplierMetricsService.recomputeForWindow` holt
 * seine Schluessel mit `SELECT DISTINCT receiver_id FROM requests`, und
 * `requests.receiver_id` ist ebenfalls ein Fremdschluessel auf `users(id)`.
 *
 * Diese Zeilen waren also keine Warnung, sondern ein Riegel vor der richtigen
 * Behebung: SECHS Leser verbanden `sm.agency_id` mit einer Org-Kennung — vier in
 * `vendorPoolService` (in genau den Abfragen, die Z6 repariert hat, die Zeile
 * direkt unter dieser Bruecke), einer in `routes/matching.js`, und einer war der
 * Z5-Fix in `instantMatchService` selbst: dort stand der Anker richtig auf dem
 * Nutzer, und die Kennzahlen wurden dann ueber die Bruecke an `om.org_id`
 * gehaengt. Ein Umweg ins Leere, geschrieben auf das Wort dieses Kommentars hin.
 *
 * DARAUS DIE LEHRE, DIE UEBER DIESE DATEI HINAUSGEHT: eine Behauptung ueber ein
 * Schema gehoert gemessen, auch (und gerade) wenn sie in einem Kommentar steht,
 * der andere vom Anfassen abhalten soll. Ein falscher Riegel haelt laenger als
 * ein falscher Code, weil ihn niemand ausfuehrt und deshalb niemand widerlegt.
 * Der Waechter dazu: `test/nutzerSchluesselGegenOrg.test.js`.
 *
 * Deshalb traegt diese Bruecke jetzt BEIDE nutzer-geschluesselten Tabellen, und
 * zwar ueber EINEN Knoten: ein zweiter `org_memberships`-Join fuer dieselbe
 * Organisation waere derselbe Umweg noch einmal.
 */

/* Erlaubt ist eine qualifizierte Spalte wie `vp.supplier_org_id` oder ein
   einfacher Name. Nichts anderes: dieser Text geht unveraendert in SQL. */
const SPALTE = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i;
const ALIAS = /^[a-z_][a-z0-9_]*$/i;

/**
 * Der JOIN von einer Organisation zu ihrer Reputation, ueber den Eigentuemer.
 *
 * @param {string} orgSpalte - Spalte mit der Org-Kennung, z. B. "vp.supplier_org_id"
 * @param {{ alias?: string, brueckenAlias?: string }} [opts]
 *   alias: Alias fuer `supplier_reputation` (Vorgabe "sr")
 *   brueckenAlias: Alias fuer `org_memberships` (Vorgabe "srom") — nur aendern,
 *   wenn die Abfrage den Namen schon belegt.
 * @returns {string} zwei LEFT JOINs, einsetzbar in eine FROM-Kette
 */
export function reputationJoinSql(orgSpalte, opts = {}) {
  const spalte = String(orgSpalte);
  if (!SPALTE.test(spalte)) throw new Error("REPUTATION_SPALTE_UNGUELTIG");
  const alias = String(opts.alias ?? "sr");
  const bruecke = String(opts.brueckenAlias ?? "srom");
  if (!ALIAS.test(alias) || !ALIAS.test(bruecke)) throw new Error("REPUTATION_ALIAS_UNGUELTIG");
  if (alias === bruecke) throw new Error("REPUTATION_ALIAS_KOLLISION");

  let kennzahlen = "";
  if (opts.kennzahlen) {
    const kAlias = String(opts.kennzahlen.alias ?? "sm");
    if (!ALIAS.test(kAlias)) throw new Error("REPUTATION_ALIAS_UNGUELTIG");
    if (kAlias === alias || kAlias === bruecke) throw new Error("REPUTATION_ALIAS_KOLLISION");
    /*
     * Das Fenster geht als ZAHL in den Text, nie als durchgereichter Wert: dieser
     * Rueckgabewert wird unveraendert zu SQL.
     *
     * Z17: der Typ wird GEPRUEFT, nicht umgewandelt. Eine erste Fassung stand auf
     * `Number(...)`, und die Probe hat es gefangen: `true` ergab `window_days = 1`
     * und `[30]` ergab 30 — stillschweigende Umwandlung an genau der Stelle, an
     * der spaeter ein Anfrageparameter landet. `null`/`undefined` bleiben
     * ABSICHTLICH die Vorgabe ("nicht angegeben"), alles andere wirft.
     */
    const roh = opts.kennzahlen.fensterTage;
    const fenster = roh === null || roh === undefined ? 30 : roh;
    if (typeof fenster !== "number" || !Number.isInteger(fenster) || fenster <= 0) {
      throw new Error("REPUTATION_FENSTER_UNGUELTIG");
    }
    kennzahlen = `
          LEFT JOIN supplier_metrics ${kAlias}
             ON ${kAlias}.agency_id = ${bruecke}.user_id AND ${kAlias}.window_days = ${fenster}`;
  }

  /*
   * DIE BRUECKE MUSS GENAU EINE ZEILE LIEFERN — Z17 (2026-09-28).
   *
   * Bis hierher stand ein gewoehnlicher LEFT JOIN auf `org_memberships`. Der ist
   * falsch, und zwar auf eine Art, die an leeren Tabellen nicht auffaellt:
   * `org_memberships` kann MEHRERE Eigentuemer je Organisation fuehren, und dann
   * vervielfacht dieser Join jede Zeile der umgebenden Abfrage. Gemessen am
   * 2026-09-28: 200 Organisationen mit Eigentuemer, EINE davon mit zwei. In
   * `getVendorPool` faengt ein `DISTINCT ON (vp.supplier_org_id)` das ab; an den
   * drei anderen Stellen in `vendorPoolService` steht kein DISTINCT — dort waere
   * ein Lieferant doppelt in der Liste erschienen, sobald jemand einen zweiten
   * Eigentuemer eintraegt. Dass `vendor_pool` heute leer ist, war der einzige
   * Grund, warum das nicht schon sichtbar war.
   *
   * Deshalb LEFT JOIN LATERAL mit LIMIT 1: hoechstens eine Zeile, immer dieselbe.
   * Die Ordnung ist nicht Geschmack, sondern Voraussetzung — ohne ORDER BY waehlt
   * die Datenbank frei, und dieselbe Abfrage koennte morgen eine andere Reputation
   * anzeigen. `created_at` (NOT NULL) nimmt den ERSTEN Eigentuemer, `user_id`
   * entscheidet den Gleichstand.
   *
   * `is_active` kam ebenfalls dazu: die Spalte ist NOT NULL und wurde nicht
   * gefragt, ein ausgeschiedener Eigentuemer hat also weiter die Reputation
   * seiner ehemaligen Firma getragen. Heute aendert das kein Ergebnis (gemessen:
   * alle 201 Eigentuemer-Mitgliedschaften sind aktiv) — genau deshalb ist jetzt
   * der richtige Zeitpunkt dafuer.
   *
   * Der Index dafuer ist vorhanden: `om_org_role_idx (org_id, role_key,
   * is_active)` deckt Filter und Ordnung; kein neuer Index noetig.
   *
   * OFFEN UND DEM OWNER VORZULEGEN: ob bei mehreren Eigentuemern der ERSTE gelten
   * soll oder die Reputationen zu verrechnen sind, ist eine Produktfrage. Sie
   * wird hier nicht entschieden — eindeutig und wiederholbar zu sein ist die
   * technische Pflicht, WELCHE Zeile gilt, ist es nicht.
   */
  return `${eigentuemerJoinSql(spalte, { alias: bruecke })}
          LEFT JOIN supplier_reputation ${alias}
             ON ${alias}.supplier_id = ${bruecke}.user_id${kennzahlen}`;
}

/**
 * NUR DIE BRUECKE: von einer Organisation zu ihrem Eigentuemer (einem Nutzer).
 *
 * Herausgeloest am 2026-09-28 (Z17), weil ein DRITTER Aufrufer sie ohne Beiladung
 * braucht: `getWorkforceCapacity` zaehlt die Kapazitaetsangebote der
 * Vorzugslieferanten und verband dafuer `cp.supplier_company_id` (ein Nutzer) mit
 * `vp.supplier_org_id` (eine Organisation). Der LEFT JOIN traf nie — die ganze
 * Funktion gab fuer jeden Lieferanten capacity_posts 0, total_workers 0 und roles
 * NULL zurueck, ohne Fehler. Reputation braucht sie dort nicht; sie sich dafuer
 * mitzunehmen waere eine Abfrage, die mehr liest als sie zeigt, und sie
 * NACHZUBAUEN waere die Parallelstruktur, die dieses Projekt verbietet.
 *
 * Jede Eigenschaft dieser Bruecke steht damit an genau einer Stelle: LATERAL und
 * LIMIT 1 gegen die Vervielfachung, ORDER BY gegen die Zufallsauswahl,
 * is_active gegen den Ausgeschiedenen, EIGENTUEMER_ROLLE gegen ein Umbenennen im
 * Rechtemodell. Wer eine davon aendert, aendert sie fuer alle Aufrufer — und das
 * ist der ganze Zweck.
 *
 * @param {string} orgSpalte - Spalte mit der Org-Kennung, z. B. "vp.supplier_org_id"
 * @param {{ alias?: string }} [opts] alias: Alias fuer das Ergebnis (Vorgabe "eig")
 * @returns {string} ein LEFT JOIN LATERAL, dessen Alias `.user_id` traegt
 */
export function eigentuemerJoinSql(orgSpalte, opts = {}) {
  const spalte = String(orgSpalte);
  if (!SPALTE.test(spalte)) throw new Error("REPUTATION_SPALTE_UNGUELTIG");
  const alias = String(opts.alias ?? "eig");
  if (!ALIAS.test(alias)) throw new Error("REPUTATION_ALIAS_UNGUELTIG");
  return `LEFT JOIN LATERAL (
            SELECT ${alias}_m.user_id
              FROM org_memberships ${alias}_m
             WHERE ${alias}_m.org_id = ${spalte}
               AND ${alias}_m.role_key = '${EIGENTUEMER_ROLLE}'
               AND ${alias}_m.is_active = TRUE
             ORDER BY ${alias}_m.created_at ASC, ${alias}_m.user_id ASC
             LIMIT 1
          ) ${alias} ON TRUE`;
}

/**
 * DIE GEGENRICHTUNG: von einem ANBIETER (Nutzer) zu SEINER Organisation.
 *
 * Gefunden am 2026-09-28 von `test/identitaetenNichtVermischen.test.js`, in
 * seinem allerersten Lauf: `instantMatchService` verband
 *
 *     LEFT JOIN organizations o ON o.id = cp.supplier_company_id
 *
 * und holte daraus `o.name AS supplier_name`. `capacity_posts.supplier_company_id`
 * zeigt per Fremdschluessel auf `users` — der Name war also IMMER NULL, und im
 * Sofort-Abgleich stand bei jedem Treffer kein Lieferant. Gegenprobe an den echten
 * Daten: direkt 0 Treffer, ueber den Eigentuemer alle 45.
 *
 * Die uebrigen sieben Stellen im Bestand, die `supplier_company_id` verbinden,
 * machen es richtig (`JOIN users u ON u.id = cp.supplier_company_id`) — diese eine
 * war die Ausnahme. Der Firmenname liegt aber nicht an `users`, sondern an
 * `organizations`, und deshalb braucht es den Weg hierher.
 *
 * WARUM AUCH HIER LATERAL: ein Nutzer KANN Eigentuemer mehrerer Organisationen
 * sein — kein UNIQUE verhindert es. Heute ist keiner es (gemessen: 201 Nutzer mit
 * Eigentum, hoechste Zahl 1), und genau deshalb ist jetzt der richtige Zeitpunkt
 * fuer die Schranke: sie kostet nichts und faengt den Tag, an dem es anders ist.
 *
 * @param {string} nutzerSpalte - Spalte mit der Nutzer-Kennung, z. B. "cp.supplier_company_id"
 * @param {{ alias?: string }} [opts] alias: Alias fuer `organizations` (Vorgabe "aorg")
 * @returns {string} ein LEFT JOIN LATERAL, einsetzbar in eine FROM-Kette
 */
export function anbieterOrganisationSql(nutzerSpalte, opts = {}) {
  const spalte = String(nutzerSpalte);
  if (!SPALTE.test(spalte)) throw new Error("REPUTATION_SPALTE_UNGUELTIG");
  const alias = String(opts.alias ?? "aorg");
  if (!ALIAS.test(alias)) throw new Error("REPUTATION_ALIAS_UNGUELTIG");
  return `LEFT JOIN LATERAL (
            SELECT ${alias}_o.*
              FROM org_memberships ${alias}_m
              JOIN organizations ${alias}_o ON ${alias}_o.id = ${alias}_m.org_id
             WHERE ${alias}_m.user_id = ${spalte}
               AND ${alias}_m.role_key = '${EIGENTUEMER_ROLLE}'
               AND ${alias}_m.is_active = TRUE
             ORDER BY ${alias}_m.created_at ASC, ${alias}_o.id ASC
             LIMIT 1
          ) ${alias} ON TRUE`;
}

/** Die Rolle, die den Eigentuemer einer Organisation bezeichnet. Einmal benannt,
 *  damit ein Umbenennen im Rechtemodell nicht elf Abfragen still bricht.
 *
 *  Z17: die Konstante wird jetzt WIRKLICH in die Abfragen eingesetzt. Vorher stand
 *  'owner' als Literal in der Vorlage und die Konstante daneben — ein Umbenennen
 *  haette die Konstante geaendert und die Abfrage nicht. */
export const EIGENTUEMER_ROLLE = "owner";
