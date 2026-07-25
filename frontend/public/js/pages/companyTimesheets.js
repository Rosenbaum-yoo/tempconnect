/* ═══════════════════════════════════════════════════════
   Company Timesheets — Käufer-Sicht (P2.2)
   Auto-gescoped auf die eigene Unternehmens-Org (kein manuelles Org-ID-Eintippen).
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var _rows = [];
  var _current = null;

  // Escaped auch Apostrophe: Werte landen u.a. in onclick="fn('…')" — ohne &#39; könnte
  // ein Wert aus dem JS-String-Literal ausbrechen (heute nur DB-UUIDs, morgen evtl. Namen).
  function esc(v) {
    if (v == null) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtDate(d) {
    if (!d) return '–';
    var p = String(d).split('T')[0].split('-');
    return p.length === 3 ? (p[2] + '.' + p[1] + '.' + p[0]) : '–';
  }
  function fmtH(v) { return parseFloat(v || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)$/, '$10'); }
  function workerName(r) {
    return ((r.first_name || '') + ' ' + (r.last_name || '')).trim() || r.worker_email || 'Mitarbeiter';
  }
  function isCompanyGateError(e) {
    var c = ((e && (e.code || e.error)) || '') + '';
    return /COMPANY_TIMESHEETS|BUYER_ORG|ORG_TYPE|NO_ORG_MEMBERSHIP|ORG_CONTEXT_REQUIRED/.test(c);
  }

  var STATUS = {
    sent_to_customer:    { cls: 'ct-badge--review', label: 'Zu prüfen' },
    customer_confirmed:  { cls: 'ct-badge--ok',     label: 'Bestätigt' },
    customer_rejected:   { cls: 'ct-badge--rej',    label: 'Zurückgewiesen' },
    posted_to_timesheet: { cls: 'ct-badge--done',   label: 'Abgerechnet' }
  };
  function badge(status) {
    var s = STATUS[status] || { cls: '', label: status };
    return '<span class="ct-badge ' + s.cls + '">' + esc(s.label) + '</span>';
  }

  function show(which) {
    ['paywall', 'notCompany', 'main'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = (id === which) ? '' : 'none';
    });
  }

  async function init() {
    try { await TC.api.get('/me'); }
    catch (e) { show('paywall'); return; }
    show('main');
    ctLoad();
  }

  async function ctLoad() {
    var st = document.getElementById('filterStatus').value;
    var q = st ? ('?status=' + encodeURIComponent(st)) : '';
    try {
      var data = await TC.api.get('/company/submissions' + q);
      _rows = (data && data.items) || [];
      renderTable(_rows);
      updateKPIs(_rows);
      document.getElementById('ctCount').textContent = _rows.length + ' Einträge';
    } catch (e) {
      if (isCompanyGateError(e)) { show('notCompany'); return; }
      document.getElementById('ctBody').innerHTML =
        '<tr><td colspan="6" class="ct-empty">Konnte nicht geladen werden: ' + esc(e.code || e.message || 'Fehler') + '</td></tr>';
    }
  }
  window.ctLoad = ctLoad;

  function renderTable(list) {
    var tb = document.getElementById('ctBody');
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="6" class="ct-empty">Keine empfangenen Stundenzettel. Sobald Ihre Zeitarbeitsfirma Zeiten zur Freigabe sendet, erscheinen sie hier.</td></tr>';
      return;
    }
    tb.innerHTML = list.map(function (r) {
      var canAct = r.status === 'sent_to_customer';
      return '<tr>' +
        '<td><div style="font-weight:600">' + esc(workerName(r)) + '</div>' +
          (r.personnel_number ? '<div class="ct-sub">' + esc(r.personnel_number) + '</div>' : '') + '</td>' +
        '<td>' + esc(r.supplier_name || '–') + '</td>' +
        '<td>' + fmtDate(r.week_start) + '<div class="ct-sub">bis ' + fmtDate(r.week_end) + '</div></td>' +
        '<td><strong>' + fmtH(r.total_hours) + ' h</strong>' +
          (parseFloat(r.overtime_hours || 0) > 0 ? '<div class="ct-sub">Ü ' + fmtH(r.overtime_hours) + ' h</div>' : '') + '</td>' +
        '<td>' + badge(r.status) + '</td>' +
        '<td style="text-align:right"><button class="ct-btn' + (canAct ? ' ct-btn--ok' : '') + '" onclick="ctOpen(\'' + esc(r.id) + '\')">' +
          (canAct ? 'Prüfen' : 'Detail') + '</button></td>' +
      '</tr>';
    }).join('');
  }

  function updateKPIs(list) {
    var review = list.filter(function (r) { return r.status === 'sent_to_customer'; }).length;
    var conf = list.filter(function (r) { return r.status === 'customer_confirmed'; }).length;
    var rej = list.filter(function (r) { return r.status === 'customer_rejected'; }).length;
    var hrs = list.filter(function (r) { return r.status === 'customer_confirmed' || r.status === 'posted_to_timesheet'; })
      .reduce(function (s, r) { return s + parseFloat(r.total_hours || 0); }, 0);
    document.getElementById('kpiReview').textContent = review;
    document.getElementById('kpiConfirmed').textContent = conf;
    document.getElementById('kpiRejected').textContent = rej;
    document.getElementById('kpiHours').textContent = fmtH(hrs) + ' h';
  }

  async function ctOpen(id) {
    try { _current = await TC.api.get('/company/submissions/' + id); }
    catch (e) { alert('Fehler beim Laden: ' + (e.code || e.message || '')); return; }
    renderDetail(_current);
    document.getElementById('ctModal').classList.add('active');
  }
  window.ctOpen = ctOpen;

  function renderDetail(ts) {
    document.getElementById('ctDetailTitle').textContent = workerName(ts);
    document.getElementById('ctDetailMeta').innerHTML =
      esc(ts.supplier_name || '–') + ' &nbsp;·&nbsp; ' + fmtDate(ts.week_start) + ' bis ' + fmtDate(ts.week_end) +
      ' &nbsp;·&nbsp; ' + badge(ts.status);

    var entries = ts.entries || [];
    var rows = entries.length
      ? entries.map(function (e) {
          return '<div class="ct-entry"><div>' + fmtDate(e.work_date) +
            (e.shift_start ? ' <span class="ct-sub">' + esc(e.shift_start) + '–' + esc(e.shift_end || '?') + '</span>' : '') +
            (e.notes ? '<div class="ct-sub">' + esc(e.notes) + '</div>' : '') + '</div>' +
            '<div style="text-align:right"><strong>' + fmtH(parseFloat(e.hours_regular || 0) + parseFloat(e.hours_overtime || 0)) + ' h</strong>' +
            (parseFloat(e.hours_overtime || 0) > 0 ? '<div class="ct-sub">inkl. Ü ' + fmtH(e.hours_overtime) + ' h</div>' : '') +
            (e.break_minutes > 0 ? '<div class="ct-sub">Pause ' + e.break_minutes + ' min</div>' : '') + '</div></div>';
        }).join('')
      : '<div class="ct-sub">Keine Tageseinträge erfasst.</div>';

    document.getElementById('ctDetailBody').innerHTML =
      rows +
      '<div style="display:flex;justify-content:space-between;margin-top:12px;padding-top:10px;border-top:2px solid var(--ds-border,#e2e8f0);font-weight:700">' +
        '<span>Gesamt</span><span>' + fmtH(ts.total_hours) + ' h' +
        (parseFloat(ts.overtime_hours || 0) > 0 ? ' (Ü ' + fmtH(ts.overtime_hours) + ' h)' : '') + '</span></div>' +
      (ts.worker_comment ? '<div class="ct-sub" style="margin-top:8px">Notiz: ' + esc(ts.worker_comment) + '</div>' : '') +
      (ts.customer_note ? '<div class="ct-sub" style="margin-top:4px">Ihre Rückmeldung: ' + esc(ts.customer_note) + '</div>' : '');

    var err = document.getElementById('ctDetailErr'); err.style.display = 'none';
    var acts = document.getElementById('ctDetailActions');
    var btns = ['<button class="ct-btn" onclick="ctClose()">Schließen</button>'];
    if (ts.status === 'sent_to_customer') {
      btns.push('<button class="ct-btn ct-btn--rej" onclick="ctReject()">Zurückweisen</button>');
      btns.push('<button class="ct-btn ct-btn--ok" onclick="ctConfirm()">Bestätigen</button>');
    }
    acts.innerHTML = btns.join('');
  }

  function ctClose() { document.getElementById('ctModal').classList.remove('active'); _current = null; }
  window.ctClose = ctClose;

  function detailErr(msg) {
    var el = document.getElementById('ctDetailErr');
    el.textContent = msg; el.style.display = '';
  }

  async function ctConfirm() {
    if (!_current) return;
    try {
      await TC.api.post('/company/submissions/' + _current.id + '/confirm', {});
      ctClose(); ctLoad();
    } catch (e) { detailErr('Bestätigung fehlgeschlagen: ' + (e.code || e.message || 'Fehler')); }
  }
  window.ctConfirm = ctConfirm;

  async function ctReject() {
    if (!_current) return;
    var reason = window.prompt('Grund der Zurückweisung (wird der Zeitarbeitsfirma angezeigt):', '');
    if (reason === null) return;
    reason = reason.trim();
    if (reason.length < 3) { detailErr('Bitte einen Grund angeben (mind. 3 Zeichen).'); return; }
    try {
      await TC.api.post('/company/submissions/' + _current.id + '/reject', { reason: reason });
      ctClose(); ctLoad();
    } catch (e) {
      detailErr(e.code === 'REASON_REQUIRED' ? 'Bitte einen Grund angeben (mind. 3 Zeichen).'
        : 'Zurückweisung fehlgeschlagen: ' + (e.code || e.message || 'Fehler'));
    }
  }
  window.ctReject = ctReject;

  /* ── Live-Belegschaft (P2.3/3.1) + Sperrliste (P3.3) ──────────────────── */
  var _liveLoaded = false;
  var _blocklistLoaded = false;
  var _complaintsLoaded = false;
  var _liveTimer = null;
  var _liveRows = [];
  var _blkWorkerId = null;

  var VIEWS = { timesheets: 'viewTimesheets', live: 'viewLive', complaints: 'viewComplaints', blocklist: 'viewBlocklist' };
  var TABS = { timesheets: 'tabTimesheets', live: 'tabLive', complaints: 'tabComplaints', blocklist: 'tabBlocklist' };
  function ctView(mode) {
    Object.keys(VIEWS).forEach(function (k) {
      document.getElementById(VIEWS[k]).style.display = (k === mode) ? '' : 'none';
      document.getElementById(TABS[k]).classList.toggle('ct-tab--active', k === mode);
    });
    if (mode === 'live' && !_liveLoaded) ctLoadLive();
    if (mode === 'blocklist' && !_blocklistLoaded) ctLoadBlocklist();
    if (mode === 'complaints' && !_complaintsLoaded) ctLoadComplaints();
  }
  window.ctView = ctView;

  function ctLiveDebounce() { clearTimeout(_liveTimer); _liveTimer = setTimeout(ctLoadLive, 350); }
  window.ctLiveDebounce = ctLiveDebounce;

  async function ctLoadLive() {
    var s = (document.getElementById('lwSearch').value || '').trim();
    var q = s ? ('?search=' + encodeURIComponent(s)) : '';
    try {
      var data = await TC.api.get('/company/live-workforce' + q);
      _liveLoaded = true;
      var workers = (data && data.workers) || [];
      renderLive(workers);
      updateLiveKPIs((data && data.kpis) || {});
      document.getElementById('lwCount').textContent = workers.length + ' im Einsatz';
    } catch (e) {
      if (isCompanyGateError(e)) { show('notCompany'); return; }
      document.getElementById('lwBody').innerHTML =
        '<tr><td colspan="7" class="ct-empty">Konnte nicht geladen werden: ' + esc(e.code || e.message || 'Fehler') + '</td></tr>';
    }
  }
  window.ctLoadLive = ctLoadLive;

  function liveBadge(status) {
    return status === 'endet_bald'
      ? '<span class="ct-badge ct-badge--soon">Endet bald</span>'
      : '<span class="ct-badge ct-badge--live">Im Einsatz</span>';
  }
  function renderLive(list) {
    _liveRows = list || [];
    var tb = document.getElementById('lwBody');
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="8" class="ct-empty">Aktuell arbeitet niemand bei Ihnen. Sobald Kräfte im Einsatz sind, erscheinen sie hier live.</td></tr>';
      return;
    }
    tb.innerHTML = list.map(function (r) {
      var shift = (r.shift_start && r.shift_end) ? (String(r.shift_start).slice(0, 5) + '–' + String(r.shift_end).slice(0, 5)) : '–';
      return '<tr>' +
        '<td><div style="font-weight:600">' + esc(workerName(r)) + '</div>' + (r.personnel_number ? '<div class="ct-sub">' + esc(r.personnel_number) + '</div>' : '') + '</td>' +
        '<td>' + esc(r.agency_name || '–') + '</td>' +
        '<td>' + esc(r.role || r.worker_description || '–') + '</td>' +
        '<td>' + shift + '</td>' +
        '<td>' + fmtDate(r.start_date) + '</td>' +
        '<td>' + (r.effective_end_date ? fmtDate(r.effective_end_date) : 'offen') + '</td>' +
        '<td>' + liveBadge(r.live_status) + '</td>' +
        '<td style="text-align:right;white-space:nowrap">' +
          '<button class="ct-btn" style="margin-right:4px" onclick="ctComplain(\'' + esc(r.worker_user_id) + '\')" title="Problem mit dieser Kraft an die Zeitarbeitsfirma melden">Melden</button>' +
          '<button class="ct-btn ct-btn--rej" onclick="ctBlock(\'' + esc(r.worker_user_id) + '\')" title="Diese Kraft für Ihr Unternehmen sperren">Sperren</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }
  function updateLiveKPIs(k) {
    document.getElementById('lwTotal').textContent = (k.total != null) ? k.total : ((k.im_einsatz || 0) + (k.endet_bald || 0));
    document.getElementById('lwEnds').textContent = k.endet_bald || 0;
    document.getElementById('lwAgencies').textContent = k.agencies || 0;
  }

  /* ── Sperren-Modal + Sperrliste (P3.3) ───────────────────────────────── */
  var _blkSupplierOrgId = null;

  function ctBlock(workerId) {
    var w = _liveRows.find(function (r) { return String(r.worker_user_id) === String(workerId); }) || {};
    _blkWorkerId = workerId;
    _blkSupplierOrgId = w.supplier_org_id || null;
    document.getElementById('blkWorkerName').textContent = workerName(w) + (w.agency_name ? ' · ' + w.agency_name : '');
    document.getElementById('blkDuration').value = 'permanent';
    document.getElementById('blkUntil').style.display = 'none';
    document.getElementById('blkUntil').value = '';
    document.getElementById('blkReason').value = '';
    document.getElementById('blkErr').style.display = 'none';
    document.getElementById('ctBlockModal').classList.add('active');
  }
  window.ctBlock = ctBlock;

  function ctBlkDurChange() {
    document.getElementById('blkUntil').style.display =
      document.getElementById('blkDuration').value === 'custom' ? '' : 'none';
  }
  window.ctBlkDurChange = ctBlkDurChange;

  function ctBlkClose() { document.getElementById('ctBlockModal').classList.remove('active'); _blkWorkerId = null; }
  window.ctBlkClose = ctBlkClose;

  function pad2(n) { return String(n).padStart(2, '0'); }
  function isoDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function blkErr(msg) { var el = document.getElementById('blkErr'); el.textContent = msg; el.style.display = ''; }

  async function ctBlkSubmit() {
    if (!_blkWorkerId) return;
    var dur = document.getElementById('blkDuration').value;
    var until = null;
    if (dur === '3m') { var d = new Date(); d.setMonth(d.getMonth() + 3); until = isoDate(d); }
    else if (dur === 'custom') {
      until = (document.getElementById('blkUntil').value || '').trim();
      if (!until) { blkErr('Bitte ein Datum wählen.'); return; }
    }
    var reason = (document.getElementById('blkReason').value || '').trim();
    try {
      await TC.api.post('/company/blocklist', {
        worker_user_id: _blkWorkerId,
        blocked_until: until,
        reason: reason || null,
        supplier_org_id: _blkSupplierOrgId || null
      });
      ctBlkClose();
      _blocklistLoaded = false;
      ctLoadBlocklist();
    } catch (e) { blkErr('Sperren fehlgeschlagen: ' + (e.code || e.message || 'Fehler')); }
  }
  window.ctBlkSubmit = ctBlkSubmit;

  async function ctLoadBlocklist() {
    try {
      var data = await TC.api.get('/company/blocklist');
      _blocklistLoaded = true;
      renderBlocklist((data && data.items) || []);
    } catch (e) {
      if (isCompanyGateError(e)) { show('notCompany'); return; }
      document.getElementById('blBody').innerHTML = '<tr><td colspan="5" class="ct-empty">Konnte nicht geladen werden: ' + esc(e.code || e.message || 'Fehler') + '</td></tr>';
    }
  }
  window.ctLoadBlocklist = ctLoadBlocklist;

  function renderBlocklist(list) {
    document.getElementById('blCount').textContent = list.length + ' gesperrt';
    var tb = document.getElementById('blBody');
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="5" class="ct-empty">Keine gesperrten Kräfte. In „Live-Belegschaft“ können Sie eine Kraft sperren.</td></tr>';
      return;
    }
    tb.innerHTML = list.map(function (b) {
      var until = b.blocked_until ? ('bis ' + fmtDate(b.blocked_until)) : 'dauerhaft';
      return '<tr>' +
        '<td><div style="font-weight:600">' + esc(workerName(b)) + '</div>' + (b.personnel_number ? '<div class="ct-sub">' + esc(b.personnel_number) + '</div>' : '') + '</td>' +
        '<td>' + esc(b.agency_name || '–') + '</td>' +
        '<td>' + esc(b.reason || '–') + '</td>' +
        '<td>' + esc(until) + '</td>' +
        '<td style="text-align:right"><button class="ct-btn ct-btn--ok" onclick="ctUnblock(\'' + esc(b.worker_user_id) + '\')">Freigeben</button></td>' +
      '</tr>';
    }).join('');
  }

  /* ── Meine Meldungen: Rückkanal zu den gemeldeten Problemen ─────────────── */
  // Status-Werte exakt wie der CHECK in Migration 150: open | acknowledged | resolved.
  var CMP_STATUS = {
    open:         { label: 'Offen',      cls: 'ct-badge--review' },
    acknowledged: { label: 'Angenommen', cls: 'ct-badge--done' },
    resolved:     { label: 'Erledigt',   cls: 'ct-badge--ok' }
  };
  var CMP_SEVERITY = {
    low:    { label: 'Niedrig', cls: 'ct-badge--done' },
    medium: { label: 'Mittel',  cls: 'ct-badge--review' },
    high:   { label: 'Hoch',    cls: 'ct-badge--rej' }
  };

  async function ctLoadComplaints() {
    var s = document.getElementById('cmpFilterStatus').value;
    try {
      var data = await TC.api.get('/company/complaints' + (s ? ('?status=' + encodeURIComponent(s)) : ''));
      _complaintsLoaded = true;
      renderComplaints((data && data.items) || []);
    } catch (e) {
      if (isCompanyGateError(e)) { show('notCompany'); return; }
      document.getElementById('cmpBody').innerHTML =
        '<tr><td colspan="6" class="ct-empty">Konnte nicht geladen werden: ' + esc(e.code || e.message || 'Fehler') + '</td></tr>';
    }
  }
  window.ctLoadComplaints = ctLoadComplaints;

  function renderComplaints(list) {
    var open = list.filter(function (c) { return c.status === 'open' || c.status === 'in_progress'; }).length;
    document.getElementById('cmpCount').textContent =
      list.length + (list.length === 1 ? ' Meldung' : ' Meldungen') + (open ? (' · ' + open + ' offen') : '');
    var tb = document.getElementById('cmpBody');
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="6" class="ct-empty">Noch keine Meldungen. In „Live-Belegschaft“ können Sie ein Problem melden.</td></tr>';
      return;
    }
    tb.innerHTML = list.map(function (c) {
      var st = CMP_STATUS[c.status] || { label: c.status || '–', cls: 'ct-badge--done' };
      var sv = CMP_SEVERITY[c.severity] || { label: c.severity || '–', cls: 'ct-badge--done' };
      return '<tr>' +
        '<td><div style="font-weight:600">' + esc(workerName(c)) + '</div>' +
          (c.personnel_number ? '<div class="ct-sub">' + esc(c.personnel_number) + '</div>' : '') + '</td>' +
        '<td>' + esc(c.agency_name || '–') + '</td>' +
        '<td><span class="ct-badge ' + sv.cls + '">' + esc(sv.label) + '</span></td>' +
        '<td>' + esc(c.reason || '–') + '</td>' +
        '<td><span class="ct-badge ' + st.cls + '">' + esc(st.label) + '</span></td>' +
        '<td>' + fmtDate(c.created_at) + '</td>' +
      '</tr>';
    }).join('');
  }

  async function ctUnblock(workerId) {
    try {
      await TC.api.delete('/company/blocklist/' + workerId);
      ctLoadBlocklist();
    } catch (e) { alert('Freigeben fehlgeschlagen: ' + (e.code || e.message || '')); }
  }
  window.ctUnblock = ctUnblock;

  /* ── Beschwerde-Meldung (P3.2) ───────────────────────────────────────── */
  var _cmpWorkerId = null;
  var _cmpLinkId = null;

  function ctComplain(workerId) {
    var w = _liveRows.find(function (r) { return String(r.worker_user_id) === String(workerId); }) || {};
    _cmpWorkerId = workerId;
    _cmpLinkId = w.link_id || null;
    document.getElementById('cmpWorkerName').textContent = workerName(w) + (w.agency_name ? ' · ' + w.agency_name : '');
    document.getElementById('cmpSeverity').value = 'medium';
    document.getElementById('cmpReason').value = '';
    document.getElementById('cmpErr').style.display = 'none';
    document.getElementById('ctComplaintModal').classList.add('active');
  }
  window.ctComplain = ctComplain;

  function ctCompClose() { document.getElementById('ctComplaintModal').classList.remove('active'); _cmpWorkerId = null; }
  window.ctCompClose = ctCompClose;

  async function ctCompSubmit() {
    if (!_cmpWorkerId) return;
    var reason = (document.getElementById('cmpReason').value || '').trim();
    var err = document.getElementById('cmpErr');
    if (reason.length < 3) { err.textContent = 'Bitte beschreiben Sie das Problem (mind. 3 Zeichen).'; err.style.display = ''; return; }
    var btn = document.getElementById('cmpSubmit');
    btn.disabled = true; btn.textContent = 'Wird gemeldet…';
    try {
      await TC.api.post('/company/complaints', {
        worker_user_id: _cmpWorkerId,
        assignment_link_id: _cmpLinkId || null,
        severity: document.getElementById('cmpSeverity').value,
        reason: reason
      });
      ctCompClose();
      // Ripple: die gerade abgesetzte Meldung muss sofort im Rückkanal sichtbar sein.
      _complaintsLoaded = false;
      ctLoadComplaints();
    } catch (e) {
      err.textContent = 'Melden fehlgeschlagen: ' + (e.code || e.message || 'Fehler'); err.style.display = '';
    } finally { btn.disabled = false; btn.textContent = 'Melden'; }
  }
  window.ctCompSubmit = ctCompSubmit;

  // Modal-Klick außerhalb schließt
  document.getElementById('ctModal').addEventListener('click', function (e) { if (e.target === this) ctClose(); });
  document.getElementById('ctBlockModal').addEventListener('click', function (e) { if (e.target === this) ctBlkClose(); });
  document.getElementById('ctComplaintModal').addEventListener('click', function (e) { if (e.target === this) ctCompClose(); });

  init();
})();
