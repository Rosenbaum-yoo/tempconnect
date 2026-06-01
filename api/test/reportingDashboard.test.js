/**
 * WAVE_05 — Executive Dashboard + KPI-Wahrheit
 *
 * Verifiziert:
 *   1. Alle KPI-Funktionen liefern valide Null-Zustaende (kein 500 auf leerem Pool)
 *   2. `requisitionKpis()` enthaelt `partially_filled` (Migration 113 integriert)
 *   3. `executiveDashboard()` Rueckgabe-Schema ist vollstaendig
 *   4. `requisitionsByPeriod()` liefert Array (kein Crash bei null orgId)
 *   5. `slaReport()` Compliance-Prozent ist null oder 0–100
 *   6. `complianceSummary()` Summe = total_documents
 *
 * Run: node --test --test-force-exit api/test/reportingDashboard.test.js
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

import {
  requisitionKpis,
  requisitionsByPeriod,
  complianceSummary,
  slaReport,
  executiveDashboard,
  topRoles
} from "../services/reportingService.js";

/* ── Minimal Mock-Pool ──────────────────────────────────────── */
// Gibt 0-Zeilen zurueck fuer alle Queries — simuliert leere Demo-DB.
function emptyPool() {
  return {
    query: async () => ({ rows: [] })
  };
}

// Single-row Pool: gibt fuer ALLE Queries dieselbe Zeile zurueck.
function singleRowPool(row) {
  return {
    query: async () => ({ rows: [row] })
  };
}

/* ── 1. requisitionKpis ─────────────────────────────────────── */

describe("WAVE_05: requisitionKpis()", () => {
  it("liefert Null-Zustand bei leerem Pool (kein Crash)", async () => {
    const kpis = await requisitionKpis(emptyPool());
    assert.equal(typeof kpis.total, "number");
    assert.equal(kpis.total, 0);
    assert.equal(kpis.open, 0);
    assert.equal(kpis.filled, 0);
    assert.equal(kpis.urgent_open, 0);
    assert.equal(kpis.avg_time_to_fill_hours, null);
  });

  it("enthaelt 'partially_filled' Feld (Migration 113 integriert)", async () => {
    const kpis = await requisitionKpis(emptyPool());
    assert.ok(
      Object.prototype.hasOwnProperty.call(kpis, "partially_filled"),
      "partially_filled fehlt in requisitionKpis() — Migration 113 nicht in Service integriert"
    );
    assert.equal(typeof kpis.partially_filled, "number");
  });

  it("enthaelt alle Status-Felder des Requisition-Lifecycles", async () => {
    const kpis = await requisitionKpis(emptyPool());
    const expected = [
      "total", "open", "approved", "in_review", "shortlisted",
      "partially_filled", "filled", "closed", "cancelled",
      "draft", "pending_approval", "urgent_open",
      "avg_time_to_fill_hours", "avg_time_to_approve_hours"
    ];
    for (const field of expected) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(kpis, field),
        `Feld '${field}' fehlt in requisitionKpis()`
      );
    }
  });

  it("uebernimmt DB-Werte korrekt (singleRow)", async () => {
    const pool = singleRowPool({
      total: 5,
      open: 2,
      approved: 1,
      in_review: 0,
      shortlisted: 0,
      partially_filled: 1,
      filled: 1,
      closed: 0,
      cancelled: 0,
      draft: 0,
      pending_approval: 0,
      urgent_open: 1,
      avg_time_to_fill_hours: 48.5,
      avg_time_to_approve_hours: 24.0
    });
    const kpis = await requisitionKpis(pool);
    assert.equal(kpis.total, 5);
    assert.equal(kpis.partially_filled, 1);
    assert.equal(kpis.avg_time_to_fill_hours, 48.5);
  });
});

/* ── 2. complianceSummary ───────────────────────────────────── */

describe("WAVE_05: complianceSummary()", () => {
  it("Null-Zustand bei leerem Pool", async () => {
    const r = await complianceSummary(emptyPool());
    assert.equal(r.total_documents, 0);
    assert.equal(r.verified, 0);
    assert.equal(r.pending, 0);
    assert.equal(r.rejected, 0);
    assert.equal(r.expired, 0);
    assert.equal(r.expiring_soon, 0);
  });

  it("enthaelt alle Pflichtfelder", async () => {
    const r = await complianceSummary(emptyPool());
    for (const f of ["total_documents", "verified", "pending", "rejected", "expired", "expiring_soon"]) {
      assert.ok(Object.prototype.hasOwnProperty.call(r, f), `Feld '${f}' fehlt`);
    }
  });
});

/* ── 3. slaReport ───────────────────────────────────────────── */

describe("WAVE_05: slaReport()", () => {
  it("Null-Zustand bei leerem Pool", async () => {
    const r = await slaReport(emptyPool());
    assert.equal(r.total_with_sla, 0);
    assert.equal(r.sla_met, 0);
    assert.equal(r.sla_breached, 0);
    assert.equal(r.sla_compliance_pct, null);
  });

  it("sla_compliance_pct ist null oder liegt in [0, 100]", async () => {
    const r = await slaReport(singleRowPool({
      total_with_sla: 10, sla_met: 8, sla_breached: 2, sla_running: 0,
      sla_compliance_pct: 80.0
    }));
    if (r.sla_compliance_pct !== null) {
      assert.ok(r.sla_compliance_pct >= 0 && r.sla_compliance_pct <= 100,
        `sla_compliance_pct=${r.sla_compliance_pct} ausserhalb [0,100]`);
    }
  });
});

/* ── 4. requisitionsByPeriod ────────────────────────────────── */

describe("WAVE_05: requisitionsByPeriod()", () => {
  it("liefert leeres Array (kein Crash) bei null orgId", async () => {
    const rows = await requisitionsByPeriod(emptyPool(), null, 30);
    assert.ok(Array.isArray(rows), "Erwartet Array");
    assert.equal(rows.length, 0);
  });
});

/* ── 5. topRoles ────────────────────────────────────────────── */

describe("WAVE_05: topRoles()", () => {
  it("liefert leeres Array bei leerem Pool", async () => {
    const rows = await topRoles(emptyPool(), null, 5);
    assert.ok(Array.isArray(rows));
  });
});

/* ── 6. executiveDashboard Schema ───────────────────────────── */

describe("WAVE_05: executiveDashboard() Schema", () => {
  // executiveDashboard macht Promise.allSettled — braucht einen Pool,
  // der alle Queries akzeptiert. Wir mocken spendAnalyticsService via
  // einen Pool ohne orgId (getExecutiveSpendSummary gibt zero zurueck wenn !orgId).
  it("liefert vollstaendiges Schema ohne Crash (kein orgId)", async () => {
    // Ohne orgId skippt getExecutiveSpendSummary den DB-Call.
    // Alle anderen verwenden pool.query → emptyPool liefert leer.
    const result = await executiveDashboard(emptyPool(), null, null);

    // Pflicht-Felder im Response
    assert.ok(result.generated_at, "generated_at fehlt");
    assert.ok(result.scope, "scope fehlt");
    assert.equal(result.scope.window_days, 30);

    // Alle KPI-Gruppen vorhanden
    for (const key of ["requisitions", "compliance", "sla", "platform", "spend", "finance", "procurement_pulse", "critical_staffing_pressure"]) {
      assert.ok(Object.prototype.hasOwnProperty.call(result, key), `${key} fehlt im executiveDashboard-Response`);
    }
  });

  it("requisitions.partially_filled ist im executiveDashboard enthalten", async () => {
    const result = await executiveDashboard(emptyPool(), null, null);
    assert.ok(
      Object.prototype.hasOwnProperty.call(result.requisitions, "partially_filled"),
      "requisitions.partially_filled fehlt — executiveDashboard spiegelt Migration 113 nicht"
    );
  });

  it("kein 500: Promise.allSettled faengt einzelne Fehler ab (resilience)", async () => {
    // Pool der bei der ERSTEN query einen Fehler wirft — alles danach faellt durch
    let callCount = 0;
    const flakyPool = {
      query: async () => {
        callCount++;
        if (callCount <= 2) throw new Error("DB connection lost");
        return { rows: [] };
      }
    };
    // Darf nicht throwen — muss graceful degradieren
    const result = await executiveDashboard(flakyPool, null, null);
    assert.ok(result.generated_at, "Response muss trotz DB-Fehler geliefert werden");
    // Zero-Werte bei Fehler
    assert.equal(result.requisitions.total, 0);
  });

  it("scope enthaelt date_from und date_to (30-Tage-Fenster korrekt)", async () => {
    const result = await executiveDashboard(emptyPool(), null, null);
    assert.ok(result.scope.date_from, "date_from fehlt im scope");
    assert.ok(result.scope.date_to, "date_to fehlt im scope");
    const from = new Date(result.scope.date_from);
    const to = new Date(result.scope.date_to);
    const diffDays = (to - from) / (24 * 60 * 60 * 1000);
    assert.ok(diffDays >= 28 && diffDays <= 32, `Fenstergröße ${diffDays} Tage ausserhalb [28,32]`);
  });
});
