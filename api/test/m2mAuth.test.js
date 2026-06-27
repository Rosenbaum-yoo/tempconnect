/**
 * m2mAuth.test.js — OIDC client_credentials M2M-Auth (Welle B1).
 * Token-Crypto (sign/verify, Tamper/Expiry/alg), /oauth/token-Endpoint (flag OFF/ON, creds),
 * apiKeyAuth-Akzeptanz von M2M-Bearer-JWTs.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { signM2MToken, verifyM2MToken, M2M_TOKEN_TTL_SECONDS } from "../services/m2mTokenService.js";
import { createOAuthRouter } from "../routes/oauth.js";
import { apiKeyAuthMiddleware } from "../middleware/apiKeyAuth.js";

const SECRET = "test-jwt-secret-0123456789";

describe("m2mTokenService — sign/verify", () => {
  it("Roundtrip: Payload mit org_id + scope + exp", () => {
    const { token, expires_in, payload } = signM2MToken({ orgId: "org-1", scopes: ["read:invoices", "write:timesheets"], keyId: "key-1", secret: SECRET });
    assert.equal(expires_in, M2M_TOKEN_TTL_SECONDS);
    assert.equal(payload.org_id, "org-1");
    assert.equal(payload.scope, "read:invoices write:timesheets");
    const v = verifyM2MToken(token, SECRET);
    assert.ok(v);
    assert.equal(v.org_id, "org-1");
    assert.equal(v.scope, "read:invoices write:timesheets");
    assert.equal(v.token_use, "m2m");
  });

  it("falsches Secret → null", () => {
    const { token } = signM2MToken({ orgId: "org-1", scopes: [], secret: SECRET });
    assert.equal(verifyM2MToken(token, "anderes-secret"), null);
  });

  it("manipuliertes Payload → null (Signatur bricht)", () => {
    const { token } = signM2MToken({ orgId: "org-1", scopes: ["read:invoices"], secret: SECRET });
    const [h, , s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ iss: "tempconnect", aud: "tempconnect-api", org_id: "org-EVIL", scope: "admin", token_use: "m2m", exp: 9999999999 })).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    assert.equal(verifyM2MToken(h + "." + forged + "." + s, SECRET), null);
  });

  it("abgelaufen → null", () => {
    const { token } = signM2MToken({ orgId: "org-1", scopes: [], secret: SECRET });
    assert.equal(verifyM2MToken(token, SECRET, { now: new Date(Date.now() + (M2M_TOKEN_TTL_SECONDS + 120) * 1000) }), null);
  });

  it("alg=none / Header-Manipulation → null", () => {
    const none = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const pl = Buffer.from(JSON.stringify({ iss: "tempconnect", aud: "tempconnect-api", org_id: "org-1", token_use: "m2m", exp: 9999999999 })).toString("base64url");
    // mit echtem HMAC über den none-Header → Sig stimmt, aber alg-Check muss greifen
    const sig = crypto.createHmac("sha256", SECRET).update(none + "." + pl).digest().toString("base64url");
    assert.equal(verifyM2MToken(none + "." + pl + "." + sig, SECRET), null);
  });

  it("Müll-Token → null (kein Crash)", () => {
    assert.equal(verifyM2MToken("nicht.ein.jwt", SECRET), null);
    assert.equal(verifyM2MToken("", SECRET), null);
    assert.equal(verifyM2MToken(null, SECRET), null);
  });
});

/* ── /oauth/token ───────────────────────────────────────────── */
function mockPool(record) {
  return { query: async () => ({ rows: record ? [record] : [], rowCount: record ? 1 : 0 }), connect: async () => ({ query: async () => ({ rows: [] }), release() {} }) };
}
function getHandler(router, method, path) {
  const l = router.stack.find((x) => x.route && x.route.path === path && x.route.methods[method]);
  return l ? l.route.stack[l.route.stack.length - 1].handle : null;
}
function mockRes() {
  return { _s: 200, _j: null, status(c) { this._s = c; return this; }, json(b) { this._j = b; return this; } };
}
const KEY = "tc_live_abcdefabcdefabcdefabcdefabcdef"; // entspricht hashKey-Eingabe

describe("/oauth/token — client_credentials", () => {
  const baseDeps = (cfg) => ({ pool: mockPool({ id: "key-1", org_id: "org-1", scopes: ["read:invoices"] }), logger: { error() {}, info() {} }, config: { JWT_SECRET: SECRET, BASE_URL: "https://x", ...cfg } });

  it("Flag AUS → 404 (Endpoint inert)", async () => {
    const r = createOAuthRouter(baseDeps({ OAUTH_M2M_ENABLED: false }));
    const res = mockRes();
    await getHandler(r, "post", "/oauth/token")({ body: { grant_type: "client_credentials", client_secret: KEY }, headers: {} }, res);
    assert.equal(res._s, 404);
  });

  it("Flag AN + gültiges client_secret → 200 access_token (verifizierbar)", async () => {
    const r = createOAuthRouter(baseDeps({ OAUTH_M2M_ENABLED: true }));
    const res = mockRes();
    await getHandler(r, "post", "/oauth/token")({ body: { grant_type: "client_credentials", client_secret: KEY }, headers: {} }, res);
    assert.equal(res._s, 200);
    assert.equal(res._j.token_type, "Bearer");
    assert.ok(res._j.access_token);
    const v = verifyM2MToken(res._j.access_token, SECRET);
    assert.equal(v.org_id, "org-1");
    assert.equal(v.scope, "read:invoices");
  });

  it("Flag AN + ungültiges client_secret → 401 invalid_client", async () => {
    const deps = baseDeps({ OAUTH_M2M_ENABLED: true }); deps.pool = mockPool(null);
    const r = createOAuthRouter(deps);
    const res = mockRes();
    await getHandler(r, "post", "/oauth/token")({ body: { grant_type: "client_credentials", client_secret: KEY }, headers: {} }, res);
    assert.equal(res._s, 401);
    assert.equal(res._j.error, "invalid_client");
  });

  it("client_id ≠ Key-ID → 401", async () => {
    const r = createOAuthRouter(baseDeps({ OAUTH_M2M_ENABLED: true }));
    const res = mockRes();
    await getHandler(r, "post", "/oauth/token")({ body: { grant_type: "client_credentials", client_id: "falsche-id", client_secret: KEY }, headers: {} }, res);
    assert.equal(res._s, 401);
  });

  it("falscher grant_type → 400", async () => {
    const r = createOAuthRouter(baseDeps({ OAUTH_M2M_ENABLED: true }));
    const res = mockRes();
    await getHandler(r, "post", "/oauth/token")({ body: { grant_type: "password" }, headers: {} }, res);
    assert.equal(res._s, 400);
  });

  it("Discovery-Endpoint nennt token_endpoint", async () => {
    const r = createOAuthRouter(baseDeps({ OAUTH_M2M_ENABLED: true }));
    const res = mockRes();
    await getHandler(r, "get", "/.well-known/openid-configuration")({ headers: {} }, res);
    assert.match(res._j.token_endpoint, /\/api\/oauth\/token$/);
    assert.deepEqual(res._j.grant_types_supported, ["client_credentials"]);
  });
});

/* ── apiKeyAuth: M2M-Bearer-Akzeptanz + Live-Revocation ─────── */
describe("apiKeyAuthMiddleware — M2M-JWT-Bearer", () => {
  const stubPool = { query: async () => ({ rows: [] }) };
  const log = { warn() {}, error() {} };
  it("Flag AN + gültiges JWT + aktiver Key → setzt orgId + scopes + isApiKeyAuth", async () => {
    const { token } = signM2MToken({ orgId: "org-9", scopes: ["read:workers"], keyId: "key-9", secret: SECRET });
    const pool = mockPool({ id: "key-9", org_id: "org-9", scopes: ["read:workers"], is_active: true });
    const mw = apiKeyAuthMiddleware(pool, { logger: log, config: { OAUTH_M2M_ENABLED: true, JWT_SECRET: SECRET } });
    const req = { headers: { authorization: "Bearer " + token } };
    let nexted = false;
    await mw(req, {}, () => { nexted = true; });
    assert.ok(nexted);
    assert.equal(req.orgId, "org-9");
    assert.deepEqual(req.apiKeyScopes, ["read:workers"]);
    assert.equal(req.isApiKeyAuth, true);
    assert.equal(req.isM2mToken, true);
    assert.equal(req.apiKeyId, "key-9");
  });

  it("gültiges JWT aber Key widerrufen/unbekannt → KEIN Kontext (Revoke greift sofort, nicht erst bei exp)", async () => {
    const { token } = signM2MToken({ orgId: "org-9", scopes: ["read:workers"], keyId: "key-9", secret: SECRET });
    const pool = mockPool(null); // lookupById findet nichts (is_active=FALSE / rotiert / gelöscht)
    const mw = apiKeyAuthMiddleware(pool, { logger: log, config: { OAUTH_M2M_ENABLED: true, JWT_SECRET: SECRET } });
    const req = { headers: { authorization: "Bearer " + token } };
    let nexted = false;
    await mw(req, {}, () => { nexted = true; });
    assert.ok(nexted);
    assert.equal(req.orgId, undefined);
    assert.equal(req.isApiKeyAuth, undefined);
  });

  it("Key gehört anderer Org als das Token → KEIN Kontext (Org-Boundary)", async () => {
    const { token } = signM2MToken({ orgId: "org-9", scopes: ["read:workers"], keyId: "key-9", secret: SECRET });
    const pool = mockPool({ id: "key-9", org_id: "org-OTHER", scopes: ["read:workers"], is_active: true });
    const mw = apiKeyAuthMiddleware(pool, { logger: log, config: { OAUTH_M2M_ENABLED: true, JWT_SECRET: SECRET } });
    const req = { headers: { authorization: "Bearer " + token } };
    await mw(req, {}, () => {});
    assert.equal(req.orgId, undefined);
    assert.equal(req.isApiKeyAuth, undefined);
  });

  it("Scope auf dem Key entzogen → effektive Scopes reduziert (Token-Grant ∩ Key-Stand)", async () => {
    const { token } = signM2MToken({ orgId: "org-9", scopes: ["admin:scim", "read:invoices"], keyId: "key-9", secret: SECRET });
    const pool = mockPool({ id: "key-9", org_id: "org-9", scopes: ["read:invoices"], is_active: true }); // admin:scim entzogen
    const mw = apiKeyAuthMiddleware(pool, { logger: log, config: { OAUTH_M2M_ENABLED: true, JWT_SECRET: SECRET } });
    const req = { headers: { authorization: "Bearer " + token } };
    await mw(req, {}, () => {});
    assert.deepEqual(req.apiKeyScopes, ["read:invoices"]);
  });

  it("Key hat 'admin' → hierarchischer Token-Scope admin:scim bleibt erhalten", async () => {
    const { token } = signM2MToken({ orgId: "org-9", scopes: ["admin:scim"], keyId: "key-9", secret: SECRET });
    const pool = mockPool({ id: "key-9", org_id: "org-9", scopes: ["admin"], is_active: true });
    const mw = apiKeyAuthMiddleware(pool, { logger: log, config: { OAUTH_M2M_ENABLED: true, JWT_SECRET: SECRET } });
    const req = { headers: { authorization: "Bearer " + token } };
    await mw(req, {}, () => {});
    assert.deepEqual(req.apiKeyScopes, ["admin:scim"]);
  });

  it("Flag AUS → JWT ignoriert (kein Kontext, kein DB-Lookup)", async () => {
    const { token } = signM2MToken({ orgId: "org-9", scopes: ["read:workers"], keyId: "key-9", secret: SECRET });
    const mw = apiKeyAuthMiddleware(stubPool, { logger: log, config: { OAUTH_M2M_ENABLED: false, JWT_SECRET: SECRET } });
    const req = { headers: { authorization: "Bearer " + token } };
    await mw(req, {}, () => {});
    assert.equal(req.orgId, undefined);
    assert.equal(req.isApiKeyAuth, undefined);
  });

  it("ungültiges JWT → kein Kontext (fällt durch zu Session)", async () => {
    const mw = apiKeyAuthMiddleware(stubPool, { logger: log, config: { OAUTH_M2M_ENABLED: true, JWT_SECRET: SECRET } });
    const req = { headers: { authorization: "Bearer aaa.bbb.ccc" } };
    let nexted = false;
    await mw(req, {}, () => { nexted = true; });
    assert.ok(nexted);
    assert.equal(req.orgId, undefined);
  });
});
