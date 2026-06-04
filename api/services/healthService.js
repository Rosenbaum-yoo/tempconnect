/**
 * Health-Service: DB-Ping, Migrations-Liste und System-Diagnostics.
 * Keine Route-Logik; nur Messungen und Aggregation hier.
 */

import { isQueueAvailable } from "../queue/connection.js";
import { metricsRegistry } from "../utils/metrics.js";
import { config } from "../config/index.js";
import { describeBilling, BILLING_PROVIDERS } from "./billingProviderService.js";
import { describeEmail, EMAIL_PROVIDERS } from "./emailProviderService.js";
import { listFeatureFlags } from "../config/featureFlags.js";

/* ── Basis-Checks ──────────────────────────────────────── */

/**
 * @param {import('pg').Pool} pool
 */
export async function pingDb(pool) {
  await pool.query("SELECT 1");
}

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<Array<{ name: string, applied_at: Date }>>}
 */
export async function getMigrations(pool) {
  const r = await pool.query("SELECT name, applied_at FROM _migrations ORDER BY applied_at ASC").catch(() => ({ rows: [] }));
  return r.rows;
}

/* ── Provider-Readiness (Phase I) ──────────────────────── */

/** Zaehlt aktive (true) Capability-Flags ohne Secret-Leak. */
function countTrue(obj) {
  if (!obj || typeof obj !== "object") return 0;
  return Object.values(obj).filter(Boolean).length;
}

/**
 * Bildet die billingProviderService-Selbstauskunft auf einen Health-Component-Status ab.
 * Semantik (Phase I): ein bewusster Fallback ohne externe Keys ("manual"/"disabled")
 * ist `unconfigured` (NICHT "failed") — auch wenn der Provider informelle Hinweise
 * liefert. Erst wenn der externe Provider (stripe) GEWAEHLT, aber nicht abrechnungs-
 * faehig ist (Key/Webhook fehlt → Warnungen), ist der Status `degraded`; ein echt
 * aktiver Stripe ohne Warnungen ist `ok`. Exponiert nur Provider-Name, Quelle,
 * Booleans, Zaehler und die bereits secret-freien Warntexte — keine Schluesselwerte.
 */
function billingHealth(desc) {
  const d = desc || {};
  const warnings = Array.isArray(d.warnings) ? d.warnings : [];
  const provider = d.provider || "unknown";
  const automated = provider === BILLING_PROVIDERS.STRIPE && !!d.stripe_configured;
  let status;
  if (provider !== BILLING_PROVIDERS.STRIPE) status = "unconfigured"; // manual/disabled = bewusster Default
  else if (automated && !warnings.length) status = "ok";
  else status = "degraded"; // stripe gewaehlt, aber Key/Webhook fehlt
  return {
    status,
    provider,
    source: d.source || "derived",
    automated,
    capabilities_active: countTrue(d.capabilities),
    warnings
  };
}

/**
 * Bildet die emailProviderService-Selbstauskunft auf einen Health-Component-Status ab.
 * console/disabled = nur Logging (kein externer Transport) → immer `unconfigured`, auch
 * mit Dev-Hinweis (kein Fehler). Ein externer Transport (smtp/sendgrid) ist `ok`, wenn
 * lieferfaehig und warnungsfrei, sonst `degraded` (gewaehlt, aber Key fehlt).
 */
function emailHealth(desc) {
  const d = desc || {};
  const warnings = Array.isArray(d.warnings) ? d.warnings : [];
  const provider = d.provider || "unknown";
  const external = provider === EMAIL_PROVIDERS.SMTP || provider === EMAIL_PROVIDERS.SENDGRID;
  const caps = d.capabilities || {};
  const outbound = external && !!caps.outbound_delivery;
  let status;
  if (!external) status = "unconfigured"; // console/disabled = nur Logging
  else if (outbound && !warnings.length) status = "ok";
  else status = "degraded"; // externer Provider gewaehlt, aber nicht lieferfaehig
  return {
    status,
    provider,
    source: d.source || "derived",
    outbound,
    capabilities_active: countTrue(caps),
    warnings
  };
}

/* ── System Diagnostics ────────────────────────────────── */

/**
 * Konsolidierte System-Health-Diagnostics fuer Admin-Dashboard.
 * Misst Live-Latenzen, parsed Prometheus-Metriken, sammelt Process-Info.
 * Exponiert keine Secrets oder sensitive Pfade.
 *
 * @param {import('pg').Pool} pool
 * @param {{ config?: object, env?: object }} [opts] - optionale Injektion (Tests); Default = globale config / process.env.
 * @returns {Promise<Object>}
 */
export async function getSystemDiagnostics(pool, opts = {}) {
  const started = Date.now();
  const cfg = opts.config || config;
  const env = opts.env || process.env;
  const components = {};

  // ── Database ──────────────────────────────────────────
  try {
    const dbStart = Date.now();
    await pool.query("SELECT 1");
    const dbLatency = Date.now() - dbStart;
    components.database = {
      status: dbLatency > 1000 ? "degraded" : "ok",
      latency_ms: dbLatency,
      pool: {
        total: pool.totalCount  || 0,
        idle:  pool.idleCount   || 0,
        waiting: pool.waitingCount || 0,
        utilization_pct: pool.totalCount
          ? Math.round(((pool.totalCount - pool.idleCount) / pool.totalCount) * 100)
          : 0
      }
    };
  } catch (_err) {
    components.database = { status: "critical", error: "DB_UNREACHABLE", latency_ms: -1 };
  }

  // ── Redis / Queue ─────────────────────────────────────
  if (isQueueAvailable()) {
    try {
      const { getConnection } = await import("../queue/connection.js");
      const conn = getConnection ? getConnection() : null;
      if (conn) {
        const rStart = Date.now();
        await conn.ping();
        components.redis = { status: "ok", latency_ms: Date.now() - rStart };
      } else {
        components.redis = { status: "configured", latency_ms: -1 };
      }
    } catch {
      components.redis = { status: "critical", error: "REDIS_PING_FAILED", latency_ms: -1 };
    }
  } else {
    components.redis = { status: "unconfigured", latency_ms: -1 };
  }

  // ── Process ───────────────────────────────────────────
  const mem = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  components.process = {
    status: "ok",
    uptime_s: Math.floor(process.uptime()),
    started_at: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    memory: {
      rss_mb:        Math.round(mem.rss / 1048576),
      heap_used_mb:  Math.round(mem.heapUsed / 1048576),
      heap_total_mb: Math.round(mem.heapTotal / 1048576),
      external_mb:   Math.round(mem.external / 1048576)
    },
    cpu: {
      user_ms:   Math.round(cpuUsage.user / 1000),
      system_ms: Math.round(cpuUsage.system / 1000)
    },
    node_version: process.version,
    pid: process.pid
  };
  // Memory-Warning: RSS > 512 MB
  if (mem.rss > 536870912) {
    components.process.status = "degraded";
  }

  // ── HTTP-Metriken (aus Prometheus Registry) ───────────
  const httpMetrics = await getHttpMetricsFromRegistry();
  components.api = {
    status: httpMetrics.error_rate_pct > 5 ? "degraded" : "ok",
    ...httpMetrics
  };

  // ── Integrations / Provider-Readiness (Phase I) ───────
  // describe*() ist rein funktional (kein IO) → keine neue Latenz/Fehlerquelle im
  // Health-Pfad. Ein optionaler, nicht konfigurierter Provider ist "unconfigured"
  // (wie redis) und zieht den Gesamtstatus NICHT; nur echte Fehlkonfiguration
  // ("degraded") eskaliert. Exponiert keine Secrets.
  try {
    components.billing = billingHealth(describeBilling(cfg));
    components.email = emailHealth(describeEmail(cfg));
  } catch (_err) {
    components.billing = { status: "unconfigured", provider: "unknown", warnings: [] };
    components.email = { status: "unconfigured", provider: "unknown", warnings: [] };
  }

  // ── Overall Status ────────────────────────────────────
  const statuses = Object.values(components).map(c => c.status);
  const hasCritical = statuses.includes("critical");
  const hasDegraded = statuses.includes("degraded");
  const overall = hasCritical ? "critical" : hasDegraded ? "degraded" : "ok";

  // ── Plattform-Feature-Flags (Ebene B, Introspektion) ──
  // Reine Konfig-Sicht aus dem typed Registry (config/featureFlags.js) — secret-frei
  // (nur key/enabled/default/description/constraint). Bewusst NICHT in `components`:
  // ein Kill-Switch an/aus ist Konfigurationszustand, kein Liveness-Signal und darf
  // den Gesamtstatus nicht eskalieren. listFeatureFlags ist rein funktional (kein IO).
  let feature_flags = [];
  try {
    feature_flags = listFeatureFlags(env);
  } catch (_err) {
    feature_flags = [];
  }

  return {
    status: overall,
    checked_at: new Date().toISOString(),
    response_ms: Date.now() - started,
    version: process.env.npm_package_version || "1.0.0",
    components,
    feature_flags
  };
}

/**
 * Parsed HTTP-Request-Metriken aus der Prometheus-Registry.
 * Berechnet Latency-Percentile (p50, p95, p99), Error Rate und RPS.
 * Graceful Fallback wenn keine Metriken vorhanden.
 */
async function getHttpMetricsFromRegistry() {
  const result = {
    requests_total: 0,
    requests_in_flight: 0,
    error_rate_pct: 0,
    latency: { p50_ms: 0, p95_ms: 0, p99_ms: 0 }
  };

  try {
    // HTTP Request Total
    const totalMetric = await metricsRegistry.getSingleMetric("http_requests_total")?.get();
    if (totalMetric?.values) {
      let total = 0;
      let errors = 0;
      for (const v of totalMetric.values) {
        total += v.value;
        const code = parseInt(v.labels?.status_code);
        if (code >= 500) errors += v.value;
      }
      result.requests_total = total;
      result.error_rate_pct = total > 0 ? Math.round((errors / total) * 10000) / 100 : 0;
    }

    // In-Flight
    const flightMetric = await metricsRegistry.getSingleMetric("http_requests_in_flight")?.get();
    if (flightMetric?.values?.[0]) {
      result.requests_in_flight = flightMetric.values[0].value;
    }

    // Latency Histogram — Percentile aus Buckets approximieren
    const histMetric = await metricsRegistry.getSingleMetric("http_request_duration_seconds")?.get();
    if (histMetric?.values) {
      const buckets = [];
      let totalCount = 0;
      for (const v of histMetric.values) {
        if (v.metricName?.endsWith("_bucket") || v.labels?.le !== undefined) {
          const le = parseFloat(v.labels.le);
          if (!isNaN(le) && le !== Infinity && le !== Number.POSITIVE_INFINITY) {
            buckets.push({ le, count: v.value });
          }
        }
        if (v.metricName?.endsWith("_count") || (v.labels === undefined && v.metricName?.includes("count"))) {
          totalCount += v.value;
        }
      }
      // Summiere _count Werte falls nicht gefunden
      if (totalCount === 0 && buckets.length > 0) {
        totalCount = Math.max(...buckets.map(b => b.count));
      }
      if (totalCount > 0 && buckets.length > 0) {
        buckets.sort((a, b) => a.le - b.le);
        result.latency.p50_ms = Math.round(percentileFromBuckets(buckets, totalCount, 0.5) * 1000);
        result.latency.p95_ms = Math.round(percentileFromBuckets(buckets, totalCount, 0.95) * 1000);
        result.latency.p99_ms = Math.round(percentileFromBuckets(buckets, totalCount, 0.99) * 1000);
      }
    }
  } catch {
    // Prometheus-Metriken nicht verfuegbar — Defaults zurueckgeben
  }

  return result;
}

/**
 * Approximiert ein Percentil aus Prometheus-Histogram-Buckets.
 * Lineare Interpolation zwischen Bucket-Grenzen.
 * @param {Array<{le: number, count: number}>} buckets - Sortierte Buckets
 * @param {number} total - Gesamtzahl der Beobachtungen
 * @param {number} q - Quantil (0-1), z.B. 0.95 fuer p95
 * @returns {number} Geschaetzter Wert in Sekunden
 */
export function percentileFromBuckets(buckets, total, q) {
  const target = total * q;
  let prev = { le: 0, count: 0 };
  for (const b of buckets) {
    if (b.count >= target) {
      // Lineare Interpolation
      const fraction = (target - prev.count) / Math.max(1, b.count - prev.count);
      return prev.le + (b.le - prev.le) * fraction;
    }
    prev = b;
  }
  // Ueber letztem Bucket — gib obere Grenze zurueck
  return buckets[buckets.length - 1]?.le || 0;
}
