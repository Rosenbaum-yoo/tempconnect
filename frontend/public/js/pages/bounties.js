/* ═══════════════════════════════════════════════════════
   Bounties & Rewards — Page Logic
   ═══════════════════════════════════════════════════════ */

/* ── Woerterbuch (P6.1, DE/EN) ─────────────────────────────────────────────
   Woerterbuch der ganzen Seite: bounties.html laedt i18n.js im head und
   nutzt ausser dieser Datei nur ein kleines Inline-Script (Tier-Modal), das
   seine Texte ueber dieselben rst.a.*-Schluessel zieht.

   Drei-Seiten-Regel: Bounties sind eine Surface von enterprise.html und fuer
   Unternehmen UND Personaldienstleister erreichbar (visibilityMatrix:
   allowed_org_types company + agency). Die Texte bleiben deshalb bewusst
   rollenneutral formuliert; kein rollenabhaengiger Begriff aus
   terminologyLabels.js wird hier als fester Wert eingefroren.

   Bewusst NICHT uebersetzt:
   - Bounty-Name/-Beschreibung (b.name_de, b.description_de) und die
     Tier-Pruefpunkte (c.label) — redaktionelle API-Daten aus /api/bounties/*
   - Meilenstein-Bezeichnungen (m.milestone_label) und Bounty-Icons
   - Plan-Rohwerte (DEMO/BASIS/PLUS/PRO/ENTERPRISE) und der Empfehlungscode
   - Kategorie-Rohwerte (performance/activity/loyalty/community) — sie stehen
     als data-cat am Filter-Tab und werden gegen die API gefiltert
   - Topbar/Navigation/Nutzerbereich (pageShell.js)                           */
TCi18n.register('de', {
  'rst.a.docTitle': 'Bounties & Belohnungen – TempConnect',
  'rst.a.hero.label': 'Bounties & Belohnungen',
  'rst.a.hero.title': 'Verdienen Sie sich Ihren Rabatt',
  'rst.a.hero.text': 'Gute Leistung wird belohnt. Sammeln Sie Bounties durch Performance, Aktivitaet und Treue — und senken Sie dauerhaft Ihren Abo-Preis.',
  'rst.a.discount.label': 'Ihr aktueller Bounty-Rabatt',
  'rst.a.discount.capPre': 'Max. ',
  'rst.a.discount.capPost': '% Rabatt moeglich',

  'rst.a.tiers.title': 'Ihr Status-Abzeichen',
  'rst.a.tiers.subtitle': 'Je mehr Bounties Sie verdienen, desto hoeher steigt Ihr Status — und Ihr maximaler Rabatt.',
  'rst.a.tier.current': 'Aktuell',
  'rst.a.tier.bronze.name': 'Bronze',
  'rst.a.tier.bronze.max': 'max. 8% Rabatt',
  'rst.a.tier.bronze.check1': '1 Bounty verdienen',
  'rst.a.tier.silver.name': 'Silber',
  'rst.a.tier.silver.max': 'max. 10% Rabatt',
  'rst.a.tier.silver.check1': '3 Bounties verdienen',
  'rst.a.tier.silver.check2': '3 Monate Abo-Laufzeit',
  'rst.a.tier.gold.name': 'Gold',
  'rst.a.tier.gold.max': 'max. 15% Rabatt',
  'rst.a.tier.gold.check1': '5 Bounties verdienen',
  'rst.a.tier.gold.check2': '6 Monate Abo-Laufzeit',
  'rst.a.tier.gold.check3': '10 abgeschlossene Deals',
  'rst.a.tier.platinum.name': 'Platin',
  'rst.a.tier.platinum.max': 'max. 20% Rabatt',
  'rst.a.tier.platinum.check1': '8 Bounties verdienen',
  'rst.a.tier.platinum.check2': '18 Monate Abo-Laufzeit',
  'rst.a.tier.platinum.check3': '50 abgeschlossene Deals',
  'rst.a.tier.platinum.check4': '4.2 Bewertung',
  'rst.a.tier.diamond.name': 'Diamant',
  'rst.a.tier.diamond.max': 'max. 25% Rabatt',
  'rst.a.tier.diamond.check1': '10 Bounties verdienen',
  'rst.a.tier.diamond.check2': '60 Monate (5 Jahre)',
  'rst.a.tier.diamond.check3': '100 abgeschlossene Deals',
  'rst.a.tier.diamond.check4': '4.5 Bewertung',
  'rst.a.tier.diamond.check5': '0 Beschwerden (12M)',
  'rst.a.tier.diamond.check6': 'Top 10% aller Anbieter',

  'rst.a.how.title': 'So funktioniert das Bounty-System',
  'rst.a.how.subtitle': 'In 4 einfachen Schritten zu dauerhaften Rabatten auf Ihr Abo.',
  'rst.a.how.s1.title': 'Plattform nutzen',
  'rst.a.how.s1.text': 'Stellen Sie Personal ein, bearbeiten Sie Anfragen zuverlaessig und schliessen Sie Deals ab.',
  'rst.a.how.s2.title': 'Bounties verdienen',
  'rst.a.how.s2.text': 'Fuer gute Performance, Aktivitaet, Treue und Community-Engagement erhalten Sie automatisch Bounties.',
  'rst.a.how.s3.title': 'Status aufsteigen',
  'rst.a.how.s3.text': 'Mit mehr Bounties steigen Sie von Bronze ueber Silber und Gold bis Platin oder Diamant auf.',
  'rst.a.how.s4.title': 'Rabatt kassieren',
  'rst.a.how.s4.text': 'Jede Stufe erhöht Ihren maximalen Rabatt — bis zu 25% auf den Jahresvertrag. Automatisch angerechnet.',
  'rst.a.cat.title': 'Bounty-Kategorien',
  'rst.a.cat.performance.name': 'Performance',
  'rst.a.cat.performance.text': 'Schnelle Reaktionszeiten, hohe Zuverlaessigkeit, gute Bewertungen',
  'rst.a.cat.activity.name': 'Aktivitaet',
  'rst.a.cat.activity.text': 'Regelmaessige Personaleintraege, Profil aktuell halten, aktive Teilnahme',
  'rst.a.cat.loyalty.name': 'Loyalitaet',
  'rst.a.cat.loyalty.text': 'Langfristige Abo-Laufzeit, Vertragstreue, wiederkehrende Zusammenarbeit',
  'rst.a.cat.community.name': 'Community',
  'rst.a.cat.community.text': 'Kunden werben, Feedback geben, Umfragen ausfuellen',

  'rst.a.milestones.title': 'Meilensteine',
  'rst.a.milestones.loading': 'Lade Meilensteine…',
  'rst.a.milestones.empty': 'Noch keine Meilensteine erreicht. Starten Sie mit Ihrem ersten Match!',

  'rst.a.tab.all': 'Alle',
  'rst.a.tab.performance': 'Performance',
  'rst.a.tab.activity': 'Aktivitaet',
  'rst.a.tab.loyalty': 'Loyalitaet',
  'rst.a.tab.community': 'Community',

  'rst.a.grid.loading': 'Lade Bounties…',
  'rst.a.grid.error': 'Bounties konnten nicht geladen werden.',
  'rst.a.grid.emptyCategory': 'Keine Bounties in dieser Kategorie.',
  'rst.a.status.earned': 'Verdient',
  'rst.a.status.in_progress': 'In Arbeit',
  'rst.a.status.locked': 'Gesperrt',
  'rst.a.status.superseded': 'Abgeloest',
  'rst.a.status.retired': 'Aktion beendet',
  'rst.a.status.unavailable': 'Zurzeit nicht verfuegbar',
  'rst.a.status.earnedAt': '{label} am {date}',
  'rst.a.recurring': 'Wiederkehrend — verfaellt bei Nicht-Erfuellung',

  'rst.a.calc.title': 'Jahresplan-Rechner',
  'rst.a.calc.subtitle': 'Wechseln Sie zum Jahresplan und kombinieren Sie Ihren Bounty-Rabatt.',
  'rst.a.calc.monthly': 'Monatspreis',
  'rst.a.calc.yearly12': 'Jahreszahlung (12 Monate)',
  'rst.a.calc.yearly10': 'Jahresplan (10 Monate)',
  'rst.a.calc.bountyPre': 'Bounty-Rabatt (',
  'rst.a.calc.bountyPost': '%)',
  'rst.a.calc.total': 'Ihr Jahrespreis',
  'rst.a.calc.savings': 'Ersparnis gegenueber monatlich',
  'rst.a.calc.note': 'Preise in EUR netto. Bounty-Rabatt wird bei Jahresvertrag automatisch angerechnet.',

  'rst.a.ref.title': 'Empfehlungsprogramm',
  'rst.a.ref.pilotBadge': 'Pilotkunde',
  'rst.a.ref.pilot.title': 'Pilotkunden-Vorteile',
  'rst.a.ref.pilot.b1': '1 Monat gratis',
  'rst.a.ref.pilot.t1': ' als Basis. Fuer jeden geworbenen Kunden + gelieferte Umfrage erhalten Sie ',
  'rst.a.ref.pilot.b2': '1 weiteren Gratis-Monat',
  'rst.a.ref.pilot.t2': ' (max. 6 Kunden = max. 7 Monate gratis).',
  'rst.a.ref.pilot.freeMonths': 'Gratis-Monate',
  'rst.a.ref.pilot.remaining': 'davon verbleibend',
  'rst.a.ref.cashback.title': 'Cashback-Programm',
  'rst.a.ref.cashback.t1': 'Werben Sie neue Kunden + Umfrage = ',
  'rst.a.ref.cashback.b1': '1 Monat Geld zurueck',
  'rst.a.ref.cashback.t2': ' (max. 6 Monate). Ihr erster Monat war bereits gratis!',
  'rst.a.ref.cashback.earned': 'Monate Cashback',
  'rst.a.ref.cashback.max': 'max. moeglich',
  'rst.a.ref.code.title': 'Ihr Empfehlungscode',
  'rst.a.ref.code.copy': 'Link kopieren',
  'rst.a.ref.code.copied': 'Link in die Zwischenablage kopiert!',
  'rst.a.ref.invite.title': 'Kunden einladen',
  'rst.a.ref.invite.ph': 'E-Mail des Kontakts',
  'rst.a.ref.invite.btn': 'Einladen',
  'rst.a.ref.invite.remainingPre': 'Verbleibende Einladungen: ',
  'rst.a.ref.invite.remainingPost': ' von 6',
  'rst.a.ref.invite.sent': 'Einladung an {email} gesendet!',
  'rst.a.ref.invite.errMax': 'Maximum von 6 Einladungen erreicht.',
  'rst.a.ref.invite.errAlready': 'Bereits eingeladen.',
  'rst.a.ref.invite.errGeneric': 'Fehler: {code}',
  'rst.a.ref.invite.errUnknown': 'Unbekannt',
  'rst.a.ref.list.title': 'Ihre Empfehlungen',
  'rst.a.ref.status.active': 'Aktiv (Umfrage erledigt)',
  'rst.a.ref.status.registered': 'Registriert (Umfrage ausstehend)',
  'rst.a.ref.status.pending': 'Eingeladen',
  'rst.a.ref.survey.title': 'Umfrage ausfuellen & Bonus aktivieren',
  'rst.a.ref.survey.text': 'Fuellen Sie diese kurze Umfrage aus, damit Ihr Empfehler seinen Gratis-Monat erhaelt.',
  'rst.a.ref.survey.ratingLabel': 'Wie bewerten Sie TempConnect? (1-5 Sterne)',
  'rst.a.ref.survey.feedbackLabel': 'Feedback (optional)',
  'rst.a.ref.survey.feedbackPh': 'Was gefaellt Ihnen? Was koennen wir verbessern?',
  'rst.a.ref.survey.howLabel': 'Wie haben Sie von TempConnect erfahren?',
  'rst.a.ref.survey.howPh': 'z.B. Empfehlung, Google, Messe...',
  'rst.a.ref.survey.submit': 'Umfrage absenden',
  'rst.a.ref.survey.thanks': 'Vielen Dank! Umfrage gespeichert. Ihr Empfehler erhaelt seinen Bonus.',
  'rst.a.ref.survey.already': 'Umfrage wurde bereits eingereicht.',
  'rst.a.ref.survey.error': 'Fehler.',
  'rst.a.ref.pilotCta': 'Als Pilotkunde registrieren — 1 Monat gratis',
  'rst.a.ref.pilotCtaNote': 'Werben Sie bis zu 6 Kunden und erhalten Sie bis zu 7 Monate gratis.',

  'rst.a.disclaimer': 'Bounty-Rabatte werden bei Wechsel auf den Jahresvertrag angerechnet. Wiederkehrende Bounties verfallen, wenn die Bedingung nicht mehr erfuellt ist. Maximaler Gesamtrabatt: 20%. Alle Angaben ohne Gewaehr.',

  'rst.a.modal.understood': 'Verstanden',
  'rst.a.modal.maxDiscount': 'max. {max} Rabatt',
  'rst.a.modal.intro': 'So erreichen Sie den {name}-Status:',
  'rst.a.info.bronze.r1.text': 'Mindestens 1 Bounty verdienen',
  'rst.a.info.bronze.r1.how': 'Deals abschliessen, Profil pflegen, Bewertungen erhalten',
  'rst.a.info.silver.r1.text': 'Mindestens 3 Bounties verdienen',
  'rst.a.info.silver.r1.how': 'Regelmaessig Personal einstellen und Deals abwickeln',
  'rst.a.info.silver.r2.text': '3 Monate aktive Abo-Laufzeit',
  'rst.a.info.silver.r2.how': 'Einfach dabei bleiben und die Plattform nutzen',
  'rst.a.info.gold.r1.text': '5 Bounties verdienen',
  'rst.a.info.gold.r1.how': 'Performance-Bounties durch schnelle Reaktion und gute Bewertungen',
  'rst.a.info.gold.r2.text': '6 Monate Abo-Laufzeit',
  'rst.a.info.gold.r2.how': 'Loyalitaets-Bounty wird automatisch gutgeschrieben',
  'rst.a.info.gold.r3.text': '10 abgeschlossene Deals',
  'rst.a.info.gold.r3.how': 'Deals bis zum Abschluss bringen (nicht nur Anfragen)',
  'rst.a.info.platinum.r1.text': '8 Bounties verdienen',
  'rst.a.info.platinum.r1.how': 'Kombination aus Performance, Aktivitaet und Community',
  'rst.a.info.platinum.r2.text': '18 Monate Abo-Laufzeit',
  'rst.a.info.platinum.r2.how': 'Treue zaehlt sich aus',
  'rst.a.info.platinum.r3.text': '50 abgeschlossene Deals',
  'rst.a.info.platinum.r3.how': 'Zeigt Ihre Zuverlaessigkeit als Partner',
  'rst.a.info.platinum.r4.text': 'Durchschnitt 4.2 Sterne Bewertung',
  'rst.a.info.platinum.r4.how': 'Qualitaet in Kommunikation und Zusammenarbeit',
  'rst.a.info.diamond.r1.text': '10 Bounties verdienen',
  'rst.a.info.diamond.r1.how': 'Alle Bounty-Kategorien abdecken',
  'rst.a.info.diamond.r2.text': '60 Monate (5 Jahre) Abo-Laufzeit',
  'rst.a.info.diamond.r2.how': 'Langfristige Partnerschaft',
  'rst.a.info.diamond.r3.text': '100 abgeschlossene Deals',
  'rst.a.info.diamond.r3.how': 'Top-Performer auf der Plattform',
  'rst.a.info.diamond.r4.text': 'Durchschnitt 4.5 Sterne',
  'rst.a.info.diamond.r4.how': 'Exzellente Qualitaet und Zuverlaessigkeit',
  'rst.a.info.diamond.r5.text': '0 Beschwerden in 12 Monaten',
  'rst.a.info.diamond.r5.how': 'Professionelle Abwicklung ohne Konflikte',
  'rst.a.info.diamond.r6.text': 'Top 10% aller Anbieter',
  'rst.a.info.diamond.r6.how': 'Ranking basiert auf Gesamtperformance'
});
TCi18n.register('en', {
  'rst.a.docTitle': 'Bounties & rewards – TempConnect',
  'rst.a.hero.label': 'Bounties & rewards',
  'rst.a.hero.title': 'Earn your discount',
  'rst.a.hero.text': 'Good work pays off. Collect bounties through performance, activity and loyalty — and lower your subscription price for good.',
  'rst.a.discount.label': 'Your current bounty discount',
  'rst.a.discount.capPre': 'Up to ',
  'rst.a.discount.capPost': '% discount possible',

  'rst.a.tiers.title': 'Your status badge',
  'rst.a.tiers.subtitle': 'The more bounties you earn, the higher your status climbs — and your maximum discount with it.',
  'rst.a.tier.current': 'Current',
  'rst.a.tier.bronze.name': 'Bronze',
  'rst.a.tier.bronze.max': 'up to 8% discount',
  'rst.a.tier.bronze.check1': 'Earn 1 bounty',
  'rst.a.tier.silver.name': 'Silver',
  'rst.a.tier.silver.max': 'up to 10% discount',
  'rst.a.tier.silver.check1': 'Earn 3 bounties',
  'rst.a.tier.silver.check2': '3 months of subscription',
  'rst.a.tier.gold.name': 'Gold',
  'rst.a.tier.gold.max': 'up to 15% discount',
  'rst.a.tier.gold.check1': 'Earn 5 bounties',
  'rst.a.tier.gold.check2': '6 months of subscription',
  'rst.a.tier.gold.check3': '10 closed deals',
  'rst.a.tier.platinum.name': 'Platinum',
  'rst.a.tier.platinum.max': 'up to 20% discount',
  'rst.a.tier.platinum.check1': 'Earn 8 bounties',
  'rst.a.tier.platinum.check2': '18 months of subscription',
  'rst.a.tier.platinum.check3': '50 closed deals',
  'rst.a.tier.platinum.check4': '4.2 rating',
  'rst.a.tier.diamond.name': 'Diamond',
  'rst.a.tier.diamond.max': 'up to 25% discount',
  'rst.a.tier.diamond.check1': 'Earn 10 bounties',
  'rst.a.tier.diamond.check2': '60 months (5 years)',
  'rst.a.tier.diamond.check3': '100 closed deals',
  'rst.a.tier.diamond.check4': '4.5 rating',
  'rst.a.tier.diamond.check5': '0 complaints (12M)',
  'rst.a.tier.diamond.check6': 'Top 10% of all providers',

  'rst.a.how.title': 'How the bounty system works',
  'rst.a.how.subtitle': 'Four simple steps to a lasting discount on your subscription.',
  'rst.a.how.s1.title': 'Use the platform',
  'rst.a.how.s1.text': 'List staff, handle requests reliably and close your deals.',
  'rst.a.how.s2.title': 'Earn bounties',
  'rst.a.how.s2.text': 'Strong performance, activity, loyalty and community engagement earn you bounties automatically.',
  'rst.a.how.s3.title': 'Climb the status ladder',
  'rst.a.how.s3.text': 'With more bounties you move from Bronze through Silver and Gold up to Platinum or Diamond.',
  'rst.a.how.s4.title': 'Collect the discount',
  'rst.a.how.s4.text': 'Every tier raises your maximum discount — up to 25% on the annual contract. Credited automatically.',
  'rst.a.cat.title': 'Bounty categories',
  'rst.a.cat.performance.name': 'Performance',
  'rst.a.cat.performance.text': 'Fast response times, high reliability, good ratings',
  'rst.a.cat.activity.name': 'Activity',
  'rst.a.cat.activity.text': 'Regular staff listings, an up-to-date profile, active participation',
  'rst.a.cat.loyalty.name': 'Loyalty',
  'rst.a.cat.loyalty.text': 'Long subscription terms, contract loyalty, repeat collaboration',
  'rst.a.cat.community.name': 'Community',
  'rst.a.cat.community.text': 'Refer customers, give feedback, complete surveys',

  'rst.a.milestones.title': 'Milestones',
  'rst.a.milestones.loading': 'Loading milestones…',
  'rst.a.milestones.empty': 'No milestones reached yet. Start with your first match!',

  'rst.a.tab.all': 'All',
  'rst.a.tab.performance': 'Performance',
  'rst.a.tab.activity': 'Activity',
  'rst.a.tab.loyalty': 'Loyalty',
  'rst.a.tab.community': 'Community',

  'rst.a.grid.loading': 'Loading bounties…',
  'rst.a.grid.error': 'Bounties could not be loaded.',
  'rst.a.grid.emptyCategory': 'No bounties in this category.',
  'rst.a.status.earned': 'Earned',
  'rst.a.status.in_progress': 'In progress',
  'rst.a.status.locked': 'Locked',
  'rst.a.status.superseded': 'Superseded',
  'rst.a.status.retired': 'Programme ended',
  'rst.a.status.unavailable': 'Currently unavailable',
  'rst.a.status.earnedAt': '{label} on {date}',
  'rst.a.recurring': 'Recurring — expires if the condition is no longer met',

  'rst.a.calc.title': 'Annual plan calculator',
  'rst.a.calc.subtitle': 'Switch to the annual plan and combine it with your bounty discount.',
  'rst.a.calc.monthly': 'Monthly price',
  'rst.a.calc.yearly12': 'Annual payment (12 months)',
  'rst.a.calc.yearly10': 'Annual plan (10 months)',
  'rst.a.calc.bountyPre': 'Bounty discount (',
  'rst.a.calc.bountyPost': '%)',
  'rst.a.calc.total': 'Your annual price',
  'rst.a.calc.savings': 'Savings versus monthly',
  'rst.a.calc.note': 'Prices in EUR net. The bounty discount is credited automatically on an annual contract.',

  'rst.a.ref.title': 'Referral programme',
  'rst.a.ref.pilotBadge': 'Pilot customer',
  'rst.a.ref.pilot.title': 'Pilot customer benefits',
  'rst.a.ref.pilot.b1': '1 month free',
  'rst.a.ref.pilot.t1': ' as a baseline. For every referred customer who completes the survey you receive ',
  'rst.a.ref.pilot.b2': 'one more free month',
  'rst.a.ref.pilot.t2': ' (max. 6 customers = max. 7 free months).',
  'rst.a.ref.pilot.freeMonths': 'Free months',
  'rst.a.ref.pilot.remaining': 'of which remaining',
  'rst.a.ref.cashback.title': 'Cashback programme',
  'rst.a.ref.cashback.t1': 'Refer new customers + survey = ',
  'rst.a.ref.cashback.b1': '1 month cashback',
  'rst.a.ref.cashback.t2': ' (max. 6 months). Your first month was already free!',
  'rst.a.ref.cashback.earned': 'months of cashback',
  'rst.a.ref.cashback.max': 'max. possible',
  'rst.a.ref.code.title': 'Your referral code',
  'rst.a.ref.code.copy': 'Copy link',
  'rst.a.ref.code.copied': 'Link copied to the clipboard!',
  'rst.a.ref.invite.title': 'Invite customers',
  'rst.a.ref.invite.ph': 'Contact e-mail address',
  'rst.a.ref.invite.btn': 'Invite',
  'rst.a.ref.invite.remainingPre': 'Invitations remaining: ',
  'rst.a.ref.invite.remainingPost': ' of 6',
  'rst.a.ref.invite.sent': 'Invitation sent to {email}!',
  'rst.a.ref.invite.errMax': 'You have reached the maximum of 6 invitations.',
  'rst.a.ref.invite.errAlready': 'Already invited.',
  'rst.a.ref.invite.errGeneric': 'Error: {code}',
  'rst.a.ref.invite.errUnknown': 'Unknown',
  'rst.a.ref.list.title': 'Your referrals',
  'rst.a.ref.status.active': 'Active (survey completed)',
  'rst.a.ref.status.registered': 'Registered (survey pending)',
  'rst.a.ref.status.pending': 'Invited',
  'rst.a.ref.survey.title': 'Complete the survey & activate the bonus',
  'rst.a.ref.survey.text': 'Complete this short survey so the person who referred you receives their free month.',
  'rst.a.ref.survey.ratingLabel': 'How do you rate TempConnect? (1-5 stars)',
  'rst.a.ref.survey.feedbackLabel': 'Feedback (optional)',
  'rst.a.ref.survey.feedbackPh': 'What do you like? What can we improve?',
  'rst.a.ref.survey.howLabel': 'How did you hear about TempConnect?',
  'rst.a.ref.survey.howPh': 'e.g. referral, Google, trade fair...',
  'rst.a.ref.survey.submit': 'Submit survey',
  'rst.a.ref.survey.thanks': 'Thank you! Survey saved. The person who referred you gets their bonus.',
  'rst.a.ref.survey.already': 'The survey has already been submitted.',
  'rst.a.ref.survey.error': 'Error.',
  'rst.a.ref.pilotCta': 'Register as a pilot customer — 1 month free',
  'rst.a.ref.pilotCtaNote': 'Refer up to 6 customers and receive up to 7 free months.',

  'rst.a.disclaimer': 'Bounty discounts are credited when you switch to the annual contract. Recurring bounties expire once the condition is no longer met. Maximum total discount: 20%. All information without guarantee.',

  'rst.a.modal.understood': 'Understood',
  'rst.a.modal.maxDiscount': 'up to {max} discount',
  'rst.a.modal.intro': 'How to reach {name} status:',
  'rst.a.info.bronze.r1.text': 'Earn at least 1 bounty',
  'rst.a.info.bronze.r1.how': 'Close deals, keep your profile current, collect ratings',
  'rst.a.info.silver.r1.text': 'Earn at least 3 bounties',
  'rst.a.info.silver.r1.how': 'List staff regularly and process your deals',
  'rst.a.info.silver.r2.text': '3 months of active subscription',
  'rst.a.info.silver.r2.how': 'Simply stay on board and use the platform',
  'rst.a.info.gold.r1.text': 'Earn 5 bounties',
  'rst.a.info.gold.r1.how': 'Performance bounties through fast responses and good ratings',
  'rst.a.info.gold.r2.text': '6 months of subscription',
  'rst.a.info.gold.r2.how': 'The loyalty bounty is credited automatically',
  'rst.a.info.gold.r3.text': '10 closed deals',
  'rst.a.info.gold.r3.how': 'Take deals all the way to closing (not just requests)',
  'rst.a.info.platinum.r1.text': 'Earn 8 bounties',
  'rst.a.info.platinum.r1.how': 'A mix of performance, activity and community',
  'rst.a.info.platinum.r2.text': '18 months of subscription',
  'rst.a.info.platinum.r2.how': 'Loyalty pays off',
  'rst.a.info.platinum.r3.text': '50 closed deals',
  'rst.a.info.platinum.r3.how': 'Proof of your reliability as a partner',
  'rst.a.info.platinum.r4.text': 'Average rating of 4.2 stars',
  'rst.a.info.platinum.r4.how': 'Quality in communication and collaboration',
  'rst.a.info.diamond.r1.text': 'Earn 10 bounties',
  'rst.a.info.diamond.r1.how': 'Cover every bounty category',
  'rst.a.info.diamond.r2.text': '60 months (5 years) of subscription',
  'rst.a.info.diamond.r2.how': 'A long-term partnership',
  'rst.a.info.diamond.r3.text': '100 closed deals',
  'rst.a.info.diamond.r3.how': 'Top performer on the platform',
  'rst.a.info.diamond.r4.text': 'Average of 4.5 stars',
  'rst.a.info.diamond.r4.how': 'Excellent quality and reliability',
  'rst.a.info.diamond.r5.text': '0 complaints in 12 months',
  'rst.a.info.diamond.r5.how': 'Professional handling without conflicts',
  'rst.a.info.diamond.r6.text': 'Top 10% of all providers',
  'rst.a.info.diamond.r6.how': 'Ranking is based on overall performance'
});

  (function() {
    var PRICES = { DEMO: 0, BASIS: 150, PLUS: 499, PRO: 799, ENTERPRISE: 2499 };
    // 'superseded' = untere Stufe einer Leiter, deren Rabatt in der oberen steckt.
    // 'retired'     = das Bounty wurde abgeschaltet. Wer es verdient hatte, sieht es
    //                 weiter (Historie), bekommt aber keinen Rabatt mehr dafuer.
    // 'unavailable' = ausserhalb des Kampagnenzeitraums, also gerade nicht verdienbar.
    var STATUS_KEYS = ['earned', 'in_progress', 'locked', 'superseded', 'retired', 'unavailable'];
    var activeCategory = 'all';
    var bountyData = null;
    var userPlan = 'DEMO';

    function t(key, params) { return TCi18n.t(key, params); }
    function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function fmtPrice(n) { return n.toLocaleString(TCi18n.dateLocale()) + ' EUR'; }
    function fmtDate(d) { if (!d) return ''; return new Date(d).toLocaleDateString(TCi18n.dateLocale(), { day: '2-digit', month: 'short', year: 'numeric' }); }

    /* ── Fetch data ────────────────────────────────── */
    function init() {
      Promise.all([
        fetch('/api/bounties/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
        fetch('/api/milestones/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
        fetch('/api/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null)
      ]).then(function(results) {
        bountyData = results[0];
        var milestones = results[1]?.milestones || [];
        var me = results[2];
        userPlan = me?.plan || 'DEMO';

        if (bountyData) {
          renderDiscount(bountyData.total_discount_pct, bountyData.max_discount_pct);
          renderBounties(bountyData.items);
          renderCalculator(bountyData.total_discount_pct);
        }
        renderMilestones(milestones);
      }).catch(function() {
        document.getElementById('bountyGrid').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:var(--ds-space-6);color:var(--ds-text-tertiary)">' + esc(t('rst.a.grid.error')) + '</div>';
      });
    }

    /* ── Render Discount Hero ──────────────────────── */
    function renderDiscount(pct, max) {
      document.getElementById('discountValue').innerHTML = pct + '<span>%</span>';
      document.getElementById('discountBar').style.width = (pct / max * 100) + '%';
      document.getElementById('maxDiscount').textContent = max;
    }

    /* ── Render Bounties ───────────────────────────── */
    function renderBounties(items) {
      var grid = document.getElementById('bountyGrid');
      grid.innerHTML = '';
      var filtered = activeCategory === 'all' ? items : items.filter(function(b) { return b.category === activeCategory; });

      if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:var(--ds-space-6);color:var(--ds-text-tertiary)">' + esc(t('rst.a.grid.emptyCategory')) + '</div>';
        return;
      }

      filtered.forEach(function(b) {
        var card = document.createElement('div');
        card.className = 'bounty-card ' + b.status;

        var pct = Math.round(b.progress);
        var statusLabel = (STATUS_KEYS.indexOf(b.status) >= 0 ? t('rst.a.status.' + b.status) : '') || b.status;
        if (b.status === 'earned' && b.earned_at) statusLabel = t('rst.a.status.earnedAt', { label: statusLabel, date: fmtDate(b.earned_at) });

        card.innerHTML =
          '<div class="bounty-icon">' + b.icon + '</div>' +
          '<div class="bounty-body">' +
            '<div class="bounty-header">' +
              '<div class="bounty-name">' + esc(b.name_de) + '</div>' +
              '<div class="bounty-discount">-' + b.discount_pct + '%</div>' +
            '</div>' +
            '<div class="bounty-desc">' + esc(b.description_de) + '</div>' +
            '<div class="bounty-progress-bg"><div class="bounty-progress" style="width:' + pct + '%"></div></div>' +
            '<div class="bounty-status-row">' +
              '<span class="bounty-status">' + esc(statusLabel) + '</span>' +
              '<span class="bounty-pct">' + pct + '%</span>' +
            '</div>' +
            (b.is_recurring ? '<div class="bounty-recurring">&#128260; ' + esc(t('rst.a.recurring')) + '</div>' : '') +
            // P8 Welle C: Klartext, WARUM das Bounty gerade nicht gilt bzw. was
            // noch fehlt. Eine graue Kachel ohne Begruendung erzieht niemanden —
            // der Anreiz wirkt nur, wenn die Folge benannt ist.
            // Der Text kommt fertig formuliert vom Server (`note`), damit
            // Bounty-Regel und Erklaerung nicht auseinanderlaufen koennen.
            (b.note ? '<div class="bounty-note">' + esc(b.note) + '</div>' : '') +
          '</div>';

        grid.appendChild(card);
      });
    }

    /* ── Render Milestones ─────────────────────────── */
    function renderMilestones(milestones) {
      var row = document.getElementById('milestoneRow');
      if (!milestones.length) {
        row.innerHTML = '<div class="no-milestones">' + esc(t('rst.a.milestones.empty')) + '</div>';
        return;
      }
      row.innerHTML = '';
      milestones.forEach(function(m) {
        var badge = document.createElement('div');
        badge.className = 'milestone-badge';
        badge.innerHTML = '<span class="ms-icon">' + (m.icon || '🎯') + '</span>' +
          esc(m.milestone_label) +
          '<span class="ms-date">' + fmtDate(m.reached_at) + '</span>';
        row.appendChild(badge);
      });
    }

    /* ── Annual Plan Calculator ────────────────────── */
    function renderCalculator(discountPct) {
      var price = PRICES[userPlan];
      if (!price || price === 0) return;

      var card = document.getElementById('calcCard');
      card.style.display = 'block';

      var yearly12 = price * 12;
      var yearly10 = price * 10;
      var bountyDiscount = Math.round(yearly10 * (discountPct / 100));
      var total = yearly10 - bountyDiscount;
      var savings = yearly12 - total;

      document.getElementById('calcMonthly').textContent = fmtPrice(price);
      document.getElementById('calcYearly12').textContent = fmtPrice(yearly12);
      document.getElementById('calcYearly10').textContent = fmtPrice(yearly10);

      if (discountPct > 0) {
        document.getElementById('calcBountyRow').style.display = 'flex';
        document.getElementById('calcBountyPct').textContent = discountPct;
        document.getElementById('calcBountyAmount').textContent = '-' + fmtPrice(bountyDiscount);
      }

      document.getElementById('calcTotal').textContent = fmtPrice(total);
      document.getElementById('calcSavings').textContent = '-' + fmtPrice(savings) + ' (' + Math.round((savings / yearly12) * 100) + '%)';
    }

    /* ── Category Tabs ─────────────────────────────── */
    document.getElementById('catTabs').addEventListener('click', function(e) {
      var tab = e.target.closest('.cat-tab');
      if (!tab) return;
      document.querySelectorAll('.cat-tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      activeCategory = tab.dataset.cat;
      if (bountyData) renderBounties(bountyData.items);
    });

    /* ── Render Tier Cards (from /api/bounties/tier) ──────── */
    function renderTiers(tierData) {
      if (!tierData || !tierData.tiers) return;
      var tierMap = { bronze: 'tierBronze', silver: 'tierSilver', gold: 'tierGold', platinum: 'tierPlatinum', diamond: 'tierDiamond' };
      tierData.tiers.forEach(function(t) {
        var el = document.getElementById(tierMap[t.key]);
        if (!el) return;
        if (t.is_current) {
          el.classList.remove('locked');
          el.classList.add('current');
          el.insertAdjacentHTML('afterbegin', '<div class="tier-badge-current">' + esc(t('rst.a.tier.current')) + '</div>');
        } else if (t.qualified) {
          el.classList.remove('locked');
        }
        // Update checks
        if (t.checks) {
          var checksHtml = '';
          t.checks.forEach(function(c) {
            var icon = c.done ? '&#9745;' : '&#9723;';
            var cls = c.done ? 'done' : 'pending';
            var progress = c.done ? '' : ' (' + c.current + '/' + c.needed + ')';
            checksHtml += '<div class="' + cls + '">' + icon + ' ' + esc(c.label) + progress + '</div>';
          });
          var checksEl = el.querySelector('.tier-checks');
          if (checksEl) checksEl.innerHTML = checksHtml;
        }
      });
    }

    /* ── Fetch data ────────────────────────────────── */
    function _initBounties() {
      Promise.all([
        fetch('/api/bounties/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
        fetch('/api/milestones/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
        fetch('/api/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
        fetch('/api/bounties/tier', { credentials: 'include' }).then(r => r.ok ? r.json() : null)
      ]).then(function(results) {
        bountyData = results[0];
        var milestones = results[1]?.milestones || [];
        var me = results[2];
        var tierData = results[3];
        userPlan = me?.plan || 'DEMO';

        if (bountyData) {
          renderDiscount(bountyData.total_discount_pct, bountyData.max_discount_pct);
          renderBounties(bountyData.items);
          renderCalculator(bountyData.total_discount_pct);
        }
        renderMilestones(milestones);
        renderTiers(tierData);
      }).catch(function() {
        document.getElementById('bountyGrid').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:var(--ds-space-6);color:var(--ds-text-tertiary)">' + esc(t('rst.a.grid.error')) + '</div>';
      });
    }

    _initBounties();
  })();

  /* ── Referral-Programm Logic ───────────────────── */
  var refRating = 4;
  /* Eigene t()-Bruecke: dieser Block liegt ausserhalb der IIFE oben, teilt
     sich aber deren Woerterbuch (rst.a.*). */
  function refT(key, params) { return TCi18n.t(key, params); }
  var REF_STATUS_KEYS = ['active', 'registered', 'pending'];
  function loadReferralStatus() {
    function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    fetch('/api/referral/status', { credentials: 'include' }).then(function(r) { return r.ok ? r.json() : null; }).then(function(d) {
      if (!d) return;
      document.getElementById('refCode').textContent = d.referral_code || '---';
      document.getElementById('refRemaining').textContent = Math.max(0, d.referrals_remaining);

      if (d.is_pilot) {
        document.getElementById('refPilotBadge').style.display = 'inline';
        document.getElementById('refPilotInfo').style.display = 'block';
        document.getElementById('refFreeMonths').textContent = d.free_months_total;
        document.getElementById('refFreeRemaining').textContent = d.free_months_remaining;
      } else {
        document.getElementById('refCashbackInfo').style.display = 'block';
        document.getElementById('refCashbackEarned').textContent = d.cashback_months_earned;
        if (!d.is_pilot) document.getElementById('refBecomePilot').style.display = 'block';
      }

      // Referral-Liste
      if (d.referrals && d.referrals.length > 0) {
        document.getElementById('refList').style.display = 'block';
        var body = document.getElementById('refListBody');
        body.innerHTML = '';
        d.referrals.forEach(function(r) {
          var statusColor = r.status === 'active' ? 'var(--ds-success)' : r.status === 'registered' ? 'var(--ds-brand)' : 'var(--ds-text-tertiary)';
          var statusText = (REF_STATUS_KEYS.indexOf(r.status) >= 0 ? refT('rst.a.ref.status.' + r.status) : '') || r.status;
          var el = document.createElement('div');
          el.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border:1px solid var(--ds-border);border-radius:8px;font-size:13px';
          el.innerHTML = '<span>' + esc(r.referred_email) + '</span><span style="font-weight:600;color:' + statusColor + ';font-size:12px">' + esc(statusText) + '</span>';
          body.appendChild(el);
        });
      }

      // Umfrage fuer geworbene Kunden
      if (d.referred_by && d.survey_status === 'pending') {
        document.getElementById('refSurveySection').style.display = 'block';
      }
    }).catch(function() {});
  }

  function copyRefLink() {
    var code = document.getElementById('refCode').textContent;
    var url = window.location.origin + '/?ref=' + code;
    navigator.clipboard.writeText(url).then(function() {
      var msg = document.getElementById('refCopyMsg');
      msg.style.display = 'block';
      setTimeout(function() { msg.style.display = 'none'; }, 3000);
    });
  }

  function sendRefInvite() {
    var email = document.getElementById('refInviteEmail').value.trim();
    if (!email) return;
    var msg = document.getElementById('refInviteMsg');
    fetch('/api/csrf', { credentials: 'include' }).then(function(r) { return r.ok ? r.json() : {}; }).then(function(csrf) {
    return fetch('/api/referral/invite', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf.token || '' }, body: JSON.stringify({ email: email }) }); })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.ok) {
          msg.style.display = 'block'; msg.style.color = 'var(--ds-success)'; msg.textContent = refT('rst.a.ref.invite.sent', { email: email });
          document.getElementById('refInviteEmail').value = '';
          loadReferralStatus();
        } else {
          msg.style.display = 'block'; msg.style.color = 'var(--ds-error,#ff6b6b)';
          msg.textContent = d.error === 'MAX_REFERRALS_REACHED' ? refT('rst.a.ref.invite.errMax')
            : d.error === 'ALREADY_INVITED' ? refT('rst.a.ref.invite.errAlready')
            : refT('rst.a.ref.invite.errGeneric', { code: d.error || refT('rst.a.ref.invite.errUnknown') });
        }
        setTimeout(function() { msg.style.display = 'none'; }, 5000);
      });
  }

  function registerPilot() {
    fetch('/api/csrf', { credentials: 'include' }).then(function(r) { return r.ok ? r.json() : {}; }).then(function(csrf) {
    return fetch('/api/referral/register-pilot', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf.token || '' } }); })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.ok) { loadReferralStatus(); document.getElementById('refBecomePilot').style.display = 'none'; }
      });
  }

  // Star-Rating
  document.getElementById('refSurveyStars').addEventListener('click', function(e) {
    var star = e.target.closest('[data-star]');
    if (!star) return;
    refRating = parseInt(star.dataset.star);
    var spans = document.querySelectorAll('#refSurveyStars span');
    spans.forEach(function(s) { s.innerHTML = parseInt(s.dataset.star) <= refRating ? '&#9733;' : '&#9734;'; });
  });

  function submitRefSurvey() {
    var feedback = document.getElementById('refSurveyFeedback').value.trim();
    var howFound = document.getElementById('refSurveyHow').value.trim();
    var msg = document.getElementById('refSurveyMsg');
    fetch('/api/csrf', { credentials: 'include' }).then(function(r) { return r.ok ? r.json() : {}; }).then(function(csrf) {
    return fetch('/api/referral/survey', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf.token || '' }, body: JSON.stringify({ rating: refRating, feedback: feedback || null, how_found: howFound || null, would_recommend: true }) }); })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.ok) {
          msg.style.display = 'block'; msg.style.color = 'var(--ds-success)'; msg.textContent = refT('rst.a.ref.survey.thanks');
          document.getElementById('refSurveySection').style.display = 'none';
        } else {
          msg.style.display = 'block'; msg.style.color = 'var(--ds-error,#ff6b6b)'; msg.textContent = d.error === 'SURVEY_ALREADY_SUBMITTED' ? refT('rst.a.ref.survey.already') : refT('rst.a.ref.survey.error');
        }
      });
  }

  loadReferralStatus();