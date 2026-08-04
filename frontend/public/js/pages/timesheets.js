/* ═══════════════════════════════════════════════════════
   Timesheets — Page Logic
   ═══════════════════════════════════════════════════════ */

/* ── Woerterbuch (P6.1, DE/EN) ─────────────────────────────────────────────
   timesheets.html laedt i18n.js im head; dieses Modul laeuft ausschliesslich
   auf dieser Seite, TCi18n ist hier also garantiert vorhanden.

   Bewusst NICHT uebersetzt:
   - Status-Rohwerte (draft, submitted, approved, ...) — Server-Enums, die die
     Filter-Optionen als value tragen und an die API gehen.
   - Namen, Orte, Organisationen, Notizen: reine API-Datenwerte.
   - Topbar/Navigation: kommt aus pageShell.js.
   Begriffswelt EN: Stundenzettel = timesheet, Einsatz = assignment.          */
TCi18n.register('de', {
  'ts.docTitle': 'Einsätze & Zeiten – TempConnect',
  'ts.paywall.home': 'Startseite',
  'ts.paywall.title': 'Anmeldung erforderlich',
  'ts.paywall.text': 'Bitte melde dich an, um Einsätze und Stundenzettel zu verwalten.',
  'ts.paywall.cta': 'Anmelden',

  'ts.lock.title': 'Einsätze & Zeiten',
  'ts.lock.text': 'Dieses Feature ist für PLUS und PRO verfügbar.',
  'ts.lock.text2': 'Erfasse, reiche ein und genehmige Stundenzettel für laufende Zeitarbeitseinsätze – direkt in der Plattform.',
  'ts.lock.plan': 'Dein aktueller Plan:',
  'ts.lock.upgrade': 'Jetzt upgraden →',

  'ts.page.title': 'Einsätze & Zeiten',
  'ts.page.subtitle': 'Stundenzettel für laufende Einsätze erfassen, einreichen, freigeben und für Folgeprozesse vorbereiten.',

  'ts.banner.eyebrow': 'Pilot-Standard',
  'ts.banner.title': 'Stundenzettel → Kundenfreigabe → Abrechnungsvorbereitung ist der operative Mindeststandard',
  'ts.banner.text': 'Statuses, Korrekturschleifen und Freigaben müssen für Pilotkunden sichtbar und nachvollziehbar bleiben. Genau hier wird aus einem Deal eine belastbare operative Abwicklung.',
  'ts.banner.asideTitle': 'Fokus jetzt',
  'ts.banner.asideText': 'Keine verdeckten Korrekturschleifen, klare Editierbarkeit und saubere Übergabe in Kunden- oder Abrechnungsprozesse.',

  'ts.inbox.question': 'Sie sind das einsetzende Unternehmen?',
  'ts.inbox.text': 'Von Ihren Zeitarbeitsfirmen gesendete Stundenzettel Ihrer eingesetzten Kräfte prüfen und bestätigen Sie im Stundenzettel-Eingang – automatisch für Ihre Organisation, ohne manuelle IDs.',
  'ts.inbox.cta': 'Zum Stundenzettel-Eingang →',

  'ts.kpi.total': 'Stundenzettel gesamt',
  'ts.kpi.pending': 'Zur Freigabe',
  'ts.kpi.approved': 'Freigegeben',
  'ts.kpi.hours': 'Freigegebene Stunden',

  'ts.filter.status': 'Status',
  'ts.filter.all': 'Alle',
  'ts.filter.from': 'Von',
  'ts.filter.to': 'Bis',
  'ts.filter.worker': 'Einsatzkraft',
  'ts.filter.workerPh': 'Einsatzkraft suchen…',

  'ts.status.draft': 'Entwurf',
  'ts.status.submitted': 'Eingereicht',
  'ts.status.approved': 'Genehmigt',
  'ts.status.rejected': 'Abgelehnt',
  'ts.status.cancelled': 'Storniert',

  'ts.table.worker': 'Einsatzkraft',
  'ts.table.period': 'Zeitraum',
  'ts.table.hours': 'Stunden',
  'ts.table.status': 'Status',
  'ts.table.submitted': 'Eingereicht',
  'ts.table.actions': 'Aktionen',
  'ts.table.loading': 'Lade Stundenzettel…',

  'ts.action.create': '+ Neuer Stundenzettel',
  'ts.action.loadMore': 'Weitere laden',
  'ts.action.detail': 'Detail',
  'ts.action.cancel': 'Abbrechen',
  'ts.action.confirmCreate': 'Anlegen',
  'ts.action.save': 'Speichern',
  'ts.action.delete': 'Löschen',
  'ts.action.submit': 'Einreichen',
  'ts.action.approve': 'Freigeben',
  'ts.action.reject': 'Ablehnen',
  'ts.action.returnDraft': 'Zurück zu Entwurf',
  'ts.action.cancelTs': 'Stornieren',

  'ts.create.title': 'Neuer Stundenzettel',
  'ts.create.worker': 'Einsatzkraft *',
  'ts.create.workerPh': 'Max Mustermann',
  'ts.create.ident': 'Einsatzkraft-ID / Personalnummer (optional)',
  'ts.create.identPh': 'z.B. MA-12345',
  'ts.create.weekStart': 'Wochenbeginn *',
  'ts.create.weekEnd': 'Wochenende *',
  'ts.create.orgId': 'Org-ID (Einsatzunternehmen) *',
  'ts.create.orgIdPh': 'UUID des Kundenunternehmens',
  'ts.create.supplierId': 'Lieferanten-Org-ID *',
  'ts.create.supplierIdPh': 'UUID der Zeitarbeitsfirma',
  'ts.create.assignmentId': 'Einsatz-ID (optional)',
  'ts.create.assignmentIdPh': 'UUID des Einsatzes',
  'ts.create.notes': 'Notizen',
  'ts.create.notesPh': 'Optionale Notizen…',

  'ts.detail.close': 'Schließen',
  'ts.detail.entries': 'Tageseinträge',
  'ts.detail.addDay': '+ Tag hinzufügen',
  'ts.detail.to': 'bis',
  'ts.detail.reason': 'Grund:',
  'ts.detail.noEntries': 'Noch keine Tageseinträge.',

  'ts.entry.title': 'Tag erfassen',
  'ts.entry.date': 'Datum *',
  'ts.entry.regular': 'Reguläre Std.',
  'ts.entry.overtime': 'Überstunden',
  'ts.entry.break': 'Pause (Min)',
  'ts.entry.shiftStart': 'Schichtbeginn',
  'ts.entry.shiftEnd': 'Schichtende',
  'ts.entry.note': 'Notiz',
  'ts.entry.notePh': 'Optional…',
  'ts.entry.regularShort': 'Regulär:',
  'ts.entry.overtimeShort': 'Überstunden:',
  'ts.entry.breakShort': 'Pause:',
  'ts.entry.minutes': 'min',

  'ts.totals.total': 'Gesamtstunden',
  'ts.totals.overtime': 'Überstunden',
  'ts.badge.overtimeShort': 'Ü',

  'ts.reject.label': 'Ablehnungsgrund',
  'ts.reject.ph': 'Bitte Grund angeben…',

  'ts.empty.none': 'Keine Stundenzettel gefunden.',
  'ts.empty.location': 'Keine Stundenzettel für Standort {loc}.',

  'ts.source.manual': 'Ohne Worker-Nachweis',
  'ts.source.manualTitle': 'Direkt erfasst — es liegt keine Stundenmeldung der Einsatzkraft vor.',

  'ts.msg.connError': 'Verbindungsfehler.',
  'ts.msg.loadError': 'Fehler beim Laden.',
  'ts.msg.deleteError': 'Fehler beim Löschen.',
  'ts.msg.createError': 'Fehler beim Anlegen.',
  'ts.msg.error': 'Fehler',
  'ts.msg.dateRequired': 'Datum ist erforderlich.',
  'ts.msg.requiredFields': 'Bitte alle Pflichtfelder ausfüllen.',
  'ts.confirm.cancelTs': 'Stundenzettel stornieren?',
  'ts.confirm.deleteEntry': 'Eintrag löschen?'
});
TCi18n.register('en', {
  'ts.docTitle': 'Assignments & time – TempConnect',
  'ts.paywall.home': 'Home',
  'ts.paywall.title': 'Sign-in required',
  'ts.paywall.text': 'Please sign in to manage assignments and timesheets.',
  'ts.paywall.cta': 'Sign in',

  'ts.lock.title': 'Assignments & time',
  'ts.lock.text': 'This feature is available on PLUS and PRO.',
  'ts.lock.text2': 'Record, submit and approve timesheets for running temporary assignments – directly in the platform.',
  'ts.lock.plan': 'Your current plan:',
  'ts.lock.upgrade': 'Upgrade now →',

  'ts.page.title': 'Assignments & time',
  'ts.page.subtitle': 'Record, submit and approve timesheets for running assignments and prepare them for downstream processes.',

  'ts.banner.eyebrow': 'Pilot standard',
  'ts.banner.title': 'Timesheet → client approval → billing preparation is the operational baseline',
  'ts.banner.text': 'Statuses, correction loops and approvals must stay visible and traceable for pilot clients. This is where a deal turns into dependable day-to-day delivery.',
  'ts.banner.asideTitle': 'Focus now',
  'ts.banner.asideText': 'No hidden correction loops, clear editability and a clean handover into client or billing processes.',

  'ts.inbox.question': 'Are you the hiring company?',
  'ts.inbox.text': 'Timesheets sent by your staffing agencies for the workers on your site are reviewed and confirmed in the timesheet inbox – scoped to your organisation automatically, with no manual IDs.',
  'ts.inbox.cta': 'Go to the timesheet inbox →',

  'ts.kpi.total': 'Timesheets total',
  'ts.kpi.pending': 'Awaiting approval',
  'ts.kpi.approved': 'Approved',
  'ts.kpi.hours': 'Approved hours',

  'ts.filter.status': 'Status',
  'ts.filter.all': 'All',
  'ts.filter.from': 'From',
  'ts.filter.to': 'To',
  'ts.filter.worker': 'Worker',
  'ts.filter.workerPh': 'Search worker…',

  'ts.status.draft': 'Draft',
  'ts.status.submitted': 'Submitted',
  'ts.status.approved': 'Approved',
  'ts.status.rejected': 'Rejected',
  'ts.status.cancelled': 'Cancelled',

  'ts.table.worker': 'Worker',
  'ts.table.period': 'Period',
  'ts.table.hours': 'Hours',
  'ts.table.status': 'Status',
  'ts.table.submitted': 'Submitted',
  'ts.table.actions': 'Actions',
  'ts.table.loading': 'Loading timesheets…',

  'ts.action.create': '+ New timesheet',
  'ts.action.loadMore': 'Load more',
  'ts.action.detail': 'Details',
  'ts.action.cancel': 'Cancel',
  'ts.action.confirmCreate': 'Create',
  'ts.action.save': 'Save',
  'ts.action.delete': 'Delete',
  'ts.action.submit': 'Submit',
  'ts.action.approve': 'Approve',
  'ts.action.reject': 'Reject',
  'ts.action.returnDraft': 'Back to draft',
  'ts.action.cancelTs': 'Void',

  'ts.create.title': 'New timesheet',
  'ts.create.worker': 'Worker *',
  'ts.create.workerPh': 'Jane Doe',
  'ts.create.ident': 'Worker ID / personnel number (optional)',
  'ts.create.identPh': 'e.g. MA-12345',
  'ts.create.weekStart': 'Week start *',
  'ts.create.weekEnd': 'Week end *',
  'ts.create.orgId': 'Org ID (hiring company) *',
  'ts.create.orgIdPh': 'UUID of the client company',
  'ts.create.supplierId': 'Supplier org ID *',
  'ts.create.supplierIdPh': 'UUID of the staffing agency',
  'ts.create.assignmentId': 'Assignment ID (optional)',
  'ts.create.assignmentIdPh': 'UUID of the assignment',
  'ts.create.notes': 'Notes',
  'ts.create.notesPh': 'Optional notes…',

  'ts.detail.close': 'Close',
  'ts.detail.entries': 'Daily entries',
  'ts.detail.addDay': '+ Add day',
  'ts.detail.to': 'to',
  'ts.detail.reason': 'Reason:',
  'ts.detail.noEntries': 'No daily entries yet.',

  'ts.entry.title': 'Record a day',
  'ts.entry.date': 'Date *',
  'ts.entry.regular': 'Regular hrs',
  'ts.entry.overtime': 'Overtime',
  'ts.entry.break': 'Break (min)',
  'ts.entry.shiftStart': 'Shift start',
  'ts.entry.shiftEnd': 'Shift end',
  'ts.entry.note': 'Note',
  'ts.entry.notePh': 'Optional…',
  'ts.entry.regularShort': 'Regular:',
  'ts.entry.overtimeShort': 'Overtime:',
  'ts.entry.breakShort': 'Break:',
  'ts.entry.minutes': 'min',

  'ts.totals.total': 'Total hours',
  'ts.totals.overtime': 'Overtime',
  'ts.badge.overtimeShort': 'OT',

  'ts.reject.label': 'Rejection reason',
  'ts.reject.ph': 'Please state a reason…',

  'ts.empty.none': 'No timesheets found.',
  'ts.empty.location': 'No timesheets for location {loc}.',

  'ts.source.manual': 'No worker record',
  'ts.source.manualTitle': 'Entered directly — there is no hours submission from the worker.',

  'ts.msg.connError': 'Connection error.',
  'ts.msg.loadError': 'Could not load the data.',
  'ts.msg.deleteError': 'Could not delete.',
  'ts.msg.createError': 'Could not create the timesheet.',
  'ts.msg.error': 'Error',
  'ts.msg.dateRequired': 'A date is required.',
  'ts.msg.requiredFields': 'Please fill in all mandatory fields.',
  'ts.confirm.cancelTs': 'Void this timesheet?',
  'ts.confirm.deleteEntry': 'Delete this entry?'
});

(function() {
  'use strict';

  /** Kurzform fuer die Uebersetzung an der Verwendungsstelle. */
  function t(key, params) { return TCi18n.t(key, params); }

  /* ── State ─────────────────────────────────────────── */
  var _me = null;
  var _timesheets = [];
  var _listLoaded = false;
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
      _listLoaded = true;
      renderTable(_timesheets);
      updateKPIs(_timesheets);
    } catch(e) { renderEmpty(t('ts.msg.connError')); }
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
      var emptyMsg = locLbl ? t('ts.empty.location', { loc: esc(locLbl) }) : t('ts.empty.none');
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">&#128336;</div><p>' + emptyMsg + '</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = list.map(function(ts) {
      return '<tr>' +
        '<td><div class="ts-worker">' + esc(ts.worker_name) + '</div>' +
             (ts.worker_identifier ? '<div class="ts-period">' + esc(ts.worker_identifier) + '</div>' : '') +
             '<div class="ts-period">' + esc(ts.supplier_org_name || ts.supplier_org_id) + '</div>' +
             sourceBadge(ts.source) + '</td>' +
        '<td><div>' + fmtDate(ts.week_start) + '</div><div class="ts-period">' + fmtDate(ts.week_end) + '</div></td>' +
        '<td><div class="ts-hours">' + fmtH(ts.total_hours) + ' h</div>' +
             (ts.overtime_hours > 0 ? '<div class="ts-hours-ot">' + esc(t('ts.badge.overtimeShort')) + ' ' + fmtH(ts.overtime_hours) + ' h</div>' : '') + '</td>' +
        '<td>' + badge(ts.status) + '</td>' +
        '<td style="font-size:12px;color:var(--ds-text-secondary)">' + (ts.submitted_at ? fmtDateTime(ts.submitted_at) : '–') + '</td>' +
        '<td><div class="ts-actions">' +
          '<button class="btn" style="font-size:11px;padding:4px 10px" onclick="openDetail(\'' + ts.id + '\')">' + esc(t('ts.action.detail')) + '</button>' +
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
    catch(e) { alert(t('ts.msg.loadError')); return; }
    renderDetail(_currentTs);
    document.getElementById('detailModal').classList.add('active');
  }
  window.openDetail = openDetail;

  function renderDetail(ts) {
    document.getElementById('detailTitle').textContent = '🕐 ' + ts.worker_name;
    document.getElementById('detailMeta').innerHTML =
      '<strong>' + esc(ts.org_name || ts.org_id) + '</strong> ← ' +
      esc(ts.supplier_org_name || ts.supplier_org_id) + ' &nbsp;|&nbsp; ' +
      fmtDate(ts.week_start) + ' ' + esc(t('ts.detail.to')) + ' ' + fmtDate(ts.week_end);

    document.getElementById('detailStatus').innerHTML = badge(ts.status) +
      (ts.rejection_reason ? ' <span style="font-size:12px;color:#ef4444;margin-left:8px">' + esc(t('ts.detail.reason')) + ' ' + esc(ts.rejection_reason) + '</span>' : '');

    var grid = document.getElementById('entryGrid');
    var entries = ts.entries || [];
    if (!entries.length) {
      grid.innerHTML = '<p style="font-size:13px;color:var(--ds-text-secondary)">' + esc(t('ts.detail.noEntries')) + '</p>';
    } else {
      grid.innerHTML = entries.map(function(e) {
        return '<div class="entry-card">' +
          '<div class="entry-card__date">' + fmtDate(e.work_date) + '</div>' +
          '<div class="entry-card__hours">' + fmtH(parseFloat(e.hours_regular)+parseFloat(e.hours_overtime)) + ' h</div>' +
          '<div class="entry-card__detail">' + esc(t('ts.entry.regularShort')) + ' ' + fmtH(e.hours_regular) + ' h' +
            (parseFloat(e.hours_overtime) > 0 ? ' | ' + esc(t('ts.entry.overtimeShort')) + ' ' + fmtH(e.hours_overtime) + ' h' : '') +
            (e.break_minutes > 0 ? ' | ' + esc(t('ts.entry.breakShort')) + ' ' + e.break_minutes + ' ' + esc(t('ts.entry.minutes')) : '') +
          '</div>' +
          (e.shift_start ? '<div class="entry-card__detail">🕐 ' + e.shift_start + ' – ' + (e.shift_end || '?') + '</div>' : '') +
          (e.notes ? '<div class="entry-card__detail" style="margin-top:4px;font-style:italic">' + esc(e.notes) + '</div>' : '') +
          (ts.status === 'draft' ? '<button class="btn" style="margin-top:8px;font-size:11px;padding:3px 8px;color:#ef4444;border-color:rgba(248,113,113,.3)" onclick="deleteEntry(\'' + e.id + '\')">' + esc(t('ts.action.delete')) + '</button>' : '') +
        '</div>';
      }).join('');
    }

    document.getElementById('addEntryBtn').style.display = ts.status === 'draft' ? '' : 'none';
    document.getElementById('entryForm').style.display = 'none';

    document.getElementById('detailTotals').innerHTML =
      '<div class="ts-kpi"><div class="ts-kpi__val">' + fmtH(ts.total_hours) + ' h</div><div class="ts-kpi__label">' + esc(t('ts.totals.total')) + '</div></div>' +
      '<div class="ts-kpi"><div class="ts-kpi__val" style="color:#f59e0b">' + fmtH(ts.overtime_hours) + ' h</div><div class="ts-kpi__label">' + esc(t('ts.totals.overtime')) + '</div></div>';

    var acts = document.getElementById('detailActions');
    var btns = [];
    if (ts.status === 'draft' || ts.status === 'rejected') {
      btns.push('<button class="btn primary" onclick="submitTs()">' + esc(t('ts.action.submit')) + '</button>');
    }
    if (ts.status === 'submitted') {
      btns.push('<button class="btn" style="background:rgba(52,211,153,.15);color:#10b981;border-color:rgba(52,211,153,.3)" onclick="approveTs()">' + esc(t('ts.action.approve')) + '</button>');
      btns.push('<button class="btn" style="background:rgba(248,113,113,.1);color:#ef4444;border-color:rgba(248,113,113,.3)" onclick="showRejectForm()">' + esc(t('ts.action.reject')) + '</button>');
      btns.push('<button class="btn" onclick="returnToDraft()">' + esc(t('ts.action.returnDraft')) + '</button>');
    }
    if (ts.status === 'draft' || ts.status === 'submitted') {
      btns.push('<button class="btn" style="color:var(--ds-text-secondary)" onclick="cancelTs()">' + esc(t('ts.action.cancelTs')) + '</button>');
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
      alert((e.code || t('ts.msg.error')) + (e.message ? ': ' + e.message : ''));
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
    if (!confirm(t('ts.confirm.cancelTs'))) return;
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
    } catch(e) { alert(e.code || t('ts.msg.error')); }
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
      document.getElementById('entryError').textContent = t('ts.msg.dateRequired');
      document.getElementById('entryError').style.display = '';
      return;
    }
    try {
      await TC.api.post('/timesheets/' + _currentTs.id + '/entries', payload);
      document.getElementById('entryForm').style.display = 'none';
      await openDetail(_currentTs.id);
    } catch(e) {
      document.getElementById('entryError').textContent = e.code || t('ts.msg.error');
      document.getElementById('entryError').style.display = '';
    }
  }
  window.saveEntry = saveEntry;

  async function deleteEntry(entryId) {
    if (!confirm(t('ts.confirm.deleteEntry'))) return;
    try {
      await TC.api.delete('/timesheets/' + _currentTs.id + '/entries/' + entryId);
      await openDetail(_currentTs.id);
    } catch(e) { alert(t('ts.msg.deleteError')); }
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
      document.getElementById('createError').textContent = t('ts.msg.requiredFields');
      document.getElementById('createError').style.display = '';
      return;
    }
    try {
      var ts = await TC.api.post('/timesheets', payload);
      closeCreateModal();
      loadTimesheets();
      openDetail(ts.id);
    } catch(e) {
      document.getElementById('createError').textContent = e.code || t('ts.msg.createError');
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
    var loc = TCi18n.dateLocale();
    return dt.toLocaleDateString(loc) + ' ' + dt.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  }
  function fmtH(v) { return parseFloat(v || 0).toFixed(2).replace('.00','').replace(/\.(\d)$/,'.$10'); }
  function fmtISO(d) { return d.toISOString().split('T')[0]; }
  function badge(status) {
    var label = {
      draft: t('ts.status.draft'),
      submitted: t('ts.status.submitted'),
      approved: t('ts.status.approved'),
      rejected: t('ts.status.rejected'),
      cancelled: t('ts.status.cancelled')
    };
    return '<span class="ts-badge ts-badge--' + status + '">' + esc(label[status] || status) + '</span>';
  }

  /* Herkunft des Zettels (Mig 156).
     Nur die direkte Erfassung wird beschriftet — sie hat keine Meldung der Kraft gegen sich
     stehen, und genau das muss man in der Abrechnung und im Streitfall sehen. Zettel aus dem
     Worker-Portal sind der Normalfall und bleiben unbeschriftet; markierte man beide, ginge
     der Unterschied im Rauschen unter. Unbekannte Werte erzeugen nichts, damit eine spaetere
     dritte Herkunft nicht faelschlich als "manuell" erscheint. */
  function sourceBadge(source) {
    if (source !== 'manual') return '';
    return '<span class="ts-badge ts-badge--manual" ' +
           'title="' + esc(t('ts.source.manualTitle')) + '">' +
           esc(t('ts.source.manual')) + '</span>';
  }

  // Modal close on overlay click
  document.getElementById('createModal').addEventListener('click', function(e) { if (e.target === this) closeCreateModal(); });
  document.getElementById('detailModal').addEventListener('click', function(e) { if (e.target === this) closeDetailModal(); });

  /* Sprachwechsel: JS-gebaute Flaechen tragen keine data-i18n-Marker, also
     muessen Tabelle und Detail-Modal nach dem Wechsel neu gezeichnet werden —
     sonst blieben Status-Badges und Aktionsknoepfe in der alten Sprache. */
  document.addEventListener('tc:langchange', function () {
    if (_listLoaded) renderTable(_timesheets);
    if (_currentTs) renderDetail(_currentTs);
  });

  init();
})();
