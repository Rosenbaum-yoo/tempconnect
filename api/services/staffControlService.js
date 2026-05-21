/**
 * staffControlService.js - Aggregation fuer das Staff Control Center.
 * Liest bestehende Services + Tabellen. Dupliziert keine Business-Logik.
 */

export async function loadExecutiveSnapshot(pool) {
  const snapshot = {
    generated_at: new Date().toISOString(),
    plans: { items: [], total_active: 0 },
    pilot: { active: 0, converted: 0, expired: 0 },
    customer_requests: { open: 0, pipeline: [] },
    incidents_24h: 0,
    platform_status: "unknown",
    errors: []
  };

  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(plan,'DEMO') AS plan,
              COUNT(*) FILTER (WHERE status = 'active')::int AS active_count
         FROM subscriptions GROUP BY plan ORDER BY active_count DESC`
    );
    snapshot.plans.items = rows;
    snapshot.plans.total_active = rows.reduce((s, r) => s + Number(r.active_count || 0), 0);
  } catch (err) {
    snapshot.errors.push({ area: "plans", error: String(err.code || err.message || err) });
  }

  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE pilot_status = 'active')::int AS active,
         COUNT(*) FILTER (WHERE converted_at IS NOT NULL)::int AS converted,
         COUNT(*) FILTER (WHERE pilot_status = 'expired')::int AS expired
       FROM organizations WHERE pilot_status IS NOT NULL`
    );
    snapshot.pilot = rows[0] || snapshot.pilot;
  } catch { /* column optional */ }

  try {
    const { rows } = await pool.query(
      `SELECT status, COUNT(*)::int AS count
         FROM strategic_collaboration_requests GROUP BY status`
    );
    snapshot.customer_requests.pipeline = rows;
    snapshot.customer_requests.open = rows
      .filter((r) => !["abgeschlossen", "abgelehnt"].includes(r.status))
      .reduce((s, r) => s + Number(r.count || 0), 0);
  } catch { /* table optional */ }

  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_log
       WHERE created_at > NOW() - INTERVAL '24 hours'
         AND (action LIKE '%.error%' OR action LIKE '%.incident%' OR details->>'severity' IN ('error','critical'))`
    );
    snapshot.incidents_24h = Number(rows[0]?.n || 0);
  } catch { /* ignore */ }

  snapshot.platform_status = snapshot.incidents_24h > 10 ? "degraded"
    : snapshot.incidents_24h > 0 ? "warning" : "ok";

  return snapshot;
}

export async function loadPlatformSnapshot(pool) {
  const snapshot = { generated_at: new Date().toISOString(), feature_flags: [], errors: [] };
  try {
    const { rows } = await pool.query(
      `SELECT flag_key, is_enabled, description, risk_level, updated_by, updated_at, reason
         FROM staff_control_feature_flags
         ORDER BY risk_level DESC, flag_key ASC`
    );
    snapshot.feature_flags = rows;
  } catch (err) {
    snapshot.errors.push({ area: "feature_flags", error: String(err.code || err.message || err) });
  }
  return snapshot;
}

export async function loadOperationsSnapshot(pool) {
  const snapshot = { generated_at: new Date().toISOString(), recent_runs: [], errors: [] };
  try {
    const { rows } = await pool.query(
      `SELECT runbook_key, status, started_at, finished_at
         FROM staff_control_runbook_runs
         ORDER BY started_at DESC LIMIT 20`
    );
    snapshot.recent_runs = rows;
  } catch (err) {
    snapshot.errors.push({ area: "runbook_runs", error: String(err.code || err.message || err) });
  }
  return snapshot;
}

export async function loadRevenueSnapshot(pool) {
  const snapshot = { generated_at: new Date().toISOString(), active_subscriptions: [], errors: [] };
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(plan,'DEMO') AS plan, status, COUNT(*)::int AS count
         FROM subscriptions GROUP BY plan, status ORDER BY plan, status`
    );
    snapshot.active_subscriptions = rows;
  } catch (err) {
    snapshot.errors.push({ area: "subscriptions", error: String(err.code || err.message || err) });
  }
  return snapshot;
}

export async function loadRiskSnapshot(pool) {
  const snapshot = { generated_at: new Date().toISOString(), dsgvo_requests_open: 0, compliance_docs_expired: 0, errors: [] };
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM data_governance_requests WHERE status IN ('pending','in_progress')`
    );
    snapshot.dsgvo_requests_open = Number(rows[0]?.n || 0);
  } catch { /* optional */ }
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM compliance_documents WHERE valid_until IS NOT NULL AND valid_until < NOW()`
    );
    snapshot.compliance_docs_expired = Number(rows[0]?.n || 0);
  } catch { /* optional */ }
  return snapshot;
}

export function loadSupportSnapshot() {
  return {
    generated_at: new Date().toISOString(),
    escalations: [],
    impersonation: { allowed: false, reason: "Staff Control Center erlaubt keine Impersonation." }
  };
}

export async function loadAuditDecisionsSnapshot(pool) {
  const snapshot = { generated_at: new Date().toISOString(), recent_audit: [], recent_decisions: [], errors: [] };
  try {
    const { rows } = await pool.query(
      `SELECT id, actor_id, created_at, area, action, status, risk_level
         FROM staff_control_audit_log ORDER BY created_at DESC LIMIT 50`
    );
    snapshot.recent_audit = rows;
  } catch (err) {
    snapshot.errors.push({ area: "staff_audit", error: String(err.code || err.message || err) });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, area, title, decision, confirmed_at, reversible, reverted_at
         FROM staff_control_decisions ORDER BY confirmed_at DESC LIMIT 50`
    );
    snapshot.recent_decisions = rows;
  } catch (err) {
    snapshot.errors.push({ area: "staff_decisions", error: String(err.code || err.message || err) });
  }
  return snapshot;
}

const DATA_EXPLORER_VIEWS = {
  "top_pilot_orgs": {
    description: "Aktive Pilotkunden mit juengstem Engagement",
    sql: `SELECT o.id, o.name, o.plan, o.pilot_status, o.created_at
          FROM organizations o
          WHERE o.pilot_status IN ('active','trial')
          ORDER BY o.created_at DESC LIMIT 50`
  },
  "recent_customer_requests": {
    description: "Kundenanfragen der letzten 30 Tage",
    sql: `SELECT id,
                 contact_email AS requester_email,
                 COALESCE(requester_org_id, target_org_id) AS org_id,
                 request_type, source_context, status, created_at
          FROM strategic_collaboration_requests
          WHERE created_at > NOW() - INTERVAL '30 days'
          ORDER BY created_at DESC LIMIT 100`
  },
  "failed_audit_actions_24h": {
    description: "Fehlgeschlagene Audit-Aktionen (Plattform) der letzten 24 h",
    sql: `SELECT created_at, action, entity_type, entity_id, user_id
          FROM audit_log
          WHERE created_at > NOW() - INTERVAL '24 hours'
            AND (action LIKE '%.error%' OR details->>'success' = 'false')
          ORDER BY created_at DESC LIMIT 100`
  },
  "staff_audit_high_risk": {
    description: "Staff-Aktionen mit risk_level high/critical",
    sql: `SELECT id, created_at, actor_id, area, action, status, risk_level, reason
          FROM staff_control_audit_log
          WHERE risk_level IN ('high','critical')
          ORDER BY created_at DESC LIMIT 100`
  }
};

export function listDataExplorerViews() {
  return Object.entries(DATA_EXPLORER_VIEWS).map(([key, def]) => ({ key, description: def.description }));
}

export async function runDataExplorerView(pool, key) {
  const def = DATA_EXPLORER_VIEWS[key];
  if (!def) return { error: "VIEW_NOT_FOUND" };
  try {
    const { rows, rowCount } = await pool.query(def.sql);
    return { key, description: def.description, rowCount, rows };
  } catch (err) {
    return { key, description: def.description, error: String(err.code || err.message || err) };
  }
}
