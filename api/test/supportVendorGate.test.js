/**
 * supportAccess — externes Vendor-Sicherheits-Gate.
 *
 * Externe Support-Agenten (BPO, z.B. Indien) duerfen nur arbeiten, wenn ihr Vendor
 * von TempConnect VERIFIZIERT ist (status='active') und der Zugriff aus einem
 * freigegebenen IP-Netz kommt. pending/suspended oder fremde IP = 403.
 *
 * DB-frei (Mock-Pool, der getSupportAgent's SELECT beantwortet).
 *
 * Run: node --test --test-force-exit test/supportVendorGate.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ipAllowed, requireSupportAccess, externalLookupGuard } from "../middleware/supportAccess.js";

describe("supportAccess — ipAllowed (CIDR)", () => {
  it("leere/keine Allowlist = keine Beschraenkung", () => {
    assert.equal(ipAllowed("1.2.3.4", []), true);
    assert.equal(ipAllowed("1.2.3.4", null), true);
  });
  it("IP im /24-Netz erlaubt, ausserhalb gesperrt", () => {
    assert.equal(ipAllowed("203.0.113.55", ["203.0.113.0/24"]), true);
    assert.equal(ipAllowed("203.0.114.1", ["203.0.113.0/24"]), false);
  });
  it("exakte IP (ohne /Maske)", () => {
    assert.equal(ipAllowed("198.51.100.7", ["198.51.100.7"]), true);
    assert.equal(ipAllowed("198.51.100.8", ["198.51.100.7"]), false);
  });
  it("IPv4-mapped IPv6 (::ffff:) wird normalisiert", () => {
    assert.equal(ipAllowed("::ffff:203.0.113.10", ["203.0.113.0/24"]), true);
  });
  it("mehrere CIDRs werden ODER-verknuepft", () => {
    assert.equal(ipAllowed("10.0.0.5", ["203.0.113.0/24", "10.0.0.0/8"]), true);
  });
  it("ungueltige IP -> gesperrt", () => {
    assert.equal(ipAllowed("kaputt", ["203.0.113.0/24"]), false);
  });
});

function poolWithAgent(row) {
  return { query: async () => ({ rows: row ? [row] : [], rowCount: row ? 1 : 0 }) };
}
function runGate(agentRow, { ip = "203.0.113.5" } = {}) {
  return new Promise((resolve) => {
    const mw = requireSupportAccess({ pool: poolWithAgent(agentRow), logger: { error() {} }, config: { SUPPORT_OPS_ENABLED: true } });
    const out = { next: false, code: 200, body: null };
    const res = {
      status(c) { out.code = c; return this; },
      json(b) { out.body = b; resolve(out); return this; },
    };
    mw({ session: { userId: "u1" }, ip }, res, () => { out.next = true; resolve(out); });
  });
}

const extRow = (over = {}) => ({
  id: "a1", user_id: "u1", role: "external_support_agent", scope: "external",
  vendor_id: "v1", vendor_active: true, vendor_status: "active", vendor_ip_cidrs: [],
  data_scope: "vendor_scoped", allowed_queues: [], allowed_case_types: [], allowed_actions: [],
  is_active: true, user_email: "agent@bpo.example", display_name: "BPO Agent", ...over,
});

describe("supportAccess — externes Vendor-Gate", () => {
  it("aktiver verifizierter Vendor ohne IP-Liste -> next", async () => {
    assert.equal((await runGate(extRow())).next, true);
  });
  it("pending Vendor (nicht verifiziert) -> 403 VENDOR_NOT_VERIFIED", async () => {
    const r = await runGate(extRow({ vendor_status: "pending" }));
    assert.equal(r.code, 403); assert.equal(r.body.error, "VENDOR_NOT_VERIFIED");
  });
  it("suspended Vendor (Kill-Switch) -> 403 VENDOR_NOT_VERIFIED", async () => {
    const r = await runGate(extRow({ vendor_status: "suspended" }));
    assert.equal(r.code, 403); assert.equal(r.body.error, "VENDOR_NOT_VERIFIED");
  });
  it("vendor_active=false -> 403 NOT_SUPPORT_STAFF", async () => {
    const r = await runGate(extRow({ vendor_active: false }));
    assert.equal(r.code, 403); assert.equal(r.body.error, "NOT_SUPPORT_STAFF");
  });
  it("IP ausserhalb der Allowlist -> 403 IP_NOT_ALLOWED", async () => {
    const r = await runGate(extRow({ vendor_ip_cidrs: ["10.0.0.0/8"] }), { ip: "203.0.113.5" });
    assert.equal(r.code, 403); assert.equal(r.body.error, "IP_NOT_ALLOWED");
  });
  it("IP innerhalb der Allowlist -> next", async () => {
    assert.equal((await runGate(extRow({ vendor_ip_cidrs: ["203.0.113.0/24"] }), { ip: "203.0.113.5" })).next, true);
  });
  it("interner Agent ist vom Vendor-Gate unberuehrt", async () => {
    const internal = {
      id: "a2", user_id: "u1", role: "internal_support_lead", scope: "internal",
      vendor_id: null, vendor_active: true, vendor_status: null, vendor_ip_cidrs: [],
      data_scope: "full_internal", allowed_queues: [], allowed_case_types: [], allowed_actions: [],
      is_active: true, user_email: "lead@tc", display_name: "Lead",
    };
    assert.equal((await runGate(internal)).next, true);
  });
});

function runGuard(guard, agent, { ip = "1.1.1.1" } = {}) {
  return new Promise((resolve) => {
    const out = { next: false, code: 200, body: null };
    const res = { setHeader() {}, status(c) { out.code = c; return this; }, json(b) { out.body = b; resolve(out); return this; } };
    guard({ supportAgent: agent, ip }, res, () => { out.next = true; resolve(out); });
  });
}

describe("supportAccess — externalLookupGuard (Anti-Exfiltration)", () => {
  it("externer Agent: bis max erlaubt, danach 429 LOOKUP_RATE_LIMIT", async () => {
    const guard = externalLookupGuard({ max: 2, logger: { warn() {} } });
    const agent = { id: "ext-throttle-1", scope: "external", vendor_id: "v1" };
    assert.equal((await runGuard(guard, agent)).next, true);
    assert.equal((await runGuard(guard, agent)).next, true);
    const third = await runGuard(guard, agent);
    assert.equal(third.code, 429);
    assert.equal(third.body.error, "LOOKUP_RATE_LIMIT");
  });
  it("interner Agent wird nie gedrosselt", async () => {
    const guard = externalLookupGuard({ max: 1, logger: { warn() {} } });
    const agent = { id: "int-throttle-1", scope: "internal" };
    assert.equal((await runGuard(guard, agent)).next, true);
    assert.equal((await runGuard(guard, agent)).next, true);
    assert.equal((await runGuard(guard, agent)).next, true);
  });
});
