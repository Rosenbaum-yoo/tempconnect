/**
 * Onboarding-Katalog Rollen-Split (Audit Finding 4): first_capacity (Personal einstellen)
 * ist Dienstleister-Aktion -> agency-only; Einsatzunternehmen bekommen first_demand
 * (Arbeitsplatzangebot erstellen). Vorher sah company faelschlich die agency-Form.
 *
 * Run: node --test --test-force-exit test/onboardingCatalog.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { STEP_CATALOG } from "../services/onboardingService.js";

const byKey = (k) => STEP_CATALOG.find((s) => s.key === k);

describe("Onboarding-Katalog — Rollen-Split", () => {
  it("first_capacity ist agency-only (Personal einstellen -> capacity_exchange_form)", () => {
    const s = byKey("first_capacity");
    assert.ok(s, "first_capacity existiert");
    assert.deepEqual(s.roles, ["agency"]);
    assert.equal(s.link, "/public/capacity_exchange_form.html");
  });

  it("first_demand ist company-only (Arbeitsplatzangebot erstellen -> marketplace_demand_create)", () => {
    const s = byKey("first_demand");
    assert.ok(s, "first_demand-Schritt existiert");
    assert.deepEqual(s.roles, ["company"]);
    assert.equal(s.link, "/public/marketplace_demand_create.html");
  });

  it("kein Erst-Aktion-Schritt fuehrt ein Unternehmen auf die agency-only Personal-Form", () => {
    const offenders = STEP_CATALOG.filter(
      (s) => s.link === "/public/capacity_exchange_form.html" && (s.roles == null || s.roles.includes("company"))
    );
    assert.equal(offenders.length, 0);
  });

  it("first_demand.detect probt company-seitige demand_requests (requester_company_id)", async () => {
    const s = byKey("first_demand");
    const calls = [];
    const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [{ "1": 1 }] }; } };
    const result = await s.detect(pool, "user-1", "org-1");
    assert.equal(result, true);
    assert.match(calls[0].sql, /demand_requests/);
    assert.match(calls[0].sql, /requester_company_id/);
    assert.deepEqual(calls[0].params, ["user-1"]);
  });

  it("keine Emoji-Icons mehr in den gesplitteten Schritten (Owner-Regel)", () => {
    assert.equal(byKey("first_capacity").icon, "");
    assert.equal(byKey("first_demand").icon, "");
  });
});
