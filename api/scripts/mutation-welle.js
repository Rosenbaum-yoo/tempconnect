#!/usr/bin/env node
/**
 * Wellen-Lauf: misst EINE Datei, ohne den archivierten Bericht anzufassen.
 *
 * WARUM ES DIESES SKRIPT GIBT — ein Fehler, der hier schon passiert ist
 * `stryker.rbac.conf.json` schreibt seinen Bericht nach
 * `reports/mutation/rbac/mutation.json`. Ein schneller Einzellauf mit derselben
 * Konfiguration ueberschreibt damit den Bericht des vollen Laufs. Genau so ging
 * am 2026-08-14 der Beleg fuer eine zitierte Zahl verloren: die Zahl stand noch
 * in einer Commit-Nachricht, ihr Bericht war von einem kleinen Lauf ueberbuegelt
 * (siehe docs/qualitaet/mutation/2026-08-14-rbac/README.md).
 *
 * Dieses Skript macht denselben Fehler unmoeglich:
 *   - Es LIEST die Aggregat-Konfiguration und aendert nur, was fuer eine Welle
 *     anders sein muss. Die Liste der Testdateien wird nicht abgeschrieben,
 *     sondern uebernommen — eine Abschrift waere die naechste Quelle fuer Drift.
 *   - Es schreibt nach `reports/mutation/welle/<datei>/`, nie in das Archiv.
 *   - Es setzt `incremental: false`. Ein Zwischenstand aus einem anderen
 *     Testumfang wuerde sonst gegen etwas anderes gaten, als gerade laeuft.
 *
 * Aufruf:  node scripts/mutation-welle.js services/rbacService.js
 * Exit 0 = Lauf beendet (die Bewertung macht der Mensch: welche Mutanten leben noch?)
 * Exit 1 = Lauf abgebrochen oder Datei nicht in der Aggregat-Konfiguration
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, basename } from "node:path";
import { spawnSync } from "node:child_process";

const API = join(import.meta.dirname, "..");
const AGGREGAT = join(API, "stryker.rbac.conf.json");

const ziel = process.argv[2];
if (!ziel) {
  console.error("Aufruf: node scripts/mutation-welle.js <pfad/zur/datei.js>");
  console.error("Beispiel: node scripts/mutation-welle.js services/rbacService.js");
  process.exit(1);
}

const konfig = JSON.parse(readFileSync(AGGREGAT, "utf8"));

if (!konfig.mutate.includes(ziel)) {
  console.error(`'${ziel}' steht nicht in stryker.rbac.conf.json unter "mutate".`);
  console.error(`Bekannt sind:\n  ${konfig.mutate.join("\n  ")}`);
  process.exit(1);
}

const kurz = basename(ziel, ".js");
const berichtDir = join("reports", "mutation", "welle", kurz);
mkdirSync(join(API, berichtDir), { recursive: true });

const wellenKonfig = {
  ...konfig,
  mutate: [ziel],
  incremental: false,
  htmlReporter: { fileName: `${berichtDir}/index.html` },
  jsonReporter: { fileName: `${berichtDir}/mutation.json` },
  thresholds: { ...konfig.thresholds, break: null },
  // Ohne diese Zeile kopiert Stryker die Berichte frueherer Laeufe in seine
  // Sandbox — beim ersten Wellen-Lauf waren das 240 MB HTML/JSON, die es
  // anschliessend auch noch zu parsen versucht (sichtbare Warnung im Protokoll).
  // Reine Ausgabe-Artefakte, die kein Test liest.
  ignorePatterns: [...(konfig.ignorePatterns || []), "reports/**", ".stryker-tmp/**", "uploads/**"],
};
delete wellenKonfig.incrementalFile;

const konfigPfad = join(API, `.stryker-welle.${kurz}.conf.json`);
writeFileSync(konfigPfad, JSON.stringify(wellenKonfig, null, 2));

// Reste eines frueheren Laufs: sonst misst der Lauf gegen einen anderen Stand.
const tmp = join(API, ".stryker-tmp");
if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });

console.log(`Welle: ${ziel}`);
console.log(`Bericht: api/${berichtDir}/  (das Archiv bleibt unangetastet)`);
console.log(`Testdateien: aus der Aggregat-Konfiguration uebernommen, nicht abgeschrieben.\n`);

const lauf = spawnSync("npx", ["stryker", "run", basename(konfigPfad)], {
  cwd: API,
  stdio: "inherit",
  shell: process.platform === "win32",
});

// Ueberlebende auflisten — das ist die eigentliche Frage einer Welle.
const berichtDatei = join(API, berichtDir, "mutation.json");
if (existsSync(berichtDatei)) {
  const bericht = JSON.parse(readFileSync(berichtDatei, "utf8"));
  const ueberlebende = [];
  for (const [datei, f] of Object.entries(bericht.files)) {
    for (const m of f.mutants) {
      if (m.status === "Survived") {
        ueberlebende.push(`${datei}:${m.location.start.line}:${m.location.start.column} ${m.mutatorName}`);
      }
    }
  }
  console.log(`\n── Ueberlebende in ${ziel}: ${ueberlebende.length} ──`);
  for (const u of ueberlebende) console.log(`  ${u}`);
}

process.exit(lauf.status === null ? 1 : lauf.status);
