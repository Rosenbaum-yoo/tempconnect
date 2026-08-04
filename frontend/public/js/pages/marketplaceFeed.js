/* ═══════════════════════════════════════════════════════
   Marketplace Feed — Page Logic
   ═══════════════════════════════════════════════════════ */
(function() {
  'use strict';

  /* ── i18n (P6.1) ─────────────────────────────────────────────────────────
     Woerterbuch dieser Seite. Es steht bewusst GANZ oben: die Karten-Render-
     Helfer weiter unten greifen im selben Lauf darauf zu.

     Bruecke statt harter Abhaengigkeit: die Datei wird auch in einer
     vm-Sandbox ohne geladene i18n-Schicht ausgefuehrt (Render-Tests). Ohne
     window.TCi18n uebernimmt ein lokaler Ersatz mit exakt dem heutigen
     deutschen Verhalten — kein Absturz, kein leerer Text.
     Woerterbuch-WERTE sind immer Texte, nie t()-Aufrufe. */
  var TCi18n = (typeof window !== 'undefined' && window.TCi18n) ? window.TCi18n : createLocalI18n();

  function createLocalI18n() {
    var dicts = { de: {}, en: {} };
    return {
      register: function(locale, entries) {
        var target = dicts[locale];
        if (!target || !entries) return;
        for (var k in entries) {
          if (Object.prototype.hasOwnProperty.call(entries, k)) target[k] = entries[k];
        }
      },
      t: function(key, params) {
        var val = dicts.de[key];
        if (val == null) return "";
        if (!params) return val;
        return String(val).replace(/\{(\w+)\}/g, function(m, name) {
          return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m;
        });
      },
      locale: function() { return "de"; },
      dateLocale: function() { return "de-DE"; }
    };
  }

  TCi18n.register('de', {
    'feed.docTitle': 'Vermittlung – TempConnect',
    'feed.paywall.home': 'Startseite',
    'feed.paywall.title': 'Bereich nicht verfuegbar',
    'feed.paywall.currentPlan': 'Aktueller Plan:',
    'feed.paywall.cta': 'Abo ansehen',
    'feed.nav.feed.desc': 'Angebote und Gesuche — der zentrale Feed.',
    'feed.nav.searchOrder.title': 'Personal-Suchauftrag anlegen',
    'feed.nav.searchOrder.desc': 'Persistente Personalsuche mit automatischem Matching.',
    'feed.nav.myStaff.title': 'Eingestelltes Personal',
    'feed.nav.myStaff.desc': 'Eigene Verfügbarkeiten und Angebote.',
    'feed.nav.myArea.title': 'Mein Bereich',
    'feed.nav.myArea.desc': 'Deals, Anfragen, Eingaenge und Matching.',
    'feed.nav.publishStaff.desc': 'Eigenes Personal gezielt veröffentlichen.',
    'feed.nav.openJobs.title': 'Verfügbare Arbeitsplätze',
    'feed.nav.openJobs.desc': 'Übersicht Ihrer Arbeitsplatzangebote.',
    'feed.stats.active': 'Aktives Personal',
    'feed.stats.suppliers': 'Dienstleister',
    'feed.stats.deals': 'Deals (30T)',
    'feed.stats.fresh': 'Heute aktualisiert',
    'feed.filter.role': 'Rolle',
    'feed.filter.rolePh': 'z.B. Lagerhelfer',
    'feed.filter.city': 'Stadt',
    'feed.filter.cityPh': 'z.B. Stuttgart',
    'feed.filter.category': 'Kategorie',
    'feed.filter.all': 'Alle',
    'feed.filter.search': 'Suchen',
    'feed.filter.shift': 'Schichtmodell',
    'feed.filter.compliance': 'Compliance',
    'feed.filter.headcount': 'Min. Anzahl',
    'feed.filter.availFrom': 'Verfuegbar ab',
    'feed.filter.immediate': 'Sofort verfuegbar',
    'feed.filter.immediateHint': 'Heute oder morgen',
    'feed.filter.sort': 'Sortierung',
    'feed.filters.more': 'Weitere Filter',
    'feed.filters.collapse': 'Filter einklappen',
    'feed.cat.helfer': 'Helfer',
    'feed.cat.fachkraft': 'Fachkraft',
    'feed.cat.spezialist': 'Spezialist',
    'feed.cat.fuehrungskraft': 'Fuehrungskraft',
    'feed.shift.day': 'Tagschicht',
    'feed.shift.night': 'Nachtschicht',
    'feed.shift.rotating': 'Wechselschicht',
    'feed.shift.flexible': 'Flexibel',
    'feed.shift.weekend': 'Wochenende',
    'feed.shift.on_call': 'Bereitschaft',
    'feed.compliance.complete': 'Vollstaendig',
    'feed.compliance.partial': 'Teilweise',
    'feed.compliance.pending': 'In Pruefung',
    'feed.compliance.unknown': 'Unbekannt',
    'feed.sort.newest': 'Neueste zuerst',
    'feed.sort.priority': 'Prioritaet',
    'feed.sort.headcount': 'Anzahl (absteigend)',
    'feed.sort.freshness': 'Aktualitaet',
    'feed.empty.title': 'Kein passendes Personal gefunden',
    'feed.empty.titleLocation': 'Kein passendes Personal für Standort {location}',
    'feed.empty.text': 'Versuchen Sie andere Filterkriterien oder erweitern Sie Ihre Suche.',
    'feed.empty.reset': 'Filter zuruecksetzen',
    'feed.pagination.prev': 'Zurueck',
    'feed.pagination.next': 'Weiter',
    'feed.pagination.pageInfo': 'Seite {page} von {total}',
    'feed.disclaimer': 'Alle Angaben ohne Gewaehr. TempConnect vermittelt, garantiert aber keinen Vermittlungserfolg.',
    'feed.results.one': '1 Eintrag gefunden',
    'feed.results.many': '{n} Eintraege gefunden',
    'feed.context.agencyInter': 'Inter-Agency Matching ist aktiv: Neben Unternehmens-Nachfragen werden qualifizierte Nachfragen von Zeitarbeitsfirmen kontrolliert einbezogen.',
    'feed.context.agency': 'Standardmodus aktiv: Priorisiert werden passende Nachfragen von Unternehmen.',
    'feed.context.company': 'Standardmodus aktiv: Priorisiert wird passendes Personal von Zeitarbeitsfirmen.',
    'feed.error.load': 'Fehler beim Laden des Personals.',
    'feed.preview.alt': 'Vorschau',
    'feed.preview.supply': 'Angebot',
    'feed.preview.demand': 'Nachfrage',
    'feed.hc.people': '{n} Personen',
    'feed.hc.supplySplit': '{remaining} frei / {total} gesamt',
    'feed.hc.dealBound': '{n} dealgebunden',
    'feed.hc.demandSplit': '{remaining} offen / {total} gesamt',
    'feed.hc.bound': '{n} gebunden',
    'feed.scarcity.free': 'Nur noch {n} frei',
    'feed.scarcity.open': 'Nur noch {n} offen',
    'feed.skills.more': '+{n} weitere',
    'feed.freshness.current': 'Aktuell',
    'feed.employment.temporary': 'ANUe',
    'feed.employment.contract': 'Werkvertrag',
    'feed.employment.temp_to_perm': 'Temp-to-Perm',
    'feed.employment.project': 'Projekt',
    'feed.employment.on_call': 'Abruf',
    'feed.premium.enterprise': 'PARTNER: INDIVIDUELLER TARIF',
    'feed.premium.pro': 'PREMIUM PRO',
    'feed.premium.plus': 'PREMIUM',
    'feed.type.supply': 'Zeitarbeitsangebot',
    'feed.type.supplyLong': 'Angebot einer Zeitarbeitsfirma',
    'feed.type.demand': 'Arbeitsplatzangebot',
    'feed.type.demandLong': 'Arbeitsplatzangebot eines Unternehmens',
    'feed.trust.successRate': '{n}% Erfolg',
    'feed.trust.verified': 'Verifiziert',
    'feed.trust.compliance': 'Compliance',
    'feed.trust.subscriber': 'Aktiver Abonnent',
    'feed.trust.deals': '{n} Deals',
    'feed.trust.recent': 'Kuerzlich bestaetigt',
    'feed.price.from': 'ab {v} EUR',
    'feed.price.to': 'bis {v} EUR',
    'feed.headline.available': '{n} {role} verfuegbar',
    'feed.headline.reserved': '{n} {role} reserviert',
    'feed.headline.wanted': '{n} {role} gesucht',
    'feed.card.fromIn': 'ab {date} in {city}',
    'feed.card.save': 'Merken',
    'feed.card.saved': 'Gemerkt',
    'feed.prio.notdienst': 'Notdienst',
    'feed.prio.urgent': 'Dringend',
    'feed.prio.elevated': 'Erhoeht',
    'feed.kind.poolSingle': 'Sammelangebot',
    'feed.kind.poolMulti': 'Sammelangebot · Multi-Skill',
    'feed.kind.bundle': 'Komplettprofil (mehrere Skills)',
    'feed.kind.single': 'Einzelprofil',
    'feed.badge.boosted': 'Hervorgehoben',
    'feed.status.reserved': 'Reserviert',
    'feed.status.partiallyCovered': 'Teilgedeckt',
    'feed.cta.agency.create': 'Personal einstellen',
    'feed.cta.agency.notdienst': 'Notdienst einstellen',
    'feed.cta.agency.manage': 'Eingestelltes Personal',
    'feed.cta.company.create': 'Arbeitsplatz anbieten',
    'feed.cta.company.list': 'Meine Angebote'
  });

  TCi18n.register('en', {
    'feed.docTitle': 'Marketplace – TempConnect',
    'feed.paywall.home': 'Home',
    'feed.paywall.title': 'Area not available',
    'feed.paywall.currentPlan': 'Current plan:',
    'feed.paywall.cta': 'View plans',
    'feed.nav.feed.desc': 'Offers and requests — the central feed.',
    'feed.nav.searchOrder.title': 'Create a staffing search request',
    'feed.nav.searchOrder.desc': 'Persistent staff search with automatic matching.',
    'feed.nav.myStaff.title': 'Listed staff',
    'feed.nav.myStaff.desc': 'Your own availabilities and offers.',
    'feed.nav.myArea.title': 'My area',
    'feed.nav.myArea.desc': 'Deals, requests, inbox and matching.',
    'feed.nav.publishStaff.desc': 'Publish your own staff in a targeted way.',
    'feed.nav.openJobs.title': 'Available job openings',
    'feed.nav.openJobs.desc': 'Overview of your job openings.',
    'feed.stats.active': 'Active staff',
    'feed.stats.suppliers': 'Providers',
    'feed.stats.deals': 'Deals (30d)',
    'feed.stats.fresh': 'Updated today',
    'feed.filter.role': 'Role',
    'feed.filter.rolePh': 'e.g. warehouse assistant',
    'feed.filter.city': 'City',
    'feed.filter.cityPh': 'e.g. Stuttgart',
    'feed.filter.category': 'Category',
    'feed.filter.all': 'All',
    'feed.filter.search': 'Search',
    'feed.filter.shift': 'Shift model',
    'feed.filter.compliance': 'Compliance',
    'feed.filter.headcount': 'Min. headcount',
    'feed.filter.availFrom': 'Available from',
    'feed.filter.immediate': 'Available immediately',
    'feed.filter.immediateHint': 'Today or tomorrow',
    'feed.filter.sort': 'Sorting',
    'feed.filters.more': 'More filters',
    'feed.filters.collapse': 'Collapse filters',
    'feed.cat.helfer': 'Assistant',
    'feed.cat.fachkraft': 'Skilled worker',
    'feed.cat.spezialist': 'Specialist',
    'feed.cat.fuehrungskraft': 'Manager',
    'feed.shift.day': 'Day shift',
    'feed.shift.night': 'Night shift',
    'feed.shift.rotating': 'Rotating shift',
    'feed.shift.flexible': 'Flexible',
    'feed.shift.weekend': 'Weekend',
    'feed.shift.on_call': 'On call',
    'feed.compliance.complete': 'Complete',
    'feed.compliance.partial': 'Partial',
    'feed.compliance.pending': 'Under review',
    'feed.compliance.unknown': 'Unknown',
    'feed.sort.newest': 'Newest first',
    'feed.sort.priority': 'Priority',
    'feed.sort.headcount': 'Headcount (descending)',
    'feed.sort.freshness': 'Freshness',
    'feed.empty.title': 'No matching staff found',
    'feed.empty.titleLocation': 'No matching staff for location {location}',
    'feed.empty.text': 'Try different filter criteria or broaden your search.',
    'feed.empty.reset': 'Reset filters',
    'feed.pagination.prev': 'Back',
    'feed.pagination.next': 'Next',
    'feed.pagination.pageInfo': 'Page {page} of {total}',
    'feed.disclaimer': 'All information without guarantee. TempConnect brokers introductions but does not guarantee a successful placement.',
    'feed.results.one': '1 entry found',
    'feed.results.many': '{n} entries found',
    'feed.context.agencyInter': 'Inter-agency matching is active: alongside company demand, qualified demand from staffing firms is included in a controlled way.',
    'feed.context.agency': 'Standard mode active: matching demand from companies is prioritised.',
    'feed.context.company': 'Standard mode active: matching staff from staffing firms is prioritised.',
    'feed.error.load': 'Could not load staff.',
    'feed.preview.alt': 'Preview',
    'feed.preview.supply': 'Offer',
    'feed.preview.demand': 'Demand',
    'feed.hc.people': '{n} people',
    'feed.hc.supplySplit': '{remaining} free / {total} total',
    'feed.hc.dealBound': '{n} deal-bound',
    'feed.hc.demandSplit': '{remaining} open / {total} total',
    'feed.hc.bound': '{n} committed',
    'feed.scarcity.free': 'Only {n} left',
    'feed.scarcity.open': 'Only {n} still open',
    'feed.skills.more': '+{n} more',
    'feed.freshness.current': 'Current',
    'feed.employment.temporary': 'Temp staffing',
    'feed.employment.contract': 'Contract for work',
    'feed.employment.temp_to_perm': 'Temp-to-perm',
    'feed.employment.project': 'Project',
    'feed.employment.on_call': 'On demand',
    'feed.premium.enterprise': 'PARTNER: CUSTOM PLAN',
    'feed.premium.pro': 'PREMIUM PRO',
    'feed.premium.plus': 'PREMIUM',
    'feed.type.supply': 'Staffing offer',
    'feed.type.supplyLong': 'Offer from a staffing firm',
    'feed.type.demand': 'Job opening',
    'feed.type.demandLong': 'Job opening from a company',
    'feed.trust.successRate': '{n}% success',
    'feed.trust.verified': 'Verified',
    'feed.trust.compliance': 'Compliance',
    'feed.trust.subscriber': 'Active subscriber',
    'feed.trust.deals': '{n} deals',
    'feed.trust.recent': 'Recently confirmed',
    'feed.price.from': 'from {v} EUR',
    'feed.price.to': 'up to {v} EUR',
    'feed.headline.available': '{n} {role} available',
    'feed.headline.reserved': '{n} {role} reserved',
    'feed.headline.wanted': '{n} {role} wanted',
    'feed.card.fromIn': 'from {date} in {city}',
    'feed.card.save': 'Save',
    'feed.card.saved': 'Saved',
    'feed.prio.notdienst': 'Emergency',
    'feed.prio.urgent': 'Urgent',
    'feed.prio.elevated': 'Elevated',
    'feed.kind.poolSingle': 'Pool offer',
    'feed.kind.poolMulti': 'Pool offer · multi-skill',
    'feed.kind.bundle': 'Full profile (multiple skills)',
    'feed.kind.single': 'Single profile',
    'feed.badge.boosted': 'Featured',
    'feed.status.reserved': 'Reserved',
    'feed.status.partiallyCovered': 'Partially covered',
    'feed.cta.agency.create': 'List staff',
    'feed.cta.agency.notdienst': 'List emergency staff',
    'feed.cta.agency.manage': 'Listed staff',
    'feed.cta.company.create': 'Post a job opening',
    'feed.cta.company.list': 'My postings'
  });

  function t(key, params) { return TCi18n.t(key, params); }

  /** Text setzen UND den Schluessel am Knoten hinterlegen: ein spaeterer
   *  Sprachwechsel (TCi18n.apply) findet den Knoten dann wieder. */
  function setI18n(el, key) {
    if (!el) return;
    el.setAttribute("data-i18n", key);
    el.textContent = t(key);
  }
  /** Text mit Platzhaltern: der Marker wird bewusst ENTFERNT — apply() kennt
   *  keine Parameter und wuerde den Satz beim Sprachwechsel verstuemmeln.
   *  Diese Stellen werden stattdessen beim Neurendern erneut gesetzt. */
  function setI18nParams(el, key, params) {
    if (!el) return;
    el.removeAttribute("data-i18n");
    el.textContent = t(key, params);
  }

  var PAGE_SIZE = 25;
  var currentPage = 1;

  function esc(s) { return s == null ? "" : String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function fmtDate(d) { return d ? String(d).substring(0,10) : "?"; }
  function todayDateString() {
    var now = new Date();
    var year = now.getFullYear();
    var month = String(now.getMonth() + 1).padStart(2, "0");
    var day = String(now.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }
  function toAssetUrl(rawPath) {
    var p = String(rawPath || "");
    if (!p) return "";
    if (p.startsWith("http://") || p.startsWith("https://") || p.startsWith("/")) return p;
    return "/" + p;
  }
  function count(value, fallback) {
    var num = Number(value);
    return isFinite(num) ? Math.max(0, Math.trunc(num)) : fallback;
  }
  function totalHeadcount(entry) {
    return Math.max(1, count(entry && entry.headcount, 1));
  }
  function remainingHeadcount(entry) {
    if (!entry) return 1;
    if (entry.remaining_headcount != null) return Math.max(0, count(entry.remaining_headcount, 0));
    return totalHeadcount(entry);
  }
  function committedHeadcount(entry) {
    if (!entry) return 0;
    if (entry.committed_headcount != null) return Math.max(0, count(entry.committed_headcount, 0));
    return 0;
  }
  function demandTotalHeadcount(entry) {
    return Math.max(1, count(entry && (entry.required_total_count != null ? entry.required_total_count : entry.headcount), 1));
  }
  function demandRemainingHeadcount(entry) {
    if (!entry) return 1;
    if (entry.remaining_open_count != null) return Math.max(0, count(entry.remaining_open_count, 0));
    return demandTotalHeadcount(entry);
  }
  function demandCommittedHeadcount(entry) {
    if (!entry) return 0;
    if (entry.currently_committed_count != null) return Math.max(0, count(entry.currently_committed_count, 0));
    if (entry.committed_headcount != null) return Math.max(0, count(entry.committed_headcount, 0));
    return 0;
  }
  function supplyHeadcountLabel(entry) {
    var total = totalHeadcount(entry);
    var remaining = remainingHeadcount(entry);
    var committed = committedHeadcount(entry);
    if (entry && (entry.status === "reserved" || committed > 0 || remaining !== total)) {
      return t('feed.hc.supplySplit', { remaining: remaining, total: total }) +
        (committed > 0 ? " · " + t('feed.hc.dealBound', { n: committed }) : "");
    }
    return t('feed.hc.people', { n: total });
  }
  function demandHeadcountLabel(entry) {
    var total = demandTotalHeadcount(entry);
    var remaining = demandRemainingHeadcount(entry);
    var committed = demandCommittedHeadcount(entry);
    if (entry && (entry.status === "partially_covered" || committed > 0 || remaining !== total)) {
      return t('feed.hc.demandSplit', { remaining: remaining, total: total }) +
        (committed > 0 ? " · " + t('feed.hc.bound', { n: committed }) : "");
    }
    return t('feed.hc.people', { n: total });
  }

  // Ehrliche Knappheit (Welle 5): nur wenn real Plaetze gebunden sind UND wenig
  // Rest bleibt (<= 1/3, mind. 1). Nie bei unberuehrten oder voll reservierten
  // Angeboten — erfundene Verknappung waere Fake-Data.
  function scarcitySignal(entry, isDemand) {
    if (!entry) return null;
    if (!isDemand && entry.status === "reserved") return null;
    var total = isDemand ? demandTotalHeadcount(entry) : totalHeadcount(entry);
    var remaining = isDemand ? demandRemainingHeadcount(entry) : remainingHeadcount(entry);
    var committed = isDemand ? demandCommittedHeadcount(entry) : committedHeadcount(entry);
    if (committed <= 0 && remaining === total) return null;
    if (remaining <= 0) return null;
    if (remaining > Math.max(1, Math.floor(total / 3))) return null;
    return { remaining: remaining, label: t(isDemand ? 'feed.scarcity.open' : 'feed.scarcity.free', { n: remaining }) };
  }

  // Skill-Chips (Welle 5): macht den Multi-Skill-Fan-out auf Buendel-/Sammelkarten
  // sichtbar. Erst ab 2 Skills — ein einzelner steckt schon in Rolle + Typ-Badge.
  function skillChipsHtml(entry) {
    var tags = Array.isArray(entry && entry.skill_tags) ? entry.skill_tags.filter(Boolean) : [];
    if (tags.length < 2) return "";
    var shown = tags.slice(0, 4);
    var html = '<div class="ce-card__skills">';
    shown.forEach(function(tag) { html += '<span class="ds-badge ds-badge--neutral ce-skill-chip">' + esc(tag) + '</span>'; });
    if (tags.length > shown.length) {
      html += '<span class="ds-badge ds-badge--neutral ce-skill-chip ce-skill-chip--more">' +
        esc(t('feed.skills.more', { n: tags.length - shown.length })) + '</span>';
    }
    html += '</div>';
    return html;
  }

  var SHIFT_LABEL_KEYS = { day:"feed.shift.day", night:"feed.shift.night", rotating:"feed.shift.rotating", flexible:"feed.shift.flexible", weekend:"feed.shift.weekend", on_call:"feed.shift.on_call" };
  var EMPLOYMENT_LABEL_KEYS = { temporary:"feed.employment.temporary", contract:"feed.employment.contract", temp_to_perm:"feed.employment.temp_to_perm", project:"feed.employment.project", on_call:"feed.employment.on_call" };
  var COMPLIANCE_LABEL_KEYS = { unknown:"feed.compliance.unknown", pending:"feed.compliance.pending", partial:"feed.compliance.partial", complete:"feed.compliance.complete" };
  var COMPLIANCE_COLORS = { complete:"--green", partial:"--yellow", pending:"--yellow", unknown:"--grey" };

  function freshnessHtml(ts) {
    if (!ts) return '<span class="ce-freshness"><span class="ce-freshness__dot ce-freshness__dot--stale"></span></span>';
    var h = (Date.now() - new Date(ts).getTime()) / 36e5;
    if (h < 48) return '<span class="ce-freshness"><span class="ce-freshness__dot ce-freshness__dot--fresh"></span>' + esc(t('feed.freshness.current')) + '</span>';
    if (h < 96) return '<span class="ce-freshness"><span class="ce-freshness__dot ce-freshness__dot--aging"></span></span>';
    return '<span class="ce-freshness"><span class="ce-freshness__dot ce-freshness__dot--stale"></span></span>';
  }

  var GRADE_COLORS = {
    PLATINUM: { bg: 'rgba(168,85,247,.12)', fg: '#a855f7' },
    GOLD:     { bg: 'rgba(234,179,8,.12)',   fg: '#eab308' },
    SILVER:   { bg: 'rgba(148,163,184,.12)', fg: '#94a3b8' },
    BRONZE:   { bg: 'rgba(180,83,9,.12)',    fg: '#b45309' }
  };

  var PREMIUM_TIERS = {
    ENTERPRISE: { css: 'ce-premium-badge--enterprise', labelKey: 'feed.premium.enterprise', cardCss: 'ce-card--premium-enterprise' },
    PRO:        { css: 'ce-premium-badge--pro',        labelKey: 'feed.premium.pro',        cardCss: 'ce-card--premium-pro' },
    PLUS:       { css: 'ce-premium-badge--plus',       labelKey: 'feed.premium.plus',       cardCss: 'ce-card--premium-plus' }
  };

  // Gegenseitenorientierte Labels. Der lange Text erklaert das Badge als
  // Tooltip — dieselbe Aussage, ohne die Karte zu ueberladen.
  var FEED_TYPE_LABELS = {
    supply: { icon: '&#128188;', badgeKey: 'feed.type.supply', badgeCls: 'ce-type-badge--supply', labelKey: 'feed.type.supplyLong' },
    demand: { icon: '&#128270;', badgeKey: 'feed.type.demand', badgeCls: 'ce-type-badge--demand', labelKey: 'feed.type.demandLong' }
  };

  function premiumBadgeHtml(item) {
    if (!item || !item.subscription_plan) return "";
    var tier = PREMIUM_TIERS[item.subscription_plan];
    if (!tier) return "";
    return '<span class="ce-premium-badge ' + tier.css + '">&#9733; ' + esc(t(tier.labelKey)) + '</span>';
  }

  function premiumCardClass(item) {
    if (!item || !item.subscription_plan) return "";
    var tier = PREMIUM_TIERS[item.subscription_plan];
    return tier ? " " + tier.cardCss : "";
  }

  function reputationBadgeHtml(item) {
    if (!item || !item.reputation_grade || item.reputation_grade === 'UNRATED') return "";
    var g = GRADE_COLORS[item.reputation_grade] || GRADE_COLORS.BRONZE;
    var html = '<span class="ds-trust-badge" style="background:' + g.bg + ';color:' + g.fg + ';font-weight:700">&#9733; ';
    if (item.reputation_score != null) html += Math.round(item.reputation_score) + ' ';
    html += item.reputation_grade + '</span>';
    if (item.deal_success_rate != null) {
      html += '<span class="ds-trust-badge" style="font-size:11px">' + esc(t('feed.trust.successRate', { n: Math.round(item.deal_success_rate) })) + '</span>';
    }
    return html;
  }

  function trustBadges(ts) {
    if (!ts) return "";
    var html = "";
    if (ts.supplier_verified) html += '<span class="ds-trust-badge ds-trust-badge--verified">&#10003; ' + esc(t('feed.trust.verified')) + '</span>';
    if (ts.compliance_complete) html += '<span class="ds-trust-badge ds-trust-badge--compliance">' + esc(t('feed.trust.compliance')) + '</span>';
    if (ts.active_subscriber) html += '<span class="ds-trust-badge ds-trust-badge--active">' + esc(t('feed.trust.subscriber')) + '</span>';
    if (ts.completed_deals > 0) html += '<span class="ds-trust-badge ds-trust-badge--deals">' + esc(t('feed.trust.deals', { n: ts.completed_deals })) + '</span>';
    if (ts.recently_confirmed) html += '<span class="ds-trust-badge ds-trust-badge--response">' + esc(t('feed.trust.recent')) + '</span>';
    return html;
  }

  function previewPlaceholderHtml(e) {
    var label = t(e.feed_type === "demand" ? 'feed.preview.demand' : 'feed.preview.supply');
    return '<div class="ce-card__preview-fallback" data-preview-placeholder="1">' +
      '<span class="ce-card__preview-fallback-icon" aria-hidden="true">&#128247;</span>' +
      '<span class="ce-card__preview-fallback-label">' + esc(label) + '</span>' +
      '</div>';
  }

  function renderCard(e) {
    var shift = e.shift_model ? (t(SHIFT_LABEL_KEYS[e.shift_model]) || e.shift_model) : null;
    var compLabel = COMPLIANCE_LABEL_KEYS[e.compliance_status] ? t(COMPLIANCE_LABEL_KEYS[e.compliance_status]) : "";
    var compColor = COMPLIANCE_COLORS[e.compliance_status] || "--grey";
    var totalPeople = totalHeadcount(e);
    var freePeople = remainingHeadcount(e);
    var committedPeople = committedHeadcount(e);
    var priceHtml = "";
    if (e.price_hint) { priceHtml = esc(e.price_hint); }
    else if (e.price_min != null || e.price_max != null) {
      var parts = [];
      if (e.price_min != null) parts.push(esc(t('feed.price.from', { v: Number(e.price_min).toFixed(2) })));
      if (e.price_max != null) parts.push(esc(t('feed.price.to', { v: Number(e.price_max).toFixed(2) })));
      priceHtml = parts.join(" ");
    }

    var isDemandCard = e.feed_type === 'demand';
    var rankLabels = Array.isArray(e.rank_labels) ? e.rank_labels.slice(0, 3) : [];
    // Typ-Akzent (Arbeitsplatzangebot) als Klasse statt Inline-Style, damit das
    // Editorial-Theme die Karte erden + de-orangen kann (siehe .ce-card--demand).
    var demandCls = isDemandCard ? ' ce-card--demand' : '';
    // Notdienst braucht Karten-Praesenz (USP "Notfall-Personal in Stunden"),
    // nicht nur ein Mini-Badge — gleiche Klassen-Mechanik wie ce-card--demand.
    var notdienstCls = e.priority_level === "notdienst" ? ' ce-card--notdienst' : '';
    var premCls = premiumCardClass(e);
    var demandRemaining = demandRemainingHeadcount(e);
    var demandCommitted = demandCommittedHeadcount(e);
    var html = '<div class="ce-card' + premCls + demandCls + notdienstCls + '" data-id="' + esc(e.id) + '" data-feed-type="' + (e.feed_type || 'supply') + '">';
    html += '<div class="ce-card__layout">';
    html += '<div class="ce-card__preview" data-logo-id="' + esc(e.id) + '">' + previewPlaceholderHtml(e) + '</div>';
    html += '<div class="ce-card__content">';
    html += '<div class="ce-card__head">';
    var ftl = FEED_TYPE_LABELS[e.feed_type] || FEED_TYPE_LABELS.supply;
    html += '<span class="ce-type-badge ' + ftl.badgeCls + '" title="' + esc(t(ftl.labelKey)) + '">' + ftl.icon + ' ' + esc(t(ftl.badgeKey)) + '</span> ';
    // Professionelle Headline: "15 Produktionshelfer verfuegbar" statt generischer Titel
    var headline = e.title;
    if (!isDemandCard && e.headcount && e.role) {
      headline = freePeople > 0
        ? t('feed.headline.available', { n: freePeople, role: e.role })
        : t('feed.headline.reserved', { n: totalPeople, role: e.role });
    } else if (isDemandCard && e.headcount && e.role) {
      headline = t('feed.headline.wanted', { n: demandRemaining, role: e.role });
    }
    html += '<div style="flex:1;min-width:0"><div class="ce-card__title">' + esc(headline) + '</div>';
    var subParts = [esc(e.role)];
    if (e.worker_category) subParts.push(esc(e.worker_category));
    if (e.location_city) subParts.push(esc(t('feed.card.fromIn', { date: fmtDate(e.availability_from), city: e.location_city })));
    html += '<div class="ce-card__role">' + subParts.join(' · ') + '</div></div>';
    html += '<div style="display:flex;align-items:center;gap:var(--ds-space-2)">';
    html += freshnessHtml(e.last_confirmed_at);
    if (e.priority_level === "notdienst") html += '<span class="ds-badge ds-badge--danger">' + esc(t('feed.prio.notdienst')) + '</span>';
    else if (e.priority_level === "urgent") html += '<span class="ds-badge ds-badge--danger">' + esc(t('feed.prio.urgent')) + '</span>';
    else if (e.priority_level === "elevated") html += '<span class="ds-badge ds-badge--warning">' + esc(t('feed.prio.elevated')) + '</span>';
    if (!isDemandCard) {
      if (e.offer_kind === "pool_single_skill") html += '<span class="ds-badge ds-badge--neutral">' + esc(t('feed.kind.poolSingle')) + '</span>';
      else if (e.offer_kind === "pool_multi_skill") html += '<span class="ds-badge ds-badge--neutral">' + esc(t('feed.kind.poolMulti')) + '</span>';
      else if (e.offer_kind === "bundle") html += '<span class="ds-badge ds-badge--neutral">' + esc(t('feed.kind.bundle')) + '</span>';
      else if (e.offer_kind === "single_skill") html += '<span class="ds-badge ds-badge--neutral">' + esc(t('feed.kind.single')) + '</span>';
      if (Number(e.placement_boost_level) > 0) html += '<span class="ds-badge ds-badge--warning">★ ' + esc(t('feed.badge.boosted')) + '</span>';
    }
    if (!isDemandCard && e.status === "reserved") html += '<span class="ds-badge ds-badge--neutral">' + esc(t('feed.status.reserved')) + '</span>';
    else if (!isDemandCard && committedPeople > 0) html += '<span class="ds-badge ds-badge--neutral">' + esc(t('feed.hc.dealBound', { n: committedPeople })) + '</span>';
    if (isDemandCard && e.status === "partially_covered") html += '<span class="ds-badge ds-badge--neutral">' + esc(t('feed.status.partiallyCovered')) + '</span>';
    if (isDemandCard && demandCommitted > 0) html += '<span class="ds-badge ds-badge--neutral">' + esc(t('feed.hc.bound', { n: demandCommitted })) + '</span>';
    var scarcity = scarcitySignal(e, isDemandCard);
    if (scarcity) html += '<span class="ds-badge ds-badge--warning ce-scarcity-badge">' + esc(scarcity.label) + '</span>';
    if (e.employment_type) html += '<span class="ds-badge ds-badge--neutral">' + esc(t(EMPLOYMENT_LABEL_KEYS[e.employment_type]) || e.employment_type) + '</span>';
    html += '<button class="ce-card__save" data-save-id="' + esc(e.id) + '" title="' + esc(t('feed.card.save')) + '" onclick="event.stopPropagation();window._saveCap(this)">&#9734; ' + esc(t('feed.card.save')) + '</button>';
    html += '</div></div>';
    if (rankLabels.length) {
      html += '<div class="ce-card__meta" style="margin-bottom:var(--ds-space-2)">';
      rankLabels.forEach(function(lbl) {
        html += '<span class="ds-badge ds-badge--neutral">' + esc(lbl) + '</span>';
      });
      html += '</div>';
    }

    html += '<div class="ce-card__meta">';
    html += '<span class="ce-card__meta-item">&#128205; ' + esc(e.location_city || "?") + (e.location_postal ? " " + esc(e.location_postal) : "") + '</span>';
    html += '<span class="ce-card__meta-item">&#128101; ' + esc(isDemandCard ? demandHeadcountLabel(e) : supplyHeadcountLabel(e)) + '</span>';
    html += '<span class="ce-card__meta-item">&#128197; ' + fmtDate(e.availability_from) + (e.availability_to ? " – " + fmtDate(e.availability_to) : "+") + '</span>';
    if (shift) html += '<span class="ce-card__meta-item">&#9200; ' + esc(shift) + '</span>';
    if (compLabel) html += '<span class="ce-card__meta-item"><span class="ds-traffic-light ds-traffic-light' + compColor + '"></span>' + esc(compLabel) + '</span>';
    if (priceHtml) html += '<span class="ce-card__meta-item">&#128176; ' + priceHtml + '</span>';
    html += '</div>';
    html += skillChipsHtml(e);

    var premBadge = premiumBadgeHtml(e);
    var repBadge = reputationBadgeHtml(e);
    var trust = trustBadges(e.trust_signals);
    var trustAll = premBadge + repBadge + trust;
    if (trustAll) html += '<div class="ce-card__trust">' + trustAll + '</div>';

    html += '</div>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  function setImmediateState(enabled, opts) {
    var toggle = document.getElementById("ff-immediate");
    var dateEl = document.getElementById("ff-avail-from");
    if (!toggle || !dateEl) return;
    var skipRemember = opts && opts.skipRemember;
    if (enabled) {
      if (!skipRemember && !dateEl.disabled) {
        dateEl.dataset.prevValue = dateEl.value || "";
      }
      var anchor = (opts && opts.anchor) || dateEl.value;
      if (!anchor || !/^\d{4}-\d{2}-\d{2}$/.test(String(anchor))) {
        anchor = todayDateString();
      }
      dateEl.value = anchor;
      dateEl.disabled = true;
      toggle.checked = true;
    } else {
      toggle.checked = false;
      dateEl.disabled = false;
      if (!skipRemember && dateEl.dataset.prevValue != null) {
        dateEl.value = dateEl.dataset.prevValue;
        delete dateEl.dataset.prevValue;
      }
    }
  }

  function loadFeed(page) {
    currentPage = page || 1;
    var params = new URLSearchParams();
    var role = document.getElementById("ff-role").value.trim();
    var city = document.getElementById("ff-city").value.trim();
    var cat = document.getElementById("ff-category").value;
    var shift = document.getElementById("ff-shift").value;
    var comp = document.getElementById("ff-compliance").value;
    var hc = document.getElementById("ff-headcount").value;
    var availFrom = document.getElementById("ff-avail-from").value;
    var immediate = document.getElementById("ff-immediate").checked;
    var sort = document.getElementById("ff-sort").value;
    if (immediate && (!availFrom || !/^\d{4}-\d{2}-\d{2}$/.test(String(availFrom)))) {
      availFrom = todayDateString();
      document.getElementById("ff-avail-from").value = availFrom;
    }
    persistFilters({
      role: role || "",
      city: city || "",
      worker_category: cat || "",
      shift_model: shift || "",
      compliance_status: comp || "",
      min_headcount: hc || "",
      availability_from: availFrom || "",
      availability_window: immediate ? "immediate" : "",
      sort: sort || defaultSort
    });
    if (role) params.set("role", role);
    if (city) params.set("city", city);
    if (cat) params.set("worker_category", cat);
    if (shift) params.set("shift_model", shift);
    if (comp) params.set("compliance_status", comp);
    if (hc) params.set("min_headcount", hc);
    if (availFrom) params.set("availability_from", availFrom);
    if (immediate) params.set("availability_window", "immediate");
    if (sort) params.set("sort", sort);
    params.set("page", currentPage);
    params.set("limit", PAGE_SIZE);

    var feedEl = document.getElementById("feed");
    var emptyEl = document.getElementById("empty-state");
    var pagEl = document.getElementById("pagination");
    var infoEl = document.getElementById("results-info");
    var contextEl = document.getElementById("feed-context-hint");

    feedEl.innerHTML = '<div class="ds-skeleton ds-skeleton--card" style="height:120px"></div><div class="ds-skeleton ds-skeleton--card" style="height:120px"></div>';
    emptyEl.style.display = "none";
    pagEl.style.display = "none";

    TC.api.get("/capacity-exchange/feed?" + params.toString())
    .then(function(data) {
      var items = data.items || data || [];
      var total = data.total || items.length;
      var ctx = data.feed_context || {};

      if (!items.length) {
        feedEl.innerHTML = "";
        var locLbl = (function() { try { return sessionStorage.getItem("tc.activeLocationName") || null; } catch (_e) { return null; } })();
        var titleEl = emptyEl.querySelector(".ds-empty__title");
        if (locLbl) setI18nParams(titleEl, 'feed.empty.titleLocation', { location: locLbl });
        else setI18n(titleEl, 'feed.empty.title');
        emptyEl.style.display = "block";
        infoEl.textContent = "";
        return;
      }

      infoEl.textContent = total === 1 ? t('feed.results.one') : t('feed.results.many', { n: total });
      if (ctx.viewer_role === "agency" && ctx.inter_agency_enabled) {
        contextEl.textContent = t('feed.context.agencyInter');
      } else if (ctx.viewer_role === "agency") {
        contextEl.textContent = t('feed.context.agency');
      } else if (ctx.viewer_role === "company") {
        contextEl.textContent = t('feed.context.company');
      } else {
        contextEl.textContent = "";
      }
      var html = "";
      items.forEach(function(e) { html += renderCard(e); });
      feedEl.innerHTML = html;
      emptyEl.style.display = "none";

      // Bind card clicks
      feedEl.querySelectorAll(".ce-card[data-id]").forEach(function(card) {
        card.addEventListener("click", function() {
          window.location.href = "/public/capacity_exchange_detail.html?id=" + card.getAttribute("data-id") + "&type=" + (card.getAttribute("data-feed-type") || "supply");
        });
      });

      // Logos nachladen
      var ids = items.map(function(e) { return e.id; }).join(",");
      if (ids) {
        TC.api.get("/offer-assets/batch-logos?ids=" + encodeURIComponent(ids))
        .then(function(resp) {
          if (!resp || !resp.data) return;
          var logos = resp.data;
          Object.keys(logos).forEach(function(oid) {
            var el = feedEl.querySelector('[data-logo-id="' + oid + '"]');
            if (el) {
              var img = document.createElement("img");
              var rawPath = String(logos[oid] || "");
              img.src = toAssetUrl(rawPath);
              img.alt = t('feed.preview.alt');
              img.className = "ce-card__preview-image";
              img.loading = "lazy";
              img.onerror = function() {
                el.innerHTML = previewPlaceholderHtml({ feed_type: el.closest(".ce-card") && el.closest(".ce-card").getAttribute("data-feed-type") });
              };
              el.innerHTML = "";
              el.appendChild(img);
            }
          });
        }).catch(function() {});
      }

      // Pagination
      var totalPages = Math.ceil(total / PAGE_SIZE);
      if (totalPages > 1) {
        pagEl.style.display = "flex";
        setI18nParams(document.getElementById("page-info"), 'feed.pagination.pageInfo', { page: currentPage, total: totalPages });
        document.getElementById("btn-prev").disabled = currentPage <= 1;
        document.getElementById("btn-next").disabled = currentPage >= totalPages;
      } else {
        pagEl.style.display = "none";
      }
    })
    .catch(function() {
      feedEl.innerHTML = '<div class="ds-alert ds-alert--danger">' + esc(t('feed.error.load')) + '</div>';
    });
  }

  // Make loadFeed globally accessible for the reset button
  window.loadFeed = loadFeed;
  var FILTER_STORAGE_KEY = "tc.capacityFeed.filters.v1";
  var FILTER_PARAM_MAP = {
    role: "ff-role",
    city: "ff-city",
    worker_category: "ff-category",
    shift_model: "ff-shift",
    compliance_status: "ff-compliance",
    min_headcount: "ff-headcount",
    availability_from: "ff-avail-from",
    sort: "ff-sort"
  };

  var advancedFilterIds = ["ff-shift", "ff-compliance", "ff-headcount", "ff-avail-from", "ff-immediate", "ff-sort"];
  var advancedFiltersEl = document.getElementById("feed-advanced-filters");
  var advancedToggle = document.getElementById("filter-toggle");
  var defaultSort = document.getElementById("ff-sort") ? document.getElementById("ff-sort").value : "newest";
  function readUrlFilters() {
    var params = new URLSearchParams(window.location.search);
    var filters = {};
    Object.keys(FILTER_PARAM_MAP).forEach(function(key) {
      if (params.has(key)) filters[key] = params.get(key);
    });
    if (params.get("availability_window") === "immediate") {
      filters.availability_window = "immediate";
    }
    return filters;
  }

  function readStoredFilters() {
    try {
      return JSON.parse(sessionStorage.getItem(FILTER_STORAGE_KEY) || "{}");
    } catch (err) {
      return {};
    }
  }

  function writeStoredFilters(filters) {
    try {
      sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
    } catch (err) {
      return;
    }
  }

  function setFieldValue(id, value) {
    var el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === "SELECT") {
      var hasOption = Array.from(el.options).some(function(opt) { return opt.value === value; });
      if (!hasOption) return;
    }
    if (id === "ff-headcount" && value) {
      var num = Number(value);
      if (!isFinite(num) || num <= 0) return;
    }
    if (id === "ff-avail-from" && value) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return;
    }
    el.value = value;
  }

  function applyFilterValues(values) {
    Object.keys(FILTER_PARAM_MAP).forEach(function(key) {
      if (!Object.prototype.hasOwnProperty.call(values, key)) return;
      setFieldValue(FILTER_PARAM_MAP[key], values[key]);
    });
  }

  function initFilterDefaults() {
    var urlFilters = readUrlFilters();
    var storedFilters = readStoredFilters();
    var merged = {};
    Object.keys(FILTER_PARAM_MAP).forEach(function(key) {
      if (Object.prototype.hasOwnProperty.call(urlFilters, key)) merged[key] = urlFilters[key];
      else if (Object.prototype.hasOwnProperty.call(storedFilters, key)) merged[key] = storedFilters[key];
    });
    if (Object.prototype.hasOwnProperty.call(urlFilters, "availability_window")) {
      merged.availability_window = urlFilters.availability_window;
    } else if (Object.prototype.hasOwnProperty.call(storedFilters, "availability_window")) {
      merged.availability_window = storedFilters.availability_window;
    }
    applyFilterValues(merged);
    if (merged.availability_window === "immediate") {
      setImmediateState(true, { anchor: merged.availability_from, skipRemember: true });
    } else {
      setImmediateState(false, { skipRemember: true });
    }
  }

  function persistFilters(filters) {
    writeStoredFilters(filters);
  }

  function hasAdvancedFilters() {
    return advancedFilterIds.some(function(id) {
      var el = document.getElementById(id);
      if (!el) return false;
      if (id === "ff-sort") {
        return el.value && el.value !== defaultSort;
      }
      if (id === "ff-immediate") {
        return el.checked === true;
      }
      return String(el.value || "").trim() !== "";
    });
  }

  function setAdvancedFilters(open, opts) {
    if (!advancedFiltersEl || !advancedToggle) return;
    advancedFiltersEl.hidden = !open;
    advancedToggle.setAttribute("aria-expanded", open ? "true" : "false");
    setI18n(advancedToggle, open ? 'feed.filters.collapse' : 'feed.filters.more');
    if (open && opts && opts.focus) {
      var firstField = advancedFiltersEl.querySelector("input, select");
      if (firstField) firstField.focus();
    }
  }

  initFilterDefaults();
  if (advancedToggle && advancedFiltersEl) {
    advancedToggle.addEventListener("click", function() {
      setAdvancedFilters(advancedFiltersEl.hidden, { focus: true });
    });
    setAdvancedFilters(hasAdvancedFilters());
  }

  document.getElementById("btn-search").addEventListener("click", function() { loadFeed(1); });
  document.getElementById("btn-prev").addEventListener("click", function() { if (currentPage > 1) loadFeed(currentPage - 1); });
  document.getElementById("btn-next").addEventListener("click", function() { loadFeed(currentPage + 1); });

  // Enter key triggers search
  ["ff-role","ff-city","ff-headcount","ff-avail-from"].forEach(function(id) {
    document.getElementById(id).addEventListener("keydown", function(e) { if (e.key === "Enter") loadFeed(1); });
  });
  ["ff-category","ff-shift","ff-compliance","ff-sort"].forEach(function(id) {
    document.getElementById(id).addEventListener("change", function() { loadFeed(1); });
  });
  document.getElementById("ff-avail-from").addEventListener("change", function() { loadFeed(1); });
  var immediateToggle = document.getElementById("ff-immediate");
  if (immediateToggle) {
    immediateToggle.addEventListener("change", function() {
      setImmediateState(immediateToggle.checked);
      loadFeed(1);
    });
  }

  // Quick-save / bookmark
  window._saveCap = function(btn) {
    var id = btn.getAttribute("data-save-id");
    btn.disabled = true;
    TC.api.post("/capacity-exchange/entries/" + id + "/interactions", { interaction_type: "save", message: null })
    .then(function() {
      btn.disabled = false;
      btn.innerHTML = "&#9733; " + esc(t('feed.card.saved')); btn.classList.add("saved");
    }).catch(function() { btn.disabled = false; });
  };


  // Load activity stats bar
  (function loadFeedStats() {
    TC.api.get("/capacity-exchange/stats")
    .then(function(s) {
      document.getElementById("fs-active").textContent = s.active != null ? s.active : "?";
      document.getElementById("fs-suppliers").textContent = s.unique_suppliers != null ? s.unique_suppliers : "?";
      document.getElementById("fs-deals").textContent = s.deals_last_30d != null ? s.deals_last_30d : "?";
      document.getElementById("fs-fresh").textContent = s.confirmed_today != null ? s.confirmed_today : "?";
    }).catch(function() {});
  })();

  loadFeed(1);

  /* ── Role-based CTAs ─────────────────────────────────
     Liegt bewusst INNERHALB dieser IIFE: so nutzen die Rollen-CTAs dasselbe
     Woerterbuch und dieselbe t()-Bruecke wie der Feed. Wo JS eine Beschriftung
     ersetzt, wandert der i18n-Schluessel per setI18n mit an den Knoten —
     sonst wuerde ein Sprachwechsel die rollenrichtige Fassung ueberschreiben. */
  TC.api.get("/me").then(function(me) {
    var cta = document.getElementById("feed-ctas");
    if (!cta) return;
    if (me.role === "agency") {
      cta.innerHTML =
        '<a href="/public/capacity_exchange_form.html" class="ds-btn ds-btn--primary ds-btn--sm" data-i18n="feed.cta.agency.create">' + esc(t('feed.cta.agency.create')) + '</a>' +
        '<a href="/public/capacity_exchange_notdienst.html" class="ds-btn ds-btn--sm" style="border-color:var(--ds-warning,#f59e0b);color:var(--ds-warning,#f59e0b);font-weight:700" data-i18n="feed.cta.agency.notdienst">' + esc(t('feed.cta.agency.notdienst')) + '</a>' +
        '<a href="/public/capacity_exchange_manage.html" class="ds-btn ds-btn--sm ds-btn--ghost" data-i18n="feed.cta.agency.manage">' + esc(t('feed.cta.agency.manage')) + '</a>';
      // Karte 2: ein Personal-Suchauftrag (capacity_search = "Personal finden") ist company-only.
      // Fuer Dienstleister stattdessen "Personal einstellen" (Create) -> passt zu Karte 3 (Personal verwalten).
      var ac2 = document.getElementById("feed-nav-card2");
      if (ac2) ac2.href = "/public/capacity_exchange_form.html";
      setI18n(document.getElementById("feed-nav-card2-title"), 'feed.cta.agency.create');
      setI18n(document.getElementById("feed-nav-card2-desc"), 'feed.nav.publishStaff.desc');
    } else if (me.role === "company") {
      cta.innerHTML =
        '<a href="/public/marketplace_demand_create.html" class="ds-btn ds-btn--primary ds-btn--sm" data-i18n="feed.cta.company.create">' + esc(t('feed.cta.company.create')) + '</a>' +
        '<a href="/public/marketplace_demand_list.html" class="ds-btn ds-btn--sm ds-btn--ghost" data-i18n="feed.cta.company.list">' + esc(t('feed.cta.company.list')) + '</a>';
      // Einsatzunternehmen bieten Arbeitsplaetze an (kein eigenes Personal): Karte 3 = Uebersicht der eigenen Arbeitsplatzangebote.
      var c3 = document.getElementById("feed-nav-card3");
      if (c3) c3.href = "/public/marketplace_demand_list.html";
      setI18n(document.getElementById("feed-nav-card3-title"), 'feed.nav.openJobs.title');
      setI18n(document.getElementById("feed-nav-card3-desc"), 'feed.nav.openJobs.desc');
    }
  }).catch(function() {});

  /* Sprachwechsel: das statische Markup zieht TCi18n.apply selbst nach. Die per
     JS gebauten Flaechen (Feed-Karten, Trefferzeile, Kontexthinweis, Seiten-
     zaehler) muessen dagegen neu gerendert werden — sonst blieben sie deutsch. */
  document.addEventListener("tc:langchange", function() {
    if (advancedFiltersEl && advancedToggle) setAdvancedFilters(!advancedFiltersEl.hidden);
    loadFeed(currentPage);
  });

  // Test-Hook: reine Render-Helfer fuer vm-Sandbox-Tests (kein Betriebspfad).
  if (typeof window !== "undefined") {
    window.__mpFeedTestHooks = { renderCard: renderCard, scarcitySignal: scarcitySignal, skillChipsHtml: skillChipsHtml };
  }
})();
