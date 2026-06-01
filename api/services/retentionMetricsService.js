import { classifyCompanySize, getBasePricing } from "./pricingTierService.js";
import { PLAN_LIMITS } from "./userService.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const VALUE_EVENTS = [
  "requisition_created",
  "request_created",
  "request_sent",
  "deal_started",
  "deal_completed",
  "assignment_created",
  "timesheet_started",
  "timesheet_submitted",
  "timesheet_approved",
  "contract_started",
  "contract_interest_submitted",
  "interest_submitted"
];

const MODULE_EVENT_MAP = {
  demand: new Set([
    "requisition_created",
    "request_created",
    "request_sent"
  ]),
  deal: new Set([
    "deal_started",
    "deal_completed",
    "contract_started",
    "contract_interest_submitted",
    "interest_submitted"
  ]),
  delivery: new Set([
    "assignment_created",
    "timesheet_started",
    "timesheet_submitted",
    "timesheet_approved"
  ])
};

const PQA_EVENT_THRESHOLD = 8;
const PQA_ACTIVE_USER_THRESHOLD = 2;
const PQA_ACTIVE_MODULE_THRESHOLD = 2;

const LEGACY_CATALOG_PRICE_EUR = {
  NOTDIENST: 999
};

function toInt(value, fallback = 0) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}


function toBool(value) {
  if (value === true || value === false) return value;
  if (value === "t" || value === "true" || value === 1) return true;
  return false;
}

function round1(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
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
  if ([ "I", "II", "III", "IV" ].includes(normalized)) return normalized;
  return null;
}

function centsToEuroInt(cents) {
  if (cents == null) return null;
  return Math.round(Number(cents) / 100);
}

function safePct(numerator, denominator) {
  const den = Number(denominator || 0);
  if (den <= 0) return null;
  return round1((Number(numerator || 0) / den) * 100);
}

function median(values = []) {
  const nums = values
    .map((value) => Number(value || 0))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!nums.length) return 0;
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2) return nums[mid];
  return round1((nums[mid - 1] + nums[mid]) / 2);
}

function diffDays(fromIso, to = new Date()) {
  if (!fromIso) return null;
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return null;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY));
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

function isPaidPlan(plan, status) {
  const normalizedPlan = normalizePlan(plan);
  const normalizedStatus = String(status || "active").toLowerCase();
  if (normalizedPlan === "DEMO") return false;
  if (normalizedStatus === "canceled") return false;
  return true;
}

function resolveRecognizedMrr(planInput, row) {
  const plan = normalizePlan(planInput);
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
    pricing_source: pricingSource,
    pending_quote: pendingQuote,
    recognized_mrr: recognizedPrice == null ? 0 : recognizedPrice
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

function buildWindow(windowDays = 30) {
  const days = Math.min(180, Math.max(7, toInt(windowDays, 30)));
  const currentTo = new Date();
  const currentFrom = new Date(currentTo.getTime() - (days * MS_PER_DAY));
  const previousTo = new Date(currentFrom);
  const previousFrom = new Date(previousTo.getTime() - (days * MS_PER_DAY));
  return {
    days,
    current_from: currentFrom.toISOString(),
    current_to: currentTo.toISOString(),
    previous_from: previousFrom.toISOString(),
    previous_to: previousTo.toISOString()
  };
}

function buildDefinitions(windowDays) {
  return {
    active_paid_orgs: {
      meaning: "Organisationen mit bezahltem Subscription-Status im aktuellen Fenster-Snapshot (Plan != DEMO/FREE, Status != canceled).",
      source: [ "subscriptions", "organizations" ],
      window: `Snapshot zum Ende des aktuellen ${windowDays}-Tage-Fensters`,
      formula: "Latest Owner-Subscription <= current_to, kommerziell auf Org-Ebene verdichtet.",
      drilldown_dimensions: [ "org", "plan", "icp", "stage" ]
    },
    retained_logos: {
      meaning: "Logos, die im vorherigen Fenster aktiv zahlend + wertstiftend waren und im aktuellen Fenster ebenfalls zahlend + wertstiftend sind.",
      source: [ "subscriptions", "organizations", "product_analytics_events" ],
      window: `Vorheriges vs. aktuelles ${windowDays}-Tage-Fenster`,
      formula: "previous_active_customer && current_active_customer",
      drilldown_dimensions: [ "org", "plan", "icp", "stage" ]
    },
    logo_churned_orgs: {
      meaning: "Logos aus dem vorherigen aktiven Kundenkohort, die im aktuellen Fenster nicht mehr zahlend sind.",
      source: [ "subscriptions", "organizations", "product_analytics_events" ],
      window: `Vorheriges vs. aktuelles ${windowDays}-Tage-Fenster`,
      formula: "previous_active_customer && !current_is_paid",
      drilldown_dimensions: [ "org", "plan", "icp", "stage" ]
    },
    gross_revenue_churn_rate_pct: {
      meaning: "Verlustquote auf MRR-Basis im Vorperioden-Kohort, ohne Expansion gegenzurechnen.",
      source: [ "subscriptions", "organizations", "pricing_tiers" ],
      window: `Vorheriges vs. aktuelles ${windowDays}-Tage-Fenster`,
      formula: "sum(max(previous_mrr - current_mrr, 0)) / sum(previous_mrr)",
      drilldown_dimensions: [ "org", "plan", "icp", "stage" ]
    },
    net_revenue_retention_pct: {
      meaning: "Net Revenue Retention des Vorperioden-Kohorts inklusive Expansion/Kontraktion.",
      source: [ "subscriptions", "organizations", "pricing_tiers" ],
      window: `Vorheriges vs. aktuelles ${windowDays}-Tage-Fenster`,
      formula: "sum(current_mrr_cohort) / sum(previous_mrr_cohort)",
      drilldown_dimensions: [ "org", "plan", "icp", "stage" ]
    },
    inactive_but_paying_orgs: {
      meaning: "Zahlende Organisationen ohne wertstiftende Aktivität im aktuellen Fenster.",
      source: [ "subscriptions", "organizations", "product_analytics_events" ],
      window: `Aktuelles ${windowDays}-Tage-Fenster`,
      formula: "current_is_paid && current_value_events = 0",
      drilldown_dimensions: [ "org", "plan", "icp", "stage" ]
    },
    pqa_orgs: {
      meaning: "Product Qualified Accounts (zahlend + intensive, modulübergreifende Nutzung).",
      source: [ "subscriptions", "organizations", "product_analytics_events" ],
      window: `Aktuelles ${windowDays}-Tage-Fenster`,
      formula: `current_is_paid && value_events>=${PQA_EVENT_THRESHOLD} && active_users>=${PQA_ACTIVE_USER_THRESHOLD} && active_modules>=${PQA_ACTIVE_MODULE_THRESHOLD}`,
      drilldown_dimensions: [ "org", "plan", "icp", "stage" ]
    },
    pilot_retained_orgs: {
      meaning: "Aktive Pilotorganisationen mit wertstiftender Nutzung in vorherigem und aktuellem Fenster.",
      source: [ "organizations", "product_analytics_events" ],
      window: `Vorheriges vs. aktuelles ${windowDays}-Tage-Fenster`,
      formula: "pilot_status='active' && previous_value_events>0 && current_value_events>0",
      drilldown_dimensions: [ "org", "icp" ]
    },
    pilot_converted_orgs_30d: {
      meaning: "Pilotorganisationen mit Conversion im aktuellen Fenster.",
      source: [ "organizations" ],
      window: `Aktuelles ${windowDays}-Tage-Fenster`,
      formula: "converted_at BETWEEN current_from AND current_to",
      drilldown_dimensions: [ "org", "icp" ]
    }
  };
}

function segmentRow(dimension, value, label) {
  return {
    dimension,
    value,
    label,
    orgs_total: 0,
    active_paid_orgs: 0,
    retained_logos: 0,
    logo_churned_orgs: 0,
    inactive_but_paying_orgs: 0,
    pqa_orgs: 0,
    current_mrr: 0,
    previous_mrr: 0,
    expansion_mrr: 0,
    gross_revenue_churn_mrr: 0
  };
}

function bumpSegment(row, state) {
  row.orgs_total += 1;
  row.current_mrr += state.current_mrr;
  row.previous_mrr += state.previous_mrr;
  row.expansion_mrr += state.expansion_mrr;
  row.gross_revenue_churn_mrr += state.gross_revenue_churn_mrr;
  if (state.current_is_paid) row.active_paid_orgs += 1;
  if (state.retained_logo) row.retained_logos += 1;
  if (state.logo_churned) row.logo_churned_orgs += 1;
  if (state.inactive_but_paying) row.inactive_but_paying_orgs += 1;
  if (state.pqa) row.pqa_orgs += 1;
}

function stableSortSegments(rows = []) {
  return rows.sort((a, b) => (
    (b.active_paid_orgs - a.active_paid_orgs)
    || (b.current_mrr - a.current_mrr)
    || a.label.localeCompare(b.label)
  ));
}

function defaultUsageRow() {
  return {
    current_value_events: 0,
    previous_value_events: 0,
    current_active_users: 0,
    previous_active_users: 0,
    current_last_value_event_at: null,
    last_value_event_at: null,
    current_active_modules: 0
  };
}

export function zeroSaaSRetentionTruth(windowDays = 30) {
  const window = buildWindow(windowDays);
  return {
    available: false,
    scope_org_id: null,
    window,
    source: {
      commercial: "subscriptions + organizations",
      usage: "product_analytics_events"
    },
    quality_flags: {
      usage_source_available: false,
      commercial_rows: 0,
      usage_rows: 0
    },
    definitions: buildDefinitions(window.days),
    headline: {
      active_paid_orgs: 0,
      active_customer_orgs: 0,
      previous_active_customer_orgs: 0,
      retained_logos: 0,
      retained_logo_rate_pct: null,
      logo_churned_orgs: 0,
      logo_churn_rate_pct: null,
      inactive_but_paying_orgs: 0,
      pqa_orgs: 0,
      pilot_active_orgs: 0,
      pilot_retained_orgs: 0,
      pilot_converted_orgs_30d: 0,
      gross_revenue_churn_mrr: 0,
      gross_revenue_churn_rate_pct: null,
      net_revenue_retention_pct: null,
      expansion_mrr: 0,
      contraction_mrr: 0,
      cohort_previous_mrr: 0,
      cohort_current_mrr: 0
    },
    usage_intensity: {
      high: 0,
      medium: 0,
      low: 0,
      dormant: 0,
      avg_value_events_per_active_org: 0,
      median_value_events_per_active_org: 0
    },
    segment_drilldown: {
      by_plan: [],
      by_icp: [],
      by_stage: []
    },
    org_drilldown: {
      at_risk: [],
      churned: [],
      expanded: [],
      pqa: []
    }
  };
}

async function queryOrgCommercialSnapshots(pool, { orgId, window, organizationColumns }) {
  const billingModeExpr = orgColExpr(organizationColumns, "billing_mode", "'standard_catalog'::text");
  const contractPriceExpr = orgColExpr(organizationColumns, "individual_contract_price_cents", "NULL::int");
  const pilotPriceExpr = orgColExpr(organizationColumns, "pilot_price_cents", "NULL::int");
  const quotePendingExpr = orgColExpr(organizationColumns, "custom_quote_pending", "FALSE");
  const sizeClassExpr = orgColExpr(organizationColumns, "company_size_class", "NULL::text");
  const employeeCountExpr = orgColExpr(organizationColumns, "employee_count_approx", "NULL::int");
  const pilotStatusExpr = orgColExpr(organizationColumns, "pilot_status", "NULL::text");
  const customerStageExpr = orgColExpr(organizationColumns, "customer_stage", "NULL::text");
  const convertedAtExpr = orgColExpr(organizationColumns, "converted_at", "NULL::timestamptz");

  const params = [ window.current_to, window.previous_to ];
  let whereClause = "";
  if (orgId) {
    params.push(orgId);
    whereClause = "WHERE o.id = $3";
  }

  try {
    const { rows } = await pool.query(`
      SELECT
        o.id AS org_id,
        o.name AS org_name,
        COALESCE(o.type, 'unknown') AS org_type,
        o.plan AS org_plan,
        ${billingModeExpr} AS billing_mode,
        ${contractPriceExpr} AS individual_contract_price_cents,
        ${pilotPriceExpr} AS pilot_price_cents,
        ${quotePendingExpr} AS custom_quote_pending,
        ${sizeClassExpr} AS company_size_class,
        ${employeeCountExpr} AS employee_count_approx,
        ${pilotStatusExpr} AS pilot_status,
        ${customerStageExpr} AS customer_stage,
        ${convertedAtExpr} AS converted_at,
        current_sub.plan AS current_plan,
        current_sub.status AS current_status,
        current_sub.created_at AS current_subscription_created_at,
        previous_sub.plan AS previous_plan,
        previous_sub.status AS previous_status,
        previous_sub.created_at AS previous_subscription_created_at
      FROM organizations o
      LEFT JOIN LATERAL (
        SELECT om.user_id
        FROM org_memberships om
        WHERE om.org_id = o.id
          AND om.is_active = TRUE
        ORDER BY CASE WHEN om.role_key = 'owner' THEN 0 ELSE 1 END, om.created_at ASC
        LIMIT 1
      ) owner_user ON TRUE
      LEFT JOIN LATERAL (
        SELECT s.plan, s.status, s.created_at
        FROM subscriptions s
        WHERE s.user_id = owner_user.user_id
          AND s.created_at <= $1::timestamptz
        ORDER BY s.created_at DESC
        LIMIT 1
      ) current_sub ON TRUE
      LEFT JOIN LATERAL (
        SELECT s.plan, s.status, s.created_at
        FROM subscriptions s
        WHERE s.user_id = owner_user.user_id
          AND s.created_at <= $2::timestamptz
        ORDER BY s.created_at DESC
        LIMIT 1
      ) previous_sub ON TRUE
      ${whereClause}
    `, params);
    return rows || [];
  } catch {
    // Legacy fallback without org_memberships.
    const fallbackParams = [ window.current_to, window.previous_to ];
    let fallbackWhereClause = "";
    if (orgId) {
      fallbackParams.push(orgId);
      fallbackWhereClause = "WHERE o.id = $3";
    }
    const { rows } = await pool.query(`
      SELECT
        o.id AS org_id,
        o.name AS org_name,
        COALESCE(o.type, 'unknown') AS org_type,
        o.plan AS org_plan,
        ${billingModeExpr} AS billing_mode,
        ${contractPriceExpr} AS individual_contract_price_cents,
        ${pilotPriceExpr} AS pilot_price_cents,
        ${quotePendingExpr} AS custom_quote_pending,
        ${sizeClassExpr} AS company_size_class,
        ${employeeCountExpr} AS employee_count_approx,
        ${pilotStatusExpr} AS pilot_status,
        ${customerStageExpr} AS customer_stage,
        ${convertedAtExpr} AS converted_at,
        current_sub.plan AS current_plan,
        current_sub.status AS current_status,
        current_sub.created_at AS current_subscription_created_at,
        previous_sub.plan AS previous_plan,
        previous_sub.status AS previous_status,
        previous_sub.created_at AS previous_subscription_created_at
      FROM organizations o
      LEFT JOIN LATERAL (
        SELECT u.id AS user_id
        FROM users u
        WHERE u.org_id = o.id
        ORDER BY u.created_at ASC
        LIMIT 1
      ) owner_user ON TRUE
      LEFT JOIN LATERAL (
        SELECT s.plan, s.status, s.created_at
        FROM subscriptions s
        WHERE s.user_id = owner_user.user_id
          AND s.created_at <= $1::timestamptz
        ORDER BY s.created_at DESC
        LIMIT 1
      ) current_sub ON TRUE
      LEFT JOIN LATERAL (
        SELECT s.plan, s.status, s.created_at
        FROM subscriptions s
        WHERE s.user_id = owner_user.user_id
          AND s.created_at <= $2::timestamptz
        ORDER BY s.created_at DESC
        LIMIT 1
      ) previous_sub ON TRUE
      ${fallbackWhereClause}
    `, fallbackParams);
    return rows || [];
  }
}

async function queryUsageByOrg(pool, { orgId, window, productAnalyticsColumns }) {
  const required = [ "org_id", "event_name", "occurred_at", "user_id" ];
  const hasRequiredColumns = required.every((column) => productAnalyticsColumns.has(column));
  if (!hasRequiredColumns) {
    return { available: false, byOrg: new Map(), rows: 0 };
  }

  const usageParams = [
    window.current_from,
    window.current_to,
    window.previous_from,
    window.previous_to,
    VALUE_EVENTS
  ];
  let orgClause = "";
  if (orgId) {
    usageParams.push(orgId);
    orgClause = "AND pae.org_id = $6";
  }

  const usageByOrg = new Map();
  const { rows } = await pool.query(`
    SELECT
      pae.org_id,
      COUNT(*) FILTER (
        WHERE pae.occurred_at >= $1::timestamptz
          AND pae.occurred_at < $2::timestamptz
          AND pae.event_name = ANY($5::text[])
      )::int AS current_value_events,
      COUNT(*) FILTER (
        WHERE pae.occurred_at >= $3::timestamptz
          AND pae.occurred_at < $4::timestamptz
          AND pae.event_name = ANY($5::text[])
      )::int AS previous_value_events,
      COUNT(DISTINCT pae.user_id) FILTER (
        WHERE pae.occurred_at >= $1::timestamptz
          AND pae.occurred_at < $2::timestamptz
          AND pae.event_name = ANY($5::text[])
      )::int AS current_active_users,
      COUNT(DISTINCT pae.user_id) FILTER (
        WHERE pae.occurred_at >= $3::timestamptz
          AND pae.occurred_at < $4::timestamptz
          AND pae.event_name = ANY($5::text[])
      )::int AS previous_active_users,
      MAX(pae.occurred_at) FILTER (
        WHERE pae.occurred_at >= $1::timestamptz
          AND pae.occurred_at < $2::timestamptz
          AND pae.event_name = ANY($5::text[])
      ) AS current_last_value_event_at,
      MAX(pae.occurred_at) FILTER (
        WHERE pae.occurred_at >= $3::timestamptz
          AND pae.occurred_at < $2::timestamptz
          AND pae.event_name = ANY($5::text[])
      ) AS last_value_event_at
    FROM product_analytics_events pae
    WHERE pae.org_id IS NOT NULL
      AND pae.occurred_at >= $3::timestamptz
      AND pae.occurred_at < $2::timestamptz
      ${orgClause}
    GROUP BY pae.org_id
  `, usageParams);

  for (const row of rows || []) {
    usageByOrg.set(row.org_id, {
      current_value_events: toInt(row.current_value_events, 0),
      previous_value_events: toInt(row.previous_value_events, 0),
      current_active_users: toInt(row.current_active_users, 0),
      previous_active_users: toInt(row.previous_active_users, 0),
      current_last_value_event_at: row.current_last_value_event_at || null,
      last_value_event_at: row.last_value_event_at || null,
      current_active_modules: 0
    });
  }

  // Current-window module breadth for non-vanity usage intensity.
  const moduleParams = [ window.current_from, window.current_to, VALUE_EVENTS ];
  let moduleOrgClause = "";
  if (orgId) {
    moduleParams.push(orgId);
    moduleOrgClause = "AND pae.org_id = $4";
  }
  const { rows: moduleRows } = await pool.query(`
    SELECT
      pae.org_id,
      pae.event_name,
      COUNT(*)::int AS event_count
    FROM product_analytics_events pae
    WHERE pae.org_id IS NOT NULL
      AND pae.occurred_at >= $1::timestamptz
      AND pae.occurred_at < $2::timestamptz
      AND pae.event_name = ANY($3::text[])
      ${moduleOrgClause}
    GROUP BY pae.org_id, pae.event_name
  `, moduleParams);

  const moduleSetByOrg = new Map();
  for (const row of moduleRows || []) {
    const orgKey = row.org_id;
    if (!moduleSetByOrg.has(orgKey)) moduleSetByOrg.set(orgKey, new Set());
    const moduleSet = moduleSetByOrg.get(orgKey);
    for (const [ moduleName, eventNames ] of Object.entries(MODULE_EVENT_MAP)) {
      if (eventNames.has(row.event_name)) {
        moduleSet.add(moduleName);
      }
    }
  }
  for (const [ orgKey, modules ] of moduleSetByOrg.entries()) {
    const current = usageByOrg.get(orgKey) || defaultUsageRow();
    current.current_active_modules = modules.size;
    usageByOrg.set(orgKey, current);
  }

  return {
    available: true,
    byOrg: usageByOrg,
    rows: rows.length
  };
}

function deriveUsageBand(currentEvents, currentUsers) {
  if (currentEvents <= 0) return "dormant";
  if (currentEvents >= 20 && currentUsers >= 3) return "high";
  if (currentEvents >= 8 && currentUsers >= 2) return "medium";
  return "low";
}

function deriveStage(row, { currentIsPaid, previousIsPaid }) {
  const pilotStatus = String(row.pilot_status || "").toLowerCase();
  const customerStage = String(row.customer_stage || "").toLowerCase();
  if (pilotStatus === "active") return "pilot";
  if (currentIsPaid) return "paid";
  if (previousIsPaid && !currentIsPaid) return "churned";
  if (customerStage === "demo") return "demo";
  return "inactive";
}

function isWithinWindow(isoTimestamp, window) {
  if (!isoTimestamp) return false;
  const ts = new Date(isoTimestamp);
  if (Number.isNaN(ts.getTime())) return false;
  return ts >= new Date(window.current_from) && ts < new Date(window.current_to);
}

export async function getSaaSRetentionTruth(pool, options = {}) {
  const orgId = options?.orgId || null;
  const window = buildWindow(options?.windowDays || 30);
  const base = zeroSaaSRetentionTruth(window.days);
  base.scope_org_id = orgId;
  base.available = true;

  try {
    const organizationColumns = await getTableColumns(pool, "organizations");
    const productAnalyticsColumns = await getTableColumns(pool, "product_analytics_events");
    const commercialRows = await queryOrgCommercialSnapshots(pool, { orgId, window, organizationColumns });
    const usageResult = await queryUsageByOrg(pool, { orgId, window, productAnalyticsColumns }).catch(() => ({
      available: false,
      byOrg: new Map(),
      rows: 0
    }));

    base.quality_flags.usage_source_available = usageResult.available;
    base.quality_flags.commercial_rows = commercialRows.length;
    base.quality_flags.usage_rows = usageResult.rows;
    if (!commercialRows.length) return base;

    const usageByOrg = usageResult.byOrg || new Map();
    const byPlan = new Map();
    const byIcp = new Map();
    const byStage = new Map();
    const atRisk = [];
    const churned = [];
    const expanded = [];
    const pqaOrgs = [];
    const valueEventsForActivePaid = [];

    const headline = {
      active_paid_orgs: 0,
      active_customer_orgs: 0,
      previous_active_customer_orgs: 0,
      retained_logos: 0,
      retained_logo_rate_pct: null,
      logo_churned_orgs: 0,
      logo_churn_rate_pct: null,
      inactive_but_paying_orgs: 0,
      pqa_orgs: 0,
      pilot_active_orgs: 0,
      pilot_retained_orgs: 0,
      pilot_converted_orgs_30d: 0,
      gross_revenue_churn_mrr: 0,
      gross_revenue_churn_rate_pct: null,
      net_revenue_retention_pct: null,
      expansion_mrr: 0,
      contraction_mrr: 0,
      cohort_previous_mrr: 0,
      cohort_current_mrr: 0
    };

    const usageIntensity = {
      high: 0,
      medium: 0,
      low: 0,
      dormant: 0,
      avg_value_events_per_active_org: 0,
      median_value_events_per_active_org: 0
    };

    for (const row of commercialRows) {
      const orgUsage = usageByOrg.get(row.org_id) || defaultUsageRow();

      const currentPlan = normalizePlan(row.current_plan || row.org_plan);
      const previousPlan = normalizePlan(row.previous_plan || row.current_plan || row.org_plan);
      const currentIsPaid = isPaidPlan(currentPlan, row.current_status);
      const previousIsPaid = isPaidPlan(previousPlan, row.previous_status);
      const currentPricing = resolveRecognizedMrr(currentPlan, row);
      const previousPricing = resolveRecognizedMrr(previousPlan, row);
      const currentMrr = currentIsPaid ? currentPricing.recognized_mrr : 0;
      const previousMrr = previousIsPaid ? previousPricing.recognized_mrr : 0;
      const currentEvents = toInt(orgUsage.current_value_events, 0);
      const previousEvents = toInt(orgUsage.previous_value_events, 0);
      const currentUsers = toInt(orgUsage.current_active_users, 0);
      const activeModules = toInt(orgUsage.current_active_modules, 0);
      const previousActiveCustomer = previousIsPaid && previousEvents > 0;
      const currentActiveCustomer = currentIsPaid && currentEvents > 0;
      const retainedLogo = previousActiveCustomer && currentActiveCustomer;
      const logoChurned = previousActiveCustomer && !currentIsPaid;
      const inactiveButPaying = currentIsPaid && currentEvents === 0;
      const expansionMrr = previousActiveCustomer ? Math.max(0, currentMrr - previousMrr) : 0;
      const contractionMrr = previousActiveCustomer ? Math.max(0, previousMrr - currentMrr) : 0;
      const pqa = currentIsPaid
        && currentEvents >= PQA_EVENT_THRESHOLD
        && currentUsers >= PQA_ACTIVE_USER_THRESHOLD
        && activeModules >= PQA_ACTIVE_MODULE_THRESHOLD;
      const stage = deriveStage(row, { currentIsPaid, previousIsPaid });
      const sizeClass = normalizeSizeClass(row.company_size_class)
        || classifyCompanySize(row.employee_count_approx)?.class
        || "UNKNOWN";
      const usageBand = deriveUsageBand(currentEvents, currentUsers);
      const daysSinceLastValueEvent = diffDays(orgUsage.last_value_event_at || orgUsage.current_last_value_event_at);
      const pilotActive = String(row.pilot_status || "").toLowerCase() === "active";
      const pilotRetained = pilotActive && previousEvents > 0 && currentEvents > 0;
      const pilotConvertedCurrentWindow = isWithinWindow(row.converted_at, window);

      if (currentIsPaid) {
        headline.active_paid_orgs += 1;
        usageIntensity[usageBand] += 1;
        valueEventsForActivePaid.push(currentEvents);
      }
      if (currentActiveCustomer) headline.active_customer_orgs += 1;
      if (previousActiveCustomer) {
        headline.previous_active_customer_orgs += 1;
        headline.cohort_previous_mrr += previousMrr;
        headline.cohort_current_mrr += currentMrr;
        headline.gross_revenue_churn_mrr += contractionMrr;
        headline.expansion_mrr += expansionMrr;
        headline.contraction_mrr += contractionMrr;
      }
      if (retainedLogo) headline.retained_logos += 1;
      if (logoChurned) headline.logo_churned_orgs += 1;
      if (inactiveButPaying) headline.inactive_but_paying_orgs += 1;
      if (pqa) headline.pqa_orgs += 1;
      if (pilotActive) headline.pilot_active_orgs += 1;
      if (pilotRetained) headline.pilot_retained_orgs += 1;
      if (pilotConvertedCurrentWindow) headline.pilot_converted_orgs_30d += 1;

      const state = {
        current_is_paid: currentIsPaid,
        retained_logo: retainedLogo,
        logo_churned: logoChurned,
        inactive_but_paying: inactiveButPaying,
        pqa,
        current_mrr: currentMrr,
        previous_mrr: previousMrr,
        expansion_mrr: expansionMrr,
        gross_revenue_churn_mrr: contractionMrr
      };

      const planKey = currentPlan || "UNKNOWN";
      if (!byPlan.has(planKey)) byPlan.set(planKey, segmentRow("plan", planKey, `Plan ${planKey}`));
      bumpSegment(byPlan.get(planKey), state);

      if (!byIcp.has(sizeClass)) byIcp.set(sizeClass, segmentRow("icp", sizeClass, `ICP ${sizeClass}`));
      bumpSegment(byIcp.get(sizeClass), state);

      if (!byStage.has(stage)) byStage.set(stage, segmentRow("stage", stage, `Stage ${stage}`));
      bumpSegment(byStage.get(stage), state);

      const reasonCodes = [];
      if (inactiveButPaying) reasonCodes.push("inactive_but_paying");
      if (currentEvents > 0 && currentEvents < 3) reasonCodes.push("low_value_event_volume");
      if (currentEvents > 0 && currentUsers <= 1) reasonCodes.push("single_user_dependency");
      if (daysSinceLastValueEvent != null && daysSinceLastValueEvent > 21) reasonCodes.push("stale_value_activity");
      if (previousActiveCustomer && currentMrr < previousMrr) reasonCodes.push("mrr_contraction");
      if (pilotActive && currentEvents === 0) reasonCodes.push("pilot_without_engagement");
      if (currentIsPaid && currentMrr === 0) reasonCodes.push("pending_quote_or_missing_price");

      let riskScore = 0;
      if (inactiveButPaying) riskScore += 55;
      if (currentEvents > 0 && currentEvents < 3) riskScore += 20;
      if (currentEvents > 0 && currentUsers <= 1) riskScore += 12;
      if (daysSinceLastValueEvent != null && daysSinceLastValueEvent > 21) riskScore += 15;
      if (previousActiveCustomer && currentMrr < previousMrr) riskScore += 18;
      if (pilotActive && currentEvents === 0) riskScore += 20;
      if (currentIsPaid && currentMrr === 0) riskScore += 12;
      riskScore = Math.min(100, riskScore);

      const detail = {
        org_id: row.org_id,
        org_name: row.org_name,
        org_type: row.org_type || "unknown",
        plan: currentPlan,
        stage,
        icp: sizeClass,
        pilot_status: row.pilot_status || null,
        current_mrr: currentMrr,
        previous_mrr: previousMrr,
        mrr_delta: currentMrr - previousMrr,
        current_value_events: currentEvents,
        previous_value_events: previousEvents,
        current_active_users: currentUsers,
        current_active_modules: activeModules,
        days_since_last_value_event: daysSinceLastValueEvent,
        reason_codes: reasonCodes,
        risk_score: riskScore
      };

      if ((currentIsPaid || pilotActive) && riskScore >= 55) atRisk.push(detail);
      if (logoChurned) churned.push(detail);
      if (expansionMrr > 0) expanded.push(detail);
      if (pqa) pqaOrgs.push(detail);
    }

    headline.retained_logo_rate_pct = safePct(headline.retained_logos, headline.previous_active_customer_orgs);
    headline.logo_churn_rate_pct = safePct(headline.logo_churned_orgs, headline.previous_active_customer_orgs);
    headline.gross_revenue_churn_rate_pct = safePct(headline.gross_revenue_churn_mrr, headline.cohort_previous_mrr);
    headline.net_revenue_retention_pct = safePct(headline.cohort_current_mrr, headline.cohort_previous_mrr);

    if (valueEventsForActivePaid.length) {
      const sum = valueEventsForActivePaid.reduce((acc, value) => acc + value, 0);
      usageIntensity.avg_value_events_per_active_org = round1(sum / valueEventsForActivePaid.length);
      usageIntensity.median_value_events_per_active_org = median(valueEventsForActivePaid);
    }

    base.headline = headline;
    base.usage_intensity = usageIntensity;
    base.segment_drilldown = {
      by_plan: stableSortSegments([ ...byPlan.values() ]),
      by_icp: stableSortSegments([ ...byIcp.values() ]),
      by_stage: stableSortSegments([ ...byStage.values() ])
    };
    base.org_drilldown = {
      at_risk: atRisk.sort((a, b) => b.risk_score - a.risk_score || b.current_mrr - a.current_mrr).slice(0, 25),
      churned: churned.sort((a, b) => b.previous_mrr - a.previous_mrr || a.org_name.localeCompare(b.org_name)).slice(0, 25),
      expanded: expanded.sort((a, b) => b.mrr_delta - a.mrr_delta || b.current_mrr - a.current_mrr).slice(0, 25),
      pqa: pqaOrgs.sort((a, b) => b.current_value_events - a.current_value_events || b.current_mrr - a.current_mrr).slice(0, 25)
    };
    return base;
  } catch {
    const fallback = zeroSaaSRetentionTruth(window.days);
    fallback.scope_org_id = orgId;
    fallback.available = false;
    return fallback;
  }
}
