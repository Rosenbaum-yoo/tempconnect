/* ═══════════════════════════════════════════════════════
   Timesheets — Page Logic
   ═══════════════════════════════════════════════════════ */
(function() {
  'use strict';

  /* ── State ─────────────────────────────────────────── */
  var _me = null;
  var _timesheets = [];
  var _currentTs = null;
  var _debounceTimer = null;
  var TIMESHEET_FILTER_STORAGE_KEY = 'tc.timesheets.filters.v1';

  function readStoredTimesheetFilters() {
    try {
      var raw = sessionStorage.getItem(TIMESHEET_FILTER_STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) { return {}; }
  }

  function writeStoredTimesheetFilters(filters) {
    try { sessionStorage.setItem(TIMESHEET_FILTER_STORAGE_KEY, JSON.stringify(filters || {})); }
    catch (e) { /* Session-Storage kann lokal blockiert sein. */ }
  }
  function sanitizeStoredTimesheetFilters(filters) {
    if (!filters || typeof filters !== 'object') return {};
    return {
      status: filters.status || '',
      from: filters.from || '',
      to: filters.to || ''
    };
  }

  function readUrlTimesheetFilters() {
    var params = new URLSearchParams(window.location.search || '');
    var filters = {};
    if (params.has('status')) filters.status = params.get('status') || '';
    if (params.has('from') || params.has('week_start_from')) filters.from = params.get('from') || params.get('week_start_from') || '';
    if (params.has('to') || params.has('week_start_to')) filters.to = params.get('to') || params.get('week_start_to') || '';
    if (params.has('worker') || params.has('worker_name')) filters.worker = params.get('worker') || params.get('worker_name') || '';
    return filters;
  }

  function applyTimesheetFilterDefaults() {
    var urlFilters = readUrlTimesheetFilters();
    var hasUrlFilters = Object.keys(urlFilters).length > 0;
    var storedRaw = hasUrlFilters ? {} : readStoredTimesheetFilters();
    var stored = sanitizeStoredTimesheetFilters(storedRaw);
    if (storedRaw && storedRaw.worker) writeStoredTimesheetFilters(stored);
    var status = Object.prototype.hasOwnProperty.call(urlFilters, 'status') ? urlFilters.status : (stored.status || '');
    var from = Object.prototype.hasOwnProperty.call(urlFilters, 'from') ? urlFilters.from : (stored.from || '');
    var to = Object.prototype.hasOwnProperty.call(urlFilters, 'to') ? urlFilters.to : (stored.to || '');
    var worker = Object.prototype.hasOwnProperty.call(urlFilters, 'worker') ? urlFilters.worker : '';
    document.getElementById('filterStatus').value = status || '';
    document.getElementById('filterFrom').value = from || '';
    document.getElementById('filterTo').value = to || '';
    document.getElementById('filterWorker').value = worker || '';
  }

  /* ── Init ──────────────────────────────────────────── */
  async function init() {
    try {
      _me = await TC.api.get('/me');
    } catch(e) {
      document.getElementById('paywall').style.display = '';
      return;
    }

    await PlanFeatures.load();
    var plan = (_me && _me.plan) ? _me.plan : 'DEMO';
    if (plan === 'FREE') plan = 'DEMO';
    if (!PlanFeatures.hasFeature(plan, 'timesheets')) {
      document.getElementById('lock-current-plan').textContent = plan;
      document.getElementById('feature-lock').style.display = '';
      return;
    }

    document.getElementById('main').style.display = '';
    applyTimesheetFilterDefaults();
    loadTimesheets(false);
  }

  /* ── Load Timesheets ───────────────────────────────── */
  async function loadTimesheets(persist) {
    var shouldPersist = persist !== false;
    var params = new URLSearchParams();
    var st = document.getElementById('filterStatus').value;
    var fr = document.getElementById('filterFrom').value;
    var to = document.getElementById('filterTo').value;
    var wn = document.getElementById('filterWorker').value.trim();
    if (shouldPersist) {
      writeStoredTimesheetFilters({ status: st || '', from: fr || '', to: to || '' });
    }
    if (st) params.set('status', st);
    if (fr) params.set('week_start_from', fr);
    if (to) params.set('week_start_to', to);
    if (wn) params.set('worker_name', wn);
    params.set('limit', '100');

    try {
      var data = await TC.api.get('/timesheets?' + params.toString());
      _timesheets = data.items || [];
      renderTable(_timesheets);
      updateKPIs(_timesheets);
    } catch(e) { renderEmpty('Verbindungsfehler.'); }
  }
  window.loadTimesheets = loadTimesheets;

  function debounceLoad() {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(function() { loadTimesheets(true); }, 400);
  }
  window.debounceLoad = debounceLoad;

  /* ── Render Table ──────────────────────────────────── */
  function renderTable(list) {
    var tbody = document.getElementById('tableBody');
    if (!list.length) {
      var locLbl = (function() { try { return sessionStorage.getItem('tc.activeLocationName') || null; } catch (_e) { return null; } })();
      var emptyMsg = locLbl ? 'Keine Stundenzettel für Standort ' + esc(locLbl) + '.' : 'Keine Stundenzettel gefunden.';
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">&#128336;</div><p>' + emptyMsg + '</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = list.map(function(ts) {
      return '<tr>' +
        '<td><div class="ts-worker">' + esc(ts.worker_name) + '</div>' +
             (ts.worker_identifier ? '<div class="ts-period">' + esc(ts.worker_identifier) + '</div>' : '') +
             '<div class="ts-period">' + esc(ts.supplier_org_name || ts.supplier_org_id) + '</div></td>' +
        '<td><div>' + fmtDate(ts.week_start) + '</div><div class="ts-period">' + fmtDate(ts.week_end) + '</div></td>' +
        '<td><div class="ts-hours">' + fmtH(ts.total_hours) + ' h</div>' +
             (ts.overtime_hours > 0 ? '<div class="ts-hours-ot">Ü ' + fmtH(ts.overtime_hours) + ' h</div>' : '') + '</td>' +
        '<td>' + badge(ts.status) + '</td>' +
        '<td style="font-size:12px;color:var(--ds-text-secondary)">' + (ts.submitted_at ? fmtDateTime(ts.submitted_at) : '–') + '</td>' +
        '<td><div class="ts-actions">' +
          '<button class="btn" style="font-size:11px;padding:4px 10px" onclick="openDetail(\'' + ts.id + '\')">Detail</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
  }

  function updateKPIs(list) {
    document.getElementById('kpiTotal').textContent = list.length;
    document.getElementById('kpiPending').textContent = list.filter(function(t) { return t.status === 'submitted'; }).length;
    document.getElementById('kpiApproved').textContent = list.filter(function(t) { return t.status === 'approved'; }).length;
    var hrs = list.filter(function(t) { return t.status === 'approved'; }).reduce(function(s,t) { return s + parseFloat(t.total_hours||0); }, 0);
    document.getElementById('kpiHours').textContent = fmtH(hrs) + ' h';
  }

  function renderEmpty(msg) {
    document.getElementById('tableBody').innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>' + esc(msg) + '</p></div></td></tr>';
  }

  /* ── Detail Modal ──────────────────────────────────── */
  async function openDetail(id) {
    try { _currentTs = await TC.api.get('/timesheets/' + id); }
    catch(e) { alert('Fehler beim Laden.'); return; }
    renderDetail(_currentTs);
    document.getElementById('detailModal').classList.add('active');
  }
  window.openDetail = openDetail;

  function renderDetail(ts) {
    document.getElementById('detailTitle').textContent = '🕐 ' + ts.worker_name;
    document.getElementById('detailMeta').innerHTML =
      '<strong>' + esc(ts.org_name || ts.org_id) + '</strong> ← ' +
      esc(ts.supplier_org_name || ts.supplier_org_id) + ' &nbsp;|&nbsp; ' +
      fmtDate(ts.week_start) + ' bis ' + fmtDate(ts.week_end);

    document.getElementById('detailStatus').innerHTML = badge(ts.status) +
      (ts.rejection_reason ? ' <span style="font-size:12px;color:#ef4444;margin-left:8px">Grund: ' + esc(ts.rejection_reason) + '</span>' : '');

    var grid = document.getElementById('entryGrid');
    var entries = ts.entries || [];
    if (!entries.length) {
      grid.innerHTML = '<p style="font-size:13px;color:var(--ds-text-secondary)">Noch keine Tageseintraege.</p>';
    } else {
      grid.innerHTML = entries.map(function(e) {
        return '<div class="entry-card">' +
          '<div class="entry-card__date">' + fmtDate(e.work_date) + '</div>' +
          '<div class="entry-card__hours">' + fmtH(parseFloat(e.hours_regular)+parseFloat(e.hours_overtime)) + ' h</div>' +
          '<div class="entry-card__detail">Regulaer: ' + fmtH(e.hours_regular) + ' h' +
            (parseFloat(e.hours_overtime) > 0 ? ' | Überstunden: ' + fmtH(e.hours_overtime) + ' h' : '') +
            (e.break_minutes > 0 ? ' | Pause: ' + e.break_minutes + ' min' : '') +
          '</div>' +
          (e.shift_start ? '<div class="entry-card__detail">🕐 ' + e.shift_start + ' – ' + (e.shift_end || '?') + '</div>' : '') +
          (e.notes ? '<div class="entry-card__detail" style="margin-top:4px;font-style:italic">' + esc(e.notes) + '</div>' : '') +
          (ts.status === 'draft' ? '<button class="btn" style="margin-top:8px;font-size:11px;padding:3px 8px;color:#ef4444;border-color:rgba(248,113,113,.3)" onclick="deleteEntry(\'' + e.id + '\')">Loeschen</button>' : '') +
        '</div>';
      }).join('');
    }

    document.getElementById('addEntryBtn').style.display = ts.status === 'draft' ? '' : 'none';
    document.getElementById('entryForm').style.display = 'none';

    document.getElementById('detailTotals').innerHTML =
      '<div class="ts-kpi"><div class="ts-kpi__val">' + fmtH(ts.total_hours) + ' h</div><div class="ts-kpi__label">Gesamtstunden</div></div>' +
      '<div class="ts-kpi"><div class="ts-kpi__val" style="color:#f59e0b">' + fmtH(ts.overtime_hours) + ' h</div><div class="ts-kpi__label">Überstunden</div></div>';

    var acts = document.getElementById('detailActions');
    var btns = [];
    if (ts.status === 'draft' || ts.status === 'rejected') {
      btns.push('<button class="btn primary" onclick="submitTs()">Einreichen</button>');
    }
    if (ts.status === 'submitted') {
      btns.push('<button class="btn" style="background:rgba(52,211,153,.15);color:#10b981;border-color:rgba(52,211,153,.3)" onclick="approveTs()">Freigeben</button>');
      btns.push('<button class="btn" style="background:rgba(248,113,113,.1);color:#ef4444;border-color:rgba(248,113,113,.3)" onclick="showRejectForm()">Ablehnen</button>');
      btns.push('<button class="btn" onclick="returnToDraft()">Zurück zu Entwurf</button>');
    }
    if (ts.status === 'draft' || ts.status === 'submitted') {
      btns.push('<button class="btn" style="color:var(--ds-text-secondary)" onclick="cancelTs()">Stornieren</button>');
    }
    acts.innerHTML = btns.join('');
    document.getElementById('rejectForm').style.display = 'none';
  }

  function closeDetailModal() {
    document.getElementById('detailModal').classList.remove('active');
    _currentTs = null;
  }
  window.closeDetailModal = closeDetailModal;

  /* ── Timesheet Actions ─────────────────────────────── */
  async function action(path, body) {
    try {
      await TC.api.post('/timesheets/' + _currentTs.id + path, body || undefined);
      return true;
    } catch(e) {
      alert((e.code || 'Fehler') + (e.message ? ': ' + e.message : ''));
      return false;
    }
  }

  async function submitTs() {
    if (await action('/submit')) { await openDetail(_currentTs.id); loadTimesheets(); }
  }
  window.submitTs = submitTs;

  async function approveTs() {
    if (await action('/approve')) { await openDetail(_currentTs.id); loadTimesheets(); }
  }
  window.approveTs = approveTs;

  async function cancelTs() {
    if (!confirm('Stundenzettel stornieren?')) return;
    if (await action('/cancel')) { await openDetail(_currentTs.id); loadTimesheets(); }
  }
  window.cancelTs = cancelTs;

  async function returnToDraft() {
    if (await action('/return-to-draft')) { await openDetail(_currentTs.id); loadTimesheets(); }
  }
  window.returnToDraft = returnToDraft;

  function showRejectForm() {
    document.getElementById('rejectForm').style.display = '';
    document.getElementById('rejectReason').focus();
  }
  window.showRejectForm = showRejectForm;

  async function confirmReject() {
    var reason = document.getElementById('rejectReason').value.trim();
    try {
      await TC.api.post('/timesheets/' + _currentTs.id + '/reject', { reason: reason || null });
      await openDetail(_currentTs.id); loadTimesheets();
    } catch(e) { alert(e.code || 'Fehler'); }
  }
  window.confirmReject = confirmReject;

  /* ── Entries ───────────────────────────────────────── */
  function openAddEntry() {
    document.getElementById('eDate').value = '';
    document.getElementById('eRegular').value = '8';
    document.getElementById('eOvertime').value = '0';
    document.getElementById('eBreak').value = '30';
    document.getElementById('eStart').value = '';
    document.getElementById('eEnd').value = '';
    document.getElementById('eNotes').value = '';
    document.getElementById('entryError').style.display = 'none';
    document.getElementById('entryForm').style.display = '';
    document.getElementById('eDate').focus();
  }
  window.openAddEntry = openAddEntry;

  async function saveEntry() {
    var payload = {
      work_date:      document.getElementById('eDate').value,
      hours_regular:  parseFloat(document.getElementById('eRegular').value) || 0,
      hours_overtime: parseFloat(document.getElementById('eOvertime').value) || 0,
      break_minutes:  parseInt(document.getElementById('eBreak').value) || 0,
      shift_start:    document.getElementById('eStart').value || null,
      shift_end:      document.getElementById('eEnd').value || null,
      notes:          document.getElementById('eNotes').value || null
    };
    if (!payload.work_date) {
      document.getElementById('entryError').textContent = 'Datum ist erforderlich.';
      document.getElementById('entryError').style.display = '';
      return;
    }
    try {
      await TC.api.post('/timesheets/' + _currentTs.id + '/entries', payload);
      document.getElementById('entryForm').style.display = 'none';
      await openDetail(_currentTs.id);
    } catch(e) {
      document.getElementById('entryError').textContent = e.code || 'Fehler';
      document.getElementById('entryError').style.display = '';
    }
  }
  window.saveEntry = saveEntry;

  async function deleteEntry(entryId) {
    if (!confirm('Eintrag loeschen?')) return;
    try {
      await TC.api.delete('/timesheets/' + _currentTs.id + '/entries/' + entryId);
      await openDetail(_currentTs.id);
    } catch(e) { alert('Fehler beim Loeschen.'); }
  }
  window.deleteEntry = deleteEntry;

  /* ── Create Timesheet ──────────────────────────────── */
  function openCreateModal() {
    var now = new Date();
    var day = now.getDay();
    var diff = (day === 0) ? -6 : 1 - day;
    var mon = new Date(now); mon.setDate(now.getDate() + diff);
    var fri = new Date(mon); fri.setDate(mon.getDate() + 4);
    document.getElementById('fWeekStart').value = fmtISO(mon);
    document.getElementById('fWeekEnd').value = fmtISO(fri);
    document.getElementById('fWorkerName').value = '';
    document.getElementById('fWorkerIdent').value = '';
    document.getElementById('fOrgId').value = '';
    document.getElementById('fSupplierOrgId').value = '';
    document.getElementById('fAssignmentId').value = '';
    document.getElementById('fNotes').value = '';
    document.getElementById('createError').style.display = 'none';
    document.getElementById('createModal').classList.add('active');
  }
  window.openCreateModal = openCreateModal;

  function closeCreateModal() { document.getElementById('createModal').classList.remove('active'); }
  window.closeCreateModal = closeCreateModal;

  async function createTimesheet() {
    var payload = {
      org_id:            document.getElementById('fOrgId').value.trim(),
      supplier_org_id:   document.getElementById('fSupplierOrgId').value.trim(),
      worker_name:       document.getElementById('fWorkerName').value.trim(),
      worker_identifier: document.getElementById('fWorkerIdent').value.trim() || null,
      week_start:        document.getElementById('fWeekStart').value,
      week_end:          document.getElementById('fWeekEnd').value,
      assignment_id:     document.getElementById('fAssignmentId').value.trim() || null,
      notes:             document.getElementById('fNotes').value.trim() || null
    };
    if (!payload.org_id || !payload.supplier_org_id || !payload.worker_name || !payload.week_start || !payload.week_end) {
      document.getElementById('createError').textContent = 'Bitte alle Pflichtfelder ausfüllen.';
      document.getElementById('createError').style.display = '';
      return;
    }
    try {
      var ts = await TC.api.post('/timesheets', payload);
      closeCreateModal();
      loadTimesheets();
      openDetail(ts.id);
    } catch(e) {
      document.getElementById('createError').textContent = e.code || 'Fehler beim Anlegen.';
      document.getElementById('createError').style.display = '';
    }
  }
  window.createTimesheet = createTimesheet;

  /* ── Utilities ─────────────────────────────────────── */
  function esc(v) {
    if (v == null) return '';
    return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function fmtDate(d) {
    if (!d) return '–';
    var p = d.split('T')[0].split('-');
    return p[2] + '.' + p[1] + '.' + p[0];
  }
  function fmtDateTime(d) {
    if (!d) return '–';
    var dt = new Date(d);
    return dt.toLocaleDateString('de-DE') + ' ' + dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtH(v) { return parseFloat(v || 0).toFixed(2).replace('.00','').replace(/\.(\d)$/,'.$10'); }
  function fmtISO(d) { return d.toISOString().split('T')[0]; }
  function badge(status) {
    var label = { draft:'Entwurf', submitted:'Eingereicht', approved:'Genehmigt', rejected:'Abgelehnt', cancelled:'Storniert' };
    return '<span class="ts-badge ts-badge--' + status + '">' + (label[status] || status) + '</span>';
  }

  // Modal close on overlay click
  document.getElementById('createModal').addEventListener('click', function(e) { if (e.target === this) closeCreateModal(); });
  document.getElementById('detailModal').addEventListener('click', function(e) { if (e.target === this) closeDetailModal(); });

  init();
})();
