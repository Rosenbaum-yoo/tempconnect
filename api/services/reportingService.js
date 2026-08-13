/**
 * Reporting-Service: KPIs, Executive Dashboard, Requisition-Statistik,
 * Vendor-Performance, Compliance-Uebersicht, Time-to-Fill, SLA-Reports.
 */

import * as spendAnalyticsService from "./spendAnalyticsService.js";
import * as emergencyStaffingService from "./emergencyStaffingService.js";
import { zeroPilotConversionTruth } from "./pilotConversionTruthService.js";
import { zeroSaaSRetentionTruth } from "./retentionMetricsService.js";
import { getRevenueMetrics } from "./revenueMetricsService.js";
import { todayDE, dateOnlyDE } from "../utils/dateDE.js";

const EXECUTIVE_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function zeroRequisitionKpis() {
  return {
    total: 0,
    open: 0,
    approved: 0,
    in_review: 0,
    shortlisted: 0,
    partially_filled: 0,   // Migration 113 — einige, nicht alle Headcount-Positionen besetzt
    filled: 0,
    closed: 0,
    cancelled: 0,
    draft: 0,
    pending_approval: 0,
    urgent_open: 0,
    avg_time_to_fill_hours: null,
    avg_time_to_approve_hours: null
  };
}

function zeroComplianceSummary() {
  return {
    total_documents: 0,
    verified: 0,
    pending: 0,
    rejected: 0,
    expired: 0,
    expiring_soon: 0
  };
}

function zeroSlaReport() {
  return {
    total_with_sla: 0,
    sla_met: 0,
    sla_breached: 0,
    sla_running: 0,
    sla_compliance_pct: null
  };
}

function zeroPlatformStats() {
  return {
    total_users: 0,
    total_orgs: 0,
    active_capacity_posts: 0,
    open_demands: 0,
    active_vendor_entries: 0
  };
}

function zeroSpendSummary(available = true) {
  return {
    available,
    has_data: false,
    total_spend_cents: 0,
    overtime_spend_cents: 0,
    projected_spend_cents: 0,
    over_rate_spend_cents: 0,
    over_rate_count: 0,
    assignment_count: 0,
    active_assignments: 0,
    vendor_count: 0,
    avg_rate_cents: 0,
    timesheet_count: 0,
    total_hours: 0
  };
}

function zeroProcurementPulse(window) {
  return {
    available: false,
    window,
    metrics: {},
    tiles: [],
    message: 'Procurement Pulse derzeit nicht verfügbar.'
  };
}

function zeroExecutiveFinanceTruth(available = true) {
  return {
    available,
    subscription_truth: {
      catalog_mrr_theoretical: 0,
      contractually_active_mrr: 0,
      catalog_price_missing_count: 0,
      pending_quote_subscribers: 0
    },
    invoice_truth: {
      available: false,
      total_count: 0,
      draft_count: 0,
      issued_count: 0,
      overdue_count: 0,
      paid_count: 0,
      void_count: 0,
      invoiced_revenue_cents: 0,
      paid_revenue_cents: 0,
      open_receivables_cents: 0,
      overdue_receivables_cents: 0,
      operational_count: 0,
      subscription_count: 0
    },
    payment_truth: {
      available: false,
      completed_count: 0,
      completed_amount_cents: 0,
      pending_count: 0,
      failed_count: 0,
      expired_count: 0
    },
    billable_truth: {
      available: false,
      approved_uninvoiced_timesheets: 0,
      approved_uninvoiced_hours: 0,
      approved_uninvoiced_amount_cents: 0,
      missing_rate_count: 0
    },
    reconciliation_30d: {
      available: false,
      approved_spend_30d_cents: 0,
      operational_invoiced_30d_cents: 0,
      spend_invoice_gap_cents: 0,
      coverage_ratio_pct: null,
      operational_invoiced_available: false
    },
    retention_truth: zeroSaaSRetentionTruth(EXECUTIVE_WINDOW_DAYS),
    pilot_conversion_truth: zeroPilotConversionTruth(),
    pricing_state_breakdown: []
  };
}
const EXECUTIVE_FINANCE_EXPORT_SOURCE = 'revenueMetricsService.getRevenueMetrics';
const SUBSCRIPTION_EXPORT_FIELDS = [
  { key: 'catalog_mrr_theoretical', unit: 'eur' },
  { key: 'contractually_active_mrr', unit: 'eur' },
  { key: 'catalog_price_missing_count', unit: 'count' },
  { key: 'pending_quote_subscribers', unit: 'count' }
];
const INVOICE_EXPORT_FIELDS = [
  { key: 'total_count', unit: 'count' },
  { key: 'draft_count', unit: 'count' },
  { key: 'issued_count', unit: 'count' },
  { key: 'overdue_count', unit: 'count' },
  { key: 'paid_count', unit: 'count' },
  { key: 'void_count', unit: 'count' },
  { key: 'invoiced_revenue_cents', unit: 'cents' },
  { key: 'paid_revenue_cents', unit: 'cents' },
  { key: 'open_receivables_cents', unit: 'cents' },
  { key: 'overdue_receivables_cents', unit: 'cents' },
  { key: 'operational_count', unit: 'count' },
  { key: 'subscription_count', unit: 'count' }
];
const PAYMENT_EXPORT_FIELDS = [
  { key: 'completed_count', unit: 'count' },
  { key: 'completed_amount_cents', unit: 'cents' },
  { key: 'pending_count', unit: 'count' },
  { key: 'failed_count', unit: 'count' },
  { key: 'expired_count', unit: 'count' }
];
const BILLABLE_EXPORT_FIELDS = [
  { key: 'approved_uninvoiced_timesheets', unit: 'count' },
  { key: 'approved_uninvoiced_hours', unit: 'hours' },
  { key: 'approved_uninvoiced_amount_cents', unit: 'cents' },
  { key: 'missing_rate_count', unit: 'count' }
];
const RECONCILIATION_EXPORT_FIELDS = [
  { key: 'approved_spend_30d_cents', unit: 'cents' },
  { key: 'operational_invoiced_30d_cents', unit: 'cents' },
  { key: 'spend_invoice_gap_cents', unit: 'cents' },
  { key: 'coverage_ratio_pct', unit: 'percent' },
  { key: 'operational_invoiced_available', unit: 'bool' }
];

function zeroCriticalStaffing(window, available = true) {
  return {
    available,
    window,
    total: 0,
    summary: {
      risk: 0,
      warn: 0,
      emergency_open: 0
    },
    items: []
  };
}

// F2/HEUTE_IN_UTC: `.toISOString().slice(0,10)` schneidet nach UTC. In Europe/Berlin
// ist das zwischen 00:00 und 02:00 der Vortag. Der Fensterrand ist ein nutzersichtbarer
// Kalendertag (Scope-Leiste), also als Berliner Datum bilden.
function toIsoDate(date) {
  return dateOnlyDE(date);
}

function buildWindow(days = EXECUTIVE_WINDOW_DAYS) {
  const to = new Date();
  const from = new Date(to.getTime() - ((days - 1) * MS_PER_DAY));
  return {
    days,
    label: `${days} Tage`,
    date_from: toIsoDate(from),
    // F2/HEUTE_IN_UTC: Fensterende ist "heute". Nach UTC geschnitten stand hier nachts
    // "Zeitraum 14.07.-11.08.", obwohl bereits der 12.08. war — die Fensterlaenge stimmte,
    // die genannten Kalendertage waren um einen Tag verschoben.
    date_to: todayDE()
  };
}

function toInt(value) {
  return Number.parseInt(value, 10) || 0;
}


function buildDrilldown(basePath, params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      qs.set(key, String(value));
    }
  });
  const queryString = qs.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

function metricTone(value, { warnAt = null, riskAt = null, inverse = false } = {}) {
  if (value == null) return 'neutral';
  if (inverse) {
    if (riskAt != null && value <= riskAt) return 'risk';
    if (warnAt != null && value <= warnAt) return 'warn';
    return 'ok';
  }
  if (riskAt != null && value >= riskAt) return 'risk';
  if (warnAt != null && value >= warnAt) return 'warn';
  return 'ok';
}

function spendHasData(spend) {
  return Boolean(
    toInt(spend.assignment_count)
    || toInt(spend.active_assignments)
    || toInt(spend.vendor_count)
    || toInt(spend.timesheet_count)
    || toInt(spend.total_spend_cents)
    || Number(spend.total_hours || 0)
  );
}

function buildMetric({
  key,
  label,
  value = null,
  value_cents = null,
  tone = 'neutral',
  href = null,
  description = '',
  available = true,
  basis = null,
  breakdown = null
}) {
  return {
    key,
    label,
    value: value_cents != null ? null : value,
    value_cents,
    tone: available ? tone : 'neutral',
    href,
    description,
    available,
    basis,
    breakdown
  };
}

function calculateDaysToStart(startDate) {
  if (!startDate) return null;
  const target = new Date(`${startDate}T00:00:00Z`);
  return Math.round((target.getTime() - Date.now()) / MS_PER_DAY);
}

function calculateRequisitionPressureScore(item) {
  let score = 0;

  if (item.urgency === 'notdienst') score += 70;
  else if (item.urgency === 'urgent') score += 55;
  else if (item.urgency === 'high') score += 35;
  else score += 10;

  if (item.status === 'OPEN') score += 20;
  else if (item.status === 'IN_REVIEW') score += 15;
  else if (item.status === 'SHORTLISTED') score += 8;
  else if (item.status === 'PENDING_APPROVAL') score += 15;
  else if (item.status === 'APPROVED') score += 10;

  if (item.age_days >= 21) score += 28;
  else if (item.age_days >= 14) score += 22;
  else if (item.age_days >= 7) score += 14;
  else if (item.age_days >= 3) score += 8;

  if (item.days_to_start != null) {
    if (item.days_to_start < 0) score += 35;
    else if (item.days_to_start <= 2) score += 30;
    else if (item.days_to_start <= 7) score += 20;
    else if (item.days_to_start <= 14) score += 10;
  }

  if (item.open_headcount >= 10) score += 28;
  else if (item.open_headcount >= 5) score += 20;
  else if (item.open_headcount >= 3) score += 12;
  else if (item.open_headcount >= 2) score += 8;

  if (item.candidate_count === 0) score += 30;
  else if (item.candidate_count < item.open_headcount) score += 18;
  else if (item.candidate_count < item.headcount) score += 10;

  if (item.shortlisted_count === 0) score += 12;
  else if (item.shortlisted_count < item.open_headcount) score += 6;

  if (item.accepted_count === 0) score += 10;
  else if (item.accepted_count < item.headcount) score += 5;

  if (item.supplier_count === 0) score += 12;
  else if (item.supplier_count === 1) score += 6;

  if (item.sla_status === 'BREACHED') score += 24;
  else if (item.sla_status === 'RUNNING') score += 6;

  return score;
}

function calculateEmergencyPressureScore(item) {
  let score = 0;
  const urgencyConfig = typeof emergencyStaffingService.getUrgencyConfig === 'function'
    ? emergencyStaffingService.getUrgencyConfig(item.urgency)
    : null;
  const responseWindowMinutes = toInt(urgencyConfig?.responseWindow);

  if (item.urgency === 'notdienst') score += 95;
  else if (item.urgency === 'critical') score += 85;
  else if (item.urgency === 'urgent') score += 70;
  else score += 40;

  if (item.sla_overdue || item.sla_status === 'BREACHED') score += 35;

  if (responseWindowMinutes > 0) {
    if (item.age_minutes >= responseWindowMinutes * 6) score += 28;
    else if (item.age_minutes >= responseWindowMinutes * 3) score += 20;
    else if (item.age_minutes >= responseWindowMinutes) score += 10;
  } else if (item.age_days >= 3) score += 18;
  else if (item.age_days >= 1) score += 10;

  if (item.days_to_start != null) {
    if (item.days_to_start < 0) score += 30;
    else if (item.days_to_start <= 1) score += 20;
    else if (item.days_to_start <= 3) score += 12;
  }

  if (item.open_headcount >= 10) score += 26;
  else if (item.open_headcount >= 5) score += 18;
  else if (item.open_headcount >= 3) score += 10;
  else if (item.open_headcount >= 1) score += 6;

  if (item.committed_count === 0) score += 14;
  if (item.response_count === 0) score += 10;

  return score;
}

function pressureTone(score) {
  if (score >= 95) return 'risk';
  if (score >= 55) return 'warn';
  return 'ok';
}

function buildRequisitionPressureReasons(item) {
  const reasons = [];
  if (item.urgency === 'notdienst') reasons.push('Notdienst');
  else if (item.urgency === 'urgent') reasons.push('Dringende Anfrage');
  else if (item.urgency === 'high') reasons.push('Hohe Priorität');

  if (item.days_to_start != null) {
    if (item.days_to_start < 0) reasons.push('Startdatum überschritten');
    else if (item.days_to_start <= 2) reasons.push(`Start in ${item.days_to_start} Tagen`);
    else if (item.days_to_start <= 7) reasons.push(`Start in ${item.days_to_start} Tagen`);
  }

  if (item.age_days >= 14) reasons.push(`${item.age_days} Tage offen`);
  if (item.open_headcount > 0) reasons.push(`${item.open_headcount} Stellen offen`);
  if (item.candidate_count === 0) reasons.push('Noch keine Kandidaten');
  else if (item.shortlisted_count === 0) reasons.push('Keine Shortlist');
  else if (item.accepted_count < item.headcount) reasons.push('Besetzung noch nicht gedeckt');

  if (item.sla_status === 'BREACHED') reasons.push('SLA verletzt');

  return reasons.slice(0, 4);
}

function buildEmergencyPressureReasons(item) {
  const reasons = [];
  if (item.urgency === 'notdienst') reasons.push('Notdienst');
  else if (item.urgency === 'critical') reasons.push('Kritischer Demand');
  else if (item.urgency === 'urgent') reasons.push('Dringender Demand');

  if (item.sla_overdue || item.sla_status === 'BREACHED') reasons.push('SLA überfällig');
  if (item.days_to_start != null) {
    if (item.days_to_start < 0) reasons.push('Startdatum überschritten');
    else if (item.days_to_start <= 1) reasons.push(`Start in ${item.days_to_start} Tagen`);
    else if (item.days_to_start <= 3) reasons.push(`Start in ${item.days_to_start} Tagen`);
  }
  if (item.open_headcount > 0) reasons.push(`${item.open_headcount} Kräfte offen`);
  if (item.response_count === 0) reasons.push('Noch keine Supplier-Reaktion');
  if (item.committed_count === 0) reasons.push('Keine Zusagen');

  return reasons.slice(0, 4);
}

async function getPlatformStats(pool) {
  const { rows: platform } = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM users WHERE is_active = TRUE) AS total_users,
       (SELECT COUNT(*)::int FROM organizations WHERE is_active = TRUE) AS total_orgs,
       (SELECT COUNT(*)::int FROM capacity_posts WHERE is_active = TRUE) AS active_capacity_posts,
       (SELECT COUNT(*)::int FROM demand_requests WHERE status = 'open') AS open_demands,
       (SELECT COUNT(*)::int FROM vendor_pool WHERE status = 'active') AS active_vendor_entries`
  );
  return { ...zeroPlatformStats(), ...(platform[0] || {}) };
}

async function getExecutiveSpendSummary(pool, orgId, window, locationId = null) {
  if (!orgId) return zeroSpendSummary(false);
  try {
    const spend = await spendAnalyticsService.getSpendSummary(pool, orgId, {
      dateFrom: window.date_from,
      dateTo: window.date_to,
      locationId: locationId || null
    });
    return {
      ...zeroSpendSummary(true),
      ...spend,
      available: true,
      has_data: spendHasData(spend)
    };
  } catch {
    return zeroSpendSummary(false);
  }
}

async function getExecutiveFinanceTruth(pool, orgId) {
  try {
    const revenue = await getRevenueMetrics(pool, { orgId });
    const fallback = zeroExecutiveFinanceTruth(true);
    return {
      available: true,
      subscription_truth: revenue.subscription_truth || fallback.subscription_truth,
      invoice_truth: revenue.invoice_truth || fallback.invoice_truth,
      payment_truth: revenue.payment_truth || fallback.payment_truth,
      billable_truth: revenue.billable_truth || fallback.billable_truth,
      reconciliation_30d: revenue.reconciliation_30d || fallback.reconciliation_30d,
      retention_truth: revenue.retention_truth || fallback.retention_truth,
      pilot_conversion_truth: revenue.pilot_conversion_truth || fallback.pilot_conversion_truth,
      pricing_state_breakdown: Array.isArray(revenue.pricing_state_breakdown)
        ? revenue.pricing_state_breakdown
        : []
    };
  } catch {
    return zeroExecutiveFinanceTruth(false);
  }
}

function csvEscape(value) {
  if (value == null) return '';
  const text = String(value);
  if (/[",\n\r]/u.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function buildSectionRows(section, data, fields, available) {
  return fields.map(({ key, unit }) => ({
    section,
    metric_key: key,
    metric_value: data?.[key] ?? null,
    unit,
    available: Boolean(available),
    source: EXECUTIVE_FINANCE_EXPORT_SOURCE
  }));
}

function buildPricingStateRows(pricingStateBreakdown, available) {
  const rows = [];
  for (const row of pricingStateBreakdown || []) {
    const sourceKey = String(row?.source || 'unknown');
    rows.push({
      section: 'pricing_state_breakdown',
      metric_key: `${sourceKey}.subscribers`,
      metric_value: toInt(row?.subscribers),
      unit: 'count',
      available: Boolean(available),
      source: EXECUTIVE_FINANCE_EXPORT_SOURCE
    });
    rows.push({
      section: 'pricing_state_breakdown',
      metric_key: `${sourceKey}.mrr`,
      metric_value: toInt(row?.mrr),
      unit: 'eur',
      available: Boolean(available),
      source: EXECUTIVE_FINANCE_EXPORT_SOURCE
    });
    rows.push({
      section: 'pricing_state_breakdown',
      metric_key: `${sourceKey}.arr`,
      metric_value: toInt(row?.arr),
      unit: 'eur',
      available: Boolean(available),
      source: EXECUTIVE_FINANCE_EXPORT_SOURCE
    });
  }
  return rows;
}

function mergeExecutiveFinanceTruth(financeTruth) {
  const fallback = zeroExecutiveFinanceTruth(false);
  return {
    ...fallback,
    ...(financeTruth || {}),
    subscription_truth: {
      ...fallback.subscription_truth,
      ...(financeTruth?.subscription_truth || {})
    },
    invoice_truth: {
      ...fallback.invoice_truth,
      ...(financeTruth?.invoice_truth || {})
    },
    payment_truth: {
      ...fallback.payment_truth,
      ...(financeTruth?.payment_truth || {})
    },
    billable_truth: {
      ...fallback.billable_truth,
      ...(financeTruth?.billable_truth || {})
    },
    reconciliation_30d: {
      ...fallback.reconciliation_30d,
      ...(financeTruth?.reconciliation_30d || {})
    },
    pilot_conversion_truth: {
      ...fallback.pilot_conversion_truth,
      ...(financeTruth?.pilot_conversion_truth || {})
    },
    pricing_state_breakdown: Array.isArray(financeTruth?.pricing_state_breakdown)
      ? financeTruth.pricing_state_breakdown
      : []
  };
}

export function buildExecutiveFinanceTruthRows(financeTruth = {}) {
  const merged = mergeExecutiveFinanceTruth(financeTruth);
  return [
    ...buildSectionRows(
      'subscription_truth',
      merged.subscription_truth,
      SUBSCRIPTION_EXPORT_FIELDS,
      merged.available
    ),
    ...buildSectionRows(
      'invoice_truth',
      merged.invoice_truth,
      INVOICE_EXPORT_FIELDS,
      merged.invoice_truth?.available
    ),
    ...buildSectionRows(
      'payment_truth',
      merged.payment_truth,
      PAYMENT_EXPORT_FIELDS,
      merged.payment_truth?.available
    ),
    ...buildSectionRows(
      'billable_truth',
      merged.billable_truth,
      BILLABLE_EXPORT_FIELDS,
      merged.billable_truth?.available
    ),
    ...buildSectionRows(
      'reconciliation_30d',
      merged.reconciliation_30d,
      RECONCILIATION_EXPORT_FIELDS,
      merged.reconciliation_30d?.available
    ),
    ...buildPricingStateRows(merged.pricing_state_breakdown, merged.available)
  ];
}

export function renderExecutiveFinanceTruthCsv(rows = [], context = {}) {
  const generatedAt = context.generatedAt || new Date().toISOString();
  const orgId = context.orgId || '';
  const header = [
    'generated_at',
    'org_id',
    'section',
    'metric_key',
    'metric_value',
    'unit',
    'available',
    'source'
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([
      generatedAt,
      orgId,
      row.section,
      row.metric_key,
      row.metric_value,
      row.unit,
      row.available,
      row.source
    ].map(csvEscape).join(','));
  }
  return lines.join('\n');
}

export async function executiveFinanceTruthExport(pool, orgId = null) {
  const generatedAt = new Date().toISOString();
  const finance = await getExecutiveFinanceTruth(pool, orgId);
  const rows = buildExecutiveFinanceTruthRows(finance);
  return {
    generated_at: generatedAt,
    org_id: orgId || null,
    source: EXECUTIVE_FINANCE_EXPORT_SOURCE,
    finance,
    rows,
    csv: renderExecutiveFinanceTruthCsv(rows, {
      generatedAt,
      orgId: orgId || ''
    })
  };
}

async function queryActiveVendors30d(pool, orgId, window, locationId = null) {
  const params = [orgId || null, `${window.date_from}T00:00:00.000Z`, window.date_from];
  // Standortfilter auf Requisitions-Ebene: nur Kandidaten-Aktivitaet fuer den Standort zaehlen
  let rcLocationClause = '';
  let aLocationClause = '';
  if (locationId) {
    params.push(locationId);
    const locIdx = params.length;
    rcLocationClause = `AND r.location_id = $${locIdx}::uuid`;
    aLocationClause = `AND EXISTS (SELECT 1 FROM requisitions rq WHERE rq.id = a.requisition_id AND rq.location_id = $${locIdx}::uuid)`;
  }
  const { rows: [row] } = await pool.query(
    `SELECT COUNT(DISTINCT vp.supplier_org_id)::int AS active_vendors_30d
     FROM vendor_pool vp
     WHERE ($1::uuid IS NULL OR vp.client_org_id = $1)
       AND vp.status = 'active'
       AND EXISTS (
         SELECT 1
         FROM requisition_candidates rc
         JOIN requisitions r ON r.id = rc.requisition_id
         WHERE r.org_id = vp.client_org_id
           AND rc.supplier_org_id = vp.supplier_org_id
           AND rc.created_at >= $2::timestamptz
           ${rcLocationClause}
         UNION
         SELECT 1
         FROM assignments a
         LEFT JOIN timesheets t
           ON t.assignment_id = a.id
          AND t.status = 'approved'
          AND t.week_start >= $3::date
         WHERE a.org_id = vp.client_org_id
           AND a.supplier_org_id = vp.supplier_org_id
           ${aLocationClause}
           AND (
             a.created_at >= $2::timestamptz
             OR a.updated_at >= $2::timestamptz
             OR t.id IS NOT NULL
           )
       )`,
    params
  );
  return toInt(row?.active_vendors_30d);
}

async function queryActiveRateCardsInWindow(pool, orgId, window) {
  const { rows: [row] } = await pool.query(
    `SELECT COUNT(*)::int AS active_rate_cards_window
     FROM rate_cards rc
     WHERE ($1::uuid IS NULL OR rc.org_id = $1)
       AND rc.status = 'active'
       AND rc.valid_from <= $3::date
       AND COALESCE(rc.valid_to, $3::date) >= $2::date`,
    [orgId || null, window.date_from, window.date_to]
  );
  return toInt(row?.active_rate_cards_window);
}

async function queryComplianceWarningBreakdown(pool, orgId) {
  const base = {
    rejected_documents: 0,
    expired_documents: 0,
    expiring_documents: 0,
    rate_card_warnings: 0,
    rate_card_breaches: 0
  };
  let available = false;

  try {
    const { rows: [docs] } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE cd.status = 'rejected')::int AS rejected_documents,
         COUNT(*) FILTER (WHERE cd.status = 'expired')::int AS expired_documents,
         COUNT(*) FILTER (
           WHERE cd.status = 'verified'
             AND cd.valid_until IS NOT NULL
             AND cd.valid_until <= NOW() + INTERVAL '30 days'
         )::int AS expiring_documents
       FROM compliance_documents cd
       WHERE ($1::uuid IS NULL OR cd.org_id = $1)`,
      [orgId || null]
    );
    if (docs) {
      base.rejected_documents = toInt(docs.rejected_documents);
      base.expired_documents = toInt(docs.expired_documents);
      base.expiring_documents = toInt(docs.expiring_documents);
      available = true;
    }
  } catch {
    // Graceful degradation
  }

  try {
    const { rows: [checks] } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE compliance_status = 'warning')::int AS rate_card_warnings,
         COUNT(*) FILTER (WHERE compliance_status = 'non_compliant')::int AS rate_card_breaches
       FROM rate_card_checks
       WHERE ($1::uuid IS NULL OR org_id = $1)
         AND checked_at >= NOW() - INTERVAL '30 days'`,
      [orgId || null]
    );
    if (checks) {
      base.rate_card_warnings = toInt(checks.rate_card_warnings);
      base.rate_card_breaches = toInt(checks.rate_card_breaches);
      available = true;
    }
  } catch {
    // Graceful degradation
  }

  return {
    available,
    breakdown: {
      ...base,
      total:
        base.rejected_documents
        + base.expired_documents
        + base.expiring_documents
        + base.rate_card_warnings
        + base.rate_card_breaches
    }
  };
}

async function getProcurementPulse(pool, orgId, window, requisitions, spend, locationId = null) {
  const openRequisitions =
    toInt(requisitions.open)
    + toInt(requisitions.in_review)
    + toInt(requisitions.shortlisted)
    + toInt(requisitions.approved)
    + toInt(requisitions.pending_approval);

  // Standortparameter fuer Drilldown-URLs
  const locParam = locationId ? { location_id: locationId } : {};

  let activeVendors = { available: false, value: null };
  let activeRateCards = { available: false, value: null };
  let complianceWarnings = { available: false, breakdown: { total: 0 } };

  try {
    activeVendors = {
      available: true,
      value: await queryActiveVendors30d(pool, orgId, window, locationId)
    };
  } catch {
    activeVendors = { available: false, value: null };
  }

  try {
    activeRateCards = {
      available: true,
      value: await queryActiveRateCardsInWindow(pool, orgId, window)
      // Rate Cards haben keine location_id — org-scoped bleibt korrekt
    };
  } catch {
    activeRateCards = { available: false, value: null };
  }

  complianceWarnings = await queryComplianceWarningBreakdown(pool, orgId);

  const metrics = {
    open_requisitions: buildMetric({
      key: 'open_requisitions',
      label: 'Offene Requisitions',
      value: openRequisitions,
      tone: metricTone(openRequisitions, { warnAt: 8, riskAt: 20 }),
      href: buildDrilldown('/public/requisitions.html', { status_group: 'backlog', ...locParam }),
      description: 'Aktueller Beschaffungs-Backlog im Status OPEN, IN_REVIEW, SHORTLISTED, APPROVED oder PENDING_APPROVAL.',
      basis: 'current_backlog'
    }),
    active_vendors_30d: buildMetric({
      key: 'active_vendors_30d',
      label: 'Aktive Vendoren',
      value: activeVendors.value,
      tone: activeVendors.value === 0 ? 'risk' : (activeVendors.value != null && activeVendors.value < 3 ? 'warn' : 'ok'),
      href: buildDrilldown('/public/vendor_pool.html', { status_group: 'activity_30d', ...locParam }),
      description: 'Aktive Pool-Vendoren mit echter buyer-seitiger Aktivität in den letzten 30 Tagen: Kandidateneinreichung, Assignment-Aktivität oder freigegebene Timesheets.',
      available: activeVendors.available,
      basis: 'activity_30d'
    }),
    active_rate_cards: buildMetric({
      key: 'active_rate_cards',
      label: 'Aktive Rate Cards',
      value: activeRateCards.value,
      tone: activeRateCards.value === 0 ? 'risk' : (activeRateCards.value != null && activeRateCards.value < 5 ? 'warn' : 'ok'),
      href: buildDrilldown('/public/rate-cards.html', {
        status_group: 'window_overlap_30d',
        status: 'active',
        date_from: window.date_from,
        date_to: window.date_to
        // Rate Cards org-scoped — kein locParam hier
      }),
      description: 'Rate Cards mit aktivem Status, deren Gültigkeit das aktuelle 30-Tage-Fenster überlappt.',
      available: activeRateCards.available,
      basis: 'window_overlap_30d'
    }),
    spend_30d: buildMetric({
      key: 'spend_30d',
      label: 'Spend 30 Tage',
      value_cents: spend.available ? toInt(spend.total_spend_cents) : null,
      tone: 'neutral',
      href: buildDrilldown('/public/spend-analytics.html', {
        date_from: window.date_from,
        date_to: window.date_to,
        ...locParam
      }),
      description: 'Freigegebener Spend aus Timesheets im aktuellen 30-Tage-Fenster.',
      available: spend.available,
      basis: 'approved_timesheets_30d'
    }),
    compliance_warnings: buildMetric({
      key: 'compliance_warnings',
      label: 'Compliance Warnungen',
      value: complianceWarnings.breakdown.total,
      tone: metricTone(complianceWarnings.breakdown.total, { warnAt: 1, riskAt: 5 }),
      href: buildDrilldown('/public/compliance_overview.html', { status_group: 'risk_window_30d' }),
      description: 'Aktuelle Risiken für die nächsten 30 Tage: abgelehnte, abgelaufene oder bald ablaufende Dokumente sowie Rate-Card-Warnungen und Verstöße der letzten 30 Tage.',
      available: complianceWarnings.available,
      basis: 'risk_window_30d',
      breakdown: complianceWarnings.breakdown
    })
  };

  return {
    available: true,
    window,
    metrics,
    tiles: [
      metrics.open_requisitions,
      metrics.active_vendors_30d,
      metrics.active_rate_cards,
      metrics.spend_30d,
      metrics.compliance_warnings
    ]
  };
}

async function queryCriticalRequisitionRows(pool, orgId, locationId = null) {
  const params = [orgId || null];
  let locationClause = '';
  if (locationId) {
    params.push(locationId);
    locationClause = `AND r.location_id = $${params.length}::uuid`;
  }
  const { rows } = await pool.query(
    `SELECT
       r.id,
       r.title,
       r.role,
       r.status,
       r.urgency,
       r.headcount,
       r.start_date,
       r.created_at,
       r.sla_status,
       COUNT(rc.id)::int AS candidate_count,
       COUNT(rc.id) FILTER (WHERE rc.status = 'shortlisted')::int AS shortlisted_count,
       COUNT(rc.id) FILTER (WHERE rc.status = 'accepted')::int AS accepted_count,
       COUNT(DISTINCT rc.supplier_org_id) FILTER (WHERE rc.supplier_org_id IS NOT NULL)::int AS supplier_count
     FROM requisitions r
     LEFT JOIN requisition_candidates rc ON rc.requisition_id = r.id
     WHERE ($1::uuid IS NULL OR r.org_id = $1)
       AND r.status IN ('PENDING_APPROVAL', 'APPROVED', 'OPEN', 'IN_REVIEW', 'SHORTLISTED')
       ${locationClause}
     GROUP BY r.id
     ORDER BY r.created_at ASC`,
    params
  );
  return rows;
}

function mapCriticalRequisition(row) {
  const headcount = Math.max(toInt(row.headcount), 1);
  const acceptedCount = toInt(row.accepted_count);
  const item = {
    kind: 'requisition',
    id: row.id,
    title: row.title,
    role: row.role,
    status: row.status,
    urgency: row.urgency || 'normal',
    headcount,
    open_headcount: Math.max(headcount - acceptedCount, 0),
    candidate_count: toInt(row.candidate_count),
    shortlisted_count: toInt(row.shortlisted_count),
    accepted_count: acceptedCount,
    supplier_count: toInt(row.supplier_count),
    created_at: row.created_at,
    age_days: Math.max(0, Math.floor((Date.now() - new Date(row.created_at).getTime()) / MS_PER_DAY)),
    start_date: row.start_date || null,
    days_to_start: calculateDaysToStart(row.start_date),
    sla_status: row.sla_status || null,
    href: buildDrilldown('/public/requisitions.html', { focus_id: row.id })
  };
  item.pressure_score = calculateRequisitionPressureScore(item);
  item.tone = pressureTone(item.pressure_score);
  item.reasons = buildRequisitionPressureReasons(item);
  return item;
}

function mapCriticalEmergency(row) {
  const headcount = Math.max(toInt(row.required_total_count ?? row.headcount), 1);
  const committedCount = toInt(row.currently_committed_count);
  const responseCount = toInt(row.supplier_response_count ?? row.response_count);
  const ageMinutes = toInt(row.age_minutes);
  const item = {
    kind: 'emergency',
    id: row.id,
    title: row.title,
    role: row.role,
    status: row.status || 'open',
    urgency: row.urgency || 'urgent',
    headcount,
    committed_count: committedCount,
    response_count: responseCount,
    open_headcount: Math.max(toInt(row.remaining_open_count ?? (headcount - committedCount)), 0),
    created_at: row.created_at,
    age_days: Math.max(0, Math.floor(ageMinutes / (24 * 60))),
    age_minutes: ageMinutes,
    start_date: row.start_date || null,
    days_to_start: calculateDaysToStart(row.start_date),
    sla_status: row.sla_status || null,
    sla_overdue: Boolean(row.sla_overdue),
    href: buildDrilldown('/public/marketplace_demand_detail.html', { id: row.id })
  };
  item.pressure_score = calculateEmergencyPressureScore(item);
  item.tone = pressureTone(item.pressure_score);
  item.reasons = buildEmergencyPressureReasons(item);
  return item;
}

async function getCriticalStaffingPressure(pool, orgId, window, locationId = null) {
  let requisitionItems = [];
  let emergencyItems = [];
  let available = false;

  try {
    const rows = await queryCriticalRequisitionRows(pool, orgId, locationId);
    requisitionItems = rows.map(mapCriticalRequisition);
    available = true;
  } catch {
    requisitionItems = [];
  }

  try {
    const emergencies = await emergencyStaffingService.getActiveEmergencies(pool, orgId);
    emergencyItems = emergencies.map(mapCriticalEmergency);
    available = true;
  } catch {
    emergencyItems = [];
  }

  if (!available) return zeroCriticalStaffing(window, false);

  const items = [...requisitionItems, ...emergencyItems]
    .filter(item => item.pressure_score >= 55)
    .sort((a, b) => b.pressure_score - a.pressure_score || b.open_headcount - a.open_headcount)
    .slice(0, 8);

  return {
    available: true,
    window,
    total: items.length,
    summary: {
      risk: items.filter(item => item.tone === 'risk').length,
      warn: items.filter(item => item.tone === 'warn').length,
      emergency_open: items.filter(item => item.kind === 'emergency').length
    },
    items
  };
}

/* ── Requisition KPIs ─────────────────────────────────── */

export async function requisitionKpis(pool, orgId = null, locationId = null) {
  const conditions = [];
  const params = [];
  if (orgId) { params.push(orgId); conditions.push(`r.org_id = $${params.length}`); }
  if (locationId) { params.push(locationId); conditions.push(`r.location_id = $${params.length}::uuid`); }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE r.status = 'OPEN')::int AS open,
       COUNT(*) FILTER (WHERE r.status = 'APPROVED')::int AS approved,
       COUNT(*) FILTER (WHERE r.status = 'IN_REVIEW')::int AS in_review,
       COUNT(*) FILTER (WHERE r.status = 'SHORTLISTED')::int AS shortlisted,
       COUNT(*) FILTER (WHERE r.status = 'PARTIALLY_FILLED')::int AS partially_filled,
       COUNT(*) FILTER (WHERE r.status = 'FILLED')::int AS filled,
       COUNT(*) FILTER (WHERE r.status = 'CLOSED')::int AS closed,
       COUNT(*) FILTER (WHERE r.status = 'CANCELLED')::int AS cancelled,
       COUNT(*) FILTER (WHERE r.status = 'DRAFT')::int AS draft,
       COUNT(*) FILTER (WHERE r.status = 'PENDING_APPROVAL')::int AS pending_approval,
       COUNT(*) FILTER (WHERE r.urgency = 'urgent' AND r.status IN ('OPEN','IN_REVIEW'))::int AS urgent_open,
       ROUND(AVG(EXTRACT(EPOCH FROM (r.filled_at - r.created_at)) / 3600)
         FILTER (WHERE r.filled_at IS NOT NULL), 1) AS avg_time_to_fill_hours,
       ROUND(AVG(EXTRACT(EPOCH FROM (r.approved_at - r.created_at)) / 3600)
         FILTER (WHERE r.approved_at IS NOT NULL), 1) AS avg_time_to_approve_hours
     FROM requisitions r
     ${whereClause}`,
    params
  );
  return { ...zeroRequisitionKpis(), ...(rows[0] || {}) };
}

/* ── Requisition pro Zeitraum (fuer Charts) ───────────── */

export async function requisitionsByPeriod(pool, orgId = null, days = 30, locationId = null) {
  const params = [days];
  const extra = [];
  if (orgId) { params.push(orgId); extra.push(`r.org_id = $${params.length}`); }
  if (locationId) { params.push(locationId); extra.push(`r.location_id = $${params.length}::uuid`); }
  const extraClause = extra.length ? 'AND ' + extra.join(' AND ') : '';

  const { rows } = await pool.query(
    `SELECT DATE_TRUNC('day', r.created_at)::date AS day,
            COUNT(*)::int AS created,
            COUNT(*) FILTER (WHERE r.status = 'FILLED')::int AS filled,
            COUNT(*) FILTER (WHERE r.status = 'CANCELLED')::int AS cancelled
     FROM requisitions r
     WHERE r.created_at >= NOW() - ($1 || ' days')::interval ${extraClause}
     GROUP BY day ORDER BY day ASC`,
    params
  );
  return rows;
}

/* ── Vendor Performance ──────────────────────────────── */

export async function vendorPerformance(pool, clientOrgId, limit = 20) {
  const { rows } = await pool.query(
    `SELECT
       vp.supplier_org_id,
       so.name AS supplier_name,
       vp.tier,
       COUNT(DISTINCT rc.id)::int AS total_candidates,
       COUNT(DISTINCT rc.id) FILTER (WHERE rc.status = 'shortlisted')::int AS shortlisted,
       COUNT(DISTINCT rc.id) FILTER (WHERE rc.status = 'accepted')::int AS accepted,
       COUNT(DISTINCT rc.id) FILTER (WHERE rc.status = 'rejected')::int AS rejected,
       ROUND(AVG(rc.match_score), 1) AS avg_match_score
     FROM vendor_pool vp
     LEFT JOIN organizations so ON so.id = vp.supplier_org_id
     LEFT JOIN requisition_candidates rc ON rc.supplier_org_id = vp.supplier_org_id
     WHERE vp.client_org_id = $1 AND vp.status = 'active'
     GROUP BY vp.supplier_org_id, so.name, vp.tier
     ORDER BY accepted DESC, shortlisted DESC
     LIMIT $2`,
    [clientOrgId, limit]
  );
  return rows;
}

/* ── Compliance Uebersicht ───────────────────────────── */

export async function complianceSummary(pool, orgId = null) {
  const orgClause = orgId ? 'WHERE cd.org_id = $1' : '';
  const params = orgId ? [orgId] : [];

  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total_documents,
       COUNT(*) FILTER (WHERE cd.status = 'verified')::int AS verified,
       COUNT(*) FILTER (WHERE cd.status = 'pending')::int AS pending,
       COUNT(*) FILTER (WHERE cd.status = 'rejected')::int AS rejected,
       COUNT(*) FILTER (WHERE cd.status = 'expired')::int AS expired,
       COUNT(*) FILTER (WHERE cd.status = 'verified' AND cd.valid_until IS NOT NULL
                        AND cd.valid_until <= NOW() + INTERVAL '30 days')::int AS expiring_soon
     FROM compliance_documents cd
     ${orgClause}`,
    params
  );
  return { ...zeroComplianceSummary(), ...(rows[0] || {}) };
}

/* ── SLA Report ──────────────────────────────────────── */

export async function slaReport(pool, orgId = null, days = 30, locationId = null) {
  const params = [days];
  const extra = [];
  if (orgId) { params.push(orgId); extra.push(`r.org_id = $${params.length}`); }
  if (locationId) { params.push(locationId); extra.push(`r.location_id = $${params.length}::uuid`); }
  const extraClause = extra.length ? 'AND ' + extra.join(' AND ') : '';

  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total_with_sla,
       COUNT(*) FILTER (WHERE r.sla_status = 'MET')::int AS sla_met,
       COUNT(*) FILTER (WHERE r.sla_status = 'BREACHED')::int AS sla_breached,
       COUNT(*) FILTER (WHERE r.sla_status = 'RUNNING')::int AS sla_running,
       ROUND(100.0 * COUNT(*) FILTER (WHERE r.sla_status = 'MET')
             / NULLIF(COUNT(*) FILTER (WHERE r.sla_status IN ('MET','BREACHED')), 0), 1) AS sla_compliance_pct
     FROM requisitions r
     WHERE r.sla_minutes IS NOT NULL
       AND r.created_at >= NOW() - ($1 || ' days')::interval
       ${extraClause}`,
    params
  );
  return { ...zeroSlaReport(), ...(rows[0] || {}) };
}

/* ── Executive Dashboard (kombiniert) ────────────────── */

export async function executiveDashboard(pool, orgId = null, locationId = null) {
  const window = buildWindow(EXECUTIVE_WINDOW_DAYS);

  // Location-aware KPIs: requisitions, sla, spend, critical_staffing_pressure
  // Org-only KPIs:        compliance, platform, finance (no location_id column)
  const [reqKpisResult, complianceResult, slaResult, platformResult, spendResult, criticalResult, financeResult] = await Promise.allSettled([
    requisitionKpis(pool, orgId, locationId),
    complianceSummary(pool, orgId),
    slaReport(pool, orgId, EXECUTIVE_WINDOW_DAYS, locationId),
    getPlatformStats(pool),
    getExecutiveSpendSummary(pool, orgId, window, locationId),
    getCriticalStaffingPressure(pool, orgId, window, locationId),
    getExecutiveFinanceTruth(pool, orgId)
  ]);

  const requisitions = reqKpisResult.status === 'fulfilled' ? reqKpisResult.value : zeroRequisitionKpis();
  const compliance = complianceResult.status === 'fulfilled' ? complianceResult.value : zeroComplianceSummary();
  const sla = slaResult.status === 'fulfilled' ? slaResult.value : zeroSlaReport();
  const platform = platformResult.status === 'fulfilled' ? platformResult.value : zeroPlatformStats();
  const spend = spendResult.status === 'fulfilled' ? spendResult.value : zeroSpendSummary(false);
  const critical_staffing_pressure = criticalResult.status === 'fulfilled'
    ? criticalResult.value
    : zeroCriticalStaffing(window, false);
  const finance = financeResult.status === 'fulfilled'
    ? financeResult.value
    : zeroExecutiveFinanceTruth(false);
  const retention = finance?.retention_truth || zeroSaaSRetentionTruth(EXECUTIVE_WINDOW_DAYS);
  const pilot_conversion = finance?.pilot_conversion_truth || zeroPilotConversionTruth();

  let procurement_pulse = zeroProcurementPulse(window);
  try {
    procurement_pulse = await getProcurementPulse(pool, orgId, window, requisitions, spend, locationId);
  } catch {
    procurement_pulse = zeroProcurementPulse(window);
  }

  // ── SLA & Staffing Alerts ───────────────────────────────────────────────────
  // Authoritative alert signals — frontend renders, never hides.
  const SLA_WARN_THRESHOLD = 80;
  const alerts = [];

  if (sla.sla_compliance_pct != null) {
    if (sla.sla_compliance_pct < SLA_WARN_THRESHOLD) {
      alerts.push({
        code: "SLA_COMPLIANCE_LOW",
        severity: sla.sla_compliance_pct < 60 ? "critical" : "warning",
        message: `SLA-Compliance bei ${sla.sla_compliance_pct} % — Schwellwert ${SLA_WARN_THRESHOLD} % unterschritten.`,
        pct: sla.sla_compliance_pct,
        threshold: SLA_WARN_THRESHOLD,
        detail_url: null
      });
    }
  }

  if (
    critical_staffing_pressure?.available &&
    (critical_staffing_pressure.total || 0) > 0
  ) {
    const total = critical_staffing_pressure.total;
    const emergency = critical_staffing_pressure.summary?.emergency_open || 0;
    alerts.push({
      code: "CRITICAL_STAFFING_PRESSURE",
      severity: emergency > 0 ? "critical" : "warning",
      message: `${total} kritische${total === 1 ? "s" : ""} Arbeitsplatzangebot${total === 1 ? "" : "e"} ohne Besetzung${emergency > 0 ? ` (davon ${emergency} als Notfall markiert)` : ""}.`,
      count: total,
      emergency_count: emergency,
      detail_url: "/public/requisitions.html?status_group=backlog"
    });
  }
  // ── /SLA & Staffing Alerts ───────────────────────────────────────────────────

  return {
    generated_at: new Date().toISOString(),
    scope: {
      org_id: orgId,
      location_id: locationId,
      date_from: window.date_from,
      date_to: window.date_to,
      window_days: EXECUTIVE_WINDOW_DAYS
    },
    alerts,
    window,
    requisitions,
    compliance,
    sla,
    platform,
    spend,
    finance,
    retention,
    pilot_conversion,
    procurement_pulse,
    critical_staffing_pressure
  };
}

/* ── Top-Rollen (meistgesuchte) ──────────────────────── */

export async function topRoles(pool, orgId = null, limit = 10, locationId = null) {
  const params = [limit];
  const conditions = [];
  if (orgId) { params.push(orgId); conditions.push(`r.org_id = $${params.length}`); }
  if (locationId) { params.push(locationId); conditions.push(`r.location_id = $${params.length}::uuid`); }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT r.role, COUNT(*)::int AS count,
            COUNT(*) FILTER (WHERE r.status = 'FILLED')::int AS filled
     FROM requisitions r
     ${whereClause}
     GROUP BY r.role ORDER BY count DESC LIMIT $1`,
    params
  );
  return rows;
}
