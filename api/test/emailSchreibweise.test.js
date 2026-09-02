/**
 * Eine Adresse ist eine Adresse (M2.2).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DER BEFUND, GEMESSEN AM 2026-09-02
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `users_email_key` ist ein gewoehnlicher UNIQUE-Index auf `email` — also
 * gross-/kleinschreibungsempfindlich. Daneben standen DREI Konventionen in
 * fuenf Dateien:
 *
 *   scimService.js:118       LOWER(email) = $1            richtig
 *   ssoService.js:178        email = $1, Wert kleingeschrieben   halb
 *   authService.js:10/72/78  email = $1                   gar nicht
 *   routes/demo.js:48        email = $1                   gar nicht
 *
 * Daraus folgten drei Symptome:
 *
 *   1. Registrierung mit anderer Schreibweise -> ZWEITES Konto
 *      (`emailExists` fand nichts, der Index liess es durch)
 *   2. Anmeldung mit anderer Schreibweise -> "Zugangsdaten falsch",
 *      obwohl das Konto existiert
 *   3. Passwort zuruecksetzen -> derselbe stille Fehlschlag
 *
 * Gemessen: 404 Konten, 404 verschiedene Adressen nach Kleinschreibung — also
 * heute kein Doppel. Aber ZEHN Adressen tragen Grossbuchstaben; das Risiko
 * war scharf, nicht theoretisch.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM DIESE PROBE DEN GANZEN BESTAND LIEST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der Fehler ist nicht eine falsche Zeile, sondern eine FEHLENDE KONVENTION.
 * Drei Fassungen nebeneinander sind entstanden, weil jede fuer sich plausibel
 * aussah. Eine Probe, die nur die drei bekannten Stellen prueft, laesst die
 * vierte durch — deshalb liest sie jede Produktionsdatei.
 *
 * Run: node --test --test-force-exit test/emailSchreibweise.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(__dirname, "..");

/** Produktionscode, ohne Tests und ohne die Zwischenspeicher von Stryker. */
function produktionsDateien() {
  const raus = [];
  for (const ordner of ["services", "routes", "middleware", "utils", "config", "workers"]) {
    const dir = path.join(API, ordner);
    if (!fs.existsSync(dir)) continue;
    for (const e of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
      if (!e.isFile() || !e.name.endsWith(".js")) continue;
      const p = path.join(e.parentPath || e.path || dir, e.name);
      raus.push(p);
    }
  }
  return raus;
}

/** SQL-Text ohne Kommentare — sonst erfuellt eine Erklaerung die Probe. */
function ohneKommentare(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Vergleiche auf der Nutzer-Adresse, die NICHT beidseitig kleinschreiben.
 *
 * Gesucht wird `email = $n` bzw. `x.email = $n` ohne ein LOWER davor. Der
 * Spaltenname `email` allein genuegt als Anker: `referred_email`,
 * `contact_email` und `channel_email` tragen ein Praefix und werden vom
 * Wortanfang ausgeschlossen.
 */
export function empfindlicheVergleiche(text) {
  const s = ohneKommentare(text);
  const raus = [];
  const muster = /(?<![_A-Za-z])(?:[A-Za-z_]+\.)?email\s*=\s*\$\d/g;
  for (const m of s.matchAll(muster)) {
    const davor = s.slice(Math.max(0, m.index - 40), m.index);
    if (/LOWER\s*\(\s*$/i.test(davor)) continue;       // LOWER(email) = ...
    if (/LOWER\s*\([A-Za-z_.]*$/i.test(davor)) continue;
    /*
     * NUR Vergleiche, keine ZUWEISUNGEN. `UPDATE users SET email = $2` in
     * dataGovernanceService.js (Anonymisierung) sieht dem Vergleich zum
     * Verwechseln aehnlich und ist das Gegenteil davon — die erste Fassung
     * dieser Probe meldete ihn als Befund. Ein Waechter mit Fehlalarmen wird
     * abgeschaltet, also wird hier auf das vorangehende Schluesselwort
     * geprueft: ein Vergleich steht hinter WHERE, AND oder OR.
     */
    /*
     * Die Wortgrenze steht hier als Zeichenklasse, NICHT als Backslash-b.
     * Grund: dieselbe Stelle hat es in dieser Sitzung dreimal zerlegt — auf
     * dem Weg durch die Werkzeugkette wird aus den zwei Zeichen ein echtes
     * RUECKTASTE-Zeichen, und der Ausdruck trifft dann nie. Einmal ist das
     * unbemerkt geblieben, weil die Probe eine Verneinung war und gruen
     * aussah. Was man nicht schreiben kann, ohne es zu zerbrechen, schreibt
     * man anders.
     */
    if (!/(?:^|[^A-Za-z])(?:WHERE|AND|OR)\s*$/i.test(davor)) continue;
    raus.push(m[0]);
  }
  return raus;
}

describe("M2.2 · EINE Konvention fuer die Adresse", () => {
  it("kein Produktionscode vergleicht die Adresse schreibweisen-empfindlich", () => {
    const befunde = [];
    for (const p of produktionsDateien()) {
      const treffer = empfindlicheVergleiche(fs.readFileSync(p, "utf8"));
      for (const t of treffer) {
        befunde.push(`  ${path.relative(API, p).replace(/\\/g, "/")}: ${t}`);
      }
    }
    assert.equal(befunde.length, 0,
      `${befunde.length} Vergleich(e) ohne LOWER auf beiden Seiten. Bei einem Konto `
      + `mit Grossbuchstaben trifft die Abfrage dann nicht — und beim Anlegen entsteht `
      + `ein zweites Konto:\n${befunde.join("\n")}`);
  });

  it("die Probe wuerde einen empfindlichen Vergleich bemerken (Gegenprobe)", () => {
    assert.deepEqual(
      empfindlicheVergleiche('pool.query("SELECT 1 FROM users WHERE email=$1", [e])'),
      ["email=$1"]);
    assert.deepEqual(
      empfindlicheVergleiche('pool.query("SELECT id FROM x WHERE u.email = $2", [e])'),
      ["u.email = $2"]);
  });

  it("und laesst die richtige Fassung durch (Gegenprobe)", () => {
    assert.deepEqual(
      empfindlicheVergleiche('"SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)"'), []);
    assert.deepEqual(
      empfindlicheVergleiche('"SELECT id FROM x WHERE LOWER(u.email) = LOWER($1)"'), []);
  });

  it("und haelt eine ZUWEISUNG nicht fuer einen Vergleich (Gegenprobe)", () => {
    /* Die Anonymisierung SETZT die Adresse — genau umgekehrt. Die erste
     * Fassung dieser Probe hat sie gemeldet. */
    assert.deepEqual(
      empfindlicheVergleiche('"UPDATE users SET email = $2, phone = NULL WHERE id = $1"'), []);
  });

  it("und verwechselt keine anderen Spalten damit (Gegenprobe)", () => {
    /* referred_email, contact_email und channel_email sind andere Spalten mit
     * anderer Bedeutung — eine Probe, die sie mitfaengt, wird abgeschaltet. */
    for (const q of ['"WHERE referred_email = $2"',
                     '"SET contact_email=$2"',
                     '"channel_email = $4"']) {
      assert.deepEqual(empfindlicheVergleiche(q), [], `Fehlalarm auf ${q}`);
    }
  });

  it("die Probe liest ueberhaupt Dateien (Selbstprobe)", () => {
    const dateien = produktionsDateien();
    assert.ok(dateien.length > 100, `nur ${dateien.length} Produktionsdateien gefunden`);
    const auth = dateien.find((p) => p.endsWith("authService.js"));
    assert.ok(auth, "authService.js wurde nicht gelesen — die Probe liest am Code vorbei");
  });
});

describe("M2.2 · die Datenbank garantiert es, nicht nur der Code", () => {
  const sqlRoh = () => fs.readFileSync(
    path.join(API, "..", "sql", "migrations", "215_email_ohne_schreibweise.sql"), "utf8");
  const sql = () => sqlRoh().replace(/--.*$/gm, "");

  it("ein UNIQUE-Index auf LOWER(email) macht das zweite Konto unmoeglich", () => {
    assert.match(sql(), /CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uk\s*\n?\s*ON users \(LOWER\(email\)\)/);
  });

  it("die Migration sagt VORHER, welche Doppel im Weg stehen", () => {
    /* Ohne den Block waere die Meldung ein nacktes "could not create unique
     * index" — ein Migrationsfehler, den niemand einordnen kann, wird
     * uebersprungen; einer mit Namen wird behoben. */
    assert.match(sql(), /RAISE EXCEPTION/);
    assert.match(sql(), /GROUP BY LOWER\(email\) HAVING COUNT\(\*\) > 1/);
  });

  it("der strengere alte Index bleibt stehen", () => {
    assert.ok(!/DROP INDEX[^;]*users_email_key/.test(sql()),
      "users_email_key ist strenger, nicht falsch — und ein ON CONFLICT (email) koennte daran haengen");
  });

  it("und es gibt einen Rueckbauweg", () => {
    assert.match(sqlRoh(), /-- ROLLBACK/);
    assert.match(sqlRoh(), /DROP INDEX IF EXISTS users_email_lower_uk/);
  });
});

describe("M2.2 · an der Eingangsgrenze entsteht nichts Neues", () => {
  it("die Registrierung schreibt die Adresse klein", () => {
    const s = ohneKommentare(fs.readFileSync(path.join(API, "routes", "auth.js"), "utf8"));
    assert.match(s, /email: z\.string\(\)\.email\(\)\.max\(254\)\.transform\(/,
      "ohne Normalisierung entstehen weiter Adressen mit Grossbuchstaben");
    assert.match(s, /toLowerCase\(\)/);
  });
});
