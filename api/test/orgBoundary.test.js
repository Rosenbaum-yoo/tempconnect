/**
 * Org-Boundary Utils Tests — Multi-Tenant-Sicherheit.
 *
 * Testet: OrgBoundaryError, assertOrgOwnership, assertUserOwnership, sendOrgBoundaryError.
 * Run: node --test test/orgBoundary.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  OrgBoundaryError,
  assertOrgOwnership,
  assertUserOwnership,
  sendOrgBoundaryError,
  assertLocationBelongsToOrg,
  assertDepartmentBelongsToOrg,
  assertMemberScopeBelongsToOrg
} from "../utils/orgBoundary.js";

/* ── Helpers ──────────────────────────────────────────── */

function mockPool(rows = []) {
  return { query: async () => ({ rows }) };
}

function mockRes() {
  const res = { _status: null, _json: null, status(c) { res._status = c; return res; }, json(d) { res._json = d; return res; } };
  return res;
}

/* ── OrgBoundaryError ────────────────────────────────── */

describe("OrgBoundaryError", () => {
  it("hat status 403", () => {
    const err = new OrgBoundaryError();
    assert.equal(err.status, 403);
    assert.equal(err.code, "ORG_BOUNDARY_VIOLATION");
    assert.equal(err.name, "OrgBoundaryError");
  });

  it("akzeptiert Custom-Message", () => {
    const err = new OrgBoundaryError("Zugriff verweigert.");
    assert.equal(err.message, "Zugriff verweigert.");
  });

  it("ist instanceof Error", () => {
    assert.ok(new OrgBoundaryError() instanceof Error);
  });
});

/* ── assertOrgOwnership ──────────────────────────────── */

describe("assertOrgOwnership — Validierung", () => {
  it("wirft wenn orgId fehlt", async () => {
    await assert.rejects(
      () => assertOrgOwnership(mockPool(), "requisitions", "r-1", null),
      err => err instanceof OrgBoundaryError && err.message.includes("Organisation")
    );
  });

  it("wirft wenn resourceId fehlt", async () => {
    await assert.rejects(
      () => assertOrgOwnership(mockPool(), "requisitions", null, "org-1"),
      err => err instanceof OrgBoundaryError && err.message.includes("Resource-ID")
    );
  });

  it("wirft Error fuer unbekannte Tabelle", async () => {
    await assert.rejects(
      () => assertOrgOwnership(mockPool(), "evil_table", "r-1", "org-1"),
      err => !(err instanceof OrgBoundaryError) && err.message.includes("unbekannte Tabelle")
    );
  });
});

describe("assertOrgOwnership — Lookup", () => {
  it("wirft 404 wenn Resource nicht existiert", async () => {
    await assert.rejects(
      () => assertOrgOwnership(mockPool([]), "requisitions", "r-missing", "org-1"),
      err => err.status === 404 && err.code === "NOT_FOUND"
    );
  });

  it("wirft OrgBoundaryError bei Org-Mismatch", async () => {
    const pool = mockPool([{ org_id: "org-other" }]);
    await assert.rejects(
      () => assertOrgOwnership(pool, "requisitions", "r-1", "org-1"),
      err => err instanceof OrgBoundaryError
    );
  });

  it("passiert wenn org_id uebereinstimmt", async () => {
    const pool = mockPool([{ org_id: "org-1" }]);
    await assertOrgOwnership(pool, "requisitions", "r-1", "org-1");
    // Kein Throw = Erfolg
  });

  it("vergleicht als String (Typ-Sicherheit)", async () => {
    const pool = mockPool([{ org_id: 42 }]);
    await assertOrgOwnership(pool, "requisitions", "r-1", "42");
    // Number 42 === String "42" via String()
  });

  it("nutzt custom orgColumn", async () => {
    let queriedSql = "";
    const pool = { query: async (sql) => { queriedSql = sql; return { rows: [{ buyer_org_id: "org-1" }] }; } };
    await assertOrgOwnership(pool, "contracts", "c-1", "org-1", { orgColumn: "buyer_org_id" });
    assert.ok(queriedSql.includes("buyer_org_id"), "Custom Column verwendet");
  });
});

describe("assertOrgOwnership — erlaubte Tabellen", () => {
  const tables = [
    "requisitions", "assignments", "contracts", "approval_requests",
    "compliance_documents", "notifications", "org_settings",
    "capacity_posts", "listings", "requests", "ratings",
    "payment_sessions", "vendor_pool", "platform_events",
    "sla_search_jobs", "offers", "submissions"
  ];
  for (const t of tables) {
    it(`akzeptiert '${t}'`, async () => {
      const pool = mockPool([{ org_id: "org-1" }]);
      await assertOrgOwnership(pool, t, "id-1", "org-1");
    });
  }
});

/* ── assertUserOwnership ─────────────────────────────── */

describe("assertUserOwnership — Validierung", () => {
  it("wirft wenn userId fehlt", async () => {
    await assert.rejects(
      () => assertUserOwnership(mockPool(), "listings", "l-1", null),
      err => err instanceof OrgBoundaryError
    );
  });

  it("wirft wenn resourceId fehlt", async () => {
    await assert.rejects(
      () => assertUserOwnership(mockPool(), "listings", null, "u-1"),
      err => err instanceof OrgBoundaryError
    );
  });

  it("wirft bei unbekannter Tabelle", async () => {
    await assert.rejects(
      () => assertUserOwnership(mockPool(), "drop_table", "l-1", "u-1"),
      err => err.message.includes("unbekannte Tabelle")
    );
  });
});

describe("assertUserOwnership — Lookup", () => {
  it("wirft 404 wenn Resource nicht existiert", async () => {
    await assert.rejects(
      () => assertUserOwnership(mockPool([]), "listings", "l-1", "u-1"),
      err => err.status === 404
    );
  });

  it("wirft OrgBoundaryError bei User-Mismatch", async () => {
    const pool = mockPool([{ owner_id: "u-other" }]);
    await assert.rejects(
      () => assertUserOwnership(pool, "listings", "l-1", "u-1"),
      err => err instanceof OrgBoundaryError
    );
  });

  it("passiert bei korrektem Owner", async () => {
    const pool = mockPool([{ owner_id: "u-1" }]);
    await assertUserOwnership(pool, "listings", "l-1", "u-1");
  });

  it("nutzt custom userColumn", async () => {
    let queriedSql = "";
    const pool = { query: async (sql) => { queriedSql = sql; return { rows: [{ requester_id: "u-1" }] }; } };
    await assertUserOwnership(pool, "requests", "r-1", "u-1", { userColumn: "requester_id" });
    assert.ok(queriedSql.includes("requester_id"));
  });
});

/* ── assertLocationBelongsToOrg ──────────────────────── */

describe("assertLocationBelongsToOrg", () => {
  it("skip wenn locationId null", async () => {
    await assertLocationBelongsToOrg(mockPool([]), null, "org-1");
    // Kein Throw
  });

  it("passiert wenn Standort zur Org gehoert", async () => {
    await assertLocationBelongsToOrg(mockPool([{ 1: 1 }]), "loc-1", "org-1");
    // Kein Throw
  });

  it("wirft OrgBoundaryError bei Fremd-Org Standort", async () => {
    await assert.rejects(
      () => assertLocationBelongsToOrg(mockPool([]), "loc-1", "org-1"),
      err => err instanceof OrgBoundaryError
    );
  });
});

/* ── assertDepartmentBelongsToOrg ────────────────────── */

describe("assertDepartmentBelongsToOrg", () => {
  it("skip wenn departmentId null", async () => {
    await assertDepartmentBelongsToOrg(mockPool([]), null, "org-1");
    // Kein Throw
  });

  it("passiert wenn Abteilung zur Org gehoert", async () => {
    await assertDepartmentBelongsToOrg(mockPool([{ 1: 1 }]), "dept-1", "org-1");
    // Kein Throw
  });

  it("wirft OrgBoundaryError bei Fremd-Org Abteilung", async () => {
    await assert.rejects(
      () => assertDepartmentBelongsToOrg(mockPool([]), "dept-1", "org-1"),
      err => err instanceof OrgBoundaryError
    );
  });
});

/* ── assertMemberScopeBelongsToOrg ───────────────────── */

describe("assertMemberScopeBelongsToOrg", () => {
  it("skip wenn location_id und department_id beide null", async () => {
    await assertMemberScopeBelongsToOrg(mockPool([]), { location_id: null, department_id: null }, "org-1");
    // Kein Throw
  });

  it("passiert wenn beides zur Org gehoert", async () => {
    const pool = { query: async () => ({ rows: [{ 1: 1 }] }) };
    await assertMemberScopeBelongsToOrg(pool, { location_id: "loc-1", department_id: "dept-1" }, "org-1");
  });

  it("wirft OrgBoundaryError wenn location_id Fremd-Org", async () => {
    await assert.rejects(
      () => assertMemberScopeBelongsToOrg(mockPool([]), { location_id: "loc-x", department_id: null }, "org-1"),
      err => err instanceof OrgBoundaryError
    );
  });

  it("wirft OrgBoundaryError wenn department_id Fremd-Org (location_id null)", async () => {
    let callCount = 0;
    const pool = { query: async () => { callCount++; return { rows: [] }; } };
    await assert.rejects(
      () => assertMemberScopeBelongsToOrg(pool, { location_id: null, department_id: "dept-x" }, "org-1"),
      err => err instanceof OrgBoundaryError
    );
    assert.equal(callCount, 1, "Nur Dept-Query ausgefuehrt (Location null → Skip)");
  });
});

/* ── sendOrgBoundaryError ────────────────────────────── */

describe("sendOrgBoundaryError", () => {
  it("sendet 403 mit Standard-Message", () => {
    const res = mockRes();
    sendOrgBoundaryError(res);
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "ORG_BOUNDARY_VIOLATION");
    assert.equal(res._json.success, false);
  });

  it("sendet 403 mit Custom-Message", () => {
    const res = mockRes();
    sendOrgBoundaryError(res, "Nicht erlaubt.");
    assert.equal(res._json.error.message, "Nicht erlaubt.");
  });
});
