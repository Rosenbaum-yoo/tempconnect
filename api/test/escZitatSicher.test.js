/**
 * Jede `esc()`-Fassung escapt auch Anfuehrungszeichen (2026-09-05).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM ES DIESEN WAECHTER GIBT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Gemessen am 2026-09-05: von 78 `esc()`-Fassungen im Frontend escapten **38**
 * kein Anfuehrungszeichen. In TEXTPOSITION ist das folgenlos — `<b>` wird so
 * oder so unschaedlich. In ATTRIBUTPOSITION nicht:
 *
 *     '<a href="tel:' + esc(wert) + '">'
 *
 * Ein Wert wie `" onmouseover="…` beendet dort das Attribut und oeffnet ein
 * neues. 84 Stellen im Baum haben genau diese Form.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DREI BEFUNDE, DIE ERST DIE MESSUNG SICHTBAR GEMACHT HAT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. EINE FASSUNG HATTE ZWEI WEGE, UND DER TEST NAHM DEN SICHEREN.
 *    `catalogRenderer.js` escapte im Browser ueber `textContent` (ohne
 *    Anfuehrungszeichen) und headless ueber eine Tabelle (mit). Eine Probe
 *    laeuft in Node — sie haette die Luecke NIE betreten. Kein Test der Welt
 *    haette das gefangen; nur das Lesen beider Zweige.
 *
 * 2. EIN RUECKFALL ESCAPTE GAR NICHTS. `pricing.js` gab ohne geladenen Katalog
 *    den Rohwert zurueck — `esc()` war dort die Identitaet. Und der Rueckfall
 *    greift genau im Stoerfall.
 *
 * 3. ACHT "FASSUNGEN" WAREN WEITERLEITUNGEN an `PortalShell.esc`, das alle
 *    fuenf Zeichen escapt. Meine erste Messung hat sie als unsicher gezaehlt
 *    und daraus einen Ausnutzungspfad im Einsatzportal gemeldet, den es NICHT
 *    gibt. Deshalb loest dieser Waechter Weiterleitungen auf, statt Rumpftexte
 *    zu zaehlen.
 *
 * Run: node --test --test-force-exit test/escZitatSicher.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Pfade IMMER relativ zur Testdatei — sonst haengt das Ergebnis am
   Startverzeichnis und der Test ueberspringt sich je nach cwd lautlos. */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, "..", "..", "frontend", "public");

function* dateien(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* dateien(p);
    else if (/\.(js|html)$/.test(e.name)) yield p;
  }
}

/** Den vollen Rumpf einer Funktion ab ihrer Position — OHNE Laengenfenster. */
function rumpf(quelle, von) {
  let tiefe = 0;
  let i = quelle.indexOf("{", von);
  if (i < 0) return "";
  const start = i;
  for (; i < quelle.length; i++) {
    if (quelle[i] === "{") tiefe++;
    else if (quelle[i] === "}") { tiefe--; if (tiefe === 0) return quelle.slice(start, i + 1); }
  }
  return quelle.slice(start);
}

/** Escapt dieser Rumpf ein Anfuehrungszeichen — oder reicht er weiter? */
function beurteile(text) {
  /* Weiterleitung: der Rumpf ruft eine FREMDE esc-Funktion und baut nichts
     Eigenes. Ihre Sicherheit ist die des Ziels und wird dort geprueft. */
  if (/[A-Za-z_$][\w$.()]*\.esc\s*\(/.test(text)) return "weiterleitung";
  const doppelt = /&quot;|&#34;/.test(text);
  const einfach = /&#0*39;|&apos;/.test(text);
  return doppelt && einfach ? "sicher" : "unsicher";
}

const fassungen = [];
for (const datei of dateien(WURZEL)) {
  const q = fs.readFileSync(datei, "utf8");
  for (const m of q.matchAll(/function\s+esc\s*\(/g)) {
    fassungen.push({
      datei: path.relative(WURZEL, datei).replace(/\\/g, "/"),
      zeile: q.slice(0, m.index).split("\n").length,
      urteil: beurteile(rumpf(q, m.index))
    });
  }
}

describe("esc() — jede Fassung escapt Anfuehrungszeichen", () => {
  it("die Erhebung findet ueberhaupt Fassungen", () => {
    /* Ohne diese Probe waere der Waechter lautlos gruen, sobald sich der
       Wurzelpfad oder das Muster aendert: eine leere Menge besteht jede
       Schleife. Dieselbe Lehre wie bei allen Registern dieses Projekts. */
    assert.ok(fassungen.length >= 60,
      `nur ${fassungen.length} esc()-Fassungen gefunden — erwartet werden ueber 60. ` +
      `Wurzel: ${WURZEL}`);
  });

  it("keine Fassung laesst Anfuehrungszeichen durch", () => {
    const unsicher = fassungen.filter((f) => f.urteil === "unsicher")
      .map((f) => `${f.datei}:${f.zeile}`);
    assert.deepStrictEqual(unsicher, [],
      "Diese esc()-Fassungen escapen KEIN Anfuehrungszeichen. In Textposition ist " +
      "das folgenlos, in Attributposition ist es ein Ausbruch:\n" +
      '    \'<a href="tel:\' + esc(wert) + \'">\'   mit wert = \'" onmouseover="…\'\n  ' +
      unsicher.join("\n  "));
  });

  it("Weiterleitungen zeigen auf eine sichere Fassung", () => {
    /*
     * Die Richtung, die meine erste Messung falsch beantwortet hat. Eine
     * Weiterleitung ist nicht unsicher, weil in ihrem Rumpf kein
     * Anfuehrungszeichen steht — sie ist so sicher wie ihr Ziel. Geprueft wird
     * deshalb das ZIEL.
     */
    /*
     * AUSGEFUEHRT, NICHT GELESEN — nach einer ueberlebenden Rueckmutation.
     *
     * Die Textpruefung sah `&quot;` im Rumpf und hielt die Fassung fuer sicher.
     * Der Mutant hatte aber nur die ZEICHENKLASSE gekuerzt (`[<>&"\']` ->
     * `[<>&]`) und die Ersetzungstabelle stehen lassen: ein Eintrag, den das
     * Muster nie trifft, sieht im Text aus wie eine Absicherung.
     *
     * Genau die Verwechslung, die diese ganze Welle ausgeloest hat — eine
     * Pruefung, die einen Stellvertreter fuer die Sache haelt. Also wird die
     * Funktion gebaut und GEFAHREN.
     */
    const fahre = (quelle) => {
      const b = rumpf(quelle, quelle.indexOf("function esc"));
      /* Der Rumpf allein genuegt nicht: `catalogRenderer` benutzt `ESC_MAP` aus
         dem umgebenden Baustein, und sein Browser-Zweig braucht ein fehlendes
         `document`. Beides wird hier gestellt. */
      const map = /var ESC_MAP = \{[^}]*\};/.exec(quelle);
      // eslint-disable-next-line no-new-func
      return new Function("s",
        (map ? map[0] : "") + " var document = undefined;"
        + " return (function esc(s) " + b + ")(s);");
    };

    for (const [name, rel] of [
      ["PortalShell.esc", ["js", "workerPortal", "portalShell.js"]],
      ["TC.catalog.esc", ["js", "catalogRenderer.js"]]
    ]) {
      const fn = fahre(fs.readFileSync(path.join(WURZEL, ...rel), "utf8"));
      assert.equal(fn('a"b'), "a&quot;b",
        name + " escapt kein doppeltes Anfuehrungszeichen — daran haengen die "
        + "Weiterleitungen, die selbst nichts escapen");
      assert.equal(fn("a'b"), "a&#39;b", name + " escapt kein einfaches Anfuehrungszeichen");
      assert.equal(fn("<b>"), "&lt;b&gt;", name + " escapt keine spitzen Klammern mehr");
    }
  });

  it("die Fassung mit ZWEI Wegen liefert auf beiden dasselbe", () => {
    /*
     * Der Befund, den keine Probe haette fangen koennen: `catalogRenderer.js`
     * escapt im Browser ueber `textContent`, headless ueber eine Tabelle. Ein
     * Test laeuft in Node und nimmt IMMER den sicheren Weg.
     *
     * Geprueft wird deshalb der QUELLTEXT beider Zweige, nicht das Verhalten
     * eines davon.
     */
    const q = fs.readFileSync(path.join(WURZEL, "js", "catalogRenderer.js"), "utf8");
    const b = rumpf(q, q.indexOf("function esc"));
    const browser = b.slice(b.indexOf("typeof document"), b.indexOf("return String(s)"));
    assert.match(browser, /&quot;/,
      "der BROWSER-Zweig escapt wieder kein Anfuehrungszeichen — und der Test " +
      "nimmt den anderen, merkt also nichts");
    assert.match(browser, /&#39;/, "der Browser-Zweig escapt kein einfaches Anfuehrungszeichen");
  });

  it("ein Rueckfall escapt weniger, aber nicht NICHTS", () => {
    /*
     * `pricing.js` gab ohne geladenen Katalog den Rohwert zurueck. Ein
     * Rueckfall darf weniger koennen als der Normalweg; er darf nicht das
     * Gegenteil tun — und er greift genau dann, wenn etwas fehlt.
     */
    const q = fs.readFileSync(path.join(WURZEL, "js", "pages", "pricing.js"), "utf8");
    const b = rumpf(q, q.indexOf("function esc"));
    assert.ok(!/return String\(s == null \? "" : s\);/.test(b),
      "der Rueckfall gibt den Rohwert zurueck — `esc()` ist dann die Identitaet");
    assert.match(b, /&quot;/, "der Rueckfall escapt keine Anfuehrungszeichen");
  });
});
