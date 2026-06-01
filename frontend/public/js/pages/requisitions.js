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
function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
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
  if (!me) return { canRead: false, reason: 'Preisrahmen sind derzeit nicht verifizierbar.' };
  if (plan !== 'PRO' && plan !== 'INDIVIDUELL') {
    return { canRead: false, reason: 'Preisrahmen bleiben fuer berechtigte PRO-/Individuell-Zugaenge reserviert.' };
  }
  if (roleType === 'agency') {
    return { canRead: false, reason: 'Preisrahmen bleiben in dieser Sicht buyer-seitig fuer Unternehmensorganisationen reserviert.' };
  }
  if (!RATE_CARD_READ_ROLES[orgRole]) {
    return { canRead: false, reason: 'Preisrahmen sind nur fuer leseberechtigte Procurement-/Steuerungsrollen sichtbar.' };
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
    return { error: 'Netzwerkfehler oder Server nicht erreichbar.' };
  }
}

async function init() {
  showReqState('info', 'Arbeitsplatzangebote werden geladen', 'Filter, Drilldowns und Liste werden vorbereitet.');
  currentMe = await apiGet('/me');
  rateCardAccess = resolveRateCardAccess(currentMe);
  applyRateCardLinkVisibility();
  try {
    var csrf = await fetch('/api/csrf', { credentials: 'include' });
    if (csrf.ok) { var d = await csrf.json(); csrfToken = d.csrfToken || ''; }
  } catch (e) {
    showReqState('warn', 'Initialisierung teilweise eingeschränkt', 'Das Sicherheitstoken konnte nicht geladen werden. Lesezugriffe bleiben verfügbar, Schreibaktionen koennen voruebergehend fehlschlagen.');
  }
  // URL-Parameter-Drilldown vom Executive Dashboard: ?status=OPEN&urgency=urgent oder ?status_group=backlog&focus_id=...
  var urlP = new URLSearchParams(window.location.search);
  reqUrlState.hasStatus = urlP.has('status');
  reqUrlState.hasUrgency = urlP.has('urgency');
  var preStatus = reqUrlState.hasStatus ? (urlP.get('status') || '') : '';
  var preUrgency = reqUrlState.hasUrgency ? (urlP.get('urgency') || '') : '';
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
    hint.style.cssText = 'background:rgba(74,158,255,.08);border:1px solid rgba(74,158,255,.2);border-radius:8px;padding:8px 14px;font-size:13px;margin-bottom:10px;color:var(--ds-text-secondary)';
    hint.innerHTML = '&#128279; Drilldown vom Dashboard'
      + (activeStatusGroup === 'backlog' ? ': Beschaffungs-Backlog' : '')
      + (activeStatusGroup === 'urgent_open' ? ': dringende offene Arbeitsplatzangebote' : '')
      + (preStatus ? ': Status <strong>' + esc(preStatus) + '</strong>' : '')
      + (preUrgency ? ', Dringlichkeit <strong>' + esc(preUrgency) + '</strong>' : '')
      + (focusReqId ? ', Fokus auf Vorgang' : '')
      + ' &nbsp;<a href="/public/requisitions.html" style="color:var(--brand);font-size:12px">Filter zuruecksetzen &times;</a>';
    var filterRow = document.querySelector('.filter-row');
    if (filterRow) filterRow.before(hint);
  }
  await loadList(false);
}

async function loadList(persist) {
  var shouldPersist = persist !== false;
  var allowPersist = shouldPersist && !reqUrlState.hasDrilldown;
  showReqState('info', 'Arbeitsplatzangebote werden geladen', 'Die Liste wird mit den aktuellen Filtern aktualisiert.');
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
    setEmptyState('Arbeitsplatzangebote konnten nicht geladen werden', 'Die Liste ist derzeit nicht verfügbar. Bitte erneut laden oder später nochmals versuchen.', false);
    showReqState('bad', 'Liste derzeit nicht verfügbar', 'Die Arbeitsplatzangebote konnten nicht geladen werden. Bereits gesetzte Filter bleiben erhalten.');
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
      var filterSub = locLabel ? 'Passen Sie Filter an. Aktiver Standort: ' + locLabel + '.' : 'Passen Sie Filter oder Drilldown an, um wieder Ergebnisse zu sehen.';
      setEmptyState('Keine Arbeitsplatzangebote für diese Auswahl', filterSub, false);
    } else {
      var emptyTitle = locLabel ? 'Noch keine Arbeitsplatzangebote für Standort ' + locLabel : 'Noch keine Arbeitsplatzangebote';
      setEmptyState(emptyTitle, 'Erstellen Sie das erste Arbeitsplatzangebot, um den operativen Besetzungsfluss zu starten.', true);
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
    return '<tr class="req-row" onclick="openDetail(\'' + r.id + '\')">' +
      '<td>' + esc(r.title) + '</td>' +
      '<td>' + esc(r.role) + '</td>' +
      '<td><span class="status-badge sb-' + r.status + '">' + esc(r.status) + '</span></td>' +
      '<td>' + (urgClass ? '<span class="urgency-badge ' + urgClass + '">' + esc(r.urgency) + '</span>' : esc(r.urgency || 'normal')) + '</td>' +
      '<td>' + (r.headcount || 1) + '</td>' +
      '<td style="font-size:12px;color:var(--muted)">' + new Date(r.created_at).toLocaleDateString('de') + '</td></tr>';
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
  document.getElementById('detTitle').textContent = 'Arbeitsplatzangebot wird geladen';
  document.getElementById('detContent').innerHTML = sectionNote('Die Detailansicht wird geladen.');
  document.getElementById('detailModal').classList.add('show');
  var req = await apiGet('/requisitions/' + id);
  if (!req) {
    document.getElementById('detTitle').textContent = 'Arbeitsplatzangebot nicht verfügbar';
    document.getElementById('detContent').innerHTML = sectionNote('Das Arbeitsplatzangebot konnte derzeit nicht geladen werden. Bitte Liste aktualisieren und erneut versuchen.');
    showReqState('warn', 'Detailansicht unvollständig', 'Das ausgewählte Arbeitsplatzangebot konnte nicht geladen werden.');
    return;
  }
  document.getElementById('detTitle').textContent = req.title;
  var evts = await apiGet('/requisitions/' + id + '/events');
  var cands = await apiGet('/requisitions/' + id + '/candidates');

  var html = '<div class="detail-section"><div class="detail-grid">' +
    '<div><span class="dg-label">Rolle:</span> ' + esc(req.role) + '</div>' +
    '<div><span class="dg-label">Status:</span> <span class="status-badge sb-' + req.status + '">' + esc(req.status) + '</span></div>' +
    '<div><span class="dg-label">Headcount:</span> ' + (req.headcount || 1) + '</div>' +
    '<div><span class="dg-label">Dringlichkeit:</span> ' + esc(req.urgency || 'normal') + '</div>' +
    '<div><span class="dg-label">Stadt:</span> ' + esc(req.location_city || '–') + '</div>' +
    '<div><span class="dg-label">Erstellt:</span> ' + new Date(req.created_at).toLocaleString('de') + '</div>' +
    '<div><span class="dg-label">Ersteller:</span> ' + esc(req.created_by_name || req.created_by_email || '–') + '</div>' +
    '<div><span class="dg-label">Zugewiesen:</span> ' + esc(req.assigned_to_name || req.assigned_to_email || '–') + '</div>' +
    (req.description ? '<div class="form-full"><span class="dg-label">Beschreibung:</span><br>' + esc(req.description) + '</div>' : '') +
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
  var stepLabels = ['Draft','Freigabe','Genehmigt','Offen','In Pruefung','Shortlist','Besetzt'];
  html += '<div style="margin:14px 0;padding:12px;background:rgba(255,255,255,.02);border:1px solid var(--line);border-radius:8px">';
  html += '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:8px">Prozessfortschritt</div>';
  html += '<div style="height:6px;border-radius:3px;background:rgba(255,255,255,.06);overflow:hidden;margin-bottom:6px">';
  html += '<div style="height:100%;border-radius:3px;background:' + (req.status==='CANCELLED'?'var(--bad)':req.status==='FILLED'?'var(--good)':'var(--brand)') + ';width:' + pct + '%;transition:width .4s"></div></div>';
  html += '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted)">';
  stepLabels.forEach(function(l,i) {
    html += '<span style="' + (i+1===step?'color:var(--text);font-weight:700':'') + '">' + l + '</span>';
  });
  html += '</div></div>';

  html += '<div class="actions-row" style="border-top:1px solid var(--line);padding-top:12px;margin-top:12px">';
  html += '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;width:100%;margin-bottom:6px">Procurement-Verbindungen</div>';
  html += '<a class="btn" href="'+vendorPoolUrl+'" target="_blank" style="font-size:12px">Passende Vendoren &#8594;</a>';
  if (rateCardAccess.canRead) {
    html += '<a class="btn" href="'+rateCardUrl+'" target="_blank" style="font-size:12px">Rate Card pruefen &#8594;</a>';
  }
  html += '<a class="btn" href="'+spendUrl+'" target="_blank" style="font-size:12px">Spend fuer Rolle &#8594;</a>';
  if (scoreUrl) html += '<a class="btn" href="'+scoreUrl+'" target="_blank" style="font-size:12px">Lieferant-Scorecard &#8594;</a>';
  if (req.assignment_id) {
    html += '<a class="btn good" href="/public/offer_detail.html?id='+encodeURIComponent(req.assignment_id)+'" target="_blank" style="font-size:12px">Einsatz-Deal &#8594;</a>';
  }
  if (!rateCardAccess.canRead && rateCardAccess.reason) {
    html += '<div class="table-meta" style="width:100%">' + esc(rateCardAccess.reason) + '</div>';
  }
  html += '</div>';

  // Workflow-Aktionen
  html += '<div class="actions-row">';
  if (req.status === 'DRAFT') {
    html += '<button class="btn primary" onclick="doTransition(\'OPEN\')">Oeffnen</button>';
    html += '<button class="btn" onclick="doTransition(\'PENDING_APPROVAL\')">Zur Freigabe</button>';
  }
  if (req.status === 'PENDING_APPROVAL') {
    html += '<button class="btn good" onclick="doTransition(\'APPROVED\')">Genehmigen</button>';
  }
  if (req.status === 'APPROVED') {
    html += '<button class="btn primary" onclick="doTransition(\'OPEN\')">Oeffnen</button>';
  }
  if (['OPEN','IN_REVIEW','SHORTLISTED'].includes(req.status)) {
    html += '<button class="btn good" onclick="doTransition(\'FILLED\')">Besetzt</button>';
    html += '<button class="btn" onclick="doTransition(\'CLOSED\')">Schliessen</button>';
  }
  if (!['FILLED','CLOSED','CANCELLED'].includes(req.status)) {
    html += '<button class="btn bad" onclick="doTransition(\'CANCELLED\')">Stornieren</button>';
  }
  html += '</div>';

  // Kandidaten
  html += '<div class="detail-section" style="margin-top:16px"><h4>Kandidaten</h4>';
  if (!cands) {
    html += sectionNote('Kandidaten konnten derzeit nicht geladen werden.');
  } else if (cands.candidates && cands.candidates.length) {
    html += '<div class="table-meta" style="margin-bottom:8px">' + cands.candidates.length + ' Kandidat(en) im aktuellen Stand.</div>';
    html += '<table class="table"><thead><tr><th>Personal</th><th>Status</th><th>Score</th></tr></thead><tbody>';
    cands.candidates.forEach(function(c) {
      html += '<tr><td>' + esc(c.capacity_title || c.capacity_post_id || '–') + '</td>' +
        '<td><span class="status-badge sb-' + (c.status === 'shortlisted' ? 'FILLED' : c.status === 'rejected' ? 'CANCELLED' : 'OPEN') + '">' + esc(c.status) + '</span></td>' +
        '<td>' + (c.match_score != null ? c.match_score : '–') + '</td></tr>';
    });
    html += '</tbody></table>';
  } else {
    html += sectionNote('Noch keine Kandidaten für dieses Arbeitsplatzangebot vorhanden.');
  }
  html += '</div>';

  html += '<div class="detail-section" style="margin-top:16px"><h4>Event-Historie</h4>';
  if (!evts) {
    html += sectionNote('Die Event-Historie konnte derzeit nicht geladen werden.');
  } else if (evts.events && evts.events.length) {
    html += '<div class="event-list">';
    evts.events.forEach(function(e) {
      html += '<div class="event-item"><b>' + esc(e.event_type) + '</b> – ' +
        esc(e.actor_name || e.actor_email || 'System') +
        '<span class="muted">' + new Date(e.created_at).toLocaleString('de') + '</span></div>';
    });
    html += '</div>';
  } else {
    html += sectionNote('Noch keine Event-Historie für dieses Arbeitsplatzangebot dokumentiert.');
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
    var reason = prompt('Stornierungsgrund (optional):');
    if (reason) payload.cancel_reason = reason;
  }
  var result = await apiPost('/requisitions/' + currentReqId + '/transition', payload);
  if (result && !result.error) {
    closeDetail();
    showReqState('good', 'Status aktualisiert', 'Das Arbeitsplatzangebot wurde erfolgreich auf ' + status + ' gesetzt.');
    loadList();
  } else {
    showReqState('bad', 'Statuswechsel fehlgeschlagen', parseApiError(result, 'Der Statuswechsel konnte nicht gespeichert werden.'));
  }
}

/* -- Create ---------------------------------------- */
function showCreate() { document.getElementById('createModal').classList.add('show'); }
function closeCreate() { document.getElementById('createModal').classList.remove('show'); }

async function submitCreate(e) {
  e.preventDefault();
  var skills = document.getElementById('cSkills').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  var body = {
    title: document.getElementById('cTitle').value,
    role: document.getElementById('cRole').value,
    description: document.getElementById('cDesc').value || null,
    headcount: parseInt(document.getElementById('cHead').value, 10) || 1,
    urgency: document.getElementById('cUrg').value,
    start_date: document.getElementById('cStart').value || null,
    end_date: document.getElementById('cEnd').value || null,
    location_city: document.getElementById('cCity').value || null,
    location_postal: document.getElementById('cPostal').value || null,
    radius_km: parseInt(document.getElementById('cRadius').value, 10) || 25,
    skill_tags: skills.length ? skills : undefined,
    budget_min_cents: parseInt(document.getElementById('cBudgetMin').value, 10) || undefined,
    budget_max_cents: parseInt(document.getElementById('cBudgetMax').value, 10) || undefined,
    approval_required: document.getElementById('cApproval').checked
  };
  var result = await apiPost('/requisitions', body);
  if (result && result.id) {
    closeCreate();
    document.getElementById('createForm').reset();
    showReqState('good', 'Arbeitsplatzangebot erstellt', 'Das neue Arbeitsplatzangebot wurde angelegt und in die Liste übernommen.');
    loadList();
  } else {
    showReqState('bad', 'Erstellung fehlgeschlagen', parseApiError(result, 'Das Arbeitsplatzangebot konnte nicht erstellt werden.'));
  }
}

window.loadList = loadList;
window.openDetail = openDetail;
window.closeDetail = closeDetail;
window.doTransition = doTransition;
window.showCreate = showCreate;
window.closeCreate = closeCreate;
window.submitCreate = submitCreate;
init();
