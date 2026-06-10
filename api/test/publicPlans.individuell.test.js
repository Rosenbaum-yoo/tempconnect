/**
 * Phase 2, Slice A — Routen-GLUE der INDIVIDUELL-Konfigurator-Endpunkte
 * in publicPlans.js. Die Preis-Mathematik selbst ist in
 * individuellPricingService.test.js erschoepfend gepinnt; hier wird NUR die
 * HTTP-Glue verifiziert: Query-Parsing (addons als Komma-String / wiederholter
 * Param / fehlend), das Zero-State-Contract (ungueltige Auswahl => 200 ok:false,
 * KEIN 500) und das Durchreichen des Engine-Ergebnisses.
 *
 * Direkter Handler-Aufruf mit Mock-req/res (kein HTTP-Server), Muster wie
 * staffControlCenter.killSwitch.routes.test.js.
 *
 * Run: node --test --test-force-exit api/test/publicPlans.individuell.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPublicPlansRouter } from "../routes/publicPlans.js";
import { INDIVIDUELL_BASELINE } from "../config/planCatalog.js";

const BASE = INDIVIDUELL_BASELINE.base_monthly_cents;

function mockRes() {
  const res = {
    _status: 200, _json: null, _headers: {},
    status(code) { res._status = code; return res; },
    json(data) { res._json = data; return res; },
    setHeader(k, v) { res._headers[k] = v; return res; }
  };
  return res;
}

function findHandler(router, method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (Object.keys(layer.route.methods)[0] === method && layer.route.path === path) {
      return layer.route.stack.map((s) => s.handle);
    }
  }
  throw new Error(`Route ${method} ${path} not found`);
}

async function call(method, path, req) {
  const router = createPublicPlansRouter({});
  const handlers = findHandler(router, method, path);
  const res = mockRes();
  await handlers[handlers.length - 1]({ query: {}, ...req }, res);
  return res;
}

describe("GET /public/individuell/quote", () => {
  it("valide Auswahl (Komma-String addons) => 200, ok:true, deterministische Summe", async () => {
    const res = await call("get", "/public/individuell/quote", { query: { seats: "75", addons: "api,spend" } });
    assert.equal(res._status, 200);
    assert.equal(res._json.ok, true);
    assert.equal(res._json.seats.billable_extra, 25);
    assert.equal(res._json.total_monthly_cents, BASE + 25 * 2900 + 39900 + 34900);
    assert.equal(res._headers["Cache-Control"], "no-store");
  });

  it("addons als wiederholter Query-Param (Array) wird akzeptiert", async () => {
    const res = await call("get", "/public/individuell/quote", { query: { seats: "50", addons: ["api", "ratecards"] } });
    assert.equal(res._json.ok, true);
    assert.equal(res._json.addons.length, 2);
    assert.equal(res._json.total_monthly_cents, BASE + 39900 + 29900);
  });

  it("freigabepflichtiges Add-on => ok:true, aber requires_staff_approval=true (UI: Anfrage)", async () => {
    const res = await call("get", "/public/individuell/quote", { query: { seats: "50", addons: "sla99" } });
    assert.equal(res._json.ok, true);
    assert.equal(res._json.requires_staff_approval, true);
  });

  it("ungueltige Auswahl (coming_soon) => 200 ok:false + errors, KEIN 500", async () => {
    const res = await call("get", "/public/individuell/quote", { query: { seats: "50", addons: "sso" } });
    assert.equal(res._status, 200);
    assert.equal(res._json.ok, false);
    assert.ok(res._json.errors.some((e) => e.code === "ADDON_COMING_SOON"));
    assert.equal(res._json.total_monthly_cents, null);
  });

  it("fehlende seats => 200 ok:false INVALID_SEATS (kein Wurf)", async () => {
    const res = await call("get", "/public/individuell/quote", { query: {} });
    assert.equal(res._status, 200);
    assert.equal(res._json.ok, false);
    assert.ok(res._json.errors.some((e) => e.code === "INVALID_SEATS"));
  });
});

describe("GET /public/individuell/configurator", () => {
  it("liefert Baseline + buchbar/Anfrage-Split mit Cache-Header", async () => {
    const res = await call("get", "/public/individuell/configurator", {});
    assert.equal(res._status, 200);
    assert.equal(res._json.baseline.base_monthly_cents, BASE);
    assert.ok(Array.isArray(res._json.bookable_addons) && res._json.bookable_addons.length >= 1);
    assert.ok(Array.isArray(res._json.inquiry_addons) && res._json.inquiry_addons.length >= 1);
    assert.match(String(res._headers["Cache-Control"] || ""), /max-age=300/);
  });
});
