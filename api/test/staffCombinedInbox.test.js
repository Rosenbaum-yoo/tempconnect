/**
 * Welle 8 Schritt 14 - Commercial Operations Inbox Tests.
 *
 * Pruefungen:
 *   1. listCombinedInbox vereint beide Quellen mit korrektem source_type
 *      und macht KEINE Daten-Vermischung.
 *   2. priority/summary_status werden konsistent abgeleitet
 *      (cancellation = high, INDIVIDUELL+open = high, age >= 5 Tage = high).
 *   3. Filter sourceType / summaryStatus / plan / email funktionieren.
 *   4. runBulkAction (assign / reject / to_under_review) delegiert
 *      an die richtigen Services und aggregiert Erfolge/Fehler.
 *   5. Reason-Validation (>= 10 Zeichen) + Limit (>100) werden hart abgelehnt.
 *   6. Frontend-Strukturchecks: staff/index.html mountet die neuen Sections,
 *      staffShell.js enthaelt Combined-Inbox-Loader, Konfig-Tab,
 *      Audit-Report-Loader, Document-Block.
 *   7. listStaffAudit: Filter actorId/entityId/since/until.
 *
 * Run: node --test --test-force-exit api/test/staffCombinedInbox.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SOURCE_TYPES, BULK_OP,
  listCombinedInbox, runBulkAction
} from "../services/staffCombinedInboxService.js";
import { listStaffAudit } from "../services/staffAuditService.js";

const __filename = fileURLToPath(import.meta.url);
// Docker: cwd=/app (api dir), no "api/" subdir → HAS_API_SUBDIR=false
// Outside Docker: cwd=project root, has "api/" subdir → HAS_API_SUBDIR=true
const ROOT = process.cwd();
const HAS_API_SUBDIR = existsSync(path.join(ROOT, "api"));

/* ── Pool-Mocks ───────────────────────────────────────────── */

function mkScrRow(overrides) {
  return Object.assign({
    id: "scr-1", status: "eingegangen", created_at: new Date().toISOString(), updated_at: null,
    contact_email: "lead@example.com", contact_name: "Lead",
    requester_company_name: "ACME GmbH",
    plan_requested: "INDIVIDUELL", request_type: "enterprise_config",
    source_context: "enterprise_config", org_id: null,
    monthly_estimate_cents: 249900, onetime_estimate_cents: null,
    seats_requested: 50, seats_included: 50
  }, overrides || {});
}
function mkSubRow(overrides) {
  return Object.assign({
    id: "sub-1", status: "submitted", created_at: new Date().toISOString(), updated_at: null, status_updated_at: null,
    request_type: "upgrade",
    contact_email: "owner@acme.de", contact_name: "Max",
    requester_company_name: "ACME GmbH", org_id: "o1",
    current_plan: "BASIS", desired_plan: "PRO",
    proposed_price_cents: 79900, proposed_term_months: 12,
    assigned_staff_id: null, org_name: "ACME GmbH"
  }, overrides || {});
}
function poolReturning(scrRows, subRows) {
  let scrCalled = false;
  let subCalled = false;
  return {
    query: async (sql) => {
      if (/strategic_collaboration_requests/i.test(String(sql))) {
        scrCalled = true;
        return { rows: scrRows };
      }
      if (/subscription_requests/i.test(String(sql))) {
        subCalled = true;
        return { rows: subRows };
      }
      return { rows: [] };
    },
    _stats: () => ({ scrCalled, subCalled })
  };
}

/* ────────────────────────────────────────────────────────────── *
 * 1. listCombinedInbox                                           *
 * ────────────────────────────────────────────────────────────── */

describe("staffCombinedInboxService.listCombinedInbox", () => {
  it("vereint beide Quellen mit korrektem source_type", async () => {
    const pool = poolReturning(
      [mkScrRow({ id: "scr-A", plan_requested: "INDIVIDUELL" })],
      [mkSubRow({ id: "sub-B", request_type: "upgrade" })]
    );
    const r = await listCombinedInbox(pool);
    assert.equal(r.items.length, 2);
    const sources = r.items.map((i) => i.source_type);
    assert.ok(sources.includes("enterprise_request"));
    assert.ok(sources.includes("subscription_upgrade"));
    assert.equal(r.totals.total, 2);
  });

  it("Source-Type-Filter sourceType=enterprise_request laedt nur SCR", async () => {
    const pool = poolReturning([mkScrRow()], []);
    const r = await listCombinedInbox(pool, { sourceType: "enterprise_request" });
    assert.equal(r.items.length, 1);
    assert.equal(r.items[0].source_type, "enterprise_request");
    // Kein subscription_requests-Query soll gefeuert werden
    assert.equal(pool._stats().subCalled, false);
  });

  it("Source-Type-Filter sourceType=subscription_upgrade filtert auf request_type=upgrade", async () => {
    const pool = poolReturning([], [mkSubRow({ request_type: "upgrade" })]);
    const r = await listCombinedInbox(pool, { sourceType: "subscription_upgrade" });
    assert.equal(r.items.length, 1);
    assert.equal(r.items[0].source_type, "subscription_upgrade");
    assert.equal(pool._stats().scrCalled, false);
  });

  it("priority=high fuer cancellation, normal fuer Standard-Upgrade jung, high INDIVIDUELL+open", async () => {
    const pool = poolReturning(
      [mkScrRow({ id: "scr-1", plan_requested: "INDIVIDUELL", status: "eingegangen" })],
      [
        mkSubRow({ id: "sub-cancel", request_type: "cancellation" }),
        mkSubRow({ id: "sub-up", request_type: "upgrade", desired_plan: "PRO" })
      ]
    );
    const r = await listCombinedInbox(pool);
    const cancel = r.items.find((i) => i.id === "sub-cancel");
    const upgrade = r.items.find((i) => i.id === "sub-up");
    const indiv = r.items.find((i) => i.id === "scr-1");
    assert.equal(cancel.priority, "high", "cancellation muss high sein");
    assert.equal(upgrade.priority, "normal", "junges PRO-Upgrade ist normal");
    assert.equal(indiv.priority, "high", "INDIVIDUELL+open ist high");
  });

  it("priority=high fuer offene Requests aelter als 5 Tage", async () => {
    const old = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const pool = poolReturning(
      [],
      [mkSubRow({ id: "sub-old", request_type: "upgrade", desired_plan: "PRO", created_at: old, status: "submitted" })]
    );
    const r = await listCombinedInbox(pool);
    assert.equal(r.items[0].priority, "high");
  });

  it("summary_status=closed bei rejected/cancelled/expired/active", async () => {
    const pool = poolReturning(
      [],
      [
        mkSubRow({ id: "sub-1", status: "rejected" }),
        mkSubRow({ id: "sub-2", status: "active" })
      ]
    );
    const r = await listCombinedInbox(pool);
    assert.ok(r.items.every((i) => i.summary_status === "closed"));
  });

  it("Filter summaryStatus=open blendet closed aus", async () => {
    const pool = poolReturning(
      [],
      [
        mkSubRow({ id: "open", status: "submitted" }),
        mkSubRow({ id: "closed", status: "active" })
      ]
    );
    const r = await listCombinedInbox(pool, { summaryStatus: "open" });
    assert.equal(r.items.length, 1);
    assert.equal(r.items[0].id, "open");
  });

  it("Sortierung: high-priority zuerst, dann updated_at desc", async () => {
    const recent = new Date().toISOString();
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const pool = poolReturning(
      [],
      [
        mkSubRow({ id: "normal-recent", request_type: "upgrade", desired_plan: "PRO", created_at: recent, updated_at: recent }),
        mkSubRow({ id: "high-old", request_type: "cancellation", created_at: old, updated_at: old })
      ]
    );
    const r = await listCombinedInbox(pool);
    assert.equal(r.items[0].id, "high-old");
  });

  it("Source-Type-Pills im totals.by_source", async () => {
    const pool = poolReturning(
      [mkScrRow()],
      [mkSubRow({ request_type: "cancellation" })]
    );
    const r = await listCombinedInbox(pool);
    assert.equal(r.totals.by_source.enterprise_request, 1);
    assert.equal(r.totals.by_source.subscription_cancellation, 1);
  });

  it("Daten-Vermischung: SCR-Items behalten plan_requested-Feld, Sub-Items haben desired_plan/current_plan", async () => {
    const pool = poolReturning(
      [mkScrRow({ id: "scr", plan_requested: "INDIVIDUELL" })],
      [mkSubRow({ id: "sub", current_plan: "BASIS", desired_plan: "PRO" })]
    );
    const r = await listCombinedInbox(pool);
    const scr = r.items.find((i) => i.id === "scr");
    const sub = r.items.find((i) => i.id === "sub");
    assert.ok(scr.monthly_estimate_cents != null, "SCR hat monthly_estimate_cents");
    assert.equal(scr.current_plan, undefined, "SCR darf KEIN current_plan-Feld haben");
    assert.equal(sub.monthly_estimate_cents, undefined, "Sub darf KEIN monthly_estimate_cents-Feld haben");
    assert.equal(sub.current_plan, "BASIS");
    assert.equal(sub.desired_plan, "PRO");
  });
});

/* ────────────────────────────────────────────────────────────── *
 * 2. runBulkAction                                               *
 * ────────────────────────────────────────────────────────────── */

describe("staffCombinedInboxService.runBulkAction", () => {
  function makeBulkPool(handlers) {
    const calls = [];
    return {
      calls,
      query: async (sql, params) => {
        calls.push({ sql, params });
        for (const [pattern, response] of handlers) {
          if (pattern.test(String(sql))) {
            if (typeof response === "function") return response(sql, params);
            return response;
          }
        }
        return { rows: [] };
      }
    };
  }

  it("EMPTY_ITEMS bei leerer Liste", async () => {
    const pool = makeBulkPool([]);
    const r = await runBulkAction(pool, { actorUserId: "u1", reason: "12345678901", operation: "assign", items: [] });
    assert.equal(r.error, "EMPTY_ITEMS");
    assert.equal(r.ok, false);
  });

  it("REASON_TOO_SHORT < 10 Zeichen", async () => {
    const pool = makeBulkPool([]);
    const r = await runBulkAction(pool, {
      actorUserId: "u1", reason: "kurz", operation: "assign",
      items: [{ id: "x", source_type: "enterprise_request" }],
      assigneeId: "a1"
    });
    assert.equal(r.error, "REASON_TOO_SHORT");
  });

  it("UNSUPPORTED_OPERATION", async () => {
    const pool = makeBulkPool([]);
    const r = await runBulkAction(pool, {
      actorUserId: "u1", reason: "Bulk-Reject von Spam-Items",
      operation: "delete_everything",
      items: [{ id: "x", source_type: "enterprise_request" }]
    });
    assert.equal(r.error, "UNSUPPORTED_OPERATION");
  });

  it("BULK_LIMIT_EXCEEDED bei >100 Items", async () => {
    const pool = makeBulkPool([]);
    const items = [];
    for (let i = 0; i < 101; i++) items.push({ id: "x" + i, source_type: "enterprise_request" });
    const r = await runBulkAction(pool, {
      actorUserId: "u1", reason: "Bulk-Reject von Spam-Items",
      operation: "reject_with_reason", items
    });
    assert.equal(r.error, "BULK_LIMIT_EXCEEDED");
  });

  it("Bulk reject_with_reason auf SCR setzt Status auf 'abgelehnt'", async () => {
    const pool = makeBulkPool([
      [/SELECT id, status FROM strategic_collaboration_requests/i, { rows: [{ id: "scr-1", status: "eingegangen" }] }],
      [/UPDATE strategic_collaboration_requests/i, { rows: [{ id: "scr-1", status: "abgelehnt", updated_at: new Date() }] }],
      [/INSERT INTO staff_customer_request_messages/i, { rows: [{}] }]
    ]);
    const r = await runBulkAction(pool, {
      actorUserId: "staff-1", reason: "Bulk-Reject Spam-Submissions",
      operation: "reject_with_reason",
      items: [{ id: "scr-1", source_type: "enterprise_request" }]
    });
    assert.equal(r.ok, true);
    assert.equal(r.processed, 1);
    assert.equal(r.success.length, 1);
    assert.equal(r.success[0].action, "rejected");
  });

  it("Bulk to_under_review auf subscription_request transitioniert auf under_review", async () => {
    const pool = makeBulkPool([
      [/SELECT .+ FROM subscription_requests WHERE id/i, { rows: [{ id: "sub-1", status: "submitted", request_type: "upgrade" }] }],
      [/UPDATE subscription_requests/i, { rows: [{ id: "sub-1", status: "under_review" }] }],
      [/INSERT INTO subscription_request_status_history/i, { rows: [{}] }]
    ]);
    const r = await runBulkAction(pool, {
      actorUserId: "staff-1", reason: "Bulk-Review zur Pruefung",
      operation: "to_under_review",
      items: [{ id: "sub-1", source_type: "subscription_upgrade" }]
    });
    assert.equal(r.ok, true);
    assert.equal(r.success[0].action, "to_under_review");
  });

  it("Bulk assign benoetigt assigneeId", async () => {
    const pool = makeBulkPool([
      [/SELECT id FROM strategic_collaboration_requests/i, { rows: [{ id: "scr-1" }] }]
    ]);
    const r = await runBulkAction(pool, {
      actorUserId: "staff-1", reason: "Bulk-Zuweisung an Account-Manager",
      operation: "assign",
      items: [{ id: "scr-1", source_type: "enterprise_request" }]
    });
    assert.equal(r.ok, false);
    assert.equal(r.failed[0].error, "MISSING_ASSIGNEE");
  });

  it("Bulk-Mix: erfolgreiche und fehlgeschlagene Items werden separat aggregiert", async () => {
    const pool = makeBulkPool([
      [/SELECT id, status FROM strategic_collaboration_requests/i, () => ({ rows: [{ id: "scr-A", status: "eingegangen" }] })],
      [/UPDATE strategic_collaboration_requests/i, { rows: [{ id: "scr-A", status: "abgelehnt" }] }],
      [/INSERT INTO staff_customer_request_messages/i, { rows: [{}] }],
      [/SELECT \* FROM subscription_requests WHERE id/i, { rows: [] }] // not found
    ]);
    const r = await runBulkAction(pool, {
      actorUserId: "staff-1", reason: "Bulk-Reject 2 Items",
      operation: "reject_with_reason",
      items: [
        { id: "scr-A", source_type: "enterprise_request" },
        { id: "missing", source_type: "subscription_upgrade" }
      ]
    });
    assert.equal(r.ok, false);
    assert.equal(r.success.length, 1);
    assert.equal(r.failed.length, 1);
    assert.equal(r.failed[0].error, "REQUEST_NOT_FOUND");
  });

  it("UNSUPPORTED_SOURCE_TYPE blockiert unbekannte Quellen", async () => {
    const pool = makeBulkPool([]);
    const r = await runBulkAction(pool, {
      actorUserId: "staff-1", reason: "Bulk-Test mit fremder Quelle",
      operation: "reject_with_reason",
      items: [{ id: "x", source_type: "alien_source" }]
    });
    assert.equal(r.failed[0].error, "UNSUPPORTED_SOURCE_TYPE");
  });
});

/* ────────────────────────────────────────────────────────────── *
 * 3. listStaffAudit Filter                                       *
 * ────────────────────────────────────────────────────────────── */

describe("staffAuditService.listStaffAudit Filter (Welle 8/14)", () => {
  it("filtert auf actorId/entityId/since/until", async () => {
    let captured;
    const pool = {
      query: async (sql, params) => { captured = { sql, params }; return { rows: [] }; }
    };
    await listStaffAudit(pool, {
      area: "commercial_inbox",
      actorId: "actor-1", entityId: "ent-1", entityType: "bulk_inbox",
      since: "2026-01-01", until: "2026-12-31",
      riskLevel: "medium",
      limit: 50, offset: 0
    });
    const sqlText = String(captured.sql);
    assert.match(sqlText, /actor_id = \$\d+/);
    assert.match(sqlText, /entity_id = \$\d+/);
    assert.match(sqlText, /entity_type = \$\d+/);
    assert.match(sqlText, /created_at >= \$\d+/);
    assert.match(sqlText, /created_at <= \$\d+/);
    assert.ok(captured.params.includes("actor-1"));
    assert.ok(captured.params.includes("2026-01-01"));
  });

  it("ohne Filter: kein WHERE-Block", async () => {
    let captured;
    const pool = {
      query: async (sql, params) => { captured = { sql, params }; return { rows: [] }; }
    };
    await listStaffAudit(pool, {});
    assert.ok(!/WHERE/.test(String(captured.sql)));
  });
});

/* ────────────────────────────────────────────────────────────── *
 * 4. Frontend-Strukturchecks                                     *
 * ────────────────────────────────────────────────────────────── */

function resolvePath(rel) {
  // Docker: cwd is already api dir, strip "api/" prefix; frontend/ not mounted (skipped separately)
  if (!HAS_API_SUBDIR) return path.join(ROOT, rel.replace(/^api\//, ""));
  return path.join(ROOT, rel);
}
function readFile(rel) { return readFileSync(resolvePath(rel), "utf8"); }

// Frontend staff files only available outside Docker (where project root is cwd)
const FRONTEND_STAFF_AVAILABLE = HAS_API_SUBDIR && existsSync(path.join(ROOT, "frontend/public/staff/js/staffShell.js"));
const frontendSuite = FRONTEND_STAFF_AVAILABLE ? describe : describe.skip;

frontendSuite("Staff-Frontend Strukturchecks (Welle 8/14)", () => {
  it("staff/index.html mountet commercial-inbox + audit-report Sections", () => {
    const html = readFile("frontend/public/staff/index.html");
    assert.ok(/data-section="commercial-inbox"/.test(html), "commercial-inbox Section fehlt");
    assert.ok(/data-section="audit-report"/.test(html), "audit-report Section fehlt");
    assert.ok(/data-section="customer-requests"/.test(html));
    assert.ok(/data-section="subscription-requests"/.test(html));
  });

  it("staffShell.js: AREAS hat commercial-inbox als Erstes Item", () => {
    const js = readFile("frontend/public/staff/js/staffShell.js");
    assert.ok(/key:\s*"commercial-inbox"/.test(js), "commercial-inbox Area fehlt in AREAS");
    assert.ok(/key:\s*"audit-report"/.test(js), "audit-report Area fehlt in AREAS");
    assert.ok(/loadCommercialInbox/.test(js), "loadCommercialInbox-Loader fehlt");
    assert.ok(/loadAuditReport/.test(js), "loadAuditReport-Loader fehlt");
  });

  it("staffShell.js: Konfigurations-Tab im Customer-Detail", () => {
    const js = readFile("frontend/public/staff/js/staffShell.js");
    assert.ok(/renderConfigTab/.test(js), "renderConfigTab fehlt");
    assert.ok(/data-cr-tab="config"/.test(js), "config-Tab-Button fehlt");
    assert.ok(/data-cr-tab="thread"/.test(js), "thread-Tab-Button fehlt");
    // Konfig-Tab zeigt die Pflichtfelder
    assert.ok(/plan_requested/.test(js));
    assert.ok(/selected_addons/.test(js));
    assert.ok(/monthly_estimate_cents/.test(js));
    assert.ok(/seats_requested/.test(js));
    assert.ok(/strategic_collaboration_interest|interest_strategic_cooperation/.test(js));
  });

  it("staffShell.js: Default-Filter enterprise_config + Plan/Source-Spalten", () => {
    const js = readFile("frontend/public/staff/js/staffShell.js");
    assert.ok(/typeFilter:\s*"enterprise_config"/.test(js));
    assert.ok(/data-cr-type="enterprise_config"/.test(js));
    assert.ok(/Plan: '/.test(js), "Plan-Spalte muss gerendert werden");
    assert.ok(/sourceLabel/.test(js), "Source-Spalte muss gerendert werden");
    assert.ok(/priorityFromStatus|priority/.test(js), "Priority-Spalte muss gerendert werden");
  });

  it("staffShell.js: Subscription-Detail enthaelt renderSubDocumentsBlock + Erzeugen + Download", () => {
    const js = readFile("frontend/public/staff/js/staffShell.js");
    assert.ok(/renderSubDocumentsBlock/.test(js));
    assert.ok(/sub-doc-create/.test(js));
    assert.ok(/subscription-documents.*download/.test(js));
    // Pflichtfelder fuer Subscription-Detail bleiben
    assert.ok(/proposed_price_cents|sub-price/.test(js));
    assert.ok(/proposed_term_months|sub-term/.test(js));
    assert.ok(/expected_start_date|sub-start/.test(js));
  });

  it("staffShell.js: Saved-Filters via localStorage", () => {
    const js = readFile("frontend/public/staff/js/staffShell.js");
    assert.ok(/scc\.savedFilters\.v1/.test(js));
    assert.ok(/loadSavedFilters/.test(js));
    assert.ok(/persistSavedFilters/.test(js));
  });

  it("staffShell.js: Bulk-Toolbar + sichere Bulk-Operationen", () => {
    const js = readFile("frontend/public/staff/js/staffShell.js");
    assert.ok(/runCommercialBulk/.test(js));
    assert.ok(/reject_with_reason/.test(js));
    assert.ok(/to_under_review/.test(js));
    // Aktivierung darf NICHT bulk-faehig sein
    assert.ok(!/bulk-activate|bulkActivate/.test(js), "Aktivierungen duerfen NIEMALS bulk-faehig sein");
  });

  it("staffShell.js: Source-Pills im commercial-inbox", () => {
    const js = readFile("frontend/public/staff/js/staffShell.js");
    assert.ok(/SOURCE_PILL_LABEL/.test(js));
    assert.ok(/Enterprise Request/.test(js));
    assert.ok(/Cancellation/.test(js));
    assert.ok(/Upgrade/.test(js));
    assert.ok(/Pilot/.test(js));
  });

  it("staffControlCenter.js: neue /inbox + /inbox/bulk + /audit Routen sind verbunden", () => {
    const js = readFile("api/routes/staffControlCenter.js");
    assert.ok(/router\.get\("\/inbox"/.test(js));
    assert.ok(/router\.post\("\/inbox\/bulk"/.test(js));
    assert.ok(/router\.get\("\/inbox\/meta"/.test(js));
    assert.ok(/router\.get\("\/audit"/.test(js));
    // Bulk muss requireConfirmAndReason haben
    const bulkBlock = js.split('router.post("/inbox/bulk"')[1].slice(0, 200);
    assert.ok(/requireStepUp/.test(bulkBlock));
    assert.ok(/requireConfirmAndReason/.test(bulkBlock));
  });

  it("staffControlCenter.js: keine bulk-Aktivierungs-Route eingefuehrt", () => {
    const js = readFile("api/routes/staffControlCenter.js");
    // Es darf KEINE Route /inbox/bulk-activate / .../bulk/activate o.ae. geben
    assert.ok(!/bulk-activate|bulk\/activate|bulkActivate/.test(js));
  });
});

/* ────────────────────────────────────────────────────────────── *
 * 5. Symbol-Sanity                                                *
 * ────────────────────────────────────────────────────────────── */

describe("SOURCE_TYPES + BULK_OP Konstanten", () => {
  it("SOURCE_TYPES enthaelt genau 6 kanonische Source-Types", () => {
    const keys = Object.keys(SOURCE_TYPES);
    assert.equal(keys.length, 6);
    assert.ok(keys.includes("ENTERPRISE_REQUEST"));
    assert.ok(keys.includes("SUBSCRIPTION_CANCELLATION"));
  });
  it("BULK_OP enthaelt assign/reject/to_under_review (KEINE activate)", () => {
    const ops = Object.values(BULK_OP);
    assert.equal(ops.length, 3);
    assert.ok(ops.includes("assign"));
    assert.ok(ops.includes("reject_with_reason"));
    assert.ok(ops.includes("to_under_review"));
    assert.ok(!ops.includes("activate"));
  });
});
