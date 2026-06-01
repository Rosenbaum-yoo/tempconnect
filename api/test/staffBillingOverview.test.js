/**
 * staffBillingOverviewService tests (Phase D, Slice 2).
 * Read-only Aggregat — fake pool, keine echte DB.
 *
 * Run: node --test --test-force-exit test/staffBillingOverview.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getBillingOverview,
  meta,
  INVOICE_STATUSES
} from "../services/staffBillingOverviewService.js";

// Fake pool: liefert vorab gequeuete Antworten in Reihenfolge der Aufrufe.
function sequencePool(...responses) {
  let idx = 0;
  const calls = [];
  return {
    calls,
    query: (sql, params) => {
      calls.push({ sql, params });
      if (idx >= responses.length) throw new Error(`Unexpected query #${idx + 1}`);
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

const CAP_KEYS = ["self_service_checkout", "recurring", "customer_portal", "webhooks", "manual_invoicing"];

describe("meta", () => {
  it("exposes invoice statuses for filter UI", () => {
    assert.deepStrictEqual(meta(), { invoice_statuses: ["issued", "paid", "overdue", "void"] });
  });
  it("INVOICE_STATUSES is the canonical set", () => {
    assert.deepStrictEqual([...INVOICE_STATUSES], ["issued", "paid", "overdue", "void"]);
  });
});

describe("getBillingOverview — provider + shape", () => {
  it("always includes provider self-report with capabilities and warnings", async () => {
    const pool = sequencePool({ rows: [] }, { rows: [] }, { rows: [] });
    const out = await getBillingOverview(pool);

    assert.strictEqual(out.available, true);
    assert.strictEqual(typeof out.billing.provider, "string");
    assert.ok(["stripe", "manual", "disabled"].includes(out.billing.provider));
    assert.ok(out.billing.capabilities && typeof out.billing.capabilities === "object");
    for (const k of CAP_KEYS) {
      assert.strictEqual(typeof out.billing.capabilities[k], "boolean", `capability ${k}`);
    }
    assert.ok(Array.isArray(out.billing.warnings));
    assert.ok(Array.isArray(out.attention), "attention worklist is an array");
    assert.strictEqual(out.scope.attention_limit, 50);
    assert.ok(typeof out.generated_at === "string" && out.generated_at.includes("T"));
  });

  it("zero-state: empty invoices → totals 0 and empty list", async () => {
    const pool = sequencePool({ rows: [] }, { rows: [] }, { rows: [] });
    const out = await getBillingOverview(pool);

    assert.strictEqual(out.totals.invoices, 0);
    assert.strictEqual(out.totals.gross_cents, 0);
    assert.strictEqual(out.totals.net_cents, 0);
    assert.strictEqual(out.totals.tax_cents, 0);
    assert.deepStrictEqual(out.recent_invoices, []);
    assert.deepStrictEqual(out.attention, []);
    // by_status enthält jeden kanonischen Status mit Nullwerten
    for (const s of INVOICE_STATUSES) {
      assert.deepStrictEqual(out.totals.by_status[s], { count: 0, gross_cents: 0 });
    }
  });
});

describe("getBillingOverview — aggregation", () => {
  it("sums totals across statuses and maps recent invoices", async () => {
    const pool = sequencePool(
      {
        rows: [
          { status: "paid", cnt: 2, gross_cents: "11900", net_cents: "10000", tax_cents: "1900" },
          { status: "issued", cnt: 1, gross_cents: "5950", net_cents: "5000", tax_cents: "950" }
        ]
      },
      {
        rows: [
          {
            id: "inv-1", invoice_number: "TC-2026-000001", billing_name: "ACME GmbH",
            plan: "PLUS", status: "paid", total_cents: "5950", currency: "EUR",
            issued_at: "2026-05-01", due_at: "2026-05-15", paid_at: "2026-05-03"
          }
        ]
      },
      {
        rows: [
          {
            id: "inv-2", invoice_number: "TC-2026-000002", billing_name: "Beta AG",
            plan: "PRO", status: "overdue", total_cents: "23800", currency: "EUR",
            issued_at: "2026-04-01", due_at: "2026-04-15", days_overdue: 30
          }
        ]
      }
    );
    const out = await getBillingOverview(pool);

    assert.strictEqual(out.totals.invoices, 3);
    assert.strictEqual(out.totals.gross_cents, 17850);
    assert.strictEqual(out.totals.net_cents, 15000);
    assert.strictEqual(out.totals.tax_cents, 2850);
    assert.deepStrictEqual(out.totals.by_status.paid, { count: 2, gross_cents: 11900 });
    assert.deepStrictEqual(out.totals.by_status.issued, { count: 1, gross_cents: 5950 });

    assert.strictEqual(out.recent_invoices.length, 1);
    const inv = out.recent_invoices[0];
    assert.strictEqual(inv.id, "inv-1");
    assert.strictEqual(inv.invoice_number, "TC-2026-000001");
    assert.strictEqual(inv.billing_name, "ACME GmbH");
    assert.strictEqual(inv.total_cents, 5950); // Number, nicht String
    assert.strictEqual(inv.status, "paid");

    // Dunning-Worklist (älteste überfällige zuerst, days_overdue als Number)
    assert.strictEqual(out.attention.length, 1);
    const att = out.attention[0];
    assert.strictEqual(att.id, "inv-2");
    assert.strictEqual(att.status, "overdue");
    assert.strictEqual(att.total_cents, 23800); // Number, nicht String
    assert.strictEqual(att.days_overdue, 30);   // Number, nicht String
  });
});

describe("getBillingOverview — input sanitation", () => {
  it("rejects unknown status (→ null) and clamps oversized limit", async () => {
    const pool = sequencePool({ rows: [] }, { rows: [] }, { rows: [] });
    const out = await getBillingOverview(pool, { status: "bogus", limit: 9999 });
    assert.strictEqual(out.scope.status, null);
    assert.strictEqual(out.scope.limit, 100);
    assert.strictEqual(out.scope.platform, true);
  });

  it("passes a valid status through and defaults the limit", async () => {
    const pool = sequencePool({ rows: [] }, { rows: [] }, { rows: [] });
    const out = await getBillingOverview(pool, { status: "overdue" });
    assert.strictEqual(out.scope.status, "overdue");
    assert.strictEqual(out.scope.limit, 25);
  });

  it("forwards the sanitized status into the invoice listing query", async () => {
    const pool = sequencePool({ rows: [] }, { rows: [] }, { rows: [] });
    await getBillingOverview(pool, { status: "paid", limit: 10 });
    // 2. Query = invoiceService.listInvoices → muss 'paid' als Param enthalten
    const listingCall = pool.calls[1];
    assert.ok(listingCall.params.includes("paid"), "listInvoices erhält status-Param");
  });
});
