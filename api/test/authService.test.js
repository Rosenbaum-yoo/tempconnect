/**
 * AuthService unit tests — all exported functions.
 * Mock pool: no real DB. Tests SQL delegation, null handling, transaction flow.
 *
 * Run: node --test --test-force-exit test/authService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  emailExists,
  createUser,
  setUserGeo,
  createSubscription,
  verifyEmail,
  getVerificationInfo,
  setVerificationToken,
  getUserCredentials,
  getUserByEmail,
  setResetToken,
  validateResetToken,
  resetPassword,
  createOrgWithMembership
} from "../services/authService.js";

/* ── helpers ──────────────────────────────────────────────── */

function mockPool(response) {
  const queries = [];
  return {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (typeof response === "function") return response(sql, params);
      return response;
    },
    queries
  };
}

function sequencePool(...responses) {
  let idx = 0;
  const queries = [];
  return {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (idx >= responses.length) throw new Error(`Unexpected query #${idx + 1}`);
      const r = responses[idx++];
      if (r instanceof Error) throw r;
      return r;
    },
    queries
  };
}

/* ═══════════════════════════════════════════════════════════
   emailExists
   ═══════════════════════════════════════════════════════════ */

describe("emailExists", () => {
  it("returns true when email is found", async () => {
    const pool = mockPool({ rowCount: 1 });
    assert.strictEqual(await emailExists(pool, "a@b.de"), true);
    assert.ok(pool.queries[0].sql.includes("SELECT 1 FROM users"));
    assert.deepStrictEqual(pool.queries[0].params, ["a@b.de"]);
  });

  it("returns false when email is not found", async () => {
    const pool = mockPool({ rowCount: 0 });
    assert.strictEqual(await emailExists(pool, "x@y.de"), false);
  });

  it("propagates pool error", async () => {
    const pool = { query: async () => { throw new Error("conn_refused"); } };
    await assert.rejects(() => emailExists(pool, "a@b.de"), { message: "conn_refused" });
  });
});

/* ═══════════════════════════════════════════════════════════
   createUser
   ═══════════════════════════════════════════════════════════ */

describe("createUser", () => {
  const INPUT = {
    role: "company",
    email: "test@firma.de",
    passwordHash: "hashed123",
    companyName: "Firma GmbH",
    phone: "+49123",
    postalCode: "80331",
    city: "München",
    verificationToken: "tok-abc"
  };

  it("inserts user and returns id", async () => {
    const pool = mockPool({ rows: [{ id: "user-42" }] });
    const id = await createUser(pool, INPUT);
    assert.strictEqual(id, "user-42");
    assert.ok(pool.queries[0].sql.includes("INSERT INTO users"));
    assert.strictEqual(pool.queries[0].params[0], "company");
    assert.strictEqual(pool.queries[0].params[1], "test@firma.de");
    assert.strictEqual(pool.queries[0].params[2], "hashed123");
  });

  it("defaults optional fields to null", async () => {
    const pool = mockPool({ rows: [{ id: "user-43" }] });
    await createUser(pool, {
      role: "agency",
      email: "a@b.de",
      passwordHash: "h",
      verificationToken: "t"
    });
    const params = pool.queries[0].params;
    assert.strictEqual(params[3], null); // companyName
    assert.strictEqual(params[4], null); // phone
    assert.strictEqual(params[5], null); // postalCode
    assert.strictEqual(params[6], null); // city
  });

  it("propagates DB error", async () => {
    const pool = { query: async () => { throw new Error("unique_violation"); } };
    await assert.rejects(() => createUser(pool, INPUT), { message: "unique_violation" });
  });
});

/* ═══════════════════════════════════════════════════════════
   setUserGeo
   ═══════════════════════════════════════════════════════════ */

describe("setUserGeo", () => {
  it("updates latitude and longitude", async () => {
    const pool = mockPool({ rowCount: 1 });
    await setUserGeo(pool, "user-1", 48.1351, 11.582);
    assert.ok(pool.queries[0].sql.includes("UPDATE users SET latitude"));
    assert.deepStrictEqual(pool.queries[0].params, [48.1351, 11.582, "user-1"]);
  });
});

/* ═══════════════════════════════════════════════════════════
   createSubscription
   ═══════════════════════════════════════════════════════════ */

describe("createSubscription", () => {
  it("inserts active subscription", async () => {
    const pool = mockPool({ rowCount: 1 });
    await createSubscription(pool, "user-1", "PRO");
    assert.ok(pool.queries[0].sql.includes("INSERT INTO subscriptions"));
    assert.deepStrictEqual(pool.queries[0].params, ["user-1", "PRO"]);
  });

  // Regression (Plan-Normalisierung via normalizePlanKey): der alte Pfad mappte
  // DEMO -> 'FREE' und schrieb 'FREE' in subscriptions.plan, was die CHECK-Constraint
  // subscriptions_plan_check (Mig 102: nur DEMO/BASIS/PLUS/PRO/INDIVIDUELL) verletzt
  // haette. Jetzt constraint-konform: FREE/''/DEMO/undefined -> 'DEMO' (14-Tage-Trial).
  it("maps FREE/empty/DEMO/undefined to constraint-safe 'DEMO' with 14-day trial", async () => {
    for (const input of ["FREE", "", "DEMO", undefined]) {
      const pool = mockPool({ rowCount: 1 });
      await createSubscription(pool, "user-1", input);
      assert.strictEqual(pool.queries[0].params[1], "DEMO", `plan ${String(input)} -> DEMO`);
      assert.ok(pool.queries[0].sql.includes("INTERVAL '14 days'"), "DEMO -> 14-Tage-Trial");
    }
  });

  it("canonicalizes ENTERPRISE/INDIVIDUAL aliases to 'INDIVIDUELL' with 1-month interval", async () => {
    for (const input of ["ENTERPRISE", "INDIVIDUAL", "individuell"]) {
      const pool = mockPool({ rowCount: 1 });
      await createSubscription(pool, "user-1", input);
      assert.strictEqual(pool.queries[0].params[1], "INDIVIDUELL", `plan ${input} -> INDIVIDUELL`);
      assert.ok(pool.queries[0].sql.includes("INTERVAL '1 month'"), "INDIVIDUELL -> Monatsintervall");
    }
  });
});

/* ═══════════════════════════════════════════════════════════
   verifyEmail
   ═══════════════════════════════════════════════════════════ */

describe("verifyEmail", () => {
  it("returns {id, email} on valid token", async () => {
    const pool = mockPool({ rows: [{ id: "u-1", email: "a@b.de" }] });
    const result = await verifyEmail(pool, "valid-token");
    assert.deepStrictEqual(result, { id: "u-1", email: "a@b.de" });
    assert.ok(pool.queries[0].sql.includes("is_verified=TRUE"));
    assert.deepStrictEqual(pool.queries[0].params, ["valid-token"]);
  });

  it("returns null for invalid/expired token", async () => {
    const pool = mockPool({ rows: [] });
    assert.strictEqual(await verifyEmail(pool, "bad-token"), null);
  });
});

/* ═══════════════════════════════════════════════════════════
   getVerificationInfo
   ═══════════════════════════════════════════════════════════ */

describe("getVerificationInfo", () => {
  it("returns verification fields", async () => {
    const row = { email: "a@b.de", is_verified: false, verification_token: "tok" };
    const pool = mockPool({ rows: [row] });
    assert.deepStrictEqual(await getVerificationInfo(pool, "u-1"), row);
  });

  it("returns null when user not found", async () => {
    const pool = mockPool({ rows: [] });
    assert.strictEqual(await getVerificationInfo(pool, "missing"), null);
  });
});

/* ═══════════════════════════════════════════════════════════
   setVerificationToken
   ═══════════════════════════════════════════════════════════ */

describe("setVerificationToken", () => {
  it("updates token for user", async () => {
    const pool = mockPool({ rowCount: 1 });
    await setVerificationToken(pool, "u-1", "new-tok");
    assert.deepStrictEqual(pool.queries[0].params, ["new-tok", "u-1"]);
  });
});

/* ═══════════════════════════════════════════════════════════
   getUserCredentials
   ═══════════════════════════════════════════════════════════ */

describe("getUserCredentials", () => {
  it("returns id, role, password_hash on found", async () => {
    const creds = { id: "u-1", role: "company", password_hash: "$2b$..." };
    const pool = mockPool({ rows: [creds] });
    assert.deepStrictEqual(await getUserCredentials(pool, "a@b.de"), creds);
    assert.ok(pool.queries[0].sql.includes("password_hash"));
  });

  it("returns null for unknown email", async () => {
    const pool = mockPool({ rows: [] });
    assert.strictEqual(await getUserCredentials(pool, "nope@b.de"), null);
  });
});

/* ═══════════════════════════════════════════════════════════
   getUserByEmail
   ═══════════════════════════════════════════════════════════ */

describe("getUserByEmail", () => {
  it("returns id and email", async () => {
    const pool = mockPool({ rows: [{ id: "u-1", email: "a@b.de" }] });
    assert.deepStrictEqual(await getUserByEmail(pool, "a@b.de"), { id: "u-1", email: "a@b.de" });
  });

  it("returns null for unknown email", async () => {
    const pool = mockPool({ rows: [] });
    assert.strictEqual(await getUserByEmail(pool, "x@y.de"), null);
  });
});

/* ═══════════════════════════════════════════════════════════
   setResetToken
   ═══════════════════════════════════════════════════════════ */

describe("setResetToken", () => {
  it("sets token and expiry", async () => {
    const expires = new Date("2026-04-01T00:00:00Z");
    const pool = mockPool({ rowCount: 1 });
    await setResetToken(pool, "u-1", "reset-tok", expires);
    assert.deepStrictEqual(pool.queries[0].params, ["reset-tok", expires, "u-1"]);
    assert.ok(pool.queries[0].sql.includes("reset_token"));
    assert.ok(pool.queries[0].sql.includes("reset_token_expires"));
  });
});

/* ═══════════════════════════════════════════════════════════
   validateResetToken
   ═══════════════════════════════════════════════════════════ */

describe("validateResetToken", () => {
  it("returns user for valid non-expired token", async () => {
    const pool = mockPool({ rows: [{ id: "u-1", email: "a@b.de" }] });
    const result = await validateResetToken(pool, "valid-tok");
    assert.deepStrictEqual(result, { id: "u-1", email: "a@b.de" });
    assert.ok(pool.queries[0].sql.includes("reset_token_expires > NOW()"));
  });

  it("returns null for expired/invalid token", async () => {
    const pool = mockPool({ rows: [] });
    assert.strictEqual(await validateResetToken(pool, "expired-tok"), null);
  });
});

/* ═══════════════════════════════════════════════════════════
   resetPassword
   ═══════════════════════════════════════════════════════════ */

describe("resetPassword", () => {
  it("updates password_hash and clears token", async () => {
    const pool = mockPool({ rowCount: 1 });
    await resetPassword(pool, "u-1", "new-hash");
    assert.ok(pool.queries[0].sql.includes("password_hash=$1"));
    assert.ok(pool.queries[0].sql.includes("reset_token=NULL"));
    assert.ok(pool.queries[0].sql.includes("reset_token_expires=NULL"));
    assert.deepStrictEqual(pool.queries[0].params, ["new-hash", "u-1"]);
  });
});

/* ═══════════════════════════════════════════════════════════
   createOrgWithMembership — transactional
   ═══════════════════════════════════════════════════════════ */

describe("createOrgWithMembership", () => {
  function txPool(orgId, shouldFail = false) {
    const queries = [];
    let released = false;
    const client = {
      query: async (sql, params) => {
        queries.push({ sql, params });
        if (shouldFail && sql.includes("INSERT INTO org_memberships")) {
          throw new Error("fk_violation");
        }
        if (sql.includes("INSERT INTO organizations")) {
          return { rows: [{ id: orgId }] };
        }
        return { rows: [], rowCount: 1 };
      },
      release: () => { released = true; }
    };
    return {
      connect: async () => client,
      queries,
      get released() { return released; }
    };
  }

  it("creates org + membership + updates user in a transaction", async () => {
    const pool = txPool("org-new-1");
    const orgId = await createOrgWithMembership(pool, "user-1", {
      orgName: "Test GmbH",
      orgType: "company",
      roleKey: "owner"
    });
    assert.strictEqual(orgId, "org-new-1");
    const sqls = pool.queries.map(q => q.sql);
    assert.ok(sqls[0] === "BEGIN");
    assert.ok(sqls[1].includes("INSERT INTO organizations"));
    assert.ok(sqls[2].includes("INSERT INTO org_memberships"));
    assert.ok(sqls[3].includes("UPDATE users SET org_id"));
    assert.ok(sqls[4] === "COMMIT");
    assert.strictEqual(pool.released, true);
  });

  it("rolls back on error and re-throws", async () => {
    const pool = txPool("org-fail", true);
    await assert.rejects(
      () => createOrgWithMembership(pool, "user-1", { orgName: "X", orgType: "company", roleKey: "owner" }),
      { message: "fk_violation" }
    );
    const sqls = pool.queries.map(q => q.sql);
    assert.ok(sqls.includes("ROLLBACK"));
    assert.strictEqual(pool.released, true);
  });

  it("generates slug from orgName", async () => {
    const pool = txPool("org-slug-1");
    await createOrgWithMembership(pool, "user-1", {
      orgName: "Müller & Söhne GmbH",
      orgType: "agency",
      roleKey: "admin"
    });
    const insertOrg = pool.queries.find(q => q.sql.includes("INSERT INTO organizations"));
    const slug = insertOrg.params[1]; // second param is slug
    assert.ok(slug.startsWith("m"), "Slug should start with lowercase letter from name");
    assert.ok(!slug.includes(" "), "Slug should not contain spaces");
    assert.ok(!slug.includes("&"), "Slug should not contain special chars");
  });

  it("defaults orgName to 'org' when null", async () => {
    const pool = txPool("org-default");
    await createOrgWithMembership(pool, "user-1", {
      orgName: null,
      orgType: "company",
      roleKey: "owner"
    });
    const insertOrg = pool.queries.find(q => q.sql.includes("INSERT INTO organizations"));
    const slug = insertOrg.params[1];
    assert.ok(slug.startsWith("org-"), "Null orgName should default to 'org' prefix");
  });

  it("always releases client even on ROLLBACK error", async () => {
    const queries = [];
    let released = false;
    const client = {
      query: async (sql) => {
        queries.push(sql);
        if (sql.includes("INSERT INTO organizations")) throw new Error("db_down");
        if (sql === "ROLLBACK") throw new Error("rollback_also_fails");
        return { rows: [], rowCount: 0 };
      },
      release: () => { released = true; }
    };
    const pool = { connect: async () => client };
    await assert.rejects(
      () => createOrgWithMembership(pool, "user-1", { orgName: "X", orgType: "company", roleKey: "owner" }),
      { message: "db_down" }
    );
    assert.strictEqual(released, true, "Client must be released even if ROLLBACK fails");
  });

  // Plan-Kanonisierung (normalizePlanKey): org.plan landet immer in der CHECK-Constraint
  // von organizations (DEMO/BASIS/PLUS/PRO/INDIVIDUELL) — Aliase werden gemappt.
  it("canonicalizes plan alias to a constraint-safe org plan (enterprise -> INDIVIDUELL)", async () => {
    const pool = txPool("org-plan-1");
    await createOrgWithMembership(pool, "user-1", {
      orgName: "Plan GmbH", orgType: "company", roleKey: "owner", plan: "enterprise"
    });
    const insertOrg = pool.queries.find(q => q.sql.includes("INSERT INTO organizations"));
    assert.ok(insertOrg.params.includes("INDIVIDUELL"), "enterprise -> INDIVIDUELL");
  });

  it("falls back to 'DEMO' for an unknown plan value (constraint-safe)", async () => {
    const pool = txPool("org-plan-2");
    await createOrgWithMembership(pool, "user-1", {
      orgName: "X", orgType: "company", roleKey: "owner", plan: "voellig-unbekannt"
    });
    const insertOrg = pool.queries.find(q => q.sql.includes("INSERT INTO organizations"));
    assert.ok(insertOrg.params.includes("DEMO"), "unbekannt -> DEMO");
  });
});
