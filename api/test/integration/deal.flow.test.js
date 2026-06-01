/**
 * Deal Flow End-to-End Integration Test
 *
 * Tests the core marketplace deal chain against a real database:
 *
 *   1. Agency registers + creates a supply listing
 *   2. Company registers + sends a request on that listing
 *   3. Agency accepts the request → status SENT → ACCEPTED
 *   4. Verify: persisted status, both parties can read the deal
 *   5. Company finalizes the request → status ACCEPTED → FINALIZED
 *   6. Verify: terminal state persisted, re-accept is rejected (409)
 *
 * This is the revenue-critical marketplace flow:
 *   Supply → Demand → Request → Accept → Finalize
 *
 * Requires: DATABASE_URL (or DB_HOST + POSTGRES_PASSWORD)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  hasDb,
  registerAndLogin,
  registerAndLoginAgency,
  createPool,
  cleanupUser,
  getCsrf
} from "./helpers.js";

describe("Deal Flow E2E", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  const createdEmails = [];

  // Actors
  let agency, company;

  // Entities created during the flow
  let listingId, requestId;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();

    // Register both marketplace participants with BASIS plan (FREE has 0 limits)
    agency = await registerAndLoginAgency({ company_name: "E2E Personaldienstleister GmbH", plan: "BASIS" });
    createdEmails.push(agency.email);

    company = await registerAndLogin({ role: "company", company_name: "E2E Industriekunde AG", plan: "BASIS" });
    createdEmails.push(company.email);
  });

  after(async () => {
    if (!pool) return;
    // Clean up in reverse dependency order
    if (requestId) {
      await pool.query("DELETE FROM audit_log WHERE request_id = $1", [requestId]).catch(() => {});
      await pool.query("DELETE FROM capacity_reservations WHERE request_id = $1", [requestId]).catch(() => {});
      await pool.query("DELETE FROM requests WHERE id = $1", [requestId]).catch(() => {});
    }
    if (listingId) {
      await pool.query("DELETE FROM listings WHERE id = $1", [listingId]).catch(() => {});
    }
    for (const email of createdEmails) {
      await cleanupUser(pool, email);
    }
    await pool.end();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 1: Agency creates a supply listing
  // ═══════════════════════════════════════════════════════════════════════════

  it("Step 1: Agency creates a supply listing", async () => {
    const res = await agency.agent
      .post("/api/listings")
      .set("x-csrf-token", agency.csrfToken)
      .send({
        category: "Fachkraft Lager",
        region: "München",
        qty: 5,
        description: "Erfahrene Lagerhelfer, sofort verfügbar"
      });

    assert.ok(
      [200, 201].includes(res.status),
      `Expected 200/201, got ${res.status}: ${JSON.stringify(res.body)}`
    );
    assert.ok(res.body.id, "Listing must have an ID");
    assert.strictEqual(res.body.type, "supply", "Agency listings are type=supply");
    assert.strictEqual(res.body.is_active, true);
    listingId = res.body.id;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 2: Company sends a request on the listing
  // ═══════════════════════════════════════════════════════════════════════════

  it("Step 2: Company sends a request on the agency listing", async () => {
    assert.ok(listingId, "Listing must exist from Step 1");

    const res = await company.agent
      .post("/api/requests")
      .set("x-csrf-token", company.csrfToken)
      .send({
        listing_id: listingId,
        message: "Wir benötigen 3 Lagerhelfer ab sofort.",
        priority: "NORMAL"
      });

    assert.ok(
      [200, 201].includes(res.status),
      `Expected 200/201, got ${res.status}: ${JSON.stringify(res.body)}`
    );
    assert.ok(res.body.id, "Request must have an ID");
    assert.strictEqual(res.body.listing_id, listingId, "Request must reference the listing");
    requestId = res.body.id;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 3: Verify initial state — request is SENT
  // ═══════════════════════════════════════════════════════════════════════════

  it("Step 3: Request starts in SENT status", async () => {
    assert.ok(requestId, "Request must exist from Step 2");

    // Company sees the request in their sent list
    const sentRes = await company.agent.get("/api/my/requests/sent");
    assert.strictEqual(sentRes.status, 200);
    const sentRequest = sentRes.body.find(r => r.id === requestId);
    assert.ok(sentRequest, "Company should see the request in sent list");
    assert.strictEqual(sentRequest.status, "SENT", "Initial status must be SENT");

    // Agency sees the request in their received list
    const receivedRes = await agency.agent.get("/api/my/requests/received");
    assert.strictEqual(receivedRes.status, 200);
    const receivedRequest = receivedRes.body.find(r => r.id === requestId);
    assert.ok(receivedRequest, "Agency should see the request in received list");
    assert.strictEqual(receivedRequest.status, "SENT");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 4: Agency accepts the request → SENT → ACCEPTED
  // ═══════════════════════════════════════════════════════════════════════════

  it("Step 4: Agency accepts the request → ACCEPTED", async () => {
    assert.ok(requestId, "Request must exist");

    // Refresh CSRF token for the agency (may have rotated)
    const csrfToken = await getCsrf(agency.agent);

    const res = await agency.agent
      .patch(`/api/requests/${requestId}/status`)
      .set("x-csrf-token", csrfToken)
      .send({
        status: "ACCEPTED",
        contact_email: "vermittlung@e2e-personal.de",
        contact_phone: "+49 89 12345678"
      });

    assert.ok(
      [200, 201].includes(res.status),
      `Expected 200 on accept, got ${res.status}: ${JSON.stringify(res.body)}`
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 5: Verify persisted ACCEPTED state
  // ═══════════════════════════════════════════════════════════════════════════

  it("Step 5: Both parties see ACCEPTED status via API", async () => {
    assert.ok(requestId, "Request must exist");

    // Company reads the accepted request
    const companyRes = await company.agent.get(`/api/requests/${requestId}`);
    assert.strictEqual(companyRes.status, 200);
    assert.strictEqual(companyRes.body.status, "ACCEPTED", "Company must see ACCEPTED");

    // Agency reads the accepted request
    const agencyRes = await agency.agent.get(`/api/requests/${requestId}`);
    assert.strictEqual(agencyRes.status, 200);
    assert.strictEqual(agencyRes.body.status, "ACCEPTED", "Agency must see ACCEPTED");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 6: Company finalizes → ACCEPTED → FINALIZED
  // ═══════════════════════════════════════════════════════════════════════════

  it("Step 6: Company finalizes the deal → FINALIZED", async () => {
    assert.ok(requestId, "Request must exist");

    const csrfToken = await getCsrf(company.agent);

    const res = await company.agent
      .patch(`/api/requests/${requestId}/status`)
      .set("x-csrf-token", csrfToken)
      .send({ status: "FINALIZED" });

    assert.ok(
      [200, 201].includes(res.status),
      `Expected 200 on finalize, got ${res.status}: ${JSON.stringify(res.body)}`
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 7: Terminal state verification
  // ═══════════════════════════════════════════════════════════════════════════

  it("Step 7: FINALIZED status is persisted in the database", async () => {
    assert.ok(requestId, "Request must exist");

    // Read directly from DB to verify persistence (not just API cache)
    const { rows } = await pool.query(
      "SELECT status FROM requests WHERE id = $1",
      [requestId]
    );
    assert.strictEqual(rows.length, 1, "Request must exist in DB");
    assert.strictEqual(rows[0].status, "FINALIZED", "DB must reflect FINALIZED");
  });

  it("Step 8: Re-accepting a FINALIZED request is rejected (409)", async () => {
    assert.ok(requestId, "Request must exist");

    const csrfToken = await getCsrf(agency.agent);

    const res = await agency.agent
      .patch(`/api/requests/${requestId}/status`)
      .set("x-csrf-token", csrfToken)
      .send({ status: "ACCEPTED" });

    assert.strictEqual(
      res.status, 409,
      `Terminal state must reject transition, got ${res.status}: ${JSON.stringify(res.body)}`
    );
    assert.strictEqual(res.body.error, "invalid_transition");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Authorization guard: third party cannot read the deal
  // ═══════════════════════════════════════════════════════════════════════════

  it("Step 9: Uninvolved user cannot read the deal (403)", async () => {
    assert.ok(requestId, "Request must exist");

    const outsider = await registerAndLogin({ company_name: "Outsider Corp" });
    createdEmails.push(outsider.email);

    const res = await outsider.agent.get(`/api/requests/${requestId}`);
    assert.strictEqual(res.status, 403, "Outsider must be blocked from reading the deal");
  });
});
