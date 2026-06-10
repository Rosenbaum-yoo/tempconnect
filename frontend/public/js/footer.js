/**
 * Einheitlicher Footer (DRY) – Public, Legacy und Pulse-Bereich.
 * Links: AGB, Datenschutz, Impressum, Kontakt, Pulse SLA.
 * Einmal definiert, überall identisch.
 */
(function () {
  var LEGAL_BASE = "/public/legal/";
  var TRUST_BASE = "/public/trust/";
  var linkStyle = 'color:var(--ds-text-secondary,#8d9bba);font-size:13px;font-weight:500';
  var footerHtml =
    '<footer class="ds-footer" style="margin-top:48px;padding:24px 0 32px;border-top:1px solid var(--ds-border,rgba(255,255,255,.07))">' +
    '<div class="ds-footer__links" style="display:flex;justify-content:center;gap:20px;flex-wrap:wrap;margin-bottom:8px">' +
    '<a href="' + LEGAL_BASE + 'impressum.html" class="ds-footer__link" style="' + linkStyle + '">Impressum</a>' +
    '<a href="' + LEGAL_BASE + 'datenschutz.html" class="ds-footer__link" style="' + linkStyle + '">Datenschutz</a>' +
    '<a href="' + LEGAL_BASE + 'agb.html" class="ds-footer__link" style="' + linkStyle + '">AGB</a>' +
    '<a href="' + LEGAL_BASE + 'kontakt.html" class="ds-footer__link" style="' + linkStyle + '">Kontakt</a>' +
    '</div>' +
    '<div class="ds-footer__links" style="display:flex;justify-content:center;gap:20px;flex-wrap:wrap;margin-bottom:12px">' +
    '<a href="/public/pricing.html" class="ds-footer__link" style="' + linkStyle + '">Tarife</a>' +
    '<a href="/public/whats-new.html" class="ds-footer__link" style="' + linkStyle + '">Was ist neu</a>' +
    '<a href="/public/hilfe.html" class="ds-footer__link" style="' + linkStyle + '">Hilfe</a>' +
    '<a href="' + TRUST_BASE + 'security.html" class="ds-footer__link" style="' + linkStyle + '">Sicherheit</a>' +
    '<a href="' + TRUST_BASE + 'compliance.html" class="ds-footer__link" style="' + linkStyle + '">Compliance</a>' +
    '<a href="' + TRUST_BASE + 'platform-sla.html" class="ds-footer__link" style="' + linkStyle + '">Plattform-SLA</a>' +
    '<a href="' + TRUST_BASE + 'status.html" class="ds-footer__link" style="' + linkStyle + '">Status</a>' +
    '<a href="/public/api-docs.html" class="ds-footer__link" style="' + linkStyle + '">API-Docs</a>' +
    '<a href="' + LEGAL_BASE + 'sla.html" class="ds-footer__link" style="' + linkStyle + '">Pulse SLA</a>' +
    '<a href="/public/about.html" class="ds-footer__link" style="' + linkStyle + '">Ueber uns</a>' +
    '<a href="/public/capacity_exchange_feed.html" class="ds-footer__link" style="' + linkStyle + '">Vermittlung</a>' +
    '<a href="#" class="ds-footer__link" style="' + linkStyle + '" onclick="event.preventDefault();window.TCConsent&&window.TCConsent.open()">Cookie-Einstellungen</a>' +
    '</div>' +
    '<div class="ds-footer__copy" style="text-align:center;font-size:11px;color:var(--ds-text-tertiary,#5f6d8a)">' +
    '&copy; 2026 TempConnect &middot; Die B2B-Plattform fuer professionelles Workforce Management &middot; Hosting in Deutschland' +
    '</div>' +
    '</footer>';

  function inject() {
    var el = document.getElementById("tc-footer") || document.querySelector("[data-tc-footer]");
    if (el) el.innerHTML = footerHtml;
    // Cookie-Consent global einmalig nachladen (unabhaengig vom Footer-Platzhalter).
    if (!document.getElementById("tc-cookie-consent-js")) {
      var s = document.createElement("script");
      s.id = "tc-cookie-consent-js"; s.src = "/public/js/cookieConsent.js"; s.defer = true;
      (document.head || document.documentElement).appendChild(s);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inject);
  } else {
    inject();
  }
})();
