/**
 * Notification Bell Component (global)
 * Injects a bell icon into the topbar with unread count badge + dropdown.
 * Include this script on any page that has a .topbar element.
 */
(function () {
  "use strict";

  var POLL_INTERVAL = 60000; // 60s
  var _csrf = null;

  function getCsrf() {
    if (_csrf) return Promise.resolve(_csrf);
    return fetch("/api/csrf-token", { credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) { _csrf = d.csrfToken || d.token || null; return _csrf; });
  }

  function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  function relTime(iso) {
    var diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return "gerade eben";
    if (diff < 3600) return Math.floor(diff / 60) + " Min.";
    if (diff < 86400) return Math.floor(diff / 3600) + " Std.";
    return Math.floor(diff / 86400) + " Tg.";
  }

  function createBell() {
    var topbar = document.querySelector(".topbar");
    if (!topbar) return null;

    var wrap = document.createElement("div");
    wrap.className = "tc-notif-wrap";
    wrap.style.cssText = "position:relative;display:inline-flex;align-items:center;margin-left:8px;";

    wrap.innerHTML =
      '<button class="tc-notif-btn" title="Benachrichtigungen" style="position:relative;background:none;border:1px solid var(--line,rgba(255,255,255,.1));border-radius:10px;padding:7px 10px;cursor:pointer;color:var(--text,#fff);font-size:16px;line-height:1">' +
      '&#128276;' +
      '<span class="tc-notif-badge" style="display:none;position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;border-radius:99px;background:#f87171;color:#fff;font-size:10px;font-weight:800;text-align:center;line-height:16px;padding:0 4px"></span>' +
      '</button>' +
      '<div class="tc-notif-dropdown" style="display:none;position:absolute;top:100%;right:0;margin-top:8px;width:340px;max-height:420px;overflow-y:auto;border:1px solid var(--line,rgba(255,255,255,.1));border-radius:14px;background:var(--card,#1a1d24);box-shadow:0 8px 32px rgba(0,0,0,.4);z-index:9999;padding:0">' +
      '<div style="padding:12px 16px;border-bottom:1px solid var(--line,rgba(255,255,255,.07));display:flex;justify-content:space-between;align-items:center">' +
      '<span style="font-weight:700;font-size:14px">Benachrichtigungen</span>' +
      '<button class="tc-notif-readall" style="font-size:11px;background:none;border:none;color:var(--brand,#4a9eff);cursor:pointer;font-weight:600">Alle gelesen</button>' +
      '</div>' +
      '<div class="tc-notif-list" style="padding:4px 0"></div>' +
      '<div style="padding:10px 16px;border-top:1px solid var(--line,rgba(255,255,255,.07));text-align:center">' +
      '<a href="/public/notifications.html" style="font-size:12px;color:var(--brand,#4a9eff);font-weight:600;text-decoration:none">Alle anzeigen</a>' +
      '</div>' +
      '</div>';

    topbar.appendChild(wrap);
    return wrap;
  }

  function renderItems(list, container) {
    if (!list.length) {
      container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted,#8d9bba);font-size:13px">Keine Benachrichtigungen</div>';
      return;
    }
    container.innerHTML = list.map(function (n) {
      var bg = n.is_read ? "transparent" : "rgba(74,158,255,.04)";
      var dot = n.is_read ? "" : '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#4a9eff;margin-right:6px;flex-shrink:0"></span>';
      return '<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.04);background:' + bg + ';display:flex;align-items:flex-start;gap:6px;cursor:pointer" data-nid="' + n.id + '">' +
        dot +
        '<div style="flex:1;min-width:0">' +
        '<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(n.title || n.message || "Benachrichtigung") + '</div>' +
        '<div style="font-size:11px;color:var(--muted,#8d9bba);margin-top:2px">' + relTime(n.created_at) + '</div>' +
        '</div></div>';
    }).join("");
  }

  function init() {
    var wrap = createBell();
    if (!wrap) return;

    var btn = wrap.querySelector(".tc-notif-btn");
    var dropdown = wrap.querySelector(".tc-notif-dropdown");
    var badge = wrap.querySelector(".tc-notif-badge");
    var list = wrap.querySelector(".tc-notif-list");
    var readAllBtn = wrap.querySelector(".tc-notif-readall");
    var open = false;

    function toggleDropdown() {
      open = !open;
      dropdown.style.display = open ? "block" : "none";
      if (open) loadNotifications();
    }

    btn.addEventListener("click", function (e) { e.stopPropagation(); toggleDropdown(); });
    document.addEventListener("click", function (e) { if (open && !wrap.contains(e.target)) { open = false; dropdown.style.display = "none"; } });

    function updateBadge(count) {
      if (count > 0) { badge.style.display = ""; badge.textContent = count > 99 ? "99+" : count; }
      else { badge.style.display = "none"; }
    }

    function fetchCount() {
      fetch("/api/notifications/unread-count", { credentials: "include" })
        .then(function (r) { return r.ok ? r.json() : { count: 0 }; })
        .then(function (d) { updateBadge(d.count || 0); })
        .catch(function () {});
    }

    function loadNotifications() {
      fetch("/api/notifications?limit=15", { credentials: "include" })
        .then(function (r) { return r.ok ? r.json() : { items: [] }; })
        .then(function (d) { renderItems(d.items || d.data?.items || [], list); })
        .catch(function () { list.innerHTML = '<div style="padding:16px;color:var(--muted)">Fehler beim Laden</div>'; });
    }

    readAllBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      getCsrf().then(function (token) {
        return fetch("/api/notifications/read-all", {
          method: "PUT", credentials: "include",
          headers: { "Content-Type": "application/json", "x-csrf-token": token || "" }
        });
      }).then(function () { updateBadge(0); loadNotifications(); });
    });

    // Mark single as read on click
    list.addEventListener("click", function (e) {
      var row = e.target.closest("[data-nid]");
      if (!row) return;
      var nid = row.getAttribute("data-nid");
      getCsrf().then(function (token) {
        return fetch("/api/notifications/" + nid + "/read", {
          method: "PUT", credentials: "include",
          headers: { "Content-Type": "application/json", "x-csrf-token": token || "" }
        });
      }).then(function () { fetchCount(); loadNotifications(); });
    });

    fetchCount();
    setInterval(fetchCount, POLL_INTERVAL);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
