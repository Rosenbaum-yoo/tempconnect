/**
 * Billing Metrics Service
 * - Tagesmessungen (billing_usage_metrics)
 * - Monatliche Snapshots (worker_billing_snapshots)
 * - Plan-Limit-Prüfung (plan_usage_rules)
 */
import { buildAssignmentActivePredicateSql } from "./assignmentLifecycleService.js";

const billingAssignmentIsCurrentSql = buildAssignmentActivePredicateSql({
  assignmentAlias: "a",
  linkAlias: "wal"
});

/* ── Aktive Worker zählen ───────────────────────────────────────────────────── */

/**
 * Zählt aktive Worker einer Organisation (= aktive Profile die dieser Org als
 * Supplier zugeordnet sind UND aktive Assignment-Links haben)
 */
export async function countActiveWorkers(pool, supplierOrgId) {
  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT wp.user_id) AS cnt
     FROM worker_profiles wp
     WHERE wp.supplier_org_id = $1
       AND wp.is_active = TRUE`,
    [supplierOrgId]
  );
  return parseInt(rows[0]?.cnt || 0, 10);
}

/**
 * Zählt aktive Assignment-Links (= aktive Einsätze mit aktiven Workern)
 */
export async function countActiveAssignmentLinks(pool, supplierOrgId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM worker_assignment_links wal
     JOIN assignments a ON a.id = wal.assignment_id
     JOIN worker_profiles wp ON wp.user_id = wal.worker_user_id
     WHERE wal.supplier_org_id = $1
       AND wal.is_active = TRUE
       AND wp.is_active = TRUE
       AND ${billingAssignmentIsCurrentSql}`,
    [supplierOrgId]
  );
  return parseInt(rows[0]?.cnt || 0, 10);
}

/* ── Tagesmetrik aufzeichnen ────────────────────────────────────────────────── */

/**
 * Schreibt oder aktualisiert Tages-Metriken für eine Org.
 * Wird typischerweise einmal täglich via Cron aufgerufen.
 * @param {object} pool
 * @param {string} orgId       — Supplier-Org
 * @param {string} [dateStr]   — ISO-Datum YYYY-MM-DD, default: heute
 */
export async function recordDailyMetrics(pool, orgId, dateStr = null) {
  const date = dateStr || new Date().toISOString().slice(0, 10);

  const [activeWorkers, activeAssignments] = await Promise.all([
    countActiveWorkers(pool, orgId),
    countActiveAssignmentLinks(pool, orgId)
  ]);

  // submitted Timesheets im Monat
  const { rows: [tsRow] } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status NOT IN ('draft')) AS submitted,
       COUNT(*) FILTER (WHERE status IN ('approved')) AS approved
     FROM timesheets
     WHERE supplier_org_id = $1
       AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', $2::date)`,
    [orgId, date]
  );

  const metrics = [
    { type: "active_workers",      value: activeWorkers },
    { type: "active_assignments",  value: activeAssignments },
    { type: "worker_seats",        value: activeWorkers },  // 1:1 mapping
    { type: "submitted_timesheets", value: parseInt(tsRow?.submitted || 0, 10) },
    { type: "approved_timesheets",  value: parseInt(tsRow?.approved  || 0, 10) }
  ];

  const results = [];
  for (const m of metrics) {
    const { rows: [row] } = await pool.query(
      `INSERT INTO billing_usage_metrics (org_id, metric_date, metric_type, value)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (org_id, metric_date, metric_type) DO UPDATE
         SET value = EXCLUDED.value
       RETURNING *`,
      [orgId, date, m.type, m.value]
    );
    results.push(row);
  }

  return { date, orgId, metrics: results };
}

/* ── Monats-Snapshot ────────────────────────────────────────────────────────── */

/**
 * Erstellt einen monatlichen Abrechnungs-Snapshot (Monatsende oder on-demand).
 * @param {string} snapshotMonth — YYYY-MM
 */
export async function takeMonthlySnapshot(pool, orgId, snapshotMonth) {
  // Maximalwert der aktiven Worker im Monat (Worst Case → billing-relevant)
  const { rows: [peakRow] } = await pool.query(
    `SELECT
       MAX(value) FILTER (WHERE metric_type = 'active_workers') AS peak_workers,
       MAX(value) FILTER (WHERE metric_type = 'worker_seats')   AS peak_seats
     FROM billing_usage_metrics
     WHERE org_id = $1
       AND TO_CHAR(metric_date, 'YYYY-MM') = $2`,
    [orgId, snapshotMonth]
  );

  // Timesheets im Monat
  const { rows: [tsRow] } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status NOT IN ('draft')) AS submitted,
       COUNT(*) FILTER (WHERE status IN ('approved'))  AS approved
     FROM timesheets
     WHERE supplier_org_id = $1
       AND TO_CHAR(created_at, 'YYYY-MM') = $2`,
    [orgId, snapshotMonth]
  );

  // Plan des Orgs (über org_memberships → user_id → subscriptions)
  const { rows: [planRow] } = await pool.query(
    `SELECT s.plan FROM subscriptions s
     JOIN org_memberships om ON om.user_id = s.user_id
     WHERE om.org_id = $1 AND s.status IN ('active', 'past_due', 'canceling')
     ORDER BY s.created_at DESC LIMIT 1`,
    [orgId]
  );

  const activeWorkers = parseInt(peakRow?.peak_workers || 0, 10);
  const activeSeats   = parseInt(peakRow?.peak_seats   || 0, 10);
  const submittedTs   = parseInt(tsRow?.submitted       || 0, 10);
  const approvedTs    = parseInt(tsRow?.approved        || 0, 10);
  const plan          = planRow?.plan || null;

  const { rows: [snap] } = await pool.query(
    `INSERT INTO worker_billing_snapshots
       (org_id, snapshot_month, active_workers, active_seats,
        submitted_ts, approved_ts, plan)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (org_id, snapshot_month) DO UPDATE SET
       active_workers = EXCLUDED.active_workers,
       active_seats   = EXCLUDED.active_seats,
       submitted_ts   = EXCLUDED.submitted_ts,
       approved_ts    = EXCLUDED.approved_ts,
       plan           = EXCLUDED.plan
     RETURNING *`,
    [orgId, snapshotMonth, activeWorkers, activeSeats, submittedTs, approvedTs, plan]
  );

  return { snapshot: snap };
}

/* ── Plan-Usage-Rules laden ─────────────────────────────────────────────────── */

export async function getPlanUsageRules(pool, plan) {
  const { rows } = await pool.query(
    `SELECT * FROM plan_usage_rules
     WHERE plan = $1 AND is_active = TRUE`,
    [plan]
  );
  // Als Map: metric_type → rule
  return rows.reduce((acc, r) => { acc[r.metric_type] = r; return acc; }, {});
}

/* ── Limit-Prüfung ──────────────────────────────────────────────────────────── */

/**
 * Prüft ob eine Org ihr Worker-Limit überschreitet.
 * Gibt Warnungen/Hard-Blocks zurück — wird im Frontend angezeigt.
 */
export async function checkPlanLimits(pool, supplierOrgId) {
  // Plan ermitteln (über org_memberships → user_id → subscriptions)
  const { rows: [planRow] } = await pool.query(
    `SELECT s.plan FROM subscriptions s
     JOIN org_memberships om ON om.user_id = s.user_id
     WHERE om.org_id = $1 AND s.status = 'active'
     ORDER BY s.created_at DESC LIMIT 1`,
    [supplierOrgId]
  );
  const plan = planRow?.plan;
  if (!plan) return { plan: null, checks: [], warnings: [], hard_blocked: false };

  const [rules, currentWorkers] = await Promise.all([
    getPlanUsageRules(pool, plan),
    countActiveWorkers(pool, supplierOrgId)
  ]);

  const workerRule = rules["active_workers"];
  const checks = [];
  let hardBlocked = false;

  if (workerRule) {
    const included = workerRule.included_units;
    const max      = workerRule.max_units;

    checks.push({
      metric:   "active_workers",
      current:  currentWorkers,
      included: included === -1 ? null : included,   // -1 = unlimitiert
      max:      max,
      overage:  included === -1 ? 0 : Math.max(0, currentWorkers - included),
      at_limit: max !== null && currentWorkers >= max,
      exceeded: max !== null && currentWorkers > max
    });

    if (max !== null && currentWorkers >= max) hardBlocked = true;
  }

  const warnings = checks
    .filter(c => c.at_limit || c.overage > 0)
    .map(c => {
      if (c.exceeded) return `Hard Limit erreicht: ${c.current}/${c.max} aktive Worker.`;
      if (c.at_limit) return `Worker-Limit erreicht: ${c.current}/${c.max} aktive Worker.`;
      return `${c.overage} Worker über dem inkludierten Kontingent (${c.included}).`;
    });

  return { plan, checks, warnings, hard_blocked: hardBlocked };
}

/* ── Dashboard-Metriken (für Supplier-UI) ───────────────────────────────────── */

export async function getDashboardMetrics(pool, supplierOrgId) {
  const [activeWorkers, activeLinks, limits] = await Promise.all([
    countActiveWorkers(pool, supplierOrgId),
    countActiveAssignmentLinks(pool, supplierOrgId),
    checkPlanLimits(pool, supplierOrgId)
  ]);

  // Aktuelle Woche Submissions
  const { rows: [weekRow] } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'submitted')              AS pending,
       COUNT(*) FILTER (WHERE status = 'under_review')           AS in_review,
       COUNT(*) FILTER (WHERE status = 'needs_correction')       AS needs_correction,
       COUNT(*) FILTER (WHERE status = 'accepted_into_timesheet') AS accepted,
       COUNT(*) FILTER (WHERE status = 'rejected')               AS rejected
     FROM worker_time_submissions
     WHERE supplier_org_id = $1
       AND week_start >= DATE_TRUNC('week', NOW())`,
    [supplierOrgId]
  );

  // Letzten 3 Monatssnapshots
  const { rows: snapshots } = await pool.query(
    `SELECT * FROM worker_billing_snapshots
     WHERE org_id = $1
     ORDER BY snapshot_month DESC LIMIT 3`,
    [supplierOrgId]
  );

  return {
    active_workers:   activeWorkers,
    active_assignments: activeLinks,
    plan_limits:      limits,
    this_week:        weekRow || {},
    snapshots
  };
}

/* ── Metrics-Historie ───────────────────────────────────────────────────────── */

export async function getMetricsHistory(pool, orgId, { metricType = "active_workers", days = 90 } = {}) {
  const { rows } = await pool.query(
    `SELECT metric_date, value, metric_type
     FROM billing_usage_metrics
     WHERE org_id = $1
       AND metric_type = $2
       AND metric_date >= CURRENT_DATE - INTERVAL '1 day' * $3
     ORDER BY metric_date DESC`,
    [orgId, metricType, days]
  );
  return rows;
}

export async function getMonthlySnapshots(pool, orgId, months = 12) {
  const { rows } = await pool.query(
    `SELECT * FROM worker_billing_snapshots
     WHERE org_id = $1
     ORDER BY snapshot_month DESC LIMIT $2`,
    [orgId, months]
  );
  return rows;
}
