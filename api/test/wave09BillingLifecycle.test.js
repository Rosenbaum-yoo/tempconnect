/**
 * WAVE_09 – Billing Lifecycle Tests
 *
 * Prueft:
 *   - applyTrialEnds: active+trial_mode+trial_ends_at<=NOW -> past_due
 *   - applyTrialEnds: Idempotenz (rowCount=0 beim UPDATE)
 *   - applyTrialEnds: future trial_ends_at wird nicht angefasst
 *   - applyTrialEnds: UPDATE-Fehler landet in failed[] ohne den Rest zu stoppen
 *   - applyHardLocks: past_due+grace_expired -> canceled + org->DEMO
 *   - applyHardLocks: past_due innerhalb Kulanzfrist wird nicht angefasst
 *   - applyHardLocks: Idempotenz (rowCount=0)
 *   - applyHardLocks: kein org -> UPDATE organizations wird uebersprungen
 *   - runLifecycleTick: liefert trial_ends + hard_locks Felder
 *   - BILLING_GRACE_PERIOD_DAYS = 14
 *
 * Run: node --test --test-force-exit test/wave09BillingLifecycle.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";

/* ── Pool-Mock-Fabrik ────────────────────────────────────────── */

function makePool(responses = []) {
  let idx = 0;
  const pool = {
    queries: [],
    async query(sql, params) {
      pool.queries.push({ sql, params });
      const r = responses[idx++];
      if (r instanceof Error) throw r;
      return r ?? { rows: [], rowCount: 0 };
    }
  };
  return pool;
}

/* ── BILLING_GRACE_PERIOD_DAYS ───────────────────────────────── */

describe("BILLING_GRACE_PERIOD_DAYS", () => {
  it("ist 14 Tage", async () => {
    const { BILLING_GRACE_PERIOD_DAYS } = await import("../services/subscriptionLifecycleService.js");
    assert.strictEqual(BILLING_GRACE_PERIOD_DAYS, 14);
  });
});

/* ── applyTrialEnds ──────────────────────────────────────────── */

describe("applyTrialEnds", () => {
  it("active trial sub mit abgelaufenem trial_ends_at wird auf past_due gesetzt", async () => {
    const { applyTrialEnds } = await import("../services/subscriptionLifecycleService.js");
    const pastDate = new Date(Date.now() - 86_400_000).toISOString();
    const sub = { id: "sub-1", user_id: "user-1", plan: "BASIS", trial_ends_at: pastDate, current_period_end: null };

    const pool = makePool([
      { rows: [sub], rowCount: 1 },  // SELECT
      { rows: [], rowCount: 1 },      // UPDATE subscriptions -> past_due
      { rows: [], rowCount: 1 },      // writeAudit
    ]);

    const result = await applyTrialEnds(pool, { now: new Date() });

    assert.strictEqual(result.processed, 1);
    assert.strictEqual(result.transitioned, 1);
    assert.strictEqual(result.failed.length, 0);

    // UPDATE muss status='past_due' setzen
    const updateCall = pool.queries.find(c => /UPDATE subscriptions/.test(c.sql) && /past_due/.test(c.sql));
    assert.ok(updateCall, "UPDATE subscriptions SET status=past_due muss vorhanden sein");
    assert.ok(updateCall.params.includes("sub-1"), "sub-1 muss im UPDATE-Param sein");
  });

  it("future trial_ends_at wird NICHT angefasst (leeres SELECT)", async () => {
    const { applyTrialEnds } = await import("../services/subscriptionLifecycleService.js");
    const pool = makePool([
      { rows: [], rowCount: 0 },  // leeres SELECT
    ]);

    const result = await applyTrialEnds(pool);

    assert.strictEqual(result.processed, 0);
    assert.strictEqual(result.transitioned, 0);
  });

  it("Idempotenz: rowCount=0 beim UPDATE -> kein Fehler, nicht gezaehlt", async () => {
    const { applyTrialEnds } = await import("../services/subscriptionLifecycleService.js");
    const sub = {
      id: "sub-2", user_id: "user-2", plan: "PLUS",
      trial_ends_at: new Date(Date.now() - 1000).toISOString(), current_period_end: null
    };

    const pool = makePool([
      { rows: [sub], rowCount: 1 },  // SELECT
      { rows: [], rowCount: 0 },      // UPDATE rowCount=0 (concurrent cron)
    ]);

    const result = await applyTrialEnds(pool);

    assert.strictEqual(result.failed.length, 0);
    assert.strictEqual(result.transitioned, 0);
  });

  it("DB-Fehler beim UPDATE landet in failed[] ohne den Rest zu stoppen", async () => {
    const { applyTrialEnds } = await import("../services/subscriptionLifecycleService.js");
    const subs = [
      { id: "sub-3", user_id: "u3", plan: "BASIS", trial_ends_at: new Date(Date.now() - 1000).toISOString(), current_period_end: null },
      { id: "sub-4", user_id: "u4", plan: "BASIS", trial_ends_at: new Date(Date.now() - 1000).toISOString(), current_period_end: null },
    ];

    const pool = makePool([
      { rows: subs, rowCount: 2 },     // SELECT
      new Error("DB connection lost"), // UPDATE sub-3 -> Fehler
      { rows: [], rowCount: 1 },        // UPDATE sub-4 -> OK
      { rows: [], rowCount: 1 },        // writeAudit sub-4
    ]);

    const result = await applyTrialEnds(pool);

    assert.strictEqual(result.processed, 2);
    assert.strictEqual(result.transitioned, 1);
    assert.strictEqual(result.failed.length, 1);
    assert.strictEqual(result.failed[0].id, "sub-3");
  });
});

/* ── applyHardLocks ──────────────────────────────────────────── */

describe("applyHardLocks", () => {
  it("past_due sub mit abgelaufener Kulanzfrist wird auf canceled + DEMO gesetzt", async () => {
    const { applyHardLocks } = await import("../services/subscriptionLifecycleService.js");
    const periodEnd = new Date(Date.now() - 15 * 86_400_000).toISOString();
    const sub = { id: "sub-5", user_id: "user-5", plan: "PRO", current_period_end: periodEnd };

    const pool = makePool([
      { rows: [sub], rowCount: 1 },             // SELECT
      { rows: [{ id: "org-5" }], rowCount: 1 }, // org lookup
      { rows: [], rowCount: 1 },                 // UPDATE subscriptions -> canceled
      { rows: [], rowCount: 1 },                 // UPDATE organizations -> DEMO
      { rows: [], rowCount: 1 },                 // writeAudit
    ]);

    const result = await applyHardLocks(pool, { now: new Date() });

    assert.strictEqual(result.processed, 1);
    assert.strictEqual(result.locked, 1);
    assert.strictEqual(result.failed.length, 0);

    const cancelCall = pool.queries.find(c => /UPDATE subscriptions/.test(c.sql) && /canceled/.test(c.sql));
    assert.ok(cancelCall, "UPDATE subscriptions SET status=canceled muss vorhanden sein");

    const demoCall = pool.queries.find(c => /UPDATE organizations/.test(c.sql) && /DEMO/.test(c.sql));
    assert.ok(demoCall, "UPDATE organizations SET plan=DEMO muss vorhanden sein");
  });

  it("past_due innerhalb Kulanzfrist (5 Tage) wird NICHT angefasst", async () => {
    const { applyHardLocks } = await import("../services/subscriptionLifecycleService.js");
    // Nur 5 Tage alt: graceCutoffTs = NOW - 14d -> sub.current_period_end ist jünger als cutoff
    // -> WHERE current_period_end <= graceCutoffTs filtert es heraus
    const pool = makePool([
      { rows: [], rowCount: 0 },  // leeres SELECT
    ]);

    const result = await applyHardLocks(pool, { now: new Date() });

    assert.strictEqual(result.processed, 0);
    assert.strictEqual(result.locked, 0);
  });

  it("Idempotenz: rowCount=0 beim UPDATE -> kein Fehler", async () => {
    const { applyHardLocks } = await import("../services/subscriptionLifecycleService.js");
    const periodEnd = new Date(Date.now() - 20 * 86_400_000).toISOString();
    const sub = { id: "sub-6", user_id: "user-6", plan: "PLUS", current_period_end: periodEnd };

    const pool = makePool([
      { rows: [sub], rowCount: 1 },             // SELECT
      { rows: [{ id: "org-6" }], rowCount: 1 }, // org lookup
      { rows: [], rowCount: 0 },                 // UPDATE rowCount=0 (concurrent cron)
    ]);

    const result = await applyHardLocks(pool);

    assert.strictEqual(result.failed.length, 0);
    assert.strictEqual(result.locked, 0);
  });

  it("kein org_member -> UPDATE organizations wird uebersprungen (schema-tolerant)", async () => {
    const { applyHardLocks } = await import("../services/subscriptionLifecycleService.js");
    const periodEnd = new Date(Date.now() - 16 * 86_400_000).toISOString();
    const sub = { id: "sub-7", user_id: "user-7", plan: "BASIS", current_period_end: periodEnd };

    const pool = makePool([
      { rows: [sub], rowCount: 1 },   // SELECT
      { rows: [], rowCount: 0 },       // org lookup -> kein Org gefunden
      { rows: [], rowCount: 1 },       // UPDATE subscriptions -> canceled
      { rows: [], rowCount: 1 },       // writeAudit
    ]);

    const result = await applyHardLocks(pool);

    assert.strictEqual(result.locked, 1);
    assert.strictEqual(result.failed.length, 0);

    const demoCall = pool.queries.find(c => /UPDATE organizations/.test(c.sql));
    assert.ok(!demoCall, "Kein UPDATE organizations wenn kein orgId");
  });
});

/* ── runLifecycleTick: WAVE_09 Felder ────────────────────────── */

describe("runLifecycleTick — WAVE_09 integration", () => {
  it("liefert trial_ends und hard_locks Felder im Ergebnis", async () => {
    const { runLifecycleTick } = await import("../services/subscriptionLifecycleService.js");

    // Alle Queries geben leere Ergebnisse -> alle Crons sehen nichts zu tun
    const pool = makePool([
      { rows: [], rowCount: 0 },  // expireDueRequests
      { rows: [], rowCount: 0 },  // activateDueRequests
      { rows: [], rowCount: 0 },  // applyDueCancellations
      { rows: [], rowCount: 0 },  // applyTrialEnds
      { rows: [], rowCount: 0 },  // applyHardLocks
    ]);

    const tick = await runLifecycleTick(pool);

    assert.strictEqual(tick.ok, true);
    assert.ok(tick.ts, "ts muss vorhanden sein");
    assert.ok(tick.trial_ends, "trial_ends Feld muss vorhanden sein");
    assert.ok(tick.hard_locks, "hard_locks Feld muss vorhanden sein");
    assert.strictEqual(tick.trial_ends.processed, 0);
    assert.strictEqual(tick.hard_locks.processed, 0);
  });
});
