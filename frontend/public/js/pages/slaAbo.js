/* ═══════════════════════════════════════════════════════
   SLA & Abo — Page Logic
   ═══════════════════════════════════════════════════════ */

/* ── Woerterbuch (P6.1, DE/EN) ─────────────────────────────────────────────
   sla_abo.html laedt i18n.js im head; dieses Modul laeuft ausschliesslich auf
   sla_abo.html, TCi18n ist hier also garantiert vorhanden. Namensraum: pr.b.*

   Bewusst NICHT uebersetzt:
   - Plan-Schluessel (DEMO, BASIS, PLUS, PRO, INDIVIDUELL) und Statuswerte aus
     der API (payment.status, payment.method) — technische Serverwerte.
   - Plan-Anzeigelabel aus window.PlanFeatures.getDisplayPlanLabel und alle
     Katalogdaten aus /api/public/catalog — fremde Quellen, kein Page-Text.
   - die Account-Bloecke (Status, Limits, Aktionen, Features, Anfragen,
     Rechnungen, Dokumente): deren Markup baut accountSubscription.js.
   - alles aus pageShell.js, footer.js und den Marken Stripe/PayPal.
   - "Personal einstellen" in der Vergleichstabelle: rollenabhaengiger Begriff
     aus terminologyLabels.js — darf nicht als fester Woerterbuchwert
     eingefroren werden, solange die Seite fuer company UND agency offen ist. */
TCi18n.register('de', {
  'pr.b.docTitle': 'Abo-Modelle – TempConnect',

  'pr.b.hero.eyebrow': 'Abo-Modelle & Tarife',
  'pr.b.hero.title': 'Waehlen Sie den passenden Tarif',
  'pr.b.hero.sub': 'Upgrade oder Downgrade jederzeit moeglich. Alle Tarife monatlich kuendbar.',

  'pr.b.banner.successStrong': 'Zahlung erfolgreich!',
  'pr.b.banner.successText': 'Dein Abo wurde aktiviert. Die Seite wird aktualisiert.',
  'pr.b.banner.cancelStrong': 'Zahlung abgebrochen.',
  'pr.b.banner.cancelText': 'Du kannst den Checkout jederzeit erneut starten.',

  'pr.b.plans.title': 'Tarif wechseln',
  'pr.b.plans.sub': 'Standardtarife BASIS/PLUS/PRO koennen Sie direkt buchen. Individuelle Tarife laufen ueber unser Tarif-Team.',

  'pr.b.trust.gdpr': 'DSGVO-konform',
  'pr.b.trust.hosting': 'Hosting in Deutschland',
  'pr.b.trust.monthly': 'Monatlich kuendbar',
  'pr.b.trust.lockin': 'Kein Lock-in',

  'pr.b.bounty.title': 'Bis zu 20% Bounty-Rabatt verdienen',
  'pr.b.bounty.desc': 'Gute Leistung zahlt sich aus — sammeln Sie Bounties durch Performance, Aktivitaet und Treue und senken Sie dauerhaft Ihren Abo-Preis.',
  'pr.b.bounty.cta': 'Bounties ansehen',

  'pr.b.ref.title': 'Empfehlungsprogramm',
  'pr.b.ref.pilotBadge': 'Pilotkunde',
  'pr.b.ref.cta': 'Details & Einladen',
  'pr.b.ref.codeLabel': 'Ihr Code:',
  'pr.b.ref.copy': 'Link kopieren',
  'pr.b.ref.copied': 'Kopiert!',

  'pr.b.cmp.eyebrow': 'Vergleich',
  'pr.b.cmp.title': 'Alle Features im Detail',
  'pr.b.cmp.desc': 'Detaillierter Vergleich aller Funktionen nach Tarif.',
  'pr.b.cmp.thFunction': 'Funktion',
  'pr.b.cmp.thIndividuell': 'INDIVIDUELLER TARIF',

  'pr.b.grp.marketplace': 'Marketplace & Anfragen',
  'pr.b.grp.matching': 'Vermittlung',
  'pr.b.grp.scoring': 'Matching & Scoring',
  'pr.b.grp.workflows': 'Operative Workflows',
  'pr.b.grp.emergency': 'Notdienst & Preisvorschlaege',
  'pr.b.grp.reputation': 'Reputation & Bewertung',
  'pr.b.grp.pulse': 'Pulse & SLA',
  'pr.b.grp.analytics': 'Analysen & Tools',
  'pr.b.grp.security': 'Sicherheit & Authentifizierung',
  'pr.b.grp.individuell': 'Funktionen des individuellen Tarifs',
  'pr.b.grp.support': 'Support',

  'pr.b.f.marketplaceSearch': 'Marketplace durchsuchen',
  'pr.b.f.requestsSend': 'Anfragen senden',
  'pr.b.f.requestsReceive': 'Anfragen empfangen',
  'pr.b.f.offersCreate': 'Angebote erstellen',
  'pr.b.f.profileListing': 'Profil-Listing',
  'pr.b.f.visibility': 'Erhoehte Sichtbarkeit',
  'pr.b.f.priorityPlacement': 'Prioritaets-Platzierung',
  'pr.b.f.workersPerDeal': 'Arbeiter pro Deal / Anfrage',
  'pr.b.f.exchangeSearch': 'Boerse durchsuchen',
  'pr.b.f.interestDeals': 'Interesse bekunden / Deals',
  'pr.b.f.trustBadges': 'Vertrauenssignale & Badges',
  'pr.b.f.activityStats': 'Aktivitaets-Statistiken',
  'pr.b.f.basicMatching': 'Basis-Matching (Rolle, Skills, Standort)',
  'pr.b.f.instantMatch': 'Instant Match (13-Faktor-Scoring)',
  'pr.b.f.smartRanking': 'Smart Ranking (AI-gestuetzte Signale)',
  'pr.b.f.explainableRanking': 'Erklaerbares Ranking (Breakdown)',
  'pr.b.f.matchAlerts': 'Match-Alerts & Benachrichtigungen',
  'pr.b.f.preferredBoost': 'Preferred-First-Boost im Matching',
  'pr.b.f.timesheets': 'Digitale Stundenzettel',
  'pr.b.f.arbzg': 'ArbZG-Pausenvalidierung',
  'pr.b.f.signature': 'Digitale Unterschrift',
  'pr.b.f.batchApproval': 'Batch-Genehmigung (Stundenzettel)',
  'pr.b.f.invoicing': 'Operative Rechnungsstellung',
  'pr.b.f.invoiceKpi': 'Rechnungs-KPI-Dashboard',
  'pr.b.f.csvExport': 'CSV-Export (Rechnungen)',
  'pr.b.f.emergencyStaffing': 'Emergency Staffing / Notdienst',
  'pr.b.f.urgencyModel': '5-Stufen-Urgency-Modell',
  'pr.b.f.autoEscalation': 'Auto-Eskalation',
  'pr.b.f.smartPricing': 'Smart Pricing (Preisvorschlaege)',
  'pr.b.f.reputationScore': 'Reputation-Score & Grade',
  'pr.b.f.supplierRatings': 'Lieferanten-Bewertungen',
  'pr.b.f.topSupplier': 'Top-Supplier Leaderboard',
  'pr.b.f.persistentSearch': 'Persistente Suchauftraege',
  'pr.b.f.pulseTimer': 'Pulse-Timer',
  'pr.b.f.availability': 'Plattformverfuegbarkeit',
  'pr.b.f.individuellDashboard': 'Dashboard individueller Tarife',
  'pr.b.f.complianceScorecard': 'Compliance-Ampel & Scorecard',
  'pr.b.f.advancedAnalytics': 'Erweiterte Analysen',
  'pr.b.f.mfa': 'MFA / TOTP (2-Faktor)',
  'pr.b.f.sso': 'SSO / SAML Login',
  'pr.b.f.ssoAdmin': 'SSO Admin-Konfiguration',
  'pr.b.f.ssoEnforce': 'Enforce SSO (Passwort-Login blockieren)',
  'pr.b.f.spMetadata': 'SP Metadata & IDP-Integration',
  'pr.b.f.vendorPool': 'Vendor Pool Management',
  'pr.b.f.coverage': 'Preferred-First & Coverage-Analyse',
  'pr.b.f.departments': 'Multi-Abteilungen & Teams',
  'pr.b.f.approvalWorkflows': 'Freigabe-Workflows',
  'pr.b.f.contracts': 'Vertragsmanagement',
  'pr.b.f.individuellReporting': 'Reporting fuer individuelle Tarife & Audit',
  'pr.b.f.emailSupport': 'E-Mail-Support',
  'pr.b.f.prioritySupport': 'Priorisierter Support',
  'pr.b.f.dedicatedContact': 'Dedizierter Ansprechpartner',

  'pr.b.val.m5': '5 / Monat',
  'pr.b.val.m20': '20 / Monat',
  'pr.b.val.unlimited': 'Unbegrenzt',
  'pr.b.val.e3': '3 Eintraege',
  'pr.b.val.e20': '20 Eintraege',
  'pr.b.val.bestEffort': 'Best Effort',
  'pr.b.val.min120': '120 Min',
  'pr.b.val.min60': '60 Min',
  'pr.b.val.min30': '30 Min',
  'pr.b.val.pct99': '99 %',
  'pr.b.val.pct995': '99,5 %',

  'pr.b.current.title': 'Aktueller Plan',
  'pr.b.history.title': 'Zahlungshistorie',
  'pr.b.history.loading': 'Lade…',
  'pr.b.disclaimer': 'Alle Preise verstehen sich in EUR netto zzgl. gesetzlicher MwSt. Hinweis: Inhalte dienen der Unterstuetzung und ersetzen keine rechtliche Pruefung. Angaben ohne Gewaehr.',

  'pr.b.co.title': 'Abo abschliessen',
  'pr.b.co.methodLabel': 'Zahlungsmethode waehlen',
  'pr.b.co.demoTitle': 'Demo-Modus aktiv',
  'pr.b.co.demoText': 'Im Demo-Modus wird keine echte Zahlung durchgefuehrt. Du erhaeltst sofort vollen Zugriff.',
  'pr.b.co.demoBtn': 'Zahlung simulieren und Plan aktivieren',
  'pr.b.co.stripeTitle': 'Stripe Checkout',
  'pr.b.co.stripeText': 'Du wirst zu Stripe weitergeleitet, um die Zahlung sicher abzuschliessen. Unterstuetzte Methoden: Kreditkarte, SEPA-Lastschrift, Sofort, Giropay.',
  'pr.b.co.stripeInstant': 'Du erhaeltst sofort vollen Zugriff nach Zahlungseingang.',
  'pr.b.co.stripeBtn': 'Weiter zu Stripe Checkout',
  'pr.b.co.cancelAnytime': 'Du kannst dein Abo jederzeit kuendigen.',

  'pr.b.dg.bountyStrong': 'Bounty-Rabatt',
  'pr.b.dg.bountyText1': ': Sie haben',
  'pr.b.dg.bountyText2': '% Bounty-Rabatt erarbeitet. Bei Downgrade verfallen alle wiederkehrenden Bounties.',
  'pr.b.dg.cancel': 'Abbrechen',
  'pr.b.dg.continue': 'Trotzdem fortfahren',
  'pr.b.dg.altSwitchStrong': 'Wechsel auf niedrigeren Plan',
  'pr.b.dg.altSwitchText': 'statt vollstaendiger Kuendigung – behalten Sie Basiszugang und Ihren Reputations-Score.',
  'pr.b.dg.altUnhappyStrong': 'Unzufrieden?',
  'pr.b.dg.altUnhappyText': 'Kontaktieren Sie unser',
  'pr.b.dg.altSupportLink': 'Support-Team',
  'pr.b.dg.altUnhappyTail': '– wir finden eine Lösung.',
  'pr.b.dg.back': 'Zurueck',
  'pr.b.dg.lastWarning': 'Letzte Warnung',
  'pr.b.dg.keep': 'Doch behalten',

  'pr.b.js.bountyCurrent': ' — Ihr aktueller Rabatt: {pct}%',
  'pr.b.js.refPilotMonths': '{n} Gratis-Monate',
  'pr.b.js.refPilotRest': 'verdient ({n} verbleibend). Werben Sie weitere Kunden fuer mehr Gratis-Monate!',
  'pr.b.js.refDesc1': 'Werben Sie Kunden und erhalten Sie',
  'pr.b.js.refDescStrong': 'Geld zurueck',
  'pr.b.js.refDesc2': '— bis zu 6 Monate Cashback.',
  'pr.b.js.refDescEarned': '{n} Monate verdient',
  'pr.b.js.refStatFree': 'Gratis',
  'pr.b.js.refStatReferrals': 'Referrals',
  'pr.b.js.refStatCashback': 'Cashback',
  'pr.b.js.refStatMax': 'Max',

  'pr.b.js.plansLoading': 'Lade Tarife…',
  'pr.b.js.plansError': 'Tarife konnten nicht geladen werden.',
  'pr.b.js.retry': 'Erneut versuchen',
  'pr.b.js.ctaIndividuell': 'Individuell anfragen',
  'pr.b.js.ctaDemo': 'Demo starten',
  'pr.b.js.ctaChoosePlan': 'Plan waehlen',

  'pr.b.js.planLabel': 'Plan:',
  'pr.b.js.unlimitedUsage': 'Unbegrenzte Nutzung',
  'pr.b.js.requestsUsage': 'Anfragen: {used} / {limit}',
  'pr.b.js.listingsUsage': 'Karteikarten: {used} / {limit}',
  'pr.b.js.notdienst': 'Notdienst: {value}',
  'pr.b.js.yes': 'Ja',
  'pr.b.js.no': 'Nein',
  'pr.b.js.termEnd': 'Laufzeitende',
  'pr.b.js.cancelPendingTitle': 'Kuendigung vorgemerkt',
  'pr.b.js.cancelPendingText': 'Aktiv bis {date}. Zugriff bleibt bis dahin erhalten.',
  'pr.b.js.canceledTitle': 'Abo gekuendigt',
  'pr.b.js.canceledText': 'Der Zugang wurde bereits auf DEMO umgestellt.',
  'pr.b.js.individuellTitle': 'Individueller Tarif',
  'pr.b.js.individuellText': 'Kuendigung erfolgt ausschliesslich ueber das Account-Team.',

  'pr.b.js.btnCancelSub': 'Abo kuendigen',
  'pr.b.js.btnBillingRoles': 'Nur Owner/Admin/Finance',
  'pr.b.js.btnNoSub': 'Kein aktives Abo',
  'pr.b.js.btnCancelPending': 'Kuendigung vorgemerkt',
  'pr.b.js.btnRequestCancel': 'Kuendigung anfragen',

  'pr.b.js.lossCancel': 'Das verlieren Sie bei einer Kuendigung:',
  'pr.b.js.lossDowngrade': 'Das verlieren Sie bei einem Downgrade:',
  'pr.b.js.altCancel': 'Alternativen zur Kuendigung',
  'pr.b.js.altDowngrade': 'Alternativen zum Downgrade',
  'pr.b.js.confirmCancel': 'Kuendigung bestaetigen',
  'pr.b.js.confirmDowngrade': 'Downgrade bestaetigen',
  'pr.b.js.execCancel': 'Kuendigung vormerken',
  'pr.b.js.execDowngrade': 'Jetzt downgraden',
  'pr.b.js.tipLabel': 'Tipp:',
  'pr.b.js.tipSwitchPre': 'Wechseln Sie zu',
  'pr.b.js.tipSwitchPost': '({price}/Mo) statt komplett zu kuendigen.',
  'pr.b.js.dgTitleCancel': 'Abo kuendigen',
  'pr.b.js.dgTitleDowngrade': 'Downgrade auf {plan}',
  'pr.b.js.finalCancelDated': 'Ihre Kuendigung wird zum Laufzeitende ({date}) wirksam. Bis dahin bleiben alle Premium-Funktionen aktiv.',
  'pr.b.js.finalCancelPlain': 'Ihre Kuendigung wird zum Laufzeitende wirksam. Bis dahin bleiben alle Premium-Funktionen aktiv.',
  'pr.b.js.finalDowngrade': 'Ihr Plan wird auf {plan} herabgestuft. Einige Features werden sofort deaktiviert.',
  'pr.b.js.working': 'Wird ausgefuehrt…',

  'pr.b.js.alertCanceled': 'Abo gekuendigt.',
  'pr.b.js.alertCancelDated': 'Kuendigung vorgemerkt zum {date}.',
  'pr.b.js.alertCancelPlain': 'Kuendigung vorgemerkt.',
  'pr.b.js.alertPlanChanged': 'Plan geaendert: {plan}',
  'pr.b.js.errGeneric': 'Fehler',
  'pr.b.js.errUnknown': 'Unbekannter Fehler',
  'pr.b.js.errPrefix': 'Fehler: {msg}',
  'pr.b.js.errPermission': 'Nur Owner/Admin/Finance koennen kuendigen.',
  'pr.b.js.errNoSub': 'Kein aktives Abo zum Kuendigen.',
  'pr.b.js.errAlreadyCanceling': 'Kuendigung ist bereits vorgemerkt.',
  'pr.b.js.errManualCancel': 'Individueller Tarif kann nur ueber das Account-Team gekuendigt werden.',
  'pr.b.js.confirmContact': '{msg} Jetzt Kontakt aufnehmen?',
  'pr.b.js.confirmIndividuellContact': 'Individueller Tarif kann nur ueber das Account-Team gekuendigt werden. Kontakt aufnehmen?',

  'pr.b.js.onRequest': 'auf Anfrage',
  'pr.b.js.perMonth': '/Monat',
  'pr.b.js.benefitBasis': 'Mehr Reichweite – finde schneller passende Partner.',
  'pr.b.js.benefitPlus': 'Noch mehr Reichweite – ideal fuer aktive Vermittlung.',
  'pr.b.js.benefitPro': 'Maximale Sichtbarkeit mit Pulse Notdienst und priorisiertem Matching.',
  'pr.b.js.payDemoLabel': 'Demo-Zahlung',
  'pr.b.js.payDemoDesc': 'Testzahlung ohne echtes Geld',
  'pr.b.js.payStripeLabel': 'Kreditkarte / SEPA / Klarna / Sofort',
  'pr.b.js.payStripeDesc': 'Kreditkarte, SEPA, Sofort, Giropay',
  'pr.b.js.payStripeSoon': 'via Stripe (bald verfuegbar)',
  'pr.b.js.payPaypalDesc': 'Mit PayPal bezahlen',
  'pr.b.js.paySoon': '(bald verfuegbar)',

  'pr.b.js.checkoutCreating': 'Checkout wird erstellt…',
  'pr.b.js.checkoutDemo': 'Demo-Modus – Abo wird aktiviert…',
  'pr.b.js.checkoutActivated': 'Abo aktiviert! Seite wird neu geladen…',
  'pr.b.js.checkoutStripe': 'Weiterleitung zu Stripe®',
  'pr.b.js.checkoutPaypal': 'Weiterleitung zu PayPal®',

  'pr.b.js.noPayments': 'Noch keine Zahlungen.',
  'pr.b.js.historyLoadError': 'Fehler beim Laden.',
  'pr.b.js.thDate': 'Datum',
  'pr.b.js.thPlan': 'Plan',
  'pr.b.js.thAmount': 'Betrag',
  'pr.b.js.thMethod': 'Methode',
  'pr.b.js.thStatus': 'Status'
});

TCi18n.register('en', {
  'pr.b.docTitle': 'Subscription plans – TempConnect',

  'pr.b.hero.eyebrow': 'Subscriptions & plans',
  'pr.b.hero.title': 'Choose the plan that fits',
  'pr.b.hero.sub': 'Upgrade or downgrade at any time. All plans can be cancelled monthly.',

  'pr.b.banner.successStrong': 'Payment successful.',
  'pr.b.banner.successText': 'Your subscription has been activated. The page is being refreshed.',
  'pr.b.banner.cancelStrong': 'Payment cancelled.',
  'pr.b.banner.cancelText': 'You can restart the checkout at any time.',

  'pr.b.plans.title': 'Change plan',
  'pr.b.plans.sub': 'You can book the standard plans BASIS/PLUS/PRO directly. Individual plans run through our plan team.',

  'pr.b.trust.gdpr': 'GDPR-compliant',
  'pr.b.trust.hosting': 'Hosted in Germany',
  'pr.b.trust.monthly': 'Cancel monthly',
  'pr.b.trust.lockin': 'No lock-in',

  'pr.b.bounty.title': 'Earn up to 20% bounty discount',
  'pr.b.bounty.desc': 'Good performance pays off — collect bounties through performance, activity and loyalty and permanently lower your subscription price.',
  'pr.b.bounty.cta': 'View bounties',

  'pr.b.ref.title': 'Referral programme',
  'pr.b.ref.pilotBadge': 'Pilot customer',
  'pr.b.ref.cta': 'Details & invite',
  'pr.b.ref.codeLabel': 'Your code:',
  'pr.b.ref.copy': 'Copy link',
  'pr.b.ref.copied': 'Copied.',

  'pr.b.cmp.eyebrow': 'Comparison',
  'pr.b.cmp.title': 'All features in detail',
  'pr.b.cmp.desc': 'Detailed comparison of every function by plan.',
  'pr.b.cmp.thFunction': 'Feature',
  'pr.b.cmp.thIndividuell': 'INDIVIDUAL PLAN',

  'pr.b.grp.marketplace': 'Marketplace & requests',
  'pr.b.grp.matching': 'Matching',
  'pr.b.grp.scoring': 'Matching & scoring',
  'pr.b.grp.workflows': 'Operational workflows',
  'pr.b.grp.emergency': 'Emergency service & rate suggestions',
  'pr.b.grp.reputation': 'Reputation & ratings',
  'pr.b.grp.pulse': 'Pulse & SLA',
  'pr.b.grp.analytics': 'Analytics & tools',
  'pr.b.grp.security': 'Security & authentication',
  'pr.b.grp.individuell': 'Individual plan capabilities',
  'pr.b.grp.support': 'Support',

  'pr.b.f.marketplaceSearch': 'Browse the marketplace',
  'pr.b.f.requestsSend': 'Send requests',
  'pr.b.f.requestsReceive': 'Receive requests',
  'pr.b.f.offersCreate': 'Create offers',
  'pr.b.f.profileListing': 'Profile listing',
  'pr.b.f.visibility': 'Increased visibility',
  'pr.b.f.priorityPlacement': 'Priority placement',
  'pr.b.f.workersPerDeal': 'Workers per deal / request',
  'pr.b.f.exchangeSearch': 'Browse the exchange',
  'pr.b.f.interestDeals': 'Express interest / deals',
  'pr.b.f.trustBadges': 'Trust signals & badges',
  'pr.b.f.activityStats': 'Activity statistics',
  'pr.b.f.basicMatching': 'Basic matching (role, skills, location)',
  'pr.b.f.instantMatch': 'Instant match (13-factor scoring)',
  'pr.b.f.smartRanking': 'Smart ranking (AI-assisted signals)',
  'pr.b.f.explainableRanking': 'Explainable ranking (breakdown)',
  'pr.b.f.matchAlerts': 'Match alerts & notifications',
  'pr.b.f.preferredBoost': 'Preferred-first boost in matching',
  'pr.b.f.timesheets': 'Digital timesheets',
  'pr.b.f.arbzg': 'ArbZG break validation',
  'pr.b.f.signature': 'Digital signature',
  'pr.b.f.batchApproval': 'Batch approval (timesheets)',
  'pr.b.f.invoicing': 'Operational invoicing',
  'pr.b.f.invoiceKpi': 'Invoice KPI dashboard',
  'pr.b.f.csvExport': 'CSV export (invoices)',
  'pr.b.f.emergencyStaffing': 'Emergency staffing',
  'pr.b.f.urgencyModel': '5-level urgency model',
  'pr.b.f.autoEscalation': 'Auto escalation',
  'pr.b.f.smartPricing': 'Smart pricing (rate suggestions)',
  'pr.b.f.reputationScore': 'Reputation score & grade',
  'pr.b.f.supplierRatings': 'Supplier ratings',
  'pr.b.f.topSupplier': 'Top supplier leaderboard',
  'pr.b.f.persistentSearch': 'Persistent search agents',
  'pr.b.f.pulseTimer': 'Pulse timer',
  'pr.b.f.availability': 'Platform availability',
  'pr.b.f.individuellDashboard': 'Individual plan dashboard',
  'pr.b.f.complianceScorecard': 'Compliance indicator & scorecard',
  'pr.b.f.advancedAnalytics': 'Advanced analytics',
  'pr.b.f.mfa': 'MFA / TOTP (2-factor)',
  'pr.b.f.sso': 'SSO / SAML login',
  'pr.b.f.ssoAdmin': 'SSO admin configuration',
  'pr.b.f.ssoEnforce': 'Enforce SSO (block password login)',
  'pr.b.f.spMetadata': 'SP metadata & IDP integration',
  'pr.b.f.vendorPool': 'Vendor pool management',
  'pr.b.f.coverage': 'Preferred-first & coverage analysis',
  'pr.b.f.departments': 'Multiple departments & teams',
  'pr.b.f.approvalWorkflows': 'Approval workflows',
  'pr.b.f.contracts': 'Contract management',
  'pr.b.f.individuellReporting': 'Individual plan reporting & audit',
  'pr.b.f.emailSupport': 'Email support',
  'pr.b.f.prioritySupport': 'Prioritised support',
  'pr.b.f.dedicatedContact': 'Dedicated contact person',

  'pr.b.val.m5': '5 / month',
  'pr.b.val.m20': '20 / month',
  'pr.b.val.unlimited': 'Unlimited',
  'pr.b.val.e3': '3 listings',
  'pr.b.val.e20': '20 listings',
  'pr.b.val.bestEffort': 'Best effort',
  'pr.b.val.min120': '120 min',
  'pr.b.val.min60': '60 min',
  'pr.b.val.min30': '30 min',
  'pr.b.val.pct99': '99%',
  'pr.b.val.pct995': '99.5%',

  'pr.b.current.title': 'Current plan',
  'pr.b.history.title': 'Payment history',
  'pr.b.history.loading': 'Loading…',
  'pr.b.disclaimer': 'All prices are in EUR net plus statutory VAT. Note: the content is supportive in nature and does not replace a legal review. All information without warranty.',

  'pr.b.co.title': 'Complete subscription',
  'pr.b.co.methodLabel': 'Choose payment method',
  'pr.b.co.demoTitle': 'Demo mode active',
  'pr.b.co.demoText': 'In demo mode no real payment is processed. You get full access immediately.',
  'pr.b.co.demoBtn': 'Simulate payment and activate plan',
  'pr.b.co.stripeTitle': 'Stripe Checkout',
  'pr.b.co.stripeText': 'You will be redirected to Stripe to complete the payment securely. Supported methods: credit card, SEPA direct debit, Sofort, Giropay.',
  'pr.b.co.stripeInstant': 'You get full access immediately once the payment arrives.',
  'pr.b.co.stripeBtn': 'Continue to Stripe Checkout',
  'pr.b.co.cancelAnytime': 'You can cancel your subscription at any time.',

  'pr.b.dg.bountyStrong': 'Bounty discount',
  'pr.b.dg.bountyText1': ': you have earned',
  'pr.b.dg.bountyText2': '% bounty discount. On a downgrade all recurring bounties expire.',
  'pr.b.dg.cancel': 'Cancel',
  'pr.b.dg.continue': 'Continue anyway',
  'pr.b.dg.altSwitchStrong': 'Switch to a lower plan',
  'pr.b.dg.altSwitchText': 'instead of cancelling entirely – keep basic access and your reputation score.',
  'pr.b.dg.altUnhappyStrong': 'Not satisfied?',
  'pr.b.dg.altUnhappyText': 'Contact our',
  'pr.b.dg.altSupportLink': 'support team',
  'pr.b.dg.altUnhappyTail': '– we will find a solution.',
  'pr.b.dg.back': 'Back',
  'pr.b.dg.lastWarning': 'Final warning',
  'pr.b.dg.keep': 'Keep it after all',

  'pr.b.js.bountyCurrent': ' — your current discount: {pct}%',
  'pr.b.js.refPilotMonths': '{n} free months',
  'pr.b.js.refPilotRest': 'earned ({n} remaining). Refer more customers for more free months.',
  'pr.b.js.refDesc1': 'Refer customers and get',
  'pr.b.js.refDescStrong': 'money back',
  'pr.b.js.refDesc2': '— up to 6 months cashback.',
  'pr.b.js.refDescEarned': '{n} months earned',
  'pr.b.js.refStatFree': 'Free',
  'pr.b.js.refStatReferrals': 'Referrals',
  'pr.b.js.refStatCashback': 'Cashback',
  'pr.b.js.refStatMax': 'Max',

  'pr.b.js.plansLoading': 'Loading plans…',
  'pr.b.js.plansError': 'Plans could not be loaded.',
  'pr.b.js.retry': 'Try again',
  'pr.b.js.ctaIndividuell': 'Request individual plan',
  'pr.b.js.ctaDemo': 'Start demo',
  'pr.b.js.ctaChoosePlan': 'Choose plan',

  'pr.b.js.planLabel': 'Plan:',
  'pr.b.js.unlimitedUsage': 'Unlimited usage',
  'pr.b.js.requestsUsage': 'Requests: {used} / {limit}',
  'pr.b.js.listingsUsage': 'Listings: {used} / {limit}',
  'pr.b.js.notdienst': 'Emergency service: {value}',
  'pr.b.js.yes': 'Yes',
  'pr.b.js.no': 'No',
  'pr.b.js.termEnd': 'the end of the term',
  'pr.b.js.cancelPendingTitle': 'Cancellation scheduled',
  'pr.b.js.cancelPendingText': 'Active until {date}. Access remains available until then.',
  'pr.b.js.canceledTitle': 'Subscription cancelled',
  'pr.b.js.canceledText': 'Access has already been switched to DEMO.',
  'pr.b.js.individuellTitle': 'Individual plan',
  'pr.b.js.individuellText': 'Cancellation runs exclusively through the account team.',

  'pr.b.js.btnCancelSub': 'Cancel subscription',
  'pr.b.js.btnBillingRoles': 'Owner/admin/finance only',
  'pr.b.js.btnNoSub': 'No active subscription',
  'pr.b.js.btnCancelPending': 'Cancellation scheduled',
  'pr.b.js.btnRequestCancel': 'Request cancellation',

  'pr.b.js.lossCancel': 'This is what you lose when cancelling:',
  'pr.b.js.lossDowngrade': 'This is what you lose on a downgrade:',
  'pr.b.js.altCancel': 'Alternatives to cancelling',
  'pr.b.js.altDowngrade': 'Alternatives to a downgrade',
  'pr.b.js.confirmCancel': 'Confirm cancellation',
  'pr.b.js.confirmDowngrade': 'Confirm downgrade',
  'pr.b.js.execCancel': 'Schedule cancellation',
  'pr.b.js.execDowngrade': 'Downgrade now',
  'pr.b.js.tipLabel': 'Tip:',
  'pr.b.js.tipSwitchPre': 'Switch to',
  'pr.b.js.tipSwitchPost': '({price}/mo) instead of cancelling entirely.',
  'pr.b.js.dgTitleCancel': 'Cancel subscription',
  'pr.b.js.dgTitleDowngrade': 'Downgrade to {plan}',
  'pr.b.js.finalCancelDated': 'Your cancellation takes effect at the end of the term ({date}). Until then all premium functions stay active.',
  'pr.b.js.finalCancelPlain': 'Your cancellation takes effect at the end of the term. Until then all premium functions stay active.',
  'pr.b.js.finalDowngrade': 'Your plan will be downgraded to {plan}. Some features are deactivated immediately.',
  'pr.b.js.working': 'Processing…',

  'pr.b.js.alertCanceled': 'Subscription cancelled.',
  'pr.b.js.alertCancelDated': 'Cancellation scheduled for {date}.',
  'pr.b.js.alertCancelPlain': 'Cancellation scheduled.',
  'pr.b.js.alertPlanChanged': 'Plan changed: {plan}',
  'pr.b.js.errGeneric': 'Error',
  'pr.b.js.errUnknown': 'Unknown error',
  'pr.b.js.errPrefix': 'Error: {msg}',
  'pr.b.js.errPermission': 'Only owner/admin/finance can cancel.',
  'pr.b.js.errNoSub': 'No active subscription to cancel.',
  'pr.b.js.errAlreadyCanceling': 'Cancellation is already scheduled.',
  'pr.b.js.errManualCancel': 'An individual plan can only be cancelled through the account team.',
  'pr.b.js.confirmContact': '{msg} Get in touch now?',
  'pr.b.js.confirmIndividuellContact': 'An individual plan can only be cancelled through the account team. Get in touch?',

  'pr.b.js.onRequest': 'on request',
  'pr.b.js.perMonth': '/month',
  'pr.b.js.benefitBasis': 'More reach – find suitable partners faster.',
  'pr.b.js.benefitPlus': 'Even more reach – ideal for active matching.',
  'pr.b.js.benefitPro': 'Maximum visibility with pulse emergency service and prioritised matching.',
  'pr.b.js.payDemoLabel': 'Demo payment',
  'pr.b.js.payDemoDesc': 'Test payment without real money',
  'pr.b.js.payStripeLabel': 'Credit card / SEPA / Klarna / Sofort',
  'pr.b.js.payStripeDesc': 'Credit card, SEPA, Sofort, Giropay',
  'pr.b.js.payStripeSoon': 'via Stripe (coming soon)',
  'pr.b.js.payPaypalDesc': 'Pay with PayPal',
  'pr.b.js.paySoon': '(coming soon)',

  'pr.b.js.checkoutCreating': 'Creating checkout…',
  'pr.b.js.checkoutDemo': 'Demo mode – activating subscription…',
  'pr.b.js.checkoutActivated': 'Subscription activated. Reloading page…',
  'pr.b.js.checkoutStripe': 'Redirecting to Stripe®',
  'pr.b.js.checkoutPaypal': 'Redirecting to PayPal®',

  'pr.b.js.noPayments': 'No payments yet.',
  'pr.b.js.historyLoadError': 'Could not load.',
  'pr.b.js.thDate': 'Date',
  'pr.b.js.thPlan': 'Plan',
  'pr.b.js.thAmount': 'Amount',
  'pr.b.js.thMethod': 'Method',
  'pr.b.js.thStatus': 'Status'
});

/* ── Bounty-Teaser Widget ──────────────────────────── */
    (function(){
      var teaserData = null;
      function render(d){
        document.getElementById('bountyTeaser').style.display='block';
        if(d.discount_pct>0){
          var el=document.getElementById('bountyTeaserCurrent');
          el.style.display='inline';
          el.textContent=TCi18n.t('pr.b.js.bountyCurrent',{pct:d.discount_pct});
        }
      }
      fetch('/api/bounties/discount',{credentials:'include'}).then(function(r){return r.ok?r.json():null}).then(function(d){
        if(!d)return;
        teaserData=d;
        render(d);
      }).catch(function(){});
      document.addEventListener('tc:langchange',function(){ if(teaserData) render(teaserData); });
    })();

/* ── Referral-Banner Widget ────────────────────────── */
    (function(){
      function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
      var refData = null;
      function render(d){
        document.getElementById('slaRefBanner').style.display='block';
        var desc=document.getElementById('slaRefDesc');
        var stats=document.getElementById('slaRefStats');

        // Code anzeigen
        if(d.referral_code){
          document.getElementById('slaRefCodeRow').style.display='flex';
          document.getElementById('slaRefCode').textContent=d.referral_code;
        }

        if(d.is_pilot){
          document.getElementById('slaRefPilotBadge').style.display='inline';
          desc.innerHTML='<strong>'+esc(TCi18n.t('pr.b.js.refPilotMonths',{n:d.free_months_total}))+'</strong> '+
            esc(TCi18n.t('pr.b.js.refPilotRest',{n:d.free_months_remaining}));
          stats.innerHTML='<div style="text-align:center"><div style="font-size:22px;font-weight:900;color:var(--ds-success)">'+esc(d.free_months_total)+'</div><div style="font-size:10px;color:var(--ds-text-tertiary)">'+esc(TCi18n.t('pr.b.js.refStatFree'))+'</div></div>'+
            '<div style="text-align:center"><div style="font-size:22px;font-weight:900;color:var(--ds-brand)">'+esc(d.active_referrals)+'/6</div><div style="font-size:10px;color:var(--ds-text-tertiary)">'+esc(TCi18n.t('pr.b.js.refStatReferrals'))+'</div></div>';
        } else {
          desc.innerHTML=esc(TCi18n.t('pr.b.js.refDesc1'))+' <strong>'+esc(TCi18n.t('pr.b.js.refDescStrong'))+'</strong> '+
            esc(TCi18n.t('pr.b.js.refDesc2'))+' <span style="color:var(--ds-accent);font-weight:600">'+
            esc(TCi18n.t('pr.b.js.refDescEarned',{n:d.cashback_months_earned}))+'</span>';
          stats.innerHTML='<div style="text-align:center"><div style="font-size:22px;font-weight:900;color:var(--ds-accent)">'+esc(d.cashback_months_earned)+'</div><div style="font-size:10px;color:var(--ds-text-tertiary)">'+esc(TCi18n.t('pr.b.js.refStatCashback'))+'</div></div>'+
            '<div style="text-align:center"><div style="font-size:22px;font-weight:900;color:var(--ds-text-tertiary)">6</div><div style="font-size:10px;color:var(--ds-text-tertiary)">'+esc(TCi18n.t('pr.b.js.refStatMax'))+'</div></div>';
        }
      }
      fetch('/api/referral/status',{credentials:'include'}).then(function(r){return r.ok?r.json():null}).then(function(d){
        if(!d)return;
        refData=d;
        render(d);
      }).catch(function(){});
      document.addEventListener('tc:langchange',function(){ if(refData) render(refData); });
    })();

/* ── Main SLA/Abo Logic ────────────────────── */
/**
 * Ab Welle 8 Schritt 13 nutzt diese Datei den Shared-Renderer
 * `TC.catalog` aus `frontend/public/js/catalogRenderer.js`.
 * Plan-Preise, Plan-Features und Vergleichstabelle kommen aus
 * `GET /api/public/catalog` — keine Hardcodes mehr.
 *
 * Nicht angefasst: Checkout-Flow, Cancel-Logik (live-State + Org-Rolle),
 * Payment-History-Datenwerte.
 */
  (function(){
    var API = "/api";
    var PLAN_ORDER = ["DEMO", "BASIS", "PLUS", "PRO", "INDIVIDUELL"];

    function R() { return (window.TC && window.TC.catalog) ? window.TC.catalog : null; }
    function t(key, params) { return TCi18n.t(key, params); }

    var catalog = null;            // Snapshot aus /api/public/catalog
    var catalogError = null;       // Fehler beim Laden (UI rendert Fallback)
    var paymentConfig = null;
    var currentPlan = "DEMO";
    var selectedPlan = null;
    var selectedMethod = null;
    var meData = null;
    var BILLING_ROLES = ["owner", "admin", "finance", "platform_admin"];

    function getPlanCents(planKey) {
      var p = R() && R().findPlan(catalog, planKey);
      return p ? p.monthly_price_cents : null;
    }
    function getPlanLabel(planKey) {
      var p = R() && R().findPlan(catalog, planKey);
      if (p && (p.display_label || p.label)) return p.display_label || p.label;
      return planKey;
    }
    function getPlanInterval(planKey) {
      var p = R() && R().findPlan(catalog, planKey);
      return p ? R().intervalLabel(p) : "";
    }

    function getSubscription() {
      return (meData && meData.subscription) ? meData.subscription : null;
    }

    function updateCancelButton() {
      var btn = document.getElementById("btnCancelSub");
      if (!btn) return;
      btn.onclick = null;
      btn.disabled = false;
      btn.style.opacity = "";
      btn.style.cursor = "";
      if (!meData) {
        btn.disabled = true;
        btn.textContent = t('pr.b.js.btnCancelSub');
        return;
      }
      if (!hasBillingAccess()) {
        btn.disabled = true;
        btn.textContent = t('pr.b.js.btnBillingRoles');
        return;
      }
      if (currentPlan === "DEMO") {
        btn.disabled = true;
        btn.textContent = t('pr.b.js.btnNoSub');
        return;
      }
      if (isCanceling()) {
        btn.disabled = true;
        btn.textContent = t('pr.b.js.btnCancelPending');
        return;
      }
      if (isIndividuellContract()) {
        btn.textContent = t('pr.b.js.btnRequestCancel');
        btn.onclick = function() { window.cancelSubscription(); };
        return;
      }
      btn.textContent = t('pr.b.js.btnCancelSub');
      btn.onclick = function() { window.cancelSubscription(); };
    }

    function hasBillingAccess() {
      return !!(meData && BILLING_ROLES.indexOf(meData.org_role) !== -1);
    }

    function formatDate(value) {
      if (!value) return null;
      var d = new Date(value);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleDateString(TCi18n.dateLocale());
    }

    function getCancelPreviewDate() {
      var sub = getSubscription();
      return formatDate(sub && (sub.cancel_at || sub.current_period_end));
    }

    function isCanceling() {
      var sub = getSubscription();
      return !!(sub && sub.status === "canceling");
    }

    function isIndividuellContract() {
      if (currentPlan !== "INDIVIDUELL") return false;
      var billingMode = meData && meData.pilot ? meData.pilot.billing_mode : null;
      return billingMode !== "pilot_contract";
    }

    function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
    function idempotencyKey() {
      try { return (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : "x-" + Math.random().toString(36).slice(2) + "-" + Date.now(); }
      catch(e) { return "x-" + Math.random().toString(36).slice(2) + "-" + Date.now(); }
    }
    function getCsrf() { return fetch(API + "/csrf", { credentials: "include" }).then(function(r) { return r.ok ? r.json() : null; }); }
    function apiCall(path, opts) {
      opts = opts || {};
      var method = opts.method || "GET";
      var headers = { "Content-Type": "application/json" };
      if (["POST","PATCH","PUT","DELETE"].indexOf(method) >= 0) {
        headers["X-CSRF-Token"] = opts.csrf || "";
        headers["Idempotency-Key"] = idempotencyKey();
      }
      return fetch(API + path, { method: method, headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: "include" });
    }
    function normalizePlanParam(plan) {
      var p = String(plan || "").toUpperCase();
      if (p === "FREE") p = "DEMO";
      if (p === "ENTERPRISE" || p === "INDIVIDUAL") p = "INDIVIDUELL";
      return p || null;
    }
    function getIndividuellFormUrl() {
      var params = new URLSearchParams();
      params.set("source", "sla_abo");
      params.set("plan", "INDIVIDUELL");
      params.set("intent", "upgrade");
      params.set("return_to", "/public/sla_abo.html");
      if (currentPlan) params.set("current_plan", currentPlan);
      return "/public/enterprise_anfrage.html?" + params.toString();
    }

    function focusPlanCard(planKey) {
      var card = document.querySelector(".plan-card[data-plan='" + planKey + "']");
      if (!card) return;
      card.classList.add("plan-card--highlight");
      try { card.scrollIntoView({ behavior: "smooth", block: "center" }); }
      catch (e) { card.scrollIntoView(); }
      setTimeout(function() { card.classList.remove("plan-card--highlight"); }, 2800);
    }

    function clearPlanParam() {
      if (!urlParams.get("plan")) return;
      var url = new URL(window.location.href);
      url.searchParams.delete("plan");
      window.history.replaceState({}, "", url.pathname + url.search);
    }

    function maybePreselectPlan() {
      if (!preselectPlan) return;
      if (PLAN_ORDER.indexOf(preselectPlan) === -1) return;
      focusPlanCard(preselectPlan);
      if (!meData) { clearPlanParam(); return; }
      var targetIdx = PLAN_ORDER.indexOf(preselectPlan);
      var currentIdx = PLAN_ORDER.indexOf(currentPlan);
      if (targetIdx <= currentIdx) { clearPlanParam(); return; }
      if (preselectPlan === "INDIVIDUELL") { clearPlanParam(); return; }
      window._setPlan(preselectPlan);
      clearPlanParam();
    }

    /* -- URL params (success/cancel from Stripe redirect) -- */
    var urlParams = new URLSearchParams(window.location.search);
    var preselectPlan = normalizePlanParam(urlParams.get("plan"));
    if (urlParams.get("payment") === "success") {
      document.getElementById("successBanner").style.display = "block";
      window.history.replaceState({}, "", "/public/sla_abo.html");
    }
    if (urlParams.get("payment") === "cancelled") {
      document.getElementById("cancelBanner").style.display = "block";
      window.history.replaceState({}, "", "/public/sla_abo.html");
    }

    /* -- Render Plan Grid via Shared-Renderer (Catalog) -- */
    function renderPlans() {
      var grid = document.getElementById("planGrid");
      if (!grid) return;
      var renderer = R();
      var plans = (catalog && Array.isArray(catalog.plans)) ? catalog.plans : [];

      if (!renderer || !plans.length) {
        if (catalogError) {
          grid.innerHTML = '<div class="empty-block">' + esc(t('pr.b.js.plansError')) + ' ' +
            '<button type="button" class="ds-btn ds-btn--sm" style="margin-left:8px" onclick="location.reload()">' +
            esc(t('pr.b.js.retry')) + '</button></div>';
        } else {
          grid.innerHTML = '<div class="empty-block">' + esc(t('pr.b.js.plansLoading')) + '</div>';
        }
        return;
      }

      grid.innerHTML = plans
        .slice()
        .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); })
        .map(function (plan) {
          var isCurrent = currentPlan === plan.key;
          var cta;
          if (isCurrent) {
            cta = null; // Renderer rendert disabled "Aktuell"-Knopf bei isCurrent.
          } else if (plan.key === "INDIVIDUELL") {
            cta = meData ? {
              onclick: "window.TC && window.TC.accountSubscription && window.TC.accountSubscription.requestUpgrade('INDIVIDUELL')",
              label: t('pr.b.js.ctaIndividuell'),
              primary: true
            } : {
              href: getIndividuellFormUrl(),
              label: t('pr.b.js.ctaIndividuell'),
              primary: true
            };
          } else if (plan.key === "DEMO") {
            cta = { href: "/demo.html", label: t('pr.b.js.ctaDemo') };
          } else {
            cta = {
              onclick: "window._setPlan('" + plan.key + "')",
              label: t('pr.b.js.ctaChoosePlan'),
              primary: plan.key === "PLUS"
            };
          }
          return renderer.renderPlanCard(plan, {
            highlights: renderer.planHighlights(catalog, plan.key, 6),
            isCurrent: isCurrent,
            isCanceling: isCurrent && isCanceling(),
            cta: cta
          });
        }).join("");
    }

    /* -- Aktueller Plan Info -- */
    function renderCurrentPlan() {
      var el = document.getElementById("currentPlanInfo");
      if (!meData) { el.innerHTML = "<span style='color:var(--ds-text-secondary)'>-</span>"; updateCancelButton(); return; }
      var displayPlan = meData.plan || "DEMO";
      if (displayPlan === "FREE") displayPlan = "DEMO";
      // Plan-Anzeigelabel bleibt bewusst bei PlanFeatures (fremde Quelle).
      var displayLabel = (window.PlanFeatures && typeof window.PlanFeatures.getDisplayPlanLabel === "function")
        ? window.PlanFeatures.getDisplayPlanLabel(displayPlan)
        : (displayPlan === "INDIVIDUELL" ? "Individueller Tarif" : displayPlan);
      var html = "<div style='font-size:14px'>" + esc(t('pr.b.js.planLabel')) + " <b>" + esc(displayLabel) + "</b></div>";
      if (meData.limits) {
        html += "<div style='margin-top:var(--ds-space-2);font-size:13px;color:var(--ds-text-secondary)'>";
        if (meData.limits.requests_send === -1) {
          html += esc(t('pr.b.js.unlimitedUsage'));
        } else {
          html += esc(t('pr.b.js.requestsUsage', {
            used: meData.usage ? meData.usage.sent_count : 0,
            limit: meData.limits.requests_send
          }));
          html += "<br/>" + esc(t('pr.b.js.listingsUsage', {
            used: meData.usage ? meData.usage.listings_count : 0,
            limit: meData.limits.listings
          }));
        }
        html += "<br/>" + esc(t('pr.b.js.notdienst', { value: meData.limits.notdienst ? t('pr.b.js.yes') : t('pr.b.js.no') }));
        html += "</div>";
      }
      var sub = getSubscription();
      if (sub && sub.status === "canceling") {
        var cancelLabel = getCancelPreviewDate() || t('pr.b.js.termEnd');
        html += "<div style='margin-top:var(--ds-space-3);padding:var(--ds-space-3);border-radius:var(--ds-radius-md);border:1px solid rgba(255,204,0,.35);background:rgba(255,204,0,.08);font-size:12px;color:var(--ds-text-secondary)'>";
        html += "<strong style='color:#ffe680'>" + esc(t('pr.b.js.cancelPendingTitle')) + "</strong><br/>" +
          esc(t('pr.b.js.cancelPendingText', { date: cancelLabel }));
        html += "</div>";
      } else if (sub && sub.status === "canceled") {
        html += "<div style='margin-top:var(--ds-space-3);padding:var(--ds-space-3);border-radius:var(--ds-radius-md);border:1px solid rgba(255,92,122,.35);background:rgba(255,92,122,.08);font-size:12px;color:var(--ds-text-secondary)'>";
        html += "<strong style='color:#ffd0d8'>" + esc(t('pr.b.js.canceledTitle')) + "</strong><br/>" + esc(t('pr.b.js.canceledText'));
        html += "</div>";
      }
      if (isIndividuellContract()) {
        html += "<div style='margin-top:var(--ds-space-3);padding:var(--ds-space-3);border-radius:var(--ds-radius-md);border:1px solid rgba(124,92,255,.35);background:rgba(124,92,255,.08);font-size:12px;color:var(--ds-text-secondary)'>";
        html += "<strong style='color:var(--ds-accent)'>" + esc(t('pr.b.js.individuellTitle')) + "</strong><br/>" + esc(t('pr.b.js.individuellText'));
        html += "</div>";
      }
      el.innerHTML = html;
      updateCancelButton();
    }

    /* -- Downgrade Warning Logic (LOSS_MAP dynamisch aus Catalog) -- */
    var dgTargetPlan = null;
    var dgIsCancel = false;
    var dgOpen = false;

    /**
     * Liefert Feature-Verluste beim Downgrade dynamisch aus dem Catalog.
     * Quelle: catalog.features[].included_in_plans (visible_in_pricing=true).
     * Fallback: leere Liste — niemals statische Hardcodes mehr.
     */
    function getDowngradeLosses(fromPlan, toPlan) {
      if (!R()) return [];
      var losses = R().deriveDowngradeLosses(catalog, fromPlan, toPlan);
      return losses.map(function (l) { return l.name; });
    }

    /** Alle sprachabhaengigen Texte des Downgrade-Dialogs setzen — ohne den
     *  aktuellen Schritt oder die Sichtbarkeit zu veraendern, damit ein
     *  Sprachwechsel den Nutzer nicht aus Schritt 2/3 zurueckwirft. */
    function applyDowngradeTexts() {
      var losses = getDowngradeLosses(currentPlan, dgTargetPlan);
      var list = document.getElementById('dgLossList');
      if (list) list.innerHTML = losses.map(function(l) { return '<li style="padding:2px 0">' + esc(l) + '</li>'; }).join('');
      var lossTitle = document.getElementById('dgLossTitle');
      var altTitle = document.getElementById('dgAltTitle');
      var step2Btn = document.getElementById('dgStep2ConfirmBtn');
      var confirmBtn = document.getElementById('dgConfirmBtn');
      if (lossTitle) lossTitle.textContent = dgIsCancel ? t('pr.b.js.lossCancel') : t('pr.b.js.lossDowngrade');
      if (altTitle) altTitle.textContent = dgIsCancel ? t('pr.b.js.altCancel') : t('pr.b.js.altDowngrade');
      if (step2Btn) step2Btn.textContent = dgIsCancel ? t('pr.b.js.confirmCancel') : t('pr.b.js.confirmDowngrade');
      if (confirmBtn) confirmBtn.textContent = dgIsCancel ? t('pr.b.js.execCancel') : t('pr.b.js.execDowngrade');

      // Alt suggestion (Preis dynamisch aus Catalog)
      var altEl = document.getElementById('dgAltSuggestion');
      if (altEl) {
        if (dgTargetPlan === 'DEMO' && PLAN_ORDER.indexOf(currentPlan) >= 2) {
          var basisCents = getPlanCents('BASIS');
          var basisLabel = (R() ? R().fmtCents(basisCents) : null) || '150 EUR';
          altEl.innerHTML = '<strong>' + esc(t('pr.b.js.tipLabel')) + '</strong> ' + esc(t('pr.b.js.tipSwitchPre')) +
            ' <b>BASIS</b> ' + esc(t('pr.b.js.tipSwitchPost', { price: basisLabel }));
        } else {
          altEl.innerHTML = '';
        }
      }

      var titleEl = document.getElementById('dgTitle');
      if (titleEl) titleEl.textContent = dgIsCancel ? t('pr.b.js.dgTitleCancel') : t('pr.b.js.dgTitleDowngrade', { plan: getPlanLabel(dgTargetPlan) });
      var cancelDateLabel = getCancelPreviewDate();
      var finalEl = document.getElementById('dgFinalText');
      if (finalEl) {
        finalEl.textContent = dgIsCancel
          ? (cancelDateLabel ? t('pr.b.js.finalCancelDated', { date: cancelDateLabel }) : t('pr.b.js.finalCancelPlain'))
          : t('pr.b.js.finalDowngrade', { plan: getPlanLabel(dgTargetPlan) });
      }
    }

    function showDowngradeWarning(targetPlan, isCancel) {
      dgTargetPlan = targetPlan;
      dgIsCancel = isCancel;
      applyDowngradeTexts();
      // Bounty warning
      fetch('/api/bounties/discount', { credentials: 'include' }).then(function(r) { return r.ok ? r.json() : null; }).then(function(d) {
        // Der Endpunkt liefert `discount_pct`, nicht `total_discount_pct` (siehe
        // routes/bounties.js). Der falsche Feldname liess die Warnung nie
        // erscheinen — 20 Zeilen weiter oben liest dieselbe Datei es richtig.
        if (d && d.discount_pct > 0) {
          document.getElementById('dgBountyWarn').style.display = 'block';
          document.getElementById('dgBountyPct').textContent = d.discount_pct;
        } else {
          document.getElementById('dgBountyWarn').style.display = 'none';
        }
      }).catch(function() {});
      window.dgShowStep(1);
      dgOpen = true;
      document.getElementById('downgradeModal').style.display = 'grid';
    }

    window.dgShowStep = function(step) {
      document.getElementById('dgStep1').style.display = step === 1 ? 'block' : 'none';
      document.getElementById('dgStep2').style.display = step === 2 ? 'block' : 'none';
      document.getElementById('dgStep3').style.display = step === 3 ? 'block' : 'none';
    };
    window.closeDowngrade = function() {
      document.getElementById('downgradeModal').style.display = 'none';
      dgOpen = false;
      dgTargetPlan = null;
    };
    window.dgExecute = function() {
      document.getElementById('dgConfirmBtn').disabled = true;
      document.getElementById('dgConfirmBtn').textContent = t('pr.b.js.working');
      var plan = dgIsCancel ? 'DEMO' : dgTargetPlan;
      var accountActions = window.TC && window.TC.accountSubscription ? window.TC.accountSubscription : null;
      if (accountActions && (dgIsCancel ? accountActions.requestCancellation : accountActions.requestDowngrade)) {
        var directPromise = dgIsCancel ? accountActions.requestCancellation() : accountActions.requestDowngrade(plan);
        Promise.resolve(directPromise).then(function(result) {
          document.getElementById('dgConfirmBtn').disabled = false;
          document.getElementById('dgConfirmBtn').textContent = dgIsCancel ? t('pr.b.js.execCancel') : t('pr.b.js.execDowngrade');
          if (result !== false) window.closeDowngrade();
        }).catch(function() {
          document.getElementById('dgConfirmBtn').disabled = false;
          document.getElementById('dgConfirmBtn').textContent = dgIsCancel ? t('pr.b.js.execCancel') : t('pr.b.js.execDowngrade');
        });
        return;
      }
      getCsrf().then(function(csrf) {
        var token = csrf && (csrf.csrfToken || csrf.token);
        return dgIsCancel
          ? apiCall('/me/plan/cancel', { method: 'POST', csrf: token })
          : apiCall('/me/plan', { method: 'POST', csrf: token, body: { plan: plan } });
      }).then(function(r) {
        if (!r.ok) return r.json().then(function(e) {
          var err = new Error(e.message || e.error || t('pr.b.js.errGeneric'));
          err.code = e.error || null;
          err.details = e || null;
          throw err;
        });
        return r.json();
      }).then(function(me) {
        meData = me;
        currentPlan = me.plan || 'DEMO';
        renderPlans();
        renderCurrentPlan();
        window.closeDowngrade();
        if (dgIsCancel) {
          if (currentPlan === 'DEMO') {
            alert(t('pr.b.js.alertCanceled'));
          } else {
            var cancelDate = me && me.subscription ? formatDate(me.subscription.cancel_at) : null;
            alert(cancelDate ? t('pr.b.js.alertCancelDated', { date: cancelDate }) : t('pr.b.js.alertCancelPlain'));
          }
        } else {
          alert(t('pr.b.js.alertPlanChanged', { plan: currentPlan }));
        }
      }).catch(function(e) {
        var msg = e && e.message ? e.message : t('pr.b.js.errUnknown');
        if (e && e.code === 'PERMISSION_DENIED') msg = t('pr.b.js.errPermission');
        if (e && e.code === 'NO_ACTIVE_SUBSCRIPTION') msg = t('pr.b.js.errNoSub');
        if (e && e.code === 'ALREADY_CANCELING') msg = t('pr.b.js.errAlreadyCanceling');
        if (e && e.code === 'MANUAL_CANCELLATION_REQUIRED') {
          msg = t('pr.b.js.errManualCancel');
          if (e.details && e.details.support_url) {
            if (confirm(t('pr.b.js.confirmContact', { msg: msg }))) {
              window.location.href = e.details.support_url;
              return;
            }
          }
        }
        alert(t('pr.b.js.errPrefix', { msg: msg }));
        document.getElementById('dgConfirmBtn').disabled = false;
        document.getElementById('dgConfirmBtn').textContent = dgIsCancel ? t('pr.b.js.execCancel') : t('pr.b.js.execDowngrade');
      });
    };

    /* -- Checkout Modal -- */
    window._setPlan = function(planKey) {
      var targetIdx = PLAN_ORDER.indexOf(planKey);
      var currentIdx = PLAN_ORDER.indexOf(currentPlan);
      // Downgrade detection
      if (targetIdx < currentIdx) {
        showDowngradeWarning(planKey, false);
        return;
      }
      if (planKey === "DEMO") {
        showDowngradeWarning('DEMO', false);
        return;
      }
      // Individueller Tarif.
      if (planKey === "INDIVIDUELL") {
        // Self-Service: eingeloggt + Stripe live → in den Konfigurator leiten
        // (deterministischer Preis + Direktbuchung; der Server entscheidet
        // Stripe-Checkout vs. freigabepflichtige Anfrage).
        var stripeSelfService = !!(paymentConfig && paymentConfig.stripe_enabled && paymentConfig.mode !== "demo");
        if (meData && stripeSelfService) {
          window.location.href = getIndividuellFormUrl();
          return;
        }
        // Fallback (kein Stripe / Demo): heutige staff-vermittelte Upgrade-Anfrage.
        if (meData && window.TC && window.TC.accountSubscription && window.TC.accountSubscription.requestUpgrade) {
          window.TC.accountSubscription.requestUpgrade("INDIVIDUELL");
          return;
        }
        window.location.href = getIndividuellFormUrl();
        return;
      }
      openCheckout(planKey);
    };

    function openCheckout(planKey) {
      selectedPlan = planKey;
      selectedMethod = null;
      var renderer = R();
      var label = getPlanLabel(planKey);
      var priceLabel = renderer ? (renderer.fmtCents(getPlanCents(planKey)) || t('pr.b.js.onRequest')) : (planKey + " " + t('pr.b.js.onRequest'));
      var benefit = planKey === "BASIS" ? t('pr.b.js.benefitBasis')
        : planKey === "PLUS" ? t('pr.b.js.benefitPlus')
        : planKey === "PRO" ? t('pr.b.js.benefitPro') : "";

      document.getElementById("checkoutPlanInfo").innerHTML =
        "<div style='display:flex;justify-content:space-between;align-items:center'>" +
        "<div><b style='font-size:18px'>" + esc(label) + "</b>" +
        (benefit ? "<div style='font-size:13px;color:var(--ds-success);margin-top:4px'>" + esc(benefit) + "</div>" : "") + "</div>" +
        "<div style='font-size:24px;font-weight:900'>" + esc(priceLabel) + "<span style='font-size:12px;color:var(--ds-text-secondary)'>" + esc(t('pr.b.js.perMonth')) + "</span></div>" +
        "</div>";

      // Build payment method buttons
      var methods = [
        { key: "demo", icon: "&#128176;", label: t('pr.b.js.payDemoLabel'), desc: t('pr.b.js.payDemoDesc'), enabled: true },
        { key: "stripe", icon: "&#128179;", label: t('pr.b.js.payStripeLabel'), desc: paymentConfig && paymentConfig.stripe_enabled ? t('pr.b.js.payStripeDesc') : t('pr.b.js.payStripeSoon'), enabled: !!(paymentConfig && paymentConfig.stripe_enabled) },
        { key: "paypal", icon: "&#128176;", label: "PayPal", desc: paymentConfig && paymentConfig.paypal_enabled ? t('pr.b.js.payPaypalDesc') : t('pr.b.js.paySoon'), enabled: !!(paymentConfig && paymentConfig.paypal_enabled) }
      ];
      var container = document.getElementById("paymentMethods");
      container.innerHTML = "";
      methods.forEach(function(m) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "payment-btn";
        btn.disabled = !m.enabled;
        btn.dataset.method = m.key;
        btn.innerHTML = "<span style='font-size:20px'>" + m.icon + "</span><div style='text-align:left'><b>" + esc(m.label) + "</b><div style='margin:0;font-size:12px;color:var(--ds-text-secondary)'>" + esc(m.desc) + "</div></div>";
        btn.onclick = function() { selectMethod(m.key); };
        container.appendChild(btn);
      });

      document.getElementById("checkoutDemoSection").style.display = "none";
      document.getElementById("checkoutStripeSection").style.display = "none";
      document.getElementById("checkoutStatus").style.display = "none";
      document.getElementById("checkoutModal").style.display = "grid";
    }

    function selectMethod(method) {
      selectedMethod = method;
      document.querySelectorAll(".payment-btn").forEach(function(b) { b.classList.remove("active"); });
      var active = document.querySelector(".payment-btn[data-method='" + method + "']");
      if (active) active.classList.add("active");
      document.getElementById("checkoutDemoSection").style.display = method === "demo" ? "block" : "none";
      document.getElementById("checkoutStripeSection").style.display = method === "stripe" ? "block" : "none";
    }

    window.closeCheckout = function() {
      document.getElementById("checkoutModal").style.display = "none";
      selectedPlan = null;
      selectedMethod = null;
    };

    function doCheckout(method) {
      if (!selectedPlan) return;
      var statusEl = document.getElementById("checkoutStatus");
      statusEl.style.display = "block";
      statusEl.textContent = t('pr.b.js.checkoutCreating');
      var demoBtn = document.getElementById("btnDemoConfirm");
      var stripeBtn = document.getElementById("btnStripeCheckout");
      if (demoBtn) demoBtn.disabled = true;
      if (stripeBtn) stripeBtn.disabled = true;

      getCsrf().then(function(csrf) {
        var token = csrf && (csrf.csrfToken || csrf.token);
        return apiCall("/payment/checkout", { method: "POST", csrf: token, body: { plan: selectedPlan, payment_method: method } });
      }).then(function(r) {
        if (!r.ok) return r.json().then(function(err) { throw new Error(err.error || "CHECKOUT_ERROR"); });
        return r.json();
      }).then(function(data) {
        if (data.mode === "demo") {
          statusEl.textContent = t('pr.b.js.checkoutDemo');
          return getCsrf().then(function(csrf) {
            var token = csrf && (csrf.csrfToken || csrf.token);
            return apiCall("/payment/confirm", { method: "POST", csrf: token, body: { checkout_id: data.checkout_id } });
          }).then(function(r) {
            if (!r.ok) throw new Error("CONFIRM_FAILED");
            return r.json();
          }).then(function(result) {
            statusEl.textContent = t('pr.b.js.checkoutActivated');
            setTimeout(function() { window.location.href = "/public/sla_abo.html"; }, 1500);
          });
        }
        if (data.mode === "stripe" && data.redirect_url) {
          statusEl.textContent = t('pr.b.js.checkoutStripe');
          window.location.href = data.redirect_url;
          return;
        }
        if (data.mode === "paypal" && data.redirect_url) {
          statusEl.textContent = t('pr.b.js.checkoutPaypal');
          window.location.href = data.redirect_url;
          return;
        }
        throw new Error("UNKNOWN_MODE");
      }).catch(function(err) {
        statusEl.textContent = t('pr.b.js.errPrefix', { msg: err.message || t('pr.b.js.errUnknown') });
        if (demoBtn) demoBtn.disabled = false;
        if (stripeBtn) stripeBtn.disabled = false;
      });
    }

    document.getElementById("btnDemoConfirm").onclick = function() { doCheckout("demo"); };
    document.getElementById("btnStripeCheckout").onclick = function() { doCheckout("stripe"); };

    /* -- Cancel Subscription (via downgrade warning) -- */
    window.cancelSubscription = function() {
      if (!meData) return;
      if (!hasBillingAccess()) {
        alert(t('pr.b.js.errPermission'));
        return;
      }
      if (currentPlan === 'DEMO') {
        alert(t('pr.b.js.errNoSub'));
        return;
      }
      if (isCanceling()) {
        alert(t('pr.b.js.errAlreadyCanceling'));
        return;
      }
      if (isIndividuellContract()) {
        if (window.TC && window.TC.accountSubscription && window.TC.accountSubscription.requestCancellation) {
          showDowngradeWarning('DEMO', true);
          return;
        }
        if (confirm(t('pr.b.js.confirmIndividuellContact'))) {
          window.location.href = '/public/enterprise_anfrage.html';
        }
        return;
      }
      showDowngradeWarning('DEMO', true);
    };

    /* -- Payment History -- */
    function loadHistory() {
      apiCall("/payment/history").then(function(r) {
        if (!r.ok) return [];
        return r.json();
      }).then(function(rows) {
        var el = document.getElementById("paymentHistory");
        if (!Array.isArray(rows) || rows.length === 0) {
          el.innerHTML = "<p style='color:var(--ds-text-secondary);font-size:13px'>" + esc(t('pr.b.js.noPayments')) + "</p>";
          return;
        }
        var html = "<table class='history-table'><thead><tr>" +
          "<th>" + esc(t('pr.b.js.thDate')) + "</th>" +
          "<th>" + esc(t('pr.b.js.thPlan')) + "</th>" +
          "<th>" + esc(t('pr.b.js.thAmount')) + "</th>" +
          "<th>" + esc(t('pr.b.js.thMethod')) + "</th>" +
          "<th>" + esc(t('pr.b.js.thStatus')) + "</th></tr></thead><tbody>";
        rows.forEach(function(r) {
          var date = r.created_at ? new Date(r.created_at).toLocaleDateString(TCi18n.dateLocale()) : "–";
          var statusCls = r.status === "completed" ? "color:var(--ds-success)" : r.status === "failed" ? "color:var(--ds-error)" : "color:var(--ds-warning)";
          var planLabel = (window.PlanFeatures && typeof window.PlanFeatures.getDisplayPlanLabel === "function")
            ? window.PlanFeatures.getDisplayPlanLabel(r.plan)
            : (r.plan === "INDIVIDUELL" ? "Individueller Tarif" : r.plan);
          html += "<tr><td>" + esc(date) + "</td><td>" + esc(planLabel) + "</td><td>" + r.amount + " EUR</td><td>" + esc(r.method) + "</td><td style='" + statusCls + "'>" + esc(r.status) + "</td></tr>";
        });
        html += "</tbody></table>";
        el.innerHTML = html;
      }).catch(function() {
        document.getElementById("paymentHistory").innerHTML = "<p style='color:var(--ds-text-secondary);font-size:13px'>" + esc(t('pr.b.js.historyLoadError')) + "</p>";
      });
    }

    /* Sprachwechsel: die per innerHTML/textContent gebauten Flaechen (Plan-Grid,
       Aktueller-Plan-Karte, Kuendigen-Knopf, Zahlungshistorie, offene Dialoge)
       traegt die deklarative Hydration nicht — sie werden hier gezielt neu
       aufgebaut, ohne den Dialog-Schritt oder die Methodenwahl zu verlieren. */
    document.addEventListener('tc:langchange', function () {
      renderPlans();
      renderCurrentPlan();
      loadHistory();
      if (dgOpen) applyDowngradeTexts();
      var checkout = document.getElementById('checkoutModal');
      if (checkout && checkout.style.display === 'grid' && selectedPlan) {
        var keepMethod = selectedMethod;
        openCheckout(selectedPlan);
        if (keepMethod) selectMethod(keepMethod);
      }
    });

    /* -- Init -- */
    function loadCatalogSafe() {
      if (!R()) {
        catalogError = new Error("catalogRenderer fehlt (TC.catalog)");
        return Promise.resolve(null);
      }
      return R().load().then(function (cat) {
        catalog = cat;
        catalogError = null;
        return cat;
      }).catch(function (err) {
        catalogError = err;
        return null;
      });
    }

    Promise.all([
      fetch(API + "/me", { credentials: "include" }).then(function(r) { return r.ok ? r.json() : null; }),
      apiCall("/payment/config").then(function(r) { return r.ok ? r.json() : null; }),
      loadCatalogSafe()
    ]).then(function(results) {
      meData = results[0];
      paymentConfig = results[1];
      // Plan kanonisieren über Shared-Renderer (mit Backward-Compat-Fallbacks).
      var raw = (meData && meData.plan) ? meData.plan : "DEMO";
      currentPlan = R() ? R().normalizePlanKey(raw, "DEMO") : (raw === "FREE" ? "DEMO" : (raw === "ENTERPRISE" || raw === "INDIVIDUAL") ? "INDIVIDUELL" : raw);
      renderPlans();
      renderCurrentPlan();
      maybePreselectPlan();
      loadHistory();
    }).catch(function() {
      renderPlans();
      renderCurrentPlan();
      maybePreselectPlan();
      loadHistory();
    });
  })();
