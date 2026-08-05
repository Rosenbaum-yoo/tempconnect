/**
 * SLA route guard: on pages with data-sla-guard, require feature (e.g. sla_access).
 * If user has no access: show #paywall, hide #main-content. No silent redirect.
 * Requires: planFeatures.js loaded first.
 *
 * P6.1 (DE/EN): Der Guard schreibt den Feature-Namen in #paywall-feature-name —
 * dieser Text erscheint auf ~24 Seiten. Weil nicht garantiert ist, dass jede
 * dieser Seiten i18n.js einbindet, laeuft die Uebersetzung ueber tr(): ohne
 * window.TCi18n bleibt der deutsche Bestandstext stehen (Muster:
 * js/workerPortal/portalStatus.js).
 */
"use strict";

(function () {
  var guardAttr = "data-sla-guard";
  var mainId = "main-content";
  var paywallId = "paywall";
  var featureNameId = "paywall-feature-name";

  /* ── Woerterbuch (P6.1, DE/EN) ──────────────────────────────────────────
     Die deutschen Namen sind Quelle UND Fallback: das DE-Woerterbuch wird aus
     FEATURE_LABELS_DE erzeugt, damit nichts doppelt gepflegt wird.

     Bewusst NICHT hier uebersetzt:
     - der umgebende Paywall-Block (Ueberschrift, Satzrahmen, Plan-Zeile, CTA)
       gehoert zur jeweiligen Seite und traegt dort data-i18n.
     - der Rohwert des Plans (DEMO/BASIS/...) ist ein Server-Enum.
     - unbekannte Feature-Keys fallen weiterhin auf den technischen Key zurueck. */
  var I18N_PREFIX = "shared.access.feature.";

  var FEATURE_LABELS_DE = {
    sla_access: "Pulse-Bereich",
    sla_profile: "Profil",
    sla_proofs: "Nachweise",
    sla_offers_create: "Angebote erstellen"
  };

  var FEATURE_LABELS_EN = {
    sla_access: "Pulse area",
    sla_profile: "Profile",
    sla_proofs: "Proofs",
    sla_offers_create: "Create offers"
  };

  var registered = false;

  /** Registriert das Woerterbuch, sobald i18n.js verfuegbar ist (einmalig). */
  function ensureRegistered() {
    if (registered || !window.TCi18n) return;
    var de = {};
    var en = {};
    Object.keys(FEATURE_LABELS_DE).forEach(function (k) { de[I18N_PREFIX + k] = FEATURE_LABELS_DE[k]; });
    Object.keys(FEATURE_LABELS_EN).forEach(function (k) { en[I18N_PREFIX + k] = FEATURE_LABELS_EN[k]; });
    window.TCi18n.register("de", de);
    window.TCi18n.register("en", en);
    registered = true;
  }

  /** Uebersetzt, faellt auf den deutschen Bestandstext zurueck. */
  function tr(key, fallback) {
    ensureRegistered();
    if (window.TCi18n) {
      var v = window.TCi18n.t(key);
      if (v) return v;
    }
    return fallback;
  }

  function featureLabel(feature) {
    return tr(I18N_PREFIX + feature, FEATURE_LABELS_DE[feature] || feature);
  }

  /** Zuletzt gesperrtes Feature — noetig, um den Namen beim Sprachwechsel
   *  nachzuziehen (der Knoten traegt bewusst kein data-i18n, weil ihn dieses
   *  Modul zur Laufzeit beschreibt). */
  var blockedFeature = null;

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
      if (me && me._rateLimited) { blockedFeature = null; hidePaywall(); dispatchGuardEvent(true); return; }
      var plan = (me && me.plan) ? me.plan : "DEMO";
      if (!PlanFeatures.hasFeature(plan, feature)) {
        showPaywall();
        blockedFeature = feature;
        var titleEl = document.getElementById(featureNameId);
        var planEl = document.getElementById("paywall-current-plan");
        var ctaEl = document.getElementById("paywall-cta");
        if (titleEl) titleEl.textContent = featureLabel(feature);
        if (planEl) planEl.textContent = plan;
        if (ctaEl) ctaEl.href = "/public/sla_abo.html";
        dispatchGuardEvent(false);
      } else {
        blockedFeature = null;
        hidePaywall();
        dispatchGuardEvent(true);
      }
    }).catch(function () {
      blockedFeature = getRequiredFeature();
      showPaywall();
      var nameEl = document.getElementById(featureNameId);
      if (nameEl && blockedFeature) nameEl.textContent = featureLabel(blockedFeature);
      dispatchGuardEvent(false);
    });
  }

  // Sprachwechsel: den zur Laufzeit gesetzten Feature-Namen nachziehen.
  document.addEventListener("tc:langchange", function () {
    if (!blockedFeature) return;
    var el = document.getElementById(featureNameId);
    if (el) el.textContent = featureLabel(blockedFeature);
  });

  ensureRegistered();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
