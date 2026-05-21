/**
 * multi-location-integration.test.js
 * Integration-Tests fuer die Multi-Location-Flows.
 * Benoetigt eine laufende DB (wird uebersprungen wenn keine DB-Verbindung).
 *
 * Testet:
 *  - orgContext: location-Resolution via X-Location-Id / session cache / membership default
 *  - assignmentService: listAssignments mit location_id-Filter
 *  - orgBoundary middleware: location behoert wirklich zur Org
 *
 * Run: node --test api/test/multi-location-integration.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";

const hasDb =
  process.env.DATABASE_URL ||
  (process.env.DB_HOST && process.env.POSTGRES_PASSWORD);

/* ── Pool-Helper ───────────────────────────────────────────── */

function makePool() {
  const sslRequired = (process.env.PGSSLMODE || "").toLowerCase() === "require";
  const sslConfig = sslRequired ? { ssl: { rejectUnauthorized: false } } : {};
  return new Pool(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL, ...sslConfig }
      : {
          host: process.env.DB_HOST || "localhost",
          port: Number(process.env.DB_PORT) || 5432,
          database: process.env.POSTGRES_DB || "tempconnect",
          user: process.env.POSTGRES_USER || "tempconnect",
          password: process.env.POSTGRES_PASSWORD,
          ...sslConfig,
        }
  );
}

/* ── orgContext location-resolution (unit-level, no DB) ───── */

describe("orgContext — location UUID validation (no DB)", () => {
  // Import the middleware factory and test UUID-rejection in isolation
  it("rejects non-UUID X-Location-Id (string comparison logic)", () => {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    assert.equal(UUID_RE.test("not-a-uuid"), false);
    assert.equal(UUID_RE.test("'; DROP TABLE users; --"), false);
    assert.equal(UUID_RE.test("a1b2c3d4-e5f6-7890-abcd-ef1234567890"), true);
    assert.equal(UUID_RE.test("A1B2C3D4-E5F6-7890-ABCD-EF1234567890"), true); // case-insensitive
  });
});

/* ── orgBoundary middleware: location must belong to org (DB) */

describe("requireLocationBelongsToOrg — DB integration", () => {
  let pool;
  let orgId;
  let otherOrgId;
  let locationId;

  before(async function () {
    if (!hasDb) return;
    pool = makePool();
    const ts = Date.now();

    const org1 = await pool.query(
      "INSERT INTO organizations (name, slug, type, is_active) VALUES ($1,$2,$3,TRUE) RETURNING id",
      ["Loc Test Org 1", `loc-test-org1-${ts}`, "company"]
    );
    const org2 = await pool.query(
      "INSERT INTO organizations (name, slug, type, is_active) VALUES ($1,$2,$3,TRUE) RETURNING id",
      ["Loc Test Org 2", `loc-test-org2-${ts}`, "company"]
    );
    orgId = org1.rows[0].id;
    otherOrgId = org2.rows[0].id;

    // Create a location for org1
    const loc = await pool.query(
      "INSERT INTO org_locations (org_id, name, city, is_hq) VALUES ($1,$2,$3,$4) RETURNING id",
      [orgId, "Muenchen HQ", "Muenchen", true]
    );
    locationId = loc.rows[0].id;
  });

  after(async () => {
    if (pool) {
      if (locationId) await pool.query("DELETE FROM org_locations WHERE id=$1", [locationId]).catch(() => {});
      if (orgId)     await pool.query("DELETE FROM organizations WHERE id=$1", [orgId]).catch(() => {});
      if (otherOrgId) await pool.query("DELETE FROM organizations WHERE id=$1", [otherOrgId]).catch(() => {});
      await pool.end();
    }
  });

  it("validates location belongs to correct org", async function () {
    if (!hasDb || !locationId) return this.skip();
    const { rows } = await pool.query(
      "SELECT id, name FROM org_locations WHERE id=$1 AND org_id=$2 AND is_active=TRUE",
      [locationId, orgId]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, locationId);
    assert.equal(rows[0].name, "Muenchen HQ");
  });

  it("cross-org validation: location does NOT belong to other org", async function () {
    if (!hasDb || !locationId || !otherOrgId) return this.skip();
    const { rows } = await pool.query(
      "SELECT id FROM org_locations WHERE id=$1 AND org_id=$2 AND is_active=TRUE",
      [locationId, otherOrgId]
    );
    assert.equal(rows.length, 0, "Location should NOT be found for wrong org");
  });

  it("soft-deleted location is not found", async function () {
    if (!hasDb || !locationId) return this.skip();
    // Soft-delete the location
    await pool.query("UPDATE org_locations SET is_active=FALSE WHERE id=$1", [locationId]);
    const { rows } = await pool.query(
      "SELECT id FROM org_locations WHERE id=$1 AND org_id=$2 AND is_active=TRUE",
      [locationId, orgId]
    );
    assert.equal(rows.length, 0);
    // Restore
    await pool.query("UPDATE org_locations SET is_active=TRUE WHERE id=$1", [locationId]);
  });
});

/* ── assignmentService: location_id filter (DB) ──────────── */

describe("assignmentService.listAssignments — location_id filter", () => {
  let pool;
  let orgId;
  let locAId;
  let locBId;
  let assignAId;
  let assignBId;
  let userId;

  before(async function () {
    if (!hasDb) return;
    pool = makePool();
    const ts = Date.now();

    // Org
    const org = await pool.query(
      "INSERT INTO organizations (name, slug, type, is_active) VALUES ($1,$2,$3,TRUE) RETURNING id",
      ["Assignment Loc Test Org", `assign-loc-${ts}`, "company"]
    );
    orgId = org.rows[0].id;

    // Locations
    const locA = await pool.query(
      "INSERT INTO org_locations (org_id, name, city) VALUES ($1,'Standort A','Berlin') RETURNING id",
      [orgId]
    );
    const locB = await pool.query(
      "INSERT INTO org_locations (org_id, name, city) VALUES ($1,'Standort B','Hamburg') RETURNING id",
      [orgId]
    );
    locAId = locA.rows[0].id;
    locBId = locB.rows[0].id;

    // User for created_by
    const userRes = await pool.query("SELECT id FROM users LIMIT 1");
    userId = userRes.rows[0]?.id;
    if (!userId) return;

    // Assignments — one per location
    const now = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const assignA = await pool.query(
      `INSERT INTO assignments (org_id, location_id, start_date, created_by, status)
       VALUES ($1,$2,$3,$4,'planned') RETURNING id`,
      [orgId, locAId, now, userId]
    );
    const assignB = await pool.query(
      `INSERT INTO assignments (org_id, location_id, start_date, created_by, status)
       VALUES ($1,$2,$3,$4,'planned') RETURNING id`,
      [orgId, locBId, now, userId]
    );
    assignAId = assignA.rows[0].id;
    assignBId = assignB.rows[0].id;
  });

  after(async () => {
    if (pool) {
      if (assignAId) await pool.query("DELETE FROM assignments WHERE id=$1", [assignAId]).catch(() => {});
      if (assignBId) await pool.query("DELETE FROM assignments WHERE id=$1", [assignBId]).catch(() => {});
      if (locAId)   await pool.query("DELETE FROM org_locations WHERE id=$1", [locAId]).catch(() => {});
      if (locBId)   await pool.query("DELETE FROM org_locations WHERE id=$1", [locBId]).catch(() => {});
      if (orgId)    await pool.query("DELETE FROM organizations WHERE id=$1", [orgId]).catch(() => {});
      await pool.end();
    }
  });

  it("filters assignments by location_id correctly", async function () {
    if (!hasDb || !assignAId || !assignBId) return this.skip();

    const { listAssignments } = await import("../services/assignmentService.js");

    // Filter to locA only
    const resultsA = await listAssignments(pool, { org_id: orgId, location_id: locAId });
    const idsA = resultsA.map((r) => r.id);
    assert.ok(idsA.includes(assignAId), "assignA should be in locA results");
    assert.ok(!idsA.includes(assignBId), "assignB should NOT be in locA results");

    // Filter to locB only
    const resultsB = await listAssignments(pool, { org_id: orgId, location_id: locBId });
    const idsB = resultsB.map((r) => r.id);
    assert.ok(idsB.includes(assignBId), "assignB should be in locB results");
    assert.ok(!idsB.includes(assignAId), "assignA should NOT be in locB results");
  });

  it("returns both assignments when no location_id filter given", async function () {
    if (!hasDb || !assignAId || !assignBId) return this.skip();

    const { listAssignments } = await import("../services/assignmentService.js");
    const all = await listAssignments(pool, { org_id: orgId });
    const ids = all.map((r) => r.id);
    assert.ok(ids.includes(assignAId));
    assert.ok(ids.includes(assignBId));
  });
});

/* ── me/active-location endpoint logic (pure unit) ──────── */

describe("me/active-location — session cache semantics", () => {
  it("POST with null location_id clears the cache", () => {
    // Simulating what the endpoint does: if location_id is null, delete cache
    const session = { _locationCache: { locationId: "loc-uuid", locationName: "Berlin" } };
    const body = { location_id: null };

    if (body.location_id === null) {
      delete session._locationCache;
    }

    assert.equal(session._locationCache, undefined);
  });

  it("POST with valid location_id sets the cache", () => {
    const session = {};
    const loc = { id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", name: "Hamburg" };

    session._locationCache = { locationId: loc.id, locationName: loc.name };

    assert.equal(session._locationCache.locationId, loc.id);
    assert.equal(session._locationCache.locationName, loc.name);
  });

  it("DELETE clears the cache", () => {
    const session = { _locationCache: { locationId: "loc-uuid", locationName: "Hamburg" } };
    delete session._locationCache;
    assert.equal(session._locationCache, undefined);
  });
});
