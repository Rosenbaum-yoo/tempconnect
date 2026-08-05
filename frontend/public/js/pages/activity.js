/* ═══════════════════════════════════════════════════════
   Activity Center — Page Logic
   ═══════════════════════════════════════════════════════ */
  (function () {
    "use strict";

    /* ── Woerterbuch (P6.1, DE/EN) ────────────────────────────────────────────
       activity.html laedt i18n.js im head, dieses Modul laeuft ausschliesslich
       dort — TCi18n ist hier also garantiert vorhanden.

       Bewusst NICHT hier uebersetzt:
       - Der Filter-Chip "Arbeitsplatzangebote" (data-cat="requisition"): ein
         rollenabhaengiger Begriff (terminologyLabels.js: demandList — ein
         Personaldienstleister liest "Offene Arbeitsplatzangebote"). Als fester
         Woerterbuch-Wert wuerde eine Rolle die Sprache der Gegenseite lesen.
         Er wird am Ende von activity.html ueber TC.terminology.get() rollen-
         UND sprachrichtig gesetzt und traegt deshalb KEINEN data-i18n-Marker.
       - Topbar, Navigation, Nutzerbereich, Sprach-Umschalter (pageShell.js)
       - option[value] der Event-/Zeitraumfilter und die Rohwerte in
         data-cat/data-sev/data-ma (Filterlogik bzw. Server)
       - API-Daten: Meldungstitel/-text, Akteursnamen, Match-Scores            */
    TCi18n.register('de', {
      'doc.act.docTitle': 'Activity Center – TempConnect',
      'doc.act.page.subtitle': 'Benachrichtigungen, Plattform-Aktivitäten und Match-Alerts – alles an einem Ort.',
      'doc.act.btn.settings': 'Einstellungen',
      'doc.act.btn.settingsTitle': 'Einstellungen',
      'doc.act.btn.readAll': 'Alle gelesen',
      'doc.act.btn.readAllTitle': 'Alle als gelesen markieren',

      'doc.act.onb.title': 'Plattform einrichten',
      'doc.act.onb.toggleTitle': 'Auf-/Zuklappen',
      'doc.act.onb.dismissTitle': 'Ausblenden',

      'doc.act.tab.notifications': 'Benachrichtigungen',
      'doc.act.tab.activity': 'Aktivitäten',
      'doc.act.tab.alerts': 'Match-Alerts',

      'doc.act.cat.all': 'Alle',
      'doc.act.cat.offer': 'Angebote',
      'doc.act.cat.compliance': 'Compliance',
      'doc.act.cat.capacity': 'Personal',
      'doc.act.cat.deal': 'Deals',
      'doc.act.cat.timesheet': 'Timesheets',
      'doc.act.cat.system': 'System',

      'doc.act.sev.all': 'Alle Stufen',
      'doc.act.sev.unread': 'Ungelesen',
      'doc.act.sev.info': 'Info',
      'doc.act.sev.success': 'Erfolg',
      'doc.act.sev.warning': 'Warnung',
      'doc.act.sev.error': 'Fehler',

      'doc.act.loadMore': 'Weitere laden…',

      'doc.act.ma.all': 'Alle',
      'doc.act.ma.unread': 'Ungelesen',

      'doc.act.feed.allTypes': 'Alle Event-Typen',
      'doc.act.feed.range7': 'Letzte 7 Tage',
      'doc.act.feed.range30': 'Letzte 30 Tage',
      'doc.act.feed.range90': 'Letzte 90 Tage',

      'doc.act.prefs.heading': 'Benachrichtigungs-Einstellungen',
      'doc.act.prefs.intro': 'Wählen Sie, welche Benachrichtigungen Sie In-App und per E-Mail erhalten möchten.',
      'doc.act.prefs.loading': 'Lade Einstellungen…',
      'doc.act.prefs.save': 'Einstellungen speichern',
      'doc.act.prefs.saved': 'Gespeichert!',
      'doc.act.prefs.inApp': 'In-App',
      'doc.act.prefs.email': 'E-Mail',

      'doc.act.pref.requisition': 'Arbeitsplatzangebote & Freigaben',
      'doc.act.pref.offer': 'Angebote',
      'doc.act.pref.compliance': 'Compliance & Dokumente',
      'doc.act.pref.capacity': 'Vermittlung',
      'doc.act.pref.deal': 'Deals & Verträge',
      'doc.act.pref.timesheet': 'Stundenzettel',
      'doc.act.pref.system': 'System & Allgemein',

      'doc.act.type.requisition': 'Arbeitsplatzangebot',
      'doc.act.type.offer': 'Angebot',
      'doc.act.type.compliance': 'Compliance',
      'doc.act.type.sla': 'SLA',
      'doc.act.type.vendor': 'Lieferanten',
      'doc.act.type.capacity': 'Personal',
      'doc.act.type.deal': 'Deal',
      'doc.act.type.emergency': 'Notdienst',
      'doc.act.type.timesheet': 'Timesheet',
      'doc.act.type.system': 'System',

      'doc.act.time.now': 'gerade eben',
      'doc.act.time.min': 'Min.',
      'doc.act.time.hour': 'Std.',
      'doc.act.time.day': 'Tg.',
      'doc.act.group.today': 'Heute',
      'doc.act.group.yesterday': 'Gestern',
      'doc.act.group.week': 'Diese Woche',
      'doc.act.group.older': 'Älter',

      'doc.act.notif.loading': 'Lade Benachrichtigungen…',
      'doc.act.notif.emptyUnread': 'Keine ungelesenen Benachrichtigungen',
      'doc.act.notif.emptyCat': 'Keine Benachrichtigungen in dieser Kategorie',
      'doc.act.notif.error': 'Fehler beim Laden der Benachrichtigungen',
      'doc.act.notif.fallbackTitle': 'Benachrichtigung',
      'doc.act.notif.unread': 'Ungelesen',

      'doc.act.feed.loading': 'Lade Aktivitäten…',
      'doc.act.feed.unavailable': 'Feed nicht verfügbar',
      'doc.act.feed.empty': 'Keine Aktivitäten im ausgewählten Zeitraum',
      'doc.act.feed.error': 'Fehler: {detail}',
      'doc.act.feed.by': 'von {actor}',

      'doc.act.alerts.loading': 'Lade Match-Alerts…',
      'doc.act.alerts.empty': 'Keine Match-Alerts vorhanden',
      'doc.act.alerts.error': 'Fehler beim Laden',
      'doc.act.alerts.titleFallback': 'Match: {count} Treffer',
      'doc.act.alerts.score': '{score}% Match',

      'doc.act.event.supplier_invited': 'Lieferant eingeladen',
      'doc.act.event.supplier_approved': 'Lieferant freigeschaltet',
      'doc.act.event.supplier_blocked': 'Lieferant gesperrt',
      'doc.act.event.requisition_created': 'Arbeitsplatzangebot erstellt',
      'doc.act.event.requisition_distributed': 'Arbeitsplatzangebot verteilt',
      'doc.act.event.requisition_filled': 'Arbeitsplatzangebot besetzt',
      'doc.act.event.offer_submitted': 'Angebot eingereicht',
      'doc.act.event.offer_created': 'Angebot erstellt',
      'doc.act.event.offer_accepted': 'Angebot angenommen',
      'doc.act.event.offer_rejected': 'Angebot abgelehnt',
      'doc.act.event.offer_withdrawn': 'Angebot zurückgezogen',
      'doc.act.event.deal_completed': 'Deal abgeschlossen',
      'doc.act.event.deal_cancelled': 'Deal storniert',
      'doc.act.event.rating_submitted': 'Bewertung abgegeben',
      'doc.act.event.capacity_published': 'Personal eingestellt',
      'doc.act.event.capacity_expired': 'Personalangebot abgelaufen',
      'doc.act.event.capacity_filled': 'Personal zugewiesen',
      'doc.act.event.capacity_interest': 'Interesse an Personal',
      'doc.act.event.assignment_started': 'Einsatz gestartet',
      'doc.act.event.assignment_completed': 'Einsatz abgeschlossen',
      'doc.act.event.profile_updated': 'Profil aktualisiert',
      'doc.act.event.search_job_created': 'Suchauftrag erstellt',
      'doc.act.event.search_job_closed': 'Suchauftrag geschlossen',
      'doc.act.event.document_uploaded': 'Dokument hochgeladen',
      'doc.act.event.document_verified': 'Dokument verifiziert',
      'doc.act.event.document_expired': 'Dokument abgelaufen',
      'doc.act.event.org_created': 'Organisation erstellt',
      'doc.act.event.org_updated': 'Organisation aktualisiert',
      'doc.act.event.member_added': 'Mitglied hinzugefügt',
      'doc.act.event.member_removed': 'Mitglied entfernt',
      'doc.act.event.role_changed': 'Rolle geändert',
      'doc.act.event.login': 'Anmeldung',
      'doc.act.event.password_changed': 'Passwort geändert',
      'doc.act.event.match_found': 'Match gefunden',
      'doc.act.event.notification_sent': 'Benachrichtigung gesendet',
      'doc.act.event.listing_viewed': 'Inserat angesehen',
      'doc.act.event.listing_clicked': 'Inserat geklickt',
      'doc.act.event.listing_matched': 'Inserat gematcht'
    });
    TCi18n.register('en', {
      'doc.act.docTitle': 'Activity Center – TempConnect',
      'doc.act.page.subtitle': 'Notifications, platform activity and match alerts – all in one place.',
      'doc.act.btn.settings': 'Settings',
      'doc.act.btn.settingsTitle': 'Settings',
      'doc.act.btn.readAll': 'All read',
      'doc.act.btn.readAllTitle': 'Mark everything as read',

      'doc.act.onb.title': 'Set up the platform',
      'doc.act.onb.toggleTitle': 'Expand / collapse',
      'doc.act.onb.dismissTitle': 'Hide',

      'doc.act.tab.notifications': 'Notifications',
      'doc.act.tab.activity': 'Activity',
      'doc.act.tab.alerts': 'Match alerts',

      'doc.act.cat.all': 'All',
      'doc.act.cat.offer': 'Offers',
      'doc.act.cat.compliance': 'Compliance',
      'doc.act.cat.capacity': 'Staff',
      'doc.act.cat.deal': 'Deals',
      'doc.act.cat.timesheet': 'Timesheets',
      'doc.act.cat.system': 'System',

      'doc.act.sev.all': 'All levels',
      'doc.act.sev.unread': 'Unread',
      'doc.act.sev.info': 'Info',
      'doc.act.sev.success': 'Success',
      'doc.act.sev.warning': 'Warning',
      'doc.act.sev.error': 'Error',

      'doc.act.loadMore': 'Load more…',

      'doc.act.ma.all': 'All',
      'doc.act.ma.unread': 'Unread',

      'doc.act.feed.allTypes': 'All event types',
      'doc.act.feed.range7': 'Last 7 days',
      'doc.act.feed.range30': 'Last 30 days',
      'doc.act.feed.range90': 'Last 90 days',

      'doc.act.prefs.heading': 'Notification settings',
      'doc.act.prefs.intro': 'Choose which notifications you want to receive in-app and by email.',
      'doc.act.prefs.loading': 'Loading settings…',
      'doc.act.prefs.save': 'Save settings',
      'doc.act.prefs.saved': 'Saved!',
      'doc.act.prefs.inApp': 'In-app',
      'doc.act.prefs.email': 'Email',

      'doc.act.pref.requisition': 'Job postings & approvals',
      'doc.act.pref.offer': 'Offers',
      'doc.act.pref.compliance': 'Compliance & documents',
      'doc.act.pref.capacity': 'Matching',
      'doc.act.pref.deal': 'Deals & contracts',
      'doc.act.pref.timesheet': 'Timesheets',
      'doc.act.pref.system': 'System & general',

      'doc.act.type.requisition': 'Job posting',
      'doc.act.type.offer': 'Offer',
      'doc.act.type.compliance': 'Compliance',
      'doc.act.type.sla': 'SLA',
      'doc.act.type.vendor': 'Suppliers',
      'doc.act.type.capacity': 'Staff',
      'doc.act.type.deal': 'Deal',
      'doc.act.type.emergency': 'Emergency cover',
      'doc.act.type.timesheet': 'Timesheet',
      'doc.act.type.system': 'System',

      'doc.act.time.now': 'just now',
      'doc.act.time.min': 'min',
      'doc.act.time.hour': 'h',
      'doc.act.time.day': 'd',
      'doc.act.group.today': 'Today',
      'doc.act.group.yesterday': 'Yesterday',
      'doc.act.group.week': 'This week',
      'doc.act.group.older': 'Older',

      'doc.act.notif.loading': 'Loading notifications…',
      'doc.act.notif.emptyUnread': 'No unread notifications',
      'doc.act.notif.emptyCat': 'No notifications in this category',
      'doc.act.notif.error': 'The notifications could not be loaded',
      'doc.act.notif.fallbackTitle': 'Notification',
      'doc.act.notif.unread': 'Unread',

      'doc.act.feed.loading': 'Loading activity…',
      'doc.act.feed.unavailable': 'Feed unavailable',
      'doc.act.feed.empty': 'No activity in the selected period',
      'doc.act.feed.error': 'Error: {detail}',
      'doc.act.feed.by': 'by {actor}',

      'doc.act.alerts.loading': 'Loading match alerts…',
      'doc.act.alerts.empty': 'No match alerts yet',
      'doc.act.alerts.error': 'Loading failed',
      'doc.act.alerts.titleFallback': 'Match: {count} hits',
      'doc.act.alerts.score': '{score}% match',

      'doc.act.event.supplier_invited': 'Supplier invited',
      'doc.act.event.supplier_approved': 'Supplier approved',
      'doc.act.event.supplier_blocked': 'Supplier blocked',
      'doc.act.event.requisition_created': 'Job posting created',
      'doc.act.event.requisition_distributed': 'Job posting distributed',
      'doc.act.event.requisition_filled': 'Job posting filled',
      'doc.act.event.offer_submitted': 'Offer submitted',
      'doc.act.event.offer_created': 'Offer created',
      'doc.act.event.offer_accepted': 'Offer accepted',
      'doc.act.event.offer_rejected': 'Offer rejected',
      'doc.act.event.offer_withdrawn': 'Offer withdrawn',
      'doc.act.event.deal_completed': 'Deal completed',
      'doc.act.event.deal_cancelled': 'Deal cancelled',
      'doc.act.event.rating_submitted': 'Rating submitted',
      'doc.act.event.capacity_published': 'Staff listed',
      'doc.act.event.capacity_expired': 'Staff offer expired',
      'doc.act.event.capacity_filled': 'Staff assigned',
      'doc.act.event.capacity_interest': 'Interest in staff',
      'doc.act.event.assignment_started': 'Assignment started',
      'doc.act.event.assignment_completed': 'Assignment completed',
      'doc.act.event.profile_updated': 'Profile updated',
      'doc.act.event.search_job_created': 'Search request created',
      'doc.act.event.search_job_closed': 'Search request closed',
      'doc.act.event.document_uploaded': 'Document uploaded',
      'doc.act.event.document_verified': 'Document verified',
      'doc.act.event.document_expired': 'Document expired',
      'doc.act.event.org_created': 'Organisation created',
      'doc.act.event.org_updated': 'Organisation updated',
      'doc.act.event.member_added': 'Member added',
      'doc.act.event.member_removed': 'Member removed',
      'doc.act.event.role_changed': 'Role changed',
      'doc.act.event.login': 'Sign-in',
      'doc.act.event.password_changed': 'Password changed',
      'doc.act.event.match_found': 'Match found',
      'doc.act.event.notification_sent': 'Notification sent',
      'doc.act.event.listing_viewed': 'Listing viewed',
      'doc.act.event.listing_clicked': 'Listing clicked',
      'doc.act.event.listing_matched': 'Listing matched'
    });
    function t(key, params) { return TCi18n.t(key, params); }

    /* ── Constants ─────────────────────────────── */

    var SEVERITY_ICONS = { info: "\uD83D\uDD35", success: "\u2705", warning: "\u26A0\uFE0F", error: "\u274C", urgent: "\uD83D\uDD34" };

    /* Notification-Typ -> Begriffsgruppe. Der Rohwert bleibt die Wahrheit,
       die Beschriftung kommt zur Laufzeit aus dem Woerterbuch. */
    var TYPE_GROUPS = {
      requisition_approval: "requisition", requisition_filled: "requisition", requisition_cancelled: "requisition",
      offer_received: "offer", offer_accepted: "offer", offer_rejected: "offer",
      compliance_expiring: "compliance", compliance_expired: "compliance", compliance_verified: "compliance",
      sla_warning: "sla", sla_breached: "sla",
      vendor_pool_change: "vendor",
      capacity_interest: "capacity", capacity_expiring: "capacity", capacity_match: "capacity", capacity_stale: "capacity",
      demand_match: "capacity",
      deal_offer_sent: "deal", deal_accepted: "deal", deal_confirmed: "deal", deal_completed: "deal", deal_assignment_started: "deal", deal_staffing_ready: "deal",
      emergency_request: "emergency", emergency_escalation: "emergency",
      timesheet_submitted: "timesheet", timesheet_approved: "timesheet", timesheet_rejected: "timesheet", timesheet_signed: "timesheet",
      general: "system", system: "system"
    };
    function typeLabel(type) {
      var group = TYPE_GROUPS[type];
      return (group && t("doc.act.type." + group)) || type || "";
    }
    function eventLabel(eventType) {
      return (eventType && t("doc.act.event." + eventType)) || "";
    }

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

    /* Reihenfolge und Rohwerte der Praeferenz-Kategorien; die Beschriftung
       kommt zur Laufzeit aus dem Woerterbuch (doc.act.pref.<key>). */
    var PREF_CATEGORIES = ["requisition", "offer", "compliance", "capacity", "deal", "timesheet", "system"];
    function prefLabel(key) { return t("doc.act.pref." + key) || key; }

    /* ── State ─────────────────────────────────── */
    var _csrf = null;
    var _catFilter = "all";
    var _sevFilter = "all";
    var _offset = 0;
    var _allNotifs = [];
    var _alertsOffset = 0;
    var _allAlerts = [];
    var _maFilter = "all";
    /* Lazy-Tabs: erst nach dem ersten Laden darf ein Sprachwechsel neu rendern —
       sonst ersetzt er den Ladehinweis eines nie geoeffneten Tabs durch einen
       Leerzustand, der schlicht nicht stimmt. */
    var _afLoaded = false;
    var _alertsLoaded = false;
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
      if (diff < 60) return t("doc.act.time.now");
      if (diff < 3600) return Math.floor(diff / 60) + " " + t("doc.act.time.min");
      if (diff < 86400) return Math.floor(diff / 3600) + " " + t("doc.act.time.hour");
      if (diff < 604800) return Math.floor(diff / 86400) + " " + t("doc.act.time.day");
      return new Date(iso).toLocaleDateString(TCi18n.dateLocale(), { day: "2-digit", month: "2-digit", year: "numeric" });
    }

    function dateGroup(iso) {
      var d = new Date(iso);
      var now = new Date();
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
      var weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
      if (d >= today) return t("doc.act.group.today");
      if (d >= yesterday) return t("doc.act.group.yesterday");
      if (d >= weekAgo) return t("doc.act.group.week");
      return t("doc.act.group.older");
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
          document.querySelectorAll(".ac-tab").forEach(function (other) { other.classList.remove("ac-tab--active"); });
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
        var msg = _sevFilter === "unread" ? t("doc.act.notif.emptyUnread") : t("doc.act.notif.emptyCat");
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
        var badgeLabel = typeLabel(n.type);
        var msg = (n.message && n.message !== n.title) ? n.message : "";
        var arrow = link ? '<span class="ac-arrow">\u2192</span>' : "";

        html += '<div class="' + cls + '" data-nid="' + esc(n.id) + '"' + (link ? ' data-link="' + esc(link) + '"' : '') + '>' +
          '<div class="ac-icon ac-icon--' + esc(n.severity || "info") + '">' + icon + '</div>' +
          '<div class="ac-body">' +
          '<div class="ac-title">' + esc(n.title || t("doc.act.notif.fallbackTitle")) + '</div>' +
          (msg ? '<div class="ac-msg">' + esc(msg.substring(0, 200)) + '</div>' : '') +
          '<div class="ac-meta">' +
          '<span>' + relTime(n.created_at) + '</span>' +
          (badgeLabel ? '<span class="ac-cat-badge">' + esc(badgeLabel) + '</span>' : '') +
          (!n.is_read ? '<span style="color:var(--ds-brand);font-weight:600">\u25CF ' + esc(t("doc.act.notif.unread")) + '</span>' : '') +
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
          document.getElementById("notif-list").innerHTML = '<div class="ac-empty"><div class="ac-empty__icon">&#9888;</div><div class="ac-empty__text">' + esc(t("doc.act.notif.error")) + '</div></div>';
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
      el.innerHTML = '<div class="ac-empty"><div class="ac-empty__icon">&#128200;</div><div class="ac-empty__text">' + esc(t("doc.act.feed.loading")) + '</div></div>';

      fetch(url, { credentials: "include" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d) { el.innerHTML = '<div class="ac-empty"><div class="ac-empty__icon">&#128683;</div><div class="ac-empty__text">' + esc(t("doc.act.feed.unavailable")) + '</div></div>'; return; }
          var items = (d.data && d.data.items) || [];
          if (!items.length) { el.innerHTML = '<div class="ac-empty"><div class="ac-empty__icon">&#128200;</div><div class="ac-empty__text">' + esc(t("doc.act.feed.empty")) + '</div></div>'; return; }

          var html = "";
          var lastGroup = "";
          items.forEach(function (ev) {
            var group = dateGroup(ev.created_at);
            if (group !== lastGroup) {
              html += '<div class="ac-date-group">' + esc(group) + '</div>';
              lastGroup = group;
            }
            var label = ev.label || eventLabel(ev.event_type) || ev.event_type || "";
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
              (actor ? ' <span class="ac-timeline-actor">' + esc(t("doc.act.feed.by", { actor: actor })) + '</span>' : '') +
              (link ? ' <span class="ac-arrow">→</span>' : '') +
              '</div>' +
              '<div class="ac-timeline-time">' + relTime(ev.created_at) + '</div>' +
              '</div></div>';
          });
          el.innerHTML = html;
        })
        .catch(function (e) {
          el.innerHTML = '<div class="ac-empty"><div class="ac-empty__icon">&#9888;</div><div class="ac-empty__text">' + esc(t("doc.act.feed.error", { detail: e.message })) + '</div></div>';
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
          document.getElementById("alerts-list").innerHTML = '<div class="ac-empty"><div class="ac-empty__icon">&#9888;</div><div class="ac-empty__text">' + esc(t("doc.act.alerts.error")) + '</div></div>';
        });
    }

    function renderAlerts() {
      var el = document.getElementById("alerts-list");
      if (!_allAlerts.length) {
        el.innerHTML = '<div class="ac-empty"><div class="ac-empty__icon">&#11088;</div><div class="ac-empty__text">' + esc(t("doc.act.alerts.empty")) + '</div></div>';
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
        var title = a.title || t("doc.act.alerts.titleFallback", { count: a.match_count || 0 });
        var msg = a.message || "";
        var link = a.link_path || null;
        var score = (a.match_score != null) ? t("doc.act.alerts.score", { score: Math.round(a.match_score) }) : "";
        html += '<div class="' + cls + '" data-maid="' + esc(a.id) + '"' +
          (link ? ' data-link="' + esc(link) + '"' : '') + '>' +
          '<div class="ac-icon ac-icon--info">&#11088;</div>' +
          '<div class="ac-body">' +
          '<div class="ac-title">' + esc(title) + (link ? ' <span class="ac-arrow">→</span>' : '') + '</div>' +
          (msg ? '<div class="ac-msg">' + esc(msg.substring(0, 200)) + '</div>' : '') +
          '<div class="ac-meta"><span>' + relTime(a.created_at) + '</span>' +
          (score ? '<span>' + esc(score) + '</span>' : '') +
          (!a.is_read ? '<span style="color:var(--ds-brand);font-weight:600">\u25CF ' + esc(t("doc.act.notif.unread")) + '</span>' : '') +
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
      el.innerHTML = PREF_CATEGORIES.map(function (key) {
        var p = _prefs[key] || { channel_in_app: true, channel_email: false };
        return '<div class="ac-pref-row">' +
          '<span>' + esc(prefLabel(key)) + '</span>' +
          '<div class="ac-pref-toggles">' +
          '<label class="ac-toggle"><input type="checkbox" data-pref="' + esc(key) + '" data-channel="in_app" ' + (p.channel_in_app !== false ? 'checked' : '') + '/> ' + esc(t("doc.act.prefs.inApp")) + '</label>' +
          '<label class="ac-toggle"><input type="checkbox" data-pref="' + esc(key) + '" data-channel="email" ' + (p.channel_email ? 'checked' : '') + '/> ' + esc(t("doc.act.prefs.email")) + '</label>' +
          '</div></div>';
      }).join("");
    }

    function savePrefs() {
      var prefs = PREF_CATEGORIES.map(function (key) {
        var inApp = document.querySelector('[data-pref="' + key + '"][data-channel="in_app"]');
        var email = document.querySelector('[data-pref="' + key + '"][data-channel="email"]');
        return {
          event_category: key,
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
          btn.textContent = "\u2713 " + t("doc.act.prefs.saved");
          setTimeout(function () { btn.textContent = t("doc.act.prefs.save"); }, 2000);
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
      /* Der Speichern-Knopf wechselt zur Laufzeit auf "Gespeichert!" und wieder
         zurueck — deshalb traegt er bewusst KEINEN data-i18n-Marker (apply()
         wuerde die Bestaetigung sonst mitten in der Anzeige ueberschreiben).
         Seine Beschriftung kommt hier und beim Sprachwechsel aus t(). */
      document.getElementById("btn-save-prefs").textContent = t("doc.act.prefs.save");

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
      document.querySelector('[data-tab="activity"]').addEventListener("click", function () {
        if (!_afLoaded) { _afLoaded = true; loadActivityFeed(); }
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
      document.querySelector('[data-tab="alerts"]').addEventListener("click", function () {
        if (!_alertsLoaded) { _alertsLoaded = true; loadAlerts(false); }
      });

      /* ── Settings panel toggle ── */
      document.getElementById("btn-settings-toggle").addEventListener("click", function () {
        document.getElementById("settings-panel").classList.toggle("ac-settings--open");
      });
      document.getElementById("btn-save-prefs").addEventListener("click", savePrefs);

      /* ── Sprachwechsel ──────────────────────────────────────────────────
         Listen, Zeitangaben und Datumsgruppen entstehen per innerHTML und
         tragen keine data-i18n-Marker — apply() erreicht sie nicht. Deshalb
         hier aus dem bereits geladenen Zustand neu rendern (kein Netzabruf).
         Nur der Aktivitaets-Feed muss wirklich neu geholt werden, weil seine
         Server-Labels (ev.label) sprachneutral durchgereicht werden. */
      document.addEventListener("tc:langchange", function () {
        renderNotifs();
        renderPrefs();
        document.getElementById("btn-save-prefs").textContent = t("doc.act.prefs.save");
        if (_alertsLoaded) renderAlerts();
        if (_afLoaded) loadActivityFeed();
      });

      /* ── Poll unread every 60s ── */
      setInterval(function () { updateUnreadBadge(); updateAlertsBadge(); }, 60000);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  })();