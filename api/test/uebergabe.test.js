/**
 * Der Waechter fuer docs/UEBERGABE.md.
 *
 * WARUM ES DIESEN TEST GIBT
 * Eine Uebergabe, die man vergessen kann, ist keine. Genau das ist die Sorte
 * Dokument, die nach drei Wochen falsch ist und dann schlimmer waere als gar
 * keines — eine neue Sitzung glaubt ihr und arbeitet auf veraltetem Stand.
 *
 * Also wird sie geprueft statt gepflegt: taucht in einem Arbeitsplan eine
 * offene Owner-Entscheidung auf, die in der Uebergabe fehlt, wird dieser Test
 * rot. Dasselbe fuer tote Verweise.
 *
 * WAS ER BEWUSST NICHT PRUEFT
 * Den Inhalt der Prosa. Ob die Zusammenfassung gut ist, entscheidet ein Mensch.
 * Geprueft wird nur, was maschinell entscheidbar ist und wo Vergessen weh tut.
 *
 * Run: node --test --test-force-exit test/uebergabe.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/*
 * Aufwaerts suchen statt feste Ebenen raten — dieselbe Korrektur, die in
 * Mutation-Welle 3 noetig war, weil Stryker in einem Sandbox-Verzeichnis laeuft.
 */
function findeWurzel(relPfad) {
  for (const start of [process.cwd(), __dirname]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      if (fs.existsSync(path.join(dir, relPfad))) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const UEBERGABE_REL = "docs/UEBERGABE.md";
const ROOT = findeWurzel(UEBERGABE_REL);
const vorhanden = Boolean(ROOT);
const text = vorhanden ? fs.readFileSync(path.join(ROOT, UEBERGABE_REL), "utf8") : "";

const suite = vorhanden ? describe : describe.skip;

/** Alle Markdown-Arbeitsplaene, die Owner-Entscheidungen tragen koennen. */
function planDateien() {
  const dir = path.join(ROOT, "docs", "features");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => path.join(dir, f));
}

suite("Die Uebergabe wird geprueft, nicht geglaubt", () => {

  it("existiert und ist keine leere Huelle", () => {
    assert.ok(text.length > 2000,
      "eine Uebergabe unter 2000 Zeichen kann den Stand nicht tragen");
    assert.match(text, /## Offene Owner-Entscheidungen/);
  });

  it("nennt jede offene Owner-Entscheidung aus den Arbeitsplaenen", () => {
    /*
     * Kennungen wie D-E3, E-E1, D-M1. Als "offen" gilt eine, die NICHT in
     * derselben Zeile als entschieden markiert ist. Wer eine neue Entscheidung
     * in einen Plan schreibt und die Uebergabe vergisst, faellt hier auf.
     */
    const offen = new Set();
    for (const datei of planDateien()) {
      const inhalt = fs.readFileSync(datei, "utf8");
      for (const zeile of inhalt.split("\n")) {
        const treffer = zeile.match(/\b([A-Z]-[A-Z]\d+)\b/g);
        if (!treffer) continue;
        /*
         * Nur ERKLAERUNGEN zaehlen, keine blossen Verweise im Fliesstext
         * ("siehe C-E1", "widerspricht A-E1"). Eine Erklaerung ist entweder eine
         * Zeile, die das Wort Entscheidung traegt, oder eine Tabellenzeile, die
         * mit der Kennung beginnt.
         */
        const istErklaerung = /entscheidung/i.test(zeile) || /^\|\s*\*{0,2}[A-Z]-[A-Z]\d+/.test(zeile);
        if (!istErklaerung) continue;

        // Verweise sind keine Erklaerungen: "samt Owner-Entscheidung A-E1",
        // "siehe C-E1". Wer eine Entscheidung ERKLAERT, verweist nicht auf sie.
        if (/\b(samt|siehe|vgl\.|gemäss|gemäß|laut|analog zu)\s+[^.]{0,40}[A-Z]-[A-Z]\d+/i.test(zeile)) continue;

        // Als entschieden gilt auch "steht (ja)" / "ist entschieden" in Prosa.
        if (/entschieden|✅|erledigt|umgesetzt|steht\s*\(/i.test(zeile)) continue;
        for (const k of treffer) offen.add(k);
      }
    }

    const fehlend = [...offen].filter((k) => !text.includes(k));
    assert.deepEqual(fehlend, [],
      `diese offenen Entscheidungen stehen in einem Plan, aber nicht in der Uebergabe: ` +
      `${fehlend.join(", ")}. Eine neue Sitzung wuerde sie nicht sehen.`);
  });

  it("verweist nur auf Dateien, die es wirklich gibt", () => {
    // Tote Verweise sind schlimmer als fehlende: sie sehen aus wie eine Quelle.
    const links = [...text.matchAll(/\]\(([^)#][^)]*)\)/g)].map((m) => m[1]);
    const tot = [];
    for (const link of links) {
      if (/^https?:/.test(link)) continue;
      const ziel = path.resolve(path.join(ROOT, "docs"), link);
      if (!fs.existsSync(ziel)) tot.push(link);
    }
    assert.deepEqual(tot, [], `tote Verweise in der Uebergabe: ${tot.join(", ")}`);
  });

  it("haelt die eisernen Regeln fest, deren Verstoss echten Schaden macht", () => {
    /*
     * Diese vier sind nicht verhandelbar und stehen deshalb hier namentlich.
     * `git add -A` wuerde ungetrackte Geschaeftsunterlagen aus dem Baum
     * mitcommitten; ohne Co-Author-Zeile fehlt die Zuordnung; ein stiller Skip
     * macht die gruene Suite zur Luege.
     */
    for (const [regel, muster] of [
      ["kein git add -A",        /git add -A/],
      ["Commit nur auf Zuruf",   /nur auf Zuruf|ausdrueckliche Freigabe|ausdrücklich/i],
      ["Co-Author-Zeile",        /Co-Authored-By: Claude/],
      ["kein stiller Skip",      /stiller Skip|still.{0,12}(uebersprungen|übersprungen)/i]
    ]) {
      assert.match(text, muster, `die Uebergabe nennt die Regel "${regel}" nicht mehr`);
    }
  });

  it("nennt den offiziellen Testbefehl", () => {
    assert.match(text, /scripts\/run-tests\.js/,
      "ohne den Befehl weiss eine neue Sitzung nicht, was 'gruen' ueberhaupt heisst");
  });

  it("weist darauf hin, dass die Arbeitsplaene teils gitignored sind", () => {
    // Sonst sucht eine neue Sitzung auf einem frischen Klon vergeblich.
    assert.match(text, /gitignored/i);
  });
});
