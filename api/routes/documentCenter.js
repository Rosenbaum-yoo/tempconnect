/**
 * Document-Center Router — zentraler Dokumenten-Tresor / PDF-Center (org-eigene Geschaeftsdokumente).
 *
 * GET    /api/document-center             — Liste mit Filtern (type/category/status)
 * GET    /api/document-center/stats       — Kennzahlen pro Org (Anzahl, Groesse, nach Typ/Kategorie)
 * GET    /api/document-center/:id          — Einzeldokument
 * POST   /api/document-center             — Upload (multipart) — legt Dokument an
 * GET    /api/document-center/:id/download — Datei herunterladen (PDF/Bild)
 * PATCH  /api/document-center/:id          — Metadaten aktualisieren
 * POST   /api/document-center/:id/archive  — Archivieren / Reaktivieren
 * DELETE /api/document-center/:id          — Loeschen
 *
 * Org-scoped (req.orgId), Audit auf allen Mutationen. RBAC: document_center.view / .manage.
 */

import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import * as documentCenterService from "../services/documentCenterService.js";
import { requirePermission } from "../middleware/rbac.js";
import { ok, fail } from "../utils/response.js";

const ALLOWED_MIMES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

function createUpload() {
  return multer({
    storage: multer.diskStorage({
      destination(_req, _file, cb) {
        const dir = path.join(process.cwd(), "uploads", "document-center");
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename(_req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        const safe = [".pdf", ".png", ".jpg", ".jpeg", ".webp"].includes(ext) ? ext : "";
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
export function createDocumentCenterRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();
  const rperm = (p) => requirePermission(p, { pool, logger });
  const upload = createUpload();

  /* ── GET /document-center — Liste mit Filtern ─────────── */
  router.get("/document-center", requireAuth, rperm("document_center.view"), async (req, res, next) => {
    try {
      const filters = { org_id: req.orgId }; // server-resolved org only
      if (req.query.document_type) filters.document_type = req.query.document_type;
      if (req.query.content_category) filters.content_category = req.query.content_category;
      if (req.query.status) filters.status = req.query.status;
      if (req.query.limit) filters.limit = parseInt(req.query.limit, 10) || 100;
      if (!req.orgId) return fail(res, "ORG_CONTEXT_REQUIRED", "Keine Organisation im Kontext", 400);
      const items = await documentCenterService.listDocuments(pool, filters);
      return ok(res, { items, total: items.length });
    } catch (err) { next(err); }
  });

  /* ── GET /document-center/stats — Kennzahlen ──────────── */
  router.get("/document-center/stats", requireAuth, rperm("document_center.view"), async (req, res, next) => {
    try {
      if (!req.orgId) return fail(res, "ORG_CONTEXT_REQUIRED", "Keine Organisation im Kontext", 400);
      const stats = await documentCenterService.centerStats(pool, req.orgId);
      return ok(res, stats);
    } catch (err) { next(err); }
  });

  /* ── GET /document-center/:id — Einzeldokument ────────── */
  router.get("/document-center/:id", requireAuth, rperm("document_center.view"), async (req, res, next) => {
    try {
      const doc = await documentCenterService.getDocumentById(pool, req.params.id);
      if (!doc) return fail(res, "NOT_FOUND", "Dokument nicht gefunden", 404);
      if (req.orgId && doc.org_id !== req.orgId) return fail(res, "ORG_BOUNDARY_VIOLATION", "Zugriff verweigert", 403);
      return ok(res, doc);
    } catch (err) { next(err); }
  });

  /* ── POST /document-center — Upload (multipart) ───────── */
  router.post("/document-center", requireAuth, rperm("document_center.manage"), (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") return fail(res, "VALIDATION", "Datei zu gross (max. 15 MB)");
        if (err.code === "INVALID_MIME") return fail(res, "VALIDATION", err.message);
        return fail(res, "VALIDATION", "Upload-Fehler: " + (err.message || "Unbekannt"));
      }
      next();
    });
  }, async (req, res, next) => {
    try {
      const { title, document_type, content_category, valid_from, valid_until, retention_delete_at, notes } = req.body;
      const org_id = req.orgId;
      if (!org_id || !title) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return fail(res, "VALIDATION", "org_id und title sind Pflichtfelder");
      }
      const file_ref = req.file ? "/uploads/document-center/" + req.file.filename : (req.body.file_ref || null);
      const doc = await documentCenterService.uploadDocument(pool, {
        org_id,
        uploaded_by: req.session?.userId || null,
        title,
        document_type: document_type || "other",
        content_category: content_category || "operational",
        file_ref,
        original_name: req.file ? req.file.originalname : null,
        mime_type: req.file ? req.file.mimetype : null,
        file_size_bytes: req.file ? req.file.size : null,
        source: "upload",
        valid_from: valid_from || null,
        valid_until: valid_until || null,
        retention_delete_at: retention_delete_at || null,
        notes: notes || null
      });
      res.locals.audit = { action: "document_center.upload", entity_type: "document_center", entity_id: doc.id, details: { org_id, document_type: doc.document_type } };
      return ok(res, doc, 201);
    } catch (err) {
      if (req.file) fs.unlink(req.file.path, () => {});
      next(err);
    }
  });

  /* ── GET /document-center/:id/download — Datei ────────── */
  router.get("/document-center/:id/download", requireAuth, rperm("document_center.view"), async (req, res, next) => {
    try {
      const doc = await documentCenterService.getDocumentById(pool, req.params.id);
      if (!doc) return fail(res, "NOT_FOUND", "Dokument nicht gefunden", 404);
      if (req.orgId && doc.org_id !== req.orgId) return fail(res, "ORG_BOUNDARY_VIOLATION", "Zugriff verweigert", 403);
      if (!doc.file_ref) return fail(res, "NO_FILE", "Keine Datei vorhanden", 404);
      const filePath = path.join(process.cwd(), doc.file_ref.replace(/^\//, ""));
      if (!fs.existsSync(filePath)) return fail(res, "FILE_MISSING", "Datei nicht gefunden", 404);
      const ext = path.extname(filePath).toLowerCase();
      const mime = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
      const safeName = String(doc.title || "dokument").replace(/[^\w.\- ]+/g, "_");
      res.setHeader("Content-Type", mime[ext] || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}${ext}"`);
      fs.createReadStream(filePath).pipe(res);
    } catch (err) { next(err); }
  });

  /* ── PATCH /document-center/:id — Metadaten ──────────── */
  router.patch("/document-center/:id", requireAuth, rperm("document_center.manage"), async (req, res, next) => {
    try {
      const existing = await documentCenterService.getDocumentById(pool, req.params.id);
      if (!existing) return fail(res, "NOT_FOUND", "Dokument nicht gefunden", 404);
      if (req.orgId && existing.org_id !== req.orgId) return fail(res, "ORG_BOUNDARY_VIOLATION", "Zugriff verweigert", 403);
      const doc = await documentCenterService.updateDocument(pool, req.params.id, req.body);
      if (!doc) return fail(res, "NOT_FOUND", "Keine Aenderungen", 404);
      res.locals.audit = { action: "document_center.update", entity_type: "document_center", entity_id: req.params.id, details: { changed_fields: Object.keys(req.body || {}) } };
      return ok(res, doc);
    } catch (err) { next(err); }
  });

  /* ── POST /document-center/:id/archive — Archivieren ─── */
  router.post("/document-center/:id/archive", requireAuth, rperm("document_center.manage"), async (req, res, next) => {
    try {
      const existing = await documentCenterService.getDocumentById(pool, req.params.id);
      if (!existing) return fail(res, "NOT_FOUND", "Dokument nicht gefunden", 404);
      if (req.orgId && existing.org_id !== req.orgId) return fail(res, "ORG_BOUNDARY_VIOLATION", "Zugriff verweigert", 403);
      const next_status = existing.status === "archived" ? "active" : "archived";
      const doc = await documentCenterService.setStatus(pool, req.params.id, next_status);
      res.locals.audit = { action: "document_center.archive", entity_type: "document_center", entity_id: req.params.id, new_values: { status: next_status } };
      return ok(res, doc);
    } catch (err) { next(err); }
  });

  /* ── DELETE /document-center/:id — Loeschen ───────────── */
  router.delete("/document-center/:id", requireAuth, rperm("document_center.manage"), async (req, res, next) => {
    try {
      const existing = await documentCenterService.getDocumentById(pool, req.params.id);
      if (!existing) return fail(res, "NOT_FOUND", "Dokument nicht gefunden", 404);
      if (req.orgId && existing.org_id !== req.orgId) return fail(res, "ORG_BOUNDARY_VIOLATION", "Zugriff verweigert", 403);
      // Datei mit entfernen (best effort).
      if (existing.file_ref) {
        const fp = path.join(process.cwd(), existing.file_ref.replace(/^\//, ""));
        fs.unlink(fp, () => {});
      }
      const deleted = await documentCenterService.deleteDocument(pool, req.params.id);
      if (!deleted) return fail(res, "NOT_FOUND", "Dokument nicht gefunden", 404);
      res.locals.audit = { action: "document_center.delete", entity_type: "document_center", entity_id: req.params.id };
      return ok(res, { deleted: true });
    } catch (err) { next(err); }
  });

  return router;
}
