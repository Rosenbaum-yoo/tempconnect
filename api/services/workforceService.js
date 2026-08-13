/**
 * Workforce Service — operatives Einsatzmodul.
 * Aggregiert Daten aus assignments, worker_assignment_links, timesheets,
 * worker_time_submissions und contracts fuer konsolidierte Einsatzuebersichten.
 * Keine eigenen Kern-Tabellen — rein lesende Aggregation.
 */
import {
  buildAssignmentActivePredicateSql,
  buildAssignmentHistoryPredicateSql,
  buildAssignmentLifecycleBucketSql,
  buildAssignmentLifecycleStateSql,
  buildAssignmentEffectiveEndDateSql,
  normalizeAssignmentLifecycleBucket
} from "./assignmentLifecycleService.js";
import { todayDE, dateOnlyDE } from "../utils/dateDE.js";

const workforceAssignmentEffectiveEndDateSql = buildAssignmentEffectiveEndDateSql({ assignmentAlias: "a" });
const workforceAssignmentLifecycleStateSql = buildAssignmentLifecycleStateSql({ assignmentAlias: "a" });
const workforceAssignmentLifecycleBucketSql = buildAssignmentLifecycleBucketSql({ assignmentAlias: "a" });
const workforceAssignmentIsCurrentSql = buildAssignmentActivePredicateSql({ assignmentAlias: "a" });
const workforceAssignmentIsHistorySql = buildAssignmentHistoryPredicateSql({ assignmentAlias: "a" });

function normalizeIsoDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) {
    // Klasse DB_WERT_NACH_UTC: pg macht aus einer DATE-Spalte ohne den Typparser aus
    // db/typeParsers.js ein Date um LOKALE Mitternacht (Berlin = 22:00/23:00 UTC des
    // Vortags). `toISOString().slice(0,10)` lieferte deshalb ganztaegig den Vortag —
    // in der Workforce-Uebersicht standen Einsatzbeginn und -ende einen Tag zu frueh.
    return Number.isFinite(value.getTime()) ? dateOnlyDE(value) : null;
  }
  const text = String(value).trim();
  if (!text) return null;
  // Reine Kalendertage ('YYYY-MM-DD', so liefert der Typparser DATE-Spalten) bleiben
  // unveraendert — ein Kalendertag hat keine Zeitzone und darf nicht umgerechnet werden.
  const directMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directMatch) return directMatch[1];
  // Klasse DB_WERT_NACH_UTC: gleiche Verschiebung fuer nicht-ISO-Datumsstrings
  // (z. B. 'Sat Jun 11 2026 00:00:00 GMT+0200'), die lokal geparst werden.
  return Number.isFinite(Date.parse(text)) ? dateOnlyDE(text) : null;
}

// Klasse HEUTE_IN_UTC: der Vorgabewert bestimmte "heute" per UTC-Schnitt und war
// zwischen 00:00 und 02:00 der Vortag. Der Nutzer las dann "Einsatz endet in 3 Tagen",
// obwohl es 4 waren; die 14-Tage-Warnung und die error/warning-Grenze bei 3 Tagen
// loesten einen Tag zu frueh aus.
function getCalendarDayDiff(targetDate, referenceDate = todayDE()) {
  const normalizedTargetDate = normalizeIsoDateValue(targetDate);
  const normalizedReferenceDate = normalizeIsoDateValue(referenceDate);
  if (!normalizedTargetDate || !normalizedReferenceDate) return null;
  const targetMs = Date.parse(`${normalizedTargetDate}T00:00:00Z`);
  const referenceMs = Date.parse(`${normalizedReferenceDate}T00:00:00Z`);
  if (!Number.isFinite(targetMs) || !Number.isFinite(referenceMs)) return null;
  return Math.round((targetMs - referenceMs) / 86400000);
}

/* ── Workforce Overview ─────────────────────────────────── */

/**
 * Konsolidierte Einsatzliste mit inline Worker/Timesheet-KPIs.
 * Buyer-Sicht: org_id = orgId, Supplier-Sicht: supplier_org_id = orgId.
 */
export async function getWorkforceOverview(pool, orgId, filters = {}) {
  const params = [orgId];
  const where = ['(a.org_id = $1 OR a.supplier_org_id = $1)'];
  let idx = 2;
  const lifecycleBucket = normalizeAssignmentLifecycleBucket(filters.lifecycle_bucket, null);

  if (filters.status) {
    where.push(`a.status = $${idx}`); params.push(filters.status); idx++;
  } else {
    where.push(`a.status NOT IN ('cancelled')`);
  }
  if (filters.supplier_org_id) {
    where.push(`a.supplier_org_id = $${idx}`); params.push(filters.supplier_org_id); idx++;
  }
  if (filters.date_from) {
    where.push(`a.start_date >= $${idx}`); params.push(filters.date_from); idx++;
  }
  if (filters.date_to) {
    where.push(`(a.planned_end_date IS NULL OR a.planned_end_date <= $${idx})`); params.push(filters.date_to); idx++;
  }
  if (filters.search) {
    where.push(`(a.worker_description ILIKE $${idx} OR o.name ILIKE $${idx} OR so.name ILIKE $${idx} OR r.title ILIKE $${idx})`);
    params.push(`%${filters.search}%`); idx++;
  }
  if (lifecycleBucket === "active") {
    where.push(workforceAssignmentIsCurrentSql);
  } else if (lifecycleBucket === "history") {
    where.push(workforceAssignmentIsHistorySql);
  }

  const limit = Math.min(200, filters.limit || 100);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT a.id, a.org_id, a.supplier_org_id, a.requisition_id,
            a.deal_request_id, a.contract_id,
            a.worker_description, a.worker_count, a.status,
            a.start_date, a.planned_end_date, a.actual_end_date,
            ${workforceAssignmentEffectiveEndDateSql} AS assignment_effective_end_date,
            ${workforceAssignmentLifecycleStateSql} AS assignment_lifecycle_state,
            ${workforceAssignmentLifecycleBucketSql} AS assignment_lifecycle_bucket,
            ${workforceAssignmentIsCurrentSql} AS assignment_is_current,
            ${workforceAssignmentIsHistorySql} AS assignment_is_history,
            a.hourly_rate_cents, a.notes, a.created_at, a.updated_at,
            o.name  AS org_name,
            so.name AS supplier_org_name,
            r.title AS requisition_title,
            -- Worker counts
            COALESCE(wc.active_workers, 0)::int     AS active_workers,
            COALESCE(wc.pending_confirmations, 0)::int AS pending_confirmations,
            COALESCE(wc.total_workers, 0)::int       AS total_workers,
            -- Timesheet status
            COALESCE(tc.open_timesheets, 0)::int     AS open_timesheets,
            COALESCE(tc.submitted_timesheets, 0)::int AS submitted_timesheets,
            COALESCE(tc.rejected_timesheets, 0)::int  AS rejected_timesheets,
            -- Contract info
            ct.valid_until AS contract_valid_until,
            ct.status      AS contract_status
     FROM assignments a
     LEFT JOIN organizations o  ON o.id  = a.org_id
     LEFT JOIN organizations so ON so.id = a.supplier_org_id
     LEFT JOIN requisitions r   ON r.id  = a.requisition_id
     LEFT JOIN contracts ct     ON ct.id = a.contract_id
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) FILTER (WHERE wal.is_active = TRUE AND wal.worker_confirmation_status = 'worker_confirmed') AS active_workers,
         COUNT(*) FILTER (WHERE wal.is_active = TRUE AND wal.worker_confirmation_status = 'pending_confirmation') AS pending_confirmations,
         COUNT(*) FILTER (WHERE wal.is_active = TRUE) AS total_workers
       FROM worker_assignment_links wal
       WHERE wal.assignment_id = a.id
     ) wc ON TRUE
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) FILTER (WHERE ts.status IN ('draft')) AS open_timesheets,
         COUNT(*) FILTER (WHERE ts.status = 'submitted') AS submitted_timesheets,
         COUNT(*) FILTER (WHERE ts.status = 'rejected') AS rejected_timesheets
       FROM timesheets ts
       WHERE ts.assignment_id = a.id
     ) tc ON TRUE
     WHERE ${where.join(' AND ')}
     ORDER BY
       CASE a.status
         WHEN 'active' THEN 1 WHEN 'extended' THEN 2
         WHEN 'planned' THEN 3 WHEN 'completed' THEN 4
       END,
       a.start_date ASC,
       a.created_at DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

/* ── Workforce Detail ───────────────────────────────────── */

/**
 * Konsolidierte Detailansicht eines einzelnen Assignments
 * mit allen Worker-Links, Timesheets, Submissions, Contract.
 */
export async function getWorkforceDetail(pool, assignmentId, orgId) {
  // Assignment-Basis
  const { rows: aRows } = await pool.query(
    `SELECT a.*, o.name AS org_name, so.name AS supplier_org_name,
            r.title AS requisition_title, r.status AS requisition_status,
            u.email AS created_by_email,
            ${workforceAssignmentEffectiveEndDateSql} AS assignment_effective_end_date,
            ${workforceAssignmentLifecycleStateSql} AS assignment_lifecycle_state,
            ${workforceAssignmentLifecycleBucketSql} AS assignment_lifecycle_bucket,
            ${workforceAssignmentIsCurrentSql} AS assignment_is_current,
            ${workforceAssignmentIsHistorySql} AS assignment_is_history
     FROM assignments a
     LEFT JOIN organizations o  ON o.id  = a.org_id
     LEFT JOIN organizations so ON so.id = a.supplier_org_id
     LEFT JOIN requisitions r   ON r.id  = a.requisition_id
     LEFT JOIN users u          ON u.id  = a.created_by
     WHERE a.id = $1`,
    [assignmentId]
  );
  const assignment = aRows[0] || null;
  if (!assignment) return null;

  // Org-Boundary Check
  if (orgId && assignment.org_id !== orgId && assignment.supplier_org_id !== orgId) {
    return { error: 'ORG_BOUNDARY_VIOLATION' };
  }

  // Worker-Links
  const { rows: workers } = await pool.query(
    `SELECT wal.id AS link_id, wal.worker_user_id, wal.is_active,
            wal.role, wal.start_date, wal.end_date,
            wal.default_hours_per_day,
            wal.default_shift_start::TEXT, wal.default_shift_end::TEXT,
            wal.worker_confirmation_status,
            wal.worker_confirmed_at, wal.worker_declined_at,
            wal.client_name, wal.location_address,
            wp.first_name, wp.last_name, wp.personnel_number,
            u.email AS worker_email
     FROM worker_assignment_links wal
     JOIN users u ON u.id = wal.worker_user_id
     LEFT JOIN worker_profiles wp ON wp.user_id = wal.worker_user_id
     WHERE wal.assignment_id = $1
     ORDER BY wal.is_active DESC, wp.last_name ASC`,
    [assignmentId]
  );

  // Timesheets (letzte 10)
  const { rows: timesheets } = await pool.query(
    `SELECT ts.id, ts.worker_name, ts.week_start, ts.week_end,
            ts.status, ts.total_hours, ts.overtime_hours,
            ts.submitted_at, ts.approved_at, ts.rejected_at,
            ts.rejection_reason
     FROM timesheets ts
     WHERE ts.assignment_id = $1
     ORDER BY ts.week_start DESC
     LIMIT 10`,
    [assignmentId]
  );

  // Worker Submissions (letzte 10)
  const { rows: submissions } = await pool.query(
    `SELECT wts.id, wts.worker_user_id, wts.week_start, wts.week_end,
            wts.status, wts.total_hours, wts.overtime_hours,
            wts.submitted_at, wts.reviewed_at,
            wp.first_name, wp.last_name
     FROM worker_time_submissions wts
     LEFT JOIN worker_profiles wp ON wp.user_id = wts.worker_user_id
     WHERE wts.assignment_id = $1
     ORDER BY wts.week_start DESC
     LIMIT 10`,
    [assignmentId]
  );

  // Contract
  let contract = null;
  if (assignment.contract_id) {
    const { rows: cRows } = await pool.query(
      `SELECT id, title, contract_type, status, valid_from, valid_until
       FROM contracts WHERE id = $1`,
      [assignment.contract_id]
    );
    contract = cRows[0] || null;
  }

  // Action Flags
  const actionFlags = [];
  const pendingWorkers = workers.filter(w => w.worker_confirmation_status === 'pending_confirmation');
  if (pendingWorkers.length > 0) {
    actionFlags.push({ type: 'pending_confirmations', count: pendingWorkers.length, severity: 'warning' });
  }
  const rejectedTs = timesheets.filter(ts => ts.status === 'rejected');
  if (rejectedTs.length > 0) {
    actionFlags.push({ type: 'rejected_timesheets', count: rejectedTs.length, severity: 'error' });
  }
  const openTs = timesheets.filter(ts => ts.status === 'draft');
  if (openTs.length > 0) {
    actionFlags.push({ type: 'open_timesheets', count: openTs.length, severity: 'info' });
  }
  if (assignment.assignment_is_current && assignment.assignment_effective_end_date) {
    const daysUntilEnd = getCalendarDayDiff(assignment.assignment_effective_end_date);
    if (daysUntilEnd <= 14 && daysUntilEnd > 0 && assignment.status !== 'completed') {
      actionFlags.push({ type: 'expiring_soon', days_remaining: daysUntilEnd, severity: 'warning' });
    }
  }

  return {
    assignment,
    workers,
    timesheets,
    submissions,
    contract,
    action_flags: actionFlags
  };
}

/* ── Workforce KPIs ─────────────────────────────────────── */

/**
 * Aggregierte KPIs fuer das Workforce-Dashboard.
 */
export async function getWorkforceKpis(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE ${workforceAssignmentIsCurrentSql} AND a.status IN ('active','extended'))::int AS active_assignments,
       COUNT(*) FILTER (WHERE ${workforceAssignmentIsCurrentSql} AND a.status = 'planned')::int AS planned_assignments,
       COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed_assignments,
       COUNT(*) FILTER (WHERE a.status = 'cancelled')::int AS cancelled_assignments,
       COUNT(*)::int AS total_assignments
     FROM assignments a
     WHERE a.org_id = $1 OR a.supplier_org_id = $1`,
    [orgId]
  );
  const asg = rows[0] || {};

  // Deployed workers (aktive Links in aktiven Assignments)
  const { rows: wRows } = await pool.query(
    `SELECT
       COUNT(DISTINCT wal.worker_user_id) FILTER (WHERE wal.is_active = TRUE AND wal.worker_confirmation_status = 'worker_confirmed')::int AS deployed_workers,
       COUNT(*) FILTER (WHERE wal.is_active = TRUE AND wal.worker_confirmation_status = 'pending_confirmation')::int AS pending_confirmations
     FROM worker_assignment_links wal
     JOIN assignments a ON a.id = wal.assignment_id
     WHERE (a.org_id = $1 OR a.supplier_org_id = $1)
       AND ${workforceAssignmentIsCurrentSql}`,
    [orgId]
  );
  const wrk = wRows[0] || {};

  // Open timesheets (draft + submitted for review)
  const { rows: tRows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE ts.status = 'draft')::int      AS draft_timesheets,
       COUNT(*) FILTER (WHERE ts.status = 'submitted')::int  AS submitted_timesheets,
       COUNT(*) FILTER (WHERE ts.status = 'rejected')::int   AS rejected_timesheets
     FROM timesheets ts
     WHERE ts.org_id = $1 OR ts.supplier_org_id = $1`,
    [orgId]
  );
  const ts = tRows[0] || {};

  // Expiring assignments (next 14 days)
  const { rows: expRows } = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM assignments a
     WHERE (org_id = $1 OR supplier_org_id = $1)
       AND ${workforceAssignmentIsCurrentSql}
       AND ${workforceAssignmentEffectiveEndDateSql} BETWEEN CURRENT_DATE AND CURRENT_DATE + 14`,
    [orgId]
  );

  return {
    active_assignments:   asg.active_assignments || 0,
    planned_assignments:  asg.planned_assignments || 0,
    completed_assignments: asg.completed_assignments || 0,
    total_assignments:    asg.total_assignments || 0,
    deployed_workers:     wrk.deployed_workers || 0,
    pending_confirmations: wrk.pending_confirmations || 0,
    draft_timesheets:     ts.draft_timesheets || 0,
    submitted_timesheets: ts.submitted_timesheets || 0,
    rejected_timesheets:  ts.rejected_timesheets || 0,
    expiring_in_14d:      expRows[0]?.count || 0
  };
}

/* ── Pending Actions ────────────────────────────────────── */

/**
 * Priorisierte offene Aktionen die Aufmerksamkeit erfordern.
 */
export async function getPendingActions(pool, orgId, limit = 20) {
  const safeLimit = Math.min(50, Math.max(1, limit));
  const actions = [];

  // 1. Pending worker confirmations
  const { rows: pendingConfirm } = await pool.query(
    `SELECT wal.id AS link_id, wal.assignment_id, wal.worker_user_id,
            wp.first_name, wp.last_name, wal.start_date,
            a.worker_description, o.name AS org_name
     FROM worker_assignment_links wal
     JOIN assignments a ON a.id = wal.assignment_id
     LEFT JOIN organizations o ON o.id = a.org_id
     LEFT JOIN worker_profiles wp ON wp.user_id = wal.worker_user_id
     WHERE (a.org_id = $1 OR a.supplier_org_id = $1)
       AND wal.is_active = TRUE
       AND wal.worker_confirmation_status = 'pending_confirmation'
       AND ${workforceAssignmentIsCurrentSql}
     ORDER BY wal.start_date ASC
     LIMIT $2`,
    [orgId, safeLimit]
  );
  for (const pc of pendingConfirm) {
    actions.push({
      type: 'pending_confirmation',
      severity: 'warning',
      entity_type: 'worker_assignment_link',
      entity_id: pc.link_id,
      assignment_id: pc.assignment_id,
      description: `${pc.first_name || ''} ${pc.last_name || ''} — Einsatzbestaetigung ausstehend`,
      details: { worker_name: `${pc.first_name || ''} ${pc.last_name || ''}`.trim(), start_date: pc.start_date, org_name: pc.org_name }
    });
  }

  // 2. Rejected timesheets
  const { rows: rejectedTs } = await pool.query(
    `SELECT ts.id, ts.assignment_id, ts.worker_name, ts.week_start, ts.rejection_reason
     FROM timesheets ts
     WHERE (ts.org_id = $1 OR ts.supplier_org_id = $1)
       AND ts.status = 'rejected'
     ORDER BY ts.rejected_at DESC
     LIMIT $2`,
    [orgId, safeLimit]
  );
  for (const rts of rejectedTs) {
    actions.push({
      type: 'rejected_timesheet',
      severity: 'error',
      entity_type: 'timesheet',
      entity_id: rts.id,
      assignment_id: rts.assignment_id,
      description: `Stundenzettel abgelehnt: ${rts.worker_name} (KW ${rts.week_start})`,
      details: { worker_name: rts.worker_name, week_start: rts.week_start, reason: rts.rejection_reason }
    });
  }

  // 3. Timesheets awaiting approval (submitted)
  const { rows: pendingApproval } = await pool.query(
    `SELECT ts.id, ts.assignment_id, ts.worker_name, ts.week_start, ts.total_hours
     FROM timesheets ts
     WHERE (ts.org_id = $1 OR ts.supplier_org_id = $1)
       AND ts.status = 'submitted'
     ORDER BY ts.submitted_at ASC
     LIMIT $2`,
    [orgId, safeLimit]
  );
  for (const pa of pendingApproval) {
    actions.push({
      type: 'pending_approval',
      severity: 'info',
      entity_type: 'timesheet',
      entity_id: pa.id,
      assignment_id: pa.assignment_id,
      description: `Stundenzettel zur Freigabe: ${pa.worker_name} (${pa.total_hours}h)`,
      details: { worker_name: pa.worker_name, week_start: pa.week_start, total_hours: pa.total_hours }
    });
  }

  // 4. Expiring assignments (next 14 days)
  const { rows: expiring } = await pool.query(
    `SELECT a.id, a.worker_description,
            ${workforceAssignmentEffectiveEndDateSql} AS assignment_effective_end_date,
            o.name AS org_name, so.name AS supplier_org_name
     FROM assignments a
     LEFT JOIN organizations o  ON o.id = a.org_id
     LEFT JOIN organizations so ON so.id = a.supplier_org_id
     WHERE (a.org_id = $1 OR a.supplier_org_id = $1)
       AND ${workforceAssignmentIsCurrentSql}
       AND ${workforceAssignmentEffectiveEndDateSql} BETWEEN CURRENT_DATE AND CURRENT_DATE + 14
     ORDER BY ${workforceAssignmentEffectiveEndDateSql} ASC
     LIMIT $2`,
    [orgId, safeLimit]
  );
  for (const ex of expiring) {
    const daysLeft = getCalendarDayDiff(ex.assignment_effective_end_date);
    actions.push({
      type: 'expiring_assignment',
      severity: daysLeft !== null && daysLeft <= 3 ? 'error' : 'warning',
      entity_type: 'assignment',
      entity_id: ex.id,
      assignment_id: ex.id,
      description: `Einsatz endet in ${daysLeft} Tagen: ${ex.worker_description || 'Einsatz'}`,
      details: {
        planned_end_date: ex.assignment_effective_end_date,
        days_remaining: daysLeft,
        org_name: ex.org_name
      }
    });
  }

  // Sort by severity (error > warning > info), then by date
  const severityOrder = { error: 0, warning: 1, info: 2 };
  actions.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

  return actions.slice(0, safeLimit);
}

/* ── Worker Live-Board (Disposition) ─────────────────────────
 * Pro-Worker-Live-Status für die Personaldienstfirma (Supplier-Sicht): verfügbar / im Einsatz /
 * endet bald / inaktiv + offene Stundenzettel. STRIKT org-gebunden auf supplier_org_id. Rein lesend,
 * eine set-basierte Query (LATERAL für den aktuellen Einsatz, kein N+1). KPIs aus den (begrenzten)
 * Rows in JS aggregiert. */
const LIVE_BOARD_ENDS_SOON_DAYS = 7;

/**
 * Live-Belegschaft aus KÄUFER-Sicht (P2.3/3.1): welche Arbeiter sind AKTUELL beim
 * einsetzenden Unternehmen (org_id) im Einsatz. Gescoped auf wal.org_id (die Käufer-Org),
 * NICHT supplier_org_id. „Aktuell" = aktiver Link, datum-gültig (start<=heute<=end) und
 * Lifecycle active/ends_today; freigestellt/abgelehnt zählen nicht. Reines Read-Aggregat.
 */
export async function getCompanyLiveWorkforce(pool, companyOrgId, filters = {}) {
  const scope = { company_org_id: companyOrgId || null, ends_soon_days: LIVE_BOARD_ENDS_SOON_DAYS };
  const emptyKpis = { total: 0, im_einsatz: 0, endet_bald: 0, agencies: 0 };
  if (!companyOrgId) return { available: false, workers: [], kpis: emptyKpis, scope };

  const lifecycleStateSql = buildAssignmentLifecycleStateSql({ assignmentAlias: "a", linkAlias: "wal" });
  const effEndSql = buildAssignmentEffectiveEndDateSql({ assignmentAlias: "a", linkAlias: "wal" });

  const params = [companyOrgId];
  let idx = 2;
  let searchClause = "";
  if (filters.search) {
    searchClause = `AND (wp.first_name ILIKE $${idx} OR wp.last_name ILIKE $${idx} OR so.name ILIKE $${idx})`;
    params.push(`%${filters.search}%`); idx++;
  }
  const limit = Math.min(500, Math.max(1, Number(filters.limit) || 300));

  const { rows } = await pool.query(
    `SELECT wal.id AS link_id, wal.worker_user_id,
            wp.first_name, wp.last_name, wp.personnel_number,
            wal.role, wal.start_date, ${effEndSql} AS effective_end_date,
            wal.default_shift_start::TEXT AS shift_start,
            wal.default_shift_end::TEXT   AS shift_end,
            so.name AS agency_name, wal.supplier_org_id,
            a.worker_description,
            ${lifecycleStateSql} AS lifecycle_state,
            CASE
              WHEN ${effEndSql} IS NOT NULL
                   AND ${effEndSql} <= CURRENT_DATE + ${LIVE_BOARD_ENDS_SOON_DAYS} THEN 'endet_bald'
              ELSE 'im_einsatz'
            END AS live_status
       FROM worker_assignment_links wal
       JOIN assignments a ON a.id = wal.assignment_id
       JOIN users u ON u.id = wal.worker_user_id
       LEFT JOIN worker_profiles wp ON wp.user_id = wal.worker_user_id
       LEFT JOIN organizations so ON so.id = wal.supplier_org_id
      WHERE wal.org_id = $1
        AND wal.is_active = TRUE
        AND wal.worker_confirmation_status NOT IN ('worker_declined','worker_unavailable')
        AND wal.start_date <= CURRENT_DATE
        AND (wal.end_date IS NULL OR wal.end_date >= CURRENT_DATE)
        AND ${lifecycleStateSql} IN ('active','ends_today')
        ${searchClause}
      ORDER BY so.name ASC NULLS LAST, wp.last_name ASC, wp.first_name ASC
      LIMIT ${limit}`,
    params
  );

  const agencies = new Set();
  const kpis = { ...emptyKpis, total: rows.length };
  rows.forEach((r) => {
    if (r.live_status === "endet_bald") kpis.endet_bald++;
    else kpis.im_einsatz++;
    if (r.supplier_org_id) agencies.add(r.supplier_org_id);
  });
  kpis.agencies = agencies.size;

  return { available: true, workers: rows, kpis, scope, generated_at: new Date().toISOString() };
}

export async function getWorkerLiveBoard(pool, supplierOrgId, filters = {}) {
  const scope = { supplier_org_id: supplierOrgId || null, ends_soon_days: LIVE_BOARD_ENDS_SOON_DAYS };
  const emptyKpis = { total: 0, im_einsatz: 0, verfuegbar: 0, endet_bald: 0, inaktiv: 0, open_timesheets: 0, auslastung_pct: 0 };
  if (!supplierOrgId) return { available: false, workers: [], kpis: emptyKpis, scope };

  const lifecycleStateSql = buildAssignmentLifecycleStateSql({ assignmentAlias: "a", linkAlias: "wal" });
  const effEndSql = buildAssignmentEffectiveEndDateSql({ assignmentAlias: "a", linkAlias: "wal" });

  const params = [supplierOrgId];
  let idx = 2;
  let searchClause = "";
  if (filters.search) {
    searchClause = `AND (wp.first_name ILIKE $${idx} OR wp.last_name ILIKE $${idx} OR wp.personnel_number ILIKE $${idx})`;
    params.push(`%${filters.search}%`); idx++;
  }
  const limit = Math.min(500, Math.max(1, Number(filters.limit) || 300));

  const { rows } = await pool.query(
    `SELECT wp.id, wp.user_id, wp.first_name, wp.last_name, wp.personnel_number, wp.is_active,
            cur.assignment_id, cur.assignment_status, cur.client_name, cur.start_date,
            cur.effective_end_date, cur.lifecycle_state,
            COALESCE(ts.pending_count, 0)::int AS open_timesheets,
            CASE
              WHEN wp.is_active = FALSE THEN 'inaktiv'
              WHEN cur.assignment_id IS NULL THEN 'verfuegbar'
              WHEN cur.effective_end_date IS NOT NULL
                   AND cur.effective_end_date <= CURRENT_DATE + ${LIVE_BOARD_ENDS_SOON_DAYS} THEN 'endet_bald'
              ELSE 'im_einsatz'
            END AS live_status
       FROM worker_profiles wp
       LEFT JOIN LATERAL (
         SELECT a.id AS assignment_id, a.status AS assignment_status, o.name AS client_name,
                wal.start_date, ${effEndSql} AS effective_end_date, ${lifecycleStateSql} AS lifecycle_state
           FROM worker_assignment_links wal
           JOIN assignments a ON a.id = wal.assignment_id
           LEFT JOIN organizations o ON o.id = a.org_id
          WHERE wal.worker_user_id = wp.user_id
            AND wal.supplier_org_id = $1
            AND wal.is_active = TRUE
            AND ${lifecycleStateSql} IN ('active', 'ends_today')
          ORDER BY ${effEndSql} ASC NULLS LAST
          LIMIT 1
       ) cur ON TRUE
       LEFT JOIN (
         SELECT worker_user_id, COUNT(*) AS pending_count
           FROM worker_time_submissions
          WHERE supplier_org_id = $1 AND status IN ('submitted', 'under_review')
          GROUP BY worker_user_id
       ) ts ON ts.worker_user_id = wp.user_id
      WHERE wp.supplier_org_id = $1 ${searchClause}
      ORDER BY (CASE WHEN wp.is_active THEN 0 ELSE 1 END), wp.last_name ASC, wp.first_name ASC
      LIMIT ${limit}`,
    params
  );

  const kpis = { ...emptyKpis, total: rows.length };
  rows.forEach((r) => {
    if (r.live_status === "inaktiv") kpis.inaktiv++;
    else if (r.live_status === "verfuegbar") kpis.verfuegbar++;
    else if (r.live_status === "endet_bald") kpis.endet_bald++;
    else if (r.live_status === "im_einsatz") kpis.im_einsatz++;
    kpis.open_timesheets += r.open_timesheets || 0;
  });
  const onAssignment = kpis.im_einsatz + kpis.endet_bald;
  const activeWorkers = kpis.total - kpis.inaktiv;
  kpis.auslastung_pct = activeWorkers > 0 ? Math.round((onAssignment / activeWorkers) * 100) : 0;

  return { available: true, workers: rows, kpis, scope, generated_at: new Date().toISOString() };
}
