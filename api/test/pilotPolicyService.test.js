import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canActivatePilot,
  activatePilotForOrganization,
  setPilotException
} from "../services/pilotPolicyService.js";

function mockPool(handler) {
  return {
    query: async (sql, params) => handler(sql, params)
  };
}

describe("pilotPolicyService.canActivatePilot", () => {
  it("returns denied when family org is blocked", async () => {
    const pool = mockPool((sql) => {
      if (sql.includes("SELECT id FROM down_tree")) return { rows: [{ id: "org-a" }, { id: "org-b" }] };
      if (sql.includes("WHERE id = ANY")) {
        return { rows: [{ id: "org-a", pilot_status: "active", has_used_pilot: true, pilot_exception_allowed: false }, { id: "org-b", pilot_status: "blocked", has_used_pilot: true, pilot_exception_allowed: false }] };
      }
      return { rows: [] };
    });
    const result = await canActivatePilot(pool, "org-a");
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "PILOT_BLOCKED_IN_FAMILY");
  });

  it("returns denied when pilot used and no exception", async () => {
    const pool = mockPool((sql) => {
      if (sql.includes("SELECT id FROM down_tree")) return { rows: [{ id: "org-a" }] };
      if (sql.includes("WHERE id = ANY")) return { rows: [{ id: "org-a", pilot_status: "ended", has_used_pilot: true, pilot_exception_allowed: false }] };
      return { rows: [] };
    });
    const result = await canActivatePilot(pool, "org-a");
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "PILOT_ALREADY_USED");
  });
});

describe("pilotPolicyService.activatePilotForOrganization", () => {
  it("activates pilot when eligible", async () => {
    const pool = mockPool((sql) => {
      if (sql.includes("SELECT id FROM down_tree")) return { rows: [{ id: "org-a" }] };
      if (sql.includes("WHERE id = ANY")) return { rows: [{ id: "org-a", pilot_status: "eligible", has_used_pilot: false, pilot_exception_allowed: false }] };
      if (sql.includes("SET pilot_status = 'active'")) {
        return { rows: [{ id: "org-a", pilot_status: "active", has_used_pilot: true, customer_stage: "pilot", pilot_started_at: new Date().toISOString() }] };
      }
      return { rows: [] };
    });
    const result = await activatePilotForOrganization(pool, { orgId: "org-a", source: "signup" });
    assert.equal(result.id, "org-a");
    assert.equal(result.pilot_status, "active");
    assert.equal(result.has_used_pilot, true);
  });
});

describe("pilotPolicyService.setPilotException", () => {
  it("requires documented reason", async () => {
    const pool = mockPool(() => ({ rows: [] }));
    await assert.rejects(
      () => setPilotException(pool, { orgId: "org-a", actorUserId: "u-1", allowed: true, reason: "short" }),
      { code: "PILOT_EXCEPTION_REASON_REQUIRED" }
    );
  });
});
