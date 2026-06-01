/**
 * Data Governance Service unit tests.
 * Covers: export (user/org), canDeleteUser, anonymizeUser,
 * deleteWorkerData, retention, DSGVO request tracking CRUD.
 *
 * Run: node --test --test-force-exit test/dataGovernanceService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/dataGovernanceService.js";
import { returnPool, sequencePool } from "./helpers/mockPool.js";

// ═══════════════════════════════════════════════════════════════
// DATA_CATEGORIES / RETENTION_POLICIES constants
// ═══════════════════════════════════════════════════════════════

describe("dataGovernanceService — constants", () => {
  it("exposes DATA_CATEGORIES with A/B/C/D keys", () => {
    assert.ok(svc.DATA_CATEGORIES.A);
    assert.ok(svc.DATA_CATEGORIES.B);
    assert.ok(svc.DATA_CATEGORIES.C);
    assert.ok(svc.DATA_CATEGORIES.D);
    assert.ok(Array.isArray(svc.DATA_CATEGORIES.A.tables));
  });

  it("Kat A contains users table", () => {
    assert.ok(svc.DATA_CATEGORIES.A.tables.includes("users"));
  });

  it("Kat C contains invoices and audit_log (retention-pflichtig)", () => {
    assert.ok(svc.DATA_CATEGORIES.C.tables.includes("invoices"));
    assert.ok(svc.DATA_CATEGORIES.C.tables.includes("audit_log"));
  });

  it("exposes RETENTION_POLICIES with expected keys", () => {
    assert.ok(svc.RETENTION_POLICIES.notifications);
    assert.ok(svc.RETENTION_POLICIES.session);
    assert.ok(svc.RETENTION_POLICIES.idempotency_keys);
    assert.ok(svc.RETENTION_POLICIES.worker_invites);
  });

  it("getRetentionPolicies returns RETENTION_POLICIES", () => {
    const p = svc.getRetentionPolicies();
    assert.deepStrictEqual(p, svc.RETENTION_POLICIES);
  });
});

// ═══════════════════════════════════════════════════════════════
// exportUserDataFull
// ═══════════════════════════════════════════════════════════════

describe("dataGovernanceService — exportUserDataFull", () => {
  it("returns null when user not found", async () => {
    const pool = returnPool([]);
    const result = await svc.exportUserDataFull(pool, "missing-id");
    assert.strictEqual(result, null);
  });

  it("returns structured export with all 4 categories", async () => {
    const user = { id: "u1", email: "test@test.de", company_name: "Test GmbH" };
    // safeQuery always returns rows from the same pool.query
    // The service calls safeQuery many times — each call gets the same rows array
    // We use sequencePool to simulate different responses for each query
    const pool = sequencePool(
      { rows: [user] },   // users query
      { rows: [] },        // worker_profiles
      { rows: [] },        // company_profiles
      { rows: [] },        // company_contacts
      { rows: [] },        // org_memberships
      { rows: [] },        // listings
      { rows: [] },        // requests sent
      { rows: [] },        // requests received
      { rows: [] },        // ratings
      { rows: [] },        // offers
      { rows: [] },        // capacity_posts
      { rows: [] },        // assignments
      { rows: [] },        // timesheets
      { rows: [] },        // worker_time_submissions
      { rows: [] },        // subscriptions
      { rows: [] },        // invoices
      { rows: [] }         // notifications
    );
    const result = await svc.exportUserDataFull(pool, "u1");
    assert.ok(result);
    assert.ok(result.export_meta);
    assert.strictEqual(result.export_meta.subject_id, "u1");
    assert.strictEqual(result.export_meta.subject_type, "user");
    assert.ok(result.category_A);
    assert.ok(result.category_B);
    assert.ok(result.category_C);
    assert.ok(result.category_D);
    assert.strictEqual(result.category_A.user.email, "test@test.de");
  });

  it("includes Kat C notice about retention", async () => {
    const pool = sequencePool(
      { rows: [{ id: "u1", email: "x@x.de" }] },
      ...Array(16).fill({ rows: [] })
    );
    const result = await svc.exportUserDataFull(pool, "u1");
    assert.ok(result.category_C.notice.includes("HGB"));
  });
});

// ═══════════════════════════════════════════════════════════════
// exportOrgDataFull
// ═══════════════════════════════════════════════════════════════

describe("dataGovernanceService — exportOrgDataFull", () => {
  it("returns null when org not found", async () => {
    const pool = returnPool([]);
    const result = await svc.exportOrgDataFull(pool, "missing-org");
    assert.strictEqual(result, null);
  });

  it("returns org export with meta", async () => {
    const org = { id: "org1", name: "Test AG", type: "company" };
    const pool = sequencePool(
      { rows: [org] },     // org query
      { rows: [] },         // members
      { rows: [] },         // requisitions
      { rows: [] },         // assignments
      { rows: [] },         // contracts
      { rows: [] },         // vendor_pool
      { rows: [] },         // locations
      { rows: [] }          // departments
    );
    const result = await svc.exportOrgDataFull(pool, "org1");
    assert.ok(result);
    assert.strictEqual(result.export_meta.subject_type, "organization");
    assert.strictEqual(result.organization.name, "Test AG");
  });
});

// ═══════════════════════════════════════════════════════════════
// canDeleteUser
// ═══════════════════════════════════════════════════════════════

describe("dataGovernanceService — canDeleteUser", () => {
  it("returns canDelete=true when no blockers", async () => {
    const pool = sequencePool(
      { rows: [{ c: 0 }] },   // active assignments
      { rows: [{ c: 0 }] },   // pending timesheets
      { rows: [{ c: 0 }] }    // open invoices
    );
    const result = await svc.canDeleteUser(pool, "u1");
    assert.strictEqual(result.canDelete, true);
    assert.strictEqual(result.blockers.length, 0);
  });

  it("returns blockers for active assignments", async () => {
    const pool = sequencePool(
      { rows: [{ c: 3 }] },   // 3 active assignments
      { rows: [{ c: 0 }] },
      { rows: [{ c: 0 }] }
    );
    const result = await svc.canDeleteUser(pool, "u1");
    assert.strictEqual(result.canDelete, false);
    assert.strictEqual(result.blockers.length, 1);
    assert.strictEqual(result.blockers[0].reason, "ACTIVE_ASSIGNMENTS");
    assert.strictEqual(result.blockers[0].count, 3);
  });

  it("returns multiple blockers when multiple issues exist", async () => {
    const pool = sequencePool(
      { rows: [{ c: 1 }] },   // 1 active assignment
      { rows: [{ c: 2 }] },   // 2 pending timesheets
      { rows: [{ c: 1 }] }    // 1 open invoice
    );
    const result = await svc.canDeleteUser(pool, "u1");
    assert.strictEqual(result.canDelete, false);
    assert.strictEqual(result.blockers.length, 3);
  });

  it("detects open invoices as blocker", async () => {
    const pool = sequencePool(
      { rows: [{ c: 0 }] },
      { rows: [{ c: 0 }] },
      { rows: [{ c: 5 }] }
    );
    const result = await svc.canDeleteUser(pool, "u1");
    assert.strictEqual(result.canDelete, false);
    assert.strictEqual(result.blockers[0].reason, "OPEN_INVOICES");
  });
});

// ═══════════════════════════════════════════════════════════════
// anonymizeUser
// ═══════════════════════════════════════════════════════════════

describe("dataGovernanceService — anonymizeUser", () => {
  it("blocks anonymization when canDeleteUser returns blockers", async () => {
    const pool = sequencePool(
      { rows: [{ c: 2 }] },   // active assignments blocker
      { rows: [{ c: 0 }] },
      { rows: [{ c: 0 }] }
    );
    const result = await svc.anonymizeUser(pool, "u1", "actor1");
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, "BLOCKERS");
  });

  it("performs anonymization when no blockers", async () => {
    const pool = sequencePool(
      // canDeleteUser queries
      { rows: [{ c: 0 }] },   // assignments
      { rows: [{ c: 0 }] },   // timesheets
      { rows: [{ c: 0 }] },   // invoices
      // anonymize queries
      { rows: [] },            // UPDATE users
      { rows: [] },            // UPDATE worker_profiles
      { rows: [] },            // DELETE worker_invites
      { rows: [] },            // UPDATE company_profiles
      { rows: [] },            // UPDATE offers
      { rows: [] },            // UPDATE requests
      { rows: [] },            // DELETE session
      { rows: [] },            // DELETE notifications
      { rows: [] }             // INSERT audit_log
    );
    const result = await svc.anonymizeUser(pool, "u1", "actor1");
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.user_id, "u1");
    assert.ok(Array.isArray(result.anonymized_tables));
    assert.ok(result.anonymized_tables.includes("users"));
  });

  it("includes session and notifications in Kat D cleanup", async () => {
    const pool = sequencePool(
      { rows: [{ c: 0 }] },
      { rows: [{ c: 0 }] },
      { rows: [{ c: 0 }] },
      ...Array(9).fill({ rows: [] })
    );
    const result = await svc.anonymizeUser(pool, "u1", "actor1");
    assert.ok(result.anonymized_tables.includes("session"));
    assert.ok(result.anonymized_tables.includes("notifications"));
  });
});

// ═══════════════════════════════════════════════════════════════
// deleteWorkerData
// ═══════════════════════════════════════════════════════════════

describe("dataGovernanceService — deleteWorkerData", () => {
  it("anonymizes worker-specific data", async () => {
    const pool = sequencePool(
      { rows: [] },            // UPDATE worker_profiles
      { rows: [] },            // DELETE worker_invites
      { rows: [] },            // DELETE notifications
      { rows: [] }             // INSERT audit_log
    );
    const result = await svc.deleteWorkerData(pool, "w1", "actor1");
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.worker_user_id, "w1");
    assert.ok(result.anonymized_tables.includes("worker_profiles"));
    assert.ok(result.anonymized_tables.includes("notifications"));
  });
});

// ═══════════════════════════════════════════════════════════════
// Retention
// ═══════════════════════════════════════════════════════════════

describe("dataGovernanceService — retention", () => {
  it("getRetentionStatus returns counts", async () => {
    const pool = sequencePool(
      { rows: [{ c: 5 }] },   // expired invites
      { rows: [{ c: 12 }] },  // old notifications
      { rows: [{ c: 3 }] },   // expired sessions
      { rows: [{ c: 7 }] }    // expired idempotency_keys
    );
    const result = await svc.getRetentionStatus(pool, "org1");
    assert.strictEqual(result.expired_invites, 5);
    assert.strictEqual(result.old_read_notifications, 12);
    assert.strictEqual(result.expired_sessions, 3);
    assert.strictEqual(result.expired_idempotency_keys, 7);
  });

  it("executeRetentionCleanup dry-run returns would_delete", async () => {
    const pool = sequencePool(
      { rows: [{ c: 2 }] },
      { rows: [{ c: 0 }] },
      { rows: [{ c: 1 }] },
      { rows: [{ c: 0 }] }
    );
    const result = await svc.executeRetentionCleanup(pool, "org1", true);
    assert.strictEqual(result.dry_run, true);
    assert.ok(result.would_delete);
  });

  it("executeRetentionCleanup actual run returns deleted counts", async () => {
    const pool = sequencePool(
      { rows: [{ id: "inv1" }, { id: "inv2" }] },  // deleted invites
      { rows: [{ id: "n1" }] },                     // deleted notifications
      { rows: [{ sid: "s1" }] },                    // deleted sessions
      { rows: [] }                                   // deleted idempotency_keys
    );
    const result = await svc.executeRetentionCleanup(pool, "org1", false);
    assert.strictEqual(result.dry_run, false);
    assert.strictEqual(result.deleted.deleted_invites, 2);
    assert.strictEqual(result.deleted.deleted_notifications, 1);
    assert.strictEqual(result.deleted.deleted_sessions, 1);
    assert.strictEqual(result.deleted.deleted_idempotency_keys, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// DSGVO Request Tracking
// ═══════════════════════════════════════════════════════════════

describe("dataGovernanceService — createDataRequest", () => {
  it("creates a new DSGVO request", async () => {
    const created = { id: "req-1", org_id: "org1", request_type: "export", subject_type: "user", status: "pending" };
    const pool = returnPool([created]);
    const result = await svc.createDataRequest(pool, {
      orgId: "org1", requestType: "export", subjectType: "user",
      subjectId: "u1", requestedBy: "admin1", notes: "Art. 15"
    });
    assert.strictEqual(result.id, "req-1");
    assert.strictEqual(result.request_type, "export");
  });
});

describe("dataGovernanceService — listDataRequests", () => {
  it("returns paginated list with total", async () => {
    const items = [
      { id: "req-1", request_type: "export", status: "pending" },
      { id: "req-2", request_type: "deletion", status: "completed" }
    ];
    const pool = sequencePool(
      { rows: items },
      { rows: [{ total: 2 }] }
    );
    const result = await svc.listDataRequests(pool, "org1");
    assert.strictEqual(result.items.length, 2);
    assert.strictEqual(result.total, 2);
  });

  it("applies status filter", async () => {
    const pool = sequencePool(
      { rows: [{ id: "req-1", status: "pending" }] },
      { rows: [{ total: 1 }] }
    );
    const result = await svc.listDataRequests(pool, "org1", { status: "pending" });
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0].status, "pending");
  });

  it("returns empty when no requests exist", async () => {
    const pool = sequencePool(
      { rows: [] },
      { rows: [{ total: 0 }] }
    );
    const result = await svc.listDataRequests(pool, "org1");
    assert.strictEqual(result.items.length, 0);
    assert.strictEqual(result.total, 0);
  });
});

describe("dataGovernanceService — completeDataRequest", () => {
  it("completes a pending request", async () => {
    const completed = { id: "req-1", status: "completed", completed_by: "admin1" };
    const pool = returnPool([completed]);
    const result = await svc.completeDataRequest(pool, "req-1", "admin1", { exported: true });
    assert.strictEqual(result.status, "completed");
  });

  it("returns null when request not found or already completed", async () => {
    const pool = returnPool([]);
    const result = await svc.completeDataRequest(pool, "missing", "admin1");
    assert.strictEqual(result, null);
  });
});
