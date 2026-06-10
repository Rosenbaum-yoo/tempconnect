/**
 * staffCustomerOperationsService.js — Phase B (Customer Operations).
 *
 * Read-only Aggregat über BESTEHENDE Wahrheiten:
 *   - organizations.customer_stage ('demo','contract_requested','pilot','live')
 *   - organizations.plan ('DEMO','BASIS','PLUS','PRO','INDIVIDUELL')
 *   - subscription_requests-Lifecycle (Status/Typ pro Org)
 *   - org_memberships (aktive Nutzer pro Org)
 *
 * Preserve-first: KEINE neue Lifecycle-Spalte, KEINE Migration. Das Org-Lifecycle
 * ist bewusst dekomponiert (customer_stage = grobe Segmentierung, subscription_requests
 * = granularer Commercial-Prozess) — diese Schicht aggregiert nur. "Domain owns truth,
 * SCC owns aggregation."
 *
 * Sicht: Staff/Owner sehen plattformweit ALLE Kunden (kein Org-Scope) — das ist die
 * legitime SCC-Operatorrolle. Mutierende Aktionen liegen NICHT hier; Statuswechsel
 * laufen über die bestehenden /subscription-requests/*-Transition-Endpunkte
 * (Step-up + Confirm + Reason + Audit).
 */

const OPEN_REQUEST_STATUSES = [
  "submitted", "under_review", "needs_clarification", "offered", "accepted"
];
const STAGES = ["demo", "contract_requested", "pilot", "live"];
const PLANS = ["DEMO", "BASIS", "PLUS", "PRO", "INDIVIDUELL"];
const RISK_LEVELS = ["none", "watch", "elevated"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clampLimit(v, def = 50, max = 200) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, max);
}

function clampOffset(v) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function normEnum(v, allowed) {
  if (v == null) return null;
  const s = String(v).trim();
  return allowed.includes(s) ? s : null;
}

/**
 * Konservatives Risiko-Signal aus REALEN Spalten (kein Fake-Score).
 * Diese Regel ist die Quelle der Wahrheit; listCustomers() spiegelt sie 1:1 als
 * SQL-CASE (für Filter + Pagination). Bei Änderung BEIDE Stellen anpassen.
 */
export function deriveRiskLevel({ customer_stage, onboarding_completed_at, last_request_status } = {}) {
  if (customer_stage === "live" && onboarding_completed_at == null) return "elevated";
  if (last_request_status === "needs_clarification") return "elevated";
  if (last_request_status === "offered" || customer_stage === "contract_requested") return "watch";
  return "none";
}

export function meta() {
  return {
    stages: STAGES.slice(),
    plans: PLANS.slice(),
    risk_levels: RISK_LEVELS.slice(),
    open_request_statuses: OPEN_REQUEST_STATUSES.slice()
  };
}

function mapRow(r) {
  return {
    org_id: r.id,
    name: r.name,
    legal_name: r.legal_name || null,
    plan: r.plan || null,
    customer_stage: r.customer_stage || null,
    pilot_status: r.pilot_status || null,
    onboarded: r.onboarding_completed_at != null,
    onboarding_completed_at: r.onboarding_completed_at || null,
    created_at: r.created_at || null,
    members_active: r.members_active || 0,
    open_requests: r.open_requests || 0,
    last_request: r.last_request_status
      ? { status: r.last_request_status, request_type: r.last_request_type || null, at: r.last_request_at || null }
      : null,
    risk_level: r.risk_level || "none",
    // Betreiber-Kill-Switch (Mig 127): Monitoring-Sicht. Grund/Akteur nur im Detail
    // (zu lang fuer die Roster-Zeile); hier nur ob + seit wann + Kategorie.
    suspended: r.access_suspended_at != null,
    suspended_at: r.access_suspended_at || null,
    suspended_kind: r.access_suspended_kind || null
  };
}

/**
 * Kundenroster (paginiert, gefiltert). Liefert immer eine gültige Antwort —
 * leere Treffermenge => customers:[] + total:0 (Zero-State, nie 500).
 */
export async function listCustomers(pool, opts = {}) {
  const stage = normEnum(opts.stage, STAGES);
  const plan = normEnum(opts.plan, PLANS);
  const risk = normEnum(opts.risk, RISK_LEVELS);
  const searchRaw = opts.search == null ? null : String(opts.search).trim();
  const search = searchRaw ? `%${searchRaw}%` : null;
  const limit = clampLimit(opts.limit);
  const offset = clampOffset(opts.offset);
  // Suspended-Filter (tri-state): null = alle, true = nur gesperrte, false = nur aktive.
  const sv = opts.suspended;
  const suspended = (sv === true || sv === "true" || sv === "1") ? true
    : (sv === false || sv === "false" || sv === "0") ? false
    : null;

  const sql = `
    WITH base AS (
      SELECT
        o.id, o.name, o.legal_name, o.plan, o.customer_stage, o.pilot_status,
        o.onboarding_completed_at, o.created_at,
        o.access_suspended_at, o.access_suspended_kind,
        (SELECT COUNT(*) FROM org_memberships m WHERE m.org_id = o.id AND m.is_active)::int AS members_active,
        (SELECT COUNT(*) FROM subscription_requests sr
           WHERE sr.org_id = o.id AND sr.status = ANY($7::text[]))::int AS open_requests,
        lr.status AS last_request_status,
        lr.request_type AS last_request_type,
        lr.created_at AS last_request_at
      FROM organizations o
      LEFT JOIN LATERAL (
        SELECT status, request_type, created_at
          FROM subscription_requests sr2
         WHERE sr2.org_id = o.id
         ORDER BY sr2.created_at DESC
         LIMIT 1
      ) lr ON TRUE
      WHERE ($1::text IS NULL OR o.customer_stage = $1)
        AND ($2::text IS NULL OR o.plan = $2)
        AND ($3::text IS NULL OR o.name ILIKE $3 OR o.legal_name ILIKE $3)
        AND ($8::boolean IS NULL OR (o.access_suspended_at IS NOT NULL) = $8)
    ),
    scored AS (
      SELECT b.*, CASE
        WHEN b.customer_stage = 'live' AND b.onboarding_completed_at IS NULL THEN 'elevated'
        WHEN b.last_request_status = 'needs_clarification' THEN 'elevated'
        WHEN b.last_request_status = 'offered' OR b.customer_stage = 'contract_requested' THEN 'watch'
        ELSE 'none'
      END AS risk_level
      FROM base b
    )
    SELECT s.*, (COUNT(*) OVER())::int AS total_count
      FROM scored s
     WHERE ($4::text IS NULL OR s.risk_level = $4)
     ORDER BY s.created_at DESC NULLS LAST
     LIMIT $5 OFFSET $6
  `;
  const params = [stage, plan, search, risk, limit, offset, OPEN_REQUEST_STATUSES, suspended];

  const result = await pool.query(sql, params);
  const rows = result.rows || [];
  const total = rows.length > 0 ? rows[0].total_count : 0;

  return {
    available: true,
    customers: rows.map(mapRow),
    total,
    scope: { stage, plan, risk, search: searchRaw || null, suspended, limit, offset },
    generated_at: new Date().toISOString()
  };
}

/**
 * Einzelkunde (Detailansicht). null => 404 (nicht gefunden / ungültige id).
 */
export async function getCustomerDetail(pool, orgId) {
  if (!orgId || !UUID_RE.test(String(orgId))) return null;

  const orgRes = await pool.query(
    `SELECT o.id, o.name, o.legal_name, o.plan, o.customer_stage, o.pilot_status,
            o.billing_contact, o.onboarding_completed_at, o.created_at,
            o.access_suspended_at, o.access_suspended_reason,
            o.access_suspended_kind, o.access_suspended_by,
            (SELECT COUNT(*) FROM org_memberships m WHERE m.org_id = o.id AND m.is_active)::int AS members_active
       FROM organizations o
      WHERE o.id = $1`,
    [orgId]
  );
  const org = orgRes.rows[0];
  if (!org) return null;

  const reqRes = await pool.query(
    `SELECT id, request_type, status, created_at
       FROM subscription_requests
      WHERE org_id = $1
      ORDER BY created_at DESC
      LIMIT 20`,
    [orgId]
  );
  const requests = reqRes.rows || [];

  const risk_level = deriveRiskLevel({
    customer_stage: org.customer_stage,
    onboarding_completed_at: org.onboarding_completed_at,
    last_request_status: requests[0] ? requests[0].status : null
  });

  return {
    available: true,
    customer: {
      org_id: org.id,
      name: org.name,
      legal_name: org.legal_name || null,
      plan: org.plan || null,
      customer_stage: org.customer_stage || null,
      pilot_status: org.pilot_status || null,
      billing_contact: org.billing_contact || null,
      onboarded: org.onboarding_completed_at != null,
      onboarding_completed_at: org.onboarding_completed_at || null,
      created_at: org.created_at || null,
      members_active: org.members_active || 0,
      risk_level,
      // Betreiber-Kill-Switch (Mig 127): voller Sperr-Kontext im Detail.
      suspension: {
        suspended: org.access_suspended_at != null,
        suspended_at: org.access_suspended_at || null,
        reason: org.access_suspended_reason || null,
        kind: org.access_suspended_kind || null,
        suspended_by: org.access_suspended_by || null
      }
    },
    subscription_requests: requests.map((r) => ({
      id: r.id, request_type: r.request_type, status: r.status, at: r.created_at
    })),
    generated_at: new Date().toISOString()
  };
}
