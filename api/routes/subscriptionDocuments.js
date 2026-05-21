/**
 * subscriptionDocuments.js — Customer-facing Routen fuer Tarif-/Vertrags-
 * Dokumente. Mounted auf /api/v1 + /api.
 *
 * Endpoints:
 *   GET  /subscription-documents/mine                 (eigene Org-Liste)
 *   GET  /subscription-documents/:id                  (Metadata)
 *   GET  /subscription-documents/:id/download         (HTML/PDF-Download)
 *   POST /subscription-documents/cost-preview         (oeffentlich, ad-hoc)
 *
 * Sicherheit:
 *   - Eingeloggte Endpoints pruefen Cross-Org. Public cost_preview hat
 *     KEIN org_id-Schreibrecht und enthaelt keine fremden Daten.
 */

import { Router } from "express";
import { z } from "zod";
import * as docs from "../services/subscriptionDocumentService.js";

const costPreviewSchema = z.object({
  desired_plan: z.string().min(2).max(40),
  desired_individual_tier: z.enum([
    "individuell_s","individuell_m","individuell_l","individuell_enterprise"
  ]).optional().nullable(),
  selected_addons: z.array(z.object({ key: z.string().max(40) }).passthrough()).max(30).optional(),
  total_cents: z.coerce.number().int().min(0).max(100_000_000).optional(),
  contact_email: z.string().email().max(180).optional(),
  contact_name: z.string().max(140).optional(),
  requester_company_name: z.string().max(180).optional(),
  format: z.enum(["html", "pdf"]).optional().default("html")
});

export function createSubscriptionDocumentsRouter(deps) {
  const { pool, requireAuth, logger: _logger } = deps;
  const router = Router();

  router.get("/subscription-documents/mine", requireAuth, async (req, res, next) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: { code: "NOT_AUTHENTICATED" } });
      const orgId = req.orgId || null;
      if (!orgId) return res.status(403).json({ error: { code: "ORG_REQUIRED" } });
      const items = await docs.listForOrg(pool, orgId, {
        documentType: req.query.document_type || null,
        status: req.query.status || null,
        limit: req.query.limit,
        offset: req.query.offset
      });
      res.json({ success: true, data: { items } });
    } catch (e) { next(e); }
  });

  router.get("/subscription-documents/:id", requireAuth, async (req, res, next) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: { code: "NOT_AUTHENTICATED" } });
      const row = await docs.getDocument(pool, req.params.id);
      if (!row) return res.status(404).json({ error: { code: "DOCUMENT_NOT_FOUND" } });
      const orgId = req.orgId || null;
      // Public-cost_preview ohne org darf von keinem auth-User abgerufen werden;
      // accountbezogene Dokumente nur fuer eigene Org sichtbar.
      if (!row.org_id || String(row.org_id) !== String(orgId)) {
        return res.status(403).json({ error: { code: "FORBIDDEN_CROSS_ORG" } });
      }
      const { content, ...meta } = row;
      res.json({ success: true, data: { ...meta, has_content: !!content } });
    } catch (e) { next(e); }
  });

  router.get("/subscription-documents/:id/download", requireAuth, async (req, res, next) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: { code: "NOT_AUTHENTICATED" } });
      const row = await docs.getDocument(pool, req.params.id);
      if (!row) return res.status(404).json({ error: { code: "DOCUMENT_NOT_FOUND" } });
      const orgId = req.orgId || null;
      if (!row.org_id || String(row.org_id) !== String(orgId)) {
        return res.status(403).json({ error: { code: "FORBIDDEN_CROSS_ORG" } });
      }
      await docs.markDownloaded(pool, { id: row.id, actorUserId: req.session.userId });
      res.locals.audit = {
        action: "subscription_document.download",
        entity_type: "subscription_document",
        entity_id: row.id,
        details: { document_type: row.document_type, document_number: row.document_number }
      };
      sendDocument(res, row);
    } catch (e) { next(e); }
  });

  /**
   * Public Kostenvorschau (kein Account erforderlich). Wird NICHT in der
   * Org gespeichert; org_id bleibt NULL. Vorbeugung gegen Spam: Burst-
   * Limit ueber den Standard-API-Limiter (siehe app.js apiLimiter).
   */
  router.post("/subscription-documents/cost-preview", async (req, res, next) => {
    try {
      const parsed = costPreviewSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION", details: parsed.error.issues } });
      const result = await docs.generateDocument(pool, {
        documentType: "cost_preview",
        actorUserId: req.session?.userId || null,
        dataOverride: {
          desired_plan: parsed.data.desired_plan,
          desired_individual_tier: parsed.data.desired_individual_tier || null,
          selected_addons: parsed.data.selected_addons || [],
          total_cents: Number.isFinite(parsed.data.total_cents) ? parsed.data.total_cents : null,
          contact_email: parsed.data.contact_email || null,
          contact_name: parsed.data.contact_name || null,
          requester_company_name: parsed.data.requester_company_name || null,
          public_preview: true,
          public_download_allowed: true
        },
        format: parsed.data.format
      });
      if (!result.ok) {
        const status = result.error === "EMPTY_DOCUMENT" ? 400 : 500;
        return res.status(status).json({ error: { code: result.error || "GENERATION_FAILED" } });
      }
      res.locals.audit = {
        action: "subscription_document.cost_preview.create",
        entity_type: "subscription_document",
        entity_id: result.row.id,
        details: { document_number: result.row.document_number, plan: parsed.data.desired_plan }
      };
      res.status(201).json({
        success: true,
        data: {
          id: result.row.id,
          document_number: result.row.document_number,
          format: result.row.format || "html",
          requested_format: parsed.data.format,
          pdf_fallback: parsed.data.format === "pdf" && (result.row.format || "html") !== "pdf",
          download_url: `/api/subscription-documents/${result.row.id}/public-download`
        }
      });
    } catch (e) { next(e); }
  });

  // Public-Download fuer cost_preview-Dokumente (keine org_id, frei zugaenglich)
  router.get("/subscription-documents/:id/public-download", async (req, res, next) => {
    try {
      const row = await docs.getDocument(pool, req.params.id);
      if (!row) return res.status(404).json({ error: { code: "DOCUMENT_NOT_FOUND" } });
      // Nur explizit als Public Preview markierte cost_preview-Dokumente
      // ohne org_id duerfen public abgerufen werden.
      if (!isPublicPreviewDocument(row)) {
        return res.status(403).json({ error: { code: "NOT_PUBLIC" } });
      }
      await docs.markDownloaded(pool, { id: row.id });
      sendDocument(res, row);
    } catch (e) { next(e); }
  });

  return router;
}

function sendDocument(res, row) {
  const payload = docs.getDocumentDownloadPayload(row);
  const number = String(row.document_number || row.id || "subscription-document").replace(/[^A-Za-z0-9_.-]/g, "_");
  res.setHeader("Content-Type", payload.contentType);
  res.setHeader("Content-Disposition", `inline; filename="${number}.${payload.extension}"`);
  res.send(payload.body);
}

function isPublicPreviewDocument(row) {
  if (!row || row.org_id || row.document_type !== "cost_preview") return false;
  const snapshot = parseSnapshot(row.data_snapshot);
  return snapshot.public_preview === true && snapshot.public_download_allowed === true;
}

function parseSnapshot(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
