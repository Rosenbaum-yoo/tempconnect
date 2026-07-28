/**
 * Doku-Konsistenz — CLAUDE.md §0.12 ("Dokumentation muss jederzeit einer echten,
 * zeitgenauen Pruefung standhalten, automatisiert wo moeglich").
 *
 * Prueft zwei Dinge:
 *
 *   1. TOTE LINKS — strikt, ohne Ausnahmeliste.
 *      Jeder relative Markdown-Link muss auf eine existierende Datei zeigen.
 *      Der Bestand war bei Einfuehrung sauber (2 Treffer, beide sofort behoben:
 *      `docs/README.md` verlinkte `api/docs/…` statt `../api/docs/…`). Wo nichts
 *      aufzuraeumen ist, braucht es keine Allowlist — jeder neue tote Link ist rot.
 *
 *   2. VERWAISTE DOKUMENTE — Ratsche gegen eine Bestandsliste.
 *      Eine Datei unter `docs/`, auf die keine andere Markdown-Datei verweist,
 *      findet niemand mehr; sie veraltet unbemerkt und widerspricht spaeter dem,
 *      was gilt. 177 davon gab es bei Einfuehrung — die auf einen Schlag zu
 *      verlinken waere Beschaeftigung, kein Nutzen. Deshalb eine Ratsche:
 *        - NEUE Verwaiste  -> rot (die Zahl darf nicht wachsen)
 *        - Verwaiste, die inzwischen verlinkt sind -> rot mit der Aufforderung,
 *          sie aus der Bestandsliste zu streichen (sonst verrottet die Liste und
 *          die Ratsche zieht nie an)
 *      Die Liste kann damit nur kleiner werden.
 *
 * Bestandsliste: `docs/.docs-consistency-baseline.json`
 *
 * Pfadaufloesung bewusst ueber `import.meta.url` statt `process.cwd()`: sonst
 * findet der Test seine Dateien je nach Startverzeichnis nicht und ueberspringt
 * sich lautlos — die "gruene" Suite pruefte dann weniger, als sie behauptet
 * (CLAUDE.md §0.9).
 *
 * Run: node --test --test-force-exit test/docsConsistency.test.js
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BASELINE_PATH = path.join(REPO_ROOT, "docs", ".docs-consistency-baseline.json");

/** Verzeichnisse, die nie mitgeprueft werden. */
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".claude", "release", "dist", "build", "coverage", "e2e-results"
]);

/** Wurzeln, in denen nach Markdown gesucht wird. */
const SCAN_ROOTS = ["docs", ".agents"];

const LINK_RE = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const EXTERNAL_PREFIXES = ["http://", "https://", "mailto:", "tel:", "data:", "#"];

function collectMarkdown(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectMarkdown(full, out);
    else if (entry.name.toLowerCase().endsWith(".md")) out.push(full);
  }
  return out;
}

/** Repo-relativer Pfad mit Vorwaerts-Schraegstrichen — plattformstabil fuer Vergleiche. */
function rel(absolute) {
  return path.relative(REPO_ROOT, absolute).split(path.sep).join("/");
}

describe("Doku-Konsistenz", () => {
  /** @type {string[]} */ let files = [];
  /** @type {{file: string, target: string}[]} */ const deadLinks = [];
  /** @type {Set<string>} */ const linkedTargets = new Set();
  /** @type {{orphans: string[]}} */ let baseline = { orphans: [] };

  before(() => {
    // Root-Markdown (nicht rekursiv) + die Scan-Wurzeln.
    files = fs
      .readdirSync(REPO_ROOT, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"))
      .map((e) => path.join(REPO_ROOT, e.name));
    for (const root of SCAN_ROOTS) collectMarkdown(path.join(REPO_ROOT, root), files);

    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      LINK_RE.lastIndex = 0;
      let match;
      while ((match = LINK_RE.exec(text)) !== null) {
        const raw = match[2];
        if (EXTERNAL_PREFIXES.some((p) => raw.startsWith(p))) continue;
        const target = raw.split("#")[0];
        if (!target) continue; // reiner Anker
        const resolved = path.resolve(path.dirname(file), decodeURIComponent(target));
        if (fs.existsSync(resolved)) linkedTargets.add(path.normalize(resolved).toLowerCase());
        else deadLinks.push({ file: rel(file), target: raw });
      }
    }

    baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  });

  it("findet ueberhaupt Dokumente — sonst prueft der Test nichts und wirkt trotzdem gruen", () => {
    assert.ok(files.length > 50, `Nur ${files.length} Markdown-Dateien gefunden — stimmt REPO_ROOT (${REPO_ROOT})?`);
  });

  it("kein Markdown-Link zeigt ins Leere", () => {
    const report = deadLinks.map((d) => `  ${d.file}  ->  ${d.target}`).join("\n");
    assert.equal(
      deadLinks.length, 0,
      `${deadLinks.length} tote(r) Link(s). Ziel korrigieren oder Link entfernen — ` +
      `es gibt bewusst keine Ausnahmeliste:\n${report}`
    );
  });

  describe("verwaiste Dokumente (Ratsche — die Liste darf nur schrumpfen)", () => {
    /** @returns {string[]} repo-relative Pfade unter docs/, auf die nichts verweist */
    function currentOrphans() {
      return collectMarkdown(path.join(REPO_ROOT, "docs"))
        .filter((f) => !linkedTargets.has(path.normalize(f).toLowerCase()))
        .map(rel)
        .sort();
    }

    it("keine NEUEN verwaisten Dokumente", () => {
      const known = new Set(baseline.orphans);
      const fresh = currentOrphans().filter((f) => !known.has(f));
      assert.deepEqual(
        fresh, [],
        `${fresh.length} neue verwaiste Datei(en) unter docs/. Jede Datei, auf die niemand ` +
        `verweist, veraltet unbemerkt: entweder aus einem Index verlinken (z. B. docs/README.md) ` +
        `oder loeschen. Nur wenn beides bewusst nicht gilt, in ${rel(BASELINE_PATH)} eintragen:\n` +
        fresh.map((f) => `  ${f}`).join("\n")
      );
    });

    it("die Bestandsliste enthaelt nichts, was inzwischen verlinkt oder geloescht ist", () => {
      const orphans = new Set(currentOrphans());
      const stale = baseline.orphans.filter((f) => !orphans.has(f));
      assert.deepEqual(
        stale, [],
        `${stale.length} Eintrag/Eintraege in ${rel(BASELINE_PATH)} sind erledigt (verlinkt oder ` +
        `geloescht). Bitte dort streichen — sonst zieht die Ratsche nie an:\n` +
        stale.map((f) => `  ${f}`).join("\n")
      );
    });

    it("die Bestandsliste ist sortiert und doppelfrei — sonst wird jeder Diff unlesbar", () => {
      const sorted = [...baseline.orphans].sort();
      assert.deepEqual(baseline.orphans, sorted, "Eintraege in der Bestandsliste alphabetisch sortieren");
      assert.equal(new Set(baseline.orphans).size, baseline.orphans.length, "Doppelte Eintraege in der Bestandsliste");
    });
  });
});
