/* ═══════════════════════════════════════════════════════
   Company Timesheets — Käufer-Sicht (P2.2)
   Auto-gescoped auf die eigene Unternehmens-Org (kein manuelles Org-ID-Eintippen).

   WELLE J1: Live-Belegschaft, Meldungen und Sperrliste sind auf ihre eigene
   Flaeche umgezogen (company-live-workforce.html + companyLiveWorkforce.js).
   Diese Seite behaelt den Stundenzettel-Eingang; alte Deep-Links
   ('?einsatz=<id>#live' aus G4b-Benachrichtigungen im Bestand) werden beim
   Laden dorthin weitergeleitet, die Einsatz-Kennung bleibt erhalten.
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Woerterbuch (P6.1, DE/EN) ───────────────────────────────────────────
     Ort: Anfang der ausgelagerten Seiten-JS. company-timesheets.html laedt
     i18n.js im head und dieses Modul ausschliesslich dort — TCi18n ist also
     garantiert vorhanden, bevor eine Zeile hier laeuft.

     Drei-Seiten-Regel: Diese Flaeche erreicht NUR die Unternehmensseite.
     api/routes/companyTimesheets.js legt requireCompanyOrg vor JEDE Route
     (COMPANY_TIMESHEETS_NOT_AVAILABLE_FOR_ORG_TYPE); eine Zeitarbeitsfirma
     sieht statt der Seite den notCompany-Zustand. Die feste Kaeufer-Sprache
     ("Ihre Zeitarbeitsfirma sendet Ihnen …") ist hier deshalb korrekt und
     darf NICHT ueber terminologyLabels rollenverzweigt werden — es gibt
     keine zweite Rolle, die diese Texte je zu sehen bekommt.

     Bewusst NICHT uebersetzt:
     - Status-Rohwerte in den option[value] des Filters (gehen an den Server)
     - API-Daten: Namen, Personalnummern, Firmennamen, Rollen, Gruende
     - Topbar/Navigation/Nutzerbereich (pageShell.js)                        */
  TCi18n.register('de', {
    'cts.docTitle': 'Stundenzettel-Eingang – TempConnect',

    'cts.paywall.title': 'Anmeldung erforderlich',
    'cts.paywall.text': 'Bitte melden Sie sich an, um empfangene Stundenzettel zu prüfen.',
    'cts.paywall.cta': 'Anmelden',
    'cts.gate.title': 'Nur für Unternehmen',
    'cts.gate.text': 'Der Stundenzettel-Eingang steht Unternehmens-/Käufer-Organisationen zur Verfügung. Ihre aktive Organisation ist keine Unternehmens-Organisation.',

    'cts.page.title': 'Stundenzettel-Eingang',
    'cts.page.subtitle': 'Von Ihren Zeitarbeitsfirmen gesendete Stundenzettel Ihrer eingesetzten Kräfte prüfen, bestätigen oder zur Korrektur zurückweisen.',
    'cts.banner.1': 'Ihre Zeitarbeitsfirma sendet Ihnen hier die Stundenzettel der bei Ihnen eingesetzten Kräfte zur Freigabe.',
    'cts.banner.confirm': 'Bestätigen',
    'cts.banner.2': 'Sie geprüfte Zeiten oder weisen Sie sie mit einer',
    'cts.banner.reason': 'Begründung',
    'cts.banner.3': 'zurück – transparent und nachvollziehbar, direkt in der Plattform.',

    /* Die drei letzten Reiter sind seit Welle J1 Wegweiser auf die eigene
       Flaeche der Live-Belegschaft — die Beschriftungen bleiben hier, weil
       die Links auf DIESER Seite stehen. */
    'cts.tab.timesheets': 'Stundenzettel-Eingang',
    'cts.tab.live': 'Live-Belegschaft',
    'cts.tab.complaints': 'Meine Meldungen',
    'cts.tab.blocklist': 'Sperrliste',

    'cts.kpi.review': 'Zu prüfen',
    'cts.kpi.confirmed': 'Bestätigt',
    'cts.kpi.rejected': 'Zurückgewiesen',
    'cts.kpi.hours': 'Bestätigte Stunden',

    'cts.filter.all': 'Alle empfangenen',
    'cts.filter.review': 'Nur zu prüfen',
    'cts.filter.confirmed': 'Bestätigt',
    'cts.filter.rejected': 'Zurückgewiesen',
    'cts.filter.posted': 'Abgerechnet',

    'cts.th.worker': 'Mitarbeiter',
    'cts.th.agency': 'Zeitarbeitsfirma',
    'cts.th.week': 'Woche',
    'cts.th.hours': 'Stunden',
    'cts.th.status': 'Status',

    'cts.status.sent_to_customer': 'Zu prüfen',
    'cts.status.customer_confirmed': 'Bestätigt',
    'cts.status.customer_rejected': 'Zurückgewiesen',
    'cts.status.posted_to_timesheet': 'Abgerechnet',

    'cts.action.refresh': 'Aktualisieren',
    'cts.action.review': 'Prüfen',
    'cts.action.detail': 'Detail',
    'cts.action.close': 'Schließen',
    'cts.action.confirm': 'Bestätigen',
    'cts.action.reject': 'Zurückweisen',

    'cts.state.loading': 'Wird geladen…',
    'cts.count.entries': '{count} Einträge',

    'cts.empty.timesheets': 'Keine empfangenen Stundenzettel. Sobald Ihre Zeitarbeitsfirma Zeiten zur Freigabe sendet, erscheinen sie hier.',

    'cts.week.until': 'bis',
    'cts.abbr.overtime': 'Ü',
    'cts.detail.noEntries': 'Keine Tageseinträge erfasst.',
    'cts.detail.inclOvertime': 'inkl. Ü {hours} h',
    'cts.detail.break': 'Pause {minutes} min',
    'cts.detail.total': 'Gesamt',
    'cts.detail.note': 'Notiz: {text}',
    'cts.detail.feedback': 'Ihre Rückmeldung: {text}',

    'cts.reject.prompt': 'Grund der Zurückweisung (wird der Zeitarbeitsfirma angezeigt):',
    'cts.reject.reasonRequired': 'Bitte einen Grund angeben (mind. 3 Zeichen).',

    'cts.err.generic': 'Fehler',
    'cts.err.load': 'Konnte nicht geladen werden: {detail}',
    'cts.err.detail': 'Fehler beim Laden: {detail}',
    'cts.err.confirm': 'Bestätigung fehlgeschlagen: {detail}',
    'cts.err.reject': 'Zurückweisung fehlgeschlagen: {detail}',
    'cts.fallback.worker': 'Mitarbeiter'
  });
  TCi18n.register('en', {
    'cts.docTitle': 'Incoming timesheets – TempConnect',

    'cts.paywall.title': 'Sign-in required',
    'cts.paywall.text': 'Please sign in to review the timesheets you have received.',
    'cts.paywall.cta': 'Sign in',
    'cts.gate.title': 'For companies only',
    'cts.gate.text': 'Incoming timesheets are available to company and buyer organisations. Your active organisation is not a company organisation.',

    'cts.page.title': 'Incoming timesheets',
    'cts.page.subtitle': 'Review, confirm or send back for correction the timesheets your staffing firms submit for the staff assigned to you.',
    'cts.banner.1': 'Your staffing firm submits the timesheets of the staff assigned to you here for approval.',
    'cts.banner.confirm': 'Confirm',
    'cts.banner.2': 'the hours you have checked, or reject them with a',
    'cts.banner.reason': 'reason',
    'cts.banner.3': '— transparent and traceable, right inside the platform.',

    'cts.tab.timesheets': 'Incoming timesheets',
    'cts.tab.live': 'Live workforce',
    'cts.tab.complaints': 'My reports',
    'cts.tab.blocklist': 'Block list',

    'cts.kpi.review': 'To review',
    'cts.kpi.confirmed': 'Confirmed',
    'cts.kpi.rejected': 'Rejected',
    'cts.kpi.hours': 'Confirmed hours',

    'cts.filter.all': 'All received',
    'cts.filter.review': 'To review only',
    'cts.filter.confirmed': 'Confirmed',
    'cts.filter.rejected': 'Rejected',
    'cts.filter.posted': 'Invoiced',

    'cts.th.worker': 'Staff member',
    'cts.th.agency': 'Staffing firm',
    'cts.th.week': 'Week',
    'cts.th.hours': 'Hours',
    'cts.th.status': 'Status',

    'cts.status.sent_to_customer': 'To review',
    'cts.status.customer_confirmed': 'Confirmed',
    'cts.status.customer_rejected': 'Rejected',
    'cts.status.posted_to_timesheet': 'Invoiced',

    'cts.action.refresh': 'Refresh',
    'cts.action.review': 'Review',
    'cts.action.detail': 'Details',
    'cts.action.close': 'Close',
    'cts.action.confirm': 'Confirm',
    'cts.action.reject': 'Reject',

    'cts.state.loading': 'Loading…',
    'cts.count.entries': '{count} entries',

    'cts.empty.timesheets': 'No timesheets received. As soon as your staffing firm submits hours for approval, they appear here.',

    'cts.week.until': 'until',
    'cts.abbr.overtime': 'OT',
    'cts.detail.noEntries': 'No daily entries recorded.',
    'cts.detail.inclOvertime': 'incl. OT {hours} h',
    'cts.detail.break': 'Break {minutes} min',
    'cts.detail.total': 'Total',
    'cts.detail.note': 'Note: {text}',
    'cts.detail.feedback': 'Your feedback: {text}',

    'cts.reject.prompt': 'Reason for the rejection (shown to the staffing firm):',
    'cts.reject.reasonRequired': 'Please provide a reason (at least 3 characters).',

    'cts.err.generic': 'Error',
    'cts.err.load': 'Could not be loaded: {detail}',
    'cts.err.detail': 'Error while loading: {detail}',
    'cts.err.confirm': 'Confirmation failed: {detail}',
    'cts.err.reject': 'Rejection failed: {detail}',
    'cts.fallback.worker': 'Staff member'
  });

  /** Uebersetzung an der Verwendungsstelle. */
  function t(key, params) { return TCi18n.t(key, params); }
  /** Fehlerdetail aus einem API-Fehler — Code/Message bleiben roh (Diagnose). */
  function errDetail(e) { return (e && (e.code || e.message)) || t('cts.err.generic'); }

  var _rows = [];
  var _current = null;
  var _tsLoaded = false;

  // Escaped auch Apostrophe: Werte landen u.a. in onclick="fn('…')" — ohne &#39; könnte
  // ein Wert aus dem JS-String-Literal ausbrechen (heute nur DB-UUIDs, morgen evtl. Namen).
  function esc(v) {
    if (v == null) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // Datum bleibt bewusst selbst formatiert (feste zweistellige Teile). toLocaleDateString
  // wuerde im Deutschen "2.6.2026" statt "02.06.2026" liefern — die Tabellenspalten
  // sollen aber gleich breit bleiben. Englisch bekommt die en-GB-Reihenfolge dd/mm/yyyy.
  function fmtDate(d) {
    if (!d) return '–';
    var p = String(d).split('T')[0].split('-');
    if (p.length !== 3) return '–';
    return TCi18n.locale() === 'en' ? (p[2] + '/' + p[1] + '/' + p[0]) : (p[2] + '.' + p[1] + '.' + p[0]);
  }
  function fmtH(v) { return parseFloat(v || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)$/, '$10'); }
  function workerName(r) {
    return ((r.first_name || '') + ' ' + (r.last_name || '')).trim() || r.worker_email || t('cts.fallback.worker');
  }
  function isCompanyGateError(e) {
    var c = ((e && (e.code || e.error)) || '') + '';
    return /COMPANY_TIMESHEETS|BUYER_ORG|ORG_TYPE|NO_ORG_MEMBERSHIP|ORG_CONTEXT_REQUIRED/.test(c);
  }

  // Rohwert -> Badge-Klasse. Das Label kommt zur Laufzeit aus dem Woerterbuch
  // (cts.status.<rohwert>), damit ein Sprachwechsel es mitnimmt.
  var STATUS_CLASS = {
    sent_to_customer:    'ct-badge--review',
    customer_confirmed:  'ct-badge--ok',
    customer_rejected:   'ct-badge--rej',
    posted_to_timesheet: 'ct-badge--done'
  };
  function badge(status) {
    var cls = STATUS_CLASS[status] || '';
    var label = t('cts.status.' + status) || status;
    return '<span class="ct-badge ' + cls + '">' + esc(label) + '</span>';
  }

  function show(which) {
    ['paywall', 'notCompany', 'main'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = (id === which) ? '' : 'none';
    });
  }

  async function init() {
    /* Alte Deep-Links (G4b verschickte bis Welle J1
       '/public/company-timesheets.html?einsatz=<id>#live') fuehren jetzt auf
       die eigene Flaeche der Live-Belegschaft — VOR dem /me-Aufruf, damit der
       Umweg keinen sichtbaren Zwischenzustand erzeugt. Die Einsatz-Kennung
       bleibt in der Adresse erhalten. */
    var hash = String((window.location && window.location.hash) || '');
    var search = String((window.location && window.location.search) || '');
    if (hash === '#live' || search.indexOf('einsatz=') >= 0) {
      window.location.replace('/public/company-live-workforce.html' + search);
      return;
    }
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
      _tsLoaded = true;
      renderTable(_rows);
      updateKPIs(_rows);
      document.getElementById('ctCount').textContent = t('cts.count.entries', { count: _rows.length });
    } catch (e) {
      if (isCompanyGateError(e)) { show('notCompany'); return; }
      document.getElementById('ctBody').innerHTML =
        '<tr><td colspan="6" class="ct-empty">' + esc(t('cts.err.load', { detail: errDetail(e) })) + '</td></tr>';
    }
  }
  window.ctLoad = ctLoad;

  function renderTable(list) {
    var tb = document.getElementById('ctBody');
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="6" class="ct-empty">' + esc(t('cts.empty.timesheets')) + '</td></tr>';
      return;
    }
    tb.innerHTML = list.map(function (r) {
      var canAct = r.status === 'sent_to_customer';
      return '<tr>' +
        '<td><div style="font-weight:600">' + esc(workerName(r)) + '</div>' +
          (r.personnel_number ? '<div class="ct-sub">' + esc(r.personnel_number) + '</div>' : '') + '</td>' +
        '<td>' + esc(r.supplier_name || '–') + '</td>' +
        '<td>' + fmtDate(r.week_start) + '<div class="ct-sub">' + esc(t('cts.week.until')) + ' ' + fmtDate(r.week_end) + '</div></td>' +
        '<td><strong>' + fmtH(r.total_hours) + ' h</strong>' +
          (parseFloat(r.overtime_hours || 0) > 0 ? '<div class="ct-sub">' + esc(t('cts.abbr.overtime')) + ' ' + fmtH(r.overtime_hours) + ' h</div>' : '') + '</td>' +
        '<td>' + badge(r.status) + '</td>' +
        '<td style="text-align:right"><button class="ct-btn' + (canAct ? ' ct-btn--ok' : '') + '" onclick="ctOpen(\'' + esc(r.id) + '\')">' +
          esc(t(canAct ? 'cts.action.review' : 'cts.action.detail')) + '</button></td>' +
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
    catch (e) { alert(t('cts.err.detail', { detail: errDetail(e) })); return; }
    renderDetail(_current);
    document.getElementById('ctModal').classList.add('active');
  }
  window.ctOpen = ctOpen;

  function renderDetail(ts) {
    document.getElementById('ctDetailTitle').textContent = workerName(ts);
    document.getElementById('ctDetailMeta').innerHTML =
      esc(ts.supplier_name || '–') + ' &nbsp;·&nbsp; ' + fmtDate(ts.week_start) + ' ' + esc(t('cts.week.until')) + ' ' + fmtDate(ts.week_end) +
      ' &nbsp;·&nbsp; ' + badge(ts.status);

    var entries = ts.entries || [];
    var rows = entries.length
      ? entries.map(function (e) {
          return '<div class="ct-entry"><div>' + fmtDate(e.work_date) +
            (e.shift_start ? ' <span class="ct-sub">' + esc(e.shift_start) + '–' + esc(e.shift_end || '?') + '</span>' : '') +
            (e.notes ? '<div class="ct-sub">' + esc(e.notes) + '</div>' : '') + '</div>' +
            '<div style="text-align:right"><strong>' + fmtH(parseFloat(e.hours_regular || 0) + parseFloat(e.hours_overtime || 0)) + ' h</strong>' +
            (parseFloat(e.hours_overtime || 0) > 0 ? '<div class="ct-sub">' + esc(t('cts.detail.inclOvertime', { hours: fmtH(e.hours_overtime) })) + '</div>' : '') +
            (e.break_minutes > 0 ? '<div class="ct-sub">' + esc(t('cts.detail.break', { minutes: e.break_minutes })) + '</div>' : '') + '</div></div>';
        }).join('')
      : '<div class="ct-sub">' + esc(t('cts.detail.noEntries')) + '</div>';

    document.getElementById('ctDetailBody').innerHTML =
      rows +
      '<div style="display:flex;justify-content:space-between;margin-top:12px;padding-top:10px;border-top:2px solid var(--ds-border,#e2e8f0);font-weight:700">' +
        '<span>' + esc(t('cts.detail.total')) + '</span><span>' + fmtH(ts.total_hours) + ' h' +
        (parseFloat(ts.overtime_hours || 0) > 0 ? ' (' + esc(t('cts.abbr.overtime')) + ' ' + fmtH(ts.overtime_hours) + ' h)' : '') + '</span></div>' +
      (ts.worker_comment ? '<div class="ct-sub" style="margin-top:8px">' + t('cts.detail.note', { text: esc(ts.worker_comment) }) + '</div>' : '') +
      (ts.customer_note ? '<div class="ct-sub" style="margin-top:4px">' + t('cts.detail.feedback', { text: esc(ts.customer_note) }) + '</div>' : '');

    var err = document.getElementById('ctDetailErr'); err.style.display = 'none';
    var acts = document.getElementById('ctDetailActions');
    var btns = ['<button class="ct-btn" onclick="ctClose()">' + esc(t('cts.action.close')) + '</button>'];
    if (ts.status === 'sent_to_customer') {
      btns.push('<button class="ct-btn ct-btn--rej" onclick="ctReject()">' + esc(t('cts.action.reject')) + '</button>');
      btns.push('<button class="ct-btn ct-btn--ok" onclick="ctConfirm()">' + esc(t('cts.action.confirm')) + '</button>');
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
    } catch (e) { detailErr(t('cts.err.confirm', { detail: errDetail(e) })); }
  }
  window.ctConfirm = ctConfirm;

  async function ctReject() {
    if (!_current) return;
    var reason = window.prompt(t('cts.reject.prompt'), '');
    if (reason === null) return;
    reason = reason.trim();
    if (reason.length < 3) { detailErr(t('cts.reject.reasonRequired')); return; }
    try {
      await TC.api.post('/company/submissions/' + _current.id + '/reject', { reason: reason });
      ctClose(); ctLoad();
    } catch (e) {
      detailErr(e.code === 'REASON_REQUIRED' ? t('cts.reject.reasonRequired')
        : t('cts.err.reject', { detail: errDetail(e) }));
    }
  }
  window.ctReject = ctReject;

  /* Sprachwechsel: alles, was JS gebaut hat, traegt bewusst KEINEN data-i18n-Marker
     (sonst wuerde das naechste apply() Zeilen mit Laufzeitwerten entkernen). Deshalb
     zeichnen wir die bereits geladenen Listen aus dem Cache neu — ohne einen
     einzigen zusaetzlichen Netzabruf. */
  document.addEventListener('tc:langchange', function () {
    if (_tsLoaded) {
      renderTable(_rows);
      updateKPIs(_rows);
      document.getElementById('ctCount').textContent = t('cts.count.entries', { count: _rows.length });
    }
    if (_current) renderDetail(_current);
  });

  // Modal-Klick außerhalb schließt
  document.getElementById('ctModal').addEventListener('click', function (e) { if (e.target === this) ctClose(); });

  init();
})();
