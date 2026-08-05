/* ═══════════════════════════════════════════════════════
   Executive Dashboard — Page Logic
   ═══════════════════════════════════════════════════════ */

/* ── Woerterbuch (P6.1, DE/EN) ─────────────────────────────────────────────
   Die Seite laedt i18n.js im head, dieses Modul laeuft ausschliesslich auf
   executive_dashboard.html — TCi18n ist hier also garantiert vorhanden.

   Bewusst NICHT uebersetzt:
   - Server-Rohwerte (Status-Enums, Plan-/Stage-Schluessel, Preisquellen,
     Organisationsnamen): sie kommen so aus der API und sind keine UI-Sprache.
   - alles aus pageShell.js (Topbar, Navigation, Nutzerbereich, Umschalter)
   - rollenabhaengige Begriffe aus terminologyLabels.js

   Feste Unternehmenssprache ist hier korrekt: executive_dashboard.html ist
   laut api/config/visibilityMatrix.js auf allowed_org_types ["company"]
   begrenzt — eine Agentur erreicht diese Flaeche nie.                       */
TCi18n.register('de', {
  'exe.docTitle': 'Steuerung & Analytik – TempConnect',
  'exe.page.title': 'Steuerung & Analytik',
  'exe.page.subtitle': 'Lieferantenleistung, Besetzungsdruck, Spend, Qualität und Plattformzustand als nachgelagerte Managementsicht im Blick.',
  'exe.search.ph': 'Schnellsuche…',
  'exe.search.btn': 'Suchen',
  'exe.refresh': 'Aktualisieren',

  'exe.banner.eyebrow': 'Steuerungsschicht',
  'exe.banner.title': 'Diese Sicht aggregiert den Pilotbetrieb — sie ersetzt nicht den operativen Einstieg',
  'exe.banner.text': 'Executive-KPIs, Spend und Lieferantenleistung helfen bei Priorisierung und Vertrieb, muessen aber dem operativen Kern folgen. Erst wenn Arbeitsplatzangebote, Deals und Zeiten sauber laufen, haben diese Kennzahlen die richtige Wirkung.',
  'exe.banner.asideTitle': 'Bewusst nachgelagert',
  'exe.banner.asideText': 'Nutzen Sie diese Seite fuer Managemententscheidungen, nicht als Ersatz fuer Arbeitsplatzangebots-, Deal- oder Einsatzarbeit.',

  'exe.onb.label': 'Plattform einrichten',
  'exe.onb.toggle': 'Auf-/Zuklappen',
  'exe.action.hide': 'Ausblenden',

  'exe.hub.current.title': 'Steuerung & Analytik',
  'exe.hub.current.desc': 'Sie befinden sich im Management- und Steuerungsbereich.',
  'exe.hub.kpi.title': 'Management-KPIs',
  'exe.hub.kpi.desc': 'KPIs, SLA-Compliance und Plattform-Übersicht.',
  'exe.hub.vendor.title': 'Lieferantenpool',
  'exe.hub.vendor.desc': 'Lieferantenpool verwalten und für Arbeitsplatzangebote qualifizieren.',
  'exe.hub.scorecard.title': 'Lieferanten-Bewertung',
  'exe.hub.scorecard.desc': 'Scorecard, Performance und Qualitätskennzahlen.',
  'exe.hub.rates.title': 'Preisrahmen',
  'exe.hub.rates.desc': 'Stundensatz-Tabellen und Preisvereinbarungen.',
  'exe.hub.spend.title': 'Spend & Kosten',
  'exe.hub.spend.desc': 'Ausgabenanalyse, Budgets und Kostentrends.',
  'exe.hub.health.title': 'System & Plattform Health',
  'exe.hub.health.desc': 'System-Status, Verfügbarkeit, Plattform-Metriken und Infrastruktur.',
  'exe.hub.req.title': 'Arbeitsplatzangebote',
  'exe.hub.req.desc': 'Personalanforderungen und Angebotserfassung.',
  'exe.hub.compliance.title': 'Compliance',
  'exe.hub.compliance.desc': 'Regelkonformität, Audits und Dokumentenstatus.',

  'exe.filter.org': 'Organisation',
  'exe.filter.allOrgs': 'Alle Organisationen',

  'exe.onbBanner.title': 'Onboarding fortsetzen',
  'exe.onbBanner.cta': 'Weiter einrichten',
  'exe.onbBanner.pct': '{pct}% abgeschlossen',
  'exe.onbBanner.default': 'Vervollstaendigen Sie Ihr Profil, um alle Funktionen nutzen zu koennen.',
  'exe.onbBanner.profile': 'Fuellen Sie Ihr Firmenprofil aus, um loszulegen.',
  'exe.onbBanner.firstAction': 'Erstellen Sie Ihre erste Aktion, um das Onboarding abzuschliessen.',

  'exe.sec.pulse': 'Procurement Pulse (30 Tage)',
  'exe.sec.critical': 'Kritischer Besetzungsdruck',
  'exe.link.backlog': 'Backlog',
  'exe.sec.reqStatus': 'Arbeitsplatzangebote nach Status',
  'exe.link.allReq': 'Alle Angebote',
  'exe.sec.sla': 'SLA Compliance (30 Tage)',
  'exe.sec.compliance': 'Compliance Dokumente',
  'exe.sec.platform': 'Plattform',
  'exe.sec.searchResults': 'Suchergebnisse',
  'exe.sec.spend': 'Spend Overview (30 Tage)',
  'exe.link.details': 'Details',
  'exe.sec.finance': 'Finance Truth',
  'exe.link.revenueConsole': 'Revenue-Konsole',
  'exe.finance.exportCsv': 'Export CSV',
  'exe.finance.exportJson': 'Export JSON',
  'exe.sec.retention': 'SaaS Retention & Usage Truth',
  'exe.link.revenueDrill': 'Revenue-Drilldown',
  'exe.sec.pilot': 'Pilot & Conversion Truth',
  'exe.link.funnelDrill': 'Funnel-Drilldown',
  'exe.sec.ce': 'Vermittlungsaktivität',
  'exe.sec.activity': 'Letzte Aktivitäten',
  'exe.sec.dsgvo': 'DSGVO Compliance',
  'exe.link.governance': 'Governance',
  'exe.sec.health': 'Platform Health',
  'exe.state.loading': 'Lade…',

  'exe.access.denied': 'Steuerung & Analytik ist fuer diese Rolle derzeit nicht freigeschaltet.',
  'exe.access.hiddenTitle': 'Steuerung & Analytik ausgeblendet',
  'exe.export.hidden': 'Finance-Export bleibt fuer diese Rolle ausgeblendet.',
  'exe.export.ready': 'CSV/JSON Snapshot für Audit verfügbar.',
  'exe.export.running': 'Export wird erstellt…',
  'exe.export.done': 'Export bereitgestellt.',
  'exe.export.failed': 'Export fehlgeschlagen: {error}',
  'exe.error.unknown': 'Unbekannter Fehler',

  'exe.scope.allLocations': 'Alle Standorte',
  'exe.scope.days': '{days} Tage',
  'exe.scope.org': 'Org:',
  'exe.scope.location': 'Standort:',
  'exe.scope.period': 'Zeitraum:',
  'exe.scope.asOf': 'Datenstand:',
  'exe.scope.orgTip': 'Organisation – alle Daten sind auf diese Org beschraenkt',
  'exe.scope.locationTip': 'Standort-Kontext – „Alle Standorte" bedeutet org-weite Auswertung',
  'exe.scope.periodTip': 'Analysezeitraum der dargestellten Kennzahlen',
  'exe.scope.asOfTip': 'Zeitpunkt der Datenberechnung auf dem Server',

  'exe.stage.lead': 'Lead',
  'exe.stage.qualified': 'Qualifiziert',
  'exe.stage.registered': 'Registriert',
  'exe.stage.pilot_started': 'Pilot gestartet',
  'exe.stage.pilot_activated': 'Pilot aktiviert',
  'exe.stage.first_core_flow_executed': 'Erster Kernfluss',
  'exe.stage.pilot_successful_usage': 'Belastbare Nutzung',
  'exe.stage.commercial_pricing_clarified': 'Pricing klar',
  'exe.stage.paid_live': 'Zahlend live',
  'exe.stage.lost_aborted': 'Verloren',

  'exe.tariff.pilot': 'Pilot-Pfad',
  'exe.tariff.direct_contract': 'Direktvertrag',
  'exe.tariff.catalog_paid': 'Katalog / live',
  'exe.tariff.lead_only': 'Lead ohne Conversion',
  'exe.tariff.unclassified': 'Unklassifiziert',

  'exe.module.demand': 'Demand',
  'exe.module.deal': 'Deal',
  'exe.module.delivery': 'Delivery',
  'exe.module.vendor_governance': 'Vendor Governance',

  'exe.basis.current_backlog': 'Zeitbasis: aktueller Backlog.',
  'exe.basis.activity_30d': 'Zeitbasis: Aktivität der letzten 30 Tage.',
  'exe.basis.window_overlap_30d': 'Zeitbasis: im 30-Tage-Fenster gültig.',
  'exe.basis.approved_timesheets_30d': 'Zeitbasis: freigegebene Stundenzettel der letzten 30 Tage.',
  'exe.basis.risk_window_30d': 'Zeitbasis: aktuelle Risiken und nächstes 30-Tage-Fenster.',
  'exe.metric.unavailable': 'Der Wert ist derzeit nicht verfügbar.',
  'exe.metric.fallback': 'Kennzahl',

  'exe.unavail.kpiLabel': 'Dashboard nicht verfügbar',
  'exe.unavail.pulse': 'Procurement Pulse konnte nicht geladen werden.',
  'exe.unavail.critical': 'Kritischer Besetzungsdruck konnte nicht geladen werden.',
  'exe.unavail.req': 'Arbeitsplatzangebote konnten nicht geladen werden.',
  'exe.unavail.sla': 'SLA-Daten konnten nicht geladen werden.',
  'exe.unavail.compliance': 'Compliance-Daten konnten nicht geladen werden.',
  'exe.unavail.platform': 'Plattformdaten konnten nicht geladen werden.',
  'exe.unavail.spend': 'Spend-Daten konnten nicht geladen werden.',
  'exe.unavail.finance': 'Finance-Daten konnten nicht geladen werden.',
  'exe.unavail.retention': 'Retention-/Churn-Daten konnten nicht geladen werden.',
  'exe.unavail.pilot': 'Pilot-/Conversion-Daten konnten nicht geladen werden.',
  'exe.unavail.exportHint': 'Dashboard nicht verfügbar. Export kann separat versucht werden.',

  'exe.locked.kpiLabel': 'Steuerung ausgeblendet',
  'exe.locked.critical': 'Kritischer Besetzungsdruck bleibt fuer diese Rolle ausgeblendet.',
  'exe.locked.req': 'Arbeitsplatzangebote bleiben für diese Rolle ausgeblendet.',
  'exe.locked.sla': 'SLA-Daten bleiben fuer diese Rolle ausgeblendet.',
  'exe.locked.compliance': 'Compliance-Daten bleiben fuer diese Rolle ausgeblendet.',
  'exe.locked.platform': 'Plattformdaten bleiben fuer diese Rolle ausgeblendet.',
  'exe.locked.spend': 'Spend-Daten bleiben fuer diese Rolle ausgeblendet.',
  'exe.locked.finance': 'Finance-Daten bleiben fuer diese Rolle ausgeblendet.',
  'exe.locked.retention': 'Retention-/Churn-Daten bleiben fuer diese Rolle ausgeblendet.',
  'exe.locked.pilot': 'Pilot-/Conversion-Daten bleiben fuer diese Rolle ausgeblendet.',
  'exe.locked.ce': 'Vermittlungsaktivitaet bleibt fuer diese Rolle ausgeblendet.',
  'exe.locked.activity': 'Aktivitaeten bleiben fuer diese Rolle ausgeblendet.',
  'exe.locked.dsgvo': 'Governance-Kennzahlen bleiben fuer diese Rolle ausgeblendet.',
  'exe.locked.health': 'Platform Health bleibt fuer diese Rolle ausgeblendet.',

  'exe.pulse.unavailable': 'Procurement Pulse derzeit nicht verfügbar.',

  'exe.kpi.none': 'Keine KPI-Daten',
  'exe.kpi.noneLoc': 'Keine KPI-Daten für Standort {loc}',
  'exe.kpi.total': 'Gesamt',
  'exe.kpi.totalTip': 'Alle Arbeitsplatzangebote unabhängig vom Status.',
  'exe.kpi.open': 'Offen',
  'exe.kpi.openTip': 'Arbeitsplatzangebote im Status OPEN.',
  'exe.kpi.inReview': 'In Pruefung',
  'exe.kpi.inReviewTip': 'Arbeitsplatzangebote im Status IN_REVIEW.',
  'exe.kpi.shortlisted': 'Shortlisted',
  'exe.kpi.shortlistedTip': 'Arbeitsplatzangebote im Status SHORTLISTED.',
  'exe.kpi.filled': 'Besetzt',
  'exe.kpi.filledTip': 'Arbeitsplatzangebote im Status FILLED.',
  'exe.kpi.cancelled': 'Storniert',
  'exe.kpi.cancelledTip': 'Arbeitsplatzangebote im Status CANCELLED.',
  'exe.kpi.urgentOpen': 'Dringend offen',
  'exe.kpi.urgentOpenTip': 'Dringliche Arbeitsplatzangebote im operativen Bearbeitungsraum OPEN oder IN_REVIEW.',
  'exe.kpi.avgTtf': 'Avg Time-to-Fill',
  'exe.kpi.avgTtfTip': 'Durchschnittliche Zeit von Erstellung bis FILLED in Stunden.',

  'exe.reqChart.none': 'Keine Arbeitsplatzangebot-Daten verfügbar.',
  'exe.reqChart.noneLoc': 'Keine Arbeitsplatzangebot-Daten für Standort {loc}.',
  'exe.req.draft': 'Draft',
  'exe.req.pendingApproval': 'Freigabe',
  'exe.req.approved': 'Genehmigt',
  'exe.req.open': 'Offen',
  'exe.req.inReview': 'Pruefung',
  'exe.req.shortlisted': 'Shortlist',
  'exe.req.filled': 'Besetzt',
  'exe.req.closed': 'Closed',
  'exe.req.cancelled': 'Storniert',

  'exe.sla.none': 'Keine SLA-Daten verfügbar.',
  'exe.sla.met': 'SLA Met',
  'exe.sla.breached': 'SLA Breached',
  'exe.sla.running': 'Running',
  'exe.sla.compliance': 'Compliance %',
  'exe.sla.belowThreshold': 'Unter Schwellwert (80%)',

  'exe.comp.none': 'Keine Compliance-Daten verfügbar.',
  'exe.comp.verified': 'Verifiziert',
  'exe.comp.pending': 'Ausstehend',
  'exe.comp.expired': 'Abgelaufen',
  'exe.comp.rejected': 'Abgelehnt',
  'exe.comp.expiring': '{count} Dokument(e) laufen in 30 Tagen ab',

  'exe.platform.none': 'Keine Plattform-Daten verfügbar.',
  'exe.platform.users': 'Nutzer',
  'exe.platform.orgs': 'Organisationen',
  'exe.platform.capacityPosts': 'Aktive Personalangebote',
  'exe.platform.openDemands': 'Offene Demands',
  'exe.platform.vendorEntries': 'Vendor Eintraege',

  'exe.spend.unavailable': 'Spend derzeit nicht verfügbar.',
  'exe.spend.noData': 'Keine Spend-Daten im aktuellen 30-Tage-Fenster.',
  'exe.spend.total': 'Spend 30 Tage',
  'exe.spend.totalTip': 'Freigegebener Spend aus freigegebenen Stundenzetteln im aktuellen 30-Tage-Fenster.',
  'exe.spend.projected': 'Projected Spend',
  'exe.spend.projectedTip': 'Projektion auf Basis aktiver Einsätze und verbleibender Wochen bis geplantem Ende; ohne Enddatum mit 90-Tage-Fallback.',
  'exe.spend.activeAssignments': 'Aktive Einsätze',
  'exe.spend.activeAssignmentsTip': 'Aktive Einsätze, die in die Spend-Projektion einfließen.',
  'exe.spend.assignments30d': 'Einsätze 30 Tage',
  'exe.spend.assignments30dTip': 'Einsätze mit freigegebenen Stundenzetteln im aktuellen 30-Tage-Fenster.',
  'exe.spend.vendors30d': 'Vendoren 30 Tage',
  'exe.spend.vendors30dTip': 'Distinct Supplier mit freigegebenem Spend im aktuellen 30-Tage-Fenster.',
  'exe.spend.approvedHours': 'Approved Hours',
  'exe.spend.approvedHoursTip': 'Freigegebene Stunden aus freigegebenen Stundenzetteln im aktuellen 30-Tage-Fenster.',
  'exe.spend.avgRate': 'Ø Stundensatz',
  'exe.spend.avgRateTip': 'Durchschnittlicher Ist-Stundensatz der Spend-Basis im aktuellen Fenster.',
  'exe.spend.overtime': 'Überstunden',
  'exe.spend.overtimeTip': 'Überstundenanteil des freigegebenen Spend im aktuellen 30-Tage-Fenster.',
  'exe.spend.overRate': 'Over-Rate ({pct}%)',
  'exe.spend.overRateTip': '{count} Einsätze im Fenster liegen über dem Preisrahmen-Ziel.',

  'exe.fin.unavailable': 'Finance-Wahrheit derzeit nicht verfügbar.',
  'exe.fin.mrr': 'Contractual MRR',
  'exe.fin.mrrTip': 'Vertraglich anerkannter monatlicher Umsatz ohne custom_quote_pending.',
  'exe.fin.catalogMrr': 'Catalog MRR (theoretisch)',
  'exe.fin.catalogMrrTip': 'Katalogbasierter Referenz-MRR für aktive bezahlte Subscriptions.',
  'exe.fin.receivables': 'Open Receivables',
  'exe.fin.receivablesTip': 'Issued + overdue Rechnungen, noch nicht bezahlt.',
  'exe.fin.paidRevenue': 'Paid Revenue',
  'exe.fin.paidRevenueTip': 'Historisch als paid markierter Rechnungsumsatz.',
  'exe.fin.billable': 'Billable Volumen',
  'exe.fin.billableTip': 'Freigegebene, noch nicht abgerechnete Stundenzettel-Leistung.',
  'exe.fin.pendingQuotes': 'Pending Quotes',
  'exe.fin.pendingQuotesTip': 'Aktive Subscriptions mit custom_quote_pending ohne anerkannten Preis.',
  'exe.fin.sessions': 'Completed Sessions',
  'exe.fin.sessionsTip': 'Abgeschlossene Payment Sessions als Cash-Proxy.',
  'exe.fin.gap': 'Spend↔Invoice Gap 30d',
  'exe.fin.gapTip': 'Approved Spend (30d) minus operational invoiced revenue (30d).',
  'exe.fin.thSource': 'Preisquelle',
  'exe.fin.thSubscribers': 'Subscriber',
  'exe.fin.thMrr': 'MRR',
  'exe.fin.lifecycle': 'Invoice-Lifecycle: Draft {draft} · Issued {issued} · Overdue {overdue} · Paid {paid} · Void {voided}',
  'exe.fin.coverage': 'Coverage 30d: {pct} · Approved Spend {spend} · Operational Invoiced {invoiced}',

  'exe.ret.unavailable': 'Retention-/Churn-Truth derzeit nicht verfügbar.',
  'exe.ret.activePaidOrgs': 'Active Paid Orgs',
  'exe.ret.activePaidOrgsTip': 'Aktive zahlende Organisationen im aktuellen Fenster.',
  'exe.ret.activeCustomers': 'Active Customers',
  'exe.ret.activeCustomersTip': 'Zahlende Organisationen mit wertstiftender Aktivität.',
  'exe.ret.retainedLogos': 'Retained Logos',
  'exe.ret.retainedLogosTip': 'Vorperioden-Kohorte, die weiterhin aktiv zahlend bleibt.',
  'exe.ret.logoChurn': 'Logo Churn Rate',
  'exe.ret.logoChurnTip': 'Logo-Churn im Kohortenvergleich.',
  'exe.ret.nrr': 'NRR',
  'exe.ret.nrrTip': 'Net Revenue Retention inkl. Expansion/Kontraktion.',
  'exe.ret.grossChurn': 'Gross Churn MRR',
  'exe.ret.grossChurnTip': 'Brutto-MRR-Verlust aus Vorperioden-Kohorte.',
  'exe.ret.expansion': 'Expansion MRR',
  'exe.ret.expansionTip': 'MRR-Expansion in der Vorperioden-Kohorte.',
  'exe.ret.inactivePaying': 'Inactive but Paying',
  'exe.ret.inactivePayingTip': 'Zahlende Organisationen ohne wertstiftende Aktivität.',
  'exe.ret.pqa': 'PQA',
  'exe.ret.pqaTip': 'Product Qualified Accounts mit intensiver Nutzung.',
  'exe.ret.usageHigh': 'Usage High',
  'exe.ret.usageMedium': 'Usage Medium',
  'exe.ret.usageLow': 'Usage Low',
  'exe.ret.usageDormant': 'Usage Dormant',
  'exe.ret.avgValueEvents': 'Avg Value Events',
  'exe.ret.medianValueEvents': 'Median Value Events',
  'exe.ret.segStage': 'Segment by Stage',
  'exe.ret.segPlan': 'Segment by Plan',
  'exe.ret.thStage': 'Stage',
  'exe.ret.thPlan': 'Plan',
  'exe.ret.thPaidOrgs': 'Paid Orgs',
  'exe.ret.thRetention': 'Retention',
  'exe.ret.thMrr': 'MRR',
  'exe.ret.atRisk': 'At-Risk Accounts',
  'exe.ret.thOrg': 'Organisation',
  'exe.ret.thRisk': 'Risk',
  'exe.ret.thValueEvents': 'Value Events',
  'exe.ret.usageMissing': 'Usage-Quelle nicht verfügbar: usage-basierte Retention-/Churn-Kennzahlen sind eingeschränkt.',

  'exe.pc.unavailable': 'Pilot-/Conversion-Truth derzeit nicht verfügbar.',
  'exe.pc.activePilots': 'Active Pilots',
  'exe.pc.activePilotsTip': 'Aktuell laufende Piloten.',
  'exe.pc.activatedPilots': 'Activated Pilots',
  'exe.pc.activatedPilotsTip': 'Aktive Piloten mit echtem Produktkontakt.',
  'exe.pc.convertedPilots': 'Converted Pilots',
  'exe.pc.convertedPilotsTip': 'Piloten mit zahlender Live-Conversion.',
  'exe.pc.atRiskPilots': 'At-Risk Pilots',
  'exe.pc.atRiskPilotsTip': 'Aktive Piloten mit klaren Risikosignalen.',
  'exe.pc.daysToActivation': 'Ø Tage bis Aktivierung',
  'exe.pc.daysToActivationTip': 'Durchschnitt Pilotstart bis erste echte Aktivierung.',
  'exe.pc.daysToConversion': 'Ø Tage bis Conversion',
  'exe.pc.daysToConversionTip': 'Durchschnitt Pilotstart bis zahlend live.',
  'exe.pc.pilotToActivated': 'Pilot → Aktiviert',
  'exe.pc.pilotToActivatedTip': 'Cohort-Rate Pilotstart bis Aktivierung.',
  'exe.pc.activatedToPaid': 'Aktiviert → Paid',
  'exe.pc.activatedToPaidTip': 'Cohort-Rate Aktivierung bis zahlend live.',
  'exe.pc.pilotToLost': 'Pilot → Lost',
  'exe.pc.pilotToLostTip': 'Cohort-Rate Pilotstart bis verloren.',
  'exe.pc.funnelNow': 'Aktueller Funnel-Stand',
  'exe.pc.thStage': 'Stage',
  'exe.pc.thOrgs': 'Orgs',
  'exe.pc.thAvgDays': 'Ø Tage',
  'exe.pc.thAtRisk': 'At-Risk',
  'exe.pc.noStages': 'Keine Funnel-Stufen vorhanden.',
  'exe.pc.transitions': 'Transition-Raten ({window})',
  'exe.pc.window': 'Fenster',
  'exe.pc.thTransition': 'Transition',
  'exe.pc.thCohort': 'Cohort',
  'exe.pc.thConverted': 'Converted',
  'exe.pc.thRate': 'Rate',
  'exe.pc.trLeadReg': 'Lead → Registrierung',
  'exe.pc.trRegPilot': 'Registrierung → Pilotstart',
  'exe.pc.trPilotAct': 'Pilotstart → Aktivierung',
  'exe.pc.trActPaid': 'Aktivierung → Paid',
  'exe.pc.trPilotLost': 'Pilot → Lost',
  'exe.pc.icp': 'GTM Learnings nach ICP',
  'exe.pc.thIcp': 'ICP',
  'exe.pc.thTracked': 'Tracked',
  'exe.pc.thActivated': 'Aktiviert',
  'exe.pc.noIcp': 'Keine ICP-Learnings vorhanden.',
  'exe.pc.tariff': 'Tarif-/Pfad-Learnings',
  'exe.pc.thPath': 'Pfad',
  'exe.pc.noTariff': 'Keine Tarifpfade vorhanden.',
  'exe.pc.modules': 'Produktbereiche mit echter Pilotnutzung',
  'exe.pc.thArea': 'Bereich',
  'exe.pc.thPilotOrgs': 'Pilot-Orgs',
  'exe.pc.thActivePilots': 'Active Pilots',
  'exe.pc.thSuccessUsage': 'Successful Usage',
  'exe.pc.thEvents': 'Events',
  'exe.pc.thOrg': 'Organisation',
  'exe.pc.thRisk': 'Risk',
  'exe.pc.thHints': 'Hinweise',
  'exe.pc.bottlenecks': 'Onboarding-Bottlenecks: ',
  'exe.pc.leadQuality': 'Pre-Registration-Leads sind nur teilweise vorhanden; Lead-Stage fallbackt sonst ehrlich auf Registrierung.',
  'exe.pc.pricingQuality': 'Pricing-Klarheit nutzt teilweise abgeleitete Zeitanker (Pilotstart / Subscription-Erstellung), da kein separates historisches Pricing-Timestamp existiert.',

  'exe.search.running': 'Suche laeuft…',
  'exe.search.noHits': 'Keine Treffer',
  'exe.search.hits': '{total} Treffer',
  'exe.search.error': 'Fehler: {error}',
  'exe.search.unknownItem': 'Unbekannt',

  'exe.health.db': 'Datenbank',
  'exe.health.online': 'Online',
  'exe.health.offline': 'Offline',
  'exe.health.api': 'API Service',
  'exe.health.searchEngine': 'Search Engine',
  'exe.health.fallback': 'Fallback',
  'exe.health.searchIndexes': 'Search Indexes',
  'exe.health.error': 'Health-Status konnte nicht geladen werden',

  'exe.ce.posts': 'Personal-Posts',
  'exe.ce.searchJobs': 'Such-Aufträge',
  'exe.ce.none': 'Keine CE-Daten',

  'exe.act.none': 'Keine Aktivitäten',
  'exe.act.action': 'Aktion',
  'exe.act.error': 'Aktivitäten konnten nicht geladen werden.',

  'exe.dsgvo.requests': 'DSGVO-Anfragen',
  'exe.dsgvo.open': 'Offen',
  'exe.dsgvo.categories': 'Datenkategorien',
  'exe.dsgvo.none': 'Keine DSGVO-Daten',

  'exe.crit.ageDays': '{days}d offen',
  'exe.crit.ageHours': '{hours}h offen',
  'exe.crit.ageMinutes': '{minutes} min offen',
  'exe.crit.ageNew': 'neu',
  'exe.crit.noStart': 'kein Startdatum',
  'exe.crit.startOverdue': 'Start überfällig',
  'exe.crit.startToday': 'Start heute',
  'exe.crit.startOneDay': 'Start in 1 Tag',
  'exe.crit.startInDays': 'Start in {days} Tagen',
  'exe.crit.noCoverage': 'keine Abdeckung',
  'exe.crit.coverageEmergency': '{committed} zugesagt · {responses} Reaktionen',
  'exe.crit.coverageStandard': '{shortlisted} Shortlist · {suppliers} Supplier',
  'exe.crit.openWorkers': '{count} Kräfte offen',
  'exe.crit.openPositions': '{count} Stellen offen',
  'exe.crit.sumPrioritised': 'Priorisiert',
  'exe.crit.sumPrioritisedTip': 'Serverseitig priorisierte Fälle mit Druck-Score ab 55.',
  'exe.crit.sumRisk': 'Risiko',
  'exe.crit.sumRiskTip': 'Priorisierte Fälle mit Risiko-Ton und besonders hohem Druck-Score.',
  'exe.crit.sumWarn': 'Warnung',
  'exe.crit.sumWarnTip': 'Priorisierte Fälle mit Warn-Ton und erhöhter Management-Aufmerksamkeit.',
  'exe.crit.sumEmergency': 'Notdienst',
  'exe.crit.sumEmergencyTip': 'Priorisierte Notdienstfälle in der aktuellen Management-Sicht.',
  'exe.crit.unavailable': 'Kritischer Besetzungsdruck derzeit nicht verfügbar.',
  'exe.crit.empty': 'Kein kritischer Besetzungsdruck. Aktuell gibt es keine priorisierten Arbeitsplatzangebote oder Notdienstfälle.',
  'exe.crit.kindEmergency': 'Notdienst',
  'exe.crit.kindPosting': 'Arbeitsplatzangebot',
  'exe.crit.noRole': 'ohne Rolle',
  'exe.crit.fallbackTitle': 'Vorgang',
  'exe.crit.score': 'Druck-Score',
  'exe.crit.rowTitle': 'Serverseitig priorisiert nach Druck-Score.',
  'exe.crit.rowDrivers': ' Treiber: {reasons}.'
});
TCi18n.register('en', {
  'exe.docTitle': 'Steering & analytics – TempConnect',
  'exe.page.title': 'Steering & analytics',
  'exe.page.subtitle': 'Supplier performance, staffing pressure, spend, quality and platform health as a downstream management view.',
  'exe.search.ph': 'Quick search…',
  'exe.search.btn': 'Search',
  'exe.refresh': 'Refresh',

  'exe.banner.eyebrow': 'Steering layer',
  'exe.banner.title': 'This view aggregates pilot operations — it does not replace the operational entry point',
  'exe.banner.text': 'Executive KPIs, spend and supplier performance help with prioritisation and sales, but they follow the operational core. Only once job postings, deals and hours run cleanly do these figures have the right effect.',
  'exe.banner.asideTitle': 'Deliberately downstream',
  'exe.banner.asideText': 'Use this page for management decisions, not as a replacement for job posting, deal or assignment work.',

  'exe.onb.label': 'Set up the platform',
  'exe.onb.toggle': 'Expand / collapse',
  'exe.action.hide': 'Hide',

  'exe.hub.current.title': 'Steering & analytics',
  'exe.hub.current.desc': 'You are in the management and steering area.',
  'exe.hub.kpi.title': 'Management KPIs',
  'exe.hub.kpi.desc': 'KPIs, SLA compliance and platform overview.',
  'exe.hub.vendor.title': 'Supplier pool',
  'exe.hub.vendor.desc': 'Manage the supplier pool and qualify suppliers for job postings.',
  'exe.hub.scorecard.title': 'Supplier scorecard',
  'exe.hub.scorecard.desc': 'Scorecard, performance and quality metrics.',
  'exe.hub.rates.title': 'Rate cards',
  'exe.hub.rates.desc': 'Hourly rate tables and pricing agreements.',
  'exe.hub.spend.title': 'Spend & cost',
  'exe.hub.spend.desc': 'Spend analysis, budgets and cost trends.',
  'exe.hub.health.title': 'System & platform health',
  'exe.hub.health.desc': 'System status, availability, platform metrics and infrastructure.',
  'exe.hub.req.title': 'Job postings',
  'exe.hub.req.desc': 'Staffing requirements and posting intake.',
  'exe.hub.compliance.title': 'Compliance',
  'exe.hub.compliance.desc': 'Regulatory conformity, audits and document status.',

  'exe.filter.org': 'Organisation',
  'exe.filter.allOrgs': 'All organisations',

  'exe.onbBanner.title': 'Continue onboarding',
  'exe.onbBanner.cta': 'Continue setup',
  'exe.onbBanner.pct': '{pct}% complete',
  'exe.onbBanner.default': 'Complete your profile to use all functions.',
  'exe.onbBanner.profile': 'Complete your company profile to get started.',
  'exe.onbBanner.firstAction': 'Create your first action to finish onboarding.',

  'exe.sec.pulse': 'Procurement pulse (30 days)',
  'exe.sec.critical': 'Critical staffing pressure',
  'exe.link.backlog': 'Backlog',
  'exe.sec.reqStatus': 'Job postings by status',
  'exe.link.allReq': 'All postings',
  'exe.sec.sla': 'SLA compliance (30 days)',
  'exe.sec.compliance': 'Compliance documents',
  'exe.sec.platform': 'Platform',
  'exe.sec.searchResults': 'Search results',
  'exe.sec.spend': 'Spend overview (30 days)',
  'exe.link.details': 'Details',
  'exe.sec.finance': 'Finance truth',
  'exe.link.revenueConsole': 'Revenue console',
  'exe.finance.exportCsv': 'Export CSV',
  'exe.finance.exportJson': 'Export JSON',
  'exe.sec.retention': 'SaaS retention & usage truth',
  'exe.link.revenueDrill': 'Revenue drilldown',
  'exe.sec.pilot': 'Pilot & conversion truth',
  'exe.link.funnelDrill': 'Funnel drilldown',
  'exe.sec.ce': 'Matching activity',
  'exe.sec.activity': 'Recent activity',
  'exe.sec.dsgvo': 'GDPR compliance',
  'exe.link.governance': 'Governance',
  'exe.sec.health': 'Platform health',
  'exe.state.loading': 'Loading…',

  'exe.access.denied': 'Steering & analytics is currently not enabled for this role.',
  'exe.access.hiddenTitle': 'Steering & analytics hidden',
  'exe.export.hidden': 'The finance export stays hidden for this role.',
  'exe.export.ready': 'CSV/JSON snapshot available for audit.',
  'exe.export.running': 'Preparing the export…',
  'exe.export.done': 'Export provided.',
  'exe.export.failed': 'Export failed: {error}',
  'exe.error.unknown': 'Unknown error',

  'exe.scope.allLocations': 'All locations',
  'exe.scope.days': '{days} days',
  'exe.scope.org': 'Org:',
  'exe.scope.location': 'Location:',
  'exe.scope.period': 'Period:',
  'exe.scope.asOf': 'As of:',
  'exe.scope.orgTip': 'Organisation – all data is limited to this org',
  'exe.scope.locationTip': 'Location context – "All locations" means an org-wide evaluation',
  'exe.scope.periodTip': 'Analysis period of the figures shown',
  'exe.scope.asOfTip': 'Time the data was calculated on the server',

  'exe.stage.lead': 'Lead',
  'exe.stage.qualified': 'Qualified',
  'exe.stage.registered': 'Registered',
  'exe.stage.pilot_started': 'Pilot started',
  'exe.stage.pilot_activated': 'Pilot activated',
  'exe.stage.first_core_flow_executed': 'First core flow',
  'exe.stage.pilot_successful_usage': 'Substantial usage',
  'exe.stage.commercial_pricing_clarified': 'Pricing clarified',
  'exe.stage.paid_live': 'Paying live',
  'exe.stage.lost_aborted': 'Lost',

  'exe.tariff.pilot': 'Pilot path',
  'exe.tariff.direct_contract': 'Direct contract',
  'exe.tariff.catalog_paid': 'Catalog / live',
  'exe.tariff.lead_only': 'Lead without conversion',
  'exe.tariff.unclassified': 'Unclassified',

  'exe.module.demand': 'Demand',
  'exe.module.deal': 'Deal',
  'exe.module.delivery': 'Delivery',
  'exe.module.vendor_governance': 'Supplier governance',

  'exe.basis.current_backlog': 'Time basis: current backlog.',
  'exe.basis.activity_30d': 'Time basis: activity of the last 30 days.',
  'exe.basis.window_overlap_30d': 'Time basis: valid within the 30-day window.',
  'exe.basis.approved_timesheets_30d': 'Time basis: approved timesheets of the last 30 days.',
  'exe.basis.risk_window_30d': 'Time basis: current risks and the next 30-day window.',
  'exe.metric.unavailable': 'The value is currently unavailable.',
  'exe.metric.fallback': 'Metric',

  'exe.unavail.kpiLabel': 'Dashboard unavailable',
  'exe.unavail.pulse': 'The procurement pulse could not be loaded.',
  'exe.unavail.critical': 'Critical staffing pressure could not be loaded.',
  'exe.unavail.req': 'Job postings could not be loaded.',
  'exe.unavail.sla': 'SLA data could not be loaded.',
  'exe.unavail.compliance': 'Compliance data could not be loaded.',
  'exe.unavail.platform': 'Platform data could not be loaded.',
  'exe.unavail.spend': 'Spend data could not be loaded.',
  'exe.unavail.finance': 'Finance data could not be loaded.',
  'exe.unavail.retention': 'Retention and churn data could not be loaded.',
  'exe.unavail.pilot': 'Pilot and conversion data could not be loaded.',
  'exe.unavail.exportHint': 'Dashboard unavailable. The export can be attempted separately.',

  'exe.locked.kpiLabel': 'Steering hidden',
  'exe.locked.critical': 'Critical staffing pressure stays hidden for this role.',
  'exe.locked.req': 'Job postings stay hidden for this role.',
  'exe.locked.sla': 'SLA data stays hidden for this role.',
  'exe.locked.compliance': 'Compliance data stays hidden for this role.',
  'exe.locked.platform': 'Platform data stays hidden for this role.',
  'exe.locked.spend': 'Spend data stays hidden for this role.',
  'exe.locked.finance': 'Finance data stays hidden for this role.',
  'exe.locked.retention': 'Retention and churn data stays hidden for this role.',
  'exe.locked.pilot': 'Pilot and conversion data stays hidden for this role.',
  'exe.locked.ce': 'Matching activity stays hidden for this role.',
  'exe.locked.activity': 'Activity stays hidden for this role.',
  'exe.locked.dsgvo': 'Governance metrics stay hidden for this role.',
  'exe.locked.health': 'Platform health stays hidden for this role.',

  'exe.pulse.unavailable': 'Procurement pulse currently unavailable.',

  'exe.kpi.none': 'No KPI data',
  'exe.kpi.noneLoc': 'No KPI data for location {loc}',
  'exe.kpi.total': 'Total',
  'exe.kpi.totalTip': 'All job postings regardless of status.',
  'exe.kpi.open': 'Open',
  'exe.kpi.openTip': 'Job postings in status OPEN.',
  'exe.kpi.inReview': 'In review',
  'exe.kpi.inReviewTip': 'Job postings in status IN_REVIEW.',
  'exe.kpi.shortlisted': 'Shortlisted',
  'exe.kpi.shortlistedTip': 'Job postings in status SHORTLISTED.',
  'exe.kpi.filled': 'Filled',
  'exe.kpi.filledTip': 'Job postings in status FILLED.',
  'exe.kpi.cancelled': 'Cancelled',
  'exe.kpi.cancelledTip': 'Job postings in status CANCELLED.',
  'exe.kpi.urgentOpen': 'Urgent open',
  'exe.kpi.urgentOpenTip': 'Urgent job postings in the operational working range OPEN or IN_REVIEW.',
  'exe.kpi.avgTtf': 'Avg time-to-fill',
  'exe.kpi.avgTtfTip': 'Average time from creation to FILLED in hours.',

  'exe.reqChart.none': 'No job posting data available.',
  'exe.reqChart.noneLoc': 'No job posting data for location {loc}.',
  'exe.req.draft': 'Draft',
  'exe.req.pendingApproval': 'Approval',
  'exe.req.approved': 'Approved',
  'exe.req.open': 'Open',
  'exe.req.inReview': 'Review',
  'exe.req.shortlisted': 'Shortlist',
  'exe.req.filled': 'Filled',
  'exe.req.closed': 'Closed',
  'exe.req.cancelled': 'Cancelled',

  'exe.sla.none': 'No SLA data available.',
  'exe.sla.met': 'SLA met',
  'exe.sla.breached': 'SLA breached',
  'exe.sla.running': 'Running',
  'exe.sla.compliance': 'Compliance %',
  'exe.sla.belowThreshold': 'Below threshold (80%)',

  'exe.comp.none': 'No compliance data available.',
  'exe.comp.verified': 'Verified',
  'exe.comp.pending': 'Pending',
  'exe.comp.expired': 'Expired',
  'exe.comp.rejected': 'Rejected',
  'exe.comp.expiring': '{count} document(s) expire within 30 days',

  'exe.platform.none': 'No platform data available.',
  'exe.platform.users': 'Users',
  'exe.platform.orgs': 'Organisations',
  'exe.platform.capacityPosts': 'Active staff offers',
  'exe.platform.openDemands': 'Open demands',
  'exe.platform.vendorEntries': 'Supplier entries',

  'exe.spend.unavailable': 'Spend currently unavailable.',
  'exe.spend.noData': 'No spend data in the current 30-day window.',
  'exe.spend.total': 'Spend 30 days',
  'exe.spend.totalTip': 'Approved spend from approved timesheets in the current 30-day window.',
  'exe.spend.projected': 'Projected spend',
  'exe.spend.projectedTip': 'Projection based on active assignments and the weeks remaining until the planned end; without an end date a 90-day fallback applies.',
  'exe.spend.activeAssignments': 'Active assignments',
  'exe.spend.activeAssignmentsTip': 'Active assignments that feed the spend projection.',
  'exe.spend.assignments30d': 'Assignments 30 days',
  'exe.spend.assignments30dTip': 'Assignments with approved timesheets in the current 30-day window.',
  'exe.spend.vendors30d': 'Suppliers 30 days',
  'exe.spend.vendors30dTip': 'Distinct suppliers with approved spend in the current 30-day window.',
  'exe.spend.approvedHours': 'Approved hours',
  'exe.spend.approvedHoursTip': 'Approved hours from approved timesheets in the current 30-day window.',
  'exe.spend.avgRate': 'Avg hourly rate',
  'exe.spend.avgRateTip': 'Average actual hourly rate of the spend basis in the current window.',
  'exe.spend.overtime': 'Overtime',
  'exe.spend.overtimeTip': 'Overtime share of the approved spend in the current 30-day window.',
  'exe.spend.overRate': 'Over-rate ({pct}%)',
  'exe.spend.overRateTip': '{count} assignment(s) in the window exceed the rate card target.',

  'exe.fin.unavailable': 'Finance truth currently unavailable.',
  'exe.fin.mrr': 'Contractual MRR',
  'exe.fin.mrrTip': 'Contractually recognised monthly revenue excluding custom_quote_pending.',
  'exe.fin.catalogMrr': 'Catalog MRR (theoretical)',
  'exe.fin.catalogMrrTip': 'Catalog-based reference MRR for active paid subscriptions.',
  'exe.fin.receivables': 'Open receivables',
  'exe.fin.receivablesTip': 'Issued and overdue invoices that are not yet paid.',
  'exe.fin.paidRevenue': 'Paid revenue',
  'exe.fin.paidRevenueTip': 'Invoice revenue historically marked as paid.',
  'exe.fin.billable': 'Billable volume',
  'exe.fin.billableTip': 'Approved timesheet work that has not been invoiced yet.',
  'exe.fin.pendingQuotes': 'Pending quotes',
  'exe.fin.pendingQuotesTip': 'Active subscriptions with custom_quote_pending and no recognised price.',
  'exe.fin.sessions': 'Completed sessions',
  'exe.fin.sessionsTip': 'Completed payment sessions as a cash proxy.',
  'exe.fin.gap': 'Spend↔invoice gap 30d',
  'exe.fin.gapTip': 'Approved spend (30d) minus operational invoiced revenue (30d).',
  'exe.fin.thSource': 'Price source',
  'exe.fin.thSubscribers': 'Subscribers',
  'exe.fin.thMrr': 'MRR',
  'exe.fin.lifecycle': 'Invoice lifecycle: draft {draft} · issued {issued} · overdue {overdue} · paid {paid} · void {voided}',
  'exe.fin.coverage': 'Coverage 30d: {pct} · approved spend {spend} · operational invoiced {invoiced}',

  'exe.ret.unavailable': 'Retention and churn truth currently unavailable.',
  'exe.ret.activePaidOrgs': 'Active paid orgs',
  'exe.ret.activePaidOrgsTip': 'Active paying organisations in the current window.',
  'exe.ret.activeCustomers': 'Active customers',
  'exe.ret.activeCustomersTip': 'Paying organisations with value-generating activity.',
  'exe.ret.retainedLogos': 'Retained logos',
  'exe.ret.retainedLogosTip': 'Prior-period cohort that keeps paying actively.',
  'exe.ret.logoChurn': 'Logo churn rate',
  'exe.ret.logoChurnTip': 'Logo churn in the cohort comparison.',
  'exe.ret.nrr': 'NRR',
  'exe.ret.nrrTip': 'Net revenue retention incl. expansion and contraction.',
  'exe.ret.grossChurn': 'Gross churn MRR',
  'exe.ret.grossChurnTip': 'Gross MRR loss from the prior-period cohort.',
  'exe.ret.expansion': 'Expansion MRR',
  'exe.ret.expansionTip': 'MRR expansion within the prior-period cohort.',
  'exe.ret.inactivePaying': 'Inactive but paying',
  'exe.ret.inactivePayingTip': 'Paying organisations without value-generating activity.',
  'exe.ret.pqa': 'PQA',
  'exe.ret.pqaTip': 'Product qualified accounts with intensive usage.',
  'exe.ret.usageHigh': 'Usage high',
  'exe.ret.usageMedium': 'Usage medium',
  'exe.ret.usageLow': 'Usage low',
  'exe.ret.usageDormant': 'Usage dormant',
  'exe.ret.avgValueEvents': 'Avg value events',
  'exe.ret.medianValueEvents': 'Median value events',
  'exe.ret.segStage': 'Segment by stage',
  'exe.ret.segPlan': 'Segment by plan',
  'exe.ret.thStage': 'Stage',
  'exe.ret.thPlan': 'Plan',
  'exe.ret.thPaidOrgs': 'Paid orgs',
  'exe.ret.thRetention': 'Retention',
  'exe.ret.thMrr': 'MRR',
  'exe.ret.atRisk': 'At-risk accounts',
  'exe.ret.thOrg': 'Organisation',
  'exe.ret.thRisk': 'Risk',
  'exe.ret.thValueEvents': 'Value events',
  'exe.ret.usageMissing': 'Usage source unavailable: usage-based retention and churn figures are limited.',

  'exe.pc.unavailable': 'Pilot and conversion truth currently unavailable.',
  'exe.pc.activePilots': 'Active pilots',
  'exe.pc.activePilotsTip': 'Pilots currently running.',
  'exe.pc.activatedPilots': 'Activated pilots',
  'exe.pc.activatedPilotsTip': 'Active pilots with real product contact.',
  'exe.pc.convertedPilots': 'Converted pilots',
  'exe.pc.convertedPilotsTip': 'Pilots with a paying live conversion.',
  'exe.pc.atRiskPilots': 'At-risk pilots',
  'exe.pc.atRiskPilotsTip': 'Active pilots with clear risk signals.',
  'exe.pc.daysToActivation': 'Avg days to activation',
  'exe.pc.daysToActivationTip': 'Average from pilot start to the first real activation.',
  'exe.pc.daysToConversion': 'Avg days to conversion',
  'exe.pc.daysToConversionTip': 'Average from pilot start to paying live.',
  'exe.pc.pilotToActivated': 'Pilot → activated',
  'exe.pc.pilotToActivatedTip': 'Cohort rate from pilot start to activation.',
  'exe.pc.activatedToPaid': 'Activated → paid',
  'exe.pc.activatedToPaidTip': 'Cohort rate from activation to paying live.',
  'exe.pc.pilotToLost': 'Pilot → lost',
  'exe.pc.pilotToLostTip': 'Cohort rate from pilot start to lost.',
  'exe.pc.funnelNow': 'Current funnel state',
  'exe.pc.thStage': 'Stage',
  'exe.pc.thOrgs': 'Orgs',
  'exe.pc.thAvgDays': 'Avg days',
  'exe.pc.thAtRisk': 'At-risk',
  'exe.pc.noStages': 'No funnel stages available.',
  'exe.pc.transitions': 'Transition rates ({window})',
  'exe.pc.window': 'window',
  'exe.pc.thTransition': 'Transition',
  'exe.pc.thCohort': 'Cohort',
  'exe.pc.thConverted': 'Converted',
  'exe.pc.thRate': 'Rate',
  'exe.pc.trLeadReg': 'Lead → registration',
  'exe.pc.trRegPilot': 'Registration → pilot start',
  'exe.pc.trPilotAct': 'Pilot start → activation',
  'exe.pc.trActPaid': 'Activation → paid',
  'exe.pc.trPilotLost': 'Pilot → lost',
  'exe.pc.icp': 'GTM learnings by ICP',
  'exe.pc.thIcp': 'ICP',
  'exe.pc.thTracked': 'Tracked',
  'exe.pc.thActivated': 'Activated',
  'exe.pc.noIcp': 'No ICP learnings available.',
  'exe.pc.tariff': 'Tariff and path learnings',
  'exe.pc.thPath': 'Path',
  'exe.pc.noTariff': 'No tariff paths available.',
  'exe.pc.modules': 'Product areas with real pilot usage',
  'exe.pc.thArea': 'Area',
  'exe.pc.thPilotOrgs': 'Pilot orgs',
  'exe.pc.thActivePilots': 'Active pilots',
  'exe.pc.thSuccessUsage': 'Successful usage',
  'exe.pc.thEvents': 'Events',
  'exe.pc.thOrg': 'Organisation',
  'exe.pc.thRisk': 'Risk',
  'exe.pc.thHints': 'Notes',
  'exe.pc.bottlenecks': 'Onboarding bottlenecks: ',
  'exe.pc.leadQuality': 'Pre-registration leads are only partly available; otherwise the lead stage falls back honestly to registration.',
  'exe.pc.pricingQuality': 'Pricing clarity partly uses derived time anchors (pilot start / subscription creation) because no separate historical pricing timestamp exists.',

  'exe.search.running': 'Searching…',
  'exe.search.noHits': 'No results',
  'exe.search.hits': '{total} results',
  'exe.search.error': 'Error: {error}',
  'exe.search.unknownItem': 'Unknown',

  'exe.health.db': 'Database',
  'exe.health.online': 'Online',
  'exe.health.offline': 'Offline',
  'exe.health.api': 'API service',
  'exe.health.searchEngine': 'Search engine',
  'exe.health.fallback': 'Fallback',
  'exe.health.searchIndexes': 'Search indexes',
  'exe.health.error': 'The health status could not be loaded',

  'exe.ce.posts': 'Staff posts',
  'exe.ce.searchJobs': 'Search requests',
  'exe.ce.none': 'No matching data',

  'exe.act.none': 'No activity',
  'exe.act.action': 'Action',
  'exe.act.error': 'Activity could not be loaded.',

  'exe.dsgvo.requests': 'GDPR requests',
  'exe.dsgvo.open': 'Open',
  'exe.dsgvo.categories': 'Data categories',
  'exe.dsgvo.none': 'No GDPR data',

  'exe.crit.ageDays': 'open for {days}d',
  'exe.crit.ageHours': 'open for {hours}h',
  'exe.crit.ageMinutes': 'open for {minutes} min',
  'exe.crit.ageNew': 'new',
  'exe.crit.noStart': 'no start date',
  'exe.crit.startOverdue': 'start overdue',
  'exe.crit.startToday': 'starts today',
  'exe.crit.startOneDay': 'starts in 1 day',
  'exe.crit.startInDays': 'starts in {days} days',
  'exe.crit.noCoverage': 'no coverage',
  'exe.crit.coverageEmergency': '{committed} committed · {responses} responses',
  'exe.crit.coverageStandard': '{shortlisted} shortlisted · {suppliers} suppliers',
  'exe.crit.openWorkers': '{count} workers open',
  'exe.crit.openPositions': '{count} positions open',
  'exe.crit.sumPrioritised': 'Prioritised',
  'exe.crit.sumPrioritisedTip': 'Server-side prioritised cases with a pressure score of 55 or higher.',
  'exe.crit.sumRisk': 'Risk',
  'exe.crit.sumRiskTip': 'Prioritised cases with a risk tone and a particularly high pressure score.',
  'exe.crit.sumWarn': 'Warning',
  'exe.crit.sumWarnTip': 'Prioritised cases with a warning tone and raised management attention.',
  'exe.crit.sumEmergency': 'Emergency cover',
  'exe.crit.sumEmergencyTip': 'Prioritised emergency cover cases in the current management view.',
  'exe.crit.unavailable': 'Critical staffing pressure currently unavailable.',
  'exe.crit.empty': 'No critical staffing pressure. There are currently no prioritised job postings or emergency cover cases.',
  'exe.crit.kindEmergency': 'Emergency cover',
  'exe.crit.kindPosting': 'Job posting',
  'exe.crit.noRole': 'no role',
  'exe.crit.fallbackTitle': 'Case',
  'exe.crit.score': 'Pressure score',
  'exe.crit.rowTitle': 'Prioritised server-side by pressure score.',
  'exe.crit.rowDrivers': ' Drivers: {reasons}.'
});

(function() {
  'use strict';
  /** Kurzform der Uebersetzung an der Verwendungsstelle. */
  function t(key, params) { return TCi18n.t(key, params); }
  /** BCP-47-Locale fuer Datums-/Zahlenformatierung (DE bleibt Default). */
  function loc() { return TCi18n.dateLocale(); }
  /** Text + Marker setzen, damit ein Sprachwechsel den Wert nachzieht. */
  function setI18nText(el, key, params) {
    if (!el) return;
    if (params) el.removeAttribute('data-i18n');
    else el.setAttribute('data-i18n', key);
    el.textContent = t(key, params);
  }
  var currentMe = null;
  var executiveAccess = { canRead: false, canWrite: false, canExport: false, mode: 'hidden', reason: '' };
  var rateCardAccess = { canRead: false, canWrite: false, mode: 'hidden', reason: '' };
  var EXEC_DASH_FILTER_STORAGE_KEY = 'tc.executiveDashboard.filters.v1';
  function applyExecutiveDomLocks(root) {
    if (window.TC && window.TC.entitlements && typeof window.TC.entitlements.applyDomLocks === 'function') {
      window.TC.entitlements.applyDomLocks(root || document).catch(function() {});
    }
  }

  function readStoredExecutiveFilters() {
    try {
      var raw = sessionStorage.getItem(EXEC_DASH_FILTER_STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) { return {}; }
  }

  function writeStoredExecutiveFilters(filters) {
    try { sessionStorage.setItem(EXEC_DASH_FILTER_STORAGE_KEY, JSON.stringify(filters || {})); }
    catch (e) { /* Session-Storage kann lokal blockiert sein. */ }
  }

  function applyOrgFilterDefaults() {
    var params = new URLSearchParams(window.location.search || '');
    var hasOrg = params.has('org_id');
    var stored = hasOrg ? {} : readStoredExecutiveFilters();
    var orgId = hasOrg ? (params.get('org_id') || '') : (stored.orgId || '');
    var orgFilter = document.getElementById('orgFilter');
    if (orgFilter) {
      if (orgId) {
        var hasOption = Array.prototype.some.call(orgFilter.options, function(opt) { return opt.value === orgId; });
        if (hasOption) orgFilter.value = orgId;
      } else {
        orgFilter.value = '';
      }
    }
    return orgId;
  }

  function bindOrgFilterPersistence() {
    var orgFilter = document.getElementById('orgFilter');
    if (!orgFilter) return;
    orgFilter.addEventListener('change', function() {
      writeStoredExecutiveFilters({ orgId: orgFilter.value || '' });
      loadDashboard();
    });
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  async function api(path) {
    try { return await TC.api.get(path); } catch(e) { return null; }
  }
  function renderExecutiveState(tone, title, text) {
    var el = document.getElementById('executiveState');
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
  function describeExecutiveAccess(access) {
    if (!access || access.canRead) return '';
    return access.reason || t('exe.access.denied');
  }
  function resolveSurfaceAccess(me, key) {
    if (window.TC && window.TC.surfaceAccess && typeof window.TC.surfaceAccess.resolve === 'function') {
      return window.TC.surfaceAccess.resolve(me, key) || { canRead: false, canWrite: false, mode: 'hidden', reason: '' };
    }
    return { canRead: false, canWrite: false, mode: 'hidden', reason: '' };
  }
  function applyExecutiveRateCardAccess() {
    var hubLink = document.getElementById('executiveRateCardHubLink');
    if (!hubLink) return;
    hubLink.style.display = rateCardAccess.canRead ? '' : 'none';
  }
  function applyExecutiveAccess() {
    applyExecutiveRateCardAccess();
    var refreshButtons = Array.prototype.slice.call(document.querySelectorAll('button[onclick*="loadDashboard"], button[onclick*="runQuickSearch"], button[onclick*="exportExecutiveFinanceTruth"]'));
    refreshButtons.forEach(function(button) {
      if (button && button.getAttribute('onclick') && button.getAttribute('onclick').indexOf('exportExecutiveFinanceTruth') !== -1) {
        button.style.display = executiveAccess.canExport ? '' : 'none';
      } else if (button) {
        button.disabled = !executiveAccess.canRead;
      }
    });
    var quickSearch = document.getElementById('quickSearch');
    if (quickSearch) quickSearch.disabled = !executiveAccess.canRead;
    var orgFilter = document.getElementById('orgFilter');
    if (orgFilter) orgFilter.disabled = !executiveAccess.canRead;
    if (!executiveAccess.canExport) {
      setFinanceExportStatus(t('exe.export.hidden'), 'muted');
    }
    applyExecutiveDomLocks(document);
  }

  function sectionMessage(text) {
    return '<p style="color:var(--muted);font-size:13px">' + esc(text) + '</p>';
  }
  function setFinanceExportStatus(message, tone) {
    var status = document.getElementById('financeExportStatus');
    if (!status) return;
    status.className = 'ds-text-sm';
    if (tone === 'good') status.style.color = 'var(--good)';
    else if (tone === 'bad') status.style.color = 'var(--bad)';
    else if (tone === 'warn') status.style.color = 'var(--warn)';
    else status.style.color = 'var(--muted)';
    status.textContent = message || '';
  }

  function setFinanceExportButtonsDisabled(disabled) {
    Array.prototype.slice.call(document.querySelectorAll('button[onclick*="exportExecutiveFinanceTruth"]')).forEach(function(button) {
      button.disabled = !!disabled;
    });
  }

  function fileNameFromContentDisposition(headerValue, fallback) {
    if (!headerValue) return fallback;
    var fileNameMatch = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(headerValue);
    var raw = fileNameMatch ? (fileNameMatch[1] || fileNameMatch[2]) : null;
    if (!raw) return fallback;
    try {
      return decodeURIComponent(raw);
    } catch (_err) {
      return raw;
    }
  }

  function saveBlob(blob, fileName) {
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

  async function exportExecutiveFinanceTruth(format) {
    var normalized = String(format || '').toLowerCase();
    if (normalized !== 'csv' && normalized !== 'json') return;
    if (!executiveAccess.canExport) return;
    setFinanceExportButtonsDisabled(true);
    setFinanceExportStatus(t('exe.export.running'), 'muted');
    try {
      if (normalized === 'csv') {
        var response = await TC.api.request('/reporting/finance-truth/export?format=csv', { method: 'GET', rawResponse: true });
        var csvBlob = await response.blob();
        var csvName = fileNameFromContentDisposition(
          response.headers.get('content-disposition'),
          'finance-truth-' + new Date().toISOString().slice(0, 10) + '.csv'
        );
        saveBlob(csvBlob, csvName);
      } else {
        var payload = await TC.api.get('/reporting/finance-truth/export?format=json');
        var jsonBlob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        var jsonName = 'finance-truth-' + new Date().toISOString().slice(0, 10) + '.json';
        saveBlob(jsonBlob, jsonName);
      }
      setFinanceExportStatus(t('exe.export.done'), 'good');
    } catch (err) {
      setFinanceExportStatus(t('exe.export.failed', { error: (err && err.message) || t('exe.error.unknown') }), 'bad');
    } finally {
      setFinanceExportButtonsDisabled(false);
    }
  }
  window.exportExecutiveFinanceTruth = exportExecutiveFinanceTruth;

  function compactEuro(cents) {
    return ((Number(cents) || 0) / 100).toLocaleString(loc(), {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }) + ' €';
  }

  function compactEuroValue(value) {
    return (Number(value) || 0).toLocaleString(loc(), {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }) + ' €';
  }

  function compactCount(value) {
    return (Number(value) || 0).toLocaleString(loc(), {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  }

  function compactPercent(value) {
    if (value == null || !isFinite(Number(value))) return '–';
    return Number(value).toLocaleString(loc(), {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }) + '%';
  }
  function compactDays(value) {
    if (value == null || !isFinite(Number(value))) return '–';
    return Number(value).toLocaleString(loc(), {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }) + ' d';
  }

  // ── Scope-Display-Hilfsfunktionen ──────────────────────────────────────────

  function fmtDate(iso) {
    if (!iso) return '–';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString(loc(), { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function fmtDateTime(iso) {
    if (!iso) return '–';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(loc(), {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  /**
   * Rendert die Scope-Kontextleiste (Org | Standort | Zeitraum | Datenstand).
   * Erstellt das Element dynamisch vor #kpiGrid wenn #dashboardScopeBar fehlt.
   * scope=null blendet die Leiste aus.
   *
   * @param {object|null} scope - { org_id, location_id, date_from, date_to, window_days }
   * @param {string|null} generatedAt - ISO-Timestamp des API-Calls
   */
  function renderScopeBar(scope, generatedAt) {
    var bar = document.getElementById('dashboardScopeBar');
    if (!bar) {
      var kpiGrid = document.getElementById('kpiGrid');
      if (!kpiGrid || !kpiGrid.parentNode) return;
      bar = document.createElement('div');
      bar.id = 'dashboardScopeBar';
      kpiGrid.parentNode.insertBefore(bar, kpiGrid);
    }
    if (!scope) {
      bar.style.display = 'none';
      return;
    }

    // Org-Name: aus aktuellem Me-Objekt, Fallback auf scope.org_id
    var orgName = (currentMe && currentMe.org_name) || scope.org_id || '–';

    // Standort-Anzeige
    var locName = null;
    try { locName = sessionStorage.getItem('tc.activeLocationName'); } catch (_e) { /* storage not available */ }
    var locDisplay = locName || (scope.location_id || null) || t('exe.scope.allLocations');

    // Zeitraum
    var periodDisplay = fmtDate(scope.date_from) + ' – ' + fmtDate(scope.date_to);
    if (scope.window_days) periodDisplay += ' (' + t('exe.scope.days', { days: scope.window_days }) + ')';

    // Datenstand
    var standDisplay = generatedAt ? fmtDateTime(generatedAt) : '–';

    bar.style.display = '';
    bar.setAttribute('style',
      'padding:6px 0 10px;font-size:12px;color:var(--muted);' +
      'display:flex;flex-wrap:wrap;gap:14px;align-items:center;' +
      'border-bottom:1px solid var(--line);margin-bottom:14px');
    // Die <strong>-Labels tragen einen i18n-Marker (reiner Statischtext), die
    // Werte daneben bleiben Laufzeitdaten — so zieht ein Sprachwechsel die
    // Beschriftung nach, ohne den Wert zu ueberschreiben.
    function scopeItem(labelKey, tipKey, value) {
      return '<span title="' + esc(t(tipKey)) + '" data-i18n-title="' + tipKey + '">' +
        '<strong style="color:var(--text)" data-i18n="' + labelKey + '">' + esc(t(labelKey)) + '</strong> ' + esc(value) +
      '</span>';
    }
    bar.innerHTML =
      scopeItem('exe.scope.org', 'exe.scope.orgTip', orgName) +
      scopeItem('exe.scope.location', 'exe.scope.locationTip', locDisplay) +
      scopeItem('exe.scope.period', 'exe.scope.periodTip', periodDisplay) +
      scopeItem('exe.scope.asOf', 'exe.scope.asOfTip', standDisplay);
  }

  /* Uebersetzte Anzeige-Labels fuer Server-Enums: der Rohwert bleibt die
     Wahrheit (und die Fallback-Anzeige), uebersetzt wird nur die Beschriftung. */
  var PILOT_STAGES = [
    'lead', 'qualified', 'registered', 'pilot_started', 'pilot_activated',
    'first_core_flow_executed', 'pilot_successful_usage',
    'commercial_pricing_clarified', 'paid_live', 'lost_aborted'
  ];
  function pilotStageLabel(stage) {
    if (PILOT_STAGES.indexOf(stage) >= 0) return t('exe.stage.' + stage);
    return stage || '–';
  }
  var TARIFF_PATHS = ['pilot', 'direct_contract', 'catalog_paid', 'lead_only', 'unclassified'];
  function tariffPathLabel(path) {
    if (TARIFF_PATHS.indexOf(path) >= 0) return t('exe.tariff.' + path);
    return path || '–';
  }
  var MODULES = ['demand', 'deal', 'delivery', 'vendor_governance'];
  function moduleLabel(module) {
    if (MODULES.indexOf(module) >= 0) return t('exe.module.' + module);
    return module || '–';
  }

  var PROCUREMENT_BASES = [
    'current_backlog', 'activity_30d', 'window_overlap_30d',
    'approved_timesheets_30d', 'risk_window_30d'
  ];
  function procurementBasisLabel(metric) {
    var basis = metric && metric.basis;
    if (PROCUREMENT_BASES.indexOf(basis) >= 0) return t('exe.basis.' + basis);
    return '';
  }

  function procurementMetricValue(metric) {
    if (!metric || metric.available === false) return '–';
    if (metric.value_cents != null) return compactEuro(metric.value_cents);
    if (metric.value == null) return '–';
    return String(metric.value);
  }

  function procurementMetricTitle(metric) {
    var parts = [];
    if (metric && metric.description) parts.push(metric.description);
    var basis = procurementBasisLabel(metric);
    if (basis) parts.push(basis);
    if (metric && metric.available === false) parts.push(t('exe.metric.unavailable'));
    return parts.join(' ');
  }

  function spendWindowHref(window) {
    if (!window || !window.date_from || !window.date_to) return '/public/spend-analytics.html';
    return '/public/spend-analytics.html?date_from=' + encodeURIComponent(window.date_from) + '&date_to=' + encodeURIComponent(window.date_to);
  }
  function featureKeyForHref(href) {
    if (!href) return '';
    if (href.indexOf('/public/spend-analytics') !== -1) return 'spend_analytics';
    if (href.indexOf('/public/rate-cards') !== -1) return 'rate_card_management';
    if (href.indexOf('/public/vendor_pool') !== -1) return 'supplier_management';
    if (href.indexOf('/public/supplier_scorecard') !== -1) return 'supplier_ratings';
    if (href.indexOf('/public/data-governance') !== -1 || href.indexOf('/public/compliance_overview') !== -1) return 'data_governance';
    return '';
  }
  function featureAttrForHref(href) {
    var key = featureKeyForHref(href);
    return key ? ' data-feature-key="' + key + '"' : '';
  }

  function renderDashboardUnavailable() {
    renderScopeBar(null, null);
    document.getElementById('kpiGrid').innerHTML =
      '<div class="kpi-tile"><span class="kpi-val">–</span><span class="kpi-label">' + esc(t('exe.unavail.kpiLabel')) + '</span></div>';
    document.getElementById('procurementPulseGrid').innerHTML = sectionMessage(t('exe.unavail.pulse'));
    document.getElementById('criticalReqSection').innerHTML = sectionMessage(t('exe.unavail.critical'));
    document.getElementById('reqChart').innerHTML = sectionMessage(t('exe.unavail.req'));
    document.getElementById('slaSection').innerHTML = sectionMessage(t('exe.unavail.sla'));
    document.getElementById('compSection').innerHTML = sectionMessage(t('exe.unavail.compliance'));
    document.getElementById('platformGrid').innerHTML = sectionMessage(t('exe.unavail.platform'));
    document.getElementById('spendGrid').innerHTML = sectionMessage(t('exe.unavail.spend'));
    document.getElementById('financeGrid').innerHTML = sectionMessage(t('exe.unavail.finance'));
    document.getElementById('financeDetail').innerHTML = '';
    document.getElementById('retentionGrid').innerHTML = sectionMessage(t('exe.unavail.retention'));
    document.getElementById('retentionDetail').innerHTML = '';
    document.getElementById('pilotConversionGrid').innerHTML = sectionMessage(t('exe.unavail.pilot'));
    document.getElementById('pilotConversionDetail').innerHTML = '';
    setFinanceExportStatus(t('exe.unavail.exportHint'), 'warn');
  }
  function renderDashboardLocked() {
    renderScopeBar(null, null);
    document.getElementById('kpiGrid').innerHTML =
      '<div class="kpi-tile"><span class="kpi-val">–</span><span class="kpi-label">' + esc(t('exe.locked.kpiLabel')) + '</span></div>';
    document.getElementById('procurementPulseGrid').innerHTML = sectionMessage(describeExecutiveAccess(executiveAccess));
    document.getElementById('criticalReqSection').innerHTML = sectionMessage(t('exe.locked.critical'));
    document.getElementById('reqChart').innerHTML = sectionMessage(t('exe.locked.req'));
    document.getElementById('slaSection').innerHTML = sectionMessage(t('exe.locked.sla'));
    document.getElementById('compSection').innerHTML = sectionMessage(t('exe.locked.compliance'));
    document.getElementById('platformGrid').innerHTML = sectionMessage(t('exe.locked.platform'));
    document.getElementById('spendGrid').innerHTML = sectionMessage(t('exe.locked.spend'));
    document.getElementById('financeGrid').innerHTML = sectionMessage(t('exe.locked.finance'));
    document.getElementById('financeDetail').innerHTML = '';
    document.getElementById('retentionGrid').innerHTML = sectionMessage(t('exe.locked.retention'));
    document.getElementById('retentionDetail').innerHTML = '';
    document.getElementById('pilotConversionGrid').innerHTML = sectionMessage(t('exe.locked.pilot'));
    document.getElementById('pilotConversionDetail').innerHTML = '';
    document.getElementById('ceGrid').innerHTML = sectionMessage(t('exe.locked.ce'));
    document.getElementById('activityTimeline').innerHTML = sectionMessage(t('exe.locked.activity'));
    document.getElementById('dsgvoGrid').innerHTML = sectionMessage(t('exe.locked.dsgvo'));
    document.getElementById('healthGrid').innerHTML = sectionMessage(t('exe.locked.health'));
    setFinanceExportStatus(t('exe.export.hidden'), 'muted');
  }

  async function init() {
    setFinanceExportStatus(t('exe.export.ready'), 'muted');
    currentMe = await api('/me');
    executiveAccess = resolveSurfaceAccess(currentMe, 'executive_dashboard');
    rateCardAccess = resolveSurfaceAccess(currentMe, 'rate_cards');
    applyExecutiveAccess();
    bindOrgFilterPersistence();
    if (!executiveAccess.canRead) {
      renderExecutiveState('info', t('exe.access.hiddenTitle'), describeExecutiveAccess(executiveAccess));
      renderDashboardLocked();
      return;
    }
    renderExecutiveState();
    applyOrgFilterDefaults();
    loadDashboard();
    checkOnboarding();
  }

  async function checkOnboarding() {
    try {
      var me = currentMe || await api('/me');
      if (!me || me.is_demo || me.onboarding_completed) return;
      var status = await api('/me/onboarding-status');
      if (!status || status.onboarding_completed) return;
      var banner = document.getElementById('onboardingBanner');
      banner.style.display = '';
      var pctEl = document.getElementById('onboardingBannerPct');
      // Laufzeitwert -> bewusst OHNE data-i18n (setI18nText mit params entfernt ihn).
      if (pctEl) setI18nText(pctEl, 'exe.onbBanner.pct', { pct: status.progress_pct });
      var textEl = document.getElementById('onboardingBannerText');
      if (textEl && status.suggested_next === 'profile_basics') {
        setI18nText(textEl, 'exe.onbBanner.profile');
      } else if (textEl && status.suggested_next === 'first_action') {
        setI18nText(textEl, 'exe.onbBanner.firstAction');
      } else {
        // Ohne bekannten naechsten Schritt bleibt sonst die deutsche
        // Markup-Fassung stehen — auch dieser Fall bekommt seine Uebersetzung.
        setI18nText(textEl, 'exe.onbBanner.default');
      }
    } catch(e) { /* non-critical */ }
  }

  window.dismissOnboardingBanner = function() {
    document.getElementById('onboardingBanner').style.display = 'none';
    TC.api.post('/me/onboarding-complete').catch(function(){});
  };

  async function loadDashboard() {
    if (!executiveAccess.canRead) return;
    var orgId = document.getElementById('orgFilter').value;
    var qs = orgId ? '?org_id=' + encodeURIComponent(orgId) : '';
    var data = await api('/reporting/dashboard' + qs);
    if (!data) {
      renderDashboardUnavailable();
      return;
    }

    renderScopeBar(data.scope, data.generated_at);
    renderAlertBanner(data.alerts || []);
    renderKpis(data.requisitions);
    renderReqChart(data.requisitions);
    renderSla(data.sla);
    renderCompliance(data.compliance);
    renderPlatform(data.platform);
    renderSpend(data.spend, data.window);
    renderFinance(data.finance);
    renderRetention(data.retention || (data.finance && data.finance.retention_truth));
    renderPilotConversion(data.pilot_conversion || (data.finance && data.finance.pilot_conversion_truth));
    renderProcurementPulse(data.procurement_pulse);
    renderCriticalStaffingPressure(data.critical_staffing_pressure);
    applyExecutiveDomLocks(document);
  }
  window.loadDashboard = loadDashboard;

  /**
   * renderAlertBanner — zeigt SLA- und Staffing-Alerts prominent als Banner.
   * Alerts kommen authorativ vom Backend (alerts[] im Dashboard-Response).
   * @param {Array<{code:string,severity:string,message:string,detail_url?:string}>} alerts
   */
  function renderAlertBanner(alerts) {
    var el = document.getElementById('slaAlertBanner');
    if (!el) return;

    if (!alerts || alerts.length === 0) {
      el.style.display = 'none';
      el.innerHTML = '';
      return;
    }

    var SEVERITY_STYLE = {
      critical: 'background:var(--ds-danger,#dc2626);color:#fff;border-left:5px solid #7f1d1d',
      warning:  'background:rgba(245,158,11,.15);color:var(--ds-text,#111);border-left:5px solid var(--ds-warning,#f59e0b)'
    };

    var html = alerts.map(function(a) {
      var style = SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.warning;
      var linkHtml = a.detail_url
        ? ' <a href="' + esc(a.detail_url) + '" style="color:inherit;font-weight:700;white-space:nowrap">Details &rarr;</a>'
        : '';
      return (
        '<div class="ds-alert" role="alert" data-alert-code="' + esc(a.code) + '" ' +
        'style="padding:12px 16px;border-radius:6px;margin-bottom:8px;font-size:13px;display:flex;gap:8px;align-items:flex-start;' + style + '">' +
        '<span style="flex-shrink:0;font-weight:700">' + (a.severity === 'critical' ? '&#9888;' : '&#9888;') + '</span>' +
        '<span>' + esc(a.message) + linkHtml + '</span>' +
        '</div>'
      );
    }).join('');

    el.innerHTML = html;
    el.style.display = 'block';
  }

  function renderProcurementPulse(pulse) {
    var grid = document.getElementById('procurementPulseGrid');
    if (!grid) return;
    var tiles = pulse && pulse.tiles;
    if (!tiles || !tiles.length) {
      grid.innerHTML = sectionMessage((pulse && pulse.message) || t('exe.pulse.unavailable'));
      return;
    }
    grid.innerHTML = tiles.map(function(metric) {
      var tone = metric && metric.tone ? metric.tone : 'neutral';
      var color = 'var(--text)';
      if (tone === 'risk') color = 'var(--bad)';
      else if (tone === 'warn') color = 'var(--warn)';
      else if (metric && metric.key === 'active_vendors_30d') color = 'var(--good)';
      else if (metric && metric.key === 'active_rate_cards') color = '#7c5cff';
      else if (metric && metric.key === 'open_requisitions') color = 'var(--brand)';
      var value = procurementMetricValue(metric);
      var tip = procurementMetricTitle(metric);
      var href = metric && metric.href;
      if (!rateCardAccess.canRead && href && href.indexOf('/public/rate-cards') !== -1) {
        href = null;
        tip = (tip ? tip + ' ' : '') + rateCardAccess.reason;
      }
      var tagOpen = href ? '<a href="' + href + '"' + featureAttrForHref(href) : '<div';
      var tagClose = href ? '</a>' : '</div>';
      return tagOpen + ' class="kpi-tile procurement-pulse procurement-pulse--' + tone + '" title="' + esc(tip) + '" style="text-decoration:none;color:inherit">' +
        '<span class="kpi-val" style="color:' + color + '">' + esc(String(value)) + '</span>' +
        '<span class="kpi-label">' + esc(metric.label || t('exe.metric.fallback')) + '</span>' +
        '<span class="procurement-pulse__hint">i</span>' +
      tagClose;
    }).join('');
  }

  function renderKpis(r) {
    if (!r) {
      var locLbl = (function() { try { return sessionStorage.getItem('tc.activeLocationName') || null; } catch (_e) { return null; } })();
      document.getElementById('kpiGrid').innerHTML =
        '<div class="kpi-tile"><span class="kpi-val">–</span><span class="kpi-label">' + esc(locLbl ? t('exe.kpi.noneLoc', { loc: locLbl }) : t('exe.kpi.none')) + '</span></div>';
      return;
    }
    var tiles = [
      { label: t('exe.kpi.total'), val: r.total || 0, color: 'var(--text)', href: '/public/requisitions.html', title: t('exe.kpi.totalTip') },
      { label: t('exe.kpi.open'), val: r.open || 0, color: 'var(--brand)', href: '/public/requisitions.html?status=OPEN', title: t('exe.kpi.openTip') },
      { label: t('exe.kpi.inReview'), val: r.in_review || 0, color: 'var(--warn)', href: '/public/requisitions.html?status=IN_REVIEW', title: t('exe.kpi.inReviewTip') },
      { label: t('exe.kpi.shortlisted'), val: r.shortlisted || 0, color: '#7c5cff', href: '/public/requisitions.html?status=SHORTLISTED', title: t('exe.kpi.shortlistedTip') },
      { label: t('exe.kpi.filled'), val: r.filled || 0, color: 'var(--good)', href: '/public/requisitions.html?status=FILLED', title: t('exe.kpi.filledTip') },
      { label: t('exe.kpi.cancelled'), val: r.cancelled || 0, color: 'var(--bad)', href: '/public/requisitions.html?status=CANCELLED', title: t('exe.kpi.cancelledTip') },
      { label: t('exe.kpi.urgentOpen'), val: r.urgent_open || 0, color: 'var(--bad)', href: '/public/requisitions.html?status_group=urgent_open&urgency=urgent', title: t('exe.kpi.urgentOpenTip') },
      { label: t('exe.kpi.avgTtf'), val: (r.avg_time_to_fill_hours || '–') + 'h', color: 'var(--muted)', href: null, title: t('exe.kpi.avgTtfTip') }
    ];
    document.getElementById('kpiGrid').innerHTML = tiles.map(function(t) {
      var inner = '<span class="kpi-val" style="color:' + t.color + '">' + esc(String(t.val)) + '</span><span class="kpi-label">' + esc(t.label) + '</span>';
      return t.href
        ? '<a class="kpi-tile" href="' + t.href + '"' + featureAttrForHref(t.href) + ' style="text-decoration:none;color:inherit;display:block;cursor:pointer" title="' + esc(t.title || '') + '">' + inner + '</a>'
        : '<div class="kpi-tile" title="' + esc(t.title || '') + '">' + inner + '</div>';
    }).join('');
  }

  function renderReqChart(r) {
    if (!r) {
      var locLblReq = (function() { try { return sessionStorage.getItem('tc.activeLocationName') || null; } catch (_e) { return null; } })();
      document.getElementById('reqChart').innerHTML = sectionMessage(locLblReq ? t('exe.reqChart.noneLoc', { loc: locLblReq }) : t('exe.reqChart.none'));
      return;
    }
    var statuses = [
      { key: 'draft', label: t('exe.req.draft'), color: 'var(--muted)' },
      { key: 'pending_approval', label: t('exe.req.pendingApproval'), color: 'var(--warn)' },
      { key: 'approved', label: t('exe.req.approved'), color: '#4fa7ff' },
      { key: 'open', label: t('exe.req.open'), color: 'var(--brand)' },
      { key: 'in_review', label: t('exe.req.inReview'), color: '#7c5cff' },
      { key: 'shortlisted', label: t('exe.req.shortlisted'), color: '#9b6dff' },
      { key: 'filled', label: t('exe.req.filled'), color: 'var(--good)' },
      { key: 'closed', label: t('exe.req.closed'), color: 'rgba(255,255,255,.2)' },
      { key: 'cancelled', label: t('exe.req.cancelled'), color: 'var(--bad)' }
    ];
    var max = Math.max(1, ...statuses.map(function(s) { return r[s.key] || 0; }));
    document.getElementById('reqChart').innerHTML = statuses.map(function(s) {
      var v = r[s.key] || 0;
      var h = Math.max(2, (v / max) * 100);
      return '<div class="bar-col"><div class="bar" style="height:' + h + '%;background:' + s.color + '" title="' + esc(s.label) + ': ' + v + '"></div><div class="bar-label">' + esc(s.label) + '<br>' + v + '</div></div>';
    }).join('');
  }

  function renderSla(s) {
    var el = document.getElementById('slaSection');
    if (!s) {
      el.innerHTML = sectionMessage(t('exe.sla.none'));
      return;
    }
    var pctNum = s.sla_compliance_pct != null ? Number(s.sla_compliance_pct) : null;
    var pct = pctNum != null ? pctNum + '%' : '–';

    // Farbkodierung der Compliance-Tile: gruen >= 90%, gelb 80-89%, rot < 80%
    var pctColor = 'var(--good)';
    if (pctNum != null) {
      if (pctNum < 80) pctColor = 'var(--bad)';
      else if (pctNum < 90) pctColor = 'var(--warn)';
    }

    // Zusatz-Hinweis unter dem Compliance-Wert wenn unter Schwellwert
    var pctHint = (pctNum != null && pctNum < 80)
      ? '<span style="display:block;font-size:11px;color:var(--bad);margin-top:4px;font-weight:600">' + esc(t('exe.sla.belowThreshold')) + '</span>'
      : '';

    el.innerHTML =
      '<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr)">' +
      '<div class="kpi-tile"><span class="kpi-val" style="color:var(--good)">' + esc(String(s.sla_met || 0)) + '</span><span class="kpi-label">' + esc(t('exe.sla.met')) + '</span></div>' +
      '<div class="kpi-tile"><span class="kpi-val" style="color:var(--bad)">' + esc(String(s.sla_breached || 0)) + '</span><span class="kpi-label">' + esc(t('exe.sla.breached')) + '</span></div>' +
      '<div class="kpi-tile"><span class="kpi-val" style="color:var(--warn)">' + esc(String(s.sla_running || 0)) + '</span><span class="kpi-label">' + esc(t('exe.sla.running')) + '</span></div>' +
      '<div class="kpi-tile"><span class="kpi-val" style="color:' + pctColor + '">' + esc(pct) + '</span>' + pctHint + '<span class="kpi-label">' + esc(t('exe.sla.compliance')) + '</span></div>' +
      '</div>';
  }

  function renderCompliance(c) {
    var el = document.getElementById('compSection');
    if (!c) {
      el.innerHTML = sectionMessage(t('exe.comp.none'));
      return;
    }
    var total = Math.max(1, c.total_documents || 1);
    var pcts = {
      verified: ((c.verified || 0) / total * 100).toFixed(0),
      pending: ((c.pending || 0) / total * 100).toFixed(0),
      rejected: ((c.rejected || 0) / total * 100).toFixed(0),
      expired: ((c.expired || 0) / total * 100).toFixed(0)
    };
    el.innerHTML =
      '<div class="compliance-bar">' +
      '<span class="cb-green" style="width:' + pcts.verified + '%"></span>' +
      '<span class="cb-yellow" style="width:' + pcts.pending + '%"></span>' +
      '<span class="cb-red" style="width:' + pcts.expired + '%"></span>' +
      '<span class="cb-grey" style="width:' + pcts.rejected + '%"></span>' +
      '</div>' +
      '<div class="legend">' +
      '<span class="l-green">' + esc(t('exe.comp.verified')) + ': ' + (c.verified || 0) + '</span>' +
      '<span class="l-yellow">' + esc(t('exe.comp.pending')) + ': ' + (c.pending || 0) + '</span>' +
      '<span class="l-red">' + esc(t('exe.comp.expired')) + ': ' + (c.expired || 0) + '</span>' +
      '<span class="l-grey">' + esc(t('exe.comp.rejected')) + ': ' + (c.rejected || 0) + '</span>' +
      '</div>' +
      // Das Warnzeichen bleibt bewusst im Code (kein Woerterbuch-Wert), damit
      // die Uebersetzung reiner Text bleibt.
      (c.expiring_soon > 0 ? '<p style="color:var(--warn);margin:8px 0 0;font-size:13px">⚠ ' + esc(t('exe.comp.expiring', { count: c.expiring_soon })) + '</p>' : '');
  }

  function renderPlatform(p) {
    if (!p) {
      document.getElementById('platformGrid').innerHTML = sectionMessage(t('exe.platform.none'));
      return;
    }
    var tiles = [
      { label: t('exe.platform.users'), val: p.total_users || 0 },
      { label: t('exe.platform.orgs'), val: p.total_orgs || 0 },
      { label: t('exe.platform.capacityPosts'), val: p.active_capacity_posts || 0 },
      { label: t('exe.platform.openDemands'), val: p.open_demands || 0 },
      { label: t('exe.platform.vendorEntries'), val: p.active_vendor_entries || 0 }
    ];
    document.getElementById('platformGrid').innerHTML = tiles.map(function(t) {
      return '<div class="kpi-tile"><span class="kpi-val">' + esc(String(t.val)) + '</span><span class="kpi-label">' + esc(t.label) + '</span></div>';
    }).join('');
  }

  function renderSpend(s, window) {
    var grid = document.getElementById('spendGrid');
    if (!grid) return;
    if (!s || s.available === false) {
      grid.innerHTML = sectionMessage(t('exe.spend.unavailable'));
      return;
    }
    if (!s.has_data) {
      grid.innerHTML = sectionMessage(t('exe.spend.noData'));
      return;
    }
    function eurFmt(c) { return (c/100).toLocaleString(loc(),{minimumFractionDigits:0,maximumFractionDigits:0}); }
    function eurFull(c) { return (c/100).toLocaleString(loc(),{minimumFractionDigits:2,maximumFractionDigits:2}); }
    var spendHref = spendWindowHref(window);
    var overRatePct = s.over_rate_spend_cents && s.total_spend_cents
      ? Math.round(s.over_rate_spend_cents / s.total_spend_cents * 100) : 0;
    grid.innerHTML = [
      {
        label:t('exe.spend.total'),
        val:eurFmt(s.total_spend_cents)+' €',
        color:'var(--brand)',
        href:spendHref,
        title:t('exe.spend.totalTip')
      },
      {
        label:t('exe.spend.projected'),
        val:eurFmt(s.projected_spend_cents||0)+' €',
        color:'#7c5cff',
        href:spendHref,
        title:t('exe.spend.projectedTip')
      },
      {
        label:t('exe.spend.activeAssignments'),
        val:s.active_assignments||0,
        color:'var(--text)',
        href:spendHref,
        title:t('exe.spend.activeAssignmentsTip')
      },
      {
        label:t('exe.spend.assignments30d'),
        val:s.assignment_count||s.assignments||0,
        color:'var(--text)',
        href:spendHref,
        title:t('exe.spend.assignments30dTip')
      },
      {
        label:t('exe.spend.vendors30d'),
        val:s.vendor_count||0,
        color:'#7c5cff',
        href:spendHref,
        title:t('exe.spend.vendors30dTip')
      },
      {
        label:t('exe.spend.approvedHours'),
        val:(Number(s.total_hours||0)).toLocaleString(loc(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' h',
        color:'var(--text)',
        href:spendHref,
        title:t('exe.spend.approvedHoursTip')
      },
      {
        label:t('exe.spend.avgRate'),
        val:eurFull(s.avg_rate_cents)+' €',
        color:'var(--text)',
        href:spendHref,
        title:t('exe.spend.avgRateTip')
      },
      {
        label:t('exe.spend.overtime'),
        val:eurFmt(s.overtime_spend_cents||0)+' €',
        color:'var(--warn)',
        href:spendHref,
        title:t('exe.spend.overtimeTip')
      },
      {
        label:t('exe.spend.overRate', { pct: overRatePct }),
        val:eurFmt(s.over_rate_spend_cents||0)+' €',
        color: overRatePct > 10 ? 'var(--bad)' : 'var(--warn)',
        href:rateCardAccess.canRead ? '/public/rate-cards.html' : null,
        title:t('exe.spend.overRateTip', { count: s.over_rate_count||0 }) + (rateCardAccess.canRead ? '' : ' ' + rateCardAccess.reason)
      }
    ].map(function(t){
      var inner = '<span class="kpi-val" style="color:'+t.color+';font-size:20px">'+esc(String(t.val))+'</span><span class="kpi-label">'+esc(t.label)+'</span>';
      return t.href
        ? '<a class="kpi-tile" href="'+t.href+'"' + featureAttrForHref(t.href) + ' style="text-decoration:none;color:inherit;cursor:pointer" title="'+esc(t.title||'')+'">'+inner+'</a>'
        : '<div class="kpi-tile" title="'+esc(t.title||'')+'">'+inner+'</div>';
    }).join('');
  }

  function renderFinance(finance) {
    var grid = document.getElementById('financeGrid');
    var detail = document.getElementById('financeDetail');
    if (!grid) return;
    if (detail) detail.innerHTML = '';
    if (!finance || finance.available === false) {
      grid.innerHTML = sectionMessage(t('exe.fin.unavailable'));
      return;
    }

    var subscription = finance.subscription_truth || {};
    var invoice = finance.invoice_truth || {};
    var payment = finance.payment_truth || {};
    var billable = finance.billable_truth || {};
    var reconciliation = finance.reconciliation_30d || {};
    var pendingQuotes = Number(subscription.pending_quote_subscribers || 0);
    var spendInvoiceGap = Number(reconciliation.spend_invoice_gap_cents || 0);

    var tiles = [
      {
        label: t('exe.fin.mrr'),
        val: compactEuroValue(subscription.contractually_active_mrr || 0),
        color: 'var(--brand)',
        title: t('exe.fin.mrrTip')
      },
      {
        label: t('exe.fin.catalogMrr'),
        val: compactEuroValue(subscription.catalog_mrr_theoretical || 0),
        color: '#7c5cff',
        title: t('exe.fin.catalogMrrTip')
      },
      {
        label: t('exe.fin.receivables'),
        val: compactEuro(invoice.open_receivables_cents || 0),
        color: Number(invoice.overdue_receivables_cents || 0) > 0 ? 'var(--bad)' : 'var(--warn)',
        title: t('exe.fin.receivablesTip')
      },
      {
        label: t('exe.fin.paidRevenue'),
        val: compactEuro(invoice.paid_revenue_cents || 0),
        color: 'var(--good)',
        title: t('exe.fin.paidRevenueTip')
      },
      {
        label: t('exe.fin.billable'),
        val: billable.available === false ? '–' : compactEuro(billable.approved_uninvoiced_amount_cents || 0),
        color: 'var(--warn)',
        title: t('exe.fin.billableTip')
      },
      {
        label: t('exe.fin.pendingQuotes'),
        val: pendingQuotes,
        color: pendingQuotes > 0 ? 'var(--warn)' : 'var(--good)',
        title: t('exe.fin.pendingQuotesTip')
      },
      {
        label: t('exe.fin.sessions'),
        val: payment.available === false ? '–' : (payment.completed_count || 0),
        color: 'var(--text)',
        title: t('exe.fin.sessionsTip')
      },
      {
        label: t('exe.fin.gap'),
        val: reconciliation.available === false ? '–' : compactEuro(spendInvoiceGap),
        color: reconciliation.available === false ? 'var(--muted)' : (spendInvoiceGap > 0 ? 'var(--warn)' : 'var(--good)'),
        title: t('exe.fin.gapTip')
      }
    ];

    grid.innerHTML = tiles.map(function(tile) {
      return '<div class="kpi-tile" title="' + esc(tile.title || '') + '">' +
        '<span class="kpi-val" style="color:' + tile.color + ';font-size:20px">' + esc(String(tile.val)) + '</span>' +
        '<span class="kpi-label">' + esc(tile.label) + '</span>' +
      '</div>';
    }).join('');

    if (!detail) return;
    var pricingRows = Array.isArray(finance.pricing_state_breakdown) ? finance.pricing_state_breakdown : [];
    var detailHtml = '';

    if (pricingRows.length) {
      detailHtml +=
        '<div style="overflow:auto;margin-top:12px">' +
          '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
            '<thead><tr>' +
              '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.fin.thSource')) + '</th>' +
              '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.fin.thSubscribers')) + '</th>' +
              '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.fin.thMrr')) + '</th>' +
            '</tr></thead>' +
            '<tbody>' +
              pricingRows.map(function(row) {
                return '<tr>' +
                  '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(row.source || 'unknown') + '</td>' +
                  '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(String(row.subscribers || 0)) + '</td>' +
                  '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactEuroValue(row.mrr || 0)) + '</td>' +
                '</tr>';
              }).join('') +
            '</tbody>' +
          '</table>' +
        '</div>';
    }

    detailHtml +=
      '<div style="margin-top:10px;font-size:13px;color:var(--muted)">' +
        esc(t('exe.fin.lifecycle', {
          draft: invoice.draft_count || 0,
          issued: invoice.issued_count || 0,
          overdue: invoice.overdue_count || 0,
          paid: invoice.paid_count || 0,
          voided: invoice.void_count || 0
        })) +
      '</div>';

    if (reconciliation.available) {
      detailHtml +=
        '<div style="margin-top:6px;font-size:13px;color:var(--muted)">' +
          esc(t('exe.fin.coverage', {
            pct: reconciliation.coverage_ratio_pct == null ? '–' : (String(reconciliation.coverage_ratio_pct) + '%'),
            spend: compactEuro(reconciliation.approved_spend_30d_cents || 0),
            invoiced: compactEuro(reconciliation.operational_invoiced_30d_cents || 0)
          })) +
        '</div>';
    }

    detail.innerHTML = detailHtml;
  }

  function renderSegmentRows(rows) {
    return (rows || []).slice(0, 5).map(function(row) {
      return '<tr>' +
        '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(row.label || row.value || '–') + '</td>' +
        '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.active_paid_orgs || 0)) + '</td>' +
        '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactPercent(
          (row.retained_logos || 0) > 0 || (row.logo_churned_orgs || 0) > 0
            ? ((Number(row.retained_logos || 0) / Math.max(1, Number(row.retained_logos || 0) + Number(row.logo_churned_orgs || 0))) * 100)
            : null
        )) + '</td>' +
        '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactEuroValue(row.current_mrr || 0)) + '</td>' +
      '</tr>';
    }).join('');
  }
  function renderRetention(retention) {
    var grid = document.getElementById('retentionGrid');
    var detail = document.getElementById('retentionDetail');
    if (!grid) return;
    if (detail) detail.innerHTML = '';
    if (!retention || retention.available === false) {
      grid.innerHTML = sectionMessage(t('exe.ret.unavailable'));
      return;
    }
    var headline = retention.headline || {};
    var usage = retention.usage_intensity || {};
    var quality = retention.quality_flags || {};
    var cards = [
      { label: t('exe.ret.activePaidOrgs'), val: compactCount(headline.active_paid_orgs || 0), color: 'var(--brand)', title: t('exe.ret.activePaidOrgsTip') },
      { label: t('exe.ret.activeCustomers'), val: compactCount(headline.active_customer_orgs || 0), color: '#7c5cff', title: t('exe.ret.activeCustomersTip') },
      { label: t('exe.ret.retainedLogos'), val: compactCount(headline.retained_logos || 0), color: 'var(--good)', title: t('exe.ret.retainedLogosTip') },
      { label: t('exe.ret.logoChurn'), val: compactPercent(headline.logo_churn_rate_pct), color: Number(headline.logo_churn_rate_pct || 0) >= 10 ? 'var(--bad)' : 'var(--warn)', title: t('exe.ret.logoChurnTip') },
      { label: t('exe.ret.nrr'), val: compactPercent(headline.net_revenue_retention_pct), color: Number(headline.net_revenue_retention_pct || 0) >= 100 ? 'var(--good)' : 'var(--warn)', title: t('exe.ret.nrrTip') },
      { label: t('exe.ret.grossChurn'), val: compactEuroValue(headline.gross_revenue_churn_mrr || 0), color: 'var(--bad)', title: t('exe.ret.grossChurnTip') },
      { label: t('exe.ret.expansion'), val: compactEuroValue(headline.expansion_mrr || 0), color: 'var(--good)', title: t('exe.ret.expansionTip') },
      { label: t('exe.ret.inactivePaying'), val: compactCount(headline.inactive_but_paying_orgs || 0), color: Number(headline.inactive_but_paying_orgs || 0) > 0 ? 'var(--warn)' : 'var(--good)', title: t('exe.ret.inactivePayingTip') },
      { label: t('exe.ret.pqa'), val: compactCount(headline.pqa_orgs || 0), color: '#4fa7ff', title: t('exe.ret.pqaTip') }
    ];
    grid.innerHTML = cards.map(function(tile) {
      return '<div class="kpi-tile" title="' + esc(tile.title || '') + '">' +
        '<span class="kpi-val" style="color:' + tile.color + ';font-size:20px">' + esc(String(tile.val)) + '</span>' +
        '<span class="kpi-label">' + esc(tile.label) + '</span>' +
      '</div>';
    }).join('');
    if (!detail) return;
    var stageRows = (((retention || {}).segment_drilldown || {}).by_stage) || [];
    var planRows = (((retention || {}).segment_drilldown || {}).by_plan) || [];
    var atRiskRows = (((retention || {}).org_drilldown || {}).at_risk || []).slice(0, 10);
    var usageAvailable = quality.usage_source_available !== false;
    var detailHtml = '<div class="kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));margin-top:12px">' +
      '<div class="kpi-tile"><span class="kpi-val" style="font-size:20px">' + esc(compactCount(usage.high || 0)) + '</span><span class="kpi-label">' + esc(t('exe.ret.usageHigh')) + '</span></div>' +
      '<div class="kpi-tile"><span class="kpi-val" style="font-size:20px">' + esc(compactCount(usage.medium || 0)) + '</span><span class="kpi-label">' + esc(t('exe.ret.usageMedium')) + '</span></div>' +
      '<div class="kpi-tile"><span class="kpi-val" style="font-size:20px">' + esc(compactCount(usage.low || 0)) + '</span><span class="kpi-label">' + esc(t('exe.ret.usageLow')) + '</span></div>' +
      '<div class="kpi-tile"><span class="kpi-val" style="font-size:20px">' + esc(compactCount(usage.dormant || 0)) + '</span><span class="kpi-label">' + esc(t('exe.ret.usageDormant')) + '</span></div>' +
      '<div class="kpi-tile"><span class="kpi-val" style="font-size:20px">' + esc(compactCount(usage.avg_value_events_per_active_org || 0)) + '</span><span class="kpi-label">' + esc(t('exe.ret.avgValueEvents')) + '</span></div>' +
      '<div class="kpi-tile"><span class="kpi-val" style="font-size:20px">' + esc(compactCount(usage.median_value_events_per_active_org || 0)) + '</span><span class="kpi-label">' + esc(t('exe.ret.medianValueEvents')) + '</span></div>' +
    '</div>';
    detailHtml += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;margin-top:12px">' +
      '<div style="overflow:auto">' +
        '<div style="font-size:13px;font-weight:700;margin-bottom:6px">' + esc(t('exe.ret.segStage')) + '</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
          '<thead><tr>' +
            '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.ret.thStage')) + '</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.ret.thPaidOrgs')) + '</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.ret.thRetention')) + '</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.ret.thMrr')) + '</th>' +
          '</tr></thead><tbody>' + renderSegmentRows(stageRows) + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div style="overflow:auto">' +
        '<div style="font-size:13px;font-weight:700;margin-bottom:6px">' + esc(t('exe.ret.segPlan')) + '</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
          '<thead><tr>' +
            '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.ret.thPlan')) + '</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.ret.thPaidOrgs')) + '</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.ret.thRetention')) + '</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.ret.thMrr')) + '</th>' +
          '</tr></thead><tbody>' + renderSegmentRows(planRows) + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
    if (atRiskRows.length) {
      detailHtml += '<div style="margin-top:12px;overflow:auto">' +
        '<div style="font-size:13px;font-weight:700;margin-bottom:6px">' + esc(t('exe.ret.atRisk')) + '</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
          '<thead><tr>' +
            '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.ret.thOrg')) + '</th>' +
            '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.ret.thStage')) + '</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.ret.thRisk')) + '</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.ret.thValueEvents')) + '</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.ret.thMrr')) + '</th>' +
          '</tr></thead><tbody>' +
            atRiskRows.map(function(row) {
              return '<tr>' +
                '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(row.org_name || row.org_id || '–') + '</td>' +
                '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(row.stage || '–') + '</td>' +
                '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line);color:var(--warn)">' + esc(compactCount(row.risk_score || 0)) + '</td>' +
                '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.current_value_events || 0)) + '</td>' +
                '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactEuroValue(row.current_mrr || 0)) + '</td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>';
    }
    if (!usageAvailable) {
      detailHtml += '<div style="margin-top:10px;font-size:12px;color:var(--warn)">' + esc(t('exe.ret.usageMissing')) + '</div>';
    }
    detail.innerHTML = detailHtml;
  }
  function renderPilotConversion(truth) {
    var grid = document.getElementById('pilotConversionGrid');
    var detail = document.getElementById('pilotConversionDetail');
    if (!grid) return;
    if (detail) detail.innerHTML = '';
    if (!truth || truth.available === false) {
      grid.innerHTML = sectionMessage(t('exe.pc.unavailable'));
      return;
    }
    var headline = truth.headline || {};
    var transitions = truth.transitions || {};
    var pilotToActivated = transitions.pilot_started_to_activated || {};
    var activatedToPaid = transitions.activated_to_paid_live || {};
    var pilotToLost = transitions.pilot_to_lost || {};
    var cards = [
      { label: t('exe.pc.activePilots'), val: compactCount(headline.active_pilots || 0), color: 'var(--brand)', title: t('exe.pc.activePilotsTip') },
      { label: t('exe.pc.activatedPilots'), val: compactCount(headline.activated_pilots || 0), color: '#4fa7ff', title: t('exe.pc.activatedPilotsTip') },
      { label: t('exe.pc.convertedPilots'), val: compactCount(headline.converted_pilots || 0), color: 'var(--good)', title: t('exe.pc.convertedPilotsTip') },
      { label: t('exe.pc.atRiskPilots'), val: compactCount(headline.at_risk_pilots || 0), color: Number(headline.at_risk_pilots || 0) > 0 ? 'var(--warn)' : 'var(--good)', title: t('exe.pc.atRiskPilotsTip') },
      { label: t('exe.pc.daysToActivation'), val: compactDays(headline.avg_days_to_activation), color: 'var(--text)', title: t('exe.pc.daysToActivationTip') },
      { label: t('exe.pc.daysToConversion'), val: compactDays(headline.avg_days_to_conversion), color: 'var(--text)', title: t('exe.pc.daysToConversionTip') },
      { label: t('exe.pc.pilotToActivated'), val: compactPercent(pilotToActivated.rate_pct), color: Number(pilotToActivated.rate_pct || 0) >= 60 ? 'var(--good)' : 'var(--warn)', title: t('exe.pc.pilotToActivatedTip') },
      { label: t('exe.pc.activatedToPaid'), val: compactPercent(activatedToPaid.rate_pct), color: Number(activatedToPaid.rate_pct || 0) >= 35 ? 'var(--good)' : 'var(--warn)', title: t('exe.pc.activatedToPaidTip') },
      { label: t('exe.pc.pilotToLost'), val: compactPercent(pilotToLost.rate_pct), color: Number(pilotToLost.rate_pct || 0) >= 20 ? 'var(--bad)' : 'var(--text)', title: t('exe.pc.pilotToLostTip') }
    ];
    grid.innerHTML = cards.map(function(tile) {
      return '<div class="kpi-tile" title="' + esc(tile.title || '') + '">' +
        '<span class="kpi-val" style="color:' + tile.color + ';font-size:20px">' + esc(String(tile.val)) + '</span>' +
        '<span class="kpi-label">' + esc(tile.label) + '</span>' +
      '</div>';
    }).join('');
    if (!detail) return;

    var stageRows = Array.isArray(truth.current_stage_distribution) ? truth.current_stage_distribution : [];
    var atRiskRows = ((((truth || {}).org_drilldown || {}).at_risk) || []).slice(0, 8);
    var bottlenecks = ((((truth || {}).gtm_learning || {}).onboarding_bottlenecks) || []).slice(0, 5);
    var icpRows = ((((truth || {}).gtm_learning || {}).by_icp) || []).slice(0, 5);
    var tariffRows = ((((truth || {}).gtm_learning || {}).by_tariff_path) || []).slice(0, 5);
    var moduleRows = (((truth || {}).gtm_learning || {}).product_area_usage) || [];
    var quality = truth.quality_flags || {};
    var detailHtml = '';

    detailHtml += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;margin-top:12px">';
    detailHtml += '<div style="overflow:auto">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:6px">' + esc(t('exe.pc.funnelNow')) + '</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
        '<thead><tr>' +
          '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thStage')) + '</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thOrgs')) + '</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thAvgDays')) + '</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thAtRisk')) + '</th>' +
        '</tr></thead>' +
        '<tbody>' +
          (stageRows.length ? stageRows.map(function(row) {
            return '<tr>' +
              '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(pilotStageLabel(row.stage)) + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.orgs || 0)) + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactDays(row.avg_days_in_stage)) + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.at_risk_orgs || 0)) + '</td>' +
            '</tr>';
          }).join('') : '<tr><td colspan="4" style="padding:8px;color:var(--muted)">' + esc(t('exe.pc.noStages')) + '</td></tr>') +
        '</tbody>' +
      '</table>' +
    '</div>';
    detailHtml += '<div style="overflow:auto">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:6px">' + esc(t('exe.pc.transitions', { window: ((truth.cohort_window || {}).label) || t('exe.pc.window') })) + '</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
        '<thead><tr>' +
          '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thTransition')) + '</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thCohort')) + '</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thConverted')) + '</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thRate')) + '</th>' +
        '</tr></thead><tbody>' +
          [
            { label: t('exe.pc.trLeadReg'), data: transitions.lead_to_registered || {} },
            { label: t('exe.pc.trRegPilot'), data: transitions.registration_to_pilot_started || {} },
            { label: t('exe.pc.trPilotAct'), data: transitions.pilot_started_to_activated || {} },
            { label: t('exe.pc.trActPaid'), data: transitions.activated_to_paid_live || {} },
            { label: t('exe.pc.trPilotLost'), data: transitions.pilot_to_lost || {} }
          ].map(function(row) {
            return '<tr>' +
              '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(row.label) + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.data.cohort_count || 0)) + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.data.converted_count || 0)) + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactPercent(row.data.rate_pct)) + '</td>' +
            '</tr>';
          }).join('') +
        '</tbody>' +
      '</table>' +
    '</div>';
    detailHtml += '</div>';

    detailHtml += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;margin-top:12px">';
    detailHtml += '<div style="overflow:auto">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:6px">' + esc(t('exe.pc.icp')) + '</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
        '<thead><tr>' +
          '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thIcp')) + '</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thTracked')) + '</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thActivated')) + '</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thConverted')) + '</th>' +
        '</tr></thead><tbody>' +
          (icpRows.length ? icpRows.map(function(row) {
            return '<tr>' +
              '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(row.label || row.key || '–') + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.tracked_orgs || 0)) + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactPercent(row.activation_rate_pct)) + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactPercent(row.conversion_rate_pct)) + '</td>' +
            '</tr>';
          }).join('') : '<tr><td colspan="4" style="padding:8px;color:var(--muted)">' + esc(t('exe.pc.noIcp')) + '</td></tr>') +
        '</tbody>' +
      '</table>' +
    '</div>';
    detailHtml += '<div style="overflow:auto">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:6px">' + esc(t('exe.pc.tariff')) + '</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
        '<thead><tr>' +
          '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thPath')) + '</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thTracked')) + '</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thActivated')) + '</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thConverted')) + '</th>' +
        '</tr></thead><tbody>' +
          (tariffRows.length ? tariffRows.map(function(row) {
            return '<tr>' +
              '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(tariffPathLabel(row.label || row.key)) + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.tracked_orgs || 0)) + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactPercent(row.activation_rate_pct)) + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactPercent(row.conversion_rate_pct)) + '</td>' +
            '</tr>';
          }).join('') : '<tr><td colspan="4" style="padding:8px;color:var(--muted)">' + esc(t('exe.pc.noTariff')) + '</td></tr>') +
        '</tbody>' +
      '</table>' +
    '</div>';
    detailHtml += '</div>';

    if (moduleRows.length) {
      detailHtml += '<div style="margin-top:12px;overflow:auto">' +
        '<div style="font-size:13px;font-weight:700;margin-bottom:6px">' + esc(t('exe.pc.modules')) + '</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
          '<thead><tr>' +
            '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thArea')) + '</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thPilotOrgs')) + '</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thActivePilots')) + '</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thSuccessUsage')) + '</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thEvents')) + '</th>' +
          '</tr></thead><tbody>' +
            moduleRows.map(function(row) {
              return '<tr>' +
                '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(moduleLabel(row.module)) + '</td>' +
                '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.pilot_orgs || 0)) + '</td>' +
                '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.active_pilot_orgs || 0)) + '</td>' +
                '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.successful_usage_orgs || 0)) + '</td>' +
                '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.event_count || 0)) + '</td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>';
    }

    if (atRiskRows.length) {
      detailHtml += '<div style="margin-top:12px;overflow:auto">' +
        '<div style="font-size:13px;font-weight:700;margin-bottom:6px">' + esc(t('exe.pc.atRiskPilots')) + '</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
          '<thead><tr>' +
            '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thOrg')) + '</th>' +
            '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thStage')) + '</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thRisk')) + '</th>' +
            '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">' + esc(t('exe.pc.thHints')) + '</th>' +
          '</tr></thead><tbody>' +
            atRiskRows.map(function(row) {
              return '<tr>' +
                '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(row.org_name || row.org_id || '–') + '</td>' +
                '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(pilotStageLabel(row.current_stage)) + '</td>' +
                '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line);color:var(--warn)">' + esc(compactCount(row.risk_score || 0)) + '</td>' +
                '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(((row.risk_reasons || []).slice(0, 2)).join(' · ') || '–') + '</td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>';
    }

    if (bottlenecks.length) {
      detailHtml += '<div style="margin-top:10px;font-size:13px;color:var(--muted)">' +
        esc(t('exe.pc.bottlenecks')) +
        bottlenecks.map(function(row) {
          return esc(row.label + ' (' + compactCount(row.blocked_pilots || 0) + ')');
        }).join(' · ') +
      '</div>';
    }
    if (quality.pre_registration_lead_capture_available === false) {
      detailHtml += '<div style="margin-top:6px;font-size:12px;color:var(--warn)">' + esc(t('exe.pc.leadQuality')) + '</div>';
    }
    if (quality.pricing_clarity_timestamps_partially_inferred) {
      detailHtml += '<div style="margin-top:6px;font-size:12px;color:var(--muted)">' + esc(t('exe.pc.pricingQuality')) + '</div>';
    }
    detail.innerHTML = detailHtml;
  }

  /* ── Quick Search ─────────────────────────────────── */
  async function runQuickSearch() {
    var q = document.getElementById('quickSearch').value.trim();
    if (!q || q.length < 2) return;
    var sec = document.getElementById('quickSearchSection');
    var box = document.getElementById('quickSearchResults');
    sec.style.display = '';
    box.innerHTML = '<p style="color:var(--muted)">' + esc(t('exe.search.running')) + '</p>';
    try {
      var data = await TC.api.get('/search?q=' + encodeURIComponent(q) + '&type=all&limit=10');
      var results = (data.data && data.data.results) || data.results || [];
      var total = (data.data && data.data.total) || data.total || 0;
      if (!results.length) { box.innerHTML = '<p style="color:var(--muted)">' + esc(t('exe.search.noHits')) + '</p>'; return; }
      var html = '<div style="font-size:12px;color:var(--muted);margin-bottom:8px">' + esc(t('exe.search.hits', { total: total })) + '</div>';
      results.forEach(function(item) {
        var title = item.company_name || item.name || item.title || item.role || item.skill_name || t('exe.search.unknownItem');
        var idx = item._index || '';
        html += '<div style="padding:6px 0;border-bottom:1px solid var(--line);font-size:13px">' +
          '<strong>' + esc(title) + '</strong>' +
          (idx ? ' <span style="font-size:10px;color:var(--muted)">[' + esc(idx) + ']</span>' : '') + '</div>';
      });
      box.innerHTML = html;
    } catch (e) {
      box.innerHTML = '<p style="color:var(--bad)">' + esc(t('exe.search.error', { error: e.message })) + '</p>';
    }
  }
  window.runQuickSearch = runQuickSearch;

  /* ── Platform Health ──────────────────────────────── */
  async function loadHealth() {
    var grid = document.getElementById('healthGrid');
    try {
      var health;
      try { health = await TC.api.get('/health'); } catch(e) { health = { ok: false }; }

      var searchData, search;
      try { searchData = await TC.api.get('/search/status'); search = (searchData && searchData.data) || searchData || {}; } catch(e) { search = {}; }

      var tiles = [
        { label: t('exe.health.db'), val: health.ok ? t('exe.health.online') : t('exe.health.offline'), color: health.ok ? 'var(--good)' : 'var(--bad)' },
        { label: t('exe.health.api'), val: health.service || 'api', color: 'var(--good)' },
        { label: t('exe.health.searchEngine'), val: search.available ? (search.engine || 'Active') : t('exe.health.fallback'), color: search.available ? 'var(--good)' : 'var(--warn)' },
        { label: t('exe.health.searchIndexes'), val: (search.availableIndexes || []).length || 0, color: 'var(--brand)' }
      ];
      grid.innerHTML = tiles.map(function(t) {
        return '<div class="kpi-tile"><span class="kpi-val" style="color:' + t.color + ';font-size:20px">' + esc(String(t.val)) + '</span><span class="kpi-label">' + esc(t.label) + '</span></div>';
      }).join('');
    } catch (e) {
      grid.innerHTML = '<p style="color:var(--bad);font-size:13px">' + esc(t('exe.health.error')) + '</p>';
    }
  }

  /* ── Capacity Exchange Stats ──────────────────────── */
  async function loadCeStats() {
    var grid = document.getElementById('ceGrid');
    try {
      var feed, sj;
      try { feed = await TC.api.get('/capacity-exchange/feed?limit=1'); } catch(e) { feed = {}; }
      try { sj = await TC.api.get('/sla/search-jobs'); } catch(e) { sj = {}; }
      var posts = (feed.data && feed.data.pagination) ? feed.data.pagination.total : (feed.total || '–');
      var jobs = Array.isArray(sj)
        ? sj.length
        : (sj.data && sj.data.pagination)
          ? sj.data.pagination.total
          : (sj.total || '–');
      grid.innerHTML = [
        {label:t('exe.ce.posts'),val:posts,color:'var(--brand)'},
        {label:t('exe.ce.searchJobs'),val:jobs,color:'#7c5cff'}
      ].map(function(t){
        return '<div class="kpi-tile"><span class="kpi-val" style="color:'+t.color+'">'+esc(String(t.val))+'</span><span class="kpi-label">'+esc(t.label)+'</span></div>';
      }).join('');
    } catch(e) {
      grid.innerHTML = sectionMessage(t('exe.ce.none'));
    }
  }

  /* ── Activity Feed Timeline ───────────────────────── */
  async function loadActivityFeed() {
    var box = document.getElementById('activityTimeline');
    try {
      var data = await TC.api.get('/activity-feed?limit=8');
      var items = (data.data && data.data.items) || data.items || [];
      if (!items.length) {
        box.innerHTML = sectionMessage(t('exe.act.none'));
        return;
      }
      box.innerHTML = items.map(function(ev) {
        var when = ev.created_at ? new Date(ev.created_at).toLocaleString(loc(),{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
        return '<div class="timeline-item"><div class="timeline-dot"></div><div><div>'+esc(ev.description||ev.event_type||t('exe.act.action'))+'</div><div class="timeline-time">'+when+'</div></div></div>';
      }).join('');
    } catch(e) {
      box.innerHTML = sectionMessage(t('exe.act.error'));
    }
  }

  /* ── DSGVO Compliance ─────────────────────────────── */
  async function loadDsgvo() {
    var grid = document.getElementById('dsgvoGrid');
    try {
      var d = await TC.api.get('/data-governance/requests?limit=1');
      var total = (d.data && d.data.total) || 0;
      var items = (d.data && d.data.items) || [];
      var pending = items.filter(function(i){return i.status==='pending'||i.status==='in_progress';}).length;

      var inv = await api('/data-governance/inventory');
      var catCount = inv && inv.data && inv.data.categories ? Object.keys(inv.data.categories).length : 4;

      grid.innerHTML = [
        {label:t('exe.dsgvo.requests'),val:total,color:'var(--brand)'},
        {label:t('exe.dsgvo.open'),val:pending,color:pending>0?'var(--warn)':'var(--good)'},
        {label:t('exe.dsgvo.categories'),val:catCount,color:'var(--text)'}
      ].map(function(t){
        return '<div class="kpi-tile"><span class="kpi-val" style="color:'+t.color+';font-size:20px">'+esc(String(t.val))+'</span><span class="kpi-label">'+esc(t.label)+'</span></div>';
      }).join('');
    } catch(e) {
      grid.innerHTML = sectionMessage(t('exe.dsgvo.none'));
    }
  }

  /* ── Kritischer Besetzungsdruck ───────────────────── */
  function formatCriticalAge(item) {
    var ageDays = Number(item && item.age_days || 0);
    if (ageDays > 0) return t('exe.crit.ageDays', { days: ageDays });
    var ageMinutes = Number(item && item.age_minutes || 0);
    if ((item && item.kind) === 'emergency' && ageMinutes >= 60) {
      return t('exe.crit.ageHours', { hours: Math.max(1, Math.round(ageMinutes / 60)) });
    }
    if ((item && item.kind) === 'emergency' && ageMinutes >= 1) {
      return t('exe.crit.ageMinutes', { minutes: ageMinutes });
    }
    return t('exe.crit.ageNew');
  }
  function formatCriticalStart(item) {
    if (!item || item.days_to_start == null) return t('exe.crit.noStart');
    if (item.days_to_start < 0) return t('exe.crit.startOverdue');
    if (item.days_to_start === 0) return t('exe.crit.startToday');
    if (item.days_to_start === 1) return t('exe.crit.startOneDay');
    return t('exe.crit.startInDays', { days: item.days_to_start });
  }
  function criticalOpenHeadcount(item) {
    var value = item && item.open_headcount != null
      ? Number(item.open_headcount)
      : Number(item && item.headcount || 0);
    return Math.max(0, value || 0);
  }
  function formatCriticalCoverage(item) {
    if (!item) return t('exe.crit.noCoverage');
    if (item.kind === 'emergency') {
      return t('exe.crit.coverageEmergency', {
        committed: Number(item.committed_count || 0),
        responses: Number(item.response_count || 0)
      });
    }
    return t('exe.crit.coverageStandard', {
      shortlisted: Number(item.shortlisted_count || 0),
      suppliers: Number(item.supplier_count || 0)
    });
  }
  function criticalSummaryMarkup(section) {
    var summary = section && section.summary || {};
    var total = section && section.total != null
      ? Number(section.total)
      : ((section && section.items && section.items.length) || 0);
    var tiles = [
      {
        label: t('exe.crit.sumPrioritised'),
        val: total,
        color: 'var(--brand)',
        title: t('exe.crit.sumPrioritisedTip')
      },
      {
        label: t('exe.crit.sumRisk'),
        val: Number(summary.risk || 0),
        color: 'var(--bad)',
        title: t('exe.crit.sumRiskTip')
      },
      {
        label: t('exe.crit.sumWarn'),
        val: Number(summary.warn || 0),
        color: 'var(--warn)',
        title: t('exe.crit.sumWarnTip')
      },
      {
        label: t('exe.crit.sumEmergency'),
        val: Number(summary.emergency_open || 0),
        color: '#7c5cff',
        title: t('exe.crit.sumEmergencyTip')
      }
    ];
    return '<div class="kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr));margin-bottom:12px">' +
      tiles.map(function(tile) {
        return '<div class="kpi-tile" title="' + esc(tile.title) + '">' +
          '<span class="kpi-val" style="color:' + tile.color + ';font-size:20px">' + esc(String(tile.val)) + '</span>' +
          '<span class="kpi-label">' + esc(tile.label) + '</span>' +
        '</div>';
      }).join('') +
    '</div>';
  }
  function renderCriticalStaffingPressure(section) {
    var sec = document.getElementById('criticalReqSection');
    if (!sec) return;
    if (!section || section.available === false) {
      sec.innerHTML = sectionMessage(t('exe.crit.unavailable'));
      return;
    }
    var summaryHtml = criticalSummaryMarkup(section);
    var items = section.items || [];
    if (!items.length) {
      sec.innerHTML = summaryHtml + sectionMessage(t('exe.crit.empty'));
      return;
    }
    sec.innerHTML = summaryHtml + items.map(function(item) {
      var toneColor = item.tone === 'risk' ? 'var(--bad)' : item.tone === 'warn' ? 'var(--warn)' : 'var(--brand)';
      var kindLabel = item.kind === 'emergency' ? t('exe.crit.kindEmergency') : t('exe.crit.kindPosting');
      var statusLabel = item.status || '';
      var ageTxt = formatCriticalAge(item);
      var startTxt = formatCriticalStart(item);
      var coverageTxt = formatCriticalCoverage(item);
      var openCount = criticalOpenHeadcount(item);
      var openTxt = item.kind === 'emergency'
        ? t('exe.crit.openWorkers', { count: openCount })
        : t('exe.crit.openPositions', { count: openCount });
      var reasons = (item.reasons || []).map(function(reason) {
        return '<span class="critical-pressure-chip">' + esc(reason) + '</span>';
      }).join('');
      var rowTitle = t('exe.crit.rowTitle') +
        ((item.reasons && item.reasons.length) ? t('exe.crit.rowDrivers', { reasons: item.reasons.join(', ') }) : '');
      return '<a href="' + esc(item.href || '#') + '" class="critical-pressure-row critical-pressure-row--' + esc(item.tone || 'ok') + '" title="' + esc(rowTitle) + '">' +
        '<div class="critical-pressure-row__main">' +
          '<div class="critical-pressure-row__title">' + esc(item.title || t('exe.crit.fallbackTitle')) + '</div>' +
          '<div class="critical-pressure-row__meta">' + esc(kindLabel) + ' · ' + esc(item.role || t('exe.crit.noRole')) + ' · ' + esc(statusLabel) + '</div>' +
          '<div class="critical-pressure-row__meta">' + esc(ageTxt) + ' · ' + esc(startTxt) + ' · ' + esc(openTxt) + ' · ' + esc(coverageTxt) + '</div>' +
          '<div class="critical-pressure-row__reasons">' + reasons + '</div>' +
        '</div>' +
        '<div class="critical-pressure-row__stats">' +
          '<div class="critical-pressure-row__score" style="color:' + toneColor + '">' + esc(String(item.pressure_score || 0)) + '</div>' +
          '<div class="critical-pressure-row__score-label">' + esc(t('exe.crit.score')) + '</div>' +
        '</div>' +
      '</a>';
    }).join('');
  }

  /* ── Bootstrap ────────────────────────────────────────── */
  init();
  loadHealth();
  loadCeStats();
  loadActivityFeed();
  loadDsgvo();
})();
