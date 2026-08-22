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

describe("replaceAssignmentWorker — der Ersatz wird GEFRAGT, nicht gebunden (8.2)", () => {
  /*
   * BEFUND 2026-08-21: Es gab ZWEI Wege, denselben Einsatz zu besetzen, und nur
   * einer fragte den Menschen, den er besetzt.
   *
   *   quick-assign   legt `pending_confirmation` an und benachrichtigt zur Zusage
   *   replace        legte `auto_confirmed` an — eine Absage war damit nicht
   *                  bloss unueblich, sondern UNMOEGLICH: `declineAssignment`
   *                  verlangt ausdruecklich `pending_confirmation` und haette
   *                  den Link abgewiesen.
   *
   * Owner-Vorgabe (Plan I, 8.2): "Eine Zuweisung, die der Zugewiesene nicht
   * bestaetigt hat, ist eine Absichtserklaerung, keine Besetzung."
   */

  it("legt den Ersatz-Link als pending_confirmation an, nicht als auto_confirmed", async () => {
    const pool = fakePool([
      { rows: [], rowCount: 0 },
      { rows: [origLinkRow()], rowCount: 1 },
      { rows: [{ user_id: REPLACEMENT, is_active: true }], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [origLinkRow({ is_active: false, worker_confirmation_status: "worker_unavailable" })], rowCount: 1 },
      { rows: [{ id: "new-link", worker_user_id: REPLACEMENT, assignment_id: ASG }], rowCount: 1 },
      { rows: [], rowCount: 0 }
    ]);

    await replaceAssignmentWorker(pool, {
      linkId: LINK, supplierOrgId: ORG, replacementWorkerUserId: REPLACEMENT,
      effectiveDate: "2026-08-10", reason: "Krankmeldung", createdBy: "chef-1"
    });

    const insert = pool.calls.map((c) => c.sql).find((q) => q.includes("INSERT INTO worker_assignment_links"));
    assert.ok(insert, "das INSERT muss laufen");
    assert.ok(insert.includes("'pending_confirmation'"),
      "der Ersatz muss zusagen koennen — sonst ist die Zuweisung eine Absichtserklaerung");
    assert.ok(!insert.includes("'auto_confirmed'"),
      "auto_confirmed bindet den Ersatz ungefragt und macht declineAssignment unmoeglich");
  });

  it("traegt ein, WESSEN Ersatz es ist — sonst kann die Kundenmeldung nicht warten", async () => {
    /*
     * `ersetzt_link_id` (Migration 188) traegt den Zusammenhang in die Daten.
     * Ohne ihn lebte er nur im Ablauf der Route — und die Kundenmeldung "Ersatz
     * gestellt" kann erst bei der ZUSAGE rausgehen, nicht schon beim Zuweisen
     * (Gate aus Welle G4b: erst nach echter Neubesetzung).
     */
    const pool = fakePool([
      { rows: [], rowCount: 0 },
      { rows: [origLinkRow()], rowCount: 1 },
      { rows: [{ user_id: REPLACEMENT, is_active: true }], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [origLinkRow({ is_active: false, worker_confirmation_status: "worker_unavailable" })], rowCount: 1 },
      { rows: [{ id: "new-link", worker_user_id: REPLACEMENT, assignment_id: ASG }], rowCount: 1 },
      { rows: [], rowCount: 0 }
    ]);

    await replaceAssignmentWorker(pool, {
      linkId: LINK, supplierOrgId: ORG, replacementWorkerUserId: REPLACEMENT,
      effectiveDate: "2026-08-10", reason: "Krankmeldung", createdBy: "chef-1"
    });

    const aufruf = pool.calls.find((c) => c.sql.includes("INSERT INTO worker_assignment_links"));
    assert.ok(aufruf.sql.includes("ersetzt_link_id"), "die Spalte muss geschrieben werden");
    assert.ok((aufruf.params || []).includes(LINK),
      "es muss der Link des AUSGEFALLENEN sein — sonst zeigt der Zusammenhang ins Leere");
  });

  it("setzt eine fruehere Absage zurueck, wenn derselbe Mensch erneut gefragt wird", async () => {
    /*
     * Der ON-CONFLICT-Zweig. Wer einmal abgelehnt hat, traegt `worker_declined_at`
     * und einen Grund. Wird er spaeter erneut angefragt, muessen diese Spuren
     * weg — sonst steht an einer offenen Anfrage eine alte Absage, und niemand
     * weiss, welche gilt.
     */
    const pool = fakePool([
      { rows: [], rowCount: 0 },
      { rows: [origLinkRow()], rowCount: 1 },
      { rows: [{ user_id: REPLACEMENT, is_active: true }], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [origLinkRow({ is_active: false })], rowCount: 1 },
      { rows: [{ id: "new-link", worker_user_id: REPLACEMENT, assignment_id: ASG }], rowCount: 1 },
      { rows: [], rowCount: 0 }
    ]);

    await replaceAssignmentWorker(pool, {
      linkId: LINK, supplierOrgId: ORG, replacementWorkerUserId: REPLACEMENT,
      effectiveDate: "2026-08-10", reason: "Krankmeldung", createdBy: "chef-1"
    });

    const insert = pool.calls.map((c) => c.sql).find((q) => q.includes("ON CONFLICT"));
    assert.ok(insert, "der ON-CONFLICT-Zweig muss existieren");
    assert.ok(/worker_declined_at\s*=\s*NULL/.test(insert), "alte Absage-Zeit muss geloescht werden");
    assert.ok(/worker_declined_reason\s*=\s*NULL/.test(insert), "alter Absage-Grund muss geloescht werden");
    assert.ok(/worker_confirmed_at\s*=\s*NULL/.test(insert), "alte Zusage-Zeit muss geloescht werden");
  });
});

describe("replaceAssignmentWorker — Happy Path", () => {
  it("stellt A frei, legt Ersatz-Link ab Wirk-Datum an und committet", async () => {
    const pool = fakePool([
      { rows: [], rowCount: 0 },                                   // BEGIN
      { rows: [origLinkRow()], rowCount: 1 },                      // SELECT ... FOR UPDATE
      { rows: [{ user_id: REPLACEMENT, is_active: true }], rowCount: 1 }, // SELECT replacement profile
      { rows: [], rowCount: 0 },                                   // Kollisionsprüfung Ersatz: kein Konflikt
      { rows: [], rowCount: 0 },                                   // Sperrlisten-Prüfung Ersatz: nicht gesperrt
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

  it("SCHEDULE_CONFLICT: Ersatz hat im Zeitraum bereits einen überlappenden Einsatz", async () => {
    const pool = fakePool([
      { rows: [], rowCount: 0 },                                         // BEGIN
      { rows: [origLinkRow()], rowCount: 1 },                            // SELECT FOR UPDATE
      { rows: [{ user_id: REPLACEMENT, is_active: true }], rowCount: 1 },// SELECT replacement profile
      { rows: [{ id: "conflict-link" }], rowCount: 1 }                   // Kollisionsprüfung: Konflikt!
    ]);
    const r = await replaceAssignmentWorker(pool, {
      linkId: LINK, supplierOrgId: ORG, replacementWorkerUserId: REPLACEMENT,
      effectiveDate: "2026-08-10", reason: "Krankmeldung"
    });
    assert.equal(r.error, "SCHEDULE_CONFLICT");
    assert.deepEqual(r.conflicting_link_ids, ["conflict-link"]);
    assertRolledBackNoInsert(pool);
  });

  it("BLOCKED_BY_COMPANY: Ersatz ist beim Unternehmen gesperrt", async () => {
    const pool = fakePool([
      { rows: [], rowCount: 0 },                                          // BEGIN
      { rows: [origLinkRow()], rowCount: 1 },                             // SELECT FOR UPDATE
      { rows: [{ user_id: REPLACEMENT, is_active: true }], rowCount: 1 },// SELECT replacement profile
      { rows: [], rowCount: 0 },                                          // Kollisionsprüfung: kein Konflikt
      { rows: [{ id: "blk1", reason: "gesperrt", blocked_until: null }], rowCount: 1 } // Sperrliste: gesperrt!
    ]);
    const r = await replaceAssignmentWorker(pool, {
      linkId: LINK, supplierOrgId: ORG, replacementWorkerUserId: REPLACEMENT,
      effectiveDate: "2026-08-10", reason: "Krankmeldung"
    });
    assert.equal(r.error, "BLOCKED_BY_COMPANY");
    assertRolledBackNoInsert(pool);
  });
});
