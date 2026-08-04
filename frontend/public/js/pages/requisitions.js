/**
 * requisitions.js — Page-spezifische Logik fuer requisitions.html
 *
 * Domäne: Operativer Beschaffungsbedarf / Stellenanforderungen (Requisitions)
 *
 * Stand April 2026:
 * Vollständige Page-Logik wurde aus requisitions.html ausgelagert.
 *
 * Statusmodell:
 *   DRAFT -> PENDING_APPROVAL -> APPROVED -> OPEN -> IN_REVIEW
 *   -> SHORTLISTED -> FILLED | CLOSED | CANCELLED
 *
 * Datenquellen:
 *   GET  /api/requisitions?status=&urgency=&mine=
 *   POST /api/requisitions
 *   GET  /api/requisitions/:id
 *   POST /api/requisitions/:id/transition
 *   GET  /api/requisitions/:id/events
 *   GET  /api/requisitions/:id/candidates
 *
 * Procurement-Deep-Links (neu, April 2026):
 *   -> vendor_pool.html                        (Passende Vendoren)
 *   -> rate-cards.html?role=&region=           (Rate Card mit Rollenfilter)
 *   -> spend-analytics.html?category=          (Kostenanalyse im Kategorienfilter)
 *   <- executive_dashboard.html                (Hub: Requisition-Status-Chart)
 */

'use strict';

/* ── Woerterbuch (P6.1, DE/EN) ─────────────────────────────────────────────
   Die Seite laedt i18n.js im head, dieses Modul laeuft ausschliesslich auf
   requisitions.html — TCi18n ist hier also garantiert vorhanden.

   Bewusst NICHT uebersetzt:
   - Status- und Dringlichkeits-Rohwerte (DRAFT, OPEN, urgent, ...): das sind
     Server-Enums, die auch der Statusfilter als Wert traegt.
   - alles aus pageShell.js (Topbar, Navigation, Nutzerbereich)
   - rollenabhaengige Begriffe aus terminologyLabels.js                       */
TCi18n.register('de', {
  'req.docTitle': 'Arbeitsplatzangebote – TempConnect',
  'req.page.title': 'Arbeitsplatzangebote',
  'req.page.subtitle': 'Arbeitsplatzangebote erfassen, priorisieren und durch den Freigabe-Workflow steuern.',
  'req.page.create': '+ Neues Arbeitsplatzangebot',
  'req.nav.vendorPool': 'Lieferantenpool',
  'req.nav.rateCards': 'Preisrahmen',
  'req.nav.scorecard': 'Lieferantenbewertung',
  'req.nav.spend': 'Spend Analytics',
  'req.filter.allStatus': 'Alle Status',
  'req.filter.allUrgency': 'Alle Dringlichkeiten',
  'req.filter.urgencyNormal': 'Normal',
  'req.filter.urgencyHigh': 'Hoch',
  'req.filter.urgencyUrgent': 'Dringend',
  'req.filter.urgencyNotdienst': 'Notdienst',
  'req.filter.mine': 'Nur meine',
  'req.filter.apply': 'Filtern',
  'req.table.title': 'Titel',
  'req.table.role': 'Rolle',
  'req.table.status': 'Status',
  'req.table.urgency': 'Dringlichkeit',
  'req.table.headcount': 'Headcount',
  'req.table.created': 'Erstellt',
  'req.empty.cta': 'Jetzt Arbeitsplatz anbieten',
  'req.detail.close': 'Schliessen',

  'req.next.OPEN': 'Wartet auf Angebote',
  'req.next.IN_REVIEW': 'Angebote prüfen',
  'req.next.SHORTLISTED': 'Auswahl finalisieren',
  'req.next.PARTIALLY_FILLED': 'Restbesetzung abschließen',
  'req.next.PENDING_APPROVAL': 'Freigabe ausstehend',
  'req.next.APPROVED': 'Einsatz starten',
  'req.next.FILLED': 'Besetzt — Einsatz verwalten',

  'req.rate.unverified': 'Preisrahmen sind derzeit nicht verifizierbar.',
  'req.rate.plan': 'Preisrahmen bleiben fuer berechtigte PRO-/Individuell-Zugaenge reserviert.',
  'req.rate.buyerOnly': 'Preisrahmen bleiben in dieser Sicht buyer-seitig fuer Unternehmensorganisationen reserviert.',
  'req.rate.role': 'Preisrahmen sind nur fuer leseberechtigte Procurement-/Steuerungsrollen sichtbar.',

  'req.state.loadingTitle': 'Arbeitsplatzangebote werden geladen',
  'req.state.loadingInit': 'Filter, Drilldowns und Liste werden vorbereitet.',
  'req.state.loadingList': 'Die Liste wird mit den aktuellen Filtern aktualisiert.',
  'req.state.csrfTitle': 'Initialisierung teilweise eingeschränkt',
  'req.state.csrfText': 'Das Sicherheitstoken konnte nicht geladen werden. Lesezugriffe bleiben verfügbar, Schreibaktionen koennen voruebergehend fehlschlagen.',
  'req.state.createdTitle': 'Arbeitsplatzangebot erstellt',
  'req.state.createdText': 'Das neue Arbeitsplatzangebot wurde angelegt und erscheint in der Liste.',
  'req.state.listFailTitle': 'Liste derzeit nicht verfügbar',
  'req.state.listFailText': 'Die Arbeitsplatzangebote konnten nicht geladen werden. Bereits gesetzte Filter bleiben erhalten.',

  'req.empty.errorTitle': 'Arbeitsplatzangebote konnten nicht geladen werden',
  'req.empty.errorText': 'Die Liste ist derzeit nicht verfügbar. Bitte erneut laden oder später nochmals versuchen.',
  'req.empty.filteredTitle': 'Keine Arbeitsplatzangebote für diese Auswahl',
  'req.empty.filteredLoc': 'Passen Sie Filter an. Aktiver Standort: {loc}.',
  'req.empty.filteredText': 'Passen Sie Filter oder Drilldown an, um wieder Ergebnisse zu sehen.',
  'req.empty.noneLoc': 'Noch keine Arbeitsplatzangebote für Standort {loc}',
  'req.empty.noneTitle': 'Noch keine Arbeitsplatzangebote',
  'req.empty.noneText': 'Erstellen Sie das erste Arbeitsplatzangebot, um den operativen Besetzungsfluss zu starten.',

  'req.drill.label': 'Drilldown vom Dashboard',
  'req.drill.backlog': ': Beschaffungs-Backlog',
  'req.drill.urgentOpen': ': dringende offene Arbeitsplatzangebote',
  'req.drill.status': ': Status',
  'req.drill.urgency': ', Dringlichkeit',
  'req.drill.focus': ', Fokus auf Vorgang',
  'req.drill.reset': 'Filter zuruecksetzen',

  'req.detail.loadingTitle': 'Arbeitsplatzangebot wird geladen',
  'req.detail.loadingText': 'Die Detailansicht wird geladen.',
  'req.detail.errorTitle': 'Arbeitsplatzangebot nicht verfügbar',
  'req.detail.errorText': 'Das Arbeitsplatzangebot konnte derzeit nicht geladen werden. Bitte Liste aktualisieren und erneut versuchen.',
  'req.detail.stateTitle': 'Detailansicht unvollständig',
  'req.detail.stateText': 'Das ausgewählte Arbeitsplatzangebot konnte nicht geladen werden.',
  'req.detail.role': 'Rolle:',
  'req.detail.status': 'Status:',
  'req.detail.headcount': 'Headcount:',
  'req.detail.urgency': 'Dringlichkeit:',
  'req.detail.city': 'Stadt:',
  'req.detail.created': 'Erstellt:',
  'req.detail.creator': 'Ersteller:',
  'req.detail.assigned': 'Zugewiesen:',
  'req.detail.description': 'Beschreibung:',

  'req.progress.label': 'Prozessfortschritt',
  'req.step.draft': 'Draft',
  'req.step.approval': 'Freigabe',
  'req.step.approved': 'Genehmigt',
  'req.step.open': 'Offen',
  'req.step.review': 'In Pruefung',
  'req.step.shortlist': 'Shortlist',
  'req.step.filled': 'Besetzt',

  'req.links.heading': 'Procurement-Verbindungen',
  'req.links.vendors': 'Passende Vendoren',
  'req.links.rateCard': 'Rate Card pruefen',
  'req.links.spend': 'Spend fuer Rolle',
  'req.links.scorecard': 'Lieferant-Scorecard',
  'req.links.assignment': 'Einsatz-Deal',

  'req.action.open': 'Oeffnen',
  'req.action.toApproval': 'Zur Freigabe',
  'req.action.approve': 'Genehmigen',
  'req.action.filled': 'Besetzt',
  'req.action.close': 'Schliessen',
  'req.action.cancel': 'Stornieren',

  'req.cand.heading': 'Kandidaten',
  'req.cand.error': 'Kandidaten konnten derzeit nicht geladen werden.',
  'req.cand.count': '{count} Kandidat(en) im aktuellen Stand.',
  'req.cand.colStaff': 'Personal',
  'req.cand.colStatus': 'Status',
  'req.cand.colScore': 'Score',
  'req.cand.empty': 'Noch keine Kandidaten für dieses Arbeitsplatzangebot vorhanden.',

  'req.events.heading': 'Event-Historie',
  'req.events.error': 'Die Event-Historie konnte derzeit nicht geladen werden.',
  'req.events.empty': 'Noch keine Event-Historie für dieses Arbeitsplatzangebot dokumentiert.',
  'req.events.system': 'System',

  'req.cancel.prompt': 'Stornierungsgrund (optional):',
  'req.transition.okTitle': 'Status aktualisiert',
  'req.transition.okText': 'Das Arbeitsplatzangebot wurde erfolgreich auf {status} gesetzt.',
  'req.transition.failTitle': 'Statuswechsel fehlgeschlagen',
  'req.transition.failText': 'Der Statuswechsel konnte nicht gespeichert werden.',
  'req.error.network': 'Netzwerkfehler oder Server nicht erreichbar.'
});
TCi18n.register('en', {
  'req.docTitle': 'Job postings – TempConnect',
  'req.page.title': 'Job postings',
  'req.page.subtitle': 'Capture, prioritise and steer job postings through the approval workflow.',
  'req.page.create': '+ New job posting',
  'req.nav.vendorPool': 'Supplier pool',
  'req.nav.rateCards': 'Rate cards',
  'req.nav.scorecard': 'Supplier scorecard',
  'req.nav.spend': 'Spend analytics',
  'req.filter.allStatus': 'All statuses',
  'req.filter.allUrgency': 'All urgency levels',
  'req.filter.urgencyNormal': 'Normal',
  'req.filter.urgencyHigh': 'High',
  'req.filter.urgencyUrgent': 'Urgent',
  'req.filter.urgencyNotdienst': 'Emergency cover',
  'req.filter.mine': 'Mine only',
  'req.filter.apply': 'Apply filters',
  'req.table.title': 'Title',
  'req.table.role': 'Role',
  'req.table.status': 'Status',
  'req.table.urgency': 'Urgency',
  'req.table.headcount': 'Headcount',
  'req.table.created': 'Created',
  'req.empty.cta': 'Post a job now',
  'req.detail.close': 'Close',

  'req.next.OPEN': 'Awaiting offers',
  'req.next.IN_REVIEW': 'Review offers',
  'req.next.SHORTLISTED': 'Finalise the selection',
  'req.next.PARTIALLY_FILLED': 'Complete the remaining placements',
  'req.next.PENDING_APPROVAL': 'Approval pending',
  'req.next.APPROVED': 'Start the assignment',
  'req.next.FILLED': 'Filled — manage the assignment',

  'req.rate.unverified': 'Rate card access cannot be verified right now.',
  'req.rate.plan': 'Rate cards remain reserved for eligible PRO and Individual access.',
  'req.rate.buyerOnly': 'In this view, rate cards remain reserved for buyer-side company organisations.',
  'req.rate.role': 'Rate cards are visible only to procurement and steering roles with read access.',

  'req.state.loadingTitle': 'Loading job postings',
  'req.state.loadingInit': 'Filters, drilldowns and the list are being prepared.',
  'req.state.loadingList': 'The list is being refreshed with the current filters.',
  'req.state.csrfTitle': 'Initialisation partly limited',
  'req.state.csrfText': 'The security token could not be loaded. Read access stays available, write actions may fail temporarily.',
  'req.state.createdTitle': 'Job posting created',
  'req.state.createdText': 'The new job posting has been created and appears in the list.',
  'req.state.listFailTitle': 'List currently unavailable',
  'req.state.listFailText': 'The job postings could not be loaded. Filters you already set are kept.',

  'req.empty.errorTitle': 'Job postings could not be loaded',
  'req.empty.errorText': 'The list is currently unavailable. Please reload or try again later.',
  'req.empty.filteredTitle': 'No job postings for this selection',
  'req.empty.filteredLoc': 'Adjust the filters. Active location: {loc}.',
  'req.empty.filteredText': 'Adjust the filters or the drilldown to see results again.',
  'req.empty.noneLoc': 'No job postings yet for location {loc}',
  'req.empty.noneTitle': 'No job postings yet',
  'req.empty.noneText': 'Create the first job posting to start the operational filling flow.',

  'req.drill.label': 'Drilldown from the dashboard',
  'req.drill.backlog': ': procurement backlog',
  'req.drill.urgentOpen': ': urgent open job postings',
  'req.drill.status': ': status',
  'req.drill.urgency': ', urgency',
  'req.drill.focus': ', focused on one posting',
  'req.drill.reset': 'Reset filters',

  'req.detail.loadingTitle': 'Loading job posting',
  'req.detail.loadingText': 'The detail view is loading.',
  'req.detail.errorTitle': 'Job posting unavailable',
  'req.detail.errorText': 'The job posting could not be loaded right now. Please refresh the list and try again.',
  'req.detail.stateTitle': 'Detail view incomplete',
  'req.detail.stateText': 'The selected job posting could not be loaded.',
  'req.detail.role': 'Role:',
  'req.detail.status': 'Status:',
  'req.detail.headcount': 'Headcount:',
  'req.detail.urgency': 'Urgency:',
  'req.detail.city': 'City:',
  'req.detail.created': 'Created:',
  'req.detail.creator': 'Created by:',
  'req.detail.assigned': 'Assigned to:',
  'req.detail.description': 'Description:',

  'req.progress.label': 'Process progress',
  'req.step.draft': 'Draft',
  'req.step.approval': 'Approval',
  'req.step.approved': 'Approved',
  'req.step.open': 'Open',
  'req.step.review': 'In review',
  'req.step.shortlist': 'Shortlist',
  'req.step.filled': 'Filled',

  'req.links.heading': 'Procurement links',
  'req.links.vendors': 'Matching suppliers',
  'req.links.rateCard': 'Check rate card',
  'req.links.spend': 'Spend for this role',
  'req.links.scorecard': 'Supplier scorecard',
  'req.links.assignment': 'Assignment deal',

  'req.action.open': 'Open',
  'req.action.toApproval': 'Send for approval',
  'req.action.approve': 'Approve',
  'req.action.filled': 'Mark as filled',
  'req.action.close': 'Close',
  'req.action.cancel': 'Cancel posting',

  'req.cand.heading': 'Candidates',
  'req.cand.error': 'Candidates could not be loaded right now.',
  'req.cand.count': '{count} candidate(s) as of now.',
  'req.cand.colStaff': 'Staff',
  'req.cand.colStatus': 'Status',
  'req.cand.colScore': 'Score',
  'req.cand.empty': 'No candidates for this job posting yet.',

  'req.events.heading': 'Event history',
  'req.events.error': 'The event history could not be loaded right now.',
  'req.events.empty': 'No event history documented for this job posting yet.',
  'req.events.system': 'System',

  'req.cancel.prompt': 'Cancellation reason (optional):',
  'req.transition.okTitle': 'Status updated',
  'req.transition.okText': 'The job posting was successfully set to {status}.',
  'req.transition.failTitle': 'Status change failed',
  'req.transition.failText': 'The status change could not be saved.',
  'req.error.network': 'Network error or server unreachable.'
});

function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

/* Naechster operativer Schritt je Requisition-Status — Inline-Guidance auf der Zeile
   ("jeder weiss was als Naechstes zu tun ist"), analog zu .dm-card__nextstep bei Deals.
   Die Texte liegen zweisprachig im Woerterbuch (Praefix req.next.); die Karte
   haelt nur noch fest, WELCHE Status ueberhaupt einen naechsten Schritt haben. */
var REQ_NEXT_STEP = {
  OPEN: true,
  IN_REVIEW: true,
  SHORTLISTED: true,
  PARTIALLY_FILLED: true,
  PENDING_APPROVAL: true,
  APPROVED: true,
  FILLED: true
};
function reqNextStep(status) { return REQ_NEXT_STEP[status] ? TCi18n.t('req.next.' + status) : ''; }
var csrfToken = '';
var activeStatusGroup = '';
var focusReqId = '';
var focusOpened = false;
var currentMe = null;
var rateCardAccess = { canRead: false, reason: '' };
var REQ_FILTER_STORAGE_KEY = 'tc.requisitions.filters.v1';
var reqUrlState = { hasStatus: false, hasUrgency: false, hasDrilldown: false };
var RATE_CARD_READ_ROLES = {
  platform_admin: true,
  owner: true,
  admin: true,
  program_manager: true,
  hiring_manager: true,
  supplier_manager: true,
  finance: true,
  viewer: true
};
function normalizePlan(plan) {
  var p = String(plan || 'DEMO').toUpperCase();
  if (p === 'FREE') return 'DEMO';
  if (p === 'ENTERPRISE' || p === 'INDIVIDUAL') return 'INDIVIDUELL';
  return p;
}
function resolveRateCardAccess(me) {
  var roleType = String(me && me.role || '').toLowerCase();
  var plan = normalizePlan(me && me.plan);
  var orgRole = String(me && me.org_role || '').trim();
  if (!me) return { canRead: false, reason: TCi18n.t('req.rate.unverified') };
  if (plan !== 'PRO' && plan !== 'INDIVIDUELL') {
    return { canRead: false, reason: TCi18n.t('req.rate.plan') };
  }
  if (roleType === 'agency') {
    return { canRead: false, reason: TCi18n.t('req.rate.buyerOnly') };
  }
  if (!RATE_CARD_READ_ROLES[orgRole]) {
    return { canRead: false, reason: TCi18n.t('req.rate.role') };
  }
  return { canRead: true, reason: '' };
}
function applyRateCardLinkVisibility() {
  var link = document.getElementById('reqRateCardLink');
  if (!link) return;
  link.style.display = rateCardAccess.canRead ? '' : 'none';
}
function renderPageState(id, tone, title, text) {
  var el = document.getElementById(id);
  if (!el) return;
  if (!title && !text) {
    el.className = 'page-state';
    el.innerHTML = '';
    el.style.display = 'none';
    return;
  }
  el.className = 'page-state page-state--' + (tone || 'info');
  el.innerHTML =
    '<div class="page-state__title">' + esc(title || '') + '</div>' +
    '<div class="page-state__text">' + esc(text || '') + '</div>';
  el.style.display = '';
}
function showReqState(tone, title, text) { renderPageState('reqState', tone, title, text); }
function clearReqState() { renderPageState('reqState'); }
function setEmptyState(title, text, showCreate) {
  document.getElementById('emptyTitle').textContent = title;
  document.getElementById('emptyText').textContent = text;
  document.getElementById('emptyActions').style.display = showCreate ? '' : 'none';
  document.getElementById('emptyMsg').style.display = '';
}
function hideEmptyState() {
  document.getElementById('emptyMsg').style.display = 'none';
}
function sectionNote(text) {
  return '<div class="section-note">' + esc(text) + '</div>';
}
function parseApiError(result, fallback) {
  if (!result) return fallback;
  if (typeof result.error === 'string' && result.error) return result.error;
  if (Array.isArray(result.details) && result.details.length) return result.details.join(', ');
  if (typeof result.details === 'string' && result.details) return result.details;
  return fallback;
}
function readStoredReqFilters() {
  try {
    var raw = sessionStorage.getItem(REQ_FILTER_STORAGE_KEY);
    if (!raw) return {};
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) { return {}; }
}
function writeStoredReqFilters(filters) {
  try { sessionStorage.setItem(REQ_FILTER_STORAGE_KEY, JSON.stringify(filters || {})); }
  catch (e) { /* Session-Storage kann lokal blockiert sein. */ }
}
function applyReqFilterDefaults(urlState) {
  var stored = (urlState && urlState.hasDrilldown) ? {} : readStoredReqFilters();
  var status = (urlState && urlState.hasStatus) ? urlState.status : (stored.status || '');
  var urgency = (urlState && urlState.hasUrgency) ? urlState.urgency : (stored.urgency || '');
  var statusEl = document.getElementById('fStatus');
  var urgencyEl = document.getElementById('fUrgency');
  var mineEl = document.getElementById('fMine');
  if (statusEl) statusEl.value = status || '';
  if (urgencyEl) urgencyEl.value = urgency || '';
  if (mineEl && !(urlState && urlState.hasDrilldown)) mineEl.checked = !!stored.mine;
}

function getLocHeader() {
  try { return (window.TC && TC.api && typeof TC.api.getActiveLocationId === 'function') ? TC.api.getActiveLocationId() : null; } catch (_e) { return null; }
}
function getLocLabel() {
  try { return sessionStorage.getItem('tc.activeLocationName') || null; } catch (_e) { return null; }
}
async function apiGet(path) {
  try {
    var headers = {};
    var locId = getLocHeader();
    if (locId) headers['X-Location-Id'] = locId;
    var r = await fetch('/api' + path, { credentials: 'include', headers: headers });
    if (r.status === 401) { location.href = '/'; return null; }
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}
async function apiPost(path, body) {
  try {
    var r = await fetch('/api' + path, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify(body)
    });
    if (r.status === 401) { location.href = '/'; return null; }
    var text = await r.text();
    var data = {};
    if (text) {
      try { data = JSON.parse(text); } catch (err) { data = {}; }
    }
    if (r.ok) return data;
    if (!data.error) data.error = 'HTTP ' + r.status;
    return data;
  } catch (e) {
    return { error: TCi18n.t('req.error.network') };
  }
}

/* Drilldown-Hinweis vom Executive Dashboard — als eigene Funktion, damit ihn
   der Sprachwechsel neu aufbauen kann (er entsteht per innerHTML, ein reines
   apply() der i18n-Schicht wuerde ihn nicht erreichen). */
var drillPreStatus = '';
var drillPreUrgency = '';
function drilldownHintHtml() {
  return '&#128279; ' + esc(TCi18n.t('req.drill.label'))
    + (activeStatusGroup === 'backlog' ? esc(TCi18n.t('req.drill.backlog')) : '')
    + (activeStatusGroup === 'urgent_open' ? esc(TCi18n.t('req.drill.urgentOpen')) : '')
    + (drillPreStatus ? esc(TCi18n.t('req.drill.status')) + ' <strong>' + esc(drillPreStatus) + '</strong>' : '')
    + (drillPreUrgency ? esc(TCi18n.t('req.drill.urgency')) + ' <strong>' + esc(drillPreUrgency) + '</strong>' : '')
    + (focusReqId ? esc(TCi18n.t('req.drill.focus')) : '')
    + ' &nbsp;<a href="/public/requisitions.html" style="color:var(--brand);font-size:12px">'
    + esc(TCi18n.t('req.drill.reset')) + ' &times;</a>';
}

async function init() {
  showReqState('info', TCi18n.t('req.state.loadingTitle'), TCi18n.t('req.state.loadingInit'));
  currentMe = await apiGet('/me');
  rateCardAccess = resolveRateCardAccess(currentMe);
  applyRateCardLinkVisibility();
  try {
    var csrf = await fetch('/api/csrf', { credentials: 'include' });
    if (csrf.ok) { var d = await csrf.json(); csrfToken = d.csrfToken || ''; }
  } catch (e) {
    showReqState('warn', TCi18n.t('req.state.csrfTitle'), TCi18n.t('req.state.csrfText'));
  }
  // URL-Parameter-Drilldown vom Executive Dashboard: ?status=OPEN&urgency=urgent oder ?status_group=backlog&focus_id=...
  var urlP = new URLSearchParams(window.location.search);
  reqUrlState.hasStatus = urlP.has('status');
  reqUrlState.hasUrgency = urlP.has('urgency');
  var preStatus = reqUrlState.hasStatus ? (urlP.get('status') || '') : '';
  var preUrgency = reqUrlState.hasUrgency ? (urlP.get('urgency') || '') : '';
  drillPreStatus = preStatus;
  drillPreUrgency = preUrgency;
  activeStatusGroup = urlP.get('status_group') || '';
  focusReqId = urlP.get('focus_id') || '';
  reqUrlState.hasDrilldown = !!(reqUrlState.hasStatus || reqUrlState.hasUrgency || activeStatusGroup || focusReqId);
  applyReqFilterDefaults({
    status: preStatus,
    urgency: preUrgency,
    hasStatus: reqUrlState.hasStatus,
    hasUrgency: reqUrlState.hasUrgency,
    hasDrilldown: reqUrlState.hasDrilldown
  });
  if (reqUrlState.hasDrilldown) {
    var hint = document.createElement('div');
    hint.id = 'reqDrilldownHint';
    hint.style.cssText = 'background:rgba(74,158,255,.08);border:1px solid rgba(74,158,255,.2);border-radius:8px;padding:8px 14px;font-size:13px;margin-bottom:10px;color:var(--ds-text-secondary)';
    hint.innerHTML = drilldownHintHtml();
    var filterRow = document.querySelector('.filter-row');
    if (filterRow) filterRow.before(hint);
  }
  await loadList(false);
  if (new URLSearchParams(window.location.search).get('created') === '1') {
    showReqState('good', TCi18n.t('req.state.createdTitle'), TCi18n.t('req.state.createdText'));
  }
}

/* Sprachwechsel: die per innerHTML gebauten Flaechen (Drilldown-Hinweis, Liste,
   Empty-State, Detail-Drawer) traegt die deklarative Hydration nicht — sie
   werden hier gezielt neu aufgebaut, sonst bliebe die halbe Seite deutsch. */
document.addEventListener('tc:langchange', function () {
  var hint = document.getElementById('reqDrilldownHint');
  if (hint) hint.innerHTML = drilldownHintHtml();
  loadList(false);
  var modal = document.getElementById('detailModal');
  if (modal && modal.classList.contains('show') && currentReqId) openDetail(currentReqId);
});

async function loadList(persist) {
  var shouldPersist = persist !== false;
  var allowPersist = shouldPersist && !reqUrlState.hasDrilldown;
  showReqState('info', TCi18n.t('req.state.loadingTitle'), TCi18n.t('req.state.loadingList'));
  var qs = [];
  var st = document.getElementById('fStatus').value;
  var urg = document.getElementById('fUrgency').value;
  var mine = document.getElementById('fMine').checked;
  qs.push('limit=200');
  if (st) qs.push('status=' + st);
  if (urg) qs.push('urgency=' + urg);
  if (mine) qs.push('mine=true');
  if (allowPersist) writeStoredReqFilters({ status: st || '', urgency: urg || '', mine: !!mine });
  var data = await apiGet('/requisitions' + (qs.length ? '?' + qs.join('&') : ''));
  if (!data) {
    document.getElementById('reqBody').innerHTML = '';
    setEmptyState(TCi18n.t('req.empty.errorTitle'), TCi18n.t('req.empty.errorText'), false);
    showReqState('bad', TCi18n.t('req.state.listFailTitle'), TCi18n.t('req.state.listFailText'));
    return;
  }
  var rows = data.items || [];
  if (activeStatusGroup === 'backlog') {
    rows = rows.filter(function(r) {
      return ['OPEN', 'IN_REVIEW', 'SHORTLISTED', 'PARTIALLY_FILLED', 'APPROVED', 'PENDING_APPROVAL'].includes(r.status);
    });
  } else if (activeStatusGroup === 'urgent_open') {
    rows = rows.filter(function(r) {
      return r.urgency === 'urgent' && ['OPEN', 'IN_REVIEW', 'PARTIALLY_FILLED'].includes(r.status);
    });
  }
  var tbody = document.getElementById('reqBody');
  if (!rows.length) {
    tbody.innerHTML = '';
    var locLabel = getLocLabel();
    if (st || urg || mine || activeStatusGroup) {
      var filterSub = locLabel
        ? TCi18n.t('req.empty.filteredLoc', { loc: locLabel })
        : TCi18n.t('req.empty.filteredText');
      setEmptyState(TCi18n.t('req.empty.filteredTitle'), filterSub, false);
    } else {
      var emptyTitle = locLabel
        ? TCi18n.t('req.empty.noneLoc', { loc: locLabel })
        : TCi18n.t('req.empty.noneTitle');
      setEmptyState(emptyTitle, TCi18n.t('req.empty.noneText'), true);
    }
    clearReqState();
    if (focusReqId && !focusOpened) {
      focusOpened = true;
      openDetail(focusReqId);
    }
    return;
  }
  hideEmptyState();
  clearReqState();
  tbody.innerHTML = rows.map(function(r) {
    var urgClass = (r.urgency === 'urgent' || r.urgency === 'notdienst') ? 'ub-urgent' : r.urgency === 'high' ? 'ub-high' : '';
    var nextStep = reqNextStep(r.status);
    return '<tr class="req-row" onclick="openDetail(\'' + r.id + '\')">' +
      '<td>' + esc(r.title) + (nextStep ? '<div class="req-nextstep" style="font-size:11px;color:var(--ds-brand,#4a9eff);font-weight:600;margin-top:2px">→ ' + esc(nextStep) + '</div>' : '') + '</td>' +
      '<td>' + esc(r.role) + '</td>' +
      '<td><span class="status-badge sb-' + r.status + '">' + esc(r.status) + '</span></td>' +
      '<td>' + (urgClass ? '<span class="urgency-badge ' + urgClass + '">' + esc(r.urgency) + '</span>' : esc(r.urgency || 'normal')) + '</td>' +
      '<td>' + (r.headcount || 1) + '</td>' +
      '<td style="font-size:12px;color:var(--muted)">' + new Date(r.created_at).toLocaleDateString(TCi18n.dateLocale()) + '</td></tr>';
  }).join('');
  if (focusReqId && !focusOpened) {
    focusOpened = true;
    openDetail(focusReqId);
  }
}

/* -- Detail ---------------------------------------- */
var currentReqId = null;
async function openDetail(id) {
  currentReqId = id;
  document.getElementById('detTitle').textContent = TCi18n.t('req.detail.loadingTitle');
  document.getElementById('detContent').innerHTML = sectionNote(TCi18n.t('req.detail.loadingText'));
  document.getElementById('detailModal').classList.add('show');
  var req = await apiGet('/requisitions/' + id);
  if (!req) {
    document.getElementById('detTitle').textContent = TCi18n.t('req.detail.errorTitle');
    document.getElementById('detContent').innerHTML = sectionNote(TCi18n.t('req.detail.errorText'));
    showReqState('warn', TCi18n.t('req.detail.stateTitle'), TCi18n.t('req.detail.stateText'));
    return;
  }
  document.getElementById('detTitle').textContent = req.title;
  var evts = await apiGet('/requisitions/' + id + '/events');
  var cands = await apiGet('/requisitions/' + id + '/candidates');

  var html = '<div class="detail-section"><div class="detail-grid">' +
    '<div><span class="dg-label">' + esc(TCi18n.t('req.detail.role')) + '</span> ' + esc(req.role) + '</div>' +
    '<div><span class="dg-label">' + esc(TCi18n.t('req.detail.status')) + '</span> <span class="status-badge sb-' + req.status + '">' + esc(req.status) + '</span></div>' +
    '<div><span class="dg-label">' + esc(TCi18n.t('req.detail.headcount')) + '</span> ' + (req.headcount || 1) + '</div>' +
    '<div><span class="dg-label">' + esc(TCi18n.t('req.detail.urgency')) + '</span> ' + esc(req.urgency || 'normal') + '</div>' +
    '<div><span class="dg-label">' + esc(TCi18n.t('req.detail.city')) + '</span> ' + esc(req.location_city || '–') + '</div>' +
    '<div><span class="dg-label">' + esc(TCi18n.t('req.detail.created')) + '</span> ' + new Date(req.created_at).toLocaleString(TCi18n.dateLocale()) + '</div>' +
    '<div><span class="dg-label">' + esc(TCi18n.t('req.detail.creator')) + '</span> ' + esc(req.created_by_name || req.created_by_email || '–') + '</div>' +
    '<div><span class="dg-label">' + esc(TCi18n.t('req.detail.assigned')) + '</span> ' + esc(req.assigned_to_name || req.assigned_to_email || '–') + '</div>' +
    (req.description ? '<div class="form-full"><span class="dg-label">' + esc(TCi18n.t('req.detail.description')) + '</span><br>' + esc(req.description) + '</div>' : '') +
    '</div></div>';

  // Procurement-Verbindungen + Besetzungsstatus
  var vendorPoolUrl = '/public/vendor_pool.html';
  var rateCardUrl = '/public/rate-cards.html?role=' + encodeURIComponent(req.role || '');
  if (req.location_city) rateCardUrl += '&region=' + encodeURIComponent(req.location_city);
  var catEncoded = encodeURIComponent(req.worker_category || req.role || '');
  var spendUrl = '/public/spend-analytics.html'
    + (catEncoded ? '?category=' + catEncoded : '');
  var scoreUrl = req.assigned_supplier_id
    ? '/public/supplier_scorecard.html?agencyId=' + encodeURIComponent(req.assigned_supplier_id)
      + '&agencyName=' + encodeURIComponent(req.assigned_supplier_name || '')
    : null;

  // Fortschritts-Indikator
  var flowSteps = {
    'DRAFT': 1, 'PENDING_APPROVAL': 2, 'APPROVED': 3,
    'OPEN': 4, 'IN_REVIEW': 5, 'SHORTLISTED': 6, 'PARTIALLY_FILLED': 6, 'FILLED': 7, 'CLOSED': 7, 'CANCELLED': 0
  };
  var step = flowSteps[req.status] != null ? flowSteps[req.status] : 1;
  var pct = Math.round((Math.max(0, step) / 7) * 100);
  var stepLabels = ['req.step.draft','req.step.approval','req.step.approved','req.step.open','req.step.review','req.step.shortlist','req.step.filled']
    .map(function(k) { return TCi18n.t(k); });
  html += '<div style="margin:14px 0;padding:12px;background:rgba(255,255,255,.02);border:1px solid var(--line);border-radius:8px">';
  html += '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:8px">' + esc(TCi18n.t('req.progress.label')) + '</div>';
  html += '<div style="height:6px;border-radius:3px;background:rgba(255,255,255,.06);overflow:hidden;margin-bottom:6px">';
  html += '<div style="height:100%;border-radius:3px;background:' + (req.status==='CANCELLED'?'var(--bad)':req.status==='FILLED'?'var(--good)':'var(--brand)') + ';width:' + pct + '%;transition:width .4s"></div></div>';
  html += '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted)">';
  stepLabels.forEach(function(l,i) {
    html += '<span style="' + (i+1===step?'color:var(--text);font-weight:700':'') + '">' + esc(l) + '</span>';
  });
  html += '</div></div>';

  html += '<div class="actions-row" style="border-top:1px solid var(--line);padding-top:12px;margin-top:12px">';
  html += '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;width:100%;margin-bottom:6px">' + esc(TCi18n.t('req.links.heading')) + '</div>';
  html += '<a class="btn" href="'+vendorPoolUrl+'" target="_blank" style="font-size:12px">' + esc(TCi18n.t('req.links.vendors')) + ' &#8594;</a>';
  if (rateCardAccess.canRead) {
    html += '<a class="btn" href="'+rateCardUrl+'" target="_blank" style="font-size:12px">' + esc(TCi18n.t('req.links.rateCard')) + ' &#8594;</a>';
  }
  html += '<a class="btn" href="'+spendUrl+'" target="_blank" style="font-size:12px">' + esc(TCi18n.t('req.links.spend')) + ' &#8594;</a>';
  if (scoreUrl) html += '<a class="btn" href="'+scoreUrl+'" target="_blank" style="font-size:12px">' + esc(TCi18n.t('req.links.scorecard')) + ' &#8594;</a>';
  if (req.assignment_id) {
    html += '<a class="btn good" href="/public/offer_detail.html?id='+encodeURIComponent(req.assignment_id)+'" target="_blank" style="font-size:12px">' + esc(TCi18n.t('req.links.assignment')) + ' &#8594;</a>';
  }
  if (!rateCardAccess.canRead && rateCardAccess.reason) {
    html += '<div class="table-meta" style="width:100%">' + esc(rateCardAccess.reason) + '</div>';
  }
  html += '</div>';

  // Workflow-Aktionen
  html += '<div class="actions-row">';
  if (req.status === 'DRAFT') {
    html += '<button class="btn primary" onclick="doTransition(\'OPEN\')">' + esc(TCi18n.t('req.action.open')) + '</button>';
    html += '<button class="btn" onclick="doTransition(\'PENDING_APPROVAL\')">' + esc(TCi18n.t('req.action.toApproval')) + '</button>';
  }
  if (req.status === 'PENDING_APPROVAL') {
    html += '<button class="btn good" onclick="doTransition(\'APPROVED\')">' + esc(TCi18n.t('req.action.approve')) + '</button>';
  }
  if (req.status === 'APPROVED') {
    html += '<button class="btn primary" onclick="doTransition(\'OPEN\')">' + esc(TCi18n.t('req.action.open')) + '</button>';
  }
  if (['OPEN','IN_REVIEW','SHORTLISTED'].includes(req.status)) {
    html += '<button class="btn good" onclick="doTransition(\'FILLED\')">' + esc(TCi18n.t('req.action.filled')) + '</button>';
    html += '<button class="btn" onclick="doTransition(\'CLOSED\')">' + esc(TCi18n.t('req.action.close')) + '</button>';
  }
  if (!['FILLED','CLOSED','CANCELLED'].includes(req.status)) {
    html += '<button class="btn bad" onclick="doTransition(\'CANCELLED\')">' + esc(TCi18n.t('req.action.cancel')) + '</button>';
  }
  html += '</div>';

  // Kandidaten
  html += '<div class="detail-section" style="margin-top:16px"><h4>' + esc(TCi18n.t('req.cand.heading')) + '</h4>';
  if (!cands) {
    html += sectionNote(TCi18n.t('req.cand.error'));
  } else if (cands.candidates && cands.candidates.length) {
    html += '<div class="table-meta" style="margin-bottom:8px">' + esc(TCi18n.t('req.cand.count', { count: cands.candidates.length })) + '</div>';
    html += '<table class="table"><thead><tr><th>' + esc(TCi18n.t('req.cand.colStaff')) + '</th><th>' + esc(TCi18n.t('req.cand.colStatus')) + '</th><th>' + esc(TCi18n.t('req.cand.colScore')) + '</th></tr></thead><tbody>';
    cands.candidates.forEach(function(c) {
      html += '<tr><td>' + esc(c.capacity_title || c.capacity_post_id || '–') + '</td>' +
        '<td><span class="status-badge sb-' + (c.status === 'shortlisted' ? 'FILLED' : c.status === 'rejected' ? 'CANCELLED' : 'OPEN') + '">' + esc(c.status) + '</span></td>' +
        '<td>' + (c.match_score != null ? c.match_score : '–') + '</td></tr>';
    });
    html += '</tbody></table>';
  } else {
    html += sectionNote(TCi18n.t('req.cand.empty'));
  }
  html += '</div>';

  html += '<div class="detail-section" style="margin-top:16px"><h4>' + esc(TCi18n.t('req.events.heading')) + '</h4>';
  if (!evts) {
    html += sectionNote(TCi18n.t('req.events.error'));
  } else if (evts.events && evts.events.length) {
    html += '<div class="event-list">';
    evts.events.forEach(function(e) {
      html += '<div class="event-item"><b>' + esc(e.event_type) + '</b> – ' +
        esc(e.actor_name || e.actor_email || TCi18n.t('req.events.system')) +
        '<span class="muted">' + new Date(e.created_at).toLocaleString(TCi18n.dateLocale()) + '</span></div>';
    });
    html += '</div>';
  } else {
    html += sectionNote(TCi18n.t('req.events.empty'));
  }
  html += '</div>';

  document.getElementById('detContent').innerHTML = html;
  document.getElementById('detailModal').classList.add('show');
}

function closeDetail() { document.getElementById('detailModal').classList.remove('show'); currentReqId = null; }

async function doTransition(status) {
  if (!currentReqId) return;
  var payload = { status: status };
  if (status === 'CANCELLED') {
    var reason = prompt(TCi18n.t('req.cancel.prompt'));
    if (reason) payload.cancel_reason = reason;
  }
  var result = await apiPost('/requisitions/' + currentReqId + '/transition', payload);
  if (result && !result.error) {
    closeDetail();
    showReqState('good', TCi18n.t('req.transition.okTitle'), TCi18n.t('req.transition.okText', { status: status }));
    loadList();
  } else {
    showReqState('bad', TCi18n.t('req.transition.failTitle'), parseApiError(result, TCi18n.t('req.transition.failText')));
  }
}

/* -- Create ---------------------------------------- */
// Erstellen läuft jetzt über die dedizierte Vollseite requisition_create.html
// (eine Logik-Quelle: POST /api/requisitions dort). Das frühere Create-Modal +
// showCreate/closeCreate/submitCreate wurden entfernt — der Button und der
// Empty-State auf requisitions.html verlinken direkt auf die Seite.

window.loadList = loadList;
window.openDetail = openDetail;
window.closeDetail = closeDetail;
window.doTransition = doTransition;
init();
