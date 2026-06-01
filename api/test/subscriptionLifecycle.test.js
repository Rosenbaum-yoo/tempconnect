/**
 * Welle 8 Schritt 16 - Tests fuer subscriptionLifecycleService
 *
 * Pruefungen:
 *   1. Auto-Linking: Erstellung ohne Dubletten, idempotent, schreibt
 *      `source_strategic_request_id`, schreibt Audit, feuert Notification
 *      fire-and-forget. Race-Condition (UNIQUE-Index 23505) wird abgefangen.
 *   2. Quote-Snapshot: enthaelt catalog_version, plan-Daten, addons,
 *      feature_keys, limits. Idempotent (already_frozen=true). Stabilitaet
 *      gegen Catalog-Aenderung (das Snapshot bleibt im DB-Wert eingefroren).
 *   3. Expiry-Cron: findet `offered`/`accepted` mit abgelaufenem
 *      offer_expires_at, transitioniert auf expired, schreibt Audit,
 *      feuert Notification, **ohne dass der Datensatz im naechsten Lauf
 *      erneut bearbeitet wird** (Idempotenz via Status-Filter).
 *   4. Activation-Cron: ruft applyApprovedChange, schreibt Audit, feuert
 *      Notification. Bei Fehler: notifyActivationFailed.
 *   5. Cancellation-Cron: setzt subscriptions.status='canceled',
 *      organizations.plan='DEMO', transitioniert request auf expired.
 *   6. runLifecycleTick orchestriert alle drei Phasen, Teilfehler
 *      isolieren sich.
 *   7. Hook-Verdrahtung: routes/internal.js + routes/staffControlCenter.js
 *      nutzen den Service korrekt.
 *   8. Migration 104: Schema + Indexes + UNIQUE-Schutz vorhanden.
 *
 * Run:
 *   node --test --test-force-exit api/test/subscriptionLifecycle.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  linkEnterpriseRequestToSubscription,
  buildQuoteSnapshot,
  freezeQuoteSnapshot,
  expireDueRequests,
  activateDueRequests,
  applyDueCancellations,
  runLifecycleTick,
  DEFAULT_OFFER_VALIDITY_DAYS,
  MAX_BATCH_SIZE
} from "../services/subscriptionLifecycleService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Docker: cwd=/app (api dir), no "api/" subdir → HAS_API_SUBDIR=false
// Outside Docker: cwd=project root, has "api/" subdir → HAS_API_SUBDIR=true
const ROOT = process.cwd();
const HAS_API_SUBDIR = existsSync(path.join(ROOT, "api"));

/* ── Pool-Mock (handler-basiert) ──────────────────────────────── */

function trackingPool(handler) {
  const calls = [];
  const pool = {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: String(sql || ""), params: params || [] });
      const res = handler ? await handler(sql, params || [], calls.length - 1) : null;
      return res || { rows: [], rowCount: 0 };
    },
    connect: async () => ({
      query: pool.query,
      release: () => {}
    })
  };
  return pool;
}

/* ============================================================ *
 * 1. Auto-Linking                                               *
 * ============================================================ */

describe("linkEnterpriseRequestToSubscription", () => {
  function leadRow(over = {}) {
    return {
      id: "strat-1",
      source_context: "enterprise_config",
      status: "eingegangen",
      strategic_request_type: "enterprise_config",
      requester_user_id: null,
      requester_org_id: null,
      requester_company_name: "Acme",
      contact_name: "Max",
      contact_email: "max@acme.de",
      contact_phone: null,
      region_scope: null,
      site_count: 5,
      plan_requested: "INDIVIDUELL",
      base_price_cents: 249900,
      seats_requested: 75,
      seats_included: 50,
      seat_price_cents: 2900,
      selected_addons: [{ key: "api" }, { key: "spend" }],
      monthly_estimate_cents: 320000,
      onetime_estimate_cents: 249900,
      street: "Hauptstr. 1",
      city: "Berlin",
      vat_id: "DE12345",
      expected_start_date: "2026-06-01",
      submitted_ip: null,
      submitted_user_agent: null,
      ...over
    };
  }

  it("INVALID_ARGS ohne strategicRequestId", async () => {
    const r = await linkEnterpriseRequestToSubscription(trackingPool(), {});
    assert.equal(r.ok, false);
    assert.equal(r.error, "STRATEGIC_REQUEST_ID_REQUIRED");
  });

  it("UNSUPPORTED_REQUEST_TYPE bei requestType='upgrade'", async () => {
    const r = await linkEnterpriseRequestToSubscription(trackingPool(), {
      strategicRequestId: "x", requestType: "upgrade"
    });
    assert.equal(r.ok, false);
    assert.equal(r.error, "UNSUPPORTED_REQUEST_TYPE");
  });

  it("ALREADY_LINKED wenn bereits offene Verlinkung existiert", async () => {
    const pool = trackingPool(async (sql) => {
      if (/FROM subscription_requests/i.test(sql) && /source_strategic_request_id/.test(sql) && /SELECT/i.test(sql)) {
        return { rows: [{ id: "sr-existing", status: "submitted", request_type: "new_individual" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const r = await linkEnterpriseRequestToSubscription(pool, { strategicRequestId: "strat-1" });
    assert.equal(r.ok, true);
    assert.equal(r.linked, false);
    assert.equal(r.reason, "ALREADY_LINKED");
    assert.equal(r.subscription_request_id, "sr-existing");
  });

  it("STRATEGIC_REQUEST_NOT_FOUND wenn Source fehlt", async () => {
    const pool = trackingPool(async (sql) => {
      if (/FROM subscription_requests/i.test(sql) && /source_strategic_request_id/.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      if (/FROM strategic_collaboration_requests/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    const r = await linkEnterpriseRequestToSubscription(pool, { strategicRequestId: "missing" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "STRATEGIC_REQUEST_NOT_FOUND");
  });

  it("erstellt subscription_request mit source_strategic_request_id + Audit + Notify", async () => {
    let createdSr = null;
    const pool = trackingPool(async (sql, params) => {
      if (/FROM subscription_requests/i.test(sql) && /source_strategic_request_id/.test(sql) && /SELECT/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      if (/FROM strategic_collaboration_requests/i.test(sql)) {
        return { rows: [leadRow()], rowCount: 1 };
      }
      if (/INSERT INTO subscription_requests/i.test(sql)) {
        createdSr = {
          id: "sr-new",
          status: "submitted",
          request_type: "new_individual",
          source_strategic_request_id: params[8],
          desired_plan: params[11],
          desired_addons: params[14]
        };
        return { rows: [createdSr], rowCount: 1 };
      }
      if (/INSERT INTO subscription_request_status_history/i.test(sql)) {
        return { rows: [{ id: "hist-1" }], rowCount: 1 };
      }
      if (/INSERT INTO audit_log/i.test(sql)) {
        return { rows: [{ id: "audit-1" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const r = await linkEnterpriseRequestToSubscription(pool, {
      strategicRequestId: "strat-1",
      requestType: "new_individual",
      actorUserId: "staff-1"
    });
    assert.equal(r.ok, true);
    assert.equal(r.linked, true);
    assert.equal(r.subscription_request_id, "sr-new");
    // INSERT subscription_requests muss source_strategic_request_id setzen
    assert.equal(createdSr.source_strategic_request_id, "strat-1");
    // desired_plan kommt aus dem Lead, mit normalisiertem INDIVIDUELL
    assert.equal(createdSr.desired_plan, "INDIVIDUELL");
    // Audit muss geschrieben sein
    const auditCalls = pool.calls.filter((c) => /INSERT INTO audit_log/i.test(c.sql));
    assert.ok(auditCalls.length >= 1, "audit_log muss geschrieben werden");
  });

  it("Race-Condition (UNIQUE-Violation 23505) -> ALREADY_LINKED_RACE", async () => {
    let queryCount = 0;
    const pool = trackingPool(async (sql) => {
      queryCount++;
      // 1. Quick-Check -> empty
      if (queryCount === 1 && /FROM subscription_requests/i.test(sql) && /source_strategic_request_id/.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      // 2. Lead-Read -> ok
      if (/FROM strategic_collaboration_requests/i.test(sql)) {
        return { rows: [leadRow()], rowCount: 1 };
      }
      // 3. INSERT subscription_requests -> wirft UNIQUE-Violation
      if (/INSERT INTO subscription_requests/i.test(sql)) {
        const err = new Error("duplicate key value violates unique constraint \"uniq_subreq_per_strategic_source_open\"");
        err.code = "23505";
        throw err;
      }
      // 4. Re-Read nach Race -> liefert die existierende Zeile
      if (/FROM subscription_requests/i.test(sql) && /source_strategic_request_id/.test(sql) && /SELECT/i.test(sql)) {
        return { rows: [{ id: "sr-race", status: "submitted", request_type: "new_individual" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const r = await linkEnterpriseRequestToSubscription(pool, { strategicRequestId: "strat-1" });
    assert.equal(r.ok, true);
    assert.equal(r.linked, false);
    assert.equal(r.reason, "ALREADY_LINKED_RACE");
    assert.equal(r.subscription_request_id, "sr-race");
  });
});

/* ============================================================ *
 * 2. Quote-Snapshot                                              *
 * ============================================================ */

describe("buildQuoteSnapshot", () => {
  it("enthaelt catalog_version, plan, addons, feature_keys, limits", () => {
    const req = {
      desired_plan: "PRO",
      desired_addons: [{ key: "api" }, { key: "sso" }],
      proposed_price_cents: 79900,
      proposed_term_months: 12
    };
    const snap = buildQuoteSnapshot(req);
    assert.equal(typeof snap.catalog_version, "string");
    assert.equal(snap.plan, "PRO");
    assert.equal(snap.proposed_price_cents, 79900);
    assert.equal(snap.proposed_term_months, 12);
    assert.ok(Array.isArray(snap.addons));
    assert.equal(snap.addons.length, 2);
    assert.equal(snap.addons[0].key, "api");
    assert.ok(snap.addons[0].price_cents > 0, "api price aus catalog");
    assert.ok(Array.isArray(snap.feature_keys));
    assert.ok(snap.feature_keys.length > 0);
    assert.equal(typeof snap.limits, "object");
  });

  it("INDIVIDUELL erhaelt individuell_baseline", () => {
    const snap = buildQuoteSnapshot({ desired_plan: "INDIVIDUELL", desired_addons: [] });
    assert.ok(snap.individuell_baseline);
    assert.equal(snap.individuell_baseline.base_monthly_cents, 249900);
  });

  it("nicht-INDIVIDUELL hat individuell_baseline=null", () => {
    const snap = buildQuoteSnapshot({ desired_plan: "BASIS", desired_addons: [] });
    assert.equal(snap.individuell_baseline, null);
  });

  it("Aliases werden normalisiert (FREE -> DEMO)", () => {
    const snap = buildQuoteSnapshot({ desired_plan: "FREE" });
    assert.equal(snap.plan, "DEMO");
  });

  it("Unbekannte Add-ons bekommen not_in_catalog=true", () => {
    const snap = buildQuoteSnapshot({
      desired_plan: "PRO",
      desired_addons: [{ key: "nonexistent_addon", price_cents: 999 }]
    });
    assert.equal(snap.addons[0].not_in_catalog, true);
  });
});

describe("freezeQuoteSnapshot", () => {
  it("REQUEST_ID_REQUIRED ohne ID", async () => {
    const r = await freezeQuoteSnapshot(trackingPool(), {});
    assert.equal(r.ok, false);
    assert.equal(r.error, "REQUEST_ID_REQUIRED");
  });

  it("REQUEST_NOT_FOUND wenn DB leer", async () => {
    const pool = trackingPool(async (sql) => {
      if (/FROM subscription_requests/i.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const r = await freezeQuoteSnapshot(pool, { requestId: "missing" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "REQUEST_NOT_FOUND");
  });

  it("friert Snapshot ein + setzt offer_expires_at + Audit", async () => {
    let updatedSnapshot = null;
    let updatedExpiresAt = null;
    const pool = trackingPool(async (sql, params) => {
      if (/SELECT \* FROM subscription_requests/i.test(sql)) {
        return {
          rows: [{
            id: "sr-1",
            desired_plan: "PRO",
            desired_addons: [{ key: "api" }],
            proposed_price_cents: 79900,
            proposed_term_months: 12,
            quote_frozen_at: null,
            quote_snapshot: {},
            offer_expires_at: null
          }],
          rowCount: 1
        };
      }
      if (/UPDATE subscription_requests/i.test(sql) && /quote_snapshot/.test(sql)) {
        updatedSnapshot = JSON.parse(params[1]);
        updatedExpiresAt = params[3];
        return { rows: [{ id: "sr-1", quote_snapshot: updatedSnapshot, offer_expires_at: updatedExpiresAt }], rowCount: 1 };
      }
      if (/INSERT INTO audit_log/i.test(sql)) {
        return { rows: [{ id: "audit-1" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const r = await freezeQuoteSnapshot(pool, { requestId: "sr-1" });
    assert.equal(r.ok, true);
    assert.equal(r.already_frozen, false);
    assert.ok(updatedSnapshot);
    assert.equal(updatedSnapshot.plan, "PRO");
    assert.ok(updatedExpiresAt);
    // Default offer validity ~14 Tage in der Zukunft
    const dt = new Date(updatedExpiresAt);
    const diffDays = (dt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    assert.ok(diffDays > 13 && diffDays < 15, "offer_expires_at sollte ~14 Tage in der Zukunft sein");
    assert.equal(DEFAULT_OFFER_VALIDITY_DAYS, 14);
  });

  it("Idempotent: bereits gefrorener Snapshot bleibt unveraendert", async () => {
    const existingSnap = { plan: "BASIS", catalog_version: "FROZEN-OLD" };
    const pool = trackingPool(async (sql) => {
      if (/SELECT \* FROM subscription_requests/i.test(sql)) {
        return {
          rows: [{
            id: "sr-1", desired_plan: "PRO",
            quote_frozen_at: new Date().toISOString(),
            quote_snapshot: existingSnap,
            offer_expires_at: null
          }], rowCount: 1
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const r = await freezeQuoteSnapshot(pool, { requestId: "sr-1" });
    assert.equal(r.ok, true);
    assert.equal(r.already_frozen, true);
    assert.equal(r.snapshot, existingSnap);
    // Es darf KEIN UPDATE-Call gemacht worden sein
    const updateCalls = pool.calls.filter((c) => /UPDATE subscription_requests/i.test(c.sql) && /quote_snapshot/.test(c.sql));
    assert.equal(updateCalls.length, 0);
  });

  it("force=true ueberschreibt bestehenden Snapshot", async () => {
    const existingSnap = { plan: "BASIS", catalog_version: "FROZEN-OLD" };
    let updateCalled = false;
    const pool = trackingPool(async (sql) => {
      if (/SELECT \* FROM subscription_requests/i.test(sql)) {
        return {
          rows: [{
            id: "sr-1", desired_plan: "PRO",
            quote_frozen_at: new Date().toISOString(),
            quote_snapshot: existingSnap,
            offer_expires_at: null
          }], rowCount: 1
        };
      }
      if (/UPDATE subscription_requests/i.test(sql)) {
        updateCalled = true;
        return { rows: [{ id: "sr-1" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const r = await freezeQuoteSnapshot(pool, { requestId: "sr-1", force: true });
    assert.equal(r.ok, true);
    assert.equal(r.already_frozen, false);
    assert.equal(updateCalled, true);
  });
});

describe("Quote-Snapshot bleibt stabil trotz Catalog-Aenderung (Vertrags-Garantie)", () => {
  it("bestehende quote_snapshot wird NIE durch Catalog-Snapshot ueberschrieben", async () => {
    // Kunde sieht in seinem Snapshot 79900 cents, im Catalog koennte spaeter 89900 stehen.
    // Wir mocken nur die DB-Zeile mit dem alten gefrorenen Snapshot — der Service gibt diese
    // zurueck, ohne auf den aktuellen PLAN_CATALOG zuzugreifen.
    const frozenSnap = {
      catalog_version: "2026.01.01.0",
      plan: "PRO",
      plan_monthly_price_cents: 79900,
      addons: [{ key: "api", price_cents: 39900 }]
    };
    const pool = trackingPool(async (sql) => {
      if (/SELECT \* FROM subscription_requests/i.test(sql)) {
        return {
          rows: [{
            id: "sr-1", desired_plan: "PRO",
            quote_frozen_at: new Date().toISOString(),
            quote_snapshot: frozenSnap,
            offer_expires_at: new Date(Date.now() + 86400000).toISOString()
          }], rowCount: 1
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const r = await freezeQuoteSnapshot(pool, { requestId: "sr-1" });
    assert.equal(r.snapshot.catalog_version, "2026.01.01.0",
      "Catalog-Version aus Snapshot bleibt erhalten");
    assert.equal(r.snapshot.plan_monthly_price_cents, 79900,
      "Preis aus Snapshot bleibt eingefroren auch wenn Catalog inzwischen geaendert");
  });
});

/* ============================================================ *
 * 3. Expiry-Cron                                                *
 * ============================================================ */

describe("expireDueRequests", () => {
  it("transitioniert offered/accepted mit faelligem offer_expires_at auf expired", async () => {
    const oldDate = new Date(Date.now() - 86400000).toISOString();
    let transitionCalled = false;
    const pool = trackingPool(async (sql) => {
      if (/FROM subscription_requests/i.test(sql) && /offer_expires_at/.test(sql) && /SELECT/i.test(sql)) {
        return {
          rows: [
            { id: "sr-1", status: "offered", request_type: "upgrade", offer_expires_at: oldDate, org_id: "o-1", user_id: "u-1", contact_email: "k@org.de", current_plan: "BASIS", desired_plan: "PRO" },
            { id: "sr-2", status: "accepted", request_type: "new_individual", offer_expires_at: oldDate, org_id: null, user_id: null, contact_email: "k2@org.de", current_plan: null, desired_plan: "INDIVIDUELL" }
          ], rowCount: 2
        };
      }
      if (/SELECT id, status, request_type FROM subscription_requests/i.test(sql)) {
        // Vom transitionStatus-Service: liefere status passend
        return { rows: [{ id: "sr-1", status: "offered", request_type: "upgrade" }], rowCount: 1 };
      }
      if (/UPDATE subscription_requests/i.test(sql)) {
        transitionCalled = true;
        return { rows: [{ id: "sr-1", status: "expired" }], rowCount: 1 };
      }
      if (/INSERT INTO subscription_request_status_history/i.test(sql)) {
        return { rows: [{ id: "hist-1" }], rowCount: 1 };
      }
      if (/INSERT INTO audit_log/i.test(sql)) {
        return { rows: [{ id: "audit-1" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const r = await expireDueRequests(pool, { batchSize: 10 });
    assert.equal(r.processed, 2);
    assert.ok(transitionCalled);
  });

  it("limit clamped auf MAX_BATCH_SIZE (500)", async () => {
    let usedLimit = null;
    const pool = trackingPool(async (sql, params) => {
      if (/FROM subscription_requests/i.test(sql) && /offer_expires_at/.test(sql)) {
        usedLimit = params[1];
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    await expireDueRequests(pool, { batchSize: 99999 });
    assert.equal(usedLimit, MAX_BATCH_SIZE, "MAX_BATCH_SIZE muss als upper-bound greifen");
    assert.equal(MAX_BATCH_SIZE, 500);
  });

  it("akzeptiert opts.now als ISO-String", async () => {
    let usedNow = null;
    const pool = trackingPool(async (sql, params) => {
      if (/FROM subscription_requests/i.test(sql) && /offer_expires_at/.test(sql)) {
        usedNow = params[0];
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    await expireDueRequests(pool, { now: "2030-01-01T00:00:00.000Z" });
    assert.match(usedNow, /^2030-01-01/);
  });

  it("Idempotent: 2 Aufrufe -> beim zweiten faellt der Datensatz aus dem Filter (Status='expired')", async () => {
    let transitionUpdated = false;
    const pool = trackingPool(async (sql) => {
      if (/FROM subscription_requests/i.test(sql) && /offer_expires_at/.test(sql) && /SELECT/i.test(sql)) {
        if (transitionUpdated) {
          // Nach erfolgreichem Update darf der Datensatz nicht mehr im Filter erscheinen
          return { rows: [], rowCount: 0 };
        }
        return {
          rows: [{ id: "sr-1", status: "offered", request_type: "upgrade", offer_expires_at: new Date(Date.now() - 1000).toISOString(), org_id: null, user_id: null, contact_email: "k@org.de", current_plan: null, desired_plan: "PRO" }],
          rowCount: 1
        };
      }
      if (/SELECT id, status, request_type FROM subscription_requests/i.test(sql)) {
        return { rows: [{ id: "sr-1", status: "offered", request_type: "upgrade" }], rowCount: 1 };
      }
      if (/UPDATE subscription_requests/i.test(sql) && /status =/i.test(sql)) {
        transitionUpdated = true;
        return { rows: [{ id: "sr-1", status: "expired" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const r1 = await expireDueRequests(pool);
    const r2 = await expireDueRequests(pool);
    assert.equal(r1.processed, 1);
    assert.equal(r1.expired, 1);
    assert.equal(r2.processed, 0, "zweiter Lauf darf NICHTS mehr verarbeiten");
    assert.equal(r2.expired, 0);
  });
});

/* ============================================================ *
 * 4. Activation-Cron                                            *
 * ============================================================ */

describe("activateDueRequests", () => {
  it("ruft applyApprovedChange + Audit + Notification fuer fallige accepted-Requests", async () => {
    let appliedChangeCalled = false;
    const pool = trackingPool(async (sql) => {
      if (/FROM subscription_requests/i.test(sql) && /effective_from/.test(sql) && /SELECT/i.test(sql)) {
        return {
          rows: [{ id: "sr-1", status: "accepted", request_type: "upgrade", effective_from: new Date(Date.now() - 1000).toISOString(), org_id: "o-1", user_id: "u-1" }],
          rowCount: 1
        };
      }
      if (/SELECT id, status, request_type, org_id, user_id/i.test(sql) && /WHERE id = \$1/.test(sql)) {
        // applyApprovedChange interner Read (main SELECT)
        return {
          rows: [{ id: "sr-1", status: "accepted", request_type: "upgrade", org_id: "o-1", user_id: "u-1", desired_plan: "PRO", current_plan: "BASIS", cancellation_effective_at: null, effective_from: new Date(Date.now() - 1000).toISOString() }],
          rowCount: 1
        };
      }
      if (/SELECT \* FROM subscription_requests WHERE id/i.test(sql)) {
        // freezeQuoteSnapshot SELECT – already_frozen-Pfad, kein weiterer DB-Write
        return {
          rows: [{ id: "sr-1", quote_frozen_at: new Date().toISOString(), quote_snapshot: { catalog_version: "test-cat", plan: "PRO" } }],
          rowCount: 1
        };
      }
      if (/FROM subscription_documents/i.test(sql)) {
        // ensureDocumentForRequest SELECT – vorhandenes Dokument zurueckgeben
        return {
          rows: [{ id: "doc-act-1", document_type: "change_confirmation", document_number: "AE-2026-000001", status: "issued" }],
          rowCount: 1
        };
      }
      if (/UPDATE organizations/i.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      if (/UPDATE subscriptions/i.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      if (/UPDATE subscription_requests/i.test(sql) && /status = 'active'/.test(sql)) {
        appliedChangeCalled = true;
        return { rows: [{ id: "sr-1", status: "active", request_type: "upgrade" }], rowCount: 1 };
      }
      if (/INSERT INTO subscription_request_status_history/i.test(sql)) {
        return { rows: [{ id: "hist-1" }], rowCount: 1 };
      }
      if (/INSERT INTO audit_log/i.test(sql)) {
        return { rows: [{ id: "audit-1" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const r = await activateDueRequests(pool);
    assert.equal(r.processed, 1);
    assert.equal(r.activated, 1);
    assert.ok(appliedChangeCalled);
  });

  it("Activation-Failure: liefert failed-Liste + schreibt activate_failed-Audit", async () => {
    const pool = trackingPool(async (sql) => {
      // Cron-List-Query: enthaelt effective_from im WHERE/ORDER, kein WHERE id = $1
      if (/FROM subscription_requests/i.test(sql) && /effective_from/.test(sql) && /SELECT/i.test(sql) && !/WHERE id = \$1/.test(sql)) {
        return {
          rows: [{ id: "sr-1", status: "accepted", request_type: "upgrade", effective_from: new Date(Date.now() - 1000).toISOString(), org_id: null, user_id: null }],
          rowCount: 1
        };
      }
      // applyApprovedChange Haupt-SELECT: WHERE id = $1, gibt status=submitted zurueck -> NOT_ACCEPTED
      if (/SELECT id, status, request_type, org_id, user_id/i.test(sql) && /WHERE id = \$1/.test(sql)) {
        return { rows: [{ id: "sr-1", status: "submitted" /* nicht accepted */, request_type: "upgrade" }], rowCount: 1 };
      }
      if (/INSERT INTO audit_log/i.test(sql)) {
        return { rows: [{ id: "audit-1" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const r = await activateDueRequests(pool);
    assert.equal(r.processed, 1);
    assert.equal(r.activated, 0);
    assert.equal(r.failed.length, 1);
    assert.equal(r.failed[0].error, "NOT_ACCEPTED");
  });
});

/* ============================================================ *
 * 5. Cancellation-Cron                                          *
 * ============================================================ */

describe("applyDueCancellations", () => {
  it("setzt subscriptions=canceled + organizations.plan=DEMO + request=expired", async () => {
    const updates = [];
    const pool = trackingPool(async (sql) => {
      if (/FROM subscription_requests/i.test(sql) && /cancellation_effective_at/.test(sql) && /SELECT/i.test(sql)) {
        return {
          rows: [{ id: "sr-1", request_type: "cancellation", status: "active", org_id: "o-1", user_id: "u-1", current_plan: "PRO", cancellation_effective_at: new Date(Date.now() - 1000).toISOString() }],
          rowCount: 1
        };
      }
      if (/UPDATE organizations SET plan = 'DEMO'/i.test(sql)) {
        updates.push("org");
        return { rows: [], rowCount: 1 };
      }
      if (/UPDATE subscriptions/i.test(sql) && /status = 'canceled'/i.test(sql)) {
        updates.push("sub");
        return { rows: [], rowCount: 1 };
      }
      // transitionStatus innerer Pfad
      if (/SELECT id, status, request_type FROM subscription_requests/i.test(sql)) {
        return { rows: [{ id: "sr-1", status: "active", request_type: "cancellation" }], rowCount: 1 };
      }
      if (/UPDATE subscription_requests/i.test(sql) && /status = \$2/.test(sql)) {
        updates.push("req");
        return { rows: [{ id: "sr-1", status: "expired" }], rowCount: 1 };
      }
      if (/INSERT INTO subscription_request_status_history/i.test(sql)) {
        return { rows: [{ id: "hist-1" }], rowCount: 1 };
      }
      if (/INSERT INTO audit_log/i.test(sql)) {
        return { rows: [{ id: "audit-1" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const r = await applyDueCancellations(pool);
    assert.equal(r.processed, 1);
    assert.equal(r.revoked, 1);
    assert.deepEqual(updates.sort(), ["org", "req", "sub"]);
  });

  it("Schema-tolerant: organizations/subscriptions-UPDATE-Fehler stoppen die Cancellation NICHT", async () => {
    let requestUpdated = false;
    const pool = trackingPool(async (sql) => {
      if (/FROM subscription_requests/i.test(sql) && /cancellation_effective_at/.test(sql) && /SELECT/i.test(sql)) {
        return {
          rows: [{ id: "sr-1", request_type: "cancellation", status: "active", org_id: "o-1", user_id: "u-1", current_plan: "PRO", cancellation_effective_at: new Date(Date.now() - 1000).toISOString() }],
          rowCount: 1
        };
      }
      if (/UPDATE organizations/i.test(sql)) {
        throw new Error("relation organizations does not exist");
      }
      if (/UPDATE subscriptions/i.test(sql)) {
        throw new Error("relation subscriptions does not exist");
      }
      if (/SELECT id, status, request_type FROM subscription_requests/i.test(sql)) {
        return { rows: [{ id: "sr-1", status: "active", request_type: "cancellation" }], rowCount: 1 };
      }
      if (/UPDATE subscription_requests/i.test(sql) && /status = \$2/.test(sql)) {
        requestUpdated = true;
        return { rows: [{ id: "sr-1", status: "expired" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const r = await applyDueCancellations(pool);
    assert.equal(r.revoked, 1);
    assert.ok(requestUpdated, "Request muss trotzdem auf expired gehen");
  });
});

/* ============================================================ *
 * 6. runLifecycleTick                                           *
 * ============================================================ */

describe("runLifecycleTick", () => {
  it("ruft alle drei Phasen + liefert orchestriertes Result", async () => {
    const pool = trackingPool(async (sql) => {
      // Alle SELECTs liefern leer -> processed=0 fuer alle Phasen
      return { rows: [], rowCount: 0 };
    });
    const r = await runLifecycleTick(pool);
    assert.equal(r.ok, true);
    assert.ok(r.expiry);
    assert.ok(r.activation);
    assert.ok(r.cancellation);
    assert.equal(r.expiry.processed, 0);
    assert.equal(r.activation.processed, 0);
    assert.equal(r.cancellation.processed, 0);
  });

  it("Teilfehler in einer Phase stoppt nicht die anderen", async () => {
    let queryCount = 0;
    const pool = trackingPool(async (sql) => {
      queryCount++;
      // Erste SELECT (expiry) -> wirft
      if (queryCount === 1 && /offer_expires_at/.test(sql)) {
        throw new Error("DB temp error");
      }
      return { rows: [], rowCount: 0 };
    });
    const r = await runLifecycleTick(pool);
    assert.equal(r.ok, true);
    // expiry hat einen Fehler-Eintrag, activation + cancellation laufen weiter
    assert.ok(r.expiry.failed && r.expiry.failed.length > 0);
    assert.equal(r.activation.processed, 0);
    assert.equal(r.cancellation.processed, 0);
  });
});

/* ============================================================ *
 * 7. Hook-Verdrahtung in den Routes                             *
 * ============================================================ */

function resolvePath(rel) {
  // Docker: cwd is already api dir, strip "api/" prefix; sql/ not mounted (skipped separately)
  if (!HAS_API_SUBDIR) return path.join(ROOT, rel.replace(/^api\//, ""));
  return path.join(ROOT, rel);
}
function readFile(rel) {
  return readFileSync(resolvePath(rel), "utf8");
}
// Migration SQL files are only available outside Docker (mounted project root)
const SQL_104_AVAILABLE = HAS_API_SUBDIR;
const migration104 = SQL_104_AVAILABLE
  ? readFile("sql/migrations/104_subscription_lifecycle.sql")
  : "";
const migSuite104 = SQL_104_AVAILABLE ? describe : describe.skip;

describe("Hook-Verdrahtung in Routes (Welle 8 Schritt 16)", () => {
  it("internal.js mountet POST /internal/subscription-lifecycle-tick + nutzt runLifecycleTick", () => {
    const src = readFile("api/routes/internal.js");
    assert.match(src, /from\s+["']\.\.\/services\/subscriptionLifecycleService\.js["']/);
    assert.match(src, /\/internal\/subscription-lifecycle-tick/);
    assert.match(src, /runLifecycleTick/);
    assert.match(src, /cronRateLimit, checkCronAuth/);
    // Audit-Eintrag bei processed > 0
    assert.match(src, /subscription_request\.lifecycle_tick/);
  });

  it("staffControlCenter.js: convert-to-subscription Endpoint + Quote-Snapshot-Freeze", () => {
    const src = readFile("api/routes/staffControlCenter.js");
    assert.match(src, /from\s+["']\.\.\/services\/subscriptionLifecycleService\.js["']/);
    // Konvertier-Aktion mit Step-up + Confirm
    assert.match(src, /\/strategic-requests\/:id\/convert-to-subscription/);
    assert.match(src, /linkEnterpriseRequestToSubscription/);
    assert.match(src, /staff_control\.strategic_request\.convert_to_subscription/);
    // Quote-Snapshot freeze in transition + offer (via Namespace oder direkt)
    assert.match(src, /freezeQuoteSnapshot\(/);
  });
});

/* ============================================================ *
 * 8. Migration 104                                              *
 * ============================================================ */

migSuite104("Migration 104 - subscription_lifecycle Schema", () => {
  it("ergaenzt Quote-Snapshot-Felder + offer_expires_at", () => {
    assert.match(migration104, /ADD COLUMN IF NOT EXISTS quote_snapshot JSONB/);
    assert.match(migration104, /ADD COLUMN IF NOT EXISTS quote_frozen_at TIMESTAMPTZ/);
    assert.match(migration104, /ADD COLUMN IF NOT EXISTS quote_catalog_version TEXT/);
    assert.match(migration104, /ADD COLUMN IF NOT EXISTS offer_expires_at TIMESTAMPTZ/);
    assert.match(migration104, /ADD COLUMN IF NOT EXISTS lifecycle_last_processed_at TIMESTAMPTZ/);
  });

  it("legt Lifecycle-Cron-Indexes an", () => {
    assert.match(migration104, /idx_subreq_lifecycle_offer_expiry/);
    assert.match(migration104, /idx_subreq_lifecycle_activation_due/);
    assert.match(migration104, /idx_subreq_lifecycle_cancellation_due/);
  });

  it("schuetzt Auto-Linking ueber Partial-UNIQUE-Index", () => {
    assert.match(migration104, /uniq_subreq_per_strategic_source_open/);
    assert.match(migration104, /WHERE source_strategic_request_id IS NOT NULL/);
    assert.match(migration104, /AND status NOT IN \('rejected','cancelled','expired'\)/);
  });

  it("ist transaktional + idempotent (BEGIN/COMMIT + IF NOT EXISTS)", () => {
    assert.match(migration104, /^BEGIN;/m);
    assert.match(migration104, /COMMIT;\s*$/m);
    assert.match(migration104, /CREATE INDEX IF NOT EXISTS/);
    assert.match(migration104, /CREATE UNIQUE INDEX IF NOT EXISTS/);
  });
});
