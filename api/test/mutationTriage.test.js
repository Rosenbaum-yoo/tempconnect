/**
 * Mutation-Triage — haelt die Einstufung der ueberlebenden Mutanten und das
 * Dokument, das sie zusammenfasst, gegen den Prüfbericht.
 *
 * WARUM DIESER TEST EXISTIERT
 * Der Bericht vom 2026-08-14 nennt 112 Ueberlebende. Welle M0 hat jeden einzelnen
 * eingestuft (A/B/C). Beides sind Dateien — und Dateien veralten still. Genau das
 * ist hier schon einmal passiert: eine Mutation-Zahl stand nur in einer
 * Commit-Nachricht, ihr Bericht war ueberschrieben, und niemand konnte sie
 * nachrechnen (siehe README.md dieses Verzeichnisses).
 *
 * Deshalb prueft dieser Test drei Dinge, die von Hand nicht dauerhaft stimmen:
 *
 *   1. VOLLSTAENDIGKEIT — jeder Fall des Berichts traegt eine Kategorie, jede
 *      Kategorie gehoert zu einem Fall des Berichts, und die Zuordnung sitzt
 *      positionsgenau (Datei+Zeile ist KEIN Schluessel: mehrere Mutanten teilen
 *      sich dieselbe Zeile).
 *   2. DAS DOKUMENT — die Zahlen in TRIAGE.md sind aus der Einstufung gerechnet,
 *      nicht getippt. Weicht eine ab, ist das Dokument falsch, nicht der Test.
 *   3. DER BEFUND ZUM CI-JOB — TRIAGE.md behauptet, der naechtliche Lauf wuerde an
 *      `timeout-minutes: 90` scheitern. Aendert jemand den Wert, wird der Befund
 *      unwahr; dann muss dieser Test rot werden, damit die Doku nachzieht.
 *
 * Pfadaufloesung ueber `import.meta.url`, nie ueber `process.cwd()` — sonst
 * ueberspringt sich der Test je nach Startverzeichnis lautlos (CLAUDE.md §0.9).
 *
 * Run: node --test --test-force-exit test/mutationTriage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { lade, pruefeTriage, werteAus, ERGEBNIS_PFAD, TRIAGE_PFAD, TRIAGE_MD_PFAD } from "../scripts/mutation-triage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..", "..");
const WORKFLOW_PFAD = path.join(REPO, ".github", "workflows", "mutation.yml");

const ergebnis = lade(ERGEBNIS_PFAD);
const triage = lade(TRIAGE_PFAD);
const md = fs.readFileSync(TRIAGE_MD_PFAD, "utf8");

/** Markdown-Tabellenzeile in saubere Zellen zerlegen (ohne **, `` und Leerraum). */
function zellen(zeile) {
  return zeile
    .split("|")
    .slice(1, -1)
    .map((z) => z.replace(/\*\*/g, "").replace(/`/g, "").trim());
}

function tabellenzeilen() {
  return md.split("\n").filter((z) => z.trim().startsWith("|") && z.trim().endsWith("|"));
}

describe("Mutation-Triage — Vollstaendigkeit", () => {
  it("stuft jeden der Ueberlebenden ein, positionsgenau zum Bericht", () => {
    const verstoesse = pruefeTriage(ergebnis, triage);
    assert.deepEqual(
      verstoesse,
      [],
      `Einstufung und Bericht passen nicht zusammen:\n  - ${verstoesse.join("\n  - ")}`
    );
  });

  it("der Bericht ist in sich schluessig — Einzelzahlen ergeben die Gesamtzahl", () => {
    const summe = Object.values(ergebnis.dateien).reduce((n, d) => n + d.ueberlebt, 0);
    assert.equal(summe, ergebnis.gesamt.ueberlebt, "Summe der Dateien != gesamt.ueberlebt");
    assert.equal(
      ergebnis.ueberlebende.length,
      ergebnis.gesamt.ueberlebt,
      "Die Liste der Ueberlebenden ist unvollstaendig gegenueber der Gesamtzahl"
    );
  });

  it("jeder A-Fall benennt den Test, der ihn toetet", () => {
    const ohne = triage.faelle.filter((f) => f.kategorie === "A" && !f.kill_durch);
    assert.deepEqual(
      ohne.map((f) => f.nr),
      [],
      "A-Faelle ohne kill_durch sind ein Vorsatz, kein Plan"
    );
  });

  it("kein Fall traegt zwei Kategorien und keine Kategorie ist erfunden", () => {
    const nrs = triage.faelle.map((f) => f.nr);
    assert.equal(new Set(nrs).size, nrs.length, "nr doppelt vergeben");
    for (const f of triage.faelle) {
      assert.ok(["A", "B", "C"].includes(f.kategorie), `Fall ${f.nr}: Kategorie '${f.kategorie}'`);
    }
  });
});

describe("Mutation-Triage — TRIAGE.md ist gerechnet, nicht getippt", () => {
  const a = werteAus(ergebnis, triage);

  it("die Gesamtzahlen im Dokument stimmen mit der Einstufung ueberein", () => {
    const zeile = (k) => tabellenzeilen().find((z) => zellen(z)[0] === k);
    for (const [kat, erwartet] of [
      ["A", a.summe.A],
      ["B", a.summe.B],
      ["C", a.summe.C],
    ]) {
      const z = zeile(kat);
      assert.ok(z, `TRIAGE.md: keine Zeile fuer Kategorie ${kat} gefunden`);
      assert.equal(
        Number(zellen(z)[1]),
        erwartet,
        `TRIAGE.md nennt fuer ${kat} eine andere Zahl als die Einstufung (${erwartet})`
      );
    }
  });

  it("die Tabelle je Datei stimmt Zelle fuer Zelle", () => {
    const bekannt = new Map(a.dateien.map((d) => [d.datei, d]));
    let gefunden = 0;

    for (const zeile of tabellenzeilen()) {
      const c = zellen(zeile);
      // Wellen-Tabelle: | Welle | Datei | Score | ueberlebt | A | davon hoch | B | C |
      if (c.length !== 8 || !bekannt.has(c[1])) continue;
      const d = bekannt.get(c[1]);
      gefunden++;
      assert.equal(Number(c[3]), d.gesamt, `${d.datei}: Ueberlebende im Dokument falsch`);
      assert.equal(Number(c[4]), d.A, `${d.datei}: A im Dokument falsch`);
      assert.equal(Number(c[5]), d.A_hoch, `${d.datei}: 'davon hoch' im Dokument falsch`);
      assert.equal(Number(c[6]), d.B, `${d.datei}: B im Dokument falsch`);
      assert.equal(Number(c[7]), d.C, `${d.datei}: C im Dokument falsch`);
      // Zahlenvergleich, nicht Textvergleich: das Dokument schreibt deutsch und
      // zweistellig ("82,20 %"), der Bericht speichert 82.2. Gleicher Wert.
      assert.equal(
        Number(c[2].replace(",", ".").replace("%", "").trim()),
        d.score,
        `${d.datei}: Score im Dokument weicht vom Bericht ab`
      );
    }

    assert.equal(gefunden, a.dateien.length, "Nicht jede Datei des Berichts steht in der Tabelle");
  });

  it("die Wellen-Reihenfolge im Dokument folgt den A-Faellen", () => {
    const ausMd = [];
    for (const zeile of tabellenzeilen()) {
      const c = zellen(zeile);
      if (c.length === 8 && /^M\d+$/.test(c[0])) ausMd.push({ welle: c[0], datei: c[1] });
    }
    assert.deepEqual(
      ausMd.map((x) => x.datei),
      a.reihenfolge,
      "TRIAGE.md ordnet die Wellen anders, als die A-Faelle es vorgeben"
    );
    assert.deepEqual(
      ausMd.map((x) => x.welle),
      a.reihenfolge.map((_, i) => `M${i + 1}`),
      "Die Wellen sind nicht luecklos von M1 aufwaerts nummeriert"
    );
  });

  it("eine Datei ohne A-Faelle bekommt keine Welle", () => {
    const ohneA = a.dateien.filter((d) => d.A === 0).map((d) => d.datei);
    for (const datei of ohneA) {
      assert.ok(!a.reihenfolge.includes(datei), `${datei} hat 0 A-Faelle und darf keine Welle tragen`);
    }
  });
});

describe("Mutation-Triage — der Befund zum naechtlichen Lauf bleibt wahr", () => {
  it("der Workflow existiert weiterhin an der genannten Stelle", () => {
    assert.ok(
      fs.existsSync(WORKFLOW_PFAD),
      "TRIAGE.md verweist auf .github/workflows/mutation.yml — die Datei fehlt jetzt"
    );
  });

  it("die im Dokument genannte Zeitgrenze steht so im Workflow", () => {
    const yml = fs.readFileSync(WORKFLOW_PFAD, "utf8");
    const treffer = yml.match(/timeout-minutes:\s*(\d+)/);
    assert.ok(treffer, "mutation.yml hat keine timeout-minutes mehr");

    const imDokument = md.match(/timeout-minutes:\s*(\d+)/);
    assert.ok(imDokument, "TRIAGE.md nennt keine Zeitgrenze mehr");

    assert.equal(
      treffer[1],
      imDokument[1],
      "Die Zeitgrenze im Workflow wurde geaendert. Befund M0-B2 in TRIAGE.md nachziehen — " +
        "der gemessene Lauf dauerte 1 h 49 min; erst ab diesem Wert ist der Befund erledigt."
    );
  });
});
