/**
 * planCatalog tests.
 *
 * Verifiziert:
 *   - Tier-Schwellen (50/150/350) und Klassifikation V2.
 *   - Konsistenz Plan-Katalog vs PLAN_LIMITS / planFeatures.
 *   - Feature-Katalog: jeder feature_key existiert in planFeatures-Matrix.
 *   - Addon-Katalog: alle Cents > 0, keine Doppelschluessel.
 *   - Public-Endpoints liefern stabile Struktur und Cache-Header.
 *
 * Run: node --test --test-force-exit api/test/planCatalog.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  CATALOG_VERSION,
  CATALOG_CURRENCY,
  PLAN_VARIANTS,
  PLAN_CATALOG,
  FEATURE_CATALOG,
  FEATURE_CATEGORIES,
  ADDON_CATALOG,
  INDIVIDUAL_TIER_CATALOG,
  INDIVIDUELL_BASELINE,
  getIndividualTierByEmployeeCountV2,
  getPlanPriceCentsByKey,
  listPublicPlans,
  listPublicFeatures,
  listPublicAddons,
  buildCatalogResponse
} from "../config/planCatalog.js";
import { PLAN, INDIVIDUAL_TIERS, planFeatures } from "../config/planFeatures.js";
import { PLAN_LIMITS } from "../services/userService.js";
import { createPublicPlansRouter } from "../routes/publicPlans.js";

// ── Tier-Schwellen V2 ──────────────────────────────────────────

describe("getIndividualTierByEmployeeCountV2 (50/150/350)", () => {
  it("1 -> S", () => assert.equal(getIndividualTierByEmployeeCountV2(1), INDIVIDUAL_TIERS.S));
  it("50 -> S", () => assert.equal(getIndividualTierByEmployeeCountV2(50), INDIVIDUAL_TIERS.S));
  it("51 -> M", () => assert.equal(getIndividualTierByEmployeeCountV2(51), INDIVIDUAL_TIERS.M));
  it("150 -> M", () => assert.equal(getIndividualTierByEmployeeCountV2(150), INDIVIDUAL_TIERS.M));
  it("151 -> L", () => assert.equal(getIndividualTierByEmployeeCountV2(151), INDIVIDUAL_TIERS.L));
  it("350 -> L", () => assert.equal(getIndividualTierByEmployeeCountV2(350), INDIVIDUAL_TIERS.L));
  it("351 -> Enterprise", () => assert.equal(getIndividualTierByEmployeeCountV2(351), INDIVIDUAL_TIERS.ENTERPRISE));
  it("10000 -> Enterprise", () => assert.equal(getIndividualTierByEmployeeCountV2(10000), INDIVIDUAL_TIERS.ENTERPRISE));
  it("0 / negative / null -> S (clamp)", () => {
    assert.equal(getIndividualTierByEmployeeCountV2(0), INDIVIDUAL_TIERS.S);
    assert.equal(getIndividualTierByEmployeeCountV2(-5), INDIVIDUAL_TIERS.S);
    assert.equal(getIndividualTierByEmployeeCountV2(null), INDIVIDUAL_TIERS.S);
  });
});

describe("INDIVIDUAL_TIER_CATALOG", () => {
  it("hat genau 4 Eintraege (S/M/L/Enterprise)", () => {
    assert.equal(INDIVIDUAL_TIER_CATALOG.length, 4);
  });
  it("Schwellen sind ueberlappungsfrei", () => {
    for (let i = 0; i < INDIVIDUAL_TIER_CATALOG.length - 1; i++) {
      const a = INDIVIDUAL_TIER_CATALOG[i];
      const b = INDIVIDUAL_TIER_CATALOG[i + 1];
      assert.ok(a.max_employees < b.min_employees, `tier ${a.key} max (${a.max_employees}) < ${b.key} min (${b.min_employees})`);
    }
  });
  it("Enterprise ist open-ended (max_employees null)", () => {
    const ent = INDIVIDUAL_TIER_CATALOG.find((t) => t.is_enterprise);
    assert.ok(ent);
    assert.equal(ent.max_employees, null);
    assert.equal(ent.is_open_ended, true);
  });
});

// ── Plan-Katalog ──────────────────────────────────────────────

describe("PLAN_CATALOG", () => {
  it("enthaelt genau 5 oeffentliche Plaene", () => {
    assert.equal(PLAN_CATALOG.length, 5);
    const keys = PLAN_CATALOG.map((p) => p.key);
    assert.deepEqual(keys.sort(), [PLAN.BASIS, PLAN.DEMO, PLAN.INDIVIDUELL, PLAN.PLUS, PLAN.PRO].sort());
  });

  it("Preise stimmen mit PLAN_LIMITS (EUR -> Cents) ueberein", () => {
    for (const row of PLAN_CATALOG) {
      const limits = PLAN_LIMITS[row.key];
      if (!limits || row.monthly_price_cents == null) continue;
      const expectedCents = limits.price * 100;
      assert.equal(row.monthly_price_cents, expectedCents, `${row.key} price drift`);
    }
  });

  it("INDIVIDUELL hat keinen festen Preis und braucht Anfrage", () => {
    const indi = PLAN_CATALOG.find((p) => p.key === PLAN.INDIVIDUELL);
    assert.equal(indi.monthly_price_cents, null);
    assert.equal(indi.requires_individual_inquiry, true);
    assert.equal(indi.selectable_via_self_service, false);
  });

  it("getPlanPriceCentsByKey gibt korrekte Preise zurueck", () => {
    assert.equal(getPlanPriceCentsByKey(PLAN.BASIS), 15000);
    assert.equal(getPlanPriceCentsByKey(PLAN.PLUS), 49900);
    assert.equal(getPlanPriceCentsByKey(PLAN.PRO), 79900);
    assert.equal(getPlanPriceCentsByKey(PLAN.INDIVIDUELL), null);
    assert.equal(getPlanPriceCentsByKey("UNKNOWN"), null);
  });
});

// ── Feature-Katalog ──────────────────────────────────────────

describe("FEATURE_CATALOG", () => {
  it("jedes feature_key existiert in planFeatures-Matrix", () => {
    for (const f of FEATURE_CATALOG) {
      assert.ok(Array.isArray(planFeatures[f.feature_key]), `Unknown feature_key '${f.feature_key}' in catalog`);
    }
  });

  it("included_in_plans wird aus planFeatures-Matrix abgeleitet", () => {
    for (const f of FEATURE_CATALOG) {
      const expected = planFeatures[f.feature_key].slice().sort();
      const actual = f.included_in_plans.slice().sort();
      assert.deepEqual(actual, expected, `included_in_plans drift fuer '${f.feature_key}'`);
    }
  });

  it("Kategorie ist immer ein bekannter Wert", () => {
    const known = new Set(Object.values(FEATURE_CATEGORIES));
    for (const f of FEATURE_CATALOG) {
      assert.ok(known.has(f.category), `Unbekannte Kategorie '${f.category}' fuer '${f.feature_key}'`);
    }
  });

  it("listPublicFeatures liefert nur visible_in_pricing=true und active=true", () => {
    const out = listPublicFeatures();
    for (const f of out) {
      assert.equal(f.visible_in_pricing, true);
      assert.equal(f.active, true);
    }
  });
});

// ── Addon-Katalog ────────────────────────────────────────────

describe("ADDON_CATALOG", () => {
  it("keine doppelten keys", () => {
    const keys = ADDON_CATALOG.map((a) => a.key);
    assert.equal(new Set(keys).size, keys.length);
  });

  it("alle Cents-Preise nicht-negativ und ganzzahlig", () => {
    for (const a of ADDON_CATALOG) {
      assert.ok(Number.isInteger(a.price_cents), `${a.key} price_cents nicht ganzzahlig`);
      assert.ok(a.price_cents >= 0, `${a.key} price_cents negativ`);
    }
  });

  it("interval ist 'monthly' oder 'onetime'", () => {
    for (const a of ADDON_CATALOG) {
      assert.ok(["monthly", "onetime"].includes(a.interval), `${a.key} interval=${a.interval}`);
    }
  });

  it("available_for_plans verweist nur auf existente Plaene", () => {
    const knownPlans = new Set(PLAN_CATALOG.map((p) => p.key));
    for (const a of ADDON_CATALOG) {
      for (const p of a.available_for_plans) {
        assert.ok(knownPlans.has(p), `${a.key} verweist auf unbekannten Plan ${p}`);
      }
    }
  });

  it("listPublicAddons enthaelt nur active=true", () => {
    const out = listPublicAddons();
    for (const a of out) assert.equal(a.active, true);
  });
});

// ── Individuell-Baseline ─────────────────────────────────────

describe("INDIVIDUELL_BASELINE", () => {
  it("base_monthly_cents = 249900 (2.499 EUR)", () => {
    assert.equal(INDIVIDUELL_BASELINE.base_monthly_cents, 249900);
  });
  it("seats_included = 50", () => {
    assert.equal(INDIVIDUELL_BASELINE.seats_included, 50);
  });
  it("extra_seat_cents_per_month = 2900 (29 EUR)", () => {
    assert.equal(INDIVIDUELL_BASELINE.extra_seat_cents_per_month, 2900);
  });
});

// ── Public-Endpoints ─────────────────────────────────────────

function findHandler(router, method, pathFragment) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (Object.keys(layer.route.methods)[0] === method && layer.route.path.includes(pathFragment)) {
      return layer.route.stack[layer.route.stack.length - 1].handle;
    }
  }
  throw new Error(`Route ${method} ${pathFragment} not found`);
}

function mockRes() {
  const headers = {};
  const res = {
    _json: null,
    headers,
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    json(data) { res._json = data; return res; },
    status() { return res; }
  };
  return res;
}

describe("public plan/feature/addon endpoints", () => {
  const router = createPublicPlansRouter({});

  it("GET /public/plans liefert Plans + Tiers + Baseline", () => {
    const handler = findHandler(router, "get", "/public/plans");
    const res = mockRes();
    handler({}, res);
    assert.equal(res._json.catalog_version, CATALOG_VERSION);
    assert.equal(res._json.currency, CATALOG_CURRENCY);
    assert.deepEqual(res._json.plan_variants, PLAN_VARIANTS);
    assert.equal(res._json.plans.length, 5);
    assert.equal(res._json.individual_tiers.length, 4);
    assert.equal(res._json.individuell_baseline.seats_included, 50);
    assert.match(res.headers["cache-control"], /max-age=300/);
    assert.ok(res.headers["etag"].includes(CATALOG_VERSION));
  });

  it("GET /public/features liefert features mit included_in_plans", () => {
    const handler = findHandler(router, "get", "/public/features");
    const res = mockRes();
    handler({}, res);
    assert.equal(res._json.catalog_version, CATALOG_VERSION);
    assert.ok(Array.isArray(res._json.features));
    assert.ok(res._json.features.length > 0);
    for (const f of res._json.features) {
      assert.ok(Array.isArray(f.included_in_plans));
    }
  });

  it("GET /public/addons liefert addons + baseline", () => {
    const handler = findHandler(router, "get", "/public/addons");
    const res = mockRes();
    handler({}, res);
    assert.equal(res._json.catalog_version, CATALOG_VERSION);
    assert.ok(res._json.addons.length >= 9);
    assert.equal(res._json.individuell_baseline.base_monthly_cents, 249900);
  });

  it("GET /public/catalog liefert kombinierte Antwort", () => {
    const handler = findHandler(router, "get", "/public/catalog");
    const res = mockRes();
    handler({}, res);
    assert.equal(res._json.catalog_version, CATALOG_VERSION);
    assert.ok(res._json.plans.length === 5);
    assert.ok(res._json.features.length > 0);
    assert.ok(res._json.addons.length >= 9);
    assert.ok(res._json.individual_tiers.length === 4);
    assert.ok(res._json.maturity_gates);
  });
});

// ── buildCatalogResponse Stabilitaet ─────────────────────────

describe("buildCatalogResponse", () => {
  it("liefert dieselbe Form wie /public/catalog", () => {
    const out = buildCatalogResponse();
    assert.ok(out.catalog_version);
    assert.ok(Array.isArray(out.plans));
    assert.ok(Array.isArray(out.features));
    assert.ok(Array.isArray(out.addons));
    assert.ok(Array.isArray(out.individual_tiers));
    assert.ok(out.individuell_baseline);
    assert.ok(out.plan_variants);
  });
});
