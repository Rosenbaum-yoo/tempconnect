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
import { createWorkersRouter }       from "../../routes/workers.js";
import { createSuppliersRouter }     from "../../routes/suppliers.js";
import { createAgencyPortalRouter }  from "../../routes/agencyPortal.js";
import * as templateSvc              from "../../services/timesheetTemplateService.js";
import * as emergencyCommitmentService from "../../services/emergencyCommitmentService.js";
import * as dealAgreementService     from "../../services/dealAgreementService.js";
import * as capacityExchangeService  from "../../services/capacityExchangeService.js";

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

// ── Requisition candidates: cross-org write (IDOR-Fix 2026-06-13) ─────────────
// Regression fuer die im Cross-Org-Audit gefundenen Luecken: POST .../candidates und
// PATCH .../candidates/:candId hatten kein assertOrgOwnership -> fremde Org konnte
// Kandidaten an/in fremden Requisitions schreiben. Jetzt org-geprueft.

function reqCandRouter(reqRow) {
  return createRequisitionsRouter({
    ...baseDeps(poolWith(reqRow)),
    getUserAndPlan: async () => ({ plan: "PRO" })
  });
}

describe("CORE-ISO: requisition candidates — POST org-boundary", () => {
  it("cross-tenant: Org A blocked from adding candidate to Org B requisition", async () => {
    const router = reqCandRouter({ id: "req-b-001", org_id: ORG_B });
    const handler = findHandlerExact(router, "post", "/requisitions/:id/candidates");
    const req = mockReq({ orgId: ORG_A, params: { id: "req-b-001" }, body: {}, session: { userId: USER_A } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.equal(res._status, 403, "Must block cross-org candidate add");
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("own-org: adding candidate to own requisition is not org-blocked", async () => {
    const router = reqCandRouter({ id: "req-a-001", org_id: ORG_A });
    const handler = findHandlerExact(router, "post", "/requisitions/:id/candidates");
    const req = mockReq({ orgId: ORG_A, params: { id: "req-a-001" }, body: {}, session: { userId: USER_A } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.notEqual(res._status, 403, "Own-org candidate add must not be blocked");
  });
});

describe("CORE-ISO: requisition candidates — PATCH status org-boundary", () => {
  it("cross-tenant: Org A blocked from changing Org B candidate status", async () => {
    const router = reqCandRouter({ id: "req-b-001", org_id: ORG_B });
    const handler = findHandlerExact(router, "patch", "/requisitions/:reqId/candidates/:candId");
    const req = mockReq({ orgId: ORG_A, params: { reqId: "req-b-001", candId: "cand-b-001" }, body: { status: "shortlisted" }, session: { userId: USER_A } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.equal(res._status, 403, "Must block cross-org candidate status change");
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("own-org: changing own candidate status is not org-blocked", async () => {
    const router = reqCandRouter({ id: "req-a-001", org_id: ORG_A, requisition_id: "req-a-001", status: "shortlisted" });
    const handler = findHandlerExact(router, "patch", "/requisitions/:reqId/candidates/:candId");
    const req = mockReq({ orgId: ORG_A, params: { reqId: "req-a-001", candId: "cand-a-001" }, body: { status: "shortlisted" }, session: { userId: USER_A } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.notEqual(res._status, 403, "Own-org candidate status change must not be blocked");
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

// ── Workers: by-id mutations org-boundary (P2.5 Coverage-Welle 1, 2026-06-13) ──
// Hoechstes Risiko (PII/Personalverwaltung): jeder by-id Worker-Mutations-Handler laedt
// das Profil (workerService.getWorkerProfile) und 403t bei supplier_org_id !== req.orgId.
// Enforcement war vorhanden, aber ungetestet (Cross-Org-Audit 2026-06-13) — hier abgesichert.

function workersRouter(workerRow) {
  return createWorkersRouter({
    ...baseDeps(poolWith(workerRow)),
    getUserAndPlan: async () => ({ plan: "PRO" })
  });
}
const WORKER_B = { user_id: "wkr-b-001", supplier_org_id: ORG_B, profile_public: false };
const WORKER_A = { user_id: "wkr-a-001", supplier_org_id: ORG_A, profile_public: false };

describe("CORE-ISO: workers — by-id mutations org-boundary", () => {
  const crossCases = [
    ["patch", "/workers/:userId"],
    ["post", "/workers/:userId/deactivate"],
    ["post", "/workers/:userId/activate"]
  ];
  for (const [method, path] of crossCases) {
    it(`cross-tenant: ${method.toUpperCase()} ${path} blocked for foreign org`, async () => {
      const handler = findHandlerExact(workersRouter(WORKER_B), method, path);
      const req = mockReq({ orgId: ORG_A, params: { userId: "wkr-b-001" }, body: {}, session: { userId: USER_A } });
      const res = mockRes();
      await handler(req, res, noop);
      assert.equal(res._status, 403, `Must block cross-org ${path}`);
      assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
    });
  }

  for (const [method, path] of [["patch", "/workers/:userId"], ["post", "/workers/:userId/deactivate"]]) {
    it(`own-org: ${method.toUpperCase()} ${path} not org-blocked`, async () => {
      const handler = findHandlerExact(workersRouter(WORKER_A), method, path);
      const req = mockReq({ orgId: ORG_A, params: { userId: "wkr-a-001" }, body: {}, session: { userId: USER_A } });
      const res = mockRes();
      await handler(req, res, noop);
      assert.notEqual(res._status, 403, `Own-org ${path} must not be org-blocked`);
    });
  }
});

// ── Suppliers/VMS: vendor-pool mutations org-boundary (P2.5 Coverage-Welle 2) ──
// requireOwnedVendorEntry laedt den Eintrag (vendorPoolService.getEntry) und 403t bei
// client_org_id !== req.orgId. Deckt approve/suspend/block/categorize/tier + notes ab.

function suppliersRouter(entryRow) {
  return createSuppliersRouter(baseDeps(poolWith(entryRow)));
}
const ENTRY_B = { id: "vp-b-001", client_org_id: ORG_B, supplier_org_id: "supp-x", category: "x", notes: "n" };
const ENTRY_A = { id: "vp-a-001", client_org_id: ORG_A, supplier_org_id: "supp-y", category: "x", notes: "n" };

describe("CORE-ISO: suppliers — vendor-pool mutations org-boundary", () => {
  const idCases = [
    ["patch", "/suppliers/:id/approve"],
    ["patch", "/suppliers/:id/suspend"],
    ["patch", "/suppliers/:id/block"],
    ["patch", "/suppliers/:id/categorize"],
    ["patch", "/suppliers/:id/tier"]
  ];
  for (const [method, path] of idCases) {
    it(`cross-tenant: ${method.toUpperCase()} ${path} blocked for foreign org`, async () => {
      const handler = findHandlerExact(suppliersRouter(ENTRY_B), method, path);
      const req = mockReq({ orgId: ORG_A, params: { id: "vp-b-001" }, body: { tier: "preferred", reason: "x", category: "c" }, session: { userId: USER_A } });
      const res = mockRes();
      await handler(req, res, noop);
      assert.equal(res._status, 403, `Must block cross-org ${path}`);
      assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
    });
  }

  it("cross-tenant: POST /suppliers/:vpId/notes blocked for foreign org", async () => {
    const handler = findHandlerExact(suppliersRouter(ENTRY_B), "post", "/suppliers/:vpId/notes");
    const req = mockReq({ orgId: ORG_A, params: { vpId: "vp-b-001" }, body: { text: "x" }, session: { userId: USER_A } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.equal(res._status, 403, "Must block cross-org notes add");
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("own-org: PATCH /suppliers/:id/categorize not org-blocked", async () => {
    // categorize: direktes UPDATE ohne Enum-Validierung -> sauberer Positiv-Beweis,
    // dass requireOwnedVendorEntry bei eigener Org NICHT 403t.
    const handler = findHandlerExact(suppliersRouter(ENTRY_A), "patch", "/suppliers/:id/categorize");
    const req = mockReq({ orgId: ORG_A, params: { id: "vp-a-001" }, body: { category: "strategic" }, session: { userId: USER_A } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.notEqual(res._status, 403, "Own-org supplier categorize must not be org-blocked");
  });
});

// ── Agency submissions: mutation org-boundary (Cross-Org-IDOR-Fix) ───────────
//
// Die Reviewer-Transitions (start-review/approve/send-to-customer/...) mutieren im
// Service durch transition() per id OHNE supplier_org_id-Check. Der Schutz liegt im
// requireOwnSubmission-MIDDLEWARE (direkt vor dem Handler) — daher die Middleware
// extrahieren und direkt aufrufen, nicht den finalen Handler.

function agencyRouter(sub) {
  return createAgencyPortalRouter(
    baseDeps(poolWith(sub), { requireFeature: () => (_req, _res, next) => next() })
  );
}

/** Extrahiert die Middleware unmittelbar vor dem finalen Route-Handler. */
function findGuardBeforeHandler(router, method, path) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path && layer.route.methods[method]) {
      const stack = layer.route.stack;
      if (stack.length < 2) throw new Error(`No guard before handler on ${method} ${path}`);
      return stack[stack.length - 2].handle;
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}

const AGENCY_MUTATIONS = [
  "/agency/submissions/:id([0-9a-fA-F-]{36})/start-review",
  "/agency/submissions/:id([0-9a-fA-F-]{36})/approve",
  "/agency/submissions/:id([0-9a-fA-F-]{36})/send-to-customer",
  "/agency/submissions/:id([0-9a-fA-F-]{36})/customer-confirm",
  "/agency/submissions/:id([0-9a-fA-F-]{36})/customer-reject",
  "/agency/submissions/:id([0-9a-fA-F-]{36})/post-to-timesheet",
  "/agency/submissions/:id([0-9a-fA-F-]{36})/request-correction",
  "/agency/submissions/:id([0-9a-fA-F-]{36})/reject"
];

describe("CORE-ISO: agency submissions — mutation org-boundary (IDOR-Fix)", () => {
  for (const path of AGENCY_MUTATIONS) {
    const action = path.split("/").pop();
    it(`cross-tenant: Org A blocked from "${action}" on Org B submission`, async () => {
      const router = agencyRouter({ id: "sub-b-001", supplier_org_id: ORG_B });
      const guard = findGuardBeforeHandler(router, "post", path);
      const req = mockReq({ orgId: ORG_A, params: { id: "sub-b-001" }, session: { userId: USER_A } });
      const res = mockRes();
      let nextCalled = false;
      await guard(req, res, () => { nextCalled = true; });
      assert.equal(res._status, 403, `Must block cross-org ${action}`);
      assert.equal(res._json.error, "FORBIDDEN");
      assert.equal(nextCalled, false, "Guard darf bei Cross-Org NICHT next() aufrufen");
    });
  }

  it("own-org: Org A passiert den Guard bei eigener Submission", async () => {
    const router = agencyRouter({ id: "sub-a-001", supplier_org_id: ORG_A });
    const guard = findGuardBeforeHandler(router, "post", "/agency/submissions/:id([0-9a-fA-F-]{36})/approve");
    const req = mockReq({ orgId: ORG_A, params: { id: "sub-a-001" }, session: { userId: USER_A } });
    const res = mockRes();
    let nextCalled = false;
    await guard(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true, "Eigene Org muss den Guard passieren");
    assert.notEqual(res._status, 403);
  });

  it("nicht existente Submission -> 404 (nicht 403)", async () => {
    const router = agencyRouter(null);
    const guard = findGuardBeforeHandler(router, "post", "/agency/submissions/:id([0-9a-fA-F-]{36})/approve");
    const req = mockReq({ orgId: ORG_A, params: { id: "ghost" }, session: { userId: USER_A } });
    const res = mockRes();
    await guard(req, res, noop);
    assert.equal(res._status, 404);
  });
});

// ── Timesheet templates: service-layer org-scoping ──────────────────────────
//
// timesheetTemplates erzwingt Isolation im SERVICE: jede by-id-Operation ist auf
// supplier_org_id gebunden (getTemplate: WHERE id AND supplier_org_id; update
// pre-checkt via getTemplate -> NOT_FOUND; delete: DELETE WHERE id AND
// supplier_org_id). Wir beweisen, dass der Org-Filter real angewendet wird
// (SQL-Parameter-Test) und eine fremde Org NOT_FOUND statt einer erfolgreichen
// Cross-Org-Mutation bekommt.

/** Pool, der Queries aufzeichnet und inhaltsabhängig antwortet. */
function recordingPool(handler) {
  const queries = [];
  return {
    queries,
    query: async (sql, params) => {
      queries.push({ sql, params });
      return handler(sql, params) || { rows: [], rowCount: 0 };
    }
  };
}

describe("CORE-ISO: timesheet templates — service org-scoping", () => {
  it("updateTemplate: fremde Org -> NOT_FOUND, Lookup ist org-scoped", async () => {
    // getTemplate(ORG_B) findet Org-A-Template nicht -> rows:[] -> NOT_FOUND vor jedem UPDATE.
    const pool = recordingPool((sql) =>
      /FROM timesheet_templates\b/i.test(sql) ? { rows: [] } : { rows: [], rowCount: 0 }
    );
    const result = await templateSvc.updateTemplate(pool, "tmpl-a-001", ORG_B, { name: "tampered" });
    assert.equal(result.error, "NOT_FOUND", "Org B darf Org-A-Template nicht aktualisieren");
    const lookup = pool.queries.find(q => /FROM timesheet_templates\b/i.test(q.sql));
    assert.ok(lookup, "Template-Lookup muss laufen");
    assert.match(lookup.sql, /supplier_org_id\s*=\s*\$2/, "Lookup muss org-scoped sein");
    assert.ok(lookup.params.includes(ORG_B), "Lookup muss die Org des Aufrufers binden");
  });

  it("deleteTemplate: fremde Org -> NOT_FOUND, DELETE auf supplier_org_id gebunden", async () => {
    const pool = recordingPool((sql) => {
      if (/timesheet_template_assignments/i.test(sql)) return { rows: [{ cnt: "0" }] }; // nicht in Verwendung
      if (/DELETE FROM timesheet_templates/i.test(sql)) return { rowCount: 0 };          // Org-Mismatch -> kein Treffer
      return { rows: [], rowCount: 0 };
    });
    const result = await templateSvc.deleteTemplate(pool, "tmpl-a-001", ORG_B);
    assert.equal(result.error, "NOT_FOUND", "Org B darf Org-A-Template nicht löschen");
    const del = pool.queries.find(q => /DELETE FROM timesheet_templates/i.test(q.sql));
    assert.ok(del, "DELETE muss laufen");
    assert.match(del.sql, /supplier_org_id\s*=\s*\$2/, "DELETE muss org-scoped sein");
    assert.deepEqual(del.params, ["tmpl-a-001", ORG_B], "DELETE muss id + Aufrufer-Org binden");
  });
});

// ── Emergency: Sub-Resource-Ownership (Commitment-Status + Notdienst-Vereinbarung)
//
// Notdienst ist Cross-Org BY DESIGN (Agenturen committen auf fremde Notlagen). Der
// echte Schutz ist Sub-Resource-Ownership: NUR die beiden Parteien (anfragendes
// Unternehmen + zusagende Agentur) dürfen das Commitment ändern / daraus eine
// bindende Vereinbarung erzeugen. emergencyAccess ist nur ein Feature-Gate.

/** Pool mit connect() (Transaktionspfad), antwortet inhaltsabhängig. */
function emgPool(handler) {
  const client = {
    query: async (sql, params) => handler(sql, params) || { rows: [], rowCount: 0 },
    release() {}
  };
  return { connect: async () => client, query: client.query };
}

const REQUESTER = "company-requester-001";
const SUPPLIER  = "agency-supplier-002";
const OUTSIDER  = "org-c-outsider-003";

describe("CORE-ISO: emergency commitment status — sub-resource ownership", () => {
  function commitmentPool(status) {
    const commitment = { id: "cm-1", demand_request_id: "d-1", status,
      supplier_company_id: SUPPLIER, requester_company_id: REQUESTER };
    return emgPool((sql) =>
      /emergency_provider_commitments/i.test(sql) && /SELECT/i.test(sql)
        ? { rows: [commitment] } : { rows: [], rowCount: 0 });
  }
  it("cross-tenant: Outsider (keine Partei) -> FORBIDDEN", async () => {
    const result = await emergencyCommitmentService.updateCommitmentStatus(commitmentPool("committed"), {
      commitmentId: "cm-1", actorUserId: OUTSIDER, actorRole: null, status: "withdrawn"
    });
    assert.equal(result.error, "FORBIDDEN", "Fremde Org darf Commitment-Status nicht ändern");
  });
  it("supplier-Partei passiert authz (kein FORBIDDEN)", async () => {
    const result = await emergencyCommitmentService.updateCommitmentStatus(commitmentPool("withdrawn"), {
      commitmentId: "cm-1", actorUserId: SUPPLIER, actorRole: null, status: "withdrawn"
    });
    assert.notEqual(result.error, "FORBIDDEN", "Beteiligte Partei darf NICHT geblockt werden");
  });
});

describe("CORE-ISO: emergency create-agreement — ownership (IDOR-Fix)", () => {
  function agreementPool(status) {
    const commitment = { id: "cm-1", demand_request_id: "d-1", status,
      requester_company_id: REQUESTER, supplier_company_id: SUPPLIER, committed_quantity: 2 };
    return emgPool((sql) =>
      /FROM emergency_provider_commitments/i.test(sql) ? { rows: [commitment] } : { rows: [], rowCount: 0 });
  }
  it("cross-tenant: Outsider -> FORBIDDEN (keine bindende Vereinbarung auf fremde Notlage)", async () => {
    const result = await dealAgreementService.createEmergencyAgreement(agreementPool("committed"), {
      demandId: "d-1", commitmentId: "cm-1", conditions: {}, actorId: OUTSIDER
    });
    assert.equal(result.error, "FORBIDDEN", "Fremde Org darf keine Notdienst-Vereinbarung erzeugen");
  });
  it("requester-Partei passiert authz (-> COMMITMENT_NOT_ACTIVE statt FORBIDDEN)", async () => {
    const result = await dealAgreementService.createEmergencyAgreement(agreementPool("pending"), {
      demandId: "d-1", commitmentId: "cm-1", conditions: {}, actorId: REQUESTER
    });
    assert.equal(result.error, "COMMITMENT_NOT_ACTIVE", "Requester passiert authz; nur Status blockt");
  });
  it("supplier-Partei passiert authz ebenfalls", async () => {
    const result = await dealAgreementService.createEmergencyAgreement(agreementPool("pending"), {
      demandId: "d-1", commitmentId: "cm-1", conditions: {}, actorId: SUPPLIER
    });
    assert.equal(result.error, "COMMITMENT_NOT_ACTIVE", "Supplier passiert authz; nur Status blockt");
  });
});

// ── Capacity exchange: by-id ownership (service-scoped) ──────────────────────
//
// Kapazitäts-Einträge gehören dem Ersteller (supplier_company_id = userId). Jede
// by-id-Mutation ist darauf gebunden (WHERE id AND supplier_company_id = $caller);
// ein fremder Nutzer/eine fremde Org bekommt NOT_FOUND/null statt einer
// erfolgreichen Cross-Org-Transition. transitionStatus deckt activate/pause/
// reactivate/fill/archive ab.

describe("CORE-ISO: capacity exchange — by-id ownership", () => {
  it("transitionStatus: fremder Nutzer -> NOT_FOUND, Lookup org/owner-scoped", async () => {
    const pool = recordingPool(() => ({ rows: [], rowCount: 0 }));
    const result = await capacityExchangeService.transitionStatus(pool, "cp-a-001", OUTSIDER, "active", "PRO");
    assert.equal(result.error, "NOT_FOUND", "Fremder darf Eintrag nicht transitionieren");
    const sel = pool.queries.find(q => /SELECT \* FROM capacity_posts/i.test(q.sql));
    assert.ok(sel, "Ownership-Lookup muss laufen");
    assert.match(sel.sql, /supplier_company_id\s*=\s*\$2/, "Lookup muss owner-scoped sein");
    assert.deepEqual(sel.params, ["cp-a-001", OUTSIDER]);
  });

  it("confirmFreshness: fremder Nutzer -> null, UPDATE auf owner gebunden", async () => {
    const pool = recordingPool(() => ({ rows: [], rowCount: 0 }));
    const result = await capacityExchangeService.confirmFreshness(pool, "cp-a-001", OUTSIDER);
    assert.equal(result, null, "Fremder darf Freshness nicht bestätigen");
    const upd = pool.queries.find(q => /UPDATE capacity_posts/i.test(q.sql));
    assert.ok(upd, "UPDATE muss laufen");
    assert.match(upd.sql, /supplier_company_id\s*=\s*\$2/, "UPDATE muss owner-scoped sein");
    assert.deepEqual(upd.params, ["cp-a-001", OUTSIDER]);
  });
});
