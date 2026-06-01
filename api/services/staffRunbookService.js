/**
 * staffRunbookService.js - Deklarative Runbooks (JSON-Steps), keine
 * ausfuehrbaren Code-Snippets. Step-Type-Whitelist:
 *   check | hetzner | feature_flag | notify | wait
 * KEIN exec/shell/eval.
 */

import * as hetzner from "./staffHetznerService.js";

const STEP_TYPE_WHITELIST = new Set(["check", "hetzner", "feature_flag", "notify", "wait"]);

export async function listRunbooks(pool) {
  const { rows } = await pool.query(
    `SELECT id, key, name, description, version, risk_level, is_enabled, requires_confirm,
            created_at, updated_at
       FROM staff_control_runbooks WHERE is_enabled = TRUE ORDER BY key ASC`
  );
  return rows;
}

export async function getRunbook(pool, key) {
  const { rows } = await pool.query("SELECT * FROM staff_control_runbooks WHERE key = $1", [key]);
  return rows[0] || null;
}

function validateRunbook(runbook) {
  if (!runbook || !Array.isArray(runbook.steps)) return { ok: false, reason: "NO_STEPS" };
  for (const step of runbook.steps) {
    if (!step || typeof step !== "object" || !STEP_TYPE_WHITELIST.has(step.type)) {
      return { ok: false, reason: "INVALID_STEP_TYPE", step };
    }
  }
  return { ok: true };
}

export async function executeRunbook(pool, { runbookKey, actorId, reason, confirmed, dryRun = false }) {
  const runbook = await getRunbook(pool, runbookKey);
  if (!runbook) return { error: "RUNBOOK_NOT_FOUND" };
  if (runbook.is_enabled === false) return { error: "RUNBOOK_DISABLED" };
  if (runbook.requires_confirm && confirmed !== true) return { error: "CONFIRM_REQUIRED" };

  const valid = validateRunbook(runbook);
  if (!valid.ok) return { error: "RUNBOOK_INVALID", details: valid };

  const { rows: runRows } = await pool.query(
    `INSERT INTO staff_control_runbook_runs (runbook_id, runbook_key, runbook_version, actor_id, reason, details)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, started_at`,
    [runbook.id, runbook.key, runbook.version, actorId, reason, JSON.stringify({ dryRun })]
  );
  const runId = runRows[0].id;

  const stepResults = [];
  let hadFailure = false;

  for (const step of runbook.steps) {
    const result = { type: step.type, label: step.label || null, at: new Date().toISOString(), status: "ok", data: null };
    try {
      if (dryRun) {
        result.status = "skipped-dry-run";
      } else if (step.type === "wait") {
        const ms = Math.min(60000, Math.max(0, Number(step.ms || 0)));
        await new Promise((resolve) => setTimeout(resolve, ms));
        result.data = { waited_ms: ms };
      } else if (step.type === "check") {
        result.status = "logged"; result.data = { check: step.check };
      } else if (step.type === "feature_flag") {
        const { flagKey, enabled } = step;
        if (!flagKey) throw Object.assign(new Error("MISSING_FLAG_KEY"), { code: "MISSING_FLAG_KEY" });
        await pool.query(
          `UPDATE staff_control_feature_flags
             SET is_enabled = $1, updated_by = $2, updated_at = NOW(), reason = $3
           WHERE flag_key = $4`,
          [enabled === true, actorId, reason || null, flagKey]
        );
        result.data = { flagKey, enabled: enabled === true };
      } else if (step.type === "hetzner") {
        result.data = await hetzner.runSafeAction(step.actionKey, step.params || {});
        if (result.data && result.data.error) { result.status = "error"; hadFailure = true; }
      } else if (step.type === "notify") {
        await pool.query(
          `INSERT INTO staff_control_decisions (area, title, decision, reason, confirmed_by)
           VALUES ($1,$2,$3,$4,$5)`,
          [step.area || "runbook", step.title || runbook.key, step.decision || "note", reason || null, actorId]
        );
        result.data = { noted: true };
      }
    } catch (err) {
      result.status = "error"; result.data = { error: String(err.code || err.message || err) };
      hadFailure = true;
    }
    stepResults.push(result);
    if (hadFailure && step.stopOnFail !== false) break;
  }

  const finalStatus = hadFailure ? "failed" : "success";
  await pool.query(
    `UPDATE staff_control_runbook_runs SET finished_at = NOW(), status = $1, step_results = $2 WHERE id = $3`,
    [finalStatus, JSON.stringify(stepResults), runId]
  );
  return { runId, status: finalStatus, steps: stepResults };
}

export async function ensureSeedRunbooks(pool, actorId = null) {
  const SEEDS = [
    {
      key: "platform.enter_read_only",
      name: "Plattform auf read-only schalten",
      description: "Global read-only-Flag setzen + Wartungs-Banner anzeigen.",
      risk_level: "critical",
      steps: [
        { type: "feature_flag", flagKey: "platform.read_only_mode", enabled: true, label: "Read-only Mode ON", stopOnFail: true },
        { type: "feature_flag", flagKey: "platform.maintenance_banner", enabled: true, label: "Banner ON" },
        { type: "notify", area: "platform", title: "Enter Read-Only", decision: "platform.read_only_mode=true" }
      ]
    },
    {
      key: "platform.exit_read_only",
      name: "Plattform read-only aufheben",
      description: "Global read-only + Banner wieder aus.",
      risk_level: "high",
      steps: [
        { type: "feature_flag", flagKey: "platform.read_only_mode", enabled: false, label: "Read-only Mode OFF" },
        { type: "feature_flag", flagKey: "platform.maintenance_banner", enabled: false, label: "Banner OFF" },
        { type: "notify", area: "platform", title: "Exit Read-Only", decision: "platform.read_only_mode=false" }
      ]
    },
    {
      key: "hetzner.snapshot_all_servers",
      name: "Alle Hetzner-Server snapshotten",
      description: "Erstellt fuer jeden Server ein Snapshot-Image. Stub-safe.",
      risk_level: "medium",
      steps: [
        { type: "notify", area: "infra", title: "Snapshot Run", decision: "start", label: "Start Snapshot Run" },
        { type: "hetzner", actionKey: "server.create_image", params: { serverId: 1, description: "staff-scc-snapshot", type: "snapshot" }, label: "Snapshot server 1" },
        { type: "hetzner", actionKey: "server.create_image", params: { serverId: 2, description: "staff-scc-snapshot", type: "snapshot" }, label: "Snapshot server 2" },
        { type: "hetzner", actionKey: "server.create_image", params: { serverId: 3, description: "staff-scc-snapshot", type: "snapshot" }, label: "Snapshot server 3" },
        { type: "notify", area: "infra", title: "Snapshot Run", decision: "done" }
      ]
    }
  ];

  for (const seed of SEEDS) {
    await pool.query(
      `INSERT INTO staff_control_runbooks
         (key, name, description, version, steps, risk_level, is_enabled, requires_confirm, created_by)
       VALUES ($1,$2,$3,1,$4,$5,TRUE,TRUE,$6)
       ON CONFLICT (key) DO UPDATE SET
         name = EXCLUDED.name, description = EXCLUDED.description,
         steps = EXCLUDED.steps, risk_level = EXCLUDED.risk_level, updated_at = NOW()`,
      [seed.key, seed.name, seed.description, JSON.stringify(seed.steps), seed.risk_level, actorId]
    );
  }
}
