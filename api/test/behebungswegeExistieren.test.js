/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EIN BEHEBUNGSHINWEIS MUSS LAUFEN KÖNNEN (Y0.1a)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * BEFUND (2026-10-01): `api/test/mandantenModellWaechter.test.js` war rot und
 * sagte, was zu tun ist:
 *
 *     Registry und Datenbank sind auseinandergelaufen. **Neu erheben** und
 *     `node scripts/render-mandanten-modell.js --write` ausführen.
 *
 * Der zweite Teil ging: das Skript liegt seit dem 2026-08-21 unter
 * `scripts/render-mandanten-modell.js` (Wurzel, nicht `api/scripts/`) und
 * rendert. Für den ERSTEN Teil, das **Neu-Erheben**, gab es **keinen Befehl** —
 * das Register war genau einmal von Hand gemessen worden. Wer die rote Probe
 * las, bekam eine Anweisung, deren erste Hälfte kein Werkzeug hatte, und die
 * Drift ließ sich auf dem dokumentierten Weg nicht schließen.
 *
 * ZUR EHRLICHKEIT GEHÖRT DIE KORREKTUR MEINER EIGENEN DIAGNOSE: ich hielt das
 * Skript zuerst für gar nicht vorhanden und baute ein zweites unter
 * `api/scripts/`. Falsch — ich hatte nur in `api/scripts/` gesucht, weil die
 * übrigen Befehle jener Datei relativ zu `api/` stehen. **Die allgemeine
 * Zusicherung unten blieb dabei grün, und sie hatte recht:** sie löst einen
 * Pfad gegen `api/` UND gegen die Wurzel auf, und an der Wurzel lag die Datei.
 * Das Duplikat ist entfernt, die Erhebung steht im Original.
 *
 * EIN TOTER HINWEIS IST SCHLIMMER ALS KEINER. Ohne Hinweis sucht man im Code.
 * Mit einem toten Hinweis sucht man eine Datei, die nie existiert hat — und
 * glaubt, man habe den Pfad falsch. Genau diese Klasse hat an einem Tag
 * dreimal zugeschlagen:
 *
 *   - Punkt 13: `docker exec … npm run test:image` konnte nicht starten,
 *     weil `.dockerignore` `scripts/` ausschliesst — gefangen von
 *     `test/dokumentierteBefehleLaufen.test.js` (prüft CLAUDE.md, P1-C)
 *   - Y0.1: `sql/seed.sh` in `docs/pilot/PILOT_CORE_FLOW.md` und
 *     `scripts/verify_release_dir.sh` in `docs/enterprise_pack/GAPS.md` —
 *     gefangen von `test/saatSperreHaelt.test.js` (prüft `docs/`)
 *   - und hier: der Hinweis **im Code selbst**, den keiner der beiden sah.
 *
 * DREI WÄCHTER, DREI GELTUNGSBEREICHE, UND DIE NAHT IST GEWOLLT: CLAUDE.md,
 * `docs/`, und jetzt `api/test/` + `api/scripts/`. An der Naht melden sonst
 * beide grün — deshalb überlappt diese Probe bewusst mit den anderen zwei statt
 * sich abzugrenzen.
 *
 * WAS NICHT GEPRÜFT WIRD: ob der Befehl das Richtige TUT. Ausführen wäre im Tor
 * nicht bezahlbar (`--erheben` braucht eine Datenbank, ein Abbild-Bau über zehn
 * Minuten). Geprüft wird das Billige und Entscheidende: **existiert, was da
 * steht.**
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
      const pkg = path.join(dir, "api", "package.json");
      const probe = path.join(dir, "api", "test", "behebungswegeExistieren.test.js");
      if (fs.existsSync(pkg) && fs.existsSync(probe)) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel();
const suite = ROOT ? describe : describe.skip;

/** Alle package.json des Baums — `build:scc` liegt in `frontend/`, nicht in `api/`. */
function npmSkripte() {
  const namen = new Set();
  const orte = [];
  for (const rel of ["package.json", "api/package.json", "frontend/package.json", "e2e/package.json"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    orte.push(rel);
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    for (const k of Object.keys(j.scripts || {})) namen.add(k);
  }
  return { namen, orte };
}

function dateien(dir, endungen) {
  const out = [];
  const geh = (d, tiefe) => {
    if (tiefe > 5 || !fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) geh(p, tiefe + 1);
      else if (endungen.some((x) => e.name.endsWith(x))) out.push(p);
    }
  };
  geh(dir, 0);
  return out;
}

/* `node <pfad>` / `sh <pfad>` / `bash <pfad>` / `npm run <name>`. */
const BEFEHL = /\b(?:node|sh|bash)\s+((?:\.\/)?[\w./-]+\.(?:js|mjs|sh))|\bnpm\s+run\s+([\w:-]+)/g;

/* Eine VORLAGE ist kein Befehl: `npm run test:mutation:<bereich>` nennt absichtlich
   keinen fertigen Namen. Erkennbar am Platzhalter direkt dahinter oder am
   abschliessenden Doppelpunkt. */
function istVorlage(name, text, index) {
  if (name.endsWith(":")) return true;
  return text.slice(index + name.length, index + name.length + 2).startsWith("<");
}

/** Sammelt jeden genannten Befehl aus einem Dateisatz. */
function sammle(wurzeln) {
  const treffer = [];
  for (const abs of wurzeln.flatMap((w) => dateien(path.join(ROOT, w), [".js", ".mjs"]))) {
    const text = fs.readFileSync(abs, "utf8");
    const wo = path.relative(ROOT, abs).replace(/\\/g, "/");
    for (const m of text.matchAll(BEFEHL)) {
      if (m[1]) treffer.push({ art: "datei", wert: m[1], wo });
      else if (m[2] && !istVorlage(m[2], text, m.index + m[0].indexOf(m[2]))) {
        treffer.push({ art: "npm", wert: m[2], wo });
      }
    }
  }
  return treffer;
}

/* Ein Pfad in einem Probentext ist relativ zu api/ ODER zur Wurzel gemeint —
   beide Schreibweisen kommen im Haus vor. */
function existiertIrgendwo(rel) {
  const ohnePunkt = rel.replace(/^\.\//, "");
  return [
    path.join(ROOT, "api", ohnePunkt),
    path.join(ROOT, ohnePunkt),
  ].some((p) => fs.existsSync(p));
}

suite("Y0.1a — ein Behebungshinweis muss laufen koennen", () => {

  it("jede in api/test/ genannte Datei existiert", () => {
    const treffer = sammle(["api/test"]).filter((t) => t.art === "datei");
    /* Notbremse: ohne Gegenstand ist "nichts fehlt" leer gruen. */
    assert.ok(treffer.length >= 8,
      `Erwartet mindestens 8 Datei-Befehle in api/test/, gefunden ${treffer.length} — stimmt der Pfad? (gemessen 2026-10-01: 10)`);
    const tot = treffer.filter((t) => !existiertIrgendwo(t.wert));
    assert.deepEqual(tot.map((t) => `${t.wert}  (genannt in ${t.wo})`), [],
      "Eine Probe nennt eine Datei, die es nicht gibt — und ein toter Hinweis ist "
      + "schlimmer als keiner: ohne Hinweis sucht man im Code, mit einem toten sucht man "
      + "eine Datei, die nie existierte, und glaubt, man habe den Pfad falsch. "
      + "Verwandter Befund 2026-10-01: `sql/seed.sh` in docs/pilot/PILOT_CORE_FLOW.md "
      + "(gefangen von saatSperreHaelt D2). Diese Zusicherung loest gegen api/ UND gegen "
      + "die Wurzel auf — genau deshalb blieb sie damals zu Recht gruen, als ich "
      + "scripts/render-mandanten-modell.js faelschlich fuer fehlend hielt.");
  });

  it("jedes in api/test/ genannte npm-Skript existiert — in irgendeiner package.json", () => {
    const { namen, orte } = npmSkripte();
    assert.ok(orte.length >= 2 && namen.size >= 30,
      `Nur ${namen.size} npm-Skripte aus ${orte.length} Datei(en) gefunden — stimmt der Pfad?`);
    const treffer = sammle(["api/test"]).filter((t) => t.art === "npm");
    assert.ok(treffer.length >= 24,
      `Erwartet mindestens 24 npm-Befehle in api/test/, gefunden ${treffer.length} (gemessen 2026-10-01: 31)`);
    const tot = treffer.filter((t) => !namen.has(t.wert));
    assert.deepEqual(tot.map((t) => `npm run ${t.wert}  (genannt in ${t.wo})`), [],
      `Gesucht wurde in ${orte.join(", ")}. Ein Skript kann in einer ANDEREN package.json `
      + "liegen als api/ — `build:scc` steht in frontend/package.json. Fehlt es ueberall, "
      + "ist der Hinweis tot.");
  });

  it("jede in api/scripts/ und scripts/ genannte Datei existiert", () => {
    /* Skripte drucken Behebungswege in ihre Fehlermeldungen — dieselbe Falle,
       nur eine Ebene weiter: wer den Fehler liest, tippt was dasteht. */
    const treffer = sammle(["api/scripts", "scripts"]).filter((t) => t.art === "datei");
    assert.ok(treffer.length >= 48,
      `Erwartet mindestens 48 Datei-Befehle in api/scripts/ + scripts/, gefunden ${treffer.length} (gemessen 2026-10-01: 61)`);
    const tot = treffer.filter((t) => !existiertIrgendwo(t.wert));
    assert.deepEqual(tot.map((t) => `${t.wert}  (genannt in ${t.wo})`), []);
  });

  it("der Behebungsweg des Mandanten-Modells existiert und kennt seine Schalter", () => {
    /* Die Stelle, an der es aufgefallen ist — namentlich festgehalten, damit ein
       Umbenennen nicht nur irgendeine Zusicherung rot macht, sondern DIESE.
       Der Pfad ist `scripts/` an der WURZEL, nicht `api/scripts/`: dort liegt
       das Skript seit dem 2026-08-21, und genau diese Verwechslung hat mich
       einmal ein Duplikat bauen lassen. */
    const p = path.join(ROOT, "scripts", "render-mandanten-modell.js");
    assert.ok(fs.existsSync(p),
      "scripts/render-mandanten-modell.js fehlt — vier Stellen nennen es als Behebungsweg "
      + "(test/helpers/mandantenModell.js 2x, test/mandantenModellWaechter.test.js 2x)");
    assert.ok(!fs.existsSync(path.join(ROOT, "api", "scripts", "render-mandanten-modell.js")),
      "Es gibt ZWEI Skripte dieses Namens (Wurzel und api/scripts/). Zwei Fassungen desselben "
      + "Behebungswegs sind schlimmer als eine fehlende: die Fehlermeldungen nennen den Pfad "
      + "`scripts/…`, und wer im anderen arbeitet, aendert die Datei, die niemand aufruft.");
    const src = fs.readFileSync(p, "utf8");
    for (const schalter of ["--write", "--pruefen", "--erheben"]) {
      assert.ok(src.includes(`"${schalter}"`),
        `${schalter} wird nicht ausgewertet — der dokumentierte Aufruf waere wieder nur halb wahr`);
    }
    /* Und es darf die eine Einstufung nicht ueberschreiben, die ein Urteil ist. */
    assert.match(src, /kein_mandantentraeger/,
      "Das Skript kennt `kein_mandantentraeger` nicht. Diese Einstufung heisst "
      + "\"nicht mandantenprivat\" (users, organizations, platform_skills und 14 weitere) "
      + "und ist ein Urteil, kein Messwert. Der erste Entwurf stufte sie aus Zahlen neu ein "
      + "und loeschte dabei alle 17 — das sah ordentlich aus und war falsch.");
  });
});
