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
import multer from "multer";
import path from "path";
import fs from "fs";
import * as complianceDocService from "../services/complianceDocService.js";
import { requirePermission } from "../middleware/rbac.js";
import { ok, fail } from "../utils/response.js";

/* ── Upload config (reuses offerAssets pattern) ──────── */
const ALLOWED_MIMES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB for compliance docs

function createComplianceUpload() {
  return multer({
    storage: multer.diskStorage({
      destination(_req, _file, cb) {
        const dir = path.join(process.cwd(), "uploads", "compliance");
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename(_req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        const safe = [".png", ".jpg", ".jpeg", ".webp", ".pdf"].includes(ext) ? ext : "";
        cb(null, Date.now() + "-" + Math.random().toString(36).slice(2, 8) + safe);
      }
    }),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter(_req, file, cb) {
      if (ALLOWED_MIMES.includes(file.mimetype)) cb(null, true);
      else cb(Object.assign(new Error("Nicht erlaubter Dateityp: " + file.mimetype), { code: "INVALID_MIME" }));
    }
  });
}

/**
 * @param {{ pool, requireAuth, config, logger }} deps
 */
export function createComplianceDocsRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();
  const rperm = (p) => requirePermission(p, { pool, logger });
  const upload = createComplianceUpload();

  /* ── GET /compliance-documents — Liste mit Filtern ──── */
  router.get("/compliance-documents", requireAuth, rperm("compliance.view"), async (req, res, next) => {
    try {
      const filters = {};
      filters.org_id = req.orgId; // F-002 fix: server-resolved org only
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
  router.get("/compliance-documents/stats/:orgId", requireAuth, rperm("compliance.view"), async (req, res, next) => {
    try {
      // F-002 fix: enforce org-boundary on stats
      if (req.orgId && req.params.orgId !== req.orgId) {
        return fail(res, "ORG_BOUNDARY_VIOLATION", "Zugriff verweigert", 403);
      }
      const stats = await complianceDocService.complianceStats(pool, req.params.orgId);
      return ok(res, stats);
    } catch (err) {
      next(err);
    }
  });

  /* ── GET /compliance-documents/:id — Einzeldokument ──── */
  router.get("/compliance-documents/:id", requireAuth, rperm("compliance.view"), async (req, res, next) => {
    try {
      const doc = await complianceDocService.getDocumentById(pool, req.params.id);
      if (!doc) return fail(res, "NOT_FOUND", "Dokument nicht gefunden", 404);
      // F-002 fix: org-boundary check
      if (req.orgId && doc.org_id && doc.org_id !== req.orgId) {
        return fail(res, "ORG_BOUNDARY_VIOLATION", "Zugriff verweigert", 403);
      }
      return ok(res, doc);
    } catch (err) {
      next(err);
    }
  });

  /* ── POST /compliance-documents — Upload (multipart) ──── */
  router.post("/compliance-documents", requireAuth, rperm("compliance.upload"), (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") return fail(res, "VALIDATION", "Datei zu gross (max. 10 MB)");
        if (err.code === "INVALID_MIME") return fail(res, "VALIDATION", err.message);
        return fail(res, "VALIDATION", "Upload-Fehler: " + (err.message || "Unbekannt"));
      }
      next();
    });
  }, async (req, res, next) => {
    try {
      const { doc_type, doc_name, valid_from, valid_until, notes } = req.body;
      const org_id = req.orgId;
      if (!org_id || !doc_type || !doc_name) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return fail(res, "VALIDATION", "org_id, doc_type und doc_name sind Pflichtfelder");
      }
      const file_ref = req.file ? "/uploads/compliance/" + req.file.filename : (req.body.file_ref || null);
      const doc = await complianceDocService.uploadDocument(pool, {
        org_id,
        uploaded_by: req.session?.userId || null,
        doc_type,
        doc_name,
        file_ref,
        valid_from: valid_from || null,
        valid_until: valid_until || null,
        notes: notes || null
      });
      res.locals.audit = { action: "compliance_doc.upload", entity_type: "compliance_document", entity_id: doc.id, details: { org_id, doc_type } };
      // Auto-Ablage: Spiegel im Dokumenten-Tresor (gleiches file_ref, fire-and-forget).
      import("../services/documentIngestService.js").then((m) => m.ingestRecord(pool, {
        org_id,
        document_type: "certificate",
        content_category: "legal",
        title: doc_name,
        file_ref,
        original_name: req.file?.originalname || null,
        mime_type: req.file?.mimetype || null,
        file_size_bytes: req.file?.size || null,
        source_ref: doc.id,
        uploaded_by: req.session?.userId || null
      })).catch(() => {});
      return ok(res, doc, 201);
    } catch (err) {
      if (req.file) fs.unlink(req.file.path, () => {});
      next(err);
    }
  });

  /* ── GET /compliance-documents/:id/download — Datei ─── */
  router.get("/compliance-documents/:id/download", requireAuth, rperm("compliance.view"), async (req, res, next) => {
    try {
      const doc = await complianceDocService.getDocumentById(pool, req.params.id);
      if (!doc) return fail(res, "NOT_FOUND", "Dokument nicht gefunden", 404);
      if (req.orgId && doc.org_id && doc.org_id !== req.orgId) {
        return fail(res, "ORG_BOUNDARY_VIOLATION", "Zugriff verweigert", 403);
      }
      if (!doc.file_ref) return fail(res, "NO_FILE", "Keine Datei vorhanden", 404);
      const filePath = path.join(process.cwd(), doc.file_ref.replace(/^\//, ""));
      if (!fs.existsSync(filePath)) return fail(res, "FILE_MISSING", "Datei nicht gefunden", 404);
      const ext = path.extname(filePath).toLowerCase();
      const mime = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
      res.setHeader("Content-Type", mime[ext] || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${doc.doc_name}${ext}"`);
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      next(err);
    }
  });

  /* ── PATCH /compliance-documents/:id — Aktualisieren ──── */
  router.patch("/compliance-documents/:id", requireAuth, rperm("compliance.manage"), async (req, res, next) => {
    try {
      // F-002 fix: verify ownership before update
      const existing = await complianceDocService.getDocumentById(pool, req.params.id);
      if (!existing) return fail(res, "NOT_FOUND", "Dokument nicht gefunden", 404);
      if (req.orgId && existing.org_id && existing.org_id !== req.orgId) {
        return fail(res, "ORG_BOUNDARY_VIOLATION", "Zugriff verweigert", 403);
      }
      const doc = await complianceDocService.updateDocument(pool, req.params.id, req.body);
      if (!doc) return fail(res, "NOT_FOUND", "Dokument nicht gefunden oder keine Aenderungen", 404);
      res.locals.audit = { action: "compliance_doc.update", entity_type: "compliance_document", entity_id: req.params.id, details: { changed_fields: Object.keys(req.body) } };
      return ok(res, doc);
    } catch (err) {
      next(err);
    }
  });

  /* ── POST /compliance-documents/:id/verify — Verifizieren */
  router.post("/compliance-documents/:id/verify", requireAuth, rperm("compliance.verify"), async (req, res, next) => {
    try {
      // F-002 fix: verify org-boundary before action
      const existing = await complianceDocService.getDocumentById(pool, req.params.id);
      if (!existing) return fail(res, "NOT_FOUND", "Dokument nicht gefunden", 404);
      if (req.orgId && existing.org_id && existing.org_id !== req.orgId) {
        return fail(res, "ORG_BOUNDARY_VIOLATION", "Zugriff verweigert", 403);
      }
      const doc = await complianceDocService.verifyDocument(pool, req.params.id, req.user?.id);
      if (!doc) return fail(res, "CONFLICT", "Dokument nicht gefunden oder nicht im Status pending", 409);
      res.locals.audit = { action: "compliance_doc.verify", entity_type: "compliance_document", entity_id: req.params.id, new_values: { status: "verified" } };
      return ok(res, doc);
    } catch (err) {
      next(err);
    }
  });

  /* ── POST /compliance-documents/:id/reject — Ablehnen ─── */
  router.post("/compliance-documents/:id/reject", requireAuth, rperm("compliance.verify"), async (req, res, next) => {
    try {
      // F-002 fix: verify org-boundary before action
      const existing = await complianceDocService.getDocumentById(pool, req.params.id);
      if (!existing) return fail(res, "NOT_FOUND", "Dokument nicht gefunden", 404);
      if (req.orgId && existing.org_id && existing.org_id !== req.orgId) {
        return fail(res, "ORG_BOUNDARY_VIOLATION", "Zugriff verweigert", 403);
      }
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
  router.delete("/compliance-documents/:id", requireAuth, rperm("compliance.manage"), async (req, res, next) => {
    try {
      // F-002 fix: verify org-boundary before delete
      const existing = await complianceDocService.getDocumentById(pool, req.params.id);
      if (!existing) return fail(res, "NOT_FOUND", "Dokument nicht gefunden", 404);
      if (req.orgId && existing.org_id && existing.org_id !== req.orgId) {
        return fail(res, "ORG_BOUNDARY_VIOLATION", "Zugriff verweigert", 403);
      }
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
