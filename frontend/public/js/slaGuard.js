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

  function dispatchGuardEvent(passed) {
    document.dispatchEvent(new CustomEvent("slaGuardPassed", { detail: { passed: passed } }));
  }

  function run() {
    var feature = getRequiredFeature();
    if (!feature) {
      // Kein Guard aktiv — sofort Event dispatchen damit Seiten nicht haengen
      dispatchGuardEvent(true);
      return;
    }

    Promise.all([
      fetch("/api/me", { credentials: "include" }).then(function (r) {
        if (r.status === 429) return { _rateLimited: true };
        return r.ok ? r.json() : null;
      }),
      PlanFeatures.load()
    ]).then(function (results) {
      var me = results[0];
      if (me && me._rateLimited) { hidePaywall(); dispatchGuardEvent(true); return; }
      var plan = (me && me.plan) ? me.plan : "DEMO";
      if (!PlanFeatures.hasFeature(plan, feature)) {
        showPaywall();
        var titleEl = document.getElementById("paywall-feature-name");
        var planEl = document.getElementById("paywall-current-plan");
        var ctaEl = document.getElementById("paywall-cta");
        if (titleEl) titleEl.textContent = feature === "sla_access" ? "Pulse-Bereich" : feature;
        if (planEl) planEl.textContent = plan;
        if (ctaEl) ctaEl.href = "/public/sla_abo.html";
        dispatchGuardEvent(false);
      } else {
        hidePaywall();
        dispatchGuardEvent(true);
      }
    }).catch(function () {
      showPaywall();
      dispatchGuardEvent(false);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
