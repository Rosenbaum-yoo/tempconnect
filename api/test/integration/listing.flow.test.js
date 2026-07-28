/**
 * Listing Flow Integration Tests
 *
 * Covers:
 *  - POST /api/listings: company creates demand, agency creates supply
 *  - POST /api/listings: Zod validation rejects invalid payloads
 *  - GET /api/listings: search returns active listings
 *  - GET /api/listings: filter by type / category
 *  - GET /api/my/listings: returns only own listings
 *  - PUT /api/listings/:id: owner can update, non-owner gets 404
 *  - DELETE /api/listings/:id: soft-delete sets is_active=false
 *  - Unauthenticated access → 401
 *
 * Requires: DATABASE_URL (or DB_HOST + POSTGRES_PASSWORD)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  hasDb,
  makeAgent,
  getCsrf,
  registerAndLoginWithPlan,
  createPool,
  cleanupUser
} from "./helpers.js";

// Warum BASIS und nicht PRO: `/api/listings` liegt hinter `requireFeature("legacy_access")`,
// das nur DEMO und BASIS haben — DEMO wiederum hat `listings: 0` und antwortet mit
// 429 PLAN_LIMIT_REACHED. BASIS ist damit der einzige Plan, der beides mitbringt:
// Zugang zur Legacy-Strecke und ein Kontingent (5) fuer echte Inserate. Diese Tests
// pruefen den CRUD-Fluss, nicht die Bezahlschranke — die hat ihre eigenen Tests.
const LISTING_PLAN = "BASIS";

describe("Listing Flow", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  const createdEmails = [];

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
  });

  after(async () => {
    for (const email of createdEmails) {
      await cleanupUser(pool, email);
    }
    await pool?.end();
  });

  // ── Helper: valid listing payload ────────────────────────────────────────
  const validListing = (overrides = {}) => ({
    category: "Fachkraft Lager",
    region: "Berlin",
    qty: 3,
    ...overrides
  });

  // ── Create ──────────────────────────────────────────────────────────────

  it("company user creates a demand listing", async () => {
    const { agent, csrfToken, email } = await registerAndLoginWithPlan(pool, LISTING_PLAN, { role: "company" });
    createdEmails.push(email);

    const res = await agent
      .post("/api/listings")
      .set("x-csrf-token", csrfToken)
      .send(validListing());

    assert.ok([200, 201].includes(res.status), `Expected 200/201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.type, "demand", "Company listings should be type=demand");
    assert.strictEqual(res.body.category, "Fachkraft Lager");
    assert.strictEqual(res.body.region, "Berlin");
    assert.strictEqual(res.body.qty, 3);
    assert.ok(res.body.id, "Listing should have an ID");
  });

  it("agency user creates a supply listing", async () => {
    const { agent, csrfToken, email } = await registerAndLoginWithPlan(pool, LISTING_PLAN, { role: "agency", company_name: "Test Agency GmbH" });
    createdEmails.push(email);

    const res = await agent
      .post("/api/listings")
      .set("x-csrf-token", csrfToken)
      .send(validListing({ category: "Helfer Montage", region: "Hamburg" }));

    assert.ok([200, 201].includes(res.status), `Expected 200/201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.type, "supply", "Agency listings should be type=supply");
    assert.strictEqual(res.body.category, "Helfer Montage");
    assert.strictEqual(res.body.region, "Hamburg");
  });

  // ── Validation ──────────────────────────────────────────────────────────

  it("rejects listing without required category field", async () => {
    const { agent, csrfToken, email } = await registerAndLoginWithPlan(pool, LISTING_PLAN);
    createdEmails.push(email);

    const res = await agent
      .post("/api/listings")
      .set("x-csrf-token", csrfToken)
      .send({ region: "Berlin", qty: 1 }); // missing category

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, "VALIDATION");
    assert.ok(Array.isArray(res.body.details), "Should include validation details");
  });

  it("rejects listing with qty=0", async () => {
    const { agent, csrfToken, email } = await registerAndLoginWithPlan(pool, LISTING_PLAN);
    createdEmails.push(email);

    const res = await agent
      .post("/api/listings")
      .set("x-csrf-token", csrfToken)
      .send(validListing({ qty: 0 }));

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, "VALIDATION");
  });

  it("rejects listing with category exceeding max length", async () => {
    const { agent, csrfToken, email } = await registerAndLoginWithPlan(pool, LISTING_PLAN);
    createdEmails.push(email);

    const res = await agent
      .post("/api/listings")
      .set("x-csrf-token", csrfToken)
      .send(validListing({ category: "X".repeat(121) }));

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, "VALIDATION");
  });

  // ── Search / GET ────────────────────────────────────────────────────────

  it("GET /api/listings returns array of active listings", async () => {
    const { agent, csrfToken, email } = await registerAndLoginWithPlan(pool, LISTING_PLAN);
    createdEmails.push(email);

    // Create a listing first so the result set is non-empty
    await agent
      .post("/api/listings")
      .set("x-csrf-token", csrfToken)
      .send(validListing());

    const res = await agent.get("/api/listings");

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body), "Response should be an array");
    assert.ok(res.body.length > 0, "Should contain at least one listing");
    // All returned listings must be active (soft-delete filtered out)
    for (const l of res.body) {
      assert.strictEqual(l.is_active, true, "Search should only return active listings");
    }
  });

  it("GET /api/listings filters by type=demand", async () => {
    const { agent, csrfToken, email } = await registerAndLoginWithPlan(pool, LISTING_PLAN, { role: "company" });
    createdEmails.push(email);

    await agent
      .post("/api/listings")
      .set("x-csrf-token", csrfToken)
      .send(validListing());

    const res = await agent.get("/api/listings?type=demand");

    assert.strictEqual(res.status, 200);
    for (const l of res.body) {
      assert.strictEqual(l.type, "demand", "Filter type=demand should only return demand listings");
    }
  });

  // ── My listings ─────────────────────────────────────────────────────────

  it("GET /api/my/listings returns only own listings", async () => {
    const { agent, csrfToken, email, user } = await registerAndLoginWithPlan(pool, LISTING_PLAN);
    createdEmails.push(email);

    // Create two listings
    await agent
      .post("/api/listings")
      .set("x-csrf-token", csrfToken)
      .send(validListing({ category: "Unique-A" }));
    await agent
      .post("/api/listings")
      .set("x-csrf-token", csrfToken)
      .send(validListing({ category: "Unique-B" }));

    const res = await agent.get("/api/my/listings");

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 2, "Should return at least the 2 created listings");
    // All listings must belong to this user
    for (const l of res.body) {
      assert.strictEqual(l.owner_id, user.id, "my/listings must only return own listings");
    }
  });

  // ── Update ──────────────────────────────────────────────────────────────

  it("PUT /api/listings/:id updates own listing", async () => {
    const { agent, csrfToken, email } = await registerAndLoginWithPlan(pool, LISTING_PLAN);
    createdEmails.push(email);

    const createRes = await agent
      .post("/api/listings")
      .set("x-csrf-token", csrfToken)
      .send(validListing());
    const listingId = createRes.body.id;

    const updated = validListing({ category: "Updated Category", qty: 7 });
    const res = await agent
      .put(`/api/listings/${listingId}`)
      .set("x-csrf-token", csrfToken)
      .send(updated);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.category, "Updated Category");
    assert.strictEqual(res.body.qty, 7);
  });

  it("PUT /api/listings/:id returns 404 for non-owner", async () => {
    // User A creates a listing
    const userA = await registerAndLoginWithPlan(pool, LISTING_PLAN);
    createdEmails.push(userA.email);

    const createRes = await userA.agent
      .post("/api/listings")
      .set("x-csrf-token", userA.csrfToken)
      .send(validListing());
    const listingId = createRes.body.id;

    // User B tries to update it
    const userB = await registerAndLoginWithPlan(pool, LISTING_PLAN);
    createdEmails.push(userB.email);

    const res = await userB.agent
      .put(`/api/listings/${listingId}`)
      .set("x-csrf-token", userB.csrfToken)
      .send(validListing({ category: "Hijacked" }));

    assert.strictEqual(res.status, 404, "Non-owner should get 404 (ownership filter)");
    assert.strictEqual(res.body.error, "NOT_FOUND");
  });

  // ── Delete (soft) ───────────────────────────────────────────────────────

  it("DELETE /api/listings/:id soft-deletes own listing", async () => {
    const { agent, csrfToken, email } = await registerAndLoginWithPlan(pool, LISTING_PLAN);
    createdEmails.push(email);

    const createRes = await agent
      .post("/api/listings")
      .set("x-csrf-token", csrfToken)
      .send(validListing());
    const listingId = createRes.body.id;

    const delRes = await agent
      .delete(`/api/listings/${listingId}`)
      .set("x-csrf-token", csrfToken);

    assert.strictEqual(delRes.status, 200);
    assert.strictEqual(delRes.body.ok, true);

    // Verify: listing no longer appears in my listings (soft-deleted)
    const myRes = await agent.get("/api/my/listings");
    const stillThere = myRes.body.find((l) => l.id === listingId);
    assert.strictEqual(stillThere, undefined, "Soft-deleted listing should not appear in my/listings");
  });

  it("DELETE /api/listings/:id returns 404 for non-owner", async () => {
    const userA = await registerAndLoginWithPlan(pool, LISTING_PLAN);
    createdEmails.push(userA.email);

    const createRes = await userA.agent
      .post("/api/listings")
      .set("x-csrf-token", userA.csrfToken)
      .send(validListing());
    const listingId = createRes.body.id;

    const userB = await registerAndLoginWithPlan(pool, LISTING_PLAN);
    createdEmails.push(userB.email);

    const res = await userB.agent
      .delete(`/api/listings/${listingId}`)
      .set("x-csrf-token", userB.csrfToken);

    assert.strictEqual(res.status, 404, "Non-owner delete should return 404");
  });

  // ── Auth enforcement ────────────────────────────────────────────────────

  it("unauthenticated GET /api/listings returns 401", async () => {
    const agent = await makeAgent();
    const res = await agent.get("/api/listings");
    assert.strictEqual(res.status, 401);
  });

  it("unauthenticated POST /api/listings returns 401 or 403", async () => {
    const agent = await makeAgent();
    const csrf = await getCsrf(agent);
    const res = await agent
      .post("/api/listings")
      .set("x-csrf-token", csrf)
      .send(validListing());
    // 401 (not authenticated) or 403 (CSRF/feature gate) are both acceptable
    assert.ok([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`);
  });
});
