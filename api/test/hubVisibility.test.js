import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Robust path resolution: Docker api-container has cwd=/app and the volume mount
// places the file at /app/frontend/public/js/. Locally, __dirname/../.. reaches
// the project root (tempconnect_docker/).
const _DOCKER_HUB = path.join(process.cwd(), "frontend/public/js/hubVisibility.js");
const _LOCAL_HUB  = path.resolve(__dirname, "..", "..", "frontend", "public", "js", "hubVisibility.js");
const HUB_VISIBILITY_FILE = fs.existsSync(_DOCKER_HUB) ? _DOCKER_HUB : _LOCAL_HUB;
const HUB_VISIBILITY_AVAILABLE = fs.existsSync(HUB_VISIBILITY_FILE);

function readHubVisibilitySource() {
  return fs.readFileSync(HUB_VISIBILITY_FILE, "utf8");
}

function loadHubVisibility() {
  const windowObj = { TC: {} };
  const sandbox = { window: windowObj };
  vm.createContext(sandbox);
  vm.runInContext(readHubVisibilitySource(), sandbox, { filename: "frontend/public/js/hubVisibility.js" });
  return sandbox.window.TC.hubVisibility;
}

function companyOwner(extra = {}) {
  return {
    id: "u1",
    role: "company",
    org_type: "company",
    org_role: "owner",
    plan: "PRO",
    ...extra
  };
}

function agencyOwner(extra = {}) {
  return {
    id: "u2",
    role: "agency",
    org_type: "agency",
    org_role: "owner",
    plan: "PRO",
    ...extra
  };
}

function workerUser(extra = {}) {
  return {
    id: "u3",
    role: "worker",
    org_type: "worker",
    org_role: "member",
    plan: "DEMO",
    ...extra
  };
}

describe("hubVisibility.resolve - hub card visibility per role",
  { skip: !HUB_VISIBILITY_AVAILABLE ? "hubVisibility.js nicht erreichbar — Volume-Mount fehlt" : false },
  () => {
  const hv = loadHubVisibility();

  it("shows pilot-core cards for company owners", () => {
    const me = companyOwner();
    for (const key of ["marketplace", "requisitions", "deals", "assignments", "my_company", "activity", "bounties", "trust_center"]) {
      const r = hv.resolve(me, key);
      assert.equal(r.visible, true, `company owner should see ${key}`);
      assert.equal(r.state, "full");
    }
  });

  it("shows pilot-core cards for agency owners but hides buyer-only surfaces", () => {
    const me = agencyOwner();
    // requisitions ist buyer-only (company) — seit Matrix-Aktualisierung fuer Agencies hidden_wrong_side
    for (const key of ["marketplace", "deals", "assignments", "my_company", "activity", "bounties", "trust_center"]) {
      const r = hv.resolve(me, key);
      assert.equal(r.visible, true, `agency owner should see ${key}`);
    }
    for (const key of ["requisitions", "vendor_pool", "executive_dashboard"]) {
      const r = hv.resolve(me, key);
      assert.equal(r.visible, false, `agency owner should NOT see ${key} in the hub`);
      assert.equal(r.state, "hidden_wrong_side");
    }
  });

  it("hides every hub surface for workers (they use Einsatzportal)", () => {
    const me = workerUser();
    const keys = hv.listSurfaces();
    for (const key of keys) {
      const r = hv.resolve(me, key);
      assert.equal(r.visible, false, `worker should NOT see hub card ${key}`);
      assert.equal(r.state, "hidden_worker");
    }
  });

  it("hides the admin card for non-admin roles and shows it for owner", () => {
    const nonAdmin = companyOwner({ org_role: "program_manager" });
    const admin = companyOwner({ org_role: "owner" });
    const platformAdmin = companyOwner({ org_role: "platform_admin" });

    assert.equal(hv.resolve(nonAdmin, "admin_panel").visible, false);
    assert.equal(hv.resolve(nonAdmin, "admin_panel").state, "hidden_role");
    assert.equal(hv.resolve(admin, "admin_panel").visible, true);
    assert.equal(hv.resolve(platformAdmin, "admin_panel").visible, true);
  });

  it("respects surface_access org_locked for vendor_pool (buyer-only)", () => {
    const me = companyOwner({
      surface_access: {
        vendor_pool: { mode: "org_locked", state: "soft_locked", canRead: false, canWrite: false, reason: "Buyer only" }
      }
    });
    const r = hv.resolve(me, "vendor_pool");
    assert.equal(r.visible, false);
    assert.equal(r.state, "hidden_org_locked");
  });

  it("marks read_only surfaces as visible but read-only", () => {
    const me = companyOwner({
      org_role: "finance",
      surface_access: {
        vendor_pool: { mode: "read_only", state: "read_only", canRead: true, canWrite: false, reason: "Finance ist lesend" }
      }
    });
    const r = hv.resolve(me, "vendor_pool");
    assert.equal(r.visible, true);
    assert.equal(r.state, "read_only");
  });

  it("returns visible:false with hidden_anonymous for no user", () => {
    const r = hv.resolve(null, "marketplace");
    assert.equal(r.visible, false);
    assert.equal(r.state, "hidden_anonymous");
  });
});

describe("hubVisibility.resolveNav - topbar nav visibility",
  { skip: !HUB_VISIBILITY_AVAILABLE ? "hubVisibility.js nicht erreichbar — Volume-Mount fehlt" : false },
  () => {
  const hv = loadHubVisibility();

  it("hides all enterprise nav entries for workers except help", () => {
    const me = workerUser();
    for (const key of ["uebersicht", "marktplatz", "bedarfe", "deals_einsaetze", "steuerung"]) {
      const r = hv.resolveNav(me, key);
      assert.equal(r.visible, false, `worker nav ${key} should be hidden`);
    }
    assert.equal(hv.resolveNav(me, "help").visible, true);
  });

  it("keeps pilot-core nav entries visible for companies and agencies", () => {
    // bedarfe ist seit Matrix-Aktualisierung nur fuer company sichtbar (nicht agency)
    const companyKeys = ["uebersicht", "marktplatz", "bedarfe", "deals_einsaetze", "help"];
    const agencyKeys  = ["uebersicht", "marktplatz", "deals_einsaetze", "help"];
    for (const key of companyKeys) {
      assert.equal(hv.resolveNav(companyOwner(), key).visible, true, `company should see nav ${key}`);
    }
    for (const key of agencyKeys) {
      assert.equal(hv.resolveNav(agencyOwner(), key).visible, true, `agency should see nav ${key}`);
    }
    // Agency sieht bedarfe NICHT
    assert.equal(hv.resolveNav(agencyOwner(), "bedarfe").visible, false, "agency must NOT see bedarfe nav");
  });

  it("hides the Steuerung nav for agencies (buyer-only) but keeps it for companies", () => {
    assert.equal(hv.resolveNav(companyOwner(), "steuerung").visible, true);
    assert.equal(hv.resolveNav(agencyOwner(), "steuerung").visible, false);
  });

  it("hides the Steuerung nav when surface_access.executive_dashboard is org/role/plan locked", () => {
    const locked = companyOwner({
      surface_access: {
        executive_dashboard: { mode: "role_locked", state: "soft_locked", canRead: false, canWrite: false, reason: "No executive role" }
      }
    });
    assert.equal(hv.resolveNav(locked, "steuerung").visible, false);
  });

  it("leaves the Steuerung nav visible when executive_dashboard is full or read-only", () => {
    const full = companyOwner({
      surface_access: {
        executive_dashboard: { mode: "full", state: "full", canRead: true, canWrite: true, reason: "" }
      }
    });
    const readOnly = companyOwner({
      surface_access: {
        executive_dashboard: { mode: "read_only", state: "read_only", canRead: true, canWrite: false, reason: "" }
      }
    });
    assert.equal(hv.resolveNav(full, "steuerung").visible, true);
    assert.equal(hv.resolveNav(readOnly, "steuerung").visible, true);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   Neue Tests: orgWideOnly + Location-Scope (executive_dashboard)
   ═══════════════════════════════════════════════════════════════════ */

describe("hubVisibility.resolve — orgWideOnly + location scope",
  { skip: !HUB_VISIBILITY_AVAILABLE ? "hubVisibility.js nicht erreichbar — Volume-Mount fehlt" : false },
  () => {
  const hv = loadHubVisibility();

  it("company/owner OHNE active_location_id sieht executive_dashboard (full)", () => {
    const me = companyOwner(); // kein active_location_id
    const r = hv.resolve(me, "executive_dashboard");
    assert.equal(r.visible, true, `state=${r.state}`);
    assert.equal(r.state, "full");
  });

  it("company/owner MIT active_location_id sieht executive_dashboard NICHT (hidden_location_scope)", () => {
    const me = companyOwner({ active_location_id: "loc-123" });
    const r = hv.resolve(me, "executive_dashboard");
    assert.equal(r.visible, false, `state=${r.state}`);
    assert.equal(r.state, "hidden_location_scope");
  });

  it("location-scope greift nur bei orgWideOnly-Surfaces, nicht bei allen", () => {
    const me = companyOwner({ active_location_id: "loc-123" });
    // marketplace ist NICHT orgWideOnly — standortgebundener Nutzer sieht es trotzdem
    const r = hv.resolve(me, "marketplace");
    assert.equal(r.visible, true, "marketplace darf nicht durch location-scope geblockt werden");
  });

  it("hidden_location_scope hat Vorrang vor hiddenRoles-Pruefung (da orgWideOnly frueher geprueft wird)", () => {
    // finance ist NICHT in hiddenRoles von executive_dashboard — normalerweise sichtbar.
    // ABER: wenn active_location_id gesetzt ist, kommt hidden_location_scope zuerst.
    const me = companyOwner({ org_role: "finance", active_location_id: "loc-x" });
    const r = hv.resolve(me, "executive_dashboard");
    assert.equal(r.visible, false);
    assert.equal(r.state, "hidden_location_scope");
  });
});

/* ═══════════════════════════════════════════════════════════════════
   Neue Tests: granulare Rollen-Sichtbarkeit (Pflicht-Matrix)
   ═══════════════════════════════════════════════════════════════════ */

describe("hubVisibility.resolve — granulare Rollen-Sichtbarkeitsmatrix",
  { skip: !HUB_VISIBILITY_AVAILABLE ? "hubVisibility.js nicht erreichbar — Volume-Mount fehlt" : false },
  () => {
  const hv = loadHubVisibility();

  it("agency/dispatcher sieht marketplace + deals + assignments, aber NICHT requisitions", () => {
    const me = { org_type: "agency", org_role: "dispatcher", role: "agency", surface_access: {} };
    assert.equal(hv.resolve(me, "marketplace").visible,  true,  "agency dispatcher: marketplace ok");
    assert.equal(hv.resolve(me, "deals").visible,        true,  "agency dispatcher: deals ok");
    assert.equal(hv.resolve(me, "assignments").visible,  true,  "agency dispatcher: assignments ok");
    const req = hv.resolve(me, "requisitions");
    assert.equal(req.visible, false, "agency dispatcher: requisitions hidden");
    assert.equal(req.state, "hidden_wrong_side");
  });

  it("agency/dispatcher sieht vendor_pool + executive_dashboard NICHT (hidden_wrong_side)", () => {
    const me = { org_type: "agency", org_role: "dispatcher", role: "agency", surface_access: {} };
    assert.equal(hv.resolve(me, "vendor_pool").visible,         false);
    assert.equal(hv.resolve(me, "executive_dashboard").visible, false);
  });

  it("company/finance sieht vendor_pool (finance ist nicht in hiddenRoles)", () => {
    // Gemaess Matrix: vendor_pool ✓ fuer finance
    const me = companyOwner({ org_role: "finance" });
    const r = hv.resolve(me, "vendor_pool");
    assert.equal(r.visible, true, `finance sollte vendor_pool sehen, state=${r.state}`);
  });

  it("company/hiring_manager sieht vendor_pool NICHT (in hiddenRoles)", () => {
    const me = companyOwner({ org_role: "hiring_manager" });
    const r = hv.resolve(me, "vendor_pool");
    assert.equal(r.visible, false);
    assert.equal(r.state, "hidden_role");
  });

  it("company/program_manager sieht executive_dashboard (nicht in hiddenRoles)", () => {
    const me = companyOwner({ org_role: "program_manager" });
    const r = hv.resolve(me, "executive_dashboard");
    assert.equal(r.visible, true, `program_manager sollte executive_dashboard sehen, state=${r.state}`);
  });

  it("company/supplier_manager sieht executive_dashboard NICHT (in hiddenRoles)", () => {
    const me = companyOwner({ org_role: "supplier_manager" });
    const r = hv.resolve(me, "executive_dashboard");
    assert.equal(r.visible, false);
    assert.equal(r.state, "hidden_role");
  });

  it("plan_locked surface_access → hidden_plan_locked (Feature-Lock zeigt klaren Zustand)", () => {
    const me = companyOwner({
      surface_access: {
        executive_dashboard: { mode: "plan_locked", state: "locked", canRead: false, canWrite: false, reason: "INDIVIDUELL-Plan erforderlich" }
      }
    });
    const r = hv.resolve(me, "executive_dashboard");
    assert.equal(r.visible, false);
    assert.equal(r.state, "hidden_plan_locked");
  });
});

/* ═══════════════════════════════════════════════════════════════════
   Neue Tests: bedarfe NAV-Sichtbarkeit (agency ausgeblendet)
   ═══════════════════════════════════════════════════════════════════ */

describe("hubVisibility.resolveNav — bedarfe fuer agency ausgeblendet (aktualisierte Matrix)",
  { skip: !HUB_VISIBILITY_AVAILABLE ? "hubVisibility.js nicht erreichbar — Volume-Mount fehlt" : false },
  () => {
  const hv = loadHubVisibility();

  it("bedarfe ist fuer agency NICHT sichtbar", () => {
    const r = hv.resolveNav(agencyOwner(), "bedarfe");
    assert.equal(r.visible, false, "Agency sollte bedarfe-Nav nicht sehen");
  });

  it("bedarfe ist fuer company sichtbar", () => {
    const r = hv.resolveNav(companyOwner(), "bedarfe");
    assert.equal(r.visible, true, "Company sollte bedarfe-Nav sehen");
  });

  it("bedarfe ist fuer worker NICHT sichtbar", () => {
    const r = hv.resolveNav(workerUser(), "bedarfe");
    assert.equal(r.visible, false, "Worker sollte bedarfe-Nav nicht sehen");
  });

  it("marktplatz bleibt fuer agency sichtbar (cross-org)", () => {
    assert.equal(hv.resolveNav(agencyOwner(), "marktplatz").visible, true);
  });

  it("deals_einsaetze ist fuer agency sichtbar", () => {
    assert.equal(hv.resolveNav(agencyOwner(), "deals_einsaetze").visible, true);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   P2-D: Vollständige hidden_worker-Suite — Worker-Portal Abgrenzung
   Worker sehen AUSSCHLIESSLICH das Einsatzportal.
   Keine Hub-Surface, kein Enterprise-Nav, keine Rolle kann diese
   Sperre umgehen.
   ═══════════════════════════════════════════════════════════════════ */

describe("Worker-Portal Abgrenzung — vollständige hidden_worker-Suite",
  { skip: !HUB_VISIBILITY_AVAILABLE ? "hubVisibility.js nicht erreichbar — Volume-Mount fehlt" : false },
  () => {
  const hv = loadHubVisibility();

  // ── Hub Surfaces: alle dynamisch aus listSurfaces() ─────────────────────────

  it("alle Hub-Surfaces liefern hidden_worker fuer standard-Worker (dynamisch via listSurfaces)", () => {
    const me = workerUser();
    const surfaces = hv.listSurfaces();
    assert.ok(surfaces.length > 0, "listSurfaces() muss mindestens eine Surface zurueckgeben");
    for (const key of surfaces) {
      const r = hv.resolve(me, key);
      assert.equal(r.visible, false,    `[Surface ${key}] visible muss false sein`);
      assert.equal(r.state, "hidden_worker", `[Surface ${key}] state muss hidden_worker sein`);
    }
  });

  it("hidden_worker gilt fuer Worker mit org_role=owner (Rolle kann Sperre nicht aufheben)", () => {
    const me = workerUser({ org_role: "owner" });
    for (const key of hv.listSurfaces()) {
      const r = hv.resolve(me, key);
      assert.equal(r.state, "hidden_worker", `org_role=owner darf hidden_worker nicht aufheben (Surface: ${key})`);
    }
  });

  it("hidden_worker gilt auch wenn surface_access-Overrides gesetzt sind", () => {
    // surface_access-Eintraege koennen fuer Worker KEINEN Zugriff erteilen
    const me = workerUser({
      surface_access: {
        marketplace:         { mode: "full",      canRead: true,  canWrite: true  },
        executive_dashboard: { mode: "full",      canRead: true,  canWrite: true  },
        admin_panel:         { mode: "read_only", canRead: true,  canWrite: false },
        vendor_pool:         { mode: "full",      canRead: true,  canWrite: true  },
      }
    });
    for (const key of hv.listSurfaces()) {
      const r = hv.resolve(me, key);
      assert.equal(r.state, "hidden_worker",
        `surface_access override darf hidden_worker nicht aufheben (Surface: ${key})`);
    }
  });

  it("hidden_worker gilt fuer Legacy-Format (role=worker, kein org_type)", () => {
    const me = { id: "u-legacy", role: "worker", org_role: "member", plan: "DEMO" };
    // kein org_type gesetzt — normalizeOrgType() faellt auf legacy role=worker zurueck
    for (const key of hv.listSurfaces()) {
      const r = hv.resolve(me, key);
      assert.equal(r.state, "hidden_worker",
        `Legacy-Worker (role=worker, kein org_type) muss hidden_worker bekommen (Surface: ${key})`);
    }
  });

  it("hidden_worker gilt auch mit active_location_id (Standortkontext aendert nichts)", () => {
    const me = workerUser({ active_location_id: "loc-xyz" });
    for (const key of hv.listSurfaces()) {
      const r = hv.resolve(me, key);
      assert.equal(r.state, "hidden_worker",
        `active_location_id darf hidden_worker nicht aufheben (Surface: ${key})`);
    }
  });

  // ── Enterprise Nav: alle Eintraege ausser help dynamisch via _navRules ───────

  it("alle Enterprise-Nav-Eintraege (aus _navRules) sind fuer Worker ausgeblendet — help als einzige Ausnahme", () => {
    const me = workerUser();
    const navKeys = Object.keys(hv._navRules);
    assert.ok(navKeys.length > 0, "_navRules muss mindestens einen Eintrag haben");

    const hidden  = [];
    const visible = [];
    for (const key of navKeys) {
      const r = hv.resolveNav(me, key);
      if (r.visible) visible.push(key);
      else           hidden.push(key);
    }

    // 'help' ist die einzige erlaubte Ausnahme
    assert.ok(hidden.length > 0, "Mindestens ein Nav-Eintrag muss fuer Worker verborgen sein");
    for (const key of visible) {
      assert.equal(key, "help",
        `Nav-Eintrag '${key}' ist fuer Worker sichtbar — nur 'help' ist erlaubt`);
    }
  });

  it("help-Nav ist fuer Worker immer sichtbar (Hilfezugang darf nicht gesperrt werden)", () => {
    assert.equal(hv.resolveNav(workerUser(), "help").visible, true);
  });

  // ── Kombinierter Schnelltest ─────────────────────────────────────────────────

  it("Worker-Boundary-Schnelltest: marketplace + executive_dashboard + admin_panel = hidden_worker", () => {
    const me = workerUser();
    for (const key of ["marketplace", "executive_dashboard", "admin_panel"]) {
      assert.equal(hv.resolve(me, key).state, "hidden_worker",
        `${key} muss hidden_worker sein`);
    }
  });
});
