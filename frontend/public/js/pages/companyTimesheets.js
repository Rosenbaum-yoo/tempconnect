/* ═══════════════════════════════════════════════════════
   Company Timesheets — Käufer-Sicht (P2.2)
   Auto-gescoped auf die eigene Unternehmens-Org (kein manuelles Org-ID-Eintippen).
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
    'cts.th.role': 'Rolle',
    'cts.th.shift': 'Schicht',
    'cts.th.since': 'Seit',
    'cts.th.until': 'Bis',
    'cts.th.severity': 'Dringlichkeit',
    'cts.th.reason': 'Grund',
    'cts.th.reported': 'Gemeldet',
    'cts.th.blockedUntil': 'Gesperrt bis',

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
    'cts.action.cancel': 'Abbrechen',
    'cts.action.report': 'Melden',
    'cts.action.reportTitle': 'Problem mit dieser Kraft an die Zeitarbeitsfirma melden',
    'cts.action.block': 'Sperren',
    'cts.action.blockTitle': 'Diese Kraft für Ihr Unternehmen sperren',
    'cts.action.unblock': 'Freigeben',

    'cts.state.loading': 'Wird geladen…',
    'cts.count.entries': '{count} Einträge',
    'cts.count.onAssignment': '{count} im Einsatz',
    'cts.count.blocked': '{count} gesperrt',
    'cts.count.reports': '{count} Meldungen',
    'cts.count.reportsOne': '1 Meldung',
    'cts.count.reportsOpen': '{count} offen',

    'cts.empty.timesheets': 'Keine empfangenen Stundenzettel. Sobald Ihre Zeitarbeitsfirma Zeiten zur Freigabe sendet, erscheinen sie hier.',
    'cts.empty.live': 'Aktuell arbeitet niemand bei Ihnen. Sobald Kräfte im Einsatz sind, erscheinen sie hier live.',
    'cts.empty.blocklist': 'Keine gesperrten Kräfte. Im Bereich Live-Belegschaft können Sie eine Kraft sperren.',
    'cts.empty.complaints': 'Noch keine Meldungen. Im Bereich Live-Belegschaft können Sie ein Problem melden.',

    'cts.week.until': 'bis',
    'cts.abbr.overtime': 'Ü',
    'cts.detail.noEntries': 'Keine Tageseinträge erfasst.',
    'cts.detail.inclOvertime': 'inkl. Ü {hours} h',
    'cts.detail.break': 'Pause {minutes} min',
    'cts.detail.total': 'Gesamt',
    'cts.detail.note': 'Notiz: {text}',
    'cts.detail.feedback': 'Ihre Rückmeldung: {text}',

    'cts.live.banner.1': 'Echtzeit-Überblick: Diese Kräfte Ihrer Zeitarbeitsfirmen sind',
    'cts.live.banner.strong': 'aktuell bei Ihnen im Einsatz',
    'cts.live.banner.2': '– automatisch aus den laufenden Einsätzen Ihrer Organisation.',
    'cts.live.kpi.active': 'Aktuell im Einsatz',
    'cts.live.kpi.ending': 'Endet in Kürze',
    'cts.live.kpi.agencies': 'Zeitarbeitsfirmen',
    'cts.live.searchPh': 'Mitarbeiter oder Firma…',
    'cts.live.badge.soon': 'Endet bald',
    'cts.live.badge.active': 'Im Einsatz',
    'cts.live.badge.out': 'Fällt aus',
    'cts.live.badge.unknown': 'Zustand unbekannt',
    'cts.live.openEnd': 'offen',
    'cts.live.out.until': 'vsl. bis {date}',
    'cts.live.out.openEnd': 'Rückkehr noch offen',
    'cts.live.out.alsoEnding': 'Einsatz endet ohnehin bald',
    'cts.live.out.privacy': 'Die Zeitarbeitsfirma hat diese Kraft als ausgefallen gemeldet. Der Grund ist ein Beschäftigtendatum und wird Ihnen bewusst nicht angezeigt.',
    'cts.live.kpi.out': 'Fällt aus',
    'cts.live.slot.backup': 'Springer',
    'cts.live.slot.backupTitle': 'Diese Kraft ist als Ersatz auf dem Einsatz, nicht als ursprünglich gebuchte Stammbesetzung.',

    'cts.cmp.banner': 'Ihre Meldungen an die Zeitarbeitsfirmen — mit aktuellem Bearbeitungsstand. Der zuständige Disponent wird bei jeder Meldung sofort benachrichtigt und kann Ersatz stellen.',
    'cts.cmp.filter.all': 'Alle Meldungen',
    'cts.cmp.status.open': 'Offen',
    'cts.cmp.status.acknowledged': 'Angenommen',
    'cts.cmp.status.resolved': 'Erledigt',
    'cts.cmp.sev.low': 'Niedrig',
    'cts.cmp.sev.medium': 'Mittel',
    'cts.cmp.sev.high': 'Hoch',
    'cts.cmp.title': 'Problem melden',
    'cts.cmp.modalBanner': 'Ihre Meldung geht an die zuständige Zeitarbeitsfirma. Diese kann reagieren – z. B. einen Ersatz stellen.',
    'cts.cmp.severityLabel': 'Dringlichkeit',
    'cts.cmp.sevOpt.low': 'Niedrig – Hinweis',
    'cts.cmp.sevOpt.medium': 'Mittel – bitte prüfen',
    'cts.cmp.sevOpt.high': 'Hoch – dringend / Ersatz nötig',
    'cts.cmp.reasonLabel': 'Was ist das Problem?',
    'cts.cmp.reasonPh': 'z. B. wiederholt zu spät, Qualität unzureichend, Verhalten vor Ort',
    'cts.cmp.submit': 'Melden',
    'cts.cmp.busy': 'Wird gemeldet…',
    'cts.cmp.errReason': 'Bitte beschreiben Sie das Problem (mind. 3 Zeichen).',

    'cts.bl.banner.1': 'Gesperrte Kräfte werden diesem Unternehmen von den Zeitarbeitsfirmen',
    'cts.bl.banner.strong': 'nicht mehr zugewiesen',
    'cts.bl.banner.2': '. Sie entscheiden: dauerhaft, befristet (z. B. 3 Monate) oder wieder freigeben.',
    'cts.block.until': 'bis {date}',
    'cts.block.permanent': 'dauerhaft',

    'cts.blk.title': 'Kraft sperren',
    'cts.blk.duration': 'Dauer',
    'cts.blk.dur.permanent': 'Dauerhaft (nie wieder)',
    'cts.blk.dur.3m': 'Befristet: 3 Monate',
    'cts.blk.dur.custom': 'Befristet: bis Datum…',
    'cts.blk.reasonLabel': 'Grund (wird der Zeitarbeitsfirma angezeigt)',
    'cts.blk.reasonPh': 'z. B. wiederholt unentschuldigt gefehlt',
    'cts.blk.submit': 'Sperren',
    'cts.blk.errDate': 'Bitte ein Datum wählen.',

    'cts.reject.prompt': 'Grund der Zurückweisung (wird der Zeitarbeitsfirma angezeigt):',
    'cts.reject.reasonRequired': 'Bitte einen Grund angeben (mind. 3 Zeichen).',

    'cts.err.generic': 'Fehler',
    'cts.err.load': 'Konnte nicht geladen werden: {detail}',
    'cts.err.detail': 'Fehler beim Laden: {detail}',
    'cts.err.confirm': 'Bestätigung fehlgeschlagen: {detail}',
    'cts.err.reject': 'Zurückweisung fehlgeschlagen: {detail}',
    'cts.err.block': 'Sperren fehlgeschlagen: {detail}',
    'cts.err.unblock': 'Freigeben fehlgeschlagen: {detail}',
    'cts.err.report': 'Melden fehlgeschlagen: {detail}',
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
    'cts.th.role': 'Role',
    'cts.th.shift': 'Shift',
    'cts.th.since': 'Since',
    'cts.th.until': 'Until',
    'cts.th.severity': 'Urgency',
    'cts.th.reason': 'Reason',
    'cts.th.reported': 'Reported',
    'cts.th.blockedUntil': 'Blocked until',

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
    'cts.action.cancel': 'Cancel',
    'cts.action.report': 'Report',
    'cts.action.reportTitle': 'Report an issue with this staff member to the staffing firm',
    'cts.action.block': 'Block',
    'cts.action.blockTitle': 'Block this staff member for your company',
    'cts.action.unblock': 'Unblock',

    'cts.state.loading': 'Loading…',
    'cts.count.entries': '{count} entries',
    'cts.count.onAssignment': '{count} on assignment',
    'cts.count.blocked': '{count} blocked',
    'cts.count.reports': '{count} reports',
    'cts.count.reportsOne': '1 report',
    'cts.count.reportsOpen': '{count} open',

    'cts.empty.timesheets': 'No timesheets received. As soon as your staffing firm submits hours for approval, they appear here.',
    'cts.empty.live': 'Nobody is working at your site right now. As soon as staff are on assignment, they appear here live.',
    'cts.empty.blocklist': 'No blocked staff. You can block a staff member in the Live workforce tab.',
    'cts.empty.complaints': 'No reports yet. You can report an issue in the Live workforce tab.',

    'cts.week.until': 'until',
    'cts.abbr.overtime': 'OT',
    'cts.detail.noEntries': 'No daily entries recorded.',
    'cts.detail.inclOvertime': 'incl. OT {hours} h',
    'cts.detail.break': 'Break {minutes} min',
    'cts.detail.total': 'Total',
    'cts.detail.note': 'Note: {text}',
    'cts.detail.feedback': 'Your feedback: {text}',

    'cts.live.banner.1': 'Real-time overview: these staff from your staffing firms are',
    'cts.live.banner.strong': 'currently on assignment with you',
    'cts.live.banner.2': '— pulled automatically from the running assignments of your organisation.',
    'cts.live.kpi.active': 'Currently on assignment',
    'cts.live.kpi.ending': 'Ending shortly',
    'cts.live.kpi.agencies': 'Staffing firms',
    'cts.live.searchPh': 'Staff member or company…',
    'cts.live.badge.soon': 'Ending soon',
    'cts.live.badge.active': 'On assignment',
    'cts.live.badge.out': 'Unavailable',
    'cts.live.badge.unknown': 'State unknown',
    'cts.live.openEnd': 'open',
    'cts.live.out.until': 'expected until {date}',
    'cts.live.out.openEnd': 'Return date still open',
    'cts.live.out.alsoEnding': 'assignment was ending shortly anyway',
    'cts.live.out.privacy': 'The staffing firm reported this worker as unavailable. The reason is employee data and is deliberately not shown to you.',
    'cts.live.kpi.out': 'Unavailable',
    'cts.live.slot.backup': 'Stand-in',
    'cts.live.slot.backupTitle': 'This worker is on the assignment as a replacement, not as the originally booked staffing.',

    'cts.cmp.banner': 'Your reports to the staffing firms — with the current processing status. The responsible scheduler is notified immediately for every report and can provide a replacement.',
    'cts.cmp.filter.all': 'All reports',
    'cts.cmp.status.open': 'Open',
    'cts.cmp.status.acknowledged': 'Acknowledged',
    'cts.cmp.status.resolved': 'Resolved',
    'cts.cmp.sev.low': 'Low',
    'cts.cmp.sev.medium': 'Medium',
    'cts.cmp.sev.high': 'High',
    'cts.cmp.title': 'Report an issue',
    'cts.cmp.modalBanner': 'Your report goes to the responsible staffing firm. They can react — for example by providing a replacement.',
    'cts.cmp.severityLabel': 'Urgency',
    'cts.cmp.sevOpt.low': 'Low – for information',
    'cts.cmp.sevOpt.medium': 'Medium – please review',
    'cts.cmp.sevOpt.high': 'High – urgent / replacement needed',
    'cts.cmp.reasonLabel': 'What is the problem?',
    'cts.cmp.reasonPh': 'e.g. repeatedly late, quality insufficient, conduct on site',
    'cts.cmp.submit': 'Report',
    'cts.cmp.busy': 'Sending…',
    'cts.cmp.errReason': 'Please describe the problem (at least 3 characters).',

    'cts.bl.banner.1': 'The staffing firms will',
    'cts.bl.banner.strong': 'no longer assign blocked staff to this company',
    'cts.bl.banner.2': '. You decide: permanently, for a fixed period (e.g. 3 months) or release them again.',
    'cts.block.until': 'until {date}',
    'cts.block.permanent': 'permanent',

    'cts.blk.title': 'Block staff member',
    'cts.blk.duration': 'Duration',
    'cts.blk.dur.permanent': 'Permanent (never again)',
    'cts.blk.dur.3m': 'Fixed period: 3 months',
    'cts.blk.dur.custom': 'Fixed period: until a date…',
    'cts.blk.reasonLabel': 'Reason (shown to the staffing firm)',
    'cts.blk.reasonPh': 'e.g. repeated unexcused absence',
    'cts.blk.submit': 'Block',
    'cts.blk.errDate': 'Please choose a date.',

    'cts.reject.prompt': 'Reason for the rejection (shown to the staffing firm):',
    'cts.reject.reasonRequired': 'Please provide a reason (at least 3 characters).',

    'cts.err.generic': 'Error',
    'cts.err.load': 'Could not be loaded: {detail}',
    'cts.err.detail': 'Error while loading: {detail}',
    'cts.err.confirm': 'Confirmation failed: {detail}',
    'cts.err.reject': 'Rejection failed: {detail}',
    'cts.err.block': 'Blocking failed: {detail}',
    'cts.err.unblock': 'Unblocking failed: {detail}',
    'cts.err.report': 'Reporting failed: {detail}',
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
    try { await TC.api.get('/me'); }
    catch (e) { show('paywall'); return; }
    show('main');
    /* NACH dem /me-Erfolg, nicht davor (Muster mitarbeiter.js): wer nicht
       angemeldet ist, sieht die Anmeldeflaeche — ein vorher geoeffneter Reiter
       waere ein kurzes Aufblitzen von Daten fuer genau diesen Besucher. */
    leseEinsatzAusAdresse();
    var hash = String((window.location && window.location.hash) || '');
    if (_fokusEinsatz || hash === '#live') {
      /* Die Stundenzettel-Liste wird hier bewusst NICHT geladen: wer aus der
         Ausfallmeldung kommt, will die Live-Belegschaft. Ihre Daten holt der
         Reiterwechsel nach (ctView laedt jeden Reiter beim ersten Oeffnen). */
      ctView('live');
      return;
    }
    ctLoad();
  }

  /* ── Der Deep-Link aus der Ausfallmeldung (Welle H1) ────────────────────
     G4b verschickt '/public/company-timesheets.html?einsatz=<id>#live'. Bis
     hierher war das eine Sackgasse: die Seite las weder Query noch Hash, und
     die Zeilen trugen keine Einsatz-Kennung, gegen die man haette vergleichen
     koennen. Beides ist jetzt da — der Link fuehrt zur ZEILE, nicht auf eine
     Uebersicht. */
  var _fokusEinsatz = null;

  /** Liest ?einsatz= aus der Adresse. Einmalig beim Laden; der Wert wird bei
   *  Erfolg verbraucht, sonst spraenge die Ansicht bei jedem Polling-Lauf
   *  zurueck an dieselbe Stelle. */
  function leseEinsatzAusAdresse() {
    try {
      var such = new URLSearchParams((window.location && window.location.search) || '');
      var e = such.get('einsatz');
      if (e) _fokusEinsatz = String(e);
    } catch (_) { /* alte Browser ohne URLSearchParams: kein Fokus, kein Fehler */ }
  }

  function fokussiereEinsatz() {
    if (!_fokusEinsatz) return;
    var ziel = document.querySelector('#lwBody tr[data-einsatz="' + String(_fokusEinsatz).replace(/"/g, '\\"') + '"]');
    /* Verbraucht wird der Fokus NUR bei Erfolg: findet der erste Lauf die
       Zeile nicht (Liste noch leer, Suchfeld gefuellt), bekommt der naechste
       sie noch. */
    if (!ziel) return;
    _fokusEinsatz = null;
    ziel.style.outline = '2px solid var(--ds-brand,#4a9eff)';
    ziel.style.outlineOffset = '-2px';
    if (ziel.scrollIntoView) ziel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    /* Die Hervorhebung verblasst. Bliebe sie stehen, saehe die Tafel beim
       naechsten Blick aus, als waere dort dauerhaft etwas besonders. */
    setTimeout(function () {
      ziel.style.transition = 'outline-color .6s ease';
      ziel.style.outlineColor = 'transparent';
    }, 6000);
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

  /* ── Live-Belegschaft (P2.3/3.1) + Sperrliste (P3.3) ──────────────────── */
  var _liveLoaded = false;
  var _blocklistLoaded = false;
  var _complaintsLoaded = false;
  var _liveTimer = null;
  var _liveRows = [];
  var _blockRows = [];
  var _complaintRows = [];
  var _blkWorkerId = null;

  var VIEWS = { timesheets: 'viewTimesheets', live: 'viewLive', complaints: 'viewComplaints', blocklist: 'viewBlocklist' };
  var TABS = { timesheets: 'tabTimesheets', live: 'tabLive', complaints: 'tabComplaints', blocklist: 'tabBlocklist' };
  function ctView(mode) {
    Object.keys(VIEWS).forEach(function (k) {
      document.getElementById(VIEWS[k]).style.display = (k === mode) ? '' : 'none';
      document.getElementById(TABS[k]).classList.toggle('ct-tab--active', k === mode);
    });
    if (mode === 'timesheets' && !_tsLoaded) ctLoad();
    if (mode === 'live' && !_liveLoaded) ctLoadLive();
    if (mode === 'blocklist' && !_blocklistLoaded) ctLoadBlocklist();
    if (mode === 'complaints' && !_complaintsLoaded) ctLoadComplaints();
    if (mode === 'live') startLivePolling(); else stopLivePolling();
  }

  /* Eine Tafel, die "Live" heisst, muss sich auch von selbst erneuern.
     Bis Welle H1 tat sie das nicht: der einzige Timer der Seite war der
     Such-Debounce. Ein Ausfall waere damit so aktuell gewesen wie der letzte
     Reiterklick — und genau dieser Zustand ist der Grund, aus dem der Kunde
     ueberhaupt hierher geschickt wird. Getaktet wie die Agenturtafel. */
  var LIVE_POLL_MS = 30000;
  var _livePoll = null;
  function startLivePolling() {
    stopLivePolling();
    _livePoll = setInterval(ctLoadLive, LIVE_POLL_MS);
  }
  function stopLivePolling() {
    if (_livePoll) { clearInterval(_livePoll); _livePoll = null; }
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
    } catch (e) {
      if (isCompanyGateError(e)) { show('notCompany'); return; }
      document.getElementById('lwBody').innerHTML =
        '<tr><td colspan="8" class="ct-empty">' + esc(t('cts.err.load', { detail: errDetail(e) })) + '</td></tr>';
    }
  }
  window.ctLoadLive = ctLoadLive;

  /* Die Zustaende stehen in einer TABELLE, nicht in einer Kette von Fragen.
     Der Grund ist ein konkreter Beinahe-Schaden: bis Welle H1 war das hier ein
     binaeres Ternaer — alles ausser 'endet_bald' fiel in das gruene
     "Im Einsatz". Ein serverseitig ergaenzter Zustand haette also nicht
     GEFEHLT, sondern das Gegenteil behauptet: der Kunde haette eine
     ausgefallene Kraft als anwesend gesehen und danach disponiert.
     Deshalb: bekannte Zustaende einzeln, und ein unbekannter wird als
     unbekannt ausgewiesen statt stillschweigend beschoenigt. */
  var LIVE_BADGE = {
    faellt_aus:  { cls: 'ct-badge--out',  key: 'cts.live.badge.out' },
    endet_bald:  { cls: 'ct-badge--soon', key: 'cts.live.badge.soon' },
    im_einsatz:  { cls: 'ct-badge--live', key: 'cts.live.badge.active' }
  };
  function liveBadge(status) {
    var def = LIVE_BADGE[status];
    if (!def) {
      /* Kein Rueckfall auf einen gruenen Zustand: Wer hier landet, weiss es
         nicht — und "ich weiss es nicht" ist eine ehrliche Auskunft,
         "Im Einsatz" waere eine falsche. */
      return '<span class="ct-badge" title="' + esc(String(status || '')) + '">' +
             esc(t('cts.live.badge.unknown')) + '</span>';
    }
    var titel = (status === 'faellt_aus') ? ' title="' + esc(t('cts.live.out.privacy')) + '"' : '';
    return '<span class="ct-badge ' + def.cls + '"' + titel + '>' + esc(t(def.key)) + '</span>';
  }

  /* Die Spalte "Rolle".
   *
   * Sie zeigte bis hierher `wal.role` — und das ist KEINE Taetigkeit, sondern
   * die Besetzungsart: ein geschlossener CHECK auf 'primary'|'backup'
   * (Mig 029:99-100), NOT NULL mit Vorgabe 'primary'. Der Kunde las damit unter
   * "Rolle" das englische Wort "primary", und zwar in JEDER Zeile — im Bestand
   * tragen alle 24 Verknuepfungen genau diesen Wert. Der Rueckfall
   * `|| worker_description` konnte nie greifen, weil die Spalte nicht leer sein
   * kann: eine tote Zeile, die aussah, als sei der Fall bedacht.
   *
   * Was hier hingehoert, ist die Taetigkeit (`worker_description` vom Einsatz).
   * Die Besetzungsart geht nicht verloren, wird aber nur genannt, wenn sie etwas
   * aussagt: "Springer" bei einem Ersatz. Bei 'primary' — also immer — waere sie
   * ein Etikett ohne Unterschied und damit Rauschen. */
  function liveRoleCell(r) {
    var text = esc(r.worker_description || '–');
    if (String(r.role || '') !== 'backup') return text;
    return text + ' <span class="ct-badge ct-badge--soon" title="' +
           esc(t('cts.live.slot.backupTitle')) + '">' + esc(t('cts.live.slot.backup')) + '</span>';
  }

  /* Die Statuszelle. Bewusst NICHT die Spalte "Bis": die zeigt das Ende des
     EINSATZES. Das voraussichtliche Ende der Abwesenheit ist eine andere
     Groesse — beides in dieselbe Zelle zu schreiben laesst den Kunden falsch
     planen. Und: hier steht ausschliesslich DASS und BIS WANN. Die Art der
     Abwesenheit kommt vom Server gar nicht erst mit (Art. 9 DSGVO). */
  function liveStatusCell(r) {
    var out = liveBadge(r.live_status);
    if (r.live_status !== 'faellt_aus') return out;
    var zusatz = r.ausfall_bis
      ? t('cts.live.out.until', { date: fmtDate(r.ausfall_bis) })
      : t('cts.live.out.openEnd');
    /* Das nahende Einsatzende geht nicht verloren, nur weil der Ausfall den
       Platz im Abzeichen bekommt (dieselbe Regel wie auf der Agenturtafel). */
    if (r.endet_bald) zusatz += ' · ' + t('cts.live.out.alsoEnding');
    return out + '<div class="ct-sub">' + esc(zusatz) + '</div>';
  }
  function renderLive(list) {
    _liveRows = list || [];
    document.getElementById('lwCount').textContent = t('cts.count.onAssignment', { count: _liveRows.length });
    var tb = document.getElementById('lwBody');
    if (!_liveRows.length) {
      tb.innerHTML = '<tr><td colspan="8" class="ct-empty">' + esc(t('cts.empty.live')) + '</td></tr>';
      return;
    }
    tb.innerHTML = _liveRows.map(function (r) {
      var shift = (r.shift_start && r.shift_end) ? (String(r.shift_start).slice(0, 5) + '–' + String(r.shift_end).slice(0, 5)) : '–';
      /* data-einsatz traegt die Einsatz-Kennung an der Zeile — der Anker, an
         dem der Deep-Link aus der Ausfallmeldung (G4b) landet. Ohne ihn fuehrt
         '?einsatz=' nur in die Naehe, und der Kunde sucht ein zweites Mal. */
      return '<tr data-einsatz="' + esc(r.assignment_id || '') + '">' +
        '<td><div style="font-weight:600">' + esc(workerName(r)) + '</div>' + (r.personnel_number ? '<div class="ct-sub">' + esc(r.personnel_number) + '</div>' : '') + '</td>' +
        '<td>' + esc(r.agency_name || '–') + '</td>' +
        '<td>' + liveRoleCell(r) + '</td>' +
        '<td>' + shift + '</td>' +
        '<td>' + fmtDate(r.start_date) + '</td>' +
        '<td>' + (r.effective_end_date ? fmtDate(r.effective_end_date) : esc(t('cts.live.openEnd'))) + '</td>' +
        '<td>' + liveStatusCell(r) + '</td>' +
        '<td style="text-align:right;white-space:nowrap">' +
          '<button class="ct-btn" style="margin-right:4px" onclick="ctComplain(\'' + esc(r.worker_user_id) + '\')" title="' + esc(t('cts.action.reportTitle')) + '">' + esc(t('cts.action.report')) + '</button>' +
          '<button class="ct-btn ct-btn--rej" onclick="ctBlock(\'' + esc(r.worker_user_id) + '\')" title="' + esc(t('cts.action.blockTitle')) + '">' + esc(t('cts.action.block')) + '</button>' +
        '</td>' +
      '</tr>';
    }).join('');
    fokussiereEinsatz();
  }
  function updateLiveKPIs(k) {
    /* "Aktuell im Einsatz" muss stimmen, sonst ist die Kachel schlimmer als
       keine. Ausgefallene Kraefte zaehlen deshalb NICHT mit — sie stehen in
       der eigenen, vierten Kachel. Die Summe beider ergibt wieder die
       gebuchte Belegschaft (k.total). */
    var gesamt = (k.total != null) ? k.total : ((k.im_einsatz || 0) + (k.faellt_aus || 0));
    var aus = k.faellt_aus || 0;
    document.getElementById('lwTotal').textContent = Math.max(0, gesamt - aus);
    document.getElementById('lwEnds').textContent = k.endet_bald || 0;
    document.getElementById('lwOut').textContent = aus;
    document.getElementById('lwAgencies').textContent = k.agencies || 0;
    /* Die Ausfall-Kachel wird nur dann rot, wenn es etwas zu sehen gibt —
       eine dauerhaft alarmierte Kachel liest sich nach kurzer Zeit wie Deko. */
    document.getElementById('lwOut').style.color = aus > 0 ? 'var(--ds-danger)' : '';
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
      if (!until) { blkErr(t('cts.blk.errDate')); return; }
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
    } catch (e) { blkErr(t('cts.err.block', { detail: errDetail(e) })); }
  }
  window.ctBlkSubmit = ctBlkSubmit;

  async function ctLoadBlocklist() {
    try {
      var data = await TC.api.get('/company/blocklist');
      _blocklistLoaded = true;
      renderBlocklist((data && data.items) || []);
    } catch (e) {
      if (isCompanyGateError(e)) { show('notCompany'); return; }
      document.getElementById('blBody').innerHTML =
        '<tr><td colspan="5" class="ct-empty">' + esc(t('cts.err.load', { detail: errDetail(e) })) + '</td></tr>';
    }
  }
  window.ctLoadBlocklist = ctLoadBlocklist;

  function renderBlocklist(list) {
    _blockRows = list || [];
    document.getElementById('blCount').textContent = t('cts.count.blocked', { count: _blockRows.length });
    var tb = document.getElementById('blBody');
    if (!_blockRows.length) {
      tb.innerHTML = '<tr><td colspan="5" class="ct-empty">' + esc(t('cts.empty.blocklist')) + '</td></tr>';
      return;
    }
    tb.innerHTML = _blockRows.map(function (b) {
      var until = b.blocked_until ? t('cts.block.until', { date: fmtDate(b.blocked_until) }) : t('cts.block.permanent');
      return '<tr>' +
        '<td><div style="font-weight:600">' + esc(workerName(b)) + '</div>' + (b.personnel_number ? '<div class="ct-sub">' + esc(b.personnel_number) + '</div>' : '') + '</td>' +
        '<td>' + esc(b.agency_name || '–') + '</td>' +
        '<td>' + esc(b.reason || '–') + '</td>' +
        '<td>' + esc(until) + '</td>' +
        '<td style="text-align:right"><button class="ct-btn ct-btn--ok" onclick="ctUnblock(\'' + esc(b.worker_user_id) + '\')">' + esc(t('cts.action.unblock')) + '</button></td>' +
      '</tr>';
    }).join('');
  }

  /* ── Meine Meldungen: Rückkanal zu den gemeldeten Problemen ─────────────── */
  // Status-Werte exakt wie der CHECK in Migration 150: open | acknowledged | resolved.
  // Das Label kommt zur Laufzeit aus dem Woerterbuch, die Karte haelt nur die Optik.
  var CMP_STATUS_CLASS = {
    open:         'ct-badge--review',
    acknowledged: 'ct-badge--done',
    resolved:     'ct-badge--ok'
  };
  var CMP_SEVERITY_CLASS = {
    low:    'ct-badge--done',
    medium: 'ct-badge--review',
    high:   'ct-badge--rej'
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
        '<tr><td colspan="6" class="ct-empty">' + esc(t('cts.err.load', { detail: errDetail(e) })) + '</td></tr>';
    }
  }
  window.ctLoadComplaints = ctLoadComplaints;

  function renderComplaints(list) {
    _complaintRows = list || [];
    var open = _complaintRows.filter(function (c) { return c.status === 'open' || c.status === 'in_progress'; }).length;
    document.getElementById('cmpCount').textContent =
      (_complaintRows.length === 1 ? t('cts.count.reportsOne') : t('cts.count.reports', { count: _complaintRows.length })) +
      (open ? (' · ' + t('cts.count.reportsOpen', { count: open })) : '');
    var tb = document.getElementById('cmpBody');
    if (!_complaintRows.length) {
      tb.innerHTML = '<tr><td colspan="6" class="ct-empty">' + esc(t('cts.empty.complaints')) + '</td></tr>';
      return;
    }
    tb.innerHTML = _complaintRows.map(function (c) {
      var stCls = CMP_STATUS_CLASS[c.status] || 'ct-badge--done';
      var svCls = CMP_SEVERITY_CLASS[c.severity] || 'ct-badge--done';
      var stLabel = t('cts.cmp.status.' + c.status) || c.status || '–';
      var svLabel = t('cts.cmp.sev.' + c.severity) || c.severity || '–';
      return '<tr>' +
        '<td><div style="font-weight:600">' + esc(workerName(c)) + '</div>' +
          (c.personnel_number ? '<div class="ct-sub">' + esc(c.personnel_number) + '</div>' : '') + '</td>' +
        '<td>' + esc(c.agency_name || '–') + '</td>' +
        '<td><span class="ct-badge ' + svCls + '">' + esc(svLabel) + '</span></td>' +
        '<td>' + esc(c.reason || '–') + '</td>' +
        '<td><span class="ct-badge ' + stCls + '">' + esc(stLabel) + '</span></td>' +
        '<td>' + fmtDate(c.created_at) + '</td>' +
      '</tr>';
    }).join('');
  }

  async function ctUnblock(workerId) {
    try {
      await TC.api.delete('/company/blocklist/' + workerId);
      ctLoadBlocklist();
    } catch (e) { alert(t('cts.err.unblock', { detail: errDetail(e) })); }
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
    if (reason.length < 3) { err.textContent = t('cts.cmp.errReason'); err.style.display = ''; return; }
    var btn = document.getElementById('cmpSubmit');
    btn.disabled = true; btn.textContent = t('cts.cmp.busy');
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
      err.textContent = t('cts.err.report', { detail: errDetail(e) }); err.style.display = '';
    } finally { btn.disabled = false; btn.textContent = t('cts.cmp.submit'); }
  }
  window.ctCompSubmit = ctCompSubmit;

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
    if (_liveLoaded) renderLive(_liveRows);
    if (_blocklistLoaded) renderBlocklist(_blockRows);
    if (_complaintsLoaded) renderComplaints(_complaintRows);
    if (_current) renderDetail(_current);
  });

  // Modal-Klick außerhalb schließt
  document.getElementById('ctModal').addEventListener('click', function (e) { if (e.target === this) ctClose(); });
  document.getElementById('ctBlockModal').addEventListener('click', function (e) { if (e.target === this) ctBlkClose(); });
  document.getElementById('ctComplaintModal').addEventListener('click', function (e) { if (e.target === this) ctCompClose(); });

  init();
})();
