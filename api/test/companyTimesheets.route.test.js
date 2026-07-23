/**
 * Company Timesheets Router — Käufer-Sicht (P2.2) Tests.
 * Sicherheits-Kern: Org-Boundary (fremde Org = 403), Scoping der Liste auf org_id,
 * Handler-Weiterleitung, Reject-Grund-Pflicht.
 *
 * Run: node --test test/companyTimesheets.route.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCompanyTimesheetsRouter } from "../routes/companyTimesheets.js";
import * as submissionSvc from "../services/workerSubmissionService.js";

function recordingPool(...responses) {
  let idx = 0;
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql: String(sql), params });
      const resp = responses[idx++] ?? { rows: [], rowCount: 0 };
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}
const mockLogger = () => ({ info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} });
const requireAuth = (_req, _res, next) => next();
const requireFeature = () => (_req, _res, next) => next();
const baseDeps = (pool) => ({ pool, requireAuth, requireFeature, logger: mockLogger() });

function mockRes() {
  const res = {
    _status: 200, _json: null, locals: {},
    status(c) { res._status = c; return res; },
    json(d) { res._json = d; return res; }
  };
  return res;
}

// Gibt ALLE Handler eines Routes zurück (inkl. Guards), damit wir requireCompanySubmission testen können.
function allHandlers(router, method, pathFragment) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    const m = Object.keys(layer.route.methods)[0];
    if (m === method && layer.route.path.includes(pathFragment)) {
      return layer.route.stack.map((s) => s.handle);
    }
  }
  throw new Error(`Route ${method} ${pathFragment} not found`);
}
const lastHandler = (router, method, frag) => { const h = allHandlers(router, method, frag); return h[h.length - 1]; };

describe("listCompanySubmissions — Scoping auf org_id (Käufer-Org)", () => {
  it("scoped die Query auf wts.org_id = $1 und nutzt Käufer-Default-Status", async () => {
    const pool = recordingPool({ rows: [] });
    await submissionSvc.listCompanySubmissions(pool, "company-org-1", {});
    const q = pool.calls[0];
    assert.match(q.sql, /wts\.org_id = \$1/, "gescoped auf org_id");
    assert.equal(q.params[0], "company-org-1");
    assert.match(q.sql, /sent_to_customer/, "Default-Käufer-Status enthalten");
    assert.ok(!/supplier_org_id = \$1/.test(q.sql), "NICHT auf supplier_org_id gescoped");
  });
  it("filtert auf einen konkreten Status wenn angegeben", async () => {
    const pool = recordingPool({ rows: [] });
    await submissionSvc.listCompanySubmissions(pool, "c1", { status: "customer_confirmed" });
    assert.ok(pool.calls[0].params.includes("customer_confirmed"));
  });
});

describe("requireCompanySubmission — Org-Boundary", () => {
  it("fremde Org → 403 FORBIDDEN (kein Cross-Org-IDOR)", async () => {
    const pool = recordingPool({ rows: [{ id: "s1", org_id: "OTHER-ORG", status: "sent_to_customer" }] });
    const router = createCompanyTimesheetsRouter(baseDeps(pool));
    const handlers = allHandlers(router, "post", "/confirm");
    const guard = handlers[handlers.length - 2]; // vor dem eigentlichen Handler
    const req = { orgId: "company-org-1", params: { id: "s1" }, session: { userId: "u1" }, body: {} };
    const res = mockRes();
    let nexted = false;
    await guard(req, res, () => { nexted = true; });
    assert.equal(nexted, false, "next() NICHT aufgerufen");
    assert.equal(res._status, 403);
    assert.equal(res._json.error, "FORBIDDEN");
  });
  it("eigene Org → next() (Durchlass)", async () => {
    const pool = recordingPool({ rows: [{ id: "s1", org_id: "company-org-1", status: "sent_to_customer" }] });
    const router = createCompanyTimesheetsRouter(baseDeps(pool));
    const handlers = allHandlers(router, "post", "/confirm");
    const guard = handlers[handlers.length - 2];
    const req = { orgId: "company-org-1", params: { id: "s1" }, session: { userId: "u1" }, body: {} };
    const res = mockRes();
    let nexted = false;
    await guard(req, res, () => { nexted = true; });
    assert.equal(nexted, true, "next() aufgerufen");
    assert.equal(req._companySubmission.org_id, "company-org-1");
  });
  it("nicht existente Submission → 404", async () => {
    const pool = recordingPool({ rows: [] });
    const router = createCompanyTimesheetsRouter(baseDeps(pool));
    const handlers = allHandlers(router, "post", "/confirm");
    const guard = handlers[handlers.length - 2];
    const req = { orgId: "company-org-1", params: { id: "sX" }, session: { userId: "u1" }, body: {} };
    const res = mockRes();
    await guard(req, res, () => {});
    assert.equal(res._status, 404);
  });
});

describe("GET /company/submissions — Handler + Zero-State", () => {
  it("gibt leere Liste als {items:[],total:0} zurück (Zero-State, kein Crash)", async () => {
    const pool = recordingPool({ rows: [] });
    const router = createCompanyTimesheetsRouter(baseDeps(pool));
    const handler = lastHandler(router, "get", "/company/submissions");
    const res = mockRes();
    await handler({ orgId: "c1", query: {}, session: { userId: "u1" } }, res, (e) => { throw e; });
    assert.deepEqual(res._json, { items: [], total: 0 });
  });
});

describe("GET /company/live-workforce — Käufer-Scoping + Handler", () => {
  it("scoped auf wal.org_id = req.orgId und liefert Board-Shape", async () => {
    const pool = recordingPool({
      rows: [{ link_id: "l1", worker_user_id: "w1", first_name: "Anna", last_name: "Bauer", supplier_org_id: "sup-1", live_status: "im_einsatz" }]
    });
    const router = createCompanyTimesheetsRouter(baseDeps(pool));
    const handler = lastHandler(router, "get", "/company/live-workforce");
    const res = mockRes();
    await handler({ orgId: "company-org-1", query: {}, session: { userId: "u1" } }, res, (e) => { throw e; });
    assert.equal(res._json.available, true);
    assert.equal(res._json.workers.length, 1);
    assert.equal(res._json.kpis.total, 1);
    assert.equal(pool.calls[0].params[0], "company-org-1", "gescoped auf die eigene Käufer-Org");
    assert.match(pool.calls[0].sql, /wal\.org_id = \$1/);
    assert.ok(!/supplier_org_id = \$1/.test(pool.calls[0].sql), "NICHT auf supplier_org_id gescoped");
  });
});

describe("POST /company/submissions/:id/reject — Grund Pflicht", () => {
  it("ohne Grund → 400 REASON_REQUIRED", async () => {
    const pool = recordingPool();
    const router = createCompanyTimesheetsRouter(baseDeps(pool));
    const handler = lastHandler(router, "post", "/reject");
    const res = mockRes();
    await handler(
      { orgId: "c1", params: { id: "s1" }, session: { userId: "u1" }, body: { reason: "" }, _companySubmission: { org_id: "c1" } },
      res, (e) => { throw e; }
    );
    assert.equal(res._status, 400);
    assert.equal(res._json.error, "REASON_REQUIRED");
  });
});

describe("Sperrliste (P3.3) — Käufer-Routen", () => {
  const WUID = "11111111-1111-1111-1111-111111111111";
  it("POST /company/blocklist ohne gültige worker_user_id → 400 INVALID_WORKER", async () => {
    const pool = recordingPool();
    const router = createCompanyTimesheetsRouter(baseDeps(pool));
    const handler = lastHandler(router, "post", "/company/blocklist");
    const res = mockRes();
    await handler({ orgId: "c1", body: { worker_user_id: "nope" }, session: { userId: "u1" } }, res, (e) => { throw e; });
    assert.equal(res._status, 400);
    assert.equal(res._json.error, "INVALID_WORKER");
  });
  it("POST /company/blocklist mit gültigen Daten → 201 + gescoped auf company_org_id", async () => {
    const pool = recordingPool({ rows: [{ id: "b1", company_org_id: "c1", worker_user_id: WUID, blocked_until: null }] });
    const router = createCompanyTimesheetsRouter(baseDeps(pool));
    const handler = lastHandler(router, "post", "/company/blocklist");
    const res = mockRes();
    await handler({ orgId: "c1", body: { worker_user_id: WUID, reason: "Unzuverlässig", blocked_until: null }, session: { userId: "u1" } }, res, (e) => { throw e; });
    assert.equal(res._status, 201);
    assert.equal(pool.calls[0].params[0], "c1", "company_org_id = eigene Org");
    assert.equal(pool.calls[0].params[1], WUID);
  });
  it("POST /company/blocklist mit ungültigem Datum → 400 INVALID_DATE", async () => {
    const pool = recordingPool();
    const router = createCompanyTimesheetsRouter(baseDeps(pool));
    const handler = lastHandler(router, "post", "/company/blocklist");
    const res = mockRes();
    await handler({ orgId: "c1", body: { worker_user_id: WUID, blocked_until: "31.12.2026" }, session: { userId: "u1" } }, res, (e) => { throw e; });
    assert.equal(res._status, 400);
    assert.equal(res._json.error, "INVALID_DATE");
  });
  it("GET /company/blocklist → Liste gescoped auf req.orgId (Zero-State)", async () => {
    const pool = recordingPool({ rows: [] });
    const router = createCompanyTimesheetsRouter(baseDeps(pool));
    const handler = lastHandler(router, "get", "/company/blocklist");
    const res = mockRes();
    await handler({ orgId: "c1", query: {}, session: { userId: "u1" } }, res, (e) => { throw e; });
    assert.deepEqual(res._json, { items: [], total: 0 });
    assert.equal(pool.calls[0].params[0], "c1");
  });
});

describe("Beschwerde (P3.2) — Käufer-Routen", () => {
  const WUID = "11111111-1111-1111-1111-111111111111";
  it("POST /company/complaints ohne Grund → 400 REASON_REQUIRED", async () => {
    const pool = recordingPool();
    const router = createCompanyTimesheetsRouter(baseDeps(pool));
    const handler = lastHandler(router, "post", "/company/complaints");
    const res = mockRes();
    await handler({ orgId: "c1", body: { worker_user_id: WUID, reason: "" }, session: { userId: "u1" } }, res, (e) => { throw e; });
    assert.equal(res._status, 400);
    assert.equal(res._json.error, "REASON_REQUIRED");
  });
  it("POST /company/complaints ungültige worker_user_id → 400 INVALID_WORKER", async () => {
    const pool = recordingPool();
    const router = createCompanyTimesheetsRouter(baseDeps(pool));
    const handler = lastHandler(router, "post", "/company/complaints");
    const res = mockRes();
    await handler({ orgId: "c1", body: { worker_user_id: "nope", reason: "problem" }, session: { userId: "u1" } }, res, (e) => { throw e; });
    assert.equal(res._status, 400);
    assert.equal(res._json.error, "INVALID_WORKER");
  });
  it("POST /company/complaints gültig → 201, Kontext gescoped auf worker+company, Dispatcher benachrichtigt", async () => {
    const pool = recordingPool(
      { rows: [{ link_id: "l1", supplier_org_id: "sup1", dispatcher_user_id: "disp1", first_name: "A", last_name: "B" }] }, // Kontext-SELECT
      { rows: [{ id: "cmp1", company_org_id: "c1" }] } // INSERT
    );
    const router = createCompanyTimesheetsRouter(baseDeps(pool));
    const handler = lastHandler(router, "post", "/company/complaints");
    const res = mockRes();
    await handler({ orgId: "c1", body: { worker_user_id: WUID, reason: "wiederholt zu spät", severity: "high" }, session: { userId: "u1" } }, res, (e) => { throw e; });
    assert.equal(res._status, 201);
    assert.equal(res._json.complaint.id, "cmp1");
    assert.equal(res._json.notified_dispatcher, true);
    assert.equal(pool.calls[0].params[0], WUID, "Kontext gescoped auf Worker");
    assert.equal(pool.calls[0].params[1], "c1", "Kontext gescoped auf Company");
  });
  it("GET /company/complaints → gescoped auf req.orgId (Zero-State)", async () => {
    const pool = recordingPool({ rows: [] });
    const router = createCompanyTimesheetsRouter(baseDeps(pool));
    const handler = lastHandler(router, "get", "/company/complaints");
    const res = mockRes();
    await handler({ orgId: "c1", query: {}, session: { userId: "u1" } }, res, (e) => { throw e; });
    assert.deepEqual(res._json, { items: [], total: 0 });
    assert.equal(pool.calls[0].params[0], "c1");
  });
});
