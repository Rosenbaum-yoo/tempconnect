/**
 * entitlements.js — Client-Helper fuer die Entitlement-Engine.
 *
 * Liest `GET /api/me/entitlements` einmal, cached in-memory + sessionStorage
 * (TTL 30s) und liefert Convenience-Funktionen:
 *
 *   await TC.entitlements.load()                 // explizit laden/refresh
 *   TC.entitlements.snapshot                     // letzter Snapshot
 *   await TC.entitlements.canUse(featureKey)     // boolean
 *   await TC.entitlements.check(featureKey)      // {allowed, code, message}
 *   TC.entitlements.applyDomLocks()              // [data-feature-key] auto-disable
 *   TC.entitlements.upgradeHint(featureKey)      // string fuer UI-Tooltip
 *
 * Feature-Gating soll IMMER auch backendseitig erfolgen — diese Datei ist
 * UX-Convenience, keine Sicherheitsschicht.
 */
(function (global) {
  "use strict";

  var CACHE_KEY = "tc.entitlements.v1";
  var TTL_MS = 30 * 1000;
  var inflight = null;
  var cache = null;

  function readSession() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || (Date.now() - parsed.ts) > TTL_MS) return null;
      return parsed.data;
    } catch (e) { return null; }
  }
  function writeSession(data) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data })); }
    catch (e) { /* quota: silent */ }
  }

  function load(force) {
    if (!force) {
      if (cache) return Promise.resolve(cache);
      var s = readSession();
      if (s) { cache = s; return Promise.resolve(s); }
    }
    if (inflight) return inflight;
    inflight = fetch("/api/me/entitlements", { credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)); })
      .then(function (data) { cache = data; writeSession(data); inflight = null; return data; })
      .catch(function (e) { inflight = null; throw e; });
    return inflight;
  }

  function check(featureKey) {
    return load().then(function (snap) {
      if (!snap || !snap.features) return { allowed: false, code: "NO_SNAPSHOT" };
      var f = snap.features[featureKey];
      if (!snap.subscription || snap.subscription.active === false) {
        return { allowed: false, code: "SUBSCRIPTION_INACTIVE", subscription_status: snap.subscription && snap.subscription.status };
      }
      if (!f) return { allowed: false, code: "FEATURE_UNKNOWN", feature: featureKey };
      if (f.maturity_locked) return { allowed: false, code: "FEATURE_NOT_MATURE", feature: featureKey };
      if (!f.allowed) {
        var pending = (snap.pending_requests || []).some(function (r) {
          var arr = Array.isArray(r.desired_features) ? r.desired_features : [];
          return arr.indexOf(featureKey) >= 0;
        });
        return { allowed: false, code: pending ? "FEATURE_PENDING_APPROVAL" : "FEATURE_NOT_ENABLED", feature: featureKey };
      }
      return { allowed: true, code: "OK", feature: featureKey };
    });
  }

  function canUse(featureKey) {
    return check(featureKey).then(function (r) { return r.allowed === true; });
  }

  function upgradeHint(featureKey) {
    var snap = cache;
    if (!snap) return "Aktuell nicht verfuegbar. Bitte einloggen.";
    var f = snap.features ? snap.features[featureKey] : null;
    if (!f) return "Funktion ist im aktuellen Tarif nicht enthalten.";
    if (snap.subscription && snap.subscription.active === false) return "Abo nicht aktiv. Bitte Abo reaktivieren.";
    if (f.maturity_locked) return "Funktion noch nicht produktionsreif freigegeben.";
    if (!f.allowed) {
      var pending = (snap.pending_requests || []).some(function (r) {
        var arr = Array.isArray(r.desired_features) ? r.desired_features : [];
        return arr.indexOf(featureKey) >= 0;
      });
      if (pending) return "Anfrage zur Freischaltung liegt beim Account-Team.";
      return "Funktion ist im aktuellen Tarif nicht enthalten. Upgrade verfuegbar.";
    }
    return "";
  }

  /**
   * Disabled jeden Knopf/Link mit `[data-feature-key="..."]`, fuer den der
   * Snapshot kein `allowed=true` liefert. Setzt zusaetzlich
   * `data-entitlement-locked="true"` + Title-Attribut mit dem Upgrade-Hint.
   * Schreibt KEINE eigenen Modals — UI darf damit eigene Upgrade-Banner
   * triggern.
   */
  function applyDomLocks(rootEl) {
    var root = rootEl || document;
    var nodes = root.querySelectorAll("[data-feature-key]");
    if (!nodes.length) return Promise.resolve(0);
    return load().then(function () {
      var locked = 0;
      nodes.forEach(function (el) {
        var key = el.getAttribute("data-feature-key");
        if (!key) return;
        var snap = cache;
        var f = snap && snap.features ? snap.features[key] : null;
        var allowed = !!(snap && snap.subscription && snap.subscription.active && f && f.allowed && !f.maturity_locked);
        if (allowed) {
          el.removeAttribute("data-entitlement-locked");
          if (el.tagName === "BUTTON" || el.tagName === "INPUT") el.disabled = false;
          if (el.tagName === "A" && el.dataset.tcOriginalHref != null) {
            el.setAttribute("href", el.dataset.tcOriginalHref);
            delete el.dataset.tcOriginalHref;
          }
          el.classList.remove("is-locked");
          return;
        }
        locked++;
        el.setAttribute("data-entitlement-locked", "true");
        el.classList.add("is-locked");
        el.setAttribute("title", upgradeHint(key));
        if (el.tagName === "BUTTON" || el.tagName === "INPUT") el.disabled = true;
        if (el.tagName === "A" && !el.dataset.tcOriginalHref) {
          el.dataset.tcOriginalHref = el.getAttribute("href") || "";
          el.setAttribute("href", "/public/sla_abo.html?upgrade_for=" + encodeURIComponent(key));
        }
      });
      return locked;
    });
  }

  global.TC = global.TC || {};
  global.TC.entitlements = {
    load: load,
    refresh: function () { cache = null; return load(true); },
    check: check,
    canUse: canUse,
    upgradeHint: upgradeHint,
    applyDomLocks: applyDomLocks,
    get snapshot() { return cache; }
  };
})(window);
