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
import { hasPermission } from "../services/rbacService.js";
import { requireScope } from "../middleware/apiKeyAuth.js";
import * as integrationService from "../services/integrationService.js";
import * as erpMappingService from "../services/erpMappingService.js";
import { buildFibuBuchungsstapel } from "../services/datevExportService.js";
import { erzeugeERechnung, RECHNUNGSFORMATE } from "../services/eRechnungService.js";
import { erzeugeOperativesRechnungsPdf } from "../services/operationalInvoicePdfService.js";

export function createInvoicesRouter(deps) {
  const { pool, requireAuth, logger, requestLimiter } = deps;
  // requestLimiter covers GET requests too (unlike apiLimiter which skips GETs).
  // Fallback noop if not provided (unit-test environments without a full deps object).
  const exportLimiter = requestLimiter || ((_req, _res, next) => next());
  const router = Router();
  const rperm = (p) => requirePermission(p, { pool, logger });

  /*
   * M2.5 — Rechnungen sind Geld, und die LESEWEGE trugen als einzige nichts.
   *
   * Gemessen am 2026-09-02 mit einer echten Arbeitersitzung (users.role="worker",
   * Mitglied der Org seiner Zeitarbeitsfirma — so entsteht er in
   * workerService.acceptInvite; 31 solche Menschen existieren real):
   * GET /invoices lieferte ihm die Rechnungen der Firma mit 200, Nummer,
   * Gesamtbetrag und Kundenname. GET /invoices/export — eine Zeile darunter —
   * verweigerte dieselben Zeilen mit 403. Elf Nachbarrouten dieser Datei tragen
   * rperm("org.billing"): jeder Schreibweg und jeder Export. Der Guard stand also
   * laengst fest, er fehlte nur auf dem Weg, der die Daten am billigsten hergibt.
   *
   * requireScope("read:invoices") sah aus wie eine Wache und war keine: es kehrt
   * bei Sitzungs-Auth sofort zurueck (middleware/apiKeyAuth.js:153) und verweist
   * auf RBAC — das an diesen Routen nicht stand.
   *
   * Warum nicht einfach rperm davor: es gibt Rechnungen OHNE Org. Zwei Aufrufer
   * legen sie so an (routes/payment.js, `orgId: … || null`), und der Handler
   * bedient diesen Menschen eigens ueber `userId = !orgId ? session.userId : null`.
   * requirePermission wuerde ihn mit NO_ORG_MEMBERSHIP abweisen — seine EIGENE
   * Rechnung. Der Riegel gilt deshalb dem ORG-KONTEXT, nicht dem Lesen.
   *
   * Ausweichen bringt nichts: ohne Org-Kontext liefert der Handler ausschliesslich
   * die Rechnungen des Anfragenden selbst.
   *
   * Und der API-Schluessel bleibt aussen vor: fuer ihn gilt der Scope, das ist der
   * dafuer gebaute Weg (`requireScope` oben). `requirePermission` verlangt eine
   * Sitzung und antwortete einem Schluessel mit 401 NOT_AUTHENTICATED — der Riegel
   * haette also nicht schaerfer geprueft, sondern eine ganze Zugangsart abgeschnitten.
   * Aufgefallen ist das in `test/security/apiKeyScopes.test.js`: die Probe dort blieb
   * gruen, weil sie `notEqual(403)` fragt und 401 nun einmal nicht 403 ist.
   */
  function nurMitGeldberechtigung(req, res, next) {
    if (req.isApiKeyAuth) return next();
    if (!req.orgId) return next();
    return rperm("org.billing")(req, res, next);
  }

  /* GET /invoices — list for current user / org */
  router.get("/invoices", requireAuth, requireScope("read:invoices"), nurMitGeldberechtigung, async (req, res, next) => {
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

  /* GET /invoices/e-rechnung/bereitschaft — sind wir ab 2027 versandfaehig?
     Prueft die Rechnungsstammdaten der eigenen Organisation gegen EN 16931 und nennt
     jedes fehlende Feld im Klartext. Bewusst VOR `/invoices/:id` registriert: sonst
     faengt die Detailroute den Pfad mit id="e-rechnung" ab. */
  router.get("/invoices/e-rechnung/bereitschaft", requireAuth, rperm("org.billing"), async (req, res, next) => {
    try {
      const ergebnis = await opInvoice.pruefeERechnungBereitschaft(pool, req.orgId);
      if (!ergebnis) return res.status(404).json({ error: "ORG_NOT_FOUND" });
      if (ergebnis.error) return res.status(400).json(ergebnis);
      /*
       * Darf dieser Nutzer die Luecke auch SCHLIESSEN?
       *
       * Zwei verschiedene Rechte: `org.billing` sieht die Bereitschaft,
       * `org.settings` aendert die Stammdaten (PATCH /organizations/:id). Wer
       * nur das erste hat, bekaeme sonst eine Pflegemaske, die beim Speichern
       * mit 403 endet — ein toter Knopf, den die Projektregeln ausdruecklich
       * verbieten.
       *
       * Die Entscheidung faellt hier und nicht im Browser: das Frontend zeigt
       * an, was das Backend erlaubt, und leitet nichts selbst ab.
       */
      res.json({
        ...ergebnis,
        darf_pflegen: req.orgRole ? hasPermission(req.orgRole, "org.settings") : false,
        /* Die eigene Kennung mitgeben: die Pflegemaske schreibt nach
           PATCH /organizations/:id und braeuchte sonst einen zweiten Aufruf nur,
           um zu erfahren, wer sie selbst ist. Kein Geheimnis — sie steht in
           jeder anderen Antwort dieser Sitzung. */
        org_id: req.orgId
      });
    } catch (err) { next(err); }
  });

  /*
   * Bewusst VOR `/invoices/:id` registriert. Express nimmt die ERSTE passende
   * Schicht: stand diese Route dahinter, fing die Detailroute den Pfad mit
   * id="operational" ab und sie war unerreichbar. Erzwungen von
   * test/routenSchatten.test.js.
   */
  router.get("/invoices/operational", requireAuth, nurMitGeldberechtigung, async (req, res, next) => {
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
      /*
       * M2.5: die Org-Grenze stand hier schon — die ROLLE fehlte. Ein Arbeiter ist
       * Mitglied der Org seiner Zeitarbeitsfirma, `belongsToOrg` traf also zu und er
       * las deren Rechnung im Detail. Kein Riegel als Middleware, weil dieselbe Route
       * dem Menschen seine EIGENE Rechnung zeigen muss (invoice.user_id === userId),
       * auch wenn er in einer Org ohne Geld-Berechtigung sitzt.
       *
       * `req.isApiKeyAuth` bleibt aussen vor, aus demselben Grund wie bei
       * `nurMitGeldberechtigung`: ein Schluessel hat keine Org-Rolle, `req.orgRole`
       * waere undefined und `hasPermission` faellt darauf fail-closed — der Riegel
       * haette den Schluesselzugang abgeschnitten statt ihn zu pruefen. Fuer ihn gilt
       * der Scope oben.
       */
      if (!req.isApiKeyAuth && !belongsToUser && !hasPermission(req.orgRole, "org.billing")) {
        return res.status(403).json({
          error: "PERMISSION_DENIED",
          message: "Keine Berechtigung fuer diese Aktion."
        });
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

  /* GET /invoices/operational/kpis — Dashboard-KPIs */
  router.get("/invoices/operational/kpis", requireAuth, nurMitGeldberechtigung, async (req, res, next) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "ORG_REQUIRED" });
      const kpis = await opInvoice.getInvoiceKpis(pool, orgId);
      res.json(kpis);
    } catch (err) { next(err); }
  });

  /* GET /invoices/operational/billable — Abrechenbare Timesheets */
  router.get("/invoices/operational/billable", requireAuth, nurMitGeldberechtigung, async (req, res, next) => {
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
  router.get("/invoices/operational/:id", requireAuth, nurMitGeldberechtigung, async (req, res, next) => {
    try {
      const result = await opInvoice.getOperationalInvoice(pool, req.params.id, req.orgId);
      if (!result) return res.status(404).json({ error: "NOT_FOUND" });
      if (result.error === "ORG_BOUNDARY_VIOLATION") return res.status(403).json(result);
      if (result.error === "NOT_INVOICE_ISSUER") return res.status(403).json(result);
      res.json(result);
    } catch (err) { next(err); }
  });

  /* POST /invoices/operational/:id/issue — draft → issued */
  router.post("/invoices/operational/:id/issue", requireAuth, rperm("org.billing"), async (req, res, next) => {
    try {
      const result = await opInvoice.transitionInvoice(pool, req.params.id, "issued", req.session.userId, req.orgId);
      if (result.error === "NOT_FOUND") return res.status(404).json(result);
      // Befund E-2: fremde Org ist 403, kein Statuskonflikt.
      if (result.error === "ORG_BOUNDARY_VIOLATION") return res.status(403).json(result);
      if (result.error === "NOT_INVOICE_ISSUER") return res.status(403).json(result);
      if (result.error) return res.status(409).json(result);

      res.locals.audit = { action: "invoice.issued", entity_type: "invoice", entity_id: req.params.id };
      res.json(result.invoice);
    } catch (err) { next(err); }
  });

  /* POST /invoices/operational/:id/paid — issued/overdue → paid */
  router.post("/invoices/operational/:id/paid", requireAuth, rperm("org.billing"), async (req, res, next) => {
    try {
      const result = await opInvoice.transitionInvoice(pool, req.params.id, "paid", req.session.userId, req.orgId);
      if (result.error === "NOT_FOUND") return res.status(404).json(result);
      // Befund E-2: fremde Org ist 403, kein Statuskonflikt.
      if (result.error === "ORG_BOUNDARY_VIOLATION") return res.status(403).json(result);
      if (result.error === "NOT_INVOICE_ISSUER") return res.status(403).json(result);
      if (result.error) return res.status(409).json(result);

      res.locals.audit = { action: "invoice.mark_paid", entity_type: "invoice", entity_id: req.params.id };
      res.json(result.invoice);
    } catch (err) { next(err); }
  });

  /* POST /invoices/operational/:id/void — Stornierung */
  router.post("/invoices/operational/:id/void", requireAuth, rperm("org.billing"), async (req, res, next) => {
    try {
      const result = await opInvoice.transitionInvoice(pool, req.params.id, "void", req.session.userId, req.orgId);
      if (result.error === "NOT_FOUND") return res.status(404).json(result);
      // Befund E-2: fremde Org ist 403, kein Statuskonflikt.
      if (result.error === "ORG_BOUNDARY_VIOLATION") return res.status(403).json(result);
      if (result.error === "NOT_INVOICE_ISSUER") return res.status(403).json(result);
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
        actorId: req.session.userId,
        orgId: req.orgId
      });
      if (result.error === "NOT_FOUND") return res.status(404).json(result);
      // Befund E-2: fremde Org ist 403, kein Statuskonflikt.
      if (result.error === "ORG_BOUNDARY_VIOLATION") return res.status(403).json(result);
      if (result.error === "NOT_INVOICE_ISSUER") return res.status(403).json(result);
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

  /* GET /invoices/operational/:id/e-rechnung — E-Rechnung nach EN 16931.
     ?format=xrechnung (UBL 2.1, Vorgabe) | zugferd (CII, Anhang fuer PDF/A-3).

     WARUM DIESER ENDPUNKT: Seit 01.01.2025 muss jedes inlaendische Unternehmen
     E-Rechnungen empfangen koennen; ab 01.01.2027 muessen Unternehmen mit mehr als
     800.000 EUR Vorjahresumsatz sie versenden, ab 01.01.2028 alle. CSV und PDF sind
     dafuer nicht zulaessig — ohne diesen Weg faellt TempConnect als Rechnungsquelle aus.

     FAIL-CLOSED: Fehlen Stammdaten, kommt 422 mit der Liste der fehlenden Felder statt
     eines halben Dokuments. Eine unvollstaendige E-Rechnung sieht aus wie eine Rechnung,
     wird beim Empfaenger aber stumm abgewiesen — und niemand erfaehrt, woran es lag. */
  router.get("/invoices/operational/:id/e-rechnung", requireAuth, exportLimiter, rperm("org.billing"), async (req, res, next) => {
    try {
      const daten = await opInvoice.ladeERechnungsdaten(pool, req.params.id, req.orgId);
      if (!daten) return res.status(404).json({ error: "NOT_FOUND" });
      if (daten.error) return res.status(403).json(daten);

      const ergebnis = erzeugeERechnung({
        format: req.query.format || "xrechnung",
        invoice: daten.invoice,
        items: daten.items,
        verkaeufer: daten.verkaeufer,
        kaeufer: daten.kaeufer
      });

      if (!ergebnis.ok && ergebnis.fehler === "FORMAT_UNBEKANNT") {
        return res.status(400).json({ error: "FORMAT_UNBEKANNT", erlaubt: RECHNUNGSFORMATE });
      }
      if (!ergebnis.ok) {
        return res.status(422).json({
          error: "PFLICHTFELDER_FEHLEN",
          message: "Die Rechnung ist noch nicht normkonform. Bitte die genannten Felder in den Firmenstammdaten ergaenzen.",
          fehlend: ergebnis.fehlend
        });
      }

      res.setHeader("Content-Type", ergebnis.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${ergebnis.dateiname}"`);
      res.send(ergebnis.xml);
      integrationService.dispatchToIntegrations(pool, "invoice.exported", {
        orgId: req.orgId,
        entityType: "e_rechnung",
        entityId: daten.invoice.id,
        message: `Rechnung ${daten.invoice.invoice_number} als ${ergebnis.format.toUpperCase()} exportiert`,
        count: 1
      }).catch(swallow("invoice.integration.dispatch"));
    } catch (err) { next(err); }
  });

  /* GET /invoices/operational/:id/pdf — der menschenlesbare Beleg.

     NICHT der Renderer aus `invoicePdfService`: der setzt COMPANY als Absender, also
     die Plattformfirma. Hier stellt die ZEITARBEITSFIRMA dem Unternehmen die Stunden
     in Rechnung; TempConnect ist Vermittler, nicht Leistungserbringer. Ein PDF mit
     TempConnect im Absenderfeld waere kein Schoenheitsfehler, sondern ein falscher
     Beleg — der Empfaenger zoege Vorsteuer bei der falschen Firma.

     Zweiseitig lesbar wie die E-Rechnung: der Empfaenger braucht seine
     Eingangsrechnung genauso wie der Aussteller seine Ausgangsrechnung. Die
     Mandantengrenze prueft `ladeERechnungsdaten` fuer beide Seiten.

     Der Beleg ist IMMER ein Factur-X/ZUGFeRD-Hybrid als PDF/A-3u — kein Schalter,
     kein zweiter Modus. Ein optionaler Normpfad waere eine Parallelstruktur, die
     niemand pflegt, und in zwei Jahren kaeme die Frage auf, welcher der beiden
     denn nun der richtige ist. Das frueher noetige ?anhang=1 entfaellt; ein
     mitgeschickter Wert wird ignoriert statt abgewiesen, damit alte Verweise
     nicht brechen.

     NUR wenn die Pflichtfelder fuer das XML fehlen, entsteht ein reines PDF ohne
     Anhang: ein Beleg mit unvollstaendigem XML im Bauch waere schlechter als
     einer ohne — ein Empfaengersystem laese die Daten und wiese sie ab. Der Kopf
     `X-Rechnung-Format` sagt, was tatsaechlich geliefert wurde. */
  router.get("/invoices/operational/:id/pdf", requireAuth, exportLimiter, rperm("org.billing"), async (req, res, next) => {
    try {
      const daten = await opInvoice.ladeERechnungsdaten(pool, req.params.id, req.orgId);
      if (!daten) return res.status(404).json({ error: "NOT_FOUND" });
      if (daten.error) return res.status(403).json(daten);

      /* Immer versuchen, den strukturierten Teil beizulegen — er ist der Kern
         des Formats, nicht eine Zugabe. Scheitert die Pflichtfeldpruefung der
         E-Rechnung, bleibt es beim reinen PDF: lieber ein Beleg ohne XML als
         einer mit unvollstaendigem, den der Empfaenger abweist. */
      const eRech = erzeugeERechnung({
        format: "zugferd",
        invoice: daten.invoice, items: daten.items,
        verkaeufer: daten.verkaeufer, kaeufer: daten.kaeufer
      });
      const xmlAnhang = eRech.ok ? eRech.xml : null;

      const ergebnis = await erzeugeOperativesRechnungsPdf({
        invoice: daten.invoice,
        items: daten.items,
        verkaeufer: daten.verkaeufer,
        kaeufer: daten.kaeufer,
        xmlAnhang
      });

      if (!ergebnis.ok) {
        return res.status(422).json({
          error: "PFLICHTFELDER_FEHLEN",
          message: "Der Beleg waere nach § 14 UStG unvollstaendig. Bitte die genannten Felder in den Firmenstammdaten ergaenzen.",
          fehlend: ergebnis.fehlend || []
        });
      }

      res.setHeader("Content-Type", ergebnis.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${ergebnis.dateiname}"`);
      /* Sagt, was drin ist, statt es zu behaupten: mit XML ein vollstaendiger
         Factur-X-Beleg, ohne XML nur die PDF/A-Huelle. */
      res.setHeader("X-Rechnung-Format", ergebnis.hybrid
        ? `factur-x-en16931; pdfa=${ergebnis.pdfa}`
        : `kein-xml; pdfa=${ergebnis.pdfa}`);
      res.send(Buffer.from(ergebnis.pdf));
      integrationService.dispatchToIntegrations(pool, "invoice.exported", {
        orgId: req.orgId,
        entityType: "rechnung_pdf",
        entityId: daten.invoice.id,
        message: `Rechnung ${daten.invoice.invoice_number} als PDF exportiert`,
        count: 1
      }).catch(swallow("invoice.integration.dispatch"));
    } catch (err) { next(err); }
  });

  return router;
}
