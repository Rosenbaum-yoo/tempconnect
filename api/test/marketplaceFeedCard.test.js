/**
 * Marktplatz-Feed-Karte — Welle 5 Angebots-Styling (Dringlichkeit/Knappheit/Trust).
 *
 * Prueft die echte Render-Logik aus `frontend/public/js/pages/marketplaceFeed.js`
 * in einer vm-Sandbox (Test-Hook `window.__mpFeedTestHooks`):
 *   - Notdienst bekommt Karten-Praesenz (ce-card--notdienst), nicht nur ein Badge
 *   - Knappheit ist EHRLICH: Badge nur bei real gebundenen Plaetzen + wenig Rest
 *   - Skill-Chips machen den Multi-Skill-Fan-out sichtbar (ab 2 Skills, Cap 4 + "+N")
 *   - User-Werte bleiben escaped (kein XSS ueber skill_tags)
 *
 * Run: node --test --test-force-exit test/marketplaceFeedCard.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pfad relativ zur Testdatei aufloesen, nicht nur zu process.cwd() — sonst skippt
// der Test je nach Startverzeichnis lautlos (CLAUDE.md §0.9).
const MARKER_REL = "frontend/public/js/pages/marketplaceFeed.js";
const ROOT_CWD = process.cwd();
const ROOT_LOCAL = path.resolve(__dirname, "..", "..");
const ROOT = fs.existsSync(path.join(ROOT_CWD, MARKER_REL)) ? ROOT_CWD : ROOT_LOCAL;
const AVAILABLE = fs.existsSync(path.join(ROOT, MARKER_REL));
const suite = AVAILABLE ? describe : describe.skip;

function makeElementStub() {
  return {
    innerHTML: "", textContent: "", value: "", checked: false, disabled: false,
    style: {}, dataset: {}, href: "",
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, appendChild() {}, insertAdjacentHTML() {},
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, hasAttribute: () => false,
    querySelector: () => null, querySelectorAll: () => [], closest: () => null, focus() {}
  };
}

/** Traeges Thenable: Init-Ketten (`TC.api.get(...).then(...)`) laufen nie an —
 *  der Test will nur die reinen Render-Helfer, nicht den Netz-/Polling-Pfad. */
const inertThenable = { then() { return inertThenable; }, catch() { return inertThenable; }, finally() { return inertThenable; } };

function loadHooks() {
  const src = fs.readFileSync(path.join(ROOT, MARKER_REL), "utf8");
  const win = { location: { search: "", href: "" }, addEventListener() {}, history: { replaceState() {} } };
  const sandbox = {
    console,
    window: win,
    document: {
      getElementById: () => makeElementStub(),
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
      body: makeElementStub()
    },
    TC: { api: { get: () => inertThenable, post: () => inertThenable } },
    fetch: () => inertThenable,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setInterval() {}, setTimeout() {}, clearInterval() {}, clearTimeout() {},
    URLSearchParams, encodeURIComponent, Date, Math, Number, Array, String, Object, JSON, isFinite
  };
  vm.createContext(sandbox);
  new vm.Script(src, { filename: MARKER_REL }).runInContext(sandbox);
  assert.ok(win.__mpFeedTestHooks, "Test-Hook __mpFeedTestHooks fehlt am window");
  return win.__mpFeedTestHooks;
}

const baseSupply = (extra) => Object.assign({
  id: "cp-1", feed_type: "supply", title: "Angebot", role: "Pflegekraft",
  headcount: 3, location_city: "Kiel", availability_from: "2026-09-01"
}, extra || {});

suite("marketplaceFeed — Welle 5 Angebots-Styling", () => {
  const hooks = AVAILABLE ? loadHooks() : null;

  it("Notdienst-Angebot traegt die Karten-Klasse ce-card--notdienst + Badge", () => {
    const html = hooks.renderCard(baseSupply({ priority_level: "notdienst" }));
    assert.match(html, /ce-card--notdienst/);
    assert.match(html, />Notdienst</);
  });

  it("normales Angebot traegt KEINE Notdienst-Klasse", () => {
    const html = hooks.renderCard(baseSupply());
    assert.doesNotMatch(html, /ce-card--notdienst/);
  });

  it("elevated-Badge heisst 'Erhoeht' (Tippfehler 'Erhoet' behoben)", () => {
    const html = hooks.renderCard(baseSupply({ priority_level: "elevated" }));
    assert.match(html, />Erhoeht</);
    assert.doesNotMatch(html, />Erhoet</);
  });

  it("Knappheit: 2 von 15 frei (13 gebunden) -> 'Nur noch 2 frei'", () => {
    const sig = hooks.scarcitySignal(baseSupply({ headcount: 15, remaining_headcount: 2, committed_headcount: 13 }), false);
    assert.ok(sig);
    assert.equal(sig.label, "Nur noch 2 frei");
    const html = hooks.renderCard(baseSupply({ headcount: 15, remaining_headcount: 2, committed_headcount: 13 }));
    assert.match(html, /ce-scarcity-badge/);
    assert.match(html, /Nur noch 2 frei/);
  });

  it("EHRLICH: unberuehrtes Angebot (nichts gebunden) -> keine Knappheit, auch bei headcount 1", () => {
    assert.equal(hooks.scarcitySignal(baseSupply({ headcount: 1 }), false), null);
    assert.equal(hooks.scarcitySignal(baseSupply({ headcount: 15 }), false), null);
  });

  it("voll reserviert / 0 frei -> keine Knappheit (Status-Badge uebernimmt)", () => {
    assert.equal(hooks.scarcitySignal(baseSupply({ status: "reserved", headcount: 3, remaining_headcount: 1, committed_headcount: 2 }), false), null);
    assert.equal(hooks.scarcitySignal(baseSupply({ headcount: 3, remaining_headcount: 0, committed_headcount: 3 }), false), null);
  });

  it("Rest oberhalb 1/3-Schwelle -> keine Knappheit (10 von 15 frei)", () => {
    assert.equal(hooks.scarcitySignal(baseSupply({ headcount: 15, remaining_headcount: 10, committed_headcount: 5 }), false), null);
  });

  it("Nachfrage-Karte: 1 von 6 offen -> 'Nur noch 1 offen'", () => {
    const entry = { feed_type: "demand", required_total_count: 6, remaining_open_count: 1, currently_committed_count: 5 };
    const sig = hooks.scarcitySignal(entry, true);
    assert.ok(sig);
    assert.equal(sig.label, "Nur noch 1 offen");
  });

  it("Skill-Chips: 6 Skills -> 4 Chips + '+2 weitere'; unter 2 Skills keine Chips", () => {
    const html = hooks.skillChipsHtml({ skill_tags: ["Altenpflege", "Grundpflege", "Demenzbetreuung", "Wundversorgung", "Palliativ", "Dokumentation"] });
    assert.equal((html.match(/<span/g) || []).length, 5); // 4 Chips + 1 "+N weitere"
    assert.match(html, /ce-skill-chip--more/);
    assert.match(html, /\+2 weitere/);
    assert.match(html, /Altenpflege/);
    assert.doesNotMatch(html, /Palliativ/); // Cap 4: Nr. 5+6 nur als "+2 weitere"
    assert.equal(hooks.skillChipsHtml({ skill_tags: ["Altenpflege"] }), "");
    assert.equal(hooks.skillChipsHtml({}), "");
  });

  it("XSS: skill_tags werden escaped", () => {
    const html = hooks.skillChipsHtml({ skill_tags: ["<script>alert(1)</script>", "Grundpflege"] });
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;script&gt;/);
  });

  it("Bündel-Karte rendert Chips im Kartenkoerper", () => {
    const html = hooks.renderCard(baseSupply({ offer_kind: "bundle", skill_tags: ["Altenpflege", "Grundpflege", "Demenzbetreuung"] }));
    assert.match(html, /ce-card__skills/);
    assert.match(html, /Demenzbetreuung/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   N3.5 / O-L1 — WAS GEHOBEN IST, IST SICHTBAR GEKENNZEICHNET
   ═══════════════════════════════════════════════════════════════════════════
 *
 * Der Rang-Grund "Bezahlt hervorgehoben" steht als LETZTER in `rank_labels`,
 * und die Karte kuerzte die Liste auf drei. Bei einem Eintrag mit vielen
 * Gruenden — also genau bei den auffaelligsten Karten — fiel die
 * Kennzeichnung damit raus. Eine Kennzeichnung, die bei Gedraenge
 * verschwindet, ist keine.
 */

suite("marketplaceFeed — O-L1: bezahlte Hebung ist gekennzeichnet", () => {
  const hooks = AVAILABLE ? loadHooks() : null;

  it("die Kennzeichnung ueberlebt die Kuerzung auf drei Rang-Gruende", () => {
    const html = hooks.renderCard(baseSupply({
      rank_labels: ["Fuer Sie priorisiert", "Premium-Anzeige", "Top-Treffer", "Premium", "Bezahlt hervorgehoben"],
      rank_boost_paid: 27
    }));
    assert.match(html, /Bezahlt hervorgehoben/,
      "die Kennzeichnung wurde abgeschnitten — sie steht als letzter Grund im Feld");
    assert.match(html, /data-rang="bezahlt"/, "die Kennzeichnung hat kein eigenes Merkmal");
    assert.match(html, /steht nie vor einem besser passenden Treffer/,
      "ohne die Erklaerung ist der Hinweis eine Floskel");
    /* Und genau EINMAL: bliebe der Grund zusaetzlich in der grauen Liste,
       staende die Kennzeichnung zweimal auf der Karte — einmal davon ohne
       Erklaerung und ohne Merkmal. */
    assert.doesNotMatch(html, /ds-badge--neutral"[^>]*>Bezahlt hervorgehoben</,
      "die Kennzeichnung steht zusaetzlich als grauer Rang-Grund — doppelt und stumm");
  });

  it("ohne bezahlte Hebung erscheint die Kennzeichnung nicht", () => {
    const html = hooks.renderCard(baseSupply({
      rank_labels: ["Fuer Sie priorisiert", "Top-Treffer"], rank_boost_paid: 0
    }));
    assert.doesNotMatch(html, /Bezahlt hervorgehoben/,
      "ein Eintrag ohne Hebung wird als bezahlt ausgewiesen");
    assert.doesNotMatch(html, /data-rang="bezahlt"/);
  });

  it("die Kennzeichnung haengt an der Zahl, nicht nur am Text aus dem Feld", () => {
    /* Kaeme `rank_labels` einmal gekuerzt oder in einer anderen Sprache an,
       bliebe die Karte trotzdem ehrlich: `rank_boost_paid` entscheidet mit. */
    const html = hooks.renderCard(baseSupply({ rank_labels: ["Top-Treffer"], rank_boost_paid: 15 }));
    assert.match(html, /data-rang="bezahlt"/,
      "eine gekuerzte Gruende-Liste laesst die Kennzeichnung verschwinden");
  });

  it("bei wenigen Gruenden steht sie trotzdem nur einmal", () => {
    /*
     * Der Gegenfall zur Probe oben: hier passt der Grund IN die Kuerzung. Wer
     * die Kennzeichnung nicht aus der Liste nimmt, zeigt sie dann doppelt —
     * einmal grau und stumm, einmal mit Erklaerung. Beide Faelle zusammen
     * halten die Regel fest, einer allein nicht.
     */
    const html = hooks.renderCard(baseSupply({
      rank_labels: ["Top-Treffer", "Bezahlt hervorgehoben"], rank_boost_paid: 15
    }));
    assert.match(html, /data-rang="bezahlt"/);
    assert.doesNotMatch(html, /ds-badge--neutral"[^>]*>Bezahlt hervorgehoben</,
      "die Kennzeichnung steht doppelt — grau ohne Erklaerung und daneben mit");
  });
});
