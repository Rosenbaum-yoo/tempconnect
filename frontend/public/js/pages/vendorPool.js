/**
 * vendorPool.js — Page-spezifische Logik fuer vendor_pool.html
 *
 * Stand April 2026:
 * Vollständige Page-Logik wurde aus vendor_pool.html ausgelagert.
 *
 * Datenquellen:
 *   GET /api/vendor-pool?client_org_id=&tier=
 *   GET /api/vendor-pool/stats?client_org_id=
 *   GET /api/vendor-pool/supplier-lookup?q=
 *   PATCH /api/vendor-pool/:id/tier
 *   PATCH /api/vendor-pool/:id/status
 *   POST /api/vendor-pool
 *
 * Beziehungen zu anderen Seiten:
 *   -> supplier_scorecard.html?agencyId=&agencyName= (Deep-Link pro Supplier)
 *   -> rate-cards.html (Konditionsbasis)
 *   -> requisitions.html (offene Angebote)
 *   -> spend-analytics.html (Ausgaben je Vendor)
 *   <- executive_dashboard.html (Hub-Einstieg)
 */

'use strict';

/* ── Woerterbuch (P6.1, DE/EN) ─────────────────────────────────────────────
   Eigener Unter-Namensraum "exe.vp." — die Steuerungs-/Analytik-Gruppe teilt
   sich das Praefix "exe.", jede Seite bringt ihr eigenes Woerterbuch mit,
   damit sich zwei Seiten derselben Gruppe nie gegenseitig ueberschreiben.

   Bewusst NICHT uebersetzt:
   - Tier- und Status-Rohwerte (PREFERRED, SECONDARY, active, suspended …):
     Server-Enums, die als Filter- und Formularwert an die API gehen.
   - API-Daten (Lieferantenname, Organisationstyp, Kategorie, Grade).
   - alles aus pageShell.js (Topbar, Navigation, Sprach-Umschalter).
   - rollenabhaengige Begriffe aus terminologyLabels.js.

   Feste Unternehmenssprache ist hier korrekt: vendor_pool.html ist laut
   api/config/visibilityMatrix.js auf allowed_org_types ["company"] begrenzt —
   ein Personaldienstleister erreicht diese Flaeche nie.                      */
TCi18n.register('de', {
  'exe.vp.docTitle': 'Lieferantensteuerung – TempConnect',
  'exe.vp.page.title': 'Lieferantenpool',
  'exe.vp.page.subtitle': 'Bevorzugte Lieferanten, Tier-Stufen und Performance als nachgelagerte Steuerungsschicht fuer wiederkehrende Arbeitsplatzangebote steuern.',
  'exe.vp.addBtn': '+ Lieferant hinzufuegen',

  'exe.vp.banner.eyebrow': 'Steuerungsschicht',
  'exe.vp.banner.title': 'Lieferantensteuerung verbessert den Pilotkern, ersetzt ihn aber nicht',
  'exe.vp.banner.text': 'Nutzen Sie den Pool, um Coverage, Preferred Vendors und Preisdisziplin rund um echte Arbeitsplatzangebote zu verbessern. Der operative Kern bleibt trotzdem Arbeitsplatzangebot, Deal, Besetzung und Zeiten.',
  'exe.vp.banner.asideTitle': 'Bewusste Reihenfolge',
  'exe.vp.banner.asideText': 'Erst Kernflows glattziehen, danach Tiering, Bewertungen und Spend tiefer optimieren.',

  'exe.vp.nav.req': 'Angebote',
  'exe.vp.nav.rates': 'Preisrahmen',
  'exe.vp.nav.scorecard': 'Lieferantenbewertung',
  'exe.vp.nav.spend': 'Spend & Kosten',

  'exe.vp.insight.top': 'Top-Lieferanten im Pool',
  'exe.vp.insight.changes': 'Letzte Änderungen',
  'exe.vp.insight.loadingKpi': 'Lade Management-KPIs…',
  'exe.vp.insight.loadingChanges': 'Lade Änderungsverlauf…',

  'exe.vp.filter.org': 'Organisation:',
  'exe.vp.filter.orgPh': 'Wird automatisch aus Ihrem Kontext geladen',
  'exe.vp.filter.allTiers': 'Alle Tiers',
  'exe.vp.filter.load': 'Laden',

  'exe.vp.th.supplier': 'Lieferant',
  'exe.vp.th.tier': 'Tier',
  'exe.vp.th.category': 'Kategorie',
  'exe.vp.th.status': 'Status',
  'exe.vp.th.performance': 'Performance',
  'exe.vp.th.governance': 'Steuerung',
  'exe.vp.th.actions': 'Aktionen',

  'exe.vp.modal.title': 'Lieferanten zum Pool hinzufuegen',
  'exe.vp.modal.cancel': 'Abbrechen',
  'exe.vp.modal.clientOrg': 'Client Org ID *',
  'exe.vp.modal.searchSupplier': 'Lieferant suchen *',
  'exe.vp.modal.searchPh': 'Lieferantenname oder Organisation eingeben (mind. 2 Zeichen)',
  'exe.vp.modal.searchBtn': 'Suchen',
  'exe.vp.modal.supplierOrg': 'Lieferanten-Org-ID *',
  'exe.vp.modal.tier': 'Tier',
  'exe.vp.modal.category': 'Kategorie',
  'exe.vp.modal.validFrom': 'Gueltig von',
  'exe.vp.modal.validUntil': 'Gueltig bis',
  'exe.vp.modal.reason': 'Grund',
  'exe.vp.modal.submit': 'Hinzufuegen',

  'exe.vp.rate.unverified': 'Preisrahmen sind derzeit nicht verifizierbar.',
  'exe.vp.rate.plan': 'Preisrahmen bleiben fuer berechtigte PRO-/Individuell-Zugaenge reserviert.',
  'exe.vp.rate.buyerOnly': 'Preisrahmen bleiben in dieser Lieferantensteuerung buyer-seitig fuer Unternehmensorganisationen reserviert.',
  'exe.vp.rate.role': 'Preisrahmen sind nur fuer leseberechtigte Procurement-/Steuerungsrollen sichtbar.',

  'exe.vp.access.readOnly': 'Der Vendor Pool ist fuer diese Rolle derzeit nur eingeschraenkt freigegeben.',
  'exe.vp.access.denied': 'Der Vendor Pool ist fuer diese Rolle nicht freigeschaltet.',
  'exe.vp.access.hiddenTitle': 'Vendor Pool ausgeblendet',
  'exe.vp.access.noteHidden': 'Der Vendor Pool ist fuer die aktuelle Rolle nicht freigegeben.',
  'exe.vp.access.emptyTitle': 'Vendor Pool nicht verfuegbar',

  'exe.vp.write.lockedTitle': 'Vendor Pool ist schreibgeschuetzt',
  'exe.vp.write.lockedText': '{action} ist fuer diese Rolle nicht freigegeben.',
  'exe.vp.action.tier': 'Tier-Aenderungen',
  'exe.vp.action.suspend': 'Sperrungen',
  'exe.vp.action.activate': 'Aktivierungen',
  'exe.vp.action.add': 'Das Hinzufuegen von Lieferanten',
  'exe.vp.action.lookup': 'Die Lieferantensuche im Vendor Pool',
  'exe.vp.action.create': 'Das Anlegen von Lieferantenbeziehungen',

  'exe.vp.stats.total': 'Gesamt',
  'exe.vp.stats.active30d': 'Aktiv 30 Tage',
  'exe.vp.error.network': 'Netzwerkfehler oder Server nicht erreichbar.',

  'exe.vp.state.loadingTitle': 'Lieferantenpool wird geladen',
  'exe.vp.state.loadingText': 'Organisationskontext und Management-KPIs werden vorbereitet.',
  'exe.vp.state.csrfTitle': 'Initialisierung teilweise eingeschränkt',
  'exe.vp.state.csrfText': 'Das Sicherheitstoken konnte nicht geladen werden. Der Lieferantenpool bleibt lesbar, schreibende Aktionen koennen voruebergehend fehlschlagen.',

  'exe.vp.mgmt.kpiUnavailable': 'Management-KPIs derzeit nicht verfügbar.',
  'exe.vp.mgmt.changesUnavailable': 'Änderungsverlauf derzeit nicht verfügbar.',
  'exe.vp.mgmt.avgReputation': 'Ø Reputation',
  'exe.vp.mgmt.avgStars': 'Ø Sterne',
  'exe.vp.mgmt.avgDealSuccess': 'Ø Deal Success',
  'exe.vp.mgmt.topGrades': 'Top Grades',
  'exe.vp.mgmt.active': 'Aktiv',
  'exe.vp.mgmt.suspended': 'Suspendiert',
  'exe.vp.mgmt.supplierFallback': 'Lieferant',
  'exe.vp.mgmt.noGrade': 'keine Grade',
  'exe.vp.mgmt.noStars': 'keine Sterne',
  'exe.vp.mgmt.changeFallback': 'Änderung',
  'exe.vp.mgmt.systemActor': 'System',
  'exe.vp.mgmt.noPerformance': 'Noch keine Performancedaten im Pool.',
  'exe.vp.mgmt.noChanges': 'Noch keine dokumentierten Änderungen.',

  'exe.vp.drill.topTitle': 'Aktive Supplier im 30-Tage-Fenster',
  'exe.vp.drill.changesTitle': 'Drilldown-Semantik',
  'exe.vp.drill.activeVendors': 'Aktive Vendoren 30T',
  'exe.vp.drill.preferred': 'Preferred im Fenster',
  'exe.vp.drill.avgReputation': 'Ø Reputation',
  'exe.vp.drill.avgFillRate': 'Ø Fill Rate',
  'exe.vp.drill.fill': 'Fill {value}',
  'exe.vp.drill.dealSuccess': 'Deal Success {value}',
  'exe.vp.drill.emptyList': 'Keine aktiven Pool-Vendoren im aktuellen 30-Tage-Fenster.',
  'exe.vp.drill.included': 'Einbezogen',
  'exe.vp.drill.includedText': 'Aktive Pool-Vendoren mit Kandidateneinreichung, Einsatz-Aktivität oder freigegebenen Stundenzetteln der letzten 30 Tage.',
  'exe.vp.drill.counting': 'Zählweise',
  'exe.vp.drill.countingText': 'Mehrfach gepflegte Pool-Einträge werden auf eine führende Supplier-Zuordnung verdichtet, damit die Liste der Executive-KPI entspricht.',
  'exe.vp.drill.filter': 'Filter',
  'exe.vp.drill.tierHint': 'Zusätzlicher Tier-Filter: {tier}.',
  'exe.vp.drill.noTierHint': 'Kein zusätzlicher Tier-Filter aktiv.',
  'exe.vp.drill.prepStats': '30-Tage-Drilldown wird vorbereitet…',
  'exe.vp.drill.loadingSuppliers': 'Lade aktive Supplier…',
  'exe.vp.drill.loadingHints': 'Lade Drilldown-Hinweise…',
  'exe.vp.drill.loadTitle': 'Aktive Vendoren werden geladen',
  'exe.vp.drill.loadText': 'Die 30-Tage-Drilldown-Liste und ihre Management-Zusammenfassung werden aktualisiert.',

  'exe.vp.ctx.drillTitle': 'Executive-Drilldown: Aktive Vendoren (30 Tage)',
  'exe.vp.ctx.drillText': 'Die Liste zeigt aktive Pool-Vendoren mit echter buyer-seitiger Aktivität im aktuellen 30-Tage-Fenster und verdichtet Mehrfachzuordnungen pro Supplier.',
  'exe.vp.ctx.locTitle': 'Standort: {loc}',
  'exe.vp.ctx.locText': 'Der Lieferantenpool zeigt alle Lieferanten der Organisation. Pool-Einträge können einem Standort zugeordnet sein – der aktive Standortfilter „{loc}" ist als Kontext sichtbar.',

  'exe.vp.load.title': 'Lieferantenpool wird geladen',
  'exe.vp.load.text': 'Lieferantenbeziehungen, KPI-Karten und Steuerungsdaten werden aktualisiert.',

  'exe.vp.org.note': 'Ohne Client-Organisation kann der Lieferantenpool nicht geladen werden.',
  'exe.vp.org.emptyTitle': 'Lieferantenpool nicht initialisiert',
  'exe.vp.org.emptyText': 'Dem aktuellen Nutzer ist noch keine Client-Organisation zugeordnet.',
  'exe.vp.org.stateTitle': 'Organisationskontext fehlt',
  'exe.vp.org.stateText': 'Der Lieferantenpool benötigt eine Client-Organisation im Nutzerkontext.',

  'exe.vp.partial.statsKpi': 'Pool-KPIs',
  'exe.vp.partial.statsNote': 'Pool-KPIs konnten derzeit nicht geladen werden.',
  'exe.vp.partial.mgmtKpi': 'Management-KPIs',
  'exe.vp.partial.and': ' und ',
  'exe.vp.partial.title': 'Teilweise Daten fehlen',
  'exe.vp.partial.text': '{parts} konnten nicht geladen werden. Der Pool bleibt dennoch bedienbar.',

  'exe.vp.list.failEmptyTitle': 'Lieferantenpool konnte nicht geladen werden',
  'exe.vp.list.failEmptyText': 'Die Lieferantenbeziehungen sind derzeit nicht verfügbar. Bitte später erneut versuchen.',
  'exe.vp.list.failTitle': 'Liste derzeit nicht verfügbar',
  'exe.vp.list.failText': 'Die Lieferantenbeziehungen konnten nicht geladen werden.',

  'exe.vp.empty.drillTierTitle': 'Keine aktiven Vendoren für diesen Tier',
  'exe.vp.empty.drillTierText': 'Im aktuellen 30-Tage-Fenster gibt es für den gewählten Tier keine buyer-seitige Aktivität.',
  'exe.vp.empty.drillTitle': 'Keine aktiven Pool-Vendoren im 30-Tage-Fenster',
  'exe.vp.empty.drillText': 'Es gibt derzeit keine aktiven Pool-Vendoren mit Kandidateneinreichung, Einsatz-Aktivität oder freigegebenen Stundenzetteln in den letzten 30 Tagen.',
  'exe.vp.empty.tierTitle': 'Keine Lieferanten für diesen Tier',
  'exe.vp.empty.tierText': 'Passen Sie den Tier-Filter an oder fügen Sie einen weiteren Lieferanten hinzu.',
  'exe.vp.empty.noneLocTitle': 'Keine Lieferanten im Pool für Standort {loc}',
  'exe.vp.empty.noneTitle': 'Keine Lieferanten im Pool',
  'exe.vp.empty.noneText': 'Noch keine Lieferantenbeziehung vorhanden. Fuegen Sie jetzt einen Lieferanten hinzu.',

  'exe.vp.readonly.title': 'Vendor Pool read-only',
  'exe.vp.readonly.text': 'Lieferantenbeziehungen sind sichtbar, Aenderungen bleiben fuer diese Rolle gesperrt.',

  'exe.vp.row.supplierFallback': 'Lieferant',
  'exe.vp.row.validUntil': 'Gueltig bis',
  'exe.vp.row.rep': 'Rep',
  'exe.vp.row.na': 'n/a',
  'exe.vp.row.fill': 'Fill',
  'exe.vp.row.slaBreach': 'SLA Breach',
  'exe.vp.row.rating': 'Bewertung',
  'exe.vp.row.ratingTitle': 'Lieferantenbewertung',
  'exe.vp.row.rates': 'Preisrahmen',
  'exe.vp.row.ratesTitle': 'Lieferantenspezifische Preisrahmen',
  'exe.vp.row.spend': 'Kosten',
  'exe.vp.row.spendTitle': 'Spend fuer diesen Lieferanten',
  'exe.vp.row.block': 'Sperren',
  'exe.vp.row.activate': 'Aktivieren',
  'exe.vp.row.readOnly': 'Read-only',
  'exe.vp.row.dealSuccess': 'Deal Success',
  'exe.vp.row.activity': 'Activity',

  'exe.vp.tier.prompt': 'Grund fuer Tier-Aenderung (optional):',
  'exe.vp.tier.okTitle': 'Tier aktualisiert',
  'exe.vp.tier.okText': 'Die Lieferantenstufe wurde erfolgreich geändert.',
  'exe.vp.tier.failTitle': 'Tier-Änderung fehlgeschlagen',
  'exe.vp.tier.failText': 'Die Lieferantenstufe konnte nicht geändert werden.',
  'exe.vp.suspend.reason': 'Manuell gesperrt',
  'exe.vp.suspend.okTitle': 'Lieferant gesperrt',
  'exe.vp.suspend.okText': 'Der Lieferant wurde erfolgreich auf suspendiert gesetzt.',
  'exe.vp.suspend.failTitle': 'Sperrung fehlgeschlagen',
  'exe.vp.suspend.failText': 'Der Lieferant konnte nicht gesperrt werden.',
  'exe.vp.activate.okTitle': 'Lieferant aktiviert',
  'exe.vp.activate.okText': 'Der Lieferant wurde wieder aktiviert.',
  'exe.vp.activate.failTitle': 'Aktivierung fehlgeschlagen',
  'exe.vp.activate.failText': 'Der Lieferant konnte nicht aktiviert werden.',

  'exe.vp.add.noOrgTitle': 'Organisation fehlt',
  'exe.vp.add.noOrgText': 'Ohne Client-Organisation kann kein Lieferant dem Pool hinzugefügt werden.',
  'exe.vp.lookup.minChars': 'Mindestens 2 Zeichen eingeben.',
  'exe.vp.lookup.unavailable': 'Lieferantensuche derzeit nicht verfügbar.',
  'exe.vp.lookup.noResults': 'Keine passenden Organisationen gefunden.',
  'exe.vp.create.okTitle': 'Lieferant hinzugefügt',
  'exe.vp.create.okText': 'Die Lieferantenbeziehung wurde erfolgreich angelegt.',
  'exe.vp.create.failTitle': 'Anlage fehlgeschlagen',
  'exe.vp.create.failText': 'Die Lieferantenbeziehung konnte nicht angelegt werden.',

  'exe.vp.boot.note': 'Der Organisationskontext konnte nicht automatisch geladen werden.',
  'exe.vp.boot.emptyTitle': 'Lieferantenpool nicht initialisiert',
  'exe.vp.boot.emptyText': 'Bitte Organisation und Benutzerkontext prüfen, bevor der Pool geladen wird.',
  'exe.vp.boot.stateTitle': 'Kontext nicht verfügbar',
  'exe.vp.boot.stateText': 'Der Nutzerkontext liefert derzeit keine Client-Organisation.'
});
TCi18n.register('en', {
  'exe.vp.docTitle': 'Supplier governance – TempConnect',
  'exe.vp.page.title': 'Supplier pool',
  'exe.vp.page.subtitle': 'Steer preferred suppliers, tiers and performance as a downstream governance layer for recurring job postings.',
  'exe.vp.addBtn': '+ Add supplier',

  'exe.vp.banner.eyebrow': 'Governance layer',
  'exe.vp.banner.title': 'Supplier governance improves the pilot core, it does not replace it',
  'exe.vp.banner.text': 'Use the pool to improve coverage, preferred suppliers and pricing discipline around real job postings. The operational core stays job posting, deal, filling and hours.',
  'exe.vp.banner.asideTitle': 'Deliberate order',
  'exe.vp.banner.asideText': 'Smooth out the core flows first, then optimise tiering, ratings and spend in depth.',

  'exe.vp.nav.req': 'Job postings',
  'exe.vp.nav.rates': 'Rate cards',
  'exe.vp.nav.scorecard': 'Supplier scorecard',
  'exe.vp.nav.spend': 'Spend & cost',

  'exe.vp.insight.top': 'Top suppliers in the pool',
  'exe.vp.insight.changes': 'Recent changes',
  'exe.vp.insight.loadingKpi': 'Loading management KPIs…',
  'exe.vp.insight.loadingChanges': 'Loading change history…',

  'exe.vp.filter.org': 'Organisation:',
  'exe.vp.filter.orgPh': 'Loaded automatically from your context',
  'exe.vp.filter.allTiers': 'All tiers',
  'exe.vp.filter.load': 'Load',

  'exe.vp.th.supplier': 'Supplier',
  'exe.vp.th.tier': 'Tier',
  'exe.vp.th.category': 'Category',
  'exe.vp.th.status': 'Status',
  'exe.vp.th.performance': 'Performance',
  'exe.vp.th.governance': 'Governance',
  'exe.vp.th.actions': 'Actions',

  'exe.vp.modal.title': 'Add a supplier to the pool',
  'exe.vp.modal.cancel': 'Cancel',
  'exe.vp.modal.clientOrg': 'Client org ID *',
  'exe.vp.modal.searchSupplier': 'Find supplier *',
  'exe.vp.modal.searchPh': 'Enter a supplier name or organisation (min. 2 characters)',
  'exe.vp.modal.searchBtn': 'Search',
  'exe.vp.modal.supplierOrg': 'Supplier org ID *',
  'exe.vp.modal.tier': 'Tier',
  'exe.vp.modal.category': 'Category',
  'exe.vp.modal.validFrom': 'Valid from',
  'exe.vp.modal.validUntil': 'Valid until',
  'exe.vp.modal.reason': 'Reason',
  'exe.vp.modal.submit': 'Add',

  'exe.vp.rate.unverified': 'Rate card access cannot be verified right now.',
  'exe.vp.rate.plan': 'Rate cards remain reserved for eligible PRO and Individual access.',
  'exe.vp.rate.buyerOnly': 'In this supplier governance view, rate cards remain reserved for buyer-side company organisations.',
  'exe.vp.rate.role': 'Rate cards are visible only to procurement and steering roles with read access.',

  'exe.vp.access.readOnly': 'The supplier pool is only partly released for this role.',
  'exe.vp.access.denied': 'The supplier pool is not enabled for this role.',
  'exe.vp.access.hiddenTitle': 'Supplier pool hidden',
  'exe.vp.access.noteHidden': 'The supplier pool is not released for the current role.',
  'exe.vp.access.emptyTitle': 'Supplier pool unavailable',

  'exe.vp.write.lockedTitle': 'The supplier pool is read-only',
  'exe.vp.write.lockedText': '{action} is not released for this role.',
  'exe.vp.action.tier': 'Changing tiers',
  'exe.vp.action.suspend': 'Blocking suppliers',
  'exe.vp.action.activate': 'Activating suppliers',
  'exe.vp.action.add': 'Adding suppliers',
  'exe.vp.action.lookup': 'Supplier search in the pool',
  'exe.vp.action.create': 'Creating supplier relationships',

  'exe.vp.stats.total': 'Total',
  'exe.vp.stats.active30d': 'Active 30 days',
  'exe.vp.error.network': 'Network error or server unreachable.',

  'exe.vp.state.loadingTitle': 'Loading the supplier pool',
  'exe.vp.state.loadingText': 'Organisation context and management KPIs are being prepared.',
  'exe.vp.state.csrfTitle': 'Initialisation partly limited',
  'exe.vp.state.csrfText': 'The security token could not be loaded. The supplier pool stays readable, write actions may fail temporarily.',

  'exe.vp.mgmt.kpiUnavailable': 'Management KPIs currently unavailable.',
  'exe.vp.mgmt.changesUnavailable': 'Change history currently unavailable.',
  'exe.vp.mgmt.avgReputation': 'Avg reputation',
  'exe.vp.mgmt.avgStars': 'Avg stars',
  'exe.vp.mgmt.avgDealSuccess': 'Avg deal success',
  'exe.vp.mgmt.topGrades': 'Top grades',
  'exe.vp.mgmt.active': 'Active',
  'exe.vp.mgmt.suspended': 'Suspended',
  'exe.vp.mgmt.supplierFallback': 'Supplier',
  'exe.vp.mgmt.noGrade': 'no grade',
  'exe.vp.mgmt.noStars': 'no stars',
  'exe.vp.mgmt.changeFallback': 'Change',
  'exe.vp.mgmt.systemActor': 'System',
  'exe.vp.mgmt.noPerformance': 'No performance data in the pool yet.',
  'exe.vp.mgmt.noChanges': 'No documented changes yet.',

  'exe.vp.drill.topTitle': 'Active suppliers in the 30-day window',
  'exe.vp.drill.changesTitle': 'Drilldown semantics',
  'exe.vp.drill.activeVendors': 'Active suppliers 30d',
  'exe.vp.drill.preferred': 'Preferred in window',
  'exe.vp.drill.avgReputation': 'Avg reputation',
  'exe.vp.drill.avgFillRate': 'Avg fill rate',
  'exe.vp.drill.fill': 'Fill {value}',
  'exe.vp.drill.dealSuccess': 'Deal success {value}',
  'exe.vp.drill.emptyList': 'No active pool suppliers in the current 30-day window.',
  'exe.vp.drill.included': 'Included',
  'exe.vp.drill.includedText': 'Active pool suppliers with candidate submissions, assignment activity or approved timesheets in the last 30 days.',
  'exe.vp.drill.counting': 'Counting',
  'exe.vp.drill.countingText': 'Duplicate pool entries are condensed into one leading supplier mapping so the list matches the executive KPI.',
  'exe.vp.drill.filter': 'Filter',
  'exe.vp.drill.tierHint': 'Additional tier filter: {tier}.',
  'exe.vp.drill.noTierHint': 'No additional tier filter active.',
  'exe.vp.drill.prepStats': 'Preparing the 30-day drilldown…',
  'exe.vp.drill.loadingSuppliers': 'Loading active suppliers…',
  'exe.vp.drill.loadingHints': 'Loading drilldown notes…',
  'exe.vp.drill.loadTitle': 'Loading active suppliers',
  'exe.vp.drill.loadText': 'The 30-day drilldown list and its management summary are being refreshed.',

  'exe.vp.ctx.drillTitle': 'Executive drilldown: active suppliers (30 days)',
  'exe.vp.ctx.drillText': 'The list shows active pool suppliers with real buyer-side activity in the current 30-day window and condenses multiple mappings per supplier.',
  'exe.vp.ctx.locTitle': 'Location: {loc}',
  'exe.vp.ctx.locText': 'The supplier pool shows all suppliers of the organisation. Pool entries can be assigned to a location – the active location filter "{loc}" is shown as context.',

  'exe.vp.load.title': 'Loading the supplier pool',
  'exe.vp.load.text': 'Supplier relationships, KPI cards and governance data are being refreshed.',

  'exe.vp.org.note': 'Without a client organisation the supplier pool cannot be loaded.',
  'exe.vp.org.emptyTitle': 'Supplier pool not initialised',
  'exe.vp.org.emptyText': 'No client organisation is assigned to the current user yet.',
  'exe.vp.org.stateTitle': 'Organisation context missing',
  'exe.vp.org.stateText': 'The supplier pool needs a client organisation in the user context.',

  'exe.vp.partial.statsKpi': 'Pool KPIs',
  'exe.vp.partial.statsNote': 'Pool KPIs could not be loaded right now.',
  'exe.vp.partial.mgmtKpi': 'Management KPIs',
  'exe.vp.partial.and': ' and ',
  'exe.vp.partial.title': 'Some data is missing',
  'exe.vp.partial.text': '{parts} could not be loaded. The pool stays usable nonetheless.',

  'exe.vp.list.failEmptyTitle': 'The supplier pool could not be loaded',
  'exe.vp.list.failEmptyText': 'Supplier relationships are currently unavailable. Please try again later.',
  'exe.vp.list.failTitle': 'List currently unavailable',
  'exe.vp.list.failText': 'The supplier relationships could not be loaded.',

  'exe.vp.empty.drillTierTitle': 'No active suppliers for this tier',
  'exe.vp.empty.drillTierText': 'There is no buyer-side activity for the selected tier in the current 30-day window.',
  'exe.vp.empty.drillTitle': 'No active pool suppliers in the 30-day window',
  'exe.vp.empty.drillText': 'There are currently no active pool suppliers with candidate submissions, assignment activity or approved timesheets in the last 30 days.',
  'exe.vp.empty.tierTitle': 'No suppliers for this tier',
  'exe.vp.empty.tierText': 'Adjust the tier filter or add another supplier.',
  'exe.vp.empty.noneLocTitle': 'No suppliers in the pool for location {loc}',
  'exe.vp.empty.noneTitle': 'No suppliers in the pool',
  'exe.vp.empty.noneText': 'No supplier relationship exists yet. Add a supplier now.',

  'exe.vp.readonly.title': 'Supplier pool read-only',
  'exe.vp.readonly.text': 'Supplier relationships are visible, changes stay locked for this role.',

  'exe.vp.row.supplierFallback': 'Supplier',
  'exe.vp.row.validUntil': 'Valid until',
  'exe.vp.row.rep': 'Rep',
  'exe.vp.row.na': 'n/a',
  'exe.vp.row.fill': 'Fill',
  'exe.vp.row.slaBreach': 'SLA breach',
  'exe.vp.row.rating': 'Scorecard',
  'exe.vp.row.ratingTitle': 'Supplier scorecard',
  'exe.vp.row.rates': 'Rate card',
  'exe.vp.row.ratesTitle': 'Supplier-specific rate cards',
  'exe.vp.row.spend': 'Cost',
  'exe.vp.row.spendTitle': 'Spend for this supplier',
  'exe.vp.row.block': 'Block',
  'exe.vp.row.activate': 'Activate',
  'exe.vp.row.readOnly': 'Read-only',
  'exe.vp.row.dealSuccess': 'Deal success',
  'exe.vp.row.activity': 'Activity',

  'exe.vp.tier.prompt': 'Reason for the tier change (optional):',
  'exe.vp.tier.okTitle': 'Tier updated',
  'exe.vp.tier.okText': 'The supplier tier was changed successfully.',
  'exe.vp.tier.failTitle': 'Tier change failed',
  'exe.vp.tier.failText': 'The supplier tier could not be changed.',
  'exe.vp.suspend.reason': 'Blocked manually',
  'exe.vp.suspend.okTitle': 'Supplier blocked',
  'exe.vp.suspend.okText': 'The supplier was set to suspended successfully.',
  'exe.vp.suspend.failTitle': 'Blocking failed',
  'exe.vp.suspend.failText': 'The supplier could not be blocked.',
  'exe.vp.activate.okTitle': 'Supplier activated',
  'exe.vp.activate.okText': 'The supplier was activated again.',
  'exe.vp.activate.failTitle': 'Activation failed',
  'exe.vp.activate.failText': 'The supplier could not be activated.',

  'exe.vp.add.noOrgTitle': 'Organisation missing',
  'exe.vp.add.noOrgText': 'Without a client organisation no supplier can be added to the pool.',
  'exe.vp.lookup.minChars': 'Enter at least 2 characters.',
  'exe.vp.lookup.unavailable': 'Supplier search currently unavailable.',
  'exe.vp.lookup.noResults': 'No matching organisations found.',
  'exe.vp.create.okTitle': 'Supplier added',
  'exe.vp.create.okText': 'The supplier relationship was created successfully.',
  'exe.vp.create.failTitle': 'Creation failed',
  'exe.vp.create.failText': 'The supplier relationship could not be created.',

  'exe.vp.boot.note': 'The organisation context could not be loaded automatically.',
  'exe.vp.boot.emptyTitle': 'Supplier pool not initialised',
  'exe.vp.boot.emptyText': 'Please check organisation and user context before loading the pool.',
  'exe.vp.boot.stateTitle': 'Context unavailable',
  'exe.vp.boot.stateText': 'The user context currently provides no client organisation.'
});

/** Kurzform der Uebersetzung an der Verwendungsstelle. */
function vpT(key,params){return TCi18n.t(key,params);}
/** BCP-47-Locale fuer Datumsformatierung (DE bleibt Default). */
function vpLocale(){return TCi18n.dateLocale();}
/** Text + Marker setzen, damit ein Sprachwechsel den Wert nachzieht.
 *  Mit Laufzeitwerten (params) wird der Marker bewusst entfernt — sonst
 *  wuerde das naechste apply() die Fassung ohne Werte zurueckschreiben. */
function vpSetText(el,key,params){
  if(!el)return;
  if(params)el.removeAttribute('data-i18n');
  else el.setAttribute('data-i18n',key);
  el.textContent=vpT(key,params);
}
/** Markup setzen und einen evtl. vorhandenen Marker entfernen. */
function vpSetHtml(el,html){
  if(!el)return;
  el.removeAttribute('data-i18n');
  el.innerHTML=html;
}
function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function pct(v){return v==null||v===''?'–':Number(v).toFixed(1)+'%';}
function fmtDate(v){if(!v)return '–';try{return new Date(v).toLocaleDateString(vpLocale());}catch(e){return v;}}
function renderPageState(id,tone,title,text){
  var el=document.getElementById(id);
  if(!el)return;
  if(!title&&!text){
    el.className='page-state';
    el.innerHTML='';
    el.style.display='none';
    return;
  }
  el.className='page-state page-state--'+(tone||'info');
  el.innerHTML='<div class="page-state__title">'+esc(title||'')+'</div><div class="page-state__text">'+esc(text||'')+'</div>';
  el.style.display='';
}
function applyVendorPoolDomLocks(root){
  if(window.TC&&window.TC.entitlements&&typeof window.TC.entitlements.applyDomLocks==='function'){
    window.TC.entitlements.applyDomLocks(root||document).catch(function(){});
  }
}
function showPoolState(tone,title,text){renderPageState('poolState',tone,title,text);}
function clearPoolState(){renderPageState('poolState');}
function sectionNote(text){return '<div class="section-note">'+esc(text)+'</div>';}
function setPoolEmptyState(titleKey,textKey,titleParams,textParams){
  vpSetText(document.getElementById('poolEmptyTitle'),titleKey,titleParams);
  vpSetText(document.getElementById('poolEmptyText'),textKey,textParams);
  document.getElementById('emptyMsg').style.display='';
}
/** Leerzustand mit bereits fertigem Text (z. B. die konkrete Begruendung aus
 *  der Surface-Access-Aufloesung) — kein Marker, sonst wuerde das naechste
 *  apply() die allgemeine Fassung darueberschreiben. */
function setPoolEmptyRaw(titleKey,rawText){
  vpSetText(document.getElementById('poolEmptyTitle'),titleKey);
  var textEl=document.getElementById('poolEmptyText');
  if(textEl){textEl.removeAttribute('data-i18n');textEl.textContent=rawText||'';}
  document.getElementById('emptyMsg').style.display='';
}
function hidePoolEmptyState(){document.getElementById('emptyMsg').style.display='none';}
function parseApiError(result,fallback){
  if(!result)return fallback;
  if(typeof result.error==='string'&&result.error)return result.error;
  if(Array.isArray(result.details)&&result.details.length)return result.details.join(', ');
  if(typeof result.details==='string'&&result.details)return result.details;
  return fallback;
}
function readStoredPoolFilters(){
  try{
    var raw=sessionStorage.getItem(POOL_FILTER_STORAGE_KEY);
    if(!raw)return {};
    var parsed=JSON.parse(raw);
    return parsed&&typeof parsed==='object'?parsed:{};
  }catch(e){return {};}
}
function writeStoredPoolFilters(filters){
  try{sessionStorage.setItem(POOL_FILTER_STORAGE_KEY,JSON.stringify(filters||{}));}
  catch(e){/* Session-Storage kann lokal blockiert sein. */}
}
function resolvePoolDefaults(){
  var hasDrilldown=!!(poolView.statusGroup||poolView.activityScope);
  var stored=(!hasDrilldown&&!poolView.tier)?readStoredPoolFilters():{};
  return { tier:poolView.tier||stored.tier||'', hasDrilldown:hasDrilldown };
}
function applyPoolFilterDefaults(){
  var defaults=resolvePoolDefaults();
  var tierEl=document.getElementById('fTier');
  if(tierEl)tierEl.value=defaults.tier||'';
  return defaults;
}
var poolQuery=new URLSearchParams(window.location.search||'');
var poolView={
  statusGroup:poolQuery.get('status_group')||'',
  tier:poolQuery.get('tier')||'',
  activityScope:poolQuery.get('activity_scope')||''
};
var POOL_FILTER_STORAGE_KEY='tc.vendorPool.filters.v1';
var currentMe=null;
var vendorPoolAccess={ allowed:false, canRead:false, canWrite:false, mode:'hidden', reason:'' };
var spendAnalyticsAccess={ allowed:false, canRead:false, canWrite:false, mode:'hidden', reason:'' };
var rateCardAccess={ canRead:false, reason:'' };
var RATE_CARD_READ_ROLES={
  platform_admin:true,
  owner:true,
  admin:true,
  program_manager:true,
  hiring_manager:true,
  supplier_manager:true,
  finance:true,
  viewer:true
};
if(!poolView.activityScope&&poolView.statusGroup==='activity_30d')poolView.activityScope='buyer_activity_30d';
if(!poolView.statusGroup&&poolView.activityScope==='buyer_activity_30d')poolView.statusGroup='activity_30d';
function normalizePlan(plan){
  var p=String(plan||'DEMO').toUpperCase();
  if(p==='FREE')return 'DEMO';
  if(p==='ENTERPRISE'||p==='INDIVIDUAL')return 'INDIVIDUELL';
  return p;
}
function resolveSurfaceAccess(me,key){
  if(window.TC&&window.TC.surfaceAccess&&typeof window.TC.surfaceAccess.resolve==='function'){
    return window.TC.surfaceAccess.resolve(me,key)||{ allowed:false, canRead:false, canWrite:false, mode:'hidden', reason:'' };
  }
  if(key==='rate_cards'){
    return resolveRateCardAccess(me);
  }
  return { allowed:false, canRead:false, canWrite:false, mode:'hidden', reason:'' };
}
function resolveRateCardAccess(me){
  var roleType=String(me&&me.role||'').toLowerCase();
  var plan=normalizePlan(me&&me.plan);
  var orgRole=String(me&&me.org_role||'').trim();
  if(!me)return { canRead:false, reason:vpT('exe.vp.rate.unverified') };
  if(plan!=='PRO'&&plan!=='INDIVIDUELL')return { canRead:false, reason:vpT('exe.vp.rate.plan') };
  if(roleType==='agency')return { canRead:false, reason:vpT('exe.vp.rate.buyerOnly') };
  if(!RATE_CARD_READ_ROLES[orgRole])return { canRead:false, reason:vpT('exe.vp.rate.role') };
  return { canRead:true, reason:'' };
}
function applyRateCardLinkVisibility(){
  var link=document.getElementById('vendorPoolRateCardLink');
  if(!link)return;
  link.style.display=rateCardAccess.canRead?'':'none';
}
function applySpendLinkVisibility(){
  var link=document.getElementById('vendorPoolSpendLink');
  if(!link)return;
  link.style.display=spendAnalyticsAccess.canRead?'':'none';
}
function describeVendorPoolAccessState(access){
  if(!access||access.canRead)return '';
  if(access.mode==='read_only')return vpT('exe.vp.access.readOnly');
  if(access.reason)return access.reason;
  return vpT('exe.vp.access.denied');
}
function syncVendorPoolReadState(){
  var addButton=document.getElementById('vendorPoolAddButton');
  if(addButton){
    addButton.style.display=vendorPoolAccess.canWrite?'':'none';
    addButton.disabled=!vendorPoolAccess.canWrite;
  }
  var addForm=document.getElementById('addForm');
  if(addForm){
    Array.prototype.forEach.call(addForm.querySelectorAll('input,select,textarea,button'),function(el){
      if(el.id==='addCloseBtn')return;
      el.disabled=!vendorPoolAccess.canWrite;
    });
  }
}
function applyVendorPoolAccessState(){
  syncVendorPoolReadState();
  applyRateCardLinkVisibility();
  applySpendLinkVisibility();
  applyVendorPoolDomLocks(document);
}
function ensureVendorPoolWrite(actionKey){
  if(vendorPoolAccess.canWrite)return true;
  showPoolState('info',vpT('exe.vp.write.lockedTitle'),vpT('exe.vp.write.lockedText',{action:vpT(actionKey)}));
  return false;
}
function isActivity30dDrilldown(){return poolView.activityScope==='buyer_activity_30d';}
function renderPoolContext(title,text){
  var el=document.getElementById('poolContext');
  if(!el)return;
  if(!title&&!text){
    el.innerHTML='';
    el.style.display='none';
    return;
  }
  var html='';
  if(title)html+='<strong>'+esc(title)+'</strong>';
  if(text)html+='<div class="table-meta" style="margin-top:6px">'+esc(text)+'</div>';
  el.innerHTML=html;
  el.style.display='';
}
function buildTierStats(items){
  var stats={PREFERRED:0,SECONDARY:0,TRIAL:0,RESTRICTED:0,BLOCKED:0,total:(items||[]).length};
  (items||[]).forEach(function(item){
    if(item&&stats[item.tier]!=null)stats[item.tier]+=1;
  });
  return stats;
}
function renderTierStats(stats,totalLabel){
  // Tier-Namen bleiben Rohwerte (Server-Enum) — nur das Gesamt-Label ist UI-Text.
  document.getElementById('statsRow').innerHTML=
    ['PREFERRED','SECONDARY','TRIAL','RESTRICTED','BLOCKED'].map(function(t2){
      return '<div class="stat-tile"><b>'+(stats[t2]||0)+'</b><span class="tier-badge tb-'+t2+'">'+t2+'</span></div>';
    }).join('')+'<div class="stat-tile"><b>'+(stats.total||0)+'</b><span>'+esc(totalLabel||vpT('exe.vp.stats.total'))+'</span></div>';
}
function averageMetric(items,key){
  var values=(items||[]).map(function(item){return Number(item&&item[key]);}).filter(function(value){return Number.isFinite(value);});
  if(!values.length)return null;
  return values.reduce(function(sum,value){return sum+value;},0)/values.length;
}
var csrfToken='';
function getLocHeader(){
  try{return(window.TC&&TC.api&&typeof TC.api.getActiveLocationId==='function')?TC.api.getActiveLocationId():null;}catch(_e){return null;}
}
function getLocLabel(){
  try{return sessionStorage.getItem('tc.activeLocationName')||null;}catch(_e){return null;}
}
async function apiGet(p){
  try{
    var headers={};
    var locId=getLocHeader();
    if(locId)headers['X-Location-Id']=locId;
    var r=await fetch('/api'+p,{credentials:'include',headers:headers});
    if(r.status===401){location.href='/';return null;}
    if(!r.ok)return null;
    return await r.json();
  }catch(e){return null;}
}
async function apiMut(method,p,b){
  try{
    var r=await fetch('/api'+p,{method:method,credentials:'include',headers:{'Content-Type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify(b)});
    if(r.status===401){location.href='/';return null;}
    var text=await r.text();
    var data={};
    if(text){try{data=JSON.parse(text);}catch(err){data={};}}
    if(r.ok)return data;
    if(!data.error)data.error='HTTP '+r.status;
    return data;
  }catch(e){return { error:vpT('exe.vp.error.network') };}
}

async function init(){
  showPoolState('info',vpT('exe.vp.state.loadingTitle'),vpT('exe.vp.state.loadingText'));
  currentMe=await apiGet('/me');
  vendorPoolAccess=resolveSurfaceAccess(currentMe,'vendor_pool');
  spendAnalyticsAccess=resolveSurfaceAccess(currentMe,'spend_analytics');
  rateCardAccess=resolveSurfaceAccess(currentMe,'rate_cards');
  applyVendorPoolAccessState();
  if(!vendorPoolAccess.canWrite){
    if(!vendorPoolAccess.canRead){
      showPoolState('info',vpT('exe.vp.access.hiddenTitle'),describeVendorPoolAccessState(vendorPoolAccess));
    }
    return;
  }
  try{
    var csrf=await fetch('/api/csrf',{credentials:'include'});
    if(csrf.ok){var d=await csrf.json();csrfToken=d.token||d.csrfToken||'';}
  }catch(e){
    showPoolState('warn',vpT('exe.vp.state.csrfTitle'),vpT('exe.vp.state.csrfText'));
  }
}
function buildScoreUrl(v){
  return '/public/supplier_scorecard.html?agencyId='+encodeURIComponent(v.supplier_org_id||'')+'&agencyName='+encodeURIComponent(v.supplier_org_name||v.supplier_org_id||'');
}
function buildRateCardUrl(v){
  if(!rateCardAccess.canRead)return '';
  return '/public/rate-cards.html?supplier_org_id='+encodeURIComponent(v.supplier_org_id||'')+'&supplier_name='+encodeURIComponent(v.supplier_org_name||v.supplier_org_id||'');
}
function buildSpendUrl(v){
  if(!spendAnalyticsAccess.canRead)return '';
  return '/public/spend-analytics.html?vendor_id='+encodeURIComponent(v.supplier_org_id||'')+'&supplier='+encodeURIComponent(v.supplier_org_name||v.supplier_org_id||'');
}

function renderManagement(dashboard){
  var row=document.getElementById('managementRow');
  var topBox=document.getElementById('topPerformersBox');
  var changesBox=document.getElementById('recentChangesBox');
  var topTitle=document.getElementById('topPerformersTitle');
  var changesTitle=document.getElementById('recentChangesTitle');
  vpSetText(topTitle,'exe.vp.insight.top');
  vpSetText(changesTitle,'exe.vp.insight.changes');
  if(!dashboard){
    row.innerHTML='';
    vpSetText(topBox,'exe.vp.mgmt.kpiUnavailable');
    vpSetText(changesBox,'exe.vp.mgmt.changesUnavailable');
    return;
  }
  var kpi=dashboard.kpis||{};
  var status=dashboard.status_composition||{};
  row.innerHTML=[
    {label:vpT('exe.vp.mgmt.avgReputation'),val:kpi.avg_reputation!=null?kpi.avg_reputation:'–',color:'var(--brand)'},
    {label:vpT('exe.vp.mgmt.avgStars'),val:kpi.avg_stars!=null?kpi.avg_stars:'–',color:'var(--text)'},
    {label:vpT('exe.vp.mgmt.avgDealSuccess'),val:kpi.avg_deal_success!=null?kpi.avg_deal_success+'%':'–',color:'var(--good)'},
    {label:vpT('exe.vp.mgmt.topGrades'),val:kpi.top_grade_count||0,color:'#7c5cff'},
    {label:vpT('exe.vp.mgmt.active'),val:status.active||0,color:'var(--good)'},
    {label:vpT('exe.vp.mgmt.suspended'),val:status.suspended||0,color:'var(--warn)'}
  ].map(function(tile){
    return '<div class="management-tile"><b style="color:'+tile.color+'">'+esc(String(tile.val))+'</b><span>'+esc(tile.label)+'</span></div>';
  }).join('');

  var topItems=dashboard.top_performers||[];
  vpSetHtml(topBox,topItems.length?'<div class="insight-list">'+topItems.map(function(item){
    return '<div class="insight-item">'
      + '<div><strong>'+esc(item.supplier_name||vpT('exe.vp.mgmt.supplierFallback'))+'</strong><div class="table-meta">'+esc(item.tier||'–')+' · '+esc(item.grade||vpT('exe.vp.mgmt.noGrade'))+'</div></div>'
      + '<div style="text-align:right"><strong>'+(item.reputation_score!=null?esc(String(item.reputation_score)):'–')+'</strong><div class="table-meta">'+(item.avg_stars!=null?esc(String(item.avg_stars))+' ★':esc(vpT('exe.vp.mgmt.noStars')))+'</div></div>'
      + '</div>';
  }).join('')+'</div>':'<div class="empty-mini">'+esc(vpT('exe.vp.mgmt.noPerformance'))+'</div>');

  var changes=dashboard.recent_changes||[];
  vpSetHtml(changesBox,changes.length?'<div class="insight-list">'+changes.map(function(item){
    return '<div class="insight-item">'
      + '<div><strong>'+esc(item.supplier_name||vpT('exe.vp.mgmt.supplierFallback'))+'</strong><div class="table-meta">'+esc(item.field_changed||vpT('exe.vp.mgmt.changeFallback'))+': '+esc(item.old_value||'–')+' → '+esc(item.new_value||'–')+'</div></div>'
      + '<div style="text-align:right"><strong>'+fmtDate(item.created_at)+'</strong><div class="table-meta">'+esc(item.changed_by_name||vpT('exe.vp.mgmt.systemActor'))+'</div></div>'
      + '</div>';
  }).join('')+'</div>':'<div class="empty-mini">'+esc(vpT('exe.vp.mgmt.noChanges'))+'</div>');
}
function renderActivityDrilldownManagement(items,tier){
  var row=document.getElementById('managementRow');
  var topBox=document.getElementById('topPerformersBox');
  var changesBox=document.getElementById('recentChangesBox');
  var topTitle=document.getElementById('topPerformersTitle');
  var changesTitle=document.getElementById('recentChangesTitle');
  var avgReputation=averageMetric(items,'reputation_score');
  var avgFillRate=averageMetric(items,'fill_rate_pct');
  var preferredCount=(items||[]).filter(function(item){return item&&item.tier==='PREFERRED';}).length;
  vpSetText(topTitle,'exe.vp.drill.topTitle');
  vpSetText(changesTitle,'exe.vp.drill.changesTitle');
  row.innerHTML=[
    {label:vpT('exe.vp.drill.activeVendors'),val:(items||[]).length,color:'var(--brand)'},
    {label:vpT('exe.vp.drill.preferred'),val:preferredCount,color:'var(--good)'},
    {label:vpT('exe.vp.drill.avgReputation'),val:avgReputation!=null?avgReputation.toFixed(1):'–',color:'#7c5cff'},
    {label:vpT('exe.vp.drill.avgFillRate'),val:avgFillRate!=null?avgFillRate.toFixed(1)+'%':'–',color:'var(--text)'}
  ].map(function(tile){
    return '<div class="management-tile"><b style="color:'+tile.color+'">'+esc(String(tile.val))+'</b><span>'+esc(tile.label)+'</span></div>';
  }).join('');
  var topItems=(items||[]).slice().sort(function(a,b){
    return (Number(b&&b.reputation_score)||-1)-(Number(a&&a.reputation_score)||-1)
      || String((a&&a.supplier_org_name)||'').localeCompare(String((b&&b.supplier_org_name)||''),vpLocale());
  }).slice(0,5);
  vpSetHtml(topBox,topItems.length?'<div class="insight-list">'+topItems.map(function(item){
    return '<div class="insight-item">'
      + '<div><strong>'+esc(item.supplier_org_name||vpT('exe.vp.mgmt.supplierFallback'))+'</strong><div class="table-meta">'+esc(item.tier||'–')+' · '+esc(vpT('exe.vp.drill.fill',{value:pct(item.fill_rate_pct)}))+'</div></div>'
      + '<div style="text-align:right"><strong>'+(item.reputation_score!=null?esc(String(item.reputation_score)):'–')+'</strong><div class="table-meta">'+esc(vpT('exe.vp.drill.dealSuccess',{value:pct(item.deal_success_rate)}))+'</div></div>'
      + '</div>';
  }).join('')+'</div>':'<div class="empty-mini">'+esc(vpT('exe.vp.drill.emptyList'))+'</div>');
  var tierHint=tier?vpT('exe.vp.drill.tierHint',{tier:tier}):vpT('exe.vp.drill.noTierHint');
  vpSetHtml(changesBox,'<div class="insight-list">'
    + '<div class="insight-item"><div><strong>'+esc(vpT('exe.vp.drill.included'))+'</strong><div class="table-meta">'+esc(vpT('exe.vp.drill.includedText'))+'</div></div></div>'
    + '<div class="insight-item"><div><strong>'+esc(vpT('exe.vp.drill.counting'))+'</strong><div class="table-meta">'+esc(vpT('exe.vp.drill.countingText'))+'</div></div></div>'
    + '<div class="insight-item"><div><strong>'+esc(vpT('exe.vp.drill.filter'))+'</strong><div class="table-meta">'+esc(tierHint)+'</div></div></div>'
    + '</div>');
}

async function loadPool(persist){
  var shouldPersist=persist!==false;
  var clientOrg=document.getElementById('fClientOrg').value.trim();
  var activityDrilldown=isActivity30dDrilldown();
  var allowPersist=shouldPersist&&!poolView.statusGroup&&!poolView.activityScope;
  syncVendorPoolReadState();
  if(!vendorPoolAccess.canRead){
    renderPoolContext('','');
    document.getElementById('statsRow').innerHTML=sectionNote(vpT('exe.vp.access.noteHidden'));
    renderManagement(null);
    document.getElementById('poolBody').innerHTML='';
    setPoolEmptyRaw('exe.vp.access.emptyTitle',describeVendorPoolAccessState(vendorPoolAccess));
    showPoolState('info',vpT('exe.vp.access.hiddenTitle'),describeVendorPoolAccessState(vendorPoolAccess));
    return;
  }
  var poolLocId=getLocHeader();var poolLocLbl=getLocLabel();
  renderPoolContext(
    activityDrilldown?vpT('exe.vp.ctx.drillTitle'):(poolLocId?vpT('exe.vp.ctx.locTitle',{loc:poolLocLbl||poolLocId}):''),
    activityDrilldown?vpT('exe.vp.ctx.drillText'):(poolLocId?vpT('exe.vp.ctx.locText',{loc:poolLocLbl||poolLocId}):'')
  );
  if(!clientOrg){
    document.getElementById('statsRow').innerHTML=sectionNote(vpT('exe.vp.org.note'));
    renderManagement(null);
    document.getElementById('poolBody').innerHTML='';
    setPoolEmptyState('exe.vp.org.emptyTitle','exe.vp.org.emptyText');
    showPoolState('warn',vpT('exe.vp.org.stateTitle'),vpT('exe.vp.org.stateText'));
    return;
  }
  showPoolState(
    'info',
    activityDrilldown?vpT('exe.vp.drill.loadTitle'):vpT('exe.vp.load.title'),
    activityDrilldown?vpT('exe.vp.drill.loadText'):vpT('exe.vp.load.text')
  );
  var tier=document.getElementById('fTier').value;
  if(allowPersist){writeStoredPoolFilters({tier:tier||''});}
  var qsParts=[];
  if(tier)qsParts.push('tier='+encodeURIComponent(tier));
  if(activityDrilldown)qsParts.push('activity_scope=buyer_activity_30d');
  qsParts.push('limit=100');
  var qs='?'+qsParts.join('&');
  var partialIssues=[];

  if(activityDrilldown){
    document.getElementById('statsRow').innerHTML=sectionNote(vpT('exe.vp.drill.prepStats'));
    document.getElementById('managementRow').innerHTML='';
    vpSetText(document.getElementById('topPerformersTitle'),'exe.vp.drill.topTitle');
    vpSetText(document.getElementById('recentChangesTitle'),'exe.vp.drill.changesTitle');
    vpSetText(document.getElementById('topPerformersBox'),'exe.vp.drill.loadingSuppliers');
    vpSetText(document.getElementById('recentChangesBox'),'exe.vp.drill.loadingHints');
  }else{
    var stats=await apiGet('/vendor-pool/stats?client_org_id='+encodeURIComponent(clientOrg));
    if(stats){
      renderTierStats(stats,vpT('exe.vp.stats.total'));
    }else{
      partialIssues.push(vpT('exe.vp.partial.statsKpi'));
      document.getElementById('statsRow').innerHTML=sectionNote(vpT('exe.vp.partial.statsNote'));
    }

    var dashboard=await apiGet('/suppliers/dashboard');
    if(!dashboard) partialIssues.push(vpT('exe.vp.partial.mgmtKpi'));
    renderManagement(dashboard);
  }

  var data=await apiGet('/suppliers/enriched'+qs);
  if(!data){
    document.getElementById('poolBody').innerHTML='';
    if(activityDrilldown){
      renderTierStats(buildTierStats([]),vpT('exe.vp.stats.active30d'));
      renderActivityDrilldownManagement([],tier);
    }
    setPoolEmptyState('exe.vp.list.failEmptyTitle','exe.vp.list.failEmptyText');
    showPoolState('bad',vpT('exe.vp.list.failTitle'),vpT('exe.vp.list.failText'));
    return;
  }
  var items=data.items||[];
  var tbody=document.getElementById('poolBody');
  if(!items.length){
    tbody.innerHTML='';
    if(activityDrilldown){
      renderTierStats(buildTierStats([]),vpT('exe.vp.stats.active30d'));
      renderActivityDrilldownManagement([],tier);
      setPoolEmptyState(
        tier ? 'exe.vp.empty.drillTierTitle' : 'exe.vp.empty.drillTitle',
        tier ? 'exe.vp.empty.drillTierText' : 'exe.vp.empty.drillText'
      );
    }else{
      var locLbl=getLocLabel();
      setPoolEmptyState(
        tier ? 'exe.vp.empty.tierTitle' : (locLbl ? 'exe.vp.empty.noneLocTitle' : 'exe.vp.empty.noneTitle'),
        tier ? 'exe.vp.empty.tierText' : 'exe.vp.empty.noneText',
        (!tier&&locLbl) ? { loc: locLbl } : null
      );
    }
    if(partialIssues.length){
      showPoolState('warn',vpT('exe.vp.partial.title'),vpT('exe.vp.partial.text',{parts:partialIssues.join(vpT('exe.vp.partial.and'))}));
    }else{
      clearPoolState();
    }
    return;
  }
  hidePoolEmptyState();
  if(activityDrilldown){
    renderTierStats(buildTierStats(items),vpT('exe.vp.stats.active30d'));
    renderActivityDrilldownManagement(items,tier);
    if(vendorPoolAccess.canWrite){
      clearPoolState();
    }else{
      showPoolState('info',vpT('exe.vp.readonly.title'),vpT('exe.vp.readonly.text'));
    }
  }else if(partialIssues.length){
    showPoolState('warn',vpT('exe.vp.partial.title'),vpT('exe.vp.partial.text',{parts:partialIssues.join(vpT('exe.vp.partial.and'))}));
  }else if(!vendorPoolAccess.canWrite){
    showPoolState('info',vpT('exe.vp.readonly.title'),vpT('exe.vp.readonly.text'));
  }else{
    clearPoolState();
  }
  tbody.innerHTML=items.map(function(v){
    var repClass=(v.reputation_score||0)>=80?'good':(v.reputation_score||0)>=60?'warn':'bad';
    var breachClass=v.sla_breach_rate_pct==null?'':(Number(v.sla_breach_rate_pct)<=10?'good':Number(v.sla_breach_rate_pct)<=25?'warn':'bad');
    var rateCardLink=rateCardAccess.canRead
      ? '<a class="btn" data-feature-key="rate_card_management" href="'+buildRateCardUrl(v)+'" style="padding:4px 10px;font-size:11px" title="'+esc(vpT('exe.vp.row.ratesTitle'))+'">'+esc(vpT('exe.vp.row.rates'))+' &#8594;</a>'
      : '';
    var spendLink=spendAnalyticsAccess.canRead
      ? '<a class="btn" data-feature-key="spend_analytics" href="'+buildSpendUrl(v)+'" style="padding:4px 10px;font-size:11px" title="'+esc(vpT('exe.vp.row.spendTitle'))+'">'+esc(vpT('exe.vp.row.spend'))+' &#8594;</a>'
      : '';
    var actionHtml=vendorPoolAccess.canWrite
      ? '<select data-feature-key="supplier_management" onchange="changeTier(\''+v.id+'\',this.value)" style="width:auto;margin:0;padding:4px 8px;font-size:12px">'
          + ['PREFERRED','SECONDARY','TRIAL','RESTRICTED','BLOCKED'].map(function(t2){
              return '<option'+(t2===v.tier?' selected':'')+'>'+t2+'</option>';
            }).join('')
          + '</select>'
          + (v.status==='active'
              ? '<button class="btn bad" data-feature-key="supplier_management" style="padding:4px 8px;font-size:11px" onclick="suspendEntry(\''+v.id+'\')">'+esc(vpT('exe.vp.row.block'))+'</button>'
              : '<button class="btn good" data-feature-key="supplier_management" style="padding:4px 8px;font-size:11px" onclick="activateEntry(\''+v.id+'\')">'+esc(vpT('exe.vp.row.activate'))+'</button>')
      : '<span class="table-meta">'+esc(vpT('exe.vp.row.readOnly'))+'</span>';
    return '<tr class="vp-row">'+
      '<td><strong>'+esc(v.supplier_org_name||v.supplier_org_id)+'</strong><div class="table-meta">'+esc(v.supplier_org_type||vpT('exe.vp.row.supplierFallback'))+(v.location_name?' · '+esc(v.location_name):'')+'</div></td>'+
      '<td><span class="tier-badge tb-'+v.tier+'">'+esc(v.tier)+'</span></td>'+
      '<td>'+esc(v.category||'–')+'</td>'+
      '<td>'+esc(v.status)+'<div class="table-meta">'+esc(vpT('exe.vp.row.validUntil'))+' '+(v.valid_until?esc(v.valid_until):'–')+'</div></td>'+
      '<td><div class="metric-stack">'
        + '<span class="metric-chip '+repClass+'">'+esc(vpT('exe.vp.row.rep'))+' ' + (v.reputation_score!=null?esc(String(v.reputation_score)):'–') + ' / ' + esc(v.reputation_grade||vpT('exe.vp.row.na')) + '</span>'
        + '<span class="metric-chip">'+esc(vpT('exe.vp.row.fill'))+' ' + pct(v.fill_rate_pct) + '</span>'
        + '<span class="metric-chip '+breachClass+'">'+esc(vpT('exe.vp.row.slaBreach'))+' ' + pct(v.sla_breach_rate_pct) + '</span>'
      + '</div></td>'+
      '<td><div class="quick-links">'
        + '<a class="btn" data-feature-key="supplier_ratings" href="'+buildScoreUrl(v)+'" style="padding:4px 10px;font-size:11px" title="'+esc(vpT('exe.vp.row.ratingTitle'))+'">'+esc(vpT('exe.vp.row.rating'))+' &#8594;</a>'
        + rateCardLink
        + spendLink
      + '</div><div class="table-meta">'+esc(vpT('exe.vp.row.dealSuccess'))+' '+pct(v.deal_success_rate)+' · '+esc(vpT('exe.vp.row.activity'))+' '+(v.activity_score!=null?esc(String(v.activity_score)):'–')+'</div></td>'+
      '<td style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'+actionHtml+'</td></tr>';
  }).join('');
  applyVendorPoolDomLocks(tbody);
}

async function changeTier(id,tier){
  if(!ensureVendorPoolWrite('exe.vp.action.tier'))return;
  var reason=prompt(vpT('exe.vp.tier.prompt'));
  var result=await apiMut('PATCH','/vendor-pool/'+id+'/tier',{tier:tier,reason:reason||null});
  if(result&&!result.error){
    showPoolState('good',vpT('exe.vp.tier.okTitle'),vpT('exe.vp.tier.okText'));
    loadPool();
  }else{
    showPoolState('bad',vpT('exe.vp.tier.failTitle'),parseApiError(result,vpT('exe.vp.tier.failText')));
  }
}
async function suspendEntry(id){
  if(!ensureVendorPoolWrite('exe.vp.action.suspend'))return;
  var result=await apiMut('PATCH','/vendor-pool/'+id+'/status',{status:'suspended',reason:vpT('exe.vp.suspend.reason')});
  if(result&&!result.error){
    showPoolState('good',vpT('exe.vp.suspend.okTitle'),vpT('exe.vp.suspend.okText'));
    loadPool();
  }else{
    showPoolState('bad',vpT('exe.vp.suspend.failTitle'),parseApiError(result,vpT('exe.vp.suspend.failText')));
  }
}
async function activateEntry(id){
  if(!ensureVendorPoolWrite('exe.vp.action.activate'))return;
  var result=await apiMut('PATCH','/vendor-pool/'+id+'/status',{status:'active'});
  if(result&&!result.error){
    showPoolState('good',vpT('exe.vp.activate.okTitle'),vpT('exe.vp.activate.okText'));
    loadPool();
  }else{
    showPoolState('bad',vpT('exe.vp.activate.failTitle'),parseApiError(result,vpT('exe.vp.activate.failText')));
  }
}

function showAdd(){
  if(!ensureVendorPoolWrite('exe.vp.action.add'))return;
  document.getElementById('aClientOrg').value = document.getElementById('fClientOrg').value || '';
  if(!document.getElementById('aClientOrg').value){
    showPoolState('warn',vpT('exe.vp.add.noOrgTitle'),vpT('exe.vp.add.noOrgText'));
    return;
  }
  document.getElementById('supplierLookupResults').innerHTML = '';
  document.getElementById('addModal').classList.add('show');
}
async function lookupSuppliers() {
  if(!ensureVendorPoolWrite('exe.vp.action.lookup'))return;
  var q = (document.getElementById('aSupplierSearch').value || '').trim();
  var box = document.getElementById('supplierLookupResults');
  if (q.length < 2) { box.innerHTML = '<div style="font-size:12px;color:var(--muted)">'+esc(vpT('exe.vp.lookup.minChars'))+'</div>'; return; }
  var data = await apiGet('/vendor-pool/supplier-lookup?q=' + encodeURIComponent(q));
  if (!data) { box.innerHTML = sectionNote(vpT('exe.vp.lookup.unavailable')); return; }
  var items = (data && data.items) || [];
  if (!items.length) { box.innerHTML = '<div style="font-size:12px;color:var(--muted)">'+esc(vpT('exe.vp.lookup.noResults'))+'</div>'; return; }
  box.innerHTML = items.map(function(it) {
    return '<button type="button" class="btn" data-feature-key="supplier_management" style="margin:2px 4px 2px 0;padding:4px 8px;font-size:12px" data-id="' + esc(it.id) + '" onclick="pickSupplier(this.dataset.id)">' +
      esc(it.name || it.id) + ' <span style="opacity:.7">(' + esc(it.org_type || 'org') + ')</span></button>';
  }).join('');
  applyVendorPoolDomLocks(box);
}

function pickSupplier(id) {
  document.getElementById('aSupplierOrg').value = id;
}

function closeAdd(){document.getElementById('addModal').classList.remove('show');}

async function submitAdd(e){
  e.preventDefault();
  if(!ensureVendorPoolWrite('exe.vp.action.create'))return;
  var body={
    client_org_id:document.getElementById('aClientOrg').value.trim(),
    supplier_org_id:document.getElementById('aSupplierOrg').value.trim(),
    tier:document.getElementById('aTier').value,
    category:document.getElementById('aCategory').value||null,
    valid_from:document.getElementById('aFrom').value||null,
    valid_until:document.getElementById('aUntil').value||null,
    reason:document.getElementById('aReason').value||null
  };
  var result=await apiMut('POST','/vendor-pool',body);
  if(result&&result.id){
    closeAdd();document.getElementById('addForm').reset();
    document.getElementById('fClientOrg').value=body.client_org_id;
    showPoolState('good',vpT('exe.vp.create.okTitle'),vpT('exe.vp.create.okText'));
    loadPool();
  }else{
    showPoolState('bad',vpT('exe.vp.create.failTitle'),parseApiError(result,vpT('exe.vp.create.failText')));
  }
}
window.loadPool = loadPool;
window.changeTier = changeTier;
window.suspendEntry = suspendEntry;
window.activateEntry = activateEntry;
window.showAdd = showAdd;
window.closeAdd = closeAdd;
window.submitAdd = submitAdd;
window.lookupSuppliers = lookupSuppliers;
window.pickSupplier = pickSupplier;

init().then(function(){
  if (!currentMe || !currentMe.org_id) {
      document.getElementById('statsRow').innerHTML=sectionNote(vpT('exe.vp.boot.note'));
      renderManagement(null);
      setPoolEmptyState('exe.vp.boot.emptyTitle','exe.vp.boot.emptyText');
      showPoolState('warn',vpT('exe.vp.boot.stateTitle'),vpT('exe.vp.boot.stateText'));
      return;
  }
  document.getElementById('fClientOrg').value = currentMe.org_id;
  document.getElementById('aClientOrg').value = currentMe.org_id;
  applyPoolFilterDefaults();
  loadPool(false);
});
