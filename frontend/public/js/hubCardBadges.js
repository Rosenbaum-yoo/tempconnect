/**
 * Hub-Card Aktivitaets-Badges (Fixplan Phase 2 — lebendige Cards).
 *
 * Holt GET /api/notifications/surface-summary -> { surfaces:{deals:3,...}, total }
 * und markiert jede Hub-Card mit data-surface und count>0 als AKTIV
 * (Klasse .ds-hub-card--active -> dunkler Forest + Gold-Glow via CSS) + setzt
 * die Zahl als Badge in die Card-Ecke. Polling im 60s-Takt (gleicher Takt wie Glocke).
 *
 * Backend ist bereits vorhanden (api/routes/notifications.js -> summarizeBySurface).
 * Diese Datei ist reine Frontend-Verdrahtung: realer fetch (credentials:'include'),
 * echtes DOM-Rendering, Lade-/Fehlerfall still behandelt, 401 ignoriert.
 */
(function () {
  "use strict";

  var POLL_MS = 60000;
  var SUMMARY_URL = "/api/notifications/surface-summary";
  var HUB_SELECTOR = ".ds-hub-card[data-surface]";

  function ensureBadge(card) {
    var badge = card.querySelector(".ds-hub-card__badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "ds-hub-card__badge";
      badge.setAttribute("aria-hidden", "true");
      card.appendChild(badge);
    }
    return badge;
  }

  // Aktive Card direkt zum offenen/neuesten Item lenken statt zur Uebersicht.
  // Original-href einmalig sichern -> Polling haengt Parameter nicht doppelt an.
  function applyDeepLink(card, active) {
    var base = card.getAttribute("data-base-href");
    if (base === null) {
      base = (card.getAttribute("href") || "").split("?")[0];
      card.setAttribute("data-base-href", base);
    }
    if (!base) return;
    card.setAttribute("href", active ? base + "?filter=open&sort=newest" : base);
  }

  function applySummary(surfaces) {
    var cards = document.querySelectorAll(HUB_SELECTOR);
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var key = card.getAttribute("data-surface");
      var n = surfaces && typeof surfaces[key] === "number" ? surfaces[key] : 0;
      if (n > 0) {
        card.classList.add("ds-hub-card--active");
        var badge = ensureBadge(card);
        badge.textContent = n > 99 ? "99+" : String(n);
        badge.setAttribute("aria-label", n + " neue Hinweise");
        applyDeepLink(card, true);
      } else {
        card.classList.remove("ds-hub-card--active");
        var existing = card.querySelector(".ds-hub-card__badge");
        if (existing) existing.textContent = "";
        applyDeepLink(card, false);
      }
    }
  }

  // ── Deep-Link + Mark-Read beim Klick auf eine aktive (leuchtende) Card ──────
  // Spiegel von api/services/notificationSurfaceMap.js — bei Aenderung dort synchron halten.
  var TYPES_BY_SURFACE = {
    deals: ["offer_received", "offer_accepted", "offer_rejected", "offer_counter_received", "offer_withdrawn", "deal_offer_sent", "deal_accepted", "deal_confirmed", "deal_assignment_started", "deal_staffing_ready", "deal_completed"],
    requisitions: ["requisition_approval", "requisition_filled", "requisition_cancelled"],
    marketplace: ["capacity_interest", "capacity_expiring", "capacity_match", "capacity_stale", "demand_match", "emergency_request", "emergency_escalation"],
    vendor_pool: ["vendor_pool_change", "vendor_pool_blocked"],
    trust_center: ["compliance_expiring", "compliance_expired", "compliance_verified"],
    my_company: ["sla_warning", "sla_breached"],
    assignments: ["timesheet_submitted", "timesheet_approved", "timesheet_rejected", "timesheet_signed"]
  };

  async function getCsrf() {
    try { var r = await fetch("/api/csrf", { credentials: "include" }); var d = await r.json(); return d.csrfToken || d.token || ""; } catch (e) { return ""; }
  }

  function bindClicks() {
    var cards = document.querySelectorAll(HUB_SELECTOR);
    for (var i = 0; i < cards.length; i++) cards[i].addEventListener("click", onCardClick);
  }

  function onCardClick(e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; // Neuer-Tab/Modifier normal lassen
    var card = e.currentTarget;
    if (!card.classList.contains("ds-hub-card--active")) return; // nur leuchtende Cards abfangen
    var types = TYPES_BY_SURFACE[card.getAttribute("data-surface")];
    if (!types || !types.length) return; // unbekannte Surface -> normale Navigation
    e.preventDefault();
    markReadAndGo(card, types);
  }

  // Holt die ungelesenen Notifications dieser Surface, springt zur konkreten Quelle
  // (link_path der neuesten) und markiert alle als gelesen -> beim naechsten Mal kein Glow.
  async function markReadAndGo(card, types) {
    var fallback = card.getAttribute("data-base-href") || (card.getAttribute("href") || "").split("?")[0] || "/public/enterprise.html";
    try {
      var url = "/api/notifications?unread=true&limit=100&type=" + encodeURIComponent(types.join(","));
      var pair = await Promise.all([
        fetch(url, { credentials: "include", headers: { Accept: "application/json" } }),
        getCsrf()
      ]);
      var res = pair[0], tok = pair[1];
      var data = res && res.ok ? await res.json() : { items: [] };
      var items = (data && data.items) || [];
      var target = (items[0] && items[0].link_path) || fallback; // ORDER BY created_at DESC -> neueste zuerst
      for (var i = 0; i < items.length; i++) {
        fetch("/api/notifications/" + encodeURIComponent(items[i].id) + "/read", {
          method: "PATCH", credentials: "include", keepalive: true,
          headers: tok ? { "x-csrf-token": tok } : {}
        });
      }
      window.location.href = target;
    } catch (err) {
      window.location.href = fallback;
    }
  }

  async function refresh() {
    try {
      var res = await fetch(SUMMARY_URL, {
        credentials: "include",
        headers: { Accept: "application/json" }
      });
      if (!res.ok) return; // 401 / nicht eingeloggt / Fehler -> still ignorieren
      var data = await res.json();
      applySummary(data && data.surfaces ? data.surfaces : {});
    } catch (e) {
      /* Netzwerk-/Parse-Fehler still ignorieren — Hub bleibt nutzbar */
    }
  }

  function start() {
    if (!document.querySelector(HUB_SELECTOR)) return; // nur auf Hub-Seiten aktiv
    bindClicks();
    refresh();
    setInterval(refresh, POLL_MS);
    // Andere Flows (z. B. nach Deal-Abschluss) koennen sofort aktualisieren.
    window.TC = window.TC || {};
    window.TC.refreshHubBadges = refresh;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
