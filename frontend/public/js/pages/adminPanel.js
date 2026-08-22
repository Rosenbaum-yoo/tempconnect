/* ═══════════════════════════════════════════════════════
   Admin Panel — Control Center Logic
   ═══════════════════════════════════════════════════════ */

/* ── Woerterbuch (P6.1, DE/EN) — Namensraum adm.a. ─────────────────────────
   Traegt admin_panel.html UND dieses Modul. i18n.js liegt im head der Seite,
   TCi18n ist hier also garantiert vorhanden.

   Bewusst NICHT uebersetzt:
   - Server-Enums und Rohwerte (SENT, ACCEPTED, SUCCESS, DENIED, company,
     agency, DEMO, BASIS, ...), die zugleich als option-value dienen
   - Titel, Beschreibungen, Badges und Roadmap-Eintraege aus
     /admin/control-center — die Wahrheit liegt im Backend
   - rollenabhaengige Begriffe aus terminologyLabels.js (Arbeitsplatzangebot,
     Personalangebot, Angebot): die Seite ist fuer company UND agency
     erreichbar, ein fester Woerterbuch-Wert waere fuer eine der beiden
     Seiten falsch. Diese Stellen bleiben bewusst deutsch.
   - alles aus pageShell.js (Topbar, Navigation, Nutzerbereich)                */
TCi18n.register('de', {
  'adm.a.docTitle': 'Admin Panel – TempConnect',
  'adm.a.page.title': 'Admin Panel',
  'adm.a.page.subtitle': 'Benutzer, Organisationen, Audit-Log und Plattform-Metriken.',
  'adm.a.onb.label': 'Plattform einrichten',
  'adm.a.onb.toggle': 'Auf-/Zuklappen',
  'adm.a.onb.dismiss': 'Ausblenden',
  'adm.a.ws.title': 'Plattform-Arbeitsbereich',
  'adm.a.ws.subtitle': 'Operative Plattformsteuerung für freigeschaltete Admin-Bereiche.',

  'adm.a.tab.users': 'Benutzer',
  'adm.a.tab.orgs': 'Organisationen',
  'adm.a.tab.activity': 'Aktivitäten',
  'adm.a.tab.requests': 'Requests',
  'adm.a.tab.audit': 'Audit-Log',
  'adm.a.tab.metrics': 'Metriken',
  'adm.a.tab.strategic': 'Kooperationsanfragen',
  'adm.a.tab.revenue': 'Revenue',
  'adm.a.tab.features': 'Feature-Flags',
  'adm.a.tab.releases': 'Produkt-Updates',

  'adm.a.filter.apply': 'Filtern',
  'adm.a.filter.allStatus': 'Alle Status',
  'adm.a.filter.from': 'Von',
  'adm.a.filter.to': 'Bis',
  'adm.a.common.yes': 'Ja',
  'adm.a.common.no': 'Nein',
  'adm.a.common.save': 'Speichern',
  'adm.a.common.details': 'Details',
  'adm.a.common.error': 'Fehler',
  'adm.a.common.unknown': 'Unbekannt',
  'adm.a.paging.prev': 'Zurück',
  'adm.a.paging.next': 'Weiter',
  'adm.a.plan.individuell': 'Individueller Tarif',

  'adm.a.ctx.title': 'Admin-Zentrale',
  'adm.a.ctx.desc': 'Bestehende Plattformlogik, Card-States und klare Soft-Locks statt globalem Totalsperrer.',
  'adm.a.ctx.users': 'Benutzer',
  'adm.a.ctx.orgs': 'Organisationen',
  'adm.a.ctx.plan': 'Plan',
  'adm.a.ctx.org': 'Organisation',
  'adm.a.ctx.noOrg': 'keine Organisation',
  'adm.a.ctx.role': 'Rolle',
  'adm.a.ctx.backlog': 'Backlog',
  'adm.a.ctx.audit30': 'Audit 30 Tage',
  'adm.a.roadmap.title': 'Priorisierte Ausbaufolge',
  'adm.a.roadmap.desc': 'Starke Cards zuerst, bewusst kontrollierte Bereiche danach.',
  'adm.a.banner.title': 'Per-Card-Zugriff aktiv',
  'adm.a.banner.desc': 'Die Zentrale bleibt sichtbar, aber operative Plattformbereiche werden bewusst pro Card freigeschaltet oder soft-gelockt.',
  'adm.a.banner.toOrg': 'Zum Organisationsbereich',
  'adm.a.banner.toExec': 'Zum Executive Dashboard',
  'adm.a.banner.bootFailTitle': 'Admin-Zentrale derzeit nicht verfügbar',
  'adm.a.banner.bootFailText': 'Bootstrap konnte nicht geladen werden.',

  'adm.a.card.admin': 'Admin-Übersicht',
  'adm.a.card.adminDesc': 'Vollzugriff nur für Admins und Plattformverantwortliche.',
  'adm.a.card.usersOrgs': 'Benutzer & Organisationen',
  'adm.a.card.usersOrgsDesc': 'Verwaltung aller Nutzer, Rollen und Organisationen.',
  'adm.a.card.auditLog': 'Audit-Log',
  'adm.a.card.auditLogDesc': 'Plattformweite Aktivitäten und unveränderlicher Prüfpfad.',
  'adm.a.card.metrics': 'Plattform-Metriken',
  'adm.a.card.metricsDesc': 'Nutzungs- und Performance-Kennzahlen der Gesamtplattform.',
  'adm.a.card.sso': 'SSO / SAML',
  'adm.a.card.ssoDesc': 'Unternehmensweite Single-Sign-On-Konfiguration.',
  'adm.a.card.workflows': 'Workflows & Automatisierung',
  'adm.a.card.workflowsDesc': 'Prozessautomatisierung und Benachrichtigungsflows.',

  'adm.a.users.searchPh': 'Benutzer suchen (Name, E-Mail, Firma)…',
  'adm.a.users.search': 'Suchen',
  'adm.a.users.loading': 'Lade Benutzer…',
  'adm.a.users.empty': 'Keine Benutzer gefunden.',
  'adm.a.users.colEmail': 'E-Mail',
  'adm.a.users.colCompany': 'Firma',
  'adm.a.users.colOrg': 'Organisation',
  'adm.a.users.colOrgRole': 'Org-Rolle',
  'adm.a.users.colPlan': 'Plan',
  'adm.a.users.colVerified': 'Verifiziert',
  'adm.a.users.colActions': 'Aktionen',
  'adm.a.users.verify': 'Verifizieren',
  'adm.a.users.deactivate': 'Deaktivieren',
  'adm.a.users.loadFail': 'Benutzer konnten nicht geladen werden.',
  'adm.a.users.deactivateConfirm': 'Benutzer wirklich deaktivieren?',
  'adm.a.users.deactivateFail': 'Deaktivierung fehlgeschlagen',

  'adm.a.orgs.loading': 'Lade Organisationen…',
  'adm.a.orgs.empty': 'Keine Organisationen.',
  'adm.a.orgs.colName': 'Name',
  'adm.a.orgs.colType': 'Typ',
  'adm.a.orgs.colPlan': 'Plan',
  'adm.a.orgs.colMembers': 'Mitglieder',
  'adm.a.orgs.colLocations': 'Standorte',
  'adm.a.orgs.colStatus': 'Status',
  'adm.a.orgs.colAction': 'Aktion',
  'adm.a.orgs.center': 'Org-Center',
  'adm.a.orgs.active': 'Aktiv',
  'adm.a.orgs.inactive': 'Inaktiv',
  'adm.a.orgs.loadFail': 'Organisationen konnten nicht geladen werden.',

  'adm.a.act.allTypes': 'Alle Aktionstypen',
  'adm.a.act.create': 'Erstellen',
  'adm.a.act.update': 'Aktualisieren',
  'adm.a.act.delete': 'Löschen',
  'adm.a.act.approval': 'Freigabe',
  'adm.a.act.submission': 'Einreichung',
  'adm.a.act.statusChange': 'Statusänderung',
  'adm.a.act.login': 'Anmeldung',
  'adm.a.act.roleChange': 'Rollenänderung',
  'adm.a.act.security': 'Sicherheit',
  'adm.a.act.config': 'Konfiguration',
  'adm.a.act.loading': 'Lade Aktivitäten…',
  'adm.a.act.empty': 'Keine Aktivitäten gefunden.',
  'adm.a.act.unavailable': 'Aktivitäten nicht verfügbar',

  'adm.a.audit.actorPh': 'Benutzer / E-Mail…',
  'adm.a.audit.orgPh': 'Organisation…',
  'adm.a.audit.entityPh': 'Entity Type…',
  'adm.a.audit.actionPh': 'Action…',
  'adm.a.audit.allTypes': 'Alle Typen',
  'adm.a.audit.statusChange': 'Statuswechsel',
  'adm.a.audit.roleChange': 'Rollenwechsel',
  'adm.a.audit.exportCsv': 'CSV Export',
  'adm.a.audit.empty': 'Keine Audit-Einträge.',
  'adm.a.audit.colTime': 'Zeitpunkt',
  'adm.a.audit.colAction': 'Aktion',
  'adm.a.audit.colResource': 'Ressource',
  'adm.a.audit.colActor': 'Akteur',
  'adm.a.audit.colOrg': 'Organisation',
  'adm.a.audit.colStatus': 'Status',
  'adm.a.audit.detailsLoading': 'Lade Änderungen…',
  'adm.a.audit.detailsEmpty': 'Keine Detailänderungen gefunden.',
  'adm.a.audit.recentTitle': 'Recent Changes',
  'adm.a.audit.noDetails': 'Keine Detaildaten',

  'adm.a.metrics.loadFail': 'Metriken konnten nicht geladen werden. Bitte erneut versuchen.',
  'adm.a.metrics.colType': 'Typ',
  'adm.a.metrics.colCount': 'Anzahl',
  'adm.a.metrics.usersTotal': 'Benutzer gesamt',
  'adm.a.metrics.usersNew30': 'Neu (30 Tage)',
  'adm.a.metrics.orgs': 'Organisationen',
  'adm.a.metrics.reqBacklog': 'Req-Backlog',
  'adm.a.metrics.events30': 'Events 30 Tage',
  'adm.a.metrics.linkExec': 'Executive Dashboard',
  'adm.a.metrics.linkOrg': 'Organization Control Center',
  'adm.a.metrics.linkHealth': 'System Health',
  'adm.a.metrics.linkActivity': 'Governance Timeline',
  'adm.a.metrics.descExec': 'Managementsicht und Executive-KPIs öffnen.',
  'adm.a.metrics.descOrg': 'Bestehende Org-Steuerung und Usage-/Security-Bereiche nutzen.',
  'adm.a.metrics.descHealth': 'Systemdiagnostik und Operations-Status öffnen.',
  'adm.a.metrics.descActivity': 'Governance-Timeline mit lesbaren Ereignissen öffnen.',
  'adm.a.metrics.descDefault': 'Zielseite öffnen.',
  'adm.a.metrics.statUsers': 'Users',
  'adm.a.metrics.statOrgs': 'Orgs',
  'adm.a.metrics.statEvents': 'Events',
  'adm.a.metrics.breakdownEvents': 'Plattform-Events nach Typ',

  'adm.a.rev.exportCsv': 'Export CSV',
  'adm.a.rev.exportJson': 'Export JSON',
  'adm.a.rev.exportHint': 'CSV/JSON Snapshot für Audit verfügbar.',
  'adm.a.rev.exportRunning': 'Export wird erstellt…',
  'adm.a.rev.exportReady': 'Export bereitgestellt.',
  'adm.a.rev.exportFailed': 'Export fehlgeschlagen',
  'adm.a.rev.loading': 'Lade Revenue-Metriken…',
  'adm.a.rev.loadFailHint': 'Revenue-Metriken nicht geladen. Export kann separat versucht werden.',
  'adm.a.rev.unavailable': 'Revenue nicht verfügbar',
  'adm.a.rev.kpiContractualMrr': 'Contractual MRR',
  'adm.a.rev.kpiCatalogMrr': 'Catalog MRR (theoretisch)',
  'adm.a.rev.kpiOpenReceivables': 'Open Receivables',
  'adm.a.rev.kpiPaidRevenue': 'Paid Revenue',
  'adm.a.rev.kpiBillable': 'Billable (uninvoiced)',
  'adm.a.rev.kpiPendingQuotes': 'Pending Quotes',
  'adm.a.rev.kpiCompletedPayments': 'Completed Payments',
  'adm.a.rev.kpiGap': 'Spend↔Invoice Gap (30d)',
  'adm.a.rev.kpiActivePaidOrgs': 'Active Paid Orgs',
  'adm.a.rev.kpiRetainedLogos': 'Retained Logos',
  'adm.a.rev.kpiLogoChurn': 'Logo Churn Rate',
  'adm.a.rev.kpiNrr': 'NRR',
  'adm.a.rev.kpiInactivePaying': 'Inactive but Paying',
  'adm.a.rev.kpiPqa': 'PQA',
  'adm.a.rev.kpiActivePilots': 'Active Pilots',
  'adm.a.rev.kpiActivatedPilots': 'Activated Pilots',
  'adm.a.rev.kpiConvertedPilots': 'Converted Pilots',
  'adm.a.rev.kpiAtRiskPilots': 'At-Risk Pilots',
  'adm.a.rev.kpiDaysActivation': 'Ø Tage bis Aktivierung',
  'adm.a.rev.kpiDaysConversion': 'Ø Tage bis Conversion',
  'adm.a.rev.secPricing': 'Preisquellen (MRR)',
  'adm.a.rev.secInvoice': 'Invoice-Lifecycle',
  'adm.a.rev.secPayment': 'Payment Sessions',
  'adm.a.rev.secBillable': 'Leistungsbasierte Fakturierung',
  'adm.a.rev.secBridge': 'Spend ↔ Invoice Bridge (30 Tage)',
  'adm.a.rev.secRetention': 'Retention / Churn / Usage Truth',
  'adm.a.rev.secPilot': 'Pilot / Conversion Truth',
  'adm.a.rev.secFunnel': 'Pilot Funnel / Stages / Risiken',
  'adm.a.rev.secGtm': 'GTM Learnings',
  'adm.a.rev.pricingEmpty': 'Keine Preisquellen-Daten verfügbar.',
  'adm.a.rev.colPricingSource': 'Preisquelle',
  'adm.a.rev.colSubscribers': 'Subscriber',
  'adm.a.rev.colMrr': 'MRR',
  'adm.a.rev.colArr': 'ARR',
  'adm.a.rev.colStage': 'Stage',
  'adm.a.rev.colOrgs': 'Orgs',
  'adm.a.rev.colAvgDays': 'Ø Tage',
  'adm.a.rev.colAtRisk': 'At-Risk',
  'adm.a.rev.colTransition': 'Transition',
  'adm.a.rev.colCohort': 'Cohort',
  'adm.a.rev.colConverted': 'Converted',
  'adm.a.rev.colRate': 'Rate',
  'adm.a.rev.colOrg': 'Organisation',
  'adm.a.rev.colRisk': 'Risk',
  'adm.a.rev.colHints': 'Hinweise',
  'adm.a.rev.colPath': 'Pfad',
  'adm.a.rev.colTracked': 'Tracked',
  'adm.a.rev.colActivated': 'Aktiviert',
  'adm.a.rev.colIcp': 'ICP',
  'adm.a.rev.colModule': 'Produktbereich',
  'adm.a.rev.colPilotOrgs': 'Pilot-Orgs',
  'adm.a.rev.colActivePilots': 'Active Pilots',
  'adm.a.rev.colSuccessUsage': 'Successful Usage',
  'adm.a.rev.colEvents': 'Events',
  'adm.a.rev.lblInvoiced': 'Invoiced',
  'adm.a.rev.lblPaid': 'Paid',
  'adm.a.rev.lblOpen': 'Open',
  'adm.a.rev.lblCompletedAmount': 'Completed Amount',
  'adm.a.rev.lblBillableVolume': 'Uninvoiced Billable Volume',
  'adm.a.rev.lblApprovedSpend': 'Approved Spend',
  'adm.a.rev.lblOperationalInvoiced': 'Operational Invoiced',
  'adm.a.rev.lblGap': 'Gap',
  'adm.a.rev.lblCoverage': 'Coverage',
  'adm.a.rev.lblUsageBands': 'Usage Bands',
  'adm.a.rev.lblAtRiskAccounts': 'At-Risk Accounts',
  'adm.a.rev.lblPqa': 'PQA',
  'adm.a.rev.lblBottlenecks': 'Onboarding-Bottlenecks',
  'adm.a.rev.lblPilotToActivated': 'Pilot → Aktiviert',
  'adm.a.rev.lblActivatedToPaid': 'Aktiviert → Paid',
  'adm.a.rev.lblPilotToLost': 'Pilot → Lost',
  'adm.a.rev.noteInvoice': 'Invoice-Wahrheit ist im aktuellen Schema noch nicht vollständig verfügbar.',
  'adm.a.rev.notePayment': 'Payment-Truth ist im aktuellen Schema noch nicht vollständig verfügbar.',
  'adm.a.rev.noteBillable': 'Billable-Wahrheit ist im aktuellen Schema noch nicht vollständig verfügbar.',
  'adm.a.rev.noteRecon': 'Spend/Invoice-Reconciliation ist im aktuellen Schema noch nicht vollständig verfügbar.',
  'adm.a.rev.noteUsage': 'Usage-Quelle derzeit nicht verfügbar; usage-basierte Kohortenwerte sind eingeschränkt.',
  'adm.a.rev.noteLeadCapture': 'Lead-Capture vor Registrierung ist nur teilweise vorhanden; Fallbacks werden transparent ausgewiesen.',
  'adm.a.rev.notePricingClarity': 'Pricing-Klarheit nutzt teilweise abgeleitete historische Zeitanker.',
  'adm.a.rev.noBottlenecks': 'Keine dominanten Onboarding-Bottlenecks identifiziert.',
  'adm.a.rev.emptyStages': 'Keine Funnel-Stufen vorhanden.',
  'adm.a.rev.emptyTariffs': 'Keine Tarifpfade vorhanden.',
  'adm.a.rev.emptyIcp': 'Keine ICP-Learnings vorhanden.',
  'adm.a.rev.statDraft': 'Draft',
  'adm.a.rev.statIssued': 'Issued',
  'adm.a.rev.statOverdue': 'Overdue',
  'adm.a.rev.statPaid': 'Paid',
  'adm.a.rev.statVoid': 'Void',
  'adm.a.rev.statCompleted': 'Completed',
  'adm.a.rev.statPending': 'Pending',
  'adm.a.rev.statFailed': 'Failed',
  'adm.a.rev.statExpired': 'Expired',
  'adm.a.rev.statBillableTimesheets': 'Billable Timesheets',
  'adm.a.rev.statBillableHours': 'Billable Hours',
  'adm.a.rev.statMissingRate': 'Missing Rate',
  'adm.a.rev.statActiveCustomer': 'Active Customer',
  'adm.a.rev.statPreviousCohort': 'Previous Cohort',
  'adm.a.rev.statRetainedRate': 'Retained Rate',
  'adm.a.rev.statLogoChurn': 'Logo Churn',
  'adm.a.rev.statGrossChurn': 'Gross Churn MRR',
  'adm.a.rev.statExpansion': 'Expansion MRR',
  'adm.a.rev.statPilotConverted': 'Pilot Converted',
  'adm.a.rev.statTrackedOrgs': 'Tracked Orgs',
  'adm.a.rev.statLeads': 'Leads',
  'adm.a.rev.statQualified': 'Qualified',
  'adm.a.rev.statRegistered': 'Registered',
  'adm.a.rev.trLeadRegistered': 'Lead → Registrierung',
  'adm.a.rev.trRegisteredPilot': 'Registrierung → Pilotstart',
  'adm.a.rev.trPilotActivated': 'Pilotstart → Aktivierung',
  'adm.a.rev.trActivatedPaid': 'Aktivierung → Paid',
  'adm.a.rev.trPilotLost': 'Pilot → Lost',
  'adm.a.rev.stage.lead': 'Lead',
  'adm.a.rev.stage.qualified': 'Qualifiziert',
  'adm.a.rev.stage.registered': 'Registriert',
  'adm.a.rev.stage.pilot_started': 'Pilot gestartet',
  'adm.a.rev.stage.pilot_activated': 'Pilot aktiviert',
  'adm.a.rev.stage.first_core_flow_executed': 'Erster Kernfluss',
  'adm.a.rev.stage.pilot_successful_usage': 'Belastbare Nutzung',
  'adm.a.rev.stage.commercial_pricing_clarified': 'Pricing klar',
  'adm.a.rev.stage.paid_live': 'Zahlend live',
  'adm.a.rev.stage.lost_aborted': 'Verloren',
  'adm.a.rev.path.pilot': 'Pilot-Pfad',
  'adm.a.rev.path.direct_contract': 'Direktvertrag',
  'adm.a.rev.path.catalog_paid': 'Katalog / live',
  'adm.a.rev.path.lead_only': 'Lead only',
  'adm.a.rev.path.unclassified': 'Unklassifiziert',
  'adm.a.rev.module.demand': 'Demand',
  'adm.a.rev.module.deal': 'Deal',
  'adm.a.rev.module.delivery': 'Delivery',
  'adm.a.rev.module.vendor_governance': 'Vendor Governance',

  'adm.a.sc.eingegangen': 'Eingegangen',
  'adm.a.sc.rueckfrage_offen': 'Rückfrage offen',
  'adm.a.sc.angebot_erstellt': 'Angebot erstellt',
  'adm.a.sc.bestaetigt': 'Bestätigt',
  'adm.a.sc.aktiviert': 'Aktiviert',
  'adm.a.sc.abgelehnt': 'Abgelehnt',
  'adm.a.sc.abgeschlossen': 'Abgeschlossen',
  'adm.a.strat.loading': 'Lade Kooperationsanfragen…',
  'adm.a.strat.empty': 'Keine Kooperationsanfragen gefunden.',
  'adm.a.strat.unavailable': 'Kooperationsanfragen nicht verfügbar',
  'adm.a.strat.colTime': 'Zeitpunkt',
  'adm.a.strat.colStatus': 'Status',
  'adm.a.strat.colOwner': 'Owner',
  'adm.a.strat.colCompany': 'Unternehmen',
  'adm.a.strat.colContact': 'Kontakt',
  'adm.a.strat.colEmail': 'E-Mail',
  'adm.a.strat.colScope': 'Scope',
  'adm.a.strat.colType': 'Typ',
  'adm.a.strat.colAction': 'Aktion',
  'adm.a.strat.sites': '{count} Standorte',
  'adm.a.strat.release': 'Freigeben',
  'adm.a.strat.claim': 'Übernehmen',
  'adm.a.strat.intEnterprise': 'Enterprise-Support',
  'adm.a.strat.intFramework': 'Rahmenkonditionen',
  'adm.a.strat.intCooperation': 'Kooperation',
  'adm.a.strat.statusUpdated': 'Status aktualisiert',
  'adm.a.strat.message': 'Nachricht',
  'adm.a.strat.interest': 'Interesse',
  'adm.a.strat.modules': 'Module',
  'adm.a.strat.opsNote': 'Ops-Notiz',
  'adm.a.strat.saveNote': 'Notiz speichern',
  'adm.a.strat.srcEnterprise': 'Konfiguration individueller Tarife',
  'adm.a.strat.srcPublic': 'Public Profil',
  'adm.a.strat.statusFail': 'Status-Update fehlgeschlagen',
  'adm.a.strat.assignFail': 'Zuweisung fehlgeschlagen',
  'adm.a.strat.noteFail': 'Notiz-Update fehlgeschlagen',

  'adm.a.bo.loading': 'Lade Requests…',
  'adm.a.bo.empty': 'Keine Requests gefunden.',
  'adm.a.bo.unavailable': 'Requests nicht verfügbar',
  'adm.a.bo.colTime': 'Zeitpunkt',
  'adm.a.bo.colStatus': 'Status',
  'adm.a.bo.colRequester': 'Requester',
  'adm.a.bo.colReceiver': 'Receiver',
  'adm.a.bo.colRoleRegion': 'Rolle/Region',
  'adm.a.bo.colStatusChange': 'Statusänderung',
  'adm.a.bo.statusConfirm': 'Request-Status wirklich auf "{status}" setzen?',
  'adm.a.bo.statusFail': 'Statusänderung fehlgeschlagen',

  'adm.a.fo.featureKey': 'Feature-Key',
  'adm.a.fo.loading': 'Lade...',
  'adm.a.fo.choose': '-- Feature wählen --',
  'adm.a.fo.orgId': 'Org-ID (leer = global)',
  'adm.a.fo.orgIdPh': 'Alle Orgs',
  'adm.a.fo.enabled': 'Aktiviert',
  'adm.a.fo.reason': 'Grund',
  'adm.a.fo.reasonPh': 'Optional',
  'adm.a.fo.expires': 'Ablauf (optional)',
  'adm.a.fo.save': 'Override speichern',
  'adm.a.fo.loadingList': 'Lade Overrides…',
  'adm.a.fo.empty': 'Keine Feature-Overrides vorhanden.',
  'adm.a.fo.unavailable': 'Overrides nicht verfügbar',
  'adm.a.fo.colId': 'ID',
  'adm.a.fo.colFeature': 'Feature',
  'adm.a.fo.colOrg': 'Org',
  'adm.a.fo.colEnabled': 'Aktiviert',
  'adm.a.fo.colReason': 'Grund',
  'adm.a.fo.colExpires': 'Ablauf',
  'adm.a.fo.colCreated': 'Erstellt',
  'adm.a.fo.global': 'Global',
  'adm.a.fo.delete': 'Löschen',
  'adm.a.fo.deleteConfirm': 'Override wirklich löschen?',
  'adm.a.fo.selectKey': 'Bitte Feature-Key auswählen',

  'adm.a.rel.introA': 'Release Notes für Kunden und interne Tester. Zielgruppe über Rollen-Tags, optional Mindest-Plan und Feature-Key aus',
  'adm.a.rel.introB': '. Modal nur für große Releases; E-Mail gezielt (Cap pro Lauf, kein Spam).',
  'adm.a.rel.title': 'Titel',
  'adm.a.rel.titlePh': 'Kurzer Release-Titel',
  'adm.a.rel.summary': 'Kurzbeschreibung',
  'adm.a.rel.summaryPh': 'Ein Satz für Inbox / E-Mail',
  'adm.a.rel.body': 'Detail (optional)',
  'adm.a.rel.featureKey': 'Feature-Key (Anzeige)',
  'adm.a.rel.featureKeyPh': 'z. B. capacity_exchange_matching',
  'adm.a.rel.reqFeature': 'Pflicht-Feature (Gate)',
  'adm.a.rel.reqFeaturePh': 'Nur Nutzer mit Plan-Zugriff',
  'adm.a.rel.minPlan': 'Mindest-Plan',
  'adm.a.rel.allPlans': 'Alle Pläne',
  'adm.a.rel.visibility': 'Sichtbarkeit',
  'adm.a.rel.visPublic': 'Öffentlich (Kunden)',
  'adm.a.rel.visInternal': 'Intern (Admin / platform_admin)',
  'adm.a.rel.status': 'Status',
  'adm.a.rel.statusDraft': 'Entwurf',
  'adm.a.rel.statusPublished': 'Veröffentlicht',
  'adm.a.rel.priority': 'Priorität (Modal-Sortierung)',
  'adm.a.rel.audience': 'Zielgruppe (leer = alle Rollen)',
  'adm.a.rel.audWorker': 'Worker',
  'adm.a.rel.audAgency': 'Zeitarbeit',
  'adm.a.rel.audCompany': 'Unternehmen',
  'adm.a.rel.audSupplier': 'Lieferant (Org-Rolle)',
  'adm.a.rel.audAdmin': 'Plattform-Admin',
  'adm.a.rel.inapp': 'In-App (Badge / Strip)',
  'adm.a.rel.modal': 'Als Modal (einmal pro Session)',
  'adm.a.rel.email': 'E-Mail beim Publish',
  'adm.a.rel.submit': 'Eintrag anlegen'
});
TCi18n.register('en', {
  'adm.a.docTitle': 'Admin panel – TempConnect',
  'adm.a.page.title': 'Admin panel',
  'adm.a.page.subtitle': 'Users, organisations, audit log and platform metrics.',
  'adm.a.onb.label': 'Set up the platform',
  'adm.a.onb.toggle': 'Expand / collapse',
  'adm.a.onb.dismiss': 'Hide',
  'adm.a.ws.title': 'Platform workspace',
  'adm.a.ws.subtitle': 'Operational platform control for the admin areas you have access to.',

  'adm.a.tab.users': 'Users',
  'adm.a.tab.orgs': 'Organisations',
  'adm.a.tab.activity': 'Activity',
  'adm.a.tab.requests': 'Requests',
  'adm.a.tab.audit': 'Audit log',
  'adm.a.tab.metrics': 'Metrics',
  'adm.a.tab.strategic': 'Partnership requests',
  'adm.a.tab.revenue': 'Revenue',
  'adm.a.tab.features': 'Feature flags',
  'adm.a.tab.releases': 'Product updates',

  'adm.a.filter.apply': 'Apply filters',
  'adm.a.filter.allStatus': 'All statuses',
  'adm.a.filter.from': 'From',
  'adm.a.filter.to': 'To',
  'adm.a.common.yes': 'Yes',
  'adm.a.common.no': 'No',
  'adm.a.common.save': 'Save',
  'adm.a.common.details': 'Details',
  'adm.a.common.error': 'Error',
  'adm.a.common.unknown': 'Unknown',
  'adm.a.paging.prev': 'Back',
  'adm.a.paging.next': 'Next',
  'adm.a.plan.individuell': 'Individual plan',

  'adm.a.ctx.title': 'Admin control centre',
  'adm.a.ctx.desc': 'Existing platform logic, card states and clear soft locks instead of one global lockout.',
  'adm.a.ctx.users': 'Users',
  'adm.a.ctx.orgs': 'Organisations',
  'adm.a.ctx.plan': 'Plan',
  'adm.a.ctx.org': 'Organisation',
  'adm.a.ctx.noOrg': 'no organisation',
  'adm.a.ctx.role': 'Role',
  'adm.a.ctx.backlog': 'Backlog',
  'adm.a.ctx.audit30': 'Audit, 30 days',
  'adm.a.roadmap.title': 'Prioritised rollout order',
  'adm.a.roadmap.desc': 'Strong cards first, deliberately controlled areas after.',
  'adm.a.banner.title': 'Per-card access active',
  'adm.a.banner.desc': 'The control centre stays visible, but operational platform areas are unlocked or soft-locked deliberately, card by card.',
  'adm.a.banner.toOrg': 'Go to the organisation area',
  'adm.a.banner.toExec': 'Go to the executive dashboard',
  'adm.a.banner.bootFailTitle': 'Admin control centre currently unavailable',
  'adm.a.banner.bootFailText': 'The bootstrap could not be loaded.',

  'adm.a.card.admin': 'Admin overview',
  'adm.a.card.adminDesc': 'Full access for admins and platform owners only.',
  'adm.a.card.usersOrgs': 'Users & organisations',
  'adm.a.card.usersOrgsDesc': 'Management of all users, roles and organisations.',
  'adm.a.card.auditLog': 'Audit log',
  'adm.a.card.auditLogDesc': 'Platform-wide activity and an immutable audit trail.',
  'adm.a.card.metrics': 'Platform metrics',
  'adm.a.card.metricsDesc': 'Usage and performance indicators across the whole platform.',
  'adm.a.card.sso': 'SSO / SAML',
  'adm.a.card.ssoDesc': 'Company-wide single sign-on configuration.',
  'adm.a.card.workflows': 'Workflows & automation',
  'adm.a.card.workflowsDesc': 'Process automation and notification flows.',

  'adm.a.users.searchPh': 'Search users (name, e-mail, company)…',
  'adm.a.users.search': 'Search',
  'adm.a.users.loading': 'Loading users…',
  'adm.a.users.empty': 'No users found.',
  'adm.a.users.colEmail': 'E-mail',
  'adm.a.users.colCompany': 'Company',
  'adm.a.users.colOrg': 'Organisation',
  'adm.a.users.colOrgRole': 'Org role',
  'adm.a.users.colPlan': 'Plan',
  'adm.a.users.colVerified': 'Verified',
  'adm.a.users.colActions': 'Actions',
  'adm.a.users.verify': 'Verify',
  'adm.a.users.deactivate': 'Deactivate',
  'adm.a.users.loadFail': 'The users could not be loaded.',
  'adm.a.users.deactivateConfirm': 'Really deactivate this user?',
  'adm.a.users.deactivateFail': 'Deactivation failed',

  'adm.a.orgs.loading': 'Loading organisations…',
  'adm.a.orgs.empty': 'No organisations.',
  'adm.a.orgs.colName': 'Name',
  'adm.a.orgs.colType': 'Type',
  'adm.a.orgs.colPlan': 'Plan',
  'adm.a.orgs.colMembers': 'Members',
  'adm.a.orgs.colLocations': 'Locations',
  'adm.a.orgs.colStatus': 'Status',
  'adm.a.orgs.colAction': 'Action',
  'adm.a.orgs.center': 'Org centre',
  'adm.a.orgs.active': 'Active',
  'adm.a.orgs.inactive': 'Inactive',
  'adm.a.orgs.loadFail': 'The organisations could not be loaded.',

  'adm.a.act.allTypes': 'All action types',
  'adm.a.act.create': 'Create',
  'adm.a.act.update': 'Update',
  'adm.a.act.delete': 'Delete',
  'adm.a.act.approval': 'Approval',
  'adm.a.act.submission': 'Submission',
  'adm.a.act.statusChange': 'Status change',
  'adm.a.act.login': 'Login',
  'adm.a.act.roleChange': 'Role change',
  'adm.a.act.security': 'Security',
  'adm.a.act.config': 'Configuration',
  'adm.a.act.loading': 'Loading activity…',
  'adm.a.act.empty': 'No activity found.',
  'adm.a.act.unavailable': 'Activity unavailable',

  'adm.a.audit.actorPh': 'User / e-mail…',
  'adm.a.audit.orgPh': 'Organisation…',
  'adm.a.audit.entityPh': 'Entity type…',
  'adm.a.audit.actionPh': 'Action…',
  'adm.a.audit.allTypes': 'All types',
  'adm.a.audit.statusChange': 'Status change',
  'adm.a.audit.roleChange': 'Role change',
  'adm.a.audit.exportCsv': 'CSV export',
  'adm.a.audit.empty': 'No audit entries.',
  'adm.a.audit.colTime': 'Timestamp',
  'adm.a.audit.colAction': 'Action',
  'adm.a.audit.colResource': 'Resource',
  'adm.a.audit.colActor': 'Actor',
  'adm.a.audit.colOrg': 'Organisation',
  'adm.a.audit.colStatus': 'Status',
  'adm.a.audit.detailsLoading': 'Loading changes…',
  'adm.a.audit.detailsEmpty': 'No detailed changes found.',
  'adm.a.audit.recentTitle': 'Recent changes',
  'adm.a.audit.noDetails': 'No detail data',

  'adm.a.metrics.loadFail': 'The metrics could not be loaded. Please try again.',
  'adm.a.metrics.colType': 'Type',
  'adm.a.metrics.colCount': 'Count',
  'adm.a.metrics.usersTotal': 'Users total',
  'adm.a.metrics.usersNew30': 'New (30 days)',
  'adm.a.metrics.orgs': 'Organisations',
  'adm.a.metrics.reqBacklog': 'Req backlog',
  'adm.a.metrics.events30': 'Events, 30 days',
  'adm.a.metrics.linkExec': 'Executive dashboard',
  'adm.a.metrics.linkOrg': 'Organization Control Center',
  'adm.a.metrics.linkHealth': 'System health',
  'adm.a.metrics.linkActivity': 'Governance timeline',
  'adm.a.metrics.descExec': 'Open the management view and executive KPIs.',
  'adm.a.metrics.descOrg': 'Use the existing org controls and usage/security areas.',
  'adm.a.metrics.descHealth': 'Open system diagnostics and operations status.',
  'adm.a.metrics.descActivity': 'Open the governance timeline with readable events.',
  'adm.a.metrics.descDefault': 'Open the target page.',
  'adm.a.metrics.statUsers': 'Users',
  'adm.a.metrics.statOrgs': 'Orgs',
  'adm.a.metrics.statEvents': 'Events',
  'adm.a.metrics.breakdownEvents': 'Platform events by type',

  'adm.a.rev.exportCsv': 'Export CSV',
  'adm.a.rev.exportJson': 'Export JSON',
  'adm.a.rev.exportHint': 'CSV/JSON snapshot available for audit.',
  'adm.a.rev.exportRunning': 'Creating the export…',
  'adm.a.rev.exportReady': 'Export ready.',
  'adm.a.rev.exportFailed': 'Export failed',
  'adm.a.rev.loading': 'Loading revenue metrics…',
  'adm.a.rev.loadFailHint': 'Revenue metrics not loaded. The export can be tried separately.',
  'adm.a.rev.unavailable': 'Revenue unavailable',
  'adm.a.rev.kpiContractualMrr': 'Contractual MRR',
  'adm.a.rev.kpiCatalogMrr': 'Catalog MRR (theoretical)',
  'adm.a.rev.kpiOpenReceivables': 'Open receivables',
  'adm.a.rev.kpiPaidRevenue': 'Paid revenue',
  'adm.a.rev.kpiBillable': 'Billable (uninvoiced)',
  'adm.a.rev.kpiPendingQuotes': 'Pending quotes',
  'adm.a.rev.kpiCompletedPayments': 'Completed payments',
  'adm.a.rev.kpiGap': 'Spend↔invoice gap (30d)',
  'adm.a.rev.kpiActivePaidOrgs': 'Active paid orgs',
  'adm.a.rev.kpiRetainedLogos': 'Retained logos',
  'adm.a.rev.kpiLogoChurn': 'Logo churn rate',
  'adm.a.rev.kpiNrr': 'NRR',
  'adm.a.rev.kpiInactivePaying': 'Inactive but paying',
  'adm.a.rev.kpiPqa': 'PQA',
  'adm.a.rev.kpiActivePilots': 'Active pilots',
  'adm.a.rev.kpiActivatedPilots': 'Activated pilots',
  'adm.a.rev.kpiConvertedPilots': 'Converted pilots',
  'adm.a.rev.kpiAtRiskPilots': 'At-risk pilots',
  'adm.a.rev.kpiDaysActivation': 'Ø days to activation',
  'adm.a.rev.kpiDaysConversion': 'Ø days to conversion',
  'adm.a.rev.secPricing': 'Price sources (MRR)',
  'adm.a.rev.secInvoice': 'Invoice lifecycle',
  'adm.a.rev.secPayment': 'Payment sessions',
  'adm.a.rev.secBillable': 'Usage-based invoicing',
  'adm.a.rev.secBridge': 'Spend ↔ invoice bridge (30 days)',
  'adm.a.rev.secRetention': 'Retention / churn / usage truth',
  'adm.a.rev.secPilot': 'Pilot / conversion truth',
  'adm.a.rev.secFunnel': 'Pilot funnel / stages / risks',
  'adm.a.rev.secGtm': 'GTM learnings',
  'adm.a.rev.pricingEmpty': 'No price-source data available.',
  'adm.a.rev.colPricingSource': 'Price source',
  'adm.a.rev.colSubscribers': 'Subscribers',
  'adm.a.rev.colMrr': 'MRR',
  'adm.a.rev.colArr': 'ARR',
  'adm.a.rev.colStage': 'Stage',
  'adm.a.rev.colOrgs': 'Orgs',
  'adm.a.rev.colAvgDays': 'Ø days',
  'adm.a.rev.colAtRisk': 'At risk',
  'adm.a.rev.colTransition': 'Transition',
  'adm.a.rev.colCohort': 'Cohort',
  'adm.a.rev.colConverted': 'Converted',
  'adm.a.rev.colRate': 'Rate',
  'adm.a.rev.colOrg': 'Organisation',
  'adm.a.rev.colRisk': 'Risk',
  'adm.a.rev.colHints': 'Notes',
  'adm.a.rev.colPath': 'Path',
  'adm.a.rev.colTracked': 'Tracked',
  'adm.a.rev.colActivated': 'Activated',
  'adm.a.rev.colIcp': 'ICP',
  'adm.a.rev.colModule': 'Product area',
  'adm.a.rev.colPilotOrgs': 'Pilot orgs',
  'adm.a.rev.colActivePilots': 'Active pilots',
  'adm.a.rev.colSuccessUsage': 'Successful usage',
  'adm.a.rev.colEvents': 'Events',
  'adm.a.rev.lblInvoiced': 'Invoiced',
  'adm.a.rev.lblPaid': 'Paid',
  'adm.a.rev.lblOpen': 'Open',
  'adm.a.rev.lblCompletedAmount': 'Completed amount',
  'adm.a.rev.lblBillableVolume': 'Uninvoiced billable volume',
  'adm.a.rev.lblApprovedSpend': 'Approved spend',
  'adm.a.rev.lblOperationalInvoiced': 'Operational invoiced',
  'adm.a.rev.lblGap': 'Gap',
  'adm.a.rev.lblCoverage': 'Coverage',
  'adm.a.rev.lblUsageBands': 'Usage bands',
  'adm.a.rev.lblAtRiskAccounts': 'At-risk accounts',
  'adm.a.rev.lblPqa': 'PQA',
  'adm.a.rev.lblBottlenecks': 'Onboarding bottlenecks',
  'adm.a.rev.lblPilotToActivated': 'Pilot → activated',
  'adm.a.rev.lblActivatedToPaid': 'Activated → paid',
  'adm.a.rev.lblPilotToLost': 'Pilot → lost',
  'adm.a.rev.noteInvoice': 'Invoice truth is not yet fully available in the current schema.',
  'adm.a.rev.notePayment': 'Payment truth is not yet fully available in the current schema.',
  'adm.a.rev.noteBillable': 'Billable truth is not yet fully available in the current schema.',
  'adm.a.rev.noteRecon': 'Spend/invoice reconciliation is not yet fully available in the current schema.',
  'adm.a.rev.noteUsage': 'The usage source is currently unavailable; usage-based cohort values are limited.',
  'adm.a.rev.noteLeadCapture': 'Lead capture before registration exists only partly; fallbacks are shown transparently.',
  'adm.a.rev.notePricingClarity': 'Pricing clarity partly relies on derived historical time anchors.',
  'adm.a.rev.noBottlenecks': 'No dominant onboarding bottlenecks identified.',
  'adm.a.rev.emptyStages': 'No funnel stages available.',
  'adm.a.rev.emptyTariffs': 'No plan paths available.',
  'adm.a.rev.emptyIcp': 'No ICP learnings available.',
  'adm.a.rev.statDraft': 'Draft',
  'adm.a.rev.statIssued': 'Issued',
  'adm.a.rev.statOverdue': 'Overdue',
  'adm.a.rev.statPaid': 'Paid',
  'adm.a.rev.statVoid': 'Void',
  'adm.a.rev.statCompleted': 'Completed',
  'adm.a.rev.statPending': 'Pending',
  'adm.a.rev.statFailed': 'Failed',
  'adm.a.rev.statExpired': 'Expired',
  'adm.a.rev.statBillableTimesheets': 'Billable timesheets',
  'adm.a.rev.statBillableHours': 'Billable hours',
  'adm.a.rev.statMissingRate': 'Missing rate',
  'adm.a.rev.statActiveCustomer': 'Active customer',
  'adm.a.rev.statPreviousCohort': 'Previous cohort',
  'adm.a.rev.statRetainedRate': 'Retained rate',
  'adm.a.rev.statLogoChurn': 'Logo churn',
  'adm.a.rev.statGrossChurn': 'Gross churn MRR',
  'adm.a.rev.statExpansion': 'Expansion MRR',
  'adm.a.rev.statPilotConverted': 'Pilot converted',
  'adm.a.rev.statTrackedOrgs': 'Tracked orgs',
  'adm.a.rev.statLeads': 'Leads',
  'adm.a.rev.statQualified': 'Qualified',
  'adm.a.rev.statRegistered': 'Registered',
  'adm.a.rev.trLeadRegistered': 'Lead → registration',
  'adm.a.rev.trRegisteredPilot': 'Registration → pilot start',
  'adm.a.rev.trPilotActivated': 'Pilot start → activation',
  'adm.a.rev.trActivatedPaid': 'Activation → paid',
  'adm.a.rev.trPilotLost': 'Pilot → lost',
  'adm.a.rev.stage.lead': 'Lead',
  'adm.a.rev.stage.qualified': 'Qualified',
  'adm.a.rev.stage.registered': 'Registered',
  'adm.a.rev.stage.pilot_started': 'Pilot started',
  'adm.a.rev.stage.pilot_activated': 'Pilot activated',
  'adm.a.rev.stage.first_core_flow_executed': 'First core flow',
  'adm.a.rev.stage.pilot_successful_usage': 'Solid usage',
  'adm.a.rev.stage.commercial_pricing_clarified': 'Pricing clarified',
  'adm.a.rev.stage.paid_live': 'Paying, live',
  'adm.a.rev.stage.lost_aborted': 'Lost',
  'adm.a.rev.path.pilot': 'Pilot path',
  'adm.a.rev.path.direct_contract': 'Direct contract',
  'adm.a.rev.path.catalog_paid': 'Catalog / live',
  'adm.a.rev.path.lead_only': 'Lead only',
  'adm.a.rev.path.unclassified': 'Unclassified',
  'adm.a.rev.module.demand': 'Demand',
  'adm.a.rev.module.deal': 'Deal',
  'adm.a.rev.module.delivery': 'Delivery',
  'adm.a.rev.module.vendor_governance': 'Vendor governance',

  'adm.a.sc.eingegangen': 'Received',
  'adm.a.sc.rueckfrage_offen': 'Query open',
  'adm.a.sc.angebot_erstellt': 'Quote created',
  'adm.a.sc.bestaetigt': 'Confirmed',
  'adm.a.sc.aktiviert': 'Activated',
  'adm.a.sc.abgelehnt': 'Declined',
  'adm.a.sc.abgeschlossen': 'Closed',
  'adm.a.strat.loading': 'Loading partnership requests…',
  'adm.a.strat.empty': 'No partnership requests found.',
  'adm.a.strat.unavailable': 'Partnership requests unavailable',
  'adm.a.strat.colTime': 'Timestamp',
  'adm.a.strat.colStatus': 'Status',
  'adm.a.strat.colOwner': 'Owner',
  'adm.a.strat.colCompany': 'Company',
  'adm.a.strat.colContact': 'Contact',
  'adm.a.strat.colEmail': 'E-mail',
  'adm.a.strat.colScope': 'Scope',
  'adm.a.strat.colType': 'Type',
  'adm.a.strat.colAction': 'Action',
  'adm.a.strat.sites': '{count} sites',
  'adm.a.strat.release': 'Release',
  'adm.a.strat.claim': 'Take over',
  'adm.a.strat.intEnterprise': 'Enterprise support',
  'adm.a.strat.intFramework': 'Framework conditions',
  'adm.a.strat.intCooperation': 'Partnership',
  'adm.a.strat.statusUpdated': 'Status updated',
  'adm.a.strat.message': 'Message',
  'adm.a.strat.interest': 'Interest',
  'adm.a.strat.modules': 'Modules',
  'adm.a.strat.opsNote': 'Ops note',
  'adm.a.strat.saveNote': 'Save note',
  'adm.a.strat.srcEnterprise': 'Individual plan configurator',
  'adm.a.strat.srcPublic': 'Public profile',
  'adm.a.strat.statusFail': 'Status update failed',
  'adm.a.strat.assignFail': 'Assignment failed',
  'adm.a.strat.noteFail': 'Note update failed',

  'adm.a.bo.loading': 'Loading requests…',
  'adm.a.bo.empty': 'No requests found.',
  'adm.a.bo.unavailable': 'Requests unavailable',
  'adm.a.bo.colTime': 'Timestamp',
  'adm.a.bo.colStatus': 'Status',
  'adm.a.bo.colRequester': 'Requester',
  'adm.a.bo.colReceiver': 'Receiver',
  'adm.a.bo.colRoleRegion': 'Role / region',
  'adm.a.bo.colStatusChange': 'Status change',
  'adm.a.bo.statusConfirm': 'Really set the request status to "{status}"?',
  'adm.a.bo.statusFail': 'Status change failed',

  'adm.a.fo.featureKey': 'Feature key',
  'adm.a.fo.loading': 'Loading...',
  'adm.a.fo.choose': '-- Choose a feature --',
  'adm.a.fo.orgId': 'Org ID (empty = global)',
  'adm.a.fo.orgIdPh': 'All orgs',
  'adm.a.fo.enabled': 'Enabled',
  'adm.a.fo.reason': 'Reason',
  'adm.a.fo.reasonPh': 'Optional',
  'adm.a.fo.expires': 'Expiry (optional)',
  'adm.a.fo.save': 'Save override',
  'adm.a.fo.loadingList': 'Loading overrides…',
  'adm.a.fo.empty': 'No feature overrides yet.',
  'adm.a.fo.unavailable': 'Overrides unavailable',
  'adm.a.fo.colId': 'ID',
  'adm.a.fo.colFeature': 'Feature',
  'adm.a.fo.colOrg': 'Org',
  'adm.a.fo.colEnabled': 'Enabled',
  'adm.a.fo.colReason': 'Reason',
  'adm.a.fo.colExpires': 'Expiry',
  'adm.a.fo.colCreated': 'Created',
  'adm.a.fo.global': 'Global',
  'adm.a.fo.delete': 'Delete',
  'adm.a.fo.deleteConfirm': 'Really delete this override?',
  'adm.a.fo.selectKey': 'Please choose a feature key',

  'adm.a.rel.introA': 'Release notes for customers and internal testers. Audience via role tags, optionally a minimum plan and a feature key from',
  'adm.a.rel.introB': '. Modal only for large releases; e-mail targeted (cap per run, no spam).',
  'adm.a.rel.title': 'Title',
  'adm.a.rel.titlePh': 'Short release title',
  'adm.a.rel.summary': 'Short description',
  'adm.a.rel.summaryPh': 'One sentence for inbox / e-mail',
  'adm.a.rel.body': 'Detail (optional)',
  'adm.a.rel.featureKey': 'Feature key (display)',
  'adm.a.rel.featureKeyPh': 'e.g. capacity_exchange_matching',
  'adm.a.rel.reqFeature': 'Required feature (gate)',
  'adm.a.rel.reqFeaturePh': 'Only users with plan access',
  'adm.a.rel.minPlan': 'Minimum plan',
  'adm.a.rel.allPlans': 'All plans',
  'adm.a.rel.visibility': 'Visibility',
  'adm.a.rel.visPublic': 'Public (customers)',
  'adm.a.rel.visInternal': 'Internal (admin / platform_admin)',
  'adm.a.rel.status': 'Status',
  'adm.a.rel.statusDraft': 'Draft',
  'adm.a.rel.statusPublished': 'Published',
  'adm.a.rel.priority': 'Priority (modal order)',
  'adm.a.rel.audience': 'Audience (empty = all roles)',
  'adm.a.rel.audWorker': 'Worker',
  'adm.a.rel.audAgency': 'Staffing agency',
  'adm.a.rel.audCompany': 'Company',
  'adm.a.rel.audSupplier': 'Supplier (org role)',
  'adm.a.rel.audAdmin': 'Platform admin',
  'adm.a.rel.inapp': 'In-app (badge / strip)',
  'adm.a.rel.modal': 'As a modal (once per session)',
  'adm.a.rel.email': 'E-mail on publish',
  'adm.a.rel.submit': 'Create entry'
});

(function () {
  'use strict';

  var controlCenter = null;
  var usersOffset = 0;
  var usersLimit = 50;
  var orgsOffset = 0;
  var orgsLimit = 50;
  var actOffset = 0;
  var actLimit = 50;
  var boReqOffset = 0;
  var boReqLimit = 50;
  var scOffset = 0;
  var scLimit = 50;
  var _foKeysLoaded = false;
  var currentAdminUserId = null;

  function el(id) { return document.getElementById(id); }
  function esc(value) {
    var div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }
  function emptyState(message) {
    return '<p class="empty">' + esc(message) + '</p>';
  }
  function displayPlanLabel(plan) {
    if (window.PlanFeatures && typeof window.PlanFeatures.getDisplayPlanLabel === 'function') {
      return window.PlanFeatures.getDisplayPlanLabel(plan || 'DEMO');
    }
    var normalized = (plan || 'DEMO').toUpperCase();
    if (normalized === 'FREE') return 'DEMO';
    if (normalized === 'ENTERPRISE' || normalized === 'INDIVIDUELL') return TCi18n.t('adm.a.plan.individuell');
    return normalized;
  }
  function formatDateTime(value) {
    return value ? new Date(value).toLocaleString(TCi18n.dateLocale()) : '–';
  }
  /* Die Statuswerte selbst bleiben Server-Enums (und option-value); nur ihr
     Anzeigetext kommt zweisprachig aus dem Woerterbuch. */
  function formatStrategicStatus(status) {
    if (!status) return '–';
    return TCi18n.t('adm.a.sc.' + status) || String(status).replace(/_/g, ' ');
  }
  function safeJson(value) {
    return JSON.stringify(value == null ? '' : String(value));
  }
  function describeError(error, fallback) {
    if (!error) return fallback;
    if (typeof error === 'string') return error;
    if (typeof error.message === 'string' && error.message.trim()) return error.message;
    if (error.message && typeof error.message === 'object') {
      if (typeof error.message.message === 'string' && error.message.message.trim()) return error.message.message;
      if (typeof error.message.code === 'string' && error.message.code.trim()) return error.message.code;
    }
    if (error.error && typeof error.error === 'object') {
      if (typeof error.error.message === 'string' && error.error.message.trim()) return error.error.message;
      if (typeof error.error.code === 'string' && error.error.code.trim()) return error.error.code;
    }
    if (typeof error.code === 'string' && error.code.trim()) return error.code;
    try {
      return JSON.stringify(error);
    } catch (_err) {
      return fallback;
    }
  }
  function toInteger(value, fallback, min, max) {
    var parsed = parseInt(value, 10);
    if (!isFinite(parsed)) parsed = fallback;
    if (typeof min === 'number' && parsed < min) parsed = min;
    if (typeof max === 'number' && parsed > max) parsed = max;
    return parsed;
  }
  function renderPaging(total, offset, limit, loadFn) {
    var lim = Math.max(limit, 1);
    var pages = Math.ceil((total || 0) / lim);
    if (!pages || pages <= 1) return '';
    var currentPage = Math.max(1, Math.min(pages, Math.floor(offset / lim) + 1));
    var windowSize = 7;
    var startPage = Math.max(1, currentPage - Math.floor(windowSize / 2));
    var endPage = Math.min(pages, startPage + windowSize - 1);
    if ((endPage - startPage + 1) < windowSize) {
      startPage = Math.max(1, endPage - windowSize + 1);
    }
    var paging = '';
    if (currentPage > 1) {
      paging += '<button class="btn" onclick="' + loadFn + '(' + Math.max(0, offset - lim) + ')">&laquo; ' + esc(TCi18n.t('adm.a.paging.prev')) + '</button>';
    }
    for (var page = startPage; page <= endPage; page++) {
      var pageOffset = (page - 1) * lim;
      var cls = page === currentPage ? ' primary' : '';
      paging += '<button class="btn' + cls + '" onclick="' + loadFn + '(' + pageOffset + ')">' + page + '</button>';
    }
    if (currentPage < pages) {
      paging += '<button class="btn" onclick="' + loadFn + '(' + (currentPage * lim) + ')">' + esc(TCi18n.t('adm.a.paging.next')) + ' &raquo;</button>';
    }
    return paging;
  }
  function renderUsersPaging(total) {
    return renderPaging(total, usersOffset, usersLimit, 'loadUsers');
  }
  function renderOrgsPaging(total) {
    return renderPaging(total, orgsOffset, orgsLimit, 'loadOrgs');
  }
  function renderBackofficeRequestsPaging(total) {
    return renderPaging(total, boReqOffset, boReqLimit, 'loadBackofficeRequests');
  }
  function renderStrategicPaging(total) {
    return renderPaging(total, scOffset, scLimit, 'loadStrategicRequests');
  }
  function getRequestedTab() {
    return new URLSearchParams(window.location.search).get('tab') || '';
  }
  function setRequestedTab(tab) {
    var url = new URL(window.location.href);
    if (tab) url.searchParams.set('tab', tab);
    else url.searchParams.delete('tab');
    window.history.replaceState({}, '', url.toString());
  }
  function allowedTabs() {
    return (((controlCenter || {}).context || {}).access || {}).allowed_tabs || [];
  }
  function renderStatCells(items, className) {
    return (items || []).map(function (item) {
      return '<div class="' + className + '">' +
        '<span class="' + className + '__label">' + esc(item.label) + '</span>' +
        '<span class="' + className + '__value">' + esc(item.value) + '</span>' +
      '</div>';
    }).join('');
  }
  function renderAction(action, primary) {
    if (!action || !action.label) return '';
    var cls = primary ? 'admin-card-action admin-card-action--primary' : 'admin-card-link';
    if (action.type === 'tab' && action.target) {
      return '<button type="button" class="' + cls + '" data-action-type="tab" data-target="' + esc(action.target) + '">' + esc(action.label) + '</button>';
    }
    if (action.href) {
      return '<a class="' + cls + '" href="' + esc(action.href) + '">' + esc(action.label) + '</a>';
    }
    return '';
  }
  function iconForCard(key) {
    return {
      admin: '&#128295;',
      users_orgs: '&#128101;',
      audit_log: '&#128220;',
      platform_metrics: '&#128202;',
      sso_saml: '&#128274;',
      workflows: '&#9881;'
    }[key] || '&#128195;';
  }
  function stateToneClass(state) {
    if (state === 'active') return 'admin-card-state--active';
    if (state === 'restricted' || state === 'enterprise_only') return 'admin-card-state--restricted';
    if (state === 'admin_only') return 'admin-card-state--admin_only';
    return 'admin-card-state--planned';
  }
  function statusTag(status) {
    if (status === 'SUCCESS') return '<span class="tag green">SUCCESS</span>';
    if (status === 'DENIED') return '<span class="tag red">DENIED</span>';
    if (status === 'FAILED') return '<span class="tag muted">FAILED</span>';
    return '<span class="tag muted">' + esc(status || '–') + '</span>';
  }
  function setAdminRevenueExportStatus(message, tone) {
    var target = el('adminRevenueExportStatus');
    if (!target) return;
    target.style.color = tone === 'good'
      ? 'var(--good)'
      : tone === 'bad'
        ? 'var(--bad)'
        : tone === 'warn'
          ? 'var(--warn)'
          : 'var(--muted)';
    target.textContent = message || '';
  }
  function setAdminRevenueExportButtonsDisabled(disabled) {
    Array.prototype.slice.call(document.querySelectorAll('button[onclick*="exportAdminRevenueFinanceTruth"]')).forEach(function (button) {
      button.disabled = !!disabled;
    });
  }
  function parseFileNameFromDisposition(headerValue, fallback) {
    if (!headerValue) return fallback;
    var match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(headerValue);
    var raw = match ? (match[1] || match[2]) : null;
    if (!raw) return fallback;
    try { return decodeURIComponent(raw); } catch (_err) { return raw; }
  }
  function triggerBlobDownload(blob, fileName) {
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(function () {
      URL.revokeObjectURL(link.href);
      link.remove();
    }, 1500);
  }

  function renderContextPanel() {
    var context = controlCenter.context || {};
    var user = context.user || {};
    var access = context.access || {};
    currentAdminUserId = user.id || null;
    el('adminContextPanel').innerHTML =
      '<div class="admin-context-panel__head">' +
        '<div>' +
          '<h2 class="admin-context-panel__title">' + esc(TCi18n.t('adm.a.ctx.title')) + '</h2>' +
          '<p class="admin-context-panel__desc">' + esc(TCi18n.t('adm.a.ctx.desc')) + '</p>' +
        '</div>' +
        '<span class="admin-card-state ' + stateToneClass(access.is_admin ? 'active' : 'admin_only') + '">' + esc(access.access_level || 'restricted') + '</span>' +
      '</div>' +
      '<div class="admin-context-stats">' +
        renderStatCells([
          { label: TCi18n.t('adm.a.ctx.users'), value: controlCenter.summary.total_users || 0 },
          { label: TCi18n.t('adm.a.ctx.orgs'), value: controlCenter.summary.total_orgs || 0 },
          { label: TCi18n.t('adm.a.ctx.plan'), value: user.plan_display_label || displayPlanLabel(user.plan) },
          { label: TCi18n.t('adm.a.ctx.org'), value: user.org_name || TCi18n.t('adm.a.ctx.noOrg') }
        ], 'admin-context-stat') +
      '</div>';

    el('adminWorkspaceMeta').innerHTML = renderStatCells([
      { label: TCi18n.t('adm.a.ctx.role'), value: user.org_role || user.role || 'restricted' },
      { label: TCi18n.t('adm.a.ctx.backlog'), value: controlCenter.summary.requisition_backlog || 0 },
      { label: TCi18n.t('adm.a.ctx.audit30'), value: controlCenter.summary.audit_events_30d || 0 }
    ], 'admin-workspace__meta-item');
  }

  function renderRoadmap() {
    var roadmap = (((controlCenter || {}).context || {}).roadmap) || [];
    el('adminRoadmap').innerHTML =
      '<div class="admin-roadmap-panel__head">' +
        '<div>' +
          '<h2 class="admin-roadmap-panel__title">' + esc(TCi18n.t('adm.a.roadmap.title')) + '</h2>' +
          '<p class="admin-roadmap-panel__desc">' + esc(TCi18n.t('adm.a.roadmap.desc')) + '</p>' +
        '</div>' +
      '</div>' +
      '<ol class="admin-roadmap-list">' +
        roadmap.map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') +
      '</ol>';
  }

  function renderStateBanner() {
    var banner = el('adminStateBanner');
    var access = (((controlCenter || {}).context || {}).access) || {};
    if (access.is_admin) {
      banner.hidden = true;
      banner.className = 'admin-state-banner';
      banner.innerHTML = '';
      return;
    }
    banner.hidden = false;
    banner.className = 'admin-state-banner admin-state-banner--neutral';
    banner.innerHTML =
      '<div class="admin-state-banner__head">' +
        '<div>' +
          '<h2 class="admin-state-banner__title">' + esc(TCi18n.t('adm.a.banner.title')) + '</h2>' +
          '<p class="admin-state-banner__desc">' + esc(TCi18n.t('adm.a.banner.desc')) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="admin-card-actions">' +
        '<a class="admin-card-action admin-card-action--primary" href="/public/organization.html?tab=members">' + esc(TCi18n.t('adm.a.banner.toOrg')) + '</a>' +
        '<a class="admin-card-action" href="/public/executive_dashboard.html">' + esc(TCi18n.t('adm.a.banner.toExec')) + '</a>' +
      '</div>';
  }

  function renderHubCards() {
    var cards = controlCenter.cards || {};
    var order = controlCenter.card_order || Object.keys(cards);
    el('adminHubGrid').innerHTML = order.map(function (key) {
      var card = cards[key];
      if (!card) return '';
      return '<article class="ds-hub-card admin-hub-card admin-hub-card--' + esc(card.state) + '">' +
        '<div class="ds-hub-card__icon">' + iconForCard(key) + '</div>' +
        '<div class="ds-hub-card__content">' +
          '<div class="admin-card-head">' +
            '<div>' +
              '<div class="ds-hub-card__title">' + esc(card.title) + '</div>' +
              '<p class="ds-hub-card__desc">' + esc(card.description || '') + '</p>' +
            '</div>' +
            '<span class="admin-card-state ' + stateToneClass(card.state) + '">' + esc(card.badge || card.state) + '</span>' +
          '</div>' +
          '<div class="admin-card-summary">' + renderStatCells(card.summary || [], 'admin-card-summary__item') + '</div>' +
          '<div class="admin-card-access">' + esc(card.access_message || '') + '</div>' +
          (card.primary_action ? '<div class="admin-card-actions">' + renderAction(card.primary_action, true) + '</div>' : '') +
          ((card.support_links || []).length ? '<div class="admin-card-links">' + card.support_links.map(function (item) { return renderAction(item, false); }).join('') + '</div>' : '') +
          (card.maturity_note ? '<div class="admin-card-maturity">' + esc(card.maturity_note) + '</div>' : '') +
        '</div>' +
      '</article>';
    }).join('');
  }

  function configureWorkspace() {
    var workspace = el('admin-content');
    var tabs = allowedTabs();
    Array.from(document.querySelectorAll('#tabBar .tab-btn')).forEach(function (button) {
      button.style.display = tabs.indexOf(button.dataset.tab) >= 0 ? '' : 'none';
    });
    if (!tabs.length) {
      workspace.style.display = 'none';
      return;
    }
    workspace.style.display = 'block';
    var requested = getRequestedTab();
    var fallback = tabs.indexOf('users') >= 0 ? 'users' : tabs[0];
    openTab(tabs.indexOf(requested) >= 0 ? requested : fallback, { updateUrl: true, force: true });
  }

  function openTab(tab, options) {
    options = options || {};
    if (!tab || allowedTabs().indexOf(tab) < 0) return;
    document.querySelectorAll('#tabBar .tab-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-panel').forEach(function (panel) {
      panel.classList.toggle('active', panel.id === ('tab-' + tab));
    });
    if (options.updateUrl !== false) setRequestedTab(tab);
    ensureTabLoaded(tab, options.force === true);
  }

  function ensureTabLoaded(tab, force) {
    if (tab === 'users') return loadUsers(force ? 0 : usersOffset);
    if (tab === 'orgs' && (force || !el('orgsTable').innerHTML)) return loadOrgs(force ? 0 : orgsOffset);
    if (tab === 'audit' && (force || !el('auditTable').innerHTML)) return loadAudit();
    if (tab === 'metrics' && (force || !el('metricsGrid').innerHTML)) return loadMetrics();
    if (tab === 'activity' && (force || !el('activityTimeline').innerHTML)) return loadActivityFeed();
    if (tab === 'requests' && (force || !el('boRequestsTable').innerHTML)) return loadBackofficeRequests(force ? 0 : boReqOffset);
    if (tab === 'strategic' && (force || !el('strategicTable').innerHTML)) return loadStrategicRequests(force ? 0 : scOffset);
    if (tab === 'revenue' && (force || !el('revenueGrid').innerHTML)) return loadRevenue();
    if (tab === 'features') return loadFeatureOverrides();
    if (tab === 'releases' && typeof window.loadProductReleases === 'function') return window.loadProductReleases();
  }

  async function loadUsers(offset) {
    var usersTable = el('usersTable');
    var usersPaging = el('usersPaging');
    if (!usersTable || !usersPaging) return;
    usersOffset = toInteger(offset, 0, 0);
    var searchInput = el('userSearch');
    var q = searchInput ? searchInput.value.trim() : '';
    usersTable.innerHTML = '<p class="ds-text-sm ds-text-muted">' + esc(TCi18n.t('adm.a.users.loading')) + '</p>';
    usersPaging.innerHTML = '';
    try {
      var d = await TC.api.get('/admin/users?limit=' + usersLimit + '&offset=' + usersOffset + (q ? '&q=' + encodeURIComponent(q) : ''));
      var payload = (d && d.data) || {};
      usersLimit = toInteger(payload.limit, usersLimit, 1, 500);
      usersOffset = toInteger(payload.offset, usersOffset, 0);
      var items = Array.isArray(payload.items) ? payload.items : [];
      var total = toInteger(payload.total, 0, 0);
      // Scope-Transparenz: der Server sagt, wessen Daten das sind. Rolle und
      // Tarif sind Plattform-Felder — ein Kunden-Admin bekommt dafuer 403.
      // Ohne diese Abfrage stuenden hier zwei tote Auswahlfelder (Befund 8.1.1 d).
      var plattformweit = !payload.scope || payload.scope.plattformweit === true;
      if (!items.length) {
        usersTable.innerHTML = emptyState(TCi18n.t('adm.a.users.empty'));
        return;
      }

      var html = '<table class="admin-table"><thead><tr>' +
        '<th>' + esc(TCi18n.t('adm.a.users.colEmail')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.users.colCompany')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.users.colOrg')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.users.colOrgRole')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.users.colPlan')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.users.colVerified')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.users.colActions')) + '</th>' +
        '</tr></thead><tbody>';
      items.forEach(function (u) {
        var userId = safeJson(u.id);
        var userPlan = String(u.plan || 'DEMO').toUpperCase();
        var actions = '';
        if (plattformweit) {
          actions += '<select onchange="adminEditUser(' + userId + ',&quot;role&quot;,this.value)" class="ds-select ds-select--xs">';
          ['company', 'agency', 'admin', 'inactive'].forEach(function (role) {
            actions += '<option value="' + role + '"' + (u.role === role ? ' selected' : '') + '>' + role + '</option>';
          });
          actions += '</select>';
          actions += '<select onchange="adminEditUser(' + userId + ',&quot;plan&quot;,this.value)" class="ds-select ds-select--xs">';
          ['DEMO', 'BASIS', 'PLUS', 'PRO', 'INDIVIDUELL'].forEach(function (plan) {
            var selected = userPlan === plan || (plan === 'INDIVIDUELL' && userPlan === 'ENTERPRISE') || (plan === 'DEMO' && userPlan === 'FREE');
            actions += '<option value="' + plan + '"' + (selected ? ' selected' : '') + '>' + esc(displayPlanLabel(plan)) + '</option>';
          });
          actions += '</select>';
        }
        if (!u.is_verified) actions += ' <button class="btn good ds-btn--xs" onclick="adminEditUser(' + userId + ',&quot;is_verified&quot;,true)">' + esc(TCi18n.t('adm.a.users.verify')) + '</button>';
        if (u.role !== 'inactive') actions += ' <button class="btn bad ds-btn--xs" onclick="adminDeactivate(' + userId + ')">' + esc(TCi18n.t('adm.a.users.deactivate')) + '</button>';

        html += '<tr>' +
          '<td>' + esc(u.email || '') + '</td>' +
          '<td>' + esc(u.company_name || '–') + '</td>' +
          '<td>' + esc(u.org_name || '–') + '</td>' +
          '<td><span class="tag blue">' + esc(u.org_role || '–') + '</span></td>' +
          '<td>' + esc(displayPlanLabel(userPlan || 'DEMO')) + '</td>' +
          '<td>' + (u.is_verified ? '<span class="tag green">' + esc(TCi18n.t('adm.a.common.yes')) + '</span>' : '<span class="tag red">' + esc(TCi18n.t('adm.a.common.no')) + '</span>') + '</td>' +
          '<td style="white-space:nowrap">' + actions + '</td>' +
        '</tr>';
      });
      html += '</tbody></table>';
      usersTable.innerHTML = html;
      usersPaging.innerHTML = renderUsersPaging(total);
    } catch (e) {
      usersTable.innerHTML = '<p class="ds-text-sm" style="color:var(--bad)">' + esc(describeError(e, TCi18n.t('adm.a.users.loadFail'))) + '</p>';
      usersPaging.innerHTML = '';
    }
  }

  async function loadOrgs(offset) {
    var orgsTable = el('orgsTable');
    var orgsPaging = el('orgsPaging');
    if (!orgsTable) return;
    orgsOffset = toInteger(offset, 0, 0);
    orgsTable.innerHTML = '<p class="ds-text-sm ds-text-muted">' + esc(TCi18n.t('adm.a.orgs.loading')) + '</p>';
    if (orgsPaging) orgsPaging.innerHTML = '';
    try {
      var d = await TC.api.get('/admin/organizations?limit=' + orgsLimit + '&offset=' + orgsOffset);
      var payload = (d && d.data) || {};
      orgsLimit = toInteger(payload.limit, orgsLimit, 1, 500);
      orgsOffset = toInteger(payload.offset, orgsOffset, 0);
      var items = Array.isArray(payload.items) ? payload.items : [];
      var total = toInteger(payload.total, 0, 0);
      if (!items.length) {
        orgsTable.innerHTML = emptyState(TCi18n.t('adm.a.orgs.empty'));
        return;
      }
      var currentOrgId = ((((controlCenter || {}).context || {}).user || {}).org_id) || '';
      var html = '<table class="admin-table"><thead><tr>' +
        '<th>' + esc(TCi18n.t('adm.a.orgs.colName')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.orgs.colType')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.orgs.colPlan')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.orgs.colMembers')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.orgs.colLocations')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.orgs.colStatus')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.orgs.colAction')) + '</th>' +
        '</tr></thead><tbody>';
      items.forEach(function (o) {
        var currentLink = String(o.id || '') === String(currentOrgId || '')
          ? '<a class="btn ds-btn--xs" href="/public/organization.html?tab=members">' + esc(TCi18n.t('adm.a.orgs.center')) + '</a>'
          : '–';
        html += '<tr>' +
          '<td>' + esc(o.name || '') + '</td>' +
          '<td>' + esc(o.org_type || '–') + '</td>' +
          '<td>' + esc(displayPlanLabel(o.plan || 'DEMO')) + '</td>' +
          '<td>' + (o.member_count || 0) + '</td>' +
          '<td>' + (o.location_count || 0) + '</td>' +
          '<td>' + (o.is_active ? '<span class="tag green">' + esc(TCi18n.t('adm.a.orgs.active')) + '</span>' : '<span class="tag red">' + esc(TCi18n.t('adm.a.orgs.inactive')) + '</span>') + '</td>' +
          '<td>' + currentLink + '</td>' +
        '</tr>';
      });
      html += '</tbody></table>';
      orgsTable.innerHTML = html;
      if (orgsPaging) orgsPaging.innerHTML = renderOrgsPaging(total);
    } catch (e) {
      orgsTable.innerHTML = '<p class="ds-text-sm" style="color:var(--bad)">' + esc(describeError(e, TCi18n.t('adm.a.orgs.loadFail'))) + '</p>';
      if (orgsPaging) orgsPaging.innerHTML = '';
    }
  }

  function syncAuditExportLink(params) {
    el('auditExportLink').href = '/api/admin/audit-log/export/csv' + (params.length ? '?' + params.join('&') : '');
  }

  async function loadAudit() {
    var params = [];
    var actor = el('auditActor').value.trim(); if (actor) params.push('actor_search=' + encodeURIComponent(actor));
    var org = el('auditOrg').value.trim(); if (org) params.push('org_search=' + encodeURIComponent(org));
    var entityType = el('auditEntity').value.trim(); if (entityType) params.push('entity_type=' + encodeURIComponent(entityType));
    var action = el('auditAction').value.trim(); if (action) params.push('action=' + encodeURIComponent(action));
    var actionType = el('auditActionType').value; if (actionType) params.push('action_type=' + encodeURIComponent(actionType));
    var status = el('auditStatus').value; if (status) params.push('status=' + encodeURIComponent(status));
    var from = el('auditFrom').value; if (from) params.push('from=' + encodeURIComponent(from));
    var to = el('auditTo').value; if (to) params.push('to=' + encodeURIComponent(to));
    params.push('limit=100');
    syncAuditExportLink(params);

    var d = await TC.api.get('/admin/audit-log?' + params.join('&'));
    var items = (d.data && d.data.items) || [];
    el('auditDetail').innerHTML = '';
    if (!items.length) {
      el('auditTable').innerHTML = emptyState(TCi18n.t('adm.a.audit.empty'));
      return;
    }

    var html = '<table class="admin-table"><thead><tr>' +
      '<th>' + esc(TCi18n.t('adm.a.audit.colTime')) + '</th>' +
      '<th>' + esc(TCi18n.t('adm.a.audit.colAction')) + '</th>' +
      '<th>' + esc(TCi18n.t('adm.a.audit.colResource')) + '</th>' +
      '<th>' + esc(TCi18n.t('adm.a.audit.colActor')) + '</th>' +
      '<th>' + esc(TCi18n.t('adm.a.audit.colOrg')) + '</th>' +
      '<th>' + esc(TCi18n.t('adm.a.audit.colStatus')) + '</th>' +
      '<th></th></tr></thead><tbody>';
    items.forEach(function (a) {
      var detailBtn = (a.entity_type && a.entity_id)
        ? '<button class="btn ds-btn--xs" onclick="loadAuditRecentChanges(' + safeJson(a.entity_type) + ',' + safeJson(a.entity_id) + ')">' + esc(TCi18n.t('adm.a.common.details')) + '</button>'
        : '';
      html += '<tr>' +
        '<td style="white-space:nowrap">' + esc(formatDateTime(a.created_at)) + '</td>' +
        '<td><strong>' + esc(a.action_label || a.action || '') + '</strong><div class="ds-text-sm" style="color:var(--muted)">' + esc(a.action_type || '–') + '</div></td>' +
        '<td>' + esc(a.resource || ((a.entity_type || '') + ' #' + (a.entity_id || ''))) + '</td>' +
        '<td>' + esc(a.user || a.actor_email || a.actor_id || '–') + '</td>' +
        '<td>' + esc(a.org_name || a.org_id || '–') + '</td>' +
        '<td>' + statusTag(a.status) + '</td>' +
        '<td>' + detailBtn + '</td>' +
      '</tr>';
    });
    html += '</tbody></table>';
    el('auditTable').innerHTML = html;
  }

  async function loadAuditRecentChanges(entityType, entityId) {
    el('auditDetail').innerHTML = '<p class="ds-text-sm ds-text-muted">' + esc(TCi18n.t('adm.a.audit.detailsLoading')) + '</p>';
    var d = await TC.api.get('/admin/audit-log/recent-changes?entity_type=' + encodeURIComponent(entityType) + '&entity_id=' + encodeURIComponent(entityId));
    var items = (d.data && d.data.items) || [];
    if (!items.length) {
      el('auditDetail').innerHTML = emptyState(TCi18n.t('adm.a.audit.detailsEmpty'));
      return;
    }
    el('auditDetail').innerHTML =
      '<h3 class="admin-detail-panel__title">' + esc(TCi18n.t('adm.a.audit.recentTitle')) + ' – ' + esc(entityType) + ' #' + esc(entityId) + '</h3>' +
      '<div class="admin-detail-list">' +
      items.map(function (item) {
        return '<div class="admin-detail-item">' +
          '<div class="admin-detail-item__meta">' +
            '<span>' + esc(formatDateTime(item.created_at)) + '</span>' +
            '<span>' + esc(item.actor_name || item.actor_email || '–') + '</span>' +
            '<span>' + esc(item.action_type || '–') + '</span>' +
            '<span>' + esc(item.status || '–') + '</span>' +
          '</div>' +
          '<div class="admin-detail-item__action">' + esc(item.action || '') + '</div>' +
          ((item.old_values || item.new_values || item.details)
            ? '<code>' + esc(JSON.stringify(item.new_values || item.details || item.old_values, null, 2)) + '</code>'
            : '<div class="ds-text-sm" style="color:var(--muted)">' + esc(TCi18n.t('adm.a.audit.noDetails')) + '</div>') +
        '</div>';
      }).join('') +
      '</div>';
  }

  function renderMetricBreakdown(title, map) {
    var entries = Object.keys(map || {});
    if (!entries.length) return '';
    return '<div style="margin-top:18px">' +
      '<h4 style="margin:0 0 8px;font-size:14px;font-weight:700">' + esc(title) + '</h4>' +
      '<table class="admin-table"><thead><tr><th>' + esc(TCi18n.t('adm.a.metrics.colType')) + '</th><th>' + esc(TCi18n.t('adm.a.metrics.colCount')) + '</th></tr></thead><tbody>' +
      entries.map(function (key) {
        return '<tr><td>' + esc(key) + '</td><td>' + esc(map[key]) + '</td></tr>';
      }).join('') +
      '</tbody></table>' +
    '</div>';
  }

  async function loadMetrics() {
    var d;
    try {
      d = await TC.api.get('/admin/metrics');
    } catch (e) {
      el('metricsGrid').innerHTML = '<div class="admin-empty">' + esc(TCi18n.t('adm.a.metrics.loadFail')) + '</div>';
      el('metricsDeepLinks').innerHTML = '';
      el('metricsDetail').innerHTML = '';
      return;
    }
    var m = d.data || {};
    /* "Aktive Personalangebote" und "Aktive Angebote" sind rollenabhaengige
       Begriffe (terminologyLabels: capacityOffers / capacityOffer). Diese Seite
       ist fuer company UND agency erreichbar — ein fester Woerterbuch-Wert waere
       fuer eine der beiden Seiten falsch. Sie bleiben daher bewusst deutsch. */
    var tiles = [
      { lbl: TCi18n.t('adm.a.metrics.usersTotal'), val: (m.users && m.users.total) || 0 },
      { lbl: TCi18n.t('adm.a.metrics.usersNew30'), val: (m.users && m.users.last_30d) || 0 },
      { lbl: TCi18n.t('adm.a.metrics.orgs'), val: (m.organizations && m.organizations.total) || 0 },
      { lbl: 'Aktive Personalangebote', val: (m.capacity_posts && m.capacity_posts.active) || 0 },
      { lbl: TCi18n.t('adm.a.metrics.reqBacklog'), val: (m.summary && m.summary.requisition_backlog) || 0 },
      { lbl: 'Aktive Angebote', val: (m.summary && m.summary.active_offers) || 0 },
      { lbl: TCi18n.t('adm.a.metrics.events30'), val: (m.summary && m.summary.event_total_30d) || 0 }
    ];
    el('metricsGrid').innerHTML = tiles.map(function (tile) {
      return '<div class="metric-tile"><div class="val">' + esc(tile.val) + '</div><div class="lbl">' + esc(tile.lbl) + '</div></div>';
    }).join('');

    /* requisitions_backlog traegt den rollenabhaengigen Begriff
       "Arbeitsplatzangebot" (terminologyLabels: demandList) und bleibt daher
       bewusst deutsch statt als fester Woerterbuch-Wert eingefroren. */
    var labels = {
      executive_dashboard: TCi18n.t('adm.a.metrics.linkExec'),
      organization_center: TCi18n.t('adm.a.metrics.linkOrg'),
      system_health: TCi18n.t('adm.a.metrics.linkHealth'),
      requisitions_backlog: 'Arbeitsplatzangebot-Backlog',
      activity_feed: TCi18n.t('adm.a.metrics.linkActivity')
    };
    var descriptions = {
      executive_dashboard: TCi18n.t('adm.a.metrics.descExec'),
      organization_center: TCi18n.t('adm.a.metrics.descOrg'),
      system_health: TCi18n.t('adm.a.metrics.descHealth'),
      requisitions_backlog: 'Offene Arbeitsplatzangebote prüfen.',
      activity_feed: TCi18n.t('adm.a.metrics.descActivity')
    };
    var drilldowns = m.drilldowns || {};
    el('metricsDeepLinks').innerHTML = Object.keys(drilldowns).map(function (key) {
      return '<a class="admin-link-card" href="' + esc(drilldowns[key]) + '">' +
        '<div class="admin-link-card__title">' + esc(labels[key] || key) + '</div>' +
        '<div class="admin-link-card__desc">' + esc(descriptions[key] || TCi18n.t('adm.a.metrics.descDefault')) + '</div>' +
      '</a>';
    }).join('');

    el('metricsDetail').innerHTML =
      '<div class="admin-context-stats">' +
        renderStatCells([
          { label: TCi18n.t('adm.a.metrics.statUsers'), value: (m.users && m.users.total) || 0 },
          { label: TCi18n.t('adm.a.metrics.statOrgs'), value: (m.organizations && m.organizations.total) || 0 },
          { label: 'Personalangebote', value: (m.capacity_posts && m.capacity_posts.active) || 0 },
          { label: TCi18n.t('adm.a.metrics.statEvents'), value: (m.events && m.events.total) || 0 }
        ], 'admin-context-stat') +
      '</div>' +
      renderMetricBreakdown('Arbeitsplatzangebote nach Status', m.requisitions || {}) +
      renderMetricBreakdown('Angebote nach Status', m.offers || {}) +
      renderMetricBreakdown(TCi18n.t('adm.a.metrics.breakdownEvents'), (m.events && m.events.by_type) || {});
  }

  async function exportAdminRevenueFinanceTruth(format) {
    var normalized = String(format || '').toLowerCase();
    if (normalized !== 'csv' && normalized !== 'json') return;
    setAdminRevenueExportButtonsDisabled(true);
    setAdminRevenueExportStatus(TCi18n.t('adm.a.rev.exportRunning'), 'muted');
    try {
      if (normalized === 'csv') {
        var response = await TC.api.request('/reporting/finance-truth/export?format=csv', { method: 'GET', rawResponse: true });
        var csvBlob = await response.blob();
        var csvName = parseFileNameFromDisposition(
          response.headers.get('content-disposition'),
          'finance-truth-' + new Date().toISOString().slice(0, 10) + '.csv'
        );
        triggerBlobDownload(csvBlob, csvName);
      } else {
        var payload = await TC.api.get('/reporting/finance-truth/export?format=json');
        var jsonBlob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        var jsonName = 'finance-truth-' + new Date().toISOString().slice(0, 10) + '.json';
        triggerBlobDownload(jsonBlob, jsonName);
      }
      setAdminRevenueExportStatus(TCi18n.t('adm.a.rev.exportReady'), 'good');
    } catch (error) {
      setAdminRevenueExportStatus(TCi18n.t('adm.a.rev.exportFailed') + ': ' + ((error && error.message) || TCi18n.t('adm.a.common.unknown')), 'bad');
    } finally {
      setAdminRevenueExportButtonsDisabled(false);
    }
  }

  async function loadRevenue() {
    var target = el('revenueGrid');
    function exportToolbar(message) {
      return '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px">' +
        "<button class=\"btn\" type=\"button\" onclick=\"exportAdminRevenueFinanceTruth('csv')\">" + esc(TCi18n.t('adm.a.rev.exportCsv')) + "</button>" +
        "<button class=\"btn\" type=\"button\" onclick=\"exportAdminRevenueFinanceTruth('json')\">" + esc(TCi18n.t('adm.a.rev.exportJson')) + "</button>" +
        '<span id="adminRevenueExportStatus" class="ds-text-sm ds-text-muted" aria-live="polite">' + esc(message || TCi18n.t('adm.a.rev.exportHint')) + '</span>' +
      '</div>';
    }
    target.innerHTML = exportToolbar(TCi18n.t('adm.a.rev.loading')) + '<p class="ds-text-sm ds-text-muted">' + esc(TCi18n.t('adm.a.rev.loading')) + '</p>';
    try {
      var d = await TC.api.get('/admin/revenue');
      var m = d.data || {};
      var subscription = m.subscription_truth || {};
      var invoice = m.invoice_truth || {};
      var payment = m.payment_truth || {};
      var billable = m.billable_truth || {};
      var recon = m.reconciliation_30d || {};
      var retention = m.retention_truth || {};
      var pilotTruth = m.pilot_conversion_truth || {};
      var retHeadline = retention.headline || {};
      var retUsage = retention.usage_intensity || {};
      var pilotHeadline = pilotTruth.headline || {};
      var pilotTransitions = pilotTruth.transitions || {};
      var pilotStages = Array.isArray(pilotTruth.current_stage_distribution) ? pilotTruth.current_stage_distribution : [];
      var pilotTariffRows = ((((pilotTruth || {}).gtm_learning || {}).by_tariff_path) || []).slice(0, 5);
      var pilotIcpRows = ((((pilotTruth || {}).gtm_learning || {}).by_icp) || []).slice(0, 5);
      var pilotModules = (((pilotTruth || {}).gtm_learning || {}).product_area_usage) || [];
      var pilotAtRisk = ((((pilotTruth || {}).org_drilldown || {}).at_risk) || []).slice(0, 8);
      var pilotBottlenecks = ((((pilotTruth || {}).gtm_learning || {}).onboarding_bottlenecks) || []).slice(0, 5);
      var pilotQuality = pilotTruth.quality_flags || {};

      function toNumber(value, fallback) {
        var n = Number(value);
        return Number.isFinite(n) ? n : fallback;
      }
      function euro(value) {
        return toNumber(value, 0).toLocaleString(TCi18n.dateLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
      }
      function euroCents(cents) {
        return (toNumber(cents, 0) / 100).toLocaleString(TCi18n.dateLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
      }
      function percent(value) {
        if (value == null || !isFinite(Number(value))) return '–';
        return Number(value).toLocaleString(TCi18n.dateLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
      }
      function days(value) {
        if (value == null || !isFinite(Number(value))) return '–';
        return Number(value).toLocaleString(TCi18n.dateLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' d';
      }
      /* Stage-, Pfad- und Modulschluessel bleiben Server-Rohwerte; nur ihr
         Anzeigetext kommt aus dem Woerterbuch, unbekannte Werte fallen
         weiterhin auf den Rohwert zurueck. */
      function stageLabel(stage) {
        return TCi18n.t('adm.a.rev.stage.' + stage) || stage || '–';
      }
      function tariffPathLabel(path) {
        return TCi18n.t('adm.a.rev.path.' + path) || path || '–';
      }
      function moduleLabel(module) {
        return TCi18n.t('adm.a.rev.module.' + module) || module || '–';
      }
      function renderPricingSourceRows(rows) {
        if (!rows.length) return '<p class="ds-text-sm ds-text-muted">' + esc(TCi18n.t('adm.a.rev.pricingEmpty')) + '</p>';
        return '<table class="admin-table"><thead><tr>' +
          '<th>' + esc(TCi18n.t('adm.a.rev.colPricingSource')) + '</th>' +
          '<th>' + esc(TCi18n.t('adm.a.rev.colSubscribers')) + '</th>' +
          '<th>' + esc(TCi18n.t('adm.a.rev.colMrr')) + '</th>' +
          '<th>' + esc(TCi18n.t('adm.a.rev.colArr')) + '</th>' +
          '</tr></thead><tbody>' +
          rows.map(function (row) {
            return '<tr>' +
              '<td>' + esc(row.source || 'unknown') + '</td>' +
              '<td>' + esc(row.subscribers || 0) + '</td>' +
              '<td>' + esc(euro(row.mrr || 0)) + '</td>' +
              '<td>' + esc(euro(row.arr || 0)) + '</td>' +
            '</tr>';
          }).join('') +
          '</tbody></table>';
      }

      var pendingQuotes = toNumber((m.custom_quote_pending && m.custom_quote_pending.count) || subscription.pending_quote_subscribers || 0, 0);
      var spendInvoiceGap = toNumber(recon.spend_invoice_gap_cents || 0, 0);
      var coveragePct = recon.coverage_ratio_pct == null ? '–' : (String(recon.coverage_ratio_pct) + '%');
      var pricingRows = Array.isArray(m.pricing_state_breakdown) ? m.pricing_state_breakdown : [];

      var cards = [
        { lbl: TCi18n.t('adm.a.rev.kpiContractualMrr'), val: euro(subscription.contractually_active_mrr || m.mrr_total || 0), color: 'var(--ds-success)' },
        { lbl: TCi18n.t('adm.a.rev.kpiCatalogMrr'), val: euro(subscription.catalog_mrr_theoretical || m.catalog_mrr_theoretical || 0), color: 'var(--ds-brand)' },
        { lbl: TCi18n.t('adm.a.rev.kpiOpenReceivables'), val: euroCents(invoice.open_receivables_cents || 0), color: toNumber(invoice.overdue_receivables_cents || 0, 0) > 0 ? '#f87171' : 'var(--ds-warning)' },
        { lbl: TCi18n.t('adm.a.rev.kpiPaidRevenue'), val: euroCents(invoice.paid_revenue_cents || 0), color: 'var(--ds-success)' },
        { lbl: TCi18n.t('adm.a.rev.kpiBillable'), val: billable.available === false ? '–' : euroCents(billable.approved_uninvoiced_amount_cents || 0), color: 'var(--ds-accent)' },
        { lbl: TCi18n.t('adm.a.rev.kpiPendingQuotes'), val: pendingQuotes, color: pendingQuotes > 0 ? 'var(--ds-warning)' : 'var(--ds-success)' },
        { lbl: TCi18n.t('adm.a.rev.kpiCompletedPayments'), val: payment.available === false ? '–' : euroCents(payment.completed_amount_cents || 0), color: 'var(--ds-brand)' },
        { lbl: TCi18n.t('adm.a.rev.kpiGap'), val: recon.available === false ? '–' : euroCents(spendInvoiceGap), color: recon.available === false ? 'var(--ds-text-secondary)' : (spendInvoiceGap > 0 ? 'var(--ds-warning)' : 'var(--ds-success)') },
        { lbl: TCi18n.t('adm.a.rev.kpiActivePaidOrgs'), val: toNumber(retHeadline.active_paid_orgs || 0, 0), color: 'var(--ds-brand)' },
        { lbl: TCi18n.t('adm.a.rev.kpiRetainedLogos'), val: toNumber(retHeadline.retained_logos || 0, 0), color: 'var(--ds-success)' },
        { lbl: TCi18n.t('adm.a.rev.kpiLogoChurn'), val: percent(retHeadline.logo_churn_rate_pct), color: toNumber(retHeadline.logo_churn_rate_pct || 0, 0) >= 10 ? 'var(--bad)' : 'var(--ds-warning)' },
        { lbl: TCi18n.t('adm.a.rev.kpiNrr'), val: percent(retHeadline.net_revenue_retention_pct), color: toNumber(retHeadline.net_revenue_retention_pct || 0, 0) >= 100 ? 'var(--ds-success)' : 'var(--ds-warning)' },
        { lbl: TCi18n.t('adm.a.rev.kpiInactivePaying'), val: toNumber(retHeadline.inactive_but_paying_orgs || 0, 0), color: toNumber(retHeadline.inactive_but_paying_orgs || 0, 0) > 0 ? 'var(--ds-warning)' : 'var(--ds-success)' },
        { lbl: TCi18n.t('adm.a.rev.kpiPqa'), val: toNumber(retHeadline.pqa_orgs || 0, 0), color: '#4fa7ff' },
        { lbl: TCi18n.t('adm.a.rev.kpiActivePilots'), val: toNumber(pilotHeadline.active_pilots || 0, 0), color: 'var(--ds-brand)' },
        { lbl: TCi18n.t('adm.a.rev.kpiActivatedPilots'), val: toNumber(pilotHeadline.activated_pilots || 0, 0), color: '#4fa7ff' },
        { lbl: TCi18n.t('adm.a.rev.kpiConvertedPilots'), val: toNumber(pilotHeadline.converted_pilots || 0, 0), color: 'var(--ds-success)' },
        { lbl: TCi18n.t('adm.a.rev.kpiAtRiskPilots'), val: toNumber(pilotHeadline.at_risk_pilots || 0, 0), color: toNumber(pilotHeadline.at_risk_pilots || 0, 0) > 0 ? 'var(--ds-warning)' : 'var(--ds-success)' },
        { lbl: TCi18n.t('adm.a.rev.kpiDaysActivation'), val: days(pilotHeadline.avg_days_to_activation), color: 'var(--ds-text)' },
        { lbl: TCi18n.t('adm.a.rev.kpiDaysConversion'), val: days(pilotHeadline.avg_days_to_conversion), color: 'var(--ds-text)' }
      ];

      var html = exportToolbar(TCi18n.t('adm.a.rev.exportHint'));
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:20px">';
      cards.forEach(function (kpi) {
        html += '<div class="metric-tile"><div class="val" style="color:' + kpi.color + '">' + esc(kpi.val) + '</div><div class="lbl">' + esc(kpi.lbl) + '</div></div>';
      });
      html += '</div>';

      html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px">';
      html += '<div class="admin-detail-item"><h4 style="margin:0 0 8px">' + esc(TCi18n.t('adm.a.rev.secPricing')) + '</h4>' + renderPricingSourceRows(pricingRows) + '</div>';
      html += '<div class="admin-detail-item"><h4 style="margin:0 0 8px">' + esc(TCi18n.t('adm.a.rev.secInvoice')) + '</h4>' +
        '<div class="admin-context-stats">' + renderStatCells([
          { label: TCi18n.t('adm.a.rev.statDraft'), value: invoice.draft_count || 0 },
          { label: TCi18n.t('adm.a.rev.statIssued'), value: invoice.issued_count || 0 },
          { label: TCi18n.t('adm.a.rev.statOverdue'), value: invoice.overdue_count || 0 },
          { label: TCi18n.t('adm.a.rev.statPaid'), value: invoice.paid_count || 0 },
          { label: TCi18n.t('adm.a.rev.statVoid'), value: invoice.void_count || 0 }
        ], 'admin-context-stat') + '</div>' +
        '<p class="ds-text-sm ds-text-muted" style="margin-top:8px">' + esc(TCi18n.t('adm.a.rev.lblInvoiced')) + ': ' + esc(euroCents(invoice.invoiced_revenue_cents || 0)) + ' · ' + esc(TCi18n.t('adm.a.rev.lblPaid')) + ': ' + esc(euroCents(invoice.paid_revenue_cents || 0)) + ' · ' + esc(TCi18n.t('adm.a.rev.lblOpen')) + ': ' + esc(euroCents(invoice.open_receivables_cents || 0)) + '</p>' +
        (invoice.available === false ? '<p class="ds-text-sm ds-text-muted">' + esc(TCi18n.t('adm.a.rev.noteInvoice')) + '</p>' : '') +
      '</div>';
      html += '<div class="admin-detail-item"><h4 style="margin:0 0 8px">' + esc(TCi18n.t('adm.a.rev.secPayment')) + '</h4>' +
        '<div class="admin-context-stats">' + renderStatCells([
          { label: TCi18n.t('adm.a.rev.statCompleted'), value: payment.completed_count || 0 },
          { label: TCi18n.t('adm.a.rev.statPending'), value: payment.pending_count || 0 },
          { label: TCi18n.t('adm.a.rev.statFailed'), value: payment.failed_count || 0 },
          { label: TCi18n.t('adm.a.rev.statExpired'), value: payment.expired_count || 0 }
        ], 'admin-context-stat') + '</div>' +
        '<p class="ds-text-sm ds-text-muted" style="margin-top:8px">' + esc(TCi18n.t('adm.a.rev.lblCompletedAmount')) + ': ' + esc(euroCents(payment.completed_amount_cents || 0)) + '</p>' +
        (payment.available === false ? '<p class="ds-text-sm ds-text-muted">' + esc(TCi18n.t('adm.a.rev.notePayment')) + '</p>' : '') +
      '</div>';
      html += '<div class="admin-detail-item"><h4 style="margin:0 0 8px">' + esc(TCi18n.t('adm.a.rev.secBillable')) + '</h4>' +
        '<div class="admin-context-stats">' + renderStatCells([
          { label: TCi18n.t('adm.a.rev.statBillableTimesheets'), value: billable.approved_uninvoiced_timesheets || 0 },
          { label: TCi18n.t('adm.a.rev.statBillableHours'), value: toNumber(billable.approved_uninvoiced_hours || 0, 0).toLocaleString(TCi18n.dateLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' h' },
          { label: TCi18n.t('adm.a.rev.statMissingRate'), value: billable.missing_rate_count || 0 }
        ], 'admin-context-stat') + '</div>' +
        '<p class="ds-text-sm ds-text-muted" style="margin-top:8px">' + esc(TCi18n.t('adm.a.rev.lblBillableVolume')) + ': ' + esc(euroCents(billable.approved_uninvoiced_amount_cents || 0)) + '</p>' +
        (billable.available === false ? '<p class="ds-text-sm ds-text-muted">' + esc(TCi18n.t('adm.a.rev.noteBillable')) + '</p>' : '') +
      '</div>';
      html += '<div class="admin-detail-item"><h4 style="margin:0 0 8px">' + esc(TCi18n.t('adm.a.rev.secBridge')) + '</h4>' +
        '<p class="ds-text-sm ds-text-muted">' + esc(TCi18n.t('adm.a.rev.lblApprovedSpend')) + ': ' + esc(euroCents(recon.approved_spend_30d_cents || 0)) + '</p>' +
        '<p class="ds-text-sm ds-text-muted">' + esc(TCi18n.t('adm.a.rev.lblOperationalInvoiced')) + ': ' + esc(euroCents(recon.operational_invoiced_30d_cents || 0)) + '</p>' +
        '<p class="ds-text-sm ds-text-muted">' + esc(TCi18n.t('adm.a.rev.lblGap')) + ': ' + esc(euroCents(spendInvoiceGap)) + ' · ' + esc(TCi18n.t('adm.a.rev.lblCoverage')) + ': ' + esc(coveragePct) + '</p>' +
        (recon.available === false ? '<p class="ds-text-sm ds-text-muted">' + esc(TCi18n.t('adm.a.rev.noteRecon')) + '</p>' : '') +
      '</div>';
      html += '<div class="admin-detail-item"><h4 style="margin:0 0 8px">' + esc(TCi18n.t('adm.a.rev.secRetention')) + '</h4>' +
        '<div class="admin-context-stats">' + renderStatCells([
          { label: TCi18n.t('adm.a.rev.statActiveCustomer'), value: retHeadline.active_customer_orgs || 0 },
          { label: TCi18n.t('adm.a.rev.statPreviousCohort'), value: retHeadline.previous_active_customer_orgs || 0 },
          { label: TCi18n.t('adm.a.rev.statRetainedRate'), value: percent(retHeadline.retained_logo_rate_pct) },
          { label: TCi18n.t('adm.a.rev.statLogoChurn'), value: percent(retHeadline.logo_churn_rate_pct) },
          { label: TCi18n.t('adm.a.rev.statGrossChurn'), value: euro(retHeadline.gross_revenue_churn_mrr || 0) },
          { label: TCi18n.t('adm.a.rev.statExpansion'), value: euro(retHeadline.expansion_mrr || 0) },
          { label: TCi18n.t('adm.a.rev.kpiNrr'), value: percent(retHeadline.net_revenue_retention_pct) },
          { label: TCi18n.t('adm.a.rev.statPilotConverted'), value: retHeadline.pilot_converted_orgs_30d || 0 }
        ], 'admin-context-stat') + '</div>' +
        '<p class="ds-text-sm ds-text-muted" style="margin-top:8px">' + esc(TCi18n.t('adm.a.rev.lblUsageBands')) + ': High ' + esc(retUsage.high || 0) + ' · Medium ' + esc(retUsage.medium || 0) + ' · Low ' + esc(retUsage.low || 0) + ' · Dormant ' + esc(retUsage.dormant || 0) + '</p>' +
        '<p class="ds-text-sm ds-text-muted">' + esc(TCi18n.t('adm.a.rev.lblAtRiskAccounts')) + ': ' + esc((((retention.org_drilldown || {}).at_risk || []).length || 0)) + ' · ' + esc(TCi18n.t('adm.a.rev.lblPqa')) + ': ' + esc((((retention.org_drilldown || {}).pqa || []).length || 0)) + '</p>' +
        ((retention.quality_flags && retention.quality_flags.usage_source_available === false) ? '<p class="ds-text-sm ds-text-muted">' + esc(TCi18n.t('adm.a.rev.noteUsage')) + '</p>' : '') +
      '</div>';
      html += '<div class="admin-detail-item"><h4 style="margin:0 0 8px">' + esc(TCi18n.t('adm.a.rev.secPilot')) + '</h4>' +
        '<div class="admin-context-stats">' + renderStatCells([
          { label: TCi18n.t('adm.a.rev.statTrackedOrgs'), value: pilotHeadline.tracked_orgs || 0 },
          { label: TCi18n.t('adm.a.rev.statLeads'), value: pilotHeadline.leads || 0 },
          { label: TCi18n.t('adm.a.rev.statQualified'), value: pilotHeadline.qualified || 0 },
          { label: TCi18n.t('adm.a.rev.statRegistered'), value: pilotHeadline.registered || 0 },
          { label: TCi18n.t('adm.a.rev.kpiActivePilots'), value: pilotHeadline.active_pilots || 0 },
          { label: TCi18n.t('adm.a.rev.kpiActivatedPilots'), value: pilotHeadline.activated_pilots || 0 },
          { label: TCi18n.t('adm.a.rev.kpiConvertedPilots'), value: pilotHeadline.converted_pilots || 0 },
          { label: TCi18n.t('adm.a.rev.kpiAtRiskPilots'), value: pilotHeadline.at_risk_pilots || 0 }
        ], 'admin-context-stat') + '</div>' +
        '<p class="ds-text-sm ds-text-muted" style="margin-top:8px">' + esc(TCi18n.t('adm.a.rev.lblPilotToActivated')) + ': ' + esc(percent((pilotTransitions.pilot_started_to_activated || {}).rate_pct)) + ' · ' + esc(TCi18n.t('adm.a.rev.lblActivatedToPaid')) + ': ' + esc(percent((pilotTransitions.activated_to_paid_live || {}).rate_pct)) + ' · ' + esc(TCi18n.t('adm.a.rev.lblPilotToLost')) + ': ' + esc(percent((pilotTransitions.pilot_to_lost || {}).rate_pct)) + '</p>' +
        '<p class="ds-text-sm ds-text-muted">' + esc(TCi18n.t('adm.a.rev.kpiDaysActivation')) + ': ' + esc(days(pilotHeadline.avg_days_to_activation)) + ' · ' + esc(TCi18n.t('adm.a.rev.kpiDaysConversion')) + ': ' + esc(days(pilotHeadline.avg_days_to_conversion)) + '</p>' +
        (pilotQuality.pre_registration_lead_capture_available === false ? '<p class="ds-text-sm ds-text-muted">' + esc(TCi18n.t('adm.a.rev.noteLeadCapture')) + '</p>' : '') +
        (pilotQuality.pricing_clarity_timestamps_partially_inferred ? '<p class="ds-text-sm ds-text-muted">' + esc(TCi18n.t('adm.a.rev.notePricingClarity')) + '</p>' : '') +
      '</div>';
      html += '<div class="admin-detail-item"><h4 style="margin:0 0 8px">' + esc(TCi18n.t('adm.a.rev.secFunnel')) + '</h4>' +
        '<div style="overflow:auto">' +
          '<table class="admin-table"><thead><tr><th>' + esc(TCi18n.t('adm.a.rev.colStage')) + '</th><th>' + esc(TCi18n.t('adm.a.rev.colOrgs')) + '</th><th>' + esc(TCi18n.t('adm.a.rev.colAvgDays')) + '</th><th>' + esc(TCi18n.t('adm.a.rev.colAtRisk')) + '</th></tr></thead><tbody>' +
            (pilotStages.length ? pilotStages.map(function (row) {
              return '<tr>' +
                '<td>' + esc(stageLabel(row.stage)) + '</td>' +
                '<td>' + esc(row.orgs || 0) + '</td>' +
                '<td>' + esc(days(row.avg_days_in_stage)) + '</td>' +
                '<td>' + esc(row.at_risk_orgs || 0) + '</td>' +
              '</tr>';
            }).join('') : '<tr><td colspan="4">' + esc(TCi18n.t('adm.a.rev.emptyStages')) + '</td></tr>') +
          '</tbody></table>' +
        '</div>' +
        '<div style="overflow:auto;margin-top:12px">' +
          '<table class="admin-table"><thead><tr><th>' + esc(TCi18n.t('adm.a.rev.colTransition')) + '</th><th>' + esc(TCi18n.t('adm.a.rev.colCohort')) + '</th><th>' + esc(TCi18n.t('adm.a.rev.colConverted')) + '</th><th>' + esc(TCi18n.t('adm.a.rev.colRate')) + '</th></tr></thead><tbody>' +
            [
              { label: TCi18n.t('adm.a.rev.trLeadRegistered'), data: pilotTransitions.lead_to_registered || {} },
              { label: TCi18n.t('adm.a.rev.trRegisteredPilot'), data: pilotTransitions.registration_to_pilot_started || {} },
              { label: TCi18n.t('adm.a.rev.trPilotActivated'), data: pilotTransitions.pilot_started_to_activated || {} },
              { label: TCi18n.t('adm.a.rev.trActivatedPaid'), data: pilotTransitions.activated_to_paid_live || {} },
              { label: TCi18n.t('adm.a.rev.trPilotLost'), data: pilotTransitions.pilot_to_lost || {} }
            ].map(function (row) {
              return '<tr>' +
                '<td>' + esc(row.label) + '</td>' +
                '<td>' + esc(row.data.cohort_count || 0) + '</td>' +
                '<td>' + esc(row.data.converted_count || 0) + '</td>' +
                '<td>' + esc(percent(row.data.rate_pct)) + '</td>' +
              '</tr>';
            }).join('') +
          '</tbody></table>' +
        '</div>' +
        (pilotAtRisk.length ? '<div style="overflow:auto;margin-top:12px"><table class="admin-table"><thead><tr><th>' + esc(TCi18n.t('adm.a.rev.colOrg')) + '</th><th>' + esc(TCi18n.t('adm.a.rev.colStage')) + '</th><th>' + esc(TCi18n.t('adm.a.rev.colRisk')) + '</th><th>' + esc(TCi18n.t('adm.a.rev.colHints')) + '</th></tr></thead><tbody>' +
          pilotAtRisk.map(function (row) {
            return '<tr>' +
              '<td>' + esc(row.org_name || row.org_id || '–') + '</td>' +
              '<td>' + esc(stageLabel(row.current_stage)) + '</td>' +
              '<td>' + esc(row.risk_score || 0) + '</td>' +
              '<td>' + esc(((row.risk_reasons || []).slice(0, 2)).join(' · ') || '–') + '</td>' +
            '</tr>';
          }).join('') +
        '</tbody></table></div>' : '') +
      '</div>';
      html += '<div class="admin-detail-item"><h4 style="margin:0 0 8px">' + esc(TCi18n.t('adm.a.rev.secGtm')) + '</h4>' +
        '<div style="overflow:auto">' +
          '<table class="admin-table"><thead><tr><th>' + esc(TCi18n.t('adm.a.rev.colPath')) + '</th><th>' + esc(TCi18n.t('adm.a.rev.colTracked')) + '</th><th>' + esc(TCi18n.t('adm.a.rev.colActivated')) + '</th><th>' + esc(TCi18n.t('adm.a.rev.colConverted')) + '</th></tr></thead><tbody>' +
            (pilotTariffRows.length ? pilotTariffRows.map(function (row) {
              return '<tr>' +
                '<td>' + esc(tariffPathLabel(row.label || row.key)) + '</td>' +
                '<td>' + esc(row.tracked_orgs || 0) + '</td>' +
                '<td>' + esc(percent(row.activation_rate_pct)) + '</td>' +
                '<td>' + esc(percent(row.conversion_rate_pct)) + '</td>' +
              '</tr>';
            }).join('') : '<tr><td colspan="4">' + esc(TCi18n.t('adm.a.rev.emptyTariffs')) + '</td></tr>') +
          '</tbody></table>' +
        '</div>' +
        '<div style="overflow:auto;margin-top:12px">' +
          '<table class="admin-table"><thead><tr><th>' + esc(TCi18n.t('adm.a.rev.colIcp')) + '</th><th>' + esc(TCi18n.t('adm.a.rev.colTracked')) + '</th><th>' + esc(TCi18n.t('adm.a.rev.colActivated')) + '</th><th>' + esc(TCi18n.t('adm.a.rev.colConverted')) + '</th></tr></thead><tbody>' +
            (pilotIcpRows.length ? pilotIcpRows.map(function (row) {
              return '<tr>' +
                '<td>' + esc(row.label || row.key || '–') + '</td>' +
                '<td>' + esc(row.tracked_orgs || 0) + '</td>' +
                '<td>' + esc(percent(row.activation_rate_pct)) + '</td>' +
                '<td>' + esc(percent(row.conversion_rate_pct)) + '</td>' +
              '</tr>';
            }).join('') : '<tr><td colspan="4">' + esc(TCi18n.t('adm.a.rev.emptyIcp')) + '</td></tr>') +
          '</tbody></table>' +
        '</div>' +
        '<p class="ds-text-sm ds-text-muted" style="margin-top:8px">' +
          (pilotBottlenecks.length
            ? (esc(TCi18n.t('adm.a.rev.lblBottlenecks')) + ': ' + pilotBottlenecks.map(function (row) { return esc(row.label) + ' (' + esc(row.blocked_pilots) + ')'; }).join(' · '))
            : esc(TCi18n.t('adm.a.rev.noBottlenecks'))) +
        '</p>' +
        (pilotModules.length ? '<div style="overflow:auto;margin-top:12px"><table class="admin-table"><thead><tr><th>' + esc(TCi18n.t('adm.a.rev.colModule')) + '</th><th>' + esc(TCi18n.t('adm.a.rev.colPilotOrgs')) + '</th><th>' + esc(TCi18n.t('adm.a.rev.colActivePilots')) + '</th><th>' + esc(TCi18n.t('adm.a.rev.colSuccessUsage')) + '</th><th>' + esc(TCi18n.t('adm.a.rev.colEvents')) + '</th></tr></thead><tbody>' +
          pilotModules.map(function (row) {
            return '<tr>' +
              '<td>' + esc(moduleLabel(row.module)) + '</td>' +
              '<td>' + esc(row.pilot_orgs || 0) + '</td>' +
              '<td>' + esc(row.active_pilot_orgs || 0) + '</td>' +
              '<td>' + esc(row.successful_usage_orgs || 0) + '</td>' +
              '<td>' + esc(row.event_count || 0) + '</td>' +
            '</tr>';
          }).join('') +
        '</tbody></table></div>' : '') +
      '</div>';
      html += '</div>';
      target.innerHTML = html;
    } catch (e) {
      target.innerHTML =
        exportToolbar(TCi18n.t('adm.a.rev.loadFailHint')) +
        '<p class="ds-text-sm" style="color:var(--bad)">' + esc(e.message || TCi18n.t('adm.a.rev.unavailable')) + '</p>';
    }
  }

  async function loadStrategicRequests(offset) {
    var status = el('scStatus') ? el('scStatus').value : '';
    var target = el('strategicTable');
    var paging = el('strategicPaging');
    if (!target) return;
    scOffset = toInteger(offset, 0, 0);
    target.innerHTML = '<p class="ds-text-sm ds-text-muted">' + esc(TCi18n.t('adm.a.strat.loading')) + '</p>';
    if (paging) paging.innerHTML = '';
    try {
      var qs = '?limit=' + scLimit + '&offset=' + scOffset + (status ? '&status=' + encodeURIComponent(status) : '');
      var d = await TC.api.get('/admin/strategic-collaboration/requests' + qs);
      var payload = (d && d.data) || {};
      scLimit = toInteger(payload.limit, scLimit, 1, 500);
      scOffset = toInteger(payload.offset, scOffset, 0);
      var total = toInteger(payload.total, 0, 0);
      var items = Array.isArray(payload.items) ? payload.items : [];
      if (!items.length) { target.innerHTML = emptyState(TCi18n.t('adm.a.strat.empty')); return; }
      var statusOptions = ['eingegangen', 'rueckfrage_offen', 'angebot_erstellt', 'bestaetigt', 'aktiviert', 'abgelehnt', 'abgeschlossen'];
      var html = '<table class="admin-table"><thead><tr>' +
        '<th>' + esc(TCi18n.t('adm.a.strat.colTime')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.strat.colStatus')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.strat.colOwner')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.strat.colCompany')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.strat.colContact')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.strat.colEmail')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.strat.colScope')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.strat.colType')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.strat.colAction')) + '</th>' +
        '</tr></thead><tbody>';
      items.forEach(function (r) {
        var scope = [r.region_scope || null, r.site_count ? TCi18n.t('adm.a.strat.sites', { count: r.site_count }) : null].filter(Boolean).join(' | ') || '—';
        var statusValue = r.status || 'eingegangen';
        var select = '<select class="ds-select ds-select--xs" id="sc-status-' + esc(r.id) + '">';
        statusOptions.forEach(function (value) { select += '<option value="' + value + '"' + (statusValue === value ? ' selected' : '') + '>' + esc(formatStrategicStatus(value)) + '</option>'; });
        select += '</select>';
        var ownerName = r.assigned_to_name || r.assigned_to_email || r.assigned_to_company || null;
        var ownerMeta = (!r.assigned_to_name && r.assigned_to_email) ? null : (r.assigned_to_email || null);
        var ownerLabel = ownerName ? (esc(ownerName) + (ownerMeta ? '<div class="ds-text-sm" style="color:var(--muted)">' + esc(ownerMeta) + '</div>' : '')) : '—';
        var assignAction = '';
        if (currentAdminUserId) {
          var isMine = String(r.assigned_to_user_id || '') === String(currentAdminUserId);
          assignAction = isMine
            ? '<button class="btn ds-btn--xs" onclick="updateStrategicAssignment(' + safeJson(r.id) + ', null)">' + esc(TCi18n.t('adm.a.strat.release')) + '</button>'
            : '<button class="btn primary ds-btn--xs" onclick="updateStrategicAssignment(' + safeJson(r.id) + ', ' + safeJson(currentAdminUserId) + ')">' + esc(TCi18n.t('adm.a.strat.claim')) + '</button>';
        }
        var modules = Array.isArray(r.requested_modules) ? r.requested_modules : [];
        var interest = [
          r.interest_enterprise_support ? TCi18n.t('adm.a.strat.intEnterprise') : null,
          r.interest_framework_conditions ? TCi18n.t('adm.a.strat.intFramework') : null,
          r.interest_strategic_cooperation ? TCi18n.t('adm.a.strat.intCooperation') : null
        ].filter(Boolean).join(' · ');
        var details = '<details><summary>' + esc(TCi18n.t('adm.a.common.details')) + '</summary>' +
          '<div class="ds-text-sm" style="color:var(--muted);margin:6px 0">' + esc(TCi18n.t('adm.a.strat.statusUpdated')) + ': ' + esc(formatDateTime(r.status_updated_at || r.updated_at || r.created_at)) + '</div>' +
          '<div class="ds-text-sm" style="margin-bottom:6px">' + esc(TCi18n.t('adm.a.strat.message')) + ': ' + esc(r.message || '—') + '</div>' +
          '<div class="ds-text-sm" style="margin-bottom:6px">' + esc(TCi18n.t('adm.a.strat.interest')) + ': ' + esc(interest || '—') + '</div>' +
          '<div class="ds-text-sm" style="margin-bottom:6px">' + esc(TCi18n.t('adm.a.strat.modules')) + ': ' + esc(modules.length ? modules.join(', ') : '—') + '</div>' +
          '<label class="ds-text-sm" style="display:block;margin-bottom:4px">' + esc(TCi18n.t('adm.a.strat.opsNote')) + '</label>' +
          '<textarea class="ds-input" rows="2" id="sc-note-' + esc(r.id) + '">' + esc(r.ops_notes || '') + '</textarea>' +
          '<div style="margin-top:6px"><button class="btn ds-btn--xs" onclick="updateStrategicNotes(' + safeJson(r.id) + ')">' + esc(TCi18n.t('adm.a.strat.saveNote')) + '</button></div>' +
        '</details>';
        var actionBlock = '<div style="white-space:nowrap">' + select + ' <button class="btn primary ds-btn--xs" onclick="updateStrategicStatus(' + safeJson(r.id) + ')">' + esc(TCi18n.t('adm.a.common.save')) + '</button></div>' + details;
        html += '<tr>' +
          '<td style="white-space:nowrap">' + esc(formatDateTime(r.created_at)) + '</td>' +
          '<td><span class="tag blue">' + esc(formatStrategicStatus(statusValue)) + '</span></td>' +
          '<td>' + ownerLabel + '<div style="margin-top:6px">' + assignAction + '</div></td>' +
          '<td>' + esc(r.requester_company_name || '—') + '</td>' +
          '<td>' + esc(r.contact_name || '—') + '</td>' +
          '<td>' + esc(r.contact_email || '—') + '</td>' +
          '<td>' + esc(scope) + '</td>' +
          '<td>' + esc(TCi18n.t(r.source_context === 'enterprise_config' ? 'adm.a.strat.srcEnterprise' : 'adm.a.strat.srcPublic')) + '</td>' +
          '<td>' + actionBlock + '</td>' +
        '</tr>';
      });
      html += '</tbody></table>';
      target.innerHTML = html;
      if (paging) paging.innerHTML = renderStrategicPaging(total);
    } catch (e) {
      target.innerHTML = '<p class="ds-text-sm" style="color:var(--bad)">' + esc(e.message || TCi18n.t('adm.a.strat.unavailable')) + '</p>';
      if (paging) paging.innerHTML = '';
    }
  }

  async function updateStrategicStatus(id) {
    var sel = el('sc-status-' + id);
    if (!sel) return;
    try {
      await TC.api.patch('/admin/strategic-collaboration/requests/' + encodeURIComponent(id) + '/status', { status: sel.value });
      loadStrategicRequests(scOffset);
    } catch (e) {
      alert(TCi18n.t('adm.a.strat.statusFail') + ': ' + (e.message || e.code || e.status || TCi18n.t('adm.a.common.unknown')));
    }
  }

  async function updateStrategicAssignment(id, assignedToUserId) {
    try {
      await TC.api.patch('/admin/strategic-collaboration/requests/' + encodeURIComponent(id) + '/assign', {
        assigned_to_user_id: assignedToUserId
      });
      loadStrategicRequests(scOffset);
    } catch (e) {
      alert(TCi18n.t('adm.a.strat.assignFail') + ': ' + (e.message || e.code || e.status || TCi18n.t('adm.a.common.unknown')));
    }
  }

  async function updateStrategicNotes(id) {
    var noteEl = el('sc-note-' + id);
    if (!noteEl) return;
    try {
      await TC.api.patch('/admin/strategic-collaboration/requests/' + encodeURIComponent(id) + '/notes', {
        ops_notes: noteEl.value || ''
      });
      loadStrategicRequests(scOffset);
    } catch (e) {
      alert(TCi18n.t('adm.a.strat.noteFail') + ': ' + (e.message || e.code || e.status || TCi18n.t('adm.a.common.unknown')));
    }
  }

  async function adminEditUser(id, field, value) {
    var body = {};
    body[field] = value;
    try {
      await TC.api.patch('/admin/users/' + encodeURIComponent(id), body);
      loadUsers(usersOffset);
    } catch (e) {
      alert(TCi18n.t('adm.a.common.error') + ': ' + (e.message || e.code || e.status || TCi18n.t('adm.a.common.unknown')));
    }
  }

  async function adminDeactivate(id) {
    if (!confirm(TCi18n.t('adm.a.users.deactivateConfirm'))) return;
    try {
      await TC.api.post('/admin/users/' + encodeURIComponent(id) + '/deactivate');
      loadUsers(usersOffset);
    } catch (e) {
      alert(TCi18n.t('adm.a.users.deactivateFail') + ': ' + (e.message || e.code || e.status || TCi18n.t('adm.a.common.unknown')));
    }
  }

  async function loadActivityFeed(offset) {
    actOffset = offset || 0;
    var params = ['limit=' + actLimit, 'offset=' + actOffset];
    var actionType = el('actFeedType').value; if (actionType) params.push('action_type=' + encodeURIComponent(actionType));
    var from = el('actFeedFrom').value; if (from) params.push('from=' + encodeURIComponent(from));
    var to = el('actFeedTo').value; if (to) params.push('to=' + encodeURIComponent(to));
    var target = el('activityTimeline');
    target.innerHTML = '<p class="ds-text-sm ds-text-muted">' + esc(TCi18n.t('adm.a.act.loading')) + '</p>';
    try {
      var d = await TC.api.get('/admin/activity-feed?' + params.join('&'));
      var items = (d.data && d.data.items) || [];
      var total = (d.data && d.data.total) || 0;
      if (!items.length) {
        target.innerHTML = emptyState(TCi18n.t('adm.a.act.empty'));
        el('activityPaging').innerHTML = '';
        return;
      }
      var severityColors = {
        success: 'var(--good,#34d399)',
        warning: 'var(--warn,#fbbf24)',
        danger: 'var(--bad,#f87171)',
        muted: 'var(--muted,#888)',
        info: 'var(--brand,#4a9eff)'
      };
      target.innerHTML = items.map(function (event) {
        return '<div class="act-timeline-item">' +
          '<span class="act-timeline-icon">' + (event.icon ? esc(event.icon) : '&#128308;') + '</span>' +
          '<div class="act-timeline-body">' +
            '<div class="act-timeline-head">' +
              '<span class="act-timeline-label">' + esc(event.action_label || event.action || '') + '</span>' +
              '<span class="act-timeline-time">' + esc(formatDateTime(event.timestamp)) + '</span>' +
            '</div>' +
            '<div class="act-timeline-meta">' +
              (event.user ? '<span>' + esc(event.user) + '</span>' : '') +
              (event.resource ? '<span style="color:' + (severityColors[event.severity] || severityColors.info) + '">' + esc(event.resource) + '</span>' : '') +
              (event.action_type ? '<span class="act-timeline-type">' + esc(event.action_type) + '</span>' : '') +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');
      var pages = Math.ceil(total / actLimit);
      var paging = '';
      if (pages > 1) {
        for (var i = 0; i < pages && i < 20; i++) {
          var cls = i * actLimit === actOffset ? ' primary' : '';
          paging += '<button class="btn' + cls + '" onclick="loadActivityFeed(' + (i * actLimit) + ')">' + (i + 1) + '</button>';
        }
      }
      el('activityPaging').innerHTML = paging;
    } catch (e) {
      target.innerHTML = '<p class="ds-text-sm" style="color:var(--bad)">' + esc(e.message || TCi18n.t('adm.a.act.unavailable')) + '</p>';
    }
  }

  async function loadBackofficeRequests(offset) {
    var status = el('boReqStatus') ? el('boReqStatus').value : '';
    var target = el('boRequestsTable');
    var paging = el('boRequestsPaging');
    if (!target) return;
    boReqOffset = toInteger(offset, 0, 0);
    target.innerHTML = '<p class="ds-text-sm ds-text-muted">' + esc(TCi18n.t('adm.a.bo.loading')) + '</p>';
    if (paging) paging.innerHTML = '';
    try {
      var qs = '?limit=' + boReqLimit + '&offset=' + boReqOffset + (status ? '&status=' + encodeURIComponent(status) : '');
      var d = await TC.api.get('/admin/requests' + qs);
      var payload = (d && d.data) || {};
      boReqLimit = toInteger(payload.limit, boReqLimit, 1, 500);
      boReqOffset = toInteger(payload.offset, boReqOffset, 0);
      var total = toInteger(payload.total, 0, 0);
      var items = Array.isArray(payload.items) ? payload.items : [];
      if (!items.length) { target.innerHTML = emptyState(TCi18n.t('adm.a.bo.empty')); return; }
      var statuses = ['SENT', 'ACCEPTED', 'DECLINED', 'FILLED', 'FINALIZED', 'CANCELED'];
      var html = '<table class="admin-table"><thead><tr>' +
        '<th>' + esc(TCi18n.t('adm.a.bo.colTime')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.bo.colStatus')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.bo.colRequester')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.bo.colReceiver')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.bo.colRoleRegion')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.bo.colStatusChange')) + '</th>' +
        '</tr></thead><tbody>';
      items.forEach(function (r) {
        var roleRegion = [r.role || null, r.region || null].filter(Boolean).join(' / ') || '—';
        var requester = r.requester_company || r.requester_email || '—';
        var receiver = r.receiver_company || r.receiver_email || '—';
        var select = '<select class="ds-select ds-select--xs" id="bo-req-status-' + esc(r.id) + '">';
        statuses.forEach(function (state) { select += '<option value="' + state + '"' + (r.status === state ? ' selected' : '') + '>' + state + '</option>'; });
        select += '</select>';
        html += '<tr>' +
          '<td style="white-space:nowrap">' + esc(formatDateTime(r.created_at)) + '</td>' +
          '<td><span class="tag blue">' + esc(r.status || 'SENT') + '</span></td>' +
          '<td>' + esc(requester) + '</td>' +
          '<td>' + esc(receiver) + '</td>' +
          '<td>' + esc(roleRegion) + '</td>' +
          '<td style="white-space:nowrap">' + select + ' <button class="btn primary ds-btn--xs" onclick="updateBackofficeRequestStatus(' + safeJson(r.id) + ')">' + esc(TCi18n.t('adm.a.common.save')) + '</button></td>' +
        '</tr>';
      });
      html += '</tbody></table>';
      target.innerHTML = html;
      if (paging) paging.innerHTML = renderBackofficeRequestsPaging(total);
    } catch (e) {
      target.innerHTML = '<p class="ds-text-sm" style="color:var(--bad)">' + esc(e.message || TCi18n.t('adm.a.bo.unavailable')) + '</p>';
      if (paging) paging.innerHTML = '';
    }
  }

  async function updateBackofficeRequestStatus(id) {
    var sel = el('bo-req-status-' + id);
    if (!sel) return;
    if (!confirm(TCi18n.t('adm.a.bo.statusConfirm', { status: sel.value }))) return;
    try {
      await TC.api.patch('/admin/requests/' + encodeURIComponent(id) + '/status', { status: sel.value });
      loadBackofficeRequests(boReqOffset);
    } catch (e) {
      alert(TCi18n.t('adm.a.bo.statusFail') + ': ' + (e.message || e.code || e.status || TCi18n.t('adm.a.common.unknown')));
    }
  }

  async function loadFeatureKeys() {
    if (_foKeysLoaded) return;
    try {
      var d = await TC.api.get('/admin/feature-keys');
      var keys = (d.data && d.data.keys) || [];
      var select = el('foFeatureKey');
      select.innerHTML = '<option value="">' + esc(TCi18n.t('adm.a.fo.choose')) + '</option>';
      keys.forEach(function (key) {
        select.innerHTML += '<option value="' + esc(key) + '">' + esc(key) + '</option>';
      });
      _foKeysLoaded = true;
    } catch (_e) {
      _foKeysLoaded = false;
    }
  }

  async function loadFeatureOverrides() {
    loadFeatureKeys();
    var target = el('foTable');
    target.innerHTML = '<p class="ds-text-sm ds-text-muted">' + esc(TCi18n.t('adm.a.fo.loadingList')) + '</p>';
    try {
      var d = await TC.api.get('/admin/feature-overrides');
      var items = (d.data && d.data.items) || [];
      if (!items.length) { target.innerHTML = emptyState(TCi18n.t('adm.a.fo.empty')); return; }
      var html = '<table class="admin-table"><thead><tr>' +
        '<th>' + esc(TCi18n.t('adm.a.fo.colId')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.fo.colFeature')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.fo.colOrg')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.fo.colEnabled')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.fo.colReason')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.fo.colExpires')) + '</th>' +
        '<th>' + esc(TCi18n.t('adm.a.fo.colCreated')) + '</th>' +
        '<th></th></tr></thead><tbody>';
      items.forEach(function (item) {
        var org = item.org_name ? esc(item.org_name) + ' (#' + esc(item.org_id) + ')' : '<em>' + esc(TCi18n.t('adm.a.fo.global')) + '</em>';
        html += '<tr>' +
          '<td>' + esc(item.id) + '</td>' +
          '<td><code>' + esc(item.feature_key) + '</code></td>' +
          '<td>' + org + '</td>' +
          '<td>' + (item.enabled ? '<span class="tag green">' + esc(TCi18n.t('adm.a.common.yes')) + '</span>' : '<span class="tag red">' + esc(TCi18n.t('adm.a.common.no')) + '</span>') + '</td>' +
          '<td>' + esc(item.reason || '—') + '</td>' +
          '<td>' + esc(item.expires_at ? formatDateTime(item.expires_at) : '—') + '</td>' +
          '<td>' + esc(item.created_at ? formatDateTime(item.created_at) : '—') + '</td>' +
          '<td><button class="btn bad ds-btn--xs" onclick="deleteFeatureOverride(' + safeJson(item.id) + ')">' + esc(TCi18n.t('adm.a.fo.delete')) + '</button></td>' +
        '</tr>';
      });
      html += '</tbody></table>';
      target.innerHTML = html;
    } catch (e) {
      target.innerHTML = '<p class="ds-text-sm" style="color:var(--bad)">' + esc(e.message || TCi18n.t('adm.a.fo.unavailable')) + '</p>';
    }
  }

  async function saveFeatureOverride() {
    var featureKey = el('foFeatureKey').value;
    if (!featureKey) { alert(TCi18n.t('adm.a.fo.selectKey')); return; }
    var body = {
      feature_key: featureKey,
      enabled: el('foEnabled').value === 'true',
      reason: el('foReason').value || null
    };
    var orgId = el('foOrgId').value;
    if (orgId) body.org_id = parseInt(orgId, 10);
    var expires = el('foExpires').value;
    if (expires) body.expires_at = new Date(expires).toISOString();
    try {
      await TC.api.put('/admin/feature-overrides', body);
      loadFeatureOverrides();
    } catch (e) {
      alert(TCi18n.t('adm.a.common.error') + ': ' + (e.message || e.code || e.status || TCi18n.t('adm.a.common.unknown')));
    }
  }

  async function deleteFeatureOverride(id) {
    if (!confirm(TCi18n.t('adm.a.fo.deleteConfirm'))) return;
    try {
      await TC.api.delete('/admin/feature-overrides/' + encodeURIComponent(id));
      loadFeatureOverrides();
    } catch (e) {
      alert(TCi18n.t('adm.a.common.error') + ': ' + (e.message || e.code || e.status || TCi18n.t('adm.a.common.unknown')));
    }
  }

  async function boot() {
    document.addEventListener('click', function (event) {
      var action = event.target.closest('[data-action-type="tab"]');
      if (!action) return;
      event.preventDefault();
      openTab(action.dataset.target, { updateUrl: true, force: true });
    });
    el('tabBar').addEventListener('click', function (event) {
      var button = event.target.closest('.tab-btn');
      if (!button) return;
      openTab(button.dataset.tab, { updateUrl: true });
    });
    try {
      var bootstrap = await TC.api.get('/admin/control-center');
      controlCenter = bootstrap.data || {};
      renderContextPanel();
      renderRoadmap();
      renderHubCards();
      renderStateBanner();
      configureWorkspace();
    } catch (e) {
      if (e.status === 401) {
        // Sitzung abgelaufen → Login-Redirect
        window.location.href = '/?error=access_denied';
        return;
      }
      if (e.status === 403 && e.code === 'ADMIN_REQUIRED') {
        // Eingeloggter Nutzer ohne Admin-Rolle → Per-Card-Zugriff-Ansicht zeigen statt Redirect.
        // Nutzer soll sehen, welche Bereiche existieren, und wie er ggf. Zugriff bekommt.
        var me = {};
        try {
          var meResult = await TC.api.get('/me');
          me = (meResult && meResult.data) || meResult || {};
        } catch (_) { /* /api/me Fehler: leerer Kontext */ }
        controlCenter = {
          context: {
            user: { id: me.id, org_name: me.org_name, plan: me.plan, org_role: me.org_role },
            access: { is_admin: false, access_level: 'restricted', allowed_tabs: [] },
            roadmap: []
          },
          summary: { total_users: 0, total_orgs: 0, requisition_backlog: 0, audit_events_30d: 0 },
          card_order: ['admin', 'users_orgs', 'audit_log', 'platform_metrics', 'sso_saml', 'workflows'],
          cards: {
            admin:            { title: TCi18n.t('adm.a.card.admin'),     state: 'admin_only', description: TCi18n.t('adm.a.card.adminDesc') },
            users_orgs:       { title: TCi18n.t('adm.a.card.usersOrgs'), state: 'admin_only', description: TCi18n.t('adm.a.card.usersOrgsDesc') },
            audit_log:        { title: TCi18n.t('adm.a.card.auditLog'),  state: 'admin_only', description: TCi18n.t('adm.a.card.auditLogDesc') },
            platform_metrics: { title: TCi18n.t('adm.a.card.metrics'),   state: 'admin_only', description: TCi18n.t('adm.a.card.metricsDesc') },
            sso_saml:         { title: TCi18n.t('adm.a.card.sso'),       state: 'admin_only', description: TCi18n.t('adm.a.card.ssoDesc') },
            workflows:        { title: TCi18n.t('adm.a.card.workflows'), state: 'admin_only', description: TCi18n.t('adm.a.card.workflowsDesc') }
          }
        };
        renderContextPanel();
        renderRoadmap();
        renderHubCards();
        renderStateBanner();
        configureWorkspace();
        return;
      }
      el('adminStateBanner').hidden = false;
      el('adminStateBanner').className = 'admin-state-banner admin-state-banner--warn';
      el('adminStateBanner').innerHTML =
        '<div class="admin-state-banner__head"><div><h2 class="admin-state-banner__title">' + esc(TCi18n.t('adm.a.banner.bootFailTitle')) + '</h2><p class="admin-state-banner__desc">' +
        esc(describeError(e, TCi18n.t('adm.a.banner.bootFailText'))) +
        '</p></div></div>';
    }
  }

  window.loadUsers = loadUsers;
  window.loadOrgs = loadOrgs;
  window.loadAudit = loadAudit;
  window.loadAuditRecentChanges = loadAuditRecentChanges;
  window.loadMetrics = loadMetrics;
  window.loadStrategicRequests = loadStrategicRequests;
  window.updateStrategicStatus = updateStrategicStatus;
  window.updateStrategicAssignment = updateStrategicAssignment;
  window.updateStrategicNotes = updateStrategicNotes;
  window.loadActivityFeed = loadActivityFeed;
  window.loadBackofficeRequests = loadBackofficeRequests;
  window.updateBackofficeRequestStatus = updateBackofficeRequestStatus;
  window.loadFeatureOverrides = loadFeatureOverrides;
  window.saveFeatureOverride = saveFeatureOverride;
  window.deleteFeatureOverride = deleteFeatureOverride;
  window.exportAdminRevenueFinanceTruth = exportAdminRevenueFinanceTruth;
  window.adminEditUser = adminEditUser;
  window.adminDeactivate = adminDeactivate;

  /* Sprachwechsel: Kontextpanel, Roadmap, Hub-Cards, Banner und alle Tabellen
     entstehen per innerHTML — die deklarative Hydration erreicht sie nicht.
     Sie werden hier gezielt neu aufgebaut, sonst bliebe die halbe Seite
     deutsch. Der aktive Tab wird neu geladen, damit auch seine Spalten-,
     Leer- und Fehlertexte in der neuen Sprache stehen. */
  document.addEventListener('tc:langchange', function () {
    if (!controlCenter) return;
    renderContextPanel();
    renderRoadmap();
    renderHubCards();
    renderStateBanner();
    var active = document.querySelector('#tabBar .tab-btn.active');
    if (active && active.dataset.tab) ensureTabLoaded(active.dataset.tab, true);
  });

  boot();
})();
