/**
 * POST /api/enterprise-request route tests.
 *
 * Verifiziert:
 *   - Public-Submission ohne Session ist moeglich (kein 401).
 *   - Eingeloggte Anfrage uebernimmt user_id + org_id.
 *   - Komplette Konfiguration (plan, addons, seats, estimates, expected_start)
 *     landet in den passenden DB-Spalten.
 *   - Validation -> 400, Rate-Limit -> 429, Duplikat -> 409.
 *   - res.locals.audit wird in jedem Pfad gesetzt.
 *
 * Run: node --test --test-force-exit api/test/enterpriseRequest.route.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createStrategicCollaborationRouter } from "../routes/strategicCollaboration.js";

// ── Test-Helper ────────────────────────────────────────────────

function sequencePool(...responses) {
  let idx = 0;
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (idx >= responses.length) {
        throw new Error(`Unexpected query #${idx + 1}: ${String(sql).slice(0, 80)}`);
      }
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

function mockReq(overrides = {}) {
  return {
    session: null,
    headers: { "user-agent": "node-test/1.0" },
    ip: "127.0.0.1",
    body: {},
    orgId: null,
    ...overrides
  };
}

function mockRes() {
  const res = {
    _status: 200,
    _json: null,
    locals: {},
    status(code) { res._status = code; return res; },
    json(data) { res._json = data; return res; }
  };
  return res;
}

const requireAuth = (_req, _res, next) => next();

function findHandler(router, method, pathFragment) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    const routePath = layer.route.path;
    const routeMethod = Object.keys(layer.route.methods)[0];
    if (routeMethod === method && routePath.includes(pathFragment)) {
      const handlers = layer.route.stack.map((s) => s.handle);
      return handlers[handlers.length - 1];
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${pathFragment} not found`);
}

function basePayload(overrides = {}) {
  return {
    company: "ACME GmbH",
    contact: "Max Mustermann",
    email: "max@acme.test",
    phone: "+49 30 1234567",
    plan: "ENTERPRISE",
    base_price: 2499,
    seats: 60,
    seats_included: 50,
    extra_seat_price: 29,
    monthly_estimate: 2789,
    onetime_estimate: 0,
    addons: [{ id: "api", name: "API-Zugang", price: 399, type: "monthly" }],
    expected_start: "2026-06-01",
    notes: "Bitte Demo-Termin",
    ...overrides
  };
}

// ── Public-Submission ──────────────────────────────────────────

describe("POST /api/enterprise-request — public submission", () => {
  it("speichert public Anfrage ohne Session (201)", async () => {
    const insertedRow = {
      id: "req-public-1",
      status: "eingegangen",
      request_type: "enterprise_config",
      created_at: new Date().toISOString(),
      plan_requested: "INDIVIDUELL"
    };
    const pool = sequencePool(
      { rows: [{ cnt: 0 }] },         // burst
      { rows: [] },                   // duplicate
      { rows: [insertedRow] },        // INSERT
      { rows: [{ n: 11 }] },          // cost_preview nextval
      { rows: [{ id: "doc-public-1", document_type: "cost_preview", document_number: "KV-2026-000011", format: "html" }] }
    );
    const router = createStrategicCollaborationRouter({ pool, requireAuth });
    const handler = findHandler(router, "post", "/enterprise-request");

    const req = mockReq({ body: basePayload() });
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 201);
    assert.equal(res._json.success, true);
    assert.equal(res._json.captured, true);
    assert.equal(res._json.data.id, "req-public-1");
    assert.equal(res._json.data.request_type, "enterprise_config");
    assert.equal(res._json.data.cost_preview_document.id, "doc-public-1");
    assert.match(res._json.data.cost_preview_document.download_url, /\/api\/subscription-documents\/doc-public-1\/public-download/);
    const docInsert = pool.calls.find((c) => /INSERT INTO subscription_documents/i.test(c.sql));
    assert.equal(docInsert.params[2], null, "Enterprise-Kostenvorschau bleibt public/orgless");
    // Audit-Marker fuer persisted Pfad
    assert.equal(res.locals.audit.action, "enterprise.request_submit_persisted");
    assert.equal(res.locals.audit.details.logged_in, false);
  });

  it("uebersetzt ENTERPRISE -> INDIVIDUELL und schreibt cents", async () => {
    const pool = sequencePool(
      { rows: [{ cnt: 0 }] },
      { rows: [] },
      { rows: [{ id: "x", status: "eingegangen", request_type: "enterprise_config" }] },
      { rows: [{ n: 12 }] },
      { rows: [{ id: "doc-x", document_type: "cost_preview", document_number: "KV-2026-000012", format: "html" }] }
    );
    const router = createStrategicCollaborationRouter({ pool, requireAuth });
    const handler = findHandler(router, "post", "/enterprise-request");
    const req = mockReq({ body: basePayload() });
    const res = mockRes();

    await handler(req, res);

    const insertCall = pool.calls[2];
    assert.match(insertCall.sql, /INSERT INTO strategic_collaboration_requests/);
    // INSERT params (Service): siehe Reihenfolge in createEnterpriseRequest.
    // params[19] -> plan_requested (Index 19 da 0-basiert, $20 in SQL).
    const params = insertCall.params;
    const planIdx = params.indexOf("INDIVIDUELL");
    assert.notEqual(planIdx, -1, "plan_requested INDIVIDUELL muss in params vorkommen");
    // base_price 2499 EUR -> 249900 cents muss enthalten sein
    assert.ok(params.includes(249900), "base_price_cents=249900 fehlt");
    // monthly_estimate 2789 EUR -> 278900 cents
    assert.ok(params.includes(278900), "monthly_estimate_cents=278900 fehlt");
    // seats_requested 60
    assert.ok(params.includes(60), "seats_requested=60 fehlt");
  });
});

// ── Eingeloggte Submission ─────────────────────────────────────

describe("POST /api/enterprise-request — logged-in submission", () => {
  it("uebernimmt user/org context wenn Session vorhanden", async () => {
    const pool = sequencePool(
      { rows: [{ cnt: 0 }] },
      { rows: [] },
      { rows: [{ id: "req-logged-1", status: "eingegangen", request_type: "enterprise_config" }] },
      { rows: [{ n: 13 }] },
      { rows: [{ id: "doc-logged-1", document_type: "cost_preview", document_number: "KV-2026-000013", format: "html" }] }
    );
    const router = createStrategicCollaborationRouter({ pool, requireAuth });
    const handler = findHandler(router, "post", "/enterprise-request");

    const req = mockReq({
      session: { userId: "u-1" },
      orgId: "org-1",
      body: basePayload({ email: "loggedin@acme.test" })
    });
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 201);
    assert.equal(res.locals.audit.details.logged_in, true);
    // INSERT params: requester_user_id, requester_org_id, target_user_id, target_org_id
    const insertCall = pool.calls[2];
    assert.equal(insertCall.params[0], "u-1");
    assert.equal(insertCall.params[1], "org-1");
  });
});

// ── Validation ─────────────────────────────────────────────────

describe("POST /api/enterprise-request — validation", () => {
  it("400 wenn Pflichtfeld email fehlt", async () => {
    const pool = sequencePool(); // sollte gar nicht abgefragt werden
    const router = createStrategicCollaborationRouter({ pool, requireAuth });
    const handler = findHandler(router, "post", "/enterprise-request");

    const body = basePayload();
    delete body.email;
    const req = mockReq({ body });
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 400);
    assert.equal(res._json.error, "VALIDATION");
    assert.equal(res.locals.audit.action, "enterprise.request_submit_invalid");
    assert.equal(pool.calls.length, 0, "Bei Validation-Error darf kein DB-Call passieren");
  });

  it("400 wenn email kein gueltiges Format hat", async () => {
    const pool = sequencePool();
    const router = createStrategicCollaborationRouter({ pool, requireAuth });
    const handler = findHandler(router, "post", "/enterprise-request");

    const req = mockReq({ body: basePayload({ email: "kein-email" }) });
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 400);
    assert.equal(res._json.error, "VALIDATION");
  });
});

// ── Rate-Limit / Duplikat ──────────────────────────────────────

describe("POST /api/enterprise-request — rate-limit + duplicate", () => {
  it("429 wenn Burst-Schwelle erreicht ist", async () => {
    const pool = sequencePool(
      { rows: [{ cnt: 5 }] }
    );
    const router = createStrategicCollaborationRouter({ pool, requireAuth });
    const handler = findHandler(router, "post", "/enterprise-request");

    const req = mockReq({ body: basePayload() });
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 429);
    assert.equal(res._json.error, "RATE_LIMITED");
  });

  it("409 wenn offene Anfrage zu derselben E-Mail existiert", async () => {
    const pool = sequencePool(
      { rows: [{ cnt: 0 }] },
      { rows: [{ id: "req-existing-1" }] }
    );
    const router = createStrategicCollaborationRouter({ pool, requireAuth });
    const handler = findHandler(router, "post", "/enterprise-request");

    const req = mockReq({ body: basePayload() });
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 409);
    assert.equal(res._json.error, "DUPLICATE_OPEN_REQUEST");
    assert.equal(res._json.existing_id, "req-existing-1");
  });
});
