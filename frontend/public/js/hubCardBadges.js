/**
 * Hub-Card Aktivitaets-Badges + Glow (lebendige Cards).
 *
 * Holt GET /api/notifications?unread=true, gruppiert ungelesene Notifications je
 * Hub-Card-Surface (data-surface) -> markiert Cards mit count>0 als AKTIV
 * (.ds-hub-card--active: gleiche Creme + Gold-Ring + dezenter Glow + staerkerer Hover via CSS)
 * und setzt die Zahl als Badge.
 *  - Klick auf eine aktive Card: Deep-Link zur konkreten Quelle (link_path der neuesten)
 *    + markiert die Surface-Notifications als gelesen -> naechstes Mal kein Glow.
 *  - Hover auf der Badge-Zahl: kleiner Tooltip mit dem Inhalt der Benachrichtigungen.
 * Polling im 60s-Takt. Reine Frontend-Verdrahtung (credentials:'include', 401 still ignoriert).
 */
(function () {
  "use strict";

  var POLL_MS = 60000;
  var LIST_URL = "/api/notifications?unread=true&limit=100";
  var HUB_SELECTOR = ".ds-hub-card[data-surface]";

  // Spiegel von api/services/notificationSurfaceMap.js — bei Aenderung dort synchron halten.
  var TYPES_BY_SURFACE = {
    deals: ["offer_received", "offer_accepted", "offer_rejected", "offer_counter_received", "offer_withdrawn", "deal_offer_sent", "deal_accepted", "deal_confirmed", "deal_assignment_started", "deal_staffing_ready", "deal_completed", "deal_cancelled"],
    requisitions: ["requisition_approval", "requisition_filled", "requisition_cancelled"],
    marketplace: ["capacity_interest", "capacity_expiring", "capacity_match", "capacity_stale", "demand_match", "emergency_request", "emergency_escalation"],
    vendor_pool: ["vendor_pool_change", "vendor_pool_blocked"],
    trust_center: ["compliance_expiring", "compliance_expired", "compliance_verified"],
    my_company: ["sla_warning", "sla_breached"],
    assignments: ["timesheet_submitted", "timesheet_approved", "timesheet_rejected", "timesheet_signed"],
    bounties: ["milestone", "bounty_near", "bounty_earned", "bounty_lost"]
  };
  var SURFACE_FOR_TYPE = {};
  Object.keys(TYPES_BY_SURFACE).forEach(function (surf) {
    TYPES_BY_SURFACE[surf].forEach(function (t) { SURFACE_FOR_TYPE[t] = surf; });
  });

  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }

  function ensureBadge(card) {
    var badge = card.querySelector(".ds-hub-card__badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "ds-hub-card__badge";
      card.appendChild(badge);
      badge.addEventListener("mouseenter", function () { showTooltip(badge); });
      badge.addEventListener("mouseleave", hideTooltip);
    }
    return badge;
  }

  // ── Badge-Tooltip (Inhalt der Benachrichtigungen) ──────────
  var tipEl = null;
  function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement("div");
    tipEl.className = "ds-hub-badge-tip";
    tipEl.style.cssText = "position:fixed;display:none;z-index:1200;max-width:300px;background:var(--ds-bg-surface,#131b30);color:var(--ds-text,#eaeff8);border:1px solid var(--ds-border,rgba(255,255,255,.12));border-radius:10px;padding:8px 12px;box-shadow:0 10px 30px rgba(0,0,0,.32);font-size:12px;line-height:1.45;pointer-events:none";
    document.body.appendChild(tipEl);
    return tipEl;
  }
  function showTooltip(badge) {
    var items = badge._tcItems || [];
    if (!items.length) return;
    var tip = ensureTip();
    var html = "";
    items.slice(0, 5).forEach(function (it, i) {
      html += '<div style="padding:4px 0' + (i ? ";border-top:1px solid var(--ds-border,rgba(255,255,255,.08))" : "") + '">' +
        "<strong>" + esc(it.title || "Benachrichtigung") + "</strong>" +
        (it.message ? '<div style="color:var(--ds-text-secondary,#8d9bba);margin-top:1px">' + esc(it.message) + "</div>" : "") +
      "</div>";
    });
    if (items.length > 5) html += '<div style="color:var(--ds-text-secondary,#8d9bba);padding-top:4px;font-style:italic">+' + (items.length - 5) + " weitere</div>";
    tip.innerHTML = html;
    tip.style.display = "block";
    var r = badge.getBoundingClientRect();
    var tr = tip.getBoundingClientRect();
    var left = Math.min(r.right - tr.width, window.innerWidth - tr.width - 8);
    tip.style.left = Math.max(8, left) + "px";
    tip.style.top = (r.bottom + 6 + tr.height > window.innerHeight ? r.top - tr.height - 6 : r.bottom + 6) + "px";
  }
  function hideTooltip() { if (tipEl) tipEl.style.display = "none"; }

  // Aktive Card direkt zum offenen/neuesten Item lenken (Fallback-href; der Klick-Handler
  // springt zur konkreten Quelle). Original-href einmalig sichern.
  function applyDeepLink(card, active) {
    var base = card.getAttribute("data-base-href");
    if (base === null) {
      base = (card.getAttribute("href") || "").split("?")[0];
      card.setAttribute("data-base-href", base);
    }
    if (!base) return;
    card.setAttribute("href", active ? base + "?filter=open&sort=newest" : base);
  }

  function applySummary(bySurface) {
    var cards = document.querySelectorAll(HUB_SELECTOR);
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var key = card.getAttribute("data-surface");
      var info = bySurface[key];
      var n = info ? info.items.length : 0;
      if (n > 0) {
        card.classList.add("ds-hub-card--active");
        var badge = ensureBadge(card);
        badge.textContent = n > 99 ? "99+" : String(n);
        badge.setAttribute("aria-label", n + " neue Hinweise — zum Ansehen draufzeigen");
        badge._tcItems = info.items;
        applyDeepLink(card, true);
      } else {
        card.classList.remove("ds-hub-card--active");
        var existing = card.querySelector(".ds-hub-card__badge");
        if (existing) { existing.textContent = ""; existing._tcItems = []; }
        applyDeepLink(card, false);
      }
    }
  }

  async function refresh() {
    try {
      var res = await fetch(LIST_URL, { credentials: "include", headers: { Accept: "application/json" } });
      if (!res.ok) return; // 401 / nicht eingeloggt / Fehler -> still ignorieren
      var data = await res.json();
      var items = (data && data.items) || [];
      var bySurface = {};
      for (var i = 0; i < items.length; i++) {
        var surf = SURFACE_FOR_TYPE[items[i].type];
        if (!surf) continue;
        if (!bySurface[surf]) bySurface[surf] = { items: [] };
        bySurface[surf].items.push(items[i]);
      }
      applySummary(bySurface);
    } catch (e) { /* Netzwerk-/Parse-Fehler still ignorieren — Hub bleibt nutzbar */ }
  }

  // ── Deep-Link + Mark-Read beim Klick auf eine aktive (leuchtende) Card ─────
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
    if (!types || !types.length) return;
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

  function start() {
    if (!document.querySelector(HUB_SELECTOR)) return; // nur auf Hub-Seiten aktiv
    bindClicks();
    refresh();
    setInterval(refresh, POLL_MS);
    window.TC = window.TC || {};
    window.TC.refreshHubBadges = refresh;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
