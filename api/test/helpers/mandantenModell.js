/**
 * Das Mandanten-Modell als EINE Quelle — Registry rendert das Dokument.
 *
 * WARUM (V-1 / P1-16)
 * `docs/security/TENANT_ISOLATION_MODEL.md` war von Hand gepflegt und in beide
 * Richtungen falsch:
 *
 *  - Es versprach fuer 63 Tabellen eine "Migration 117". **Die gibt es nicht**,
 *    `sql/migrations/` springt von 116 auf 118. Wer das Dokument las, hoerte auf
 *    zu suchen — eine behauptete Sicherung ist schlimmer als eine fehlende.
 *  - Es nannte fuer 18 dieser Tabellen die Spalte `org_id`, die es dort **nicht
 *    gibt** (gemessen: `capacities.agency_id`, `demand_requests.
 *    requester_company_id` u. a. — und die zeigen auf `users`, nicht auf
 *    `organizations`). Eine daraus geschriebene Migration waere an genau dem
 *    Fehler gescheitert, der schon 116 in den Rollback riss.
 *  - Der Abschnitt "RLS AKTIV" fuehrte `subscriptions` und `vendor_pool_entries`
 *    als geschuetzt. 116 schliesst `subscriptions` ausdruecklich aus, und
 *    `vendor_pool_entries` existiert nicht. Die gefaehrlichere Haelfte des
 *    Dokuments war die, die Schutz behauptete.
 *  - Umgekehrt fehlten 60 Tabellen, die sehr wohl einen Mandanten tragen.
 *
 * Deshalb wird der Zustandsteil des Dokuments nicht mehr gepflegt, sondern
 * GERENDERT — aus `test/fixtures/mandantenTabellen.json`, das seinerseits gegen
 * die laufende Datenbank gemessen wurde. `mandantenModellWaechter.test.js` haelt
 * beide zusammen; der DB-gebundene Teil prueft die Registry gegen die
 * Wirklichkeit.
 *
 * Neu rendern: `node scripts/render-mandanten-modell.js --write`
 */

export const MARKER_START = "<!-- MANDANTEN-MODELL:START — generiert, nicht von Hand pflegen -->";
export const MARKER_ENDE = "<!-- MANDANTEN-MODELL:ENDE -->";

/** Reihenfolge der Abschnitte: erst was steht, dann was fehlt, dann warum. */
const ABSCHNITTE = [
  {
    schluessel: "geschuetzt",
    titel: "🔴 Backstop steht — RLS aktiv",
    text:
      "Eine Verbindung ohne Org-Kontext und ohne Staff-Bypass sieht hier nichts. " +
      "Angelegt von `116_rls_deny_by_default.sql`, auf Bestands-Datenbanken " +
      "nachgezogen von `126_rls_forward_repair.sql`.",
  },
  {
    schluessel: "bereit",
    titel: "🟡 Backstop moeglich — Traegerspalte ist lueckenlos gefuellt",
    text:
      "Mandanten-privat, und die Traegerspalte steht in **jeder** Zeile. RLS kann " +
      "hier aktiviert werden, ohne dass Zeilen verschwinden.",
  },
  {
    schluessel: "bereit_ohne_daten",
    titel: "⚪ Backstop moeglich, aber nicht nachweisbar — Tabelle ist leer",
    text:
      "Traegerspalte vorhanden, noch keine Zeilen. Technisch aktivierbar; an echten " +
      "Daten laesst sich die Trennung heute nicht zeigen.",
  },
  {
    schluessel: "blockiert_daten",
    titel: "🟠 Backstop NICHT moeglich — die Traegerspalte ist nicht gefuellt",
    text:
      "Hier ist RLS kein Schutz, sondern ein Datenausfall: Zeilen mit `NULL` in der " +
      "Traegerspalte waeren fuer **jeden** unsichtbar, auch fuer den Eigentuemer. " +
      "Erst die Schreibseite reparieren, dann sichern. Derselbe Defekt wie in " +
      "Abschnitt 8.1.1 des Plans I (`audit_log`).",
  },
  {
    schluessel: "kein_mandantentraeger",
    titel: "🔵 Kein Mandantentraeger — org-RLS waere das falsche Modell",
    text:
      "Die Fremdschluessel auf `organizations` sind hier Selbstbezug, globaler " +
      "Katalog, die Gegenseite eines zweiseitigen Vorgangs oder eine Staff-/Owner-" +
      "Flaeche. Dieselbe Begruendung, mit der `116` schon `subscriptions` " +
      "ausgenommen hat: eine Mitgliedschaftsbruecke wuerde fremde Daten erst " +
      "recht offenlegen.",
  },
];

function spalten(eintrag) {
  return eintrag.orgSpalten.map((s) => `\`${s}\``).join(", ");
}

function fuellstand(eintrag) {
  if (eintrag.zeilen === 0) return "leer";
  if (eintrag.ohneOrg === 0) return `${eintrag.zeilen} Zeilen, lueckenlos`;
  return `**${eintrag.ohneOrg} von ${eintrag.zeilen} ohne Org**`;
}

/**
 * Rendert den Zustandsteil des Modell-Dokuments aus der Registry.
 * @param {{stand: string, tabellen: any[]}} registry
 * @returns {string} Markdown zwischen (ohne) den Markern
 */
export function rendereModell(registry) {
  const zeilen = [];
  zeilen.push("");
  zeilen.push(
    `> **Gemessen am ${registry.stand} gegen die laufende Datenbank** — nicht gegen die ` +
    `Migrationen, die beiden laufen auseinander. Erhebung: Fremdschluessel mit Ziel ` +
    `\`organizations\`, dazu Zeilen- und \`NULL\`-Zaehlung je Traegerspalte. ` +
    `Quelle: \`api/test/fixtures/mandantenTabellen.json\`, erzwungen durch ` +
    `\`api/test/mandantenModellWaechter.test.js\`.`
  );
  zeilen.push(">");
  zeilen.push(
    `> **Dieser Abschnitt wird generiert.** Von Hand geaendert haelt er nicht: der ` +
    `Waechter vergleicht ihn Zeichen fuer Zeichen mit der Registry. Neu rendern mit ` +
    `\`node scripts/render-mandanten-modell.js --write\`.`
  );
  zeilen.push("");

  const summe = registry.tabellen.length;
  zeilen.push(
    `**${summe} Tabellen** tragen einen Fremdschluessel auf \`organizations\`. ` +
    ABSCHNITTE.map((a) => {
      const n = registry.tabellen.filter((t) => t.einstufung === a.schluessel).length;
      return `${n} ${a.titel.replace(/^\S+\s/, "").split(" — ")[0]}`;
    }).join(" · ") + "."
  );
  zeilen.push("");

  for (const abschnitt of ABSCHNITTE) {
    const treffer = registry.tabellen
      .filter((t) => t.einstufung === abschnitt.schluessel)
      .sort((a, b) => a.tabelle.localeCompare(b.tabelle));
    zeilen.push(`### ${abschnitt.titel} (${treffer.length})`);
    zeilen.push("");
    zeilen.push(abschnitt.text);
    zeilen.push("");
    zeilen.push("| Tabelle | Traegerspalte(n) | Bestand | Anmerkung |");
    zeilen.push("|---|---|---|---|");
    for (const t of treffer) {
      const anmerkung =
        abschnitt.schluessel === "geschuetzt"
          ? `Policies: ${t.policies.map((p) => `\`${p}\``).join(", ")}${t.force ? " · FORCE" : ""}`
          : t.begruendung;
      zeilen.push(`| \`${t.tabelle}\` | ${spalten(t)} | ${fuellstand(t)} | ${anmerkung} |`);
    }
    zeilen.push("");
  }
  return zeilen.join("\n");
}
