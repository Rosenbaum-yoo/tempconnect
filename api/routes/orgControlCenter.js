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
import { requireOrgFeature, requireOrgLimit } from "../middleware/entitlementGuard.js";
import { assertMemberScopeBelongsToOrg, assertLocationBelongsToOrg, OrgBoundaryError } from "../utils/orgBoundary.js";
import * as orgService from "../services/organizationService.js";
import * as apiKeyService from "../services/apiKeyService.js";
import * as integrationService from "../services/integrationService.js";
import * as settingsService from "../services/settingsService.js";
import * as billingMetrics from "../services/billingMetricsService.js";
import { queryOrgAuditLog, writeAuditEnhanced } from "../services/auditLog.js";
import { PERMISSIONS, ROLE_HIERARCHY } from "../services/rbacService.js";
import * as orgInviteService from "../services/orgInviteService.js";
import { sendMail } from "../services/emailService.js";
import { verweigereArbeiter } from "../middleware/orgAccess.js";
import { formatFeedItem } from "../services/activityFeedService.js";
import { exportAuditLogCsv } from "../services/exportService.js";
import { ROLLEN_NAMEN, rollenAngebot, rollenFuerSeite, rolleErlaubt, rollenName } from "../config/orgRollen.js";
import { todayDE } from "../utils/dateDE.js";

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

/*
 * Entfernen nur mit Grund (W-E9, 2026-10-01). Ein Mitglied zu entfernen nimmt
 * einem Menschen den Zugang zu seiner Firma; ohne Grund ist der Vorgang im
 * Protokoll in drei Monaten nicht mehr nachvollziehbar (CLAUDE.md: "reason
 * Pflichtfeld bei kritischen Aktionen").
 */
const removeMemberSchema = z.object({
  reason: z.string().trim().min(5).max(500)
});

const memberScopeSchema = z.object({
  location_id:   z.string().uuid().nullable().optional(),
  department_id: z.string().uuid().nullable().optional()
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
  const sitesLimitGate = requireOrgLimit("sites", { pool, logger });

  // Org-Kontext Pflicht fuer alle Endpoints
  const ensureOrg = (req, res, next) => {
    if (!req.orgId) return res.status(400).json({ success: false, error: { code: "ORG_REQUIRED", message: "Organisation erforderlich." } });
    next();
  };

  // Ausfuhr des Protokolls: dieselbe Drossel wie die Ausfuhr im Admin-Bereich.
  const exportLimiter = deps.requestLimiter || ((_req, _res, next) => next());

  /** Die Seite der Firma (`company` oder `agency`) — fuer die Rollen je Seite. */
  async function seiteDerFirma(orgId) {
    const { rows } = await pool.query("SELECT type FROM organizations WHERE id = $1", [orgId]);
    return rows[0]?.type || null;
  }

  /*
   * Owner-Rechte vergibt oder entzieht nur ein Owner (W-E9, 2026-10-01).
   *
   * BEFUND: `org.members` haben owner UND admin. Ein Admin konnte damit einen
   * Owner herabstufen oder entfernen (nur der LETZTE Owner war geschuetzt) und
   * sich selbst zum Owner machen — eine Rolle ueber die eigene hinaus vergeben.
   * Die Einladung sagt laengst "Owner-Rechte werden nie per Einladung
   * vergeben"; dieselbe Absicht gilt fuer Wechsel und Entfernen. Wenn nur eine
   * Person handelt, schuetzt keine Kontrolle, sondern die Struktur: die Aktion
   * kann nicht mehr vergeben, als die eigene Rolle hergibt (CLAUDE.md, "Das
   * Team ist eine Person").
   */
  function darfOwnerRechte(req) {
    return req.orgRole === "owner" || req.orgRole === "platform_admin";
  }

  function nurOwner(res) {
    return res.status(403).json({
      success: false,
      error: { code: "NUR_OWNER", message: "Owner-Rechte vergibt oder entzieht nur ein Owner." }
    });
  }

  /** Die heutige Rolle des Ziels — an die eigene Firma gebunden. */
  async function heutigeRolle(orgId, { userId = null, membershipId = null }) {
    const { rows } = membershipId
      ? await pool.query(
          "SELECT role_key FROM org_memberships WHERE id = $1 AND org_id = $2 AND is_active = TRUE LIMIT 1",
          [membershipId, orgId])
      : await pool.query(
          "SELECT role_key FROM org_memberships WHERE org_id = $1 AND user_id = $2 AND is_active = TRUE LIMIT 1",
          [orgId, userId]);
    return rows[0]?.role_key || null;
  }

  /** Die Rolle passt nicht zur Seite: verstaendlich ablehnen, nicht still. */
  function rolleFalschFuerSeite(res, seite, rolle) {
    const wer = seite === "agency" ? "Zeitarbeitsfirmen" : seite === "company" ? "Unternehmen" : "diese Firma";
    return res.status(400).json({
      success: false,
      error: {
        code: "ROLLE_PASST_NICHT_ZUR_SEITE",
        message: `Die Rolle "${rollenName(rolle)}" gibt es fuer ${wer} nicht.`
      }
    });
  }

  /* ═══════════════════════════════════════════════════════
   *  OVERVIEW — Org-Dashboard mit Counts
   * ═══════════════════════════════════════════════════════ */

  router.get("/org/overview", requireAuth, ensureOrg, rperm("org.settings"),
    async (req, res) => {
      try {
        const [org, members, integrations, apiKeyCount, invites] = await Promise.all([
          orgService.getOrganization(pool, req.orgId),
          orgService.listOrgMembers(pool, req.orgId),
          integrationService.listIntegrations(pool, req.orgId),
          apiKeyService.countActiveKeys(pool, req.orgId),
          orgInviteService.listInvites(pool, req.orgId)
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
              departments: org.department_count || 0,
              open_invitations: Array.isArray(invites) ? invites.length : 0
            },
            /* W-E9: was diese Firma vergeben darf, und wie die Rollen heissen —
               EINE Beschriftung fuer alle Flaechen (config/orgRollen.js). */
            rollen: rollenAngebot(org.type),
            rollen_namen: ROLLEN_NAMEN
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

        const seite = await seiteDerFirma(req.orgId);
        if (!rolleErlaubt(seite, parsed.data.role_key, { ownerErlaubt: true })) {
          return rolleFalschFuerSeite(res, seite, parsed.data.role_key);
        }

        if (!darfOwnerRechte(req)) {
          const vorher = await heutigeRolle(req.orgId, { userId: req.params.userId });
          if (parsed.data.role_key === "owner" || vorher === "owner") return nurOwner(res);
        }

        const updated = await orgService.updateMemberRole(pool, req.orgId, req.params.userId, parsed.data.role_key);
        if (!updated) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });

        res.locals.audit = {
          action: "org.member.role_change", entity_type: "org_membership",
          entity_id: req.params.userId,
          details: { org_id: req.orgId, new_role: parsed.data.role_key, responsible_actor_user_id: req.session?.userId || null }
        };
        res.json({ success: true, data: updated });
      } catch (err) {
        if (err && err.status) return res.status(err.status).json({ success: false, error: { code: err.code || "ERROR" } });
        logger.error({ err: err.message }, "org/members update");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  /*
   * Mitglied entfernen — beendet die MITGLIEDSCHAFT in dieser Firma, nicht das
   * Konto. Das ist der Ersatz fuer "Deaktivieren" im Admin Panel (W-E9): jenes
   * setzte `users.role = 'inactive'` und scheiterte damit an `users_role_check`
   * (HTTP 500 bei jedem Klick); haette es funktioniert, haette es das Konto auf
   * der GANZEN Plattform gesperrt, auch fuer andere Firmen der Person.
   */
  router.delete("/org/members/:userId", requireAuth, ensureOrg, rperm("org.members"),
    async (req, res) => {
      try {
        const parsed = removeMemberSchema.safeParse(req.body || {});
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: { code: "GRUND_FEHLT", message: "Bitte einen Grund angeben (mindestens 5 Zeichen)." }
          });
        }
        if (req.params.userId === req.session?.userId) {
          return res.status(409).json({
            success: false,
            error: { code: "SELBST_ENTFERNEN", message: "Sich selbst entfernen geht hier nicht." }
          });
        }

        const { rows: vorher } = await pool.query(
          `SELECT role_key FROM org_memberships
            WHERE org_id = $1 AND user_id = $2 AND is_active = TRUE
            LIMIT 1`,
          [req.orgId, req.params.userId]
        );
        if (!vorher.length) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });
        if (vorher[0].role_key === "owner" && !darfOwnerRechte(req)) return nurOwner(res);

        const deactivated = await orgService.deactivateMember(pool, req.orgId, req.params.userId);
        if (!deactivated) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });

        res.locals.audit = {
          action: "org.member.remove", entity_type: "org_membership",
          entity_id: req.params.userId,
          details: {
            org_id: req.orgId,
            removed_role: vorher[0].role_key,
            reason: parsed.data.reason,
            responsible_actor_user_id: req.session?.userId || null
          }
        };
        res.json({ success: true, data: { removed: true } });
      } catch (err) {
        if (err && err.status) return res.status(err.status).json({ success: false, error: { code: err.code || "ERROR" } });
        logger.error({ err: err.message }, "org/members delete");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  /* ═══════════════════════════════════════════════════════
   *  MEMBER INVITATIONS (Fixplan 3.3) — einladen / annehmen
   * ═══════════════════════════════════════════════════════ */

  const inviteSchema = z.object({
    email: z.string().email().max(320),
    role_key: z.enum([
      "admin", "program_manager", "hiring_manager", "supplier_manager",
      "finance", "recruiter", "dispatcher", "member", "supplier_user", "viewer"
    ]).optional().default("member")
  });
  const inviteErrStatus = { ORG_REQUIRED: 400, INVALID_EMAIL: 400, INVALID_ROLE: 400, ALREADY_MEMBER: 409, INVITE_PENDING: 409, INVITE_INVALID: 400, EMAIL_MISMATCH: 403 };

  // Mitglied einladen: Einladung anlegen, Link mailen, invite_url fuer manuelles Teilen zurueckgeben.
  router.post("/org/members/invite", requireAuth, ensureOrg, rperm("org.members"),
    async (req, res) => {
      try {
        const parsed = inviteSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ success: false, error: { code: "VALIDATION", details: parsed.error.issues } });

        const seite = await seiteDerFirma(req.orgId);
        if (!rolleErlaubt(seite, parsed.data.role_key)) {
          return rolleFalschFuerSeite(res, seite, parsed.data.role_key);
        }

        let result;
        try {
          result = await orgInviteService.createInvite(pool, {
            orgId: req.orgId, email: parsed.data.email, roleKey: parsed.data.role_key, invitedBy: req.session.userId
          });
        } catch (e) {
          if (inviteErrStatus[e.message]) return res.status(inviteErrStatus[e.message]).json({ success: false, error: { code: e.message } });
          throw e;
        }

        const base = (process.env.PUBLIC_BASE_URL || process.env.APP_URL || "").replace(/\/$/, "");
        const inviteUrl = `${base}/org-invite.html?token=${encodeURIComponent(result.rawToken)}`;
        // Die Mail nennt die Rolle so, wie die Oberflaeche sie nennt — nicht den
        // internen Schluessel ("dispatcher"). Der Name stammt aus einer festen
        // Liste (config/orgRollen.js), nie aus der Anfrage.
        const rolleLesbar = rollenName(parsed.data.role_key);
        try {
          await sendMail({
            to: parsed.data.email,
            subject: "Einladung zu Ihrer Organisation auf TempConnect",
            text: `Sie wurden als ${rolleLesbar} eingeladen. Einladung annehmen: ${inviteUrl}\nDer Link ist ${orgInviteService.INVITE_TTL_DAYS} Tage gueltig.`,
            html: `<p>Sie wurden als <strong>${rolleLesbar}</strong> in eine Organisation auf TempConnect eingeladen.</p>` +
                  `<p><a href="${inviteUrl}">Einladung annehmen</a> (gueltig ${orgInviteService.INVITE_TTL_DAYS} Tage).</p>`
          });
        } catch (mailErr) { logger.warn({ err: mailErr.message }, "invite mail failed"); }

        res.locals.audit = {
          action: "org.member.invite", entity_type: "org_invitation", entity_id: result.invite.id,
          details: { org_id: req.orgId, email: parsed.data.email, role_key: parsed.data.role_key, responsible_actor_user_id: req.session.userId }
        };
        res.status(201).json({ success: true, data: { invite: result.invite, invite_url: inviteUrl } });
      } catch (err) {
        logger.error({ err: err.message }, "org/members invite");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  // Offene Einladungen listen.
  router.get("/org/invitations", requireAuth, ensureOrg, rperm("org.members"),
    async (req, res) => {
      try {
        const items = await orgInviteService.listInvites(pool, req.orgId);
        res.json({ success: true, data: { items, total: items.length } });
      } catch (err) {
        logger.error({ err: err.message }, "org/invitations list");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  // Einladung zuruecknehmen.
  router.delete("/org/invitations/:id", requireAuth, ensureOrg, rperm("org.members"),
    async (req, res) => {
      try {
        const ok = await orgInviteService.revokeInvite(pool, { orgId: req.orgId, inviteId: req.params.id });
        if (!ok) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });
        res.locals.audit = {
          action: "org.member.invite_revoke", entity_type: "org_invitation", entity_id: req.params.id,
          details: { org_id: req.orgId, responsible_actor_user_id: req.session.userId }
        };
        res.json({ success: true, data: { revoked: true } });
      } catch (err) {
        logger.error({ err: err.message }, "org/invitations revoke");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  // Einladung ansehen (eingeloggter Nutzer, vor Annahme). Kein ensureOrg/rperm — Eingeladener ist noch kein Mitglied.
  router.get("/org/invitations/lookup", requireAuth,
    async (req, res) => {
      try {
        const inv = await orgInviteService.getInviteByToken(pool, String(req.query.token || ""));
        if (!inv) return res.status(404).json({ success: false, error: { code: "INVITE_INVALID" } });
        res.json({ success: true, data: { org_name: inv.org_name, email: inv.email, role_key: inv.role_key, expires_at: inv.expires_at } });
      } catch (err) {
        logger.error({ err: err.message }, "org/invitations lookup");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  // Einladung annehmen (eingeloggter Nutzer; Email muss zur Einladung passen).
  router.post("/org/invitations/accept", requireAuth,
    async (req, res) => {
      try {
        const token = String(req.body?.token || "").trim();
        if (!token) return res.status(400).json({ success: false, error: { code: "MISSING_TOKEN" } });
        const { rows } = await pool.query("SELECT email FROM users WHERE id = $1", [req.session.userId]);
        let result;
        try {
          result = await orgInviteService.acceptInvite(pool, { rawToken: token, userId: req.session.userId, userEmail: rows[0]?.email });
        } catch (e) {
          if (inviteErrStatus[e.message]) return res.status(inviteErrStatus[e.message]).json({ success: false, error: { code: e.message } });
          throw e;
        }
        res.locals.audit = {
          action: "org.member.invite_accept", entity_type: "org_membership", entity_id: req.session.userId,
          details: { org_id: result.org_id, role_key: result.role_key, responsible_actor_user_id: req.session.userId }
        };
        res.json({ success: true, data: result });
      } catch (err) {
        logger.error({ err: err.message }, "org/invitations accept");
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

        /* W-E9: zu jedem Eintrag die lesbare Bezeichnung ("Mitglied eingeladen"
           statt "org.member.invite") und WER es war. Das Symbol aus
           `formatFeedItem` bleibt bewusst weg — es ist ein Emoji, und Emojis
           gehoeren nicht in die produktive Oberflaeche (CLAUDE.md). */
        const items = result.items.map((row) => {
          const f = formatFeedItem(row);
          return { ...row, label: f.action_label, wer: f.user };
        });

        res.json({
          success: true,
          data: { items, total: result.total, limit, offset }
        });
      } catch (err) {
        logger.error({ err: err.message }, "org/audit-log");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  /*
   * Protokoll als CSV — zog mit W-E9 aus dem Admin Panel hierher, der einzigen
   * Faehigkeit, die die Verwaltung dort noch nicht hatte. Gebunden an die EIGENE
   * Firma (`req.orgId`); eine `org_id` in der Anfrage wird nicht gelesen. Die
   * Ausfuhr selbst wird protokolliert: wer das Protokoll aus dem Haus traegt,
   * steht darin.
   */
  router.get("/org/audit-log/export/csv", requireAuth, ensureOrg,
    requireRole(["owner", "admin", "platform_admin"], { pool, logger }),
    exportLimiter,
    async (req, res) => {
      try {
        const filter = {
          action_type: req.query.action_type ? String(req.query.action_type).slice(0, 40) : null,
          from:        req.query.from ? String(req.query.from).slice(0, 40) : null,
          to:          req.query.to ? String(req.query.to).slice(0, 40) : null
        };
        const result = await queryOrgAuditLog(pool, req.orgId, { ...filter, limit: 500, offset: 0 });
        const csv = exportAuditLogCsv(result.items);

        try {
          await writeAuditEnhanced(pool, req, {
            action: "org.audit_log.export",
            action_type: "EXPORT",
            entity_type: "organization",
            entity_id: String(req.orgId),
            org_id: req.orgId,
            details: {
              zeilen: result.items.length,
              gesamt: result.total,
              filter,
              responsible_actor_user_id: req.session?.userId || null
            }
          });
        } catch (auditErr) {
          logger.warn({ err: auditErr.message }, "org/audit-log export: Protokollierung fehlgeschlagen");
        }

        const datum = todayDE();   // DACH-first: Berliner Datum, nie der UTC-Ausschnitt
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="protokoll-${datum}.csv"`);
        res.send(csv);
      } catch (err) {
        logger.error({ err: err.message }, "org/audit-log export");
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

  /*
   * M2.5/M2.7 — gemessen am 2026-09-03: diese Route reicht einer ARBEITERSITZUNG
   * org-geschluesselte Daten ihrer Zeitarbeitsfirma durch. Ein Arbeiter ist
   * regulaer Mitglied in der Org seines Arbeitgebers (workerService.acceptInvite,
   * role_key='worker'), seine Sitzung traegt also deren Kennung.
   *
   * Bewusst `verweigereArbeiter` und nicht `requirePermission(...)`: welche Rollen
   * diese Daten lesen duerfen, ist eine Produktfrage und gehoert dem Owner (M2.6).
   * Dieser Riegel schliesst genau das Gemessene und nimmt sonst niemandem etwas.
   */
  const keinArbeiter = verweigereArbeiter({ logger });

  router.get("/org/locations", requireAuth, ensureOrg, keinArbeiter,
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

  router.post("/org/locations", requireAuth, ensureOrg, sitesLimitGate, rperm("org.locations"),
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

        const updated = await orgService.updateLocation(pool, req.params.locId, req.orgId, parsed.data);
        if (!updated) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });

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
        const deactivated = await orgService.updateLocation(pool, req.params.locId, req.orgId, { is_active: false });
        if (!deactivated) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });

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

  router.get("/org/departments", requireAuth, ensureOrg, keinArbeiter,
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
        if (err instanceof OrgBoundaryError) {
          return res.status(403).json({ success: false, error: { code: "LOCATION_NOT_IN_ORG", message: err.message } });
        }
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

        if (parsed.data.location_id) {
          await assertLocationBelongsToOrg(pool, parsed.data.location_id, req.orgId);
        }

        const updated = await orgService.updateDepartment(pool, req.params.deptId, req.orgId, parsed.data);
        if (!updated) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });

        res.locals.audit = {
          action: "org.department.update", entity_type: "org_department",
          entity_id: req.params.deptId, details: { changed_fields: Object.keys(parsed.data) }
        };
        res.json({ success: true, data: updated });
      } catch (err) {
        if (err instanceof OrgBoundaryError) {
          return res.status(403).json({ success: false, error: { code: "LOCATION_NOT_IN_ORG", message: err.message } });
        }
        logger.error({ err: err.message }, "org/departments update");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  router.delete("/org/departments/:deptId", requireAuth, ensureOrg, rperm("org.departments"),
    async (req, res) => {
      try {
        const deactivated = await orgService.updateDepartment(pool, req.params.deptId, req.orgId, { is_active: false });
        if (!deactivated) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });

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
   *  MEMBERS — Rolle per Membership-ID aendern
   * ═══════════════════════════════════════════════════════ */

  router.patch("/org/members/:membershipId/role", requireAuth, ensureOrg, rperm("org.members"),
    async (req, res) => {
      try {
        const parsed = updateMemberSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ success: false, error: { code: "VALIDATION", details: parsed.error.issues } });

        const seite = await seiteDerFirma(req.orgId);
        if (!rolleErlaubt(seite, parsed.data.role_key, { ownerErlaubt: true })) {
          return rolleFalschFuerSeite(res, seite, parsed.data.role_key);
        }

        if (!darfOwnerRechte(req)) {
          const vorher = await heutigeRolle(req.orgId, { membershipId: req.params.membershipId });
          if (parsed.data.role_key === "owner" || vorher === "owner") return nurOwner(res);
        }

        const updated = await orgService.updateMemberRoleByMembershipId(pool, req.orgId, req.params.membershipId, parsed.data.role_key);
        if (!updated) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });

        res.locals.audit = {
          action: "org.member.role_change", entity_type: "org_membership",
          entity_id: req.params.membershipId,
          details: { org_id: req.orgId, new_role: parsed.data.role_key, responsible_actor_user_id: req.session?.userId || null }
        };
        res.json({ success: true, data: updated });
      } catch (err) {
        if (err && err.status) return res.status(err.status).json({ success: false, error: { code: err.code || "ERROR" } });
        logger.error({ err: err.message }, "org/members/:membershipId/role");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  router.patch("/org/members/:membershipId/scope", requireAuth, ensureOrg, rperm("org.members"),
    async (req, res) => {
      try {
        const parsed = memberScopeSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ success: false, error: { code: "VALIDATION", details: parsed.error.issues } });

        await assertMemberScopeBelongsToOrg(pool, parsed.data, req.orgId);

        const updated = await orgService.updateMemberScope(pool, req.orgId, req.params.membershipId, parsed.data);
        if (!updated) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });

        res.locals.audit = {
          action: "org.member.scope_change", entity_type: "org_membership",
          entity_id: req.params.membershipId,
          details: { org_id: req.orgId, location_id: parsed.data.location_id ?? null, department_id: parsed.data.department_id ?? null }
        };
        res.json({ success: true, data: updated });
      } catch (err) {
        if (err instanceof OrgBoundaryError) {
          return res.status(403).json({ success: false, error: { code: "ORG_BOUNDARY_VIOLATION", message: err.message } });
        }
        logger.error({ err: err.message }, "org/members/:membershipId/scope");
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      }
    }
  );

  /* ═══════════════════════════════════════════════════════
   *  ROLES & PERMISSIONS — Matrix fuer die UI
   * ═══════════════════════════════════════════════════════ */

  router.get("/org/roles-permissions", requireAuth, ensureOrg,
    async (req, res) => {
      /* W-E9: die Spalten der Matrix sind die Rollen DIESER Seite (plus Owner),
         nicht alle zehn — eine Zeitarbeitsfirma sah sonst "Hiring-Manager",
         ein Unternehmen "Dispatcher". Faellt die Abfrage der Seite aus, bleibt
         die volle Liste stehen: lieber zu viel gezeigt als eine leere Matrix. */
      const alle = [
        "owner","admin","program_manager","hiring_manager",
        "supplier_manager","finance","recruiter","dispatcher","member","viewer"
      ];
      let roles = alle;
      try {
        const seite = await seiteDerFirma(req.orgId);
        const jeSeite = rollenFuerSeite(seite);
        if (jeSeite.length) roles = ["owner", ...jeSeite];
      } catch (err) {
        logger.warn({ err: err.message }, "org/roles-permissions: Seite nicht ermittelbar");
      }
      res.json({
        success: true,
        data: { permissions: PERMISSIONS, roles, hierarchy: ROLE_HIERARCHY, rollen_namen: ROLLEN_NAMEN }
      });
    }
  );

  return router;
}
