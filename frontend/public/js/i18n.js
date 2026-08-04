/**
 * TempConnect i18n — leichte Key→Text-Schicht (P6.1, DE/EN).
 *
 * Entwurf nach dem bewaehrten theme.js-Muster:
 *  - Sprachwahl liegt in localStorage (tempconnect-lang) und wird VOR dem Paint
 *    auf <html lang> gestempelt (Script gehoert in den <head>).
 *  - DE bleibt Default (DACH-Markt). EN greift nur bei expliziter Wahl oder
 *    englischem Browser OHNE gespeicherte Wahl.
 *  - Woerterbuecher sind PROGRESSIV: jede Seite registriert ihre eigenen Keys
 *    (TCi18n.register). Fehlt ein Key in EN, faellt er ehrlich auf DE zurueck —
 *    nie auf den rohen Key. So migrieren wir Seite fuer Seite ohne Big Bang.
 *  - Deklarative Hydration: data-i18n (textContent), data-i18n-ph (placeholder),
 *    data-i18n-title (title). data-i18n-switcher mountet den DE|EN-Umschalter.
 *  - Sprachwechsel feuert das Event "tc:langchange" — Shells koennen daran
 *    z. B. die Persistenz ins Nutzerprofil haengen (worker preferred_locale).
 *
 * Kein Framework, keine Dependency — Blueprint fuer die Folgeprojekte.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "tempconnect-lang";
  var CHOICE_KEY = "tempconnect-lang-explicit";
  var SUPPORTED = ["de", "en"];
  var DEFAULT_LANG = "de";

  var dicts = { de: {}, en: {} };

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* Storage kann fehlen (Private Mode) */ }
  }

  function resolveInitial() {
    var stored = safeGet(STORAGE_KEY);
    if (SUPPORTED.indexOf(stored) >= 0) return stored;
    var nav = String((navigator.languages && navigator.languages[0]) || navigator.language || "").toLowerCase();
    if (nav.indexOf("en") === 0) return "en";
    return DEFAULT_LANG;
  }

  var current = resolveInitial();
  document.documentElement.setAttribute("lang", current);

  function interpolate(text, params) {
    if (!params) return text;
    return String(text).replace(/\{(\w+)\}/g, function (m, name) {
      return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m;
    });
  }

  /** Uebersetzung mit ehrlichem Fallback: locale -> DE -> "" (nie der rohe Key in der UI). */
  function t(key, params) {
    var val = dicts[current] && dicts[current][key];
    if (val == null) val = dicts[DEFAULT_LANG] && dicts[DEFAULT_LANG][key];
    if (val == null) return "";
    return interpolate(val, params);
  }

  /** Woerterbuch-Eintraege ergaenzen (progressiv, pro Seite/Modul). */
  function register(locale, entries) {
    if (SUPPORTED.indexOf(locale) < 0 || !entries) return;
    var target = dicts[locale];
    for (var k in entries) {
      if (Object.prototype.hasOwnProperty.call(entries, k)) target[k] = entries[k];
    }
  }

  /** Alle deklarativ markierten Knoten (neu) uebersetzen. */
  function apply(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var text = t(nodes[i].getAttribute("data-i18n"));
      if (text) nodes[i].textContent = text;
    }
    var phs = scope.querySelectorAll("[data-i18n-ph]");
    for (var j = 0; j < phs.length; j++) {
      var ph = t(phs[j].getAttribute("data-i18n-ph"));
      if (ph) phs[j].setAttribute("placeholder", ph);
    }
    var titles = scope.querySelectorAll("[data-i18n-title]");
    for (var m = 0; m < titles.length; m++) {
      var title = t(titles[m].getAttribute("data-i18n-title"));
      if (title) titles[m].setAttribute("title", title);
    }
    var arias = scope.querySelectorAll("[data-i18n-aria]");
    for (var a = 0; a < arias.length; a++) {
      var aria = t(arias[a].getAttribute("data-i18n-aria"));
      if (aria) arias[a].setAttribute("aria-label", aria);
    }
    renderSwitchers(scope);
  }

  /** Sprache wechseln: persistieren, <html lang>, neu uebersetzen, Event. */
  function set(locale, opts) {
    if (SUPPORTED.indexOf(locale) < 0 || locale === current) return;
    current = locale;
    safeSet(STORAGE_KEY, locale);
    if (!opts || opts.explicit !== false) safeSet(CHOICE_KEY, "1");
    document.documentElement.setAttribute("lang", locale);
    apply();
    try {
      document.dispatchEvent(new CustomEvent("tc:langchange", { detail: { locale: locale } }));
    } catch (e) { /* aeltere Browser ohne CustomEvent-Konstruktor */ }
  }

  function hasExplicitChoice() { return safeGet(CHOICE_KEY) === "1"; }

  /** DE|EN-Umschalter in alle [data-i18n-switcher]-Container rendern. */
  function renderSwitchers(root) {
    var scope = root || document;
    var hosts = scope.querySelectorAll("[data-i18n-switcher]");
    for (var i = 0; i < hosts.length; i++) {
      var host = hosts[i];
      var html = "";
      for (var s = 0; s < SUPPORTED.length; s++) {
        var lang = SUPPORTED[s];
        var active = lang === current;
        html += '<button type="button" class="tc-lang-btn' + (active ? " active" : "") + '" data-lang="' + lang + '"' +
          ' aria-pressed="' + active + '" lang="' + lang + '">' + lang.toUpperCase() + "</button>";
      }
      host.innerHTML = html;
    }
  }

  document.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest(".tc-lang-btn[data-lang]") : null;
    if (btn) set(btn.getAttribute("data-lang"));
  });

  /** Umschalter-Styles einmalig injizieren — token-basiert mit Fallbacks,
   *  damit der Schalter auf JEDER Flaeche (worker.css, enterprise.css, …)
   *  identisch funktioniert, ohne eine weitere CSS-Datei zu verlangen. */
  function injectStyles() {
    if (document.getElementById("tc-i18n-styles")) return;
    var style = document.createElement("style");
    style.id = "tc-i18n-styles";
    style.textContent =
      "[data-i18n-switcher]{display:inline-flex;gap:4px;align-items:center}" +
      ".tc-lang-btn{font:600 11px/1 system-ui,sans-serif;letter-spacing:.06em;padding:5px 9px;" +
      "border-radius:7px;border:1px solid var(--ds-border,rgba(128,128,128,.35));" +
      "background:transparent;color:var(--ds-text-secondary,#8d9bba);cursor:pointer}" +
      ".tc-lang-btn.active{background:var(--ds-brand-muted,rgba(74,158,255,.12));" +
      "border-color:var(--ds-brand,#4a9eff);color:var(--ds-brand,#4a9eff)}";
    (document.head || document.documentElement).appendChild(style);
  }

  /**
   * Nachziehen bei dynamisch eingefuegtem Markup.
   *
   * Die Plattform-Shell, Modals und Drawer entstehen erst nach einem
   * Netz-Abruf — zu diesem Zeitpunkt ist apply() laengst gelaufen. Ohne
   * diesen Beobachter bliebe der Sprach-Umschalter dort ein leerer
   * Platzhalter (genau der "tote Knopf", den die Projektregeln verbieten),
   * und jede neue dynamische Flaeche muesste daran denken, selbst
   * nachzurufen. Bewusst schlank: reagiert nur auf hinzugefuegte Elemente,
   * prueft per Selektor auf noch unuebersetztes Markup und ist entprellt.
   */
  function observeDynamicMarkup() {
    if (typeof MutationObserver !== "function" || !document.body) return;
    var pending = false;
    var obs = new MutationObserver(function (records) {
      if (pending) return;
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (!node || node.nodeType !== 1) continue;
          if (node.matches && (node.matches("[data-i18n],[data-i18n-ph],[data-i18n-title],[data-i18n-aria],[data-i18n-switcher]") ||
              (node.querySelector && node.querySelector("[data-i18n],[data-i18n-switcher]")))) {
            pending = true;
            // Erst wenn der Render-Block fertig ist — sonst uebersetzen wir
            // Teilbaeume mehrfach waehrend eines einzigen innerHTML-Aufbaus.
            setTimeout(function () { pending = false; apply(); }, 0);
            return;
          }
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function init() { injectStyles(); apply(); observeDynamicMarkup(); }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.TCi18n = {
    t: t,
    register: register,
    apply: apply,
    set: set,
    locale: function () { return current; },
    /** BCP-47-Locale fuer toLocaleDateString & Co. — DE-Datumsformat bleibt
     *  Default; Seiten koennen damit Monats-/Wochentagsnamen mitwechseln. */
    dateLocale: function () { return current === "en" ? "en-GB" : "de-DE"; },
    hasExplicitChoice: hasExplicitChoice,
    supported: SUPPORTED.slice()
  };
})();
