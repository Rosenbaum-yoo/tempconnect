/**
 * Operational Invoice Service unit tests.
 * Covers: generateFromTimesheets, listOperationalInvoices, getInvoiceKpis,
 *         getBillableTimesheets, transitionInvoice, addCorrectionItem,
 *         exportOperationalInvoiceCsv.
 *
 * Run: node --test --test-force-exit test/operationalInvoice.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateFromTimesheets,
  getOperationalInvoice,
  listOperationalInvoices,
  getInvoiceKpis,
  getBillableTimesheets,
  addCorrectionItem,
  transitionInvoice,
  exportOperationalInvoiceCsv
} from "../services/operationalInvoiceService.js";

// ── Mock helpers ──────────────────────────────────────

function mockPool(queryFn) {
  return { query: queryFn };
}

function returnPool(rows = []) {
  return mockPool(async () => ({ rows }));
}

/** Pool that supports connect() for transactions */
function transactionPool(clientResponses) {
  let idx = 0;
  const client = {
    query: async (sql) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
      if (idx >= clientResponses.length) return { rows: [] };
      const resp = clientResponses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    },
    release: () => {}
  };
  let mainIdx = 0;
  const mainResponses = [];
  return {
    connect: async () => client,
    query: async (sql, params) => {
      // Assignment lookup
      if (sql.includes("FROM assignments a") && sql.includes("WHERE a.id")) {
        return { rows: [{ id: "asg-1", org_id: "org-1", supplier_org_id: "sup-1", hourly_rate_cents: 2500, worker_description: "CNC-Operator", status: "active", buyer_org_name: "Corp A" }] };
      }
      // Timesheets lookup
      if (sql.includes("FROM timesheets") && sql.includes("ANY")) {
        return { rows: [
          { id: "ts-1", assignment_id: "asg-1", status: "approved", invoice_id: null, total_hours: 40, overtime_hours: 5, worker_name: "Max Mueller", week_start: "2026-03-03", week_end: "2026-03-07" },
          { id: "ts-2", assignment_id: "asg-1", status: "approved", invoice_id: null, total_hours: 38, overtime_hours: 0, worker_name: "Max Mueller", week_start: "2026-03-10", week_end: "2026-03-14" }
        ]};
      }
      // Audit write (no-op)
      if (sql.includes("audit")) return { rows: [] };
      return { rows: [] };
    },
    _clientResponses: clientResponses,
    _setClientResponses: (r) => { clientResponses.splice(0, clientResponses.length, ...r); idx = 0; }
  };
}

// ═══════════════════════════════════════════════════════
// generateFromTimesheets
// ═══════════════════════════════════════════════════════

describe("operationalInvoiceService — generateFromTimesheets", () => {
  it("rejects empty timesheetIds", async () => {
    const pool = returnPool([]);
    const result = await generateFromTimesheets(pool, { orgId: "org-1", assignmentId: "asg-1", timesheetIds: [], actorId: "u-1" });
    assert.strictEqual(result.error, "NO_TIMESHEETS");
  });

  it("rejects when assignment not found", async () => {
    const pool = returnPool([]);
    const result = await generateFromTimesheets(pool, { orgId: "org-1", assignmentId: "asg-99", timesheetIds: ["ts-1"], actorId: "u-1" });
    assert.strictEqual(result.error, "ASSIGNMENT_NOT_FOUND");
  });

  it("rejects when assignment has no hourly rate", async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes("FROM assignments a")) return { rows: [{ id: "asg-1", org_id: "org-1", supplier_org_id: "sup-1", hourly_rate_cents: null }] };
      return { rows: [] };
    });
    const result = await generateFromTimesheets(pool, { orgId: "org-1", assignmentId: "asg-1", timesheetIds: ["ts-1"], actorId: "u-1" });
    assert.strictEqual(result.error, "NO_HOURLY_RATE");
  });

  it("rejects org boundary violation", async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes("FROM assignments a")) return { rows: [{ id: "asg-1", org_id: "org-other", supplier_org_id: "sup-other", hourly_rate_cents: 2500 }] };
      return { rows: [] };
    });
    const result = await generateFromTimesheets(pool, { orgId: "org-1", assignmentId: "asg-1", timesheetIds: ["ts-1"], actorId: "u-1" });
    assert.strictEqual(result.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("rejects timesheet not approved", async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes("FROM assignments a")) return { rows: [{ id: "asg-1", org_id: "org-1", supplier_org_id: "sup-1", hourly_rate_cents: 2500 }] };
      if (sql.includes("FROM timesheets") && sql.includes("ANY")) return { rows: [{ id: "ts-1", assignment_id: "asg-1", status: "submitted", invoice_id: null }] };
      return { rows: [] };
    });
    const result = await generateFromTimesheets(pool, { orgId: "org-1", assignmentId: "asg-1", timesheetIds: ["ts-1"], actorId: "u-1" });
    assert.strictEqual(result.error, "TIMESHEET_NOT_APPROVED");
  });

  it("rejects already-invoiced timesheet", async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes("FROM assignments a")) return { rows: [{ id: "asg-1", org_id: "org-1", supplier_org_id: "sup-1", hourly_rate_cents: 2500 }] };
      if (sql.includes("FROM timesheets") && sql.includes("ANY")) return { rows: [{ id: "ts-1", assignment_id: "asg-1", status: "approved", invoice_id: "inv-existing" }] };
      return { rows: [] };
    });
    const result = await generateFromTimesheets(pool, { orgId: "org-1", assignmentId: "asg-1", timesheetIds: ["ts-1"], actorId: "u-1" });
    assert.strictEqual(result.error, "TIMESHEET_ALREADY_INVOICED");
  });

  it("calculates correct amounts with overtime surcharge", async () => {
    const clientResponses = [
      { rows: [{ seq: "42" }] },     // nextInvoiceNumber
      { rows: [{ id: "inv-new", invoice_number: "TC-2026-000042", status: "draft" }] }, // INSERT invoice
      { rows: [] }, // INSERT item 1 (regular ts-1)
      { rows: [] }, // INSERT item 2 (overtime ts-1)
      { rows: [] }, // INSERT item 3 (regular ts-2)
      { rows: [] }, // UPDATE timesheets
    ];
    const pool = transactionPool(clientResponses);

    const result = await generateFromTimesheets(pool, {
      orgId: "org-1",
      assignmentId: "asg-1",
      timesheetIds: ["ts-1", "ts-2"],
      actorId: "u-1"
    });

    assert.ok(result.invoice, "Should return invoice");
    assert.ok(result.items.length >= 3, "Should have at least 3 line items (2 regular + 1 overtime)");

    // ts-1: 35h regular × 2500 = 87500 + 5h OT × 2500 × 1.25 = 15625 → 103125
    // ts-2: 38h regular × 2500 = 95000
    // Total net: 198125
    const regularItems = result.items.filter(i => i.itemType === "timesheet_regular");
    const overtimeItems = result.items.filter(i => i.itemType === "timesheet_overtime");
    assert.strictEqual(regularItems.length, 2);
    assert.strictEqual(overtimeItems.length, 1);

    // ts-1 regular: (40 - 5) = 35h × 2500 = 87500
    assert.strictEqual(regularItems[0].totalCents, 87500);
    // ts-1 overtime: 5h × 2500 × 1.25 = 15625
    assert.strictEqual(overtimeItems[0].totalCents, 15625);
    // ts-2 regular: 38h × 2500 = 95000
    assert.strictEqual(regularItems[1].totalCents, 95000);
  });

  it("assigns correct item types and descriptions", async () => {
    const clientResponses = [
      { rows: [{ seq: "43" }] },
      { rows: [{ id: "inv-new" }] },
      { rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }
    ];
    const pool = transactionPool(clientResponses);

    const result = await generateFromTimesheets(pool, {
      orgId: "org-1", assignmentId: "asg-1", timesheetIds: ["ts-1", "ts-2"], actorId: "u-1"
    });

    for (const item of result.items) {
      assert.ok(["timesheet_regular", "timesheet_overtime"].includes(item.itemType));
      assert.ok(item.description.includes("Max Mueller"));
      assert.ok(item.quantity > 0);
      assert.ok(item.unitAmountCents > 0);
    }
  });
});

// ═══════════════════════════════════════════════════════
// getOperationalInvoice
// ═══════════════════════════════════════════════════════

describe("operationalInvoiceService — getOperationalInvoice", () => {
  it("returns null when not found", async () => {
    const pool = returnPool([]);
    const result = await getOperationalInvoice(pool, "inv-99", "org-1");
    assert.strictEqual(result, null);
  });

  it("returns org boundary violation", async () => {
    let callIdx = 0;
    const pool = mockPool(async (sql) => {
      callIdx++;
      if (callIdx === 1) return { rows: [{ id: "inv-1", org_id: "org-other", supplier_org_id: "sup-other", invoice_type: "operational" }] };
      return { rows: [] };
    });
    const result = await getOperationalInvoice(pool, "inv-1", "org-1");
    assert.strictEqual(result.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("returns invoice with items when authorized", async () => {
    let callIdx = 0;
    const pool = mockPool(async () => {
      callIdx++;
      if (callIdx === 1) return { rows: [{ id: "inv-1", org_id: "org-1", supplier_org_id: "sup-1", invoice_type: "operational", total_cents: 100000 }] };
      return { rows: [{ id: "item-1", item_type: "timesheet_regular", total_cents: 80000 }, { id: "item-2", item_type: "timesheet_overtime", total_cents: 20000 }] };
    });
    const result = await getOperationalInvoice(pool, "inv-1", "org-1");
    assert.strictEqual(result.id, "inv-1");
    assert.strictEqual(result.items.length, 2);
  });
});

// ═══════════════════════════════════════════════════════
// listOperationalInvoices
// ═══════════════════════════════════════════════════════

describe("operationalInvoiceService — listOperationalInvoices", () => {
  it("returns filtered list", async () => {
    const pool = returnPool([{ id: "inv-1", invoice_type: "operational" }]);
    const result = await listOperationalInvoices(pool, { orgId: "org-1" });
    assert.strictEqual(result.length, 1);
  });

  it("includes operational type filter in SQL", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await listOperationalInvoices(pool, { orgId: "org-1" });
    assert.ok(captured[0].sql.includes("i.invoice_type = 'operational'"));
  });

  it("applies status and search filters", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await listOperationalInvoices(pool, { orgId: "org-1", status: "issued", search: "TC-2026" });
    assert.ok(captured[0].params.includes("issued"));
    assert.ok(captured[0].params.includes("%TC-2026%"));
  });

  it("applies date range filters", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await listOperationalInvoices(pool, { orgId: "org-1", dateFrom: "2026-01-01", dateTo: "2026-03-31" });
    assert.ok(captured[0].params.includes("2026-01-01"));
    assert.ok(captured[0].params.includes("2026-03-31"));
  });
});

// ═══════════════════════════════════════════════════════
// getInvoiceKpis
// ═══════════════════════════════════════════════════════

describe("operationalInvoiceService — getInvoiceKpis", () => {
  it("returns structured KPI object", async () => {
    const pool = returnPool([{
      total_invoices: 15, draft_count: 2, issued_count: 5, overdue_count: 1, paid_count: 7,
      outstanding_cents: 250000, overdue_cents: 50000, paid_this_month_cents: 120000, paid_total_cents: 800000
    }]);
    const kpis = await getInvoiceKpis(pool, "org-1");
    assert.strictEqual(kpis.total_invoices, 15);
    assert.strictEqual(kpis.draft_count, 2);
    assert.strictEqual(kpis.outstanding_cents, 250000);
    assert.strictEqual(kpis.paid_this_month_cents, 120000);
  });

  it("returns zeros for empty org", async () => {
    const pool = returnPool([{}]);
    const kpis = await getInvoiceKpis(pool, "org-empty");
    assert.strictEqual(kpis.total_invoices, 0);
    assert.strictEqual(kpis.outstanding_cents, 0);
  });

  it("filters by operational type", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [{}] };
    });
    await getInvoiceKpis(pool, "org-1");
    assert.ok(captured[0].sql.includes("invoice_type = 'operational'"));
  });

  it("queries dual perspective (buyer + supplier)", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [{}] };
    });
    await getInvoiceKpis(pool, "org-1");
    assert.ok(captured[0].sql.includes("org_id = $1 OR supplier_org_id = $1"));
  });
});

// ═══════════════════════════════════════════════════════
// getBillableTimesheets
// ═══════════════════════════════════════════════════════

describe("operationalInvoiceService — getBillableTimesheets", () => {
  it("returns only approved + non-invoiced timesheets", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [{ id: "ts-1", total_hours: 40 }] };
    });
    const result = await getBillableTimesheets(pool, "org-1");
    assert.strictEqual(result.length, 1);
    assert.ok(captured[0].sql.includes("ts.status = 'approved'"));
    assert.ok(captured[0].sql.includes("ts.invoice_id IS NULL"));
  });

  it("applies assignment filter", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await getBillableTimesheets(pool, "org-1", { assignmentId: "asg-1" });
    assert.ok(captured[0].params.includes("asg-1"));
  });

  it("applies worker name filter", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await getBillableTimesheets(pool, "org-1", { workerName: "Mueller" });
    assert.ok(captured[0].params.includes("%Mueller%"));
  });
});

// ═══════════════════════════════════════════════════════
// transitionInvoice
// ═══════════════════════════════════════════════════════

describe("operationalInvoiceService — transitionInvoice", () => {
  it("transitions draft to issued", async () => {
    let callIdx = 0;
    const pool = mockPool(async (sql) => {
      callIdx++;
      if (callIdx === 1) return { rows: [{ id: "inv-1", status: "draft", org_id: "org-1" }] };
      if (callIdx === 2) return { rows: [{ id: "inv-1", status: "issued" }] };
      return { rows: [] };
    });
    const result = await transitionInvoice(pool, "inv-1", "issued", "u-1");
    assert.ok(result.invoice);
    assert.strictEqual(result.invoice.status, "issued");
  });

  it("transitions issued to paid", async () => {
    let callIdx = 0;
    const pool = mockPool(async (sql) => {
      callIdx++;
      if (callIdx === 1) return { rows: [{ id: "inv-1", status: "issued" }] };
      if (callIdx === 2) return { rows: [{ id: "inv-1", status: "paid" }] };
      return { rows: [] };
    });
    const result = await transitionInvoice(pool, "inv-1", "paid", "u-1");
    assert.strictEqual(result.invoice.status, "paid");
  });

  it("rejects invalid transition (paid → draft)", async () => {
    const pool = mockPool(async () => ({ rows: [{ id: "inv-1", status: "paid" }] }));
    const result = await transitionInvoice(pool, "inv-1", "draft", "u-1");
    assert.strictEqual(result.error, "INVALID_TRANSITION");
    assert.strictEqual(result.from, "paid");
  });

  it("returns NOT_FOUND for nonexistent invoice", async () => {
    const pool = returnPool([]);
    const result = await transitionInvoice(pool, "inv-99", "issued", "u-1");
    assert.strictEqual(result.error, "NOT_FOUND");
  });

  it("allows void from any non-terminal state", async () => {
    for (const status of ["draft", "issued", "overdue"]) {
      let callIdx = 0;
      const pool = mockPool(async () => {
        callIdx++;
        if (callIdx === 1) return { rows: [{ id: "inv-1", status }] };
        if (callIdx === 2) return { rows: [{ id: "inv-1", status: "void" }] };
        return { rows: [] };
      });
      const result = await transitionInvoice(pool, "inv-1", "void", "u-1");
      assert.strictEqual(result.invoice.status, "void", `Should void from ${status}`);
    }
  });
});

// ═══════════════════════════════════════════════════════
// addCorrectionItem
// ═══════════════════════════════════════════════════════

describe("operationalInvoiceService — addCorrectionItem", () => {
  it("adds correction to draft invoice", async () => {
    let callIdx = 0;
    const pool = mockPool(async () => {
      callIdx++;
      if (callIdx === 1) return { rows: [{ id: "inv-1", status: "draft", org_id: "org-1" }] };
      if (callIdx === 2) return { rows: [{ id: "item-new", item_type: "adjustment", total_cents: -5000 }] };
      return { rows: [] };
    });
    const result = await addCorrectionItem(pool, "inv-1", { description: "Rabatt", amountCents: -5000, actorId: "u-1" });
    assert.ok(result.item);
    assert.strictEqual(result.item.item_type, "adjustment");
  });

  it("rejects correction on issued invoice", async () => {
    const pool = mockPool(async () => ({ rows: [{ id: "inv-1", status: "issued" }] }));
    const result = await addCorrectionItem(pool, "inv-1", { description: "Test", amountCents: 100, actorId: "u-1" });
    assert.strictEqual(result.error, "NOT_EDITABLE");
  });

  it("returns NOT_FOUND for nonexistent invoice", async () => {
    const pool = returnPool([]);
    const result = await addCorrectionItem(pool, "inv-99", { description: "Test", amountCents: 100, actorId: "u-1" });
    assert.strictEqual(result.error, "NOT_FOUND");
  });
});

// ═══════════════════════════════════════════════════════
// exportOperationalInvoiceCsv
// ═══════════════════════════════════════════════════════

describe("operationalInvoiceService — exportOperationalInvoiceCsv", () => {
  it("generates CSV with header, items and summary", () => {
    const invoice = {
      invoice_number: "TC-2026-000042",
      amount_cents: 198125,
      tax_rate_pct: 19,
      tax_amount_cents: 37644,
      total_cents: 235769,
      items: [
        { item_type: "timesheet_regular", description: "Max Mueller — Regelstunden", worker_name: "Max Mueller", week_start: "2026-03-03", week_end: "2026-03-07", quantity: 35, unit_amount_cents: 2500, total_cents: 87500 },
        { item_type: "timesheet_overtime", description: "Max Mueller — Überstunden", worker_name: "Max Mueller", week_start: "2026-03-03", week_end: "2026-03-07", quantity: 5, unit_amount_cents: 3125, total_cents: 15625 },
        { item_type: "timesheet_regular", description: "Max Mueller — Regelstunden", worker_name: "Max Mueller", week_start: "2026-03-10", week_end: "2026-03-14", quantity: 38, unit_amount_cents: 2500, total_cents: 95000 }
      ]
    };
    const csv = exportOperationalInvoiceCsv(invoice);
    const lines = csv.split("\n");

    // Header
    assert.ok(lines[0].includes("position"));
    assert.ok(lines[0].includes("item_type"));
    assert.ok(lines[0].includes("total_eur"));

    // 3 items
    assert.ok(lines[1].includes("timesheet_regular"));
    assert.ok(lines[2].includes("timesheet_overtime"));
    assert.ok(lines[3].includes("timesheet_regular"));

    // Summary lines
    assert.ok(csv.includes("Nettobetrag"));
    assert.ok(csv.includes("1981.25")); // net
    assert.ok(csv.includes("376.44")); // tax
    assert.ok(csv.includes("2357.69")); // total
  });

  it("handles empty items", () => {
    const csv = exportOperationalInvoiceCsv({ items: [], amount_cents: 0, tax_amount_cents: 0, total_cents: 0 });
    assert.ok(csv.includes("position"));
    assert.ok(csv.includes("Gesamtbetrag"));
  });

  it("escapes CSV special characters", () => {
    const invoice = {
      amount_cents: 100, tax_amount_cents: 19, total_cents: 119, tax_rate_pct: 19,
      items: [{ item_type: "adjustment", description: 'Korrektur "Sonderfall", Zeile 3', worker_name: null, quantity: 1, unit_amount_cents: 100, total_cents: 100 }]
    };
    const csv = exportOperationalInvoiceCsv(invoice);
    assert.ok(csv.includes('""'));
  });
});
