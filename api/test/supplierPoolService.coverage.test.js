/**
 * Coverage suite for services/supplierPoolService.js
 *
 * Stage-based requisition distribution through supplier pools.
 * Exported functions under test:
 *   - createDistributionPlan
 *   - getDistributionPlan
 *   - advanceDistribution
 *   - getEligibleSuppliers
 *   - findStagesNeedingAdvance
 *
 * Strategy: a local trackingPool records {sql, params} for every query and
 * dispatches results via a handler keyed by SQL substrings. This drives the
 * whole call graph (incl. the static eventTrackingService.trackEvent INSERT
 * into platform_events, which the service fires-and-swallows).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as svc from "../services/supplierPoolService.js";

/**
 * Build a tracking pool.
 * @param {(sql:string, params:any[]) => ({rows:any[], rowCount?:number}|Error|undefined)} handler
 *        Return undefined to fall back to the default empty result.
 */
function trackingPool(handler) {
  const calls = [];
  const queryFn = async (sql, params) => {
    const trimmed = String(sql).trim().toUpperCase();
    if (trimmed === "BEGIN" || trimmed === "COMMIT" || trimmed === "ROLLBACK") {
      return { rows: [], rowCount: 0 };
    }
    calls.push({ sql, params });
    const res = handler ? handler(sql, params) : undefined;
    if (res instanceof Error) throw res;
    if (res === undefined || res === null) return { rows: [], rowCount: 0 };
    return { rowCount: res.rows ? res.rows.length : 0, ...res };
  };
  return {
    calls,
    query: queryFn,
    connect: async () => ({ query: queryFn, release: () => {} })
  };
}

const has = (sql, ...needles) => needles.every(n => sql.includes(n));

/* ───────────────────────── createDistributionPlan ───────────────────────── */

describe("createDistributionPlan", () => {
  it("inserts the 3 DEFAULT_STAGES, auto-activates stage 1, returns rows", async () => {
    let insertCount = 0;
    const pool = trackingPool((sql, params) => {
      if (has(sql, "INSERT INTO requisition_distribution_stages")) {
        insertCount++;
        // echo back the stage_number / pool_tier from params
        return {
          rows: [{
            id: "stage-" + params[1],
            requisition_id: params[0],
            stage_number: params[1],
            pool_tier: params[2],
            label: params[3],
            status: "pending",
            auto_advance_hours: params[4]
          }]
        };
      }
      return undefined;
    });

    const rows = await svc.createDistributionPlan(pool, "req-1", null, "actor-9");

    assert.equal(insertCount, 3, "one INSERT per default stage");
    assert.equal(rows.length, 3);
    // tiers in order
    assert.deepEqual(rows.map(r => r.pool_tier), ["PREFERRED", "SECONDARY", "OPEN"]);
    assert.deepEqual(rows.map(r => r.stage_number), [1, 2, 3]);
    // stage 1 auto-activated in returned rows
    assert.equal(rows[0].status, "active");
    // auto_advance_hours default values preserved
    assert.equal(rows[0].auto_advance_hours, 24);
    assert.equal(rows[2].auto_advance_hours, null);

    // verify the activation UPDATE ran for stage_number 1
    const activate = pool.calls.find(c =>
      has(c.sql, "UPDATE requisition_distribution_stages", "status = 'active'", "stage_number = 1"));
    assert.ok(activate, "activation UPDATE for stage 1 must run");
    assert.deepEqual(activate.params, ["req-1"]);

    // event tracked with requisition id + stage count metadata
    const evt = pool.calls.find(c => has(c.sql, "INSERT INTO platform_events"));
    assert.ok(evt, "trackEvent INSERT must fire");
    assert.equal(evt.params[0], "requisition_distributed");
    assert.equal(evt.params[1], "actor-9"); // actor_id
    assert.equal(evt.params[4], "req-1");    // entity_id
  });

  it("uses custom stages when provided and passes them as INSERT params", async () => {
    const captured = [];
    const pool = trackingPool((sql, params) => {
      if (has(sql, "INSERT INTO requisition_distribution_stages")) {
        captured.push(params);
        return { rows: [{ id: "s", stage_number: params[1], pool_tier: params[2], status: "pending" }] };
      }
      return undefined;
    });

    const custom = [
      { stage_number: 1, pool_tier: "PREFERRED", label: "Only", auto_advance_hours: 12 }
    ];
    const rows = await svc.createDistributionPlan(pool, "req-2", custom, null);

    assert.equal(captured.length, 1, "exactly one custom stage inserted");
    assert.deepEqual(captured[0], ["req-2", 1, "PREFERRED", "Only", 12]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "active");
  });

  it("falls back to DEFAULT_STAGES when an empty stages array is passed", async () => {
    let insertCount = 0;
    const pool = trackingPool((sql, params) => {
      if (has(sql, "INSERT INTO requisition_distribution_stages")) {
        insertCount++;
        return { rows: [{ id: "s" + params[1], stage_number: params[1], pool_tier: params[2], status: "pending" }] };
      }
      return undefined;
    });

    const rows = await svc.createDistributionPlan(pool, "req-3", [], "a");
    assert.equal(insertCount, 3, "empty array → DEFAULT_STAGES (3)");
    assert.equal(rows.length, 3);
  });

  it("maps missing label/auto_advance_hours on a custom stage to null", async () => {
    let params = null;
    const pool = trackingPool((sql, p) => {
      if (has(sql, "INSERT INTO requisition_distribution_stages")) {
        params = p;
        return { rows: [{ id: "s", stage_number: p[1], pool_tier: p[2], status: "pending" }] };
      }
      return undefined;
    });

    await svc.createDistributionPlan(pool, "req-4", [{ stage_number: 5, pool_tier: "OPEN" }], null);
    // label → null, auto_advance_hours → null, actor → null in event
    assert.equal(params[3], null, "missing label coerced to null");
    assert.equal(params[4], null, "missing auto_advance_hours coerced to null");
  });

  it("still returns rows even if trackEvent fails (error is swallowed)", async () => {
    const pool = trackingPool((sql, params) => {
      if (has(sql, "INSERT INTO requisition_distribution_stages")) {
        return { rows: [{ id: "s" + params[1], stage_number: params[1], pool_tier: params[2], status: "pending" }] };
      }
      if (has(sql, "INSERT INTO platform_events")) {
        return new Error("event store down");
      }
      return undefined;
    });

    const rows = await svc.createDistributionPlan(pool, "req-5", null, "a");
    assert.equal(rows.length, 3, "stage rows returned despite trackEvent failure");
    assert.equal(rows[0].status, "active");
  });

  it("propagates a hard failure on the stage INSERT", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "INSERT INTO requisition_distribution_stages")) {
        return new Error("db write failed");
      }
      return undefined;
    });
    await assert.rejects(
      () => svc.createDistributionPlan(pool, "req-6", null, "a"),
      /db write failed/
    );
  });
});

/* ───────────────────────── getDistributionPlan ──────────────────────────── */

describe("getDistributionPlan", () => {
  it("returns ordered stages and identifies the active stage", async () => {
    const stages = [
      { id: "a", stage_number: 1, status: "completed" },
      { id: "b", stage_number: 2, status: "active" },
      { id: "c", stage_number: 3, status: "pending" }
    ];
    const pool = trackingPool((sql, params) => {
      if (has(sql, "FROM requisition_distribution_stages")) {
        assert.deepEqual(params, ["req-1"]);
        return { rows: stages };
      }
      return undefined;
    });

    const result = await svc.getDistributionPlan(pool, "req-1");
    assert.equal(result.stages.length, 3);
    assert.ok(result.active_stage);
    assert.equal(result.active_stage.id, "b");
    assert.equal(result.active_stage.stage_number, 2);
    // query ordered by stage_number ASC
    const q = pool.calls[0];
    assert.ok(has(q.sql, "ORDER BY ds.stage_number ASC"));
  });

  it("returns active_stage null when no stage is active", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM requisition_distribution_stages")) {
        return { rows: [{ id: "a", stage_number: 1, status: "completed" }] };
      }
      return undefined;
    });
    const result = await svc.getDistributionPlan(pool, "req-2");
    assert.equal(result.active_stage, null);
    assert.equal(result.stages.length, 1);
  });

  it("returns empty stages + null active_stage for unknown requisition", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    const result = await svc.getDistributionPlan(pool, "missing");
    assert.deepEqual(result.stages, []);
    assert.equal(result.active_stage, null);
  });
});

/* ───────────────────────── advanceDistribution ──────────────────────────── */

describe("advanceDistribution", () => {
  it("completes active stage, activates next, returns next stage active", async () => {
    const stages = [
      { id: "s1", stage_number: 1, status: "active", pool_tier: "PREFERRED" },
      { id: "s2", stage_number: 2, status: "pending", pool_tier: "SECONDARY" },
      { id: "s3", stage_number: 3, status: "pending", pool_tier: "OPEN" }
    ];
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM requisition_distribution_stages")) return { rows: stages };
      return undefined;
    });

    const next = await svc.advanceDistribution(pool, "req-1", "actor-1");
    assert.ok(next);
    assert.equal(next.stage_number, 2);
    assert.equal(next.pool_tier, "SECONDARY");
    assert.equal(next.status, "active");

    // completed UPDATE targets the current active stage id
    const complete = pool.calls.find(c =>
      has(c.sql, "status = 'completed'", "completed_at = NOW()"));
    assert.ok(complete);
    assert.deepEqual(complete.params, ["s1"]);

    // activate UPDATE targets the next stage id
    const activate = pool.calls.find(c =>
      has(c.sql, "status = 'active'", "activated_at = NOW()"));
    assert.ok(activate);
    assert.deepEqual(activate.params, ["s2"]);

    // event metadata captures advanced stage / tier
    const evt = pool.calls.find(c => has(c.sql, "INSERT INTO platform_events"));
    assert.ok(evt);
    assert.equal(evt.params[0], "requisition_distributed");
    assert.equal(evt.params[1], "actor-1");
    assert.equal(evt.params[4], "req-1");
  });

  it("returns null when there is no active stage", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM requisition_distribution_stages")) {
        return { rows: [{ id: "s1", stage_number: 1, status: "completed" }] };
      }
      return undefined;
    });
    const next = await svc.advanceDistribution(pool, "req-2", "a");
    assert.equal(next, null);
    // no completed/activate UPDATE should have fired
    const upd = pool.calls.find(c => has(c.sql, "UPDATE requisition_distribution_stages"));
    assert.equal(upd, undefined, "no UPDATE when nothing active");
  });

  it("completes the last active stage and returns null (all stages done)", async () => {
    const stages = [
      { id: "s1", stage_number: 1, status: "completed", pool_tier: "PREFERRED" },
      { id: "s2", stage_number: 2, status: "completed", pool_tier: "SECONDARY" },
      { id: "s3", stage_number: 3, status: "active", pool_tier: "OPEN" }
    ];
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM requisition_distribution_stages")) return { rows: stages };
      return undefined;
    });

    const next = await svc.advanceDistribution(pool, "req-3", "a");
    assert.equal(next, null, "no stage 4 → null");

    // last active stage still gets completed
    const complete = pool.calls.find(c => has(c.sql, "status = 'completed'"));
    assert.ok(complete);
    assert.deepEqual(complete.params, ["s3"]);

    // no second 'active' activation UPDATE for a next stage
    const activate = pool.calls.find(c =>
      has(c.sql, "status = 'active'", "activated_at = NOW()"));
    assert.equal(activate, undefined, "no next-stage activation when last stage completes");

    // no event tracked when there is no next stage
    const evt = pool.calls.find(c => has(c.sql, "INSERT INTO platform_events"));
    assert.equal(evt, undefined);
  });
});

/* ───────────────────────── getEligibleSuppliers ─────────────────────────── */

describe("getEligibleSuppliers", () => {
  it("returns [] when the requisition has no org", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM requisitions WHERE id")) return { rows: [] };
      return undefined;
    });
    const out = await svc.getEligibleSuppliers(pool, "req-x", 1);
    assert.deepEqual(out, []);
    // only the requisition lookup should have run
    assert.equal(pool.calls.length, 1);
  });

  it("returns [] when the stage row is missing", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM requisitions WHERE id")) return { rows: [{ org_id: "org-1" }] };
      if (has(sql, "SELECT pool_tier FROM requisition_distribution_stages")) return { rows: [] };
      return undefined;
    });
    const out = await svc.getEligibleSuppliers(pool, "req-1", 9);
    assert.deepEqual(out, []);
  });

  it("OPEN tier → queries active agencies not in vendor pool, scoped to client org", async () => {
    const suppliers = [
      { supplier_org_id: "o1", supplier_name: "Alpha", type: "agency" },
      { supplier_org_id: "o2", supplier_name: "Beta", type: "agency" }
    ];
    let openParams = null;
    const pool = trackingPool((sql, params) => {
      if (has(sql, "FROM requisitions WHERE id")) return { rows: [{ org_id: "client-1" }] };
      if (has(sql, "SELECT pool_tier FROM requisition_distribution_stages")) return { rows: [{ pool_tier: "OPEN" }] };
      if (has(sql, "FROM organizations o", "o.type = 'agency'")) {
        openParams = params;
        return { rows: suppliers };
      }
      return undefined;
    });

    const out = await svc.getEligibleSuppliers(pool, "req-1", 3);
    assert.equal(out.length, 2);
    assert.equal(out[0].supplier_name, "Alpha");
    assert.deepEqual(openParams, ["client-1"], "OPEN query scoped to client org");
    // ensure pool-based JOIN query did NOT run for OPEN
    const poolQ = pool.calls.find(c => has(c.sql, "FROM vendor_pool vp", "JOIN organizations"));
    assert.equal(poolQ, undefined);
  });

  it("PREFERRED tier → queries vendor_pool filtered by tier + client org", async () => {
    const rows = [
      { supplier_org_id: "v1", supplier_name: "Gamma", tier: "PREFERRED", category: "nursing" }
    ];
    let poolParams = null;
    const pool = trackingPool((sql, params) => {
      if (has(sql, "FROM requisitions WHERE id")) return { rows: [{ org_id: "client-7" }] };
      if (has(sql, "SELECT pool_tier FROM requisition_distribution_stages")) return { rows: [{ pool_tier: "PREFERRED" }] };
      if (has(sql, "FROM vendor_pool vp", "JOIN organizations")) {
        poolParams = params;
        return { rows };
      }
      return undefined;
    });

    const out = await svc.getEligibleSuppliers(pool, "req-2", 1);
    assert.equal(out.length, 1);
    assert.equal(out[0].supplier_name, "Gamma");
    assert.deepEqual(poolParams, ["client-7", "PREFERRED"], "pool query scoped to org + tier");
    // OPEN-only org query must NOT run
    const openQ = pool.calls.find(c => has(c.sql, "o.type = 'agency'", "NOT IN"));
    assert.equal(openQ, undefined);
  });

  it("SECONDARY tier → also uses the vendor_pool path with the right tier param", async () => {
    let poolParams = null;
    const pool = trackingPool((sql, params) => {
      if (has(sql, "FROM requisitions WHERE id")) return { rows: [{ org_id: "client-3" }] };
      if (has(sql, "SELECT pool_tier FROM requisition_distribution_stages")) return { rows: [{ pool_tier: "SECONDARY" }] };
      if (has(sql, "FROM vendor_pool vp")) {
        poolParams = params;
        return { rows: [] };
      }
      return undefined;
    });

    const out = await svc.getEligibleSuppliers(pool, "req-3", 2);
    assert.deepEqual(out, [], "empty pool → empty list (zero-state)");
    assert.deepEqual(poolParams, ["client-3", "SECONDARY"]);
  });
});

/* ───────────────────────── findStagesNeedingAdvance ─────────────────────── */

describe("findStagesNeedingAdvance", () => {
  it("returns overdue active stages and applies the default limit of 50", async () => {
    const overdue = [
      { id: "s1", requisition_id: "r1", stage_number: 1, status: "active", org_id: "o1" }
    ];
    let limitParam = null;
    const pool = trackingPool((sql, params) => {
      if (has(sql, "FROM requisition_distribution_stages ds", "JOIN requisitions")) {
        limitParam = params;
        return { rows: overdue };
      }
      return undefined;
    });

    const out = await svc.findStagesNeedingAdvance(pool);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, "s1");
    assert.deepEqual(limitParam, [50], "default limit 50");
    // sanity: query filters on active + auto_advance_hours + interval
    const q = pool.calls[0];
    assert.ok(has(q.sql, "ds.status = 'active'"));
    assert.ok(has(q.sql, "ds.auto_advance_hours IS NOT NULL"));
    assert.ok(has(q.sql, "::interval"));
  });

  it("honors a custom limit", async () => {
    let limitParam = null;
    const pool = trackingPool((sql, params) => {
      if (has(sql, "FROM requisition_distribution_stages ds", "JOIN requisitions")) {
        limitParam = params;
        return { rows: [] };
      }
      return undefined;
    });
    const out = await svc.findStagesNeedingAdvance(pool, 10);
    assert.deepEqual(out, []);
    assert.deepEqual(limitParam, [10]);
  });
});
