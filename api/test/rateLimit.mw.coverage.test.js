import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { apiKeyAwareKeyGenerator, createRateLimiters } from "../middleware/rateLimit.js";

function noopLogger() {
  return { info() {}, warn() {}, error() {}, fatal() {} };
}

/* ── apiKeyAwareKeyGenerator ──────────────────────────────── */

test("apiKeyAwareKeyGenerator: x-api-key with tc_live_ prefix -> hashed key bucket", () => {
  const key = "tc_live_ABCDEFG";
  const req = { headers: { "x-api-key": key }, ip: "9.9.9.9" };
  const out = apiKeyAwareKeyGenerator(req);
  const expected = "key:" + crypto.createHash("sha256").update(key).digest("hex").slice(0, 24);
  assert.equal(out, expected);
  assert.notEqual(out, "9.9.9.9", "must not fall back to IP for live key");
});

test("apiKeyAwareKeyGenerator: bearer token with tc_live_ prefix -> hashed key bucket", () => {
  const key = "tc_live_BEARERTOKEN";
  const req = { headers: { authorization: "Bearer " + key }, ip: "1.1.1.1" };
  const out = apiKeyAwareKeyGenerator(req);
  const expected = "key:" + crypto.createHash("sha256").update(key).digest("hex").slice(0, 24);
  assert.equal(out, expected);
});

test("apiKeyAwareKeyGenerator: non-live api key -> falls back to req.ip", () => {
  const req = { headers: { "x-api-key": "some_other_key" }, ip: "2.2.2.2" };
  assert.equal(apiKeyAwareKeyGenerator(req), "2.2.2.2");
});

test("apiKeyAwareKeyGenerator: no key headers -> req.ip", () => {
  const req = { headers: {}, ip: "3.3.3.3" };
  assert.equal(apiKeyAwareKeyGenerator(req), "3.3.3.3");
});

test("apiKeyAwareKeyGenerator: missing headers object -> req.ip", () => {
  const req = { ip: "4.4.4.4" };
  assert.equal(apiKeyAwareKeyGenerator(req), "4.4.4.4");
});

/* ── createRateLimiters (memory store) ────────────────────── */

test("createRateLimiters: returns the full limiter set (memory store)", async () => {
  const limiters = await createRateLimiters(
    { RATE_LIMIT_STORE: "memory", BASE_URL: "https://app.example.com" },
    noopLogger()
  );
  const expectedKeys = [
    "authLimiter",
    "requestLimiter",
    "apiLimiter",
    "cronRateLimit",
    "analyticsIngestLimiter",
    "occRateLimit",
    "supportRateLimit",
    "warpExecutionRateLimit",
    "staffLoginLimiter",
    "staffMutationLimiter",
    "preregLimiter",
    "createPlanAwareRateLimiter"
  ];
  for (const k of expectedKeys) {
    assert.ok(k in limiters, `missing limiter: ${k}`);
  }
  // express-rate-limit limiters are middleware functions
  assert.equal(typeof limiters.authLimiter, "function");
  assert.equal(typeof limiters.createPlanAwareRateLimiter, "function");
});

test("createRateLimiters: local-dev detection loosens auth limits (localhost BASE_URL)", async () => {
  // Pure smoke that local-dev branch executes without throwing and yields the set.
  const limiters = await createRateLimiters(
    { RATE_LIMIT_STORE: "memory", BASE_URL: "http://localhost:3000" },
    noopLogger()
  );
  assert.equal(typeof limiters.apiLimiter, "function");
});

test("createRateLimiters: createPlanAwareRateLimiter returns async middleware that passes GET", async () => {
  const limiters = await createRateLimiters(
    { RATE_LIMIT_STORE: "memory", BASE_URL: "https://app.example.com" },
    noopLogger()
  );
  const mw = limiters.createPlanAwareRateLimiter({ getUserAndPlan: async () => ({ plan: "PRO" }) });
  assert.equal(typeof mw, "function");

  // GET is skipped -> next() immediately, no userId resolution
  let nextCalled = false;
  await mw({ method: "GET", session: {} }, {}, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test("plan-aware limiter: no session userId on POST -> next() (anon passthrough)", async () => {
  const limiters = await createRateLimiters(
    { RATE_LIMIT_STORE: "memory", BASE_URL: "https://app.example.com" },
    noopLogger()
  );
  const mw = limiters.createPlanAwareRateLimiter({});
  let nextCalled = false;
  await mw({ method: "POST", session: {} }, {}, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test("plan-aware limiter: POST within DEMO limit -> next(); over limit -> 429 PLAN_RATE_LIMIT", async () => {
  const limiters = await createRateLimiters(
    { RATE_LIMIT_STORE: "memory", BASE_URL: "https://app.example.com" },
    noopLogger()
  );
  // DEMO plan -> limit 10/min
  const mw = limiters.createPlanAwareRateLimiter({ getUserAndPlan: async () => ({ plan: "DEMO" }) });

  function res() {
    return {
      statusCode: null,
      body: null,
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.statusCode = c; return this; },
      json(p) { this.body = p; return this; }
    };
  }
  const req = { method: "POST", session: { userId: "user-demo" } };

  // First 10 should pass
  for (let i = 0; i < 10; i++) {
    const r = res();
    let nextCalled = false;
    await mw(req, r, () => { nextCalled = true; });
    assert.equal(nextCalled, true, `request ${i + 1} should pass`);
    assert.equal(r.statusCode, null);
  }
  // 11th exceeds limit
  const r = res();
  let nextCalled = false;
  await mw(req, r, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(r.statusCode, 429);
  assert.equal(r.body.error, "PLAN_RATE_LIMIT");
  assert.equal(r.body.plan, "DEMO");
  assert.equal(r.body.limit, 10);
  assert.ok(r.headers["Retry-After"]);
});

test("plan-aware limiter: req.user.plan takes precedence over getUserAndPlan", async () => {
  const limiters = await createRateLimiters(
    { RATE_LIMIT_STORE: "memory", BASE_URL: "https://app.example.com" },
    noopLogger()
  );
  let depCalled = false;
  const mw = limiters.createPlanAwareRateLimiter({
    getUserAndPlan: async () => { depCalled = true; return { plan: "DEMO" }; }
  });
  const req = { method: "POST", session: { userId: "u-pro" }, user: { plan: "PRO" } };
  let nextCalled = false;
  await mw(req, {}, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(depCalled, false, "should not query dep when req.user.plan present");
});
