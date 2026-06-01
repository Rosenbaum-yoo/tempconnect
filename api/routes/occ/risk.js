import { Router } from "express";
import { clampInt, safeQuery, safeScalar, toIsoOrNull } from "./_helpers.js";

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toHoursBetween(a, b) {
  if (!a || !b) return null;
  const diff = (new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60);
  if (!Number.isFinite(diff)) return null;
  return Math.round(diff * 10) / 10;
}

export function createOccRiskRouter(deps) {
  const { pool } = deps;
  const router = Router();

  router.get("/risk/signals", async (req, res) => {
    const page = clampInt(req.query.page, 1, 100000, 1);
    const perPage = clampInt(req.query.per_page, 1, 200, 50);
    const offset = (page - 1) * perPage;

    const rows = await safeQuery(
      pool,
      `SELECT id, area, level, title, message, entity_type, entity_id, source,
              recommended_action, drilldown_path, audit_id, decision_id, created_at, resolved_at
         FROM risk_signals
        WHERE resolved_at IS NULL
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2`,
      [perPage, offset],
      []
    );

    return res.json({
      success: true,
      data: {
        items: rows.map((row) => ({
          id: row.id,
          area: row.area || "general",
          level: row.level || "medium",
          title: row.title || "Risk signal",
          message: row.message || null,
          entity_type: row.entity_type || null,
          entity_id: row.entity_id || null,
          source: row.source || null,
          recommended_action: row.recommended_action || null,
          drilldown_path: row.drilldown_path || null,
          audit_id: row.audit_id != null ? String(row.audit_id) : null,
          decision_id: row.decision_id || null,
          created_at: toIsoOrNull(row.created_at),
          resolved_at: toIsoOrNull(row.resolved_at)
        }))
      },
      error: null
    });
  });

  router.get("/risk/drift", async (_req, res) => {
    const missingCommercialContext = toInt(
      await safeScalar(
        pool,
        `SELECT COUNT(*)::int AS n
           FROM occ_decisions
          WHERE type = 'custom_offer'
            AND commercial_context IS NULL`,
        [],
        "n",
        0
      ),
      0
    );

    const subscriptionStatusMismatch = toInt(
      await safeScalar(
        pool,
        `SELECT COUNT(*)::int AS n
           FROM commercial_offers co
          WHERE co.status IN ('approved', 'active')
            AND co.org_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
                FROM users u
                JOIN subscriptions s
                  ON s.user_id = u.id
                 AND s.status = 'active'
               WHERE u.org_id = co.org_id
            )`,
        [],
        "n",
        0
      ),
      0
    );

    const missingAuditAfterMutations = toInt(
      await safeScalar(
        pool,
        `SELECT COUNT(*)::int AS n
           FROM occ_decisions od
          WHERE od.updated_at >= NOW() - INTERVAL '24 hours'
            AND od.status IN ('approved','rejected','deferred','assigned','waiting_for_reply','closed')
            AND NOT EXISTS (
              SELECT 1
                FROM audit_log al
               WHERE al.action LIKE 'owner_control.decisions.%'
                 AND al.entity_type = 'occ_decision'
                 AND al.entity_id = od.id::text
                 AND al.created_at >= od.updated_at - INTERVAL '5 minutes'
            )`,
        [],
        "n",
        0
      ),
      0
    );

    const supportEscalationsWithoutOwner = toInt(
      await safeScalar(
        pool,
        `SELECT COUNT(*)::int AS n
           FROM support_tickets
          WHERE (escalated = TRUE OR severity IN ('high', 'critical'))
            AND assigned_to IS NULL
            AND status NOT IN ('resolved', 'closed', 'cancelled')`,
        [],
        "n",
        0
      ),
      0
    );

    const nowIso = new Date().toISOString();
    const items = [];
    if (missingCommercialContext > 0) {
      items.push({
        id: "check-1",
        type: "missing_commercial_context",
        severity: "medium",
        description: `${missingCommercialContext} Custom-Offer-Anfragen haben kein commercial_context Payload`,
        entity_type: "occ_decisions",
        entity_id: null,
        expected: "commercial_context NOT NULL",
        actual: `commercial_context IS NULL for ${missingCommercialContext} rows`,
        detected_at: nowIso
      });
    }
    if (subscriptionStatusMismatch > 0) {
      items.push({
        id: "check-2",
        type: "subscription_status_mismatch",
        severity: "high",
        description: `${subscriptionStatusMismatch} Commercial-Offers sind approved/active ohne aktive Subscription im Org-Kontext`,
        entity_type: "commercial_offers",
        entity_id: null,
        expected: "approved/active offer should align with at least one active subscription",
        actual: `no active subscription found for ${subscriptionStatusMismatch} offers`,
        detected_at: nowIso
      });
    }
    if (missingAuditAfterMutations > 0) {
      items.push({
        id: "check-3",
        type: "missing_audit_after_mutation",
        severity: "high",
        description: `${missingAuditAfterMutations} mutierende OCC-Entscheidungen der letzten 24h ohne Audit-Eintrag`,
        entity_type: "audit_log",
        entity_id: null,
        expected: "every mutation has owner_control.decisions.* audit entry",
        actual: `missing audit for ${missingAuditAfterMutations} mutations`,
        detected_at: nowIso
      });
    }
    if (supportEscalationsWithoutOwner > 0) {
      items.push({
        id: "check-4",
        type: "support_escalation_unassigned",
        severity: "medium",
        description: `${supportEscalationsWithoutOwner} Support-Eskalationen sind nicht zugewiesen`,
        entity_type: "support_tickets",
        entity_id: null,
        expected: "assigned_to NOT NULL for escalated/high tickets",
        actual: `assigned_to IS NULL for ${supportEscalationsWithoutOwner} rows`,
        detected_at: nowIso
      });
    }

    return res.json({
      success: true,
      data: { items },
      error: null
    });
  });

  router.get("/risk/compliance", async (_req, res) => {
    const lastOwnerAuditAt = await safeScalar(
      pool,
      `SELECT MAX(created_at) AS ts
         FROM audit_log
        WHERE action LIKE 'owner_control.%'`,
      [],
      "ts",
      null
    );
    const stalePendingDecisions = toInt(
      await safeScalar(
        pool,
        `SELECT COUNT(*)::int AS n
           FROM occ_decisions
          WHERE status = 'waiting_for_owner_decision'
            AND created_at < NOW() - INTERVAL '72 hours'`,
        [],
        "n",
        0
      ),
      0
    );
    const criticalSupportWithoutResponse = toInt(
      await safeScalar(
        pool,
        `SELECT COUNT(*)::int AS n
           FROM support_tickets
          WHERE severity = 'critical'
            AND status NOT IN ('resolved','closed','cancelled')
            AND first_response_at IS NULL
            AND created_at < NOW() - INTERVAL '6 hours'`,
        [],
        "n",
        0
      ),
      0
    );

    const items = [];
    if (!lastOwnerAuditAt || toHoursBetween(new Date().toISOString(), lastOwnerAuditAt) > 24 * 7) {
      items.push({
        id: "comp-1",
        area: "audit",
        severity: "medium",
        title: "Audit-Gap: Keine Owner-Aktionen in 7+ Tagen",
        description: "Seit 7 Tagen wurden keine owner_control.* Audit-Events geschrieben.",
        missing_check: "owner_control.decisions.*",
        last_verified: toIsoOrNull(lastOwnerAuditAt)
      });
    }
    if (stalePendingDecisions > 0) {
      items.push({
        id: "comp-2",
        area: "decisions",
        severity: "high",
        title: "Stau bei Owner-Entscheidungen",
        description: `${stalePendingDecisions} Requests warten länger als 72h auf eine Owner-Entscheidung.`,
        missing_check: "decision_sla_72h",
        last_verified: new Date().toISOString()
      });
    }
    if (criticalSupportWithoutResponse > 0) {
      items.push({
        id: "comp-3",
        area: "support",
        severity: "high",
        title: "Kritische Support-Tickets ohne Erstreaktion",
        description: `${criticalSupportWithoutResponse} kritische Tickets ohne first_response_at nach >6h.`,
        missing_check: "support_first_response_critical",
        last_verified: new Date().toISOString()
      });
    }

    return res.json({
      success: true,
      data: { items },
      error: null
    });
  });

  return router;
}
