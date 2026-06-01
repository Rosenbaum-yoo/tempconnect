/**
 * catalogRenderer.js \u2014 Shared Renderer fuer den zentralen Tarif-/Feature-/Addon-Katalog.
 *
 * Datenquelle: GET /api/public/catalog (siehe Welle 8 Schritt 2 + 12,
 * `api/config/planCatalog.js` ist die Single Source of Truth).
 *
 * Wer liefert hier rein:
 *   - frontend/public/js/pages/pricing.js          (oeffentliche Tarifseite)
 *   - frontend/public/js/pages/slaAbo.js           (eingeloggte Abo-Verwaltung)
 *   - frontend/public/js/pages/enterpriseAnfrage.js (Konfigurator)
 *   - frontend/public/js/pages/accountSubscription.js (Account-Limits-Block)
 *
 * KEINE Hardcodes mehr fuer Plan-Preise, Plan-Features, Tier-Schwellen, Add-on-Preise.
 *
 * Exports:
 *   TC.catalog.load({ url?, signal?, force? })     -> Promise<catalog>
 *   TC.catalog.invalidate()                        -> Cache loeschen
 *   TC.catalog.snapshot()                          -> letzter geladener Catalog (oder null)
 *   TC.catalog.normalizePlanKey(value, fallback)   -> kanonische 5er-Liste
 *   TC.catalog.esc(s)                              -> HTML escape
 *   TC.catalog.fmtCents(cents)                     -> "150 EUR" oder null
 *   TC.catalog.fmtCentsOrCustom(cents, fallback)   -> "150 EUR" oder fallback
 *   TC.catalog.findPlan(catalog, planKey)          -> plan-Objekt|null
 *   TC.catalog.findAddon(catalog, addonKey)        -> addon-Objekt|null
 *   TC.catalog.findFeatureByKey(catalog, fkey)     -> feature-Objekt|null
 *   TC.catalog.planHighlights(catalog, planKey, n) -> Array<feature>
 *   TC.catalog.renderPlanCard(plan, ctx)           -> HTML-String
 *   TC.catalog.renderTierCard(tier, baseline, ctx) -> HTML-String
 *   TC.catalog.renderComparisonHead(plans, ctx)    -> HTML-String
 *   TC.catalog.renderComparisonBody(plans, features, ctx) -> HTML-String
 *   TC.catalog.deriveDowngradeLosses(catalog, fromPlan, toPlan, opts)
 *                                                  -> Array<{ feature_key, name, lost_in: planKey[] }>
 *   TC.catalog.intervalLabel(plan)                 -> "/Monat" / "/14 Tage" / "auf Anfrage"
 *
 * Dieses Modul macht KEINE DOM-Mutation \u2014 nur HTML-Strings + Daten.
 * Der Aufrufer entscheidet, wo gerendert wird.
 */
(function (global) {
  "use strict";

  var DEFAULT_URL = "/api/public/catalog";
  var CANONICAL_KEYS = ["DEMO", "BASIS", "PLUS", "PRO", "INDIVIDUELL"];
  var ALIASES = {
    "":          "DEMO",
    FREE:        "DEMO",
    TRIAL:       "DEMO",
    STARTER:     "BASIS",
    NOTDIENST:   "PLUS",
    ENTERPRISE:  "INDIVIDUELL",
    INDIVIDUAL:  "INDIVIDUELL"
  };

  var CATEGORY_LABELS = {
    core: "Kernzugang",
    staffing: "Operativ &amp; Staffing",
    matching: "Matching &amp; Ranking",
    capacity: "Capacity Exchange",
    analytics: "Analysen",
    governance: "Governance &amp; Steuerung",
    compliance: "Compliance &amp; DSGVO",
    integration: "Integration &amp; Rate Cards",
    support: "Support",
    security: "Sicherheit"
  };

  /* ── Cache ───────────────────────────────────────────── */

  var _state = {
    promise: null,
    catalog: null,
    error: null,
    fetchedAt: 0
  };

  function invalidate() { _state = { promise: null, catalog: null, error: null, fetchedAt: 0 }; }
  function snapshot() { return _state.catalog; }

  function load(opts) {
    opts = opts || {};
    if (opts.force) invalidate();
    if (_state.catalog && !opts.force) return Promise.resolve(_state.catalog);
    if (_state.promise) return _state.promise;

    var url = opts.url || DEFAULT_URL;
    _state.promise = fetch(url, { credentials: "omit", signal: opts.signal })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)); })
      .then(function (cat) {
        _state.catalog = cat;
        _state.error = null;
        _state.fetchedAt = Date.now();
        _state.promise = null;
        return cat;
      })
      .catch(function (err) {
        _state.error = err;
        _state.promise = null;
        throw err;
      });
    return _state.promise;
  }

  /* ── Helpers ─────────────────────────────────────────── */

  // HTML-Escape — nutzt DOM wenn verfuegbar, faellt sonst auf String-Replace zurueck
  // (z.B. fuer headless Node-Tests).
  var ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) {
    if (s == null) return "";
    if (typeof document !== "undefined" && document.createElement) {
      var d = document.createElement("div");
      d.textContent = String(s);
      return d.innerHTML;
    }
    return String(s).replace(/[&<>"']/g, function (ch) { return ESC_MAP[ch] || ch; });
  }

  function normalizePlanKey(value, fallback) {
    if (typeof fallback === "undefined") fallback = "DEMO";
    if (value === null || value === undefined) return fallback;
    var p = String(value).trim().toUpperCase();
    if (Object.prototype.hasOwnProperty.call(ALIASES, p)) p = ALIASES[p];
    return CANONICAL_KEYS.indexOf(p) >= 0 ? p : fallback;
  }

  function fmtCents(cents) {
    if (cents == null) return null;
    var n = Number(cents) / 100;
    if (!isFinite(n)) return null;
    return n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " EUR";
  }

  function fmtCentsOrCustom(cents, fallback) {
    var f = fmtCents(cents);
    return f || (fallback || "Individuell");
  }

  function intervalLabel(plan) {
    if (!plan) return "";
    return plan.interval_label || (plan.interval === "trial14d" ? "/ 14 Tage"
      : plan.interval === "monthly" ? "/ Monat"
      : plan.interval === "annual" ? "/ Jahr"
      : "");
  }

  /* ── Lookup ──────────────────────────────────────────── */

  function findPlan(catalog, planKey) {
    if (!catalog || !Array.isArray(catalog.plans)) return null;
    var key = normalizePlanKey(planKey, null);
    if (!key) return null;
    for (var i = 0; i < catalog.plans.length; i++) {
      if (catalog.plans[i].key === key) return catalog.plans[i];
    }
    return null;
  }

  function findAddon(catalog, addonKey) {
    if (!catalog || !Array.isArray(catalog.addons) || !addonKey) return null;
    var k = String(addonKey);
    for (var i = 0; i < catalog.addons.length; i++) {
      if (catalog.addons[i].key === k) return catalog.addons[i];
    }
    return null;
  }

  function findFeatureByKey(catalog, fkey) {
    if (!catalog || !Array.isArray(catalog.features) || !fkey) return null;
    for (var i = 0; i < catalog.features.length; i++) {
      if (catalog.features[i].feature_key === fkey) return catalog.features[i];
    }
    return null;
  }

  function planHighlights(catalog, planKey, limit) {
    if (typeof limit !== "number" || limit < 1) limit = 6;
    var key = normalizePlanKey(planKey, null);
    if (!key || !catalog || !Array.isArray(catalog.features)) return [];
    return catalog.features
      .filter(function (f) { return Array.isArray(f.included_in_plans) && f.included_in_plans.indexOf(key) >= 0; })
      .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); })
      .slice(0, limit);
  }

  /* ── Plan-Karte ──────────────────────────────────────── */

  function planCardClass(planKey, extra) {
    var c = "plan-card";
    if (planKey === "PLUS") c += " plan-card--recommended";
    if (planKey === "INDIVIDUELL") c += " plan-card--enterprise";
    if (extra) c += " " + extra;
    return c;
  }

  function planNameStyle(planKey) {
    if (planKey === "PLUS") return ' style="color:var(--ds-brand)"';
    if (planKey === "INDIVIDUELL") return ' style="color:var(--ds-accent)"';
    return "";
  }

  function planPriceHtml(plan) {
    if (!plan) return "";
    if (plan.key === "INDIVIDUELL") {
      return '<div class="plan-card__price">Individuell <span>auf Anfrage</span></div>';
    }
    var cents = plan.monthly_price_cents;
    if (cents == null) {
      return '<div class="plan-card__price">' + esc(intervalLabel(plan)) + '</div>';
    }
    return '<div class="plan-card__price">' + esc(fmtCents(cents)) + ' <span>' + esc(intervalLabel(plan)) + '</span></div>';
  }

  /**
   * @param {object} plan          Plan-Objekt aus catalog.plans
   * @param {object} ctx           Render-Kontext:
   *   - highlights: Array<feature>  (default: planHighlights(catalog, plan.key))
   *   - isCurrent:  boolean         (markiert "Aktuell"-Badge)
   *   - isCanceling: boolean        (zusaetzliches Kuendigungs-Badge)
   *   - cta: { html?, label?, href?, primary?, onclick?, disabled? }
   *          Wenn `html` gesetzt: wird wortwoertlich uebernommen.
   */
  function renderPlanCard(plan, ctx) {
    if (!plan) return "";
    ctx = ctx || {};
    var highlights = Array.isArray(ctx.highlights) ? ctx.highlights : [];
    var liHtml = highlights.length
      ? highlights.map(function (f) { return '<li>' + esc(f.name || f.label || f.feature_key) + '</li>'; }).join("")
      : '<li class="excluded">Keine Highlights hinterlegt</li>';

    var badgeParts = [];
    if (ctx.isCurrent) {
      badgeParts.push('<div class="plan-card__badge"><span class="ds-badge ds-badge--brand">Aktuell</span></div>');
      if (ctx.isCanceling) {
        badgeParts.push('<div class="plan-card__badge"><span class="ds-badge" style="background:rgba(255,204,0,.18);border:1px solid rgba(255,204,0,.35);color:#ffe680">Kuendigung vorgemerkt</span></div>');
      }
    } else if (plan.badge) {
      var bcls = (plan.key === "INDIVIDUELL") ? "ds-badge--accent" : "ds-badge--brand";
      badgeParts.push('<div class="plan-card__badge"><span class="ds-badge ' + bcls + '">' + esc(plan.badge) + '</span></div>');
    }

    var cls = planCardClass(plan.key, ctx.isCurrent ? "plan-card--current" : "");
    var ctaHtml = renderPlanCta(plan, ctx);

    return '<div class="' + cls + '" data-plan="' + esc(plan.key) + '">' +
      badgeParts.join("") +
      '<div class="plan-card__name"' + planNameStyle(plan.key) + '>' + esc(plan.display_label || plan.label || plan.key) + '</div>' +
      planPriceHtml(plan) +
      '<div class="plan-card__desc">' + esc(plan.description || "") + '</div>' +
      '<ul class="plan-card__features">' + liHtml + '</ul>' +
      '<div class="plan-card__cta">' + ctaHtml + '</div>' +
    '</div>';
  }

  function renderPlanCta(plan, ctx) {
    var cta = (ctx && ctx.cta) || null;
    if (cta && cta.html) return cta.html;
    if (ctx && ctx.isCurrent) {
      return '<button type="button" class="ds-btn" style="width:100%;opacity:.5;cursor:not-allowed" disabled>Aktuell</button>';
    }
    if (cta && cta.disabled) {
      return '<button type="button" class="ds-btn ds-w-full" disabled>' + esc(cta.label || "") + '</button>';
    }
    var primaryCls = (cta && cta.primary) || plan.key === "PLUS" ? "ds-btn--primary" : "";
    var label = (cta && cta.label) || (plan.key === "DEMO" ? "Demo starten"
      : plan.key === "INDIVIDUELL" ? "Individuell konfigurieren" : "Plan w\u00e4hlen");
    if (cta && cta.href) {
      return '<a href="' + esc(cta.href) + '" class="ds-btn ' + primaryCls + ' ds-w-full">' + esc(label) + '</a>';
    }
    if (cta && cta.onclick) {
      return '<button type="button" class="ds-btn ' + primaryCls + ' ds-w-full" onclick="' + esc(cta.onclick) + '">' + esc(label) + '</button>';
    }
    // Default: signaled selectPlan
    return '<button type="button" class="ds-btn ' + primaryCls + ' ds-w-full" onclick="selectPlan(\'' + esc(plan.key) + '\')">' + esc(label) + '</button>';
  }

  /* ── Tier-Karte (S/M/L/Enterprise) ───────────────────── */

  function tierBoundsLabel(t) {
    if (!t) return "";
    if (t.is_open_ended) return "ab " + Number(t.min_employees) + " Besch&auml;ftigte";
    return Number(t.min_employees) + "&ndash;" + Number(t.max_employees) + " Besch&auml;ftigte";
  }

  function renderTierCard(tier, baseline, ctx) {
    if (!tier) return "";
    ctx = ctx || {};
    var emph = tier.is_enterprise ? ' style="border-color:rgba(124,92,255,.3);background:rgba(124,92,255,.04)"' : "";
    var titleStyle = tier.is_enterprise ? ' style="color:var(--ds-accent)"' : "";
    var price = tier.is_enterprise ? "Individuell" : (baseline ? fmtCentsOrCustom(baseline.base_monthly_cents, "auf Anfrage") : "auf Anfrage");
    var sub = tier.is_enterprise ? "Verhandlungsbasis" : "Basispaket / Monat netto";
    var ctaLabel = tier.is_enterprise ? "Enterprise anfragen" : "Anfragen";
    var ctaHandler = ctx.ctaHandler || ("selectIndividuellTier('" + esc(tier.key) + "')");
    return '<div class="pricing-tier-card"' + emph + ' data-tier="' + esc(tier.key) + '">' +
      '<div class="pricing-tier-card__title"' + titleStyle + '>' + esc(tier.short_label || tier.label) + '</div>' +
      '<div class="pricing-tier-card__bounds">' + tierBoundsLabel(tier) + '</div>' +
      '<div class="pricing-tier-card__price">' + esc(price) + '</div>' +
      '<div class="pricing-tier-card__sub">' + esc(sub) + '</div>' +
      '<div class="pricing-tier-card__desc">' + esc(tier.description || "") + '</div>' +
      '<button type="button" class="ds-btn ds-w-full" onclick="' + ctaHandler + '">' + esc(ctaLabel) + '</button>' +
    '</div>';
  }

  /* ── Vergleichstabelle ───────────────────────────────── */

  function renderComparisonHead(plans, ctx) {
    if (!Array.isArray(plans) || !plans.length) return "";
    return '<tr><th>Funktion</th>' + plans.map(function (p) {
      var hl = (p.key === "PLUS") ? ' class="highlight"' : "";
      return '<th' + hl + '>' + esc(p.display_label || p.label) + '</th>';
    }).join("") + '</tr>';
  }

  function renderComparisonBody(plans, features, ctx) {
    if (!Array.isArray(plans) || !plans.length) return "";
    if (!Array.isArray(features) || !features.length) return "";
    ctx = ctx || {};
    var cats = ctx.categoryLabels || CATEGORY_LABELS;

    var groups = {};
    var ordered = [];
    features.forEach(function (f) {
      if (!groups[f.category]) { groups[f.category] = []; ordered.push(f.category); }
      groups[f.category].push(f);
    });

    var html = "";
    ordered.forEach(function (cat) {
      var label = cats[cat] || cat;
      html += '<tr class="group-row"><td colspan="' + (1 + plans.length) + '">' + label + '</td></tr>';
      groups[cat].sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
      groups[cat].forEach(function (f) {
        html += '<tr><td>' + esc(f.name) + '</td>';
        plans.forEach(function (p) {
          var on = Array.isArray(f.included_in_plans) && f.included_in_plans.indexOf(p.key) >= 0;
          html += on ? '<td class="check">&#10003;</td>' : '<td class="cross">&times;</td>';
        });
        html += '</tr>';
      });
    });
    return html;
  }

  /* ── Downgrade-Verlust-Logik (dynamisch aus Catalog) ─ */

  /**
   * Berechnet die Features, die beim Downgrade von `fromPlan` auf `toPlan` verloren gehen.
   * Quelle: catalog.features[].included_in_plans.
   *
   * @param {object} catalog
   * @param {string} fromPlan
   * @param {string} toPlan
   * @param {object} [opts] { onlyVisibleInPricing?: boolean (default true) }
   * @returns {Array<{ feature_key, name, lost_in: string[] }>}
   */
  function deriveDowngradeLosses(catalog, fromPlan, toPlan, opts) {
    opts = opts || {};
    var from = normalizePlanKey(fromPlan, null);
    var to = normalizePlanKey(toPlan, null);
    if (!from || !to || from === to) return [];

    var fromIdx = CANONICAL_KEYS.indexOf(from);
    var toIdx = CANONICAL_KEYS.indexOf(to);
    if (fromIdx <= toIdx) return []; // kein Downgrade

    if (!catalog || !Array.isArray(catalog.features)) return [];

    var visible = (opts.onlyVisibleInPricing !== false);
    var lossList = [];
    catalog.features.forEach(function (f) {
      if (visible && f.visible_in_pricing === false) return;
      if (!Array.isArray(f.included_in_plans)) return;
      var inFrom = f.included_in_plans.indexOf(from) >= 0;
      var inTo = f.included_in_plans.indexOf(to) >= 0;
      if (inFrom && !inTo) {
        lossList.push({
          feature_key: f.feature_key,
          name: f.name || f.feature_key,
          category: f.category,
          sort_order: f.sort_order || 0,
          lost_in: [from]
        });
      }
    });
    lossList.sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
    return lossList;
  }

  /* ── Disclaimer ──────────────────────────────────────── */

  function renderDisclaimer(catalog) {
    var ver = catalog && catalog.catalog_version ? " (v" + catalog.catalog_version + ")" : "";
    return "Alle Preise verstehen sich in EUR netto zzgl. gesetzlicher MwSt. " +
      "TempConnect ist eine Plattform zur Unterst&uuml;tzung der Bedarfs-, Angebots- und Einsatzkoordination &mdash; " +
      "TempConnect ist <strong>keine Zeitarbeitsfirma</strong> und garantiert keinen Vermittlungserfolg. " +
      "Stand der Tarif- und Featurewahrheit" + esc(ver) + ".";
  }

  /* ── Public Namespace ────────────────────────────────── */

  var TC = global.TC = global.TC || {};
  TC.catalog = {
    DEFAULT_URL: DEFAULT_URL,
    CANONICAL_PLAN_KEYS: CANONICAL_KEYS.slice(),
    CATEGORY_LABELS: CATEGORY_LABELS,

    load: load,
    invalidate: invalidate,
    snapshot: snapshot,

    esc: esc,
    fmtCents: fmtCents,
    fmtCentsOrCustom: fmtCentsOrCustom,
    intervalLabel: intervalLabel,
    normalizePlanKey: normalizePlanKey,

    findPlan: findPlan,
    findAddon: findAddon,
    findFeatureByKey: findFeatureByKey,
    planHighlights: planHighlights,

    renderPlanCard: renderPlanCard,
    renderTierCard: renderTierCard,
    renderComparisonHead: renderComparisonHead,
    renderComparisonBody: renderComparisonBody,
    renderDisclaimer: renderDisclaimer,

    deriveDowngradeLosses: deriveDowngradeLosses
  };

  // CommonJS-/Node-Test-Entry: ermoeglicht headless-Tests des reinen Logik-Layers.
  // eslint-disable-next-line no-undef
  if (typeof module !== "undefined" && module.exports) {
    // eslint-disable-next-line no-undef
    module.exports = TC.catalog;
  }
})(typeof window !== "undefined" ? window : globalThis);
