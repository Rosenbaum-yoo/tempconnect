/**
 * requireMfa-Middleware — Identitaets-Aufloesung + Audit-Only-Vertrag.
 * Regressionsanker fuer den F1.4-Bugfix: die separierte Staff-Session (staffUserId)
 * wurde vom Identitaets-Precheck nicht erkannt -> 401 auf ALLEN SCC-Mutationen,
 * obwohl enforce:false (Audit-Only) laut Vertrag NIE blockieren darf.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { requireMfa } from "../middleware/requireMfa.js";

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

function poolWithMfaEnabled(enabled) {
  return { query: async () => ({ rows: [{ mfa_enabled: enabled }] }) };
}

test("Staff-Session (nur staffUserId) + Audit-Only -> next() mit Audit-Note, KEIN 401", async () => {
  const guard = requireMfa({ pool: poolWithMfaEnabled(false), enforce: false });
  const req = { session: { staffUserId: "staff-1" } };
  const res = mockRes();
  let nextCalled = false;
  await guard(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true, "Audit-Only darf nie blockieren");
  assert.equal(res.statusCode, null);
  assert.equal(req.mfaAuditNote, "mfa_not_enabled");
});

test("Staff-Session + Enforce + nicht enrolled -> 428 MFA_REQUIRED (nicht 401)", async () => {
  const guard = requireMfa({ pool: poolWithMfaEnabled(false), enforce: true });
  const req = { session: { staffUserId: "staff-1" } };
  const res = mockRes();
  let nextCalled = false;
  await guard(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 428);
  assert.equal(res.body.error.code, "MFA_REQUIRED");
});

test("keine Identitaet (weder userId noch staffUserId) -> 401 NOT_AUTHENTICATED", async () => {
  const guard = requireMfa({ pool: poolWithMfaEnabled(true), enforce: false });
  const res = mockRes();
  await guard({ session: {} }, res, () => { throw new Error("next darf nicht laufen"); });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, "NOT_AUTHENTICATED");
});

test("Plattform-Session (userId) + enrolled + frische Verifikation -> next()", async () => {
  const guard = requireMfa({ pool: poolWithMfaEnabled(true), enforce: true });
  const req = { session: { userId: "user-1", mfaVerifiedAt: Date.now() } };
  const res = mockRes();
  let nextCalled = false;
  await guard(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test("Plattform-Session + enrolled + abgelaufene Verifikation + Enforce -> 428 MFA_VERIFY_REQUIRED", async () => {
  const guard = requireMfa({ pool: poolWithMfaEnabled(true), enforce: true, maxAgeMs: 1000 });
  const req = { session: { userId: "user-1", mfaVerifiedAt: Date.now() - 5000 } };
  const res = mockRes();
  await guard(req, res, () => { throw new Error("next darf nicht laufen"); });
  assert.equal(res.statusCode, 428);
  assert.equal(res.body.error.code, "MFA_VERIFY_REQUIRED");
});
