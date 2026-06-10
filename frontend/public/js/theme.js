/**
 * TempConnect theme controller — sets html[data-theme] before paint.
 * Platform default is "editorial" (the LEX look), configurable via
 * window.__TC_THEME_FLAGS__.defaultTheme and gated by editorialEnabled; if the configured
 * default is disabled it safely falls back to "dark" (the original product look).
 *
 * Persistence model: only an EXPLICIT user choice (toggle / TC.theme.set) is pinned to
 * localStorage (tempconnect-theme) and marked with tempconnect-theme-explicit. Visitors who
 * never picked a theme always follow the LIVE default, so flipping the default reaches every
 * non-chooser instead of being shadowed by an auto-persisted value from a previous visit.
 * Theme tokens live in design-system.css (+ einsatzportal.css for the worker portal).
 */
(function () {
  "use strict";

  var STORAGE_KEY = "tempconnect-theme";
  var CHOICE_KEY = "tempconnect-theme-explicit";
  var CONFIGURED_DEFAULT = "editorial";
  var FALLBACK_THEME = "dark";

  /**
   * Theme registry. "dark" is the original product look (:root), "light" maps to the
   * [data-theme="light"] block, "ultra_premium" is opt-in (Phase J), "editorial" is the LEX
   * look and the current platform default. An optional global
   * window.__TC_THEME_FLAGS__ = { switcherEnabled, ultraPremiumEnabled, editorialEnabled, defaultTheme }
   * lets the server gate availability and pick the default without editing this file
   * (booleans default to enabled; defaultTheme defaults to "editorial").
   */
  var THEMES = [
    { id: "dark", label: "Dark — Standard" },
    { id: "light", label: "Light" },
    { id: "ultra_premium", label: "Ultra Premium" },
    { id: "editorial", label: "Editorial" }
  ];

  function flags() {
    var f = window.__TC_THEME_FLAGS__ && typeof window.__TC_THEME_FLAGS__ === "object" ? window.__TC_THEME_FLAGS__ : {};
    return {
      switcherEnabled: f.switcherEnabled !== false,
      ultraPremiumEnabled: f.ultraPremiumEnabled !== false,
      editorialEnabled: f.editorialEnabled !== false,
      defaultTheme: typeof f.defaultTheme === "string" && f.defaultTheme ? f.defaultTheme : CONFIGURED_DEFAULT
    };
  }

  function isEnabled(id) {
    if (id === "ultra_premium" && !flags().ultraPremiumEnabled) return false;
    if (id === "editorial" && !flags().editorialEnabled) return false;
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return true;
    return false;
  }

  /** Resolved platform default: configured value if enabled, else the dark safety net. */
  function defaultTheme() {
    var want = flags().defaultTheme;
    return isEnabled(want) ? want : FALLBACK_THEME;
  }

  function enabledThemes() {
    var out = [];
    for (var i = 0; i < THEMES.length; i++) if (isEnabled(THEMES[i].id)) out.push(THEMES[i]);
    return out;
  }

  function nextThemeId(cur) {
    var list = enabledThemes();
    if (!list.length) return defaultTheme();
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === cur) { idx = i; break; }
    return list[(idx + 1) % list.length].id;
  }

  function themeLabel(id) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i].label;
    return id;
  }

  function getStored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function hasExplicitChoice() {
    try {
      return localStorage.getItem(CHOICE_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  /** Set html[data-theme] + notify listeners. Does NOT persist (used by init + apply). */
  function setTheme(theme) {
    if (!isEnabled(theme)) theme = defaultTheme();
    document.documentElement.setAttribute("data-theme", theme);
    try {
      document.dispatchEvent(new CustomEvent("tc-theme-change", { detail: { theme: theme } }));
    } catch (e) {
      /* ignore */
    }
    return theme;
  }

  /** Explicit user choice: set + persist + mark as chosen so it survives default changes. */
  function apply(theme) {
    theme = setTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
      localStorage.setItem(CHOICE_KEY, "1");
    } catch (e) {
      /* ignore quota / private mode */
    }
  }

  /**
   * Bootstrap before paint when this script is in <head>. An explicit prior choice wins;
   * otherwise the live platform default is applied WITHOUT persisting, so non-choosers keep
   * following the default even after it changes.
   */
  function initFromStorage() {
    var s = getStored();
    if (hasExplicitChoice() && isEnabled(s)) {
      setTheme(s);
    } else {
      setTheme(defaultTheme());
    }
  }

  initFromStorage();

  window.TC = window.TC || {};
  var ICON_MOON =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M21 14.2A9 9 0 0 1 9.8 3a1 1 0 0 0-1.3-1.2A10 10 0 1 0 22.2 15.5a1 1 0 0 0-1.2-1.3z"/></svg>';
  var ICON_SUN =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><path fill="currentColor" d="M11 1h2v3h-2zM11 20h2v3h-2zM1 11h3v2H1zM20 11h3v2h-3zM4.22 5.64l1.42-1.42 2.12 2.12-1.42 1.42zM16.24 17.66l1.42-1.42 2.12 2.12-1.42 1.42zM16.36 6.34l2.12-2.12 1.42 1.42-2.12 2.12zM4.22 18.36l2.12-2.12 1.42 1.42-2.12 2.12z"/></svg>';
  var ICON_PREMIUM =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2l1.9 6.3L20 10l-6.1 1.7L12 18l-1.9-6.3L4 10l6.1-1.7L12 2z"/></svg>';
  var ICON_EDITORIAL =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 4h7a2 2 0 0 1 2 2v13a3 3 0 0 0-2-1H4V4zm16 0h-7a2 2 0 0 0-2 2v13a3 3 0 0 1 2-1h7V4z"/></svg>';

  function iconFor(id) {
    if (id === "light") return ICON_SUN;
    if (id === "ultra_premium") return ICON_PREMIUM;
    if (id === "editorial") return ICON_EDITORIAL;
    return ICON_MOON;
  }

  function setToggleUi(btn) {
    if (!btn) return;
    var def = defaultTheme();
    var t = document.documentElement.getAttribute("data-theme") || def;
    btn.setAttribute("aria-pressed", t === def ? "false" : "true");
    btn.setAttribute("aria-label", "Design wechseln (aktuell: " + themeLabel(t) + ", weiter zu: " + themeLabel(nextThemeId(t)) + ")");
    btn.title = "Design: " + themeLabel(t);
    var sp = btn.querySelector(".tc-theme-toggle__icon");
    if (sp) sp.innerHTML = iconFor(t);
  }

  function syncAllToggles() {
    var nodes = document.querySelectorAll(".tc-theme-toggle");
    for (var i = 0; i < nodes.length; i++) setToggleUi(nodes[i]);
  }

  /** Remove floating toggle when a real topbar nav becomes available. */
  function removeFloatingToggle() {
    var el = document.getElementById("tc-theme-floating-root");
    if (el) el.remove();
  }

  function mountIntoNav(nav) {
    if (!nav || !flags().switcherEnabled || nav.querySelector(".tc-theme-toggle")) return;
    removeFloatingToggle();
    var wrap = document.createElement("div");
    wrap.className = "tc-theme-toggle-wrap";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tc-theme-toggle";
    btn.innerHTML = '<span class="tc-theme-toggle__icon" aria-hidden="true"></span>';
    wrap.appendChild(btn);
    nav.appendChild(wrap);
    btn.addEventListener("click", function () {
      var cur = document.documentElement.getAttribute("data-theme") || defaultTheme();
      apply(nextThemeId(cur));
      syncAllToggles();
    });
    document.addEventListener("tc-theme-change", function () {
      setToggleUi(btn);
    });
    setToggleUi(btn);
  }

  /**
   * Prefer shell → marketing wrap → main; then any .ds-topbar__nav (e.g. legal/static .wrap),
   * skipping nav inside a hidden #paywall so the shell can win once injected.
   */
  function pickNavForToggle() {
    var shell = document.querySelector("#tc-shell .ds-topbar__nav");
    if (shell) return shell;
    var mk = document.querySelector(".ds-wrap .ds-topbar__nav");
    if (mk) return mk;
    var mainN = document.querySelector("main .ds-topbar__nav");
    if (mainN) return mainN;
    var all = document.querySelectorAll(".ds-topbar__nav");
    for (var i = 0; i < all.length; i++) {
      var nav = all[i];
      var pw = nav.closest("#paywall");
      if (pw) {
        try {
          if (window.getComputedStyle(pw).display === "none") continue;
        } catch (e) {
          continue;
        }
      }
      return nav;
    }
    return null;
  }

  function ensureFloatingToggleStyles() {
    if (document.getElementById("tc-theme-floating-style")) return;
    var st = document.createElement("style");
    st.id = "tc-theme-floating-style";
    st.textContent =
      "#tc-theme-floating-root.tc-theme-toggle-wrap--floating{position:fixed;bottom:max(16px,env(safe-area-inset-bottom));right:max(16px,env(safe-area-inset-right));z-index:99999;margin:0}" +
      "#tc-theme-floating-root .tc-theme-toggle{width:40px;height:40px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(15,22,41,.85);color:#c8d4f0;box-shadow:0 4px 24px rgba(0,0,0,.35);backdrop-filter:blur(8px)}" +
      "[data-theme=\"light\"] #tc-theme-floating-root .tc-theme-toggle{border-color:rgba(15,23,42,.15);background:rgba(255,255,255,.92);color:#475569;box-shadow:0 4px 24px rgba(15,23,42,.12)}" +
      "[data-theme=\"editorial\"] #tc-theme-floating-root .tc-theme-toggle{border-color:rgba(31,58,46,.22);background:rgba(255,253,246,.94);color:#1f3a2e;box-shadow:0 4px 24px rgba(40,33,20,.16)}" +
      "#tc-theme-floating-root .tc-theme-toggle:hover{filter:brightness(1.08)}";
    document.head.appendChild(st);
  }

  /** When no DS topbar exists (worker, einsatzportal, …). Idempotent. */
  function mountFloatingToggle() {
    if (!flags().switcherEnabled) return false;
    if (document.querySelector(".tc-theme-toggle")) return true;
    if (document.getElementById("tc-theme-floating-root")) return true;
    ensureFloatingToggleStyles();
    var wrap = document.createElement("div");
    wrap.id = "tc-theme-floating-root";
    wrap.className = "tc-theme-toggle-wrap tc-theme-toggle-wrap--floating";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tc-theme-toggle";
    btn.innerHTML = '<span class="tc-theme-toggle__icon" aria-hidden="true"></span>';
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
    btn.addEventListener("click", function () {
      var cur = document.documentElement.getAttribute("data-theme") || defaultTheme();
      apply(nextThemeId(cur));
      syncAllToggles();
    });
    document.addEventListener("tc-theme-change", function () {
      setToggleUi(btn);
    });
    setToggleUi(btn);
    return true;
  }

  /**
   * Floating only if no shell is expected to inject a bar: no #tc-shell and no .ds-topbar__nav.
   * Pages with #tc-shell wait for shell; pages with any topbar use pickNavForToggle.
   */
  function tryFloatingWhenNoTopbar() {
    if (document.querySelector(".tc-theme-toggle")) return true;
    if (document.querySelector("#tc-shell")) return false;
    if (document.querySelector(".ds-topbar__nav")) return false;
    return mountFloatingToggle();
  }

  var MOUNT_MAX_TRIES = 80;
  var MOUNT_INTERVAL_MS = 50;

  /** Try to mount toggle into first available topbar nav (landing / late-injected shell). */
  function tryDeferredMount() {
    if (document.querySelector(".tc-theme-toggle")) return true;
    var nav = pickNavForToggle();
    if (nav) {
      mountIntoNav(nav);
      return true;
    }
    if (tryFloatingWhenNoTopbar()) return true;
    return false;
  }

  function deferredMountCycle(attempt) {
    attempt = attempt || 0;
    if (tryDeferredMount()) return;
    if (attempt >= MOUNT_MAX_TRIES) {
      if (!document.querySelector(".tc-theme-toggle")) {
        mountFloatingToggle();
      }
      return;
    }
    window.setTimeout(function () {
      deferredMountCycle(attempt + 1);
    }, MOUNT_INTERVAL_MS);
  }

  function deferredMount() {
    window.setTimeout(function () {
      if (tryDeferredMount()) return;
      deferredMountCycle(0);
    }, 0);
  }

  window.addEventListener("load", function () {
    tryDeferredMount();
  });

  TC.theme = {
    STORAGE_KEY: STORAGE_KEY,
    CHOICE_KEY: CHOICE_KEY,
    /** Resolved platform default (flag-aware). */
    get DEFAULT() {
      return defaultTheme();
    },
    get: function () {
      return document.documentElement.getAttribute("data-theme") || defaultTheme();
    },
    set: function (theme) {
      apply(theme);
      syncAllToggles();
    },
    /** Themes available right now (respects window.__TC_THEME_FLAGS__). */
    list: function () {
      return enabledThemes().slice();
    },
    /** Advance to the next enabled theme — used by the toggle button. */
    cycle: function () {
      this.set(nextThemeId(this.get()));
    },
    /** Backwards-compatible binary toggle (dark <-> light). */
    toggle: function () {
      this.set(this.get() === "dark" ? "light" : "dark");
    },
    /** Clear an explicit choice so the visitor follows the live platform default again. */
    resetToDefault: function () {
      try {
        localStorage.removeItem(CHOICE_KEY);
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        /* ignore */
      }
      setTheme(defaultTheme());
      syncAllToggles();
    },
    mountIntoNav: mountIntoNav,
    mountFloatingToggle: mountFloatingToggle,
    /** Idempotent: find nav and mount if missing (shell/SPA late render). */
    ensureToggleMounted: tryDeferredMount
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", deferredMount);
  } else {
    deferredMount();
  }
})();
