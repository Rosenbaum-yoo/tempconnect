/**
 * Export Service: Reusable CSV generation for enterprise data exports.
 * Follows the established pattern from invoiceService.exportInvoicesCsv().
 * All functions are pure (no DB access) — call with pre-fetched data.
 */

import { dateOnlyDE } from "../utils/dateDE.js";

/* ── Shared Helpers ────────────────────────────────────────── */

/**
 * Escape a single CSV field (RFC 4180 compliant).
 * @param {*} v - Any value
 * @returns {string}
 */
export function escapeCsvField(v) {
  if (v == null) return "";
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

/**
 * Build a CSV row from an ordered list of field values.
 * @param {Array<*>} values
 * @returns {string}
 */
export function toCsvRow(values) {
  return values.map(escapeCsvField).join(",");
}

/**
 * Format a date value for CSV output (ISO date or empty).
 *
 * Klasse DB_WERT_NACH_UTC: die Aufrufer geben DATE-Spalten herein
 * (timesheets.week_start / week_end). node-postgres parst DATE als LOKALE
 * Mitternacht; in Europe/Berlin ist das 22:00/23:00 UTC des Vortags. Mit
 * toISOString() trug jeder Stundenzettel-CSV-Export ganztaegig — nicht nur
 * nachts — die Abrechnungswoche einen Tag zu frueh: Montag 10.08. erschien als
 * Sonntag 09.08. Dieser Export geht in die Lohnabrechnung.
 *
 * @param {*} v
 * @returns {string}
 */
function fmtDate(v) {
  if (!v) return "";
  return dateOnlyDE(v) || "";
}

/**
 * Format a datetime value for CSV output (ISO datetime or empty).
 *
 * Bewusst UTC: submitted_at / approved_at / rejected_at / created_at sind
 * Zeitstempel mit Uhrzeit, kein Kalendertag. Hier ist UTC richtig und gewollt.
 *
 * @param {*} v
 * @returns {string}
 */
/*
 * ZEITPUNKTE IN BERLINER ZEIT (berichtigt am 2026-10-01).
 *
 * Hier stand `toISOString().replace("T", " ").slice(0, 19)` — also UTC, ohne
 * Kennzeichnung. Ein Protokolleintrag von 09:50 Uhr stand im Export als 07:50;
 * im Sommer zwei Stunden daneben, im Winter eine. Fuer einen Export, mit dem eine
 * Firma etwas NACHWEISEN will ("wann hat sie die Stunden eingereicht?"), ist das
 * der falsche Wert, und die Projektregel ist eindeutig: alle Zeitwerte in
 * Europe/Berlin (CLAUDE.md, Living-Platform-Direktiven). Das Format bleibt
 * `JJJJ-MM-TT HH:MM:SS` — wer die Datei maschinell einliest, merkt nur, dass die
 * Uhrzeit jetzt stimmt.
 */
const BERLIN_ZEITPUNKT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
});

export function fmtDateTime(v) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : BERLIN_ZEITPUNKT.format(d);
}

/**
 * Text, den Menschen eingegeben haben, darf in einer Tabellenkalkulation nicht
 * als Formel loslaufen ("=HYPERLINK(...)" als Vorname). Eine fuehrende Formel-
 * Marke bekommt deshalb ein Hochkomma (OWASP: CSV Injection). NUR fuer Textfelder —
 * Zahlen wie "-5" wuerden sonst zu Text.
 */
export function csvText(v) {
  const s = v == null ? "" : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/* ── Timesheet CSV Export ──────────────────────────────────── */

const TIMESHEET_HEADERS = [
  "id", "worker_name", "org_name", "supplier_org_name",
  "status", "week_start", "week_end",
  "total_hours", "overtime_hours",
  "submitted_at", "approved_at", "rejected_at"
];

/**
 * Export timesheets as CSV string.
 * @param {Array<Object>} timesheets - Rows from listTimesheets (with JOINed org names)
 * @returns {string}
 */
export function exportTimesheetsCsv(timesheets) {
  const rows = (timesheets || []).map(ts => toCsvRow([
    ts.id,
    ts.worker_name,
    ts.org_name,
    ts.supplier_org_name,
    ts.status,
    fmtDate(ts.week_start),
    fmtDate(ts.week_end),
    ts.total_hours ?? "",
    ts.overtime_hours ?? "",
    fmtDateTime(ts.submitted_at),
    fmtDateTime(ts.approved_at),
    fmtDateTime(ts.rejected_at)
  ]));
  return [TIMESHEET_HEADERS.join(","), ...rows].join("\n");
}

/* ── Deal / Request CSV Export ─────────────────────────────── */

const DEAL_HEADERS = [
  "id", "title", "buyer_company", "supplier_company",
  "status", "priority", "urgency",
  "max_hourly_rate_eur", "workers_needed",
  "created_at", "updated_at"
];

/**
 * Export deals/requests as CSV string.
 * @param {Array<Object>} deals - Rows from requests/deals list query
 * @returns {string}
 */
export function exportDealsCsv(deals) {
  const rows = (deals || []).map(d => toCsvRow([
    d.id,
    d.title || d.role || "",
    d.buyer_company || d.company_name || "",
    d.supplier_company || d.supplier_name || "",
    d.status,
    d.priority || "",
    d.urgency || "",
    d.max_hourly_rate_cents ? ((d.max_hourly_rate_cents / 100).toFixed(2)) : "",
    d.workers_needed ?? "",
    fmtDateTime(d.created_at),
    fmtDateTime(d.updated_at)
  ]));
  return [DEAL_HEADERS.join(","), ...rows].join("\n");
}

/* ── Audit Log CSV Export ──────────────────────────────────── */

const AUDIT_HEADERS = [
  "id", "action", "action_type", "entity_type", "entity_id",
  "actor_email", "actor_name", "status",
  "created_at", "details_summary"
];

/**
 * Export audit log entries as CSV string.
 * @param {Array<Object>} entries - Rows from queryAuditLog (with actor JOINs)
 * @returns {string}
 */
export function exportAuditLogCsv(entries) {
  const rows = (entries || []).map(e => {
    // Summarize details as a short string (max 200 chars, no newlines)
    let detailsSummary = "";
    if (e.details) {
      try {
        const d = typeof e.details === "string" ? JSON.parse(e.details) : e.details;
        detailsSummary = Object.entries(d).map(([k, v]) => `${k}=${v}`).join("; ").slice(0, 200);
      } catch { detailsSummary = String(e.details).slice(0, 200); }
    }
    return toCsvRow([
      e.id,
      e.action,
      e.action_type,
      e.entity_type,
      e.entity_id,
      e.actor_email || "",
      e.actor_name || e.actor_company || "",
      e.status,
      fmtDateTime(e.created_at),
      detailsSummary.replace(/[\r\n]/g, " ")
    ]);
  });
  return [AUDIT_HEADERS.join(","), ...rows].join("\n");
}

/* ── Einsatzportal-Sitzungen (Owner 2026-10-01) ─────────────── */

const SITZUNGEN_HEADERS = ["Mitarbeiter", "E-Mail", "Angemeldet", "Bis", "Ende", "Aktionen", "Aktionen im Einzelnen"];
const ENDE_TEXT = {
  abgemeldet: "abgemeldet",
  alle_abgemeldet: "überall abgemeldet",
  abgelaufen: "ohne Abmeldung, abgelaufen (Bis = zuletzt aktiv)",
  offen: "ohne Abmeldung, noch offen"
};

/**
 * Eine Zeile je Sitzung — fuer den Nachweis, wer wann im Einsatzportal war und
 * was er dabei getan hat. Zeiten in Berliner Zeit.
 * @param {Array<object>} sitzungen  wie `einsatzportalSitzungService.liste().items`
 */
export function exportEinsatzportalSitzungenCsv(sitzungen) {
  const rows = (sitzungen || []).map((z) => toCsvRow([
    csvText(z.name),
    csvText(z.email),
    fmtDateTime(z.begonnen_am),
    fmtDateTime(z.bis),
    ENDE_TEXT[z.status] || z.status || "",
    (z.aktionen || []).length,
    csvText((z.aktionen || []).map((a) => `${fmtDateTime(a.zeitpunkt).slice(11, 16)} ${a.label}`).join(" | "))
  ]));
  return [SITZUNGEN_HEADERS.join(","), ...rows].join("\n");
}
