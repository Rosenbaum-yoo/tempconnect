/**
 * Keine Emojis in produktiver UI (CLAUDE.md, Frontend-Regeln) — Wächter.
 *
 * Das Einsatzportal war 2026-07-26 mit 181 Emojis der groesste Verstoss (Audit-Backlog
 * C-2). Sie sind durch einen Inline-SVG-Satz in `portalShell.js` ersetzt. Dieser Test
 * haelt den erreichten Zustand: kommt ein Emoji zurueck, wird er rot.
 *
 * **Bewusst eng gefasst:** geprueft wird der aufgeraeumte Bereich, nicht das ganze
 * Frontend. Ein repo-weiter Test waere sofort rot und damit wertlos — er wuerde
 * abgeschaltet statt befolgt. Der Geltungsbereich waechst mit jedem aufgeraeumten
 * Bereich: neue Pfade einfach in GUARDED_GLOBS eintragen.
 *
 * Run: node --test --test-force-exit test/uiNoEmoji.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_CWD = process.cwd();
const ROOT_LOCAL = path.resolve(__dirname, "..", "..");
const MARKER = "frontend/public/einsatzportal.css";
const ROOT = fs.existsSync(path.join(ROOT_CWD, MARKER)) ? ROOT_CWD : ROOT_LOCAL;
const AVAILABLE = fs.existsSync(path.join(ROOT, MARKER));
const suite = AVAILABLE ? describe : describe.skip;

/** Aufgeraeumte Bereiche. Hier kommt kein Emoji mehr rein. */
const GUARDED = [
  { dir: "frontend/public", match: (f) => /^einsatzportal-.*\.html$/.test(f) },
  { dir: "frontend/public", match: (f) => f === "einsatzportal.css" },
  { dir: "frontend/public/js/workerPortal", match: (f) => f.endsWith(".js") }
];

/**
 * Bildzeichen — bewusst OHNE die typografischen Pfeile (←→↩) und Anfuehrungszeichen:
 * das sind Satzzeichen im Fliesstext, keine Bildchen.
 */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}]/gu;

function collect() {
  const found = [];
  for (const g of GUARDED) {
    const base = path.join(ROOT, g.dir);
    if (!fs.existsSync(base)) continue;
    for (const f of fs.readdirSync(base)) {
      if (!g.match(f)) continue;
      const file = path.join(base, f);
      if (!fs.statSync(file).isFile()) continue;
      const text = fs.readFileSync(file, "utf8");
      text.split("\n").forEach((line, i) => {
        const hits = line.match(EMOJI);
        if (hits) found.push({ file: `${g.dir}/${f}`, line: i + 1, chars: [...new Set(hits)].join(" ") });
      });
    }
  }
  return found;
}

suite("Produktive UI ohne Emojis", () => {
  it("das Einsatzportal enthaelt kein einziges Emoji", () => {
    const hits = collect();
    const report = hits.slice(0, 15).map((h) => `${h.file}:${h.line}  ${h.chars}`).join("\n");
    assert.deepEqual(
      hits, [],
      `Emojis in produktiver UI gefunden (CLAUDE.md verbietet das). ` +
      `Nutze den SVG-Icon-Satz in portalShell.js:\n${report}`
    );
  });

  it("der Icon-Satz deckt jeden Navigationseintrag ab", () => {
    const shell = fs.readFileSync(path.join(ROOT, "frontend/public/js/workerPortal/portalShell.js"), "utf8");
    // Die Schluessel leiten sich aus den Ziel-Links ab: einsatzportal-<key>.html
    const seiten = fs.readdirSync(path.join(ROOT, "frontend/public"))
      .filter((f) => /^einsatzportal-([a-z]+)\.html$/.test(f))
      .map((f) => /^einsatzportal-([a-z]+)\.html$/.exec(f)[1]);
    for (const key of seiten) {
      assert.ok(
        new RegExp(`\\b${key}:\\s*'`).test(shell),
        `Kein Icon fuer die Seite "${key}" — der Navigationseintrag bliebe ohne Symbol.`
      );
    }
    assert.ok(/abmelden:\s*'/.test(shell), "Abmelden braucht ebenfalls ein Icon");
  });
});
