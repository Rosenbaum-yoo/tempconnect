/**
 * TempConnect Toast Notification System
 * ─────────────────────────────────────────────────────────────
 * Enterprise-grade toast stack using design-system.css tokens.
 * Replaces per-page toast implementations with a single system.
 *
 * Usage:
 *   TC.toast.success('Gespeichert')
 *   TC.toast.success('Titel', 'Detailnachricht')
 *   TC.toast.error('Fehler', 'Bitte erneut versuchen.')
 *   TC.toast.warning('Achtung', 'Rate-Limit erreicht.')
 *   TC.toast.info('Hinweis', 'Neue Version verfuegbar.')
 *
 * Auto-listens for TC.api events:
 *   tc:network-error  → toast.error
 *   tc:rate-limited   → toast.warning
 *   tc:server-error   → toast.error
 *
 * Depends on: design-system.css (ds-* tokens)
 * Provides:  window.TC.toast
 */
"use strict";

var TC = window.TC || {};

TC.toast = (function () {
  var MAX_VISIBLE = 3;
  var DEFAULT_DURATION = 4200;
  var ANIMATION_MS = 280;
  var _container = null;
  var _queue = [];
  var _active = [];
  var _styleInjected = false;

  /* ── Variant Config ────────────────────────────────────────── */

  var VARIANTS = {
    success: {
      icon: "✓",
      borderColor: "rgba(52, 211, 153, 0.4)",
      iconBg: "rgba(52, 211, 153, 0.15)",
      iconColor: "#a7f3d0"
    },
    error: {
      icon: "✕",
      borderColor: "rgba(248, 113, 113, 0.4)",
      iconBg: "rgba(248, 113, 113, 0.15)",
      iconColor: "#fecaca"
    },
    warning: {
      icon: "!",
      borderColor: "rgba(251, 191, 36, 0.4)",
      iconBg: "rgba(251, 191, 36, 0.15)",
      iconColor: "#fde68a"
    },
    info: {
      icon: "i",
      borderColor: "rgba(74, 158, 255, 0.4)",
      iconBg: "rgba(74, 158, 255, 0.15)",
      iconColor: "#bfdbfe"
    }
  };

  /* ── Style Injection ───────────────────────────────────────── */

  function injectStyles() {
    if (_styleInjected) return;
    _styleInjected = true;
    var css = [
      ".tc-toast-container{position:fixed;right:var(--ds-space-4,16px);bottom:var(--ds-space-4,16px);z-index:var(--ds-z-toast,600);display:flex;flex-direction:column-reverse;gap:var(--ds-space-2,8px);pointer-events:none;max-width:min(420px,calc(100vw - 32px))}",
      ".tc-toast{pointer-events:auto;display:flex;align-items:flex-start;gap:var(--ds-space-3,12px);padding:var(--ds-space-3,12px) var(--ds-space-4,16px);border-radius:var(--ds-radius-lg,14px);border:1px solid var(--ds-border,rgba(255,255,255,.07));background:var(--ds-bg-surface,#131b30);box-shadow:var(--ds-shadow-lg,0 12px 36px rgba(0,0,0,.4));backdrop-filter:blur(12px);transform:translateX(110%);opacity:0;transition:transform .28s cubic-bezier(.22,1,.36,1),opacity .28s ease}",
      ".tc-toast.tc-toast--visible{transform:translateX(0);opacity:1}",
      ".tc-toast.tc-toast--exit{transform:translateX(110%);opacity:0}",
      ".tc-toast__icon{width:28px;height:28px;border-radius:var(--ds-radius-sm,6px);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex-shrink:0;line-height:1}",
      ".tc-toast__body{flex:1;min-width:0}",
      ".tc-toast__title{font-size:13px;font-weight:700;color:var(--ds-text,#eaeff8);line-height:1.4;margin:0}",
      ".tc-toast__msg{font-size:12px;color:var(--ds-text-secondary,#8d9bba);line-height:1.5;margin:2px 0 0}",
      ".tc-toast__close{background:none;border:none;color:var(--ds-text-tertiary,#5f6d8a);cursor:pointer;font-size:14px;padding:2px 4px;line-height:1;flex-shrink:0;opacity:.6;transition:opacity .15s}",
      ".tc-toast__close:hover{opacity:1}",
      "@media(max-width:480px){.tc-toast-container{right:8px;bottom:8px;left:8px;max-width:none}}"
    ].join("\n");
    var el = document.createElement("style");
    el.id = "tc-toast-styles";
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* ── Container ─────────────────────────────────────────────── */

  function ensureContainer() {
    if (_container && document.body.contains(_container)) return _container;
    injectStyles();
    _container = document.createElement("div");
    _container.className = "tc-toast-container";
    _container.setAttribute("role", "status");
    _container.setAttribute("aria-live", "polite");
    _container.setAttribute("aria-label", "Benachrichtigungen");
    document.body.appendChild(_container);
    return _container;
  }

  /* ── Show / Dismiss ────────────────────────────────────────── */

  function show(variant, title, msg, duration) {
    var cfg = VARIANTS[variant] || VARIANTS.info;
    duration = (typeof duration === "number") ? duration : DEFAULT_DURATION;

    // Queue if max visible reached
    if (_active.length >= MAX_VISIBLE) {
      _queue.push({ variant: variant, title: title, msg: msg, duration: duration });
      return;
    }

    var container = ensureContainer();

    // Build toast DOM
    var el = document.createElement("div");
    el.className = "tc-toast";
    el.style.borderColor = cfg.borderColor;
    el.setAttribute("role", "alert");

    var iconEl = document.createElement("div");
    iconEl.className = "tc-toast__icon";
    iconEl.style.background = cfg.iconBg;
    iconEl.style.color = cfg.iconColor;
    iconEl.textContent = cfg.icon;

    var bodyEl = document.createElement("div");
    bodyEl.className = "tc-toast__body";

    var titleEl = document.createElement("div");
    titleEl.className = "tc-toast__title";
    titleEl.textContent = title || "";

    bodyEl.appendChild(titleEl);

    if (msg) {
      var msgEl = document.createElement("div");
      msgEl.className = "tc-toast__msg";
      msgEl.textContent = msg;
      bodyEl.appendChild(msgEl);
    }

    var closeBtn = document.createElement("button");
    closeBtn.className = "tc-toast__close";
    closeBtn.textContent = "\u00D7";
    closeBtn.title = "Schliessen";
    closeBtn.setAttribute("aria-label", "Benachrichtigung schliessen");

    el.appendChild(iconEl);
    el.appendChild(bodyEl);
    el.appendChild(closeBtn);
    container.appendChild(el);

    // Track
    var toastObj = { el: el, timer: null };
    _active.push(toastObj);

    // Animate in (next frame)
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.classList.add("tc-toast--visible");
      });
    });

    // Auto-dismiss
    function dismiss() {
      if (toastObj.dismissed) return;
      toastObj.dismissed = true;
      clearTimeout(toastObj.timer);
      el.classList.remove("tc-toast--visible");
      el.classList.add("tc-toast--exit");
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
        var idx = _active.indexOf(toastObj);
        if (idx >= 0) _active.splice(idx, 1);
        // Process queue
        if (_queue.length > 0) {
          var next = _queue.shift();
          show(next.variant, next.title, next.msg, next.duration);
        }
      }, ANIMATION_MS);
    }

    if (duration > 0) {
      toastObj.timer = setTimeout(dismiss, duration);
    }

    closeBtn.addEventListener("click", dismiss);

    // Pause auto-dismiss on hover
    el.addEventListener("mouseenter", function () {
      if (toastObj.timer) { clearTimeout(toastObj.timer); toastObj.timer = null; }
    });
    el.addEventListener("mouseleave", function () {
      if (!toastObj.dismissed && duration > 0) {
        toastObj.timer = setTimeout(dismiss, 2000);
      }
    });

    return { dismiss: dismiss };
  }

  /* ── Auto-listen for API events ────────────────────────────── */

  function bindApiEvents() {
    document.addEventListener("tc:network-error", function (e) {
      var detail = (e && e.detail) || {};
      show("error", "Verbindungsfehler", detail.error && detail.error.message || "Server nicht erreichbar.");
    });
    document.addEventListener("tc:rate-limited", function () {
      show("warning", "Zu viele Anfragen", "Bitte einen Moment warten.");
    });
    document.addEventListener("tc:server-error", function (e) {
      var detail = (e && e.detail) || {};
      show("error", "Server-Fehler", "Fehler " + (detail.status || "") + " — bitte spaeter erneut versuchen.");
    });
  }

  // Bind after DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindApiEvents);
  } else {
    bindApiEvents();
  }

  /* ── Public API ────────────────────────────────────────────── */

  return {
    success: function (title, msg, duration) { return show("success", title, msg, duration); },
    error:   function (title, msg, duration) { return show("error", title, msg, duration); },
    warning: function (title, msg, duration) { return show("warning", title, msg, duration); },
    info:    function (title, msg, duration) { return show("info", title, msg, duration); },
    /** Low-level: show(variant, title, msg, durationMs) */
    show: show,
    /** Dismiss all active toasts */
    clear: function () {
      _active.slice().forEach(function (t) { if (t.dismiss) t.dismiss(); else if (!t.dismissed) { t.dismissed = true; if (t.el && t.el.parentNode) t.el.parentNode.removeChild(t.el); } });
      _active = [];
      _queue = [];
    }
  };
})();

window.TC = TC;
