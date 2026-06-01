/**
 * ComplianceDocService unit tests — full CRUD + traffic-light enrichment,
 * stats aggregation, batch expiry, reminder workflow.
 *
 * Run: node --test --test-force-exit test/complianceDocService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  trafficLight,
  uploadDocument,
  getDocumentById,
  listDocuments,
  updateDocument,
  verifyDocument,
  rejectDocument,
  deleteDocument,
  complianceStats,
  findExpiringDocuments,
  markReminderSent,
  expireBatch
} from "../services/complianceDocService.js";

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

const DOC_ROW = {
  id: "doc-1",
  org_id: "org-1",
  uploaded_by: "user-1",
  doc_type: "gewerbe",
  doc_name: "Gewerbeschein.pdf",
  file_ref: "/uploads/gewerbe-1.pdf",
  status: "pending",
  valid_from: "2025-01-01",
  valid_until: "2027-06-30",
  notes: null,
  org_name: "Firma GmbH",
  uploaded_by_email: "admin@firma.de",
  uploaded_by_name: "Firma GmbH",
  verified_by_email: null
};

/* ═══════════════════════════════════════════════════════════
   trafficLight (pure function — already partially tested in
   compliance-traffic-light.test.js, but we cover service-level
   integration here)
   ═══════════════════════════════════════════════════════════ */

describe("trafficLight — service integration", () => {
  it("returns 'grey' for null/undefined/empty", () => {
    assert.strictEqual(trafficLight(null), "grey");
    assert.strictEqual(trafficLight(undefined), "grey");
    assert.strictEqual(trafficLight(""), "grey");
  });

  it("returns 'red' for past dates", () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    assert.strictEqual(trafficLight(yesterday), "red");
  });

  it("returns 'yellow' for dates within 30 days", () => {
    const in15Days = new Date(Date.now() + 15 * 86400000).toISOString();
    assert.strictEqual(trafficLight(in15Days), "yellow");
  });

  it("returns 'green' for dates beyond 30 days", () => {
    const in60Days = new Date(Date.now() + 60 * 86400000).toISOString();
    assert.strictEqual(trafficLight(in60Days), "green");
  });
});

/* ═══════════════════════════════════════════════════════════
   uploadDocument
   ═══════════════════════════════════════════════════════════ */

describe("uploadDocument", () => {
  it("inserts document with 'pending' status", async () => {
    const pool = mockPool({ rows: [DOC_ROW] });
    const result = await uploadDocument(pool, {
      org_id: "org-1",
      uploaded_by: "user-1",
      doc_type: "gewerbe",
      doc_name: "Gewerbeschein.pdf",
      file_ref: "/uploads/gewerbe-1.pdf",
      valid_from: "2025-01-01",
      valid_until: "2027-06-30"
    });
    assert.strictEqual(result.id, "doc-1");
    assert.ok(pool.queries[0].sql.includes("INSERT INTO compliance_documents"));
    assert.ok(pool.queries[0].sql.includes("'pending'"));
  });

  it("defaults optional fields to null", async () => {
    const pool = mockPool({ rows: [{ ...DOC_ROW, file_ref: null, valid_from: null, valid_until: null, notes: null }] });
    await uploadDocument(pool, { org_id: "org-1", uploaded_by: "user-1", doc_type: "ausweis", doc_name: "ID" });
    const params = pool.queries[0].params;
    assert.strictEqual(params[4], null); // file_ref
    assert.strictEqual(params[5], null); // valid_from
    assert.strictEqual(params[6], null); // valid_until
    assert.strictEqual(params[7], null); // notes
  });

  it("propagates DB error", async () => {
    const pool = { query: async () => { throw new Error("fk_violation"); } };
    await assert.rejects(
      () => uploadDocument(pool, { org_id: "org-1", uploaded_by: "user-1", doc_type: "x", doc_name: "y" }),
      { message: "fk_violation" }
    );
  });
});

/* ═══════════════════════════════════════════════════════════
   getDocumentById
   ═══════════════════════════════════════════════════════════ */

describe("getDocumentById", () => {
  it("returns document with traffic_light enrichment", async () => {
    const pool = mockPool({ rows: [{ ...DOC_ROW }] });
    const result = await getDocumentById(pool, "doc-1");
    assert.strictEqual(result.id, "doc-1");
    assert.strictEqual(result.traffic_light, "green"); // valid_until 2027-06-30 is >30 days
    assert.ok(pool.queries[0].sql.includes("LEFT JOIN organizations o"));
    assert.ok(pool.queries[0].sql.includes("LEFT JOIN users u_up"));
    assert.ok(pool.queries[0].sql.includes("LEFT JOIN users u_ver"));
  });

  it("returns null when not found", async () => {
    const pool = mockPool({ rows: [] });
    assert.strictEqual(await getDocumentById(pool, "missing"), null);
  });

  it("enriches traffic_light based on valid_until", async () => {
    const expired = { ...DOC_ROW, valid_until: "2020-01-01" };
    const pool = mockPool({ rows: [expired] });
    const result = await getDocumentById(pool, "doc-1");
    assert.strictEqual(result.traffic_light, "red");
  });

  it("sets grey traffic_light when valid_until is null", async () => {
    const noExpiry = { ...DOC_ROW, valid_until: null };
    const pool = mockPool({ rows: [noExpiry] });
    const result = await getDocumentById(pool, "doc-1");
    assert.strictEqual(result.traffic_light, "grey");
  });
});

/* ═══════════════════════════════════════════════════════════
   listDocuments
   ═══════════════════════════════════════════════════════════ */

describe("listDocuments", () => {
  it("returns documents with traffic_light enrichment", async () => {
    const pool = mockPool({ rows: [{ ...DOC_ROW }] });
    const result = await listDocuments(pool);
    assert.strictEqual(result.length, 1);
    assert.ok("traffic_light" in result[0]);
  });

  it("filters by org_id", async () => {
    const pool = mockPool({ rows: [] });
    await listDocuments(pool, { org_id: "org-1" });
    assert.ok(pool.queries[0].sql.includes("org_id = $1"));
  });

  it("filters by doc_type", async () => {
    const pool = mockPool({ rows: [] });
    await listDocuments(pool, { doc_type: "ausweis" });
    assert.ok(pool.queries[0].sql.includes("doc_type = $1"));
  });

  it("filters by status", async () => {
    const pool = mockPool({ rows: [] });
    await listDocuments(pool, { status: "verified" });
    assert.ok(pool.queries[0].sql.includes("status = $1"));
  });

  it("combines filters", async () => {
    const pool = mockPool({ rows: [] });
    await listDocuments(pool, { org_id: "org-1", status: "pending" });
    assert.ok(pool.queries[0].sql.includes("AND"));
  });

  it("caps limit at 200", async () => {
    const pool = mockPool({ rows: [] });
    await listDocuments(pool, { limit: 999 });
    const params = pool.queries[0].params;
    assert.strictEqual(params[params.length - 1], 200);
  });

  it("defaults limit to 100", async () => {
    const pool = mockPool({ rows: [] });
    await listDocuments(pool);
    const params = pool.queries[0].params;
    assert.strictEqual(params[params.length - 1], 100);
  });

  it("orders by valid_until ASC NULLS LAST", async () => {
    const pool = mockPool({ rows: [] });
    await listDocuments(pool);
    assert.ok(pool.queries[0].sql.includes("ORDER BY cd.valid_until ASC NULLS LAST"));
  });
});

/* ═══════════════════════════════════════════════════════════
   updateDocument
   ═══════════════════════════════════════════════════════════ */

describe("updateDocument", () => {
  it("updates allowed fields and returns row", async () => {
    const updated = { ...DOC_ROW, doc_name: "Neuer Name.pdf" };
    const pool = mockPool({ rows: [updated] });
    const result = await updateDocument(pool, "doc-1", { doc_name: "Neuer Name.pdf" });
    assert.strictEqual(result.doc_name, "Neuer Name.pdf");
    assert.ok(pool.queries[0].sql.includes("doc_name = $2"));
    assert.ok(pool.queries[0].sql.includes("updated_at = NOW()"));
  });

  it("returns null when no allowed fields provided", async () => {
    const pool = mockPool({ rows: [] });
    const result = await updateDocument(pool, "doc-1", {});
    assert.strictEqual(result, null);
    assert.strictEqual(pool.queries.length, 0);
  });

  it("returns null when no allowed fields match", async () => {
    const pool = mockPool({ rows: [] });
    const result = await updateDocument(pool, "doc-1", { malicious: "DROP TABLE" });
    assert.strictEqual(result, null);
  });

  it("returns null when document not found", async () => {
    const pool = mockPool({ rows: [] });
    const result = await updateDocument(pool, "missing", { doc_name: "x" });
    assert.strictEqual(result, null);
  });

  it("only includes allowed fields in query", async () => {
    const pool = mockPool({ rows: [DOC_ROW] });
    await updateDocument(pool, "doc-1", {
      doc_name: "OK",
      status: "hacked",  // not in allowed list
      org_id: "injected"  // not in allowed list
    });
    const sql = pool.queries[0].sql;
    assert.ok(sql.includes("doc_name"));
    assert.ok(!sql.includes("org_id = $"));
    // status IS in allowed list for updateDocument
  });

  it("propagates pool error", async () => {
    const pool = { query: async () => { throw new Error("timeout"); } };
    await assert.rejects(() => updateDocument(pool, "doc-1", { doc_name: "x" }), { message: "timeout" });
  });
});

/* ═══════════════════════════════════════════════════════════
   verifyDocument
   ═══════════════════════════════════════════════════════════ */

describe("verifyDocument", () => {
  it("verifies pending document", async () => {
    const verified = { ...DOC_ROW, status: "verified", verified_by: "admin-1", verified_at: "2026-03-14T12:00:00Z" };
    const pool = mockPool({ rows: [verified] });
    const result = await verifyDocument(pool, "doc-1", "admin-1");
    assert.strictEqual(result.status, "verified");
    assert.strictEqual(result.verified_by, "admin-1");
    assert.ok(pool.queries[0].sql.includes("status = 'verified'"));
    assert.ok(pool.queries[0].sql.includes("status = 'pending'"));
  });

  it("returns null when already verified/rejected", async () => {
    const pool = mockPool({ rows: [] });
    assert.strictEqual(await verifyDocument(pool, "doc-1", "admin-1"), null);
  });

  it("passes verifier id", async () => {
    const pool = mockPool({ rows: [] });
    await verifyDocument(pool, "doc-1", "verifier-42");
    assert.strictEqual(pool.queries[0].params[1], "verifier-42");
  });
});

/* ═══════════════════════════════════════════════════════════
   rejectDocument
   ═══════════════════════════════════════════════════════════ */

describe("rejectDocument", () => {
  it("rejects pending document with reason", async () => {
    const rejected = { ...DOC_ROW, status: "rejected", rejection_reason: "Ungültig" };
    const pool = mockPool({ rows: [rejected] });
    const result = await rejectDocument(pool, "doc-1", "admin-1", "Ungültig");
    assert.strictEqual(result.status, "rejected");
    assert.strictEqual(result.rejection_reason, "Ungültig");
    assert.ok(pool.queries[0].sql.includes("status = 'rejected'"));
    assert.ok(pool.queries[0].sql.includes("rejection_reason"));
    assert.ok(pool.queries[0].sql.includes("status = 'pending'"));
  });

  it("returns null when not pending", async () => {
    const pool = mockPool({ rows: [] });
    assert.strictEqual(await rejectDocument(pool, "doc-1", "admin-1", "late"), null);
  });

  it("defaults null reason", async () => {
    const pool = mockPool({ rows: [{ ...DOC_ROW, status: "rejected", rejection_reason: null }] });
    await rejectDocument(pool, "doc-1", "admin-1", null);
    assert.strictEqual(pool.queries[0].params[2], null);
  });
});

/* ═══════════════════════════════════════════════════════════
   deleteDocument
   ═══════════════════════════════════════════════════════════ */

describe("deleteDocument", () => {
  it("returns true when deleted", async () => {
    const pool = mockPool({ rowCount: 1 });
    assert.strictEqual(await deleteDocument(pool, "doc-1"), true);
    assert.ok(pool.queries[0].sql.includes("DELETE FROM compliance_documents"));
    assert.deepStrictEqual(pool.queries[0].params, ["doc-1"]);
  });

  it("returns false when not found", async () => {
    const pool = mockPool({ rowCount: 0 });
    assert.strictEqual(await deleteDocument(pool, "missing"), false);
  });
});

/* ═══════════════════════════════════════════════════════════
   complianceStats
   ═══════════════════════════════════════════════════════════ */

describe("complianceStats", () => {
  it("aggregates stats for org with mixed statuses", async () => {
    const futureDate = new Date(Date.now() + 60 * 86400000).toISOString();
    const soonDate = new Date(Date.now() + 10 * 86400000).toISOString();
    const pastDate = new Date(Date.now() - 5 * 86400000).toISOString();
    const rows = [
      { doc_type: "gewerbe", status: "verified", valid_until: futureDate },
      { doc_type: "gewerbe", status: "pending", valid_until: soonDate },
      { doc_type: "ausweis", status: "rejected", valid_until: null },
      { doc_type: "zeugnis", status: "verified", valid_until: pastDate }
    ];
    const pool = mockPool({ rows });
    const result = await complianceStats(pool, "org-1");
    assert.strictEqual(result.total, 4);
    assert.strictEqual(result.verified, 2);
    assert.strictEqual(result.pending, 1);
    assert.strictEqual(result.rejected, 1);
    assert.ok(result.by_type.gewerbe, "Should have gewerbe type");
    assert.ok(result.by_type.ausweis, "Should have ausweis type");
    assert.ok(result.by_type.zeugnis, "Should have zeugnis type");
  });

  it("returns zeros for empty org", async () => {
    const pool = mockPool({ rows: [] });
    const result = await complianceStats(pool, "org-empty");
    assert.strictEqual(result.total, 0);
    assert.strictEqual(result.verified, 0);
    assert.strictEqual(result.pending, 0);
    assert.strictEqual(result.rejected, 0);
    assert.strictEqual(result.expired, 0);
    assert.deepStrictEqual(result.by_type, {});
  });

  it("counts expiring_soon from traffic light yellow", async () => {
    const soonDate = new Date(Date.now() + 15 * 86400000).toISOString();
    const pool = mockPool({ rows: [{ doc_type: "x", status: "verified", valid_until: soonDate }] });
    const result = await complianceStats(pool, "org-1");
    assert.strictEqual(result.expiring_soon, 1);
  });

  it("sets worst-case traffic light per type", async () => {
    const soonDate = new Date(Date.now() + 10 * 86400000).toISOString();
    const futureDate = new Date(Date.now() + 90 * 86400000).toISOString();
    const pool = mockPool({
      rows: [
        { doc_type: "gewerbe", status: "verified", valid_until: futureDate },
        { doc_type: "gewerbe", status: "verified", valid_until: soonDate }
      ]
    });
    const result = await complianceStats(pool, "org-1");
    assert.strictEqual(result.by_type.gewerbe.traffic_light, "yellow");
  });
});

/* ═══════════════════════════════════════════════════════════
   findExpiringDocuments
   ═══════════════════════════════════════════════════════════ */

describe("findExpiringDocuments", () => {
  it("finds verified docs expiring within daysAhead", async () => {
    const pool = mockPool({ rows: [DOC_ROW] });
    const result = await findExpiringDocuments(pool, 30);
    assert.strictEqual(result.length, 1);
    assert.ok(pool.queries[0].sql.includes("status = 'verified'"));
    assert.ok(pool.queries[0].sql.includes("valid_until IS NOT NULL"));
    assert.ok(pool.queries[0].sql.includes("reminder_sent_at IS NULL"));
    assert.ok(pool.queries[0].sql.includes("valid_until <= $1"));
  });

  it("default daysAhead is 30, limit is 100", async () => {
    const pool = mockPool({ rows: [] });
    await findExpiringDocuments(pool);
    const params = pool.queries[0].params;
    assert.ok(params[0] instanceof Date);
    assert.strictEqual(params[1], 100);
  });

  it("computes correct threshold date", async () => {
    const pool = mockPool({ rows: [] });
    await findExpiringDocuments(pool, 14);
    const threshold = pool.queries[0].params[0];
    const diffDays = (threshold.getTime() - Date.now()) / 86400000;
    assert.ok(diffDays >= 13 && diffDays <= 15, `Expected ~14 days, got ${diffDays.toFixed(1)}`);
  });

  it("respects custom limit", async () => {
    const pool = mockPool({ rows: [] });
    await findExpiringDocuments(pool, 7, 5);
    assert.strictEqual(pool.queries[0].params[1], 5);
  });
});

/* ═══════════════════════════════════════════════════════════
   markReminderSent
   ═══════════════════════════════════════════════════════════ */

describe("markReminderSent", () => {
  it("sets reminder_sent_at to NOW()", async () => {
    const pool = mockPool({ rowCount: 1 });
    await markReminderSent(pool, "doc-1");
    assert.ok(pool.queries[0].sql.includes("reminder_sent_at = NOW()"));
    assert.ok(pool.queries[0].sql.includes("updated_at = NOW()"));
    assert.deepStrictEqual(pool.queries[0].params, ["doc-1"]);
  });
});

/* ═══════════════════════════════════════════════════════════
   expireBatch
   ═══════════════════════════════════════════════════════════ */

describe("expireBatch — compliance docs", () => {
  it("returns count of expired documents", async () => {
    const pool = mockPool({ rowCount: 3 });
    const result = await expireBatch(pool);
    assert.deepStrictEqual(result, { expired: 3 });
    assert.ok(pool.queries[0].sql.includes("status = 'expired'"));
    assert.ok(pool.queries[0].sql.includes("status = 'verified'"));
    assert.ok(pool.queries[0].sql.includes("valid_until < NOW()"));
  });

  it("returns 0 when none expired", async () => {
    const pool = mockPool({ rowCount: 0 });
    assert.deepStrictEqual(await expireBatch(pool), { expired: 0 });
  });

  it("defaults limit to 200", async () => {
    const pool = mockPool({ rowCount: 0 });
    await expireBatch(pool);
    assert.deepStrictEqual(pool.queries[0].params, [200]);
  });

  it("respects custom limit", async () => {
    const pool = mockPool({ rowCount: 0 });
    await expireBatch(pool, 50);
    assert.deepStrictEqual(pool.queries[0].params, [50]);
  });
});
