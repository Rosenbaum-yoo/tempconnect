/**
 * Cookie-Consent (DSGVO) — globales Banner, theme-aware, ohne Dritt-Abhaengigkeit.
 * - Drei Kategorien: necessary (immer aktiv), analytics, marketing.
 * - "Alle akzeptieren" und "Nur notwendige" sind gleichwertig prominent (DSGVO).
 * - Praeferenz in localStorage (tc-cookie-consent-v1). Kein Tracking ohne Einwilligung.
 * - API fuer kuenftige Dritt-Skripte:  window.TCConsent.allows('analytics')  +  Event 'tc:consent'.
 * - Wiederaufrufbar ueber Footer-Link:  window.TCConsent.open().
 * Eingebunden global via footer.js. Design rein ueber --ds-* Tokens -> editorial/dark/light/ultra.
 */
(function () {
  "use strict";
  var KEY = "tc-cookie-consent-v1";

  function read() {
    try { var raw = localStorage.getItem(KEY); if (!raw) return null; var p = JSON.parse(raw); return (p && typeof p === "object") ? p : null; }
    catch (e) { return null; }
  }
  function write(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* localStorage nicht verfuegbar */ } }
  function consent() { var p = read(); return { necessary: true, analytics: !!(p && p.analytics), marketing: !!(p && p.marketing), set: !!p }; }

  // Oeffentliche API — kuenftige Analytics/Marketing-Skripte fragen hier ab, bevor sie laden.
  window.TCConsent = {
    get: consent,
    allows: function (cat) { return cat === "necessary" ? true : !!consent()[cat]; },
    open: function () { render(consent()); }
  };

  function save(prefs) {
    write({ necessary: true, analytics: !!prefs.analytics, marketing: !!prefs.marketing, ts: new Date().toISOString() });
    remove();
    try { document.dispatchEvent(new CustomEvent("tc:consent", { detail: consent() })); } catch { /* CustomEvent nicht unterstuetzt */ }
  }
  function remove() { var el = document.getElementById("tc-cc"); if (el && el.parentNode) el.parentNode.removeChild(el); }

  function btn(kind) {
    var base = "font-size:13px;font-weight:600;padding:9px 16px;border-radius:9px;cursor:pointer;border:1px solid var(--ds-border,rgba(0,0,0,.18))";
    if (kind === "primary") return base + ";background:var(--ds-brand,#1f3a2e);border-color:var(--ds-brand,#1f3a2e);color:#fff";
    if (kind === "ghost") return base + ";background:transparent;color:var(--ds-text-secondary,#5b5447)";
    return base + ";background:var(--ds-bg,#faf7ee);color:var(--ds-text,#14201a)";
  }
  function cat(id, label, desc, checked, locked) {
    return '<label style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;cursor:' + (locked ? "default" : "pointer") + '">' +
      '<input type="checkbox" id="tc-cc-' + id + '" ' + (checked ? "checked" : "") + " " + (locked ? "disabled" : "") +
      ' style="margin-top:3px;width:16px;height:16px;accent-color:var(--ds-brand,#1f3a2e)">' +
      '<span><span style="font-weight:700;font-size:13px">' + label + '</span>' +
      '<span style="display:block;font-size:12px;color:var(--ds-text-secondary,#5b5447)">' + desc + "</span></span></label>";
  }

  function render(current) {
    remove();
    current = current || { analytics: false, marketing: false };
    var wrap = document.createElement("div");
    wrap.id = "tc-cc";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-label", "Cookie-Einstellungen");
    wrap.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:2147483000;display:flex;justify-content:center;padding:14px;pointer-events:none";
    wrap.innerHTML =
      '<div style="pointer-events:auto;max-width:760px;width:100%;background:var(--ds-bg-raised,#fffdf6);color:var(--ds-text,#14201a);border:1px solid var(--ds-border,rgba(0,0,0,.12));border-radius:14px;box-shadow:0 12px 40px rgba(40,33,20,.22);padding:18px 20px">' +
        '<div style="font-weight:800;font-size:15px;margin-bottom:4px">Datenschutz-Einstellungen</div>' +
        '<div style="font-size:13px;line-height:1.55;color:var(--ds-text-secondary,#5b5447)">Wir verwenden Cookies, um die Plattform bereitzustellen (notwendig) und – mit Ihrer Einwilligung – die Nutzung zu analysieren und Inhalte zu verbessern. Mehr in der <a href="/public/legal/datenschutz.html" style="color:var(--ds-brand,#1f3a2e);font-weight:600">Datenschutzerklärung</a>.</div>' +
        '<div id="tc-cc-settings" style="display:none;margin-top:12px;border-top:1px solid var(--ds-border,rgba(0,0,0,.1));padding-top:8px">' +
          cat("necessary", "Notwendig", "Anmeldung, Sicherheit, Grundfunktionen – immer aktiv.", true, true) +
          cat("analytics", "Analyse", "Anonyme Nutzungsstatistik zur Verbesserung der Plattform.", current.analytics, false) +
          cat("marketing", "Marketing", "Personalisierte Inhalte und Reichweitenmessung.", current.marketing, false) +
        "</div>" +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;justify-content:flex-end">' +
          '<button type="button" id="tc-cc-settings-btn" style="' + btn("ghost") + '">Einstellungen</button>' +
          '<button type="button" id="tc-cc-save" style="' + btn("secondary") + ';display:none">Auswahl speichern</button>' +
          '<button type="button" id="tc-cc-reject" style="' + btn("secondary") + '">Nur notwendige</button>' +
          '<button type="button" id="tc-cc-accept" style="' + btn("primary") + '">Alle akzeptieren</button>' +
        "</div></div>";
    document.body.appendChild(wrap);

    var settings = wrap.querySelector("#tc-cc-settings");
    var saveBtn = wrap.querySelector("#tc-cc-save");
    wrap.querySelector("#tc-cc-settings-btn").addEventListener("click", function () {
      var open = settings.style.display === "none";
      settings.style.display = open ? "block" : "none";
      saveBtn.style.display = open ? "inline-block" : "none";
    });
    wrap.querySelector("#tc-cc-accept").addEventListener("click", function () { save({ analytics: true, marketing: true }); });
    wrap.querySelector("#tc-cc-reject").addEventListener("click", function () { save({ analytics: false, marketing: false }); });
    saveBtn.addEventListener("click", function () {
      save({ analytics: wrap.querySelector("#tc-cc-analytics").checked, marketing: wrap.querySelector("#tc-cc-marketing").checked });
    });
  }

  if (!consent().set) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { render(consent()); });
    else render(consent());
  }
})();
