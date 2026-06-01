import { classifyCompanySize } from "./pricingTierService.js";
import { STEP_CATALOG } from "./onboardingService.js";

const COHORT_WINDOW_DAYS = 180;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const VALUE_EVENT_MODULE_MAP = {
  requisition_created: "demand",
  request_created: "demand",
  request_sent: "demand",
  deal_started: "deal",
  deal_completed: "deal",
  assignment_created: "delivery",
  timesheet_started: "delivery",
  timesheet_submitted: "delivery",
  timesheet_approved: "delivery",
  rate_card_created: "vendor_governance",
  integration_connected: "vendor_governance"
};
const ACTIVATION_EVENTS = new Set([
  "requisition_created",
  "request_created",
  "request_sent",
  "deal_started",
  "assignment_created",
  "timesheet_started",
  "rate_card_created",
  "integration_connected"
]);
const CORE_FLOW_COMPLETION_EVENTS = new Set([
  "request_sent",
  "deal_completed",
  "assignment_created",
  "timesheet_submitted",
  "timesheet_approved",
  "rate_card_created",
  "integration_connected"
]);
const MODULE_ORDER = ["demand", "deal", "delivery", "vendor_governance"];
const TARIFF_PATH_ORDER = ["pilot", "direct_contract", "catalog_paid", "lead_only", "unclassified"];
const STAGE_ORDER = [
  "lead",
  "qualified",
  "registered",
  "pilot_started",
  "pilot_activated",
  "first_core_flow_executed",
  "pilot_successful_usage",
  "commercial_pricing_clarified",
  "paid_live",
  "lost_aborted"
];
const ONBOARDING_STEPS = STEP_CATALOG
  .filter((step) => step.key !== "platform_explored")
  .sort((a, b) => a.order - b.order)
  .map((step) => ({
    key: step.key,
    label: step.label
  }));

function toIsoDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function buildWindow(days = COHORT_WINDOW_DAYS) {
  const to = new Date();
  const from = new Date(to.getTime() - ((days - 1) * MS_PER_DAY));
  return {
    days,
    label: `${days} Tage`,
    date_from: toIsoDate(from),
    date_to: toIsoDate(to),
    from,
    to
  };
}

function toInt(value, fallback = 0) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}


function toBool(value) {
  if (value === true || value === false) return value;
  if (value === "t" || value === "true" || value === 1 || value === "1") return true;
  return false;
}

function safePct(numerator, denominator) {
  if (!denominator) return null;
  return Number(((Number(numerator) / Number(denominator)) * 100).toFixed(1));
}

function round1(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Number(Number(value).toFixed(1));
}

function avg(values) {
  if (!values.length) return null;
  return round1(values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].map((value) => Number(value || 0)).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return round1(sorted[middle]);
  return round1((sorted[middle - 1] + sorted[middle]) / 2);
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

function normalizeStage(stage) {
  const normalized = String(stage || "").toLowerCase();
  if (normalized === "contract_requested") return "contract_requested";
  if (normalized === "demo" || normalized === "pilot" || normalized === "live") return normalized;
  return null;
}

function normalizeSizeClass(sizeClass, employeeCountApprox) {
  const normalized = String(sizeClass || "").toUpperCase();
  if (["I", "II", "III", "IV"].includes(normalized)) return normalized;
  return classifyCompanySize(employeeCountApprox)?.class || null;
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoTimestamp(value) {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

function dayDiff(startValue, endValue = new Date()) {
  const start = toDate(startValue);
  const end = toDate(endValue);
  if (!start || !end) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY));
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

function orgColExpr(columnSet, columnName, fallbackSql) {
  if (columnSet.has(columnName)) return `o.${columnName}`;
  return fallbackSql;
}

function zeroTransition(fromStage, toStage) {
  return {
    from_stage: fromStage,
    to_stage: toStage,
    cohort_count: 0,
    converted_count: 0,
    rate_pct: null
  };
}

function zeroTiming() {
  return {
    count: 0,
    avg_days: null,
    p50_days: null
  };
}

export function zeroPilotConversionTruth(windowDays = COHORT_WINDOW_DAYS) {
  const window = buildWindow(windowDays);
  return {
    available: false,
    generated_at: new Date().toISOString(),
    scope_org_id: null,
    cohort_window: {
      days: window.days,
      label: window.label,
      date_from: window.date_from,
      date_to: window.date_to
    },
    definitions: buildDefinitions(window.days),
    quality_flags: {
      analytics_source_available: false,
      strategic_lead_source_available: false,
      onboarding_source_available: false,
      pre_registration_lead_capture_available: false,
      pricing_clarity_timestamps_partially_inferred: false,
      lead_stage_fallbacks_used: 0,
      pilot_start_fallbacks_used: 0,
      tracked_org_rows: 0,
      strategic_rows: 0,
      product_event_rows: 0
    },
    headline: {
      tracked_orgs: 0,
      leads: 0,
      qualified: 0,
      registered: 0,
      active_pilots: 0,
      activated_pilots: 0,
      converted_pilots: 0,
      lost_pilots: 0,
      at_risk_pilots: 0,
      avg_days_to_activation: null,
      avg_days_to_conversion: null
    },
    stage_counts: Object.fromEntries(STAGE_ORDER.map((stage) => [stage, 0])),
    current_stage_distribution: [],
    transitions: {
      lead_to_registered: zeroTransition("lead", "registered"),
      registration_to_pilot_started: zeroTransition("registered", "pilot_started"),
      pilot_started_to_activated: zeroTransition("pilot_started", "pilot_activated"),
      activated_to_paid_live: zeroTransition("pilot_activated", "paid_live"),
      pilot_to_lost: zeroTransition("pilot_started", "lost_aborted")
    },
    timing: {
      activation: zeroTiming(),
      conversion: zeroTiming()
    },
    activation: {
      activated_orgs: 0,
      by_module: [],
      by_event: [],
      first_core_flow_mix: []
    },
    gtm_learning: {
      by_icp: [],
      by_tariff_path: [],
      onboarding_bottlenecks: [],
      product_area_usage: [],
      funnel_dropoff: []
    },
    org_drilldown: {
      active_pilots: [],
      activated_pilots: [],
      converted: [],
      at_risk: [],
      lost: []
    }
  };
}

function buildDefinitions(windowDays) {
  return {
    tracked_population: {
      meaning: "Enterprise-/Pilot-/Contract-Population ohne Demo-Fantasie.",
      inclusion_rule: "Organisationen mit Strategic-Lead-Signal, Pilotstatus, INDIVIDUELL/individual_contract/pilot_contract oder explizitem contract_requested.",
      cohort_window_days: windowDays
    },
    stages: {
      lead: {
        meaning: "Erste belastbare kommerzielle Nachfrage.",
        source: [
          "strategic_collaboration_requests.created_at",
          "organizations.created_at (Fallback wenn kein Pre-Registration-Lead vorhanden)"
        ],
        transition_rule: "Earliest strategic lead; ohne separates Lead-Capture fallbackt die Stage ehrlich auf Registrierung."
      },
      qualified: {
        meaning: "Lead ist kommerziell qualifiziert oder direkte Vertragsanfrage liegt vor.",
        source: [
          "strategic_collaboration_requests.status/status_updated_at",
          "organizations.customer_stage = contract_requested",
          "organizations.billing_mode = individual_contract"
        ],
        transition_rule: "Strategic status >= qualifiziert oder direkte Vertragsanfrage."
      },
      registered: {
        meaning: "Organisation ist technisch angelegt.",
        source: ["organizations.created_at"],
        transition_rule: "organizations.created_at"
      },
      pilot_started: {
        meaning: "Pilot ist verbindlich aktiviert.",
        source: [
          "organizations.pilot_status",
          "organizations.has_used_pilot",
          "organizations.pilot_started_at"
        ],
        transition_rule: "pilot_status/has_used_pilot plus pilot_started_at; fehlende Alt-Timestamps werden transparent auf Registrierung gefallbackt."
      },
      pilot_activated: {
        meaning: "Erster echter Core-Value-Kontakt im Pilot.",
        source: ["product_analytics_events"],
        transition_rule: "Erstes Event nach Pilotstart aus requisition_created, request_created, request_sent, deal_started, assignment_created, timesheet_started, rate_card_created, integration_connected."
      },
      first_core_flow_executed: {
        meaning: "Erster completion-grade Kernfluss.",
        source: ["product_analytics_events"],
        transition_rule: "Erstes Event nach Pilotstart aus request_sent, deal_completed, assignment_created, timesheet_submitted, timesheet_approved, rate_card_created, integration_connected."
      },
      pilot_successful_usage: {
        meaning: "Pilot zeigt belastbare Nutzung statt Vanity-Aktivität.",
        source: ["product_analytics_events"],
        transition_rule: "Erster Zeitpunkt mit >=5 Core-Value-Events seit Pilotstart und zusätzlich >=2 aktive Tage oder >=2 Nutzer oder >=2 genutzte Produktbereiche."
      },
      commercial_pricing_clarified: {
        meaning: "Pricing-/Contract-Path ist nicht mehr unklar.",
        source: [
          "organizations.billing_mode",
          "organizations.individual_contract_price_cents",
          "organizations.pilot_price_cents",
          "organizations.custom_quote_pending",
          "subscriptions.created_at (Timestamp-Fallback)"
        ],
        transition_rule: "Expliziter Pilot-/Contract-Preis oder Standardkatalog ohne offene Angebotslücke."
      },
      paid_live: {
        meaning: "Organisation ist in zahlendem Live-Zustand.",
        source: [
          "organizations.pilot_status",
          "organizations.converted_at",
          "organizations.customer_stage",
          "subscriptions.status/plan"
        ],
        transition_rule: "pilot_status = converted oder aktive bezahlte Subscription ohne offene Quote."
      },
      lost_aborted: {
        meaning: "Lead/Pilot wurde verworfen oder endete ohne Conversion.",
        source: [
          "strategic_collaboration_requests.status = verworfen",
          "organizations.pilot_status in (ended, blocked, exception)",
          "organizations.pilot_ended_at"
        ],
        transition_rule: "Strategic lead verworfen oder Pilot endet/blockiert ohne live Conversion."
      }
    },
    transition_metric_rule: {
      meaning: "Alle Transition-Metriken zählen pro Organisation höchstens einmal.",
      rule: "Denominator = eindeutige Org-Kohorte mit Start-Stage im Fenster; Numerator = dieselben Orgs mit nachgelagerter Ziel-Stage."
    }
  };
}

async function queryTrackedOrganizations(pool, orgId = null) {
  const organizationColumns = await getTableColumns(pool, "organizations");
  const billingModeExpr = orgColExpr(organizationColumns, "billing_mode", "'standard_catalog'::text");
  const pilotStatusExpr = orgColExpr(organizationColumns, "pilot_status", "NULL::text");
  const hasUsedPilotExpr = orgColExpr(organizationColumns, "has_used_pilot", "FALSE");
  const pilotStartedExpr = orgColExpr(organizationColumns, "pilot_started_at", "NULL::timestamptz");
  const pilotEndedExpr = orgColExpr(organizationColumns, "pilot_ended_at", "NULL::timestamptz");
  const convertedExpr = orgColExpr(organizationColumns, "converted_at", "NULL::timestamptz");
  const targetPlanExpr = orgColExpr(organizationColumns, "target_plan_after_pilot", "NULL::text");
  const contractPriceExpr = orgColExpr(organizationColumns, "individual_contract_price_cents", "NULL::int");
  const pilotPriceExpr = orgColExpr(organizationColumns, "pilot_price_cents", "NULL::int");
  const customQuoteExpr = orgColExpr(organizationColumns, "custom_quote_pending", "FALSE");
  const customerStageExpr = orgColExpr(organizationColumns, "customer_stage", "NULL::text");
  const companySizeExpr = orgColExpr(organizationColumns, "company_size_class", "NULL::text");
  const employeeCountExpr = orgColExpr(organizationColumns, "employee_count_approx", "NULL::int");
  const featureBundleExpr = orgColExpr(organizationColumns, "feature_bundle", "NULL::text");
  const individualTierExpr = orgColExpr(organizationColumns, "individual_tier_auto", "NULL::text");
  const accountTypeExpr = orgColExpr(organizationColumns, "account_type", "'live'::text");

  const orgFilterClause = orgId ? "WHERE o.id = $1" : "";
  const params = orgId ? [orgId] : [];

  const { rows } = await pool.query(`
    SELECT
      o.id AS org_id,
      o.name AS org_name,
      o.type AS org_type,
      o.plan AS organization_plan,
      o.created_at AS org_created_at,
      ${accountTypeExpr} AS account_type,
      ${billingModeExpr} AS billing_mode,
      ${pilotStatusExpr} AS pilot_status,
      ${hasUsedPilotExpr} AS has_used_pilot,
      ${pilotStartedExpr} AS pilot_started_at,
      ${pilotEndedExpr} AS pilot_ended_at,
      ${convertedExpr} AS converted_at,
      ${targetPlanExpr} AS target_plan_after_pilot,
      ${contractPriceExpr} AS individual_contract_price_cents,
      ${pilotPriceExpr} AS pilot_price_cents,
      ${customQuoteExpr} AS custom_quote_pending,
      ${customerStageExpr} AS customer_stage,
      ${companySizeExpr} AS company_size_class,
      ${employeeCountExpr} AS employee_count_approx,
      ${featureBundleExpr} AS feature_bundle,
      ${individualTierExpr} AS individual_tier_auto,
      owner_user.user_id AS owner_user_id,
      owner_user.role_key AS owner_role_key,
      owner_user.created_at AS owner_membership_created_at,
      current_sub.plan AS current_subscription_plan,
      current_sub.status AS current_subscription_status,
      current_sub.created_at AS current_subscription_created_at
    FROM organizations o
    LEFT JOIN LATERAL (
      SELECT om.user_id, om.role_key, om.created_at
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
      ORDER BY s.created_at DESC
      LIMIT 1
    ) current_sub ON TRUE
    ${orgFilterClause}
  `, params);

  return {
    rows: rows || [],
    organization_columns: organizationColumns
  };
}

async function queryStrategicLeadSignals(pool, orgId = null) {
  try {
    const params = [];
    const orgFilterClause = orgId ? "AND scr.requester_org_id = $1" : "";
    if (orgId) params.push(orgId);
    const { rows } = await pool.query(`
      SELECT
        scr.requester_org_id AS org_id,
        MIN(scr.created_at) AS lead_at,
        MIN(CASE
          WHEN scr.status IN ('qualifiziert', 'in_pruefung', 'kontaktiert', 'in_abstimmung', 'abgeschlossen')
          THEN COALESCE(scr.status_updated_at, scr.created_at)
          ELSE NULL
        END) AS qualified_at,
        MIN(CASE
          WHEN scr.status = 'verworfen'
          THEN COALESCE(scr.status_updated_at, scr.created_at)
          ELSE NULL
        END) AS lost_at,
        COUNT(*)::int AS lead_count,
        COUNT(*) FILTER (
          WHERE scr.status IN ('qualifiziert', 'in_pruefung', 'kontaktiert', 'in_abstimmung', 'abgeschlossen')
        )::int AS qualified_count,
        COUNT(*) FILTER (WHERE scr.status = 'verworfen')::int AS lost_count
      FROM strategic_collaboration_requests scr
      WHERE scr.requester_org_id IS NOT NULL
        ${orgFilterClause}
      GROUP BY scr.requester_org_id
    `, params);

    return {
      available: true,
      rows: rows || []
    };
  } catch {
    return {
      available: false,
      rows: []
    };
  }
}

async function queryProductEventTimeline(pool, orgIds) {
  if (!orgIds.length) {
    return {
      available: true,
      rows: []
    };
  }
  try {
    const { rows } = await pool.query(`
      SELECT pae.org_id, pae.user_id, pae.event_name, pae.occurred_at
      FROM product_analytics_events pae
      WHERE pae.org_id = ANY($1::uuid[])
        AND pae.event_name = ANY($2::text[])
      ORDER BY pae.org_id ASC, pae.occurred_at ASC
    `, [orgIds, Object.keys(VALUE_EVENT_MODULE_MAP)]);

    return {
      available: true,
      rows: rows || []
    };
  } catch {
    return {
      available: false,
      rows: []
    };
  }
}

async function queryOnboardingProgressByUser(pool, userIds) {
  if (!userIds.length) {
    return {
      available: true,
      rows: []
    };
  }
  try {
    const { rows } = await pool.query(`
      SELECT user_id, step_key, completed, completed_at
      FROM user_onboarding_progress
      WHERE user_id = ANY($1::uuid[])
    `, [userIds]);

    return {
      available: true,
      rows: rows || []
    };
  } catch {
    return {
      available: false,
      rows: []
    };
  }
}

function determineTrackedOrg(row, strategicSignal) {
  const plan = normalizePlan(row.current_subscription_plan || row.organization_plan);
  const billingMode = normalizeBillingMode(row.billing_mode);
  const pilotStatus = String(row.pilot_status || "").toLowerCase();
  const customerStage = normalizeStage(row.customer_stage);
  const companySizeClass = normalizeSizeClass(row.company_size_class, row.employee_count_approx);

  return Boolean(
    strategicSignal
    || plan === "INDIVIDUELL"
    || billingMode !== "standard_catalog"
    || pilotStatus
    || toBool(row.has_used_pilot)
    || customerStage === "contract_requested"
    || row.target_plan_after_pilot
    || row.feature_bundle === "enterprise_full"
    || row.individual_tier_auto
    || companySizeClass
    || toBool(row.custom_quote_pending)
  );
}

function resolveLeadAt(row, strategicSignal, qualityFlags) {
  if (strategicSignal?.lead_at) return { at: toDate(strategicSignal.lead_at), source: "strategic_lead" };
  qualityFlags.lead_stage_fallbacks_used += 1;
  return {
    at: toDate(row.org_created_at) || toDate(row.owner_membership_created_at) || toDate(row.current_subscription_created_at),
    source: "registration_fallback"
  };
}

function resolveQualifiedAt(row, strategicSignal, registeredAt) {
  if (strategicSignal?.qualified_at) return { at: toDate(strategicSignal.qualified_at), source: "strategic_qualified" };
  const customerStage = normalizeStage(row.customer_stage);
  const billingMode = normalizeBillingMode(row.billing_mode);
  if (customerStage === "contract_requested" || billingMode === "individual_contract") {
    return { at: registeredAt, source: "contract_requested" };
  }
  return { at: null, source: null };
}

function resolvePilotStartAt(row, registeredAt, qualityFlags) {
  const explicit = toDate(row.pilot_started_at);
  if (explicit) return { at: explicit, source: "pilot_started_at", inferred: false };

  const pilotStatus = String(row.pilot_status || "").toLowerCase();
  const hasPilot = toBool(row.has_used_pilot) || ["active", "ended", "converted", "blocked", "exception"].includes(pilotStatus);
  if (!hasPilot) return { at: null, source: null, inferred: false };

  qualityFlags.pilot_start_fallbacks_used += 1;
  return { at: registeredAt, source: "registration_fallback", inferred: true };
}

function resolveCommercialState(row) {
  const billingMode = normalizeBillingMode(row.billing_mode);
  const plan = normalizePlan(row.current_subscription_plan || row.organization_plan);
  const subscriptionStatus = String(row.current_subscription_status || "").toLowerCase();
  const contractPriceCents = row.individual_contract_price_cents == null ? null : toInt(row.individual_contract_price_cents, null);
  const pilotPriceCents = row.pilot_price_cents == null ? null : toInt(row.pilot_price_cents, null);
  const pendingQuote = toBool(row.custom_quote_pending);
  const convertedPilot = String(row.pilot_status || "").toLowerCase() === "converted" || Boolean(row.converted_at);
  const customerStage = normalizeStage(row.customer_stage);

  let pricingClarified = false;
  let paidLive = false;
  let priceSource = null;
  let recognizedPriceCents = null;

  if (billingMode === "individual_contract") {
    if (contractPriceCents != null && !pendingQuote) {
      pricingClarified = true;
      priceSource = "contract_price";
      recognizedPriceCents = contractPriceCents;
    }
  } else if (billingMode === "pilot_contract") {
    if (pilotPriceCents != null && !pendingQuote) {
      pricingClarified = true;
      priceSource = "pilot_price";
      recognizedPriceCents = pilotPriceCents;
    }
  } else if (subscriptionStatus === "active" && plan !== "DEMO" && !pendingQuote) {
    pricingClarified = true;
    priceSource = "catalog_price";
  }

  if (convertedPilot) {
    pricingClarified = true;
    paidLive = true;
    priceSource = priceSource || "pilot_conversion";
  } else if (subscriptionStatus === "active" && plan !== "DEMO" && !pendingQuote) {
    paidLive = true;
  } else if (customerStage === "live" && !pendingQuote && plan !== "DEMO") {
    paidLive = true;
  }

  return {
    billing_mode: billingMode,
    plan,
    subscription_status: subscriptionStatus,
    pending_quote: pendingQuote,
    pricing_clarified: pricingClarified,
    paid_live: paidLive,
    price_source: priceSource,
    recognized_price_cents: recognizedPriceCents
  };
}

function resolveCommercialPricingAt(row, commercialState, state, qualityFlags) {
  if (!commercialState.pricing_clarified) {
    return { at: null, inferred: false };
  }

  if (commercialState.billing_mode === "pilot_contract" && state.pilot_started_at) {
    qualityFlags.pricing_clarity_timestamps_partially_inferred = true;
    return { at: state.pilot_started_at, inferred: true };
  }

  if (commercialState.billing_mode === "individual_contract") {
    const anchor = toDate(row.current_subscription_created_at) || state.registered_at;
    if (anchor) {
      qualityFlags.pricing_clarity_timestamps_partially_inferred = true;
      return { at: anchor, inferred: true };
    }
  }

  if (commercialState.plan !== "DEMO" && commercialState.subscription_status === "active" && !commercialState.pending_quote) {
    const anchor = toDate(row.current_subscription_created_at) || state.registered_at;
    if (anchor) {
      qualityFlags.pricing_clarity_timestamps_partially_inferred = true;
      return { at: anchor, inferred: true };
    }
  }

  if (state.paid_live_at) {
    return { at: state.paid_live_at, inferred: false };
  }

  return { at: null, inferred: false };
}

function derivePaidLiveAt(row, commercialState, state) {
  const convertedAt = toDate(row.converted_at);
  if (convertedAt) return convertedAt;
  if (!commercialState.paid_live) return null;
  return toDate(row.current_subscription_created_at) || state.commercial_pricing_clarified_at || state.registered_at;
}

function deriveLostAt(row, strategicSignal, paidLiveAt) {
  const pilotStatus = String(row.pilot_status || "").toLowerCase();
  if (strategicSignal?.lost_at && !paidLiveAt) return toDate(strategicSignal.lost_at);
  if ((pilotStatus === "ended" || pilotStatus === "blocked" || pilotStatus === "exception") && !paidLiveAt) {
    return toDate(row.pilot_ended_at) || toDate(row.converted_at) || toDate(row.pilot_started_at);
  }
  return null;
}

function deriveModule(eventName) {
  return VALUE_EVENT_MODULE_MAP[eventName] || null;
}

function buildEventHistory(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = String(row.org_id || "");
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      event_name: row.event_name,
      user_id: row.user_id,
      occurred_at: toDate(row.occurred_at)
    });
  }
  return map;
}

function buildOnboardingProgress(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const userId = String(row.user_id || "");
    if (!userId) continue;
    if (!map.has(userId)) map.set(userId, new Map());
    map.get(userId).set(String(row.step_key || ""), {
      completed: toBool(row.completed),
      completed_at: toIsoTimestamp(row.completed_at)
    });
  }
  return map;
}

function buildStrategicSignalMap(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const orgId = String(row.org_id || "");
    if (!orgId) continue;
    map.set(orgId, row);
  }
  return map;
}

function derivePilotUsageFromEvents(events, pilotStartedAt) {
  if (!pilotStartedAt || !events?.length) {
    return {
      activated_at: null,
      activation_event: null,
      activation_module: null,
      first_core_flow_executed_at: null,
      first_core_flow_event: null,
      first_core_flow_module: null,
      pilot_successful_usage_at: null,
      module_counts: Object.fromEntries(MODULE_ORDER.map((module) => [module, 0])),
      event_counts: {},
      active_modules: [],
      distinct_user_count: 0,
      active_day_count: 0,
      value_event_count: 0
    };
  }

  const moduleCounts = Object.fromEntries(MODULE_ORDER.map((module) => [module, 0]));
  const eventCounts = {};
  const users = new Set();
  const activeDays = new Set();
  const activeModules = new Set();
  let activatedAt = null;
  let activationEvent = null;
  let activationModule = null;
  let firstCoreFlowAt = null;
  let firstCoreFlowEvent = null;
  let firstCoreFlowModule = null;
  let successfulUsageAt = null;
  let valueEventCount = 0;

  for (const event of events) {
    if (!event.occurred_at || event.occurred_at < pilotStartedAt) continue;
    const module = deriveModule(event.event_name);
    if (!module) continue;

    valueEventCount += 1;
    eventCounts[event.event_name] = (eventCounts[event.event_name] || 0) + 1;
    moduleCounts[module] = (moduleCounts[module] || 0) + 1;
    activeModules.add(module);
    if (event.user_id != null) users.add(String(event.user_id));
    activeDays.add(event.occurred_at.toISOString().slice(0, 10));

    if (!activatedAt && ACTIVATION_EVENTS.has(event.event_name)) {
      activatedAt = event.occurred_at;
      activationEvent = event.event_name;
      activationModule = module;
    }

    if (!firstCoreFlowAt && CORE_FLOW_COMPLETION_EVENTS.has(event.event_name)) {
      firstCoreFlowAt = event.occurred_at;
      firstCoreFlowEvent = event.event_name;
      firstCoreFlowModule = module;
    }

    if (
      !successfulUsageAt
      && valueEventCount >= 5
      && (users.size >= 2 || activeModules.size >= 2 || activeDays.size >= 2)
    ) {
      successfulUsageAt = event.occurred_at;
    }
  }

  return {
    activated_at: activatedAt,
    activation_event: activationEvent,
    activation_module: activationModule,
    first_core_flow_executed_at: firstCoreFlowAt,
    first_core_flow_event: firstCoreFlowEvent,
    first_core_flow_module: firstCoreFlowModule,
    pilot_successful_usage_at: successfulUsageAt,
    module_counts: moduleCounts,
    event_counts: eventCounts,
    active_modules: [...activeModules],
    distinct_user_count: users.size,
    active_day_count: activeDays.size,
    value_event_count: valueEventCount
  };
}

function determineCurrentStage(state) {
  if (state.paid_live_at) return "paid_live";
  if (state.lost_aborted_at) return "lost_aborted";
  if (state.commercial_pricing_clarified_at && (state.pilot_successful_usage_at || !state.pilot_started_at)) {
    return "commercial_pricing_clarified";
  }
  if (state.pilot_successful_usage_at) return "pilot_successful_usage";
  if (state.first_core_flow_executed_at) return "first_core_flow_executed";
  if (state.pilot_activated_at) return "pilot_activated";
  if (state.pilot_started_at) return "pilot_started";
  if (state.registered_at) return "registered";
  if (state.qualified_at) return "qualified";
  if (state.lead_at) return "lead";
  return null;
}

function stageTimestamp(stage, state) {
  return state[`${stage}_at`] || null;
}

function summarizeTransition(items, fromKey, toKey, window) {
  const cohort = items.filter((item) => {
    const timestamp = item[fromKey];
    return timestamp && timestamp >= window.from && timestamp <= window.to;
  });
  const converted = cohort.filter((item) => Boolean(item[toKey]));
  return {
    cohort_count: cohort.length,
    converted_count: converted.length,
    rate_pct: safePct(converted.length, cohort.length)
  };
}

function deriveIcpLabel(row) {
  const sizeClass = normalizeSizeClass(row.company_size_class, row.employee_count_approx);
  if (sizeClass) return `Enterprise ${sizeClass}`;
  const employeeCount = toInt(row.employee_count_approx, 0);
  if (employeeCount >= 1000) return "Enterprise IV";
  if (employeeCount >= 251) return "Enterprise III";
  if (employeeCount >= 31) return "Enterprise II";
  if (employeeCount >= 1) return "Enterprise I";
  if (row.org_type) return String(row.org_type);
  return "unclassified";
}

function deriveTariffPath(row, state) {
  if (state.pilot_started_at) return "pilot";
  if (normalizeBillingMode(row.billing_mode) === "individual_contract" || normalizeStage(row.customer_stage) === "contract_requested") {
    return "direct_contract";
  }
  if (state.paid_live_at) return "catalog_paid";
  if (state.lead_at) return "lead_only";
  return "unclassified";
}

function buildRiskProfile(row, state, now = new Date()) {
  if (String(row.pilot_status || "").toLowerCase() !== "active" || !state.pilot_started_at || state.paid_live_at) {
    return { score: 0, reasons: [] };
  }

  const ageDays = dayDiff(state.pilot_started_at, now);
  const reasons = [];
  let score = 0;

  if (!state.pilot_activated_at && ageDays >= 14) {
    score += 40;
    reasons.push("Keine Aktivierung >14 Tage nach Pilotstart");
  }
  if (state.pilot_activated_at && !state.first_core_flow_executed_at && dayDiff(state.pilot_activated_at, now) >= 7) {
    score += 15;
    reasons.push("Kein abgeschlossener Kernfluss >7 Tage nach Aktivierung");
  }
  if (state.pilot_activated_at && !state.pilot_successful_usage_at && dayDiff(state.pilot_activated_at, now) >= 21) {
    score += 30;
    reasons.push("Keine belastbare Nutzung >21 Tage nach Aktivierung");
  }
  if (state.pilot_successful_usage_at && !state.commercial_pricing_clarified_at && dayDiff(state.pilot_successful_usage_at, now) >= 21) {
    score += 20;
    reasons.push("Pricing/Commercial noch unklar");
  }
  if (state.commercial_pricing_clarified_at && !state.paid_live_at && dayDiff(state.commercial_pricing_clarified_at, now) >= 30) {
    score += 20;
    reasons.push("Conversion stagniert trotz Pricing-Klarheit");
  }
  if (toBool(row.custom_quote_pending)) {
    score += 15;
    reasons.push("Angebot/Quote noch offen");
  }
  if (ageDays >= 150) {
    score += 25;
    reasons.push("Pilot nahe Maximaldauer");
  }
  if (ageDays >= 180) {
    score += 40;
    reasons.push("Pilot über Maximaldauer");
  }

  return { score, reasons };
}

function pushTop(list, item, maxItems, sortValueKey) {
  list.push(item);
  list.sort((a, b) => Number(b[sortValueKey] || 0) - Number(a[sortValueKey] || 0));
  if (list.length > maxItems) list.length = maxItems;
}

function mapCountsToRows(countMap) {
  return Object.entries(countMap)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([key, count]) => ({ key, count }));
}

function buildDrilldownRow(row, state, riskProfile) {
  return {
    org_id: row.org_id,
    org_name: row.org_name,
    icp: state.icp,
    tariff_path: state.tariff_path,
    current_stage: state.current_stage,
    pilot_status: row.pilot_status || null,
    risk_score: riskProfile.score,
    risk_reasons: riskProfile.reasons,
    lead_at: toIsoTimestamp(state.lead_at),
    qualified_at: toIsoTimestamp(state.qualified_at),
    registered_at: toIsoTimestamp(state.registered_at),
    pilot_started_at: toIsoTimestamp(state.pilot_started_at),
    pilot_activated_at: toIsoTimestamp(state.pilot_activated_at),
    first_core_flow_executed_at: toIsoTimestamp(state.first_core_flow_executed_at),
    pilot_successful_usage_at: toIsoTimestamp(state.pilot_successful_usage_at),
    commercial_pricing_clarified_at: toIsoTimestamp(state.commercial_pricing_clarified_at),
    paid_live_at: toIsoTimestamp(state.paid_live_at),
    lost_aborted_at: toIsoTimestamp(state.lost_aborted_at),
    activation_event: state.activation_event,
    activation_module: state.activation_module,
    active_modules: state.active_modules,
    value_event_count: state.value_event_count
  };
}

function buildRollupRows(map) {
  return [...map.values()]
    .map((row) => ({
      key: row.key,
      label: row.label,
      tracked_orgs: row.tracked_orgs,
      pilot_started: row.pilot_started,
      activated: row.activated,
      converted: row.converted,
      lost: row.lost,
      at_risk: row.at_risk,
      activation_rate_pct: safePct(row.activated, row.pilot_started),
      conversion_rate_pct: safePct(row.converted, row.pilot_started),
      live_from_activation_rate_pct: safePct(row.converted, row.activated)
    }))
    .sort((a, b) => b.converted - a.converted || b.activated - a.activated || b.tracked_orgs - a.tracked_orgs || String(a.label).localeCompare(String(b.label)));
}

function ensureRollup(map, key, label) {
  if (!map.has(key)) {
    map.set(key, {
      key,
      label,
      tracked_orgs: 0,
      pilot_started: 0,
      activated: 0,
      converted: 0,
      lost: 0,
      at_risk: 0
    });
  }
  return map.get(key);
}

export async function getPilotConversionTruth(pool, { orgId = null, windowDays = COHORT_WINDOW_DAYS } = {}) {
  const result = zeroPilotConversionTruth(windowDays);
  result.scope_org_id = orgId;

  const window = buildWindow(windowDays);
  result.cohort_window = {
    days: window.days,
    label: window.label,
    date_from: window.date_from,
    date_to: window.date_to
  };
  result.generated_at = new Date().toISOString();
  result.available = true;

  try {
    const trackedOrganizations = await queryTrackedOrganizations(pool, orgId);
    const strategicSignals = await queryStrategicLeadSignals(pool, orgId);
    const strategicSignalMap = buildStrategicSignalMap(strategicSignals.rows);

    result.quality_flags.strategic_lead_source_available = strategicSignals.available;
    result.quality_flags.strategic_rows = strategicSignals.rows.length;

    const relevantRows = trackedOrganizations.rows.filter((row) => determineTrackedOrg(row, strategicSignalMap.get(String(row.org_id || ""))));
    result.quality_flags.tracked_org_rows = relevantRows.length;

    const orgIds = relevantRows.map((row) => row.org_id).filter(Boolean);
    const ownerUserIds = relevantRows.map((row) => row.owner_user_id).filter(Boolean);

    const [eventData, onboardingData] = await Promise.all([
      queryProductEventTimeline(pool, orgIds),
      queryOnboardingProgressByUser(pool, ownerUserIds)
    ]);

    result.quality_flags.analytics_source_available = eventData.available;
    result.quality_flags.onboarding_source_available = onboardingData.available;
    result.quality_flags.product_event_rows = eventData.rows.length;

    const eventMap = buildEventHistory(eventData.rows);
    const onboardingMap = buildOnboardingProgress(onboardingData.rows);

    const activationModuleCounts = Object.fromEntries(MODULE_ORDER.map((module) => [module, 0]));
    const activationEventCounts = {};
    const firstCoreFlowCounts = {};
    const productAreaUsageMap = new Map(MODULE_ORDER.map((module) => [module, {
      module,
      pilot_orgs: 0,
      active_pilot_orgs: 0,
      successful_usage_orgs: 0,
      event_count: 0
    }]));
    const currentStageMap = new Map();
    const onboardingBottleneckCounts = new Map(ONBOARDING_STEPS.map((step) => [step.key, {
      step_key: step.key,
      label: step.label,
      blocked_pilots: 0
    }]));
    const icpRollups = new Map();
    const tariffRollups = new Map();
    const activationDays = [];
    const conversionDays = [];
    const stateRows = [];
    let activePilots = 0;
    let activatedActivePilots = 0;
    let convertedPilots = 0;
    let lostPilots = 0;
    let atRiskPilots = 0;

    for (const row of relevantRows) {
      const strategicSignal = strategicSignalMap.get(String(row.org_id || "")) || null;
      const registeredAt = toDate(row.org_created_at) || toDate(row.owner_membership_created_at) || toDate(row.current_subscription_created_at);
      const leadResolution = resolveLeadAt(row, strategicSignal, result.quality_flags);
      const qualifiedResolution = resolveQualifiedAt(row, strategicSignal, registeredAt);
      const pilotStartResolution = resolvePilotStartAt(row, registeredAt, result.quality_flags);
      const commercialState = resolveCommercialState(row);
      const usage = derivePilotUsageFromEvents(eventMap.get(String(row.org_id || "")) || [], pilotStartResolution.at);

      const state = {
        org_id: row.org_id,
        org_name: row.org_name,
        lead_at: leadResolution.at,
        qualified_at: qualifiedResolution.at,
        registered_at: registeredAt,
        pilot_started_at: pilotStartResolution.at,
        pilot_activated_at: usage.activated_at,
        first_core_flow_executed_at: usage.first_core_flow_executed_at,
        pilot_successful_usage_at: usage.pilot_successful_usage_at,
        paid_live_at: null,
        commercial_pricing_clarified_at: null,
        lost_aborted_at: null,
        activation_event: usage.activation_event,
        activation_module: usage.activation_module,
        first_core_flow_event: usage.first_core_flow_event,
        first_core_flow_module: usage.first_core_flow_module,
        active_modules: usage.active_modules,
        value_event_count: usage.value_event_count,
        icp: deriveIcpLabel(row),
        tariff_path: null,
        current_stage: null
      };

      state.paid_live_at = derivePaidLiveAt(row, commercialState, state);
      state.lost_aborted_at = deriveLostAt(row, strategicSignal, state.paid_live_at);
      state.commercial_pricing_clarified_at = resolveCommercialPricingAt(row, commercialState, state, result.quality_flags).at;
      state.tariff_path = deriveTariffPath(row, state);
      state.current_stage = determineCurrentStage(state);

      if (state.lead_at) result.stage_counts.lead += 1;
      if (state.qualified_at) result.stage_counts.qualified += 1;
      if (state.registered_at) result.stage_counts.registered += 1;
      if (state.pilot_started_at) result.stage_counts.pilot_started += 1;
      if (state.pilot_activated_at) result.stage_counts.pilot_activated += 1;
      if (state.first_core_flow_executed_at) result.stage_counts.first_core_flow_executed += 1;
      if (state.pilot_successful_usage_at) result.stage_counts.pilot_successful_usage += 1;
      if (state.commercial_pricing_clarified_at) result.stage_counts.commercial_pricing_clarified += 1;
      if (state.paid_live_at) result.stage_counts.paid_live += 1;
      if (state.lost_aborted_at) result.stage_counts.lost_aborted += 1;

      if (state.current_stage) {
        const current = currentStageMap.get(state.current_stage) || {
          stage: state.current_stage,
          orgs: 0,
          total_days_in_stage: 0,
          at_risk_orgs: 0
        };
        current.orgs += 1;
        current.total_days_in_stage += dayDiff(stageTimestamp(state.current_stage, state)) || 0;
        currentStageMap.set(state.current_stage, current);
      }

      if (state.pilot_started_at && state.pilot_activated_at) {
        activationDays.push(dayDiff(state.pilot_started_at, state.pilot_activated_at));
      }
      if (state.pilot_started_at && state.paid_live_at) {
        conversionDays.push(dayDiff(state.pilot_started_at, state.paid_live_at));
      }

      if (state.activation_module) {
        activationModuleCounts[state.activation_module] = (activationModuleCounts[state.activation_module] || 0) + 1;
      }
      if (state.activation_event) {
        activationEventCounts[state.activation_event] = (activationEventCounts[state.activation_event] || 0) + 1;
      }
      if (state.first_core_flow_event) {
        firstCoreFlowCounts[state.first_core_flow_event] = (firstCoreFlowCounts[state.first_core_flow_event] || 0) + 1;
      }

      if (state.pilot_started_at) {
        for (const module of usage.active_modules) {
          const usageRow = productAreaUsageMap.get(module);
          if (!usageRow) continue;
          usageRow.pilot_orgs += 1;
          if (String(row.pilot_status || "").toLowerCase() === "active") usageRow.active_pilot_orgs += 1;
          if (state.pilot_successful_usage_at) usageRow.successful_usage_orgs += 1;
        }
        for (const module of MODULE_ORDER) {
          const usageRow = productAreaUsageMap.get(module);
          if (!usageRow) continue;
          usageRow.event_count += usage.module_counts[module] || 0;
        }
      }

      const riskProfile = buildRiskProfile(row, state);
      if (state.current_stage && riskProfile.score >= 40) {
        const current = currentStageMap.get(state.current_stage);
        if (current) current.at_risk_orgs += 1;
      }

      const icpRollup = ensureRollup(icpRollups, state.icp, state.icp);
      const tariffRollup = ensureRollup(tariffRollups, state.tariff_path, state.tariff_path);
      [icpRollup, tariffRollup].forEach((rollup) => {
        rollup.tracked_orgs += 1;
        if (state.pilot_started_at) rollup.pilot_started += 1;
        if (state.pilot_activated_at) rollup.activated += 1;
        if (state.paid_live_at) rollup.converted += 1;
        if (state.lost_aborted_at) rollup.lost += 1;
        if (riskProfile.score >= 40) rollup.at_risk += 1;
      });

      if (String(row.pilot_status || "").toLowerCase() === "active") {
        activePilots += 1;
        if (state.pilot_activated_at) activatedActivePilots += 1;
        if (riskProfile.score >= 40) atRiskPilots += 1;
      }
      if (state.paid_live_at && state.pilot_started_at) convertedPilots += 1;
      if (state.lost_aborted_at && state.pilot_started_at) lostPilots += 1;

      const drilldownRow = buildDrilldownRow(row, state, riskProfile);
      if (String(row.pilot_status || "").toLowerCase() === "active") {
        pushTop(result.org_drilldown.active_pilots, drilldownRow, 10, "value_event_count");
      }
      if (String(row.pilot_status || "").toLowerCase() === "active" && state.pilot_activated_at) {
        pushTop(result.org_drilldown.activated_pilots, drilldownRow, 10, "value_event_count");
      }
      if (state.paid_live_at && state.pilot_started_at) {
        pushTop(result.org_drilldown.converted, drilldownRow, 10, "value_event_count");
      }
      if (riskProfile.score >= 40) {
        pushTop(result.org_drilldown.at_risk, drilldownRow, 10, "risk_score");
      }
      if (state.lost_aborted_at) {
        pushTop(result.org_drilldown.lost, drilldownRow, 10, "risk_score");
      }

      if (
        onboardingData.available
        && String(row.pilot_status || "").toLowerCase() === "active"
        && !state.pilot_successful_usage_at
        && row.owner_user_id
      ) {
        const progressMap = onboardingMap.get(String(row.owner_user_id || "")) || new Map();
        for (const step of ONBOARDING_STEPS) {
          const progress = progressMap.get(step.key);
          if (!progress?.completed) {
            onboardingBottleneckCounts.get(step.key).blocked_pilots += 1;
          }
        }
      }

      stateRows.push({
        ...state,
        lead_at: state.lead_at,
        qualified_at: state.qualified_at,
        registered_at: state.registered_at,
        pilot_started_at: state.pilot_started_at,
        pilot_activated_at: state.pilot_activated_at,
        first_core_flow_executed_at: state.first_core_flow_executed_at,
        pilot_successful_usage_at: state.pilot_successful_usage_at,
        commercial_pricing_clarified_at: state.commercial_pricing_clarified_at,
        paid_live_at: state.paid_live_at,
        lost_aborted_at: state.lost_aborted_at
      });
    }

    result.available = true;
    result.headline = {
      tracked_orgs: relevantRows.length,
      leads: result.stage_counts.lead,
      qualified: result.stage_counts.qualified,
      registered: result.stage_counts.registered,
      active_pilots: activePilots,
      activated_pilots: activatedActivePilots,
      converted_pilots: convertedPilots,
      lost_pilots: lostPilots,
      at_risk_pilots: atRiskPilots,
      avg_days_to_activation: avg(activationDays),
      avg_days_to_conversion: avg(conversionDays)
    };

    result.transitions.lead_to_registered = {
      from_stage: "lead",
      to_stage: "registered",
      ...summarizeTransition(stateRows, "lead_at", "registered_at", window)
    };
    result.transitions.registration_to_pilot_started = {
      from_stage: "registered",
      to_stage: "pilot_started",
      ...summarizeTransition(stateRows, "registered_at", "pilot_started_at", window)
    };
    result.transitions.pilot_started_to_activated = {
      from_stage: "pilot_started",
      to_stage: "pilot_activated",
      ...summarizeTransition(stateRows, "pilot_started_at", "pilot_activated_at", window)
    };
    result.transitions.activated_to_paid_live = {
      from_stage: "pilot_activated",
      to_stage: "paid_live",
      ...summarizeTransition(stateRows, "pilot_activated_at", "paid_live_at", window)
    };
    result.transitions.pilot_to_lost = {
      from_stage: "pilot_started",
      to_stage: "lost_aborted",
      ...summarizeTransition(stateRows, "pilot_started_at", "lost_aborted_at", window)
    };

    result.timing.activation = {
      count: activationDays.length,
      avg_days: avg(activationDays),
      p50_days: median(activationDays)
    };
    result.timing.conversion = {
      count: conversionDays.length,
      avg_days: avg(conversionDays),
      p50_days: median(conversionDays)
    };

    result.activation = {
      activated_orgs: result.stage_counts.pilot_activated,
      by_module: mapCountsToRows(activationModuleCounts).map((row) => ({
        module: row.key,
        activated_orgs: row.count
      })),
      by_event: mapCountsToRows(activationEventCounts).map((row) => ({
        event_name: row.key,
        activated_orgs: row.count
      })),
      first_core_flow_mix: mapCountsToRows(firstCoreFlowCounts).map((row) => ({
        event_name: row.key,
        orgs: row.count
      }))
    };

    result.current_stage_distribution = [...currentStageMap.values()]
      .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage))
      .map((row) => ({
        stage: row.stage,
        orgs: row.orgs,
        avg_days_in_stage: row.orgs ? round1(row.total_days_in_stage / row.orgs) : null,
        at_risk_orgs: row.at_risk_orgs
      }));

    result.gtm_learning = {
      by_icp: buildRollupRows(icpRollups),
      by_tariff_path: TARIFF_PATH_ORDER
        .map((key) => tariffRollups.get(key))
        .filter(Boolean)
        .map((row) => ({
          key: row.key,
          label: row.label,
          tracked_orgs: row.tracked_orgs,
          pilot_started: row.pilot_started,
          activated: row.activated,
          converted: row.converted,
          lost: row.lost,
          at_risk: row.at_risk,
          activation_rate_pct: safePct(row.activated, row.pilot_started),
          conversion_rate_pct: safePct(row.converted, row.pilot_started),
          live_from_activation_rate_pct: safePct(row.converted, row.activated)
        })),
      onboarding_bottlenecks: [...onboardingBottleneckCounts.values()]
        .filter((row) => row.blocked_pilots > 0)
        .sort((a, b) => b.blocked_pilots - a.blocked_pilots || String(a.label).localeCompare(String(b.label)))
        .map((row) => ({
          ...row,
          share_pct: safePct(row.blocked_pilots, activePilots || 0)
        })),
      product_area_usage: MODULE_ORDER.map((module) => productAreaUsageMap.get(module))
        .filter(Boolean)
        .sort((a, b) => b.pilot_orgs - a.pilot_orgs || b.event_count - a.event_count),
      funnel_dropoff: result.current_stage_distribution
    };

    return result;
  } catch {
    const fallback = zeroPilotConversionTruth(windowDays);
    fallback.scope_org_id = orgId;
    return fallback;
  }
}

export { COHORT_WINDOW_DAYS };
