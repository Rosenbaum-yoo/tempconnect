/**
 * TempConnect Auth Intent Helper
 * ────────────────────────────────────────────────────────
 * Preserves the user's intended action (plan selection, role, destination)
 * across the login/register boundary.
 *
 * Usage:
 *   // Before opening auth modal or redirecting to login:
 *   TC.authIntent.set({ plan: 'PLUS', next: '/public/sla_abo.html' });
 *
 *   // After successful login/register:
 *   var intent = TC.authIntent.consume();
 *   if (intent.next) location.href = intent.next;
 *
 * Storage: sessionStorage (cleared on tab close, survives page reloads)
 * Namespace: TC.authIntent
 */
"use strict";
window.TC = window.TC || {};
window.TC.authIntent = (function () {
  var STORAGE_KEY = "tc.auth_intent";

  /**
   * Store an intent before auth.
   * @param {Object} intent
   * @param {string} [intent.plan]  - Selected plan (DEMO, BASIS, PLUS, PRO, INDIVIDUELL, INDIVIDUELL_PILOT, INDIVIDUELL_DIRECT)
   * @param {string} [intent.role]  - Selected role (company, agency)
   * @param {string} [intent.next]  - URL to navigate to after auth
   * @param {string} [intent.flow]  - Flow identifier (register, upgrade, configure)
   */
  function set(intent) {
    if (!intent || typeof intent !== "object") return;
    intent._ts = Date.now();
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent));
    } catch (_) {
      return;
    }
  }

  /**
   * Read the current intent without clearing it.
   * Returns null if no intent or if expired (>30 min).
   * @returns {Object|null}
   */
  function peek() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var intent = JSON.parse(raw);
      // Expire after 30 minutes
      if (intent._ts && (Date.now() - intent._ts > 30 * 60 * 1000)) {
        clear();
        return null;
      }
      return intent;
    } catch (_) {
      return null;
    }
  }

  /**
   * Read and clear the intent (consume after auth).
   * @returns {Object}  Always returns an object (empty if no intent).
   */
  function consume() {
    var intent = peek() || {};
    clear();
    return intent;
  }

  /** Clear any stored intent. */
  function clear() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      return;
    }
  }

  /**
   * Determine the best post-auth redirect URL based on intent and user data.
   * @param {Object} intent - From consume()
   * @param {Object} [me]   - User data from /api/me (optional)
   * @returns {string} URL to navigate to
   */
  function resolveRedirect(intent, me) {
    // Explicit next URL takes priority
    if (intent.next) return intent.next;

    var plan = (intent.plan || "").toUpperCase();

    // Individual configurator
    if (plan === "INDIVIDUELL" || plan === "INDIVIDUELL_PILOT" || plan === "INDIVIDUELL_DIRECT"
        || plan === "INDIVIDUAL" || plan === "ENTERPRISE") {
      return "/public/enterprise_anfrage.html";
    }

    // Standard plan upgrade/checkout
    if (plan === "BASIS" || plan === "PLUS" || plan === "PRO") {
      return "/public/sla_abo.html?plan=" + encodeURIComponent(plan);
    }

    // Default: Vermittlung als Einstiegspunkt
    return "/public/capacity_exchange_feed.html";
  }

  /**
   * Open the landing auth modal with intent pre-set.
   * Works only on pages that have openAuth() defined (landing.html).
   * @param {string} pane  - 'login' or 'register'
   * @param {Object} [intent] - Intent to store
   */
  function openAuthWithIntent(pane, intent) {
    if (intent) set(intent);
    if (typeof window.openAuth === "function") {
      window.openAuth(pane, intent && intent.role, intent && intent.plan);
    } else {
      // Not on landing page — redirect to landing with intent
      var params = "?auth=" + encodeURIComponent(pane);
      if (intent && intent.plan) params += "&plan=" + encodeURIComponent(intent.plan);
      if (intent && intent.role) params += "&role=" + encodeURIComponent(intent.role);
      location.href = "/" + params;
    }
  }

  /**
   * Navigate to the right place based on auth state.
   * If logged in → go directly. If not → store intent and open auth.
   * @param {Object} opts
   * @param {string} opts.plan  - Plan to select
   * @param {string} [opts.next] - Explicit target after auth
   * @param {string} [opts.role] - Role context
   * @param {boolean} [opts.isLoggedIn] - Current auth state
   */
  function navigateForPlan(opts) {
    var intent = { plan: opts.plan, next: opts.next || null, role: opts.role || null, flow: "plan_select" };

    if (opts.isLoggedIn) {
      // Already logged in — go directly
      location.href = resolveRedirect(intent);
    } else {
      // Not logged in — auth first, then redirect
      openAuthWithIntent("register", intent);
    }
  }

  return {
    set: set,
    peek: peek,
    consume: consume,
    clear: clear,
    resolveRedirect: resolveRedirect,
    openAuthWithIntent: openAuthWithIntent,
    navigateForPlan: navigateForPlan
  };
})();
