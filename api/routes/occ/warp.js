import { Router } from "express";
import { clampInt, safeQuery, safeScalar, tableExists, toIsoOrNull } from "./_helpers.js";
import { startWarpExecutionBackground } from "../../services/warpExecutionService.js";
import { requireMfa } from "../../middleware/requireMfa.js";

const MIN_REASON_LENGTH = 10;

const COMMAND_REGISTRY = Object.freeze([
  {
    key: "deploy",
    label: "Deployment starten",
    risk_level: "high",
    requires_confirm: true,
    requires_reason: true,
    target_hosts: ["prod-hetzner-01"],
    forbidden: false
  },
  {
    key: "restart_service",
    label: "Service neu starten",
    risk_level: "medium",
    requires_confirm: true,
    requires_reason: true,
    target_hosts: ["prod-hetzner-01"],
    forbidden: false
  },
  {
    key: "backup_trigger",
    label: "Backup manuell triggern",
    risk_level: "medium",
    requires_confirm: true,
    requires_reason: true,
    target_hosts: ["prod-hetzner-01"],
    forbidden: false
  },
  {
    key: "health_check",
    label: "Health Check ausführen",
    risk_level: "low",
    requires_confirm: false,
    requires_reason: false,
    target_hosts: ["prod-hetzner-01"],
    forbidden: false
  },
  {
    key: "raw_shell",
    label: "Freie Shell-Eingabe",
    risk_level: "critical",
    requires_confirm: false,
    requires_reason: false,
    target_hosts: [],
    forbidden: true
  }
]);

function validateConfirmAndReason(body = {}) {
  if (body.confirmed !== true) {
    return { ok: false, code: "CONFIRM_REQUIRED", message: "confirmed muss true sein." };
  }
  const reason = String(body.reason || "").trim();
  if (reason.length < MIN_REASON_LENGTH) {
    return { ok: false, code: "REASON_TOO_SHORT", message: "reason muss mindestens 10 Zeichen haben." };
  }
  return { ok: true, reason };
}

async function insertAuditRow(pool, { action, actorId, entityType, entityId, details }) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details, action_type, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id`,
      [
        actorId || null,
        action,
        entityType,
        entityId != null ? String(entityId) : null,
        details ? JSON.stringify(details) : null,
        "CONFIG_CHANGE",
        "SUCCESS"
      ]
    );
    return rows?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

function getActorEmail(pool, actorId) {
  return safeScalar(pool, "SELECT email FROM users WHERE id = $1 LIMIT 1", [actorId], "email", "owner@tempconnect.local");
}

async function startExecution(pool, payload) {
  const { rows } = await pool.query(
    `INSERT INTO warp_executions (
       runbook_id, runbook_name, actor_id, actor_email, host_name, status,
       dry_run, trigger_source, reason, risk_level, started_at, step_results,
       audit_id, deployment_id, incident_id, error
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),$11,$12,$13,$14,$15)
     RETURNING id, status`,
    [
      payload.runbookId || null,
      payload.runbookName,
      payload.actorId || null,
      payload.actorEmail,
      payload.hostName || null,
      payload.status,
      payload.dryRun === true,
      payload.triggerSource || "manual",
      payload.reason,
      payload.riskLevel || "medium",
      JSON.stringify(payload.stepResults || []),
      payload.auditId || null,
      payload.deploymentId || null,
      payload.incidentId || null,
      payload.error || null
    ]
  );
  return rows?.[0] || null;
}

export function createOccWarpRouter(deps) {
  const { pool, logger, config } = deps;
  const router = Router();
  const warpExecutionRateLimit = deps.warpExecutionRateLimit || ((_req, _res, next) => next());
  const mfaGuard = requireMfa({ pool }); // MFA env-gesteuert (O-05): Default Audit-Only, scharf via MFA_ENFORCE

  router.get("/warp/hosts", async (_req, res) => {
    const hosts = await safeQuery(
      pool,
      `SELECT id, name, role, env, status, ip, ssh_ready, allowed_actions,
              last_used_at, last_used_by, connection_notes
         FROM warp_hosts
        ORDER BY name ASC`,
      [],
      []
    );

    return res.json({
      success: true,
      data: {
        hosts: hosts.map((row) => ({
          id: row.id,
          name: row.name,
          role: row.role || "primary",
          env: row.env || "production",
          status: row.status || "unknown",
          ssh_ready: row.ssh_ready === true,
          allowed_actions: Array.isArray(row.allowed_actions) ? row.allowed_actions : [],
          last_used_at: toIsoOrNull(row.last_used_at),
          last_used_by: row.last_used_by || null,
          connection_notes: row.connection_notes || null
        }))
      },
      error: null
    });
  });

  router.get("/warp/runbooks", async (_req, res) => {
    const runbooks = await safeQuery(
      pool,
      `SELECT id, name, description, category, risk_level, requires_confirm, requires_reason,
              target_hosts, steps, preconditions, estimated_duration_s, last_executed_at, last_status
         FROM warp_runbooks
        WHERE COALESCE(is_enabled, TRUE) = TRUE
        ORDER BY name ASC`,
      [],
      []
    );

    return res.json({
      success: true,
      data: {
        runbooks: runbooks.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description || null,
          category: row.category || "maintenance",
          risk_level: row.risk_level || "medium",
          requires_confirm: row.requires_confirm !== false,
          requires_reason: row.requires_reason !== false,
          target_hosts: Array.isArray(row.target_hosts) ? row.target_hosts : [],
          steps: Array.isArray(row.steps) ? row.steps : [],
          preconditions: Array.isArray(row.preconditions) ? row.preconditions : [],
          estimated_duration_s: row.estimated_duration_s ?? null,
          last_executed_at: toIsoOrNull(row.last_executed_at),
          last_status: row.last_status || null
        }))
      },
      error: null
    });
  });

  async function handleExecution(req, res, dryRun) {
    const validation = validateConfirmAndReason(req.body || {});
    if (!validation.ok) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: validation.code, message: validation.message }
      });
    }

    const runbookId = String(req.body?.runbook_id || "").trim();
    if (!runbookId) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "RUNBOOK_ID_REQUIRED", message: "runbook_id ist erforderlich." }
      });
    }

    const runbooksTable = await tableExists(pool, "warp_runbooks");
    if (!runbooksTable) {
      return res.status(404).json({
        success: false,
        data: null,
        error: { code: "RUNBOOKS_NOT_AVAILABLE", message: "Runbook-Registry ist nicht verfügbar." }
      });
    }

    const runbookRows = await safeQuery(
      pool,
      `SELECT id, name, risk_level, target_hosts, steps
         FROM warp_runbooks
        WHERE id = $1
        LIMIT 1`,
      [runbookId],
      []
    );
    const runbook = runbookRows[0];
    if (!runbook) {
      return res.status(404).json({
        success: false,
        data: null,
        error: { code: "RUNBOOK_NOT_FOUND", message: "Runbook wurde nicht gefunden." }
      });
    }

    const actorId = req.occAccess?.user_id || null;
    const actorEmail = await getActorEmail(pool, actorId);
    const requestedHost = String(req.body?.host_name || "").trim();
    const hostName = requestedHost || (Array.isArray(runbook.target_hosts) ? (runbook.target_hosts[0] || null) : null);
    const commandKey = String(req.body?.command_key || "").trim().toLowerCase() || null;
    const auditAction = dryRun ? "owner_control.warp.dry_run" : "owner_control.warp.execute";

    const auditId = await insertAuditRow(pool, {
      action: auditAction,
      actorId,
      entityType: "warp_runbook",
      entityId: runbookId,
      details: {
        runbook_id: runbookId,
        runbook_name: runbook.name,
        reason: validation.reason,
        command_key: commandKey,
        dry_run: dryRun,
        risk_level: runbook.risk_level || "medium"
      }
    });

    const executionsTable = await tableExists(pool, "warp_executions");
    if (!executionsTable) {
      return res.status(500).json({
        success: false,
        data: null,
        error: { code: "EXECUTIONS_NOT_AVAILABLE", message: "Execution-Tracking ist nicht verfügbar." }
      });
    }

    const execution = await startExecution(pool, {
      runbookId: runbook.id,
      runbookName: runbook.name,
      actorId,
      actorEmail,
      hostName,
      status: "started",
      dryRun,
      triggerSource: "manual",
      reason: validation.reason,
      riskLevel: runbook.risk_level || "medium",
      stepResults: [],
      auditId
    });
    if (!execution?.id) {
      return res.status(500).json({
        success: false,
        data: null,
        error: { code: "EXECUTION_CREATE_FAILED", message: "Ausführung konnte nicht angelegt werden." }
      });
    }

    startWarpExecutionBackground({
      pool,
      logger,
      config,
      executionId: execution.id,
      runbook,
      hostName,
      actorEmail,
      dryRun,
      fallbackActionKey: commandKey
    });

    return res.json({
      success: true,
      data: {
        execution_id: execution.id,
        status: execution.status || "started",
        runbook_name: runbook.name,
        host_name: hostName || null,
        command_key: commandKey,
        audit_id: auditId != null ? String(auditId) : null
      },
      error: null
    });
  }

  router.post("/warp/execute", warpExecutionRateLimit, mfaGuard, (req, res) => handleExecution(req, res, false));
  router.post("/warp/dry-run", warpExecutionRateLimit, mfaGuard, (req, res) => handleExecution(req, res, true));

  router.get("/warp/history", async (req, res) => {
    const page = clampInt(req.query.page, 1, 100000, 1);
    const perPage = clampInt(req.query.per_page, 1, 200, 30);
    const offset = (page - 1) * perPage;

    const items = await safeQuery(
      pool,
      `SELECT id, runbook_id, runbook_name, actor_id, actor_email, host_name, status, dry_run,
              reason, risk_level, started_at, finished_at, duration_ms, step_results,
              audit_id, incident_id, deployment_id, error
         FROM warp_executions
        ORDER BY started_at DESC
        LIMIT $1 OFFSET $2`,
      [perPage + 1, offset],
      []
    );
    const total = Number(await safeScalar(pool, "SELECT COUNT(*)::int AS n FROM warp_executions", [], "n", 0) || 0);
    const hasMore = items.length > perPage;
    const pageItems = hasMore ? items.slice(0, perPage) : items;

    return res.json({
      success: true,
      data: {
        items: pageItems.map((row) => ({
          id: row.id,
          runbook_id: row.runbook_id || null,
          runbook_name: row.runbook_name || null,
          actor_id: row.actor_id || null,
          actor_email: row.actor_email || null,
          host_name: row.host_name || null,
          status: row.status || "unknown",
          dry_run: row.dry_run === true,
          reason: row.reason || null,
          risk_level: row.risk_level || "medium",
          started_at: toIsoOrNull(row.started_at),
          finished_at: toIsoOrNull(row.finished_at),
          duration_ms: row.duration_ms ?? null,
          step_results: Array.isArray(row.step_results) ? row.step_results : [],
          audit_id: row.audit_id != null ? String(row.audit_id) : null,
          incident_id: row.incident_id || null,
          deployment_id: row.deployment_id || null,
          error: row.error || null
        })),
        total,
        has_more: hasMore
      },
      error: null
    });
  });

  router.get("/warp/command-registry", (_req, res) => {
    return res.json({
      success: true,
      data: { allowed_commands: COMMAND_REGISTRY.map((item) => ({ ...item })) },
      error: null
    });
  });

  return router;
}
