/**
 * pricing.js — Renderer fuer die oeffentliche Tarifseite.
 *
 * Ab Welle 8 Schritt 13 nutzt diese Datei NUR noch den Shared-Renderer
 * `TC.catalog` aus `frontend/public/js/catalogRenderer.js`. Plan-Karten,
 * Tier-Karten, Feature-Vergleichstabelle und Disclaimer werden zentral
 * gerendert; pricing.js kuemmert sich um Page-spezifische CTAs und Empty-
 * /Error-States.
 *
 * Datenquelle: `GET /api/public/catalog` aus Welle 8 Schritt 2
 * (`api/config/planCatalog.js` ist die Single Source of Truth fuer Tarife,
 * Tiers, Features und Add-ons).
 *
 * CTAs:
 *   - Standardtarif (BASIS/PLUS/PRO) -> selectPlan -> TC.authIntent.navigateForPlan
 *   - INDIVIDUELL-Plan / Tier S/M/L/Enterprise -> selectIndividuellTier
 *   - Pilot anfragen -> requestPilot -> /public/enterprise_anfrage.html?intent=pilot
 *
 * Empty/Error: Wenn /api/public/catalog nicht erreichbar ist, rendern wir
 * eine sichtbare Fehler-Karte mit Reload-Knopf statt einer leeren Seite.
 */
(function () {
  "use strict";

  function tcCatalog() { return (window.TC && window.TC.catalog) ? window.TC.catalog : null; }

  var state = { catalog: null, isLoggedIn: false };

  function esc(s) { return tcCatalog() ? tcCatalog().esc(s) : String(s == null ? "" : s); }

  function init() {
    // Login-Check (best-effort) - erlaubt CTA-Variation bei eingeloggtem Nutzer
    try {
      fetch("/api/me", { credentials: "include" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (me) { state.isLoggedIn = !!(me && me.id); })
        .catch(function () { /* silent */ });
    } catch (e) { /* silent */ }

    var R = tcCatalog();
    if (!R) {
      showError(new Error("catalogRenderer fehlt (TC.catalog)"));
      return;
    }

    showLoading();
    R.load()
      .then(function (cat) {
        state.catalog = cat;
        renderPlans();
        renderTiers();
        renderComparison();
        renderDisclaimer();
      })
      .catch(showError);
  }

  function showLoading() {
    var p = document.getElementById("pricingPlanGrid");
    if (p) p.innerHTML = '<div class="pricing-loading">Lade Tarife&hellip;</div>';
  }

  function showError(err) {
    var p = document.getElementById("pricingPlanGrid");
    if (!p) return;
    var msg = err && err.message ? err.message : "Unbekannter Fehler";
    p.innerHTML =
      '<div class="pricing-error">' +
        '<div class="pricing-error__title">Tarife konnten nicht geladen werden.</div>' +
        '<div class="pricing-error__sub">' + esc(msg) + '</div>' +
        '<button type="button" class="ds-btn" onclick="location.reload()">Erneut versuchen</button>' +
      '</div>';
    var t = document.getElementById("pricingTierGrid");
    if (t) t.innerHTML = "";
    var c = document.getElementById("pricingComparisonBody");
    if (c) c.innerHTML = "";
  }

  /* ── Plan-Karten — jetzt ueber TC.catalog ist Single Source of Truth ── */

  function buildPricingPlanCta(plan) {
    // Page-spezifische CTAs (selectPlan / selectIndividuellTier).
    if (plan.key === "DEMO") {
      return { html: '<a href="/demo.html" class="ds-btn ds-w-full">Demo starten</a>' };
    }
    if (plan.key === "INDIVIDUELL") {
      return {
        html: '<button type="button" class="ds-btn ds-btn--primary ds-w-full" onclick="selectIndividuellTier(\'\')">Individuellen Tarif konfigurieren</button>'
      };
    }
    return { onclick: "selectPlan('" + plan.key + "')", label: "Plan w\u00e4hlen", primary: plan.key === "PLUS" };
  }

  function renderPlans() {
    var R = tcCatalog();
    var host = document.getElementById("pricingPlanGrid");
    if (!host || !R) return;
    var plans = (state.catalog && state.catalog.plans) || [];
    if (!plans.length) {
      host.innerHTML = '<div class="pricing-empty">Keine Tarife verf&uuml;gbar.</div>';
      return;
    }
    host.innerHTML = plans.map(function (plan) {
      return R.renderPlanCard(plan, {
        highlights: R.planHighlights(state.catalog, plan.key, 6),
        cta: buildPricingPlanCta(plan)
      });
    }).join("");
  }

  /* ── Tier-Grid (S/M/L/Enterprise) ────────────────────── */

  function renderTiers() {
    var R = tcCatalog();
    var host = document.getElementById("pricingTierGrid");
    if (!host || !R) return;
    var tiers = (state.catalog && state.catalog.individual_tiers) || [];
    var baseline = (state.catalog && state.catalog.individuell_baseline) || null;
    if (!tiers.length) { host.innerHTML = ""; return; }
    host.innerHTML =
      '<div style="font-size:16px;font-weight:800;margin-bottom:var(--ds-space-3);color:var(--ds-accent)">Individueller Tarif &mdash; Gr&ouml;&szlig;enklassen</div>' +
      '<p style="font-size:13px;color:var(--ds-text-secondary);margin-bottom:var(--ds-space-4);line-height:1.6">' +
        'Der individuelle Tarif richtet sich nach Ihrer Beschaeftigtenzahl. Die Einstufung erfolgt automatisch bei der Registrierung. Enterprise gilt ab 351 Beschaeftigten oder bei Sonderbedarf (z.B. Multi-Mandanten, eigene SLA).' +
      '</p>' +
      '<div class="pricing-tier-grid">' +
        tiers.map(function (t) { return R.renderTierCard(t, baseline); }).join("") +
      '</div>';
  }

  /* ── Vergleichstabelle — Shared-Renderer ─────────────── */

  function renderComparison() {
    var R = tcCatalog();
    var head = document.getElementById("pricingComparisonHead");
    var body = document.getElementById("pricingComparisonBody");
    if (!head || !body || !R) return;
    var plans = ((state.catalog && state.catalog.plans) || []).slice().sort(function (a, b) { return a.sort_order - b.sort_order; });
    var features = (state.catalog && state.catalog.features) || [];
    if (!plans.length || !features.length) {
      head.innerHTML = "";
      body.innerHTML = '<tr><td colspan="6" class="pricing-empty">Keine Vergleichsdaten verf&uuml;gbar.</td></tr>';
      return;
    }
    head.innerHTML = R.renderComparisonHead(plans);
    body.innerHTML = R.renderComparisonBody(plans, features);
  }

  /* ── Disclaimer ─────────────────────────────────── */

  function renderDisclaimer() {
    var R = tcCatalog();
    var d = document.getElementById("pricingDisclaimer");
    if (!d || !R) return;
    d.innerHTML = R.renderDisclaimer(state.catalog);
  }

  /* ── CTA-Handler (global, weil aus inline-onclick gerufen) ─── */

  function navigateForPlan(planKey) {
    if (window.TC && window.TC.authIntent && typeof window.TC.authIntent.navigateForPlan === "function") {
      window.TC.authIntent.navigateForPlan({ plan: planKey, isLoggedIn: state.isLoggedIn });
      return;
    }
    if (state.isLoggedIn) {
      location.href = "/public/sla_abo.html?plan=" + encodeURIComponent(planKey);
    } else {
      location.href = "/?auth=register&plan=" + encodeURIComponent(planKey);
    }
  }

  window.selectPlan = function (planKey) {
    if (planKey === "INDIVIDUELL") { window.selectIndividuellTier(""); return; }
    navigateForPlan(planKey);
  };

  window.selectIndividuellTier = function (tierKey) {
    var params = new URLSearchParams();
    params.set("source", "pricing");
    params.set("plan", "INDIVIDUELL");
    params.set("intent", "request");
    if (tierKey) params.set("tier", tierKey);
    location.href = "/public/enterprise_anfrage.html?" + params.toString();
  };

  window.requestPilot = function () {
    var params = new URLSearchParams();
    params.set("source", "pricing");
    params.set("intent", "pilot");
    params.set("plan", "INDIVIDUELL");
    location.href = "/public/enterprise_anfrage.html?" + params.toString();
  };

  /* ── Bootstrap ─────────────────────────────────────────────── */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
