/**
 * departments.test.js — Unit-Tests fuer org_departments Service-Methoden.
 *
 * Testet: getDepartment, deleteDepartment, updateDepartment (bestehend),
 *         createDepartment, listDepartments.
 *
 * WAVE_14 — Department CRUD Ergaenzung (symmetrisch zu WAVE_13 locations.test.js).
 * Run: node --test --test-force-exit test/departments.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getDepartment,
  deleteDepartment,
  updateDepartment,
  createDepartment,
  listDepartments
} from "../services/organizationService.js";

/* ── Helpers ──────────────────────────────────────────── */

function mockPool(rowsOrFn) {
  if (typeof rowsOrFn === "function") {
    return { query: async (sql, params) => rowsOrFn(sql, params) };
  }
  return { query: async () => ({ rows: rowsOrFn || [] }) };
}

function dept(overrides) {
  return {
    id: "dept-1",
    org_id: "org-1",
    name: "Produktion",
    cost_center: null,
    location_id: null,
    location_name: null,
    is_active: true,
    ...overrides
  };
}

/* ── getDepartment ────────────────────────────────────── */

describe("getDepartment", () => {
  it("1: gibt Abteilung mit location_name zurueck wenn gefunden", async () => {
    const result = await getDepartment(mockPool([dept({ location_name: "Berlin HQ" })]), "dept-1", "org-1");
    assert.equal(result.id, "dept-1");
    assert.equal(result.location_name, "Berlin HQ");
  });

  it("2: gibt null zurueck wenn nicht gefunden", async () => {
    const result = await getDepartment(mockPool([]), "dept-missing", "org-1");
    assert.equal(result, null);
  });

  it("3: gibt null zurueck bei falschem Org-Scope (Org-Boundary via SQL WHERE)", async () => {
    const result = await getDepartment(mockPool([]), "dept-1", "org-other");
    assert.equal(result, null);
  });
});

/* ── deleteDepartment ─────────────────────────────────── */

describe("deleteDepartment", () => {
  it("4: soft-deleted Abteilung — gibt Row zurueck", async () => {
    const deleted = dept({ is_active: false });
    const result = await deleteDepartment(mockPool([deleted]), "dept-1", "org-1");
    assert.ok(result, "Erwarte einen Rueckgabewert");
    assert.equal(result.id, "dept-1");
  });

  it("5: gibt null zurueck wenn Abteilung nicht existiert oder bereits inaktiv", async () => {
    const result = await deleteDepartment(mockPool([]), "dept-gone", "org-1");
    assert.equal(result, null);
  });

  it("6: gibt null bei falschem Org-Scope zurueck (Boundary via SQL WHERE)", async () => {
    const result = await deleteDepartment(mockPool([]), "dept-1", "org-other");
    assert.equal(result, null);
  });
});

/* ── updateDepartment ─────────────────────────────────── */

describe("updateDepartment", () => {
  it("7: aktualisiert name und gibt Updated-Row zurueck", async () => {
    const updated = dept({ name: "Logistik" });
    const result = await updateDepartment(mockPool([updated]), "dept-1", "org-1", { name: "Logistik" });
    assert.equal(result.name, "Logistik");
  });

  it("8: gibt null zurueck wenn keine erlaubten Felder uebergeben", async () => {
    const result = await updateDepartment(mockPool([]), "dept-1", "org-1", { unknown: "x" });
    assert.equal(result, null);
  });

  it("9: aktualisiert location_id (Standort-Zuweisung)", async () => {
    let capturedSql = "";
    const pool = mockPool(async (sql, _params) => {
      capturedSql = sql;
      return { rows: [dept({ location_id: "loc-99" })] };
    });
    const result = await updateDepartment(pool, "dept-1", "org-1", { location_id: "loc-99" });
    assert.ok(capturedSql.includes("location_id ="), "SQL muss location_id enthalten");
    assert.equal(result.location_id, "loc-99");
  });
});

/* ── createDepartment ─────────────────────────────────── */

describe("createDepartment", () => {
  it("10: erstellt Abteilung ohne location und gibt Row zurueck", async () => {
    const created = dept({ id: "dept-new", name: "IT" });
    const result = await createDepartment(mockPool([created]), "org-1", { name: "IT" });
    assert.equal(result.id, "dept-new");
    assert.equal(result.name, "IT");
  });

  it("11: erstellt Abteilung mit cost_center", async () => {
    let capturedParams = null;
    const pool = mockPool(async (_sql, params) => {
      capturedParams = params;
      return { rows: [dept({ cost_center: "CC-42" })] };
    });
    const result = await createDepartment(pool, "org-1", { name: "Finance", cost_center: "CC-42" });
    assert.ok(capturedParams.includes("CC-42"), "cost_center muss als Parameter uebergeben werden");
    assert.equal(result.cost_center, "CC-42");
  });
});

/* ── listDepartments ──────────────────────────────────── */

describe("listDepartments", () => {
  it("12: gibt aktive Abteilungen zurueck", async () => {
    const rows = [
      dept({ id: "dept-1", name: "Produktion" }),
      dept({ id: "dept-2", name: "Logistik" })
    ];
    const result = await listDepartments(mockPool(rows), "org-1");
    assert.equal(result.length, 2);
  });

  it("13: gibt leere Liste zurueck wenn keine Abteilungen vorhanden", async () => {
    const result = await listDepartments(mockPool([]), "org-1");
    assert.deepEqual(result, []);
  });
});
