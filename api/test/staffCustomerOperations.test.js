/**
 * Phase B — staffCustomerOperationsService (read-only Kundenroster).
 *
 * Service-Ebene mit Fake-Pool: prüft Zero-State, Mapping, Filter-Parameter
 * (SQL bindings), Enum-Sanitisierung, Limit/Offset-Clamp, Detail-Lookup und
 * die Risiko-Ableitung. RBAC (requireStaff) wird auf Routenebene durch dieselbe
 * createStaffControlAccessMiddleware erzwungen wie alle SCC-Routen (separat
 * abgedeckt) — hier liegt die Daten-/Aggregationslogik.
 *
 * Run: node --test --test-force-exit api/test/staffCustomerOperations.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  listCustomers, getCustomerDetail, deriveRiskLevel, meta
} from "../services/staffCustomerOperationsService.js";

function fakePool(handler) {
  return {
    calls: [],
    async query(sql, params) {
      this.calls.push({ sql, params });
      return handler(sql, params, this.calls.length);
    }
  };
}

describe("staffCustomerOperationsService", () => {
  it("listCustomers: Zero-State — leere Treffermenge gibt gültige Antwort, kein Wurf", async () => {
    const pool = fakePool(() => ({ rows: [] }));
    const out = await listCustomers(pool, {});
    assert.equal(out.available, true);
    assert.deepEqual(out.customers, []);
    assert.equal(out.total, 0);
    assert.ok(out.scope, "scope vorhanden");
    assert.match(out.generated_at, /^\d{4}-\d{2}-\d{2}T/);
  });

  it("listCustomers: mappt Zeilen + leitet total aus total_count (Window) ab", async () => {
    const pool = fakePool(() => ({
      rows: [
        {
          id: "org-1", name: "Acme GmbH", legal_name: "Acme Legal", plan: "PRO",
          customer_stage: "live", pilot_status: null, onboarding_completed_at: "2026-01-01T00:00:00Z",
          created_at: "2026-02-01T00:00:00Z", members_active: 4, open_requests: 1,
          last_request_status: "offered", last_request_type: "upgrade", last_request_at: "2026-03-01T00:00:00Z",
          risk_level: "watch", total_count: 7
        }
      ]
    }));
    const out = await listCustomers(pool, {});
    assert.equal(out.total, 7);
    assert.equal(out.customers.length, 1);
    const c = out.customers[0];
    assert.equal(c.org_id, "org-1");
    assert.equal(c.plan, "PRO");
    assert.equal(c.onboarded, true);
    assert.equal(c.members_active, 4);
    assert.deepEqual(c.last_request, { status: "offered", request_type: "upgrade", at: "2026-03-01T00:00:00Z" });
    assert.equal(c.risk_level, "watch");
  });

  it("listCustomers: Filter werden als SQL-Parameter gebunden ($1 stage, $2 plan, $3 search, $4 risk)", async () => {
    const pool = fakePool(() => ({ rows: [] }));
    await listCustomers(pool, { stage: "live", plan: "PRO", risk: "watch", search: "Acme", limit: 10, offset: 20 });
    const { params } = pool.calls[0];
    assert.equal(params[0], "live");
    assert.equal(params[1], "PRO");
    assert.equal(params[2], "%Acme%");
    assert.equal(params[3], "watch");
    assert.equal(params[4], 10);
    assert.equal(params[5], 20);
    assert.deepEqual(params[6], ["submitted", "under_review", "needs_clarification", "offered", "accepted"]);
  });

  it("listCustomers: ungültige Enums werden zu NULL sanitisiert (kein Pass-through)", async () => {
    const pool = fakePool(() => ({ rows: [] }));
    await listCustomers(pool, { stage: "bogus", plan: "HACK", risk: "drop" });
    const { params } = pool.calls[0];
    assert.equal(params[0], null);
    assert.equal(params[1], null);
    assert.equal(params[3], null);
  });

  it("listCustomers: limit wird auf max 200 geklammert, negativer offset auf 0", async () => {
    const pool = fakePool(() => ({ rows: [] }));
    await listCustomers(pool, { limit: 9999, offset: -5 });
    const { params } = pool.calls[0];
    assert.equal(params[4], 200);
    assert.equal(params[5], 0);
  });

  it("listCustomers: fehlendes limit nutzt Default 50", async () => {
    const pool = fakePool(() => ({ rows: [] }));
    await listCustomers(pool, {});
    assert.equal(pool.calls[0].params[4], 50);
  });

  it("listCustomers: suspended-Filter ist tri-state und bindet als $8", async () => {
    for (const v of [true, "true", "1"]) {
      const pool = fakePool(() => ({ rows: [] }));
      await listCustomers(pool, { suspended: v });
      assert.equal(pool.calls[0].params[7], true, `suspended=${JSON.stringify(v)} -> true`);
    }
    for (const v of [false, "false", "0"]) {
      const pool = fakePool(() => ({ rows: [] }));
      await listCustomers(pool, { suspended: v });
      assert.equal(pool.calls[0].params[7], false, `suspended=${JSON.stringify(v)} -> false`);
    }
    for (const v of [undefined, null, "vielleicht"]) {
      const pool = fakePool(() => ({ rows: [] }));
      await listCustomers(pool, { suspended: v });
      assert.equal(pool.calls[0].params[7], null, `suspended=${JSON.stringify(v)} -> null (alle)`);
    }
  });

  it("listCustomers: WHERE-Guard prüft access_suspended_at gegen $8, scope spiegelt suspended", async () => {
    const pool = fakePool(() => ({ rows: [] }));
    const out = await listCustomers(pool, { suspended: true });
    assert.match(pool.calls[0].sql, /access_suspended_at IS NOT NULL\)\s*=\s*\$8/);
    assert.equal(out.scope.suspended, true);
  });

  it("listCustomers: mappt Sperr-Felder (suspended/suspended_at/suspended_kind)", async () => {
    const pool = fakePool(() => ({
      rows: [{
        id: "org-x", name: "Locked GmbH", legal_name: null, plan: "PRO",
        customer_stage: "live", pilot_status: null, onboarding_completed_at: "2026-01-01T00:00:00Z",
        created_at: "2026-02-01T00:00:00Z", members_active: 2, open_requests: 0,
        last_request_status: null, last_request_type: null, last_request_at: null,
        risk_level: "none",
        access_suspended_at: "2026-06-05T10:00:00.000Z", access_suspended_kind: "non_payment",
        total_count: 1
      }]
    }));
    const c = (await listCustomers(pool, {})).customers[0];
    assert.equal(c.suspended, true);
    assert.equal(c.suspended_at, "2026-06-05T10:00:00.000Z");
    assert.equal(c.suspended_kind, "non_payment");
  });

  it("getCustomerDetail: unbekannte Org gibt null (404)", async () => {
    const pool = fakePool((sql) => (sql.includes("FROM organizations") ? { rows: [] } : { rows: [] }));
    const out = await getCustomerDetail(pool, "11111111-1111-1111-1111-111111111111");
    assert.equal(out, null);
  });

  it("getCustomerDetail: ungültige UUID gibt null OHNE DB-Query", async () => {
    const pool = fakePool(() => ({ rows: [{ id: "x" }] }));
    const out = await getCustomerDetail(pool, "not-a-uuid");
    assert.equal(out, null);
    assert.equal(pool.calls.length, 0);
  });

  it("getCustomerDetail: valide Org — Detail + Requests gemappt, Risiko abgeleitet (live ohne Onboarding = elevated)", async () => {
    const pool = fakePool((sql) => {
      if (sql.includes("FROM organizations")) {
        return { rows: [{
          id: "org-9", name: "Beta AG", legal_name: null, plan: "INDIVIDUELL",
          customer_stage: "live", pilot_status: null, billing_contact: "ap@beta.de",
          onboarding_completed_at: null, created_at: "2026-01-10T00:00:00Z", members_active: 12
        }] };
      }
      return { rows: [
        { id: "r1", request_type: "upgrade", status: "active", created_at: "2026-03-02T00:00:00Z" },
        { id: "r2", request_type: "new_individual", status: "rejected", created_at: "2026-02-02T00:00:00Z" }
      ] };
    });
    const out = await getCustomerDetail(pool, "00000000-0000-0000-0000-000000000009");
    assert.equal(out.available, true);
    assert.equal(out.customer.org_id, "org-9");
    assert.equal(out.customer.plan, "INDIVIDUELL");
    assert.equal(out.customer.onboarded, false);
    assert.equal(out.customer.risk_level, "elevated");
    assert.equal(out.subscription_requests.length, 2);
    assert.deepEqual(out.subscription_requests[0], { id: "r1", request_type: "upgrade", status: "active", at: "2026-03-02T00:00:00Z" });
  });

  it("getCustomerDetail: gesperrte Org — suspension-Block trägt vollen Sperr-Kontext", async () => {
    const pool = fakePool((sql) => {
      if (sql.includes("FROM organizations")) {
        return { rows: [{
          id: "org-s", name: "Suspended AG", legal_name: null, plan: "PRO",
          customer_stage: "live", pilot_status: null, billing_contact: null,
          onboarding_completed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-10T00:00:00Z",
          members_active: 5,
          access_suspended_at: "2026-06-05T10:00:00.000Z",
          access_suspended_reason: "Rechnung #123 seit 30 Tagen offen",
          access_suspended_kind: "non_payment",
          access_suspended_by: "staff-1"
        }] };
      }
      return { rows: [] };
    });
    const out = await getCustomerDetail(pool, "00000000-0000-0000-0000-000000000009");
    assert.deepEqual(out.customer.suspension, {
      suspended: true,
      suspended_at: "2026-06-05T10:00:00.000Z",
      reason: "Rechnung #123 seit 30 Tagen offen",
      kind: "non_payment",
      suspended_by: "staff-1"
    });
  });

  it("getCustomerDetail: aktive Org — suspension-Block ist leer (suspended:false)", async () => {
    const pool = fakePool((sql) => {
      if (sql.includes("FROM organizations")) {
        return { rows: [{
          id: "org-a", name: "Active GmbH", legal_name: null, plan: "BASIS",
          customer_stage: "live", pilot_status: null, billing_contact: null,
          onboarding_completed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-10T00:00:00Z",
          members_active: 3
        }] };
      }
      return { rows: [] };
    });
    const out = await getCustomerDetail(pool, "00000000-0000-0000-0000-00000000000a");
    assert.deepEqual(out.customer.suspension, {
      suspended: false, suspended_at: null, reason: null, kind: null, suspended_by: null
    });
  });

  it("deriveRiskLevel: konkrete Regeln (elevated/watch/none)", () => {
    assert.equal(deriveRiskLevel({ customer_stage: "live", onboarding_completed_at: null }), "elevated");
    assert.equal(deriveRiskLevel({ last_request_status: "needs_clarification" }), "elevated");
    assert.equal(deriveRiskLevel({ last_request_status: "offered" }), "watch");
    assert.equal(deriveRiskLevel({ customer_stage: "contract_requested" }), "watch");
    assert.equal(deriveRiskLevel({ customer_stage: "live", onboarding_completed_at: "2026-01-01T00:00:00Z" }), "none");
    assert.equal(deriveRiskLevel({}), "none");
  });

  it("meta: liefert Stages/Plans/Risk-Levels/Open-Statuses", () => {
    const m = meta();
    assert.deepEqual(m.stages, ["demo", "contract_requested", "pilot", "live"]);
    assert.deepEqual(m.plans, ["DEMO", "BASIS", "PLUS", "PRO", "INDIVIDUELL"]);
    assert.deepEqual(m.risk_levels, ["none", "watch", "elevated"]);
    assert.ok(m.open_request_statuses.includes("offered"));
  });
});
