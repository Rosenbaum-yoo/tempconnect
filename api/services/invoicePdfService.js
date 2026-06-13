/**
 * Invoice PDF Rendering — generates professional PDF invoices.
 *
 * Uses a plain-text receipt format that works without external PDF libraries.
 * For production, upgrade to PDFKit or Puppeteer for styled PDFs.
 * The text format is valid for German Kleinbetragsrechnungen and audit trails.
 * NEU: renderInvoicePdf() erzeugt echte PDFs via pdf-lib (klein, pure-JS, kein Chromium; ausbaubar).
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
// Rechnungsabsender aus der zentralen Firmen-Config (Single Source of Truth, G.4).
// PLATZHALTER bis UG-Gründung — siehe api/config/company.js + G4_FIRMENDATEN_CHECKLISTE.md.
import { COMPANY } from "../config/company.js";

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

/**
 * Render an invoice as a real PDF (pdf-lib). Eine A4-Seite, WinAnsi-sichere Texte.
 * Ausbaubar: spaeter Logo, Mehrseitigkeit, QR-Code, Briefkopf.
 * @param {object} invoice - Full invoice object from getInvoice()
 * @returns {Promise<Uint8Array>}
 */
export async function renderInvoicePdf(invoice) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const M = 50;
  const ink = rgb(0.1, 0.12, 0.14), muted = rgb(0.45, 0.45, 0.45), line = rgb(0.8, 0.8, 0.8);
  let y = height - M;
  // WinAnsi-sicher: Gedankenstriche -> "-", Euro -> "EUR", Nicht-Latin1 -> "?".
  const a = (s) => String(s == null ? "" : s).replace(/[–—]/g, "-").replace(/€/g, "EUR").replace(/[^\x20-\x7EÀ-ÿ]/g, "?");
  const T = (s, x, yy, o = {}) => page.drawText(a(s), { x, y: yy, size: o.size || 10, font: o.f || font, color: o.color || ink });
  const HR = (yy) => page.drawLine({ start: { x: M, y: yy }, end: { x: width - M, y: yy }, thickness: 0.5, color: line });

  T("RECHNUNG", M, y, { size: 22, f: bold });
  T(COMPANY.name, width - M - 210, y, { size: 10, f: bold });
  y -= 15; T(COMPANY.street, width - M - 210, y, { size: 9, color: muted });
  y -= 12; T(COMPANY.city, width - M - 210, y, { size: 9, color: muted });
  y -= 12; T("USt-IdNr.: " + COMPANY.vatId, width - M - 210, y, { size: 9, color: muted });
  y -= 24; HR(y); y -= 20;

  T("Rechnungsnr.", M, y, { size: 8, color: muted });
  T("Datum", M + 150, y, { size: 8, color: muted });
  T("Faellig", M + 250, y, { size: 8, color: muted });
  T("Status", M + 360, y, { size: 8, color: muted });
  y -= 13;
  T(invoice.invoice_number, M, y, { f: bold });
  T(fmtDate(invoice.issued_at), M + 150, y);
  T(fmtDate(invoice.due_at), M + 250, y);
  T((invoice.status || "issued").toUpperCase(), M + 360, y);
  y -= 26;

  T("RECHNUNGSEMPFAENGER", M, y, { size: 8, color: muted }); y -= 14;
  T(invoice.billing_name || "-", M, y, { f: bold }); y -= 13;
  const vat = invoice.billing_tax_id || invoice.user_vat_id;
  if (vat) { T("USt-IdNr.: " + vat, M, y, { size: 9, color: muted }); y -= 13; }
  y -= 10; HR(y); y -= 18;

  T("Beschreibung", M, y, { size: 8, color: muted });
  T("Menge", width - M - 170, y, { size: 8, color: muted });
  T("Betrag", width - M - 80, y, { size: 8, color: muted });
  y -= 6; HR(y); y -= 15;
  for (const it of (invoice.items || [])) {
    if (y < 130) { T("... weitere Positionen im Kundenportal", M, y, { size: 8, color: muted }); y -= 14; break; }
    T(String(it.description || "-").slice(0, 58), M, y, { size: 9 });
    T(String(it.quantity || 1), width - M - 170, y, { size: 9 });
    T(fmtCurrency(it.total_cents || it.unit_amount_cents || 0) + " EUR", width - M - 80, y, { size: 9 });
    y -= 14;
  }
  y -= 4; HR(y); y -= 16;
  const TOT = (label, val, b) => {
    T(label, width - M - 220, y, { size: b ? 11 : 9, f: b ? bold : font, color: b ? ink : muted });
    T(fmtCurrency(val) + " EUR", width - M - 80, y, { size: b ? 11 : 9, f: b ? bold : font });
    y -= b ? 18 : 14;
  };
  TOT("Netto", invoice.amount_cents);
  TOT("MwSt (" + (invoice.tax_rate_pct || 19) + "%)", invoice.tax_amount_cents);
  TOT("Gesamt", invoice.total_cents, true);
  y -= 10; HR(y); y -= 16;
  T("Abrechnungszeitraum: " + fmtDate(invoice.billing_period_start) + " - " + fmtDate(invoice.billing_period_end), M, y, { size: 8, color: muted }); y -= 12;
  T("Plan: " + (invoice.plan || "-") + "   Zahlungsbedingungen: 14 Tage netto", M, y, { size: 8, color: muted }); y -= 12;
  T(COMPANY.email + "   " + COMPANY.web, M, y, { size: 8, color: muted });

  return await doc.save();
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
