/**
 * Welle F3 — der Waechter gegen rohe UTC-Datumsschnitte.
 *
 * WARUM ES IHN GIBT
 * Welle F1 hat 33 Kalendertag-Fehler kartiert, F2 sie behoben. Ohne Waechter
 * waechst genau dasselbe nach: `.toISOString().slice(0,10)` ist die naheliegende
 * Schreibweise, sie sieht harmlos aus, und sie ist in einem DACH-Produkt fast
 * immer falsch.
 *
 * DIE URSACHE, verifiziert
 * `node-postgres` parst DATE-Spalten als LOKALE Mitternacht
 * (postgres-date/index.js:17), und der Container laeuft auf TZ=Europe/Berlin.
 * Lokale Mitternacht Berlin ist 22:00 bzw. 23:00 UTC des VORTAGS. Ein
 * UTC-Schnitt auf so einen Wert liefert deshalb GANZTAEGIG den falschen Tag —
 * nicht nur nachts, wie zunaechst vermutet.
 *
 * WAS DAS KOSTET (Beispiele aus der Kartierung)
 *   - Stundenzettel-CSV zeigt die Abrechnungswoche einen Tag zu frueh und
 *     landet so in der Lohnabrechnung
 *   - ein heute gueltiger Stundensatz wird nicht gefunden, ein gestern
 *     ausgelaufener noch angewendet
 *   - der letzte gearbeitete Tag vor der Abmeldung wird abgewiesen — nicht
 *     erfasste Arbeitsstunden
 *
 * DER RICHTIGE WEG
 *   Backend:  todayDE() / dateOnlyDE(wert)   aus api/utils/dateDE.js
 *   Frontend: TCDate.todayDE() / TCDate.isoDateDE(wert) / TCDate.mondayDE(wert)
 *             aus frontend/public/js/dateDE.js
 *
 * UEBERTRAGBAR: dieselbe Pruefung gehoert in jedes Folgeprojekt mit
 * DACH-Kalendertagen.
 *
 * Run: node --test --test-force-exit test/kalendertagDE.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/*
 * Aufwaerts suchen UND auf Inhalt pruefen. Blosse Existenz reicht nicht: Docker
 * legt Mount-Ziele als leere Verzeichnisse an, und ein leeres Verzeichnis macht
 * jede Pruefung lautlos gruen. Diese Falle ist in dieser Codebasis dreimal
 * zugeschnappt — einmal davon bei einem Waechter, den ich gerade erst dagegen
 * geschrieben hatte.
 */
function findeWurzel() {
  for (const start of [process.cwd(), __dirname]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      if (fs.existsSync(path.join(dir, "api/utils/dateDE.js"))) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel();
const vorhanden = Boolean(ROOT);
const suite = vorhanden ? describe : describe.skip;

/** Die Schreibweisen, die einen Kalendertag aus einem Zeitpunkt schneiden. */
const MUSTER = [
  /\.toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*10\s*\)/,
  /\.toISOString\(\)\s*\.\s*substring\(\s*0\s*,\s*10\s*\)/,
  /\.toISOString\(\)\s*\.\s*substr\(\s*0\s*,\s*10\s*\)/,
  /\.toISOString\(\)\s*\.\s*split\(\s*["']T["']\s*\)\s*\[\s*0\s*\]/
];

/*
 * BEWUSSTE AUSNAHMEN — jede mit Begruendung.
 *
 * Hier ist UTC richtig und gewollt. Die Liste ist absichtlich kurz und
 * namentlich: eine Ausnahme ohne Begruendung waere eine Hintertuer, durch die
 * der naechste Fehler zurueckkommt.
 */
const AUSNAHMEN = [
  { datei: "api/utils/dateDE.js",
    grund: "der Helfer selbst — er rechnet den Schnitt korrekt um" },
  { datei: "frontend/public/js/dateDE.js",
    grund: "das Browser-Gegenstueck, gleiche Begruendung" },
  { datei: "api/test/",
    grund: "Testdateien duerfen den falschen Fall absichtlich herstellen, um ihn zu pruefen" },
  { datei: "e2e/",
    grund: "End-to-End-Tests, gleiche Begruendung" }
];

function istAusgenommen(rel) {
  return AUSNAHMEN.some((a) => rel === a.datei || rel.startsWith(a.datei));
}

/*
 * GRUNDLINIE — Stand nach Welle F2 (2026-08-13).
 *
 * Diese Zahl ist KEIN Ziel, sondern eine Obergrenze. Sie umfasst die Stellen,
 * die F1 ausdruecklich als harmlos eingestuft hat: technische UTC-Buckets,
 * Zeitstempel, Idempotenz-Schluessel. Die 33 echten Kalendertag-Fehler sind in
 * F2 behoben.
 *
 * Wer sie ANHEBT, muss das im Commit begruenden. Wer Stellen behebt, senkt sie.
 */
const GRUNDLINIE = 39;

/** Sammelt Quelldateien, ohne node_modules und Build-Ausgaben. */
function dateien(unter, endungen) {
  const basis = path.join(ROOT, unter);
  if (!fs.existsSync(basis)) return [];
  const out = [];
  const lauf = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) lauf(p);
      else if (endungen.some((x) => e.name.endsWith(x))) out.push(p);
    }
  };
  lauf(basis);
  return out;
}

function fundstellen() {
  const treffer = [];
  const quellen = [
    ...dateien("api/services", [".js"]),
    ...dateien("api/routes", [".js"]),
    ...dateien("api/utils", [".js"]),
    ...dateien("api/jobs", [".js"]),
    ...dateien("frontend/public", [".js", ".html"])
  ];

  for (const datei of quellen) {
    const rel = path.relative(ROOT, datei).replace(/\\/g, "/");
    if (istAusgenommen(rel)) continue;

    const zeilen = fs.readFileSync(datei, "utf8").split("\n");
    zeilen.forEach((zeile, i) => {
      // Kommentare erklaeren das Problem oft — sie sind kein Fehler.
      const ohneKommentar = zeile.replace(/\/\/.*$/, "").replace(/\/\*[\s\S]*?\*\//g, "");
      if (MUSTER.some((m) => m.test(ohneKommentar))) {
        treffer.push(rel + ":" + (i + 1));
      }
    });
  }
  return treffer;
}

suite("Welle F3 — kein roher UTC-Schnitt auf Kalendertagen", () => {

  it("die Helfer sind da, wo sie hingehoeren", () => {
    assert.ok(fs.existsSync(path.join(ROOT, "api/utils/dateDE.js")),
      "das Backend braucht todayDE/dateOnlyDE");
    assert.ok(fs.existsSync(path.join(ROOT, "frontend/public/js/dateDE.js")),
      "das Frontend braucht sein eigenes Gegenstueck — sonst wird der Helfer je Seite kopiert");
  });

  /*
   * WARUM EINE GRUNDLINIE UND KEIN VERBOT
   *
   * Ein pauschales Verbot waere falsch: nicht jeder UTC-Schnitt ist ein Fehler.
   * Zeitstempel, Idempotenz-Schluessel und bewusst UTC-konsistente
   * Analytics-Buckets duerfen und sollen so bleiben. Die Kartierung (F1) hat
   * genau das getrennt — 33 echte Fehler, 29 Stellen belegt harmlos.
   *
   * Jede harmlose Stelle einzeln in eine Ausnahmeliste zu schreiben, wuerde
   * genau die Muellhalde erzeugen, vor der der Test unten warnt: eine Liste, die
   * niemand mehr liest und durch die der naechste echte Fehler
   * unbemerkt durchrutscht.
   *
   * Deshalb eine Zahl, die nur SINKEN darf. Das laesst die harmlosen Stellen in
   * Ruhe, faengt aber jeden neuen Schnitt — und macht sichtbar, wenn jemand die
   * Grundlinie anhebt, statt sie zu senken.
   */
  it("die Zahl roher Schnitte waechst nicht", () => {
    const treffer = fundstellen();
    assert.ok(
      treffer.length <= GRUNDLINIE,
      `Es gibt jetzt ${treffer.length} rohe UTC-Datumsschnitte, die Grundlinie ist ` +
      `${GRUNDLINIE}. Neu hinzugekommen ist mindestens einer.\n\n` +
      `In einem DACH-Produkt ist ein UTC-Schnitt auf einem Kalendertag der Vortag — ` +
      `bei Werten aus DATE-Spalten sogar ganztaegig, weil node-postgres sie als ` +
      `lokale Mitternacht liefert.\n` +
      `Richtig: todayDE()/dateOnlyDE(wert) im Backend, ` +
      `TCDate.todayDE()/TCDate.isoDateDE(wert) im Frontend.\n` +
      `Ist UTC hier ausnahmsweise gewollt (Zeitstempel, Idempotenz, bewusster ` +
      `UTC-Bucket), sag das im Code mit einem Kommentar — und hebe die Grundlinie ` +
      `NICHT an, ohne es im Commit zu begruenden.\n\n` +
      `Aktuelle Fundstellen:\n  ${treffer.join("\n  ")}`
    );
  });

  it("gesunkene Grundlinie wird nachgezogen", () => {
    /*
     * Die Gegenrichtung: wer Stellen behebt, soll die Grundlinie senken. Sonst
     * verliert sie ihre Wirkung — eine zu hohe Zahl faengt nichts mehr.
     * Toleranz von 3, damit nicht jede einzelne Behebung diesen Test rot macht.
     */
    const treffer = fundstellen();
    assert.ok(
      treffer.length >= GRUNDLINIE - 3,
      `Nur noch ${treffer.length} Fundstellen, die Grundlinie steht auf ${GRUNDLINIE}. ` +
      `Bitte GRUNDLINIE in diesem Test auf ${treffer.length} senken — eine zu hohe ` +
      `Grundlinie faengt nichts mehr.`
    );
  });

  it("jede Ausnahme traegt eine Begruendung", () => {
    // Eine Ausnahmeliste ohne Begruendungen verkommt zur Muellhalde.
    for (const a of AUSNAHMEN) {
      assert.ok(a.grund && a.grund.length > 20,
        `Ausnahme ${a.datei} hat keine tragfaehige Begruendung`);
    }
  });
});
