/**
 * subscriptionDocumentService.js
 *
 * Generiert + verwaltet Tarif-/Vertrags-relevante Dokumente in Tabelle
 * `subscription_documents` (Migration 101).
 *
 * Dokumenttypen:
 *   - cost_preview              Unverbindliche Kostenvorschau (KV-...)
 *   - offer                     Verbindliches Angebot (ANG-...)
 *   - order_confirmation        Auftragsbestaetigung (AB-...)
 *   - change_confirmation       Bestaetigung Upgrade/Downgrade (AE-...)
 *   - cancellation_confirmation Kuendigungsbestaetigung (KB-...)
 *
 * Inhalt: HTML oder optional PDF (base64 im DB-Adapter). Jedes Dokument
 * traegt zentrale Plattform-/Vermittler-Hinweise und KEINE Arbeitnehmer-
 * ueberlassungs-Zusage.
 *
 * Sicherheit:
 *   - Aufrufer (Routen) sind verantwortlich fuer Org-/Staff-Auth.
 *   - Service liest und schreibt nur die Daten, die im Aufruf uebergeben
 *     werden bzw. aus subscription_requests gefroren werden.
 */

import { PLAN_LIMITS } from "./userService.js";
import { PLAN_CATALOG, ADDON_CATALOG, INDIVIDUELL_BASELINE } from "../config/planCatalog.js";
import {
  renderDocumentDisclaimersHtml,
  renderPlatformNoticeHtml
} from "./subscriptionDocumentDisclaimer.js";
import { renderPdfFromHtml } from "./subscriptionDocumentPdfService.js";
import {
  computeContentHash,
  createSubscriptionDocumentStorageAdapter,
  materializeDocumentContent,
  normalizeDocumentFormat
} from "./subscriptionDocumentStorageService.js";

const TYPE_PREFIX = Object.freeze({
  cost_preview:              "KV",
  offer:                     "ANG",
  order_confirmation:        "AB",
  change_confirmation:       "AE",
  cancellation_confirmation: "KB"
});

const TYPE_TITLE = Object.freeze({
  cost_preview:              "Unverbindliche Kostenvorschau",
  offer:                     "Angebot",
  order_confirmation:        "Auftragsbestaetigung",
  change_confirmation:       "Aenderungsbestaetigung",
  cancellation_confirmation: "Kuendigungsbestaetigung"
});


/* ── Public API ─────────────────────────────────────────────── */

/**
 * Generiert ein Dokument und persistiert es. Wenn `subscriptionRequestId`
 * gesetzt ist, werden Snapshot-Felder aus dem Request gefroren.
 *
 * @param {import('pg').Pool} pool
 * @param {Object} input
 * @param {string} input.documentType
 * @param {string} [input.subscriptionRequestId]
 * @param {string} [input.orgId]
 * @param {Object} [input.dataOverride]   Zusatz-Felder fuer Public/cost_preview
 * @param {string} [input.actorUserId]
 * @param {'html'|'pdf'} [input.format]    Wunschformat; PDF faellt sicher auf HTML zurueck
 * @param {Function} [input.pdfRenderer]   Test-/Adapter-Injection
 * @param {Object} [input.storageAdapter]  Storage-Adapter-Injection
 * @returns {Promise<{ok: boolean, error?: string, row?: Object}>}
 */
export async function generateDocument(pool, input) {
  if (!input || !input.documentType) {
    return { ok: false, error: "DOCUMENT_TYPE_REQUIRED" };
  }
  if (!TYPE_PREFIX[input.documentType]) {
    return { ok: false, error: "INVALID_DOCUMENT_TYPE" };
  }

  let snapshot = input.dataOverride ? { ...input.dataOverride } : {};
  let orgId = input.orgId || null;
  const subscriptionRequestId = input.subscriptionRequestId || null;
  let contactEmail = snapshot.contact_email || null;
  let contactName = snapshot.contact_name || null;
  let totalCents = Number.isFinite(snapshot.total_cents) ? snapshot.total_cents : null;
  let effectiveFrom = snapshot.effective_from || null;
  let effectiveUntil = snapshot.effective_until || null;

  if (subscriptionRequestId) {
    const reqRow = await loadRequestSnapshot(pool, subscriptionRequestId);
    if (!reqRow) return { ok: false, error: "REQUEST_NOT_FOUND" };
    snapshot = mergeRequestIntoSnapshot(snapshot, reqRow);
    orgId = orgId || reqRow.org_id || null;
    contactEmail = contactEmail || reqRow.contact_email || null;
    contactName = contactName || reqRow.contact_name || null;
    totalCents = totalCents != null ? totalCents : computeTotalCentsFromRequest(reqRow);
    effectiveFrom = effectiveFrom || reqRow.effective_from || reqRow.expected_start_date || reqRow.cancellation_effective_at || null;
    effectiveUntil = effectiveUntil || reqRow.effective_until || null;
  }

  // Empty-Document-Guard: ein Dokument muss minimal kennen, was es darstellt.
  const planForRender = snapshot.desired_plan || snapshot.current_plan || snapshot.plan || null;
  const hasMinimalContent =
    planForRender ||
    (Array.isArray(snapshot.selected_addons) && snapshot.selected_addons.length) ||
    (snapshot.title && String(snapshot.title).trim());
  if (!hasMinimalContent) {
    return { ok: false, error: "EMPTY_DOCUMENT" };
  }

  const documentNumber = await nextDocumentNumber(pool, input.documentType);
  const title = snapshot.title || `${TYPE_TITLE[input.documentType]} ${documentNumber}`;
  const html = renderHtml(input.documentType, {
    documentNumber,
    title,
    snapshot,
    contactEmail,
    contactName,
    totalCents,
    effectiveFrom,
    effectiveUntil
  });
  const output = await buildDocumentOutput(html, input);
  snapshot = {
    ...snapshot,
    document_output: output.metadata
  };

  const storage = input.storageAdapter || createSubscriptionDocumentStorageAdapter(pool);
  const row = await storage.storeDocument({
    documentType: input.documentType,
    documentNumber,
    orgId,
    subscriptionRequestId,
    title,
    format: output.format,
    content: output.content,
    contentHash: output.contentHash,
    dataSnapshot: snapshot,
    contactEmail,
    contactName,
    totalCents,
    effectiveFrom,
    effectiveUntil,
    actorUserId: input.actorUserId || null
  });

  // Aelteres Dokument vom selben Typ + selber subscription_request -> superseded
  if (subscriptionRequestId) {
    try {
      await pool.query(
        `UPDATE subscription_documents
            SET status = 'superseded', superseded_by = $3, updated_at = NOW()
          WHERE subscription_request_id = $1
            AND document_type = $2
            AND id <> $3
            AND status = 'issued'`,
        [subscriptionRequestId, input.documentType, row.id]
      );
    } catch { /* non-critical */ }
  }
  return { ok: true, row };
}

/**
 * Idempotenter Auto-Hook fuer Status-/Lifecycle-Pfade. Anders als die
 * manuelle `generateDocument`-Route erzeugt diese Funktion ein Dokument
 * pro Request+Typ nur einmal und liefert danach das bestehende issued-Dokument
 * zurueck.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} pool
 * @param {Object} input
 * @param {string} input.documentType
 * @param {string} input.subscriptionRequestId
 * @param {string} [input.actorUserId]
 * @param {Object} [input.dataOverride]
 * @returns {Promise<{ok: boolean, error?: string, row?: Object, created?: boolean, already_exists?: boolean}>}
 */
export async function ensureDocumentForRequest(pool, input) {
  if (!input || !input.documentType) {
    return { ok: false, error: "DOCUMENT_TYPE_REQUIRED" };
  }
  if (!TYPE_PREFIX[input.documentType]) {
    return { ok: false, error: "INVALID_DOCUMENT_TYPE" };
  }
  if (!input.subscriptionRequestId) {
    return { ok: false, error: "REQUEST_ID_REQUIRED" };
  }

  const existing = await pool.query(
    `SELECT id, document_type, document_number, status, title, format, issued_at,
            download_count, subscription_request_id
       FROM subscription_documents
      WHERE subscription_request_id = $1
        AND document_type = $2
        AND status = 'issued'
      ORDER BY issued_at DESC
      LIMIT 1`,
    [input.subscriptionRequestId, input.documentType]
  );
  if (existing.rows[0]) {
    return {
      ok: true,
      row: existing.rows[0],
      created: false,
      already_exists: true
    };
  }

  const generated = await generateDocument(pool, input);
  return {
    ...generated,
    created: generated.ok === true,
    already_exists: false
  };
}

export async function getDocument(pool, id) {
  const { rows } = await pool.query(
    "SELECT * FROM subscription_documents WHERE id = $1",
    [id]
  );
  return rows[0] || null;
}

export async function listForOrg(pool, orgId, opts = {}) {
  const limit = Math.min(200, Math.max(1, Number(opts.limit) || 50));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const conds = ["org_id = $1"];
  const params = [orgId];
  if (opts.documentType) { params.push(opts.documentType); conds.push(`document_type = $${params.length}`); }
  if (opts.status) { params.push(opts.status); conds.push(`status = $${params.length}`); }
  params.push(limit);
  params.push(offset);
  const { rows } = await pool.query(
    `SELECT id, document_type, document_number, status, title, format, total_cents, currency,
            contact_email, effective_from, effective_until, issued_at, download_count,
            subscription_request_id
       FROM subscription_documents
      WHERE ${conds.join(" AND ")}
      ORDER BY issued_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

export async function listForRequest(pool, subscriptionRequestId) {
  const { rows } = await pool.query(
    `SELECT id, document_type, document_number, status, title, format, issued_at, download_count
       FROM subscription_documents
      WHERE subscription_request_id = $1
      ORDER BY issued_at DESC`,
    [subscriptionRequestId]
  );
  return rows;
}

export async function markDownloaded(pool, { id, actorUserId = null }) {
  const { rows } = await pool.query(
    `UPDATE subscription_documents
        SET download_count = download_count + 1,
            last_downloaded_at = NOW(),
            last_downloaded_by = $2,
            updated_at = NOW()
      WHERE id = $1
      RETURNING id, download_count, last_downloaded_at`,
    [id, actorUserId]
  );
  return rows[0] || null;
}

export function getDocumentDownloadPayload(row) {
  return materializeDocumentContent(row);
}

export { computeContentHash };

/* ── Rendering ──────────────────────────────────────────────── */

export function renderHtml(documentType, ctx) {
  const sn = ctx.snapshot || {};
  const quote = isPlainObject(sn.quote_snapshot) ? sn.quote_snapshot : {};
  const planLabel = (quote.plan || sn.desired_plan || sn.current_plan || sn.plan || "DEMO").toString();
  const planMeta = PLAN_CATALOG.find((p) => p.key === planLabel) || null;
  const limits = isPlainObject(sn.limits_snapshot)
    ? sn.limits_snapshot
    : isPlainObject(quote.limits)
      ? quote.limits
      : PLAN_LIMITS[planLabel] || PLAN_LIMITS.DEMO;

  const selectedAddons = Array.isArray(sn.selected_addons)
    ? sn.selected_addons
    : Array.isArray(quote.addons)
      ? quote.addons
      : [];
  const addonsHtml = selectedAddons.length
    ? '<ul>' + selectedAddons.map((a) => {
        const meta = ADDON_CATALOG.find((x) => x.key === a.key);
        const priceCents = Number.isFinite(a.price_cents) ? a.price_cents : (meta ? meta.price_cents : null);
        const priceInterval = a.interval || (meta ? meta.interval : null);
        const price = Number.isFinite(priceCents)
          ? fmtCents(priceCents) + (priceInterval ? " (" + priceInterval + ")" : "")
          : "";
        return '<li>' + esc(a.name || (meta && meta.name) || a.key) + (price ? ' &mdash; ' + price : '') + '</li>';
      }).join("") + '</ul>'
    : '<p>Keine Add-ons.</p>';
  const featureList = Array.isArray(sn.desired_features) && sn.desired_features.length
    ? sn.desired_features
    : Array.isArray(quote.feature_keys)
      ? quote.feature_keys
      : [];
  const featuresHtml = featureList.length
    ? '<ul>' + featureList.map((f) => '<li>' + esc(f) + '</li>').join("") + '</ul>'
    : '';

  const limitsHtml =
    '<table class="kv">' +
      row("Anfragen senden / Monat", fmtLimit(limits.requests_send)) +
      row("Anfragen empfangen / Monat", fmtLimit(limits.requests_receive)) +
      row("Aktive Listings", fmtLimit(limits.listings)) +
      row("Worker pro Anfrage", fmtLimit(limits.max_workers_per_request)) +
      row("Notdienst", limits.notdienst ? "Verfuegbar" : "Nein") +
      row("SLA-Stufe", limits.sla_level || "none") +
      (planLabel === "INDIVIDUELL" ? row("Seats inklusive", String(INDIVIDUELL_BASELINE.seats_included)) : "") +
    '</table>';

  const totalCents = Number.isFinite(ctx.totalCents) ? ctx.totalCents : null;
  const planDisplay = sn.plan_display_label || sn.plan_label || quote.plan_display_label || quote.plan_label || (planMeta ? planMeta.display_label : planLabel);

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8"/>
<title>${esc(TYPE_TITLE[documentType])} ${esc(ctx.documentNumber)}</title>
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 800px; margin: 32px auto; padding: 0 24px; color: #1a1a1a; }
  h1 { margin: 0 0 8px; font-size: 24px; }
  h2 { margin: 24px 0 8px; font-size: 16px; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; }
  .meta { display: grid; grid-template-columns: 180px 1fr; gap: 4px 12px; font-size: 13px; }
  .meta dt { color: #666; }
  .total { font-size: 22px; font-weight: 800; margin: 12px 0; }
  .disclaimer { font-size: 11px; color: #555; line-height: 1.5; margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e5e5; }
  .platform-note { font-size: 12px; padding: 12px; background: #f5f5f5; border-left: 4px solid #4a9eff; margin: 12px 0; }
  table.kv { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.kv td { padding: 4px 8px; border-bottom: 1px solid #f0f0f0; }
  table.kv td:first-child { color: #666; width: 220px; }
  ul { margin: 4px 0 0 0; padding-left: 20px; font-size: 13px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; }
  .header .brand { font-size: 11px; color: #666; }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>${esc(ctx.title)}</h1>
    <div style="font-size:12px;color:#666">Dokumentnummer: <strong>${esc(ctx.documentNumber)}</strong></div>
    <div style="font-size:12px;color:#666">Datum: ${esc(new Date().toLocaleDateString("de-DE"))}</div>
  </div>
  <div class="brand">TempConnect Plattform</div>
</div>

<div class="platform-note">${renderPlatformNoticeHtml()}</div>

<h2>Empfaenger</h2>
<dl class="meta">
  <dt>Organisation</dt><dd>${esc(sn.requester_company_name || sn.org_name || "&ndash;")}</dd>
  <dt>Ansprechpartner</dt><dd>${esc(ctx.contactName || sn.contact_name || "&ndash;")}</dd>
  <dt>E-Mail</dt><dd>${esc(ctx.contactEmail || sn.contact_email || "&ndash;")}</dd>
  ${sn.contact_phone ? `<dt>Telefon</dt><dd>${esc(sn.contact_phone)}</dd>` : ""}
  ${sn.street ? `<dt>Adresse</dt><dd>${esc(sn.street)}${sn.city ? ", " + esc(sn.city) : ""}</dd>` : ""}
</dl>

<h2>Tarif</h2>
<dl class="meta">
  <dt>Plan</dt><dd>${esc(planDisplay)}</dd>
  ${sn.desired_individual_tier || quote.individual_tier ? `<dt>Tier</dt><dd>${esc(sn.desired_individual_tier || quote.individual_tier)}</dd>` : ""}
  ${sn.quote_catalog_version || quote.catalog_version ? `<dt>Preisstand</dt><dd>${esc(sn.quote_catalog_version || quote.catalog_version)}</dd>` : ""}
  ${ctx.effectiveFrom ? `<dt>Wirksam ab</dt><dd>${esc(fmtDate(ctx.effectiveFrom))}</dd>` : ""}
  ${ctx.effectiveUntil ? `<dt>Wirksam bis</dt><dd>${esc(fmtDate(ctx.effectiveUntil))}</dd>` : ""}
  ${sn.proposed_term_months || quote.proposed_term_months ? `<dt>Laufzeit</dt><dd>${esc(sn.proposed_term_months || quote.proposed_term_months)} Monate</dd>` : ""}
  ${sn.cancellation_effective_at ? `<dt>Kuendigung wirksam zum</dt><dd>${esc(fmtDate(sn.cancellation_effective_at))}</dd>` : ""}
</dl>

<h2>Limits</h2>
${limitsHtml}

${featuresHtml ? "<h2>Features</h2>" + featuresHtml : ""}

<h2>Add-ons</h2>
${addonsHtml}

${totalCents != null ? `<h2>Preis</h2><div class="total">${esc(fmtCents(totalCents))} / Monat (Richtwert)</div>` : ""}

<div class="disclaimer">
  ${renderDocumentDisclaimersHtml()}
</div>
</body></html>`;
}

/* ── Internal helpers ───────────────────────────────────────── */

async function nextDocumentNumber(pool, documentType) {
  const prefix = TYPE_PREFIX[documentType] || "DOC";
  const year = new Date().getFullYear();
  const { rows } = await pool.query("SELECT nextval('subscription_document_seq') AS n");
  const seq = String(rows[0].n).padStart(6, "0");
  return `${prefix}-${year}-${seq}`;
}

async function buildDocumentOutput(html, input) {
  const requestedFormat = normalizeDocumentFormat(input.format || "html");
  if (requestedFormat !== "pdf") {
    return {
      format: "html",
      content: html,
      contentHash: computeContentHash(html),
      metadata: {
        requested_format: "html",
        stored_format: "html",
        pdf_fallback: false
      }
    };
  }

  const renderer = input.pdfRenderer || renderPdfFromHtml;
  let pdfResult;
  try {
    pdfResult = await renderer(html, input.pdfOptions || {});
  } catch (err) {
    pdfResult = {
      ok: false,
      skipped: true,
      engine: "wkhtmltopdf",
      reason: "PDF_ENGINE_EXCEPTION",
      error_message: err && err.message ? String(err.message).slice(0, 240) : null,
      fallback_format: "html"
    };
  }

  if (pdfResult && pdfResult.ok && pdfResult.buffer) {
    const pdfBytes = Buffer.isBuffer(pdfResult.buffer) ? pdfResult.buffer : Buffer.from(pdfResult.buffer);
    return {
      format: "pdf",
      content: pdfBytes,
      contentHash: computeContentHash(pdfBytes),
      metadata: {
        requested_format: "pdf",
        stored_format: "pdf",
        pdf_engine: pdfResult.engine || "wkhtmltopdf",
        pdf_fallback: false
      }
    };
  }

  return {
    format: "html",
    content: html,
    contentHash: computeContentHash(html),
    metadata: {
      requested_format: "pdf",
      stored_format: "html",
      pdf_engine: pdfResult?.engine || "wkhtmltopdf",
      pdf_fallback: true,
      pdf_fallback_reason: pdfResult?.reason || "PDF_RENDER_FAILED"
    }
  };
}

async function loadRequestSnapshot(pool, subscriptionRequestId) {
  const { rows } = await pool.query(
    `SELECT sr.*, org.name AS org_name
       FROM subscription_requests sr
       LEFT JOIN organizations org ON org.id = sr.org_id
      WHERE sr.id = $1`,
    [subscriptionRequestId]
  );
  return rows[0] || null;
}

function mergeRequestIntoSnapshot(base, req) {
  const quote = isPlainObject(req.quote_snapshot) ? req.quote_snapshot : {};
  const quotePlan = quote.plan || null;
  const quoteAddons = Array.isArray(quote.addons) ? quote.addons : null;
  const quoteFeatures = Array.isArray(quote.feature_keys) ? quote.feature_keys : null;
  return {
    ...base,
    request_type: req.request_type,
    status: req.status,
    org_id: req.org_id,
    org_name: req.org_name || base.org_name || null,
    quote_snapshot: quote,
    quote_catalog_version: req.quote_catalog_version || quote.catalog_version || null,
    limits_snapshot: isPlainObject(quote.limits) ? quote.limits : base.limits_snapshot,
    plan_label: quote.plan_label || base.plan_label || null,
    plan_display_label: quote.plan_display_label || base.plan_display_label || quote.plan_label || null,
    plan_monthly_price_cents: Number.isFinite(quote.plan_monthly_price_cents) ? quote.plan_monthly_price_cents : base.plan_monthly_price_cents,
    requester_company_name: base.requester_company_name || req.requester_company_name,
    contact_email: base.contact_email || req.contact_email,
    contact_name: base.contact_name || req.contact_name,
    contact_phone: base.contact_phone || req.contact_phone,
    street: base.street || req.street,
    city: base.city || req.city,
    vat_id: base.vat_id || req.vat_id,
    current_plan: req.current_plan,
    desired_plan: quotePlan || req.desired_plan,
    desired_individual_tier: quote.individual_tier || req.desired_individual_tier,
    desired_features: quoteFeatures || (Array.isArray(req.desired_features) ? req.desired_features : (base.desired_features || [])),
    selected_addons: quoteAddons || (Array.isArray(req.desired_addons) ? req.desired_addons : (base.selected_addons || [])),
    proposed_price_cents: Number.isFinite(quote.proposed_price_cents) ? quote.proposed_price_cents : req.proposed_price_cents,
    proposed_term_months: Number.isFinite(quote.proposed_term_months) ? quote.proposed_term_months : req.proposed_term_months,
    cancellation_effective_at: req.cancellation_effective_at,
    expected_start_date: req.expected_start_date,
    effective_from: req.effective_from,
    effective_until: req.effective_until
  };
}

function computeTotalCentsFromRequest(req) {
  const quote = isPlainObject(req.quote_snapshot) ? req.quote_snapshot : {};
  if (Number.isFinite(quote.proposed_price_cents)) return Number(quote.proposed_price_cents);
  if (Number.isFinite(quote.plan_monthly_price_cents)) return Number(quote.plan_monthly_price_cents);
  if (Number.isFinite(req.proposed_price_cents)) return Number(req.proposed_price_cents);
  if (Number.isFinite(req.monthly_estimate_cents)) return Number(req.monthly_estimate_cents);
  return null;
}

function row(label, value) {
  return `<tr><td>${esc(label)}</td><td>${esc(value)}</td></tr>`;
}
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function isPlainObject(v) { return v && typeof v === "object" && !Array.isArray(v); }
function fmtCents(c) {
  if (c == null) return "\u2013";
  const n = Number(c) / 100;
  if (!isFinite(n)) return "\u2013";
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " EUR";
}
function fmtLimit(v) { return v === -1 ? "Unbegrenzt" : (v == null ? "\u2013" : String(v)); }
function fmtDate(s) { try { return s ? new Date(s).toLocaleDateString("de-DE") : "\u2013"; } catch { return "\u2013"; } }

export const __test_helpers__ = { TYPE_PREFIX, TYPE_TITLE };
