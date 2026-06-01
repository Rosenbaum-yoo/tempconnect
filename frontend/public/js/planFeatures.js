/**
 * Frontend feature gating – single source from GET /api/plan-features.
 * Default plan when user unknown: DEMO. Unknown feature => false / [].
 */
"use strict";

var PlanFeatures = (function () {
  var PLAN = { DEMO: "DEMO", BASIS: "BASIS", PLUS: "PLUS", PRO: "PRO", INDIVIDUELL: "INDIVIDUELL" };
  // Backward-compat aliases
  PLAN.ENTERPRISE = PLAN.INDIVIDUELL;
  PLAN.INDIVIDUAL = PLAN.INDIVIDUELL;
  PLAN.FREE = PLAN.DEMO;
  var planFeatures = {};
  var _maturityGates = {};
  var _bypass = false;
  var loaded = false;

  function load() {
    if (loaded) return Promise.resolve({ PLAN: PLAN, planFeatures: planFeatures, MATURITY_GATES: _maturityGates });
    return fetch("/api/plan-features", { credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (data) {
        if (data.PLAN) PLAN = data.PLAN;
        if (data.planFeatures && typeof data.planFeatures === "object") planFeatures = data.planFeatures;
        if (data.MATURITY_GATES && typeof data.MATURITY_GATES === "object") _maturityGates = data.MATURITY_GATES;
        if (data.bypass === true) _bypass = true;
        loaded = true;
        return { PLAN: PLAN, planFeatures: planFeatures, MATURITY_GATES: _maturityGates };
      });
  }

  function hasFeature(plan, featureKey) {
    // Bypass wird vom Backend via /api/plan-features geliefert
    if (_bypass) return true;
    var p = (plan && featureKey) ? String(plan).toUpperCase() : "DEMO";
    // Normalize: ENTERPRISE/INDIVIDUAL -> INDIVIDUELL, FREE -> DEMO
    if (p === "ENTERPRISE" || p === "INDIVIDUAL") p = "INDIVIDUELL";
    if (p === "FREE") p = "DEMO";
    var allowed = planFeatures[featureKey];
    if (!allowed || !Array.isArray(allowed)) return false;
    return allowed.indexOf(p) >= 0;
  }

  function getAllowedPlans(featureKey) {
    var allowed = planFeatures[featureKey];
    return Array.isArray(allowed) ? allowed.slice() : [];
  }

  function getDisplayPlanLabel(plan) {
    var p = String(plan || "DEMO").toUpperCase();
    if (p === "FREE") p = "DEMO";
    if (p === "INDIVIDUELL" || p === "ENTERPRISE" || p === "INDIVIDUAL") return "Individueller Tarif";
    return p;
  }

  return {
    load: load,
    hasFeature: hasFeature,
    getAllowedPlans: getAllowedPlans,
    getDisplayPlanLabel: getDisplayPlanLabel,
    get PLAN() { return PLAN; },
    get planFeatures() { return planFeatures; }
  };
})();
