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
