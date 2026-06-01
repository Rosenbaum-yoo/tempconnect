import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requireSupportAccess } from "../../middleware/supportAccess.js";
import { requireOwnerControlAccess } from "../../middleware/requireOwnerControlAccess.js";
import { mockReq, mockRes, mockLogger, USER_A } from "../helpers/security-mocks.js";

function supportAgentRow(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: USER_A,
    role: "external_support_agent",
    scope: "external",
    vendor_id: "22222222-2222-4222-8222-222222222222",
    allowed_queues: [ "general" ],
    allowed_case_types: [ "general" ],
    allowed_actions: [ "accept", "change_status", "add_note" ],
    data_scope: "assigned_only",
    is_active: true,
    vendor_name: "Vendor One",
    vendor_active: true,
    user_email: "support.agent@example.com",
    display_name: "Support Agent",
    ...overrides
  };
}

describe("SECURITY BOUNDARY: Support access is independent from OCC allowlist", () => {
  it("grants support middleware access for active support agent", async () => {
    const pool = {
      query: () => ({ rows: [ supportAgentRow() ] })
    };
    const middleware = requireSupportAccess({
      pool,
      logger: mockLogger(),
      config: { SUPPORT_OPS_ENABLED: "true" }
    });
    const req = mockReq({
      session: { userId: USER_A }
    });
    const res = mockRes();
    let nextCalled = false;
    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(res._status, 200);
    assert.equal(req.supportAgent.role, "external_support_agent");
  });

  it("denies support middleware access for user without support agent record", async () => {
    const pool = {
      query: () => ({ rows: [] })
    };
    const middleware = requireSupportAccess({
      pool,
      logger: mockLogger(),
      config: { SUPPORT_OPS_ENABLED: "true" }
    });
    const req = mockReq({
      session: { userId: USER_A }
    });
    const res = mockRes();

    await middleware(req, res, () => {});

    assert.equal(res._status, 403);
    assert.equal(res._json.error, "NOT_SUPPORT_STAFF");
  });
});

describe("SECURITY BOUNDARY: Support user does not implicitly gain OCC access", () => {
  it("denies OCC middleware access and writes access_denied audit", async () => {
    let auditInsertCalled = false;
    const pool = {
      query: (sql) => {
        if (String(sql).includes("FROM occ_owner_access")) {
          return { rowCount: 0, rows: [] };
        }
        if (String(sql).includes("INSERT INTO owner_control_access_audit")) {
          auditInsertCalled = true;
          return { rowCount: 1, rows: [] };
        }
        return { rowCount: 0, rows: [] };
      }
    };

    const middleware = requireOwnerControlAccess({
      pool,
      logger: mockLogger()
    });
    const req = mockReq({
      session: { userId: USER_A },
      path: "/owner-control/warp/execute",
      method: "POST",
      ip: "127.0.0.1"
    });
    const res = mockRes();

    await middleware(req, res, () => {});

    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "OCC_FORBIDDEN");
    assert.equal(auditInsertCalled, true);
  });
});

