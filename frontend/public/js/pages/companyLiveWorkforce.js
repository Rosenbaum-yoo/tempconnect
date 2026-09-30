/* ═══════════════════════════════════════════════════════
   Company Live Workforce — Live-Belegschaft des Unternehmens (Welle J1)
   Auto-gescoped auf die eigene Unternehmens-Org.

   HERKUNFT: Bis Welle J1 lebte diese Flaeche als dritter Reiter in
   company-timesheets.html. Sie ist der Anker der Marktplatz-Vision
   (docs/features/J_LIVE_BELEGSCHAFT_MARKTPLATZ.md) und braucht dafuer eine
   eigene Adresse, auf die Kacheln, Benachrichtigungen und Deep-Links zeigen
   koennen. Die Logik ist UMGEZOGEN, nicht kopiert — company-timesheets.html
   behaelt nur den Stundenzettel-Eingang und leitet alte Deep-Links hierher.
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Woerterbuch (DE/EN) ─────────────────────────────────────────────────
     Drei-Seiten-Regel: Diese Flaeche erreicht NUR die Unternehmensseite.
     api/routes/companyTimesheets.js legt requireCompanyOrg vor die Routen;
     eine Zeitarbeitsfirma sieht den notCompany-Zustand (mit Wegweiser zu
     ihrer eigenen Live-Tafel in mitarbeiter.html).

     Bewusst NICHT uebersetzt:
     - Status-Rohwerte in option[value] (gehen an den Server)
     - API-Daten: Namen, Personalnummern, Firmennamen, Rollen, Gruende       */
  TCi18n.register('de', {
    'clw.docTitle': 'Live-Belegschaft – TempConnect',

    'clw.paywall.title': 'Anmeldung erforderlich',
    'clw.paywall.text': 'Bitte melden Sie sich an, um Ihre Live-Belegschaft zu sehen.',
    'clw.paywall.cta': 'Anmelden',
    'clw.gate.title': 'Nur für Unternehmen',
    'clw.gate.text': 'Die Live-Belegschaft zeigt, wer bei Ihrem Unternehmen im Einsatz ist. Ihre aktive Organisation ist keine Unternehmens-Organisation.',
    'clw.gate.agencyHint': 'Als Zeitarbeitsfirma finden Sie Ihre eigene Live-Tafel unter Einsatzkräfte.',
    'clw.gate.agencyCta': 'Zur Live-Tafel der Zeitarbeitsfirma',

    'clw.page.title': 'Live-Belegschaft',
    'clw.page.subtitle': 'Wer von Ihren Zeitarbeitsfirmen gerade bei Ihnen arbeitet – live, mit Meldungen und Sperrliste an einem Ort.',

    'clw.help.summary': 'Wie funktioniert diese Seite?',
    'clw.help.live': 'Live: Alle Kräfte, die aktuell bei Ihnen im Einsatz sind – automatisch aus den laufenden Einsätzen, alle 30 Sekunden aktualisiert.',
    'clw.help.report': 'Melden: Gibt es ein Problem mit einer Kraft, erreicht Ihre Meldung sofort den zuständigen Disponenten – er kann z. B. Ersatz stellen.',
    'clw.help.block': 'Sperren: Eine gesperrte Kraft wird Ihrem Unternehmen nicht mehr zugewiesen – dauerhaft oder befristet, jederzeit widerrufbar.',

    'clw.tab.live': 'Live-Belegschaft',
    'clw.tab.available': 'Verfügbare Kräfte',
    'clw.tab.complaints': 'Meine Meldungen',
    'clw.tab.blocklist': 'Sperrliste',

    'clw.avail.banner.1': 'Freie Kräfte aller Zeitarbeitsfirmen der Plattform – automatisch aus deren Live-Belegschaft, ohne dass jemand Angebote pflegt.',
    'clw.avail.banner.strong': 'Buchen Sie in drei Schritten:',
    'clw.avail.banner.2': 'Wie viele? Von wann bis wann? Zu welchem Preis? Für Ihr Unternehmen gesperrte Kräfte erscheinen hier nicht.',
    'clw.avail.rolePh': 'Rolle oder Qualifikation…',
    'clw.avail.roleHelp': 'z. B. Staplerfahrer, Pflege, Elektro',
    'clw.avail.cityPh': 'Ort…',
    'clw.avail.cityHelp': 'Genauer Ortsname des Einsatzorts',
    'clw.avail.fromHelp': 'Ab wann brauchen Sie die Kräfte? Angezeigt wird, was zu diesem Datum verfügbar ist.',
    'clw.avail.countPh': 'Anzahl',
    'clw.avail.countHelp': 'Wie viele Kräfte mindestens? Angebote mit weniger freien Plätzen werden ausgeblendet.',
    'clw.avail.th.role': 'Rolle / Qualifikation',
    'clw.avail.th.city': 'Ort',
    'clw.avail.th.window': 'Verfügbar',
    'clw.avail.th.headcount': 'Personen',
    'clw.avail.th.price': 'Preisrahmen',
    'clw.avail.badge.auto': 'aus Live-Belegschaft',
    'clw.avail.badge.autoTitle': 'Dieses Angebot hat die Plattform automatisch aus der freien Kapazität der Zeitarbeitsfirma erzeugt – es ist so aktuell wie deren Live-Belegschaft.',
    'clw.avail.action.book': 'Buchen',
    'clw.avail.action.bookTitle': 'In drei Schritten buchen: Anzahl, Zeitraum, Preis',
    'clw.avail.count.results': '{count} Angebote',
    'clw.avail.until': 'bis {date}',
    'clw.avail.openEnd': 'ab {date}, offen',
    'clw.avail.empty': 'Keine passenden freien Kräfte. Ändern Sie Filter oder Zeitraum – oder legen Sie unter Arbeitsplatzangebote einen Bedarf an, dann melden sich die Zeitarbeitsfirmen bei Ihnen.',
    'clw.avail.merkmalLabel': 'Merkmale:',
    'clw.avail.merkmalHelp': 'Zeigt nur Kräfte, denen ihre Zeitarbeitsfirma dieses Merkmal gegeben hat.',

    'clw.merkmal.zuverlaessig': 'Zuverlässig',
    'clw.merkmal.sehr_fleissig': 'Sehr fleißig',
    'clw.merkmal.arbeitet_sauber': 'Arbeitet sauber',
    'clw.merkmal.langfristig_einsetzbar': 'Langfristig einsetzbar',
    'clw.merkmal.kurzfristig_startklar': 'Kurzfristig startklar',
    'clw.merkmal.schicht_flexibel': 'Flexibel bei Schichten',

    'clw.aueg.rest': 'AÜG: {monate} von 18 Monaten – bis {date}',
    'clw.aueg.alarm': 'AÜG-Frist überschritten (seit {date})',
    'clw.aueg.help': 'Höchstüberlassungsdauer nach § 1 AÜG: 18 Monate je Kraft bei Ihrem Unternehmen. Verbraucht: {monate} Monate, Frist endet {date}. Unterbrechungen unter 3 Monaten zählen mit. Die Einhaltung verantwortet die Zeitarbeitsfirma – TempConnect rechnet mit und weist Sie darauf hin.',
    'clw.aueg.bookOver': 'Hinweis zur AÜG-Frist: Der gewählte Zeitraum überschreitet die Höchstüberlassungsdauer von 18 Monaten. Fristgerecht wäre ein Ende bis {date} – bitte mit Ihrer Zeitarbeitsfirma abstimmen.',
    'clw.aueg.bookNear': 'Hinweis zur AÜG-Frist: Mit dieser Buchung sind {monate} von 18 Monaten verbraucht. Die Höchstüberlassungsdauer endet am {date}.',

    'clw.price.hourly': '€/Std.',
    'clw.price.daily': '€/Tag',
    'clw.price.fixed': '€ pauschal',

    'clw.book.title': 'Buchung in drei Schritten',
    'clw.book.q1': '1. Wie viele Kräfte?',
    'clw.book.q2': '2. Von wann bis wann?',
    'clw.book.q3': '3. Zu welchem Preis?',
    'clw.book.endHelp': 'Leer lassen = offenes Ende',
    'clw.book.countHint': '{count} verfügbar',
    'clw.book.windowHint': 'Angeboten: {window}',
    'clw.book.priceHintRange': 'Vorschlag aus dem Angebot: {min}–{max} {unit} – innerhalb dieses Rahmens ist Ihre Wahl sofort verbindlich.',
    'clw.book.priceHintNone': 'Das Angebot nennt keinen Preisrahmen – Ihr Vorschlag geht in die Vereinbarung ein.',
    'clw.book.submit': 'Verbindlich buchen',
    'clw.book.busy': 'Wird gebucht…',
    'clw.book.doneTitle': 'Buchung ausgelöst.',
    'clw.book.doneText': 'Die Einsatzvereinbarung wurde erstellt – die Zeitarbeitsfirma bestätigt sie jetzt. Den Stand sehen Sie jederzeit in der Dealakte.',
    'clw.book.doneRef': 'Referenz: {ref}',
    'clw.book.openDeal': 'Dealakte öffnen',
    'clw.book.err.blocked': 'Diese Kraft ist für Ihr Unternehmen gesperrt (Sperrliste). Heben Sie die Sperre auf, wenn Sie sie wieder einsetzen möchten.',
    'clw.book.err.unavailable': 'Inzwischen vergeben – es sind nur noch {remaining} Plätze frei. Passen Sie die Anzahl an oder wählen Sie ein anderes Angebot.',
    'clw.book.err.notActive': 'Dieses Angebot ist nicht mehr aktiv. Aktualisieren Sie die Liste.',
    'clw.book.err.periodInvalid': 'Bitte einen gültigen Zeitraum wählen (Beginn vor Ende).',
    'clw.book.err.periodPast': 'Der Beginn darf nicht in der Vergangenheit liegen.',
    'clw.book.err.periodOutside': 'Der gewünschte Zeitraum liegt außerhalb des Angebots ({window}). Passen Sie ihn an – oder legen Sie einen eigenen Bedarf an.',
    'clw.book.err.priceInvalid': 'Bitte einen gültigen Preis eingeben.',
    'clw.book.err.priceOutside': 'Ihr Preis liegt außerhalb des angebotenen Rahmens ({min}–{max} {unit}). Innerhalb des Rahmens buchen Sie sofort – außerhalb starten Sie eine Verhandlung über die Angebotsseite.',
    'clw.book.err.generic': 'Buchung fehlgeschlagen: {detail}',

    'clw.live.banner.1': 'Echtzeit-Überblick: Diese Kräfte Ihrer Zeitarbeitsfirmen sind',
    'clw.live.banner.strong': 'aktuell bei Ihnen im Einsatz',
    'clw.live.banner.2': '– automatisch aus den laufenden Einsätzen Ihrer Organisation.',
    'clw.live.kpi.active': 'Aktuell im Einsatz',
    'clw.live.kpi.activeHelp': 'Kräfte mit laufendem Einsatz bei Ihnen – ohne die, die gerade ausfallen.',
    'clw.live.kpi.ending': 'Endet in Kürze',
    'clw.live.kpi.endingHelp': 'Einsätze, die in den nächsten Tagen enden – hier lohnt es sich, rechtzeitig zu verlängern oder nachzubesetzen.',
    'clw.live.kpi.out': 'Fällt aus',
    'clw.live.kpi.outHelp': 'Von der Zeitarbeitsfirma als ausgefallen gemeldet. Der Grund ist ein Beschäftigtendatum und wird bewusst nicht angezeigt.',
    'clw.live.kpi.agencies': 'Zeitarbeitsfirmen',
    'clw.live.kpi.agenciesHelp': 'So viele Zeitarbeitsfirmen haben aktuell Kräfte bei Ihnen im Einsatz.',
    'clw.live.searchPh': 'Mitarbeiter oder Firma…',
    'clw.live.badge.soon': 'Endet bald',
    'clw.live.badge.active': 'Im Einsatz',
    'clw.live.badge.out': 'Fällt aus',
    'clw.live.badge.unknown': 'Zustand unbekannt',
    'clw.live.openEnd': 'offen',
    'clw.live.out.until': 'vsl. bis {date}',
    'clw.live.out.openEnd': 'Rückkehr noch offen',
    'clw.live.out.alsoEnding': 'Einsatz endet ohnehin bald',
    'clw.live.out.privacy': 'Die Zeitarbeitsfirma hat diese Kraft als ausgefallen gemeldet. Der Grund ist ein Beschäftigtendatum und wird Ihnen bewusst nicht angezeigt.',
    'clw.live.slot.backup': 'Springer',
    'clw.live.slot.backupTitle': 'Diese Kraft ist als Ersatz auf dem Einsatz, nicht als ursprünglich gebuchte Stammbesetzung.',

    'clw.th.worker': 'Mitarbeiter',
    'clw.th.agency': 'Zeitarbeitsfirma',
    'clw.th.role': 'Rolle',
    'clw.th.shift': 'Schicht',
    'clw.th.since': 'Seit',
    'clw.th.until': 'Bis',
    'clw.th.status': 'Status',
    'clw.th.severity': 'Dringlichkeit',
    'clw.th.reason': 'Grund',
    'clw.th.reported': 'Gemeldet',
    'clw.th.blockedUntil': 'Gesperrt bis',

    'clw.action.refresh': 'Aktualisieren',
    'clw.action.cancel': 'Abbrechen',
    'clw.action.close': 'Schließen',
    'clw.action.report': 'Melden',
    'clw.action.reportTitle': 'Problem mit dieser Kraft an die Zeitarbeitsfirma melden',
    'clw.action.block': 'Sperren',
    'clw.action.blockTitle': 'Diese Kraft für Ihr Unternehmen sperren',
    'clw.action.unblock': 'Freigeben',
    'clw.action.unblockTitle': 'Sperre aufheben – die Kraft kann Ihnen wieder zugewiesen werden',

    'clw.count.onAssignment': '{count} im Einsatz',
    'clw.count.blocked': '{count} gesperrt',
    'clw.count.reports': '{count} Meldungen',
    'clw.count.reportsOne': '1 Meldung',
    'clw.count.reportsOpen': '{count} offen',

    'clw.empty.live': 'Aktuell arbeitet niemand bei Ihnen. Sobald Kräfte im Einsatz sind, erscheinen sie hier live.',
    'clw.empty.blocklist': 'Keine gesperrten Kräfte. Im Reiter Live-Belegschaft können Sie eine Kraft sperren.',
    'clw.empty.complaints': 'Noch keine Meldungen. Im Reiter Live-Belegschaft können Sie ein Problem melden.',

    'clw.cmp.banner': 'Ihre Meldungen an die Zeitarbeitsfirmen — mit aktuellem Bearbeitungsstand. Der zuständige Disponent wird bei jeder Meldung sofort benachrichtigt und kann Ersatz stellen.',
    'clw.cmp.filter.all': 'Alle Meldungen',
    'clw.cmp.status.open': 'Offen',
    'clw.cmp.status.acknowledged': 'Angenommen',
    'clw.cmp.status.resolved': 'Erledigt',
    'clw.cmp.sev.low': 'Niedrig',
    'clw.cmp.sev.medium': 'Mittel',
    'clw.cmp.sev.high': 'Hoch',
    'clw.cmp.title': 'Problem melden',
    'clw.cmp.modalBanner': 'Ihre Meldung geht an die zuständige Zeitarbeitsfirma. Diese kann reagieren – z. B. einen Ersatz stellen.',
    'clw.cmp.severityLabel': 'Dringlichkeit',
    'clw.cmp.sevOpt.low': 'Niedrig – Hinweis',
    'clw.cmp.sevOpt.medium': 'Mittel – bitte prüfen',
    'clw.cmp.sevOpt.high': 'Hoch – dringend / Ersatz nötig',
    'clw.cmp.reasonLabel': 'Was ist das Problem?',
    'clw.cmp.reasonPh': 'z. B. wiederholt zu spät, Qualität unzureichend, Verhalten vor Ort',
    'clw.cmp.submit': 'Melden',
    'clw.cmp.busy': 'Wird gemeldet…',
    'clw.cmp.errReason': 'Bitte beschreiben Sie das Problem (mind. 3 Zeichen).',

    'clw.bl.banner.1': 'Gesperrte Kräfte werden diesem Unternehmen von den Zeitarbeitsfirmen',
    'clw.bl.banner.strong': 'nicht mehr zugewiesen',
    'clw.bl.banner.2': '. Sie entscheiden: dauerhaft, befristet (z. B. 3 Monate) oder wieder freigeben.',
    'clw.block.until': 'bis {date}',
    'clw.block.permanent': 'dauerhaft',

    'clw.blk.title': 'Kraft sperren',
    'clw.blk.duration': 'Dauer',
    'clw.blk.dur.permanent': 'Dauerhaft (nie wieder)',
    'clw.blk.dur.3m': 'Befristet: 3 Monate',
    'clw.blk.dur.custom': 'Befristet: bis Datum…',
    'clw.blk.reasonLabel': 'Grund (wird der Zeitarbeitsfirma angezeigt)',
    'clw.blk.reasonPh': 'z. B. wiederholt unentschuldigt gefehlt',
    'clw.blk.submit': 'Sperren',
    'clw.blk.errDate': 'Bitte ein Datum wählen.',

    'clw.err.generic': 'Fehler',
    'clw.err.load': 'Konnte nicht geladen werden: {detail}',
    'clw.err.block': 'Sperren fehlgeschlagen: {detail}',
    'clw.err.unblock': 'Freigeben fehlgeschlagen: {detail}',
    'clw.err.report': 'Melden fehlgeschlagen: {detail}',
    'clw.fallback.worker': 'Mitarbeiter'
  });
  TCi18n.register('en', {
    'clw.docTitle': 'Live workforce – TempConnect',

    'clw.paywall.title': 'Sign-in required',
    'clw.paywall.text': 'Please sign in to see your live workforce.',
    'clw.paywall.cta': 'Sign in',
    'clw.gate.title': 'For companies only',
    'clw.gate.text': 'The live workforce shows who is on assignment at your company. Your active organisation is not a company organisation.',
    'clw.gate.agencyHint': 'As a staffing firm you will find your own live board under staff members.',
    'clw.gate.agencyCta': 'Open the staffing firm live board',

    'clw.page.title': 'Live workforce',
    'clw.page.subtitle': 'Who from your staffing firms is working at your site right now – live, with reports and block list in one place.',

    'clw.help.summary': 'How does this page work?',
    'clw.help.live': 'Live: everyone currently on assignment with you – pulled automatically from the running assignments, refreshed every 30 seconds.',
    'clw.help.report': 'Report: if there is a problem with a staff member, your report reaches the responsible scheduler immediately – they can provide a replacement.',
    'clw.help.block': 'Block: a blocked staff member is no longer assigned to your company – permanently or for a fixed period, revocable at any time.',

    'clw.tab.live': 'Live workforce',
    'clw.tab.available': 'Available staff',
    'clw.tab.complaints': 'My reports',
    'clw.tab.blocklist': 'Block list',

    'clw.avail.banner.1': 'Available staff from every staffing firm on the platform – pulled automatically from their live workforce, with nobody maintaining offers.',
    'clw.avail.banner.strong': 'Book in three steps:',
    'clw.avail.banner.2': 'How many? From when to when? At what price? Staff blocked for your company do not appear here.',
    'clw.avail.rolePh': 'Role or qualification…',
    'clw.avail.roleHelp': 'e.g. forklift driver, care, electrical',
    'clw.avail.cityPh': 'City…',
    'clw.avail.cityHelp': 'Exact city name of the work site',
    'clw.avail.fromHelp': 'From when do you need the staff? The list shows what is available on that date.',
    'clw.avail.countPh': 'Count',
    'clw.avail.countHelp': 'How many staff at least? Offers with fewer open slots are hidden.',
    'clw.avail.th.role': 'Role / qualification',
    'clw.avail.th.city': 'City',
    'clw.avail.th.window': 'Available',
    'clw.avail.th.headcount': 'People',
    'clw.avail.th.price': 'Price range',
    'clw.avail.badge.auto': 'from live workforce',
    'clw.avail.badge.autoTitle': 'The platform generated this offer automatically from the staffing firm’s free capacity – it is as current as their live workforce.',
    'clw.avail.action.book': 'Book',
    'clw.avail.action.bookTitle': 'Book in three steps: count, period, price',
    'clw.avail.count.results': '{count} offers',
    'clw.avail.until': 'until {date}',
    'clw.avail.openEnd': 'from {date}, open end',
    'clw.avail.empty': 'No matching available staff. Adjust filters or the period – or create a demand under job postings and the staffing firms will come to you.',
    'clw.avail.merkmalLabel': 'Traits:',
    'clw.avail.merkmalHelp': 'Shows only staff whose staffing firm has given them this trait.',

    'clw.merkmal.zuverlaessig': 'Reliable',
    'clw.merkmal.sehr_fleissig': 'Very hardworking',
    'clw.merkmal.arbeitet_sauber': 'Works cleanly',
    'clw.merkmal.langfristig_einsetzbar': 'Deployable long-term',
    'clw.merkmal.kurzfristig_startklar': 'Ready at short notice',
    'clw.merkmal.schicht_flexibel': 'Shift-flexible',

    'clw.aueg.rest': 'AÜG: {monate} of 18 months – until {date}',
    'clw.aueg.alarm': 'AÜG limit exceeded (since {date})',
    'clw.aueg.help': 'Maximum assignment duration under § 1 AÜG: 18 months per worker at your company. Used: {monate} months, the limit ends {date}. Breaks shorter than 3 months still count. Compliance is the staffing firm’s responsibility – TempConnect does the maths and flags it for you.',
    'clw.aueg.bookOver': 'AÜG note: the selected period exceeds the 18-month maximum assignment duration. A compliant end would be {date} – please coordinate with your staffing firm.',
    'clw.aueg.bookNear': 'AÜG note: with this booking {monate} of 18 months are used. The maximum assignment duration ends on {date}.',

    'clw.price.hourly': '€/hr',
    'clw.price.daily': '€/day',
    'clw.price.fixed': '€ fixed',

    'clw.book.title': 'Booking in three steps',
    'clw.book.q1': '1. How many staff?',
    'clw.book.q2': '2. From when to when?',
    'clw.book.q3': '3. At what price?',
    'clw.book.endHelp': 'Leave empty = open end',
    'clw.book.countHint': '{count} available',
    'clw.book.windowHint': 'Offered: {window}',
    'clw.book.priceHintRange': 'Suggestion from the offer: {min}–{max} {unit} – within this range your choice is immediately binding.',
    'clw.book.priceHintNone': 'The offer names no price range – your proposal goes into the agreement.',
    'clw.book.submit': 'Book bindingly',
    'clw.book.busy': 'Booking…',
    'clw.book.doneTitle': 'Booking placed.',
    'clw.book.doneText': 'The assignment agreement has been created – the staffing firm is confirming it now. You can follow the status in the deal file at any time.',
    'clw.book.doneRef': 'Reference: {ref}',
    'clw.book.openDeal': 'Open deal file',
    'clw.book.err.blocked': 'This staff member is blocked for your company (block list). Lift the block if you want to use them again.',
    'clw.book.err.unavailable': 'Taken in the meantime – only {remaining} slots are left. Adjust the count or choose another offer.',
    'clw.book.err.notActive': 'This offer is no longer active. Refresh the list.',
    'clw.book.err.periodInvalid': 'Please choose a valid period (start before end).',
    'clw.book.err.periodPast': 'The start must not lie in the past.',
    'clw.book.err.periodOutside': 'The requested period lies outside the offer ({window}). Adjust it – or create your own demand.',
    'clw.book.err.priceInvalid': 'Please enter a valid price.',
    'clw.book.err.priceOutside': 'Your price lies outside the offered range ({min}–{max} {unit}). Within the range you book immediately – outside it you start a negotiation via the offer page.',
    'clw.book.err.generic': 'Booking failed: {detail}',

    'clw.live.banner.1': 'Real-time overview: these staff from your staffing firms are',
    'clw.live.banner.strong': 'currently on assignment with you',
    'clw.live.banner.2': '— pulled automatically from the running assignments of your organisation.',
    'clw.live.kpi.active': 'Currently on assignment',
    'clw.live.kpi.activeHelp': 'Staff with a running assignment at your site – excluding those currently unavailable.',
    'clw.live.kpi.ending': 'Ending shortly',
    'clw.live.kpi.endingHelp': 'Assignments ending within the next days – a good moment to extend or re-staff in time.',
    'clw.live.kpi.out': 'Unavailable',
    'clw.live.kpi.outHelp': 'Reported unavailable by the staffing firm. The reason is employee data and is deliberately not shown.',
    'clw.live.kpi.agencies': 'Staffing firms',
    'clw.live.kpi.agenciesHelp': 'This many staffing firms currently have staff on assignment with you.',
    'clw.live.searchPh': 'Staff member or company…',
    'clw.live.badge.soon': 'Ending soon',
    'clw.live.badge.active': 'On assignment',
    'clw.live.badge.out': 'Unavailable',
    'clw.live.badge.unknown': 'State unknown',
    'clw.live.openEnd': 'open',
    'clw.live.out.until': 'expected until {date}',
    'clw.live.out.openEnd': 'Return date still open',
    'clw.live.out.alsoEnding': 'assignment was ending shortly anyway',
    'clw.live.out.privacy': 'The staffing firm reported this worker as unavailable. The reason is employee data and is deliberately not shown to you.',
    'clw.live.slot.backup': 'Stand-in',
    'clw.live.slot.backupTitle': 'This worker is on the assignment as a replacement, not as the originally booked staffing.',

    'clw.th.worker': 'Staff member',
    'clw.th.agency': 'Staffing firm',
    'clw.th.role': 'Role',
    'clw.th.shift': 'Shift',
    'clw.th.since': 'Since',
    'clw.th.until': 'Until',
    'clw.th.status': 'Status',
    'clw.th.severity': 'Urgency',
    'clw.th.reason': 'Reason',
    'clw.th.reported': 'Reported',
    'clw.th.blockedUntil': 'Blocked until',

    'clw.action.refresh': 'Refresh',
    'clw.action.cancel': 'Cancel',
    'clw.action.close': 'Close',
    'clw.action.report': 'Report',
    'clw.action.reportTitle': 'Report an issue with this staff member to the staffing firm',
    'clw.action.block': 'Block',
    'clw.action.blockTitle': 'Block this staff member for your company',
    'clw.action.unblock': 'Unblock',
    'clw.action.unblockTitle': 'Lift the block – the staff member can be assigned to you again',

    'clw.count.onAssignment': '{count} on assignment',
    'clw.count.blocked': '{count} blocked',
    'clw.count.reports': '{count} reports',
    'clw.count.reportsOne': '1 report',
    'clw.count.reportsOpen': '{count} open',

    'clw.empty.live': 'Nobody is working at your site right now. As soon as staff are on assignment, they appear here live.',
    'clw.empty.blocklist': 'No blocked staff. You can block a staff member in the Live workforce tab.',
    'clw.empty.complaints': 'No reports yet. You can report an issue in the Live workforce tab.',

    'clw.cmp.banner': 'Your reports to the staffing firms — with the current processing status. The responsible scheduler is notified immediately for every report and can provide a replacement.',
    'clw.cmp.filter.all': 'All reports',
    'clw.cmp.status.open': 'Open',
    'clw.cmp.status.acknowledged': 'Acknowledged',
    'clw.cmp.status.resolved': 'Resolved',
    'clw.cmp.sev.low': 'Low',
    'clw.cmp.sev.medium': 'Medium',
    'clw.cmp.sev.high': 'High',
    'clw.cmp.title': 'Report an issue',
    'clw.cmp.modalBanner': 'Your report goes to the responsible staffing firm. They can react — for example by providing a replacement.',
    'clw.cmp.severityLabel': 'Urgency',
    'clw.cmp.sevOpt.low': 'Low – for information',
    'clw.cmp.sevOpt.medium': 'Medium – please review',
    'clw.cmp.sevOpt.high': 'High – urgent / replacement needed',
    'clw.cmp.reasonLabel': 'What is the problem?',
    'clw.cmp.reasonPh': 'e.g. repeatedly late, quality insufficient, conduct on site',
    'clw.cmp.submit': 'Report',
    'clw.cmp.busy': 'Sending…',
    'clw.cmp.errReason': 'Please describe the problem (at least 3 characters).',

    'clw.bl.banner.1': 'The staffing firms will',
    'clw.bl.banner.strong': 'no longer assign blocked staff to this company',
    'clw.bl.banner.2': '. You decide: permanently, for a fixed period (e.g. 3 months) or release them again.',
    'clw.block.until': 'until {date}',
    'clw.block.permanent': 'permanent',

    'clw.blk.title': 'Block staff member',
    'clw.blk.duration': 'Duration',
    'clw.blk.dur.permanent': 'Permanent (never again)',
    'clw.blk.dur.3m': 'Fixed period: 3 months',
    'clw.blk.dur.custom': 'Fixed period: until a date…',
    'clw.blk.reasonLabel': 'Reason (shown to the staffing firm)',
    'clw.blk.reasonPh': 'e.g. repeated unexcused absence',
    'clw.blk.submit': 'Block',
    'clw.blk.errDate': 'Please choose a date.',

    'clw.err.generic': 'Error',
    'clw.err.load': 'Could not be loaded: {detail}',
    'clw.err.block': 'Blocking failed: {detail}',
    'clw.err.unblock': 'Unblocking failed: {detail}',
    'clw.err.report': 'Reporting failed: {detail}',
    'clw.fallback.worker': 'Staff member'
  });

  /** Uebersetzung an der Verwendungsstelle. */
  function t(key, params) { return TCi18n.t(key, params); }
  /** Fehlerdetail aus einem API-Fehler — Code/Message bleiben roh (Diagnose). */
  function errDetail(e) { return (e && (e.code || e.message)) || t('clw.err.generic'); }

  // Escaped auch Apostrophe: Werte landen u.a. in onclick="fn('…')" — ohne &#39; koennte
  // ein Wert aus dem JS-String-Literal ausbrechen (heute nur DB-UUIDs, morgen evtl. Namen).
  function esc(v) {
    if (v == null) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // Datum bleibt bewusst selbst formatiert (feste zweistellige Teile) — die
  // Tabellenspalten sollen gleich breit bleiben. Englisch: dd/mm/yyyy (en-GB).
  function fmtDate(d) {
    if (!d) return '–';
    var p = String(d).split('T')[0].split('-');
    if (p.length !== 3) return '–';
    return TCi18n.locale() === 'en' ? (p[2] + '/' + p[1] + '/' + p[0]) : (p[2] + '.' + p[1] + '.' + p[0]);
  }
  function workerName(r) {
    return ((r.first_name || '') + ' ' + (r.last_name || '')).trim() || r.worker_email || t('clw.fallback.worker');
  }
  function isCompanyGateError(e) {
    var c = ((e && (e.code || e.error)) || '') + '';
    return /COMPANY_TIMESHEETS|BUYER_ORG|ORG_TYPE|NO_ORG_MEMBERSHIP|ORG_CONTEXT_REQUIRED/.test(c);
  }

  function show(which) {
    ['paywall', 'notCompany', 'main'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = (id === which) ? '' : 'none';
    });
  }

  var _liveLoaded = false;
  var _blocklistLoaded = false;
  var _complaintsLoaded = false;
  var _liveTimer = null;
  var _liveRows = [];
  var _blockRows = [];
  var _complaintRows = [];
  var _blkWorkerId = null;

  async function init() {
    try { await TC.api.get('/me'); }
    catch (e) { show('paywall'); return; }
    show('main');
    /* NACH dem /me-Erfolg, nicht davor: wer nicht angemeldet ist, sieht die
       Anmeldeflaeche — ein vorher geoeffneter Reiter waere ein kurzes
       Aufblitzen von Daten fuer genau diesen Besucher. */
    leseEinsatzAusAdresse();
    var hash = String((window.location && window.location.hash) || '');
    if (hash === '#meldungen') { clwView('complaints'); return; }
    if (hash === '#sperrliste') { clwView('blocklist'); return; }
    if (hash === '#verfuegbar') { clwView('available'); return; }
    /* Live ist der Startzustand — auch fuer '#live' aus alten Deep-Links. */
    clwView('live');
  }

  /* ── Der Deep-Link aus der Ausfallmeldung (Welle H1, umgezogen in J1) ────
     G4b verschickt '?einsatz=<id>' — der Link fuehrt zur ZEILE, nicht auf
     eine Uebersicht. Alte Links auf company-timesheets.html werden von dort
     hierher weitergeleitet, die Kennung bleibt dabei erhalten. */
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

  var VIEWS = { live: 'viewLive', available: 'viewAvailable', complaints: 'viewComplaints', blocklist: 'viewBlocklist' };
  var TABS = { live: 'tabLive', available: 'tabAvailable', complaints: 'tabComplaints', blocklist: 'tabBlocklist' };
  function clwView(mode) {
    Object.keys(VIEWS).forEach(function (k) {
      document.getElementById(VIEWS[k]).style.display = (k === mode) ? '' : 'none';
      document.getElementById(TABS[k]).classList.toggle('ct-tab--active', k === mode);
    });
    if (mode === 'live' && !_liveLoaded) clwLoadLive();
    if (mode === 'available' && !_availLoaded) clwLoadAvailable();
    if (mode === 'blocklist' && !_blocklistLoaded) clwLoadBlocklist();
    if (mode === 'complaints' && !_complaintsLoaded) clwLoadComplaints();
    if (mode === 'live') startLivePolling(); else stopLivePolling();
  }
  window.clwView = clwView;

  /* Eine Tafel, die "Live" heisst, muss sich auch von selbst erneuern —
     getaktet wie die Agenturtafel (Welle H1). */
  var LIVE_POLL_MS = 30000;
  var _livePoll = null;
  function startLivePolling() {
    stopLivePolling();
    _livePoll = setInterval(clwLoadLive, LIVE_POLL_MS);
  }
  function stopLivePolling() {
    if (_livePoll) { clearInterval(_livePoll); _livePoll = null; }
  }

  function clwLiveDebounce() { clearTimeout(_liveTimer); _liveTimer = setTimeout(clwLoadLive, 350); }
  window.clwLiveDebounce = clwLiveDebounce;

  async function clwLoadLive() {
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
        '<tr><td colspan="8" class="ct-empty">' + esc(t('clw.err.load', { detail: errDetail(e) })) + '</td></tr>';
    }
  }
  window.clwLoadLive = clwLoadLive;

  /* Die Zustaende stehen in einer TABELLE, nicht in einer Kette von Fragen.
     Der Grund ist ein konkreter Beinahe-Schaden (Welle H1): vorher war das
     ein binaeres Ternaer — alles ausser 'endet_bald' fiel in das gruene
     "Im Einsatz". Ein serverseitig ergaenzter Zustand haette also nicht
     GEFEHLT, sondern das Gegenteil behauptet. Deshalb: bekannte Zustaende
     einzeln, und ein unbekannter wird als unbekannt ausgewiesen. */
  var LIVE_BADGE = {
    faellt_aus:  { cls: 'ct-badge--out',  key: 'clw.live.badge.out' },
    endet_bald:  { cls: 'ct-badge--soon', key: 'clw.live.badge.soon' },
    im_einsatz:  { cls: 'ct-badge--live', key: 'clw.live.badge.active' }
  };
  function liveBadge(status) {
    var def = LIVE_BADGE[status];
    if (!def) {
      /* Kein Rueckfall auf einen gruenen Zustand: "ich weiss es nicht" ist
         eine ehrliche Auskunft, "Im Einsatz" waere eine falsche. */
      return '<span class="ct-badge" title="' + esc(String(status || '')) + '">' +
             esc(t('clw.live.badge.unknown')) + '</span>';
    }
    var titel = (status === 'faellt_aus') ? ' title="' + esc(t('clw.live.out.privacy')) + '"' : '';
    return '<span class="ct-badge ' + def.cls + '"' + titel + '>' + esc(t(def.key)) + '</span>';
  }

  /* Die Spalte "Rolle" zeigt die TAETIGKEIT (`worker_description`), nie den
     technischen Besetzungswert (`wal.role` ist ein CHECK auf
     'primary'|'backup'). Die Besetzungsart wird nur genannt, wenn sie etwas
     aussagt: "Springer" bei einem Ersatz. */
  function liveRoleCell(r) {
    var text = esc(r.worker_description || '–');
    if (String(r.role || '') !== 'backup') return text;
    return text + ' <span class="ct-badge ct-badge--soon" title="' +
           esc(t('clw.live.slot.backupTitle')) + '">' + esc(t('clw.live.slot.backup')) + '</span>';
  }

  /* Die Statuszelle. Bewusst NICHT die Spalte "Bis": die zeigt das Ende des
     EINSATZES. Das voraussichtliche Ende der Abwesenheit ist eine andere
     Groesse. Und: hier steht ausschliesslich DASS und BIS WANN — die Art der
     Abwesenheit kommt vom Server gar nicht erst mit (Art. 9 DSGVO). */
  /* AUEG-Konto (Welle J8): 18 Monate je Kraft je Unternehmen. Angezeigt wird
     nur, was Handlung braucht — ein Abzeichen an JEDER Zeile waere nach zwei
     Tagen Tapete. 'ok' bleibt deshalb stumm; die Zahl steht im Tooltip. */
  function auegZelle(r) {
    var a = r.aueg;
    if (!a || a.stufe === 'ok' || !a.frist_ende) return '';
    var cls = a.stufe === 'alarm' ? 'ct-badge--rej' : (a.stufe === 'warnung' ? 'ct-badge--out' : 'ct-badge--soon');
    var text = a.stufe === 'alarm'
      ? t('clw.aueg.alarm', { date: fmtDate(a.frist_ende) })
      : t('clw.aueg.rest', { monate: a.verbrauchte_monate, date: fmtDate(a.frist_ende) });
    return '<div style="margin-top:4px"><span class="ct-badge ' + cls + '" title="' +
      esc(t('clw.aueg.help', { monate: a.verbrauchte_monate, date: fmtDate(a.frist_ende) })) + '">' +
      esc(text) + '</span></div>';
  }

  function liveStatusCell(r) {
    var out = liveBadge(r.live_status);
    if (r.live_status !== 'faellt_aus') return out;
    var zusatz = r.ausfall_bis
      ? t('clw.live.out.until', { date: fmtDate(r.ausfall_bis) })
      : t('clw.live.out.openEnd');
    /* Das nahende Einsatzende geht nicht verloren, nur weil der Ausfall den
       Platz im Abzeichen bekommt (dieselbe Regel wie auf der Agenturtafel). */
    if (r.endet_bald) zusatz += ' · ' + t('clw.live.out.alsoEnding');
    return out + '<div class="ct-sub">' + esc(zusatz) + '</div>';
  }
  function renderLive(list) {
    _liveRows = list || [];
    document.getElementById('lwCount').textContent = t('clw.count.onAssignment', { count: _liveRows.length });
    var tb = document.getElementById('lwBody');
    if (!_liveRows.length) {
      tb.innerHTML = '<tr><td colspan="8" class="ct-empty">' + esc(t('clw.empty.live')) + '</td></tr>';
      return;
    }
    tb.innerHTML = _liveRows.map(function (r) {
      var shift = (r.shift_start && r.shift_end) ? (String(r.shift_start).slice(0, 5) + '–' + String(r.shift_end).slice(0, 5)) : '–';
      /* data-einsatz traegt die Einsatz-Kennung an der Zeile — der Anker, an
         dem der Deep-Link aus der Ausfallmeldung (G4b) landet. */
      return '<tr data-einsatz="' + esc(r.assignment_id || '') + '">' +
        '<td><div style="font-weight:600">' + esc(workerName(r)) + '</div>' + (r.personnel_number ? '<div class="ct-sub">' + esc(r.personnel_number) + '</div>' : '') +
          auegZelle(r) + '</td>' +
        '<td>' + esc(r.agency_name || '–') + '</td>' +
        '<td>' + liveRoleCell(r) + '</td>' +
        '<td>' + shift + '</td>' +
        '<td>' + fmtDate(r.start_date) + '</td>' +
        '<td>' + (r.effective_end_date ? fmtDate(r.effective_end_date) : esc(t('clw.live.openEnd'))) + '</td>' +
        '<td>' + liveStatusCell(r) + '</td>' +
        '<td style="text-align:right;white-space:nowrap">' +
          '<button class="ct-btn" style="margin-right:4px" onclick="clwComplain(\'' + esc(r.worker_user_id) + '\')" title="' + esc(t('clw.action.reportTitle')) + '">' + esc(t('clw.action.report')) + '</button>' +
          '<button class="ct-btn ct-btn--rej" onclick="clwBlock(\'' + esc(r.worker_user_id) + '\')" title="' + esc(t('clw.action.blockTitle')) + '">' + esc(t('clw.action.block')) + '</button>' +
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

  /* ── Verfuegbare Kraefte (Welle J2c): der Marktplatz aus Unternehmenssicht ──
     Gespeist aus dem Kapazitaets-Feed; die Automatik (J2b) haelt ihn aus der
     Live-Belegschaft aller Zeitarbeitsfirmen aktuell, der Server blendet
     gesperrte Kraefte aus und traegt den Buchungs-Riegel (accept-deal). */
  var _availLoaded = false;
  var _availRows = [];
  var _availTimer = null;
  var _bkEntry = null;

  function clwAvailDebounce() { clearTimeout(_availTimer); _availTimer = setTimeout(clwLoadAvailable, 350); }
  window.clwAvailDebounce = clwAvailDebounce;

  /* Merkmal-Filter (Welle J9): dieselben sechs Katalog-Schluessel wie der
     Server (workerMerkmalKatalog + DB-CHECK Mig 201). Ein unbekannter
     Schluessel wuerde dort mit MERKMAL_UNBEKANNT abgewiesen. */
  var MERKMAL_KATALOG = ['zuverlaessig', 'sehr_fleissig', 'arbeitet_sauber',
    'langfristig_einsetzbar', 'kurzfristig_startklar', 'schicht_flexibel'];
  var _availMerkmale = {};

  function merkmalBadges(liste, stil) {
    return (liste || []).map(function (key) {
      return '<span class="ct-badge ct-badge--ok" style="' + (stil || '') + '">' + esc(t('clw.merkmal.' + key) || key) + '</span>';
    }).join(' ');
  }

  function renderMerkmalFilter() {
    var el = document.getElementById('avMerkmale');
    if (!el) return;
    el.innerHTML = MERKMAL_KATALOG.map(function (key) {
      var an = !!_availMerkmale[key];
      return '<button type="button" class="ct-btn" style="padding:3px 10px;font-size:.75rem;border-radius:999px' +
        (an ? ';background:var(--ds-success-muted);border-color:var(--ds-success);color:var(--ds-success);font-weight:600' : '') +
        '" aria-pressed="' + an + '" onclick="clwToggleMerkmal(\'' + esc(key) + '\')">' +
        esc(t('clw.merkmal.' + key)) + '</button>';
    }).join('');
  }

  function clwToggleMerkmal(key) {
    if (_availMerkmale[key]) delete _availMerkmale[key]; else _availMerkmale[key] = true;
    renderMerkmalFilter();
    clwLoadAvailable();
  }
  window.clwToggleMerkmal = clwToggleMerkmal;

  async function clwLoadAvailable() {
    renderMerkmalFilter();
    var teile = ['limit=50'];
    var gewaehlt = Object.keys(_availMerkmale);
    if (gewaehlt.length) teile.push('merkmale=' + encodeURIComponent(gewaehlt.join(',')));
    var rolle = (document.getElementById('avRole').value || '').trim();
    var ort = (document.getElementById('avCity').value || '').trim();
    var ab = (document.getElementById('avFrom').value || '').trim();
    var anzahl = (document.getElementById('avCount').value || '').trim();
    if (rolle) teile.push('role=' + encodeURIComponent(rolle));
    if (ort) teile.push('city=' + encodeURIComponent(ort));
    if (ab) teile.push('availability_from=' + encodeURIComponent(ab));
    if (anzahl) teile.push('min_headcount=' + encodeURIComponent(anzahl));
    try {
      var data = await TC.api.get('/capacity-exchange/feed?' + teile.join('&'));
      _availLoaded = true;
      /* Nur die Angebotsseite: Bedarfe anderer Unternehmen gehoeren nicht in
         die Auswahl freier Kraefte. */
      _availRows = ((data && data.items) || []).filter(function (r) { return r.feed_type === 'supply'; });
      renderAvailable(_availRows);
    } catch (e) {
      document.getElementById('avBody').innerHTML =
        '<tr><td colspan="7" class="ct-empty">' + esc(t('clw.err.load', { detail: errDetail(e) })) + '</td></tr>';
    }
  }
  window.clwLoadAvailable = clwLoadAvailable;

  function preisEinheit(typ) {
    if (typ === 'daily') return t('clw.price.daily');
    if (typ === 'fixed') return t('clw.price.fixed');
    return t('clw.price.hourly');
  }
  function fmtPreis(r) {
    var min = r.price_min != null ? Number(r.price_min) : null;
    var max = r.price_max != null ? Number(r.price_max) : null;
    if (min == null && max == null) return '–';
    var zahl = (min != null && max != null && min !== max) ? (min + '–' + max) : String(min != null ? min : max);
    return zahl + ' ' + preisEinheit(r.price_type);
  }
  function freiePlaetze(r) {
    var n = (r.remaining_headcount != null) ? Number(r.remaining_headcount) : Number(r.headcount || 1);
    return Math.max(0, n);
  }
  function fensterText(r) {
    return r.availability_to
      ? (fmtDate(r.availability_from) + ' ' + t('clw.avail.until', { date: fmtDate(r.availability_to) }))
      : t('clw.avail.openEnd', { date: fmtDate(r.availability_from) });
  }

  function renderAvailable(list) {
    document.getElementById('avCountLabel').textContent = t('clw.avail.count.results', { count: list.length });
    var tb = document.getElementById('avBody');
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="7" class="ct-empty">' + esc(t('clw.avail.empty')) + '</td></tr>';
      return;
    }
    tb.innerHTML = list.map(function (r) {
      var autoBadge = (r.quelle === 'live_belegschaft')
        ? ' <span class="ct-badge ct-badge--done" title="' + esc(t('clw.avail.badge.autoTitle')) + '">' + esc(t('clw.avail.badge.auto')) + '</span>'
        : '';
      var firma = esc(r.org_name || r.supplier_company_name || '–') +
        (r.reputation_grade ? ' <span class="ct-badge ct-badge--ok" title="Zuverlässigkeit">' + esc(String(r.reputation_grade)) + '</span>' : '');
      var merkmale = merkmalBadges(r.markt_merkmale);
      return '<tr>' +
        '<td><div style="font-weight:600">' + esc(r.title || r.role || '–') + '</div>' +
          (r.role && r.title && r.role !== r.title ? '<div class="ct-sub">' + esc(r.role) + '</div>' : '') + autoBadge +
          (merkmale ? '<div style="margin-top:4px">' + merkmale + '</div>' : '') + '</td>' +
        '<td>' + firma + '</td>' +
        '<td>' + esc(r.location_city || '–') + (r.location_postal ? '<div class="ct-sub">' + esc(r.location_postal) + '</div>' : '') + '</td>' +
        '<td>' + esc(fensterText(r)) + '</td>' +
        '<td>' + freiePlaetze(r) + '</td>' +
        '<td>' + esc(fmtPreis(r)) + '</td>' +
        '<td style="text-align:right"><button class="ct-btn ct-btn--ok" onclick="clwBook(\'' + esc(r.id) + '\')" title="' + esc(t('clw.avail.action.bookTitle')) + '">' + esc(t('clw.avail.action.book')) + '</button></td>' +
      '</tr>';
    }).join('');
  }

  /* ── Das Buchungs-Modal: die drei Fragen (Plan J §0.2) ─────────────────── */

  function clwBook(entryId) {
    var r = _availRows.find(function (x) { return String(x.id) === String(entryId); });
    if (!r) return;
    _bkEntry = r;
    var zeile = esc((r.title || r.role || '') + ' · ' + (r.org_name || r.supplier_company_name || '') + ' · ' + (r.location_city || ''));
    var badges = merkmalBadges(r.markt_merkmale, 'font-size:.68rem');
    document.getElementById('bkOfferLine').innerHTML = zeile + (badges ? '<div style="margin-top:4px">' + badges + '</div>' : '');
    var frei = Math.max(1, freiePlaetze(r));
    var cnt = document.getElementById('bkCount');
    cnt.value = '1'; cnt.max = String(frei);
    document.getElementById('bkCountHint').textContent = t('clw.book.countHint', { count: frei });
    /* Vorbelegung Zeitraum: fruehester buchbarer Start ist heute bzw. der
       Angebotsbeginn — dieselbe Regel wie im Server (pruefeBuchungsWuensche). */
    var heute = isoDate(new Date());
    var von = String(r.availability_from || '').slice(0, 10);
    document.getElementById('bkStart').value = (von && von > heute) ? von : heute;
    document.getElementById('bkEnd').value = r.availability_to ? String(r.availability_to).slice(0, 10) : '';
    document.getElementById('bkWindowHint').textContent = t('clw.book.windowHint', { window: fensterText(r) });
    /* Vorbelegung Preis (Frage 3, "am besten mit Vorschlaegen"): die Mitte des
       angebotenen Rahmens, auf 50 Cent gerundet. */
    var min = r.price_min != null ? Number(r.price_min) : null;
    var max = r.price_max != null ? Number(r.price_max) : null;
    var vorschlag = (min != null && max != null) ? Math.round((min + max)) / 2 : (min != null ? min : (max != null ? max : ''));
    document.getElementById('bkPrice').value = vorschlag === '' ? '' : String(Math.round(vorschlag * 2) / 2);
    document.getElementById('bkPriceHint').textContent = (min != null || max != null)
      ? t('clw.book.priceHintRange', { min: (min != null ? min : max), max: (max != null ? max : min), unit: preisEinheit(r.price_type) })
      : t('clw.book.priceHintNone');
    document.getElementById('bkErr').style.display = 'none';
    document.getElementById('bkForm').style.display = '';
    document.getElementById('bkDone').style.display = 'none';
    var senden = document.getElementById('bkSubmit');
    senden.style.display = ''; senden.disabled = false; senden.textContent = t('clw.book.submit');
    document.getElementById('clwBookModal').classList.add('active');
  }
  window.clwBook = clwBook;

  function clwBookClose() { document.getElementById('clwBookModal').classList.remove('active'); _bkEntry = null; }
  window.clwBookClose = clwBookClose;

  function bkFehler(text) {
    var el = document.getElementById('bkErr');
    el.textContent = text; el.style.display = '';
  }

  /* Serverfehler in eine Handlungsanweisung uebersetzen. Der Server ist der
     Riegel — hier wird nur ERKLAERT, nie entschieden. */
  function bkFehlerText(e) {
    var code = String((e && (e.code || e.error)) || '');
    if (code === 'WORKER_BLOCKED_FOR_COMPANY') return t('clw.book.err.blocked');
    if (code === 'CAPACITY_UNAVAILABLE') return t('clw.book.err.unavailable', { remaining: (e && e.remaining_headcount != null) ? e.remaining_headcount : 0 });
    if (code === 'NOT_ACTIVE') return t('clw.book.err.notActive');
    if (code === 'PERIOD_INVALID') return t('clw.book.err.periodInvalid');
    if (code === 'PERIOD_IN_PAST') return t('clw.book.err.periodPast');
    if (code === 'PERIOD_OUTSIDE_OFFER') {
      var fenster = (e && e.offered_from) ? (fmtDate(e.offered_from) + '–' + (e.offered_to ? fmtDate(e.offered_to) : t('clw.live.openEnd'))) : (_bkEntry ? fensterText(_bkEntry) : '');
      return t('clw.book.err.periodOutside', { window: fenster });
    }
    if (code === 'PRICE_INVALID') return t('clw.book.err.priceInvalid');
    if (code === 'PRICE_OUTSIDE_OFFER') {
      return t('clw.book.err.priceOutside', {
        min: (e && e.price_min != null) ? e.price_min : '–',
        max: (e && e.price_max != null) ? e.price_max : '–',
        unit: preisEinheit(e && e.price_type)
      });
    }
    return t('clw.book.err.generic', { detail: errDetail(e) });
  }

  async function clwBookSubmit() {
    if (!_bkEntry) return;
    var body = { headcount: parseInt(document.getElementById('bkCount').value, 10) || 1 };
    var start = (document.getElementById('bkStart').value || '').trim();
    var ende = (document.getElementById('bkEnd').value || '').trim();
    var preis = (document.getElementById('bkPrice').value || '').trim();
    if (start) body.start_date = start;
    if (ende) body.end_date = ende;
    if (preis) body.price_value = parseFloat(preis);
    var senden = document.getElementById('bkSubmit');
    senden.disabled = true; senden.textContent = t('clw.book.busy');
    try {
      var ergebnis = await TC.api.post('/marketplace/capacity-posts/' + _bkEntry.id + '/accept-deal', body);
      document.getElementById('bkForm').style.display = 'none';
      document.getElementById('bkDone').style.display = '';
      senden.style.display = 'none';
      document.getElementById('bkDoneRef').textContent = ergebnis && ergebnis.agreement_ref
        ? t('clw.book.doneRef', { ref: ergebnis.agreement_ref }) : '';
      /* AUEG-Auskunft (Welle J8): die Buchung ist durch — die Frist wird
         trotzdem benannt, wenn sie knapp wird oder der Zeitraum sie reisst.
         Warnen, nicht blockieren: die Pflicht traegt die Zeitarbeitsfirma,
         aber planen muss der Kunde. */
      var a = ergebnis && ergebnis.aueg;
      var hinweis = document.getElementById('bkAueg');
      if (a && a.frist_ende && (!a.fristgerecht || a.stufe !== 'ok')) {
        hinweis.innerHTML = esc(!a.fristgerecht
          ? t('clw.aueg.bookOver', { date: fmtDate(a.spaetestes_fristgerechtes_ende) })
          : t('clw.aueg.bookNear', { monate: a.verbrauchte_monate, date: fmtDate(a.frist_ende) }));
        hinweis.style.display = '';
      } else { hinweis.style.display = 'none'; }
      var akte = document.getElementById('bkDoneLink');
      akte.href = (ergebnis && ergebnis.offer && ergebnis.offer.id)
        ? ('/public/offer_detail.html?id=' + encodeURIComponent(ergebnis.offer.id)) : '/public/deal_management.html';
      /* Die Liste stimmt jetzt nicht mehr (Plaetze reserviert) — neu laden. */
      _availLoaded = false;
      clwLoadAvailable();
    } catch (e) {
      bkFehler(bkFehlerText(e));
      senden.disabled = false; senden.textContent = t('clw.book.submit');
    }
  }
  window.clwBookSubmit = clwBookSubmit;

  /* ── Sperren-Modal + Sperrliste ──────────────────────────────────────── */
  var _blkSupplierOrgId = null;

  function clwBlock(workerId) {
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
  window.clwBlock = clwBlock;

  function clwBlkDurChange() {
    document.getElementById('blkUntil').style.display =
      document.getElementById('blkDuration').value === 'custom' ? '' : 'none';
  }
  window.clwBlkDurChange = clwBlkDurChange;

  function clwBlkClose() { document.getElementById('ctBlockModal').classList.remove('active'); _blkWorkerId = null; }
  window.clwBlkClose = clwBlkClose;

  function pad2(n) { return String(n).padStart(2, '0'); }
  function isoDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function blkErr(msg) { var el = document.getElementById('blkErr'); el.textContent = msg; el.style.display = ''; }

  async function clwBlkSubmit() {
    if (!_blkWorkerId) return;
    var dur = document.getElementById('blkDuration').value;
    var until = null;
    if (dur === '3m') { var d = new Date(); d.setMonth(d.getMonth() + 3); until = isoDate(d); }
    else if (dur === 'custom') {
      until = (document.getElementById('blkUntil').value || '').trim();
      if (!until) { blkErr(t('clw.blk.errDate')); return; }
    }
    var reason = (document.getElementById('blkReason').value || '').trim();
    try {
      await TC.api.post('/company/blocklist', {
        worker_user_id: _blkWorkerId,
        blocked_until: until,
        reason: reason || null,
        supplier_org_id: _blkSupplierOrgId || null
      });
      clwBlkClose();
      _blocklistLoaded = false;
      clwLoadBlocklist();
      clwView('blocklist');
    } catch (e) { blkErr(t('clw.err.block', { detail: errDetail(e) })); }
  }
  window.clwBlkSubmit = clwBlkSubmit;

  async function clwLoadBlocklist() {
    try {
      var data = await TC.api.get('/company/blocklist');
      _blocklistLoaded = true;
      renderBlocklist((data && data.items) || []);
    } catch (e) {
      if (isCompanyGateError(e)) { show('notCompany'); return; }
      document.getElementById('blBody').innerHTML =
        '<tr><td colspan="5" class="ct-empty">' + esc(t('clw.err.load', { detail: errDetail(e) })) + '</td></tr>';
    }
  }
  window.clwLoadBlocklist = clwLoadBlocklist;

  function renderBlocklist(list) {
    _blockRows = list || [];
    document.getElementById('blCount').textContent = t('clw.count.blocked', { count: _blockRows.length });
    var tb = document.getElementById('blBody');
    if (!_blockRows.length) {
      tb.innerHTML = '<tr><td colspan="5" class="ct-empty">' + esc(t('clw.empty.blocklist')) + '</td></tr>';
      return;
    }
    tb.innerHTML = _blockRows.map(function (b) {
      var until = b.blocked_until ? t('clw.block.until', { date: fmtDate(b.blocked_until) }) : t('clw.block.permanent');
      return '<tr>' +
        '<td><div style="font-weight:600">' + esc(workerName(b)) + '</div>' + (b.personnel_number ? '<div class="ct-sub">' + esc(b.personnel_number) + '</div>' : '') + '</td>' +
        '<td>' + esc(b.agency_name || '–') + '</td>' +
        '<td>' + esc(b.reason || '–') + '</td>' +
        '<td>' + esc(until) + '</td>' +
        '<td style="text-align:right"><button class="ct-btn ct-btn--ok" onclick="clwUnblock(\'' + esc(b.worker_user_id) + '\')" title="' + esc(t('clw.action.unblockTitle')) + '">' + esc(t('clw.action.unblock')) + '</button></td>' +
      '</tr>';
    }).join('');
  }

  async function clwUnblock(workerId) {
    try {
      await TC.api.delete('/company/blocklist/' + workerId);
      clwLoadBlocklist();
    } catch (e) { alert(t('clw.err.unblock', { detail: errDetail(e) })); }
  }
  window.clwUnblock = clwUnblock;

  /* ── Meine Meldungen: Rueckkanal zu den gemeldeten Problemen ───────────── */
  // Status-Werte exakt wie der CHECK in Migration 150: open | acknowledged | resolved.
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

  async function clwLoadComplaints() {
    var s = document.getElementById('cmpFilterStatus').value;
    try {
      var data = await TC.api.get('/company/complaints' + (s ? ('?status=' + encodeURIComponent(s)) : ''));
      _complaintsLoaded = true;
      renderComplaints((data && data.items) || []);
    } catch (e) {
      if (isCompanyGateError(e)) { show('notCompany'); return; }
      document.getElementById('cmpBody').innerHTML =
        '<tr><td colspan="6" class="ct-empty">' + esc(t('clw.err.load', { detail: errDetail(e) })) + '</td></tr>';
    }
  }
  window.clwLoadComplaints = clwLoadComplaints;

  function renderComplaints(list) {
    _complaintRows = list || [];
    var open = _complaintRows.filter(function (c) { return c.status === 'open' || c.status === 'in_progress'; }).length;
    document.getElementById('cmpCount').textContent =
      (_complaintRows.length === 1 ? t('clw.count.reportsOne') : t('clw.count.reports', { count: _complaintRows.length })) +
      (open ? (' · ' + t('clw.count.reportsOpen', { count: open })) : '');
    var tb = document.getElementById('cmpBody');
    if (!_complaintRows.length) {
      tb.innerHTML = '<tr><td colspan="6" class="ct-empty">' + esc(t('clw.empty.complaints')) + '</td></tr>';
      return;
    }
    tb.innerHTML = _complaintRows.map(function (c) {
      var stCls = CMP_STATUS_CLASS[c.status] || 'ct-badge--done';
      var svCls = CMP_SEVERITY_CLASS[c.severity] || 'ct-badge--done';
      var stLabel = t('clw.cmp.status.' + c.status) || c.status || '–';
      var svLabel = t('clw.cmp.sev.' + c.severity) || c.severity || '–';
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

  /* ── Beschwerde-Meldung ─────────────────────────────────────────────── */
  var _cmpWorkerId = null;
  var _cmpLinkId = null;

  function clwComplain(workerId) {
    var w = _liveRows.find(function (r) { return String(r.worker_user_id) === String(workerId); }) || {};
    _cmpWorkerId = workerId;
    _cmpLinkId = w.link_id || null;
    document.getElementById('cmpWorkerName').textContent = workerName(w) + (w.agency_name ? ' · ' + w.agency_name : '');
    document.getElementById('cmpSeverity').value = 'medium';
    document.getElementById('cmpReason').value = '';
    document.getElementById('cmpErr').style.display = 'none';
    document.getElementById('ctComplaintModal').classList.add('active');
  }
  window.clwComplain = clwComplain;

  function clwCompClose() { document.getElementById('ctComplaintModal').classList.remove('active'); _cmpWorkerId = null; }
  window.clwCompClose = clwCompClose;

  async function clwCompSubmit() {
    if (!_cmpWorkerId) return;
    var reason = (document.getElementById('cmpReason').value || '').trim();
    var err = document.getElementById('cmpErr');
    if (reason.length < 3) { err.textContent = t('clw.cmp.errReason'); err.style.display = ''; return; }
    var btn = document.getElementById('cmpSubmit');
    btn.disabled = true; btn.textContent = t('clw.cmp.busy');
    try {
      await TC.api.post('/company/complaints', {
        worker_user_id: _cmpWorkerId,
        assignment_link_id: _cmpLinkId || null,
        severity: document.getElementById('cmpSeverity').value,
        reason: reason
      });
      clwCompClose();
      // Ripple: die gerade abgesetzte Meldung muss sofort im Rueckkanal sichtbar sein.
      _complaintsLoaded = false;
      clwLoadComplaints();
    } catch (e) {
      err.textContent = t('clw.err.report', { detail: errDetail(e) }); err.style.display = '';
    } finally { btn.disabled = false; btn.textContent = t('clw.cmp.submit'); }
  }
  window.clwCompSubmit = clwCompSubmit;

  /* Sprachwechsel: alles, was JS gebaut hat, traegt bewusst KEINEN data-i18n-Marker
     (sonst wuerde das naechste apply() Zeilen mit Laufzeitwerten entkernen). Deshalb
     zeichnen wir die bereits geladenen Listen aus dem Cache neu — ohne einen
     einzigen zusaetzlichen Netzabruf. */
  document.addEventListener('tc:langchange', function () {
    if (_liveLoaded) renderLive(_liveRows);
    renderMerkmalFilter();
    if (_availLoaded) renderAvailable(_availRows);
    if (_blocklistLoaded) renderBlocklist(_blockRows);
    if (_complaintsLoaded) renderComplaints(_complaintRows);
  });

  // Modal-Klick ausserhalb schliesst
  document.getElementById('ctBlockModal').addEventListener('click', function (e) { if (e.target === this) clwBlkClose(); });
  document.getElementById('ctComplaintModal').addEventListener('click', function (e) { if (e.target === this) clwCompClose(); });
  document.getElementById('clwBookModal').addEventListener('click', function (e) { if (e.target === this) clwBookClose(); });

  init();
})();
