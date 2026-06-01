/**
 * breadcrumb.js — Automatische Breadcrumb-Navigation fuer TempConnect
 *
 * Erzeugt eine Breadcrumb-Leiste basierend auf der aktuellen Seite.
 * Fuegt sich automatisch nach dem ersten ds-topbar oder .ds-page-header ein.
 *
 * Mapping: Seite → übergeordneter Bereich (Area-Hub)
 */
;(function breadcrumbNav() {
  'use strict';

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    var path = location.pathname.replace(/^\/public\//, '').replace(/\.html$/, '').replace(/\/$/, '');

    /* ── Area Hubs (diese bekommen KEINEN Breadcrumb — sie SIND der Bereich) ── */
    var HUB_PAGES = [
      'enterprise', 'capacity_exchange_feed', 'requisitions', 'deal_management', 'sla_profil',
      'worker-submissions-review', 'data-governance', 'executive_dashboard',
      'activity', 'hilfe', 'admin_panel'
    ];
    if (HUB_PAGES.indexOf(path) >= 0) return;

    /* ── Bereichs-Map: Seite → { area-Label, area-URL } ── */
    var AREAS = {
      /* Vermittlung */
      capacity_search:           { area: 'Vermittlung', url: '/public/capacity_exchange_feed.html' },
      agency_inbox:              { area: 'Vermittlung', url: '/public/capacity_exchange_feed.html' },
      angebote_verwalten:        { area: 'Vermittlung', url: '/public/capacity_exchange_feed.html' },
      matching_results:          { area: 'Vermittlung', url: '/public/capacity_exchange_feed.html' },
      sla_search_jobs_list:      { area: 'Vermittlung', url: '/public/capacity_exchange_feed.html' },
      sla_search_job_detail:     { area: 'Vermittlung', url: '/public/capacity_exchange_feed.html' },
      capacity_exchange:         { area: 'Vermittlung', url: '/public/capacity_exchange_feed.html' },
      capacity_exchange_detail:  { area: 'Vermittlung', url: '/public/capacity_exchange_feed.html' },
      capacity_exchange_form:    { area: 'Vermittlung', url: '/public/capacity_exchange_feed.html' },
      capacity_exchange_manage:  { area: 'Vermittlung', url: '/public/capacity_exchange_feed.html' },
      marketplace_capacity_create: { area: 'Vermittlung', url: '/public/capacity_exchange_feed.html' },
      sla_angebote:              { area: 'Vermittlung', url: '/public/capacity_exchange_feed.html' },

      /* Arbeitsplatzangebote */
      company_requests:          { area: 'Arbeitsplatzangebote', url: '/public/requisitions.html' },
      marketplace_demand_list:   { area: 'Arbeitsplatzangebote', url: '/public/requisitions.html' },
      marketplace_demand_create: { area: 'Arbeitsplatzangebote', url: '/public/requisitions.html' },
      marketplace_demand_detail: { area: 'Arbeitsplatzangebote', url: '/public/requisitions.html' },
      demand_create:             { area: 'Arbeitsplatzangebote', url: '/public/requisitions.html' },
      request_detail:            { area: 'Arbeitsplatzangebote', url: '/public/requisitions.html' },

      /* Mein Unternehmen */
      organization:              { area: 'Mein Unternehmen', url: '/public/sla_profil.html' },
      integrations:              { area: 'Mein Unternehmen', url: '/public/sla_profil.html' },
      sla_abo:                   { area: 'Mein Unternehmen', url: '/public/sla_profil.html' },
      company_profile_public:    { area: 'Mein Unternehmen', url: '/public/sla_profil.html' },

      /* Deals & Einsaetze */
      offer_detail:              { area: 'Deals & Einsaetze', url: '/public/deal_management.html' },

      /* Einsaetze & Zeiten */
      mitarbeiter:               { area: 'Einsaetze & Zeiten', url: '/public/worker-submissions-review.html' },
      approvals:                 { area: 'Einsaetze & Zeiten', url: '/public/worker-submissions-review.html' },
      timesheets:                { area: 'Einsaetze & Zeiten', url: '/public/worker-submissions-review.html' },
      sla_nachweise:             { area: 'Einsaetze & Zeiten', url: '/public/worker-submissions-review.html' },

      /* Trust Center */
      'legal/impressum':         { area: 'Trust Center', url: '/public/data-governance.html' },
      'legal/agb':               { area: 'Trust Center', url: '/public/data-governance.html' },
      'legal/datenschutz':       { area: 'Trust Center', url: '/public/data-governance.html' },
      'legal/kontakt':           { area: 'Trust Center', url: '/public/data-governance.html' },
      'legal/sla':               { area: 'Trust Center', url: '/public/data-governance.html' },
      'trust/security':          { area: 'Trust Center', url: '/public/data-governance.html' },
      'trust/compliance':        { area: 'Trust Center', url: '/public/data-governance.html' },
      'trust/platform-sla':      { area: 'Trust Center', url: '/public/data-governance.html' },
      'trust/status':            { area: 'Trust Center', url: '/public/data-governance.html' },
      api_docs:                  { area: 'Trust Center', url: '/public/data-governance.html' },
      'api-docs':                { area: 'Trust Center', url: '/public/data-governance.html' },
      about:                     { area: 'Trust Center', url: '/public/data-governance.html' },

      /* Lieferantensteuerung */
      vendor_pool:               { area: 'Lieferantensteuerung', url: '/public/vendor_pool.html' },
      supplier_scorecard:        { area: 'Lieferantensteuerung', url: '/public/vendor_pool.html' },
      'rate-cards':              { area: 'Lieferantensteuerung', url: '/public/vendor_pool.html' },
      'spend-analytics':         { area: 'Lieferantensteuerung', url: '/public/vendor_pool.html' },

      /* Steuerung */
      'system-health':           { area: 'Steuerung', url: '/public/executive_dashboard.html' },
      compliance_overview:       { area: 'Steuerung', url: '/public/executive_dashboard.html' },

      /* Help Center */
      sla_hilfe:                 { area: 'Help Center', url: '/public/hilfe.html' },

      /* Activity Center */
      notifications:             { area: 'Activity Center', url: '/public/activity.html' }
    };

    var mapping = AREAS[path];
    if (!mapping) return;

    /* ── Seitentitel aus <title> oder h1 ── */
    var pageTitle = '';
    var h1 = document.querySelector('.ds-page-title, h1');
    if (h1) {
      pageTitle = h1.textContent.trim();
    } else {
      var titleTag = document.querySelector('title');
      if (titleTag) pageTitle = titleTag.textContent.split('–')[0].trim();
    }

    /* ── Breadcrumb-HTML ── */
    var bc = document.createElement('nav');
    bc.className = 'ds-breadcrumb';
    bc.setAttribute('aria-label', 'Breadcrumb');
    bc.innerHTML =
      '<a href="/public/enterprise.html" class="ds-breadcrumb__item">\u00DCbersicht</a>' +
      '<span class="ds-breadcrumb__sep">\u203A</span>' +
      '<a href="' + mapping.url + '" class="ds-breadcrumb__item">' + mapping.area + '</a>' +
      '<span class="ds-breadcrumb__sep">\u203A</span>' +
      '<span class="ds-breadcrumb__item ds-breadcrumb__current">' + esc(pageTitle) + '</span>';

    /* ── Einfuegen nach topbar oder vor page-header ── */
    var anchor = document.querySelector('.ds-page-header') ||
                 document.querySelector('#onboarding-checklist') ||
                 document.querySelector('.ds-topbar');
    if (anchor && anchor.parentNode) {
      if (anchor.classList && anchor.classList.contains('ds-topbar')) {
        anchor.parentNode.insertBefore(bc, anchor.nextSibling);
      } else {
        anchor.parentNode.insertBefore(bc, anchor);
      }
    }

    /* ── Styles (einmalig) ── */
    if (!document.getElementById('ds-breadcrumb-styles')) {
      var style = document.createElement('style');
      style.id = 'ds-breadcrumb-styles';
      style.textContent =
        '.ds-breadcrumb{display:flex;align-items:center;gap:6px;padding:var(--ds-space-2,8px) 0;font-size:12px;color:var(--ds-text-secondary,#8d9bba);margin-bottom:var(--ds-space-1,4px)}' +
        '.ds-breadcrumb__item{color:var(--ds-text-secondary,#8d9bba);text-decoration:none;transition:color .15s}' +
        'a.ds-breadcrumb__item:hover{color:var(--ds-brand,#4a9eff);text-decoration:underline}' +
        '.ds-breadcrumb__sep{color:var(--ds-text-tertiary,#5f6d8a);font-size:14px}' +
        '.ds-breadcrumb__current{color:var(--ds-text,#eaeff8);font-weight:600}';
      document.head.appendChild(style);
    }
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
})();
