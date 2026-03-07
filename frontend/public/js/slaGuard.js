/**
 * SLA route guard: on pages with data-sla-guard, require feature (e.g. sla_access).
 * If user has no access: show #paywall, hide #main-content. No silent redirect.
 * Requires: planFeatures.js loaded first.
 */
"use strict";

(function () {
  var guardAttr = "data-sla-guard";
  var mainId = "main-content";
  var paywallId = "paywall";

  function getRequiredFeature() {
    var el = document.body || document.documentElement;
    if (el && el.getAttribute) return el.getAttribute(guardAttr);
    return null;
  }

  function showPaywall() {
    var main = document.getElementById(mainId);
    var paywall = document.getElementById(paywallId);
    if (paywall) paywall.style.display = "block";
    if (main) main.style.display = "none";
  }

  function hidePaywall() {
    var paywall = document.getElementById(paywallId);
    if (paywall) paywall.style.display = "none";
  }

  function run() {
    var feature = getRequiredFeature();
    if (!feature) return;

    Promise.all([
      fetch("/api/me", { credentials: "include" }).then(function (r) { return r.ok ? r.json() : null; }),
      PlanFeatures.load()
    ]).then(function (results) {
      var me = results[0];
      var plan = (me && me.plan) ? me.plan : "FREE";
      if (!PlanFeatures.hasFeature(plan, feature)) {
        showPaywall();
        var titleEl = document.getElementById("paywall-feature-name");
        var planEl = document.getElementById("paywall-current-plan");
        var ctaEl = document.getElementById("paywall-cta");
        if (titleEl) titleEl.textContent = feature === "sla_access" ? "Pulse-Bereich" : feature;
        if (planEl) planEl.textContent = plan;
        if (ctaEl) ctaEl.href = "/public/sla_abo.html";
      } else {
        hidePaywall();
      }
    }).catch(function () {
      showPaywall();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
