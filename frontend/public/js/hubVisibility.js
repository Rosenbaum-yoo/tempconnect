/**
 * hubVisibility.js - Zentrale Sichtbarkeitssteuerung fuer Enterprise-Hub und Topbar.
 *
 * Einheitliche Rollen-/Org-Type-/Surface-Access-Wahrheit fuer:
 *  - Hub-Cards auf `/public/enterprise.html` (via data-surface="...")
 *  - Topbar-Nav-Links in pageShell.js
 *
 * Zustaende pro Bereich:
 *   full        - voll nutzbar, Card sichtbar
 *   read_only   - sichtbar, aber lesend (nutzt surface_access read_only)
 *   hidden_*    - Card wird ausgeblendet (triggert keine Folge-Requests)
 *
 * Location-Awareness (seit Multi-Location-Paket):
 *   resolveLocationScope() — gibt den aktiven Standortkontext zurueck.
 *   Seiten koennen damit z.B. Filterbadges oder Scope-Chips rendern.
 *
 * Namespace: TC.hubVisibility
 */
(function (global) {
  "use strict";

  /**
   * HUB_SURFACES
   * Jeder Eintrag definiert, fuer welche org_types und optional welche org_roles
   * der Bereich im Hub ueberhaupt gedacht ist. Optional wird auf die bereits
   * vorhandene Surface-Access-Matrix (me.surface_access) gemappt.
   */
  var HUB_SURFACES = {
    marketplace:          { orgTypes: ["company", "agency"] },
    requisitions:         { orgTypes: ["company", "agency"] },
    deals:                { orgTypes: ["company", "agency"] },
    assignments:          { orgTypes: ["company", "agency"] },
    my_company:           { orgTypes: ["company", "agency"] },
    activity:             { orgTypes: ["company", "agency"] },
    bounties:             { orgTypes: ["company", "agency"] },
    trust_center:         { orgTypes: ["company", "agency"] },
    vendor_pool:          { orgTypes: ["company"], surfaceKey: "vendor_pool" },
    executive_dashboard:  { orgTypes: ["company"], surfaceKey: "executive_dashboard" },
    admin_panel: {
      orgTypes: ["company", "agency"],
      orgRoles: ["platform_admin", "owner", "admin"],
      legacyRoles: ["platform_admin", "admin"]
    },
    // Multi-Location: Standorte-Tab / Standortverwaltung. Sichtbar, wenn die
    // Org die org_settings-Flaeche hat (Teil des multitenant Add-on-Bundles,
    // welches multi_location einschließt). Wird ausgeblendet, wenn plan_locked.
    location_management: {
      orgTypes: ["company", "agency"],
      orgRoles: ["platform_admin", "owner", "admin"],
      legacyRoles: ["platform_admin", "admin"],
      surfaceKey: "org_settings"
    }
  };

  /**
   * NAV_RULES
   * Sichtbarkeit der Topbar-Links. Worker haben eigene Einstiege im
   * Einsatzportal und sehen keine Enterprise-Navigation. Die Steuerungs-
   * Sammel-Nav bleibt fuer Buyer sichtbar; Agenturen werden nicht auf
   * die buyer-seitigen Steuerungsziele gefuehrt.
   */
  var NAV_RULES = {
    uebersicht:        { hideForOrgTypes: ["worker"] },
    marktplatz:        { hideForOrgTypes: ["worker"] },
    bedarfe:           { hideForOrgTypes: ["worker"] },
    deals_einsaetze:   { hideForOrgTypes: ["worker"] },
    steuerung:         { hideForOrgTypes: ["worker"], hideSurfaceKey: "executive_dashboard" },
    help:              {}
  };

  function normalizeOrgType(me) {
    if (!me) return "";
    var orgType = String(me.org_type || "").trim().toLowerCase();
    if (orgType) return orgType;
    var legacy = String(me.role || "").trim().toLowerCase();
    if (legacy === "company" || legacy === "agency" || legacy === "worker") return legacy;
    return "";
  }

  function normalizeOrgRole(me) {
    return String(me && me.org_role || "").trim();
  }

  function normalizeLegacyRole(me) {
    return String(me && me.role || "").trim();
  }

  function getSurfaceAccess(me, surfaceKey) {
    if (!me || !surfaceKey) return null;
    var surfaceMap = me.surface_access;
    if (!surfaceMap || typeof surfaceMap !== "object") return null;
    var entry = surfaceMap[surfaceKey];
    if (!entry || typeof entry !== "object") return null;
    return entry;
  }

  function hiddenFromSurface(surface) {
    if (!surface) return false;
    var mode = String(surface.mode || surface.state || "").toLowerCase();
    // Im Hub ausblenden, wenn die Org, der Plan oder die Rolle fachlich
    // gar keinen Leseanspruch hat. Sichtbar bleiben: full, read_only.
    return mode === "org_locked" || mode === "plan_locked" || mode === "role_locked" || mode === "locked" || mode === "soft_locked";
  }

  function resolve(me, key) {
    var def = HUB_SURFACES[key];
    if (!def) {
      return { visible: true, state: "full", reason: "" };
    }
    if (!me) {
      return { visible: false, state: "hidden_anonymous", reason: "Nicht angemeldet." };
    }

    var orgType = normalizeOrgType(me);
    var orgRole = normalizeOrgRole(me);
    var legacyRole = normalizeLegacyRole(me);

    // Worker bekommen den Enterprise-Hub grundsaetzlich nicht zu sehen.
    if (orgType === "worker") {
      return { visible: false, state: "hidden_worker", reason: "Worker werden ueber das Einsatzportal gefuehrt." };
    }

    if (def.orgTypes && orgType && def.orgTypes.indexOf(orgType) === -1) {
      return { visible: false, state: "hidden_wrong_side", reason: "Bereich ist fuer diese Organisationsart nicht vorgesehen." };
    }

    if (def.orgRoles) {
      var roleAllowed = def.orgRoles.indexOf(orgRole) !== -1 ||
        (def.legacyRoles && def.legacyRoles.indexOf(legacyRole) !== -1);
      if (!roleAllowed) {
        return { visible: false, state: "hidden_role", reason: "Nur fuer freigegebene Administrationsrollen sichtbar." };
      }
    }

    if (def.surfaceKey) {
      var surface = getSurfaceAccess(me, def.surfaceKey);
      if (surface) {
        if (hiddenFromSurface(surface)) {
          var modeTag = String(surface.mode || surface.state || "hidden").toLowerCase();
          return { visible: false, state: "hidden_" + modeTag, reason: surface.reason || "" };
        }
        if (surface.canWrite === false && surface.canRead === true) {
          return { visible: true, state: "read_only", reason: surface.reason || "" };
        }
      }
    }

    return { visible: true, state: "full", reason: "" };
  }

  function resolveNav(me, navKey) {
    var rule = NAV_RULES[navKey] || {};
    if (!me) {
      // Nicht angemeldet: Topbar haengt ohnehin am Auth-Guard; Nav bleibt
      // fuer Public-Seiten sichtbar, damit der Login-Pfad erreichbar ist.
      return { visible: true };
    }
    var orgType = normalizeOrgType(me);
    if (rule.hideForOrgTypes && orgType && rule.hideForOrgTypes.indexOf(orgType) !== -1) {
      return { visible: false, reason: "Nav fuer diese Rolle nicht vorgesehen." };
    }
    if (rule.hideSurfaceKey) {
      var surface = getSurfaceAccess(me, rule.hideSurfaceKey);
      if (surface && hiddenFromSurface(surface)) {
        return { visible: false, reason: surface.reason || "" };
      }
      // Kein surface_access vorhanden: fachliche Gegenseite fallback-blenden
      if (!surface && (orgType === "agency")) {
        return { visible: false, reason: "Steuerungsnavigation ist buyer-seitig und fuer Agenturen nicht vorgesehen." };
      }
    }
    return { visible: true };
  }

  function listSurfaces() {
    return Object.keys(HUB_SURFACES);
  }

  /**
   * resolveLocationScope()
   * Gibt den aktiven Standortkontext zurueck, den TC.api aus sessionStorage
   * oder einem vorherigen API-Aufruf kennt. Seiten koennen diesen Wert
   * nutzen, um Filterbadges ("Standort: Muenchen HQ"), Scope-Chips oder
   * location-aware Query-Parameter zu rendern.
   *
   * Gibt null zurueck wenn kein Standort aktiv (= org-weite Sicht).
   *
   * @returns {{ locationId: string, locationName: string | null } | null}
   */
  function resolveLocationScope() {
    try {
      if (global && global.TC && global.TC.api && typeof global.TC.api.getActiveLocationId === "function") {
        var locId = global.TC.api.getActiveLocationId();
        if (!locId) return null;
        // locationName ist optional (nur bekannt, wenn der Switcher geladen hat)
        var locName = null;
        try {
          var cached = sessionStorage.getItem("tc.activeLocationName");
          if (cached) locName = cached;
        } catch (_err) { /* ignore */ }
        return { locationId: locId, locationName: locName };
      }
    } catch (_err) { /* ignore */ }
    return null;
  }

  var api = {
    resolve: resolve,
    resolveNav: resolveNav,
    listSurfaces: listSurfaces,
    resolveLocationScope: resolveLocationScope,
    _surfaces: HUB_SURFACES,
    _navRules: NAV_RULES
  };

  // Browser: an TC-Namespace haengen.
  if (global && typeof global === "object") {
    global.TC = global.TC || {};
    global.TC.hubVisibility = api;
  }

  // Node/CJS (Tests via vm-Sandbox lesen trotzdem die globale TC-Anbindung);
  // Exportieren als Default fuer optionale direkte ESM/CJS-Konsumenten.
  if (typeof module !== "undefined" && module && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
