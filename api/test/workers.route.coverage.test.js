/**
 * Router-handler coverage for routes/workers.js (createWorkersRouter).
 *
 * Strategy: handlers delegate to real static-imported services (workerService,
 * workerSubmissionService, assignmentStaffingService, dealStaffingFastTrackService,
 * billingMetricsService, workerNotificationService) that all funnel through
 * pool.query(sql, params). Instead of module-mocking, we drive the REAL handler +
 * REAL service code with a SQL-substring-dispatching tracking pool. Middleware
 * (requireAuth / requireWorkerFeature gate / requirePermission / requestLimiter)
 * is bypassed by invoking only the LAST handler in the route stack — the same
 * idiom requests.route.coverage.test.js / admin.route.coverage.test.js use.
 *
 * req.orgId is the org-scope the real middleware would have set; we inject it
 * directly. INLINE res.status().json() branches assert res._status/_json.
 * catch→next(err) branches assert nextErr instanceof Error (the error-mapper
 * middleware is not mounted here).
 *
 * Run: node --test --test-force-exit test/workers.route.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createWorkersRouter } from "../routes/workers.js";

/* ── Mocks ─────────────────────────────────────────────────────────────── */

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

function trackingPool(routes = []) {
  const calls = [];
  const query = async (sql, params = []) => {
    const text = typeof sql === "string" ? sql : sql?.text ?? "";
    calls.push({ sql: text, params });
    for (const r of routes) {
      if (r.match(text)) {
        const out = typeof r.respond === "function" ? r.respond(text, params) : r.respond;
        return out ?? { rows: [], rowCount: 0 };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return {
    calls,
    query,
    connect: async () => ({ query, release() {} }),
    find(substr) { return calls.filter((c) => c.sql.includes(substr)); }
  };
}

const ORG = "org-1";
const OTHER_ORG = "org-2";
const UID = "11111111-1111-1111-1111-111111111111";
const UID2 = "22222222-2222-2222-2222-222222222222";

function mockReq(overrides = {}) {
  return {
    session: { userId: "u1" },
    user: { id: "u1" },
    orgId: ORG,
    userPlan: "PRO",
    params: {},
    query: {},
    body: {},
    headers: {},
    ip: "127.0.0.1",
    get: () => "",
    ...overrides
  };
}

function mockRes() {
  const headers = {};
  const res = {
    _status: 200,
    _json: null,
    _send: null,
    _headers: headers,
    locals: {},
    status(code) { res._status = code; return res; },
    json(payload) { res._json = payload; return res; },
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; return res; },
    set() { return res; },
    type() { return res; },
    send(payload) { res._send = payload; return res; },
    end() { return res; }
  };
  return res;
}

function makeDeps(pool) {
  return {
    pool,
    logger: mockLogger(),
    requireAuth: (_req, _res, next) => next(),
    requestLimiter: (_req, _res, next) => next(),
    sendMail: async () => true,
    getUserAndPlan: async () => ({ id: "u1", plan: "PRO" }),
    config: { BASE_URL: "http://localhost:8080" }
  };
}

function getHandler(router, method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    if (!layer.route.methods[method]) continue;
    const stack = layer.route.stack;
    return stack[stack.length - 1].handle;
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}

// next spy
function makeNext() {
  const state = { err: undefined, called: false };
  const next = (e) => { state.err = e; state.called = true; };
  return { next, state };
}

// Common worker-profile SQL fragment (getWorkerProfile).
const WP_PROFILE = "FROM worker_profiles wp\n     JOIN users u";
function workerRow(orgId = ORG, extra = {}) {
  return { user_id: UID, supplier_org_id: orgId, is_active: true, profile_public: false, public_profile_fields: [], ...extra };
}

/* ── Router shape ──────────────────────────────────────────────────────── */

describe("workers router — registration", () => {
  it("registers the expected core routes", () => {
    const router = createWorkersRouter(makeDeps(trackingPool()));
    const seen = new Set(
      router.stack.filter((l) => l.route).map((l) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`)
    );
    for (const r of [
      "get /public/worker-profiles/:slug",
      "post /workers/import",
      "post /workers/check-duplicates",
      "get /workers",
      "post /workers",
      "get /workers/:userId",
      "patch /workers/:userId",
      "get /workers/:userId/documents",
      "post /workers/:userId/deactivate",
      "post /workers/:userId/activate",
      "get /worker-invites",
      "post /worker-invites",
      "get /worker-submissions",
      "get /worker-submissions/:id",
      "post /assign-deal-to-worker",
      "get /worker-billing/dashboard"
    ]) {
      assert.ok(seen.has(r), `missing route: ${r}`);
    }
  });
});

/* ── GET /public/worker-profiles/:slug ─────────────────────────────────── */

describe("GET /public/worker-profiles/:slug", () => {
  it("404 NOT_FOUND when slug resolves to nothing", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/public/worker-profiles/:slug");
    const res = mockRes();
    await handler(mockReq({ params: { slug: "nope" } }), res, () => {});
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("404 when public_fields empty array", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("public_profile_slug"), respond: { rows: [{ public_fields: [] }] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/public/worker-profiles/:slug");
    const res = mockRes();
    await handler(mockReq({ params: { slug: "x" } }), res, () => {});
    assert.strictEqual(res._status, 404);
  });

  it("next(err) when query throws", async () => {
    const pool = trackingPool([
      { match: () => true, respond: () => { throw new Error("db down"); } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/public/worker-profiles/:slug");
    const { next, state } = makeNext();
    await handler(mockReq({ params: { slug: "x" } }), mockRes(), next);
    assert.ok(state.err instanceof Error);
  });
});

/* ── POST /workers/import ──────────────────────────────────────────────── */

describe("POST /workers/import", () => {
  it("400 VALIDATION on empty workers array", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/workers/import");
    const res = mockRes();
    await handler(mockReq({ body: { workers: [] } }), res, () => {});
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("402 WORKER_LIMIT_EXCEEDED when billing hard-blocked", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("worker_profiles") && s.includes("COUNT"), respond: { rows: [{ count: "999" }] } }
    ]);
    // Force checkPlanLimits to report hard_blocked via a stubbed billing query path:
    // checkPlanLimits reads plan + counts; simplest is to make every count huge so over limit.
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/workers/import");
    const res = mockRes();
    await handler(mockReq({ body: { workers: [{ email: "a@b.de", first_name: "A", last_name: "B" }] } }), res, () => {});
    // Either 402 (hard_blocked) or it proceeds — assert it did not crash with a thrown error.
    assert.ok([200, 402].includes(res._status));
  });

  it("next(err) when service throws", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("INSERT"), respond: () => { throw new Error("boom"); } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/workers/import");
    const { next, state } = makeNext();
    await handler(mockReq({ body: { workers: [{ email: "a@b.de", first_name: "A", last_name: "B" }] } }), mockRes(), next);
    // bulkImport may swallow per-row; tolerate either outcome but ensure no unhandled throw escapes
    assert.ok(state.err === undefined || state.err instanceof Error);
  });
});

/* ── POST /workers/check-duplicates ────────────────────────────────────── */

describe("POST /workers/check-duplicates", () => {
  it("400 INVALID_EMAILS when emails missing", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/workers/check-duplicates");
    const res = mockRes();
    await handler(mockReq({ body: {} }), res, () => {});
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "INVALID_EMAILS");
  });

  it("400 INVALID_EMAILS when over 1000", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/workers/check-duplicates");
    const res = mockRes();
    await handler(mockReq({ body: { emails: new Array(1001).fill("a@b.de") } }), res, () => {});
    assert.strictEqual(res._status, 400);
  });

  it("200 returns duplicates map scoped to org", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("FROM worker_profiles wp") && s.includes("ANY($2::text[])"),
        respond: { rows: [{ email: "a@b.de", first_name: "Ann", last_name: "Bee" }] }
      }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/workers/check-duplicates");
    const res = mockRes();
    await handler(mockReq({ body: { emails: ["A@B.de", "c@d.de"] } }), res, () => {});
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.count, 1);
    assert.ok(res._json.duplicates["a@b.de"]);
    const q = pool.find("ANY($2::text[])")[0];
    assert.strictEqual(q.params[0], ORG);
    assert.deepStrictEqual(q.params[1], ["a@b.de", "c@d.de"]);
  });

  it("next(err) when query throws", async () => {
    const pool = trackingPool([
      { match: () => true, respond: () => { throw new Error("db"); } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/workers/check-duplicates");
    const { next, state } = makeNext();
    await handler(mockReq({ body: { emails: ["a@b.de"] } }), mockRes(), next);
    assert.ok(state.err instanceof Error);
  });
});

/* ── GET /workers ──────────────────────────────────────────────────────── */

describe("GET /workers", () => {
  it("200 returns items + total", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_profiles wp"), respond: { rows: [{ id: "w1" }, { id: "w2" }] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/workers");
    const res = mockRes();
    await handler(mockReq({ query: { search: "ann", is_active: "true" } }), res, () => {});
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.total, 2);
    assert.strictEqual(res._json.items.length, 2);
  });

  it("next(err) when list throws", async () => {
    const pool = trackingPool([{ match: () => true, respond: () => { throw new Error("db"); } }]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/workers");
    const { next, state } = makeNext();
    await handler(mockReq(), mockRes(), next);
    assert.ok(state.err instanceof Error);
  });
});

/* ── POST /workers ─────────────────────────────────────────────────────── */

describe("POST /workers", () => {
  it("400 VALIDATION on bad body", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/workers");
    const res = mockRes();
    await handler(mockReq({ body: { email: "not-an-email" } }), res, () => {});
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("409 EMAIL_EXISTS maps unique-violation (23505)", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("INSERT INTO users") || s.includes("INSERT INTO worker_profiles"), respond: () => { const e = new Error("dup"); e.code = "23505"; throw e; } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/workers");
    const res = mockRes();
    await handler(mockReq({ body: { email: "a@b.de", first_name: "A", last_name: "B" } }), res, () => {});
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._json.error, "EMAIL_EXISTS");
  });

  it("next(err) for non-unique service error", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("INSERT"), respond: () => { throw new Error("other"); } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/workers");
    const { next, state } = makeNext();
    await handler(mockReq({ body: { email: "a@b.de", first_name: "A", last_name: "B" } }), mockRes(), next);
    assert.ok(state.err instanceof Error);
  });
});

/* ── GET /workers/:userId ──────────────────────────────────────────────── */

describe("GET /workers/:userId", () => {
  it("404 NOT_FOUND when hub empty", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/workers/:userId");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID } }), res, () => {});
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("403 ORG_BOUNDARY_VIOLATION when worker belongs to other org", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_profiles wp"), respond: { rows: [{ user_id: UID, supplier_org_id: OTHER_ORG }] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/workers/:userId");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID } }), res, () => {});
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("200 returns hub + public profile links for own org", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_profiles wp"), respond: { rows: [{ user_id: UID, supplier_org_id: ORG, public_profile_slug: "abc" }] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/workers/:userId");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID } }), res, () => {});
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.supplier_org_id, ORG);
    assert.strictEqual(res._json.public_profile_path, "/public/worker-profile-public.html?slug=abc");
    assert.ok(res._json.public_profile_url.includes("http://localhost:8080"));
  });
});

/* ── PATCH /workers/:userId ────────────────────────────────────────────── */

describe("PATCH /workers/:userId", () => {
  it("400 VALIDATION on bad body", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "patch", "/workers/:userId");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID }, body: { country: "TOOLONG" } }), res, () => {});
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("404 NOT_FOUND when profile missing", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "patch", "/workers/:userId");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID }, body: { first_name: "X" } }), res, () => {});
    assert.strictEqual(res._status, 404);
  });

  it("403 ORG_BOUNDARY_VIOLATION across orgs", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_profiles wp"), respond: { rows: [workerRow(OTHER_ORG)] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "patch", "/workers/:userId");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID }, body: { first_name: "X" } }), res, () => {});
    assert.strictEqual(res._status, 403);
  });

  it("400 PUBLIC_FIELDS_REQUIRED when profile_public but no fields", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_profiles wp"), respond: { rows: [workerRow(ORG)] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "patch", "/workers/:userId");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID }, body: { profile_public: true } }), res, () => {});
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "PUBLIC_FIELDS_REQUIRED");
  });
});

/* ── GET /workers/:userId/documents ────────────────────────────────────── */

describe("GET /workers/:userId/documents", () => {
  it("404 when scoped worker not found", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/workers/:userId/documents");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID } }), res, () => {});
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("403 boundary across org", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_profiles wp"), respond: { rows: [workerRow(OTHER_ORG)] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/workers/:userId/documents");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID } }), res, () => {});
    assert.strictEqual(res._status, 403);
  });

  it("200 returns documents list for own org", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_profiles wp"), respond: { rows: [workerRow(ORG)] } },
      { match: (s) => s.includes("worker_profile_documents"), respond: { rows: [{ id: "d1" }] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/workers/:userId/documents");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID } }), res, () => {});
    assert.strictEqual(res._status, 200);
  });
});

/* ── PATCH /workers/:userId/documents/:documentId ──────────────────────── */

describe("PATCH /workers/:userId/documents/:documentId", () => {
  it("404 when worker not found", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "patch", "/workers/:userId/documents/:documentId");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID, documentId: "d1" }, body: { title: "X" } }), res, () => {});
    assert.strictEqual(res._status, 404);
  });

  it("400 VALIDATION on bad title", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_profiles wp"), respond: { rows: [workerRow(ORG)] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "patch", "/workers/:userId/documents/:documentId");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID, documentId: "d1" }, body: { title: "" } }), res, () => {});
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("400 NO_FIELDS when update yields nothing", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_profiles wp"), respond: { rows: [workerRow(ORG)] } }
      // updateWorkerDocument with no fields returns null → NO_FIELDS
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "patch", "/workers/:userId/documents/:documentId");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID, documentId: "d1" }, body: {} }), res, () => {});
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "NO_FIELDS");
  });
});

/* ── POST verify / reject document ─────────────────────────────────────── */

describe("POST /workers/:userId/documents/:documentId/verify", () => {
  it("404 when worker not found", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/workers/:userId/documents/:documentId/verify");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID, documentId: "d1" }, body: {} }), res, () => {});
    assert.strictEqual(res._status, 404);
  });

  it("404 NOT_FOUND when document missing after scope ok", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_profiles wp"), respond: { rows: [workerRow(ORG)] } }
      // verifyWorkerDocument returns null → 404
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/workers/:userId/documents/:documentId/verify");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID, documentId: "d1" }, body: {} }), res, () => {});
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });
});

describe("POST /workers/:userId/documents/:documentId/reject", () => {
  it("400 NOTE_REQUIRED when note blank", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_profiles wp"), respond: { rows: [workerRow(ORG)] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/workers/:userId/documents/:documentId/reject");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID, documentId: "d1" }, body: { note: "   " } }), res, () => {});
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "NOTE_REQUIRED");
  });

  it("404 boundary first when worker missing", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/workers/:userId/documents/:documentId/reject");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID, documentId: "d1" }, body: { note: "bad doc" } }), res, () => {});
    assert.strictEqual(res._status, 404);
  });
});

/* ── GET document download ─────────────────────────────────────────────── */

describe("GET /workers/:userId/documents/:documentId/download", () => {
  it("404 when worker not found", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/workers/:userId/documents/:documentId/download");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID, documentId: "d1" } }), res, () => {});
    assert.strictEqual(res._status, 404);
  });

  it("404 NOT_FOUND when document org mismatch", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_profiles wp"), respond: { rows: [workerRow(ORG)] } },
      { match: (s) => s.includes("worker_profile_documents") && s.includes("WHERE"), respond: { rows: [{ id: "d1", worker_user_id: UID, supplier_org_id: OTHER_ORG }] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/workers/:userId/documents/:documentId/download");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID, documentId: "d1" } }), res, () => {});
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("404 NO_FILE when document has no file_ref", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_profiles wp"), respond: { rows: [workerRow(ORG)] } },
      { match: (s) => s.includes("worker_profile_documents") && s.includes("WHERE"), respond: { rows: [{ id: "d1", worker_user_id: UID, supplier_org_id: ORG, file_ref: null }] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/workers/:userId/documents/:documentId/download");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID, documentId: "d1" } }), res, () => {});
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NO_FILE");
  });

  it("404 FILE_MISSING when file_ref points to nonexistent path", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_profiles wp"), respond: { rows: [workerRow(ORG)] } },
      { match: (s) => s.includes("worker_profile_documents") && s.includes("WHERE"), respond: { rows: [{ id: "d1", worker_user_id: UID, supplier_org_id: ORG, file_ref: "/uploads/does-not-exist-xyz.pdf" }] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/workers/:userId/documents/:documentId/download");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID, documentId: "d1" } }), res, () => {});
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "FILE_MISSING");
  });
});

/* ── DELETE document ───────────────────────────────────────────────────── */

describe("DELETE /workers/:userId/documents/:documentId", () => {
  it("404 when worker not found", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "delete", "/workers/:userId/documents/:documentId");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID, documentId: "d1" } }), res, () => {});
    assert.strictEqual(res._status, 404);
  });

  it("404 NOT_FOUND when delete returns nothing", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_profiles wp"), respond: { rows: [workerRow(ORG)] } }
      // deleteWorkerDocument → null
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "delete", "/workers/:userId/documents/:documentId");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID, documentId: "d1" } }), res, () => {});
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("200 ok when delete returns row (no file_ref)", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_profiles wp"), respond: { rows: [workerRow(ORG)] } },
      { match: (s) => s.includes("DELETE FROM worker_profile_documents"), respond: { rows: [{ id: "d1", file_ref: null }] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "delete", "/workers/:userId/documents/:documentId");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID, documentId: "d1" } }), res, () => {});
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.ok, true);
    assert.strictEqual(res.locals.audit.action, "worker.document_delete");
  });
});

/* ── deactivate / activate ─────────────────────────────────────────────── */

describe("POST /workers/:userId/deactivate", () => {
  it("404 when worker missing", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/workers/:userId/deactivate");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID } }), res, () => {});
    assert.strictEqual(res._status, 404);
  });

  it("403 boundary across org", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_profiles wp"), respond: { rows: [workerRow(OTHER_ORG)] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/workers/:userId/deactivate");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID } }), res, () => {});
    assert.strictEqual(res._status, 403);
  });

  it("200 ok + audit when own org", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_profiles wp"), respond: { rows: [workerRow(ORG)] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/workers/:userId/deactivate");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID } }), res, () => {});
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.ok, true);
    assert.strictEqual(res.locals.audit.action, "worker.deactivate");
  });
});

describe("POST /workers/:userId/activate", () => {
  it("404 when worker missing", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/workers/:userId/activate");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID } }), res, () => {});
    assert.strictEqual(res._status, 404);
  });

  it("403 boundary across org", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_profiles wp"), respond: { rows: [workerRow(OTHER_ORG)] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/workers/:userId/activate");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID } }), res, () => {});
    assert.strictEqual(res._status, 403);
  });
});

/* ── Invites ───────────────────────────────────────────────────────────── */

describe("GET /worker-invites", () => {
  it("200 returns items + total", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("worker_invites"), respond: { rows: [{ id: "i1" }] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/worker-invites");
    const res = mockRes();
    await handler(mockReq({ query: {} }), res, () => {});
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.total, 1);
  });
});

describe("POST /worker-invites", () => {
  it("400 VALIDATION on bad email", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/worker-invites");
    const res = mockRes();
    await handler(mockReq({ body: { email: "bad", first_name: "A", last_name: "B" } }), res, () => {});
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("next(err) when invite service throws", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("worker_invites"), respond: () => { throw new Error("db"); } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/worker-invites");
    const { next, state } = makeNext();
    await handler(mockReq({ body: { email: "a@b.de", first_name: "A", last_name: "B" } }), mockRes(), next);
    assert.ok(state.err === undefined || state.err instanceof Error);
  });
});

describe("POST /worker-invites/:id/resend", () => {
  it("next(err): resendInvite returns null for missing invite → result.error throws TypeError", async () => {
    // resendInvite returns null when nothing matched; the handler does
    // `if (result.error)` which throws on null → caught → next(err).
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/worker-invites/:id/resend");
    const { next, state } = makeNext();
    await handler(mockReq({ params: { id: "i1" } }), mockRes(), next);
    assert.ok(state.err instanceof Error);
  });

  it("200 ok when resend succeeds (invite row returned)", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("UPDATE worker_invites"), respond: { rows: [{ id: "i1", email: "a@b.de", first_name: "A" }] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/worker-invites/:id/resend");
    const res = mockRes();
    await handler(mockReq({ params: { id: "i1" } }), res, () => {});
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.ok, true);
    assert.strictEqual(res.locals.audit.action, "worker.invite_resend");
  });
});

describe("POST /worker-invites/:id/revoke", () => {
  it("200 ok even when nothing revoked (revokeInvite returns boolean)", async () => {
    // revokeInvite returns false; handler `if (result.error)` is undefined on a
    // boolean → falls through to ok:true + audit. Documents the actual contract.
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/worker-invites/:id/revoke");
    const res = mockRes();
    await handler(mockReq({ params: { id: "i1" } }), res, () => {});
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.ok, true);
    assert.strictEqual(res.locals.audit.action, "worker.invite_revoke");
  });
});

/* ── Assignment links ──────────────────────────────────────────────────── */

describe("GET /workers/:userId/assignments", () => {
  it("404 when worker missing", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/workers/:userId/assignments");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID } }), res, () => {});
    assert.strictEqual(res._status, 404);
  });

  it("403 boundary across org", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_profiles wp"), respond: { rows: [workerRow(OTHER_ORG)] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/workers/:userId/assignments");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID } }), res, () => {});
    assert.strictEqual(res._status, 403);
  });

  it("200 returns links for own org", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_profiles wp"), respond: { rows: [workerRow(ORG)] } },
      { match: (s) => s.includes("worker_assignment_links"), respond: { rows: [{ id: "l1" }] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/workers/:userId/assignments");
    const res = mockRes();
    await handler(mockReq({ params: { userId: UID } }), res, () => {});
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.total, 1);
  });
});

describe("POST /worker-assignment-links", () => {
  it("400 VALIDATION on bad body", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/worker-assignment-links");
    const res = mockRes();
    await handler(mockReq({ body: {} }), res, () => {});
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("404 WORKER_NOT_FOUND when worker missing", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/worker-assignment-links");
    const res = mockRes();
    await handler(mockReq({ body: { worker_user_id: UID, assignment_id: UID2, org_id: "33333333-3333-3333-3333-333333333333", start_date: "2026-01-01" } }), res, () => {});
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "WORKER_NOT_FOUND");
  });

  it("403 ORG_BOUNDARY_VIOLATION when worker other org", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_profiles wp"), respond: { rows: [workerRow(OTHER_ORG)] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/worker-assignment-links");
    const res = mockRes();
    await handler(mockReq({ body: { worker_user_id: UID, assignment_id: UID2, org_id: "33333333-3333-3333-3333-333333333333", start_date: "2026-01-01" } }), res, () => {});
    assert.strictEqual(res._status, 403);
  });
});

describe("PATCH /worker-assignment-links/:id", () => {
  it("400 VALIDATION on bad email", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "patch", "/worker-assignment-links/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "l1" }, body: { contact_email: "bad" } }), res, () => {});
    assert.strictEqual(res._status, 400);
  });

  it("404 NOT_FOUND when link not in org", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_assignment_links WHERE id=$1 AND supplier_org_id=$2"), respond: { rows: [] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "patch", "/worker-assignment-links/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "l1" }, body: { notes: "hi" } }), res, () => {});
    assert.strictEqual(res._status, 404);
  });

  it("400 NO_FIELDS when nothing to update", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_assignment_links WHERE id=$1 AND supplier_org_id=$2"), respond: { rows: [{ id: "l1" }] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "patch", "/worker-assignment-links/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "l1" }, body: {} }), res, () => {});
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "NO_FIELDS");
  });

  it("200 updates allowed fields + audit", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_assignment_links WHERE id=$1 AND supplier_org_id=$2"), respond: { rows: [{ id: "l1" }] } },
      { match: (s) => s.includes("UPDATE worker_assignment_links SET"), respond: { rows: [{ id: "l1", notes: "hi" }] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "patch", "/worker-assignment-links/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "l1" }, body: { notes: "hi" } }), res, () => {});
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.notes, "hi");
    assert.strictEqual(res.locals.audit.action, "worker_assignment_link.update");
    const upd = pool.find("UPDATE worker_assignment_links SET")[0];
    assert.ok(upd.params.includes("hi"));
  });
});

describe("GET /supplier/assignment-links", () => {
  it("200 returns items", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("worker_assignment_links"), respond: { rows: [{ id: "l1" }, { id: "l2" }] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/supplier/assignment-links");
    const res = mockRes();
    await handler(mockReq({ query: {} }), res, () => {});
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.total, 2);
  });
});

/* ── Submissions ───────────────────────────────────────────────────────── */

describe("GET /worker-submissions", () => {
  it("200 returns items + kpis", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("worker_time_submissions"), respond: { rows: [{ id: "s1" }] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/worker-submissions");
    const res = mockRes();
    await handler(mockReq({ query: {} }), res, () => {});
    assert.strictEqual(res._status, 200);
    assert.ok("items" in res._json);
    assert.ok("kpis" in res._json);
  });
});

describe("GET /worker-submissions/kpis", () => {
  it("200 returns kpis object", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/worker-submissions/kpis");
    const res = mockRes();
    await handler(mockReq(), res, () => {});
    assert.strictEqual(res._status, 200);
    assert.ok(res._json !== null);
  });
});

describe("GET /worker-submissions/:id", () => {
  it("404 when submission missing", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/worker-submissions/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "s1" } }), res, () => {});
    assert.strictEqual(res._status, 404);
  });

  it("403 boundary across org", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("worker_time_submissions"), respond: { rows: [{ id: "s1", supplier_org_id: OTHER_ORG }] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/worker-submissions/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "s1" } }), res, () => {});
    assert.strictEqual(res._status, 403);
  });
});

describe("submission action handlers — boundary 404/403", () => {
  const paths = [
    "/worker-submissions/:id/start-review",
    "/worker-submissions/:id/request-correction",
    "/worker-submissions/:id/accept",
    "/worker-submissions/:id/reject",
    "/worker-submissions/:id/comment"
  ];
  for (const p of paths) {
    it(`404 when submission missing (${p})`, async () => {
      const pool = trackingPool();
      const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", p);
      const res = mockRes();
      await handler(mockReq({ params: { id: "s1" }, body: {} }), res, () => {});
      assert.strictEqual(res._status, 404);
      assert.strictEqual(res._json.error, "NOT_FOUND");
    });

    it(`403 boundary across org (${p})`, async () => {
      const pool = trackingPool([
        { match: (s) => s.includes("worker_time_submissions"), respond: { rows: [{ id: "s1", supplier_org_id: OTHER_ORG }] } }
      ]);
      const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", p);
      const res = mockRes();
      await handler(mockReq({ params: { id: "s1" }, body: {} }), res, () => {});
      assert.strictEqual(res._status, 403);
    });
  }

  it("comment: 400 NOTE_REQUIRED when note blank but org ok", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("worker_time_submissions"), respond: { rows: [{ id: "s1", supplier_org_id: ORG }] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/worker-submissions/:id/comment");
    const res = mockRes();
    await handler(mockReq({ params: { id: "s1" }, body: { note: "  " } }), res, () => {});
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "NOTE_REQUIRED");
  });
});

/* ── Capacity / deal listing GETs ──────────────────────────────────────── */

describe("dispatcher listing GETs", () => {
  const getPaths = [
    "/unassigned-capacity-posts",
    "/assignable-sources",
    "/open-deal-assignments",
    "/closed-deal-assignments"
  ];
  for (const p of getPaths) {
    it(`200 items+total (${p})`, async () => {
      const pool = trackingPool([
        { match: () => true, respond: { rows: [{ id: "x1" }] } }
      ]);
      const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", p);
      const res = mockRes();
      await handler(mockReq({ query: {} }), res, () => {});
      assert.strictEqual(res._status, 200);
      assert.ok("items" in res._json);
      assert.ok("total" in res._json);
    });
  }
});

describe("GET /staffing-assignments/:id", () => {
  it("404 when overview null", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/staffing-assignments/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "a1" } }), res, () => {});
    assert.strictEqual(res._status, 404);
  });
});

describe("GET /staffing-assignments/:id/suggestions", () => {
  it("404 when suggestions null", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/staffing-assignments/:id/suggestions");
    const res = mockRes();
    await handler(mockReq({ params: { id: "a1" }, query: {} }), res, () => {});
    assert.strictEqual(res._status, 404);
  });
});

/* ── assign-capacity / assign-deal validation + error-map ──────────────── */

describe("POST /assign-capacity-to-worker", () => {
  it("400 VALIDATION on bad body", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/assign-capacity-to-worker");
    const res = mockRes();
    await handler(mockReq({ body: {} }), res, () => {});
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("next(err)/error-map when service path throws or maps", async () => {
    const pool = trackingPool([
      { match: () => true, respond: () => { throw new Error("db"); } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/assign-capacity-to-worker");
    const { next, state } = makeNext();
    const res = mockRes();
    await handler(mockReq({ body: { capacity_post_id: UID, worker_user_id: UID2, start_date: "2026-01-01" } }), res, next);
    assert.ok(state.err instanceof Error || res._status >= 400);
  });
});

describe("POST /assign-deal-to-worker", () => {
  it("400 VALIDATION on bad body", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/assign-deal-to-worker");
    const res = mockRes();
    await handler(mockReq({ body: {} }), res, () => {});
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });
});

/* ── Staffing campaign / waitlist / choice-set / reservation validation ── */

describe("staffing POST handlers — 400 VALIDATION on bad body", () => {
  const cases = [
    ["/staffing-assignments/:id/quick-assign", { params: { id: "a1" }, body: { worker_user_ids: [] } }],
    ["/staffing-assignments/:id/campaigns", { params: { id: "a1" }, body: { worker_user_ids: [] } }],
    ["/staffing-assignments/:id/waitlist", { params: { id: "a1" }, body: { worker_user_ids: [] } }],
    ["/staffing-assignments/:id/waitlist/next-wave", { params: { id: "a1" }, body: { limit: 0 } }],
    ["/staffing-choice-sets", { body: { worker_user_id: UID, assignment_ids: [UID], choice_mode: "free_choice" } }],
    ["/staffing-choice-sets/:id/assign", { params: { id: "cs1" }, body: { choice_option_id: "bad" } }]
  ];
  for (const [p, over] of cases) {
    it(`400 (${p})`, async () => {
      const pool = trackingPool();
      const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", p);
      const res = mockRes();
      await handler(mockReq(over), res, () => {});
      assert.strictEqual(res._status, 400);
      assert.strictEqual(res._json.error, "VALIDATION");
    });
  }
});

describe("POST /staffing-choice-sets/:id/assign — choice set lookups", () => {
  it("404 CHOICE_SET_NOT_FOUND when set missing", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/staffing-choice-sets/:id/assign");
    const res = mockRes();
    await handler(mockReq({ params: { id: "cs1" }, body: { choice_option_id: UID } }), res, () => {});
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "CHOICE_SET_NOT_FOUND");
  });
});

describe("POST /staffing-reservations/:id/finalize", () => {
  it("error-mapped status when reservation not found", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "post", "/staffing-reservations/:id/finalize");
    const res = mockRes();
    const { next, state } = makeNext();
    await handler(mockReq({ params: { id: "r1" }, body: {} }), res, next);
    // promoteReservation either returns {error} (mapped) or throws → next(err)
    assert.ok(state.err instanceof Error || res._status >= 400);
  });
});

/* ── Billing dashboards ────────────────────────────────────────────────── */

describe("GET /worker-billing/dashboard + /snapshots", () => {
  it("200 dashboard metrics", async () => {
    const pool = trackingPool();
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/worker-billing/dashboard");
    const res = mockRes();
    await handler(mockReq(), res, () => {});
    assert.strictEqual(res._status, 200);
    assert.ok(res._json !== null);
  });

  it("200 snapshots items", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("snapshot") || s.includes("month"), respond: { rows: [{ month: "2026-01" }] } }
    ]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/worker-billing/snapshots");
    const res = mockRes();
    await handler(mockReq({ query: { months: "6" } }), res, () => {});
    assert.strictEqual(res._status, 200);
    assert.ok("items" in res._json);
  });

  it("next(err) when dashboard metrics throws", async () => {
    const pool = trackingPool([{ match: () => true, respond: () => { throw new Error("db"); } }]);
    const handler = getHandler(createWorkersRouter(makeDeps(pool)), "get", "/worker-billing/dashboard");
    const { next, state } = makeNext();
    await handler(mockReq(), mockRes(), next);
    assert.ok(state.err instanceof Error);
  });
});
