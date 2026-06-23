/**
 * Router-handler coverage for routes/auth.js (createAuthRouter).
 *
 * Strategy: the auth handlers delegate to thin service wrappers (authService,
 * workerService, totpService, ssoService, geoService) that all funnel through
 * pool.query(sql, params). So instead of module-mocking the services we drive
 * the REAL handler + REAL service code with a SQL-substring-dispatching
 * tracking pool. Guards (authLimiter / requireAuth) are bypassed by invoking
 * only the LAST handler in the route stack — same idiom as the repo's
 * requests.route.coverage.test.js / reporting.route.test.js.
 *
 * All branches asserted here are INLINE res.status().json() returns, so we
 * assert res._status / res._json directly. (auth.js uses catchAsync but every
 * business/validation branch responds inline; the catch→next(err) path only
 * fires on unexpected throws which we don't manufacture here.)
 *
 * Run: node --test --test-force-exit test/auth.route.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { createAuthRouter } from "../routes/auth.js";

/* ── Mocks ─────────────────────────────────────────────────────────────── */

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

/**
 * Tracking pool. `routes` is an ordered list of { match(sql)->bool, respond }.
 * First matching entry wins; unmatched queries return { rows: [], rowCount: 0 }
 * so non-critical paths (audit writes, analytics, org setup) degrade to no-ops.
 * Provides connect() because withTransaction(pool, fn) calls pool.connect().
 */
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

function mockReq(overrides = {}) {
  const sess = {
    userId: "u1",
    regenerate(cb) { cb(); },
    destroy(cb) { cb(); }
  };
  return {
    session: sess,
    sessionID: "sess-1",
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
    _cleared: null,
    _responded: false,
    locals: {},
    status(code) { res._status = code; return res; },
    json(payload) { res._json = payload; res._responded = true; return res; },
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; return res; },
    set() { return res; },
    type() { return res; },
    send(payload) { res._send = payload; res._responded = true; return res; },
    clearCookie(name) { res._cleared = name; return res; },
    end() { res._responded = true; return res; }
  };
  return res;
}

function makeDeps(pool, meOverrides) {
  const me = {
    id: "u1", plan: "DEMO", role: "company", org_id: "org-1",
    org_role: "owner", is_demo: true, org_name: "ACME",
    limits: {}, usage: {},
    ...(meOverrides || {})
  };
  return {
    pool,
    config: { BASE_URL: "http://test.local" },
    logger: mockLogger(),
    sendMail: async () => true,
    getUserAndPlan: async () => me,
    requireAuth: (_req, _res, next) => next(),
    authLimiter: (_req, _res, next) => next(),
    _me: me
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

/**
 * Invoke a catchAsync-wrapped handler and wait for it to settle.
 *
 * catchAsync returns `undefined` (it does NOT return the inner promise), so
 * `await invoke(handler, ...)` would resolve before the handler's awaits finish. We
 * detect completion by sentinel: the handler either responds (json/send/end),
 * sets res.locals.audit, or calls next(err). We flush microtasks/macrotasks
 * until one of those happens (bounded), then return the captured next error.
 */
async function invoke(handler, req, res) {
  let nextErr;
  let nextCalled = false;
  const next = (e) => { nextCalled = true; nextErr = e; };
  handler(req, res, next);
  for (let i = 0; i < 200; i++) {
    if (res._responded || nextCalled) break;
    await new Promise((r) => setImmediate(r));
  }
  return nextErr;
}

const HEX64 = crypto.randomBytes(32).toString("hex"); // valid invite-length token

/* ── Router shape ──────────────────────────────────────────────────────── */

describe("auth router — registration shape", () => {
  it("registers all expected routes", () => {
    const router = createAuthRouter(makeDeps(trackingPool()));
    const seen = new Set(
      router.stack.filter((l) => l.route).map((l) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`)
    );
    for (const r of [
      "post /auth/register",
      "get /auth/verify/:token",
      "post /auth/resend-verification",
      "post /auth/login",
      "post /auth/logout",
      "post /auth/forgot-password",
      "get /auth/reset-password/:token",
      "post /auth/reset-password",
      "get /auth/worker/invite/:token",
      "post /auth/worker/accept-invite"
    ]) {
      assert.ok(seen.has(r), `missing route: ${r}`);
    }
  });
});

/* ── POST /auth/register ───────────────────────────────────────────────── */

describe("POST /auth/register", () => {
  it("400 VALIDATION on bad body", async () => {
    const handler = getHandler(createAuthRouter(makeDeps(trackingPool())), "post", "/auth/register");
    const res = mockRes();
    await invoke(handler, mockReq({ body: { role: "company", email: "bad", password: "x" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
    assert.ok(Array.isArray(res._json.details));
  });

  it("400 VALIDATION when individual plan lacks size_class & employee_count", async () => {
    const handler = getHandler(createAuthRouter(makeDeps(trackingPool())), "post", "/auth/register");
    const res = mockRes();
    await invoke(handler, mockReq({ body: { role: "company", email: "a@b.de", password: "password1", plan: "INDIVIDUELL" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("409 EMAIL_EXISTS when email already registered", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT 1 FROM users WHERE email=$1"), respond: { rows: [{ "1": 1 }], rowCount: 1 } }
    ]);
    const handler = getHandler(createAuthRouter(makeDeps(pool)), "post", "/auth/register");
    const res = mockRes();
    await invoke(handler, mockReq({ body: { role: "company", email: "a@b.de", password: "password1" } }), res);
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._json.error, "EMAIL_EXISTS");
  });

  it("200 success: creates user, sends mail, regenerates session, returns me + verification_sent", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT 1 FROM users WHERE email=$1"), respond: { rows: [], rowCount: 0 } },
      { match: (s) => s.includes("INSERT INTO users"), respond: { rows: [{ id: "NEW-USER" }], rowCount: 1 } }
    ]);
    const handler = getHandler(createAuthRouter(makeDeps(pool, { id: "NEW-USER" })), "post", "/auth/register");
    const res = mockRes();
    await invoke(handler, mockReq({ body: { role: "company", email: "a@b.de", password: "password1", company_name: "ACME" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.verification_sent, true);
    assert.strictEqual(res._json.id, "NEW-USER");
    assert.strictEqual(res.locals.audit.action, "auth.register");
    assert.strictEqual(res.locals.audit.entity_id, "NEW-USER");
    // user INSERT issued with email as $2
    const ins = pool.find("INSERT INTO users")[0];
    assert.ok(ins);
    assert.strictEqual(ins.params[1], "a@b.de");
  });

  it("individual direct signup sets contract-request org stage", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT 1 FROM users WHERE email=$1"), respond: { rows: [], rowCount: 0 } },
      { match: (s) => s.includes("INSERT INTO users"), respond: { rows: [{ id: "IND-USER" }], rowCount: 1 } },
      // createOrgWithMembership returns an org id via its INSERT ... RETURNING id
      { match: (s) => s.includes("INSERT INTO organizations"), respond: { rows: [{ id: "ORG-NEW" }], rowCount: 1 } }
    ]);
    const handler = getHandler(createAuthRouter(makeDeps(pool, { id: "IND-USER", plan: "INDIVIDUELL" })), "post", "/auth/register");
    const res = mockRes();
    await invoke(handler, mockReq({ body: {
      role: "company", email: "ind@b.de", password: "password1",
      plan: "INDIVIDUELL", individual_signup_mode: "direct", company_size_class: "II"
    } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.verification_sent, true);
    // direct flow issues the contract_requested org update
    assert.ok(pool.find("customer_stage = 'contract_requested'").length >= 1, "direct flow should update org to contract_requested");
  });
});

/* ── GET /auth/verify/:token ───────────────────────────────────────────── */

describe("GET /auth/verify/:token", () => {
  it("404 TOKEN_NOT_FOUND when token does not match a user", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SET is_verified=TRUE"), respond: { rows: [], rowCount: 0 } }
    ]);
    const handler = getHandler(createAuthRouter(makeDeps(pool)), "get", "/auth/verify/:token");
    const res = mockRes();
    await invoke(handler, mockReq({ params: { token: "abc" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "TOKEN_NOT_FOUND");
  });

  it("200 ok + email when verification succeeds", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SET is_verified=TRUE"), respond: { rows: [{ id: "u9", email: "v@b.de" }], rowCount: 1 } }
    ]);
    const handler = getHandler(createAuthRouter(makeDeps(pool)), "get", "/auth/verify/:token");
    const res = mockRes();
    await invoke(handler, mockReq({ params: { token: "good-token" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.ok, true);
    assert.strictEqual(res._json.email, "v@b.de");
  });
});

/* ── POST /auth/resend-verification ────────────────────────────────────── */

describe("POST /auth/resend-verification", () => {
  it("404 USER_NOT_FOUND when no verification info", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT email, is_verified, verification_token FROM users"), respond: { rows: [], rowCount: 0 } }
    ]);
    const handler = getHandler(createAuthRouter(makeDeps(pool)), "post", "/auth/resend-verification");
    const res = mockRes();
    await invoke(handler, mockReq(), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "USER_NOT_FOUND");
  });

  it("already_verified short-circuits", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT email, is_verified, verification_token FROM users"),
        respond: { rows: [{ email: "v@b.de", is_verified: true, verification_token: null }], rowCount: 1 } }
    ]);
    const handler = getHandler(createAuthRouter(makeDeps(pool)), "post", "/auth/resend-verification");
    const res = mockRes();
    await invoke(handler, mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.already_verified, true);
  });

  it("sends mail (generating a token when missing) + sets audit", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT email, is_verified, verification_token FROM users"),
        respond: { rows: [{ email: "v@b.de", is_verified: false, verification_token: null }], rowCount: 1 } }
    ]);
    const handler = getHandler(createAuthRouter(makeDeps(pool)), "post", "/auth/resend-verification");
    const res = mockRes();
    await invoke(handler, mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.sent, true);
    assert.strictEqual(res.locals.audit.action, "auth.resend_verification");
    // a new verification token was persisted because none existed
    assert.ok(pool.find("SET verification_token=$1").length >= 1);
  });
});

/* ── POST /auth/login ──────────────────────────────────────────────────── */

describe("POST /auth/login", () => {
  it("400 VALIDATION on bad body", async () => {
    const handler = getHandler(createAuthRouter(makeDeps(trackingPool())), "post", "/auth/login");
    const res = mockRes();
    await invoke(handler, mockReq({ body: { email: "nope", password: "" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("401 INVALID_CREDENTIALS when user not found", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT id, role, password_hash FROM users"), respond: { rows: [], rowCount: 0 } }
    ]);
    const handler = getHandler(createAuthRouter(makeDeps(pool)), "post", "/auth/login");
    const res = mockRes();
    await invoke(handler, mockReq({ body: { email: "a@b.de", password: "password1" } }), res);
    assert.strictEqual(res._status, 401);
    assert.strictEqual(res._json.error, "INVALID_CREDENTIALS");
  });

  it("401 INVALID_CREDENTIALS when password hash mismatch", async () => {
    // bcrypt.compare against a hash that won't match the supplied password
    const wrongHash = "$2a$12$abcdefghijklmnopqrstuv0123456789012345678901234567890";
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT id, role, password_hash FROM users"),
        respond: { rows: [{ id: "u5", role: "company", password_hash: wrongHash }], rowCount: 1 } }
    ]);
    const handler = getHandler(createAuthRouter(makeDeps(pool)), "post", "/auth/login");
    const res = mockRes();
    await invoke(handler, mockReq({ body: { email: "a@b.de", password: "definitely-wrong" } }), res);
    assert.strictEqual(res._status, 401);
    assert.strictEqual(res._json.error, "INVALID_CREDENTIALS");
  });

  it("200 success: valid password → session regenerated, returns me", async () => {
    const bcrypt = (await import("bcryptjs")).default;
    const hash = await bcrypt.hash("password1", 4);
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT id, role, password_hash FROM users"),
        respond: { rows: [{ id: "u5", role: "company", password_hash: hash }], rowCount: 1 } }
      // SSO check (org_sso_config join) + TOTP check → unmatched → { rows: [] } → not enforced / no totp
    ]);
    const req = mockReq({ body: { email: "a@b.de", password: "password1" } });
    const handler = getHandler(createAuthRouter(makeDeps(pool, { id: "u5" })), "post", "/auth/login");
    const res = mockRes();
    await invoke(handler, req, res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.id, "u5");
    assert.strictEqual(req.session.userId, "u5");
    assert.strictEqual(req.session.userRole, "company");
    assert.strictEqual(res.locals.audit.action, "auth.login");
  });

  it("403 TOTP_REQUIRED when totp enabled and no token provided", async () => {
    const bcrypt = (await import("bcryptjs")).default;
    const hash = await bcrypt.hash("password1", 4);
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT id, role, password_hash FROM users"),
        respond: { rows: [{ id: "u6", role: "company", password_hash: hash }], rowCount: 1 } },
      { match: (s) => s.includes("SELECT totp_enabled FROM users"),
        respond: { rows: [{ totp_enabled: true }], rowCount: 1 } }
    ]);
    const handler = getHandler(createAuthRouter(makeDeps(pool, { id: "u6" })), "post", "/auth/login");
    const res = mockRes();
    await invoke(handler, mockReq({ body: { email: "a@b.de", password: "password1" } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "TOTP_REQUIRED");
  });
});

/* ── POST /auth/logout ─────────────────────────────────────────────────── */

describe("POST /auth/logout", () => {
  it("destroys session, clears cookie, sets no-store headers + audit", async () => {
    const handler = getHandler(createAuthRouter(makeDeps(trackingPool())), "post", "/auth/logout");
    const req = mockReq();
    const res = mockRes();
    await invoke(handler, req, res);
    assert.strictEqual(res._json.ok, true);
    assert.strictEqual(res._cleared, "tc.sid");
    assert.strictEqual(res.locals.audit.action, "auth.logout");
    assert.match(String(res._headers["cache-control"] || ""), /no-store/);
  });
});

/* ── POST /auth/forgot-password ────────────────────────────────────────── */

describe("POST /auth/forgot-password", () => {
  it("400 EMAIL_REQUIRED when email empty", async () => {
    const handler = getHandler(createAuthRouter(makeDeps(trackingPool())), "post", "/auth/forgot-password");
    const res = mockRes();
    await invoke(handler, mockReq({ body: {} }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "EMAIL_REQUIRED");
  });

  it("returns generic ok (no enumeration) when user does not exist", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT id, email FROM users WHERE email=$1"), respond: { rows: [], rowCount: 0 } }
    ]);
    const handler = getHandler(createAuthRouter(makeDeps(pool)), "post", "/auth/forgot-password");
    const res = mockRes();
    await invoke(handler, mockReq({ body: { email: "ghost@b.de" } }), res);
    assert.strictEqual(res._json.ok, true);
    assert.ok(res._json.message.includes("Falls ein Konto existiert"));
    // no reset token issued for unknown user
    assert.strictEqual(pool.find("SET reset_token=$1").length, 0);
  });

  it("sets reset token + sends mail + audit when user exists", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT id, email FROM users WHERE email=$1"),
        respond: { rows: [{ id: "u7", email: "real@b.de" }], rowCount: 1 } }
    ]);
    const handler = getHandler(createAuthRouter(makeDeps(pool)), "post", "/auth/forgot-password");
    const res = mockRes();
    await invoke(handler, mockReq({ body: { email: "Real@B.de" } }), res);
    assert.strictEqual(res._json.ok, true);
    assert.strictEqual(res.locals.audit.action, "auth.forgot_password");
    const upd = pool.find("SET reset_token=$1")[0];
    assert.ok(upd);
    assert.strictEqual(upd.params[2], "u7"); // userId param
  });
});

/* ── GET /auth/reset-password/:token ───────────────────────────────────── */

describe("GET /auth/reset-password/:token", () => {
  it("400 TOKEN_EXPIRED when token invalid/expired", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("reset_token_expires > NOW()"), respond: { rows: [], rowCount: 0 } }
    ]);
    const handler = getHandler(createAuthRouter(makeDeps(pool)), "get", "/auth/reset-password/:token");
    const res = mockRes();
    await invoke(handler, mockReq({ params: { token: "x" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "TOKEN_EXPIRED");
  });

  it("200 ok + email for valid token", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("reset_token_expires > NOW()"),
        respond: { rows: [{ id: "u8", email: "r@b.de" }], rowCount: 1 } }
    ]);
    const handler = getHandler(createAuthRouter(makeDeps(pool)), "get", "/auth/reset-password/:token");
    const res = mockRes();
    await invoke(handler, mockReq({ params: { token: "valid" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.ok, true);
    assert.strictEqual(res._json.email, "r@b.de");
  });
});

/* ── POST /auth/reset-password ─────────────────────────────────────────── */

describe("POST /auth/reset-password", () => {
  it("400 TOKEN_REQUIRED when no token", async () => {
    const handler = getHandler(createAuthRouter(makeDeps(trackingPool())), "post", "/auth/reset-password");
    const res = mockRes();
    await invoke(handler, mockReq({ body: { password: "password1" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "TOKEN_REQUIRED");
  });

  it("400 PASSWORD_TOO_SHORT when password under 8 chars", async () => {
    const handler = getHandler(createAuthRouter(makeDeps(trackingPool())), "post", "/auth/reset-password");
    const res = mockRes();
    await invoke(handler, mockReq({ body: { token: "t", password: "short" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "PASSWORD_TOO_SHORT");
  });

  it("400 TOKEN_EXPIRED when token validation fails", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("reset_token_expires > NOW()"), respond: { rows: [], rowCount: 0 } }
    ]);
    const handler = getHandler(createAuthRouter(makeDeps(pool)), "post", "/auth/reset-password");
    const res = mockRes();
    await invoke(handler, mockReq({ body: { token: "bad", password: "password1" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "TOKEN_EXPIRED");
  });

  it("200 success: resets password, sends mail, sets audit", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("reset_token_expires > NOW()"),
        respond: { rows: [{ id: "u8", email: "r@b.de" }], rowCount: 1 } }
    ]);
    const handler = getHandler(createAuthRouter(makeDeps(pool)), "post", "/auth/reset-password");
    const res = mockRes();
    await invoke(handler, mockReq({ body: { token: "valid", password: "newpassword1" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.ok, true);
    assert.strictEqual(res.locals.audit.action, "auth.password_reset");
    // password UPDATE issued for the resolved user
    const upd = pool.find("SET password_hash=$1")[0];
    assert.ok(upd);
    assert.strictEqual(upd.params[1], "u8");
  });
});

/* ── GET /auth/worker/invite/:token ────────────────────────────────────── */

describe("GET /auth/worker/invite/:token", () => {
  it("400 INVALID_TOKEN when token shorter than 32 chars", async () => {
    const handler = getHandler(createAuthRouter(makeDeps(trackingPool())), "get", "/auth/worker/invite/:token");
    const res = mockRes();
    await invoke(handler, mockReq({ params: { token: "short" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "INVALID_TOKEN");
  });

  it("404 INVITE_NOT_FOUND when no invite row", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_invites wi"), respond: { rows: [], rowCount: 0 } }
    ]);
    const handler = getHandler(createAuthRouter(makeDeps(pool)), "get", "/auth/worker/invite/:token");
    const res = mockRes();
    await invoke(handler, mockReq({ params: { token: HEX64 } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "INVITE_NOT_FOUND");
  });

  it("409 INVITE_ALREADY_USED for accepted invite", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_invites wi"),
        respond: { rows: [{ status: "accepted", email: "w@b.de", expires_at: new Date(Date.now() + 1e6).toISOString() }], rowCount: 1 } }
    ]);
    const handler = getHandler(createAuthRouter(makeDeps(pool)), "get", "/auth/worker/invite/:token");
    const res = mockRes();
    await invoke(handler, mockReq({ params: { token: HEX64 } }), res);
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._json.error, "INVITE_ALREADY_USED");
  });

  it("410 INVITE_EXPIRED for past expires_at", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_invites wi"),
        respond: { rows: [{ status: "pending", email: "w@b.de", expires_at: new Date(Date.now() - 1e6).toISOString() }], rowCount: 1 } }
    ]);
    const handler = getHandler(createAuthRouter(makeDeps(pool)), "get", "/auth/worker/invite/:token");
    const res = mockRes();
    await invoke(handler, mockReq({ params: { token: HEX64 } }), res);
    assert.strictEqual(res._status, 410);
    assert.strictEqual(res._json.error, "INVITE_EXPIRED");
  });

  it("200 valid invite returns invite details", async () => {
    const exp = new Date(Date.now() + 1e6).toISOString();
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_invites wi"),
        respond: { rows: [{
          status: "pending", email: "w@b.de", first_name: "Wanda", last_name: "Worker",
          supplier_org_name: "Supplier GmbH", expires_at: exp
        }], rowCount: 1 } }
    ]);
    const handler = getHandler(createAuthRouter(makeDeps(pool)), "get", "/auth/worker/invite/:token");
    const res = mockRes();
    await invoke(handler, mockReq({ params: { token: HEX64 } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.valid, true);
    assert.strictEqual(res._json.email, "w@b.de");
    assert.strictEqual(res._json.supplier_org_name, "Supplier GmbH");
  });
});

/* ── POST /auth/worker/accept-invite ───────────────────────────────────── */

describe("POST /auth/worker/accept-invite", () => {
  it("400 TOKEN_REQUIRED when no token", async () => {
    const handler = getHandler(createAuthRouter(makeDeps(trackingPool())), "post", "/auth/worker/accept-invite");
    const res = mockRes();
    await invoke(handler, mockReq({ body: { password: "password1" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "TOKEN_REQUIRED");
  });

  it("400 PASSWORD_TOO_SHORT when password under 8 chars", async () => {
    const handler = getHandler(createAuthRouter(makeDeps(trackingPool())), "post", "/auth/worker/accept-invite");
    const res = mockRes();
    await invoke(handler, mockReq({ body: { token: "t", password: "short" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "PASSWORD_TOO_SHORT");
  });

  it("404 INVITE_NOT_FOUND mapped from service result", async () => {
    // acceptInvite calls getInviteByToken first → no row → { error: "INVITE_NOT_FOUND" }
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_invites wi"), respond: { rows: [], rowCount: 0 } }
    ]);
    const handler = getHandler(createAuthRouter(makeDeps(pool)), "post", "/auth/worker/accept-invite");
    const res = mockRes();
    await invoke(handler, mockReq({ body: { token: "some-token", password: "password1" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "INVITE_NOT_FOUND");
  });

  it("409 INVITE_ALREADY_USED mapped from service result", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_invites wi"),
        respond: { rows: [{ status: "accepted", expires_at: new Date(Date.now() + 1e6).toISOString() }], rowCount: 1 } }
    ]);
    const handler = getHandler(createAuthRouter(makeDeps(pool)), "post", "/auth/worker/accept-invite");
    const res = mockRes();
    await invoke(handler, mockReq({ body: { token: "some-token", password: "password1" } }), res);
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._json.error, "INVITE_ALREADY_USED");
  });
});
