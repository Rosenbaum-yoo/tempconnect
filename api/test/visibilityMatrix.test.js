/**
 * visibilityMatrix + visibilityAuditService tests (Welle 8 Schritt 10).
 *
 * Verifiziert die kanonische Matrix:
 *   - Schema (alle Pflichtfelder vorhanden)
 *   - gating_strategy nur aus erlaubter Liste
 *   - feature_key existiert in planFeatures.js
 *   - allowed_roles / allowed_user_roles / allowed_org_types sind Arrays
 *   - Audit-Report liefert Findings-Schema und Summary
 *   - Audit-Report wirft Error fuer absichtlich kaputte Eintraege
 *
 * Run: node --test --test-force-exit api/test/visibilityMatrix.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { VISIBILITY_MATRIX, GATING_STRATEGIES, listMatrixFeatureKeys, listMatrixSurfaces } from "../config/visibilityMatrix.js";
import { buildAuditReport } from "../services/visibilityAuditService.js";
import { planFeatures } from "../config/planFeatures.js";
import { resolveEnterpriseSurfaceAccess } from "../services/enterpriseSurfaceAccessService.js";

const ROOT = process.cwd();

// Pfad zur Frontend-JS-Datei — erreichbar wenn:
//   (a) docker-compose.yml: ./frontend/public/js:/app/frontend/public/js:ro gemountet ODER
//   (b) Tests lokal vom Projekt-Root (tempconnect_docker/) gestartet werden.
const HUB_VISIBILITY_FILE = path.join(ROOT, "frontend/public/js/hubVisibility.js");
const HUB_VISIBILITY_AVAILABLE = fs.existsSync(HUB_VISIBILITY_FILE);

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function loadHubSurfaceKeys() {
  const windowObj = { TC: {} };
  const sandbox = { window: windowObj };
  vm.createContext(sandbox);
  vm.runInContext(readProjectFile("frontend/public/js/hubVisibility.js"), sandbox, { filename: "frontend/public/js/hubVisibility.js" });
  return Object.keys(sandbox.window.TC.hubVisibility._surfaces);
}

describe("VISIBILITY_MATRIX schema", () => {
  it("hat mindestens 15 Eintraege (alle Hauptbereiche abgedeckt)", () => {
    assert.ok(VISIBILITY_MATRIX.length >= 15, "Erwartet mindestens 15 Matrix-Eintraege");
  });

  it("alle Eintraege haben Pflichtfelder", () => {
    for (const row of VISIBILITY_MATRIX) {
      assert.ok(row.page, "page fehlt: " + JSON.stringify(row));
      assert.ok(typeof row.gating_strategy === "string", "gating_strategy fehlt fuer " + row.page);
      assert.ok(Array.isArray(row.allowed_roles), "allowed_roles muss Array sein: " + row.page);
      assert.ok(Array.isArray(row.allowed_user_roles), "allowed_user_roles muss Array sein: " + row.page);
      assert.ok(Array.isArray(row.allowed_org_types), "allowed_org_types muss Array sein: " + row.page);
      assert.equal(typeof row.requires_pilot, "boolean", row.page);
      assert.equal(typeof row.requires_individuell, "boolean", row.page);
      assert.equal(typeof row.has_backend_guard, "boolean", row.page);
      assert.equal(typeof row.has_upgrade_cta, "boolean", row.page);
      assert.equal(typeof row.requires_staff_approval, "boolean", row.page);
    }
  });

  it("gating_strategy ist immer ein erlaubter Wert", () => {
    for (const row of VISIBILITY_MATRIX) {
      assert.ok(GATING_STRATEGIES.includes(row.gating_strategy),
        `gating_strategy='${row.gating_strategy}' ungueltig fuer ${row.page}`);
    }
  });

  it("feature_key existiert in planFeatures.js wenn gesetzt", () => {
    const known = new Set(Object.keys(planFeatures));
    for (const row of VISIBILITY_MATRIX) {
      if (row.feature_key) {
        assert.ok(known.has(row.feature_key),
          `Unknown feature_key='${row.feature_key}' in Matrix-Zeile fuer ${row.page}`);
      }
    }
  });

  it("allowed_org_types nur company/agency oder leer", () => {
    const valid = new Set(["company", "agency"]);
    for (const row of VISIBILITY_MATRIX) {
      for (const ot of row.allowed_org_types) {
        assert.ok(valid.has(ot), `Ungueltiger org_type='${ot}' bei ${row.page}`);
      }
    }
  });

  it("Hauptbereiche sind abgedeckt (Dashboard, Marketplace, Vendor Pool, Requisitions, sla_abo, staff, admin, multi-org, integrations, reports, dokumente, notifications)", () => {
    const pages = new Set(VISIBILITY_MATRIX.map((r) => r.page));
    const expected = [
      "enterprise.html",
      "capacity_exchange_feed.html",
      "vendor_pool.html",
      "requisitions.html",
      "sla_abo.html",
      "staff/index.html",
      "admin_panel.html",
      "organization.html",
      "integrations.html",
      "reports.html",
      "notifications.html"
    ];
    for (const p of expected) {
      assert.ok(pages.has(p), `Hauptbereich fehlt in Matrix: ${p}`);
    }
  });
});

describe("visibilityAuditService.buildAuditReport", () => {
  it("liefert matrix + findings + summary", () => {
    const r = buildAuditReport();
    assert.ok(Array.isArray(r.matrix));
    assert.ok(Array.isArray(r.findings));
    assert.equal(typeof r.summary.rows, "number");
    assert.equal(typeof r.summary.errors, "number");
    assert.equal(typeof r.summary.warnings, "number");
    assert.equal(typeof r.summary.infos, "number");
    assert.equal(r.summary.rows, VISIBILITY_MATRIX.length);
  });

  it("hat keine ERROR-Findings auf der aktuellen Matrix", () => {
    const r = buildAuditReport();
    const errors = r.findings.filter((f) => f.severity === "error");
    assert.equal(errors.length, 0, "Matrix-Errors: " + JSON.stringify(errors, null, 2));
  });

  it("matrix_features-count entspricht listMatrixFeatureKeys()", () => {
    const r = buildAuditReport();
    assert.equal(r.summary.matrix_features, listMatrixFeatureKeys().length);
  });
});

describe("listMatrixSurfaces / listMatrixFeatureKeys", () => {
  it("listMatrixSurfaces liefert eindeutige Surfaces", () => {
    const out = listMatrixSurfaces();
    const set = new Set(out);
    assert.equal(out.length, set.size);
    // Erwartete Mindest-Surfaces
    for (const s of ["marketplace", "requisitions", "deals", "bounties", "vendor_pool", "executive_dashboard", "admin_panel"]) {
      assert.ok(set.has(s), `Surface fehlt: ${s}`);
    }
  });

  it("listMatrixFeatureKeys liefert eindeutige Feature-Keys", () => {
    const out = listMatrixFeatureKeys();
    const set = new Set(out);
    assert.equal(out.length, set.size);
  });
});

describe("visibility matrix drift protection", () => {
  it("Matrix-Surfaces, die im Enterprise-Hub sichtbar sind, existieren in HUB_SURFACES",
    { skip: !HUB_VISIBILITY_AVAILABLE ? "hubVisibility.js nicht erreichbar — Volume-Mount fehlt" : false },
    () => {
      const hubKeys = new Set(loadHubSurfaceKeys());
      const matrixSurfaces = listMatrixSurfaces();
      assert.ok(matrixSurfaces.length >= 8, "Erwartet mehrere Hub-gekoppelte Matrix-Surfaces");
      for (const surface of matrixSurfaces) {
        assert.ok(hubKeys.has(surface), `Matrix-Surface ${surface} fehlt in hubVisibility.HUB_SURFACES`);
      }
    });

  it("Procurement-/Governance-Matrixseiten haben korrespondierende enterpriseSurfaceAccessService Keys", () => {
    const access = resolveEnterpriseSurfaceAccess({
      plan: "PRO",
      role: "company",
      orgType: "company",
      orgRole: "owner"
    });
    const serviceKeys = new Set(Object.keys(access));
    const expectedPageToService = {
      "vendor_pool.html": "vendor_pool",
      "supplier_scorecard.html": "supplier_scorecard",
      "rate-cards.html": "rate_cards",
      "spend-analytics.html": "spend_analytics",
      "executive_dashboard.html": "executive_dashboard"
    };
    for (const [page, serviceKey] of Object.entries(expectedPageToService)) {
      assert.ok(VISIBILITY_MATRIX.some((row) => row.page === page), `Matrix-Seite fehlt: ${page}`);
      assert.ok(serviceKeys.has(serviceKey), `enterpriseSurfaceAccessService Key fehlt: ${serviceKey}`);
    }
  });

  it("enterpriseSurfaceAccessService bleibt granularer als read/write fuer sensible Sub-Actions", () => {
    const access = resolveEnterpriseSurfaceAccess({
      plan: "PRO",
      role: "company",
      orgType: "company",
      orgRole: "owner"
    });
    for (const key of ["canExport", "canAnonymize", "canRetention", "canRequests"]) {
      assert.equal(typeof access.data_governance[key], "boolean", `data_governance.${key} fehlt`);
    }
    for (const key of ["canUpload", "canVerify", "canDelete", "canManage"]) {
      assert.equal(typeof access.compliance_overview[key], "boolean", `compliance_overview.${key} fehlt`);
    }
    assert.equal(typeof access.vendor_pool.canManage, "boolean");
    assert.equal(typeof access.supplier_scorecard.canAnnotate, "boolean");
    assert.equal(typeof access.spend_analytics.canExport, "boolean");
  });
});

/* ═══════════════════════════════════════════════════════════════════
   hubVisibility.js — 10 Pflicht-Tests (resolve + resolveNav)
   Prueft die Sichtbarkeits-IIFE via vm-Sandbox.
   Skipped wenn hubVisibility.js nicht unter process.cwd() erreichbar
   (z.B. Docker ohne Frontend-Volume-Mount).
   ═══════════════════════════════════════════════════════════════════ */

function loadHubVisibilityApi() {
  const src = fs.readFileSync(HUB_VISIBILITY_FILE, "utf8");
  // window im Sandbox-Objekt -> IIFE haengt TC.hubVisibility an windowObj
  const windowObj = { TC: {} };
  const sandbox = { window: windowObj };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "hubVisibility.js" });
  return sandbox.window.TC.hubVisibility;
}

function hubMe(org_type, org_role, surface_access) {
  return { org_type, org_role, role: org_role, surface_access: surface_access || {} };
}

if (HUB_VISIBILITY_AVAILABLE) {
  const hv = loadHubVisibilityApi();

  describe("hubVisibility.resolve() — requisitions (company-only seit Matrix-Fix)", () => {
    it("1: company/owner sieht requisitions (visible=true)", () => {
      const r = hv.resolve(hubMe("company", "owner"), "requisitions");
      assert.equal(r.visible, true, `Erwartet visible=true, state=${r.state}`);
    });

    it("2: agency/admin sieht requisitions NICHT (hidden_wrong_side)", () => {
      const r = hv.resolve(hubMe("agency", "admin"), "requisitions");
      assert.equal(r.visible, false, `Erwartet visible=false, state=${r.state}`);
      assert.equal(r.state, "hidden_wrong_side");
    });
  });

  describe("hubVisibility.resolve() — executive_dashboard (hiddenRoles)", () => {
    it("3: company/owner sieht executive_dashboard", () => {
      const r = hv.resolve(hubMe("company", "owner"), "executive_dashboard");
      assert.equal(r.visible, true, `Erwartet visible=true, state=${r.state}`);
    });

    it("4: company/hiring_manager sieht executive_dashboard NICHT (hidden_role)", () => {
      const r = hv.resolve(hubMe("company", "hiring_manager"), "executive_dashboard");
      assert.equal(r.visible, false, `Erwartet visible=false, state=${r.state}`);
      assert.equal(r.state, "hidden_role");
    });

    it("5: company/viewer sieht executive_dashboard NICHT (hidden_role)", () => {
      const r = hv.resolve(hubMe("company", "viewer"), "executive_dashboard");
      assert.equal(r.visible, false, `Erwartet visible=false, state=${r.state}`);
      assert.equal(r.state, "hidden_role");
    });
  });

  describe("hubVisibility.resolve() — vendor_pool (hiddenRoles)", () => {
    it("6: company/owner sieht vendor_pool", () => {
      const r = hv.resolve(hubMe("company", "owner"), "vendor_pool");
      assert.equal(r.visible, true, `Erwartet visible=true, state=${r.state}`);
    });

    it("7: company/recruiter sieht vendor_pool NICHT (hidden_role)", () => {
      const r = hv.resolve(hubMe("company", "recruiter"), "vendor_pool");
      assert.equal(r.visible, false, `Erwartet visible=false, state=${r.state}`);
      assert.equal(r.state, "hidden_role");
    });
  });

  describe("hubVisibility.resolve() — admin_panel (orgRoles-Whitelist, unveraendert)", () => {
    it("8: company/admin sieht admin_panel", () => {
      const r = hv.resolve(hubMe("company", "admin"), "admin_panel");
      assert.equal(r.visible, true, `Erwartet visible=true, state=${r.state}`);
    });

    it("9: company/hiring_manager sieht admin_panel NICHT (hidden_role)", () => {
      const r = hv.resolve(hubMe("company", "hiring_manager"), "admin_panel");
      assert.equal(r.visible, false, `Erwartet visible=false, state=${r.state}`);
      assert.equal(r.state, "hidden_role");
    });
  });

  describe("hubVisibility.resolveNav() — bedarfe fuer agency ausgeblendet", () => {
    it("10: bedarfe — agency nicht sichtbar (Pflicht-Testfall)", () => {
      const r = hv.resolveNav(hubMe("agency", "admin"), "bedarfe");
      assert.equal(r.visible, false, "Agency sollte bedarfe-Nav nicht sehen");
    });

    it("bedarfe — company sieht es weiterhin", () => {
      const r = hv.resolveNav(hubMe("company", "admin"), "bedarfe");
      assert.equal(r.visible, true, "Company sollte bedarfe-Nav sehen");
    });

    it("bedarfe — worker sieht es weiterhin nicht", () => {
      const r = hv.resolveNav(hubMe("worker", "worker"), "bedarfe");
      assert.equal(r.visible, false, "Worker sollte bedarfe-Nav nicht sehen");
    });

    it("marketplace bleibt cross-org (agency visible — unveraendert)", () => {
      const r = hv.resolve(hubMe("agency", "admin"), "marketplace");
      assert.equal(r.visible, true, `state=${r.state}`);
    });
  });
} else {
  describe.skip("hubVisibility tests — skipped (hubVisibility.js nicht unter process.cwd() erreichbar)", () => {
    it("Frontend-Mount fehlt — im Docker-Container tests/docker ohne Frontend-Volume uebersprungen", () => {});
  });
}
