/**
 * Organizations REST-Router: CRUD for orgs, locations, departments, members.
 */
import { z } from "zod";
import { Router } from "express";
import * as orgService from "../services/organizationService.js";
import { requirePermission } from "../middleware/rbac.js";

const createOrgSchema = z.object({
  name: z.string().min(2).max(200),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/),
  type: z.enum(["company", "agency"]),
  billing_email: z.string().email().optional().nullable(),
  tax_id: z.string().max(50).optional().nullable(),
  website: z.string().max(300).optional().nullable(),
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

  router.post("/organizations", requireAuth, async (req, res) => {
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

  router.get("/organizations/:id", requireAuth, async (req, res) => {
    const org = await orgService.getOrganization(pool, req.params.id);
    if (!org) return res.status(404).json({ error: "NOT_FOUND" });
    res.json(org);
  });

  router.patch("/organizations/:id", requireAuth, requirePermission("org.settings", { pool, logger }), async (req, res) => {
    const partial = createOrgSchema.partial().safeParse(req.body);
    if (!partial.success) return res.status(400).json({ error: "VALIDATION", details: partial.error.issues });
    const updated = await orgService.updateOrganization(pool, req.params.id, partial.data);
    if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
    res.locals.audit = { action: "org.update", entity_type: "organization", entity_id: req.params.id, details: { changed_fields: Object.keys(partial.data) } };
    res.json(updated);
  });

  /* ── Locations ─────────────────────────── */

  router.get("/organizations/:id/locations", requireAuth, async (req, res) => {
    const locations = await orgService.listLocations(pool, req.params.id);
    res.json({ items: locations });
  });

  router.post("/organizations/:id/locations", requireAuth, requirePermission("org.locations", { pool, logger }), async (req, res) => {
    const parsed = locationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    const loc = await orgService.createLocation(pool, req.params.id, parsed.data);
    res.locals.audit = { action: "org.location.create", entity_type: "org_location", entity_id: loc.id, details: { org_id: req.params.id, city: parsed.data.city } };
    res.status(201).json(loc);
  });

  /* ── Departments ───────────────────────── */

  router.get("/organizations/:id/departments", requireAuth, async (req, res) => {
    const depts = await orgService.listDepartments(pool, req.params.id);
    res.json({ items: depts });
  });

  router.post("/organizations/:id/departments", requireAuth, requirePermission("org.departments", { pool, logger }), async (req, res) => {
    const parsed = deptSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    const dept = await orgService.createDepartment(pool, req.params.id, parsed.data);
    res.locals.audit = { action: "org.department.create", entity_type: "org_department", entity_id: dept.id, details: { org_id: req.params.id, name: parsed.data.name } };
    res.status(201).json(dept);
  });

  /* ── Members ───────────────────────────── */

  router.get("/organizations/:id/members", requireAuth, async (req, res) => {
    const members = await orgService.listOrgMembers(pool, req.params.id);
    res.json({ items: members });
  });

  router.post("/organizations/:id/members", requireAuth, requirePermission("org.members", { pool, logger }), async (req, res) => {
    const parsed = memberSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    const member = await orgService.addMember(pool, req.params.id, parsed.data.user_id, parsed.data.role_key, {
      department_id: parsed.data.department_id, location_id: parsed.data.location_id
    });
    res.locals.audit = { action: "org.member.add", entity_type: "org_membership", entity_id: member.id, details: { org_id: req.params.id, user_id: parsed.data.user_id, role_key: parsed.data.role_key } };
    res.status(201).json(member);
  });

  return router;
}
