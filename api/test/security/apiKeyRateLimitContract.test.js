/**
 * F1.2 Sicherheits-Kontrakte rund um API-Keys (Finalisierungsplan Welle F1):
 *  A) Pro-API-Key-Rate-Limiting: Limiter-Bucket haengt am Key-Hash, nicht an der IP
 *     -> geleakter Key kann das Limit nicht per IP-Rotation umgehen.
 *  B) No-Bridge-Kontrakt: requireAuth verlangt eine SESSION — reine API-Key-Auth
 *     erfuellt requireAuth NICHT. Eine Oeffnung (Public-API-Launch) ist eine bewusste
 *     Owner-Architekturentscheidung; dieser Test macht jede stille Aenderung sichtbar.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { apiKeyAwareKeyGenerator } from "../../middleware/rateLimit.js";
import { requireAuth } from "../../middleware/auth.js";

const KEY_A = "tc_live_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const KEY_B = "tc_live_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

test("keyGenerator: x-api-key -> key:<hash>-Bucket, NIE der Klartext-Key", () => {
  const k = apiKeyAwareKeyGenerator({ headers: { "x-api-key": KEY_A }, ip: "1.2.3.4" });
  assert.match(k, /^key:[a-f0-9]{24}$/);
  assert.ok(!k.includes("tc_live_"), "Klartext-Key darf nicht im Bucket-Namen landen");
});

test("keyGenerator: Bearer tc_live_* wird gleich behandelt wie x-api-key", () => {
  const viaHeader = apiKeyAwareKeyGenerator({ headers: { "x-api-key": KEY_A }, ip: "1.2.3.4" });
  const viaBearer = apiKeyAwareKeyGenerator({ headers: { authorization: "Bearer " + KEY_A }, ip: "9.9.9.9" });
  assert.equal(viaHeader, viaBearer, "gleicher Key => gleicher Bucket, IP egal");
});

test("keyGenerator: gleicher Key von VERSCHIEDENEN IPs => gleicher Bucket (keine IP-Rotation)", () => {
  const a = apiKeyAwareKeyGenerator({ headers: { "x-api-key": KEY_A }, ip: "1.1.1.1" });
  const b = apiKeyAwareKeyGenerator({ headers: { "x-api-key": KEY_A }, ip: "2.2.2.2" });
  assert.equal(a, b);
});

test("keyGenerator: verschiedene Keys => verschiedene Buckets", () => {
  const a = apiKeyAwareKeyGenerator({ headers: { "x-api-key": KEY_A }, ip: "1.1.1.1" });
  const b = apiKeyAwareKeyGenerator({ headers: { "x-api-key": KEY_B }, ip: "1.1.1.1" });
  assert.notEqual(a, b);
});

test("keyGenerator: ohne API-Key (Session/anonym) bleibt IP-basiert (Bestandsverhalten)", () => {
  assert.equal(apiKeyAwareKeyGenerator({ headers: {}, ip: "5.6.7.8" }), "5.6.7.8");
  assert.equal(apiKeyAwareKeyGenerator({ headers: { authorization: "Bearer not_a_tc_key" }, ip: "5.6.7.8" }), "5.6.7.8");
  assert.equal(apiKeyAwareKeyGenerator({ headers: { "x-api-key": "wrong_prefix_123" }, ip: "5.6.7.8" }), "5.6.7.8");
});

test("No-Bridge-Kontrakt: reine API-Key-Auth erfuellt requireAuth NICHT (401)", () => {
  let status = null, nextCalled = false;
  const res = { status(s) { status = s; return this; }, json() { return this; } };
  requireAuth({ isApiKeyAuth: true, apiKeyScopes: ["read"], session: {} }, res, () => { nextCalled = true; });
  assert.equal(status, 401, "API-Key ohne Session muss an requireAuth scheitern");
  assert.equal(nextCalled, false);
});

test("No-Bridge-Kontrakt: Session-Auth passiert requireAuth (Gegenprobe)", () => {
  let nextCalled = false;
  const res = { status() { throw new Error("darf nicht"); }, json() { return this; } };
  requireAuth({ session: { userId: "u1" } }, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});
