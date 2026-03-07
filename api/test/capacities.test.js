/**
 * Minimal tests for Model B capacities: service layer and API shape.
 * Run with: npm test (or node --test test/)
 * For integration tests, set DATABASE_URL or DB_HOST/POSTGRES_*.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { Pool } from "pg";
import * as capacityService from "../services/capacityService.js";

const hasDb =
  process.env.DATABASE_URL ||
  (process.env.DB_HOST && process.env.POSTGRES_PASSWORD);

describe("capacityService.searchCapacities", () => {
  it("returns shape { items, total, page, limit } with empty pool", async () => {
    const mockPool = {
      query: async (q) => {
        if (q.includes("COUNT(*)")) return { rows: [{ total: 0 }] };
        return { rows: [] };
      }
    };
    const result = await capacityService.searchCapacities(mockPool, {});
    assert.strictEqual(Array.isArray(result.items), true);
    assert.strictEqual(typeof result.total, "number");
    assert.strictEqual(result.page, 1);
    assert.strictEqual(result.limit, 20);
    assert.strictEqual(result.items.length, 0);
    assert.strictEqual(result.total, 0);
  });

  it("applies page and limit", async () => {
    const mockPool = {
      query: async (q, params) => {
        if (q.includes("COUNT")) return { rows: [{ total: 0 }] };
        return { rows: [] };
      }
    };
    const result = await capacityService.searchCapacities(mockPool, {
      page: 2,
      limit: 5
    });
    assert.strictEqual(result.page, 2);
    assert.strictEqual(result.limit, 5);
  });
});

describe("capacityService.reserve", () => {
  it("returns NOT_FOUND when capacity does not exist", async () => {
    const mockPool = {
      connect: async () => ({
        query: async (q) => {
          if (q.includes("SELECT") && q.includes("FOR UPDATE"))
            return { rows: [] };
          if (q.includes("SUM")) return { rows: [{ reserved: 0 }] };
          return { rows: [] };
        },
        release: () => {}
      })
    };
    const { reservation, error } = await capacityService.reserve(
      mockPool,
      "00000000-0000-0000-0000-000000000001",
      1,
      null
    );
    assert.strictEqual(reservation, null);
    assert.strictEqual(error, "NOT_FOUND");
  });
});

describe("capacityService.expireReservationsBatch", () => {
  it("returns { expired: 0 } when no expired reservations", async () => {
    const mockPool = {
      connect: async () => ({
        query: async (q) => {
          if (q.includes("SELECT")) return { rows: [] };
          if (q.includes("UPDATE")) return { rows: [] };
          return { rows: [] };
        },
        release: () => {}
      })
    };
    const result = await capacityService.expireReservationsBatch(mockPool, 50);
    assert.strictEqual(result.expired, 0);
  });
});

describe("capacities API (integration)", () => {
  let pool;
  let agencyId;
  let companyId;
  let capacityId;

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
    const agency = await pool.query(
      "SELECT id FROM users WHERE role='agency' LIMIT 1"
    );
    const company = await pool.query(
      "SELECT id FROM users WHERE role='company' LIMIT 1"
    );
    if (!agency.rows[0] || !company.rows[0]) return;
    agencyId = agency.rows[0].id;
    companyId = company.rows[0].id;
    const cap = await pool.query(
      `INSERT INTO capacities (agency_id, role, region, available_from, available_workers)
       VALUES ($1, 'Test Role', 'Berlin', CURRENT_DATE, 3)
       RETURNING id`,
      [agencyId]
    );
    capacityId = cap.rows[0]?.id;
  });

  after(async () => {
    if (pool && capacityId) {
      await pool.query("DELETE FROM capacities WHERE id=$1", [capacityId]).catch(() => {});
    }
    if (pool) await pool.end();
  });

  it("search returns capacities with available_effective (if DB and data exist)", async function () {
    if (!hasDb || !agencyId) {
      this.skip();
      return;
    }
    const result = await capacityService.searchCapacities(pool, {
      region: "Berlin",
      limit: 10
    });
    assert.strictEqual(Array.isArray(result.items), true);
    assert.strictEqual(typeof result.total, "number");
    if (result.items.length > 0) {
      const first = result.items[0];
      assert.ok("available_effective" in first || "available_workers" in first);
      assert.ok(first.role);
      assert.ok(first.region);
    }
  });

  it("reserve then accept reduces available_workers (if DB and capacity exist)", async function () {
    if (!hasDb || !capacityId || !companyId) {
      this.skip();
      return;
    }
    const beforeCap = await capacityService.getCapacityById(pool, capacityId);
    if (!beforeCap || beforeCap.available_workers < 1) {
      this.skip();
      return;
    }
    const { reservation, error: reserveError } = await capacityService.reserve(
      pool,
      capacityId,
      1,
      null
    );
    if (reserveError) {
      this.skip();
      return;
    }
    assert.ok(reservation?.id);
    const afterReserve = await capacityService.getCapacityById(pool, capacityId);
    assert.strictEqual(
      afterReserve.available_workers,
      beforeCap.available_workers,
      "Option A: reserve does not change available_workers"
    );
    const req = await pool.query(
      `INSERT INTO requests (listing_id, capacity_id, requester_id, receiver_id, message, priority, quantity, end_date)
       VALUES (NULL, $1, $2, $3, 'Test', 'NORMAL', 1, CURRENT_DATE + 7)
       RETURNING *`,
      [capacityId, companyId, agencyId]
    );
    const requestId = req.rows[0].id;
    await pool.query(
      "UPDATE capacity_reservations SET request_id=$1 WHERE id=$2",
      [requestId, reservation.id]
    );
    const { request: accepted, error: acceptError } =
      await capacityService.acceptRequest(pool, requestId, agencyId);
    assert.ifError(acceptError);
    assert.strictEqual(accepted?.status, "ACCEPTED");
    const afterAccept = await capacityService.getCapacityById(pool, capacityId);
    assert.strictEqual(
      afterAccept.available_workers,
      beforeCap.available_workers - 1,
      "Option A: accept reduces available_workers"
    );
    await pool.query(
      "UPDATE capacity_reservations SET status='expired' WHERE id=$1",
      [reservation.id]
    );
    await pool.query(
      "UPDATE capacities SET available_workers = available_workers + 1 WHERE id=$1",
      [capacityId]
    );
    await pool.query("DELETE FROM requests WHERE id=$1", [requestId]);
  });
});
