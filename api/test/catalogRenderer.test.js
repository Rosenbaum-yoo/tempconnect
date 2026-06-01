/**
 * Welle 8 Schritt 13 - Tests fuer den Shared catalogRenderer
 * + Smoke-Checks fuer pricing.js / slaAbo.js / enterpriseAnfrage.js.
 *
 * Pruefungen:
 *   1. Helper-Funktionen (normalizePlanKey, fmtCents, planHighlights,
 *      findPlan/findAddon/findFeatureByKey, intervalLabel)
 *   2. renderPlanCard / renderTierCard / renderComparisonHead+Body liefern
 *      stabile HTML-Snippets (idempotente Strukturchecks)
 *   3. deriveDowngradeLosses (NEUE LOSS_MAP) leitet Verluste korrekt aus dem
 *      catalog.features[].included_in_plans ab \u2014 PRO -> BASIS, PLUS -> DEMO,
 *      PRO -> PRO (kein Downgrade) etc.
 *   4. Hardcode-Removal: pricing.js / slaAbo.js / enterpriseAnfrage.js enthalten
 *      KEINE alten Plan-Preis-Konstanten mehr (PRICES, PLAN_DATA, ADDONS-Array).
 *   5. HTML-Einbindung: pricing.html / sla_abo.html / enterprise_anfrage.html
 *      laden catalogRenderer.js VOR der jeweiligen Page-JS.
 *
 * Run: node --test --test-force-exit api/test/catalogRenderer.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");

const RENDERER_PATH = path.resolve(ROOT, "frontend/public/js/catalogRenderer.js");
// Inside Docker the frontend directory may not be mounted — skip gracefully.
const FRONTEND_AVAILABLE = existsSync(RENDERER_PATH);

// catalogRenderer.js is a browser-IIFE that also supports CJS via module.exports.
// frontend/package.json has "type":"module", so Node.js treats .js as ESM there —
// which means `module` is undefined and the module.exports branch never runs.
//
// Fix: execute via new Function() in the HOST V8 realm (not a VM context).
// This keeps all created objects (arrays, plain objects) in the host realm,
// so assert.deepStrictEqual works correctly without cross-realm comparison issues.
let renderer = {};
if (FRONTEND_AVAILABLE) {
  try {
    const src = readFileSync(RENDERER_PATH, "utf8");
    const modObj = { exports: {} };
    const globalProxy = {};
    const fn = new Function("module", "exports", "window", "globalThis", src); // host-realm execution
    fn(modObj, modObj.exports, undefined, globalProxy);
    renderer = modObj.exports;
  } catch { /* ignore — Docker without frontend mount */ }
}
const suite = FRONTEND_AVAILABLE ? describe : describe.skip;

/* ── Test-Catalog (deckt alle 5 Plans + 4 Tiers + 3 Add-ons ab) ─ */

const fixtureCatalog = {
  catalog_version: "2026.04.27.1",
  currency: "EUR",
  plan_variants: { STANDARD: "standard" },
  plans: [
    { key: "DEMO",        label: "DEMO",        display_label: "DEMO",        sort_order: 10, monthly_price_cents: 0,     interval: "trial14d", interval_label: "/ 14 Tage", description: "Demo" },
    { key: "BASIS",       label: "BASIS",       display_label: "BASIS",       sort_order: 20, monthly_price_cents: 15000, interval: "monthly",  interval_label: "/ Monat",   description: "Basis" },
    { key: "PLUS",        label: "PLUS",        display_label: "PLUS",        sort_order: 30, monthly_price_cents: 49900, interval: "monthly",  interval_label: "/ Monat",   description: "Plus", badge: "Empfohlen" },
    { key: "PRO",         label: "PRO",         display_label: "PRO",         sort_order: 40, monthly_price_cents: 79900, interval: "monthly",  interval_label: "/ Monat",   description: "Pro" },
    { key: "INDIVIDUELL", label: "Individuell", display_label: "Individuell", sort_order: 50, monthly_price_cents: null,  interval: "custom",   interval_label: "auf Anfrage", description: "Individuell" }
  ],
  features: [
    { feature_key: "legacy_access",      name: "Marketplace-Zugang",   category: "core",     sort_order: 100, visible_in_pricing: true, included_in_plans: ["DEMO","BASIS","PLUS","PRO","INDIVIDUELL"] },
    { feature_key: "timesheets",         name: "Stundenzettel",        category: "staffing", sort_order: 210, visible_in_pricing: true, included_in_plans: ["PLUS","PRO","INDIVIDUELL"] },
    { feature_key: "advanced_matching",  name: "Erweitertes Matching", category: "matching", sort_order: 300, visible_in_pricing: true, included_in_plans: ["PRO","INDIVIDUELL"] },
    { feature_key: "supplier_ratings",   name: "Lieferanten-Bewertungen", category: "matching", sort_order: 310, visible_in_pricing: true, included_in_plans: ["PRO","INDIVIDUELL"] },
    { feature_key: "vendor_pool",        name: "Vendor Pool",          category: "governance", sort_order: 600, visible_in_pricing: true, included_in_plans: ["INDIVIDUELL"] },
    { feature_key: "internal_only",      name: "Internes Feature",     category: "support",  sort_order: 800, visible_in_pricing: false, included_in_plans: ["PRO","INDIVIDUELL"] }
  ],
  addons: [
    { key: "api",        name: "API",          description: "API-Zugang",         price_cents: 39900, interval: "monthly",  active: true,  coming_soon: false, available_for_plans: ["INDIVIDUELL"] },
    { key: "sso",        name: "SSO",          description: "SSO-Integration",    price_cents: 44900, interval: "monthly",  active: true,  coming_soon: true,  available_for_plans: ["INDIVIDUELL"] },
    { key: "onboarding", name: "Onboarding",   description: "Dediziertes Onboarding", price_cents: 249900, interval: "onetime", active: true, coming_soon: false, available_for_plans: ["INDIVIDUELL"] }
  ],
  individual_tiers: [
    { key: "individuell_s",          short_label: "S",          label: "Individuell S",          min_employees: 1,   max_employees: 50,   description: "bis 50",  is_open_ended: false, is_enterprise: false },
    { key: "individuell_m",          short_label: "M",          label: "Individuell M",          min_employees: 51,  max_employees: 150,  description: "51-150",  is_open_ended: false, is_enterprise: false },
    { key: "individuell_l",          short_label: "L",          label: "Individuell L",          min_employees: 151, max_employees: 350,  description: "151-350", is_open_ended: false, is_enterprise: false },
    { key: "individuell_enterprise", short_label: "Enterprise", label: "Individuell Enterprise", min_employees: 351, max_employees: null, description: "ab 351",  is_open_ended: true,  is_enterprise: true }
  ],
  individuell_baseline: {
    base_monthly_cents: 249900,
    seats_included: 50,
    extra_seat_cents_per_month: 2900
  }
};

/* ────────────────────────────────────────────────────────────── *
 * 1. Helpers                                                     *
 * ────────────────────────────────────────────────────────────── */

suite("catalogRenderer.normalizePlanKey", () => {
  it("aliases werden auf kanonische Keys gemappt", () => {
    assert.equal(renderer.normalizePlanKey("FREE"), "DEMO");
    assert.equal(renderer.normalizePlanKey("ENTERPRISE"), "INDIVIDUELL");
    assert.equal(renderer.normalizePlanKey("INDIVIDUAL"), "INDIVIDUELL");
    assert.equal(renderer.normalizePlanKey("NOTDIENST"), "PLUS");
    assert.equal(renderer.normalizePlanKey("STARTER"), "BASIS");
  });
  it("unbekannt -> Default DEMO, fallback null moeglich", () => {
    assert.equal(renderer.normalizePlanKey("XYZ"), "DEMO");
    assert.equal(renderer.normalizePlanKey("XYZ", null), null);
  });
});

suite("catalogRenderer.fmtCents / fmtCentsOrCustom", () => {
  it("null -> null, 0 -> '0 EUR'", () => {
    assert.equal(renderer.fmtCents(null), null);
    assert.equal(renderer.fmtCents(0), "0 EUR");
  });
  it("15000 -> '150 EUR', 249900 -> '2.499 EUR'", () => {
    assert.equal(renderer.fmtCents(15000), "150 EUR");
    assert.equal(renderer.fmtCents(249900), "2.499 EUR");
  });
  it("fmtCentsOrCustom liefert Fallback bei null", () => {
    assert.equal(renderer.fmtCentsOrCustom(null), "Individuell");
    assert.equal(renderer.fmtCentsOrCustom(null, "auf Anfrage"), "auf Anfrage");
    assert.equal(renderer.fmtCentsOrCustom(15000), "150 EUR");
  });
});

suite("catalogRenderer.intervalLabel", () => {
  it("liefert sinnvolle Labels", () => {
    assert.equal(renderer.intervalLabel({ interval: "monthly" }), "/ Monat");
    assert.equal(renderer.intervalLabel({ interval: "trial14d" }), "/ 14 Tage");
    assert.equal(renderer.intervalLabel({ interval: "custom", interval_label: "auf Anfrage" }), "auf Anfrage");
  });
});

suite("catalogRenderer.findPlan / findAddon / findFeatureByKey", () => {
  it("findet Plans inkl. Aliases", () => {
    assert.equal(renderer.findPlan(fixtureCatalog, "PRO").key, "PRO");
    assert.equal(renderer.findPlan(fixtureCatalog, "FREE").key, "DEMO");
    assert.equal(renderer.findPlan(fixtureCatalog, "ENTERPRISE").key, "INDIVIDUELL");
    assert.equal(renderer.findPlan(fixtureCatalog, "XYZ"), null);
  });
  it("findet Addons", () => {
    assert.equal(renderer.findAddon(fixtureCatalog, "api").price_cents, 39900);
    assert.equal(renderer.findAddon(fixtureCatalog, "missing"), null);
  });
  it("findet Features", () => {
    assert.equal(renderer.findFeatureByKey(fixtureCatalog, "timesheets").name, "Stundenzettel");
    assert.equal(renderer.findFeatureByKey(fixtureCatalog, "missing"), null);
  });
});

suite("catalogRenderer.planHighlights", () => {
  it("filtert Features auf den Plan und limitiert", () => {
    const out = renderer.planHighlights(fixtureCatalog, "PRO", 10);
    // PRO hat: legacy_access, timesheets, advanced_matching, supplier_ratings, internal_only
    assert.equal(out.length, 5);
    // sortiert nach sort_order
    assert.equal(out[0].feature_key, "legacy_access");
    assert.equal(out[out.length - 1].feature_key, "internal_only");
  });
  it("INDIVIDUELL hat alle Features", () => {
    const out = renderer.planHighlights(fixtureCatalog, "INDIVIDUELL", 10);
    assert.equal(out.length, 6);
  });
  it("DEMO nur legacy_access", () => {
    const out = renderer.planHighlights(fixtureCatalog, "DEMO", 10);
    assert.equal(out.length, 1);
    assert.equal(out[0].feature_key, "legacy_access");
  });
  it("Limit funktioniert", () => {
    const out = renderer.planHighlights(fixtureCatalog, "INDIVIDUELL", 2);
    assert.equal(out.length, 2);
  });
});

/* ────────────────────────────────────────────────────────────── *
 * 2. Render-Funktionen                                           *
 * ────────────────────────────────────────────────────────────── */

suite("catalogRenderer.renderPlanCard", () => {
  it("PLUS bekommt recommended-Klasse + Empfohlen-Badge", () => {
    const html = renderer.renderPlanCard(fixtureCatalog.plans[2], {
      highlights: renderer.planHighlights(fixtureCatalog, "PLUS")
    });
    assert.match(html, /plan-card--recommended/);
    assert.match(html, /Empfohlen/);
    assert.match(html, /data-plan="PLUS"/);
    assert.match(html, /499 EUR/);
  });

  it("INDIVIDUELL hat 'Individuell auf Anfrage' Preis", () => {
    const indi = fixtureCatalog.plans[4];
    const html = renderer.renderPlanCard(indi, { highlights: [] });
    assert.match(html, /plan-card--enterprise/);
    assert.match(html, /Individuell <span>auf Anfrage<\/span>/);
  });

  it("isCurrent rendert Aktuell-Badge + disabled-Button", () => {
    const html = renderer.renderPlanCard(fixtureCatalog.plans[1], {
      highlights: [],
      isCurrent: true
    });
    assert.match(html, /Aktuell<\/span>/);
    assert.match(html, /disabled/);
  });

  it("isCanceling fuegt 'Kuendigung vorgemerkt'-Badge hinzu", () => {
    const html = renderer.renderPlanCard(fixtureCatalog.plans[2], {
      highlights: [],
      isCurrent: true,
      isCanceling: true
    });
    assert.match(html, /Kuendigung vorgemerkt/);
  });

  it("CTA-html wird wortwoertlich uebernommen", () => {
    const html = renderer.renderPlanCard(fixtureCatalog.plans[1], {
      highlights: [],
      cta: { html: '<a href="/x">CUSTOM_CTA</a>' }
    });
    assert.match(html, /CUSTOM_CTA/);
  });

  it("CTA mit href / onclick / primary funktioniert", () => {
    const a = renderer.renderPlanCard(fixtureCatalog.plans[1], { highlights: [], cta: { href: "/foo", label: "Go" } });
    assert.match(a, /href="\/foo"/);
    assert.match(a, /Go</);
    const b = renderer.renderPlanCard(fixtureCatalog.plans[1], { highlights: [], cta: { onclick: "doX()", label: "Klick", primary: true } });
    assert.match(b, /onclick="doX\(\)"/);
    assert.match(b, /ds-btn--primary/);
  });

  it("ohne plan -> leerer String, kein Throw", () => {
    assert.equal(renderer.renderPlanCard(null, {}), "");
  });
});

suite("catalogRenderer.renderTierCard", () => {
  it("S/M/L bekommen Baseline-Preis, Enterprise 'Individuell'", () => {
    const baseline = fixtureCatalog.individuell_baseline;
    const s = renderer.renderTierCard(fixtureCatalog.individual_tiers[0], baseline);
    const e = renderer.renderTierCard(fixtureCatalog.individual_tiers[3], baseline);
    assert.match(s, /2\.499 EUR/);
    assert.match(s, /1&ndash;50/);
    assert.match(e, /Individuell/);
    assert.match(e, /ab 351/);
  });
  it("ohne Tier -> leerer String", () => {
    assert.equal(renderer.renderTierCard(null, null), "");
  });
});

suite("catalogRenderer.renderComparisonHead/Body", () => {
  it("Head enthaelt alle 5 Plan-Header + PLUS highlight", () => {
    const head = renderer.renderComparisonHead(fixtureCatalog.plans);
    assert.match(head, /<th>Funktion<\/th>/);
    assert.match(head, /<th class="highlight">PLUS<\/th>/);
    assert.match(head, /<th>Individuell<\/th>/); // display_label in fixture is "Individuell"
  });
  it("Body gruppiert nach Kategorie", () => {
    const body = renderer.renderComparisonBody(fixtureCatalog.plans, fixtureCatalog.features);
    // Kategorie-Gruppen-Zeilen vorhanden
    assert.match(body, /class="group-row"/);
    // Check-Marker
    assert.match(body, /class="check"/);
    // Cross-Marker (DEMO hat kein Matching)
    assert.match(body, /class="cross"/);
  });
  it("leere Inputs -> leerer String", () => {
    assert.equal(renderer.renderComparisonHead([]), "");
    assert.equal(renderer.renderComparisonBody(fixtureCatalog.plans, []), "");
  });
});

/* ────────────────────────────────────────────────────────────── *
 * 3. Dynamische LOSS_MAP                                         *
 * ────────────────────────────────────────────────────────────── */

suite("catalogRenderer.deriveDowngradeLosses", () => {
  it("PRO -> BASIS verliert advanced_matching, supplier_ratings, timesheets", () => {
    const losses = renderer.deriveDowngradeLosses(fixtureCatalog, "PRO", "BASIS");
    const keys = losses.map((l) => l.feature_key).sort();
    assert.deepEqual(keys, ["advanced_matching", "supplier_ratings", "timesheets"]);
  });

  it("PRO -> DEMO verliert ALLES bis auf legacy_access", () => {
    const losses = renderer.deriveDowngradeLosses(fixtureCatalog, "PRO", "DEMO");
    const keys = losses.map((l) => l.feature_key);
    assert.ok(keys.includes("timesheets"));
    assert.ok(keys.includes("advanced_matching"));
    assert.ok(keys.includes("supplier_ratings"));
    assert.ok(!keys.includes("legacy_access"), "legacy_access ist in beiden Plaenen, kein Verlust");
  });

  it("BASIS -> PLUS = kein Downgrade -> []", () => {
    assert.deepEqual(renderer.deriveDowngradeLosses(fixtureCatalog, "BASIS", "PLUS"), []);
  });

  it("PRO -> PRO = Kein-Drift -> []", () => {
    assert.deepEqual(renderer.deriveDowngradeLosses(fixtureCatalog, "PRO", "PRO"), []);
  });

  it("respektiert visible_in_pricing=false als versteckt (default)", () => {
    const losses = renderer.deriveDowngradeLosses(fixtureCatalog, "PRO", "BASIS");
    const keys = losses.map((l) => l.feature_key);
    assert.ok(!keys.includes("internal_only"), "visible_in_pricing=false darf nicht im Verlust auftauchen");
  });

  it("optional inkl. interner Features wenn onlyVisibleInPricing=false", () => {
    const losses = renderer.deriveDowngradeLosses(fixtureCatalog, "PRO", "BASIS", { onlyVisibleInPricing: false });
    const keys = losses.map((l) => l.feature_key);
    assert.ok(keys.includes("internal_only"));
  });

  it("INDIVIDUELL -> PRO verliert vendor_pool", () => {
    const losses = renderer.deriveDowngradeLosses(fixtureCatalog, "INDIVIDUELL", "PRO");
    assert.ok(losses.some((l) => l.feature_key === "vendor_pool"));
  });

  it("Aliases werden normalisiert (ENTERPRISE -> INDIVIDUELL)", () => {
    const losses = renderer.deriveDowngradeLosses(fixtureCatalog, "ENTERPRISE", "BASIS");
    assert.ok(losses.length > 0);
    const keys = losses.map((l) => l.feature_key);
    assert.ok(keys.includes("vendor_pool"));
  });

  it("ohne catalog -> []", () => {
    assert.deepEqual(renderer.deriveDowngradeLosses(null, "PRO", "BASIS"), []);
  });
});

suite("catalogRenderer.renderDisclaimer", () => {
  it("enthaelt Plattform-Disclaimer + Versions-Stempel", () => {
    const html = renderer.renderDisclaimer(fixtureCatalog);
    assert.match(html, /keine Zeitarbeitsfirma/);
    assert.match(html, /v2026\.04\.27\.1/);
  });
  it("ohne catalog auch valide", () => {
    const html = renderer.renderDisclaimer(null);
    assert.match(html, /keine Zeitarbeitsfirma/);
  });
});

/* ────────────────────────────────────────────────────────────── *
 * 4. Hardcode-Removal Smoke-Checks                               *
 * ────────────────────────────────────────────────────────────── */

function readFile(rel) {
  return readFileSync(path.resolve(ROOT, rel), "utf8");
}

suite("Hardcodes wurden entfernt (Welle 8 Schritt 13)", () => {
  it("slaAbo.js: kein PRICES- oder PLAN_DATA-Objekt mehr", () => {
    const src = readFile("frontend/public/js/pages/slaAbo.js");
    assert.ok(!/var\s+PRICES\s*=\s*\{/.test(src), "PRICES = {...} darf nicht mehr existieren");
    assert.ok(!/var\s+PLAN_DATA\s*=\s*\{/.test(src), "PLAN_DATA = {...} darf nicht mehr existieren");
    assert.ok(!/var\s+LOSS_MAP\s*=\s*\{/.test(src), "LOSS_MAP = {...} darf nicht mehr existieren");
    assert.ok(/TC\.catalog/.test(src) || /window\.TC && window\.TC\.catalog/.test(src),
      "slaAbo.js sollte den Shared-Renderer nutzen");
    assert.ok(/deriveDowngradeLosses/.test(src), "slaAbo.js muss deriveDowngradeLosses aus dem Renderer rufen");
  });

  it("enterpriseAnfrage.js: kein hartcodiertes ADDONS-Array mehr", () => {
    const src = readFile("frontend/public/js/pages/enterpriseAnfrage.js");
    // alte Form: var ADDONS = [ { id: "api", ... ]
    assert.ok(!/var\s+ADDONS\s*=\s*\[\s*\{[^}]*id:\s*"api"/.test(src),
      "Hartcodiertes ADDONS-Array darf nicht mehr existieren");
    assert.ok(/applyCatalog/.test(src), "applyCatalog muss aus /api/public/catalog laden");
    assert.ok(/individuell_baseline/.test(src), "individuell_baseline muss gelesen werden");
  });

  it("pricing.js nutzt TC.catalog Shared-Renderer", () => {
    const src = readFile("frontend/public/js/pages/pricing.js");
    assert.ok(/TC\.catalog/.test(src) || /tcCatalog\(/.test(src),
      "pricing.js soll den Shared-Renderer nutzen");
    assert.ok(/renderPlanCard/.test(src) || /R\(\)\.renderPlanCard/.test(src),
      "pricing.js soll renderPlanCard aufrufen");
  });

  it("HTML-Files binden catalogRenderer.js VOR der jeweiligen Page-JS", () => {
    function assertOrder(html, beforePath, afterPath, label) {
      const a = html.indexOf(beforePath);
      const b = html.indexOf(afterPath);
      assert.ok(a >= 0, label + ": " + beforePath + " fehlt im HTML");
      assert.ok(b >= 0, label + ": " + afterPath + " fehlt im HTML");
      assert.ok(a < b, label + ": " + beforePath + " muss VOR " + afterPath + " kommen");
    }
    assertOrder(readFile("frontend/public/pricing.html"),
      "/public/js/catalogRenderer.js", "/public/js/pages/pricing.js", "pricing.html");
    assertOrder(readFile("frontend/public/sla_abo.html"),
      "/public/js/catalogRenderer.js", "/public/js/pages/slaAbo.js", "sla_abo.html");
    assertOrder(readFile("frontend/public/enterprise_anfrage.html"),
      "/public/js/catalogRenderer.js", "/public/js/pages/enterpriseAnfrage.js", "enterprise_anfrage.html");
  });
});
