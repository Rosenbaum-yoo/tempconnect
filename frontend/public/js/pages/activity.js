/* ═══════════════════════════════════════════════════════
   Activity Center — Page Logic
   ═══════════════════════════════════════════════════════ */
  (function () {
    "use strict";

    /* ── Constants ─────────────────────────────── */

    var SEVERITY_ICONS = { info: "\uD83D\uDD35", success: "\u2705", warning: "\u26A0\uFE0F", error: "\u274C", urgent: "\uD83D\uDD34" };

    var TYPE_LABELS = {
      requisition_approval: "Arbeitsplatzangebot", requisition_filled: "Arbeitsplatzangebot", requisition_cancelled: "Arbeitsplatzangebot",
      offer_received: "Angebot", offer_accepted: "Angebot", offer_rejected: "Angebot",
      compliance_expiring: "Compliance", compliance_expired: "Compliance", compliance_verified: "Compliance",
      sla_warning: "SLA", sla_breached: "SLA",
      vendor_pool_change: "Lieferanten",
      capacity_interest: "Personal", capacity_expiring: "Personal", capacity_match: "Personal", capacity_stale: "Personal",
      demand_match: "Personal",
      deal_offer_sent: "Deal", deal_accepted: "Deal", deal_confirmed: "Deal", deal_completed: "Deal", deal_assignment_started: "Deal", deal_staffing_ready: "Deal",
      emergency_request: "Notdienst", emergency_escalation: "Notdienst",
      timesheet_submitted: "Timesheet", timesheet_approved: "Timesheet", timesheet_rejected: "Timesheet", timesheet_signed: "Timesheet",
      general: "System", system: "System"
    };

    /* Category → notification types mapping */
    var CAT_TYPES = {
      requisition: ["requisition_approval", "requisition_filled", "requisition_cancelled"],
      offer:       ["offer_received", "offer_accepted", "offer_rejected"],
      compliance:  ["compliance_expiring", "compliance_expired", "compliance_verified", "sla_warning", "sla_breached"],
      capacity:    ["capacity_interest", "capacity_expiring", "capacity_match", "capacity_stale", "demand_match"],
      deal:        ["deal_offer_sent", "deal_accepted", "deal_confirmed", "deal_completed", "deal_assignment_started", "deal_staffing_ready"],
      timesheet:   ["timesheet_submitted", "timesheet_approved", "timesheet_rejected", "timesheet_signed"],
      system:      ["general", "system", "vendor_pool_change", "emergency_request", "emergency_escalation"]
    };

    var EVENT_LABELS = {
      supplier_invited: "Lieferant eingeladen", supplier_approved: "Lieferant freigeschaltet", supplier_blocked: "Lieferant gesperrt",
      requisition_created: "Arbeitsplatzangebot erstellt", requisition_distributed: "Arbeitsplatzangebot verteilt", requisition_filled: "Arbeitsplatzangebot besetzt",
      offer_submitted: "Angebot eingereicht", offer_created: "Angebot erstellt", offer_accepted: "Angebot angenommen",
      offer_rejected: "Angebot abgelehnt", offer_withdrawn: "Angebot zur\u00fcckgezogen",
      deal_completed: "Deal abgeschlossen", deal_cancelled: "Deal storniert",
      rating_submitted: "Bewertung abgegeben",
      capacity_published: "Personal eingestellt", capacity_expired: "Personalangebot abgelaufen",
      capacity_filled: "Personal zugewiesen", capacity_interest: "Interesse an Personal",
      assignment_started: "Einsatz gestartet", assignment_completed: "Einsatz abgeschlossen",
      profile_updated: "Profil aktualisiert", search_job_created: "Suchauftrag erstellt", search_job_closed: "Suchauftrag geschlossen",
      document_uploaded: "Dokument hochgeladen", document_verified: "Dokument verifiziert", document_expired: "Dokument abgelaufen",
      org_created: "Organisation erstellt", org_updated: "Organisation aktualisiert",
      member_added: "Mitglied hinzugef\u00fcgt", member_removed: "Mitglied entfernt", role_changed: "Rolle ge\u00e4ndert",
      login: "Anmeldung", password_changed: "Passwort ge\u00e4ndert",
      match_found: "Match gefunden", notification_sent: "Benachrichtigung gesendet",
      listing_viewed: "Inserat angesehen", listing_clicked: "Inserat geklickt", listing_matched: "Inserat gematcht"
    };

    var EVENT_ICONS = {
      supplier_invited: "&#129309;", supplier_approved: "&#9989;", supplier_blocked: "&#128683;",
      requisition_created: "&#128196;", requisition_distributed: "&#128228;", requisition_filled: "&#9989;",
      offer_submitted: "&#128228;", offer_created: "&#128228;", offer_accepted: "&#9989;",
      offer_rejected: "&#10060;", offer_withdrawn: "&#8617;",
      deal_completed: "&#127881;", deal_cancelled: "&#128683;",
      rating_submitted: "&#11088;",
      capacity_published: "&#128259;", capacity_expired: "&#9203;", capacity_filled: "&#9989;", capacity_interest: "&#128065;",
      assignment_started: "&#128188;", assignment_completed: "&#9989;",
      profile_updated: "&#128100;", search_job_created: "&#128269;", search_job_closed: "&#128269;",
      document_uploaded: "&#128206;", document_verified: "&#128737;", document_expired: "&#9203;",
      org_created: "&#127970;", org_updated: "&#127970;",
      member_added: "&#128101;", member_removed: "&#128101;", role_changed: "&#128101;",
      login: "&#128274;", password_changed: "&#128274;",
      match_found: "&#11088;", notification_sent: "&#128276;",
      listing_viewed: "&#128065;", listing_clicked: "&#128065;", listing_matched: "&#11088;"
    };

    var PREF_CATEGORIES = [
      { key: "requisition", label: "Arbeitsplatzangebote & Freigaben" },
      { key: "offer", label: "Angebote" },
      { key: "compliance", label: "Compliance & Dokumente" },
      { key: "capacity", label: "Vermittlung" },
      { key: "deal", label: "Deals & Vertr\u00e4ge" },
      { key: "timesheet", label: "Stundenzettel" },
      { key: "system", label: "System & Allgemein" }
    ];

    /* ── State ─────────────────────────────────── */
    var _csrf = null;
    var _catFilter = "all";
    var _sevFilter = "all";
    var _offset = 0;
    var _allNotifs = [];
    var _alertsOffset = 0;
    var _allAlerts = [];
    var _maFilter = "all";
    var LIMIT = 50;
    var ACTIVITY_FILTER_STORAGE_KEY = "tc.activity.filters.v1";

    function readStoredActivityFilters() {
      try {
        var raw = sessionStorage.getItem(ACTIVITY_FILTER_STORAGE_KEY);
        if (!raw) return {};
        var parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (e) { return {}; }
    }

    function writeStoredActivityFilters(filters) {
      try { sessionStorage.setItem(ACTIVITY_FILTER_STORAGE_KEY, JSON.stringify(filters || {})); }
      catch (e) { /* Session-Storage kann lokal blockiert sein. */ }
    }

    function readUrlActivityFilters() {
      var params = new URLSearchParams(window.location.search || "");
      var filters = {};
      if (params.has("notif_cat")) filters.cat = params.get("notif_cat") || "";
      if (params.has("notif_sev")) filters.sev = params.get("notif_sev") || "";
      if (params.has("activity_type")) filters.activityType = params.get("activity_type") || "";
      if (params.has("activity_range")) filters.activityRange = params.get("activity_range") || "";
      if (params.has("match_alert")) filters.matchAlert = params.get("match_alert") || "";
      return filters;
    }

    function setActiveFilterButtons(attr, value) {
      document.querySelectorAll("[" + attr + "]").forEach(function (btn) {
        btn.classList.toggle("ac-filter-btn--active", btn.getAttribute(attr) === value);
      });
    }

    function applyActivityFilterDefaults() {
      var urlFilters = readUrlActivityFilters();
      var hasUrlFilters = Object.keys(urlFilters).length > 0;
      var stored = hasUrlFilters ? {} : readStoredActivityFilters();
      var cat = urlFilters.cat || stored.cat || "all";
      var sev = urlFilters.sev || stored.sev || "all";
      var ma = urlFilters.matchAlert || stored.matchAlert || "all";
      if (!document.querySelector('[data-cat="' + cat + '"]')) cat = "all";
      if (!document.querySelector('[data-sev="' + sev + '"]')) sev = "all";
      if (!document.querySelector('[data-ma="' + ma + '"]')) ma = "all";
      _catFilter = cat;
      _sevFilter = sev;
      _maFilter = ma;
      setActiveFilterButtons("data-cat", _catFilter);
      setActiveFilterButtons("data-sev", _sevFilter);
      setActiveFilterButtons("data-ma", _maFilter);

      var typeSelect = document.getElementById("af-type-filter");
      var rangeSelect = document.getElementById("af-range-filter");
      var activityType = urlFilters.activityType || stored.activityType || "";
      var activityRange = urlFilters.activityRange || stored.activityRange || (rangeSelect ? rangeSelect.value : "");
      if (typeSelect && activityType) {
        var hasType = Array.prototype.some.call(typeSelect.options, function (opt) { return opt.value === activityType; });
        if (hasType) typeSelect.value = activityType;
      }
      if (rangeSelect && activityRange) {
        var hasRange = Array.prototype.some.call(rangeSelect.options, function (opt) { return opt.value === activityRange; });
        if (hasRange) rangeSelect.value = activityRange;
      }
    }

    function persistActivityFilters() {
      writeStoredActivityFilters({
        cat: _catFilter,
        sev: _sevFilter,
        matchAlert: _maFilter,
        activityType: document.getElementById("af-type-filter").value || "",
        activityRange: document.getElementById("af-range-filter").value || ""
      });
    }

    /* ── Helpers ───────────────────────────────── */
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
      if (diff < 604800) return Math.floor(diff / 86400) + " Tg.";
      return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
    }

    function dateGroup(iso) {
      var d = new Date(iso);
      var now = new Date();
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
      var weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
      if (d >= today) return "Heute";
      if (d >= yesterday) return "Gestern";
      if (d >= weekAgo) return "Diese Woche";
      return "\u00c4lter";
    }

    function resolveLink(n) {
      if (n.link_path) return n.link_path;
      var type = n.entity_type;
      var id = n.entity_id;
      if (!type) return null;
      var routes = {
        search_job:          "/public/sla_search_job_detail.html" + (id ? "?id=" + encodeURIComponent(id) : ""),
        capacity_request:    "/public/company_requests.html",
        demand_request:      "/public/company_requests.html",
        offer:               "/public/agency_inbox.html",
        capacity_offer:      "/public/agency_inbox.html",
        requisition:         "/public/requisitions.html",
        timesheet:           "/public/timesheets.html",
        worker_timesheet:    "/public/timesheets.html",
        compliance_document: "/public/compliance_overview.html",
        vendor_pool:         "/public/vendor_pool.html",
        worker_assignment:   "/public/timesheets.html",
        assignment:          "/public/timesheets.html",
        deal:                "/public/company_requests.html",
        capacity:            "/public/capacity_exchange_manage.html",
        demand:              "/public/capacity_exchange_feed.html",
        contract:            "/public/timesheets.html",
        supplier:            "/public/vendor_pool.html"
      };
      return routes[type] || null;
    }

    /* ── Tab Switching ─────────────────────────── */
    function initTabs() {
      document.querySelectorAll(".ac-tab").forEach(function (tab) {
        tab.addEventListener("click", function () {
          document.querySelectorAll(".ac-tab").forEach(function (t) { t.classList.remove("ac-tab--active"); });
          document.querySelectorAll(".ac-pane").forEach(function (p) { p.classList.remove("ac-pane--active"); });
          tab.classList.add("ac-tab--active");
          var pane = document.getElementById("pane-" + tab.getAttribute("data-tab"));
          if (pane) pane.classList.add("ac-pane--active");
        });
      });
    }

    /* ══════════════════════════════════════════════
       NOTIFICATIONS TAB
       ══════════════════════════════════════════════ */

    function getFilteredNotifs() {
      var items = _allNotifs;
      if (_catFilter !== "all" && CAT_TYPES[_catFilter]) {
        var types = CAT_TYPES[_catFilter];
        items = items.filter(function (n) { return types.indexOf(n.type) !== -1; });
      }
      if (_sevFilter === "unread") items = items.filter(function (n) { return !n.is_read; });
      else if (_sevFilter !== "all") items = items.filter(function (n) { return n.severity === _sevFilter; });
      return items;
    }

    function renderNotifs() {
      var list = document.getElementById("notif-list");
      var filtered = getFilteredNotifs();
      if (!filtered.length) {
        var msg = _sevFilter === "unread" ? "Keine ungelesenen Benachrichtigungen" : "Keine Benachrichtigungen in dieser Kategorie";
        list.innerHTML = '<div class="ac-empty"><div class="ac-empty__icon">&#128276;</div><div class="ac-empty__text">' + esc(msg) + '</div></div>';
        return;
      }
      var html = "";
      var lastGroup = "";
      filtered.forEach(function (n) {
        var group = dateGroup(n.created_at);
        if (group !== lastGroup) {
          html += '<div class="ac-date-group">' + esc(group) + '</div>';
          lastGroup = group;
        }
        var link = resolveLink(n);
        var cls = n.is_read ? "ac-item ac-item--read" : "ac-item ac-item--unread";
        var icon = SEVERITY_ICONS[n.severity] || "\uD83D\uDD35";
        var typeLabel = TYPE_LABELS[n.type] || n.type || "";
        var msg = (n.message && n.message !== n.title) ? n.message : "";
        var arrow = link ? '<span class="ac-arrow">\u2192</span>' : "";

        html += '<div class="' + cls + '" data-nid="' + esc(n.id) + '"' + (link ? ' data-link="' + esc(link) + '"' : '') + '>' +
          '<div class="ac-icon ac-icon--' + esc(n.severity || "info") + '">' + icon + '</div>' +
          '<div class="ac-body">' +
          '<div class="ac-title">' + esc(n.title || "Benachrichtigung") + '</div>' +
          (msg ? '<div class="ac-msg">' + esc(msg.substring(0, 200)) + '</div>' : '') +
          '<div class="ac-meta">' +
          '<span>' + relTime(n.created_at) + '</span>' +
          (typeLabel ? '<span class="ac-cat-badge">' + esc(typeLabel) + '</span>' : '') +
          (!n.is_read ? '<span style="color:var(--ds-brand);font-weight:600">\u25CF Ungelesen</span>' : '') +
          '</div></div>' + arrow + '</div>';
      });
      list.innerHTML = html;
    }

    function updateUnreadBadge() {
      fetch("/api/notifications/unread-count", { credentials: "include" })
        .then(function (r) { return r.ok ? r.json() : { count: 0 }; })
        .then(function (d) {
          var badge = document.getElementById("unread-badge");
          var tabBadge = document.getElementById("tab-notif-badge");
          if (d.count > 0) {
            badge.style.display = ""; badge.textContent = d.count;
            tabBadge.textContent = d.count;
          } else {
            badge.style.display = "none"; tabBadge.textContent = "";
          }
        }).catch(function () {});
    }

    function loadNotifications(append) {
      var url = "/api/notifications?limit=" + LIMIT + "&offset=" + _offset;
      fetch(url, { credentials: "include" })
        .then(function (r) { return r.ok ? r.json() : { items: [] }; })
        .then(function (d) {
          var items = d.items || [];
          if (append) { _allNotifs = _allNotifs.concat(items); } else { _allNotifs = items; }
          renderNotifs();
          updateUnreadBadge();
          var loadMore = document.getElementById("btn-load-more");
          loadMore.style.display = items.length >= LIMIT ? "" : "none";
        })
        .catch(function () {
          document.getElementById("notif-list").innerHTML = '<div class="ac-empty"><div class="ac-empty__icon">&#9888;</div><div class="ac-empty__text">Fehler beim Laden der Benachrichtigungen</div></div>';
        });
    }

    function markRead(nid) {
      return getCsrf().then(function (token) {
        return fetch("/api/notifications/" + nid + "/read", {
          method: "PATCH", credentials: "include",
          headers: { "Content-Type": "application/json", "x-csrf-token": token || "" }
        });
      });
    }

    function markAllRead() {
      return getCsrf().then(function (token) {
        return fetch("/api/notifications/read-all", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json", "x-csrf-token": token || "" }
        });
      });
    }

    /* ══════════════════════════════════════════════
       ACTIVITY FEED TAB
       ══════════════════════════════════════════════ */

    function loadActivityFeed() {
      var type = document.getElementById("af-type-filter").value;
      var days = document.getElementById("af-range-filter").value;
      var to = new Date().toISOString();
      var from = new Date(Date.now() - days * 86400000).toISOString();
      var url = "/api/activity-feed?limit=50&from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to);
      if (type) url += "&type=" + encodeURIComponent(type);

      var el = document.getElementById("activity-list");
      el.innerHTML = '<div class="ac-empty"><div class="ac-empty__icon">&#128200;</div><div class="ac-empty__text">Lade Aktivit\u00e4ten&hellip;</div></div>';

      fetch(url, { credentials: "include" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d) { el.innerHTML = '<div class="ac-empty"><div class="ac-empty__icon">&#128683;</div><div class="ac-empty__text">Feed nicht verf\u00fcgbar</div></div>'; return; }
          var items = (d.data && d.data.items) || [];
          if (!items.length) { el.innerHTML = '<div class="ac-empty"><div class="ac-empty__icon">&#128200;</div><div class="ac-empty__text">Keine Aktivit\u00e4ten im ausgew\u00e4hlten Zeitraum</div></div>'; return; }

          var html = "";
          var lastGroup = "";
          items.forEach(function (ev) {
            var group = dateGroup(ev.created_at);
            if (group !== lastGroup) {
              html += '<div class="ac-date-group">' + esc(group) + '</div>';
              lastGroup = group;
            }
            var label = ev.label || EVENT_LABELS[ev.event_type] || ev.event_type || "";
            var icon = ev.icon || EVENT_ICONS[ev.event_type] || "&#128308;";
            var actor = ev.actor_name || ev.actor_email || "";
            // Deep-Link auf den konkreten Vorgang (P4.4) — ein Verlaufseintrag, der auf
            // etwas verweist, muss auch dorthin fuehren.
            var link = ev.link_path || resolveLink(ev);
            html += '<div class="ac-timeline-item' + (link ? ' ac-timeline-item--link' : '') + '"' +
              (link ? ' data-link="' + esc(link) + '" role="link" tabindex="0"' : '') + '>' +
              '<div class="ac-timeline-icon">' + icon + '</div>' +
              '<div class="ac-timeline-body">' +
              '<div class="ac-timeline-label">' + esc(label) +
              (actor ? ' <span class="ac-timeline-actor">von ' + esc(actor) + '</span>' : '') +
              (link ? ' <span class="ac-arrow">→</span>' : '') +
              '</div>' +
              '<div class="ac-timeline-time">' + relTime(ev.created_at) + '</div>' +
              '</div></div>';
          });
          el.innerHTML = html;
        })
        .catch(function (e) {
          el.innerHTML = '<div class="ac-empty"><div class="ac-empty__icon">&#9888;</div><div class="ac-empty__text">Fehler: ' + esc(e.message) + '</div></div>';
        });
    }

    /* ══════════════════════════════════════════════
       MATCH-ALERTS TAB
       ══════════════════════════════════════════════ */

    function loadAlerts(append) {
      var url = "/api/match-alerts?limit=" + LIMIT + "&offset=" + _alertsOffset;
      if (_maFilter === "unread") url += "&unread=true";

      fetch(url, { credentials: "include" })
        .then(function (r) { return r.ok ? r.json() : { items: [] }; })
        .then(function (d) {
          var items = d.items || [];
          if (append) { _allAlerts = _allAlerts.concat(items); } else { _allAlerts = items; }
          renderAlerts();
          updateAlertsBadge();
          document.getElementById("btn-alerts-more").style.display = items.length >= LIMIT ? "" : "none";
        })
        .catch(function () {
          document.getElementById("alerts-list").innerHTML = '<div class="ac-empty"><div class="ac-empty__icon">&#9888;</div><div class="ac-empty__text">Fehler beim Laden</div></div>';
        });
    }

    function renderAlerts() {
      var el = document.getElementById("alerts-list");
      if (!_allAlerts.length) {
        el.innerHTML = '<div class="ac-empty"><div class="ac-empty__icon">&#11088;</div><div class="ac-empty__text">Keine Match-Alerts vorhanden</div></div>';
        return;
      }
      var html = "";
      var lastGroup = "";
      _allAlerts.forEach(function (a) {
        var group = dateGroup(a.created_at);
        if (group !== lastGroup) {
          html += '<div class="ac-date-group">' + esc(group) + '</div>';
          lastGroup = group;
        }
        var cls = a.is_read ? "ac-item ac-item--read" : "ac-item ac-item--unread";
        var title = a.title || ("Match: " + (a.match_count || 0) + " Treffer");
        var msg = a.message || "";
        var link = a.link_path || null;
        var score = (a.match_score != null) ? (Math.round(a.match_score) + "% Match") : "";
        html += '<div class="' + cls + '" data-maid="' + esc(a.id) + '"' +
          (link ? ' data-link="' + esc(link) + '"' : '') + '>' +
          '<div class="ac-icon ac-icon--info">&#11088;</div>' +
          '<div class="ac-body">' +
          '<div class="ac-title">' + esc(title) + (link ? ' <span class="ac-arrow">→</span>' : '') + '</div>' +
          (msg ? '<div class="ac-msg">' + esc(msg.substring(0, 200)) + '</div>' : '') +
          '<div class="ac-meta"><span>' + relTime(a.created_at) + '</span>' +
          (score ? '<span>' + esc(score) + '</span>' : '') +
          (!a.is_read ? '<span style="color:var(--ds-brand);font-weight:600">\u25CF Ungelesen</span>' : '') +
          '</div></div></div>';
      });
      el.innerHTML = html;
    }

    function updateAlertsBadge() {
      fetch("/api/match-alerts/unread-count", { credentials: "include" })
        .then(function (r) { return r.ok ? r.json() : { count: 0 }; })
        .then(function (d) {
          var badge = document.getElementById("tab-alerts-badge");
          badge.textContent = d.count > 0 ? d.count : "";
        }).catch(function () {});
    }

    function markAlertRead(id) {
      return getCsrf().then(function (token) {
        return fetch("/api/match-alerts/" + id + "/read", {
          method: "PATCH", credentials: "include",
          headers: { "Content-Type": "application/json", "x-csrf-token": token || "" }
        });
      });
    }

    /* ══════════════════════════════════════════════
       NOTIFICATION PREFERENCES
       ══════════════════════════════════════════════ */

    var _prefs = {};

    function loadPrefs() {
      fetch("/api/notification-preferences", { credentials: "include" })
        .then(function (r) { return r.ok ? r.json() : { items: [] }; })
        .then(function (d) {
          var items = d.items || [];
          items.forEach(function (p) { _prefs[p.event_category] = p; });
          renderPrefs();
        })
        .catch(function () {});
    }

    function renderPrefs() {
      var el = document.getElementById("prefs-list");
      el.innerHTML = PREF_CATEGORIES.map(function (cat) {
        var p = _prefs[cat.key] || { channel_in_app: true, channel_email: false };
        return '<div class="ac-pref-row">' +
          '<span>' + esc(cat.label) + '</span>' +
          '<div class="ac-pref-toggles">' +
          '<label class="ac-toggle"><input type="checkbox" data-pref="' + esc(cat.key) + '" data-channel="in_app" ' + (p.channel_in_app !== false ? 'checked' : '') + '/> In-App</label>' +
          '<label class="ac-toggle"><input type="checkbox" data-pref="' + esc(cat.key) + '" data-channel="email" ' + (p.channel_email ? 'checked' : '') + '/> E-Mail</label>' +
          '</div></div>';
      }).join("");
    }

    function savePrefs() {
      var prefs = PREF_CATEGORIES.map(function (cat) {
        var inApp = document.querySelector('[data-pref="' + cat.key + '"][data-channel="in_app"]');
        var email = document.querySelector('[data-pref="' + cat.key + '"][data-channel="email"]');
        return {
          event_category: cat.key,
          channel_in_app: inApp ? inApp.checked : true,
          channel_email: email ? email.checked : false
        };
      });
      getCsrf().then(function (token) {
        return fetch("/api/notification-preferences", {
          method: "PUT", credentials: "include",
          headers: { "Content-Type": "application/json", "x-csrf-token": token || "" },
          body: JSON.stringify({ preferences: prefs })
        });
      }).then(function (r) {
        if (r.ok) {
          var btn = document.getElementById("btn-save-prefs");
          btn.textContent = "\u2713 Gespeichert!";
          setTimeout(function () { btn.textContent = "Einstellungen speichern"; }, 2000);
        }
      });
    }

    /* ══════════════════════════════════════════════
       INIT
       ══════════════════════════════════════════════ */

    function init() {
      applyActivityFilterDefaults();
      initTabs();
      loadNotifications(false);
      loadPrefs();

      /* ── Category filter (notifications) ── */
      document.querySelectorAll("[data-cat]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          document.querySelectorAll("[data-cat]").forEach(function (b) { b.classList.remove("ac-filter-btn--active"); });
          btn.classList.add("ac-filter-btn--active");
          _catFilter = btn.getAttribute("data-cat");
          persistActivityFilters();
          renderNotifs();
        });
      });

      /* ── Severity / Unread filter ── */
      document.querySelectorAll("[data-sev]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          document.querySelectorAll("[data-sev]").forEach(function (b) { b.classList.remove("ac-filter-btn--active"); });
          btn.classList.add("ac-filter-btn--active");
          _sevFilter = btn.getAttribute("data-sev");
          persistActivityFilters();
          renderNotifs();
        });
      });

      /* ── Mark all read ── */
      document.getElementById("btn-read-all").addEventListener("click", function () {
        markAllRead().then(function () {
          _allNotifs.forEach(function (n) { n.is_read = true; });
          renderNotifs();
          updateUnreadBadge();
        });
      });

      /* ── Click notification row ── */
      document.getElementById("notif-list").addEventListener("click", function (e) {
        var row = e.target.closest("[data-nid]");
        if (!row) return;
        var nid = row.getAttribute("data-nid");
        var link = row.getAttribute("data-link");
        markRead(nid).then(function () {
          var item = _allNotifs.find(function (n) { return n.id === nid; });
          if (item) item.is_read = true;
          if (link) { window.location.href = link; }
          else { renderNotifs(); updateUnreadBadge(); }
        });
      });

      /* ── Klick auf Verlaufseintrag (P4.4: der Verlauf ist kein Endpunkt) ── */
      (function () {
        var list = document.getElementById("activity-list");
        if (!list) return;
        function openEntry(e) {
          var row = e.target.closest("[data-link]");
          if (!row) return;
          if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          window.location.href = row.getAttribute("data-link");
        }
        list.addEventListener("click", openEntry);
        list.addEventListener("keydown", openEntry);
      })();

      /* ── Load more notifications ── */
      document.getElementById("btn-load-more").addEventListener("click", function () {
        _offset += LIMIT;
        loadNotifications(true);
      });

      /* ── Activity Feed ── */
      document.getElementById("af-type-filter").addEventListener("change", function () { persistActivityFilters(); loadActivityFeed(); });
      document.getElementById("af-range-filter").addEventListener("change", function () { persistActivityFilters(); loadActivityFeed(); });
      /* Lazy-load activity feed when tab is activated */
      var afLoaded = false;
      document.querySelector('[data-tab="activity"]').addEventListener("click", function () {
        if (!afLoaded) { afLoaded = true; loadActivityFeed(); }
      });

      /* ── Match-Alerts ── */
      document.querySelectorAll("[data-ma]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          document.querySelectorAll("[data-ma]").forEach(function (b) { b.classList.remove("ac-filter-btn--active"); });
          btn.classList.add("ac-filter-btn--active");
          _maFilter = btn.getAttribute("data-ma");
          _alertsOffset = 0;
          persistActivityFilters();
          loadAlerts(false);
        });
      });
      document.getElementById("btn-alerts-more").addEventListener("click", function () {
        _alertsOffset += LIMIT;
        loadAlerts(true);
      });
      document.getElementById("alerts-list").addEventListener("click", function (e) {
        var row = e.target.closest("[data-maid]");
        if (!row) return;
        var id = row.getAttribute("data-maid");
        var alertLink = row.getAttribute("data-link");
        markAlertRead(id).then(function () {
          var item = _allAlerts.find(function (a) { return a.id === id; });
          if (item) item.is_read = true;
          if (alertLink) { window.location.href = alertLink; return; }
          renderAlerts();
          updateAlertsBadge();
        });
      });
      var alertsLoaded = false;
      document.querySelector('[data-tab="alerts"]').addEventListener("click", function () {
        if (!alertsLoaded) { alertsLoaded = true; loadAlerts(false); }
      });

      /* ── Settings panel toggle ── */
      document.getElementById("btn-settings-toggle").addEventListener("click", function () {
        document.getElementById("settings-panel").classList.toggle("ac-settings--open");
      });
      document.getElementById("btn-save-prefs").addEventListener("click", savePrefs);

      /* ── Poll unread every 60s ── */
      setInterval(function () { updateUnreadBadge(); updateAlertsBadge(); }, 60000);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  })();