/**
 * Invoices REST Router
 *
 * GET  /invoices        — List invoices for current user/org
 * GET  /invoices/:id    — Invoice detail with line items
 * GET  /invoices/export — CSV export (finance permission)
 * POST /invoices/:id/void — Void an invoice (owner/admin only)
 * POST /invoices/:id/paid — Mark as paid (admin/finance)
 */

import { Router } from "express";
import { swallow } from "../utils/logger.js";
import * as invoiceService from "../services/invoiceService.js";
import * as opInvoice from "../services/operationalInvoiceService.js";
import { renderInvoiceHtml, renderInvoiceText, renderInvoicePdf } from "../services/invoicePdfService.js";
import { requirePermission } from "../middleware/rbac.js";
import { requireScope } from "../middleware/apiKeyAuth.js";
import * as integrationService from "../services/integrationService.js";
import * as erpMappingService from "../services/erpMappingService.js";
import { buildFibuBuchungsstapel } from "../services/datevExportService.js";

export function createInvoicesRouter(deps) {
  const { pool, requireAuth, logger, requestLimiter } = deps;
  // requestLimiter covers GET requests too (unlike apiLimiter which skips GETs).
  // Fallback noop if not provided (unit-test environments without a full deps object).
  const exportLimiter = requestLimiter || ((_req, _res, next) => next());
  const router = Router();
  const rperm = (p) => requirePermission(p, { pool, logger });

  /* GET /invoices — list for current user / org */
  router.get("/invoices", requireAuth, requireScope("read:invoices"), async (req, res, next) => {
    try {
      // F-010 fix: use only server-resolved orgId, never trust query param
      const orgId = req.orgId || null;
      const userId = !orgId ? req.session.userId : null;
      const status = req.query.status || null;
      const limit = parseInt(req.query.limit, 10) || 50;

      const invoices = await invoiceService.listInvoices(pool, { orgId, userId, status, limit });
      res.json({ items: invoices, total: invoices.length });
    } catch (err) {
      next(err);
    }
  });

  /* GET /invoices/export — CSV download (exportLimiter: 30 req/10 min in prod, applies to GETs) */
  router.get("/invoices/export", requireAuth, requireScope("read:invoices"), exportLimiter, rperm("org.billing"), async (req, res, next) => {
    try {
      // F-010 fix: use only server-resolved orgId
      const orgId = req.orgId || null;
      const userId = !orgId ? req.session.userId : null;
      const status = req.query.status || null;
      const limit = parseInt(req.query.limit, 10) || 500;

      const invoices = await invoiceService.listInvoices(pool, { orgId, userId, status, limit });
      const csv = invoiceService.exportInvoicesCsv(invoices);

      const filename = `invoices-${new Date().toISOString().split("T")[0]}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
      // HR/Fibu-Outbound (Epic A.3b): signalisiert abonnierten Systemen (SAP/DATEV), dass
      // Rechnungsdaten exportiert wurden. Fire-and-forget (kein Block des CSV-Downloads).
      integrationService.dispatchToIntegrations(pool, "invoice.exported", {
        orgId, entityType: "invoice_export", entityId: null,
        message: `${invoices.length} Rechnung(en) als CSV exportiert`, count: invoices.length
      }).catch(swallow("invoice.integration.dispatch"));
    } catch (err) {
      next(err);
    }
  });

  /* GET /invoices/export/datev — DATEV-Fibu-Buchungsstapel (EXTF 700) für Steuerberater/Buchhaltung.
     Konten/SKR/Berater-Mandant aus dem DATEV-ERP-Mapping der Org (sync_config), sonst SKR03-Defaults.
     Ausgabe ISO-8859-1 (DATEV-Erwartung) ohne neue Dependency via Buffer latin1. */
  router.get("/invoices/export/datev", requireAuth, requireScope("read:invoices"), exportLimiter, rperm("org.billing"), async (req, res, next) => {
    try {
      const orgId = req.orgId || null;
      const userId = !orgId ? req.session.userId : null;
      const status = req.query.status || "paid"; // Default: nur bezahlte Rechnungen verbuchen
      const limit = parseInt(req.query.limit, 10) || 500;

      const invoices = await invoiceService.listInvoices(pool, { orgId, userId, status, limit });

      // DATEV-Parameter (Berater/Mandant/SKR/Konten) aus dem ERP-Mapping der Org.
      let cfg = {};
      if (orgId) {
        try {
          const mappings = await erpMappingService.listMappings(pool, orgId);
          const datev = mappings.find((m) => m.system_type === "datev" && m.status !== "disabled");
          if (datev && datev.sync_config && typeof datev.sync_config === "object") cfg = datev.sync_config;
        } catch { /* Defaults greifen */ }
      }

      const csv = buildFibuBuchungsstapel(invoices, cfg);
      const filename = `datev-buchungsstapel-${new Date().toISOString().split("T")[0]}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=ISO-8859-1");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(Buffer.from(csv, "latin1")); // DATEV erwartet ISO-8859-1/CP1252
      integrationService.dispatchToIntegrations(pool, "invoice.exported", {
        orgId, entityType: "datev_buchungsstapel", entityId: null,
        message: `${invoices.length} Rechnung(en) als DATEV-Buchungsstapel exportiert`, count: invoices.length
      }).catch(swallow("invoice.integration.dispatch"));
    } catch (err) {
      next(err);
    }
  });

  /* GET /invoices/:id — detail with line items */
  router.get("/invoices/:id", requireAuth, requireScope("read:invoices"), async (req, res, next) => {
    try {
      const invoice = await invoiceService.getInvoice(pool, req.params.id);
      if (!invoice) return res.status(404).json({ error: "NOT_FOUND" });

      // Org boundary: user must belong to invoice's org or be the invoice's user
      const userId = req.session.userId;
      const orgId = req.orgId;
      const belongsToUser = invoice.user_id === userId;
      const belongsToOrg = orgId && invoice.org_id === orgId;
      if (!belongsToUser && !belongsToOrg) {
        return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      }

      // Format: ?format=pdf|html|text (default: json)
      const format = String(req.query.format || "").toLowerCase();
      if (format === "pdf") {
        const pdf = await renderInvoicePdf(invoice);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoice_number}.pdf"`);
        return res.send(Buffer.from(pdf));
      }
      if (format === "html") {
        const html = renderInvoiceHtml(invoice);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Content-Disposition", `inline; filename="${invoice.invoice_number}.html"`);
        return res.send(html);
      }
      if (format === "text" || format === "txt") {
        const text = renderInvoiceText(invoice);
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoice_number}.txt"`);
        return res.send(text);
      }
      res.json(invoice);
    } catch (err) {
      next(err);
    }
  });

  /* POST /invoices/:id/void */
  router.post("/invoices/:id/void", requireAuth, requireScope("write:invoices"), rperm("org.billing"), async (req, res, next) => {
    try {
      const invoice = await invoiceService.getInvoice(pool, req.params.id);
      if (!invoice) return res.status(404).json({ error: "NOT_FOUND" });
      // F-003 fix: org-boundary check
      if (req.orgId && invoice.org_id && invoice.org_id !== req.orgId) {
        return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      }

      const voided = await invoiceService.voidInvoice(pool, req.params.id);
      if (!voided) return res.status(409).json({ error: "CANNOT_VOID", message: "Invoice cannot be voided in its current status." });

      res.locals.audit = {
        action: "invoice.void",
        entity_type: "invoice",
        entity_id: req.params.id
      };
      res.json(voided);
    } catch (err) {
      next(err);
    }
  });

  /* POST /invoices/:id/paid — admin use / manual payment confirmation */
  router.post("/invoices/:id/paid", requireAuth, requireScope("write:invoices"), rperm("org.billing"), async (req, res, next) => {
    try {
      // F-003 fix: org-boundary check
      const invoice = await invoiceService.getInvoice(pool, req.params.id);
      if (!invoice) return res.status(404).json({ error: "NOT_FOUND" });
      if (req.orgId && invoice.org_id && invoice.org_id !== req.orgId) {
        return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      }
      const paid = await invoiceService.markInvoicePaid(pool, req.params.id);
      if (!paid) return res.status(409).json({ error: "CANNOT_MARK_PAID", message: "Invoice is not in a payable status." });

      res.locals.audit = {
        action: "invoice.mark_paid",
        entity_type: "invoice",
        entity_id: req.params.id
      };
      logger.info({ invoiceId: req.params.id }, "Invoice marked as paid");
      res.json(paid);
    } catch (err) {
      next(err);
    }
  });

  /* ═══════════════════════════════════════════════════════
     Operational Invoice Endpoints (B2B Einsatz-Abrechnung)
     ═══════════════════════════════════════════════════════ */

  /* GET /invoices/operational — Operative Rechnungsliste */
  router.get("/invoices/operational", requireAuth, async (req, res, next) => {
    try {
      const orgId = req.orgId || null;
      const invoices = await opInvoice.listOperationalInvoices(pool, {
        orgId,
        status: req.query.status || null,
        assignmentId: req.query.assignment_id || null,
        dateFrom: req.query.date_from || null,
        dateTo: req.query.date_to || null,
        search: req.query.search || null,
        limit: parseInt(req.query.limit, 10) || 100
      });
      res.json({ items: invoices, total: invoices.length });
    } catch (err) { next(err); }
  });

  /* GET /invoices/operational/kpis — Dashboard-KPIs */
  router.get("/invoices/operational/kpis", requireAuth, async (req, res, next) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "ORG_REQUIRED" });
      const kpis = await opInvoice.getInvoiceKpis(pool, orgId);
      res.json(kpis);
    } catch (err) { next(err); }
  });

  /* GET /invoices/operational/billable — Abrechenbare Timesheets */
  router.get("/invoices/operational/billable", requireAuth, async (req, res, next) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "ORG_REQUIRED" });
      const timesheets = await opInvoice.getBillableTimesheets(pool, orgId, {
        assignmentId: req.query.assignment_id || null,
        workerName: req.query.worker_name || null,
        limit: parseInt(req.query.limit, 10) || 100
      });
      res.json({ items: timesheets, total: timesheets.length });
    } catch (err) { next(err); }
  });

  /* POST /invoices/operational/generate — Rechnung aus Timesheets erzeugen */
  router.post("/invoices/operational/generate", requireAuth, rperm("org.billing"), async (req, res, next) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "ORG_REQUIRED" });

      const { assignment_id, timesheet_ids, reference_number, billing_contact_name, notes, tax_rate_pct, overtime_surcharge_pct } = req.body;
      if (!assignment_id || !timesheet_ids?.length) {
        return res.status(400).json({ error: "VALIDATION_ERROR", message: "assignment_id und timesheet_ids sind erforderlich." });
      }

      const result = await opInvoice.generateFromTimesheets(pool, {
        orgId,
        assignmentId: assignment_id,
        timesheetIds: timesheet_ids,
        actorId: req.session.userId,
        referenceNumber: reference_number,
        billingContactName: billing_contact_name,
        notes,
        taxRatePct: tax_rate_pct,
        overtimeSurchargePct: overtime_surcharge_pct
      });

      if (result.error) {
        const status = result.error === "ORG_BOUNDARY_VIOLATION" ? 403
          : result.error === "ASSIGNMENT_NOT_FOUND" ? 404 : 409;
        return res.status(status).json(result);
      }

      res.locals.audit = {
        action: "invoice.operational_created",
        entity_type: "invoice",
        entity_id: result.invoice.id
      };
      res.status(201).json(result);
    } catch (err) { next(err); }
  });

  /* GET /invoices/operational/:id — Operative Rechnung Detail */
  router.get("/invoices/operational/:id", requireAuth, async (req, res, next) => {
    try {
      const result = await opInvoice.getOperationalInvoice(pool, req.params.id, req.orgId);
      if (!result) return res.status(404).json({ error: "NOT_FOUND" });
      if (result.error === "ORG_BOUNDARY_VIOLATION") return res.status(403).json(result);
      res.json(result);
    } catch (err) { next(err); }
  });

  /* POST /invoices/operational/:id/issue — draft → issued */
  router.post("/invoices/operational/:id/issue", requireAuth, rperm("org.billing"), async (req, res, next) => {
    try {
      const result = await opInvoice.transitionInvoice(pool, req.params.id, "issued", req.session.userId);
      if (result.error === "NOT_FOUND") return res.status(404).json(result);
      if (result.error) return res.status(409).json(result);

      res.locals.audit = { action: "invoice.issued", entity_type: "invoice", entity_id: req.params.id };
      res.json(result.invoice);
    } catch (err) { next(err); }
  });

  /* POST /invoices/operational/:id/paid — issued/overdue → paid */
  router.post("/invoices/operational/:id/paid", requireAuth, rperm("org.billing"), async (req, res, next) => {
    try {
      const result = await opInvoice.transitionInvoice(pool, req.params.id, "paid", req.session.userId);
      if (result.error === "NOT_FOUND") return res.status(404).json(result);
      if (result.error) return res.status(409).json(result);

      res.locals.audit = { action: "invoice.mark_paid", entity_type: "invoice", entity_id: req.params.id };
      res.json(result.invoice);
    } catch (err) { next(err); }
  });

  /* POST /invoices/operational/:id/void — Stornierung */
  router.post("/invoices/operational/:id/void", requireAuth, rperm("org.billing"), async (req, res, next) => {
    try {
      const result = await opInvoice.transitionInvoice(pool, req.params.id, "void", req.session.userId);
      if (result.error === "NOT_FOUND") return res.status(404).json(result);
      if (result.error) return res.status(409).json(result);

      res.locals.audit = { action: "invoice.void", entity_type: "invoice", entity_id: req.params.id };
      res.json(result.invoice);
    } catch (err) { next(err); }
  });

  /* POST /invoices/operational/:id/correction — Korrekturposition */
  router.post("/invoices/operational/:id/correction", requireAuth, rperm("org.billing"), async (req, res, next) => {
    try {
      const { description, amount_cents } = req.body;
      if (!description || amount_cents == null) {
        return res.status(400).json({ error: "VALIDATION_ERROR", message: "description und amount_cents erforderlich." });
      }
      const result = await opInvoice.addCorrectionItem(pool, req.params.id, {
        description,
        amountCents: amount_cents,
        actorId: req.session.userId
      });
      if (result.error === "NOT_FOUND") return res.status(404).json(result);
      if (result.error) return res.status(409).json(result);

      res.locals.audit = { action: "invoice.correction_added", entity_type: "invoice", entity_id: req.params.id };
      res.status(201).json(result);
    } catch (err) { next(err); }
  });

  /* GET /invoices/operational/:id/export/csv — Einzelrechnung CSV-Download (exportLimiter) */
  router.get("/invoices/operational/:id/export/csv", requireAuth, exportLimiter, rperm("org.billing"), async (req, res, next) => {
    try {
      const invoice = await opInvoice.getOperationalInvoice(pool, req.params.id, req.orgId);
      if (!invoice) return res.status(404).json({ error: "NOT_FOUND" });
      if (invoice.error) return res.status(403).json(invoice);

      const csv = opInvoice.exportOperationalInvoiceCsv(invoice);
      const filename = `invoice-${invoice.invoice_number || req.params.id}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (err) { next(err); }
  });

  return router;
}
