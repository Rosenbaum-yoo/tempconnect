/**
 * Staff Billing Overview (Phase D, Slice 2) — read-only Operator-Sicht.
 *
 * Aggregiert bestehende Wahrheiten plattformweit (SCC = Operatorrolle, requireStaff):
 *   - Provider-Status aus billingProviderService.describeBilling(config)
 *     (welcher Abrechnungsweg aktiv, welche Fähigkeiten real, welche Warnungen).
 *   - Rechnungs-Kennzahlen aus der invoices-Tabelle (Summen je Status + Gesamt).
 *   - Letzte Rechnungen über invoiceService.listInvoices (ohne Org/User = global).
 *
 * KEINE Migration, KEINE Mutation. Zero-State garantiert (leere invoices →
 * Summen 0 + leere Liste). Statuswechsel/Abrechnung laufen NICHT hier, sondern
 * über die bestehenden Payment-/Subscription-Pfade.
 */

import { config } from "../config/index.js";
import { describeBilling } from "./billingProviderService.js";
import * as invoiceService from "./invoiceService.js";

export const INVOICE_STATUSES = Object.freeze(["issued", "paid", "overdue", "void"]);

const DEFAULT_RECENT_LIMIT = 25;
const MAX_RECENT_LIMIT = 100;

// Dunning-Worklist (überfällige Forderungen) — operator-getrieben, kein Auto-Cancel.
const ATTENTION_LIMIT = 50;

function clampLimit(value) {
  const n = parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RECENT_LIMIT;
  return Math.min(n, MAX_RECENT_LIMIT);
}

function mapInvoice(inv) {
  return {
    id: inv.id,
    invoice_number: inv.invoice_number,
    billing_name: inv.billing_name || null,
    plan: inv.plan || null,
    status: inv.status,
    total_cents: Number(inv.total_cents) || 0,
    currency: inv.currency || "EUR",
    issued_at: inv.issued_at || null,
    due_at: inv.due_at || null,
    paid_at: inv.paid_at || null
  };
}

function emptyTotals() {
  const by_status = {};
  for (const s of INVOICE_STATUSES) by_status[s] = { count: 0, gross_cents: 0 };
  return { invoices: 0, gross_cents: 0, net_cents: 0, tax_cents: 0, currency: "EUR", by_status };
}

function mapAttention(inv) {
  return {
    id: inv.id,
    invoice_number: inv.invoice_number,
    billing_name: inv.billing_name || null,
    plan: inv.plan || null,
    status: inv.status,
    total_cents: Number(inv.total_cents) || 0,
    currency: inv.currency || "EUR",
    issued_at: inv.issued_at || null,
    due_at: inv.due_at || null,
    days_overdue: Math.max(0, Number(inv.days_overdue) || 0)
  };
}

/**
 * Überfällige Forderungen als Dunning-Worklist (älteste zuerst).
 * Fängt sowohl bereits markierte (status='overdue') als auch noch 'issued',
 * aber über due_at hinaus (Cron-Lag) — damit der Operator nichts verpasst.
 * Read-only: KEINE Mutation, KEIN Auto-Cancel. Enterprise-Dunning ist
 * operator-getrieben (Rechnung/Net-14, Provider=manual ist Default).
 * @param {import('pg').Pool} pool
 * @param {number} limit
 */
async function loadAttention(pool, limit) {
  const { rows } = await pool.query(
    `SELECT i.id, i.invoice_number, i.status, i.plan, i.total_cents, i.currency,
            i.issued_at, i.due_at,
            COALESCE(o.name, u.company_name, u.email) AS billing_name,
            GREATEST(0, EXTRACT(DAY FROM (NOW() - i.due_at)))::int AS days_overdue
     FROM invoices i
     LEFT JOIN organizations o ON o.id = i.org_id
     LEFT JOIN users u ON u.id = i.user_id
     WHERE i.status = 'overdue' OR (i.status = 'issued' AND i.due_at < NOW())
     ORDER BY i.due_at ASC NULLS LAST
     LIMIT $1`,
    [limit]
  );
  return rows.map(mapAttention);
}

/**
 * Plattformweite Rechnungs-Summen je Status (read-only Aggregat).
 * @param {import('pg').Pool} pool
 */
async function loadInvoiceTotals(pool) {
  const totals = emptyTotals();
  const { rows } = await pool.query(
    `SELECT status,
            COUNT(*)::int                       AS cnt,
            COALESCE(SUM(total_cents), 0)::bigint AS gross_cents,
            COALESCE(SUM(amount_cents), 0)::bigint AS net_cents,
            COALESCE(SUM(tax_amount_cents), 0)::bigint AS tax_cents
     FROM invoices
     GROUP BY status`
  );
  for (const r of rows) {
    const cnt = Number(r.cnt) || 0;
    const gross = Number(r.gross_cents) || 0;
    const net = Number(r.net_cents) || 0;
    const tax = Number(r.tax_cents) || 0;
    totals.invoices += cnt;
    totals.gross_cents += gross;
    totals.net_cents += net;
    totals.tax_cents += tax;
    if (!totals.by_status[r.status]) totals.by_status[r.status] = { count: 0, gross_cents: 0 };
    totals.by_status[r.status].count = cnt;
    totals.by_status[r.status].gross_cents = gross;
  }
  return totals;
}

/**
 * @param {import('pg').Pool} pool
 * @param {{status?:string|null, limit?:number|string}} [opts]
 */
export async function getBillingOverview(pool, opts = {}) {
  const generated_at = new Date().toISOString();
  const billing = describeBilling(config);

  const status = INVOICE_STATUSES.includes(String(opts.status)) ? String(opts.status) : null;
  const limit = clampLimit(opts.limit);

  const [totals, recentRows, attention] = await Promise.all([
    loadInvoiceTotals(pool),
    invoiceService.listInvoices(pool, { status, limit }),
    loadAttention(pool, ATTENTION_LIMIT)
  ]);

  return {
    available: true,
    billing,
    totals,
    recent_invoices: (recentRows || []).map(mapInvoice),
    attention,
    scope: { platform: true, status, limit, attention_limit: ATTENTION_LIMIT },
    generated_at
  };
}

/** Statische Metadaten für Filter-UI (Zero-Query). */
export function meta() {
  return { invoice_statuses: [...INVOICE_STATUSES] };
}
