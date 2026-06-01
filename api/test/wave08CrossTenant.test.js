/**
 * WAVE_08 – Cross-Tenant Org-Boundary Tests
 *
 * Sicherheitspruefung: Org A darf NIEMALS Daten von Org B sehen.
 * Betrifft: Referral-Codes, Credits.
 *
 * Prueft:
 *   - Referral: getOrCreateReferralCode SELECT ist auf user_id gebunden
 *   - Referral: INSERT benutzt user_id aus dem Argument
 *   - Credits: getBalance SELECT ist auf userId gebunden
 *   - Credits: Org B bekommt keine Org-A-Daten (parametrisiert)
 *   - Credits: earnCredits INSERT/UPDATE ist auf userId beschraenkt
 *   - Credits: spendCredits WHERE user_id = $1 verhindert fremde Balance-Aenderung
 *   - Credits: INSUFFICIENT_CREDITS bei rowCount=0
 *   - Credits: getTransactionHistory WHERE user_id = $1
 *   - Querschnitt: SQL-Params enthalten nie fremde user_id
 *
 * Run: node --test --test-force-exit test/wave08CrossTenant.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";

const ORG_A_USER = "00000000-0000-0000-0000-000000000001";
const ORG_B_USER = "00000000-0000-0000-0000-000000000002";

/* ── Pool-Mock-Fabrik ────────────────────────────────────────── */

function makePool(responses = []) {
  let idx = 0;
  const pool = {
    queries: [],
    async query(sql, params) {
      pool.queries.push({ sql, params });
      const r = responses[idx++];
      if (r instanceof Error) throw r;
      return r ?? { rows: [], rowCount: 0 };
    }
  };
  return pool;
}

/* ── Hilfsfunktionen ─────────────────────────────────────────── */

/** Prueft dass kein SQL-Parameter die fremde user_id enthaelt. */
function assertNoCrossTenantParam(queries, forbiddenUserId) {
  for (const { params } of queries) {
    if (params) {
      assert.ok(
        !params.includes(forbiddenUserId),
        `SQL-Parameter enthaelt unerlaubte fremde user_id: ${forbiddenUserId}`
      );
    }
  }
}

/* ── Referral-Codes ──────────────────────────────────────────── */

describe("Referral-Codes – Cross-Tenant Isolation (WAVE_08)", () => {
  it("getOrCreateReferralCode: SELECT ist auf eigene user_id gebunden", async () => {
    const { getOrCreateReferralCode } = await import("../services/referralProgramService.js");
    const pool = makePool([
      { rows: [{ user_id: ORG_A_USER, code: "AABBCCDD", is_pilot: false }], rowCount: 1 }
    ]);

    await getOrCreateReferralCode(pool, ORG_A_USER);

    const selectCall = pool.queries.find(c => /SELECT.*referral_codes/.test(c.sql));
    assert.ok(selectCall, "SELECT auf referral_codes muss existieren");
    assert.ok(selectCall.params.includes(ORG_A_USER), "ORG_A_USER muss im SELECT-Param sein");

    // Kein ORG_B_USER in irgendeinemParam
    assertNoCrossTenantParam(pool.queries, ORG_B_USER);
  });

  it("getOrCreateReferralCode: INSERT benutzt user_id aus Argument — nie fremde ID", async () => {
    const { getOrCreateReferralCode } = await import("../services/referralProgramService.js");
    const pool = makePool([
      { rows: [], rowCount: 0 },                                                  // SELECT: kein Eintrag
      { rows: [{ user_id: ORG_A_USER, code: "11223344" }], rowCount: 1 }         // INSERT
    ]);

    await getOrCreateReferralCode(pool, ORG_A_USER);

    const insertCall = pool.queries.find(c => /INSERT INTO referral_codes/.test(c.sql));
    assert.ok(insertCall, "INSERT INTO referral_codes muss existieren");
    assert.strictEqual(insertCall.params[0], ORG_A_USER);
    assert.notStrictEqual(insertCall.params[0], ORG_B_USER);
  });
});

/* ── Credits – Org-Boundary ──────────────────────────────────── */

describe("Credits – Cross-Tenant Isolation (WAVE_08)", () => {
  it("getBalance: SELECT ist auf eigene userId gebunden", async () => {
    const { getBalance } = await import("../services/creditService.js");
    const pool = makePool([
      { rows: [{ user_id: ORG_A_USER, balance: 100 }], rowCount: 1 }
    ]);

    await getBalance(pool, ORG_A_USER);

    const selectCall = pool.queries.find(c => /credit_accounts/.test(c.sql));
    assert.ok(selectCall, "SELECT auf credit_accounts muss existieren");
    assert.ok(selectCall.params.includes(ORG_A_USER), "ORG_A_USER muss im Param sein");
    assertNoCrossTenantParam(pool.queries, ORG_B_USER);
  });

  it("getBalance mit Org-B-User sieht keine Org-A-Daten (verschiedene Queries)", async () => {
    const { getBalance } = await import("../services/creditService.js");

    const poolB = makePool([
      { rows: [{ user_id: ORG_B_USER, balance: 50 }], rowCount: 1 }
    ]);

    const result = await getBalance(poolB, ORG_B_USER);

    assert.strictEqual(result.user_id, ORG_B_USER);
    const selectCall = poolB.queries.find(c => /credit_accounts/.test(c.sql));
    assert.ok(selectCall.params.includes(ORG_B_USER), "Nur ORG_B_USER im Param");
    assertNoCrossTenantParam(poolB.queries, ORG_A_USER);
  });

  it("earnCredits: INSERT/UPDATE ist auf userId des Aufrufers beschraenkt", async () => {
    const { earnCredits } = await import("../services/creditService.js");
    const pool = makePool([
      { rows: [], rowCount: 1 },
      { rows: [{ id: "tx-1", user_id: ORG_A_USER, amount: 10 }], rowCount: 1 }
    ]);

    await earnCredits(pool, ORG_A_USER, 10, "referral", "Referral-Bonus", null);

    for (const { params } of pool.queries) {
      if (params && params.length > 0) {
        assert.strictEqual(params[0], ORG_A_USER, "Erster Param muss ORG_A_USER sein");
      }
    }
    assertNoCrossTenantParam(pool.queries, ORG_B_USER);
  });

  it("spendCredits: WHERE user_id = $1 verhindert fremde Balance-Aenderung", async () => {
    const { spendCredits } = await import("../services/creditService.js");
    const pool = makePool([
      { rows: [], rowCount: 1 },
      { rows: [{ id: "tx-2", user_id: ORG_A_USER, amount: -5 }], rowCount: 1 }
    ]);

    await spendCredits(pool, ORG_A_USER, 5, "feature_use", null);

    const updateCall = pool.queries.find(c => /UPDATE credit_accounts/.test(c.sql));
    assert.ok(updateCall, "UPDATE credit_accounts muss existieren");
    assert.strictEqual(updateCall.params[0], ORG_A_USER);
    assert.notStrictEqual(updateCall.params[0], ORG_B_USER);
  });

  it("spendCredits: INSUFFICIENT_CREDITS wenn rowCount=0 — kein Fremdkontozugriff", async () => {
    const { spendCredits } = await import("../services/creditService.js");
    const pool = makePool([
      { rows: [], rowCount: 0 }  // UPDATE rowCount=0 -> balance zu niedrig
    ]);

    const result = await spendCredits(pool, ORG_A_USER, 9999, "big_spend", null);

    assert.deepStrictEqual(result, { error: "INSUFFICIENT_CREDITS" });
  });

  it("getTransactionHistory: WHERE user_id = $1 gebunden", async () => {
    const { getTransactionHistory } = await import("../services/creditService.js");
    const pool = makePool([
      { rows: [{ id: "tx-3", user_id: ORG_A_USER, amount: 10 }], rowCount: 1 }
    ]);

    await getTransactionHistory(pool, ORG_A_USER);

    const historyCall = pool.queries.find(c => /credit_transactions/.test(c.sql));
    assert.ok(historyCall, "Query auf credit_transactions muss existieren");
    assert.ok(historyCall.params[0] === ORG_A_USER, "Erster Param muss ORG_A_USER sein");
    assertNoCrossTenantParam(pool.queries, ORG_B_USER);
  });

  it("Org B sieht nicht Org A's Transaktionen (leere Antwort fuer Org B)", async () => {
    const { getTransactionHistory } = await import("../services/creditService.js");
    const pool = makePool([
      { rows: [], rowCount: 0 }  // Org B hat keine Transaktionen
    ]);

    const history = await getTransactionHistory(pool, ORG_B_USER);

    assert.strictEqual(history.length, 0);
    const historyCall = pool.queries[0];
    assert.strictEqual(historyCall.params[0], ORG_B_USER);
    assertNoCrossTenantParam(pool.queries, ORG_A_USER);
  });
});

/* ── Querschnitt ─────────────────────────────────────────────── */

describe("Cross-Tenant: SQL-Parameter enthalten nie fremde user_id", () => {
  it("getBalance Org-A ruft nie Org-B-Daten ab (exhaustiv)", async () => {
    const { getBalance } = await import("../services/creditService.js");
    const pool = makePool([
      { rows: [{ user_id: ORG_A_USER, balance: 200 }], rowCount: 1 }
    ]);

    await getBalance(pool, ORG_A_USER);

    assertNoCrossTenantParam(pool.queries, ORG_B_USER);
  });

  it("earnCredits Org-A schreibt nie in Org-B-Account (exhaustiv)", async () => {
    const { earnCredits } = await import("../services/creditService.js");
    const pool = makePool([
      { rows: [], rowCount: 1 },
      { rows: [{ id: "tx-x", user_id: ORG_A_USER }], rowCount: 1 }
    ]);

    await earnCredits(pool, ORG_A_USER, 5, "test", "Test", null);

    assertNoCrossTenantParam(pool.queries, ORG_B_USER);
  });
});
