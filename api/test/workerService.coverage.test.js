/**
 * Worker Service — comprehensive coverage suite (behavior-first).
 *
 * Covers pure helpers (sanitizers, document status/summary, public profile),
 * org-scoped DB readers/writers (via mock pools that assert SQL shape + params),
 * invite lifecycle, assignment-link lifecycle and the multi-step transactional
 * flows (createWorkerAccount, acceptInvite, assignCapacityToWorker,
 * assignDealToWorker, bulkImportWorkers).
 *
 * Run (cwd = api/):
 *   node --test --test-force-exit test/workerService.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sequencePool, returnPool } from "./helpers/mockPool.js";
import * as svc from "../services/workerService.js";

/* ── trackingPool: captures every SQL + params, drives responses by handler ── */
function trackingPool(handler) {
  const calls = [];
  const pool = {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params: params || [] });
      const out = handler ? handler(String(sql), params || [], calls.length - 1) : null;
      return out || { rows: [], rowCount: 0 };
    },
    connect: async () => ({
      query: pool.query,
      release() {}
    })
  };
  return pool;
}

const ISO_TODAY = new Date().toISOString().slice(0, 10);
function isoDaysFromToday(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Pure helpers — date / expiry math
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("getWorkerDocumentDaysUntilExpiry", () => {
  it("returns null when valid_until missing", () => {
    assert.strictEqual(svc.getWorkerDocumentDaysUntilExpiry({}), null);
  });
  it("computes positive days for a future expiry", () => {
    const d = svc.getWorkerDocumentDaysUntilExpiry({ valid_until: "2026-01-31" }, "2026-01-01");
    assert.strictEqual(d, 30);
  });
  it("computes negative days for a past expiry", () => {
    const d = svc.getWorkerDocumentDaysUntilExpiry({ valid_until: "2026-01-01" }, "2026-01-11");
    assert.strictEqual(d, -10);
  });
  it("accepts a Date instance for valid_until", () => {
    const d = svc.getWorkerDocumentDaysUntilExpiry(
      { valid_until: new Date("2026-02-10T00:00:00Z") },
      "2026-02-05"
    );
    assert.strictEqual(d, 5);
  });
});

describe("isWorkerDocumentExpiringSoon", () => {
  it("true for verified doc expiring within warning window", () => {
    const doc = { status: "verified", valid_until: isoDaysFromToday(10) };
    assert.strictEqual(svc.isWorkerDocumentExpiringSoon(doc), true);
  });
  it("false for verified doc expiring beyond warning window", () => {
    const doc = { status: "verified", valid_until: isoDaysFromToday(120) };
    assert.strictEqual(svc.isWorkerDocumentExpiringSoon(doc), false);
  });
  it("false for already-expired doc (negative days)", () => {
    const doc = { status: "verified", valid_until: isoDaysFromToday(-3) };
    assert.strictEqual(svc.isWorkerDocumentExpiringSoon(doc), false);
  });
  it("false for non-verified status even if near expiry", () => {
    const doc = { status: "pending_review", valid_until: isoDaysFromToday(5) };
    assert.strictEqual(svc.isWorkerDocumentExpiringSoon(doc), false);
  });
});

describe("getWorkerDocumentEffectiveStatus", () => {
  it("defaults to pending_review when no document", () => {
    assert.strictEqual(svc.getWorkerDocumentEffectiveStatus(null), "pending_review");
  });
  it("maps verified+past-validity to expired", () => {
    const doc = { status: "verified", valid_until: "2000-01-01" };
    assert.strictEqual(svc.getWorkerDocumentEffectiveStatus(doc), "expired");
  });
  it("keeps verified when validity is in the future", () => {
    const doc = { status: "verified", valid_until: isoDaysFromToday(40) };
    assert.strictEqual(svc.getWorkerDocumentEffectiveStatus(doc), "verified");
  });
  it("passes through explicit status with no validity", () => {
    assert.strictEqual(svc.getWorkerDocumentEffectiveStatus({ status: "rejected" }), "rejected");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Pure helpers — sanitizers
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("sanitizeSkillTags", () => {
  it("splits a delimited string, trims, dedupes case-insensitively", () => {
    const out = svc.sanitizeSkillTags("Welding, welding; CNC\nForklift");
    assert.deepStrictEqual(out, ["Welding", "CNC", "Forklift"]);
  });
  it("collapses internal whitespace and drops empties", () => {
    const out = svc.sanitizeSkillTags(["  Heavy   Lifting  ", "", "   "]);
    assert.deepStrictEqual(out, ["Heavy Lifting"]);
  });
  it("drops tags longer than 80 chars", () => {
    const out = svc.sanitizeSkillTags(["x".repeat(81), "ok"]);
    assert.deepStrictEqual(out, ["ok"]);
  });
  it("caps at 50 entries", () => {
    const many = Array.from({ length: 60 }, (_, i) => `tag${i}`);
    assert.strictEqual(svc.sanitizeSkillTags(many).length, 50);
  });
  it("returns [] for null", () => {
    assert.deepStrictEqual(svc.sanitizeSkillTags(null), []);
  });
});

describe("normalizeQualificationList", () => {
  it("normalizes string entries into objects", () => {
    const out = svc.normalizeQualificationList(["Staplerschein"]);
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].name, "Staplerschein");
    assert.strictEqual(out[0].issuer, null);
    assert.strictEqual(out[0].expires_at, null);
  });
  it("normalizes object entries and maps aliases", () => {
    const out = svc.normalizeQualificationList([
      { label: "ADR", issuer: "IHK", expiry: "2027-05-09T00:00:00Z", note: "n" }
    ]);
    assert.strictEqual(out[0].name, "ADR");
    assert.strictEqual(out[0].issuer, "IHK");
    assert.strictEqual(out[0].expires_at, "2027-05-09");
    assert.strictEqual(out[0].note, "n");
  });
  it("parses a JSON string input", () => {
    const out = svc.normalizeQualificationList('[{"name":"First Aid"}]');
    assert.strictEqual(out[0].name, "First Aid");
  });
  it("falls back to [] for invalid JSON string", () => {
    assert.deepStrictEqual(svc.normalizeQualificationList("{not json"), []);
  });
  it("skips entries without a name", () => {
    const out = svc.normalizeQualificationList([{ issuer: "X" }, "   "]);
    assert.deepStrictEqual(out, []);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * buildWorkerPublicProfile
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("buildWorkerPublicProfile", () => {
  it("returns null for a non-public profile without force", () => {
    const out = svc.buildWorkerPublicProfile({ profile_public: false });
    assert.strictEqual(out, null);
  });
  it("returns null for null profile", () => {
    assert.strictEqual(svc.buildWorkerPublicProfile(null), null);
  });
  it("emits only the allowlisted fields when public", () => {
    const out = svc.buildWorkerPublicProfile({
      profile_public: true,
      public_profile_slug: "abc",
      public_profile_fields: ["name", "city", "skill_tags", "not_allowed"],
      first_name: "Max",
      last_name: "Mustermann",
      city: "Wilster",
      skill_tags: ["Welding"],
      profile_text: "secret"
    });
    assert.strictEqual(out.slug, "abc");
    assert.strictEqual(out.name, "Max Mustermann");
    assert.strictEqual(out.city, "Wilster");
    assert.deepStrictEqual(out.skill_tags, ["Welding"]);
    // profile_text was NOT in public_profile_fields → must be absent
    assert.ok(!("profile_text" in out));
    // unknown field dropped by sanitizer
    assert.ok(!out.public_fields.includes("not_allowed"));
  });
  it("force=true exposes a private profile preview", () => {
    const out = svc.buildWorkerPublicProfile(
      { profile_public: false, public_profile_fields: ["name"], first_name: "A", last_name: "B" },
      { force: true }
    );
    assert.strictEqual(out.name, "A B");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * summarizeWorkerDocuments
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("summarizeWorkerDocuments", () => {
  it("returns an all-zero summary for empty input", () => {
    const s = svc.summarizeWorkerDocuments([]);
    assert.strictEqual(s.total, 0);
    assert.strictEqual(s.action_required, 0);
    assert.strictEqual(s.next_expiry, null);
  });
  it("counts statuses, expiring-soon and next_expiry", () => {
    const soon = isoDaysFromToday(5);
    const later = isoDaysFromToday(20);
    const docs = [
      { id: "d1", worker_user_id: "w1", status: "verified", valid_until: soon, file_ref: "f", qualification_name: "Q" },
      { id: "d2", worker_user_id: "w1", status: "verified", valid_until: later },
      { id: "d3", worker_user_id: "w1", status: "rejected" },
      { id: "d4", worker_user_id: "w1", status: "verified", valid_until: "2000-01-01" } // expired
    ];
    const s = svc.summarizeWorkerDocuments(docs);
    assert.strictEqual(s.total, 4);
    assert.strictEqual(s.verified, 2); // d1, d2 (d4 became expired)
    assert.strictEqual(s.expired, 1);
    assert.strictEqual(s.rejected, 1);
    assert.strictEqual(s.expiring_soon, 2); // d1 + d2 both within 30d window
    assert.strictEqual(s.expiring_within_7_days, 1); // only d1
    assert.strictEqual(s.with_files, 1);
    assert.strictEqual(s.linked_qualifications, 1);
    // next_expiry = earliest verified valid_until (soon)
    assert.strictEqual(s.next_expiry, soon);
    // action_required: expired + rejected + expiring-soon docs
    assert.ok(s.action_required >= 3);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * getWorkerProfile / getWorkerByUserId / getWorkerPublicProfileBySlug
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("getWorkerProfile", () => {
  it("normalizes the returned profile record", async () => {
    const pool = returnPool([
      { user_id: "u1", skill_tags: "A,A,B", qualifications: '["X"]', profile_public: 1, public_profile_fields: ["name"] }
    ]);
    const p = await svc.getWorkerProfile(pool, "u1");
    assert.deepStrictEqual(p.skill_tags, ["A", "B"]);
    assert.strictEqual(p.profile_public, true);
    assert.strictEqual(p.qualifications[0].name, "X");
  });
  it("returns null when no row found", async () => {
    const p = await svc.getWorkerProfile(returnPool([]), "missing");
    assert.strictEqual(p, null);
  });
});

describe("getWorkerByUserId", () => {
  it("filters on role='worker' and returns a normalized record", async () => {
    const pool = trackingPool((sql) =>
      sql.includes("FROM users u") ? { rows: [{ id: "u1", skill_tags: ["x"] }] } : null
    );
    const p = await svc.getWorkerByUserId(pool, "u1");
    assert.strictEqual(p.id, "u1");
    assert.match(pool.calls[0].sql, /u\.role = 'worker'/);
  });
  it("returns null when not found", async () => {
    assert.strictEqual(await svc.getWorkerByUserId(returnPool([]), "x"), null);
  });
});

describe("getWorkerPublicProfileBySlug", () => {
  it("returns the built public profile for a public slug", async () => {
    const pool = returnPool([
      { public_profile_slug: "s", profile_public: true, public_profile_fields: ["name"], first_name: "Q", last_name: "W" }
    ]);
    const out = await svc.getWorkerPublicProfileBySlug(pool, "s");
    assert.strictEqual(out.name, "Q W");
  });
  it("returns null when no public profile matches", async () => {
    assert.strictEqual(await svc.getWorkerPublicProfileBySlug(returnPool([]), "s"), null);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * listWorkers — SQL shaping
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("listWorkers", () => {
  it("applies only org filter by default, params=[org,limit,offset]", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: "w1", skill_tags: [] }] }));
    const out = await svc.listWorkers(pool, { supplierOrgId: "org1" });
    assert.strictEqual(out.length, 1);
    const { sql, params } = pool.calls[0];
    assert.match(sql, /wp\.supplier_org_id = \$1/);
    assert.deepStrictEqual(params, ["org1", 100, 0]);
  });
  it("adds is_active and search predicates and params in order", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    await svc.listWorkers(pool, { supplierOrgId: "org1", isActive: true, search: "max", limit: 10, offset: 5 });
    const { sql, params } = pool.calls[0];
    assert.match(sql, /wp\.is_active = \$2/);
    assert.match(sql, /ILIKE \$3/);
    assert.deepStrictEqual(params, ["org1", true, "%max%", 10, 5]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * createWorkerAccount — transactional happy path + rollback
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("createWorkerAccount", () => {
  it("inserts user, membership, profile and returns normalized profile", async () => {
    const pool = sequencePool(
      { rows: [{ id: "newuser" }] },                 // INSERT users
      { rows: [], rowCount: 1 },                      // INSERT membership
      { rows: [{ id: "p1", user_id: "newuser", skill_tags: ["A"] }] } // INSERT profile
    );
    const out = await svc.createWorkerAccount(pool, {
      supplierOrgId: "o1", email: "Test@Example.COM", firstName: "T", lastName: "U", passwordHash: "h"
    });
    assert.strictEqual(out.user.id, "newuser");
    assert.strictEqual(out.profile.id, "p1");
    assert.deepStrictEqual(out.profile.skill_tags, ["A"]);
  });
  it("rolls back and rethrows on a failing insert", async () => {
    const boom = new Error("dup");
    const pool = sequencePool(boom);
    await assert.rejects(() => svc.createWorkerAccount(pool, {
      supplierOrgId: "o1", email: "a@b.de", firstName: "T", lastName: "U", passwordHash: "h"
    }), /dup/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Invite lifecycle
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("createWorkerInvite", () => {
  it("returns INVITE_ALREADY_PENDING when a pending invite exists", async () => {
    const pool = sequencePool({ rows: [{ id: "inv1" }] });
    const out = await svc.createWorkerInvite(pool, {
      supplierOrgId: "o1", invitedBy: "u", email: "a@b.de", firstName: "A", lastName: "B"
    });
    assert.deepStrictEqual(out, { error: "INVITE_ALREADY_PENDING", inviteId: "inv1" });
  });
  it("creates an invite and returns a raw token not persisted in invite obj", async () => {
    const pool = sequencePool(
      { rows: [] },                                   // existing check → none
      { rows: [{ id: "inv2", email: "a@b.de", status: "pending" }] } // INSERT
    );
    const out = await svc.createWorkerInvite(pool, {
      supplierOrgId: "o1", invitedBy: "u", email: "A@B.de", firstName: "A", lastName: "B"
    });
    assert.strictEqual(out.invite.id, "inv2");
    assert.ok(typeof out.token === "string" && out.token.length > 0);
    assert.ok(!("token" in out.invite));
  });
});

describe("getInviteByToken", () => {
  it("hashes the token and returns the joined row", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: "inv", supplier_org_name: "Org" }] }));
    const out = await svc.getInviteByToken(pool, "rawtoken");
    assert.strictEqual(out.supplier_org_name, "Org");
    // raw token must never be used directly; only the sha256 hash is passed
    assert.notStrictEqual(pool.calls[0].params[0], "rawtoken");
    assert.match(String(pool.calls[0].params[0]), /^[a-f0-9]{64}$/);
  });
  it("returns null when token unknown", async () => {
    assert.strictEqual(await svc.getInviteByToken(returnPool([]), "x"), null);
  });
});

describe("acceptInvite", () => {
  it("returns INVITE_NOT_FOUND when token unknown", async () => {
    const out = await svc.acceptInvite(returnPool([]), { token: "x", passwordHash: "h" });
    assert.deepStrictEqual(out, { error: "INVITE_NOT_FOUND" });
  });
  it("returns INVITE_ALREADY_USED for an accepted invite", async () => {
    const pool = sequencePool({ rows: [{ id: "i", status: "accepted", expires_at: isoDaysFromToday(1) }] });
    const out = await svc.acceptInvite(pool, { token: "x", passwordHash: "h" });
    assert.deepStrictEqual(out, { error: "INVITE_ALREADY_USED" });
  });
  it("returns INVITE_REVOKED for a revoked invite", async () => {
    const pool = sequencePool({ rows: [{ id: "i", status: "revoked", expires_at: isoDaysFromToday(1) }] });
    const out = await svc.acceptInvite(pool, { token: "x", passwordHash: "h" });
    assert.deepStrictEqual(out, { error: "INVITE_REVOKED" });
  });
  it("marks expired and returns INVITE_EXPIRED when past expiry", async () => {
    const pool = sequencePool(
      { rows: [{ id: "i", status: "pending", expires_at: isoDaysFromToday(-1) }] }, // getInviteByToken
      { rows: [], rowCount: 1 } // UPDATE → expired
    );
    const out = await svc.acceptInvite(pool, { token: "x", passwordHash: "h" });
    assert.deepStrictEqual(out, { error: "INVITE_EXPIRED" });
  });
  it("provisions user+membership+profile and closes the invite on success", async () => {
    const pool = sequencePool(
      { rows: [{ id: "i", status: "pending", expires_at: isoDaysFromToday(2), email: "a@b.de", supplier_org_id: "o1", first_name: "F", last_name: "L", invited_by: "ib" }] }, // getInviteByToken
      { rows: [{ id: "u1", email: "a@b.de", role: "worker" }] }, // INSERT users
      { rows: [], rowCount: 1 },                                 // INSERT membership
      { rows: [{ id: "p1", user_id: "u1", skill_tags: [] }] },   // INSERT profile
      { rows: [], rowCount: 1 }                                  // UPDATE invite accepted
    );
    const out = await svc.acceptInvite(pool, { token: "x", passwordHash: "h" });
    assert.strictEqual(out.user.id, "u1");
    assert.strictEqual(out.profile.id, "p1");
    assert.strictEqual(out.invite.id, "i");
  });
});

describe("revokeInvite", () => {
  it("returns true when a pending invite was revoked", async () => {
    assert.strictEqual(await svc.revokeInvite(sequencePool({ rowCount: 1, rows: [] }), "i", "o1"), true);
  });
  it("returns false when nothing matched", async () => {
    assert.strictEqual(await svc.revokeInvite(sequencePool({ rowCount: 0, rows: [] }), "i", "o1"), false);
  });
});

describe("resendInvite", () => {
  it("returns null when no pending invite matched", async () => {
    assert.strictEqual(await svc.resendInvite(sequencePool({ rows: [] }), "i", "o1"), null);
  });
  it("returns a fresh token plus the invite row", async () => {
    const pool = sequencePool({ rows: [{ id: "i", email: "a@b.de" }] });
    const out = await svc.resendInvite(pool, "i", "o1");
    assert.strictEqual(out.invite.id, "i");
    assert.ok(typeof out.token === "string" && out.token.length >= 32);
  });
});

describe("listInvites", () => {
  it("accepts legacy (string, status) signature and adds status predicate", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: "i" }] }));
    const out = await svc.listInvites(pool, "o1", "pending");
    assert.strictEqual(out.length, 1);
    assert.deepStrictEqual(pool.calls[0].params, ["o1", "pending"]);
    assert.match(pool.calls[0].sql, /wi\.status = \$2/);
  });
  it("accepts options object without status (org-only filter)", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    await svc.listInvites(pool, { supplierOrgId: "o1" });
    assert.deepStrictEqual(pool.calls[0].params, ["o1"]);
    assert.doesNotMatch(pool.calls[0].sql, /wi\.status = \$2/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * setWorkerActive — deactivation cascades to assignment links
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("setWorkerActive", () => {
  it("deactivating also disables assignment links (2 writes)", async () => {
    let writes = 0;
    const pool = {
      query: async (sql) => {
        if (!/BEGIN|COMMIT|ROLLBACK/.test(sql)) writes += 1;
        return { rows: [], rowCount: 0 };
      },
      connect: async () => ({ query: pool.query, release() {} })
    };
    const ok = await svc.setWorkerActive(pool, "w1", "o1", false);
    assert.strictEqual(ok, true);
    assert.strictEqual(writes, 2);
  });
  it("reactivating only updates the profile (1 write)", async () => {
    const calls = [];
    const pool = {
      query: async (sql, params) => {
        if (!/BEGIN|COMMIT|ROLLBACK/.test(sql)) calls.push(String(sql));
        return { rows: [], rowCount: 0 };
      },
      connect: async () => ({ query: pool.query, release() {} })
    };
    const ok = await svc.setWorkerActive(pool, "w1", "o1", true);
    assert.strictEqual(ok, true);
    assert.strictEqual(calls.length, 1);
    assert.match(calls[0], /UPDATE worker_profiles/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * updateWorkerProfile — dynamic SET building
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("updateWorkerProfile", () => {
  it("returns null when no allowed fields supplied", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    const out = await svc.updateWorkerProfile(pool, "w1", "o1", { not_allowed: "x" });
    assert.strictEqual(out, null);
    assert.strictEqual(pool.calls.length, 0);
  });
  it("sanitizes skill_tags and serializes qualifications before persisting", async () => {
    const pool = trackingPool(() => ({ rows: [{ user_id: "w1", skill_tags: ["A"] }] }));
    const out = await svc.updateWorkerProfile(pool, "w1", "o1", {
      first_name: "Max",
      skill_tags: "A, A, B",
      qualifications: ["Staplerschein"]
    });
    assert.ok(out);
    const { sql, params } = pool.calls[0];
    // skill_tags sanitized to ["A","B"]
    assert.deepStrictEqual(params[1], ["A", "B"]);
    // qualifications serialized to JSON string
    assert.strictEqual(typeof params[2], "string");
    assert.match(params[2], /Staplerschein/);
    // worker + org are the last two params
    assert.strictEqual(params[params.length - 2], "w1");
    assert.strictEqual(params[params.length - 1], "o1");
    assert.match(sql, /WHERE user_id=\$\d+ AND supplier_org_id=\$\d+/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Document CRUD
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("listWorkerDocuments", () => {
  it("excludes archived when includeArchived=false and returns items+summary", async () => {
    const pool = trackingPool(() => ({
      rows: [{ id: "d1", worker_user_id: "w1", status: "verified", valid_until: isoDaysFromToday(40) }]
    }));
    const out = await svc.listWorkerDocuments(pool, { workerUserId: "w1", supplierOrgId: "o1", includeArchived: false });
    assert.strictEqual(out.items.length, 1);
    assert.strictEqual(out.summary.total, 1);
    assert.match(pool.calls[0].sql, /status <> 'archived'/);
  });
  it("includes archived by default (no exclusion clause)", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    await svc.listWorkerDocuments(pool, { workerUserId: "w1", supplierOrgId: "o1" });
    assert.doesNotMatch(pool.calls[0].sql, /status <> 'archived'/);
  });
});

describe("getWorkerDocumentById", () => {
  it("returns a normalized record with download_path", async () => {
    const pool = returnPool([{ id: "d1", worker_user_id: "w1", status: "verified", valid_until: isoDaysFromToday(40) }]);
    const out = await svc.getWorkerDocumentById(pool, "d1");
    assert.strictEqual(out.id, "d1");
    assert.strictEqual(out.download_path, "/api/workers/w1/documents/d1/download");
    assert.strictEqual(out.has_file, false);
  });
  it("returns null for missing document", async () => {
    assert.strictEqual(await svc.getWorkerDocumentById(returnPool([]), "x"), null);
  });
});

describe("createWorkerDocument", () => {
  it("inserts then re-fetches the new document by id", async () => {
    const pool = sequencePool(
      { rows: [{ id: "newdoc" }] },                                   // INSERT ... RETURNING id
      { rows: [{ id: "newdoc", worker_user_id: "w1", status: "pending_review" }] } // getWorkerDocumentById
    );
    const out = await svc.createWorkerDocument(pool, {
      workerUserId: "w1", supplierOrgId: "o1", category: "qualification", title: "Cert"
    });
    assert.strictEqual(out.id, "newdoc");
    assert.strictEqual(out.effective_status, "pending_review");
  });
});

describe("updateWorkerDocument", () => {
  it("returns null when no updatable fields present", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    const out = await svc.updateWorkerDocument(pool, "d1", "w1", "o1", { nonsense: 1 });
    assert.strictEqual(out, null);
    assert.strictEqual(pool.calls.length, 0);
  });
  it("returns null when the org-scoped UPDATE matches nothing", async () => {
    const pool = sequencePool({ rows: [] });
    const out = await svc.updateWorkerDocument(pool, "d1", "w1", "o1", { title: "x" });
    assert.strictEqual(out, null);
  });
  it("updates and re-fetches when a row matched", async () => {
    const pool = sequencePool(
      { rows: [{ id: "d1" }] },                                   // UPDATE RETURNING id
      { rows: [{ id: "d1", worker_user_id: "w1", status: "pending_review" }] } // re-fetch
    );
    const out = await svc.updateWorkerDocument(pool, "d1", "w1", "o1", { title: "x", valid_until: "2030-01-01" });
    assert.strictEqual(out.id, "d1");
  });
});

describe("verifyWorkerDocument / rejectWorkerDocument", () => {
  it("verify returns null when nothing matched", async () => {
    assert.strictEqual(
      await svc.verifyWorkerDocument(sequencePool({ rows: [] }), "d1", "w1", "o1", { verifiedBy: "v" }),
      null
    );
  });
  it("verify re-fetches the verified doc", async () => {
    const pool = sequencePool(
      { rows: [{ id: "d1" }] },
      { rows: [{ id: "d1", worker_user_id: "w1", status: "verified", valid_until: isoDaysFromToday(60) }] }
    );
    const out = await svc.verifyWorkerDocument(pool, "d1", "w1", "o1", { verifiedBy: "v", note: "ok" });
    assert.strictEqual(out.effective_status, "verified");
  });
  it("reject re-fetches the rejected doc", async () => {
    const pool = sequencePool(
      { rows: [{ id: "d1" }] },
      { rows: [{ id: "d1", worker_user_id: "w1", status: "rejected" }] }
    );
    const out = await svc.rejectWorkerDocument(pool, "d1", "w1", "o1", { verifiedBy: "v", note: "bad" });
    assert.strictEqual(out.effective_status, "rejected");
    assert.strictEqual(out.traffic_light, "red");
  });
});

describe("deleteWorkerDocument", () => {
  it("returns the normalized deleted row", async () => {
    const pool = sequencePool({ rows: [{ id: "d1", worker_user_id: "w1", status: "archived" }] });
    const out = await svc.deleteWorkerDocument(pool, "d1", "w1", "o1");
    assert.strictEqual(out.id, "d1");
  });
  it("returns null when nothing was deleted", async () => {
    assert.strictEqual(await svc.deleteWorkerDocument(sequencePool({ rows: [] }), "d1", "w1", "o1"), null);
  });
});

describe("scanWorkerDocumentDeadlines", () => {
  it("counts zero when no documents are due", async () => {
    const res = await svc.scanWorkerDocumentDeadlines(returnPool([]));
    assert.deepStrictEqual(res, { scanned: 0, expiring: 0, expired: 0, notified: 0, failed: 0 });
  });
  it("invokes onExpiring/onExpired and tallies notifications", async () => {
    const expiringDoc = { id: "d1", worker_user_id: "w1", status: "verified", valid_until: isoDaysFromToday(10) };
    const expiredDoc = { id: "d2", worker_user_id: "w1", status: "verified", valid_until: isoDaysFromToday(-2) };
    // SELECT returns both; subsequent UPDATEs return empty
    let first = true;
    const pool = {
      query: async (sql) => {
        if (first) { first = false; return { rows: [expiringDoc, expiredDoc] }; }
        return { rows: [], rowCount: 1 };
      },
      connect: async () => ({ query: pool.query, release() {} })
    };
    const seenExpiring = [];
    const seenExpired = [];
    const res = await svc.scanWorkerDocumentDeadlines(pool, {
      onExpiring: (d) => seenExpiring.push(d.id),
      onExpired: (d) => seenExpired.push(d.id)
    });
    assert.strictEqual(res.scanned, 2);
    assert.strictEqual(res.expiring, 1);
    assert.strictEqual(res.expired, 1);
    assert.strictEqual(res.notified, 2);
    assert.deepStrictEqual(seenExpiring, ["d1"]);
    assert.deepStrictEqual(seenExpired, ["d2"]);
  });
  it("counts a callback failure as failed, not notified", async () => {
    const doc = { id: "d1", worker_user_id: "w1", status: "verified", valid_until: isoDaysFromToday(10) };
    let first = true;
    const pool = {
      query: async () => {
        if (first) { first = false; return { rows: [doc] }; }
        return { rows: [], rowCount: 1 };
      },
      connect: async () => ({ query: pool.query, release() {} })
    };
    const res = await svc.scanWorkerDocumentDeadlines(pool, {
      onExpiring: () => { throw new Error("notify failed"); }
    });
    assert.strictEqual(res.failed, 1);
    assert.strictEqual(res.notified, 0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Assignment-link basics
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("createAssignmentLink", () => {
  it("returns ASSIGNMENT_NOT_FOUND when assignment missing", async () => {
    const out = await svc.createAssignmentLink(sequencePool({ rows: [] }), {
      workerUserId: "w1", assignmentId: "a1", orgId: "o", supplierOrgId: "s", startDate: "2026-01-01"
    });
    assert.deepStrictEqual(out, { error: "ASSIGNMENT_NOT_FOUND" });
  });
  it("returns ASSIGNMENT_NOT_ACTIVE for a closed assignment", async () => {
    const pool = sequencePool({ rows: [{ id: "a1", status: "closed", is_expired: false }] });
    const out = await svc.createAssignmentLink(pool, {
      workerUserId: "w1", assignmentId: "a1", orgId: "o", supplierOrgId: "s", startDate: "2026-01-01"
    });
    assert.deepStrictEqual(out, { error: "ASSIGNMENT_NOT_ACTIVE", status: "closed" });
  });
  it("flags expired assignments via lifecycle_state", async () => {
    const pool = sequencePool({ rows: [{ id: "a1", status: "active", is_expired: true }] });
    const out = await svc.createAssignmentLink(pool, {
      workerUserId: "w1", assignmentId: "a1", orgId: "o", supplierOrgId: "s", startDate: "2026-01-01"
    });
    assert.strictEqual(out.error, "ASSIGNMENT_NOT_ACTIVE");
    assert.strictEqual(out.lifecycle_state, "expired");
  });
  it("creates (upserts) the link on a valid assignment", async () => {
    const pool = sequencePool(
      { rows: [{ id: "a1", status: "planned", is_expired: false }] },
      { rows: [] }, // Kollisionsprüfung: kein Konflikt
      { rows: [{ id: "link1", worker_user_id: "w1" }] }
    );
    const out = await svc.createAssignmentLink(pool, {
      workerUserId: "w1", assignmentId: "a1", orgId: "o", supplierOrgId: "s", startDate: "2026-01-01"
    });
    assert.strictEqual(out.link.id, "link1");
  });
  it("returns SCHEDULE_CONFLICT when the worker has an overlapping active link", async () => {
    const pool = sequencePool(
      { rows: [{ id: "a1", status: "planned", is_expired: false }] },
      { rows: [{ id: "lc9" }] } // Kollisionsprüfung: überlappender Einsatz
    );
    const out = await svc.createAssignmentLink(pool, {
      workerUserId: "w1", assignmentId: "a1", orgId: "o", supplierOrgId: "s", startDate: "2026-01-01"
    });
    assert.strictEqual(out.error, "SCHEDULE_CONFLICT");
    assert.deepStrictEqual(out.conflicting_link_ids, ["lc9"]);
  });
  it("allowOverlap=true skips the conflict check (INSERT direkt)", async () => {
    const pool = sequencePool(
      { rows: [{ id: "a1", status: "planned", is_expired: false }] },
      { rows: [{ id: "link2", worker_user_id: "w1" }] } // direkt INSERT, keine Kollisionsquery
    );
    const out = await svc.createAssignmentLink(pool, {
      workerUserId: "w1", assignmentId: "a1", orgId: "o", supplierOrgId: "s", startDate: "2026-01-01", allowOverlap: true
    });
    assert.strictEqual(out.link.id, "link2");
  });
});

describe("removeAssignmentLink", () => {
  it("returns true when a link was deactivated", async () => {
    assert.strictEqual(await svc.removeAssignmentLink(sequencePool({ rowCount: 1, rows: [] }), "l1", "o1"), true);
  });
  it("returns false when no link matched", async () => {
    assert.strictEqual(await svc.removeAssignmentLink(sequencePool({ rowCount: 0, rows: [] }), "l1", "o1"), false);
  });
});

describe("getWorkerAssignments / getWorkerAssignmentDetail / getWorkerSchedule", () => {
  it("getWorkerAssignments adds is_active filter unless includeInactive", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: "l1" }] }));
    await svc.getWorkerAssignments(pool, "w1");
    assert.match(pool.calls[0].sql, /wal\.is_active = TRUE/);

    const pool2 = trackingPool(() => ({ rows: [] }));
    await svc.getWorkerAssignments(pool2, "w1", { includeInactive: true });
    assert.doesNotMatch(pool2.calls[0].sql, /wal\.is_active = TRUE/);
  });
  it("getWorkerAssignmentDetail returns null when nothing matches", async () => {
    assert.strictEqual(await svc.getWorkerAssignmentDetail(returnPool([]), "l1", "w1"), null);
  });
  it("getWorkerSchedule passes the worker id and returns rows", async () => {
    const pool = trackingPool(() => ({ rows: [{ link_id: "l1" }] }));
    const out = await svc.getWorkerSchedule(pool, "w1");
    assert.strictEqual(out.length, 1);
    assert.deepStrictEqual(pool.calls[0].params, ["w1"]);
  });
});

describe("getAssignmentLinksForSupplier", () => {
  it("filters by org only when no assignmentId", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: "l1" }] }));
    await svc.getAssignmentLinksForSupplier(pool, "o1", {});
    assert.deepStrictEqual(pool.calls[0].params, ["o1"]);
  });
  it("adds an assignment predicate when assignmentId supplied", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    await svc.getAssignmentLinksForSupplier(pool, "o1", { assignmentId: "a1" });
    assert.deepStrictEqual(pool.calls[0].params, ["o1", "a1"]);
    assert.match(pool.calls[0].sql, /wal\.assignment_id = \$2/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Confirmation lifecycle (confirm/decline/reportUnavailable)
 *  — these call assignmentStaffingService.recalcAssignmentStaffing on success,
 *    which runs against the same mock pool (returns {rows:[]}).
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("confirmAssignment", () => {
  it("returns NOT_FOUND when no link context", async () => {
    const out = await svc.confirmAssignment(sequencePool({ rows: [] }), "l1", "w1");
    assert.deepStrictEqual(out, { error: "NOT_FOUND" });
  });
  it("returns ASSIGNMENT_NOT_CURRENT when not current", async () => {
    const pool = sequencePool({
      rows: [{ id: "l1", assignment_is_current: false, assignment_lifecycle_state: "expired" }]
    });
    const out = await svc.confirmAssignment(pool, "l1", "w1");
    assert.strictEqual(out.error, "ASSIGNMENT_NOT_CURRENT");
    assert.strictEqual(out.lifecycle_state, "expired");
  });
  it("returns INVALID_STATUS when UPDATE matched nothing", async () => {
    const pool = sequencePool(
      { rows: [{ id: "l1", assignment_is_current: true, worker_confirmation_status: "worker_confirmed" }] },
      { rows: [] } // UPDATE matched nothing (wrong status)
    );
    const out = await svc.confirmAssignment(pool, "l1", "w1");
    assert.strictEqual(out.error, "INVALID_STATUS");
    assert.strictEqual(out.current_status, "worker_confirmed");
  });
  it("confirms and returns the updated link", async () => {
    const pool = sequencePool(
      { rows: [{ id: "l1", assignment_is_current: true, worker_confirmation_status: "pending_confirmation" }] },
      { rows: [{ id: "l1", assignment_id: "a1", worker_confirmation_status: "worker_confirmed" }] }
      // any further recalc queries fall through to {rows:[]}
    );
    const out = await svc.confirmAssignment(pool, "l1", "w1");
    assert.strictEqual(out.link.id, "l1");
    assert.strictEqual(out.link.worker_confirmation_status, "worker_confirmed");
  });
});

describe("declineAssignment", () => {
  it("returns NOT_FOUND with no context", async () => {
    assert.deepStrictEqual(await svc.declineAssignment(sequencePool({ rows: [] }), "l1", "w1", "r"), { error: "NOT_FOUND" });
  });
  it("declines and deactivates the link", async () => {
    const pool = sequencePool(
      { rows: [{ id: "l1", assignment_is_current: true, worker_confirmation_status: "pending_confirmation" }] },
      { rows: [{ id: "l1", assignment_id: "a1", worker_confirmation_status: "worker_declined", is_active: false }] }
    );
    const out = await svc.declineAssignment(pool, "l1", "w1", "no time");
    assert.strictEqual(out.link.worker_confirmation_status, "worker_declined");
    assert.strictEqual(out.link.is_active, false);
  });
});

describe("reportUnavailable", () => {
  it("returns ASSIGNMENT_NOT_CURRENT when assignment not current", async () => {
    const pool = sequencePool({ rows: [{ id: "l1", assignment_is_current: false, assignment_lifecycle_state: "ended" }] });
    const out = await svc.reportUnavailable(pool, "l1", "w1", { unavailableFrom: "2026-02-01", reason: "sick" });
    assert.strictEqual(out.error, "ASSIGNMENT_NOT_CURRENT");
  });
  it("returns INVALID_STATUS when worker not in a confirmed state", async () => {
    const pool = sequencePool(
      { rows: [{ id: "l1", assignment_is_current: true, worker_confirmation_status: "pending_confirmation" }] },
      { rows: [] } // UPDATE matched nothing
    );
    const out = await svc.reportUnavailable(pool, "l1", "w1", { unavailableFrom: "2026-02-01" });
    assert.strictEqual(out.error, "INVALID_STATUS");
  });
  it("marks unavailable from a date on a confirmed link", async () => {
    const pool = sequencePool(
      { rows: [{ id: "l1", assignment_is_current: true, worker_confirmation_status: "worker_confirmed" }] },
      { rows: [{ id: "l1", assignment_id: "a1", worker_confirmation_status: "worker_unavailable", is_active: false }] }
    );
    const out = await svc.reportUnavailable(pool, "l1", "w1", { unavailableFrom: "2026-02-01", reason: "sick" });
    assert.strictEqual(out.link.worker_confirmation_status, "worker_unavailable");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * assignCapacityToWorker — multi-step transaction with early-return branches
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("assignCapacityToWorker", () => {
  const base = {
    capacityPostId: "c1", workerUserId: "w1", supplierOrgId: "s1",
    orgId: "o1", startDate: "2026-03-01", endDate: "2026-03-31", createdBy: "u1"
  };
  it("returns CAPACITY_NOT_FOUND", async () => {
    const out = await svc.assignCapacityToWorker(sequencePool({ rows: [] }), base);
    assert.deepStrictEqual(out, { error: "CAPACITY_NOT_FOUND" });
  });
  it("returns CAPACITY_NOT_ASSIGNABLE for a non-active post", async () => {
    const pool = sequencePool({ rows: [{ id: "c1", status: "draft", headcount: 1 }] });
    const out = await svc.assignCapacityToWorker(pool, base);
    assert.deepStrictEqual(out, { error: "CAPACITY_NOT_ASSIGNABLE", status: "draft" });
  });
  it("returns WORKER_NOT_FOUND", async () => {
    const pool = sequencePool(
      { rows: [{ id: "c1", status: "active", headcount: 1, role: "Lager" }] }, // capacity
      { rows: [] } // worker lookup
    );
    const out = await svc.assignCapacityToWorker(pool, base);
    assert.deepStrictEqual(out, { error: "WORKER_NOT_FOUND" });
  });
  it("returns WORKER_INACTIVE", async () => {
    const pool = sequencePool(
      { rows: [{ id: "c1", status: "active", headcount: 1 }] },
      { rows: [{ user_id: "w1", is_active: false }] }
    );
    const out = await svc.assignCapacityToWorker(pool, base);
    assert.deepStrictEqual(out, { error: "WORKER_INACTIVE" });
  });
  it("returns SCHEDULE_CONFLICT with conflicting link ids", async () => {
    const pool = sequencePool(
      { rows: [{ id: "c1", status: "active", headcount: 1 }] },
      { rows: [{ user_id: "w1", is_active: true }] },
      { rows: [{ id: "lc1" }] } // conflict
    );
    const out = await svc.assignCapacityToWorker(pool, base);
    assert.strictEqual(out.error, "SCHEDULE_CONFLICT");
    assert.deepStrictEqual(out.conflicting_link_ids, ["lc1"]);
  });
  it("creates assignment + link on the happy path", async () => {
    const pool = sequencePool(
      { rows: [{ id: "c1", status: "active", headcount: 1, role: "Lager" }] }, // capacity
      { rows: [{ user_id: "w1", is_active: true }] },                          // worker
      { rows: [] },                                                             // conflicts none
      { rows: [{ id: "asg1" }] },                                              // INSERT assignment
      { rows: [{ id: "link1" }] },                                            // INSERT link
      { rows: [{ active_links: 1 }] },                                        // active link count
      { rows: [], rowCount: 1 }                                               // UPDATE capacity_posts
      // recalcAssignmentStaffing queries fall through to {rows:[]}
    );
    const out = await svc.assignCapacityToWorker(pool, base);
    assert.strictEqual(out.assignment.id, "asg1");
    assert.strictEqual(out.link.id, "link1");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * assignDealToWorker — validation branches
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("assignDealToWorker", () => {
  const base = { assignmentId: "a1", workerUserId: "w1", supplierOrgId: "s1", createdBy: "u1" };
  it("returns ASSIGNMENT_NOT_FOUND", async () => {
    const out = await svc.assignDealToWorker(sequencePool({ rows: [] }), base);
    assert.deepStrictEqual(out, { error: "ASSIGNMENT_NOT_FOUND" });
  });
  it("returns ASSIGNMENT_NOT_ASSIGNABLE for a non-assignable status", async () => {
    const pool = sequencePool({ rows: [{ id: "a1", status: "closed", is_expired: false }] });
    const out = await svc.assignDealToWorker(pool, base);
    assert.deepStrictEqual(out, { error: "ASSIGNMENT_NOT_ASSIGNABLE", status: "closed" });
  });
  it("returns ASSIGNMENT_NOT_ASSIGNABLE (expired) with lifecycle_state", async () => {
    const pool = sequencePool({ rows: [{ id: "a1", status: "active", is_expired: true }] });
    const out = await svc.assignDealToWorker(pool, base);
    assert.strictEqual(out.error, "ASSIGNMENT_NOT_ASSIGNABLE");
    assert.strictEqual(out.lifecycle_state, "expired");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Deal-assignment aggregator (listAssignableSourcesForDispatcher)
 *   — uses assignmentStaffingService.listOpenStaffingAssignments which runs
 *     against the same mock pool. We drive everything via a stateful pool.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("listAssignableSourcesForDispatcher", () => {
  it("returns capacity + deal items with assigned-worker maps", async () => {
    // Query order:
    //   1) getUnassignedCapacityPosts SELECT
    //   2) listOpenStaffingAssignments SELECT (deal rows)
    //   3) assignedByCapacity SELECT (capacityIds present)
    //   4) assignedByAssignment SELECT (dealAssignmentIds present)
    const responses = [
      { rows: [{ id: "cap1", title: "Lager", headcount: 2, role: "Lagerist" }] },
      { rows: [{ assignment_id: "asg1", requested_quantity: 3, filled_quantity: 1, reserved_quantity: 0, open_quantity: 2, worker_description: "Deal" }] },
      { rows: [{ capacity_post_id: "cap1", worker_user_id: "wA" }] },
      { rows: [{ assignment_id: "asg1", worker_user_id: "wB" }] }
    ];
    let i = 0;
    const pool = {
      query: async () => responses[i++] || { rows: [] },
      connect: async () => ({ query: pool.query, release() {} })
    };
    const out = await svc.listAssignableSourcesForDispatcher(pool, "s1");
    assert.strictEqual(out.length, 2);
    const cap = out.find((x) => x.source === "capacity");
    const deal = out.find((x) => x.source === "deal_assignment");
    assert.strictEqual(cap.capacity_post_id, "cap1");
    assert.deepStrictEqual(cap.assigned_worker_user_ids, ["wA"]);
    assert.strictEqual(deal.assignment_id, "asg1");
    assert.strictEqual(deal.remaining, 2);
    assert.deepStrictEqual(deal.assigned_worker_user_ids, ["wB"]);
  });
  it("returns [] capacity + no deal query when supplierOrgId is falsy", async () => {
    // supplierOrgId falsy → deal source resolves to [], capacity query still runs
    const calls = [];
    const pool = {
      query: async (sql) => { calls.push(String(sql)); return { rows: [] }; },
      connect: async () => ({ query: pool.query, release() {} })
    };
    const out = await svc.listAssignableSourcesForDispatcher(pool, null);
    assert.deepStrictEqual(out, []);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * getUnassignedCapacityPosts
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("getUnassignedCapacityPosts", () => {
  it("passes org + supplier user params and returns rows", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: "cap1", title: "X" }] }));
    const out = await svc.getUnassignedCapacityPosts(pool, "s1", { supplierUserId: "u9" });
    assert.strictEqual(out.length, 1);
    assert.deepStrictEqual(pool.calls[0].params, ["s1", "u9"]);
    assert.match(pool.calls[0].sql, /status IN \('active','reserved'\)/);
  });
  it("defaults supplierUserId to null", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    await svc.getUnassignedCapacityPosts(pool, "s1");
    assert.deepStrictEqual(pool.calls[0].params, ["s1", null]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * getSupplierPlan
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("getSupplierPlan", () => {
  it("returns the active subscription plan", async () => {
    assert.strictEqual(await svc.getSupplierPlan(returnPool([{ plan: "PRO" }]), "o1"), "PRO");
  });
  it("falls back to FREE when no active subscription", async () => {
    assert.strictEqual(await svc.getSupplierPlan(returnPool([]), "o1"), "FREE");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * bulkImportWorkers — validation, dedupe, update, create
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("bulkImportWorkers", () => {
  it("flags missing required fields and invalid emails as errors", async () => {
    // existing-emails SELECT → none; global-emails SELECT → none
    const pool = sequencePool({ rows: [] }, { rows: [] });
    const res = await svc.bulkImportWorkers(pool, {
      supplierOrgId: "o1",
      workers: [
        { email: "", first_name: "A", last_name: "B" },        // missing email
        { email: "bad-email", first_name: "A", last_name: "B" } // invalid
      ],
      createdBy: "u1"
    });
    assert.strictEqual(res.created.length, 0);
    assert.strictEqual(res.errors.length, 2);
    assert.strictEqual(res.errors[0].error, "MISSING_REQUIRED_FIELDS");
    assert.strictEqual(res.errors[1].error, "INVALID_EMAIL");
  });

  it("skips an in-org duplicate when onDuplicate='skip'", async () => {
    const pool = sequencePool(
      { rows: [{ email: "dup@x.de", user_id: "u9", first_name: "D", last_name: "U" }] }, // existing in org
      { rows: [] } // global
    );
    const res = await svc.bulkImportWorkers(pool, {
      supplierOrgId: "o1",
      workers: [{ email: "DUP@x.de", first_name: "D", last_name: "U" }],
      onDuplicate: "skip",
      createdBy: "u1"
    });
    assert.strictEqual(res.skipped.length, 1);
    assert.strictEqual(res.skipped[0].reason, "DUPLICATE_IN_ORG");
  });

  it("updates an in-org duplicate when onDuplicate='update'", async () => {
    // 1) existing-in-org SELECT, 2) global SELECT, 3) updateWorkerProfile UPDATE RETURNING
    const pool = sequencePool(
      { rows: [{ email: "dup@x.de", user_id: "u9", first_name: "Old", last_name: "Name" }] },
      { rows: [] },
      { rows: [{ user_id: "u9", skill_tags: [] }] } // updateWorkerProfile success
    );
    const res = await svc.bulkImportWorkers(pool, {
      supplierOrgId: "o1",
      workers: [{ email: "dup@x.de", first_name: "New", last_name: "Name", phone: "123" }],
      onDuplicate: "update",
      createdBy: "u1"
    });
    assert.strictEqual(res.updated.length, 1);
    assert.strictEqual(res.updated[0].user_id, "u9");
  });

  it("rejects an email already used by another role", async () => {
    const pool = sequencePool(
      { rows: [] }, // none in org
      { rows: [{ id: "u5", email: "agency@x.de", role: "agency" }] } // global, other role
    );
    const res = await svc.bulkImportWorkers(pool, {
      supplierOrgId: "o1",
      workers: [{ email: "agency@x.de", first_name: "A", last_name: "B" }],
      createdBy: "u1"
    });
    assert.strictEqual(res.errors.length, 1);
    assert.strictEqual(res.errors[0].error, "EMAIL_EXISTS_OTHER_ROLE");
  });

  it("creates a brand-new worker (exercises bcrypt + createWorkerAccount)", async () => {
    // 1) existing-in-org SELECT → none
    // 2) global SELECT → none
    // 3-5) createWorkerAccount: INSERT users, INSERT membership, INSERT profile
    const pool = sequencePool(
      { rows: [] },
      { rows: [] },
      { rows: [{ id: "newU" }] },
      { rows: [], rowCount: 1 },
      { rows: [{ id: "newP", user_id: "newU", skill_tags: [] }] }
    );
    const res = await svc.bulkImportWorkers(pool, {
      supplierOrgId: "o1",
      workers: [{ email: "fresh@x.de", first_name: "Fresh", last_name: "Worker" }],
      createdBy: "u1"
    });
    assert.strictEqual(res.created.length, 1);
    assert.strictEqual(res.created[0].user_id, "newU");
    assert.strictEqual(res.created[0].profile_id, "newP");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Exported constants
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("exported constants", () => {
  it("PUBLIC_PROFILE_FIELDS is a frozen allowlist", () => {
    assert.ok(Object.isFrozen(svc.PUBLIC_PROFILE_FIELDS));
    assert.ok(svc.PUBLIC_PROFILE_FIELDS.includes("skill_tags"));
  });
  it("document category + status enums are frozen", () => {
    assert.ok(Object.isFrozen(svc.WORKER_DOCUMENT_CATEGORIES));
    assert.ok(svc.WORKER_DOCUMENT_STATUSES.includes("verified"));
    assert.strictEqual(svc.WORKER_DOCUMENT_EXPIRY_WARNING_DAYS, 30);
  });
});
