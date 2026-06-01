/**
 * requisitionPartialFill.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * WAVE_15 — Sicherheitsnetz fuer den PARTIALLY_FILLED Status-Uebergang.
 *
 * Verifiziert:
 *   - REQUISITION_TRANSITIONS Map (statische Korrektheit)
 *   - assertTransition() — erlaubte und verbotene Uebergaenge
 *   - transitionStatus() — DB-Interaktion (via mockPool)
 *
 * Run: node --test --test-force-exit test/requisitionPartialFill.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  REQUISITION_TRANSITIONS,
  RequisitionTransitionError,
  assertTransition,
  transitionStatus
} from "../services/requisitionService.js";

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function mockPool(rows, extra) {
  let call = 0;
  return {
    query: async (_sql, _params) => {
      call++;
      // Erster Aufruf = SELECT (liefert Requisition-Row), Folgeaufrufe = INSERT/UPDATE
      if (call === 1 && extra && extra.currentStatus) {
        return { rows: [{ id: "req-1", status: extra.currentStatus, created_by: "user-1", org_id: "org-1" }] };
      }
      return { rows: rows || [] };
    }
  };
}

/* ── 1. REQUISITION_TRANSITIONS Map ──────────────────────────────────────── */

describe("REQUISITION_TRANSITIONS — statische Korrektheit", () => {
  it("1: PARTIALLY_FILLED ist ein gueltiger Quellstatus mit erlaubten Zielen", () => {
    const targets = REQUISITION_TRANSITIONS["PARTIALLY_FILLED"];
    assert.ok(Array.isArray(targets), "Erwartet Array");
    assert.ok(targets.length > 0, "Erwartet mind. einen Zielstatus");
    assert.ok(targets.includes("FILLED"), "PARTIALLY_FILLED → FILLED muss erlaubt sein");
    assert.ok(targets.includes("OPEN"),   "PARTIALLY_FILLED → OPEN muss erlaubt sein (Rueckschritt)");
  });

  it("2: OPEN kann nach PARTIALLY_FILLED uebergehen", () => {
    assert.ok(REQUISITION_TRANSITIONS["OPEN"].includes("PARTIALLY_FILLED"));
  });

  it("3: IN_REVIEW kann nach PARTIALLY_FILLED uebergehen", () => {
    assert.ok(REQUISITION_TRANSITIONS["IN_REVIEW"].includes("PARTIALLY_FILLED"));
  });

  it("4: SHORTLISTED kann nach PARTIALLY_FILLED uebergehen", () => {
    assert.ok(REQUISITION_TRANSITIONS["SHORTLISTED"].includes("PARTIALLY_FILLED"));
  });

  it("5: FILLED kann NICHT nach PARTIALLY_FILLED zurueck (terminal-guard)", () => {
    const filled = REQUISITION_TRANSITIONS["FILLED"] || [];
    assert.ok(!filled.includes("PARTIALLY_FILLED"), "FILLED → PARTIALLY_FILLED muss verboten sein");
  });

  it("6: DRAFT kann NICHT direkt nach PARTIALLY_FILLED (kein Skip ueber Zwischenstatus)", () => {
    const draft = REQUISITION_TRANSITIONS["DRAFT"] || [];
    assert.ok(!draft.includes("PARTIALLY_FILLED"), "DRAFT → PARTIALLY_FILLED muss verboten sein");
  });
});

/* ── 2. assertTransition() ───────────────────────────────────────────────── */

describe("assertTransition — PARTIALLY_FILLED Uebergaenge", () => {
  it("7: OPEN → PARTIALLY_FILLED wirft keinen Fehler", () => {
    assert.doesNotThrow(() => assertTransition("OPEN", "PARTIALLY_FILLED"));
  });

  it("8: SHORTLISTED → PARTIALLY_FILLED wirft keinen Fehler", () => {
    assert.doesNotThrow(() => assertTransition("SHORTLISTED", "PARTIALLY_FILLED"));
  });

  it("9: PARTIALLY_FILLED → FILLED wirft keinen Fehler", () => {
    assert.doesNotThrow(() => assertTransition("PARTIALLY_FILLED", "FILLED"));
  });

  it("10: PARTIALLY_FILLED → CANCELLED wirft keinen Fehler", () => {
    assert.doesNotThrow(() => assertTransition("PARTIALLY_FILLED", "CANCELLED"));
  });

  it("11: FILLED → PARTIALLY_FILLED wirft RequisitionTransitionError", () => {
    assert.throws(
      () => assertTransition("FILLED", "PARTIALLY_FILLED"),
      (e) => e instanceof RequisitionTransitionError && e.from === "FILLED" && e.to === "PARTIALLY_FILLED"
    );
  });

  it("12: DRAFT → PARTIALLY_FILLED wirft RequisitionTransitionError", () => {
    assert.throws(
      () => assertTransition("DRAFT", "PARTIALLY_FILLED"),
      (e) => e instanceof RequisitionTransitionError
    );
  });

  it("13: CANCELLED → PARTIALLY_FILLED wirft RequisitionTransitionError (terminal)", () => {
    assert.throws(
      () => assertTransition("CANCELLED", "PARTIALLY_FILLED"),
      (e) => e instanceof RequisitionTransitionError
    );
  });
});

/* ── 3. transitionStatus() — DB mock ────────────────────────────────────── */

describe("transitionStatus — PARTIALLY_FILLED via DB-Mock", () => {
  it("14: OPEN → PARTIALLY_FILLED schreibt neuen Status und Audit-Event", async () => {
    const queries = [];
    const pool = {
      query: async (sql, params) => {
        queries.push({ sql: sql.trim().substring(0, 40), params });
        // SELECT liefert aktuelle Requisition
        if (sql.includes("SELECT") && sql.includes("requisitions")) {
          return { rows: [{ id: "req-1", status: "OPEN", created_by: "user-1", org_id: "org-1" }] };
        }
        // UPDATE / INSERT
        return { rows: [{ id: "req-1", status: "PARTIALLY_FILLED" }] };
      }
    };

    const result = await transitionStatus(pool, "req-1", "user-1", "PARTIALLY_FILLED");
    assert.equal(result.requisition.status, "PARTIALLY_FILLED");
    const hasUpdate = queries.some(q => q.sql.includes("UPDATE") && q.params && q.params.includes("PARTIALLY_FILLED"));
    assert.ok(hasUpdate, "Erwarte UPDATE-Query mit PARTIALLY_FILLED");
  });

  it("15: ungueltiger Uebergang FILLED → PARTIALLY_FILLED wirft Fehler (kein DB-Write)", async () => {
    const writes = [];
    const pool = {
      query: async (sql, params) => {
        if (sql.includes("SELECT") && sql.includes("requisitions")) {
          return { rows: [{ id: "req-1", status: "FILLED", created_by: "user-1", org_id: "org-1" }] };
        }
        writes.push(sql);
        return { rows: [] };
      }
    };

    await assert.rejects(
      async () => transitionStatus(pool, "req-1", "user-1", "PARTIALLY_FILLED"),
      (e) => e instanceof RequisitionTransitionError
    );
    assert.equal(writes.length, 0, "Kein DB-Write bei ungueltigem Uebergang");
  });
});
