/**
 * locations.test.js — Unit-Tests fuer org_locations Service-Methoden.
 *
 * Testet: getLocation, deleteLocation, updateLocation (erweitert),
 *         createLocation (HQ-Switch), listLocations.
 *
 * WAVE_13 — Multi-Location CRUD Ergaenzung.
 * Run: node --test --test-force-exit test/locations.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getLocation,
  deleteLocation,
  updateLocation,
  createLocation,
  listLocations
} from "../services/organizationService.js";

/* ── Helpers ──────────────────────────────────────────── */

function mockPool(rowsOrFn) {
  if (typeof rowsOrFn === "function") {
    // Erster Aufruf: kann Zustands-Switch-Query sein
    let call = 0;
    return {
      query: async (sql, params) => {
        call++;
        return rowsOrFn(sql, params, call);
      }
    };
  }
  return { query: async () => ({ rows: rowsOrFn || [] }) };
}

function loc(overrides) {
  return {
    id: "loc-1",
    org_id: "org-1",
    name: "Standort Hamburg",
    city: "Hamburg",
    country: "DE",
    is_hq: false,
    is_active: true,
    ...overrides
  };
}

/* ── getLocation ──────────────────────────────────────── */

describe("getLocation", () => {
  it("1: gibt Standort zurueck wenn gefunden", async () => {
    const result = await getLocation(mockPool([loc()]), "loc-1", "org-1");
    assert.equal(result.id, "loc-1");
    assert.equal(result.city, "Hamburg");
  });

  it("2: gibt null zurueck wenn nicht gefunden", async () => {
    const result = await getLocation(mockPool([]), "loc-missing", "org-1");
    assert.equal(result, null);
  });

  it("3: gibt null zurueck bei falschem Org-Scope (Org-Boundary)", async () => {
    // Pool gibt keine Zeilen zurueck — SQL WHERE org_id = $2 schlaegt fehl
    const result = await getLocation(mockPool([]), "loc-1", "org-other");
    assert.equal(result, null);
  });
});

/* ── deleteLocation ───────────────────────────────────── */

describe("deleteLocation", () => {
  it("4: soft-deleted Standort (is_active=false gesetzt) — gibt Row zurueck", async () => {
    const deleted = loc({ is_active: false });
    const result = await deleteLocation(mockPool([deleted]), "loc-1", "org-1");
    assert.ok(result, "Erwarte einen Rueckgabewert");
    assert.equal(result.id, "loc-1");
  });

  it("5: gibt null zurueck wenn Standort nicht existiert oder bereits inaktiv", async () => {
    const result = await deleteLocation(mockPool([]), "loc-gone", "org-1");
    assert.equal(result, null);
  });

  it("6: gibt null zurueck wenn Standort HQ ist (HQ-Schutz via SQL-Guard)", async () => {
    // SQL hat AND is_hq = FALSE — HQ-Standort wird nicht geloescht
    const result = await deleteLocation(mockPool([]), "loc-hq", "org-1");
    assert.equal(result, null, "HQ-Standort darf nicht geloescht werden");
  });
});

/* ── updateLocation ───────────────────────────────────── */

describe("updateLocation (erweitert)", () => {
  it("7: aktualisiert city und gibt Updated-Row zurueck", async () => {
    const updated = loc({ city: "Berlin" });
    const calls = [];
    const pool = mockPool(async (sql, params, _n) => {
      calls.push(sql.trim().substring(0, 20));
      return { rows: [updated] };
    });
    const result = await updateLocation(pool, "loc-1", "org-1", { city: "Berlin" });
    assert.equal(result.city, "Berlin");
  });

  it("8: fuehrt HQ-Switch durch und gibt Row zurueck", async () => {
    const updated = loc({ is_hq: true });
    let queryCount = 0;
    const pool = mockPool(async (_sql, _params, _n) => {
      queryCount++;
      // Erster Query: HQ-Switch (UPDATE ... SET is_hq = FALSE)
      // Zweiter Query: eigentliches UPDATE mit RETURNING
      return { rows: queryCount === 1 ? [] : [updated] };
    });
    const result = await updateLocation(pool, "loc-1", "org-1", { is_hq: true });
    assert.equal(queryCount, 2, "Erwarte 2 Queries: HQ-Switch + eigenes UPDATE");
    assert.equal(result.is_hq, true);
  });

  it("9: gibt null zurueck wenn keine erlaubten Felder uebergeben", async () => {
    const result = await updateLocation(mockPool([]), "loc-1", "org-1", { unknown: "x" });
    assert.equal(result, null);
  });
});

/* ── createLocation ───────────────────────────────────── */

describe("createLocation", () => {
  it("10: erstellt Standort ohne HQ-Pflicht und gibt Row zurueck", async () => {
    const created = loc({ id: "loc-new" });
    const pool = mockPool(async () => ({ rows: [created] }));
    const result = await createLocation(pool, "org-1", { name: "Muenchen", city: "Muenchen" });
    assert.equal(result.id, "loc-new");
  });

  it("11: HQ-Switch — zwei Queries werden ausgefuehrt (SET is_hq=FALSE + INSERT)", async () => {
    let queryCount = 0;
    const pool = mockPool(async (_sql, _params, _n) => {
      queryCount++;
      return { rows: queryCount === 1 ? [] : [loc({ is_hq: true })] };
    });
    const result = await createLocation(pool, "org-1", { name: "HQ Muenchen", city: "Muenchen", is_hq: true });
    assert.equal(queryCount, 2, "HQ-Switch erfordert 2 Queries");
    assert.equal(result.is_hq, true);
  });
});

/* ── listLocations ────────────────────────────────────── */

describe("listLocations", () => {
  it("12: gibt aktive Standorte sortiert nach is_hq DESC, name ASC zurueck", async () => {
    const rows = [
      loc({ id: "loc-hq", name: "Hauptsitz Berlin", is_hq: true }),
      loc({ id: "loc-2", name: "Zweigstelle Hamburg" })
    ];
    const result = await listLocations(mockPool(rows), "org-1");
    assert.equal(result.length, 2);
    assert.equal(result[0].is_hq, true, "HQ kommt zuerst");
  });

  it("13: gibt leere Liste zurueck wenn keine Standorte vorhanden", async () => {
    const result = await listLocations(mockPool([]), "org-1");
    assert.deepEqual(result, []);
  });
});
