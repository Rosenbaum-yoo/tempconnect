import { Router } from "express";
import { clampInt, safeQuery, safeScalar, tableExists, toIsoOrNull } from "./_helpers.js";
import { requireMfa } from "../../middleware/requireMfa.js";

const MIN_REASON_LENGTH = 10;

function validateMutationBody(body = {}) {
  if (body.confirmed !== true) {
    return { ok: false, code: "CONFIRM_REQUIRED", message: "confirmed muss true sein." };
  }
  const reason = String(body.reason || "").trim();
  if (reason.length < MIN_REASON_LENGTH) {
    return { ok: false, code: "REASON_TOO_SHORT", message: "reason muss mindestens 10 Zeichen haben." };
  }
  return { ok: true, reason };
}

function normalizeStepResults(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
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

async function insertAuditRow(pool, { actorId, entityId, details }) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details, action_type, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id`,
      [
        actorId || null,
        "owner_control.automation.trigger",
        "automation_job",
        entityId != null ? String(entityId) : null,
        JSON.stringify(details || {}),
        "CONFIG_CHANGE",
        "SUCCESS"
      ]
    );
    return rows?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

export function createOccAutomationRouter(deps) {
  const { pool } = deps;
  const router = Router();
  const mfaGuard = requireMfa({ pool, enforce: false });

  router.get("/automation/jobs", async (_req, res) => {
    const jobs = await safeQuery(
      pool,
      `SELECT id, name, description, category, trigger, schedule, status, risk_level, runbook_id,
              last_run_at, last_run_status, next_run_at, retry_on_failure, max_retries, requires_confirm
         FROM automation_jobs
        ORDER BY name ASC`,
      [],
      []
    );

    return res.json({
      success: true,
      data: {
        jobs: jobs.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description || null,
          category: row.category || "maintenance",
          trigger: row.trigger || "manual",
          schedule: row.schedule || null,
          status: row.status || "disabled",
          risk_level: row.risk_level || "low",
          runbook_id: row.runbook_id || null,
          last_run_at: toIsoOrNull(row.last_run_at),
          last_run_status: row.last_run_status || null,
          next_run_at: toIsoOrNull(row.next_run_at),
          retry_on_failure: row.retry_on_failure === true,
          max_retries: row.max_retries ?? 0,
          requires_confirm: row.requires_confirm === true
        }))
      },
      error: null
    });
  });

  router.post("/automation/trigger", mfaGuard, async (req, res) => {
    const validation = validateMutationBody(req.body || {});
    if (!validation.ok) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: validation.code, message: validation.message }
      });
    }

    const jobId = String(req.body?.job_id || "").trim();
    if (!jobId) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "JOB_ID_REQUIRED", message: "job_id ist erforderlich." }
      });
    }

    const jobsTable = await tableExists(pool, "automation_jobs");
    const executionsTable = await tableExists(pool, "warp_executions");
    if (!jobsTable || !executionsTable) {
      return res.status(500).json({
        success: false,
        data: null,
        error: { code: "AUTOMATION_NOT_AVAILABLE", message: "Automation-Module sind nicht verfügbar." }
      });
    }

    const rows = await safeQuery(
      pool,
      `SELECT aj.id, aj.name, aj.status, aj.risk_level, aj.runbook_id, wr.name AS runbook_name
         FROM automation_jobs aj
         LEFT JOIN warp_runbooks wr ON wr.id = aj.runbook_id
        WHERE aj.id = $1
        LIMIT 1`,
      [jobId],
      []
    );
    const job = rows[0];
    if (!job) {
      return res.status(404).json({
        success: false,
        data: null,
        error: { code: "JOB_NOT_FOUND", message: "Automation-Job nicht gefunden." }
      });
    }

    if (job.status === "disabled") {
      return res.status(409).json({
        success: false,
        data: null,
        error: { code: "JOB_DISABLED", message: "Automation-Job ist deaktiviert." }
      });
    }

    const actorId = req.occAccess?.user_id || null;
    const actorEmail = await safeScalar(
      pool,
      "SELECT email FROM users WHERE id = $1 LIMIT 1",
      [actorId],
      "email",
      "owner@tempconnect.local"
    );

    const auditId = await insertAuditRow(pool, {
      actorId,
      entityId: job.id,
      details: {
        job_id: job.id,
        job_name: job.name,
        reason: validation.reason,
        confirmed: true,
        risk_level: job.risk_level || "low"
      }
    });

    const executionRows = await safeQuery(
      pool,
      `INSERT INTO warp_executions (
         runbook_id, runbook_name, actor_id, actor_email, host_name, status,
         dry_run, trigger_source, reason, risk_level, started_at, step_results, audit_id
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),$11,$12)
       RETURNING id, status`,
      [
        job.runbook_id || null,
        job.runbook_name || job.name,
        actorId,
        actorEmail,
        null,
        "started",
        false,
        "automation",
        validation.reason,
        job.risk_level || "low",
        JSON.stringify([{ step: 0, name: "Automation Trigger", status: "started", output: "Queued" }]),
        auditId
      ],
      []
    );

    if (!executionRows[0]) {
      return res.status(500).json({
        success: false,
        data: null,
        error: { code: "TRIGGER_FAILED", message: "Automation-Trigger konnte nicht gestartet werden." }
      });
    }

    await safeQuery(
      pool,
      `UPDATE automation_jobs
          SET last_run_at = NOW(),
              last_run_status = 'started',
              updated_at = NOW()
        WHERE id = $1`,
      [job.id],
      []
    );

    return res.json({
      success: true,
      data: {
        execution_id: executionRows[0].id,
        status: executionRows[0].status || "started",
        audit_id: auditId != null ? String(auditId) : null
      },
      error: null
    });
  });

  router.get("/automation/history", async (req, res) => {
    const page = clampInt(req.query.page, 1, 100000, 1);
    const perPage = clampInt(req.query.per_page, 1, 200, 30);
    const offset = (page - 1) * perPage;

    const items = await safeQuery(
      pool,
      `SELECT id, runbook_id, runbook_name, actor_id, actor_email, host_name, status, dry_run,
              reason, risk_level, started_at, finished_at, duration_ms, step_results,
              audit_id, incident_id, deployment_id, error
         FROM warp_executions
        WHERE trigger_source = 'automation'
        ORDER BY started_at DESC
        LIMIT $1 OFFSET $2`,
      [perPage + 1, offset],
      []
    );
    const total = Number(
      await safeScalar(
        pool,
        "SELECT COUNT(*)::int AS n FROM warp_executions WHERE trigger_source = 'automation'",
        [],
        "n",
        0
      ) || 0
    );
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
          risk_level: row.risk_level || "low",
          started_at: toIsoOrNull(row.started_at),
          finished_at: toIsoOrNull(row.finished_at),
          duration_ms: row.duration_ms ?? null,
          step_results: normalizeStepResults(row.step_results),
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

  router.get("/automation/schedules", async (_req, res) => {
    const rows = await safeQuery(
      pool,
      `SELECT id, name, schedule, next_run_at, status, risk_level
         FROM automation_jobs
        WHERE schedule IS NOT NULL
        ORDER BY next_run_at ASC NULLS LAST, name ASC`,
      [],
      []
    );

    return res.json({
      success: true,
      data: {
        schedules: rows.map((row) => ({
          id: row.id,
          name: row.name,
          cron: row.schedule,
          next_run: toIsoOrNull(row.next_run_at),
          enabled: row.status === "enabled" || row.status === "running",
          job_id: row.id,
          risk_level: row.risk_level || "low"
        }))
      },
      error: null
    });
  });

  return router;
}
