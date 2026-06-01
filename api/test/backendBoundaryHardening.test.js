/**
 * Backend Boundary Hardening — 16 Pflicht-Testfaelle.
 *
 * Prueft: org_id-Isolation, Location/Department-Boundary-Assertions,
 * SQL-Injection-Abwehr (spendAnalytics), OrgBoundaryError-Shape.
 *
 * Alle Tests sind Unit-Style (kein echtes DB erforderlich ausser DB-Tests).
 * DB-Tests: before-Hook skippt bei fehlendem DATABASE_URL.
 *
 * Run: node --test --test-force-exit test/backendBoundaryHardening.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

/* ── 1. OrgBoundaryError Shape ─────────────────────────── */

import { OrgBoundaryError } from "../utils/orgBoundary.js";

describe("OrgBoundaryError", () => {
  it("hat status 403 und code ORG_BOUNDARY_VIOLATION", () => {
    const err = new OrgBoundaryError();
    assert.equal(err.status, 403);
    assert.equal(err.code, "ORG_BOUNDARY_VIOLATION");
    assert.ok(err instanceof Error);
    assert.equal(err.name, "OrgBoundaryError");
  });

  it("akzeptiert custom message", () => {
    const err = new OrgBoundaryError("Fremde Org");
    assert.equal(err.message, "Fremde Org");
    assert.equal(err.status, 403);
  });
});

/* ── 2. assertLocationBelongsToOrg / assertDepartmentBelongsToOrg ──────── */

import {
  assertLocationBelongsToOrg,
  assertDepartmentBelongsToOrg,
} from "../utils/orgBoundary.js";

function makePool(rows) {
  return { query: async () => ({ rows }) };
}

describe("assertLocationBelongsToOrg", () => {
  it("skip bei locationId = null (kein Fehler)", async () => {
    const pool = makePool([]); // kein DB-Aufruf erwartet
    await assert.doesNotReject(() => assertLocationBelongsToOrg(pool, null, "org-1"));
  });

  it("wirft OrgBoundaryError wenn Standort nicht zur Org gehoert", async () => {
    const pool = makePool([]); // 0 Zeilen = Standort nicht gefunden / fremde Org
    await assert.rejects(
      () => assertLocationBelongsToOrg(pool, "loc-foreign", "org-1"),
      (err) => {
        assert.equal(err.code, "ORG_BOUNDARY_VIOLATION");
        assert.equal(err.status, 403);
        return true;
      }
    );
  });

  it("kein Fehler wenn Standort zur Org gehoert", async () => {
    const pool = makePool([{ "?column?": 1 }]); // 1 Zeile = gefunden
    await assert.doesNotReject(() => assertLocationBelongsToOrg(pool, "loc-own", "org-1"));
  });
});

describe("assertDepartmentBelongsToOrg", () => {
  it("skip bei departmentId = null (kein Fehler)", async () => {
    const pool = makePool([]);
    await assert.doesNotReject(() => assertDepartmentBelongsToOrg(pool, null, "org-1"));
  });

  it("wirft OrgBoundaryError wenn Abteilung nicht zur Org gehoert", async () => {
    const pool = makePool([]); // 0 Zeilen
    await assert.rejects(
      () => assertDepartmentBelongsToOrg(pool, "dept-foreign", "org-1"),
      (err) => {
        assert.equal(err.code, "ORG_BOUNDARY_VIOLATION");
        assert.equal(err.status, 403);
        return true;
      }
    );
  });

  it("kein Fehler wenn Abteilung zur Org gehoert", async () => {
    const pool = makePool([{ "?column?": 1 }]);
    await assert.doesNotReject(() => assertDepartmentBelongsToOrg(pool, "dept-own", "org-1"));
  });
});

/* ── 3. capacityExchangeService: org_id nicht in UPDATABLE_FIELDS ───────── */

describe("capacityExchangeService UPDATABLE_FIELDS", () => {
  it("org_id ist nicht in UPDATABLE_FIELDS", async () => {
    // Dynamischer Import um sicherzustellen dass der echte Service-Code gelesen wird.
    const mod = await import("../services/capacityExchangeService.js");
    // UPDATABLE_FIELDS ist nicht exportiert → Source-Text pruefen.
    // Wir verifizieren ueber den exportierten Modul-Source-String-Trick nicht noetig —
    // stattdessen: wenn org_id noch in UPDATABLE_FIELDS waere, wuerde updateCapacityEntry
    // es in den SET-Clause aufnehmen. Wir ueberpruefen mit einem Mock-Pool.
    let capturedSql = null;
    const mockPool = {
      query: async (sql, _params) => {
        capturedSql = sql;
        return { rows: [{ id: "entry-1", org_id: "org-fixed" }] };
      }
    };
    // updateCapacityEntry(pool, entryId, supplierId, data)
    await mod.updateCapacityEntry(mockPool, "entry-1", "supplier-1", {
      org_id: "org-attack",      // sollte ignoriert werden
      title: "Test Eintrag"      // legitimes Feld
    });
    assert.ok(capturedSql, "Query wurde abgesetzt");
    assert.ok(
      !capturedSql.includes("org_id = $"),
      "org_id darf nicht im UPDATE SET-Clause auftauchen"
    );
    assert.ok(
      capturedSql.includes("title = $"),
      "title muss im UPDATE SET-Clause auftauchen"
    );
  });
});

/* ── 4. capacityExchangeService: createCapacityEntry ruft Boundary-Assert auf ── */

describe("capacityExchangeService createCapacityEntry — Boundary-Checks", () => {
  it("wirft OrgBoundaryError wenn location_id fremder Org gehoert", async () => {
    const mod = await import("../services/capacityExchangeService.js");
    const pool = {
      query: async (sql) => {
        // Simuliere: org_locations Pruefung schlaegt fehl (0 Zeilen)
        if (sql.includes("org_locations")) return { rows: [] };
        // Plan-Limit-Check
        if (sql.includes("capacity_posts")) return { rows: [{ count: "0" }] };
        return { rows: [] };
      }
    };
    await assert.rejects(
      () => mod.createCapacityEntry(pool, "supplier-1", "PLUS", {
        title: "Test", role: "Lagerist", availability_from: "2026-06-01",
        location_city: "Berlin", org_id: "org-1", location_id: "loc-foreign-org",
        headcount: 1
      }),
      (err) => {
        assert.equal(err.code, "ORG_BOUNDARY_VIOLATION");
        return true;
      }
    );
  });

  it("wirft OrgBoundaryError wenn department_id fremder Org gehoert", async () => {
    const mod = await import("../services/capacityExchangeService.js");
    const pool = {
      query: async (sql) => {
        // location_id = null → assertLocation skip; dept schlaegt fehl
        if (sql.includes("org_departments")) return { rows: [] };
        if (sql.includes("capacity_posts")) return { rows: [{ count: "0" }] };
        return { rows: [] };
      }
    };
    await assert.rejects(
      () => mod.createCapacityEntry(pool, "supplier-1", "PLUS", {
        title: "Test", role: "Lagerist", availability_from: "2026-06-01",
        location_city: "Berlin", org_id: "org-1",
        location_id: null,          // kein Location-Check
        department_id: "dept-foreign",
        headcount: 1
      }),
      (err) => {
        assert.equal(err.code, "ORG_BOUNDARY_VIOLATION");
        return true;
      }
    );
  });
});

/* ── 5. requisitionService: createRequisition ruft Boundary-Assert auf ──── */

describe("requisitionService createRequisition — Boundary-Checks", () => {
  it("wirft OrgBoundaryError wenn location_id fremder Org gehoert", async () => {
    const mod = await import("../services/requisitionService.js");
    const pool = {
      query: async (sql) => {
        if (sql.includes("org_locations")) return { rows: [] };
        return { rows: [] };
      }
    };
    await assert.rejects(
      () => mod.createRequisition(pool, "user-1", {
        title: "Test Bedarf", role: "IT-Support",
        org_id: "org-1", location_id: "loc-foreign"
      }),
      (err) => {
        assert.equal(err.code, "ORG_BOUNDARY_VIOLATION");
        return true;
      }
    );
  });

  it("wirft OrgBoundaryError wenn department_id fremder Org gehoert", async () => {
    const mod = await import("../services/requisitionService.js");
    const pool = {
      query: async (sql) => {
        if (sql.includes("org_departments")) return { rows: [] };
        return { rows: [{ "?column?": 1 }] }; // location OK
      }
    };
    await assert.rejects(
      () => mod.createRequisition(pool, "user-1", {
        title: "Test Bedarf", role: "IT-Support",
        org_id: "org-1", location_id: null, department_id: "dept-foreign"
      }),
      (err) => {
        assert.equal(err.code, "ORG_BOUNDARY_VIOLATION");
        return true;
      }
    );
  });
});

/* ── 6. rateCardService: createRateCard ruft Boundary-Assert auf ─────────── */

describe("rateCardService createRateCard — Boundary-Checks", () => {
  it("wirft OrgBoundaryError wenn locationId fremder Org gehoert", async () => {
    const mod = await import("../services/rateCardService.js");
    const pool = {
      query: async (sql) => {
        if (sql.includes("org_locations")) return { rows: [] };
        return { rows: [] };
      }
    };
    await assert.rejects(
      () => mod.createRateCard(pool, {
        orgId: "org-1", roleCategory: "IT", targetRateCents: 5000,
        maxRateCents: 6000, validFrom: "2026-01-01", locationId: "loc-foreign"
      }),
      (err) => {
        assert.equal(err.code, "ORG_BOUNDARY_VIOLATION");
        return true;
      }
    );
  });

  it("wirft OrgBoundaryError wenn departmentId fremder Org gehoert", async () => {
    const mod = await import("../services/rateCardService.js");
    const pool = {
      query: async (sql) => {
        if (sql.includes("org_departments")) return { rows: [] };
        return { rows: [{ "?column?": 1 }] }; // location OK
      }
    };
    await assert.rejects(
      () => mod.createRateCard(pool, {
        orgId: "org-1", roleCategory: "IT", targetRateCents: 5000,
        maxRateCents: 6000, validFrom: "2026-01-01",
        locationId: null, departmentId: "dept-foreign"
      }),
      (err) => {
        assert.equal(err.code, "ORG_BOUNDARY_VIOLATION");
        return true;
      }
    );
  });
});

/* ── 7. vendorPoolService: addToPool ruft Boundary-Assert auf ─────────────── */

describe("vendorPoolService addToPool — Boundary-Checks", () => {
  it("wirft OrgBoundaryError wenn location_id fremder Org gehoert", async () => {
    const mod = await import("../services/vendorPoolService.js");
    const pool = {
      query: async (sql) => {
        if (sql.includes("org_locations")) return { rows: [] };
        return { rows: [] };
      }
    };
    await assert.rejects(
      () => mod.addToPool(pool, {
        client_org_id: "org-client", supplier_org_id: "org-supplier",
        tier: "PREFERRED", location_id: "loc-foreign", department_id: null
      }),
      (err) => {
        assert.equal(err.code, "ORG_BOUNDARY_VIOLATION");
        return true;
      }
    );
  });
});

/* ── 8. assignmentService: createAssignment ruft Boundary-Assert auf ────── */

describe("assignmentService createAssignment — Boundary-Checks", () => {
  it("wirft OrgBoundaryError wenn location_id fremder Org gehoert", async () => {
    const mod = await import("../services/assignmentService.js");
    const pool = {
      query: async (sql) => {
        if (sql.includes("org_locations")) return { rows: [] };
        return { rows: [] };
      }
    };
    await assert.rejects(
      () => mod.createAssignment(pool, {
        org_id: "org-1", supplier_org_id: "org-supplier",
        start_date: "2026-06-01", location_id: "loc-foreign", department_id: null
      }),
      (err) => {
        assert.equal(err.code, "ORG_BOUNDARY_VIOLATION");
        return true;
      }
    );
  });

  it("wirft OrgBoundaryError wenn department_id fremder Org gehoert", async () => {
    const mod = await import("../services/assignmentService.js");
    const pool = {
      query: async (sql) => {
        if (sql.includes("org_departments")) return { rows: [] };
        return { rows: [{ "?column?": 1 }] }; // location OK
      }
    };
    await assert.rejects(
      () => mod.createAssignment(pool, {
        org_id: "org-1", supplier_org_id: "org-supplier",
        start_date: "2026-06-01", location_id: null, department_id: "dept-foreign"
      }),
      (err) => {
        assert.equal(err.code, "ORG_BOUNDARY_VIOLATION");
        return true;
      }
    );
  });
});

/* ── 9. capacityDiscoveryService: filters.org_id Unterstuetzung ─────────── */

describe("capacityDiscoveryService — org_id Filter", () => {
  it("aggregateByRole mit org_id: Query enthaelt cp.org_id = $N", async () => {
    const mod = await import("../services/capacityDiscoveryService.js");
    let capturedSql = "";
    let capturedParams = [];
    const pool = {
      query: async (sql, params) => {
        capturedSql = sql;
        capturedParams = params;
        return { rows: [] };
      }
    };
    await mod.aggregateByRole(pool, { org_id: "org-filter-123" });
    assert.ok(
      capturedSql.includes("cp.org_id ="),
      "Query muss cp.org_id = $N enthalten wenn filters.org_id gesetzt"
    );
    assert.ok(
      capturedParams.includes("org-filter-123"),
      "org-filter-123 muss in den Query-Parametern sein"
    );
  });

  it("aggregateByRegion ohne org_id: Query enthaelt KEIN cp.org_id-Filter (Cross-Org-Marketplace)", async () => {
    const mod = await import("../services/capacityDiscoveryService.js");
    let capturedSql = "";
    const pool = {
      query: async (sql) => {
        capturedSql = sql;
        return { rows: [] };
      }
    };
    await mod.aggregateByRegion(pool, {}); // kein org_id → Cross-Org
    assert.ok(
      !capturedSql.includes("cp.org_id ="),
      "Ohne filters.org_id darf kein org_id-Filter in der Query sein"
    );
  });
});

/* ── 9. spendAnalyticsService: kein Template-Literal in DATE_TRUNC ──────── */

describe("spendAnalyticsService getSpendOverTime — SQL-Haertung", () => {
  it("granularity wird als $N Parameter uebergeben (kein Template-Literal)", async () => {
    const mod = await import("../services/spendAnalyticsService.js");
    let capturedSql = "";
    let capturedParams = [];
    const pool = {
      query: async (sql, params) => {
        capturedSql = sql;
        capturedParams = params;
        return { rows: [] };
      }
    };
    // monthly (default)
    await mod.getSpendOverTime(pool, "org-1", {});
    assert.ok(
      !capturedSql.includes("DATE_TRUNC('month'"),
      "DATE_TRUNC darf kein eingebettetes String-Literal 'month' enthalten"
    );
    assert.ok(
      !capturedSql.includes("DATE_TRUNC('quarter'"),
      "DATE_TRUNC darf kein eingebettetes String-Literal 'quarter' enthalten"
    );
    assert.ok(
      /DATE_TRUNC\s*\(\s*\$\d+/.test(capturedSql),
      "DATE_TRUNC muss einen $N-Parameter als erstes Argument verwenden"
    );
    assert.ok(
      capturedParams.includes("month") || capturedParams.includes("quarter"),
      "granularity ('month' oder 'quarter') muss im params-Array stehen"
    );
  });

  it("granularity 'quarterly' ergibt Parameter 'quarter'", async () => {
    const mod = await import("../services/spendAnalyticsService.js");
    let capturedParams = [];
    const pool = {
      query: async (_sql, params) => {
        capturedParams = params;
        return { rows: [] };
      }
    };
    await mod.getSpendOverTime(pool, "org-1", { granularity: "quarterly" });
    assert.ok(
      capturedParams.includes("quarter"),
      "filters.granularity='quarterly' muss 'quarter' als DB-Parameter ergeben"
    );
    assert.ok(
      !capturedParams.includes("quarterly"),
      "Roher Wert 'quarterly' darf niemals in die DB-Query"
    );
  });

  it("unbekannte granularity faellt auf 'month' zurueck (Whitelist)", async () => {
    const mod = await import("../services/spendAnalyticsService.js");
    let capturedParams = [];
    const pool = {
      query: async (_sql, params) => {
        capturedParams = params;
        return { rows: [] };
      }
    };
    await mod.getSpendOverTime(pool, "org-1", { granularity: "'; DROP TABLE timesheets; --" });
    assert.ok(
      capturedParams.includes("month"),
      "Unbekannte granularity muss auf 'month' fallen (Whitelist)"
    );
    assert.ok(
      !capturedParams.some(p => String(p).includes("DROP")),
      "SQL-Injection-Versuch darf nicht in params landen"
    );
  });
});
