/**
 * documentIngestService — Auto-Ablage plattform-generierter Dokumente im Dokumenten-Tresor
 * (document_center). Owner-Direktive: alles, was die Plattform erzeugt (Rechnungen,
 * Vertraege/Einsatzvereinbarungen, Abo-Dokumente, Compliance-Uploads, DSGVO-Anfragen),
 * landet im selben Moment auch im Tresor — Staff monitort das org-uebergreifend.
 *
 * REGEL: Alle Funktionen sind fire-and-forget-sicher — sie werfen NIE (nur logger.warn),
 * ein Ingest-Fehler darf den Geschaeftsfluss (Rechnung, Deal, Upload) nicht stoppen.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { uploadDocument } from "./documentCenterService.js";

const INGEST_DIR = "/uploads/document-center/system";

function writeIngestFile(content, filename) {
  const dirAbs = path.join(process.cwd(), INGEST_DIR.replace(/^\//, ""));
  fs.mkdirSync(dirAbs, { recursive: true });
  const safe = String(filename || "dokument").replace(/[^\w.\-]+/g, "_");
  const unique = crypto.randomUUID().slice(0, 8) + "-" + safe;
  const rel = INGEST_DIR + "/" + unique;
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content));
  fs.writeFileSync(path.join(process.cwd(), rel.replace(/^\//, "")), buf);
  return { rel, safe, size: buf.length };
}

/** Reiner Metadaten-Eintrag (z. B. Spiegel eines bereits gespeicherten Files oder Record ohne Datei). */
export async function ingestRecord(pool, payload, logger) {
  try {
    if (!payload || !payload.org_id) return null;
    return await uploadDocument(pool, { source: "system", ...payload });
  } catch (e) {
    logger?.warn?.({ err: e }, "document-ingest: record failed (non-blocking)");
    return null;
  }
}

/** Inhalt (String/Buffer) als Datei im Tresor-Systemordner ablegen + Eintrag anlegen. */
export async function ingestContent(pool, { content, filename, ...payload }, logger) {
  try {
    if (!payload.org_id || content == null) return null;
    const f = writeIngestFile(content, filename);
    return await uploadDocument(pool, {
      source: "system",
      file_ref: f.rel,
      original_name: f.safe,
      file_size_bytes: f.size,
      ...payload
    });
  } catch (e) {
    logger?.warn?.({ err: e }, "document-ingest: content failed (non-blocking)");
    return null;
  }
}

/** Rechnung: PDF rendern (pdf-lib) und als 'invoice' im Tresor ablegen. */
export async function ingestInvoicePdf(pool, invoice, logger) {
  try {
    if (!invoice || !invoice.org_id) return null; // Tresor ist org-scoped
    const { renderInvoicePdf } = await import("./invoicePdfService.js");
    let items = [];
    try {
      const r = await pool.query(
        "SELECT description, quantity, unit_amount_cents, total_cents FROM invoice_items WHERE invoice_id = $1",
        [invoice.id]
      );
      items = r.rows;
    } catch { /* items optional */ }
    const pdf = await renderInvoicePdf({ ...invoice, items });
    return await ingestContent(pool, {
      content: Buffer.from(pdf),
      filename: `${invoice.invoice_number}.pdf`,
      mime_type: "application/pdf",
      org_id: invoice.org_id,
      document_type: "invoice",
      content_category: "financial",
      title: `Rechnung ${invoice.invoice_number}`,
      source: "invoice",
      source_ref: invoice.id,
      uploaded_by: invoice.user_id || null
    }, logger);
  } catch (e) {
    logger?.warn?.({ err: e }, "document-ingest: invoice failed (non-blocking)");
    return null;
  }
}

/** Einsatzvereinbarung + Konditionsblatt: einmal als Datei ablegen, fuer BEIDE Partei-Orgs eintragen. */
export async function ingestAgreementDocs(pool, { offerId, agreementRef, condHtml, agrHtml }, logger) {
  try {
    if (!offerId || !agreementRef) return null;
    const { rows } = await pool.query(
      `SELECT DISTINCT u.org_id FROM users u WHERE u.org_id IS NOT NULL AND u.id IN (
         SELECT o.supplier_company_id FROM offers o WHERE o.id = $1
         UNION
         SELECT d.requester_company_id FROM offers o JOIN demand_requests d ON d.id = o.demand_request_id WHERE o.id = $1
       )`,
      [offerId]
    );
    const orgIds = rows.map((r) => r.org_id);
    if (!orgIds.length) return null;
    const docs = [
      { html: condHtml, title: `Konditionsblatt ${agreementRef}`, fname: `konditionsblatt-${agreementRef}.html` },
      { html: agrHtml, title: `Einsatzvereinbarung ${agreementRef}`, fname: `einsatzvereinbarung-${agreementRef}.html` }
    ].filter((d) => d.html);
    for (const d of docs) {
      const f = writeIngestFile(d.html, d.fname);
      for (const orgId of orgIds) {
        await ingestRecord(pool, {
          org_id: orgId,
          document_type: "contract",
          content_category: "legal",
          title: d.title,
          file_ref: f.rel,
          original_name: f.safe,
          mime_type: "text/html",
          file_size_bytes: f.size,
          source_ref: offerId
        }, logger);
      }
    }
    return true;
  } catch (e) {
    logger?.warn?.({ err: e }, "document-ingest: agreement failed (non-blocking)");
    return null;
  }
}

export const _internals = { writeIngestFile, INGEST_DIR };
