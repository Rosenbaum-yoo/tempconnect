/**
 * Enterprise Services unit tests — Credit, Mentoring, SSO, Feature Override services.
 * Tests service logic with mock pool (no real DB).
 *
 * Run: node --test --test-force-exit test/enterpriseServices.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";

/* ── Mock pool helper ──────────────────────────────── */
function mockPool(queryResults = []) {
  let callIndex = 0;
  return {
    queries: [],
    query(sql, params) {
      this.queries.push({ sql, params });
      const result = queryResults[callIndex] || { rows: [], rowCount: 0 };
      callIndex++;
      return Promise.resolve(result);
    }
  };
}

/* ── Credit Service ────────────────────────────────── */
describe("creditService", () => {
  it("getBalance returns account object for non-existent account", async () => {
    const { getBalance } = await import("../services/creditService.js");
    const pool = mockPool([{ rows: [] }, { rows: [] }]);
    const account = await getBalance(pool, 999);
    assert.strictEqual(account.balance, 0);
    assert.strictEqual(account.user_id, 999);
  });

  it("getBalance returns account with balance", async () => {
    const { getBalance } = await import("../services/creditService.js");
    const pool = mockPool([{ rows: [{ user_id: 1, balance: 500 }] }]);
    const account = await getBalance(pool, 1);
    assert.strictEqual(account.balance, 500);
  });

  it("getPackages returns available packages", async () => {
    const { getPackages } = await import("../services/creditService.js");
    const packages = [
      { id: 1, name: "Starter", credits: 100, price_eur: 9.99, is_active: true },
      { id: 2, name: "Pro", credits: 500, price_eur: 39.99, is_active: true }
    ];
    const pool = mockPool([{ rows: packages }]);
    const result = await getPackages(pool);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].name, "Starter");
  });

  it("earnCredits creates transaction", async () => {
    const { earnCredits } = await import("../services/creditService.js");
    const pool = mockPool([
      { rows: [{ id: 1, user_id: 1, balance: 0 }] }, // upsert account
      { rows: [{ id: 10, amount: 50, type: "earn" }] } // insert transaction
    ]);
    const tx = await earnCredits(pool, 1, 50, "bonus");
    assert.ok(pool.queries.length >= 2);
    assert.ok(tx);
  });
});

/* ── Mentoring Service ─────────────────────────────── */
describe("mentoringService", () => {
  it("createSession creates a mentoring session", async () => {
    const { createSession } = await import("../services/mentoringService.js");
    const session = { id: 1, mentor_id: 1, mentee_id: 2, topic: "JS", status: "scheduled" };
    const pool = mockPool([{ rows: [session] }]);
    const result = await createSession(pool, 1, 2, { topic: "JS" });
    assert.strictEqual(result.topic, "JS");
    assert.strictEqual(result.status, "scheduled");
  });

  it("getMentoringCount returns count number", async () => {
    const { getMentoringCount } = await import("../services/mentoringService.js");
    const pool = mockPool([{ rows: [{ count: 5 }] }]);
    const count = await getMentoringCount(pool, 1);
    assert.strictEqual(count, 5);
  });

  it("listSessions returns array of sessions", async () => {
    const { listSessions } = await import("../services/mentoringService.js");
    const pool = mockPool([{ rows: [{ id: 1 }, { id: 2 }] }]);
    const result = await listSessions(pool, 1);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].id, 1);
  });
});

/* ── SSO Service ───────────────────────────────────── */
describe("ssoService", () => {
  it("getSSOConfig returns null for non-existent org", async () => {
    const { getSSOConfig } = await import("../services/ssoService.js");
    const pool = mockPool([{ rows: [] }]);
    const config = await getSSOConfig(pool, 999);
    assert.strictEqual(config, null);
  });

  it("getSSOConfig returns config when exists", async () => {
    const { getSSOConfig } = await import("../services/ssoService.js");
    const cfg = { id: 1, org_id: 1, idp_entity_id: "https://idp.test", is_active: true };
    const pool = mockPool([{ rows: [cfg] }]);
    const result = await getSSOConfig(pool, 1);
    assert.strictEqual(result.idp_entity_id, "https://idp.test");
    assert.strictEqual(result.is_active, true);
  });

  it("generateSPMetadata returns XML string", async () => {
    const { generateSPMetadata } = await import("../services/ssoService.js");
    const xml = generateSPMetadata(42, "https://app.test");
    assert.ok(xml.includes("EntityDescriptor"), "Should contain SAML EntityDescriptor");
    assert.ok(xml.includes("42"), "Should contain org ID");
  });
});

/* ── Feature Override Service ──────────────────────── */
describe("featureOverrideService", () => {
  it("checkOverride returns overridden:false when no override", async () => {
    const { checkOverride } = await import("../services/featureOverrideService.js");
    const pool = mockPool([{ rows: [] }]);
    const result = await checkOverride(pool, "sla_access", 1);
    assert.deepStrictEqual(result, { overridden: false });
  });

  it("checkOverride returns overridden:true with enabled value", async () => {
    const { checkOverride } = await import("../services/featureOverrideService.js");
    const pool = mockPool([{ rows: [{ enabled: false }] }]);
    const result = await checkOverride(pool, "sla_access", 1);
    assert.deepStrictEqual(result, { overridden: true, enabled: false });
  });

  it("upsertOverride calls INSERT ON CONFLICT", async () => {
    const { upsertOverride } = await import("../services/featureOverrideService.js");
    const override = { id: 1, feature_key: "sla_access", org_id: 1, enabled: true };
    const pool = mockPool([{ rows: [override] }]);
    const result = await upsertOverride(pool, {
      featureKey: "sla_access", orgId: 1, enabled: true, reason: "test", createdBy: 1
    });
    assert.strictEqual(result.feature_key, "sla_access");
    assert.ok(pool.queries[0].sql.includes("INSERT"));
  });

  it("deleteOverride returns true when row deleted", async () => {
    const { deleteOverride } = await import("../services/featureOverrideService.js");
    const pool = mockPool([{ rowCount: 1 }]);
    const result = await deleteOverride(pool, 1);
    assert.strictEqual(result, true);
  });

  it("deleteOverride returns false when no row found", async () => {
    const { deleteOverride } = await import("../services/featureOverrideService.js");
    const pool = mockPool([{ rowCount: 0 }]);
    const result = await deleteOverride(pool, 999);
    assert.strictEqual(result, false);
  });
});
