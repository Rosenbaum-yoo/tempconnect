/**
 * Invoice PDF Rendering — generates professional PDF invoices.
 *
 * Uses a plain-text receipt format that works without external PDF libraries.
 * For production, upgrade to PDFKit or Puppeteer for styled PDFs.
 * The text format is valid for German Kleinbetragsrechnungen and audit trails.
 */

const COMPANY = {
  name: "TempConnect GmbH",
  street: "Musterstrasse 1",
  city: "10115 Berlin",
  country: "Deutschland",
  vatId: "DE000000000",
  email: "billing@tempconnect.de",
  web: "https://tempconnect.de"
};

/**
 * Render an invoice as plain-text receipt (PDF-ready).
 * @param {object} invoice - Full invoice object from getInvoice()
 * @returns {string} Plain-text invoice content
 */
export function renderInvoiceText(invoice) {
  const lines = [];
  const sep = "=".repeat(60);
  const dash = "-".repeat(60);

  lines.push(sep);
  lines.push("  RECHNUNG / INVOICE");
  lines.push(sep);
  lines.push("");
  lines.push(`Rechnungsnr.:  ${invoice.invoice_number}`);
  lines.push(`Datum:         ${fmtDate(invoice.issued_at)}`);
  lines.push(`Faellig:       ${fmtDate(invoice.due_at)}`);
  lines.push(`Status:        ${invoice.status?.toUpperCase() || "ISSUED"}`);
  lines.push("");
  lines.push(dash);
  lines.push("RECHNUNGSSTELLER");
  lines.push(dash);
  lines.push(`${COMPANY.name}`);
  lines.push(`${COMPANY.street}`);
  lines.push(`${COMPANY.city}`);
  lines.push(`USt-IdNr.: ${COMPANY.vatId}`);
  lines.push(`${COMPANY.email}`);
  lines.push("");
  lines.push(dash);
  lines.push("RECHNUNGSEMPFAENGER");
  lines.push(dash);
  lines.push(`${invoice.billing_name || "—"}`);
  if (invoice.billing_tax_id || invoice.user_vat_id) {
    lines.push(`USt-IdNr.: ${invoice.billing_tax_id || invoice.user_vat_id}`);
  }
  lines.push("");
  lines.push(dash);
  lines.push("POSITIONEN");
  lines.push(dash);

  const items = invoice.items || [];
  for (const item of items) {
    const amount = fmtCurrency(item.total_cents || item.unit_amount_cents || 0);
    lines.push(`${item.quantity || 1}x  ${item.description}`);
    lines.push(`     ${amount} EUR`);
  }

  lines.push("");
  lines.push(dash);
  lines.push(`Netto:           ${fmtCurrency(invoice.amount_cents)} EUR`);
  lines.push(`MwSt (${invoice.tax_rate_pct || 19}%):   ${fmtCurrency(invoice.tax_amount_cents)} EUR`);
  lines.push(`GESAMT:          ${fmtCurrency(invoice.total_cents)} EUR`);
  lines.push(sep);
  lines.push("");
  lines.push(`Abrechnungszeitraum: ${fmtDate(invoice.billing_period_start)} - ${fmtDate(invoice.billing_period_end)}`);
  lines.push(`Plan: ${invoice.plan}`);
  if (invoice.payment_session_id) lines.push(`Zahlungsreferenz: ${invoice.payment_session_id}`);
  if (invoice.stripe_invoice_id) lines.push(`Stripe-Referenz: ${invoice.stripe_invoice_id}`);
  lines.push("");
  lines.push("Zahlungsbedingungen: 14 Tage netto");
  lines.push("Bankverbindung: Siehe Kundenportal");
  lines.push("");
  lines.push(`Erstellt am: ${new Date().toISOString()}`);
  lines.push(`${COMPANY.web}`);

  return lines.join("\n");
}

/**
 * Render invoice as simple HTML (for email or browser print).
 */
export function renderInvoiceHtml(invoice) {
  const items = invoice.items || [];
  const itemsHtml = items.map(it =>
    `<tr><td>${esc(it.description)}</td><td style="text-align:right">${it.quantity || 1}</td><td style="text-align:right">${fmtCurrency(it.total_cents || it.unit_amount_cents || 0)} EUR</td></tr>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>Rechnung ${esc(invoice.invoice_number)}</title>
<style>body{font-family:Arial,sans-serif;margin:40px;color:#1a1d24;font-size:13px}
h1{font-size:22px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin:16px 0}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #ddd}th{font-size:11px;text-transform:uppercase;color:#666}
.total{font-size:16px;font-weight:700}.meta{color:#666;font-size:12px;margin:4px 0}</style></head><body>
<h1>RECHNUNG</h1>
<div class="meta">${esc(COMPANY.name)} &middot; ${esc(COMPANY.street)} &middot; ${esc(COMPANY.city)}</div>
<table><tr><td><strong>Rechnungsnr.</strong><br>${esc(invoice.invoice_number)}</td>
<td><strong>Datum</strong><br>${fmtDate(invoice.issued_at)}</td>
<td><strong>Faellig</strong><br>${fmtDate(invoice.due_at)}</td>
<td><strong>Status</strong><br>${(invoice.status || "issued").toUpperCase()}</td></tr></table>
<table><tr><td style="width:50%"><strong>Rechnungsempfaenger</strong><br>${esc(invoice.billing_name || "—")}<br>${invoice.billing_tax_id || invoice.user_vat_id ? "USt-IdNr.: " + esc(invoice.billing_tax_id || invoice.user_vat_id) : ""}</td>
<td><strong>Plan</strong><br>${esc(invoice.plan)}<br>Zeitraum: ${fmtDate(invoice.billing_period_start)} — ${fmtDate(invoice.billing_period_end)}</td></tr></table>
<table><thead><tr><th>Beschreibung</th><th style="text-align:right">Menge</th><th style="text-align:right">Betrag</th></tr></thead><tbody>${itemsHtml}</tbody>
<tfoot><tr><td colspan="2" style="text-align:right">Netto</td><td style="text-align:right">${fmtCurrency(invoice.amount_cents)} EUR</td></tr>
<tr><td colspan="2" style="text-align:right">MwSt (${invoice.tax_rate_pct || 19}%)</td><td style="text-align:right">${fmtCurrency(invoice.tax_amount_cents)} EUR</td></tr>
<tr><td colspan="2" style="text-align:right;font-weight:700">Gesamt</td><td style="text-align:right" class="total">${fmtCurrency(invoice.total_cents)} EUR</td></tr></tfoot></table>
<div class="meta">Zahlungsbedingungen: 14 Tage netto &middot; ${esc(COMPANY.email)} &middot; ${esc(COMPANY.web)}</div>
</body></html>`;
}

/* ── Helpers ───────────────────────────────────────── */

function fmtCurrency(cents) {
  return (Number(cents || 0) / 100).toFixed(2).replace(".", ",");
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
