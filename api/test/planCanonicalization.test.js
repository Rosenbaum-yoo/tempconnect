/**
 * Welle 8 Schritt 12 — Plan-/Tarif-Kanonisierung Tests.
 *
 * Pruefungen:
 *   1. normalizePlanKey: alle Aliase muessen kanonisch werden
 *   2. CANONICAL_PLAN_KEYS: genau 5, kein Drift
 *   3. SIZE_TIERS_V2 Schwellen 50/150/350
 *   4. classifyCompanySizeV2: Edge-Cases (1, 50, 51, 150, 151, 350, 351, 10000, 0, null)
 *   5. SIZE_CLASS_V1_TO_V2 Mapping bedient alle vier Klassen
 *   6. PLAN_CATALOG: jeder Plan hat annual_price_status
 *   7. Public-Endpoint /public/catalog liefert annual_price_status
 *   8. catalogVersionService.recordCatalogVersion: idempotent + altes deactivate
 *   9. catalogVersionService.ensureCurrentCatalogVersion: triggert nur bei Drift
 *
 * Run: node --test --test-force-exit api/test/planCanonicalization.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  CATALOG_VERSION,
  CANONICAL_PLAN_KEYS,
  PLAN_CATALOG,
  normalizePlanKey,
  isCanonicalPlanKey,
  getPlanByKey,
  getPlanPriceCentsByKey,
  buildCatalogResponse
} from "../config/planCatalog.js";
import {
  SIZE_TIERS,
  SIZE_TIERS_V2,
  SIZE_CLASS_V1_TO_V2,
  classifyCompanySize,
  classifyCompanySizeV2,
  v1ClassToV2Tier
} from "../services/pricingTierService.js";
import {
  recordCatalogVersion,
  ensureCurrentCatalogVersion,
  getActiveCatalogVersion,
  listCatalogVersions
} from "../services/catalogVersionService.js";
import { createPublicPlansRouter } from "../routes/publicPlans.js";

/* ── Mocks ─────────────────────────────────────────────────────── */

function sequencePool(...responses) {
  let idx = 0;
  const calls = [];
  function runQuery(sql, params) {
    calls.push({ sql, params });
    // Transparently handle transaction control commands — they don't consume a response slot
    if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(String(sql).trim())) {
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
    if (idx >= responses.length) {
      return Promise.reject(new Error(`Unexpected query #${idx + 1}: ${String(sql).slice(0, 80)}`));
    }
    const r = responses[idx++];
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve(r);
  }
  const pool = {
    calls,
    query: runQuery,
    connect: async () => {
      const clientCalls = [];
      return {
        query: async (sql, params) => {
          clientCalls.push({ sql, params });
          return runQuery(sql, params);
        },
        release: () => {}
      };
    }
  };
  return pool;
}

function findHandler(router, method, fragment) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (Object.keys(layer.route.methods)[0] === method && layer.route.path.includes(fragment)) {
      return layer.route.stack[layer.route.stack.length - 1].handle;
    }
  }
  throw new Error(`Route ${method} ${fragment} not found`);
}
function mockRes() {
  const headers = {};
  const res = {
    _json: null, headers,
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    json(d) { res._json = d; return res; },
    status() { return res; }
  };
  return res;
}

/* ────────────────────────────────────────────────────────────── *
 * 1. normalizePlanKey                                            *
 * ────────────────────────────────────────────────────────────── */

describe("normalizePlanKey", () => {
  it("kanonische Werte bleiben unveraendert", () => {
    for (const k of CANONICAL_PLAN_KEYS) assert.equal(normalizePlanKey(k), k);
  });

  it("FREE -> DEMO", () => {
    assert.equal(normalizePlanKey("FREE"), "DEMO");
    assert.equal(normalizePlanKey("free"), "DEMO");
  });

  it("ENTERPRISE / INDIVIDUAL -> INDIVIDUELL", () => {
    assert.equal(normalizePlanKey("ENTERPRISE"), "INDIVIDUELL");
    assert.equal(normalizePlanKey("Individual"), "INDIVIDUELL");
    assert.equal(normalizePlanKey("individuell"), "INDIVIDUELL");
  });

  it("NOTDIENST -> PLUS (Notdienst war frueher eigener Plan)", () => {
    assert.equal(normalizePlanKey("NOTDIENST"), "PLUS");
  });

  it("STARTER -> BASIS (Migration 002 Legacy)", () => {
    assert.equal(normalizePlanKey("STARTER"), "BASIS");
  });

  it("PROFESSIONAL -> PRO (defensiver Legacy-Alias)", () => {
    assert.equal(normalizePlanKey("PROFESSIONAL"), "PRO");
    assert.equal(normalizePlanKey("professional"), "PRO");
  });

  it("Unbekannter Wert -> Fallback DEMO", () => {
    assert.equal(normalizePlanKey("XYZ"), "DEMO");
  });

  it("null/undefined/leer -> Default DEMO", () => {
    assert.equal(normalizePlanKey(null), "DEMO");
    assert.equal(normalizePlanKey(undefined), "DEMO");
    assert.equal(normalizePlanKey(""), "DEMO");
  });

  it("fallback=null gibt null bei unbekannten Werten zurueck", () => {
    assert.equal(normalizePlanKey("XYZ", { fallback: null }), null);
    assert.equal(normalizePlanKey(null, { fallback: null }), null);
  });

  it("isCanonicalPlanKey nur true fuer 5 Werte", () => {
    for (const k of CANONICAL_PLAN_KEYS) assert.equal(isCanonicalPlanKey(k), true);
    for (const a of ["FREE", "ENTERPRISE", "NOTDIENST", "STARTER", ""]) {
      assert.equal(isCanonicalPlanKey(a), false);
    }
  });

  it("getPlanByKey akzeptiert Aliase", () => {
    assert.equal(getPlanByKey("FREE")?.key, "DEMO");
    assert.equal(getPlanByKey("ENTERPRISE")?.key, "INDIVIDUELL");
    assert.equal(getPlanByKey("XYZ"), null);
  });

  it("getPlanPriceCentsByKey akzeptiert Aliase", () => {
    assert.equal(getPlanPriceCentsByKey("FREE"), 0); // DEMO ist 0 Cent
    assert.equal(getPlanPriceCentsByKey("ENTERPRISE"), null); // INDIVIDUELL hat keinen festen Preis
    assert.equal(getPlanPriceCentsByKey("xyz"), null);
  });
});

/* ────────────────────────────────────────────────────────────── *
 * 1b. OE-08 — BASIS emergency_staffing (planFeatures.js)        *
 * ────────────────────────────────────────────────────────────── */

describe("OE-08 emergency_staffing BASIS-Entscheid", () => {
  it("BASIS ist in emergency_staffing enthalten (1x/Monat via PLAN_LIMITS)", async () => {
    const { planFeatures } = await import("../config/planFeatures.js");
    assert.ok(
      planFeatures.emergency_staffing.includes("BASIS"),
      "BASIS fehlt in emergency_staffing — OE-08 Entscheid vom 2026-05-27"
    );
  });

  it("DEMO ist NICHT in emergency_staffing enthalten", async () => {
    const { planFeatures } = await import("../config/planFeatures.js");
    assert.ok(!planFeatures.emergency_staffing.includes("DEMO"));
  });

  it("PLUS, PRO, INDIVIDUELL sind in emergency_staffing enthalten", async () => {
    const { planFeatures } = await import("../config/planFeatures.js");
    for (const p of ["PLUS", "PRO", "INDIVIDUELL"]) {
      assert.ok(planFeatures.emergency_staffing.includes(p), `${p} fehlt`);
    }
  });
});

/* ────────────────────────────────────────────────────────────── *
 * 2. CANONICAL_PLAN_KEYS                                         *
 * ────────────────────────────────────────────────────────────── */

describe("CANONICAL_PLAN_KEYS", () => {
  it("genau 5 Eintraege", () => assert.equal(CANONICAL_PLAN_KEYS.length, 5));
  it("Reihenfolge stabil", () => {
    assert.deepEqual([...CANONICAL_PLAN_KEYS], ["DEMO","BASIS","PLUS","PRO","INDIVIDUELL"]);
  });
  it("PLAN_CATALOG.length === CANONICAL_PLAN_KEYS.length", () => {
    assert.equal(PLAN_CATALOG.length, CANONICAL_PLAN_KEYS.length);
  });
});

/* ────────────────────────────────────────────────────────────── *
 * 3. SIZE_TIERS_V2 Schwellen 50/150/350                          *
 * ────────────────────────────────────────────────────────────── */

describe("SIZE_TIERS_V2", () => {
  it("S deckt 1-50, M deckt 51-150, L deckt 151-350", () => {
    const s = SIZE_TIERS_V2.find((t) => t.short === "S");
    const m = SIZE_TIERS_V2.find((t) => t.short === "M");
    const l = SIZE_TIERS_V2.find((t) => t.short === "L");
    const e = SIZE_TIERS_V2.find((t) => t.short === "Enterprise");
    assert.equal(s.min, 1);   assert.equal(s.max, 50);
    assert.equal(m.min, 51);  assert.equal(m.max, 150);
    assert.equal(l.min, 151); assert.equal(l.max, 350);
    assert.equal(e.min, 351); assert.equal(e.max, Infinity);
  });

  it("ueberlappungsfrei", () => {
    for (let i = 0; i < SIZE_TIERS_V2.length - 1; i++) {
      assert.ok(SIZE_TIERS_V2[i].max + 1 === SIZE_TIERS_V2[i + 1].min,
        `Luecke/Ueberlapp zwischen ${SIZE_TIERS_V2[i].tier} und ${SIZE_TIERS_V2[i + 1].tier}`);
    }
  });
});

/* ────────────────────────────────────────────────────────────── *
 * 4. classifyCompanySizeV2 Edge-Cases                            *
 * ────────────────────────────────────────────────────────────── */

describe("classifyCompanySizeV2", () => {
  it("1 -> S", () => assert.equal(classifyCompanySizeV2(1).tier, "individuell_s"));
  it("50 -> S", () => assert.equal(classifyCompanySizeV2(50).tier, "individuell_s"));
  it("51 -> M", () => assert.equal(classifyCompanySizeV2(51).tier, "individuell_m"));
  it("150 -> M", () => assert.equal(classifyCompanySizeV2(150).tier, "individuell_m"));
  it("151 -> L", () => assert.equal(classifyCompanySizeV2(151).tier, "individuell_l"));
  it("350 -> L", () => assert.equal(classifyCompanySizeV2(350).tier, "individuell_l"));
  it("351 -> Enterprise", () => assert.equal(classifyCompanySizeV2(351).tier, "individuell_enterprise"));
  it("10000 -> Enterprise", () => assert.equal(classifyCompanySizeV2(10000).tier, "individuell_enterprise"));
  it("0 / negativ / null / undefined -> null", () => {
    assert.equal(classifyCompanySizeV2(0), null);
    assert.equal(classifyCompanySizeV2(-5), null);
    assert.equal(classifyCompanySizeV2(null), null);
    assert.equal(classifyCompanySizeV2(undefined), null);
  });

  it("Backward-Compat: classifyCompanySize behaelt alte Schwellen", () => {
    assert.equal(classifyCompanySize(30).class, "I");
    assert.equal(classifyCompanySize(31).class, "II");
    assert.equal(classifyCompanySize(250).class, "II");
    assert.equal(classifyCompanySize(251).class, "III");
    assert.equal(classifyCompanySize(999).class, "III");
    assert.equal(classifyCompanySize(1000).class, "IV");
    // Beweis: V1 nicht V2 — 30 ist in V1 noch I, in V2 waere es S
    assert.equal(classifyCompanySize(30).max, 30);
  });

  it("V1 (klein I/II/III/IV) und V2 (S/M/L/Enterprise) liefern UNTERSCHIEDLICHE Klassifikation", () => {
    // 31 Mitarbeiter: V1 = II (31-250), V2 = S (1-50)
    assert.equal(classifyCompanySize(31).class, "II");
    assert.equal(classifyCompanySizeV2(31).tier, "individuell_s");
    // 200 Mitarbeiter: V1 = II (31-250), V2 = L (151-350)
    assert.equal(classifyCompanySize(200).class, "II");
    assert.equal(classifyCompanySizeV2(200).tier, "individuell_l");
  });
});

/* ────────────────────────────────────────────────────────────── *
 * 5. SIZE_CLASS_V1_TO_V2 Mapping                                 *
 * ────────────────────────────────────────────────────────────── */

describe("SIZE_CLASS_V1_TO_V2", () => {
  it("alle vier V1-Klassen sind gemappt", () => {
    for (const c of ["I", "II", "III", "IV"]) {
      assert.ok(SIZE_CLASS_V1_TO_V2[c], `V1-Klasse ${c} fehlt im Map`);
    }
  });
  it("Mappings sind alle gueltige V2-Tiers", () => {
    const validTiers = new Set(SIZE_TIERS_V2.map((t) => t.tier));
    for (const v of Object.values(SIZE_CLASS_V1_TO_V2)) {
      assert.ok(validTiers.has(v), `Ungueltiger V2-Tier ${v}`);
    }
  });
  it("v1ClassToV2Tier liefert korrekte Werte", () => {
    assert.equal(v1ClassToV2Tier("I"), "individuell_s");
    assert.equal(v1ClassToV2Tier("IV"), "individuell_enterprise");
    assert.equal(v1ClassToV2Tier("UNKNOWN"), null);
  });
});

/* ────────────────────────────────────────────────────────────── *
 * 6. PLAN_CATALOG annual_price_status                            *
 * ────────────────────────────────────────────────────────────── */

describe("Jahrespreise (annual_price_status)", () => {
  it("Jeder Plan hat annual_price_status (kein silent fehlen)", () => {
    for (const p of PLAN_CATALOG) {
      assert.ok(typeof p.annual_price_status === "string", `Plan ${p.key} ohne annual_price_status`);
      assert.ok(["not_offered", "preview", "active"].includes(p.annual_price_status),
        `Plan ${p.key} hat ungueltigen annual_price_status=${p.annual_price_status}`);
    }
  });

  it("Default-Status ist not_offered (kein versehentlicher Verkauf)", () => {
    for (const p of PLAN_CATALOG) {
      assert.equal(p.annual_price_status, "not_offered", `${p.key} sollte derzeit not_offered sein`);
    }
  });

  it("annual_price_cents ist null wenn nicht produktiv (preview/active wuerde Wert erfordern)", () => {
    for (const p of PLAN_CATALOG) {
      if (p.annual_price_status === "not_offered") {
        assert.ok(p.annual_price_cents === null, `${p.key} not_offered duerfte keinen Jahrespreis tragen`);
      }
    }
  });
});

/* ────────────────────────────────────────────────────────────── *
 * 7. Public-Endpoint liefert annual_price_status                 *
 * ────────────────────────────────────────────────────────────── */

describe("/public/catalog Snapshot", () => {
  it("liefert annual_price_status pro Plan", () => {
    const router = createPublicPlansRouter({});
    const handler = findHandler(router, "get", "/public/catalog");
    const res = mockRes();
    handler({}, res);
    for (const p of res._json.plans) {
      assert.ok(typeof p.annual_price_status === "string",
        `Plan ${p.key} ohne annual_price_status in /public/catalog`);
    }
  });

  it("CATALOG_VERSION-bump auf 2026.04.27.x stimmt", () => {
    const router = createPublicPlansRouter({});
    const handler = findHandler(router, "get", "/public/catalog");
    const res = mockRes();
    handler({}, res);
    assert.equal(res._json.catalog_version, CATALOG_VERSION);
    assert.match(CATALOG_VERSION, /^2026\.04\./);
  });

  it("buildCatalogResponse enthaelt nur kanonische Plan-Keys", () => {
    const out = buildCatalogResponse();
    for (const p of out.plans) {
      assert.ok(CANONICAL_PLAN_KEYS.includes(p.key), `nicht-kanonischer Plan ${p.key}`);
    }
  });
});

/* ────────────────────────────────────────────────────────────── *
 * 8. catalogVersionService                                       *
 * ────────────────────────────────────────────────────────────── */

describe("catalogVersionService.recordCatalogVersion", () => {
  it("idempotent: existierende Version wird unveraendert zurueckgegeben", async () => {
    const existingRow = { id: "v-existing", version: "2026.04.27.1", is_active: true };
    const pool = sequencePool({ rows: [existingRow] });
    const out = await recordCatalogVersion(pool, {
      version: "2026.04.27.1",
      snapshotJson: { plans: [] }
    });
    assert.equal(out.id, "v-existing");
    // Kein zweiter UPDATE/INSERT
    assert.equal(pool.calls.filter((c) => /INSERT INTO catalog_versions/i.test(String(c.sql))).length, 0);
  });

  it("neue Version: alte wird deaktiviert + neue eingefuegt", async () => {
    const inserted = { id: "v-new", version: "2026.05.01.1", is_active: true, created_at: new Date().toISOString() };
    const pool = sequencePool(
      { rows: [] },           // SELECT existing -> none
      { rows: [] },           // UPDATE old active = false
      { rows: [inserted] }    // INSERT new
    );
    const out = await recordCatalogVersion(pool, {
      version: "2026.05.01.1",
      snapshotJson: { plans: [{ key: "DEMO" }] },
      changelog: "Neue Preise",
      sizeTierThresholds: { S: 50, M: 150, L: 350 }
    });
    assert.equal(out.id, "v-new");
    const insertCall = pool.calls.find((c) => /INSERT INTO catalog_versions/i.test(String(c.sql)));
    assert.ok(insertCall, "INSERT-Call fehlt");
    assert.equal(insertCall.params[0], "2026.05.01.1");
    assert.equal(insertCall.params[1], "Neue Preise");
  });

  it("VERSION_REQUIRED ohne Version", async () => {
    const pool = sequencePool();
    await assert.rejects(
      () => recordCatalogVersion(pool, { snapshotJson: {} }),
      /VERSION_REQUIRED/
    );
  });

  it("SNAPSHOT_REQUIRED ohne snapshotJson", async () => {
    const pool = sequencePool();
    await assert.rejects(
      () => recordCatalogVersion(pool, { version: "x" }),
      /SNAPSHOT_REQUIRED/
    );
  });
});

describe("catalogVersionService.ensureCurrentCatalogVersion", () => {
  it("kein-op wenn aktive DB-Version === CATALOG_VERSION", async () => {
    const pool = sequencePool({ rows: [{ version: CATALOG_VERSION, is_active: true }] });
    const out = await ensureCurrentCatalogVersion(pool);
    assert.equal(out.version, CATALOG_VERSION);
    // Nur SELECT, kein INSERT
    assert.equal(pool.calls.length, 1);
  });

  it("triggert Recordung wenn DB leer ist", async () => {
    const pool = sequencePool(
      { rows: [] },                                                       // getActiveCatalogVersion
      { rows: [] },                                                       // SELECT existing in record
      { rows: [] },                                                       // UPDATE deactivate
      { rows: [{ id: "v-new", version: CATALOG_VERSION, is_active: true }]} // INSERT
    );
    const out = await ensureCurrentCatalogVersion(pool);
    assert.equal(out.version, CATALOG_VERSION);
    assert.ok(pool.calls.some((c) => /INSERT INTO catalog_versions/i.test(String(c.sql))));
  });

  it("Fehler killen den Boot NICHT — Logger.warn statt Throw", async () => {
    const pool = sequencePool(new Error("DB down"));
    const calls = [];
    const logger = { info() {}, warn(...a) { calls.push(["warn", ...a]); } };
    const out = await ensureCurrentCatalogVersion(pool, { logger });
    assert.equal(out, null);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][2], "catalog_version.sync_failed");
  });
});

describe("catalogVersionService.listCatalogVersions", () => {
  it("Listet mit Limit/Offset", async () => {
    const rows = [
      { id: "v-1", version: "2026.05.01.1", is_active: true, created_at: new Date().toISOString() },
      { id: "v-0", version: "2026.04.27.1", is_active: false, created_at: new Date(Date.now() - 86400000).toISOString() }
    ];
    const pool = sequencePool({ rows });
    const out = await listCatalogVersions(pool, { limit: 10, offset: 0 });
    assert.equal(out.length, 2);
    assert.equal(out[0].is_active, true);
  });

  it("Limit wird auf 1..500 geclampt", async () => {
    const pool = sequencePool({ rows: [] });
    await listCatalogVersions(pool, { limit: 99999, offset: -5 });
    assert.equal(pool.calls[0].params[0], 500);
    assert.equal(pool.calls[0].params[1], 0);
  });
});

describe("catalogVersionService.getActiveCatalogVersion", () => {
  it("liefert null bei leerer Tabelle", async () => {
    const pool = sequencePool({ rows: [] });
    const out = await getActiveCatalogVersion(pool);
    assert.equal(out, null);
  });
  it("liefert aktive Zeile", async () => {
    const row = { id: "x", version: "2026.04.27.1", is_active: true };
    const pool = sequencePool({ rows: [row] });
    const out = await getActiveCatalogVersion(pool);
    assert.equal(out.version, "2026.04.27.1");
  });
});
