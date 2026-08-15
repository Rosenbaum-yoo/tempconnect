#!/usr/bin/env node
/**
 * Verankert die Triage neu, nachdem sich Quelltext bewegt hat.
 *
 * DAS PROBLEM, DAS ES LOEST
 * `triage.json` haelt jeden der 112 Faelle zeilen- UND spaltengenau fest — anders
 * waeren mehrere Mutanten derselben Zeile nicht unterscheidbar. Der Preis: sobald
 * jemand eine Zeile einfuegt, zeigen alle Angaben darunter ins Leere. Das Gate
 * meldet dann "Ueberlebende, die die Einstufung nicht kennt" — ein Fehlalarm, und
 * ein falsch-roter Waechter wird abgeschaltet statt repariert.
 *
 * Genau das ist am 2026-08-15 passiert: die drei Produktionscode-Befunde
 * (M0-B6 bis M0-B8) haben Kommentare und einen Export ergaenzt, +9 bis +34 Zeilen.
 *
 * WIE ES ARBEITET
 * Es raet nicht und rechnet keinen pauschalen Versatz, sondern liest die
 * Verschiebung aus dem DIFF: `git diff <von>..<bis> -- <datei>` sagt zeilengenau,
 * wo etwas eingefuegt oder entfernt wurde. Daraus entsteht eine Abbildung
 * alt -> neu, die auch bei mehreren Einfuegungen an verschiedenen Stellen stimmt.
 *
 * Faellt eine Zeile der Aenderung zum Opfer (geloescht), bricht es ab: dann ist
 * der Fall inhaltlich weg und braucht eine Entscheidung, keine Verschiebung.
 *
 * Aufruf:
 *   node scripts/mutation-neuverankern.js --von HEAD~1 --bis HEAD
 *   node scripts/mutation-neuverankern.js --von HEAD~1 --bis HEAD --probe   (nur zeigen)
 *
 * Danach IMMER nachmessen — die Abbildung ist eine Behauptung, bis das Gate sie
 * bestaetigt:
 *   node scripts/mutation-welle.js <datei> && node scripts/mutation-triage.js --welle <datei>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { TRIAGE_PFAD } from "./mutation-triage.js";

const API = join(import.meta.dirname, "..");
const REPO = join(API, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}

const von = arg("von", "HEAD~1");
const bis = arg("bis", "HEAD");
const nurProbe = process.argv.includes("--probe");

/**
 * Baut aus einem Diff die Abbildung alte Zeile -> neue Zeile.
 * Rueckgabe: Map<number, number|null>  (null = die Zeile wurde geloescht)
 */
function zeilenAbbildung(datei) {
  const diff = execFileSync(
    "git",
    ["diff", "--unified=0", "--no-color", `${von}..${bis}`, "--", datei],
    { cwd: REPO, encoding: "utf8" }
  );

  const abbildung = new Map();
  let versatz = 0;
  let letzteAlt = 0;

  for (const zeile of diff.split("\n")) {
    const kopf = zeile.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (!kopf) continue;

    const altStart = Number(kopf[1]);
    const altAnzahl = kopf[2] === undefined ? 1 : Number(kopf[2]);
    const neuStart = Number(kopf[3]);
    const neuAnzahl = kopf[4] === undefined ? 1 : Number(kopf[4]);

    // Alles VOR diesem Block behaelt den bisherigen Versatz.
    for (let z = letzteAlt + 1; z < altStart; z++) abbildung.set(z, z + versatz);

    // Die geaenderten alten Zeilen selbst: sie existieren so nicht mehr.
    for (let z = altStart; z < altStart + altAnzahl; z++) abbildung.set(z, null);

    versatz += neuAnzahl - altAnzahl;
    letzteAlt = altStart + altAnzahl - 1;
    void neuStart;
  }

  // Der Rest der Datei hinter dem letzten Block.
  for (let z = letzteAlt + 1; z <= letzteAlt + 100000; z++) abbildung.set(z, z + versatz);
  return abbildung;
}

const triage = JSON.parse(readFileSync(TRIAGE_PFAD, "utf8"));
const betroffen = [...new Set(triage.faelle.map((f) => f.datei))];

const verschoben = [];
const verloren = [];

for (const datei of betroffen) {
  const abbildung = zeilenAbbildung(`api/${datei}`);
  if (abbildung.size === 0) continue;

  for (const fall of triage.faelle.filter((f) => f.datei === datei)) {
    const neu = abbildung.get(fall.zeile);
    if (neu === undefined || neu === fall.zeile) continue;
    if (neu === null) {
      verloren.push(fall);
      continue;
    }
    verschoben.push({ nr: fall.nr, datei, alt: fall.zeile, neu });
    if (!nurProbe) {
      // Den Anker an die MESSUNG einmalig sichern, bevor der Anker an den CODE
      // wandert. Ohne ihn liesse sich der Fall nie wieder dem archivierten
      // Bericht zuordnen — und genau das macht ihn nachpruefbar.
      if (fall.zeile_bericht === undefined) {
        fall.zeile_bericht = fall.zeile;
        fall.spalte_bericht = fall.spalte;
      }
      fall.zeile = neu;
    }
  }
}

if (verloren.length) {
  console.error(`\n${verloren.length} Fall/Faelle liegen auf geaenderten Zeilen — hier hilft kein Verschieben:\n`);
  for (const f of verloren) console.error(`  nr ${f.nr}  ${f.datei}:${f.zeile}  ${f.mutator}`);
  console.error(
    "\nDiese Faelle sind inhaltlich betroffen. Sie brauchen eine Entscheidung:\n" +
      "  - Gibt es die Stelle noch? Dann Zeile/Spalte aus dem neuen Bericht uebernehmen.\n" +
      "  - Ist sie weg? Dann gehoert der Fall aus der Einstufung entfernt — mit Begruendung.\n"
  );
  process.exit(1);
}

if (!verschoben.length) {
  console.log(`\nNichts zu verankern: zwischen ${von} und ${bis} hat sich keine eingestufte Zeile bewegt.\n`);
  process.exit(0);
}

console.log(`\n${verschoben.length} Fall/Faelle verschoben (${von} -> ${bis}):\n`);
const jeDatei = new Map();
for (const v of verschoben) jeDatei.set(v.datei, (jeDatei.get(v.datei) || 0) + 1);
for (const [datei, anzahl] of jeDatei) console.log(`  ${String(anzahl).padStart(3)}  ${datei}`);

if (nurProbe) {
  console.log("\n--probe: nichts geschrieben.\n");
  process.exit(0);
}

writeFileSync(TRIAGE_PFAD, JSON.stringify(triage, null, 1) + "\n");
console.log(`\ntriage.json geschrieben.

JETZT NACHMESSEN — die Abbildung ist eine Behauptung, bis das Gate sie bestaetigt:
${[...jeDatei.keys()].map((d) => `  node scripts/mutation-welle.js ${d} && node scripts/mutation-triage.js --welle ${d}`).join("\n")}
`);
