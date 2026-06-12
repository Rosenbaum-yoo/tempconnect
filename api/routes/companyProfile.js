/**
 * Company Profile Routes – enterprise profile management endpoints.
 */
import { Router } from "express";
import * as profileSvc from "../services/companyProfileService.js";

export function createCompanyProfileRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();

  /* helper */
  const uid = (req) => req.session.userId;
  const ok = (res, data) => res.json({ success: true, data });
  const fail = (res, status, code, message) => res.status(status).json({ success: false, error: { code, message } });

  // F1.3: Audit via res.locals (auditWrite-Middleware schreibt einheitlich nach
  // Response-Abschluss) statt Direkt-Write am Middleware vorbei — kein Bypass der
  // Fallback-Warnung mehr, gleiche Pipeline wie der Rest der Plattform.
  const audit = (req, res, action, entityType, entityId, details) => {
    res.locals.audit = { action, entity_type: entityType, entity_id: entityId, actor_id: uid(req), details };
  };

  /* ── Full / Public profile ─────────────────────────────── */

  router.get("/company-profile", requireAuth, async (req, res) => {
    try {
      const data = await profileSvc.getFullProfile(pool, uid(req));
      ok(res, data);
    } catch (e) {
      logger.error({ err: e }, "company-profile GET");
      fail(res, 500, "SERVER_ERROR", "Profil konnte nicht geladen werden.");
    }
  });

  router.get("/company-profile/public/:userId", async (req, res) => {
    try {
      const data = await profileSvc.getPublicProfile(pool, req.params.userId);
      if (!data) return fail(res, 404, "NOT_FOUND", "Profil nicht gefunden.");
      ok(res, data);
    } catch (e) {
      logger.error({ err: e }, "company-profile public GET");
      fail(res, 500, "SERVER_ERROR", "Profil konnte nicht geladen werden.");
    }
  });

  router.get("/company-profile/completeness", requireAuth, async (req, res) => {
    try {
      const data = await profileSvc.computeCompleteness(pool, uid(req));
      ok(res, data);
    } catch (e) {
      logger.error({ err: e }, "completeness GET");
      fail(res, 500, "SERVER_ERROR", "Berechnung fehlgeschlagen.");
    }
  });

  /* ── Profile (overview) ────────────────────────────────── */

  router.put("/company-profile/overview", requireAuth, async (req, res) => {
    try {
      const data = await profileSvc.upsertProfile(pool, uid(req), req.body);
      audit(req, res, "company_profile.update", "company_profile", String(data.id), { fields: Object.keys(req.body) });
      ok(res, data);
    } catch (e) {
      logger.error({ err: e }, "company-profile overview PUT");
      fail(res, 500, "SERVER_ERROR", "Speichern fehlgeschlagen.");
    }
  });

  /* ── Capabilities ──────────────────────────────────────── */

  router.put("/company-profile/capabilities", requireAuth, async (req, res) => {
    try {
      const data = await profileSvc.upsertCapabilities(pool, uid(req), req.body);
      audit(req, res, "company_profile.capabilities_update", "company_capabilities", String(data.id), null);
      ok(res, data);
    } catch (e) {
      logger.error({ err: e }, "capabilities PUT");
      fail(res, 500, "SERVER_ERROR", "Speichern fehlgeschlagen.");
    }
  });

  /* ── Locations ─────────────────────────────────────────── */

  router.get("/company-profile/locations", requireAuth, async (req, res) => {
    try { ok(res, await profileSvc.listLocations(pool, uid(req))); }
    catch (e) { logger.error({ err: e }, "locations GET"); fail(res, 500, "SERVER_ERROR", "Fehler."); }
  });

  router.post("/company-profile/locations", requireAuth, async (req, res) => {
    try {
      if (!req.body.city) return fail(res, 400, "VALIDATION", "Stadt ist erforderlich.");
      const loc = await profileSvc.addLocation(pool, uid(req), req.body);
      audit(req, res, "company_profile.location_add", "company_location", String(loc.id), { city: loc.city });
      ok(res, loc);
    } catch (e) { logger.error({ err: e }, "locations POST"); fail(res, 500, "SERVER_ERROR", "Fehler."); }
  });

  router.put("/company-profile/locations/:id", requireAuth, async (req, res) => {
    try {
      const loc = await profileSvc.updateLocation(pool, req.params.id, uid(req), req.body);
      if (!loc) return fail(res, 404, "NOT_FOUND", "Standort nicht gefunden.");
      audit(req, res, "company_profile.location_update", "company_location", req.params.id, null);
      ok(res, loc);
    } catch (e) { logger.error({ err: e }, "locations PUT"); fail(res, 500, "SERVER_ERROR", "Fehler."); }
  });

  router.delete("/company-profile/locations/:id", requireAuth, async (req, res) => {
    try {
      const removed = await profileSvc.removeLocation(pool, req.params.id, uid(req));
      if (!removed) return fail(res, 404, "NOT_FOUND", "Standort nicht gefunden.");
      audit(req, res, "company_profile.location_delete", "company_location", req.params.id, null);
      ok(res, { deleted: true });
    } catch (e) { logger.error({ err: e }, "locations DELETE"); fail(res, 500, "SERVER_ERROR", "Fehler."); }
  });

  /* ── Certifications ────────────────────────────────────── */

  router.get("/company-profile/certifications", requireAuth, async (req, res) => {
    try { ok(res, await profileSvc.listCertifications(pool, uid(req))); }
    catch (e) { logger.error({ err: e }, "certs GET"); fail(res, 500, "SERVER_ERROR", "Fehler."); }
  });

  router.post("/company-profile/certifications", requireAuth, async (req, res) => {
    try {
      if (!req.body.cert_name) return fail(res, 400, "VALIDATION", "Zertifikatsname erforderlich.");
      const cert = await profileSvc.addCertification(pool, uid(req), req.body);
      audit(req, res, "company_profile.cert_add", "company_certification", String(cert.id), { cert_name: cert.cert_name });
      ok(res, cert);
    } catch (e) { logger.error({ err: e }, "certs POST"); fail(res, 500, "SERVER_ERROR", "Fehler."); }
  });

  router.put("/company-profile/certifications/:id", requireAuth, async (req, res) => {
    try {
      const cert = await profileSvc.updateCertification(pool, req.params.id, uid(req), req.body);
      if (!cert) return fail(res, 404, "NOT_FOUND", "Zertifikat nicht gefunden.");
      audit(req, res, "company_profile.cert_update", "company_certification", req.params.id, null);
      ok(res, cert);
    } catch (e) { logger.error({ err: e }, "certs PUT"); fail(res, 500, "SERVER_ERROR", "Fehler."); }
  });

  router.delete("/company-profile/certifications/:id", requireAuth, async (req, res) => {
    try {
      const removed = await profileSvc.removeCertification(pool, req.params.id, uid(req));
      if (!removed) return fail(res, 404, "NOT_FOUND", "Zertifikat nicht gefunden.");
      audit(req, res, "company_profile.cert_delete", "company_certification", req.params.id, null);
      ok(res, { deleted: true });
    } catch (e) { logger.error({ err: e }, "certs DELETE"); fail(res, 500, "SERVER_ERROR", "Fehler."); }
  });

  /* ── Contacts ──────────────────────────────────────────── */

  router.get("/company-profile/contacts", requireAuth, async (req, res) => {
    try { ok(res, await profileSvc.listContacts(pool, uid(req))); }
    catch (e) { logger.error({ err: e }, "contacts GET"); fail(res, 500, "SERVER_ERROR", "Fehler."); }
  });

  router.post("/company-profile/contacts", requireAuth, async (req, res) => {
    try {
      if (!req.body.name) return fail(res, 400, "VALIDATION", "Name ist erforderlich.");
      const c = await profileSvc.addContact(pool, uid(req), req.body);
      audit(req, res, "company_profile.contact_add", "company_contact", String(c.id), { name: c.name });
      ok(res, c);
    } catch (e) { logger.error({ err: e }, "contacts POST"); fail(res, 500, "SERVER_ERROR", "Fehler."); }
  });

  router.put("/company-profile/contacts/:id", requireAuth, async (req, res) => {
    try {
      const c = await profileSvc.updateContact(pool, req.params.id, uid(req), req.body);
      if (!c) return fail(res, 404, "NOT_FOUND", "Kontakt nicht gefunden.");
      audit(req, res, "company_profile.contact_update", "company_contact", req.params.id, null);
      ok(res, c);
    } catch (e) { logger.error({ err: e }, "contacts PUT"); fail(res, 500, "SERVER_ERROR", "Fehler."); }
  });

  router.delete("/company-profile/contacts/:id", requireAuth, async (req, res) => {
    try {
      const removed = await profileSvc.removeContact(pool, req.params.id, uid(req));
      if (!removed) return fail(res, 404, "NOT_FOUND", "Kontakt nicht gefunden.");
      audit(req, res, "company_profile.contact_delete", "company_contact", req.params.id, null);
      ok(res, { deleted: true });
    } catch (e) { logger.error({ err: e }, "contacts DELETE"); fail(res, 500, "SERVER_ERROR", "Fehler."); }
  });

  return router;
}
