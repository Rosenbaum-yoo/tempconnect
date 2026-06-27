/**
 * recurringBilling.test.js
 *
 * SaaS-Self-Service-Billing (feature-flagged, inaktiv bis UG-Gründung):
 *   - generateRecurringInvoices: Folgerechnung + Status-Flip, Preis-Auflösung,
 *     Idempotenz-Guard, Skip ohne Preis/ohne Owner-Org, atomarer Rollback bei Rechnungsfehler.
 *   - runDunningSweep: gestaffelte Erinnerungen, NO_MAILER-No-Op, Stufen-Logik.
 *   - applyRenewalPayment: Periode +1 Monat, Target-Pflicht.
 *   - /internal-Endpunkte: No-Op bei Flag AUS, Service-Aufruf bei Flag AN.
 *
 * DB-frei: Mock-Pool zählt Query-Form + Reihenfolge (Anti-Regression der SQL-Verträge).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  generateRecurringInvoices,
  runDunningSweep,
  applyRenewalPayment,
  resolveDunningLevel,
  MAX_BATCH_SIZE,
  MAX_DUNNING_LEVEL
} from "../services/recurringBillingService.js";
import { getPlanPriceCentsByKey } from "../config/planCatalog.js";
import { createInternalRouter } from "../routes/internal.js";

/* ── Mock-Pool: handler(sql, params, idx) → Response ───────────── */
function trackingPool(handler) {
  const calls = [];
  const pool = {
    calls,
    query: async (sql, params) => {
      const s = String(sql || "");
      calls.push({ sql: s, params: params || [] });
      const res = handler ? await handler(s, params || [], calls.length - 1) : null;
      return res || { rows: [], rowCount: 0 };
    },
    connect: async () => ({ query: pool.query, release: () => {} })
  };
  return pool;
}

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };

/* ─────────────────────────────────────────────────────────────── */
describe("recurringBillingService — generateRecurringInvoices", () => {
  it("selektiert nur aktive, bezahlte, nicht-Trial Subs mit abgelaufener Periode", async () => {
    const pool = trackingPool((sql) => {
      if (/FROM subscriptions/.test(sql) && /trial_mode = FALSE/.test(sql)) return { rows: [] };
      return { rows: [], rowCount: 0 };
    });
    const result = await generateRecurringInvoices(pool, { now: "2026-02-01T00:00:00Z" });
    const sel = pool.calls[0].sql;
    assert.match(sel, /status = 'active'/);
    assert.match(sel, /trial_mode = FALSE/);
    assert.match(sel, /plan <> 'DEMO'/);
    assert.match(sel, /current_period_end <= \$1/);
    assert.equal(pool.calls[0].params[0], "2026-02-01T00:00:00.000Z");
    assert.equal(pool.calls[0].params[1], MAX_BATCH_SIZE); // default batch
    assert.deepEqual(result, { processed: 0, invoiced: 0, skipped: 0, failed: [], batch_size: MAX_BATCH_SIZE });
  });

  it("erzeugt eine Folgerechnung für BASIS + flippt auf past_due (Katalogpreis)", async () => {
    const dueSub = { id: "sub-1", user_id: "u-1", plan: "BASIS", current_period_start: "2026-01-01T00:00:00Z", current_period_end: "2026-02-01T00:00:00Z" };
    const orgRow = { org_id: "org-1", org_name: "Acme GmbH", billing_mode: "standard_catalog", individual_contract_price_cents: null, user_email: "owner@acme.de" };
    const createInvoiceCalls = [];
    const createInvoice = async (_pool, opts) => { createInvoiceCalls.push(opts); return { id: "inv-1", invoice_number: "TC-2026-000001" }; };

    const pool = trackingPool((sql) => {
      if (/FROM subscriptions/.test(sql) && /trial_mode = FALSE/.test(sql)) return { rows: [dueSub] };
      if (/FROM org_memberships/.test(sql)) return { rows: [orgRow] };
      if (/UPDATE subscriptions/.test(sql) && /SET\s+status = 'past_due'/.test(sql)) return { rowCount: 1, rows: [] };
      return { rows: [], rowCount: 0 };
    });

    const result = await generateRecurringInvoices(pool, { now: "2026-03-01T00:00:00Z", createInvoice });

    assert.equal(result.processed, 1);
    assert.equal(result.invoiced, 1);
    assert.equal(result.skipped, 0);
    assert.equal(result.failed.length, 0);
    assert.equal(createInvoiceCalls.length, 1);
    assert.equal(createInvoiceCalls[0].plan, "BASIS");
    assert.equal(createInvoiceCalls[0].userId, "u-1");
    assert.equal(createInvoiceCalls[0].orgId, "org-1");
    assert.equal(createInvoiceCalls[0].amountCents, getPlanPriceCentsByKey("BASIS")); // gegen echten Katalog
    assert.ok(createInvoiceCalls[0].amountCents > 0);
    // Status-Flip wurde ausgelöst:
    assert.ok(pool.calls.some((c) => /UPDATE subscriptions/.test(c.sql) && /SET\s+status = 'past_due'/.test(c.sql)));
  });

  it("INDIVIDUELL ohne Vertragspreis → skipped, keine Rechnung, kein Flip", async () => {
    const dueSub = { id: "s2", user_id: "u2", plan: "INDIVIDUELL", current_period_end: "2026-02-01T00:00:00Z" };
    const orgRow = { org_id: "o2", org_name: "X", billing_mode: "individual_contract", individual_contract_price_cents: null, user_email: "x@x.de" };
    const createInvoiceCalls = [];
    const createInvoice = async (_p, o) => { createInvoiceCalls.push(o); return { id: "i", invoice_number: "n" }; };
    const pool = trackingPool((sql) => {
      if (/FROM subscriptions/.test(sql) && /trial_mode = FALSE/.test(sql)) return { rows: [dueSub] };
      if (/FROM org_memberships/.test(sql)) return { rows: [orgRow] };
      return { rows: [], rowCount: 0 };
    });
    const result = await generateRecurringInvoices(pool, { createInvoice });
    assert.equal(result.invoiced, 0);
    assert.equal(result.skipped, 1);
    assert.equal(createInvoiceCalls.length, 0);
    assert.ok(!pool.calls.some((c) => /UPDATE subscriptions/.test(c.sql)));
    // Skip wurde auditiert:
    assert.ok(pool.calls.some((c) => /audit_log/i.test(c.sql)));
  });

  it("INDIVIDUELL mit Vertragspreis → Rechnung mit Org-Vertragspreis", async () => {
    const dueSub = { id: "s3", user_id: "u3", plan: "INDIVIDUELL", current_period_end: "2026-02-01T00:00:00Z" };
    const orgRow = { org_id: "o3", org_name: "Y", billing_mode: "individual_contract", individual_contract_price_cents: 249900, user_email: "y@y.de" };
    const createInvoiceCalls = [];
    const createInvoice = async (_p, o) => { createInvoiceCalls.push(o); return { id: "i3", invoice_number: "TC-3" }; };
    const pool = trackingPool((sql) => {
      if (/FROM subscriptions/.test(sql) && /trial_mode = FALSE/.test(sql)) return { rows: [dueSub] };
      if (/FROM org_memberships/.test(sql)) return { rows: [orgRow] };
      if (/UPDATE subscriptions/.test(sql) && /SET\s+status = 'past_due'/.test(sql)) return { rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const result = await generateRecurringInvoices(pool, { createInvoice });
    assert.equal(result.invoiced, 1);
    assert.equal(createInvoiceCalls[0].amountCents, 249900);
    assert.equal(createInvoiceCalls[0].plan, "INDIVIDUELL");
  });

  it("Idempotenz: Status-Flip rowCount 0 → keine Rechnung (paralleler Lauf)", async () => {
    const dueSub = { id: "s4", user_id: "u4", plan: "PLUS", current_period_end: "2026-02-01T00:00:00Z" };
    const orgRow = { org_id: "o4", org_name: "Z", billing_mode: "standard_catalog", individual_contract_price_cents: null, user_email: "z@z.de" };
    const createInvoiceCalls = [];
    const createInvoice = async (_p, o) => { createInvoiceCalls.push(o); return { id: "x" }; };
    const pool = trackingPool((sql) => {
      if (/FROM subscriptions/.test(sql) && /trial_mode = FALSE/.test(sql)) return { rows: [dueSub] };
      if (/FROM org_memberships/.test(sql)) return { rows: [orgRow] };
      if (/UPDATE subscriptions/.test(sql) && /SET\s+status = 'past_due'/.test(sql)) return { rowCount: 0 }; // bereits verarbeitet
      return { rows: [], rowCount: 0 };
    });
    const result = await generateRecurringInvoices(pool, { createInvoice });
    assert.equal(result.invoiced, 0);
    assert.equal(createInvoiceCalls.length, 0);
  });

  it("Rechnungsfehler → Transaktion rollt zurück (kein Zombie) + als failed gezählt", async () => {
    const dueSub = { id: "s5", user_id: "u5", plan: "PRO", current_period_end: "2026-02-01T00:00:00Z" };
    const orgRow = { org_id: "o5", org_name: "W", billing_mode: "standard_catalog", individual_contract_price_cents: null, user_email: "w@w.de" };
    const createInvoice = async () => { throw new Error("INVOICE_BOOM"); };
    const pool = trackingPool((sql) => {
      if (/FROM subscriptions/.test(sql) && /trial_mode = FALSE/.test(sql)) return { rows: [dueSub] };
      if (/FROM org_memberships/.test(sql)) return { rows: [orgRow] };
      if (/UPDATE subscriptions/.test(sql)) return { rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const result = await generateRecurringInvoices(pool, { createInvoice, logger: noopLogger });
    assert.equal(result.invoiced, 0);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].id, "s5");
    // Atomar: der Flip wird per ROLLBACK rückgängig gemacht — kein manueller Revert, kein „past_due ohne Rechnung".
    assert.ok(pool.calls.some((c) => /ROLLBACK/.test(c.sql)), "ROLLBACK erwartet");
    assert.ok(!pool.calls.some((c) => /SET status = 'active'/.test(c.sql)), "kein manueller Revert mehr");
  });

  it("kein Owner-Org auflösbar → Skip (kein org_id=NULL-Invoice, kein Status-Flip)", async () => {
    const dueSub = { id: "s6", user_id: "u6", plan: "PRO", current_period_end: "2026-02-01T00:00:00Z" };
    let createInvoiceCalled = false;
    const createInvoice = async () => { createInvoiceCalled = true; return { id: "x" }; };
    const pool = trackingPool((sql) => {
      if (/FROM subscriptions/.test(sql) && /trial_mode = FALSE/.test(sql)) return { rows: [dueSub] };
      if (/FROM org_memberships/.test(sql)) return { rows: [] }; // Owner-Lookup liefert nichts → orgId null
      return { rows: [], rowCount: 0 };
    });
    const result = await generateRecurringInvoices(pool, { createInvoice, logger: noopLogger });
    assert.equal(result.invoiced, 0);
    assert.equal(result.skipped, 1);
    assert.equal(createInvoiceCalled, false, "keine Rechnung ohne Owner-Org");
    assert.ok(!pool.calls.some((c) => /UPDATE subscriptions/.test(c.sql)), "kein Status-Flip");
  });
});

/* ─────────────────────────────────────────────────────────────── */
describe("recurringBillingService — resolveDunningLevel", () => {
  it("eskaliert nur auf neue, fällige Stufen", () => {
    assert.equal(resolveDunningLevel(0, 0), 0);
    assert.equal(resolveDunningLevel(3, 0), 1);
    assert.equal(resolveDunningLevel(7, 0), 2);
    assert.equal(resolveDunningLevel(11, 0), 3);
    assert.equal(resolveDunningLevel(11, MAX_DUNNING_LEVEL), 0); // bereits max
    assert.equal(resolveDunningLevel(7, 1), 2);                  // 1 → 2
    assert.equal(resolveDunningLevel(3, 1), 0);                  // Stufe 1 schon gesendet, 2 noch nicht fällig
  });
});

/* ─────────────────────────────────────────────────────────────── */
describe("recurringBillingService — runDunningSweep", () => {
  it("ohne Mailer → NO_MAILER-No-Op (keine DB-Abfrage)", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    const result = await runDunningSweep(pool, {});
    assert.equal(result.note, "NO_MAILER");
    assert.equal(result.reminded, 0);
    assert.equal(pool.calls.length, 0);
  });

  it("überfällige Rechnung → Mail versendet + Stufe markiert + auditiert", async () => {
    const inv = {
      id: "inv-9", invoice_number: "TC-2026-000009", user_id: "u9", org_id: "o9",
      total_cents: 17850, currency: "EUR", due_at: "2026-01-01T00:00:00Z",
      dunning_level: 0, last_dunning_at: null, plan: "BASIS",
      user_email: "kunde@firma.de", org_name: "Firma GmbH"
    };
    const mailCalls = [];
    const sendMail = async (to, subject, html) => { mailCalls.push({ to, subject, html }); return true; };
    const pool = trackingPool((sql) => {
      if (/FROM invoices/.test(sql) && /status = 'overdue'/.test(sql)) return { rows: [inv] };
      if (/UPDATE invoices/.test(sql)) return { rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const result = await runDunningSweep(pool, { now: "2026-01-05T00:00:00Z", sendMail }); // 4 Tage überfällig → Stufe 1
    assert.equal(result.reminded, 1);
    assert.equal(mailCalls.length, 1);
    assert.equal(mailCalls[0].to, "kunde@firma.de");
    assert.match(mailCalls[0].subject, /Zahlungserinnerung/);
    // dunning_level=1 wurde geschrieben:
    const upd = pool.calls.find((c) => /UPDATE invoices/.test(c.sql) && /dunning_level/.test(c.sql));
    assert.ok(upd, "UPDATE invoices dunning_level erwartet");
    assert.equal(upd.params[0], 1);
    // SELECT filtert auf Abo-Rechnungen + Stufe < max:
    const sel = pool.calls[0].sql;
    assert.match(sel, /invoice_type = 'subscription'/);
    assert.match(sel, /dunning_level < \$1/);
  });

  it("noch keine Stufe fällig (1 Tag überfällig) → skip, keine Mail", async () => {
    const inv = {
      id: "inv-10", invoice_number: "TC-10", user_id: "u10", org_id: "o10",
      total_cents: 10000, currency: "EUR", due_at: "2026-01-01T00:00:00Z",
      dunning_level: 0, last_dunning_at: null, plan: "BASIS",
      user_email: "a@a.de", org_name: "A"
    };
    const mailCalls = [];
    const sendMail = async (...a) => { mailCalls.push(a); return true; };
    const pool = trackingPool((sql) => {
      if (/FROM invoices/.test(sql) && /status = 'overdue'/.test(sql)) return { rows: [inv] };
      return { rows: [], rowCount: 0 };
    });
    const result = await runDunningSweep(pool, { now: "2026-01-02T00:00:00Z", sendMail });
    assert.equal(result.reminded, 0);
    assert.equal(result.skipped, 1);
    assert.equal(mailCalls.length, 0);
  });
});

/* ─────────────────────────────────────────────────────────────── */
describe("recurringBillingService — applyRenewalPayment", () => {
  it("setzt past_due → active und rollt Periode +1 Monat", async () => {
    const updated = { id: "s1", user_id: "u1", plan: "BASIS", status: "active", current_period_start: "2026-02-01T00:00:00Z", current_period_end: "2026-03-01T00:00:00Z" };
    const pool = trackingPool((sql) => {
      if (/UPDATE subscriptions/.test(sql) && /RETURNING/.test(sql)) return { rows: [updated] };
      return { rows: [], rowCount: 0 };
    });
    const sub = await applyRenewalPayment(pool, { subscriptionId: "s1" });
    assert.equal(sub.status, "active");
    const upd = pool.calls.find((c) => /UPDATE subscriptions/.test(c.sql));
    assert.match(upd.sql, /INTERVAL '1 month'/);
    assert.match(upd.sql, /status = 'past_due'/); // idempotenter Guard im WHERE
    assert.equal(upd.params[0], "s1");
  });

  it("ohne Target → wirft RENEWAL_PAYMENT_TARGET_REQUIRED", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    await assert.rejects(() => applyRenewalPayment(pool, {}), /RENEWAL_PAYMENT_TARGET_REQUIRED/);
  });
});

/* ─────────────────────────────────────────────────────────────── */
describe("internal router — recurring-billing & dunning-sweep Endpunkte", () => {
  function buildRouter(configOverrides) {
    return createInternalRouter({
      pool: trackingPool(() => ({ rows: [] })),
      config: { INTERNAL_CRON_ALLOWED_IPS: [], INTERNAL_CRON_SECRET: "", ...configOverrides },
      cronRateLimit: (_req, _res, next) => next(),
      logger: noopLogger,
      sendMail: async () => true
    });
  }
  function handlerFor(router, routePath) {
    const layer = router.stack.find((l) => l.route && l.route.path === routePath);
    assert.ok(layer, `Route ${routePath} muss registriert sein`);
    return layer.route.stack[layer.route.stack.length - 1].handle;
  }
  function mockRes() {
    const res = { _json: null, _status: 200, json(x) { this._json = x; return this; }, status(c) { this._status = c; return this; } };
    return res;
  }
  const mockReq = { ip: "127.0.0.1", socket: {}, headers: {} };

  it("registriert beide Endpunkte", () => {
    const router = buildRouter({});
    const paths = router.stack.filter((l) => l.route).map((l) => l.route.path);
    assert.ok(paths.includes("/internal/recurring-billing"));
    assert.ok(paths.includes("/internal/dunning-sweep"));
  });

  it("recurring-billing No-Op wenn RECURRING_BILLING_ENABLED=false", async () => {
    const router = buildRouter({ RECURRING_BILLING_ENABLED: false });
    const res = mockRes();
    await handlerFor(router, "/internal/recurring-billing")(mockReq, res);
    assert.deepEqual(res._json, { ok: true, disabled: true, reason: "RECURRING_BILLING_ENABLED=false" });
  });

  it("dunning-sweep No-Op wenn DUNNING_ENABLED=false", async () => {
    const router = buildRouter({ DUNNING_ENABLED: false });
    const res = mockRes();
    await handlerFor(router, "/internal/dunning-sweep")(mockReq, res);
    assert.deepEqual(res._json, { ok: true, disabled: true, reason: "DUNNING_ENABLED=false" });
  });

  it("recurring-billing ruft Service auf wenn Flag AN (leeres Set → invoiced 0)", async () => {
    const pool = trackingPool((sql) => {
      if (/FROM subscriptions/.test(sql) && /trial_mode = FALSE/.test(sql)) return { rows: [] };
      return { rows: [], rowCount: 0 };
    });
    const router = createInternalRouter({
      pool,
      config: { INTERNAL_CRON_ALLOWED_IPS: [], INTERNAL_CRON_SECRET: "", RECURRING_BILLING_ENABLED: true },
      cronRateLimit: (_req, _res, next) => next(),
      logger: noopLogger,
      sendMail: async () => true
    });
    const res = mockRes();
    await handlerFor(router, "/internal/recurring-billing")(mockReq, res);
    assert.equal(res._json.ok, true);
    assert.equal(res._json.disabled, undefined); // NICHT der No-Op-Pfad
    assert.equal(res._json.invoiced, 0);         // Service-Ergebnis (leeres Set)
    assert.ok(pool.calls.some((c) => /FROM subscriptions/.test(c.sql))); // Service real aufgerufen
  });
});
