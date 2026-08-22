/**
 * Admin Panel Routes — platform administration endpoints.
 * Protected: requires platform_admin or owner role.
 */
import { Router } from "express";
import { queryAuditLog, getRecentChanges, getRecentChangesPlatformWide } from "../services/auditLog.js";
import { queryActivityFeed, getActionTypes, formatFeedItem } from "../services/activityFeedService.js";
import * as eventService from "../services/eventTrackingService.js";
import { getSystemDiagnostics } from "../services/healthService.js";
import * as strategicCollaborationService from "../services/strategicCollaborationService.js";
import * as requestService from "../services/requestService.js";
import * as stateMachine from "../services/stateMachine.js";
import * as pilotPolicyService from "../services/pilotPolicyService.js";
import { buildAdminControlCenter } from "../services/adminControlCenterService.js";
import { buildAuditReport as buildVisibilityAuditReport } from "../services/visibilityAuditService.js";

export function createAdminRouter(deps) {
  const { pool, requireAuth, logger, config, getUserAndPlan, requestLimiter } = deps;
  // exportLimiter: applies to GETs (unlike apiLimiter which skips them).
  const exportLimiter = requestLimiter || ((_req, _res, next) => next());
  const router = Router();

  /** Lightweight admin guard: owner, admin, or platform_admin */
  function requireAdmin(req, res, next) {
    if (config?.ADMIN_PANEL_OPEN && req.session?.userId) {
      logger.warn({ userId: req.session.userId, path: req.path }, "ADMIN_PANEL_OPEN: admin route allowed for authenticated user");
      return next();
    }
    const role = req.orgRole || req.orgMembership?.role_key;
    if (role && ["platform_admin", "owner", "admin"].includes(role)) return next();
    // Fallback: check user.role field for legacy admins
    if (req.session?.userRole && ["platform_admin", "owner", "admin"].includes(req.session.userRole)) return next();
    logger.warn({ userId: req.session?.userId, path: req.path }, "admin access denied");
    res.status(403).json({ success: false, error: { code: "ADMIN_REQUIRED", message: "Administratorrechte erforderlich." } });
  }

  /**
   * Sperrt eine Route auf die PLATTFORMVERWALTUNG.
   *
   * Manche Routen dieser Datei haben keine sinnvolle org-begrenzte Fassung:
   * Plattformkonfiguration, kaufmaennische Hebel, Systeminternes,
   * kundenuebergreifende Bearbeitungs-Workflows. Sie einem Kunden-Admin zu
   * zeigen ist nicht "zu viel Information", sondern die falsche Flaeche
   * (`docs/FLAECHEN.md`: die Plattform als Ganzes gehoert ins Staff Control
   * Center, nicht in eine Kundenoberflaeche).
   *
   * Gibt `true` zurueck, wenn der Aufruf weiterlaufen darf. Sonst ist die
   * Antwort bereits geschrieben ${D} der Aufrufer MUSS dann zurueckkehren.
   */
  function nurPlattform(req, res) {
    if (isGlobalAdminScope(req)) return true;
    res.status(403).json({
      success: false,
      error: {
        code: "NUR_PLATTFORMVERWALTUNG",
        message: "Dieser Bereich gehoert zur Plattformverwaltung."
      }
    });
    return false;
  }

  /**
   * Darf dieser Aufrufer den Nutzer `zielId` ueberhaupt anfassen?
   *
   * BEFUND 8.1.1 (d), gemessen am 2026-08-21: `PATCH /admin/users/:id` und
   * `POST /admin/users/:id/deactivate` schrieben
   *     UPDATE users SET ... WHERE id = $1
   * ohne jede Org-Pruefung. Die LISTE war laengst org-begrenzt ${D} die Mutation
   * nicht. Die Grenze lebte also nur in dem, was die Oberflaeche ZEIGT, nicht in
   * dem, was der Endpunkt ZULAESST. Wer die Kennung kennt, braucht die Liste nicht.
   *
   * Erreichbar fuer jeden `requireAdmin`-Passierer: **201 von 395 Konten**, alle
   * in Kunden-Organisationen. Betroffen waren damit auch Nutzer fremder Kunden
   * und die Konten von TempConnect selbst ${D} bis hin zum Deaktivieren.
   *
   * Dieselbe Lehre wie in Welle H2: die Grenze gehoert an die Quelle der
   * Wahrheit, nicht an den Kontext des Aufrufers oder an die Sicht der UI.
   */
  async function zielNutzerErlaubt(req, zielId) {
    const umfang = bestimmeAdminUmfang(req);
    if (umfang.fehler) return { erlaubt: false, fehler: umfang.fehler };
    if (umfang.plattformweit) return { erlaubt: true, umfang };
    const { rows } = await pool.query(
      `SELECT 1 FROM org_memberships WHERE user_id = $1 AND org_id = $2 LIMIT 1`,
      [zielId, umfang.orgId]
    );
    if (!rows.length) {
      return {
        erlaubt: false,
        fehler: {
          code: "ORG_BOUNDARY_VIOLATION",
          message: "Dieser Nutzer gehoert nicht zur eigenen Organisation."
        }
      };
    }
    return { erlaubt: true, umfang };
  }

  /** Sanitize search input — strip SQL/XSS-dangerous chars */
  function sanitize(str, maxLen = 200) {
    if (!str || typeof str !== "string") return "";
    return str.slice(0, maxLen).replace(/[<>'";\\]/g, "").trim();
  }

  function isLikelyUuid(value) {
    return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
  }

  function parseIntegerParam(value, { defaultValue, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY }) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return defaultValue;
    return Math.min(max, Math.max(min, parsed));
  }

  /**
   * Darf dieser Aufrufer PLATTFORMWEIT sehen — also ueber alle Mandanten hinweg?
   *
   * Nur `platform_admin`. Frueher galten hier zusaetzlich die Legacy-Werte
   * `admin` und `owner` aus `users.role`. Das war ein Schlupf ohne Nutzen:
   * am 2026-08-21 gemessen traegt KEIN einziges Konto einen dieser Werte
   * (`users.role` kennt nur company/agency/worker), waehrend 200 Konten in
   * `org_memberships.role_key` auf `owner` stehen — allesamt Kunden.
   * Ein Tor, das heute niemand passiert und morgen jeder, ist eine Falle.
   */
  function isGlobalAdminScope(req) {
    const role = req.orgRole || req.orgMembership?.role_key || null;
    if (role === "platform_admin") return true;
    return req.session?.userRole === "platform_admin";
  }

  /**
   * Auf welche Organisation ist dieser Aufruf begrenzt? `null` = plattformweit.
   *
   * BEFUND 8.1.1 (d), gemessen am 2026-08-21: die drei Audit-Routen dieser Datei
   * haben diese Frage gar nicht gestellt. `queryAuditLog` bekam
   * `org_id: req.query.org_id || null` — ohne Angabe also **die gesamte
   * Plattform**. Durch `requireAdmin` kommt aber jeder Kunde mit der Org-Rolle
   * `owner` oder `admin`: **201 von 395 Konten**, davon 142 in Unternehmens- und
   * 59 in Zeitarbeits-Organisationen. Kein einziges davon gehoert TempConnect.
   *
   * Damit war das plattformweite Audit-Log fuer Kunden lesbar — inklusive
   * CSV-Ausfuhr. Owner-Vorgabe: "Firmen duerfen nur Zugang zu den Daten der
   * eigenen Mitarbeiter haben."
   *
   * `/admin/users` machte es bereits richtig; diese Funktion hebt dasselbe
   * Muster heraus, damit es nicht ein drittes Mal vergessen wird.
   *
   * @returns {{ plattformweit: boolean, orgId: string|null, fehler: object|null }}
   */
  function bestimmeAdminUmfang(req) {
    if (isGlobalAdminScope(req)) return { plattformweit: true, orgId: null, fehler: null };
    const orgId = req.orgId || req.orgMembership?.org_id || null;
    if (!orgId) {
      return {
        plattformweit: false,
        orgId: null,
        fehler: { code: "ORG_CONTEXT_REQUIRED", message: "Organisationskontext erforderlich." }
      };
    }
    return { plattformweit: false, orgId, fehler: null };
  }

  function buildAdminUsersWhereClause({ search, scopedOrgId, paramOffset = 0 }) {
    const values = [];
    const clauses = [];
    if (search) {
      values.push(`%${search}%`);
      const idx = paramOffset + values.length;
      clauses.push(`(
        u.email ILIKE $${idx}
        OR u.company_name ILIKE $${idx}
        OR u.contact_person ILIKE $${idx}
        OR o.name ILIKE $${idx}
        OR m.role_key ILIKE $${idx}
        OR COALESCE(sub.plan, 'DEMO') ILIKE $${idx}
      )`);
    }
    if (scopedOrgId) {
      values.push(scopedOrgId);
      const idx = paramOffset + values.length;
      clauses.push(`(
        u.org_id = $${idx}
        OR EXISTS (
          SELECT 1
          FROM org_memberships om_scope
          WHERE om_scope.user_id = u.id
            AND om_scope.org_id = $${idx}
            AND om_scope.is_active = TRUE
        )
      )`);
    }
    return {
      where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
      values
    };
  }

  router.get("/admin/visibility-audit", requireAuth, requireAdmin, (req, res) => {
    // Sichtbarkeitsmatrix = Plattformkonfiguration, keine Kundendaten.
    if (!nurPlattform(req, res)) return;
    try {
      const report = buildVisibilityAuditReport();
      res.json({ success: true, data: report });
    } catch (e) {
      logger.error({ err: e }, "admin visibility-audit");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  router.get("/admin/control-center", requireAuth, requireAdmin, async (req, res) => {
    try {
      const viewer = await getUserAndPlan(req.session.userId);
      if (!viewer) return res.status(401).json({ success: false, error: { code: "NOT_AUTHENTICATED" } });
      /* Nur die Plattformverwaltung sieht plattformweite Zahlen (8.1.1 d).
       * Bewusst OHNE Abbruch bei fehlendem Org-Kontext: diese Karte ist die
       * Einstiegsansicht der Flaeche. Ein 403 wuerde sie ganz leeren, statt nur
       * die fremden Zahlen wegzulassen — Trennung, nicht Ausfall. */
      const umfang = bestimmeAdminUmfang(req);
      const data = await buildAdminControlCenter(pool, viewer, {
        plattformweit: umfang.plattformweit,
        orgId: req.orgId || viewer.org_id || null,
        orgName: req.orgName || viewer.org_name || null,
        orgRole: req.orgRole || viewer.org_role || null,
        userRole: req.session?.userRole || viewer.role || null
      });
      res.json({ success: true, data });
    } catch (e) {
      logger.error({ err: e }, "admin control-center");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  /* ── Users ──────────────────────────────── */
  router.get("/admin/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = parseIntegerParam(req.query.limit, { defaultValue: 50, min: 1, max: 200 });
      const offset = parseIntegerParam(req.query.offset, { defaultValue: 0, min: 0, max: 500000 });
      const search = sanitize(req.query.q || "", 100);
      const umfang = bestimmeAdminUmfang(req);
      if (umfang.fehler) return res.status(403).json({ success: false, error: umfang.fehler });
      const scopedOrgId = umfang.orgId;
      const fromClause = `
        FROM users u
        LEFT JOIN LATERAL (
          SELECT om.org_id, om.role_key
          FROM org_memberships om
          WHERE om.user_id = u.id AND om.is_active = TRUE
          ORDER BY om.created_at ASC
          LIMIT 1
        ) m ON TRUE
        LEFT JOIN organizations o ON o.id = COALESCE(m.org_id, u.org_id)
        LEFT JOIN LATERAL (
          SELECT s.plan, s.status
          FROM subscriptions s
          WHERE s.user_id = u.id
          ORDER BY s.created_at DESC
          LIMIT 1
        ) sub ON TRUE
      `;
      const listFilter = buildAdminUsersWhereClause({ search, scopedOrgId, paramOffset: 2 });
      const countFilter = buildAdminUsersWhereClause({ search, scopedOrgId, paramOffset: 0 });
      const listParams = [limit, offset, ...listFilter.values];
      const { rows } = await pool.query(
        `SELECT u.id, u.email, u.company_name, u.contact_person, u.role, u.city,
                COALESCE(sub.plan, 'DEMO') AS plan,
                sub.status AS subscription_status,
                COALESCE(m.org_id, u.org_id) AS org_id,
                o.name AS org_name,
                m.role_key AS org_role,
                (SELECT COUNT(*)::int FROM org_memberships om2 WHERE om2.user_id = u.id AND om2.is_active = TRUE) AS active_org_memberships,
                u.is_verified, u.created_at
         ${fromClause}
         ${listFilter.where} ORDER BY u.created_at DESC, u.id DESC LIMIT $1 OFFSET $2`, listParams
      );
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS total ${fromClause} ${countFilter.where}`,
        countFilter.values
      );
      const total = Number.parseInt(countRows[0]?.total || 0, 10) || 0;
      /* Scope-Transparenz (Produktionspfeiler 3): die Oberflaeche muss wissen,
       * wessen Daten sie zeigt — und welche Bedienelemente sie NICHT anbieten
       * darf. Ohne diese Angabe rendert sie plattformweite Schalter fuer einen
       * Kunden-Admin, und jeder Klick endet in einem 403 (tote Knoepfe). */
      res.json({
        success: true,
        data: {
          items: rows, total, limit, offset,
          scope: { plattformweit: umfang.plattformweit, org_id: umfang.orgId }
        }
      });
    } catch (e) {
      logger.error({ err: e }, "admin users");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Benutzer konnten nicht geladen werden." } });
    }
  });

  /* ── Organizations ──────────────────────── */
  router.get("/admin/organizations", requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = parseIntegerParam(req.query.limit, { defaultValue: 50, min: 1, max: 200 });
      const offset = parseIntegerParam(req.query.offset, { defaultValue: 0, min: 0, max: 500000 });
      /* Ohne Begrenzung listet ein Kunden-Admin JEDE Organisation der Plattform
       * — Namen, Tarife, Mitglieder- und Standortzahlen der Mitbewerber. */
      const umfang = bestimmeAdminUmfang(req);
      if (umfang.fehler) return res.status(403).json({ success: false, error: umfang.fehler });
      const grenze = umfang.plattformweit ? "" : "WHERE o.id = $3";
      const werte = umfang.plattformweit ? [limit, offset] : [limit, offset, umfang.orgId];
      const { rows } = await pool.query(
        `SELECT o.*,
                (SELECT COUNT(*)::int FROM org_memberships WHERE org_id = o.id AND is_active = TRUE) AS member_count,
                (SELECT COUNT(*)::int FROM org_locations WHERE org_id = o.id AND is_active = TRUE) AS location_count
         FROM organizations o${grenze ? " " + grenze : ""} ORDER BY o.created_at DESC LIMIT $1 OFFSET $2`,
        werte
      );
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM organizations o${umfang.plattformweit ? "" : " WHERE o.id = $1"}`,
        umfang.plattformweit ? [] : [umfang.orgId]
      );
      const total = Number.parseInt(countRows[0]?.total || 0, 10) || 0;
      res.json({
        success: true,
        data: {
          items: rows, total, limit, offset,
          scope: { plattformweit: umfang.plattformweit, org_id: umfang.orgId }
        }
      });
    } catch (e) { logger.error({ err: e }, "admin orgs"); res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } }); }
  });

  router.patch("/admin/organizations/:id/pilot-policy", requireAuth, requireAdmin, async (req, res) => {
    // Pilot-Ausnahme ist eine kaufmaennische Konzession von TempConnect,
    // keine Selbstbedienung des Kunden.
    if (!nurPlattform(req, res)) return;
    try {
      const orgId = String(req.params.id || "").trim();
      const allowException = req.body?.allow_exception === true;
      const reason = String(req.body?.reason || "").trim();
      if (!orgId) return res.status(400).json({ success: false, error: { code: "INVALID_ORG_ID" } });
      if (reason.length < 10) return res.status(400).json({ success: false, error: { code: "REASON_REQUIRED", message: "Dokumentierter Ausnahmegrund erforderlich." } });

      const data = await pilotPolicyService.setPilotException(pool, {
        orgId,
        actorUserId: req.session.userId || null,
        allowed: allowException,
        reason
      });
      res.locals.audit = {
        action: "admin.organization.pilot_policy.update",
        entity_type: "organization",
        entity_id: orgId,
        details: {
          allow_exception: allowException,
          reason
        }
      };
      res.json({ success: true, data });
    } catch (e) {
      if (e?.code === "PILOT_POLICY_SCHEMA_MISSING") {
        return res.status(503).json({ success: false, error: { code: e.code, message: e.message } });
      }
      if (e?.code === "ORG_NOT_FOUND") return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });
      if (e?.code === "PILOT_EXCEPTION_REASON_REQUIRED") {
        return res.status(400).json({ success: false, error: { code: e.code, message: e.message } });
      }
      logger.error({ err: e }, "admin org pilot policy update");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  /* ── Backoffice Requests (Admin) ───────────────────── */
  router.get("/admin/requests", requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(200, parseInt(req.query.limit) || 100);
      const offset = Math.max(0, parseInt(req.query.offset) || 0);
      const status = sanitize(req.query.status || "", 20) || null;
      /* `requests` traegt keine org_id (gemessen: 47 von 47 Zeilen NULL) — die
       * Beteiligten haengen an `requester_id`/`receiver_id`. Die Begrenzung
       * laeuft deshalb ueber die Mitgliedschaft, nicht ueber eine Spalte. */
      const umfang = bestimmeAdminUmfang(req);
      if (umfang.fehler) return res.status(403).json({ success: false, error: umfang.fehler });
      const { items, total } = await requestService.listRequestsAdmin(pool, {
        limit, offset, status,
        beteiligteOrgId: umfang.plattformweit ? null : umfang.orgId
      });
      res.json({
        success: true,
        data: {
          items, total, limit, offset,
          scope: { plattformweit: umfang.plattformweit, org_id: umfang.orgId }
        }
      });
    } catch (e) {
      logger.error({ err: e }, "admin requests list");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  router.patch("/admin/requests/:id/status", requireAuth, requireAdmin, async (req, res) => {
    // Statuswechsel einer Marktplatz-Anfrage von aussen: `requests` traegt keine
    // org_id (gemessen 2026-08-21: 47 von 47 Zeilen NULL), die Beteiligten
    // haengen an `requester_id`/`receiver_id`. Eine org-begrenzte Fassung gaebe
    // es nur ueber eine Mitgliedschafts-Bruecke — und ein Statuswechsel von
    // aussen ist ohnehin Eingriff des Teams, nicht Selbstverwaltung.
    if (!nurPlattform(req, res)) return;
    try {
      const id = String(req.params.id || "").trim();
      const status = String(req.body?.status || "").trim().toUpperCase();
      if (!id) return res.status(400).json({ success: false, error: { code: "INVALID_ID" } });
      if (!["SENT", "ACCEPTED", "DECLINED", "FILLED", "FINALIZED", "CANCELED"].includes(status)) {
        return res.status(400).json({ success: false, error: { code: "INVALID_STATUS" } });
      }

      // Mark audit attempt first (DENIED in case of non-2xx)
      res.locals.audit = {
        action: "admin.request.status_update_attempt",
        entity_type: "request",
        entity_id: id,
        details: { requested_status: status }
      };

      const reqData = await requestService.getRequestById(pool, id);
      if (!reqData) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });

      try {
        stateMachine.assertTransition("REQUEST", reqData.status, status);
      } catch (e) {
        if (e.name === "TransitionError") {
          return res.status(409).json({ success: false, error: { code: "INVALID_TRANSITION", from: e.from, to: e.to } });
        }
        throw e;
      }

      const updated = await requestService.updateRequestStatus(pool, id, status, "", "");
      res.locals.audit = {
        action: "admin.request.status_update",
        entity_type: "request",
        entity_id: id,
        details: { from: reqData.status, to: status }
      };
      res.json({ success: true, data: updated });
    } catch (e) {
      logger.error({ err: e }, "admin request status update");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  /* ── Strategic Collaboration Requests (Admin) ───────── */
  router.get("/admin/strategic-collaboration/requests", requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(200, parseInt(req.query.limit) || 50);
      const offset = Math.max(0, parseInt(req.query.offset) || 0);
      const status = sanitize(req.query.status || "", 40) || null;
      /* Zweiseitiger Vorgang: die eigene Org kann Anfragende ODER Angefragte
       * sein. Beides zaehlt — sonst sieht eine Seite ihren eigenen Vorgang nicht. */
      const umfang = bestimmeAdminUmfang(req);
      if (umfang.fehler) return res.status(403).json({ success: false, error: umfang.fehler });
      const { items, total } = await strategicCollaborationService.listAllRequestsAdmin(pool, {
        limit, offset, status,
        beteiligteOrgId: umfang.plattformweit ? null : umfang.orgId
      });
      res.json({
        success: true,
        data: {
          items, total, limit, offset,
          scope: { plattformweit: umfang.plattformweit, org_id: umfang.orgId }
        }
      });
    } catch (e) {
      logger.error({ err: e }, "admin strategic-collaboration list");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  router.patch("/admin/strategic-collaboration/requests/:id/status", requireAuth, requireAdmin, async (req, res) => {
    // Bearbeitungsstand einer Anfrage ZWISCHEN zwei Kunden — das ist die Arbeit
    // des TempConnect-Teams, nicht die einer der beiden Seiten.
    if (!nurPlattform(req, res)) return;
    try {
      const id = String(req.params.id || "").trim();
      const status = String(req.body?.status || "").trim();
      if (!id) return res.status(400).json({ success: false, error: { code: "INVALID_ID" } });
      if (!strategicCollaborationService.ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, error: { code: "INVALID_STATUS" } });
      }
      // Ensure audit marker also for denied/failed mutation paths
      res.locals.audit = {
        action: "admin.strategic_collaboration.status_update_attempt",
        entity_type: "strategic_collaboration_request",
        entity_id: id,
        details: { requested_status: status }
      };
      const row = await strategicCollaborationService.updateStatusAsAdmin(pool, id, status, req.session.userId);
      if (!row) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });
      res.locals.audit = {
        action: "admin.strategic_collaboration.status_update",
        entity_type: "strategic_collaboration_request",
        entity_id: row.id,
        details: { status: row.status }
      };
      res.json({ success: true, data: row });
    } catch (e) {
      logger.error({ err: e }, "admin strategic-collaboration status");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  router.patch("/admin/strategic-collaboration/requests/:id/assign", requireAuth, requireAdmin, async (req, res) => {
    // Zuweisung an einen Bearbeiter — Team-Workflow.
    if (!nurPlattform(req, res)) return;
    try {
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ success: false, error: { code: "INVALID_ID" } });
      let assignedTo = req.body?.assigned_to_user_id;
      if (assignedTo === undefined) assignedTo = req.session.userId;
      if (assignedTo === "me") assignedTo = req.session.userId;
      if (assignedTo === "") assignedTo = null;
      if (assignedTo !== null && !isLikelyUuid(String(assignedTo))) {
        return res.status(400).json({ success: false, error: { code: "INVALID_ASSIGNEE" } });
      }
      res.locals.audit = {
        action: "admin.strategic_collaboration.assign_attempt",
        entity_type: "strategic_collaboration_request",
        entity_id: id,
        details: { assigned_to: assignedTo || null }
      };
      const row = await strategicCollaborationService.assignRequestAsAdmin(pool, id, assignedTo, req.session.userId);
      if (!row) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });
      res.locals.audit = {
        action: "admin.strategic_collaboration.assign",
        entity_type: "strategic_collaboration_request",
        entity_id: row.id,
        details: { assigned_to: row.assigned_to_user_id || null }
      };
      res.json({ success: true, data: row });
    } catch (e) {
      logger.error({ err: e }, "admin strategic-collaboration assign");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  router.patch("/admin/strategic-collaboration/requests/:id/notes", requireAuth, requireAdmin, async (req, res) => {
    // Interne Notizen (`ops_notes`) — sie gehoeren keiner der beiden Kundenseiten.
    if (!nurPlattform(req, res)) return;
    try {
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ success: false, error: { code: "INVALID_ID" } });
      if (req.body?.ops_notes === undefined) {
        return res.status(400).json({ success: false, error: { code: "MISSING_NOTES" } });
      }
      if (typeof req.body.ops_notes !== "string") {
        return res.status(400).json({ success: false, error: { code: "INVALID_NOTES" } });
      }
      const trimmed = req.body.ops_notes.trim();
      if (trimmed.length > 5000) {
        return res.status(400).json({ success: false, error: { code: "INVALID_NOTES_LENGTH" } });
      }
      const notes = trimmed || null;
      res.locals.audit = {
        action: "admin.strategic_collaboration.ops_notes_update_attempt",
        entity_type: "strategic_collaboration_request",
        entity_id: id
      };
      const row = await strategicCollaborationService.updateOpsNotesAsAdmin(pool, id, notes);
      if (!row) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });
      res.locals.audit = {
        action: "admin.strategic_collaboration.ops_notes_update",
        entity_type: "strategic_collaboration_request",
        entity_id: row.id,
        details: { has_notes: Boolean(row.ops_notes) }
      };
      res.json({ success: true, data: row });
    } catch (e) {
      logger.error({ err: e }, "admin strategic-collaboration ops-notes");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  /* ── Audit Log (mit Pagination + erweiterten Filtern) ─────────── */
  router.get("/admin/audit-log", requireAuth, requireAdmin, async (req, res) => {
    try {
      /* Ohne diese Begrenzung liest ein Kunden-Admin die GANZE Plattform
       * (Befund 8.1.1 d). `org_id` aus der Anfrage darf den Umfang nur noch
       * VERENGEN, nie erweitern. */
      const umfang = bestimmeAdminUmfang(req);
      if (umfang.fehler) return res.status(403).json({ success: false, error: umfang.fehler });
      const limit = Math.min(500, parseInt(req.query.limit) || 100);
      const offset = parseInt(req.query.offset) || 0;
      const result = await queryAuditLog(pool, {
        org_id:      umfang.plattformweit ? (req.query.org_id || null) : umfang.orgId,
        actor_id:    req.query.actor_id    || null,
        actor_search: sanitize(req.query.actor_search || "") || null,
        org_search:   sanitize(req.query.org_search || "") || null,
        entity_type: sanitize(req.query.entity_type || "") || null,
        action:      sanitize(req.query.action || "")      || null,
        action_type: sanitize(req.query.action_type || "") || null,
        status:      sanitize(req.query.status || "")      || null,
        from:        req.query.from   || null,
        to:          req.query.to     || null,
        limit,
        offset
      });
      res.json({
        success: true,
        data: {
          items: result.items.map((item) => ({ ...item, ...formatFeedItem(item) })),
          total: result.total,
          page_size: limit,
          offset
        }
      });
    } catch (e) { logger.error({ err: e }, "admin audit"); res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } }); }
  });

  /* ── Recent Changes (Resource-spezifisch, fuer UI-Transparenz) ────── */
  router.get("/admin/audit-log/recent-changes", requireAuth, requireAdmin, async (req, res) => {
    try {
      const entityType = sanitize(req.query.entity_type || "");
      const entityId   = sanitize(req.query.entity_id || "");
      if (!entityType || !entityId) return res.status(400).json({ success: false, error: { code: "MISSING_PARAMS", message: "entity_type und entity_id erforderlich." } });
      const limit = Math.min(50, parseInt(req.query.limit) || 10);
      /* Die plattformweite Fassung ist bewusst so benannt, dass man sie nicht
       * versehentlich trifft (Befund E-5). Sie wurde hier trotzdem fuer JEDEN
       * `requireAdmin`-Passierer aufgerufen — also auch fuer Kunden-Admins
       * (Befund 8.1.1 d). Jetzt entscheidet der Umfang, welche Fassung laeuft. */
      const umfang = bestimmeAdminUmfang(req);
      if (umfang.fehler) return res.status(403).json({ success: false, error: umfang.fehler });
      const rows = umfang.plattformweit
        ? await getRecentChangesPlatformWide(pool, entityType, entityId, limit)
        : await getRecentChanges(pool, entityType, entityId, umfang.orgId, limit);
      res.json({ success: true, data: { items: rows } });
    } catch (e) { logger.error({ err: e }, "admin recent-changes"); res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } }); }
  });

  /* ── Platform Metrics ───────────────────── */
  router.get("/admin/metrics", requireAuth, requireAdmin, async (req, res) => {
    // Zaehlt ueber ALLE Nutzer, Organisationen, Anforderungen und Angebote.
    if (!nurPlattform(req, res)) return;
    try {
      const [users, orgs, reqs, offers, events, caps] = await Promise.all([
        pool.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER(WHERE created_at > NOW() - INTERVAL '30 days')::int AS last_30d FROM users"),
        pool.query("SELECT COUNT(*)::int AS total FROM organizations WHERE is_active = TRUE"),
        pool.query("SELECT status, COUNT(*)::int AS count FROM requisitions GROUP BY status"),
        pool.query("SELECT status, COUNT(*)::int AS count FROM offers GROUP BY status"),
        eventService.eventCounts(pool, null, 30),
        pool.query("SELECT COUNT(*)::int AS active FROM capacity_posts WHERE is_active = TRUE")
      ]);
      const reqMap = {}; (reqs.rows || []).forEach(r => { reqMap[r.status] = r.count; });
      const offMap = {}; (offers.rows || []).forEach(r => { offMap[r.status] = r.count; });
      const requisitionBacklog =
        (reqMap.PENDING_APPROVAL || 0)
        + (reqMap.APPROVED || 0)
        + (reqMap.OPEN || 0)
        + (reqMap.IN_REVIEW || 0)
        + (reqMap.SHORTLISTED || 0);
      const activeOffers =
        (offMap.sent || 0)
        + (offMap.SENT || 0)
        + (offMap.countered || 0)
        + (offMap.COUNTERED || 0)
        + (offMap.draft || 0)
        + (offMap.DRAFT || 0);
      res.json({
        success: true,
        data: {
          users: users.rows[0],
          organizations: orgs.rows[0],
          requisitions: reqMap,
          offers: offMap,
          events: events,
          capacity_posts: caps.rows[0],
          summary: {
            requisition_backlog: requisitionBacklog,
            active_offers: activeOffers,
            event_total_30d: events.total || 0
          },
          drilldowns: {
            executive_dashboard: "/public/executive_dashboard.html",
            organization_center: "/public/organization.html?tab=usage",
            system_health: "/public/system-health.html",
            requisitions_backlog: "/public/requisitions.html?status_group=backlog",
            activity_feed: "/public/admin_panel.html?tab=activity"
          }
        }
      });
    } catch (e) { logger.error({ err: e }, "admin metrics"); res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } }); }
  });

  /* ── User Actions ───────────────────── */
  router.patch("/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = String(req.params.id || "").trim();
      if (!userId) return res.status(400).json({ success: false, error: { code: "INVALID_ID" } });

      const ziel = await zielNutzerErlaubt(req, userId);
      if (!ziel.erlaubt) return res.status(403).json({ success: false, error: ziel.fehler });

      /*
       * `role` und `plan` sind PLATTFORM-Felder auf `users`, keine
       * Org-Verwaltung: die Rolle innerhalb einer Organisation steht in
       * `org_memberships.role_key`, und der wirksame Tarif kommt aus
       * `subscriptions` (`userService.getUserAndPlan`), nicht aus `users.plan`.
       *
       * Die Oberflaeche bot beides trotzdem als Auswahlfeld an — auch dem
       * Kunden-Admin, auch fuer ihn selbst (`adminPanel.js:1184` Rolle,
       * `:1189` Tarif). Ein Kunde konnte damit die eigene Zeile auf
       * `INDIVIDUELL` stellen. Kein Freischalt-Bypass, weil kein Feature-Gate
       * `users.plan` liest — aber es verfaelscht Analytik und DSGVO-Auskunft
       * und ist schlicht nicht seine Entscheidung.
       */
      const allowed = ziel.umfang.plattformweit
        ? ["role", "plan", "is_verified"]
        : ["is_verified"];
      const verweigert = Object.keys(req.body || {}).filter(
        (k) => ["role", "plan"].includes(k) && !ziel.umfang.plattformweit
      );
      if (verweigert.length) {
        return res.status(403).json({
          success: false,
          error: {
            code: "PLATTFORM_FELD",
            message: `Diese Felder kann nur die Plattformverwaltung setzen: ${verweigert.join(", ")}.`
          }
        });
      }
      const updates = [];
      const values = [];
      let idx = 1;
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          updates.push(`${key} = $${idx}`);
          values.push(req.body[key]);
          idx++;
        }
      }
      if (!updates.length) return res.status(400).json({ success: false, error: { code: "NO_FIELDS" } });
      values.push(userId);
      const { rows } = await pool.query(
        `UPDATE users SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${idx} RETURNING id, email, role, plan, is_verified`,
        values
      );
      if (!rows.length) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });
      // Audit log
      try {
        const { writeAuditEnhanced } = await import("../services/auditLog.js");
        await writeAuditEnhanced(pool, req, {
          action: "admin.user.update", entity_type: "user", entity_id: String(userId),
          details: { changed_fields: Object.keys(req.body).filter(k => allowed.includes(k)) }
        });
      } catch { /* audit non-critical */ }
      res.json({ success: true, data: rows[0] });
    } catch (e) { logger.error({ err: e }, "admin patch user"); res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } }); }
  });

  router.post("/admin/users/:id/deactivate", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = String(req.params.id || "").trim();
      if (!userId) return res.status(400).json({ success: false, error: { code: "INVALID_ID" } });

      /* Ohne diese Pruefung deaktiviert ein Kunden-Admin JEDEN Nutzer der
       * Plattform — auch Konten fremder Kunden und die von TempConnect
       * selbst (Befund 8.1.1 d). */
      const ziel = await zielNutzerErlaubt(req, userId);
      if (!ziel.erlaubt) return res.status(403).json({ success: false, error: ziel.fehler });

      const { rows } = await pool.query(
        `UPDATE users SET is_verified = FALSE, role = 'inactive', updated_at = NOW() WHERE id = $1 RETURNING id, email, role`,
        [userId]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });
      try {
        const { writeAuditEnhanced } = await import("../services/auditLog.js");
        await writeAuditEnhanced(pool, req, {
          action: "admin.user.deactivate", entity_type: "user", entity_id: String(userId)
        });
      } catch { /* audit non-critical */ }
      res.json({ success: true, data: rows[0] });
    } catch (e) { logger.error({ err: e }, "admin deactivate user"); res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } }); }
  });

  /* ── Admin Activity Feed (Governance Timeline) ──────── */
  router.get("/admin/activity-feed", requireAuth, requireAdmin, async (req, res) => {
    try {
      /* `queryActivityFeed` liest `orgId ? queryOrgAuditLog : queryAuditLog`
       * — `null` heisst dort PLATTFORMWEIT. `req.orgId || null` war damit
       * dieselbe selbstabschaltende Form wie in 8.1.1 (c). */
      const umfang = bestimmeAdminUmfang(req);
      if (umfang.fehler) return res.status(403).json({ success: false, error: umfang.fehler });
      const orgId = umfang.plattformweit ? (req.query.org_id || null) : umfang.orgId;
      const limit  = Math.min(200, parseInt(req.query.limit) || 50);
      const offset = Math.max(0, parseInt(req.query.offset) || 0);
      const result = await queryActivityFeed(pool, orgId, {
        action_type: sanitize(req.query.action_type || "") || null,
        from:        req.query.from || null,
        to:          req.query.to   || null,
        limit,
        offset
      });
      res.json({
        success: true,
        data: {
          items: result.items,
          total: result.total,
          limit,
          offset
        }
      });
    } catch (e) { logger.error({ err: e }, "admin activity-feed"); res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } }); }
  });

  /* ── Activity Feed Meta (action types for filters) ───── */
  router.get("/admin/activity-feed/action-types", requireAuth, requireAdmin, (_req, res) => {
    res.json({ success: true, data: { action_types: getActionTypes() } });
  });

  /* ── Revenue / SaaS KPIs ──────────────── */
  router.get("/admin/revenue", requireAuth, requireAdmin, async (req, res) => {
    // Plattformumsatz ueber alle Kunden.
    if (!nurPlattform(req, res)) return;
    try {
      const { getRevenueMetrics } = await import("../services/revenueMetricsService.js");
      const metrics = await getRevenueMetrics(pool);
      res.json({ success: true, data: metrics });
    } catch (e) {
      logger.error({ err: e }, "admin revenue");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  /* ── System Health Diagnostics ──────────── */
  router.get("/admin/system-health", requireAuth, requireAdmin, async (req, res) => {
    // Systeminternes (Datenbank, Jobs, Diagnose).
    if (!nurPlattform(req, res)) return;
    try {
      const diagnostics = await getSystemDiagnostics(pool);
      res.json({ success: true, data: diagnostics });
    } catch (e) {
      logger.error({ err: e }, "admin system-health");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  /* ── Audit Log CSV Export ────────────────── */
  router.get("/admin/audit-log/export/csv", requireAuth, requireAdmin, exportLimiter, async (req, res) => {
    try {
      /* Die Ausfuhr war der schwerere Teil desselben Befunds: sie liefert die
       * Zeilen als Datei ausser Haus (8.1.1 d). */
      const umfang = bestimmeAdminUmfang(req);
      if (umfang.fehler) return res.status(403).json({ success: false, error: umfang.fehler });
      const { exportAuditLogCsv } = await import("../services/exportService.js");
      const result = await queryAuditLog(pool, {
        org_id:      umfang.plattformweit ? (req.query.org_id || null) : umfang.orgId,
        actor_id:    req.query.actor_id    || null,
        actor_search: sanitize(req.query.actor_search || "") || null,
        org_search:   sanitize(req.query.org_search || "") || null,
        entity_type: sanitize(req.query.entity_type || "") || null,
        action:      sanitize(req.query.action || "")      || null,
        action_type: sanitize(req.query.action_type || "") || null,
        status:      sanitize(req.query.status || "")      || null,
        from:        req.query.from   || null,
        to:          req.query.to     || null,
        limit:       500,
        offset:      0
      });
      const csv = exportAuditLogCsv(result.items);
      const filename = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (e) { logger.error({ err: e }, "admin audit csv export"); res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } }); }
  });

  /* ── Feature Overrides (Admin Feature Dashboard) ─────── */
  router.get("/admin/feature-overrides", requireAuth, requireAdmin, async (req, res) => {
    // Freischalt-Hebel: `checkOverride` entscheidet ueber bezahlte Funktionen.
    if (!nurPlattform(req, res)) return;
    try {
      const { listOverrides } = await import("../services/featureOverrideService.js");
      const orgId = req.query.org_id ? parseInt(req.query.org_id, 10) : null;
      const limit = Math.min(200, parseInt(req.query.limit) || 100);
      const offset = parseInt(req.query.offset) || 0;
      const result = await listOverrides(pool, { orgId, limit, offset });
      res.json({ success: true, data: result });
    } catch (e) { logger.error({ err: e }, "admin feature-overrides list"); res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } }); }
  });

  router.put("/admin/feature-overrides", requireAuth, requireAdmin, async (req, res) => {
    // Nahm `org_id` frei aus dem Rumpf: ein Kunden-Admin konnte damit eine
    // Funktion fuer JEDE Organisation freischalten, auch die eigene.
    if (!nurPlattform(req, res)) return;
    try {
      const { upsertOverride } = await import("../services/featureOverrideService.js");
      const { feature_key, org_id, enabled, reason, expires_at } = req.body;
      if (!feature_key) return res.status(400).json({ success: false, error: { code: "MISSING_FEATURE_KEY" } });
      const override = await upsertOverride(pool, {
        featureKey: feature_key,
        orgId: org_id || null,
        enabled: enabled !== false,
        reason: reason || null,
        createdBy: req.session.userId,
        expiresAt: expires_at || null
      });
      try {
        const { writeAuditEnhanced } = await import("../services/auditLog.js");
        await writeAuditEnhanced(pool, req, {
          action: "admin.feature_override.upsert", entity_type: "feature_override", entity_id: String(override.id),
          details: { feature_key, org_id, enabled }
        });
      } catch { /* audit non-critical */ }
      res.json({ success: true, data: override });
    } catch (e) { logger.error({ err: e }, "admin feature-override upsert"); res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } }); }
  });

  router.delete("/admin/feature-overrides/:id", requireAuth, requireAdmin, async (req, res) => {
    if (!nurPlattform(req, res)) return;
    try {
      const { deleteOverride } = await import("../services/featureOverrideService.js");
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ success: false, error: { code: "INVALID_ID" } });
      const deleted = await deleteOverride(pool, id);
      if (!deleted) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });
      try {
        const { writeAuditEnhanced } = await import("../services/auditLog.js");
        await writeAuditEnhanced(pool, req, {
          action: "admin.feature_override.delete", entity_type: "feature_override", entity_id: String(id)
        });
      } catch { /* audit non-critical */ }
      res.json({ success: true });
    } catch (e) { logger.error({ err: e }, "admin feature-override delete"); res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } }); }
  });

  /** List all known feature keys (for dropdown in dashboard) */
  router.get("/admin/feature-keys", requireAuth, requireAdmin, (req, res) => {
    // Der Katalog der Freischalt-Schluessel gehoert zum Hebel darueber.
    if (!nurPlattform(req, res)) return;
    try {
      const { planFeatures } = require("../config/planFeatures.js");
      const keys = Object.keys(planFeatures);
      res.json({ success: true, data: { keys } });
    } catch {
      // ESM fallback
      import("../config/planFeatures.js").then(m => {
        res.json({ success: true, data: { keys: Object.keys(m.planFeatures) } });
      }).catch(_e => {
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
      });
    }
  });

  return router;
}
