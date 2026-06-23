/**
 * Offer Assets router handler coverage tests.
 *
 * Covers createOfferAssetsRouter(deps):
 *   GET    /offer-assets/batch-logos
 *   POST   /offer-assets/:offerId/upload
 *   GET    /offer-assets/:offerId
 *   DELETE /offer-assets/:assetId
 *
 * Strategy: construct the router with mocked deps (pool that dispatches by SQL
 * substring, passthrough requireAuth, silent logger), extract handlers from
 * router.stack, invoke with mock req/res recorders, assert response shape,
 * status codes and SQL parameters.
 *
 * Ownership: canAccessAsOwner(pool, ownerId, sessionUserId) short-circuits to
 * true when ownerId === sessionUserId (no pool call), so tests control owner
 * vs. forbidden purely via the company-id value vs. req.session.userId.
 *
 * Run: node --test --test-force-exit test/offerAssets.route.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createOfferAssetsRouter } from "../routes/offerAssets.js";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const ASSET_ID = "33333333-3333-4333-8333-333333333333";
const OWNER = "owner-user-1";

/* ── Mock helpers ───────────────────────────────────── */

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

/**
 * Pool that records every call and dispatches a response based on which SQL
 * branch is hit (matched by a stable substring). `handlers` maps a substring →
 * (sql, params) => ({ rows }). First matching substring wins; default { rows: [] }.
 */
function dispatchPool(handlers = []) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      for (const [needle, fn] of handlers) {
        if (sql.includes(needle)) return fn(sql, params);
      }
      return { rows: [] };
    }
  };
}

function mockReq(overrides = {}) {
  return {
    session: { userId: OWNER },
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
    _send: null,
    locals: {},
    status(code) { res._status = code; return res; },
    json(payload) { res._json = payload; return res; },
    send(payload) { res._send = payload; return res; },
    setHeader() { return res; },
    set() { return res; },
    type() { return res; },
    end() { return res; }
  };
  return res;
}

function createDeps(pool) {
  return {
    pool,
    logger: mockLogger(),
    requireAuth: (_req, _res, next) => next()
  };
}

function getRouteHandler(router, method, exactPath) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== exactPath) continue;
    if (!layer.route.methods[method]) continue;
    return layer.route.stack[layer.route.stack.length - 1].handle;
  }
  throw new Error(`Route ${method.toUpperCase()} ${exactPath} not found`);
}

/* ── Router registration sanity ─────────────────────── */

describe("offerAssets router — registration", () => {
  it("registers all four routes", () => {
    const router = createOfferAssetsRouter(createDeps(dispatchPool()));
    const seen = router.stack
      .filter((l) => l.route)
      .map((l) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);
    assert.ok(seen.includes("GET /offer-assets/batch-logos"));
    assert.ok(seen.includes("POST /offer-assets/:offerId/upload"));
    assert.ok(seen.includes("GET /offer-assets/:offerId"));
    assert.ok(seen.includes("DELETE /offer-assets/:assetId"));
  });
});

/* ── GET /offer-assets/batch-logos ──────────────────── */

describe("offerAssets — GET /offer-assets/batch-logos", () => {
  it("returns empty object when ids query is missing", async () => {
    const pool = dispatchPool();
    const router = createOfferAssetsRouter(createDeps(pool));
    const handler = getRouteHandler(router, "get", "/offer-assets/batch-logos");
    const req = mockReq({ query: {} });
    const res = mockRes();

    await handler(req, res, () => {});

    assert.strictEqual(res._status, 200);
    assert.deepStrictEqual(res._json, { success: true, data: {}, error: null });
    assert.strictEqual(pool.calls.length, 0, "must not query DB for empty ids");
  });

  it("returns empty object when no id passes UUID filter", async () => {
    const pool = dispatchPool();
    const router = createOfferAssetsRouter(createDeps(pool));
    const handler = getRouteHandler(router, "get", "/offer-assets/batch-logos");
    const req = mockReq({ query: { ids: "not-a-uuid,also-bad" } });
    const res = mockRes();

    await handler(req, res, () => {});

    assert.strictEqual(res._status, 200);
    assert.deepStrictEqual(res._json.data, {});
    assert.strictEqual(pool.calls.length, 0);
  });

  it("maps entity_id → file_path from offer_assets logo query", async () => {
    const pool = dispatchPool([
      ["FROM offer_assets", () => ({
        rows: [{ entity_id: UUID_A, file_path: "uploads/offers/a/logo.png" }]
      })]
    ]);
    const router = createOfferAssetsRouter(createDeps(pool));
    const handler = getRouteHandler(router, "get", "/offer-assets/batch-logos");
    // both ids valid; UUID_A has an asset, UUID_B falls through to fallback (empty)
    const req = mockReq({ query: { ids: `${UUID_A},${UUID_B}` } });
    const res = mockRes();

    await handler(req, res, () => {});

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data[UUID_A], "uploads/offers/a/logo.png");
    // First query gets the parsed UUID array
    assert.deepStrictEqual(pool.calls[0].params[0], [UUID_A, UUID_B]);
    assert.match(pool.calls[0].sql, /asset_type = 'logo'/);
  });

  it("falls back to company/org logo for missing ids", async () => {
    const pool = dispatchPool([
      ["FROM offer_assets", () => ({ rows: [] })],
      ["FROM capacity_posts cp", () => ({
        rows: [{ entity_id: UUID_B, file_path: "uploads/company-logo.png" }]
      })]
    ]);
    const router = createOfferAssetsRouter(createDeps(pool));
    const handler = getRouteHandler(router, "get", "/offer-assets/batch-logos");
    const req = mockReq({ query: { ids: UUID_B } });
    const res = mockRes();

    await handler(req, res, () => {});

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data[UUID_B], "uploads/company-logo.png");
    // Fallback query receives only the missing ids
    const fallbackCall = pool.calls.find((c) => c.sql.includes("FROM capacity_posts cp"));
    assert.ok(fallbackCall);
    assert.deepStrictEqual(fallbackCall.params[0], [UUID_B]);
  });

  it("forwards errors to next() on query failure", async () => {
    const pool = {
      query: async () => { throw new Error("db down"); }
    };
    const router = createOfferAssetsRouter(createDeps(pool));
    const handler = getRouteHandler(router, "get", "/offer-assets/batch-logos");
    const req = mockReq({ query: { ids: UUID_A } });
    const res = mockRes();
    let nextErr = null;

    await handler(req, res, (err) => { nextErr = err; });

    assert.ok(nextErr instanceof Error);
    assert.strictEqual(nextErr.message, "db down");
  });
});

/* ── GET /offer-assets/:offerId ─────────────────────── */

describe("offerAssets — GET /offer-assets/:offerId", () => {
  it("returns 400 VALIDATION for invalid UUID", async () => {
    const pool = dispatchPool();
    const router = createOfferAssetsRouter(createDeps(pool));
    const handler = getRouteHandler(router, "get", "/offer-assets/:offerId");
    const req = mockReq({ params: { offerId: "bad-id" } });
    const res = mockRes();

    await handler(req, res, () => {});

    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "VALIDATION");
    assert.strictEqual(pool.calls.length, 0);
  });

  it("returns 404 NOT_FOUND when entity does not resolve", async () => {
    // All resolveEntity queries return empty → found:false
    const pool = dispatchPool();
    const router = createOfferAssetsRouter(createDeps(pool));
    const handler = getRouteHandler(router, "get", "/offer-assets/:offerId");
    const req = mockReq({ params: { offerId: UUID_A } });
    const res = mockRes();

    await handler(req, res, () => {});

    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
  });

  it("groups supply assets by type and merges compliance card docs", async () => {
    const pool = dispatchPool([
      // resolveEntity: offers empty, capacity_posts hit (supply) with org_id
      ["FROM offers o", () => ({ rows: [] })],
      ["FROM capacity_posts WHERE id", () => ({
        rows: [{ id: UUID_A, owner_company_id: OWNER, org_id: "org-9" }]
      })],
      // assets list query uses offer_id column for supply
      ["FROM offer_assets WHERE", () => ({
        rows: [
          { id: "a1", asset_type: "logo", file_path: "l.png" },
          { id: "a2", asset_type: "logo", file_path: "l2.png" }, // second logo ignored
          { id: "a3", asset_type: "safety", file_path: "s.png" },
          { id: "a4", asset_type: "gallery", file_path: "g.png" },
          { id: "a5", asset_type: "compliance", file_path: "c.png" },
          { id: "a6", asset_type: "deal_document", file_path: "d.pdf" }
        ]
      })],
      // compliance_documents merge
      ["FROM compliance_documents", () => ({
        rows: [{
          id: "cd1", doc_type: "insurance", doc_name: "Police", file_ref: "ref.pdf",
          status: "verified", valid_until: "2027-01-01"
        }]
      })]
    ]);
    const router = createOfferAssetsRouter(createDeps(pool));
    const handler = getRouteHandler(router, "get", "/offer-assets/:offerId");
    const req = mockReq({ params: { offerId: UUID_A } });
    const res = mockRes();

    await handler(req, res, () => {});

    assert.strictEqual(res._status, 200);
    const data = res._json.data;
    assert.strictEqual(data.logo.id, "a1", "first logo wins");
    assert.strictEqual(data.safety_images.length, 1);
    assert.strictEqual(data.gallery.length, 1);
    assert.strictEqual(data.deal_documents.length, 1);
    // own compliance asset + 1 merged compliance-card doc
    assert.strictEqual(data.compliance_docs.length, 2);
    const merged = data.compliance_docs.find((d) => d.source_type === "compliance_card");
    assert.ok(merged);
    assert.strictEqual(merged.compliance_status, "verified");
    assert.strictEqual(merged.compliance_doc_type, "insurance");
    // assets query keyed by offer_id for supply
    const assetsCall = pool.calls.find((c) => c.sql.includes("FROM offer_assets WHERE"));
    assert.match(assetsCall.sql, /offer_id = \$1/);
    assert.deepStrictEqual(assetsCall.params, [UUID_A]);
  });

  it("uses demand_request_id column for demand entity and no compliance merge", async () => {
    const pool = dispatchPool([
      ["FROM offers o", () => ({ rows: [] })],
      ["FROM capacity_posts WHERE id", () => ({ rows: [] })],
      ["FROM demand_requests WHERE id", () => ({
        rows: [{ id: UUID_A, owner_company_id: OWNER }]
      })],
      ["FROM offer_assets WHERE", () => ({ rows: [] })]
    ]);
    const router = createOfferAssetsRouter(createDeps(pool));
    const handler = getRouteHandler(router, "get", "/offer-assets/:offerId");
    const req = mockReq({ params: { offerId: UUID_A } });
    const res = mockRes();

    await handler(req, res, () => {});

    assert.strictEqual(res._status, 200);
    assert.deepStrictEqual(res._json.data.compliance_docs, []);
    const assetsCall = pool.calls.find((c) => c.sql.includes("FROM offer_assets WHERE"));
    assert.match(assetsCall.sql, /demand_request_id = \$1/);
    // compliance_documents must NOT be queried for demand entity
    assert.ok(!pool.calls.some((c) => c.sql.includes("FROM compliance_documents")));
  });

  it("uses marketplace_offer_id column for deal entity", async () => {
    const pool = dispatchPool([
      ["FROM offers o", () => ({
        rows: [{ id: UUID_A, requester_company_id: "req-1", supplier_company_id: "sup-1" }]
      })],
      ["FROM offer_assets WHERE", () => ({ rows: [] })]
    ]);
    const router = createOfferAssetsRouter(createDeps(pool));
    const handler = getRouteHandler(router, "get", "/offer-assets/:offerId");
    const req = mockReq({ params: { offerId: UUID_A } });
    const res = mockRes();

    await handler(req, res, () => {});

    assert.strictEqual(res._status, 200);
    const assetsCall = pool.calls.find((c) => c.sql.includes("FROM offer_assets WHERE"));
    assert.match(assetsCall.sql, /marketplace_offer_id = \$1/);
  });

  it("swallows compliance lookup failure but still returns 200", async () => {
    const pool = dispatchPool([
      ["FROM offers o", () => ({ rows: [] })],
      ["FROM capacity_posts WHERE id", () => ({
        rows: [{ id: UUID_A, owner_company_id: OWNER, org_id: "org-x" }]
      })],
      ["FROM offer_assets WHERE", () => ({ rows: [] })],
      ["FROM compliance_documents", () => { throw new Error("compliance table missing"); }]
    ]);
    const router = createOfferAssetsRouter(createDeps(pool));
    const handler = getRouteHandler(router, "get", "/offer-assets/:offerId");
    const req = mockReq({ params: { offerId: UUID_A } });
    const res = mockRes();
    let nextErr = null;

    await handler(req, res, (err) => { nextErr = err; });

    assert.strictEqual(nextErr, null, "compliance failure must not bubble to next()");
    assert.strictEqual(res._status, 200);
    assert.deepStrictEqual(res._json.data.compliance_docs, []);
  });
});

/* ── POST /offer-assets/:offerId/upload ─────────────── */

describe("offerAssets — POST /offer-assets/:offerId/upload (final handler)", () => {
  // The final handler runs AFTER multer; we invoke it directly with req.file set.
  function postHandler(pool) {
    const router = createOfferAssetsRouter(createDeps(pool));
    return getRouteHandler(router, "post", "/offer-assets/:offerId/upload");
  }
  const fileFixture = {
    path: "/tmp/never-unlinked-uuid-guard",
    filename: "abc123.png",
    originalname: "logo.png",
    mimetype: "image/png",
    size: 1234
  };

  it("returns 400 VALIDATION for invalid offerId UUID", async () => {
    const pool = dispatchPool();
    const handler = postHandler(pool);
    const req = mockReq({ params: { offerId: "bad" }, body: { asset_type: "logo" } });
    const res = mockRes();

    await handler(req, res, () => {});

    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "VALIDATION");
    assert.match(res._json.error.message, /Eintrags-ID/);
  });

  it("returns 400 VALIDATION for invalid asset_type", async () => {
    const pool = dispatchPool();
    const handler = postHandler(pool);
    const req = mockReq({ params: { offerId: UUID_A }, body: { asset_type: "banner" } });
    const res = mockRes();

    await handler(req, res, () => {});

    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "VALIDATION");
    assert.match(res._json.error.message, /asset_type/);
  });

  it("returns 404 when entity not found", async () => {
    const pool = dispatchPool(); // all resolveEntity queries empty
    const handler = postHandler(pool);
    const req = mockReq({ params: { offerId: UUID_A }, body: { asset_type: "logo" } });
    const res = mockRes();

    await handler(req, res, () => {});

    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
  });

  it("returns 403 when caller is not the owner", async () => {
    const pool = dispatchPool([
      ["FROM offers o", () => ({ rows: [] })],
      ["FROM capacity_posts WHERE id", () => ({
        rows: [{ id: UUID_A, owner_company_id: "someone-else", org_id: null }]
      })]
      // canAccessAsOwner: ownerId !== sessionUserId → org_memberships query → empty
    ]);
    const handler = postHandler(pool);
    const req = mockReq({ params: { offerId: UUID_A }, body: { asset_type: "logo" } });
    const res = mockRes();

    await handler(req, res, () => {});

    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error.code, "FORBIDDEN");
  });

  it("returns 400 when owner but no file uploaded", async () => {
    const pool = dispatchPool([
      ["FROM offers o", () => ({ rows: [] })],
      ["FROM capacity_posts WHERE id", () => ({
        rows: [{ id: UUID_A, owner_company_id: OWNER, org_id: null }]
      })]
    ]);
    const handler = postHandler(pool);
    const req = mockReq({ params: { offerId: UUID_A }, body: { asset_type: "gallery" } });
    const res = mockRes(); // no req.file

    await handler(req, res, () => {});

    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "VALIDATION");
    assert.match(res._json.error.message, /Keine Datei/);
  });

  it("inserts a gallery asset for a supply entity (offer_id FK) and returns 201", async () => {
    const inserted = { id: "new-asset-1", asset_type: "gallery" };
    const pool = dispatchPool([
      ["FROM offers o", () => ({ rows: [] })],
      ["FROM capacity_posts WHERE id", () => ({
        rows: [{ id: UUID_A, owner_company_id: OWNER, org_id: null }]
      })],
      ["INSERT INTO offer_assets", () => ({ rows: [inserted] })]
    ]);
    const handler = postHandler(pool);
    const req = mockReq({
      params: { offerId: UUID_A },
      body: { asset_type: "gallery" },
      file: { ...fileFixture, originalname: "pic.png" }
    });
    const res = mockRes();

    await handler(req, res, () => {});

    assert.strictEqual(res._status, 201);
    assert.strictEqual(res._json.data.id, "new-asset-1");
    const insert = pool.calls.find((c) => c.sql.includes("INSERT INTO offer_assets"));
    // FK columns: supply → offer_id set, demand/marketplace null
    assert.strictEqual(insert.params[0], UUID_A, "offer_id FK");
    assert.strictEqual(insert.params[1], null, "demand_request_id null");
    assert.strictEqual(insert.params[2], null, "marketplace_offer_id null");
    assert.strictEqual(insert.params[3], "gallery", "asset_type");
    assert.match(insert.params[4], /^uploads\/offers\//, "relative path normalized");
    assert.strictEqual(insert.params[5], "pic.png");
    assert.strictEqual(insert.params[6], "image/png");
    assert.strictEqual(insert.params[7], 1234);
    // audit shape for non-deal entity
    assert.strictEqual(res.locals.audit.action, "offer_asset.upload");
    assert.strictEqual(res.locals.audit.entity_type, "offer_asset");
    assert.strictEqual(res.locals.audit.entity_id, "new-asset-1");
    assert.strictEqual(res.locals.audit.details.offer_id, UUID_A);
  });

  it("replaces existing logo before inserting a new logo", async () => {
    const inserted = { id: "logo-new", asset_type: "logo" };
    const pool = dispatchPool([
      ["FROM offers o", () => ({ rows: [] })],
      ["FROM capacity_posts WHERE id", () => ({
        rows: [{ id: UUID_A, owner_company_id: OWNER, org_id: null }]
      })],
      ["SELECT id, file_path FROM offer_assets", () => ({
        rows: [{ id: "old-logo", file_path: "uploads/offers/old.png" }]
      })],
      ["DELETE FROM offer_assets", () => ({ rows: [] })],
      ["INSERT INTO offer_assets", () => ({ rows: [inserted] })]
    ]);
    const handler = postHandler(pool);
    const req = mockReq({
      params: { offerId: UUID_A },
      body: { asset_type: "logo" },
      file: { ...fileFixture }
    });
    const res = mockRes();

    await handler(req, res, () => {});

    assert.strictEqual(res._status, 201);
    // existing-logo lookup keyed by offer_id and asset_type='logo'
    const lookup = pool.calls.find((c) => c.sql.includes("SELECT id, file_path FROM offer_assets"));
    assert.match(lookup.sql, /offer_id = \$1 AND asset_type = 'logo'/);
    // old logo deleted by id
    const del = pool.calls.find((c) => c.sql.startsWith("DELETE FROM offer_assets"));
    assert.deepStrictEqual(del.params, ["old-logo"]);
  });

  it("deal entity: deal_document upload creates record and links back (marketplace_offer_id FK)", async () => {
    const inserted = { id: "deal-asset-1", asset_type: "deal_document" };
    const pool = dispatchPool([
      // resolveEntity: offers hit → deal, owner is the session user (counterparty)
      ["FROM offers o", () => ({
        rows: [{ id: UUID_A, requester_company_id: OWNER, supplier_company_id: "sup-2" }]
      })],
      ["INSERT INTO offer_assets", () => ({ rows: [inserted] })],
      // createUploadedDocumentRecord version lookup
      ["next_version", () => ({ rows: [{ next_version: 1 }] })],
      // createUploadedDocumentRecord insert
      ["INSERT INTO deal_documents", () => ({ rows: [{ id: "doc-1" }] })],
      // offers agreement_ref lookup
      ["SELECT agreement_ref FROM offers", () => ({ rows: [{ agreement_ref: "AGR-7" }] })],
      ["UPDATE offer_assets SET deal_document_id", () => ({ rows: [] })]
    ]);
    const handler = postHandler(pool);
    const req = mockReq({
      params: { offerId: UUID_A },
      body: { asset_type: "deal_document" },
      file: { ...fileFixture, originalname: "contract.pdf", mimetype: "application/pdf" }
    });
    const res = mockRes();

    await handler(req, res, () => {});

    assert.strictEqual(res._status, 201);
    // FK: deal → marketplace_offer_id set, offer_id + demand_request_id null
    const insert = pool.calls.find((c) => c.sql.includes("INSERT INTO offer_assets"));
    assert.strictEqual(insert.params[0], null, "offer_id null for deal");
    assert.strictEqual(insert.params[1], null, "demand_request_id null for deal");
    assert.strictEqual(insert.params[2], UUID_A, "marketplace_offer_id FK");
    // deal_document linked back
    const link = pool.calls.find((c) => c.sql.includes("UPDATE offer_assets SET deal_document_id"));
    assert.ok(link);
    assert.deepStrictEqual(link.params, ["deal-asset-1", "doc-1"]);
    assert.strictEqual(res._json.data.deal_document_id, "doc-1");
    // audit shape for deal entity → entity_type offer, entity_id offerId
    assert.strictEqual(res.locals.audit.entity_type, "offer");
    assert.strictEqual(res.locals.audit.entity_id, UUID_A);
  });

  it("forwards DB errors to next()", async () => {
    const pool = dispatchPool([
      ["FROM offers o", () => ({ rows: [] })],
      ["FROM capacity_posts WHERE id", () => ({
        rows: [{ id: UUID_A, owner_company_id: OWNER, org_id: null }]
      })],
      ["INSERT INTO offer_assets", () => { throw new Error("insert failed"); }]
    ]);
    const handler = postHandler(pool);
    const req = mockReq({
      params: { offerId: UUID_A },
      body: { asset_type: "gallery" },
      file: { ...fileFixture }
    });
    const res = mockRes();
    let nextErr = null;

    await handler(req, res, (err) => { nextErr = err; });

    assert.ok(nextErr instanceof Error);
    assert.strictEqual(nextErr.message, "insert failed");
  });
});

/* ── DELETE /offer-assets/:assetId ──────────────────── */

describe("offerAssets — DELETE /offer-assets/:assetId", () => {
  function delHandler(pool) {
    const router = createOfferAssetsRouter(createDeps(pool));
    return getRouteHandler(router, "delete", "/offer-assets/:assetId");
  }

  it("returns 404 when asset row not found", async () => {
    const pool = dispatchPool(); // lookup empty
    const handler = delHandler(pool);
    const req = mockReq({ params: { assetId: ASSET_ID } });
    const res = mockRes();

    await handler(req, res, () => {});

    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
    assert.match(res._json.error.message, /Asset nicht gefunden/);
  });

  it("returns 404 when asset has no associated owner ids", async () => {
    const pool = dispatchPool([
      ["FROM offer_assets oa", () => ({
        rows: [{
          id: ASSET_ID, file_path: "uploads/x.png",
          capacity_owner_company_id: null, demand_owner_company_id: null,
          requester_company_id: null, supplier_company_id: null
        }]
      })]
    ]);
    const handler = delHandler(pool);
    const req = mockReq({ params: { assetId: ASSET_ID } });
    const res = mockRes();

    await handler(req, res, () => {});

    assert.strictEqual(res._status, 404);
    assert.match(res._json.error.message, /Zugehoeriger Eintrag/);
  });

  it("returns 403 when caller is not an owner", async () => {
    const pool = dispatchPool([
      ["FROM offer_assets oa", () => ({
        rows: [{
          id: ASSET_ID, file_path: "uploads/x.png",
          capacity_owner_company_id: "other-company", demand_owner_company_id: null,
          requester_company_id: null, supplier_company_id: null,
          deal_document_id: null, marketplace_offer_id: null
        }]
      })]
      // canAccessAsOwner → org_memberships empty → false
    ]);
    const handler = delHandler(pool);
    const req = mockReq({ params: { assetId: ASSET_ID } });
    const res = mockRes();

    await handler(req, res, () => {});

    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error.code, "FORBIDDEN");
  });

  it("deletes a capacity_post asset and sets non-deal audit", async () => {
    const pool = dispatchPool([
      ["FROM offer_assets oa", () => ({
        rows: [{
          id: ASSET_ID, file_path: "uploads/offers/a/x.png",
          capacity_owner_company_id: OWNER, demand_owner_company_id: null,
          requester_company_id: null, supplier_company_id: null,
          deal_document_id: null, marketplace_offer_id: null
        }]
      })],
      ["DELETE FROM offer_assets", () => ({ rows: [] })]
    ]);
    const handler = delHandler(pool);
    const req = mockReq({ params: { assetId: ASSET_ID } });
    const res = mockRes();

    await handler(req, res, () => {});

    assert.strictEqual(res._status, 200);
    assert.deepStrictEqual(res._json.data, { deleted: true });
    const del = pool.calls.find((c) => c.sql.startsWith("DELETE FROM offer_assets"));
    assert.deepStrictEqual(del.params, [ASSET_ID]);
    assert.strictEqual(res.locals.audit.entity_type, "offer_asset");
    assert.strictEqual(res.locals.audit.entity_id, ASSET_ID);
    // no deal_documents deletion when deal_document_id is null
    assert.ok(!pool.calls.some((c) => c.sql.includes("DELETE FROM deal_documents")));
  });

  it("deletes a deal asset, cascades deal_documents, sets deal audit", async () => {
    const pool = dispatchPool([
      ["FROM offer_assets oa", () => ({
        rows: [{
          id: ASSET_ID, file_path: "uploads/offers/m/c.pdf",
          capacity_owner_company_id: null, demand_owner_company_id: null,
          requester_company_id: OWNER, supplier_company_id: "sup-x",
          deal_document_id: "doc-9", marketplace_offer_id: UUID_A
        }]
      })],
      ["DELETE FROM deal_documents", () => ({ rows: [] })],
      ["DELETE FROM offer_assets", () => ({ rows: [] })]
    ]);
    const handler = delHandler(pool);
    const req = mockReq({ params: { assetId: ASSET_ID } });
    const res = mockRes();

    await handler(req, res, () => {});

    assert.strictEqual(res._status, 200);
    assert.deepStrictEqual(res._json.data, { deleted: true });
    const docDel = pool.calls.find((c) => c.sql.includes("DELETE FROM deal_documents"));
    assert.ok(docDel, "deal_documents must be deleted");
    assert.deepStrictEqual(docDel.params, ["doc-9"]);
    // deal audit shape
    assert.strictEqual(res.locals.audit.entity_type, "offer");
    assert.strictEqual(res.locals.audit.entity_id, UUID_A);
    assert.strictEqual(res.locals.audit.details.asset_id, ASSET_ID);
  });

  it("forwards DB errors to next()", async () => {
    const pool = {
      query: async () => { throw new Error("lookup boom"); }
    };
    const handler = delHandler(pool);
    const req = mockReq({ params: { assetId: ASSET_ID } });
    const res = mockRes();
    let nextErr = null;

    await handler(req, res, (err) => { nextErr = err; });

    assert.ok(nextErr instanceof Error);
    assert.strictEqual(nextErr.message, "lookup boom");
  });
});
