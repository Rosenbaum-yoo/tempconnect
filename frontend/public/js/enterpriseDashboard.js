/**
 * Renders Schnellzugriff navigation cards from NAV_ITEMS into #nav-grid.
 * Depends on: navConfig.js (must be loaded first).
 * XSS-safe: uses textContent only, no innerHTML with dynamic data.
 */
"use strict";

(function () {
  var container = document.getElementById("nav-grid");
  if (!container || typeof NAV_ITEMS === "undefined") return;

  var currentPath = window.location.pathname;

  NAV_ITEMS.forEach(function (item) {
    var isActive = item.href === currentPath ||
      (item.key === "enterprise" && currentPath.indexOf("enterprise") !== -1);

    var a = document.createElement("a");
    a.href = item.href;
    a.className = "nav-card" + (isActive ? " nav-card--active" : "");
    a.setAttribute("role", "link");
    a.setAttribute("aria-label", item.label);

    var iconEl = document.createElement("span");
    iconEl.className = "nav-card__icon";
    iconEl.textContent = item.icon || "";

    var titleEl = document.createElement("h3");
    titleEl.className = "nav-card__title";
    titleEl.textContent = item.label;

    var descEl = document.createElement("p");
    descEl.className = "nav-card__desc";
    descEl.textContent = item.description;

    a.appendChild(iconEl);
    a.appendChild(titleEl);
    a.appendChild(descEl);
    container.appendChild(a);
  });
})();
