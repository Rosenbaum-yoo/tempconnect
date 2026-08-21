/**
 * Capacity Exchange routes — professional workforce availability management.
 * Mounted at /api/capacity-exchange/* to avoid conflicts with existing
 * /api/capacities and /api/marketplace/capacity-posts.
 */

import { z } from "zod";
import { Router } from "express";
import * as capacityExchangeService from "../services/capacityExchangeService.js";
import * as capacityOfferGeneratorService from "../services/capacityOfferGeneratorService.js";
import * as capacityOfferMatchService from "../services/capacityOfferMatchService.js";
import * as marketplaceService from "../services/marketplaceService.js";
import * as matchingEngine from "../services/matchingEngine.js";
import * as auditLog from "../services/auditLog.js";
import { dispatch } from "../services/notificationMatrix.js";
import { scheduleMatchTrigger } from "../services/matchTriggerService.js";
import { attachExplanations } from "../services/matchExplanationService.js";
import * as listingAnalytics from "../services/listingAnalyticsService.js";
import * as settingsService from "../services/settingsService.js";
import { hasFeature } from "../config/planFeatures.js";
import { canInteractWithCapacity } from "../services/capacityInteractionPolicy.js";
import { requireOrgLimit } from "../middleware/entitlementGuard.js";
import { requireScope } from "../middleware/apiKeyAuth.js";
import { swallow } from "../utils/logger.js";
import { canAccessAsOwner } from "../utils/ownerCheck.js";

/* ── Zod Schemas ──────────────────────────────────── */

const createEntrySchema = z.object({
  title: z.string().min(1).max(200),
  role: z.string().min(1).max(120),
  skill_tags: z.array(z.string().max(80)).optional().default([]),
  headcount: z.number().int().min(1).max(999).optional().default(1),
  availability_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  availability_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  location_city: z.string().min(1).max(120),
  location_postal: z.string().max(20).optional().nullable(),
  location_lat: z.number().optional().nullable(),
  location_lng: z.number().optional().nullable(),
  radius_km: z.number().int().min(1).max(500).optional().default(25),
  price_type: z.enum(["hourly", "daily", "fixed"]).optional().nullable(),
  price_min: z.number().optional().nullable(),
  price_max: z.number().optional().nullable(),
  price_hint: z.string().max(200).optional().nullable(),
  worker_category: z.string().max(120).optional().nullable(),
  availability_type: z.enum(["immediate", "scheduled", "flexible"]).optional().default("immediate"),
  shift_model: z.enum(["day", "night", "rotating", "flexible", "weekend", "on_call"]).optional().nullable(),
  employment_type: z.enum(["temporary", "contract", "temp_to_perm", "project", "on_call"]).optional().default("temporary"),
  country: z.string().max(10).optional().default("DE"),
  mobility_notes: z.string().max(500).optional().nullable(),
  qualification_summary: z.string().max(2000).optional().nullable(),
  certifications_summary: z.string().max(2000).optional().nullable(),
  compliance_status: z.enum(["unknown", "pending", "partial", "complete"]).optional().default("unknown"),
  notes: z.string().max(2000).optional().nullable(),
  visibility_status: z.enum(["public", "plan_gated", "vendor_pool_only", "private"]).optional().default("public"),
  priority_level: z.enum(["normal", "elevated", "urgent", "notdienst"]).optional().default("normal"),
  valid_until: z.string().optional().nullable(),
  org_id: z.string().uuid().optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  status: z.enum(["draft", "active"]).optional().default("draft")
});

const updateEntrySchema = createEntrySchema.partial().omit({ status: true });

// Deckungsvorschau (Welle 6). Alles optional: das Formular fragt schon waehrend des
// Tippens, also auch mit halb ausgefuellten Feldern — eine unvollstaendige Anfrage ist
// hier ein gueltiger Zustand, kein Fehler.
const offerCoverageSchema = z.object({
  skills: z.string().max(500).optional(),
  skill_ids: z.string().max(2000).optional(),
  headcount: z.coerce.number().int().min(1).max(999).optional().default(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  all_skills: z.enum(["true", "false"]).optional()
});

const generateOffersSchema = z.object({
  single_skill_ids: z.array(z.string().uuid()).max(200).optional().default([]),
  include_bundle: z.boolean().optional().default(false),
  priority_level: z.enum(["normal", "notdienst"]).optional().default("normal"),
  premium: z.boolean().optional().default(false)
});

const generatePoolSchema = z.object({
  skill_ids: z.array(z.string().uuid()).min(1).max(20),
  worker_profile_ids: z.array(z.string().uuid()).min(1).max(500),
  priority_level: z.enum(["normal", "notdienst"]).optional().default("normal"),
  premium: z.boolean().optional().default(false)
});

const interactionSchema = z.object({
  interaction_type: z.enum(["interest", "offer_request", "question", "save", "requisition_link", "deal_start", "contact", "deal_accept", "deal_negotiate"]),
  message: z.string().max(2000).optional().nullable(),
  requisition_id: z.string().uuid().optional().nullable()
});

/* ── Router factory ───────────────────────────────── */

/**
 * @param {{ pool, requireAuth, requireFeature, getUserAndPlan, logger }} deps
 */
export function createCapacityExchangeRouter(deps) {
  const { pool, requireAuth, requireFeature, getUserAndPlan, logger } = deps;
  const router = Router();

  // Feature gates
  const ceBasic = requireFeature("capacity_exchange_basic");
  const ceMatching = requireFeature("capacity_exchange_matching");
  const listingsLimitGate = requireOrgLimit("listings", { pool, logger });

  /* ── Supplier: Create entry ───────────────────────── */

  router.post("/capacity-exchange/entries", requireAuth, requireScope("write:capacity"), ceBasic, listingsLimitGate, async (req, res) => {
    try {
      const me = req.user;
      if (me?.role !== "agency") return res.status(403).json({ error: "AGENCY_ONLY" });
      const parsed = createEntrySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const plan = me?.plan ?? "FREE";
      // Security: req.orgId (server-set by orgContextMiddleware) always wins over body org_id.
      // A client must never be able to bind an entry to a foreign org by supplying org_id in the body.
      const payload = { ...parsed.data };
      if (req.orgId) payload.org_id = req.orgId;
      const entry = await capacityExchangeService.createCapacityEntry(pool, req.session.userId, plan, payload);

      // writeAuditEnhanced statt writeAudit: loest den Akteur zentral auf (Session ODER
      // API-Key/M2M — die Route ist per requireScope maschinenerreichbar) und fuellt
      // org_id/IP/User-Agent mit, die hier bisher leer blieben.
      await auditLog.writeAuditEnhanced(pool, req, {
        action: "capacity_exchange.create", entity_type: "capacity_post",
        entity_id: entry.id,
        details: { title: entry.title, role: entry.role, status: entry.status, headcount: entry.headcount }
      });

      // Instant-Matching (P4.1) nur fuer sofort veroeffentlichte Angebote. Entwuerfe
      // sind noch nicht am Markt — sie loesen beim Aktivieren aus (handleTransition).
      if (entry?.is_active) {
        scheduleMatchTrigger(pool, { sourceType: "capacity_post", sourceId: entry.id });
      }

      res.status(201).json(entry);
    } catch (e) {
      if (e.code === "PLAN_LIMIT") return res.status(403).json({ error: "PLAN_LIMIT", message: e.message });
      logger.error({ err: e }, "POST /capacity-exchange/entries");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Supplier: Multi-Skill Angebotsgenerator (Welle 3) ─────────────────── */

  // Vorschau: welche N+1 Angebote koennen aus den Skills des Arbeiters entstehen?
  router.get("/capacity-exchange/workers/:workerProfileId/offer-suggestions",
    requireAuth, requireScope("read:capacity"), ceBasic, async (req, res) => {
    try {
      const me = req.user;
      if (me?.role !== "agency") return res.status(403).json({ error: "AGENCY_ONLY" });
      if (!req.orgId) return res.status(403).json({ error: "ORG_REQUIRED" });
      const suggestions = await capacityOfferGeneratorService.buildOfferSuggestions(pool, {
        orgId: req.orgId, workerProfileId: req.params.workerProfileId
      });
      res.json(suggestions);
    } catch (e) {
      if (e.code === "WORKER_NOT_FOUND") return res.status(404).json({ error: "WORKER_NOT_FOUND" });
      if (e.code === "FORBIDDEN") return res.status(403).json({ error: "FORBIDDEN" });
      logger.error({ err: e }, "GET /capacity-exchange/workers/:id/offer-suggestions");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // Erzeugung: ausgewaehlte Einzel-/Buendelangebote als Entwuerfe anlegen.
  router.post("/capacity-exchange/workers/:workerProfileId/generate-offers",
    requireAuth, requireScope("write:capacity"), ceBasic, async (req, res) => {
    try {
      const me = req.user;
      if (me?.role !== "agency") return res.status(403).json({ error: "AGENCY_ONLY" });
      if (!req.orgId) return res.status(403).json({ error: "ORG_REQUIRED" });
      const parsed = generateOffersSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      if (!parsed.data.single_skill_ids.length && !parsed.data.include_bundle) {
        return res.status(400).json({ error: "NOTHING_SELECTED" });
      }
      const plan = me?.plan ?? "FREE";
      const result = await capacityOfferGeneratorService.createOffersFromSelection(pool, {
        supplierUserId: req.session.userId, orgId: req.orgId, plan,
        workerProfileId: req.params.workerProfileId,
        single_skill_ids: parsed.data.single_skill_ids,
        include_bundle: parsed.data.include_bundle,
        priority_level: parsed.data.priority_level,
        premium: parsed.data.premium
      });
      await auditLog.writeAuditEnhanced(pool, req, {
        action: "capacity_exchange.generate_offers", entity_type: "worker_profile",
        entity_id: req.params.workerProfileId,
        details: { created: result.created_count, skipped: result.skipped_count }
      });
      res.status(201).json(result);
    } catch (e) {
      if (e.code === "WORKER_NOT_FOUND") return res.status(404).json({ error: "WORKER_NOT_FOUND" });
      if (e.code === "FORBIDDEN") return res.status(403).json({ error: "FORBIDDEN" });
      if (e.code === "LOCATION_REQUIRED") {
        return res.status(400).json({ error: "LOCATION_REQUIRED", message: "Bitte zuerst Wohnort/Einsatzort des Mitarbeiters ergänzen." });
      }
      logger.error({ err: e }, "POST /capacity-exchange/workers/:id/generate-offers");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Supplier: Sammelangebote / Pool (Welle 4a) ────────────────────────── */

  // Vorschau: alle Arbeiter der Org mit einem Skill (inkl. Frei-Markierung).
  router.get("/capacity-exchange/pool/suggestion",
    requireAuth, requireScope("read:capacity"), ceBasic, async (req, res) => {
    try {
      const me = req.user;
      if (me?.role !== "agency") return res.status(403).json({ error: "AGENCY_ONLY" });
      if (!req.orgId) return res.status(403).json({ error: "ORG_REQUIRED" });
      const raw = String(req.query.skill_ids || req.query.skill_id || "");
      const skillIds = raw.split(",").map((s) => s.trim()).filter(Boolean);
      if (!skillIds.length) return res.status(400).json({ error: "SKILL_ID_REQUIRED" });
      const suggestion = await capacityOfferGeneratorService.buildPoolSuggestion(pool, { orgId: req.orgId, skillIds });
      res.json(suggestion);
    } catch (e) {
      if (e.code === "SKILL_NOT_FOUND") return res.status(404).json({ error: "SKILL_NOT_FOUND" });
      if (e.code === "SKILL_REQUIRED") return res.status(400).json({ error: "SKILL_REQUIRED" });
      logger.error({ err: e }, "GET /capacity-exchange/pool/suggestion");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // Erzeugung: EIN Sammelangebot, das die gewählten Arbeiter bündelt (als Entwurf).
  router.post("/capacity-exchange/pool/generate",
    requireAuth, requireScope("write:capacity"), ceBasic, async (req, res) => {
    try {
      const me = req.user;
      if (me?.role !== "agency") return res.status(403).json({ error: "AGENCY_ONLY" });
      if (!req.orgId) return res.status(403).json({ error: "ORG_REQUIRED" });
      const parsed = generatePoolSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const plan = me?.plan ?? "FREE";
      const result = await capacityOfferGeneratorService.createPoolOffer(pool, {
        supplierUserId: req.session.userId, orgId: req.orgId, plan,
        skillIds: parsed.data.skill_ids,
        workerProfileIds: parsed.data.worker_profile_ids,
        priority_level: parsed.data.priority_level,
        premium: parsed.data.premium
      });
      await auditLog.writeAuditEnhanced(pool, req, {
        action: "capacity_exchange.generate_pool", entity_type: "capacity_post",
        entity_id: result.id,
        details: { skill_ids: result.skill_ids, member_count: result.member_count }
      });
      res.status(201).json(result);
    } catch (e) {
      if (e.code === "SKILL_NOT_FOUND") return res.status(404).json({ error: "SKILL_NOT_FOUND" });
      if (e.code === "POOL_EMPTY" || e.code === "NO_VALID_MEMBERS" || e.code === "SKILL_REQUIRED") return res.status(400).json({ error: e.code });
      if (e.code === "PLAN_LIMIT") return res.status(403).json({ error: "PLAN_LIMIT", message: e.message });
      logger.error({ err: e }, "POST /capacity-exchange/pool/generate");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Supplier: Deckungsvorschau im Angebotsformular (Welle 6) ──────────── */

  // Deckt die eigene Belegschaft dieses Angebot? Lesend, ohne Nebenwirkung — die Antwort
  // erscheint waehrend des Tippens, damit niemand eine Kopfzahl einstellt, die er nicht
  // halten kann. Bewusst KEIN Audit-Eintrag: eine Formularvorschau ist keine Handlung.
  router.get("/capacity-exchange/offer-coverage",
    requireAuth, requireScope("read:capacity"), ceBasic, async (req, res) => {
    try {
      const me = req.user;
      if (me?.role !== "agency") return res.status(403).json({ error: "AGENCY_ONLY" });
      if (!req.orgId) return res.status(403).json({ error: "ORG_REQUIRED" });
      const parsed = offerCoverageSchema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const q = parsed.data;
      const result = await capacityOfferMatchService.checkOfferCoverage(pool, {
        orgId: req.orgId,
        skillTags: q.skills ? q.skills.split(",").map((s) => s.trim()).filter(Boolean) : [],
        skillIds: q.skill_ids ? q.skill_ids.split(",").map((s) => s.trim()).filter(Boolean) : [],
        headcount: q.headcount,
        from: q.from || null,
        to: q.to || null,
        alleSkills: q.all_skills === "true"
      });
      res.json(result);
    } catch (e) {
      if (e.code === "ORG_REQUIRED") return res.status(403).json({ error: "ORG_REQUIRED" });
      logger.error({ err: e }, "GET /capacity-exchange/offer-coverage");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Supplier: Besetzbarkeits-Vorschau am fremden Bedarf (P8 Welle E) ──── */

  // "Koennte ich das ueberhaupt liefern?" — beantwortet beim Ueberfahren einer
  // Bedarfs-Karte im Feed, nicht beim Rendern der Liste. Ein Feed mit 50
  // Eintraegen darf dafuer KEINE einzige Abfrage ausloesen (Gate E); die
  // Oberflaeche laedt erst bei Bedarf und merkt sich die Antwort.
  //
  // Dieselbe Rechenmaschine wie die Formular-Vorschau (`checkOfferCoverage`) —
  // eine zweite Deckungslogik wuerde beim ersten Regelwechsel auseinanderlaufen.
  // Verdichtet wird sie hier aber ANONYM: keine Namen, keine Wohnorte, keine
  // Profil-Ids (Leitentscheidung 3.5). Lesend, kein Audit — eine Vorschau ist
  // keine Handlung.
  router.get("/capacity-exchange/demands/:id/coverage",
    requireAuth, requireScope("read:capacity"), ceBasic, async (req, res) => {
    try {
      const me = req.user;
      if (me?.role !== "agency") return res.status(403).json({ error: "AGENCY_ONLY" });
      if (!req.orgId) return res.status(403).json({ error: "ORG_REQUIRED" });

      const demand = await marketplaceService.getDemandById(pool, req.params.id);
      // Geschlossene Bedarfe haben nichts vorzuschauen. 404 statt 403: die
      // Existenz eines fremden geschlossenen Bedarfs geht die Agentur nichts an.
      if (!demand || demand.status === "closed" || demand.status === "fulfilled") {
        return res.status(404).json({ error: "NOT_FOUND" });
      }

      // Die noch offene Kopfzahl ist die ehrliche Bezugsgroesse: bei einem zur
      // Haelfte gedeckten Bedarf waere "0 von 10" eine Sackgassen-Anzeige.
      const gefordert = Number(demand.remaining_open_count) > 0
        ? Number(demand.remaining_open_count)
        : Number(demand.headcount) || 1;

      const deckung = await capacityOfferMatchService.checkOfferCoverage(pool, {
        orgId: req.orgId,
        // Rolle UND Faehigkeiten: der Rollentext ist bei vielen Bedarfen der
        // einzige auswertbare Begriff, die Skill-Liste bleibt oft leer.
        skillTags: [demand.role, ...(demand.skill_tags || [])].filter(Boolean),
        headcount: gefordert,
        from: demand.start_date || null,
        to: demand.end_date || null,
        alleSkills: false
      });

      res.json({
        demand_id: demand.id,
        ...capacityOfferMatchService.fasseDeckungAnonymZusammen(deckung)
      });
    } catch (e) {
      if (e.code === "ORG_REQUIRED") return res.status(403).json({ error: "ORG_REQUIRED" });
      logger.error({ err: e }, "GET /capacity-exchange/demands/:id/coverage");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Supplier: Update entry ───────────────────────── */

  router.patch("/capacity-exchange/entries/:id", requireAuth, requireScope("write:capacity"), ceBasic, async (req, res) => {
    try {
      const parsed = updateEntrySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const entry = await capacityExchangeService.updateCapacityEntry(pool, req.params.id, req.session.userId, parsed.data);
      if (!entry) return res.status(404).json({ error: "NOT_FOUND" });

      await auditLog.writeAuditEnhanced(pool, req, {
        action: "capacity_exchange.update", entity_type: "capacity_post",
        entity_id: entry.id,
        details: { changed_fields: Object.keys(parsed.data) }
      });

      res.json(entry);
    } catch (e) {
      logger.error({ err: e }, "PATCH /capacity-exchange/entries/:id");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Supplier: Status transitions ─────────────────── */

  async function handleTransition(req, res, targetStatus) {
    try {
      const me = await getUserAndPlan(req.session.userId);
      const plan = me?.plan ?? "FREE";
      const result = await capacityExchangeService.transitionStatus(pool, req.params.id, req.session.userId, targetStatus, plan);
      if (result.error === "NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
      if (result.error === "VALIDATION") return res.status(400).json({ error: "VALIDATION", details: result.details });
      if (result.error === "PLAN_LIMIT") return res.status(403).json({ error: "PLAN_LIMIT", limit: result.limit });

      await auditLog.writeAuditEnhanced(pool, req, {
        action: `capacity_exchange.${targetStatus}`, entity_type: "capacity_post",
        entity_id: req.params.id,
        details: { new_status: targetStatus }
      });

      // ── Instant-Matching (P4.1) ──
      // Ersetzt die frueher hier inline gebaute Variante: die kannte nur
      // demand_requests (Requisitions fielen durch), hatte keinen Dedup, schrieb
      // keinen match_alerts-Datensatz und verlinkte auf eine Uebersicht statt auf
      // das konkrete Gegenstueck. Jetzt: derselbe Chokepoint wie in allen anderen
      // Erstellungspfaden, fire-and-forget.
      if (targetStatus === "active") {
        scheduleMatchTrigger(pool, { sourceType: "capacity_post", sourceId: req.params.id });
      }

      res.json(result.entry);
    } catch (e) {
      if (e.name === "CapacityTransitionError") {
        return res.status(400).json({ error: "INVALID_TRANSITION", from: e.from, to: e.to });
      }
      logger.error({ err: e }, `POST /capacity-exchange/entries/:id/${targetStatus}`);
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  }

  router.post("/capacity-exchange/entries/:id/activate", requireAuth, requireScope("write:capacity"), ceBasic, listingsLimitGate, (req, res) => handleTransition(req, res, "active"));
  router.post("/capacity-exchange/entries/:id/pause", requireAuth, requireScope("write:capacity"), ceBasic, (req, res) => handleTransition(req, res, "paused"));
  router.post("/capacity-exchange/entries/:id/reactivate", requireAuth, requireScope("write:capacity"), ceBasic, listingsLimitGate, (req, res) => handleTransition(req, res, "active"));
  router.post("/capacity-exchange/entries/:id/fill", requireAuth, requireScope("write:capacity"), ceBasic, (req, res) => handleTransition(req, res, "filled"));
  router.post("/capacity-exchange/entries/:id/archive", requireAuth, requireScope("write:capacity"), ceBasic, (req, res) => handleTransition(req, res, "archived"));

  /* ── Supplier: Confirm freshness ──────────────────── */

  router.post("/capacity-exchange/entries/:id/confirm", requireAuth, requireScope("write:capacity"), ceBasic, async (req, res) => {
    try {
      const entry = await capacityExchangeService.confirmFreshness(pool, req.params.id, req.session.userId);
      if (!entry) return res.status(404).json({ error: "NOT_FOUND" });

      await auditLog.writeAuditEnhanced(pool, req, {
        action: "capacity_exchange.confirm", entity_type: "capacity_post",
        entity_id: entry.id
      });

      res.json(entry);
    } catch (e) {
      logger.error({ err: e }, "POST /capacity-exchange/entries/:id/confirm");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Supplier: List own entries ────────────────────── */

  router.get("/capacity-exchange/entries", requireAuth, requireScope("read:capacity"), ceBasic, async (req, res) => {
    try {
      const opts = {
        status: req.query.status || undefined,
        expiring_within_days: req.query.expiring_within_days ? parseInt(req.query.expiring_within_days, 10) : undefined,
        limit: Math.min(100, parseInt(req.query.limit, 10) || 50)
      };
      const rows = await capacityExchangeService.listOwnEntries(pool, req.session.userId, opts);
      res.json(rows);
    } catch (e) {
      logger.error({ err: e }, "GET /capacity-exchange/entries");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Supplier: Single entry detail ────────────────── */

  router.get("/capacity-exchange/entries/:id", requireAuth, requireScope("read:capacity"), ceBasic, async (req, res) => {
    try {
      const entry = await capacityExchangeService.getEntryById(pool, req.params.id, req.session.userId);
      if (!entry) return res.status(404).json({ error: "NOT_FOUND" });
      // Attach trust signals for owner view
      if (entry.supplier_company_id === req.session.userId) {
        entry.trust_signals = await capacityExchangeService.computeTrustSignals(pool, req.session.userId);
      }
      res.json(entry);
    } catch (e) {
      logger.error({ err: e }, "GET /capacity-exchange/entries/:id");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Supplier: Dashboard stats ────────────────────── */

  router.get("/capacity-exchange/stats", requireAuth, requireScope("read:capacity"), ceBasic, async (req, res) => {
    try {
      const stats = await capacityExchangeService.getSupplierDashboardStats(pool, req.session.userId);
      res.json(stats);
    } catch (e) {
      logger.error({ err: e }, "GET /capacity-exchange/stats");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Supplier: View matching requisitions ─────────── */

  router.get("/capacity-exchange/entries/:id/matches", requireAuth, requireScope("read:capacity"), ceMatching, async (req, res) => {
    try {
      // Verify ownership
      const entry = await capacityExchangeService.getEntryById(pool, req.params.id, req.session.userId);
      if (!entry) return res.status(404).json({ error: "NOT_FOUND" });
      if (!await canAccessAsOwner(pool, entry.supplier_company_id, req.session.userId)) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }

      const matches = await matchingEngine.matchCapacityToRequisitions(pool, req.params.id, {
        topN: 25, minScore: 10, supplierVerified: true
      });
      // P4.2: Score-Zerlegung + Klartext-Begruendung kommen vom Server, damit jede
      // Oberflaeche dieselbe Erklaerung zeigt statt eigener Label-Tabellen.
      res.json(attachExplanations(matches));
    } catch (e) {
      logger.error({ err: e }, "GET /capacity-exchange/entries/:id/matches");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Supplier: View interactions on entry ─────────── */

  router.get("/capacity-exchange/entries/:id/interactions", requireAuth, requireScope("read:capacity"), ceBasic, async (req, res) => {
    try {
      const entry = await capacityExchangeService.getEntryById(pool, req.params.id, req.session.userId);
      if (!entry) return res.status(404).json({ error: "NOT_FOUND" });
      if (!await canAccessAsOwner(pool, entry.supplier_company_id, req.session.userId)) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }
      const interactions = await capacityExchangeService.listInteractions(pool, req.params.id);
      res.json(interactions);
    } catch (e) {
      logger.error({ err: e }, "GET /capacity-exchange/entries/:id/interactions");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Company: Browse capacity feed ────────────────── */

  router.get("/capacity-exchange/feed", requireAuth, requireScope("read:capacity"), async (req, res) => {
    try {
      const me = await getUserAndPlan(req.session.userId);
      let interAgencyEnabled = false;
      let interAgencySupplyVisible = false;
      if (me?.role === "agency" && req.orgId) {
        const settings = await settingsService.getSettings(pool, req.orgId);
        const planAllows = hasFeature(me?.plan, "inter_agency_matching");
        interAgencyEnabled = planAllows && settings.inter_agency_matching_enabled === true;
        interAgencySupplyVisible = interAgencyEnabled && settings.inter_agency_supply_visible === true;
      }
      const opts = {
        worker_category: req.query.worker_category || undefined,
        role: req.query.role || undefined,
        location_city: req.query.city || undefined,
        availability_from: req.query.availability_from || undefined,
        availability_window: req.query.availability_window || undefined,
        min_headcount: req.query.min_headcount ? parseInt(req.query.min_headcount, 10) : undefined,
        shift_model: req.query.shift_model || undefined,
        compliance_status: req.query.compliance_status || undefined,
        priority_level: req.query.priority_level || undefined,
        latitude: req.query.latitude ? parseFloat(req.query.latitude) : undefined,
        longitude: req.query.longitude ? parseFloat(req.query.longitude) : undefined,
        radius_km: req.query.radius_km ? parseInt(req.query.radius_km, 10) : undefined,
        skill_tags: req.query.skill_tags ? String(req.query.skill_tags).split(",").map(t => t.trim()).filter(Boolean) : undefined,
        sort: req.query.sort || undefined,
        viewer_role: me?.role || null,
        viewer_user_id: req.session.userId,
        inter_agency_enabled: interAgencyEnabled,
        inter_agency_supply_visible: interAgencySupplyVisible,
        page: parseInt(req.query.page, 10) || 1,
        limit: Math.min(100, parseInt(req.query.limit, 10) || 25)
      };
      const result = await capacityExchangeService.browseFeed(pool, opts);
      res.json(result);
    } catch (e) {
      logger.error({ err: e }, "GET /capacity-exchange/feed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Company: Single feed entry detail ────────────── */

  router.get("/capacity-exchange/feed/:id", requireAuth, requireScope("read:capacity"), async (req, res) => {
    try {
      const entry = await capacityExchangeService.getEntryById(pool, req.params.id, req.session.userId);
      if (!entry) return res.status(404).json({ error: "NOT_FOUND" });
      // Attach trust signals for the viewer
      entry.trust_signals = await capacityExchangeService.computeTrustSignals(pool, entry.supplier_company_id);

      // Track listing view for analytics (fire-and-forget)
      listingAnalytics.recordView(pool, req.params.id, req.session.userId).catch(swallow("capacityExchange"));

      // Match Suggestions: top matching demands/requisitions for this capacity
      try {
        const matches = await matchingEngine.matchCapacityToRequisitions(pool, req.params.id, {
          topN: 5, minScore: 20
        });
        entry.suggested_matches = matches.map(m => ({
          type: m.type,
          id: m.entity?.id,
          title: m.entity?.title || m.entity?.role,
          role: m.entity?.role,
          location_city: m.entity?.location_city,
          score: m.score
        }));
      } catch { entry.suggested_matches = []; }

      res.json(entry);
    } catch (e) {
      logger.error({ err: e }, "GET /capacity-exchange/feed/:id");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Company: Create interaction ──────────────────── */

  /* ── Merken zuruecknehmen (P9 Welle B1) ─────────────────────
   *
   * Der Gegenweg zu `interaction_type: "save"`. Bewusst als eigener, benannter
   * Pfad statt als DELETE auf die Interaktions-ID: der Nutzer kennt den Eintrag,
   * den er entfernen will, nicht die Kennung seiner Merkung.
   *
   * Kein Zugriffs-Check auf den Eintrag noetig — entfernt wird ausschliesslich die
   * EIGENE Merkung (`company_user_id = req.session.userId`). Fremde Merklisten
   * sind darueber nicht erreichbar.
   */
  router.delete("/capacity-exchange/entries/:id/interactions/save",
    requireAuth, requireScope("write:capacity"), async (req, res) => {
      try {
        const ergebnis = await capacityExchangeService.entferneMerkung(
          pool, req.session.userId, { capacityPostId: req.params.id }
        );
        if (ergebnis.entfernt) {
          await auditLog.writeAuditEnhanced(pool, req, {
            action: "capacity_exchange.interaction.unsave",
            entity_type: "capacity_post",
            entity_id: req.params.id,
            details: { capacity_post_id: req.params.id }
          });
        }
        // Auch wenn nichts zu entfernen war, ist der gewuenschte Zustand erreicht.
        res.json({ ok: true, gemerkt: false, entfernt: ergebnis.entfernt });
      } catch (e) {
        logger.error({ err: e }, "DELETE /capacity-exchange/entries/:id/interactions/save");
        res.status(500).json({ error: "SERVER_ERROR" });
      }
    });

  router.post("/capacity-exchange/entries/:id/interactions", requireAuth, requireScope("write:capacity"), async (req, res) => {
    try {
      const parsed = interactionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      // Verify entry exists and is active
      const entry = await capacityExchangeService.getEntryById(pool, req.params.id, req.session.userId);
      if (!entry) return res.status(404).json({ error: "NOT_FOUND" });

      const me = await getUserAndPlan(req.session.userId);
      const policy = canInteractWithCapacity({
        viewerRole: me?.role || null,
        viewerUserId: req.session.userId,
        supplierUserId: entry.supplier_company_id,
        entryStatus: entry.status
      });
      if (!policy.allowed) return res.status(policy.status).json({ error: policy.code });

      const interaction = await capacityExchangeService.createInteraction(
        pool, req.params.id, req.session.userId, parsed.data
      );
      if (!interaction) return res.status(200).json({ ok: true, deduped: true });

      await auditLog.writeAuditEnhanced(pool, req, {
        action: `capacity_exchange.interaction.${parsed.data.interaction_type}`,
        entity_type: "capacity_interaction",
        entity_id: interaction.id,
        details: { capacity_post_id: req.params.id, type: parsed.data.interaction_type }
      });

      // Notify supplier — type-specific notification for deal actions
      const iType = parsed.data.interaction_type;
      try {
        if (iType === "deal_accept") {
          await dispatch(pool, "capacity.interest_received", {
            recipientUserIds: [entry.supplier_company_id],
            entityType: "capacity_post",
            entityId: req.params.id,
            message: `Dealbereitschaft f\u00fcr "${entry.title}" \u2013 Konditionen wurden zugestimmt. N\u00e4chster Schritt: operative Abstimmung.`
          });
        } else if (iType === "deal_negotiate") {
          await dispatch(pool, "capacity.interest_received", {
            recipientUserIds: [entry.supplier_company_id],
            entityType: "capacity_post",
            entityId: req.params.id,
            message: `Verhandlungsanfrage f\u00fcr "${entry.title}" \u2013 Anpassungsw\u00fcnsche liegen vor. Bitte pr\u00fcfen.`
          });
        } else if (["interest", "offer_request", "deal_start", "contact"].includes(iType)) {
          await dispatch(pool, "capacity.interest_received", {
            recipientUserIds: [entry.supplier_company_id],
            entityType: "capacity_post",
            entityId: req.params.id,
            message: `Neue Reaktion auf "${entry.title}" (${iType})`
          });
        }
      } catch { /* notification failure is non-critical */ }

      res.status(201).json(interaction);
    } catch (e) {
      logger.error({ err: e }, "POST /capacity-exchange/entries/:id/interactions");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Premium Analytics: per-listing stats ──────────── */

  router.get("/capacity-exchange/entries/:id/analytics", requireAuth, requireScope("read:capacity"), async (req, res) => {
    try {
      const entry = await capacityExchangeService.getEntryById(pool, req.params.id, req.session.userId);
      if (!entry) return res.status(404).json({ error: "NOT_FOUND" });
      if (!await canAccessAsOwner(pool, entry.supplier_company_id, req.session.userId)) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }
      const stats = await listingAnalytics.getListingStats(pool, req.params.id);
      res.json(stats);
    } catch (e) {
      logger.error({ err: e }, "GET /capacity-exchange/entries/:id/analytics");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Premium Analytics: supplier dashboard ────────── */

  router.get("/capacity-exchange/my-analytics", requireAuth, requireScope("read:capacity"), async (req, res) => {
    try {
      const dashboard = await listingAnalytics.getSupplierDashboard(pool, req.session.userId);
      res.json(dashboard);
    } catch (e) {
      logger.error({ err: e }, "GET /capacity-exchange/my-analytics");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Premium Analytics: record click ──────────────── */

  router.post("/capacity-exchange/entries/:id/click", requireAuth, requireScope("write:capacity"), async (req, res) => {
    try {
      await listingAnalytics.recordClick(pool, req.params.id, req.session.userId);
      res.locals.audit = {
        action: "capacity_exchange.click",
        entity_type: "capacity_post",
        entity_id: req.params.id,
        details: { viewer_id: req.session.userId }
      };
      res.json({ ok: true });
    } catch (e) {
      logger.error({ err: e }, "POST /capacity-exchange/entries/:id/click");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Admin/Cron: Confirmation reminders + escalation ── */

  router.post("/capacity-exchange/admin/process-reminders", requireAuth, requireScope("write:capacity"), async (req, res) => {
    try {
      const me = req.user;
      if (me?.role !== "admin") return res.status(403).json({ error: "ADMIN_ONLY" });
      const result = await capacityExchangeService.processConfirmationReminders(pool, {
        reminderDays: parseInt(req.body.reminder_days, 10) || 7,
        escalationDays: parseInt(req.body.escalation_days, 10) || 14
      });
      res.locals.audit = { action: "capacity_exchange.process_reminders", entity_type: "capacity_post", entity_id: null, details: { reminders_sent: result.reminders_sent, escalations: result.escalations } };
      res.json(result);
    } catch (e) {
      logger.error({ err: e }, "POST /capacity-exchange/admin/process-reminders");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
