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
