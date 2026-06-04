import { Router } from "express";
import * as internalControlCenterService from "../services/internalControlCenterService.js";
import {
  requireSupportAccess,
  requireSupportFeature,
  maskSupportEmail,
  maskSupportId,
  maskSupportName,
  supportFeatures
} from "../middleware/supportAccess.js";

const CASE_STATUSES = new Set([
  "new",
  "open",
  "in_progress",
  "waiting_customer",
  "waiting_internal",
  "escalated",
  "escalated_decisions",
  "escalated_commercial",
  "escalated_ops",
  "resolved",
  "closed",
  "reopened"
]);

const CASE_PRIORITIES = new Set([ "low", "normal", "high", "urgent", "critical" ]);
const CASE_TYPES = new Set([
  "general",
  "verification",
  "invite",
  "onboarding",
  "login_access",
  "billing",
  "feature_question",
  "bug_report",
  "complaint",
  "other"
]);

const ESCALATION_TARGETS = new Set([ "decisions_requests", "commercial", "ops", "owner" ]);
const ESCALATION_STATUSES = new Set([ "pending", "acknowledged", "resolved", "rejected" ]);
const NOTE_TYPES = new Set([ "internal", "external", "system" ]);
const ACTIONS = new Set([
  "accept",
  "assign",
  "change_status",
  "change_priority",
  "add_note",
  "escalate",
  "resend_verification",
  "resend_invite",
  "close"
]);

const RESOLVED_STATUSES = new Set([ "resolved", "closed" ]);
const INTERNAL_SUPPORT_ROLES = new Set([ "internal_support_agent", "internal_support_lead" ]);
const SUPERVISOR_ROLES = new Set([ "internal_support_lead", "external_support_supervisor" ]);

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(value, min, max, fallback = min) {
  const n = toInt(value, fallback);
  return Math.max(min, Math.min(max, n));
}

function toIso(value) {
  if (!value) return null;
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}

function shiftPlaceholders(sql, offset) {
  return String(sql || "").replace(/\$(\d+)/g, (_match, n) => `$${Number(n) + offset}`);
}

function parseCsv(value) {
  if (value == null || value === "") return [];
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseBool(value) {
  if (typeof value === "boolean") return value;
  if (value == null) return false;
  const normalized = String(value).trim().toLowerCase();
  return [ "1", "true", "yes", "on", "y", "me" ].includes(normalized);
}

function round1(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

function nullableText(value) {
  const raw = String(value || "").trim();
  return raw.length > 0 ? raw : null;
}

function normalizeStatusList(value) {
  return parseCsv(value)
    .map((status) => status.toLowerCase())
    .filter((status) => CASE_STATUSES.has(status));
}

function normalizePriorityList(value) {
  return parseCsv(value)
    .map((priority) => priority.toLowerCase())
    .filter((priority) => CASE_PRIORITIES.has(priority));
}

function normalizeEscalationStatusList(value) {
  return parseCsv(value)
    .map((status) => status.toLowerCase())
    .filter((status) => ESCALATION_STATUSES.has(status));
}

function normalizeCaseType(value) {
  const c = String(value || "").trim().toLowerCase();
  return CASE_TYPES.has(c) ? c : null;
}

function mapPriorityToRisk(priority) {
  switch (priority) {
    case "critical": return "critical";
    case "urgent":
    case "high": return "high";
    case "normal": return "medium";
    default: return "low";
  }
}

function mapEscalationTargetToCaseStatus(target) {
  if (target === "decisions_requests") return "escalated_decisions";
  if (target === "commercial") return "escalated_commercial";
  if (target === "ops") return "escalated_ops";
  return "escalated";
}

function isResolvedStatus(status) {
  return RESOLVED_STATUSES.has(String(status || "").toLowerCase());
}

function buildScope(agent, alias, params, where) {
  const queueIds = Array.isArray(agent.allowed_queues) ? agent.allowed_queues : [];
  const caseTypes = Array.isArray(agent.allowed_case_types) ? agent.allowed_case_types : [];

  if (queueIds.length > 0) {
    params.push(queueIds);
    where.push(`${alias}.queue_id::text = ANY($${params.length}::text[])`);
  }

  if (caseTypes.length > 0) {
    params.push(caseTypes);
    where.push(`${alias}.case_type = ANY($${params.length}::text[])`);
  }

  if (agent.data_scope === "assigned_only") {
    params.push(agent.id);
    where.push(`${alias}.assigned_to_agent_id = $${params.length}::uuid`);
    return;
  }

  if (agent.data_scope === "vendor_scoped") {
    if (!agent.vendor_id) {
      where.push("1 = 0");
      return;
    }
    params.push(agent.vendor_id);
    where.push(
      `${alias}.assigned_to_agent_id IN (
         SELECT sa_scope.id
           FROM support_agents sa_scope
          WHERE sa_scope.vendor_id = $${params.length}::uuid
            AND sa_scope.is_active = TRUE
       )`
    );
  }
}

function roleAllowsAction(role, action) {
  if (role === "support_auditor") return false;
  if (action === "assign" || action === "change_priority" || action === "escalate" || action === "close") {
    return SUPERVISOR_ROLES.has(role);
  }
  return true;
}

function computeAllowedActions(caseRow, req) {
  const actions = Array.isArray(req.supportAllowedActions) ? req.supportAllowedActions : [];
  const allowed = [];
  for (const action of actions) {
    if (!ACTIONS.has(action)) continue;
    if (!roleAllowsAction(req.supportAgent.role, action)) continue;
    if (isResolvedStatus(caseRow.status) && [ "accept", "assign", "change_status", "change_priority", "escalate", "close" ].includes(action)) {
      continue;
    }
    if (action === "accept" && caseRow.assigned_to_agent_id) continue;
    if (action === "close" && caseRow.status === "closed") continue;
    if (action === "escalate" && caseRow.is_escalated) continue;
    allowed.push(action);
  }
  return allowed;
}

function formatTimelineDetail(value) {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if (value.message) return String(value.message);
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  return String(value);
}

function caseSummaryFromRow(row, req) {
  const role = req.supportAgent.role;
  const reporterEmailMasked = maskSupportEmail(row.reporter_email, role);
  const reporterNameMasked = maskSupportName(row.reporter_name, role);
  return {
    id: row.id,
    case_number: row.case_number,
    subject: row.subject,
    status: row.status,
    priority: row.priority,
    case_type: row.case_type,
    sla_state: row.sla_state || "ok",
    sla_deadline: toIso(row.sla_resolution_deadline),
    sla_hours_remaining: round1(row.sla_hours_remaining),
    assigned_to_id: row.assigned_to_agent_id || null,
    assigned_to_name: row.assigned_to_name || null,
    queue_id: row.queue_id || null,
    queue_name: row.queue_name || null,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    org_name: row.org_name || null,
    contact_masked: reporterEmailMasked || reporterNameMasked || "—",
    is_escalated: row.is_escalated === true,
    escalation_target: row.escalation_target || null
  };
}

function userContextFromRow(row, req) {
  const role = req.supportAgent.role;
  const accountStatus = row.reporter_is_verified === true ? "active" : "pending_verification";
  return {
    user_id_masked: maskSupportId(row.reporter_user_id, role, "usr") || "usr-unknown",
    email_masked: maskSupportEmail(row.reporter_email, role) || "@unknown",
    display_name_masked: maskSupportName(row.reporter_name, role),
    account_status: accountStatus,
    org_count: toInt(row.reporter_org_count, 0),
    created_at: toIso(row.reporter_created_at) || toIso(row.created_at) || "1970-01-01T00:00:00.000Z",
    verification_state: row.reporter_is_verified === true ? "verified" : "unverified",
    last_login_masked: null
  };
}

function orgContextFromRow(row, req) {
  const role = req.supportAgent.role;
  return {
    org_id_masked: maskSupportId(row.reporter_org_id, role, "org") || "org-unknown",
    org_name: row.org_name || "—",
    plan: row.org_plan || null,
    status: row.org_is_active === false ? "inactive" : "active",
    member_count: toInt(row.org_member_count, 0),
    created_at: toIso(row.org_created_at) || toIso(row.created_at) || "1970-01-01T00:00:00.000Z"
  };
}

function caseDetailFromRow(row, req, notes, timeline) {
  const summary = caseSummaryFromRow(row, req);
  return {
    ...summary,
    description: row.description || null,
    user_context: row.reporter_user_id ? userContextFromRow(row, req) : null,
    org_context: row.reporter_org_id ? orgContextFromRow(row, req) : null,
    notes,
    timeline,
    allowed_actions: computeAllowedActions(row, req)
  };
}

function maskOrgIdBySearch(id, role) {
  return maskSupportId(id, role, "org");
}

function maskUserIdBySearch(id, role) {
  return maskSupportId(id, role, "usr");
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
}

async function resolveMaskedUserId(pool, masked) {
  const raw = String(masked || "").trim();
  if (!raw) return null;
  if (isUuid(raw)) return raw;

  const shortMatch = raw.match(/^usr-([0-9a-f]{8})\.\.\.([0-9a-f]{4})$/i);
  if (shortMatch) {
    const { rows } = await pool.query(
      `SELECT id
         FROM users
        WHERE id::text ILIKE $1
          AND id::text ILIKE $2
        LIMIT 2`,
      [`${shortMatch[1]}%`, `%${shortMatch[2]}`]
    );
    return rows.length === 1 ? rows[0].id : null;
  }

  const hashMatch = raw.match(/^usr-h-([0-9a-f]{12})$/i);
  if (hashMatch) {
    const { rows } = await pool.query(
      `SELECT id
         FROM users
        WHERE SUBSTRING(MD5(id::text), 1, 12) = $1
        LIMIT 2`,
      [hashMatch[1].toLowerCase()]
    );
    return rows.length === 1 ? rows[0].id : null;
  }

  return null;
}

function createCaseBaseSelect() {
  return `
    SELECT sc.id, sc.case_number, sc.subject, sc.description, sc.status, sc.priority, sc.case_type,
           sc.queue_id, q.name AS queue_name,
           sc.assigned_to_agent_id,
           COALESCE(NULLIF(assignee_u.contact_person, ''), NULLIF(assignee_u.company_name, ''), assignee_u.email) AS assigned_to_name,
           sc.reporter_user_id, reporter.email AS reporter_email, reporter.contact_person AS reporter_name,
           reporter.phone AS reporter_phone, reporter.created_at AS reporter_created_at, reporter.is_verified AS reporter_is_verified,
           sc.reporter_org_id, org.name AS org_name, org.plan AS org_plan, org.is_active AS org_is_active, org.created_at AS org_created_at,
           COALESCE(org_members.member_count, 0)::int AS org_member_count,
           COALESCE(reporter_orgs.org_count, 0)::int AS reporter_org_count,
           sc.is_escalated, sc.escalation_target, sc.related_occ_request_id,
           sc.sla_first_response_deadline, sc.sla_resolution_deadline, sc.sla_first_responded_at, sc.sla_resolved_at,
           sc.created_at, sc.updated_at, sc.closed_at,
           CASE
             WHEN sc.status IN ('resolved', 'closed') THEN 'ok'
             WHEN sc.sla_resolution_deadline IS NULL THEN 'ok'
             WHEN sc.sla_resolution_deadline < NOW() THEN 'breached'
             WHEN sc.sla_resolution_deadline < NOW() + INTERVAL '4 hours' THEN 'at_risk'
             ELSE 'ok'
           END AS sla_state,
           ROUND(EXTRACT(EPOCH FROM (sc.sla_resolution_deadline - NOW())) / 3600.0, 1) AS sla_hours_remaining
      FROM support_cases sc
      LEFT JOIN support_queues q ON q.id = sc.queue_id
      LEFT JOIN support_agents assignee_sa ON assignee_sa.id = sc.assigned_to_agent_id
      LEFT JOIN users assignee_u ON assignee_u.id = assignee_sa.user_id
      LEFT JOIN users reporter ON reporter.id = sc.reporter_user_id
      LEFT JOIN organizations org ON org.id = sc.reporter_org_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS member_count
          FROM org_memberships om
         WHERE om.org_id = sc.reporter_org_id
           AND om.is_active = TRUE
      ) org_members ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS org_count
          FROM org_memberships om
         WHERE om.user_id = sc.reporter_user_id
           AND om.is_active = TRUE
      ) reporter_orgs ON TRUE`;
}

// Laedt die juengsten offenen Faelle (max 10 je Org) fuer MEHRERE Orgs in EINER Query.
// Ersetzt eine fruehere N+1-Read-Schleife im Org-Lookup (eine SELECT je Org → bei
// per_page=100 bis zu 100 sequentielle Round-Trips pro Request). Ein ROW_NUMBER()-
// Fenster partitioniert nach reporter_org_id und behaelt je Org die 10 nach
// updated_at juengsten Faelle (id DESC nur als deterministischer Tie-Breaker).
// Rueckgabe: Map<org_id, rawRow[]> (je Liste bereits juengste-zuerst). Masking/Shaping
// bleibt beim Aufrufer, da caseSummaryFromRow die Rolle aus req braucht.
export async function loadRecentOpenCasesByOrg(pool, orgIds, agent) {
  const ids = Array.isArray(orgIds) ? orgIds.filter(Boolean) : [];
  const byOrg = new Map();
  if (ids.length === 0) return byOrg;

  const params = [ ids ];
  const where = [ "sc.reporter_org_id = ANY($1::uuid[])" ];
  buildScope(agent, "sc", params, where);
  where.push("sc.status NOT IN ('resolved', 'closed')");

  const { rows } = await pool.query(
    `SELECT ranked.* FROM (
       SELECT base.*,
              ROW_NUMBER() OVER (
                PARTITION BY base.reporter_org_id
                ORDER BY base.updated_at DESC, base.id DESC
              ) AS rn
         FROM (
           ${createCaseBaseSelect()}
           WHERE ${where.join(" AND ")}
         ) base
     ) ranked
     WHERE ranked.rn <= 10
     ORDER BY ranked.reporter_org_id, ranked.rn`,
    params
  );

  for (const row of rows || []) {
    const list = byOrg.get(row.reporter_org_id);
    if (list) list.push(row);
    else byOrg.set(row.reporter_org_id, [ row ]);
  }
  return byOrg;
}

async function loadCaseRow(db, caseId, agent) {
  const params = [caseId];
  const where = [ "sc.id = $1::uuid" ];
  buildScope(agent, "sc", params, where);
  const { rows } = await db.query(
    `${createCaseBaseSelect()}
      WHERE ${where.join(" AND ")}
      LIMIT 1`,
    params
  );
  return rows[0] || null;
}

async function loadCaseNotes(db, caseId, req) {
  const params = [caseId];
  const where = [ "n.case_id = $1::uuid" ];
  if (!INTERNAL_SUPPORT_ROLES.has(req.supportAgent.role)) {
    where.push("n.note_type <> 'internal'");
  }
  const { rows } = await db.query(
    `SELECT n.id, n.case_id, n.note_type, n.body, n.created_at,
            COALESCE(NULLIF(author_u.contact_person, ''), NULLIF(author_u.company_name, ''), author_u.email, 'System') AS author_name
       FROM support_case_notes n
       LEFT JOIN support_agents author_sa ON author_sa.id = n.author_agent_id
       LEFT JOIN users author_u ON author_u.id = author_sa.user_id
      WHERE ${where.join(" AND ")}
      ORDER BY n.created_at ASC`,
    params
  );
  return rows.map((row) => ({
    id: row.id,
    case_id: row.case_id,
    author_name: row.author_name,
    note_type: row.note_type,
    body: row.body,
    created_at: toIso(row.created_at)
  }));
}

async function loadCaseTimeline(db, caseId) {
  const { rows } = await db.query(
    `SELECT e.id, e.case_id, e.event, e.detail, e.created_at,
            COALESCE(NULLIF(actor_u.contact_person, ''), NULLIF(actor_u.company_name, ''), actor_u.email, 'System') AS actor_name
       FROM support_case_events e
       LEFT JOIN support_agents actor_sa ON actor_sa.id = e.actor_agent_id
       LEFT JOIN users actor_u ON actor_u.id = actor_sa.user_id
      WHERE e.case_id = $1::uuid
      ORDER BY e.created_at ASC`,
    [caseId]
  );
  return rows.map((row) => ({
    id: row.id,
    case_id: row.case_id,
    event: row.event,
    actor: row.actor_name,
    detail: formatTimelineDetail(row.detail),
    created_at: toIso(row.created_at)
  }));
}

async function insertCaseEvent(db, caseId, actorAgentId, event, detail = {}) {
  await db.query(
    `INSERT INTO support_case_events (case_id, actor_agent_id, event, detail)
     VALUES ($1::uuid, $2::uuid, $3, $4::jsonb)`,
    [caseId, actorAgentId || null, event, JSON.stringify(detail || {})]
  );
}

async function insertSupportAudit(db, payload) {
  await db.query(
    `INSERT INTO support_audit_log (agent_id, case_id, action, reason, before_state, after_state, ip_address)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6::jsonb, NULLIF($7, '')::inet)`,
    [
      payload.agent_id || null,
      payload.case_id || null,
      payload.action,
      payload.reason || null,
      payload.before_state ? JSON.stringify(payload.before_state) : null,
      payload.after_state ? JSON.stringify(payload.after_state) : null,
      String(payload.ip_address || "")
    ]
  );
}

async function createOccEscalation(db, payload) {
  const riskLevel = mapPriorityToRisk(payload.priority);
  const status = "waiting_for_owner_decision";
  const { rows } = await db.query(
    `INSERT INTO occ_decisions (
       type, subtype, title, summary, details, status, priority, risk_level, source,
       user_id, contact_name, contact_email, org_id, org_name,
       requested_action, owner_review_required, owner_decision_required,
       support_context, related_entities, created_at, updated_at
     ) VALUES (
       'support_escalation', $1, $2, $3, $4, $5, $6, $7, 'support_ops',
       $8::uuid, $9, $10, $11::uuid, $12,
       'review_support_escalation', TRUE, TRUE,
       $13::jsonb, $14::jsonb, NOW(), NOW()
     )
     RETURNING id`,
    [
      payload.target,
      payload.title,
      payload.summary,
      payload.details,
      status,
      payload.priority,
      riskLevel,
      payload.reporter_user_id || null,
      payload.contact_name || null,
      payload.contact_email || null,
      payload.reporter_org_id || null,
      payload.org_name || null,
      JSON.stringify(payload.support_context || {}),
      JSON.stringify(payload.related_entities || [])
    ]
  );
  return rows[0]?.id || null;
}

async function createOpsSignal(db, escalation) {
  await db.query(
    `INSERT INTO risk_signals (
       area, level, title, message, entity_type, entity_id, source,
       recommended_action, drilldown_path, decision_id, created_at
     )
     VALUES (
       'operations', $1, $2, $3, 'support_case', $4,
       'support_escalation', 'ops_triage', '/owner-control/operations', $5::uuid, NOW()
     )`,
    [
      mapPriorityToRisk(escalation.priority),
      `Support escalation ${escalation.case_number}`,
      escalation.reason,
      escalation.case_id,
      escalation.related_occ_request_id || null
    ]
  );
}

async function loadPaginatedCases(pool, req) {
  const page = clampInt(req.query.page, 1, 100000, 1);
  const perPage = clampInt(req.query.per_page, 1, 100, 25);
  const offset = (page - 1) * perPage;

  const statuses = normalizeStatusList(req.query.status);
  const priorities = normalizePriorityList(req.query.priority);
  const caseType = normalizeCaseType(req.query.case_type || req.query.type);
  const queueId = nullableText(req.query.queue_id);
  const search = nullableText(req.query.search);
  const assignedToMe = parseBool(req.query.assigned_to_me);
  const slaAtRisk = parseBool(req.query.sla_at_risk);
  const isEscalated = parseBool(req.query.is_escalated);

  const params = [];
  const where = [];
  buildScope(req.supportAgent, "sc", params, where);

  if (statuses.length > 0) {
    params.push(statuses);
    where.push(`sc.status = ANY($${params.length}::text[])`);
  }
  if (priorities.length > 0) {
    params.push(priorities);
    where.push(`sc.priority = ANY($${params.length}::text[])`);
  }
  if (caseType) {
    params.push(caseType);
    where.push(`sc.case_type = $${params.length}`);
  }
  if (queueId) {
    params.push(queueId);
    where.push(`sc.queue_id::text = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(sc.case_number ILIKE $${params.length} OR sc.subject ILIKE $${params.length})`);
  }
  if (assignedToMe) {
    params.push(req.supportAgent.id);
    where.push(`sc.assigned_to_agent_id = $${params.length}::uuid`);
  }
  if (slaAtRisk) {
    where.push(
      `sc.status NOT IN ('resolved', 'closed')
       AND sc.sla_resolution_deadline IS NOT NULL
       AND sc.sla_resolution_deadline >= NOW()
       AND sc.sla_resolution_deadline < NOW() + INTERVAL '4 hours'`
    );
  }
  if (isEscalated) {
    where.push("sc.is_escalated = TRUE");
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const totalResult = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM support_cases sc
       ${whereClause}`,
    params
  );
  const total = totalResult.rows[0]?.n || 0;

  const pageParams = params.concat([perPage + 1, offset]);
  const dataRows = await pool.query(
    `${createCaseBaseSelect()}
      ${whereClause}
      ORDER BY sc.updated_at DESC, sc.created_at DESC
      LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
    pageParams
  );
  const rows = dataRows.rows || [];
  const hasMore = rows.length > perPage;
  const items = (hasMore ? rows.slice(0, perPage) : rows).map((row) => caseSummaryFromRow(row, req));

  return {
    items,
    total,
    page,
    per_page: perPage,
    has_more: hasMore
  };
}

function buildSupportRouter(deps) {
  const router = Router();
  const supportAuth = requireSupportAccess(deps);
  const requireAuth = deps.requireAuth;
  const supportRateLimit = deps.supportRateLimit || ((_req, _res, next) => next());
  const { pool, logger, sendMail, config } = deps;

  router.use("/support", supportRateLimit, requireAuth, supportAuth);

  router.get("/support/bootstrap", async (req, res) => {
    try {
      const role = req.supportAgent.role;
      const features = supportFeatures(role);
      const maskingRules = req.supportMaskingRules;

      const queueScopeParams = [];
      const queueScopeWhere = [];
      buildScope(req.supportAgent, "sc", queueScopeParams, queueScopeWhere);
      const queueScopeClause = queueScopeWhere.length > 0 ? `AND ${queueScopeWhere.join(" AND ")}` : "";
      const queueScopeClauseShiftedForPrefixedParams = queueScopeWhere.length > 0
        ? `AND ${shiftPlaceholders(queueScopeWhere.join(" AND "), 1)}`
        : "";

      const queuesResult = await pool.query(
        `SELECT sq.id, sq.name, sq.type,
                COALESCE(agg.open_count, 0)::int AS open_count,
                COALESCE(agg.sla_at_risk, 0)::int AS sla_at_risk
           FROM support_queues sq
           LEFT JOIN LATERAL (
             SELECT COUNT(*) FILTER (
                      WHERE sc.status NOT IN ('resolved', 'closed')
                    ) AS open_count,
                    COUNT(*) FILTER (
                      WHERE sc.status NOT IN ('resolved', 'closed')
                        AND sc.sla_resolution_deadline IS NOT NULL
                        AND sc.sla_resolution_deadline >= NOW()
                        AND sc.sla_resolution_deadline < NOW() + INTERVAL '4 hours'
                    ) AS sla_at_risk
               FROM support_cases sc
              WHERE sc.queue_id = sq.id
                ${queueScopeClause}
           ) agg ON TRUE
          WHERE sq.is_active = TRUE
          ORDER BY sq.name ASC`,
        queueScopeParams
      );

      const assignedResult = await pool.query(
        `SELECT COUNT(*)::int AS n
           FROM support_cases sc
          WHERE sc.assigned_to_agent_id = $1::uuid
            AND sc.status NOT IN ('resolved', 'closed')`,
        [req.supportAgent.id]
      );
      const openAssignedCount = assignedResult.rows[0]?.n || 0;

      const escalationParams = [];
      const escalationWhere = [];
      buildScope(req.supportAgent, "sc", escalationParams, escalationWhere);
      const escalationScope = escalationWhere.length > 0 ? `AND ${escalationWhere.join(" AND ")}` : "";
      const escalationResult = await pool.query(
        `SELECT COUNT(*)::int AS n
           FROM support_escalations se
           JOIN support_cases sc ON sc.id = se.case_id
          WHERE se.status IN ('pending', 'acknowledged')
            ${escalationScope}`,
        escalationParams
      );
      const escalationsPending = escalationResult.rows[0]?.n || 0;

      const slaSummaryResult = await pool.query(
        `SELECT
            COUNT(*) FILTER (
              WHERE sc.assigned_to_agent_id = $1::uuid
                AND sc.status NOT IN ('resolved', 'closed')
            )::int AS open_assigned,
            COUNT(*) FILTER (
              WHERE sc.status NOT IN ('resolved', 'closed')
                AND sc.sla_resolution_deadline IS NOT NULL
                AND sc.sla_resolution_deadline >= NOW()
                AND sc.sla_resolution_deadline < NOW() + INTERVAL '4 hours'
            )::int AS sla_at_risk,
            COUNT(*) FILTER (
              WHERE sc.status NOT IN ('resolved', 'closed')
                AND sc.sla_resolution_deadline IS NOT NULL
                AND sc.sla_resolution_deadline < NOW()
            )::int AS sla_breached
          FROM support_cases sc
         WHERE 1 = 1 ${queueScopeClauseShiftedForPrefixedParams}`,
        [req.supportAgent.id, ...queueScopeParams]
      );
      const slaSummary = slaSummaryResult.rows[0] || { open_assigned: 0, sla_at_risk: 0, sla_breached: 0 };

      const userInfo = await pool.query(
        `SELECT u.id, u.email,
                COALESCE(NULLIF(u.contact_person, ''), NULLIF(u.company_name, ''), u.email) AS display_name
           FROM users u
          WHERE u.id = $1::uuid
          LIMIT 1`,
        [req.supportAgent.user_id]
      );
      const me = userInfo.rows[0] || {};
      const emailDomain = maskSupportEmail(me.email, "external_support_agent") || "@unknown";

      return res.json({
        identity: {
          user_id: maskSupportId(req.supportAgent.user_id, role, "usr") || "usr-unknown",
          display_name: me.display_name || req.supportAgent.display_name,
          email_domain: emailDomain,
          role,
          scope: req.supportAgent.scope,
          vendor_id: req.supportAgent.vendor_id,
          vendor_name: req.supportAgent.vendor_name,
          allowed_queues: req.supportAgent.allowed_queues,
          allowed_case_types: req.supportAgent.allowed_case_types,
          allowed_actions: req.supportAllowedActions,
          data_scope: req.supportAgent.data_scope,
          masking_rules: maskingRules
        },
        queues: queuesResult.rows.map((row) => ({
          id: row.id,
          name: row.name,
          type: row.type || "general",
          open_count: toInt(row.open_count, 0),
          sla_at_risk: toInt(row.sla_at_risk, 0)
        })),
        sla_summary: {
          open_assigned: toInt(slaSummary.open_assigned, 0),
          sla_at_risk: toInt(slaSummary.sla_at_risk, 0),
          sla_breached: toInt(slaSummary.sla_breached, 0),
          escalations_pending: toInt(escalationsPending, 0)
        },
        features,
        open_assigned_count: toInt(openAssignedCount, 0),
        escalations_pending: toInt(escalationsPending, 0)
      });
    } catch (err) {
      logger?.error?.({ err, userId: req.supportAgent?.user_id }, "support bootstrap failed");
      return res.status(500).json({ error: "SERVER_ERROR", message: "Support-Bootstrap konnte nicht geladen werden." });
    }
  });

  router.get("/support/cases", async (req, res) => {
    try {
      const payload = await loadPaginatedCases(pool, req);
      return res.json(payload);
    } catch (err) {
      logger?.error?.({ err }, "support cases list failed");
      return res.status(500).json({ error: "SERVER_ERROR", message: "Cases konnten nicht geladen werden." });
    }
  });

  router.get("/support/cases/:id", async (req, res) => {
    try {
      const row = await loadCaseRow(pool, req.params.id, req.supportAgent);
      if (!row) {
        return res.status(404).json({ error: "CASE_NOT_FOUND", message: "Case wurde nicht gefunden." });
      }
      const [ notes, timeline ] = await Promise.all([
        loadCaseNotes(pool, row.id, req),
        loadCaseTimeline(pool, row.id)
      ]);
      return res.json(caseDetailFromRow(row, req, notes, timeline));
    } catch (err) {
      logger?.error?.({ err, caseId: req.params.id }, "support case detail failed");
      return res.status(500).json({ error: "SERVER_ERROR", message: "Case-Details konnten nicht geladen werden." });
    }
  });

  router.post("/support/cases/:id/action", async (req, res) => {
    const action = String(req.body?.action || "").trim().toLowerCase();
    if (!ACTIONS.has(action)) {
      return res.status(400).json({ error: "INVALID_ACTION", message: "Unbekannte Case-Action." });
    }
    if (req.body?.case_id && String(req.body.case_id) !== String(req.params.id)) {
      return res.status(400).json({ error: "CASE_ID_MISMATCH", message: "case_id passt nicht zur URL." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const currentRow = await loadCaseRow(client, req.params.id, req.supportAgent);
      if (!currentRow) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "CASE_NOT_FOUND", message: "Case wurde nicht gefunden." });
      }

      const allowedActions = computeAllowedActions(currentRow, req);
      if (!allowedActions.includes(action)) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: "PERMISSION_DENIED", message: "Action für diesen Case nicht erlaubt." });
      }

      const reason = nullableText(req.body?.reason);
      const nowEventDetail = { action };

      let auditAction = action;
      if (action === "accept") {
        await client.query(
          `UPDATE support_cases
              SET assigned_to_agent_id = $2::uuid,
                  status = CASE WHEN status = 'new' THEN 'open' ELSE status END,
                  sla_first_responded_at = COALESCE(sla_first_responded_at, NOW()),
                  updated_at = NOW()
            WHERE id = $1::uuid`,
          [currentRow.id, req.supportAgent.id]
        );
        await insertCaseEvent(client, currentRow.id, req.supportAgent.id, "case_accepted", nowEventDetail);
        auditAction = "case_accepted";
      } else if (action === "assign") {
        const assigneeId = nullableText(req.body?.assignee_id);
        if (!assigneeId) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "ASSIGNEE_REQUIRED", message: "assignee_id ist erforderlich." });
        }
        const assignee = await client.query(
          `SELECT sa.id, sa.vendor_id
             FROM support_agents sa
            WHERE sa.id = $1::uuid
              AND sa.is_active = TRUE
            LIMIT 1`,
          [assigneeId]
        );
        if (!assignee.rows[0]) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "ASSIGNEE_NOT_FOUND", message: "Agent für Zuweisung nicht gefunden." });
        }
        if (req.supportAgent.data_scope === "vendor_scoped" && req.supportAgent.vendor_id && assignee.rows[0].vendor_id !== req.supportAgent.vendor_id) {
          await client.query("ROLLBACK");
          return res.status(403).json({ error: "PERMISSION_DENIED", message: "Assignee liegt außerhalb des Vendor-Scopes." });
        }
        await client.query(
          `UPDATE support_cases
              SET assigned_to_agent_id = $2::uuid,
                  updated_at = NOW()
            WHERE id = $1::uuid`,
          [currentRow.id, assigneeId]
        );
        await insertCaseEvent(client, currentRow.id, req.supportAgent.id, "case_assigned", { assignee_id: assigneeId });
        auditAction = "case_assigned";
      } else if (action === "change_status") {
        const nextStatus = String(req.body?.new_status || "").trim().toLowerCase();
        if (!CASE_STATUSES.has(nextStatus)) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "INVALID_STATUS", message: "new_status ist ungültig." });
        }
        await client.query(
          `UPDATE support_cases
              SET status = $2,
                  sla_first_responded_at = CASE
                    WHEN sla_first_responded_at IS NULL AND $2 <> 'new' THEN NOW()
                    ELSE sla_first_responded_at
                  END,
                  sla_resolved_at = CASE
                    WHEN $2 IN ('resolved', 'closed') THEN COALESCE(sla_resolved_at, NOW())
                    ELSE sla_resolved_at
                  END,
                  closed_at = CASE WHEN $2 = 'closed' THEN NOW() ELSE closed_at END,
                  updated_at = NOW()
            WHERE id = $1::uuid`,
          [currentRow.id, nextStatus]
        );
        await insertCaseEvent(client, currentRow.id, req.supportAgent.id, "status_changed", { from: currentRow.status, to: nextStatus });
        auditAction = "status_changed";
      } else if (action === "change_priority") {
        const nextPriority = String(req.body?.new_priority || "").trim().toLowerCase();
        if (!CASE_PRIORITIES.has(nextPriority)) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "INVALID_PRIORITY", message: "new_priority ist ungültig." });
        }
        await client.query(
          `UPDATE support_cases
              SET priority = $2,
                  updated_at = NOW()
            WHERE id = $1::uuid`,
          [currentRow.id, nextPriority]
        );
        await insertCaseEvent(client, currentRow.id, req.supportAgent.id, "priority_changed", { from: currentRow.priority, to: nextPriority });
        auditAction = "priority_changed";
      } else if (action === "add_note") {
        const note = nullableText(req.body?.note);
        const noteType = String(req.body?.note_type || "internal").trim().toLowerCase();
        if (!note) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "NOTE_REQUIRED", message: "note ist erforderlich." });
        }
        if (!NOTE_TYPES.has(noteType)) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "INVALID_NOTE_TYPE", message: "note_type ist ungültig." });
        }
        await client.query(
          `INSERT INTO support_case_notes (case_id, author_agent_id, note_type, body)
           VALUES ($1::uuid, $2::uuid, $3, $4)`,
          [currentRow.id, req.supportAgent.id, noteType, note]
        );
        await client.query(
          `UPDATE support_cases
              SET updated_at = NOW(),
                  sla_first_responded_at = COALESCE(sla_first_responded_at, NOW())
            WHERE id = $1::uuid`,
          [currentRow.id]
        );
        await insertCaseEvent(client, currentRow.id, req.supportAgent.id, "note_added", { note_type: noteType });
        auditAction = "note_added";
      } else if (action === "escalate") {
        const target = String(req.body?.escalation?.target || req.body?.target || "").trim().toLowerCase();
        const escalationReason = nullableText(req.body?.escalation?.reason || reason);
        const priority = String(req.body?.escalation?.priority || currentRow.priority || "normal").trim().toLowerCase();
        const summary = nullableText(req.body?.escalation?.summary || currentRow.subject) || currentRow.subject;
        if (!ESCALATION_TARGETS.has(target)) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "INVALID_TARGET", message: "target ist ungültig." });
        }
        if (!escalationReason || escalationReason.length < 20) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "ESCALATION_REASON_REQUIRED", message: "Eskalation erfordert reason mit mindestens 20 Zeichen." });
        }
        if (!CASE_PRIORITIES.has(priority)) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "INVALID_PRIORITY", message: "priority ist ungültig." });
        }

        const occId = await createOccEscalation(client, {
          target,
          title: `Support Escalation ${currentRow.case_number}`,
          summary,
          details: escalationReason,
          priority,
          reporter_user_id: currentRow.reporter_user_id,
          reporter_org_id: currentRow.reporter_org_id,
          org_name: currentRow.org_name,
          contact_name: currentRow.reporter_name,
          contact_email: currentRow.reporter_email,
          support_context: {
            case_id: currentRow.id,
            case_number: currentRow.case_number,
            reason: escalationReason,
            target
          },
          related_entities: [
            { type: "support_case", id: currentRow.id },
            { type: "support_escalation_target", id: target }
          ]
        });

        const escalationsInsert = await client.query(
          `INSERT INTO support_escalations (
             case_id, target, reason, priority, summary, status,
             created_by_agent_id, related_occ_request_id, created_at
           )
           VALUES ($1::uuid, $2, $3, $4, $5, 'pending', $6::uuid, $7::uuid, NOW())
           RETURNING id`,
          [currentRow.id, target, escalationReason, priority, summary, req.supportAgent.id, occId]
        );
        const escalationId = escalationsInsert.rows[0]?.id || null;

        await client.query(
          `UPDATE support_cases
              SET is_escalated = TRUE,
                  escalation_target = $2,
                  status = $3,
                  related_occ_request_id = COALESCE($4::uuid, related_occ_request_id),
                  updated_at = NOW()
            WHERE id = $1::uuid`,
          [currentRow.id, target, mapEscalationTargetToCaseStatus(target), occId]
        );

        await insertCaseEvent(client, currentRow.id, req.supportAgent.id, "case_escalated", {
          target,
          escalation_id: escalationId,
          related_occ_request_id: occId
        });
        auditAction = "case_escalated";

        if (target === "ops") {
          await createOpsSignal(client, {
            case_id: currentRow.id,
            case_number: currentRow.case_number,
            reason: escalationReason,
            priority,
            related_occ_request_id: occId
          });
        }
      } else if (action === "resend_verification" || action === "resend_invite") {
        await insertCaseEvent(client, currentRow.id, req.supportAgent.id, action, nowEventDetail);
        auditAction = action;
      } else if (action === "close") {
        if (!reason || reason.length < 10) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "CLOSE_REASON_REQUIRED", message: "close erfordert eine Begründung." });
        }
        await client.query(
          `UPDATE support_cases
              SET status = 'closed',
                  closed_at = NOW(),
                  sla_resolved_at = COALESCE(sla_resolved_at, NOW()),
                  updated_at = NOW()
            WHERE id = $1::uuid`,
          [currentRow.id]
        );
        await insertCaseEvent(client, currentRow.id, req.supportAgent.id, "case_closed", { reason });
        auditAction = "case_closed";
      }

      const updatedRow = await loadCaseRow(client, currentRow.id, req.supportAgent);
      const [ notes, timeline ] = await Promise.all([
        loadCaseNotes(client, currentRow.id, req),
        loadCaseTimeline(client, currentRow.id)
      ]);

      await insertSupportAudit(client, {
        agent_id: req.supportAgent.id,
        case_id: currentRow.id,
        action: auditAction,
        reason,
        before_state: {
          status: currentRow.status,
          priority: currentRow.priority,
          assigned_to_agent_id: currentRow.assigned_to_agent_id,
          is_escalated: currentRow.is_escalated,
          escalation_target: currentRow.escalation_target
        },
        after_state: updatedRow ? {
          status: updatedRow.status,
          priority: updatedRow.priority,
          assigned_to_agent_id: updatedRow.assigned_to_agent_id,
          is_escalated: updatedRow.is_escalated,
          escalation_target: updatedRow.escalation_target
        } : null,
        ip_address: req.ip
      });

      await client.query("COMMIT");

      return res.json({
        success: true,
        case: updatedRow ? caseDetailFromRow(updatedRow, req, notes, timeline) : null
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      logger?.error?.({ err, caseId: req.params.id, action }, "support case action failed");
      return res.status(500).json({ error: "SERVER_ERROR", message: "Action konnte nicht ausgeführt werden." });
    } finally {
      client.release();
    }
  });

  router.get("/support/lookup/users", requireSupportFeature("user_lookup"), async (req, res) => {
    const search = nullableText(req.query.search);
    if (!search || search.length < 3) {
      return res.status(400).json({ error: "SEARCH_TOO_SHORT", message: "search benötigt mindestens 3 Zeichen." });
    }

    try {
      const page = clampInt(req.query.page, 1, 100000, 1);
      const perPage = clampInt(req.query.per_page, 1, 100, 25);
      const offset = (page - 1) * perPage;

      const params = [ `%${search}%` ];
      const where = [ "(u.email ILIKE $1 OR COALESCE(u.contact_person, '') ILIKE $1 OR COALESCE(u.company_name, '') ILIKE $1)" ];
      buildScope(req.supportAgent, "sc", params, where);

      const whereClause = `WHERE ${where.join(" AND ")}`;
      const totalRows = await pool.query(
        `SELECT COUNT(DISTINCT u.id)::int AS n
           FROM users u
           JOIN support_cases sc ON sc.reporter_user_id = u.id
          ${whereClause}`,
        params
      );
      const total = totalRows.rows[0]?.n || 0;

      const pageParams = params.concat([perPage + 1, offset]);
      const rowsResult = await pool.query(
        `SELECT DISTINCT u.id, u.email, u.contact_person, u.company_name, u.is_verified, u.created_at,
                COALESCE(org_count.org_count, 0)::int AS org_count,
                COALESCE(open_cases.open_case_count, 0)::int AS open_case_count
           FROM users u
           JOIN support_cases sc ON sc.reporter_user_id = u.id
           LEFT JOIN LATERAL (
             SELECT COUNT(*)::int AS org_count
               FROM org_memberships om
              WHERE om.user_id = u.id
                AND om.is_active = TRUE
           ) org_count ON TRUE
           LEFT JOIN LATERAL (
             SELECT COUNT(*)::int AS open_case_count
               FROM support_cases sc2
              WHERE sc2.reporter_user_id = u.id
                AND sc2.status NOT IN ('resolved', 'closed')
           ) open_cases ON TRUE
          ${whereClause}
          ORDER BY u.created_at DESC
          LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
        pageParams
      );
      const rows = rowsResult.rows || [];
      const hasMore = rows.length > perPage;
      const pageRows = hasMore ? rows.slice(0, perPage) : rows;

      await insertSupportAudit(pool, {
        agent_id: req.supportAgent.id,
        case_id: null,
        action: "user_lookup",
        reason: `search=${search}`,
        before_state: null,
        after_state: { result_count: pageRows.length },
        ip_address: req.ip
      });

      return res.json({
        items: pageRows.map((row) => {
          const context = {
            user_id_masked: maskUserIdBySearch(row.id, req.supportAgent.role),
            email_masked: maskSupportEmail(row.email, req.supportAgent.role),
            display_name_masked: maskSupportName(row.contact_person || row.company_name || row.email, req.supportAgent.role),
            account_status: row.is_verified === true ? "active" : "pending_verification",
            org_count: toInt(row.org_count, 0),
            created_at: toIso(row.created_at),
            verification_state: row.is_verified === true ? "verified" : "unverified",
            last_login_masked: null
          };
          return {
            ...context,
            open_case_count: toInt(row.open_case_count, 0),
            context
          };
        }),
        total,
        page,
        per_page: perPage,
        has_more: hasMore
      });
    } catch (err) {
      logger?.error?.({ err, search }, "support user lookup failed");
      return res.status(500).json({ error: "SERVER_ERROR", message: "User-Lookup fehlgeschlagen." });
    }
  });

  router.get("/support/lookup/orgs", requireSupportFeature("org_lookup"), async (req, res) => {
    const search = nullableText(req.query.search);
    if (!search || search.length < 2) {
      return res.status(400).json({ error: "SEARCH_TOO_SHORT", message: "search benötigt mindestens 2 Zeichen." });
    }

    try {
      const page = clampInt(req.query.page, 1, 100000, 1);
      const perPage = clampInt(req.query.per_page, 1, 100, 25);
      const offset = (page - 1) * perPage;

      const params = [ `%${search}%` ];
      const where = [ "org.name ILIKE $1" ];
      buildScope(req.supportAgent, "sc", params, where);

      const whereClause = `WHERE ${where.join(" AND ")}`;
      const totalRows = await pool.query(
        `SELECT COUNT(DISTINCT org.id)::int AS n
           FROM organizations org
           JOIN support_cases sc ON sc.reporter_org_id = org.id
          ${whereClause}`,
        params
      );
      const total = totalRows.rows[0]?.n || 0;

      const pageParams = params.concat([perPage + 1, offset]);
      const orgRows = await pool.query(
        `SELECT DISTINCT org.id, org.name, org.plan, org.is_active, org.created_at,
                COALESCE(members.member_count, 0)::int AS member_count,
                COALESCE(open_cases.open_case_count, 0)::int AS open_case_count
           FROM organizations org
           JOIN support_cases sc ON sc.reporter_org_id = org.id
           LEFT JOIN LATERAL (
             SELECT COUNT(*)::int AS member_count
               FROM org_memberships om
              WHERE om.org_id = org.id
                AND om.is_active = TRUE
           ) members ON TRUE
           LEFT JOIN LATERAL (
             SELECT COUNT(*)::int AS open_case_count
               FROM support_cases sc2
              WHERE sc2.reporter_org_id = org.id
                AND sc2.status NOT IN ('resolved', 'closed')
           ) open_cases ON TRUE
          ${whereClause}
          ORDER BY org.created_at DESC
          LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
        pageParams
      );
      const rows = orgRows.rows || [];
      const hasMore = rows.length > perPage;
      const pageRows = hasMore ? rows.slice(0, perPage) : rows;

      // Recent-Cases fuer ALLE Orgs der Seite in EINER Query (vormals N+1: eine
      // SELECT je Org → bis zu per_page=100 Round-Trips/Request). Maskierung bleibt
      // hier, da caseSummaryFromRow die Rolle aus req braucht.
      const recentByOrg = await loadRecentOpenCasesByOrg(pool, pageRows.map((row) => row.id), req.supportAgent);
      const items = pageRows.map((row) => {
        const recentCases = (recentByOrg.get(row.id) || []).map((caseRow) => caseSummaryFromRow(caseRow, req));
        const context = {
          org_id_masked: maskOrgIdBySearch(row.id, req.supportAgent.role),
          org_name: row.name,
          plan: row.plan || null,
          status: row.is_active === false ? "inactive" : "active",
          member_count: toInt(row.member_count, 0),
          created_at: toIso(row.created_at)
        };
        return {
          ...context,
          open_case_count: toInt(row.open_case_count, 0),
          context,
          recent_cases: recentCases
        };
      });

      await insertSupportAudit(pool, {
        agent_id: req.supportAgent.id,
        case_id: null,
        action: "org_lookup",
        reason: `search=${search}`,
        before_state: null,
        after_state: { result_count: items.length },
        ip_address: req.ip
      });

      return res.json({
        items,
        total,
        page,
        per_page: perPage,
        has_more: hasMore
      });
    } catch (err) {
      logger?.error?.({ err, search }, "support org lookup failed");
      return res.status(500).json({ error: "SERVER_ERROR", message: "Org-Lookup fehlgeschlagen." });
    }
  });

  router.get("/support/escalations", async (req, res) => {
    try {
      const page = clampInt(req.query.page, 1, 100000, 1);
      const perPage = clampInt(req.query.per_page, 1, 100, 25);
      const offset = (page - 1) * perPage;
      const statuses = normalizeEscalationStatusList(req.query.status);
      const target = nullableText(req.query.target);
      const search = nullableText(req.query.search);

      const params = [];
      const where = [];
      buildScope(req.supportAgent, "sc", params, where);
      if (statuses.length > 0) {
        params.push(statuses);
        where.push(`se.status = ANY($${params.length}::text[])`);
      }
      if (target && ESCALATION_TARGETS.has(target)) {
        params.push(target);
        where.push(`se.target = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        where.push(`(sc.case_number ILIKE $${params.length} OR sc.subject ILIKE $${params.length})`);
      }

      const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

      const totalRows = await pool.query(
        `SELECT COUNT(*)::int AS n
           FROM support_escalations se
           JOIN support_cases sc ON sc.id = se.case_id
          ${whereClause}`,
        params
      );
      const total = totalRows.rows[0]?.n || 0;

      const pageParams = params.concat([perPage + 1, offset]);
      const rowsResult = await pool.query(
        `SELECT se.id, se.case_id, se.target, se.reason, se.priority, se.summary, se.status,
                se.created_at, se.resolved_at, se.resolution_note,
                sc.case_number, sc.subject AS case_subject,
                COALESCE(NULLIF(actor_u.contact_person, ''), NULLIF(actor_u.company_name, ''), actor_u.email, 'System') AS created_by_name
           FROM support_escalations se
           JOIN support_cases sc ON sc.id = se.case_id
           LEFT JOIN support_agents actor_sa ON actor_sa.id = se.created_by_agent_id
           LEFT JOIN users actor_u ON actor_u.id = actor_sa.user_id
          ${whereClause}
          ORDER BY se.created_at DESC
          LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
        pageParams
      );
      const rows = rowsResult.rows || [];
      const hasMore = rows.length > perPage;
      const pageRows = hasMore ? rows.slice(0, perPage) : rows;

      return res.json({
        items: pageRows.map((row) => ({
          id: row.id,
          case_id: row.case_id,
          case_number: row.case_number,
          case_subject: row.case_subject,
          target: row.target,
          reason: row.reason,
          priority: row.priority,
          summary: row.summary,
          status: row.status,
          created_by_name: row.created_by_name,
          created_at: toIso(row.created_at),
          resolved_at: toIso(row.resolved_at),
          resolution_note: row.resolution_note || null
        })),
        total,
        page,
        per_page: perPage,
        has_more: hasMore
      });
    } catch (err) {
      logger?.error?.({ err }, "support escalation list failed");
      return res.status(500).json({ error: "SERVER_ERROR", message: "Eskalationen konnten nicht geladen werden." });
    }
  });

  router.post("/support/escalations", async (req, res) => {
    const caseId = nullableText(req.body?.case_id);
    const target = String(req.body?.target || "").trim().toLowerCase();
    const reason = nullableText(req.body?.reason);
    const priority = String(req.body?.priority || "normal").trim().toLowerCase();
    const summary = nullableText(req.body?.summary);

    if (!caseId || !isUuid(caseId)) {
      return res.status(400).json({ error: "CASE_ID_REQUIRED", message: "case_id ist erforderlich." });
    }
    if (!ESCALATION_TARGETS.has(target)) {
      return res.status(400).json({ error: "INVALID_TARGET", message: "target ist ungültig." });
    }
    if (!reason || reason.length < 20) {
      return res.status(400).json({ error: "ESCALATION_REASON_REQUIRED", message: "reason muss mindestens 20 Zeichen enthalten." });
    }
    if (!CASE_PRIORITIES.has(priority)) {
      return res.status(400).json({ error: "INVALID_PRIORITY", message: "priority ist ungültig." });
    }
    if (!summary) {
      return res.status(400).json({ error: "SUMMARY_REQUIRED", message: "summary ist erforderlich." });
    }
    if (!computeAllowedActions({ is_escalated: false, status: "open", assigned_to_agent_id: null }, req).includes("escalate")) {
      return res.status(403).json({ error: "PERMISSION_DENIED", message: "Eskalation ist für diese Rolle nicht erlaubt." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const currentRow = await loadCaseRow(client, caseId, req.supportAgent);
      if (!currentRow) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "CASE_NOT_FOUND", message: "Case wurde nicht gefunden." });
      }

      const occId = await createOccEscalation(client, {
        target,
        title: `Support Escalation ${currentRow.case_number}`,
        summary,
        details: reason,
        priority,
        reporter_user_id: currentRow.reporter_user_id,
        reporter_org_id: currentRow.reporter_org_id,
        org_name: currentRow.org_name,
        contact_name: currentRow.reporter_name,
        contact_email: currentRow.reporter_email,
        support_context: {
          case_id: currentRow.id,
          case_number: currentRow.case_number,
          reason,
          target
        },
        related_entities: [
          { type: "support_case", id: currentRow.id },
          { type: "support_escalation_target", id: target }
        ]
      });

      const escalationInsert = await client.query(
        `INSERT INTO support_escalations (
           case_id, target, reason, priority, summary, status,
           created_by_agent_id, related_occ_request_id
         )
         VALUES ($1::uuid, $2, $3, $4, $5, 'pending', $6::uuid, $7::uuid)
         RETURNING id`,
        [currentRow.id, target, reason, priority, summary, req.supportAgent.id, occId]
      );
      const escalationId = escalationInsert.rows[0]?.id || null;

      await client.query(
        `UPDATE support_cases
            SET is_escalated = TRUE,
                escalation_target = $2,
                status = $3,
                related_occ_request_id = COALESCE($4::uuid, related_occ_request_id),
                updated_at = NOW()
          WHERE id = $1::uuid`,
        [currentRow.id, target, mapEscalationTargetToCaseStatus(target), occId]
      );
      await insertCaseEvent(client, currentRow.id, req.supportAgent.id, "case_escalated", {
        target,
        escalation_id: escalationId,
        related_occ_request_id: occId
      });
      await insertSupportAudit(client, {
        agent_id: req.supportAgent.id,
        case_id: currentRow.id,
        action: "case_escalated",
        reason,
        before_state: {
          status: currentRow.status,
          is_escalated: currentRow.is_escalated,
          escalation_target: currentRow.escalation_target
        },
        after_state: {
          status: mapEscalationTargetToCaseStatus(target),
          is_escalated: true,
          escalation_target: target
        },
        ip_address: req.ip
      });

      if (target === "ops") {
        await createOpsSignal(client, {
          case_id: currentRow.id,
          case_number: currentRow.case_number,
          reason,
          priority,
          related_occ_request_id: occId
        });
      }

      await client.query("COMMIT");

      return res.json({
        success: true,
        escalation_id: escalationId,
        related_occ_request_id: occId,
        target
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      logger?.error?.({ err, caseId, target }, "support escalation create failed");
      return res.status(500).json({ error: "SERVER_ERROR", message: "Eskalation konnte nicht erstellt werden." });
    } finally {
      client.release();
    }
  });

  router.get("/support/knowledge", requireSupportFeature("knowledge_base"), async (req, res) => {
    try {
      const category = nullableText(req.query.category);
      const search = nullableText(req.query.search);
      const params = [ req.supportAgent.role ];
      const where = [ "is_active = TRUE", "$1 = ANY(allowed_roles)" ];
      if (category) {
        params.push(category);
        where.push(`category = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        where.push(`(title ILIKE $${params.length} OR body ILIKE $${params.length})`);
      }

      const rows = await pool.query(
        `SELECT id, category, title, body, tags, allowed_roles
           FROM support_knowledge
          WHERE ${where.join(" AND ")}
          ORDER BY updated_at DESC, created_at DESC`,
        params
      );

      await insertSupportAudit(pool, {
        agent_id: req.supportAgent.id,
        case_id: null,
        action: "knowledge_accessed",
        reason: `category=${category || "all"} search=${search || ""}`.trim(),
        before_state: null,
        after_state: { count: rows.rows.length },
        ip_address: req.ip
      });

      return res.json(rows.rows.map((row) => ({
        id: row.id,
        category: row.category,
        title: row.title,
        body: row.body,
        tags: Array.isArray(row.tags) ? row.tags : [],
        allowed_roles: Array.isArray(row.allowed_roles) ? row.allowed_roles : []
      })));
    } catch (err) {
      logger?.error?.({ err }, "support knowledge list failed");
      return res.status(500).json({ error: "SERVER_ERROR", message: "Knowledge-Base konnte nicht geladen werden." });
    }
  });

  router.get("/support/knowledge/categories", requireSupportFeature("knowledge_base"), async (req, res) => {
    try {
      const rows = await pool.query(
        `SELECT DISTINCT category
           FROM support_knowledge
          WHERE is_active = TRUE
            AND $1 = ANY(allowed_roles)
          ORDER BY category ASC`,
        [req.supportAgent.role]
      );
      return res.json(rows.rows.map((row) => row.category));
    } catch (err) {
      logger?.error?.({ err }, "support knowledge categories failed");
      return res.status(500).json({ error: "SERVER_ERROR", message: "Kategorien konnten nicht geladen werden." });
    }
  });

  router.get("/support/quality/metrics", requireSupportFeature("quality_metrics"), async (req, res) => {
    try {
      const params = [];
      const where = [ "sc.created_at >= NOW() - INTERVAL '30 days'" ];
      buildScope(req.supportAgent, "sc", params, where);
      const whereClause = `WHERE ${where.join(" AND ")}`;

      const rows = await pool.query(
        `SELECT
            COUNT(*)::int AS total_cases,
            COUNT(*) FILTER (WHERE sc.status IN ('resolved', 'closed'))::int AS resolved_cases,
            ROUND(AVG(EXTRACT(EPOCH FROM (sc.sla_first_responded_at - sc.created_at)) / 3600.0)::numeric, 1) AS avg_first_response_h,
            ROUND(AVG(EXTRACT(EPOCH FROM (sc.sla_resolved_at - sc.created_at)) / 3600.0)::numeric, 1) AS avg_resolution_h,
            ROUND(
              CASE
                WHEN COUNT(*) FILTER (WHERE sc.status IN ('resolved', 'closed') AND sc.sla_resolution_deadline IS NOT NULL) = 0 THEN NULL
                ELSE 100.0 * COUNT(*) FILTER (
                  WHERE sc.status IN ('resolved', 'closed')
                    AND sc.sla_resolution_deadline IS NOT NULL
                    AND sc.sla_resolved_at <= sc.sla_resolution_deadline
                ) / COUNT(*) FILTER (WHERE sc.status IN ('resolved', 'closed') AND sc.sla_resolution_deadline IS NOT NULL)
              END::numeric, 1
            ) AS sla_met_percent,
            ROUND(
              CASE WHEN COUNT(*) = 0 THEN NULL
                   ELSE 100.0 * COUNT(*) FILTER (WHERE sc.is_escalated = TRUE) / COUNT(*)
              END::numeric, 1
            ) AS escalation_rate_percent,
            ROUND(
              CASE WHEN COUNT(*) = 0 THEN NULL
                   ELSE 100.0 * COUNT(*) FILTER (WHERE sc.status = 'reopened') / COUNT(*)
              END::numeric, 1
            ) AS reopen_rate_percent
           FROM support_cases sc
          ${whereClause}`,
        params
      );
      const row = rows.rows[0] || {};

      return res.json({
        period: "last_30_days",
        total_cases: toInt(row.total_cases, 0),
        resolved_cases: toInt(row.resolved_cases, 0),
        avg_first_response_h: toNumber(row.avg_first_response_h, null),
        avg_resolution_h: toNumber(row.avg_resolution_h, null),
        sla_met_percent: toNumber(row.sla_met_percent, null),
        escalation_rate_percent: toNumber(row.escalation_rate_percent, null),
        reopen_rate_percent: toNumber(row.reopen_rate_percent, null),
        csat_score: null
      });
    } catch (err) {
      logger?.error?.({ err }, "support quality metrics failed");
      return res.status(500).json({ error: "SERVER_ERROR", message: "Quality-Metriken konnten nicht geladen werden." });
    }
  });

  router.get("/support/quality/agents", requireSupportFeature("quality_metrics"), async (req, res) => {
    try {
      const params = [];
      const where = [ "sa.is_active = TRUE" ];

      if (req.supportAgent.role === "external_support_supervisor") {
        params.push(req.supportAgent.vendor_id || null);
        where.push(`sa.vendor_id = $${params.length}::uuid`);
      } else if (req.supportAgent.role === "internal_support_lead") {
        where.push("sa.scope = 'internal'");
      } else if (req.supportAgent.role === "support_auditor") {
        // auditor sees all active support agents
      } else {
        params.push(req.supportAgent.id);
        where.push(`sa.id = $${params.length}::uuid`);
      }

      const whereClause = `WHERE ${where.join(" AND ")}`;
      const rows = await pool.query(
        `SELECT sa.id AS agent_id, sa.role, sv.name AS vendor_name,
                COALESCE(NULLIF(u.contact_person, ''), NULLIF(u.company_name, ''), u.email) AS display_name,
                COALESCE(stats.open_cases, 0)::int AS open_cases,
                COALESCE(stats.sla_at_risk, 0)::int AS sla_at_risk,
                stats.avg_first_response_h,
                stats.avg_resolution_h
           FROM support_agents sa
           JOIN users u ON u.id = sa.user_id
           LEFT JOIN support_vendors sv ON sv.id = sa.vendor_id
           LEFT JOIN LATERAL (
             SELECT COUNT(*) FILTER (WHERE sc.status NOT IN ('resolved', 'closed'))::int AS open_cases,
                    COUNT(*) FILTER (
                      WHERE sc.status NOT IN ('resolved', 'closed')
                        AND sc.sla_resolution_deadline IS NOT NULL
                        AND sc.sla_resolution_deadline >= NOW()
                        AND sc.sla_resolution_deadline < NOW() + INTERVAL '4 hours'
                    )::int AS sla_at_risk,
                    ROUND(AVG(EXTRACT(EPOCH FROM (sc.sla_first_responded_at - sc.created_at)) / 3600.0)::numeric, 1) AS avg_first_response_h,
                    ROUND(AVG(EXTRACT(EPOCH FROM (sc.sla_resolved_at - sc.created_at)) / 3600.0)::numeric, 1) AS avg_resolution_h
               FROM support_cases sc
              WHERE sc.assigned_to_agent_id = sa.id
                AND sc.created_at >= NOW() - INTERVAL '30 days'
           ) stats ON TRUE
          ${whereClause}
          ORDER BY display_name ASC`,
        params
      );

      return res.json(rows.rows.map((row) => ({
        agent_id: row.agent_id,
        display_name: row.display_name,
        role: row.role,
        open_cases: toInt(row.open_cases, 0),
        sla_at_risk: toInt(row.sla_at_risk, 0),
        avg_first_response_h: toNumber(row.avg_first_response_h, null),
        avg_resolution_h: toNumber(row.avg_resolution_h, null),
        vendor_name: row.vendor_name || null
      })));
    } catch (err) {
      logger?.error?.({ err }, "support quality agents failed");
      return res.status(500).json({ error: "SERVER_ERROR", message: "Agent-Qualitätsdaten konnten nicht geladen werden." });
    }
  });

  router.get("/support/quality/sla", requireSupportFeature("quality_metrics"), async (req, res) => {
    try {
      const params = [];
      const scopeWhere = [];
      buildScope(req.supportAgent, "sc", params, scopeWhere);
      const scopeClause = scopeWhere.length > 0 ? `AND ${scopeWhere.join(" AND ")}` : "";

      const rows = await pool.query(
        `SELECT sq.id AS queue_id, sq.name AS queue_name, COALESCE(sq.type, 'general') AS type,
                COUNT(*) FILTER (WHERE sc.status NOT IN ('resolved', 'closed'))::int AS open,
                COUNT(*) FILTER (
                  WHERE sc.status NOT IN ('resolved', 'closed')
                    AND sc.sla_resolution_deadline IS NOT NULL
                    AND sc.sla_resolution_deadline >= NOW()
                    AND sc.sla_resolution_deadline < NOW() + INTERVAL '4 hours'
                )::int AS at_risk,
                COUNT(*) FILTER (
                  WHERE sc.status NOT IN ('resolved', 'closed')
                    AND sc.sla_resolution_deadline IS NOT NULL
                    AND sc.sla_resolution_deadline < NOW()
                )::int AS breached,
                ROUND(
                  CASE
                    WHEN COUNT(*) FILTER (
                      WHERE sc.status IN ('resolved', 'closed')
                        AND sc.sla_resolution_deadline IS NOT NULL
                    ) = 0 THEN NULL
                    ELSE 100.0 * COUNT(*) FILTER (
                      WHERE sc.status IN ('resolved', 'closed')
                        AND sc.sla_resolution_deadline IS NOT NULL
                        AND sc.sla_resolved_at <= sc.sla_resolution_deadline
                    ) / COUNT(*) FILTER (
                      WHERE sc.status IN ('resolved', 'closed')
                        AND sc.sla_resolution_deadline IS NOT NULL
                    )
                  END::numeric, 1
                ) AS sla_met_percent
           FROM support_queues sq
           LEFT JOIN support_cases sc ON sc.queue_id = sq.id
          WHERE sq.is_active = TRUE
            ${scopeClause}
          GROUP BY sq.id, sq.name, sq.type
          ORDER BY sq.name ASC`,
        params
      );

      return res.json(rows.rows.map((row) => ({
        queue_id: row.queue_id,
        queue_name: row.queue_name,
        type: row.type,
        open: toInt(row.open, 0),
        at_risk: toInt(row.at_risk, 0),
        breached: toInt(row.breached, 0),
        sla_met_percent: toNumber(row.sla_met_percent, null)
      })));
    } catch (err) {
      logger?.error?.({ err }, "support quality sla failed");
      return res.status(500).json({ error: "SERVER_ERROR", message: "SLA-Report konnte nicht geladen werden." });
    }
  });

  router.get("/support/audit", requireSupportFeature("audit_view"), async (req, res) => {
    try {
      const page = clampInt(req.query.page, 1, 100000, 1);
      const perPage = clampInt(req.query.per_page, 1, 200, 50);
      const offset = (page - 1) * perPage;
      const search = nullableText(req.query.search);
      const action = nullableText(req.query.action);

      const params = [];
      const where = [];

      if (search) {
        params.push(`%${search}%`);
        where.push(`(
          sc.case_number ILIKE $${params.length}
          OR COALESCE(actor_u.email, '') ILIKE $${params.length}
          OR COALESCE(actor_u.contact_person, '') ILIKE $${params.length}
        )`);
      }
      if (action) {
        params.push(action);
        where.push(`sal.action = $${params.length}`);
      }
      if (req.supportAgent.role === "internal_support_lead") {
        where.push("actor_sa.scope = 'internal'");
      }

      const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
      const totalRows = await pool.query(
        `SELECT COUNT(*)::int AS n
           FROM support_audit_log sal
           LEFT JOIN support_agents actor_sa ON actor_sa.id = sal.agent_id
           LEFT JOIN users actor_u ON actor_u.id = actor_sa.user_id
           LEFT JOIN support_cases sc ON sc.id = sal.case_id
          ${whereClause}`,
        params
      );
      const total = totalRows.rows[0]?.n || 0;

      const pageParams = params.concat([perPage + 1, offset]);
      const rows = await pool.query(
        `SELECT sal.id, sal.action, sal.reason, sal.created_at,
                COALESCE(sc.case_number, NULL) AS case_ref,
                COALESCE(NULLIF(actor_u.contact_person, ''), NULLIF(actor_u.company_name, ''), actor_u.email, 'System') AS actor_name
           FROM support_audit_log sal
           LEFT JOIN support_agents actor_sa ON actor_sa.id = sal.agent_id
           LEFT JOIN users actor_u ON actor_u.id = actor_sa.user_id
           LEFT JOIN support_cases sc ON sc.id = sal.case_id
          ${whereClause}
          ORDER BY sal.created_at DESC
          LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
        pageParams
      );

      const resultRows = rows.rows || [];
      const hasMore = resultRows.length > perPage;
      const pageRows = hasMore ? resultRows.slice(0, perPage) : resultRows;

      return res.json({
        items: pageRows.map((row) => ({
          id: row.id,
          action: row.action,
          actor_name: row.actor_name,
          case_ref: row.case_ref || null,
          detail: row.reason || null,
          created_at: toIso(row.created_at)
        })),
        total,
        page,
        per_page: perPage,
        has_more: hasMore
      });
    } catch (err) {
      logger?.error?.({ err }, "support audit list failed");
      return res.status(500).json({ error: "SERVER_ERROR", message: "Audit-Feed konnte nicht geladen werden." });
    }
  });

  router.get("/support/supervisor/overview", requireSupportFeature("supervisor_view"), async (req, res) => {
    if (!SUPERVISOR_ROLES.has(req.supportAgent.role)) {
      return res.status(403).json({ error: "PERMISSION_DENIED", message: "Supervisor-View nicht freigegeben." });
    }
    try {
      const params = [];
      const where = [];
      buildScope(req.supportAgent, "sc", params, where);
      const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

      const summaryRows = await pool.query(
        `SELECT
            COUNT(*) FILTER (WHERE sc.status NOT IN ('resolved', 'closed'))::int AS total_open,
            COUNT(*) FILTER (
              WHERE sc.status NOT IN ('resolved', 'closed')
                AND sc.sla_resolution_deadline IS NOT NULL
                AND sc.sla_resolution_deadline >= NOW()
                AND sc.sla_resolution_deadline < NOW() + INTERVAL '4 hours'
            )::int AS sla_at_risk,
            COUNT(*) FILTER (
              WHERE sc.status NOT IN ('resolved', 'closed')
                AND sc.sla_resolution_deadline IS NOT NULL
                AND sc.sla_resolution_deadline < NOW()
            )::int AS sla_breached
           FROM support_cases sc
          ${whereClause}`,
        params
      );
      const summary = summaryRows.rows[0] || {};

      const escalationRows = await pool.query(
        `SELECT COUNT(*)::int AS n
           FROM support_escalations se
           JOIN support_cases sc ON sc.id = se.case_id
          WHERE se.status IN ('pending', 'acknowledged')
            ${where.length > 0 ? `AND ${where.join(" AND ")}` : ""}`,
        params
      );
      const escalationsPending = escalationRows.rows[0]?.n || 0;

      const queueRows = await pool.query(
        `SELECT sq.id AS queue_id, sq.name AS queue_name, COALESCE(sq.type, 'general') AS type,
                COUNT(*) FILTER (WHERE sc.status NOT IN ('resolved', 'closed'))::int AS open_count,
                COUNT(*) FILTER (
                  WHERE sc.status NOT IN ('resolved', 'closed')
                    AND sc.sla_resolution_deadline IS NOT NULL
                    AND sc.sla_resolution_deadline >= NOW()
                    AND sc.sla_resolution_deadline < NOW() + INTERVAL '4 hours'
                )::int AS sla_at_risk,
                COUNT(*) FILTER (
                  WHERE sc.status NOT IN ('resolved', 'closed')
                    AND sc.sla_resolution_deadline IS NOT NULL
                    AND sc.sla_resolution_deadline < NOW()
                )::int AS sla_breached,
                COUNT(DISTINCT sc.assigned_to_agent_id)::int AS agents_active,
                ROUND(MAX(EXTRACT(EPOCH FROM (NOW() - sc.created_at)) / 3600.0)::numeric, 1) AS oldest_open_h
           FROM support_queues sq
           LEFT JOIN support_cases sc ON sc.queue_id = sq.id
          WHERE sq.is_active = TRUE
            ${where.length > 0 ? `AND ${where.join(" AND ")}` : ""}
          GROUP BY sq.id, sq.name, sq.type
          ORDER BY sq.name ASC`,
        params
      );

      return res.json({
        total_open: toInt(summary.total_open, 0),
        sla_at_risk: toInt(summary.sla_at_risk, 0),
        sla_breached: toInt(summary.sla_breached, 0),
        escalations_pending: toInt(escalationsPending, 0),
        queues: queueRows.rows.map((row) => ({
          queue_id: row.queue_id,
          queue_name: row.queue_name,
          type: row.type,
          open_count: toInt(row.open_count, 0),
          sla_at_risk: toInt(row.sla_at_risk, 0),
          sla_breached: toInt(row.sla_breached, 0),
          agents_active: toInt(row.agents_active, 0),
          oldest_open_h: toNumber(row.oldest_open_h, null)
        }))
      });
    } catch (err) {
      logger?.error?.({ err }, "support supervisor overview failed");
      return res.status(500).json({ error: "SERVER_ERROR", message: "Supervisor-Overview konnte nicht geladen werden." });
    }
  });

  router.get("/support/supervisor/agents", requireSupportFeature("supervisor_view"), async (req, res) => {
    if (!SUPERVISOR_ROLES.has(req.supportAgent.role)) {
      return res.status(403).json({ error: "PERMISSION_DENIED", message: "Supervisor-View nicht freigegeben." });
    }
    try {
      const params = [];
      const where = [ "sa.is_active = TRUE" ];
      if (req.supportAgent.role === "external_support_supervisor") {
        params.push(req.supportAgent.vendor_id || null);
        where.push(`sa.vendor_id = $${params.length}::uuid`);
      } else {
        where.push("sa.scope = 'internal'");
      }
      const rows = await pool.query(
        `SELECT sa.id AS agent_id, sa.role, sv.name AS vendor_name,
                COALESCE(NULLIF(u.contact_person, ''), NULLIF(u.company_name, ''), u.email) AS display_name,
                COALESCE(stats.open_cases, 0)::int AS open_cases,
                COALESCE(stats.sla_at_risk, 0)::int AS sla_at_risk,
                stats.avg_first_response_h,
                stats.avg_resolution_h
           FROM support_agents sa
           JOIN users u ON u.id = sa.user_id
           LEFT JOIN support_vendors sv ON sv.id = sa.vendor_id
           LEFT JOIN LATERAL (
             SELECT COUNT(*) FILTER (WHERE sc.status NOT IN ('resolved', 'closed'))::int AS open_cases,
                    COUNT(*) FILTER (
                      WHERE sc.status NOT IN ('resolved', 'closed')
                        AND sc.sla_resolution_deadline IS NOT NULL
                        AND sc.sla_resolution_deadline >= NOW()
                        AND sc.sla_resolution_deadline < NOW() + INTERVAL '4 hours'
                    )::int AS sla_at_risk,
                    ROUND(AVG(EXTRACT(EPOCH FROM (sc.sla_first_responded_at - sc.created_at)) / 3600.0)::numeric, 1) AS avg_first_response_h,
                    ROUND(AVG(EXTRACT(EPOCH FROM (sc.sla_resolved_at - sc.created_at)) / 3600.0)::numeric, 1) AS avg_resolution_h
               FROM support_cases sc
              WHERE sc.assigned_to_agent_id = sa.id
                AND sc.created_at >= NOW() - INTERVAL '30 days'
           ) stats ON TRUE
          WHERE ${where.join(" AND ")}
          ORDER BY display_name ASC`,
        params
      );
      return res.json(rows.rows.map((row) => ({
        agent_id: row.agent_id,
        display_name: row.display_name,
        role: row.role,
        open_cases: toInt(row.open_cases, 0),
        sla_at_risk: toInt(row.sla_at_risk, 0),
        avg_first_response_h: toNumber(row.avg_first_response_h, null),
        avg_resolution_h: toNumber(row.avg_resolution_h, null),
        vendor_name: row.vendor_name || null
      })));
    } catch (err) {
      logger?.error?.({ err }, "support supervisor agents failed");
      return res.status(500).json({ error: "SERVER_ERROR", message: "Supervisor-Agenten konnten nicht geladen werden." });
    }
  });

  router.post("/support/user-actions", requireSupportFeature("user_lookup"), async (req, res) => {
    const action = String(req.body?.action || "").trim().toLowerCase();
    const reason = nullableText(req.body?.reason);
    const userIdMasked = nullableText(req.body?.user_id_masked);

    if (![ "resend_verification", "resend_invite" ].includes(action)) {
      return res.status(400).json({ error: "INVALID_ACTION", message: "Action ist nicht erlaubt." });
    }
    if (!reason || reason.length < 10) {
      return res.status(400).json({ error: "REASON_REQUIRED", message: "reason mit mindestens 10 Zeichen ist erforderlich." });
    }
    if (!userIdMasked) {
      return res.status(400).json({ error: "USER_ID_REQUIRED", message: "user_id_masked ist erforderlich." });
    }

    try {
      const resolvedUserId = await resolveMaskedUserId(pool, userIdMasked);
      if (!resolvedUserId) {
        return res.status(404).json({ error: "USER_NOT_FOUND", message: "User konnte nicht aufgelöst werden." });
      }

      if (action === "resend_verification") {
        const result = await internalControlCenterService.resendVerificationForUser(
          pool,
          resolvedUserId,
          config.BASE_URL || "",
          sendMail
        );
        if (result.code === "NOT_FOUND") {
          return res.status(404).json({ error: "USER_NOT_FOUND", message: "User nicht gefunden." });
        }
      } else if (action === "resend_invite") {
        const userRows = await pool.query(
          `SELECT email
             FROM users
            WHERE id = $1::uuid
            LIMIT 1`,
          [resolvedUserId]
        );
        const targetEmail = userRows.rows[0]?.email || null;
        if (!targetEmail) {
          return res.status(404).json({ error: "USER_NOT_FOUND", message: "User nicht gefunden." });
        }
        await sendMail?.(
          targetEmail,
          "TempConnect Einladung",
          "<p>Ihre TempConnect-Einladung wurde erneut gesendet. Bitte melden Sie sich mit Ihrem bestehenden Zugang an.</p>"
        );
      }

      await insertSupportAudit(pool, {
        agent_id: req.supportAgent.id,
        case_id: null,
        action,
        reason,
        before_state: null,
        after_state: { user_id_masked: userIdMasked },
        ip_address: req.ip
      });

      return res.json({ success: true, action });
    } catch (err) {
      logger?.error?.({ err, action }, "support user action failed");
      return res.status(500).json({ error: "SERVER_ERROR", message: "User-Action konnte nicht ausgeführt werden." });
    }
  });

  return router;
}

export function createSupportRouter(deps) {
  return buildSupportRouter(deps);
}

