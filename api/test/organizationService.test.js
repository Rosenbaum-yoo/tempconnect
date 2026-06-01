/**
 * Organization Service Tests — Org-CRUD, Locations, Departments.
 *
 * Testet: getOrganization, updateOrganization, markOnboardingComplete,
 *         listLocations, createLocation, updateLocation,
 *         listDepartments, createDepartment, updateDepartment.
 * Run: node --test test/organizationService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getOrganization,
  updateOrganization,
  markOnboardingComplete,
  listLocations,
  createLocation,
  updateLocation,
  listDepartments,
  createDepartment,
  updateDepartment
} from "../services/organizationService.js";

/* ── Helpers ──────────────────────────────────────────── */

function mockPool(rowsOrFn) {
  if (typeof rowsOrFn === "function") return { query: rowsOrFn };
  return { query: async () => ({ rows: rowsOrFn || [] }) };
}

/* ── getOrganization ─────────────────────────────────── */

describe("getOrganization", () => {
  it("gibt Org mit Zaehler-Feldern zurueck", async () => {
    const org = { id: "org-1", name: "Firma GmbH", member_count: 5, location_count: 2, department_count: 3 };
    const result = await getOrganization(mockPool([org]), "org-1");
    assert.equal(result.id, "org-1");
    assert.equal(result.member_count, 5);
  });

  it("gibt null zurueck wenn nicht gefunden", async () => {
    const result = await getOrganization(mockPool([]), "org-missing");
    assert.equal(result, null);
  });
});

/* ── updateOrganization ──────────────────────────────── */

describe("updateOrganization", () => {
  it("aktualisiert erlaubte Felder", async () => {
    let capturedParams = null;
    const pool = mockPool(async (_sql, params) => {
      capturedParams = params;
      return { rows: [{ id: "org-1", name: "Neu GmbH" }] };
    });
    const result = await updateOrganization(pool, "org-1", { name: "Neu GmbH" });
    assert.equal(result.name, "Neu GmbH");
    assert.ok(capturedParams.includes("org-1"));
    assert.ok(capturedParams.includes("Neu GmbH"));
  });

  it("gibt null zurueck wenn keine erlaubten Felder", async () => {
    const result = await updateOrganization(mockPool(), "org-1", { unknown_field: "x" });
    assert.equal(result, null);
  });

  it("gibt null zurueck bei leerem Data-Objekt", async () => {
    const result = await updateOrganization(mockPool(), "org-1", {});
    assert.equal(result, null);
  });

  it("aktualisiert mehrere Felder gleichzeitig", async () => {
    let capturedSql = "";
    const pool = mockPool(async (sql, _params) => {
      capturedSql = sql;
      return { rows: [{ id: "org-1" }] };
    });
    await updateOrganization(pool, "org-1", { name: "Neu", billing_email: "a@b.de", tax_id: "DE123" });
    assert.ok(capturedSql.includes("name ="));
    assert.ok(capturedSql.includes("billing_email ="));
    assert.ok(capturedSql.includes("tax_id ="));
  });

  it("filtert nicht-erlaubte Felder", async () => {
    let capturedSql = "";
    const pool = mockPool(async (sql) => {
      capturedSql = sql;
      return { rows: [{ id: "org-1" }] };
    });
    await updateOrganization(pool, "org-1", { name: "OK", hacker_field: "drop" });
    assert.ok(capturedSql.includes("name ="));
    assert.ok(!capturedSql.includes("hacker_field"));
  });

  it("gibt null zurueck wenn UPDATE keine Rows liefert", async () => {
    const pool = mockPool(async () => ({ rows: [] }));
    const result = await updateOrganization(pool, "org-missing", { name: "Test" });
    assert.equal(result, null);
  });
});

/* ── markOnboardingComplete ──────────────────────────── */

describe("markOnboardingComplete", () => {
  it("ruft UPDATE mit orgId auf", async () => {
    let capturedParams = null;
    const pool = mockPool(async (_sql, params) => {
      capturedParams = params;
      return { rows: [] };
    });
    await markOnboardingComplete(pool, "org-1");
    assert.deepEqual(capturedParams, ["org-1"]);
  });
});

/* ── Locations ───────────────────────────────────────── */

describe("listLocations", () => {
  it("gibt Locations fuer orgId zurueck", async () => {
    const locs = [{ id: "loc-1", name: "HQ", is_hq: true }, { id: "loc-2", name: "Filiale", is_hq: false }];
    const result = await listLocations(mockPool(locs), "org-1");
    assert.equal(result.length, 2);
    assert.equal(result[0].name, "HQ");
  });

  it("gibt leeres Array wenn keine Locations", async () => {
    const result = await listLocations(mockPool([]), "org-1");
    assert.deepEqual(result, []);
  });
});

describe("createLocation", () => {
  it("erstellt Location mit Pflichtfeldern", async () => {
    let capturedParams = null;
    const pool = mockPool(async (_sql, params) => {
      capturedParams = params;
      return { rows: [{ id: "loc-new", org_id: "org-1", name: "Berlin", city: "Berlin" }] };
    });
    const result = await createLocation(pool, "org-1", { name: "Berlin", city: "Berlin" });
    assert.equal(result.name, "Berlin");
    assert.equal(capturedParams[0], "org-1");
    assert.equal(capturedParams[1], "Berlin");
  });

  it("setzt optionale Felder auf null/Defaults", async () => {
    let capturedParams = null;
    const pool = mockPool(async (_sql, params) => {
      capturedParams = params;
      return { rows: [{ id: "loc-new" }] };
    });
    await createLocation(pool, "org-1", { name: "Minimal", city: "X" });
    // street, postal_code, latitude, longitude → null; country → 'DE'; is_hq → false
    assert.equal(capturedParams[2], null); // street
    assert.equal(capturedParams[5], "DE"); // country
    assert.equal(capturedParams[8], false); // is_hq
  });

  it("HQ-Switch: setzt andere Standorte auf is_hq=false vor INSERT wenn is_hq=true", async () => {
    const queries = [];
    const pool = mockPool(async (sql, params) => {
      queries.push({ sql, params });
      return { rows: [{ id: "loc-new", is_hq: true }] };
    });
    await createLocation(pool, "org-1", { name: "Neue HQ", city: "Berlin", is_hq: true });
    assert.equal(queries.length, 2, "HQ-Switch UPDATE + INSERT");
    assert.ok(queries[0].sql.includes("is_hq = FALSE"), "Erste Query setzt alle auf is_hq=FALSE");
    assert.equal(queries[0].params[0], "org-1", "HQ-Switch auf Org begrenzt");
  });
});

describe("updateLocation", () => {
  it("aktualisiert erlaubte Felder (mit orgId)", async () => {
    const pool = mockPool(async () => ({ rows: [{ id: "loc-1", name: "Neu" }] }));
    const result = await updateLocation(pool, "loc-1", "org-1", { name: "Neu" });
    assert.equal(result.name, "Neu");
  });

  it("gibt null zurueck bei leeren Feldern", async () => {
    const result = await updateLocation(mockPool(), "loc-1", "org-1", {});
    assert.equal(result, null);
  });

  it("gibt null zurueck wenn Location nicht existiert", async () => {
    const pool = mockPool(async () => ({ rows: [] }));
    const result = await updateLocation(pool, "loc-missing", "org-1", { name: "Test" });
    assert.equal(result, null);
  });

  it("HQ-Switch: setzt andere Standorte auf is_hq=false wenn is_hq=true", async () => {
    const queries = [];
    const pool = mockPool(async (sql, params) => {
      queries.push({ sql, params });
      return { rows: [{ id: "loc-1", is_hq: true }] };
    });
    await updateLocation(pool, "loc-1", "org-1", { is_hq: true });
    assert.equal(queries.length, 2, "Erst HQ-Switch, dann UPDATE dieser Location");
    assert.ok(queries[0].sql.includes("is_hq = FALSE"), "Erste Query setzt andere auf is_hq=FALSE");
    assert.ok(queries[0].sql.includes("id != $2"), "Eigene Location ausgenommen");
    assert.equal(queries[0].params[0], "org-1");
    assert.equal(queries[0].params[1], "loc-1");
  });

  it("deaktiviert Location via is_active=false (Org-scoped WHERE)", async () => {
    let capturedSql = "";
    const pool = mockPool(async (sql) => { capturedSql = sql; return { rows: [{ id: "loc-1", is_active: false }] }; });
    await updateLocation(pool, "loc-1", "org-1", { is_active: false });
    assert.ok(capturedSql.includes("org_id = $2"), "WHERE muss org_id enthalten");
  });
});

/* ── Departments ─────────────────────────────────────── */

describe("listDepartments", () => {
  it("gibt Departments mit Location-Name zurueck", async () => {
    const depts = [{ id: "d-1", name: "IT", location_name: "HQ" }];
    const result = await listDepartments(mockPool(depts), "org-1");
    assert.equal(result.length, 1);
    assert.equal(result[0].location_name, "HQ");
  });
});

describe("createDepartment", () => {
  it("erstellt Department mit Pflichtfeldern", async () => {
    let capturedParams = null;
    const pool = mockPool(async (_sql, params) => {
      capturedParams = params;
      return { rows: [{ id: "d-new", name: "HR" }] };
    });
    const result = await createDepartment(pool, "org-1", { name: "HR" });
    assert.equal(result.name, "HR");
    assert.equal(capturedParams[0], "org-1");
    assert.equal(capturedParams[2], null); // cost_center
    assert.equal(capturedParams[3], null); // location_id
  });

  it("setzt optionale Felder (location_id aus eigener Org)", async () => {
    let capturedParams = null;
    const pool = mockPool(async (_sql, params) => {
      capturedParams = params;
      return { rows: [{ id: "d-new" }] };
    });
    // Pool gibt rows=[{1:1}] fuer Boundary-Check und [{id:"d-new"}] fuer INSERT — da gleicher Pool-Mock,
    // wird capturedParams von letzter Query (INSERT) gesetzt.
    await createDepartment(pool, "org-1", { name: "Dev", cost_center: "CC-42", location_id: "loc-1" });
    assert.equal(capturedParams[2], "CC-42");
    assert.equal(capturedParams[3], "loc-1");
  });

  it("wirft OrgBoundaryError wenn location_id einer Fremd-Org gehoert", async () => {
    // Pool gibt leere Rows fuer Boundary-Check → assertLocationBelongsToOrg wirft
    const pool = mockPool(async () => ({ rows: [] }));
    await assert.rejects(
      () => createDepartment(pool, "org-1", { name: "IT", location_id: "loc-foreign" }),
      err => err.code === "ORG_BOUNDARY_VIOLATION" && err.status === 403
    );
  });
});

describe("updateDepartment", () => {
  it("aktualisiert erlaubte Felder (mit orgId)", async () => {
    const pool = mockPool(async () => ({ rows: [{ id: "d-1", name: "Neu" }] }));
    const result = await updateDepartment(pool, "d-1", "org-1", { name: "Neu" });
    assert.equal(result.name, "Neu");
  });

  it("gibt null zurueck bei leeren Feldern", async () => {
    const result = await updateDepartment(mockPool(), "d-1", "org-1", {});
    assert.equal(result, null);
  });

  it("aktualisiert is_active (Org-scoped WHERE)", async () => {
    let capturedSql = "";
    const pool = mockPool(async (sql) => {
      capturedSql = sql;
      return { rows: [{ id: "d-1", is_active: false }] };
    });
    await updateDepartment(pool, "d-1", "org-1", { is_active: false });
    assert.ok(capturedSql.includes("is_active ="), "SQL muss is_active aktualisieren");
    assert.ok(capturedSql.includes("org_id = $2"), "WHERE muss org_id enthalten");
  });
});
