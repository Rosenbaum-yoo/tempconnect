/**
 * Worker Portal Router — Worker Self-Service
 * Ausschließlich für Nutzer mit role = 'worker'.
 * Kein Feature-Gate nötig — jeder Worker der eingeladen wurde, hat Zugang.
 */
import { z } from "zod";
import { Router } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import * as assignmentStaffingService from "../services/assignmentStaffingService.js";
import * as workerService from "../services/workerService.js";
import * as submissionSvc from "../services/workerSubmissionService.js";
import * as workerNotifications from "../services/workerNotificationService.js";
import * as availabilitySvc from "../services/workerAvailabilityService.js";
import { swallow } from "../utils/logger.js";

/* ── Schemas ─────────────────────────────────────────────────────────────────── */

const dateRx = /^\d{4}-\d{2}-\d{2}$/;
const timeRx = /^\d{2}:\d{2}$/;
const uuidRx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const workerDocumentCategorySchema = z.enum(workerService.WORKER_DOCUMENT_CATEGORIES);

// EP-03 Security Hardening (2026-05-29):
// org_id / supplier_org_id / assignment_id are NEVER accepted from the client.
// They are derived server-side from the worker_assignment_link_id (owned by this worker).
// This closes the cross-org injection vector (B-02 from EP-BASELINE).
const createSubmissionSchema = z.object({
  worker_assignment_link_id: z.string().uuid(),         // required — no link, no submission
  week_start:                z.string().regex(dateRx),
  week_end:                  z.string().regex(dateRx),
  worker_comment:            z.string().max(4000).optional().nullable()
});

const entrySchema = z.object({
  work_date:      z.string().regex(dateRx),
  hours_regular:  z.number().min(0).max(24).default(0),
  hours_overtime: z.number().min(0).max(24).default(0),
  break_minutes:  z.number().int().min(0).default(0),
  shift_start:    z.string().regex(timeRx).optional().nullable(),
  shift_end:      z.string().regex(timeRx).optional().nullable(),
  notes:          z.string().max(2000).optional().nullable()
});

const updateProfileSchema = z.object({
  phone:           z.string().max(50).optional().nullable(),
  street:          z.string().max(200).optional().nullable(),
  postal_code:     z.string().max(20).optional().nullable(),
  city:            z.string().max(100).optional().nullable(),
  preferred_locale: z.string().max(5).optional()
});

/* Verfuegbarkeit (Welle 2).
 *
 * Alle drei Felder sind optional UND null-bar — und das ist keine Nachlaessigkeit:
 *   Feld weggelassen -> unveraendert
 *   Feld = null      -> Angabe loeschen und bewusst wieder herleiten lassen
 * Ohne diese Unterscheidung koennte man eine einmal gesetzte Angabe nie zurueknehmen.
 * Die Grenzen spiegeln die CHECK-Constraints aus Migration 157 — was die Datenbank
 * ablehnt, soll gar nicht erst bis dorthin kommen.
 */
const availabilitySchema = z.object({
  available_from:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als YYYY-MM-DD").nullable().optional(),
  weekly_hours:     z.number().positive().max(80).nullable().optional(),
  travel_radius_km: z.number().int().min(1).max(500).nullable().optional()
}).strict();

const putSkillsSchema = z.object({
  skills: z.array(z.object({
    skill_id:         z.string().uuid(),
    proficiency:      z.enum(["beginner", "intermediate", "advanced", "expert"]).optional(),
    years_experience: z.number().min(0).max(60).optional().nullable(),
    is_primary:       z.boolean().optional(),
    certified:        z.boolean().optional(),
    certificate_ref:  z.string().max(200).optional().nullable()
  })).max(200)
});

const staffingInviteRespondSchema = z.object({
  action: z.enum(["accept", "decline"]),
  note: z.string().max(2000).optional().nullable()
});
const staffingInviteQuestionSchema = z.object({
  question: z.string().trim().min(1).max(2000)
});
const staffingInviteReminderSchema = z.object({
  remind_after_minutes: z.coerce.number().int().min(15).max(10080).optional(),
  note: z.string().max(2000).optional().nullable()
});
const staffingChoiceRespondSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("submit_preferences"),
    primary_option_id: z.string().uuid().optional().nullable(),
    acceptable_option_ids: z.array(z.string().uuid()).max(20).optional(),
    note: z.string().max(2000).optional().nullable()
  }),
  z.object({
    action: z.literal("submit_ranking"),
    ranked_option_ids: z.array(z.string().uuid()).min(1).max(20),
    note: z.string().max(2000).optional().nullable()
  }),
  z.object({
    action: z.literal("select_option"),
    choice_option_id: z.string().uuid(),
    note: z.string().max(2000).optional().nullable()
  }),
  z.object({
    action: z.literal("decline_all"),
    note: z.string().max(2000).optional().nullable()
  })
]);

const workerDocumentCreateSchema = z.object({
  category: workerDocumentCategorySchema.default("qualification"),
  title: z.string().min(1).max(200),
  qualification_name: z.string().max(200).optional().nullable(),
  issuer: z.string().max(200).optional().nullable(),
  valid_from: z.string().regex(dateRx).optional().nullable(),
  valid_until: z.string().regex(dateRx).optional().nullable(),
  notes: z.string().max(2000).optional().nullable()
});

const workerDocumentAllowedMimes = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const workerDocumentAllowedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".pdf"]);
const workerDocumentMaxFileSize = 10 * 1024 * 1024;

function createWorkerDocumentUpload() {
  return multer({
    storage: multer.diskStorage({
      destination(req, _file, cb) {
        if (!uuidRx.test(String(req.session?.userId || ""))) {
          return cb(new Error("INVALID_WORKER_ID"));
        }
        const dir = path.join(process.cwd(), "uploads", "worker-documents", req.session.userId);
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

/* ── Worker-only Auth-Middleware ─────────────────────────────────────────────── */

function requireWorkerRole(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: "NOT_AUTHENTICATED" });
  // req.session.userRole is set at login / accept-invite
  if (req.session.userRole !== "worker") {
    return res.status(403).json({ error: "WORKER_ROLE_REQUIRED" });
  }
  next();
}

/* ── Router ──────────────────────────────────────────────────────────────────── */

export function createWorkerPortalRouter(deps) {
  const { pool, requireAuth } = deps;
  const router = Router();
  const base = [requireAuth, requireWorkerRole];
  const workerDocumentUpload = createWorkerDocumentUpload();
  const portalizeDocument = (document) => document ? {
    ...document,
    download_path: document.id ? `/api/worker/documents/${document.id}/download` : null
  } : null;

  /* ── Eigenes Profil abrufen ──────────────────────────────────────────────── */

  router.get("/worker/me", ...base, async (req, res, next) => {
    try {
      const profile = await workerService.getWorkerProfile(pool, req.session.userId);
      if (!profile) return res.status(404).json({ error: "PROFILE_NOT_FOUND" });
      res.json(profile);
    } catch (err) { next(err); }
  });

  /* ── Eigenes Profil aktualisieren (eingeschränkte Felder) ──────────────────── */

  router.patch("/worker/me", ...base, async (req, res, next) => {
    try {
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      // Fetch profile to get supplier_org_id for the org-scoped update
      const profile = await workerService.getWorkerProfile(pool, req.session.userId);
      if (!profile) return res.status(404).json({ error: "PROFILE_NOT_FOUND" });
      const result = await workerService.updateWorkerProfile(
        pool, req.session.userId, profile.supplier_org_id, parsed.data
      );
      res.locals.audit = { action: "worker.update_profile", entity_type: "worker_profile", entity_id: req.session.userId, details: { changed_fields: Object.keys(parsed.data) } };
      res.json(result);
    } catch (err) { next(err); }
  });

  /* ── Eigene Fähigkeiten abrufen / setzen (Katalog-gebunden, Welle 1) ───────── */

  router.get("/worker/me/skills", ...base, async (req, res, next) => {
    try {
      const profile = await workerService.getWorkerProfile(pool, req.session.userId);
      if (!profile) return res.status(404).json({ error: "PROFILE_NOT_FOUND" });
      const items = await workerService.getWorkerSkills(pool, profile.id);
      res.json({ items, count: items.length });
    } catch (err) { next(err); }
  });

  router.put("/worker/me/skills", ...base, async (req, res, next) => {
    try {
      const parsed = putSkillsSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const profile = await workerService.getWorkerProfile(pool, req.session.userId);
      if (!profile) return res.status(404).json({ error: "PROFILE_NOT_FOUND" });
      const result = await workerService.setWorkerSkills(pool, {
        workerProfileId: profile.id,
        supplierOrgId: profile.supplier_org_id,
        skills: parsed.data.skills,
        source: "worker"
      });
      res.locals.audit = {
        action: "worker.update_skills",
        entity_type: "worker_profile",
        entity_id: req.session.userId,
        details: { skill_count: result.count }
      };
      res.json({ ok: true, count: result.count, skill_ids: result.skill_ids });
    } catch (err) { next(err); }
  });

  /* ── Verfuegbarkeit abrufen / setzen (Welle 2) ─────────────────────────────
   *
   * Die Antwort enthaelt zu jedem Wert seine HERKUNFT und die Liste der Fragen, die
   * offen bleiben. Damit zeigt der Aufnahme-Assistent "abgeleitet aus dem Einsatz bis
   * 15.09." statt eines leeren Feldes — und fragt nur das, was das System nicht wissen
   * kann. Fuer eine Bestandskraft ist `offene_fragen` in der Regel leer.
   */
  router.get("/worker/me/availability", ...base, async (req, res, next) => {
    try {
      const profile = await workerService.getWorkerProfile(pool, req.session.userId);
      if (!profile) return res.status(404).json({ error: "PROFILE_NOT_FOUND" });
      const out = await availabilitySvc.resolveAvailability(pool, profile.id);
      if (!out) return res.status(404).json({ error: "PROFILE_NOT_FOUND" });
      res.json(out);
    } catch (err) { next(err); }
  });

  router.patch("/worker/me/availability", ...base, async (req, res, next) => {
    try {
      const parsed = availabilitySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const profile = await workerService.getWorkerProfile(pool, req.session.userId);
      if (!profile) return res.status(404).json({ error: "PROFILE_NOT_FOUND" });

      const result = await availabilitySvc.setAvailability(
        pool, profile.id, parsed.data, profile.supplier_org_id
      );
      if (result.error) return res.status(404).json(result);

      res.locals.audit = {
        action: "worker.update_availability",
        entity_type: "worker_profile",
        entity_id: profile.id,
        details: { felder: Object.keys(parsed.data) }
      };
      // Die aufgeloeste Sicht zurueckgeben, nicht die Rohwerte: der Aufrufer will wissen,
      // was jetzt gilt — inklusive dessen, was nach dem Loeschen wieder hergeleitet wird.
      res.json(await availabilitySvc.resolveAvailability(pool, profile.id));
    } catch (err) { next(err); }
  });

  router.get("/worker/documents", ...base, async (req, res, next) => {
    try {
      const profile = await workerService.getWorkerProfile(pool, req.session.userId);
      if (!profile) return res.status(404).json({ error: "PROFILE_NOT_FOUND" });
      const result = await workerService.listWorkerDocuments(pool, {
        workerUserId: req.session.userId,
        supplierOrgId: profile.supplier_org_id,
        limit: parseInt(req.query.limit, 10) || 25,
        includeArchived: req.query.include_archived === "true"
      });
      res.json({
        items: result.items.map(portalizeDocument),
        summary: result.summary
      });
    } catch (err) { next(err); }
  });

  router.post("/worker/documents", ...base, (req, res, next) => {
    workerDocumentUpload.single("file")(req, res, (err) => {
      if (!err) return next();
      if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "FILE_TOO_LARGE" });
      if (err.code === "INVALID_MIME") return res.status(400).json({ error: "INVALID_MIME", message: err.message });
      if (err.message === "INVALID_WORKER_ID") return res.status(400).json({ error: "INVALID_WORKER_ID" });
      return res.status(400).json({ error: "UPLOAD_ERROR", message: err.message || "Upload fehlgeschlagen" });
    });
  }, async (req, res, next) => {
    try {
      const profile = await workerService.getWorkerProfile(pool, req.session.userId);
      if (!profile) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: "PROFILE_NOT_FOUND" });
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
      if (!req.file) return res.status(400).json({ error: "FILE_REQUIRED" });

      const document = await workerService.createWorkerDocument(pool, {
        workerUserId: req.session.userId,
        supplierOrgId: profile.supplier_org_id,
        category: parsed.data.category,
        title: parsed.data.title,
        qualificationName: parsed.data.qualification_name,
        issuer: parsed.data.issuer,
        fileRef: "/uploads/worker-documents/" + req.session.userId + "/" + req.file.filename,
        originalName: req.file.originalname || null,
        mimeType: req.file.mimetype || null,
        fileSizeBytes: req.file.size || null,
        validFrom: parsed.data.valid_from,
        validUntil: parsed.data.valid_until,
        notes: parsed.data.notes,
        uploadedBy: req.session.userId
      });
      res.locals.audit = {
        action: "worker.document_self_upload",
        entity_type: "worker_profile_document",
        entity_id: document.id,
        details: { category: document.category }
      };
      res.status(201).json(portalizeDocument(document));
    } catch (err) {
      if (req.file) fs.unlink(req.file.path, () => {});
      next(err);
    }
  });

  router.get("/worker/documents/:documentId/download", ...base, async (req, res, next) => {
    try {
      const profile = await workerService.getWorkerProfile(pool, req.session.userId);
      if (!profile) return res.status(404).json({ error: "PROFILE_NOT_FOUND" });
      const document = await workerService.getWorkerDocumentById(pool, req.params.documentId);
      if (!document || document.worker_user_id !== req.session.userId || document.supplier_org_id !== profile.supplier_org_id) {
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

  router.delete("/worker/documents/:documentId", ...base, async (req, res, next) => {
    try {
      const profile = await workerService.getWorkerProfile(pool, req.session.userId);
      if (!profile) return res.status(404).json({ error: "PROFILE_NOT_FOUND" });
      const existing = await workerService.getWorkerDocumentById(pool, req.params.documentId);
      if (!existing || existing.worker_user_id !== req.session.userId || existing.supplier_org_id !== profile.supplier_org_id) {
        return res.status(404).json({ error: "NOT_FOUND" });
      }
      if (existing.status === "verified") {
        return res.status(409).json({ error: "VERIFIED_DOCUMENT_LOCKED" });
      }
      const document = await workerService.deleteWorkerDocument(pool, req.params.documentId, req.session.userId, profile.supplier_org_id);
      if (!document) return res.status(404).json({ error: "NOT_FOUND" });
      if (document.file_ref) {
        const filePath = path.join(process.cwd(), document.file_ref.replace(/^\//, ""));
        fs.unlink(filePath, () => {});
      }
      res.locals.audit = {
        action: "worker.document_self_delete",
        entity_type: "worker_profile_document",
        entity_id: req.params.documentId
      };
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  /* ── Eigene Assignments abrufen ──────────────────────────────────────────── */

  router.get("/worker/assignments", ...base, async (req, res, next) => {
    try {
      const links = await workerService.getWorkerAssignments(pool, req.session.userId, {
        includeInactive: req.query.include_inactive === "true"
      });
      res.json({ items: links, total: links.length });
    } catch (err) { next(err); }
  });

  router.get("/worker/staffing-requests", ...base, async (req, res, next) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 25, 50);
      const items = await assignmentStaffingService.listWorkerStaffingRequests(pool, req.session.userId, {
        limit,
        markViewed: req.query.mark_viewed === "true"
      });
      res.json({ items, total: items.length });
    } catch (err) { next(err); }
  });

  router.get("/worker/staffing-choice-sets", ...base, async (req, res, next) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 10, 25);
      const items = await assignmentStaffingService.listWorkerStaffingChoiceSets(pool, req.session.userId, {
        limit,
        markViewed: req.query.mark_viewed === "true"
      });
      res.json({ items, total: items.length });
    } catch (err) { next(err); }
  });

  router.post("/worker/staffing-requests/:id/respond", ...base, async (req, res, next) => {
    try {
      const parsed = staffingInviteRespondSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const result = await assignmentStaffingService.respondToStaffingInvite(pool, {
        inviteId: req.params.id,
        workerUserId: req.session.userId,
        action: parsed.data.action,
        note: parsed.data.note
      });
      if (result.error) {
        const statusMap = {
          INVITE_NOT_FOUND: 404,
          ASSIGNMENT_NOT_FOUND: 404,
          INVITE_EXPIRED: 409,
          INVITE_NOT_ACTIONABLE: 409,
          INVITE_CONTROLLED_BY_CHOICE_SET: 409,
          ASSIGNMENT_FILLED: 409,
          SCHEDULE_CONFLICT: 409,
          RESERVATION_EXPIRED: 409,
          RESERVATION_NOT_ACTIVE: 409,
          WORKER_ALREADY_LINKED: 409
        };
        return res.status(statusMap[result.error] || 400).json(result);
      }

      res.locals.audit = {
        action: `worker.staffing_request.${parsed.data.action}`,
        entity_type: "assignment_staffing_invite",
        entity_id: req.params.id
      };
      res.json(result);
    } catch (err) { next(err); }
  });

  router.post("/worker/staffing-requests/:id/question", ...base, async (req, res, next) => {
    try {
      const parsed = staffingInviteQuestionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const result = await assignmentStaffingService.askStaffingInviteQuestion(pool, {
        inviteId: req.params.id,
        workerUserId: req.session.userId,
        question: parsed.data.question
      });
      if (result.error) {
        const statusMap = {
          QUESTION_REQUIRED: 400,
          INVITE_NOT_FOUND: 404,
          ASSIGNMENT_NOT_FOUND: 404,
          INVITE_EXPIRED: 409,
          INVITE_NOT_ACTIONABLE: 409
        };
        return res.status(statusMap[result.error] || 400).json(result);
      }

      res.locals.audit = {
        action: "worker.staffing_request.question",
        entity_type: "assignment_staffing_invite",
        entity_id: req.params.id
      };
      res.json(result);
    } catch (err) { next(err); }
  });

  router.post("/worker/staffing-requests/:id/remind", ...base, async (req, res, next) => {
    try {
      const parsed = staffingInviteReminderSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const result = await assignmentStaffingService.requestStaffingInviteReminder(pool, {
        inviteId: req.params.id,
        workerUserId: req.session.userId,
        remindAfterMinutes: parsed.data.remind_after_minutes,
        note: parsed.data.note
      });
      if (result.error) {
        const statusMap = {
          INVITE_NOT_FOUND: 404,
          ASSIGNMENT_NOT_FOUND: 404,
          INVITE_EXPIRED: 409,
          INVITE_NOT_ACTIONABLE: 409,
          INVITE_EXPIRES_TOO_SOON: 409
        };
        return res.status(statusMap[result.error] || 400).json(result);
      }

      res.locals.audit = {
        action: "worker.staffing_request.remind_later",
        entity_type: "assignment_staffing_invite",
        entity_id: req.params.id
      };
      res.json(result);
    } catch (err) { next(err); }
  });

  router.post("/worker/staffing-choice-sets/:id/respond", ...base, async (req, res, next) => {
    try {
      const parsed = staffingChoiceRespondSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      let result;
      if (parsed.data.action === "submit_preferences") {
        result = await assignmentStaffingService.submitStaffingChoicePreferences(pool, {
          choiceSetId: req.params.id,
          workerUserId: req.session.userId,
          primaryOptionId: parsed.data.primary_option_id || null,
          acceptableOptionIds: parsed.data.acceptable_option_ids || [],
          note: parsed.data.note
        });
      } else if (parsed.data.action === "submit_ranking") {
        result = await assignmentStaffingService.submitStaffingChoiceRanking(pool, {
          choiceSetId: req.params.id,
          workerUserId: req.session.userId,
          rankedOptionIds: parsed.data.ranked_option_ids,
          note: parsed.data.note
        });
      } else if (parsed.data.action === "select_option") {
        result = await assignmentStaffingService.selectStaffingChoiceOption(pool, {
          choiceSetId: req.params.id,
          workerUserId: req.session.userId,
          choiceOptionId: parsed.data.choice_option_id,
          note: parsed.data.note
        });
      } else {
        result = await assignmentStaffingService.declineStaffingChoiceSet(pool, {
          choiceSetId: req.params.id,
          workerUserId: req.session.userId,
          note: parsed.data.note
        });
      }

      if (result?.error) {
        const statusMap = {
          CHOICE_SET_NOT_FOUND: 404,
          CHOICE_OPTION_NOT_FOUND: 404,
          CHOICE_SET_MODE_MISMATCH: 409,
          CHOICE_SET_ALREADY_ASSIGNED: 409,
          CHOICE_SET_ALREADY_DECLINED: 409,
          CHOICE_SET_EXPIRED: 409,
          CHOICE_SET_CANCELLED: 409,
          CHOICE_SET_MANUAL_OVERRIDE: 409,
          CHOICE_SET_ALREADY_SELECTED: 409,
          CHOICE_OPTION_NOT_AVAILABLE: 409,
          INVITE_NOT_FOUND: 404,
          ASSIGNMENT_NOT_FOUND: 404,
          INVITE_EXPIRED: 409,
          INVITE_NOT_ACTIONABLE: 409,
          ASSIGNMENT_FILLED: 409,
          SCHEDULE_CONFLICT: 409,
          RESERVATION_EXPIRED: 409,
          RESERVATION_NOT_ACTIVE: 409,
          WORKER_ALREADY_LINKED: 409,
          NO_PREFERENCE_SELECTED: 400,
          NO_RANKING_SELECTED: 400
        };
        return res.status(statusMap[result.error] || 400).json(result);
      }

      res.locals.audit = {
        action: `worker.staffing_choice_set.${parsed.data.action}`,
        entity_type: "assignment_staffing_choice_set",
        entity_id: req.params.id
      };
      res.json(result);
    } catch (err) { next(err); }
  });

  /* ── Submission: Liste eigener Einreichungen ─────────────────────────────── */

  router.get("/worker/submissions", ...base, async (req, res, next) => {
    try {
      const items = await submissionSvc.listSubmissions(pool, {
        workerUserId: req.session.userId,
        status:       req.query.status        || null,
        assignmentId: req.query.assignment_id || null,
        weekStartFrom: req.query.week_from    || null,
        weekStartTo:   req.query.week_to      || null,
        limit:         parseInt(req.query.limit, 10) || 50
      });
      res.json({ items, total: items.length });
    } catch (err) { next(err); }
  });

  /* ── Submission: Einzelne Einreichung mit Einträgen ──────────────────────── */

  router.get("/worker/submissions/:id", ...base, async (req, res, next) => {
    try {
      const sub = await submissionSvc.getSubmissionWithEntries(pool, req.params.id);
      if (!sub) return res.status(404).json({ error: "NOT_FOUND" });
      if (sub.worker_user_id !== req.session.userId) return res.status(403).json({ error: "FORBIDDEN" });
      res.json(sub);
    } catch (err) { next(err); }
  });

  /* ── Submission erstellen ────────────────────────────────────────────────── */

  router.post("/worker/submissions", ...base, async (req, res, next) => {
    try {
      const parsed = createSubmissionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      // EP-03 Security: load the link from DB filtered by worker_user_id.
      // getWorkerAssignmentDetail returns null if the link does not belong to this worker.
      // org_id, supplier_org_id, assignment_id come exclusively from this trusted DB row —
      // never from the client body (closes cross-org injection vector B-02).
      const link = await workerService.getWorkerAssignmentDetail(
        pool, parsed.data.worker_assignment_link_id, req.session.userId
      );
      if (!link) return res.status(403).json({ error: "ASSIGNMENT_LINK_FORBIDDEN" });

      const result = await submissionSvc.createSubmission(pool, {
        workerUserId:           req.session.userId,
        workerAssignmentLinkId: link.id,
        orgId:                  link.org_id,          // from DB — never from client body
        supplierOrgId:          link.supplier_org_id, // from DB — never from client body
        assignmentId:           link.assignment_id,   // from DB — never from client body
        weekStart:              parsed.data.week_start,
        weekEnd:                parsed.data.week_end,
        workerComment:          parsed.data.worker_comment
      });

      if (result.error) {
        const status = result.error === "DUPLICATE_WEEK"    ? 409
                     : result.error === "INVALID_DATE_RANGE" || result.error === "INVALID_WEEK_RANGE" ? 400 : 500;
        return res.status(status).json({ error: result.error });
      }
      res.locals.audit = { action: "worker_submission.create", entity_type: "worker_submission", entity_id: result.submission.id, details: { week_start: parsed.data.week_start, assignment_id: link.assignment_id || null } };
      res.status(201).json(result.submission);
    } catch (err) { next(err); }
  });

  /* ── Tageseintrag hinzufügen / überschreiben ────────────────────────── */

  router.put("/worker/submissions/:id/entries", ...base, async (req, res, next) => {
    try {
      const parsed = entrySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const result = await submissionSvc.upsertEntry(pool, req.params.id, req.session.userId, parsed.data);
      if (result.error) {
        const status = result.error === "NOT_FOUND"               ? 404
                     : result.error === "FORBIDDEN"               ? 403
                     : result.error === "SUBMISSION_NOT_EDITABLE" ? 409 : 400;
        return res.status(status).json({ error: result.error, details: result });
      }
      res.locals.audit = { action: "worker_submission.upsert_entry", entity_type: "worker_submission_entry", entity_id: result.entry.id, details: { submission_id: req.params.id, work_date: parsed.data.work_date } };
      res.json(result.entry);
    } catch (err) { next(err); }
  });

  /* ── Tageseintrag löschen ───────────────────────────────────────────── */

  router.delete("/worker/submissions/:id/entries/:entryId", ...base, async (req, res, next) => {
    try {
      const result = await submissionSvc.deleteEntry(
        pool, req.params.id, req.params.entryId, req.session.userId
      );
      if (result.error) {
        const status = result.error === "NOT_FOUND"               ? 404
                     : result.error === "FORBIDDEN"               ? 403
                     : result.error === "SUBMISSION_NOT_EDITABLE" ? 409 : 400;
        return res.status(status).json({ error: result.error });
      }
      res.locals.audit = { action: "worker_submission.delete_entry", entity_type: "worker_submission_entry", entity_id: req.params.entryId, details: { submission_id: req.params.id } };
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  /* ── Submission einreichen ──────────────────────────────────────────── */

  router.post("/worker/submissions/:id/submit", ...base, async (req, res, next) => {
    try {
      const result = await submissionSvc.submitSubmission(pool, req.params.id, req.session.userId);
      if (result.error) {
        const status = result.error === "NOT_FOUND"           ? 404
                     : result.error === "FORBIDDEN"           ? 403
                     : result.error === "INCOMPLETE_WEEK"     ? 422
                     : result.error === "INVALID_TRANSITION"  ? 409 : 400;
        return res.status(status).json({ error: result.error, completion: result.completion || null });
      }
      res.locals.audit = { action: "worker_submission.submit", entity_type: "worker_submission", entity_id: req.params.id };
      res.json(result);
    } catch (err) { next(err); }
  });

  /* ── Korrektur einreichen (nach needs_correction) ───────────────── */

  router.post("/worker/submissions/:id/correct", ...base, async (req, res, next) => {
    try {
      // Ziel 4: Korrekturdetektion — prüft serverseitig ob echte Änderungen vorliegen
      const result = await submissionSvc.submitCorrected(pool, req.params.id, req.session.userId);
      if (result.error) {
        const status = result.error === "NOT_FOUND"              ? 404
                     : result.error === "FORBIDDEN"              ? 403
                     : result.error === "INCOMPLETE_WEEK"        ? 422
                     : result.error === "NO_CHANGES_DETECTED"    ? 409
                     : result.error === "INVALID_TRANSITION"     ? 409 : 400;
        return res.status(status).json({ error: result.error, message: result.message || null, completion: result.completion || null });
      }
      res.locals.audit = { action: "worker_submission.correct", entity_type: "worker_submission", entity_id: req.params.id };
      res.json(result);
    } catch (err) { next(err); }
  });

  /* ── Worker-Kommentar hinzufügen ────────────────────────────────────── */

  router.post("/worker/submissions/:id/comment", ...base, async (req, res, next) => {
    try {
      const sub = await submissionSvc.getSubmission(pool, req.params.id);
      if (!sub) return res.status(404).json({ error: "NOT_FOUND" });
      if (sub.worker_user_id !== req.session.userId) return res.status(403).json({ error: "FORBIDDEN" });
      const note = String(req.body?.note || "").trim();
      if (!note) return res.status(400).json({ error: "NOTE_REQUIRED" });
      // Nur Kommentar loggen (kein Reviewer-Kommentar überschreiben)
      const { rows } = await pool.query(
        `UPDATE worker_time_submissions SET worker_comment = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [note, req.params.id]
      );
      res.locals.audit = { action: "worker_submission.comment", entity_type: "worker_submission", entity_id: req.params.id };
      res.json({ ok: true, submission: rows[0] });
    } catch (err) { next(err); }
  });

  /* ── Prefill: Schichtstandards für ein Assignment ───────────────────── */

  router.get("/worker/submissions/:id/prefill", ...base, async (req, res, next) => {
    try {
      const sub = await submissionSvc.getSubmission(pool, req.params.id);
      if (!sub) return res.status(404).json({ error: "NOT_FOUND" });
      if (sub.worker_user_id !== req.session.userId) return res.status(403).json({ error: "FORBIDDEN" });
      if (!sub.assignment_id) return res.json({ prefill: null });

      const { rows } = await pool.query(
        `SELECT wal.default_shift_start, wal.default_shift_end,
                wal.default_break_minutes, wal.default_hours_per_day,
                a.start_date, a.planned_end_date,
                a.worker_description
         FROM worker_assignment_links wal
         JOIN assignments a ON a.id = wal.assignment_id
         WHERE wal.worker_user_id = $1 AND wal.assignment_id = $2`,
        [req.session.userId, sub.assignment_id]
      );
      res.json({ prefill: rows[0] || null });
    } catch (err) { next(err); }
  });

  /* ── Einsatz bestätigen ──────────────────────────────────────────────────────────────── */

  router.post("/worker/assignments/:id/confirm", ...base, async (req, res, next) => {
    try {
      const result = await workerService.confirmAssignment(pool, req.params.id, req.session.userId);
      if (result.error) {
        const status = result.error === "NOT_FOUND" ? 404 : 409;
        return res.status(status).json(result);
      }
      // Notify dispatcher (fire-and-forget)
      const profile = await workerService.getWorkerProfile(pool, req.session.userId);
      const workerName = profile ? `${profile.first_name} ${profile.last_name}` : null;
      if (result.link.created_by) {
        workerNotifications.notifyAssignmentConfirmedToDispatcher(
          pool, result.link.created_by, result.link.id, workerName
        );
      }
      res.locals.audit = { action: "worker_assignment.confirm", entity_type: "worker_assignment_link", entity_id: req.params.id };
      res.json(result);
    } catch (err) { next(err); }
  });

  /* ── Einsatz ablehnen ──────────────────────────────────────────────── */

  router.post("/worker/assignments/:id/decline", ...base, async (req, res, next) => {
    try {
      const reason = String(req.body?.reason || "").trim();
      const result = await workerService.declineAssignment(pool, req.params.id, req.session.userId, reason);
      if (result.error) {
        const status = result.error === "NOT_FOUND" ? 404 : 409;
        return res.status(status).json(result);
      }
      // Notify dispatcher (fire-and-forget)
      const profile = await workerService.getWorkerProfile(pool, req.session.userId);
      const workerName = profile ? `${profile.first_name} ${profile.last_name}` : null;
      if (result.link.created_by) {
        workerNotifications.notifyAssignmentDeclinedToDispatcher(
          pool, result.link.created_by, result.link.id, workerName, reason
        );
      }
      res.locals.audit = { action: "worker_assignment.decline", entity_type: "worker_assignment_link", entity_id: req.params.id, details: { reason } };
      res.json(result);
    } catch (err) { next(err); }
  });

  /* ── Abwesenheit / Krankmeldung melden ───────────────────────────────────────── */

  router.post("/worker/assignments/:id/report-unavailable", ...base, async (req, res, next) => {
    try {
      const unavailableFrom = String(req.body?.unavailable_from || "").trim();
      if (!unavailableFrom || !/^\d{4}-\d{2}-\d{2}$/.test(unavailableFrom)) {
        return res.status(400).json({ error: "INVALID_DATE", message: "G\u00fcltiges Datum (YYYY-MM-DD) erforderlich." });
      }
      const reason = String(req.body?.reason || "").trim().slice(0, 2000);

      const result = await workerService.reportUnavailable(pool, req.params.id, req.session.userId, {
        unavailableFrom, reason
      });
      if (result.error) {
        const status = result.error === "NOT_FOUND" ? 404 : 409;
        return res.status(status).json(result);
      }

      // Notify dispatcher (fire-and-forget)
      const profile = await workerService.getWorkerProfile(pool, req.session.userId);
      const workerName = profile ? `${profile.first_name} ${profile.last_name}`.trim() : null;
      if (result.link.created_by) {
        workerNotifications.notifyUnavailableReported(
          pool, result.link.created_by, result.link.id, workerName, unavailableFrom
        ).catch(swallow("workerPortal"));
      }

      res.locals.audit = {
        action: "worker_assignment.report_unavailable",
        entity_type: "worker_assignment_link",
        entity_id: req.params.id,
        details: { unavailable_from: unavailableFrom, reason }
      };
      res.json(result);
    } catch (err) { next(err); }
  });

  /* ── Einsatz-Detail ──────────────────────────────────────────────────────────────── */

  router.get("/worker/assignments/:id", ...base, async (req, res, next) => {
    try {
      const detail = await workerService.getWorkerAssignmentDetail(
        pool, req.params.id, req.session.userId
      );
      if (!detail) return res.status(404).json({ error: "NOT_FOUND" });
      res.json(detail);
    } catch (err) { next(err); }
  });

  /* ── Einsatzplan (Schedule) ───────────────────────────────────────────────────────── */

  router.get("/worker/schedule", ...base, async (req, res, next) => {
    try {
      const assignments = await workerService.getWorkerSchedule(pool, req.session.userId);
      res.json({ items: assignments, total: assignments.length });
    } catch (err) { next(err); }
  });

  /* ── Notifications ─────────────────────────────────────────────────────────────── */

  router.get("/worker/notifications", ...base, async (req, res, next) => {
    try {
      const onlyUnread = req.query.unread === "true";
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
      const { rows } = await pool.query(
        `SELECT id, type, title, message, entity_type, entity_id,
                severity, is_read, link_path, created_at
         FROM notifications
         WHERE user_id = $1
           ${onlyUnread ? "AND is_read = FALSE" : ""}
         ORDER BY created_at DESC
         LIMIT $2`,
        [req.session.userId, limit]
      );
      const unreadCount = onlyUnread
        ? rows.filter(n => !n.is_read).length
        : (await pool.query(
            "SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND is_read=FALSE",
            [req.session.userId]
          )).rows[0].count;
      res.json({ items: rows, total: rows.length, unread_count: parseInt(unreadCount, 10) || 0 });
    } catch (err) { next(err); }
  });

  router.patch("/worker/notifications/:id/read", ...base, async (req, res, next) => {
    try {
      await pool.query(
        "UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2",
        [req.params.id, req.session.userId]
      );
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  router.patch("/worker/notifications/read-all", ...base, async (req, res, next) => {
    try {
      await pool.query(
        "UPDATE notifications SET is_read=TRUE WHERE user_id=$1 AND is_read=FALSE",
        [req.session.userId]
      );
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  /* ── Status-Übersicht (Dashboard-Widget) ─────────────────────────────────────────────── */

  router.get("/worker/dashboard", ...base, async (req, res, next) => {
    try {
      const profile = await workerService.getWorkerProfile(pool, req.session.userId);
      if (!profile) return res.status(404).json({ error: "PROFILE_NOT_FOUND" });
      const [assignments, recentSubmissions, documentHub] = await Promise.all([
        workerService.getWorkerAssignments(pool, req.session.userId),
        submissionSvc.listSubmissions(pool, {
          workerUserId: req.session.userId,
          limit: 10
        }),
        workerService.listWorkerDocuments(pool, {
          workerUserId: req.session.userId,
          supplierOrgId: profile.supplier_org_id,
          limit: 6,
          includeArchived: false
        })
      ]);

      // Aktuelle Woche KPIs
      const pending     = recentSubmissions.filter(s => s.status === "submitted").length;
      const inReview    = recentSubmissions.filter(s => s.status === "under_review").length;
      const corrections = recentSubmissions.filter(s => s.status === "needs_correction").length;

      res.json({
        active_assignments: assignments.filter(a => a.assignment_is_current).length,
        assignments,
        recent_submissions: recentSubmissions,
        kpis: { pending, in_review: inReview, needs_correction: corrections },
        document_hub: {
          summary: documentHub.summary,
          recent_documents: documentHub.items.map(portalizeDocument)
        }
      });
    } catch (err) { next(err); }
  });

  return router;
}
