/**
 * Die Kacheln der Operations-Sicht im Staff CC (M1.1 + M1.3, Erreichbarkeit).
 *
 * Zwei Kacheln, eine Frage: laeuft das noch, und kommt es an? Beide sitzen
 * unter Operations statt in eigenen Modulen — es ist dieselbe Sorge, und zwei
 * Anlaufstellen dafuer waeren eine zu viel.
 *
 * WARUM DIESE DATEI GETRENNT LIEGT
 * `betriebsTakt.test.js` und `mailEhrlich.test.js` pruefen die Dienste und
 * laufen deshalb auch im Abbild mit. Diese Datei liest `frontend/src/staff` —
 * und das liegt nicht im Container. Sie benutzt darum bewusst das REPO_ROOT-Idiom, an dem
 * `api/scripts/lib/abbildSuite.mjs` sie als "nur Host" erkennt. Zusammen in
 * einer Datei waere entweder der Dienst aus dem Abbild-Lauf gefallen oder die
 * Oberflaechen-Probe dort rot geworden.
 *
 * WAS HIER BEWACHT WIRD
 * M-L8: "verdrahtet, aber unerreichbar" zaehlt nicht als geliefert. Der Takt
 * darf noch so genau rechnen — solange niemand ihn sieht, ist er derselbe
 * stille Automatismus, gegen den er gebaut wurde.
 *
 * Die vierte Probe hat einen konkreten Anlass. Beim Einbau landete
 * `<BetriebsTaktKachel />` INNERHALB von `scc-section__header`, weil ein
 * Skript den ersten `</div>` nach dem Anker traf statt den letzten. `tsc`
 * blieb gruen — verschachteltes JSX ist gueltiges JSX. Die Kachel haette
 * zusammengequetscht in der Kopfzeile gehangen. Struktur, die nur der Blick
 * pruefen kann, wird beim naechsten Mal nicht geprueft.
 *
 * Run: node --test --test-force-exit test/betriebsTaktKachel.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODUL_REL = path.join("frontend", "src", "staff", "modules", "operations", "index.tsx");

function findeRepoRoot() {
  for (const start of [process.cwd(), __dirname]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      try {
        if (fs.statSync(path.join(dir, MODUL_REL)).size > 1000) return dir;
      } catch { /* weiter aufwaerts */ }
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const REPO_ROOT = findeRepoRoot();
const suite = REPO_ROOT ? describe : describe.skip;
const quelle = () => fs.readFileSync(path.join(REPO_ROOT, MODUL_REL), "utf8");

/**
 * Der Bereich eines JSX-Elements, von seinem oeffnenden `<div ...>` bis zum
 * zugehoerigen `</div>` — mit Zaehlung, nicht mit dem ersten Treffer. Genau
 * die fehlende Zaehlung war der Fehler, den die vierte Probe fangen soll.
 */
export function divBereich(text, ab) {
  const start = text.indexOf(ab);
  if (start < 0) return null;
  let i = start;
  let tiefe = 0;
  while (i < text.length) {
    if (text.startsWith("</div>", i)) {
      tiefe--;
      i += 6;
      if (tiefe === 0) return text.slice(start, i);
      continue;
    }
    if (text.startsWith("<div", i)) {
      tiefe++;
      i += 4;
      continue;
    }
    i++;
  }
  return null;
}

suite("M1.1 · die Kachel haengt wirklich im Operations-Modul", () => {
  it("der Datentyp kennt das Feld — sonst faellt es lautlos weg", () => {
    const s = quelle();
    assert.match(s, /interface OperationsData \{[\s\S]*?betriebs_takt\?:\s*BetriebsTakt/,
      "betriebs_takt fehlt in OperationsData");
  });

  it("das Feld wird gelesen und an die Kachel gereicht", () => {
    const s = quelle();
    assert.match(s, /const takt\s*=\s*data\?\.betriebs_takt/,
      "der Stand wird nicht aus der Antwort gelesen");
    assert.match(s, /<BetriebsTaktKachel\s+takt=\{takt\}\s*\/>/,
      "die Kachel bekommt den gelesenen Stand nicht");
  });

  it("KEIN STAND ist ein Befund, keine Entwarnung", () => {
    const s = quelle();
    const i = s.indexOf("function BetriebsTaktKachel");
    assert.ok(i > 0, "die Kachel gibt es nicht");
    const leerfall = s.slice(i, i + 1200);
    assert.match(leerfall, /if \(!takt\)/, "der Leerfall wird gar nicht behandelt");
    assert.match(leerfall, /scc-error-inline/,
      "ein fehlender Takt darf nicht wie 'alles in Ordnung' aussehen");
  });

  it("die Kachel steht NEBEN dem Kopfbereich, nicht darin", () => {
    const s = quelle();
    const kopf = divBereich(s, '<div className="scc-section__header">');
    assert.ok(kopf, "der Kopfbereich wurde nicht gefunden — Anker veraltet");
    assert.ok(!kopf.includes("BetriebsTaktKachel"),
      "die Kachel haengt IM Kopfbereich — gueltiges JSX, falsches Layout");
    assert.ok(s.includes("<BetriebsTaktKachel"),
      "die Kachel wird ueberhaupt nicht gerendert");
  });

  it("STILL bekommt den schaerfsten Ton, nicht den mildesten", () => {
    /*
     * Der Anlass des ganzen Vorhabens ist eine Automatik, die nie lief. Wenn
     * ausgerechnet dieser Zustand unauffaellig eingefaerbt wird, wiederholt
     * die Kachel den Fehler, gegen den sie gebaut wurde.
     */
    const s = quelle();
    assert.match(s, /still:\s*"critical"/, "'nie gelaufen' ist nicht der lauteste Ton");
    assert.match(s, /ok:\s*"ok"/);
  });

  it("die Zaehlung im Bereichs-Sucher stimmt (Selbstprobe)", () => {
    const text = '<div className="scc-section__header"><div>a</div></div><div>b</div>';
    const b = divBereich(text, '<div className="scc-section__header">');
    assert.equal(b, '<div className="scc-section__header"><div>a</div></div>');
    assert.ok(!b.includes(">b<"), "der Sucher hat zu weit gegriffen");
  });
});

suite("M1.3 · die Versandprotokoll-Kachel haengt daneben, nicht darin", () => {
  it("der Datentyp kennt das Feld", () => {
    const s = quelle();
    assert.match(s, /interface OperationsData \{[\s\S]*?mail_versand\?:\s*MailVersand/,
      "mail_versand fehlt in OperationsData");
  });

  it("das Feld wird gelesen und gereicht", () => {
    const s = quelle();
    assert.match(s, /const mail\s*=\s*data\?\.mail_versand/);
    assert.match(s, /<MailVersandKachel\s+mail=\{mail\}\s*\/>/);
  });

  it("NICHT LESBAR ist ein Befund, keine Entwarnung", () => {
    const s = quelle();
    const i = s.indexOf("function MailVersandKachel");
    assert.ok(i > 0, "die Kachel gibt es nicht");
    const leerfall = s.slice(i, i + 1000);
    assert.match(leerfall, /if \(!mail \|\| !mail\.verfuegbar\)/,
      "ein nicht lesbares Protokoll muss anders aussehen als ein leeres");
    assert.match(leerfall, /scc-error-inline/);
  });

  it("beide Kacheln stehen NEBEN dem Kopfbereich, nicht darin", () => {
    const s = quelle();
    const kopf = divBereich(s, '<div className="scc-section__header">');
    assert.ok(kopf, "der Kopfbereich wurde nicht gefunden — Anker veraltet");
    assert.ok(!kopf.includes("MailVersandKachel"), "die Mail-Kachel haengt IM Kopfbereich");
    assert.ok(!kopf.includes("BetriebsTaktKachel"), "die Takt-Kachel haengt IM Kopfbereich");
  });

  it("OHNE VERSANDWEG bekommt den schaerfsten Ton", () => {
    /* Ein Versand, der mangels Transport nie stattfand, ist ein
     * Konfigurationsfehler — und damit schwerer als ein abgelehnter Server.
     * Faerbt die Kachel ihn milder, wiederholt sie den Fehler leise. */
    const s = quelle();
    const i = s.indexOf("function MailVersandKachel");
    const kachel = s.slice(i, s.indexOf("export default function Operations"));
    assert.match(kachel, /x\.ohne_versandweg > 0 \? "critical"/,
      "'ohne Versandweg' muss der lauteste Zustand sein");
    assert.match(kachel, /scc-card--danger/, "und die Kennzahl ebenso");
  });
});
