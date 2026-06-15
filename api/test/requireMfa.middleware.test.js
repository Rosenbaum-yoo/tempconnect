/**
 * requireMfa-Middleware — Identitaets-Aufloesung + Audit-Only-Vertrag.
 * Regressionsanker fuer den F1.4-Bugfix: die separierte Staff-Session (staffUserId)
 * wurde vom Identitaets-Precheck nicht erkannt -> 401 auf ALLEN SCC-Mutationen,
 * obwohl enforce:false (Audit-Only) laut Vertrag NIE blockieren darf.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { requireMfa, isMfaEnforced } from "../middleware/requireMfa.js";

// Env-Sandbox: setzt MFA_ENFORCE/_FROM, stellt danach den Originalzustand wieder her.
function withMfaEnv(env, fn) {
  const keys = ["MFA_ENFORCE", "MFA_ENFORCE_FROM"];
  const prev = {};
  for (const k of keys) prev[k] = process.env[k];
  try {
    for (const k of keys) {
      if (env[k] === undefined) delete process.env[k];
      else process.env[k] = env[k];
    }
    return fn();
  } finally {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

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

/* ── isMfaEnforced — Env-Kill-Switch + Enrollment-Frist (O-05) ────────────── */

test("isMfaEnforced: MFA_ENFORCE ungesetzt -> false (Default Audit-Only)", () => {
  withMfaEnv({ MFA_ENFORCE: undefined, MFA_ENFORCE_FROM: undefined }, () => {
    assert.equal(isMfaEnforced(), false);
  });
});

test("isMfaEnforced: MFA_ENFORCE=true ohne Frist -> true", () => {
  withMfaEnv({ MFA_ENFORCE: "true", MFA_ENFORCE_FROM: undefined }, () => {
    assert.equal(isMfaEnforced(), true);
  });
});

test("isMfaEnforced: MFA_ENFORCE=true + Frist in der Zukunft -> false (Grace)", () => {
  withMfaEnv({ MFA_ENFORCE: "true", MFA_ENFORCE_FROM: "2026-09-01" }, () => {
    const beforeDeadline = Date.parse("2026-08-15T00:00:00Z");
    assert.equal(isMfaEnforced(beforeDeadline), false);
  });
});

test("isMfaEnforced: MFA_ENFORCE=true + Frist in der Vergangenheit -> true", () => {
  withMfaEnv({ MFA_ENFORCE: "true", MFA_ENFORCE_FROM: "2026-09-01" }, () => {
    const afterDeadline = Date.parse("2026-09-02T00:00:00Z");
    assert.equal(isMfaEnforced(afterDeadline), true);
  });
});

test("isMfaEnforced: MFA_ENFORCE=false -> false, auch mit vergangener Frist", () => {
  withMfaEnv({ MFA_ENFORCE: "false", MFA_ENFORCE_FROM: "2000-01-01" }, () => {
    assert.equal(isMfaEnforced(), false);
  });
});

test("isMfaEnforced: MFA_ENFORCE=true + unparsierbares Datum -> false (fail-safe Audit-Only, kein Hart-Enforce bei Typo)", () => {
  withMfaEnv({ MFA_ENFORCE: "true", MFA_ENFORCE_FROM: "2026-13-99" }, () => {
    assert.equal(isMfaEnforced(), false);
  });
});

/* ── requireMfa env-gesteuert (enforce weggelassen) ───────────────────────── */

test("env-gesteuert: MFA_ENFORCE ungesetzt + nicht enrolled -> Audit-Only next()", async () => {
  await withMfaEnv({ MFA_ENFORCE: undefined }, async () => {
    const guard = requireMfa({ pool: poolWithMfaEnabled(false) }); // enforce weggelassen
    const req = { session: { userId: "user-1" } };
    const res = mockRes();
    let nextCalled = false;
    await guard(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true, "Default ist Audit-Only");
    assert.equal(res.statusCode, null);
    assert.equal(req.mfaAuditNote, "mfa_not_enabled");
  });
});

test("env-gesteuert: MFA_ENFORCE=true + nicht enrolled -> 428 MFA_REQUIRED", async () => {
  await withMfaEnv({ MFA_ENFORCE: "true", MFA_ENFORCE_FROM: undefined }, async () => {
    const guard = requireMfa({ pool: poolWithMfaEnabled(false) }); // enforce weggelassen
    const res = mockRes();
    await guard({ session: { userId: "user-1" } }, res, () => { throw new Error("next darf nicht laufen"); });
    assert.equal(res.statusCode, 428);
    assert.equal(res.body.error.code, "MFA_REQUIRED");
  });
});

test("expliziter enforce:false gewinnt IMMER (auch bei MFA_ENFORCE=true)", async () => {
  await withMfaEnv({ MFA_ENFORCE: "true", MFA_ENFORCE_FROM: undefined }, async () => {
    const guard = requireMfa({ pool: poolWithMfaEnabled(false), enforce: false });
    const req = { session: { userId: "user-1" } };
    const res = mockRes();
    let nextCalled = false;
    await guard(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true, "expliziter Override haelt Audit-Only");
    assert.equal(res.statusCode, null);
    assert.equal(req.mfaAuditNote, "mfa_not_enabled");
  });
});
