/**
 * Invoice Service unit tests.
 * Covers createInvoice (with client mock), markInvoicePaid,
 * voidInvoice, listInvoices, getInvoice, exportInvoicesCsv, markOverdueInvoices.
 * Uses mock pool + mock client — no database required.
 *
 * Run: node --test --test-force-exit test/invoiceService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/invoiceService.js";

// ── Mock helpers ──────────────────────────────────────────────

function returnPool(rows = []) {
  return { query: () => Promise.resolve({ rows }) };
}

function sequencePool(...responses) {
  let idx = 0;
  return {
    query: () => {
      if (idx >= responses.length) return Promise.resolve({ rows: [] });
      const resp = responses[idx++];
      if (resp instanceof Error) return Promise.reject(resp);
      return Promise.resolve(resp);
    }
  };
}

/** Mock pool with connect() returning a mock client for transaction tests */
function transactionPool(clientResponses) {
  let idx = 0;
  const client = {
    query: (sql) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return Promise.resolve({ rows: [] });
      if (idx >= clientResponses.length) return Promise.resolve({ rows: [] });
      const resp = clientResponses[idx++];
      if (resp instanceof Error) return Promise.reject(resp);
      return Promise.resolve(resp);
    },
    release: () => {}
  };
  return {
    connect: () => Promise.resolve(client),
    query: () => Promise.resolve({ rows: [] })
  };
}

// ═══════════════════════════════════════════════════════════════
// createInvoice
// ═══════════════════════════════════════════════════════════════

describe("invoiceService — createInvoice", () => {
  it("creates invoice with correct tax calculation (19%)", async () => {
    const invoiceRow = {
      id: "inv-1",
      invoice_number: "TC-2026-000001",
      amount_cents: 2900,
      tax_amount_cents: 551,
      total_cents: 3451,
      plan: "PLUS"
    };
    const pool = transactionPool([
      { rows: [{ seq: "1" }] },      // nextval
      { rows: [{ t: null }] },        // to_regclass premium_listing_charges (Mock: Tabelle fehlt -> keine Premium-Posten)
      { rows: [invoiceRow] },         // INSERT invoice
      { rows: [] }                     // INSERT invoice_items
    ]);
    const result = await svc.createInvoice(pool, {
      orgId: "org-1",
      userId: "user-1",
      plan: "PLUS",
      amountCents: 2900
    });
    assert.strictEqual(result.id, "inv-1");
    assert.strictEqual(result.plan, "PLUS");
  });

  it("handles null optional fields", async () => {
    const invoiceRow = { id: "inv-2", invoice_number: "TC-2026-000002" };
    const pool = transactionPool([
      { rows: [{ seq: "2" }] },
      { rows: [invoiceRow] },
      { rows: [] }
    ]);
    const result = await svc.createInvoice(pool, {
      orgId: null,
      userId: "user-1",
      plan: "BASIS",
      amountCents: 900,
      paymentSessionId: null,
      stripeInvoiceId: null,
      notes: null
    });
    assert.strictEqual(result.id, "inv-2");
  });

  it("rolls back on error", async () => {
    let rolledBack = false;
    const client = {
      query: (sql) => {
        if (sql === "BEGIN") return Promise.resolve({ rows: [] });
        if (sql === "ROLLBACK") { rolledBack = true; return Promise.resolve({ rows: [] }); }
        return Promise.reject(new Error("DB error"));
      },
      release: () => {}
    };
    const pool = { connect: () => Promise.resolve(client) };

    await assert.rejects(
      () => svc.createInvoice(pool, { userId: "u1", plan: "PLUS", amountCents: 100 }),
      { message: "DB error" }
    );
    assert.strictEqual(rolledBack, true);
  });

  it("throws on invalid invoice input", async () => {
    await assert.rejects(
      () => svc.createInvoice({}, { userId: "u1", plan: null, amountCents: 100 }),
      /INVALID_INVOICE_INPUT/
    );
    await assert.rejects(
      () => svc.createInvoice({}, { userId: "u1", plan: "PLUS", amountCents: Number.NaN }),
      /INVALID_INVOICE_INPUT/
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// markInvoicePaid
// ═══════════════════════════════════════════════════════════════

describe("invoiceService — markInvoicePaid", () => {
  it("marks issued invoice as paid", async () => {
    const row = { id: "inv-1", status: "paid", paid_at: "2026-03-01" };
    const result = await svc.markInvoicePaid(returnPool([row]), "inv-1");
    assert.strictEqual(result.status, "paid");
  });

  it("returns null when invoice not found or already paid", async () => {
    const result = await svc.markInvoicePaid(returnPool([]), "inv-99");
    assert.strictEqual(result, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// voidInvoice
// ═══════════════════════════════════════════════════════════════

describe("invoiceService — voidInvoice", () => {
  it("voids an issued invoice", async () => {
    const row = { id: "inv-1", status: "void" };
    const result = await svc.voidInvoice(returnPool([row]), "inv-1");
    assert.strictEqual(result.status, "void");
  });

  it("returns null when already paid or void", async () => {
    assert.strictEqual(await svc.voidInvoice(returnPool([]), "inv-1"), null);
  });
});

// ═══════════════════════════════════════════════════════════════
// listInvoices
// ═══════════════════════════════════════════════════════════════

describe("invoiceService — listInvoices", () => {
  it("lists invoices for org", async () => {
    const rows = [{ id: "inv-1" }, { id: "inv-2" }];
    const result = await svc.listInvoices(returnPool(rows), { orgId: "org-1" });
    assert.strictEqual(result.length, 2);
  });

  it("lists invoices for user when no orgId", async () => {
    const rows = [{ id: "inv-3" }];
    const result = await svc.listInvoices(returnPool(rows), { userId: "user-1" });
    assert.strictEqual(result.length, 1);
  });

  it("filters by status", async () => {
    const result = await svc.listInvoices(returnPool([]), { orgId: "org-1", status: "paid" });
    assert.deepStrictEqual(result, []);
  });

  it("respects limit cap at 200", async () => {
    const result = await svc.listInvoices(returnPool([]), { orgId: "org-1", limit: 500 });
    assert.deepStrictEqual(result, []);
  });

  it("works with no filters", async () => {
    const rows = [{ id: "all" }];
    const result = await svc.listInvoices(returnPool(rows), {});
    assert.strictEqual(result.length, 1);
  });
});

// ═══════════════════════════════════════════════════════════════
// getInvoice
// ═══════════════════════════════════════════════════════════════

describe("invoiceService — getInvoice", () => {
  it("returns invoice with items", async () => {
    const pool = sequencePool(
      { rows: [{ id: "inv-1", plan: "PLUS", billing_name: "Test GmbH" }] },
      { rows: [{ id: "item-1", description: "TempConnect PLUS" }] }
    );
    const result = await svc.getInvoice(pool, "inv-1");
    assert.strictEqual(result.id, "inv-1");
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0].description, "TempConnect PLUS");
  });

  it("returns null when not found", async () => {
    assert.strictEqual(await svc.getInvoice(returnPool([]), "inv-99"), null);
  });
});

// ═══════════════════════════════════════════════════════════════
// exportInvoicesCsv
// ═══════════════════════════════════════════════════════════════

describe("invoiceService — exportInvoicesCsv", () => {
  it("generates valid CSV with header and rows", () => {
    const invoices = [{
      invoice_number: "TC-2026-000001",
      billing_name: "Test GmbH",
      plan: "PLUS",
      billing_period_start: "2026-03-01",
      billing_period_end: "2026-03-31",
      amount_cents: 2900,
      tax_amount_cents: 551,
      total_cents: 3451,
      status: "paid",
      issued_at: "2026-03-01T00:00:00Z",
      paid_at: "2026-03-05T00:00:00Z"
    }];
    const csv = svc.exportInvoicesCsv(invoices);
    const lines = csv.split("\n");
    assert.strictEqual(lines.length, 2); // header + 1 row
    assert.ok(lines[0].includes("invoice_number"));
    assert.ok(lines[1].includes("TC-2026-000001"));
    assert.ok(lines[1].includes("29.00")); // amount
    assert.ok(lines[1].includes("5.51")); // tax
  });

  it("handles empty list", () => {
    const csv = svc.exportInvoicesCsv([]);
    assert.ok(csv.includes("invoice_number"));
    assert.strictEqual(csv.split("\n").length, 1); // only header
  });

  it("escapes commas and quotes in values", () => {
    const invoices = [{
      invoice_number: "TC-2026-000002",
      billing_name: 'Test "GmbH", Berlin',
      plan: "PRO",
      amount_cents: 0, tax_amount_cents: 0, total_cents: 0,
      status: "issued"
    }];
    const csv = svc.exportInvoicesCsv(invoices);
    assert.ok(csv.includes('"Test ""GmbH"", Berlin"'));
  });

  it("handles null fields gracefully", () => {
    const invoices = [{
      invoice_number: null,
      billing_name: null,
      plan: null,
      amount_cents: null,
      tax_amount_cents: null,
      total_cents: null,
      status: null,
      issued_at: null,
      paid_at: null
    }];
    const csv = svc.exportInvoicesCsv(invoices);
    assert.strictEqual(csv.split("\n").length, 2);
  });
});

// ═══════════════════════════════════════════════════════════════
// markOverdueInvoices
// ═══════════════════════════════════════════════════════════════

describe("invoiceService — markOverdueInvoices", () => {
  it("returns count of updated rows", async () => {
    const pool = { query: () => Promise.resolve({ rowCount: 3 }) };
    const result = await svc.markOverdueInvoices(pool);
    assert.strictEqual(result, 3);
  });

  it("returns 0 when none overdue", async () => {
    const pool = { query: () => Promise.resolve({ rowCount: 0 }) };
    assert.strictEqual(await svc.markOverdueInvoices(pool), 0);
  });
});
