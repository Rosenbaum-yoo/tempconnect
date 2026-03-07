/**
 * Compliance-Documents Router — REST-Endpunkte fuer Compliance-Dokumente.
 *
 * GET    /api/compliance-documents              — Liste mit Filtern
 * POST   /api/compliance-documents              — Neues Dokument hochladen
 * GET    /api/compliance-documents/:id           — Einzeldokument
 * PATCH  /api/compliance-documents/:id           — Dokument aktualisieren
 * POST   /api/compliance-documents/:id/verify    — Verifizieren
 * POST   /api/compliance-documents/:id/reject    — Ablehnen
 * DELETE /api/compliance-documents/:id           — Loeschen
 * GET    /api/compliance-documents/stats/:orgId  — Ampel-Statistik pro Org
 */

import { Router } from "express";
import * as complianceDocService from "../services/complianceDocService.js";
import { ok, fail } from "../utils/response.js";

/**
 * @param {{ pool, requireAuth, config, logger }} deps
 */
export function createComplianceDocsRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();

  /* ── GET /compliance-documents — Liste mit Filtern ──── */
  router.get("/compliance-documents", requireAuth, async (req, res, next) => {
    try {
      const filters = {};
      if (req.query.org_id) filters.org_id = req.query.org_id;
      if (req.query.doc_type) filters.doc_type = req.query.doc_type;
      if (req.query.status) filters.status = req.query.status;
      if (req.query.limit) filters.limit = parseInt(req.query.limit) || 100;

      const items = await complianceDocService.listDocuments(pool, filters);
      return ok(res, { items, total: items.length });
    } catch (err) {
      next(err);
    }
  });

  /* ── GET /compliance-documents/stats/:orgId — Statistik ─ */
  router.get("/compliance-documents/stats/:orgId", requireAuth, async (req, res, next) => {
    try {
      const stats = await complianceDocService.complianceStats(pool, req.params.orgId);
      return ok(res, stats);
    } catch (err) {
      next(err);
    }
  });

  /* ── GET /compliance-documents/:id — Einzeldokument ──── */
  router.get("/compliance-documents/:id", requireAuth, async (req, res, next) => {
    try {
      const doc = await complianceDocService.getDocumentById(pool, req.params.id);
      if (!doc) return fail(res, "NOT_FOUND", "Dokument nicht gefunden", 404);
      return ok(res, doc);
    } catch (err) {
      next(err);
    }
  });

  /* ── POST /compliance-documents — Upload ───────────────── */
  router.post("/compliance-documents", requireAuth, async (req, res, next) => {
    try {
      const { org_id, doc_type, doc_name, file_ref, valid_from, valid_until, notes } = req.body;
      if (!org_id || !doc_type || !doc_name) {
        return fail(res, "VALIDATION", "org_id, doc_type und doc_name sind Pflichtfelder");
      }
      const doc = await complianceDocService.uploadDocument(pool, {
        org_id,
        uploaded_by: req.user?.id || null,
        doc_type,
        doc_name,
        file_ref: file_ref || null,
        valid_from: valid_from || null,
        valid_until: valid_until || null,
        notes: notes || null
      });
      res.locals.audit = { action: "compliance_doc.upload", entity_type: "compliance_document", entity_id: doc.id, details: { org_id, doc_type } };
      return ok(res, doc, 201);
    } catch (err) {
      next(err);
    }
  });

  /* ── PATCH /compliance-documents/:id — Aktualisieren ──── */
  router.patch("/compliance-documents/:id", requireAuth, async (req, res, next) => {
    try {
      const doc = await complianceDocService.updateDocument(pool, req.params.id, req.body);
      if (!doc) return fail(res, "NOT_FOUND", "Dokument nicht gefunden oder keine Aenderungen", 404);
      res.locals.audit = { action: "compliance_doc.update", entity_type: "compliance_document", entity_id: req.params.id, details: { changed_fields: Object.keys(req.body) } };
      return ok(res, doc);
    } catch (err) {
      next(err);
    }
  });

  /* ── POST /compliance-documents/:id/verify — Verifizieren */
  router.post("/compliance-documents/:id/verify", requireAuth, async (req, res, next) => {
    try {
      const doc = await complianceDocService.verifyDocument(pool, req.params.id, req.user?.id);
      if (!doc) return fail(res, "CONFLICT", "Dokument nicht gefunden oder nicht im Status pending", 409);
      res.locals.audit = { action: "compliance_doc.verify", entity_type: "compliance_document", entity_id: req.params.id, new_values: { status: "verified" } };
      return ok(res, doc);
    } catch (err) {
      next(err);
    }
  });

  /* ── POST /compliance-documents/:id/reject — Ablehnen ─── */
  router.post("/compliance-documents/:id/reject", requireAuth, async (req, res, next) => {
    try {
      const reason = req.body.reason || null;
      const doc = await complianceDocService.rejectDocument(pool, req.params.id, req.user?.id, reason);
      if (!doc) return fail(res, "CONFLICT", "Dokument nicht gefunden oder nicht im Status pending", 409);
      res.locals.audit = { action: "compliance_doc.reject", entity_type: "compliance_document", entity_id: req.params.id, new_values: { status: "rejected" }, details: { reason } };
      return ok(res, doc);
    } catch (err) {
      next(err);
    }
  });

  /* ── DELETE /compliance-documents/:id — Loeschen ────────── */
  router.delete("/compliance-documents/:id", requireAuth, async (req, res, next) => {
    try {
      const deleted = await complianceDocService.deleteDocument(pool, req.params.id);
      if (!deleted) return fail(res, "NOT_FOUND", "Dokument nicht gefunden", 404);
      res.locals.audit = { action: "compliance_doc.delete", entity_type: "compliance_document", entity_id: req.params.id };
      return ok(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
