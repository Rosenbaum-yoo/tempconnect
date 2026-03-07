/**
 * Org-Boundary Tests — Validation of org-isolation enforcement.
 * Tests the assertOrgOwnership and assertUserOwnership utilities.
 *
 * Run: npm test test/org-boundary.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { Pool } from "pg";
import * as orgBoundary from "../utils/orgBoundary.js";

const hasDb =
  process.env.DATABASE_URL ||
  (process.env.DB_HOST && process.env.POSTGRES_PASSWORD);

describe("orgBoundary.assertOrgOwnership", () => {
  let pool;
  let testOrgId;
  let testEntityId;
  let otherOrgId;

  before(async () => {
    if (!hasDb) return;
    const sslRequired = (process.env.PGSSLMODE || "").toLowerCase() === "require";
    const sslConfig = sslRequired ? { ssl: { rejectUnauthorized: false } } : {};
    pool = new Pool(
      process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL, ...sslConfig }
        : {
            host: process.env.DB_HOST || "localhost",
            port: Number(process.env.DB_PORT) || 5432,
            database: process.env.POSTGRES_DB || "tempconnect",
            user: process.env.POSTGRES_USER || "tempconnect",
            password: process.env.POSTGRES_PASSWORD,
            ...sslConfig
          }
    );

    // Create test organizations
    const org1 = await pool.query(
      "INSERT INTO organizations (name, type, is_active) VALUES ($1, $2, TRUE) RETURNING id",
      ["Test Org 1", "company"]
    );
    const org2 = await pool.query(
      "INSERT INTO organizations (name, type, is_active) VALUES ($1, $2, TRUE) RETURNING id",
      ["Test Org 2", "company"]
    );
    testOrgId = org1.rows[0].id;
    otherOrgId = org2.rows[0].id;

    // Create test requisition (has org_id)
    const req = await pool.query(
      "INSERT INTO requisitions (client_org_id, title, status) VALUES ($1, $2, $3) RETURNING id",
      [testOrgId, "Test Req", "OPEN"]
    );
    testEntityId = req.rows[0].id;
  });

  after(async () => {
    if (pool) {
      if (testEntityId) {
        await pool.query("DELETE FROM requisitions WHERE id=$1", [testEntityId]).catch(() => {});
      }
      if (testOrgId) {
        await pool.query("DELETE FROM organizations WHERE id=$1", [testOrgId]).catch(() => {});
      }
      if (otherOrgId) {
        await pool.query("DELETE FROM organizations WHERE id=$1", [otherOrgId]).catch(() => {});
      }
      await pool.end();
    }
  });

  it("allows access when org_id matches", async function () {
    if (!hasDb || !testOrgId) {
      this.skip();
      return;
    }
    try {
      await orgBoundary.assertOrgOwnership(pool, "requisitions", testEntityId, testOrgId, { orgColumn: "client_org_id" });
      // No error = pass
      assert.ok(true);
    } catch (e) {
      assert.fail(`Should not throw for matching org: ${e.message}`);
    }
  });

  it("throws ORG_BOUNDARY_VIOLATION when org_id does not match", async function () {
    if (!hasDb || !testOrgId || !otherOrgId) {
      this.skip();
      return;
    }
    try {
      await orgBoundary.assertOrgOwnership(pool, "requisitions", testEntityId, otherOrgId, { orgColumn: "client_org_id" });
      assert.fail("Should have thrown ORG_BOUNDARY_VIOLATION");
    } catch (e) {
      assert.strictEqual(e.code, "ORG_BOUNDARY_VIOLATION");
      assert.strictEqual(e.status, 403);
    }
  });

  it("throws NOT_FOUND when entity does not exist", async function () {
    if (!hasDb || !testOrgId) {
      this.skip();
      return;
    }
    try {
      await orgBoundary.assertOrgOwnership(pool, "requisitions", "00000000-0000-0000-0000-000000000000", testOrgId, { orgColumn: "client_org_id" });
      assert.fail("Should have thrown NOT_FOUND");
    } catch (e) {
      assert.strictEqual(e.code, "NOT_FOUND");
      assert.strictEqual(e.status, 404);
    }
  });
});

describe("orgBoundary.assertUserOwnership", () => {
  let pool;
  let testUserId;
  let otherUserId;
  let testEntityId;

  before(async () => {
    if (!hasDb) return;
    const sslRequired = (process.env.PGSSLMODE || "").toLowerCase() === "require";
    const sslConfig = sslRequired ? { ssl: { rejectUnauthorized: false } } : {};
    pool = new Pool(
      process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL, ...sslConfig }
        : {
            host: process.env.DB_HOST || "localhost",
            port: Number(process.env.DB_PORT) || 5432,
            database: process.env.POSTGRES_DB || "tempconnect",
            user: process.env.POSTGRES_USER || "tempconnect",
            password: process.env.POSTGRES_PASSWORD,
            ...sslConfig
          }
    );

    // Get or create test users
    const users = await pool.query(
      "SELECT id FROM users WHERE role='company' LIMIT 2"
    );
    if (users.rows.length < 2) {
      this.skip();
      return;
    }
    testUserId = users.rows[0].id;
    otherUserId = users.rows[1].id;

    // Create test listing (has uploaded_by/user_id)
    const listing = await pool.query(
      "INSERT INTO listings (uploaded_by, title, type, status) VALUES ($1, $2, $3, $4) RETURNING id",
      [testUserId, "Test Listing", "job", "ACTIVE"]
    );
    testEntityId = listing.rows[0].id;
  });

  after(async () => {
    if (pool) {
      if (testEntityId) {
        await pool.query("DELETE FROM listings WHERE id=$1", [testEntityId]).catch(() => {});
      }
      await pool.end();
    }
  });

  it("allows access when user_id matches on uploaded_by", async function () {
    if (!hasDb || !testUserId || !testEntityId) {
      this.skip();
      return;
    }
    try {
      await orgBoundary.assertUserOwnership(pool, "listings", testEntityId, testUserId, { userColumn: "uploaded_by" });
      assert.ok(true);
    } catch (e) {
      assert.fail(`Should not throw for matching user: ${e.message}`);
    }
  });

  it("throws OWNERSHIP_VIOLATION when user_id does not match", async function () {
    if (!hasDb || !otherUserId || !testEntityId) {
      this.skip();
      return;
    }
    try {
      await orgBoundary.assertUserOwnership(pool, "listings", testEntityId, otherUserId, { userColumn: "uploaded_by" });
      assert.fail("Should have thrown ORG_BOUNDARY_VIOLATION");
    } catch (e) {
      assert.strictEqual(e.code, "ORG_BOUNDARY_VIOLATION");
      assert.strictEqual(e.status, 403);
    }
  });
});

describe("Org-scoped request isolation (integration)", () => {
  let pool;
  let org1Id;
  let org2Id;
  let user1Id;
  let user2Id;

  before(async () => {
    if (!hasDb) return;
    const sslRequired = (process.env.PGSSLMODE || "").toLowerCase() === "require";
    const sslConfig = sslRequired ? { ssl: { rejectUnauthorized: false } } : {};
    pool = new Pool(
      process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL, ...sslConfig }
        : {
            host: process.env.DB_HOST || "localhost",
            port: Number(process.env.DB_PORT) || 5432,
            database: process.env.POSTGRES_DB || "tempconnect",
            user: process.env.POSTGRES_USER || "tempconnect",
            password: process.env.POSTGRES_PASSWORD,
            ...sslConfig
          }
    );

    // Create 2 orgs
    const org1 = await pool.query(
      "INSERT INTO organizations (name, type, is_active) VALUES ($1, $2, TRUE) RETURNING id",
      ["Test Org Alpha", "company"]
    );
    const org2 = await pool.query(
      "INSERT INTO organizations (name, type, is_active) VALUES ($1, $2, TRUE) RETURNING id",
      ["Test Org Beta", "company"]
    );
    org1Id = org1.rows[0].id;
    org2Id = org2.rows[0].id;

    // Get existing users for each org
    const users = await pool.query("SELECT id FROM users WHERE role='company' LIMIT 2");
    if (users.rows.length >= 2) {
      user1Id = users.rows[0].id;
      user2Id = users.rows[1].id;
      await pool.query("UPDATE users SET org_id=$1 WHERE id=$2", [org1Id, user1Id]);
      await pool.query("UPDATE users SET org_id=$1 WHERE id=$2", [org2Id, user2Id]);
    }
  });

  after(async () => {
    if (pool) {
      if (org1Id) {
        await pool.query("DELETE FROM organizations WHERE id=$1", [org1Id]).catch(() => {});
      }
      if (org2Id) {
        await pool.query("DELETE FROM organizations WHERE id=$1", [org2Id]).catch(() => {});
      }
      await pool.end();
    }
  });

  it("user from org1 cannot view org2's requisitions", async function () {
    if (!hasDb || !org1Id || !org2Id || !user1Id) {
      this.skip();
      return;
    }

    // Create requisition for org2
    const req = await pool.query(
      "INSERT INTO requisitions (client_org_id, title, status) VALUES ($1, $2, $3) RETURNING id",
      [org2Id, "Secret Req", "OPEN"]
    );
    const reqId = req.rows[0].id;

    try {
      // User1 from org1 tries to assert ownership of org2's requisition
      await orgBoundary.assertOrgOwnership(pool, "requisitions", reqId, org1Id, { orgColumn: "client_org_id" });
      assert.fail("Should have thrown ORG_BOUNDARY_VIOLATION");
    } catch (e) {
      assert.strictEqual(e.code, "ORG_BOUNDARY_VIOLATION");
    } finally {
      await pool.query("DELETE FROM requisitions WHERE id=$1", [reqId]).catch(() => {});
    }
  });
});
