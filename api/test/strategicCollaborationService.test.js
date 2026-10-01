import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as strategicSvc from "../services/strategicCollaborationService.js";

function sequencePool(...responses) {
  let idx = 0;
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      const call = { sql, params };
      calls.push(call);
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

describe("strategicCollaborationService", () => {
  it("computeEligibility returns ORG_REQUIRED when orgId is missing", async () => {
    const pool = { query: async () => { throw new Error("should not be called"); } };
    const user = { id: "u-1", plan: "PRO", is_verified: false };
    const res = await strategicSvc.computeEligibility(pool, user, null);
    assert.equal(res.allowed, false);
    assert.equal(res.code, "ORG_REQUIRED");
  });

  it("createInterest throws RATE_LIMITED when burst threshold is exceeded", async () => {
    const pool = sequencePool(
      { rows: [{ cnt: 3 }] } // burst count
    );
    const input = {
      requester_user_id: "u-1",
      requester_org_id: "org-1",
      target_user_id: null,
      target_org_id: null,
      source_context: "public_profile",
      requester_company_name: "ACME GmbH",
      contact_name: "Max Mustermann",
      contact_email: "max@example.com",
      contact_phone: null,
      region_scope: null,
      site_count: null,
      expected_volume: null,
      needs_enterprise_multi_site: false,
      interest_enterprise_support: true,
      interest_framework_conditions: true,
      interest_strategic_cooperation: true,
      message: null,
      requested_modules: []
    };

    await assert.rejects(() => strategicSvc.createInterest(pool, input), (err) => {
      assert.equal(err.code, "RATE_LIMITED");
      return true;
    });
  });

  it("createInterest throws DUPLICATE_OPEN_REQUEST when an open request exists", async () => {
    const pool = sequencePool(
      { rows: [{ cnt: 0 }] }, // burst count
      { rows: [{ id: "req-1" }] } // duplicate
    );
    const input = {
      requester_user_id: "u-1",
      requester_org_id: "org-1",
      target_user_id: null,
      target_org_id: null,
      source_context: "public_profile",
      requester_company_name: "ACME GmbH",
      contact_name: "Max Mustermann",
      contact_email: "max@example.com",
      contact_phone: null,
      region_scope: null,
      site_count: null,
      expected_volume: null,
      needs_enterprise_multi_site: false,
      interest_enterprise_support: true,
      interest_framework_conditions: true,
      interest_strategic_cooperation: true,
      message: null,
      requested_modules: []
    };

    await assert.rejects(() => strategicSvc.createInterest(pool, input), (err) => {
      assert.equal(err.code, "DUPLICATE_OPEN_REQUEST");
      assert.equal(err.existing_id, "req-1");
      return true;
    });
  });

  it("createInterest inserts and returns created row when no duplicates", async () => {
    const created = { id: "req-2", status: "eingegangen" };
    const pool = sequencePool(
      { rows: [{ cnt: 0 }] },     // burst count
      { rows: [] },              // duplicate
      { rows: [created] }        // insert result
    );
    const input = {
      requester_user_id: "u-1",
      requester_org_id: "org-1",
      target_user_id: null,
      target_org_id: null,
      source_context: "public_profile",
      requester_company_name: "ACME GmbH",
      contact_name: "Max Mustermann",
      contact_email: "max@example.com",
      contact_phone: null,
      region_scope: null,
      site_count: null,
      expected_volume: null,
      needs_enterprise_multi_site: true,
      interest_enterprise_support: true,
      interest_framework_conditions: true,
      interest_strategic_cooperation: true,
      message: "Hallo",
      requested_modules: ["api"]
    };

    const row = await strategicSvc.createInterest(pool, input);
    assert.equal(row.id, created.id);
    assert.equal(row.status, created.status);
  });

  /* Owner-Entscheid 2026-10-01: ein Kunde darf nur die EIGENE Anfrage
     zurueckziehen, solange nichts aktiviert ist — alle anderen Status setzt
     TempConnect. Vorher setzte `updateStatus` jeden Status, auch fuer die
     angefragte Firma. */
  it("zurueckziehen: nur die anfragende Firma, nur aus offenen Status, Org im selben UPDATE", async () => {
    const calls = [];
    const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [{ id: "req-1", status: "abgeschlossen" }] }; } };
    const r = await strategicSvc.zurueckziehen(pool, "req-1", "org-1", "u-actor");
    assert.equal(r.row.status, "abgeschlossen");
    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /SET status = 'abgeschlossen'/);
    assert.match(calls[0].sql, /WHERE id = \$1\s+AND requester_org_id = \$2\s+AND status = ANY\(\$4::text\[\]\)/);
    assert.ok(!/target_org_id = \$2/.test(calls[0].sql), "die angefragte Firma darf nicht zurueckziehen");
    assert.deepEqual(calls[0].params, ["req-1", "org-1", "u-actor", ["eingegangen", "rueckfrage_offen", "angebot_erstellt"]]);
  });

  it("zurueckziehen: fremd = NICHT_GEFUNDEN, angefragte Firma = NUR_ANFRAGENDE_FIRMA, aktiviert = NICHT_MEHR_ZURUECKZIEHBAR", async () => {
    const mit = (zweite) => {
      const calls = [];
      let n = 0;
      return { calls, query: async (sql, params) => { calls.push({ sql, params }); n += 1; return n === 1 ? { rows: [] } : { rows: zweite }; } };
    };
    const fremd = mit([]);
    assert.deepEqual(await strategicSvc.zurueckziehen(fremd, "req-1", "org-x", "u"), { fehler: "NICHT_GEFUNDEN" });
    assert.match(fremd.calls[1].sql, /requester_org_id = \$2 OR target_org_id = \$2/, "nur innerhalb der eigenen Beteiligung nachsehen");
    assert.deepEqual(fremd.calls[1].params, ["req-1", "org-x"]);

    assert.equal((await strategicSvc.zurueckziehen(mit([{ status: "eingegangen", ist_anfragende: false }]), "r", "o", "u")).fehler, "NUR_ANFRAGENDE_FIRMA");
    const spaet = await strategicSvc.zurueckziehen(mit([{ status: "aktiviert", ist_anfragende: true }]), "r", "o", "u");
    assert.equal(spaet.fehler, "NICHT_MEHR_ZURUECKZIEHBAR");
    assert.equal(spaet.status, "aktiviert");
  });

  it("es gibt keinen Weg mehr, mit dem ein Kunde einen beliebigen Status setzt", () => {
    assert.equal(strategicSvc.updateStatus, undefined);
    assert.ok(!strategicSvc.ZURUECKZIEHBAR.includes("aktiviert"));
    assert.ok(!strategicSvc.ZURUECKZIEHBAR.includes("abgeschlossen"));
  });

  it("listAllRequestsAdmin returns paginated items with total and bounded count query", async () => {
    const pool = sequencePool({ rows: [{ id: "req-1" }] }, { rows: [{ total: 3 }] });
    const result = await strategicSvc.listAllRequestsAdmin(pool, { limit: 10, offset: 0, status: "eingegangen" });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].id, "req-1");
    assert.equal(result.total, 3);
    assert.ok(pool.calls[0].sql.includes("strategic_collaboration_requests"));
    assert.match(pool.calls[1].sql, /COUNT\(\*\)::int AS total/);
    assert.deepEqual(pool.calls[1].params, ["eingegangen"]);
  });

  it("updateStatusAsAdmin updates request status", async () => {
    const pool = {
      query: async () => ({ rows: [{ id: "req-1", status: "bestaetigt" }] })
    };
    const row = await strategicSvc.updateStatusAsAdmin(pool, "req-1", "bestaetigt", "u-actor");
    assert.equal(row.id, "req-1");
    assert.equal(row.status, "bestaetigt");
  });

  it("assignRequestAsAdmin sets assignee", async () => {
    const pool = {
      query: async () => ({ rows: [{ id: "req-1", assigned_to_user_id: "u-2" }] })
    };
    const row = await strategicSvc.assignRequestAsAdmin(pool, "req-1", "u-2", "u-actor");
    assert.equal(row.id, "req-1");
    assert.equal(row.assigned_to_user_id, "u-2");
  });

  it("updateOpsNotesAsAdmin updates ops notes", async () => {
    const pool = {
      query: async () => ({ rows: [{ id: "req-1", ops_notes: "notiz" }] })
    };
    const row = await strategicSvc.updateOpsNotesAsAdmin(pool, "req-1", "notiz");
    assert.equal(row.id, "req-1");
    assert.equal(row.ops_notes, "notiz");
  });
});

