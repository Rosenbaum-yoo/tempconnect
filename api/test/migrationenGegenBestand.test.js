/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE MIGRATIONEN GEGEN DEN BESTAND — IN BEIDEN RICHTUNGEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WARUM ES DIESEN WAECHTER GIBT
 *
 * `059_feature_overrides.sql` liegt im Verzeichnis, legt eine Tabelle an und ist
 * in `_migrations` ALS ANGEWANDT VERBUCHT — die Tabelle hat trotzdem gefehlt
 * (behoben in Welle Z, Z4, durch Nachtrag 223). Ursache laut `sql/migrate.sh`:
 * VOR `ON_ERROR_STOP=1` wurden fehlgeschlagene Migrationen faelschlich als
 * angewandt eingetragen. Die Buchhaltung sagte also etwas, das die Datenbank
 * nicht hergab, und niemand konnte es sehen.
 *
 * WAS DIESER WAECHTER NICHT IST, und das ist der Kern seiner Bauform:
 *
 *   Ein NAMENSVERGLEICH (Buchungen gegen Dateinamen) ist genau invertiert. Er
 *   meldet die 13 harmlosen Altbuchungen zusammengefuehrter Migrationen rot —
 *   und 059 GRUEN, denn dessen Datei existiert ja und ist verbucht; nur die
 *   Tabelle fehlte. Verglichen werden deshalb OBJEKTE, nicht Namen.
 *
 * Und er prueft BEIDE Richtungen, weil nur eine davon heute brennt:
 *
 *   A) deklariert, aber im Bestand fehlend  -> der 059-Fall. Heute LEER.
 *   B) im Bestand, aber nirgends deklariert -> acht Faelle, alle erklaert
 *      (drei entstehen ausserhalb des Migrationswegs und sollen es, fuenf sind
 *      Waisen zusammengefuehrter Alt-Migrationen, die kein Code anfasst).
 *
 * Ein Waechter nur auf (A) waere ab heute dauerhaft gruen und beweist nichts.
 * Deshalb pruefen die Proben unten den ERKENNER zusaetzlich an einem KUENSTLICHEN
 * Fall: ein erfundener Migrationstext, der eine Tabelle deklariert, die es nicht
 * gibt, muss gemeldet werden. Ohne diesen Nachweis ist ein gruener Waechter ohne
 * lebenden Fall nur eine Behauptung.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ZWEI MESSFALLEN, IN DIE ICH BEIM BAUEN BEIDE GETAPPT BIN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. DAS DATEIMUSTER NICHT ERFINDEN. Eine erste Messung nahm `^\d{3}_.*\.sql`.
 *    `migrate.sh` nimmt `ls /migrations/*.sql | sort`. Es gibt
 *    `027b_timesheets.sql` und `045b_reputation_visibility.sql` — Buchstaben-
 *    Zusatz, vom eigenen Muster ausgeschlossen. Ergebnis: `timesheets` erschien
 *    als undeklariert, und daraus wurde ein gemeldeter "Livegang-Blocker", den es
 *    nicht gab. Wer eine Datei-Auswahl nachbildet statt sie zu uebernehmen, misst
 *    ein anderes Projekt. Probe: `das Dateimuster folgt migrate.sh`.
 *
 * 2. AUSSAGE-REIHENFOLGE. Wer je Datei erst alle CREATEs und dann alle DROPs
 *    verarbeitet, macht aus einer Neuanlage (`DROP IF EXISTS x; CREATE x`) eine
 *    Entfernung. Probe: `eine Neuanlage in derselben Datei bleibt deklariert`.
 *
 * Beide Fehler zeigten in dieselbe Richtung und sahen dadurch wie eine
 * Bestaetigung aus. Aufgefallen ist es an einem Widerspruch von aussen:
 * `sql/test-fresh-install.sh` prueft `timesheets` ausdruecklich — eine Tabelle,
 * die das Frisch-Installations-Gate prueft, kann nicht undeklariert sein.
 *
 * DB-FREI: gemessen wird gegen `test/fixtures/schema.json`, den committeten
 * Schnappschuss der laufenden Datenbank. Eine Zusicherung, die nur mit Datenbank
 * laeuft, ist im Tor keine.
 *
 * UEBERTRAGBAR: derselbe Abgleich gehoert in jedes Folgeprojekt. Er kostet
 * nichts und faengt den Fall, den niemand sieht — eine Buchhaltung, die luegt.
 *
 * Run: node --test --test-force-exit test/migrationenGegenBestand.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Pfade relativ zu DIESER Datei — sonst haengt das Ergebnis am
   Startverzeichnis und die Probe skippt je nach Aufruf lautlos. */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, "..", "..");
const MIGDIR = path.join(WURZEL, "sql", "migrations");
const INIT = path.join(WURZEL, "sql", "init.sql");
const ABBILD = path.join(HIER, "fixtures", "schema.json");

/* ════════════════════════════════════════════════════════════════════════════
   REGISTER: was im Bestand steht, ohne von einer Migration zu kommen
   ════════════════════════════════════════════════════════════════════════════
   Jeder Eintrag nennt den Grund. Wer hier etwas eintraegt, ohne es belegen zu
   koennen, verschiebt einen Befund in eine Liste. */
const OHNE_MIGRATION = {
  /* ── Entstehen ausserhalb des Migrationswegs und sollen es ─────────────── */
  session: "Legt `connect-pg-simple` selbst an (api/app.js: tableName 'session', "
         + "createTableIfMissing: true). Der Sitzungsspeicher besitzt seine Tabelle.",
  staff_session: "Wie `session`, zweiter Speicher fuer die Staff-Sitzung "
               + "(api/app.js, tableName 'staff_session') — die Trennung der Sitzungswelten "
               + "ist gewollt.",
  _migrations: "Die Buchhaltung selbst. `sql/migrate.sh` legt sie an, bevor die erste "
             + "Migration laeuft — sie kann nicht von einer Migration kommen.",

  /* ── Waisen zusammengefuehrter Alt-Migrationen ─────────────────────────── */
  activity_feed: "Waise. `_migrations` fuehrt Altbuchungen wie `002_marketplace.sql`, deren "
               + "Dateien beim Zusammenfuehren entfernt wurden; die Tabellen blieben stehen. "
               + "KEIN Produktionscode liest sie (gemessen 2026-09-27: der einzige Treffer ist "
               + "eine URL-Zeichenkette in routes/admin.js). Aufraeumen moeglich, kein Befund.",
  agency_api_keys: "Waise, 0 Fundstellen im Produktionscode (gemessen 2026-09-27).",
  reviews: "Waise, 0 Fundstellen im Produktionscode (gemessen 2026-09-27).",
  usage_counters: "Waise, 0 Fundstellen im Produktionscode (gemessen 2026-09-27) — die "
                + "Verbrauchsmessung laeuft ueber andere Tabellen.",
  email_verification_tokens: "Waise, 0 Fundstellen im Produktionscode. In Welle Z (Z1) als "
                           + "solche belegt: die E-Mail-Bestaetigung laeuft ueber "
                           + "`users.verification_token`, diese Tabelle kommt im Code nur in "
                           + "einem Kommentar vor."
};

/* Tabellen, die eine Migration anlegt, die aber im Bestand fehlen DUERFEN.
   Heute leer — und das ist die Aussage. Wer hier etwas eintraegt, nimmt eine
   Zusage zurueck und muss sagen, warum die Tabelle nicht gebraucht wird. */
const DARF_FEHLEN = {};

/* ── Erkenner ────────────────────────────────────────────────────────────── */

const AUSSAGE = new RegExp(
  "^[ \\t]*(?:CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?|DROP\\s+TABLE(?:\\s+IF\\s+EXISTS)?)"
  + "\\s+([a-z_][a-z0-9_.]*)", "gim");

/**
 * Wertet Dateien in der uebergebenen REIHENFOLGE aus und innerhalb einer Datei
 * die Aussagen in ihrer TEXT-Reihenfolge (Messfalle 2).
 * @param {{name: string, text: string}[]} dateien
 * @returns {{ lebend: Map<string,string>, entfernt: Map<string,string> }}
 */
function deklariert(dateien) {
  const lebend = new Map();
  const entfernt = new Map();
  for (const { name, text } of dateien) {
    AUSSAGE.lastIndex = 0;
    let m;
    while ((m = AUSSAGE.exec(text)) !== null) {
      const tabelle = m[1].toLowerCase().split(".").pop();
      if (/^create/i.test(m[0].trim())) {
        lebend.set(tabelle, name);
        entfernt.delete(tabelle);
      } else if (lebend.has(tabelle)) {
        lebend.delete(tabelle);
        entfernt.set(tabelle, name);
      }
    }
  }
  return { lebend, entfernt };
}

/** Dateiliste GENAU wie `sql/migrate.sh`: alle *.sql, sortiert (Messfalle 1). */
function migrationsDateien() {
  return fs.readdirSync(MIGDIR).filter((n) => n.endsWith(".sql")).sort()
    .map((n) => ({ name: n, text: fs.readFileSync(path.join(MIGDIR, n), "utf8") }));
}

function alleDateien() {
  const raus = [];
  if (fs.existsSync(INIT)) raus.push({ name: "init.sql", text: fs.readFileSync(INIT, "utf8") });
  return raus.concat(migrationsDateien());
}

const bestand = () => new Set(Object.keys(JSON.parse(fs.readFileSync(ABBILD, "utf8")).tabellen));

describe("Waechter: die Migrationen gegen den Bestand", () => {
  it("die Grundlage steht: Dateien, Abbild, plausible Groessen", () => {
    const dateien = alleDateien();
    assert.ok(dateien.length >= 200, "nur " + dateien.length + " SQL-Dateien gelesen");
    const { lebend } = deklariert(dateien);
    assert.ok(lebend.size >= 180, "nur " + lebend.size + " Tabellen als deklariert erkannt");
    assert.ok(bestand().size >= 180, "das Abbild hat nur " + bestand().size + " Tabellen");
  });

  it("das Dateimuster folgt migrate.sh — Buchstaben-Zusaetze fallen nicht heraus", () => {
    /* MESSFALLE 1, festgenagelt: `027b_timesheets.sql` legt `timesheets` und
       `timesheet_entries` an. Ein selbst erfundenes Muster `^\d{3}_` schliesst
       die Datei aus und macht aus zwei voellig normalen Tabellen einen
       "Livegang-Blocker". */
    const namen = migrationsDateien().map((d) => d.name);
    const mitBuchstabe = namen.filter((n) => /^\d{3}[a-z]_/.test(n));
    assert.ok(mitBuchstabe.length >= 1,
      "keine Datei mit Buchstaben-Zusatz gefunden — dann kann diese Probe ihren Gegenstand "
      + "nicht pruefen (erwartet z. B. 027b_timesheets.sql)");
    const { lebend } = deklariert(alleDateien());
    assert.equal(lebend.get("timesheets"), "027b_timesheets.sql",
      "`timesheets` wird nicht als von 027b deklariert erkannt — das Dateimuster schliesst "
      + "Buchstaben-Zusaetze aus, wie migrate.sh es NICHT tut");
    assert.ok(lebend.has("timesheet_entries"));
  });

  it("eine Neuanlage in derselben Datei bleibt deklariert", () => {
    /* MESSFALLE 2, festgenagelt: erst alle CREATEs, dann alle DROPs zu
       verarbeiten macht aus dieser Datei eine Entfernung. */
    const { lebend, entfernt } = deklariert([{
      name: "099_neuanlage.sql",
      text: "DROP TABLE IF EXISTS kunde;\nCREATE TABLE kunde (id uuid);\n"
    }]);
    assert.equal(lebend.get("kunde"), "099_neuanlage.sql",
      "eine Neuanlage wird als Entfernung gelesen — die Aussagen werden nicht in ihrer "
      + "Reihenfolge verarbeitet");
    assert.equal(entfernt.has("kunde"), false);
  });

  it("eine echte Entfernung wird als Entfernung gelesen", () => {
    const { lebend, entfernt } = deklariert([
      { name: "010_anlegen.sql", text: "CREATE TABLE alt (id uuid);\n" },
      { name: "020_entfernen.sql", text: "DROP TABLE IF EXISTS alt;\n" }
    ]);
    assert.equal(lebend.has("alt"), false, "die entfernte Tabelle gilt weiter als deklariert");
    assert.equal(entfernt.get("alt"), "020_entfernen.sql");
  });

  it("(A) jede deklarierte Tabelle existiert im Bestand", () => {
    const { lebend } = deklariert(alleDateien());
    const fehlend = [...lebend.keys()].filter((t) => !bestand().has(t) && !DARF_FEHLEN[t])
      .map((t) => t + " (aus " + lebend.get(t) + ")").sort();
    assert.deepEqual(fehlend, [],
      "Eine Migration legt diese Tabellen an, im Bestand fehlen sie. GENAU SO sah der 059-Fall "
      + "aus: Datei da, als angewandt verbucht, Tabelle nicht da — und der Code, der sie "
      + "benutzt, wirft. Entweder ist die Migration nie wirksam geworden (dann braucht es "
      + "einen Nachtrag unter NEUER Nummer, siehe 223), oder der Schnappschuss ist veraltet "
      + "(`node scripts/schema-snapshot.js`).\n  " + fehlend.join("\n  "));
  });

  it("(B) jede Tabelle im Bestand kommt von einer Migration — oder steht mit Grund im Register", () => {
    const { lebend } = deklariert(alleDateien());
    const unerklaert = [...bestand()].filter((t) => !lebend.has(t) && !OHNE_MIGRATION[t]).sort();
    assert.deepEqual(unerklaert, [],
      "Diese Tabellen stehen in der laufenden Datenbank, aber keine Migration legt sie an. Eine "
      + "FRISCHE Installation haette sie nicht. Wenn sie ein Dienst selbst anlegt (wie der "
      + "Sitzungsspeicher), gehoert sie mit dieser Begruendung ins Register OHNE_MIGRATION; wenn "
      + "sie gebraucht wird, gehoert sie in eine Migration.\n  " + unerklaert.join("\n  "));
  });

  it("der ERKENNER meldet einen erfundenen Fall — sonst beweist (A) nichts", () => {
    /* Ohne lebenden Fall ist ein gruener Waechter eine Behauptung. Hier bekommt
       der Erkenner einen Migrationstext, der eine Tabelle deklariert, die es im
       Bestand nicht gibt — und muss sie nennen. */
    const { lebend } = deklariert(alleDateien().concat([{
      name: "999_erfunden.sql",
      text: "CREATE TABLE IF NOT EXISTS gibt_es_nicht (\n  id uuid PRIMARY KEY\n);\n"
    }]));
    const fehlend = [...lebend.keys()].filter((t) => !bestand().has(t));
    assert.deepEqual(fehlend, ["gibt_es_nicht"],
      "der Erkenner findet die erfundene Tabelle nicht (oder zusaetzlich andere): "
      + JSON.stringify(fehlend));
  });

  it("der ERKENNER meldet eine Tabelle ohne Migration — sonst beweist (B) nichts", () => {
    const { lebend } = deklariert(alleDateien());
    const erfundenerBestand = new Set([...bestand(), "kam_von_niemandem"]);
    const unerklaert = [...erfundenerBestand].filter((t) => !lebend.has(t) && !OHNE_MIGRATION[t]);
    assert.deepEqual(unerklaert, ["kam_von_niemandem"],
      "der Erkenner findet die erfundene Bestandstabelle nicht: " + JSON.stringify(unerklaert));
  });

  it("das Register verrottet nicht: was inzwischen deklariert ist, steht nicht mehr darin", () => {
    const { lebend } = deklariert(alleDateien());
    const veraltet = Object.keys(OHNE_MIGRATION).filter((t) => lebend.has(t));
    assert.deepEqual(veraltet, [],
      "Diese Tabellen stehen im Register als 'kommt von keiner Migration', werden aber "
      + "inzwischen von einer angelegt: " + veraltet.join(", ") + ". Eintrag streichen und den "
      + "Grund an seine Stelle setzen.");
    const verschwunden = Object.keys(OHNE_MIGRATION).filter((t) => !bestand().has(t));
    assert.deepEqual(verschwunden, [],
      "Diese Tabellen stehen im Register, existieren aber gar nicht mehr: "
      + verschwunden.join(", ") + ". Wer aufgeraeumt hat, streicht auch hier.");
  });

  it("das Register begruendet jeden Eintrag — eine Liste ohne Gruende ist eine Ausrede", () => {
    for (const [tabelle, grund] of Object.entries(OHNE_MIGRATION)) {
      assert.ok(typeof grund === "string" && grund.length >= 40,
        "der Eintrag " + tabelle + " hat keine tragfaehige Begruendung");
    }
    for (const [tabelle, grund] of Object.entries(DARF_FEHLEN)) {
      assert.ok(typeof grund === "string" && grund.length >= 40,
        "der Eintrag " + tabelle + " in DARF_FEHLEN hat keine tragfaehige Begruendung");
    }
  });
});
