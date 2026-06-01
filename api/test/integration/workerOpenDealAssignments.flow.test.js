/**
 * Regression test: /api/open-deal-assignments must not 500 due to schema drift.
 *
 * Root cause fixed: workerService.getOpenDealAssignments previously referenced
 * non-existent columns on `requests` (type/title) and crashed at runtime.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { hasDb, registerAndLogin, createPool, cleanupUser } from "./helpers.js";

describe("Worker Open Deal Assignments (regression)", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  const createdEmails = [];
  let company;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    company = await registerAndLogin({
      role: "company",
      company_name: "E2E Worker Org",
      plan: "PLUS"
    });
    createdEmails.push(company.email);
  });

  after(async () => {
    if (!pool) return;
    for (const email of createdEmails) {
      await cleanupUser(pool, email);
    }
    await pool.end();
  });

  it("GET /api/open-deal-assignments returns 200 with stable shape", async () => {
    const res = await company.agent.get("/api/open-deal-assignments");
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body && typeof res.body === "object", "Body must be an object");
    assert.ok(Array.isArray(res.body.items), "Body.items must be an array");
    assert.ok(typeof res.body.total === "number", "Body.total must be a number");
  });
});

