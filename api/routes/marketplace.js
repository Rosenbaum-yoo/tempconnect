/**
 * Two-Sided Marketplace: capacity_posts, demand_requests, matches.
 * Plan-Gating: sla_access für Erstellung; Pulse nur PLUS/PRO.
 */

import { z } from "zod";
import { Router } from "express";
import * as marketplaceService from "../services/marketplaceService.js";
import * as emergencyService from "../services/emergencyStaffingService.js";
import * as capacityExchangeService from "../services/capacityExchangeService.js";
import * as matchingEngine from "../services/matchingEngine.js";
import * as dealProgressHelper from "../services/dealProgressHelper.js";
import * as eventTracking from "../services/eventTrackingService.js";
import { dispatch } from "../services/notificationMatrix.js";
import { scheduleMatchTrigger } from "../services/matchTriggerService.js";
import { attachExplanations } from "../services/matchExplanationService.js";
import { BRANDING } from "../config/branding.js";
import { canAccessAsOwner } from "../utils/ownerCheck.js";
import { withTransaction } from "../utils/transaction.js";
import { canInteractWithDemand } from "../services/capacityInteractionPolicy.js";
import * as dealAgreementService from "../services/dealAgreementService.js";
import { renderConditionsSheet, renderAgreementDocument } from "../services/agreementDocumentService.js";
import * as dealDossierService from "../services/dealDossierService.js";
import * as dealStaffingFastTrackService from "../services/dealStaffingFastTrackService.js";
import * as assignmentStaffingService from "../services/assignmentStaffingService.js";
import * as dealCommitmentService from "../services/dealCommitmentService.js";
import * as workerNotifications from "../services/workerNotificationService.js";
import { swallow } from "../utils/logger.js";
import {
  buildDealHistoryBucketSql,
  buildDealHistorySortSql,
  getDealHistoryBucket,
  normalizeDealHistoryBucket
} from "../services/dealHistoryService.js";

// Welle 7 – Phase 6+7+8: Schema fuer One-click-/Bulk-Zuweisung aus der Dealakte.
const offerQuickAssignSchema = z.object({
  worker_user_ids: z.array(z.string().uuid()).min(1).max(20),
  client_name: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable()
});

const capacityPostSchema = z.object({
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
  is_search_agent: z.boolean().optional().default(false),
  // Neue Felder fuer professionelle Kapazitaetseinstellung
  shift_model: z.enum(["day", "night", "rotating", "flexible", "weekend", "on_call"]).optional().nullable(),
  employment_type: z.enum(["temporary", "contract", "temp_to_perm", "project", "on_call"]).optional().nullable(),
  qualifications: z.string().max(2000).optional().nullable(),
  certifications: z.string().max(1000).optional().nullable(),
  description: z.string().max(5000).optional().nullable()
});

const offerSchema = z.object({
  price_type: z.enum(["hourly", "daily", "fixed"]).optional().nullable(),
  price_value: z.number().optional().nullable(),
  price_min: z.number().optional().nullable(),
  price_max: z.number().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  attachments: z.array(z.string()).optional().nullable(),
  terms: z.string().max(5000).optional().nullable(),
  // Neue Felder
  offered_quantity: z.number().int().min(1).optional().nullable(),
  offered_hourly_rate: z.number().min(0).optional().nullable(),
  start_confirmed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  surcharges: z.object({
    night: z.number().optional(),
    weekend: z.number().optional(),
    holiday: z.number().optional()
  }).optional().nullable(),
  min_hours_per_shift: z.number().min(0).optional().nullable(),
  billing_unit: z.enum(["hourly", "daily", "weekly", "monthly"]).optional().nullable(),
  validity_until: z.string().optional().nullable(),
  replacement_sla_minutes: z.number().int().min(0).optional().nullable(),
  response_time_minutes: z.number().int().min(0).optional().nullable(),
  contact_name: z.string().max(200).optional().nullable(),
  contact_phone: z.string().max(50).optional().nullable(),
  compliance_check: z.object({
    qualification_met: z.boolean().optional(),
    proofs_available: z.boolean().optional(),
    ppe_required: z.boolean().optional()
  }).optional().nullable(),
  cancellation_policy: z.object({
    notice_hours: z.number().optional(),
    penalty_percent: z.number().optional()
  }).optional().nullable()
});

const demandRequestSchema = z.object({
  title: z.string().min(1).max(200),
  role: z.string().min(1).max(120),
  skill_tags: z.array(z.string().max(80)).optional().default([]),
  headcount: z.number().int().min(1).max(999).optional().default(1),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  location_city: z.string().min(1).max(120),
  location_postal: z.string().max(20).optional().nullable(),
  location_lat: z.number().optional().nullable(),
  location_lng: z.number().optional().nullable(),
  radius_km: z.number().int().min(1).max(500).optional().default(25),
  shifts: z.record(z.unknown()).optional().nullable(),
  requirements: z.record(z.unknown()).optional().nullable(),
  urgency: z.enum(["normal", "plus", "notdienst"]).optional().default("normal"),
  budget_min: z.number().optional().nullable(),
  budget_max: z.number().optional().nullable(),
  sla_minutes: z.number().int().min(15).max(10080).optional().nullable()
});

const demandInteractionSchema = z.object({
  interaction_type: z.enum(["interest", "offer_request", "question", "save", "requisition_link", "deal_start", "contact", "deal_accept", "deal_negotiate"]),
  message: z.string().max(2000).optional().nullable(),
  requisition_id: z.string().uuid().optional().nullable()
});

const signaturePrepareSchema = z.object({
  provider: z.string().max(80).optional().nullable(),
  reference: z.string().max(200).optional().nullable()
});

function normalizeDealHeadcount(value, fallback = 1) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.max(1, Math.trunc(parsed));
  }
  const fallbackParsed = Number(fallback);
  if (Number.isFinite(fallbackParsed) && fallbackParsed > 0) {
    return Math.max(1, Math.trunc(fallbackParsed));
  }
  return 1;
}

function normalizeCollectionInteger(value, fallback, { min = 0, max = 100 } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed)) {
    return Math.min(max, Math.max(min, parsed));
  }
  return fallback;
}

function normalizeDealSearchTerm(value) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, 120)
    : "";
}

function buildMyDealsSearchClause(params, searchTerm) {
  const normalizedSearch = normalizeDealSearchTerm(searchTerm);
  if (!normalizedSearch) {
    return { clause: "", params, search: "" };
  }
  const placeholder = `$${params.length + 1}`;
  return {
    clause: ` AND (
      COALESCE(o.agreement_ref, '') ILIKE ${placeholder}
      OR COALESCE(d.title, '') ILIKE ${placeholder}
      OR COALESCE(d.role, '') ILIKE ${placeholder}
      OR COALESCE(d.location_city, '') ILIKE ${placeholder}
      OR COALESCE(du.company_name, '') ILIKE ${placeholder}
      OR COALESCE(su.company_name, '') ILIKE ${placeholder}
      OR COALESCE(cp.title, '') ILIKE ${placeholder}
      OR COALESCE(cp.role, '') ILIKE ${placeholder}
      OR COALESCE(cp.location_city, '') ILIKE ${placeholder}
    )`,
    params: [...params, `%${normalizedSearch}%`],
    search: normalizedSearch
  };
}

function buildMyDealsActionRequiredSql(userPlaceholder, { offerAlias = "o", demandAlias = "d" } = {}) {
  const agreementStatus = `COALESCE(NULLIF(${offerAlias}.agreement_status, ''), 'none')`;
  return `CASE
    WHEN ${offerAlias}.status IN ('rejected','withdrawn') THEN FALSE
    WHEN ${agreementStatus} IN ('activated','cancelled','expired') THEN FALSE
    WHEN ${offerAlias}.status = 'sent' THEN ${demandAlias}.requester_company_id = ${userPlaceholder}
    WHEN ${offerAlias}.status = 'countered' THEN ${offerAlias}.supplier_company_id = ${userPlaceholder}
    WHEN ${agreementStatus} = 'pending_confirmation' THEN ${offerAlias}.supplier_company_id = ${userPlaceholder}
    WHEN ${agreementStatus} = 'confirmed' THEN ${demandAlias}.requester_company_id = ${userPlaceholder}
    WHEN ${offerAlias}.status = 'accepted' AND ${agreementStatus} = 'none' THEN ${demandAlias}.requester_company_id = ${userPlaceholder}
    ELSE FALSE
  END`;
}

function normalizeDemandRemainingOpenCount(demand) {
  const totalHeadcount = normalizeDealHeadcount(demand?.required_total_count ?? demand?.headcount, 1);
  const remaining = Number(demand?.remaining_open_count);
  if (Number.isFinite(remaining)) {
    return Math.max(0, Math.trunc(remaining));
  }
  const committed = Number(demand?.currently_committed_count ?? demand?.committed_headcount);
  const committedHeadcount = Number.isFinite(committed) ? Math.max(0, Math.trunc(committed)) : 0;
  return Math.max(totalHeadcount - committedHeadcount, 0);
}

function isDemandCommerciallyOpen(demand) {
  return ["open", "partially_covered"].includes(demand?.status) && normalizeDemandRemainingOpenCount(demand) > 0;
}

function describeDemandReopen(demand) {
  if (!demand || demand.is_capacity_origin) return null;
  const status = demand.commercial_status || demand.status;
  const remainingOpenCount = normalizeDemandRemainingOpenCount(demand);
  if (!["open", "partially_covered"].includes(status) || remainingOpenCount <= 0) return null;
  return remainingOpenCount === 1
    ? "Bedarf ist wieder mit 1 offener Position sichtbar."
    : `Bedarf ist wieder mit ${remainingOpenCount} offenen Positionen sichtbar.`;
}

function describeCapacityReopen(full, capacity) {
  if (!capacity) return null;
  const status = capacity.commercial_status || capacity.status;
  const remainingHeadcount = Math.max(0, Number(capacity.remaining_headcount ?? capacity.capacity_remaining_headcount) || 0);
  if (status !== "active" || remainingHeadcount <= 0) return null;
  const label = full?.capacity_title ? `Personalangebot "${full.capacity_title}"` : "Personalangebot";
  return remainingHeadcount === 1
    ? `${label} ist wieder mit 1 offenem Platz sichtbar.`
    : `${label} ist wieder mit ${remainingHeadcount} offenen Plätzen sichtbar.`;
}

function capacityUnavailable(requestedHeadcount, remainingHeadcount) {
  return {
    error: "CAPACITY_UNAVAILABLE",
    requested_headcount: requestedHeadcount,
    remaining_headcount: Math.max(0, Number(remainingHeadcount) || 0)
  };
}

function summarizeCapacityDealState(capacityHeadcount, rawState) {
  const totalHeadcount = Math.max(0, Number(capacityHeadcount) || 0);
  const committedHeadcount = Math.max(0, Number(rawState?.committed_headcount) || 0);
  const assignedHeadcount = Math.max(0, Number(rawState?.assigned_headcount) || 0);
  const staffingReservedHeadcount = Math.max(0, Number(rawState?.staffing_reserved_headcount) || 0);
  const activeOfferCount = Math.max(0, Number(rawState?.active_offer_count) || 0);
  const remainingHeadcount = Math.max(totalHeadcount - committedHeadcount, 0);
  const hasActiveDeal = committedHeadcount > 0;
  const isPartiallyCommitted = hasActiveDeal && remainingHeadcount > 0;
  const isFullyCommitted = hasActiveDeal && remainingHeadcount === 0;

  return {
    capacity_committed_headcount: committedHeadcount,
    capacity_remaining_headcount: remainingHeadcount,
    capacity_assigned_headcount: assignedHeadcount,
    capacity_staffing_reserved_headcount: staffingReservedHeadcount,
    capacity_active_offer_count: activeOfferCount,
    capacity_has_active_deal: hasActiveDeal,
    capacity_is_partially_committed: isPartiallyCommitted,
    capacity_is_fully_committed: isFullyCommitted,
    capacity_commercial_status: isFullyCommitted ? "reserved" : isPartiallyCommitted ? "partially_committed" : "open"
  };
}

async function getLockedCapacityPost(client, capacityPostId) {
  const { rows } = await client.query(
    `SELECT cp.*, u.company_name AS supplier_company_name
     FROM capacity_posts cp
     JOIN users u ON u.id = cp.supplier_company_id
     WHERE cp.id = $1
     FOR UPDATE OF cp`,
    [capacityPostId]
  );
  return rows[0] || null;
}

/**
 * @param {{ pool, requireAuth, requireFeature, sendMail, getUserAndPlan, logger }} deps
 */
/**
 * Storno-Angaben (P8 Welle A). `reason_code` ist Pflicht und geschlossen;
 * `note` ist der Freitext fuer Menschen und bleibt bewusst optional.
 */
const cancelAgreementSchema = z.object({
  reason_code: z.enum(["customer_cancelled", "worker_sick", "worker_quit", "date_moved", "mistake", "other"]),
  note: z.string().max(2000).optional().nullable()
});

export function createMarketplaceRouter(deps) {
  const { pool, requireAuth, requireFeature, sendMail, getUserAndPlan, logger } = deps;
  const router = Router();
  const slaAccess = requireFeature("sla_access");

  /* ── capacity_posts (Zeitarbeit = Supplier) ───────────────── */

  router.get("/marketplace/capacity-posts", requireAuth, slaAccess, async (req, res) => {
    try {
      const opts = {
        supplier_company_id: req.query.supplier_id || (req.query.mine === "1" ? req.session.userId : undefined),
        location_city: req.query.city || undefined,
        role: req.query.role || undefined,
        limit: Math.min(100, parseInt(req.query.limit, 10) || 50)
      };
      const rows = await marketplaceService.listCapacityPosts(pool, opts);
      res.json(rows);
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/capacity-posts");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // Signaturstrecke vorbereiten — nur Requester, nur bestaetigte Vereinbarung
  router.post("/marketplace/offers/:id/prepare-signature", requireAuth, slaAccess, async (req, res) => {
    try {
      const full = await dealAgreementService.getAgreementDetails(pool, req.params.id);
      if (!full) return res.status(404).json({ error: "NOT_FOUND" });
      if (!await canAccessAsOwner(pool, full.requester_company_id, req.session.userId)) {
        return res.status(403).json({ error: "FORBIDDEN", message: "Nur der Anfragende darf die Signaturstrecke vorbereiten." });
      }

      const parsed = signaturePrepareSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const result = await dealAgreementService.prepareSignature(pool, req.params.id, req.session.userId, parsed.data);
      if (result.error) {
        const status = result.error === "NOT_FOUND" ? 404 : 409;
        return res.status(status).json(result);
      }

      res.locals.audit = {
        action: "deal.agreement_signature_prepared",
        entity_type: "offer",
        entity_id: req.params.id,
        details: {
          signature_provider: result.offer.signature_provider,
          signature_reference: result.offer.signature_reference
        }
      };

      try {
        await dispatch(pool, "deal.agreement_signature_prepared", {
          recipientUserIds: full?.supplier_company_id ? [full.supplier_company_id] : [],
          entityType: "offer",
          entityId: req.params.id,
          message: "Signaturstrecke vorbereitet – weitere Provider-Integration kann folgen."
        });
      } catch { /* non-critical */ }

      res.json(result);
    } catch (e) {
      logger.error({ err: e }, "POST /marketplace/offers/:id/prepare-signature");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/marketplace/capacity-posts", requireAuth, slaAccess, async (req, res) => {
    try {
      const me = await getUserAndPlan(req.session.userId);
      if (me?.role !== "agency") return res.status(403).json({ error: "AGENCY_ONLY" });
      const parsed = capacityPostSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      // Worker-Limit pro Vermittlung
      const wLimit = me?.limits?.max_workers_per_request;
      if (wLimit !== undefined && wLimit !== -1 && (parsed.data.headcount || 1) > wLimit) {
        return res.status(403).json({ error: "WORKER_LIMIT_EXCEEDED", limit: wLimit, requested: parsed.data.headcount || 1, plan: me.plan });
      }
      const row = await marketplaceService.createCapacityPost(pool, req.session.userId, parsed.data);
      res.locals.audit = { action: "marketplace.capacity_post.create", entity_type: "capacity_post", entity_id: row.id, details: { role: parsed.data.role, city: parsed.data.location_city } };

      // Instant-Matching (P4.1): dieser Pfad hatte bisher gar keinen Trigger — ein neues
      // Angebot blieb unsichtbar, bis jemand von Hand suchte.
      scheduleMatchTrigger(pool, { sourceType: "capacity_post", sourceId: row.id });

      res.status(201).json(row);
    } catch (e) {
      logger.error({ err: e }, "POST /marketplace/capacity-posts");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Premium-Anzeige (einmalige In-App-Gebuehr, auf naechster Monatsrechnung) ─── */

  router.get("/marketplace/premium/price", requireAuth, async (_req, res) => {
    const { PREMIUM_LISTING } = await import("../config/planCatalog.js");
    res.json({
      price_cents: PREMIUM_LISTING.price_cents,
      notdienst_price_cents: PREMIUM_LISTING.notdienst_price_cents,
      duration_days: PREMIUM_LISTING.duration_days,
      currency: "EUR"
    });
  });

  router.post("/marketplace/premium/feature", requireAuth, slaAccess, async (req, res) => {
    try {
      const schema = z.object({
        listing_type: z.enum(["capacity", "demand"]),
        listing_id: z.string().uuid(),
        confirmed: z.literal(true)
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const { featureListing } = await import("../services/premiumListingService.js");
      const result = await featureListing(pool, {
        listingType: parsed.data.listing_type,
        listingId: parsed.data.listing_id,
        userId: req.session.userId,
        orgId: req.orgId || null
      });
      if (!result.ok) {
        const statusMap = { NOT_FOUND: 404, ALREADY_FEATURED: 409, ORG_CONTEXT_REQUIRED: 400, VALIDATION: 400 };
        return res.status(statusMap[result.error] || 400).json({ error: result.error, featured_until: result.featured_until || null });
      }
      res.locals.audit = {
        action: "marketplace.premium_listing.purchase",
        entity_type: parsed.data.listing_type === "capacity" ? "capacity_post" : "demand_request",
        entity_id: parsed.data.listing_id,
        details: { amount_cents: result.price_cents, charge_id: result.charge.id, featured_until: result.featured_until }
      };
      res.status(201).json({
        success: true,
        featured_until: result.featured_until,
        amount_cents: result.price_cents,
        billing: "Die Gebuehr wird Ihrer naechsten Monatsrechnung hinzugefuegt."
      });
    } catch (e) {
      logger.error({ err: e }, "POST /marketplace/premium/feature");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Capacity Deal: Zustimmung / Verhandlung (Company → Agency) ─── */

  /**
   * accept-deal: Unternehmen stimmt Konditionen eines capacity_post zu.
   * Erzeugt Offer (sofort accepted), Agreement, reserviert capacity_post.
   */
  router.post("/marketplace/capacity-posts/:id/accept-deal", requireAuth, slaAccess, async (req, res) => {
    try {
      const me = await getUserAndPlan(req.session.userId);
      if (me?.role !== "company") return res.status(403).json({ error: "COMPANY_ONLY" });

      const result = await withTransaction(pool, async (client) => {
        const cap = await getLockedCapacityPost(client, req.params.id);
        if (!cap) return { error: "NOT_FOUND" };
        if (cap.supplier_company_id === req.session.userId) return { error: "SELF_DEAL_FORBIDDEN" };

        const capacityState = await capacityExchangeService.getCapacityCommercialState(client, cap.id);
        const remainingHeadcount = Math.max(0, Number(capacityState.remaining_headcount) || 0);
        const requestedHeadcount = normalizeDealHeadcount(req.body?.headcount, remainingHeadcount || cap.headcount || 1);

        if (cap.status !== "active") {
          return cap.status === "reserved"
            ? capacityUnavailable(requestedHeadcount, remainingHeadcount)
            : { error: "NOT_ACTIVE" };
        }
        if (remainingHeadcount < requestedHeadcount) {
          return capacityUnavailable(requestedHeadcount, remainingHeadcount);
        }

        const demandData = {
          title: `Zustimmung: ${cap.title}`,
          role: cap.role,
          skill_tags: cap.skill_tags || [],
          headcount: requestedHeadcount,
          start_date: cap.availability_from,
          end_date: cap.availability_to || null,
          location_city: cap.location_city,
          location_postal: cap.location_postal || null,
          location_lat: cap.location_lat ?? null,
          location_lng: cap.location_lng ?? null,
          radius_km: cap.radius_km || 25,
          urgency: "normal"
        };
        const demand = await marketplaceService.createDemandRequest(client, req.session.userId, me?.plan || "FREE", demandData);

        const { rows: offerRows } = await client.query(
          `INSERT INTO offers
           (demand_request_id, supplier_company_id, capacity_post_id, status,
            price_type, price_min, price_max, offered_quantity, start_confirmed, end_date, notes)
           VALUES ($1, $2, $3, 'accepted', $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            demand.id,
            cap.supplier_company_id,
            cap.id,
            cap.price_type || null,
            cap.price_min ?? null,
            cap.price_max ?? null,
            requestedHeadcount,
            cap.availability_from || null,
            cap.availability_to || null,
            `Zustimmung zu Kapazitaetsangebot: ${cap.title}`
          ]
        );
        const offer = offerRows[0];

        const agreementResult = await dealAgreementService.createAgreement(client, offer.id, req.session.userId);
        if (agreementResult?.error) {
          const err = new Error(agreementResult.error);
          err.code = agreementResult.error;
          err.payload = agreementResult;
          throw err;
        }
        const syncedDemand = await marketplaceService.syncDemandCommercialState(client, demand.id);

        const syncedCapacity = await capacityExchangeService.syncCapacityCommercialState(client, cap.id);
        return {
          cap,
          demand: syncedDemand || demand,
          offer: agreementResult.offer || offer,
          agreement_ref: agreementResult.agreement_ref || null,
          requested_headcount: requestedHeadcount,
          remaining_headcount: syncedCapacity?.remaining_headcount ?? Math.max(remainingHeadcount - requestedHeadcount, 0),
          capacity_status: syncedCapacity?.status || cap.status
        };
      });

      if (result.error === "NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
      if (result.error === "SELF_DEAL_FORBIDDEN") return res.status(403).json({ error: "SELF_DEAL_FORBIDDEN" });
      if (result.error === "NOT_ACTIVE") return res.status(409).json({ error: "NOT_ACTIVE" });
      if (result.error === "CAPACITY_UNAVAILABLE") return res.status(409).json(result);

      // 5) Audit + Notification
      res.locals.audit = {
        action: "capacity.deal_accepted",
        entity_type: "capacity_post",
        entity_id: result.cap.id,
        details: { offer_id: result.offer.id, demand_id: result.demand.id, agreement_ref: result.agreement_ref }
      };

      try {
        await dispatch(pool, "capacity.deal_accepted", {
          recipientUserIds: [result.cap.supplier_company_id],
          entityType: "offer",
          entityId: result.offer.id,
          message: `Unternehmen ${me?.company_name || ""} hat Ihr Angebot "${result.cap.title}" angenommen. Einsatzvereinbarung ${result.agreement_ref || ""} erstellt.`
        });
      } catch { /* non-critical */ }

      // E-Mail an Zeitarbeitsfirma: Deal angenommen
      try {
        const { rows: supplierRows } = await pool.query("SELECT email, company_name FROM users WHERE id = $1", [result.cap.supplier_company_id]);
        const supplier = supplierRows[0];
        if (supplier?.email) {
          const baseUrl = process.env.BASE_URL || "https://tempconnect.de";
          await sendMail({
            to: supplier.email,
            subject: `Deal angenommen: ${result.cap.title} \u2013 Einsatzvereinbarung ${result.agreement_ref || ""}`,
            html: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1d24">
              <div style="padding:20px 24px;background:linear-gradient(135deg,#4a9eff,#7c5cff);border-radius:12px 12px 0 0">
                <div style="display:flex;align-items:center;gap:10px"><div style="width:12px;height:12px;border-radius:50%;background:#fff"></div><span style="font-size:18px;font-weight:800;color:#fff">TempConnect</span></div>
              </div>
              <div style="padding:24px;background:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
                <h2 style="margin:0 0 8px;font-size:20px;color:#065f46">\u2705 Konditionen zugestimmt</h2>
                <p style="color:#64748b;margin:0 0 20px">Ein Unternehmen hat Ihrem Kapazit\u00e4tsangebot zugestimmt und eine Einsatzvereinbarung erstellt.</p>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px">
                  <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Deal-Details</div>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                    <div><div style="font-size:10px;color:#94a3b8">Angebot</div><div style="font-weight:700">${result.cap.title}</div></div>
                    <div><div style="font-size:10px;color:#94a3b8">Unternehmen</div><div style="font-weight:700">${me?.company_name || "\u2014"}</div></div>
                    <div><div style="font-size:10px;color:#94a3b8">Referenz</div><div style="font-weight:700;color:#4a9eff">${result.agreement_ref || "\u2014"}</div></div>
                    <div><div style="font-size:10px;color:#94a3b8">Personen</div><div style="font-weight:700">${result.requested_headcount || 1}</div></div>
                  </div>
                </div>
                <div style="text-align:center;margin:24px 0">
                  <a href="${baseUrl}/public/offer_detail.html?id=${result.offer.id}" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#4a9eff,#7c5cff);color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px">Dealakte \u00f6ffnen</a>
                </div>
                <p style="font-size:12px;color:#94a3b8;text-align:center">N\u00e4chster Schritt: Einsatzvereinbarung best\u00e4tigen und Worker zuweisen.</p>
              </div>
            </div>`
          });
        }
      } catch { /* E-Mail-Fehler ist non-critical */ }

      // Einsatzbestaetigungs-Dokument-URL
      const documentUrl = result.offer.id
        ? `/api/marketplace/offers/${result.offer.id}/document?type=agreement`
        : null;

      res.status(201).json({
        offer: result.offer,
        agreement_ref: result.agreement_ref || null,
        demand_id: result.demand.id,
        capacity_post_id: result.cap.id,
        requested_headcount: result.requested_headcount,
        remaining_headcount: result.remaining_headcount,
        status: result.capacity_status || "reserved",
        document_url: documentUrl,
        conditions_url: result.offer.id ? `/api/marketplace/offers/${result.offer.id}/document?type=conditions` : null
      });
    } catch (e) {
      if (e?.code === "AGREEMENT_ALREADY_EXISTS" || e?.code === "OFFER_NOT_ACCEPTED") {
        return res.status(409).json(e.payload || { error: e.code });
      }
      logger.error({ err: e }, "POST /marketplace/capacity-posts/:id/accept-deal");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /**
   * negotiate-deal: Unternehmen bittet um Verhandlung zu einem capacity_post.
   * Erzeugt Offer mit Status 'sent', startet den Counter-Flow.
   */
  router.post("/marketplace/capacity-posts/:id/negotiate-deal", requireAuth, slaAccess, async (req, res) => {
    try {
      const me = await getUserAndPlan(req.session.userId);
      if (me?.role !== "company") return res.status(403).json({ error: "COMPANY_ONLY" });

      // Body: optionale Anpassungswünsche
      const body = req.body || {};

      const result = await withTransaction(pool, async (client) => {
        const cap = await getLockedCapacityPost(client, req.params.id);
        if (!cap) return { error: "NOT_FOUND" };
        if (cap.supplier_company_id === req.session.userId) return { error: "SELF_DEAL_FORBIDDEN" };

        const capacityState = await capacityExchangeService.getCapacityCommercialState(client, cap.id);
        const remainingHeadcount = Math.max(0, Number(capacityState.remaining_headcount) || 0);
        const requestedHeadcount = normalizeDealHeadcount(body.headcount, remainingHeadcount || cap.headcount || 1);

        if (cap.status !== "active") {
          return cap.status === "reserved"
            ? capacityUnavailable(requestedHeadcount, remainingHeadcount)
            : { error: "NOT_ACTIVE" };
        }
        if (remainingHeadcount < requestedHeadcount) {
          return capacityUnavailable(requestedHeadcount, remainingHeadcount);
        }

        const demandData = {
          title: `Verhandlung: ${cap.title}`,
          role: cap.role,
          skill_tags: cap.skill_tags || [],
          headcount: requestedHeadcount,
          start_date: body.start_date || cap.availability_from,
          end_date: body.end_date || cap.availability_to || null,
          location_city: cap.location_city,
          radius_km: cap.radius_km || 25,
          urgency: "normal"
        };
        const demand = await marketplaceService.createDemandRequest(client, req.session.userId, me?.plan || "FREE", demandData);

        const { rows: offerRows } = await client.query(
          `INSERT INTO offers
           (demand_request_id, supplier_company_id, capacity_post_id, status, price_type, price_min, price_max,
            offered_quantity, start_confirmed, end_date, notes)
           VALUES ($1, $2, $3, 'sent', $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            demand.id,
            cap.supplier_company_id,
            cap.id,
            body.price_type || cap.price_type || null,
            body.price_min ?? cap.price_min ?? null,
            body.price_max ?? cap.price_max ?? null,
            requestedHeadcount,
            body.start_date || cap.availability_from,
            body.end_date || cap.availability_to || null,
            body.message || `Verhandlungsanfrage zu: ${cap.title}`
          ]
        );
        return {
          cap,
          demand,
          offer: offerRows[0],
          requested_headcount: requestedHeadcount,
          remaining_headcount: remainingHeadcount
        };
      });

      if (result.error === "NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
      if (result.error === "SELF_DEAL_FORBIDDEN") return res.status(403).json({ error: "SELF_DEAL_FORBIDDEN" });
      if (result.error === "NOT_ACTIVE") return res.status(409).json({ error: "NOT_ACTIVE" });
      if (result.error === "CAPACITY_UNAVAILABLE") return res.status(409).json(result);

      // 3) Audit + Notification
      res.locals.audit = {
        action: "capacity.deal_negotiation_started",
        entity_type: "capacity_post",
        entity_id: result.cap.id,
        details: { offer_id: result.offer.id, demand_id: result.demand.id }
      };

      try {
        await dispatch(pool, "capacity.deal_negotiation_started", {
          recipientUserIds: [result.cap.supplier_company_id],
          entityType: "offer",
          entityId: result.offer.id,
          message: `Unternehmen ${me?.company_name || ""} möchte über Ihr Angebot "${result.cap.title}" verhandeln.`
        });
      } catch { /* non-critical */ }

      // E-Mail an Zeitarbeitsfirma: Verhandlungsanfrage
      try {
        const { rows: supplierRows } = await pool.query("SELECT email, company_name FROM users WHERE id = $1", [result.cap.supplier_company_id]);
        const supplier = supplierRows[0];
        if (supplier?.email) {
          const baseUrl = process.env.BASE_URL || "https://tempconnect.de";
          await sendMail({
            to: supplier.email,
            subject: `Verhandlungsanfrage: ${result.cap.title} \u2013 Unternehmen möchte Konditionen besprechen`,
            html: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1d24">
              <div style="padding:20px 24px;background:linear-gradient(135deg,#4a9eff,#7c5cff);border-radius:12px 12px 0 0">
                <div style="display:flex;align-items:center;gap:10px"><div style="width:12px;height:12px;border-radius:50%;background:#fff"></div><span style="font-size:18px;font-weight:800;color:#fff">TempConnect</span></div>
              </div>
              <div style="padding:24px;background:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
                <h2 style="margin:0 0 8px;font-size:20px;color:#0369a1">\u2709 Verhandlungsanfrage eingegangen</h2>
                <p style="color:#64748b;margin:0 0 20px">Ein Unternehmen m\u00f6chte \u00fcber Ihr Kapazit\u00e4tsangebot verhandeln.</p>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px">
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                    <div><div style="font-size:10px;color:#94a3b8">Angebot</div><div style="font-weight:700">${result.cap.title}</div></div>
                    <div><div style="font-size:10px;color:#94a3b8">Unternehmen</div><div style="font-weight:700">${me?.company_name || "\u2014"}</div></div>
                  </div>
                  ${body.message ? '<div style="margin-top:12px;padding:10px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;font-size:13px;color:#92400e">' + body.message.substring(0, 500) + '</div>' : ''}
                </div>
                <div style="text-align:center;margin:24px 0">
                  <a href="${baseUrl}/public/offer_detail.html?id=${result.offer.id}" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#4a9eff,#7c5cff);color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px">Verhandlung \u00f6ffnen</a>
                </div>
                <p style="font-size:12px;color:#94a3b8;text-align:center">Antworten Sie direkt \u00fcber die Plattform.</p>
              </div>
            </div>`
          });
        }
      } catch { /* E-Mail-Fehler ist non-critical */ }

      res.status(201).json({
        offer: result.offer,
        demand_id: result.demand.id,
        capacity_post_id: result.cap.id,
        requested_headcount: result.requested_headcount,
        remaining_headcount: result.remaining_headcount,
        status: "negotiating"
      });
    } catch (e) {
      logger.error({ err: e }, "POST /marketplace/capacity-posts/:id/negotiate-deal");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── demand_requests (Unternehmen = Requester) ───────────── */

  router.get("/marketplace/demand-requests", requireAuth, slaAccess, async (req, res) => {
    try {
      const opts = {
        requester_company_id: req.session.userId,
        status: req.query.status || undefined,
        limit: Math.min(100, parseInt(req.query.limit, 10) || 50)
      };
      const rows = await marketplaceService.listDemandRequests(pool, opts);
      res.json(rows);
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/demand-requests");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/marketplace/demand-requests", requireAuth, slaAccess, async (req, res) => {
    try {
      const me = await getUserAndPlan(req.session.userId);
      if (me?.role !== "company") return res.status(403).json({ error: "COMPANY_ONLY" });
      const urgency = (req.body?.urgency || "normal").toLowerCase();
      if (urgency === "notdienst" && !me?.limits?.notdienst) return res.status(403).json({ error: "PLAN_REQUIRED_NOTDIENST" });
      const parsed = demandRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      // Worker-Limit pro Vermittlung
      const wLimit = me?.limits?.max_workers_per_request;
      if (wLimit !== undefined && wLimit !== -1 && (parsed.data.headcount || 1) > wLimit) {
        return res.status(403).json({ error: "WORKER_LIMIT_EXCEEDED", limit: wLimit, requested: parsed.data.headcount || 1, plan: me.plan });
      }

      const plan = me?.plan ?? "FREE";
      if (urgency === "notdienst") {
        const emergencyResult = await emergencyService.createEmergencyRequest(
          pool, req.session.userId, plan, parsed.data
        );
        const demand = emergencyResult.demand;
        const events = await marketplaceService.getDemandSlaEvents(pool, demand.id);
        const matchList = await marketplaceService.getDemandMatches(pool, demand.id);
        res.locals.audit = { action: "marketplace.demand_request.create", entity_type: "demand_request", entity_id: demand.id, details: { role: parsed.data.role, urgency: parsed.data.urgency, city: parsed.data.location_city } };
        res.status(201).json({
          ...demand,
          sla_events: events,
          matches: matchList,
          emergency: {
            urgency_level: emergencyResult.urgency_level,
            urgency_config: emergencyResult.urgency_config,
            match_results: emergencyResult.match_results,
            alerted: emergencyResult.alerted
          }
        });
        return;
      }
      const demand = await marketplaceService.createDemandRequest(pool, req.session.userId, plan, parsed.data);

      if (demand.sla_status === "RUNNING") {
        await marketplaceService.recordDemandSlaStarted(pool, demand.id);
      }

      const verifiedIds = await marketplaceService.getVerifiedSupplierIds(pool);
      const { candidateCount, matchCount, matches } = await marketplaceService.runInitialMatching(pool, demand, verifiedIds);

      await marketplaceService.recordDemandMatchingAttempt(pool, demand.id, { candidateCount, matchCount });

      let notified = 0;
      const toNotify = matches.slice(0, 15);
      const notifiedIds = [];
      for (const m of toNotify) {
        const cap = m.cap;
        const { rows: userRows } = await pool.query("SELECT email, company_name FROM users WHERE id = $1", [cap.supplier_company_id]);
        const supplier = userRows[0];
        if (supplier?.email) {
          const sent = await sendMail(
            supplier.email,
            `${BRANDING.MAIL_SUBJECT_DEMAND} – Neue Nachfrage passt zu deinem Personalangebot`,
            `<h2>Neue Nachfrage im Marketplace</h2>
             <p>Eine Anfrage passt zu deinem Personalangebot.</p>
             <p><b>Nachfrage:</b> ${demand.title} – ${demand.role}, ${demand.location_city}</p>
             <p><b>Dein Angebot:</b> ${cap.title}</p>
             <p style="color:#666;font-size:12px">Hinweis: Dies ist ein ${BRANDING.SLA_SHORT}-Matching-Versuch. Es wird kein Vermittlungserfolg zugesagt. Bitte im Dashboard prüfen.</p>`
          );
          if (sent) { notified++; notifiedIds.push(cap.id); }
        }
      }
      if (notifiedIds.length > 0) {
        await marketplaceService.recordDemandNotificationSent(pool, demand.id, { notifiedCount: notified });
        await marketplaceService.markMatchesNotified(pool, demand.id, notifiedIds);
      }

      // ── Instant-Matching (P4.1) ──
      // Ersetzt die frueher hier inline gebaute In-App-Benachrichtigung: die ging nur
      // an die Anbieterseite, ohne Dedup, ohne match_alerts-Datensatz und verlinkte auf
      // die eigene Nachfrage statt auf das passende Angebot. Der Chokepoint alarmiert
      // beide Seiten mit Deep-Link auf das konkrete Gegenstueck. Die SLA-Mails oben
      // bleiben unberuehrt — anderer Kanal, andere Zusage.
      scheduleMatchTrigger(pool, { sourceType: "demand_request", sourceId: demand.id });

      if (demand.sla_due_at && new Date() <= new Date(demand.sla_due_at)) {
        await marketplaceService.markDemandSlaMet(pool, demand.id);
      }

      const events = await marketplaceService.getDemandSlaEvents(pool, demand.id);
      const matchList = await marketplaceService.getDemandMatches(pool, demand.id);
      res.locals.audit = { action: "marketplace.demand_request.create", entity_type: "demand_request", entity_id: demand.id, details: { role: parsed.data.role, urgency: parsed.data.urgency, city: parsed.data.location_city } };
      res.status(201).json({ ...demand, sla_events: events, matches: matchList });
    } catch (e) {
      logger.error({ err: e }, "POST /marketplace/demand-requests");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/marketplace/demand-requests/:id", requireAuth, slaAccess, async (req, res) => {
    try {
      const id = req.params.id;
      const row = await marketplaceService.getDemandById(pool, id);
      if (!row) return res.status(404).json({ error: "NOT_FOUND" });
      const allowed = await canAccessAsOwner(pool, row.requester_company_id, req.session.userId);
      if (!allowed) return res.status(403).json({ error: "FORBIDDEN" });
      const events = await marketplaceService.getDemandSlaEvents(pool, id);
      const matches = await marketplaceService.getDemandMatches(pool, id);

      // Match Suggestions: top matching capacity posts for this demand
      let suggested_matches = [];
      try {
        const suggestions = await matchingEngine.findMatches(pool, id, { topN: 5, minScore: 20 });
        suggested_matches = suggestions.map(m => ({
          id: m.capacity_post?.id,
          title: m.capacity_post?.title,
          role: m.capacity_post?.role,
          location_city: m.capacity_post?.location_city,
          supplier_company_id: m.capacity_post?.supplier_company_id,
          score: m.score
        }));
      } catch { /* non-critical */ }

      res.json({ ...row, sla_events: events, matches, suggested_matches });
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/demand-requests/:id");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/marketplace/demand-requests/:id/sla-report", requireAuth, slaAccess, async (req, res) => {
    try {
      const id = req.params.id;
      const row = await marketplaceService.getDemandById(pool, id);
      if (!row) return res.status(404).json({ error: "NOT_FOUND" });
      const allowed = await canAccessAsOwner(pool, row.requester_company_id, req.session.userId);
      if (!allowed) return res.status(403).json({ error: "FORBIDDEN" });
      const events = await marketplaceService.getDemandSlaEvents(pool, id);
      res.json({
        demand_request_id: row.id,
        created_at: row.created_at,
        sla_started_at: row.sla_started_at,
        sla_due_at: row.sla_due_at,
        sla_status: row.sla_status,
        sla_met_at: row.sla_met_at,
        sla_breached_at: row.sla_breached_at,
        first_matching_attempt_at: row.first_matching_attempt_at,
        first_notification_sent_at: row.first_notification_sent_at,
        sla_events: events
      });
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/demand-requests/:id/sla-report");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/marketplace/demand-requests/:id/matches", requireAuth, slaAccess, async (req, res) => {
    try {
      const id = req.params.id;
      const row = await marketplaceService.getDemandById(pool, id);
      if (!row) return res.status(404).json({ error: "NOT_FOUND" });
      const allowed = await canAccessAsOwner(pool, row.requester_company_id, req.session.userId);
      if (!allowed) return res.status(403).json({ error: "FORBIDDEN" });
      const matches = await marketplaceService.getDemandMatches(pool, id);
      res.json(attachExplanations(matches));
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/demand-requests/:id/matches");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Demand-Side Deal: Agency reagiert auf Company-Demand ──── */

  /**
   * accept-deal auf Demand: Zeitarbeitsfirma stimmt Konditionen eines Bedarfs zu.
   * Erzeugt Offer (sofort accepted) + Agreement + synchronisiert den offenen Restbedarf.
   */
  router.post("/marketplace/demand-requests/:id/accept-deal", requireAuth, slaAccess, async (req, res) => {
    try {
      const me = await getUserAndPlan(req.session.userId);
      if (me?.role !== "agency") return res.status(403).json({ error: "AGENCY_ONLY" });
      const body = req.body || {};
      const result = await withTransaction(pool, async (client) => {
        const demand = await marketplaceService.getDemandById(client, req.params.id);
        if (!demand) return { error: "NOT_FOUND" };
        if (demand.requester_company_id === req.session.userId) return { error: "SELF_DEAL_FORBIDDEN" };
        if (!isDemandCommerciallyOpen(demand)) return { error: "DEMAND_NOT_OPEN" };

        const offeredQuantity = Math.min(
          normalizeDealHeadcount(body.headcount, demand.headcount || 1),
          normalizeDemandRemainingOpenCount(demand)
        );
        if (offeredQuantity <= 0) return { error: "DEMAND_NOT_OPEN" };

        const { rows: offerRows } = await client.query(
          `INSERT INTO offers
           (demand_request_id, supplier_company_id, status,
            price_min, price_max, offered_quantity, notes)
           VALUES ($1, $2, 'accepted', $3, $4, $5, $6)
           RETURNING *`,
          [
            demand.id,
            req.session.userId,
            body.price_min ?? demand.budget_min ?? null,
            body.price_max ?? demand.budget_max ?? null,
            offeredQuantity,
            `Zustimmung zu Bedarf: ${demand.title}`
          ]
        );
        const offer = offerRows[0];

        let agreementResult = { agreement_ref: null, offer };
        try {
          agreementResult = await dealAgreementService.createAgreement(client, offer.id, demand.requester_company_id);
        } catch (agrErr) {
          logger.warn({ err: agrErr?.message }, "Agreement bei demand-accept-deal fehlgeschlagen");
        }

        const syncedDemand = await marketplaceService.syncDemandCommercialState(client, demand.id);
        return {
          demand: syncedDemand || demand,
          offer: agreementResult.offer || offer,
          agreement_ref: agreementResult.agreement_ref || null
        };
      });

      if (result.error === "NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
      if (result.error === "SELF_DEAL_FORBIDDEN") return res.status(403).json({ error: "SELF_DEAL_FORBIDDEN" });
      if (result.error === "DEMAND_NOT_OPEN") return res.status(409).json({ error: "DEMAND_NOT_OPEN" });

      // 4) Audit + Notification + E-Mail
      res.locals.audit = {
        action: "demand.deal_accepted",
        entity_type: "demand_request",
        entity_id: result.demand.id,
        details: { offer_id: result.offer.id, agreement_ref: result.agreement_ref }
      };

      try {
        await dispatch(pool, "demand.deal_accepted", {
          recipientUserIds: [result.demand.requester_company_id],
          entityType: "offer",
          entityId: result.offer.id,
          message: `${me?.company_name || "Zeitarbeitsfirma"} hat auf Ihren Bedarf "${result.demand.title}" zugestimmt. Einsatzvereinbarung ${result.agreement_ref || ""} erstellt.`
        });
        // E-Mail an Unternehmen
        const { rows: companyRows } = await pool.query("SELECT email, company_name FROM users WHERE id = $1", [result.demand.requester_company_id]);
        const company = companyRows[0];
        if (company?.email) {
          const baseUrl = process.env.BASE_URL || "https://tempconnect.de";
          await sendMail({
            to: company.email,
            subject: `Deal gestartet: ${result.demand.title} \u2013 ${result.agreement_ref || ""}`,
            html: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1d24">
              <div style="padding:20px 24px;background:linear-gradient(135deg,#4a9eff,#7c5cff);border-radius:12px 12px 0 0">
                <div style="display:flex;align-items:center;gap:10px"><div style="width:12px;height:12px;border-radius:50%;background:#fff"></div><span style="font-size:18px;font-weight:800;color:#fff">TempConnect</span></div>
              </div>
              <div style="padding:24px;background:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
                <h2 style="margin:0 0 8px;font-size:20px;color:#065f46">\u2705 Zeitarbeitsfirma hat zugestimmt</h2>
                <p style="color:#64748b;margin:0 0 20px">${me?.company_name || "Eine Zeitarbeitsfirma"} hat auf Ihren Bedarf reagiert und eine Einsatzvereinbarung erstellt.</p>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px">
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                    <div><div style="font-size:10px;color:#94a3b8">Bedarf</div><div style="font-weight:700">${result.demand.title}</div></div>
                    <div><div style="font-size:10px;color:#94a3b8">Zeitarbeitsfirma</div><div style="font-weight:700">${me?.company_name || "\u2014"}</div></div>
                    <div><div style="font-size:10px;color:#94a3b8">Referenz</div><div style="font-weight:700;color:#4a9eff">${result.agreement_ref || "\u2014"}</div></div>
                    <div><div style="font-size:10px;color:#94a3b8">Personen</div><div style="font-weight:700">${result.offer.offered_quantity || result.demand.headcount || 1}</div></div>
                  </div>
                </div>
                <div style="text-align:center;margin:24px 0">
                  <a href="${baseUrl}/public/offer_detail.html?id=${result.offer.id}" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#4a9eff,#7c5cff);color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px">Dealakte oeffnen</a>
                </div>
              </div>
            </div>`
          });
        }
      } catch { /* non-critical */ }

      const documentUrl = `/api/marketplace/offers/${result.offer.id}/document?type=agreement`;
      res.status(201).json({
        offer: result.offer,
        agreement_ref: result.agreement_ref || null,
        demand_id: result.demand.id,
        status: result.demand.status,
        remaining_open_count: normalizeDemandRemainingOpenCount(result.demand),
        document_url: documentUrl,
        conditions_url: `/api/marketplace/offers/${result.offer.id}/document?type=conditions`
      });
    } catch (e) {
      logger.error({ err: e }, "POST /marketplace/demand-requests/:id/accept-deal");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /**
   * negotiate-deal auf Demand: Zeitarbeitsfirma bittet um Verhandlung.
   * Erzeugt Offer mit Status 'sent'.
   */
  router.post("/marketplace/demand-requests/:id/negotiate-deal", requireAuth, slaAccess, async (req, res) => {
    try {
      const me = await getUserAndPlan(req.session.userId);
      if (me?.role !== "agency") return res.status(403).json({ error: "AGENCY_ONLY" });

      const demand = await marketplaceService.getDemandById(pool, req.params.id);
      if (!demand) return res.status(404).json({ error: "NOT_FOUND" });
      if (demand.requester_company_id === req.session.userId) return res.status(403).json({ error: "SELF_DEAL_FORBIDDEN" });
      if (!isDemandCommerciallyOpen(demand)) return res.status(409).json({ error: "DEMAND_NOT_OPEN" });

      const body = req.body || {};
      const { rows: offerRows } = await pool.query(
        `INSERT INTO offers
         (demand_request_id, supplier_company_id, status,
          price_min, price_max, offered_quantity,
          start_confirmed, end_date, notes)
         VALUES ($1, $2, 'sent', $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          demand.id, req.session.userId,
          body.price_min ?? demand.budget_min ?? null,
          body.price_max ?? demand.budget_max ?? null,
          Math.min(
            normalizeDealHeadcount(body.headcount, demand.headcount || 1),
            normalizeDemandRemainingOpenCount(demand)
          ),
          body.start_date || demand.start_date,
          body.end_date || demand.end_date || null,
          body.message || `Verhandlungsanfrage zu: ${demand.title}`
        ]
      );
      const offer = offerRows[0];

      res.locals.audit = {
        action: "demand.deal_negotiation_started",
        entity_type: "demand_request",
        entity_id: demand.id,
        details: { offer_id: offer.id }
      };

      try {
        await dispatch(pool, "demand.deal_negotiation_started", {
          recipientUserIds: [demand.requester_company_id],
          entityType: "offer",
          entityId: offer.id,
          message: `${me?.company_name || "Zeitarbeitsfirma"} moechte ueber Ihren Bedarf "${demand.title}" verhandeln.`
        });
      } catch { /* non-critical */ }

      res.status(201).json({
        offer,
        demand_id: demand.id,
        status: "negotiating"
      });
    } catch (e) {
      logger.error({ err: e }, "POST /marketplace/demand-requests/:id/negotiate-deal");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── offers (sla_access gated) ───────────────────────── */

  router.post("/marketplace/demand-requests/:id/offers", requireAuth, slaAccess, async (req, res) => {
    try {
      const demandId = req.params.id;
      const demand = await marketplaceService.getDemandById(pool, demandId);
      if (!demand) return res.status(404).json({ error: "NOT_FOUND" });
      if (demand.status === "fulfilled") return res.status(400).json({ error: "DEMAND_ALREADY_FULFILLED" });
      const parsed = offerSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const offer = await marketplaceService.createOffer(pool, req.session.userId, demandId, parsed.data);
      res.locals.audit = { action: "marketplace.offer.create", entity_type: "offer", entity_id: offer.id, details: { demand_request_id: demandId } };
      res.status(201).json(offer);
    } catch (e) {
      logger.error({ err: e }, "POST /marketplace/demand-requests/:id/offers");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/marketplace/demand-requests/:id/offers", requireAuth, slaAccess, async (req, res) => {
    try {
      const demandId = req.params.id;
      const demand = await marketplaceService.getDemandById(pool, demandId);
      if (!demand) return res.status(404).json({ error: "NOT_FOUND" });
      const allowed = await canAccessAsOwner(pool, demand.requester_company_id, req.session.userId);
      if (!allowed) return res.status(403).json({ error: "FORBIDDEN" });
      const offers = await marketplaceService.listOffersForDemand(pool, demandId);
      const items = offers.map((o) => ({ ...o, next_action: marketplaceService.computeOfferNextAction(o, req.session.userId) }));
      // Counterparty-first in detail view as well.
      items.sort((a, b) => {
        const ar = (x) => (x?.next_action?.viewer_state === "action_required" ? 0 : 1);
        const da = ar(a) - ar(b);
        if (da !== 0) return da;
        return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
      });
      res.json(items);
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/demand-requests/:id/offers");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.patch("/marketplace/offers/:id/status", requireAuth, slaAccess, async (req, res) => {
    try {
      const newStatus = req.body?.status;
      if (!newStatus || !["sent", "accepted", "rejected", "countered", "withdrawn"].includes(newStatus)) {
        return res.status(400).json({ error: "INVALID_STATUS" });
      }
      const result = await marketplaceService.updateOfferStatus(pool, req.params.id, newStatus, req.session.userId);
      if (result.error === "NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
      if (result.error === "FORBIDDEN") return res.status(403).json({ error: "FORBIDDEN" });
      if (result.error === "CAPACITY_UNAVAILABLE") return res.status(409).json(result);
      if (result.error === "INVALID_TRANSITION") return res.status(409).json(result);
      res.locals.audit = { action: `marketplace.offer.${newStatus}`, entity_type: "offer", entity_id: req.params.id, new_values: { status: newStatus } };

      // Counterparty-first notifications (best effort, non-blocking)
      try {
        const full = await marketplaceService.getOfferById(pool, req.params.id);
        if (newStatus === "sent") {
          await dispatch(pool, "offer.received", {
            recipientUserIds: full?.requester_company_id ? [full.requester_company_id] : [],
            entityType: "offer",
            entityId: req.params.id,
            message: "Neues Angebot erhalten – Entscheidung ausstehend."
          });
        }
        if (newStatus === "rejected") {
          await dispatch(pool, "offer.rejected", {
            recipientUserIds: full?.supplier_company_id ? [full.supplier_company_id] : [],
            entityType: "offer",
            entityId: req.params.id,
            message: "Ihr Angebot wurde abgelehnt."
          });
        }
      } catch { /* non-critical */ }
      res.json(result.offer);
    } catch (e) {
      logger.error({ err: e }, "PATCH /marketplace/offers/:id/status");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // Accept Offer (Requester) — erzeugt automatisch Agreement + Einsatzbestaetigung.
  // Demand wird aus kanonischer Commit-/Restmengen-Logik synchronisiert. E-Mail an Supplier. Document-URLs zurueckgegeben.
  router.post("/marketplace/offers/:id/accept", requireAuth, slaAccess, async (req, res) => {
    try {
      const result = await marketplaceService.acceptOffer(pool, req.params.id, req.session.userId);
      if (result.error === "NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
      if (result.error === "FORBIDDEN") return res.status(403).json({ error: "FORBIDDEN" });
      if (result.error === "CAPACITY_UNAVAILABLE") return res.status(409).json(result);
      if (result.error === "INVALID_TRANSITION") return res.status(409).json(result);
      if (result.error) return res.status(400).json(result);

      // Agreement + Einsatzbestaetigung automatisch erzeugen
      let agreementResult = { agreement_ref: null };
      try {
        agreementResult = await dealAgreementService.createAgreement(pool, req.params.id, req.session.userId);
      } catch (agrErr) {
        logger.warn({ err: agrErr?.message }, "Agreement-Erzeugung bei offer-accept fehlgeschlagen");
      }

      res.locals.audit = { action: "marketplace.offer.accept", entity_type: "offer", entity_id: req.params.id, new_values: { status: "accepted", agreement_ref: agreementResult.agreement_ref } };

      // Notification + E-Mail an Supplier
      try {
        const full = await marketplaceService.getOfferById(pool, req.params.id);
        const me = await getUserAndPlan(req.session.userId);
        await dispatch(pool, "offer.accepted", {
          recipientUserIds: full?.supplier_company_id ? [full.supplier_company_id] : [],
          entityType: "offer",
          entityId: req.params.id,
          message: `Angebot angenommen \u2013 Einsatzvereinbarung ${agreementResult.agreement_ref || ""} erstellt.`
        });

        // E-Mail an Zeitarbeitsfirma
        if (full?.supplier_company_id) {
          const { rows: supplierRows } = await pool.query("SELECT email, company_name FROM users WHERE id = $1", [full.supplier_company_id]);
          const supplier = supplierRows[0];
          if (supplier?.email) {
            const baseUrl = process.env.BASE_URL || "https://tempconnect.de";
            await sendMail({
              to: supplier.email,
              subject: `Angebot angenommen: ${full.demand_title || "Bedarf"} \u2013 ${agreementResult.agreement_ref || ""}`,
              html: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1d24">
                <div style="padding:20px 24px;background:linear-gradient(135deg,#4a9eff,#7c5cff);border-radius:12px 12px 0 0">
                  <div style="display:flex;align-items:center;gap:10px"><div style="width:12px;height:12px;border-radius:50%;background:#fff"></div><span style="font-size:18px;font-weight:800;color:#fff">TempConnect</span></div>
                </div>
                <div style="padding:24px;background:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
                  <h2 style="margin:0 0 8px;font-size:20px;color:#065f46">\u2705 Angebot angenommen</h2>
                  <p style="color:#64748b;margin:0 0 20px">${me?.company_name || "Ein Unternehmen"} hat Ihr Angebot angenommen. Eine Einsatzvereinbarung wurde erstellt.</p>
                  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                      <div><div style="font-size:10px;color:#94a3b8">Bedarf</div><div style="font-weight:700">${full.demand_title || "\u2014"}</div></div>
                      <div><div style="font-size:10px;color:#94a3b8">Referenz</div><div style="font-weight:700;color:#4a9eff">${agreementResult.agreement_ref || "\u2014"}</div></div>
                    </div>
                  </div>
                  <div style="text-align:center;margin:24px 0">
                    <a href="${baseUrl}/public/offer_detail.html?id=${req.params.id}" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#4a9eff,#7c5cff);color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px">Dealakte oeffnen</a>
                  </div>
                </div>
              </div>`
            });
          }
        }
      } catch { /* non-critical */ }

      // Document-URLs fuer Frontend-Modal
      const documentUrl = `/api/marketplace/offers/${req.params.id}/document?type=agreement`;
      const conditionsUrl = `/api/marketplace/offers/${req.params.id}/document?type=conditions`;

      const acceptedOffer = agreementResult.offer || result.offer;
      res.json({
        offer: acceptedOffer,
        agreement_ref: agreementResult.agreement_ref || null,
        document_url: documentUrl,
        conditions_url: conditionsUrl,

        // Zwei Zustaende, zwei Namen. `status` allein war mehrdeutig: es trug den
        // Status der ANFRAGE ('fulfilled', 'partially_covered', …), waehrend die
        // Antwort auf ein Angebot ergeht — Aufrufer lasen dort naheliegend den
        // Angebotsstatus und bekamen einen Wert, den ein Angebot nie annimmt.
        offer_status: acceptedOffer?.status || "accepted",
        demand_status: result.demand?.status || null,

        // Unveraendert fuer bestehende Aufrufer. Neue Integrationen nehmen
        // `offer_status` bzw. `demand_status`.
        status: result.demand?.status || "accepted",
        remaining_open_count: result.demand ? normalizeDemandRemainingOpenCount(result.demand) : null
      });
    } catch (e) {
      logger.error({ err: e }, "POST /marketplace/offers/:id/accept");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // Counter Offer (Requester)
  router.post("/marketplace/offers/:id/counter", requireAuth, slaAccess, async (req, res) => {
    try {
      const result = await marketplaceService.counterOffer(pool, req.params.id, req.session.userId, req.body);
      if (result.error === "NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
      if (result.error === "FORBIDDEN") return res.status(403).json({ error: "FORBIDDEN" });
      if (result.error === "INVALID_TRANSITION") return res.status(409).json(result);
      if (result.error) return res.status(400).json(result);
      res.locals.audit = { action: "marketplace.offer.counter", entity_type: "offer", entity_id: req.params.id };
      // Event tracking (fire-and-forget)
      eventTracking.trackEvent(pool, { event_type: 'offer_countered', actor_id: req.session.userId, entity_type: 'offer', entity_id: req.params.id }).catch(swallow("marketplace"));
      try {
        const full = await marketplaceService.getOfferById(pool, req.params.id);
        await dispatch(pool, "offer.countered", {
          recipientUserIds: full?.supplier_company_id ? [full.supplier_company_id] : [],
          entityType: "offer",
          entityId: req.params.id,
          message: "Gegenangebot erhalten \u2013 Ihre Antwort wird erwartet."
        });
      } catch { /* non-critical */ }
      res.json(result.offer);
    } catch (e) {
      logger.error({ err: e }, "POST /marketplace/offers/:id/counter");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // Withdraw Offer (Supplier)
  router.post("/marketplace/offers/:id/withdraw", requireAuth, slaAccess, async (req, res) => {
    try {
      const result = await marketplaceService.withdrawOffer(pool, req.params.id, req.session.userId);
      if (result.error === "NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
      if (result.error === "FORBIDDEN") return res.status(403).json({ error: "FORBIDDEN" });
      if (result.error === "INVALID_TRANSITION") return res.status(409).json(result);
      if (result.error) return res.status(400).json(result);
      res.locals.audit = { action: "marketplace.offer.withdraw", entity_type: "offer", entity_id: req.params.id };
      // Event tracking (fire-and-forget)
      eventTracking.trackEvent(pool, { event_type: 'offer_withdrawn', actor_id: req.session.userId, entity_type: 'offer', entity_id: req.params.id }).catch(swallow("marketplace"));
      // Counterparty notification: inform the requester about withdrawal
      try {
        const full = await marketplaceService.getOfferById(pool, req.params.id);
        await dispatch(pool, "offer.withdrawn", {
          recipientUserIds: full?.requester_company_id ? [full.requester_company_id] : [],
          entityType: "offer",
          entityId: req.params.id,
          message: "Ein Angebot wurde zur\u00fcckgezogen."
        });
      } catch { /* non-critical */ }
      res.json(result.offer);
    } catch (e) {
      logger.error({ err: e }, "POST /marketplace/offers/:id/withdraw");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── My Offers (supplier view) & Received Offers (requester view) ── */

  router.get("/marketplace/my-offers", requireAuth, slaAccess, async (req, res) => {
    try {
      const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
      const status = req.query.status || null;
      const where = status ? "AND o.status = $2" : "";
      const params = status ? [req.session.userId, status] : [req.session.userId];
      const { rows } = await pool.query(
        // `d.requester_company_id` gehoert auch hier dazu — siehe received-offers:
        // `computeOfferNextAction` braucht beide Seiten, um die Sicht zu bestimmen.
        `SELECT o.*, d.requester_company_id,
                d.title AS demand_title, d.role AS demand_role, d.location_city AS demand_city,
                u.company_name AS requester_name
         FROM offers o
         JOIN demand_requests d ON d.id = o.demand_request_id
         LEFT JOIN users u ON u.id = d.requester_company_id
         WHERE o.supplier_company_id = $1 ${where}
         ORDER BY o.created_at DESC LIMIT ${limit}`, params
      );
      const items = rows.map((o) => ({ ...o, next_action: marketplaceService.computeOfferNextAction(o, req.session.userId) }));
      // Counterparty-first sorting: action_required first, then newest updated.
      items.sort((a, b) => {
        const ar = (x) => (x?.next_action?.viewer_state === "action_required" ? 0 : 1);
        const da = ar(a) - ar(b);
        if (da !== 0) return da;
        return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
      });
      res.json({ success: true, data: { items, count: items.length } });
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/my-offers");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/marketplace/received-offers", requireAuth, slaAccess, async (req, res) => {
    try {
      const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
      const { rows } = await pool.query(
        // `d.requester_company_id` MUSS mit heraus: `computeOfferNextAction`
        // entscheidet daran, ob der Betrachter die Bestellerseite ist. Fehlte das
        // Feld, war `undefined === userId` immer falsch — der Besteller sah sein
        // eigenes Postfach als "wartet auf die Gegenseite" und bekam eine LEERE
        // Aktionsliste: kein Annehmen, kein Ablehnen, kein Gegenangebot.
        `SELECT o.*, d.requester_company_id,
                d.title AS demand_title, d.role AS demand_role, d.location_city AS demand_city,
                su.company_name AS supplier_name
         FROM offers o
         JOIN demand_requests d ON d.id = o.demand_request_id
         LEFT JOIN users su ON su.id = o.supplier_company_id
         WHERE d.requester_company_id = $1
         ORDER BY o.created_at DESC LIMIT ${limit}`, [req.session.userId]
      );
      const items = rows.map((o) => ({ ...o, next_action: marketplaceService.computeOfferNextAction(o, req.session.userId) }));
      // Counterparty-first sorting: action_required first, then newest updated.
      items.sort((a, b) => {
        const ar = (x) => (x?.next_action?.viewer_state === "action_required" ? 0 : 1);
        const da = ar(a) - ar(b);
        if (da !== 0) return da;
        return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
      });
      res.json({ success: true, data: { items, count: items.length } });
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/received-offers");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Agreement Lifecycle ───────────────────────────── */

  // Offer-Detail mit Agreement-Stand + "Wer ist am Zug?"
  router.get("/marketplace/offers/:id/detail", requireAuth, slaAccess, async (req, res) => {
    try {
      const offer = await dealAgreementService.getAgreementDetails(pool, req.params.id);
      if (!offer) return res.status(404).json({ error: "NOT_FOUND" });
      if (!await canAccessAsOwner(pool, offer.requester_company_id, req.session.userId) && !await canAccessAsOwner(pool, offer.supplier_company_id, req.session.userId)) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }
      const action = dealAgreementService.getActionRequired(offer, req.session.userId);
      res.json({ ...offer, action_required: action });
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/offers/:id/detail");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // Einsatzvereinbarung erstellen (nach Offer accepted) — nur Requester
  router.post("/marketplace/offers/:id/create-agreement", requireAuth, slaAccess, async (req, res) => {
    try {
      // Ownership: nur Requester darf Agreement erstellen
      const full = await dealAgreementService.getAgreementDetails(pool, req.params.id);
      if (!full) return res.status(404).json({ error: "NOT_FOUND" });
      if (!await canAccessAsOwner(pool, full.requester_company_id, req.session.userId)) {
        return res.status(403).json({ error: "FORBIDDEN", message: "Nur der Anfragende darf die Einsatzvereinbarung erstellen." });
      }

      const result = await dealAgreementService.createAgreement(pool, req.params.id, req.session.userId);
      if (result.error) {
        const status = result.error === "NOT_FOUND" ? 404 : result.error === "OFFER_NOT_ACCEPTED" ? 409 : 400;
        return res.status(status).json(result);
      }
      res.locals.audit = { action: "deal.agreement_created", entity_type: "offer", entity_id: req.params.id, details: { agreement_ref: result.agreement_ref } };
      try {
        await dispatch(pool, "deal.agreement_created", {
          recipientUserIds: full?.supplier_company_id ? [full.supplier_company_id] : [],
          entityType: "offer", entityId: req.params.id,
          message: `Einsatzvereinbarung ${result.agreement_ref} erstellt \u2013 Ihre Best\u00e4tigung wird erwartet.`
        });
      } catch { /* non-critical */ }
      res.json(result);
    } catch (e) {
      logger.error({ err: e }, "POST /marketplace/offers/:id/create-agreement");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // Gegenseite best\u00e4tigt — nur Supplier
  router.post("/marketplace/offers/:id/confirm-agreement", requireAuth, slaAccess, async (req, res) => {
    try {
      // Ownership: nur Supplier darf bestätigen
      const full = await dealAgreementService.getAgreementDetails(pool, req.params.id);
      if (!full) return res.status(404).json({ error: "NOT_FOUND" });
      if (!await canAccessAsOwner(pool, full.supplier_company_id, req.session.userId)) {
        return res.status(403).json({ error: "FORBIDDEN", message: "Nur die liefernde Agentur darf die Vereinbarung best\u00e4tigen." });
      }

      const result = await dealAgreementService.confirmAgreement(pool, req.params.id, req.session.userId);
      if (result.error) {
        const status = result.error === "NOT_FOUND" ? 404 : 409;
        return res.status(status).json(result);
      }
      res.locals.audit = { action: "deal.agreement_confirmed", entity_type: "offer", entity_id: req.params.id };
      try {
        await dispatch(pool, "deal.agreement_confirmed", {
          recipientUserIds: full?.requester_company_id ? [full.requester_company_id] : [],
          entityType: "offer", entityId: req.params.id,
          message: `Einsatzvereinbarung best\u00e4tigt \u2013 Aktivierung m\u00f6glich.`
        });
      } catch { /* non-critical */ }
      res.json(result);
    } catch (e) {
      logger.error({ err: e }, "POST /marketplace/offers/:id/confirm-agreement");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // Aktivierung \u2192 Assignment — nur Requester
  router.post("/marketplace/offers/:id/activate", requireAuth, slaAccess, async (req, res) => {
    try {
      // Ownership: nur Requester darf aktivieren
      const full = await dealAgreementService.getAgreementDetails(pool, req.params.id);
      if (!full) return res.status(404).json({ error: "NOT_FOUND" });
      if (!await canAccessAsOwner(pool, full.requester_company_id, req.session.userId)) {
        return res.status(403).json({ error: "FORBIDDEN", message: "Nur der Anfragende darf den Einsatz aktivieren." });
      }

      const result = await dealAgreementService.activateAgreement(pool, req.params.id, req.session.userId);
      if (result.error) {
        const status = result.error === "NOT_FOUND" ? 404 : result.error === "ALREADY_ACTIVATED" ? 409 : 409;
        return res.status(status).json(result);
      }
      res.locals.audit = { action: "deal.agreement_activated", entity_type: "offer", entity_id: req.params.id, details: { assignment_id: result.assignment?.id } };
      try {
        await dispatch(pool, "deal.agreement_activated", {
          recipientUserIds: [full?.requester_company_id, full?.supplier_company_id].filter(Boolean),
          entityType: "offer", entityId: req.params.id,
          message: `Einsatz aktiviert \u2013 Assignment #${result.assignment?.id || ""} angelegt. Die Staffing-Phase kann jetzt starten.`,
          linkPath: `/public/offer_detail.html?id=${req.params.id}`
        });
        await dealStaffingFastTrackService.dispatchStaffingReadyNotification(pool, {
          assignmentId: result.assignment?.id || null,
          offerId: req.params.id,
          supplierOrgId: result.assignment?.supplier_org_id || null,
          fallbackUserId: full?.supplier_company_id || null,
          requestedQuantity: result.assignment?.requested_quantity || result.assignment?.worker_count || full?.demand_headcount || null,
          openQuantity: result.assignment?.open_quantity || result.assignment?.requested_quantity || result.assignment?.worker_count || full?.demand_headcount || null,
          clientName: full?.requester_company_name || null,
          roleLabel: result.assignment?.worker_description || full?.demand_role || full?.demand_title || null
        });

        // E-Mail an beide Parteien: Einsatz aktiviert
        const parties = [
          { userId: full?.requester_company_id, role: "Auftraggeber" },
          { userId: full?.supplier_company_id, role: "Personaldienstleister" }
        ].filter(p => p.userId);
        const baseUrl = process.env.BASE_URL || "https://tempconnect.de";
        for (const party of parties) {
          try {
            const { rows: uRows } = await pool.query("SELECT email, company_name FROM users WHERE id = $1", [party.userId]);
            const u = uRows[0];
            if (u?.email) {
              await sendMail({
                to: u.email,
                subject: `Einsatz aktiviert: ${full.agreement_ref || ""} \u2013 Worker-Zuweisung moeglich`,
                html: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1d24">
                  <div style="padding:20px 24px;background:linear-gradient(135deg,#4a9eff,#7c5cff);border-radius:12px 12px 0 0">
                    <div style="display:flex;align-items:center;gap:10px"><div style="width:12px;height:12px;border-radius:50%;background:#fff"></div><span style="font-size:18px;font-weight:800;color:#fff">TempConnect</span></div>
                  </div>
                  <div style="padding:24px;background:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
                    <h2 style="margin:0 0 8px;font-size:20px;color:#065f46">\u2705 Einsatz aktiviert</h2>
                    <p style="color:#64748b;margin:0 0 20px">Die Einsatzvereinbarung ${full.agreement_ref || ""} wurde aktiviert. ${party.role === "Personaldienstleister" ? "Sie koennen jetzt Worker zuweisen." : "Die Zeitarbeitsfirma kann jetzt Mitarbeiter zuweisen. Sie werden benachrichtigt, sobald die Besetzung erfolgt."}</p>
                    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px">
                      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                        <div><div style="font-size:10px;color:#94a3b8">Vereinbarung</div><div style="font-weight:700;color:#4a9eff">${full.agreement_ref || "\u2014"}</div></div>
                        <div><div style="font-size:10px;color:#94a3b8">Assignment</div><div style="font-weight:700">${result.assignment?.id ? result.assignment.id.substring(0, 8) : "\u2014"}</div></div>
                        <div><div style="font-size:10px;color:#94a3b8">Rolle</div><div style="font-weight:700">${full.demand_role || "\u2014"}</div></div>
                        <div><div style="font-size:10px;color:#94a3b8">Personen</div><div style="font-weight:700">${full.demand_headcount || "\u2014"}</div></div>
                      </div>
                    </div>
                    <div style="text-align:center;margin:24px 0">
                      <a href="${baseUrl}/public/offer_detail.html?id=${req.params.id}" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#4a9eff,#7c5cff);color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px">Dealakte oeffnen</a>
                    </div>
                  </div>
                </div>`
              });
            }
          } catch { /* E-Mail non-critical */ }
        }
      } catch { /* non-critical */ }
      res.json(result);
    } catch (e) {
      logger.error({ err: e }, "POST /marketplace/offers/:id/activate");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // P8 Welle D — Vorschauen fuer die mehrstufige Bestaetigung.
  //
  // Beide sind LESEND: keine Mutation, kein Audit. Eine Vorschau ist keine
  // Handlung (gleiches Muster wie /capacity-exchange/offer-coverage). Die
  // Beteiligtenpruefung steckt im Service, damit Route und Storno-Pfad
  // dieselbe Regel benutzen und nicht auseinanderlaufen.
  router.get("/marketplace/offers/:id/commitment-preview", requireAuth, slaAccess, async (req, res) => {
    try {
      const out = await dealCommitmentService.buildCommitmentPreview(pool, req.params.id, req.session.userId);
      if (out.error) return res.status(out.error === "NOT_FOUND" ? 404 : 403).json(out);
      res.json(out);
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/offers/:id/commitment-preview");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/marketplace/offers/:id/cancellation-impact", requireAuth, slaAccess, async (req, res) => {
    try {
      const out = await dealCommitmentService.buildCancellationImpact(pool, req.params.id, req.session.userId);
      if (out.error) return res.status(out.error === "NOT_FOUND" ? 404 : 403).json(out);
      res.json(out);
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/offers/:id/cancellation-impact");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // Agreement stornieren — beide Parteien
  router.post("/marketplace/offers/:id/cancel-agreement", requireAuth, slaAccess, async (req, res) => {
    try {
      const full = await dealAgreementService.getAgreementDetails(pool, req.params.id);
      if (!full) return res.status(404).json({ error: "NOT_FOUND" });
      // Nur Beteiligte d\u00fcrfen stornieren
      if (!await canAccessAsOwner(pool, full.requester_company_id, req.session.userId) && !await canAccessAsOwner(pool, full.supplier_company_id, req.session.userId)) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }

      // P8 Welle A: Der Grund ist Pflicht und stammt aus einer geschlossenen Liste.
      // Ohne ihn liesse sich nicht unterscheiden, ob jemand unverschuldet storniert
      // (Kunde sagt ab) oder einfach besser vermittelt hat — genau diese
      // Unterscheidung traegt die Zuverlaessigkeitsquote (Welle B).
      const parsedCancel = cancelAgreementSchema.safeParse(req.body || {});
      if (!parsedCancel.success) {
        return res.status(400).json({
          error: "VALIDATION",
          allowed_reasons: dealAgreementService.CANCELLATION_REASONS,
          details: parsedCancel.error.issues
        });
      }
      // Die Seite kommt aus der Sitzung, NICHT aus dem Rumpf: wer storniert hat,
      // darf sich nicht selbst als die andere Partei ausgeben.
      const side = full.supplier_company_id === req.session.userId ? "agency" : "company";

      const result = await dealAgreementService.cancelAgreement(pool, req.params.id, req.session.userId, {
        reason_code: parsedCancel.data.reason_code,
        note: parsedCancel.data.note || null,
        side
      });
      if (result.error) {
        const status = result.error === "NOT_FOUND" ? 404
          : result.error === "REASON_REQUIRED" ? 400 : 409;
        return res.status(status).json(result);
      }
      res.locals.audit = {
        action: "deal.agreement_cancelled", entity_type: "offer", entity_id: req.params.id,
        details: { reason_code: parsedCancel.data.reason_code, side }
      };
      try {
        const counterparty = full.requester_company_id === req.session.userId
          ? full.supplier_company_id : full.requester_company_id;
        const visibilityNotes = [
          describeDemandReopen(result.demand),
          describeCapacityReopen(full, result.capacity)
        ].filter(Boolean);
        const message = [
          `Einsatzvereinbarung ${full.agreement_ref || ""} wurde storniert.`,
          ...visibilityNotes
        ].join(" ");
        await dispatch(pool, "deal.agreement_cancelled", {
          recipientUserIds: counterparty ? [counterparty] : [],
          entityType: "offer", entityId: req.params.id,
          message
        });
        eventTracking.trackEvent(pool, {
          event_type: "deal_cancelled",
          actor_id: req.session.userId,
          entity_type: "offer",
          entity_id: req.params.id,
          metadata: {
            agreement_ref: full.agreement_ref || null,
            reason: req.body?.reason || null,
            demand_status: result.demand?.commercial_status || result.demand?.status || null,
            demand_remaining_open_count: result.demand ? normalizeDemandRemainingOpenCount(result.demand) : null,
            capacity_status: result.capacity?.commercial_status || result.capacity?.status || null,
            capacity_remaining_headcount: result.capacity?.remaining_headcount ?? null
          }
        }).catch(swallow("marketplace"));
      } catch { /* non-critical */ }
      res.json(result);
    } catch (e) {
      logger.error({ err: e }, "POST /marketplace/offers/:id/cancel-agreement");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Welle 7 – Phase 6+7+8: Staffing-Block direkt in der Dealakte ── */

  // GET /marketplace/offers/:id/staffing-context
  // Aggregator: liefert der Dealakte die Daten, die sie braucht, um einen
  // kompakten Staffing-Block anzuzeigen (Assignment + Restmenge + sichere
  // One-click-Kandidaten + Notdienst-Fast-Track-Link). Greift ausschliesslich
  // auf bestehende Services zu – keine Parallelwelten.
  router.get("/marketplace/offers/:id/staffing-context", requireAuth, slaAccess, async (req, res) => {
    try {
      const offer = await dealAgreementService.getAgreementDetails(pool, req.params.id);
      if (!offer) return res.status(404).json({ error: "NOT_FOUND" });
      if (!await canAccessAsOwner(pool, offer.requester_company_id, req.session.userId) && !await canAccessAsOwner(pool, offer.supplier_company_id, req.session.userId)) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }
      const isSupplier = offer.supplier_company_id === req.session.userId;
      if (!offer.assignment_id) {
        return res.json({
          offer_id: offer.id,
          agreement_status: offer.agreement_status || "none",
          is_supplier: isSupplier,
          assignment: null,
          open_quantity: null,
          requested_quantity: offer.offered_quantity || offer.demand_headcount || null,
          safe_candidates: [],
          staffing_ready_link: null,
          staffing_fast_track_enabled: false
        });
      }
      const overview = await assignmentStaffingService.getAssignmentStaffingOverview(
        pool,
        offer.assignment_id,
        null
      );
      if (!overview?.assignment) {
        return res.json({
          offer_id: offer.id,
          agreement_status: offer.agreement_status || "none",
          is_supplier: isSupplier,
          assignment: null,
          open_quantity: null,
          requested_quantity: offer.offered_quantity || offer.demand_headcount || null,
          safe_candidates: [],
          staffing_ready_link: null,
          staffing_fast_track_enabled: false
        });
      }
      const assignment = overview.assignment;
      // Supplier darf Kandidaten laden/direkt zuweisen; der Requester bekommt
      // nur einen read-only-KPI-Schnitt.
      let safeCandidates = [];
      if (isSupplier && assignment.supplier_org_id) {
        const bundle = await assignmentStaffingService.listAssignmentSuggestions(
          pool,
          assignment.id,
          assignment.supplier_org_id,
          { limit: 10, hardOnly: true, includeBlocked: false, onlyAvailable: true }
        );
        const suggestions = Array.isArray(bundle?.suggestions) ? bundle.suggestions : [];
        safeCandidates = suggestions
          .filter((entry) => entry && entry.is_selectable !== false)
          .map((entry) => ({
            worker_user_id: entry.worker_user_id,
            first_name: entry.first_name || null,
            last_name: entry.last_name || null,
            personnel_number: entry.personnel_number || null,
            match_score: entry.match_score != null ? Number(entry.match_score) : null,
            hard_match: !!entry.hard_match,
            quick_assign_eligible: !!assignmentStaffingService.getSuggestionQuickAssignState(entry)?.quick_assign_eligible
          }))
          .filter((entry) => entry.quick_assign_eligible);
      }
      const fastTrackEnabled = assignment.supplier_org_id
        ? await dealStaffingFastTrackService.isStaffingFastTrackEnabled(pool, assignment.supplier_org_id)
        : false;
      res.json({
        offer_id: offer.id,
        agreement_status: offer.agreement_status || "none",
        is_supplier: isSupplier,
        assignment: {
          id: assignment.id,
          status: assignment.status,
          staffing_status: assignment.staffing_status,
          requested_quantity: assignment.requested_quantity,
          filled_quantity: assignment.filled_quantity,
          reserved_quantity: assignment.reserved_quantity,
          open_quantity: assignment.open_quantity,
          start_date: assignment.start_date,
          planned_end_date: assignment.planned_end_date
        },
        open_quantity: assignment.open_quantity,
        requested_quantity: assignment.requested_quantity,
        safe_candidates: safeCandidates,
        staffing_ready_link: dealStaffingFastTrackService.buildStaffingReadyLink({
          assignmentId: assignment.id,
          offerId: offer.id
        }),
        staffing_fast_track_enabled: !!fastTrackEnabled
      });
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/offers/:id/staffing-context");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // POST /marketplace/offers/:id/quick-assign-to-deal
  // Aggregator: nimmt offerId + worker_user_ids entgegen und forwardet an den
  // bestehenden assignment-zentrischen quick-assign. Manuelle Einzelzuweisung
  // bleibt unveraendert (siehe /api/assign-deal-to-worker).
  router.post("/marketplace/offers/:id/quick-assign-to-deal", requireAuth, slaAccess, async (req, res) => {
    try {
      const offer = await dealAgreementService.getAgreementDetails(pool, req.params.id);
      if (!offer) return res.status(404).json({ error: "NOT_FOUND" });
      if (!await canAccessAsOwner(pool, offer.supplier_company_id, req.session.userId)) {
        return res.status(403).json({
          error: "FORBIDDEN",
          message: "Nur die liefernde Agentur darf Worker direkt aus der Dealakte zuweisen."
        });
      }
      if (!offer.assignment_id) {
        return res.status(409).json({ error: "ASSIGNMENT_NOT_READY", message: "Deal muss aktiviert sein." });
      }
      const parsed = offerQuickAssignSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const overview = await assignmentStaffingService.getAssignmentStaffingOverview(
        pool,
        offer.assignment_id,
        null
      );
      const supplierOrgId = overview?.assignment?.supplier_org_id || null;
      if (!supplierOrgId) {
        return res.status(409).json({ error: "ASSIGNMENT_NOT_READY" });
      }

      const result = await dealStaffingFastTrackService.quickAssignSuggestedWorkers(pool, {
        assignmentId: offer.assignment_id,
        supplierOrgId,
        actorId: req.session.userId,
        workerUserIds: parsed.data.worker_user_ids,
        clientName: parsed.data.client_name || offer.requester_company_name || null,
        notes: parsed.data.notes || null
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
          parsed.data.client_name || offer.requester_company_name || null
        ).catch(swallow("marketplace"));
      }

      res.locals.audit = {
        action: "deal.quick_assign_to_deal.executed",
        entity_type: "offer",
        entity_id: offer.id,
        details: {
          assignment_id: offer.assignment_id,
          requested_count: result.summary?.requested_count || 0,
          assigned_count: result.summary?.assigned_count || 0,
          skipped_count: result.summary?.skipped_count || 0,
          open_quantity_after: result.summary?.open_quantity_after || 0
        }
      };
      res.json(result);
    } catch (e) {
      logger.error({ err: e }, "POST /marketplace/offers/:id/quick-assign-to-deal");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // Dokument-Download (Konditionsblatt oder Einsatzvereinbarung)
  router.get("/marketplace/offers/:id/document", requireAuth, slaAccess, async (req, res) => {
    try {
      const offer = await dealAgreementService.getAgreementDetails(pool, req.params.id);
      if (!offer) return res.status(404).json({ error: "NOT_FOUND" });
      if (!await canAccessAsOwner(pool, offer.requester_company_id, req.session.userId) && !await canAccessAsOwner(pool, offer.supplier_company_id, req.session.userId)) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }
      const type = req.query.type || "conditions";
      let html;
      if (type === "agreement" && offer.agreement_status && offer.agreement_status !== "none") {
        html = renderAgreementDocument(offer);
      } else {
        html = renderConditionsSheet(offer);
      }
      const filename = type === "agreement"
        ? `Einsatzvereinbarung-${offer.agreement_ref || offer.id}.html`
        : `Konditionsblatt-${offer.id}.html`;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      res.send(html);
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/offers/:id/document");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // Dealakte / Dokumentenmappe (alle Dokumente zum Deal)
  router.get("/marketplace/offers/:id/dossier", requireAuth, slaAccess, async (req, res) => {
    try {
      const full = await dealAgreementService.getAgreementDetails(pool, req.params.id);
      if (!full) return res.status(404).json({ error: "NOT_FOUND" });
      // Nur Beteiligte duerfen die Dealakte sehen
      if (!await canAccessAsOwner(pool, full.requester_company_id, req.session.userId) && !await canAccessAsOwner(pool, full.supplier_company_id, req.session.userId)) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }
      const dossier = await dealDossierService.getDossier(pool, req.params.id);
      if (!dossier) return res.status(404).json({ error: "NOT_FOUND" });
      res.json(dossier);
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/offers/:id/dossier");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Deal Progress (deal flow visibility) ────────── */

  router.get("/marketplace/deals/:id/progress", requireAuth, slaAccess, async (req, res) => {
    try {
      const progress = await dealProgressHelper.getDealProgress(pool, req.params.id);
      if (!progress) return res.status(404).json({ error: "NOT_FOUND" });
      // Only requester or receiver may view
      const userId = req.session.userId;
      if (progress.requester_id !== userId && progress.receiver_id !== userId) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }
      res.json(progress);
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/deals/:id/progress");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── My Deals (beide Seiten: Agency + Company) ─────── */

  router.get("/marketplace/my-deals", requireAuth, slaAccess, async (req, res) => {
    try {
      const userId = req.session.userId;
      const includeMeta = req.query.include_meta === "1";
      const selectedBucket = normalizeDealHistoryBucket(req.query.status, "all");
      const pageLimit = normalizeCollectionInteger(
        req.query.limit,
        includeMeta ? 25 : 100,
        { min: 1, max: includeMeta ? 100 : 200 }
      );
      const pageOffset = includeMeta
        ? normalizeCollectionInteger(req.query.offset, 0, { min: 0, max: 10000 })
        : 0;
      const baseWhere = `(o.supplier_company_id = $1 OR d.requester_company_id = $1)`;
      const historyWhere = selectedBucket !== "all"
        ? ` AND ${buildDealHistoryBucketSql(selectedBucket, { offerAlias: "o" })}`
        : "";
      const sortExpression = buildDealHistorySortSql({ offerAlias: "o" });
      const countQuerySearch = buildMyDealsSearchClause([userId], req.query.q);
      const listQuerySearch = buildMyDealsSearchClause([userId], req.query.q);
      let counts = null;
      let headcounts = null;
      let kpis = null;

      if (includeMeta) {
        const actionRequiredSql = buildMyDealsActionRequiredSql("$1", { offerAlias: "o", demandAlias: "d" });
        const { rows: countRows } = await pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE ${buildDealHistoryBucketSql("active", { offerAlias: "o" })})::int AS active_count,
             COUNT(*) FILTER (WHERE ${buildDealHistoryBucketSql("completed", { offerAlias: "o" })})::int AS completed_count,
             COUNT(*) FILTER (WHERE ${buildDealHistoryBucketSql("cancelled", { offerAlias: "o" })})::int AS cancelled_count,
             COUNT(*)::int AS all_count,
             COALESCE(SUM(COALESCE(o.offered_quantity, d.headcount, 0)) FILTER (WHERE ${buildDealHistoryBucketSql("active", { offerAlias: "o" })}), 0)::int AS active_headcount,
             COALESCE(SUM(COALESCE(o.offered_quantity, d.headcount, 0)) FILTER (WHERE ${buildDealHistoryBucketSql("completed", { offerAlias: "o" })}), 0)::int AS completed_headcount,
             COALESCE(SUM(COALESCE(o.offered_quantity, d.headcount, 0)) FILTER (WHERE ${buildDealHistoryBucketSql("cancelled", { offerAlias: "o" })}), 0)::int AS cancelled_headcount,
             COALESCE(SUM(COALESCE(o.offered_quantity, d.headcount, 0)), 0)::int AS all_headcount,
             COUNT(*) FILTER (WHERE ${actionRequiredSql})::int AS action_required_count
           FROM offers o
           JOIN demand_requests d ON d.id = o.demand_request_id
           LEFT JOIN users du ON du.id = d.requester_company_id
           LEFT JOIN users su ON su.id = o.supplier_company_id
           LEFT JOIN capacity_posts cp ON cp.id = o.capacity_post_id
           WHERE ${baseWhere}${countQuerySearch.clause}`,
          countQuerySearch.params
        );
        const countRow = countRows[0] || {};
        counts = {
          active: Number(countRow.active_count) || 0,
          completed: Number(countRow.completed_count) || 0,
          cancelled: Number(countRow.cancelled_count) || 0,
          all: Number(countRow.all_count) || 0
        };
        headcounts = {
          active: Number(countRow.active_headcount) || 0,
          completed: Number(countRow.completed_headcount) || 0,
          cancelled: Number(countRow.cancelled_headcount) || 0,
          all: Number(countRow.all_headcount) || 0
        };
        kpis = {
          action_required: Number(countRow.action_required_count) || 0
        };
      }

      const listParams = [...listQuerySearch.params, pageLimit];
      let paginationSql = ` LIMIT $${listParams.length}`;
      if (includeMeta) {
        listParams.push(pageOffset);
        paginationSql += ` OFFSET $${listParams.length}`;
      }
      const { rows } = await pool.query(
        `SELECT o.id, o.status, o.agreement_status, o.agreement_ref, o.agreement_version,
                o.offered_quantity, o.offered_hourly_rate, o.start_confirmed, o.end_date,
                o.created_at, o.updated_at, o.activated_at, o.assignment_id, o.capacity_post_id,
                d.title AS demand_title, d.role AS demand_role, d.location_city AS demand_location,
                d.start_date AS demand_start, d.end_date AS demand_end, d.headcount AS demand_headcount,
                d.requester_company_id,
                du.company_name AS requester_company_name,
                su.company_name AS supplier_company_name,
                o.supplier_company_id,
                cp.title AS capacity_title,
                cp.role AS capacity_role,
                cp.location_city AS capacity_location,
                cp.headcount AS capacity_headcount,
                cp.status AS capacity_status,
                cp.availability_from AS capacity_availability_from,
                cp.availability_to AS capacity_availability_to,
                ${sortExpression} AS deal_history_sort_at
         FROM offers o
         JOIN demand_requests d ON d.id = o.demand_request_id
         LEFT JOIN users du ON du.id = d.requester_company_id
         LEFT JOIN users su ON su.id = o.supplier_company_id
         LEFT JOIN capacity_posts cp ON cp.id = o.capacity_post_id
         WHERE ${baseWhere}${listQuerySearch.clause}${historyWhere}
         ORDER BY deal_history_sort_at DESC, o.updated_at DESC, o.created_at DESC${paginationSql}`,
        listParams
      );
      const capacityStates = await capacityExchangeService.getCapacityCommercialStates(
        pool,
        rows.map((row) => row.capacity_post_id).filter(Boolean)
      );
      // Gegenseiten-Logik + "Wer ist am Zug?"
      const deals = rows.map(o => {
        const action = dealAgreementService.getActionRequired(o, userId);
        const isSupplier = o.supplier_company_id === userId;
        const capacitySummary = o.capacity_post_id
          ? summarizeCapacityDealState(o.capacity_headcount, capacityStates.get(o.capacity_post_id))
          : {
              capacity_committed_headcount: null,
              capacity_remaining_headcount: null,
              capacity_assigned_headcount: null,
              capacity_staffing_reserved_headcount: null,
              capacity_active_offer_count: null,
              capacity_has_active_deal: false,
              capacity_is_partially_committed: false,
              capacity_is_fully_committed: false,
              capacity_commercial_status: null
            };
        const dealHistoryBucket = getDealHistoryBucket(o);
        return {
          ...o,
          ...capacitySummary,
          deal_history_bucket: dealHistoryBucket,
          deal_is_terminal: dealHistoryBucket !== "active",
          action_required: action,
          counterparty_name: isSupplier ? o.requester_company_name : o.supplier_company_name,
          viewer_role: isSupplier ? 'supplier' : 'requester',
          subject_type: o.capacity_post_id ? 'capacity' : 'demand',
          subject_title: o.capacity_post_id ? (o.capacity_title || o.demand_title) : o.demand_title,
          deal_headcount: o.offered_quantity ?? o.demand_headcount ?? null
        };
      });
      if (!includeMeta) {
        return res.json(deals);
      }
      const selectedTotal = selectedBucket === "all" ? (counts?.all || 0) : (counts?.[selectedBucket] || 0);
      res.json({
        items: deals,
        counts,
        headcounts,
        kpis,
        filters: {
          status: selectedBucket,
          q: listQuerySearch.search || null
        },
        pagination: {
          limit: pageLimit,
          offset: pageOffset,
          returned: deals.length,
          total: selectedTotal,
          has_more: pageOffset + deals.length < selectedTotal
        }
      });
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/my-deals");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── public read-only (all authenticated users, no sla_access) ── */

  router.get("/marketplace/public/capacity-posts", requireAuth, async (req, res) => {
    try {
      const opts = {
        location_city: req.query.city || undefined,
        role: req.query.role || undefined,
        limit: Math.min(100, parseInt(req.query.limit, 10) || 50)
      };
      const rows = await marketplaceService.listCapacityPosts(pool, opts);
      // Strip contact details for public view
      const publicRows = rows.map(r => ({
        id: r.id, title: r.title, role: r.role, skill_tags: r.skill_tags,
        headcount: r.headcount, availability_from: r.availability_from,
        availability_to: r.availability_to, location_city: r.location_city,
        price_type: r.price_type, supplier_company_name: r.supplier_company_name,
        created_at: r.created_at
      }));
      res.json(publicRows);
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/public/capacity-posts");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── demand interactions (agency/company responses) ───────────── */

  router.get("/marketplace/demand-requests/:id/interactions", requireAuth, slaAccess, async (req, res) => {
    try {
      const demandId = req.params.id;
      const demand = await marketplaceService.getDemandById(pool, demandId);
      if (!demand) return res.status(404).json({ error: "NOT_FOUND" });
      const allowed = await canAccessAsOwner(pool, demand.requester_company_id, req.session.userId);
      if (!allowed) return res.status(403).json({ error: "FORBIDDEN" });
      const items = await capacityExchangeService.listDemandInteractions(pool, demandId);
      res.json(items);
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/demand-requests/:id/interactions");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Merkliste (P9 Welle B2) ─────────────────────────────────────
   *
   * Beide Richtungen in einer Liste: ein Unternehmen sieht gemerkte Kapazitaeten,
   * eine Zeitarbeitsfirma gemerkte Bedarfe. Die Gegenseitenlogik ergibt sich aus
   * dem, was jemand merken konnte — es braucht keinen Rollenfilter obendrauf.
   *
   * ORG-GRENZE: gelesen wird ausschliesslich die EIGENE Merkliste
   * (`company_user_id = req.session.userId`). Es gibt bewusst keinen Parameter,
   * mit dem man eine fremde anfordern koennte.
   */
  router.get("/marketplace/watchlist", requireAuth, async (req, res) => {
    try {
      const items = await capacityExchangeService.ladeMerkliste(pool, req.session.userId, {
        limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined
      });
      res.json({
        items,
        total: items.length,
        // Der Zaehler fuer den Reiter zaehlt nur, was noch verfolgbar ist —
        // eine "3" neben lauter vergebenen Eintraegen waere eine falsche Zusage.
        offen: items.filter((i) => i.zustand === "offen").length
      });
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/watchlist");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Gemerkten Bedarf wieder entfernen (P9 Welle B1) ─────────────
   *
   * Bewusst OHNE die Pruefung `isDemandCommerciallyOpen` des POST-Zwillings:
   * Einen geschlossenen Bedarf muss man von seiner Liste nehmen koennen —
   * sonst waere sie genau dann nicht aufraeumbar, wenn sie voll alter Eintraege
   * ist. Entfernt wird ausschliesslich die eigene Merkung.
   */
  router.delete("/marketplace/demand-requests/:id/interactions/save", requireAuth, async (req, res) => {
    try {
      const ergebnis = await capacityExchangeService.entferneMerkung(
        pool, req.session.userId, { demandRequestId: req.params.id }
      );
      res.json({ ok: true, gemerkt: false, entfernt: ergebnis.entfernt });
    } catch (e) {
      logger.error({ err: e }, "DELETE /marketplace/demand-requests/:id/interactions/save");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/marketplace/demand-requests/:id/interactions", requireAuth, slaAccess, async (req, res) => {
    try {
      const demandId = req.params.id;
      const demand = await marketplaceService.getDemandById(pool, demandId);
      if (!demand) return res.status(404).json({ error: "NOT_FOUND" });
      const me = await getUserAndPlan(req.session.userId);
      if (!isDemandCommerciallyOpen(demand)) {
        return res.status(409).json({ error: "DEMAND_NOT_INTERACTABLE" });
      }
      const policy = canInteractWithDemand({
        viewerRole: me?.role || null,
        viewerUserId: req.session.userId,
        requesterUserId: demand.requester_company_id,
        demandStatus: demand.status
      });
      if (!policy.allowed) return res.status(policy.status).json({ error: policy.code });

      const parsed = demandInteractionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const row = await capacityExchangeService.createDemandInteraction(pool, demandId, req.session.userId, parsed.data);
      if (!row) return res.status(200).json({ ok: true, deduped: true });

      await dispatch(pool, "demand.match_found", {
        recipientUserIds: [demand.requester_company_id],
        entityType: "demand_request",
        entityId: demandId,
        message: `Neue Rueckmeldung auf Bedarf "${demand.title}" (${parsed.data.interaction_type})`,
        linkPath: `/public/capacity_exchange_detail.html?id=${demandId}&type=demand&owner=1`
      });

      res.locals.audit = {
        action: `marketplace.demand.interaction.${parsed.data.interaction_type}`,
        entity_type: "capacity_interaction",
        entity_id: row.id,
        details: { demand_request_id: demandId }
      };
      res.status(201).json(row);
    } catch (e) {
      logger.error({ err: e }, "POST /marketplace/demand-requests/:id/interactions");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/marketplace/public/demand-requests/:id", requireAuth, async (req, res) => {
    try {
      const row = await marketplaceService.getDemandById(pool, req.params.id);
      if (!row) return res.status(404).json({ error: "NOT_FOUND" });
      if (row.is_capacity_origin || !isDemandCommerciallyOpen(row)) return res.status(404).json({ error: "NOT_FOUND" });
      // Public-safe projection — no internal SLA fields or requester-only data
      res.json({
        id: row.id, title: row.title, role: row.role, skill_tags: row.skill_tags,
        headcount: row.headcount,
        required_total_count: row.required_total_count ?? row.headcount,
        remaining_open_count: normalizeDemandRemainingOpenCount(row),
        currently_committed_count: Number(row.currently_committed_count) || 0,
        start_date: row.start_date, end_date: row.end_date,
        location_city: row.location_city, urgency: row.urgency, status: row.status,
        budget_min: row.budget_min, budget_max: row.budget_max,
        requester_company_name: row.requester_company_name,
        employment_type: row.employment_type, shift_model: row.shift_model,
        description: row.description, created_at: row.created_at
      });
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/public/demand-requests/:id");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/marketplace/public/demand-requests", requireAuth, async (req, res) => {
    try {
      const opts = {
        commercially_open_only: true,
        exclude_capacity_origin: true,
        limit: Math.min(100, parseInt(req.query.limit, 10) || 50)
      };
      const rows = await marketplaceService.listDemandRequests(pool, opts);
      const publicRows = rows.map(r => ({
        id: r.id, title: r.title, role: r.role, skill_tags: r.skill_tags,
        headcount: r.headcount,
        required_total_count: r.required_total_count ?? r.headcount,
        remaining_open_count: normalizeDemandRemainingOpenCount(r),
        currently_committed_count: Number(r.currently_committed_count) || 0,
        status: r.status,
        start_date: r.start_date, end_date: r.end_date,
        location_city: r.location_city, urgency: r.urgency,
        requester_company_name: r.requester_company_name, created_at: r.created_at
      }));
      res.json(publicRows);
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/public/demand-requests");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
