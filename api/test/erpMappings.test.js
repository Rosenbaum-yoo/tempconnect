/**
 * erpMappings.test.js — org_erp_mappings Konnektor-Registry (Integrations-Epic A.3).
 * Service-Verhalten (Mock-Pool: SQL-Form + Org-Scoping + Rückgabe) + Router-Handler
 * (Registrierung, Validierung, 409-Duplikat, Org-Required, Audit-Marker).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/erpMappingService.js";
import { createIntegrationsRouter } from "../routes/integrations.js";

/* ── Mock-Pool ───────────────────────────────────────────────── */
function trackingPool(handler) {
  const calls = [];
  const query = async (sql, params = []) => {
    calls.push({ sql: String(sql), params });
    const out = handler ? handler(String(sql), params) : null;
    return out || { rows: [], rowCount: 0 };
  };
  return { calls, query, connect: async () => ({ query, release() {} }) };
}
const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };

/* ── Service ─────────────────────────────────────────────────── */
describe("erpMappingService", () => {
  it("listMappings ist org-scoped + sortiert", async () => {
    const pool = trackingPool((sql) => /FROM org_erp_mappings/.test(sql) ? { rows: [{ id: "m1" }] } : null);
    const rows = await svc.listMappings(pool, "org-1");
    assert.equal(rows.length, 1);
    assert.match(pool.calls[0].sql, /WHERE org_id = \$1/);
    assert.match(pool.calls[0].sql, /ORDER BY created_at DESC/);
    assert.equal(pool.calls[0].params[0], "org-1");
  });

  it("createMapping schreibt system_type + sync_config als JSONB + created_by", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: "m2", system_type: "datev" }] }));
    const out = await svc.createMapping(pool, "org-1", {
      system_type: "datev", external_client_id: "12345", label: "DATEV Prod",
      sync_config: { format: "datev_csv" }, created_by: "u1"
    });
    assert.equal(out.system_type, "datev");
    const c = pool.calls[0];
    assert.match(c.sql, /INSERT INTO org_erp_mappings/);
    assert.match(c.sql, /\$6::jsonb/);                 // sync_config als JSONB
    assert.equal(c.params[0], "org-1");
    assert.equal(c.params[1], "datev");
    assert.equal(c.params[2], "12345");
    assert.equal(c.params[5], JSON.stringify({ format: "datev_csv" }));
    assert.equal(c.params[7], "u1");
  });

  it("updateMapping baut partielles SET nur aus erlaubten Feldern + org-scoped", async () => {
    const pool = trackingPool((sql) => /UPDATE org_erp_mappings/.test(sql) ? { rows: [{ id: "m3", status: "paused" }] } : null);
    const out = await svc.updateMapping(pool, "m3", "org-1", { status: "paused", sync_config: { x: 1 }, hacker_field: "nope" });
    assert.equal(out.status, "paused");
    const c = pool.calls[0];
    assert.match(c.sql, /SET .*status = \$1/);
    assert.match(c.sql, /sync_config = \$2::jsonb/);
    assert.doesNotMatch(c.sql, /hacker_field/);        // unerlaubtes Feld ignoriert
    assert.match(c.sql, /WHERE id = \$\d+ AND org_id = \$\d+/);
  });

  it("updateMapping ohne Felder → getMapping-Fallback (kein leeres UPDATE)", async () => {
    const pool = trackingPool((sql) => /SELECT \* FROM org_erp_mappings/.test(sql) ? { rows: [{ id: "m4" }] } : null);
    const out = await svc.updateMapping(pool, "m4", "org-1", {});
    assert.equal(out.id, "m4");
    assert.ok(pool.calls.every((c) => !/UPDATE/.test(c.sql)), "kein UPDATE bei leerem Patch");
  });

  it("deleteMapping liefert true nur bei rowCount>0 (org-scoped)", async () => {
    const hit = trackingPool(() => ({ rowCount: 1 }));
    assert.equal(await svc.deleteMapping(hit, "m5", "org-1"), true);
    assert.match(hit.calls[0].sql, /DELETE FROM org_erp_mappings WHERE id = \$1 AND org_id = \$2/);
    const miss = trackingPool(() => ({ rowCount: 0 }));
    assert.equal(await svc.deleteMapping(miss, "m6", "org-9"), false);
  });

  it("getMapping null wenn org-fremd", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    assert.equal(await svc.getMapping(pool, "m7", "org-2"), null);
  });
});

/* ── Router ──────────────────────────────────────────────────── */
describe("integrations router — /org/erp-mappings", () => {
  function build(pool) {
    return createIntegrationsRouter({ pool, requireAuth: (_q, _s, n) => n(), logger: noopLogger });
  }
  function handler(router, method, path) {
    const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
    assert.ok(layer, `${method.toUpperCase()} ${path} registriert`);
    return layer.route.stack[layer.route.stack.length - 1].handle;
  }
  function res() {
    return { _s: 200, _j: null, locals: {}, status(c) { this._s = c; return this; }, json(b) { this._j = b; return this; } };
  }
  const req = (over = {}) => ({ orgId: "org-1", session: { userId: "u1" }, params: {}, body: {}, ...over });

  it("registriert alle 4 ERP-Mapping-Routen", () => {
    const r = build(trackingPool());
    const paths = r.stack.filter((l) => l.route).map((l) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`);
    assert.ok(paths.includes("get /org/erp-mappings"));
    assert.ok(paths.includes("post /org/erp-mappings"));
    assert.ok(paths.includes("patch /org/erp-mappings/:id"));
    assert.ok(paths.includes("delete /org/erp-mappings/:id"));
  });

  it("POST 400 bei ungültigem system_type", async () => {
    const r = build(trackingPool());
    const rs = res();
    await handler(r, "post", "/org/erp-mappings")(req({ body: { system_type: "oracle" } }), rs);
    assert.equal(rs._s, 400);
    assert.equal(rs._j.error, "VALIDATION");
  });

  it("POST 400 ORG_REQUIRED ohne orgId", async () => {
    const r = build(trackingPool());
    const rs = res();
    await handler(r, "post", "/org/erp-mappings")(req({ orgId: null, body: { system_type: "datev" } }), rs);
    assert.equal(rs._s, 400);
    assert.equal(rs._j.error, "ORG_REQUIRED");
  });

  it("POST 201 + Audit-Marker bei Erfolg", async () => {
    const r = build(trackingPool(() => ({ rows: [{ id: "m-new", system_type: "datev" }] })));
    const rs = res();
    await handler(r, "post", "/org/erp-mappings")(req({ body: { system_type: "datev", label: "Prod" } }), rs);
    assert.equal(rs._s, 201);
    assert.equal(rs._j.id, "m-new");
    assert.equal(rs.locals.audit.action, "erp_mapping.create");
    assert.equal(rs.locals.audit.entity_type, "org_erp_mapping");
  });

  it("POST 409 bei Duplikat (Postgres 23505)", async () => {
    const pool = trackingPool(() => { const e = new Error("dup"); e.code = "23505"; throw e; });
    const r = build(pool);
    const rs = res();
    await handler(r, "post", "/org/erp-mappings")(req({ body: { system_type: "datev" } }), rs);
    assert.equal(rs._s, 409);
    assert.equal(rs._j.error, "MAPPING_EXISTS");
  });

  it("DELETE 404 wenn nicht gefunden", async () => {
    const r = build(trackingPool(() => ({ rowCount: 0 })));
    const rs = res();
    await handler(r, "delete", "/org/erp-mappings/:id")(req({ params: { id: "x" } }), rs);
    assert.equal(rs._s, 404);
  });
});
