/**
 * subscriptionRequests.js — Customer-facing API fuer Upgrade-/Downgrade-/
 * Cancellation-Anfragen. Mounted auf /api/v1 + /api.
 *
 * Pflicht: kein Self-Service-Override fuer INDIVIDUELL/Pilot. Alle Anfragen
 * laufen ueber `subscription_requests` mit State-Machine + Doppel-Pending-
 * Schutz (UNIQUE-Index aus 099). Aktivierung erfolgt erst nach Staff-
 * Approval ueber den Staff-Endpoint /staff/api/subscription-requests/:id/activate.
 *
 * Endpoints:
 *   POST /subscription-requests/upgrade
 *   POST /subscription-requests/downgrade
 *   POST /subscription-requests/cancellation
 *   GET  /subscription-requests/downgrade/preview
 *   GET  /subscription-requests/mine
 *   GET  /subscription-requests/:id
 *
 * Sicherheit:
 *   - Alle Pfade hinter requireAuth + Org-Kontext
 *   - Read-Detail prueft owner-Match (nur eigene Org)
 *   - Mutationen schreiben res.locals.audit fuer plattform-weites audit_log
 */

import { Router } from "express";
import { z } from "zod";
import * as subreq from "../services/subscriptionRequestService.js";
import { notifyRequestStatusChanged } from "../services/subscriptionNotificationService.js";

/**
 * Welle 8 Schritt 15: zentrale, fail-safe Notification-Hook-Helper.
 * Wirft niemals — Mail-/Notification-Probleme blocken keine Status-Transition.
 */
function dispatchNotifySafe(pool, change, deps) {
  Promise.resolve()
    .then(() => notifyRequestStatusChanged(pool, change, deps))
    .catch((err) => { try { (deps && deps.logger ? deps.logger : console).warn?.({ err: err && err.message }, "subscription notify hook failed"); } catch { /* noop */ } });
}

const upgradeSchema = z.object({
  desired_plan: z.string().min(2).max(40),
  desired_individual_tier: z.enum([
    "individuell_s", "individuell_m", "individuell_l", "individuell_enterprise"
  ]).optional().nullable(),
  desired_features: z.array(z.string().max(80)).max(50).optional(),
  desired_addons: z.array(z.object({ key: z.string().max(40) }).passthrough()).max(30).optional(),
  employee_count: z.coerce.number().int().min(1).max(999999).optional().nullable(),
  user_count: z.coerce.number().int().min(1).max(99999).optional().nullable(),
  site_count: z.coerce.number().int().min(1).max(9999).optional().nullable(),
  region_scope: z.string().max(240).optional().nullable(),
  industry: z.string().max(180).optional().nullable(),
  expected_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  message: z.string().max(2000).optional().nullable()
});

const downgradeSchema = z.object({
  desired_plan: z.string().min(2).max(40),
  acknowledge_impact: z.boolean().optional().default(false),
  expected_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  message: z.string().max(2000).optional().nullable()
});

const cancellationSchema = z.object({
  cancellation_effective_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  reason: z.string().max(2000).optional().nullable()
});

function isBackofficeRole(role) {
  return ["owner", "admin", "finance", "platform_admin"].includes(String(role || ""));
}

export function createSubscriptionRequestsRouter(deps) {
  const { pool, requireAuth, getUserAndPlan, logger, sendMail } = deps;
  const router = Router();
  const notifyDeps = { sendMail, logger };

  async function requireBillingActor(req, res) {
    if (!req.session?.userId) {
      res.status(401).json({ error: { code: "NOT_AUTHENTICATED" } });
      return null;
    }
    const orgId = req.orgId || null;
    if (!orgId) {
      res.status(403).json({ error: { code: "ORG_REQUIRED" } });
      return null;
    }
    if (!isBackofficeRole(req.orgRole)) {
      res.status(403).json({ error: { code: "PERMISSION_DENIED", message: "Nur Owner/Admin/Finance koennen Tarif-Aenderungen anfragen." } });
      return null;
    }
    const me = await getUserAndPlan(req.session.userId, { orgId });
    return { me, orgId, userId: req.session.userId };
  }

  function buildSharedFields(actor, parsed) {
    return {
      org_id: actor.orgId,
      user_id: actor.userId,
      contact_email: (actor.me && actor.me.email) || null,
      contact_name: (actor.me && actor.me.contact_person) || null,
      contact_phone: (actor.me && actor.me.phone) || null,
      requester_company_name: (actor.me && (actor.me.org_name || actor.me.company_name)) || null,
      submitted_ip: null,
      submitted_user_agent: null,
      message: parsed.message || null
    };
  }

  /* ---- POST /subscription-requests/upgrade ---- */
  router.post("/subscription-requests/upgrade", requireAuth, async (req, res, next) => {
    try {
      const actor = await requireBillingActor(req, res);
      if (!actor) return;
      const parsed = upgradeSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION", details: parsed.error.issues } });

      // Doppel-Pending verhindern
      const dup = await subreq.hasOpenRequest(pool, { orgId: actor.orgId, requestType: subreq.REQUEST_TYPES.UPGRADE });
      if (dup) return res.status(409).json({ error: { code: "DUPLICATE_OPEN_REQUEST", request_type: "upgrade" } });

      const row = await subreq.createRequest(pool, {
        request_type: subreq.REQUEST_TYPES.UPGRADE,
        ...buildSharedFields(actor, parsed.data),
        current_plan: actor.me?.plan || null,
        desired_plan: parsed.data.desired_plan,
        desired_individual_tier: parsed.data.desired_individual_tier || null,
        desired_features: parsed.data.desired_features || [],
        desired_addons: parsed.data.desired_addons || [],
        employee_count: parsed.data.employee_count ?? null,
        user_count: parsed.data.user_count ?? null,
        site_count: parsed.data.site_count ?? null,
        region_scope: parsed.data.region_scope || null,
        industry: parsed.data.industry || null,
        expected_start_date: parsed.data.expected_start_date || null
      });

      res.locals.audit = {
        action: "subscription_request.upgrade.create",
        entity_type: "subscription_request",
        entity_id: row.id,
        details: { from: actor.me?.plan, to: parsed.data.desired_plan }
      };
      dispatchNotifySafe(pool, { requestId: row.id, toStatus: "submitted", requestType: "upgrade" }, notifyDeps);
      res.status(201).json({ success: true, data: row });
    } catch (e) { next(e); }
  });

  /* ---- GET /subscription-requests/downgrade/preview?desired_plan=... ---- */
  router.get("/subscription-requests/downgrade/preview", requireAuth, async (req, res, next) => {
    try {
      const actor = await requireBillingActor(req, res);
      if (!actor) return;
      const desiredPlan = String(req.query.desired_plan || "").trim();
      if (!desiredPlan) return res.status(400).json({ error: { code: "DESIRED_PLAN_REQUIRED" } });
      const impact = await subreq.previewDowngradeImpact(pool, {
        orgId: actor.orgId,
        currentPlan: actor.me?.plan || "DEMO",
        desiredPlan
      });
      res.json({ success: true, data: impact });
    } catch (e) { next(e); }
  });

  /* ---- POST /subscription-requests/downgrade ---- */
  router.post("/subscription-requests/downgrade", requireAuth, async (req, res, next) => {
    try {
      const actor = await requireBillingActor(req, res);
      if (!actor) return;
      const parsed = downgradeSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION", details: parsed.error.issues } });

      const dup = await subreq.hasOpenRequest(pool, { orgId: actor.orgId, requestType: subreq.REQUEST_TYPES.DOWNGRADE });
      if (dup) return res.status(409).json({ error: { code: "DUPLICATE_OPEN_REQUEST", request_type: "downgrade" } });

      // Impact-Pruefung
      const impact = await subreq.previewDowngradeImpact(pool, {
        orgId: actor.orgId,
        currentPlan: actor.me?.plan || "DEMO",
        desiredPlan: parsed.data.desired_plan
      });

      if (impact.hard_blocked) {
        return res.status(409).json({
          error: {
            code: "DOWNGRADE_HARD_BLOCKED",
            message: "Der Zieltarif erlaubt weniger aktive Nutzer als aktuell vorhanden. Bitte Nutzerzahl reduzieren, bevor der Downgrade angefragt wird.",
            impact
          }
        });
      }

      if (impact.blocked && parsed.data.acknowledge_impact !== true) {
        return res.status(409).json({
          error: {
            code: "DOWNGRADE_BLOCKED",
            message: "Limits wuerden ueberschritten. Bitte vor Anfrage reduzieren oder Staff-Pruefung anfordern (acknowledge_impact=true).",
            impact
          }
        });
      }

      const row = await subreq.createRequest(pool, {
        request_type: subreq.REQUEST_TYPES.DOWNGRADE,
        ...buildSharedFields(actor, parsed.data),
        current_plan: actor.me?.plan || null,
        desired_plan: parsed.data.desired_plan,
        expected_start_date: parsed.data.expected_start_date || null
      });

      // Snapshot des Impact in den Datensatz schreiben
      await pool.query(
        "UPDATE subscription_requests SET downgrade_impact_snapshot = $2::jsonb, updated_at = NOW() WHERE id = $1",
        [row.id, JSON.stringify(impact)]
      );

      res.locals.audit = {
        action: "subscription_request.downgrade.create",
        entity_type: "subscription_request",
        entity_id: row.id,
        details: {
          from: actor.me?.plan,
          to: parsed.data.desired_plan,
          impact_blocked: impact.blocked,
          impact_hard_blocked: impact.hard_blocked === true,
          features_lost: (impact.features_lost || []).length,
          listings_over_limit: impact.listings_count > (impact.listings_limit_after === -1 ? Infinity : impact.listings_limit_after)
        }
      };
      dispatchNotifySafe(pool, { requestId: row.id, toStatus: "submitted", requestType: "downgrade" }, notifyDeps);
      res.status(201).json({ success: true, data: { ...row, impact } });
    } catch (e) { next(e); }
  });

  /* ---- POST /subscription-requests/cancellation ---- */
  router.post("/subscription-requests/cancellation", requireAuth, async (req, res, next) => {
    try {
      const actor = await requireBillingActor(req, res);
      if (!actor) return;
      const parsed = cancellationSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION", details: parsed.error.issues } });

      const dup = await subreq.hasOpenRequest(pool, { orgId: actor.orgId, requestType: subreq.REQUEST_TYPES.CANCELLATION });
      if (dup) return res.status(409).json({ error: { code: "DUPLICATE_OPEN_REQUEST", request_type: "cancellation" } });

      const row = await subreq.createRequest(pool, {
        request_type: subreq.REQUEST_TYPES.CANCELLATION,
        ...buildSharedFields(actor, parsed.data),
        current_plan: actor.me?.plan || null,
        message: parsed.data.reason || null
      });

      // cancellation_effective_at separat setzen falls Customer ein Datum gewaehlt hat;
      // Default: zum Periodenende (wird spaeter durch Staff/Cron auf konkretes Datum gesetzt).
      if (parsed.data.cancellation_effective_at) {
        await pool.query(
          "UPDATE subscription_requests SET cancellation_effective_at = $2, updated_at = NOW() WHERE id = $1",
          [row.id, parsed.data.cancellation_effective_at]
        );
      }

      res.locals.audit = {
        action: "subscription_request.cancellation.create",
        entity_type: "subscription_request",
        entity_id: row.id,
        details: { from: actor.me?.plan, requested_effective_at: parsed.data.cancellation_effective_at || null }
      };
      dispatchNotifySafe(pool, { requestId: row.id, toStatus: "submitted", requestType: "cancellation" }, notifyDeps);
      res.status(201).json({ success: true, data: row });
    } catch (e) { next(e); }
  });

  /* ---- GET /subscription-requests/mine ---- */
  router.get("/subscription-requests/mine", requireAuth, async (req, res, next) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: { code: "NOT_AUTHENTICATED" } });
      const orgId = req.orgId || null;
      if (!orgId) return res.status(403).json({ error: { code: "ORG_REQUIRED" } });
      const items = await subreq.listOpenForOrg(pool, orgId);
      res.json({ success: true, data: { items } });
    } catch (e) { next(e); }
  });

  /* ---- GET /subscription-requests/:id/history (eigene Org only) ---- */
  router.get("/subscription-requests/:id/history", requireAuth, async (req, res, next) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: { code: "NOT_AUTHENTICATED" } });
      const row = await subreq.getRequest(pool, req.params.id);
      if (!row) return res.status(404).json({ error: { code: "REQUEST_NOT_FOUND" } });
      const orgId = req.orgId || null;
      if (!orgId || String(row.org_id || "") !== String(orgId)) {
        return res.status(403).json({ error: { code: "FORBIDDEN_CROSS_ORG" } });
      }
      const history = await subreq.listHistory(pool, row.id);
      res.json({ success: true, data: { history } });
    } catch (e) { next(e); }
  });

  /* ---- GET /subscription-requests/:id (eigene Org only) ---- */
  router.get("/subscription-requests/:id", requireAuth, async (req, res, next) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: { code: "NOT_AUTHENTICATED" } });
      const row = await subreq.getRequest(pool, req.params.id);
      if (!row) return res.status(404).json({ error: { code: "REQUEST_NOT_FOUND" } });
      const orgId = req.orgId || null;
      if (!orgId || String(row.org_id || "") !== String(orgId)) {
        return res.status(403).json({ error: { code: "FORBIDDEN_CROSS_ORG" } });
      }
      const history = await subreq.listHistory(pool, row.id);
      res.json({ success: true, data: { ...row, history } });
    } catch (e) { next(e); }
  });

  return router;
}
