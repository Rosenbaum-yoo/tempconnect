/**
 * Entitlement-Leak-Gates — Route-Wiring + Verhalten.
 *
 * Verifiziert die in der Tarif-Auditierung geschlossenen INDIVIDUELL-Leaks:
 *   - reporting.js  : enterprise_analytics  auf /reporting/dashboard + /reporting/finance-truth/export
 *   - assignments.js: assignments           NUR auf den kaeufer-exklusiven Schreibpfaden
 *                     (POST /assignments, PATCH /assignments/:id)
 *
 * Kernzusicherungen:
 *   (a) Tarif unterhalb INDIVIDUELL (PRO, aktives Abo) -> 403 FEATURE_NOT_ENABLED
 *   (b) INDIVIDUELL (Vertragskunde)                    -> Gate ruft next()  (kein Block)
 *   (c) DEMO + aktiver Pilot (effective_plan=INDIVIDUELL) -> Gate ruft next() (Pilot behaelt Zugang)
 *   (d) Zweiseitige Pfade (view/transition/complete) tragen KEIN Gate -> Agentur/Lieferant bleibt offen
 *
 * Run: node --test --test-force-exit test/entitlementLeakGates.route.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createReportingRouter } from "../routes/reporting.js";
import { createAssignmentsRouter } from "../routes/assignments.js";

// Diese Suite verifiziert das ENFORCE-Verhalten der Entitlement-Gates.
// Im Docker/Dev ist FEATURE_GATE_BYPASS=true gesetzt — planFeatures.js gibt dann
// pauschal true zurueck, das Gate liesse PRO faelschlich durch und die 403-Tests
// schluegen fehl (kein echter Defekt, nur der Dev-Bypass). Wir pinnen den
// Enforce-Modus fuer die Dauer dieser Datei, damit sie unabhaengig vom
// Umgebungswert deterministisch gruen ist (Prod verbietet den Bypass ohnehin).
let __prevGateBypass;
before(() => {
  __prevGateBypass = process.env.FEATURE_GATE_BYPASS;
  process.env.FEATURE_GATE_BYPASS = "false";
});
after(() => {
  if (__prevGateBypass === undefined) delete process.env.FEATURE_GATE_BYPASS;
  else process.env.FEATURE_GATE_BYPASS = __prevGateBypass;
});

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

const requireAuth = (_req, _res, next) => next();

function baseDeps(pool) {
  return { pool, requireAuth, logger: mockLogger() };
}

function mockReq(overrides = {}) {
  return {
    session: { userId: "user-1" },
    params: {},
    query: {},
    body: {},
    orgId: "org-1",
    ...overrides
  };
}

function mockRes() {
  const res = {
    _status: 200,
    _json: null,
    locals: {},
    status(code) { res._status = code; return res; },
    json(data) { res._json = data; return res; },
    send(data) { res._json = data; return res; }
  };
  return res;
}

/**
 * Inhaltsbasierter Mock-Pool fuer getOrganizationEntitlements (robust gegen
 * Query-Anzahl/Reihenfolge — der Guard laedt den Snapshot zweimal).
 * Reihenfolge der Checks ist relevant: loadActiveAddons-Query enthaelt sowohl
 * `org_active_addons` als auch `subscription_requests`, daher Addons ZUERST.
 */
function entitlementPool(orgRow, subRow) {
  return {
    query: async (sql) => {
      const s = String(sql);
      if (/FROM organizations WHERE id/.test(s)) return { rows: [orgRow] };
      if (/org_active_addons|active_live/.test(s)) return { rows: [] };
      if (/FROM subscription_requests/.test(s)) return { rows: [] };
      if (/role_key = 'owner'/.test(s)) return { rows: [{ id: "owner-1", email: "owner@x.de" }] };
      if (/FROM subscriptions/.test(s)) return { rows: subRow ? [subRow] : [] };
      return { rows: [] };
    }
  };
}

const FUTURE = new Date(Date.now() + 86400000).toISOString();

// PRO-Unternehmen mit aktivem Abo (Leak-Fall: darf das INDIVIDUELL-Feature NICHT nutzen)
function proPool() {
  return entitlementPool(
    { id: "org-1", name: "Acme", type: "company", plan: "PRO", pilot_status: null, billing_mode: "self_service" },
    { status: "active", plan: "PRO", current_period_end: FUTURE }
  );
}
// INDIVIDUELL-Vertragskunde
function individuellPool() {
  return entitlementPool(
    { id: "org-1", name: "Acme", type: "company", plan: "INDIVIDUELL", pilot_status: null, billing_mode: "individual_contract" },
    null
  );
}
// DEMO mit aktivem Pilot -> effective_plan INDIVIDUELL
function demoPilotPool() {
  return entitlementPool(
    { id: "org-1", name: "Acme", type: "company", plan: "DEMO", pilot_status: "active", billing_mode: "self_service" },
    null
  );
}

/** Liefert den vollstaendigen Middleware-Stack einer Route (exakter Pfad-Match). */
function routeStack(router, method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (Object.keys(layer.route.methods)[0] === method && layer.route.path === path) {
      return layer.route.stack.map((s) => s.handle);
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}

/** Fuehrt eine einzelne Middleware aus und meldet, ob next() aufgerufen wurde. */
async function runMiddleware(mw, req) {
  const res = mockRes();
  let nextCalled = false;
  let nextErr = null;
  await mw(req, res, (err) => { nextCalled = true; if (err) nextErr = err; });
  return { res, nextCalled, nextErr };
}

/* ── reporting.js: enterprise_analytics ─────────────────────────── */

describe("reporting.js — enterprise_analytics Gate", () => {
  // Gate sitzt direkt hinter requireAuth (Index 1), gemaess spendAnalytics-Muster.
  const GATED = ["/reporting/dashboard", "/reporting/finance-truth/export"];

  for (const path of GATED) {
    it(`GET ${path}: PRO-Tarif -> 403 FEATURE_NOT_ENABLED`, async () => {
      const router = createReportingRouter(baseDeps(proPool()));
      const gate = routeStack(router, "get", path)[1];
      const { res, nextCalled } = await runMiddleware(gate, mockReq());
      assert.equal(nextCalled, false, "Gate darf bei PRO nicht durchlassen");
      assert.equal(res._status, 403);
      assert.equal(res._json.error.code, "FEATURE_NOT_ENABLED");
      assert.equal(res._json.error.feature, "enterprise_analytics");
      assert.equal(res._json.error.plan, "PRO");
    });

    it(`GET ${path}: INDIVIDUELL -> Gate ruft next()`, async () => {
      const router = createReportingRouter(baseDeps(individuellPool()));
      const gate = routeStack(router, "get", path)[1];
      const { res, nextCalled } = await runMiddleware(gate, mockReq());
      assert.equal(nextCalled, true);
      assert.equal(res._status, 200);
    });

    it(`GET ${path}: DEMO+Pilot -> Gate ruft next() (Pilot behaelt Zugang)`, async () => {
      const router = createReportingRouter(baseDeps(demoPilotPool()));
      const gate = routeStack(router, "get", path)[1];
      const { res, nextCalled } = await runMiddleware(gate, mockReq());
      assert.equal(nextCalled, true);
      assert.equal(res._status, 200);
    });
  }

  it("operationale Reports tragen KEIN enterprise_analytics-Gate", () => {
    const router = createReportingRouter(baseDeps(proPool()));
    // [requireAuth, rperm, handler] = 3 (kein Gate eingezogen)
    assert.equal(routeStack(router, "get", "/reporting/requisitions").length, 3);
    assert.equal(routeStack(router, "get", "/reporting/sla").length, 3);
    assert.equal(routeStack(router, "get", "/reporting/compliance").length, 3);
    // Executive-Routen tragen das Gate zusaetzlich.
    assert.equal(routeStack(router, "get", "/reporting/dashboard").length, 5);
    assert.equal(routeStack(router, "get", "/reporting/finance-truth/export").length, 5);
  });
});

/* ── assignments.js: assignments (nur Kaeufer-Schreibpfade) ──────── */

describe("assignments.js — assignments Gate (Kaeufer-Schreibpfade)", () => {
  it("POST /assignments: PRO-Tarif -> 403 FEATURE_NOT_ENABLED", async () => {
    const router = createAssignmentsRouter(baseDeps(proPool()));
    const gate = routeStack(router, "post", "/assignments")[2];
    const { res, nextCalled } = await runMiddleware(gate, mockReq());
    assert.equal(nextCalled, false);
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "FEATURE_NOT_ENABLED");
    assert.equal(res._json.error.feature, "assignments");
  });

  it("POST /assignments: INDIVIDUELL -> next()", async () => {
    const router = createAssignmentsRouter(baseDeps(individuellPool()));
    const gate = routeStack(router, "post", "/assignments")[2];
    const { nextCalled } = await runMiddleware(gate, mockReq());
    assert.equal(nextCalled, true);
  });

  it("POST /assignments: DEMO+Pilot -> next() (Pilot behaelt Zugang)", async () => {
    const router = createAssignmentsRouter(baseDeps(demoPilotPool()));
    const gate = routeStack(router, "post", "/assignments")[2];
    const { nextCalled } = await runMiddleware(gate, mockReq());
    assert.equal(nextCalled, true);
  });

  it("PATCH /assignments/:id: PRO-Tarif -> 403 FEATURE_NOT_ENABLED", async () => {
    const router = createAssignmentsRouter(baseDeps(proPool()));
    const gate = routeStack(router, "patch", "/assignments/:id")[2];
    const { res, nextCalled } = await runMiddleware(gate, mockReq());
    assert.equal(nextCalled, false);
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "FEATURE_NOT_ENABLED");
  });

  it("zweiseitige Pfade (view/transition/complete) tragen KEIN Gate", () => {
    const router = createAssignmentsRouter(baseDeps(proPool()));
    // [requireAuth, requireScope, rperm, handler] = 4 -> kein Entitlement-Gate
    // (requireScope = API-Key-Scope-Guard, KEIN Entitlement-Gate; durchlaesst Session-Auth.)
    assert.equal(routeStack(router, "get", "/assignments").length, 4, "GET /assignments offen (Lieferantensicht)");
    assert.equal(routeStack(router, "get", "/assignments/:id").length, 4);
    assert.equal(routeStack(router, "post", "/assignments/:id/transition").length, 4, "transition zweiseitig");
    assert.equal(routeStack(router, "post", "/assignments/:id/complete").length, 4, "complete zweiseitig");
    // Kaeufer-Schreibpfade tragen das assignmentsGate zusaetzlich (+1 -> 5).
    assert.equal(routeStack(router, "post", "/assignments").length, 5);
    assert.equal(routeStack(router, "patch", "/assignments/:id").length, 5);
  });
});
