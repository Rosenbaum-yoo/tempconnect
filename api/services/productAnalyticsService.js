import crypto from "node:crypto";

const SENSITIVE_KEYS_RE = /password|token|secret|iban|credit|ssn|session|cookie|email|phone|name|address|street|postal|zip|note|document|content|message/i;
const SAFE_METADATA_KEYS = new Set([
  "duration_ms",
  "visible_ms",
  "hidden_ms",
  "form",
  "field",
  "fields_count",
  "clicks",
  "x",
  "y",
  "scroll_depth",
  "reason",
  "result",
  "cta",
  "label",
  "title",
  "referrer",
  "entry_path",
  "exit_path",
  "consent",
  "inactivity_ms",
  "loop_count"
]);

export const CORE_EVENTS = new Set([
  "session_started",
  "session_resumed",
  "session_ended",
  "page_hidden",
  "page_focus",
  "page_exit",
  "signup_started",
  "signup_completed",
  "login_success",
  "demo_mode_used",
  "enterprise_config_started",
  "capacity_feed_viewed",
  "capacity_detail_viewed",
  "suchauftrag_created",
  "matching_results_viewed",
  "interest_modal_opened",
  "interest_submitted",
  "deal_started",
  "deal_completed",
  "worker_invite_sent",
  "worker_registered",
  "assignment_created",
  "timesheet_started",
  "timesheet_submitted",
  "timesheet_approved",
  "requisition_created",
  "rate_card_created",
  "integration_connected",
  "page_view",
  "page_time_spent",
  "form_started",
  "form_completed",
  "form_submitted",
  "form_abandoned",
  "rage_click_detected",
  "journey_started",
  "journey_step_viewed",
  "journey_step_completed",
  "journey_abandoned",
  "onboarding_started",
  "onboarding_completed",
  "request_created",
  "request_sent",
  "contract_started",
  "contract_interest_submitted",
  "cta_clicked"
]);

export const FUNNELS = {
  registration_to_usage: ["signup_started", "signup_completed", "login_success"],
  capacity_to_deal: ["capacity_feed_viewed", "capacity_detail_viewed", "interest_submitted", "deal_completed"],
  worker_to_timesheet: ["worker_invite_sent", "worker_registered", "timesheet_started", "timesheet_submitted"],
  enterprise_setup_to_ops: ["enterprise_config_started", "requisition_created", "rate_card_created"]
};

export const DASHBOARD_PRESETS = [
  { key: "demo_usage", title: "Demo Usage", filters: { segment: "demo", days: 14 }, funnels: ["registration_to_usage", "capacity_to_deal"] },
  { key: "pilot_adoption", title: "Pilot Adoption", filters: { segment: "pilot", days: 30 }, funnels: ["enterprise_setup_to_ops", "worker_to_timesheet"] },
  { key: "live_performance", title: "Live Performance", filters: { segment: "live", days: 30 }, funnels: ["capacity_to_deal", "worker_to_timesheet"] },
  { key: "flow_dropoff", title: "Flow Dropoff", filters: { days: 30 }, funnels: ["registration_to_usage", "capacity_to_deal", "worker_to_timesheet", "enterprise_setup_to_ops"] }
];

export const EVENT_CATEGORIES = {
  session_started: "session",
  session_resumed: "session",
  session_ended: "session",
  page_view: "page",
  page_hidden: "page",
  page_focus: "page",
  page_exit: "page",
  page_time_spent: "page",
  form_started: "form",
  form_submitted: "form",
  form_completed: "form",
  form_abandoned: "form",
  rage_click_detected: "behavior",
  journey_started: "journey",
  journey_step_viewed: "journey",
  journey_step_completed: "journey",
  journey_abandoned: "journey"
};

export const JOURNEY_OUTCOMES = new Set(["completed", "abandoned", "interrupted"]);

export function deriveCustomerSegment({ plan, isDemo, orgName, explicitStage }) {
  if (["demo", "pilot", "live"].includes(String(explicitStage || "").toLowerCase())) {
    return String(explicitStage).toLowerCase();
  }
  if (isDemo || String(plan || "").toUpperCase() === "DEMO" || String(plan || "").toUpperCase() === "FREE") return "demo";
  if ((orgName || "").toLowerCase().includes("pilot")) return "pilot";
  return "live";
}

export function sanitizeMetadata(input) {
  if (!input || typeof input !== "object") return {};
  const clean = {};
  for (const [key, value] of Object.entries(input)) {
    if (!SAFE_METADATA_KEYS.has(key)) continue;
    if (SENSITIVE_KEYS_RE.test(key)) continue;
    if (value == null) {
      clean[key] = null;
      continue;
    }
    if (typeof value === "string") {
      clean[key] = value.slice(0, 300);
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      clean[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      clean[key] = value.slice(0, 30).map((item) => (typeof item === "string" ? item.slice(0, 120) : item));
      continue;
    }
    // Keep shallow object shape only.
    clean[key] = "[OBJECT]";
  }
  return clean;
}

export function resolveEventCategory(eventName) {
  return EVENT_CATEGORIES[eventName] || "business";
}

export function resolveLifecycleSegment(ctx = {}) {
  return deriveCustomerSegment({
    plan: ctx.plan || ctx.user_plan || null,
    isDemo: ctx.is_demo || false,
    orgName: ctx.org_name || null,
    explicitStage: ctx.explicitStage || ctx.org_stage || ctx.user_stage || null
  });
}

export function normalizeTrackPayload(payload = {}) {
  const event_name = String(payload.event_name || "").trim();
  if (!event_name) throw new Error("event_name required");
  const occurredAt = payload.occurred_at ? new Date(payload.occurred_at) : new Date();
  if (Number.isNaN(occurredAt.getTime())) throw new Error("invalid occurred_at");
  const source = ["web", "api", "worker", "client", "server", "inferred"].includes(payload.source) ? payload.source : "web";
  return {
    event_name,
    occurred_at: occurredAt.toISOString(),
    session_id: String(payload.session_id || "").slice(0, 120),
    anonymous_id: payload.anonymous_id ? String(payload.anonymous_id).slice(0, 120) : null,
    page_path: payload.page_path ? String(payload.page_path).slice(0, 240) : null,
    flow_key: payload.flow_key ? String(payload.flow_key).slice(0, 100) : null,
    feature_context: payload.feature_context ? String(payload.feature_context).slice(0, 120) : null,
    journey_id: payload.journey_id ? String(payload.journey_id).slice(0, 120) : null,
    step_name: payload.step_name ? String(payload.step_name).slice(0, 120) : null,
    route_name: payload.route_name ? String(payload.route_name).slice(0, 120) : null,
    component_name: payload.component_name ? String(payload.component_name).slice(0, 120) : null,
    event_category: payload.event_category ? String(payload.event_category).slice(0, 60) : resolveEventCategory(event_name),
    importance: payload.importance ? String(payload.importance).slice(0, 20) : "normal",
    source,
    metadata: sanitizeMetadata(payload.metadata || {})
  };
}

function buildDedupeKey(normalized, payload) {
  if (payload?.dedupe_key) return String(payload.dedupe_key).slice(0, 140);
  const basis = `${normalized.event_name}|${normalized.session_id}|${normalized.page_path || ""}|${normalized.step_name || ""}|${normalized.occurred_at.slice(0, 19)}`;
  return crypto.createHash("sha1").update(basis).digest("hex");
}

export async function upsertAnalyticsSession(pool, payload) {
  if (!payload.session_id) return null;
  await pool.query(
    `INSERT INTO product_analytics_sessions
      (session_id, anonymous_id, user_id, org_id, user_role, org_role, lifecycle_segment,
       started_at, last_seen_at, entry_path, replay_enabled, consent_status, metadata)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), $8, $9, $10, $11)
     ON CONFLICT (session_id) DO UPDATE SET
      anonymous_id = COALESCE(EXCLUDED.anonymous_id, product_analytics_sessions.anonymous_id),
      user_id = COALESCE(EXCLUDED.user_id, product_analytics_sessions.user_id),
      org_id = COALESCE(EXCLUDED.org_id, product_analytics_sessions.org_id),
      user_role = COALESCE(EXCLUDED.user_role, product_analytics_sessions.user_role),
      org_role = COALESCE(EXCLUDED.org_role, product_analytics_sessions.org_role),
      lifecycle_segment = EXCLUDED.lifecycle_segment,
      last_seen_at = NOW(),
      exit_path = EXCLUDED.entry_path,
      replay_enabled = COALESCE(EXCLUDED.replay_enabled, product_analytics_sessions.replay_enabled),
      consent_status = EXCLUDED.consent_status`,
    [
      payload.session_id,
      payload.anonymous_id || null,
      payload.user_id || null,
      payload.org_id || null,
      payload.user_role || null,
      payload.org_role || null,
      payload.customer_segment || "live",
      payload.page_path || null,
      Boolean(payload.metadata?.replay_enabled),
      payload.metadata?.consent === "granted" ? "granted" : payload.metadata?.consent === "denied" ? "denied" : "unknown",
      JSON.stringify(payload.metadata || {})
    ]
  );
  return { session_id: payload.session_id };
}

export async function upsertJourneyState(pool, payload) {
  if (!payload.journey_id || !payload.session_id) return null;
  await pool.query(
    `INSERT INTO product_analytics_journeys
      (journey_id, session_id, flow_name, lifecycle_segment, context)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (journey_id) DO UPDATE SET
      flow_name = COALESCE(EXCLUDED.flow_name, product_analytics_journeys.flow_name),
      lifecycle_segment = EXCLUDED.lifecycle_segment`,
    [
      payload.journey_id,
      payload.session_id,
      payload.flow_key || "generic",
      payload.customer_segment || "live",
      JSON.stringify({ step_name: payload.step_name || null })
    ]
  );

  if (payload.event_name === "journey_abandoned") {
    await pool.query(
      `UPDATE product_analytics_journeys
       SET abandoned_at = NOW(), outcome = 'abandoned', dropoff_step = COALESCE($2, dropoff_step)
       WHERE journey_id = $1`,
      [payload.journey_id, payload.step_name || null]
    );
  }
  if (payload.event_name === "journey_step_completed" && payload.metadata?.result === "completed") {
    await pool.query(
      `UPDATE product_analytics_journeys
       SET completed_at = NOW(), outcome = 'completed'
       WHERE journey_id = $1`,
      [payload.journey_id]
    );
  }
  return { journey_id: payload.journey_id };
}

export async function trackProductEvent(pool, payload) {
  const normalized = normalizeTrackPayload(payload);
  const segment = resolveLifecycleSegment({
    plan: payload.user_plan,
    is_demo: payload.is_demo,
    org_name: payload.org_name,
    explicitStage: payload.customer_segment
  });

  await upsertAnalyticsSession(pool, { ...payload, ...normalized, customer_segment: segment });
  await upsertJourneyState(pool, { ...payload, ...normalized, customer_segment: segment });

  const { rows } = await pool.query(
    `INSERT INTO product_analytics_events
      (event_name, occurred_at, session_id, anonymous_id, user_id, org_id, user_role, org_role, user_plan,
       customer_segment, page_path, flow_key, source, feature_context, metadata,
       event_category, journey_id, route_name, component_name, step_name, dedupe_key, importance)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9,
       $10, $11, $12, $13, $14, $15,
       $16, $17, $18, $19, $20, $21, $22)
     RETURNING id`,
    [
      normalized.event_name,
      normalized.occurred_at,
      normalized.session_id,
      normalized.anonymous_id,
      payload.user_id || null,
      payload.org_id || null,
      payload.user_role || null,
      payload.org_role || null,
      payload.user_plan || null,
      segment,
      normalized.page_path,
      normalized.flow_key,
      normalized.source,
      normalized.feature_context,
      JSON.stringify(normalized.metadata),
      normalized.event_category,
      normalized.journey_id,
      normalized.route_name,
      normalized.component_name,
      normalized.step_name,
      buildDedupeKey(normalized, payload),
      normalized.importance
    ]
  );
  return rows[0];
}

export async function buildAnalyticsContextFromRequest(pool, req) {
  const userId = req.session?.userId || null;
  if (!userId) {
    return {
      user_id: null,
      org_id: req.orgId || null,
      user_role: null,
      org_role: null,
      user_plan: null,
      customer_segment: "live"
    };
  }
  const { rows } = await pool.query(
    `SELECT u.id, u.role, u.is_demo, u.plan, u.customer_stage AS user_stage,
            COALESCE(om.org_id, u.org_id) AS org_id,
            om.role_key AS org_role,
            o.name AS org_name, o.customer_stage AS org_stage
     FROM users u
     LEFT JOIN org_memberships om ON om.user_id = u.id AND om.is_active = TRUE
     LEFT JOIN organizations o ON o.id = COALESCE(om.org_id, u.org_id)
     WHERE u.id = $1
     LIMIT 1`,
    [userId]
  );
  const me = rows[0] || {};
  return {
    user_id: userId,
    org_id: me.org_id || req.orgId || null,
    user_role: me.role || null,
    org_role: me.org_role || null,
    user_plan: me.plan || null,
    customer_segment: deriveCustomerSegment({ plan: me.plan, isDemo: me.is_demo, orgName: me.org_name, explicitStage: me.org_stage || me.user_stage })
  };
}

export async function trackProductEventFromRequest(pool, req, eventName, extra = {}) {
  const baseCtx = await buildAnalyticsContextFromRequest(pool, req);
  return trackProductEvent(pool, {
    event_name: eventName,
    session_id: req.sessionID || (baseCtx.user_id ? `srv_${baseCtx.user_id}` : "anon_server"),
    page_path: req.originalUrl || req.path || null,
    source: "api",
    ...baseCtx,
    ...extra
  });
}

export async function startFunnel(pool, req, flowName, context = {}) {
  const jid = context.journey_id || `j_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await trackProductEventFromRequest(pool, req, "journey_started", {
    journey_id: jid,
    flow_key: flowName,
    step_name: context.step_name || "start",
    metadata: { ...(context.metadata || {}), result: "started" }
  });
  return { journey_id: jid };
}

export async function trackFunnelStep(pool, req, flowName, stepName, context = {}) {
  await trackProductEventFromRequest(pool, req, "journey_step_completed", {
    journey_id: context.journey_id || null,
    flow_key: flowName,
    step_name: stepName,
    metadata: { ...(context.metadata || {}), result: "step_completed" }
  });
}

export async function completeFunnel(pool, req, flowName, result = {}) {
  await trackProductEventFromRequest(pool, req, "journey_step_completed", {
    journey_id: result.journey_id || null,
    flow_key: flowName,
    step_name: result.step_name || "completed",
    metadata: { ...(result.metadata || {}), result: "completed" }
  });
}

export async function abandonFunnel(pool, req, flowName, reason = {}) {
  await trackProductEventFromRequest(pool, req, "journey_abandoned", {
    journey_id: reason.journey_id || null,
    flow_key: flowName,
    step_name: reason.step_name || null,
    metadata: { reason: reason.reason || "unknown", ...(reason.metadata || {}) }
  });
}

export async function getOverview(pool, filters = {}) {
  const days = Math.min(90, Math.max(1, parseInt(filters.days, 10) || 30));
  const segment = filters.segment || null;
  const params = [days];
  let segClause = "";
  if (segment) {
    params.push(segment);
    segClause = `AND customer_segment = $${params.length}`;
  }

  const [events, sessions, topFeatures] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(DISTINCT session_id)::int AS sessions,
              COUNT(DISTINCT user_id)::int AS users
       FROM product_analytics_events
       WHERE occurred_at >= NOW() - ($1 || ' days')::interval ${segClause}`,
      params
    ),
    pool.query(
      `SELECT customer_segment, COUNT(DISTINCT session_id)::int AS sessions
       FROM product_analytics_events
       WHERE occurred_at >= NOW() - ($1 || ' days')::interval
       GROUP BY customer_segment`,
      [days]
    ),
    pool.query(
      `SELECT event_name, COUNT(*)::int AS count
       FROM product_analytics_events
       WHERE occurred_at >= NOW() - ($1 || ' days')::interval ${segClause}
       GROUP BY event_name
       ORDER BY count DESC
       LIMIT 12`,
      params
    )
  ]);

  return {
    period_days: days,
    totals: events.rows[0] || { total: 0, sessions: 0, users: 0 },
    segment_sessions: sessions.rows,
    top_events: topFeatures.rows
  };
}

export async function getPageInsights(pool, filters = {}) {
  const days = Math.min(90, Math.max(1, parseInt(filters.days, 10) || 30));
  const segment = filters.segment || null;
  const params = [days];
  let segClause = "";
  if (segment) {
    params.push(segment);
    segClause = `AND customer_segment = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT page_path,
            COUNT(*) FILTER (WHERE event_name = 'page_view')::int AS page_views,
            ROUND(AVG((metadata->>'duration_ms')::numeric)
              FILTER (WHERE event_name = 'page_time_spent' AND metadata ? 'duration_ms'))::int AS avg_time_ms,
            COUNT(*) FILTER (WHERE event_name = 'rage_click_detected')::int AS rage_clicks,
            COUNT(*) FILTER (WHERE event_name = 'form_abandoned')::int AS form_abandons
     FROM product_analytics_events
     WHERE occurred_at >= NOW() - ($1 || ' days')::interval
       AND page_path IS NOT NULL ${segClause}
     GROUP BY page_path
     ORDER BY page_views DESC
     LIMIT 50`,
    params
  );
  return rows;
}

export async function getFunnel(pool, funnelKey, days = 30, segment = null) {
  const steps = FUNNELS[funnelKey];
  if (!steps) throw new Error("unknown funnel");
  const baseParams = [Math.min(90, Math.max(1, parseInt(days, 10) || 30))];
  let segClause = "";
  if (segment) {
    baseParams.push(segment);
    segClause = `AND customer_segment = $${baseParams.length}`;
  }

  const stepsData = [];
  for (const step of steps) {
    const params = [...baseParams, step];
    const eventParamIdx = params.length;
    const { rows } = await pool.query(
      `SELECT COUNT(DISTINCT session_id)::int AS sessions
       FROM product_analytics_events
       WHERE occurred_at >= NOW() - ($1 || ' days')::interval
         ${segClause}
         AND event_name = $${eventParamIdx}`,
      params
    );
    stepsData.push({ step, sessions: rows[0]?.sessions || 0 });
  }
  return stepsData;
}

export async function getDropoffByStep(pool, filters = {}) {
  const days = Math.min(90, Math.max(1, parseInt(filters.days, 10) || 30));
  const segment = filters.segment || null;
  const flow = filters.flow || null;
  const params = [days];
  let where = "WHERE occurred_at >= NOW() - ($1 || ' days')::interval";
  if (segment) {
    params.push(segment);
    where += ` AND customer_segment = $${params.length}`;
  }
  if (flow) {
    params.push(flow);
    where += ` AND flow_key = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT flow_key, step_name,
            COUNT(*) FILTER (WHERE event_name = 'journey_step_completed')::int AS completed_steps,
            COUNT(*) FILTER (WHERE event_name = 'journey_abandoned')::int AS abandoned_steps
     FROM product_analytics_events
     ${where}
     AND flow_key IS NOT NULL
     GROUP BY flow_key, step_name
     ORDER BY abandoned_steps DESC, completed_steps DESC
     LIMIT 200`,
    params
  );
  return rows;
}

export function getDashboardPresets() {
  return DASHBOARD_PRESETS.map((p) => ({ ...p }));
}

export async function getSessionToCompletionTime(pool, filters = {}) {
  const days = Math.min(90, Math.max(1, parseInt(filters.days, 10) || 30));
  const segment = filters.segment || null;
  const flow = filters.flow || null;
  const params = [days];
  let where = "WHERE j.started_at >= NOW() - ($1 || ' days')::interval";
  if (segment) {
    params.push(segment);
    where += ` AND j.lifecycle_segment = $${params.length}`;
  }
  if (flow) {
    params.push(flow);
    where += ` AND j.flow_name = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT j.flow_name,
            COUNT(*)::int AS journeys,
            ROUND(AVG(EXTRACT(EPOCH FROM (j.completed_at - j.started_at)) * 1000))
              FILTER (WHERE j.completed_at IS NOT NULL)::int AS avg_completion_ms,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
              ORDER BY EXTRACT(EPOCH FROM (j.completed_at - j.started_at)) * 1000
            )) FILTER (WHERE j.completed_at IS NOT NULL)::int AS p50_completion_ms
     FROM product_analytics_journeys j
     ${where}
     GROUP BY j.flow_name
     ORDER BY journeys DESC, j.flow_name ASC`,
    params
  );
  return rows;
}

export async function getRoleConversionComparison(pool, filters = {}) {
  const days = Math.min(90, Math.max(1, parseInt(filters.days, 10) || 30));
  const segment = filters.segment || null;
  const flow = filters.flow || null;
  const params = [days];
  let where = "WHERE occurred_at >= NOW() - ($1 || ' days')::interval";
  if (segment) {
    params.push(segment);
    where += ` AND customer_segment = $${params.length}`;
  }
  if (flow) {
    params.push(flow);
    where += ` AND flow_key = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT COALESCE(user_role, 'unknown') AS user_role,
            COALESCE(flow_key, 'generic') AS flow_key,
            COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'journey_started')::int AS started_sessions,
            COUNT(DISTINCT session_id) FILTER (
              WHERE event_name = 'journey_step_completed'
                AND metadata->>'result' = 'completed'
            )::int AS completed_sessions
     FROM product_analytics_events
     ${where}
     GROUP BY COALESCE(user_role, 'unknown'), COALESCE(flow_key, 'generic')
     ORDER BY started_sessions DESC, completed_sessions DESC`,
    params
  );
  return rows.map((r) => ({
    ...r,
    conversion_pct: r.started_sessions > 0 ? Math.round((r.completed_sessions / r.started_sessions) * 10000) / 100 : 0
  }));
}

export async function runDailyAnalyticsRollup(pool, options = {}) {
  const daysBack = Math.min(30, Math.max(1, parseInt(options.days_back, 10) || 1));
  const { rowCount } = await pool.query(
    `INSERT INTO product_analytics_daily_rollups
      (rollup_date, lifecycle_segment, event_name, flow_key, user_role, sessions_count, users_count, events_count, updated_at)
     SELECT DATE(occurred_at) AS rollup_date,
            customer_segment,
            event_name,
            flow_key,
            user_role,
            COUNT(DISTINCT session_id)::int AS sessions_count,
            COUNT(DISTINCT user_id)::int AS users_count,
            COUNT(*)::int AS events_count,
            NOW()
     FROM product_analytics_events
     WHERE occurred_at >= DATE_TRUNC('day', NOW() - ($1 || ' days')::interval)
     GROUP BY DATE(occurred_at), customer_segment, event_name, flow_key, user_role
     ON CONFLICT (rollup_date, lifecycle_segment, event_name, flow_key, user_role)
     DO UPDATE SET
      sessions_count = EXCLUDED.sessions_count,
      users_count = EXCLUDED.users_count,
      events_count = EXCLUDED.events_count,
      updated_at = NOW()`,
    [daysBack]
  );
  return { upserted: rowCount };
}

export async function cleanupAnalyticsRetention(pool, options = {}) {
  const retentionDays = Math.min(730, Math.max(30, parseInt(options.retention_days, 10) || 180));
  const rollupRetentionDays = Math.min(1825, Math.max(90, parseInt(options.rollup_retention_days, 10) || 540));

  const eventsDel = await pool.query(
    `DELETE FROM product_analytics_events
     WHERE occurred_at < NOW() - ($1 || ' days')::interval`,
    [retentionDays]
  );
  const sessionsDel = await pool.query(
    `DELETE FROM product_analytics_sessions
     WHERE last_seen_at < NOW() - ($1 || ' days')::interval`,
    [retentionDays]
  );
  const journeysDel = await pool.query(
    `DELETE FROM product_analytics_journeys
     WHERE started_at < NOW() - ($1 || ' days')::interval`,
    [retentionDays]
  );
  const rollupsDel = await pool.query(
    `DELETE FROM product_analytics_daily_rollups
     WHERE rollup_date < CURRENT_DATE - ($1 || ' days')::interval`,
    [rollupRetentionDays]
  );

  return {
    retention_days: retentionDays,
    rollup_retention_days: rollupRetentionDays,
    deleted_events: eventsDel.rowCount || 0,
    deleted_sessions: sessionsDel.rowCount || 0,
    deleted_journeys: journeysDel.rowCount || 0,
    deleted_rollups: rollupsDel.rowCount || 0
  };
}
