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

  /* ── Load & Render ──────────────────────────────────────── */
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

        var steps = data.steps || [];
        var doneCount = steps.filter(function(s) { return s.completed; }).length;

        var subtitle = document.getElementById('onboarding-subtitle');
        if (subtitle) subtitle.textContent = doneCount + ' von ' + steps.length + ' Schritten abgeschlossen';

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
            var label = s.label;
            // Finding 3: first_request zeigt im Katalog fuer BEIDE Rollen capacity_search ("Personal finden").
            // Ein Dienstleister sucht kein Personal -> Agency auf eingehende Anfragen umlenken.
            // (Finding 4 ist backend geloest: agency=first_capacity, company=first_demand mit korrektem s.link.)
            if (key === 'first_request' && role === 'agency') {
              link = '/public/company_requests.html';
            }
            var actionBtn = !done
              ? ' <a href="' + link + '" style="font-size:11px;color:var(--ds-brand,#4a9eff);font-weight:600;text-decoration:none;margin-left:8px">' + esc(s.cta || 'Starten') + ' &rarr;</a>'
              : '';
            return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);opacity:' + opacity + '">' +
              '<span style="font-size:16px;flex-shrink:0">' + icon + '</span>' +
              '<div style="flex:1;min-width:0">' +
              '<div style="font-size:13px;font-weight:600">' + esc(label) + actionBtn + '</div>' +
              '<div style="font-size:11px;color:var(--ds-text-secondary,var(--muted));margin-top:1px">' + esc(s.hint || s.description || '') + '</div>' +
              '</div></div>';
          }).join('');
        }

        wrap.style.display = 'block';
      })
      .catch(function() { /* non-critical */ });
  }

  /* ── Expose globally (for onclick handlers in HTML) ─────── */
  window.toggleOnboarding  = toggleOnboarding;
  window.dismissOnboarding = dismissOnboarding;

  /* ── Auto-init: only if logged in ──────────────────────── */
  function init() {
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
