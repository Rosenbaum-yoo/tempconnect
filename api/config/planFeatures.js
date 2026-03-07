/**
 * Single source of truth: Plan constants and feature flags.
 * Used by backend (middleware, routes) and exposed to frontend via GET /api/plan-features.
 * Default plan when unknown: FREE. Unknown feature => false / [].
 */

export const PLAN = {
  FREE: "FREE",
  BASIS: "BASIS",
  PLUS: "PLUS",
  NOTDIENST: "NOTDIENST",
  PRO: "PRO",
  ENTERPRISE: "ENTERPRISE"
};

/** @type {Record<string, string[]>} featureKey -> list of plan names that have access */
export const planFeatures = {
  // Legacy marketplace
  legacy_access:          ["FREE", "BASIS"],

  // SLA / Pulse features
  sla_access:             ["PLUS", "NOTDIENST", "PRO", "ENTERPRISE"],
  sla_offers_create:      ["PLUS", "NOTDIENST", "PRO", "ENTERPRISE"],
  sla_help:               ["PLUS", "NOTDIENST", "PRO", "ENTERPRISE"],
  sla_subscriptions:      ["PLUS", "NOTDIENST", "PRO", "ENTERPRISE"],
  sla_profile:            ["PLUS", "NOTDIENST", "PRO", "ENTERPRISE"],
  sla_proofs:             ["PLUS", "NOTDIENST", "PRO", "ENTERPRISE"],

  // PRO features
  advanced_matching:      ["PRO", "ENTERPRISE"],
  supplier_ratings:       ["PRO", "ENTERPRISE"],
  deal_workflow:          ["PRO", "ENTERPRISE"],
  premium_visibility:     ["PRO", "ENTERPRISE"],
  basic_analytics:        ["PLUS", "NOTDIENST", "PRO", "ENTERPRISE"],
  persistent_requisitions:["PLUS", "NOTDIENST", "PRO", "ENTERPRISE"],
  alerts:                 ["PLUS", "NOTDIENST", "PRO", "ENTERPRISE"],

  // ENTERPRISE features
  approval_workflows:     ["ENTERPRISE"],
  departments:            ["ENTERPRISE"],
  multi_location:         ["ENTERPRISE"],
  supplier_management:    ["ENTERPRISE"],
  compliance:             ["ENTERPRISE"],
  contracts:              ["ENTERPRISE"],
  enterprise_analytics:   ["ENTERPRISE"],
  audit_traceability:     ["ENTERPRISE"],
  org_settings:           ["ENTERPRISE"],
  assignments:            ["ENTERPRISE"],

  // Capacity Exchange features
  capacity_exchange_basic:    ["BASIS", "PLUS", "NOTDIENST", "PRO", "ENTERPRISE"],
  capacity_exchange_matching: ["PLUS", "NOTDIENST", "PRO", "ENTERPRISE"],
  capacity_exchange_priority: ["PRO", "ENTERPRISE"],
  capacity_exchange_multi:    ["ENTERPRISE"]
};

const DEFAULT_PLAN = PLAN.FREE;

/**
 * @param {string} [plan] - User plan (default FREE if undefined/null/unknown)
 * @param {string} featureKey - Feature key from planFeatures
 * @returns {boolean}
 */
export function hasFeature(plan, featureKey) {
  const p = plan && planFeatures[featureKey] ? String(plan).toUpperCase() : DEFAULT_PLAN;
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
