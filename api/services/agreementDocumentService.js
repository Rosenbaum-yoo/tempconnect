/**
 * Agreement Document Service — Enterprise-grade Dokument-Generierung.
 *
 * Zwei Dokumenttypen:
 * A. Konditionsblatt (vor Einigung) — aktueller Verhandlungsstand
 * B. Einsatzvereinbarung (nach Einigung) — bindender Konditions-Snapshot
 *
 * Features:
 * - TempConnect-Branding mit Dot-Logo
 * - Print/PDF-optimiert (@media print)
 * - Professionelles Grid-Layout
 * - Signaturblock mit Platzhaltern
 * - Wasserzeichen bei Entwurf
 * - Seitennummern im Footer
 */

/* ── Gemeinsame Styles (Print + Screen) ─────────────── */

const TC_BRAND_COLOR = "#4a9eff";
const TC_ACCENT = "#7c5cff";

function docStyles(isDraft) {
  return `
    *{box-sizing:border-box}
    @page{size:A4;margin:20mm 18mm 25mm 18mm}
    body{font-family:'Segoe UI',system-ui,-apple-system,Arial,sans-serif;margin:0;padding:40px 48px;color:#1a1d24;font-size:13px;line-height:1.6;max-width:860px;position:relative}
    @media print{body{padding:0;max-width:none}}

    /* ── Header / Brand ── */
    .tc-doc-header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;margin-bottom:24px;border-bottom:3px solid ${TC_BRAND_COLOR}}
    .tc-doc-brand{display:flex;align-items:center;gap:10px}
    .tc-doc-brand-dot{width:14px;height:14px;border-radius:50%;background:linear-gradient(135deg,${TC_BRAND_COLOR},${TC_ACCENT})}
    .tc-doc-brand-name{font-size:18px;font-weight:800;letter-spacing:-.02em;color:#0f172a}
    .tc-doc-brand-sub{font-size:11px;color:#64748b;margin-top:2px}
    .tc-doc-ref{text-align:right}
    .tc-doc-ref-id{font-size:16px;font-weight:800;color:${TC_BRAND_COLOR};letter-spacing:.02em}
    .tc-doc-ref-meta{font-size:11px;color:#94a3b8;margin-top:2px}

    /* ── Title ── */
    .tc-doc-title{font-size:24px;font-weight:800;letter-spacing:-.01em;color:#0f172a;margin:0 0 6px}
    .tc-doc-subtitle{font-size:13px;color:#64748b;margin:0 0 24px}

    /* ── Status Badge ── */
    .tc-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 14px;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:.02em}
    .tc-badge--draft{background:#fef3c7;color:#92400e}
    .tc-badge--active{background:#d1fae5;color:#065f46}
    .tc-badge--pending{background:#e0f2fe;color:#0369a1}
    .tc-badge--confirmed{background:#dbeafe;color:#1d4ed8}

    /* ── Section ── */
    .tc-section{margin-bottom:24px}
    .tc-section-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${TC_BRAND_COLOR};margin:0 0 12px;padding-bottom:6px;border-bottom:1px solid #e2e8f0}

    /* ── Grid ── */
    .tc-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 32px}
    .tc-grid--3{grid-template-columns:1fr 1fr 1fr}
    .tc-field{margin-bottom:10px}
    .tc-field-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin-bottom:1px}
    .tc-field-value{font-size:14px;font-weight:600;color:#1e293b}
    .tc-field-value--highlight{color:${TC_BRAND_COLOR};font-size:16px;font-weight:800}

    /* ── Parties Box ── */
    .tc-parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;padding:16px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px}
    @media print{.tc-parties{background:#f8fafc !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    .tc-party-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:4px}
    .tc-party-name{font-size:15px;font-weight:700;color:#0f172a}
    .tc-party-role{font-size:11px;color:#94a3b8;margin-top:2px}

    /* ── Highlight Box ── */
    .tc-highlight{padding:16px 20px;background:linear-gradient(135deg,rgba(74,158,255,.06),rgba(124,92,255,.04));border:1px solid rgba(74,158,255,.2);border-radius:8px;margin-bottom:24px}
    @media print{.tc-highlight{background:rgba(74,158,255,.06) !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}

    /* ── Signature Block ── */
    .tc-sig{display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:40px;padding-top:24px;border-top:2px solid #0f172a}
    .tc-sig-party{}
    .tc-sig-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:4px}
    .tc-sig-name{font-size:13px;font-weight:600;color:#1e293b;margin-bottom:48px}
    .tc-sig-line{border-top:1px solid #94a3b8;padding-top:6px;font-size:11px;color:#94a3b8}
    .tc-sig-date{font-size:11px;color:#94a3b8;margin-top:4px}

    /* ── Footer ── */
    .tc-doc-footer{margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center}
    .tc-doc-footer-left{font-size:10px;color:#94a3b8;line-height:1.5}
    .tc-doc-footer-right{font-size:10px;color:#94a3b8;text-align:right}
    @media print{.tc-doc-footer{position:fixed;bottom:0;left:0;right:0;padding:10px 18mm}}

    /* ── Watermark (Draft) ── */
    ${isDraft ? `.tc-watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-size:100px;font-weight:900;color:rgba(74,158,255,.06);pointer-events:none;z-index:0;letter-spacing:.05em}
    @media print{.tc-watermark{color:rgba(74,158,255,.04) !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}` : ""}

    /* ── Terms Box ── */
    .tc-terms{padding:12px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;font-size:12px;color:#92400e;white-space:pre-wrap;margin-bottom:16px}
    @media print{.tc-terms{background:#fffbeb !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}

    /* ── Surcharges Table ── */
    .tc-surcharges{display:flex;gap:16px;flex-wrap:wrap}
    .tc-surcharge{padding:8px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:12px;font-weight:600;color:#166534}
    @media print{.tc-surcharge{background:#f0fdf4 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}

    /* ── Legal ── */
    .tc-legal{font-size:10px;color:#94a3b8;line-height:1.5;margin-top:16px;padding:12px 16px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0}
    @media print{.tc-legal{background:#f8fafc !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}

    /* ── Print/PDF-Button (nur Screen; beim Druck/PDF ausgeblendet) ── */
    .tc-print-bar{position:fixed;top:16px;right:16px;z-index:50}
    .tc-print-btn{font:600 13px 'Segoe UI',system-ui,-apple-system,Arial,sans-serif;padding:9px 18px;border-radius:8px;border:1px solid ${TC_BRAND_COLOR};background:${TC_BRAND_COLOR};color:#fff;cursor:pointer;box-shadow:0 2px 10px rgba(74,158,255,.3)}
    .tc-print-btn:hover{background:#3b8be8}
    @media print{.tc-print-bar{display:none !important}}
  `;
}

/* ── Konditionsblatt (Verhandlungsstand) ───────────── */

export function renderConditionsSheet(offer, _format) {
  const s = offer.agreement_snapshot || offer;
  const rate = offer.offered_hourly_rate || s.offered_hourly_rate;
  const qty = offer.offered_quantity || s.offered_quantity;

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>Konditionsblatt \u2013 TempConnect</title>
<style>${docStyles(true)}</style></head><body>
<div class="tc-print-bar"><button type="button" class="tc-print-btn" data-tc-print>Als PDF speichern</button></div>
<script src="/public/js/docPrint.js"></script>
<div class="tc-watermark">ENTWURF</div>

<div class="tc-doc-header">
  <div class="tc-doc-brand">
    <div class="tc-doc-brand-dot"></div>
    <div><div class="tc-doc-brand-name">TempConnect</div><div class="tc-doc-brand-sub">Workforce Management Platform</div></div>
  </div>
  <div class="tc-doc-ref">
    <div class="tc-doc-ref-id">#${esc(String(offer.id || "—"))}</div>
    <div class="tc-doc-ref-meta">Stand: ${fmtDate(new Date())}</div>
  </div>
</div>

<div class="tc-doc-title">Konditionsblatt</div>
<div class="tc-doc-subtitle"><span class="tc-badge tc-badge--draft">In Verhandlung</span> Verhandlungsgrundlage \u2013 keine bindende Vereinbarung</div>

<div class="tc-parties">
  <div>
    <div class="tc-party-label">Anfragendes Unternehmen</div>
    <div class="tc-party-name">${esc(s.requester_company || offer.requester_company_name || "\u2014")}</div>
    <div class="tc-party-role">Auftraggeber</div>
  </div>
  <div>
    <div class="tc-party-label">Liefernde Agentur</div>
    <div class="tc-party-name">${esc(s.supplier_company_name || offer.supplier_company_name || "\u2014")}</div>
    <div class="tc-party-role">Personaldienstleister</div>
  </div>
</div>

<div class="tc-section">
  <div class="tc-section-title">Bedarfsprofil</div>
  <div class="tc-grid">
    <div class="tc-field"><div class="tc-field-label">Rolle / T\u00e4tigkeit</div><div class="tc-field-value">${esc(s.demand_role || offer.demand_role || "\u2014")}</div></div>
    <div class="tc-field"><div class="tc-field-label">Einsatzort</div><div class="tc-field-value">${esc(s.demand_location || offer.demand_location || "\u2014")}</div></div>
    <div class="tc-field"><div class="tc-field-label">Einsatzzeitraum</div><div class="tc-field-value">${fmtDate(s.demand_start || offer.demand_start)} \u2013 ${fmtDate(s.demand_end || offer.demand_end)}</div></div>
    <div class="tc-field"><div class="tc-field-label">Personenbedarf</div><div class="tc-field-value">${s.demand_headcount || offer.demand_headcount || "\u2014"} Personen</div></div>
  </div>
</div>

<div class="tc-highlight">
  <div class="tc-section-title" style="border:none;margin-bottom:8px;padding:0">Angebotene Konditionen</div>
  <div class="tc-grid--3" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 24px">
    <div class="tc-field"><div class="tc-field-label">Stundensatz</div><div class="tc-field-value--highlight">${rate ? fmtMoney(rate) + " EUR/h" : "\u2014"}</div></div>
    <div class="tc-field"><div class="tc-field-label">Menge</div><div class="tc-field-value--highlight">${qty || "\u2014"} Personen</div></div>
    <div class="tc-field"><div class="tc-field-label">Abrechnung</div><div class="tc-field-value">${esc(offer.billing_unit || s.billing_unit || "Stundenbasis")}</div></div>
    <div class="tc-field"><div class="tc-field-label">Start best\u00e4tigt</div><div class="tc-field-value">${fmtDate(offer.start_confirmed || s.start_confirmed)}</div></div>
    <div class="tc-field"><div class="tc-field-label">Reaktionszeit</div><div class="tc-field-value">${offer.response_time_minutes || s.response_time_minutes ? (offer.response_time_minutes || s.response_time_minutes) + " Min" : "\u2014"}</div></div>
    <div class="tc-field"><div class="tc-field-label">Ersatzstellung SLA</div><div class="tc-field-value">${offer.replacement_sla_minutes || s.replacement_sla_minutes ? (offer.replacement_sla_minutes || s.replacement_sla_minutes) + " Min" : "\u2014"}</div></div>
  </div>
</div>

${(offer.surcharges || s.surcharges) ? `<div class="tc-section"><div class="tc-section-title">Zuschl\u00e4ge</div><div class="tc-surcharges">${formatSurchargesHtml(offer.surcharges || s.surcharges)}</div></div>` : ""}
${(offer.terms || s.terms) ? `<div class="tc-section"><div class="tc-section-title">Besondere Vereinbarungen</div><div class="tc-terms">${esc(offer.terms || s.terms)}</div></div>` : ""}

<div class="tc-legal">
  Dieses Konditionsblatt ist eine unverbindliche Verhandlungsgrundlage und stellt keine rechtsverbindliche Vereinbarung dar.
  Die endg\u00fcltigen Konditionen werden in der Einsatzvereinbarung festgehalten.
</div>

<div class="tc-doc-footer">
  <div class="tc-doc-footer-left">TempConnect \u00b7 Workforce Management Platform<br>Generiert: ${fmtDateTime(new Date())}</div>
  <div class="tc-doc-footer-right">Konditionsblatt<br>Seite 1 von 1</div>
</div>
</body></html>`;
}

/* ── Einsatzvereinbarung (bindendes Dokument) ──────── */

export function renderAgreementDocument(offer) {
  const s = offer.agreement_snapshot || {};
  const ref = offer.agreement_ref || "\u2014";
  const isDraft = offer.agreement_status === "pending_confirmation";
  const isConfirmed = offer.agreement_status === "confirmed";
  const isActivated = offer.agreement_status === "activated";

  const statusLabel = {
    pending_confirmation: "Warte auf Bestätigung",
    confirmed: "Bestätigt",
    activated: "Einsatz aktiviert",
    cancelled: "Storniert",
    expired: "Abgelaufen"
  }[offer.agreement_status] || offer.agreement_status || "—";
  const badgeClass = isActivated ? "tc-badge--active" : isConfirmed ? "tc-badge--confirmed" : "tc-badge--pending";
  const effectiveSignatureStatus = offer.signature_status || (offer.signature_required ? "pending" : "not_required");

  const signatureStatusLabel = {
    not_required: "Keine Signatur erforderlich",
    pending: "Signatur vorbereitet \u2013 ausstehend",
    partially_signed: "Teilweise signiert",
    fully_signed: "Vollst\u00e4ndig signiert",
    failed: "Signatur fehlgeschlagen",
    expired: "Signatur abgelaufen"
  }[effectiveSignatureStatus] || "Signaturstatus offen";

  const rate = s.offered_hourly_rate;
  const qty = s.offered_quantity || s.demand_headcount;

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>Einsatzvereinbarung ${esc(ref)} \u2013 TempConnect</title>
<style>${docStyles(isDraft)}</style></head><body>
<div class="tc-print-bar"><button type="button" class="tc-print-btn" data-tc-print>Als PDF speichern</button></div>
<script src="/public/js/docPrint.js"></script>
${isDraft ? '<div class="tc-watermark">ENTWURF</div>' : ""}

<div class="tc-doc-header">
  <div class="tc-doc-brand">
    <div class="tc-doc-brand-dot"></div>
    <div><div class="tc-doc-brand-name">TempConnect</div><div class="tc-doc-brand-sub">Workforce Management Platform</div></div>
  </div>
  <div class="tc-doc-ref">
    <div class="tc-doc-ref-id">${esc(ref)}</div>
    <div class="tc-doc-ref-meta">Version ${offer.agreement_version || 1} \u00b7 ${fmtDate(s.snapshot_at || offer.created_at)}</div>
  </div>
</div>

<div class="tc-doc-title">EINSATZVEREINBARUNG</div>
<div class="tc-doc-subtitle">
  <span class="tc-badge ${badgeClass}">${esc(statusLabel)}</span>
  Verbindliche Einsatzabsprache zwischen den nachfolgenden Parteien
</div>

<div class="tc-parties">
  <div>
    <div class="tc-party-label">Auftraggeber</div>
    <div class="tc-party-name">${esc(s.requester_company || offer.requester_company_name || "\u2014")}</div>
    <div class="tc-party-role">Anfragendes Unternehmen</div>
  </div>
  <div>
    <div class="tc-party-label">Personaldienstleister</div>
    <div class="tc-party-name">${esc(s.supplier_company_name || offer.supplier_company_name || "\u2014")}</div>
    <div class="tc-party-role">Liefernde Agentur</div>
  </div>
</div>

<div class="tc-section">
  <div class="tc-section-title">\u00a71 Einsatzgegenstand</div>
  <div class="tc-grid">
    <div class="tc-field"><div class="tc-field-label">Rolle / T\u00e4tigkeit</div><div class="tc-field-value">${esc(s.demand_role || "\u2014")}</div></div>
    <div class="tc-field"><div class="tc-field-label">Einsatzort</div><div class="tc-field-value">${esc(s.demand_location || "\u2014")}</div></div>
    <div class="tc-field"><div class="tc-field-label">Einsatzzeitraum</div><div class="tc-field-value">${fmtDate(s.start_confirmed || s.demand_start)} \u2013 ${fmtDate(s.end_date || s.demand_end)}</div></div>
    <div class="tc-field"><div class="tc-field-label">Personenzahl</div><div class="tc-field-value">${qty || "\u2014"} Personen</div></div>
  </div>
</div>

<div class="tc-highlight">
  <div class="tc-section-title" style="border:none;margin-bottom:8px;padding:0">\u00a72 Verg\u00fctung &amp; Konditionen</div>
  <div class="tc-grid--3" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 24px">
    <div class="tc-field"><div class="tc-field-label">Stundensatz</div><div class="tc-field-value--highlight">${rate ? fmtMoney(rate) + " EUR/h" : "\u2014"}</div></div>
    <div class="tc-field"><div class="tc-field-label">Abrechnung</div><div class="tc-field-value">${esc(s.billing_unit || "Stundenbasis")}</div></div>
    <div class="tc-field"><div class="tc-field-label">G\u00fcltigkeit</div><div class="tc-field-value">${fmtDate(s.validity_until)}</div></div>
    <div class="tc-field"><div class="tc-field-label">Reaktionszeit</div><div class="tc-field-value">${s.response_time_minutes ? s.response_time_minutes + " Minuten" : "\u2014"}</div></div>
    <div class="tc-field"><div class="tc-field-label">Ersatzstellung SLA</div><div class="tc-field-value">${s.replacement_sla_minutes ? s.replacement_sla_minutes + " Minuten" : "\u2014"}</div></div>
    <div class="tc-field"><div class="tc-field-label">Min. Stunden/Schicht</div><div class="tc-field-value">${s.min_hours_per_shift || "\u2014"}</div></div>
  </div>
</div>

${s.surcharges ? `<div class="tc-section"><div class="tc-section-title">\u00a73 Zuschl\u00e4ge</div><div class="tc-surcharges">${formatSurchargesHtml(s.surcharges)}</div></div>` : ""}

${s.terms ? `<div class="tc-section"><div class="tc-section-title">${s.surcharges ? "\u00a74" : "\u00a73"} Besondere Vereinbarungen</div><div class="tc-terms">${esc(s.terms)}</div></div>` : ""}

${s.cancellation_policy ? `<div class="tc-section"><div class="tc-section-title">Stornierung / Kündigung</div>
<div class="tc-grid"><div class="tc-field"><div class="tc-field-label">K\u00fcndigungsfrist</div><div class="tc-field-value">${s.cancellation_policy.notice_hours || "\u2014"} Stunden</div></div>
<div class="tc-field"><div class="tc-field-label">Vertragsstrafe</div><div class="tc-field-value">${s.cancellation_policy.penalty_percent || 0}%</div></div></div></div>` : ""}

<div class="tc-section">
  <div class="tc-section-title">Signatur &amp; Best\u00e4tigung</div>
  <div class="tc-grid">
    <div class="tc-field"><div class="tc-field-label">Signaturstatus</div><div class="tc-field-value">${esc(signatureStatusLabel)}</div></div>
    ${offer.signature_provider ? `<div class="tc-field"><div class="tc-field-label">Provider</div><div class="tc-field-value">${esc(offer.signature_provider)}</div></div>` : ""}
  </div>
</div>

<div class="tc-sig">
  <div class="tc-sig-party">
    <div class="tc-sig-label">Auftraggeber</div>
    <div class="tc-sig-name">${esc(s.requester_company || offer.requester_company_name || "\u2014")}</div>
    <div class="tc-sig-line">Unterschrift / Digitale Best\u00e4tigung</div>
    <div class="tc-sig-date">Datum: ____________________</div>
  </div>
  <div class="tc-sig-party">
    <div class="tc-sig-label">Personaldienstleister</div>
    <div class="tc-sig-name">${esc(s.supplier_company_name || offer.supplier_company_name || "\u2014")}</div>
    <div class="tc-sig-line">Unterschrift / Digitale Best\u00e4tigung</div>
    <div class="tc-sig-date">${offer.confirmed_at ? "Best\u00e4tigt am: " + fmtDate(offer.confirmed_at) : "Datum: ____________________"}</div>
  </div>
</div>

<div class="tc-legal">
  Diese Einsatzvereinbarung ist eine verbindliche Einsatzabsprache und Grundlage f\u00fcr den operativen Vertragsabschluss
  zwischen den oben genannten Parteien. Sie ersetzt nicht den vollst\u00e4ndigen Arbeitnehmer\u00fcberlassungsvertrag,
  bildet jedoch die operative Basis f\u00fcr die Personalbereitstellung und Worker-Zuweisung.
  ${offer.assignment_id ? `<br><br><strong>Assignment-Referenz:</strong> ${esc(offer.assignment_id)}` : ""}
</div>

<div class="tc-doc-footer">
  <div class="tc-doc-footer-left">
    TempConnect \u00b7 Workforce Management Platform<br>
    Erstellt: ${fmtDateTime(s.snapshot_at || offer.created_at)}${offer.activated_at ? " \u00b7 Aktiviert: " + fmtDateTime(offer.activated_at) : ""}
  </div>
  <div class="tc-doc-footer-right">
    Einsatzvereinbarung ${esc(ref)}<br>
    Seite 1 von 1
  </div>
</div>
</body></html>`;
}

/* ── Helpers ───────────────────────────────────────── */

function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function fmtDate(d) {
  if (!d) return "\u2014";
  try { return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch { return "\u2014"; }
}

function fmtDateTime(d) {
  if (!d) return "\u2014";
  try { return new Date(d).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return "\u2014"; }
}

function fmtMoney(v) {
  if (v == null) return "\u2014";
  return Number(v).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatSurchargesHtml(s) {
  if (!s || typeof s !== "object") return '<span class="tc-field-value">Keine</span>';
  const parts = [];
  if (s.night) parts.push(`<div class="tc-surcharge">Nacht: +${s.night}%</div>`);
  if (s.weekend) parts.push(`<div class="tc-surcharge">Wochenende: +${s.weekend}%</div>`);
  if (s.holiday) parts.push(`<div class="tc-surcharge">Feiertag: +${s.holiday}%</div>`);
  return parts.length ? parts.join("") : '<span class="tc-field-value">Keine Zuschl\u00e4ge vereinbart</span>';
}
