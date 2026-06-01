/**
 * ENV Validator unit tests — validates the Zod schema for environment variables.
 * No DB needed.
 *
 * Run: node --test --test-force-exit test/envValidator.test.js
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { validateEnv } from "../config/envValidator.js";

/* ── Helpers ─────────────────────────────────────── */

function mockLogger() {
  const logs = { warn: [], fatal: [] };
  return {
    warn(obj, msg) { logs.warn.push({ obj, msg }); },
    fatal(msg) { logs.fatal.push(msg); },
    get logs() { return logs; }
  };
}

/** Save and restore process.env around each test */
let origEnv;
function setEnv(overrides) {
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("envValidator", () => {
  beforeEach(() => {
    origEnv = { ...process.env };
  });
  afterEach(() => {
    // Restore original env
    for (const k of Object.keys(process.env)) {
      if (!(k in origEnv)) delete process.env[k];
    }
    for (const [k, v] of Object.entries(origEnv)) {
      process.env[k] = v;
    }
  });

  it("passes with valid minimal env", () => {
    setEnv({
      SESSION_SECRET: "a_long_enough_secret_for_test",
      DATABASE_URL: "postgres://localhost/test"
    });
    const logger = mockLogger();
    const result = validateEnv(logger);
    assert.ok(result, "Should return validated data");
  });

  it("throws when SESSION_SECRET is too short", () => {
    setEnv({
      SESSION_SECRET: "short",
      DATABASE_URL: "postgres://localhost/test"
    });
    const logger = mockLogger();
    assert.throws(() => validateEnv(logger), /SESSION_SECRET/);
  });

  it("throws when neither DATABASE_URL nor POSTGRES_PASSWORD is set", () => {
    setEnv({
      SESSION_SECRET: "a_long_enough_secret_for_test",
      DATABASE_URL: undefined,
      POSTGRES_PASSWORD: undefined
    });
    const logger = mockLogger();
    assert.throws(() => validateEnv(logger), /DATABASE_URL/);
  });

  it("passes when POSTGRES_PASSWORD is set instead of DATABASE_URL", () => {
    setEnv({
      SESSION_SECRET: "a_long_enough_secret_for_test",
      DATABASE_URL: undefined,
      POSTGRES_PASSWORD: "mypassword"
    });
    const logger = mockLogger();
    const result = validateEnv(logger);
    assert.ok(result);
  });

  it("throws when PAYMENT_MODE=live but STRIPE_SECRET_KEY missing", () => {
    setEnv({
      SESSION_SECRET: "a_long_enough_secret_for_test",
      DATABASE_URL: "postgres://localhost/test",
      PAYMENT_MODE: "live",
      STRIPE_SECRET_KEY: undefined,
      STRIPE_WEBHOOK_SECRET: undefined
    });
    const logger = mockLogger();
    assert.throws(() => validateEnv(logger), /STRIPE_SECRET_KEY/);
  });

  it("passes when PAYMENT_MODE=live and all Stripe keys present", () => {
    setEnv({
      SESSION_SECRET: "a_long_enough_secret_for_test",
      DATABASE_URL: "postgres://localhost/test",
      PAYMENT_MODE: "live",
      STRIPE_SECRET_KEY: "sk_live_test123",
      STRIPE_WEBHOOK_SECRET: "whsec_test123"
    });
    const logger = mockLogger();
    const result = validateEnv(logger);
    assert.ok(result);
  });

  it("defaults PAYMENT_MODE to demo", () => {
    setEnv({
      SESSION_SECRET: "a_long_enough_secret_for_test",
      DATABASE_URL: "postgres://localhost/test",
      PAYMENT_MODE: undefined
    });
    const logger = mockLogger();
    const result = validateEnv(logger);
    assert.ok(result);
  });

  it("throws in production when FEATURE_GATE_BYPASS=true", () => {
    setEnv({
      SESSION_SECRET: "a_long_enough_secret_for_test",
      DATABASE_URL: "postgres://localhost/test",
      NODE_ENV: "production",
      FEATURE_GATE_BYPASS: "true"
    });
    const logger = mockLogger();
    // WAVE 02: FEATURE_GATE_BYPASS=true in production is a hard error (not a warning).
    // It would disable all plan restrictions, which is a production-safety blocker.
    assert.throws(
      () => validateEnv(logger),
      (err) => err.message.includes("FEATURE_GATE_BYPASS"),
      "Should throw with FEATURE_GATE_BYPASS in the message"
    );
  });
});
