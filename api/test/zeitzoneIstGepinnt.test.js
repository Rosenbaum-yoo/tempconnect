/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE ZEITZONE IST GEPINNT, NICHT GEERBT (U6.7a)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * BEFUND, der diese Datei nötig gemacht hat (gemessen 2026-10-01):
 *
 * Ich wollte im Partner-Riegel `CURRENT_DATE` behalten, mit der Begründung „die
 * DACH-Direktive verlangt `TZ=Europe/Berlin` im Container". Nachgemessen statt
 * geglaubt:
 *
 *   laufende Datenbank   SHOW TimeZone = Europe/Berlin                     ✔
 *   docker-compose.yml   TZ stand NUR am api-Dienst, NICHT am db
 *   sql/init.sql         nichts zur Zeitzone (80 Zeilen)
 *   alle Migrationen     keine SET timezone, kein ALTER DATABASE … timezone
 *
 * Das `Europe/Berlin` kam also vom **Host**: der Postgres-Container erbte die
 * Zone der Docker-VM. **Nichts im Repo pinnte sie.** Auf einem Hetzner-Server mit
 * UTC — dem Standard, und das Ziel für den Livegang im Dezember — liegt
 * `CURRENT_DATE` nach 22 Uhr deutscher Zeit einen Tag zurück. Der Fehler tritt
 * nur abends auf: in jedem Tagtest grün.
 *
 * REICHWEITE: 57 Vorkommen zeitzonenabhängiger SQL-Ausdrücke in 18 Dateien,
 * davon 0 mit ausdrücklicher Zone. Darunter `assignmentService` (der
 * Partner-Riegel) und `bindungSql` (ein Wahrheitsmodul).
 *
 * WAS HIER BEWACHT WIRD UND WAS NICHT. **Nicht** die Abwesenheit von
 * `CURRENT_DATE`: eine Ausnahmeliste mit 57 Einträgen wäre die Ausrede mit
 * Zahlen, die dieses Projekt zweimal ausdrücklich verworfen hat. Bewacht wird
 * die **Pinnung** — drei Schichten, jede mit eigener Begründung:
 *
 *   1. die Migration  (dauerhaft im Katalog, überlebt Neuaufsetzen)
 *   2. die Momentaufnahme (damit eine Rücknahme im Host-Tor auffällt)
 *   3. docker-compose  (Containeruhr und Log-Zeitstempel)
 *
 * Run: node --test --test-force-exit test/zeitzoneIstGepinnt.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* Aufwärts suchen UND auf Inhalt prüfen: Docker legt Mount-Ziele als leere
   Verzeichnisse an, und ein leeres Verzeichnis macht jede Prüfung lautlos grün. */
function findeWurzel(marker, mindestGroesse = 200) {
  for (const start of [__dirname, process.cwd()]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      const k = path.join(dir, marker);
      if (fs.existsSync(k) && fs.statSync(k).size > mindestGroesse) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ZONE = "Europe/Berlin";

/* ── Schicht 1+3: Migration und compose liegen im Repo-Checkout ──────────── */

const REPO = findeWurzel(path.join("sql", "migrations", "227_die_zeitzone_steht_im_katalog.sql"));
const repoSuite = REPO ? describe : describe.skip;

repoSuite("U6.7a · die Zeitzone ist im Repo festgeschrieben", () => {
  it("Migration 227 setzt die Zone dauerhaft an der Datenbank", () => {
    const text = fs.readFileSync(
      path.join(REPO, "sql", "migrations", "227_die_zeitzone_steht_im_katalog.sql"), "utf8");
    /*
     * ZWEI SCHNITTE, NICHT EINER — und der zweite hat mich eine Rückmutation
     * gekostet.
     *
     * Erster Schnitt, wie in dieser Woche schon viermal: nur den Teil nach
     * `BEGIN;` lesen, weil der Kopf die Rücknahme und Beispiel-SQL nennt.
     *
     * Zweiter Schnitt, neu: **auch die Kommentare INNERHALB des Blocks
     * entfernen.** Drei Rückmutationen (echte `ALTER DATABASE`-Anweisung
     * ersetzt · andere Zone · fester Datenbankname) blieben grün, weil
     * `ALTER DATABASE`, `Europe/Berlin` und `current_database()` **auch in
     * meinem eigenen Kommentar zwei Zeilen darüber** stehen:
     *   „-- die Dauerhaftigkeit kommt aus dem ALTER DATABASE darunter."
     * Gemessen: `ALTER DATABASE` kommt nach `BEGIN;` **zweimal** vor, einmal als
     * Anweisung und einmal als Begründung. Der Schnitt am Kopf schützt gegen den
     * Kopf, nicht gegen Kommentare im Rumpf — fünfter Fall derselben Klasse, und
     * diesmal in einer Probe, die ich ausdrücklich dagegen gebaut hatte.
     */
    const rumpf = text.slice(text.indexOf("BEGIN;"));
    const anweisungen = rumpf
      .replace(/\/\*[\s\S]*?\*\//g, " ")   // Blockkommentare
      .replace(/--[^\n]*/g, " ");          // Zeilenkommentare
    assert.ok(anweisungen.replace(/\s+/g, " ").trim().length > 50,
      "nach BEGIN stehen keine Anweisungen (nur Kommentare?)");
    /* Notbremse für den Schnitt selbst: entfernte er zu viel, wäre alles unten
       grundlos rot — entfernte er zu wenig, wären die Kommentare wieder drin. */
    assert.ok(!/die Dauerhaftigkeit kommt aus dem/.test(anweisungen),
      "der Kommentar-Schnitt greift nicht — die Zusicherungen unten lesen dann " +
      "weiter die Begründung statt der Anweisung");

    /*
     * DIE ANWEISUNG HERAUSSCHNEIDEN, dann darin prüfen — und auch das hat eine
     * Rückmutation erzwungen. Die Zusicherung „die Zone Europe/Berlin wird
     * genannt" über den ganzen Rumpf blieb grün, als ich im `ALTER DATABASE`
     * `Etc/UTC` einsetzte: `Europe/Berlin` steht nämlich zusätzlich in der
     * `SET LOCAL`-Zeile darüber. Die Zusicherung wurde also von einer ANDEREN
     * Anweisung erfüllt als der gemeinten — dieselbe Klasse, die in dieser
     * Woche schon vier Mutanten durchgelassen hat.
     */
    const dauerhaft = anweisungen.match(/ALTER DATABASE[^;]*/i);
    assert.ok(dauerhaft,
      "die Migration setzt die Zone nicht an der DATENBANK — eine Einstellung nur " +
      "für die laufende Verbindung ist mit ihr wieder weg");
    assert.match(dauerhaft[0], /SET timezone/i,
      "das ALTER DATABASE setzt keine timezone");
    assert.match(dauerhaft[0], new RegExp(ZONE.replace("/", "\\/")),
      "das ALTER DATABASE setzt eine ANDERE Zone als " + ZONE + ": " + dauerhaft[0]);
    assert.match(dauerhaft[0], /current_database\(\)/i,
      "ein fest verdrahteter Datenbankname — er kommt aus POSTGRES_DB und ist " +
      "nicht überall 'tempconnect'");

    /* Und die Sofortwirkung für die laufende Verbindung, getrennt geprüft: ohne
       sie gilt in DIESER Transaktion noch die alte Zone. */
    assert.match(anweisungen, new RegExp("SET LOCAL timezone = '" + ZONE + "'", "i"),
      "die laufende Verbindung wird nicht umgestellt");

    /* Die Rücknahme gehört in den Kopf, nicht in die Anweisungen. */
    assert.match(text.slice(0, text.indexOf("BEGIN;")), /RUECKNAHME|ROLLBACK/i,
      "der Kopf nennt keine Rücknahme");
    /* Und sie darf nicht AUSGEFÜHRT werden: ein RESET im Rumpf nähme die
       Migration im selben Atemzug zurück. */
    assert.doesNotMatch(anweisungen, /RESET\s+timezone/i,
      "der Rumpf setzt die Zone zurück, statt sie zu setzen");
  });

  it("der db-Dienst in docker-compose.yml trägt die Zone", () => {
    /*
     * Beiwerk, nicht der Riegel — aber es gehört dazu: ohne das stehen die
     * Log-Zeitstempel der Datenbank in einer anderen Zone als alles andere, und
     * wer zwei Protokolle nebeneinanderlegt, rechnet im Kopf um.
     *
     * Geprüft wird der db-BLOCK, nicht die Datei: ein `TZ` irgendwo in der Datei
     * erfüllt die Zusicherung sonst auch dann, wenn es am api-Dienst steht —
     * genau der Zustand, der den Befund erzeugt hat.
     */
    const text = fs.readFileSync(path.join(REPO, "docker-compose.yml"), "utf8");
    const zeilen = text.split(/\r?\n/);
    const anfang = zeilen.findIndex((z) => /^ {2}db:\s*$/.test(z));
    assert.ok(anfang >= 0, "der db-Dienst ist in docker-compose.yml nicht auffindbar");
    let ende = zeilen.length;
    for (let i = anfang + 1; i < zeilen.length; i++) {
      if (/^ {2}[a-zA-Z0-9_-]+:\s*$/.test(zeilen[i])) { ende = i; break; }
    }
    const block = zeilen.slice(anfang, ende).join("\n");
    assert.match(block, new RegExp("^\\s+TZ:\\s*" + ZONE + "\\s*$", "m"),
      "der db-Dienst trägt kein TZ: " + ZONE + ". Genau dieser Zustand war der " +
      "Befund — das TZ stand nur am api-Dienst, und die Datenbank erbte die Zone " +
      "des Hosts.");
  });

  it("init.sql und compose sind NICHT der Beleg — die Migration ist es", () => {
    /*
     * Diese Probe hält eine Begründung fest, nicht einen Zustand: es wäre
     * naheliegend, das TZ am Dienst für ausreichend zu halten und die Migration
     * später „aufzuräumen". Sie ist aber die einzige Schicht, die einen
     * Verbindungsweg ausserhalb von compose überlebt — pg_db_role_setting hängt
     * an der DATENBANK, nicht am Prozess.
     *
     * Wird diese Probe rot, hat jemand die Migration entfernt und sich auf die
     * Umgebungsvariable verlassen.
     */
    const mig = path.join(REPO, "sql", "migrations", "227_die_zeitzone_steht_im_katalog.sql");
    assert.ok(fs.existsSync(mig),
      "Migration 227 ist weg. Das TZ am Dienst allein genügt nicht: es gilt für " +
      "den PROZESS und ist fort, sobald der Container anders gestartet wird oder " +
      "die Anwendung auf eine Datenbank zeigt, die nicht aus diesem compose kommt.");
  });
});

/* ── Schicht 2: die Momentaufnahme, datenbankfrei ────────────────────────── */

const SCHEMA = (() => {
  for (const start of [__dirname, process.cwd()]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      for (const k of [
        path.join(dir, "test", "fixtures", "schema.json"),
        path.join(dir, "api", "test", "fixtures", "schema.json")
      ]) {
        if (fs.existsSync(k) && fs.statSync(k).size > 1000) return k;
      }
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
})();
const schemaSuite = SCHEMA ? describe : describe.skip;

schemaSuite("U6.7a · die Momentaufnahme belegt die Pinnung", () => {
  const schema = JSON.parse(fs.readFileSync(SCHEMA, "utf8"));

  it("der Abschnitt datenbank_einstellungen ist da", () => {
    /* Notbremse: fehlt der Abschnitt, wäre die Zusicherung unten über undefined
       und die Datei liefe leer grün durch. */
    assert.ok(Array.isArray(schema.datenbank_einstellungen),
      "der Abschnitt `datenbank_einstellungen` fehlt in der Momentaufnahme — " +
      "neu erzeugen mit: cd api && npm run schema:snapshot");
  });

  it("die Zone steht als Einstellung AN DER DATENBANK, nicht nur im Prozess", () => {
    const eintraege = schema.datenbank_einstellungen || [];
    assert.ok(eintraege.includes("TimeZone=" + ZONE),
      "die Datenbank trägt keine dauerhafte Zeitzone. Gefunden: " +
      JSON.stringify(eintraege) + "\n" +
      "Ohne diese Einstellung erbt sie die Zone des HOSTS, und CURRENT_DATE ist " +
      "auf einem UTC-Server nach 22 Uhr deutscher Zeit einen Tag zurück — " +
      "57 Stellen im Korpus rechnen damit.\n" +
      "Setzen: Migration 227 anwenden, danach cd api && npm run schema:snapshot.");
  });

  it("der Abschnitt ist sortiert", () => {
    const e = schema.datenbank_einstellungen || [];
    assert.deepEqual(e, [...e].sort(),
      "unsortiert — eine zweite Einstellung erzeugt sonst einen Diff ohne Inhalt");
  });
});
