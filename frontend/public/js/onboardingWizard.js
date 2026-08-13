/**
 * onboardingWizard.js – 3-Step Professional Onboarding Wizard
 * Self-contained IIFE. Fetches /api/me + /api/me/onboarding-status,
 * shows modal if onboarding_completed === false && !is_demo.
 * Role-based flows: company, agency (NOT worker — Einsatzportal has its own flow).
 * Auto-skips completed steps based on server-derived progress.
 *
 * Portal-Trennung:
 *  - Standardportal: Wizard erscheint einmalig nach Login
 *  - Einsatzportal/Worker: kein Wizard (eigener Invite-/Registrierungsflow)
 *
 * Dismiss-Logik:
 *  - "Nicht wieder anzeigen" Checkbox → permanent (Server: onboarding_completed=true)
 *  - Schließen ohne Checkbox → Session-only (sessionStorage), nächster Login zeigt erneut
 *  - Abschließen/CTA → immer permanent
 *
 * Einbindung: <script src="/public/js/onboardingWizard.js" defer></script>
 */
(function () {
  "use strict";

  var WIZARD_ID = "tc-onboarding-wizard";
  var BACKDROP_ID = "tc-onboarding-backdrop";
  var SESSION_KEY = "tc_onboarding_seen";

  // ── Guard: Einsatzportal / Worker-Seiten ────────────────
  // Belt & Suspenders: Even if the script tag is accidentally left on
  // an Einsatzportal page, the wizard will not render.
  var path = window.location.pathname.toLowerCase();
  if (/einsatzportal|worker-/.test(path)) return;

  // ── Guard: Session-Dismiss ──────────────────────────────
  // User closed the wizard without "Nicht wieder anzeigen" in this session
  try { if (sessionStorage.getItem(SESSION_KEY)) return; } catch (e) { /* private browsing */ }

  // Prevent double init
  if (document.getElementById(WIZARD_ID)) return;

  var me = null;
  var onboardingStatus = null; // from /me/onboarding-status
  var currentStep = 0; // 0-indexed

  // ── Role-specific content ──────────────────────────────
  var ROLE_CONTENT = {
    company: {
      step1: {
        icon: "🏢",
        title: "Willkommen bei TempConnect!",
        subtitle: "Ihre Vermittlungsplattform für Zeitarbeit",
        text: "Als Unternehmen finden Sie hier qualifizierte Zeitarbeitsfirmen für Ihren Personalbedarf. " +
              "Erstellen Sie Arbeitsplatzangebote, vergleichen Sie Angebote und verwalten Sie Ihre Personaldienstleister – alles an einem Ort.",
        features: [
          "Arbeitsplatzangebote erstellen und verwalten",
          "Zeitarbeitsfirmen finden und vergleichen",
          "Angebote erhalten und Deals abschließen"
        ]
      },
      step3: {
        icon: "",
        title: "Starten Sie jetzt!",
        text: "Erstellen Sie Ihre erste Personalanfrage und erhalten Sie passende Angebote von Zeitarbeitsfirmen.",
        ctaText: "Erste Anfrage erstellen",
        ctaUrl: "/public/demand_create.html"
      }
    },
    agency: {
      step1: {
        icon: "👥",
        title: "Willkommen bei TempConnect!",
        subtitle: "Ihre Vermittlungsplattform für Zeitarbeit",
        text: "Als Personaldienstleister bieten Sie Ihr verfügbares Personal direkt Unternehmen an. " +
              "Erreichen Sie neue Kunden, reagieren Sie auf Anfragen und verwalten Sie Ihre Einsätze effizient.",
        features: [
          "Personal einstellen und vermarkten",
          "Auf Personalanfragen reagieren",
          "Deals und Einsätze verwalten"
        ]
      },
      step3: {
        icon: "",
        title: "Starten Sie jetzt!",
        text: "Stellen Sie Ihr erstes Personal ein, damit Unternehmen Sie finden können.",
        ctaText: "Erstes Angebot erstellen",
        ctaUrl: "/public/capacity_exchange_form.html"
      }
    },
    worker: {
      step1: {
        icon: "👷",
        title: "Willkommen im Einsatzportal!",
        subtitle: "Ihr persönlicher Arbeitsbereich",
        text: "Hier verwalten Sie Ihre Einsätze, reichen Stundenzettel ein und behalten den Überblick über Ihre Arbeitseinsätze.",
        features: [
          "Einsätze und Zeitpläne einsehen",
          "Stundenzettel digital einreichen",
          "Benachrichtigungen zu neuen Einsätzen"
        ]
      },
      step3: {
        icon: "",
        title: "Alles bereit!",
        text: "Sehen Sie Ihre aktuellen Einsätze ein und starten Sie direkt.",
        ctaText: "Meine Einsätze ansehen",
        ctaUrl: "/public/einsatzportal-einsaetze.html"
      }
    }
  };

  // ── Styles ─────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("tc-onboarding-styles")) return;
    var style = document.createElement("style");
    style.id = "tc-onboarding-styles";
    style.textContent = [
      "#" + BACKDROP_ID + "{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px)}",
      "#" + WIZARD_ID + "{width:100%;max-width:540px;border-radius:20px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(180deg,rgba(15,27,51,.98),rgba(11,18,32,.98));box-shadow:0 32px 80px rgba(0,0,0,.6);overflow:hidden;animation:tcWizardIn .3s ease;position:relative}",
      "@keyframes tcWizardIn{from{opacity:0;transform:translateY(24px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}",
      ".tcw-close{position:absolute;top:14px;right:14px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:none;background:rgba(255,255,255,.06);color:#a9b6da;font-size:18px;border-radius:8px;cursor:pointer;transition:all .15s;z-index:1}",
      ".tcw-close:hover{background:rgba(255,255,255,.12);color:#e9eefc}",
      ".tcw-progress{display:flex;align-items:center;justify-content:center;gap:8px;padding:20px 24px 0}",
      ".tcw-dot{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.15);transition:all .3s}",
      ".tcw-dot.active{background:linear-gradient(135deg,#4aa3ff,#7c5cff);box-shadow:0 0 12px rgba(74,163,255,.4);width:12px;height:12px}",
      ".tcw-dot.done{background:#39d98a}",
      ".tcw-bar{flex:1;max-width:40px;height:2px;background:rgba(255,255,255,.1);border-radius:2px}",
      ".tcw-bar.done{background:rgba(57,217,138,.4)}",
      ".tcw-body{padding:28px 28px 20px;min-height:280px;display:flex;flex-direction:column}",
      ".tcw-icon{font-size:48px;margin-bottom:12px}",
      ".tcw-title{font-size:22px;font-weight:900;color:#e9eefc;margin:0 0 4px}",
      ".tcw-subtitle{font-size:13px;font-weight:700;color:#4aa3ff;margin:0 0 14px;text-transform:uppercase;letter-spacing:.08em}",
      ".tcw-text{font-size:14px;color:#a9b6da;line-height:1.65;margin:0 0 16px}",
      ".tcw-features{list-style:none;padding:0;margin:0 0 8px}",
      ".tcw-features li{padding:7px 0;font-size:13px;color:#c8d6f0;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:10px}",
      ".tcw-features li:last-child{border-bottom:none}",
      ".tcw-features li::before{content:'\u2713';color:#39d98a;font-weight:900;font-size:14px}",
      ".tcw-form{display:flex;flex-direction:column;gap:14px}",
      ".tcw-field label{display:block;font-size:11px;font-weight:700;color:#a9b6da;margin-bottom:5px;text-transform:uppercase;letter-spacing:.06em}",
      ".tcw-field input{width:100%;padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.3);color:#e9eefc;font-size:14px;outline:none;transition:border-color .2s}",
      ".tcw-field input:focus{border-color:rgba(74,163,255,.5)}",
      ".tcw-field input::placeholder{color:rgba(169,182,218,.4)}",
      ".tcw-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}",
      ".tcw-skip-hint{font-size:12px;color:#39d98a;padding:8px 12px;border-radius:8px;background:rgba(57,217,138,.08);border:1px solid rgba(57,217,138,.2);margin-bottom:12px;display:flex;align-items:center;gap:8px}",
      ".tcw-cta-card{padding:20px;border-radius:14px;border:1px solid rgba(74,163,255,.2);background:linear-gradient(135deg,rgba(74,163,255,.08),rgba(124,92,255,.08));text-align:center;margin-top:8px}",
      ".tcw-cta-btn{display:inline-block;padding:14px 32px;border-radius:12px;background:linear-gradient(135deg,#4aa3ff,#7c5cff);color:#fff;font-size:15px;font-weight:800;text-decoration:none;border:none;cursor:pointer;transition:transform .15s,box-shadow .15s}",
      ".tcw-cta-btn:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(74,163,255,.3)}",
      ".tcw-footer{display:flex;align-items:center;justify-content:space-between;padding:0 28px 20px;gap:10px;flex-wrap:wrap}",
      ".tcw-dismiss-row{display:flex;align-items:center;gap:8px;padding:0 28px 14px}",
      ".tcw-dismiss-row label{font-size:12px;color:#a9b6da;cursor:pointer;user-select:none;display:flex;align-items:center;gap:8px}",
      ".tcw-dismiss-row input[type=checkbox]{width:16px;height:16px;accent-color:#4aa3ff;cursor:pointer;flex-shrink:0}",
      ".tcw-dismiss-confirm{display:none;padding:6px 16px;border-radius:8px;background:linear-gradient(135deg,#4aa3ff,#7c5cff);color:#fff;font-size:12px;font-weight:700;border:none;cursor:pointer;transition:all .15s;margin-left:auto}",
      ".tcw-dismiss-confirm.visible{display:inline-block}",
      ".tcw-dismiss-confirm:hover{box-shadow:0 4px 12px rgba(74,163,255,.3);transform:translateY(-1px)}",
      ".tcw-btn{padding:10px 18px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#e9eefc;font-size:13px;font-weight:700;cursor:pointer;transition:all .15s}",
      ".tcw-btn:hover{border-color:rgba(255,255,255,.2);background:rgba(255,255,255,.08)}",
      ".tcw-btn.primary{background:linear-gradient(135deg,#4aa3ff,#7c5cff);border-color:transparent;color:#fff}",
      ".tcw-btn.primary:hover{box-shadow:0 4px 16px rgba(74,163,255,.3)}",
      ".tcw-btn.ghost{background:transparent;border-color:transparent;color:#a9b6da;font-size:12px}",
      ".tcw-btn.ghost:hover{color:#e9eefc}",
      ".tcw-btn:disabled{opacity:.4;cursor:not-allowed}",
      ".tcw-step-label{font-size:11px;color:#a9b6da;text-align:center;margin-top:6px}",
      ".tcw-progress-bar{margin:8px 24px 0;height:4px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden}",
      ".tcw-progress-fill{height:100%;border-radius:4px;background:linear-gradient(90deg,#4aa3ff,#39d98a);transition:width .4s ease}",
      "@media(max-width:480px){",
      "  #" + WIZARD_ID + "{max-width:100%;border-radius:16px}",
      "  .tcw-body{padding:20px 18px 14px;min-height:240px}",
      "  .tcw-title{font-size:18px}",
      "  .tcw-footer{padding:0 18px 16px}",
      "  .tcw-dismiss-row{padding:0 18px 10px}",
      "  .tcw-row{grid-template-columns:1fr}",
      "}",
      // Keine Rakete/Emojis (Owner-Regel) -> leeren Icon-Container global einklappen.
      ".tcw-icon:empty{display:none}",
      // Editorial-Variante: cremefarbenes Modal + Forest/Gold-Akzente. Dark/Light/Ultra bleiben unveraendert (navy).
      "[data-theme=\"editorial\"] #" + BACKDROP_ID + "{background:rgba(20,32,26,.55)}",
      "[data-theme=\"editorial\"] #" + WIZARD_ID + "{background:#faf7ee;border-color:#d4cab3;color:#14201a;box-shadow:0 32px 80px rgba(40,33,20,.22)}",
      "[data-theme=\"editorial\"] .tcw-title{color:#14201a}",
      "[data-theme=\"editorial\"] .tcw-subtitle{color:#b8935a}",
      "[data-theme=\"editorial\"] .tcw-text{color:#5b5447}",
      "[data-theme=\"editorial\"] .tcw-features li{color:#14201a;border-bottom-color:rgba(31,58,46,.1)}",
      "[data-theme=\"editorial\"] .tcw-features li::before{color:#2d6a4f}",
      "[data-theme=\"editorial\"] .tcw-field label{color:#5b5447}",
      "[data-theme=\"editorial\"] .tcw-field input{background:#fffdf6;border-color:#d4cab3;color:#14201a}",
      "[data-theme=\"editorial\"] .tcw-field input:focus{border-color:#1f3a2e}",
      "[data-theme=\"editorial\"] .tcw-field input::placeholder{color:rgba(91,84,71,.5)}",
      "[data-theme=\"editorial\"] .tcw-close{background:rgba(31,58,46,.06);color:#5b5447}",
      "[data-theme=\"editorial\"] .tcw-close:hover{background:rgba(31,58,46,.12);color:#14201a}",
      "[data-theme=\"editorial\"] .tcw-dot{background:rgba(31,58,46,.15)}",
      "[data-theme=\"editorial\"] .tcw-dot.active{background:#1f3a2e;box-shadow:0 0 12px rgba(31,58,46,.3)}",
      "[data-theme=\"editorial\"] .tcw-dot.done{background:#2d6a4f}",
      "[data-theme=\"editorial\"] .tcw-bar.done{background:rgba(45,106,79,.4)}",
      "[data-theme=\"editorial\"] .tcw-skip-hint{color:#2d6a4f;background:rgba(45,106,79,.08);border-color:rgba(45,106,79,.2)}",
      "[data-theme=\"editorial\"] .tcw-cta-card{background:#ebe4d3;border-color:#d4cab3}",
      "[data-theme=\"editorial\"] .tcw-cta-btn{background:#1f3a2e;color:#faf7ee}",
      "[data-theme=\"editorial\"] .tcw-btn{background:#fffdf6;border-color:#d4cab3;color:#14201a}",
      "[data-theme=\"editorial\"] .tcw-btn:hover{border-color:#1f3a2e;background:#f4efe4}",
      "[data-theme=\"editorial\"] .tcw-btn.primary{background:#1f3a2e;border-color:transparent;color:#faf7ee}",
      "[data-theme=\"editorial\"] .tcw-btn.ghost{background:transparent;border-color:transparent;color:#5b5447}",
      "[data-theme=\"editorial\"] .tcw-dismiss-confirm{background:#7a2e2e;color:#faf7ee}",
      "[data-theme=\"editorial\"] .tcw-progress-bar{background:rgba(31,58,46,.08)}",
      "[data-theme=\"editorial\"] .tcw-progress-fill{background:linear-gradient(90deg,#1f3a2e,#b8935a)}"
    ].join("\n");
    document.head.appendChild(style);
  }

  // ── API helpers ────────────────────────────────────────
  /*
   * CSRF-Token bei Mutationen (2026-08-13).
   *
   * Vorher setzte dieser Helfer nur Content-Type. csrfProtect haengt global
   * unter app.use("/api/", ...) — also endete JEDER schreibende Aufruf des
   * Wizards in 403 CSRF_INVALID. Betroffen waren alle sechs: die drei Aufrufe
   * von /me/onboarding-complete, /me/onboarding-reset, PUT /me/profile und
   * PUT /company-profile.
   *
   * Auffallen konnte es niemandem, weil jeder Aufrufer den Fehler mit
   * .catch(function(){}) verschluckt. Die Folge war nicht "eine Fehlermeldung",
   * sondern: die im Wizard eingegebenen Profildaten wurden nie gespeichert, und
   * "nicht mehr anzeigen" wurde serverseitig nie gesetzt — DESHALB erschien der
   * Wizard bei jedem Login erneut.
   *
   * Das Token wird einmal geholt und gemerkt; bei einem abgelaufenen Token
   * (403) wird es genau einmal neu geholt und der Aufruf wiederholt — dasselbe
   * Muster wie in js/pages/mitarbeiter.js.
   */
  var _csrf = null;

  function holeCsrf() {
    if (_csrf) return Promise.resolve(_csrf);
    return fetch("/api/csrf", { credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { _csrf = (d && d.csrfToken) || null; return _csrf; })
      .catch(function () { return null; });
  }

  function api(path, opts) {
    opts = opts || {};
    var method = opts.method || "GET";

    function sende(token) {
      var headers = { "Content-Type": "application/json" };
      if (token) headers["x-csrf-token"] = token;
      var fetchOpts = { method: method, credentials: "include", headers: headers };
      if (opts.body) fetchOpts.body = JSON.stringify(opts.body);
      return fetch("/api" + path, fetchOpts);
    }

    function auswerten(r, schonWiederholt) {
      if (r.ok) return r.json();
      // Abgelaufenes Token: einmal neu holen und wiederholen.
      if (r.status === 403 && !schonWiederholt && method !== "GET") {
        _csrf = null;
        return holeCsrf().then(function (t) {
          return sende(t).then(function (r2) { return auswerten(r2, true); });
        });
      }
      throw new Error("API " + r.status);
    }

    if (method === "GET") {
      return sende(null).then(function (r) { return auswerten(r, true); });
    }
    return holeCsrf().then(sende).then(function (r) { return auswerten(r, false); });
  }

  // ── Profile completeness check ─────────────────────────
  function isProfileComplete(m) {
    if (m.role === "worker") return true; // workers don't have company profile
    return !!(m.company_name && m.city && m.phone);
  }

  // ── Render ─────────────────────────────────────────────
  function renderWizard() {
    var backdrop = document.createElement("div");
    backdrop.id = BACKDROP_ID;

    var wizard = document.createElement("div");
    wizard.id = WIZARD_ID;

    backdrop.appendChild(wizard);
    document.body.appendChild(backdrop);

    renderStep();
  }

  /** Check if "Nicht wieder anzeigen" checkbox is checked */
  function isDismissChecked() {
    var cb = document.getElementById("tcwDismissCheck");
    return cb ? cb.checked : false;
  }

  function renderStep() {
    var wizard = document.getElementById(WIZARD_ID);
    if (!wizard) return;

    var role = me.role || "company";
    var content = ROLE_CONTENT[role] || ROLE_CONTENT.company;
    var totalSteps = 3;

    // Auto-skip step 2 if profile is complete
    if (currentStep === 1 && isProfileComplete(me)) {
      currentStep = 2;
    }

    var html = "";

    // ── Progress indicator
    html += '<div class="tcw-progress">';
    for (var i = 0; i < totalSteps; i++) {
      var cls = i < currentStep ? "tcw-dot done" : (i === currentStep ? "tcw-dot active" : "tcw-dot");
      html += '<div class="' + cls + '"></div>';
      if (i < totalSteps - 1) {
        html += '<div class="tcw-bar' + (i < currentStep ? ' done' : '') + '"></div>';
      }
    }
    html += '</div>';
    var pct = onboardingStatus ? onboardingStatus.progress_pct : Math.round(((currentStep) / totalSteps) * 100);
    html += '<div class="tcw-progress-bar"><div class="tcw-progress-fill" style="width:' + pct + '%"></div></div>';
    html += '<div class="tcw-step-label">Schritt ' + (currentStep + 1) + ' von ' + totalSteps + ' \u00b7 ' + pct + '% abgeschlossen</div>';

    // ── Step content
    html += '<div class="tcw-body">';

    if (currentStep === 0) {
      // Step 1: Platform verstehen
      var s1 = content.step1;
      html += '<div class="tcw-icon">' + s1.icon + '</div>';
      html += '<h2 class="tcw-title">' + s1.title + '</h2>';
      html += '<div class="tcw-subtitle">' + s1.subtitle + '</div>';
      html += '<p class="tcw-text">' + s1.text + '</p>';
      html += '<ul class="tcw-features">';
      for (var f = 0; f < s1.features.length; f++) {
        html += '<li>' + s1.features[f] + '</li>';
      }
      html += '</ul>';
    } else if (currentStep === 1) {
      // Step 2: Profile — role-specific labels
      var isAgency = role === "agency";
      html += '<div class="tcw-icon"></div>';
      html += '<h2 class="tcw-title">' + (isAgency ? 'Agenturprofil vervollst\u00e4ndigen' : 'Firmenprofil vervollst\u00e4ndigen') + '</h2>';
      html += '<p class="tcw-text">' + (isAgency
        ? 'Ein vollst\u00e4ndiges Agenturprofil erh\u00f6ht Ihre Sichtbarkeit bei suchenden Unternehmen.'
        : 'Ein vollst\u00e4ndiges Profil erh\u00f6ht Ihre Sichtbarkeit und Vertrauensw\u00fcrdigkeit auf der Plattform.') + '</p>';
      html += '<div class="tcw-form">';
      html += '<div class="tcw-field"><label>' + (isAgency ? 'Agenturname' : 'Firmenname') + '</label><input type="text" id="tcwCompany" value="' + esc(me.company_name || "") + '" placeholder="' + (isAgency ? 'Ihre Agentur' : 'Ihre Firma') + '"></div>';
      html += '<div class="tcw-field"><label>Ansprechpartner</label><input type="text" id="tcwContact" value="' + esc(me.contact_person || "") + '" placeholder="Vor- und Nachname"></div>';
      html += '<div class="tcw-row">';
      html += '<div class="tcw-field"><label>Stadt</label><input type="text" id="tcwCity" value="' + esc(me.city || "") + '" placeholder="' + (isAgency ? 'Hauptsitz' : 'Stadt') + '"></div>';
      html += '<div class="tcw-field"><label>PLZ</label><input type="text" id="tcwPostal" value="' + esc(me.postal_code || "") + '" placeholder="PLZ"></div>';
      html += '</div>';
      html += '<div class="tcw-field"><label>Telefon</label><input type="text" id="tcwPhone" value="' + esc(me.phone || "") + '" placeholder="+49 ..."></div>';
      html += '</div>';
    } else if (currentStep === 2) {
      // Step 3: First action
      var s3 = content.step3;
      html += '<div class="tcw-icon">' + s3.icon + '</div>';
      html += '<h2 class="tcw-title">' + s3.title + '</h2>';
      html += '<p class="tcw-text">' + s3.text + '</p>';
      html += '<div class="tcw-cta-card">';
      html += '<a class="tcw-cta-btn" href="' + s3.ctaUrl + '" id="tcwCtaBtn">' + s3.ctaText + '</a>';
      html += '</div>';
    }

    html += '</div>';

    // ── Close button (top right)
    html += '<button class="tcw-close" id="tcwClose" title="Schlie\u00dfen">&times;</button>';

    // ── "Nicht wieder anzeigen" checkbox + confirm button
    html += '<div class="tcw-dismiss-row">';
    html += '<label><input type="checkbox" id="tcwDismissCheck"/> Nicht wieder anzeigen</label>';
    html += '<button class="tcw-dismiss-confirm" id="tcwDismissConfirm">Best\u00e4tigen</button>';
    html += '</div>';

    // ── Footer
    html += '<div class="tcw-footer">';
    if (currentStep > 0) {
      html += '<button class="tcw-btn" id="tcwBack">\u2190 Zur\u00fcck</button>';
    } else {
      html += '<div></div>'; // spacer for flex layout
    }
    html += '<div style="display:flex;gap:8px">';
    html += '<button class="tcw-btn ghost" id="tcwSkip">\u00dcberspringen</button>';
    if (currentStep < 2) {
      html += '<button class="tcw-btn primary" id="tcwNext">Weiter \u2192</button>';
    } else {
      html += '<button class="tcw-btn primary" id="tcwFinish">Abschlie\u00dfen \u2713</button>';
    }
    html += '</div>';
    html += '</div>';

    wizard.innerHTML = html;
    bindEvents();
  }

  function bindEvents() {
    var backBtn = document.getElementById("tcwBack");
    var nextBtn = document.getElementById("tcwNext");
    var skipBtn = document.getElementById("tcwSkip");
    var finishBtn = document.getElementById("tcwFinish");
    var ctaBtn = document.getElementById("tcwCtaBtn");
    var closeBtn = document.getElementById("tcwClose");

    if (backBtn) backBtn.onclick = function () {
      if (currentStep === 2 && !isProfileComplete(me)) {
        currentStep = 1;
      } else {
        currentStep = Math.max(0, currentStep - 1);
      }
      renderStep();
    };

    if (nextBtn) nextBtn.onclick = function () {
      if (currentStep === 1) {
        saveProfile().then(function () {
          currentStep = 2;
          renderStep();
        });
      } else {
        currentStep = Math.min(2, currentStep + 1);
        renderStep();
      }
    };

    // Skip → soft close (session-only unless checkbox checked)
    if (skipBtn) skipBtn.onclick = function () {
      softClose();
    };

    // Finish → always permanent
    if (finishBtn) finishBtn.onclick = function () {
      completeOnboarding();
    };

    // Close button (X) → soft close
    if (closeBtn) closeBtn.onclick = function () {
      softClose();
    };

    // "Nicht wieder anzeigen" checkbox → show/hide confirm button + sofort an Server
    var dismissCheck = document.getElementById("tcwDismissCheck");
    var dismissConfirm = document.getElementById("tcwDismissConfirm");
    if (dismissCheck && dismissConfirm) {
      dismissCheck.onchange = function () {
        dismissConfirm.classList.toggle("visible", this.checked);
        // Sofort serverseitig speichern/zurücksetzen
        if (this.checked) {
          api("/me/onboarding-complete", { method: "POST" }).catch(function () {});
        } else {
          api("/me/onboarding-reset", { method: "POST" }).catch(function () {});
        }
      };
      dismissConfirm.onclick = function () {
        completeOnboarding();
      };
    }

    // CTA → always permanent (navigates to action)
    if (ctaBtn) ctaBtn.onclick = function (e) {
      e.preventDefault();
      var url = this.href;
      api("/me/onboarding-complete", { method: "POST" }).then(function () {
        window.location.href = url;
      }).catch(function () {
        window.location.href = url;
      });
    };
  }

  function saveProfile() {
    var data = {
      company_name: (document.getElementById("tcwCompany") || {}).value || "",
      contact_person: (document.getElementById("tcwContact") || {}).value || "",
      city: (document.getElementById("tcwCity") || {}).value || "",
      postal_code: (document.getElementById("tcwPostal") || {}).value || "",
      phone: (document.getElementById("tcwPhone") || {}).value || ""
    };
    // Update local state
    me.company_name = data.company_name;
    me.contact_person = data.contact_person;
    me.city = data.city;
    me.postal_code = data.postal_code;
    me.phone = data.phone;

    // Save to users table
    var p1 = api("/me/profile", { method: "PUT", body: data }).catch(function () {});

    // Also save to company_profiles for richer profile data (best-effort)
    var role = me.role || "company";
    if (role !== "worker") {
      var cpData = {
        contact_email: me.email || "",
        contact_phone: data.phone,
        headquarters_city: data.city
      };
      if (data.company_name) cpData.legal_name = data.company_name;
      var p2 = api("/company-profile", { method: "PUT", body: cpData }).catch(function () {});
      return Promise.all([p1, p2]);
    }
    return p1;
  }

  /**
   * Soft close: session-only dismiss OR permanent if checkbox is checked.
   * - Checkbox checked → permanent dismiss (server-side onboarding_completed=true)
   * - Checkbox unchecked → session dismiss (sessionStorage, wizard reappears next login)
   */
  function softClose() {
    if (isDismissChecked()) {
      completeOnboarding(); // permanent
    } else {
      try { sessionStorage.setItem(SESSION_KEY, "1"); } catch (e) { /* private browsing */ }
      closeWizard();
    }
  }

  /** Permanent dismiss: server-side flag + close UI (wartet auf API-Antwort) */
  function completeOnboarding() {
    api("/me/onboarding-complete", { method: "POST" })
      .catch(function () {})
      .then(function () { closeWizard(); });
  }

  function closeWizard() {
    var backdrop = document.getElementById(BACKDROP_ID);
    if (backdrop) {
      backdrop.style.opacity = "0";
      backdrop.style.transition = "opacity .2s";
      setTimeout(function () { backdrop.remove(); }, 200);
    }
    document.removeEventListener("keydown", onEscKey);
  }

  function onEscKey(e) {
    if (e.key === "Escape") {
      softClose();
    }
  }

  function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ── Init ───────────────────────────────────────────────
  function init() {
    api("/me").then(function (data) {
      me = data;
      if (!me) return;
      if (me.is_demo) return;              // Demo users skip onboarding
      if (me.onboarding_completed) return;  // Already onboarded
      if (me.role === "worker") return;     // Workers use Einsatzportal onboarding, not this wizard

      // Fetch structured onboarding status to determine starting step
      return api("/me/onboarding-status").then(function (status) {
        onboardingStatus = status;

        // Auto-advance to first incomplete step
        if (status && status.steps) {
          if (status.steps.profile_basics && status.steps.profile_basics.done) {
            currentStep = 1; // skip welcome, go to profile
            if (status.steps.company_profile && status.steps.company_profile.done) {
              currentStep = 2; // skip profile, go to first action
            }
          }
        }
      }).catch(function () {
        // Status endpoint unavailable – start from step 0
      }).then(function () {
        // Small delay to let page render first
        setTimeout(function () {
          injectStyles();
          document.addEventListener("keydown", onEscKey);
          renderWizard();
        }, 600);
      });
    }).catch(function () {
      // Not logged in or error – no wizard
    });
  }

  // Fire once DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
