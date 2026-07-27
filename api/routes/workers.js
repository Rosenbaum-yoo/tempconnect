/**
 * Workers Router — Supplier/Dispatcher-Sicht
 * Worker CRUD, Invite-System, Assignment-Links, Submission-Review-Flow
 * Voraussetzung: PLUS oder PRO Plan
 */
import { z } from "zod";
import { Router } from "express";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import multer from "multer";
import { requirePermission } from "../middleware/rbac.js";
import { requireScope } from "../middleware/apiKeyAuth.js";
import { hasFeature } from "../config/planFeatures.js";
import * as assignmentStaffingService from "../services/assignmentStaffingService.js";
import * as dealStaffingFastTrackService from "../services/dealStaffingFastTrackService.js";
import * as workerService from "../services/workerService.js";
import * as workforceService from "../services/workforceService.js";
import * as submissionSvc from "../services/workerSubmissionService.js";
import * as billingMetrics from "../services/billingMetricsService.js";
import * as workerNotifications from "../services/workerNotificationService.js";
import * as workerOfferReservationService from "../services/workerOfferReservationService.js";
import * as workforceSchedulePdf from "../services/workforceSchedulePdfService.js";
import * as complaintSvc from "../services/companyComplaintService.js";
import * as blocklistSvc from "../services/companyBlocklistService.js";
import { trackProductEventFromRequest } from "../services/productAnalyticsService.js";
import { swallow } from "../utils/logger.js";
import { recordActivity } from "../services/eventTrackingService.js";

/* ── Schemas ─────────────────────────────────────────────────────────────────── */

const dateRx = /^\d{4}-\d{2}-\d{2}$/;
const timeRx = /^\d{2}:\d{2}$/;
const uuidRx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const publicProfileFieldSchema = z.enum(workerService.PUBLIC_PROFILE_FIELDS);
const workerDocumentCategorySchema = z.enum(workerService.WORKER_DOCUMENT_CATEGORIES);
const qualificationSchema = z.union([
  z.string().min(1).max(200),
  z.object({
    name: z.string().min(1).max(200),
    issuer: z.string().max(200).optional().nullable(),
    expires_at: z.string().regex(dateRx).optional().nullable(),
    document_label: z.string().max(200).optional().nullable(),
    document_url: z.string().max(2000).optional().nullable(),
    note: z.string().max(1000).optional().nullable()
  })
]);

const createWorkerSchema = z.object({
  email:            z.string().email().max(254),
  first_name:       z.string().min(1).max(100),
  last_name:        z.string().min(1).max(100),
  personnel_number: z.string().max(50).optional().nullable(),
  phone:            z.string().max(50).optional().nullable(),
  street:           z.string().max(200).optional().nullable(),
  postal_code:      z.string().max(20).optional().nullable(),
  city:             z.string().max(100).optional().nullable(),
  country:          z.string().max(3).default("DE"),
  password:         z.string().min(8).max(128).optional()
});

const inviteSchema = z.object({
  email:            z.string().email().max(254),
  first_name:       z.string().min(1).max(100),
  last_name:        z.string().min(1).max(100),
  personnel_number: z.string().max(50).optional().nullable()
});

const updateProfileSchema = z.object({
  first_name:       z.string().min(1).max(100).optional(),
  last_name:        z.string().min(1).max(100).optional(),
  personnel_number: z.string().max(50).optional().nullable(),
  phone:            z.string().max(50).optional().nullable(),
  street:           z.string().max(200).optional().nullable(),
  postal_code:      z.string().max(20).optional().nullable(),
  city:             z.string().max(100).optional().nullable(),
  country:          z.string().max(3).optional().nullable(),
  preferred_locale: z.string().max(5).optional().nullable(),
  date_of_birth:    z.string().regex(dateRx).optional().nullable(),
  notes:            z.string().max(4000).optional().nullable(),
  skill_tags:       z.array(z.string().min(1).max(80)).max(50).optional(),
  qualifications:   z.array(qualificationSchema).max(50).optional(),
  profile_text:     z.string().max(4000).optional().nullable(),
  profile_public:   z.boolean().optional(),
  public_profile_fields: z.array(publicProfileFieldSchema).max(workerService.PUBLIC_PROFILE_FIELDS.length).optional(),
  availability_note: z.string().max(1000).optional().nullable()
});

const updateAssignmentLinkSchema = z.object({
  client_name:           z.string().max(200).optional().nullable(),
  location_address:      z.string().max(500).optional().nullable(),
  meeting_point:         z.string().max(500).optional().nullable(),
  instructions:          z.string().max(2000).optional().nullable(),
  dress_code:            z.string().max(500).optional().nullable(),
  contact_name:          z.string().max(200).optional().nullable(),
  contact_phone:         z.string().max(50).optional().nullable(),
  contact_email:         z.string().email().max(254).optional().nullable(),
  dispatcher_name:       z.string().max(200).optional().nullable(),
  dispatcher_phone:      z.string().max(50).optional().nullable(),
  dispatcher_email:      z.string().email().max(254).optional().nullable(),
  start_date:            z.string().regex(dateRx).optional(),
  end_date:              z.string().regex(dateRx).optional().nullable(),
  default_hours_per_day: z.number().min(0).max(24).optional(),
  default_shift_start:   z.string().regex(timeRx).optional().nullable(),
  default_shift_end:     z.string().regex(timeRx).optional().nullable(),
  default_break_minutes: z.number().int().min(0).max(120).optional(),
  notes:                 z.string().max(2000).optional().nullable()
});

const assignmentLinkSchema = z.object({
  worker_user_id:         z.string().uuid(),
  assignment_id:          z.string().uuid(),
  org_id:                 z.string().uuid(),
  start_date:             z.string().regex(dateRx),
  end_date:               z.string().regex(dateRx).optional().nullable(),
  role:                   z.enum(["primary","backup"]).default("primary"),
  default_hours_per_day:  z.number().min(0).max(24).default(8),
  default_shift_start:    z.string().regex(timeRx).optional().nullable(),
  default_shift_end:      z.string().regex(timeRx).optional().nullable(),
  default_break_minutes:  z.number().int().min(0).max(120).default(30),
  notes:                  z.string().max(2000).optional().nullable()
});

const reviewActionSchema = z.object({
  note: z.string().max(4000).optional().nullable()
});

const workerDocumentCreateSchema = z.object({
  category: workerDocumentCategorySchema.default("qualification"),
  title: z.string().min(1).max(200),
  qualification_name: z.string().max(200).optional().nullable(),
  issuer: z.string().max(200).optional().nullable(),
  valid_from: z.string().regex(dateRx).optional().nullable(),
  valid_until: z.string().regex(dateRx).optional().nullable(),
  notes: z.string().max(2000).optional().nullable()
});

const workerDocumentUpdateSchema = z.object({
  category: workerDocumentCategorySchema.optional(),
  title: z.string().min(1).max(200).optional(),
  qualification_name: z.string().max(200).optional().nullable(),
  issuer: z.string().max(200).optional().nullable(),
  valid_from: z.string().regex(dateRx).optional().nullable(),
  valid_until: z.string().regex(dateRx).optional().nullable(),
  notes: z.string().max(2000).optional().nullable()
});

const assignCapacitySchema = z.object({
  capacity_post_id:       z.string().uuid(),
  worker_user_id:         z.string().uuid(),
  start_date:             z.string().regex(dateRx),
  end_date:               z.string().regex(dateRx).optional().nullable(),
  default_hours_per_day:  z.number().min(0).max(24).default(8),
  default_shift_start:    z.string().regex(timeRx).optional().nullable(),
  default_shift_end:      z.string().regex(timeRx).optional().nullable(),
  default_break_minutes:  z.number().int().min(0).max(120).default(30),
  client_name:            z.string().max(200).optional().nullable(),
  notes:                  z.string().max(2000).optional().nullable()
});

const staffingCampaignSchema = z.object({
  worker_user_ids: z.array(z.string().uuid()).min(1).max(100),
  message: z.string().max(2000).optional().nullable(),
  name: z.string().max(200).optional().nullable(),
  expires_at: z.string().datetime().optional().nullable(),
  promotion_mode: z.enum(["auto_finalize", "manual_review"]).optional(),
  reservation_window_minutes: z.number().int().min(1).max(10080).optional(),
  auto_backfill_enabled: z.boolean().optional()
});

const staffingReservationFinalizeSchema = z.object({
  note: z.string().max(2000).optional().nullable()
});

const staffingWaitlistSchema = z.object({
  worker_user_ids: z.array(z.string().uuid()).min(1).max(100)
});

const staffingWaitlistWaveSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  auto_backfill_enabled: z.boolean().optional()
});
const staffingQuickAssignSchema = z.object({
  worker_user_ids: z.array(z.string().uuid()).min(1).max(25),
  client_name: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable()
});
const staffingChoiceSetCreateSchema = z.object({
  worker_user_id: z.string().uuid(),
  assignment_ids: z.array(z.string().uuid()).min(2).max(12),
  choice_mode: z.enum(["preference_only", "ranked_choice", "free_choice"]),
  title: z.string().max(200).optional().nullable(),
  message: z.string().max(2000).optional().nullable(),
  response_deadline_at: z.string().datetime().optional().nullable()
});
const staffingChoiceSetAssignSchema = z.object({
  choice_option_id: z.string().uuid(),
  client_name: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable()
});

const workerDocumentAllowedMimes = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const workerDocumentAllowedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".pdf"]);
const workerDocumentMaxFileSize = 10 * 1024 * 1024;

function createWorkerDocumentUpload() {
  return multer({
    storage: multer.diskStorage({
      destination(req, _file, cb) {
        if (!uuidRx.test(String(req.params.userId || ""))) {
          return cb(new Error("INVALID_WORKER_ID"));
        }
        const dir = path.join(process.cwd(), "uploads", "worker-documents", req.params.userId);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename(_req, file, cb) {
        const rawExt = path.extname(file.originalname).toLowerCase() || "";
        const ext = workerDocumentAllowedExtensions.has(rawExt) ? rawExt : "";
        cb(null, Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ext);
      }
    }),
    limits: { fileSize: workerDocumentMaxFileSize },
    fileFilter(_req, file, cb) {
      if (workerDocumentAllowedMimes.includes(file.mimetype)) return cb(null, true);
      cb(Object.assign(new Error("Nicht erlaubter Dateityp: " + file.mimetype), { code: "INVALID_MIME" }));
    }
  });
}

/* ── Feature-Gate ────────────────────────────────────────────────────────────── */

function requireWorkerFeature(getUserAndPlan) {
  return async (req, res, next) => {
    if (!req.session?.userId) return res.status(401).json({ error: "NOT_AUTHENTICATED" });
    try {
      const up = await getUserAndPlan(req.session.userId);
      const plan = up?.plan || "FREE";
      if (!hasFeature(plan, "worker_module")) {
        return res.status(403).json({
          error: "FEATURE_NOT_AVAILABLE",
          feature: "worker_module",
          required_plans: ["PLUS", "PRO", "ENTERPRISE"],
          current_plan: plan
        });
      }
      req.userPlan = plan;
      next();
    } catch (err) { next(err); }
  };
}

/* ── Router ──────────────────────────────────────────────────────────────────── */

export function createWorkersRouter(deps) {
  const { pool, requireAuth, logger, getUserAndPlan, requestLimiter } = deps;
  // inviteLimiter: prevent email-bomb via invite endpoints (applies to POST GETs).
  const inviteLimiter = requestLimiter || ((_req, _res, next) => next());
  const router = Router();
  const rperm = (p) => requirePermission(p, { pool, logger });
  const gate  = requireWorkerFeature(getUserAndPlan);
  const base  = [requireAuth, gate];
  const workerDocumentUpload = createWorkerDocumentUpload();
  const buildPublicProfileLinks = (worker) => {
    if (!worker?.public_profile_slug) {
      return { public_profile_path: null, public_profile_url: null };
    }
    const publicPath = `/public/worker-profile-public.html?slug=${worker.public_profile_slug}`;
    const baseUrl = deps.config?.BASE_URL || "";
    return {
      public_profile_path: publicPath,
      public_profile_url: baseUrl ? `${baseUrl}${publicPath}` : publicPath
    };
  };
  const getScopedWorker = async (userId, orgId) => {
    const worker = await workerService.getWorkerProfile(pool, userId);
    if (!worker) return { error: "NOT_FOUND", status: 404 };
    if (worker.supplier_org_id !== orgId) return { error: "ORG_BOUNDARY_VIOLATION", status: 403 };
    return { worker };
  };

  router.get("/public/worker-profiles/:slug", async (req, res, next) => {
    try {
      const worker = await workerService.getWorkerPublicProfileBySlug(pool, req.params.slug);
      if (!worker || !Array.isArray(worker.public_fields) || worker.public_fields.length === 0) {
        return res.status(404).json({ error: "NOT_FOUND" });
      }
      res.json(worker);
    } catch (err) { next(err); }
  });

  /* ── CSV Bulk-Import ───────────────────────────────────────────────────────── */

  const importItemSchema = z.object({
    email:            z.string().email().max(254),
    first_name:       z.string().min(1).max(100),
    last_name:        z.string().min(1).max(100),
    personnel_number: z.string().max(50).optional().nullable(),
    phone:            z.string().max(50).optional().nullable(),
    street:           z.string().max(200).optional().nullable(),
    postal_code:      z.string().max(20).optional().nullable(),
    city:             z.string().max(100).optional().nullable(),
    country:          z.string().max(3).optional().nullable(),
    date_of_birth:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    notes:            z.string().max(4000).optional().nullable()
  });

  const importSchema = z.object({
    workers:      z.array(importItemSchema).min(1).max(1000),
    on_duplicate: z.enum(["skip", "update"]).default("skip")
  });

  router.post("/workers/import", ...base, requireScope("write:workers"), rperm("worker.create"), async (req, res, next) => {
    try {
      const parsed = importSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      }

      // Billing-Check
      const limits = await billingMetrics.checkPlanLimits(pool, req.orgId);
      if (limits.hard_blocked) {
        return res.status(402).json({ error: "WORKER_LIMIT_EXCEEDED", plan_limits: limits });
      }

      const result = await workerService.bulkImportWorkers(pool, {
        supplierOrgId: req.orgId,
        workers:       parsed.data.workers,
        onDuplicate:   parsed.data.on_duplicate,
        createdBy:     req.session.userId
      });

      res.locals.audit = {
        action: "worker.bulk_import",
        entity_type: "worker_import",
        entity_id: null,
        details: {
          total_rows:    parsed.data.workers.length,
          created_count: result.created.length,
          updated_count: result.updated.length,
          skipped_count: result.skipped.length,
          error_count:   result.errors.length,
          on_duplicate:  parsed.data.on_duplicate
        }
      };

      logger.info({
        org_id: req.orgId,
        user_id: req.session.userId,
        total: parsed.data.workers.length,
        created: result.created.length,
        updated: result.updated.length,
        skipped: result.skipped.length,
        errors: result.errors.length
      }, "worker.bulk_import completed");

      res.json(result);
    } catch (err) { next(err); }
  });

  /* ── Duplikat-Check (Pre-Validation für Frontend) ───────────────────────── */

  router.post("/workers/check-duplicates", ...base, requireScope("read:workers"), rperm("worker.view"), async (req, res, next) => {
    try {
      const emails = req.body?.emails;
      if (!Array.isArray(emails) || emails.length === 0 || emails.length > 1000) {
        return res.status(400).json({ error: "INVALID_EMAILS" });
      }
      const normalized = emails.map(e => String(e).toLowerCase().trim()).filter(Boolean);
      const { rows } = await pool.query(
        `SELECT LOWER(u.email) AS email, wp.first_name, wp.last_name
         FROM worker_profiles wp
         JOIN users u ON u.id = wp.user_id
         WHERE wp.supplier_org_id = $1 AND LOWER(u.email) = ANY($2::text[])`,
        [req.orgId, normalized]
      );
      const duplicates = {};
      for (const r of rows) {
        duplicates[r.email] = { first_name: r.first_name, last_name: r.last_name };
      }
      res.json({ duplicates, count: rows.length });
    } catch (err) { next(err); }
  });

  /* ── Worker-Liste ──────────────────────────────────────────────────────────── */

  router.get("/workers", ...base, requireScope("read:workers"), rperm("worker.view"), async (req, res, next) => {
    try {
      const workers = await workerService.listWorkers(pool, {
        supplierOrgId: req.orgId,
        isActive:  req.query.is_active !== undefined ? req.query.is_active === "true" : null,
        search:    req.query.search || null,
        limit:     parseInt(req.query.limit, 10)  || 100,
        offset:    parseInt(req.query.offset, 10) || 0
      });
      res.json({ items: workers, total: workers.length });
    } catch (err) { next(err); }
  });

  /* ── Worker anlegen (direkt, mit Passwort) ───────────────────────────────── */

  router.post("/workers", ...base, requireScope("write:workers"), rperm("worker.create"), async (req, res, next) => {
    try {
      const parsed = createWorkerSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      // Billing-Check: Hard-Limit?
      const limits = await billingMetrics.checkPlanLimits(pool, req.orgId);
      if (limits.hard_blocked) {
        return res.status(402).json({ error: "WORKER_LIMIT_EXCEEDED", plan_limits: limits });
      }

      const passwordHash = parsed.data.password
        ? await bcrypt.hash(parsed.data.password, 10)
        : await bcrypt.hash(Math.random().toString(36) + Date.now(), 10);

      const result = await workerService.createWorkerAccount(pool, {
        supplierOrgId:  req.orgId,
        email:          parsed.data.email,
        firstName:      parsed.data.first_name,
        lastName:       parsed.data.last_name,
        personnelNumber: parsed.data.personnel_number,
        phone:          parsed.data.phone,
        street:         parsed.data.street,
        postalCode:     parsed.data.postal_code,
        city:           parsed.data.city,
        country:        parsed.data.country,
        passwordHash,
        createdBy:      req.session.userId
      });

      res.locals.audit = {
        action: "worker.create", entity_type: "worker_profile",
        entity_id: result.profile.id,
        details: { email: parsed.data.email }
      };
      res.status(201).json(result);
    } catch (err) {
      if (err.code === "23505") return res.status(409).json({ error: "EMAIL_EXISTS" });
      next(err);
    }
  });

  /* ── Live-Belegschaft (Disposition) ──────────────────────────────────────────
   * Pro-Worker-Live-Status (verfügbar/im Einsatz/endet bald/inaktiv + offene Stundenzettel).
   * Strikt supplier_org_id-gebunden (req.orgId). Read-only, Zero-State bei leerer Belegschaft.
   * MUSS vor "/workers/:userId" stehen, sonst fängt :userId "live-board". */
  router.get("/workers/live-board", ...base, requireScope("read:workers"), rperm("worker.view"), async (req, res, next) => {
    try {
      const board = await workforceService.getWorkerLiveBoard(pool, req.orgId, {
        search: req.query.search || null,
        limit: parseInt(req.query.limit, 10) || 300
      });
      res.json(board);
    } catch (err) { next(err); }
  });

  /* ── Beschwerde-Eingang (P3.2, Agentur-Seite) ───────────────────────────────
   * Gegenstück zur Käufer-Meldung: der Disponent sieht Meldungen über SEINE Kräfte
   * (strikt supplier_org_id-gebunden) und schreibt den Status fort. Ohne diesen
   * Rückkanal wäre die Meldung eine Einbahnstraße.
   * MUSS vor "/workers/:userId" stehen. */
  router.get("/workers/complaints", ...base, requireScope("read:workers"), rperm("worker.view"), async (req, res, next) => {
    try {
      const items = await complaintSvc.listSupplierComplaints(pool, req.orgId, {
        status: req.query.status || null,
        limit: parseInt(req.query.limit, 10) || 100
      });
      res.json({ items, total: items.length, open: items.filter((c) => c.status === "open").length });
    } catch (err) { next(err); }
  });

  router.patch("/workers/complaints/:id([0-9a-fA-F-]{36})", ...base, requireScope("write:workers"), rperm("worker.manage"), async (req, res, next) => {
    try {
      const status = String(req.body?.status || "").trim();
      const result = await complaintSvc.updateComplaintStatus(pool, req.orgId, req.params.id, status);
      if (result.error === "INVALID_STATUS") return res.status(400).json(result);
      if (result.error) return res.status(404).json(result);
      res.locals.audit = {
        action: "supplier.worker_complaint.status", entity_type: "worker_complaint", entity_id: req.params.id,
        details: { status, responsible_actor_user_id: req.session.userId }
      };
      // Nur der Abschluss ist eine Aktivitaet — Zwischenstaende sind Arbeitsstand, kein Ereignis.
      if (status === "resolved" || status === "closed") {
        recordActivity(pool, {
          event_type: "complaint_resolved", actor_id: req.session.userId, org_id: req.orgId,
          target_org_id: result.complaint?.company_org_id || null,
          entity_type: "worker_complaint", entity_id: req.params.id, metadata: { status }
        });
      }
      res.json(result.complaint);
    } catch (err) { next(err); }
  });

  /* ── Sperr-Hinweise für die Disposition (P3.3) ───────────────────────────────
   * „Wer aus meiner Belegschaft ist bei welchem Kunden gesperrt?" — damit die
   * Zuweisungs-UI die Sperre anzeigt, bevor der Guard mit 409 abweist.
   * MUSS vor "/workers/:userId" stehen. */
  router.get("/workers/blocks", ...base, requireScope("read:workers"), rperm("worker.view"), async (req, res, next) => {
    try {
      const items = await blocklistSvc.listBlocksForSupplier(pool, req.orgId);
      res.json({ items, total: items.length });
    } catch (err) { next(err); }
  });

  /* ── Worker abrufen ──────────────────────────────────────────────────────── */

  router.get("/workers/:userId", ...base, requireScope("read:workers"), rperm("worker.view"), async (req, res, next) => {
    try {
      const worker = await workerService.getWorkerHub(pool, req.params.userId);
      if (!worker) return res.status(404).json({ error: "NOT_FOUND" });
      if (worker.supplier_org_id !== req.orgId) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      res.json({ ...worker, ...buildPublicProfileLinks(worker) });
    } catch (err) { next(err); }
  });

  /* ── Worker-Profil aktualisieren ─────────────────────────────────────────── */

  router.patch("/workers/:userId", ...base, requireScope("write:workers"), rperm("worker.edit"), async (req, res, next) => {
    try {
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const worker = await workerService.getWorkerProfile(pool, req.params.userId);
      if (!worker) return res.status(404).json({ error: "NOT_FOUND" });
      if (worker.supplier_org_id !== req.orgId) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });

      const effectivePublic = parsed.data.profile_public ?? worker.profile_public;
      const effectiveFields = parsed.data.public_profile_fields ?? worker.public_profile_fields ?? [];
      if (effectivePublic && effectiveFields.length === 0) {
        return res.status(400).json({ error: "PUBLIC_FIELDS_REQUIRED" });
      }

      const result = await workerService.updateWorkerProfile(pool, req.params.userId, req.orgId, parsed.data);
      if (!result) return res.status(400).json({ error: "NO_FIELDS" });
      res.locals.audit = { action: "worker.update_profile", entity_type: "worker_profile", entity_id: req.params.userId, details: { changed_fields: Object.keys(parsed.data) } };
      const hub = await workerService.getWorkerHub(pool, req.params.userId);
      res.json({ ...hub, ...buildPublicProfileLinks(hub) });
    } catch (err) { next(err); }
  });

  router.get("/workers/:userId/documents", ...base, requireScope("read:workers"), rperm("worker.view"), async (req, res, next) => {
    try {
      const scoped = await getScopedWorker(req.params.userId, req.orgId);
      if (scoped.error) return res.status(scoped.status).json({ error: scoped.error });
      const result = await workerService.listWorkerDocuments(pool, {
        workerUserId: req.params.userId,
        supplierOrgId: req.orgId,
        limit: parseInt(req.query.limit, 10) || 25,
        includeArchived: req.query.include_archived === "true"
      });
      res.json(result);
    } catch (err) { next(err); }
  });

  router.post("/workers/:userId/documents", ...base, requireScope("write:workers"), rperm("worker.edit"), (req, res, next) => {
    workerDocumentUpload.single("file")(req, res, (err) => {
      if (!err) return next();
      if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "FILE_TOO_LARGE" });
      if (err.code === "INVALID_MIME") return res.status(400).json({ error: "INVALID_MIME", message: err.message });
      if (err.message === "INVALID_WORKER_ID") return res.status(400).json({ error: "INVALID_WORKER_ID" });
      return res.status(400).json({ error: "UPLOAD_ERROR", message: err.message || "Upload fehlgeschlagen" });
    });
  }, async (req, res, next) => {
    try {
      const scoped = await getScopedWorker(req.params.userId, req.orgId);
      if (scoped.error) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(scoped.status).json({ error: scoped.error });
      }
      const parsed = workerDocumentCreateSchema.safeParse({
        category: req.body?.category || "qualification",
        title: req.body?.title,
        qualification_name: req.body?.qualification_name || null,
        issuer: req.body?.issuer || null,
        valid_from: req.body?.valid_from || null,
        valid_until: req.body?.valid_until || null,
        notes: req.body?.notes || null
      });
      if (!parsed.success) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      }
      if (!req.file) {
        return res.status(400).json({ error: "FILE_REQUIRED" });
      }

      const document = await workerService.createWorkerDocument(pool, {
        workerUserId: req.params.userId,
        supplierOrgId: req.orgId,
        category: parsed.data.category,
        title: parsed.data.title,
        qualificationName: parsed.data.qualification_name,
        issuer: parsed.data.issuer,
        fileRef: "/uploads/worker-documents/" + req.params.userId + "/" + req.file.filename,
        originalName: req.file.originalname || null,
        mimeType: req.file.mimetype || null,
        fileSizeBytes: req.file.size || null,
        validFrom: parsed.data.valid_from,
        validUntil: parsed.data.valid_until,
        notes: parsed.data.notes,
        uploadedBy: req.session.userId
      });
      res.locals.audit = {
        action: "worker.document_upload",
        entity_type: "worker_profile_document",
        entity_id: document.id,
        details: { worker_user_id: req.params.userId, category: document.category }
      };
      res.status(201).json(document);
    } catch (err) {
      if (req.file) fs.unlink(req.file.path, () => {});
      next(err);
    }
  });

  router.patch("/workers/:userId/documents/:documentId", ...base, requireScope("write:workers"), rperm("worker.edit"), async (req, res, next) => {
    try {
      const scoped = await getScopedWorker(req.params.userId, req.orgId);
      if (scoped.error) return res.status(scoped.status).json({ error: scoped.error });
      const parsed = workerDocumentUpdateSchema.safeParse({
        category: req.body?.category,
        title: req.body?.title,
        qualification_name: req.body?.qualification_name === undefined ? undefined : (req.body?.qualification_name || null),
        issuer: req.body?.issuer === undefined ? undefined : (req.body?.issuer || null),
        valid_from: req.body?.valid_from === undefined ? undefined : (req.body?.valid_from || null),
        valid_until: req.body?.valid_until === undefined ? undefined : (req.body?.valid_until || null),
        notes: req.body?.notes === undefined ? undefined : (req.body?.notes || null)
      });
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const document = await workerService.updateWorkerDocument(pool, req.params.documentId, req.params.userId, req.orgId, parsed.data);
      if (!document) return res.status(400).json({ error: "NO_FIELDS" });
      res.locals.audit = {
        action: "worker.document_update",
        entity_type: "worker_profile_document",
        entity_id: req.params.documentId,
        details: { changed_fields: Object.keys(parsed.data).filter((key) => parsed.data[key] !== undefined) }
      };
      res.json(document);
    } catch (err) { next(err); }
  });

  router.post("/workers/:userId/documents/:documentId/verify", ...base, requireScope("write:workers"), rperm("worker.manage"), async (req, res, next) => {
    try {
      const scoped = await getScopedWorker(req.params.userId, req.orgId);
      if (scoped.error) return res.status(scoped.status).json({ error: scoped.error });
      const parsed = reviewActionSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const document = await workerService.verifyWorkerDocument(pool, req.params.documentId, req.params.userId, req.orgId, {
        verifiedBy: req.session.userId,
        note: parsed.data.note || null
      });
      if (!document) return res.status(404).json({ error: "NOT_FOUND" });
      res.locals.audit = {
        action: "worker.document_verify",
        entity_type: "worker_profile_document",
        entity_id: req.params.documentId,
        details: { note: parsed.data.note || null }
      };
      workerNotifications.notifyWorkerDocumentVerified(
        pool,
        req.params.userId,
        document.id,
        document.title || document.original_name || "Nachweis"
      ).catch(swallow("workers"));
      res.json(document);
    } catch (err) { next(err); }
  });

  router.post("/workers/:userId/documents/:documentId/reject", ...base, requireScope("write:workers"), rperm("worker.manage"), async (req, res, next) => {
    try {
      const scoped = await getScopedWorker(req.params.userId, req.orgId);
      if (scoped.error) return res.status(scoped.status).json({ error: scoped.error });
      const parsed = reviewActionSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      if (!String(parsed.data.note || "").trim()) return res.status(400).json({ error: "NOTE_REQUIRED" });
      const document = await workerService.rejectWorkerDocument(pool, req.params.documentId, req.params.userId, req.orgId, {
        verifiedBy: req.session.userId,
        note: parsed.data.note.trim()
      });
      if (!document) return res.status(404).json({ error: "NOT_FOUND" });
      res.locals.audit = {
        action: "worker.document_reject",
        entity_type: "worker_profile_document",
        entity_id: req.params.documentId,
        details: { note: parsed.data.note.trim() }
      };
      workerNotifications.notifyWorkerDocumentRejected(
        pool,
        req.params.userId,
        document.id,
        document.title || document.original_name || "Nachweis",
        parsed.data.note.trim()
      ).catch(swallow("workers"));
      res.json(document);
    } catch (err) { next(err); }
  });

  router.get("/workers/:userId/documents/:documentId/download", ...base, requireScope("read:workers"), rperm("worker.view"), async (req, res, next) => {
    try {
      const scoped = await getScopedWorker(req.params.userId, req.orgId);
      if (scoped.error) return res.status(scoped.status).json({ error: scoped.error });
      const document = await workerService.getWorkerDocumentById(pool, req.params.documentId);
      if (!document || document.worker_user_id !== req.params.userId || document.supplier_org_id !== req.orgId) {
        return res.status(404).json({ error: "NOT_FOUND" });
      }
      if (!document.file_ref) return res.status(404).json({ error: "NO_FILE" });
      const filePath = path.join(process.cwd(), document.file_ref.replace(/^\//, ""));
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: "FILE_MISSING" });
      res.setHeader("Content-Type", document.mime_type || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${document.original_name || document.title || "nachweis"}"`);
      fs.createReadStream(filePath).pipe(res);
    } catch (err) { next(err); }
  });

  router.delete("/workers/:userId/documents/:documentId", ...base, requireScope("write:workers"), rperm("worker.manage"), async (req, res, next) => {
    try {
      const scoped = await getScopedWorker(req.params.userId, req.orgId);
      if (scoped.error) return res.status(scoped.status).json({ error: scoped.error });
      const document = await workerService.deleteWorkerDocument(pool, req.params.documentId, req.params.userId, req.orgId);
      if (!document) return res.status(404).json({ error: "NOT_FOUND" });
      if (document.file_ref) {
        const filePath = path.join(process.cwd(), document.file_ref.replace(/^\//, ""));
        fs.unlink(filePath, () => {});
      }
      res.locals.audit = {
        action: "worker.document_delete",
        entity_type: "worker_profile_document",
        entity_id: req.params.documentId
      };
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  /* ── Worker deaktivieren / reaktivieren ──────────────────────────────────── */

  router.post("/workers/:userId/deactivate", ...base, requireScope("write:workers"), rperm("worker.manage"), async (req, res, next) => {
    try {
      const worker = await workerService.getWorkerProfile(pool, req.params.userId);
      if (!worker) return res.status(404).json({ error: "NOT_FOUND" });
      if (worker.supplier_org_id !== req.orgId) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      await workerService.setWorkerActive(pool, req.params.userId, req.orgId, false);
      res.locals.audit = { action: "worker.deactivate", entity_type: "worker_profile", entity_id: req.params.userId };
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  router.post("/workers/:userId/activate", ...base, requireScope("write:workers"), rperm("worker.manage"), async (req, res, next) => {
    try {
      const worker = await workerService.getWorkerProfile(pool, req.params.userId);
      if (!worker) return res.status(404).json({ error: "NOT_FOUND" });
      if (worker.supplier_org_id !== req.orgId) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });

      // Re-Check Billing-Limit vor Reaktivierung
      const limits = await billingMetrics.checkPlanLimits(pool, req.orgId);
      if (limits.hard_blocked) {
        return res.status(402).json({ error: "WORKER_LIMIT_EXCEEDED", plan_limits: limits });
      }
      await workerService.setWorkerActive(pool, req.params.userId, req.orgId, true);
      res.locals.audit = { action: "worker.activate", entity_type: "worker_profile", entity_id: req.params.userId };
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  /* ── Invite-System ───────────────────────────────────────────────────────── */

  router.get("/worker-invites", ...base, requireScope("read:workers"), rperm("worker.manage"), async (req, res, next) => {
    try {
      const invites = await workerService.listInvites(pool, {
        supplierOrgId: req.orgId,
        status: req.query.status || null
      });
      res.json({ items: invites, total: invites.length });
    } catch (err) { next(err); }
  });

  router.post("/worker-invites", ...base, requireScope("write:workers"), inviteLimiter, rperm("worker.manage"), async (req, res, next) => {
    try {
      const parsed = inviteSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const limits = await billingMetrics.checkPlanLimits(pool, req.orgId);
      if (limits.hard_blocked) {
        return res.status(402).json({ error: "WORKER_LIMIT_EXCEEDED", plan_limits: limits });
      }

      const result = await workerService.createWorkerInvite(pool, {
        supplierOrgId:  req.orgId,
        invitedBy:      req.session.userId,
        email:          parsed.data.email,
        firstName:      parsed.data.first_name,
        lastName:       parsed.data.last_name,
        personnelNumber: parsed.data.personnel_number
      });

      if (result.error === "INVITE_ALREADY_PENDING") {
        return res.status(409).json({ error: result.error, invite_id: result.inviteId });
      }

      // Einladungs-E-Mail
      const { invite, token } = result;
      const BASE_URL = deps.config?.BASE_URL || "http://localhost:8080";
      const inviteUrl = `${BASE_URL}/worker-login.html?invite=${token}`;
      try {
        await deps.sendMail(
          invite.email,
          "Ihre Einladung zu TempConnect Worker-Portal",
          `<h2>Willkommen bei TempConnect!</h2>
           <p>Hallo ${invite.first_name},</p>
           <p>Sie wurden eingeladen, das Worker Self-Service Portal zu nutzen.</p>
           <p>Klicken Sie auf den folgenden Link, um Ihr Konto einzurichten:</p>
           <p><a href="${inviteUrl}" style="background:#0070f3;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Konto einrichten</a></p>
           <p style="color:#666;font-size:14px">Der Link ist 7 Tage gültig.</p>
           <p style="color:#666;font-size:12px">Falls Sie diese Einladung nicht erwartet haben, ignorieren Sie diese E-Mail.</p>`
        );
      } catch (mailErr) {
        logger.warn({ err: mailErr?.message }, "Worker-Invite E-Mail konnte nicht gesendet werden");
      }

      res.locals.audit = {
        action: "worker.invite_sent", entity_type: "worker_invite",
        entity_id: invite.id, details: { email: invite.email }
      };
      try {
        await trackProductEventFromRequest(pool, req, "worker_invite_sent", {
          flow_key: "worker_to_timesheet",
          metadata: { invite_id: invite.id }
        });
      } catch { /* analytics non-critical */ }
      res.status(201).json({ invite });
    } catch (err) { next(err); }
  });

  /* ── Bulk-Einladung: alle nicht-registrierten Worker einladen (kollisionsfrei) ── */
  router.post("/worker-invites/bulk", ...base, requireScope("write:workers"), inviteLimiter, rperm("worker.manage"), async (req, res, next) => {
    try {
      const limits = await billingMetrics.checkPlanLimits(pool, req.orgId);
      if (limits.hard_blocked) {
        return res.status(402).json({ error: "WORKER_LIMIT_EXCEEDED", plan_limits: limits });
      }
      const candidates = await workerService.listInvitableWorkers(pool, req.orgId);
      const BASE_URL = deps.config?.BASE_URL || "http://localhost:8080";
      const invited = [];
      const failed = [];
      for (const c of candidates) {
        try {
          const result = await workerService.createWorkerInvite(pool, {
            supplierOrgId: req.orgId, invitedBy: req.session.userId,
            email: c.email, firstName: c.first_name, lastName: c.last_name, personnelNumber: c.personnel_number
          });
          if (result.error) { failed.push({ email: c.email, error: result.error }); continue; }
          const { invite, token } = result;
          const inviteUrl = `${BASE_URL}/worker-login.html?invite=${token}`;
          try {
            await deps.sendMail(
              invite.email,
              "Ihre Einladung zu TempConnect Worker-Portal",
              `<h2>Willkommen bei TempConnect!</h2>
               <p>Hallo ${invite.first_name},</p>
               <p>Sie wurden eingeladen, das Worker Self-Service Portal zu nutzen.</p>
               <p><a href="${inviteUrl}" style="background:#0070f3;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Konto einrichten</a></p>
               <p style="color:#666;font-size:14px">Der Link ist 7 Tage gültig.</p>`
            );
          } catch (mailErr) {
            logger.warn({ err: mailErr?.message, email: invite.email }, "Bulk-Invite E-Mail fehlgeschlagen");
          }
          invited.push({ email: invite.email, invite_id: invite.id });
        } catch (e) {
          failed.push({ email: c.email, error: e.message });
        }
      }
      res.locals.audit = {
        action: "worker.bulk_invite_sent", entity_type: "worker_invite",
        entity_id: null, details: { invited: invited.length, failed: failed.length }
      };
      res.status(201).json({ invited_count: invited.length, failed_count: failed.length, invited, failed });
    } catch (err) { next(err); }
  });

  router.post("/worker-invites/:id/resend", ...base, requireScope("write:workers"), inviteLimiter, rperm("worker.manage"), async (req, res, next) => {
    try {
      const result = await workerService.resendInvite(pool, req.params.id, req.orgId);
      if (result.error) return res.status(result.error === "NOT_FOUND" ? 404 : 409).json({ error: result.error });

      const BASE_URL = deps.config?.BASE_URL || "http://localhost:8080";
      const inviteUrl = `${BASE_URL}/worker-login.html?invite=${result.token}`;
      try {
        await deps.sendMail(
          result.invite.email,
          "Erinnerung: Ihre Einladung zu TempConnect Worker-Portal",
          `<h2>Einladungs-Erinnerung</h2>
           <p>Hallo ${result.invite.first_name},</p>
           <p>Ihr Einladungslink:</p>
           <p><a href="${inviteUrl}">Konto einrichten</a></p>
           <p style="color:#666;font-size:14px">Der Link ist 7 Tage gültig.</p>`
        );
      } catch (mailErr) {
        logger.warn({ err: mailErr?.message }, "Resend-Invite E-Mail konnte nicht gesendet werden");
      }
      res.locals.audit = { action: "worker.invite_resend", entity_type: "worker_invite", entity_id: req.params.id };
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  router.post("/worker-invites/:id/revoke", ...base, requireScope("write:workers"), rperm("worker.manage"), async (req, res, next) => {
    try {
      const result = await workerService.revokeInvite(pool, req.params.id, req.orgId);
      if (result.error) return res.status(result.error === "NOT_FOUND" ? 404 : 409).json({ error: result.error });
      res.locals.audit = { action: "worker.invite_revoke", entity_type: "worker_invite", entity_id: req.params.id };
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  /* ── Assignment-Links ────────────────────────────────────────────────────── */

  router.get("/workers/:userId/assignments", ...base, requireScope("read:workers"), rperm("worker.view"), async (req, res, next) => {
    try {
      const worker = await workerService.getWorkerProfile(pool, req.params.userId);
      if (!worker) return res.status(404).json({ error: "NOT_FOUND" });
      if (worker.supplier_org_id !== req.orgId) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      const links = await workerService.getWorkerAssignments(pool, req.params.userId);
      res.json({ items: links, total: links.length });
    } catch (err) { next(err); }
  });

  router.post("/worker-assignment-links", ...base, requireScope("write:workers"), rperm("worker.manage"), async (req, res, next) => {
    try {
      const parsed = assignmentLinkSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      // Worker muss zur Org gehören
      const worker = await workerService.getWorkerProfile(pool, parsed.data.worker_user_id);
      if (!worker) return res.status(404).json({ error: "WORKER_NOT_FOUND" });
      if (worker.supplier_org_id !== req.orgId) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });

      const result = await workerService.createAssignmentLink(pool, {
        workerUserId:        parsed.data.worker_user_id,
        assignmentId:        parsed.data.assignment_id,
        orgId:               parsed.data.org_id,
        supplierOrgId:       req.orgId,
        startDate:           parsed.data.start_date,
        endDate:             parsed.data.end_date,
        role:                parsed.data.role,
        defaultHoursPerDay:  parsed.data.default_hours_per_day,
        defaultShiftStart:   parsed.data.default_shift_start,
        defaultShiftEnd:     parsed.data.default_shift_end,
        defaultBreakMinutes: parsed.data.default_break_minutes,
        notes:               parsed.data.notes,
        createdBy:           req.session.userId
      });

      if (result.error) return res.status(409).json({
        error: result.error,
        ...(result.conflicts ? { conflicts: result.conflicts, conflicting_link_ids: result.conflicting_link_ids } : {}),
        ...(result.error === "BLOCKED_BY_COMPANY" ? { blocked_until: result.blocked_until, reason: result.reason } : {})
      });
      res.locals.audit = { action: "worker_assignment_link.create", entity_type: "worker_assignment_link", entity_id: result.link.id, details: { worker_user_id: parsed.data.worker_user_id, assignment_id: parsed.data.assignment_id } };
      // Notify worker about new assignment (fire-and-forget)
      const clientName = parsed.data.client_name
        || (await pool.query("SELECT name FROM organizations WHERE id=$1", [parsed.data.org_id])).rows[0]?.name
        || null;
      workerNotifications.notifyAssignmentNew(pool, parsed.data.worker_user_id, result.link.id, clientName);
      // P1.3: Arbeiter ist jetzt im Einsatz → seine Multi-Skill-Angebote sofort aus dem
      // Marktplatz nehmen (Hard-Reserve), statt erst beim nächsten Maintenance-Sweep.
      workerOfferReservationService.syncWorkerReservation(pool, worker.id).catch(swallow("worker.offer_reservation_sync"));
      res.status(201).json(result.link);
    } catch (err) { next(err); }
  });

  /* ── Assignment-Link Worker-Felder aktualisieren (Supplier-Ansicht) ────────────── */

  router.patch("/worker-assignment-links/:id", ...base, requireScope("write:workers"), rperm("worker.manage"), async (req, res, next) => {
    try {
      const parsed = updateAssignmentLinkSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      // Prüfen ob Link zur Org gehört
      const { rows } = await pool.query(
        "SELECT id FROM worker_assignment_links WHERE id=$1 AND supplier_org_id=$2",
        [req.params.id, req.orgId]
      );
      if (!rows[0]) return res.status(404).json({ error: "NOT_FOUND" });

      const fields = [];
      const params = [];
      const allowed = [
        "client_name","location_address","meeting_point","instructions","dress_code",
        "contact_name","contact_phone","contact_email",
        "dispatcher_name","dispatcher_phone","dispatcher_email",
        "start_date","end_date","default_hours_per_day",
        "default_shift_start","default_shift_end","default_break_minutes","notes"
      ];
      for (const key of allowed) {
        if (parsed.data[key] !== undefined) {
          params.push(parsed.data[key]);
          fields.push(`${key} = $${params.length}`);
        }
      }
      if (!fields.length) return res.status(400).json({ error: "NO_FIELDS" });

      params.push(req.params.id);
      const { rows: updated } = await pool.query(
        `UPDATE worker_assignment_links SET ${fields.join(", ")}, updated_at=NOW()
         WHERE id=$${params.length} RETURNING *`,
        params
      );
      res.locals.audit = { action: "worker_assignment_link.update", entity_type: "worker_assignment_link", entity_id: req.params.id, details: { changed_fields: Object.keys(parsed.data).filter(k => parsed.data[k] !== undefined) } };
      res.json(updated[0]);
    } catch (err) { next(err); }
  });

  /* ── Ersatz bei Krankheit/Abbruch (Chef weist Ersatz ab Wirk-Datum zu) — P1.1 ──── */

  const replaceAssignmentSchema = z.object({
    replacement_worker_user_id: z.string().regex(uuidRx),
    effective_date:             z.string().regex(dateRx),
    reason:                     z.string().trim().min(3).max(500)
  });

  router.post("/worker-assignment-links/:id/replace", ...base, requireScope("write:workers"), rperm("worker.manage"), async (req, res, next) => {
    try {
      const parsed = replaceAssignmentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const result = await workerService.replaceAssignmentWorker(pool, {
        linkId:                  req.params.id,
        supplierOrgId:           req.orgId,
        replacementWorkerUserId: parsed.data.replacement_worker_user_id,
        effectiveDate:           parsed.data.effective_date,
        reason:                  parsed.data.reason,
        createdBy:               req.session.userId
      });
      if (result.error) {
        const code = result.error === "NOT_FOUND" ? 404
          : result.error === "REPLACEMENT_NOT_IN_ORG" ? 403
          : 409;
        return res.status(code).json({
          error: result.error,
          ...(result.current_status ? { current_status: result.current_status } : {}),
          ...(result.conflicts ? { conflicts: result.conflicts, conflicting_link_ids: result.conflicting_link_ids } : {}),
          ...(result.error === "BLOCKED_BY_COMPANY" ? { blocked_until: result.blocked_until, reason: result.reason } : {})
        });
      }

      res.locals.audit = {
        action: "worker_assignment_link.replace",
        entity_type: "worker_assignment_link",
        entity_id: req.params.id,
        details: {
          assignment_id:              result.replacement_link.assignment_id,
          ailing_worker_user_id:      result.ailing_worker_user_id,
          replacement_worker_user_id: parsed.data.replacement_worker_user_id,
          effective_date:             parsed.data.effective_date,
          reason:                     parsed.data.reason,
          responsible_actor_user_id:  req.session.userId
        }
      };

      recordActivity(pool, {
        event_type: "worker_replacement_assigned", actor_id: req.session.userId, org_id: req.orgId,
        entity_type: "worker_assignment_link", entity_id: result.replacement_link.id,
        metadata: {
          assignment_id: result.replacement_link.assignment_id,
          ailing_worker_user_id: result.ailing_worker_user_id,
          replacement_worker_user_id: parsed.data.replacement_worker_user_id,
          effective_date: parsed.data.effective_date
        }
      });

      // Ripple (fire-and-forget): Ersatz ist jetzt im Einsatz → Angebote reservieren;
      // Ausfallender ist frei → Angebote reaktivieren (taucht im Marktplatz wieder auf).
      (async () => {
        const [ailing, replacement] = await Promise.all([
          workerService.getWorkerProfile(pool, result.ailing_worker_user_id),
          workerService.getWorkerProfile(pool, parsed.data.replacement_worker_user_id)
        ]);
        if (replacement?.id) await workerOfferReservationService.syncWorkerReservation(pool, replacement.id);
        if (ailing?.id)      await workerOfferReservationService.syncWorkerReservation(pool, ailing.id);
      })().catch(swallow("worker.replace.reservation_sync"));

      // Notifications: Ersatz über neuen Einsatz, Ausfallenden über Herausnahme.
      const clientName = result.replacement_link.client_name || null;
      workerNotifications.notifyAssignmentNew(pool, parsed.data.replacement_worker_user_id, result.replacement_link.id, clientName);
      workerNotifications.notifyAssignmentRemoved(pool, result.ailing_worker_user_id, req.params.id, {
        effectiveFrom: parsed.data.effective_date, reason: parsed.data.reason
      });

      res.status(200).json({
        original_link:    result.original_link,
        replacement_link: result.replacement_link
      });
    } catch (err) { next(err); }
  });

  router.get("/supplier/assignment-links", ...base, requireScope("read:workers"), rperm("worker.view"), async (req, res, next) => {
    try {
      const links = await workerService.getAssignmentLinksForSupplier(pool, req.orgId, {
        assignmentId: req.query.assignment_id || null
      });
      res.json({ items: links, total: links.length });
    } catch (err) { next(err); }
  });

  /* ── P1.5: Monats-Einsatzplan als PDF (abrechnungsrelevant) ─────────────────── */

  router.get("/supplier/plan/monthly.pdf", ...base, requireScope("read:workers"), rperm("worker.view"), async (req, res, next) => {
    try {
      const now = new Date();
      let year = parseInt(req.query.year, 10);
      let month = parseInt(req.query.month, 10);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) year = now.getFullYear();
      if (!Number.isInteger(month) || month < 1 || month > 12) month = now.getMonth() + 1;

      const links = await workerService.getAssignmentLinksForSupplier(pool, req.orgId, {});
      const orgRow = await pool.query("SELECT name FROM organizations WHERE id=$1", [req.orgId]);
      const orgName = orgRow.rows[0]?.name || "";
      const bytes = await workforceSchedulePdf.renderMonthlyPlanPdf({ orgName, year, month, links, generatedAt: new Date() });

      const filename = `einsatzplan_${year}-${String(month).padStart(2, "0")}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Cache-Control", "no-store");
      res.send(Buffer.from(bytes));
    } catch (err) { next(err); }
  });

  /* ── Submission-Review-Flow ──────────────────────────────────────────────── */

  router.get("/worker-submissions", ...base, requireScope("read:workers"), rperm("worker.review"), async (req, res, next) => {
    try {
      const items = await submissionSvc.listSubmissions(pool, {
        supplierOrgId: req.orgId,
        status:        req.query.status        || null,
        assignmentId:  req.query.assignment_id || null,
        weekStartFrom: req.query.week_from     || null,
        weekStartTo:   req.query.week_to       || null,
        limit:         parseInt(req.query.limit, 10) || 100
      });
      const kpis = await submissionSvc.getSupplierSubmissionKPIs(pool, req.orgId);
      res.json({ items, total: items.length, kpis });
    } catch (err) { next(err); }
  });

  router.get("/worker-submissions/kpis", ...base, requireScope("read:workers"), rperm("worker.review"), async (req, res, next) => {
    try {
      const kpis = await submissionSvc.getSupplierSubmissionKPIs(pool, req.orgId);
      res.json(kpis);
    } catch (err) { next(err); }
  });

  router.get("/worker-submissions/:id", ...base, requireScope("read:workers"), rperm("worker.review"), async (req, res, next) => {
    try {
      const sub = await submissionSvc.getSubmissionWithEntries(pool, req.params.id);
      if (!sub) return res.status(404).json({ error: "NOT_FOUND" });
      if (sub.supplier_org_id !== req.orgId) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      res.json(sub);
    } catch (err) { next(err); }
  });

  router.post("/worker-submissions/:id/start-review", ...base, requireScope("write:workers"), rperm("worker.review"), async (req, res, next) => {
    try {
      const sub = await submissionSvc.getSubmission(pool, req.params.id);
      if (!sub) return res.status(404).json({ error: "NOT_FOUND" });
      if (sub.supplier_org_id !== req.orgId) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      const result = await submissionSvc.startReview(pool, req.params.id, req.session.userId);
      if (result.error) return res.status(409).json(result);
      res.locals.audit = { action: "worker_submission.start_review", entity_type: "worker_submission", entity_id: req.params.id };
      res.json(result);
    } catch (err) { next(err); }
  });

  router.post("/worker-submissions/:id/request-correction", ...base, requireScope("write:workers"), rperm("worker.review"), async (req, res, next) => {
    try {
      const sub = await submissionSvc.getSubmission(pool, req.params.id);
      if (!sub) return res.status(404).json({ error: "NOT_FOUND" });
      if (sub.supplier_org_id !== req.orgId) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      const parsed = reviewActionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const result = await submissionSvc.requestCorrection(pool, req.params.id, req.session.userId, parsed.data.note);
      if (result.error) return res.status(409).json(result);
      res.locals.audit = { action: "worker_submission.request_correction", entity_type: "worker_submission", entity_id: req.params.id, details: { note: parsed.data.note } };
      res.json(result);
    } catch (err) { next(err); }
  });

  router.post("/worker-submissions/:id/accept", ...base, requireScope("write:workers"), rperm("worker.review"), async (req, res, next) => {
    try {
      const sub = await submissionSvc.getSubmission(pool, req.params.id);
      if (!sub) return res.status(404).json({ error: "NOT_FOUND" });
      if (sub.supplier_org_id !== req.orgId) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      const result = await submissionSvc.acceptIntoTimesheet(pool, req.params.id, req.session.userId);
      if (result.error) return res.status(409).json(result);
      res.locals.audit = {
        action: "worker_submission.accepted", entity_type: "worker_submission",
        entity_id: req.params.id, details: { timesheet_id: result.timesheet?.id }
      };
      res.json(result);
    } catch (err) { next(err); }
  });

  router.post("/worker-submissions/:id/reject", ...base, requireScope("write:workers"), rperm("worker.review"), async (req, res, next) => {
    try {
      const sub = await submissionSvc.getSubmission(pool, req.params.id);
      if (!sub) return res.status(404).json({ error: "NOT_FOUND" });
      if (sub.supplier_org_id !== req.orgId) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      const parsed = reviewActionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const result = await submissionSvc.rejectSubmission(pool, req.params.id, req.session.userId, parsed.data.note);
      if (result.error) return res.status(409).json(result);
      res.locals.audit = {
        action: "worker_submission.rejected", entity_type: "worker_submission",
        entity_id: req.params.id, details: { reason: parsed.data.note }
      };
      res.json(result);
    } catch (err) { next(err); }
  });

  router.post("/worker-submissions/:id/comment", ...base, requireScope("write:workers"), rperm("worker.review"), async (req, res, next) => {
    try {
      const sub = await submissionSvc.getSubmission(pool, req.params.id);
      if (!sub) return res.status(404).json({ error: "NOT_FOUND" });
      if (sub.supplier_org_id !== req.orgId) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      const note = String(req.body?.note || "").trim();
      if (!note) return res.status(400).json({ error: "NOTE_REQUIRED" });
      const result = await submissionSvc.addComment(pool, req.params.id, req.session.userId, note);
      res.locals.audit = { action: "worker_submission.comment", entity_type: "worker_submission", entity_id: req.params.id };
      res.json(result);
    } catch (err) { next(err); }
  });

  /* ── Kapazitäten → Worker-Zuweisung (Dispatcher) ─────────────────────────── */

  router.get("/unassigned-capacity-posts", ...base, requireScope("read:workers"), rperm("worker.edit"), async (req, res, next) => {
    try {
      // Legacy-Kapazitaeten wurden nur mit supplier_company_id angelegt (ohne org_id);
      // neuere mit beidem. Wir uebergeben beide IDs, damit beide Auspraegungen
      // im Dispatcher-Drawer "+ Kapazitaet zuweisen" sichtbar werden.
      const items = await workerService.getUnassignedCapacityPosts(pool, req.orgId, {
        supplierUserId: req.session.userId
      });
      res.json({ items, total: items.length });
    } catch (err) { next(err); }
  });

  // Unified manueller Zuweisungspfad (Dispatcher-Drawer).
  // Liefert proaktive capacity_posts + offene Deal-Assignments in einer Liste,
  // damit der Drawer "+ Kapazitaet zuweisen" BEIDE Quellen mit demselben
  // manuellen Detail-Form bedienen kann. Fast-Track "Deal-Einsaetze"-Sektion
  // bleibt davon unberuehrt.
  router.get("/assignable-sources", ...base, requireScope("read:workers"), rperm("worker.edit"), async (req, res, next) => {
    try {
      const items = await workerService.listAssignableSourcesForDispatcher(pool, req.orgId, {
        supplierUserId: req.session.userId
      });
      res.json({ items, total: items.length });
    } catch (err) { next(err); }
  });

  router.post("/assign-capacity-to-worker", ...base, requireScope("write:workers"), rperm("worker.edit"), async (req, res, next) => {
    try {
      const parsed = assignCapacitySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const result = await workerService.assignCapacityToWorker(pool, {
        capacityPostId:      parsed.data.capacity_post_id,
        workerUserId:        parsed.data.worker_user_id,
        supplierOrgId:       req.orgId,
        orgId:               req.orgId,
        startDate:           parsed.data.start_date,
        endDate:             parsed.data.end_date,
        defaultHoursPerDay:  parsed.data.default_hours_per_day,
        defaultShiftStart:   parsed.data.default_shift_start,
        defaultShiftEnd:     parsed.data.default_shift_end,
        defaultBreakMinutes: parsed.data.default_break_minutes,
        clientName:          parsed.data.client_name,
        notes:               parsed.data.notes,
        createdBy:           req.session.userId
      });
      if (result.error) {
        const statusMap = {
          CAPACITY_NOT_FOUND: 404, CAPACITY_NOT_ASSIGNABLE: 409,
          WORKER_NOT_FOUND: 404, WORKER_INACTIVE: 409,
          SCHEDULE_CONFLICT: 409
        };
        return res.status(statusMap[result.error] || 400).json(result);
      }

      // Fire-and-forget: Worker über neue Zuweisung benachrichtigen
      workerNotifications.notifyAssignmentPendingConfirmation(
        pool, parsed.data.worker_user_id, result.link.id, parsed.data.client_name || null
      ).catch(err => logger.error("Notification error (assign-capacity):", err));

      res.locals.audit = {
        action: "capacity.assigned_to_worker", entity_type: "worker_assignment_link",
        entity_id: result.link.id,
        details: { capacity_post_id: parsed.data.capacity_post_id, worker_user_id: parsed.data.worker_user_id }
      };
      res.status(201).json(result);
    } catch (err) { next(err); }
  });

  /* ── Deal-basierte Einsätze → Worker-Zuweisung ────────────────────────────── */

  router.get("/open-deal-assignments", ...base, requireScope("read:workers"), rperm("worker.edit"), async (req, res, next) => {
    try {
      const items = await workerService.getOpenDealAssignments(pool, req.orgId);
      res.json({ items, total: items.length });
    } catch (err) { next(err); }
  });

  // Welle 7 – Phase 3+4: Abgeschlossene Deals hart verfuegbar.
  // Zeigt Agency-seitig Deals/Einsaetze, die aktiviert+vollbesetzt, planmaessig
  // abgeschlossen oder storniert sind. worker.view reicht – die Liste ist eine
  // Sichtflaeche fuer Nachbearbeitung, keine Staffing-Mutation.
  router.get("/closed-deal-assignments", ...base, requireScope("read:workers"), rperm("worker.view"), async (req, res, next) => {
    try {
      const limitRaw = parseInt(req.query.limit, 10);
      const items = await workerService.getClosedDealAssignments(pool, req.orgId, {
        limit: Number.isFinite(limitRaw) ? limitRaw : 100
      });
      res.json({ items, total: items.length });
    } catch (err) { next(err); }
  });

  router.get("/staffing-assignments/:id", ...base, requireScope("read:workers"), rperm("worker.edit"), async (req, res, next) => {
    try {
      const detail = await assignmentStaffingService.getAssignmentStaffingOverview(pool, req.params.id, req.orgId);
      if (!detail) return res.status(404).json({ error: "NOT_FOUND" });
      res.json(detail);
    } catch (err) { next(err); }
  });

  router.get("/staffing-assignments/:id/suggestions", ...base, requireScope("read:workers"), rperm("worker.edit"), async (req, res, next) => {
    try {
      const limitRaw = parseInt(req.query.limit, 10);
      const result = await assignmentStaffingService.listAssignmentSuggestions(pool, req.params.id, req.orgId, {
        limit: Number.isFinite(limitRaw) ? limitRaw : 20,
        onlyAvailable: req.query.only_available === "true",
        hardOnly: req.query.hard_only === "true",
        includeBlocked: req.query.include_blocked !== "false",
        workerUserId: req.query.worker_user_id || null,
        requiredSkill: req.query.required_skill || null,
        requiredQualification: req.query.required_qualification || null
      });
      if (!result) return res.status(404).json({ error: "NOT_FOUND" });
      res.json(result);
    } catch (err) { next(err); }
  });

  router.post("/staffing-assignments/:id/quick-assign", ...base, requireScope("write:workers"), rperm("worker.edit"), async (req, res, next) => {
    try {
      const parsed = staffingQuickAssignSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const result = await dealStaffingFastTrackService.quickAssignSuggestedWorkers(pool, {
        assignmentId: req.params.id,
        supplierOrgId: req.orgId,
        actorId: req.session.userId,
        workerUserIds: parsed.data.worker_user_ids,
        clientName: parsed.data.client_name,
        notes: parsed.data.notes
      });
      if (result?.error) {
        const statusMap = {
          ASSIGNMENT_NOT_FOUND: 404,
          ASSIGNMENT_NOT_ASSIGNABLE: 409,
          ASSIGNMENT_FILLED: 409,
          NO_WORKERS_SELECTED: 400
        };
        return res.status(statusMap[result.error] || 400).json(result);
      }

      for (const assigned of result.assigned_links || []) {
        workerNotifications.notifyAssignmentPendingConfirmation(
          pool,
          assigned.worker_user_id,
          assigned.link_id,
          parsed.data.client_name || null
        ).catch(err => logger.error("Notification error (staffing-quick-assign):", err));
      }

      res.locals.audit = {
        action: "assignment.staffing_quick_assign.executed",
        entity_type: "assignment",
        entity_id: req.params.id,
        details: {
          requested_count: result.summary?.requested_count || 0,
          assigned_count: result.summary?.assigned_count || 0,
          skipped_count: result.summary?.skipped_count || 0
        }
      };
      res.json(result);
    } catch (err) { next(err); }
  });

  router.post("/staffing-assignments/:id/campaigns", ...base, requireScope("write:workers"), rperm("worker.edit"), async (req, res, next) => {
    try {
      const parsed = staffingCampaignSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const result = await assignmentStaffingService.createStaffingCampaign(pool, {
        assignmentId: req.params.id,
        supplierOrgId: req.orgId,
        actorId: req.session.userId,
        workerUserIds: parsed.data.worker_user_ids,
        message: parsed.data.message,
        name: parsed.data.name,
        expiresAt: parsed.data.expires_at,
        promotionMode: parsed.data.promotion_mode,
        reservationWindowMinutes: parsed.data.reservation_window_minutes,
        autoBackfillEnabled: parsed.data.auto_backfill_enabled
      });
      if (result.error) {
        const statusMap = {
          ASSIGNMENT_NOT_FOUND: 404,
          ASSIGNMENT_NOT_ASSIGNABLE: 409,
          ASSIGNMENT_FILLED: 409,
          NO_WORKERS_SELECTED: 400,
          NO_ELIGIBLE_WORKERS: 409,
          INVALID_EXPIRES_AT: 400
        };
        return res.status(statusMap[result.error] || 400).json(result);
      }

      res.locals.audit = {
        action: "assignment.staffing_campaign.created",
        entity_type: "assignment_staffing_campaign",
        entity_id: result.campaign?.id,
        details: {
          assignment_id: req.params.id,
          invite_count: result.invites?.length || 0,
          auto_backfill_enabled: !!result.campaign?.auto_backfill_enabled
        }
      };
      res.status(201).json(result);
    } catch (err) { next(err); }
  });

  router.post("/staffing-assignments/:id/waitlist", ...base, requireScope("write:workers"), rperm("worker.edit"), async (req, res, next) => {
    try {
      const parsed = staffingWaitlistSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const result = await assignmentStaffingService.queueAssignmentWaitlistWorkers(pool, {
        assignmentId: req.params.id,
        supplierOrgId: req.orgId,
        actorId: req.session.userId,
        workerUserIds: parsed.data.worker_user_ids
      });
      if (result.error) {
        const statusMap = {
          ASSIGNMENT_NOT_FOUND: 404,
          ASSIGNMENT_NOT_ASSIGNABLE: 409,
          NO_WORKERS_SELECTED: 400,
          NO_ELIGIBLE_WORKERS: 409
        };
        return res.status(statusMap[result.error] || 400).json(result);
      }

      res.locals.audit = {
        action: "assignment.staffing_waitlist.queued",
        entity_type: "assignment_staffing_waitlist",
        entity_id: req.params.id,
        details: {
          assignment_id: req.params.id,
          queued_count: result.waitlist?.length || 0
        }
      };
      res.status(201).json(result);
    } catch (err) { next(err); }
  });

  router.post("/staffing-assignments/:id/waitlist/next-wave", ...base, requireScope("write:workers"), rperm("worker.edit"), async (req, res, next) => {
    try {
      const parsed = staffingWaitlistWaveSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const result = await assignmentStaffingService.sendStaffingWaitlistWave(pool, {
        assignmentId: req.params.id,
        supplierOrgId: req.orgId,
        actorId: req.session.userId,
        limit: parsed.data.limit,
        autoBackfillEnabled: parsed.data.auto_backfill_enabled
      });
      if (result.error) {
        const statusMap = {
          ASSIGNMENT_NOT_FOUND: 404,
          ASSIGNMENT_NOT_ASSIGNABLE: 409,
          ASSIGNMENT_FILLED: 409,
          NO_WAITLIST_CANDIDATES: 409,
          NO_ELIGIBLE_WORKERS: 409,
          INVALID_EXPIRES_AT: 400
        };
        return res.status(statusMap[result.error] || 400).json(result);
      }

      res.locals.audit = {
        action: "assignment.staffing_waitlist.wave_sent",
        entity_type: "assignment_staffing_campaign",
        entity_id: result.campaign?.id || null,
        details: {
          assignment_id: req.params.id,
          invite_count: result.invites?.length || 0,
          removed_count: result.removed_count || 0
        }
      };
      res.status(201).json(result);
    } catch (err) { next(err); }
  });

  router.post("/staffing-choice-sets", ...base, requireScope("write:workers"), rperm("worker.edit"), async (req, res, next) => {
    try {
      const parsed = staffingChoiceSetCreateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const result = await assignmentStaffingService.createStaffingChoiceSet(pool, {
        workerUserId: parsed.data.worker_user_id,
        supplierOrgId: req.orgId,
        actorId: req.session.userId,
        assignmentIds: parsed.data.assignment_ids,
        choiceMode: parsed.data.choice_mode,
        title: parsed.data.title,
        message: parsed.data.message,
        responseDeadlineAt: parsed.data.response_deadline_at
      });
      if (result?.error) {
        const statusMap = {
          WORKER_NOT_FOUND: 404,
          WORKER_INACTIVE: 409,
          INSUFFICIENT_OPTIONS: 400,
          INVALID_CHOICE_MODE: 400,
          INVALID_RESPONSE_DEADLINE: 400,
          ASSIGNMENT_NOT_FOUND: 404,
          ASSIGNMENT_NOT_ASSIGNABLE: 409,
          ASSIGNMENT_FILLED: 409,
          NO_ELIGIBLE_WORKERS: 409,
          CHOICE_SET_OPTION_ALREADY_ACTIVE: 409,
          INVITE_CREATION_FAILED: 500
        };
        return res.status(statusMap[result.error] || 400).json(result);
      }

      res.locals.audit = {
        action: "assignment.staffing_choice_set.created",
        entity_type: "assignment_staffing_choice_set",
        entity_id: result.id,
        details: {
          worker_user_id: parsed.data.worker_user_id,
          assignment_ids: parsed.data.assignment_ids,
          choice_mode: parsed.data.choice_mode
        }
      };
      res.status(201).json(result);
    } catch (err) { next(err); }
  });

  router.post("/staffing-choice-sets/:id/assign", ...base, requireScope("write:workers"), rperm("worker.edit"), async (req, res, next) => {
    try {
      const parsed = staffingChoiceSetAssignSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const choiceSet = await assignmentStaffingService.getStaffingChoiceSet(pool, req.params.id, {
        supplierOrgId: req.orgId
      });
      if (!choiceSet) return res.status(404).json({ error: "CHOICE_SET_NOT_FOUND" });
      if (choiceSet.status === "assigned") return res.status(409).json({ error: "CHOICE_SET_ALREADY_ASSIGNED" });
      if (choiceSet.status === "declined") return res.status(409).json({ error: "CHOICE_SET_ALREADY_DECLINED" });
      if (choiceSet.status === "expired") return res.status(409).json({ error: "CHOICE_SET_EXPIRED" });
      if (choiceSet.status === "cancelled") return res.status(409).json({ error: "CHOICE_SET_CANCELLED" });

      const option = (choiceSet.options || []).find((entry) => entry.id === parsed.data.choice_option_id);
      if (!option) return res.status(404).json({ error: "CHOICE_OPTION_NOT_FOUND" });

      let result;
      if (option.reservation_id && option.reservation_status === "reserved") {
        result = await assignmentStaffingService.promoteReservation(pool, option.reservation_id, {
          actorId: req.session.userId,
          supplierOrgId: req.orgId,
          note: parsed.data.notes
        });
      } else {
        result = await workerService.assignDealToWorker(pool, {
          assignmentId: option.assignment_id,
          workerUserId: choiceSet.worker_user_id,
          supplierOrgId: req.orgId,
          clientName: parsed.data.client_name || option.request_context?.client_org_name || null,
          notes: parsed.data.notes,
          createdBy: req.session.userId
        });
      }

      if (result?.error) {
        const statusMap = {
          RESERVATION_NOT_FOUND: 404,
          ASSIGNMENT_NOT_FOUND: 404,
          ASSIGNMENT_NOT_ASSIGNABLE: 409,
          RESERVATION_NOT_ACTIVE: 409,
          RESERVATION_EXPIRED: 409,
          ASSIGNMENT_FILLED: 409,
          ALREADY_ASSIGNED: 409,
          WORKER_ALREADY_LINKED: 409,
          WORKER_NOT_FOUND: 404,
          WORKER_INACTIVE: 409,
          SCHEDULE_CONFLICT: 409
        };
        return res.status(statusMap[result.error] || 400).json(result);
      }

      const updatedChoiceSet = await assignmentStaffingService.getStaffingChoiceSet(pool, req.params.id, {
        supplierOrgId: req.orgId
      });

      if (result.link?.id && result.link.worker_confirmation_status === "pending_confirmation") {
        workerNotifications.notifyAssignmentPendingConfirmation(
          pool,
          choiceSet.worker_user_id,
          result.link.id,
          parsed.data.client_name || option.request_context?.client_org_name || null
        ).catch(err => logger.error("Notification error (staffing-choice-set assign):", err));
      }

      res.locals.audit = {
        action: "assignment.staffing_choice_set.assigned",
        entity_type: "assignment_staffing_choice_set",
        entity_id: req.params.id,
        details: {
          choice_option_id: parsed.data.choice_option_id,
          assignment_id: option.assignment_id,
          link_id: result.link?.id || null
        }
      };
      res.json({
        ...result,
        choice_set: updatedChoiceSet
      });
    } catch (err) { next(err); }
  });

  router.post("/staffing-reservations/:id/finalize", ...base, requireScope("write:workers"), rperm("worker.edit"), async (req, res, next) => {
    try {
      const parsed = staffingReservationFinalizeSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const result = await assignmentStaffingService.promoteReservation(pool, req.params.id, {
        actorId: req.session.userId,
        supplierOrgId: req.orgId,
        note: parsed.data.note
      });
      if (result.error) {
        const statusMap = {
          RESERVATION_NOT_FOUND: 404,
          ASSIGNMENT_NOT_FOUND: 404,
          ASSIGNMENT_NOT_ASSIGNABLE: 409,
          RESERVATION_NOT_ACTIVE: 409,
          RESERVATION_EXPIRED: 409,
          SCHEDULE_CONFLICT: 409,
          WORKER_ALREADY_LINKED: 409
        };
        return res.status(statusMap[result.error] || 400).json(result);
      }

      res.locals.audit = {
        action: "assignment.staffing_reservation.finalized",
        entity_type: "assignment_staffing_reservation",
        entity_id: req.params.id,
        details: { assignment_id: result.assignment?.id, link_id: result.link?.id || null }
      };
      res.json(result);
    } catch (err) { next(err); }
  });

  const assignDealSchema = z.object({
    assignment_id:          z.string().uuid(),
    worker_user_id:         z.string().uuid(),
    start_date:             z.string().regex(dateRx).optional().nullable(),
    end_date:               z.string().regex(dateRx).optional().nullable(),
    default_hours_per_day:  z.number().min(0).max(24).default(8),
    default_shift_start:    z.string().regex(timeRx).optional().nullable(),
    default_shift_end:      z.string().regex(timeRx).optional().nullable(),
    default_break_minutes:  z.number().int().min(0).max(120).default(30),
    client_name:            z.string().max(200).optional().nullable(),
    notes:                  z.string().max(2000).optional().nullable()
  });

  router.post("/assign-deal-to-worker", ...base, requireScope("write:workers"), rperm("worker.edit"), async (req, res, next) => {
    try {
      const parsed = assignDealSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const result = await workerService.assignDealToWorker(pool, {
        assignmentId:        parsed.data.assignment_id,
        workerUserId:        parsed.data.worker_user_id,
        supplierOrgId:       req.orgId,
        startDate:           parsed.data.start_date,
        endDate:             parsed.data.end_date,
        defaultHoursPerDay:  parsed.data.default_hours_per_day,
        defaultShiftStart:   parsed.data.default_shift_start,
        defaultShiftEnd:     parsed.data.default_shift_end,
        defaultBreakMinutes: parsed.data.default_break_minutes,
        clientName:          parsed.data.client_name,
        notes:               parsed.data.notes,
        createdBy:           req.session.userId
      });
      if (result.error) {
        const statusMap = {
          ASSIGNMENT_NOT_FOUND: 404,
          ASSIGNMENT_NOT_ASSIGNABLE: 409,
          ASSIGNMENT_FILLED: 409,
          ALREADY_ASSIGNED: 409,
          WORKER_ALREADY_LINKED: 409,
          WORKER_NOT_FOUND: 404, WORKER_INACTIVE: 409,
          SCHEDULE_CONFLICT: 409
        };
        return res.status(statusMap[result.error] || 400).json(result);
      }

      // Fire-and-forget notification
      workerNotifications.notifyAssignmentPendingConfirmation(
        pool, parsed.data.worker_user_id, result.link.id, parsed.data.client_name || null
      ).catch(err => logger.error("Notification error (assign-deal):", err));

      res.locals.audit = {
        action: "deal.assigned_to_worker", entity_type: "worker_assignment_link",
        entity_id: result.link.id,
        details: { assignment_id: parsed.data.assignment_id, worker_user_id: parsed.data.worker_user_id }
      };
      res.status(201).json(result);
    } catch (err) { next(err); }
  });

  /* ── Billing / Dashboard ─────────────────────────────────────────────────── */

  router.get("/worker-billing/dashboard", ...base, requireScope("read:workers"), rperm("worker.view"), async (req, res, next) => {
    try {
      const metrics = await billingMetrics.getDashboardMetrics(pool, req.orgId);
      res.json(metrics);
    } catch (err) { next(err); }
  });

  router.get("/worker-billing/snapshots", ...base, requireScope("read:workers"), rperm("org.billing"), async (req, res, next) => {
    try {
      const snapshots = await billingMetrics.getMonthlySnapshots(pool, req.orgId, parseInt(req.query.months, 10) || 12);
      res.json({ items: snapshots });
    } catch (err) { next(err); }
  });

  return router;
}
