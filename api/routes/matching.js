/**
 * Matching REST-Router: scored matching results with explainability.
 * 3 endpoints: demand→capacities, supply→demands, worker→assignments.
 */
import { Router } from "express";
import * as engine from "../services/matchingEngine.js";
import * as instant from "../services/instantMatchService.js";
import { computeFillRateSignal, computeSlaComplianceSignal, computeRoleExpertiseSignal, computeRecencySignal, computeSmartRankScore, classifySmartRank, SMART_RANK_WEIGHTS, SMART_RANK_LABELS } from "../services/smartRankingService.js";
import { requirePermission } from "../middleware/rbac.js";
import { attachExplanations } from "../services/matchExplanationService.js";
import { rankMatches } from "../services/aiMatchRankingService.js";
import { swallow } from "../utils/logger.js";

/**
 * @param {{ pool, requireAuth, logger }} deps
 */
export function createMatchingRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();
  const rperm = (p) => requirePermission(p, { pool, logger });

  // GET /api/matching/demand/:id — find capacity posts for a demand/requisition
  router.get("/matching/demand/:id", requireAuth, rperm("requisition.view"), async (req, res) => {
    try {
      // Befund E-14 (2026-08-20): die Zugehoerigkeit wird VOR jeder Arbeit
      // geklaert — vorher lief die Engine gegen jeden fremden Bedarf, und
      // logMatch schrieb den fremden Vorgang unter der EIGENEN Org ins
      // ML-Protokoll. Die Regel ist die des Marktplatzes, nicht eine neue:
      // eigener Bedarf immer, fremder nur solange er offen ausgespielt wird.
      const zugang = await engine.darfBedarfSehen(pool, req.params.id, req.session?.userId);
      if (zugang === "NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
      if (zugang !== "OK") return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });

      const matches = await engine.findMatches(pool, req.params.id, {
        topN: Number(req.query.limit) || 25,
        minScore: Number(req.query.min_score) || 1
      });
      // ML log top results
      for (const m of matches.slice(0, 10)) {
        engine.logMatch(pool, {
          match_type: "demand_capacity",
          source_id: req.params.id,
          target_id: m.capacity_post?.id,
          score: m.score,
          reasons: m.reasons,
          outcome: "suggested",
          org_id: req.orgId || null
        }).catch(swallow("matching"));
      }
      // P4.2 Erklaerung zuerst — sie ist die Baseline, die 4.3 umsortiert (nie ersetzt).
      const explained = attachExplanations(matches);
      // P4.3: Flag AUS oder Tarif ohne Anspruch => exakt die deterministische Reihenfolge.
      const ranked = await rankMatches(pool, {
        matches: explained,
        demandType: "demand_request",
        demandId: req.params.id,
        plan: req.user?.plan
      });
      res.json({
        demand_id: req.params.id,
        count: ranked.matches.length,
        matches: ranked.matches,
        ai_ranking: { applied: ranked.applied, reason: ranked.reason }
      });
    } catch (err) {
      logger.error({ err: err.message }, "GET /matching/demand/:id");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // GET /api/matching/supply/:id — find demands/requisitions for a capacity post
  router.get("/matching/supply/:id", requireAuth, rperm("requisition.view"), async (req, res) => {
    try {
      // Befund E-14: dieselbe Klaerung fuer das Angebot. Die Regel steht in
      // `capacityExchangeService.canViewerSeeEntry` — der Anbieter sieht sein
      // Angebot immer, alle anderen nur ein aktives, nicht privates.
      const zugang = await engine.darfKapazitaetSehen(
        pool, req.params.id, req.session?.userId, req.orgId
      );
      if (zugang === "NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
      if (zugang !== "OK") return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });

      const matches = await engine.matchCapacityToRequisitions(pool, req.params.id, {
        topN: Number(req.query.limit) || 25,
        minScore: Number(req.query.min_score) || 1
      });
      for (const m of matches.slice(0, 10)) {
        engine.logMatch(pool, {
          match_type: "capacity_demand",
          source_id: req.params.id,
          target_id: m.entity?.id,
          score: m.score,
          reasons: m.reasons,
          outcome: "suggested",
          org_id: req.orgId || null
        }).catch(swallow("matching"));
      }
      res.json({ capacity_post_id: req.params.id, count: matches.length, matches: attachExplanations(matches) });
    } catch (err) {
      logger.error({ err: err.message }, "GET /matching/supply/:id");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // GET /api/matching/worker/:id — find assignments for a specific worker
  router.get("/matching/worker/:id", requireAuth, rperm("requisition.view"), async (req, res) => {
    try {
      // Befund E-21 (2026-08-20): dieser Weg hat NIE funktioniert — die Engine
      // liest `FROM workers`, und diese Tabelle hat keine Migration je angelegt
      // (gemessen gegen die laufende Datenbank: 42P01). Der Aufruf endet seit
      // jeher in 500. Ob der Weg entfernt oder auf `worker_profiles` gebaut
      // wird, ist eine Produktentscheidung (P1-19) und wird hier nicht geraten.
      //
      // Was hier dennoch passiert: die Org-Bindung wird JETZT durchgereicht.
      // Ohne sie waere der Weg am Tag, an dem jemand eine `workers`-Tabelle
      // anlegt, sofort ein ungebundener org-uebergreifender Lesezugriff — ein
      // schlafendes Leck. Mit ihr kann er das nicht mehr werden.
      const matches = await engine.matchWorkerToAssignments(pool, req.params.id, {
        topN: Number(req.query.limit) || 25,
        minScore: Number(req.query.min_score) || 1,
        viewerOrgId: req.orgId || null
      });
      for (const m of matches.slice(0, 10)) {
        engine.logMatch(pool, {
          match_type: "worker_assignment",
          source_id: req.params.id,
          target_id: m.entity?.id,
          score: m.score,
          reasons: m.reasons,
          outcome: "suggested",
          org_id: req.orgId || null
        }).catch(swallow("matching"));
      }
      res.json({ worker_id: req.params.id, count: matches.length, matches: attachExplanations(matches) });
    } catch (err) {
      logger.error({ err: err.message }, "GET /matching/worker/:id");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ═══════════════════════════════════════════════════════
     Instant Match — Premium Enriched Matching
     ═══════════════════════════════════════════════════════ */

  // GET /api/matching/instant/search — Ad-hoc instant match from query params
  router.get("/matching/instant/search", requireAuth, rperm("requisition.view"), async (req, res) => {
    try {
      const demand = {
        role: req.query.role || null,
        skill_tags: req.query.skills ? String(req.query.skills).split(",").map(s => s.trim()) : [],
        latitude: req.query.lat ? Number(req.query.lat) : null,
        longitude: req.query.lng ? Number(req.query.lng) : null,
        location_city: req.query.city || null,
        radius_km: req.query.radius ? Number(req.query.radius) : null,
        start_date: req.query.start_date || null,
        end_date: req.query.end_date || null
      };
      const result = await instant.instantMatchFromParams(pool, demand, req.orgId, {
        topN: Number(req.query.limit) || 25,
        minScore: Number(req.query.min_score) || 10,
        budgetPerHour: req.query.budget ? Number(req.query.budget) : null,
        workersNeeded: req.query.workers ? Number(req.query.workers) : null,
        urgency: req.query.urgency || null
      });
      res.json({ ...result, matches: attachExplanations(result.matches) });
    } catch (err) {
      logger.error({ err: err.message }, "GET /matching/instant/search");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // GET /api/matching/instant/:requisitionId — Premium Instant Match for requisition
  router.get("/matching/instant/:requisitionId", requireAuth, rperm("requisition.view"), async (req, res) => {
    try {
      const result = await instant.instantMatchForRequisition(pool, req.params.requisitionId, req.orgId, {
        topN: Number(req.query.limit) || 25,
        minScore: Number(req.query.min_score) || 10
      });
      if (result.error === "REQUISITION_NOT_FOUND") return res.status(404).json(result);
      if (result.error === "ORG_BOUNDARY_VIOLATION") return res.status(403).json(result);
      if (result.error) return res.status(400).json(result);
      const explained = attachExplanations(result.matches);
      const ranked = await rankMatches(pool, {
        matches: explained,
        demandType: "requisition",
        demandId: req.params.requisitionId,
        plan: req.user?.plan
      });
      res.json({ ...result, matches: ranked.matches, ai_ranking: { applied: ranked.applied, reason: ranked.reason } });
    } catch (err) {
      logger.error({ err: err.message }, "GET /matching/instant/:requisitionId");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ═══════════════════════════════════════════════════════
     Smart Rank — Explainable AI Ranking
     ═══════════════════════════════════════════════════════ */

  // GET /api/matching/smart-explain/:supplierId — nachvollziehbares Smart-Rank-Profil
  router.get("/matching/smart-explain/:supplierId", requireAuth, rperm("requisition.view"), async (req, res) => {
    try {
      const { supplierId } = req.params;
      const role = req.query.role || null;

      // 1) Metrics + Reputation
      const { rows } = await pool.query(
        `SELECT
           COALESCE(sm.requests_received, 0)::int AS requests_received,
           COALESCE(sm.requests_accepted, 0)::int AS requests_accepted,
           COALESCE(sm.sla_breaches, 0)::int       AS sla_breaches,
           sr.timesheet_reliability_score,
           sr.activity_score
         FROM organizations o
         LEFT JOIN supplier_metrics sm ON sm.agency_id = o.id AND sm.window_days = 30
         LEFT JOIN supplier_reputation sr ON sr.supplier_id = o.id
         WHERE o.id = $1`,
        [supplierId]
      );
      if (!rows.length) return res.status(404).json({ error: "SUPPLIER_NOT_FOUND" });
      const d = rows[0];

      // 2) Role expertise (optional)
      let roleDealCount = 0, totalDealCount = 0;
      if (role) {
        try {
          const { rows: rr } = await pool.query(
            `SELECT
               COUNT(*) FILTER (WHERE LOWER(TRIM(role)) = $2 AND status IN ('FINALIZED','COMPLETED'))::int AS role_deals,
               COUNT(*) FILTER (WHERE status IN ('FINALIZED','COMPLETED'))::int AS total_deals
             FROM requests WHERE receiver_id = $1`,
            [supplierId, role.toLowerCase().trim()]
          );
          if (rr.length) { roleDealCount = rr[0].role_deals; totalDealCount = rr[0].total_deals; }
        } catch { /* column may not exist */ }
      }

      // 3) Recency: latest capacity_post updated_at
      let daysSinceUpdate = 30;
      try {
        const { rows: cp } = await pool.query(
          `SELECT MAX(updated_at) AS latest FROM capacity_posts WHERE supplier_id = $1`,
          [supplierId]
        );
        if (cp.length && cp[0].latest) {
          daysSinceUpdate = Math.max(0, (Date.now() - new Date(cp[0].latest).getTime()) / (1000 * 60 * 60 * 24));
        }
      } catch { /* table may not exist */ }

      // 4) Compute signals
      const signals = {
        fill_rate: computeFillRateSignal(d.requests_accepted, d.requests_received),
        sla_compliance: computeSlaComplianceSignal(d.sla_breaches, d.requests_received),
        role_expertise: computeRoleExpertiseSignal(roleDealCount, totalDealCount),
        timesheet_quality: d.timesheet_reliability_score != null ? Number(d.timesheet_reliability_score) : null,
        recency: computeRecencySignal(daysSinceUpdate),
        platform_activity: d.activity_score != null ? Number(d.activity_score) : null
      };

      // 5) Composite score + breakdown
      const result = computeSmartRankScore(signals);
      const classification = classifySmartRank(result.score);

      res.json({
        supplier_id: supplierId,
        role: role || "*",
        smart_rank_score: result.score,
        classification,
        classification_label: SMART_RANK_LABELS[classification] || classification,
        weights: SMART_RANK_WEIGHTS,
        signals,
        breakdown: result.breakdown
      });
    } catch (err) {
      logger.error({ err: err.message }, "GET /matching/smart-explain/:supplierId");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
