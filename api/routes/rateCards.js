/**
 * Rate Card Management REST-Router.
 * Feature-Gate: rate_card_management (PRO/ENTERPRISE)
 * RBAC: rate_card.create, rate_card.update, rate_card.read
 */
import { Router } from "express";
import * as rateCardService from "../services/rateCardService.js";
import { requirePermission } from "../middleware/rbac.js";
import { requireOrgFeature } from "../middleware/entitlementGuard.js";
import { trackProductEventFromRequest } from "../services/productAnalyticsService.js";
import { getMembership } from "../services/rbacService.js";

async function ensureCompanyRateCardAccess(req, res, pool) {
  const orgId = req.orgId;
  if (!orgId) {
    res.status(400).json({ error: "ORG_CONTEXT_REQUIRED" });
    return false;
  }

  let membership = req.orgMembership || null;
  if (!membership && req.session?.userId) {
    membership = await getMembership(pool, req.session.userId, orgId);
    if (membership) req.orgMembership = membership;
  }

  const orgType = String(membership?.org_type || "").toLowerCase();
  if (orgType && orgType !== "company") {
    res.status(403).json({
      error: "RATE_CARD_NOT_AVAILABLE_FOR_ORG_TYPE",
      message: "Preisrahmen stehen nur fuer Unternehmensorganisationen zur Verfuegung."
    });
    return false;
  }

  return true;
}

export function createRateCardsRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();
  const rperm = (p) => requirePermission(p, { pool, logger });
  const featureGate = requireOrgFeature("rate_card_management", { pool, logger });

  /** GET /rate-cards — List rate cards for org */
  router.get("/rate-cards", requireAuth, featureGate, rperm("rate_card.read"), async (req, res) => {
    try {
      if (!await ensureCompanyRateCardAccess(req, res, pool)) return;
      const orgId = req.orgId;

      const result = await rateCardService.listRateCards(pool, orgId, {
        status: req.query.status || null,
        complianceStatus: req.query.compliance_status || null,
        roleCategory: req.query.role_category || null,
        region: req.query.region || null,
        supplierOrgId: req.query.supplier_org_id || null,
        dateFrom: req.query.date_from || null,
        dateTo: req.query.date_to || null,
        limit: parseInt(req.query.limit, 10) || 100,
        offset: parseInt(req.query.offset, 10) || 0
      });
      res.json({ success: true, data: result });
    } catch (e) {
      logger.error({ err: e }, "rate-cards list");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** GET /rate-cards/stats — Dashboard KPIs */
  router.get("/rate-cards/stats", requireAuth, featureGate, rperm("rate_card.read"), async (req, res) => {
    try {
      if (!await ensureCompanyRateCardAccess(req, res, pool)) return;
      const orgId = req.orgId;
      const stats = await rateCardService.getRateCardStats(pool, orgId, {
        status: req.query.status || null,
        complianceStatus: req.query.compliance_status || null,
        roleCategory: req.query.role_category || null,
        region: req.query.region || null,
        supplierOrgId: req.query.supplier_org_id || null,
        dateFrom: req.query.date_from || null,
        dateTo: req.query.date_to || null
      });
      res.json({ success: true, data: stats });
    } catch (e) {
      logger.error({ err: e }, "rate-cards stats");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** GET /rate-cards/lookup — Find applicable rate card for role/region/vendor */
  router.get("/rate-cards/lookup", requireAuth, featureGate, rperm("rate_card.read"), async (req, res) => {
    try {
      if (!await ensureCompanyRateCardAccess(req, res, pool)) return;
      const orgId = req.orgId;
      const role = req.query.role;
      if (!role) return res.status(400).json({ error: "ROLE_REQUIRED", message: "Query-Parameter 'role' erforderlich." });

      const card = await rateCardService.findApplicableRateCard(pool, {
        orgId,
        supplierOrgId: req.query.supplier_org_id || null,
        role,
        region: req.query.region || null,
        locationId: req.query.location_id || null,
        date: req.query.date || null
      });
      res.json({ success: true, data: card });
    } catch (e) {
      logger.error({ err: e }, "rate-cards lookup");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** GET /rate-cards/:id — Get single rate card */
  router.get("/rate-cards/:id", requireAuth, featureGate, rperm("rate_card.read"), async (req, res) => {
    try {
      if (!await ensureCompanyRateCardAccess(req, res, pool)) return;
      const card = await rateCardService.getRateCard(pool, req.params.id);
      if (!card) return res.status(404).json({ error: "NOT_FOUND" });
      // Org boundary check
      if (req.orgId && card.org_id !== req.orgId) {
        return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      }
      res.json({ success: true, data: card });
    } catch (e) {
      logger.error({ err: e }, "rate-cards get");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** POST /rate-cards — Create new rate card */
  router.post("/rate-cards", requireAuth, featureGate, rperm("rate_card.create"), async (req, res) => {
    try {
      if (!await ensureCompanyRateCardAccess(req, res, pool)) return;
      const orgId = req.orgId;

      const { role_category, target_rate_cents, max_rate_cents, valid_from } = req.body || {};
      if (!role_category || !target_rate_cents || !max_rate_cents || !valid_from) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "role_category, target_rate_cents, max_rate_cents und valid_from sind Pflichtfelder."
        });
      }
      if (target_rate_cents > max_rate_cents) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "target_rate_cents darf nicht größer als max_rate_cents sein."
        });
      }

      const card = await rateCardService.createRateCard(pool, {
        orgId,
        supplierOrgId: req.body.supplier_org_id || null,
        contractId: req.body.contract_id || null,
        roleCategory: role_category,
        region: req.body.region || null,
        locationId: req.body.location_id || null,
        departmentId: req.body.department_id || null,
        minRateCents: req.body.min_rate_cents ?? null,
        targetRateCents: target_rate_cents,
        maxRateCents: max_rate_cents,
        currency: req.body.currency || "EUR",
        overtimeSurchargePct: req.body.overtime_surcharge_pct ?? 25.0,
        emergencySurchargePct: req.body.emergency_surcharge_pct ?? 0,
        validFrom: valid_from,
        validTo: req.body.valid_to || null,
        notes: req.body.notes || null,
        createdBy: req.session.userId
      });

      res.locals.audit = {
        action: "rate_card.create",
        entity_type: "rate_card",
        entity_id: card.id,
        details: { role_category, target_rate_cents, max_rate_cents }
      };
      try {
        await trackProductEventFromRequest(pool, req, "rate_card_created", {
          flow_key: "enterprise_setup_to_ops",
          metadata: { rate_card_id: card.id, role_category }
        });
      } catch { /* analytics non-critical */ }
      res.status(201).json({ success: true, data: card });
    } catch (e) {
      if (e.code === "23505") {
        return res.status(409).json({
          error: "DUPLICATE_RATE_CARD",
          message: "Eine Rate Card mit dieser Kombination existiert bereits für diesen Zeitraum."
        });
      }
      logger.error({ err: e }, "rate-cards create");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** PATCH /rate-cards/:id — Update rate card */
  router.patch("/rate-cards/:id", requireAuth, featureGate, rperm("rate_card.update"), async (req, res) => {
    try {
      if (!await ensureCompanyRateCardAccess(req, res, pool)) return;
      const existing = await rateCardService.getRateCard(pool, req.params.id);
      if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
      if (req.orgId && existing.org_id !== req.orgId) {
        return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      }
      if (existing.status === "expired" || existing.status === "archived") {
        return res.status(400).json({ error: "IMMUTABLE", message: "Abgelaufene/archivierte Rate Cards können nicht bearbeitet werden." });
      }

      const card = await rateCardService.updateRateCard(pool, req.params.id, req.body, req.session.userId);
      res.locals.audit = {
        action: "rate_card.update",
        entity_type: "rate_card",
        entity_id: req.params.id,
        details: { changed_fields: Object.keys(req.body) }
      };
      res.json({ success: true, data: card });
    } catch (e) {
      logger.error({ err: e }, "rate-cards update");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** POST /rate-cards/:id/activate — Activate a draft card */
  router.post("/rate-cards/:id/activate", requireAuth, featureGate, rperm("rate_card.update"), async (req, res) => {
    try {
      if (!await ensureCompanyRateCardAccess(req, res, pool)) return;
      const card = await rateCardService.activateRateCard(pool, req.params.id, req.session.userId);
      if (!card) {
        return res.status(400).json({ error: "INVALID_STATE", message: "Rate Card ist nicht im Status 'draft'." });
      }
      res.locals.audit = {
        action: "rate_card.activate",
        entity_type: "rate_card",
        entity_id: req.params.id
      };
      res.json({ success: true, data: card });
    } catch (e) {
      logger.error({ err: e }, "rate-cards activate");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** POST /rate-cards/:id/archive — Archive a card */
  router.post("/rate-cards/:id/archive", requireAuth, featureGate, rperm("rate_card.update"), async (req, res) => {
    try {
      if (!await ensureCompanyRateCardAccess(req, res, pool)) return;
      const card = await rateCardService.archiveRateCard(pool, req.params.id, req.session.userId);
      if (!card) {
        return res.status(400).json({ error: "INVALID_STATE", message: "Rate Card kann nicht archiviert werden." });
      }
      res.locals.audit = {
        action: "rate_card.archive",
        entity_type: "rate_card",
        entity_id: req.params.id
      };
      res.json({ success: true, data: card });
    } catch (e) {
      logger.error({ err: e }, "rate-cards archive");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** POST /rate-cards/check — Compliance check (rate against card) */
  router.post("/rate-cards/check", requireAuth, featureGate, rperm("rate_card.read"), async (req, res) => {
    try {
      if (!await ensureCompanyRateCardAccess(req, res, pool)) return;
      const orgId = req.orgId;

      const { role, actual_rate_cents } = req.body || {};
      if (!role || actual_rate_cents == null) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "role und actual_rate_cents sind Pflichtfelder."
        });
      }

      const result = await rateCardService.checkRateCompliance(pool, {
        orgId,
        supplierOrgId: req.body.supplier_org_id || null,
        role,
        region: req.body.region || null,
        locationId: req.body.location_id || null,
        actualRateCents: actual_rate_cents,
        entityType: req.body.entity_type || null,
        entityId: req.body.entity_id || null,
        checkedBy: req.session.userId,
        persist: req.body.persist !== false
      });
      res.locals.audit = {
        action: "rate_card.check",
        entity_type: "rate_card_compliance_check",
        entity_id: null,
        details: { role, actual_rate_cents, persist: req.body.persist !== false }
      };
      res.json({ success: true, data: result });
    } catch (e) {
      logger.error({ err: e }, "rate-cards check");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
