/**
 * System Health Diagnostics Test Suite
 * Tests: percentileFromBuckets-Algorithmus, Service-Exports, Admin-Router-Endpunkt.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  pingDb,
  getMigrations,
  getSystemDiagnostics,
  percentileFromBuckets
} from "../services/healthService.js";

/* ── percentileFromBuckets ───────────────────────────────── */

describe("healthService — percentileFromBuckets", () => {
  const buckets = [
    { le: 0.01,  count: 100 },
    { le: 0.025, count: 300 },
    { le: 0.05,  count: 700 },
    { le: 0.1,   count: 900 },
    { le: 0.25,  count: 950 },
    { le: 0.5,   count: 980 },
    { le: 1,     count: 995 },
    { le: 2.5,   count: 999 },
    { le: 5,     count: 1000 }
  ];
  const total = 1000;

  it("p50 liegt im mittleren Bereich", () => {
    const p50 = percentileFromBuckets(buckets, total, 0.5);
    // 500. Wert liegt im Bucket 0.025-0.05 (count 300-700)
    assert.ok(p50 > 0.025 && p50 <= 0.05, `p50=${p50} soll zwischen 0.025 und 0.05 liegen`);
  });

  it("p95 liegt im hoeheren Bereich", () => {
    const p95 = percentileFromBuckets(buckets, total, 0.95);
    assert.ok(p95 > 0.1 && p95 <= 0.25, `p95=${p95} soll zwischen 0.1 und 0.25 liegen`);
  });

  it("p99 liegt nahe am Tail", () => {
    const p99 = percentileFromBuckets(buckets, total, 0.99);
    assert.ok(p99 > 0.5, `p99=${p99} soll ueber 0.5 liegen`);
  });

  it("gibt 0 zurueck bei leeren Buckets", () => {
    assert.equal(percentileFromBuckets([], 0, 0.5), 0);
  });

  it("gibt obere Grenze zurueck wenn ueber letztem Bucket", () => {
    const small = [{ le: 0.01, count: 5 }];
    const result = percentileFromBuckets(small, 100, 0.99);
    assert.equal(result, 0.01);
  });

  it("lineare Interpolation ist korrekt fuer einfachen Fall", () => {
    const simple = [
      { le: 0.1, count: 50 },
      { le: 0.2, count: 100 }
    ];
    // p50: target=50, im ersten Bucket (count 50 >= 50)
    // fraction = (50-0)/(50-0) = 1.0 → 0 + (0.1-0)*1.0 = 0.1
    const p50 = percentileFromBuckets(simple, 100, 0.5);
    assert.ok(Math.abs(p50 - 0.1) < 0.001, `p50=${p50} soll ~0.1 sein`);
  });
});

/* ── Service Exports ─────────────────────────────────────── */

describe("healthService — Exports", () => {
  it("exportiert pingDb als Funktion", () => {
    assert.equal(typeof pingDb, "function");
  });

  it("exportiert getMigrations als Funktion", () => {
    assert.equal(typeof getMigrations, "function");
  });

  it("exportiert getSystemDiagnostics als Funktion", () => {
    assert.equal(typeof getSystemDiagnostics, "function");
  });

  it("exportiert percentileFromBuckets als Funktion", () => {
    assert.equal(typeof percentileFromBuckets, "function");
  });
});

/* ── Provider-Readiness in System Diagnostics (Phase I) ──── */

describe("healthService — Provider-Readiness (billing/email) in getSystemDiagnostics", () => {
  // Fake-Pool: DB-Ping ok, keine SQL-Auswertung. Provider-Status haengt nur an der
  // injizierten Config, nicht an der Ambient-Umgebung.
  const okPool = { query: async () => ({ rows: [{ ok: 1 }] }) };

  it("ohne Konfiguration: billing+email sind 'unconfigured' (nicht 'failed')", async () => {
    const diag = await getSystemDiagnostics(okPool, { config: {} });
    assert.equal(diag.components.billing.status, "unconfigured");
    assert.equal(diag.components.billing.provider, "manual");
    assert.equal(diag.components.billing.automated, false);
    assert.equal(diag.components.email.status, "unconfigured");
    assert.equal(diag.components.email.provider, "console");
    assert.equal(diag.components.email.outbound, false);
    // Ein optionaler, nicht konfigurierter Provider eskaliert nie zu "critical".
    assert.notEqual(diag.status, "critical");
  });

  it("konfigurierte Provider (stripe + sendgrid mit echten Keys) sind 'ok'", async () => {
    const cfg = {
      BILLING_PROVIDER: "stripe", PAYMENT_MODE: "live",
      STRIPE_SECRET_KEY: "sk_live_realkey1234567890",
      STRIPE_WEBHOOK_SECRET: "whsec_realsecret1234567890",
      EMAIL_PROVIDER: "sendgrid", SENDGRID_API_KEY: "SG.abc123realkey"
    };
    const diag = await getSystemDiagnostics(okPool, { config: cfg });
    assert.equal(diag.components.billing.status, "ok");
    assert.equal(diag.components.billing.automated, true);
    assert.ok(diag.components.billing.capabilities_active > 0);
    assert.equal(diag.components.email.status, "ok");
    assert.equal(diag.components.email.outbound, true);
  });

  it("erzwungener Provider ohne Key ist 'degraded' mit Warnung und eskaliert den Gesamtstatus", async () => {
    const cfg = { BILLING_PROVIDER: "stripe", PAYMENT_MODE: "live", EMAIL_PROVIDER: "sendgrid" };
    const diag = await getSystemDiagnostics(okPool, { config: cfg });
    assert.equal(diag.components.billing.status, "degraded");
    assert.ok(diag.components.billing.warnings.length > 0, "billing-Warnung erwartet");
    assert.equal(diag.components.email.status, "degraded");
    assert.ok(diag.components.email.warnings.length > 0, "email-Warnung erwartet");
    // degraded-Provider koennen den Gesamtstatus hoechstens auf "degraded" ziehen (nie "critical").
    assert.equal(diag.status, "degraded");
  });

  it("exponiert keine Secret-Werte in den Provider-Komponenten", async () => {
    const secret = "sk_live_TOPSECRETvalue999";
    const sgSecret = "SG.TOPSECRETsendgrid999";
    const cfg = {
      BILLING_PROVIDER: "stripe", PAYMENT_MODE: "live",
      STRIPE_SECRET_KEY: secret, STRIPE_WEBHOOK_SECRET: "whsec_realsecret1234567890",
      EMAIL_PROVIDER: "sendgrid", SENDGRID_API_KEY: sgSecret
    };
    const diag = await getSystemDiagnostics(okPool, { config: cfg });
    const serialized = JSON.stringify({ b: diag.components.billing, e: diag.components.email });
    assert.ok(!serialized.includes(secret), "Stripe-Secret darf nicht exponiert werden");
    assert.ok(!serialized.includes(sgSecret), "SendGrid-Key darf nicht exponiert werden");
  });

  it("billing+email-Komponenten sind immer vorhanden (Shape-Garantie)", async () => {
    const diag = await getSystemDiagnostics(okPool, { config: {} });
    for (const key of ["billing", "email"]) {
      assert.ok(diag.components[key], `components.${key} fehlt`);
      assert.equal(typeof diag.components[key].status, "string");
      assert.equal(typeof diag.components[key].provider, "string");
      assert.ok(Array.isArray(diag.components[key].warnings));
    }
  });
});

/* ── Feature-Flag-Introspektion (Ebene B) in System Diagnostics ──── */

describe("healthService — feature_flags-Introspektion in getSystemDiagnostics", () => {
  // env wird injiziert → deterministisch unabhaengig von der Ambient-Umgebung
  // (Docker setzt z. B. FEATURE_GATE_BYPASS=true).
  const okPool = { query: async () => ({ rows: [{ ok: 1 }] }) };

  it("liefert feature_flags als Array mit den bekannten Plattform-Flags und secret-freier Shape", async () => {
    const diag = await getSystemDiagnostics(okPool, { config: {}, env: {} });
    assert.ok(Array.isArray(diag.feature_flags));
    const keys = diag.feature_flags.map(f => f.key);
    for (const k of ["FEATURE_GATE_BYPASS", "SUPPORT_OPS_ENABLED", "WARP_SSH_ENABLED", "INFRA_SNAPSHOT_INGEST_ENABLED"]) {
      assert.ok(keys.includes(k), `${k} fehlt in feature_flags`);
    }
    const entry = diag.feature_flags.find(f => f.key === "FEATURE_GATE_BYPASS");
    for (const prop of ["key", "enabled", "default", "description", "productionConstraint"]) {
      assert.ok(prop in entry, `feature_flag-Eintrag ohne ${prop}`);
    }
    assert.equal(typeof entry.enabled, "boolean");
  });

  it("spiegelt die echten Consumer-Defaults: SUPPORT_OPS/INFRA on, WARP_SSH/BYPASS off (leeres Env)", async () => {
    const diag = await getSystemDiagnostics(okPool, { config: {}, env: {} });
    const byKey = Object.fromEntries(diag.feature_flags.map(f => [f.key, f.enabled]));
    assert.equal(byKey.SUPPORT_OPS_ENABLED, true);
    assert.equal(byKey.INFRA_SNAPSHOT_INGEST_ENABLED, true);
    assert.equal(byKey.WARP_SSH_ENABLED, false);
    assert.equal(byKey.FEATURE_GATE_BYPASS, false);
  });

  it("explizite Env-Werte gewinnen (WARP_SSH_ENABLED=true → enabled)", async () => {
    const diag = await getSystemDiagnostics(okPool, { config: {}, env: { WARP_SSH_ENABLED: "true" } });
    const warp = diag.feature_flags.find(f => f.key === "WARP_SSH_ENABLED");
    assert.equal(warp.enabled, true);
  });

  it("feature_flags eskaliert den Gesamtstatus nicht (Konfig-Sicht, kein Liveness-Signal)", async () => {
    const base = await getSystemDiagnostics(okPool, { config: {}, env: {} });
    const withBypass = await getSystemDiagnostics(okPool, { config: {}, env: { FEATURE_GATE_BYPASS: "true" } });
    assert.equal(withBypass.status, base.status, "Feature-Flag darf den Gesamtstatus nicht veraendern");
    const bypass = withBypass.feature_flags.find(f => f.key === "FEATURE_GATE_BYPASS");
    assert.equal(bypass.enabled, true);
  });
});

/* ── Admin Router Endpunkt ───────────────────────────────── */

describe("Admin Router — system-health Endpunkt", () => {
  it("createAdminRouter exportiert eine Funktion", async () => {
    const mod = await import("../routes/admin.js");
    assert.equal(typeof mod.createAdminRouter, "function");
  });

  it("Router enthaelt /admin/system-health Route", async () => {
    const { createAdminRouter } = await import("../routes/admin.js");
    const noop = (_req, _res, next) => next();
    const router = createAdminRouter({ pool: {}, requireAuth: noop, logger: { error() {}, info() {}, warn() {} } });
    const paths = router.stack
      .filter(l => l.route)
      .map(l => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);
    assert.ok(
      paths.includes("GET /admin/system-health"),
      `Fehlender Endpunkt: GET /admin/system-health. Vorhanden: ${paths.join(", ")}`
    );
  });
});
