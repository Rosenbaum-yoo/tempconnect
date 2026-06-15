import { Router } from "express";
import { writeAudit } from "../../services/auditLog.js";
import { clampInt, parseBool, parseCsv, safeQuery, safeScalar, toIsoOrNull } from "./_helpers.js";
import { requireMfa } from "../../middleware/requireMfa.js";

const MIN_REASON_LENGTH = 10;

const VALID_TYPES = new Set([
  "custom_offer",
  "commercial",
  "feature_request",
  "access_approval",
  "operational",
  "partner_enterprise",
  "support_escalation"
]);

const VALID_STATUSES = new Set([
  "new",
  "triaged",
  "waiting_for_owner_decision",
  "approved",
  "rejected",
  "deferred",
  "waiting_for_reply",
  "assigned",
  "closed",
  "cancelled"
]);

const OPEN_DEFAULT_STATUSES = [ "new", "triaged", "waiting_for_owner_decision" ];
const VALID_PRIORITIES = new Set([ "urgent", "high", "normal", "low" ]);
const VALID_RISK_LEVELS = new Set([ "critical", "high", "medium", "low" ]);
const VALID_ACTIONS = new Set([ "approve", "reject", "defer", "request_reply", "assign", "triage", "close" ]);

function parseIntOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeContext(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "object" && parsed && !Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapDecision(row, pendingOwnerDecisions) {
  return {
    id: row.id,
    type: row.type || null,
    subtype: row.subtype || null,
    status: row.status || null,
    priority: row.priority || "normal",
    source: row.source || "platform",
    organization_id: row.organization_id || row.org_id || null,
    org_name: row.org_name || null,
    user_id: row.user_id || null,
    contact_name: row.contact_name || null,
    contact_email: row.contact_email || null,
    title: row.title || null,
    summary: row.summary || null,
    details: row.details || null,
    requested_action: row.requested_action || null,
    owner_review_required: row.owner_review_required === true,
    owner_decision_required: row.owner_decision_required === true,
    assigned_to: row.assigned_to || null,
    created_at: toIsoOrNull(row.created_at),
    updated_at: toIsoOrNull(row.updated_at),
    resolved_at: toIsoOrNull(row.resolved_at),
    sla_deadline: toIsoOrNull(row.sla_deadline),
    decision_outcome: row.decision_outcome || null,
    decision_reason: row.decision_reason || null,
    decided_by: row.decided_by || null,
    decided_at: toIsoOrNull(row.decided_at),
    risk_level: row.risk_level || "medium",
    sla_state: row.sla_state || "ok",
    tags: Array.isArray(row.tags) ? row.tags : [],
    commercial_context: normalizeContext(row.commercial_context),
    feature_context: normalizeContext(row.feature_context),
    approval_context: normalizeContext(row.approval_context),
    operational_context: normalizeContext(row.operational_context),
    support_context: normalizeContext(row.support_context),
    related_entities: normalizeArray(row.related_entities),
    pending_owner_decisions: pendingOwnerDecisions
  };
}

function normalizeStatusFilter(statusQuery, logMode) {
  const statuses = parseCsv(statusQuery)
    .map((status) => status.toLowerCase())
    .filter((status) => VALID_STATUSES.has(status));
  if (statuses.length > 0) return statuses;
  if (logMode) return [];
  return OPEN_DEFAULT_STATUSES;
}

function normalizeListFilter(value, validSet) {
  return parseCsv(value)
    .map((item) => item.toLowerCase())
    .filter((item) => validSet.has(item));
}

function validateMutation(body = {}, { allowAction = true } = {}) {
  const requestId = String(body.request_id || body.decision_id || "").trim();
  const reason = String(body.reason || "").trim();
  const confirmed = body.confirmed === true;
  const action = allowAction ? String(body.action || "").trim().toLowerCase() : null;

  if (!requestId) return { ok: false, code: "REQUEST_ID_REQUIRED", message: "request_id ist erforderlich." };
  if (allowAction && !VALID_ACTIONS.has(action)) {
    return { ok: false, code: "INVALID_ACTION", message: "action muss einer der unterstützten OCC-Actions sein." };
  }
  if (!confirmed) return { ok: false, code: "CONFIRM_REQUIRED", message: "confirmed muss true sein." };
  if (reason.length < MIN_REASON_LENGTH) {
    return { ok: false, code: "REASON_TOO_SHORT", message: "reason muss mindestens 10 Zeichen haben." };
  }
  return { ok: true, requestId, reason, action };
}

function actionToStatus(action) {
  switch (action) {
    case "approve": return { status: "approved", outcome: "approved", resolveNow: true };
    case "reject": return { status: "rejected", outcome: "rejected", resolveNow: true };
    case "defer": return { status: "deferred", outcome: "deferred", resolveNow: false };
    case "request_reply": return { status: "waiting_for_reply", outcome: "waiting_for_reply", resolveNow: false };
    case "assign": return { status: "assigned", outcome: "assigned", resolveNow: false };
    case "triage": return { status: "triaged", outcome: "triaged", resolveNow: false };
    case "close": return { status: "closed", outcome: "closed", resolveNow: true };
    default: return { status: "triaged", outcome: "triaged", resolveNow: false };
  }
}

function auditActionByMutation(action) {
  const map = {
    approve: "owner_control.decisions.approved",
    reject: "owner_control.decisions.rejected",
    defer: "owner_control.decisions.deferred",
    request_reply: "owner_control.decisions.reply_requested",
    assign: "owner_control.decisions.assigned",
    triage: "owner_control.decisions.triaged",
    close: "owner_control.decisions.closed"
  };
  return map[action] || "owner_control.decisions.updated";
}

async function upsertCommercialOffer(pool, decision, actorId) {
  const ctx = normalizeContext(decision.commercial_context, {}) || {};
  await pool.query(
    `INSERT INTO commercial_offers (
       occ_decision_id, org_id, org_name, title, status,
       requested_users, requested_price_eur, current_price_eur,
       contract_duration_months, billing_cycle, special_conditions,
       revenue_impact_eur, source, approved_by, approved_at, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'occ',$13,NOW(),NOW())
     ON CONFLICT (occ_decision_id) DO UPDATE SET
       org_id = EXCLUDED.org_id,
       org_name = EXCLUDED.org_name,
       title = EXCLUDED.title,
       status = EXCLUDED.status,
       requested_users = EXCLUDED.requested_users,
       requested_price_eur = EXCLUDED.requested_price_eur,
       current_price_eur = EXCLUDED.current_price_eur,
       contract_duration_months = EXCLUDED.contract_duration_months,
       billing_cycle = EXCLUDED.billing_cycle,
       special_conditions = EXCLUDED.special_conditions,
       revenue_impact_eur = EXCLUDED.revenue_impact_eur,
       approved_by = EXCLUDED.approved_by,
       approved_at = NOW(),
       updated_at = NOW()`,
    [
      decision.id,
      decision.org_id || decision.organization_id || null,
      decision.org_name || null,
      decision.title || null,
      "approved",
      parseIntOrNull(ctx.requested_users),
      parseIntOrNull(ctx.requested_price_eur),
      parseIntOrNull(ctx.current_price_eur),
      parseIntOrNull(ctx.contract_duration_months),
      ctx.billing_cycle || null,
      ctx.special_conditions || null,
      parseIntOrNull(ctx.revenue_impact_eur),
      actorId || null
    ]
  );
}

export function createOccDecisionsRouter(deps) {
  const { pool, logger } = deps;
  const router = Router();
  const mfaGuard = requireMfa({ pool }); // MFA env-gesteuert (O-05): Default Audit-Only, scharf via MFA_ENFORCE

  router.get("/decisions-requests", async (req, res) => {
    const page = clampInt(req.query.page, 1, 100000, 1);
    const perPage = clampInt(req.query.per_page, 1, 200, 30);
    const offset = (page - 1) * perPage;
    const logMode = parseBool(req.query.log, false);

    const types = normalizeListFilter(req.query.type, VALID_TYPES);
    const statuses = normalizeStatusFilter(req.query.status, logMode);
    const priorities = normalizeListFilter(req.query.priority, VALID_PRIORITIES);
    const riskLevels = normalizeListFilter(req.query.risk_level, VALID_RISK_LEVELS);
    const search = String(req.query.search || "").trim();

    const where = [];
    const params = [];
    if (types.length > 0) {
      params.push(types);
      where.push(`od.type = ANY($${params.length}::text[])`);
    }
    if (statuses.length > 0) {
      params.push(statuses);
      where.push(`od.status = ANY($${params.length}::text[])`);
    }
    if (priorities.length > 0) {
      params.push(priorities);
      where.push(`od.priority = ANY($${params.length}::text[])`);
    }
    if (riskLevels.length > 0) {
      params.push(riskLevels);
      where.push(`od.risk_level = ANY($${params.length}::text[])`);
    }
    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      where.push(
        `(od.title ILIKE $${idx} OR od.summary ILIKE $${idx} OR od.description ILIKE $${idx} OR od.org_name ILIKE $${idx} OR od.contact_email ILIKE $${idx} OR od.requested_action ILIKE $${idx})`
      );
    }
    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const total = Number(await safeScalar(pool, `SELECT COUNT(*)::int AS n FROM occ_decisions od ${whereClause}`, params, "n", 0) || 0);
    const pendingOwnerDecisions = Number(
      await safeScalar(
        pool,
        `SELECT COUNT(*)::int AS n
           FROM occ_decisions
          WHERE status = 'waiting_for_owner_decision'`,
        [],
        "n",
        0
      ) || 0
    );

    const queryParams = params.concat([perPage + 1, offset]);
    const rows = await safeQuery(
      pool,
      `SELECT od.id, od.type, od.subtype, od.status, od.priority, od.source,
              od.org_id AS organization_id, od.org_name, od.user_id, od.contact_name, od.contact_email,
              od.title, od.summary, od.details, od.requested_action,
              od.owner_review_required, od.owner_decision_required, od.assigned_to,
              od.created_at, od.updated_at, od.resolved_at, od.sla_deadline,
              od.decision_outcome, od.decision_reason, od.decided_by, od.decided_at,
              od.risk_level, od.sla_state, od.tags, od.commercial_context,
              od.feature_context, od.approval_context, od.operational_context,
              od.support_context, od.related_entities
         FROM occ_decisions od
         ${whereClause}
        ORDER BY od.created_at DESC
        LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
      queryParams,
      []
    );

    const hasMore = rows.length > perPage;
    const pageRows = hasMore ? rows.slice(0, perPage) : rows;

    return res.json({
      success: true,
      data: {
        items: pageRows.map((row) => mapDecision(row, pendingOwnerDecisions)),
        total,
        page,
        per_page: perPage,
        has_more: hasMore,
        pending_owner_decisions: pendingOwnerDecisions
      },
      error: null
    });
  });

  router.post("/decisions-requests/decide", mfaGuard, async (req, res) => {
    const validation = validateMutation(req.body || {}, { allowAction: true });
    if (!validation.ok) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: validation.code, message: validation.message }
      });
    }

    const riskLevelRaw = String(req.body?.risk_level || "").toLowerCase().trim();
    const nextRiskLevel = riskLevelRaw && VALID_RISK_LEVELS.has(riskLevelRaw) ? riskLevelRaw : null;
    const statusPatch = actionToStatus(validation.action);
    const assignedTo = validation.action === "assign" ? String(req.body?.assigned_to || "").trim() : null;
    if (validation.action === "assign" && !assignedTo) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "ASSIGNED_TO_REQUIRED", message: "assigned_to ist für action=assign erforderlich." }
      });
    }

    try {
      const { rows, rowCount } = await pool.query(
        `UPDATE occ_decisions
            SET status = $2,
                decision_outcome = $3,
                decision_reason = $4,
                decided_by = $5,
                decided_at = NOW(),
                resolved_at = CASE WHEN $6::boolean THEN NOW() ELSE resolved_at END,
                assigned_to = CASE WHEN $7::boolean THEN $8::uuid ELSE assigned_to END,
                risk_level = COALESCE($9, risk_level),
                updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [
          validation.requestId,
          statusPatch.status,
          statusPatch.outcome,
          validation.reason,
          req.occAccess?.user_id || null,
          statusPatch.resolveNow,
          validation.action === "assign",
          assignedTo || null,
          nextRiskLevel
        ]
      );

      if (rowCount === 0) {
        return res.status(404).json({
          success: false,
          data: null,
          error: { code: "REQUEST_NOT_FOUND", message: "Request nicht gefunden." }
        });
      }

      const updated = rows[0];
      if (validation.action === "approve" && updated.type === "custom_offer") {
        await upsertCommercialOffer(pool, updated, req.occAccess?.user_id || null);
      }

      await writeAudit(pool, {
        action: auditActionByMutation(validation.action),
        actor_id: req.occAccess?.user_id || null,
        entity_type: "occ_decision",
        entity_id: updated.id,
        status: "SUCCESS",
        details: {
          area: "decisions",
          request_id: updated.id,
          action: validation.action,
          reason: validation.reason,
          confirmed: true,
          risk_level: updated.risk_level || "medium",
          commercial_context: updated.commercial_context || null
        }
      }).catch(() => null);

      return res.json({
        success: true,
        data: {
          request: mapDecision(updated, 0),
          decision: mapDecision(updated, 0)
        },
        error: null
      });
    } catch (err) {
      logger?.error?.({ err, requestId: validation.requestId, action: validation.action }, "OCC decisions mutate failed");
      return res.status(500).json({
        success: false,
        data: null,
        error: { code: "SERVER_ERROR", message: "Request konnte nicht verarbeitet werden." }
      });
    }
  });

  router.post("/decisions-requests/triage", mfaGuard, async (req, res) => {
    const validation = validateMutation(req.body || {}, { allowAction: false });
    if (!validation.ok) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: validation.code, message: validation.message }
      });
    }

    const status = String(req.body?.status || "triaged").trim().toLowerCase();
    if (status !== "triaged") {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "INVALID_STATUS", message: "status muss triaged sein." }
      });
    }

    try {
      const { rows, rowCount } = await pool.query(
        `UPDATE occ_decisions
            SET status = 'triaged',
                decision_outcome = 'triaged',
                decision_reason = $2,
                decided_by = $3,
                decided_at = NOW(),
                updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [validation.requestId, validation.reason, req.occAccess?.user_id || null]
      );

      if (rowCount === 0) {
        return res.status(404).json({
          success: false,
          data: null,
          error: { code: "REQUEST_NOT_FOUND", message: "Request nicht gefunden." }
        });
      }

      const updated = rows[0];
      await writeAudit(pool, {
        action: "owner_control.decisions.triaged",
        actor_id: req.occAccess?.user_id || null,
        entity_type: "occ_decision",
        entity_id: updated.id,
        status: "SUCCESS",
        details: {
          area: "decisions",
          request_id: updated.id,
          reason: validation.reason,
          confirmed: true,
          risk_level: updated.risk_level || "medium"
        }
      }).catch(() => null);

      return res.json({
        success: true,
        data: { request: mapDecision(updated, 0) },
        error: null
      });
    } catch (err) {
      logger?.error?.({ err, requestId: validation.requestId }, "OCC decisions triage failed");
      return res.status(500).json({
        success: false,
        data: null,
        error: { code: "SERVER_ERROR", message: "Triage konnte nicht verarbeitet werden." }
      });
    }
  });

  return router;
}