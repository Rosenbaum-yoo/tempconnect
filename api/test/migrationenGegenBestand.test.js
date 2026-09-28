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

  /* ── Waisen zusammengefuehrter Alt-Migrationen: vier, alle LEER (gemessen ueber pg_stat_user_tables: 0 Zeilen) ── */
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

/* ════════════════════════════════════════════════════════════════════════════
   SPALTEN, die im Bestand stehen, ohne von einer Migration genannt zu werden
   ════════════════════════════════════════════════════════════════════════════
   WARUM DIESE RICHTUNG NOETIG IST: die Tabellen-Richtung allein haette den
   schwersten Befund dieser Welle NICHT gefunden. `worker_assignment_links` war
   da — drei Spalten nicht. `db/031_einsatzportal.sql` legt sie an, aber `db/`
   wird von KEINEM Pfad angewandt (`migrate.sh` liest `sql/migrations`); in der
   laufenden Datenbank standen sie, im angewandten Bestand nicht. Auf einer
   frischen Installation haette die Kraft im Einsatzportal nicht gesehen, wer ihr
   Disponent ist, und die DSGVO-Auskunft haette zu `email_verified_at`
   still geschwiegen. Nachgetragen in Migration 225.

   Eintraege hier sind Spalten, die absichtlich nicht aus einer Migration
   kommen. Schluessel ist `tabelle.spalte`. */
const SPALTEN_OHNE_MIGRATION = {
  "session.sess": "Gehoert `connect-pg-simple`: der Sitzungsspeicher legt Tabelle UND Spalten "
                + "selbst an (api/app.js, createTableIfMissing: true).",
  "session.sid": "Wie `session.sess` — Spalte des Sitzungsspeichers.",
  "staff_session.sess": "Wie `session.sess`, zweiter Speicher fuer die Staff-Sitzung.",
  "staff_session.sid": "Wie `session.sid`, zweiter Speicher fuer die Staff-Sitzung.",

  "reviews.reviewee_id": "Spalte einer WAISEN-Tabelle: 0 Zeilen, 0 Fundstellen im Produktionscode "
                       + "(gemessen 2026-09-27). Verschwindet mit der Tabelle.",
  "reviews.reviewer_id": "Spalte derselben Waise `reviews` — 0 Zeilen, kein Code.",
  "reviews.visible_at": "Spalte derselben Waise `reviews` — 0 Zeilen, kein Code.",
  "usage_counters.broadcasts_sent": "Spalte der Waise `usage_counters` — 0 Zeilen, kein Code.",
  "usage_counters.notdienst_requests_sent": "Spalte der Waise `usage_counters` — 0 Zeilen, kein Code.",
  "usage_counters.requests_sent": "Spalte der Waise `usage_counters` — 0 Zeilen, kein Code.",

  "users.company_street": "Rest eines aelteren Wegs: 0 Fundstellen im Produktionscode. Die "
                        + "Rechnungsanschrift der E-Rechnungspflicht liegt an `organizations` "
                        + "(Migration 202), nicht an `users`.",
  "users.company_zip": "Wie `users.company_street` — 0 Fundstellen, Anschrift liegt an organizations.",
  "users.company_city": "Wie `users.company_street` — 0 Fundstellen, Anschrift liegt an organizations.",
  "users.company_country": "Wie `users.company_street` — 0 Fundstellen, Anschrift liegt an organizations.",
  "users.company_vat_id": "Wie `users.company_street` — 0 Fundstellen; die Steuernummer der "
                        + "Rechnung liegt an organizations.",
  "users.company_register_court": "Wie `users.company_street` — 0 Fundstellen im Produktionscode.",
  "users.company_register_number": "Wie `users.company_street` — 0 Fundstellen im Produktionscode.",
  "capacities.external_id": "0 Fundstellen im Produktionscode (gemessen 2026-09-27) — Rest eines "
                          + "Imports, der nicht mehr existiert.",

  /* Diese sieben kamen erst zum Vorschein, als der Erkenner aufhoerte,
     KOMMENTARE mitzulesen (Messfalle 4). Sie sind aus demselben Grund geduldet
     wie ihre Nachbarn oben: Sitzungsspeicher oder Waisen-Tabelle. */
  "session.expire": "Gehoert `connect-pg-simple` — Verfallsspalte des Sitzungsspeichers "
                  + "(api/app.js, createTableIfMissing: true).",
  "staff_session.expire": "Wie `session.expire`, zweiter Speicher fuer die Staff-Sitzung.",
  "usage_counters.period": "Spalte der Waise `usage_counters` — 0 Zeilen, 0 Fundstellen im "
                         + "Produktionscode (die Treffer auf `period` betreffen andere Namen wie "
                         + "current_period_start).",
  "email_verification_tokens.consumed_at": "Spalte der Waise `email_verification_tokens` — 0 "
                                         + "Zeilen, 0 Fundstellen im Produktionscode. Faellt mit "
                                         + "der Tabelle, aber erst NACH Z10: sie ist der einzige "
                                         + "Ort, an dem die Absicht 'ausdruecklich einmalig' "
                                         + "aufgeschrieben ist."
};

/* ── Erkenner ────────────────────────────────────────────────────────────── */

/*
 * MESSFALLE 3, und der Grund, warum dieser Ausdruck Sichten kennt: der
 * Schnappschuss fuehrt in `tabellen` AUCH Sichten (er liest
 * `information_schema.columns`, und dort steht eine Sicht mit ihren Spalten wie
 * eine Tabelle). Ein Erkenner, der nur `CREATE TABLE` kennt, klagt jede Sicht
 * als undeklariert an - bei `activity_feed` ist genau das passiert, obwohl sie
 * in `025_enterprise_foundation.sql` als `CREATE OR REPLACE VIEW` steht. Der
 * Schnappschuss fuehrt die Sichten zusaetzlich in `sichten`; beides wird
 * getrennt verglichen.
 */
const AUSSAGE = new RegExp(
  "^[ \\t]*(?:CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:MATERIALIZED\\s+)?(?:TABLE|VIEW)"
  + "(?:\\s+IF\\s+NOT\\s+EXISTS)?|DROP\\s+(?:MATERIALIZED\\s+)?(?:TABLE|VIEW)"
  + "(?:\\s+IF\\s+EXISTS)?)\\s+([a-z_][a-z0-9_.]*)", "gim");

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

/* Der Schnappschuss fuehrt Sichten in `tabellen` MIT und zusaetzlich in
   `sichten`. Gemessen am 2026-09-27: 197 Tabellen + 1 Sicht = 198 Eintraege in
   `tabellen`. Wer die Zahl 198 "Tabellen" nennt, zaehlt etwas anderes, als der
   Name sagt. */
function abbild() {
  const d = JSON.parse(fs.readFileSync(ABBILD, "utf8"));
  const sichten = new Set(d.sichten || []);
  const alle = new Set(Object.keys(d.tabellen || {}));
  return {
    alle,
    sichten,
    tabellen: new Set([...alle].filter((n) => !sichten.has(n)))
  };
}
const bestand = () => abbild().alle;

/* Der Wortschatz des ANGEWANDTEN Bestands: jedes Wort, das in einer Datei
   vorkommt, die `migrate.sh` wirklich anwendet. Grundlage der Spalten-Richtung. */
let _wortschatz = null;
function wortschatzDesBestands() {
  if (_wortschatz) return _wortschatz;
  /*
   * MESSFALLE 4, und ich bin selbst hineingelaufen: der Wortschatz darf nur aus
   * AUSFUEHRBAREM SQL kommen. Der Kopf von Migration 225 dokumentiert die
   * achtzehn Spalten, die absichtlich NICHT nachgetragen werden — und schon
   * galten sie als deklariert. Meine eigene Dokumentation hat meine Erkennung
   * besiegt. Schlimmer: so liesse sich jeder Befund dieses Waechters "beheben",
   * indem man den Spaltennamen in einen Kommentar schreibt. Eine Spalte, die nur
   * in einem Kommentar steht, ist nicht deklariert.
   */
  const text = alleDateien().map((d) => ohneKommentare(d.text))
    .join(String.fromCharCode(10)).toLowerCase();
  _wortschatz = new Set(text.match(/[a-z_][a-z0-9_]*/g) || []);
  return _wortschatz;
}

/**
 * Entfernt aus SQL alles, was einen Namen NENNEN kann, ohne ihn zu DEKLARIEREN:
 * Blockkommentare, Zeilenkommentare und `COMMENT ON …`-Anweisungen.
 *
 * MESSFALLE 5, und sie kam erst durch eine Rueckmutation heraus: `COMMENT ON
 * COLUMN users.email_verified_at IS '…'` ist AUSFUEHRBARES SQL. Als die
 * Rueckmutation die zugehoerige `ADD COLUMN`-Zeile entfernte, blieb der Name im
 * Wortschatz — und der Waechter blieb gruen, obwohl die Spalte nicht mehr
 * angelegt wurde. Eine Beschreibung ist keine Deklaration.
 */
function ohneKommentare(sql) {
  return String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/COMMENT\s+ON\s[\s\S]*?;/gi, " ")
    .split(String.fromCharCode(10))
    .map((z) => {
      const i = z.indexOf("--");
      return i === -1 ? z : z.slice(0, i);
    })
    .join(String.fromCharCode(10));
}

/* SQL-Dateien mit Migrationsnamen, die ausserhalb `sql/migrations` liegen DUERFEN.
   Jeder Eintrag braucht einen Grund — heute sind es die zwei Fundstuecke, deren
   Inhalt in Migration 225 nachgetragen ist; ob sie geloescht werden, ist eine
   Aufraeum-Entscheidung des Owners. */
const AUSSERHALB_ERLAUBT = [
  "db/031_einsatzportal.sql",
  "db/migrations/030_demo_worker_seed.sql"
];

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

  it("eine SICHT gilt als deklariert — Messfalle 3", () => {
    /* `activity_feed` steht in `025_enterprise_foundation.sql` als
       `CREATE OR REPLACE VIEW`. Ein Erkenner, der nur `CREATE TABLE` kennt,
       klagt sie als undeklariert an — genau das ist beim ersten Bau passiert,
       und die falsche Begruendung waere als dauerhafte Ausnahme im Register
       gelandet. */
    const { lebend } = deklariert(alleDateien());
    const { sichten } = abbild();
    assert.ok(sichten.size >= 1,
      "der Schnappschuss fuehrt keine Sicht — dann kann diese Probe ihren Gegenstand nicht pruefen");
    for (const sicht of sichten) {
      assert.ok(lebend.has(sicht),
        "die Sicht " + sicht + " gilt als undeklariert. Sie wird mit CREATE VIEW angelegt, "
        + "nicht mit CREATE TABLE — der Erkenner muss beides lesen.");
    }
  });

  it("Tabellen und Sichten werden getrennt gezaehlt", () => {
    /* Die Zahl im Register heisst "Tabellen". Wenn sie Sichten mitzaehlt, sagt
       sie etwas anderes, als ihr Name behauptet. */
    const { alle, sichten, tabellen } = abbild();
    assert.equal(tabellen.size + sichten.size, alle.size);
    assert.ok(tabellen.size >= 180, "nur " + tabellen.size + " echte Tabellen im Abbild");
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

  it("(C) jede Spalte im Bestand kommt von einer Migration — oder steht mit Grund im Register", () => {
    /* Die Richtung, die den Disponenten-Befund gefunden hat. Grosszuegig
       gemessen: es genuegt, dass der SPALTENNAME irgendwo im angewandten Bestand
       vorkommt. Strenger zu sein hiesse, Hunderte legitime Faelle anzuklagen
       (Spalten werden in DO-Bloecken, in Umbenennungen und in Kommentaren
       genannt) — und ein Waechter, der zu viel meldet, wird abgeschaltet. */
    const worte = wortschatzDesBestands();
    const { sichten } = abbild();
    const spalten = JSON.parse(fs.readFileSync(ABBILD, "utf8")).tabellen;
    const fehlend = [];
    for (const [tab, d] of Object.entries(spalten)) {
      if (sichten.has(tab)) continue;
      for (const sp of (d.spalten || [])) {
        if (worte.has(sp)) continue;
        if (SPALTEN_OHNE_MIGRATION[tab + "." + sp]) continue;
        fehlend.push(tab + "." + sp);
      }
    }
    assert.deepEqual(fehlend.sort(), [],
      "Diese Spalten stehen in der laufenden Datenbank, aber keine angewandte Migration nennt "
      + "sie. Eine FRISCHE Installation haette sie nicht, und der Code, der sie liest, wirft "
      + "oder schweigt. Genau so entstand der Disponenten-Befund: die Datei db/031_einsatzportal.sql "
      + "legt sie an, aber `db/` wird von keinem Pfad angewandt. Entweder nachtragen (wie "
      + "Migration 225) oder mit Grund ins Register SPALTEN_OHNE_MIGRATION.\n  "
      + fehlend.join("\n  "));
  });

  it("(C) der ERKENNER meldet eine erfundene Spalte — sonst beweist (C) nichts", () => {
    const worte = wortschatzDesBestands();
    assert.equal(worte.has("spalte_die_es_nicht_gibt"), false,
      "der Wortschatz enthaelt einen erfundenen Namen — dann kann (C) nichts finden");
    assert.equal(SPALTEN_OHNE_MIGRATION["irgendwas.spalte_die_es_nicht_gibt"], undefined);
  });

  it("(C) eine Spalte, die NUR in einem Kommentar steht, gilt nicht als deklariert", () => {
    /* MESSFALLE 4, festgenagelt. Sonst liesse sich jeder Befund dieses Waechters
       "beheben", indem man den Spaltennamen in einen Kommentar schreibt — und
       genau das ist beim Bauen passiert: der Kopf von Migration 225 nennt die
       achtzehn geduldeten Spalten, und schon galten sie als deklariert. */
    const NL = String.fromCharCode(10);
    const gereinigt = ohneKommentare(
      "-- hier steht ganz_und_gar_erfunden im Zeilenkommentar" + NL
      + "/* und ebenso_erfunden im Block */" + NL
      + "CREATE TABLE echt (wirklich_da uuid);" + NL);
    assert.equal(/ganz_und_gar_erfunden/.test(gereinigt), false,
      "ein Zeilenkommentar wird mitgelesen — dann laesst sich jeder Befund durch einen "
      + "Kommentar wegdefinieren");
    assert.equal(/ebenso_erfunden/.test(gereinigt), false, "ein Blockkommentar wird mitgelesen");
    assert.ok(/wirklich_da/.test(gereinigt), "das ausfuehrbare SQL wird mitentfernt");

    /* MESSFALLE 5: `COMMENT ON` ist ausfuehrbares SQL und nennt einen Namen, ohne
       ihn zu deklarieren. Gefunden durch eine Rueckmutation, die GRUEN blieb:
       sie entfernte die ADD-COLUMN-Zeile, und der Name stand noch im COMMENT. */
    const mitBeschreibung = ohneKommentare(
      "COMMENT ON COLUMN t.nur_beschrieben IS 'eine Beschreibung';" + NL
      + "ALTER TABLE t ADD COLUMN IF NOT EXISTS echt_deklariert TEXT;" + NL);
    assert.equal(/nur_beschrieben/.test(mitBeschreibung), false,
      "eine COMMENT-ON-Anweisung laesst den Namen im Wortschatz — dann gilt eine Spalte als "
      + "deklariert, weil sie beschrieben ist");
    assert.ok(/echt_deklariert/.test(mitBeschreibung), "die Deklaration wird mitentfernt");
  });

  it("(C) das Spalten-Register verrottet nicht", () => {
    const worte = wortschatzDesBestands();
    const veraltet = Object.keys(SPALTEN_OHNE_MIGRATION)
      .filter((k) => worte.has(k.split(".")[1]));
    assert.deepEqual(veraltet, [],
      "Diese Spalten stehen im Register als 'von keiner Migration', werden aber inzwischen von "
      + "einer genannt: " + veraltet.join(", ") + ". Eintrag streichen.");
    const spalten = JSON.parse(fs.readFileSync(ABBILD, "utf8")).tabellen;
    const verschwunden = Object.keys(SPALTEN_OHNE_MIGRATION).filter((k) => {
      const [tab, sp] = k.split(".");
      return !(spalten[tab] && (spalten[tab].spalten || []).includes(sp));
    });
    assert.deepEqual(verschwunden, [],
      "Diese Spalten stehen im Register, existieren aber nicht mehr: " + verschwunden.join(", "));
  });

  it("(C) jeder Registereintrag ist begruendet", () => {
    for (const [k, grund] of Object.entries(SPALTEN_OHNE_MIGRATION)) {
      assert.ok(typeof grund === "string" && grund.length >= 40,
        "der Eintrag " + k + " hat keine tragfaehige Begruendung");
      assert.match(k, /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/,
        "der Schluessel " + k + " ist nicht tabelle.spalte");
    }
  });

  it("kein Migrations-SQL liegt ausserhalb von sql/migrations", () => {
    /* DER TRAPPEN-FAENGER. `db/031_einsatzportal.sql` und
       `db/migrations/030_demo_worker_seed.sql` sahen nach Migrationen aus, wurden
       aber von keinem Pfad angewandt — und ihre Spalten fehlten dem angewandten
       Bestand. Wer so etwas wieder ablegt, bekommt es hier gemeldet. */
    const verdaechtig = [];
    const suche = (ordner) => {
      for (const e of fs.readdirSync(ordner, { withFileTypes: true })) {
        if (["node_modules", ".git", "migrations"].includes(e.name) && ordner.endsWith("sql")) continue;
        if (["node_modules", ".git", "coverage", "dist", ".claude"].includes(e.name)) continue;
        const voll = path.join(ordner, e.name);
        if (e.isDirectory()) { suche(voll); continue; }
        if (!/^\d{3}[a-z]?_.*\.sql$/i.test(e.name)) continue;
        const rel = path.relative(WURZEL, voll).split(path.sep).join("/");
        if (rel.startsWith("sql/migrations/")) continue;
        verdaechtig.push(rel);
      }
    };
    for (const wo of ["db", "sql", "api"]) {
      const voll = path.join(WURZEL, wo);
      if (fs.existsSync(voll)) suche(voll);
    }
    assert.deepEqual(verdaechtig.sort(), AUSSERHALB_ERLAUBT.slice().sort(),
      "SQL-Dateien mit Migrationsnamen liegen ausserhalb von `sql/migrations` und werden von "
      + "`migrate.sh` NICHT angewandt. Was darin steht, fehlt jeder frischen Installation — "
      + "genau so entstand der Disponenten-Befund (Migration 225). Entweder einordnen, "
      + "entfernen, oder mit Grund in AUSSERHALB_ERLAUBT aufnehmen.\n  "
      + verdaechtig.join("\n  "));
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
