import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requireCompanyOrg } from "../middleware/orgAccess.js";

function mockLogger() {
  return {
    warnCalls: [],
    errorCalls: [],
    warn(payload, message) { this.warnCalls.push({ payload, message }); },
    error(payload, message) { this.errorCalls.push({ payload, message }); }
  };
}

function mockRes() {
  const res = {
    _status: 200,
    _json: null,
    status(code) { this._status = code; return this; },
    json(payload) { this._json = payload; return this; }
  };
  return res;
}

describe("requireCompanyOrg", () => {
  it("returns ORG_CONTEXT_REQUIRED without an organization context", async () => {
    const logger = mockLogger();
    const middleware = requireCompanyOrg({ pool: { query: async () => ({ rows: [] }) }, logger });
    const req = { session: { userId: "user-1" } };
    const res = mockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res._status, 400);
    assert.deepEqual(res._json, { error: "ORG_CONTEXT_REQUIRED" });
  });

  it("returns NO_ORG_MEMBERSHIP when no membership can be resolved", async () => {
    const logger = mockLogger();
    const pool = { query: async () => ({ rows: [] }) };
    const middleware = requireCompanyOrg({ pool, logger });
    const req = { orgId: "org-1", session: { userId: "user-1" } };
    const res = mockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res._status, 403);
    assert.deepEqual(res._json, {
      error: "NO_ORG_MEMBERSHIP",
      message: "Organisations-Mitgliedschaft erforderlich."
    });
  });

  it("denies non-company memberships with the configured buyer-only error", async () => {
    const logger = mockLogger();
    const pool = {
      query: async () => ({
        rows: [{ org_id: "org-1", org_type: "agency", role_key: "owner" }]
      })
    };
    const middleware = requireCompanyOrg({ pool, logger }, {
      errorCode: "EXECUTIVE_DASHBOARD_NOT_AVAILABLE_FOR_ORG_TYPE",
      errorMessage: "Steuerung & Analytik steht nur fuer Unternehmensorganisationen zur Verfuegung."
    });
    const req = { orgId: "org-1", session: { userId: "user-1" } };
    const res = mockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res._status, 403);
    assert.deepEqual(res._json, {
      error: "EXECUTIVE_DASHBOARD_NOT_AVAILABLE_FOR_ORG_TYPE",
      message: "Steuerung & Analytik steht nur fuer Unternehmensorganisationen zur Verfuegung."
    });
    assert.equal(logger.warnCalls.length, 1);
  });

  it("allows company memberships and stores the resolved membership on the request", async () => {
    const logger = mockLogger();
    const membership = { org_id: "org-1", org_type: "company", role_key: "owner" };
    const pool = { query: async () => ({ rows: [membership] }) };
    const middleware = requireCompanyOrg({ pool, logger });
    const req = { orgId: "org-1", session: { userId: "user-1" } };
    const res = mockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(res._status, 200);
    assert.equal(req.orgMembership.org_type, "company");
    assert.equal(logger.errorCalls.length, 0);
  });

  // P2-D: Worker-Portal Abgrenzung — Worker explizit auf Company-Routen sperren
  it("sperrt Worker (org_type=worker) von Company-Routen mit 403", async () => {
    const logger = mockLogger();
    const pool = {
      query: async () => ({
        rows: [{ org_id: "org-w", org_type: "worker", role_key: "member" }]
      })
    };
    const middleware = requireCompanyOrg({ pool, logger });
    const req = { orgId: "org-w", session: { userId: "worker-user-1" } };
    const res = mockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false, "next() darf nicht aufgerufen werden fuer Worker");
    assert.equal(res._status, 403);
    assert.equal(res._json.error, "BUYER_ORG_REQUIRED");
    assert.equal(logger.warnCalls.length, 1, "Warnung muss geloggt werden");
  });

  it("sperrt Worker mit custom errorCode von Company-Routen", async () => {
    const logger = mockLogger();
    const pool = {
      query: async () => ({
        rows: [{ org_id: "org-w", org_type: "worker", role_key: "member" }]
      })
    };
    const middleware = requireCompanyOrg({ pool, logger }, {
      errorCode: "SPEND_ANALYTICS_NOT_AVAILABLE_FOR_ORG_TYPE",
      errorMessage: "Spend Analytics steht nur fuer Unternehmensorganisationen zur Verfuegung."
    });
    const req = { orgId: "org-w", session: { userId: "worker-user-2" } };
    const res = mockRes();

    await middleware(req, res, () => {});

    assert.equal(res._status, 403);
    assert.equal(res._json.error, "SPEND_ANALYTICS_NOT_AVAILABLE_FOR_ORG_TYPE");
  });
});
