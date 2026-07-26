/**
 * Matching-Ergebnisse (Seite) — P4.2 Verdrahtungs-Nachweis.
 *
 * Prueft die echte Inline-Logik aus `frontend/public/matching_results.html` in einer
 * vm-Sandbox: rendert die Karte die Server-Erklaerung wirklich in den DOM-String, oder
 * existiert nur CSS dafuer? Genau die Luecke, die CLAUDE.md als "toter Platzhalter"
 * verbietet — und die ein reiner Backend-Test nie findet.
 *
 * Run: node --test --test-force-exit test/matchingResultsPage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { explainMatch } from "../services/matchExplanationService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pfad relativ zur Testdatei aufloesen, nicht nur zu process.cwd() — sonst skippt der
// Test je nach Startverzeichnis lautlos (CLAUDE.md §0.9).
const MARKER_REL = "frontend/public/matching_results.html";
const ROOT_CWD = process.cwd();
const ROOT_LOCAL = path.resolve(__dirname, "..", "..");
const ROOT = fs.existsSync(path.join(ROOT_CWD, MARKER_REL)) ? ROOT_CWD : ROOT_LOCAL;
const AVAILABLE = fs.existsSync(path.join(ROOT, MARKER_REL));
const suite = AVAILABLE ? describe : describe.skip;

/** Inline-Script der Seite laden (das ohne src-Attribut, das die Karten rendert). */
function loadPageScript() {
  const html = fs.readFileSync(path.join(ROOT, MARKER_REL), "utf8");
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const block = blocks.find((b) => b.includes("function renderMatchCard"));
  assert.ok(block, "Inline-Script mit renderMatchCard nicht gefunden");
  return block;
}

function runPageScript() {
  const el = () => ({ innerHTML: "", textContent: "", style: {} });
  const sandbox = {
    console,
    // loadMatches() laeuft beim Laden an; Netz und DOM werden nur stumm gestellt.
    fetch: async () => ({ ok: false, status: 0, json: async () => ({}) }),
    document: { getElementById: () => el(), querySelector: () => null },
    window: { location: { search: "" } },
    history: { replaceState() {} },
    URLSearchParams,
    encodeURIComponent
  };
  vm.createContext(sandbox);
  new vm.Script(loadPageScript()).runInContext(sandbox);
  return sandbox;
}

const capacityMatch = () => {
  const reasons = [
    { factor: "role", points: 30, max: 30, meta: { mode: "exact", role: "Pflegekraft" } },
    { factor: "skills", points: 19, max: 25, meta: { overlap: 3, required: 4 } },
    { factor: "location", points: 18, max: 25, meta: { km: 18, maxKm: 25, withinRadius: true } },
    { factor: "availability", points: 0, max: 10, meta: { fits: false } }
  ];
  return {
    score: 72,
    reasons,
    explanation: explainMatch(72, reasons),
    capacity_post: { id: "CP1", title: "3 Pflegekräfte", role: "Pflegekraft", location_city: "Kiel" }
  };
};

suite("matching_results.html — Server-Erklaerung landet im DOM", () => {
  it("rendert die Klartext-Begruendung in der Karte", () => {
    const page = runPageScript();
    const html = page.renderMatchCard(capacityMatch(), "demand");
    assert.match(html, /Rolle „Pflegekraft" passt genau/);
    assert.match(html, /3 von 4 geforderten Skills/);
    assert.match(html, /18 km entfernt/);
  });

  it("zeigt die Qualitaetsstufe als Badge mit passender Klasse", () => {
    const page = runPageScript();
    const html = page.renderMatchCard(capacityMatch(), "demand");
    assert.match(html, /match-why--good/);
    assert.match(html, /Gute Übereinstimmung/);
  });

  it("macht Einschraenkungen sichtbar statt sie zu verschweigen", () => {
    const page = runPageScript();
    const html = page.renderMatchCard(capacityMatch(), "demand");
    assert.match(html, /Einschränkung: Zeitraum passt nicht/);
  });

  it("beschriftet die Achsen mit den Server-Labels", () => {
    const page = runPageScript();
    const html = page.renderMatchCard(capacityMatch(), "demand");
    for (const label of ["Rolle", "Skills", "Standort", "Verfügbarkeit"]) {
      assert.ok(html.includes(">" + label + "<"), `Achse fehlt in der Karte: ${label}`);
    }
    assert.match(html, /score-bar--missing/, "die 0-Punkte-Achse ist als Luecke markiert");
    assert.match(html, /score-bar--full/, "die volle Achse ist als solche markiert");
  });

  it("faellt ohne Server-Erklaerung auf die Rohgruende zurueck (Altdaten)", () => {
    const page = runPageScript();
    const html = page.renderMatchCard({
      match_score: 55,
      reasons: [{ factor: "role", points: 30, max: 30, detail: "Rolle stimmt" }],
      capacity_post: { id: "CP2", title: "Alt", role: "Koch", location_city: "Kiel" }
    }, "demand");
    assert.match(html, /Rolle/);
    assert.match(html, /55/, "der persistierte Score wird angezeigt");
    assert.ok(!html.includes("match-why__badge"), "ohne Erklaerung kein leeres Badge");
  });

  it("escaped Titel und Begruendung (kein innerHTML ohne esc)", () => {
    const page = runPageScript();
    const m = capacityMatch();
    m.capacity_post.title = '<img src=x onerror="alert(1)">';
    m.explanation.summary = '<script>alert(2)</script>';
    const html = page.renderMatchCard(m, "demand");
    assert.ok(!html.includes("<img src=x"), "Titel wird escaped");
    assert.ok(!html.includes("<script>alert(2)"), "Begruendung wird escaped");
    assert.match(html, /&lt;img/);
  });
});
