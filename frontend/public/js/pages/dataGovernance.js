/* ── Woerterbuch (P6.1, DE/EN) — Namensraum adm.b. ─────────────────────────
   Traegt data-governance.html (Trust Center) UND dieses Modul. i18n.js liegt
   im head der Seite, TCi18n ist hier also garantiert vorhanden.

   Bewusst NICHT uebersetzt:
   - Server-Enums und Rohwerte (pending, in_progress, export, deletion, ...),
     die zugleich als option-value und als Tabellenzelle erscheinen
   - Kategorie-Schluessel und Labels aus dem Inventar-Endpunkt
   - alles aus pageShell.js (Topbar, Navigation, Nutzerbereich)                */
TCi18n.register('de', {
  'adm.b.docTitle': 'Trust Center – TempConnect',
  'adm.b.page.title': 'Trust Center',
  'adm.b.page.subtitle': 'Rechtliches, Datenschutz, Sicherheit, Compliance und Governance.',
  'adm.b.page.newRequest': '+ Neue DSGVO-Anfrage',
  'adm.b.page.newRequestTitle': 'DSGVO-/Betroffenen-Anfrage anlegen: Datenexport (Art. 15/20), Löschung (Art. 17), Berichtigung (Art. 16) oder Einschränkung (Art. 18) für Benutzer, Worker oder Organisation.',

  'adm.b.onb.label': 'Plattform einrichten',
  'adm.b.onb.toggle': 'Auf-/Zuklappen',
  'adm.b.onb.dismiss': 'Ausblenden',

  'adm.b.hub.current': 'Trust Center',
  'adm.b.hub.currentDesc': 'Sie befinden sich im Trust Center.',
  'adm.b.hub.imprint': 'Impressum',
  'adm.b.hub.imprintDesc': 'Gesetzlich vorgeschriebene Anbieterinformationen.',
  'adm.b.hub.terms': 'AGB Anlage 1',
  'adm.b.hub.termsDesc': 'Allgemeine Geschäftsbedingungen und Anlagen.',
  'adm.b.hub.privacy': 'Datenschutz',
  'adm.b.hub.privacyDesc': 'Datenschutzerklärung und Verarbeitungshinweise.',
  'adm.b.hub.security': 'Sicherheit',
  'adm.b.hub.securityDesc': 'Sicherheitsmaßnahmen, Penetrationstests und Zertifizierungen.',
  'adm.b.hub.about': 'Über uns',
  'adm.b.hub.aboutDesc': 'Unternehmen, Team und Mission von TempConnect.',
  'adm.b.hub.sla': 'SLA',
  'adm.b.hub.slaDesc': 'Service-Level-Agreements und Verfügbarkeitsgarantien.',
  'adm.b.hub.governance': 'DSGVO Data Governance',
  'adm.b.hub.governanceDesc': 'Dateninventar, Löschanfragen, Aufbewahrung und Anonymisierung.',
  'adm.b.hub.api': 'API-Dokumentation',
  'adm.b.hub.apiDesc': 'REST-API-Referenz, Endpunkte und Integrationsanleitungen.',

  'adm.b.tab.inventory': 'Dateninventar',
  'adm.b.tab.requests': 'DSGVO-Anfragen',
  'adm.b.tab.retention': 'Aufbewahrung',
  'adm.b.tab.actions': 'Export & Anonymisierung',

  'adm.b.state.loading': 'Lade…',
  'adm.b.filter.status': 'Status',
  'adm.b.filter.type': 'Typ',
  'adm.b.filter.all': 'Alle',
  'adm.b.filter.pending': 'Offen',
  'adm.b.filter.inProgress': 'In Bearbeitung',
  'adm.b.filter.completed': 'Abgeschlossen',
  'adm.b.filter.rejected': 'Abgelehnt',
  'adm.b.filter.export': 'Export',
  'adm.b.filter.deletion': 'Löschung',
  'adm.b.filter.rectification': 'Berichtigung',
  'adm.b.filter.restriction': 'Einschränkung',
  'adm.b.filter.apply': 'Filtern',

  'adm.b.inv.heading': 'Datenkategorien nach DSGVO',
  'adm.b.inv.colCategory': 'Kategorie',
  'adm.b.inv.colDescription': 'Beschreibung',
  'adm.b.inv.colTables': 'Tabellen',
  'adm.b.inv.colRetention': 'Aufbewahrung',
  'adm.b.inv.loadFail': 'Dateninventar konnte derzeit nicht geladen werden.',
  'adm.b.inv.emptyAvail': 'Keine Inventardaten verfügbar.',
  'adm.b.inv.empty': 'Keine Inventardaten vorhanden.',

  'adm.b.req.heading': 'DSGVO-Anfragen',
  'adm.b.req.colType': 'Typ',
  'adm.b.req.colSubject': 'Betroffener',
  'adm.b.req.colCreated': 'Erstellt',
  'adm.b.req.colStatus': 'Status',
  'adm.b.req.colHandler': 'Bearbeiter',
  'adm.b.req.colActions': 'Aktionen',
  'adm.b.req.empty': 'Keine DSGVO-Anfragen gefunden.',
  'adm.b.req.complete': 'Abschließen',
  'adm.b.req.completeConfirm': 'Anfrage als abgeschlossen markieren?',
  'adm.b.req.completeOkTitle': 'Anfrage abgeschlossen',
  'adm.b.req.completeOkText': 'Die DSGVO-Anfrage wurde erfolgreich abgeschlossen.',
  'adm.b.req.completeFailTitle': 'Abschluss fehlgeschlagen',
  'adm.b.req.completeFailText': 'Die DSGVO-Anfrage konnte nicht abgeschlossen werden.',

  'adm.b.ret.heading': 'Aufbewahrungsfristen',
  'adm.b.ret.colTable': 'Tabelle',
  'adm.b.ret.colPeriod': 'Frist',
  'adm.b.ret.colReason': 'Grund',
  'adm.b.ret.colAffected': 'Betroffene',
  'adm.b.ret.colStatus': 'Status',
  'adm.b.ret.dryRun': 'Dry-Run Bereinigung',
  'adm.b.ret.cleanup': 'Bereinigung durchführen',
  'adm.b.ret.empty': 'Keine Retention-Daten verfügbar.',
  'adm.b.ret.entries': '{count} Einträge',
  'adm.b.ret.expired': '{count} abgelaufen',
  'adm.b.ret.cleanupConfirm': 'Retention-Bereinigung WIRKLICH durchführen? Gelöschte Daten können nicht wiederhergestellt werden!',
  'adm.b.ret.dryOkTitle': 'Dry-Run abgeschlossen',
  'adm.b.ret.dryOkText': 'Die Retention-Simulation wurde erfolgreich erstellt.',
  'adm.b.ret.cleanupOkTitle': 'Bereinigung abgeschlossen',
  'adm.b.ret.cleanupOkText': 'Die Retention-Bereinigung wurde erfolgreich durchgeführt.',
  'adm.b.ret.cleanupErr': 'Fehler bei der Bereinigung.',
  'adm.b.ret.failTitle': 'Bereinigung fehlgeschlagen',
  'adm.b.ret.failText': 'Die Retention-Bereinigung konnte nicht ausgeführt werden.',

  'adm.b.act.exportUserHeading': 'Benutzer-Datenexport',
  'adm.b.act.exportUserInfo': 'Art. 15/20 DSGVO — Vollständiger Export aller personenbezogenen Daten eines Nutzers als JSON-Download.',
  'adm.b.act.userId': 'User-ID',
  'adm.b.act.uuid': 'UUID',
  'adm.b.act.exportStart': 'Export starten',
  'adm.b.act.exportOrgHeading': 'Org-Datenexport',
  'adm.b.act.exportOrgInfo': 'Gesamtexport aller organisationsbezogenen Daten für die Datenschutzakte.',
  'adm.b.act.exportOrgStart': 'Org-Export starten',
  'adm.b.act.anonHeading': 'Benutzer anonymisieren',
  'adm.b.act.anonWarn': 'Art. 17 DSGVO — Unwiderrufliche Anonymisierung. Kategorie-A-Daten (PII) werden überschrieben, B anonymisiert, D gelöscht. Kategorie C bleibt erhalten.',
  'adm.b.act.check': 'Prüfen',
  'adm.b.act.anonymize': 'Anonymisieren',

  'adm.b.modal.title': 'Neue DSGVO-Anfrage',
  'adm.b.modal.type': 'Anfrage-Typ *',
  'adm.b.modal.choose': 'Bitte wählen',
  'adm.b.modal.typeExport': 'Datenexport (Art. 15/20)',
  'adm.b.modal.typeDeletion': 'Löschung (Art. 17)',
  'adm.b.modal.typeRectification': 'Berichtigung (Art. 16)',
  'adm.b.modal.typeRestriction': 'Einschränkung (Art. 18)',
  'adm.b.modal.subjectType': 'Betroffenen-Typ *',
  'adm.b.modal.subjectUser': 'Benutzer',
  'adm.b.modal.subjectWorker': 'Worker',
  'adm.b.modal.subjectOrg': 'Organisation',
  'adm.b.modal.subjectId': 'Betroffenen-ID',
  'adm.b.modal.subjectIdPh': 'UUID (optional)',
  'adm.b.modal.notes': 'Notizen',
  'adm.b.modal.notesPh': 'Weitere Details…',
  'adm.b.modal.cancel': 'Abbrechen',
  'adm.b.modal.submit': 'Anfrage erstellen',

  'adm.b.access.fallback': 'DSGVO-Governance ist fuer diese Rolle derzeit nicht freigeschaltet.',
  'adm.b.access.hiddenTitle': 'DSGVO-Governance ausgeblendet',
  'adm.b.access.requestsHidden': 'DSGVO-Anfragen bleiben fuer diese Rolle ausgeblendet.',
  'adm.b.access.retentionHidden': 'Retention bleibt fuer diese Rolle ausgeblendet.',
  'adm.b.access.limitedTitle': 'DSGVO-Governance eingeschraenkt',
  'adm.b.access.limitedText': 'Einzelne Governance-Aktionen bleiben fuer diese Rolle kontrolliert.',
  'adm.b.error.network': 'Netzwerkfehler oder Server nicht erreichbar.',

  'adm.b.exp.missingIdTitle': 'User-ID fehlt',
  'adm.b.exp.missingIdExport': 'Bitte User-ID für den Export eingeben.',
  'adm.b.exp.userOkTitle': 'User-Export bereit',
  'adm.b.exp.userOkText': 'Der Benutzerexport wurde erfolgreich erstellt.',
  'adm.b.exp.userFailTitle': 'User-Export fehlgeschlagen',
  'adm.b.exp.userFailText': 'Der Benutzerexport konnte nicht erstellt werden.',
  'adm.b.exp.orgOkTitle': 'Org-Export bereit',
  'adm.b.exp.orgOkText': 'Der Organisationsexport wurde erfolgreich erstellt.',
  'adm.b.exp.orgFailTitle': 'Org-Export fehlgeschlagen',
  'adm.b.exp.orgFailText': 'Der Organisationsexport konnte nicht erstellt werden.',

  'adm.b.anon.missingIdCheck': 'Bitte User-ID für die Prüfung eingeben.',
  'adm.b.anon.missingIdExec': 'Bitte User-ID für die Anonymisierung eingeben.',
  'adm.b.anon.checkErr': 'Fehler bei der Prüfung.',
  'adm.b.anon.checkFailTitle': 'Prüfung fehlgeschlagen',
  'adm.b.anon.checkFailText': 'Die Anonymisierungsprüfung konnte nicht ausgeführt werden.',
  'adm.b.anon.possible': 'Anonymisierung möglich — keine Blocker gefunden.',
  'adm.b.anon.blocked': 'Anonymisierung blockiert:',
  'adm.b.anon.checkDoneTitle': 'Prüfung abgeschlossen',
  'adm.b.anon.allowedText': 'Die Anonymisierung ist für diesen Nutzer aktuell zulässig.',
  'adm.b.anon.blockedText': 'Die Anonymisierung ist aktuell blockiert. Details stehen im Prüfprotokoll.',
  'adm.b.anon.execConfirm': 'ACHTUNG: Die Anonymisierung von User {id}… ist UNWIDERRUFLICH.\n\nFortfahren?',
  'adm.b.anon.err': 'Fehler bei der Anonymisierung.',
  'adm.b.anon.okTitle': 'Anonymisierung abgeschlossen',
  'adm.b.anon.okText': 'Der Nutzer wurde erfolgreich anonymisiert.',
  'adm.b.anon.failTitle': 'Anonymisierung fehlgeschlagen',
  'adm.b.anon.failText': 'Die Anonymisierung konnte nicht durchgeführt werden.',

  'adm.b.form.okTitle': 'Anfrage erstellt',
  'adm.b.form.okText': 'Die DSGVO-Anfrage wurde erfolgreich angelegt.',
  'adm.b.form.failTitle': 'Anfrage fehlgeschlagen',
  'adm.b.form.failText': 'Die DSGVO-Anfrage konnte nicht erstellt werden.'
});
TCi18n.register('en', {
  'adm.b.docTitle': 'Trust Center – TempConnect',
  'adm.b.page.title': 'Trust Center',
  'adm.b.page.subtitle': 'Legal, privacy, security, compliance and governance.',
  'adm.b.page.newRequest': '+ New GDPR request',
  'adm.b.page.newRequestTitle': 'Create a GDPR data-subject request: data export (Art. 15/20), erasure (Art. 17), rectification (Art. 16) or restriction (Art. 18) for a user, worker or organisation.',

  'adm.b.onb.label': 'Set up the platform',
  'adm.b.onb.toggle': 'Expand / collapse',
  'adm.b.onb.dismiss': 'Hide',

  'adm.b.hub.current': 'Trust Center',
  'adm.b.hub.currentDesc': 'You are in the Trust Center.',
  'adm.b.hub.imprint': 'Legal notice',
  'adm.b.hub.imprintDesc': 'Provider information required by law.',
  'adm.b.hub.terms': 'Terms, annex 1',
  'adm.b.hub.termsDesc': 'General terms and conditions plus annexes.',
  'adm.b.hub.privacy': 'Privacy',
  'adm.b.hub.privacyDesc': 'Privacy notice and processing information.',
  'adm.b.hub.security': 'Security',
  'adm.b.hub.securityDesc': 'Security measures, penetration tests and certifications.',
  'adm.b.hub.about': 'About us',
  'adm.b.hub.aboutDesc': 'Company, team and mission of TempConnect.',
  'adm.b.hub.sla': 'SLA',
  'adm.b.hub.slaDesc': 'Service level agreements and availability guarantees.',
  'adm.b.hub.governance': 'GDPR data governance',
  'adm.b.hub.governanceDesc': 'Data inventory, erasure requests, retention and anonymisation.',
  'adm.b.hub.api': 'API documentation',
  'adm.b.hub.apiDesc': 'REST API reference, endpoints and integration guides.',

  'adm.b.tab.inventory': 'Data inventory',
  'adm.b.tab.requests': 'GDPR requests',
  'adm.b.tab.retention': 'Retention',
  'adm.b.tab.actions': 'Export & anonymisation',

  'adm.b.state.loading': 'Loading…',
  'adm.b.filter.status': 'Status',
  'adm.b.filter.type': 'Type',
  'adm.b.filter.all': 'All',
  'adm.b.filter.pending': 'Open',
  'adm.b.filter.inProgress': 'In progress',
  'adm.b.filter.completed': 'Completed',
  'adm.b.filter.rejected': 'Rejected',
  'adm.b.filter.export': 'Export',
  'adm.b.filter.deletion': 'Erasure',
  'adm.b.filter.rectification': 'Rectification',
  'adm.b.filter.restriction': 'Restriction',
  'adm.b.filter.apply': 'Apply filters',

  'adm.b.inv.heading': 'Data categories under GDPR',
  'adm.b.inv.colCategory': 'Category',
  'adm.b.inv.colDescription': 'Description',
  'adm.b.inv.colTables': 'Tables',
  'adm.b.inv.colRetention': 'Retention',
  'adm.b.inv.loadFail': 'The data inventory could not be loaded right now.',
  'adm.b.inv.emptyAvail': 'No inventory data available.',
  'adm.b.inv.empty': 'No inventory data yet.',

  'adm.b.req.heading': 'GDPR requests',
  'adm.b.req.colType': 'Type',
  'adm.b.req.colSubject': 'Data subject',
  'adm.b.req.colCreated': 'Created',
  'adm.b.req.colStatus': 'Status',
  'adm.b.req.colHandler': 'Handled by',
  'adm.b.req.colActions': 'Actions',
  'adm.b.req.empty': 'No GDPR requests found.',
  'adm.b.req.complete': 'Complete',
  'adm.b.req.completeConfirm': 'Mark this request as completed?',
  'adm.b.req.completeOkTitle': 'Request completed',
  'adm.b.req.completeOkText': 'The GDPR request was completed successfully.',
  'adm.b.req.completeFailTitle': 'Completion failed',
  'adm.b.req.completeFailText': 'The GDPR request could not be completed.',

  'adm.b.ret.heading': 'Retention periods',
  'adm.b.ret.colTable': 'Table',
  'adm.b.ret.colPeriod': 'Period',
  'adm.b.ret.colReason': 'Legal basis',
  'adm.b.ret.colAffected': 'Affected',
  'adm.b.ret.colStatus': 'Status',
  'adm.b.ret.dryRun': 'Dry-run cleanup',
  'adm.b.ret.cleanup': 'Run cleanup',
  'adm.b.ret.empty': 'No retention data available.',
  'adm.b.ret.entries': '{count} entries',
  'adm.b.ret.expired': '{count} expired',
  'adm.b.ret.cleanupConfirm': 'Really run the retention cleanup? Deleted data cannot be restored!',
  'adm.b.ret.dryOkTitle': 'Dry run completed',
  'adm.b.ret.dryOkText': 'The retention simulation was created successfully.',
  'adm.b.ret.cleanupOkTitle': 'Cleanup completed',
  'adm.b.ret.cleanupOkText': 'The retention cleanup ran successfully.',
  'adm.b.ret.cleanupErr': 'Error during the cleanup.',
  'adm.b.ret.failTitle': 'Cleanup failed',
  'adm.b.ret.failText': 'The retention cleanup could not be executed.',

  'adm.b.act.exportUserHeading': 'User data export',
  'adm.b.act.exportUserInfo': 'Art. 15/20 GDPR — complete export of all personal data of a user as a JSON download.',
  'adm.b.act.userId': 'User ID',
  'adm.b.act.uuid': 'UUID',
  'adm.b.act.exportStart': 'Start export',
  'adm.b.act.exportOrgHeading': 'Organisation data export',
  'adm.b.act.exportOrgInfo': 'Full export of all organisation-related data for the privacy file.',
  'adm.b.act.exportOrgStart': 'Start org export',
  'adm.b.act.anonHeading': 'Anonymise user',
  'adm.b.act.anonWarn': 'Art. 17 GDPR — irreversible anonymisation. Category A data (PII) is overwritten, B anonymised, D deleted. Category C is retained.',
  'adm.b.act.check': 'Check',
  'adm.b.act.anonymize': 'Anonymise',

  'adm.b.modal.title': 'New GDPR request',
  'adm.b.modal.type': 'Request type *',
  'adm.b.modal.choose': 'Please choose',
  'adm.b.modal.typeExport': 'Data export (Art. 15/20)',
  'adm.b.modal.typeDeletion': 'Erasure (Art. 17)',
  'adm.b.modal.typeRectification': 'Rectification (Art. 16)',
  'adm.b.modal.typeRestriction': 'Restriction (Art. 18)',
  'adm.b.modal.subjectType': 'Data-subject type *',
  'adm.b.modal.subjectUser': 'User',
  'adm.b.modal.subjectWorker': 'Worker',
  'adm.b.modal.subjectOrg': 'Organisation',
  'adm.b.modal.subjectId': 'Data-subject ID',
  'adm.b.modal.subjectIdPh': 'UUID (optional)',
  'adm.b.modal.notes': 'Notes',
  'adm.b.modal.notesPh': 'Further details…',
  'adm.b.modal.cancel': 'Cancel',
  'adm.b.modal.submit': 'Create request',

  'adm.b.access.fallback': 'GDPR governance is currently not enabled for this role.',
  'adm.b.access.hiddenTitle': 'GDPR governance hidden',
  'adm.b.access.requestsHidden': 'GDPR requests stay hidden for this role.',
  'adm.b.access.retentionHidden': 'Retention stays hidden for this role.',
  'adm.b.access.limitedTitle': 'GDPR governance limited',
  'adm.b.access.limitedText': 'Individual governance actions stay controlled for this role.',
  'adm.b.error.network': 'Network error or server unreachable.',

  'adm.b.exp.missingIdTitle': 'User ID missing',
  'adm.b.exp.missingIdExport': 'Please enter a user ID for the export.',
  'adm.b.exp.userOkTitle': 'User export ready',
  'adm.b.exp.userOkText': 'The user export was created successfully.',
  'adm.b.exp.userFailTitle': 'User export failed',
  'adm.b.exp.userFailText': 'The user export could not be created.',
  'adm.b.exp.orgOkTitle': 'Org export ready',
  'adm.b.exp.orgOkText': 'The organisation export was created successfully.',
  'adm.b.exp.orgFailTitle': 'Org export failed',
  'adm.b.exp.orgFailText': 'The organisation export could not be created.',

  'adm.b.anon.missingIdCheck': 'Please enter a user ID for the check.',
  'adm.b.anon.missingIdExec': 'Please enter a user ID for the anonymisation.',
  'adm.b.anon.checkErr': 'Error during the check.',
  'adm.b.anon.checkFailTitle': 'Check failed',
  'adm.b.anon.checkFailText': 'The anonymisation check could not be executed.',
  'adm.b.anon.possible': 'Anonymisation possible — no blockers found.',
  'adm.b.anon.blocked': 'Anonymisation blocked:',
  'adm.b.anon.checkDoneTitle': 'Check completed',
  'adm.b.anon.allowedText': 'Anonymisation is currently permitted for this user.',
  'adm.b.anon.blockedText': 'Anonymisation is currently blocked. Details are in the check log.',
  'adm.b.anon.execConfirm': 'WARNING: anonymising user {id}… is IRREVERSIBLE.\n\nContinue?',
  'adm.b.anon.err': 'Error during the anonymisation.',
  'adm.b.anon.okTitle': 'Anonymisation completed',
  'adm.b.anon.okText': 'The user was anonymised successfully.',
  'adm.b.anon.failTitle': 'Anonymisation failed',
  'adm.b.anon.failText': 'The anonymisation could not be carried out.',

  'adm.b.form.okTitle': 'Request created',
  'adm.b.form.okText': 'The GDPR request was created successfully.',
  'adm.b.form.failTitle': 'Request failed',
  'adm.b.form.failText': 'The GDPR request could not be created.'
});

(function() {
  'use strict';

  var csrfToken = '';
  var currentMe = null;
  var governanceAccess = {
    canRead: false,
    canWrite: false,
    canExport: false,
    canAnonymize: false,
    canRetention: false,
    canRequests: false,
    mode: 'hidden',
    reason: ''
  };
  var GOVERNANCE_FILTER_STORAGE_KEY = 'tc.dataGovernance.filters.v1';

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function resolveSurfaceAccess(me, key) {
    if (window.TC && window.TC.surfaceAccess && typeof window.TC.surfaceAccess.resolve === 'function') {
      return window.TC.surfaceAccess.resolve(me, key) || { canRead: false, canWrite: false, mode: 'hidden', reason: '' };
    }
    return { canRead: false, canWrite: false, mode: 'hidden', reason: '' };
  }

  function renderGovernanceState(tone, title, text) {
    var el = document.getElementById('dataGovernanceState');
    if (!el) return;
    if (!title && !text) {
      el.className = 'page-state';
      el.innerHTML = '';
      el.style.display = 'none';
      return;
    }
    el.className = 'page-state page-state--' + (tone || 'info');
    el.innerHTML = '<div class="page-state__title">' + esc(title || '') + '</div><div class="page-state__text">' + esc(text || '') + '</div>';
    el.style.display = '';
  }

  function sectionMessage(text) {
    return '<div class="empty-state">' + esc(text) + '</div>';
  }

  function describeGovernanceAccess(access) {
    if (!access || access.canRead) return '';
    return access.reason || TCi18n.t('adm.b.access.fallback');
  }

  function allowedTabs() {
    var tabs = ['inventory'];
    if (governanceAccess.canRequests) tabs.push('requests');
    if (governanceAccess.canRetention) tabs.push('retention');
    if (governanceAccess.canExport || governanceAccess.canAnonymize) tabs.push('actions');
    return tabs;
  }

  function firstAllowedTab() {
    var tabs = allowedTabs();
    return tabs.length ? tabs[0] : 'inventory';
  }

  function isTabAllowed(name) {
    return allowedTabs().indexOf(name) !== -1;
  }

  function syncTabVisibility() {
    var tabConfig = [
      { name: 'inventory', tabId: 'dataGovernanceTabInventory', panelId: 'panel-inventory', allowed: governanceAccess.canRead },
      { name: 'requests', tabId: 'dataGovernanceTabRequests', panelId: 'panel-requests', allowed: governanceAccess.canRequests },
      { name: 'retention', tabId: 'dataGovernanceTabRetention', panelId: 'panel-retention', allowed: governanceAccess.canRetention },
      { name: 'actions', tabId: 'dataGovernanceTabActions', panelId: 'panel-actions', allowed: governanceAccess.canExport || governanceAccess.canAnonymize }
    ];
    tabConfig.forEach(function(item) {
      var tab = document.getElementById(item.tabId);
      var panel = document.getElementById(item.panelId);
      if (tab) tab.style.display = item.allowed ? '' : 'none';
      if (panel) panel.style.display = item.allowed ? '' : 'none';
    });
  }

  function syncActionVisibility() {
    var requestButton = document.getElementById('dataGovernanceRequestButton');
    if (requestButton) requestButton.style.display = governanceAccess.canRequests ? '' : 'none';

    var retentionButtons = [
      document.getElementById('dataGovernanceRetentionDryRunButton'),
      document.getElementById('dataGovernanceRetentionCleanupButton')
    ];
    retentionButtons.forEach(function(button) {
      if (button) button.disabled = !governanceAccess.canRetention;
    });

    var exportUserSection = document.getElementById('dataGovernanceExportUserSection');
    var exportOrgSection = document.getElementById('dataGovernanceExportOrgSection');
    var anonymizeSection = document.getElementById('dataGovernanceAnonymizeSection');
    if (exportUserSection) exportUserSection.style.display = governanceAccess.canExport ? '' : 'none';
    if (exportOrgSection) exportOrgSection.style.display = governanceAccess.canExport ? '' : 'none';
    if (anonymizeSection) anonymizeSection.style.display = governanceAccess.canAnonymize ? '' : 'none';

    var exportButtons = [
      document.getElementById('dataGovernanceExportUserButton'),
      document.getElementById('dataGovernanceExportOrgButton')
    ];
    exportButtons.forEach(function(button) {
      if (button) button.disabled = !governanceAccess.canExport;
    });

    var anonymizeButtons = [
      document.getElementById('dataGovernanceCheckAnonButton'),
      document.getElementById('dataGovernanceExecAnonButton')
    ];
    anonymizeButtons.forEach(function(button) {
      if (button) button.disabled = !governanceAccess.canAnonymize;
    });
  }

  function applyGovernanceAccess() {
    syncTabVisibility();
    syncActionVisibility();
    if (!governanceAccess.canRead) {
      renderGovernanceState('info', TCi18n.t('adm.b.access.hiddenTitle'), describeGovernanceAccess(governanceAccess));
      document.getElementById('catGrid').innerHTML = sectionMessage(describeGovernanceAccess(governanceAccess));
      document.getElementById('catTable').innerHTML = '<tr><td colspan="4" class="empty-state">' + esc(describeGovernanceAccess(governanceAccess)) + '</td></tr>';
      document.getElementById('reqTable').innerHTML = '<tr><td colspan="6" class="empty-state">' + esc(TCi18n.t('adm.b.access.requestsHidden')) + '</td></tr>';
      document.getElementById('retTable').innerHTML = '<tr><td colspan="5" class="empty-state">' + esc(TCi18n.t('adm.b.access.retentionHidden')) + '</td></tr>';
      document.getElementById('cleanupResult').style.display = 'none';
      document.getElementById('anonResult').style.display = 'none';
      return false;
    }
    if (governanceAccess.mode === 'read_only') {
      renderGovernanceState('info', TCi18n.t('adm.b.access.limitedTitle'), governanceAccess.reason || TCi18n.t('adm.b.access.limitedText'));
    } else {
      renderGovernanceState();
    }
    return true;
  }

  async function getCsrf() {
    if (csrfToken) return csrfToken;
    try {
      var response = await fetch('/api/csrf', { credentials: 'include' });
      if (!response.ok) return '';
      var payload = await response.json();
      csrfToken = payload.token || payload.csrfToken || '';
    } catch (_err) {
      return '';
    }
    return csrfToken;
  }

  async function api(path, opts) {
    var options = Object.assign({ credentials: 'include' }, opts || {});
    var method = String(options.method || 'GET').toUpperCase();
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      var headers = Object.assign({}, options.headers || {});
      headers['Content-Type'] = 'application/json';
      if (method !== 'GET' && method !== 'HEAD') {
        headers['x-csrf-token'] = await getCsrf();
      }
      options.headers = headers;
      options.body = JSON.stringify(options.body);
    }
    try {
      var response = await fetch('/api' + path, options);
      if (response.status === 401) {
        location.href = '/';
        return null;
      }
      var contentType = response.headers.get('content-type') || '';
      var payload = null;
      if (contentType.indexOf('application/json') !== -1) {
        try { payload = await response.json(); } catch (_err) { payload = null; }
      } else {
        try { payload = await response.text(); } catch (_err2) { payload = null; }
      }
      if (!response.ok) {
        return { _error: true, status: response.status, payload: payload };
      }
      return payload;
    } catch (_err3) {
      return { _error: true, status: 0, payload: { error: TCi18n.t('adm.b.error.network') } };
    }
  }

  function parseApiError(result, fallback) {
    if (!result) return fallback;
    var payload = result._error ? (result.payload || {}) : result;
    if (typeof payload === 'string' && payload) return payload;
    if (payload && typeof payload.error === 'string' && payload.error) return payload.error;
    if (payload && typeof payload.message === 'string' && payload.message) return payload.message;
    if (payload && Array.isArray(payload.details) && payload.details.length) return payload.details.join(', ');
    if (payload && typeof payload.details === 'string' && payload.details) return payload.details;
    return fallback;
  }
  function readStoredGovernanceFilters() {
    try {
      var raw = sessionStorage.getItem(GOVERNANCE_FILTER_STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) { return {}; }
  }
  function writeStoredGovernanceFilters(filters) {
    try { sessionStorage.setItem(GOVERNANCE_FILTER_STORAGE_KEY, JSON.stringify(filters || {})); }
    catch (e) { /* Session-Storage kann lokal blockiert sein. */ }
  }
  function readUrlGovernanceFilters() {
    var params = new URLSearchParams(window.location.search || '');
    var filters = {};
    if (params.has('tab')) filters.tab = params.get('tab') || '';
    if (params.has('request_status')) filters.requestStatus = params.get('request_status') || '';
    if (params.has('request_type')) filters.requestType = params.get('request_type') || '';
    return filters;
  }
  function currentGovernanceTab() {
    var active = document.querySelector('.tab.active');
    return active ? active.dataset.tab : '';
  }
  function persistGovernanceFilters(overrides) {
    var statusEl = document.getElementById('fReqStatus');
    var typeEl = document.getElementById('fReqType');
    var status = overrides && Object.prototype.hasOwnProperty.call(overrides, 'requestStatus')
      ? overrides.requestStatus
      : (statusEl ? statusEl.value : '');
    var type = overrides && Object.prototype.hasOwnProperty.call(overrides, 'requestType')
      ? overrides.requestType
      : (typeEl ? typeEl.value : '');
    var tab = overrides && Object.prototype.hasOwnProperty.call(overrides, 'tab')
      ? overrides.tab
      : currentGovernanceTab();
    writeStoredGovernanceFilters({ tab: tab || '', requestStatus: status || '', requestType: type || '' });
  }
  function applyGovernanceFilterDefaults() {
    var urlFilters = readUrlGovernanceFilters();
    var hasUrlFilters = Object.keys(urlFilters).length > 0;
    var stored = hasUrlFilters ? {} : readStoredGovernanceFilters();
    var status = urlFilters.requestStatus || stored.requestStatus || '';
    var type = urlFilters.requestType || stored.requestType || '';
    var statusEl = document.getElementById('fReqStatus');
    var typeEl = document.getElementById('fReqType');
    if (statusEl) statusEl.value = status || '';
    if (typeEl) typeEl.value = type || '';
    return { tab: urlFilters.tab || stored.tab || '' };
  }

  function downloadJson(payload, fileName) {
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(function() {
      URL.revokeObjectURL(link.href);
      link.remove();
    }, 1500);
  }

  function switchTab(name, persist) {
    var shouldPersist = persist !== false;
    var nextTab = isTabAllowed(name) ? name : firstAllowedTab();
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function(tab) {
      tab.classList.toggle('active', tab.dataset.tab === nextTab);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tab-panel'), function(panel) {
      panel.classList.toggle('active', panel.id === 'panel-' + nextTab);
    });
    if (shouldPersist) persistGovernanceFilters({ tab: nextTab });
    if (nextTab === 'requests') loadRequests(false);
    if (nextTab === 'retention') loadRetention();
  }

  function renderInventory(inv) {
    if (!inv || !inv.categories) {
      document.getElementById('catGrid').innerHTML = sectionMessage(TCi18n.t('adm.b.inv.loadFail'));
      document.getElementById('catTable').innerHTML = '<tr><td colspan="4" class="empty-state">' + esc(TCi18n.t('adm.b.inv.emptyAvail')) + '</td></tr>';
      return;
    }
    var cats = inv.categories;
    var keys = Object.keys(cats);
    document.getElementById('catGrid').innerHTML = keys.length ? keys.map(function(k) {
      var c = cats[k];
      var tagClass = 'cat-' + k.toLowerCase().replace('kategorie_', '');
      return '<div class="kpi-tile"><span class="kpi-val"><span class="cat-tag ' + tagClass + '">' + esc(k) + '</span></span><span class="kpi-label">' + esc(c.label) + '</span></div>';
    }).join('') : sectionMessage(TCi18n.t('adm.b.inv.empty'));

    document.getElementById('catTable').innerHTML = keys.length ? keys.map(function(k) {
      var c = cats[k];
      var tagClass = 'cat-' + k.toLowerCase().replace('kategorie_', '');
      return '<tr><td><span class="cat-tag ' + tagClass + '">' + esc(k) + '</span> ' + esc(c.label) + '</td>' +
        '<td>' + esc(c.description || '–') + '</td>' +
        '<td style="font-size:11px">' + (c.tables || []).map(function(t) { return esc(t); }).join(', ') + '</td>' +
        '<td>' + esc(c.retention || '–') + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="empty-state">' + esc(TCi18n.t('adm.b.inv.empty')) + '</td></tr>';
  }

  async function loadInventory() {
    if (!governanceAccess.canRead) return;
    var result = await api('/data-governance/inventory');
    if (!result || result._error || !result.data) {
      renderInventory(null);
      return;
    }
    renderInventory(result.data);
  }

  async function loadRequests(persist) {
    var shouldPersist = persist !== false;
    var tbody = document.getElementById('reqTable');
    if (!governanceAccess.canRequests) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">' + esc(TCi18n.t('adm.b.access.requestsHidden')) + '</td></tr>';
      return;
    }
    var qs = '?limit=100';
    var status = document.getElementById('fReqStatus').value;
    var type = document.getElementById('fReqType').value;
    if (shouldPersist) persistGovernanceFilters({ requestStatus: status || '', requestType: type || '' });
    if (status) qs += '&status=' + encodeURIComponent(status);
    if (type) qs += '&request_type=' + encodeURIComponent(type);
    var result = await api('/data-governance/requests' + qs);
    if (!result || result._error || !result.data || !result.data.items || !result.data.items.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">' + esc(TCi18n.t('adm.b.req.empty')) + '</td></tr>';
      return;
    }
    tbody.innerHTML = result.data.items.map(function(item) {
      var badge = '<span class="badge badge-' + item.status + '">' + esc(item.status) + '</span>';
      var created = item.created_at ? item.created_at.slice(0, 10) : '–';
      var actions = '';
      if ((item.status === 'pending' || item.status === 'in_progress') && governanceAccess.canRequests) {
        actions = '<button class="btn" style="padding:2px 8px;font-size:11px" onclick="completeReq(\'' + item.id + '\')">' + esc(TCi18n.t('adm.b.req.complete')) + '</button>';
      }
      return '<tr><td>' + esc(item.request_type) + '</td><td>' + esc(item.subject_type) + (item.subject_id ? ' ' + esc(item.subject_id.slice(0, 8)) + '…' : '') + '</td>' +
        '<td>' + created + '</td><td>' + badge + '</td><td>' + esc(item.completed_by_name || '–') + '</td><td>' + actions + '</td></tr>';
    }).join('');
  }

  async function completeReq(id) {
    if (!governanceAccess.canRequests) return;
    if (!confirm(TCi18n.t('adm.b.req.completeConfirm'))) return;
    var result = await api('/data-governance/requests/' + id + '/complete', { method: 'PATCH', body: { result_summary: { completed_manually: true } } });
    if (result && !result._error) {
      renderGovernanceState('good', TCi18n.t('adm.b.req.completeOkTitle'), TCi18n.t('adm.b.req.completeOkText'));
      loadRequests();
    } else {
      renderGovernanceState('bad', TCi18n.t('adm.b.req.completeFailTitle'), parseApiError(result, TCi18n.t('adm.b.req.completeFailText')));
    }
  }

  async function loadRetention() {
    var tbody = document.getElementById('retTable');
    if (!governanceAccess.canRetention) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">' + esc(TCi18n.t('adm.b.access.retentionHidden')) + '</td></tr>';
      return;
    }
    var result = await api('/data-governance/retention/status');
    if (!result || result._error || !result.data) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">' + esc(TCi18n.t('adm.b.ret.empty')) + '</td></tr>';
      return;
    }
    var policies = result.data.policies || {};
    var status = result.data.status || {};
    var keys = Object.keys(policies);
    tbody.innerHTML = keys.length ? keys.map(function(key) {
      var policy = policies[key];
      var state = status[key] || {};
      var pct = state.total > 0 ? Math.round((state.expired || 0) / state.total * 100) : 0;
      var color = pct > 20 ? 'var(--bad)' : pct > 5 ? 'var(--warn)' : 'var(--good)';
      return '<tr><td><strong>' + esc(key) + '</strong></td><td>' + esc(policy.retention || '–') + '</td><td style="font-size:12px">' + esc(policy.legal_basis || '–') + '</td>' +
        '<td>' + esc(TCi18n.t('adm.b.ret.entries', { count: state.total || 0 })) + '</td>' +
        '<td><div style="font-size:11px;font-weight:600">' + esc(TCi18n.t('adm.b.ret.expired', { count: state.expired || 0 })) + '</div><div class="retention-bar"><div class="retention-fill" style="width:' + pct + '%;background:' + color + '"></div></div></td></tr>';
    }).join('') : '<tr><td colspan="5" class="empty-state">' + esc(TCi18n.t('adm.b.ret.empty')) + '</td></tr>';
  }

  async function runRetentionCleanup(dryRun) {
    if (!governanceAccess.canRetention) return;
    if (!dryRun && !confirm(TCi18n.t('adm.b.ret.cleanupConfirm'))) return;
    var result = await api('/data-governance/retention/cleanup', { method: 'POST', body: { dry_run: dryRun } });
    var output = document.getElementById('cleanupResult');
    output.style.display = 'block';
    if (result && !result._error) {
      output.textContent = JSON.stringify(result.data, null, 2);
      renderGovernanceState('good', TCi18n.t(dryRun ? 'adm.b.ret.dryOkTitle' : 'adm.b.ret.cleanupOkTitle'), TCi18n.t(dryRun ? 'adm.b.ret.dryOkText' : 'adm.b.ret.cleanupOkText'));
      if (!dryRun) loadRetention();
    } else {
      output.textContent = parseApiError(result, TCi18n.t('adm.b.ret.cleanupErr'));
      renderGovernanceState('bad', TCi18n.t('adm.b.ret.failTitle'), parseApiError(result, TCi18n.t('adm.b.ret.failText')));
    }
  }

  async function exportUser() {
    if (!governanceAccess.canExport) return;
    var userId = document.getElementById('exportUserId').value.trim();
    if (!userId) {
      renderGovernanceState('warn', TCi18n.t('adm.b.exp.missingIdTitle'), TCi18n.t('adm.b.exp.missingIdExport'));
      return;
    }
    var result = await api('/data-governance/export/user/' + encodeURIComponent(userId));
    if (result && !result._error) {
      downloadJson(result.data, 'dsgvo-export-user-' + userId.slice(0, 8) + '.json');
      renderGovernanceState('good', TCi18n.t('adm.b.exp.userOkTitle'), TCi18n.t('adm.b.exp.userOkText'));
    } else {
      renderGovernanceState('bad', TCi18n.t('adm.b.exp.userFailTitle'), parseApiError(result, TCi18n.t('adm.b.exp.userFailText')));
    }
  }

  async function exportOrg() {
    if (!governanceAccess.canExport) return;
    var result = await api('/data-governance/export/org');
    if (result && !result._error) {
      downloadJson(result.data, 'dsgvo-export-org.json');
      renderGovernanceState('good', TCi18n.t('adm.b.exp.orgOkTitle'), TCi18n.t('adm.b.exp.orgOkText'));
    } else {
      renderGovernanceState('bad', TCi18n.t('adm.b.exp.orgFailTitle'), parseApiError(result, TCi18n.t('adm.b.exp.orgFailText')));
    }
  }

  async function checkAnon() {
    if (!governanceAccess.canAnonymize) return;
    var userId = document.getElementById('anonUserId').value.trim();
    if (!userId) {
      renderGovernanceState('warn', TCi18n.t('adm.b.exp.missingIdTitle'), TCi18n.t('adm.b.anon.missingIdCheck'));
      return;
    }
    var result = await api('/data-governance/anonymize/user/' + encodeURIComponent(userId) + '/check');
    var output = document.getElementById('anonResult');
    output.style.display = 'block';
    if (!result || result._error) {
      output.textContent = parseApiError(result, TCi18n.t('adm.b.anon.checkErr'));
      renderGovernanceState('bad', TCi18n.t('adm.b.anon.checkFailTitle'), parseApiError(result, TCi18n.t('adm.b.anon.checkFailText')));
      return;
    }
    output.textContent = result.data.can_delete
      ? '✓ ' + TCi18n.t('adm.b.anon.possible')
      : '✗ ' + TCi18n.t('adm.b.anon.blocked') + '\n' + JSON.stringify(result.data.blockers, null, 2);
    renderGovernanceState('info', TCi18n.t('adm.b.anon.checkDoneTitle'), TCi18n.t(result.data.can_delete ? 'adm.b.anon.allowedText' : 'adm.b.anon.blockedText'));
  }

  async function execAnon() {
    if (!governanceAccess.canAnonymize) return;
    var userId = document.getElementById('anonUserId').value.trim();
    if (!userId) {
      renderGovernanceState('warn', TCi18n.t('adm.b.exp.missingIdTitle'), TCi18n.t('adm.b.anon.missingIdExec'));
      return;
    }
    if (!confirm(TCi18n.t('adm.b.anon.execConfirm', { id: userId.slice(0, 8) }))) return;
    var result = await api('/data-governance/anonymize/user/' + encodeURIComponent(userId), { method: 'POST' });
    var output = document.getElementById('anonResult');
    output.style.display = 'block';
    if (result && !result._error) {
      output.textContent = JSON.stringify(result.data, null, 2);
      renderGovernanceState('good', TCi18n.t('adm.b.anon.okTitle'), TCi18n.t('adm.b.anon.okText'));
    } else {
      output.textContent = parseApiError(result, TCi18n.t('adm.b.anon.err'));
      renderGovernanceState('bad', TCi18n.t('adm.b.anon.failTitle'), parseApiError(result, TCi18n.t('adm.b.anon.failText')));
    }
  }

  function openRequestModal() {
    if (!governanceAccess.canRequests) return;
    document.getElementById('modalOverlay').style.display = 'flex';
  }

  function closeModal() {
    document.getElementById('modalOverlay').style.display = 'none';
    document.getElementById('reqForm').reset();
  }

  async function submitRequest(event) {
    event.preventDefault();
    if (!governanceAccess.canRequests) return false;
    var result = await api('/data-governance/requests', {
      method: 'POST',
      body: {
        request_type: document.getElementById('fmType').value,
        subject_type: document.getElementById('fmSubjectType').value,
        subject_id: document.getElementById('fmSubjectId').value.trim() || null,
        notes: document.getElementById('fmNotes').value.trim() || null
      }
    });
    if (result && !result._error) {
      closeModal();
      renderGovernanceState('good', TCi18n.t('adm.b.form.okTitle'), TCi18n.t('adm.b.form.okText'));
      switchTab('requests');
    } else {
      renderGovernanceState('bad', TCi18n.t('adm.b.form.failTitle'), parseApiError(result, TCi18n.t('adm.b.form.failText')));
    }
    return false;
  }

  async function init() {
    currentMe = await api('/me');
    governanceAccess = resolveSurfaceAccess(currentMe, 'data_governance');
    if (!applyGovernanceAccess()) return;
    await loadInventory();
    var defaults = applyGovernanceFilterDefaults();
    var initialTab = defaults.tab && isTabAllowed(defaults.tab) ? defaults.tab : firstAllowedTab();
    switchTab(initialTab, false);
  }

  window.switchTab = switchTab;
  window.loadRequests = loadRequests;
  window.completeReq = completeReq;
  window.loadRetention = loadRetention;
  window.runRetentionCleanup = runRetentionCleanup;
  window.exportUser = exportUser;
  window.exportOrg = exportOrg;
  window.checkAnon = checkAnon;
  window.execAnon = execAnon;
  window.openRequestModal = openRequestModal;
  window.closeModal = closeModal;
  window.submitRequest = submitRequest;

  /* Sprachwechsel: die per innerHTML gebauten Flaechen (Inventar, Anfragen,
     Retention, Statusbanner) traegt die deklarative Hydration nicht — sie
     werden hier gezielt neu aufgebaut, sonst bliebe die halbe Seite deutsch. */
  document.addEventListener('tc:langchange', function () {
    if (!applyGovernanceAccess()) return;
    loadInventory();
    var tab = currentGovernanceTab();
    if (tab === 'requests') loadRequests(false);
    if (tab === 'retention') loadRetention();
  });

  init();
})();
