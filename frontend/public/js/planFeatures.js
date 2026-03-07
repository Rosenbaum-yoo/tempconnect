/**
 * Frontend feature gating – single source from GET /api/plan-features.
 * Default plan when user unknown: FREE. Unknown feature => false / [].
 */
"use strict";

var PlanFeatures = (function () {
  var PLAN = { FREE: "FREE", BASIS: "BASIS", PLUS: "PLUS", NOTDIENST: "NOTDIENST" };
  var planFeatures = {};
  var loaded = false;

  function load() {
    if (loaded) return Promise.resolve({ PLAN: PLAN, planFeatures: planFeatures });
    return fetch("/api/plan-features", { credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (data) {
        if (data.PLAN) PLAN = data.PLAN;
        if (data.planFeatures && typeof data.planFeatures === "object") planFeatures = data.planFeatures;
        loaded = true;
        return { PLAN: PLAN, planFeatures: planFeatures };
      });
  }

  function hasFeature(plan, featureKey) {
    var p = (plan && featureKey) ? String(plan).toUpperCase() : "FREE";
    var allowed = planFeatures[featureKey];
    if (!allowed || !Array.isArray(allowed)) return false;
    return allowed.indexOf(p) >= 0;
  }

  function getAllowedPlans(featureKey) {
    var allowed = planFeatures[featureKey];
    return Array.isArray(allowed) ? allowed.slice() : [];
  }

  return {
    load: load,
    hasFeature: hasFeature,
    getAllowedPlans: getAllowedPlans,
    get PLAN() { return PLAN; },
    get planFeatures() { return planFeatures; }
  };
})();
