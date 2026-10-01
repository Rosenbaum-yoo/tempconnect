/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EIN DOKUMENTIERTER PFLICHT-BEFEHL MUSS AUSFÜHRBAR SEIN (Punkt 13)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner-Freigabe 2026-10-01 (Punkt 13 der Entscheidungsliste).
 *
 * DER BEFUND, UND ER WAR DER ZWEITE AN DERSELBEN ZEILE.
 *
 * `CLAUDE.md` nannte unter P1-C als **Pflicht vor jedem Release**:
 *
 *   docker exec tempconnect_api sh -c "cd /app && npm run test:image"
 *
 * Ausgeführt am 2026-10-01:
 *
 *   Error: Cannot find module '/app/scripts/run-tests.js'
 *   code: 'MODULE_NOT_FOUND'
 *
 * Grund: `api/.dockerignore` schliesst `test/` **und** `scripts/` aus — im Abbild
 * liegt weder der Läufer noch die Tests. Und das ist gewollt: ein
 * Produktionsabbild soll keinen Testcode tragen.
 *
 * **Dieselbe Zeile war schon einmal falsch.** Am 2026-08-25 wurde sie korrigiert
 * — von `test:unit` auf `test:image` — mit der Begründung *„ein Gate, das nie
 * grün wird, wird übersprungen, die Zeile war damit wertlos"*. Die Korrektur
 * reparierte die **Testauswahl** und fragte nie, ob der Befehl **startet**.
 *
 * Ein Gate, das nie grün wird, ist schlimm. Eines, das gar nicht anläuft, ist
 * dasselbe eine Stufe weiter — und beide Male stand die Zeile als **Pflicht** da.
 * Zweimal dieselbe Klasse an derselben Zeile heisst: der nächste Mensch wird sie
 * ein drittes Mal falsch schreiben, wenn nichts dagegen steht.
 *
 * WAS DIESE DATEI PRÜFT, und bewusst nicht mehr: dass die **Dateien existieren**,
 * die ein dokumentierter Befehl nennt — und dass ein Pfad **im Container** nicht
 * von `.dockerignore` ausgeschlossen ist. Sie führt nichts aus; ein Testlauf, der
 * Release-Befehle startet, wäre im Tor nicht bezahlbar (`--suite=image` dauert
 * Minuten, der Abbild-Bau über zehn).
 *
 * Run: node --test --test-force-exit test/dokumentierteBefehleLaufen.test.js
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
function findeWurzel() {
  for (const start of [__dirname, process.cwd()]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      const k = path.join(dir, "CLAUDE.md");
      if (fs.existsSync(k) && fs.statSync(k).size > 2000
          && fs.existsSync(path.join(dir, "api", "package.json"))) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel();
const suite = ROOT ? describe : describe.skip;

suite("Punkt 13 · jeder dokumentierte Pflicht-Befehl ist ausführbar", () => {
  const claude = ROOT ? fs.readFileSync(path.join(ROOT, "CLAUDE.md"), "utf8") : "";

  /** Der Abschnitt P1-C, ab der Überschrift bis zur nächsten PRIO-Überschrift. */
  function p1c() {
    const i = claude.indexOf("P1-C:");
    assert.ok(i > 0, "der Abschnitt P1-C ist in CLAUDE.md nicht auffindbar — " +
      "dann prüft diese Datei nichts, und das ist ein Befund, keine Entwarnung");
    const j = claude.indexOf("**PRIO 2", i);
    return claude.slice(i, j > i ? j : i + 4000);
  }

  /* Zeilen, die als BEFEHL gemeint sind: Listenpunkte, deren Inhalt in
     Backticks steht und einen Programmnamen enthält. Prosa mit eingebettetem
     Code (`--suite=image` mitten im Satz) ist kein Befehl und wird nicht
     geprüft — sonst müsste jede Erklärung ausführbar sein. */
  function befehle(block) {
    const aus = [];
    for (const zeile of block.split(/\r?\n/)) {
      const m = zeile.match(/^\s*[-*]\s+`([^`]+)`\s*$/);
      if (!m) continue;
      const b = m[1].trim();
      if (/^(cd |sh |node |npm |docker |git )/.test(b)) aus.push(b);
    }
    return aus;
  }

  it("P1-C nennt mindestens einen Befehl — sonst läuft diese Datei leer", () => {
    const gefunden = befehle(p1c());
    assert.ok(gefunden.length >= 1,
      "in P1-C steht kein als Befehl erkennbarer Listenpunkt. Entweder ist die " +
      "Pflichtzeile verschwunden, oder das Muster trifft sie nicht mehr — beides " +
      "macht diese Prüfung wertlos, also ist beides rot.");
  });

  it("jede von einem Befehl genannte Datei existiert", () => {
    /*
     * Der Kern. `node scripts/run-tests.js` ist nur dann eine Pflicht, wenn es
     * `api/scripts/run-tests.js` gibt; `sh api/test-fresh-image.sh` nur, wenn
     * die Datei da ist. Ein Pfad, den niemand auflöst, ist eine Zusage auf Papier.
     */
    const fehlend = [];
    for (const b of befehle(p1c())) {
      /* Das Arbeitsverzeichnis, das der Befehl selbst setzt (`cd api && …`). */
      const cd = b.match(/^cd\s+([^\s&|;]+)/);
      const basis = cd ? path.join(ROOT, cd[1]) : ROOT;
      /* Dateiartige Wörter: enthalten einen Punkt und keinen Platzhalter. */
      for (const wort of b.split(/\s+/)) {
        if (!/[./]/.test(wort) || /^[-$]/.test(wort) || wort.includes("*")) continue;
        if (!/\.(js|mjs|cjs|sh|sql|json|ts)$/.test(wort)) continue;
        const kandidaten = [path.join(basis, wort), path.join(ROOT, wort)];
        if (!kandidaten.some((k) => fs.existsSync(k))) {
          fehlend.push(`${wort}  (aus: ${b})`);
        }
      }
    }
    assert.deepEqual(fehlend, [],
      "diese Datei(en) werden in P1-C genannt, existieren aber nicht:\n  " +
      fehlend.join("\n  ") +
      "\nEin dokumentierter Pflicht-Befehl, der eine fehlende Datei nennt, wirft " +
      "beim Release — genau der Befund vom 2026-10-01 (MODULE_NOT_FOUND).");
  });

  it("kein Befehl greift im Container auf etwas zu, das .dockerignore ausschliesst", () => {
    /*
     * DIE ZUSICHERUNG, DIE DEN BEFUND VON 2026-10-01 GEFANGEN HÄTTE.
     *
     * `docker exec … /app/X` kann nur laufen, wenn X im Abbild liegt. Was
     * `.dockerignore` ausschliesst, liegt nicht darin. Diese Prüfung verbindet
     * die zwei Dateien, zwischen denen der Fehler saß: die Dokumentation und die
     * Ausschlussliste. Keine von beiden war für sich falsch.
     */
    const ignore = path.join(ROOT, "api", ".dockerignore");
    assert.ok(fs.existsSync(ignore), "api/.dockerignore fehlt");
    const ausgeschlossen = fs.readFileSync(ignore, "utf8").split(/\r?\n/)
      .map((z) => z.trim())
      .filter((z) => z && !z.startsWith("#") && !z.startsWith("!"))
      .map((z) => z.replace(/\/$/, ""));

    const verstoss = [];
    for (const b of befehle(p1c())) {
      if (!/\bdocker\s+(exec|run)\b/.test(b)) continue;
      /* Was der Befehl im Container anfasst: /app/… und Pfade nach `cd /app`. */
      const pfade = [...b.matchAll(/\/app\/([A-Za-z0-9._/-]+)/g)].map((m) => m[1]);
      /* `npm run <skript>` im Container: das Skript aus api/package.json lesen
         und dessen Pfade mitprüfen — genau dort saß der Fehler, denn
         `npm run test:image` nennt `scripts/run-tests.js` nicht selbst. */
      const npmLauf = b.match(/npm\s+run\s+([A-Za-z0-9:_-]+)/);
      if (npmLauf) {
        const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "api", "package.json"), "utf8"));
        const skript = String(pkg.scripts?.[npmLauf[1]] || "");
        for (const wort of skript.split(/\s+/)) {
          if (/\.(js|mjs|cjs|sh)$/.test(wort)) pfade.push(wort);
        }
      }
      for (const p of pfade) {
        const erstesStueck = p.split("/")[0];
        if (ausgeschlossen.includes(erstesStueck) || ausgeschlossen.includes(p)) {
          verstoss.push(`${b}\n       greift auf "${p}" zu — "${erstesStueck}" steht in api/.dockerignore`);
        }
      }
    }
    assert.deepEqual(verstoss, [],
      "dokumentierte Befehle greifen im Container auf Ausgeschlossenes zu:\n  " +
      verstoss.join("\n  ") +
      "\nGenau so entstand der Befund vom 2026-10-01: `docker exec … npm run " +
      "test:image` nennt `scripts/run-tests.js` nicht selbst, das Skript in " +
      "api/package.json tut es — und `scripts/` ist ausgeschlossen. Die " +
      "Abbild-Suite gehoert auf den Host.");
  });

  it("jedes npm-Skript, das eine Datei nennt, zeigt auf eine vorhandene", () => {
    /*
     * ÜBER P1-C HINAUS, und eine Rückmutation hat gezeigt, dass es gebraucht
     * wird: ich habe `test:image` auf `scripts/weg.js` gezeigt, und dieser
     * Wächter blieb grün — weil P1-C `test:image` seit der Korrektur gar nicht
     * mehr nennt. Formal richtig, praktisch nutzlos: wer `npm run test:image`
     * tippt (die Fassung bis heute stand so in CLAUDE.md), bekommt wieder
     * MODULE_NOT_FOUND.
     *
     * Also die Skripte selbst prüfen, nicht nur die, auf die ein Dokument zeigt.
     * Das ist billig und fängt die Klasse an der Wurzel.
     */
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "api", "package.json"), "utf8"));
    const fehlend = [];
    for (const [name, befehl] of Object.entries(pkg.scripts || {})) {
      for (const wort of String(befehl).split(/\s+/)) {
        if (!/\.(js|mjs|cjs|sh)$/.test(wort) || wort.includes("*") || wort.startsWith("-")) continue;
        if (!fs.existsSync(path.join(ROOT, "api", wort)) && !fs.existsSync(path.join(ROOT, wort))) {
          fehlend.push(`${name}: ${wort}`);
        }
      }
    }
    assert.deepEqual(fehlend, [],
      "diese npm-Skripte nennen Dateien, die es nicht gibt:\n  " + fehlend.join("\n  ") +
      "\nEin Skript, das nicht startet, ist in einer Anleitung schlimmer als keins.");
  });

  it("die Pflichtzeile nennt den Host-Lauf, nicht docker exec", () => {
    /*
     * Die Entscheidung des Owners, als Zusicherung. Nicht „irgendein Befehl",
     * sondern dieser: wer die Zeile zurückdreht, bekommt wieder MODULE_NOT_FOUND
     * und erfährt es erst beim Release.
     */
    const block = p1c();
    assert.match(block, /`cd api && node scripts\/run-tests\.js --suite=image`/,
      "P1-C nennt den Host-Lauf der Abbild-Suite nicht mehr");
    const gefunden = befehle(block);
    assert.ok(!gefunden.some((b) => /docker\s+exec[\s\S]*test:image/.test(b)),
      "P1-C nennt wieder `docker exec … test:image` — das wirft MODULE_NOT_FOUND, " +
      "weil api/.dockerignore scripts/ ausschliesst");
  });

  it("der Verlust ist benannt, nicht verschwiegen", () => {
    /*
     * Der Host-Lauf prüft nicht IN der Containerumgebung. Das ist ein echter
     * Verlust gegenüber dem (nie funktionierenden) `docker exec`, und eine
     * Korrektur, die ihn verschweigt, verkauft eine Verschlechterung als Fix.
     * Dass daneben steht, was ihn auffängt, ist Teil der Entscheidung.
     */
    const block = p1c();
    /*
     * ALS BEFEHL, nicht als Erwähnung. Erster Entwurf prüfte nur
     * `/test-fresh-image\.sh/` über den ganzen Abschnitt — und blieb grün, als
     * ich den Befehls-Listenpunkt entfernte: der Name steht zusätzlich im
     * Fließtext zwei Absätze höher („beweist stattdessen …"). Wieder die Klasse
     * „die Zusicherung traf die falsche Stelle", und wieder in einer Probe, die
     * Minuten alt war.
     */
    assert.ok(befehle(block).some((b) => b.includes("test-fresh-image.sh")),
      "P1-C nennt den Abbild-Nachweis nicht als BEFEHL (nur im Fließtext, oder " +
      "gar nicht) — dann sieht der Host-Lauf wie ein vollständiger Ersatz aus, " +
      "und er ist keiner");
    assert.match(block, /nicht mehr IN der\s*\n?\s*Containerumgebung|nicht IN der Containerumgebung/,
      "der Verlust (kein Lauf in der Containerumgebung) ist nicht benannt");
  });
});
