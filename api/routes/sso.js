import { Router } from "express";
import * as ssoService from "../services/ssoService.js";
import { resolveAdminAccess, resolveSsoCardAvailability } from "../services/adminControlCenterService.js";
import { stampSession } from "../services/sessionSecurityService.js";

export function createSSORouter(deps) {
  const { pool, config, requireAuth, logger, getUserAndPlan, authLimiter } = deps;
  // SSO callback is an auth endpoint — apply strict rate limiting (same as login).
  const ssoCallbackLimiter = authLimiter || ((_req, _res, next) => next());
  const router = Router();
  const BASE_URL = (config.BASE_URL || "http://localhost:8080").replace(/\/$/, "");

  async function requireSsoAdminAccess(req, res, next) {
    const requestedOrgId = String(req.params.orgId || "").trim();
    if (!requestedOrgId) return res.status(400).json({ error: "ORG_ID_REQUIRED" });
    try {
      const viewer = await getUserAndPlan(req.session.userId);
      if (!viewer) return res.status(401).json({ error: "NOT_AUTHENTICATED" });
      const access = resolveAdminAccess(viewer, {
        orgId: req.orgId || viewer.org_id || null,
        orgName: req.orgName || viewer.org_name || null,
        orgRole: req.orgRole || viewer.org_role || null,
        userRole: req.session?.userRole || viewer.role || null
      });
      const sameOrg = access.org_id && access.org_id === requestedOrgId;
      if (!access.is_platform_admin && !(sameOrg && access.can_manage_org_settings)) {
        return res.status(403).json({
          error: "ADMIN_REQUIRED",
          message: "SSO-Konfiguration erfordert Organisations- oder Plattform-Adminrechte."
        });
      }
      const availability = resolveSsoCardAvailability({
        viewer,
        access: {
          ...access,
          org_id: requestedOrgId,
          has_org: true
        },
        configured: false,
        mode: ssoService.getSSOMode()
      });
      if (availability.state !== "active") {
        const status = availability.code === "PLAN_REQUIRED" ? 403 : 409;
        return res.status(status).json({
          error: availability.code || "SSO_UNAVAILABLE",
          message: availability.message
        });
      }
      req.ssoViewer = viewer;
      next();
    } catch (e) {
      logger.error({ err: e }, "SSO admin access guard failed");
      res.status(500).json({ error: "SSO_GUARD_ERROR" });
    }
  }

  /** GET /sso/login/:orgId — Initiate SSO Login */
  router.get("/sso/login/:orgId", async (req, res) => {
    try {
      const result = await ssoService.initiateSSOLogin(pool, req.params.orgId, BASE_URL);
      if (result.error) return res.status(400).json({ error: result.error });
      res.json({ redirect_url: result.redirect_url, mode: result.mode });
    } catch (e) {
      logger.error({ err: e }, "SSO login initiation failed");
      res.status(500).json({ error: "SSO_ERROR" });
    }
  });

  /** POST /sso/callback — Handle SAML Response (ssoCallbackLimiter: strict auth rate limit) */
  router.post("/sso/callback", ssoCallbackLimiter, async (req, res) => {
    try {
      res.locals.audit = {
        action: "sso.callback_attempt",
        entity_type: "sso_config",
        entity_id: req.body?.RelayState || req.query?.RelayState || null
      };
      const relayState = req.body?.RelayState || req.query?.RelayState || null;
      const isStub = req.query?.stub === '1';
      let result;

      if (isStub) {
        // WAVE 09 Option B: Stub-Modus ist in Production vollständig gesperrt
        if (process.env.NODE_ENV === "production") {
          return res.status(403).json({ error: "SSO_STUB_NOT_ALLOWED", message: "SSO Stub-Modus ist in Production deaktiviert." });
        }
        // Stub-Modus (lokal ohne IDP)
        result = await ssoService.handleStubCallback(pool, relayState, req.session?.userId);
      } else {
        const samlResponse = req.body?.SAMLResponse;
        if (!samlResponse) return res.status(400).json({ error: "MISSING_SAML_RESPONSE" });
        result = await ssoService.handleSAMLCallback(pool, samlResponse, relayState, BASE_URL);
      }

      if (result.error) return res.status(400).json({ error: result.error, message: result.message });

      // SEC-001: Session regenerieren
      await new Promise((resolve, reject) => req.session.regenerate((err) => err ? reject(err) : resolve()));
      req.session.userId = result.userId;
      stampSession(req.session); // P5.1: Hoechstalter zaehlt ab hier — nach regenerate
      req.session.ssoOrgId = result.orgId;
      res.locals.audit = {
        action: "sso.callback_success",
        entity_type: "organization",
        entity_id: result.orgId,
        details: { user_id: result.userId }
      };
      res.redirect("/public/enterprise.html");
    } catch (e) {
      logger.error({ err: e }, "SSO callback failed");
      res.status(500).json({ error: "SSO_CALLBACK_ERROR" });
    }
  });

  /** GET /sso/callback — Stub-Callback via GET (Redirect, nur in Entwicklung) */
  router.get("/sso/callback", async (req, res) => {
    try {
      // WAVE 09 Option B: Stub-Modus ist in Production vollständig gesperrt
      if (process.env.NODE_ENV === "production") {
        return res.status(403).json({ error: "SSO_STUB_NOT_ALLOWED", message: "SSO Stub-Modus ist in Production deaktiviert." });
      }
      const relayState = req.query?.RelayState || null;
      if (req.query?.stub !== '1') return res.status(400).json({ error: "INVALID_CALLBACK" });
      const result = await ssoService.handleStubCallback(pool, relayState, req.session?.userId);
      if (result.error) return res.status(400).json({ error: result.error });
      await new Promise((resolve, reject) => req.session.regenerate((err) => err ? reject(err) : resolve()));
      req.session.userId = result.userId;
      stampSession(req.session); // P5.1: Hoechstalter zaehlt ab hier — nach regenerate
      req.session.ssoOrgId = result.orgId;
      res.redirect("/public/enterprise.html");
    } catch (e) {
      logger.error({ err: e }, "SSO stub callback failed");
      res.status(500).json({ error: "SSO_CALLBACK_ERROR" });
    }
  });

  /** GET /sso/metadata/:orgId — SP Metadata XML */
  router.get("/sso/metadata/:orgId", (req, res) => {
    const xml = ssoService.generateSPMetadata(req.params.orgId, BASE_URL);
    res.type("application/xml").send(xml);
  });

  /** GET /sso/lookup — Org-Lookup per E-Mail-Domain */
  router.get("/sso/lookup", async (req, res) => {
    try {
      const email = String(req.query?.email || "").trim();
      if (!email || !email.includes("@")) return res.status(400).json({ error: "EMAIL_REQUIRED" });
      const org = await ssoService.lookupOrgByEmailDomain(pool, email);
      if (!org) return res.json({ sso_available: false });
      res.json({ sso_available: true, org_id: org.org_id, org_name: org.org_name, enforce_sso: org.enforce_sso });
    } catch (e) {
      logger.error({ err: e }, "SSO lookup failed");
      res.status(500).json({ error: "SSO_LOOKUP_ERROR" });
    }
  });

  /** GET /sso/config/:orgId — Get SSO Config (Admin) */
  router.get("/sso/config/:orgId", requireAuth, requireSsoAdminAccess, async (req, res) => {
    const cfg = await ssoService.getSSOConfig(pool, req.params.orgId);
    if (!cfg) return res.json({ configured: false });
    // Certificate nicht vollstaendig zurueckgeben
    res.json({ ...cfg, idp_certificate: cfg.idp_certificate ? "***configured***" : null, configured: true, sso_mode: ssoService.getSSOMode() });
  });

  /** PUT /sso/config/:orgId — Update SSO Config (Admin) */
  router.put("/sso/config/:orgId", requireAuth, requireSsoAdminAccess, async (req, res) => {
    try {
      const result = await ssoService.upsertSSOConfig(pool, req.params.orgId, req.body);
      res.locals.audit = { action: "sso.config_upsert", entity_type: "sso_config", entity_id: req.params.orgId };
      res.json({ ok: true, config: result });
    } catch (e) {
      logger.error({ err: e }, "SSO config update failed");
      res.status(500).json({ error: "SSO_CONFIG_ERROR" });
    }
  });

  /** DELETE /sso/config/:orgId — SSO Config loeschen (Admin) */
  router.delete("/sso/config/:orgId", requireAuth, requireSsoAdminAccess, async (req, res) => {
    try {
      await ssoService.deleteSSOConfig(pool, req.params.orgId);
      res.locals.audit = { action: "sso.config_delete", entity_type: "sso_config", entity_id: req.params.orgId };
      res.json({ ok: true });
    } catch (e) {
      logger.error({ err: e }, "SSO config delete failed");
      res.status(500).json({ error: "SSO_CONFIG_ERROR" });
    }
  });

  /** POST /sso/test/:orgId — SSO Config validieren */
  router.post("/sso/test/:orgId", requireAuth, requireSsoAdminAccess, async (req, res) => {
    try {
      const result = await ssoService.testSSOConfig(pool, req.params.orgId, BASE_URL);
      res.locals.audit = { action: "sso.config_test", entity_type: "sso_config", entity_id: req.params.orgId, details: { ok: result?.ok ?? null } };
      res.json(result);
    } catch (e) {
      logger.error({ err: e }, "SSO config test failed");
      res.status(500).json({ error: "SSO_TEST_ERROR" });
    }
  });

  return router;
}
