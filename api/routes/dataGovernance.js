/**
 * DSGVO Data Governance REST-Router.
 * Feature-Gate: data_governance (PRO/ENTERPRISE)
 * RBAC: data_governance.export/anonymize/retention/requests
 */
import { Router } from "express";
import * as dgSvc from "../services/dataGovernanceService.js";
import { requirePermission } from "../middleware/rbac.js";
import { swallow } from "../utils/logger.js";

export function createDataGovernanceRouter(deps) {
  const { pool, requireAuth, requireFeature, logger } = deps;
  const router = Router();
  const rperm = (p) => requirePermission(p, { pool, logger });
  const featureGate = requireFeature("data_governance");

  /** GET /data-governance/inventory — Datenkategorien-Übersicht */
  router.get("/data-governance/inventory", requireAuth, featureGate, rperm("data_governance.export"), (_req, res) => {
    res.json({ success: true, data: { categories: dgSvc.DATA_CATEGORIES, retention_policies: dgSvc.RETENTION_POLICIES } });
  });

  /** GET /data-governance/export/user/:userId — Vollständiger DSGVO-Export */
  router.get("/data-governance/export/user/:userId", requireAuth, featureGate, rperm("data_governance.export"), async (req, res) => {
    try {
      // Befund E-20 (2026-08-20): der Vollexport lief allein ueber die Kennung im
      // Pfad. `rperm("data_governance.export")` prueft nur, ob der Aufrufer das
      // Recht in SEINER Organisation hat — damit konnte ein Org-Admin den
      // kompletten Datensatz eines BELIEBIGEN fremden Nutzers ziehen: Mailadresse,
      // Telefon, Anschrift, Steuernummer, alle Anfragen, Angebote, Bewertungen,
      // Einsaetze und Stundenzettel. Gleiche Bindung wie bei der Anonymisierung
      // (E-17): eigene Organisation ja, fremde nein. Der Selbstexport laeuft ueber
      // GET /me/data-export und beruehrt diesen Weg nicht.
      if (!await dgSvc.istInMeinerOrg(pool, req.params.userId, req.orgId)) {
        return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      }
      const data = await dgSvc.exportUserDataFull(pool, req.params.userId);
      if (!data) return res.status(404).json({ error: "USER_NOT_FOUND" });
      res.json({ success: true, data });
    } catch (e) {
      logger.error({ err: e }, "data-governance export user");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** GET /data-governance/export/org — Org-weiter Export */
  router.get("/data-governance/export/org", requireAuth, featureGate, rperm("data_governance.export"), async (req, res) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "ORG_CONTEXT_REQUIRED" });
      const data = await dgSvc.exportOrgDataFull(pool, orgId);
      if (!data) return res.status(404).json({ error: "ORG_NOT_FOUND" });
      res.json({ success: true, data });
    } catch (e) {
      logger.error({ err: e }, "data-governance export org");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** GET /data-governance/anonymize/user/:userId/check — Vorbedingungsprüfung */
  router.get("/data-governance/anonymize/user/:userId/check", requireAuth, featureGate, rperm("data_governance.anonymize"), async (req, res) => {
    try {
      // Befund E-17: auch die Vorbedingungspruefung verraet sonst, ob es einen
      // fremden Nutzer gibt und was ihn blockiert (offene Einsaetze, Rechnungen).
      if (!await dgSvc.istInMeinerOrg(pool, req.params.userId, req.orgId)) {
        return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      }
      const result = await dgSvc.canDeleteUser(pool, req.params.userId);
      res.json({ success: true, data: result });
    } catch (e) {
      logger.error({ err: e }, "data-governance anonymize check");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** POST /data-governance/anonymize/user/:userId — Anonymisierung durchführen */
  router.post("/data-governance/anonymize/user/:userId", requireAuth, featureGate, rperm("data_governance.anonymize"), async (req, res) => {
    try {
      const result = await dgSvc.anonymizeUser(pool, req.params.userId, req.session.userId, req.orgId);
      if (result.reason === "ORG_BOUNDARY_VIOLATION") {
        // Befund E-17: das Ziel gehoert nicht zur eigenen Organisation.
        return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      }
      if (!result.success) {
        return res.status(400).json({ error: "ANONYMIZATION_BLOCKED", data: result });
      }
      res.locals.audit = {
        action: "dsgvo.anonymize",
        entity_type: "user",
        entity_id: req.params.userId,
        details: { anonymized_tables: result.anonymized_tables }
      };
      // result.email traegt die Original-Adresse (fuer DELETE /me-Abschiedsmail) —
      // in einer Anonymisierungs-Response darf diese PII nicht zurueckfliessen.
      const { email: _originalEmail, ...data } = result;
      res.json({ success: true, data });
    } catch (e) {
      logger.error({ err: e }, "data-governance anonymize");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** GET /data-governance/retention/status — Retention-Übersicht */
  router.get("/data-governance/retention/status", requireAuth, featureGate, rperm("data_governance.retention"), async (req, res) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "ORG_CONTEXT_REQUIRED" });
      const status = await dgSvc.getRetentionStatus(pool, orgId);
      const policies = dgSvc.getRetentionPolicies();
      res.json({ success: true, data: { status, policies } });
    } catch (e) {
      logger.error({ err: e }, "data-governance retention status");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** POST /data-governance/retention/cleanup — Retention-Bereinigung */
  router.post("/data-governance/retention/cleanup", requireAuth, featureGate, rperm("data_governance.retention"), async (req, res) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "ORG_CONTEXT_REQUIRED" });
      const dryRun = req.body.dry_run !== false;
      const result = await dgSvc.executeRetentionCleanup(pool, orgId, dryRun);
      res.locals.audit = {
        action: "data_governance.retention_cleanup",
        entity_type: "organization",
        entity_id: orgId,
        details: { dry_run: dryRun, deleted_count: result?.deleted_count ?? null }
      };
      res.json({ success: true, data: result });
    } catch (e) {
      logger.error({ err: e }, "data-governance retention cleanup");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** GET /data-governance/requests — DSGVO-Anfragen-Liste */
  router.get("/data-governance/requests", requireAuth, featureGate, rperm("data_governance.requests"), async (req, res) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "ORG_CONTEXT_REQUIRED" });
      const data = await dgSvc.listDataRequests(pool, orgId, {
        status: req.query.status || null,
        requestType: req.query.request_type || null,
        limit: parseInt(req.query.limit, 10) || 50,
        offset: parseInt(req.query.offset, 10) || 0
      });
      res.json({ success: true, data });
    } catch (e) {
      logger.error({ err: e }, "data-governance requests list");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** POST /data-governance/requests — Neue DSGVO-Anfrage */
  router.post("/data-governance/requests", requireAuth, featureGate, rperm("data_governance.requests"), async (req, res) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "ORG_CONTEXT_REQUIRED" });
      const { request_type, subject_type, subject_id, notes } = req.body || {};
      if (!request_type || !subject_type) {
        return res.status(400).json({ error: "VALIDATION_ERROR", message: "request_type und subject_type sind Pflichtfelder." });
      }
      const data = await dgSvc.createDataRequest(pool, {
        orgId, requestType: request_type, subjectType: subject_type,
        subjectId: subject_id || null, requestedBy: req.session.userId, notes
      });
      res.locals.audit = {
        action: "data_governance.request_create",
        entity_type: "data_governance_request",
        entity_id: data?.id || null,
        details: { request_type, subject_type, subject_id: subject_id || null }
      };
      // Auto-Ablage: DSGVO-Anfrage als Record im Dokumenten-Tresor (fire-and-forget).
      import("../services/documentIngestService.js").then((m) => m.ingestRecord(pool, {
        org_id: orgId,
        document_type: "report",
        content_category: "legal",
        title: `DSGVO-Anfrage: ${request_type} (${subject_type})`,
        source_ref: data?.id || null,
        uploaded_by: req.session.userId,
        notes: notes || null
      })).catch(swallow("dataGovernance"));
      res.status(201).json({ success: true, data });
    } catch (e) {
      logger.error({ err: e }, "data-governance requests create");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** PATCH /data-governance/requests/:id/complete — Anfrage abschließen */
  router.patch("/data-governance/requests/:id/complete", requireAuth, featureGate, rperm("data_governance.requests"), async (req, res) => {
    try {
      const data = await dgSvc.completeDataRequest(pool, req.params.id, req.session.userId, req.body.result_summary || null, req.orgId);
      if (!data) return res.status(404).json({ error: "NOT_FOUND_OR_ALREADY_COMPLETED" });
      res.locals.audit = {
        action: "data_governance.request_complete",
        entity_type: "data_governance_request",
        entity_id: req.params.id
      };
      res.json({ success: true, data });
    } catch (e) {
      logger.error({ err: e }, "data-governance requests complete");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
