/**
 * Organizations REST-Router: CRUD for orgs, locations, departments, members.
 */
import { z } from "zod";
import { Router } from "express";
import * as orgService from "../services/organizationService.js";
import { requirePermission, requireRole } from "../middleware/rbac.js";
import { requireOrgFeature, requireOrgLimit } from "../middleware/entitlementGuard.js";
import { queryOrgAuditLog, getRecentChanges } from "../services/auditLog.js";

const createOrgSchema = z.object({
  name: z.string().min(2).max(200),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/),
  type: z.enum(["company", "agency"]),
  billing_email: z.string().email().optional().nullable(),
  tax_id: z.string().max(50).optional().nullable(),
  website: z.string().max(300).optional().nullable(),
  parent_org_id: z.string().uuid().optional().nullable(),
  legal_name: z.string().max(300).optional().nullable(),
  commercial_register: z.string().max(100).optional().nullable(),
  billing_contact: z.string().max(300).optional().nullable()
});

const locationSchema = z.object({
  name: z.string().min(1).max(200),
  street: z.string().max(300).optional().nullable(),
  city: z.string().min(1).max(200),
  postal_code: z.string().max(20).optional().nullable(),
  country: z.string().max(5).optional(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  is_hq: z.boolean().optional()
});

const deptSchema = z.object({
  name: z.string().min(1).max(200),
  cost_center: z.string().max(50).optional().nullable(),
  location_id: z.string().uuid().optional().nullable()
});

const memberSchema = z.object({
  user_id: z.string().uuid(),
  role_key: z.enum([
    "owner","admin","program_manager","hiring_manager","supplier_manager",
    "finance","member","supplier_user","recruiter","dispatcher","viewer"
  ]),
  department_id: z.string().uuid().optional().nullable(),
  location_id: z.string().uuid().optional().nullable()
});

export function createOrganizationsRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();
  const orgSettingsGate = requireOrgFeature("org_settings", { pool, logger });
  const usersLimitGate = requireOrgLimit("users", { pool, logger });
  const sitesLimitGate = requireOrgLimit("sites", { pool, logger });
  const multiOrgSlotsGate = requireOrgLimit("multi_org_slots", { pool, logger });

  /*
   * Die Mandantengrenze dieser Datei — FAIL-CLOSED (gehaertet 2026-08-21).
   *
   * Hier stand `if (req.orgId && req.params.id !== req.orgId)`. Diese Form
   * schaltet sich bei `req.orgId === null` selbst ab, und `null` heisst dann:
   * der Pfad-Parameter waehlt die Organisation frei. Sie bewacht 12 Routen.
   *
   * Bemerkenswert: die richtige Form stand die ganze Zeit zwei Zeilen tiefer.
   * `parentOrgBoundary` prueft `if (!req.orgId || ...)`. Zwei Grenzen
   * nebeneinander, eine davon mit Selbstabschaltung — genau die Sorte
   * Unterschied, die man beim Lesen nicht sieht.
   *
   * Erreichbar ist die Luecke fuer jeden Aufrufer ohne aufloesbaren
   * Org-Kontext. Bei den vier reinen Lese-Routen unten stand vor dieser
   * Haertung KEIN weiterer Guard davor (nur `requireAuth`), waehrend die
   * schreibenden zusaetzlich `requirePermission` tragen. Der C-11-Kommentar in
   * `middleware/orgContext.js` beschreibt dieselbe Klasse und stuetzt sich
   * darauf, dass der Kontext auf die eigene Org zurueckfaellt — das gilt nur
   * fuer Nutzer, die ueberhaupt eine Mitgliedschaft haben.
   */
  const sameOrgParam = (req, res, next) => {
    if (!req.orgId || req.params.id !== req.orgId) {
      return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
    }
    next();
  };
  const parentOrgBoundary = (req, res, next) => {
    if (!req.body?.parent_org_id) return next();
    if (!req.orgId || req.body.parent_org_id !== req.orgId) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
    next();
  };
  const whenParentOrg = (gate) => (req, res, next) => {
    if (!req.body?.parent_org_id) return next();
    return gate(req, res, next);
  };

  router.post("/organizations", requireAuth, parentOrgBoundary, whenParentOrg(orgSettingsGate), whenParentOrg(multiOrgSlotsGate), async (req, res) => {
    const parsed = createOrgSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    try {
      const org = await orgService.createOrganization(pool, req.session.userId, parsed.data);
      res.locals.audit = { action: "org.create", entity_type: "organization", entity_id: org.id, details: { name: parsed.data.name, type: parsed.data.type } };
      res.status(201).json(org);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: "SLUG_EXISTS" });
      logger.error({ err: err.message }, "Org create failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // F-001: der Aufrufer muss Mitglied der angefragten Org sein. Die Pruefung
  // stand hier als KOPIE von `sameOrgParam` — vier solche Kopien gab es, und
  // alle vier trugen die selbstabschaltende Form weiter, als die Middleware
  // laengst danebenstand. Eine Grenze, eine Stelle (Lehre aus Welle H2).
  router.get("/organizations/:id", requireAuth, sameOrgParam, async (req, res) => {
    const org = await orgService.getOrganization(pool, req.params.id);
    if (!org) return res.status(404).json({ error: "NOT_FOUND" });
    res.json(org);
  });

  // Org-Boundary (Befund E-8, 2026-08-19, vom Waechter gefunden): Diese Route
  // hatte als EINZIGE der :id-Schreibrouten kein sameOrgParam — und
  // updateOrganization schreibt "UPDATE organizations ... WHERE id = $1".
  // requirePermission schuetzt nicht: es prueft gegen req.orgId (die eigene
  // Org, in der man Admin ist), und sein explicitOrg liest nur
  // query.org_id/params.org_id — der Platzhalter heisst hier :id.
  // Schreibbar waren u. a. name, billing_email, tax_id und parent_org_id.
  router.patch("/organizations/:id", requireAuth, sameOrgParam, requirePermission("org.settings", { pool, logger }), async (req, res) => {
    const partial = createOrgSchema.partial().safeParse(req.body);
    if (!partial.success) return res.status(400).json({ error: "VALIDATION", details: partial.error.issues });
    const updated = await orgService.updateOrganization(pool, req.params.id, partial.data);
    if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
    res.locals.audit = { action: "org.update", entity_type: "organization", entity_id: req.params.id, details: { changed_fields: Object.keys(partial.data) } };
    res.json(updated);
  });

  /* ── Locations ─────────────────────────── */

  router.get("/organizations/:id/locations", requireAuth, sameOrgParam, async (req, res) => {
    const locations = await orgService.listLocations(pool, req.params.id);
    res.json({ items: locations });
  });

  router.post("/organizations/:id/locations", requireAuth, sameOrgParam, sitesLimitGate, requirePermission("org.locations", { pool, logger }), async (req, res) => {
    const parsed = locationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    const loc = await orgService.createLocation(pool, req.params.id, parsed.data);
    res.locals.audit = { action: "org.location.create", entity_type: "org_location", entity_id: loc.id, details: { org_id: req.params.id, city: parsed.data.city } };
    res.status(201).json(loc);
  });

  router.get("/organizations/:id/locations/:locId", requireAuth, sameOrgParam, async (req, res) => {
    try {
      const loc = await orgService.getLocation(pool, req.params.locId, req.params.id);
      if (!loc) return res.status(404).json({ error: "NOT_FOUND" });
      res.json(loc);
    } catch (err) {
      logger.error({ err: err.message }, "location.get");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.put("/organizations/:id/locations/:locId", requireAuth, sameOrgParam, requirePermission("org.locations", { pool, logger }), async (req, res) => {
    const parsed = locationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    try {
      const loc = await orgService.updateLocation(pool, req.params.locId, req.params.id, parsed.data);
      if (!loc) return res.status(404).json({ error: "NOT_FOUND" });
      res.locals.audit = { action: "org.location.update", entity_type: "org_location", entity_id: req.params.locId, details: { org_id: req.params.id, city: parsed.data.city } };
      res.json(loc);
    } catch (err) {
      logger.error({ err: err.message }, "location.update");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.delete("/organizations/:id/locations/:locId", requireAuth, sameOrgParam, requirePermission("org.locations", { pool, logger }), async (req, res) => {
    try {
      const loc = await orgService.deleteLocation(pool, req.params.locId, req.params.id);
      if (!loc) return res.status(404).json({ error: "NOT_FOUND" });
      res.locals.audit = { action: "org.location.delete", entity_type: "org_location", entity_id: req.params.locId, details: { org_id: req.params.id } };
      res.status(204).end();
    } catch (err) {
      logger.error({ err: err.message }, "location.delete");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Departments ───────────────────────── */

  router.get("/organizations/:id/departments", requireAuth, sameOrgParam, async (req, res) => {
    const depts = await orgService.listDepartments(pool, req.params.id);
    res.json({ items: depts });
  });

  // Org-Boundary (Befund E-9, vom Waechter gefunden): createDepartment fuegt
  // mit der Org-Kennung aus dem PFAD ein — ohne sameOrgParam entstand die
  // Abteilung in einer fremden Organisation. GET/PUT/DELETE auf :deptId
  // haben die Pruefung, das Anlegen hatte sie nicht.
  router.post("/organizations/:id/departments", requireAuth, sameOrgParam, requirePermission("org.departments", { pool, logger }), async (req, res) => {
    const parsed = deptSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    const dept = await orgService.createDepartment(pool, req.params.id, parsed.data);
    res.locals.audit = { action: "org.department.create", entity_type: "org_department", entity_id: dept.id, details: { org_id: req.params.id, name: parsed.data.name } };
    res.status(201).json(dept);
  });

  router.get("/organizations/:id/departments/:deptId", requireAuth, sameOrgParam, async (req, res) => {
    try {
      const dept = await orgService.getDepartment(pool, req.params.deptId, req.params.id);
      if (!dept) return res.status(404).json({ error: "NOT_FOUND" });
      res.json(dept);
    } catch (err) {
      logger.error({ err: err.message }, "department.get");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.put("/organizations/:id/departments/:deptId", requireAuth, sameOrgParam, requirePermission("org.departments", { pool, logger }), async (req, res) => {
    const parsed = deptSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    try {
      const dept = await orgService.updateDepartment(pool, req.params.deptId, req.params.id, parsed.data);
      if (!dept) return res.status(404).json({ error: "NOT_FOUND" });
      res.locals.audit = { action: "org.department.update", entity_type: "org_department", entity_id: req.params.deptId, details: { org_id: req.params.id, name: parsed.data.name } };
      res.json(dept);
    } catch (err) {
      logger.error({ err: err.message }, "department.update");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.delete("/organizations/:id/departments/:deptId", requireAuth, sameOrgParam, requirePermission("org.departments", { pool, logger }), async (req, res) => {
    try {
      const dept = await orgService.deleteDepartment(pool, req.params.deptId, req.params.id);
      if (!dept) return res.status(404).json({ error: "NOT_FOUND" });
      res.locals.audit = { action: "org.department.delete", entity_type: "org_department", entity_id: req.params.deptId, details: { org_id: req.params.id } };
      res.status(204).end();
    } catch (err) {
      logger.error({ err: err.message }, "department.delete");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Members ───────────────────────────── */

  router.get("/organizations/:id/members", requireAuth, sameOrgParam, async (req, res) => {
    const members = await orgService.listOrgMembers(pool, req.params.id);
    res.json({ items: members });
  });

  router.post("/organizations/:id/members", requireAuth, sameOrgParam, usersLimitGate, requirePermission("org.members", { pool, logger }), async (req, res) => {
    const parsed = memberSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    const member = await orgService.addMember(pool, req.params.id, parsed.data.user_id, parsed.data.role_key, {
      department_id: parsed.data.department_id, location_id: parsed.data.location_id
    });
    res.locals.audit = { action: "org.member.add", entity_type: "org_membership", entity_id: member.id, details: { org_id: req.params.id, user_id: parsed.data.user_id, role_key: parsed.data.role_key } };
    res.status(201).json(member);
  });

  /* ── Org Audit Log (nur owner/admin) ───────────────── */

  router.get("/organizations/:id/audit-log", requireAuth,
    requireRole(["owner", "admin", "platform_admin"], { pool, logger }),
    async (req, res) => {
      try {
        /*
         * Org-Grenze, FAIL-CLOSED (8.1.1 c, gehaertet 2026-08-21).
         *
         * Hier stand `if (req.orgId && req.params.id !== req.orgId)`. Diese Form
         * schaltet sich bei `req.orgId === null` selbst ab — und `null` heisst
         * dann: der Pfad-Parameter waehlt die Organisation frei. Erreichbar ist
         * das heute nicht, weil `requireRole` davor fail-closed abbricht und
         * `req.orgId` aus einer geprueften Mitgliedschaft neu setzt
         * (`middleware/rbac.js`). Aber die Route verlaesst sich damit auf einen
         * Nachbarn: wer die Guard-Reihenfolge aendert, oeffnet sie lautlos.
         *
         * Dieselbe Klasse wie Audit-Backlog C-11, dort an 45 Routen gefunden.
         * Die Grenze gehoert an die Quelle der Wahrheit, nicht an die Annahme,
         * dass vorher schon jemand geprueft hat.
         */
        if (!req.orgId || req.params.id !== req.orgId) {
          return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
        }
        const limit  = Math.min(500, parseInt(req.query.limit) || 100);
        const offset = parseInt(req.query.offset) || 0;
        const result = await queryOrgAuditLog(pool, req.params.id, {
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
          items: result.items,
          total: result.total,
          page_size: limit,
          offset
        });
      } catch (err) {
        logger.error({ err: err.message }, "org audit-log");
        res.status(500).json({ error: "SERVER_ERROR" });
      }
    }
  );

  /* ── Recent Changes fuer eine Ressource (org-scoped) ────────── */

  router.get("/organizations/:id/audit-log/recent-changes", requireAuth,
    requireRole(["owner", "admin", "platform_admin"], { pool, logger }),
    async (req, res) => {
      try {
        /* Fail-closed wie oben (8.1.1 c) — dieselbe Grenze, dieselbe Form. */
        if (!req.orgId || req.params.id !== req.orgId) {
          return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
        }
        const entityType = req.query.entity_type;
        const entityId   = req.query.entity_id;
        if (!entityType || !entityId) {
          return res.status(400).json({ error: "MISSING_PARAMS", message: "entity_type und entity_id erforderlich." });
        }
        const limit = Math.min(50, parseInt(req.query.limit) || 10);
        // Befund E-5 (2026-08-19): Die Pruefung darueber bewacht req.params.id
        // — die Kennung, die der Nutzer selbst auf die EIGENE Org setzt. Der
        // echte Datenwaehler ist entity_id, und der lief bis hierher ohne
        // Org-Bindung. Die Bindung gehoert an die Abfrage, nicht an den Pfad.
        const rows = await getRecentChanges(pool, entityType, entityId, req.orgId, limit);
        res.json({ items: rows });
      } catch (err) {
        logger.error({ err: err.message }, "org recent-changes");
        res.status(500).json({ error: "SERVER_ERROR" });
      }
    }
  );

  return router;
}
