/**
 * Notification Bell Component (global)
 * Injects a bell icon into the topbar with unread count badge + dropdown.
 *
 * Topbar selection order:
 *  1. [data-notif-topbar]  — explicit mount point (recommended on all pages)
 *  2. First .topbar NOT inside a display:none ancestor (auto-detect visible topbar)
 *  3. Any .topbar            — fallback
 *
 * Deep-link routing: notification clicks navigate based on link_path,
 * entity_type + entity_id mapping, or mark-read-only if no link.
 */
(function () {
  "use strict";

  var POLL_INTERVAL = 60000; // 60s
  var _csrf = null;

  function getCsrf() {
    if (_csrf) return Promise.resolve(_csrf);
    return fetch("/api/csrf", { credentials: "include" })
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

  /** Resolve a deep-link URL from notification fields. Returns null if no link. */
  function resolveLink(n) {
    if (n.link_path) return n.link_path;
    var type = n.entity_type;
    var id   = n.entity_id;
    if (!type) return null;
    var routes = {
      "search_job":          "/public/sla_search_job_detail.html" + (id ? "?id=" + encodeURIComponent(id) : ""),
      "capacity_request":    "/public/company_requests.html",
      "demand_request":      "/public/company_requests.html",
      "offer":               "/public/agency_inbox.html",
      "capacity_offer":      "/public/agency_inbox.html",
      "requisition":         "/public/requisitions.html",
      "timesheet":           "/public/timesheets.html",
      "worker_timesheet":    "/public/timesheets.html",
      "compliance_document": "/public/compliance_overview.html",
      "vendor_pool":         "/public/vendor_pool.html",
      "worker_assignment":   "/public/timesheets.html",
      "assignment":          "/public/timesheets.html"
    };
    return routes[type] || null;
  }

  /** Find the best topbar to inject the bell into. */
  function findTopbar() {
    // 1. Explicit mount attribute
    var explicit = document.querySelector("[data-notif-topbar]");
    if (explicit) return explicit;
    // 2. First .topbar not hidden by an inline display:none ancestor
    var all = document.querySelectorAll(".topbar");
    for (var i = 0; i < all.length; i++) {
      if (!all[i].closest('[style*="display:none"]')) return all[i];
    }
    // 3. Fallback
    return document.querySelector(".topbar");
  }

  function createBell() {
    var topbar = findTopbar();
    if (!topbar) return null;

    var wrap = document.createElement("div");
    wrap.className = "tc-notif-wrap";
    wrap.style.cssText = "position:relative;display:inline-flex;align-items:center;margin-left:8px;";

    wrap.innerHTML =
      '<button class="tc-notif-btn" title="Benachrichtigungen" style="position:relative;background:none;border:1px solid var(--line,rgba(255,255,255,.1));border-radius:10px;padding:7px 10px;cursor:pointer;color:var(--text,#fff);font-size:16px;line-height:1;transition:border-color .15s,background .15s">' +
      '&#128276;' +
      '<span class="tc-notif-badge" style="display:none;position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;border-radius:99px;background:#f87171;color:#fff;font-size:10px;font-weight:800;text-align:center;line-height:16px;padding:0 4px"></span>' +
      '</button>' +
      '<div class="tc-notif-dropdown" style="display:none;position:absolute;top:calc(100% + 8px);right:0;width:360px;max-height:440px;overflow-y:auto;border:1px solid var(--line,rgba(255,255,255,.1));border-radius:14px;background:var(--card,#1a1d24);box-shadow:0 8px 32px rgba(0,0,0,.5);z-index:9999;padding:0">' +
      '<div style="padding:12px 16px;border-bottom:1px solid var(--line,rgba(255,255,255,.07));display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--card,#1a1d24);z-index:1">' +
      '<span style="font-weight:700;font-size:14px">Benachrichtigungen</span>' +
      '<button class="tc-notif-readall" style="font-size:11px;background:none;border:none;color:var(--brand,#4a9eff);cursor:pointer;font-weight:600;padding:2px 6px">Alle gelesen</button>' +
      '</div>' +
      '<div class="tc-notif-list" style="padding:4px 0"></div>' +
      '<div style="padding:10px 16px;border-top:1px solid var(--line,rgba(255,255,255,.07));text-align:center;position:sticky;bottom:0;background:var(--card,#1a1d24)">' +
'<a href="/public/activity.html" style="font-size:12px;color:var(--brand,#4a9eff);font-weight:600;text-decoration:none">Alle anzeigen →</a>' +
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
      var link    = resolveLink(n);
      var bg      = n.is_read ? "transparent" : "rgba(74,158,255,.05)";
      var border  = n.is_read ? "3px solid transparent" : "3px solid var(--ds-brand,#4a9eff)";
      var msg     = (n.message && n.message !== n.title) ? n.message : null;
      var arrow   = link ? '<span style="flex-shrink:0;color:var(--muted,#8d9bba);font-size:11px;margin-top:2px">→</span>' : "";
      return '<div style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.04);background:' + bg + ';border-left:' + border + ';display:flex;align-items:flex-start;gap:8px;cursor:pointer;transition:background .1s"' +
        ' data-nid="' + esc(n.id) + '"' + (link ? ' data-link="' + esc(link) + '"' : '') +
        ' onmouseover="this.style.background=\'rgba(255,255,255,.04)\'" onmouseout="this.style.background=\'' + bg + '\'">' +
        '<div style="flex:1;min-width:0">' +
        '<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(n.title || n.message || "Benachrichtigung") + '</div>' +
        (msg ? '<div style="font-size:11px;color:var(--muted,#8d9bba);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(msg.substring(0, 80)) + '</div>' : '') +
        '<div style="font-size:11px;color:var(--muted,#8d9bba);margin-top:2px">' + relTime(n.created_at) + '</div>' +
        '</div>' + arrow + '</div>';
    }).join("");
  }

  function init() {
    var wrap = createBell();
    if (!wrap) return;

    // Glocken-Konsolidierung: dieses Dropdown ersetzt die statische pageShell-
    // Link-Glocke (#tc-notif-bell). Sobald unsere Glocke steht, blenden wir die
    // Alt-Glocke plattformweit aus (guarded — strandet keine Seite ohne pageShell;
    // pageShell-SSE-Toasts bleiben aktiv).
    var legacyBell = document.getElementById("tc-notif-bell");
    if (legacyBell) legacyBell.style.display = "none";

    var btn       = wrap.querySelector(".tc-notif-btn");
    var dropdown  = wrap.querySelector(".tc-notif-dropdown");
    var badge     = wrap.querySelector(".tc-notif-badge");
    var list      = wrap.querySelector(".tc-notif-list");
    var readAllBtn = wrap.querySelector(".tc-notif-readall");
    var open = false;

    function closeDropdown() { open = false; dropdown.style.display = "none"; }

    function toggleDropdown() {
      open = !open;
      dropdown.style.display = open ? "block" : "none";
      if (open) loadNotifications();
    }

    btn.addEventListener("click", function (e) { e.stopPropagation(); toggleDropdown(); });
    document.addEventListener("click", function (e) { if (open && !wrap.contains(e.target)) closeDropdown(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) closeDropdown(); });

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
        .then(function (d) { renderItems(d.items || (d.data && d.data.items) || [], list); })
        .catch(function () { list.innerHTML = '<div style="padding:16px;color:var(--muted)">Fehler beim Laden</div>'; });
    }

    readAllBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      getCsrf().then(function (token) {
        return fetch("/api/notifications/read-all", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json", "x-csrf-token": token || "" }
        });
      }).then(function () { updateBadge(0); loadNotifications(); });
    });

    // Mark single as read on click + navigate to deep link
    list.addEventListener("click", function (e) {
      var row = e.target.closest("[data-nid]");
      if (!row) return;
      var nid  = row.getAttribute("data-nid");
      var link = row.getAttribute("data-link");
      getCsrf().then(function (token) {
        return fetch("/api/notifications/" + nid + "/read", {
          method: "PATCH", credentials: "include",
          headers: { "Content-Type": "application/json", "x-csrf-token": token || "" }
        });
      }).then(function () {
        fetchCount();
        if (link) {
          closeDropdown();
          window.location.href = link;
        } else {
          loadNotifications();
        }
      });
    });

    fetchCount();
    setInterval(fetchCount, POLL_INTERVAL);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
