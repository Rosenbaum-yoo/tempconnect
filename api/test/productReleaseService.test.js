/**
 * Product release targeting — unit tests (no DB).
 * Run: node --test --test-force-exit api/test/productReleaseService.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  planTier,
  entryVisibleForUser
} from "../services/productReleaseService.js";

describe("planTier", () => {
  it("ranks plans for min_plan gating", () => {
    assert.equal(planTier("DEMO"), 0);
    assert.equal(planTier("BASIS"), 1);
    assert.equal(planTier("PLUS"), 2);
    assert.equal(planTier("PRO"), 3);
    assert.equal(planTier("ENTERPRISE"), 4);
  });
});

describe("entryVisibleForUser", () => {
  const baseRow = {
    status: "published",
    visibility: "public",
    published_at: new Date(Date.now() - 86400000).toISOString(),
    audiences: [],
    min_plan: null,
    required_feature_key: null
  };

  const companyPlus = {
    userRole: "company",
    orgRole: "owner",
    plan: "PLUS",
    isInternalViewer: false
  };

  it("hides draft from non-internal viewers", () => {
    assert.equal(
      entryVisibleForUser({ ...baseRow, status: "draft" }, companyPlus),
      false
    );
    assert.equal(
      entryVisibleForUser({ ...baseRow, status: "draft" }, { ...companyPlus, isInternalViewer: true }),
      true
    );
  });

  it("hides internal visibility from customers", () => {
    assert.equal(
      entryVisibleForUser({ ...baseRow, visibility: "internal" }, companyPlus),
      false
    );
    assert.equal(
      entryVisibleForUser({ ...baseRow, visibility: "internal" }, { ...companyPlus, isInternalViewer: true }),
      true
    );
  });

  it("enforces min_plan", () => {
    assert.equal(
      entryVisibleForUser({ ...baseRow, min_plan: "PRO" }, companyPlus),
      false
    );
    assert.equal(
      entryVisibleForUser({ ...baseRow, min_plan: "PLUS" }, companyPlus),
      true
    );
  });

  it("filters by audience OR (company tag)", () => {
    assert.equal(
      entryVisibleForUser({ ...baseRow, audiences: ["agency"] }, companyPlus),
      false
    );
    assert.equal(
      entryVisibleForUser({ ...baseRow, audiences: ["company"] }, companyPlus),
      true
    );
  });

  it("matches supplier_user via org role", () => {
    const ctx = { userRole: "company", orgRole: "supplier_user", plan: "PRO", isInternalViewer: false };
    assert.equal(entryVisibleForUser({ ...baseRow, audiences: ["supplier_user"] }, ctx), true);
    assert.equal(entryVisibleForUser({ ...baseRow, audiences: ["company"] }, ctx), true);
  });
});
