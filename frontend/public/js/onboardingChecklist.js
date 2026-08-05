/**
 * onboardingChecklist.js — Wiederverwendbare Onboarding-Checklist-Komponente
 *
 * Kann auf jeder Seite eingebunden werden, die den HTML-Container
 * #onboarding-checklist enthält. Lädt Status von /api/onboarding/status,
 * rendert Fortschritt + Steps, Toggle + Dismiss.
 *
 * Voraussetzung im HTML (identisch auf allen Seiten):
 *   <div id="onboarding-checklist" style="display:none;margin-bottom:var(--ds-space-4)">
 *     ... (Standard-Template, siehe enterprise.html)
 *   </div>
 *
 * Usage: <script src="/public/js/onboardingChecklist.js" defer></script>
 *
 * P6.1 (DE/EN): Die Schritt-Texte kommen aus dem Backend-Katalog
 * (api/services/onboardingService.js, STEP_CATALOG) und sind dort deutsch.
 * Deutsch bleibt deshalb Quelle: in DE gewinnt immer der API-Text, nur in
 * anderen Sprachen greift das Woerterbuch (trApi). Weil nicht jede
 * einbindende Seite zwingend i18n.js laedt, faellt tr() ohne window.TCi18n
 * auf den deutschen Bestandstext zurueck (Muster:
 * js/workerPortal/portalStatus.js).
 */
;(function onboardingChecklistInit() {
  'use strict';

  /* ── Step → Link Mapping ────────────────────────────────── */
  var STEP_LINKS = {
    profile_complete:  '/public/sla_profil.html',
    org_configured:    '/public/sla_profil.html',
    first_capacity:    '/public/capacity_exchange_form.html',
    first_demand:      '/public/marketplace_demand_create.html',
    first_request:     '/public/capacity_search.html',
    first_deal:        '/public/angebote_verwalten.html',
    team_invited:      '/public/mitarbeiter.html',
    platform_explored: '/public/enterprise.html'
  };

  /* ── Woerterbuch (P6.1, DE/EN) ──────────────────────────────────────────
     Die DE-Eintraege spiegeln den Backend-Katalog und dienen nur als
     Rueckfallebene — im deutschen UI gewinnt der API-Text (siehe trApi),
     damit Formulierungen weiterhin ausschliesslich serverseitig gepflegt
     werden. Die Schritte sind rollen-scoped (first_capacity = Dienstleister,
     first_demand = Unternehmen), rollenabhaengige Begriffe aus
     terminologyLabels.js werden deshalb nicht eingefroren.

     Bewusst NICHT uebersetzt:
     - Kopfzeile/Toggle/Ausblenden der Checkliste: die stehen im Seiten-Markup
       und tragen dort data-i18n.
     - Fortschritt in Prozent, Links und Step-Keys: Datenwerte. */
  var DICT_DE = {
    'shared.onboarding.progress': '{done} von {total} Schritten abgeschlossen',
    'shared.onboarding.cta': 'Starten',
    'shared.onboarding.step.profile_complete.label': 'Profil vervollständigen',
    'shared.onboarding.step.profile_complete.desc': 'Firmenname, Stadt und Telefon ausfüllen.',
    'shared.onboarding.step.org_configured.label': 'Organisation konfigurieren',
    'shared.onboarding.step.org_configured.desc': 'Organisation erstellen oder beitreten.',
    'shared.onboarding.step.first_capacity.label': 'Personal einstellen',
    'shared.onboarding.step.first_capacity.desc': 'Stellen Sie Ihr erstes verfügbares Personal in der Vermittlung ein.',
    'shared.onboarding.step.first_demand.label': 'Erstes Arbeitsplatzangebot erstellen',
    'shared.onboarding.step.first_demand.desc': 'Veröffentlichen Sie Ihr erstes Arbeitsplatzangebot, damit Personaldienstleister Sie finden.',
    'shared.onboarding.step.first_request.label': 'Erste Anfrage senden oder erhalten',
    'shared.onboarding.step.first_request.desc': 'Senden oder beantworten Sie Ihre erste Personalanfrage.',
    'shared.onboarding.step.first_deal.label': 'Ersten Deal abschließen',
    'shared.onboarding.step.first_deal.desc': 'Schließen Sie Ihren ersten Deal erfolgreich ab.',
    'shared.onboarding.step.team_invited.label': 'Teammitglied einladen',
    'shared.onboarding.step.team_invited.desc': 'Laden Sie ein weiteres Teammitglied in Ihre Organisation ein.',
    'shared.onboarding.step.platform_explored.label': 'Plattform erkunden',
    'shared.onboarding.step.platform_explored.desc': 'Erkunden Sie die wichtigsten Bereiche der Plattform.'
  };

  var DICT_EN = {
    'shared.onboarding.progress': '{done} of {total} steps completed',
    'shared.onboarding.cta': 'Start',
    'shared.onboarding.step.profile_complete.label': 'Complete your profile',
    'shared.onboarding.step.profile_complete.desc': 'Fill in company name, city and phone number.',
    'shared.onboarding.step.org_configured.label': 'Set up your organisation',
    'shared.onboarding.step.org_configured.desc': 'Create an organisation or join an existing one.',
    'shared.onboarding.step.first_capacity.label': 'List staff',
    'shared.onboarding.step.first_capacity.desc': 'List your first available staff so companies can find you.',
    'shared.onboarding.step.first_demand.label': 'Create your first job posting',
    'shared.onboarding.step.first_demand.desc': 'Publish your first job posting so staffing providers can find you.',
    'shared.onboarding.step.first_request.label': 'Send or receive your first request',
    'shared.onboarding.step.first_request.desc': 'Send or answer your first staffing request.',
    'shared.onboarding.step.first_deal.label': 'Close your first deal',
    'shared.onboarding.step.first_deal.desc': 'Successfully close your first deal.',
    'shared.onboarding.step.team_invited.label': 'Invite a team member',
    'shared.onboarding.step.team_invited.desc': 'Invite another team member to your organisation.',
    'shared.onboarding.step.platform_explored.label': 'Explore the platform',
    'shared.onboarding.step.platform_explored.desc': 'Explore the key areas of the platform.'
  };

  var registered = false;

  /** Registriert das Woerterbuch, sobald i18n.js verfuegbar ist (einmalig). */
  function ensureRegistered() {
    if (registered || !window.TCi18n) return;
    window.TCi18n.register('de', DICT_DE);
    window.TCi18n.register('en', DICT_EN);
    registered = true;
  }

  /** Uebersetzt, faellt auf den deutschen Bestandstext zurueck. */
  function tr(key, fallback, params) {
    ensureRegistered();
    if (window.TCi18n) {
      var v = window.TCi18n.t(key, params);
      if (v) return v;
    }
    return fallback;
  }

  /** Wie tr(), aber der Backend-Text bleibt im deutschen UI die Wahrheit:
   *  nur in anderen Sprachen wird das Woerterbuch befragt. Fehlt dort ein
   *  Eintrag (neuer Schritt im Katalog), erscheint ehrlich der API-Text. */
  function trApi(key, apiText) {
    ensureRegistered();
    if (apiText && (!window.TCi18n || window.TCi18n.locale() === 'de')) return apiText;
    return tr(key, apiText);
  }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── Toggle (expand / collapse) ─────────────────────────── */
  function toggleOnboarding() {
    var body = document.getElementById('onboarding-body');
    var btn  = document.getElementById('onboarding-toggle-btn');
    if (!body) return;
    if (body.style.maxHeight && body.style.maxHeight !== '0px') {
      body.style.maxHeight = '0';
      if (btn) btn.style.transform = 'rotate(0deg)';
    } else {
      body.style.maxHeight = body.scrollHeight + 'px';
      if (btn) btn.style.transform = 'rotate(180deg)';
    }
  }

  /* ── Dismiss (permanent, server-side + localStorage fallback) ─ */
  function dismissOnboarding() {
    var wrap = document.getElementById('onboarding-checklist');
    if (wrap) wrap.style.display = 'none';
    lastStatus = null; // kein Nachrendern mehr nach dem Ausblenden
    // localStorage fallback — persists even if API call fails
    try { localStorage.setItem('tc_onboarding_dismissed', '1'); } catch(e) { /* quota */ }
    // Server-side dismiss with CSRF
    fetch('/api/csrf', { credentials: 'include' })
      .then(function(r) { return r.ok ? r.json() : {}; })
      .then(function(csrf) {
        return fetch('/api/onboarding/dismiss', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf.token || '' }
        });
      })
      .catch(function() { /* best-effort */ });
  }

  /* ── Render ─────────────────────────────────────────────── */
  /** Zuletzt geladener Status — damit der Sprachwechsel ohne erneuten
   *  Netz-Abruf neu rendern kann. */
  var lastStatus = null;
  var lastRole = null;

  function renderChecklist(data, role) {
    var wrap = document.getElementById('onboarding-checklist');
    if (!wrap || !data) return;

    var steps = data.steps || [];
    var doneCount = steps.filter(function(s) { return s.completed; }).length;

    var subtitle = document.getElementById('onboarding-subtitle');
    if (subtitle) {
      subtitle.textContent = tr(
        'shared.onboarding.progress',
        doneCount + ' von ' + steps.length + ' Schritten abgeschlossen',
        { done: doneCount, total: steps.length }
      );
    }

    var bar = document.getElementById('onboarding-progress-bar');
    if (bar) bar.style.width = data.progress_pct + '%';

    var stepsEl = document.getElementById('onboarding-steps');
    if (stepsEl) {
      stepsEl.innerHTML = steps.map(function(s) {
        var done = s.completed;
        var icon = done ? '&#9989;' : '&#9744;';
        var opacity = done ? '0.5' : '1';
        // Die API liefert 'key' + 'link' + 'description' (frueher las das Frontend faelschlich
        // step_key/hint -> STEP_LINKS[undefined] -> Links waren '#'). Backend-Katalog liefert die
        // rollen-korrekten Links (s.link); STEP_LINKS nur noch als Fallback.
        var key = s.key || s.step_key;
        var link = s.link || STEP_LINKS[key] || '#';
        var label = trApi('shared.onboarding.step.' + key + '.label', s.label);
        var hint = s.hint || trApi('shared.onboarding.step.' + key + '.desc', s.description) || '';
        // Finding 3: first_request zeigt im Katalog fuer BEIDE Rollen capacity_search ("Personal finden").
        // Ein Dienstleister sucht kein Personal -> Agency auf eingehende Anfragen umlenken.
        // (Finding 4 ist backend geloest: agency=first_capacity, company=first_demand mit korrektem s.link.)
        if (key === 'first_request' && role === 'agency') {
          link = '/public/company_requests.html';
        }
        var actionBtn = !done
          ? ' <a href="' + link + '" style="font-size:11px;color:var(--ds-brand,#4a9eff);font-weight:600;text-decoration:none;margin-left:8px">' + esc(s.cta || tr('shared.onboarding.cta', 'Starten')) + ' &rarr;</a>'
          : '';
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);opacity:' + opacity + '">' +
          '<span style="font-size:16px;flex-shrink:0">' + icon + '</span>' +
          '<div style="flex:1;min-width:0">' +
          '<div style="font-size:13px;font-weight:600">' + esc(label) + actionBtn + '</div>' +
          '<div style="font-size:11px;color:var(--ds-text-secondary,var(--muted));margin-top:1px">' + esc(hint) + '</div>' +
          '</div></div>';
      }).join('');
    }

    wrap.style.display = 'block';

    // Aufgeklappte Hoehe nachziehen: nach einem Sprachwechsel koennen die
    // Texte laenger/kuerzer sein als beim ersten Rendern.
    var body = document.getElementById('onboarding-body');
    if (body && body.style.maxHeight && body.style.maxHeight !== '0px') {
      body.style.maxHeight = body.scrollHeight + 'px';
    }
  }

  /* ── Load ───────────────────────────────────────────────── */
  function loadOnboardingChecklist(role) {
    var wrap = document.getElementById('onboarding-checklist');
    if (!wrap) return;

    fetch('/api/onboarding/status', { credentials: 'include' })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(d) {
        if (!d || !d.success) return;
        var data = d.data;
        // Hide if dismissed (server-side OR localStorage) or 100 % complete
        var localDismissed = false;
        try { localDismissed = localStorage.getItem('tc_onboarding_dismissed') === '1'; } catch (e) {
          void e; /* localStorage unavailable (private mode / blocked) */
        }
        if (data.dismissed || localDismissed || data.progress_pct >= 100) return;

        lastStatus = data;
        lastRole = role;
        renderChecklist(data, role);
      })
      .catch(function() { /* non-critical */ });
  }

  /* ── Expose globally (for onclick handlers in HTML) ─────── */
  window.toggleOnboarding  = toggleOnboarding;
  window.dismissOnboarding = dismissOnboarding;

  /* ── Sprachwechsel: aus dem Cache neu rendern (kein Netz-Abruf) ── */
  document.addEventListener('tc:langchange', function () {
    if (lastStatus) renderChecklist(lastStatus, lastRole);
  });

  /* ── Auto-init: only if logged in ──────────────────────── */
  function init() {
    ensureRegistered();
    if (!document.getElementById('onboarding-checklist')) return;
    // Only load if user is authenticated (lightweight check via /api/me)
    fetch('/api/me', { credentials: 'include' })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(me) {
        if (me) loadOnboardingChecklist((me && (me.role || me.org_type)) || null);
      })
      .catch(function() {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
