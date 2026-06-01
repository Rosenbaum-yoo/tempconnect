/**
 * Offer Assets Router — Upload, Abruf und Loeschen von Bildern/Dokumenten
 * fuer Angebotseintraege (capacity_posts) UND Nachfragen (demand_requests).
 *
 * POST   /api/offer-assets/:offerId/upload   — Datei hochladen
 * GET    /api/offer-assets/:offerId          — Alle Assets gruppiert abrufen
 * GET    /api/offer-assets/batch-logos       — Batch-Logo-Abruf
 * DELETE /api/offer-assets/:assetId          — Einzelnes Asset loeschen
 */

import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { ok, fail } from "../utils/response.js";
import { canAccessAsOwner } from "../utils/ownerCheck.js";
import { createUploadedDocumentRecord } from "../services/dealDossierService.js";

/* ── Allowed MIME types ───────────────────────────── */

const ALLOWED_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf"
];

const ALLOWED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".pdf"
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ── Multer storage ───────────────────────────────── */

function createStorage() {
  return multer.diskStorage({
    destination(req, _file, cb) {
      const dir = path.join(process.cwd(), "uploads", "offers", req.params.offerId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(_req, file, cb) {
      const rawExt = path.extname(file.originalname).toLowerCase() || "";
      const ext = ALLOWED_EXTENSIONS.has(rawExt) ? rawExt : "";
      const unique = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
      cb(null, unique + ext);
    }
  });
}

function createUpload() {
  return multer({
    storage: createStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter(_req, file, cb) {
      if (ALLOWED_MIMES.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(Object.assign(new Error("Nicht erlaubter Dateityp: " + file.mimetype), { code: "INVALID_MIME" }));
      }
    }
  });
}

/* ── Asset type validation ────────────────────────── */

const VALID_ASSET_TYPES = ["logo", "safety", "gallery", "compliance", "deal_document"];

/* ── Router factory ───────────────────────────────── */

/**
 * @param {{ pool, requireAuth, logger }} deps
 */
export function createOfferAssetsRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();
  const upload = createUpload();

  /* ── Helper: resolve entity (capacity_post OR demand_request) ── */

  async function resolveEntity(pool, entityId) {
    // Try real marketplace offers (Dealakte)
    const { rows: offerRows } = await pool.query(
      `SELECT o.id, d.requester_company_id, o.supplier_company_id
         FROM offers o
         JOIN demand_requests d ON d.id = o.demand_request_id
        WHERE o.id = $1`,
      [entityId]
    );
    if (offerRows.length) {
      return {
        found: true,
        type: "deal",
        ownerCompanyId: null,
        counterpartyCompanyIds: [offerRows[0].requester_company_id, offerRows[0].supplier_company_id].filter(Boolean),
        orgId: null
      };
    }
    // Try capacity_posts first
    const { rows: cpRows } = await pool.query(
      "SELECT id, supplier_company_id AS owner_company_id, org_id FROM capacity_posts WHERE id = $1",
      [entityId]
    );
    if (cpRows.length) return { found: true, type: "supply", ownerCompanyId: cpRows[0].owner_company_id, orgId: cpRows[0].org_id };

    // Try demand_requests
    const { rows: drRows } = await pool.query(
      "SELECT id, requester_company_id AS owner_company_id FROM demand_requests WHERE id = $1",
      [entityId]
    );
    if (drRows.length) return { found: true, type: "demand", ownerCompanyId: drRows[0].owner_company_id, orgId: null };

    return { found: false, type: null, ownerCompanyId: null, orgId: null };
  }

  /* ── Helper: ownership check (both entity types) ─── */

  async function verifyOwnership(pool, entityId, sessionUserId) {
    const entity = await resolveEntity(pool, entityId);
    if (!entity.found) return { found: false, isOwner: false, entity };
    if (entity.type === "deal") {
      for (const companyId of entity.counterpartyCompanyIds || []) {
        // Beide Parteien duerfen die Dealakte pflegen
        // canAccessAsOwner beruecksichtigt auch Organisations-Member
        // und nicht nur den direkten Owner.
        const allowed = await canAccessAsOwner(pool, companyId, sessionUserId);
        if (allowed) return { found: true, isOwner: true, entity };
      }
      return { found: true, isOwner: false, entity };
    }
    const allowed = await canAccessAsOwner(pool, entity.ownerCompanyId, sessionUserId);
    return { found: true, isOwner: allowed, entity };
  }

  /* ── Helper: build FK columns for an entity ──────── */

  function entityFkColumns(entityType, entityId) {
    if (entityType === "supply") return { offer_id: entityId, demand_request_id: null, marketplace_offer_id: null };
    if (entityType === "deal") return { offer_id: null, demand_request_id: null, marketplace_offer_id: entityId };
    return { offer_id: null, demand_request_id: entityId, marketplace_offer_id: null };
  }

  /* ── Multer error wrapper ─────────────────────────── */

  function handleUpload(req, res, next) {
    upload.single("file")(req, res, function(err) {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") return fail(res, "VALIDATION", "Datei zu gross (max. 5 MB)");
        if (err.code === "INVALID_MIME") return fail(res, "VALIDATION", err.message);
        return fail(res, "VALIDATION", "Upload-Fehler: " + (err.message || "Unbekannt"));
      }
      next();
    });
  }

  /* ── GET /offer-assets/batch-logos ─────────────────── */

  router.get("/offer-assets/batch-logos", requireAuth, async (req, res, next) => {
    try {
      const raw = req.query.ids;
      if (!raw) return ok(res, {});
      const ids = String(raw).split(",").filter(id => UUID_RE.test(id)).slice(0, 100);
      if (!ids.length) return ok(res, {});

      // Query logos for both offer_id and demand_request_id
      const { rows } = await pool.query(
        `SELECT DISTINCT ON (COALESCE(offer_id, demand_request_id))
                COALESCE(offer_id, demand_request_id) AS entity_id, file_path
         FROM offer_assets
         WHERE (offer_id = ANY($1) OR demand_request_id = ANY($1))
               AND asset_type = 'logo'
         ORDER BY COALESCE(offer_id, demand_request_id), created_at DESC`,
        [ids]
      );

      const map = {};
      for (const r of rows) map[r.entity_id] = r.file_path;

      // Fallback to company/org logos when no entry-specific asset exists.
      const missingIds = ids.filter((id) => !map[id]);
      if (missingIds.length) {
        const { rows: fallbackRows } = await pool.query(
          `SELECT cp.id AS entity_id, COALESCE(o.logo_url, cfp.logo_url) AS file_path
             FROM capacity_posts cp
             LEFT JOIN users u ON u.id = cp.supplier_company_id
             LEFT JOIN organizations o ON o.id = u.org_id
             LEFT JOIN company_profiles cfp ON cfp.user_id = cp.supplier_company_id
            WHERE cp.id = ANY($1)
           UNION ALL
           SELECT dr.id AS entity_id, COALESCE(o.logo_url, cfp.logo_url) AS file_path
             FROM demand_requests dr
             LEFT JOIN users u ON u.id = dr.requester_company_id
             LEFT JOIN organizations o ON o.id = u.org_id
             LEFT JOIN company_profiles cfp ON cfp.user_id = dr.requester_company_id
            WHERE dr.id = ANY($1)`,
          [missingIds]
        );
        for (const row of fallbackRows) {
          if (!map[row.entity_id] && row.file_path) {
            map[row.entity_id] = row.file_path;
          }
        }
      }
      return ok(res, map);
    } catch (err) {
      logger.error({ err }, "GET /offer-assets/batch-logos");
      next(err);
    }
  });

  /* ── POST /offer-assets/:offerId/upload ──────────── */

  router.post("/offer-assets/:offerId/upload", requireAuth, handleUpload, async (req, res, next) => {
    try {
      const { offerId } = req.params;

      // UUID-Validierung gegen Path Traversal
      if (!UUID_RE.test(offerId)) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return fail(res, "VALIDATION", "Ungueltige Eintrags-ID");
      }

      const assetType = req.body.asset_type;

      // Validate asset_type
      if (!assetType || !VALID_ASSET_TYPES.includes(assetType)) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return fail(res, "VALIDATION", "asset_type muss einer von: " + VALID_ASSET_TYPES.join(", ") + " sein");
      }

      // Ownership check (supports both capacity_posts and demand_requests)
      const ownership = await verifyOwnership(pool, offerId, req.session.userId);
      if (!ownership.found) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return fail(res, "NOT_FOUND", "Eintrag nicht gefunden", 404);
      }
      if (!ownership.isOwner) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return fail(res, "FORBIDDEN", "Keine Berechtigung", 403);
      }

      if (!req.file) {
        return fail(res, "VALIDATION", "Keine Datei hochgeladen");
      }

      const fk = entityFkColumns(ownership.entity.type, offerId);
      const fkWhereCol = fk.offer_id ? "offer_id" : fk.marketplace_offer_id ? "marketplace_offer_id" : "demand_request_id";

      // For logo: replace existing (only 1 logo allowed)
      if (assetType === "logo") {
        const { rows: existing } = await pool.query(
          `SELECT id, file_path FROM offer_assets WHERE ${fkWhereCol} = $1 AND asset_type = 'logo'`,
          [offerId]
        );
        for (const old of existing) {
          const oldPath = path.join(process.cwd(), old.file_path);
          fs.unlink(oldPath, () => {});
          await pool.query("DELETE FROM offer_assets WHERE id = $1", [old.id]);
        }
      }

      // Relative path for DB storage
      const relativePath = path.join("uploads", "offers", offerId, req.file.filename).replace(/\\/g, "/");

      const { rows } = await pool.query(
        `INSERT INTO offer_assets (offer_id, demand_request_id, marketplace_offer_id, asset_type, file_path, original_name, mime_type, file_size)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [fk.offer_id, fk.demand_request_id, fk.marketplace_offer_id, assetType, relativePath, req.file.originalname, req.file.mimetype, req.file.size]
      );

      // Dealakte-Upload: deal_documents-Record erzeugen und rueckverknuepfen
      if (ownership.entity.type === "deal" && assetType === "deal_document") {
        const { rows: offerRows } = await pool.query(
          "SELECT agreement_ref FROM offers WHERE id = $1",
          [offerId]
        );
        const agreementRef = offerRows[0]?.agreement_ref || null;
        const doc = await createUploadedDocumentRecord(pool, {
          offerId,
          documentType: "summary",
          title: req.file.originalname,
          assetId: rows[0].id,
          generatedBy: req.session.userId,
          agreementRef
        });
        await pool.query(
          "UPDATE offer_assets SET deal_document_id = $2 WHERE id = $1",
          [rows[0].id, doc.id]
        );
        rows[0].deal_document_id = doc.id;
      }

      res.locals.audit = ownership.entity.type === "deal"
        ? { action: "offer_asset.upload", entity_type: "offer", entity_id: offerId, details: { asset_id: rows[0].id, asset_type: assetType, mime_type: req.file.mimetype } }
        : { action: "offer_asset.upload", entity_type: "offer_asset", entity_id: rows[0].id, details: { offer_id: offerId, asset_type: assetType, mime_type: req.file.mimetype } };
      return ok(res, rows[0], 201);
    } catch (err) {
      logger.error({ err }, "POST /offer-assets/:offerId/upload");
      next(err);
    }
  });

  /* ── GET /offer-assets/:offerId ──────────────────── */

  router.get("/offer-assets/:offerId", requireAuth, async (req, res, next) => {
    try {
      const { offerId } = req.params;

      // UUID-Validierung
      if (!UUID_RE.test(offerId)) return fail(res, "VALIDATION", "Ungueltige Eintrags-ID");

      // Resolve entity (capacity_post or demand_request)
      const entity = await resolveEntity(pool, offerId);
      if (!entity.found) return fail(res, "NOT_FOUND", "Eintrag nicht gefunden", 404);

      const fkWhereCol = entity.type === "supply" ? "offer_id" : entity.type === "deal" ? "marketplace_offer_id" : "demand_request_id";

      // Load uploaded assets
      const { rows: assets } = await pool.query(
        `SELECT * FROM offer_assets WHERE ${fkWhereCol} = $1 ORDER BY created_at DESC`,
        [offerId]
      );

      // Group by type
      const result = {
        logo: null,
        safety_images: [],
        gallery: [],
        compliance_docs: [],
        deal_documents: []
      };

      for (const a of assets) {
        switch (a.asset_type) {
          case "logo":
            if (!result.logo) result.logo = a;
            break;
          case "safety":
            result.safety_images.push(a);
            break;
          case "gallery":
            result.gallery.push(a);
            break;
          case "compliance":
            result.compliance_docs.push(a);
            break;
          case "deal_document":
            result.deal_documents.push(a);
            break;
        }
      }

      // Compliance Card Integration: merge org compliance documents (supply only)
      if (entity.type === "supply" && entity.orgId) {
        try {
          const { rows: compDocs } = await pool.query(
            `SELECT id, doc_type, doc_name, file_ref, status, valid_until
             FROM compliance_documents
             WHERE org_id = $1 AND status IN ('verified', 'pending')
             ORDER BY created_at DESC`,
            [entity.orgId]
          );
          for (const cd of compDocs) {
            result.compliance_docs.push({
              id: cd.id,
              offer_id: offerId,
              asset_type: "compliance",
              file_path: cd.file_ref || null,
              original_name: cd.doc_name,
              mime_type: null,
              file_size: null,
              source_type: "compliance_card",
              compliance_status: cd.status,
              compliance_doc_type: cd.doc_type,
              valid_until: cd.valid_until,
              created_at: null
            });
          }
        } catch (compErr) {
          logger.warn({ err: compErr }, "Compliance card lookup failed for entry " + offerId);
        }
      }

      return ok(res, result);
    } catch (err) {
      logger.error({ err }, "GET /offer-assets/:offerId");
      next(err);
    }
  });

  /* ── DELETE /offer-assets/:assetId ───────────────── */

  router.delete("/offer-assets/:assetId", requireAuth, async (req, res, next) => {
    try {
      const { assetId } = req.params;

      // Find asset — join BOTH capacity_posts and demand_requests via LEFT JOIN
      const { rows } = await pool.query(
        `SELECT oa.*,
                cp.supplier_company_id AS capacity_owner_company_id,
                dr.requester_company_id AS demand_owner_company_id,
                d.requester_company_id AS requester_company_id,
                o.supplier_company_id AS supplier_company_id
         FROM offer_assets oa
         LEFT JOIN capacity_posts cp ON cp.id = oa.offer_id
         LEFT JOIN demand_requests dr ON dr.id = oa.demand_request_id
         LEFT JOIN offers o ON o.id = oa.marketplace_offer_id
         LEFT JOIN demand_requests d ON d.id = o.demand_request_id
         WHERE oa.id = $1`,
        [assetId]
      );
      if (!rows.length) return fail(res, "NOT_FOUND", "Asset nicht gefunden", 404);

      const asset = rows[0];
      const ownerIds = [
        asset.capacity_owner_company_id,
        asset.demand_owner_company_id,
        asset.requester_company_id,
        asset.supplier_company_id
      ].filter(Boolean);
      if (!ownerIds.length) return fail(res, "NOT_FOUND", "Zugehoeriger Eintrag nicht gefunden", 404);

      let allowed = false;
      for (const ownerId of ownerIds) {
        if (await canAccessAsOwner(pool, ownerId, req.session.userId)) { allowed = true; break; }
      }
      if (!allowed) return fail(res, "FORBIDDEN", "Keine Berechtigung", 403);

      // Deal-Dokument-Metadaten mitloeschen/archivieren
      if (asset.deal_document_id) {
        await pool.query("DELETE FROM deal_documents WHERE id = $1", [asset.deal_document_id]);
      }

      // Delete DB row first (can rollback), then file (best-effort)
      await pool.query("DELETE FROM offer_assets WHERE id = $1", [assetId]);

      // Delete file from disk (non-critical)
      const fullPath = path.join(process.cwd(), asset.file_path);
      fs.unlink(fullPath, (unlinkErr) => {
        if (unlinkErr && unlinkErr.code !== "ENOENT") {
          logger.warn({ err: unlinkErr, path: fullPath }, "Could not delete asset file");
        }
      });

      res.locals.audit = asset.marketplace_offer_id
        ? { action: "offer_asset.delete", entity_type: "offer", entity_id: asset.marketplace_offer_id, details: { asset_id: assetId, file_path: asset.file_path } }
        : { action: "offer_asset.delete", entity_type: "offer_asset", entity_id: assetId, details: { file_path: asset.file_path } };
      return ok(res, { deleted: true });
    } catch (err) {
      logger.error({ err }, "DELETE /offer-assets/:assetId");
      next(err);
    }
  });

  return router;
}
