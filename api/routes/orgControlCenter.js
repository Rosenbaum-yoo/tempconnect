/**
 * Organization Control Center Router — konsolidierter /api/org/* Namespace.
 *
 * Vereint alle org-scoped Management-Endpoints in einem Router:
 *  - Overview, Members, API Keys, Webhooks, Audit Log, Usage, Security
 *
 * Delegiert an bestehende Services — keine Parallelstrukturen.
 * Alle Endpoints erfordern Auth + Org-Kontext.
 */
import { z } from "zod";
import { Router } from "express";
import { requirePermission, requireRole } from "../middleware/rbac.js";
import { requireOrgFeature } from "../middleware/entitlementGuard.js";
import * as orgService from "../services/organizationService.js";
import * as apiKeyService from "../services/apiKeyService.js";
import * as integrationService from "../services/integrationService.js";
import * as settingsService from "../services/settingsService.js";
import * as billingMetrics from "../services/billingMetricsService.js";
import { queryOrgAuditLog } from "../services/auditLog.js";
import { PERMISSIONS, ROLE_HIERARCHY } from "../services/rbacService.js";

/* ── Zod Schemas ───────────────────────────────────────── */

const createApiKeySchema = z.object({
  label: z.string().max(200).optional().default(""),
  scopes: z.array(z.enum(apiKeyService.VALID_SCOPES)).optional().default([]),
  expires_at: z.string().datetime().optional().nullable()
});

const updateMemberSchema = z.object({
  role_key: z.enum([
    "owner", "admin", "program_manager", "hiring_manager", "supplier_manager",
    "finance", "member", "supplier_user", "recruiter", "dispatcher", "viewer"
  ])
});

const locationCreateSchema = z.object({
  name:        z.string().min(1).max(200),
  street:      z.string().max(300).optional().nullable(),
  city:        z.string().min(1).max(200),
  postal_code: z.string().max(20).optional().nullable(),
  country:     z.string().max(5).optional().default("DE"),
  latitude:    z.number().optional().nullable(),
  longitude:   z.number().optional().nullable(),
  is_hq:       z.boolean().optional().default(false)
});

const locationUpdateSchema = locationCreateSchema.partial().extend({
  is_active: z.boolean().optional()
});

const departmentCreateSchema = z.object({
  name:        z.string().min(1).max(200),
  cost_center: z.string().max(50).optional().nullable(),
  location_id: z.string().uuid().optional().nullable()
});

const departmentUpdateSchema = departmentCreateSchema.partial().extend({
  is_active: z.boolean().optional()
});

const updateSecuritySchema = z.object({
  approval_required: z.boolean().optional(),
  preferred_supplier_only: z.boolean().optional(),
  auto_match_enabled: z.boolean().optional(),
  inter_agency_matching_enabled: z.boolean().optional(),
  inter_agency_supply_visible: z.boolean().optional(),
  default_radius_km: z.number().int().min(1).max(500).optional(),
  compliance_strictness: z.enum(["relaxed", "standard", "strict"]).optional(),
  notification_preferences: z.record(z.unknown()).optional(),
  branding: z.record(z.unknown()).optional()
});

/**
 * @param {{ pool, requireAuth, logger }} deps
 */
export function createOrgControlCenterRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();
  const rperm = (p) => requirePermission(p, { pool, logger });
  const orgSettingsGate = requireOrgFeature("org_settings", { pool, logger });
  const integrationsGate = requireOrgFeature("integrations", { pool, logger });

  // Org-Kontext Pflicht fuer alle Endpoints
  const ensureOrg = (req, res, next) => {
    if (!req.orgId) return res.status(400).json({ success: false, error: { code: "ORG_REQUIRED", message: "Organisation erforderlich." } });
    next();
  };

  /* ═══════════════════════════════════════════════════════
   *  OVERVIEW — Org-Dashboard mit Counts
   * ═══════════════════════════════════════════════════════ */

  router.get("/org/overview", requireAuth, ensureOrg, rperm("org.settings"),
    async (req, res) => {
      try {
        const [org, members, integrations, apiKeyCount] = await Promise.all([
          orgService.getOrganization(pool, req.orgId),
          orgService.listOrgMembers(pool, req.orgId),
          integrationService.listIntegrations(pool, req.orgId),
          apiKeyService.countActiveKeys(pool, req.orgId)
        ]);

        if (!org) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });

        res.json({
          success: true,
          data: {
            organization: {
              id: org.id,
              name: org.name,
              slug: org.slug,
              type: org.type,
              plan: org.plan || null,
              is_active: org.is_active,
              created_at: org.created_at
            },
            counts: {
              members: members.length,
              active_members: members.filter(m => m.is_active !== false).length,
              integrations: integrations.length,
              active_integrations: integrations.filter(i => i.is_active).length,
              api_keys: apiKeyCount,
              locations: org.location_count || 0,
              departments: org.department_count || 0
            }
          }
        });
      } catch (err) {
        logger.error({ err: err.message }, "org/overview");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  /* ═══════════════════════════════════════════════════════
   *  MEMBERS — Mitgliederverwaltung
   * ═══════════════════════════════════════════════════════ */

  router.get("/org/members", requireAuth, ensureOrg, rperm("org.members"),
    async (req, res) => {
      try {
        const members = await orgService.listOrgMembers(pool, req.orgId);
        res.json({ success: true, data: { items: members, total: members.length } });
      } catch (err) {
        logger.error({ err: err.message }, "org/members list");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  router.patch("/org/members/:userId", requireAuth, ensureOrg, rperm("org.members"),
    async (req, res) => {
      try {
        const parsed = updateMemberSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ success: false, error: { code: "VALIDATION", details: parsed.error.issues } });

        const updated = await orgService.updateMemberRole(pool, req.orgId, req.params.userId, parsed.data.role_key);
        if (!updated) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });

        res.locals.audit = {
          action: "org.member.role_change", entity_type: "org_membership",
          entity_id: req.params.userId, details: { org_id: req.orgId, new_role: parsed.data.role_key }
        };
        res.json({ success: true, data: updated });
      } catch (err) {
        logger.error({ err: err.message }, "org/members update");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  router.delete("/org/members/:userId", requireAuth, ensureOrg, rperm("org.members"),
    async (req, res) => {
      try {
        const deactivated = await orgService.deactivateMember(pool, req.orgId, req.params.userId);
        if (!deactivated) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });

        res.locals.audit = {
          action: "org.member.remove", entity_type: "org_membership",
          entity_id: req.params.userId, details: { org_id: req.orgId }
        };
        res.json({ success: true, data: { removed: true } });
      } catch (err) {
        logger.error({ err: err.message }, "org/members delete");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  /* ═══════════════════════════════════════════════════════
   *  API KEYS — Schlüsselverwaltung
   * ═══════════════════════════════════════════════════════ */

  router.get("/org/api-keys", requireAuth, ensureOrg, rperm("org.settings"),
    async (req, res) => {
      try {
        const keys = await apiKeyService.listApiKeys(pool, req.orgId);
        res.json({ success: true, data: { items: keys, total: keys.length } });
      } catch (err) {
        logger.error({ err: err.message }, "org/api-keys list");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  router.post("/org/api-keys", requireAuth, ensureOrg, integrationsGate, rperm("org.settings"),
    async (req, res) => {
      try {
        const parsed = createApiKeySchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ success: false, error: { code: "VALIDATION", details: parsed.error.issues } });

        const result = await apiKeyService.createApiKey(pool, req.orgId, {
          ...parsed.data,
          created_by: req.session.userId
        });

        res.locals.audit = {
          action: "org.api_key.create", entity_type: "org_api_key",
          entity_id: result.id, details: { label: parsed.data.label }
        };
        res.status(201).json({ success: true, data: result });
      } catch (err) {
        logger.error({ err: err.message }, "org/api-keys create");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  router.delete("/org/api-keys/:id", requireAuth, ensureOrg, integrationsGate, rperm("org.settings"),
    async (req, res) => {
      try {
        const revoked = await apiKeyService.revokeApiKey(pool, req.params.id, req.orgId);
        if (!revoked) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });

        res.locals.audit = {
          action: "org.api_key.revoke", entity_type: "org_api_key",
          entity_id: req.params.id, details: { org_id: req.orgId }
        };
        res.json({ success: true, data: { revoked: true } });
      } catch (err) {
        logger.error({ err: err.message }, "org/api-keys revoke");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  router.post("/org/api-keys/:id/rotate", requireAuth, ensureOrg, integrationsGate, rperm("org.settings"),
    async (req, res) => {
      try {
        const result = await apiKeyService.rotateApiKey(pool, req.params.id, req.orgId, {
          created_by: req.session.userId
        });
        if (!result) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });

        res.locals.audit = {
          action: "org.api_key.rotate", entity_type: "org_api_key",
          entity_id: result.new_key.id, details: { old_key_id: result.old_key_id }
        };
        res.status(201).json({ success: true, data: result });
      } catch (err) {
        logger.error({ err: err.message }, "org/api-keys rotate");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  router.get("/org/api-keys/scopes", requireAuth, ensureOrg,
    (_req, res) => {
      res.json({ success: true, data: { scopes: apiKeyService.getValidScopes() } });
    }
  );

  /* ═══════════════════════════════════════════════════════
   *  WEBHOOKS — Delegiert an integrationService
   * ═══════════════════════════════════════════════════════ */

  router.get("/org/webhooks", requireAuth, ensureOrg, rperm("org.settings"),
    async (req, res) => {
      try {
        const integrations = await integrationService.listIntegrations(pool, req.orgId);
        res.json({ success: true, data: { items: integrations, total: integrations.length } });
      } catch (err) {
        logger.error({ err: err.message }, "org/webhooks");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  /* ═══════════════════════════════════════════════════════
   *  AUDIT LOG — Delegiert an queryOrgAuditLog
   * ═══════════════════════════════════════════════════════ */

  router.get("/org/audit-log", requireAuth, ensureOrg,
    requireRole(["owner", "admin", "platform_admin"], { pool, logger }),
    async (req, res) => {
      try {
        const limit  = Math.min(500, parseInt(req.query.limit) || 50);
        const offset = parseInt(req.query.offset) || 0;

        const result = await queryOrgAuditLog(pool, req.orgId, {
          actor_id:    req.query.actor_id    || null,
          entity_type: req.query.entity_type || null,
          action:      req.query.action      || null,
          action_type: req.query.action_type || null,
          status:      req.query.status      || null,
          from:        req.query.from        || null,
          to:          req.query.to          || null,
          limit,
          offset
        });

        res.json({
          success: true,
          data: { items: result.items, total: result.total, limit, offset }
        });
      } catch (err) {
        logger.error({ err: err.message }, "org/audit-log");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  /* ═══════════════════════════════════════════════════════
   *  USAGE — Billing-Metriken + Plan-Limits
   * ═══════════════════════════════════════════════════════ */

  router.get("/org/usage", requireAuth, ensureOrg, rperm("org.settings"),
    async (req, res) => {
      try {
        const [dashboard, snapshots] = await Promise.all([
          billingMetrics.getDashboardMetrics(pool, req.orgId),
          billingMetrics.getMonthlySnapshots(pool, req.orgId, 6)
        ]);

        res.json({
          success: true,
          data: {
            ...dashboard,
            monthly_snapshots: snapshots
          }
        });
      } catch (err) {
        logger.error({ err: err.message }, "org/usage");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  /* ═══════════════════════════════════════════════════════
   *  SECURITY — Org-Settings
   * ═══════════════════════════════════════════════════════ */

  router.get("/org/security", requireAuth, ensureOrg, rperm("org.settings"),
    async (req, res) => {
      try {
        const settings = await settingsService.getSettings(pool, req.orgId);

        // Sicherheitsuebersicht: Zusammenfassung der aktiven Security-Features
        const securitySummary = {
          approval_workflow: settings.approval_required || false,
          preferred_suppliers_only: settings.preferred_supplier_only || false,
          compliance_strictness: settings.compliance_strictness || "standard",
          auto_match: settings.auto_match_enabled !== false,
          inter_agency_matching: settings.inter_agency_matching_enabled === true,
          inter_agency_supply_visible: settings.inter_agency_supply_visible === true,
          rbac_enforced: true,       // Immer aktiv
          audit_logging: true,       // Immer aktiv
          csrf_protection: true,     // Immer aktiv
          rate_limiting: true,       // Immer aktiv
          encryption_at_rest: true,  // PostgreSQL + Volume
          encryption_in_transit: true // TLS via Nginx
        };

        res.json({
          success: true,
          data: {
            settings,
            security_summary: securitySummary
          }
        });
      } catch (err) {
        logger.error({ err: err.message }, "org/security GET");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  router.patch("/org/security", requireAuth, ensureOrg, orgSettingsGate, rperm("org.settings"),
    async (req, res) => {
      try {
        const parsed = updateSecuritySchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ success: false, error: { code: "VALIDATION", details: parsed.error.issues } });

        const settings = await settingsService.updateSettings(pool, req.orgId, parsed.data);
        res.locals.audit = {
          action: "org.security.update", entity_type: "org_settings",
          entity_id: req.orgId, details: { changed_fields: Object.keys(parsed.data) }
        };
        res.json({ success: true, data: settings });
      } catch (err) {
        logger.error({ err: err.message }, "org/security PATCH");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  /* ═══════════════════════════════════════════════════════
   *  LOCATIONS — Standortverwaltung
   * ═══════════════════════════════════════════════════════ */

  router.get("/org/locations", requireAuth, ensureOrg,
    async (req, res) => {
      try {
        const locations = await orgService.listLocations(pool, req.orgId);
        res.json({ success: true, data: { items: locations, total: locations.length } });
      } catch (err) {
        logger.error({ err: err.message }, "org/locations list");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  router.post("/org/locations", requireAuth, ensureOrg, rperm("org.locations"),
    async (req, res) => {
      try {
        const parsed = locationCreateSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ success: false, error: { code: "VALIDATION", details: parsed.error.issues } });

        const loc = await orgService.createLocation(pool, req.orgId, parsed.data);
        res.locals.audit = {
          action: "org.location.create", entity_type: "org_location",
          entity_id: loc.id, details: { org_id: req.orgId, name: parsed.data.name, city: parsed.data.city }
        };
        res.status(201).json({ success: true, data: loc });
      } catch (err) {
        logger.error({ err: err.message }, "org/locations create");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  router.patch("/org/locations/:locId", requireAuth, ensureOrg, rperm("org.locations"),
    async (req, res) => {
      try {
        const parsed = locationUpdateSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ success: false, error: { code: "VALIDATION", details: parsed.error.issues } });

        // Verify ownership: location must belong to req.orgId
        const { rows } = await pool.query(
          "SELECT id FROM org_locations WHERE id = $1 AND org_id = $2",
          [req.params.locId, req.orgId]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });

        const updated = await orgService.updateLocation(pool, req.params.locId, parsed.data);
        res.locals.audit = {
          action: "org.location.update", entity_type: "org_location",
          entity_id: req.params.locId, details: { changed_fields: Object.keys(parsed.data) }
        };
        res.json({ success: true, data: updated });
      } catch (err) {
        logger.error({ err: err.message }, "org/locations update");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  router.delete("/org/locations/:locId", requireAuth, ensureOrg, rperm("org.locations"),
    async (req, res) => {
      try {
        const { rows } = await pool.query(
          "SELECT id FROM org_locations WHERE id = $1 AND org_id = $2",
          [req.params.locId, req.orgId]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });

        await orgService.updateLocation(pool, req.params.locId, { is_active: false });
        res.locals.audit = {
          action: "org.location.deactivate", entity_type: "org_location",
          entity_id: req.params.locId, details: { org_id: req.orgId }
        };
        res.json({ success: true, data: { deactivated: true } });
      } catch (err) {
        logger.error({ err: err.message }, "org/locations delete");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  /* ═══════════════════════════════════════════════════════
   *  DEPARTMENTS — Abteilungsverwaltung
   * ═══════════════════════════════════════════════════════ */

  router.get("/org/departments", requireAuth, ensureOrg,
    async (req, res) => {
      try {
        const depts = await orgService.listDepartments(pool, req.orgId);
        res.json({ success: true, data: { items: depts, total: depts.length } });
      } catch (err) {
        logger.error({ err: err.message }, "org/departments list");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  router.post("/org/departments", requireAuth, ensureOrg, rperm("org.departments"),
    async (req, res) => {
      try {
        const parsed = departmentCreateSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ success: false, error: { code: "VALIDATION", details: parsed.error.issues } });

        const dept = await orgService.createDepartment(pool, req.orgId, parsed.data);
        res.locals.audit = {
          action: "org.department.create", entity_type: "org_department",
          entity_id: dept.id, details: { org_id: req.orgId, name: parsed.data.name }
        };
        res.status(201).json({ success: true, data: dept });
      } catch (err) {
        logger.error({ err: err.message }, "org/departments create");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  router.patch("/org/departments/:deptId", requireAuth, ensureOrg, rperm("org.departments"),
    async (req, res) => {
      try {
        const parsed = departmentUpdateSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ success: false, error: { code: "VALIDATION", details: parsed.error.issues } });

        const { rows } = await pool.query(
          "SELECT id FROM org_departments WHERE id = $1 AND org_id = $2",
          [req.params.deptId, req.orgId]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });

        const updated = await orgService.updateDepartment(pool, req.params.deptId, parsed.data);
        res.locals.audit = {
          action: "org.department.update", entity_type: "org_department",
          entity_id: req.params.deptId, details: { changed_fields: Object.keys(parsed.data) }
        };
        res.json({ success: true, data: updated });
      } catch (err) {
        logger.error({ err: err.message }, "org/departments update");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  router.delete("/org/departments/:deptId", requireAuth, ensureOrg, rperm("org.departments"),
    async (req, res) => {
      try {
        const { rows } = await pool.query(
          "SELECT id FROM org_departments WHERE id = $1 AND org_id = $2",
          [req.params.deptId, req.orgId]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });

        await orgService.updateDepartment(pool, req.params.deptId, { is_active: false });
        res.locals.audit = {
          action: "org.department.deactivate", entity_type: "org_department",
          entity_id: req.params.deptId, details: { org_id: req.orgId }
        };
        res.json({ success: true, data: { deactivated: true } });
      } catch (err) {
        logger.error({ err: err.message }, "org/departments delete");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  /* ═══════════════════════════════════════════════════════
   *  ROLES & PERMISSIONS — Matrix fuer die UI
   * ═══════════════════════════════════════════════════════ */

  router.get("/org/roles-permissions", requireAuth, ensureOrg,
    (_req, res) => {
      const roles = [
        "owner","admin","program_manager","hiring_manager",
        "supplier_manager","finance","recruiter","dispatcher","member","viewer"
      ];
      res.json({ success: true, data: { permissions: PERMISSIONS, roles, hierarchy: ROLE_HIERARCHY } });
    }
  );

  return router;
}
