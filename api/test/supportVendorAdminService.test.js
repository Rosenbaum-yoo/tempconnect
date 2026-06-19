/**
 * supportVendorAdminService — Vendor-/Agenten-Verwaltung (SCC-Datenlayer).
 * DB-frei (SQL-bewusster Mock-Pool). Prueft Validierung + korrekte Mutationen.
 *
 * Run: node --test --test-force-exit test/supportVendorAdminService.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/supportVendorAdminService.js";

function makePool(handlers) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      for (const [re, fn] of handlers) { if (re.test(sql)) return fn(params); }
      return { rows: [], rowCount: 0 };
    },
  };
}

describe("supportVendorAdminService — Vendor", () => {
  it("createVendor: leerer Name -> NAME_REQUIRED", async () => {
    const r = await svc.createVendor(makePool([]), { name: "  " });
    assert.equal(r.ok, false); assert.equal(r.error, "NAME_REQUIRED");
  });
  it("createVendor: ok -> pending angelegt", async () => {
    const pool = makePool([[/INSERT INTO support_vendors/i, (p) => ({ rows: [{ id: "v1", name: p[0], status: "pending", is_active: false }] })]]);
    const r = await svc.createVendor(pool, { name: "India BPO", contractRef: "MSA-1" });
    assert.equal(r.ok, true); assert.equal(r.row.status, "pending"); assert.equal(r.row.name, "India BPO");
  });
  it("verifyVendor: nicht gefunden -> NOT_FOUND", async () => {
    const r = await svc.verifyVendor(makePool([[/UPDATE support_vendors/i, () => ({ rows: [] })]]), { vendorId: "v1", actorUserId: "u1" });
    assert.equal(r.ok, false); assert.equal(r.error, "NOT_FOUND");
  });
  it("verifyVendor: ok -> status active", async () => {
    const pool = makePool([[/SET status = 'active'/i, () => ({ rows: [{ id: "v1", name: "X", status: "active", is_active: true }] })]]);
    const r = await svc.verifyVendor(pool, { vendorId: "v1", actorUserId: "u1" });
    assert.equal(r.ok, true); assert.equal(r.row.status, "active");
  });
  it("setVendorStatus: suspended -> ok", async () => {
    const pool = makePool([[/UPDATE support_vendors SET status = 'suspended'/i, () => ({ rows: [{ id: "v1", status: "suspended", is_active: false }] })]]);
    const r = await svc.setVendorStatus(pool, { vendorId: "v1", status: "suspended" });
    assert.equal(r.ok, true); assert.equal(r.row.status, "suspended");
  });
  it("setVendorStatus: ungueltig -> INVALID_STATUS", async () => {
    const r = await svc.setVendorStatus(makePool([]), { vendorId: "v1", status: "foo" });
    assert.equal(r.ok, false); assert.equal(r.error, "INVALID_STATUS");
  });
  it("setVendorIps: ungueltiges CIDR -> INVALID_CIDR (kein Write)", async () => {
    const pool = makePool([[/UPDATE/i, () => { throw new Error("should not write"); }]]);
    const r = await svc.setVendorIps(pool, { vendorId: "v1", cidrs: ["nope"] });
    assert.equal(r.ok, false); assert.equal(r.error, "INVALID_CIDR");
  });
  it("setVendorIps: gueltig -> gesetzt", async () => {
    const pool = makePool([[/UPDATE support_vendors SET allowed_ip_cidrs/i, (p) => ({ rows: [{ id: "v1", allowed_ip_cidrs: p[1] }] })]]);
    const r = await svc.setVendorIps(pool, { vendorId: "v1", cidrs: ["203.0.113.0/24"] });
    assert.equal(r.ok, true); assert.deepEqual(r.row.allowed_ip_cidrs, ["203.0.113.0/24"]);
  });
});

describe("supportVendorAdminService — Agenten", () => {
  const userHit = [/SELECT id, email FROM users/i, () => ({ rows: [{ id: "user-1", email: "agent@bpo.in" }] })];
  const noExisting = [/SELECT id FROM support_agents/i, () => ({ rows: [] })];
  const insertAgent = [/INSERT INTO support_agents/i, (p) => ({ rows: [{ id: "a1", user_id: p[0], role: p[1], scope: p[2], vendor_id: p[3], data_scope: p[4], is_active: true }] })];

  it("addAgent: ungueltige Rolle -> INVALID_ROLE", async () => {
    const r = await svc.addAgent(makePool([]), { email: "x@y.z", role: "boss" });
    assert.equal(r.error, "INVALID_ROLE");
  });
  it("addAgent: externe Rolle ohne Vendor -> VENDOR_REQUIRED", async () => {
    const r = await svc.addAgent(makePool([]), { email: "x@y.z", role: "external_support_agent" });
    assert.equal(r.error, "VENDOR_REQUIRED");
  });
  it("addAgent: ungueltiger data-scope -> INVALID_DATA_SCOPE", async () => {
    const r = await svc.addAgent(makePool([]), { email: "x@y.z", role: "internal_support_agent", dataScope: "boom" });
    assert.equal(r.error, "INVALID_DATA_SCOPE");
  });
  it("addAgent: unbekannter User -> USER_NOT_FOUND", async () => {
    const pool = makePool([[/SELECT id, email FROM users/i, () => ({ rows: [] })]]);
    const r = await svc.addAgent(pool, { email: "ghost@x.z", role: "internal_support_agent" });
    assert.equal(r.error, "USER_NOT_FOUND");
  });
  it("addAgent: intern -> scope=internal, vendor=null", async () => {
    const pool = makePool([userHit, noExisting, insertAgent]);
    const r = await svc.addAgent(pool, { email: "agent@bpo.in", role: "internal_support_lead" });
    assert.equal(r.ok, true); assert.equal(r.row.scope, "internal"); assert.equal(r.row.vendor_id, null);
  });
  it("addAgent: extern mit Vendor -> scope=external", async () => {
    const pool = makePool([userHit, noExisting, insertAgent]);
    const r = await svc.addAgent(pool, { email: "agent@bpo.in", role: "external_support_agent", vendorId: "v1" });
    assert.equal(r.ok, true); assert.equal(r.row.scope, "external"); assert.equal(r.row.vendor_id, "v1");
  });
  it("suspendAgent: ok", async () => {
    const pool = makePool([[/UPDATE support_agents SET is_active = FALSE/i, () => ({ rows: [{ id: "a1", is_active: false }] })]]);
    const r = await svc.suspendAgent(pool, { agentId: "a1" });
    assert.equal(r.ok, true); assert.equal(r.row.is_active, false);
  });
  it("suspendAgent: nicht gefunden -> NOT_FOUND", async () => {
    const r = await svc.suspendAgent(makePool([[/UPDATE support_agents/i, () => ({ rows: [] })]]), { agentId: "x" });
    assert.equal(r.ok, false); assert.equal(r.error, "NOT_FOUND");
  });
});
