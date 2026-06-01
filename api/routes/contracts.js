/**
 * Contracts REST-Router: CRUD and lifecycle for enterprise contracts.
 */
import { z } from "zod";
import { Router } from "express";
import * as contractService from "../services/contractService.js";
import { requirePermission } from "../middleware/rbac.js";
import { catchAsync } from "../utils/routeHandler.js";

const createSchema = z.object({
  buyer_org_id: z.string().uuid(),
  supplier_org_id: z.string().uuid(),
  contract_type: z.enum(["msa", "framework", "sla", "pricing", "nda", "other"]),
  title: z.string().min(3).max(300),
  description: z.string().max(4000).optional().nullable(),
  terms_summary: z.string().max(10000).optional().nullable(),
  file_ref: z.string().max(500).optional().nullable(),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  internal_notes: z.string().max(4000).optional().nullable(),
  status: z.enum(["draft", "active"]).optional()
});

export function createContractsRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();

  const rperm = (p) => requirePermission(p, { pool, logger });

  router.get("/contracts", requireAuth, rperm("contract.view"), catchAsync(async (req, res) => {
    // SEC-002: Org-Scoping — server-resolved only, ignore client-supplied org params
    const orgId = req.orgId;
    const items = await contractService.listContracts(pool, {
      buyer_org_id: orgId || null,
      supplier_org_id: null,  // cross-org filtering blocked
      status: req.query.status || null,
      contract_type: req.query.type || null,
      limit: parseInt(req.query.limit, 10) || 100
    });
    res.json({ items, total: items.length });
  }));

  router.post("/contracts", requireAuth, rperm("contract.create"), catchAsync(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    // Org-Boundary: buyer_org_id muss eigene Org sein
    if (req.orgId && parsed.data.buyer_org_id !== req.orgId) {
      return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION", message: "buyer_org_id muss Ihrer Organisation entsprechen." });
    }
    const contract = await contractService.createContract(pool, {
      ...parsed.data, created_by: req.session.userId
    });
    res.locals.audit = { action: "contract.create", entity_type: "contract", entity_id: contract.id, details: { buyer_org_id: parsed.data.buyer_org_id, supplier_org_id: parsed.data.supplier_org_id, contract_type: parsed.data.contract_type } };
    res.status(201).json(contract);
  }));

  router.get("/contracts/:id", requireAuth, rperm("contract.view"), catchAsync(async (req, res) => {
    const contract = await contractService.getContract(pool, req.params.id);
    if (!contract) return res.status(404).json({ error: "NOT_FOUND" });
    // Org-Boundary: nur eigene Contracts lesen
    if (req.orgId && contract.buyer_org_id !== req.orgId && contract.supplier_org_id !== req.orgId) {
      return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
    }
    res.json(contract);
  }));

  router.patch("/contracts/:id", requireAuth, rperm("contract.edit"), catchAsync(async (req, res) => {
    const partial = createSchema.partial().safeParse(req.body);
    if (!partial.success) return res.status(400).json({ error: "VALIDATION", details: partial.error.issues });
    const existing = await contractService.getContract(pool, req.params.id);
    if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
    if (req.orgId && existing.buyer_org_id !== req.orgId) {
      return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
    }
    const updated = await contractService.updateContract(pool, req.params.id, partial.data, req.session.userId);
    if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
    res.locals.audit = { action: "contract.update", entity_type: "contract", entity_id: req.params.id, details: { changed_fields: Object.keys(partial.data) } };
    res.json(updated);
  }));

  router.post("/contracts/:id/activate", requireAuth, rperm("contract.create"), catchAsync(async (req, res) => {
    const existing = await contractService.getContract(pool, req.params.id);
    if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
    if (req.orgId && existing.buyer_org_id !== req.orgId) {
      return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
    }
    const result = await contractService.activateContract(pool, req.params.id, req.session.userId);
    if (!result) return res.status(404).json({ error: "NOT_FOUND" });
    res.locals.audit = { action: "contract.activate", entity_type: "contract", entity_id: req.params.id, old_values: { status: existing.status }, new_values: { status: "active" } };
    res.json(result);
  }));

  router.post("/contracts/:id/terminate", requireAuth, rperm("contract.terminate"), catchAsync(async (req, res) => {
    const existing = await contractService.getContract(pool, req.params.id);
    if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
    if (req.orgId && existing.buyer_org_id !== req.orgId) {
      return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
    }
    const result = await contractService.terminateContract(pool, req.params.id, req.session.userId, req.body.reason);
    if (!result) return res.status(404).json({ error: "NOT_FOUND_OR_ALREADY_TERMINATED" });
    res.locals.audit = { action: "contract.terminate", entity_type: "contract", entity_id: req.params.id, old_values: { status: existing.status }, new_values: { status: "terminated" }, details: { reason: req.body.reason } };
    res.json(result);
  }));

  return router;
}
