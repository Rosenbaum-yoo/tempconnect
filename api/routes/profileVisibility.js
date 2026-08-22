/**
 * Profile Visibility Routes — Marketplace Visibility Center (M-04)
 *
 * Endpoints:
 *   GET    /profile-visibility/settings          — eigene Einstellungen lesen
 *   POST   /profile-visibility/settings/opt-in   — OPT-IN umschalten (PLUS+)
 *   POST   /profile-visibility/settings/submit   — zur Staff-Prüfung einreichen (PRO+)
 *   POST   /profile-visibility/settings/pause    — Profil pausieren (PRO+)
 *   GET    /profile-visibility/public/:orgId      — oeffentliches Profil (kein Auth, approved only)
 *   POST   /profile-visibility/:orgId/like        — Profile liken (PRO+, kein Self-Like)
 *   DELETE /profile-visibility/:orgId/like        — Like entfernen
 *   POST   /profile-visibility/:orgId/favorite    — Zur Merkliste (PRO+)
 *   DELETE /profile-visibility/:orgId/favorite    — Von Merkliste entfernen
 *   GET    /profile-visibility/favorites          — eigene Merkliste
 *
 * Plan-Gates:
 *   public_profile_basic       PLUS, PRO, INDIVIDUELL (opt-in + like + favorite)
 *   public_profile_visibility  PRO, INDIVIDUELL (submit-review)
 */

import { z } from "zod";
import { Router } from "express";
import * as visSvc from "../services/profileVisibilityService.js";
import * as analyticsSvc from "../services/profileAnalyticsService.js";
import { writeAudit } from "../services/auditLog.js";
import { swallow } from "../utils/logger.js";

export function createProfileVisibilityRouter(deps) {
  const { pool, requireAuth, requireFeature, logger } = deps;
  const router = Router();

  const uid = (req) => req.session.userId;
  const ok  = (res, data) => res.json({ success: true, data });
  const fail = (res, status, code, msg) =>
    res.status(status).json({ success: false, error: { code, message: msg } });

  const audit = (req, action, entityType, entityId, details) =>
    writeAudit(pool, { action, entity_type: entityType, entity_id: entityId,
      actor_id: uid(req), details }).catch(swallow("profileVisibility"));

  const basic  = requireFeature("public_profile_basic");
  const visible = requireFeature("public_profile_visibility");

  /* ── Eigene Einstellungen lesen ────────────────────────── */

  router.get("/profile-visibility/settings", requireAuth, basic, async (req, res) => {
    try {
      if (!req.orgId) return fail(res, 403, "NO_ORG", "Keine aktive Organisation.");
      await visSvc.initVisibilitySettings(pool, req.orgId);
      const data = await visSvc.getVisibilitySettings(pool, req.orgId);
      ok(res, data);
    } catch (e) {
      logger.error({ err: e }, "GET /profile-visibility/settings");
      fail(res, 500, "SERVER_ERROR", "Einstellungen konnten nicht geladen werden.");
    }
  });

  /* ── OPT-IN umschalten ─────────────────────────────────── */

  const optInSchema = z.object({ is_public: z.boolean() });

  router.post("/profile-visibility/settings/opt-in", requireAuth, basic, async (req, res) => {
    const parsed = optInSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION", "is_public (boolean) erforderlich.");
    try {
      if (!req.orgId) return fail(res, 403, "NO_ORG", "Keine aktive Organisation.");
      const result = await visSvc.setPublicOptIn(pool, req.orgId, parsed.data.is_public);
      if (!result.ok) return fail(res, 400, result.reason, "Opt-In konnte nicht geändert werden.");
      audit(req, "profile_visibility.opt_in_changed", "profile_visibility", req.orgId,
        { is_public: parsed.data.is_public });
      ok(res, result.settings);
    } catch (e) {
      logger.error({ err: e }, "POST /profile-visibility/settings/opt-in");
      fail(res, 500, "SERVER_ERROR", "Opt-In konnte nicht gespeichert werden.");
    }
  });

  /* ── Zur Staff-Prüfung einreichen (PRO+) ──────────────── */

  router.post("/profile-visibility/settings/submit", requireAuth, visible, async (req, res) => {
    try {
      if (!req.orgId) return fail(res, 403, "NO_ORG", "Keine aktive Organisation.");
      const result = await visSvc.submitForReview(pool, req.orgId);
      if (!result.ok) return fail(res, 400, result.reason, "Einreichung nicht möglich.");
      audit(req, "profile_visibility.submitted_for_review", "profile_visibility", req.orgId, {});
      ok(res, result.settings);
    } catch (e) {
      logger.error({ err: e }, "POST /profile-visibility/settings/submit");
      fail(res, 500, "SERVER_ERROR", "Einreichung fehlgeschlagen.");
    }
  });

  /* ── Profil pausieren (Org-initiiert) ─────────────────── */

  router.post("/profile-visibility/settings/pause", requireAuth, visible, async (req, res) => {
    try {
      if (!req.orgId) return fail(res, 403, "NO_ORG", "Keine aktive Organisation.");
      const result = await visSvc.pauseVisibility(pool, req.orgId);
      if (!result.ok) return fail(res, 400, result.reason, "Pausieren nicht möglich.");
      audit(req, "profile_visibility.paused", "profile_visibility", req.orgId, {});
      ok(res, result.settings);
    } catch (e) {
      logger.error({ err: e }, "POST /profile-visibility/settings/pause");
      fail(res, 500, "SERVER_ERROR", "Pausieren fehlgeschlagen.");
    }
  });

  /* ── Öffentliches Profil lesen (kein Auth, approved only) */

  router.get("/profile-visibility/public/:orgId", async (req, res) => {
    try {
      const orgId = String(req.params.orgId);
      const visible = await visSvc.isProfilePubliclyVisible(pool, orgId);
      if (!visible) return fail(res, 404, "NOT_FOUND", "Öffentliches Profil nicht verfügbar.");
      // Profil aus company_profiles lesen (bestehender Service)
      const { rows } = await pool.query(
        `SELECT cp.*, o.name AS org_name, o.plan AS org_plan,
                sr.grade, sr.reputation_score, sr.avg_stars, sr.total_ratings
         FROM company_profiles cp
         JOIN org_memberships om ON om.user_id = cp.user_id AND om.role = 'owner'
         JOIN organizations o ON o.id = om.org_id
         LEFT JOIN supplier_reputation sr ON sr.supplier_id = cp.user_id
         WHERE om.org_id = $1
         LIMIT 1`,
        [orgId]
      );
      if (!rows[0]) return fail(res, 404, "NOT_FOUND", "Profildetails nicht gefunden.");
      ok(res, rows[0]);
    } catch (e) {
      logger.error({ err: e }, "GET /profile-visibility/public/:orgId");
      fail(res, 500, "SERVER_ERROR", "Profil konnte nicht geladen werden.");
    }
  });

  /* ── Like / Unlike ─────────────────────────────────────── */

  router.post("/profile-visibility/:orgId/like", requireAuth, basic, async (req, res) => {
    try {
      const likedOrgId = String(req.params.orgId);
      if (!req.orgId) return fail(res, 403, "NO_ORG", "Keine aktive Organisation.");
      const isVisible = await visSvc.isProfilePubliclyVisible(pool, likedOrgId);
      if (!isVisible) return fail(res, 404, "NOT_FOUND", "Profil nicht öffentlich.");
      const result = await analyticsSvc.likeProfile(pool, {
        likedOrgId,
        likerUserId: uid(req),
        likerOrgId: req.orgId
      });
      if (!result.ok) return fail(res, 400, result.reason, "Like konnte nicht gespeichert werden.");
      res.locals.audit = { action: "profile_visibility.like", entity_type: "org_profile", entity_id: likedOrgId, details: { liker_org_id: req.orgId } };
      ok(res, { liked: true });
    } catch (e) {
      logger.error({ err: e }, "POST /profile-visibility/:orgId/like");
      fail(res, 500, "SERVER_ERROR", "Like fehlgeschlagen.");
    }
  });

  router.delete("/profile-visibility/:orgId/like", requireAuth, basic, async (req, res) => {
    try {
      const likedOrgId = String(req.params.orgId);
      if (!req.orgId) return fail(res, 403, "NO_ORG", "Keine aktive Organisation.");
      await analyticsSvc.unlikeProfile(pool, likedOrgId, uid(req));
      res.locals.audit = { action: "profile_visibility.unlike", entity_type: "org_profile", entity_id: likedOrgId, details: null };
      ok(res, { liked: false });
    } catch (e) {
      logger.error({ err: e }, "DELETE /profile-visibility/:orgId/like");
      fail(res, 500, "SERVER_ERROR", "Unlike fehlgeschlagen.");
    }
  });

  /* ── Favoriten ─────────────────────────────────────────── */

  const favoriteSchema = z.object({
    note: z.string().max(200).optional().nullable()
  });

  router.post("/profile-visibility/:orgId/favorite", requireAuth, basic, async (req, res) => {
    const parsed = favoriteSchema.safeParse(req.body);
    const note = parsed.success ? (parsed.data.note || null) : null;
    try {
      const favOrgId = String(req.params.orgId);
      const result = await analyticsSvc.addFavorite(pool, {
        ownerUserId: uid(req),
        favoritedOrgId: favOrgId,
        note
      });
      if (!result.ok) return fail(res, 400, result.reason, "Favorit konnte nicht gespeichert werden.");
      res.locals.audit = { action: "profile_visibility.favorite_add", entity_type: "org_profile", entity_id: favOrgId, details: { has_note: !!note } };
      ok(res, { favorited: true });
    } catch (e) {
      logger.error({ err: e }, "POST /profile-visibility/:orgId/favorite");
      fail(res, 500, "SERVER_ERROR", "Favorit fehlgeschlagen.");
    }
  });

  router.delete("/profile-visibility/:orgId/favorite", requireAuth, basic, async (req, res) => {
    try {
      const favOrgId = String(req.params.orgId);
      await analyticsSvc.removeFavorite(pool, uid(req), favOrgId);
      res.locals.audit = { action: "profile_visibility.favorite_remove", entity_type: "org_profile", entity_id: favOrgId, details: null };
      ok(res, { favorited: false });
    } catch (e) {
      logger.error({ err: e }, "DELETE /profile-visibility/:orgId/favorite");
      fail(res, 500, "SERVER_ERROR", "Favorit-Entfernung fehlgeschlagen.");
    }
  });

  router.get("/profile-visibility/favorites", requireAuth, basic, async (req, res) => {
    try {
      const data = await analyticsSvc.getFavorites(pool, uid(req));
      ok(res, data);
    } catch (e) {
      logger.error({ err: e }, "GET /profile-visibility/favorites");
      fail(res, 500, "SERVER_ERROR", "Merkliste konnte nicht geladen werden.");
    }
  });

  /* ── M-11: Abuse Report ────────────────────────────────
   * POST /profile-visibility/:orgId/report
   * Kein Plan-Gate — jeder angemeldete Nutzer kann melden.
   * UNIQUE-Constraint in DB verhindert Doppel-Meldungen.
   * Kein Self-Report (orgId != eigene orgId).
   */

  const reportSchema = z.object({
    reason:  z.enum(["spam", "fake_profile", "misleading_info", "inappropriate_content", "other"]),
    details: z.string().max(500).optional().nullable()
  });

  router.post("/profile-visibility/:orgId/report", requireAuth, async (req, res) => {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(res, 400, "VALIDATION", "reason erforderlich (spam | fake_profile | misleading_info | inappropriate_content | other).");
    }
    try {
      const reportedOrgId = req.params.orgId;

      // Kein Self-Report
      if (req.orgId && reportedOrgId === req.orgId) {
        return fail(res, 400, "SELF_REPORT_NOT_ALLOWED", "Eigenes Profil kann nicht gemeldet werden.");
      }

      const result = await visSvc.reportProfileAbuse(pool, {
        reportedOrgId,
        reporterUserId: req.session.userId,
        reason:  parsed.data.reason,
        details: parsed.data.details || null
      });

      if (!result.ok) {
        /* Bis 2026-08-22 endete hier JEDE Meldung — und niemand erfuhr es.
         * Der Dienst gab nur "DB_ERROR" zurueck, die Route protokollierte
         * nichts, und die leere Tabelle sah aus wie "es meldet halt niemand".
         * Ein Fehlerpfad, den niemand sieht, ist kein Fehlerpfad, sondern eine
         * Luecke, die sich als Ruhe tarnt. */
        if (result.fehler) {
          logger.error({ err: result.fehler, orgId: reportedOrgId }, "profile abuse report konnte nicht gespeichert werden");
        }
        return fail(res, 400, result.reason, "Meldung konnte nicht gespeichert werden.");
      }

      // Audit — keine sensiblen Details loggen
      writeAudit(pool, {
        action:       "profile.abuse_reported",
        entity_type:  "profile_abuse_report",
        entity_id:    result.id || reportedOrgId,
        actor_id:     req.session.userId,
        details:      { reason: parsed.data.reason }
      }).catch(swallow("profileVisibility"));

      ok(res, { reported: true });
    } catch (e) {
      logger.error({ err: e }, "POST /profile-visibility/:orgId/report");
      fail(res, 500, "SERVER_ERROR", "Meldung fehlgeschlagen.");
    }
  });

  /*
   * ANGEBOT MELDEN (Plan I, Abschnitt 10: "Bei Angeboten muss man freche oder
   * betruegerische Inhalte ins Staff Control Center melden koennen").
   *
   * WARUM IN DIESER DATEI, obwohl sie "profileVisibility" heisst: die Meldung
   * ist EIN Vorgang mit EINEM Dienst, EINER Tabelle und EINEM Posteingang im
   * Staff Control Center. Sie auf zwei Dateien zu verteilen hiesse, die zweite
   * Haelfte beim naechsten Mal zu vergessen — so sind die drei angefangenen
   * Meldewege dieses Repos ueberhaupt erst entstanden. Der Dateiname ist der
   * schlechtere Kompromiss als ein vierter halber Weg.
   */
  const angebotMeldenSchema = z.object({
    reason:  z.enum(["spam", "fake_profile", "misleading_info", "inappropriate_content", "other"]),
    details: z.string().max(500).optional().nullable()
  });

  router.post("/offers/:id/report", requireAuth, async (req, res) => {
    const parsed = angebotMeldenSchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(res, 400, "VALIDATION", "reason erforderlich (spam | fake_profile | misleading_info | inappropriate_content | other).");
    }
    try {
      /*
       * `offers.supplier_company_id` zeigt auf `users`, nicht auf
       * `organizations` (Migration 014). Die Organisation kommt deshalb ueber
       * die Mitgliedschaft. Gemessen am 2026-08-22: alle 38 Angebote haben
       * genau EINEN Anbieter mit genau EINER aktiven Organisation — trotzdem
       * werden beide Randfaelle unten ausdruecklich behandelt, weil "heute
       * eindeutig" keine Zusicherung ist.
       *
       * `ORDER BY m.created_at ASC LIMIT 1` macht die Wahl bei mehreren
       * Mitgliedschaften wenigstens BESTIMMT statt zufaellig; die genaue
       * Anbieterkennung wandert zusaetzlich ins Protokoll, damit Staff den
       * Ursprung auch dann exakt zurueckverfolgen kann.
       */
      const { rows } = await pool.query(
        `SELECT o.id,
                o.supplier_company_id,
                (SELECT m.org_id
                   FROM org_memberships m
                  WHERE m.user_id = o.supplier_company_id AND m.is_active = TRUE
                  ORDER BY m.created_at ASC
                  LIMIT 1) AS anbieter_org_id
           FROM offers o
          WHERE o.id = $1`,
        [req.params.id]
      );
      const angebot = rows[0];
      if (!angebot) return fail(res, 404, "OFFER_NOT_FOUND", "Angebot nicht gefunden.");

      if (angebot.supplier_company_id === req.session.userId) {
        return fail(res, 400, "SELF_REPORT_NOT_ALLOWED", "Eigenes Angebot kann nicht gemeldet werden.");
      }
      if (!angebot.anbieter_org_id) {
        /* Fail-closed statt Notnagel: ohne Organisation koennte der Posteingang
         * die Meldung nicht anzeigen (er verbindet ueber `reported_org_id`).
         * Eine Meldung, die niemand sieht, ist schlimmer als eine abgelehnte —
         * dieselbe Regel wie beim Support-Eingang. */
        logger.error({ offerId: angebot.id }, "Angebot ohne Anbieter-Organisation — Meldung nicht zustellbar");
        return fail(res, 409, "OFFER_WITHOUT_ORG", "Dieses Angebot laesst sich derzeit nicht melden. Bitte wenden Sie sich an den Support.");
      }

      const result = await visSvc.reportProfileAbuse(pool, {
        reportedOrgId:  angebot.anbieter_org_id,
        reporterUserId: req.session.userId,
        reason:         parsed.data.reason,
        details:        parsed.data.details || null,
        zielArt:        "angebot",
        zielId:         angebot.id
      });

      if (!result.ok) {
        if (result.fehler) {
          logger.error({ err: result.fehler, offerId: angebot.id }, "Angebots-Meldung konnte nicht gespeichert werden");
        }
        return fail(res, 400, result.reason, "Meldung konnte nicht gespeichert werden.");
      }

      writeAudit(pool, {
        action:      "offer.abuse_reported",
        entity_type: "profile_abuse_report",
        entity_id:   result.id || angebot.id,
        actor_id:    req.session.userId,
        details:     { reason: parsed.data.reason, offer_id: angebot.id, supplier_user_id: angebot.supplier_company_id }
      }).catch(swallow("profileVisibility"));

      ok(res, { reported: true });
    } catch (e) {
      logger.error({ err: e }, "POST /offers/:id/report");
      fail(res, 500, "SERVER_ERROR", "Meldung fehlgeschlagen.");
    }
  });

  return router;
}
