/**
 * Emergency Staffing Routes — /api/emergency/*
 *
 * Professional Notdienst-Endpoints fuer dringende Personalbedarfe.
 * Plan-gated: emergency_staffing (PLUS/PRO/ENTERPRISE).
 */

import { z } from "zod";
import { Router } from "express";
import * as emergencyService from "../services/emergencyStaffingService.js";
import * as emergencyCommitmentService from "../services/emergencyCommitmentService.js";
import * as dealAgreementService from "../services/dealAgreementService.js";
import { dispatch } from "../services/notificationMatrix.js";
import { canAccessAsOwner } from "../utils/ownerCheck.js";
import { swallow } from "../utils/logger.js";

const emergencyRequestSchema = z.object({
  title: z.string().min(1).max(200),
  role: z.string().min(1).max(120),
  skill_tags: z.array(z.string().max(80)).optional().default([]),
  headcount: z.number().int().min(1).max(999).optional().default(1),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  location_city: z.string().min(1).max(120),
  location_postal: z.string().max(20).optional().nullable(),
  location_lat: z.number().optional().nullable(),
  location_lng: z.number().optional().nullable(),
  radius_km: z.number().int().min(1).max(500).optional().default(25),
  shifts: z.record(z.unknown()).optional().nullable(),
  requirements: z.record(z.unknown()).optional().nullable(),
  urgency: z.enum(["urgent", "critical", "notdienst"]).optional().default("notdienst"),
  budget_min: z.number().optional().nullable(),
  budget_max: z.number().optional().nullable(),
  sla_minutes: z.number().int().min(15).max(10080).optional().nullable()
});

const commitmentSchema = z.object({
  committed_quantity: z.number().int().min(1).max(999),
  note: z.string().max(1000).optional().nullable()
});

const commitmentStatusSchema = z.object({
  status: z.enum(["withdrawn", "rejected", "expired"]),
  note: z.string().max(1000).optional().nullable()
});

/**
 * @param {{ pool, requireAuth, requireFeature, getUserAndPlan, logger }} deps
 */
export function createEmergencyRouter(deps) {
  const { pool, requireAuth, requireFeature, getUserAndPlan, logger } = deps;
  const router = Router();
  const emergencyAccess = requireFeature("emergency_staffing");

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * WER DEN PLATTFORMWEITEN BLICK BEKOMMT (N7.5, 2026-09-06)
   * ═════════════════════════════════════════════════════════════════════════
   *
   * `?all=1` hebt den Org-Filter auf. Davor stand bis heute nur
   * `requireFeature("emergency_staffing")` - und das prueft den TARIF, keine
   * Rolle. Ein UNTERNEHMEN auf PLUS las damit die Notlagen seiner Wettbewerber,
   * obwohl es sie gar nicht bedienen kann.
   *
   * Der Schalter selbst bleibt: eine Agentur muss sehen, wo Not herrscht, sonst
   * gibt es keinen Markt. Nur die Zielgruppe wird die, die handeln KANN.
   *
   * WARUM DAS KEINE REICHWEITE KOSTET, und das ist der Punkt, der die Abwaegung
   * aufloest: `GET /marketplace/public/demand-requests` filtert NICHT nach
   * Dringlichkeit. Notlagen erscheinen dort schon heute - fuer jeden
   * Angemeldeten, mit 14 kuratierten Feldern, ohne Tarifschranke. Was dieser
   * Schalter zusaetzlich liefert, ist die Leitstand-Qualitaet: Alter, SLA-Stand,
   * Eskalationsstufe, Sortierung nach Dringlichkeit. Das ist das Premium-
   * Produkt, nicht der Bedarf selbst. Der Tarif bleibt deshalb stehen
   * (Owner-Entscheidung 2026-09-06).
   *
   * ABGELEHNT wird ausdruecklich, statt still auf die eigene Organisation
   * zurueckzufallen: wer plattformweit fragt und stillschweigend nur das Eigene
   * bekommt, haelt eine leere Liste fuer eine Aussage ueber den Markt.
   *
   * @returns {Promise<{ok: true}|{ok: false, status: number, error: string}>}
   */
  async function plattformweitErlaubt(req) {
    const me = await getUserAndPlan(req.session.userId);
    if (me?.role !== "agency") {
      return { ok: false, status: 403, error: "AGENCY_ONLY" };
    }
    return { ok: true };
  }

  /** Der Org-Ausschnitt fuer diese Anfrage - `null` heisst plattformweit. */
  async function ausschnitt(req) {
    if (req.query.all !== "1") return { ok: true, orgId: req.session.userId };
    const erlaubt = await plattformweitErlaubt(req);
    if (!erlaubt.ok) return erlaubt;
    return { ok: true, orgId: null };
  }

  async function getDemandById(demandId) {
    const { rows } = await pool.query(
      `SELECT dr.id, dr.requester_company_id, dr.urgency, dr.status, dr.required_total_count,
              dr.currently_committed_count, dr.remaining_open_count
         FROM demand_requests dr
        WHERE dr.id = $1`,
      [demandId]
    );
    return rows[0] || null;
  }

  async function canAgencyAccessEmergency(demandId, agencyUserId) {
    const { rows } = await pool.query(
      `SELECT 1
         FROM matches m
         JOIN capacity_posts cp ON cp.id = m.capacity_post_id
        WHERE m.demand_request_id = $1
          AND cp.supplier_company_id = $2
        LIMIT 1`,
      [demandId, agencyUserId]
    );
    return Boolean(rows[0]);
  }

  /* ── POST /api/emergency/request ─────────────────── */

  router.post("/emergency/request", requireAuth, emergencyAccess, async (req, res) => {
    try {
      const me = await getUserAndPlan(req.session.userId);
      if (me?.role !== "company") return res.status(403).json({ error: "COMPANY_ONLY" });

      const parsed = emergencyRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      /* N2.11 — der zweite Notdienst-Anlegeweg reichte keine Firma durch. Die
         Kundensperre haengt an ihr: ohne sie lief der Abgleich ungefiltert, die
         gesperrte Kraft stand in den Treffern, und ihre Zeitarbeitsfirma bekam
         "NOTDIENST — sofortige Reaktion" (Befund der Pruefung vom 2026-09-15).
         Aus der Sitzung, nach dem Spread — nie aus dem Rumpf. */
      const result = await emergencyService.createEmergencyRequest(
        pool, req.session.userId, me?.plan ?? "FREE", { ...parsed.data, requester_org_id: req.orgId || null }
      );

      res.locals.audit = {
        action: "emergency.request.create",
        entity_type: "demand_request",
        entity_id: result.demand?.id,
        details: { urgency: result.urgency_level, role: parsed.data.role, city: parsed.data.location_city }
      };
      res.status(201).json(result);
    } catch (e) {
      logger.error({ err: e.message }, "POST /emergency/request");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── GET /api/emergency/active ───────────────────── */

  router.get("/emergency/active", requireAuth, emergencyAccess, async (req, res) => {
    try {
      const a = await ausschnitt(req);
      if (!a.ok) return res.status(a.status).json({ error: a.error });
      const items = await emergencyService.getActiveEmergencies(pool, a.orgId);
      res.json({ items, count: items.length, scope: a.orgId ? "own" : "platform" });
    } catch (e) {
      logger.error({ err: e.message }, "GET /emergency/active");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── GET /api/emergency/dashboard ────────────────── */

  router.get("/emergency/dashboard", requireAuth, emergencyAccess, async (req, res) => {
    try {
      const a = await ausschnitt(req);
      if (!a.ok) return res.status(a.status).json({ error: a.error });
      const dashboard = await emergencyService.getEmergencyDashboard(pool, a.orgId);
      res.json({ ...dashboard, scope: a.orgId ? "own" : "platform" });
    } catch (e) {
      logger.error({ err: e.message }, "GET /emergency/dashboard");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── POST /api/emergency/:id/respond ─────────────── */

  router.post("/emergency/:id/respond", requireAuth, emergencyAccess, async (req, res) => {
    try {
      const me = await getUserAndPlan(req.session.userId);
      if (me?.role !== "agency") return res.status(403).json({ error: "AGENCY_ONLY" });

      const result = await emergencyService.recordSupplierResponse(
        pool, req.params.id, req.session.userId
      );
      if (result.error === "NOT_FOUND") return res.status(404).json(result);
      if (result.error === "NOT_EMERGENCY") return res.status(400).json(result);
      if (result.error === "NOT_OPEN") return res.status(409).json(result);
      if (result.error) return res.status(400).json(result);

      res.locals.audit = {
        action: "emergency.respond",
        entity_type: "demand_request",
        entity_id: req.params.id,
        details: { response_count: result.response_count }
      };
      res.json(result);
    } catch (e) {
      logger.error({ err: e.message }, "POST /emergency/:id/respond");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── POST /api/emergency/:id/escalate ────────────── */

  router.post("/emergency/:id/escalate", requireAuth, emergencyAccess, async (req, res) => {
    try {
      /*
       * BEFUND N7.4 (geschlossen 2026-09-05): dieser Endpunkt hatte KEINE
       * Eigentumspruefung - weder hier noch im Dienst. `escalateEmergency`
       * nimmt `actorId` entgegen, schreibt sie ins SLA-Ereignis und ins
       * Protokoll, vergleicht sie aber nie mit `requester_company_id`.
       *
       * Wirkung: jeder Angemeldete mit `emergency_staffing` im Tarif konnte
       * JEDE offene Notlage JEDES Unternehmens dreimal hochstufen. Jede Stufe
       * loest einen Rundruf an bis zu 50 Anbieter aus - mit E-Mail
       * (`emailQueue: true`) und mit Titel, Rolle und Ort der fremden Notlage
       * im Text. Ein Schreibzugriff in einen fremden Vorgang, der zugleich ein
       * Versandverstaerker ist.
       *
       * Dass es ein Versehen war und keine Absicht, sagen die Nachbarn in
       * derselben Datei: `/respond` prueft die Rolle, `GET /:id/commitments`
       * prueft `isRequester || isMatchedAgency`, `POST /:id/commitments` prueft
       * die Zuordnung. `dealAgreementService.js` schreibt den Grund sogar
       * ausdruecklich hin - "emergencyAccess ist nur ein Feature-Gate, KEIN
       * Ownership-Check". Genau diese eine Route hat niemand nachgezogen.
       *
       * Zur Reihenfolge 404-dann-403, damit sie niemand fuer mehr haelt, als
       * sie ist: sie VERRAET, ob eine Kennung existiert. Das ist hier
       * hinnehmbar und bewusst - die Kennungen sind UUIDs, die Existenz
       * schuetzt ihre Entropie und nicht der Statuscode -, und sie folgt dem
       * Nachbarn `GET /:id/commitments`, der ebenso antwortet. Eine
       * abweichende Reihenfolge nur an dieser einen Route waere eine
       * Ungleichheit ohne Gewinn.
       */
      const demand = await getDemandById(req.params.id);
      if (!demand) return res.status(404).json({ error: "NOT_FOUND" });
      const darfEskalieren = await canAccessAsOwner(
        pool, demand.requester_company_id, req.session.userId
      );
      if (!darfEskalieren) return res.status(403).json({ error: "FORBIDDEN" });

      const result = await emergencyService.escalateEmergency(
        pool, req.params.id, req.session.userId
      );
      if (result.error === "NOT_FOUND") return res.status(404).json(result);
      if (result.error === "NOT_OPEN") return res.status(409).json(result);
      if (result.error === "NOT_EMERGENCY") return res.status(400).json(result);
      if (result.error === "MAX_ESCALATION_REACHED") return res.status(409).json(result);
      if (result.error) return res.status(400).json(result);

      res.locals.audit = {
        action: "emergency.escalate",
        entity_type: "demand_request",
        entity_id: req.params.id,
        details: { new_level: result.new_level }
      };
      res.json(result);
    } catch (e) {
      logger.error({ err: e.message }, "POST /emergency/:id/escalate");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── GET /api/emergency/history ──────────────────── */

  router.get("/emergency/history", requireAuth, emergencyAccess, async (req, res) => {
    try {
      const a = await ausschnitt(req);
      if (!a.ok) return res.status(a.status).json({ error: a.error });
      /* Der Verlauf liefert seit jeher eine kuratierte Auswahl (kein `dr.*`) -
         hier fehlte nur die Zielgruppe. */
      const items = await emergencyService.getEmergencyHistory(
        pool, a.orgId,
        { limit: Number(req.query.limit) || 50, offset: Number(req.query.offset) || 0 }
      );
      res.json({ items, count: items.length, scope: a.orgId ? "own" : "platform" });
    } catch (e) {
      logger.error({ err: e.message }, "GET /emergency/history");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── GET /api/emergency/config ───────────────────── */

  router.get("/emergency/config", requireAuth, (_req, res) => {
    res.json({
      urgency_levels: Object.entries(emergencyService.URGENCY_CONFIG).map(([key, cfg]) => ({
        level: key,
        label: cfg.label,
        sla_minutes: cfg.slaMinutes,
        response_window_minutes: cfg.responseWindow,
        escalation: cfg.escalation,
        force_email: cfg.forceEmail,
        is_emergency: emergencyService.isEmergency(key)
      }))
    });
  });

  /* ── GET /api/emergency/:id/commitments ───────────── */

  router.get("/emergency/:id/commitments", requireAuth, emergencyAccess, async (req, res) => {
    try {
      const demand = await getDemandById(req.params.id);
      if (!demand) return res.status(404).json({ error: "NOT_FOUND" });
      if (!emergencyService.isEmergency(demand.urgency)) return res.status(400).json({ error: "NOT_EMERGENCY" });

      const me = await getUserAndPlan(req.session.userId);
      const isRequester = await canAccessAsOwner(pool, demand.requester_company_id, req.session.userId);
      const isMatchedAgency = me?.role === "agency" ? await canAgencyAccessEmergency(demand.id, req.session.userId) : false;
      if (!isRequester && !isMatchedAgency) return res.status(403).json({ error: "FORBIDDEN" });

      const commitments = await emergencyCommitmentService.listCommitments(pool, req.params.id);

      /*
       * N7.4 - WER DARF WAS, entschieden im Backend.
       *
       * Bis hierher lieferte diese Antwort eine reine Liste. Die Oberflaeche
       * haette daraus selbst ableiten muessen, wer zuruecknehmen darf - also
       * die eigene Kennung mit `supplier_company_id` vergleichen. Genau das
       * verbietet die Hausregel ("Berechtigungsentscheidung kommt immer aus
       * dem Backend; Frontend zeigt nur an"), und zwar aus einem praktischen
       * Grund: eine Ableitung im Browser ist eine ZWEITE Wahrheit, die von der
       * ersten abweichen kann, ohne dass es jemand merkt.
       *
       * Die Regeln spiegeln, was die Dienste wirklich zulassen:
       *   zuruecknehmen  die zusagende Agentur nimmt ihre eigene Zusage zurueck
       *   ablehnen       das anfragende Unternehmen weist sie zurueck
       *   vereinbarung   beide Parteien duerfen daraus eine bindende
       *                  Vereinbarung machen (dealAgreementService)
       *
       * `status === "committed"` steht ueberall dabei, weil beide Dienste eine
       * bereits beendete Zusage mit INVALID_TRANSITION bzw.
       * COMMITMENT_NOT_ACTIVE abweisen. Ein Knopf, der verlaesslich einen
       * Fehler erzeugt, ist schlimmer als kein Knopf.
       */
      /* Je ANBIETER einmal fragen, nicht je Zusage: dieselbe Agentur kann
         mehrfach zugesagt haben (Nachschlag, nachdem sich Kapazitaet ergeben
         hat), und `canAccessAsOwner` schlaegt bei einer Kollegin in der
         Datenbank nach. Die Menge ist zwar klein — sie waechst mit den
         zugeordneten Agenturen, nicht mit der Plattform —, aber dieselbe
         Antwort zweimal zu holen ist auch bei kleiner Menge falsch. */
      const binAnbieterBei = new Map();
      for (const c of commitments) {
        const anbieter = c.supplier_company_id;
        if (binAnbieterBei.has(anbieter)) continue;
        binAnbieterBei.set(
          anbieter,
          isRequester ? false : await canAccessAsOwner(pool, anbieter, req.session.userId)
        );
      }
      const mitRechten = commitments.map((c) => {
        const offen = c.status === "committed";
        const binAnbieter = binAnbieterBei.get(c.supplier_company_id) === true;
        return {
          ...c,
          darf: {
            zuruecknehmen: offen && binAnbieter,
            ablehnen: offen && isRequester,
            vereinbarung: offen && (isRequester || binAnbieter)
          }
        };
      });

      res.json({
        demand_id: demand.id,
        status: demand.status,
        required_total_count: demand.required_total_count,
        currently_committed_count: demand.currently_committed_count,
        remaining_open_count: demand.remaining_open_count,
        /* Die Sicht des Abrufenden auf DIESE Notlage - die Oberflaeche
           braucht sie fuer die Ueberschrift, nicht fuer die Berechtigung. */
        viewer: { is_requester: isRequester, is_matched_agency: isMatchedAgency },
        commitments: mitRechten
      });
    } catch (e) {
      logger.error({ err: e.message }, "GET /emergency/:id/commitments");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── POST /api/emergency/:id/commitments ──────────── */

  router.post("/emergency/:id/commitments", requireAuth, emergencyAccess, async (req, res) => {
    try {
      const me = await getUserAndPlan(req.session.userId);
      if (me?.role !== "agency") return res.status(403).json({ error: "AGENCY_ONLY" });
      const parsed = commitmentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const result = await emergencyCommitmentService.createCommitment(pool, {
        demandId: req.params.id,
        supplierCompanyId: req.session.userId,
        quantity: parsed.data.committed_quantity,
        actorUserId: req.session.userId,
        note: parsed.data.note || null
      });
      if (result.error === "NOT_FOUND") return res.status(404).json(result);
      if (result.error === "NOT_EMERGENCY") return res.status(400).json(result);
      if (result.error === "NOT_OPEN") return res.status(409).json(result);
      if (result.error === "OVERFILL_NOT_ALLOWED") return res.status(409).json(result);
      if (result.error === "SUPPLIER_NOT_MATCHED") return res.status(403).json(result);
      if (result.error) return res.status(400).json(result);
      try {
        await emergencyService.recordSupplierResponse(pool, req.params.id, req.session.userId);
      } catch { /* non-critical */ }

      const demand = await getDemandById(req.params.id);
      if (demand?.requester_company_id) {
        await dispatch(pool, "emergency.commitment_received", {
          recipientUserIds: [demand.requester_company_id],
          entityType: "demand_request",
          entityId: req.params.id,
          message: `Neue Teilzusage: ${parsed.data.committed_quantity} Personen zugesagt.`
        }).catch(swallow("emergency"));
      }

      res.locals.audit = {
        action: "emergency.commitment.create",
        entity_type: "demand_request",
        entity_id: req.params.id,
        details: {
          commitment_id: result.commitment.id,
          committed_quantity: result.commitment.committed_quantity,
          demand_status: result.coverage?.status
        }
      };
      res.status(201).json(result);
    } catch (e) {
      logger.error({ err: e.message }, "POST /emergency/:id/commitments");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── PATCH /api/emergency/commitments/:id ─────────── */

  router.patch("/emergency/commitments/:id", requireAuth, emergencyAccess, async (req, res) => {
    try {
      const parsed = commitmentStatusSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const me = await getUserAndPlan(req.session.userId);

      const result = await emergencyCommitmentService.updateCommitmentStatus(pool, {
        commitmentId: req.params.id,
        actorUserId: req.session.userId,
        actorRole: me?.role || null,
        status: parsed.data.status,
        note: parsed.data.note || null
      });
      if (result.error === "NOT_FOUND") return res.status(404).json(result);
      if (result.error === "FORBIDDEN") return res.status(403).json(result);
      if (result.error === "INVALID_TRANSITION") return res.status(409).json(result);
      if (result.error) return res.status(400).json(result);

      res.locals.audit = {
        action: `emergency.commitment.${parsed.data.status}`,
        entity_type: "demand_request",
        entity_id: result.commitment.demand_request_id,
        details: {
          commitment_id: result.commitment.id,
          demand_status: result.coverage?.status
        }
      };
      res.json(result);
    } catch (e) {
      logger.error({ err: e.message }, "PATCH /emergency/commitments/:id");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── POST /api/emergency/:id/commitments/:cid/create-agreement ── */
  /* Notdienst-Sofortvereinbarung: erzeugt bindendes Offer + Agreement aus Commitment */

  const emergencyAgreementSchema = z.object({
    quantity: z.number().int().min(1).optional(),
    hourly_rate: z.number().min(0).optional().nullable(),
    start_time: z.string().optional().nullable(),
    response_time_minutes: z.number().int().min(0).optional().nullable(),
    replacement_sla_minutes: z.number().int().min(0).optional().nullable(),
    terms: z.string().max(2000).optional().nullable(),
    note: z.string().max(1000).optional().nullable()
  });

  router.post("/emergency/:id/commitments/:cid/create-agreement", requireAuth, emergencyAccess, async (req, res) => {
    try {
      const parsed = emergencyAgreementSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const result = await dealAgreementService.createEmergencyAgreement(pool, {
        demandId: req.params.id,
        commitmentId: req.params.cid,
        conditions: parsed.data,
        actorId: req.session.userId
      });

      if (result.error === "NOT_FOUND") return res.status(404).json(result);
      if (result.error === "FORBIDDEN") return res.status(403).json(result);
      if (result.error === "COMMITMENT_NOT_ACTIVE") return res.status(409).json(result);
      if (result.error) return res.status(400).json(result);

      // Notify requester
      const demand = await getDemandById(req.params.id);
      if (demand?.requester_company_id) {
        await dispatch(pool, "deal.emergency_agreement_created", {
          recipientUserIds: [demand.requester_company_id],
          entityType: "offer",
          entityId: result.offer.id,
          message: `Notdienst-Sofortvereinbarung ${result.offer.agreement_ref} erstellt \u2013 Ihre Best\u00e4tigung wird erwartet.`
        }).catch(swallow("emergency"));
      }

      res.locals.audit = {
        action: "emergency.agreement.create",
        entity_type: "offer",
        entity_id: result.offer.id,
        details: { demand_id: req.params.id, commitment_id: req.params.cid, agreement_ref: result.offer.agreement_ref }
      };
      res.status(201).json(result);
    } catch (e) {
      logger.error({ err: e.message }, "POST /emergency/:id/commitments/:cid/create-agreement");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
