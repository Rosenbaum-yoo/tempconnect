/**
 * SCIM 2.0 Router (Welle B2) — /scim/v2/Users + ServiceProviderConfig.
 * Nutzer-Provisioning aus einem HR-/IdP-System in die EIGENE Org. Nur aktiv bei SCIM_ENABLED;
 * Auth via API-Key/M2M-JWT (req.isApiKeyAuth) mit Scope admin:scim; streng org-gebunden (req.orgId).
 */
import express, { Router } from "express";
import { requireScope } from "../middleware/apiKeyAuth.js";
import * as scim from "../services/scimService.js";
import * as auditLog from "../services/auditLog.js";

/** @param {{ pool, config, logger }} deps */
export function createScimRouter(deps) {
  const { pool, config, logger } = deps;
  const router = Router();
  const scimJson = express.json({ type: ["application/json", "application/scim+json"], limit: "1mb" });
  const base = String(config.BASE_URL || "").replace(/\/+$/, "");

  function send(res, status, body) { res.status(status); res.type("application/scim+json"); res.send(JSON.stringify(body)); }

  // Gate: SCIM aktiv + API-Key/M2M-Auth + org-Kontext. (Scope-Check via requireScope dahinter.)
  function scimGate(req, res, next) {
    if (!config.SCIM_ENABLED) return send(res, 404, scim.scimError(404, "SCIM ist nicht aktiviert."));
    if (!req.isApiKeyAuth || !req.orgId) return send(res, 401, scim.scimError(401, "API-Key/Token mit Scope admin:scim erforderlich."));
    next();
  }
  const scope = requireScope("admin:scim");

  router.get("/scim/v2/ServiceProviderConfig", (req, res) => {
    if (!config.SCIM_ENABLED) return send(res, 404, scim.scimError(404, "SCIM ist nicht aktiviert."));
    send(res, 200, {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
      documentationUri: base + "/api/docs",
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 200 },
      changePassword: { supported: false }, sort: { supported: false }, etag: { supported: false },
      authenticationSchemes: [{ type: "oauthbearertoken", name: "OAuth Bearer Token", description: "API-Key (tc_live_) oder M2M-JWT mit Scope admin:scim", primary: true }]
    });
  });

  router.get("/scim/v2/Users", scimGate, scope, async (req, res) => {
    try {
      const filterEmail = scim.parseUserNameFilter(req.query.filter);
      const startIndex = parseInt(req.query.startIndex, 10) || 1;
      const count = parseInt(req.query.count, 10) || 100;
      const { total, resources } = await scim.listUsers(pool, req.orgId, { filterEmail, startIndex, count });
      send(res, 200, {
        schemas: [scim.SCIM_LIST_SCHEMA], totalResults: total, startIndex,
        itemsPerPage: resources.length, Resources: resources.map((r) => scim.toScimUser(r, base))
      });
    } catch (err) { logger.error({ err: err.message }, "SCIM list"); send(res, 500, scim.scimError(500, "Serverfehler")); }
  });

  router.get("/scim/v2/Users/:id", scimGate, scope, async (req, res) => {
    try {
      const row = await scim.getUser(pool, req.orgId, req.params.id);
      if (!row) return send(res, 404, scim.scimError(404, "User nicht gefunden", "noTarget"));
      send(res, 200, scim.toScimUser(row, base));
    } catch (err) { logger.error({ err: err.message }, "SCIM get"); send(res, 500, scim.scimError(500, "Serverfehler")); }
  });

  router.post("/scim/v2/Users", scimGate, scope, scimJson, async (req, res) => {
    try {
      const emails = Array.isArray(req.body?.emails) ? req.body.emails : [];
      const userName = req.body?.userName || (emails.find((e) => e.primary)?.value || emails[0]?.value) || null;
      const displayName = req.body?.displayName || req.body?.name?.formatted ||
        [req.body?.name?.givenName, req.body?.name?.familyName].filter(Boolean).join(" ");
      const enterprise = scim.extractEnterpriseAttrs(req.body);
      const { row, created } = await scim.provisionUser(pool, req.orgId, { userName, displayName, enterprise });
      try { await auditLog.writeAudit(pool, { action: "scim.user_provisioned", entity_type: "user", entity_id: row.id, details: { org_id: req.orgId, created, user_name: row.email, hr_fields: Object.keys(enterprise) } }); } catch { /* best-effort */ }
      send(res, created ? 201 : 200, scim.toScimUser(row, base));
    } catch (err) {
      if (err.code === "INVALID_USERNAME") return send(res, 400, scim.scimError(400, "userName (E-Mail) erforderlich", "invalidValue"));
      logger.error({ err: err.message }, "SCIM create"); send(res, 500, scim.scimError(500, "Serverfehler"));
    }
  });

  // PUT (Replace) + PATCH (Operations): aktualisiert active und/oder HRIS-Attribute (enterprise:2.0).
  async function applyUpdate(req, res) {
    try {
      const active = scim.extractActiveFromPatch(req.body);
      const enterprise = scim.extractEnterpriseAttrs(req.body);
      const hasHr = Object.keys(enterprise).length > 0;
      if (active === null && !hasHr) return send(res, 400, scim.scimError(400, "active- oder Enterprise-Attribut (employeeNumber/costCenter/department/division) erforderlich", "invalidValue"));
      let row = null;
      if (active !== null) {
        row = await scim.setMembershipActive(pool, req.orgId, req.params.id, active);
        if (!row) return send(res, 404, scim.scimError(404, "User nicht gefunden", "noTarget"));
      }
      if (hasHr) {
        row = await scim.setMembershipHrAttributes(pool, req.orgId, req.params.id, enterprise);
        if (!row) return send(res, 404, scim.scimError(404, "User nicht gefunden", "noTarget"));
      }
      if (active !== null) { try { await auditLog.writeAudit(pool, { action: active ? "scim.user_activated" : "scim.user_deactivated", entity_type: "user", entity_id: req.params.id, details: { org_id: req.orgId } }); } catch { /* best-effort */ } }
      if (hasHr) { try { await auditLog.writeAudit(pool, { action: "scim.user_hr_updated", entity_type: "user", entity_id: req.params.id, details: { org_id: req.orgId, fields: Object.keys(enterprise) } }); } catch { /* best-effort */ } }
      send(res, 200, scim.toScimUser(row, base));
    } catch (err) { logger.error({ err: err.message }, "SCIM update"); send(res, 500, scim.scimError(500, "Serverfehler")); }
  }
  router.patch("/scim/v2/Users/:id", scimGate, scope, scimJson, applyUpdate);
  router.put("/scim/v2/Users/:id", scimGate, scope, scimJson, applyUpdate);

  router.delete("/scim/v2/Users/:id", scimGate, scope, async (req, res) => {
    try {
      const row = await scim.setMembershipActive(pool, req.orgId, req.params.id, false);
      if (!row) return send(res, 404, scim.scimError(404, "User nicht gefunden", "noTarget"));
      try { await auditLog.writeAudit(pool, { action: "scim.user_deactivated", entity_type: "user", entity_id: req.params.id, details: { org_id: req.orgId, via: "DELETE" } }); } catch { /* best-effort */ }
      res.status(204).end();
    } catch (err) { logger.error({ err: err.message }, "SCIM delete"); send(res, 500, scim.scimError(500, "Serverfehler")); }
  });

  return router;
}
