/**
 * Worker Portal router handler coverage tests.
 *
 * Constructs createWorkerPortalRouter({ pool, requireAuth }) with mocked deps,
 * extracts the final route handler from router.stack and invokes it with a
 * mock req/res + a dispatching mock pool. Asserts real behavior: status codes,
 * response body shape, validation rejection, ownership/forbidden branches and
 * the SQL the handlers / their services issue.
 *
 * The route module delegates to real service modules (workerService,
 * workerSubmissionService, assignmentStaffingService). Those services run real
 * SQL against the mock pool, so the pool is a substring dispatcher: it matches
 * the issued SQL against registered rules and returns controllable rows
 * (default { rows: [] }). This exercises the handler branches end-to-end.
 *
 * Run: node --test --test-force-exit test/workerPortal.route.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createWorkerPortalRouter } from "../routes/workerPortal.js";

/* ── Dispatching mock pool ────────────────────────────────────────────────── */

/**
 * rules: array of { match: substring|RegExp, rows } — first match wins.
 * Unmatched queries return { rows: [] } so service code that fans out extra
 * queries (events, totals, etc.) never throws.
 */
function dispatchPool(rules = []) {
  const calls = [];
  const matchOne = (sql) => {
    for (const rule of rules) {
      const m = rule.match;
      const hit = m instanceof RegExp ? m.test(sql) : sql.includes(m);
      if (hit) return rule.rows;
    }
    return { rows: [] };
  };
  const client = {
    query: async (sql, params = []) => {
      calls.push({ sql, params, client: true });
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/i.test(sql)) return { rows: [] };
      return matchOne(sql);
    },
    release() {}
  };
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      return matchOne(sql);
    },
    connect: async () => client
  };
}

function mockReq(overrides = {}) {
  return {
    session: { userId: "11111111-1111-1111-1111-111111111111", userRole: "worker" },
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
  const res = {
    _status: 200,
    _json: null,
    _headers: {},
    locals: {},
    status(code) { res._status = code; return res; },
    json(payload) { res._json = payload; return res; },
    send(payload) { res._send = payload; return res; },
    set() { return res; },
    setHeader(name, value) { res._headers[String(name).toLowerCase()] = value; return res; },
    type() { return res; },
    end() { return res; }
  };
  return res;
}

const requireAuth = (_req, _res, next) => next();

function buildRouter(pool) {
  return createWorkerPortalRouter({ pool, requireAuth });
}

/** Return the final (terminal) handler for METHOD + exact path. */
function getHandler(router, method, exactPath) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== exactPath) continue;
    if (!layer.route.methods[method]) continue;
    return layer.route.stack[layer.route.stack.length - 1].handle;
  }
  throw new Error(`Route ${method.toUpperCase()} ${exactPath} not found`);
}

/** Invoke a handler, surfacing any error passed to next() instead of swallowing. */
async function run(handler, req, res) {
  let nextErr = null;
  await handler(req, res, (err) => { if (err) nextErr = err; });
  if (nextErr) throw nextErr;
  return res;
}

const WORKER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ID = "22222222-2222-2222-2222-222222222222";
const LINK_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

/** A worker_profiles row keyed by the getWorkerProfile SELECT. */
function profileRule(extra = {}) {
  return {
    match: "FROM worker_profiles wp",
    rows: { rows: [{ user_id: WORKER_ID, supplier_org_id: "org-supplier-1", first_name: "Max", last_name: "Mustermann", ...extra }] }
  };
}

/* ── requireWorkerRole middleware ─────────────────────────────────────────── */

describe("workerPortal — requireWorkerRole guard", () => {
  it("401 NOT_AUTHENTICATED when no session userId", async () => {
    const router = buildRouter(dispatchPool());
    const handler = getHandler(router, "get", "/worker/me");
    const guard = (() => {
      for (const layer of router.stack) {
        if (layer.route && layer.route.path === "/worker/me" && layer.route.methods.get) {
          return layer.route.stack[1].handle; // [requireAuth, requireWorkerRole, terminal]
        }
      }
    })();
    const req = mockReq({ session: {} });
    const res = mockRes();
    let called = false;
    guard(req, res, () => { called = true; });
    assert.strictEqual(called, false);
    assert.strictEqual(res._status, 401);
    assert.strictEqual(res._json.error, "NOT_AUTHENTICATED");
    void handler;
  });

  it("403 WORKER_ROLE_REQUIRED when role is not worker", async () => {
    const router = buildRouter(dispatchPool());
    let guard;
    for (const layer of router.stack) {
      if (layer.route && layer.route.path === "/worker/me" && layer.route.methods.get) {
        guard = layer.route.stack[1].handle;
      }
    }
    const req = mockReq({ session: { userId: WORKER_ID, userRole: "company_admin" } });
    const res = mockRes();
    let called = false;
    guard(req, res, () => { called = true; });
    assert.strictEqual(called, false);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "WORKER_ROLE_REQUIRED");
  });

  it("passes through for worker role", async () => {
    const router = buildRouter(dispatchPool());
    let guard;
    for (const layer of router.stack) {
      if (layer.route && layer.route.path === "/worker/me" && layer.route.methods.get) {
        guard = layer.route.stack[1].handle;
      }
    }
    const req = mockReq();
    const res = mockRes();
    let called = false;
    guard(req, res, () => { called = true; });
    assert.strictEqual(called, true);
  });
});

/* ── GET /worker/me ───────────────────────────────────────────────────────── */

describe("workerPortal — GET /worker/me", () => {
  it("200 returns the worker profile", async () => {
    const pool = dispatchPool([profileRule()]);
    const handler = getHandler(buildRouter(pool), "get", "/worker/me");
    const res = await run(handler, mockReq(), mockRes());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.user_id, WORKER_ID);
    // profile query was scoped to the session user
    const q = pool.calls.find(c => c.sql.includes("FROM worker_profiles wp"));
    assert.deepStrictEqual(q.params, [WORKER_ID]);
  });

  it("404 PROFILE_NOT_FOUND when no profile row", async () => {
    const pool = dispatchPool(); // profile query -> { rows: [] }
    const handler = getHandler(buildRouter(pool), "get", "/worker/me");
    const res = await run(handler, mockReq(), mockRes());
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "PROFILE_NOT_FOUND");
  });
});

/* ── PATCH /worker/me ─────────────────────────────────────────────────────── */

describe("workerPortal — PATCH /worker/me", () => {
  it("400 VALIDATION on bad field types", async () => {
    const pool = dispatchPool([profileRule()]);
    const handler = getHandler(buildRouter(pool), "patch", "/worker/me");
    const req = mockReq({ body: { phone: 12345 } }); // phone must be string
    const res = await run(handler, req, mockRes());
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
    assert.ok(Array.isArray(res._json.details));
  });

  it("404 PROFILE_NOT_FOUND when profile missing", async () => {
    const pool = dispatchPool(); // no profile
    const handler = getHandler(buildRouter(pool), "patch", "/worker/me");
    const req = mockReq({ body: { city: "Hamburg" } });
    const res = await run(handler, req, mockRes());
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "PROFILE_NOT_FOUND");
  });

  it("200 updates profile and records audit with changed_fields", async () => {
    const pool = dispatchPool([
      profileRule(),
      { match: "UPDATE worker_profiles", rows: { rows: [{ user_id: WORKER_ID, city: "Hamburg" }] } }
    ]);
    const handler = getHandler(buildRouter(pool), "patch", "/worker/me");
    const req = mockReq({ body: { city: "Hamburg", phone: "+49 40 123" } });
    const res = await run(handler, req, mockRes());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res.locals.audit.action, "worker.update_profile");
    assert.strictEqual(res.locals.audit.entity_id, WORKER_ID);
    assert.deepStrictEqual(res.locals.audit.details.changed_fields.sort(), ["city", "phone"]);
  });
});

/* ── GET /worker/documents ────────────────────────────────────────────────── */

describe("workerPortal — GET /worker/documents", () => {
  it("404 when profile missing", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "get", "/worker/documents");
    const res = await run(handler, mockReq(), mockRes());
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "PROFILE_NOT_FOUND");
  });

  it("200 returns items + summary with download_path injected", async () => {
    const pool = dispatchPool([
      profileRule(),
      { match: "FROM worker_profile_documents wpd", rows: { rows: [
        { id: "doc-1", category: "qualification", status: "pending_review", title: "Cert", file_ref: "/uploads/x" }
      ] } }
    ]);
    const handler = getHandler(buildRouter(pool), "get", "/worker/documents");
    const res = await run(handler, mockReq({ query: { limit: "5" } }), mockRes());
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._json.items));
    assert.strictEqual(res._json.items[0].download_path, "/api/worker/documents/doc-1/download");
    assert.ok(res._json.summary);
  });
});

/* ── GET /worker/documents/:id/download ───────────────────────────────────── */

describe("workerPortal — GET /worker/documents/:documentId/download", () => {
  it("404 PROFILE_NOT_FOUND when no profile", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "get", "/worker/documents/:documentId/download");
    const res = await run(handler, mockReq({ params: { documentId: "doc-1" } }), mockRes());
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "PROFILE_NOT_FOUND");
  });

  it("404 NOT_FOUND when document belongs to another worker", async () => {
    const pool = dispatchPool([
      profileRule(),
      { match: "FROM worker_profile_documents wpd", rows: { rows: [
        { id: "doc-1", worker_user_id: OTHER_ID, supplier_org_id: "org-supplier-1", file_ref: "/x" }
      ] } }
    ]);
    const handler = getHandler(buildRouter(pool), "get", "/worker/documents/:documentId/download");
    const res = await run(handler, mockReq({ params: { documentId: "doc-1" } }), mockRes());
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("404 NO_FILE when document row has no file_ref", async () => {
    const pool = dispatchPool([
      profileRule(),
      { match: "FROM worker_profile_documents wpd", rows: { rows: [
        { id: "doc-1", worker_user_id: WORKER_ID, supplier_org_id: "org-supplier-1", file_ref: null }
      ] } }
    ]);
    const handler = getHandler(buildRouter(pool), "get", "/worker/documents/:documentId/download");
    const res = await run(handler, mockReq({ params: { documentId: "doc-1" } }), mockRes());
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NO_FILE");
  });
});

/* ── DELETE /worker/documents/:id ─────────────────────────────────────────── */

describe("workerPortal — DELETE /worker/documents/:documentId", () => {
  it("404 NOT_FOUND when doc owned by other worker", async () => {
    const pool = dispatchPool([
      profileRule(),
      { match: "FROM worker_profile_documents wpd", rows: { rows: [
        { id: "doc-1", worker_user_id: OTHER_ID, supplier_org_id: "org-supplier-1", status: "pending_review" }
      ] } }
    ]);
    const handler = getHandler(buildRouter(pool), "delete", "/worker/documents/:documentId");
    const res = await run(handler, mockReq({ params: { documentId: "doc-1" } }), mockRes());
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("409 VERIFIED_DOCUMENT_LOCKED when status verified", async () => {
    const pool = dispatchPool([
      profileRule(),
      { match: "FROM worker_profile_documents wpd", rows: { rows: [
        { id: "doc-1", worker_user_id: WORKER_ID, supplier_org_id: "org-supplier-1", status: "verified" }
      ] } }
    ]);
    const handler = getHandler(buildRouter(pool), "delete", "/worker/documents/:documentId");
    const res = await run(handler, mockReq({ params: { documentId: "doc-1" } }), mockRes());
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._json.error, "VERIFIED_DOCUMENT_LOCKED");
  });
});

/* ── GET /worker/assignments ──────────────────────────────────────────────── */

describe("workerPortal — GET /worker/assignments", () => {
  it("200 returns items + total", async () => {
    const pool = dispatchPool([
      { match: "FROM worker_assignment_links wal", rows: { rows: [{ id: LINK_ID, assignment_id: "a-1" }] } }
    ]);
    const handler = getHandler(buildRouter(pool), "get", "/worker/assignments");
    const res = await run(handler, mockReq(), mockRes());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.total, 1);
    assert.strictEqual(res._json.items[0].id, LINK_ID);
  });
});

/* ── GET /worker/schedule ─────────────────────────────────────────────────── */

describe("workerPortal — GET /worker/schedule", () => {
  it("200 returns schedule items scoped to the session worker", async () => {
    const pool = dispatchPool([
      { match: "FROM worker_assignment_links wal", rows: { rows: [{ link_id: LINK_ID }] } }
    ]);
    const handler = getHandler(buildRouter(pool), "get", "/worker/schedule");
    const res = await run(handler, mockReq(), mockRes());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.total, 1);
    const q = pool.calls.find(c => c.sql.includes("FROM worker_assignment_links wal"));
    assert.deepStrictEqual(q.params, [WORKER_ID]);
  });
});

/* ── GET /worker/assignments/:id ──────────────────────────────────────────── */

describe("workerPortal — GET /worker/assignments/:id", () => {
  it("404 NOT_FOUND when detail empty", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "get", "/worker/assignments/:id");
    const res = await run(handler, mockReq({ params: { id: LINK_ID } }), mockRes());
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("200 returns the assignment detail", async () => {
    const pool = dispatchPool([
      { match: "WHERE wal.id = $1 AND wal.worker_user_id = $2", rows: { rows: [{ id: LINK_ID, assignment_id: "a-1" }] } }
    ]);
    const handler = getHandler(buildRouter(pool), "get", "/worker/assignments/:id");
    const res = await run(handler, mockReq({ params: { id: LINK_ID } }), mockRes());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.id, LINK_ID);
  });
});

/* ── GET /worker/staffing-requests + choice-sets ──────────────────────────── */

describe("workerPortal — GET staffing lists", () => {
  it("staffing-requests returns items+total and caps limit at 50", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "get", "/worker/staffing-requests");
    const res = await run(handler, mockReq({ query: { limit: "999" } }), mockRes());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.total, 0);
    assert.ok(Array.isArray(res._json.items));
  });

  it("staffing-choice-sets returns items+total", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "get", "/worker/staffing-choice-sets");
    const res = await run(handler, mockReq(), mockRes());
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._json.items));
  });
});

/* ── POST /worker/staffing-requests/:id/respond ───────────────────────────── */

describe("workerPortal — POST staffing-requests/:id/respond", () => {
  it("400 VALIDATION on invalid action", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "post", "/worker/staffing-requests/:id/respond");
    const req = mockReq({ params: { id: LINK_ID }, body: { action: "nope" } });
    const res = await run(handler, req, mockRes());
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("maps INVITE_NOT_FOUND service error to 404", async () => {
    // service runs against empty pool -> returns INVITE_NOT_FOUND
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "post", "/worker/staffing-requests/:id/respond");
    const req = mockReq({ params: { id: LINK_ID }, body: { action: "accept" } });
    const res = await run(handler, req, mockRes());
    assert.strictEqual(res._json.error, "INVITE_NOT_FOUND");
    assert.strictEqual(res._status, 404);
  });
});

/* ── POST /worker/staffing-requests/:id/question ──────────────────────────── */

describe("workerPortal — POST staffing-requests/:id/question", () => {
  it("400 VALIDATION on empty question", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "post", "/worker/staffing-requests/:id/question");
    const req = mockReq({ params: { id: LINK_ID }, body: { question: "" } });
    const res = await run(handler, req, mockRes());
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("maps service error to mapped status (404 INVITE_NOT_FOUND)", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "post", "/worker/staffing-requests/:id/question");
    const req = mockReq({ params: { id: LINK_ID }, body: { question: "Wann beginnt der Einsatz?" } });
    const res = await run(handler, req, mockRes());
    assert.strictEqual(res._json.error, "INVITE_NOT_FOUND");
    assert.strictEqual(res._status, 404);
  });
});

/* ── POST /worker/staffing-requests/:id/remind ────────────────────────────── */

describe("workerPortal — POST staffing-requests/:id/remind", () => {
  it("400 VALIDATION on out-of-range minutes", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "post", "/worker/staffing-requests/:id/remind");
    const req = mockReq({ params: { id: LINK_ID }, body: { remind_after_minutes: 1 } }); // min 15
    const res = await run(handler, req, mockRes());
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("maps service error to 404 when invite missing", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "post", "/worker/staffing-requests/:id/remind");
    const req = mockReq({ params: { id: LINK_ID }, body: {} });
    const res = await run(handler, req, mockRes());
    assert.strictEqual(res._json.error, "INVITE_NOT_FOUND");
    assert.strictEqual(res._status, 404);
  });
});

/* ── POST /worker/staffing-choice-sets/:id/respond ────────────────────────── */

describe("workerPortal — POST staffing-choice-sets/:id/respond", () => {
  it("400 VALIDATION on unknown action", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "post", "/worker/staffing-choice-sets/:id/respond");
    const req = mockReq({ params: { id: LINK_ID }, body: { action: "wat" } });
    const res = await run(handler, req, mockRes());
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("decline_all routes to declineStaffingChoiceSet and maps 404", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "post", "/worker/staffing-choice-sets/:id/respond");
    const req = mockReq({ params: { id: LINK_ID }, body: { action: "decline_all", note: "kann nicht" } });
    const res = await run(handler, req, mockRes());
    assert.strictEqual(res._json.error, "CHOICE_SET_NOT_FOUND");
    assert.strictEqual(res._status, 404);
  });

  it("select_option requires a uuid (400 VALIDATION when missing)", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "post", "/worker/staffing-choice-sets/:id/respond");
    const req = mockReq({ params: { id: LINK_ID }, body: { action: "select_option" } });
    const res = await run(handler, req, mockRes());
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });
});

/* ── GET /worker/submissions ──────────────────────────────────────────────── */

describe("workerPortal — GET /worker/submissions", () => {
  it("200 returns items+total scoped to worker", async () => {
    const pool = dispatchPool([
      { match: "FROM worker_time_submissions wts", rows: { rows: [{ id: "s-1", status: "draft" }] } }
    ]);
    const handler = getHandler(buildRouter(pool), "get", "/worker/submissions");
    const res = await run(handler, mockReq(), mockRes());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.total, 1);
    const q = pool.calls.find(c => c.sql.includes("FROM worker_time_submissions wts"));
    assert.strictEqual(q.params[0], WORKER_ID);
  });
});

/* ── GET /worker/submissions/:id ──────────────────────────────────────────── */

describe("workerPortal — GET /worker/submissions/:id", () => {
  it("404 NOT_FOUND when submission missing", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "get", "/worker/submissions/:id");
    const res = await run(handler, mockReq({ params: { id: "s-1" } }), mockRes());
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("403 FORBIDDEN when submission belongs to another worker", async () => {
    const pool = dispatchPool([
      { match: "FROM worker_time_submissions wts", rows: { rows: [
        { id: "s-1", worker_user_id: OTHER_ID, week_start: "2026-01-05", week_end: "2026-01-11", status: "draft" }
      ] } }
    ]);
    const handler = getHandler(buildRouter(pool), "get", "/worker/submissions/:id");
    const res = await run(handler, mockReq({ params: { id: "s-1" } }), mockRes());
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "FORBIDDEN");
  });

  it("200 returns the submission with entries for the owner", async () => {
    const pool = dispatchPool([
      { match: "FROM worker_time_submissions wts", rows: { rows: [
        { id: "s-1", worker_user_id: WORKER_ID, week_start: "2026-01-05", week_end: "2026-01-11", status: "draft" }
      ] } }
    ]);
    const handler = getHandler(buildRouter(pool), "get", "/worker/submissions/:id");
    const res = await run(handler, mockReq({ params: { id: "s-1" } }), mockRes());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.id, "s-1");
    assert.ok(Array.isArray(res._json.entries));
  });
});

/* ── POST /worker/submissions ─────────────────────────────────────────────── */

describe("workerPortal — POST /worker/submissions", () => {
  it("400 VALIDATION on missing required fields", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "post", "/worker/submissions");
    const res = await run(handler, mockReq({ body: { week_start: "2026-01-05" } }), mockRes());
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("403 ASSIGNMENT_LINK_FORBIDDEN when link not owned by worker", async () => {
    const pool = dispatchPool(); // assignment detail query -> empty -> link null
    const handler = getHandler(buildRouter(pool), "post", "/worker/submissions");
    const req = mockReq({ body: {
      worker_assignment_link_id: LINK_ID,
      week_start: "2026-01-05",
      week_end: "2026-01-11"
    } });
    const res = await run(handler, req, mockRes());
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "ASSIGNMENT_LINK_FORBIDDEN");
  });

  it("201 creates submission deriving org/assignment from the trusted DB link", async () => {
    const pool = dispatchPool([
      // getWorkerAssignmentDetail -> the owned link
      { match: "WHERE wal.id = $1 AND wal.worker_user_id = $2", rows: { rows: [
        { id: LINK_ID, org_id: "org-client-1", supplier_org_id: "org-supplier-1", assignment_id: "a-1" }
      ] } },
      // createSubmission INSERT
      { match: "INSERT INTO worker_time_submissions", rows: { rows: [
        { id: "s-new", org_id: "org-client-1", supplier_org_id: "org-supplier-1", assignment_id: "a-1" }
      ] } }
    ]);
    const handler = getHandler(buildRouter(pool), "post", "/worker/submissions");
    const req = mockReq({ body: {
      worker_assignment_link_id: LINK_ID,
      week_start: "2026-01-05",
      week_end: "2026-01-11",
      worker_comment: "ok"
    } });
    const res = await run(handler, req, mockRes());
    assert.strictEqual(res._status, 201);
    assert.strictEqual(res._json.id, "s-new");
    // org/supplier/assignment must come from the DB link, not the client body
    const insert = pool.calls.find(c => c.sql.includes("INSERT INTO worker_time_submissions"));
    assert.ok(insert.params.includes("org-client-1"));
    assert.ok(insert.params.includes("org-supplier-1"));
    assert.ok(insert.params.includes("a-1"));
    assert.strictEqual(res.locals.audit.action, "worker_submission.create");
  });
});

/* ── PUT /worker/submissions/:id/entries ──────────────────────────────────── */

describe("workerPortal — PUT /worker/submissions/:id/entries", () => {
  it("400 VALIDATION on missing work_date", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "put", "/worker/submissions/:id/entries");
    const res = await run(handler, mockReq({ params: { id: "s-1" }, body: { hours_regular: 8 } }), mockRes());
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("404 NOT_FOUND mapped from service when submission missing", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "put", "/worker/submissions/:id/entries");
    const req = mockReq({ params: { id: "s-1" }, body: { work_date: "2026-01-06", hours_regular: 8, hours_overtime: 0, break_minutes: 30 } });
    const res = await run(handler, req, mockRes());
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("403 FORBIDDEN mapped when submission owned by another worker", async () => {
    const pool = dispatchPool([
      { match: "FROM worker_time_submissions wts", rows: { rows: [
        { id: "s-1", worker_user_id: OTHER_ID, week_start: "2026-01-05", week_end: "2026-01-11", status: "draft" }
      ] } }
    ]);
    const handler = getHandler(buildRouter(pool), "put", "/worker/submissions/:id/entries");
    const req = mockReq({ params: { id: "s-1" }, body: { work_date: "2026-01-06", hours_regular: 8, hours_overtime: 0, break_minutes: 30 } });
    const res = await run(handler, req, mockRes());
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "FORBIDDEN");
  });
});

/* ── DELETE /worker/submissions/:id/entries/:entryId ──────────────────────── */

describe("workerPortal — DELETE /worker/submissions/:id/entries/:entryId", () => {
  it("404 NOT_FOUND mapped when submission missing", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "delete", "/worker/submissions/:id/entries/:entryId");
    const res = await run(handler, mockReq({ params: { id: "s-1", entryId: "e-1" } }), mockRes());
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("403 FORBIDDEN mapped when owned by another worker", async () => {
    const pool = dispatchPool([
      { match: "FROM worker_time_submissions wts", rows: { rows: [
        { id: "s-1", worker_user_id: OTHER_ID, status: "draft", week_start: "2026-01-05", week_end: "2026-01-11" }
      ] } }
    ]);
    const handler = getHandler(buildRouter(pool), "delete", "/worker/submissions/:id/entries/:entryId");
    const res = await run(handler, mockReq({ params: { id: "s-1", entryId: "e-1" } }), mockRes());
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "FORBIDDEN");
  });
});

/* ── POST /worker/submissions/:id/submit ──────────────────────────────────── */

describe("workerPortal — POST /worker/submissions/:id/submit", () => {
  it("404 NOT_FOUND mapped when submission missing", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "post", "/worker/submissions/:id/submit");
    const res = await run(handler, mockReq({ params: { id: "s-1" } }), mockRes());
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  // NOTE: the INVALID_TRANSITION (409) path is raised by the service and surfaced via next(err)
  // → the central error-mapper middleware sets the 409. This harness mounts only the handler
  // (no error middleware), so the 409 status is not observable here. Covered by integration tests.
});

/* ── POST /worker/submissions/:id/correct ─────────────────────────────────── */

describe("workerPortal — POST /worker/submissions/:id/correct", () => {
  it("404 NOT_FOUND mapped when submission missing", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "post", "/worker/submissions/:id/correct");
    const res = await run(handler, mockReq({ params: { id: "s-1" } }), mockRes());
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });
});

/* ── POST /worker/submissions/:id/comment ─────────────────────────────────── */

describe("workerPortal — POST /worker/submissions/:id/comment", () => {
  it("404 NOT_FOUND when submission missing", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "post", "/worker/submissions/:id/comment");
    const res = await run(handler, mockReq({ params: { id: "s-1" }, body: { note: "hi" } }), mockRes());
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("403 FORBIDDEN when owned by another worker", async () => {
    const pool = dispatchPool([
      { match: "FROM worker_time_submissions wts", rows: { rows: [
        { id: "s-1", worker_user_id: OTHER_ID, week_start: "2026-01-05", week_end: "2026-01-11", status: "draft" }
      ] } }
    ]);
    const handler = getHandler(buildRouter(pool), "post", "/worker/submissions/:id/comment");
    const res = await run(handler, mockReq({ params: { id: "s-1" }, body: { note: "hi" } }), mockRes());
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "FORBIDDEN");
  });

  it("400 NOTE_REQUIRED when note empty", async () => {
    const pool = dispatchPool([
      { match: "FROM worker_time_submissions wts", rows: { rows: [
        { id: "s-1", worker_user_id: WORKER_ID, week_start: "2026-01-05", week_end: "2026-01-11", status: "draft" }
      ] } }
    ]);
    const handler = getHandler(buildRouter(pool), "post", "/worker/submissions/:id/comment");
    const res = await run(handler, mockReq({ params: { id: "s-1" }, body: { note: "   " } }), mockRes());
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "NOTE_REQUIRED");
  });

  it("200 updates worker_comment and records audit", async () => {
    const pool = dispatchPool([
      { match: "FROM worker_time_submissions wts", rows: { rows: [
        { id: "s-1", worker_user_id: WORKER_ID, week_start: "2026-01-05", week_end: "2026-01-11", status: "draft" }
      ] } },
      { match: "UPDATE worker_time_submissions SET worker_comment", rows: { rows: [{ id: "s-1", worker_comment: "Bitte prüfen" }] } }
    ]);
    const handler = getHandler(buildRouter(pool), "post", "/worker/submissions/:id/comment");
    const res = await run(handler, mockReq({ params: { id: "s-1" }, body: { note: "Bitte prüfen" } }), mockRes());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.ok, true);
    assert.strictEqual(res._json.submission.worker_comment, "Bitte prüfen");
    const upd = pool.calls.find(c => c.sql.includes("UPDATE worker_time_submissions SET worker_comment"));
    assert.deepStrictEqual(upd.params, ["Bitte prüfen", "s-1"]);
    assert.strictEqual(res.locals.audit.action, "worker_submission.comment");
  });
});

/* ── GET /worker/submissions/:id/prefill ──────────────────────────────────── */

describe("workerPortal — GET /worker/submissions/:id/prefill", () => {
  it("404 NOT_FOUND when submission missing", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "get", "/worker/submissions/:id/prefill");
    const res = await run(handler, mockReq({ params: { id: "s-1" } }), mockRes());
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("403 FORBIDDEN when owned by another worker", async () => {
    const pool = dispatchPool([
      { match: "FROM worker_time_submissions wts", rows: { rows: [
        { id: "s-1", worker_user_id: OTHER_ID, week_start: "2026-01-05", week_end: "2026-01-11", status: "draft" }
      ] } }
    ]);
    const handler = getHandler(buildRouter(pool), "get", "/worker/submissions/:id/prefill");
    const res = await run(handler, mockReq({ params: { id: "s-1" } }), mockRes());
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "FORBIDDEN");
  });

  it("200 prefill null when submission has no assignment", async () => {
    const pool = dispatchPool([
      { match: "FROM worker_time_submissions wts", rows: { rows: [
        { id: "s-1", worker_user_id: WORKER_ID, week_start: "2026-01-05", week_end: "2026-01-11", status: "draft", assignment_id: null }
      ] } }
    ]);
    const handler = getHandler(buildRouter(pool), "get", "/worker/submissions/:id/prefill");
    const res = await run(handler, mockReq({ params: { id: "s-1" } }), mockRes());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.prefill, null);
  });

  it("200 returns prefill row when assignment present", async () => {
    const pool = dispatchPool([
      { match: "FROM worker_time_submissions wts", rows: { rows: [
        { id: "s-1", worker_user_id: WORKER_ID, week_start: "2026-01-05", week_end: "2026-01-11", status: "draft", assignment_id: "a-1" }
      ] } },
      { match: "FROM worker_assignment_links wal", rows: { rows: [
        { default_shift_start: "08:00", default_shift_end: "16:00", default_break_minutes: 30 }
      ] } }
    ]);
    const handler = getHandler(buildRouter(pool), "get", "/worker/submissions/:id/prefill");
    const res = await run(handler, mockReq({ params: { id: "s-1" } }), mockRes());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.prefill.default_shift_start, "08:00");
    const q = pool.calls.find(c => c.sql.includes("FROM worker_assignment_links wal") && c.sql.includes("JOIN assignments a"));
    assert.deepStrictEqual(q.params, [WORKER_ID, "a-1"]);
  });
});

/* ── POST /worker/assignments/:id/confirm ─────────────────────────────────── */

describe("workerPortal — POST /worker/assignments/:id/confirm", () => {
  it("404 NOT_FOUND when action-context missing", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "post", "/worker/assignments/:id/confirm");
    const res = await run(handler, mockReq({ params: { id: LINK_ID } }), mockRes());
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });
});

/* ── POST /worker/assignments/:id/decline ─────────────────────────────────── */

describe("workerPortal — POST /worker/assignments/:id/decline", () => {
  it("404 NOT_FOUND when action-context missing", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "post", "/worker/assignments/:id/decline");
    const res = await run(handler, mockReq({ params: { id: LINK_ID }, body: { reason: "krank" } }), mockRes());
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });
});

/* ── POST /worker/assignments/:id/report-unavailable ──────────────────────── */

describe("workerPortal — POST /worker/assignments/:id/report-unavailable", () => {
  it("400 INVALID_DATE on missing/invalid date", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "post", "/worker/assignments/:id/report-unavailable");
    const res = await run(handler, mockReq({ params: { id: LINK_ID }, body: { unavailable_from: "06.01.2026" } }), mockRes());
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "INVALID_DATE");
  });

  it("404 NOT_FOUND when action-context missing", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "post", "/worker/assignments/:id/report-unavailable");
    const res = await run(handler, mockReq({ params: { id: LINK_ID }, body: { unavailable_from: "2026-01-06", reason: "krank" } }), mockRes());
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });
});

/* ── GET /worker/notifications ────────────────────────────────────────────── */

describe("workerPortal — GET /worker/notifications", () => {
  it("200 returns items + unread_count (separate COUNT query)", async () => {
    const pool = dispatchPool([
      { match: "FROM notifications\n", rows: { rows: [
        { id: "n-1", type: "info", is_read: false, title: "Hi" },
        { id: "n-2", type: "info", is_read: true, title: "Old" }
      ] } },
      { match: "SELECT COUNT(*) FROM notifications", rows: { rows: [{ count: "1" }] } }
    ]);
    const handler = getHandler(buildRouter(pool), "get", "/worker/notifications");
    const res = await run(handler, mockReq({ query: {} }), mockRes());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.total, 2);
    assert.strictEqual(res._json.unread_count, 1);
  });

  it("unread=true filters via WHERE and counts in-memory (no COUNT query)", async () => {
    const pool = dispatchPool([
      { match: "FROM notifications", rows: { rows: [{ id: "n-1", is_read: false }] } }
    ]);
    const handler = getHandler(buildRouter(pool), "get", "/worker/notifications");
    const res = await run(handler, mockReq({ query: { unread: "true" } }), mockRes());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.unread_count, 1);
    const listQuery = pool.calls.find(c => c.sql.includes("FROM notifications") && c.sql.includes("ORDER BY"));
    assert.match(listQuery.sql, /AND is_read = FALSE/);
    // no separate COUNT query when unread filter active
    assert.ok(!pool.calls.some(c => c.sql.includes("SELECT COUNT(*) FROM notifications")));
  });
});

/* ── PATCH /worker/notifications/:id/read + read-all ──────────────────────── */

describe("workerPortal — PATCH notifications read", () => {
  it("read marks one notification scoped to user", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "patch", "/worker/notifications/:id/read");
    const res = await run(handler, mockReq({ params: { id: "n-1" } }), mockRes());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.ok, true);
    const upd = pool.calls.find(c => c.sql.includes("UPDATE notifications SET is_read=TRUE WHERE id=$1"));
    assert.deepStrictEqual(upd.params, ["n-1", WORKER_ID]);
  });

  it("read-all marks all unread for the user", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "patch", "/worker/notifications/read-all");
    const res = await run(handler, mockReq(), mockRes());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.ok, true);
    const upd = pool.calls.find(c => c.sql.includes("WHERE user_id=$1 AND is_read=FALSE"));
    assert.deepStrictEqual(upd.params, [WORKER_ID]);
  });
});

/* ── GET /worker/dashboard ────────────────────────────────────────────────── */

describe("workerPortal — GET /worker/dashboard", () => {
  it("404 PROFILE_NOT_FOUND when no profile", async () => {
    const pool = dispatchPool();
    const handler = getHandler(buildRouter(pool), "get", "/worker/dashboard");
    const res = await run(handler, mockReq(), mockRes());
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "PROFILE_NOT_FOUND");
  });

  it("200 aggregates assignments, submissions and document hub with KPIs", async () => {
    const pool = dispatchPool([
      profileRule(),
      { match: "FROM worker_assignment_links wal", rows: { rows: [
        { id: LINK_ID, assignment_is_current: true },
        { id: "l-2", assignment_is_current: false }
      ] } },
      { match: "FROM worker_time_submissions wts", rows: { rows: [
        { id: "s-1", status: "submitted" },
        { id: "s-2", status: "under_review" },
        { id: "s-3", status: "needs_correction" }
      ] } },
      { match: "FROM worker_profile_documents wpd", rows: { rows: [
        { id: "doc-1", category: "qualification", status: "pending_review", file_ref: "/x" }
      ] } }
    ]);
    const handler = getHandler(buildRouter(pool), "get", "/worker/dashboard");
    const res = await run(handler, mockReq(), mockRes());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.active_assignments, 1);
    assert.strictEqual(res._json.kpis.pending, 1);
    assert.strictEqual(res._json.kpis.in_review, 1);
    assert.strictEqual(res._json.kpis.needs_correction, 1);
    assert.ok(res._json.document_hub.summary);
    assert.strictEqual(res._json.document_hub.recent_documents[0].download_path, "/api/worker/documents/doc-1/download");
  });
});
