/**
 * staffAuditService.js - schreibt in `staff_control_audit_log`.
 * Separater Namespace vom Standard-`audit_log`.
 */

export async function writeStaffAudit(pool, entry) {
  const {
    actorId, area, action, entityType = null, entityId = null,
    status = "ok", reason = null, confirmed = false, riskLevel = "low",
    stepUpAt = null, ip = null, userAgent = null, details = {}
  } = entry || {};
  if (!actorId || !area || !action) throw new Error("staffAudit: actorId, area, action sind Pflicht");
  const { rows } = await pool.query(
    `INSERT INTO staff_control_audit_log
       (actor_id, area, action, entity_type, entity_id, status, reason,
        confirmed, risk_level, step_up_at, ip, user_agent, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id, created_at`,
    [actorId, area, action, entityType, entityId, status, reason, confirmed === true, riskLevel, stepUpAt, ip, userAgent, JSON.stringify(details || {})]
  );
  return rows[0];
}

export async function listStaffAudit(pool, opts = {}) {
  const {
    area, action, riskLevel,
    actorId, entityId, entityType,
    since, until,
    limit = 100, offset = 0
  } = opts;
  const conds = [];
  const params = [];
  if (area) { params.push(area); conds.push(`area = $${params.length}`); }
  if (action) { params.push(action); conds.push(`action = $${params.length}`); }
  if (riskLevel) { params.push(riskLevel); conds.push(`risk_level = $${params.length}`); }
  if (actorId) { params.push(actorId); conds.push(`actor_id = $${params.length}`); }
  if (entityId) { params.push(entityId); conds.push(`entity_id = $${params.length}`); }
  if (entityType) { params.push(entityType); conds.push(`entity_type = $${params.length}`); }
  if (since) { params.push(since); conds.push(`created_at >= $${params.length}`); }
  if (until) { params.push(until); conds.push(`created_at <= $${params.length}`); }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  params.push(Math.min(500, Math.max(1, Number(limit) || 100)));
  params.push(Math.max(0, Number(offset) || 0));
  const { rows } = await pool.query(
    `SELECT id, actor_id, created_at, area, action, entity_type, entity_id,
            status, reason, confirmed, risk_level, step_up_at, ip, details
     FROM staff_control_audit_log
     ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

export function auditContextFromReq(req) {
  const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return {
    ip: xff || req.ip || null,
    userAgent: String(req.headers["user-agent"] || "").slice(0, 500) || null,
    stepUpAt: req.session?.staffStepUpAt ? new Date(Number(req.session.staffStepUpAt)).toISOString() : null
  };
}
