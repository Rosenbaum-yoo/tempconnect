import { spawn } from "node:child_process";
import { access, constants as fsConstants } from "node:fs/promises";

const SAFE_HOST_PATTERN = /^[a-zA-Z0-9._-]+$/;
const SAFE_USER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
const SAFE_PATH_PATTERN = /^[a-zA-Z0-9._/-]+$/;
const SAFE_ACTION_PATTERN = /^[a-zA-Z0-9._-]+$/;
const SAFE_STRICT_HOST_VALUE = new Set(["yes", "no", "accept-new"]);
const OUTPUT_LIMIT_BYTES = 16 * 1024;

const DEFAULT_ACTION_COMMANDS = Object.freeze({
  deploy: "cd {{APP_DIR}} && if [ -x ./scripts/prod-update.sh ]; then ./scripts/prod-update.sh; else docker compose pull api && docker compose up -d --build api; fi",
  restart_service: "cd {{APP_DIR}} && docker compose restart api && docker compose ps api",
  backup_trigger: "cd {{APP_DIR}} && if [ -x ./scripts/backup.sh ]; then ./scripts/backup.sh --db-only; else echo 'backup script missing' >&2; exit 12; fi",
  health_check: "cd {{APP_DIR}} && docker compose ps && curl -fsS '{{HEALTH_URL}}' >/dev/null"
});

function toBool(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function toInt(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function trimToLimitUtf8(value, limitBytes) {
  const text = String(value || "");
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= limitBytes) return { text, truncated: false };
  let out = text;
  while (Buffer.byteLength(out, "utf8") > limitBytes && out.length > 0) {
    out = out.slice(0, -1);
  }
  return { text: out, truncated: true };
}

function inferActionKeyFromRunbookName(name) {
  const normalized = String(name || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("deploy")) return "deploy";
  if (normalized.includes("restart")) return "restart_service";
  if (normalized.includes("backup")) return "backup_trigger";
  if (normalized.includes("health") || normalized.includes("check")) return "health_check";
  return null;
}

function normalizeStepLabel(rawStep, fallback) {
  const label = String(rawStep?.label || rawStep?.name || fallback || "").trim();
  return label || fallback || "step";
}

function normalizeExecutionPlan(runbook, fallbackActionKey) {
  const rawSteps = Array.isArray(runbook?.steps) ? runbook.steps : [];
  const plan = [];

  for (const rawStep of rawSteps) {
    if (!rawStep || typeof rawStep !== "object") continue;
    const stepType = String(rawStep.type || "").trim().toLowerCase();
    if (stepType === "wait") {
      plan.push({
        type: "wait",
        ms: toInt(rawStep.ms, 0, 60000, 0),
        label: normalizeStepLabel(rawStep, "wait")
      });
      continue;
    }
    const actionKeyRaw = String(rawStep.action_key || rawStep.command_key || rawStep.key || "").trim();
    if (!actionKeyRaw || !SAFE_ACTION_PATTERN.test(actionKeyRaw)) continue;
    plan.push({
      type: "action",
      actionKey: actionKeyRaw.toLowerCase(),
      label: normalizeStepLabel(rawStep, actionKeyRaw.toLowerCase())
    });
  }

  const fallbackKey = String(fallbackActionKey || "").trim().toLowerCase();
  if (!plan.length && fallbackKey && SAFE_ACTION_PATTERN.test(fallbackKey)) {
    plan.push({ type: "action", actionKey: fallbackKey, label: fallbackKey });
  }
  if (!plan.length) {
    const inferred = inferActionKeyFromRunbookName(runbook?.name);
    if (inferred) {
      plan.push({ type: "action", actionKey: inferred, label: inferred });
    }
  }
  return plan;
}

function resolveSshConfig(config = {}) {
  const sshEnabled = toBool(config.WARP_SSH_ENABLED ?? process.env.WARP_SSH_ENABLED, false);
  const sshUser = String(config.WARP_SSH_USER ?? process.env.WARP_SSH_USER ?? "deploy").trim();
  const sshPort = toInt(config.WARP_SSH_PORT ?? process.env.WARP_SSH_PORT, 1, 65535, 22);
  const sshKeyPath = String(config.WARP_SSH_KEY_PATH ?? process.env.WARP_SSH_KEY_PATH ?? "").trim();
  const connectTimeoutMs = toInt(
    config.WARP_SSH_CONNECT_TIMEOUT_MS ?? process.env.WARP_SSH_CONNECT_TIMEOUT_MS,
    1000,
    120000,
    15000
  );
  const commandTimeoutMs = toInt(
    config.WARP_SSH_COMMAND_TIMEOUT_MS ?? process.env.WARP_SSH_COMMAND_TIMEOUT_MS,
    1000,
    600000,
    120000
  );
  const strictHostKeyChecking = String(
    config.WARP_SSH_STRICT_HOST_KEY_CHECKING ?? process.env.WARP_SSH_STRICT_HOST_KEY_CHECKING ?? "accept-new"
  ).trim().toLowerCase();
  const appDir = String(config.WARP_REMOTE_APP_DIR ?? process.env.WARP_REMOTE_APP_DIR ?? "/opt/tempconnect").trim();
  const healthUrl = String(
    config.WARP_REMOTE_HEALTH_URL ?? process.env.WARP_REMOTE_HEALTH_URL ?? "http://127.0.0.1:8080/health"
  ).trim();

  return {
    sshEnabled,
    sshUser,
    sshPort,
    sshKeyPath,
    connectTimeoutMs,
    commandTimeoutMs,
    strictHostKeyChecking,
    appDir,
    healthUrl
  };
}

async function validateSshConfig(sshConfig) {
  if (!sshConfig.sshEnabled) {
    return { ok: false, code: "WARP_SSH_DISABLED", message: "SSH-Ausführung ist deaktiviert (WARP_SSH_ENABLED=false)." };
  }
  if (!SAFE_USER_PATTERN.test(sshConfig.sshUser)) {
    return { ok: false, code: "WARP_SSH_INVALID_USER", message: "WARP_SSH_USER ist ungültig." };
  }
  if (!SAFE_PATH_PATTERN.test(sshConfig.appDir)) {
    return { ok: false, code: "WARP_SSH_INVALID_APP_DIR", message: "WARP_REMOTE_APP_DIR enthält ungültige Zeichen." };
  }
  if (!/^https?:\/\/[a-zA-Z0-9._:/-]+$/.test(sshConfig.healthUrl)) {
    return { ok: false, code: "WARP_SSH_INVALID_HEALTH_URL", message: "WARP_REMOTE_HEALTH_URL ist ungültig." };
  }
  if (!SAFE_STRICT_HOST_VALUE.has(sshConfig.strictHostKeyChecking)) {
    return {
      ok: false,
      code: "WARP_SSH_INVALID_STRICT_HOST",
      message: "WARP_SSH_STRICT_HOST_KEY_CHECKING muss yes/no/accept-new sein."
    };
  }
  if (sshConfig.sshKeyPath) {
    try {
      await access(sshConfig.sshKeyPath, fsConstants.R_OK);
    } catch {
      return { ok: false, code: "WARP_SSH_KEY_UNREADABLE", message: "WARP_SSH_KEY_PATH ist nicht lesbar." };
    }
  }
  return { ok: true };
}

function buildCommandForAction(actionKey, sshConfig) {
  const template = DEFAULT_ACTION_COMMANDS[actionKey];
  if (!template) return null;
  return template
    .replaceAll("{{APP_DIR}}", sshConfig.appDir)
    .replaceAll("{{HEALTH_URL}}", sshConfig.healthUrl);
}

function runSshCommand({ host, command, sshConfig }) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const args = [];
    if (sshConfig.sshKeyPath) {
      args.push("-i", sshConfig.sshKeyPath);
    }
    args.push(
      "-p", String(sshConfig.sshPort),
      "-o", "BatchMode=yes",
      "-o", `StrictHostKeyChecking=${sshConfig.strictHostKeyChecking}`,
      "-o", `ConnectTimeout=${Math.max(1, Math.ceil(sshConfig.connectTimeoutMs / 1000))}`,
      `${sshConfig.sshUser}@${host}`,
      command
    );

    const child = spawn("ssh", args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // noop
      }
    }, sshConfig.commandTimeoutMs);

    child.stdout.on("data", (chunk) => {
      if (stdoutTruncated) return;
      const merged = stdout + chunk.toString("utf8");
      const trimmed = trimToLimitUtf8(merged, OUTPUT_LIMIT_BYTES);
      stdout = trimmed.text;
      stdoutTruncated = trimmed.truncated;
    });

    child.stderr.on("data", (chunk) => {
      if (stderrTruncated) return;
      const merged = stderr + chunk.toString("utf8");
      const trimmed = trimToLimitUtf8(merged, OUTPUT_LIMIT_BYTES);
      stderr = trimmed.text;
      stderrTruncated = trimmed.truncated;
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      resolve({
        ok: false,
        exitCode: null,
        stdout,
        stderr: stderr || String(err?.message || err),
        durationMs: Date.now() - startedAt,
        timedOut,
        stdoutTruncated,
        stderrTruncated
      });
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        ok: code === 0 && !timedOut,
        exitCode: Number.isFinite(code) ? code : null,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut,
        stdoutTruncated,
        stderrTruncated
      });
    });
  });
}

async function markExecutionRunning(pool, executionId) {
  await pool.query(
    `UPDATE warp_executions
        SET status = 'running'
      WHERE id = $1
        AND status = 'started'`,
    [executionId]
  ).catch(() => undefined);
}

async function finalizeExecution(pool, { executionId, status, stepResults, error }) {
  await pool.query(
    `UPDATE warp_executions
        SET status = $2,
            finished_at = NOW(),
            duration_ms = (EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000)::int,
            step_results = $3,
            error = $4
      WHERE id = $1`,
    [executionId, status, JSON.stringify(stepResults || []), error || null]
  ).catch(() => undefined);
}

async function updateRunbookStatus(pool, runbookId, status) {
  if (!runbookId) return;
  await pool.query(
    `UPDATE warp_runbooks
        SET last_executed_at = NOW(),
            last_status = $2,
            updated_at = NOW()
      WHERE id = $1`,
    [runbookId, status]
  ).catch(() => undefined);
}

async function loadHostRecord(pool, hostName) {
  if (!hostName) return null;
  try {
    const { rows } = await pool.query(
      `SELECT name, ip, ssh_ready, allowed_actions
         FROM warp_hosts
        WHERE name = $1
        LIMIT 1`,
      [hostName]
    );
    return rows?.[0] || null;
  } catch {
    return null;
  }
}

async function updateHostUsage(pool, { hostName, actorEmail, error }) {
  if (!hostName) return;
  await pool.query(
    `UPDATE warp_hosts
        SET last_used_at = NOW(),
            last_used_by = $2,
            last_error = $3,
            updated_at = NOW()
      WHERE name = $1`,
    [hostName, actorEmail || null, error || null]
  ).catch(() => undefined);
}

function isActionAllowedOnHost(hostRecord, actionKey) {
  const hostAllowed = Array.isArray(hostRecord?.allowed_actions) ? hostRecord.allowed_actions : [];
  if (!hostAllowed.length) return true;
  return hostAllowed.includes(actionKey);
}

async function runExecution({ pool, logger, executionId, runbook, hostName, actorEmail, dryRun, fallbackActionKey, config }) {
  const stepResults = [];
  let finalStatus = dryRun ? "dry_run" : "failed";
  let finalError = null;

  const plan = normalizeExecutionPlan(runbook, fallbackActionKey);
  if (!plan.length) {
    finalError = "Keine ausführbaren Runbook-Schritte gefunden.";
    await finalizeExecution(pool, { executionId, status: "failed", stepResults, error: finalError });
    await updateRunbookStatus(pool, runbook?.id, "failed");
    await updateHostUsage(pool, { hostName, actorEmail, error: finalError });
    return;
  }

  const sshConfig = resolveSshConfig(config);
  const sshValidation = dryRun ? { ok: true } : await validateSshConfig(sshConfig);
  if (!sshValidation.ok) {
    finalError = sshValidation.message;
    await finalizeExecution(pool, { executionId, status: "failed", stepResults, error: finalError });
    await updateRunbookStatus(pool, runbook?.id, "failed");
    await updateHostUsage(pool, { hostName, actorEmail, error: finalError });
    return;
  }

  const hostRecord = await loadHostRecord(pool, hostName);
  if (!dryRun && !hostRecord) {
    finalError = "Zielhost ist nicht in warp_hosts registriert.";
    await finalizeExecution(pool, { executionId, status: "failed", stepResults, error: finalError });
    await updateRunbookStatus(pool, runbook?.id, "failed");
    await updateHostUsage(pool, { hostName, actorEmail, error: finalError });
    return;
  }

  const hostAddressRaw = hostRecord?.ip || hostRecord?.name || hostName;
  const hostAddress = String(hostAddressRaw || "").trim();
  const hasValidHostAddress = Boolean(hostAddress && SAFE_HOST_PATTERN.test(hostAddress));
  const executionHostLabel = hostName || (hasValidHostAddress ? hostAddress : null) || "unassigned-host";
  if (!hasValidHostAddress && !dryRun) {
    finalError = "Zielhost ist ungültig oder nicht konfiguriert.";
    await finalizeExecution(pool, { executionId, status: "failed", stepResults, error: finalError });
    await updateRunbookStatus(pool, runbook?.id, "failed");
    await updateHostUsage(pool, { hostName, actorEmail, error: finalError });
    return;
  }
  if (!dryRun && hostRecord && hostRecord.ssh_ready !== true) {
    finalError = "Zielhost ist nicht SSH-ready (warp_hosts.ssh_ready=false).";
    await finalizeExecution(pool, { executionId, status: "failed", stepResults, error: finalError });
    await updateRunbookStatus(pool, runbook?.id, "failed");
    await updateHostUsage(pool, { hostName, actorEmail, error: finalError });
    return;
  }

  if (!dryRun) {
    await markExecutionRunning(pool, executionId);
  }

  for (let i = 0; i < plan.length; i += 1) {
    const step = plan[i];
    const entry = {
      step: i + 1,
      name: step.label,
      type: step.type,
      status: "success",
      host: executionHostLabel,
      at: new Date().toISOString()
    };

    if (step.type === "wait") {
      if (dryRun) {
        entry.status = "skipped_dry_run";
        entry.output = `would_wait_ms:${step.ms}`;
      } else {
        await new Promise((resolve) => setTimeout(resolve, step.ms));
        entry.output = `waited_ms:${step.ms}`;
      }
      stepResults.push(entry);
      continue;
    }

    if (!isActionAllowedOnHost(hostRecord, step.actionKey)) {
      entry.status = "failed";
      entry.action_key = step.actionKey;
      entry.error = "ACTION_NOT_ALLOWED_ON_HOST";
      stepResults.push(entry);
      finalError = `Action '${step.actionKey}' ist auf Host '${executionHostLabel}' nicht freigegeben.`;
      break;
    }

    const command = buildCommandForAction(step.actionKey, sshConfig);
    if (!command) {
      entry.status = "failed";
      entry.action_key = step.actionKey;
      entry.error = "ACTION_NOT_IMPLEMENTED";
      stepResults.push(entry);
      finalError = `Action '${step.actionKey}' ist nicht implementiert.`;
      break;
    }

    entry.action_key = step.actionKey;
    entry.command = command;

    if (dryRun) {
      entry.status = "skipped_dry_run";
      entry.output = "dry-run planned only";
      stepResults.push(entry);
      continue;
    }

    const sshResult = await runSshCommand({ host: hostAddress, command, sshConfig });
    entry.duration_ms = sshResult.durationMs;
    entry.exit_code = sshResult.exitCode;
    if (sshResult.stdout) entry.stdout = sshResult.stdout;
    if (sshResult.stderr) entry.stderr = sshResult.stderr;
    if (sshResult.stdoutTruncated) entry.stdout_truncated = true;
    if (sshResult.stderrTruncated) entry.stderr_truncated = true;
    if (sshResult.timedOut) entry.timed_out = true;
    if (!sshResult.ok) {
      entry.status = "failed";
      entry.error = sshResult.timedOut ? "SSH_TIMEOUT" : "SSH_COMMAND_FAILED";
      stepResults.push(entry);
      finalError = sshResult.timedOut
        ? `Action '${step.actionKey}' timed out.`
        : `Action '${step.actionKey}' failed with exit code ${sshResult.exitCode}.`;
      break;
    }
    stepResults.push(entry);
  }

  if (!finalError) {
    finalStatus = dryRun ? "dry_run" : "success";
  } else {
    finalStatus = "failed";
  }

  await finalizeExecution(pool, { executionId, status: finalStatus, stepResults, error: finalError });
  await updateRunbookStatus(pool, runbook?.id, finalStatus);
  await updateHostUsage(pool, { hostName, actorEmail, error: finalError });
  if (logger) {
    logger.info(
      {
        executionId,
        runbookId: runbook?.id || null,
        runbookName: runbook?.name || null,
        hostName: hostName || null,
        finalStatus,
        stepCount: stepResults.length,
        error: finalError || null
      },
      "warp_execution_completed"
    );
  }
}

export function startWarpExecutionBackground(params) {
  setImmediate(async () => {
    try {
      await runExecution(params);
    } catch (err) {
      const { pool, logger, executionId, runbook, hostName, actorEmail } = params;
      const fallbackError = String(err?.message || err || "Warp execution failed");
      await finalizeExecution(pool, { executionId, status: "failed", stepResults: [], error: fallbackError });
      await updateRunbookStatus(pool, runbook?.id, "failed");
      await updateHostUsage(pool, { hostName, actorEmail, error: fallbackError });
      if (logger) {
        logger.error(
          { err, executionId, runbookId: runbook?.id || null, hostName: hostName || null },
          "warp_execution_background_failed"
        );
      }
    }
  });
}
