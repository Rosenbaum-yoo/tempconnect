/**
 * Revenue Metrics Service — Admin-grade SaaS KPIs with pricing-source truth.
 *
 * Commercial precedence per active subscription:
 *  1) explicit custom_quote_pending (no recognized MRR)
 *  2) individual_contract + individual_contract_price_cents
 *  3) pilot_contract + pilot_price_cents
 *  4) catalog price (plan catalog / INDIVIDUELL size tier baseline)
 *
 * This prevents INDIVIDUELL from silently collapsing to 0€ in KPIs
 * and enriches finance truth with invoice/payment/billable source metrics.
 */

import { classifyCompanySize, getBasePricing } from "./pricingTierService.js";
import { getPilotConversionTruth, zeroPilotConversionTruth } from "./pilotConversionTruthService.js";
import { getSaaSRetentionTruth, zeroSaaSRetentionTruth } from "./retentionMetricsService.js";
import { PLAN_LIMITS } from "./userService.js";

const PRICING_SOURCES = [
  "catalog_price",
  "contract_price",
  "pilot_price",
  "custom_quote_pending"
];

const LEGACY_CATALOG_PRICE_EUR = {
  NOTDIENST: 999
};

function toInt(value, fallback = 0) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function toFloat(value, fallback = 0) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function euroToCents(valueEuro) {
  const n = toFloat(valueEuro, 0);
  return Math.round(n * 100);
}

function toBool(value) {
  if (value === true || value === false) return value;
  if (value === "t" || value === "true" || value === 1) return true;
  return false;
}

function normalizePlan(plan) {
  const normalized = String(plan || "DEMO").toUpperCase();
  if (normalized === "FREE") return "DEMO";
  if (normalized === "ENTERPRISE" || normalized === "INDIVIDUAL") return "INDIVIDUELL";
  return normalized;
}

function normalizeBillingMode(mode) {
  const normalized = String(mode || "standard_catalog").toLowerCase();
  if (normalized === "pilot_contract" || normalized === "individual_contract") return normalized;
  return "standard_catalog";
}

function normalizeSizeClass(sizeClass) {
  const normalized = String(sizeClass || "").toUpperCase();
  if (["I", "II", "III", "IV"].includes(normalized)) return normalized;
  return null;
}

function centsToEuroInt(cents) {
  if (cents == null) return null;
  return Math.round(Number(cents) / 100);
}

function getCatalogPriceEur(plan, row) {
  if (plan === "INDIVIDUELL") {
    const sizeClass =
      normalizeSizeClass(row.company_size_class)
      || classifyCompanySize(row.employee_count_approx)?.class
      || null;
    if (!sizeClass) return null;
    const basePricing = getBasePricing(sizeClass);
    if (!basePricing || basePricing.base_monthly == null) return null;
    return toInt(basePricing.base_monthly, null);
  }
  if (LEGACY_CATALOG_PRICE_EUR[plan] != null) return LEGACY_CATALOG_PRICE_EUR[plan];
  if (!PLAN_LIMITS[plan]) return 0;
  return toInt(PLAN_LIMITS[plan].price, 0);
}

function resolveCommercialPricing(row) {
  const plan = normalizePlan(row.plan);
  const billingMode = normalizeBillingMode(row.billing_mode);
  const contractPrice = centsToEuroInt(row.individual_contract_price_cents);
  const pilotPrice = centsToEuroInt(row.pilot_price_cents);
  const catalogPrice = getCatalogPriceEur(plan, row);
  const explicitPending = toBool(row.custom_quote_pending);

  let pricingSource = "catalog_price";
  let recognizedPrice = null;
  let pendingQuote = false;

  if (explicitPending) {
    pricingSource = "custom_quote_pending";
    pendingQuote = true;
  } else if (billingMode === "individual_contract") {
    if (contractPrice != null) {
      pricingSource = "contract_price";
      recognizedPrice = contractPrice;
    } else {
      pricingSource = "custom_quote_pending";
      pendingQuote = true;
    }
  } else if (billingMode === "pilot_contract") {
    if (pilotPrice != null) {
      pricingSource = "pilot_price";
      recognizedPrice = pilotPrice;
    } else {
      pricingSource = "custom_quote_pending";
      pendingQuote = true;
    }
  } else if (contractPrice != null) {
    pricingSource = "contract_price";
    recognizedPrice = contractPrice;
  } else if (pilotPrice != null) {
    pricingSource = "pilot_price";
    recognizedPrice = pilotPrice;
  } else if (catalogPrice != null) {
    pricingSource = "catalog_price";
    recognizedPrice = catalogPrice;
  } else {
    pricingSource = "custom_quote_pending";
    pendingQuote = true;
  }

  return {
    user_id: row.user_id,
    org_id: row.org_id || null,
    plan,
    billing_mode: billingMode,
    pricing_source: pricingSource,
    pending_quote: pendingQuote,
    recognized_price_eur: recognizedPrice == null ? 0 : recognizedPrice,
    recognized_mrr: recognizedPrice == null ? 0 : recognizedPrice,
    catalog_price_eur: catalogPrice,
    contract_price_eur: contractPrice,
    pilot_price_eur: pilotPrice
  };
}

function orgColExpr(columnSet, columnName, fallbackSql) {
  if (columnSet.has(columnName)) return `o.${columnName}`;
  return fallbackSql;
}

async function getTableColumns(pool, tableName) {
  try {
    const { rows } = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
    `, [tableName]);
    return new Set((rows || []).map((row) => String(row.column_name || "").trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function buildInvoiceOrgFilter(orgId, invoiceColumns, alias = "i") {
  if (!orgId) return { clause: "", params: [] };
  if (invoiceColumns.has("supplier_org_id")) {
    return { clause: ` AND (${alias}.org_id = $1 OR ${alias}.supplier_org_id = $1)`, params: [orgId] };
  }
  return { clause: ` AND ${alias}.org_id = $1`, params: [orgId] };
}

function buildTimesheetOrgFilter(orgId, timesheetColumns, alias = "ts") {
  if (!orgId) return { clause: "", params: [] };
  if (timesheetColumns.has("org_id") && timesheetColumns.has("supplier_org_id")) {
    return { clause: ` AND (${alias}.org_id = $1 OR ${alias}.supplier_org_id = $1)`, params: [orgId] };
  }
  if (timesheetColumns.has("org_id")) {
    return { clause: ` AND ${alias}.org_id = $1`, params: [orgId] };
  }
  if (timesheetColumns.has("supplier_org_id")) {
    return { clause: ` AND ${alias}.supplier_org_id = $1`, params: [orgId] };
  }
  return { clause: "", params: [] };
}

async function getActiveSubscriptionCommercialRows(pool, organizationColumns, orgId = null) {
  const billingModeExpr = orgColExpr(organizationColumns, "billing_mode", "'standard_catalog'::text");
  const contractPriceExpr = orgColExpr(organizationColumns, "individual_contract_price_cents", "NULL::int");
  const pilotPriceExpr = orgColExpr(organizationColumns, "pilot_price_cents", "NULL::int");
  const quotePendingExpr = orgColExpr(organizationColumns, "custom_quote_pending", "FALSE");
  const sizeClassExpr = orgColExpr(organizationColumns, "company_size_class", "NULL::text");
  const employeeCountExpr = orgColExpr(organizationColumns, "employee_count_approx", "NULL::int");
  const orgFilterClause = orgId ? "AND COALESCE(primary_org.org_id, u.org_id) = $1" : "";
  const orgFilterParams = orgId ? [orgId] : [];

  try {
    const { rows } = await pool.query(`
      SELECT
        s.user_id,
        s.plan,
        COALESCE(primary_org.org_id, u.org_id) AS org_id,
        ${billingModeExpr} AS billing_mode,
        ${contractPriceExpr} AS individual_contract_price_cents,
        ${pilotPriceExpr} AS pilot_price_cents,
        ${quotePendingExpr} AS custom_quote_pending,
        ${sizeClassExpr} AS company_size_class,
        ${employeeCountExpr} AS employee_count_approx
      FROM subscriptions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN LATERAL (
        SELECT om.org_id
        FROM org_memberships om
        WHERE om.user_id = s.user_id
          AND om.is_active = TRUE
        ORDER BY om.created_at ASC
        LIMIT 1
      ) primary_org ON TRUE
      LEFT JOIN organizations o ON o.id = COALESCE(primary_org.org_id, u.org_id)
      WHERE s.status = 'active'
        ${orgFilterClause}
        AND s.id = (
          SELECT s2.id
          FROM subscriptions s2
          WHERE s2.user_id = s.user_id
          ORDER BY s2.created_at DESC
          LIMIT 1
        )
    `, orgFilterParams);
    return rows || [];
  } catch {
    // Legacy fallback: no org_memberships/organizations enrichment available.
    const fallbackOrgClause = orgId ? "AND u.org_id = $1" : "";
    const fallbackOrgParams = orgId ? [orgId] : [];
    const { rows } = await pool.query(`
      SELECT
        s.user_id,
        s.plan,
        u.org_id AS org_id,
        'standard_catalog'::text AS billing_mode,
        NULL::int AS individual_contract_price_cents,
        NULL::int AS pilot_price_cents,
        FALSE AS custom_quote_pending,
        NULL::text AS company_size_class,
        NULL::int AS employee_count_approx
      FROM subscriptions s
      JOIN users u ON u.id = s.user_id
      WHERE s.status = 'active'
        ${fallbackOrgClause}
        AND s.id = (
          SELECT s2.id
          FROM subscriptions s2
          WHERE s2.user_id = s.user_id
          ORDER BY s2.created_at DESC
          LIMIT 1
        )
    `, fallbackOrgParams);
    return rows || [];
  }
}

function sourceStatsSkeleton() {
  return {
    catalog_price: { source: "catalog_price", subscribers: 0, mrr: 0, arr: 0 },
    contract_price: { source: "contract_price", subscribers: 0, mrr: 0, arr: 0 },
    pilot_price: { source: "pilot_price", subscribers: 0, mrr: 0, arr: 0 },
    custom_quote_pending: { source: "custom_quote_pending", subscribers: 0, mrr: 0, arr: 0 }
  };
}

function planStatsSkeleton(plan) {
  return {
    plan,
    subscribers: 0,
    recognized_mrr: 0,
    pending_quotes: 0,
    priced_subscribers: 0,
    pricing_sources: {
      catalog_price: 0,
      contract_price: 0,
      pilot_price: 0,
      custom_quote_pending: 0
    }
  };
}

function normalizePlanCountRows(rows) {
  const grouped = new Map();
  for (const row of rows || []) {
    const plan = normalizePlan(row.plan);
    const count = toInt(row.count, 0);
    grouped.set(plan, (grouped.get(plan) || 0) + count);
  }
  return [...grouped.entries()]
    .map(([plan, count]) => ({ plan, count }))
    .sort((a, b) => b.count - a.count || a.plan.localeCompare(b.plan));
}

function zeroInvoiceTruth() {
  return {
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
  };
}

function zeroPaymentTruth() {
  return {
    available: false,
    completed_count: 0,
    completed_amount_cents: 0,
    pending_count: 0,
    failed_count: 0,
    expired_count: 0
  };
}

function zeroBillableTruth() {
  return {
    available: false,
    approved_uninvoiced_timesheets: 0,
    approved_uninvoiced_hours: 0,
    approved_uninvoiced_amount_cents: 0,
    missing_rate_count: 0
  };
}

function zeroReconciliation30d() {
  return {
    available: false,
    approved_spend_30d_cents: 0,
    operational_invoiced_30d_cents: 0,
    spend_invoice_gap_cents: 0,
    coverage_ratio_pct: null,
    operational_invoiced_available: false
  };
}

async function queryInvoiceTruth(pool, orgId, invoiceColumns) {
  if (!invoiceColumns.has("status") || !invoiceColumns.has("total_cents")) return zeroInvoiceTruth();
  const invoiceTypeExpr = invoiceColumns.has("invoice_type")
    ? "COALESCE(i.invoice_type, 'subscription')"
    : "'subscription'";
  const { clause, params } = buildInvoiceOrgFilter(orgId, invoiceColumns, "i");
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS total_count,
      COUNT(*) FILTER (WHERE i.status = 'draft')::int AS draft_count,
      COUNT(*) FILTER (WHERE i.status = 'issued')::int AS issued_count,
      COUNT(*) FILTER (WHERE i.status = 'overdue')::int AS overdue_count,
      COUNT(*) FILTER (WHERE i.status = 'paid')::int AS paid_count,
      COUNT(*) FILTER (WHERE i.status = 'void')::int AS void_count,
      COALESCE(SUM(i.total_cents) FILTER (WHERE i.status IN ('issued', 'paid', 'overdue')), 0)::bigint AS invoiced_revenue_cents,
      COALESCE(SUM(i.total_cents) FILTER (WHERE i.status = 'paid'), 0)::bigint AS paid_revenue_cents,
      COALESCE(SUM(i.total_cents) FILTER (WHERE i.status IN ('issued', 'overdue')), 0)::bigint AS open_receivables_cents,
      COALESCE(SUM(i.total_cents) FILTER (WHERE i.status = 'overdue'), 0)::bigint AS overdue_receivables_cents,
      COUNT(*) FILTER (WHERE ${invoiceTypeExpr} = 'operational')::int AS operational_count,
      COUNT(*) FILTER (WHERE ${invoiceTypeExpr} = 'subscription')::int AS subscription_count
    FROM invoices i
    WHERE 1 = 1 ${clause}
  `, params);
  const row = rows[0] || {};
  return {
    available: true,
    total_count: toInt(row.total_count, 0),
    draft_count: toInt(row.draft_count, 0),
    issued_count: toInt(row.issued_count, 0),
    overdue_count: toInt(row.overdue_count, 0),
    paid_count: toInt(row.paid_count, 0),
    void_count: toInt(row.void_count, 0),
    invoiced_revenue_cents: toInt(row.invoiced_revenue_cents, 0),
    paid_revenue_cents: toInt(row.paid_revenue_cents, 0),
    open_receivables_cents: toInt(row.open_receivables_cents, 0),
    overdue_receivables_cents: toInt(row.overdue_receivables_cents, 0),
    operational_count: toInt(row.operational_count, 0),
    subscription_count: toInt(row.subscription_count, 0)
  };
}

async function queryInvoiced30d(pool, orgId, invoiceColumns) {
  if (!invoiceColumns.has("issued_at") || !invoiceColumns.has("status") || !invoiceColumns.has("total_cents")) {
    return { total_cents: 0, total_eur: 0, count: 0, paid_cents: 0, paid_eur: 0 };
  }
  const { clause, params } = buildInvoiceOrgFilter(orgId, invoiceColumns, "i");
  const { rows } = await pool.query(`
    SELECT
      COALESCE(SUM(i.total_cents), 0)::bigint AS total_billed_cents,
      COALESCE(SUM(i.total_cents) FILTER (WHERE i.status = 'paid'), 0)::bigint AS total_paid_cents,
      COUNT(*)::int AS invoice_count
    FROM invoices i
    WHERE i.issued_at >= NOW() - INTERVAL '30 days'
      AND i.status IN ('issued', 'paid', 'overdue')
      ${clause}
  `, params);
  const totalCents = toInt(rows[0]?.total_billed_cents, 0);
  const paidCents = toInt(rows[0]?.total_paid_cents, 0);
  return {
    total_cents: totalCents,
    total_eur: Math.round(totalCents / 100),
    count: toInt(rows[0]?.invoice_count, 0),
    paid_cents: paidCents,
    paid_eur: Math.round(paidCents / 100)
  };
}

async function queryPaymentTruth(pool, orgId, paymentSessionColumns) {
  if (!paymentSessionColumns.has("status") || !paymentSessionColumns.has("amount")) return zeroPaymentTruth();
  const params = [];
  let orgClause = "";
  if (orgId) {
    params.push(orgId);
    orgClause = paymentSessionColumns.has("org_id")
      ? "AND ps.org_id = $1"
      : "AND u.org_id = $1";
  }
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE ps.status = 'completed')::int AS completed_count,
      COALESCE(SUM(ps.amount) FILTER (WHERE ps.status = 'completed'), 0)::numeric AS completed_amount_eur,
      COUNT(*) FILTER (WHERE ps.status = 'pending')::int AS pending_count,
      COUNT(*) FILTER (WHERE ps.status = 'failed')::int AS failed_count,
      COUNT(*) FILTER (WHERE ps.status = 'expired')::int AS expired_count
    FROM payment_sessions ps
    LEFT JOIN users u ON u.id = ps.user_id
    WHERE 1 = 1 ${orgClause}
  `, params);
  const row = rows[0] || {};
  return {
    available: true,
    completed_count: toInt(row.completed_count, 0),
    completed_amount_cents: euroToCents(row.completed_amount_eur),
    pending_count: toInt(row.pending_count, 0),
    failed_count: toInt(row.failed_count, 0),
    expired_count: toInt(row.expired_count, 0)
  };
}

async function queryBillableTruth(pool, orgId, timesheetColumns, assignmentColumns) {
  const hasRequiredTimesheetColumns =
    timesheetColumns.has("status")
    && timesheetColumns.has("assignment_id")
    && timesheetColumns.has("total_hours")
    && timesheetColumns.has("overtime_hours")
    && timesheetColumns.has("invoice_id");
  const hasRequiredAssignmentColumns =
    assignmentColumns.has("id")
    && assignmentColumns.has("hourly_rate_cents");

  if (!hasRequiredTimesheetColumns || !hasRequiredAssignmentColumns) return zeroBillableTruth();
  const { clause, params } = buildTimesheetOrgFilter(orgId, timesheetColumns, "ts");
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS approved_uninvoiced_timesheets,
      COALESCE(SUM(ts.total_hours), 0)::numeric(12,2) AS approved_uninvoiced_hours,
      COUNT(*) FILTER (WHERE a.hourly_rate_cents IS NULL)::int AS missing_rate_count,
      COALESCE(SUM(
        CASE
          WHEN a.hourly_rate_cents IS NULL THEN 0
          ELSE (
            GREATEST(COALESCE(ts.total_hours, 0) - COALESCE(ts.overtime_hours, 0), 0) * a.hourly_rate_cents
            + (COALESCE(ts.overtime_hours, 0) * a.hourly_rate_cents * 1.25)
          )
        END
      ), 0)::bigint AS approved_uninvoiced_amount_cents
    FROM timesheets ts
    LEFT JOIN assignments a ON a.id = ts.assignment_id
    WHERE ts.status = 'approved'
      AND ts.invoice_id IS NULL
      ${clause}
  `, params);
  const row = rows[0] || {};
  return {
    available: true,
    approved_uninvoiced_timesheets: toInt(row.approved_uninvoiced_timesheets, 0),
    approved_uninvoiced_hours: toFloat(row.approved_uninvoiced_hours, 0),
    approved_uninvoiced_amount_cents: toInt(row.approved_uninvoiced_amount_cents, 0),
    missing_rate_count: toInt(row.missing_rate_count, 0)
  };
}

async function queryReconciliation30d(pool, orgId, timesheetColumns, assignmentColumns, invoiceColumns) {
  const hasSpendColumns =
    timesheetColumns.has("status")
    && timesheetColumns.has("assignment_id")
    && timesheetColumns.has("total_hours")
    && timesheetColumns.has("week_start")
    && assignmentColumns.has("id")
    && assignmentColumns.has("hourly_rate_cents");
  if (!hasSpendColumns) return zeroReconciliation30d();

  const timesheetFilter = buildTimesheetOrgFilter(orgId, timesheetColumns, "ts");
  const { rows: spendRows } = await pool.query(`
    SELECT
      COALESCE(SUM(ts.total_hours * COALESCE(a.hourly_rate_cents, 0)), 0)::bigint AS approved_spend_30d_cents
    FROM timesheets ts
    LEFT JOIN assignments a ON a.id = ts.assignment_id
    WHERE ts.status = 'approved'
      AND ts.week_start >= CURRENT_DATE - INTERVAL '30 days'
      ${timesheetFilter.clause}
  `, timesheetFilter.params);
  const approvedSpend = toInt(spendRows[0]?.approved_spend_30d_cents, 0);

  let operationalInvoiced = 0;
  let operationalInvoicedAvailable = false;
  if (invoiceColumns.has("invoice_type") && invoiceColumns.has("issued_at") && invoiceColumns.has("status") && invoiceColumns.has("total_cents")) {
    const invoiceFilter = buildInvoiceOrgFilter(orgId, invoiceColumns, "i");
    const { rows: invoiceRows } = await pool.query(`
      SELECT
        COALESCE(SUM(i.total_cents), 0)::bigint AS operational_invoiced_30d_cents
      FROM invoices i
      WHERE COALESCE(i.invoice_type, 'subscription') = 'operational'
        AND i.issued_at >= NOW() - INTERVAL '30 days'
        AND i.status IN ('issued', 'paid', 'overdue')
        ${invoiceFilter.clause}
    `, invoiceFilter.params);
    operationalInvoiced = toInt(invoiceRows[0]?.operational_invoiced_30d_cents, 0);
    operationalInvoicedAvailable = true;
  }

  return {
    available: true,
    approved_spend_30d_cents: approvedSpend,
    operational_invoiced_30d_cents: operationalInvoiced,
    spend_invoice_gap_cents: approvedSpend - operationalInvoiced,
    coverage_ratio_pct: approvedSpend > 0 ? Math.round((operationalInvoiced / approvedSpend) * 100) : null,
    operational_invoiced_available: operationalInvoicedAvailable
  };
}

/**
 * Get full revenue dashboard metrics.
 * @param {import('pg').Pool} pool
 * @param {{ orgId?: string|null }|string|null} [options]
 * @returns {Promise<object>}
 */
export async function getRevenueMetrics(pool, options = {}) {
  const orgId = typeof options === "string"
    ? (options || null)
    : (options?.orgId || null);

  const metrics = {
    mrr_total: 0,
    arr_total: 0,
    contractual_mrr_total: 0,
    catalog_mrr_theoretical: 0,
    mrr_by_plan: [],
    plan_distribution: [],
    pricing_state_breakdown: [],
    custom_quote_pending: { count: 0 },
    paying_users: 0,
    paying_users_with_recognized_price: 0,
    arpu: 0,
    pilot: { total: 0, active: 0, converted: 0, ended: 0, conversion_rate: 0 },
    new_subs_30d: [],
    new_subs_30d_total: 0,
    churn_30d: 0,
    invoiced_30d: { total_cents: 0, total_eur: 0, count: 0, paid_cents: 0, paid_eur: 0 },
    subscription_truth: {
      catalog_mrr_theoretical: 0,
      contractually_active_mrr: 0,
      catalog_price_missing_count: 0,
      pending_quote_subscribers: 0
    },
    invoice_truth: zeroInvoiceTruth(),
    payment_truth: zeroPaymentTruth(),
    billable_truth: zeroBillableTruth(),
    reconciliation_30d: zeroReconciliation30d(),
    retention_truth: zeroSaaSRetentionTruth(30),
    pilot_conversion_truth: zeroPilotConversionTruth(),
    pricing_model: {
      source_precedence: [
        "custom_quote_pending",
        "contract_price",
        "pilot_price",
        "catalog_price"
      ],
      currency: "EUR",
      mrr_definition: "Recognized MRR excludes subscriptions with custom_quote_pending.",
      receivables_definition: "Open receivables = invoices in status issued or overdue.",
      billable_definition: "Billable volume = approved timesheets not yet linked to an invoice."
    }
  };

  const organizationColumns = await getTableColumns(pool, "organizations");
  const invoiceColumns = await getTableColumns(pool, "invoices");
  const paymentSessionColumns = await getTableColumns(pool, "payment_sessions");
  const timesheetColumns = await getTableColumns(pool, "timesheets");
  const assignmentColumns = await getTableColumns(pool, "assignments");

  const activeRows = await getActiveSubscriptionCommercialRows(pool, organizationColumns, orgId).catch(() => []);
  const sourceStats = sourceStatsSkeleton();
  const planStats = new Map();
  let totalRecognizedMrr = 0;
  let totalCatalogTheoreticalMrr = 0;
  let catalogPriceMissingCount = 0;
  let pendingQuotes = 0;
  let payingUsers = 0;
  let payingUsersWithPrice = 0;

  for (const row of activeRows) {
    const resolved = resolveCommercialPricing(row);
    const sourceEntry = sourceStats[resolved.pricing_source];
    sourceEntry.subscribers += 1;
    sourceEntry.mrr += resolved.recognized_mrr;

    const planKey = resolved.plan;
    if (!planStats.has(planKey)) planStats.set(planKey, planStatsSkeleton(planKey));
    const planEntry = planStats.get(planKey);
    planEntry.subscribers += 1;
    planEntry.recognized_mrr += resolved.recognized_mrr;
    planEntry.pricing_sources[resolved.pricing_source] += 1;
    if (resolved.pending_quote) planEntry.pending_quotes += 1;
    if (resolved.recognized_mrr > 0) planEntry.priced_subscribers += 1;

    totalRecognizedMrr += resolved.recognized_mrr;
    if (resolved.pending_quote) pendingQuotes += 1;

    if (resolved.plan !== "DEMO") {
      payingUsers += 1;
      if (resolved.recognized_mrr > 0) payingUsersWithPrice += 1;
      if (resolved.catalog_price_eur != null) {
        totalCatalogTheoreticalMrr += resolved.catalog_price_eur;
      } else {
        catalogPriceMissingCount += 1;
      }
    }
  }

  for (const source of PRICING_SOURCES) {
    sourceStats[source].arr = sourceStats[source].mrr * 12;
  }

  metrics.mrr_total = totalRecognizedMrr;
  metrics.arr_total = totalRecognizedMrr * 12;
  metrics.contractual_mrr_total = totalRecognizedMrr;
  metrics.catalog_mrr_theoretical = totalCatalogTheoreticalMrr;
  metrics.custom_quote_pending = { count: pendingQuotes };
  metrics.paying_users = payingUsers;
  metrics.paying_users_with_recognized_price = payingUsersWithPrice;
  metrics.arpu = payingUsers > 0 ? Math.round(totalRecognizedMrr / payingUsers) : 0;
  metrics.pricing_state_breakdown = PRICING_SOURCES.map((source) => sourceStats[source]);
  metrics.subscription_truth = {
    catalog_mrr_theoretical: totalCatalogTheoreticalMrr,
    contractually_active_mrr: totalRecognizedMrr,
    catalog_price_missing_count: catalogPriceMissingCount,
    pending_quote_subscribers: pendingQuotes
  };

  metrics.mrr_by_plan = [...planStats.values()]
    .map((entry) => {
      const avgPrice = entry.priced_subscribers > 0
        ? Math.round(entry.recognized_mrr / entry.priced_subscribers)
        : 0;
      return {
        plan: entry.plan,
        subscribers: entry.subscribers,
        price: avgPrice,
        mrr: entry.recognized_mrr,
        arr: entry.recognized_mrr * 12,
        pending_quotes: entry.pending_quotes,
        pricing_sources: entry.pricing_sources
      };
    })
    .sort((a, b) => b.mrr - a.mrr || b.subscribers - a.subscribers || a.plan.localeCompare(b.plan));

  metrics.plan_distribution = metrics.mrr_by_plan
    .map((entry) => ({ plan: entry.plan, count: entry.subscribers }))
    .sort((a, b) => b.count - a.count || a.plan.localeCompare(b.plan));

  // Invoice / receivables truth.
  try {
    metrics.invoice_truth = await queryInvoiceTruth(pool, orgId, invoiceColumns);
  } catch {
    metrics.invoice_truth = zeroInvoiceTruth();
  }

  // Payment truth (cash-proxy from sessions).
  try {
    metrics.payment_truth = await queryPaymentTruth(pool, orgId, paymentSessionColumns);
  } catch {
    metrics.payment_truth = zeroPaymentTruth();
  }

  // Billable operational volume from approved, uninvoiced timesheets.
  try {
    metrics.billable_truth = await queryBillableTruth(pool, orgId, timesheetColumns, assignmentColumns);
  } catch {
    metrics.billable_truth = zeroBillableTruth();
  }

  // 30d spend-vs-invoiced bridge for finance reconciliation.
  try {
    metrics.reconciliation_30d = await queryReconciliation30d(pool, orgId, timesheetColumns, assignmentColumns, invoiceColumns);
  } catch {
    metrics.reconciliation_30d = zeroReconciliation30d();
  }

  // Retention / churn / usage-intensity truth.
  try {
    metrics.retention_truth = await getSaaSRetentionTruth(pool, { orgId, windowDays: 30 });
  } catch {
    metrics.retention_truth = zeroSaaSRetentionTruth(30);
  }

  // Canonical pilot / conversion truth derived from enterprise lifecycle + analytics events.
  try {
    metrics.pilot_conversion_truth = await getPilotConversionTruth(pool, { orgId });
  } catch {
    metrics.pilot_conversion_truth = zeroPilotConversionTruth();
  }

  // Pilot conversion rate.
  try {
    const pilotOrgClause = orgId ? "AND id = $1" : "";
    const pilotOrgParams = orgId ? [orgId] : [];
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE pilot_status IN ('active','ended','converted'))::int AS total_pilots,
        COUNT(*) FILTER (WHERE pilot_status = 'converted')::int AS converted,
        COUNT(*) FILTER (WHERE pilot_status = 'active')::int AS active_pilots,
        COUNT(*) FILTER (WHERE pilot_status = 'ended')::int AS ended_without_conversion
      FROM organizations
      WHERE has_used_pilot = TRUE
      ${pilotOrgClause}
    `, pilotOrgParams);
    const r = rows[0] || {};
    const totalPilots = toInt(r.total_pilots, 0);
    const converted = toInt(r.converted, 0);
    metrics.pilot = {
      total: totalPilots,
      active: toInt(r.active_pilots, 0),
      converted,
      ended: toInt(r.ended_without_conversion, 0),
      conversion_rate: totalPilots > 0 ? Math.round((converted / totalPilots) * 100) : 0
    };
  } catch {
    metrics.pilot = { total: 0, active: 0, converted: 0, ended: 0, conversion_rate: 0 };
  }

  // New subscriptions last 30 days (normalized plan names).
  try {
    const orgClause = orgId ? "AND u.org_id = $1" : "";
    const orgParams = orgId ? [orgId] : [];
    const { rows } = await pool.query(`
      SELECT s.plan, COUNT(*)::int AS count
      FROM subscriptions s
      JOIN users u ON u.id = s.user_id
      WHERE s.created_at >= NOW() - INTERVAL '30 days'
        AND s.plan NOT IN ('FREE', 'DEMO')
        AND s.status IN ('active', 'past_due', 'canceling')
        ${orgClause}
      GROUP BY s.plan
      ORDER BY count DESC
    `, orgParams);
    metrics.new_subs_30d = normalizePlanCountRows(rows);
    metrics.new_subs_30d_total = metrics.new_subs_30d.reduce((sum, row) => sum + row.count, 0);
  } catch {
    metrics.new_subs_30d = [];
    metrics.new_subs_30d_total = 0;
  }

  // Churn 30d (users that moved to FREE/DEMO and had paid plan before).
  try {
    const params = [];
    let outerOrgClause = "";
    let innerOrgClause = "";
    if (orgId) {
      params.push(orgId);
      outerOrgClause = "AND u.org_id = $1";
      innerOrgClause = "AND u2.org_id = $1";
    }
    const { rows } = await pool.query(`
      SELECT COUNT(DISTINCT s.user_id)::int AS churned
      FROM subscriptions s
      JOIN users u ON u.id = s.user_id
      WHERE s.plan IN ('FREE', 'DEMO')
        AND s.created_at >= NOW() - INTERVAL '30 days'
        ${outerOrgClause}
        AND s.user_id IN (
          SELECT DISTINCT s2.user_id
          FROM subscriptions s2
          JOIN users u2 ON u2.id = s2.user_id
          WHERE s2.plan NOT IN ('FREE', 'DEMO')
            AND s2.created_at < NOW() - INTERVAL '30 days'
            ${innerOrgClause}
        )
    `, params);
    metrics.churn_30d = toInt(rows[0]?.churned, 0);
  } catch {
    metrics.churn_30d = 0;
  }

  // Revenue from invoices (actual billed, last 30 days).
  try {
    metrics.invoiced_30d = await queryInvoiced30d(pool, orgId, invoiceColumns);
  } catch {
    metrics.invoiced_30d = { total_cents: 0, total_eur: 0, count: 0, paid_cents: 0, paid_eur: 0 };
  }

  // Convenience top-level aliases for downstream dashboards.
  metrics.invoiced_revenue_cents = metrics.invoice_truth.invoiced_revenue_cents;
  metrics.paid_revenue_cents = metrics.invoice_truth.paid_revenue_cents;
  metrics.open_receivables_cents = metrics.invoice_truth.open_receivables_cents;
  metrics.billable_uninvoiced_cents = metrics.billable_truth.approved_uninvoiced_amount_cents;

  return metrics;
}
