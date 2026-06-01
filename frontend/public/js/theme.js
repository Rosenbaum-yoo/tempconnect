/**
 * TempConnect theme controller — html[data-theme="dark"|"light"]
 * Persists to localStorage (tempconnect-theme). Default: dark (existing product look).
 * Light tokens live at the end of /public/css/design-system.css (no separate import).
 */
(function () {
  "use strict";

  var STORAGE_KEY = "tempconnect-theme";
  var DEFAULT_THEME = "dark";

  /**
   * Theme registry. "dark" is the established product default (:root). "light" maps to
   * the [data-theme="light"] block. "ultra_premium" is opt-in (Phase J). Per-scope control,
   * env gating and audit arrive with the SCC Theme Control (Phase J, Block 2). Until then an
   * optional global window.__TC_THEME_FLAGS__ = { switcherEnabled, ultraPremiumEnabled } lets
   * the server gate availability without editing this file (defaults: both enabled).
   */
  var THEMES = [
    { id: "dark", label: "Dark — Standard" },
    { id: "light", label: "Light" },
    { id: "ultra_premium", label: "Ultra Premium" }
  ];

  function flags() {
    var f = window.__TC_THEME_FLAGS__ && typeof window.__TC_THEME_FLAGS__ === "object" ? window.__TC_THEME_FLAGS__ : {};
    return {
      switcherEnabled: f.switcherEnabled !== false,
      ultraPremiumEnabled: f.ultraPremiumEnabled !== false
    };
  }

  function isEnabled(id) {
    if (id === "ultra_premium" && !flags().ultraPremiumEnabled) return false;
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return true;
    return false;
  }

  function enabledThemes() {
    var out = [];
    for (var i = 0; i < THEMES.length; i++) if (isEnabled(THEMES[i].id)) out.push(THEMES[i]);
    return out;
  }

  function nextThemeId(cur) {
    var list = enabledThemes();
    if (!list.length) return DEFAULT_THEME;
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

  function apply(theme) {
    if (!isEnabled(theme)) theme = DEFAULT_THEME;
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      /* ignore quota / private mode */
    }
    try {
      document.dispatchEvent(new CustomEvent("tc-theme-change", { detail: { theme: theme } }));
    } catch (e) {
      /* ignore */
    }
  }

  /** Bootstrap before paint when this script is in <head> */
  function initFromStorage() {
    var s = getStored();
    apply(isEnabled(s) ? s : DEFAULT_THEME);
  }

  initFromStorage();

  window.TC = window.TC || {};
  var ICON_MOON =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M21 14.2A9 9 0 0 1 9.8 3a1 1 0 0 0-1.3-1.2A10 10 0 1 0 22.2 15.5a1 1 0 0 0-1.2-1.3z"/></svg>';
  var ICON_SUN =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><path fill="currentColor" d="M11 1h2v3h-2zM11 20h2v3h-2zM1 11h3v2H1zM20 11h3v2h-3zM4.22 5.64l1.42-1.42 2.12 2.12-1.42 1.42zM16.24 17.66l1.42-1.42 2.12 2.12-1.42 1.42zM16.36 6.34l2.12-2.12 1.42 1.42-2.12 2.12zM4.22 18.36l2.12-2.12 1.42 1.42-2.12 2.12z"/></svg>';
  var ICON_PREMIUM =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2l1.9 6.3L20 10l-6.1 1.7L12 18l-1.9-6.3L4 10l6.1-1.7L12 2z"/></svg>';

  function iconFor(id) {
    if (id === "light") return ICON_SUN;
    if (id === "ultra_premium") return ICON_PREMIUM;
    return ICON_MOON;
  }

  function setToggleUi(btn) {
    if (!btn) return;
    var t = document.documentElement.getAttribute("data-theme") || DEFAULT_THEME;
    btn.setAttribute("aria-pressed", t === DEFAULT_THEME ? "false" : "true");
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
      var cur = document.documentElement.getAttribute("data-theme") || DEFAULT_THEME;
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
      var cur = document.documentElement.getAttribute("data-theme") || DEFAULT_THEME;
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
    DEFAULT: DEFAULT_THEME,
    get: function () {
      return document.documentElement.getAttribute("data-theme") || DEFAULT_THEME;
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
