/**
 * MFA/TOTP Service unit tests — tests exported DB-backed API with mock pool.
 * Internal crypto functions (base32, TOTP) are tested indirectly.
 *
 * Run: node --test --test-force-exit test/mfaService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { generateSecret, enableMFA, verifyToken, getMFAStatus } from "../services/mfaService.js";

function mockPool(queryResults = []) {
  let idx = 0;
  return { query() { return Promise.resolve(queryResults[idx++] || { rows: [], rowCount: 0 }); } };
}

describe("mfaService — generateSecret", () => {
  it("returns secret and otpauth_url", async () => {
    const pool = mockPool([{ rows: [{ email: "t@t.de" }] }, { rows: [] }]);
    const r = await generateSecret(pool, "u1");
    assert.ok(r.secret && r.secret.length >= 26);
    assert.ok(r.otpauth_url.includes("otpauth://totp/TempConnect:"));
  });

  it("uses fallback email when user not found", async () => {
    const pool = mockPool([{ rows: [] }, { rows: [] }]);
    const r = await generateSecret(pool, "u1");
    assert.ok(r.otpauth_url.includes("user"));
  });
});

describe("mfaService — enableMFA", () => {
  it("returns error when no secret stored", async () => {
    const pool = mockPool([{ rows: [{ mfa_secret: null }] }]);
    const r = await enableMFA(pool, "u1", "123456");
    assert.strictEqual(r.error, "NO_SECRET_GENERATED");
  });
});

describe("mfaService — verifyToken", () => {
  it("returns valid:true when MFA not enabled", async () => {
    const pool = mockPool([{ rows: [{ mfa_secret: null, mfa_enabled: false, mfa_backup_codes: [] }] }]);
    const r = await verifyToken(pool, "u1", "123456");
    assert.strictEqual(r.valid, true);
  });
});

describe("mfaService — getMFAStatus", () => {
  it("returns enabled:false for missing user", async () => {
    const pool = mockPool([{ rows: [] }]);
    assert.strictEqual((await getMFAStatus(pool, "u99")).enabled, false);
  });

  it("returns enabled + backup count", async () => {
    const pool = mockPool([{ rows: [{ mfa_enabled: true, mfa_backup_codes: ["a", "b"] }] }]);
    const r = await getMFAStatus(pool, "u1");
    assert.strictEqual(r.enabled, true);
    assert.strictEqual(r.backup_codes_remaining, 2);
  });

  it("returns 0 backup codes when null", async () => {
    const pool = mockPool([{ rows: [{ mfa_enabled: false, mfa_backup_codes: null }] }]);
    assert.strictEqual((await getMFAStatus(pool, "u1")).backup_codes_remaining, 0);
  });
});
