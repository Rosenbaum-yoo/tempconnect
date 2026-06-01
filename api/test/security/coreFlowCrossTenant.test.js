/**
 * Security Regression: Core Business Flow Cross-Tenant Isolation (P1.6)
 *
 * Verifies that timesheets, assignments, org audit-log, and requisitions
 * enforce org-boundary isolation — Org A users CANNOT access Org B resources.
 *
 * This supplements org-isolation.test.js (WAVE_03) with the five remaining
 * business-flow domains required for GATE 1 criterion G1.4 (Kernflow testbar).
 *
 * Attack classes tested:
 *   - IDOR via GET /:id on foreign-org resources
 *   - POST body injection: tampered org_id in creation payload
 *   - PATCH / transition on foreign-org resources
 *   - Audit-log cross-tenant read
 *
 * Notes on transport.js / withTransaction:
 *   The mock pool has no pool.connect() → withTransaction falls through to
 *   fn(pool) directly (line 38 of utils/transaction.js). Pool queries in
 *   service layer therefore use the mock's query() stub.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  mockReq, mockRes, noop,
  baseDeps, findHandlerExact,
  USER_A, ORG_A, ORG_B
} from "../helpers/security-mocks.js";

import { createTimesheetsRouter }    from "../../routes/timesheets.js";
import { createAssignmentsRouter }   from "../../routes/assignments.js";
import { createOrganizationsRouter } from "../../routes/organizations.js";
import { createRequisitionsRouter }  from "../../routes/requisitions.js";

// ── UUID constants for POST body schemas (Zod z.string().uuid()) ─────────────
// ORG_A / ORG_B from security-mocks are NOT UUIDs and would fail schema validation.
// These UUIDs are used exclusively in POST body fields that are Zod-validated.
const ORG_A_UUID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const ORG_B_UUID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const SUPP_UUID  = "cccccccc-cccc-4ccc-cccc-cccccccccccc";

// ── Pool + deps helpers ──────────────────────────────────────────────────────

/** Pool that returns the same row for every query. */
function poolWith(row) {
  return { query: async () => ({ rows: row ? [row] : [] }) };
}

/** Deps for timesheets router — getUserAndPlan required by the constructor. */
function timesheetDeps(pool) {
  return {
    ...baseDeps(pool),
    getUserAndPlan: async () => ({ plan: "PRO", id: USER_A })
  };
}

// ── Timesheets: GET /:id ─────────────────────────────────────────────────────

describe("CORE-ISO: timesheets — GET /:id org-boundary", () => {
  it("cross-tenant: Org A user blocked from Org B timesheet", async () => {
    const ts = { id: "ts-b-001", org_id: ORG_B, supplier_org_id: ORG_B, status: "draft" };
    const router = createTimesheetsRouter(timesheetDeps(poolWith(ts)));
    const handler = findHandlerExact(router, "get", "/timesheets/:id");

    const req = mockReq({ orgId: ORG_A, params: { id: "ts-b-001" } });
    const res = mockRes();
    await handler(req, res, noop);

    assert.equal(res._status, 403, "Must block cross-org timesheet read");
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("supplier perspective: Org A user allowed when supplier_org_id = ORG_A", async () => {
    // Timesheet belongs to ORG_B as buyer, ORG_A as supplier — supplier should see it
    const ts = { id: "ts-b-002", org_id: ORG_B, supplier_org_id: ORG_A, status: "draft", entries: [] };
    const router = createTimesheetsRouter(timesheetDeps(poolWith(ts)));
    const handler = findHandlerExact(router, "get", "/timesheets/:id");

    const req = mockReq({ orgId: ORG_A, params: { id: "ts-b-002" } });
    const res = mockRes();
    await handler(req, res, noop);

    // Supplier has a legitimate view — org-boundary guard must NOT fire
    assert.notEqual(res._status, 403, "Supplier org must not be blocked");
  });
});

// ── Timesheets: POST ─────────────────────────────────────────────────────────

describe("CORE-ISO: timesheets — POST org-boundary", () => {
  it("cross-tenant body: blocked when both org_id and supplier_org_id belong to other org", async () => {
    // User is ORG_A_UUID but tries to create a timesheet for ORG_B / SUPP
    const router = createTimesheetsRouter(timesheetDeps(poolWith(null)));
    const handler = findHandlerExact(router, "post", "/timesheets");

    const req = mockReq({
      orgId: ORG_A_UUID,
      body: {
        org_id:          ORG_B_UUID,
        supplier_org_id: SUPP_UUID,
        worker_name:     "Max Muster",
        week_start:      "2026-06-02",
        week_end:        "2026-06-08"
      }
    });
    const res = mockRes();
    await handler(req, res, noop);

    assert.equal(res._status, 403, "Must block when neither org_id nor supplier_org_id matches");
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("own-org as supplier: allowed when supplier_org_id = own orgId", async () => {
    // ORG_A is the supplier for a timesheet billed to ORG_B — this is the normal
    // agency-creates-timesheet-for-client flow and MUST be allowed.
    const created = {
      id:              "ts-new-001",
      org_id:          ORG_B_UUID,
      supplier_org_id: ORG_A_UUID,
      status:          "draft",
      worker_name:     "Max Muster",
      week_start:      "2026-06-02",
      week_end:        "2026-06-08",
      created_by:      USER_A,
      total_hours:     0,
      overtime_hours:  0
    };
    const router = createTimesheetsRouter(timesheetDeps(poolWith(created)));
    const handler = findHandlerExact(router, "post", "/timesheets");

    const req = mockReq({
      orgId: ORG_A_UUID,
      body: {
        org_id:          ORG_B_UUID,
        supplier_org_id: ORG_A_UUID,
        worker_name:     "Max Muster",
        week_start:      "2026-06-02",
        week_end:        "2026-06-08"
      }
    });
    const res = mockRes();
    await handler(req, res, noop);

    // Must NOT be blocked with an org-boundary error
    assert.notEqual(res._status, 403, "Supplier creating timesheet for buyer must not be blocked");
  });
});

// ── Assignments: GET /:id ────────────────────────────────────────────────────

describe("CORE-ISO: assignments — GET /:id org-boundary", () => {
  it("cross-tenant: Org A user blocked from Org B assignment", async () => {
    const asgn = { id: "asgn-b-001", org_id: ORG_B, supplier_org_id: ORG_B, status: "planned" };
    const router = createAssignmentsRouter(baseDeps(poolWith(asgn)));
    const handler = findHandlerExact(router, "get", "/assignments/:id");

    const req = mockReq({ orgId: ORG_A, params: { id: "asgn-b-001" } });
    const res = mockRes();
    await handler(req, res, noop);

    assert.equal(res._status, 403, "Must block cross-org assignment read");
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("supplier perspective: Org A user allowed when supplier_org_id = ORG_A", async () => {
    const asgn = { id: "asgn-b-002", org_id: ORG_B, supplier_org_id: ORG_A, status: "planned" };
    const router = createAssignmentsRouter(baseDeps(poolWith(asgn)));
    const handler = findHandlerExact(router, "get", "/assignments/:id");

    const req = mockReq({ orgId: ORG_A, params: { id: "asgn-b-002" } });
    const res = mockRes();
    await handler(req, res, noop);

    assert.notEqual(res._status, 403, "Supplier org must see assignment it staffs");
  });
});

// ── Assignments: PATCH /:id ──────────────────────────────────────────────────

describe("CORE-ISO: assignments — PATCH /:id org-boundary", () => {
  it("cross-tenant: Org A user blocked from updating Org B assignment", async () => {
    // PATCH only checks buyer org_id (not supplier_org_id) — stricter on write
    const asgn = { id: "asgn-b-003", org_id: ORG_B, supplier_org_id: ORG_B, status: "planned" };
    const router = createAssignmentsRouter(baseDeps(poolWith(asgn)));
    const handler = findHandlerExact(router, "patch", "/assignments/:id");

    const req = mockReq({
      orgId:  ORG_A,
      params: { id: "asgn-b-003" },
      body:   { notes: "tampered notes" }  // valid partial payload
    });
    const res = mockRes();
    await handler(req, res, noop);

    assert.equal(res._status, 403, "Must block cross-org assignment update");
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });
});

// ── Assignments: POST /:id/transition ────────────────────────────────────────

describe("CORE-ISO: assignments — POST /:id/transition org-boundary", () => {
  it("cross-tenant: Org A user blocked from transitioning Org B assignment", async () => {
    const asgn = { id: "asgn-b-004", org_id: ORG_B, supplier_org_id: ORG_B, status: "planned" };
    const router = createAssignmentsRouter(baseDeps(poolWith(asgn)));
    const handler = findHandlerExact(router, "post", "/assignments/:id/transition");

    const req = mockReq({
      orgId:  ORG_A,
      params: { id: "asgn-b-004" },
      body:   { status: "active" }  // valid transition payload
    });
    const res = mockRes();
    await handler(req, res, noop);

    assert.equal(res._status, 403, "Must block cross-org assignment state transition");
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });
});

// ── Org Audit-Log ────────────────────────────────────────────────────────────

describe("CORE-ISO: organizations — GET /:id/audit-log org-boundary", () => {
  it("cross-tenant: Org A user blocked from reading Org B audit-log", async () => {
    const router = createOrganizationsRouter(baseDeps());
    const handler = findHandlerExact(router, "get", "/organizations/:id/audit-log");

    // User belongs to ORG_A but requests audit-log for ORG_B
    const req = mockReq({ orgId: ORG_A, params: { id: ORG_B } });
    const res = mockRes();
    await handler(req, res, noop);

    assert.equal(res._status, 403, "Must block cross-org audit-log access");
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("own-org: Org A user can access own audit-log", async () => {
    const auditEntry = { id: "audit-1", action: "assignment.create", created_at: "2026-06-02T10:00:00Z" };
    const router = createOrganizationsRouter(baseDeps(poolWith(auditEntry)));
    const handler = findHandlerExact(router, "get", "/organizations/:id/audit-log");

    const req = mockReq({ orgId: ORG_A, params: { id: ORG_A } });
    const res = mockRes();
    await handler(req, res, noop);

    // Own org → must not be blocked (200 or whatever the service returns)
    assert.notEqual(res._status, 403, "Must allow own-org audit-log read");
  });
});

// ── Requisitions: GET /:id ───────────────────────────────────────────────────

describe("CORE-ISO: requisitions — GET /:id org-boundary", () => {
  it("cross-tenant: Org A user blocked from reading Org B requisition", async () => {
    const req_resource = { id: "req-b-001", org_id: ORG_B, title: "Developer", role: "dev" };
    // createRequisitionsRouter uses deps.getUserAndPlan in POST only — safe to pass stub
    const router = createRequisitionsRouter({
      ...baseDeps(poolWith(req_resource)),
      getUserAndPlan: async () => ({ plan: "PRO" })
    });
    const handler = findHandlerExact(router, "get", "/requisitions/:id");

    const req = mockReq({ orgId: ORG_A, params: { id: "req-b-001" } });
    const res = mockRes();
    await handler(req, res, noop);

    assert.equal(res._status, 403, "Must block cross-org requisition read");
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("unscoped requisition (org_id = null): not blocked by org-boundary guard", async () => {
    // Some requisitions have no org_id (e.g. public marketplace slots) — guard must not fire
    const req_resource = { id: "req-open-001", org_id: null, title: "Open Role", role: "consultant" };
    const router = createRequisitionsRouter({
      ...baseDeps(poolWith(req_resource)),
      getUserAndPlan: async () => ({ plan: "PRO" })
    });
    const handler = findHandlerExact(router, "get", "/requisitions/:id");

    const req = mockReq({ orgId: ORG_A, params: { id: "req-open-001" } });
    const res = mockRes();
    await handler(req, res, noop);

    // Guard: `if (req.orgId && requisition.org_id && ...)` — org_id is null → guard inactive
    assert.notEqual(res._status, 403, "Unscoped requisitions must not be blocked by org-boundary");
  });
});

// ── Contracts: GET /:id + PATCH /:id ────────────────────────────────────────
//
// contracts.js wraps all handlers with catchAsync(), which does NOT return a
// Promise from the middleware itself:
//   catchAsync(fn) → (req, res, next) => { Promise.resolve(fn(...)).catch(next) }
// The returned wrapper is synchronous — `await handler(req, res, noop)` returns
// before the inner async fn has run. We need an awaitable response instead.

import { createContractsRouter } from "../../routes/contracts.js";

/**
 * Creates an awaitable response mock. Use when the handler is wrapped in
 * catchAsync (which returns undefined, not a Promise).
 * Resolves with the response object once res.json() or res.send() is called.
 */
function awaitableRes() {
  let resolve, reject;
  const done = new Promise((res, rej) => { resolve = res; reject = rej; });
  const res = {
    _status: 200,
    _json:   null,
    locals:  {},
    status(c) { this._status = c; return this; },
    json(d)   { this._json = d;   resolve(this); return this; },
    send(d)   { this._json = d;   resolve(this); return this; },
    setHeader() { return this; },
    _done: done
  };
  return res;
}

/** Invoke a catchAsync-wrapped handler and wait for the response. */
async function run(handler, req) {
  const res = awaitableRes();
  handler(req, res, (err) => { if (err) throw err; });
  return res._done;
}

describe("CORE-ISO: contracts — GET /:id org-boundary", () => {
  it("cross-tenant: Org A user blocked from reading Org B contract", async () => {
    const contract = { id: "ctr-b-001", buyer_org_id: ORG_B, supplier_org_id: ORG_B, status: "active" };
    const router = createContractsRouter(baseDeps(poolWith(contract)));
    const handler = findHandlerExact(router, "get", "/contracts/:id");

    const req = mockReq({ orgId: ORG_A, params: { id: "ctr-b-001" } });
    const res = await run(handler, req);

    assert.equal(res._status, 403, "Must block cross-org contract read");
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("supplier perspective: Org A user allowed when supplier_org_id = ORG_A", async () => {
    const contract = { id: "ctr-b-002", buyer_org_id: ORG_B, supplier_org_id: ORG_A, status: "active" };
    const router = createContractsRouter(baseDeps(poolWith(contract)));
    const handler = findHandlerExact(router, "get", "/contracts/:id");

    const req = mockReq({ orgId: ORG_A, params: { id: "ctr-b-002" } });
    const res = await run(handler, req);

    assert.notEqual(res._status, 403, "Supplier org must see contract it is party to");
  });
});

describe("CORE-ISO: contracts — PATCH /:id org-boundary (buyer-only write)", () => {
  it("cross-tenant: Org A user blocked from updating Org B contract", async () => {
    const contract = { id: "ctr-b-003", buyer_org_id: ORG_B, supplier_org_id: ORG_B, status: "draft" };
    const router = createContractsRouter(baseDeps(poolWith(contract)));
    const handler = findHandlerExact(router, "patch", "/contracts/:id");

    const req = mockReq({ orgId: ORG_A, params: { id: "ctr-b-003" }, body: { title: "tampered" } });
    const res = await run(handler, req);

    assert.equal(res._status, 403, "Must block cross-org contract update");
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("supplier cannot update (buyer-only): Org A as supplier blocked from PATCH", async () => {
    // PATCH only checks buyer_org_id — being supplier does NOT grant write access
    const contract = { id: "ctr-b-004", buyer_org_id: ORG_B, supplier_org_id: ORG_A, status: "draft" };
    const router = createContractsRouter(baseDeps(poolWith(contract)));
    const handler = findHandlerExact(router, "patch", "/contracts/:id");

    const req = mockReq({ orgId: ORG_A, params: { id: "ctr-b-004" }, body: { title: "tampered" } });
    const res = await run(handler, req);

    // buyer_org_id = ORG_B ≠ ORG_A → 403 even for supplier
    assert.equal(res._status, 403, "Supplier cannot PATCH contract — write is buyer-only");
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });
});

// ── Rate Cards: GET /:id + PATCH /:id ────────────────────────────────────────
// Rate cards use org_id (single owner field, always company-owned).
// Error code was PERMISSION_DENIED (bug) — fixed to ORG_BOUNDARY_VIOLATION in rateCards.js.

import { createRateCardsRouter } from "../../routes/rateCards.js";

describe("CORE-ISO: rateCards — GET /:id org-boundary", () => {
  it("cross-tenant: Org A user blocked from reading Org B rate card", async () => {
    const card = { id: "rc-b-001", org_id: ORG_B, role_category: "IT", status: "active" };
    // requireOrgFeature + ensureCompanyRateCardAccess are bypassed by findHandlerExact
    const router = createRateCardsRouter(baseDeps(poolWith(card)));
    const handler = findHandlerExact(router, "get", "/rate-cards/:id");

    const req = mockReq({ orgId: ORG_A, params: { id: "rc-b-001" } });
    const res = mockRes();
    await handler(req, res, noop);

    assert.equal(res._status, 403, "Must block cross-org rate card read");
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION",
      "Error code must be ORG_BOUNDARY_VIOLATION — was PERMISSION_DENIED before fix");
  });

  it("own-org: Org A user can read own rate card", async () => {
    const card = { id: "rc-a-001", org_id: ORG_A, role_category: "IT", status: "active" };
    const router = createRateCardsRouter(baseDeps(poolWith(card)));
    const handler = findHandlerExact(router, "get", "/rate-cards/:id");

    const req = mockReq({ orgId: ORG_A, params: { id: "rc-a-001" } });
    const res = mockRes();
    await handler(req, res, noop);

    assert.notEqual(res._status, 403, "Own org rate card must be accessible");
  });
});

describe("CORE-ISO: rateCards — PATCH /:id org-boundary", () => {
  it("cross-tenant: Org A user blocked from updating Org B rate card", async () => {
    const card = { id: "rc-b-002", org_id: ORG_B, role_category: "IT", status: "draft" };
    const router = createRateCardsRouter(baseDeps(poolWith(card)));
    const handler = findHandlerExact(router, "patch", "/rate-cards/:id");

    const req = mockReq({
      orgId:  ORG_A,
      params: { id: "rc-b-002" },
      body:   { target_rate_cents: 5000 }
    });
    const res = mockRes();
    await handler(req, res, noop);

    assert.equal(res._status, 403, "Must block cross-org rate card update");
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });
});
