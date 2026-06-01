/**
 * Invoice CSV export unit tests — exportInvoicesCsv pure function.
 * No DB.  Tests CSV header, row formatting, cent-to-euro, escaping, edge cases.
 *
 * Run: node --test --test-force-exit test/invoiceCsv.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { exportInvoicesCsv } from "../services/invoiceService.js";

// ─────────────────────────────────────────────────────────────
// CSV header
// ─────────────────────────────────────────────────────────────

describe("exportInvoicesCsv — header", () => {
  it("first line contains correct column headers", () => {
    const csv = exportInvoicesCsv([]);
    const header = csv.split("\n")[0];
    assert.strictEqual(
      header,
      "invoice_number,billing_name,plan,billing_period_start,billing_period_end,amount_eur,tax_eur,total_eur,status,issued_at,paid_at"
    );
  });
});

// ─────────────────────────────────────────────────────────────
// Empty invoices
// ─────────────────────────────────────────────────────────────

describe("exportInvoicesCsv — empty", () => {
  it("returns only header for empty array", () => {
    const csv = exportInvoicesCsv([]);
    const lines = csv.split("\n");
    assert.strictEqual(lines.length, 1);
  });
});

// ─────────────────────────────────────────────────────────────
// Cent-to-euro conversion
// ─────────────────────────────────────────────────────────────

describe("exportInvoicesCsv — cent-to-euro conversion", () => {
  it("converts cents to euros with 2 decimal places", () => {
    const csv = exportInvoicesCsv([{
      invoice_number: "TC-2026-000001",
      billing_name: "Acme",
      plan: "PRO",
      billing_period_start: "2026-01-01",
      billing_period_end: "2026-01-31",
      amount_cents: 9900,
      tax_amount_cents: 1881,
      total_cents: 11781,
      status: "issued",
      issued_at: "2026-01-01T00:00:00Z",
      paid_at: null
    }]);
    const row = csv.split("\n")[1];
    const cols = row.split(",");
    assert.strictEqual(cols[5], "99.00");     // amount_eur
    assert.strictEqual(cols[6], "18.81");     // tax_eur
    assert.strictEqual(cols[7], "117.81");    // total_eur
  });

  it("handles zero amounts", () => {
    const csv = exportInvoicesCsv([{
      invoice_number: "TC-2026-000002",
      billing_name: "Free Co",
      plan: "FREE",
      amount_cents: 0,
      tax_amount_cents: 0,
      total_cents: 0,
      status: "issued"
    }]);
    const row = csv.split("\n")[1];
    const cols = row.split(",");
    assert.strictEqual(cols[5], "0.00");
    assert.strictEqual(cols[6], "0.00");
    assert.strictEqual(cols[7], "0.00");
  });

  it("handles null/missing amounts as 0.00", () => {
    const csv = exportInvoicesCsv([{
      invoice_number: "TC-2026-000003",
      billing_name: "Null Co",
      plan: "BASIS",
      status: "void"
    }]);
    const row = csv.split("\n")[1];
    const cols = row.split(",");
    assert.strictEqual(cols[5], "0.00");
    assert.strictEqual(cols[6], "0.00");
    assert.strictEqual(cols[7], "0.00");
  });
});

// ─────────────────────────────────────────────────────────────
// CSV escaping
// ─────────────────────────────────────────────────────────────

describe("exportInvoicesCsv — CSV escaping", () => {
  it("escapes values containing commas", () => {
    const csv = exportInvoicesCsv([{
      invoice_number: "TC-2026-000004",
      billing_name: "Müller, Schmidt & Partner",
      plan: "PRO",
      amount_cents: 100,
      tax_amount_cents: 19,
      total_cents: 119,
      status: "paid"
    }]);
    const row = csv.split("\n")[1];
    assert.ok(row.includes('"Müller, Schmidt & Partner"'));
  });

  it("escapes values containing double quotes", () => {
    const csv = exportInvoicesCsv([{
      invoice_number: "TC-2026-000005",
      billing_name: 'Company "Special"',
      plan: "PRO",
      amount_cents: 100,
      tax_amount_cents: 19,
      total_cents: 119,
      status: "paid"
    }]);
    const row = csv.split("\n")[1];
    assert.ok(row.includes('"Company ""Special"""'));
  });

  it("escapes values containing newlines", () => {
    const csv = exportInvoicesCsv([{
      invoice_number: "TC-2026-000006",
      billing_name: "Line1\nLine2",
      plan: "PRO",
      amount_cents: 100,
      tax_amount_cents: 19,
      total_cents: 119,
      status: "issued"
    }]);
    const lines = csv.split("\n");
    // Header + row (which spans 2 lines because of the embedded newline)
    assert.ok(lines.length >= 2);
  });
});

// ─────────────────────────────────────────────────────────────
// Date formatting
// ─────────────────────────────────────────────────────────────

describe("exportInvoicesCsv — date formatting", () => {
  it("formats issued_at as YYYY-MM-DD", () => {
    const csv = exportInvoicesCsv([{
      invoice_number: "TC-2026-000007",
      billing_name: "Test",
      plan: "PRO",
      amount_cents: 100,
      tax_amount_cents: 19,
      total_cents: 119,
      status: "paid",
      issued_at: "2026-03-15T14:30:00Z",
      paid_at: "2026-03-20T10:00:00Z"
    }]);
    const row = csv.split("\n")[1];
    const cols = row.split(",");
    assert.strictEqual(cols[9], "2026-03-15");
    assert.strictEqual(cols[10], "2026-03-20");
  });

  it("handles null paid_at as empty string", () => {
    const csv = exportInvoicesCsv([{
      invoice_number: "TC-2026-000008",
      billing_name: "Test",
      plan: "PRO",
      amount_cents: 100,
      tax_amount_cents: 19,
      total_cents: 119,
      status: "issued",
      issued_at: "2026-01-01T00:00:00Z",
      paid_at: null
    }]);
    const row = csv.split("\n")[1];
    const cols = row.split(",");
    assert.strictEqual(cols[10], "");
  });
});

// ─────────────────────────────────────────────────────────────
// Multiple rows
// ─────────────────────────────────────────────────────────────

describe("exportInvoicesCsv — multiple rows", () => {
  it("produces correct number of lines (header + n rows)", () => {
    const invoices = [
      { invoice_number: "A", billing_name: "X", plan: "PRO", amount_cents: 100, tax_amount_cents: 19, total_cents: 119, status: "paid" },
      { invoice_number: "B", billing_name: "Y", plan: "PLUS", amount_cents: 200, tax_amount_cents: 38, total_cents: 238, status: "issued" },
      { invoice_number: "C", billing_name: "Z", plan: "BASIS", amount_cents: 300, tax_amount_cents: 57, total_cents: 357, status: "void" }
    ];
    const csv = exportInvoicesCsv(invoices);
    const lines = csv.split("\n");
    assert.strictEqual(lines.length, 4); // header + 3 rows
  });
});
