/**
 * pageShell.js — Enterprise Page Shell (Topbar + User Dropdown + Mobile Menu)
 *
 * Eliminates 30+ lines of duplicated topbar HTML across all enterprise pages.
 * Usage: Add <div id="tc-shell"></div> at the top of <body> and include this script.
 *
 * Features:
 *   - ds-topbar with brand dot, nav links, help icon
 *   - Active link detection from location.pathname
 *   - User profile dropdown (fetches /api/me, shows name/role/plan)
 *   - Logout button integrated
 *   - Mobile hamburger menu (< 768px)
 *   - Notification badge integration (data-notif-topbar)
 *   - Keyboard accessible (Escape closes dropdowns)
 *
 * Namespace: TC.shell
 * Depends on: design-system.css (ds-topbar, ds-nav-link classes)
 */
(function () {
  "use strict";

  /* ── Namespace ──────────────────────────────────────────────── */
  window.TC = window.TC || {};

  /* ── Configuration ─────────────────────────────────────────── */
  var BRAND = "TempConnect";

  var NAV_LINKS = [
    { label: "\u00dcbersicht", key: "uebersicht", href: "/public/enterprise.html", match: ["/public/enterprise.html"], desc: "Pilot-Standard und naechste Schritte im Blick: Angebot, Deal, Besetzung und Zeiten vor Ausbauflächen." },
    { label: "Personal finden", key: "marktplatz", termKey: "navMarketplace", href: "/public/capacity_exchange_feed.html", match: ["/public/capacity_exchange_feed.html", "/public/capacity_exchange", "/public/capacity_search", "/public/agency_inbox", "/public/angebote_verwalten", "/public/matching_results", "/public/marketplace_capacity", "/public/sla_search_jobs", "/public/sla_angebote"], desc: "Pilot-Standard: Personal finden, passende Einsaetze und Vermittlungsreaktionen ohne Medienbruch steuern." },
    { label: "Arbeitsplatzangebote", key: "bedarfe", termKey: "navDemands", href: "/public/requisitions.html", match: ["/public/requisitions", "/public/company_requests", "/public/demand_create", "/public/request_detail", "/public/marketplace_demand_"], desc: "Pilot-Standard: Arbeitsplatzangebote anlegen, priorisieren und gezielt in belastbare Angebote ueberfuehren." },
    { label: "Deals & Einsaetze", key: "deals_einsaetze", href: "/public/deal_management.html", match: ["/public/deal_management", "/public/offer_detail", "/public/worker-submissions-review", "/public/timesheets", "/public/mitarbeiter", "/public/approvals", "/public/sla_nachweise"], desc: "Pilot-Standard: Deals abschliessen, Besetzungen fuehren, Stundenzettel freigeben und Folgeprozesse sauber halten." },
    { label: "Steuerung", key: "steuerung", href: "/public/executive_dashboard.html", match: ["/public/executive_dashboard", "/public/vendor_pool", "/public/supplier_scorecard", "/public/rate-cards", "/public/spend-analytics", "/public/system-health", "/public/compliance_overview", "/public/admin_panel", "/public/organization", "/public/integrations", "/public/sso_config", "/public/sla_profil", "/public/sla_abo"], desc: "Nachgelagerte Steuerungs- und Ausbauflaeche fuer Lieferantenleistung, Spend, Executive-Sicht und Governance." },
    { label: "\u2753", key: "help", href: "/public/hilfe.html", match: ["/public/hilfe.html", "/public/sla_hilfe"], desc: "FAQ, Anleitungen, Support-Kontakt und Onboarding-Assistent.", isIcon: true }
  ];

  var ROLE_LABELS = {
    agency:  "Zeitarbeitsfirma",
    company: "Unternehmen",
    worker:  "Einsatzkraft",
    admin:   "Admin"
  };

  var PLAN_COLORS = {
    DEMO: "var(--ds-text-secondary,#8d9bba)",
    FREE: "var(--ds-text-secondary,#8d9bba)",
    BASIS: "var(--ds-brand,#4a9eff)",
    PLUS: "var(--ds-success,#34d399)",
    PRO: "var(--ds-accent,#a855f7)",
    ENTERPRISE: "var(--ds-danger,#f43f5e)"
  };

  var RATE_CARD_READ_ROLES = {
    platform_admin: true,
    owner: true,
    admin: true,
    program_manager: true,
    hiring_manager: true,
    supplier_manager: true,
    finance: true,
    viewer: true
  };

  var RATE_CARD_WRITE_ROLES = {
    platform_admin: true,
    owner: true,
    admin: true,
    program_manager: true,
    finance: true
  };

  function brandHomeForUser(me) {
    if (!me || !me.id) return "/";
    if (me.role === "worker") return "/public/einsatzportal-dashboard.html";
    return "/public/enterprise.html";
  }

  /* ── Helpers ───────────────────────────────────────────────── */
  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function isActive(item) {
    var path = location.pathname;
    for (var i = 0; i < item.match.length; i++) {
      if (path.indexOf(item.match[i]) === 0) return true;
    }
    return false;
  }

  function normalizePlan(plan) {
    var p = String(plan || "DEMO").toUpperCase();
    if (p === "FREE") return "DEMO";
    if (p === "ENTERPRISE" || p === "INDIVIDUAL") return "INDIVIDUELL";
    return p;
  }

  function canReadRateCardsForMe(me) {
    var orgRole = String(me && me.org_role || "").trim();
    return !!RATE_CARD_READ_ROLES[orgRole];
  }

  function canWriteRateCardsForMe(me) {
    var orgRole = String(me && me.org_role || "").trim();
    return !!RATE_CARD_WRITE_ROLES[orgRole];
  }

  function resolveRateCardAccess(me) {
    if (window.TC && TC.surfaceAccess && typeof TC.surfaceAccess.resolve === "function") {
      return TC.surfaceAccess.resolve(me, "rate_cards");
    }
    var sharedAccess = me && me.surface_access && me.surface_access.rate_cards;
    if (sharedAccess) {
      return {
        mode: sharedAccess.mode || sharedAccess.state || "locked",
        canRead: sharedAccess.canRead === true,
        canWrite: sharedAccess.canWrite === true,
        reason: sharedAccess.reason || ""
      };
    }
    var plan = normalizePlan(me && me.plan);
    var roleType = String(me && me.role || "").toLowerCase();
    var planAllowed = typeof PlanFeatures !== "undefined"
      ? PlanFeatures.hasFeature(plan, "rate_card_management")
      : (plan === "PRO" || plan === "INDIVIDUELL");

    if (!me) {
      return {
        mode: "locked",
        canRead: false,
        canWrite: false,
        reason: "Preisrahmen sind derzeit nicht verifizierbar."
      };
    }
    if (!planAllowed) {
      return {
        mode: "plan_locked",
        canRead: false,
        canWrite: false,
        reason: "Preisrahmen bleiben in der Steuerungsschicht fuer berechtigte PRO-/Individuell-Zugaenge reserviert."
      };
    }
    if (roleType === "agency") {
      return {
        mode: "org_locked",
        canRead: false,
        canWrite: false,
        reason: "Preisrahmen bleiben in dieser Steuerungsschicht buyer-seitig fuer Unternehmensorganisationen reserviert."
      };
    }
    if (!canReadRateCardsForMe(me)) {
      return {
        mode: "role_locked",
        canRead: false,
        canWrite: false,
        reason: "Preisrahmen bleiben nur fuer leseberechtigte Procurement-/Steuerungsrollen sichtbar."
      };
    }
    if (!canWriteRateCardsForMe(me)) {
      return {
        mode: "read_only",
        canRead: true,
        canWrite: false,
        reason: "Preisrahmen bleiben in Ihrer Sicht lesbar, Veraenderungen erfolgen ueber schreibberechtigte Procurement-Rollen."
      };
    }
    return {
      mode: "full",
      canRead: true,
      canWrite: true,
      reason: ""
    };
  }

  function getSteeringNavDescription(access) {
    if (!access || access.mode === "locked") {
      return "Nachgelagerte Steuerungs- und Ausbauflaeche fuer Lieferantenleistung, Spend, Executive-Sicht und Governance.";
    }
    if (access.mode === "full") {
      return "Nachgelagerte Steuerungs- und Ausbauflaeche fuer Lieferantenleistung, Preisrahmen, Spend, Executive-Sicht und Governance.";
    }
    if (access.mode === "read_only") {
      return "Nachgelagerte Steuerungs- und Ausbauflaeche fuer Lieferantenleistung, Preisrahmen im Lesemodus, Spend, Executive-Sicht und Governance.";
    }
    if (access.mode === "plan_locked" || access.mode === "org_locked" || access.mode === "role_locked") {
      return "Nachgelagerte Steuerungs- und Ausbauflaeche fuer Lieferantenleistung, Spend, Executive-Sicht und Governance. " + access.reason;
    }
    return "Nachgelagerte Steuerungs- und Ausbauflaeche fuer Lieferantenleistung, Spend, Executive-Sicht und Governance.";
  }

  function updateNavLinkDescription(navKey, desc) {
    if (!navKey) return;
    var wrap = document.querySelector('[data-nav-key="' + navKey + '"]');
    if (!wrap) return;
    var tooltip = wrap.querySelector(".tc-nav-tooltip");
    if (!tooltip) return;
    tooltip.textContent = desc || "";
  }

  /* ── Terminologie-Update nach Rollenermittlung (Track C) ───────────────
   * Aktualisiert Nav-Labels rollenabhaengig sobald me.org_type bekannt ist.
   * Benoetigt: terminologyLabels.js (TC.terminology)
   * Quelle: docs/product/TERMINOLOGY_GUIDE.md
   */
  function updateNavLabels(orgType) {
    if (!orgType || !window.TC || !window.TC.terminology) return;
    for (var i = 0; i < NAV_LINKS.length; i++) {
      var item = NAV_LINKS[i];
      if (!item.termKey) continue;
      var label = window.TC.terminology.get(item.termKey, orgType, null);
      if (!label) continue;
      var wrap = document.querySelector('[data-nav-key="' + item.key + '"]');
      if (!wrap) continue;
      var link = wrap.querySelector("a");
      if (link) link.textContent = label;
    }
  }

  function dispatchShellContext(detail) {
    try {
      document.dispatchEvent(new CustomEvent("tc:shell-context", { detail: detail }));
    } catch (_err) {
      return;
    }
  }

  /* ── Lazy-load hubVisibility, wenn von einer Seite nicht explizit eingebunden ─ */
  function ensureHubVisibilityLoaded(cb) {
    if (window.TC && window.TC.hubVisibility && typeof window.TC.hubVisibility.resolveNav === "function") {
      cb();
      return;
    }
    var existing = document.querySelector('script[data-tc-module="hub-visibility"]');
    if (!existing) {
      var s = document.createElement("script");
      s.src = "/public/js/hubVisibility.js";
      s.setAttribute("data-tc-module", "hub-visibility");
      s.onload = cb;
      s.onerror = cb; /* Defensive: NAV bleibt dann unfiltered */
      document.head.appendChild(s);
      return;
    }
    // Existiert bereits, aber noch nicht fertig geladen: nach Mikro-Tick erneut versuchen.
    setTimeout(cb, 0);
  }

  function applyNavVisibility(me) {
    if (!window.TC || !window.TC.hubVisibility || typeof window.TC.hubVisibility.resolveNav !== "function") return;
    var wraps = document.querySelectorAll(".tc-shell-topbar [data-nav-key]");
    wraps.forEach(function (wrap) {
      var key = wrap.getAttribute("data-nav-key");
      if (!key) return;
      var decision = window.TC.hubVisibility.resolveNav(me, key);
      if (decision && decision.visible === false) {
        wrap.style.display = "none";
        wrap.setAttribute("aria-hidden", "true");
        wrap.setAttribute("data-nav-state", "hidden");
      } else {
        wrap.style.display = "";
        wrap.removeAttribute("aria-hidden");
        wrap.removeAttribute("data-nav-state");
      }
    });
  }

  function applyShellContext(me) {
    var access = resolveRateCardAccess(me);
    if (window.TC && window.TC.shell) {
      window.TC.shell.context = { me: me || null, rateCardAccess: access };
    }
    updateNavLinkDescription("steuerung", getSteeringNavDescription(access));
    if (me && me.org_type) {
      updateNavLabels(me.org_type);
      // Marktplatz-Tooltip rollen-aware (Label ist es bereits): Agency bietet Personal an/sucht Arbeitsplaetze;
      // Company sucht Personal/bietet Arbeitsplaetze an. Default-HTML = Company-Sicht (Mehrheitsrolle).
      var _ot = String(me.org_type).toLowerCase();
      updateNavLinkDescription("marktplatz", _ot === "agency"
        ? "Pilot-Standard: Personal anbieten, Arbeitsplatzangebote finden und Vermittlungsreaktionen ohne Medienbruch steuern."
        : "Pilot-Standard: Personal finden, passende Einsaetze und Vermittlungsreaktionen ohne Medienbruch steuern.");
    }
    ensureHubVisibilityLoaded(function () { applyNavVisibility(me); });
    dispatchShellContext({ me: me || null, rateCardAccess: access });
  }

  /* ── Build Topbar HTML ─────────────────────────────────────── */
  function buildTopbar() {
    var h = "";

    /* Zwei-Zeilen-Topbar: Zeile 1 = Brand + Nav-Cluster (Buttons/Glocke/Profil), Zeile 2 = Suche (volle Breite). */
    h += '<nav class="ds-topbar tc-shell-topbar tc-shell-topbar--stacked" data-notif-topbar>';

    /* ── ROW 1: Brand (links) + Hamburger + Nav-Cluster (Links · Glocke · Profil, rechts) ── */
    h += '<div class="tc-shell-topbar__row tc-shell-topbar__row1">';

    /* Brand */
    h += '<a href="/public/enterprise.html" id="tc-shell-brand-link" class="ds-topbar__brand" style="text-decoration:none;color:inherit">';
    h += '<span class="ds-topbar__brand-dot"></span>' + esc(BRAND);
    h += '</a>';

    /* Mobile hamburger button */
    h += '<button class="tc-shell-hamburger" type="button" aria-label="Men\u00fc \u00f6ffnen" aria-expanded="false">';
    h += '<span class="tc-shell-hamburger__bar"></span>';
    h += '<span class="tc-shell-hamburger__bar"></span>';
    h += '<span class="tc-shell-hamburger__bar"></span>';
    h += '</button>';

    /* Nav container */
    h += '<div class="ds-topbar__nav tc-shell-nav">';

    /* Nav links mit Hover-Tooltip-Box */
    for (var i = 0; i < NAV_LINKS.length; i++) {
      var item = NAV_LINKS[i];
      var active = isActive(item);
      var cls = "ds-nav-link" + (active ? " ds-nav-link--active" : "");
      var iconStyle = item.isIcon ? ' style="font-size:16px;text-decoration:none"' : '';
      var navKeyAttr = item.key ? ' data-nav-key="' + item.key + '"' : '';
      h += '<div class="tc-nav-wrap"' + navKeyAttr + '>';
      h += '<a href="' + item.href + '" class="' + cls + '"' + iconStyle + '>' + item.label + '</a>';
      if (item.desc) {
        h += '<div class="tc-nav-tooltip">' + esc(item.desc) + '</div>';
      }
      h += '</div>';
    }

    /* Notification bell with badge */
    h += '<a href="/public/activity.html" class="tc-shell-notif-bell" id="tc-notif-bell" title="Benachrichtigungen" aria-label="Benachrichtigungen" style="position:relative;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;font-size:18px;text-decoration:none;color:var(--ds-text-secondary,#8d9bba);cursor:pointer;flex-shrink:0">';
    h += '\uD83D\uDD14'; /* 🔔 */
    h += '<span id="tc-notif-badge" style="display:none;position:absolute;top:2px;right:2px;min-width:16px;height:16px;border-radius:8px;background:#f43f5e;color:#fff;font-size:10px;font-weight:700;line-height:16px;text-align:center;padding:0 4px">0</span>';
    h += '</a>';

    /* User profile dropdown */
    h += '<div class="tc-shell-user" id="tc-user-profile">';
    h += '<button class="tc-shell-user__btn" id="tc-user-btn" type="button" title="Profil &amp; Konto" aria-label="Profil &amp; Konto" aria-haspopup="true" aria-expanded="false">';
    h += '\uD83D\uDC64'; /* 👤 */
    h += '</button>';
    h += '<div class="tc-shell-user__dropdown" id="tc-user-dropdown" role="menu">';
    h += '<div id="tc-user-dd-content" class="tc-shell-user__loading">Lade Profil\u2026</div>';
    h += '</div>';
    h += '</div>';

    h += '</div>'; /* /nav */
    h += '</div>'; /* /row1 */

    /* ── ROW 2: Globale Suche über volle Breite (eigene Zeile, Command-Bar).
       Nicht im Einsatzportal (Worker-Bereich, Owner-Vorgabe) — dort wird die GANZE Zeile
       weggelassen (kein leerer Hairline-Streifen). OCC/SCC/SOC nutzen diese Shell ohnehin nicht. */
    if (location.pathname.indexOf("einsatzportal") === -1) {
      h += '<div class="tc-shell-topbar__row tc-shell-topbar__row2">';
      h += '<div class="tc-shell-search" role="search">';
      h += '<svg class="tc-shell-search__icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8.5" cy="8.5" r="5.5"></circle><line x1="13" y1="13" x2="18" y2="18"></line></svg>';
      h += '<input id="tc-global-search" class="tc-shell-search__input" type="search" autocomplete="off" spellcheck="false" ' +
           'placeholder="Suchen – Bedarfe, Kapazitäten, Firmen…" ' +
           'aria-label="Plattformweite Suche" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="tc-global-search-panel" />';
      h += '<div id="tc-global-search-panel" class="tc-shell-search__panel" role="listbox" aria-label="Suchergebnisse" hidden></div>';
      h += '</div>';
      h += '</div>'; /* /row2 */
    }

    h += '</nav>';

    return h;
  }

  /* ── User Dropdown Logic ───────────────────────────────────── */
  function initUserDropdown() {
    var wrap = document.getElementById("tc-user-profile");
    var btn  = document.getElementById("tc-user-btn");
    var dd   = document.getElementById("tc-user-dropdown");
    var content = document.getElementById("tc-user-dd-content");
    if (!wrap || !btn || !dd) return;

    var open = false;
    function close() { open = false; dd.classList.remove("tc-shell-user__dropdown--open"); btn.setAttribute("aria-expanded", "false"); }
    function toggle() { open = !open; dd.classList.toggle("tc-shell-user__dropdown--open", open); btn.setAttribute("aria-expanded", String(open)); }

    btn.addEventListener("click", function (e) { e.stopPropagation(); toggle(); });
    document.addEventListener("click", function (e) { if (open && !wrap.contains(e.target)) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) close(); });

    /* Fetch user data — auth guard for enterprise pages */
    var meHeaders = {};
    try {
      if (window.TC && TC.api && typeof TC.api.getActiveOrgId === "function") {
        var storedOrg = TC.api.getActiveOrgId();
        if (storedOrg) meHeaders["X-Org-Id"] = storedOrg;
      }
    } catch (_err) { /* ignore */ }

    fetch("/api/me", { credentials: "include", headers: meHeaders })
      .then(function (r) {
        // 429 = rate-limited, NOT logged out — retry silently
        if (r.status === 429) return { _rateLimited: true };
        return r.ok ? r.json() : null;
      })
      .then(function (me) {
        if (me && me._rateLimited) {
          applyShellContext(null);
          return;
        }
        if (me && window.TC && TC.api && typeof TC.api.setActiveOrgId === "function" && me.active_org_id) {
          TC.api.setActiveOrgId(me.active_org_id);
        }
        var brandLink = document.getElementById("tc-shell-brand-link");
        if (brandLink) brandLink.setAttribute("href", brandHomeForUser(me));
        if (!me) {
          applyShellContext(null);
          // Not logged in → redirect to landing (hard guard)
          var pub = location.pathname;
          var isPublicPage = pub === '/public/about.html' || pub === '/public/pricing.html'
            || pub === '/public/enterprise_anfrage.html'
            || pub.indexOf('/public/legal/') === 0 || pub.indexOf('/public/trust/') === 0
            || pub === '/public/whats-new.html' || pub === '/public/hilfe.html'
            || pub === '/public/api-docs.html';
          if (pub.indexOf('/public/') === 0 && !isPublicPage) {
            location.replace('/');
            return;
          }
          content.innerHTML =
            '<div class="tc-shell-user__empty">Nicht eingeloggt</div>' +
            '<a href="/" class="tc-shell-user__login-link">Zum Login \u2192</a>';
          return;
        }
        // Worker-Guard: Worker gehoeren ins Einsatzportal, nicht in Enterprise-Seiten
        if (me.role === 'worker' && !location.pathname.includes('einsatzportal')) {
          applyShellContext(me);
          location.href = '/public/einsatzportal-dashboard.html';
          return;
        }
        populateUser(btn, content, me);
        applyShellContext(me);
      })
      .catch(function () {
        applyShellContext(null);
        content.innerHTML = '<div class="tc-shell-user__empty">Profil nicht verf\u00fcgbar</div>';
      });
  }

  function populateUser(btn, container, me) {
    /* Update button with user initial */
    var initial = ((me.first_name || "")[0] || (me.email || "?")[0] || "?").toUpperCase();
    btn.textContent = initial;
    btn.classList.add("tc-shell-user__btn--loaded");

    var name = "";
    if (me.first_name || me.last_name) {
      name = ((me.first_name || "") + " " + (me.last_name || "")).trim();
    } else if (me.name) { name = me.name; }

    var email   = me.email || "\u2013";
    var plan    = me.plan || "DEMO";
    if (plan === "FREE") plan = "DEMO";
    var role    = ROLE_LABELS[me.role] || me.role || "\u2013";
    var orgName = me.company_name || me.org_name || "";
    var planClr = PLAN_COLORS[plan] || PLAN_COLORS.DEMO;
    var planLabel = me.plan_display_label || (plan === "INDIVIDUELL" ? "Individueller Tarif" : plan);
    var isPilot = me.pilot && me.pilot.pilot_status === "active";
    var featureBundle = me.feature_bundle || "standard";
    var memberships = Array.isArray(me.memberships) ? me.memberships : [];
    var activeOrgId = me.active_org_id || (memberships[0] && memberships[0].org_id) || null;

    var h = '<div class="tc-shell-user__name">' + esc(name || email) + '</div>';
    if (name) h += '<div class="tc-shell-user__email">' + esc(email) + '</div>';

    // Pilot-Badge
    if (isPilot) {
      h += '<div style="text-align:center;margin-bottom:8px"><span style="display:inline-block;padding:2px 10px;border-radius:4px;background:rgba(57,217,138,.12);color:#39d98a;font-size:11px;font-weight:700">\uD83D\uDE80 Pilotkunde</span></div>';
    }

    h += '<div class="tc-shell-user__meta">';
    h += '<div class="tc-shell-user__row"><span>Rolle</span><span class="ds-fw-700">' + esc(role) + '</span></div>';
    h += '<div class="tc-shell-user__row"><span>Plan</span><span class="ds-fw-700" style="color:' + planClr + '">' + esc(planLabel) + '</span></div>';
    if (featureBundle === "enterprise_full") {
      h += '<div class="tc-shell-user__row"><span>Zugang</span><span class="ds-fw-700" style="color:var(--ds-accent,#7c5cff)">Enterprise</span></div>';
    }
    if (me.individual_tier_auto) {
      var tierLabels = { individuell_s: "S (1\u201330)", individuell_m: "M (31\u2013250)", individuell_l: "L (251\u2013999)", individuell_enterprise: "Enterprise (1000+)" };
      h += '<div class="tc-shell-user__row"><span>Klasse</span><span class="ds-fw-700">' + esc(tierLabels[me.individual_tier_auto] || me.individual_tier_auto) + '</span></div>';
    }
    if (orgName) {
      h += '<div class="tc-shell-user__row"><span>Organisation</span><span class="ds-fw-700 ds-truncate">' + esc(orgName) + '</span></div>';
    }
    var locName = me.location_name || (function() {
      try { return sessionStorage.getItem("tc.activeLocationName"); } catch (_e) { return null; }
    })();
    if (locName) {
      h += '<div class="tc-shell-user__row"><span>Standort</span><span class="ds-fw-700 ds-truncate">' + esc(locName) + '</span></div>';
    }
    if (me.department_name) {
      h += '<div class="tc-shell-user__row"><span>Abteilung</span><span class="ds-fw-700 ds-truncate">' + esc(me.department_name) + '</span></div>';
    }
    h += '</div>';
    if (memberships.length > 1) {
      h += '<div class="tc-shell-user__org-switch">';
      h += '<label class="tc-shell-user__org-label" for="tc-org-switch">Organisation wechseln</label>';
      h += '<select id="tc-org-switch" class="tc-shell-user__org-select" aria-label="Organisation wechseln">';
      for (var i = 0; i < memberships.length; i++) {
        var m = memberships[i];
        var label = m.org_name || m.org_id || "Organisation";
        var selected = activeOrgId && String(m.org_id) === String(activeOrgId);
        h += '<option value="' + esc(m.org_id) + '"' + (selected ? " selected" : "") + '>' + esc(label) + '</option>';
      }
      h += '</select></div>';
    }

    // Standort-Switcher Placeholder (wird nach Laden befüllt, wenn Org mehrere Standorte hat)
    h += '<div id="tc-location-switch-wrap"></div>';

    // Bounty-Status (wird nach Laden ergaenzt)
    h += '<div id="tc-user-bounty" style="margin-top:8px;text-align:center"></div>';

    h += '<div class="tc-shell-user__footer">';
    h += '<a href="/public/sla_profil.html" class="tc-shell-user__profile-link">Profil bearbeiten \u2192</a>';
    h += '</div>';

    // Logout im Dropdown
    h += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--ds-border,rgba(255,255,255,.07))">';
    h += '<button id="tc-logout-btn" type="button" style="width:100%;padding:8px 0;background:none;border:1px solid rgba(255,92,122,.25);border-radius:8px;color:rgba(255,160,140,.9);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">Abmelden</button>';
    h += '</div>';

    container.innerHTML = h;

    var orgSelect = container.querySelector("#tc-org-switch");
    if (orgSelect) {
      var currentOrgId = activeOrgId ? String(activeOrgId) : "";
      orgSelect.addEventListener("change", function () {
        var nextOrgId = String(orgSelect.value || "").trim();
        if (!nextOrgId || nextOrgId === currentOrgId) return;
        orgSelect.disabled = true;
        var restore = function () {
          orgSelect.value = currentOrgId;
          orgSelect.disabled = false;
        };
        var finish = function (resp) {
          try {
            // Org-Wechsel invalidiert Standortkontext — explizit leeren
            if (window.TC && TC.api && typeof TC.api.setActiveLocationId === "function") {
              TC.api.setActiveLocationId(null);
            }
            if (window.TC && TC.api && typeof TC.api.setActiveOrgId === "function") {
              TC.api.setActiveOrgId((resp && resp.active_org_id) || nextOrgId);
            }
          } catch (_err) { /* ignore */ }
          window.location.reload();
        };
        if (window.TC && TC.api && typeof TC.api.post === "function") {
          TC.api.post("/me/active-org", { org_id: nextOrgId })
            .then(finish)
            .catch(restore);
          return;
        }
        fetch("/api/csrf", { credentials: "include" })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) {
            return fetch("/api/me/active-org", {
              method: "POST",
              credentials: "include",
              headers: {
                "Content-Type": "application/json",
                "x-csrf-token": (d && d.token) || ""
              },
              body: JSON.stringify({ org_id: nextOrgId })
            });
          })
          .then(function (r) { return r && r.ok ? r.json() : null; })
          .then(function (resp) { return resp ? finish(resp) : restore(); })
          .catch(restore);
      });
    }

    // Standort-Switcher laden (nur fuer company/admin-Rollen mit Org-Kontext)
    if (activeOrgId && me.role !== "worker") {
      initLocationSwitcher(container, activeOrgId);
    }

    // Bounty-Status laden
    var reputationId = me.id || me.user_id;
    if (!reputationId) return;
    fetch("/api/reputation/" + encodeURIComponent(reputationId) + "/card", { credentials: "include" })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(rep) {
        var el = document.getElementById("tc-user-bounty");
        var card = rep && rep.reputation ? rep.reputation : rep;
        if (!el || !card) return;
        var grade = card.grade || "UNRATED";
        var gradeLabels = { PLATINUM:"Platin", GOLD:"Gold", SILVER:"Silber", BRONZE:"Bronze", UNRATED:"Starter" };
        var gradeColors = { PLATINUM:"#a78bfa", GOLD:"#f59e0b", SILVER:"#94a3b8", BRONZE:"#cd7f32", UNRATED:"#6b7280" };
        var color = gradeColors[grade] || "#6b7280";
        var label = gradeLabels[grade] || grade;
        var score = card.reputation_score != null ? Math.round(card.reputation_score) : null;
        el.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:6px;background:rgba(255,255,255,.04);border:1px solid ' + color + '33;font-size:11px;font-weight:700;color:' + color + '">' + label + (score != null ? ' \u00b7 ' + score + ' Punkte' : '') + '</span>';
      }).catch(function() {});
  }

  /* ── Location Switcher ────────────────────────────────────── */
  function initLocationSwitcher(container, activeOrgId) {
    var wrap = container.querySelector("#tc-location-switch-wrap");
    if (!wrap) return;

    var fetchOpts = { credentials: "include" };
    try {
      if (window.TC && TC.api && typeof TC.api.getActiveOrgId === "function") {
        var orgId = TC.api.getActiveOrgId() || activeOrgId;
        if (orgId) fetchOpts.headers = { "X-Org-Id": orgId };
      }
    } catch (_err) { /* ignore */ }

    fetch("/api/me/active-location", fetchOpts)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !Array.isArray(data.locations) || data.locations.length === 0) return;

        // Sync sessionStorage (locationId + locationName fuer hubVisibility.resolveLocationScope)
        try {
          if (window.TC && TC.api && typeof TC.api.setActiveLocationId === "function") {
            TC.api.setActiveLocationId(data.location_id || null);
          }
          if (data.location_id && data.location_name) {
            try { sessionStorage.setItem("tc.activeLocationName", data.location_name); } catch (_err2) { /* ignore */ }
          } else {
            try { sessionStorage.removeItem("tc.activeLocationName"); } catch (_err2) { /* ignore */ }
          }
        } catch (_err) { /* ignore */ }

        var activeLocId = data.location_id || "";
        var locs = data.locations;
        var h;

        if (locs.length === 1) {
          // Location-bound: Badge, kein Select
          var boundLabel = locs[0].name + (locs[0].is_hq ? " (HQ)" : "") + (locs[0].city ? " · " + locs[0].city : "");
          h = '<div class="tc-shell-user__org-switch">';
          h += '<div class="tc-shell-user__org-label">Standort</div>';
          h += '<div style="font-size:12px;font-weight:600;padding:4px 0">' + esc(boundLabel) + '</div>';
          h += '</div>';
          wrap.innerHTML = h;
          return;
        }

        // Multi-location: Select mit "Alle Standorte" als erste Option
        h = '<div class="tc-shell-user__org-switch">';
        h += '<label class="tc-shell-user__org-label" for="tc-location-switch">Standort wechseln</label>';
        h += '<select id="tc-location-switch" class="tc-shell-user__org-select" aria-label="Standort wechseln">';
        h += '<option value=""' + (!activeLocId ? " selected" : "") + '>Alle Standorte</option>';
        for (var i = 0; i < locs.length; i++) {
          var loc = locs[i];
          var label = loc.name + (loc.is_hq ? " (HQ)" : "") + (loc.city ? " · " + loc.city : "");
          var sel = activeLocId && String(loc.id) === String(activeLocId);
          h += '<option value="' + esc(loc.id) + '"' + (sel ? " selected" : "") + '>' + esc(label) + '</option>';
        }
        h += '</select></div>';
        wrap.innerHTML = h;

        var select = wrap.querySelector("#tc-location-switch");
        if (!select) return;

        select.addEventListener("change", function () {
          var nextLocId = String(select.value || "").trim();
          if (nextLocId === String(activeLocId)) return;
          select.disabled = true;
          var restore = function () { select.value = activeLocId || ""; select.disabled = false; };

          var doSwitch = function () {
            if (window.TC && TC.api && typeof TC.api.post === "function") {
              return TC.api.post("/me/active-location", { location_id: nextLocId || null });
            }
            return fetch("/api/csrf", { credentials: "include" })
              .then(function (r) { return r.ok ? r.json() : null; })
              .then(function (d) {
                return fetch("/api/me/active-location", {
                  method: "POST",
                  credentials: "include",
                  headers: {
                    "Content-Type": "application/json",
                    "x-csrf-token": (d && d.token) || ""
                  },
                  body: JSON.stringify({ location_id: nextLocId || null })
                });
              })
              .then(function (r) { return r && r.ok ? r.json() : Promise.reject(new Error("switch failed")); });
          };

          doSwitch()
            .then(function (resp) {
              try {
                if (window.TC && TC.api && typeof TC.api.setActiveLocationId === "function") {
                  TC.api.setActiveLocationId((resp && resp.location_id) || null);
                }
              } catch (_err) { /* ignore */ }
              window.location.reload();
            })
            .catch(restore);
        });
      })
      .catch(function () { /* non-critical — no location switcher shown */ });
  }

  /* ── Logout Logic ────────────────────────────────────────── */
  function initLogout() {
    // Logout-Button ist jetzt im User-Dropdown (populateUser setzt ihn)
    // Warte kurz bis DOM bereit ist, dann binden
    setTimeout(function() {
      var btn = document.getElementById("tc-logout-btn");
      if (!btn) return;
      btn.addEventListener("click", async function () {
        btn.disabled = true;
        btn.textContent = "Wird abgemeldet\u2026";
        try {
          var cr = await fetch("/api/csrf", { credentials: "include" });
          var cd = await cr.json();
          await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              "x-csrf-token": cd.token || ""
            }
          });
        } catch (e) { /* Ignore — redirect anyway */ }
        window.location.replace("/");
      });
    }, 500);
  }

  /* ── Mobile Menu Logic ─────────────────────────────────────── */
  function initMobileMenu() {
    var hamburger = document.querySelector(".tc-shell-hamburger");
    var nav = document.querySelector(".tc-shell-nav");
    if (!hamburger || !nav) return;

    hamburger.addEventListener("click", function () {
      var expanded = hamburger.getAttribute("aria-expanded") === "true";
      hamburger.setAttribute("aria-expanded", String(!expanded));
      hamburger.classList.toggle("tc-shell-hamburger--open", !expanded);
      nav.classList.toggle("tc-shell-nav--open", !expanded);
    });

    /* Close on nav link click (mobile) */
    nav.addEventListener("click", function (e) {
      if (e.target.classList.contains("ds-nav-link")) {
        hamburger.setAttribute("aria-expanded", "false");
        hamburger.classList.remove("tc-shell-hamburger--open");
        nav.classList.remove("tc-shell-nav--open");
      }
    });
  }

  /* ── Inject Styles ─────────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById("tc-shell-styles")) return;
    var style = document.createElement("style");
    style.id = "tc-shell-styles";
    style.textContent = [
      /* Hamburger — hidden on desktop */
      ".tc-shell-hamburger{display:none;background:none;border:1px solid var(--ds-border,rgba(255,255,255,.1));border-radius:var(--ds-radius-md,8px);padding:6px;cursor:pointer;flex-direction:column;gap:3px;align-items:center;justify-content:center;width:34px;height:34px}",
      ".tc-shell-hamburger__bar{display:block;width:16px;height:2px;background:var(--ds-text-secondary,#8d9bba);border-radius:1px;transition:transform .2s,opacity .2s}",
      ".tc-shell-hamburger--open .tc-shell-hamburger__bar:nth-child(1){transform:translateY(5px) rotate(45deg)}",
      ".tc-shell-hamburger--open .tc-shell-hamburger__bar:nth-child(2){opacity:0}",
      ".tc-shell-hamburger--open .tc-shell-hamburger__bar:nth-child(3){transform:translateY(-5px) rotate(-45deg)}",

      /* Nav tooltip */
      ".tc-nav-wrap{position:relative;display:inline-flex}",
      ".tc-nav-tooltip{display:none;position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);width:240px;padding:10px 14px;border-radius:10px;background:var(--ds-bg-surface,#1a1d24);border:1px solid var(--ds-border,rgba(255,255,255,.12));box-shadow:0 8px 24px rgba(0,0,0,.45);font-size:12px;line-height:1.5;color:var(--ds-text-secondary,#8d9bba);z-index:9998;pointer-events:none;white-space:normal}",
      ".tc-nav-wrap:hover .tc-nav-tooltip{display:block}",
      ".tc-nav-tooltip::before{content:'';position:absolute;top:-6px;left:50%;transform:translateX(-50%);width:12px;height:6px;background:inherit;clip-path:polygon(50% 0%,0% 100%,100% 100%)}",

      /* User dropdown */
      ".tc-shell-user{position:relative;display:inline-flex;align-items:center;margin-left:var(--ds-space-1,4px)}",
      ".tc-shell-user__btn{width:34px;height:34px;border-radius:50%;border:1.5px solid var(--ds-brand-ring,rgba(74,158,255,.35));background:var(--ds-brand-muted,rgba(74,158,255,.12));color:var(--ds-brand,#4a9eff);font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:border-color .15s,background .15s,box-shadow .15s}",
      ".tc-shell-user__btn:hover{border-color:var(--ds-brand,#4a9eff);box-shadow:0 0 0 3px var(--ds-brand-muted,rgba(74,158,255,.12))}",
      ".tc-shell-user__btn--loaded{font-size:14px}",
      ".tc-shell-user__dropdown{display:none;position:absolute;top:calc(100% + 10px);right:0;width:260px;border:1px solid var(--ds-border,rgba(255,255,255,.12));border-radius:14px;background:var(--ds-bg-surface,var(--card,#1a1d24));box-shadow:0 8px 32px rgba(0,0,0,.55);z-index:9999;padding:var(--ds-space-4,16px)}",
      ".tc-shell-user__dropdown--open{display:block}",
      ".tc-shell-user__loading{text-align:center;color:var(--ds-text-secondary,#8d9bba);font-size:13px;padding:var(--ds-space-2,8px) 0}",
      ".tc-shell-user__empty{font-size:13px;color:var(--ds-text-secondary,#8d9bba);padding:var(--ds-space-1,4px) 0;text-align:center}",
      ".tc-shell-user__login-link{display:block;margin-top:var(--ds-space-2,8px);font-size:12px;color:var(--ds-brand,#4a9eff);font-weight:600;text-decoration:none;text-align:center}",
      ".tc-shell-user__login-link:hover{text-decoration:underline}",
      ".tc-shell-user__name{font-size:15px;font-weight:700;margin-bottom:2px;text-align:center}",
      ".tc-shell-user__email{font-size:12px;color:var(--ds-text-secondary,#8d9bba);margin-bottom:var(--ds-space-3,12px);text-align:center}",
      ".tc-shell-user__meta{display:flex;flex-direction:column;gap:var(--ds-space-2,8px);font-size:12px}",
      ".tc-shell-user__row{display:flex;justify-content:space-between;gap:var(--ds-space-2,8px)}",
      ".tc-shell-user__row>span:first-child{color:var(--ds-text-secondary,#8d9bba);flex-shrink:0}",
      ".tc-shell-user__row>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}",
      ".tc-shell-user__org-switch{margin-top:10px;padding:10px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid var(--ds-border,rgba(255,255,255,.08))}",
      ".tc-shell-user__org-label{display:block;font-size:11px;color:var(--ds-text-secondary,#8d9bba);margin-bottom:6px}",
      ".tc-shell-user__org-select{width:100%;background:var(--ds-bg-surface,var(--card,#1a1d24));color:var(--ds-text,#fff);border:1px solid var(--ds-border,rgba(255,255,255,.12));border-radius:8px;padding:6px 8px;font-size:12px;font-family:inherit}",
      ".tc-shell-user__org-select:disabled{opacity:.6;cursor:not-allowed}",
      ".tc-shell-user__footer{margin-top:14px;padding-top:10px;border-top:1px solid var(--ds-border,rgba(255,255,255,.07));text-align:center}",
      ".tc-shell-user__profile-link{font-size:12px;color:var(--ds-brand,#4a9eff);font-weight:600;text-decoration:none}",
      ".tc-shell-user__profile-link:hover{text-decoration:underline}",

      /* Logout button */
      ".tc-shell-logout{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;font-size:11px;font-weight:700;letter-spacing:.03em;border-radius:8px;border:1px solid rgba(255,92,122,.3);background:rgba(255,92,122,.07);color:rgba(255,160,140,.9);cursor:pointer;font-family:inherit;transition:background .15s,border-color .15s;white-space:nowrap;flex-shrink:0;line-height:1.4}",
      ".tc-shell-logout:hover{background:rgba(255,92,122,.18);border-color:rgba(255,92,122,.55);color:#ffb0a0}",

      /* Global Search */
      ".tc-shell-search{position:relative;display:flex;align-items:center;gap:8px;flex:0 1 360px;max-width:360px;min-width:150px;height:38px;margin:0 auto 0 18px;padding:0 12px;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid var(--ds-border,rgba(255,255,255,.14));transition:border-color .15s,background .15s,box-shadow .15s}",
      ".tc-shell-search:focus-within{border-color:var(--ds-brand,#4a9eff);background:rgba(255,255,255,.08);box-shadow:0 8px 26px rgba(0,0,0,.28)}",
      ".tc-shell-search__icon{flex-shrink:0;color:var(--ds-text-secondary,#8d9bba)}",
      ".tc-shell-search:focus-within .tc-shell-search__icon{color:var(--ds-brand,#4a9eff)}",
      ".tc-shell-search__input{flex:1;min-width:0;height:100%;border:0;outline:0;background:transparent;color:var(--ds-text,#fff);font-size:13px;font-family:inherit}",
      ".tc-shell-search__input::placeholder{color:var(--ds-text-secondary,#8d9bba)}",
      ".tc-shell-search__input::-webkit-search-cancel-button{-webkit-appearance:none}",
      ".tc-shell-search__panel{position:absolute;top:calc(100% + 8px);left:0;right:0;z-index:9999;max-height:min(70vh,460px);overflow-y:auto;padding:6px;border-radius:12px;background:var(--ds-bg-surface,#1a1d24);border:1px solid var(--ds-border,rgba(255,255,255,.12));box-shadow:0 16px 48px rgba(0,0,0,.45)}",
      ".tc-shell-search__panel[hidden]{display:none}",
      ".tc-shell-search__group-label{padding:9px 10px 4px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--ds-text-secondary,#8d9bba)}",
      ".tc-shell-search__opt{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;text-decoration:none;color:inherit;cursor:pointer}",
      ".tc-shell-search__opt:hover,.tc-shell-search__opt--active{background:var(--ds-brand-muted,rgba(255,255,255,.07))}",
      ".tc-shell-search__opt--static{cursor:default}",
      ".tc-shell-search__opt--static:hover{background:transparent}",
      ".tc-shell-search__opt-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}",
      ".tc-shell-search__opt-title{font-size:13px;font-weight:600;color:var(--ds-text,#fff);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".tc-shell-search__opt-sub{font-size:11px;color:var(--ds-text-secondary,#8d9bba);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".tc-shell-search__badge{flex-shrink:0;font-size:10px;font-weight:700;letter-spacing:.02em;padding:2px 8px;border-radius:999px;background:var(--ds-brand-muted,rgba(255,255,255,.09));color:var(--ds-text-secondary,#8d9bba)}",
      ".tc-shell-search__state{padding:16px 12px;font-size:12px;color:var(--ds-text-secondary,#8d9bba);text-align:center}",
      ".tc-shell-search__foot{margin-top:4px;padding:8px 10px;border-top:1px solid var(--ds-border,rgba(255,255,255,.08));font-size:11px;color:var(--ds-text-secondary,#8d9bba);display:flex;justify-content:space-between;align-items:center;gap:8px}",
      ".tc-shell-search__foot a{color:var(--ds-text-secondary,#8d9bba);text-decoration:none;font-weight:600}",
      ".tc-shell-search__foot a:hover{color:var(--ds-text,#fff);text-decoration:underline}",
      ".tc-shell-search__opt-ic{flex-shrink:0;color:var(--ds-text-secondary,#8d9bba)}",

      /* Zwei-Zeilen-Topbar (Command-Bar) — Zeile 1 Brand+Nav, Zeile 2 Suche volle Breite */
      ".tc-shell-topbar--stacked{flex-direction:column;align-items:stretch;justify-content:flex-start;gap:var(--ds-space-3,12px);border-radius:var(--ds-radius-lg,16px);position:relative}",
      ".tc-shell-topbar--stacked .tc-shell-topbar__row{display:flex;align-items:center;width:100%;min-width:0}",
      ".tc-shell-topbar--stacked .tc-shell-topbar__row1{justify-content:space-between;gap:var(--ds-space-3,12px)}",
      ".tc-shell-topbar--stacked .tc-shell-topbar__row1 .tc-shell-nav{flex:0 0 auto;justify-content:flex-end;margin-left:auto}",
      ".tc-shell-topbar--stacked .tc-shell-topbar__row2{padding-top:var(--ds-space-2,8px);border-top:1px solid var(--ds-border,rgba(255,255,255,.08))}",
      ".tc-shell-topbar--stacked .tc-shell-topbar__row2:empty{display:none;border-top:0;padding-top:0}",
      ".tc-shell-topbar--stacked .tc-shell-topbar__row2 .tc-shell-search{flex:1 1 auto;width:100%;max-width:none;min-width:0;height:42px;margin:0;padding:0 14px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid var(--ds-border,rgba(255,255,255,.14))}",
      ".tc-shell-topbar--stacked .tc-shell-topbar__row2 .tc-shell-search:focus-within{border-color:var(--ds-brand,#4a9eff);background:rgba(255,255,255,.09);box-shadow:0 10px 30px rgba(0,0,0,.30)}",
      ".tc-shell-topbar--stacked .tc-shell-topbar__row2 .tc-shell-search__panel{top:calc(100% + 8px);left:0;right:0}",

      /* Mobile responsive */
      "@media(max-width:768px){" +
        ".tc-shell-hamburger{display:flex}" +
        ".tc-shell-nav{display:none;position:absolute;top:calc(100% + var(--ds-space-2,8px));left:0;right:0;flex-direction:column;gap:var(--ds-space-1,4px);padding:var(--ds-space-3,12px);border:1px solid var(--ds-border,rgba(255,255,255,.1));border-radius:var(--ds-radius-lg,12px);background:var(--ds-bg-surface,var(--card,#1a1d24));box-shadow:0 12px 40px rgba(0,0,0,.5);z-index:9998}" +
        ".tc-shell-nav--open{display:flex}" +
        ".tc-shell-topbar{position:relative}" +
        ".tc-shell-user{margin-left:0;width:100%}" +
        ".tc-shell-user__btn{margin-right:auto}" +
        ".tc-shell-logout{width:100%;justify-content:center;padding:8px 10px}" +
        ".tc-shell-search{flex:1 1 auto;max-width:none;min-width:0;margin:0 8px}" +
        ".tc-shell-topbar--stacked{gap:var(--ds-space-2,8px)}" +
        ".tc-shell-topbar--stacked .tc-shell-topbar__row1{gap:var(--ds-space-2,8px)}" +
        ".tc-shell-topbar--stacked .tc-shell-topbar__row2{padding-top:var(--ds-space-2,8px)}" +
        ".tc-shell-topbar--stacked .tc-shell-nav{top:calc(100% + var(--ds-space-2,8px))}" +
        ".tc-shell-topbar--stacked .tc-shell-topbar__row2 .tc-shell-search{margin:0}" +
      "}"
    ].join("\n");
    document.head.appendChild(style);
  }

  /* ── Public API ────────────────────────────────────────────── */
  TC.shell = {
    context: { me: null, rateCardAccess: resolveRateCardAccess(null) },
    normalizePlan: normalizePlan,
    resolveRateCardAccess: resolveRateCardAccess,
    getSteeringNavDescription: getSteeringNavDescription,
    /**
     * Initialize the page shell.
     * @param {Object} [opts] — Optional overrides.
     * @param {string} [opts.target] — Selector for the shell container (default: "#tc-shell").
     * @param {Array}  [opts.extraNav] — Additional nav items [{label, href, match[]}].
     */
    init: function (opts) {
      opts = opts || {};
      var selector = opts.target || "#tc-shell";
      var container = document.querySelector(selector);
      if (!container) return;

      /* Merge extra nav items if provided */
      if (opts.extraNav && opts.extraNav.length) {
        for (var i = 0; i < opts.extraNav.length; i++) {
          NAV_LINKS.splice(NAV_LINKS.length - 1, 0, opts.extraNav[i]); /* before help icon */
        }
      }

      injectStyles();

      /* ── Skip-to-main link (Keyboard / Screen Reader) ─────────────
       * Injected once at the very start of <body> — visually hidden
       * until focused (Tab key). Gives keyboard users a way to bypass
       * the navigation and jump to the page content directly.
       */
      if (!document.getElementById("tc-skip-main")) {
        var skipLink = document.createElement("a");
        skipLink.id = "tc-skip-main";
        skipLink.href = "#tc-main-content";
        skipLink.textContent = "Zum Hauptinhalt springen";
        skipLink.className = "tc-skip-link";
        document.body.insertBefore(skipLink, document.body.firstChild);

        /* Add skip-link styles once */
        var skipStyle = document.createElement("style");
        skipStyle.id = "tc-skip-link-styles";
        skipStyle.textContent = ".tc-skip-link{position:absolute;top:-100%;left:var(--ds-space-3,12px);z-index:99999;padding:8px 16px;border-radius:var(--ds-radius-md,8px);background:var(--ds-brand,#4a9eff);color:#fff;font-size:14px;font-weight:700;text-decoration:none;white-space:nowrap;transition:top .15s}.tc-skip-link:focus{top:var(--ds-space-3,12px)}";
        document.head.appendChild(skipStyle);

        /* Mark first main-content div (ds-wrap) as landmark if present */
        var mainWrap = document.querySelector(".ds-wrap:not(#tc-shell .ds-wrap)");
        if (!mainWrap) mainWrap = document.querySelector(".ds-wrap");
        if (mainWrap && !mainWrap.id) {
          mainWrap.id = "tc-main-content";
          if (!mainWrap.getAttribute("role")) mainWrap.setAttribute("role", "main");
        } else if (mainWrap && mainWrap.id && !mainWrap.getAttribute("role")) {
          mainWrap.setAttribute("role", "main");
        }
      }

      container.innerHTML = buildTopbar();
      if (window.TC && TC.theme && typeof TC.theme.mountIntoNav === "function") {
        var shellNav = container.querySelector(".ds-topbar__nav");
        if (shellNav) TC.theme.mountIntoNav(shellNav);
      }
      initUserDropdown();
      initLogout();
      initMobileMenu();
      initNotificationStream();
      initGlobalSearch();
    },

    /** Programmatically close all dropdowns. */
    closeAll: function () {
      var dd = document.getElementById("tc-user-dropdown");
      if (dd) dd.classList.remove("tc-shell-user__dropdown--open");
      var nav = document.querySelector(".tc-shell-nav");
      var ham = document.querySelector(".tc-shell-hamburger");
      if (nav) nav.classList.remove("tc-shell-nav--open");
      if (ham) { ham.classList.remove("tc-shell-hamburger--open"); ham.setAttribute("aria-expanded", "false"); }
    }
  };

  /* ── Notification Stream (SSE + polling fallback) ──────────── */
  function initNotificationStream() {
    var badge = document.getElementById("tc-notif-badge");
    if (!badge) return;

    function updateBadge(count) {
      if (count > 0) {
        badge.textContent = count > 99 ? "99+" : String(count);
        badge.style.display = "inline-block";
      } else {
        badge.style.display = "none";
      }
    }

    // Initial fetch of unread count
    fetch("/api/notifications/unread-count", { credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) updateBadge(d.count || 0); })
      .catch(function () {});

    // SSE live stream (graceful: falls back to polling if SSE unavailable)
    if (typeof EventSource !== "undefined") {
      try {
        var es = new EventSource("/api/notifications/stream", { withCredentials: true });
        var sseErrorCount = 0;
        es.addEventListener("notification", function (e) {
          try {
            var notif = JSON.parse(e.data);
            var current = parseInt(badge.textContent, 10) || 0;
            updateBadge(current + 1);
            if (notif.title && window.TC && window.TC.toast) {
              window.TC.toast(notif.title, "info");
            }
          } catch (_) { /* parse error — ignore */ }
        });
        es.addEventListener("connected", function () { sseErrorCount = 0; });
        es.onerror = function () {
          sseErrorCount++;
          // Nach 3 Fehlern: SSE aufgeben, sauberer Fallback auf Polling
          if (sseErrorCount >= 3) {
            es.close();
            startPolling();
          }
        };
      } catch (_) {
        startPolling();
      }
    } else {
      startPolling();
    }

    function startPolling() {
      setInterval(function () {
        fetch("/api/notifications/unread-count", { credentials: "include" })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { if (d) updateBadge(d.count || 0); })
          .catch(function () {});
      }, 30000); // Poll every 30 seconds
    }
  }

  /* ── Global Search (plattformweit, RBAC-/sichtbarkeits-gefiltert serverseitig) ──
   * Topbar-Suchfeld -> GET /api/search?type=all. Ergebnisse nach Domain gruppiert,
   * mit Deep-Links auf das konkrete Ziel (keine Sackgassen). Companies sind ein
   * org-id-Verzeichnis, die Public-Profile-Seite ist aber user-id-basiert -> bewusst
   * NICHT verlinkt (statische Info-Zeile) statt eines toten Links. Debounce + Abort-
   * via-Sequenz + Tastaturnavigation + Lade-/Leer-/Fehlerzustand. */
  function initGlobalSearch() {
    var input = document.getElementById("tc-global-search");
    var panel = document.getElementById("tc-global-search-panel");
    if (!input || !panel) return; // im Einsatzportal nicht gerendert

    var timer = null, lastQ = "", reqSeq = 0, activeIdx = -1, options = [];

    var DOMAIN = {
      requisitions:   { label: "Eigene Bedarfe",            badge: "Bedarf",     href: function (r) { return "/public/requisitions.html?focus_id=" + encodeURIComponent(r.id); } },
      capacity_posts: { label: "Marktplatz · Kapazitäten", badge: "Kapazität", href: function (r) { return "/public/capacity_exchange_detail.html?id=" + encodeURIComponent(r.id) + "&type=supply"; } },
      companies:      { label: "Firmenverzeichnis",         badge: "Firma",      href: null }
    };
    var ORDER = ["requisitions", "capacity_posts", "companies"];

    /* ── Schnellzugriff / Intents: natürliche Begriffe → richtige Seite (rollenbasiert).
     * Macht die Suche zur #1-Navigation: "arbeiter einstellen", "stundenzettel", "notdienst" …
     * org-spezifisch (it.org) + RBAC über hubVisibility.resolveNav(me, it.key). Nur echte Nav-Ziele. */
    var INTENTS = [
      { label: "Personal finden", sub: "Marktplatz · Kapazitäten & Vermittlung", href: "/public/capacity_exchange_feed.html", key: "marktplatz", org: "company",
        t: ["personal finden","personal suchen","arbeiter finden","arbeiter suchen","arbeiter einstellen","mitarbeiter suchen","mitarbeiter finden","mitarbeiter einstellen","kraefte finden","fachkraefte","aushilfe","springer","leiharbeiter","zeitarbeiter","leihpersonal","pflegekraft","personal anheuern","leute suchen","kapazitaet finden","besetzen","personalsuche","arbeitskraft"] },
      { label: "Personalsuche (gezielt)", sub: "Kapazitäten gezielt durchsuchen", href: "/public/capacity_search.html", key: "marktplatz", org: "company",
        t: ["gezielte suche","kapazitaet suchen","skills suchen","qualifikation suchen","verfuegbare kraefte","nach skill"] },
      { label: "Personal anbieten", sub: "Marktplatz · eigene Kapazitäten einstellen", href: "/public/angebote_verwalten.html", key: "marktplatz", org: "agency",
        t: ["personal anbieten","mitarbeiter anbieten","kapazitaet anbieten","kapazitaet einstellen","verfuegbarkeit melden","leute anbieten","angebot einstellen","personal vermitteln"] },
      { label: "Anfragen-Eingang", sub: "Eingehende Vermittlungsanfragen", href: "/public/agency_inbox.html", key: "marktplatz", org: "agency",
        t: ["anfragen","eingang","posteingang","arbeitsplatzangebote finden","einsaetze finden","auftraege finden","vermittlungen"] },
      { label: "Arbeitsplatzangebote", sub: "Bedarfe anlegen & verwalten", href: "/public/requisitions.html", key: "bedarfe",
        t: ["bedarf","bedarfe","anfrage","arbeitsplatzangebot","stellenanzeige","stelle ausschreiben","personalbedarf","auftrag anlegen","bedarf melden","ausschreibung"] },
      { label: "Bedarf anlegen", sub: "Neuen Personalbedarf erstellen", href: "/public/demand_create.html", key: "bedarfe", org: "company",
        t: ["bedarf anlegen","bedarf erstellen","neue anfrage","stelle anlegen","arbeitsplatz anbieten","personal anfragen","auftrag erstellen"] },
      { label: "Deals & Einsätze", sub: "Besetzungen führen & abschließen", href: "/public/deal_management.html", key: "deals_einsaetze",
        t: ["deal","deals","einsatz","einsaetze","besetzung","vermittlung abschliessen","angebot annehmen","abschluss","auftrag fuehren"] },
      { label: "Stundenzettel", sub: "Zeiterfassung & Freigaben", href: "/public/timesheets.html", key: "deals_einsaetze",
        t: ["stundenzettel","zeiterfassung","stunden erfassen","arbeitszeit","stunden freigeben","timesheet","zeiten","arbeitsstunden","stundennachweis"] },
      { label: "Mitarbeiter", sub: "Besetzte Einsätze & Personen", href: "/public/mitarbeiter.html", key: "deals_einsaetze",
        t: ["mitarbeiter verwalten","personal verwalten","wer arbeitet","besetzte stellen","personenuebersicht","belegschaft"] },
      { label: "Notdienst-Personal", sub: "Kurzfristigen Personalausfall decken", href: "/public/capacity_exchange_feed.html", key: "marktplatz", org: "company",
        t: ["notdienst","notfall","dringend personal","kurzfristig personal","sofort personal","ausfall ersetzen","krankheitsausfall","schnell personal","akut","spontan personal","ersatz finden","kurzfristig"] },
      { label: "Bewertungen", sub: "Lieferanten-Scorecards", href: "/public/supplier_scorecard.html", key: "steuerung",
        t: ["bewertung","bewertungen","scorecard","lieferantenbewertung","rating","leistung bewerten","qualitaet"] },
      { label: "Konditionen / Preise", sub: "Rate Cards & Stundensätze", href: "/public/rate-cards.html", key: "steuerung",
        t: ["preise","konditionen","rate card","ratecard","stundensatz","tarife","preisliste","kosten je stunde"] },
      { label: "Auswertungen", sub: "Spend, KPIs & Executive-Sicht", href: "/public/spend-analytics.html", key: "steuerung",
        t: ["ausgaben","spend","kosten","budget","auswertung","analyse","reporting","statistik","zahlen","kennzahlen","kpi"] },
      { label: "Lieferanten / Pool", sub: "Vendor-Verzeichnis", href: "/public/vendor_pool.html", key: "steuerung",
        t: ["firma","firmen","verzeichnis","lieferanten","anbieter","vendor","partner","pool","dienstleister"] },
      { label: "Organisation & Team", sub: "Stammdaten, Nutzer, Standorte", href: "/public/organization.html", key: "steuerung",
        t: ["einstellungen","konto","profil","organisation","team","nutzer verwalten","stammdaten","benutzer","standorte","mitarbeiter einladen"] },
      { label: "Integrationen", sub: "SAP, DATEV, API, Webhooks", href: "/public/integrations.html", key: "steuerung",
        t: ["integration","schnittstelle","sap","datev","api","webhook","export","anbindung","lohn","buchhaltung anbinden"] },
      { label: "Single Sign-On", sub: "SSO / SAML einrichten", href: "/public/sso_config.html", key: "steuerung",
        t: ["sso","saml","single sign on","anmeldung einrichten","login einrichten","identity"] },
      { label: "Übersicht", sub: "Start & nächste Schritte", href: "/public/enterprise.html", key: "uebersicht",
        t: ["uebersicht","start","startseite","home","dashboard","cockpit"] },
      { label: "Hilfe & Support", sub: "FAQ, Anleitungen, Kontakt", href: "/public/hilfe.html", key: "help",
        t: ["hilfe","support","anleitung","faq","kontakt","frage","problem","wie geht"] }
    ];
    function normSearch(s) {
      return String(s || "").toLowerCase()
        .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
        .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    }
    function matchIntents(q) {
      var nq = normSearch(q); if (nq.length < 2) return [];
      var qToks = nq.split(" ").filter(Boolean);
      var ctx = (window.TC && TC.shell && TC.shell.context) || {};
      var me = ctx.me || null;
      var ot = me && me.org_type ? String(me.org_type).toLowerCase() : "";
      var hv = (window.TC && TC.hubVisibility && typeof TC.hubVisibility.resolveNav === "function") ? TC.hubVisibility.resolveNav : null;
      var scored = [];
      INTENTS.forEach(function (it) {
        if (it.org && ot && it.org !== ot) return;                 // org-spezifischer Intent
        if (it.key && hv) { try { var d = hv(me, it.key); if (d && d.visible === false) return; } catch (e) { /* fail-open */ } }
        var best = 0;
        for (var i = 0; i < it.t.length; i++) {
          var nt = normSearch(it.t[i]);
          if (nt === nq) { best = 100; break; }
          if (nt.indexOf(nq) >= 0 || nq.indexOf(nt) >= 0) { best = Math.max(best, 65); continue; }
          var tToks = nt.split(" "), ov = 0;
          for (var j = 0; j < qToks.length; j++) {
            var x = qToks[j];
            for (var k = 0; k < tToks.length; k++) { if (tToks[k] === x || (x.length >= 3 && tToks[k].indexOf(x) === 0)) { ov++; break; } }
          }
          if (ov > 0) best = Math.max(best, 25 + ov * 10);
        }
        if (best > 0) scored.push({ s: best, it: it });
      });
      scored.sort(function (a, b) { return b.s - a.s; });
      return scored.slice(0, 5).map(function (x) { return x.it; });
    }
    function renderIntents(intents) {
      if (!intents || !intents.length) return "";
      var h = '<div class="tc-shell-search__group-label">Schnellzugriff</div>';
      intents.forEach(function (it) {
        h += '<a class="tc-shell-search__opt" role="option" href="' + esc(it.href) + '">' +
               '<span class="tc-shell-search__opt-main">' +
                 '<span class="tc-shell-search__opt-title">' + esc(it.label) + '</span>' +
                 (it.sub ? '<span class="tc-shell-search__opt-sub">' + esc(it.sub) + '</span>' : '') +
               '</span>' +
               '<span class="tc-shell-search__badge">Aktion</span>' +
             '</a>';
      });
      return h;
    }

    function close() {
      panel.hidden = true; panel.innerHTML = "";
      input.setAttribute("aria-expanded", "false");
      activeIdx = -1; options = [];
    }
    function openPanel(html) {
      panel.innerHTML = html; panel.hidden = false;
      input.setAttribute("aria-expanded", "true");
      options = Array.prototype.slice.call(panel.querySelectorAll(".tc-shell-search__opt[href],.tc-shell-search__opt[data-recent]"));
      activeIdx = -1;
    }
    function attrEsc(s) { return esc(s).replace(/"/g, "&quot;"); }
    function setActive(idx) {
      if (!options.length) return;
      if (activeIdx >= 0 && options[activeIdx]) options[activeIdx].classList.remove("tc-shell-search__opt--active");
      activeIdx = (idx + options.length) % options.length;
      options[activeIdx].classList.add("tc-shell-search__opt--active");
      options[activeIdx].scrollIntoView({ block: "nearest" });
    }

    function render(q, payload, intents) {
      var data = (payload && payload.data) || payload || {};
      if (data.flagged) {
        openPanel('<div class="tc-shell-search__state">Diese Suchanfrage ist nicht zulässig und wurde zur Prüfung gemeldet.</div>');
        return;
      }
      var intentsHtml = renderIntents(intents);
      var results = data.results || [];
      if (!results.length) {
        // Auch ohne Daten-Treffer bleibt die Suche nützlich: Schnellzugriff zeigen, wenn vorhanden.
        if (intentsHtml) {
          openPanel(intentsHtml + '<div class="tc-shell-search__state">Keine weiteren Treffer für „' + esc(q) + '“</div>');
        } else {
          openPanel('<div class="tc-shell-search__state">Keine Treffer für „' + esc(q) + '“</div>');
        }
        return;
      }
      var groups = {};
      results.forEach(function (r) { var k = r._index || "andere"; (groups[k] = groups[k] || []).push(r); });
      var html = intentsHtml;
      ORDER.forEach(function (key) {
        var items = groups[key]; if (!items || !items.length) return;
        var cfg = DOMAIN[key] || { label: key, badge: key, href: null };
        html += '<div class="tc-shell-search__group-label">' + esc(cfg.label) + "</div>";
        items.forEach(function (r) {
          var title = r.title || r.company_name || r.name || r.role || "Unbenannt";
          var subParts = [];
          if (r.role && r.role !== title) subParts.push(r.role);
          if (r.location_city) subParts.push(r.location_city);
          var sub = subParts.join(" · ");
          var inner = '<span class="tc-shell-search__opt-main">' +
                        '<span class="tc-shell-search__opt-title">' + esc(title) + "</span>" +
                        (sub ? '<span class="tc-shell-search__opt-sub">' + esc(sub) + "</span>" : "") +
                      "</span>" +
                      '<span class="tc-shell-search__badge">' + esc(cfg.badge) + "</span>";
          if (cfg.href) {
            html += '<a class="tc-shell-search__opt" role="option" href="' + esc(cfg.href(r)) + '">' + inner + "</a>";
          } else {
            html += '<div class="tc-shell-search__opt tc-shell-search__opt--static" role="option" aria-disabled="true">' + inner + "</div>";
          }
        });
      });
      var total = data.total != null ? data.total : results.length;
      html += '<div class="tc-shell-search__foot"><span>' + esc(String(total)) + " Treffer</span><span>↑↓ wählen · ↵ öffnen · Esc schließt</span></div>";
      openPanel(html);
    }

    function run(q) {
      var seq = ++reqSeq;
      var intents = matchIntents(q);
      // Schnellzugriff sofort (synchron) zeigen; Daten-Treffer laden parallel.
      openPanel(renderIntents(intents) + '<div class="tc-shell-search__state">Suche läuft…</div>');
      fetch("/api/search?type=all&limit=8&q=" + encodeURIComponent(q), { credentials: "include" })
        .then(function (r) {
          if (!r.ok) throw new Error(r.status === 401 ? "Bitte anmelden, um zu suchen" : "Suche nicht verfügbar (" + r.status + ")");
          return r.json();
        })
        .then(function (payload) { if (seq === reqSeq) render(q, payload, intents); })
        .catch(function (e) {
          if (seq !== reqSeq) return;
          // Schnellzugriff bleibt nutzbar, auch wenn die Daten-Suche fehlschlägt (401/offline).
          openPanel(renderIntents(intents) + '<div class="tc-shell-search__state">' + esc(e.message || "Suche fehlgeschlagen") + "</div>");
        });
    }

    input.addEventListener("input", function () {
      var q = input.value.trim();
      if (timer) clearTimeout(timer);
      if (q.length < 2) { lastQ = ""; if (q.length === 0) loadRecent(); else close(); return; }
      if (q === lastQ) return;
      lastQ = q;
      timer = setTimeout(function () { run(q); }, 250);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { close(); input.blur(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); if (panel.hidden && lastQ) run(lastQ); else setActive(activeIdx + 1); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive(activeIdx - 1); return; }
      if (e.key === "Enter" && activeIdx >= 0 && options[activeIdx]) {
        e.preventDefault();
        var el = options[activeIdx];
        if (el.getAttribute("href")) window.location.href = el.getAttribute("href");
        else if (el.getAttribute("data-recent")) applyRecentQuery(el.getAttribute("data-recent"));
      }
    });
    input.addEventListener("focus", function () {
      var q = input.value.trim();
      if (q.length >= 2) { if (panel.hidden) { lastQ = q; run(q); } }
      else if (panel.hidden) { loadRecent(); }
    });
    document.addEventListener("click", function (e) {
      if (!panel.hidden && !e.target.closest(".tc-shell-search")) close();
    });

    // Delegierte Klicks im Panel: Verlaufseintrag erneut suchen / Verlauf loeschen.
    panel.addEventListener("click", function (e) {
      var rec = e.target.closest("[data-recent]");
      if (rec) { applyRecentQuery(rec.getAttribute("data-recent")); return; }
      var clr = e.target.closest("[data-recent-clear]");
      if (clr) { e.preventDefault(); clearRecent(); }
    });

    function applyRecentQuery(q) {
      input.value = q; input.focus();
      lastQ = q; if (timer) clearTimeout(timer); run(q);
    }

    // "Letzte Suchen" beim Fokus auf das leere Feld (eBay-Muster). Soft-fail: kein Verlauf -> Panel zu.
    function loadRecent() {
      var seq = ++reqSeq;
      fetch("/api/search/recent?limit=6", { credentials: "include" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (payload) {
          if (seq !== reqSeq) return;
          var items = (payload && payload.data && payload.data.items) || [];
          if (!items.length) { close(); return; }
          var html = '<div class="tc-shell-search__group-label">Letzte Suchen</div>';
          items.forEach(function (it) {
            html += '<div class="tc-shell-search__opt" role="option" data-recent="' + attrEsc(it.query) + '">' +
                      '<svg class="tc-shell-search__opt-ic" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.2"></circle><path d="M10 5.6V10l3 1.8"></path></svg>' +
                      '<span class="tc-shell-search__opt-main"><span class="tc-shell-search__opt-title">' + esc(it.query) + "</span></span>" +
                      (it.result_count != null ? '<span class="tc-shell-search__badge">' + esc(String(it.result_count)) + "</span>" : "") +
                    "</div>";
          });
          html += '<div class="tc-shell-search__foot"><span>Zuletzt gesucht</span><a href="#" data-recent-clear>Verlauf löschen</a></div>';
          openPanel(html);
        })
        .catch(function () { if (seq === reqSeq) close(); });
    }

    function clearRecent() {
      ensureCsrf().then(function (token) {
        return fetch("/api/search/recent", { method: "DELETE", credentials: "include", headers: token ? { "x-csrf-token": token } : {} });
      }).then(function () { close(); }).catch(function () { close(); });
    }

    var _csrf = null;
    function ensureCsrf() {
      if (_csrf) return Promise.resolve(_csrf);
      return fetch("/api/csrf", { credentials: "include" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { _csrf = d && d.token; return _csrf; })
        .catch(function () { return null; });
    }
  }

  /* ── Auto-init if #tc-shell exists on DOM ready ────────────── */
  function autoInit() {
    if (document.querySelector("#tc-shell")) {
      TC.shell.init();
      if (!document.querySelector('script[data-tc-analytics="1"]')) {
        var s = document.createElement("script");
        s.src = "/public/js/productAnalytics.js";
        s.defer = true;
        s.setAttribute("data-tc-analytics", "1");
        document.head.appendChild(s);
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }
})();
