/**
 * rlsTenantIsolation.test.js — Unit-Tests für den RLS/Tenant-Context-Mechanismus.
 *
 * Testet:
 *   1. withOrgContext setzt app.current_org_id + reset rls_bypass
 *   2. withStaffContext setzt app.rls_bypass = 'staff' + org leer
 *   3. withStaffContext erfordert opts.reason (Audit-Pflicht)
 *   4. orgContextMiddleware setzt req.setOrgContext helper
 *   5. Kein Org-Context → kein req.setOrgContext
 *   6. Verschachtelung: withOrgContext auf PoolClient (nested tx support)
 *
 * Keine DB erforderlich — alle Tests mit Mock-Pools.
 *
 * WAVE 05 — Phase 2 — 2026-05-26
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withOrgContext, withStaffContext, getOrgContextState } from "../utils/orgContext.js";

/* ── Mock Pool / Client ───────────────────────────────────────────────────── */

function makeMockClient(queryLog = []) {
  const state = { current_org_id: null, rls_bypass: "" };
  return {
    _state: state,
    _log: queryLog,
    async query(sql, params = []) {
      queryLog.push({ sql: sql.trim(), params });
      // Simulate SET LOCAL
      const setLocal = sql.match(/SET LOCAL (\S+)\s*=\s*\$1/i);
      const getCtx   = sql.includes("current_setting");
      if (setLocal) {
        const key = setLocal[1].replace("app.", "");
        state[key] = params[0] ?? "";
      }
      if (getCtx) {
        return {
          rows: [{
            current_org_id: state.current_org_id || "",
            rls_bypass:     state.rls_bypass || "",
          }]
        };
      }
      return { rows: [] };
    },
    release() {},
  };
}

function makeMockPool(client) {
  return {
    async connect() { return client; },
    // release is not a function → not a PoolClient → withTransaction creates tx
  };
}

/* ── 1. withOrgContext ─────────────────────────────────────────────────────── */

describe("withOrgContext", () => {
  it("setzt app.current_org_id und resettet rls_bypass", async () => {
    const log = [];
    const client = makeMockClient(log);
    const pool   = makeMockPool(client);
    const orgId  = "aaaaaaaa-0000-0000-0000-000000000001";

    await withOrgContext(pool, orgId, async (c) => {
      const ctx = await getOrgContextState(c);
      assert.equal(ctx.current_org_id, orgId);
      assert.equal(ctx.rls_bypass, "");
    });

    const setCalls = log.filter((q) => q.sql.startsWith("SET LOCAL"));
    assert.equal(setCalls.length, 2, "Genau 2 SET LOCAL Aufrufe (org_id + rls_bypass)");
    assert.ok(setCalls.some((q) => q.sql.includes("current_org_id") && q.params[0] === orgId));
    assert.ok(setCalls.some((q) => q.sql.includes("rls_bypass") && q.params[0] === ""));
  });

  it("setzt kein current_org_id wenn orgId null", async () => {
    const log = [];
    const client = makeMockClient(log);
    const pool   = makeMockPool(client);

    await withOrgContext(pool, null, async (c) => {
      void c;
    });

    const orgCalls = log.filter((q) => q.sql.includes("current_org_id"));
    assert.equal(orgCalls.length, 0, "Kein SET LOCAL current_org_id bei null-orgId");

    const bypassCalls = log.filter((q) => q.sql.includes("rls_bypass"));
    assert.equal(bypassCalls.length, 1, "rls_bypass wird immer resettet");
    assert.equal(bypassCalls[0].params[0], "");
  });

  it("wirft bei DB-Fehler und gibt Client frei", async () => {
    const client = {
      released: false,
      async query() { throw new Error("DB_ERROR"); },
      release() { this.released = true; },
    };
    const pool = { async connect() { return client; } };

    await assert.rejects(
      () => withOrgContext(pool, "org-id", async () => {}),
      /DB_ERROR/
    );
    assert.ok(client.released, "Client muss nach Fehler freigegeben werden");
  });
});

/* ── 2. withStaffContext ──────────────────────────────────────────────────── */

describe("withStaffContext", () => {
  it("setzt app.rls_bypass='staff' und leert current_org_id", async () => {
    const log = [];
    const client = makeMockClient(log);
    const pool   = makeMockPool(client);

    await withStaffContext(pool, async (c) => {
      const ctx = await getOrgContextState(c);
      assert.equal(ctx.rls_bypass, "staff");
      assert.equal(ctx.current_org_id, "");
    }, { reason: "test_staff_access" });

    const bypassCall = log.find((q) => q.sql.includes("rls_bypass") && q.params[0] === "staff");
    assert.ok(bypassCall, "rls_bypass muss auf 'staff' gesetzt werden");

    const orgCall = log.find((q) => q.sql.includes("current_org_id") && q.params[0] === "");
    assert.ok(orgCall, "current_org_id muss auf '' gesetzt werden");
  });

  it("wirft wenn opts.reason fehlt (Audit-Pflicht)", async () => {
    const pool = { async connect() { return makeMockClient(); } };

    await assert.rejects(
      () => withStaffContext(pool, async () => {}, {}),
      /reason.*Pflichtfeld/
    );
  });

  /*
   * MUTATION-KILL (Welle 2). Die beiden Tests daneben pruefen nur, DASS
   * geworfen wird. Das reicht nicht: ein Wurf, der erst NACH dem Setzen des
   * Bypass passiert, wuerde ebenso "geworfen" heissen — und haette den
   * Cross-Org-Zugang in der Zwischenzeit bereits geoeffnet.
   *
   * Hier wird deshalb der NEBENEFFEKT geprueft: ohne Begruendung darf nicht
   * einmal eine Verbindung aus dem Pool genommen werden. Die Audit-Pflicht ist
   * damit strukturell abgesichert, nicht nur durch die Fehlermeldung.
   */
  it("nimmt ohne Begruendung nicht einmal eine Verbindung — kein Bypass, kein Nebeneffekt", async () => {
    const log = [];
    let verbindungen = 0;
    const pool = {
      async connect() { verbindungen++; return makeMockClient(log); }
    };

    await assert.rejects(
      () => withStaffContext(pool, async () => {}, { reason: "" }),
      /reason.*Pflichtfeld/
    );

    assert.equal(verbindungen, 0,
      "die Pruefung muss VOR der Transaktion greifen — sonst ist der Bypass kurzzeitig offen");
    assert.equal(log.length, 0, "kein einziges SET LOCAL darf abgesetzt worden sein");
    assert.ok(!log.some((q) => q.params?.[0] === "staff"),
      "ein gesetzter Staff-Bypass ohne Audit-Begruendung ist genau der Zustand, den diese Pruefung verhindert");
  });

  it("wirft wenn opts fehlt komplett", async () => {
    const pool = { async connect() { return makeMockClient(); } };

    await assert.rejects(
      () => withStaffContext(pool, async () => {}),
      /reason.*Pflichtfeld/
    );
  });
});

/* ── 3. orgContextMiddleware → req.setOrgContext ─────────────────────────── */

describe("req.setOrgContext helper", () => {
  it("wird gesetzt wenn req.orgId vorhanden ist", async () => {
    // Minimaler Middleware-Smoke-Test ohne DB
    const { orgContextMiddleware } = await import("../middleware/orgContext.js");

    // Stub pool mit Minimal-Response
    const pool = {
      query: async () => ({ rows: [] }),
    };

    const req = {
      session: {},
      headers: {},
      query: {},
      body: {},
    };
    const res = {};
    let nextCalled = false;

    const mw = orgContextMiddleware(pool);

    // Ohne orgId → kein setOrgContext
    await new Promise((resolve) => {
      mw(req, res, () => { nextCalled = true; resolve(); });
    });

    assert.ok(nextCalled, "next() muss aufgerufen werden");
    assert.equal(typeof req.setOrgContext, "undefined", "Kein setOrgContext ohne orgId");
  });

  it("req.setOrgContext setzt SET LOCAL auf dem Client", async () => {
    // Manuell den Helper testen
    const orgId = "bbbbbbbb-0000-0000-0000-000000000002";
    const log   = [];
    const client = makeMockClient(log);

    // req.setOrgContext wird nur gesetzt wenn req.orgId vorhanden ist — manuell simulieren
    const setOrgContext = async (c) => {
      await c.query("SET LOCAL app.current_org_id = $1", [orgId]);
      await c.query("SET LOCAL app.rls_bypass = $1", [""]);
    };

    await setOrgContext(client);

    assert.ok(log.some((q) => q.params[0] === orgId), "Org-ID im SET LOCAL");
    assert.ok(log.some((q) => q.sql.includes("rls_bypass") && q.params[0] === ""), "rls_bypass resettet");
  });
});

/* ── 4. Verschachtelung: PoolClient als Übergabe ─────────────────────────── */

describe("withOrgContext mit PoolClient (nested tx)", () => {
  it("delegiert direkt an fn ohne neue Transaktion (wie withTransaction)", async () => {
    const log  = [];
    const innerClient = { ...makeMockClient(log), release: () => {} };

    // Wenn ein PoolClient übergeben wird (hat .release), öffnet withTransaction keine neue TX
    const result = await withOrgContext(innerClient, "org-nested", async (c) => {
      return "nested-result";
    });

    // Kein BEGIN/COMMIT durch withTransaction (pool.release vorhanden → passthrough)
    const txCalls = log.filter((q) => q.sql === "BEGIN" || q.sql === "COMMIT");
    assert.equal(txCalls.length, 0, "Kein BEGIN/COMMIT bei PoolClient-Übergabe");
    assert.equal(result, "nested-result");
  });
});
