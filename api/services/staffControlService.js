/**
 * staffControlService.js - Aggregation fuer das Staff Control Center.
 * Liest bestehende Services + Tabellen. Dupliziert keine Business-Logik.
 */

import { getSystemDiagnostics } from "./healthService.js";

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
  const snapshot = {
    generated_at: new Date().toISOString(),
    recent_runs: [],
    infra_health: [],   // Letzter Snapshot pro Host (max. 24 h alt)
    service_health: null, // Live-Diagnostics (DB/Redis/Process/API/Billing/Email) — Phase I Slice 2
    errors: []
  };

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

  // Neuester Infra-Snapshot pro Host (infrastructure_snapshots — Migration 110)
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (host_name)
        host_name, env,
        cpu_percent, ram_percent, disk_percent,
        docker_running_count, docker_unhealthy_count,
        tls_days_remaining, backup_age_h,
        deployment_version, deployment_status,
        collected_at
      FROM infrastructure_snapshots
      WHERE collected_at > NOW() - INTERVAL '24 hours'
      ORDER BY host_name, collected_at DESC
    `);
    snapshot.infra_health = rows;
  } catch { /* Tabelle optional — Soft-Fail */ }

  // Live-Service-Health (Phase I Slice 2): wiederverwendet getSystemDiagnostics (db/redis/
  // process/api/billing/email). Read-only, secret-frei. Soft-Fail: ein Diagnostics-Fehler
  // darf den Operations-Snapshot nicht kippen — Operator sieht weiter Runbooks + Infra.
  // BEWUSST als LETZTE pool-Berührung (SELECT 1 in getSystemDiagnostics) → bestehende
  // Pool-Sequenz-Tests (runbook_runs, infra_health) bleiben index-gültig.
  try {
    snapshot.service_health = await getSystemDiagnostics(pool);
  } catch (err) {
    snapshot.errors.push({ area: "service_health", error: String(err.code || err.message || err) });
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
  const snapshot = {
    generated_at: new Date().toISOString(),
    kpi: {
      dsgvo_requests_open:        0,
      compliance_docs_expired:    0,
      compliance_docs_expiring_30d: 0,
      high_risk_actions_7d:       0
    },
    dsgvo_recent:        [],  // Bis zu 10 offene DSGVO-Anfragen
    compliance_expiring: [],  // Abgelaufen + läuft in 30 Tagen ab
    high_risk_audit:     [],  // High/Critical Staff-Aktionen letzte 7 Tage
    errors: []
  };

  // DSGVO-Anfragen KPI
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM data_governance_requests WHERE status IN ('pending','in_progress')`
    );
    snapshot.kpi.dsgvo_requests_open = Number(rows[0]?.n || 0);
  } catch { /* Tabelle optional */ }

  // DSGVO-Anfragen Liste (älteste zuerst → Fristen-Priorität)
  try {
    const { rows } = await pool.query(`
      SELECT dgr.id, dgr.request_type, dgr.subject_type, dgr.status,
             dgr.notes, dgr.created_at,
             o.name AS org_name,
             NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), '') AS requested_by_name,
             u.email AS requested_by_email
      FROM   data_governance_requests dgr
      LEFT JOIN organizations o ON o.id = dgr.org_id
      LEFT JOIN users         u ON u.id = dgr.requested_by
      WHERE  dgr.status IN ('pending','in_progress')
      ORDER BY dgr.created_at ASC
      LIMIT 10
    `);
    snapshot.dsgvo_recent = rows;
  } catch { /* optional */ }

  // Compliance-Dokumente KPI
  try {
    const { rows: exp } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM compliance_documents WHERE valid_until IS NOT NULL AND valid_until < NOW()`
    );
    snapshot.kpi.compliance_docs_expired = Number(exp[0]?.n || 0);
  } catch { /* optional */ }

  try {
    const { rows: soon } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM compliance_documents
       WHERE valid_until IS NOT NULL
         AND valid_until >= NOW()
         AND valid_until < NOW() + INTERVAL '30 days'`
    );
    snapshot.kpi.compliance_docs_expiring_30d = Number(soon[0]?.n || 0);
  } catch { /* optional */ }

  // Compliance-Dokumente Liste (abgelaufen + läuft ≤30T ab)
  try {
    const { rows } = await pool.query(`
      SELECT cd.id, cd.doc_type, cd.doc_name, cd.status,
             cd.valid_from, cd.valid_until,
             o.name AS org_name
      FROM   compliance_documents cd
      LEFT JOIN organizations o ON o.id = cd.org_id
      WHERE  cd.valid_until IS NOT NULL
        AND  cd.valid_until < NOW() + INTERVAL '30 days'
      ORDER BY cd.valid_until ASC
      LIMIT 20
    `);
    snapshot.compliance_expiring = rows;
  } catch { /* optional */ }

  // High/Critical Staff-Aktionen letzte 7 Tage
  try {
    const { rows: auditKpi } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM staff_control_audit_log
       WHERE risk_level IN ('high','critical')
         AND created_at > NOW() - INTERVAL '7 days'`
    );
    snapshot.kpi.high_risk_actions_7d = Number(auditKpi[0]?.n || 0);
  } catch { /* optional */ }

  try {
    const { rows } = await pool.query(`
      SELECT id, actor_id, area, action, status, risk_level, reason, created_at
      FROM   staff_control_audit_log
      WHERE  risk_level IN ('high','critical')
        AND  created_at > NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 10
    `);
    snapshot.high_risk_audit = rows;
  } catch { /* optional */ }

  return snapshot;
}

export async function loadSupportSnapshot(pool) {
  const snapshot = {
    generated_at: new Date().toISOString(),
    kpi: { open_cases: 0, escalated_cases: 0, sla_breach_count: 0, critical_count: 0 },
    escalations: [],
    impersonation: { allowed: false, reason: "Staff Control Center erlaubt keine Impersonation." },
    errors: []
  };

  // KPI aus support_cases
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed'))::int            AS open_cases,
        COUNT(*) FILTER (WHERE is_escalated AND status NOT IN ('resolved','closed'))::int AS escalated_cases,
        COUNT(*) FILTER (WHERE sla_resolution_deadline < NOW()
                           AND status NOT IN ('resolved','closed'))::int            AS sla_breach_count,
        COUNT(*) FILTER (WHERE priority = 'critical'
                           AND status NOT IN ('resolved','closed'))::int            AS critical_count
      FROM support_cases
    `);
    if (rows[0]) {
      snapshot.kpi = {
        open_cases:      Number(rows[0].open_cases      || 0),
        escalated_cases: Number(rows[0].escalated_cases || 0),
        sla_breach_count:Number(rows[0].sla_breach_count|| 0),
        critical_count:  Number(rows[0].critical_count  || 0)
      };
    }
  } catch { /* Tabelle optional — Soft-Fail */ }

  // Offene Eskalationen (pending/acknowledged) mit Case-Kontext
  try {
    const { rows } = await pool.query(`
      SELECT se.id, se.target, se.priority, se.summary, se.status, se.reason, se.created_at,
             sc.case_number, sc.subject AS case_subject,
             o.name AS org_name
      FROM   support_escalations se
      JOIN   support_cases sc ON sc.id = se.case_id
      LEFT JOIN organizations o ON o.id = sc.reporter_org_id
      WHERE  se.status IN ('pending','acknowledged')
      ORDER BY
        CASE WHEN se.priority = 'critical' THEN 0
             WHEN se.priority = 'urgent'   THEN 1
             WHEN se.priority = 'high'     THEN 2
             ELSE 3 END,
        se.created_at ASC
      LIMIT 20
    `);
    snapshot.escalations = rows;
  } catch { /* Tabelle optional — Soft-Fail */ }

  return snapshot;
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
