/**
 * TempConnect — Single Source of Truth: Plan-Modell, Feature-Gates, Tier-Erkennung.
 *
 * Verbindliche oeffentliche Hauptplaene:
 *   DEMO, BASIS, PLUS, PRO, INDIVIDUELL
 *
 * "Enterprise" ist KEIN eigener Plan mehr — es ist ein Funktionsniveau
 * innerhalb von INDIVIDUELL bzw. des Pilotzugangs.
 *
 * Individuell-Unterklassen (nach Beschaeftigtenzahl) — KANONISCH, deckungsgleich mit
 * INDIVIDUAL_TIER_CATALOG (planCatalog.js) = die Pricing-Wahrheit auf der Preisseite:
 *   individuell_s (1-50), individuell_m (51-150),
 *   individuell_l (151-350), individuell_enterprise (351+)
 */

/* ── Plan-Konstanten ──────────────────────────────────── */

export const PLAN = {
  DEMO:         "DEMO",
  BASIS:        "BASIS",
  PLUS:         "PLUS",
  PRO:          "PRO",
  INDIVIDUELL:  "INDIVIDUELL"
};

// Backward-compat aliases (nie als oeffentliche Plannamen verwenden)
PLAN.ENTERPRISE = PLAN.INDIVIDUELL;
PLAN.INDIVIDUAL = PLAN.INDIVIDUELL;
PLAN.FREE = PLAN.DEMO;

/* ── Individuell-Tiers ────────────────────────────────── */

export const INDIVIDUAL_TIERS = {
  S:          "individuell_s",
  M:          "individuell_m",
  L:          "individuell_l",
  ENTERPRISE: "individuell_enterprise"
};

// Kanonische Schwellen — MUESSEN mit INDIVIDUAL_TIER_CATALOG (planCatalog.js,
// min/max_employees) uebereinstimmen. planCatalog re-exportiert die Funktion unten als
// getIndividualTierByEmployeeCountV2 (Single Source — kein Duplikat, keine Doppelwahrheit).
// (P2.0, Owner-bestaetigt 2026-06-13: Registrierung folgt jetzt der Pricing-Seite.)
const TIER_THRESHOLDS = [
  { max: 50,  tier: INDIVIDUAL_TIERS.S },
  { max: 150, tier: INDIVIDUAL_TIERS.M },
  { max: 350, tier: INDIVIDUAL_TIERS.L }
];

/**
 * Automatische Groessenklassen-Erkennung nach Beschaeftigtenzahl.
 * @param {number} employeeCount
 * @returns {string} individuell_s | individuell_m | individuell_l | individuell_enterprise
 */
export function getIndividualTierByEmployeeCount(employeeCount) {
  const n = Math.max(1, Math.floor(Number(employeeCount) || 0));
  for (const t of TIER_THRESHOLDS) {
    if (n <= t.max) return t.tier;
  }
  return INDIVIDUAL_TIERS.ENTERPRISE;
}

/* ── Feature-Matrix ───────────────────────────────────── */

const I = PLAN.INDIVIDUELL;

/** @type {Record<string, string[]>} featureKey -> list of plan names that have access */
export const planFeatures = {
  // Marketplace browsing (DEMO can view/browse but not create)
  legacy_access:              ["DEMO", "BASIS"],
  sla_access:                 ["DEMO", "BASIS", "PLUS", "PRO", I],
  sla_offers_create:          ["PLUS", "PRO", I],
  sla_help:                   ["PLUS", "PRO", I],
  sla_subscriptions:          ["PLUS", "PRO", I],
  sla_profile:                ["PLUS", "PRO", I],
  sla_proofs:                 ["PLUS", "PRO", I],

  // PRO features
  advanced_matching:           ["PRO", I],
  supplier_ratings:            ["PRO", I],
  deal_workflow:               ["PRO", I],
  premium_visibility:          ["PRO", I],
  basic_analytics:             ["PLUS", "PRO", I],
  persistent_requisitions:     ["PLUS", "PRO", I],
  alerts:                      ["PLUS", "PRO", I],

  // Enterprise-Niveau Features (nur Individuell-Plan)
  approval_workflows:          [I],
  departments:                 [I],
  multi_location:              [I],
  supplier_management:         [I],
  compliance:                  [I],
  contracts:                   [I],
  enterprise_analytics:        [I],
  audit_traceability:          [I],
  org_settings:                [I],
  assignments:                 [I],

  // Capacity Exchange
  capacity_exchange_basic:     ["DEMO", "BASIS", "PLUS", "PRO", I],
  capacity_exchange_matching:  ["PLUS", "PRO", I],
  capacity_exchange_priority:  ["PRO", I],
  capacity_exchange_multi:     [I],
  inter_agency_matching:       [I],

  // Operative Module
  timesheets:                  ["PLUS", "PRO", I],
  worker_module:               ["PLUS", "PRO", I],
  emergency_staffing:          ["BASIS", "PLUS", "PRO", I],  // BASIS: 1x/Monat (PLAN_LIMITS.notdienst_monthly=1) — OE-08 2026-05-27
  smart_pricing:               ["PLUS", "PRO", I],
  integrations:                 [I],   // Individuell-tier-only when enabled
  rate_card_management:        ["PRO", I],
  spend_analytics:             ["PRO", I],
  data_governance:             ["PRO", I],

  // Marketplace Visibility Center (Phase 4 Track A — M-01 2026-05-30)
  // public_profile_basic: Öffentliches Basisprofil aktivierbar (OPT-IN)
  public_profile_basic:                ["PLUS", "PRO", I],
  // public_profile_visibility: Sichtbarkeit zur Staff-Freigabe einreichen
  public_profile_visibility:           ["PRO", I],
  // profile_analytics_basic: Profilaufrufe / Kontaktklicks (7/30 Tage)
  profile_analytics_basic:             ["PRO", I],
  // profile_analytics_advanced: Sections-Breakdown, Conversion-Funnel, 90-Tage
  profile_analytics_advanced:          [I],
  // marketplace_ranking_participation: Teilnahme am kuratierten Ranking
  marketplace_ranking_participation:   ["PRO", I],
  // marketplace_featured_profile: Featured-Badge + Boost (Staff-freigegeben, coming soon)
  marketplace_featured_profile:        [I],   // MATURITY_GATE: false — noch nicht live
  // verified_deal_reviews: Verifizierte Bewertungen nach FINALIZED-Deal anzeigen/empfangen
  verified_deal_reviews:               ["PRO", I],
  // profile_bounties: Staff-kontrollierte Profil-Promotions beantragen (coming soon)
  profile_bounties:                    [I]    // MATURITY_GATE: false — noch nicht live
};

/* ── Maturity Gates (unreife Module, unabhaengig vom Plan) ─ */

export const MATURITY_GATES = {
  admin_panel_access:           false,   // Admin-Panel noch nicht produktionsreif
  executive_control_access:     false,   // Ueberwachung/Steuerung noch in Arbeit
  monitoring_suite_access:      false,   // Monitoring-Suite noch nicht vollstaendig
  // Marketplace Visibility Center — coming soon (M-01 2026-05-30)
  marketplace_featured_profile: false,   // Nicht live — Staff-Freigabe-Workflow fehlt noch
  profile_bounties:             false    // Nicht live — Bounty-Lifecycle fehlt noch
};

/**
 * Prueft ob ein maturity-gated Feature freigeschaltet ist.
 * Unabhaengig vom Plan — auch INDIVIDUELL/Pilot sieht unreife Module nicht.
 */
export function hasMatureFeatureAccess(featureKey) {
  if (MATURITY_GATES[featureKey] === undefined) return true; // kein Gate = freigegeben
  return MATURITY_GATES[featureKey] === true;
}

/* ── Pilot-Erkennung ──────────────────────────────────── */

/**
 * Prueft ob ein Nutzer ein aktiver Pilotkunde ist.
 * Pilotkunden erhalten Enterprise-Funktionsumfang unabhaengig vom gespeicherten Plan.
 */
export function isPilotCustomer(opts) {
  if (!opts) return false;
  return (opts.pilot_status === "active" || opts.customer_stage === "pilot");
}

/* ── Haupt-Gate-Funktion ──────────────────────────────── */

const DEFAULT_PLAN = PLAN.DEMO;

/**
 * @param {string} [plan] - User plan (DEMO/BASIS/PLUS/PRO/INDIVIDUELL)
 * @param {string} featureKey - Feature key from planFeatures
 * @param {Object} [opts] - Optional context
 * @param {Object} [opts.pilot] - Pilot info { pilot_status, ... }
 * @param {string} [opts.customer_stage] - "pilot" | "regular" | "demo"
 * @returns {boolean}
 */
export function hasFeature(plan, featureKey, opts) {
  // ENV-gesteuerter Bypass (lokal: FEATURE_GATE_BYPASS=true)
  if (process.env.FEATURE_GATE_BYPASS === "true") return true;

  // Maturity Gate: unreife Features bleiben trotz hohem Plan gesperrt
  if (!hasMatureFeatureAccess(featureKey)) return false;

  // Pilot-Override: aktive Pilotkunden erhalten Individuell-Features
  if (isPilotCustomer(opts)) {
    const allowed = planFeatures[featureKey];
    if (allowed && Array.isArray(allowed) && allowed.includes(I)) return true;
  }

  // Normalize plan name (backward-compat: ENTERPRISE -> INDIVIDUELL)
  let p = plan ? String(plan).toUpperCase() : DEFAULT_PLAN;
  if (p === "ENTERPRISE" || p === "INDIVIDUAL") p = "INDIVIDUELL";
  if (p === "FREE") p = "DEMO";

  const allowed = planFeatures[featureKey];
  if (!allowed || !Array.isArray(allowed)) return false;
  return allowed.includes(p);
}

/**
 * @param {string} featureKey
 * @returns {string[]} Allowed plan names; [] if feature unknown
 */
export function getAllowedPlans(featureKey) {
  const allowed = planFeatures[featureKey];
  return Array.isArray(allowed) ? [...allowed] : [];
}

