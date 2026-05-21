/**
 * Storage-Abstraktion fuer subscription_documents.
 *
 * Heute schreibt der DB-Adapter weiterhin in `subscription_documents.content`,
 * damit bestehende Dokumente erhalten bleiben. Spaetere Object-Storage-
 * Migration kann denselben Adapter-Vertrag nutzen und den Content Hash
 * unveraendert ueber die gespeicherten Bytes behalten.
 */

import crypto from "node:crypto";

export function computeContentHash(content) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(String(content == null ? "" : content), "utf8");
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function normalizeDocumentFormat(format) {
  return String(format || "html").trim().toLowerCase() === "pdf" ? "pdf" : "html";
}

export function serializeDocumentContent(format, content) {
  const normalized = normalizeDocumentFormat(format);
  if (normalized === "pdf") {
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(String(content || ""), "base64");
    return bytes.toString("base64");
  }
  return String(content == null ? "" : content);
}

export function materializeDocumentContent(row) {
  const format = normalizeDocumentFormat(row?.format);
  if (format === "pdf") {
    return {
      format,
      body: Buffer.from(String(row?.content || ""), "base64"),
      contentType: "application/pdf",
      extension: "pdf"
    };
  }
  return {
    format: "html",
    body: String(row?.content || ""),
    contentType: "text/html; charset=utf-8",
    extension: "html"
  };
}

export function createSubscriptionDocumentStorageAdapter(pool, opts = {}) {
  const mode = String(opts.mode || process.env.SUBSCRIPTION_DOCUMENT_STORAGE || "db").trim().toLowerCase();
  if (mode === "object" || mode === "s3" || mode === "minio") {
    // Noch nicht aktiv: bewusster DB-Fallback statt Produktionsausfall.
    return createDbDocumentStorageAdapter(pool, { fallback_from: mode, fallback_reason: "OBJECT_STORAGE_NOT_CONFIGURED" });
  }
  return createDbDocumentStorageAdapter(pool);
}

export function createDbDocumentStorageAdapter(pool, opts = {}) {
  return {
    mode: "db",
    fallback_from: opts.fallback_from || null,
    fallback_reason: opts.fallback_reason || null,
    async storeDocument(record) {
      const format = normalizeDocumentFormat(record.format);
      const content = serializeDocumentContent(format, record.content);
      const formatLiteral = format === "pdf" ? "pdf" : "html";
      const { rows } = await pool.query(
        `INSERT INTO subscription_documents (
           document_type, document_number, status,
           org_id, subscription_request_id,
           title, format, content, content_hash, data_snapshot,
           contact_email, contact_name, total_cents, currency,
           effective_from, effective_until,
           issued_by
         ) VALUES (
           $1,$2,'issued',
           $3,$4,
           $5,'${formatLiteral}',$6,$7,$8::jsonb,
           $9,$10,$11,'EUR',
           $12,$13,
           $14
         )
         RETURNING *`,
        [
          record.documentType,
          record.documentNumber,
          record.orgId || null,
          record.subscriptionRequestId || null,
          record.title,
          content,
          record.contentHash || computeContentHash(format === "pdf" ? Buffer.from(content, "base64") : content),
          JSON.stringify(record.dataSnapshot || {}),
          record.contactEmail || null,
          record.contactName || null,
          Number.isFinite(record.totalCents) ? record.totalCents : null,
          record.effectiveFrom || null,
          record.effectiveUntil || null,
          record.actorUserId || null
        ]
      );
      return rows[0];
    }
  };
}

export function createObjectStorageDocumentAdapter() {
  return {
    mode: "object",
    storeDocument() {
      const err = new Error("OBJECT_STORAGE_NOT_CONFIGURED");
      err.code = "OBJECT_STORAGE_NOT_CONFIGURED";
      throw err;
    }
  };
}
