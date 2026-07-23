/**
 * replaceAssignmentWorker — Unit Tests (P1.1 Ersatz bei Krankheit/Abbruch)
 *
 * DB-frei: mockt pool.connect()/client.query() und prüft die Transaktions-Sequenz
 * (BEGIN → SELECT FOR UPDATE → Validierung → UPDATE freistellen → INSERT Ersatz → COMMIT)
 * sowie alle Guard-Branches (NOT_FOUND / LINK_NOT_ACTIVE / SAME_WORKER / REPLACEMENT_NOT_IN_ORG),
 * die jeweils ROLLBACK auslösen und KEINEN INSERT ausführen.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { replaceAssignmentWorker } from "../services/workerService.js";

const AILING = "11111111-1111-1111-1111-111111111111";
const REPLACEMENT = "22222222-2222-2222-2222-222222222222";
const ORG = "33333333-3333-3333-3333-333333333333";
const LINK = "44444444-4444-4444-4444-444444444444";
const ASG = "55555555-5555-5555-5555-555555555555";

/**
 * Fake-Pool: connect() liefert einen Client, der Antworten der Reihe nach ausgibt
 * und jede Query (SQL + Params) aufzeichnet. pool.query() bedient den nach-COMMIT
 * recalcAssignmentStaffing-Aufruf (leer → recalc gibt null zurück, crash-frei).
 */
function fakePool(clientResponses) {
  const calls = [];
  let idx = 0;
  const client = {
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params: params || [] });
      const resp = clientResponses[idx] ?? { rows: [], rowCount: 0 };
      idx++;
      return resp;
    },
    release: () => {}
  };
  return {
    calls,
    connect: async () => client,
    query: async () => ({ rows: [], rowCount: 0 }) // recalcAssignmentStaffing → loadAssignmentContext leer
  };
}

const origLinkRow = (over = {}) => ({
  id: LINK, worker_user_id: AILING, assignment_id: ASG, org_id: ORG,
  supplier_org_id: ORG, role: "primary", is_active: true,
  worker_confirmation_status: "auto_confirmed",
  default_hours_per_day: 8, default_shift_start: "08:00", default_shift_end: "16:00",
  default_break_minutes: 30, start_date: "2026-08-01", end_date: "2026-08-31",
  notes: "Original", ...over
});

describe("replaceAssignmentWorker — Happy Path", () => {
  it("stellt A frei, legt Ersatz-Link ab Wirk-Datum an und committet", async () => {
    const pool = fakePool([
      { rows: [], rowCount: 0 },                                   // BEGIN
      { rows: [origLinkRow()], rowCount: 1 },                      // SELECT ... FOR UPDATE
      { rows: [{ user_id: REPLACEMENT, is_active: true }], rowCount: 1 }, // SELECT replacement profile
      { rows: [origLinkRow({ is_active: false, worker_confirmation_status: "worker_unavailable" })], rowCount: 1 }, // UPDATE freed
      { rows: [{ id: "new-link", worker_user_id: REPLACEMENT, assignment_id: ASG, start_date: "2026-08-10", end_date: "2026-08-31" }], rowCount: 1 }, // INSERT replacement
      { rows: [], rowCount: 0 }                                    // COMMIT
    ]);

    const result = await replaceAssignmentWorker(pool, {
      linkId: LINK, supplierOrgId: ORG, replacementWorkerUserId: REPLACEMENT,
      effectiveDate: "2026-08-10", reason: "Krankmeldung", createdBy: "chef-1"
    });

    assert.equal(result.error, undefined);
    assert.equal(result.ailing_worker_user_id, AILING);
    assert.ok(result.replacement_link);
    assert.equal(result.replacement_link.worker_user_id, REPLACEMENT);

    const sqls = pool.calls.map((c) => c.sql);
    assert.ok(sqls[0].includes("BEGIN"));
    assert.ok(/FOR UPDATE/.test(sqls[1]), "Original-Link mit Row-Lock geladen");
    assert.ok(sqls[sqls.length - 1].includes("COMMIT"), "Transaktion committet");
    assert.ok(!sqls.some((s) => s.includes("ROLLBACK")), "kein ROLLBACK im Happy Path");

    // UPDATE freistellen: setzt worker_unavailable + unavailable_from = Wirk-Datum
    const freeUpdate = pool.calls.find((c) => c.sql.includes("worker_unavailable") && c.sql.includes("UPDATE"));
    assert.ok(freeUpdate, "Freistellungs-UPDATE vorhanden");
    assert.equal(freeUpdate.params[1], "2026-08-10", "unavailable_from = Wirk-Datum");

    // INSERT Ersatz: start_date = Wirk-Datum ($10), end_date = Original-Enddatum ($11)
    const insert = pool.calls.find((c) => c.sql.includes("INSERT INTO worker_assignment_links"));
    assert.ok(insert, "Ersatz-INSERT vorhanden");
    assert.equal(insert.params[0], REPLACEMENT, "Ersatz-Arbeiter");
    assert.equal(insert.params[9], "2026-08-10", "start_date = Wirk-Datum");
    assert.equal(insert.params[10], "2026-08-31", "end_date = Original-Enddatum geerbt");
  });
});

describe("replaceAssignmentWorker — Guards (ROLLBACK, kein INSERT)", () => {
  const assertRolledBackNoInsert = (pool) => {
    const sqls = pool.calls.map((c) => c.sql);
    assert.ok(sqls.some((s) => s.includes("ROLLBACK")), "ROLLBACK ausgelöst");
    assert.ok(!sqls.some((s) => s.includes("INSERT INTO worker_assignment_links")), "kein Ersatz-INSERT");
    assert.ok(!sqls.some((s) => s.includes("COMMIT")), "kein COMMIT");
  };

  it("NOT_FOUND: Original-Link fehlt/fremde Org", async () => {
    const pool = fakePool([{ rows: [], rowCount: 0 }, { rows: [], rowCount: 0 }]); // BEGIN, SELECT→leer
    const r = await replaceAssignmentWorker(pool, {
      linkId: LINK, supplierOrgId: ORG, replacementWorkerUserId: REPLACEMENT,
      effectiveDate: "2026-08-10", reason: "x"
    });
    assert.equal(r.error, "NOT_FOUND");
    assertRolledBackNoInsert(pool);
  });

  it("LINK_NOT_ACTIVE: Einsatz nicht aktiv", async () => {
    const pool = fakePool([
      { rows: [], rowCount: 0 },
      { rows: [origLinkRow({ is_active: false })], rowCount: 1 }
    ]);
    const r = await replaceAssignmentWorker(pool, {
      linkId: LINK, supplierOrgId: ORG, replacementWorkerUserId: REPLACEMENT,
      effectiveDate: "2026-08-10", reason: "x"
    });
    assert.equal(r.error, "LINK_NOT_ACTIVE");
    assertRolledBackNoInsert(pool);
  });

  it("SAME_WORKER: Ersatz == Ausfallender", async () => {
    const pool = fakePool([
      { rows: [], rowCount: 0 },
      { rows: [origLinkRow()], rowCount: 1 }
    ]);
    const r = await replaceAssignmentWorker(pool, {
      linkId: LINK, supplierOrgId: ORG, replacementWorkerUserId: AILING, // == ailing
      effectiveDate: "2026-08-10", reason: "x"
    });
    assert.equal(r.error, "SAME_WORKER");
    assertRolledBackNoInsert(pool);
  });

  it("REPLACEMENT_NOT_IN_ORG: Ersatz gehört nicht zur Org", async () => {
    const pool = fakePool([
      { rows: [], rowCount: 0 },
      { rows: [origLinkRow()], rowCount: 1 },
      { rows: [], rowCount: 0 } // SELECT replacement profile → leer
    ]);
    const r = await replaceAssignmentWorker(pool, {
      linkId: LINK, supplierOrgId: ORG, replacementWorkerUserId: REPLACEMENT,
      effectiveDate: "2026-08-10", reason: "x"
    });
    assert.equal(r.error, "REPLACEMENT_NOT_IN_ORG");
    assertRolledBackNoInsert(pool);
  });
});
