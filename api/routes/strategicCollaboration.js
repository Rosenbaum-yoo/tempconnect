import { Router } from "express";
import { z } from "zod";
import * as userService from "../services/userService.js";
import * as strategicSvc from "../services/strategicCollaborationService.js";
import { normalizePlanKey } from "../config/planCatalog.js";
import { notifyEnterpriseRequestReceived } from "../services/subscriptionNotificationService.js";
import * as subscriptionDocs from "../services/subscriptionDocumentService.js";

const createSchema = z.object({
  source_context: z.enum(["public_profile", "enterprise_config"]).default("public_profile"),
  target_user_id: z.string().uuid().optional().nullable(),
  target_org_id: z.string().uuid().optional().nullable(),
  requester_company_name: z.string().min(2).max(180),
  contact_name: z.string().min(2).max(140),
  contact_email: z.string().email().max(180),
  contact_phone: z.string().max(60).optional().nullable(),
  region_scope: z.string().max(240).optional().nullable(),
  site_count: z.coerce.number().int().min(1).max(10000).optional().nullable(),
  expected_volume: z.string().max(180).optional().nullable(),
  needs_enterprise_multi_site: z.boolean().optional(),
  interest_enterprise_support: z.boolean().optional(),
  interest_framework_conditions: z.boolean().optional(),
  interest_strategic_cooperation: z.boolean().optional(),
  requested_modules: z.array(z.string().max(80)).max(20).optional(),
  message: z.string().min(10).max(2000).optional().nullable()
});

const statusSchema = z.object({
  status: z.enum(strategicSvc.ALLOWED_STATUSES)
});

function isOrgBackofficeRole(role) {
  return ["platform_admin", "owner", "admin", "manager", "compliance_manager"].includes(String(role || ""));
}

export function createStrategicCollaborationRouter(deps) {
  const { pool, requireAuth, sendMail, logger } = deps;
  const router = Router();

  router.get("/strategic-collaboration/eligibility", requireAuth, async (req, res) => {
    const me = await userService.getUserAndPlan(pool, req.session.userId);
    if (!me) return res.status(401).json({ error: "NOT_AUTHENTICATED" });
    const eligibility = await strategicSvc.computeEligibility(pool, me, req.orgId || null);
    res.json(eligibility);
  });

  router.post("/strategic-collaboration/interest", requireAuth, async (req, res) => {
    const parsed = createSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

    const me = await userService.getUserAndPlan(pool, req.session.userId);
    if (!me) return res.status(401).json({ error: "NOT_AUTHENTICATED" });

    // Always mark audit for mutation attempt (DENIED will be logged for 4xx).
    res.locals.audit = {
      action: "strategic_collaboration.interest_create_attempt",
      entity_type: "strategic_collaboration_request",
      entity_id: String(req.orgId || req.session.userId),
      details: { source_context: parsed.data.source_context, target_user_id: parsed.data.target_user_id || null }
    };

    const eligibility = await strategicSvc.computeEligibility(pool, me, req.orgId || null);
    if (!eligibility.allowed) {
      return res.status(403).json({ error: eligibility.code || "TRUST_THRESHOLD_NOT_MET", reasons: eligibility.reasons || [] });
    }

    try {
      const row = await strategicSvc.createInterest(pool, {
        ...parsed.data,
        requester_user_id: req.session.userId,
        requester_org_id: req.orgId
      });
      res.locals.audit = {
        action: "strategic_collaboration.interest_create",
        entity_type: "strategic_collaboration_request",
        entity_id: row.id,
        details: { source_context: row.source_context, target_org_id: row.target_org_id || null, status: row.status }
      };
      res.status(201).json({ success: true, data: row });
    } catch (e) {
      if (e?.code === "RATE_LIMITED") return res.status(429).json({ error: "RATE_LIMITED", message: "Zu viele Anfragen in kurzer Zeit." });
      if (e?.code === "DUPLICATE_OPEN_REQUEST") return res.status(409).json({ error: "DUPLICATE_OPEN_REQUEST", existing_id: e.existing_id });
      throw e;
    }
  });

  router.get("/strategic-collaboration/requests", requireAuth, async (req, res) => {
    if (!req.orgId) return res.status(400).json({ error: "ORG_REQUIRED" });
    if (!isOrgBackofficeRole(req.orgRole)) return res.status(403).json({ error: "FORBIDDEN" });
    const rows = await strategicSvc.listRequests(pool, {
      org_id: req.orgId,
      limit: req.query.limit,
      offset: req.query.offset
    });
    res.json({ success: true, data: { items: rows } });
  });

  router.patch("/strategic-collaboration/requests/:id/status", requireAuth, async (req, res) => {
    // Always mark audit for mutation attempt (DENIED will be logged for 4xx).
    res.locals.audit = {
      action: "strategic_collaboration.status_update_attempt",
      entity_type: "strategic_collaboration_request",
      entity_id: String(req.params.id),
      details: { requested_status: req.body && req.body.status ? req.body.status : null }
    };

    if (!req.orgId) return res.status(400).json({ error: "ORG_REQUIRED" });
    if (!isOrgBackofficeRole(req.orgRole)) return res.status(403).json({ error: "FORBIDDEN" });
    const parsed = statusSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    const row = await strategicSvc.updateStatus(pool, req.params.id, req.orgId, parsed.data.status, req.session.userId);
    if (!row) return res.status(404).json({ error: "NOT_FOUND" });
    res.locals.audit = {
      action: "strategic_collaboration.status_update",
      entity_type: "strategic_collaboration_request",
      entity_id: row.id,
      details: { status: row.status }
    };
    res.json({ success: true, data: row });
  });

  /**
   * Konfigurator-Submission aus `/public/enterprise_anfrage.html`.
   *
   * - Oeffentlich erreichbar (kein requireAuth). User/Org werden übernommen,
   *   wenn Session vorhanden ist.
   * - Speichert vollstaendig in `strategic_collaboration_requests`
   *   (request_type='enterprise_config'): Plan, Addons, Seats, Schaetzungen,
   *   Adresse, Erwarteter Start, Hinweise. Keine stillen Drops.
   * - Audit-Eintrag immer (auch ohne User-Id).
   * - Burst- und Duplikat-Schutz im Service.
   */
  router.post("/enterprise-request", async (req, res) => {
    const addonSchema = z.object({
      id: z.string().min(1).max(40),
      name: z.string().min(1).max(180).optional(),
      price: z.coerce.number().int().min(0).max(1_000_000).optional(),
      type: z.enum(["monthly", "onetime"]).optional()
    });

    const enterpriseSchema = z.object({
      // Pflicht
      company: z.string().min(2).max(180),
      contact: z.string().min(2).max(140),
      email: z.string().email().max(180),
      // Optional Kontaktdaten
      phone: z.string().max(60).optional().nullable(),
      street: z.string().max(240).optional().nullable(),
      city: z.string().max(180).optional().nullable(),
      vat_id: z.string().max(60).optional().nullable(),
      expected_start: z.string().max(20).optional().nullable(),
      notes: z.string().max(5000).optional().nullable(),
      // Konfigurator-Payload
      plan: z.string().max(40).optional().nullable(),
      base_price: z.coerce.number().int().min(0).max(1_000_000).optional().nullable(),
      seats: z.coerce.number().int().min(0).max(99_999).optional().nullable(),
      seats_included: z.coerce.number().int().min(0).max(99_999).optional().nullable(),
      extra_seat_price: z.coerce.number().int().min(0).max(100_000).optional().nullable(),
      monthly_estimate: z.coerce.number().int().min(0).max(10_000_000).optional().nullable(),
      onetime_estimate: z.coerce.number().int().min(0).max(10_000_000).optional().nullable(),
      addons: z.array(addonSchema).max(50).optional(),
      // Strategic-Collaboration-Block (legacy/optional)
      strategic_collaboration_interest: z.boolean().optional().default(false),
      strategic_collaboration_message: z.string().max(2000).optional().nullable(),
      strategic_collaboration_site_count: z.coerce.number().int().min(1).max(10000).optional().nullable(),
      strategic_collaboration_region_scope: z.string().max(240).optional().nullable(),
      strategic_collaboration_multi_site: z.boolean().optional().default(true),
      strategic_collaboration_framework_conditions: z.boolean().optional().default(true),
      strategic_collaboration_enterprise_support: z.boolean().optional().default(true),
      strategic_collaboration_strategic_cooperation: z.boolean().optional().default(true)
    });

    const parsed = enterpriseSchema.safeParse(req.body || {});
    if (!parsed.success) {
      res.locals.audit = {
        action: "enterprise.request_submit_invalid",
        entity_type: "enterprise_request",
        entity_id: String(req.session?.userId || req.ip || "anonymous"),
        details: { issues: parsed.error.issues.map((i) => ({ path: i.path, code: i.code })) }
      };
      return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    }

    const data = parsed.data;
    const userId = req.session?.userId || null;
    const orgId = req.orgId || null;

    // Plan-Label normalisieren (DEMO/BASIS/PLUS/PRO/INDIVIDUELL).
    // Default fuer enterprise-request ist INDIVIDUELL, weil dieser Pfad
    // ausschliesslich Konfigurator-/Anfrage-Submissions abdeckt.
    function normalizePlan(value) {
      return normalizePlanKey(value, { fallback: "INDIVIDUELL" });
    }

    function safeDate(value) {
      if (!value) return null;
      const s = String(value).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
      return s;
    }

    const planRequested = normalizePlan(data.plan);
    const expectedStart = safeDate(data.expected_start);

    // Anmerkungen + ggf. strategic_collaboration_message zusammenfassen,
    // damit das Staff-Team auch alte Hinweise sieht.
    const messageParts = [];
    if (data.notes) messageParts.push(String(data.notes).trim());
    if (data.strategic_collaboration_message) {
      messageParts.push("[Kooperation]: " + String(data.strategic_collaboration_message).trim());
    }
    const combinedMessage = messageParts.filter(Boolean).join("\n\n") || null;

    res.locals.audit = {
      action: "enterprise.request_submit",
      entity_type: "enterprise_request",
      entity_id: String(orgId || userId || req.ip || "anonymous"),
      details: {
        logged_in: !!userId,
        has_org: !!orgId,
        plan_requested: planRequested,
        addons: Array.isArray(data.addons) ? data.addons.length : 0,
        seats: data.seats ?? null,
        strategic_interest: data.strategic_collaboration_interest === true
      }
    };

    try {
      const row = await strategicSvc.createEnterpriseRequest(pool, {
        request_type: "enterprise_config",
        source_context: "enterprise_config",
        requester_user_id: userId,
        requester_org_id: orgId,
        target_user_id: null,
        target_org_id: null,
        requester_company_name: data.company,
        contact_name: data.contact,
        contact_email: data.email,
        contact_phone: data.phone || null,
        region_scope: data.strategic_collaboration_region_scope || null,
        site_count: data.strategic_collaboration_site_count ?? null,
        expected_volume: null,
        needs_enterprise_multi_site: data.strategic_collaboration_multi_site !== false,
        interest_enterprise_support: data.strategic_collaboration_enterprise_support !== false,
        interest_framework_conditions: data.strategic_collaboration_framework_conditions !== false,
        interest_strategic_cooperation: data.strategic_collaboration_strategic_cooperation !== false,
        message: combinedMessage,
        requested_modules: [],
        plan_requested: planRequested,
        base_price_cents: data.base_price != null ? Math.round(Number(data.base_price) * 100) : null,
        seats_requested: data.seats ?? null,
        seats_included: data.seats_included ?? null,
        seat_price_cents: data.extra_seat_price != null ? Math.round(Number(data.extra_seat_price) * 100) : null,
        selected_addons: Array.isArray(data.addons) ? data.addons : [],
        monthly_estimate_cents: data.monthly_estimate != null ? Math.round(Number(data.monthly_estimate) * 100) : null,
        onetime_estimate_cents: data.onetime_estimate != null ? Math.round(Number(data.onetime_estimate) * 100) : null,
        street: data.street || null,
        city: data.city || null,
        vat_id: data.vat_id || null,
        expected_start_date: expectedStart,
        submitted_ip: req.ip || null,
        submitted_user_agent: String(req.headers["user-agent"] || "").slice(0, 240) || null
      });

      res.locals.audit = {
        action: "enterprise.request_submit_persisted",
        entity_type: "strategic_collaboration_request",
        entity_id: row.id,
        details: {
          status: row.status,
          request_type: row.request_type,
          plan_requested: row.plan_requested,
          logged_in: !!userId
        }
      };

      const costPreviewDocument = await createPublicCostPreviewForEnterpriseRequest(pool, {
        row,
        data,
        userId,
        logger
      });

      // Welle 8 Schritt 15: Staff-Notification (in-app + Mail) im Hintergrund.
      // Mail-Failures duerfen die Submission NICHT abbrechen.
      Promise.resolve()
        .then(() => notifyEnterpriseRequestReceived(pool, {
          requestId: row.id,
          companyName: row.requester_company_name,
          contactName: row.contact_name,
          contactEmail: row.contact_email,
          planRequested: row.plan_requested,
          monthlyEstimateCents: row.monthly_estimate_cents,
          seatsRequested: row.seats_requested
        }, { sendMail, logger }))
        .catch((err) => { try { logger?.warn?.({ err: err && err.message }, "enterprise_request notify hook failed"); } catch { /* noop */ } });

      return res.status(201).json({
        success: true,
        ok: true,
        captured: true,
        data: {
          id: row.id,
          status: row.status,
          request_type: row.request_type,
          created_at: row.created_at,
          cost_preview_document: costPreviewDocument
        }
      });
    } catch (e) {
      if (e?.code === "RATE_LIMITED") {
        return res.status(429).json({
          error: "RATE_LIMITED",
          message: "Zu viele Anfragen in kurzer Zeit. Bitte spaeter erneut versuchen."
        });
      }
      if (e?.code === "DUPLICATE_OPEN_REQUEST") {
        return res.status(409).json({
          error: "DUPLICATE_OPEN_REQUEST",
          message: "Es laeuft bereits eine offene Anfrage zu dieser E-Mail. Wir melden uns in Kuerze.",
          existing_id: e.existing_id
        });
      }
      throw e;
    }
  });

  return router;
}

async function createPublicCostPreviewForEnterpriseRequest(pool, { row, data, userId, logger }) {
  try {
    const addons = Array.isArray(data.addons) ? data.addons.map((addon) => ({
      key: String(addon.id || "").slice(0, 40),
      name: addon.name || addon.id || "Add-on",
      price_cents: Number.isFinite(Number(addon.price)) ? Math.round(Number(addon.price) * 100) : null,
      interval: addon.type === "onetime" ? "onetime" : "monthly"
    })).filter((addon) => addon.key) : [];
    const snapshot = {
      enterprise_request_id: row.id,
      source_context: "enterprise_request",
      public_preview: true,
      public_download_allowed: true,
      desired_plan: row.plan_requested || "INDIVIDUELL",
      plan_display_label: "Individueller Tarif",
      selected_addons: addons,
      total_cents: Number.isFinite(row.monthly_estimate_cents) ? row.monthly_estimate_cents : cents(data.monthly_estimate),
      onetime_estimate_cents: Number.isFinite(row.onetime_estimate_cents) ? row.onetime_estimate_cents : cents(data.onetime_estimate),
      seats_requested: row.seats_requested ?? data.seats ?? null,
      seats_included: row.seats_included ?? data.seats_included ?? null,
      seat_price_cents: Number.isFinite(row.seat_price_cents) ? row.seat_price_cents : cents(data.extra_seat_price),
      requester_company_name: row.requester_company_name || data.company || null,
      contact_name: row.contact_name || data.contact || null,
      contact_email: row.contact_email || data.email || null,
      contact_phone: row.contact_phone || data.phone || null,
      street: row.street || data.street || null,
      city: row.city || data.city || null,
      vat_id: row.vat_id || data.vat_id || null,
      expected_start_date: row.expected_start_date || data.expected_start || null
    };
    const result = await subscriptionDocs.generateDocument(pool, {
      documentType: "cost_preview",
      actorUserId: userId || null,
      dataOverride: snapshot
    });
    if (!result.ok) {
      try { logger?.warn?.({ error: result.error, request_id: row.id }, "enterprise cost preview generation skipped"); } catch { /* noop */ }
      return null;
    }
    return {
      id: result.row.id,
      document_number: result.row.document_number,
      format: result.row.format || "html",
      download_url: `/api/subscription-documents/${result.row.id}/public-download`
    };
  } catch (err) {
    try { logger?.warn?.({ err: err && err.message, request_id: row?.id }, "enterprise cost preview generation failed"); } catch { /* noop */ }
    return null;
  }
}

function cents(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
