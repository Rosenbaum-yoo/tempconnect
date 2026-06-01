/**
 * Milestone Toast Notifications
 * Checks for newly earned milestones on page load and shows celebratory toasts.
 * Uses localStorage to track which milestones have already been displayed.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "tc_shown_milestones";
  var TOAST_DURATION = 6000;

  function getShown() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch (e) { return []; }
  }
  function setShown(arr) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); }
    catch (e) { /* quota exceeded – silent */ }
  }

  /** Show a single toast notification */
  function showToast(icon, title, subtitle) {
    var container = document.getElementById("tc-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "tc-toast-container";
      container.style.cssText = "position:fixed;top:24px;right:24px;z-index:99999;display:flex;flex-direction:column;gap:10px;pointer-events:none;max-width:380px";
      document.body.appendChild(container);
    }

    var toast = document.createElement("div");
    toast.style.cssText = "pointer-events:auto;display:flex;align-items:center;gap:12px;padding:14px 18px;border-radius:14px;border:1px solid rgba(57,217,138,.3);background:rgba(10,16,30,.96);box-shadow:0 8px 32px rgba(0,0,0,.5);backdrop-filter:blur(8px);animation:tc-toast-in .35s ease;transform:translateX(0);opacity:1;transition:transform .3s,opacity .3s";
    toast.innerHTML =
      '<div style="font-size:28px;flex-shrink:0">' + (icon || "🎯") + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:13px;font-weight:700;color:#fff">' + esc(title) + '</div>' +
        (subtitle ? '<div style="font-size:11px;color:rgba(255,255,255,.55);margin-top:2px">' + esc(subtitle) + '</div>' : '') +
      '</div>';

    container.appendChild(toast);

    setTimeout(function () {
      toast.style.transform = "translateX(120%)";
      toast.style.opacity = "0";
      setTimeout(function () { toast.remove(); }, 350);
    }, TOAST_DURATION);
  }

  function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  /** Inject keyframes once */
  function injectCSS() {
    if (document.getElementById("tc-toast-css")) return;
    var style = document.createElement("style");
    style.id = "tc-toast-css";
    style.textContent = "@keyframes tc-toast-in{from{transform:translateX(120%);opacity:0}to{transform:translateX(0);opacity:1}}";
    document.head.appendChild(style);
  }

  function init() {
    injectCSS();

    fetch("/api/milestones/me", { credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.milestones || !data.milestones.length) return;

        var shown = getShown();
        var newMilestones = data.milestones.filter(function (m) {
          return shown.indexOf(m.milestone_type) === -1;
        });

        if (!newMilestones.length) return;

        // Show toasts with staggered delay
        var delay = 500;
        newMilestones.forEach(function (m, i) {
          setTimeout(function () {
            showToast(m.icon, "Meilenstein erreicht!", m.milestone_label);
          }, delay + i * 1200);
        });

        // Mark all as shown
        var allShown = shown.concat(newMilestones.map(function (m) { return m.milestone_type; }));
        setShown(allShown);
      })
      .catch(function () { /* silent */ });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
