/**
 * Der Waechter fuer tote CSS-Klassen im Staff Control Center.
 *
 * WARUM ES IHN GIBT
 * Am 2026-09-02 wurde die Betriebstakt-Kachel gebaut. Sie benutzte
 * `scc-kpi-grid`, `scc-kpi__value`, `scc-kpi__label`, `scc-kpi--warn`,
 * `scc-kpi--danger`, `scc-card__title` und `scc-badge--danger`. Keine einzige
 * dieser sieben Klassen steht in irgendeiner CSS-Datei des Staff CC.
 *
 * `tsc --noEmit` war gruen. Es MUSSTE gruen sein: `className` ist ein freier
 * String, und ein Tippfehler darin ist fuer den Typpruefer nicht von einer
 * absichtlichen Klasse zu unterscheiden. Die Kachel waere als unformatierter
 * Textblock erschienen — kein Fehler, keine Meldung, nur falsch.
 *
 * Das ist dieselbe Fehlerklasse, gegen die in diesem Repo schon mehrere
 * Waechter stehen: ES SCHEITERT LEISE. Ein toter Verweis, ein Filter, der nie
 * trifft, ein Endpunkt, den niemand ruft — und hier eben eine Klasse, die es
 * nicht gibt. Der Unterschied zwischen "sieht gut aus" und "ist verdrahtet"
 * ist genau das, was ein Waechter misst und ein Blick nicht.
 *
 * WAS GEPRUEFT WIRD
 *   1. Jede feste Klasse in einem className hat eine Regel im Stylesheet.
 *   2. Jede zusammengesetzte Klasse (`scc-status--${ton}`) hat mindestens
 *      eine Regel ihrer Familie — sonst fehlt die Familie als Ganzes.
 *   3. Der Waechter beweist sich selbst: er findet bekannte Klassen, und er
 *      wird an einer erfundenen rot (Gegenprobe).
 *
 * Nur `className` wird gelesen — nicht `id`, nicht `aria-labelledby`, nicht
 * `var(--scc-danger)`. Ein erster, groberer Anlauf las alles, was mit `scc-`
 * beginnt, und meldete 25 Verletzungen, von denen 25 keine waren. Ein Waechter
 * mit Fehlalarmen wird abgeschaltet; deshalb liest dieser eng.
 *
 * Kein DB-Zugriff, laeuft in unter einer Sekunde.
 *
 * Run: node --test --test-force-exit test/sccKlassen.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/*
 * Aufwaerts suchen und auf INHALT pruefen, nicht auf blosse Existenz — die
 * Falle aus frontendVerdrahtung.test.js: Docker legt Bind-Mount-Ziele auf dem
 * Host als leere Verzeichnisse an. Ein leeres `frontend/src/staff` wuerde
 * diesen Waechter gruen machen, ohne dass er etwas geprueft haette.
 */
const STAFF_REL = path.join("frontend", "src", "staff");

function hatStylesheet(wurzel) {
  try {
    return fs.statSync(path.join(wurzel, STAFF_REL, "styles", "scc.css")).size > 1000;
  } catch { return false; }
}

/*
 * REPO_ROOT statt nur `api/` — und das ist hier kein Stilfrage, sondern
 * bestimmt, WO der Test laeuft. `api/scripts/lib/abbildSuite.mjs` ordnet eine
 * Testdatei am Aufstieg ueber `api/` hinaus als "nur Host" ein; das Abbild
 * enthaelt `frontend/src` naemlich nicht. Ohne ein erkanntes Idiom liefe diese
 * Datei im Container mit — und wuerde dort still ueberspringen. Ein Waechter,
 * der still uebersprungen wird, ist keiner.
 */
function findeRepoRoot() {
  for (const start of [process.cwd(), __dirname]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      if (hatStylesheet(dir)) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const REPO_ROOT = findeRepoRoot();
const STAFF = REPO_ROOT ? path.join(REPO_ROOT, STAFF_REL) : null;
const suite = STAFF ? describe : describe.skip;

function dateien(dir, endungen, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) dateien(p, endungen, out);
    else if (endungen.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

/** Alle Klassen, fuer die es eine Regel gibt. Kommentare zaehlen nicht. */
export function definierteKlassen(cssTexte) {
  const raus = new Set();
  for (const roh of cssTexte) {
    const text = roh.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of text.matchAll(/\.(scc-[A-Za-z0-9_-]+)/g)) raus.add(m[1]);
  }
  return raus;
}

/**
 * Die Klassen aus EINEM className-Wert.
 *
 * `scc-card${aktiv ? " scc-card--ok" : ""}` liefert:
 *   fest:    scc-card--ok   (aus dem String IN der Interpolation)
 *   praefix: scc-card       (steht direkt vor dem ${ und ist womoeglich
 *                            nur der Anfang einer zusammengesetzten Klasse)
 *
 * Das Stueck vor einer Interpolation wandert bewusst in die schwaechere
 * Praefix-Pruefung: bei `scc-status--${ton}` ist die volle Klasse zur
 * Bauzeit unbekannt, und ein Waechter, der raet, meldet Fehlalarme.
 */
export function klassenAusWert(wert) {
  const fest = [];
  const praefix = [];
  let i = 0;
  let aussen = "";

  const spuele = (folgtInterpolation) => {
    const teile = aussen.split(/\s+/).filter((t) => t.startsWith("scc-"));
    const haengtAn = folgtInterpolation && aussen.length > 0 && !/\s$/.test(aussen);
    teile.forEach((t, j) => {
      if (haengtAn && j === teile.length - 1) praefix.push(t);
      else fest.push(t);
    });
    aussen = "";
  };

  while (i < wert.length) {
    if (wert[i] === "$" && wert[i + 1] === "{") {
      spuele(true);
      let tiefe = 1;
      let j = i + 2;
      while (j < wert.length && tiefe > 0) {
        if (wert[j] === "{") tiefe++;
        else if (wert[j] === "}") tiefe--;
        j++;
      }
      const koerper = wert.slice(i + 2, j - 1);
      /*
       * Zeichenketten IN der Interpolation werden erneut durch diese Funktion
       * geschickt statt nur zerteilt. Grund: das Repo schachtelt Vorlagen —
       *   `scc-card${tone ? ` scc-card--${tone}` : ""}`
       * Ein blosses Zerteilen haette daraus die Klasse `scc-card--${tone}`
       * gelesen und acht Fehlalarme gemeldet. Der Waechter muss dieselbe
       * Sprache lesen wie der Uebersetzer, sonst meldet er sich selbst.
       */
      for (const q of koerper.matchAll(/["'`]((?:[^"'`])*)["'`]/g)) {
        const tiefer = klassenAusWert(q[1]);
        fest.push(...tiefer.fest);
        praefix.push(...tiefer.praefix);
      }
      i = j;
      continue;
    }
    aussen += wert[i];
    i++;
  }
  spuele(false);
  return { fest, praefix };
}

/** Alle className-Werte einer .tsx-Datei. Kommentare vorher entfernen. */
export function classNameWerte(roh) {
  const text = roh.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const werte = [];
  for (const m of text.matchAll(/className\s*=\s*"([^"]*)"/g)) werte.push(m[1]);
  for (const m of text.matchAll(/className\s*=\s*\{`([\s\S]*?)`\}/g)) werte.push(m[1]);
  /*
   * `className={bedingung ? "a" : "b"}` — aber NICHT ueber eine JSX-Grenze
   * hinweg. Ohne das Verbot von `<` und `>` verschluckt sich das Muster an
   * `actions={<button className="scc-btn" .../>}` und liest die id des
   * naechsten Elements als Klasse. Genau das hat beim ersten Anlauf einen
   * Fehlalarm auf `scc-prereg-title` erzeugt.
   */
  for (const m of text.matchAll(/className\s*=\s*\{([^<>`{}]*)\}/g)) {
    for (const q of m[1].matchAll(/"([^"]*)"/g)) werte.push(q[1]);
  }
  return werte;
}

/** Der eigentliche Abgleich. Gibt die Befunde zurueck, wirft nicht. */
export function pruefe(quellen, definiert) {
  const fest = new Map();
  const praefix = new Map();
  for (const { datei, text } of quellen) {
    for (const wert of classNameWerte(text)) {
      const { fest: f, praefix: p } = klassenAusWert(wert);
      for (const k of f) {
        if (!fest.has(k)) fest.set(k, new Set());
        fest.get(k).add(datei);
      }
      for (const k of p) {
        if (!praefix.has(k)) praefix.set(k, new Set());
        praefix.get(k).add(datei);
      }
    }
  }
  const alle = [...definiert];
  return {
    fest,
    praefix,
    ohneRegel: [...fest.keys()].filter((k) => !definiert.has(k)).sort(),
    ohneFamilie: [...praefix.keys()]
      .filter((p) => !alle.some((d) => d.startsWith(p)))
      .sort()
  };
}

suite("Waechter: CSS-Klassen im Staff Control Center", () => {
  const cssDateien = () => dateien(STAFF, [".css"]);
  const tsxDateien = () => dateien(STAFF, [".tsx"]);

  const lade = () => {
    const definiert = definierteKlassen(cssDateien().map((p) => fs.readFileSync(p, "utf8")));
    const quellen = tsxDateien().map((p) => ({
      datei: path.relative(STAFF, p).replace(/\\/g, "/"),
      text: fs.readFileSync(p, "utf8")
    }));
    return { definiert, quellen, ...pruefe(quellen, definiert) };
  };

  it("prueft ueberhaupt etwas (Selbstprobe)", () => {
    const { definiert, quellen, fest, praefix } = lade();
    assert.ok(quellen.length >= 20, `nur ${quellen.length} .tsx-Dateien gefunden`);
    assert.ok(definiert.size >= 50, `nur ${definiert.size} Klassen im Stylesheet`);
    assert.ok(fest.size >= 50, `nur ${fest.size} feste Klassen aus dem Code gelesen`);
    /*
     * Ohne diese vier waere die Ausbeute womoeglich Zufall. Sie sind die
     * Bausteine, aus denen jedes Modul besteht — fehlt einer, liest der
     * Waechter am Code vorbei und ist wertlos gruen.
     */
    for (const k of ["scc-card", "scc-table", "scc-btn", "scc-muted"]) {
      assert.ok(fest.has(k), `${k} nicht aus dem Code gelesen — Extraktion defekt`);
    }
    assert.ok(praefix.size >= 3, `nur ${praefix.size} zusammengesetzte Klassen erkannt`);
  });

  it("jede feste Klasse hat eine Regel im Stylesheet", () => {
    const { ohneRegel, fest } = lade();
    const detail = ohneRegel
      .map((k) => `  ${k}  <- ${[...fest.get(k)].join(", ")}`)
      .join("\n");
    assert.equal(
      ohneRegel.length, 0,
      `${ohneRegel.length} Klasse(n) ohne CSS-Regel — sie erscheinen unformatiert:\n${detail}`
    );
  });

  it("jede zusammengesetzte Klasse hat ihre Familie", () => {
    const { ohneFamilie, praefix } = lade();
    const detail = ohneFamilie
      .map((k) => `  ${k}...  <- ${[...praefix.get(k)].join(", ")}`)
      .join("\n");
    assert.equal(
      ohneFamilie.length, 0,
      `${ohneFamilie.length} Klassen-Familie(n) ohne jede Regel:\n${detail}`
    );
  });

  it("wird an einer erfundenen Klasse rot (Gegenprobe)", () => {
    const definiert = definierteKlassen([".scc-card { color: red }"]);
    const befund = pruefe(
      [{ datei: "erfunden.tsx", text: 'const a = <div className="scc-card scc-gibt-es-nicht" />;' }],
      definiert
    );
    assert.deepEqual(befund.ohneRegel, ["scc-gibt-es-nicht"]);
    assert.ok(befund.fest.has("scc-card"), "die echte Klasse haette durchgehen muessen");
  });

  it("meldet eine Familie, die es gar nicht gibt (Gegenprobe)", () => {
    const definiert = definierteKlassen([".scc-status--ok { color: green }"]);
    const gut = pruefe(
      [{ datei: "a.tsx", text: "const a = <i className={`scc-status--${ton}`} />;" }],
      definiert
    );
    assert.deepEqual(gut.ohneFamilie, [], "die vorhandene Familie darf nicht melden");

    const schlecht = pruefe(
      [{ datei: "b.tsx", text: "const b = <i className={`scc-badge--${ton}`} />;" }],
      definiert
    );
    assert.deepEqual(schlecht.ohneFamilie, ["scc-badge--"]);
  });

  it("liest keine id und keine CSS-Variable als Klasse (Gegenprobe)", () => {
    const definiert = definierteKlassen([".scc-btn { border: 0 }"]);
    const text = [
      'const x = <section aria-labelledby="scc-prereg-title">',
      '  <Kopf id="scc-prereg-title" aktion={<button className="scc-btn">Neu</button>} />',
      '  <div style={{ color: "var(--scc-danger)" }} />',
      "</section>;"
    ].join("\n");
    const befund = pruefe([{ datei: "c.tsx", text }], definiert);
    assert.deepEqual(befund.ohneRegel, [], "id/Variable duerfen nicht als Klasse gelten");
    assert.ok(befund.fest.has("scc-btn"), "die echte Klasse fehlt — Muster zu eng");
  });

  it("liest die Klassen aus einer Interpolation heraus", () => {
    const { fest, praefix } = klassenAusWert('scc-card${aktiv ? " scc-card--ok" : ""}');
    assert.ok(fest.includes("scc-card--ok"), "Klasse in der Interpolation uebersehen");
    assert.deepEqual(praefix, ["scc-card"]);
  });
});
