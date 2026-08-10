/**
 * TempConnect Visibility Matrix — Single Source of Truth
 *
 * Beschreibt fuer jede Seite / jeden Bereich:
 *  - Welche gating_strategy greift (plan, role, pilot, staff, always_open, ...)
 *  - Welche org_types und user_roles Zugriff haben
 *  - Ob ein Feature-Key aus planFeatures.js erforderlich ist
 *  - Ob ein Backend-Guard vorhanden ist (has_backend_guard)
 *  - Welche Hub-Surfaces (hubVisibility.js) korrespondieren (fuer Drift-Erkennung)
 *
 * Kanonische Plaene:  DEMO | BASIS | PLUS | PRO | INDIVIDUELL
 * Gating-Strategien: @see GATING_STRATEGIES
 *
 * Pflicht-Invarianten (geprueft durch visibilityAuditService.buildAuditReport()):
 *  - gating_strategy in GATING_STRATEGIES
 *  - feature_key, wenn gesetzt, in planFeatures.js
 *  - allowed_org_types Teilmenge von company/agency
 *  - surfaces Teilmenge von hubVisibility.HUB_SURFACES (Drift-Test)
 */

// Erlaubte Gating-Strategien

export const GATING_STRATEGIES = [
  "always_open",       // kein Gate - alle angemeldeten Nutzer
  "role_gated",        // nur bestimmte org_roles (via orgRoles-Whitelist)
  "plan_gated",        // bestimmter Plan oder hoeher (via feature_key)
  "plan_and_role",     // Plan UND Rolle erforderlich
  "pilot_only",        // nur aktive Pilotkunden
  "individuell_only",  // INDIVIDUELL-Plan erforderlich
  "staff_gated",       // nur TempConnect-Staff (erfordert Staff-Auth)
  "org_type_gated"     // eingeschraenkt auf einen Org-Type
];

export const VISIBILITY_MATRIX = [
  // Enterprise Hub (multi-Surface-Host)
  {
    page: "enterprise.html",
    gating_strategy: "always_open",
    surfaces: [
      "marketplace", "requisitions", "deals", "assignments",
      "my_company", "activity", "bounties", "trust_center"
    ],
    allowed_roles: ["company", "agency"],
    allowed_user_roles: [],
    allowed_org_types: ["company", "agency"],
    requires_pilot: false,
    requires_individuell: false,
    has_backend_guard: true,
    has_upgrade_cta: false,
    requires_staff_approval: false
  },
  // Capacity Exchange Feed
  {
    page: "capacity_exchange_feed.html",
    gating_strategy: "plan_gated",
    surfaces: ["marketplace"],
    feature_key: "capacity_exchange_basic",
    allowed_roles: ["company", "agency"],
    allowed_user_roles: [],
    allowed_org_types: ["company", "agency"],
    requires_pilot: false,
    requires_individuell: false,
    has_backend_guard: true,
    has_upgrade_cta: true,
    requires_staff_approval: false
  },
  // Vendor Pool
  {
    page: "vendor_pool.html",
    gating_strategy: "plan_and_role",
    surfaces: ["vendor_pool"],
    feature_key: "supplier_management",
    allowed_roles: ["company"],
    allowed_user_roles: ["owner", "admin", "program_manager", "supplier_manager", "finance"],
    allowed_org_types: ["company"],
    requires_pilot: false,
    requires_individuell: true,
    has_backend_guard: true,
    has_upgrade_cta: true,
    requires_staff_approval: false
  },
  // Requisitions
  {
    page: "requisitions.html",
    gating_strategy: "plan_gated",
    surfaces: ["requisitions"],
    feature_key: "persistent_requisitions",
    allowed_roles: ["company"],
    allowed_user_roles: [],
    allowed_org_types: ["company"],
    requires_pilot: false,
    requires_individuell: false,
    has_backend_guard: true,
    has_upgrade_cta: true,
    requires_staff_approval: false
  },
  // SLA Abo
  {
    page: "sla_abo.html",
    gating_strategy: "plan_gated",
    surfaces: [],
    feature_key: "sla_access",
    allowed_roles: ["company", "agency"],
    allowed_user_roles: [],
    allowed_org_types: ["company", "agency"],
    requires_pilot: false,
    requires_individuell: false,
    has_backend_guard: true,
    has_upgrade_cta: true,
    requires_staff_approval: false
  },
  // Staff
  {
    page: "staff/staff.html",   // Vite-Einstieg laut nginx (nicht index.html)
    gating_strategy: "staff_gated",
    surfaces: [],
    allowed_roles: ["company"],
    allowed_user_roles: [],
    allowed_org_types: ["company"],
    requires_pilot: false,
    requires_individuell: false,
    has_backend_guard: true,
    has_upgrade_cta: false,
    requires_staff_approval: true
  },
  // Admin Panel
  {
    page: "admin_panel.html",
    gating_strategy: "role_gated",
    surfaces: ["admin_panel"],
    allowed_roles: ["company", "agency"],
    allowed_user_roles: ["owner", "admin"],
    allowed_org_types: ["company", "agency"],
    requires_pilot: false,
    requires_individuell: false,
    has_backend_guard: true,
    has_upgrade_cta: false,
    requires_staff_approval: false
  },
  // Organisation
  {
    page: "organization.html",
    gating_strategy: "always_open",
    surfaces: ["my_company"],
    allowed_roles: ["company", "agency"],
    allowed_user_roles: [],
    allowed_org_types: ["company", "agency"],
    requires_pilot: false,
    requires_individuell: false,
    has_backend_guard: true,
    has_upgrade_cta: false,
    requires_staff_approval: false
  },
  // Integrationen
  {
    page: "integrations.html",
    gating_strategy: "plan_and_role",
    surfaces: [],
    feature_key: "integrations",
    allowed_roles: ["company"],
    allowed_user_roles: ["owner", "admin"],
    allowed_org_types: ["company"],
    requires_pilot: true,
    requires_individuell: false,
    has_backend_guard: true,
    has_upgrade_cta: true,
    requires_staff_approval: false
  },
  // Supplier Scorecard
  {
    page: "supplier_scorecard.html",
    gating_strategy: "plan_and_role",
    surfaces: [],
    feature_key: "supplier_ratings",
    allowed_roles: ["company"],
    allowed_user_roles: ["owner", "admin", "program_manager", "supplier_manager"],
    allowed_org_types: ["company"],
    requires_pilot: false,
    requires_individuell: false,
    has_backend_guard: true,
    has_upgrade_cta: true,
    requires_staff_approval: false
  },
  // Rate Cards
  {
    page: "rate-cards.html",
    gating_strategy: "plan_and_role",
    surfaces: [],
    feature_key: "rate_card_management",
    allowed_roles: ["company"],
    allowed_user_roles: ["owner", "admin", "finance"],
    allowed_org_types: ["company"],
    requires_pilot: false,
    requires_individuell: false,
    has_backend_guard: true,
    has_upgrade_cta: true,
    requires_staff_approval: false
  },
  // Spend Analytics
  {
    page: "spend-analytics.html",
    gating_strategy: "plan_gated",
    surfaces: [],
    feature_key: "spend_analytics",
    allowed_roles: ["company"],
    allowed_user_roles: [],
    allowed_org_types: ["company"],
    requires_pilot: false,
    requires_individuell: false,
    has_backend_guard: true,
    has_upgrade_cta: true,
    requires_staff_approval: false
  },
  // Executive Dashboard
  {
    page: "executive_dashboard.html",
    gating_strategy: "plan_and_role",
    surfaces: ["executive_dashboard"],
    feature_key: "enterprise_analytics",
    allowed_roles: ["company"],
    allowed_user_roles: ["owner", "admin", "program_manager", "finance"],
    allowed_org_types: ["company"],
    requires_pilot: false,
    requires_individuell: true,
    has_backend_guard: true,
    has_upgrade_cta: true,
    requires_staff_approval: false
  },
  // Deals (P9/C3: hiess frueher deals.html — die Datei gibt es nicht mehr, die
  // Flaeche lebt unter deal_management.html und ist dort ueber slaGuard.js
  // wirklich gesperrt. Der alte Eintrag verwies ins Leere.)
  {
    page: "deal_management.html",
    gating_strategy: "plan_gated",
    surfaces: ["deals"],
    feature_key: "deal_workflow",
    allowed_roles: ["company", "agency"],
    allowed_user_roles: [],
    allowed_org_types: ["company", "agency"],
    requires_pilot: false,
    requires_individuell: false,
    has_backend_guard: true,
    has_upgrade_cta: true,
    requires_staff_approval: false
  }
];

/*
 * P9/C3 — ENTFERNT, weil die Seiten nicht existieren:
 *
 *   reports.html       trug gar keine Flaeche (surfaces: []) und nur den
 *                      Schluessel `basic_analytics`. Den fuehren heute
 *                      executive_dashboard.html und organization.html, die
 *                      eigene Eintraege haben.
 *   assignments.html   Die Hub-Karte `assignments` zeigt auf
 *                      worker-submissions-review.html. Diese Seite ist NICHT
 *                      plan-gesperrt (kein slaGuard) — den Eintrag auf sie
 *                      umzubiegen haette eine Sperre behauptet, die es nicht gibt.
 *
 * Beide Eintraege standen jahrelang in der "einzigen Wahrheit", ohne dass es
 * auffiel: der Schema-Test prueft Felder, nicht Existenz. Genau diese Luecke
 * schliesst jetzt `visibilityMatrix.test.js` — jede genannte Seite muss es geben.
 */

/**
 * Gibt alle eindeutigen Hub-Surface-Keys zurueck, die in der Matrix referenziert werden.
 * @returns {string[]}
 */
export function listMatrixSurfaces() {
  const seen = new Set();
  const result = [];
  for (const row of VISIBILITY_MATRIX) {
    const surfs = Array.isArray(row.surfaces) ? row.surfaces : [];
    for (const s of surfs) {
      if (s && !seen.has(s)) {
        seen.add(s);
        result.push(s);
      }
    }
  }
  return result;
}

/**
 * Gibt alle eindeutigen Feature-Keys zurueck, die in der Matrix referenziert werden.
 * @returns {string[]}
 */
export function listMatrixFeatureKeys() {
  const seen = new Set();
  const result = [];
  for (const row of VISIBILITY_MATRIX) {
    if (row.feature_key && !seen.has(row.feature_key)) {
      seen.add(row.feature_key);
      result.push(row.feature_key);
    }
  }
  return result;
}
