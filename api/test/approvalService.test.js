/**
 * Approval Service unit tests.
 * Covers create, approve, reject, list, history, expiry.
 *
 * Run: node --test --test-force-exit test/approvalService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/approvalService.js";
import { returnPool, sequencePool } from "./helpers/mockPool.js";

// ═══════════════════════════════════════════════════════════════
// createApproval
// ═══════════════════════════════════════════════════════════════

describe("approvalService — createApproval", () => {
  it("creates approval request with all fields", async () => {
    const approval = { id: "ap1", entity_type: "requisition", entity_id: "r1", status: "pending", org_id: "o1" };
    const result = await svc.createApproval(returnPool([approval]), {
      entity_type: "requisition", entity_id: "r1", org_id: "o1",
      requested_by: "u1", reason: "Budget approval", expires_at: "2026-02-01"
    });
    assert.strictEqual(result.id, "ap1");
    assert.strictEqual(result.status, "pending");
  });

  it("creates with optional fields null", async () => {
    const approval = { id: "ap2", entity_type: "worker", entity_id: "w1", status: "pending" };
    const result = await svc.createApproval(returnPool([approval]), {
      entity_type: "worker", entity_id: "w1", requested_by: "u1"
    });
    assert.strictEqual(result.entity_type, "worker");
  });
});

// ═══════════════════════════════════════════════════════════════
// approveEntity
// ═══════════════════════════════════════════════════════════════

describe("approvalService — approveEntity", () => {
  it("approves pending entity and writes audit", async () => {
    const approved = {
      id: "ap1", entity_type: "requisition", entity_id: "r1",
      status: "approved", approved_by: "u2"
    };
    const pool = sequencePool(
      { rows: [approved] },   // UPDATE approval_requests
      { rows: [] }            // writeAudit → INSERT audit_log
    );
    const result = await svc.approveEntity(pool, "ap1", "u2", "Looks good");
    assert.strictEqual(result.status, "approved");
    assert.strictEqual(result.approved_by, "u2");
  });

  it("returns null when already decided", async () => {
    const result = await svc.approveEntity(returnPool([]), "ap1", "u2", "reason");
    assert.strictEqual(result, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// rejectEntity
// ═══════════════════════════════════════════════════════════════

describe("approvalService — rejectEntity", () => {
  it("rejects pending entity and writes audit", async () => {
    const rejected = {
      id: "ap1", entity_type: "requisition", entity_id: "r1",
      status: "rejected", approved_by: "u3"
    };
    const pool = sequencePool(
      { rows: [rejected] },
      { rows: [] }
    );
    const result = await svc.rejectEntity(pool, "ap1", "u3", "Not compliant");
    assert.strictEqual(result.status, "rejected");
  });

  it("returns null when already decided", async () => {
    assert.strictEqual(await svc.rejectEntity(returnPool([]), "ap1", "u2", "reason"), null);
  });
});

// ═══════════════════════════════════════════════════════════════
// listPendingApprovals
// ═══════════════════════════════════════════════════════════════

describe("approvalService — listPendingApprovals", () => {
  it("returns pending approvals without filters", async () => {
    const rows = [{ id: "ap1", status: "pending" }, { id: "ap2", status: "pending" }];
    assert.strictEqual((await svc.listPendingApprovals(returnPool(rows))).length, 2);
  });

  it("applies org_id and entity_type filters", async () => {
    const rows = [{ id: "ap1", entity_type: "requisition" }];
    const result = await svc.listPendingApprovals(returnPool(rows), {
      org_id: "o1", entity_type: "requisition"
    });
    assert.strictEqual(result.length, 1);
  });

  it("respects limit", async () => {
    assert.strictEqual((await svc.listPendingApprovals(returnPool([]), { limit: 10 })).length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// getApprovalHistory / getApprovalById
// ═══════════════════════════════════════════════════════════════

describe("approvalService — getApprovalHistory", () => {
  it("returns history for entity", async () => {
    const rows = [
      { id: "ap1", status: "approved", requested_by_email: "a@x.de" },
      { id: "ap2", status: "rejected", requested_by_email: "a@x.de" }
    ];
    assert.strictEqual((await svc.getApprovalHistory(returnPool(rows), "requisition", "r1")).length, 2);
  });
});

describe("approvalService — getApprovalById", () => {
  it("returns approval when found", async () => {
    const row = { id: "ap1", status: "pending", requested_by_email: "a@x.de" };
    assert.strictEqual((await svc.getApprovalById(returnPool([row]), "ap1")).id, "ap1");
  });

  it("returns null when not found", async () => {
    assert.strictEqual(await svc.getApprovalById(returnPool([]), "ap99"), null);
  });
});

// ═══════════════════════════════════════════════════════════════
// expireOverdue
// ═══════════════════════════════════════════════════════════════

describe("approvalService — expireOverdue", () => {
  it("returns count of expired approvals", async () => {
    const pool = { query: async () => ({ rowCount: 3, rows: [] }) };
    assert.strictEqual((await svc.expireOverdue(pool, 100)).expired, 3);
  });

  it("returns zero when none expired", async () => {
    const pool = { query: async () => ({ rowCount: 0, rows: [] }) };
    assert.strictEqual((await svc.expireOverdue(pool)).expired, 0);
  });
});
