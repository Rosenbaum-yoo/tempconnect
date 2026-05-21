import bcrypt from "bcryptjs";
import { Router } from "express";
import * as geoService from "../services/geoService.js";
import * as userService from "../services/userService.js";
import * as onboardingService from "../services/onboardingService.js";
import * as dgSvc from "../services/dataGovernanceService.js";
import * as rbacService from "../services/rbacService.js";
import * as pilotPolicyService from "../services/pilotPolicyService.js";
import { getPlanDisplayLabel } from "../services/planDisplayService.js";
import * as totpService from "../services/totpService.js";
import * as entitlementService from "../services/entitlementService.js";
const PLAN_ORDER = ["DEMO", "BASIS", "PLUS", "PRO", "INDIVIDUELL"];
function normalizePlanKey(plan) {
  let p = String(plan || "DEMO").toUpperCase();
  if (p === "FREE") p = "DEMO";
  if (p === "ENTERPRISE" || p === "INDIVIDUAL") p = "INDIVIDUELL";
  return p;
}
function planRank(plan) {
  const idx = PLAN_ORDER.indexOf(normalizePlanKey(plan));
  return idx === -1 ? null : idx;
}

/**
 * @param {{ pool, config, sendMail, getUserAndPlan, requireAuth, logger }} deps
 */
export function createMeRouter(deps) {
  const { pool, sendMail, getUserAndPlan, requireAuth, logger } = deps;
  const router = Router();
  async function resolveOrgId(req, userId) {
    if (req.orgId) return req.orgId;
    const membership = await rbacService.getPrimaryOrg(pool, userId);
    return membership?.org_id || null;
  }

  router.post("/me/change-password", requireAuth, async (req, res) => {
    try {
      const currentPassword = String(req.body?.currentPassword || "");
      const newPassword = String(req.body?.newPassword || "");
      if (!currentPassword || !newPassword) return res.status(400).json({ error: "PASSWORD_REQUIRED", message: "Altes und neues Passwort erforderlich." });
      if (newPassword.length < 8) return res.status(400).json({ error: "PASSWORD_TOO_SHORT", message: "Mindestens 8 Zeichen." });
      const u = await userService.getUserPasswordHash(pool, req.session.userId);
      if (!u) return res.status(404).json({ error: "USER_NOT_FOUND" });
      const ok = await bcrypt.compare(currentPassword, u.password_hash);
      if (!ok) return res.status(400).json({ error: "INVALID_CURRENT_PASSWORD", message: "Das aktuelle Passwort ist falsch." });
      const password_hash = await bcrypt.hash(newPassword, 12);  // SEC-007: consistent bcrypt cost (matches register)
      await userService.changePassword(pool, req.session.userId, password_hash);
      res.locals.audit = { action: "user.password_change", entity_type: "user", entity_id: req.session.userId };
      res.json({ ok: true });
    } catch (e) {
      logger.error({ err: e }, "Passwort-Änderung fehlgeschlagen");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/me", requireAuth, async (req, res) => {
    const orgId = await resolveOrgId(req, req.session.userId);
    const me = await getUserAndPlan(req.session.userId, { orgId });
    if (!me) return res.status(401).json({ error: "NOT_AUTHENTICATED" });

    let memberships = [];
    try {
      memberships = await rbacService.getUserMemberships(pool, req.session.userId);
    } catch { /* non-critical */ }

    const activeOrgId = orgId || null;
    const activeOrg = memberships.find((m) => String(m.org_id) === String(activeOrgId)) || null;

    // Allowed locations for the active membership
    let allowedLocations = [];
    try {
      if (activeOrg) {
        allowedLocations = await rbacService.getAllowedLocationsForMembership(pool, activeOrg);
      }
    } catch { /* non-critical */ }

    res.json({
      ...me,
      plan_display_label: getPlanDisplayLabel(me.plan),
      memberships,
      active_org_id: activeOrgId,
      active_org: activeOrg ? {
        org_id:   activeOrg.org_id,
        org_name: activeOrg.org_name,
        org_type: activeOrg.org_type,
        role_key: activeOrg.role_key,
        org_plan: activeOrg.org_plan || null
      } : null,
      // Location context (set by orgContext middleware)
      active_location_id:  req.locationId  || null,
      active_location:     req.locationId
        ? { id: req.locationId, name: req.locationName || null }
        : null,
      allowed_locations:   allowedLocations,
      active_department_id: req.departmentId || null,
    });
  });

  router.get("/me/memberships", requireAuth, async (req, res) => {
    try {
      const memberships = await rbacService.getUserMemberships(pool, req.session.userId);
      res.json({
        items: memberships,
        total: memberships.length,
        active_org_id: req.orgId || null
      });
    } catch (e) {
      logger.error({ err: e }, "Me memberships failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // Entitlement-Snapshot fuer die aktuelle Org-Sicht. Kein Mutationspfad,
  // daher nur requireAuth + req.orgId. Wenn keine Org gesetzt, gibt der
  // Service einen DEMO-Snapshot zurueck (kein 4xx).
  router.get("/me/entitlements", requireAuth, async (req, res) => {
    try {
      const orgId = await resolveOrgId(req, req.session.userId);
      const ent = await entitlementService.getOrganizationEntitlements(pool, orgId);
      const usage = orgId ? await entitlementService.getUsageAgainstLimits(pool, orgId) : null;
      res.setHeader("Cache-Control", "private, max-age=30");
      res.json({ ...ent, usage });
    } catch (e) {
      logger.error({ err: e }, "Entitlement snapshot failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/me/entitlements/feature/:key", requireAuth, async (req, res) => {
    try {
      const orgId = await resolveOrgId(req, req.session.userId);
      const result = await entitlementService.canUseFeature(pool, orgId, String(req.params.key || ""));
      res.json(result);
    } catch (e) {
      logger.error({ err: e }, "Entitlement feature check failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/me/active-org", requireAuth, async (req, res) => {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    try {
      const orgId = String(req.body?.org_id || "").trim();
      if (!orgId) {
        return res.status(400).json({ error: "ORG_ID_REQUIRED", message: "Organisation erforderlich." });
      }
      if (!UUID_RE.test(orgId)) {
        return res.status(400).json({ error: "INVALID_ORG_ID", message: "Ungueltige Organisation." });
      }
      const membership = await rbacService.getMembership(pool, req.session.userId, orgId);
      if (!membership) {
        return res.status(403).json({ error: "ORG_NOT_ALLOWED", message: "Keine Mitgliedschaft in dieser Organisation." });
      }

      // Org switch: always clear stale location context first
      delete req.session._locationCache;

      req.session._orgCache = {
        orgId: membership.org_id,
        role:  membership.role_key,
        name:  membership.org_name,
        defaultLocationId: membership.location_id || null,
      };
      req.orgId = membership.org_id;
      req.orgRole = membership.role_key;
      req.orgName = membership.org_name;
      req.orgMembership = membership;

      // Optional: set a specific location for the new org in the same request
      let activeLocationId = null;
      let activeLocationName = null;
      const requestedLocId = req.body?.location_id ?? null;
      if (requestedLocId && UUID_RE.test(String(requestedLocId))) {
        const { rows } = await pool.query(
          "SELECT id, name FROM org_locations WHERE id=$1 AND org_id=$2 AND is_active=TRUE",
          [requestedLocId, membership.org_id]
        );
        if (rows[0]) {
          req.session._locationCache = { locationId: rows[0].id, locationName: rows[0].name };
          activeLocationId   = rows[0].id;
          activeLocationName = rows[0].name;
        }
      }

      res.locals.audit = {
        action:      "user.org_switch",
        entity_type: "org_membership",
        entity_id:   membership.id || null,
        details:     { org_id: membership.org_id, location_id: activeLocationId }
      };
      res.json({
        ok:                  true,
        active_org_id:       membership.org_id,
        org_name:            membership.org_name,
        role_key:            membership.role_key,
        active_location_id:  activeLocationId,
        active_location_name: activeLocationName,
      });
    } catch (e) {
      logger.error({ err: e }, "Active org switch failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // ── Active Location ───────────────────────────────────────────────────────

  /**
   * GET /me/active-location
   * Returns the currently active location context for the user.
   * Also returns all available locations for the current org so the
   * frontend can render a location switcher.
   */
  router.get("/me/active-location", requireAuth, async (req, res) => {
    try {
      const orgId = req.orgId || null;
      if (!orgId) {
        return res.json({ location_id: null, location_name: null, locations: [] });
      }
      // List available locations for this org
      const { rows: locations } = await pool.query(
        `SELECT id, name, city, is_hq FROM org_locations
         WHERE org_id = $1 AND is_active = TRUE
         ORDER BY is_hq DESC, name ASC`,
        [orgId]
      );
      res.json({
        location_id: req.locationId || null,
        location_name: req.locationName || null,
        locations,
      });
    } catch (e) {
      logger.error({ err: e }, "me/active-location GET failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /**
   * POST /me/active-location
   * Switch the user's active location. The location must belong to the user's
   * current org and be active. Persists in session.
   *
   * Body: { location_id: string (UUID) | null }
   *   null → clear explicit selection (org-wide view).
   *          Not allowed for membership-bound users.
   *
   * Security: location-bound memberships cannot switch to a different location.
   */
  router.post("/me/active-location", requireAuth, async (req, res) => {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    try {
      const orgId = req.orgId || null;
      if (!orgId) {
        return res.status(403).json({ error: "NO_ORG_CONTEXT", message: "Organisations-Kontext erforderlich." });
      }

      // Resolve membership for binding check (use req.orgMembership if already loaded)
      const membership = req.orgMembership ||
        await rbacService.getMembership(pool, req.session.userId, orgId);

      const membershipLocationId =
        membership?.location_id ||
        req.session._orgCache?.defaultLocationId ||
        null;
      const isBound = !!membershipLocationId;

      const locationId = req.body?.location_id ?? null;

      if (locationId === null) {
        // Clearing explicit selection: not allowed for bound memberships
        if (isBound) {
          return res.status(403).json({
            error:   "LOCATION_BOUND",
            message: "Ihre Mitgliedschaft ist an einen Standort gebunden und kann nicht auf alle Standorte erweitert werden."
          });
        }
        delete req.session._locationCache;
        return res.json({ ok: true, location_id: null, location_name: null });
      }

      if (!UUID_RE.test(String(locationId))) {
        return res.status(400).json({ error: "INVALID_LOCATION_ID", message: "Ungültige Standort-ID." });
      }

      // Binding enforcement: bound membership may only confirm its own location
      if (isBound && locationId !== membershipLocationId) {
        return res.status(403).json({
          error:   "LOCATION_BOUND",
          message: "Ihre Mitgliedschaft erlaubt keinen Standortwechsel."
        });
      }

      const { rows } = await pool.query(
        "SELECT id, name FROM org_locations WHERE id = $1 AND org_id = $2 AND is_active = TRUE",
        [locationId, orgId]
      );
      const loc = rows[0];
      if (!loc) {
        return res.status(404).json({ error: "LOCATION_NOT_FOUND", message: "Standort nicht gefunden oder nicht zugänglich." });
      }

      req.session._locationCache = { locationId: loc.id, locationName: loc.name };
      res.locals.audit = {
        action:      "user.location_switch",
        entity_type: "org_location",
        entity_id:   loc.id,
        details:     { org_id: orgId, location_name: loc.name },
      };
      res.json({ ok: true, location_id: loc.id, location_name: loc.name });
    } catch (e) {
      logger.error({ err: e }, "me/active-location POST failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /**
   * DELETE /me/active-location
   * Clears the explicit location selection from session.
   * The system will fall back to the membership-assigned default location.
   */
  router.delete("/me/active-location", requireAuth, (req, res) => {
    try {
      delete req.session._locationCache;
      res.json({ ok: true, location_id: null });
    } catch (e) {
      logger.error({ err: e }, "me/active-location DELETE failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/me/export", requireAuth, async (req, res) => {
    try {
      // Versuche vollstaendigen DSGVO-Export (4-Kategorien), Fallback auf Legacy
      let exportData;
      try {
        exportData = await dgSvc.exportUserDataFull(pool, req.session.userId);
      } catch {
        exportData = await userService.exportUserData(pool, req.session.userId);
      }
      if (!exportData) return res.status(404).json({ error: "USER_NOT_FOUND" });
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", "attachment; filename=tempconnect-datenexport.json");
      res.json(exportData);
    } catch (e) {
      logger.error({ err: e }, "DSGVO-Export fehlgeschlagen");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/me/plan", requireAuth, async (req, res) => {
    const plan = String(req.body?.plan || "");
    if (!["DEMO", "FREE", "BASIS", "PLUS", "PRO", "ENTERPRISE", "INDIVIDUELL", "INDIVIDUAL"].includes(plan)) return res.status(400).json({ error: "INVALID_PLAN" });
    const orgId = await resolveOrgId(req, req.session.userId);
    if (!orgId) return res.status(403).json({ error: "NO_ORG_CONTEXT" });
    const targetPlan = normalizePlanKey(plan);
    const current = await getUserAndPlan(req.session.userId, { orgId });
    const currentPlan = normalizePlanKey(current?.plan || "DEMO");
    const targetRank = planRank(targetPlan);
    const currentRank = planRank(currentPlan);
    const isDowngrade = (targetRank != null && currentRank != null)
      ? targetRank < currentRank
      : ["DEMO", "FREE"].includes(targetPlan);
    const isUpgrade = (targetRank != null && currentRank != null)
      ? targetRank > currentRank
      : !isDowngrade;
    const isIndividuell = ["INDIVIDUELL", "INDIVIDUAL", "ENTERPRISE"].includes(targetPlan);

    if (isDowngrade) {
      const permission = await rbacService.checkPermission(pool, req.session.userId, orgId, "org.billing");
      if (!permission.allowed) {
        return res.status(403).json({
          error: "PERMISSION_DENIED",
          message: "Keine Berechtigung fuer diese Aktion."
        });
      }
    }

    if (isIndividuell) {
      // Upgrade auf INDIVIDUELL: Pilot-Pfad aktivieren
      try {
        await pilotPolicyService.activatePilotForOrganization(pool, {
          orgId,
          actorUserId: req.session.userId,
          source: "self_service"
        });
      } catch (e) {
        if (e?.code === "PILOT_NOT_ELIGIBLE") {
          return res.status(409).json({ error: "PILOT_NOT_ELIGIBLE", details: e.details || null });
        }
        if (e?.code === "PILOT_POLICY_SCHEMA_MISSING") {
          return res.status(503).json({ error: e.code, message: e.message });
        }
        throw e;
      }
    } else if (isUpgrade) {
      // Bezahlter Plan (BASIS/PLUS/PRO): Pilot konvertieren falls aktiv
      try {
        await pilotPolicyService.convertPilotForOrganization(pool, {
          orgId,
          actorUserId: req.session.userId,
          plan
        });
      } catch (e) {
        if (e?.code === "PILOT_POLICY_SCHEMA_MISSING") {
          return res.status(503).json({ error: e.code, message: e.message });
        }
        throw e;
      }
    }
    // Downgrade auf DEMO/FREE: nur Subscription aendern, kein Pilot-Trigger

    await userService.changePlan(pool, req.session.userId, plan);
    try {
      await pool.query(
        "UPDATE organizations SET plan = $2, updated_at = NOW() WHERE id = $1",
        [orgId, targetPlan]
      );
    } catch { /* non-critical */ }
    const me = await getUserAndPlan(req.session.userId, { orgId });
    res.locals.audit = { action: "user.plan_change", entity_type: "user", entity_id: req.session.userId, new_values: { plan } };
    res.json({ ...me, plan_display_label: getPlanDisplayLabel(me.plan) });
  });

  router.post("/me/plan/cancel", requireAuth, async (req, res) => {
    const orgId = await resolveOrgId(req, req.session.userId);
    if (!orgId) {
      return res.status(403).json({ error: "NO_ORG_CONTEXT", message: "Organisations-Kontext erforderlich." });
    }
    const permission = await rbacService.checkPermission(pool, req.session.userId, orgId, "org.billing");
    if (!permission.allowed) {
      return res.status(403).json({ error: "PERMISSION_DENIED", message: "Keine Berechtigung fuer diese Aktion." });
    }

    const subscription = await userService.getLatestSubscription(pool, req.session.userId);
    if (!subscription) {
      return res.status(409).json({ error: "NO_ACTIVE_SUBSCRIPTION", message: "Kein aktives Abo zum Kuendigen." });
    }
    const normalizedPlan = normalizePlanKey(subscription.plan);
    if (normalizedPlan === "DEMO") {
      return res.status(409).json({ error: "NO_ACTIVE_SUBSCRIPTION", message: "Kein aktives Abo zum Kuendigen." });
    }
    if (subscription.status === "canceling") {
      return res.status(409).json({
        error: "ALREADY_CANCELING",
        message: "Kuendigung ist bereits vorgemerkt.",
        cancel_at: subscription.cancel_at || null
      });
    }
    if (subscription.status === "canceled") {
      return res.status(409).json({ error: "ALREADY_CANCELED", message: "Abo ist bereits gekuendigt." });
    }

    let orgBilling = { billing_mode: null, custom_quote_pending: false, pilot_status: null };
    try {
      const { rows } = await pool.query(
        "SELECT billing_mode, custom_quote_pending, pilot_status FROM organizations WHERE id = $1",
        [orgId]
      );
      if (rows[0]) {
        orgBilling = {
          billing_mode: rows[0].billing_mode || null,
          custom_quote_pending: rows[0].custom_quote_pending === true,
          pilot_status: rows[0].pilot_status || null
        };
      }
    } catch { /* non-critical */ }

    const isIndividuell = normalizedPlan === "INDIVIDUELL";
    const isPilot = orgBilling.pilot_status === "active" || orgBilling.billing_mode === "pilot_contract";

    if (isIndividuell && !isPilot) {
      return res.status(409).json({
        error: "MANUAL_CANCELLATION_REQUIRED",
        message: "Individueller Tarif kann nur ueber das Account-Team gekuendigt werden.",
        support_url: "/public/enterprise_anfrage.html"
      });
    }

    let cancelResult = null;
    if (isPilot) {
      try {
        await pilotPolicyService.endPilotForOrganization(pool, {
          orgId,
          actorUserId: req.session.userId,
          reason: "self_service_cancel"
        });
      } catch (e) {
        if (e?.code === "PILOT_POLICY_SCHEMA_MISSING") {
          return res.status(503).json({ error: e.code, message: e.message });
        }
        throw e;
      }
      await userService.cancelPlanImmediately(pool, {
        userId: req.session.userId,
        actorUserId: req.session.userId,
        source: "self_service",
        reason: "pilot_cancel",
        orgId
      });
      res.locals.audit = { action: "user.plan_cancel", entity_type: "user", entity_id: req.session.userId, new_values: { plan: "DEMO" } };
    } else {
      cancelResult = await userService.schedulePlanCancellation(pool, {
        userId: req.session.userId,
        actorUserId: req.session.userId,
        source: "self_service",
        reason: "self_service_cancel"
      });
      res.locals.audit = {
        action: "user.plan_cancel_requested",
        entity_type: "user",
        entity_id: req.session.userId,
        new_values: { plan: normalizedPlan, cancel_at: cancelResult?.cancel_at || null }
      };
    }
    const me = await getUserAndPlan(req.session.userId, { orgId });
    res.json({ ...me, plan_display_label: getPlanDisplayLabel(me.plan) });
  });

  router.delete("/me", requireAuth, async (req, res) => {
    try {
      // Versuche DSGVO-konforme Anonymisierung zuerst, Fallback auf Hard-Delete
      let userEmail;
      try {
        const anonResult = await dgSvc.anonymizeUser(pool, req.session.userId, req.session.userId);
        if (anonResult.success) {
          userEmail = anonResult.email || (await pool.query("SELECT email FROM users WHERE id=$1", [req.session.userId])).rows[0]?.email;
        } else {
          userEmail = await userService.deleteUser(pool, req.session.userId);
        }
      } catch {
        userEmail = await userService.deleteUser(pool, req.session.userId);
      }
      if (!userEmail) return res.status(404).json({ error: "USER_NOT_FOUND" });
      res.locals.audit = { action: "user.delete", entity_type: "user", entity_id: req.session.userId };
      req.session.destroy();
      await sendMail(
        userEmail,
        "TempConnect: Account gelöscht",
        `<h2>Dein Account wurde gelöscht</h2><p>Alle deine Daten wurden aus unserem System entfernt.</p><p>Wir danken dir für die Zeit, die du bei TempConnect verbracht hast.</p><p>Falls du zurückkommen möchtest, kannst du jederzeit ein neues Konto erstellen.</p>`
      );
      res.json({ ok: true, message: "Account wurde erfolgreich gelöscht." });
    } catch (e) {
      logger.error({ err: e }, "Account-Löschung fehlgeschlagen");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/me/onboarding-status", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const me = await getUserAndPlan(userId, { orgId: req.orgId || null });
      if (!me) return res.status(404).json({ error: "USER_NOT_FOUND" });

      const role = me.role || "company";

      // Delegate to new onboardingService and convert to legacy format
      const status = await onboardingService.getOnboardingStatus(pool, userId, {
        role,
        orgId: req.orgId || null,
        onboardingCompleted: me.onboarding_completed || false
      });
      const legacy = onboardingService.toLegacyFormat(status, role);

      res.json(legacy);
    } catch (e) {
      logger.error({ err: e }, "Onboarding-Status fehlgeschlagen");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/me/onboarding-complete", requireAuth, async (req, res) => {
    try {
      await userService.markOnboardingComplete(pool, req.session.userId);
      res.locals.audit = { action: "user.onboarding_complete", entity_type: "user", entity_id: req.session.userId };
      res.json({ ok: true });
    } catch (e) {
      logger.error({ err: e }, "Onboarding-Complete fehlgeschlagen");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/me/onboarding-reset", requireAuth, async (req, res) => {
    try {
      await userService.resetOnboarding(pool, req.session.userId);
      res.locals.audit = { action: "user.onboarding_reset", entity_type: "user", entity_id: req.session.userId };
      res.json({ ok: true });
    } catch (e) {
      logger.error({ err: e }, "Onboarding-Reset fehlgeschlagen");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.put("/me/profile", requireAuth, async (req, res) => {
    try {
      const profileData = {
        company_name: String(req.body?.company_name || "").trim().slice(0, 200),
        phone: String(req.body?.phone || "").trim().slice(0, 50),
        contact_person: String(req.body?.contact_person || "").trim().slice(0, 120),
        street: String(req.body?.street || "").trim().slice(0, 200),
        postal_code: String(req.body?.postal_code || "").trim().slice(0, 20),
        city: String(req.body?.city || "").trim().slice(0, 120),
        vat_id: String(req.body?.vat_id || "").trim().slice(0, 30),
        handelsregister_number: String(req.body?.handelsregister_number || "").trim().slice(0, 50)
      };

      await userService.updateProfile(pool, req.session.userId, profileData);

      try {
        if (profileData.postal_code || profileData.city) {
          const coords = await geoService.geocode(profileData.postal_code || null, profileData.city || null);
          if (coords) {
            await userService.updateUserGeo(pool, req.session.userId, coords.lat, coords.lng);
          } else {
            await userService.clearUserGeo(pool, req.session.userId);
          }
        } else {
          await userService.clearUserGeo(pool, req.session.userId);
        }
      } catch {
        await userService.clearUserGeo(pool, req.session.userId).catch(() => {});
      }

      const me = await getUserAndPlan(req.session.userId, { orgId: req.orgId || null });
      res.locals.audit = { action: "user.profile_update", entity_type: "user", entity_id: req.session.userId, details: { changed_fields: Object.keys(profileData) } };
      res.json(me);
    } catch (e) {
      logger.error({ err: e }, "Profil-Update fehlgeschlagen");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── MFA / TOTP ──────────────────────────────────── */

  router.post("/me/totp/setup", requireAuth, async (req, res) => {
    try {
      const me = await getUserAndPlan(req.session.userId, { orgId: req.orgId || null });
      if (!me) return res.status(404).json({ error: "USER_NOT_FOUND" });
      const result = await totpService.setupTOTP(pool, req.session.userId, me.email);
      res.locals.audit = { action: "user.totp_setup", entity_type: "user", entity_id: req.session.userId };
      res.json({ secret: result.secret, otpauth_url: result.otpauthUrl });
    } catch (e) {
      logger.error({ err: e }, "TOTP setup failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/me/totp/verify", requireAuth, async (req, res) => {
    try {
      const token = String(req.body?.token || "").trim();
      if (!token || token.length !== 6) return res.status(400).json({ error: "INVALID_TOKEN" });
      const result = await totpService.verifyAndEnableTOTP(pool, req.session.userId, token);
      if (!result.ok) return res.status(400).json({ error: result.error });
      res.locals.audit = { action: "user.totp_enabled", entity_type: "user", entity_id: req.session.userId };
      res.json({ ok: true, totp_enabled: true });
    } catch (e) {
      logger.error({ err: e }, "TOTP verify failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/me/totp/disable", requireAuth, async (req, res) => {
    try {
      const token = String(req.body?.token || "").trim();
      if (!token || token.length !== 6) return res.status(400).json({ error: "INVALID_TOKEN" });
      const result = await totpService.disableTOTP(pool, req.session.userId, token);
      if (!result.ok) return res.status(400).json({ error: result.error });
      res.locals.audit = { action: "user.totp_disabled", entity_type: "user", entity_id: req.session.userId };
      res.json({ ok: true, totp_enabled: false });
    } catch (e) {
      logger.error({ err: e }, "TOTP disable failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
