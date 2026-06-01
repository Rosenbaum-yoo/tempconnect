import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/workerSubmissionService.js";
import { returnPool, sequencePool } from "./helpers/mockPool.js";

function buildBundleSubmission(overrides = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    org_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    week_start: "2026-03-02",
    week_end: "2026-03-08",
    total_hours: "40.00",
    status: "approved_internal",
    client_name: "Kunde A",
    ...overrides
  };
}

describe("workerSubmissionService — customer bundle preview", () => {
  it("groups approved_internal submissions by org + period", async () => {
    const pool = returnPool([
      buildBundleSubmission(),
      buildBundleSubmission({
        id: "22222222-2222-2222-2222-222222222222",
        week_start: "2026-03-03",
        week_end: "2026-03-09",
        total_hours: "12.00"
      })
    ]);
    const bundles = await svc.previewCustomerBundles(pool, {
      supplierOrgId: "sup-1",
      periodMode: "week"
    });
    assert.strictEqual(bundles.length, 1);
    assert.strictEqual(bundles[0].submission_count, 2);
    assert.strictEqual(bundles[0].total_hours, 52);
  });
});

describe("workerSubmissionService — send bundle to customer", () => {
  it("sends eligible submissions and returns bundle metadata", async () => {
    const pool = sequencePool(
      {
        rows: [buildBundleSubmission()]
      },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 }
    );
    const res = await svc.sendBundleToCustomer(pool, {
      supplierOrgId: "sup-1",
      actorId: "user-1",
      periodMode: "week",
      submissionIds: ["11111111-1111-1111-1111-111111111111"],
      customerContactEmail: "ops@kunde.de",
      bundleRef: "BATCH-2026-03-W10"
    });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.submission_count, 1);
    assert.ok(res.bundle_key.includes("mode:week"));
  });

  it("rejects explicit selection with mixed customer orgs", async () => {
    const pool = sequencePool({
      rows: [
        buildBundleSubmission(),
        buildBundleSubmission({
          id: "22222222-2222-2222-2222-222222222222",
          org_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          client_name: "Kunde B"
        })
      ]
    });
    const res = await svc.sendBundleToCustomer(pool, {
      supplierOrgId: "sup-1",
      actorId: "user-1",
      periodMode: "week",
      submissionIds: [
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222"
      ]
    });
    assert.strictEqual(res.error, "BUNDLE_SCOPE_MISMATCH");
    assert.strictEqual(res.scope, "org_id");
    assert.deepStrictEqual(res.actual_org_ids, [
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
    ]);
  });

  it("rejects explicit selection with mixed periods", async () => {
    const pool = sequencePool({
      rows: [
        buildBundleSubmission(),
        buildBundleSubmission({
          id: "22222222-2222-2222-2222-222222222222",
          week_start: "2026-03-09",
          week_end: "2026-03-15"
        })
      ]
    });
    const res = await svc.sendBundleToCustomer(pool, {
      supplierOrgId: "sup-1",
      actorId: "user-1",
      periodMode: "week",
      submissionIds: [
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222"
      ]
    });
    assert.strictEqual(res.error, "BUNDLE_SCOPE_MISMATCH");
    assert.strictEqual(res.scope, "period_key");
    assert.deepStrictEqual(res.actual_period_keys, ["2026-03-02", "2026-03-09"]);
  });

  it("rejects explicit selection with ineligible statuses instead of partially sending", async () => {
    const pool = sequencePool({
      rows: [
        buildBundleSubmission(),
        buildBundleSubmission({
          id: "22222222-2222-2222-2222-222222222222",
          status: "submitted"
        })
      ]
    });
    const res = await svc.sendBundleToCustomer(pool, {
      supplierOrgId: "sup-1",
      actorId: "user-1",
      periodMode: "week",
      submissionIds: [
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222"
      ]
    });
    assert.strictEqual(res.error, "BUNDLE_SELECTION_INVALID");
    assert.strictEqual(res.reason, "INELIGIBLE_STATUS");
    assert.deepStrictEqual(res.invalid_submissions, [
      { id: "22222222-2222-2222-2222-222222222222", status: "submitted" }
    ]);
  });

  it("rejects explicit selection when requested ids are missing", async () => {
    const pool = sequencePool({
      rows: [buildBundleSubmission()]
    });
    const res = await svc.sendBundleToCustomer(pool, {
      supplierOrgId: "sup-1",
      actorId: "user-1",
      periodMode: "week",
      submissionIds: [
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222"
      ]
    });
    assert.strictEqual(res.error, "BUNDLE_SELECTION_INVALID");
    assert.strictEqual(res.reason, "MISSING_SUBMISSIONS");
    assert.deepStrictEqual(res.missing_submission_ids, ["22222222-2222-2222-2222-222222222222"]);
  });

  it("returns NO_ELIGIBLE_SUBMISSIONS when none approved_internal", async () => {
    const pool = sequencePool({
      rows: []
    });
    const res = await svc.sendBundleToCustomer(pool, {
      supplierOrgId: "sup-1",
      actorId: "user-1",
      periodMode: "week",
      orgId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      periodKey: "2026-03-02"
    });
    assert.strictEqual(res.error, "NO_ELIGIBLE_SUBMISSIONS");
  });
});
