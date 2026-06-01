import { Router } from "express";
import { clampInt, safeQuery, safeScalar, toIsoOrNull } from "./_helpers.js";

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function createOccSupportRouter(deps) {
  const { pool, logger } = deps;
  const router = Router();

  router.get("/support/escalations", async (req, res) => {
    const page = clampInt(req.query.page, 1, 100000, 1);
    const perPage = clampInt(req.query.per_page, 1, 200, 50);
    const offset = (page - 1) * perPage;

    try {
      const items = await safeQuery(
        pool,
        `SELECT id, ticket_id, title, org_name, contact_email, severity, status, sla_state,
                owner_decision_required, created_at, sla_deadline, escalation_reason, affected_users
           FROM support_tickets
          WHERE escalated = TRUE
             OR severity IN ('high', 'critical')
          ORDER BY created_at DESC
          LIMIT $1 OFFSET $2`,
        [perPage, offset],
        []
      );
      const total = toInt(
        await safeScalar(
          pool,
          `SELECT COUNT(*)::int AS n
             FROM support_tickets
            WHERE escalated = TRUE
               OR severity IN ('high', 'critical')`,
          [],
          "n",
          0
        ),
        0
      );

      return res.json({
        success: true,
        data: {
          items: items.map((row) => ({
            id: row.id,
            ticket_id: row.ticket_id || null,
            title: row.title || null,
            org_name: row.org_name || null,
            contact_email: row.contact_email || null,
            severity: row.severity || "medium",
            status: row.status || "open",
            sla_state: row.sla_state || "ok",
            owner_decision_required: row.owner_decision_required === true,
            created_at: toIsoOrNull(row.created_at),
            sla_deadline: toIsoOrNull(row.sla_deadline),
            escalation_reason: row.escalation_reason || null,
            affected_users: row.affected_users ?? null
          })),
          total
        },
        error: null
      });
    } catch (err) {
      logger?.warn?.({ err }, "OCC support escalations fallback");
      return res.json({
        success: true,
        data: { items: [], total: 0 },
        error: null
      });
    }
  });

  router.get("/support/sla", async (_req, res) => {
    try {
      const items = await safeQuery(
        pool,
        `SELECT id, ticket_id, title, org_name, sla_deadline, status,
                ROUND(EXTRACT(EPOCH FROM (sla_deadline - NOW())) / 3600.0, 1) AS hours_remaining
           FROM support_tickets
          WHERE sla_deadline IS NOT NULL
            AND status NOT IN ('resolved', 'closed', 'cancelled')
          ORDER BY sla_deadline ASC`,
        [],
        []
      );

      return res.json({
        success: true,
        data: {
          items: items.map((row) => ({
            id: row.id,
            ticket_id: row.ticket_id || null,
            title: row.title || null,
            org_name: row.org_name || null,
            sla_deadline: toIsoOrNull(row.sla_deadline),
            hours_remaining: toNumber(row.hours_remaining, 0),
            status: row.status || "open"
          }))
        },
        error: null
      });
    } catch (err) {
      logger?.warn?.({ err }, "OCC support sla fallback");
      return res.json({
        success: true,
        data: { items: [] },
        error: null
      });
    }
  });

  router.get("/support/metrics", async (_req, res) => {
    try {
      const openEscalations = toInt(
        await safeScalar(
          pool,
          `SELECT COUNT(*)::int AS n
             FROM support_tickets
            WHERE (escalated = TRUE OR severity IN ('high', 'critical'))
              AND status NOT IN ('resolved', 'closed', 'cancelled')`,
          [],
          "n",
          0
        ),
        0
      );
      const slaAtRisk = toInt(
        await safeScalar(
          pool,
          `SELECT COUNT(*)::int AS n
             FROM support_tickets
            WHERE sla_state = 'at_risk'
              AND status NOT IN ('resolved', 'closed', 'cancelled')`,
          [],
          "n",
          0
        ),
        0
      );
      const slaBreached = toInt(
        await safeScalar(
          pool,
          `SELECT COUNT(*)::int AS n
             FROM support_tickets
            WHERE sla_state = 'breached'
              AND status NOT IN ('resolved', 'closed', 'cancelled')`,
          [],
          "n",
          0
        ),
        0
      );
      const avgResolutionH = toNumber(
        await safeScalar(
          pool,
          `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(resolved_at, closed_at) - created_at)) / 3600.0)::numeric, 1) AS v
             FROM support_tickets
            WHERE COALESCE(resolved_at, closed_at) IS NOT NULL`,
          [],
          "v",
          0
        ),
        0
      );
      const avgFirstResponseH = toNumber(
        await safeScalar(
          pool,
          `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 3600.0)::numeric, 1) AS v
             FROM support_tickets
            WHERE first_response_at IS NOT NULL`,
          [],
          "v",
          0
        ),
        0
      );
      const reopenRatePct = toNumber(
        await safeScalar(
          pool,
          `SELECT ROUND(
                    CASE WHEN COUNT(*) = 0 THEN 0
                         ELSE 100.0 * SUM(CASE WHEN reopened_count > 0 THEN 1 ELSE 0 END) / COUNT(*)
                    END::numeric, 1
                  ) AS v
             FROM support_tickets`,
          [],
          "v",
          0
        ),
        0
      );
      const ownerDecisionPending = toInt(
        await safeScalar(
          pool,
          `SELECT COUNT(*)::int AS n
             FROM support_tickets
            WHERE owner_decision_required = TRUE
              AND status NOT IN ('resolved', 'closed', 'cancelled')`,
          [],
          "n",
          0
        ),
        0
      );

      return res.json({
        success: true,
        data: {
          open_escalations: openEscalations,
          sla_at_risk: slaAtRisk,
          sla_breached: slaBreached,
          avg_resolution_h: avgResolutionH,
          avg_first_response_h: avgFirstResponseH,
          reopen_rate_pct: reopenRatePct,
          owner_decision_pending: ownerDecisionPending
        },
        error: null
      });
    } catch (err) {
      logger?.warn?.({ err }, "OCC support metrics fallback");
      return res.json({
        success: true,
        data: {
          open_escalations: 0,
          sla_at_risk: 0,
          sla_breached: 0,
          avg_resolution_h: 0,
          avg_first_response_h: 0,
          reopen_rate_pct: 0,
          owner_decision_pending: 0
        },
        error: null
      });
    }
  });

  return router;
}