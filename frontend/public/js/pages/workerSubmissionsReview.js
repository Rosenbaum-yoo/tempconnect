"use strict";

/* ── Woerterbuch (P6.1, DE/EN) ─────────────────────────────────────────────
   worker-submissions-review.html laedt i18n.js im head; dieses Modul laeuft
   ausschliesslich auf dieser Seite, TCi18n ist hier also garantiert da.

   Bewusst NICHT uebersetzt:
   - Status-Rohwerte (submitted, approved_internal, sent_to_customer, ...) und
     alle Fehler-Codes der API: das sind Server-Enums, keine Anzeigetexte.
   - Namen, Kunden, Orte, Notizen, Personalnummern: reine API-Datenwerte.
   - Topbar/Navigation: kommt aus pageShell.js.

   Drei-Seiten-Regel: Diese Flaeche traegt zwei Rollen. Die Agentur sieht den
   operativen Einsatzleitstand, das Unternehmen eine lesende Einsatzverfolgung
   (Company-Soft-Lock in initializePage). Deshalb fuehren wir fuer die
   Unternehmenssicht EIGENE Schluessel (ts.rev.company.*) statt einen
   Rollenbegriff als festen Wert einzufrieren.
   Begriffswelt EN: Einsatz = assignment, Stundenzettel = timesheet,
   Arbeitsplatzangebot = job posting, Deal = deal.                            */
TCi18n.register('de', {
  'ts.rev.docTitle': 'Einsätze & Zeiten – TempConnect',
  'ts.rev.page.title': 'Einsätze & Zeiten',
  'ts.rev.page.subtitle': 'Einsatzkräfte, Stundenzettel, Kundenfreigaben und Nachweise – im Pilotkern zentral steuern.',

  'ts.rev.company.subtitle': 'Einsatzstatus, Zeitfreigaben und Abrechnungsstand Ihres Personaldienstleisters – lesend über Deals und Activity.',
  'ts.rev.company.lockTitle': 'Einsatzverfolgung (Unternehmenssicht)',
  'ts.rev.company.lockText': 'Dieser Arbeitsplatz ist der operative Einsatzleitstand Ihres Personaldienstleisters. Einsatzstatus, Zeitfreigaben und Abrechnungsstand sehen Sie als Unternehmen lesend über Deals und Activity.',

  'ts.rev.banner.eyebrow': 'Pilot-Standard',
  'ts.rev.banner.title': 'Besetzung, Kundenversand und Freigaben müssen hier reibungsfrei sitzen',
  'ts.rev.banner.text': 'Dieser Bereich trägt die operative Reife nach dem Dealabschluss: Worker-Zuweisung, laufender Einsatz, Stundenzettel-Freigabe und der sichtbare nächste Schritt für Buyer und Supplier.',
  'ts.rev.banner.asideTitle': 'Fokus jetzt',
  'ts.rev.banner.asideText': 'Offene Einreichungen, Kundenfreigaben und Besetzungsstatus zuerst glattziehen; Begleit- und Dokumententhemen bleiben nachrangig.',

  'ts.rev.onboarding.title': 'Plattform einrichten',
  'ts.rev.onboarding.toggle': 'Auf-/Zuklappen',
  'ts.rev.onboarding.dismiss': 'Ausblenden',

  'ts.rev.hub.current.title': 'Einsätze & Zeiten',
  'ts.rev.hub.current.desc': 'Sie befinden sich im operativen Einsatz- und Zeitbereich.',
  'ts.rev.hub.subs.title': 'Stundenzettel & Freigaben',
  'ts.rev.hub.subs.desc': 'Einreichungen prüfen, an Kunden senden und Freigaben sauber steuern.',
  'ts.rev.hub.workers.title': 'Einsatzkräfte',
  'ts.rev.hub.workers.desc': 'Einsatzkräfte, Einladungen und operative Stammdaten pflegen.',
  'ts.rev.hub.approvals.title': 'Freigabe-Queue',
  'ts.rev.hub.approvals.desc': 'Ausstehende Genehmigungen über Einsätze, Zeiten und Nachweise hinweg.',
  'ts.rev.hub.timesheets.title': 'Stundenzettel',
  'ts.rev.hub.timesheets.desc': 'Zeiterfassung, Freigabe und Abrechnungsgrundlage im Detail.',
  'ts.rev.hub.docs.title': 'Nachweise & Dokumente',
  'ts.rev.hub.docs.desc': 'Dokumente, Zertifikate und Nachweise einsatznah verwalten.',

  'ts.rev.tab.subs': 'Stundenzettel-Freigaben',
  'ts.rev.tab.workers': 'Einsatzkräfte',
  'ts.rev.tab.asgn': 'Einsätze',

  'ts.rev.cust.title': 'Kundenversand Stundenzettel',
  'ts.rev.cust.subtitle': 'Status aller Kundenversand-Vorgänge auf einen Blick',
  'ts.rev.cust.ready': 'Versandbereit',
  'ts.rev.cust.sent': 'Gesendet',
  'ts.rev.cust.open': 'Beim Kunden',
  'ts.rev.cust.confirmed': 'Bestätigt',
  'ts.rev.cust.rejected': 'Abgelehnt',
  'ts.rev.cust.posted': 'Abrechnung',
  'ts.rev.cust.openSent': 'Gesendete Bundles öffnen',
  'ts.rev.cust.filterAtCustomer': 'Beim Kunden filtern',
  'ts.rev.cust.showRejections': 'Ablehnungen zeigen',
  'ts.rev.cust.btnReady': '{n} versandbereite Positionen anzeigen',
  'ts.rev.cust.btnReadyNone': 'Versandbereite Positionen anzeigen',
  'ts.rev.cust.badgeAction': 'Handlungsbedarf',
  'ts.rev.cust.badgeReady': '{n} versandbereit',
  'ts.rev.cust.badgeOpen': '{n} offen beim Kunden',
  'ts.rev.cust.badgeAllPosted': 'Alles abgerechnet',
  'ts.rev.cust.badgeFlow': 'Kundenflow',
  'ts.rev.cust.hintRejected': '{n} Stundenzettel wurden vom Kunden abgelehnt. Bitte prüfen und korrigieren.',
  'ts.rev.cust.hintReady': '{n} intern freigegebene Positionen sind bereit für den Kundenversand.',
  'ts.rev.cust.hintOpen': '{n} Positionen warten auf Kundenrückmeldung.',
  'ts.rev.cust.hintDone': 'Alle Positionen sind bestätigt oder in Abrechnung. Kein Handlungsbedarf.',

  'ts.rev.bundle.prepare': 'Sammelversand vorbereiten',
  'ts.rev.bundle.week': 'Woche',
  'ts.rev.bundle.month': 'Monat',
  'ts.rev.bundle.internalOnly': 'Nur intern freigegeben',
  'ts.rev.bundle.sentTitle': 'Gesendete Bundles',
  'ts.rev.bundle.flowPill': 'Kundenflow',
  'ts.rev.bundle.emptyPreview': 'Keine freigegebenen Positionen für Sammelversand.',
  'ts.rev.bundle.emptySent': 'Noch kein Sammelversand durchgeführt.',
  'ts.rev.bundle.clientFallback': 'Kunde',
  'ts.rev.bundle.positions': '{n} Positionen',
  'ts.rev.bundle.rangeTo': 'bis',
  'ts.rev.bundle.send': 'Sammelversand',
  'ts.rev.bundle.preview': 'Vorschau',
  'ts.rev.bundle.details': 'Details',
  'ts.rev.bundle.post': 'In Abrechnung',
  'ts.rev.bundle.counts': 'Pos.: {items} · Bestätigt: {confirmed} · Abgerechnet: {posted}',
  'ts.rev.bundle.progressSent': 'Gesendet {a}/{b}',
  'ts.rev.bundle.progressConfirmed': 'Bestätigt {a}/{b}',
  'ts.rev.bundle.previewToast': 'Vorschau: {n} Positionen bereit für {period}',
  'ts.rev.bundle.notFound': 'Bundle nicht gefunden',
  'ts.rev.bundle.postFailed': 'Bundle konnte nicht gebucht werden',
  'ts.rev.bundle.postDone': 'Bundle in Abrechnung überführt ({n})',
  'ts.rev.bundle.used': 'Für Abrechnung verwendet',
  'ts.rev.bundle.stillOpen': 'Noch offen',
  'ts.rev.bundle.open': 'Öffnen',
  'ts.rev.bundle.searchPh': 'Filter Mitarbeiter/Kunde/Status…',
  'ts.rev.bundle.sortHoursDesc': 'Stunden hoch→niedrig',
  'ts.rev.bundle.sortHoursAsc': 'Stunden niedrig→hoch',
  'ts.rev.bundle.sortStatus': 'Status',
  'ts.rev.bundle.colWorker': 'Mitarbeiter',
  'ts.rev.bundle.colClient': 'Kunde',
  'ts.rev.bundle.colPeriod': 'Zeitraum',
  'ts.rev.bundle.colHours': 'Stunden',
  'ts.rev.bundle.colStatus': 'Status',
  'ts.rev.bundle.colBilling': 'Abrechnung',
  'ts.rev.bundle.colAction': 'Aktion',
  'ts.rev.bundle.statusSent': 'Gesendet',
  'ts.rev.bundle.statusConfirmed': 'Bestätigt',
  'ts.rev.bundle.statusRejected': 'Abgelehnt',

  'ts.rev.bundleDrw.title': 'Bundle-Details',
  'ts.rev.bundleDrw.subtitle': 'Status und Abrechnungsmarker pro Position',

  'ts.rev.kpi.submitted': 'Eingereicht',
  'ts.rev.kpi.inReview': 'In Prüfung',
  'ts.rev.kpi.needsCorrection': 'Korrektur nötig',
  'ts.rev.kpi.approvedInternal': 'Intern geprüft',
  'ts.rev.kpi.atCustomer': 'Beim Kunden',
  'ts.rev.kpi.confirmed': 'Bestätigt',
  'ts.rev.kpi.custRejected': 'Kd. abgelehnt',
  'ts.rev.kpi.posted': 'In Abrechnung',

  'ts.rev.filter.pending': 'Ausstehend',
  'ts.rev.filter.underReview': 'In Prüfung',
  'ts.rev.filter.correction': 'Korrektur',
  'ts.rev.filter.internal': 'Intern geprüft',
  'ts.rev.filter.atCustomer': 'Beim Kunden',
  'ts.rev.filter.confirmed': 'Bestätigt',
  'ts.rev.filter.rejected': 'Abgelehnt',
  'ts.rev.filter.posted': 'Abrechnung',
  'ts.rev.filter.all': 'Alle',

  'ts.rev.detail.emptyTitle': 'Einreichung auswählen',
  'ts.rev.detail.emptyText': 'Wählen Sie links eine Einreichung aus, um Details und Aktionen anzuzeigen.',
  'ts.rev.detail.loadError': 'Fehler beim Laden:',
  'ts.rev.detail.colDay': 'Tag',
  'ts.rev.detail.colDate': 'Datum',
  'ts.rev.detail.colRegular': 'Reg.',
  'ts.rev.detail.colOvertime': 'Überstd.',
  'ts.rev.detail.colBreak': 'Pause',
  'ts.rev.detail.colFrom': 'Von',
  'ts.rev.detail.colTo': 'Bis',
  'ts.rev.detail.entries': 'Tageseinträge',
  'ts.rev.detail.assignmentAt': 'Einsatz bei:',
  'ts.rev.detail.overtime': 'Überstunden',
  'ts.rev.detail.checkedInternal': 'Int. geprüft',
  'ts.rev.detail.workerComment': 'Arbeitnehmer:',
  'ts.rev.detail.reviewNote': 'Prüfhinweis:',
  'ts.rev.detail.posted': 'Stundenzettel gebucht',
  'ts.rev.detail.postedLink': 'In Stundenzettel-Verwaltung',
  'ts.rev.detail.breakMinutes': 'min Pause',
  'ts.rev.detail.hoursPerWeek': 'h/Woche',

  'ts.rev.detail.customerNotified': 'Kunde per E-Mail benachrichtigt',
  'ts.rev.detail.customerNotifiedTo': 'an',
  'ts.rev.detail.customerNoMail': 'Keine Kundenkontakt-E-Mail hinterlegt – Kunde wurde nicht per E-Mail benachrichtigt.',
  'ts.rev.detail.customerRejectedAt': 'Abgelehnt:',

  'ts.rev.act.startReview': 'Prüfung starten',
  'ts.rev.act.correction': 'Korrektur',
  'ts.rev.act.correctionPh': 'Was soll der Mitarbeiter korrigieren?',
  'ts.rev.act.requestCorrection': 'Korrektur anfordern',
  'ts.rev.act.rejectPh': 'Warum wird abgelehnt?',
  'ts.rev.act.sendToCustomer': 'An Kunden senden',
  'ts.rev.act.noteOptional': 'Notiz (optional)',
  'ts.rev.act.internalNotePh': 'Interne Notiz…',
  'ts.rev.act.send': 'Senden',
  'ts.rev.act.customerConfirmed': 'Kunde hat bestätigt',
  'ts.rev.act.customerRejected': 'Kunde hat abgelehnt',
  'ts.rev.act.confirmedBy': 'Bestätigt durch',
  'ts.rev.act.recordConfirmation': 'Bestätigung erfassen',
  'ts.rev.act.reasonOrNote': 'Grund / Notiz',
  'ts.rev.act.customerRejectPh': 'Warum hat der Kunde abgelehnt?',
  'ts.rev.act.backToReview': 'Zurück zur Prüfung',
  'ts.rev.act.needCorrectionNote': 'Bitte Korrekturhinweis eingeben',
  'ts.rev.act.doneReview': 'Prüfung gestartet',
  'ts.rev.act.doneApprove': 'Intern genehmigt',
  'ts.rev.act.doneCorrection': 'Korrektur angefordert',
  'ts.rev.act.doneReject': 'Abgelehnt',
  'ts.rev.act.sentAndMailed': 'An Kunden gesendet und per E-Mail benachrichtigt',
  'ts.rev.act.sentNoMail': 'An Kunden gesendet (keine E-Mail-Adresse hinterlegt)',
  'ts.rev.act.confirmationSaved': 'Kundenbestätigung erfasst',

  'ts.rev.subs.emptyTitle': 'Alles erledigt',
  'ts.rev.subs.emptyText': 'Keine Einreichungen in dieser Kategorie.',
  'ts.rev.subs.noAccessTitle': tt('ts.rev.subs.noAccessTitle'),
  'ts.rev.subs.partialTitle': 'Teilansicht aktiv.',
  'ts.rev.subs.partialAccessText': 'Einzelne Kundenflow-Elemente sind für Ihren aktuellen Zugriff nicht verfügbar.',
  'ts.rev.subs.partialLoadText': 'Einzelne Zusatzbereiche konnten nicht geladen werden. Die Freigabenliste bleibt nutzbar.',
  'ts.rev.subs.loadFailTitle': 'Stundenzettel & Freigaben konnten nicht geladen werden.',

  'ts.rev.next.submitted': 'Prüfen & freigeben',
  'ts.rev.next.underReview': 'Freigeben oder Korrektur anfordern',
  'ts.rev.next.needsCorrection': 'Wartet auf Korrektur des Mitarbeiters',
  'ts.rev.next.approvedInternal': 'Bereit – an Kunde senden',
  'ts.rev.next.sentToCustomer': 'Beim Kunden – Bestätigung ausstehend',
  'ts.rev.next.customerConfirmed': 'Bestätigt – für Abrechnung verwenden',
  'ts.rev.next.customerRejected': 'Vom Kunden abgelehnt – klären',

  'ts.rev.notice.partialAccess': tt('ts.rev.notice.partialAccess'),
  'ts.rev.notice.wrksManageText': 'Einladungen, Aktivierungen und Pflegeaktionen sind für Ihre aktuelle Rolle nicht freigeschaltet.',
  'ts.rev.notice.wrksManageShort': 'Einladungen und Pflegeaktionen sind für Ihre aktuelle Rolle nicht freigeschaltet.',
  'ts.rev.notice.asgnEditText': 'Sie können Einsatzkonfigurationen sehen, aber Staffing- und Zuweisungsaktionen sind für Ihre aktuelle Rolle nicht freigeschaltet.',
  'ts.rev.notice.retryLater': 'Bitte später erneut versuchen.',
  'ts.rev.notice.noOrgAccess': 'Der Bereich ist für Ihren aktuellen Organisationskontext nicht freigeschaltet.',

  'ts.rev.access.deniedTitle': 'Kein Zugriff',
  'ts.rev.access.initFailTitle': 'Seite konnte nicht initialisiert werden',
  'ts.rev.access.initFailText': 'Der aktuelle Zugriffs- und Organisationskontext ist derzeit nicht verfügbar.',
  'ts.rev.access.noAreaTitle': 'Kein Zugriff auf diesen Bereich',
  'ts.rev.access.noAreaText': 'Für Ihren aktuellen Organisationskontext sind hier keine operativen Bereiche freigeschaltet.',

  'ts.rev.fastTrack.openedTitle': 'Staffing-Fast-Track geöffnet.',
  'ts.rev.fastTrack.openedText': 'Der Deal verweist direkt auf die Einsatzbesetzung, aber Ihre aktuelle Rolle darf keine Staffing-Aktionen ausführen.',
  'ts.rev.fastTrack.activeTitle': 'Staffing-Fast-Track aktiv.',
  'ts.rev.fastTrack.activeText': '{open} offene Plätze sind direkt geladen. Sichere Direktzuweisung, Anfrage und manuelle Zuweisung laufen auf derselben Einsatzkarte weiter.',
  'ts.rev.fastTrack.filledTitle': 'Deal-Einsatz bereits vollständig besetzt.',
  'ts.rev.fastTrack.filledText': 'Die Schnellroute hat keine offenen Plätze mehr. Bestehende Links und Verlauf bleiben weiter über diese Seite sichtbar.',
  'ts.rev.fastTrack.closedTitle': 'Deal-Einsatz nicht mehr offen.',
  'ts.rev.fastTrack.closedText': 'Der direkte Staffing-Einstieg wurde aufgerufen, aber dieser Einsatz taucht nicht mehr in den offenen Deal-Einsätzen auf.',
  'ts.rev.fastTrack.openedFromDeal': 'Direkt aus dem staffing-bereiten Deal geöffnet.',

  'ts.rev.perm.generic': 'Keine Berechtigung für diese Aktion',
  'ts.rev.perm.staffingDetails': 'Sie können Einsätze sehen, aber keine Staffing-Details öffnen.',
  'ts.rev.perm.staffingFilter': 'Sie können Staffing-Vorschläge nicht filtern.',
  'ts.rev.perm.staffingRefresh': 'Sie können Einsätze sehen, aber keine Staffing-Details aktualisieren.',
  'ts.rev.perm.staffingActions': 'Sie können Einsätze sehen, aber keine Staffing- oder Zuweisungsaktionen ausführen.',
  'ts.rev.perm.workerActivate': 'Sie können Einsatzkräfte sehen, aber nicht aktivieren oder deaktivieren.',
  'ts.rev.perm.workerInvites': 'Sie können Einladungen für Einsatzkräfte nicht verwalten.',
  'ts.rev.perm.workerInviteSend': 'Sie können Einsatzkräfte sehen, aber keine Einladungen versenden.',
  'ts.rev.perm.workerCreate': 'Sie können Einsatzkräfte nicht neu anlegen.',
  'ts.rev.perm.directAssign': 'Sie können keine direkte Einsatzzuweisung aus dem Worker-Bereich ausführen.',
  'ts.rev.perm.choiceSet': 'Sie können keine Auswahlphase für Worker anlegen.',
  'ts.rev.perm.choiceFinal': 'Sie können keine finale Zuweisung aus einer Auswahlphase auslösen.',
  'ts.rev.perm.quickAssign': 'Sie können keine sichere Direktzuweisung ausführen.',
  'ts.rev.perm.staffingRequest': 'Sie können keine Staffing-Anfragen versenden.',
  'ts.rev.perm.waitlist': 'Sie können keine Worker auf die Waitlist setzen.',
  'ts.rev.perm.waitlistWave': 'Sie können keine weitere Waitlist-Welle auslösen.',
  'ts.rev.perm.dealAssign': 'Sie können Deal-Einsätze nicht zuweisen.',
  'ts.rev.perm.lnkEdit': 'Sie können Einsatzkonfigurationen sehen, aber nicht bearbeiten.',
  'ts.rev.perm.lnkSave': 'Sie können Einsatzkonfigurationen nicht speichern.',
  'ts.rev.perm.lnkRole': 'Einsatzverknüpfungen sind für Ihre aktuelle Rolle nicht freigeschaltet.',
  'ts.rev.perm.cardRole': 'Die Einsatzkarte ist für Ihre aktuelle Rolle nicht freigeschaltet.',
  'ts.rev.perm.complaint': 'Sie können Meldungen sehen, aber nicht bearbeiten.',
  'ts.rev.perm.replacement': 'Sie können keinen Ersatz zuweisen.',
  'ts.rev.perm.planBlock': 'Sie können keine Einsätze planen.',
  'ts.rev.perm.staffingRoleShort': 'Staffing- und Zuweisungsaktionen sind für Ihre aktuelle Rolle nicht freigeschaltet.',

  'ts.rev.msg.error': 'Fehler',
  'ts.rev.msg.filterLoadFailed': 'Filter konnte nicht geladen werden',
  'ts.rev.msg.saveFailed': 'Konnte nicht gespeichert werden:',
  'ts.rev.msg.assignError': 'Fehler bei Zuweisung',
  'ts.rev.msg.saveError': 'Fehler beim Speichern',

  'ts.rev.staffing.loadingDetails': 'Lade Staffing-Details…',
  'ts.rev.staffing.loadFailed': 'Laden fehlgeschlagen',
  'ts.rev.staffing.loadingContext': 'Lade Einsatz-, Konflikt- und Staffing-Kontext…',
  'ts.rev.staffing.suggestions': 'Vorschläge & Live-Status',
  'ts.rev.staffing.chooseWorker': 'Worker wählen…',
  'ts.rev.staffing.noSuggestions': 'Keine geeigneten Worker-Vorschläge gefunden.',
  'ts.rev.staffing.noWaitlist': 'Noch keine Waitlist-Einträge vorhanden.',
  'ts.rev.staffing.noRequests': 'Noch keine aktiven Request-Interaktionen vorhanden.',
  'ts.rev.staffing.noChoiceSets': 'Noch keine aktiven Worker-Auswahlphasen für diesen Einsatz.',
  'ts.rev.staffing.quickAssignRunning': 'Direktzuweisung läuft…',
  'ts.rev.staffing.quickAssignCta': 'Sichere Auswahl direkt zuweisen',
  'ts.rev.staffing.quickAssignLabel': 'Direktzuweisung:',
  'ts.rev.staffing.quickAssignSafe': 'Safe Case laut Guardrails',
  'ts.rev.staffing.quickAssignBlocked': 'Nur Anfrage oder Waitlist sinnvoll',
  'ts.rev.staffing.noExtraSignals': 'Noch keine Zusatzsignale',
  'ts.rev.staffing.running': 'Läuft…',
  'ts.rev.staffing.assignDirect': 'Direkt zuweisen',
  'ts.rev.staffing.waitlistSelection': 'Auswahl auf Waitlist',
  'ts.rev.staffing.nextWave': 'Nächste Welle',
  'ts.rev.staffing.activeWorkers': 'Aktive Worker:',
  'ts.rev.staffing.autoBackfill': 'Auto-Backfill aktiv:',
  'ts.rev.staffing.autoBackfillText': 'Nachsteuerung läuft über die letzte Bulk-Kampagne.',
  'ts.rev.staffing.guardrailHint': 'Direktzuweisung nutzt dieselben Guardrails wie die manuelle Zuweisung und führt pro Worker ein deterministisches Ergebnis zurück.',
  'ts.rev.staffing.choiceHeading': 'Worker-Auswahlphase / Präferenzen',
  'ts.rev.staffing.requestHeading': 'Request-Status / Worker-Kommunikation',
  'ts.rev.staffing.openQuestions': 'Offene Fragen {q} · Reminder-Wünsche {r}',
  'ts.rev.staffing.waitlistHeading': 'Waitlist / Nachrücker',
  'ts.rev.staffing.detailsFollow': 'Details folgen',
  'ts.rev.staffing.noResponse': 'Noch keine Rückmeldung',
  'ts.rev.staffing.workerAction': 'Worker-Aktion {at}',
  'ts.rev.staffing.dispatcherAction': 'Dispatcher-Aktion {at}',
  'ts.rev.staffing.workerFavourite': 'Worker-Favorit',
  'ts.rev.staffing.choiceSetFallback': 'Worker-Auswahlphase',
  'ts.rev.staffing.deadline': 'Frist',
  'ts.rev.staffing.selectWorkerFirst': tt('ts.rev.staffing.selectWorkerFirst'),
  'ts.rev.staffing.assignedCount': '{n} Worker direkt zugewiesen',
  'ts.rev.staffing.requestedCount': '{n} Worker angefragt',
  'ts.rev.staffing.waitlistedCount': '{n} Worker auf Waitlist gesetzt',
  'ts.rev.staffing.waitlistFailed': tt('ts.rev.staffing.waitlistFailed'),
  'ts.rev.staffing.waveFailed': tt('ts.rev.staffing.waveFailed'),
  'ts.rev.staffing.noTopCandidates': 'Keine freien Top-Kandidaten verfügbar',
  'ts.rev.staffing.topFailed': tt('ts.rev.staffing.topFailed'),
  'ts.rev.staffing.bulkMessage': 'Automatische Sammelanfrage – noch offen: {open}',
  'ts.rev.staffing.dealAssignmentFallback': 'Deal-Einsatz',

  'ts.rev.drawer.role': 'Rolle:',
  'ts.rev.drawer.client': 'Kunde:',
  'ts.rev.drawer.clientUnknown': 'Nicht angegeben',
  'ts.rev.drawer.slots': 'Slots:',
  'ts.rev.drawer.slotsValue': '{filled} besetzt · {reserved} reserviert · {open} offen von {requested}',
  'ts.rev.drawer.workerCheck': 'Worker-Prüfung',
  'ts.rev.drawer.score': 'Score {score}',
  'ts.rev.drawer.noMatchContext': 'Noch kein Match-Kontext',
  'ts.rev.drawer.fitFallback': 'Der Worker-Kontext wird nur für diese konkrete Einsatzoption bewertet.',
  'ts.rev.drawer.liveStatus': 'Laufender Staffing-Status',
  'ts.rev.drawer.choiceSetsForWorker': 'Auswahlphasen für diesen Worker:',
  'ts.rev.drawer.noChoiceSet': 'Keine aktive Auswahlphase',
  'ts.rev.drawer.manualAssign': 'Manuell zuweisen',
  'ts.rev.drawer.manualAssignAnyway': 'Trotz Hinweis manuell zuweisen',
  'ts.rev.drawer.manualImpossible': 'Manuell nicht möglich',
  'ts.rev.drawer.contextClose': 'Kontext schließen',
  'ts.rev.drawer.contextCheck': 'Kontext prüfen',
  'ts.rev.drawer.contextLoading': 'Kontext wird nachgeladen',
  'ts.rev.drawer.assignTitle': 'Einsatz direkt zuweisen',
  'ts.rev.drawer.assignSubtitle': '{worker} – bestehende Assignment-Logik mit vollständigem Worker-Kontext nutzen',
  'ts.rev.drawer.workerLoading': 'Worker-Kontext wird geladen',
  'ts.rev.drawer.workerLoadFailed': 'Worker konnte nicht geladen werden',
  'ts.rev.drawer.openDealsFailed': 'Offene Deal-Einsätze konnten nicht geladen werden.',
  'ts.rev.drawer.contextFailed': 'Kontext konnte nicht geladen werden.',
  'ts.rev.drawer.noWorkerSelected': 'Kein Worker für die Direktzuweisung ausgewählt',
  'ts.rev.drawer.notEligible': 'Dieser Worker ist für eine manuelle Zuweisung aktuell nicht freigegeben.',
  'ts.rev.drawer.assignedManually': 'Worker manuell dem Deal-Einsatz zugewiesen',
  'ts.rev.drawer.confirmWorker': 'Worker: {worker}',
  'ts.rev.drawer.confirmAssignment': 'Einsatz: {assignment}',
  'ts.rev.drawer.warnOpenInvite': 'Für diesen Einsatz läuft bereits eine offene Staffing-Anfrage.',
  'ts.rev.drawer.warnContacted': 'Der Worker wurde für diesen Einsatz bereits kontaktiert.',
  'ts.rev.drawer.confirmCheck': 'Bitte prüfen:',
  'ts.rev.drawer.confirmQuestion': 'Jetzt manuell zuweisen?',
  'ts.rev.drawer.signalReservations': '{n} aktive Reservierungen auf diesem Einsatz',
  'ts.rev.drawer.signalOpenInvite': 'Offene Staffing-Anfrage läuft bereits',
  'ts.rev.drawer.signalContacted': 'Worker wurde hier bereits kontaktiert',
  'ts.rev.drawer.signalSameClient': '{n} frühere Einsätze beim selben Kunden',
  'ts.rev.drawer.signalChoiceSets': '{n} aktive Auswahlphasen für diesen Worker',

  'ts.rev.wrk.kpiActive': 'Aktive Mitarbeiter',
  'ts.rev.wrk.kpiInvites': 'Offene Einladungen',
  'ts.rev.wrk.kpiInactive': 'Inaktive Accounts',
  'ts.rev.wrk.kpiTotal': 'Gesamt',
  'ts.rev.wrk.searchPh': 'Mitarbeiter suchen…',
  'ts.rev.wrk.invite': '+ Einladen',
  'ts.rev.wrk.createManual': '+ Manuell anlegen',
  'ts.rev.wrk.colWorker': 'Mitarbeiter',
  'ts.rev.wrk.colNumber': 'Personalnr.',
  'ts.rev.wrk.colStatus': 'Status',
  'ts.rev.wrk.colSince': 'Dabei seit',
  'ts.rev.wrk.colActions': 'Aktionen',
  'ts.rev.wrk.emptyTitle': 'Noch keine Mitarbeiter',
  'ts.rev.wrk.emptyText': 'Laden Sie Ihre ersten Arbeitnehmer ein, damit diese ihre Stundenzettel digital einreichen können.',
  'ts.rev.wrk.emptyCta': '+ Ersten Mitarbeiter einladen',
  'ts.rev.wrk.invitesTitle': 'Offene Einladungen',
  'ts.rev.wrk.noAccessTitle': 'Kein Zugriff auf Einsatzkräfte.',
  'ts.rev.wrk.loadFailTitle': 'Einsatzkräfte konnten nicht geladen werden.',
  'ts.rev.wrk.invitesFailTitle': 'Einladungen konnten nicht geladen werden.',
  'ts.rev.wrk.assignAssignment': 'Einsatz zuweisen',
  'ts.rev.wrk.showAssignments': 'Einsätze',
  'ts.rev.wrk.active': 'Aktiv',
  'ts.rev.wrk.inactive': 'Inaktiv',
  'ts.rev.wrk.invitedExpires': 'Eingeladen {rel} – läuft ab {exp}',
  'ts.rev.wrk.inviteResent': 'Einladung erneut gesendet',
  'ts.rev.wrk.inviteRevoked': 'Einladung widerrufen',
  'ts.rev.wrk.errNameMail': 'Bitte Vorname, Nachname und E-Mail ausfüllen.',
  'ts.rev.wrk.errMail': 'Bitte eine gültige E-Mail-Adresse eingeben.',
  'ts.rev.wrk.errNameMailPw': 'Bitte Vorname, Nachname, E-Mail und Passwort ausfüllen.',
  'ts.rev.wrk.errPwLength': 'Passwort muss mindestens 8 Zeichen haben.',
  'ts.rev.wrk.errMailExists': 'Diese E-Mail-Adresse existiert bereits.',
  'ts.rev.wrk.created': 'Mitarbeiter {first} {last} angelegt',
  'ts.rev.wrk.createBtn': 'Mitarbeiter anlegen',
  'ts.rev.wrk.statActive': 'Aktive Einsätze',
  'ts.rev.wrk.statDocs': 'Dokumente',
  'ts.rev.wrk.availabilityNote': 'Verfügbarkeitsnotiz:',
  'ts.rev.wrk.docsExpired': '{n} Dokumente abgelaufen.',
  'ts.rev.wrk.docsExpiring': '{n} Nachweise laufen bald ab.',
  'ts.rev.wrk.nextExpiry': 'Nächster Ablauf: {date}.',
  'ts.rev.wrk.manualCheck': 'Manuelle Prüfung',

  'ts.rev.asgn.kpiActive': 'Aktive Einsätze',
  'ts.rev.asgn.kpiConfigured': 'Konfiguriert',
  'ts.rev.asgn.kpiNoBriefing': 'Ohne Anweisungen',
  'ts.rev.asgn.kpiWorkers': 'Mitarbeiter',
  'ts.rev.asgn.searchPh': 'Mitarbeiter oder Kunden suchen…',
  'ts.rev.asgn.assignCta': '+ Personal zuweisen',
  'ts.rev.asgn.tabActive': 'Aktiv',
  'ts.rev.asgn.tabArchive': 'Archiv',
  'ts.rev.asgn.tabAll': 'Alle',
  'ts.rev.asgn.viewCards': 'Karten',
  'ts.rev.asgn.viewPlan': 'Planung',
  'ts.rev.asgn.dealTitle': 'Deal-Einsätze (Worker zuweisen)',
  'ts.rev.asgn.choiceSetCta': '+ Auswahlphase anlegen',
  'ts.rev.asgn.closedTitle': 'Abgeschlossene Deals',
  'ts.rev.asgn.closedHint': 'Vollständig besetzte, beendete oder stornierte Deals bleiben hier für Nachbearbeitung sichtbar.',
  'ts.rev.asgn.emptyTitle': 'Keine Einsatz-Konfigurationen',
  'ts.rev.asgn.emptyText': 'Sobald Arbeitnehmer Einsätzen zugeordnet werden, erscheinen sie hier zur Konfiguration.',
  'ts.rev.asgn.noAccessTitle': 'Kein Zugriff auf Einsätze.',
  'ts.rev.asgn.loadFailTitle': 'Einsätze konnten nicht geladen werden.',
  'ts.rev.asgn.dealLoadFailTitle': 'Offene Deal-Einsätze konnten nicht geladen werden.',
  'ts.rev.asgn.noStaffingRights': 'Keine Staffing-Rechte.',
  'ts.rev.asgn.workerPickFailTitle': 'Worker-Auswahl konnte nicht geladen werden.',
  'ts.rev.asgn.manualLimited': 'Manuelle Zuweisung eingeschränkt.',
  'ts.rev.asgn.workerPickNoAccess': 'Die Worker-Auswahl ist für Ihren aktuellen Organisationskontext nicht verfügbar.',
  'ts.rev.asgn.closedLoadFail': 'Abgeschlossene Deals konnten nicht geladen werden.',
  'ts.rev.asgn.slotsFilled': '{filled} von {requested} besetzt',
  /* Ansprechperson beim KUNDEN — aus dem Bedarf. Das Angebot traegt die
     eigene; diese Flaeche ist die des Anbieters. */
  'ts.rev.asgn.clientContact': 'Ansprechperson beim Kunden:',
  'ts.rev.asgn.slots': '{filled} besetzt · {reserved} reserviert · {open} offen von {requested}',
  'ts.rev.asgn.statusActive': 'Aktiv',
  'ts.rev.asgn.statusArchived': 'Archiv',
  'ts.rev.asgn.rowClient': 'Kunde',
  'ts.rev.asgn.rowClientEmpty': 'Kein Kundenname',
  'ts.rev.asgn.rowPeriod': 'Zeitraum',
  'ts.rev.asgn.rowPeriodEmpty': 'Kein Datum gesetzt',
  'ts.rev.asgn.replaceCta': 'Ersatz zuweisen',
  'ts.rev.asgn.replaceTitle': 'Bei Krankheit/Ausfall: Ersatz ab Wirk-Datum zuweisen, Ausfallenden freistellen',
  'ts.rev.asgn.withdrawCta': 'Anfrage zurückziehen',
  'ts.rev.asgn.withdrawTitle': 'Die offene Anfrage zurückziehen — der Platz wird sofort wieder frei. Möglich, solange nicht zugesagt wurde.',
  'ts.rev.asgn.withdrawPrompt': 'Warum wird die Anfrage zurückgezogen? Der Grund steht im Audit, nicht in der Nachricht an die Einsatzkraft.',
  'ts.rev.asgn.withdrawNeedsReason': 'Bitte einen Grund angeben (mindestens 3 Zeichen).',
  'ts.rev.asgn.withdrawDone': 'Anfrage zurückgezogen — der Platz ist wieder offen.',
  'ts.rev.asgn.withdrawTooLate': 'Zu spät: Die Anfrage wurde inzwischen beantwortet oder ist verfallen.',
  'ts.rev.asgn.withdrawGone': 'Diese Anfrage gibt es nicht mehr.',
  'ts.rev.asgn.withdrawFailed': 'Die Anfrage konnte nicht zurückgezogen werden.',
  'ts.rev.asgn.hoursPerDay': 'h/Tag',

  'ts.rev.assign.title': 'Manuelle Zuweisung → Worker',
  'ts.rev.assign.subtitle': 'Personalangebot oder Deal-Einsatz einem Mitarbeiter zuweisen (Schichtzeiten, Kunde, Notizen)',
  'ts.rev.assign.hint': 'Für Bulk-/Sofortzuweisung ohne Detailpflege nutzen Sie weiterhin die Sektion „Deal-Einsätze (Worker zuweisen)“ weiter unten. Dieser Drawer ist bewusst der manuelle Detailpfad.',
  'ts.rev.assign.loading': 'Lade verfügbare Personalkapazitäten und Deal-Einsätze…',
  'ts.rev.assign.source': 'Personal oder Deal-Einsatz',
  'ts.rev.assign.worker': 'Mitarbeiter',
  'ts.rev.assign.start': 'Startdatum',
  'ts.rev.assign.end': 'Enddatum',
  'ts.rev.assign.hoursPerDay': 'Stunden / Tag',
  'ts.rev.assign.break': 'Pause (Min.)',
  'ts.rev.assign.shiftStart': 'Schichtbeginn',
  'ts.rev.assign.shiftEnd': 'Schichtende',
  'ts.rev.assign.clientName': 'Kundenname',
  'ts.rev.assign.clientNamePh': 'z.B. BMW AG',
  'ts.rev.assign.notes': 'Notizen',
  'ts.rev.assign.notesPh': 'Interne Hinweise…',
  'ts.rev.assign.emptyTitle': 'Nichts manuell Zuweisbares',
  'ts.rev.assign.emptyText': 'Aktuell gibt es weder freie Personalkapazitäten noch Deal-Einsätze mit offenen Plätzen in Ihrem Verantwortungsbereich.',
  'ts.rev.assign.groupCapacity': 'Eigene Personalkapazitäten',
  'ts.rev.assign.groupDeals': 'Deal-Einsätze mit offenen Plätzen',
  'ts.rev.assign.optionOpenOf': '{open} offen von {total}',
  'ts.rev.assign.capacityFallback': 'Personalkapazität',
  'ts.rev.assign.loadFailTitle': 'Personalkapazitäten konnten derzeit nicht geladen werden.',
  'ts.rev.assign.loadFailText': 'Bitte erneut versuchen.',
  'ts.rev.assign.technicalDetails': 'Technische Details',
  'ts.rev.assign.missingFields': 'Bitte Personal/Einsatz, Mitarbeiter und Startdatum auswählen.',
  'ts.rev.assign.infoClient': 'Kunde:',
  'ts.rev.assign.infoStaff': 'Personal:',
  'ts.rev.assign.blockedSuffix': '— gesperrt bei diesem Kunden',
  'ts.rev.assign.blockedTitle': '{n} Kraft/Kräfte von diesem Kunden gesperrt',
  'ts.rev.assign.blockedHint': '— im Dropdown deaktiviert. Grund: {names}',
  'ts.rev.assign.doneDeal': 'Deal-Einsatz zugewiesen – Worker wird benachrichtigt',
  'ts.rev.assign.doneCapacity': 'Personal zugewiesen – Worker wird benachrichtigt',
  'ts.rev.assign.errCapacityNotFound': 'Personalangebot nicht gefunden.',
  'ts.rev.assign.errCapacityNotAssignable': 'Personalangebot nicht zuweisbar.',
  'ts.rev.assign.errAssignmentNotFound': 'Deal-Einsatz nicht gefunden.',
  'ts.rev.assign.errAssignmentNotAssignable': 'Deal-Einsatz nicht zuweisbar.',
  'ts.rev.assign.errAssignmentFilled': 'Deal-Einsatz ist bereits voll besetzt.',
  'ts.rev.assign.errWorkerLinked': 'Worker ist diesem Einsatz bereits zugeordnet.',
  'ts.rev.assign.errWorkerNotFound': 'Mitarbeiter nicht gefunden.',
  'ts.rev.assign.errWorkerInactive': 'Mitarbeiter ist inaktiv.',
  'ts.rev.assign.errScheduleConflict': 'Zeitraum-Konflikt mit bestehendem Einsatz.',

  'ts.rev.deal.errNotFound': 'Einsatz nicht gefunden.',
  'ts.rev.deal.errNotAssignable': 'Einsatz ist aktuell nicht zuweisbar.',
  'ts.rev.deal.errFilled': 'Einsatz ist bereits vollständig besetzt.',
  'ts.rev.deal.errAlreadyAssigned': 'Worker ist diesem Einsatz bereits zugeordnet.',
  'ts.rev.deal.errWorkerLinked': 'Worker hat bereits einen aktiven Link für diesen Einsatz.',
  'ts.rev.deal.errWorkerNotFound': 'Worker nicht gefunden.',
  'ts.rev.deal.errWorkerInactive': 'Worker ist inaktiv.',
  'ts.rev.deal.errScheduleConflict': 'Zeitraum-Konflikt mit bestehendem Einsatz oder Reservierung.',
  'ts.rev.deal.assigned': 'Worker dem Deal-Einsatz zugewiesen',
  'ts.rev.deal.selectWorker': 'Bitte Worker auswählen',
  'ts.rev.deal.noOpen': 'Keine offenen Deal-Einsätze verfügbar.',

  'ts.rev.choice.title': 'Worker-Auswahlphase anlegen',
  'ts.rev.choice.subtitle': 'Mehrere offene Einsätze für einen Worker als kontrollierte Auswahlgruppe freigeben',
  'ts.rev.choice.hint': 'Der bestehende Staffing-Flow bleibt führend. Sie geben hier nur eine zusätzliche Präferenz- oder Auswahlphase frei; die finale Zuweisung bleibt weiterhin kontrolliert in Ihrer Hand.',
  'ts.rev.choice.worker': 'Worker',
  'ts.rev.choice.mode': 'Modus',
  'ts.rev.choice.modePreference': 'Nur Präferenz',
  'ts.rev.choice.modeRanked': 'Priorisierte Auswahl',
  'ts.rev.choice.modeFree': 'Freie Wahl innerhalb freigegebener Optionen',
  'ts.rev.choice.deadline': 'Antwortfrist',
  'ts.rev.choice.titleField': 'Titel',
  'ts.rev.choice.titlePh': 'z.B. Auswahl möglicher Einsätze für nächste Woche',
  'ts.rev.choice.message': 'Nachricht an den Worker',
  'ts.rev.choice.messagePh': 'Kurzer Hinweis, worauf der Worker bei der Auswahl achten soll…',
  'ts.rev.choice.options': 'Freigegebene Einsatzoptionen',
  'ts.rev.choice.needTwoOptions': 'Für eine Auswahlphase werden mindestens zwei offene Einsatzoptionen benötigt.',
  'ts.rev.choice.noActiveWorkers': 'Keine aktiven Worker für eine Auswahlphase verfügbar.',
  'ts.rev.choice.prepareFailed': 'Auswahlphase konnte nicht vorbereitet werden',
  'ts.rev.choice.selectWorker': 'Bitte einen Worker auswählen.',
  'ts.rev.choice.selectTwoOptions': 'Bitte mindestens zwei Einsatzoptionen freigeben.',
  'ts.rev.choice.created': 'Auswahlphase für {n} Optionen angelegt',
  'ts.rev.choice.createFailed': 'Auswahlphase konnte nicht angelegt werden',
  'ts.rev.choice.errWorkerNotFound': 'Worker nicht gefunden.',
  'ts.rev.choice.errWorkerInactive': 'Der gewählte Worker ist inaktiv.',
  'ts.rev.choice.errInvalidMode': 'Ungültiger Auswahlmodus.',
  'ts.rev.choice.errInvalidDeadline': 'Die Antwortfrist ist ungültig.',
  'ts.rev.choice.errAssignmentNotFound': 'Mindestens ein Einsatz wurde nicht gefunden.',
  'ts.rev.choice.errAssignmentNotAssignable': 'Mindestens ein Einsatz ist nicht zuweisbar.',
  'ts.rev.choice.errAssignmentFilled': 'Mindestens ein Einsatz ist bereits vollständig besetzt.',
  'ts.rev.choice.errNoEligible': 'Für mindestens einen Einsatz konnte kein Staffing-Invite erzeugt werden.',
  'ts.rev.choice.errOptionActive': 'Für diesen Worker ist mindestens eine der gewählten Optionen bereits in einer aktiven Auswahlphase enthalten.',
  'ts.rev.choice.errInviteFailed': 'Die Auswahlphase konnte nicht vollständig vorbereitet werden.',
  'ts.rev.choice.staleReload': 'Auswahlphase konnte nicht mehr aufgelöst werden. Bitte aktualisieren.',
  'ts.rev.choice.confirmOther': '{worker} hat eine andere Präferenz signalisiert. Diese Option trotzdem final zuweisen?',
  'ts.rev.choice.confirmFinal': 'Diesen Einsatz jetzt final zuweisen?',
  'ts.rev.choice.workerFallback': 'Der Worker',
  'ts.rev.choice.overridePrompt': 'Optionale Override-Notiz für Audit und Nachvollziehbarkeit:',
  'ts.rev.choice.finalFailed': 'Finale Zuweisung fehlgeschlagen',
  'ts.rev.choice.errSetNotFound': 'Auswahlphase nicht gefunden.',
  'ts.rev.choice.errOptionNotFound': 'Auswahloption nicht gefunden.',
  'ts.rev.choice.errAlreadyAssigned': 'Die Auswahlphase ist bereits final zugewiesen.',
  'ts.rev.choice.errAlreadyDeclined': 'Die Auswahlphase wurde bereits abgelehnt.',
  'ts.rev.choice.errExpired': 'Die Auswahlphase ist abgelaufen.',
  'ts.rev.choice.errCancelled': 'Die Auswahlphase wurde geschlossen.',
  'ts.rev.choice.errReservationNotFound': 'Die Reservierung wurde nicht gefunden.',
  'ts.rev.choice.errAsgNotFound': 'Der Einsatz wurde nicht gefunden.',
  'ts.rev.choice.errAsgNotAssignable': 'Der Einsatz ist nicht zuweisbar.',
  'ts.rev.choice.errReservationInactive': 'Die Reservierung ist nicht mehr aktiv.',
  'ts.rev.choice.errReservationExpired': 'Die Reservierung ist abgelaufen.',
  'ts.rev.choice.errAsgFilled': 'Der Einsatz ist bereits vollständig besetzt.',
  'ts.rev.choice.errWorkerAssigned': 'Der Worker ist dort bereits zugewiesen.',
  'ts.rev.choice.errWorkerLinked': 'Der Worker hat bereits einen aktiven Link für diesen Einsatz.',
  'ts.rev.choice.errWorkerNotFound2': 'Worker nicht gefunden.',
  'ts.rev.choice.errWorkerInactive2': 'Der Worker ist inaktiv.',
  'ts.rev.choice.errScheduleConflict': 'Die finale Zuweisung kollidiert mit einem bestehenden Zeitraum.',
  'ts.rev.choice.errAsgNotAssignable2': 'Der Einsatz ist aktuell nicht zuweisbar.',
  'ts.rev.choice.errNoWorkersSelected': 'Bitte mindestens einen Worker auswählen.',

  'ts.rev.quick.openAfter': 'Noch {n} offene Plätze nach der Direktzuweisung.',
  'ts.rev.quick.summary': '{assigned} direkt zugewiesen · {skipped} nicht ausgeführt · offen danach {open}',
  'ts.rev.quick.skippedLinked': 'Bereits verknüpft',
  'ts.rev.quick.skippedFilled': 'Einsatz bereits voll',
  'ts.rev.quick.failedNotFound': 'Worker fehlt',
  'ts.rev.quick.failedInactive': 'Worker inaktiv',

  'ts.rev.match.noReason': 'Noch keine Match-Begründung',
  'ts.rev.match.availability': 'Verfügbarkeit',
  'ts.rev.match.qualification': 'Nachweise',
  'ts.rev.match.reliability': 'Zuverlässigkeit',

  'ts.rev.invite.title': 'Arbeitnehmer einladen',
  'ts.rev.invite.subtitle': 'Einladungs-E-Mail wird automatisch versendet',
  'ts.rev.invite.howLabel': 'So funktioniert es:',
  'ts.rev.invite.howText': 'Der Arbeitnehmer erhält einen Einladungs-Link per E-Mail. Dort setzt er sein Passwort und kann sofort seine Stundenzettel digital einreichen – kein App-Download, kein kompliziertes Setup.',
  'ts.rev.invite.firstNamePh': 'z.B. Anna',
  'ts.rev.invite.lastNamePh': 'z.B. Kraft',

  'ts.rev.create.title': 'Mitarbeiter manuell anlegen',
  'ts.rev.create.subtitle': 'Account wird sofort aktiv – kein Einladungslink nötig',
  'ts.rev.create.hintLabel': 'Direkte Erstellung:',
  'ts.rev.create.hintText': 'Der Account ist sofort aktiv. Der Mitarbeiter kann sich mit E-Mail und dem hier gesetzten Passwort im Einsatzportal anmelden.',
  'ts.rev.create.firstNamePh': 'z.B. Max',
  'ts.rev.create.lastNamePh': 'z.B. Müller',

  'ts.rev.field.firstName': 'Vorname',
  'ts.rev.field.lastName': 'Nachname',
  'ts.rev.field.email': 'E-Mail-Adresse',
  'ts.rev.field.personnelNumber': 'Personalnummer',
  'ts.rev.field.personnelNumberPh': 'z.B. W-0042',
  'ts.rev.field.optional': '(optional)',
  'ts.rev.field.phone': 'Telefon',
  'ts.rev.field.optional2': '(optional)',
  'ts.rev.field.firstName2': 'Vorname',
  'ts.rev.field.lastName2': 'Nachname',
  'ts.rev.field.email2': 'E-Mail-Adresse',
  'ts.rev.field.password': 'Passwort',
  'ts.rev.field.passwordPh': 'Mind. 8 Zeichen',
  'ts.rev.field.personnelNumber2': 'Personalnummer',
  'ts.rev.field.personnelNumberPh2': 'z.B. W-0042',
  'ts.rev.field.phone2': 'Telefon',
  'ts.rev.field.street': 'Straße',
  'ts.rev.field.streetPh': 'z.B. Musterstr. 12',
  'ts.rev.field.zip': 'PLZ',
  'ts.rev.field.zipPh': 'z.B. 80331',
  'ts.rev.field.city': 'Stadt',
  'ts.rev.field.cityPh': 'z.B. München',
  'ts.rev.field.pleaseSelect': '– Bitte wählen –',
  'ts.rev.field.pleaseSelect2': '– Bitte wählen –',
  'ts.rev.field.pleaseSelect3': '– Bitte wählen –',

  'ts.rev.wrkAssign.hint': 'Sie bleiben im operativen Worker-Bereich. Der bestehende Assignment-Flow bleibt führend; hier wird nur der direkte Einstieg mit bereits ausgewähltem Worker aktiviert.',
  'ts.rev.wrkAssign.loading': 'Offene Deal-Einsätze und Staffing-Kontext werden geladen…',
  'ts.rev.wrkAssign.emptyTitle': 'Keine offenen Deal-Einsätze',
  'ts.rev.wrkAssign.emptyText': 'Für diesen Worker gibt es aktuell keine offenen Deal-basierten Einsatzoptionen zur direkten Zuweisung.',

  'ts.rev.action.close': 'Schließen',
  'ts.rev.action.close2': 'Schließen',
  'ts.rev.action.cancel': 'Abbrechen',
  'ts.rev.action.cancel2': 'Abbrechen',
  'ts.rev.action.cancel3': 'Abbrechen',
  'ts.rev.action.cancel4': 'Abbrechen',
  'ts.rev.action.cancel5': 'Abbrechen',

  'ts.rev.lnk.title': 'Einsatz konfigurieren',
  'ts.rev.lnk.save': 'Änderungen speichern',
  'ts.rev.lnk.hoursPerDay': 'Stunden / Tag',
  'ts.rev.lnk.breakMinutes': 'Pause (Minuten)',
  'ts.rev.lnk.dressCodePh': 'z.B. Sicherheitsschuhe und Warnweste erforderlich',
  'ts.rev.lnk.internalNotes': 'Interne Notizen',
  'ts.rev.lnk.internalNotesHint': '(nicht für Arbeitnehmer)',
  'ts.rev.lnk.startRequired': 'Startdatum ist erforderlich.',
  'ts.rev.lnk.saved': 'Einsatz-Konfiguration gespeichert',

  'ts.rev.cmp.title': 'Ein Kunde hat ein Problem mit einer Ihrer Kräfte gemeldet — reagieren Sie direkt hier.',
  'ts.rev.cmp.workerFallback': 'Mitarbeiter',
  'ts.rev.cmp.clientFallback': 'Kunde',
  'ts.rev.cmp.acknowledge': 'Angenommen',
  'ts.rev.cmp.acknowledgeTitle': 'Dem Kunden zeigen: wir kümmern uns',

  'ts.rev.rep.notFound': 'Einsatz nicht gefunden.',
  'ts.rev.rep.endsOriginal': 'Der Ersatz übernimmt bis zum Original-Enddatum ({date}).',
  'ts.rev.rep.endsOpen': 'Der Ersatz übernimmt den offenen Einsatz.',
  'ts.rev.rep.effectiveDate': 'Wirk-Datum (ab wann Ersatz)',
  'ts.rev.rep.noCandidates': 'Keine weiteren aktiven Arbeiter in Ihrer Organisation verfügbar.',
  'ts.rev.rep.reason': 'Grund',
  'ts.rev.rep.subtitle': 'Krankheit / Ausfall – zeitgenau ab Wirk-Datum',
  'ts.rev.rep.errDate': 'Bitte ein Wirk-Datum wählen.',
  'ts.rev.rep.errWorker': 'Bitte einen Ersatz-Arbeiter wählen.',
  'ts.rev.rep.errReason': 'Bitte einen Grund angeben (mind. 3 Zeichen).',
  'ts.rev.rep.errNotFound': 'Einsatz nicht gefunden.',
  'ts.rev.rep.errNotActive': 'Dieser Einsatz ist nicht aktiv.',
  'ts.rev.rep.errSameWorker': 'Ersatz und Ausfallender dürfen nicht identisch sein.',
  'ts.rev.rep.errNotInOrg': 'Der gewählte Arbeiter gehört nicht zu Ihrer Organisation.',
  'ts.rev.rep.errInactive': 'Der gewählte Arbeiter ist inaktiv.',
  'ts.rev.rep.errConflict': 'Der gewählte Ersatz ist im Zeitraum bereits in einem anderen Einsatz gebucht. Bitte anderen Arbeiter oder Wirk-Datum wählen.',
  'ts.rev.rep.errValidation': 'Ungültige Eingabe:',
  'ts.rev.rep.failed': 'Fehler bei der Ersatz-Zuweisung',

  'ts.rev.plan.blockTitle': 'Einsatz für diesen Arbeiter planen',
  'ts.rev.plan.blockCta': '+ Block',
  'ts.rev.plan.assignmentsInMonth': '{n} Einsätze im Monat',
  'ts.rev.plan.legendActive': 'Aktiv',
  'ts.rev.plan.emptyTitle': 'Keine Einsätze in {month}',
  'ts.rev.plan.emptyText': 'Für diesen Monat sind keine Einsätze geplant. Wechseln Sie den Monat oder planen Sie einen Block.',
  'ts.rev.plan.assignmentFallback': 'Einsatz',

  'ts.rev.conf.pending': 'Bestätigung offen',
  'ts.rev.conf.confirmed': 'Bestätigt',
  'ts.rev.conf.declined': 'Abgelehnt',
  'ts.rev.conf.expired': 'Frist abgelaufen',
  'ts.rev.conf.unavailable': 'Abwesend',
  'ts.rev.conf.withdrawn': 'Zurückgezogen',
  'ts.rev.due.overdue': 'Überfällig',
  'ts.rev.due.overdueTitle': 'Einreichfrist verstrichen, noch nicht eingereicht',
  'ts.rev.due.late': 'Verspätet',
  'ts.rev.due.lateTitle': 'Nach der Einreichfrist abgegeben',

  'ts.rev.status.draft': 'Entwurf',
  'ts.rev.status.submitted': 'Eingereicht',
  'ts.rev.status.underReview': 'In Prüfung',
  'ts.rev.status.needsCorrection': 'Korrektur',
  'ts.rev.status.needsCorrectionLong': 'Korrektur ausstehend',
  'ts.rev.status.approvedInternal': 'Intern geprüft',
  'ts.rev.status.sentToCustomer': 'Beim Kunden',
  'ts.rev.status.customerConfirmed': 'Vom Kunden bestätigt',
  'ts.rev.status.customerRejected': 'Vom Kunden abgelehnt',
  'ts.rev.status.rejected': 'Abgelehnt',
  'ts.rev.status.accepted': 'Angenommen',
  'ts.rev.status.posted': 'In Abrechnung',

  'ts.rev.invite.stateSent': 'Offen',
  'ts.rev.invite.stateViewed': 'Gesehen',
  'ts.rev.invite.stateInterested': 'Rückfrage',
  'ts.rev.invite.stateAccepted': 'Angenommen',
  'ts.rev.invite.stateDeclined': 'Abgelehnt',
  'ts.rev.invite.stateExpired': 'Abgelaufen',
  'ts.rev.invite.stateCancelled': 'Geschlossen',

  'ts.rev.option.selected': 'Vom Worker gewählt',
  'ts.rev.option.preferred': 'Worker-Favorit',
  'ts.rev.option.acceptable': 'Auch möglich',
  'ts.rev.option.declined': 'Abgelehnt',
  'ts.rev.choiceState.preferenceSubmitted': 'Präferenz gesendet',
  'ts.rev.choiceState.declined': 'Abgelehnt',
  'ts.rev.drawer.contextHeading': 'Einsatzkontext',
  'ts.rev.drawer.period': 'Zeitraum:',
  'ts.rev.drawer.openSuffix': 'offen',
  'ts.rev.drawer.location': 'Ort:',
  'ts.rev.drawer.shift': 'Schicht:',
  'ts.rev.drawer.signals': 'Operative Signale:',
  'ts.rev.drawer.blocker': 'Blocker:',
  'ts.rev.drawer.missingReq': 'Fehlende Anforderungen:',
  'ts.rev.drawer.safeCaseHints': 'Safe-Case-Hinweise:',
  'ts.rev.drawer.alreadyAssigned': 'Bereits zugewiesen:',
  'ts.rev.drawer.noneAssigned': 'Noch niemand final zugewiesen',
  'ts.rev.drawer.reserved': 'Reserviert:',
  'ts.rev.drawer.noReservations': 'Keine aktiven Reservierungen',
  'ts.rev.drawer.choiceFallback': 'Auswahlphase',
  'ts.rev.drawer.refresh': 'Aktualisieren',
  'ts.rev.drawer.quickAssign': 'Sicher direkt zuweisen',
  'ts.rev.drawer.toCard': 'Zur Einsatzkarte',
  'ts.rev.drawer.startOpen': 'Start offen',
  'ts.rev.drawer.openSlots': '{n} offen',
  'ts.rev.wrk.docsWatch': 'Dokumentenlage im Blick behalten.',
  'ts.rev.match.hardHit': 'Harter Treffer',
  'ts.rev.match.softFit': 'Weicher Fit',
  'ts.rev.wl.queued': 'Waitlist',
  'ts.rev.wl.invited': 'Angefragt',
  'ts.rev.wl.reserved': 'Reserviert',
  'ts.rev.wl.assigned': 'Zugeordnet',
  'ts.rev.wl.removed': 'Abgeschlossen',
  'ts.rev.wl.fallback': 'Status',
  'ts.rev.choice.modeFreeShort': 'Freie Wahl',
  'ts.rev.choice.modeFallback': 'Auswahl',
  'ts.rev.choiceState.open': 'Offen',
  'ts.rev.choiceState.ranked': 'Ranking gesendet',
  'ts.rev.choiceState.manualOverride': 'Manuell entschieden',
  'ts.rev.choiceState.assigned': 'Final zugewiesen',
  'ts.rev.choiceState.expired': 'Abgelaufen',
  'ts.rev.choiceState.cancelled': 'Geschlossen',
  'ts.rev.life.endsToday': 'Endet heute',
  'ts.rev.life.expired': 'Abgelaufen',
  'ts.rev.life.completed': 'Beendet',
  'ts.rev.life.cancelled': 'Storniert',
  'ts.rev.status.transferred': 'Übertragen',
  'ts.rev.ev.created': 'erstellt',
  'ts.rev.ev.submitted': 'eingereicht',
  'ts.rev.ev.reviewStarted': 'Prüfung gestartet',
  'ts.rev.ev.correctionRequested': 'Korrektur angefordert',
  'ts.rev.ev.corrected': 'korrigiert',
  'ts.rev.ev.approvedInternal': 'intern genehmigt',
  'ts.rev.ev.sentToCustomer': 'an Kunden gesendet',
  'ts.rev.ev.customerConfirmed': 'vom Kunden bestätigt',
  'ts.rev.ev.customerRejected': 'vom Kunden abgelehnt',
  'ts.rev.ev.posted': 'in Abrechnung gebucht',
  'ts.rev.ev.accepted': 'ins Timesheet übernommen',
  'ts.rev.ev.rejected': 'abgelehnt',
  'ts.rev.ev.comment': 'kommentiert',
  'ts.rev.card.location': 'Einsatzort',
  'ts.rev.card.shiftTime': 'Schichtzeit',
  'ts.rev.card.noShiftTime': 'Keine Arbeitszeit',
  'ts.rev.card.instructions': 'Anweisungen',
  'ts.rev.card.noInstructions': 'Keine Anweisungen',
  'ts.rev.card.contact': 'Ansprechp.',
  'ts.rev.card.completeness': 'Vollständigkeit',
  'ts.rev.lnk.visibleFor': 'Diese Felder sind im Arbeitnehmer-Portal sichtbar für',
  'ts.rev.lnk.sectionDetails': 'Einsatzdetails',
  'ts.rev.lnk.clientName': 'Kundenname',
  'ts.rev.lnk.clientNamePh': 'z.B. BMW AG München',
  'ts.rev.lnk.address': 'Einsatzort / Adresse',
  'ts.rev.lnk.addressPh': 'z.B. Lerchenauer Str. 31, 80809 München',
  'ts.rev.lnk.meetingPoint': 'Treffpunkt',
  'ts.rev.lnk.meetingPointPh': 'z.B. Haupteingang, Pforte A',
  'ts.rev.lnk.montage': 'Montage (Auswärtseinsatz mit Übernachtung)',
  'ts.rev.lnk.montageHint': 'Erscheint in der Live-Belegschaft unter „Montage“ – und der Mitarbeiter sieht im Einsatzportal, dass er auswärts übernachtet.',
  'ts.rev.lnk.startDate': 'Startdatum',
  'ts.rev.lnk.endDate': 'Enddatum',
  'ts.rev.lnk.sectionHours': 'Arbeitszeiten',
  'ts.rev.lnk.shiftStart': 'Schichtbeginn',
  'ts.rev.lnk.shiftEnd': 'Schichtende',
  'ts.rev.lnk.sectionInstructions': 'Einsatzanweisungen',
  'ts.rev.lnk.instructions': 'Anweisungen',
  'ts.rev.lnk.instructionsPh': 'Sicherheitseinweisungen, Zugangscodes, besondere Hinweise…',
  'ts.rev.lnk.dressCode': 'Kleidung / Ausrüstung',
  'ts.rev.lnk.notesPh': 'Interne Hinweise…',
  'ts.rev.lnk.sectionContact': 'Ansprechpartner vor Ort',
  'ts.rev.lnk.contactName': 'Name',
  'ts.rev.lnk.contactNamePh': 'z.B. Max Meier',
  'ts.rev.rep.removedText': 'wird ab dem Wirk-Datum aus dem Einsatz herausgenommen und freigestellt.',
  'ts.rev.rep.billableText': 'Bereits geleistete Tage bleiben abrechenbar.',
  'ts.rev.rep.pleaseSelect': '– Bitte wählen –',
  'ts.rev.rep.cancel': 'Abbrechen',
  'ts.rev.lnk.contactPhone': 'Telefon',
  'ts.rev.lnk.contactEmail': 'E-Mail',
  'ts.rev.lnk.sectionDispatcher': 'Disponent / Interner Ansprechpartner',
  'ts.rev.lnk.dispatcherName': 'Name',
  'ts.rev.lnk.dispatcherNamePh': 'z.B. Sabine Huber',
  'ts.rev.lnk.dispatcherPhone': 'Telefon',
  'ts.rev.lnk.dispatcherEmail': 'E-Mail',
  'ts.rev.bundle.noMatch': 'Keine passenden Positionen in aktueller Liste',
  'ts.rev.bundle.sortPeriodDesc': 'Zeitraum neu→alt',
  'ts.rev.bundle.sortPeriodAsc': 'Zeitraum alt→neu',
  'ts.rev.bundle.noItems': 'Keine Positionen',
  'ts.rev.detail.noEntries': 'Keine Tageseinträge vorhanden.',
  'ts.rev.detail.noCustomerContact': 'Kein Kundenkontakt hinterlegt.',
  'ts.rev.act.postDirect': 'Direkt in Abrechnung',
  'ts.rev.act.contactName': 'Kundenkontakt Name',
  'ts.rev.act.contactEmail': 'Kundenkontakt E-Mail',
  'ts.rev.act.contactPersonPh': 'Name Ansprechpartner',
  'ts.rev.wrk.noEmail': 'Keine E-Mail hinterlegt',
  'ts.rev.assign.pleaseChoose': '– Bitte wählen –',
  'ts.rev.assign.optRole': 'Rolle:',
  'ts.rev.assign.optCity': 'Ort:',
  'ts.rev.assign.optPeriod': 'Zeitraum:',
  'ts.rev.dealState.open': 'Offen',
  'ts.rev.dealState.sourcing': 'Sourcing',
  'ts.rev.dealState.partiallyFilled': 'Teilbesetzt',
  'ts.rev.dealState.filled': 'Besetzt',
  'ts.rev.dealState.closed': 'Geschlossen',
  'ts.rev.dealState.cancelled': 'Storniert',
  'ts.rev.quick.assigned': 'Direkt zugewiesen',
  'ts.rev.quick.notSafe': 'Nicht safe',
  'ts.rev.quick.conflict': 'Konflikt',
  'ts.rev.quick.notAssignable': 'Nicht zuweisbar',
  'ts.rev.quick.failed': 'Fehlgeschlagen',
  'ts.rev.quick.resultFallback': 'Ergebnis',
  'ts.rev.option.rank': 'Rang {n}',
  'ts.rev.option.expired': 'Abgelaufen',
  'ts.rev.option.cancelled': 'Geschlossen',
  'ts.rev.option.open': 'Offen',
  'ts.rev.card.notSpecified': 'Nicht angegeben',
  'ts.rev.btn.sending': 'Wird gesendet…',
  'ts.rev.btn.creating': 'Wird angelegt…',
  'ts.rev.btn.assigning': 'Wird zugewiesen…',
  'ts.rev.btn.saving': 'Wird gespeichert…',
  'ts.rev.wrk.inviteBtn': 'Einladung senden',
  'ts.rev.assign.submitBtn': 'Zuweisen & benachrichtigen',
  'ts.rev.choice.submitBtn': 'Auswahlphase anlegen'
});
TCi18n.register('en', {
  'ts.rev.docTitle': 'Assignments & time – TempConnect',
  'ts.rev.page.title': 'Assignments & time',
  'ts.rev.page.subtitle': 'Workers, timesheets, client approvals and records – steered centrally in the pilot core.',

  'ts.rev.company.subtitle': 'Assignment status, time approvals and billing status of your staffing agency – read-only via deals and activity.',
  'ts.rev.company.lockTitle': 'Assignment tracking (company view)',
  'ts.rev.company.lockText': 'This workspace is your staffing agency operations desk. As the hiring company you can follow assignment status, time approvals and billing status read-only via deals and activity.',

  'ts.rev.banner.eyebrow': 'Pilot standard',
  'ts.rev.banner.title': 'Staffing, client dispatch and approvals have to run smoothly here',
  'ts.rev.banner.text': 'This area carries operational maturity after the deal closes: worker assignment, running assignment, timesheet approval and the visible next step for buyer and supplier.',
  'ts.rev.banner.asideTitle': 'Focus now',
  'ts.rev.banner.asideText': 'Clear open submissions, client approvals and staffing status first; supporting and document topics stay secondary.',

  'ts.rev.onboarding.title': 'Set up the platform',
  'ts.rev.onboarding.toggle': 'Expand/collapse',
  'ts.rev.onboarding.dismiss': 'Hide',

  'ts.rev.hub.current.title': 'Assignments & time',
  'ts.rev.hub.current.desc': 'You are in the operational assignment and time area.',
  'ts.rev.hub.subs.title': 'Timesheets & approvals',
  'ts.rev.hub.subs.desc': 'Review submissions, send them to clients and steer approvals cleanly.',
  'ts.rev.hub.workers.title': 'Workers',
  'ts.rev.hub.workers.desc': 'Maintain workers, invitations and operational master data.',
  'ts.rev.hub.approvals.title': 'Approval queue',
  'ts.rev.hub.approvals.desc': 'Pending approvals across assignments, time and records.',
  'ts.rev.hub.timesheets.title': 'Timesheets',
  'ts.rev.hub.timesheets.desc': 'Time recording, approval and billing basis in detail.',
  'ts.rev.hub.docs.title': 'Records & documents',
  'ts.rev.hub.docs.desc': 'Manage documents, certificates and records close to the assignment.',

  'ts.rev.tab.subs': 'Timesheet approvals',
  'ts.rev.tab.workers': 'Workers',
  'ts.rev.tab.asgn': 'Assignments',

  'ts.rev.cust.title': 'Client dispatch of timesheets',
  'ts.rev.cust.subtitle': 'Status of every client dispatch at a glance',
  'ts.rev.cust.ready': 'Ready to send',
  'ts.rev.cust.sent': 'Sent',
  'ts.rev.cust.open': 'With the client',
  'ts.rev.cust.confirmed': 'Confirmed',
  'ts.rev.cust.rejected': 'Rejected',
  'ts.rev.cust.posted': 'Billing',
  'ts.rev.cust.openSent': 'Open sent bundles',
  'ts.rev.cust.filterAtCustomer': 'Filter by with the client',
  'ts.rev.cust.showRejections': 'Show rejections',
  'ts.rev.cust.btnReady': 'Show {n} items ready to send',
  'ts.rev.cust.btnReadyNone': 'Show items ready to send',
  'ts.rev.cust.badgeAction': 'Action required',
  'ts.rev.cust.badgeReady': '{n} ready to send',
  'ts.rev.cust.badgeOpen': '{n} open with the client',
  'ts.rev.cust.badgeAllPosted': 'All billed',
  'ts.rev.cust.badgeFlow': 'Client flow',
  'ts.rev.cust.hintRejected': '{n} timesheets were rejected by the client. Please review and correct them.',
  'ts.rev.cust.hintReady': '{n} internally approved items are ready for client dispatch.',
  'ts.rev.cust.hintOpen': '{n} items are waiting for client feedback.',
  'ts.rev.cust.hintDone': 'All items are confirmed or in billing. Nothing to do.',

  'ts.rev.bundle.prepare': 'Prepare bulk dispatch',
  'ts.rev.bundle.week': 'Week',
  'ts.rev.bundle.month': 'Month',
  'ts.rev.bundle.internalOnly': 'Internally approved only',
  'ts.rev.bundle.sentTitle': 'Sent bundles',
  'ts.rev.bundle.flowPill': 'Client flow',
  'ts.rev.bundle.emptyPreview': 'No approved items for bulk dispatch.',
  'ts.rev.bundle.emptySent': 'No bulk dispatch carried out yet.',
  'ts.rev.bundle.clientFallback': 'Client',
  'ts.rev.bundle.positions': '{n} items',
  'ts.rev.bundle.rangeTo': 'to',
  'ts.rev.bundle.send': 'Bulk dispatch',
  'ts.rev.bundle.preview': 'Preview',
  'ts.rev.bundle.details': 'Details',
  'ts.rev.bundle.post': 'Move to billing',
  'ts.rev.bundle.counts': 'Items: {items} · Confirmed: {confirmed} · Billed: {posted}',
  'ts.rev.bundle.progressSent': 'Sent {a}/{b}',
  'ts.rev.bundle.progressConfirmed': 'Confirmed {a}/{b}',
  'ts.rev.bundle.previewToast': 'Preview: {n} items ready for {period}',
  'ts.rev.bundle.notFound': 'Bundle not found',
  'ts.rev.bundle.postFailed': 'The bundle could not be posted',
  'ts.rev.bundle.postDone': 'Bundle moved to billing ({n})',
  'ts.rev.bundle.used': 'Used for billing',
  'ts.rev.bundle.stillOpen': 'Still open',
  'ts.rev.bundle.open': 'Open',
  'ts.rev.bundle.searchPh': 'Filter worker/client/status…',
  'ts.rev.bundle.sortHoursDesc': 'Hours high→low',
  'ts.rev.bundle.sortHoursAsc': 'Hours low→high',
  'ts.rev.bundle.sortStatus': 'Status',
  'ts.rev.bundle.colWorker': 'Worker',
  'ts.rev.bundle.colClient': 'Client',
  'ts.rev.bundle.colPeriod': 'Period',
  'ts.rev.bundle.colHours': 'Hours',
  'ts.rev.bundle.colStatus': 'Status',
  'ts.rev.bundle.colBilling': 'Billing',
  'ts.rev.bundle.colAction': 'Action',
  'ts.rev.bundle.statusSent': 'Sent',
  'ts.rev.bundle.statusConfirmed': 'Confirmed',
  'ts.rev.bundle.statusRejected': 'Rejected',

  'ts.rev.bundleDrw.title': 'Bundle details',
  'ts.rev.bundleDrw.subtitle': 'Status and billing marker per item',

  'ts.rev.kpi.submitted': 'Submitted',
  'ts.rev.kpi.inReview': 'In review',
  'ts.rev.kpi.needsCorrection': 'Correction needed',
  'ts.rev.kpi.approvedInternal': 'Internally checked',
  'ts.rev.kpi.atCustomer': 'With the client',
  'ts.rev.kpi.confirmed': 'Confirmed',
  'ts.rev.kpi.custRejected': 'Client rejected',
  'ts.rev.kpi.posted': 'In billing',

  'ts.rev.filter.pending': 'Pending',
  'ts.rev.filter.underReview': 'In review',
  'ts.rev.filter.correction': 'Correction',
  'ts.rev.filter.internal': 'Internally checked',
  'ts.rev.filter.atCustomer': 'With the client',
  'ts.rev.filter.confirmed': 'Confirmed',
  'ts.rev.filter.rejected': 'Rejected',
  'ts.rev.filter.posted': 'Billing',
  'ts.rev.filter.all': 'All',

  'ts.rev.detail.emptyTitle': 'Select a submission',
  'ts.rev.detail.emptyText': 'Pick a submission on the left to see details and actions.',
  'ts.rev.detail.loadError': 'Could not load:',
  'ts.rev.detail.colDay': 'Day',
  'ts.rev.detail.colDate': 'Date',
  'ts.rev.detail.colRegular': 'Reg.',
  'ts.rev.detail.colOvertime': 'OT',
  'ts.rev.detail.colBreak': 'Break',
  'ts.rev.detail.colFrom': 'From',
  'ts.rev.detail.colTo': 'To',
  'ts.rev.detail.entries': 'Daily entries',
  'ts.rev.detail.assignmentAt': 'Assignment at:',
  'ts.rev.detail.overtime': 'Overtime',
  'ts.rev.detail.checkedInternal': 'Checked internally',
  'ts.rev.detail.workerComment': 'Worker:',
  'ts.rev.detail.reviewNote': 'Review note:',
  'ts.rev.detail.posted': 'Timesheet posted',
  'ts.rev.detail.postedLink': 'Open timesheet management',
  'ts.rev.detail.breakMinutes': 'min break',
  'ts.rev.detail.hoursPerWeek': 'h/week',

  'ts.rev.detail.customerNotified': 'Client notified by email',
  'ts.rev.detail.customerNotifiedTo': 'to',
  'ts.rev.detail.customerNoMail': 'No client contact email on file – the client was not notified by email.',
  'ts.rev.detail.customerRejectedAt': 'Rejected:',

  'ts.rev.act.startReview': 'Start review',
  'ts.rev.act.correction': 'Correction',
  'ts.rev.act.correctionPh': 'What should the worker correct?',
  'ts.rev.act.requestCorrection': 'Request correction',
  'ts.rev.act.rejectPh': 'Why is it rejected?',
  'ts.rev.act.sendToCustomer': 'Send to client',
  'ts.rev.act.noteOptional': 'Note (optional)',
  'ts.rev.act.internalNotePh': 'Internal note…',
  'ts.rev.act.send': 'Send',
  'ts.rev.act.customerConfirmed': 'Client confirmed',
  'ts.rev.act.customerRejected': 'Client rejected',
  'ts.rev.act.confirmedBy': 'Confirmed by',
  'ts.rev.act.recordConfirmation': 'Record confirmation',
  'ts.rev.act.reasonOrNote': 'Reason / note',
  'ts.rev.act.customerRejectPh': 'Why did the client reject it?',
  'ts.rev.act.backToReview': 'Back to review',
  'ts.rev.act.needCorrectionNote': 'Please enter a correction note',
  'ts.rev.act.doneReview': 'Review started',
  'ts.rev.act.doneApprove': 'Approved internally',
  'ts.rev.act.doneCorrection': 'Correction requested',
  'ts.rev.act.doneReject': 'Rejected',
  'ts.rev.act.sentAndMailed': 'Sent to the client and notified by email',
  'ts.rev.act.sentNoMail': 'Sent to the client (no email address on file)',
  'ts.rev.act.confirmationSaved': 'Client confirmation recorded',

  'ts.rev.subs.emptyTitle': 'All done',
  'ts.rev.subs.emptyText': 'No submissions in this category.',
  'ts.rev.subs.noAccessTitle': 'No access to timesheets & approvals.',
  'ts.rev.subs.partialTitle': 'Partial view active.',
  'ts.rev.subs.partialAccessText': 'Some client-flow elements are not available with your current access.',
  'ts.rev.subs.partialLoadText': 'Some additional areas could not be loaded. The approval list stays usable.',
  'ts.rev.subs.loadFailTitle': 'Timesheets & approvals could not be loaded.',

  'ts.rev.next.submitted': 'Review & approve',
  'ts.rev.next.underReview': 'Approve or request a correction',
  'ts.rev.next.needsCorrection': 'Waiting for the worker to correct it',
  'ts.rev.next.approvedInternal': 'Ready – send to the client',
  'ts.rev.next.sentToCustomer': 'With the client – confirmation pending',
  'ts.rev.next.customerConfirmed': 'Confirmed – use for billing',
  'ts.rev.next.customerRejected': 'Rejected by the client – clarify',

  'ts.rev.notice.partialAccess': 'Partial view.',
  'ts.rev.notice.wrksManageText': 'Invitations, activations and maintenance actions are not enabled for your current role.',
  'ts.rev.notice.wrksManageShort': 'Invitations and maintenance actions are not enabled for your current role.',
  'ts.rev.notice.asgnEditText': 'You can see assignment configurations, but staffing and assignment actions are not enabled for your current role.',
  'ts.rev.notice.retryLater': 'Please try again later.',
  'ts.rev.notice.noOrgAccess': 'This area is not enabled for your current organisation context.',

  'ts.rev.access.deniedTitle': 'No access',
  'ts.rev.access.initFailTitle': 'The page could not be initialised',
  'ts.rev.access.initFailText': 'The current access and organisation context is unavailable right now.',
  'ts.rev.access.noAreaTitle': 'No access to this area',
  'ts.rev.access.noAreaText': 'No operational areas are enabled here for your current organisation context.',

  'ts.rev.fastTrack.openedTitle': 'Staffing fast track opened.',
  'ts.rev.fastTrack.openedText': 'The deal points straight at staffing, but your current role may not perform staffing actions.',
  'ts.rev.fastTrack.activeTitle': 'Staffing fast track active.',
  'ts.rev.fastTrack.activeText': '{open} open slots are loaded directly. Safe direct assignment, request and manual assignment all continue on the same assignment card.',
  'ts.rev.fastTrack.filledTitle': 'Deal assignment already fully staffed.',
  'ts.rev.fastTrack.filledText': 'The fast route has no open slots left. Existing links and history stay visible on this page.',
  'ts.rev.fastTrack.closedTitle': 'Deal assignment no longer open.',
  'ts.rev.fastTrack.closedText': 'The direct staffing entry was called, but this assignment no longer appears among the open deal assignments.',
  'ts.rev.fastTrack.openedFromDeal': 'Opened directly from the staffing-ready deal.',

  'ts.rev.perm.generic': 'No permission for this action',
  'ts.rev.perm.staffingDetails': 'You can see assignments, but not open staffing details.',
  'ts.rev.perm.staffingFilter': 'You cannot filter staffing suggestions.',
  'ts.rev.perm.staffingRefresh': 'You can see assignments, but not refresh staffing details.',
  'ts.rev.perm.staffingActions': 'You can see assignments, but not perform staffing or assignment actions.',
  'ts.rev.perm.workerActivate': 'You can see workers, but not activate or deactivate them.',
  'ts.rev.perm.workerInvites': 'You cannot manage worker invitations.',
  'ts.rev.perm.workerInviteSend': 'You can see workers, but not send invitations.',
  'ts.rev.perm.workerCreate': 'You cannot create new workers.',
  'ts.rev.perm.directAssign': 'You cannot run a direct assignment from the worker area.',
  'ts.rev.perm.choiceSet': 'You cannot create a choice phase for workers.',
  'ts.rev.perm.choiceFinal': 'You cannot trigger a final assignment from a choice phase.',
  'ts.rev.perm.quickAssign': 'You cannot run a safe direct assignment.',
  'ts.rev.perm.staffingRequest': 'You cannot send staffing requests.',
  'ts.rev.perm.waitlist': 'You cannot put workers on the waitlist.',
  'ts.rev.perm.waitlistWave': 'You cannot trigger another waitlist wave.',
  'ts.rev.perm.dealAssign': 'You cannot staff deal assignments.',
  'ts.rev.perm.lnkEdit': 'You can see assignment configurations, but not edit them.',
  'ts.rev.perm.lnkSave': 'You cannot save assignment configurations.',
  'ts.rev.perm.lnkRole': 'Assignment links are not enabled for your current role.',
  'ts.rev.perm.cardRole': 'The assignment card is not enabled for your current role.',
  'ts.rev.perm.complaint': 'You can see reports, but not process them.',
  'ts.rev.perm.replacement': 'You cannot assign a replacement.',
  'ts.rev.perm.planBlock': 'You cannot plan assignments.',
  'ts.rev.perm.staffingRoleShort': 'Staffing and assignment actions are not enabled for your current role.',

  'ts.rev.msg.error': 'Error',
  'ts.rev.msg.filterLoadFailed': 'The filter could not be loaded',
  'ts.rev.msg.saveFailed': 'Could not be saved:',
  'ts.rev.msg.assignError': 'Assignment failed',
  'ts.rev.msg.saveError': 'Could not save',

  'ts.rev.staffing.loadingDetails': 'Loading staffing details…',
  'ts.rev.staffing.loadFailed': 'Loading failed',
  'ts.rev.staffing.loadingContext': 'Loading assignment, conflict and staffing context…',
  'ts.rev.staffing.suggestions': 'Suggestions & live status',
  'ts.rev.staffing.chooseWorker': 'Choose a worker…',
  'ts.rev.staffing.noSuggestions': 'No suitable worker suggestions found.',
  'ts.rev.staffing.noWaitlist': 'No waitlist entries yet.',
  'ts.rev.staffing.noRequests': 'No active request interactions yet.',
  'ts.rev.staffing.noChoiceSets': 'No active worker choice phases for this assignment yet.',
  'ts.rev.staffing.quickAssignRunning': 'Direct assignment running…',
  'ts.rev.staffing.quickAssignCta': 'Assign the safe selection directly',
  'ts.rev.staffing.quickAssignLabel': 'Direct assignment:',
  'ts.rev.staffing.quickAssignSafe': 'Safe case per guardrails',
  'ts.rev.staffing.quickAssignBlocked': 'Only a request or waitlist makes sense',
  'ts.rev.staffing.noExtraSignals': 'No additional signals yet',
  'ts.rev.staffing.running': 'Running…',
  'ts.rev.staffing.assignDirect': 'Assign directly',
  'ts.rev.staffing.waitlistSelection': 'Selection to waitlist',
  'ts.rev.staffing.nextWave': 'Next wave',
  'ts.rev.staffing.activeWorkers': 'Active workers:',
  'ts.rev.staffing.autoBackfill': 'Auto backfill active:',
  'ts.rev.staffing.autoBackfillText': 'Follow-up runs through the latest bulk campaign.',
  'ts.rev.staffing.guardrailHint': 'Direct assignment uses the same guardrails as manual assignment and returns a deterministic result per worker.',
  'ts.rev.staffing.choiceHeading': 'Worker choice phase / preferences',
  'ts.rev.staffing.requestHeading': 'Request status / worker communication',
  'ts.rev.staffing.openQuestions': 'Open questions {q} · Reminder requests {r}',
  'ts.rev.staffing.waitlistHeading': 'Waitlist / standby',
  'ts.rev.staffing.detailsFollow': 'Details to follow',
  'ts.rev.staffing.noResponse': 'No response yet',
  'ts.rev.staffing.workerAction': 'Worker action {at}',
  'ts.rev.staffing.dispatcherAction': 'Dispatcher action {at}',
  'ts.rev.staffing.workerFavourite': 'Worker favourite',
  'ts.rev.staffing.choiceSetFallback': 'Worker choice phase',
  'ts.rev.staffing.deadline': 'Deadline',
  'ts.rev.staffing.selectWorkerFirst': 'Please select at least one worker',
  'ts.rev.staffing.assignedCount': '{n} workers assigned directly',
  'ts.rev.staffing.requestedCount': '{n} workers requested',
  'ts.rev.staffing.waitlistedCount': '{n} workers put on the waitlist',
  'ts.rev.staffing.waitlistFailed': 'The waitlist could not be updated',
  'ts.rev.staffing.waveFailed': 'The waitlist wave could not be sent',
  'ts.rev.staffing.noTopCandidates': 'No free top candidates available',
  'ts.rev.staffing.topFailed': 'The top candidates could not be requested',
  'ts.rev.staffing.bulkMessage': 'Automatic bulk request – still open: {open}',
  'ts.rev.staffing.dealAssignmentFallback': 'Deal assignment',

  'ts.rev.drawer.role': 'Role:',
  'ts.rev.drawer.client': 'Client:',
  'ts.rev.drawer.clientUnknown': 'Not specified',
  'ts.rev.drawer.slots': 'Slots:',
  'ts.rev.drawer.slotsValue': '{filled} filled · {reserved} reserved · {open} open of {requested}',
  'ts.rev.drawer.workerCheck': 'Worker check',
  'ts.rev.drawer.score': 'Score {score}',
  'ts.rev.drawer.noMatchContext': 'No match context yet',
  'ts.rev.drawer.fitFallback': 'The worker context is only rated for this specific assignment option.',
  'ts.rev.drawer.liveStatus': 'Live staffing status',
  'ts.rev.drawer.choiceSetsForWorker': 'Choice phases for this worker:',
  'ts.rev.drawer.noChoiceSet': 'No active choice phase',
  'ts.rev.drawer.manualAssign': 'Assign manually',
  'ts.rev.drawer.manualAssignAnyway': 'Assign manually despite the warning',
  'ts.rev.drawer.manualImpossible': 'Manual assignment not possible',
  'ts.rev.drawer.contextClose': 'Close context',
  'ts.rev.drawer.contextCheck': 'Check context',
  'ts.rev.drawer.contextLoading': 'Context is loading',
  'ts.rev.drawer.assignTitle': 'Assign an assignment directly',
  'ts.rev.drawer.assignSubtitle': '{worker} – use the existing assignment logic with full worker context',
  'ts.rev.drawer.workerLoading': 'Worker context is loading',
  'ts.rev.drawer.workerLoadFailed': 'The worker could not be loaded',
  'ts.rev.drawer.openDealsFailed': 'Open deal assignments could not be loaded.',
  'ts.rev.drawer.contextFailed': 'The context could not be loaded.',
  'ts.rev.drawer.noWorkerSelected': 'No worker selected for the direct assignment',
  'ts.rev.drawer.notEligible': 'This worker is currently not cleared for a manual assignment.',
  'ts.rev.drawer.assignedManually': 'Worker assigned manually to the deal assignment',
  'ts.rev.drawer.confirmWorker': 'Worker: {worker}',
  'ts.rev.drawer.confirmAssignment': 'Assignment: {assignment}',
  'ts.rev.drawer.warnOpenInvite': 'An open staffing request is already running for this assignment.',
  'ts.rev.drawer.warnContacted': 'The worker has already been contacted for this assignment.',
  'ts.rev.drawer.confirmCheck': 'Please check:',
  'ts.rev.drawer.confirmQuestion': 'Assign manually now?',
  'ts.rev.drawer.signalReservations': '{n} active reservations on this assignment',
  'ts.rev.drawer.signalOpenInvite': 'An open staffing request is already running',
  'ts.rev.drawer.signalContacted': 'The worker has already been contacted here',
  'ts.rev.drawer.signalSameClient': '{n} earlier assignments with the same client',
  'ts.rev.drawer.signalChoiceSets': '{n} active choice phases for this worker',

  'ts.rev.wrk.kpiActive': 'Active workers',
  'ts.rev.wrk.kpiInvites': 'Open invitations',
  'ts.rev.wrk.kpiInactive': 'Inactive accounts',
  'ts.rev.wrk.kpiTotal': 'Total',
  'ts.rev.wrk.searchPh': 'Search worker…',
  'ts.rev.wrk.invite': '+ Invite',
  'ts.rev.wrk.createManual': '+ Create manually',
  'ts.rev.wrk.colWorker': 'Worker',
  'ts.rev.wrk.colNumber': 'Personnel no.',
  'ts.rev.wrk.colStatus': 'Status',
  'ts.rev.wrk.colSince': 'Member since',
  'ts.rev.wrk.colActions': 'Actions',
  'ts.rev.wrk.emptyTitle': 'No workers yet',
  'ts.rev.wrk.emptyText': 'Invite your first workers so they can submit their timesheets digitally.',
  'ts.rev.wrk.emptyCta': '+ Invite the first worker',
  'ts.rev.wrk.invitesTitle': 'Open invitations',
  'ts.rev.wrk.noAccessTitle': 'No access to workers.',
  'ts.rev.wrk.loadFailTitle': 'The workers could not be loaded.',
  'ts.rev.wrk.invitesFailTitle': 'The invitations could not be loaded.',
  'ts.rev.wrk.assignAssignment': 'Assign an assignment',
  'ts.rev.wrk.showAssignments': 'Assignments',
  'ts.rev.wrk.active': 'Active',
  'ts.rev.wrk.inactive': 'Inactive',
  'ts.rev.wrk.invitedExpires': 'Invited {rel} – expires {exp}',
  'ts.rev.wrk.inviteResent': 'Invitation sent again',
  'ts.rev.wrk.inviteRevoked': 'Invitation revoked',
  'ts.rev.wrk.errNameMail': 'Please fill in first name, last name and email.',
  'ts.rev.wrk.errMail': 'Please enter a valid email address.',
  'ts.rev.wrk.errNameMailPw': 'Please fill in first name, last name, email and password.',
  'ts.rev.wrk.errPwLength': 'The password must have at least 8 characters.',
  'ts.rev.wrk.errMailExists': 'This email address already exists.',
  'ts.rev.wrk.created': 'Worker {first} {last} created',
  'ts.rev.wrk.createBtn': 'Create worker',
  'ts.rev.wrk.statActive': 'Active assignments',
  'ts.rev.wrk.statDocs': 'Documents',
  'ts.rev.wrk.availabilityNote': 'Availability note:',
  'ts.rev.wrk.docsExpired': '{n} documents expired.',
  'ts.rev.wrk.docsExpiring': '{n} records expire soon.',
  'ts.rev.wrk.nextExpiry': 'Next expiry: {date}.',
  'ts.rev.wrk.manualCheck': 'Manual check',

  'ts.rev.asgn.kpiActive': 'Active assignments',
  'ts.rev.asgn.kpiConfigured': 'Configured',
  'ts.rev.asgn.kpiNoBriefing': 'Without briefing',
  'ts.rev.asgn.kpiWorkers': 'Workers',
  'ts.rev.asgn.searchPh': 'Search worker or client…',
  'ts.rev.asgn.assignCta': '+ Assign staff',
  'ts.rev.asgn.tabActive': 'Active',
  'ts.rev.asgn.tabArchive': 'Archive',
  'ts.rev.asgn.tabAll': 'All',
  'ts.rev.asgn.viewCards': 'Cards',
  'ts.rev.asgn.viewPlan': 'Planning',
  'ts.rev.asgn.dealTitle': 'Deal assignments (assign workers)',
  'ts.rev.asgn.choiceSetCta': '+ Create a choice phase',
  'ts.rev.asgn.closedTitle': 'Closed deals',
  'ts.rev.asgn.closedHint': 'Fully staffed, finished or cancelled deals stay visible here for follow-up.',
  'ts.rev.asgn.emptyTitle': 'No assignment configurations',
  'ts.rev.asgn.emptyText': 'As soon as workers are linked to assignments they appear here for configuration.',
  'ts.rev.asgn.noAccessTitle': 'No access to assignments.',
  'ts.rev.asgn.loadFailTitle': 'The assignments could not be loaded.',
  'ts.rev.asgn.dealLoadFailTitle': 'Open deal assignments could not be loaded.',
  'ts.rev.asgn.noStaffingRights': 'No staffing rights.',
  'ts.rev.asgn.workerPickFailTitle': 'The worker selection could not be loaded.',
  'ts.rev.asgn.manualLimited': 'Manual assignment restricted.',
  'ts.rev.asgn.workerPickNoAccess': 'The worker selection is not available for your current organisation context.',
  'ts.rev.asgn.closedLoadFail': 'Closed deals could not be loaded.',
  'ts.rev.asgn.slotsFilled': '{filled} of {requested} filled',
  'ts.rev.asgn.clientContact': 'Client contact:',
  'ts.rev.asgn.slots': '{filled} filled · {reserved} reserved · {open} open of {requested}',
  'ts.rev.asgn.statusActive': 'Active',
  'ts.rev.asgn.statusArchived': 'Archive',
  'ts.rev.asgn.rowClient': 'Client',
  'ts.rev.asgn.rowClientEmpty': 'No client name',
  'ts.rev.asgn.rowPeriod': 'Period',
  'ts.rev.asgn.rowPeriodEmpty': 'No date set',
  'ts.rev.asgn.replaceCta': 'Assign a replacement',
  'ts.rev.asgn.replaceTitle': 'On sickness/absence: assign a replacement from the effective date and release the absentee',
  'ts.rev.asgn.withdrawCta': 'Withdraw request',
  'ts.rev.asgn.withdrawTitle': 'Withdraw the open request — the spot frees up immediately. Possible until the worker has accepted.',
  'ts.rev.asgn.withdrawPrompt': 'Why is the request being withdrawn? The reason goes into the audit trail, not into the message to the worker.',
  'ts.rev.asgn.withdrawNeedsReason': 'Please give a reason (at least 3 characters).',
  'ts.rev.asgn.withdrawDone': 'Request withdrawn — the spot is open again.',
  'ts.rev.asgn.withdrawTooLate': 'Too late: the request has since been answered or expired.',
  'ts.rev.asgn.withdrawGone': 'This request no longer exists.',
  'ts.rev.asgn.withdrawFailed': 'The request could not be withdrawn.',
  'ts.rev.asgn.hoursPerDay': 'h/day',

  'ts.rev.assign.title': 'Manual assignment → worker',
  'ts.rev.assign.subtitle': 'Assign a staff offer or deal assignment to a worker (shift times, client, notes)',
  'ts.rev.assign.hint': 'For bulk or instant assignment without detail work, keep using the section “Deal assignments (assign workers)” further down. This drawer is deliberately the manual detail path.',
  'ts.rev.assign.loading': 'Loading available staff capacity and deal assignments…',
  'ts.rev.assign.source': 'Staff or deal assignment',
  'ts.rev.assign.worker': 'Worker',
  'ts.rev.assign.start': 'Start date',
  'ts.rev.assign.end': 'End date',
  'ts.rev.assign.hoursPerDay': 'Hours / day',
  'ts.rev.assign.break': 'Break (min)',
  'ts.rev.assign.shiftStart': 'Shift start',
  'ts.rev.assign.shiftEnd': 'Shift end',
  'ts.rev.assign.clientName': 'Client name',
  'ts.rev.assign.clientNamePh': 'e.g. BMW AG',
  'ts.rev.assign.notes': 'Notes',
  'ts.rev.assign.notesPh': 'Internal notes…',
  'ts.rev.assign.emptyTitle': 'Nothing to assign manually',
  'ts.rev.assign.emptyText': 'There is currently neither free staff capacity nor a deal assignment with open slots in your area of responsibility.',
  'ts.rev.assign.groupCapacity': 'Own staff capacity',
  'ts.rev.assign.groupDeals': 'Deal assignments with open slots',
  'ts.rev.assign.optionOpenOf': '{open} open of {total}',
  'ts.rev.assign.capacityFallback': 'Staff capacity',
  'ts.rev.assign.loadFailTitle': 'Staff capacity could not be loaded right now.',
  'ts.rev.assign.loadFailText': 'Please try again.',
  'ts.rev.assign.technicalDetails': 'Technical details',
  'ts.rev.assign.missingFields': 'Please choose staff/assignment, worker and start date.',
  'ts.rev.assign.infoClient': 'Client:',
  'ts.rev.assign.infoStaff': 'Staff:',
  'ts.rev.assign.blockedSuffix': '— blocked at this client',
  'ts.rev.assign.blockedTitle': '{n} worker(s) blocked by this client',
  'ts.rev.assign.blockedHint': '— disabled in the dropdown. Reason: {names}',
  'ts.rev.assign.doneDeal': 'Deal assignment staffed – the worker is notified',
  'ts.rev.assign.doneCapacity': 'Staff assigned – the worker is notified',
  'ts.rev.assign.errCapacityNotFound': 'Staff offer not found.',
  'ts.rev.assign.errCapacityNotAssignable': 'Staff offer cannot be assigned.',
  'ts.rev.assign.errAssignmentNotFound': 'Deal assignment not found.',
  'ts.rev.assign.errAssignmentNotAssignable': 'Deal assignment cannot be staffed.',
  'ts.rev.assign.errAssignmentFilled': 'The deal assignment is already fully staffed.',
  'ts.rev.assign.errWorkerLinked': 'The worker is already linked to this assignment.',
  'ts.rev.assign.errWorkerNotFound': 'Worker not found.',
  'ts.rev.assign.errWorkerInactive': 'The worker is inactive.',
  'ts.rev.assign.errScheduleConflict': 'Period conflict with an existing assignment.',

  'ts.rev.deal.errNotFound': 'Assignment not found.',
  'ts.rev.deal.errNotAssignable': 'The assignment cannot be staffed right now.',
  'ts.rev.deal.errFilled': 'The assignment is already fully staffed.',
  'ts.rev.deal.errAlreadyAssigned': 'The worker is already linked to this assignment.',
  'ts.rev.deal.errWorkerLinked': 'The worker already has an active link for this assignment.',
  'ts.rev.deal.errWorkerNotFound': 'Worker not found.',
  'ts.rev.deal.errWorkerInactive': 'The worker is inactive.',
  'ts.rev.deal.errScheduleConflict': 'Period conflict with an existing assignment or reservation.',
  'ts.rev.deal.assigned': 'Worker assigned to the deal assignment',
  'ts.rev.deal.selectWorker': 'Please select a worker',
  'ts.rev.deal.noOpen': 'No open deal assignments available.',

  'ts.rev.choice.title': 'Create a worker choice phase',
  'ts.rev.choice.subtitle': 'Release several open assignments to one worker as a controlled choice group',
  'ts.rev.choice.hint': 'The existing staffing flow stays in charge. Here you only release an additional preference or choice phase; the final assignment remains firmly in your hands.',
  'ts.rev.choice.worker': 'Worker',
  'ts.rev.choice.mode': 'Mode',
  'ts.rev.choice.modePreference': 'Preference only',
  'ts.rev.choice.modeRanked': 'Ranked choice',
  'ts.rev.choice.modeFree': 'Free choice within the released options',
  'ts.rev.choice.deadline': 'Response deadline',
  'ts.rev.choice.titleField': 'Title',
  'ts.rev.choice.titlePh': 'e.g. Choice of possible assignments for next week',
  'ts.rev.choice.message': 'Message to the worker',
  'ts.rev.choice.messagePh': 'Short note on what the worker should consider when choosing…',
  'ts.rev.choice.options': 'Released assignment options',
  'ts.rev.choice.needTwoOptions': 'A choice phase needs at least two open assignment options.',
  'ts.rev.choice.noActiveWorkers': 'No active workers available for a choice phase.',
  'ts.rev.choice.prepareFailed': 'The choice phase could not be prepared',
  'ts.rev.choice.selectWorker': 'Please select a worker.',
  'ts.rev.choice.selectTwoOptions': 'Please release at least two assignment options.',
  'ts.rev.choice.created': 'Choice phase created for {n} options',
  'ts.rev.choice.createFailed': 'The choice phase could not be created',
  'ts.rev.choice.errWorkerNotFound': 'Worker not found.',
  'ts.rev.choice.errWorkerInactive': 'The selected worker is inactive.',
  'ts.rev.choice.errInvalidMode': 'Invalid choice mode.',
  'ts.rev.choice.errInvalidDeadline': 'The response deadline is invalid.',
  'ts.rev.choice.errAssignmentNotFound': 'At least one assignment was not found.',
  'ts.rev.choice.errAssignmentNotAssignable': 'At least one assignment cannot be staffed.',
  'ts.rev.choice.errAssignmentFilled': 'At least one assignment is already fully staffed.',
  'ts.rev.choice.errNoEligible': 'No staffing invite could be created for at least one assignment.',
  'ts.rev.choice.errOptionActive': 'For this worker at least one of the chosen options is already part of an active choice phase.',
  'ts.rev.choice.errInviteFailed': 'The choice phase could not be prepared completely.',
  'ts.rev.choice.staleReload': 'The choice phase could not be resolved any more. Please refresh.',
  'ts.rev.choice.confirmOther': '{worker} signalled a different preference. Assign this option finally anyway?',
  'ts.rev.choice.confirmFinal': 'Assign this assignment finally now?',
  'ts.rev.choice.workerFallback': 'The worker',
  'ts.rev.choice.overridePrompt': 'Optional override note for audit and traceability:',
  'ts.rev.choice.finalFailed': 'The final assignment failed',
  'ts.rev.choice.errSetNotFound': 'Choice phase not found.',
  'ts.rev.choice.errOptionNotFound': 'Choice option not found.',
  'ts.rev.choice.errAlreadyAssigned': 'The choice phase is already assigned finally.',
  'ts.rev.choice.errAlreadyDeclined': 'The choice phase was already declined.',
  'ts.rev.choice.errExpired': 'The choice phase has expired.',
  'ts.rev.choice.errCancelled': 'The choice phase was closed.',
  'ts.rev.choice.errReservationNotFound': 'The reservation was not found.',
  'ts.rev.choice.errAsgNotFound': 'The assignment was not found.',
  'ts.rev.choice.errAsgNotAssignable': 'The assignment cannot be staffed.',
  'ts.rev.choice.errReservationInactive': 'The reservation is no longer active.',
  'ts.rev.choice.errReservationExpired': 'The reservation has expired.',
  'ts.rev.choice.errAsgFilled': 'The assignment is already fully staffed.',
  'ts.rev.choice.errWorkerAssigned': 'The worker is already assigned there.',
  'ts.rev.choice.errWorkerLinked': 'The worker already has an active link for this assignment.',
  'ts.rev.choice.errWorkerNotFound2': 'Worker not found.',
  'ts.rev.choice.errWorkerInactive2': 'The worker is inactive.',
  'ts.rev.choice.errScheduleConflict': 'The final assignment collides with an existing period.',
  'ts.rev.choice.errAsgNotAssignable2': 'The assignment cannot be staffed right now.',
  'ts.rev.choice.errNoWorkersSelected': 'Please select at least one worker.',

  'ts.rev.quick.openAfter': '{n} slots still open after the direct assignment.',
  'ts.rev.quick.summary': '{assigned} assigned directly · {skipped} not carried out · open afterwards {open}',
  'ts.rev.quick.skippedLinked': 'Already linked',
  'ts.rev.quick.skippedFilled': 'Assignment already full',
  'ts.rev.quick.failedNotFound': 'Worker missing',
  'ts.rev.quick.failedInactive': 'Worker inactive',

  'ts.rev.match.noReason': 'No match rationale yet',
  'ts.rev.match.availability': 'Availability',
  'ts.rev.match.qualification': 'Records',
  'ts.rev.match.reliability': 'Reliability',

  'ts.rev.invite.title': 'Invite a worker',
  'ts.rev.invite.subtitle': 'The invitation email is sent automatically',
  'ts.rev.invite.howLabel': 'How it works:',
  'ts.rev.invite.howText': 'The worker receives an invitation link by email, sets a password there and can submit timesheets digitally right away – no app download, no complicated setup.',
  'ts.rev.invite.firstNamePh': 'e.g. Anna',
  'ts.rev.invite.lastNamePh': 'e.g. Kraft',

  'ts.rev.create.title': 'Create a worker manually',
  'ts.rev.create.subtitle': 'The account is active immediately – no invitation link needed',
  'ts.rev.create.hintLabel': 'Direct creation:',
  'ts.rev.create.hintText': 'The account is active immediately. The worker can sign in to the worker portal with the email and the password set here.',
  'ts.rev.create.firstNamePh': 'e.g. Max',
  'ts.rev.create.lastNamePh': 'e.g. Miller',

  'ts.rev.field.firstName': 'First name',
  'ts.rev.field.lastName': 'Last name',
  'ts.rev.field.email': 'Email address',
  'ts.rev.field.personnelNumber': 'Personnel number',
  'ts.rev.field.personnelNumberPh': 'e.g. W-0042',
  'ts.rev.field.optional': '(optional)',
  'ts.rev.field.phone': 'Phone',
  'ts.rev.field.optional2': '(optional)',
  'ts.rev.field.firstName2': 'First name',
  'ts.rev.field.lastName2': 'Last name',
  'ts.rev.field.email2': 'Email address',
  'ts.rev.field.password': 'Password',
  'ts.rev.field.passwordPh': 'At least 8 characters',
  'ts.rev.field.personnelNumber2': 'Personnel number',
  'ts.rev.field.personnelNumberPh2': 'e.g. W-0042',
  'ts.rev.field.phone2': 'Phone',
  'ts.rev.field.street': 'Street',
  'ts.rev.field.streetPh': 'e.g. Musterstr. 12',
  'ts.rev.field.zip': 'Postcode',
  'ts.rev.field.zipPh': 'e.g. 80331',
  'ts.rev.field.city': 'City',
  'ts.rev.field.cityPh': 'e.g. Munich',
  'ts.rev.field.pleaseSelect': '– Please choose –',
  'ts.rev.field.pleaseSelect2': '– Please choose –',
  'ts.rev.field.pleaseSelect3': '– Please choose –',

  'ts.rev.wrkAssign.hint': 'You stay in the operational worker area. The existing assignment flow stays in charge; this only activates the direct entry with the worker already selected.',
  'ts.rev.wrkAssign.loading': 'Loading open deal assignments and staffing context…',
  'ts.rev.wrkAssign.emptyTitle': 'No open deal assignments',
  'ts.rev.wrkAssign.emptyText': 'There are currently no open deal-based assignment options for this worker to assign directly.',

  'ts.rev.action.close': 'Close',
  'ts.rev.action.close2': 'Close',
  'ts.rev.action.cancel': 'Cancel',
  'ts.rev.action.cancel2': 'Cancel',
  'ts.rev.action.cancel3': 'Cancel',
  'ts.rev.action.cancel4': 'Cancel',
  'ts.rev.action.cancel5': 'Cancel',

  'ts.rev.lnk.title': 'Configure the assignment',
  'ts.rev.lnk.save': 'Save changes',
  'ts.rev.lnk.hoursPerDay': 'Hours / day',
  'ts.rev.lnk.breakMinutes': 'Break (minutes)',
  'ts.rev.lnk.dressCodePh': 'e.g. safety shoes and high-visibility vest required',
  'ts.rev.lnk.internalNotes': 'Internal notes',
  'ts.rev.lnk.internalNotesHint': '(not for the worker)',
  'ts.rev.lnk.startRequired': 'A start date is required.',
  'ts.rev.lnk.saved': 'Assignment configuration saved',

  'ts.rev.cmp.title': 'A client reported a problem with one of your workers — respond right here.',
  'ts.rev.cmp.workerFallback': 'Worker',
  'ts.rev.cmp.clientFallback': 'Client',
  'ts.rev.cmp.acknowledge': 'Acknowledged',
  'ts.rev.cmp.acknowledgeTitle': 'Show the client that you are on it',

  'ts.rev.rep.notFound': 'Assignment not found.',
  'ts.rev.rep.endsOriginal': 'The replacement takes over until the original end date ({date}).',
  'ts.rev.rep.endsOpen': 'The replacement takes over the open assignment.',
  'ts.rev.rep.effectiveDate': 'Effective date (replacement starts)',
  'ts.rev.rep.noCandidates': 'No other active workers available in your organisation.',
  'ts.rev.rep.reason': 'Reason',
  'ts.rev.rep.subtitle': 'Sickness / absence – exact to the effective date',
  'ts.rev.rep.errDate': 'Please choose an effective date.',
  'ts.rev.rep.errWorker': 'Please choose a replacement worker.',
  'ts.rev.rep.errReason': 'Please state a reason (at least 3 characters).',
  'ts.rev.rep.errNotFound': 'Assignment not found.',
  'ts.rev.rep.errNotActive': 'This assignment is not active.',
  'ts.rev.rep.errSameWorker': 'Replacement and absentee must not be the same person.',
  'ts.rev.rep.errNotInOrg': 'The chosen worker does not belong to your organisation.',
  'ts.rev.rep.errInactive': 'The chosen worker is inactive.',
  'ts.rev.rep.errConflict': 'The chosen replacement is already booked on another assignment in that period. Please choose another worker or effective date.',
  'ts.rev.rep.errValidation': 'Invalid input:',
  'ts.rev.rep.failed': 'The replacement assignment failed',

  'ts.rev.plan.blockTitle': 'Plan an assignment for this worker',
  'ts.rev.plan.blockCta': '+ Block',
  'ts.rev.plan.assignmentsInMonth': '{n} assignments this month',
  'ts.rev.plan.legendActive': 'Active',
  'ts.rev.plan.emptyTitle': 'No assignments in {month}',
  'ts.rev.plan.emptyText': 'No assignments are planned for this month. Switch the month or plan a block.',
  'ts.rev.plan.assignmentFallback': 'Assignment',

  'ts.rev.conf.pending': 'Confirmation pending',
  'ts.rev.conf.confirmed': 'Confirmed',
  'ts.rev.conf.declined': 'Declined',
  'ts.rev.conf.expired': 'Deadline passed',
  'ts.rev.conf.unavailable': 'Absent',
  'ts.rev.conf.withdrawn': 'Withdrawn',
  'ts.rev.due.overdue': 'Overdue',
  'ts.rev.due.overdueTitle': 'Submission deadline passed, not submitted yet',
  'ts.rev.due.late': 'Late',
  'ts.rev.due.lateTitle': 'Submitted after the deadline',

  'ts.rev.status.draft': 'Draft',
  'ts.rev.status.submitted': 'Submitted',
  'ts.rev.status.underReview': 'In review',
  'ts.rev.status.needsCorrection': 'Correction',
  'ts.rev.status.needsCorrectionLong': 'Correction pending',
  'ts.rev.status.approvedInternal': 'Internally checked',
  'ts.rev.status.sentToCustomer': 'With the client',
  'ts.rev.status.customerConfirmed': 'Confirmed by the client',
  'ts.rev.status.customerRejected': 'Rejected by the client',
  'ts.rev.status.rejected': 'Rejected',
  'ts.rev.status.accepted': 'Accepted',
  'ts.rev.status.posted': 'In billing',

  'ts.rev.invite.stateSent': 'Open',
  'ts.rev.invite.stateViewed': 'Viewed',
  'ts.rev.invite.stateInterested': 'Question',
  'ts.rev.invite.stateAccepted': 'Accepted',
  'ts.rev.invite.stateDeclined': 'Declined',
  'ts.rev.invite.stateExpired': 'Expired',
  'ts.rev.invite.stateCancelled': 'Closed',

  'ts.rev.option.selected': 'Chosen by the worker',
  'ts.rev.option.preferred': 'Worker favourite',
  'ts.rev.option.acceptable': 'Also possible',
  'ts.rev.option.declined': 'Declined',
  'ts.rev.choiceState.preferenceSubmitted': 'Preference sent',
  'ts.rev.choiceState.declined': 'Declined',
  'ts.rev.drawer.contextHeading': 'Assignment context',
  'ts.rev.drawer.period': 'Period:',
  'ts.rev.drawer.openSuffix': 'open',
  'ts.rev.drawer.location': 'Location:',
  'ts.rev.drawer.shift': 'Shift:',
  'ts.rev.drawer.signals': 'Operational signals:',
  'ts.rev.drawer.blocker': 'Blocker:',
  'ts.rev.drawer.missingReq': 'Missing requirements:',
  'ts.rev.drawer.safeCaseHints': 'Safe-case notes:',
  'ts.rev.drawer.alreadyAssigned': 'Already assigned:',
  'ts.rev.drawer.noneAssigned': 'Nobody finally assigned yet',
  'ts.rev.drawer.reserved': 'Reserved:',
  'ts.rev.drawer.noReservations': 'No active reservations',
  'ts.rev.drawer.choiceFallback': 'Choice phase',
  'ts.rev.drawer.refresh': 'Refresh',
  'ts.rev.drawer.quickAssign': 'Assign safely and directly',
  'ts.rev.drawer.toCard': 'Go to the assignment card',
  'ts.rev.drawer.startOpen': 'Start open',
  'ts.rev.drawer.openSlots': '{n} open',
  'ts.rev.wrk.docsWatch': 'Keep an eye on the document situation.',
  'ts.rev.match.hardHit': 'Hard match',
  'ts.rev.match.softFit': 'Soft fit',
  'ts.rev.wl.queued': 'Waitlist',
  'ts.rev.wl.invited': 'Requested',
  'ts.rev.wl.reserved': 'Reserved',
  'ts.rev.wl.assigned': 'Assigned',
  'ts.rev.wl.removed': 'Closed',
  'ts.rev.wl.fallback': 'Status',
  'ts.rev.choice.modeFreeShort': 'Free choice',
  'ts.rev.choice.modeFallback': 'Choice',
  'ts.rev.choiceState.open': 'Open',
  'ts.rev.choiceState.ranked': 'Ranking sent',
  'ts.rev.choiceState.manualOverride': 'Decided manually',
  'ts.rev.choiceState.assigned': 'Finally assigned',
  'ts.rev.choiceState.expired': 'Expired',
  'ts.rev.choiceState.cancelled': 'Closed',
  'ts.rev.life.endsToday': 'Ends today',
  'ts.rev.life.expired': 'Expired',
  'ts.rev.life.completed': 'Finished',
  'ts.rev.life.cancelled': 'Cancelled',
  'ts.rev.status.transferred': 'Transferred',
  'ts.rev.ev.created': 'created',
  'ts.rev.ev.submitted': 'submitted',
  'ts.rev.ev.reviewStarted': 'review started',
  'ts.rev.ev.correctionRequested': 'correction requested',
  'ts.rev.ev.corrected': 'corrected',
  'ts.rev.ev.approvedInternal': 'approved internally',
  'ts.rev.ev.sentToCustomer': 'sent to the client',
  'ts.rev.ev.customerConfirmed': 'confirmed by the client',
  'ts.rev.ev.customerRejected': 'rejected by the client',
  'ts.rev.ev.posted': 'moved to billing',
  'ts.rev.ev.accepted': 'taken into the timesheet',
  'ts.rev.ev.rejected': 'rejected',
  'ts.rev.ev.comment': 'commented',
  'ts.rev.card.location': 'Site',
  'ts.rev.card.shiftTime': 'Shift time',
  'ts.rev.card.noShiftTime': 'No working time',
  'ts.rev.card.instructions': 'Instructions',
  'ts.rev.card.noInstructions': 'No instructions',
  'ts.rev.card.contact': 'Contact',
  'ts.rev.card.completeness': 'Completeness',
  'ts.rev.lnk.visibleFor': 'These fields are visible in the worker portal for',
  'ts.rev.lnk.sectionDetails': 'Assignment details',
  'ts.rev.lnk.clientName': 'Client name',
  'ts.rev.lnk.clientNamePh': 'e.g. BMW AG Munich',
  'ts.rev.lnk.address': 'Site / address',
  'ts.rev.lnk.addressPh': 'e.g. Lerchenauer Str. 31, 80809 Munich',
  'ts.rev.lnk.meetingPoint': 'Meeting point',
  'ts.rev.lnk.meetingPointPh': 'e.g. main entrance, gate A',
  'ts.rev.lnk.montage': 'Away assignment with overnight stay',
  'ts.rev.lnk.montageHint': 'Shows up under “Away assignment” in the live workforce – and the worker sees in the portal that they stay overnight.',
  'ts.rev.lnk.startDate': 'Start date',
  'ts.rev.lnk.endDate': 'End date',
  'ts.rev.lnk.sectionHours': 'Working hours',
  'ts.rev.lnk.shiftStart': 'Shift start',
  'ts.rev.lnk.shiftEnd': 'Shift end',
  'ts.rev.lnk.sectionInstructions': 'Assignment instructions',
  'ts.rev.lnk.instructions': 'Instructions',
  'ts.rev.lnk.instructionsPh': 'Safety briefings, access codes, special notes…',
  'ts.rev.lnk.dressCode': 'Clothing / equipment',
  'ts.rev.lnk.notesPh': 'Internal notes…',
  'ts.rev.lnk.sectionContact': 'On-site contact',
  'ts.rev.lnk.contactName': 'Name',
  'ts.rev.lnk.contactNamePh': 'e.g. Max Meier',
  'ts.rev.rep.removedText': 'is taken off the assignment and released from the effective date.',
  'ts.rev.rep.billableText': 'Days already worked stay billable.',
  'ts.rev.rep.pleaseSelect': '– Please choose –',
  'ts.rev.rep.cancel': 'Cancel',
  'ts.rev.lnk.contactPhone': 'Phone',
  'ts.rev.lnk.contactEmail': 'Email',
  'ts.rev.lnk.sectionDispatcher': 'Dispatcher / internal contact',
  'ts.rev.lnk.dispatcherName': 'Name',
  'ts.rev.lnk.dispatcherNamePh': 'e.g. Sabine Huber',
  'ts.rev.lnk.dispatcherPhone': 'Phone',
  'ts.rev.lnk.dispatcherEmail': 'Email',
  'ts.rev.bundle.noMatch': 'No matching items in the current list',
  'ts.rev.bundle.sortPeriodDesc': 'Period new→old',
  'ts.rev.bundle.sortPeriodAsc': 'Period old→new',
  'ts.rev.bundle.noItems': 'No items',
  'ts.rev.detail.noEntries': 'No daily entries available.',
  'ts.rev.detail.noCustomerContact': 'No client contact on file.',
  'ts.rev.act.postDirect': 'Straight to billing',
  'ts.rev.act.contactName': 'Client contact name',
  'ts.rev.act.contactEmail': 'Client contact email',
  'ts.rev.act.contactPersonPh': 'Contact name',
  'ts.rev.wrk.noEmail': 'No email on file',
  'ts.rev.assign.pleaseChoose': '– Please choose –',
  'ts.rev.assign.optRole': 'Role:',
  'ts.rev.assign.optCity': 'Location:',
  'ts.rev.assign.optPeriod': 'Period:',
  'ts.rev.dealState.open': 'Open',
  'ts.rev.dealState.sourcing': 'Sourcing',
  'ts.rev.dealState.partiallyFilled': 'Partially filled',
  'ts.rev.dealState.filled': 'Filled',
  'ts.rev.dealState.closed': 'Closed',
  'ts.rev.dealState.cancelled': 'Cancelled',
  'ts.rev.quick.assigned': 'Assigned directly',
  'ts.rev.quick.notSafe': 'Not safe',
  'ts.rev.quick.conflict': 'Conflict',
  'ts.rev.quick.notAssignable': 'Not assignable',
  'ts.rev.quick.failed': 'Failed',
  'ts.rev.quick.resultFallback': 'Result',
  'ts.rev.option.rank': 'Rank {n}',
  'ts.rev.option.expired': 'Expired',
  'ts.rev.option.cancelled': 'Closed',
  'ts.rev.option.open': 'Open',
  'ts.rev.card.notSpecified': 'Not specified',
  'ts.rev.btn.sending': 'Sending…',
  'ts.rev.btn.creating': 'Creating…',
  'ts.rev.btn.assigning': 'Assigning…',
  'ts.rev.btn.saving': 'Saving…',
  'ts.rev.wrk.inviteBtn': 'Send the invitation',
  'ts.rev.assign.submitBtn': 'Assign & notify',
  'ts.rev.choice.submitBtn': 'Create the choice phase'
});

/** Kurzform fuer die Uebersetzung an der Verwendungsstelle.
 *  Bewusst "tt" und nicht "t": "t" ist in dieser Datei bereits als
 *  Parametername vergeben (switchTab(t, opts)). */
function tt(key, params) { return TCi18n.t(key, params); }

const API='/api';
let allSubs=[],allWrks=[],allInvs=[],subKpis={},curFilter='pending',selId=null,wrksLoaded=false;
let allLinks=[],linksLoaded=false,editingLinkId=null,asgnFilter='active',asgnQuery='',unassignedCaps=[];
let _closedDealAsgns=[],closedDealAsgnLoaded=false;
let bundlePreview=[],bundleItems=[];
let bundlePeriodMode='week';
let currentBundleDetailItems=[];
let currentBundleDetailKey='';
let openDealAssignments=[];
let staffingSuggestionsByAssignment={};
let staffingWorkerSuggestionsByAssignment={};
let staffingDetailsByAssignment={};
let staffingUiStateByAssignment={};
let staffingWorkerPrefillId='';
let subsLoaded=false,dealAsgnLoaded=false,currentTab='subs',currentMe=null;
let workerAssignmentDrawerState=createEmptyWorkerAssignmentDrawerState();
const AGENCY_SUBS_URL = `${API}/agency/submissions`;
const AGENCY_KPIS_URL = `${API}/agency/submissions/kpis`;
const AGENCY_BUNDLE_PREVIEW_URL = `${API}/agency/submissions/bundles/preview`;
const AGENCY_BUNDLES_URL = `${API}/agency/submissions/bundles`;
const TAB_ORDER=['subs','wrks','asgn'];
let pageAccess=createEmptyPageAccess();
let staffingFastTrackContext=createEmptyStaffingFastTrackContext();
let _csrfToken=null;
async function getCsrf(){
  if(_csrfToken)return _csrfToken;
  const r=await fetch(`${API}/csrf`,{credentials:'include'});
  const d=await r.json();_csrfToken=d.token;return _csrfToken;
}
function createEmptyPageAccess(){
  return {
    workerModule:false,
    permissions:{
      workerView:false,
      workerReview:false,
      workerCreate:false,
      workerManage:false,
      workerEdit:false
    },
    tabs:{
      subs:false,
      wrks:false,
      asgn:false
    }
  };
}

function createEmptyStaffingFastTrackContext(){
  return {
    mode:'',
    assignmentId:'',
    offerId:'',
    hasFastTrack:false,
    autoFocusPending:false
  };
}

function createEmptyWorkerAssignmentDrawerState(){
  return {
    workerId:'',
    loading:false,
    error:'',
    activeAssignmentId:'',
    cards:{}
  };
}

function parseStaffingFastTrackContext(){
  const params=new URLSearchParams(location.search||'');
  const mode=String(params.get('mode')||'').trim().toLowerCase();
  const assignmentId=String(params.get('assignment_id')||'').trim();
  const offerId=String(params.get('offer_id')||'').trim();
  return {
    mode,
    assignmentId,
    offerId,
    hasFastTrack:mode==='staffing_ready'&&!!assignmentId,
    autoFocusPending:mode==='staffing_ready'&&!!assignmentId
  };
}

staffingFastTrackContext=parseStaffingFastTrackContext();

function derivePageAccess(me){
  const caps=me?.capabilities||{};
  const workerModule=!!caps.worker_module;
  const permissions={
    workerView:!!caps.worker_view,
    workerReview:!!caps.worker_review,
    workerCreate:!!caps.worker_create,
    workerManage:!!caps.worker_manage,
    workerEdit:!!caps.worker_edit
  };
  return {
    workerModule,
    permissions,
    tabs:{
      subs:workerModule&&permissions.workerReview,
      wrks:workerModule&&permissions.workerView,
      asgn:workerModule&&permissions.workerView
    }
  };
}

function toggleElement(id,visible,display=''){
  const el=document.getElementById(id);
  if(!el)return;
  el.style.display=visible?display:'none';
}

function setPanelNotice(id,title,message,tone='info'){
  const el=document.getElementById(id);
  if(!el)return;
  if(!title&&!message){
    el.style.display='none';
    el.innerHTML='';
    return;
  }
  el.className=`wk-alert wk-alert-${tone}`;
  el.innerHTML=`<span>${tone==='danger'?'&#9888;':'&#9432;'}</span><span><strong>${esc(title||'')}</strong>${message?` ${esc(message)}`:''}</span>`;
  el.style.display='';
}

function renderPageAccessState(title,message){
  const el=document.getElementById('pageAccessState');
  if(!el)return;
  if(!title&&!message){
    el.style.display='none';
    el.innerHTML='';
    return;
  }
  el.innerHTML=`<div class="icon">&#128274;</div><h3>${esc(title||tt('ts.rev.access.deniedTitle'))}</h3><p>${esc(message||'')}</p>`;
  el.style.display='block';
}

function setTabVisibility(tabKey,visible){
  const tab=document.getElementById('tab-'+tabKey);
  const panel=document.getElementById('panel-'+tabKey);
  if(tab){
    tab.style.display=visible?'':'none';
    tab.disabled=!visible;
  }
  if(!visible&&panel){
    panel.classList.remove('active');
  }
}

function getRequestedTab(){
  const raw=String(location.hash||'').replace(/^#/,'').toLowerCase();
  const map={
    subs:'subs','panel-subs':'subs','tab-subs':'subs',
    wrks:'wrks','panel-wrks':'wrks','tab-wrks':'wrks',
    asgn:'asgn','panel-asgn':'asgn','tab-asgn':'asgn'
  };
  if(map[raw])return map[raw];
  if(!raw&&staffingFastTrackContext.hasFastTrack)return 'asgn';
  return null;
}

function getInitialTab(){
  const requested=getRequestedTab();
  if(requested&&pageAccess.tabs[requested])return requested;
  return TAB_ORDER.find((tab)=>pageAccess.tabs[tab])||null;
}

function applyPageAccess(){
  TAB_ORDER.forEach((tabKey)=>setTabVisibility(tabKey,!!pageAccess.tabs[tabKey]));
  toggleElement('hubTabs',TAB_ORDER.some((tabKey)=>pageAccess.tabs[tabKey]));
  toggleElement('wrksInviteBtn',pageAccess.permissions.workerManage);
  toggleElement('wrksCreateBtn',pageAccess.permissions.workerCreate);
  setPanelNotice(
    'wrksManageNotice',
    pageAccess.tabs.wrks&&!pageAccess.permissions.workerManage?tt('ts.rev.notice.partialAccess'):'',
    pageAccess.tabs.wrks&&!pageAccess.permissions.workerManage?tt('ts.rev.notice.wrksManageText'):'',
    'info'
  );
  toggleElement('asgnAssignBtn',pageAccess.permissions.workerEdit);
  setPanelNotice(
    'asgnEditNotice',
    pageAccess.tabs.asgn&&!pageAccess.permissions.workerEdit?tt('ts.rev.notice.partialAccess'):'',
    pageAccess.tabs.asgn&&!pageAccess.permissions.workerEdit?tt('ts.rev.notice.asgnEditText'):'',
    'info'
  );
}


function setStaffingFastTrackNotice(title,message,tone='info'){
  const el=document.getElementById('staffingFastTrackNotice');
  if(!el)return;
  if(!title&&!message){
    el.style.display='none';
    el.innerHTML='';
    return;
  }
  el.className=`wk-alert wk-alert-${tone}`;
  el.innerHTML=`<span>${tone==='danger'||tone==='warning'?'&#9888;':''}</span><span><strong>${esc(title||'')}</strong>${message?` ${esc(message)}`:''}</span>`;
  el.style.display='';
}
function tonePillClass(tone){
  const map={
    brand:'pill-pnd',
    success:'pill-act',
    warning:'pill-warn',
    danger:'pill-danger',
    neutral:'pill-off',
    accent:'pill-accent'
  };
  return map[tone]||'pill-off';
}
function setToneHint(el,tone,text){
  if(!el)return;
  if(!tone||!text){
    el.style.display='none';
    el.textContent='';
    el.style.background='';
    el.style.borderLeft='';
    el.style.color='';
    return;
  }
  const toneMap={
    brand:{background:'var(--tc-tone-brand-bg)',border:'var(--hub-accent)',color:'var(--tc-tone-brand-text)'},
    success:{background:'var(--tc-tone-success-bg)',border:'var(--wk-success)',color:'var(--tc-tone-success-text)'},
    warning:{background:'var(--tc-tone-warning-bg)',border:'var(--wk-warning)',color:'var(--tc-tone-warning-text)'},
    danger:{background:'var(--tc-tone-danger-bg)',border:'var(--wk-danger)',color:'var(--tc-tone-danger-text)'}
  };
  const cfg=toneMap[tone]||toneMap.brand;
  el.style.display='block';
  el.style.background=cfg.background;
  el.style.borderLeft=`3px solid ${cfg.border}`;
  el.style.color=cfg.color;
  el.textContent=text;
}

function renderStaffingFastTrackNotice(){
  if(currentTab!=='asgn'||!staffingFastTrackContext.hasFastTrack){
    setStaffingFastTrackNotice('','');
    return;
  }
  if(!pageAccess.permissions.workerEdit){
    setStaffingFastTrackNotice(
      tt('ts.rev.fastTrack.openedTitle'),
      tt('ts.rev.fastTrack.openedText'),
      'info'
    );
    return;
  }
  const targetAssignment=openDealAssignments.find((assignment)=>assignment.assignment_id===staffingFastTrackContext.assignmentId);
  if(targetAssignment){
    const open=Number(targetAssignment.open_quantity||Math.max(Number(targetAssignment.requested_quantity||targetAssignment.worker_count||1)-Number(targetAssignment.filled_quantity||0)-Number(targetAssignment.reserved_quantity||0),0));
    setStaffingFastTrackNotice(
      tt('ts.rev.fastTrack.activeTitle'),
      tt('ts.rev.fastTrack.activeText', { open: open }),
      'info'
    );
    return;
  }
  const quickAssignSummary=staffingUiStateByAssignment[staffingFastTrackContext.assignmentId]?.quickAssignResult?.summary||null;
  if(quickAssignSummary&&Number(quickAssignSummary.open_quantity_after||0)===0){
    setStaffingFastTrackNotice(
      tt('ts.rev.fastTrack.filledTitle'),
      tt('ts.rev.fastTrack.filledText'),
      'success'
    );
    return;
  }
  setStaffingFastTrackNotice(
    tt('ts.rev.fastTrack.closedTitle'),
    tt('ts.rev.fastTrack.closedText'),
    'warning'
  );
}

function scrollDealAssignmentIntoView(assignmentId){
  const card=document.getElementById(`dealAsgnCard-${assignmentId}`);
  if(card&&typeof card.scrollIntoView==='function'){
    card.scrollIntoView({behavior:'smooth',block:'start'});
  }
}

async function openStaffingPanel(assignmentId,{forceReload=false,scrollIntoView=false}={}){
  if(!ensurePermission('workerEdit',tt('ts.rev.perm.staffingDetails')))return false;
  const panel=document.getElementById('staffingPanel-'+assignmentId);
  if(!panel)return false;
  if(scrollIntoView)scrollDealAssignmentIntoView(assignmentId);
  if(panel.style.display!=='none'&&!forceReload){
    return true;
  }
  panel.style.display='block';
  panel.innerHTML='<div style="padding:14px;color:var(--wk-text-muted);font-size:12px">'+esc(tt('ts.rev.staffing.loadingDetails'))+'</div>';
  try{
    const state=getStaffingUiState(assignmentId);
    await Promise.all([
      loadStaffingDetail(assignmentId),
      loadStaffingSuggestions(assignmentId,{limit:20,only_available:true,hard_only:state.hardOnly,include_blocked:true})
    ]);
    renderStaffingPanel(assignmentId);
    return true;
  }catch(e){
    panel.innerHTML=`<div style="padding:14px;color:var(--tc-tone-danger-text);font-size:12px">${esc(e.message||tt('ts.rev.staffing.loadFailed'))}</div>`;
    return false;
  }
}

async function maybeAutoFocusStaffingReadyAssignment(){
  if(currentTab!=='asgn'||!staffingFastTrackContext.autoFocusPending||!staffingFastTrackContext.assignmentId)return;
  staffingFastTrackContext.autoFocusPending=false;
  if(!openDealAssignments.some((assignment)=>assignment.assignment_id===staffingFastTrackContext.assignmentId))return;
  await openStaffingPanel(staffingFastTrackContext.assignmentId,{forceReload:true,scrollIntoView:true});
}

function invalidateStaffingDataCache(assignmentId=null){
  if(assignmentId){
    delete staffingSuggestionsByAssignment[assignmentId];
    delete staffingWorkerSuggestionsByAssignment[assignmentId];
    delete staffingDetailsByAssignment[assignmentId];
    return;
  }
  staffingSuggestionsByAssignment={};
  staffingWorkerSuggestionsByAssignment={};
  staffingDetailsByAssignment={};
}

function setStaffingWorkerPrefill(workerId=''){
  staffingWorkerPrefillId=String(workerId||'').trim();
}

function applyStaffingWorkerPrefill(workerId=staffingWorkerPrefillId){
  const targetWorkerId=String(workerId||'').trim();
  if(!targetWorkerId)return;
  openDealAssignments.forEach((assignment)=>{
    const sel=document.getElementById(`dealWkr-${assignment.assignment_id}`);
    if(!sel)return;
    const hasOption=Array.from(sel.options||[]).some((option)=>option.value===targetWorkerId);
    if(hasOption)sel.value=targetWorkerId;
  });
}

function getWorkerById(workerId){
  return allWrks.find((worker)=>(worker.id||worker.user_id)===workerId)||null;
}

function getAssignmentClientName(assignmentId){
  return staffingDetailsByAssignment[assignmentId]?.assignment?.client_org_name
    || staffingDetailsByAssignment[assignmentId]?.assignment?.client_name
    || openDealAssignments.find((assignment)=>assignment.assignment_id===assignmentId)?.client_org_name
    || null;
}

function resetWorkerAssignmentDrawerState(workerId=''){
  workerAssignmentDrawerState=createEmptyWorkerAssignmentDrawerState();
  workerAssignmentDrawerState.workerId=String(workerId||'').trim();
}

function getWorkerAssignmentDrawerCardState(assignmentId){
  if(!workerAssignmentDrawerState.cards[assignmentId]){
    workerAssignmentDrawerState.cards[assignmentId]={
      loading:false,
      loaded:false,
      error:'',
      detail:null,
      suggestion:null
    };
  }
  return workerAssignmentDrawerState.cards[assignmentId];
}

function isWorkerAssignmentDrawerOpen(){
  return !!document.getElementById('wrkAssignDrw')?.classList.contains('on');
}


async function loadStaffingSuggestionForWorker(assignmentId,workerUserId,{force=false}={}){
  const targetWorkerId=String(workerUserId||'').trim();
  if(!targetWorkerId)return { suggestion:null, bundle:null };
  if(!staffingWorkerSuggestionsByAssignment[assignmentId]){
    staffingWorkerSuggestionsByAssignment[assignmentId]={};
  }
  if(!force&&staffingWorkerSuggestionsByAssignment[assignmentId][targetWorkerId]){
    return staffingWorkerSuggestionsByAssignment[assignmentId][targetWorkerId];
  }
  const query=new URLSearchParams();
  query.set('limit','1');
  query.set('only_available','false');
  query.set('hard_only','false');
  query.set('include_blocked','true');
  query.set('worker_user_id',targetWorkerId);
  const bundle=await fetchJson(`${API}/staffing-assignments/${assignmentId}/suggestions?${query.toString()}`);
  const entry={
    suggestion:(bundle.suggestions||[])[0]||null,
    bundle
  };
  staffingWorkerSuggestionsByAssignment[assignmentId][targetWorkerId]=entry;
  return entry;
}

async function refreshWorkerAssignmentDrawerAfterMutation(assignmentId){
  if(!isWorkerAssignmentDrawerOpen())return;
  if(assignmentId){
    delete workerAssignmentDrawerState.cards[assignmentId];
    if(workerAssignmentDrawerState.activeAssignmentId===assignmentId&&!openDealAssignments.some((assignment)=>assignment.assignment_id===assignmentId)){
      workerAssignmentDrawerState.activeAssignmentId='';
    }
  }
  renderWorkerAssignDrw();
  if(workerAssignmentDrawerState.activeAssignmentId){
    await loadWorkerAssignmentCardContext(workerAssignmentDrawerState.activeAssignmentId,{force:true});
  }
}
class ApiError extends Error {
  constructor(message,{status=0,code=null,body=null}={}){
    super(message||'Request fehlgeschlagen');
    this.name='ApiError';
    this.status=status;
    this.code=code;
    this.body=body;
  }
}

function apiErrorCode(payload){
  if(!payload)return null;
  if(typeof payload.error==='string')return payload.error;
  if(payload.error&&typeof payload.error==='object'&&payload.error.code)return payload.error.code;
  return payload.code||null;
}

function apiErrorMessage(payload,status){
  if(payload?.error?.message)return payload.error.message;
  if(payload?.message)return payload.message;
  if(typeof payload?.error==='string')return payload.error;
  return `HTTP ${status}`;
}

// Zentraler AbortController pro aktivem Tab. Beim Tab-Wechsel wird der
// bisherige abgebrochen, damit laufende Fetches keine ERR_NETWORK_CHANGED-
// Kaskaden produzieren. Phase 12 der Welle 7.
let _currentTabController=null;
function startTabAbortScope(){
  if(_currentTabController){
    try{_currentTabController.abort();}catch{/* ignore */}
  }
  _currentTabController=(typeof AbortController!=='undefined')?new AbortController():null;
  return _currentTabController;
}
function currentTabSignal(){
  return _currentTabController?_currentTabController.signal:undefined;
}

async function fetchJson(url,options={}){
  const init={credentials:'include',...options};
  // Default: an aktive Tab-Abort-Scope binden (fuer GETs im Tab-Kontext).
  // Explizite options.signal gewinnt (z. B. beforeunload-Beacons).
  if(init.signal===undefined){
    const sig=currentTabSignal();
    if(sig) init.signal=sig;
  }
  let response;
  try{
    response=await fetch(url,init);
  }catch(networkError){
    // AbortError (Tab-Wechsel) oder TypeError (Network-Transient wie
    // ERR_NETWORK_CHANGED/Offline) duerfen keinen sichtbaren Fehler produzieren.
    const aborted=networkError?.name==='AbortError';
    throw new ApiError(aborted?'ABORTED':'NETWORK_TRANSIENT',{
      status:0,
      code:aborted?'ABORTED':'NETWORK_TRANSIENT',
      body:null
    });
  }
  let payload=null;
  try{payload=await response.json();}catch{payload=null;}
  if(response.status===401){
    location.href='enterprise.html';
    throw new ApiError('NOT_AUTHENTICATED',{status:401,code:'NOT_AUTHENTICATED',body:payload});
  }
  if(!response.ok){
    throw new ApiError(apiErrorMessage(payload,response.status),{
      status:response.status,
      code:apiErrorCode(payload),
      body:payload
    });
  }
  return payload||{};
}

function isAccessDeniedError(error){
  return error?.status===403;
}

function isTransientError(error){
  return error?.code==='ABORTED'||error?.code==='NETWORK_TRANSIENT';
}

function ensurePermission(permissionKey,message){
  if(pageAccess.permissions[permissionKey])return true;
  toast(message||tt('ts.rev.perm.generic'),'error');
  return false;
}

function isCompanyContext(me){
  const orgType=String(me?.org_type||'').trim().toLowerCase();
  if(orgType) return orgType==='company';
  const legacy=String(me?.role||'').trim().toLowerCase();
  return legacy==='company';
}

async function initializePage(){
  try{
    currentMe=await fetchJson(`${API}/me`);
    pageAccess=derivePageAccess(currentMe);
  }catch(error){
    if(error?.status===401)return;
    pageAccess=createEmptyPageAccess();
    applyPageAccess();
    renderPageAccessState(
      tt('ts.rev.access.initFailTitle'),
      tt('ts.rev.access.initFailText')
    );
    return;
  }

  // Welle 7 – Phase 0+1: Company-Soft-Lock. Dieser Arbeitsplatz ist der
  // operative Einsatzleitstand der Agentur. Unternehmen sehen statt des
  // vollen Reviews eine lesende Orientierungsflaeche und werden auf ihre
  // Deal-/Activity-Kanaele verwiesen (Einsatzverfolgung, nicht Einsatzsteuerung).
  if(isCompanyContext(currentMe)){
    pageAccess=createEmptyPageAccess();
    applyPageAccess();
    renderPageAccessState(
      tt('ts.rev.company.lockTitle'),
      tt('ts.rev.company.lockText')
    );
    // Audit 5: statische Dienstleister-Operator-Flaechen fuer Unternehmen ausblenden, damit die
    // "nur lesend"-Notiz nicht durch Operator-Kacheln widerlegt wird (Banner "zentral steuern",
    // Verwaltungs-Hub-Grid "an Kunden senden / Freigabe-Queue / Einsatzkraefte").
    toggleElement('pilotPriorityBanner', false);
    toggleElement('verwaltungHubSection', false);
    var _sub = document.getElementById('pageSubtitle');
    // Marker mitziehen: sonst wuerde das naechste TCi18n.apply() (Sprachwechsel)
    // wieder den Agentur-Untertitel einsetzen und die Unternehmenssicht ueberschreiben.
    if (_sub) { _sub.setAttribute('data-i18n', 'ts.rev.company.subtitle'); _sub.textContent = tt('ts.rev.company.subtitle'); }
    return;
  }

  applyPageAccess();
  const initialTab=getInitialTab();
  if(!initialTab){
    renderPageAccessState(
      tt('ts.rev.access.noAreaTitle'),
      tt('ts.rev.access.noAreaText')
    );
    return;
  }
  renderPageAccessState('','');
  await switchTab(initialTab,{force:true});
}

(async()=>{ await initializePage(); })();

async function reloadAll(){
  subsLoaded=false;
  wrksLoaded=false;
  linksLoaded=false;
  dealAsgnLoaded=false;
  closedDealAsgnLoaded=false;
  if(currentTab==='subs'&&pageAccess.tabs.subs) await loadSubs();
  if(currentTab==='wrks'&&pageAccess.tabs.wrks) await loadWrks();
  if(currentTab==='asgn'&&pageAccess.tabs.asgn){
    await loadAsgn();
    if(pageAccess.permissions.workerEdit) await loadDealAsgn();
    await loadClosedDealAsgn();
  }
}

/* TABS */
async function switchTab(t,opts={}){
  if(!pageAccess.tabs[t])return;
  // Pendante Requests des Vor-Tabs abbrechen, damit ERR_NETWORK_CHANGED
  // nicht in der Konsole landet, wenn der Nutzer schnell switcht.
  startTabAbortScope();
  currentTab=t;
  document.querySelectorAll('.hub-tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.hub-tab-panel').forEach(x=>x.classList.remove('active'));
  document.getElementById('tab-'+t).classList.add('active');
  document.getElementById('panel-'+t).classList.add('active');
  try{
    if(t==='subs'&&(!subsLoaded||opts.force)) await loadSubs();
    if(t==='wrks'&&(!wrksLoaded||opts.force)) await loadWrks();
    if(t==='asgn'){
      if(!linksLoaded||opts.force) await loadAsgn();
      if(pageAccess.permissions.workerEdit&&(!dealAsgnLoaded||opts.force)) await loadDealAsgn();
      if(!pageAccess.permissions.workerEdit){
        dealAsgnLoaded=true;
        toggleElement('dealAsgnSection',false);
      }
      if(!closedDealAsgnLoaded||opts.force) await loadClosedDealAsgn();
    }
  }catch(err){
    // Transient-Errors hier nicht eskalieren — die jeweilige load*-Funktion
    // setzt bereits eine passende Panel-Notice. Andere Fehler bubble'n aber
    // durch den jeweiligen load*-catch.
    if(!isTransientError(err)) throw err;
  }
  renderStaffingFastTrackNotice();
}

/* SUBMISSIONS */
async function loadSubs(){
  if(!pageAccess.tabs.subs){
    subsLoaded=true;
    setPanelNotice(
      'subsStateNotice',
      tt('ts.rev.subs.noAccessTitle'),
      tt('ts.rev.notice.noOrgAccess'),
      'info'
    );
    toggleElement('ldSubs',false);
    toggleElement('ctSubs',false);
    return;
  }

  setPanelNotice('subsStateNotice','','');
  toggleElement('ldSubs',true,'block');
  toggleElement('ctSubs',false);

  try{
    const [subsResult,kpiResult,previewResult,bundleResult]=await Promise.allSettled([
      fetchJson(`${AGENCY_SUBS_URL}?limit=300`),
      fetchJson(`${AGENCY_KPIS_URL}`),
      fetchJson(`${AGENCY_BUNDLE_PREVIEW_URL}?period_mode=${encodeURIComponent(bundlePeriodMode)}`),
      fetchJson(`${AGENCY_BUNDLES_URL}`)
    ]);
    if(subsResult.status!=='fulfilled') throw subsResult.reason;

    allSubs=subsResult.value.items||[];
    subKpis=kpiResult.status==='fulfilled'?(kpiResult.value||{}):{};
    bundlePreview=previewResult.status==='fulfilled'?(previewResult.value.items||[]):[];
    bundleItems=bundleResult.status==='fulfilled'?(bundleResult.value.items||[]):[];

    const partialFailures=[kpiResult,previewResult,bundleResult].filter((result)=>result.status==='rejected');
    if(partialFailures.length){
      const partialAccess=partialFailures.some((result)=>isAccessDeniedError(result.reason));
      setPanelNotice(
        'subsStateNotice',
        tt('ts.rev.subs.partialTitle'),
        partialAccess
          ? tt('ts.rev.subs.partialAccessText')
          : tt('ts.rev.subs.partialLoadText'),
        partialAccess?'info':'warning'
      );
    }

    setSubKpis();
    renderBundleCenter();
    toggleElement('ldSubs',false);
    toggleElement('ctSubs',true);
    const pnd=allSubs.filter((s)=>s.status==='submitted').length;
    document.getElementById('tc-subs').textContent=pnd||allSubs.length||'0';
    renderSubs();
    subsLoaded=true;
  }catch(error){
    if(isTransientError(error)){
      // Tab-Wechsel oder Netz-Transient: Zustand nicht zerstoeren, damit
      // der naechste Tab-Besuch sauber reloaden kann.
      toggleElement('ldSubs',false);
      return;
    }
    allSubs=[];
    subKpis={};
    bundlePreview=[];
    bundleItems=[];
    subsLoaded=true;
    document.getElementById('tc-subs').textContent='–';
    toggleElement('ldSubs',false);
    toggleElement('ctSubs',false);
    if(isAccessDeniedError(error)){
      setPanelNotice(
        'subsStateNotice',
        tt('ts.rev.subs.noAccessTitle'),
        tt('ts.rev.notice.noOrgAccess'),
        'info'
      );
      return;
    }
    setPanelNotice(
      'subsStateNotice',
      tt('ts.rev.subs.loadFailTitle'),
      error?.message||tt('ts.rev.notice.retryLater'),
      'danger'
    );
  }
}
function setSubKpis(){
  const s=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  s('k1',subKpis.pending_review||0);
  s('k2',subKpis.in_review||0);
  s('k3',subKpis.needs_correction||0);
  s('k4',subKpis.approved_internal||0);
  s('k5',subKpis.sent_to_customer||0);
  s('k6',subKpis.confirmed||0);
  s('k7',subKpis.customer_rejected||0);
  s('k8',subKpis.posted||0);

  // Kundenversand-Zentrale Card befuellen
  updateCustomerFlowCard();
}

function updateCustomerFlowCard() {
  const ready = Number(subKpis.approved_internal || 0);
  const sent = Number(subKpis.sent_to_customer || 0);
  const confirmed = Number(subKpis.confirmed || 0);
  const rejected = Number(subKpis.customer_rejected || 0);
  const posted = Number(subKpis.posted || 0);
  const openAtCustomer = sent; // sent_to_customer = beim Kunden offen

  const sv = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  sv('ck-ready', ready);
  sv('ck-sent', sent);
  sv('ck-open', openAtCustomer);
  sv('ck-confirmed', confirmed);
  sv('ck-rejected', rejected);
  sv('ck-posted', posted);

  // Hauptaktion aktivieren/deaktivieren
  const btn = document.getElementById('custBtnSend');
  if (btn) {
    btn.disabled = (ready === 0 && bundlePreview.length === 0);
    btn.textContent = ready > 0
      ? tt('ts.rev.cust.btnReady', { n: ready })
      : tt('ts.rev.cust.btnReadyNone');
  }

  // Flow-Badge
  const badge = document.getElementById('custFlowBadge');
  if (badge) {
    if (rejected > 0) {
      badge.className = 'pill ' + tonePillClass('danger');
      badge.textContent = tt('ts.rev.cust.badgeAction');
    } else if (ready > 0) {
      badge.className = 'pill pill-pnd'; badge.textContent = tt('ts.rev.cust.badgeReady', { n: ready });
    } else if (openAtCustomer > 0) {
      badge.className = 'pill ' + tonePillClass('warning');
      badge.textContent = tt('ts.rev.cust.badgeOpen', { n: openAtCustomer });
    } else if (posted > 0 && ready === 0 && sent === 0 && rejected === 0) {
      badge.className = 'pill pill-act'; badge.textContent = tt('ts.rev.cust.badgeAllPosted');
    } else {
      badge.className = 'pill pill-pnd'; badge.textContent = tt('ts.rev.cust.badgeFlow');
    }
  }

  // Handlungsbedarf-Hinweis
  const hint = document.getElementById('custFlowHint');
  if (hint) {
    if (rejected > 0) {
      setToneHint(hint,'danger',tt('ts.rev.cust.hintRejected', { n: rejected }));
    } else if (ready > 0) {
      setToneHint(hint,'success',tt('ts.rev.cust.hintReady', { n: ready }));
    } else if (openAtCustomer > 0) {
      setToneHint(hint,'warning',tt('ts.rev.cust.hintOpen', { n: openAtCustomer }));
    } else if (posted > 0 && ready === 0 && sent === 0) {
      setToneHint(hint,'success',tt('ts.rev.cust.hintDone'));
    } else {
      setToneHint(hint,'','');
    }
  }
}

function setFilter(f){
  curFilter=f;
  document.querySelectorAll('.rev-pill').forEach(b=>b.classList.remove('on'));
  const m={pending:'fp',under_review:'fu',needs_correction:'fc',approved_internal:'fai',
            sent_to_customer:'fsc',customer_confirmed:'fcc',customer_rejected:'fcr',
            posted_to_timesheet:'fpt','':'fall'};
  const b=document.getElementById(m[f]);if(b)b.classList.add('on');
  renderSubs();
}
function getFiltered(){
  if(!curFilter)return allSubs;
  if(curFilter==='pending')return allSubs.filter(s=>s.status==='submitted');
  return allSubs.filter(s=>s.status===curFilter);
}
/* Naechster operativer Schritt je Submission-Status — Inline-Guidance auf der Zeile
   ("jeder weiss was als Naechstes zu tun ist"), analog requisitions REQ_NEXT_STEP /
   deals .dm-card__nextstep. Sicht: PDL-Reviewer (Unternehmen erreichen renderSubs nicht —
   Company-Soft-Lock mit return weiter oben). */
var SUB_NEXT_STEP = {
  submitted:          'ts.rev.next.submitted',
  under_review:       'ts.rev.next.underReview',
  needs_correction:   'ts.rev.next.needsCorrection',
  approved_internal:  'ts.rev.next.approvedInternal',
  sent_to_customer:   'ts.rev.next.sentToCustomer',
  customer_confirmed: 'ts.rev.next.customerConfirmed',
  customer_rejected:  'ts.rev.next.customerRejected'
  // posted_to_timesheet: Endzustand (eigener "Für Abrechnung verwendet"-Pill)
};
function subNextStep(status){ return SUB_NEXT_STEP[status] ? tt(SUB_NEXT_STEP[status]) : ''; }

function renderSubs(){
  const el=document.getElementById('subList'),items=getFiltered();
  if(!items.length){el.innerHTML='<div class="hub-empty"><h3>'+esc(tt('ts.rev.subs.emptyTitle'))+'</h3><p>'+esc(tt('ts.rev.subs.emptyText'))+'</p></div>';return;}
  el.innerHTML=items.map(s=>`
    <div class="rev-item${s.id===selId?' sel':''}" onclick="selSub('${s.id}')">
      <div class="rev-ihead">
        <div class="rev-iname">${esc(s.first_name||'')} ${esc(s.last_name||'')}${s.personnel_number?` <span style="font-weight:400;font-size:.74rem;color:var(--wk-text-muted)">– ${esc(s.personnel_number)}</span>`:''}
        </div>${badge(s.status)}
      </div>
      <div class="rev-isub">${fmtWeek(s.week_start,s.week_end)}${subDeadlineTag(s)}</div>
      <div class="rev-ifoot">
        <span style="font-size:.78rem;color:var(--wk-text-muted)">${esc(s.client_name||s.org_name||'')}</span>
        <span class="rev-ihours">${parseFloat(s.total_hours||0).toFixed(1)} h</span>
      </div>
      ${subNextStep(s.status)?`<div class="rev-inextstep" style="font-size:11px;color:var(--ds-brand,#4a9eff);font-weight:600;margin-top:4px">→ ${esc(subNextStep(s.status))}</div>`:''}
      ${s.status==='posted_to_timesheet'||s.timesheet_id?`<div style="margin-top:6px"><span class="pill pill-act">${esc(tt('ts.rev.bundle.used'))}</span></div>`:''}
    </div>`).join('');
}

function renderBundleCenter(){
  const prevEl=document.getElementById('bundlePreviewList');
  const sentEl=document.getElementById('bundleSentList');
  if(!prevEl||!sentEl)return;

  if(!bundlePreview.length){
    prevEl.innerHTML='<div class="hub-empty" style="padding:16px 10px"><p>'+esc(tt('ts.rev.bundle.emptyPreview'))+'</p></div>';
  }else{
    prevEl.innerHTML=bundlePreview.map(b=>`
      <div class="rev-item" style="margin-bottom:8px">
        <div class="rev-ihead">
          <div class="rev-iname">${esc(b.client_name||tt('ts.rev.bundle.clientFallback'))} <span style="font-weight:400;color:var(--wk-text-muted)">(${esc(b.period_key||'')})</span></div>
          <span class="pill pill-pnd">${esc(tt('ts.rev.bundle.positions', { n: b.submission_count||0 }))}</span>
        </div>
        <div class="rev-isub">${esc(b.earliest_week_start||'')} ${esc(tt('ts.rev.bundle.rangeTo'))} ${esc(b.latest_week_end||'')} • ${Number(b.total_hours||0).toFixed(1)} h</div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button class="wk-btn wk-btn-primary wk-btn-sm" onclick="sendBundleByKey('${esc(b.bundle_key)}')">${esc(tt('ts.rev.bundle.send'))}</button>
          <button class="wk-btn wk-btn-ghost wk-btn-sm" onclick="previewBundleScope('${esc(b.bundle_key)}')">${esc(tt('ts.rev.bundle.preview'))}</button>
        </div>
      </div>
    `).join('');
  }

  if(!bundleItems.length){
    sentEl.innerHTML='<div class="hub-empty" style="padding:16px 10px"><p>'+esc(tt('ts.rev.bundle.emptySent'))+'</p></div>';
  }else{
    sentEl.innerHTML=bundleItems.slice(0,12).map(b=>`
      <div class="rev-item" style="margin-bottom:8px">
        <div class="rev-ihead">
          <div class="rev-iname">${esc(b.client_name||tt('ts.rev.bundle.clientFallback'))}</div>
          ${badgeBundleStatus(b.customer_bundle_status)}
        </div>
        <div class="rev-isub">${esc(b.customer_bundle_key||'')}</div>
        <div style="font-size:.76rem;color:var(--wk-text-muted);margin-top:3px">
          ${esc(tt('ts.rev.bundle.counts', { items: b.submission_count||0, confirmed: b.customer_confirmed_count||0, posted: b.posted_count||0 }))}
        </div>
        ${renderBundleProgressBar(b)}
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button class="wk-btn wk-btn-outline wk-btn-sm" onclick="openBundleDetail('${esc(b.customer_bundle_key)}')">${esc(tt('ts.rev.bundle.details'))}</button>
          <button class="wk-btn wk-btn-ghost wk-btn-sm" onclick="downloadBundleCsv('${esc(b.customer_bundle_key)}')">CSV</button>
          <button class="wk-btn wk-btn-success wk-btn-sm" onclick="postBundle('${esc(b.customer_bundle_key)}')">${esc(tt('ts.rev.bundle.post'))}</button>
        </div>
      </div>
    `).join('');
  }
}

function renderBundleProgressBar(b){
  const total=Math.max(1,Number(b.submission_count||0));
  const sent=Number(b.sent_count||0);
  const confirmed=Number(b.customer_confirmed_count||0);
  const posted=Number(b.posted_count||0);
  const pSent=Math.round((sent/total)*100);
  const pConfirmed=Math.round((confirmed/total)*100);
  const pPosted=Math.round((posted/total)*100);
  return `
    <div style="margin-top:8px">
      <div style="display:flex;justify-content:space-between;font-size:.72rem;color:var(--wk-text-muted);margin-bottom:4px">
        <span>Fortschritt</span><span>${pPosted}% abgerechnet</span>
      </div>
      <div style="height:6px;border-radius:999px;background:var(--tc-progress-track);overflow:hidden;position:relative">
        <div style="position:absolute;left:0;top:0;bottom:0;width:${pSent}%;background:var(--tc-progress-brand)"></div>
        <div style="position:absolute;left:0;top:0;bottom:0;width:${pConfirmed}%;background:var(--tc-progress-success)"></div>
        <div style="position:absolute;left:0;top:0;bottom:0;width:${pPosted}%;background:var(--tc-progress-success-strong)"></div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px;font-size:.71rem;color:var(--wk-text-muted)">
        <span>${esc(tt('ts.rev.bundle.progressSent', { a: sent, b: total }))}</span>
        <span>${esc(tt('ts.rev.bundle.progressConfirmed', { a: confirmed, b: total }))}</span>
        <span>Abgerechnet ${posted}/${total}</span>
      </div>
    </div>`;
}
async function setStaffingSuggestionMode(assignmentId,hardOnly){
  if(!ensurePermission('workerEdit',tt('ts.rev.perm.staffingFilter')))return;
  try{
    const state=getStaffingUiState(assignmentId);
    state.hardOnly=!!hardOnly;
    await loadStaffingSuggestions(assignmentId,{limit:20,only_available:true,hard_only:state.hardOnly,include_blocked:true});
    renderStaffingPanel(assignmentId);
  }catch(e){toast(e.message||tt('ts.rev.msg.filterLoadFailed'),'error');}
}

function badgeBundleStatus(st){
  const m={
    sent:'<span class="pill pill-pnd">'+esc(tt('ts.rev.bundle.statusSent'))+'</span>',
    confirmed:'<span class="pill pill-act">'+esc(tt('ts.rev.bundle.statusConfirmed'))+'</span>',
    partially_confirmed:'<span class="pill pill-warn">Teilweise</span>',
    rejected:'<span class="pill pill-off">'+esc(tt('ts.rev.bundle.statusRejected'))+'</span>',
    prepared:'<span class="pill pill-off">Vorbereitet</span>'
  };
  return m[st]||`<span class="pill pill-off">${esc(st||'offen')}</span>`;
}

function parseBundleKey(key){
  const parts=String(key||'').split('|');
  const out={orgId:null,periodMode:'week',periodKey:null};
  parts.forEach(p=>{
    if(p.startsWith('org:'))out.orgId=p.slice(4);
    if(p.startsWith('mode:'))out.periodMode=p.slice(5);
    if(p.startsWith('period:'))out.periodKey=p.slice(7);
  });
  return out;
}

function onBundlePeriodModeChange(){
  const sel=document.getElementById('bundlePeriodMode');
  bundlePeriodMode=(sel&&sel.value==='month')?'month':'week';
  loadSubs().catch(()=>{});
}

async function sendBundleByKey(bundleKey){
  try{
    const meta=parseBundleKey(bundleKey);
    const csrf=await getCsrf();
    const r=await fetch(`${AGENCY_BUNDLES_URL}/send`,{
      method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({
        org_id:meta.orgId,
        period_mode:meta.periodMode,
        period_key:meta.periodKey
      })
    });
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Sammelversand fehlgeschlagen');
    toast(`Sammelversand gestartet (${d.submission_count||0} Positionen)`,'success');
    await loadSubs();
  }catch(e){toast(e.message||tt('ts.rev.msg.error'),'error');}
}

function previewBundleScope(bundleKey){
  const meta=parseBundleKey(bundleKey);
  const list=allSubs.filter(s=>s.org_id===meta.orgId && s.status==='approved_internal' && String(s.week_start||'').startsWith(String(meta.periodKey||'').slice(0,7)));
  if(!list.length){toast(tt('ts.rev.bundle.noMatch'),'error');return;}
  toast(tt('ts.rev.bundle.previewToast', { n: list.length, period: meta.periodKey }),'success');
}

async function openBundleDetail(bundleKey){
  try{
    const r=await fetch(`${AGENCY_BUNDLES_URL}/${encodeURIComponent(bundleKey)}`,{credentials:'include'});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||tt('ts.rev.bundle.notFound'));
    currentBundleDetailItems=d.items||[];
    currentBundleDetailKey=bundleKey;
    renderBundleDetailTable();
    document.getElementById('bundleModalOverlay').classList.add('on');
    document.getElementById('bundleModal').classList.add('on');
  }catch(e){toast(e.message||tt('ts.rev.msg.error'),'error');}
}

function renderBundleDetailTable(){
  const q=(document.getElementById('bundleDetailSearch')?.value||'').trim().toLowerCase();
  const sort=document.getElementById('bundleDetailSort')?.value||'week_desc';
  let items=currentBundleDetailItems.slice();
  if(q){
    items=items.filter(it=>{
      const worker=`${it.first_name||''} ${it.last_name||''}`.trim();
      const hay=`${worker} ${it.worker_email||''} ${it.client_name||''} ${it.status||''}`.toLowerCase();
      return hay.includes(q);
    });
  }
  if(sort==='hours_desc') items.sort((a,b)=>Number(b.total_hours||0)-Number(a.total_hours||0));
  if(sort==='hours_asc') items.sort((a,b)=>Number(a.total_hours||0)-Number(b.total_hours||0));
  if(sort==='status') items.sort((a,b)=>String(a.status||'').localeCompare(String(b.status||'')));
  if(sort==='week_asc') items.sort((a,b)=>String(a.week_start||'').localeCompare(String(b.week_start||'')));
  if(sort==='week_desc') items.sort((a,b)=>String(b.week_start||'').localeCompare(String(a.week_start||'')));

  const rows=items.map(it=>{
    const worker=`${it.first_name||''} ${it.last_name||''}`.trim()||it.worker_email||'–';
    const used=(it.status==='posted_to_timesheet'||it.timesheet_id)?'<span class="pill pill-act">'+esc(tt('ts.rev.bundle.used'))+'</span>':'<span class="pill pill-off">'+esc(tt('ts.rev.bundle.stillOpen'))+'</span>';
    return `<tr>
      <td>${esc(worker)}</td>
      <td>${esc(it.client_name||'')}</td>
      <td>${esc(fmtWeek(it.week_start,it.week_end))}</td>
      <td>${Number(it.total_hours||0).toFixed(1)} h</td>
      <td>${badge(it.status)}</td>
      <td>${used}</td>
      <td><button class="wk-btn wk-btn-ghost wk-btn-sm" onclick="openSubmissionFromBundle('${it.id}')">${esc(tt('ts.rev.bundle.open'))}</button></td>
    </tr>`;
  }).join('');

  const body=document.getElementById('bundleModalBody');
  body.innerHTML=`
    <div style="margin-bottom:10px;font-size:.85rem;color:var(--wk-text-muted)">${esc(currentBundleDetailKey)}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <input id="bundleDetailSearch" class="wk-input" placeholder="${esc(tt('ts.rev.bundle.searchPh'))}" style="max-width:280px" value="${esc(document.getElementById('bundleDetailSearch')?.value||'')}" oninput="renderBundleDetailTable()">
      <select id="bundleDetailSort" class="wk-input" style="width:180px" onchange="renderBundleDetailTable()">
        <option value="week_desc"${sort==='week_desc'?' selected':''}>${esc(tt('ts.rev.bundle.sortPeriodDesc'))}</option>
        <option value="week_asc"${sort==='week_asc'?' selected':''}>${esc(tt('ts.rev.bundle.sortPeriodAsc'))}</option>
        <option value="hours_desc"${sort==='hours_desc'?' selected':''}>${esc(tt('ts.rev.bundle.sortHoursDesc'))}</option>
        <option value="hours_asc"${sort==='hours_asc'?' selected':''}>${esc(tt('ts.rev.bundle.sortHoursAsc'))}</option>
        <option value="status"${sort==='status'?' selected':''}>${esc(tt('ts.rev.bundle.sortStatus'))}</option>
      </select>
    </div>
    <div class="wk-table-wrap">
      <table class="wk-table">
        <thead><tr><th>${esc(tt('ts.rev.bundle.colWorker'))}</th><th>${esc(tt('ts.rev.bundle.colClient'))}</th><th>${esc(tt('ts.rev.bundle.colPeriod'))}</th><th>${esc(tt('ts.rev.bundle.colHours'))}</th><th>${esc(tt('ts.rev.bundle.colStatus'))}</th><th>${esc(tt('ts.rev.bundle.colBilling'))}</th><th>${esc(tt('ts.rev.bundle.colAction'))}</th></tr></thead>
        <tbody>${rows||`<tr><td colspan="7">${esc(tt('ts.rev.bundle.noItems'))}</td></tr>`}</tbody>
      </table>
    </div>`;
}

async function openSubmissionFromBundle(submissionId){
  closeBundleModal();
  await selSub(submissionId);
}

function closeBundleModal(){
  document.getElementById('bundleModalOverlay').classList.remove('on');
  document.getElementById('bundleModal').classList.remove('on');
}

function downloadBundleCsv(bundleKey){
  const url=`${AGENCY_BUNDLES_URL}/${encodeURIComponent(bundleKey)}/export.csv`;
  window.open(url,'_blank','noopener');
}

async function postBundle(bundleKey){
  try{
    const csrf=await getCsrf();
    const r=await fetch(`${AGENCY_BUNDLES_URL}/${encodeURIComponent(bundleKey)}/post-to-timesheet`,{
      method:'POST',credentials:'include',headers:{'x-csrf-token':csrf}
    });
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||tt('ts.rev.bundle.postFailed'));
    toast(tt('ts.rev.bundle.postDone', { n: d.processed||0 }),'success');
    await loadSubs();
  }catch(e){toast(e.message||tt('ts.rev.msg.error'),'error');}
}
async function selSub(id){
  selId=id;renderSubs();
  document.getElementById('detEmpty').style.display='none';
  const dc=document.getElementById('detContent');
  dc.style.display='block';
  dc.innerHTML='<div style="padding:32px"><div class="skel"></div><div class="skel" style="opacity:.6"></div></div>';
  try{
    const r=await fetch(`${AGENCY_SUBS_URL}/${id}`,{credentials:'include'});
    renderDet(await r.json());
  }catch(e){dc.innerHTML='<div class="wk-alert wk-alert-danger"><span>'+esc(tt('ts.rev.detail.loadError'))+' '+esc(e.message)+'</span></div>';}
}
function renderDet(s){
  const st=s.status;
  const dc=document.getElementById('detContent');

  // Tageseinträge-Tabelle
  const rows=(s.entries||[]).length?`
    <table class="rev-etable">
      <thead><tr><th>${esc(tt('ts.rev.detail.colDay'))}</th><th>${esc(tt('ts.rev.detail.colDate'))}</th><th>${esc(tt('ts.rev.detail.colRegular'))}</th><th>${esc(tt('ts.rev.detail.colOvertime'))}</th><th>${esc(tt('ts.rev.detail.colBreak'))}</th><th>${esc(tt('ts.rev.detail.colFrom'))}</th><th>${esc(tt('ts.rev.detail.colTo'))}</th></tr></thead>
      <tbody>${(s.entries||[]).map(e=>`<tr>
        <td style="font-weight:600">${dayN(e.work_date)}</td>
        <td>${fmtD(e.work_date)}</td>
        <td>${parseFloat(e.hours_regular||0).toFixed(1)} h</td>
        <td style="color:${e.hours_overtime>0?'var(--wk-warning)':'inherit'}">${parseFloat(e.hours_overtime||0).toFixed(1)} h</td>
        <td>${e.break_minutes||0} min</td><td>${e.shift_start||'–'}</td><td>${e.shift_end||'–'}</td>
      </tr>`).join('')}</tbody>
    </table>`:
    '<p style="font-size:.85rem;color:var(--wk-text-muted);font-style:italic">'+esc(tt('ts.rev.detail.noEntries'))+'</p>';

  // Planvergleich
  let planHtml='';
  if(s.default_shift_start||s.default_hours_per_day){
    const planH=parseFloat(s.default_hours_per_day||0);
    const actH=parseFloat(s.total_hours||0);
    const diff=(actH-planH).toFixed(1);
    const diffCls=Math.abs(diff)<=0.5?'ok':'warn';
    planHtml=`<div class="rev-stitle">Plan vs. Ist</div>
    <div class="plan-vs">
      <div class="plan-vs-item"><div class="plan-vs-label">Plan</div>
        <div class="plan-vs-val">${planH>0?planH+' '+esc(tt('ts.rev.detail.hoursPerWeek')):''} ${s.default_shift_start?s.default_shift_start.substring(0,5)+' – '+s.default_shift_end?.substring(0,5)+'':''}</div>
        ${s.default_break_minutes?`<div style="font-size:.72rem;color:var(--wk-text-muted)">${s.default_break_minutes} ${esc(tt('ts.rev.detail.breakMinutes'))}</div>`:''}
      </div>
      <div class="plan-vs-item"><div class="plan-vs-label">Ist</div>
        <div class="plan-vs-val">${actH.toFixed(1)} h</div>
        ${planH>0?`<div class="plan-vs-diff ${diffCls}">${diff>0?'+':''}${diff} h vs. Plan</div>`:''}
      </div>
    </div>`;
  }

  // Kundeninfo + Benachrichtigungsstatus
  let custHtml='';
  if(['sent_to_customer','customer_confirmed','customer_rejected','posted_to_timesheet'].includes(st)){
    custHtml=`<div class="rev-stitle">Kundenstatus</div><div class="cust-info">`;
    if(s.customer_contact_name||s.customer_contact_email)
      custHtml+=`<div style="margin-bottom:6px;font-size:.84rem"><strong>Kundenkontakt:</strong> ${esc(s.customer_contact_name||'')}${s.customer_contact_email?` \u2013 <a href="mailto:${esc(s.customer_contact_email)}" style="color:var(--tc-link-accent)">${esc(s.customer_contact_email)}</a>`:''}</div>`;
    if(s.sent_to_customer_at)
      custHtml+=`<div style="font-size:.8rem;color:var(--wk-text-muted)">Intern gesendet: ${fmtD(s.sent_to_customer_at)}</div>`;
    // Benachrichtigungsstatus aus Events ableiten
    const notifEvent = (s.events||[]).find(e => e.event_type === 'sent_to_customer' && e.meta && e.meta.notified !== undefined);
    if (notifEvent) {
      if (notifEvent.meta.notified === true) {
        custHtml += `<div style="font-size:.8rem;color:var(--tc-tone-success-text);margin-top:4px">\u2709\uFE0F ${esc(tt('ts.rev.detail.customerNotified'))}${notifEvent.meta.customer_email ? ' ' + esc(tt('ts.rev.detail.customerNotifiedTo')) + ' ' + esc(notifEvent.meta.customer_email) : ''} \u2013 ${relT(notifEvent.created_at)}</div>`;
      } else if (notifEvent.meta.notified === false && notifEvent.meta.reason === 'no_customer_email') {
        custHtml += `<div style="font-size:.8rem;color:var(--tc-tone-warning-text);margin-top:4px">\u26A0\uFE0F ${esc(tt('ts.rev.detail.customerNoMail'))}</div>`;
      } else if (notifEvent.meta.notified === false && notifEvent.meta.error) {
        custHtml += `<div style="font-size:.8rem;color:var(--tc-tone-danger-text);margin-top:4px">\u274C E-Mail-Versand fehlgeschlagen: ${esc(notifEvent.meta.error)}</div>`;
      }
    } else if (!s.customer_contact_email) {
      custHtml += `<div style="font-size:.8rem;color:var(--wk-text-muted);margin-top:4px;font-style:italic">${esc(tt('ts.rev.detail.noCustomerContact'))}</div>`;
    }
    if(st==='customer_confirmed'&&s.customer_confirmed_at)
      custHtml+=`<div style="font-size:.8rem;color:var(--wk-success);margin-top:4px">\u2705 Best\u00e4tigt: ${fmtD(s.customer_confirmed_at)}${s.customer_confirmed_by?` durch ${esc(s.customer_confirmed_by)}`:''}</div>`;
    if(st==='customer_rejected'&&s.customer_rejected_at)
      custHtml+=`<div style="font-size:.8rem;color:var(--wk-warning);margin-top:4px">\u274C ${esc(tt('ts.rev.detail.customerRejectedAt'))} ${fmtD(s.customer_rejected_at)}</div>`;
    if(s.customer_note)
      custHtml+=`<div style="margin-top:8px;font-size:.83rem"><strong>Kundennotiz:</strong> ${esc(s.customer_note)}</div>`;
    custHtml+=`</div>`;
  }

  // Ereignis-Log
  const evs=(s.events||[]).slice(0,8).map(e=>`
    <div class="ev-row"><div class="ev-dot ${evClr(e.event_type)}"></div>
      <div style="flex:1"><span style="font-weight:600">${esc(e.actor_email||'System')}</span> ${evLbl(e.event_type)}</div>
      <div style="color:var(--wk-text-muted);font-size:.76rem;flex-shrink:0">${relT(e.created_at)}</div>
    </div>`).join('');

  // Aktionen je Status
  const _isOpen=['submitted','under_review','approved_internal','sent_to_customer','customer_confirmed','customer_rejected'].includes(st);
  let actHtml='';
  if(st==='submitted'){
    actHtml=`<div class="rev-actions">
      <button class="wk-btn wk-btn-outline" onclick="doAct('review','${s.id}')">${esc(tt('ts.rev.act.startReview'))}</button>
    </div>`;
  } else if(st==='under_review'){
    actHtml=`<div class="rev-actions">
      <button class="wk-btn wk-btn-success" onclick="doAct('approve','${s.id}')">? Intern genehmigen</button>
      <button class="wk-btn wk-btn-ghost" onclick="togNote('corr')">${esc(tt('ts.rev.act.correction'))}</button>
      <button class="wk-btn wk-btn-danger" onclick="togNote('rej')" style="flex:0 0 auto">?</button>
    </div>
    <div id="nb-corr" class="rev-notebox">
      <label class="wk-label">Korrekturhinweis <span class="required">*</span></label>
      <textarea class="wk-textarea" id="nt-corr" rows="2" placeholder="${esc(tt('ts.rev.act.correctionPh'))}"></textarea>
      <button class="wk-btn wk-btn-outline wk-btn-sm" style="margin-top:8px" onclick="doAct('request-correction','${s.id}')">${esc(tt('ts.rev.act.requestCorrection'))}</button>
    </div>
    <div id="nb-rej" class="rev-notebox">
      <label class="wk-label">Ablehnungsgrund</label>
      <textarea class="wk-textarea" id="nt-rej" rows="2" placeholder="${esc(tt('ts.rev.act.rejectPh'))}"></textarea>
      <button class="wk-btn wk-btn-danger wk-btn-sm" style="margin-top:8px" onclick="doAct('reject','${s.id}')">Ablehnen</button>
    </div>`;
  } else if(st==='approved_internal'){
    actHtml=`<div class="rev-actions">
      <button class="wk-btn wk-btn-primary" onclick="togNote('send')">${esc(tt('ts.rev.act.sendToCustomer'))}</button>
      <button class="wk-btn wk-btn-success" onclick="doAct('post-to-timesheet','${s.id}')">${esc(tt('ts.rev.act.postDirect'))}</button>
    </div>
    <div id="nb-send" class="rev-notebox">
      <label class="wk-label">${esc(tt('ts.rev.act.contactName'))}</label>
      <input class="wk-input" id="nt-cname" placeholder="Max Meier" style="margin-bottom:8px" value="${esc(s.customer_contact_name||'')}">
      <label class="wk-label">${esc(tt('ts.rev.act.contactEmail'))}</label>
      <input class="wk-input" id="nt-cemail" type="email" placeholder="kunde@firma.de" style="margin-bottom:8px" value="${esc(s.customer_contact_email||'')}">
      <label class="wk-label">${esc(tt('ts.rev.act.noteOptional'))}</label>
      <textarea class="wk-textarea" id="nt-cnote" rows="2" placeholder="${esc(tt('ts.rev.act.internalNotePh'))}"></textarea>
      <button class="wk-btn wk-btn-primary wk-btn-sm" style="margin-top:8px" onclick="doActSend('${s.id}')">${esc(tt('ts.rev.act.send'))}</button>
    </div>`;
  } else if(st==='sent_to_customer'){
    actHtml=`<div class="rev-actions">
      <button class="wk-btn wk-btn-success" onclick="togNote('cconf')">${esc(tt('ts.rev.act.customerConfirmed'))}</button>
      <button class="wk-btn wk-btn-ghost"   onclick="togNote('crej')">${esc(tt('ts.rev.act.customerRejected'))}</button>
    </div>
    <div id="nb-cconf" class="rev-notebox">
      <label class="wk-label">${esc(tt('ts.rev.act.confirmedBy'))}</label>
      <input class="wk-input" id="nt-confby" placeholder="${esc(tt('ts.rev.act.contactPersonPh'))}" style="margin-bottom:8px">
      <label class="wk-label">${esc(tt('ts.rev.act.noteOptional'))}</label>
      <textarea class="wk-textarea" id="nt-confnote" rows="2"></textarea>
      <button class="wk-btn wk-btn-success wk-btn-sm" style="margin-top:8px" onclick="doActConf('${s.id}')">${esc(tt('ts.rev.act.recordConfirmation'))}</button>
    </div>
    <div id="nb-crej" class="rev-notebox">
      <label class="wk-label">${esc(tt('ts.rev.act.reasonOrNote'))}</label>
      <textarea class="wk-textarea" id="nt-rejnote" rows="2" placeholder="${esc(tt('ts.rev.act.customerRejectPh'))}"></textarea>
      <button class="wk-btn wk-btn-ghost wk-btn-sm" style="margin-top:8px" onclick="doActCRej('${s.id}')">Ablehnung erfassen</button>
    </div>`;
  } else if(st==='customer_confirmed'){
    actHtml=`<div class="rev-actions">
      <button class="wk-btn wk-btn-success" onclick="doAct('post-to-timesheet','${s.id}')">? In Abrechnung buchen</button>
    </div>`;
  } else if(st==='customer_rejected'){
    actHtml=`<div class="rev-actions">
      <button class="wk-btn wk-btn-outline" onclick="doAct('review','${s.id}')">${esc(tt('ts.rev.act.backToReview'))}</button>
    </div>`;
  }

  const terminal=['rejected','accepted_into_timesheet','posted_to_timesheet','superseded'].includes(st);

  dc.innerHTML=`
    <div class="rev-dhead">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div class="rev-dname">${esc(s.first_name||'')} ${esc(s.last_name||'')}${s.personnel_number?` <span style="font-weight:400;font-size:.85rem;color:var(--wk-text-muted)">– ${esc(s.personnel_number)}</span>`:''}</div>
          <div class="rev-dmeta">${esc(s.worker_email||'')} – ${fmtWeek(s.week_start,s.week_end)}</div>
          ${s.client_name||s.org_name?`<div style="font-size:.8rem;color:var(--wk-text-muted);margin-top:2px">${esc(tt('ts.rev.detail.assignmentAt'))} <strong>${esc(s.client_name||s.org_name)}</strong></div>`:''}
        </div>${badge(st)}
      </div>
      <div class="rev-stats">
        <div><div class="rev-stat-label">Gesamtstunden</div><div class="rev-stat-val" style="color:var(--hub-accent)">${parseFloat(s.total_hours||0).toFixed(1)} h</div></div>
        <div><div class="rev-stat-label">${esc(tt('ts.rev.detail.overtime'))}</div><div class="rev-stat-val" style="color:${s.overtime_hours>0?'var(--wk-warning)':'var(--wk-text-muted)'}">${parseFloat(s.overtime_hours||0).toFixed(1)} h</div></div>
        ${s.submitted_at?`<div><div class="rev-stat-label">Eingereicht</div><div style="font-size:.85rem;margin-top:2px">${fmtD(s.submitted_at)}</div></div>`:''}
        ${s.approved_internal_at?`<div><div class="rev-stat-label">${esc(tt('ts.rev.detail.checkedInternal'))}</div><div style="font-size:.85rem;margin-top:2px">${fmtD(s.approved_internal_at)}</div></div>`:''}
        ${s.posted_to_timesheet_at?`<div><div class="rev-stat-label">In Abrechnung</div><div style="font-size:.85rem;margin-top:2px">${fmtD(s.posted_to_timesheet_at)}</div></div>`:''}
      </div>
      ${s.worker_comment?`<div class="rev-cbox wkr"><strong>${esc(tt('ts.rev.detail.workerComment'))}</strong> ${esc(s.worker_comment)}</div>`:''}
      ${s.reviewer_comment||s.correction_note?`<div class="rev-cbox rev"><strong>${esc(tt('ts.rev.detail.reviewNote'))}</strong> ${esc(s.reviewer_comment||s.correction_note)}</div>`:''}
    </div>
    ${planHtml}
    <div class="rev-stitle">${esc(tt('ts.rev.detail.entries'))}</div>${rows}
    ${custHtml}
    ${evs?`<div class="rev-stitle">Verlauf</div>${evs}`:''}
    ${actHtml}
    ${terminal?`<div class="wk-alert wk-alert-info" style="margin-top:16px"><span>??</span><span>Abgeschlossen – ${stLbl(st)}</span></div>`:''}
    ${s.timesheet_id||s.posted_to_timesheet_at?`<div class="wk-alert wk-alert-success" style="margin-top:10px"><span>?</span><span>${esc(tt('ts.rev.detail.posted'))}${s.timesheet_id?` – <a href="timesheets.html" style="color:inherit;font-weight:600">${esc(tt('ts.rev.detail.postedLink'))}</a>`:''}</span></div>`:''}`;
}
function togNote(t){
  // Alle anderen Noteboxen schließen
  document.querySelectorAll('.rev-notebox').forEach(b=>b.classList.remove('on'));
  const b=document.getElementById('nb-'+t);if(b)b.classList.toggle('on');
}

// Generische Action: review, approve, request-correction, reject, post-to-timesheet
async function doAct(action,id){
  let body={};
  if(action==='request-correction'){const v=document.getElementById('nt-corr')?.value?.trim();if(!v){toast(tt('ts.rev.act.needCorrectionNote'),'error');return;}body={note:v};}
  if(action==='reject'){const v=document.getElementById('nt-rej')?.value?.trim();body={note:v||''};}

  // Route-Mapping: alte agency-Endpunkte
  const routeMap={
    'review':          'start-review',
    'approve':         'approve',
    'request-correction':'request-correction',
    'reject':          'reject',
    'post-to-timesheet':'post-to-timesheet'
  };
  const route=routeMap[action]||action;
  try{
    const csrf=await getCsrf();
    const r=await fetch(`${AGENCY_SUBS_URL}/${id}/${route}`,{method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},body:JSON.stringify(body)});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||d.message||tt('ts.rev.msg.error'));
    const lbls={'review':tt('ts.rev.act.doneReview'),'approve':tt('ts.rev.act.doneApprove'),
                 'request-correction':tt('ts.rev.act.doneCorrection'),'reject':tt('ts.rev.act.doneReject'),
                 'post-to-timesheet':'? In Abrechnung gebucht'};
    toast(lbls[action]||'OK','success');
    await loadSubs();await selSub(id);
  }catch(e){toast(e.message||tt('ts.rev.msg.error'),'error');}
}

// An Kunden senden
async function doActSend(id){
  const cname=document.getElementById('nt-cname')?.value?.trim()||null;
  const cemail=document.getElementById('nt-cemail')?.value?.trim()||null;
  const cnote=document.getElementById('nt-cnote')?.value?.trim()||null;
  try{
    const csrf=await getCsrf();
    const r=await fetch(`${AGENCY_SUBS_URL}/${id}/send-to-customer`,{method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({customer_contact_name:cname,customer_contact_email:cemail,note:cnote})});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||tt('ts.rev.msg.error'));
    const notifMsg = d.customer_notified ? tt('ts.rev.act.sentAndMailed') : tt('ts.rev.act.sentNoMail');
    toast(notifMsg, d.customer_notified ? 'success' : 'warning');await loadSubs();await selSub(id);
  }catch(e){toast(e.message||tt('ts.rev.msg.error'),'error');}
}

// Kundenbestätigung
async function doActConf(id){
  const by=document.getElementById('nt-confby')?.value?.trim()||null;
  const note=document.getElementById('nt-confnote')?.value?.trim()||null;
  try{
    const csrf=await getCsrf();
    const r=await fetch(`${AGENCY_SUBS_URL}/${id}/customer-confirm`,{method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({customer_confirmed_by:by,note})});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||tt('ts.rev.msg.error'));
    toast(tt('ts.rev.act.confirmationSaved'),'success');await loadSubs();await selSub(id);
  }catch(e){toast(e.message||tt('ts.rev.msg.error'),'error');}
}

// Kundenablehnung
async function doActCRej(id){
  const note=document.getElementById('nt-rejnote')?.value?.trim()||null;
  try{
    const csrf=await getCsrf();
    const r=await fetch(`${AGENCY_SUBS_URL}/${id}/customer-reject`,{method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({reason:note})});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||tt('ts.rev.msg.error'));
    toast('? Kundenablehnung erfasst','success');await loadSubs();await selSub(id);
  }catch(e){toast(e.message||tt('ts.rev.msg.error'),'error');}
}

/* WORKERS */
async function loadWrks(){
  if(!pageAccess.tabs.wrks){
    wrksLoaded=true;
    setPanelNotice(
      'wrksStateNotice',
      tt('ts.rev.wrk.noAccessTitle'),
      tt('ts.rev.notice.noOrgAccess'),
      'info'
    );
    toggleElement('ldWrks',false);
    toggleElement('ctWrks',false);
    return;
  }

  setPanelNotice('wrksStateNotice','','');
  setPanelNotice(
    'wrksManageNotice',
    pageAccess.permissions.workerManage?'':tt('ts.rev.notice.partialAccess'),
    pageAccess.permissions.workerManage?'':tt('ts.rev.notice.wrksManageShort'),
    'info'
  );
  toggleElement('ldWrks',true,'block');
  toggleElement('ctWrks',false);
  document.getElementById('wkEmpty').style.display='none';

  try{
    const workersPayload=await fetchJson(`${API}/workers`);
    let invitePayload={ items:[] };
    let inviteError=null;
    if(pageAccess.permissions.workerManage){
      try{
        invitePayload=await fetchJson(`${API}/worker-invites`);
      }catch(error){
        inviteError=error;
      }
    }

    allWrks=workersPayload.items||workersPayload.workers||[];
    allInvs=invitePayload.items||invitePayload.invites||[];
    setWrkKpis();
    toggleElement('ldWrks',false);
    toggleElement('ctWrks',true);
    renderWrks();
    renderInvs();
    wrksLoaded=true;
    document.getElementById('tc-wrks').textContent=String(allWrks.length||0);
    if(inviteError){
      setPanelNotice(
        'wrksManageNotice',
        isAccessDeniedError(inviteError)?tt('ts.rev.notice.partialAccess'):tt('ts.rev.wrk.invitesFailTitle'),
        isAccessDeniedError(inviteError)
          ? tt('ts.rev.notice.wrksManageShort')
          : (inviteError?.message||tt('ts.rev.notice.retryLater')),
        isAccessDeniedError(inviteError)?'info':'warning'
      );
    }
  }catch(error){
    if(isTransientError(error)){
      toggleElement('ldWrks',false);
      return;
    }
    allWrks=[];
    allInvs=[];
    wrksLoaded=true;
    document.getElementById('tc-wrks').textContent='–';
    toggleElement('ldWrks',false);
    toggleElement('ctWrks',false);
    setPanelNotice(
      'wrksStateNotice',
      isAccessDeniedError(error)?tt('ts.rev.wrk.noAccessTitle'):tt('ts.rev.wrk.loadFailTitle'),
      isAccessDeniedError(error)
        ? tt('ts.rev.notice.noOrgAccess')
        : (error?.message||tt('ts.rev.notice.retryLater')),
      isAccessDeniedError(error)?'info':'danger'
    );
  }
}
function setWrkKpis(){
  const act=allWrks.filter(w=>w.is_active!==false).length;
  const off=allWrks.filter(w=>w.is_active===false).length;
  const pnd=allInvs.filter(i=>i.status==='pending').length;
  document.getElementById('kw1').textContent=act;
  document.getElementById('kw2').textContent=pageAccess.permissions.workerManage?pnd:'–';
  document.getElementById('kw3').textContent=off;
  document.getElementById('kw4').textContent=allWrks.length;
}
function filterW(){renderWrks(document.getElementById('wSearch').value.trim().toLowerCase());}
function renderWrks(q=''){
  const tb=document.getElementById('wkTbody'),emp=document.getElementById('wkEmpty');
  let list=allWrks;
  if(q)list=list.filter(w=>`${w.first_name} ${w.last_name} ${w.email||''} ${w.personnel_number||''}`.toLowerCase().includes(q));
  if(!list.length){tb.innerHTML='';emp.style.display='block';return;}
  emp.style.display='none';
  const canManage=pageAccess.permissions.workerManage;
  const canOpenAssignments=pageAccess.tabs.asgn;
  const canDirectAssign=pageAccess.permissions.workerEdit;
  tb.innerHTML=list.map(w=>{
    const ini=`${(w.first_name||'?')[0]}${(w.last_name||'?')[0]}`.toUpperCase();
    const act=w.is_active!==false;
    const actions=[];
    if(canDirectAssign&&act){
      actions.push(`<button class="wk-btn wk-btn-primary wk-btn-sm" onclick="openWorkerAssignDrw('${w.id||w.user_id}')">${esc(tt('ts.rev.wrk.assignAssignment'))}</button>`);
    }
    if(canOpenAssignments){
      actions.push(`<button class="wk-btn wk-btn-ghost wk-btn-sm" onclick="viewWorkerLinks('${w.id||w.user_id}')">&#9881; ${esc(tt('ts.rev.wrk.showAssignments'))}</button>`);
    }
    if(canManage){
      actions.push(
        act
          ? `<button class="wk-btn wk-btn-ghost wk-btn-sm" onclick="togWrk('${w.id||w.user_id}',false)">Deaktivieren</button>`
          : `<button class="wk-btn wk-btn-outline wk-btn-sm" onclick="togWrk('${w.id||w.user_id}',true)">Aktivieren</button>`
      );
    }
    return `<tr>
      <td><div class="wk-namecell"><div class="wk-avatar" style="${aColor(w.first_name+w.last_name)}">${ini}</div>
        <div><div class="wk-nname">${esc(w.first_name||'')} ${esc(w.last_name||'')}</div>
          <div class="wk-nemail">${esc(w.email||'')}</div></div></div></td>
      <td><span style="font-size:.82rem;font-family:monospace;color:var(--wk-text-muted)">${esc(w.personnel_number||'–')}</span></td>
      <td><span class="pill ${act?'pill-act':'pill-off'}">${esc(act?tt('ts.rev.wrk.active'):tt('ts.rev.wrk.inactive'))}</span></td>
      <td style="font-size:.82rem;color:var(--wk-text-muted)">${w.created_at?fmtD(w.created_at):'–'}</td>
      <td style="text-align:right"><div style="display:flex;gap:6px;justify-content:flex-end">
        ${actions.join('')}
      </div></td></tr>`;
  }).join('');
}
function renderInvs(){
  const sec=document.getElementById('invSection'),lst=document.getElementById('invList');
  if(!pageAccess.permissions.workerManage){
    sec.style.display='none';
    lst.innerHTML='';
    return;
  }
  const pnd=allInvs.filter(i=>i.status==='pending');
  if(!pnd.length){sec.style.display='none';return;}
  sec.style.display='block';
  lst.innerHTML=pnd.map(inv=>`
    <div class="inv-item">
      <div class="inv-ava">?</div>
      <div class="inv-info">
        <div class="inv-name">${esc(inv.first_name||'')} ${esc(inv.last_name||'')} ${inv.email?`<span style="font-weight:400;color:var(--wk-text-muted)">– ${esc(inv.email)}</span>`:''}
        </div>
        <div class="inv-meta">${esc(tt('ts.rev.wrk.invitedExpires', { rel: inv.created_at?relT(inv.created_at):'', exp: inv.expires_at?fmtD(inv.expires_at):'–' }))}</div>
      </div>
      <span class="pill pill-pnd">Ausstehend</span>
      <div class="inv-acts">
        <button class="wk-btn wk-btn-ghost wk-btn-sm" onclick="resendInv('${inv.id}')">? Erneut</button>
        <button class="wk-btn wk-btn-ghost wk-btn-sm" style="color:var(--wk-danger)" onclick="revokeInv('${inv.id}')">?</button>
      </div>
    </div>`).join('');
}
async function togWrk(id,act){
  if(!ensurePermission('workerManage',tt('ts.rev.perm.workerActivate')))return;
  try{
    const csrf=await getCsrf();
    const endpoint=act?`${API}/workers/${id}/activate`:`${API}/workers/${id}/deactivate`;
    const r=await fetch(endpoint,{method:'POST',credentials:'include',headers:{'x-csrf-token':csrf}});
    if(!r.ok)throw new Error(tt('ts.rev.msg.error'));
    toast(act?'Aktiviert':'Deaktiviert','success');wrksLoaded=false;await loadWrks();
  }catch(e){toast(e.message,'error');}
}
async function resendInv(id){
  if(!ensurePermission('workerManage',tt('ts.rev.perm.workerInvites')))return;
  try{
    const csrf=await getCsrf();
    const r=await fetch(`${API}/worker-invites/${id}/resend`,{method:'POST',credentials:'include',headers:{'x-csrf-token':csrf}});if(!r.ok)throw new Error(tt('ts.rev.msg.error'));toast(tt('ts.rev.wrk.inviteResent'),'success');
  }catch(e){toast(e.message,'error');}
}
async function revokeInv(id){
  if(!ensurePermission('workerManage',tt('ts.rev.perm.workerInvites')))return;
  if(!confirm('Einladung wirklich widerrufen?'))return;
  try{
    const csrf=await getCsrf();
    const r=await fetch(`${API}/worker-invites/${id}/revoke`,{method:'POST',credentials:'include',headers:{'x-csrf-token':csrf}});if(!r.ok)throw new Error(tt('ts.rev.msg.error'));toast(tt('ts.rev.wrk.inviteRevoked'),'success');wrksLoaded=false;await loadWrks();
  }catch(e){toast(e.message,'error');}
}

/* MAILPIT (dev only) */
if(['localhost','127.0.0.1'].includes(location.hostname)){
  const mp=document.getElementById('mailpitLink');
  if(mp){mp.style.display='';mp.href=location.protocol+'//'+location.hostname+':8025';}
}

/* DRAWER: Einladen */
function openDrw(){
  if(!ensurePermission('workerManage',tt('ts.rev.perm.workerInviteSend')))return;
  document.getElementById('drwOvl').classList.add('on');
  document.getElementById('drw').classList.add('on');
  document.getElementById('invErr').style.display='none';
  ['ifn','iln','iem','ipn','iph'].forEach(i=>{const el=document.getElementById(i);if(el)el.value='';});
  setTimeout(()=>document.getElementById('ifn').focus(),250);
}
function closeDrw(){document.getElementById('drwOvl').classList.remove('on');document.getElementById('drw').classList.remove('on');}
async function sendInv(){
  if(!ensurePermission('workerManage',tt('ts.rev.perm.workerInviteSend')))return;
  const fn=document.getElementById('ifn').value.trim();
  const ln=document.getElementById('iln').value.trim();
  const em=document.getElementById('iem').value.trim();
  const pn=document.getElementById('ipn').value.trim();
  const ph=document.getElementById('iph').value.trim();
  const err=document.getElementById('invErr');
  if(!fn||!ln||!em){err.textContent=tt('ts.rev.wrk.errNameMail');err.style.display='block';return;}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)){err.textContent=tt('ts.rev.wrk.errMail');err.style.display='block';return;}
  const btn=document.getElementById('invBtn');btn.disabled=true;btn.textContent=tt('ts.rev.btn.sending');err.style.display='none';
  try{
    const csrf=await getCsrf();
    const r=await fetch(`${API}/worker-invites`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','x-csrf-token':csrf},body:JSON.stringify({first_name:fn,last_name:ln,email:em,personnel_number:pn||undefined,phone:ph||undefined})});
    const d=await r.json();if(!r.ok)throw new Error(d.error||d.message||tt('ts.rev.msg.error'));
    toast(`Einladung an ${fn} ${ln} gesendet ?`,'success');closeDrw();wrksLoaded=false;await loadWrks();
  }catch(e){err.textContent=e.message;err.style.display='block';}
  finally{btn.disabled=false;btn.textContent=tt('ts.rev.wrk.inviteBtn');}
}


/* CREATE WORKER DRAWER */
function openCreateDrw(){
  if(!ensurePermission('workerCreate',tt('ts.rev.perm.workerCreate')))return;
  document.getElementById('crtDrwOvl').classList.add('on');
  document.getElementById('crtDrw').classList.add('on');
  document.getElementById('crtErr').style.display='none';
  ['cfn','cln','cem','cpw','cpn','cph','cst','cplz','cci'].forEach(i=>{const el=document.getElementById(i);if(el)el.value='';});
  setTimeout(()=>document.getElementById('cfn').focus(),250);
}
function closeCreateDrw(){document.getElementById('crtDrwOvl').classList.remove('on');document.getElementById('crtDrw').classList.remove('on');}
async function submitCreate(){
  if(!ensurePermission('workerCreate',tt('ts.rev.perm.workerCreate')))return;
  const fn=document.getElementById('cfn').value.trim();
  const ln=document.getElementById('cln').value.trim();
  const em=document.getElementById('cem').value.trim();
  const pw=document.getElementById('cpw').value;
  const err=document.getElementById('crtErr');
  if(!fn||!ln||!em||!pw){err.textContent=tt('ts.rev.wrk.errNameMailPw');err.style.display='block';return;}
  if(pw.length<8){err.textContent=tt('ts.rev.wrk.errPwLength');err.style.display='block';return;}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)){err.textContent=tt('ts.rev.wrk.errMail');err.style.display='block';return;}
  const btn=document.getElementById('crtBtn');btn.disabled=true;btn.textContent=tt('ts.rev.btn.creating');err.style.display='none';
  try{
    const csrf=await getCsrf();
    const body={first_name:fn,last_name:ln,email:em,password:pw};
    const pn=document.getElementById('cpn').value.trim();if(pn)body.personnel_number=pn;
    const ph=document.getElementById('cph').value.trim();if(ph)body.phone=ph;
    const st=document.getElementById('cst').value.trim();if(st)body.street=st;
    const plz=document.getElementById('cplz').value.trim();if(plz)body.postal_code=plz;
    const ci=document.getElementById('cci').value.trim();if(ci)body.city=ci;
    const r=await fetch(`${API}/workers`,{method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},body:JSON.stringify(body)});
    const d=await r.json();
    if(!r.ok){const eMsg=d.error==='EMAIL_EXISTS'?tt('ts.rev.wrk.errMailExists'):(typeof d.error==='string'?d.error:d.error?.message||d.message||tt('ts.rev.msg.error'));throw new Error(eMsg);}
    toast(tt('ts.rev.wrk.created', { first: fn, last: ln }),'success');closeCreateDrw();wrksLoaded=false;await loadWrks();
  }catch(e){err.textContent=e.message;err.style.display='block';}
  finally{btn.disabled=false;btn.textContent=tt('ts.rev.wrk.createBtn');}
}

/* WORKER DIRECT ASSIGNMENT DRAWER */
function renderWorkerAssignWorkerSummary(worker){
  const metrics=[
    { label:tt('ts.rev.wrk.statActive'), value:Number(worker?.active_assignments||0) },
    { label:'Skills', value:Number(worker?.skill_count||0) },
    { label:'Qualifikationen', value:Number(worker?.qualification_count||0) },
    { label:tt('ts.rev.wrk.statDocs'), value:Number(worker?.document_count||0) }
  ];
  const metricHtml=metrics.map((item)=>`
    <div style="padding:10px 12px;border:1px solid var(--tc-tone-neutral-border);border-radius:10px;background:var(--tc-surface-subtle)">
      <div style="font-size:11px;color:var(--wk-text-muted);text-transform:uppercase;letter-spacing:.05em">${esc(item.label)}</div>
      <div style="font-size:18px;font-weight:800;margin-top:4px">${esc(String(item.value))}</div>
    </div>
  `).join('');
  const expiredDocs=Number(worker?.expired_document_count||0);
  const expiringSoon=Number(worker?.expiring_soon_document_count||0);
  return `
    <div style="padding:12px 14px;border:1px solid var(--tc-tone-neutral-border);border-radius:12px;background:var(--tc-surface-emphasis);margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
        <div style="min-width:0">
          <div style="font-size:15px;font-weight:800">${esc(`${worker?.first_name||''} ${worker?.last_name||''}`.trim()||worker?.email||'Worker')}</div>
          <div style="font-size:12px;color:var(--wk-text-muted);margin-top:4px">
            ${esc(worker?.email||tt('ts.rev.wrk.noEmail'))}${worker?.personnel_number?` · ${esc(worker.personnel_number)}`:''}
          </div>
        </div>
        <span class="pill ${worker?.is_active!==false?'pill-act':'pill-off'}">${esc(worker?.is_active!==false?tt('ts.rev.wrk.active'):tt('ts.rev.wrk.inactive'))}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-top:12px">
        ${metricHtml}
      </div>
      ${worker?.availability_note?`<div style="font-size:12px;color:var(--wk-text-muted);margin-top:12px"><strong style="color:var(--wk-text)">${esc(tt('ts.rev.wrk.availabilityNote'))}</strong> ${esc(worker.availability_note)}</div>`:''}
      ${(expiredDocs>0||expiringSoon>0||worker?.next_document_expiry)?`
        <div style="margin-top:12px;padding:10px 12px;border-radius:10px;background:${expiredDocs>0?'var(--tc-tone-warning-bg-strong)':'var(--tc-tone-brand-bg)'};color:${expiredDocs>0?'var(--tc-tone-warning-strong-text)':'var(--tc-tone-brand-text)'}">
          ${expiredDocs>0
            ? `<strong>${esc(tt('ts.rev.wrk.docsExpired', { n: expiredDocs }))}</strong>`
            : `<strong>${esc(tt('ts.rev.wrk.docsWatch'))}</strong>`}
          ${expiringSoon>0?` ${esc(tt('ts.rev.wrk.docsExpiring', { n: expiringSoon }))}`:''}
          ${worker?.next_document_expiry?` ${esc(tt('ts.rev.wrk.nextExpiry', { date: fmtD(worker.next_document_expiry) }))}`:''}
        </div>
      `:''}
    </div>
  `;
}

function workerAssignmentDecisionConfig(suggestion){
  if(!suggestion){
    return { cls:'pill-off', label:'Kontext fehlt' };
  }
  if(suggestion.quick_assign_eligible){
    return { cls:'pill-act', label:'Safe Case' };
  }
  if(suggestion.is_selectable){
    return { cls:'pill-warn', label:tt('ts.rev.wrk.manualCheck') };
  }
  return { cls:'pill-danger', label:'Blockiert' };
}

function workerAssignmentPeopleText(items,fallbackText){
  const people=(Array.isArray(items)?items:[])
    .map((entry)=>`${entry?.first_name||''} ${entry?.last_name||''}`.trim()||entry?.worker_email||entry?.worker_user_id||'Worker')
    .filter(Boolean);
  if(!people.length)return fallbackText;
  const visible=people.slice(0,3).map((name)=>esc(name)).join(', ');
  return people.length>3?`${visible} +${people.length-3}`:visible;
}

function buildWorkerAssignmentManualConfirmMessage(worker,assignment,suggestion,choiceSets){
  const lines=[
    tt('ts.rev.drawer.confirmWorker', { worker: (`${worker?.first_name||''} ${worker?.last_name||''}`).trim()||worker?.email||'Worker' }),
    tt('ts.rev.drawer.confirmAssignment', { assignment: assignment?.worker_description||assignment?.request_title||tt('ts.rev.staffing.dealAssignmentFallback') })
  ];
  const warnings=[];
  const blockerText=staffingCriteriaText(suggestion?.quick_assign_blockers);
  const missingText=staffingCriteriaText(suggestion?.missing_requirements);
  const hardFailText=staffingCriteriaText(suggestion?.hard_failures);
  if(blockerText)warnings.push(`Hinweise: ${blockerText}`);
  if(missingText)warnings.push(`Fehlende Anforderungen: ${missingText}`);
  if(hardFailText)warnings.push(`Blocker: ${hardFailText}`);
  if(choiceSets.length){
    warnings.push(`Aktive Auswahlphase: ${choiceSets.map((choiceSet)=>`${choiceSet.title||'Auswahlphase'} (${staffingChoiceSetStatusLabel(choiceSet.status)})`).join(', ')}`);
  }
  if(suggestion?.has_open_invite)warnings.push(tt('ts.rev.drawer.warnOpenInvite'));
  if(suggestion?.already_contacted)warnings.push(tt('ts.rev.drawer.warnContacted'));
  return `${lines.join('\n')}${warnings.length?`\n\n${tt('ts.rev.drawer.confirmCheck')}\n- ${warnings.join('\n- ')}\n\n${tt('ts.rev.drawer.confirmQuestion')}`:`\n\n${tt('ts.rev.drawer.confirmQuestion')}`}`;
}

function renderWorkerAssignCardBody(assignment,cardState){
  if(cardState.loading){
    return '<div style="margin-top:12px;padding:12px;color:var(--wk-text-muted);font-size:12px;border-top:1px solid var(--tc-tone-neutral-border)">'+esc(tt('ts.rev.staffing.loadingContext'))+'</div>';
  }
  if(cardState.error){
    return `
      <div style="margin-top:12px;border-top:1px solid var(--tc-tone-neutral-border);padding-top:12px">
        <div class="wk-alert wk-alert-danger"><span>&#9888;</span><span>${esc(cardState.error)}</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          <button class="wk-btn wk-btn-outline wk-btn-sm" onclick="refreshWorkerAssignmentCardContext('${assignment.assignment_id}')">Erneut laden</button>
          <button class="wk-btn wk-btn-ghost wk-btn-sm" onclick="openWorkerAssignmentInStaffingTab('${assignment.assignment_id}')">${esc(tt('ts.rev.drawer.toCard'))}</button>
        </div>
      </div>
    `;
  }
  const detail=cardState.detail||{};
  const detailAssignment=detail.assignment||assignment;
  const requirements=detail.requirements||{};
  const suggestion=cardState.suggestion;
  const choiceSets=(detail.choice_sets||[]).filter((choiceSet)=>choiceSet.worker_user_id===workerAssignmentDrawerState.workerId);
  const requested=Number(detailAssignment.requested_quantity||detailAssignment.worker_count||assignment.requested_quantity||assignment.worker_count||1);
  const filled=Number(detailAssignment.filled_quantity||assignment.filled_quantity||0);
  const reserved=Number(detailAssignment.reserved_quantity||assignment.reserved_quantity||0);
  const open=Number(detailAssignment.open_quantity||assignment.open_quantity||Math.max(requested-filled-reserved,0));
  const fitText=staffingFactorText(suggestion?.factor_scores)||staffingReasonText(suggestion?.match_reasons);
  const hardFailText=staffingCriteriaText(suggestion?.hard_failures);
  const missingText=staffingCriteriaText(suggestion?.missing_requirements);
  const blockerText=staffingCriteriaText(suggestion?.quick_assign_blockers);
  const signals=[];
  if(Number(suggestion?.conflict_count||0)>0)signals.push(`${Number(suggestion.conflict_count)} Einsatzkonflikt${Number(suggestion.conflict_count)===1?'':'e'}`);
  if(Number(suggestion?.reservation_conflict_count||0)>0)signals.push(`${Number(suggestion.reservation_conflict_count)} Reservierungskonflikt${Number(suggestion.reservation_conflict_count)===1?'':'e'}`);
  if(Number(suggestion?.current_reservation_count||0)>0)signals.push(tt('ts.rev.drawer.signalReservations', { n: Number(suggestion.current_reservation_count) }));
  if(suggestion?.has_open_invite)signals.push(tt('ts.rev.drawer.signalOpenInvite'));
  if(suggestion?.already_contacted)signals.push(tt('ts.rev.drawer.signalContacted'));
  if(Number(suggestion?.same_client_assignment_count||0)>0)signals.push(tt('ts.rev.drawer.signalSameClient', { n: Number(suggestion.same_client_assignment_count) }));
  if(choiceSets.length)signals.push(tt('ts.rev.drawer.signalChoiceSets', { n: choiceSets.length }));
  const canQuickAssign=!!(suggestion&&suggestion.quick_assign_eligible&&open>0);
  const canManualAssign=!!(suggestion&&suggestion.is_selectable&&open>0);
  return `
    <div style="margin-top:12px;border-top:1px solid var(--tc-tone-neutral-border);padding-top:12px;display:grid;gap:12px">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:10px">
        <div style="padding:10px 12px;border:1px solid var(--tc-tone-neutral-border);border-radius:10px;background:var(--tc-surface-subtle)">
          <div style="font-size:11px;color:var(--wk-text-muted);text-transform:uppercase;letter-spacing:.05em">${esc(tt('ts.rev.drawer.contextHeading'))}</div>
          <div style="display:grid;gap:6px;margin-top:8px;font-size:12px">
            <div><strong>${esc(tt('ts.rev.drawer.role'))}</strong> ${esc(requirements.role||detailAssignment.worker_description||assignment.request_title||tt('ts.rev.staffing.dealAssignmentFallback'))}</div>
            <div><strong>${esc(tt('ts.rev.drawer.client'))}</strong> ${esc(detailAssignment.client_org_name||assignment.client_org_name||tt('ts.rev.drawer.clientUnknown'))}</div>
            <div><strong>${esc(tt('ts.rev.drawer.period'))}</strong> ${esc(detailAssignment.start_date?`${fmtD(detailAssignment.start_date)}${detailAssignment.planned_end_date?` – ${fmtD(detailAssignment.planned_end_date)}`:` – ${tt('ts.rev.drawer.openSuffix')}`}`:tt('ts.rev.drawer.clientUnknown'))}</div>
            <div><strong>${esc(tt('ts.rev.drawer.location'))}</strong> ${esc(requirements.location_city||assignment.demand_location_city||tt('ts.rev.drawer.clientUnknown'))}</div>
            <div><strong>${esc(tt('ts.rev.drawer.shift'))}</strong> ${esc(requirements.shift_model||tt('ts.rev.drawer.clientUnknown'))}</div>
            <div><strong>${esc(tt('ts.rev.drawer.slots'))}</strong> ${esc(tt('ts.rev.drawer.slotsValue', { filled: filled, reserved: reserved, open: open, requested: requested }))}</div>
          </div>
        </div>
        <div style="padding:10px 12px;border:1px solid var(--tc-tone-neutral-border);border-radius:10px;background:var(--tc-surface-subtle)">
          <div style="font-size:11px;color:var(--wk-text-muted);text-transform:uppercase;letter-spacing:.05em">${esc(tt('ts.rev.drawer.workerCheck'))}</div>
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
            <div style="font-size:13px;font-weight:700">${esc(suggestion?tt('ts.rev.drawer.score', { score: Number(suggestion.total_score||suggestion.score||0) }):tt('ts.rev.drawer.noMatchContext'))}</div>
            <span class="pill ${workerAssignmentDecisionConfig(suggestion).cls}">${esc(workerAssignmentDecisionConfig(suggestion).label)}</span>
          </div>
          <div style="font-size:12px;color:var(--wk-text-muted);margin-top:8px">${esc(fitText||tt('ts.rev.drawer.fitFallback'))}</div>
          ${signals.length?`<div style="font-size:11px;color:var(--wk-text-muted);margin-top:8px"><strong style="color:var(--wk-text)">${esc(tt('ts.rev.drawer.signals'))}</strong> ${esc(signals.join(' · '))}</div>`:''}
          ${hardFailText?`<div style="font-size:11px;color:var(--tc-tone-danger-text);margin-top:8px"><strong>${esc(tt('ts.rev.drawer.blocker'))}</strong> ${esc(hardFailText)}</div>`:''}
          ${missingText?`<div style="font-size:11px;color:var(--tc-tone-warning-text);margin-top:6px"><strong>${esc(tt('ts.rev.drawer.missingReq'))}</strong> ${esc(missingText)}</div>`:''}
          ${blockerText&&!hardFailText?`<div style="font-size:11px;color:var(--tc-tone-warning-text);margin-top:6px"><strong>${esc(tt('ts.rev.drawer.safeCaseHints'))}</strong> ${esc(blockerText)}</div>`:''}
        </div>
      </div>
      <div style="padding:10px 12px;border:1px solid var(--tc-tone-neutral-border);border-radius:10px;background:var(--tc-surface-subtle)">
        <div style="font-size:11px;color:var(--wk-text-muted);text-transform:uppercase;letter-spacing:.05em">${esc(tt('ts.rev.drawer.liveStatus'))}</div>
        <div style="display:grid;gap:6px;margin-top:8px;font-size:12px">
          <div><strong>${esc(tt('ts.rev.drawer.alreadyAssigned'))}</strong> ${workerAssignmentPeopleText(detail.current_workers,tt('ts.rev.drawer.noneAssigned'))}</div>
          <div><strong>${esc(tt('ts.rev.drawer.reserved'))}</strong> ${workerAssignmentPeopleText((detail.reservations||[]).filter((entry)=>entry.status==='reserved'),tt('ts.rev.drawer.noReservations'))}</div>
          <div><strong>${esc(tt('ts.rev.drawer.choiceSetsForWorker'))}</strong> ${choiceSets.length?esc(choiceSets.map((choiceSet)=>`${choiceSet.title||tt('ts.rev.drawer.choiceFallback')} (${staffingChoiceSetStatusLabel(choiceSet.status)})`).join(' · ')):esc(tt('ts.rev.drawer.noChoiceSet'))}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="wk-btn wk-btn-outline wk-btn-sm" onclick="refreshWorkerAssignmentCardContext('${assignment.assignment_id}')">${esc(tt('ts.rev.drawer.refresh'))}</button>
        ${canQuickAssign?`<button class="wk-btn wk-btn-success wk-btn-sm" onclick="quickAssignWorkerFromDrawer('${assignment.assignment_id}')">${esc(tt('ts.rev.drawer.quickAssign'))}</button>`:''}
        <button class="wk-btn ${(canQuickAssign||!canManualAssign)?'wk-btn-ghost':'wk-btn-primary'} wk-btn-sm" ${canManualAssign?'':'disabled'} onclick="manualAssignWorkerFromDrawer('${assignment.assignment_id}')">${esc(canQuickAssign?tt('ts.rev.drawer.manualAssign'):(canManualAssign?tt('ts.rev.drawer.manualAssignAnyway'):tt('ts.rev.drawer.manualImpossible')))}</button>
        <button class="wk-btn wk-btn-ghost wk-btn-sm" onclick="openWorkerAssignmentInStaffingTab('${assignment.assignment_id}')">${esc(tt('ts.rev.drawer.toCard'))}</button>
      </div>
    </div>
  `;
}

function renderWorkerAssignCard(assignment,worker){
  const cardState=getWorkerAssignmentDrawerCardState(assignment.assignment_id);
  const expanded=workerAssignmentDrawerState.activeAssignmentId===assignment.assignment_id;
  const requested=Number(assignment.requested_quantity||assignment.worker_count||1);
  const filled=Number(assignment.filled_quantity||0);
  const reserved=Number(assignment.reserved_quantity||0);
  const open=Number(assignment.open_quantity||Math.max(requested-filled-reserved,0));
  const start=assignment.start_date?fmtD(assignment.start_date):tt('ts.rev.drawer.startOpen');
  const end=assignment.planned_end_date?fmtD(assignment.planned_end_date):tt('ts.rev.drawer.openSuffix');
  const summaryBadges=[];
  summaryBadges.push(`<span class="pill pill-pnd">${esc(tt('ts.rev.drawer.openSlots', { n: open }))}</span>`);
  if(cardState.loaded){
    const decision=workerAssignmentDecisionConfig(cardState.suggestion);
    summaryBadges.push(`<span class="pill ${decision.cls}">${esc(decision.label)}</span>`);
  }
  return `
    <div style="border:1px solid var(--tc-tone-neutral-border);border-radius:12px;background:var(--tc-surface-emphasis);padding:14px">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">
        <div style="min-width:0;flex:1">
          <div style="font-size:14px;font-weight:800">${esc(assignment.worker_description||assignment.request_title||tt('ts.rev.staffing.dealAssignmentFallback'))}</div>
          <div style="font-size:12px;color:var(--wk-text-muted);margin-top:4px">
            ${esc([assignment.client_org_name||'',`${start} – ${end}`,assignment.demand_location_city||''].filter(Boolean).join(' · ')||tt('ts.rev.drawer.contextLoading'))}
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
          ${summaryBadges.join('')}
          <button class="wk-btn wk-btn-outline wk-btn-sm" onclick="toggleWorkerAssignAssignment('${assignment.assignment_id}')">${esc(expanded?tt('ts.rev.drawer.contextClose'):tt('ts.rev.drawer.contextCheck'))}</button>
        </div>
      </div>
      ${expanded?renderWorkerAssignCardBody(assignment,cardState):''}
    </div>
  `;
}

function renderWorkerAssignDrw(){
  const worker=getWorkerById(workerAssignmentDrawerState.workerId);
  const titleEl=document.getElementById('wrkAssignTitle');
  const subEl=document.getElementById('wrkAssignSubtitle');
  const summaryEl=document.getElementById('wrkAssignWorkerSummary');
  const loadingEl=document.getElementById('wrkAssignLoading');
  const emptyEl=document.getElementById('wrkAssignEmpty');
  const errEl=document.getElementById('wrkAssignErr');
  const listEl=document.getElementById('wrkAssignList');
  if(titleEl)titleEl.textContent=tt('ts.rev.drawer.assignTitle');
  if(subEl)subEl.textContent=worker?tt('ts.rev.drawer.assignSubtitle', { worker: (`${worker.first_name||''} ${worker.last_name||''}`).trim()||worker.email||'Worker' }):tt('ts.rev.drawer.workerLoading');
  if(summaryEl)summaryEl.innerHTML=worker?renderWorkerAssignWorkerSummary(worker):'';
  if(loadingEl)loadingEl.style.display=workerAssignmentDrawerState.loading?'block':'none';
  if(errEl){
    if(workerAssignmentDrawerState.error){
      errEl.textContent=workerAssignmentDrawerState.error;
      errEl.style.display='block';
    }else{
      errEl.style.display='none';
      errEl.textContent='';
    }
  }
  if(!worker||workerAssignmentDrawerState.loading){
    if(emptyEl)emptyEl.style.display='none';
    if(listEl)listEl.innerHTML='';
    return;
  }
  if(!openDealAssignments.length){
    if(emptyEl)emptyEl.style.display='block';
    if(listEl)listEl.innerHTML='';
    return;
  }
  if(emptyEl)emptyEl.style.display='none';
  if(listEl)listEl.innerHTML=openDealAssignments.map((assignment)=>renderWorkerAssignCard(assignment,worker)).join('');
}

async function openWorkerAssignDrw(workerId){
  if(!ensurePermission('workerEdit',tt('ts.rev.perm.directAssign')))return;
  const worker=getWorkerById(workerId);
  if(!worker){toast(tt('ts.rev.drawer.workerLoadFailed'),'error');return;}
  resetWorkerAssignmentDrawerState(workerId);
  setStaffingWorkerPrefill(workerId);
  document.getElementById('wrkAssignDrwOvl').classList.add('on');
  document.getElementById('wrkAssignDrw').classList.add('on');
  workerAssignmentDrawerState.loading=true;
  workerAssignmentDrawerState.error='';
  renderWorkerAssignDrw();
  try{
    await loadDealAsgn();
    applyStaffingWorkerPrefill(workerId);
  }catch(error){
    workerAssignmentDrawerState.error=error?.message||tt('ts.rev.drawer.openDealsFailed');
  }finally{
    workerAssignmentDrawerState.loading=false;
    renderWorkerAssignDrw();
  }
}

function closeWorkerAssignDrw(){
  document.getElementById('wrkAssignDrwOvl').classList.remove('on');
  document.getElementById('wrkAssignDrw').classList.remove('on');
  resetWorkerAssignmentDrawerState();
}

async function loadWorkerAssignmentCardContext(assignmentId,{force=false}={}){
  const workerId=workerAssignmentDrawerState.workerId;
  if(!workerId)return;
  const cardState=getWorkerAssignmentDrawerCardState(assignmentId);
  if(cardState.loading)return;
  if(cardState.loaded&&!force){
    renderWorkerAssignDrw();
    return;
  }
  cardState.loading=true;
  cardState.error='';
  renderWorkerAssignDrw();
  try{
    const detailPromise=(!force&&staffingDetailsByAssignment[assignmentId])
      ? Promise.resolve(staffingDetailsByAssignment[assignmentId])
      : loadStaffingDetail(assignmentId);
    const suggestionPromise=loadStaffingSuggestionForWorker(assignmentId,workerId,{force});
    const [detail,suggestionEntry]=await Promise.all([detailPromise,suggestionPromise]);
    cardState.detail=detail||null;
    cardState.suggestion=suggestionEntry?.suggestion||null;
    cardState.loaded=true;
  }catch(error){
    cardState.error=error?.message||tt('ts.rev.drawer.contextFailed');
    cardState.loaded=false;
  }finally{
    cardState.loading=false;
    renderWorkerAssignDrw();
  }
}

async function refreshWorkerAssignmentCardContext(assignmentId){
  return loadWorkerAssignmentCardContext(assignmentId,{force:true});
}

async function toggleWorkerAssignAssignment(assignmentId){
  if(workerAssignmentDrawerState.activeAssignmentId===assignmentId){
    workerAssignmentDrawerState.activeAssignmentId='';
    renderWorkerAssignDrw();
    return;
  }
  workerAssignmentDrawerState.activeAssignmentId=assignmentId;
  renderWorkerAssignDrw();
  await loadWorkerAssignmentCardContext(assignmentId);
}

async function quickAssignWorkerFromDrawer(assignmentId){
  const workerId=workerAssignmentDrawerState.workerId;
  if(!workerId){
    toast(tt('ts.rev.drawer.noWorkerSelected'),'error');
    return;
  }
  await runStaffingQuickAssign(assignmentId,[workerId]);
}

async function manualAssignWorkerFromDrawer(assignmentId){
  const worker=getWorkerById(workerAssignmentDrawerState.workerId);
  const assignment=openDealAssignments.find((entry)=>entry.assignment_id===assignmentId);
  const cardState=getWorkerAssignmentDrawerCardState(assignmentId);
  const suggestion=cardState.suggestion;
  const choiceSets=(cardState.detail?.choice_sets||[]).filter((choiceSet)=>choiceSet.worker_user_id===workerAssignmentDrawerState.workerId);
  if(!worker||!assignment||!suggestion||!suggestion.is_selectable){
    toast(tt('ts.rev.drawer.notEligible'),'error');
    return;
  }
  const confirmMessage=buildWorkerAssignmentManualConfirmMessage(worker,assignment,suggestion,choiceSets);
  await assignDealWorkerRequest(assignmentId,workerAssignmentDrawerState.workerId,{
    clientName:getAssignmentClientName(assignmentId),
    confirmMessage,
    successMessage:tt('ts.rev.drawer.assignedManually')
  });
}

async function openWorkerAssignmentInStaffingTab(assignmentId){
  if(!pageAccess.tabs.asgn){
    toast(tt('ts.rev.perm.cardRole'),'error');
    return;
  }
  const workerId=workerAssignmentDrawerState.workerId;
  setStaffingWorkerPrefill(workerId);
  closeWorkerAssignDrw();
  await switchTab('asgn');
  applyStaffingWorkerPrefill(workerId);
  if(pageAccess.permissions.workerEdit){
    await openStaffingPanel(assignmentId,{forceReload:true,scrollIntoView:true});
  }
}

/* ASSIGN CAPACITY DRAWER */
function openAssignDrw(){
  if(!ensurePermission('workerEdit',tt('ts.rev.perm.staffingActions')))return;
  document.getElementById('asgDrwOvl').classList.add('on');
  document.getElementById('asgDrw').classList.add('on');
  document.getElementById('asgErr').style.display='none';
  document.getElementById('asgLoading').style.display='block';
  document.getElementById('asgContent').style.display='none';
  document.getElementById('asgEmpty').style.display='none';
  loadAssignData();
}
function closeAssignDrw(){document.getElementById('asgDrwOvl').classList.remove('on');document.getElementById('asgDrw').classList.remove('on');}
async function loadAssignData(){
  if(!pageAccess.permissions.workerEdit){
    document.getElementById('asgLoading').style.display='none';
    document.getElementById('asgContent').style.display='none';
    document.getElementById('asgEmpty').style.display='none';
    const err=document.getElementById('asgErr');
    err.textContent=tt('ts.rev.perm.staffingRoleShort');
    err.style.display='block';
    return;
  }
  try{
    // Unified Dispatcher-Drawer: lade proaktive Personalangebote UND offene
    // Deal-Einsaetze aus dem Aggregator /assignable-sources. Jeder Eintrag
    // kommt mit `source` (capacity | deal_assignment) – die Dispatch-Logik
    // in submitAssign waehlt anhand dessen das richtige Backend-Ziel.
    const dC=await fetchJson(`${API}/assignable-sources`);
    unassignedCaps=dC.items||[];
    await loadSupplierBlocks();
    if(!wrksLoaded){
      const dW=await fetchJson(`${API}/workers`);
      allWrks=dW.items||dW.workers||[];
      wrksLoaded=true;
    }
    document.getElementById('asgLoading').style.display='none';
    if(!unassignedCaps.length){
      document.getElementById('asgEmpty').style.display='block';return;
    }
    document.getElementById('asgContent').style.display='block';
    // Populate capacity select (gruppiert nach Quelle)
    const sel=document.getElementById('asgCap');
    const capGroup=unassignedCaps.filter((c)=>c.source==='capacity');
    const dealGroup=unassignedCaps.filter((c)=>c.source==='deal_assignment');
    const renderOption=(c)=>{
      // value traegt source-Marker, damit onCapSelect + submitAssign wissen,
      // welcher Backend-Pfad zu benutzen ist.
      const value=`${c.source}:${c.id}`;
      const titleText=esc(c.title||c.role||(c.source==='deal_assignment'?tt('ts.rev.staffing.dealAssignmentFallback'):tt('ts.rev.assign.capacityFallback')));
      const locationText=c.location_city?' \u2013 '+esc(c.location_city):'';
      const dateText=c.availability_from?' \u2013 '+fmtD(c.availability_from):'';
      const remainText=(c.source==='deal_assignment'&&Number.isFinite(Number(c.remaining)))
        ?' \u2013 '+tt('ts.rev.assign.optionOpenOf', { open: Number(c.remaining), total: Number(c.headcount||c.remaining) })
        :(c.headcount?' \u2013 '+Number(c.headcount)+' Plaetze':'');
      const clientText=c.client_org_name?' \u2013 '+esc(c.client_org_name):'';
      return `<option value="${value}">${titleText}${locationText}${dateText}${remainText}${clientText}</option>`;
    };
    let html='<option value="">'+esc(tt('ts.rev.assign.pleaseChoose'))+'</option>';
    if(capGroup.length){
      html+='<optgroup label="'+esc(tt('ts.rev.assign.groupCapacity'))+'">'+capGroup.map(renderOption).join('')+'</optgroup>';
    }
    if(dealGroup.length){
      html+='<optgroup label="'+esc(tt('ts.rev.assign.groupDeals'))+'">'+dealGroup.map(renderOption).join('')+'</optgroup>';
    }
    sel.innerHTML=html;
    // Populate worker select (active only)
    const wSel=document.getElementById('asgWkr');
    const activeW=allWrks.filter(w=>w.is_active!==false);
    wSel.innerHTML='<option value="">'+esc(tt('ts.rev.assign.pleaseChoose'))+'</option>'+activeW.map(w=>
      `<option value="${w.id||w.user_id}">${esc(w.first_name||'')} ${esc(w.last_name||'')}${w.personnel_number?' ('+esc(w.personnel_number)+')':''}</option>`
    ).join('');
  }catch(e){
    document.getElementById('asgLoading').style.display='none';
    document.getElementById('asgContent').style.display='none';
    document.getElementById('asgEmpty').style.display='none';
    const err=document.getElementById('asgErr');
    const code=e && e.code ? ` (${String(e.code)})` : '';
    err.innerHTML=
      '<div style="font-weight:700;margin-bottom:4px">'+esc(tt('ts.rev.assign.loadFailTitle'))+'</div>'
      +'<div style="opacity:.9">'+esc(tt('ts.rev.assign.loadFailText'))+code+'</div>'
      +'<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">'
        +'<button class="wk-btn wk-btn-outline wk-btn-sm" onclick="retryLoadAssignData()">Erneut laden</button>'
      +'</div>'
      +'<details style="margin-top:10px;opacity:.9"><summary style="cursor:pointer">'+esc(tt('ts.rev.assign.technicalDetails'))+'</summary>'
        +'<div style="margin-top:6px;font-family:monospace;font-size:.78rem;white-space:pre-wrap">unassigned-capacity-posts: '
          +esc((e && e.message) ? e.message : 'error')
        +'</div>'
      +'</details>';
    err.style.display='block';
  }
}

async function retryLoadAssignData(){
  document.getElementById('asgErr').style.display='none';
  document.getElementById('asgLoading').style.display='block';
  document.getElementById('asgContent').style.display='none';
  document.getElementById('asgEmpty').style.display='none';
  return loadAssignData();
}
function parseAssignableSelection(raw){
  if(!raw)return null;
  const idx=raw.indexOf(':');
  if(idx<=0)return { source:'capacity', id:raw };
  return { source:raw.slice(0,idx), id:raw.slice(idx+1) };
}
/* P3.3 \u2014 Sperr-Hinweise: welcher eigene Worker ist bei welchem Kunden gesperrt.
 * Einmal geladen, dann rein clientseitig gefiltert (kein Request je Auswahl). */
let supplierBlocks=[];
function blocksForCompany(companyOrgId){
  if(!companyOrgId)return new Map();
  const m=new Map();
  supplierBlocks.forEach((b)=>{
    if(String(b.company_org_id)===String(companyOrgId))m.set(String(b.worker_user_id),b);
  });
  return m;
}

function rebuildWorkerSelect(blockedWorkerUserIds,companyOrgId){
  const wSel=document.getElementById('asgWkr');
  if(!wSel)return;
  const prev=wSel.value;
  const activeW=allWrks.filter((w)=>w.is_active!==false);
  const blocked=new Set((blockedWorkerUserIds||[]).map(String));
  const available=activeW.filter((w)=>!blocked.has(String(w.id||w.user_id)));
  const hidden=activeW.length-available.length;
  const hiddenLabel=hidden>0?` (${hidden} ausgeblendet: bereits zugewiesen)`:'';
  // Vom Kunden gesperrte Kr\u00e4fte werden NICHT versteckt, sondern sichtbar deaktiviert \u2014
  // der Disponent muss den Grund sehen, nicht r\u00e4tseln, warum jemand fehlt.
  const byCompany=blocksForCompany(companyOrgId);
  let blockedCount=0;
  wSel.innerHTML='<option value="">'+esc(tt('ts.rev.assign.pleaseChoose'))+hiddenLabel+'</option>'
    +available.map((w)=>{
      const uid=String(w.id||w.user_id);
      const blk=byCompany.get(uid);
      const name=`${esc(w.first_name||'')} ${esc(w.last_name||'')}${w.personnel_number?' ('+esc(w.personnel_number)+')':''}`;
      if(!blk)return `<option value="${uid}">${name}</option>`;
      blockedCount++;
      const until=blk.blocked_until?(' bis '+fmtD(blk.blocked_until)):' dauerhaft';
      return `<option value="${uid}" disabled>${name} ${esc(tt('ts.rev.assign.blockedSuffix'))}${esc(until)}</option>`;
    }).join('');
  if(prev && !blocked.has(String(prev)) && !byCompany.has(String(prev))) wSel.value=prev;
  setAssignBlockNotice(byCompany,blockedCount);
}

function setAssignBlockNotice(byCompany,count){
  const info=document.getElementById('asgCapInfo');
  if(!info||!count)return;
  const names=[...byCompany.values()].map((b)=>esc(b.reason||'ohne Grundangabe')).slice(0,3);
  info.insertAdjacentHTML('beforeend',
    '<div class="wk-alert wk-alert-warn" style="margin-top:8px;font-size:.8rem">'
    +'<strong>'+esc(tt('ts.rev.assign.blockedTitle', { n: count }))+'</strong> '
    +esc(tt('ts.rev.assign.blockedHint', { names: names.join(' \u00b7 ') }))
    +'</div>');
}

async function loadSupplierBlocks(){
  try{
    const d=await fetchJson(`${API}/workers/blocks`);
    supplierBlocks=d.items||[];
  }catch(e){ supplierBlocks=[]; }  // Hinweis ist Zusatz \u2014 Zuweisung darf nie daran scheitern
}
function onCapSelect(){
  const raw=document.getElementById('asgCap').value;
  const info=document.getElementById('asgCapInfo');
  const sel=parseAssignableSelection(raw);
  if(!sel){
    info.style.display='none';
    rebuildWorkerSelect([],null);
    return;
  }
  const c=unassignedCaps.find((x)=>x.source===sel.source && String(x.id)===String(sel.id))
    ||unassignedCaps.find((x)=>String(x.id)===String(sel.id));
  if(!c){
    info.style.display='none';
    rebuildWorkerSelect([],null);
    return;
  }
  // Bereits verknuepfte Worker aus dem Dropdown filtern (krankgemeldete /
  // abgelehnte sind serverseitig bereits ausgeschlossen).
  info.style.display='block';
  const sourceBadge=c.source==='deal_assignment'
    ? '<span class="pill pill-pnd" style="margin-left:6px">Aus Deal</span>'
    : '<span class="pill pill-act" style="margin-left:6px">Proaktiv</span>';
  const remain=(c.source==='deal_assignment'&&Number.isFinite(Number(c.remaining)))
    ? tt('ts.rev.assign.optionOpenOf', { open: Number(c.remaining), total: Number(c.headcount||c.remaining) })
    : (c.headcount?Number(c.headcount)+' Plaetze':'');
  info.innerHTML=`<strong>${esc(c.title||c.role||'')}</strong>${sourceBadge}`
    +(c.role&&c.role!==c.title?`<br><span style="color:var(--wk-text-muted);font-size:.78rem">${esc(tt('ts.rev.assign.optRole'))} ${esc(c.role)}</span>`:'')
    +(c.client_org_name?`<br>${esc(tt('ts.rev.assign.infoClient'))} <strong>${esc(c.client_org_name)}</strong>`:'')
    +(c.location_city?`<br>${esc(tt('ts.rev.assign.optCity'))} ${esc(c.location_city)}`:'')
    +(c.availability_from?`<br>${esc(tt('ts.rev.assign.optPeriod'))} ${fmtD(c.availability_from)}${c.availability_to?' \u2013 '+fmtD(c.availability_to):''}`:'')
    +(c.shift_model?`<br>Schichtmodell: ${esc(c.shift_model)}`:'')
    +(remain?`<br>${esc(tt('ts.rev.assign.infoStaff'))} ${esc(remain)}`:'');
  // Erst jetzt, damit der Sperr-Hinweis an die fertige Info-Box angehängt wird.
  rebuildWorkerSelect(Array.isArray(c.assigned_worker_user_ids)?c.assigned_worker_user_ids:[], c.client_org_id||null);
  // Pre-fill Start/End aus der Quelle (capacity.availability_* bzw. deal_assignment.start_date/planned_end_date)
  if(c.availability_from) document.getElementById('asgStart').value=String(c.availability_from).substring(0,10);
  if(c.availability_to)   document.getElementById('asgEnd').value=String(c.availability_to).substring(0,10);
  // Pre-fill Kundenname bei Deal-Einsatz (leer lassen bei proaktivem Personalangebot)
  const clientEl=document.getElementById('asgClient');
  if(clientEl){
    if(c.source==='deal_assignment'&&c.client_org_name){ clientEl.value=c.client_org_name; }
    else if(c.source==='capacity'){ /* Kundenname bleibt frei – proaktives Personalangebot hat noch keinen Kunden */ }
  }
}
async function submitAssign(){
  if(!ensurePermission('workerEdit',tt('ts.rev.perm.staffingActions')))return;
  const raw=document.getElementById('asgCap').value;
  const wkrId=document.getElementById('asgWkr').value;
  const start=document.getElementById('asgStart').value;
  const err=document.getElementById('asgErr');
  const sel=parseAssignableSelection(raw);
  if(!sel||!wkrId||!start){
    err.textContent=tt('ts.rev.assign.missingFields');
    err.style.display='block';
    return;
  }
  err.style.display='none';
  const btn=document.getElementById('asgBtn');btn.disabled=true;btn.textContent=tt('ts.rev.btn.assigning');
  try{
    const csrf=await getCsrf();
    const commonBody={
      worker_user_id:wkrId,
      start_date:start,
      end_date:document.getElementById('asgEnd').value||null,
      default_hours_per_day:parseFloat(document.getElementById('asgHpd').value)||8,
      default_break_minutes:parseInt(document.getElementById('asgBrk').value)||30,
      default_shift_start:document.getElementById('asgShStart').value||null,
      default_shift_end:document.getElementById('asgShEnd').value||null,
      client_name:document.getElementById('asgClient').value.trim()||null,
      notes:document.getElementById('asgNotes').value.trim()||null
    };
    let url;
    let body;
    if(sel.source==='deal_assignment'){
      url=`${API}/assign-deal-to-worker`;
      body={ ...commonBody, assignment_id:sel.id };
    }else{
      url=`${API}/assign-capacity-to-worker`;
      body={ ...commonBody, capacity_post_id:sel.id };
    }
    const r=await fetch(url,{method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},body:JSON.stringify(body)});
    const d=await r.json();
    if(!r.ok){
      const msgs={
        CAPACITY_NOT_FOUND:tt('ts.rev.assign.errCapacityNotFound'),
        CAPACITY_NOT_ASSIGNABLE:tt('ts.rev.assign.errCapacityNotAssignable'),
        ASSIGNMENT_NOT_FOUND:tt('ts.rev.assign.errAssignmentNotFound'),
        ASSIGNMENT_NOT_ASSIGNABLE:tt('ts.rev.assign.errAssignmentNotAssignable'),
        ASSIGNMENT_FILLED:tt('ts.rev.assign.errAssignmentFilled'),
        WORKER_ALREADY_LINKED:tt('ts.rev.assign.errWorkerLinked'),
        WORKER_NOT_FOUND:tt('ts.rev.assign.errWorkerNotFound'),
        WORKER_INACTIVE:tt('ts.rev.assign.errWorkerInactive'),
        SCHEDULE_CONFLICT:tt('ts.rev.assign.errScheduleConflict')
      };
      throw new Error(msgs[d.error]||d.message||d.error||tt('ts.rev.msg.error'));
    }
    const toastMsg=sel.source==='deal_assignment'
      ? tt('ts.rev.assign.doneDeal')
      : tt('ts.rev.assign.doneCapacity');
    toast(toastMsg,'success');
    closeAssignDrw();
    linksLoaded=false;
    dealAsgnLoaded=false;
    closedDealAsgnLoaded=false;
    await loadAsgn();
    if(pageAccess.permissions.workerEdit) await loadDealAsgn();
    await loadClosedDealAsgn();
  }catch(e){
    err.textContent=(e && e.message) ? e.message : tt('ts.rev.msg.error');
    err.style.display='block';
  }
  finally{btn.disabled=false;btn.textContent=tt('ts.rev.assign.submitBtn');}
}

/* DEAL ASSIGNMENTS – offene Einsätze aus Deals */
async function loadDealAsgn(){
  const sec=document.getElementById('dealAsgnSection');
  if(!pageAccess.permissions.workerEdit){
    openDealAssignments=[];
    dealAsgnLoaded=true;
    if(sec)sec.style.display='none';
    renderStaffingFastTrackNotice();
    return;
  }
  try{
    const d=await fetchJson(`${API}/open-deal-assignments`);
    const items=d.items||[];
    openDealAssignments=items;
    if(!items.length){
      dealAsgnLoaded=true;
      if(sec)sec.style.display='none';
      renderStaffingFastTrackNotice();
      return;
    }
    sec.style.display='block';
    const grid=document.getElementById('dealAsgnGrid');
    grid.innerHTML=items.map(a=>{
      const start=a.start_date?a.start_date.substring(0,10):'–';
      const end=a.planned_end_date?a.planned_end_date.substring(0,10):'offen';
      const requested=Number(a.requested_quantity||a.worker_count||1);
      const filled=Number(a.filled_quantity||0);
      const reserved=Number(a.reserved_quantity||0);
      const open=Number(a.open_quantity||Math.max(requested-filled-reserved,0));
      const inviteCount=Math.min(Math.max(open*3,open||1),20);
      const isFastTrackTarget=staffingFastTrackContext.assignmentId===a.assignment_id;
      return `<div class="asgn-card" id="dealAsgnCard-${a.assignment_id}" style="border-left:3px solid ${isFastTrackTarget?'var(--wk-success)':'var(--hub-accent)'}">
        <div class="asgn-card-header">
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <div class="asgn-card-title">${esc(a.worker_description||a.request_title||tt('ts.rev.staffing.dealAssignmentFallback'))}</div>
            ${isFastTrackTarget?'<span class="pill pill-act">Fast-Track</span>':''}
          </div>
          <span class="asgn-badge asgn-badge--planned">${staffingBadgeLabel(a.staffing_status||'open')}</span>
        </div>
        <div class="asgn-card-meta">
          ${a.client_org_name?'<span>&#128188; '+esc(a.client_org_name)+'</span>':''}
          <span>&#128197; ${start} – ${end}</span>
        </div>
        ${isFastTrackTarget?`<div style="margin-top:8px;font-size:12px;color:var(--tc-tone-success-text)">${esc(tt('ts.rev.fastTrack.openedFromDeal'))}</div>`:''}
        <div style="margin-top:8px;font-size:12px;color:var(--wk-text-muted);line-height:1.5">
          <strong style="color:var(--wk-text)">Besetzungsstand:</strong>
          ${esc(tt('ts.rev.asgn.slots', { filled: filled, reserved: reserved, open: open, requested: requested }))}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
          <button class="wk-btn wk-btn-primary wk-btn-sm" onclick="inviteTopWorkers('${a.assignment_id}',${inviteCount})">Beste ${inviteCount} anfragen</button>
          <button class="wk-btn wk-btn-ghost wk-btn-sm" onclick="toggleStaffingPanel('${a.assignment_id}')">${esc(tt('ts.rev.staffing.suggestions'))}</button>
        </div>
        <div style="margin-top:8px">
          <select class="wk-select" id="dealWkr-${a.assignment_id}" style="font-size:12px;padding:4px 8px;max-width:200px">
            <option value="">${esc(tt('ts.rev.staffing.chooseWorker'))}</option>
          </select>
          <button class="wk-btn wk-btn-primary wk-btn-sm" id="dealAssignBtn-${a.assignment_id}" style="margin-left:6px" onclick="assignDealWorker('${a.assignment_id}')">Zuweisen</button>
        </div>
        <div id="staffingPanel-${a.assignment_id}" style="display:none;margin-top:12px"></div>
      </div>`;
    }).join('');
    let workerError=null;
    if(!wrksLoaded){
      try{
        const dW=await fetchJson(`${API}/workers`);
        allWrks=dW.items||dW.workers||[];
        wrksLoaded=true;
      }catch(error){
        if(isTransientError(error)) return;
        workerError=error;
      }
    }
    const activeW=allWrks.filter(w=>w.is_active!==false);
    items.forEach(a=>{
      const sel=document.getElementById('dealWkr-'+a.assignment_id);
      const btn=document.getElementById('dealAssignBtn-'+a.assignment_id);
      if(sel){
        sel.innerHTML='<option value="">'+esc(tt('ts.rev.staffing.chooseWorker'))+'</option>'+activeW.map(w=>`<option value="${w.id||w.user_id}">${esc(w.first_name||'')} ${esc(w.last_name||'')}${w.personnel_number?' ('+esc(w.personnel_number)+')':''}</option>`).join('');
        sel.disabled=!activeW.length;
      }
      if(btn)btn.disabled=!activeW.length;
    });
    applyStaffingWorkerPrefill();
    const choiceBtn=document.getElementById('dealChoiceSetBtn');
    if(choiceBtn)choiceBtn.disabled=items.length<2||!activeW.length;
    dealAsgnLoaded=true;
    if(workerError){
      setPanelNotice(
        'asgnEditNotice',
        isAccessDeniedError(workerError)?tt('ts.rev.asgn.manualLimited'):tt('ts.rev.asgn.workerPickFailTitle'),
        isAccessDeniedError(workerError)
          ? tt('ts.rev.asgn.workerPickNoAccess')
          : (workerError?.message||tt('ts.rev.notice.retryLater')),
        isAccessDeniedError(workerError)?'info':'warning'
      );
    }else{
      setPanelNotice('asgnEditNotice','','');
    }
    renderStaffingFastTrackNotice();
    await maybeAutoFocusStaffingReadyAssignment();
  }catch(error){
    if(isTransientError(error)) return;
    openDealAssignments=[];
    dealAsgnLoaded=true;
    if(sec)sec.style.display='none';
    setPanelNotice(
      'asgnEditNotice',
      isAccessDeniedError(error)?tt('ts.rev.asgn.noStaffingRights'):tt('ts.rev.asgn.dealLoadFailTitle'),
      isAccessDeniedError(error)
        ? tt('ts.rev.perm.staffingRoleShort')
        : (error?.message||tt('ts.rev.notice.retryLater')),
      isAccessDeniedError(error)?'info':'warning'
    );
    renderStaffingFastTrackNotice();
  }
}

/**
 * Welle 7 – Phase 3+4: Abgeschlossene Deals hart verfuegbar.
 *
 * Laedt agency-seitig alle Deal-Assignments, die vollstaendig besetzt,
 * planmaessig beendet oder storniert sind. Sichtflaeche only – keine
 * Staffing-Mutationen. Transient-Errors beenden still.
 */
async function loadClosedDealAsgn(){
  const sec=document.getElementById('closedDealAsgnSection');
  const grid=document.getElementById('closedDealAsgnGrid');
  const countEl=document.getElementById('closedDealAsgnCount');
  if(!sec||!grid){
    closedDealAsgnLoaded=true;
    return;
  }
  try{
    const d=await fetchJson(`${API}/closed-deal-assignments?limit=100`);
    const items=d.items||[];
    _closedDealAsgns=items;
    closedDealAsgnLoaded=true;
    if(!items.length){
      sec.style.display='none';
      grid.innerHTML='';
      if(countEl) countEl.textContent='';
      return;
    }
    sec.style.display='block';
    if(countEl) countEl.textContent='('+items.length+')';
    grid.innerHTML=items.map(renderClosedDealCard).join('');
  }catch(error){
    if(isTransientError(error)) return;
    _closedDealAsgns=[];
    closedDealAsgnLoaded=true;
    sec.style.display='none';
    grid.innerHTML='';
    if(countEl) countEl.textContent='';
    // 403 ist kein Fehler – lesender Zugriff kann fuer Rolle fehlen; still.
    if(isAccessDeniedError(error)) return;
    // Andere Fehler als Info in Panel-Notice, nicht blockierend.
    setPanelNotice(
      'asgnStateNotice',
      tt('ts.rev.asgn.closedLoadFail'),
      error?.message||tt('ts.rev.notice.retryLater'),
      'warning'
    );
  }
}

function renderClosedDealCard(a){
  const start=a.start_date?fmtD(a.start_date):'–';
  const end=a.planned_end_date?fmtD(a.planned_end_date):'offen';
  const requested=Number(a.requested_quantity||a.worker_count||1);
  const filled=Number(a.filled_quantity||0);
  const linkActive=Number(a.link_active_count||0);
  const linkTotal=Number(a.link_total_count||0);
  const statusMap={
    completed:{cls:'pill-off',label:'Beendet'},
    cancelled:{cls:'pill-off',label:'Storniert'},
    active:{cls:'pill-act',label:'Voll besetzt'},
    planned:{cls:'pill-act',label:'Voll besetzt'},
    extended:{cls:'pill-act',label:'Verlaengert'}
  };
  const statusCfg=statusMap[a.status]||{cls:'pill-off',label:a.status||'–'};
  const agreementRef=a.offer_agreement_ref?esc(a.offer_agreement_ref):'';
  const detailHref=a.offer_id?'/public/offer_detail.html?id='+encodeURIComponent(a.offer_id):'';
  return '<div class="asgn-card" style="border-left:3px solid var(--wk-text-muted)">'
    +'<div class="asgn-card-header">'
    +'<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">'
    +'<div class="asgn-card-title">'+esc(a.worker_description||a.request_title||tt('ts.rev.staffing.dealAssignmentFallback'))+'</div>'
    +(agreementRef?'<span class="pill pill-off" style="font-family:monospace">'+agreementRef+'</span>':'')
    +'</div>'
    +'<span class="pill '+statusCfg.cls+'">'+esc(statusCfg.label)+'</span>'
    +'</div>'
    +'<div class="asgn-card-meta">'
    +(a.client_org_name?'<span>&#128188; '+esc(a.client_org_name)+'</span>':'')
    +'<span>&#128197; '+esc(start)+' – '+esc(end)+'</span>'
    +'</div>'
    +'<div style="margin-top:8px;font-size:12px;color:var(--wk-text-muted);line-height:1.5">'
    +'<strong style="color:var(--wk-text)">Besetzung:</strong> '
    +esc(tt('ts.rev.asgn.slotsFilled', { filled: filled, requested: requested }))
    +(linkTotal?' · '+linkActive+' aktive Verknuepfung'+(linkActive===1?'':'en')+' / '+linkTotal+' gesamt':'')
    +'</div>'
    /* DIE ANSPRECHPERSON BEIM KUNDEN (Plan I, 10b).
       "Sichtbar an der Besetzung und in der Live-Belegschaft, nicht nur in der
       Deal-Akte" — bis hierher fuehrte von dieser Karte nur der Knopf "Dealakte
       oeffnen" weiter, also genau der Umweg, den die Vorgabe abstellt.
       Aus dem BEDARF, nicht aus dem Angebot: das Angebot traegt die
       Ansprechperson des Anbieters, und das ist die Flaeche des Anbieters.
       Die Nummer ist waehlbar. Fehlt sie, steht hier nichts — gemessen haben
       61 von 68 Einsaetzen gar keinen Vorgang hinter sich. */
    +((a.kunde_kontakt_name||a.kunde_kontakt_telefon)
      ?'<div style="margin-top:4px;font-size:12px;color:var(--wk-text-muted);line-height:1.5">'
        +'<strong style="color:var(--wk-text)">'+esc(tt('ts.rev.asgn.clientContact'))+'</strong> '
        +esc(a.kunde_kontakt_name||'')
        +(a.kunde_kontakt_telefon
          ?(a.kunde_kontakt_name?' · ':'')
            +'<a href="tel:'+esc(String(a.kunde_kontakt_telefon).replace(/[^+0-9]/g,''))+'" style="color:inherit">'
            +esc(a.kunde_kontakt_telefon)+'</a>'
          :'')
        +'</div>'
      :'')
    +(detailHref?'<div style="margin-top:10px"><a class="wk-btn wk-btn-ghost wk-btn-sm" href="'+detailHref+'">Dealakte oeffnen</a></div>':'')
    +'</div>';
}

function staffingBadgeLabel(status){
  const labels={open:tt('ts.rev.dealState.open'),sourcing:tt('ts.rev.dealState.sourcing'),partially_filled:tt('ts.rev.dealState.partiallyFilled'),filled:tt('ts.rev.dealState.filled'),closed:tt('ts.rev.dealState.closed'),cancelled:tt('ts.rev.dealState.cancelled')};
  return labels[status]||tt('ts.rev.dealState.open');
}
function getStaffingUiState(assignmentId){
  if(!staffingUiStateByAssignment[assignmentId]){
    staffingUiStateByAssignment[assignmentId]={hardOnly:true,quickAssignPending:false,quickAssignResult:null};
  }
  return staffingUiStateByAssignment[assignmentId];
}
function staffingReasonText(reasons){
  if(!Array.isArray(reasons)||!reasons.length)return tt('ts.rev.match.noReason');
  return reasons.map(r=>r.label||r.reason||'').filter(Boolean).slice(0,3).join(' · ');
}
function staffingFactorLabel(factor){
  const labels={
    availabilityMatch:tt('ts.rev.match.availability'),
    skillMatch:'Skills',
    distanceScore:'Distanz',
    qualificationScore:tt('ts.rev.match.qualification'),
    reliabilityScore:tt('ts.rev.match.reliability'),
    preferenceScore:'Kundenfit',
    experienceScore:'Erfahrung'
  };
  return labels[factor]||factor||'Faktor';
}
function staffingFactorText(factorScores){
  if(!Array.isArray(factorScores)||!factorScores.length)return '';
  return factorScores
    .filter(f=>f&&f.applicable!==false)
    .sort((a,b)=>(Number(b.points||0)-Number(a.points||0))||(Number(b.max||0)-Number(a.max||0)))
    .slice(0,3)
    .map(f=>`${staffingFactorLabel(f.factor)} ${Number(f.points||0)}/${Number(f.max||0)}`)
    .join(' · ');
}
/* Blocker und fehlende Anforderungen sind eine Vollstaendigkeits-Aussage, kein
 * Auszug: Wer "2 Blocker" liest, obwohl es 5 sind, disponiert auf einer
 * falschen Grundlage. Die Kappung auf 3 bleibt (sonst sprengt es die Kachel),
 * aber sie sagt jetzt, dass sie kappt. Zusammen mit `nenneListe` im Service
 * endet damit die doppelte stille Kuerzung 3-von-N und nochmals 3-von-N. */
function staffingCriteriaText(items){
  if(!Array.isArray(items)||!items.length)return '';
  const alle=items.map(item=>item.label||item.reason||'').filter(Boolean);
  if(!alle.length)return '';
  const rest=alle.length-3;
  return rest>0?`${alle.slice(0,3).join(' · ')} (+${rest} weitere)`:alle.join(' · ');
}
function staffingWorkerLabel(worker){
  return `${worker?.first_name||''} ${worker?.last_name||''}`.trim()||worker?.personnel_number||worker?.worker_user_id||'Worker';
}
function staffingQuickAssignStatusLabel(status){
  const labels={
    assigned:tt('ts.rev.quick.assigned'),
    skipped_not_safe:tt('ts.rev.quick.notSafe'),
    skipped_already_linked:tt('ts.rev.quick.skippedLinked'),
    skipped_assignment_filled:tt('ts.rev.quick.skippedFilled'),
    failed_conflict:tt('ts.rev.quick.conflict'),
    failed_worker_not_found:tt('ts.rev.quick.failedNotFound'),
    failed_worker_inactive:tt('ts.rev.quick.failedInactive'),
    failed_assignment_not_assignable:tt('ts.rev.quick.notAssignable'),
    failed_unknown:tt('ts.rev.quick.failed')
  };
  return labels[status]||status||tt('ts.rev.quick.resultFallback');
}
function staffingQuickAssignTone(status){
  if(status==='assigned')return 'pill-act';
  if(String(status||'').startsWith('skipped_'))return 'pill-warn';
  return 'pill-danger';
}
function staffingQuickAssignReason(entry){
  if(entry?.reason_label)return entry.reason_label;
  if(Array.isArray(entry?.quick_assign_blockers)&&entry.quick_assign_blockers.length){
    return staffingCriteriaText(entry.quick_assign_blockers);
  }
  if(entry?.status==='assigned'&&Number.isFinite(Number(entry.open_quantity_after))){
    return tt('ts.rev.quick.openAfter', { n: Number(entry.open_quantity_after) });
  }
  return '';
}
function renderStaffingQuickAssignResult(assignmentId){
  const result=getStaffingUiState(assignmentId).quickAssignResult;
  if(!result||!Array.isArray(result.results)||!result.results.length)return '';
  const summary=result.summary||{};
  const rows=result.results.map((entry)=>`
    <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:8px 10px;border:1px solid var(--tc-tone-neutral-border);border-radius:10px;background:var(--tc-surface-subtle)">
      <div style="min-width:0;flex:1">
        <div style="font-size:12px;font-weight:600">${esc(staffingWorkerLabel(entry))}</div>
        ${staffingQuickAssignReason(entry)?`<div style="font-size:11px;color:var(--wk-text-muted);margin-top:4px">${esc(staffingQuickAssignReason(entry))}</div>`:''}
      </div>
      <span class="pill ${staffingQuickAssignTone(entry.status)}">${esc(staffingQuickAssignStatusLabel(entry.status))}</span>
    </div>`).join('');
  return `<div style="border:1px solid var(--tc-tone-neutral-border);border-radius:12px;padding:10px;background:var(--tc-surface-emphasis);margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px;margin-bottom:8px">
      <strong>Schnellzuweisung Ergebnis</strong>
      <span style="color:var(--wk-text-muted)">${esc(tt('ts.rev.quick.summary', { assigned: Number(summary.assigned_count||0), skipped: Number(summary.skipped_count||0), open: Number(summary.open_quantity_after||0) }))}</span>
    </div>
    <div style="display:grid;gap:8px">
      ${rows}
    </div>
  </div>`;
}
function staffingSuggestionBadge(suggestion){
  if((suggestion&&suggestion.suggestion_status)==='blocked'){
    return '<span class="pill pill-danger">Blockiert</span>';
  }
  if(suggestion&&suggestion.hard_match){
    return '<span class="pill pill-act">'+esc(tt('ts.rev.match.hardHit'))+'</span>';
  }
  return '<span class="pill pill-accent">'+esc(tt('ts.rev.match.softFit'))+'</span>';
}
function staffingWaitlistStatusLabel(status){
  const labels={queued:tt('ts.rev.wl.queued'),invited:tt('ts.rev.wl.invited'),reserved:tt('ts.rev.wl.reserved'),assigned:tt('ts.rev.wl.assigned'),removed:tt('ts.rev.wl.removed')};
  return labels[status]||status||tt('ts.rev.wl.fallback');
}
function staffingParseJson(value){
  if(!value)return null;
  if(typeof value==='object')return value;
  try{return JSON.parse(value);}catch{return null;}
}
function staffingFmtDateTime(value){
  if(!value)return '';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return String(value);
  return d.toLocaleString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function staffingInviteStatusLabel(status){
  const labels={sent:tt('ts.rev.invite.stateSent'),viewed:tt('ts.rev.invite.stateViewed'),interested:tt('ts.rev.invite.stateInterested'),accepted:tt('ts.rev.invite.stateAccepted'),declined:tt('ts.rev.invite.stateDeclined'),expired:tt('ts.rev.invite.stateExpired'),cancelled:tt('ts.rev.invite.stateCancelled')};
  return labels[status]||status||tt('ts.rev.invite.stateSent');
}
function staffingDeliveryLabel(status){
  const labels={pending:'Pending',queued:'Queued',delivered:'Zugestellt',failed:'Fehlgeschlagen'};
  return labels[status]||status||'–';
}
function staffingInviteInteractionText(invite){
  if(invite.latest_message_type==='question'){
    return `Frage: ${invite.latest_body||'ohne Text'}`;
  }
  if(invite.latest_message_type==='reminder_request'){
    return `Reminder-Wunsch: ${invite.latest_body||'ohne Zusatztext'}`;
  }
  if(invite.latest_message_type==='reminder_sent'){
    return `Letzte Erinnerung gesendet ${invite.latest_message_at?`(${staffingFmtDateTime(invite.latest_message_at)})`:''}`.trim();
  }
  return '';
}
function staffingChoiceSetModeLabel(mode){
  const labels={
    preference_only:tt('ts.rev.choice.modePreference'),
    ranked_choice:tt('ts.rev.choice.modeRanked'),
    free_choice:tt('ts.rev.choice.modeFreeShort')
  };
  return labels[mode]||tt('ts.rev.choice.modeFallback');
}
function staffingChoiceSetStatusLabel(status){
  const labels={
    options_presented:tt('ts.rev.choiceState.open'),
    preference_submitted:tt('ts.rev.choiceState.preferenceSubmitted'),
    preference_ranked:tt('ts.rev.choiceState.ranked'),
    manual_override:tt('ts.rev.choiceState.manualOverride'),
    assigned:tt('ts.rev.choiceState.assigned'),
    declined:tt('ts.rev.choiceState.declined'),
    expired:tt('ts.rev.choiceState.expired'),
    cancelled:tt('ts.rev.choiceState.cancelled')
  };
  return labels[status]||status||tt('ts.rev.choiceState.open');
}
function staffingChoiceOptionStateLabel(option){
  if(option?.promoted_link_id||option?.live_state==='assigned')return 'Final zugewiesen';
  if(option?.reservation_status==='reserved')return 'Reserviert';
  if(option?.worker_response==='selected')return tt('ts.rev.option.selected');
  if(option?.worker_response==='preferred')return tt('ts.rev.option.preferred');
  if(Number.isFinite(Number(option?.worker_rank)))return tt('ts.rev.option.rank', { n: Number(option.worker_rank) });
  if(option?.worker_response==='acceptable')return tt('ts.rev.option.acceptable');
  if(option?.live_state==='declined'||option?.worker_response==='declined')return tt('ts.rev.option.declined');
  if(option?.live_state==='expired')return tt('ts.rev.option.expired');
  if(option?.live_state==='cancelled')return tt('ts.rev.option.cancelled');
  return tt('ts.rev.option.open');
}
function staffingChoiceOptionStateTone(option){
  if(option?.promoted_link_id||option?.live_state==='assigned'||option?.reservation_status==='reserved'||option?.worker_response==='selected')return 'pill-act';
  if(option?.worker_response==='preferred'||Number.isFinite(Number(option?.worker_rank)))return 'pill-accent';
  if(option?.live_state==='declined'||option?.worker_response==='declined'||option?.live_state==='expired'||option?.live_state==='cancelled')return 'pill-off';
  return 'pill-pnd';
}
function staffingChoiceOptionCanAssign(choiceSet,option){
  if(!choiceSet||!option)return false;
  if(choiceSet.is_terminal)return false;
  if(['assigned','declined','expired','cancelled'].includes(choiceSet.status))return false;
  if(option.promoted_link_id||option.live_state==='assigned')return false;
  return !['declined','expired','cancelled'].includes(option.live_state);
}
function staffingChoiceWorkerSummary(choiceSet){
  if(choiceSet?.summary?.dispatcher_summary)return choiceSet.summary.dispatcher_summary;
  if(choiceSet?.worker_note)return choiceSet.worker_note;
  return '';
}
function formatDateTimeLocalInput(value){
  const date=value?new Date(value):new Date(Date.now()+(72*60*60*1000));
  if(Number.isNaN(date.getTime()))return '';
  const pad=(part)=>String(part).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
async function ensureChoiceSetWorkersLoaded(){
  if(wrksLoaded&&Array.isArray(allWrks)&&allWrks.length)return allWrks;
  const payload=await fetchJson(`${API}/workers`);
  allWrks=payload.items||payload.workers||[];
  wrksLoaded=true;
  return allWrks;
}
function renderChoiceSetAssignments(selectedIds=[]){
  const host=document.getElementById('choiceSetAssignments');
  if(!host)return;
  const selected=new Set(Array.isArray(selectedIds)?selectedIds.filter(Boolean):[]);
  if(!openDealAssignments.length){
    host.innerHTML='<div class="hub-empty" style="padding:16px 10px"><p>'+esc(tt('ts.rev.deal.noOpen'))+'</p></div>';
    return;
  }
  host.innerHTML=openDealAssignments.map((assignment)=>{
    const requested=Number(assignment.requested_quantity||assignment.worker_count||1);
    const filled=Number(assignment.filled_quantity||0);
    const reserved=Number(assignment.reserved_quantity||0);
    const open=Number(assignment.open_quantity||Math.max(requested-filled-reserved,0));
    const meta=[
      assignment.client_org_name||'',
      assignment.start_date?assignment.start_date.substring(0,10):'',
      assignment.planned_end_date?assignment.planned_end_date.substring(0,10):'offen',
      `${open} offen`
    ].filter(Boolean).join(' · ');
    return `<label style="display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid var(--tc-tone-neutral-border);border-radius:10px;background:var(--tc-surface-subtle)">
-subtle)">
      <input type="checkbox" value="${assignment.assignment_id}" id="choiceSetAssignment-${assignment.assignment_id}" ${selected.has(assignment.assignment_id)?'checked':''} style="margin-top:3px">
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px">
          <strong>${esc(assignment.worker_description||assignment.request_title||tt('ts.rev.staffing.dealAssignmentFallback'))}</strong>
          <span class="pill pill-pnd">${staffingBadgeLabel(assignment.staffing_status||'open')}</span>
        </div>
        <div style="font-size:11px;color:var(--wk-text-muted);margin-top:4px">${esc(meta)}</div>
      </div>
    </label>`;
  }).join('');
}
async function openChoiceSetDrw(preselectedAssignmentIds=[]){
  if(!ensurePermission('workerEdit',tt('ts.rev.perm.choiceSet')))return;
  if(openDealAssignments.length<2){
    toast(tt('ts.rev.choice.needTwoOptions'),'error');
    return;
  }
  try{
    await ensureChoiceSetWorkersLoaded();
    const activeWorkers=allWrks.filter(worker=>worker.is_active!==false);
    if(!activeWorkers.length){
      toast(tt('ts.rev.choice.noActiveWorkers'),'error');
      return;
    }
    const workerSelect=document.getElementById('choiceSetWorker');
    if(workerSelect){
      workerSelect.innerHTML='<option value="">'+esc(tt('ts.rev.field.pleaseSelect'))+'</option>'+activeWorkers.map(worker=>`<option value="${worker.id||worker.user_id}">${esc(worker.first_name||'')} ${esc(worker.last_name||'')}${worker.personnel_number?' ('+esc(worker.personnel_number)+')':''}</option>`).join('');
    }
    document.getElementById('choiceSetMode').value='preference_only';
    document.getElementById('choiceSetDeadline').value=formatDateTimeLocalInput();
    document.getElementById('choiceSetTitle').value='';
    document.getElementById('choiceSetMessage').value='';
    const err=document.getElementById('choiceSetErr');
    if(err){err.style.display='none';err.textContent='';}
    renderChoiceSetAssignments(preselectedAssignmentIds);
    document.getElementById('choiceSetDrwOvl').classList.add('on');
    document.getElementById('choiceSetDrw').classList.add('on');
  }catch(error){
    toast(error?.message||tt('ts.rev.choice.prepareFailed'),'error');
  }
}
function closeChoiceSetDrw(){
  document.getElementById('choiceSetDrwOvl').classList.remove('on');
  document.getElementById('choiceSetDrw').classList.remove('on');
}
async function submitChoiceSet(){
  if(!ensurePermission('workerEdit',tt('ts.rev.perm.choiceSet')))return;
  const workerUserId=document.getElementById('choiceSetWorker')?.value||'';
  const choiceMode=document.getElementById('choiceSetMode')?.value||'preference_only';
  const title=document.getElementById('choiceSetTitle')?.value?.trim()||'';
  const message=document.getElementById('choiceSetMessage')?.value?.trim()||'';
  const deadlineRaw=document.getElementById('choiceSetDeadline')?.value||'';
  const assignmentIds=openDealAssignments
    .filter((assignment)=>document.getElementById(`choiceSetAssignment-${assignment.assignment_id}`)?.checked)
    .map((assignment)=>assignment.assignment_id);
  const err=document.getElementById('choiceSetErr');
  if(!workerUserId){
    if(err){err.textContent=tt('ts.rev.choice.selectWorker');err.style.display='block';}
    return;
  }
  if(assignmentIds.length<2){
    if(err){err.textContent=tt('ts.rev.choice.selectTwoOptions');err.style.display='block';}
    return;
  }
  const btn=document.getElementById('choiceSetBtn');
  if(err){err.style.display='none';err.textContent='';}
  if(btn){btn.disabled=true;btn.textContent=tt('ts.rev.btn.creating');}
  try{
    const csrf=await getCsrf();
    const body={
      worker_user_id:workerUserId,
      assignment_ids:assignmentIds,
      choice_mode:choiceMode,
      title:title||undefined,
      message:message||undefined,
      response_deadline_at:deadlineRaw?new Date(deadlineRaw).toISOString():undefined
    };
    const response=await fetch(`${API}/staffing-choice-sets`,{
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify(body)
    });
    const payload=await response.json();
    if(!response.ok){
      const messages={
        WORKER_NOT_FOUND:tt('ts.rev.choice.errWorkerNotFound'),
        WORKER_INACTIVE:tt('ts.rev.choice.errWorkerInactive'),
        INSUFFICIENT_OPTIONS:tt('ts.rev.choice.selectTwoOptions'),
        INVALID_CHOICE_MODE:tt('ts.rev.choice.errInvalidMode'),
        INVALID_RESPONSE_DEADLINE:tt('ts.rev.choice.errInvalidDeadline'),
        ASSIGNMENT_NOT_FOUND:tt('ts.rev.choice.errAssignmentNotFound'),
        ASSIGNMENT_NOT_ASSIGNABLE:tt('ts.rev.choice.errAssignmentNotAssignable'),
        ASSIGNMENT_FILLED:tt('ts.rev.choice.errAssignmentFilled'),
        NO_ELIGIBLE_WORKERS:tt('ts.rev.choice.errNoEligible'),
        CHOICE_SET_OPTION_ALREADY_ACTIVE:tt('ts.rev.choice.errOptionActive'),
        INVITE_CREATION_FAILED:tt('ts.rev.choice.errInviteFailed')
      };
      throw new Error(messages[payload.error]||payload.error||tt('ts.rev.choice.createFailed'));
    }
    toast(tt('ts.rev.choice.created', { n: assignmentIds.length }),'success');
    closeChoiceSetDrw();
    staffingDetailsByAssignment={};
    staffingSuggestionsByAssignment={};
    await loadDealAsgn();
  }catch(error){
    if(err){err.textContent=error?.message||tt('ts.rev.choice.createFailed');err.style.display='block';}
  }finally{
    if(btn){btn.disabled=false;btn.textContent=tt('ts.rev.choice.submitBtn');}
  }
}
async function assignStaffingChoiceOption(assignmentId,choiceSetId,choiceOptionId){
  if(!ensurePermission('workerEdit',tt('ts.rev.perm.choiceFinal')))return;
  const detail=staffingDetailsByAssignment[assignmentId];
  const choiceSet=(detail?.choice_sets||[]).find((entry)=>entry.id===choiceSetId);
  const option=(choiceSet?.options||[]).find((entry)=>entry.id===choiceOptionId);
  if(!choiceSet||!option){
    toast(tt('ts.rev.choice.staleReload'),'error');
    return;
  }
  const workerName=choiceSet.worker?`${choiceSet.worker.first_name||''} ${choiceSet.worker.last_name||''}`.trim():'Worker';
  const optionLabel=option.request_context?.title||option.request_context?.role||'Einsatzoption';
  const isOverride=!!choiceSet.summary?.primary_option_id&&choiceSet.summary.primary_option_id!==choiceOptionId;
  const confirmText=isOverride
    ? `${tt('ts.rev.choice.confirmOther', { worker: workerName||tt('ts.rev.choice.workerFallback') })}\n\n${optionLabel}`
    : `${tt('ts.rev.choice.confirmFinal')}\n\n${optionLabel}`;
  if(!confirm(confirmText))return;
  let notes='';
  if(isOverride){
    const promptValue=window.prompt(tt('ts.rev.choice.overridePrompt'),choiceSet.manual_override_note||'');
    if(promptValue===null)return;
    notes=String(promptValue||'').trim();
  }
  try{
    const csrf=await getCsrf();
    const response=await fetch(`${API}/staffing-choice-sets/${choiceSetId}/assign`,{
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({
        choice_option_id:choiceOptionId,
        client_name:option.request_context?.client_org_name||undefined,
        notes:notes||undefined
      })
    });
    const payload=await response.json();
    if(!response.ok){
      const messages={
        CHOICE_SET_NOT_FOUND:tt('ts.rev.choice.errSetNotFound'),
        CHOICE_OPTION_NOT_FOUND:tt('ts.rev.choice.errOptionNotFound'),
        CHOICE_SET_ALREADY_ASSIGNED:tt('ts.rev.choice.errAlreadyAssigned'),
        CHOICE_SET_ALREADY_DECLINED:tt('ts.rev.choice.errAlreadyDeclined'),
        CHOICE_SET_EXPIRED:tt('ts.rev.choice.errExpired'),
        CHOICE_SET_CANCELLED:tt('ts.rev.choice.errCancelled'),
        RESERVATION_NOT_FOUND:tt('ts.rev.choice.errReservationNotFound'),
        ASSIGNMENT_NOT_FOUND:tt('ts.rev.choice.errAsgNotFound'),
        ASSIGNMENT_NOT_ASSIGNABLE:tt('ts.rev.choice.errAsgNotAssignable'),
        RESERVATION_NOT_ACTIVE:tt('ts.rev.choice.errReservationInactive'),
        RESERVATION_EXPIRED:tt('ts.rev.choice.errReservationExpired'),
        ASSIGNMENT_FILLED:tt('ts.rev.choice.errAsgFilled'),
        ALREADY_ASSIGNED:tt('ts.rev.choice.errWorkerAssigned'),
        WORKER_ALREADY_LINKED:tt('ts.rev.choice.errWorkerLinked'),
        WORKER_NOT_FOUND:tt('ts.rev.choice.errWorkerNotFound2'),
        WORKER_INACTIVE:tt('ts.rev.choice.errWorkerInactive2'),
        SCHEDULE_CONFLICT:tt('ts.rev.choice.errScheduleConflict')
      };
      throw new Error(messages[payload.error]||payload.error||tt('ts.rev.choice.finalFailed'));
    }
    toast('Auswahlphase final zugewiesen','success');
    staffingDetailsByAssignment={};
    staffingSuggestionsByAssignment={};
    await loadDealAsgn();
    await loadAsgn();
  }catch(error){
    toast(error?.message||tt('ts.rev.choice.finalFailed'),'error');
  }
}
async function loadStaffingDetail(assignmentId){
  const d=await fetchJson(`${API}/staffing-assignments/${assignmentId}`);
  staffingDetailsByAssignment[assignmentId]=d;
  return d;
}
async function loadStaffingSuggestions(assignmentId,opts={}){
  const state=getStaffingUiState(assignmentId);
  const q=new URLSearchParams();
  q.set('limit',String(opts.limit||20));
  if(opts.only_available!==false)q.set('only_available','true');
  const hardOnly=opts.hard_only!==undefined?!!opts.hard_only:!!state.hardOnly;
  state.hardOnly=hardOnly;
  q.set('hard_only',hardOnly?'true':'false');
  q.set('include_blocked',opts.include_blocked===false?'false':'true');
  const d=await fetchJson(`${API}/staffing-assignments/${assignmentId}/suggestions?${q.toString()}`);
  staffingSuggestionsByAssignment[assignmentId]=d;
  return d;
}
function renderStaffingPanel(assignmentId){
  const panel=document.getElementById('staffingPanel-'+assignmentId);
  const detail=staffingDetailsByAssignment[assignmentId];
  const suggestionBundle=staffingSuggestionsByAssignment[assignmentId];
  if(!panel||!detail)return;
  const state=getStaffingUiState(assignmentId);
  const asg=detail.assignment||{};
  const campaigns=Array.isArray(detail.campaigns)?detail.campaigns:[];
  const autoBackfillCampaign=campaigns.find(c=>c.auto_backfill_enabled);
  const suggested=(suggestionBundle&&suggestionBundle.suggestions)||[];
  const suggestionSummary=(suggestionBundle&&suggestionBundle.summary)||{};
  const currentWorkers=(detail.current_workers||[]).filter(w=>w.is_active!==false);
  const reservations=(detail.reservations||[]).filter(r=>r.status==='reserved');
  const invites=(detail.recent_invites||[]).slice(0,8);
  const waitlist=(detail.waitlist||[]).slice(0,8);
  const waitlistSummary=detail.waitlist_summary||suggestionBundle?.waitlist_summary||{};
  const choiceSets=(detail.choice_sets||[]).slice(0,8);
  const defaultSelected=Math.min(Math.max(Number(asg.open_quantity||0)*3,1),10);
  const selectableSuggestions=suggested.filter(s=>s&&s.can_invite);
  const quickAssignableSuggestions=suggested.filter(s=>s&&s.quick_assign_eligible);
  const preferredSuggestions=selectableSuggestions.filter(s=>state.hardOnly?s.hard_match:true);
  const defaultSelectionSource=quickAssignableSuggestions.length?quickAssignableSuggestions:(preferredSuggestions.length?preferredSuggestions:selectableSuggestions);
  const defaultSelectedIds=new Set(defaultSelectionSource.slice(0,defaultSelected).map(s=>s.worker_user_id));
  const quickAssignResultHtml=renderStaffingQuickAssignResult(assignmentId);
  const quickAssignActionLabel=state.quickAssignPending?tt('ts.rev.staffing.quickAssignRunning'):tt('ts.rev.staffing.quickAssignCta');
  const suggestionHtml=suggested.length?suggested.map((s)=>{
    const factors=staffingFactorText(s.factor_scores);
    const missing=staffingCriteriaText(s.missing_requirements);
    const hardFails=staffingCriteriaText(s.hard_failures);
    const quickAssignBlockers=staffingCriteriaText(s.quick_assign_blockers);
    const secondaryMeta=[
      s.city||'',
      s.personnel_number||'',
      s.already_contacted?'bereits kontaktiert':'',
      s.has_open_invite?'offene Anfrage':''
    ].filter(Boolean).join(' · ');
    return `<label style="display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid var(--tc-tone-neutral-border);border-radius:10px;background:var(--tc-surface-subtle)">
      <input type="checkbox" id="staffingPick-${assignmentId}-${s.worker_user_id}" ${defaultSelectedIds.has(s.worker_user_id)?'checked':''} ${s.can_invite?'':'disabled'} style="margin-top:2px">
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px">
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <strong>${esc(staffingWorkerLabel(s))}</strong>
            ${staffingSuggestionBadge(s)}
            ${s.quick_assign_eligible?'<span class="pill pill-act">Direkt sicher</span>':''}
          </div>
          <span>Score ${Number(s.total_score||s.score||0)}</span>
        </div>
        <div style="font-size:12px;color:var(--wk-text-muted);margin-top:4px">${esc(factors||staffingReasonText(s.match_reasons))}</div>
        ${missing?`<div style="font-size:11px;color:var(--tc-tone-warning-text);margin-top:4px"><strong>Fehlt:</strong> ${esc(missing)}</div>`:''}
        ${hardFails?`<div style="font-size:11px;color:var(--tc-tone-danger-text);margin-top:4px"><strong>Hard-Fail:</strong> ${esc(hardFails)}</div>`:''}
        <div style="font-size:11px;color:${s.quick_assign_eligible?'var(--tc-tone-success-text)':'var(--tc-tone-warning-text)'};margin-top:4px"><strong>${esc(tt('ts.rev.staffing.quickAssignLabel'))}</strong> ${esc(s.quick_assign_eligible?tt('ts.rev.staffing.quickAssignSafe'):(quickAssignBlockers||tt('ts.rev.staffing.quickAssignBlocked')))}</div>
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
          <div style="font-size:11px;color:var(--wk-text-muted)">${esc(secondaryMeta||tt('ts.rev.staffing.noExtraSignals'))}</div>
          ${s.quick_assign_eligible?`<button class="wk-btn wk-btn-success wk-btn-sm" ${state.quickAssignPending?'disabled':''} onclick="quickAssignSingleStaffingWorker('${assignmentId}','${s.worker_user_id}')">${esc(state.quickAssignPending?tt('ts.rev.staffing.running'):tt('ts.rev.staffing.assignDirect'))}</button>`:''}
        </div>
      </div>
    </label>`;
  }).join(''):`<div style="font-size:12px;color:var(--wk-text-muted)">${esc(tt('ts.rev.staffing.noSuggestions'))}</div>`;
  const waitlistHtml=waitlist.length?waitlist.map((entry)=>`
    <div style="padding:8px 10px;border:1px solid var(--tc-tone-neutral-border);border-radius:10px;background:var(--tc-surface-subtle)">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px">
        <strong>${esc(`${entry.first_name||''} ${entry.last_name||''}`.trim()||entry.worker_user_id||'Worker')}</strong>
        <span>${esc(staffingWaitlistStatusLabel(entry.status))}${entry.queue_rank?` · #${Number(entry.queue_rank)}`:''}</span>
      </div>
      <div style="font-size:11px;color:var(--wk-text-muted);margin-top:4px">${esc(staffingReasonText(entry.match_reasons)||entry.removal_reason||'')}</div>
    </div>`).join(''):`<div style="font-size:12px;color:var(--wk-text-muted)">${esc(tt('ts.rev.staffing.noWaitlist'))}</div>`;
  const inviteActivityHtml=invites.length?invites.map((invite)=>{
    const snapshot=staffingParseJson(invite.request_snapshot)||{};
    const interactionText=staffingInviteInteractionText(invite);
    const deadline=snapshot.response_deadline_label||staffingFmtDateTime(invite.expires_at);
    const reminderText=invite.remind_after
      ? `Reminder geplant: ${staffingFmtDateTime(invite.remind_after)}`
      : (Number(invite.reminder_request_count||0)>0 ? 'Reminder-Wunsch vorhanden' : '');
    const deliveryText=`Delivery: ${staffingDeliveryLabel(invite.delivery_status)}${invite.delivery_last_error?` · ${invite.delivery_last_error}`:''}`;
    return `<div style="padding:10px;border:1px solid var(--tc-tone-neutral-border);border-radius:10px;background:var(--tc-surface-subtle)">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px">
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <strong>${esc(`${invite.first_name||''} ${invite.last_name||''}`.trim()||invite.worker_user_id||'Worker')}</strong>
          <span class="pill ${invite.status==='accepted'?'pill-act':'pill-pnd'}">${esc(staffingInviteStatusLabel(invite.status))}</span>
        </div>
        <span style="color:var(--wk-text-muted)">${esc(deliveryText)}</span>
      </div>
      <div style="font-size:11px;color:var(--wk-text-muted);margin-top:4px">
        ${esc(snapshot.title||asg.worker_description||'Einsatzanfrage')}${deadline?` · Frist ${esc(deadline)}`:''}
      </div>
      ${interactionText?`<div style="font-size:11px;color:var(--tc-tone-brand-text);margin-top:6px">${esc(interactionText)}</div>`:''}
      ${reminderText?`<div style="font-size:11px;color:var(--tc-tone-warning-text);margin-top:4px">${esc(reminderText)}</div>`:''}
    </div>`;
  }).join(''):`<div style="font-size:12px;color:var(--wk-text-muted)">${esc(tt('ts.rev.staffing.noRequests'))}</div>`;
  const choiceSetsHtml=choiceSets.length?choiceSets.map((choiceSet)=>{
    const workerName=choiceSet.worker?`${choiceSet.worker.first_name||''} ${choiceSet.worker.last_name||''}`.trim():'';
    const summary=staffingChoiceWorkerSummary(choiceSet);
    const optionHtml=(choiceSet.options||[]).map((option)=>{
      const ctx=option.request_context||{};
      const meta=[
        ctx.client_org_name||'',
        ctx.location_label||ctx.location_city||'',
        ctx.duration_label||'',
        ctx.pay_label||''
      ].filter(Boolean).join(' · ');
      const canAssign=staffingChoiceOptionCanAssign(choiceSet,option);
      const isPrimary=choiceSet.summary?.primary_option_id===option.id;
      const isCurrent=option.assignment_id===assignmentId;
      return `<div style="padding:10px;border:1px solid var(--tc-tone-neutral-border);border-radius:10px;background:var(--tc-surface-subtle)">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px">
          <div style="min-width:0;flex:1">
            <div style="font-weight:600">${esc(ctx.title||ctx.role||'Einsatzoption')}</div>
            <div style="font-size:11px;color:var(--wk-text-muted);margin-top:4px">${esc(meta||tt('ts.rev.staffing.detailsFollow'))}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
            ${isCurrent?'<span class="pill pill-pnd">Diese Stelle</span>':''}
            ${isPrimary?`<span class="pill pill-accent">${esc(tt('ts.rev.staffing.workerFavourite'))}</span>`:''}
            <span class="pill ${staffingChoiceOptionStateTone(option)}">${esc(staffingChoiceOptionStateLabel(option))}</span>
          </div>
        </div>
        ${(option.worker_note||option.dispatcher_note)?`<div style="font-size:11px;color:var(--wk-text-muted);margin-top:6px">${esc(option.worker_note||option.dispatcher_note)}</div>`:''}
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
          <div style="font-size:11px;color:var(--wk-text-muted)">
            ${option.worker_responded_at?esc(tt('ts.rev.staffing.workerAction', { at: staffingFmtDateTime(option.worker_responded_at) })):(option.dispatcher_updated_at?esc(tt('ts.rev.staffing.dispatcherAction', { at: staffingFmtDateTime(option.dispatcher_updated_at) })):esc(tt('ts.rev.staffing.noResponse')))}
          </div>
          ${canAssign?`<button class="wk-btn wk-btn-success wk-btn-sm" onclick="assignStaffingChoiceOption('${assignmentId}','${choiceSet.id}','${option.id}')">Final zuweisen</button>`:''}
        </div>
      </div>`;
    }).join('');
    return `<div style="padding:10px;border:1px solid var(--tc-tone-neutral-border);border-radius:12px;background:var(--tc-surface-muted)">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px">
        <div>
          <div style="font-weight:700">${esc(choiceSet.title||tt('ts.rev.staffing.choiceSetFallback'))}</div>
          <div style="font-size:11px;color:var(--wk-text-muted);margin-top:4px">${esc(workerName||choiceSet.worker?.email||choiceSet.worker_user_id||'Worker')} · ${esc(staffingChoiceSetModeLabel(choiceSet.choice_mode))}${choiceSet.response_deadline_at?` · ${esc(tt('ts.rev.staffing.deadline'))} ${esc(staffingFmtDateTime(choiceSet.response_deadline_at))}`:''}</div>
        </div>
        <span class="pill ${choiceSet.status==='assigned'?'pill-act':(choiceSet.status==='declined'||choiceSet.status==='expired'||choiceSet.status==='cancelled'?'pill-off':'pill-pnd')}">${esc(staffingChoiceSetStatusLabel(choiceSet.status))}</span>
      </div>
      ${summary?`<div style="font-size:11px;color:var(--tc-tone-brand-text);margin-top:6px">${esc(summary)}</div>`:''}
      ${choiceSet.manual_override_note?`<div style="font-size:11px;color:var(--tc-tone-warning-text);margin-top:6px"><strong>Override:</strong> ${esc(choiceSet.manual_override_note)}</div>`:''}
      <div style="display:grid;gap:8px;margin-top:10px">${optionHtml}</div>
    </div>`;
  }).join(''):`<div style="font-size:12px;color:var(--wk-text-muted)">${esc(tt('ts.rev.staffing.noChoiceSets'))}</div>`;
  panel.innerHTML=`
    <div style="padding:12px;border:1px solid var(--tc-tone-neutral-border);border-radius:12px;background:var(--tc-surface-emphasis)">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <div style="font-size:12px;line-height:1.5">
          <strong>Live-Stand:</strong> ${Number(asg.filled_quantity||0)} besetzt · ${Number(asg.reserved_quantity||0)} reserviert · ${Number(asg.open_quantity||0)} offen
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="wk-btn wk-btn-outline wk-btn-sm" onclick="refreshStaffingPanel('${assignmentId}')">Aktualisieren</button>
          <button class="wk-btn wk-btn-success wk-btn-sm" ${state.quickAssignPending||Number(asg.open_quantity||0)<=0?'disabled':''} onclick="quickAssignSelectedStaffingWorkers('${assignmentId}')">${quickAssignActionLabel}</button>
          <button class="wk-btn wk-btn-primary wk-btn-sm" onclick="sendSelectedStaffingInvites('${assignmentId}')">Auswahl anfragen</button>
          <button class="wk-btn wk-btn-ghost wk-btn-sm" onclick="queueSelectedStaffingWorkers('${assignmentId}')">${esc(tt('ts.rev.staffing.waitlistSelection'))}</button>
          <button class="wk-btn wk-btn-ghost wk-btn-sm" onclick="sendNextWaitlistWave('${assignmentId}')">${esc(tt('ts.rev.staffing.nextWave'))}</button>
        </div>
      </div>
      <div style="display:grid;gap:8px;margin-bottom:10px">
        ${currentWorkers.length?`<div style="font-size:12px;color:var(--wk-text-muted)"><strong style="color:var(--wk-text)">${esc(tt('ts.rev.staffing.activeWorkers'))}</strong> ${currentWorkers.map(w=>esc(`${w.first_name||''} ${w.last_name||''}`.trim()||w.worker_email||'Worker')).join(', ')}</div>`:''}
        ${reservations.length?`<div style="font-size:12px;color:var(--wk-text-muted)"><strong style="color:var(--wk-text)">Reserviert:</strong> ${reservations.map(r=>esc(`${r.first_name||''} ${r.last_name||''}`.trim())).join(', ')}</div>`:''}
        ${autoBackfillCampaign?`<div style="font-size:12px;color:var(--tc-tone-brand-text)"><strong style="color:var(--tc-tone-brand-strong-text)">${esc(tt('ts.rev.staffing.autoBackfill'))}</strong> ${esc(tt('ts.rev.staffing.autoBackfillText'))}</div>`:''}
        <div style="font-size:11px;color:var(--wk-text-muted)">${esc(tt('ts.rev.staffing.guardrailHint'))}</div>
      </div>
      ${quickAssignResultHtml}
      <div style="border-top:1px solid var(--tc-tone-neutral-border);padding-top:10px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:12px">
          <strong>${esc(tt('ts.rev.staffing.choiceHeading'))}</strong>
          <span style="color:var(--wk-text-muted)">${choiceSets.length} Auswahlgruppe${choiceSets.length===1?'':'n'} sichtbar</span>
        </div>
        <div style="display:grid;gap:8px">
          ${choiceSetsHtml}
        </div>
      </div>
      <div style="border-top:1px solid var(--tc-tone-neutral-border);padding-top:10px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:12px">
          <strong>${esc(tt('ts.rev.staffing.requestHeading'))}</strong>
          <span style="color:var(--wk-text-muted)">${esc(tt('ts.rev.staffing.openQuestions', { q: invites.reduce((sum,i)=>sum+Number(i.question_count||0),0), r: invites.reduce((sum,i)=>sum+Number(i.reminder_request_count||0),0) }))}</span>
        </div>
        <div style="display:grid;gap:8px">
          ${inviteActivityHtml}
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="wk-btn ${state.hardOnly?'wk-btn-primary':'wk-btn-ghost'} wk-btn-sm" onclick="setStaffingSuggestionMode('${assignmentId}',true)">Nur harte Treffer</button>
          <button class="wk-btn ${state.hardOnly?'wk-btn-ghost':'wk-btn-primary'} wk-btn-sm" onclick="setStaffingSuggestionMode('${assignmentId}',false)">Auch weiche Treffer</button>
        </div>
        <div style="font-size:12px;color:var(--wk-text-muted)">
          ${Number(suggestionSummary.hard_match_count||0)} harte Treffer · ${Number(suggestionSummary.soft_match_count||0)} weiche Fits · ${Number(suggestionSummary.blocked_count||0)} blockiert · Waitlist ${Number(waitlistSummary.queued_count||0)}
        </div>
      </div>
      <div style="display:grid;gap:8px;margin-bottom:12px">
        ${suggestionHtml}
      </div>
      <div style="border-top:1px solid var(--tc-tone-neutral-border);padding-top:10px">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:12px">
          <strong>${esc(tt('ts.rev.staffing.waitlistHeading'))}</strong>
          <span style="color:var(--wk-text-muted)">Queued ${Number(waitlistSummary.queued_count||0)} · Angefragt ${Number(waitlistSummary.invited_count||0)} · Reserviert ${Number(waitlistSummary.reserved_count||0)}</span>
        </div>
        <div style="display:grid;gap:8px">
          ${waitlistHtml}
        </div>
      </div>
    </div>`;
}
async function toggleStaffingPanel(assignmentId){
  const panel=document.getElementById('staffingPanel-'+assignmentId);
  if(!panel)return;
  if(panel.style.display==='none'){
    await openStaffingPanel(assignmentId);
    return;
  }
  panel.style.display='none';
}
async function refreshStaffingPanel(assignmentId){
  if(!ensurePermission('workerEdit',tt('ts.rev.perm.staffingRefresh')))return;
  try{
    const state=getStaffingUiState(assignmentId);
    await Promise.all([loadStaffingDetail(assignmentId),loadStaffingSuggestions(assignmentId,{limit:20,only_available:true,hard_only:state.hardOnly,include_blocked:true})]);
    renderStaffingPanel(assignmentId);
  }catch(e){toast(e.message||'Aktualisierung fehlgeschlagen','error');}
}
function getSelectedStaffingWorkerIds(assignmentId){
  const suggestionBundle=staffingSuggestionsByAssignment[assignmentId];
  const suggested=(suggestionBundle&&suggestionBundle.suggestions)||[];
  return suggested.filter(s=>{
    const el=document.getElementById(`staffingPick-${assignmentId}-${s.worker_user_id}`);
    return !!el&&el.checked&&!el.disabled;
  }).map(s=>s.worker_user_id);
}
async function runStaffingQuickAssign(assignmentId,workerIds){
  if(!ensurePermission('workerEdit',tt('ts.rev.perm.quickAssign')))return;
  const uniqueWorkerIds=[...new Set((Array.isArray(workerIds)?workerIds:[]).filter(Boolean))];
  if(!uniqueWorkerIds.length){
    toast(tt('ts.rev.staffing.selectWorkerFirst'),'error');
    return;
  }
  const state=getStaffingUiState(assignmentId);
  const detail=staffingDetailsByAssignment[assignmentId]||await loadStaffingDetail(assignmentId);
  state.quickAssignPending=true;
  renderStaffingPanel(assignmentId);
  try{
    const csrf=await getCsrf();
    const response=await fetch(`${API}/staffing-assignments/${assignmentId}/quick-assign`,{
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({
        worker_user_ids:uniqueWorkerIds,
        client_name:detail?.assignment?.client_org_name||detail?.assignment?.client_name||undefined
      })
    });
    const payload=await response.json();
    if(!response.ok){
      const messages={
        ASSIGNMENT_NOT_FOUND:tt('ts.rev.choice.errAsgNotFound'),
        ASSIGNMENT_NOT_ASSIGNABLE:tt('ts.rev.choice.errAsgNotAssignable2'),
        ASSIGNMENT_FILLED:tt('ts.rev.choice.errAsgFilled'),
        NO_WORKERS_SELECTED:tt('ts.rev.choice.errNoWorkersSelected')
      };
      throw new Error(messages[payload.error]||payload.error||'Direktzuweisung fehlgeschlagen');
    }
    state.quickAssignResult=payload;
    toast(tt('ts.rev.staffing.assignedCount', { n: Number(payload.summary?.assigned_count||0) }),'success');
    invalidateStaffingDataCache(assignmentId);
    await loadDealAsgn();
    await loadAsgn();
    await refreshWorkerAssignmentDrawerAfterMutation(assignmentId);
    if(document.getElementById(`staffingPanel-${assignmentId}`)){
      await openStaffingPanel(assignmentId,{forceReload:true,scrollIntoView:true});
    }else{
      renderStaffingFastTrackNotice();
    }
  }catch(error){
    toast(error?.message||'Direktzuweisung fehlgeschlagen','error');
  }finally{
    state.quickAssignPending=false;
    if(document.getElementById(`staffingPanel-${assignmentId}`)?.style.display!=='none'){
      renderStaffingPanel(assignmentId);
    }
  }
}
async function quickAssignSelectedStaffingWorkers(assignmentId){
  return runStaffingQuickAssign(assignmentId,getSelectedStaffingWorkerIds(assignmentId));
}
async function quickAssignSingleStaffingWorker(assignmentId,workerUserId){
  return runStaffingQuickAssign(assignmentId,[workerUserId]);
}
async function sendSelectedStaffingInvites(assignmentId){
  if(!ensurePermission('workerEdit',tt('ts.rev.perm.staffingRequest')))return;
  const workerIds=getSelectedStaffingWorkerIds(assignmentId);
  if(!workerIds.length){toast(tt('ts.rev.staffing.selectWorkerFirst'),'error');return;}
  try{
    const csrf=await getCsrf();
    const r=await fetch(`${API}/staffing-assignments/${assignmentId}/campaigns`,{
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({worker_user_ids:workerIds,promotion_mode:'auto_finalize',auto_backfill_enabled:false})
    });
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Bulk-Anfrage fehlgeschlagen');
    toast(tt('ts.rev.staffing.requestedCount', { n: workerIds.length }),'success');
    await refreshStaffingPanel(assignmentId);
  }catch(e){toast(e.message||'Bulk-Anfrage fehlgeschlagen','error');}
}
async function queueSelectedStaffingWorkers(assignmentId){
  if(!ensurePermission('workerEdit',tt('ts.rev.perm.waitlist')))return;
  const workerIds=getSelectedStaffingWorkerIds(assignmentId);
  if(!workerIds.length){toast(tt('ts.rev.staffing.selectWorkerFirst'),'error');return;}
  try{
    const csrf=await getCsrf();
    const r=await fetch(`${API}/staffing-assignments/${assignmentId}/waitlist`,{
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({worker_user_ids:workerIds})
    });
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||tt('ts.rev.staffing.waitlistFailed'));
    toast(tt('ts.rev.staffing.waitlistedCount', { n: workerIds.length }),'success');
    await refreshStaffingPanel(assignmentId);
  }catch(e){toast(e.message||tt('ts.rev.staffing.waitlistFailed'),'error');}
}
async function sendNextWaitlistWave(assignmentId){
  if(!ensurePermission('workerEdit',tt('ts.rev.perm.waitlistWave')))return;
  try{
    const detail=staffingDetailsByAssignment[assignmentId]||await loadStaffingDetail(assignmentId);
    const openQty=Number((detail.assignment||{}).open_quantity||1);
    const csrf=await getCsrf();
    const r=await fetch(`${API}/staffing-assignments/${assignmentId}/waitlist/next-wave`,{
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({limit:Math.min(Math.max(openQty*3,1),20),auto_backfill_enabled:!!(detail.campaigns||[]).find(c=>c.auto_backfill_enabled)})
    });
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||tt('ts.rev.staffing.waveFailed'));
    toast(`${Number((d.invites||[]).length||0)} Waitlist-Kandidaten angefragt`,'success');
    await refreshStaffingPanel(assignmentId);
  }catch(e){toast(e.message||tt('ts.rev.staffing.waveFailed'),'error');}
}
async function inviteTopWorkers(assignmentId,count){
  if(!ensurePermission('workerEdit',tt('ts.rev.perm.staffingRequest')))return;
  try{
    const state=getStaffingUiState(assignmentId);
    const suggestionBundle=await loadStaffingSuggestions(assignmentId,{limit:Math.max(count||20,20),only_available:true,hard_only:state.hardOnly,include_blocked:false});
    const detail=staffingDetailsByAssignment[assignmentId]||await loadStaffingDetail(assignmentId);
    const suggested=(suggestionBundle.suggestions||[]).filter(s=>s.can_invite&&(state.hardOnly?s.hard_match:true));
    const targetCount=Math.min(count||20,suggested.length);
    const workerIds=suggested.slice(0,targetCount).map(s=>s.worker_user_id);
    if(!workerIds.length){toast(tt('ts.rev.staffing.noTopCandidates'),'error');return;}
    const csrf=await getCsrf();
    const r=await fetch(`${API}/staffing-assignments/${assignmentId}/campaigns`,{
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({
        worker_user_ids:workerIds,
        promotion_mode:'auto_finalize',
        auto_backfill_enabled:true,
        message:tt('ts.rev.staffing.bulkMessage', { open: Number((detail.assignment||{}).open_quantity||0) })
      })
    });
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||tt('ts.rev.staffing.topFailed'));
    toast(`${workerIds.length} Top-Kandidaten angefragt`,'success');
    await refreshStaffingPanel(assignmentId);
  }catch(e){toast(e.message||tt('ts.rev.staffing.topFailed'),'error');}
}
async function assignDealWorkerRequest(assignmentId,workerUserId,{clientName=null,confirmMessage='',successMessage=tt('ts.rev.deal.assigned')}={}){
  if(confirmMessage&&!confirm(confirmMessage))return false;
  try{
    const csrf=await getCsrf();
    const body={assignment_id:assignmentId,worker_user_id:workerUserId};
    if(clientName)body.client_name=clientName;
    const r=await fetch(`${API}/assign-deal-to-worker`,{method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify(body)});
    const d=await r.json();
    if(!r.ok){
      const messages={
        ASSIGNMENT_NOT_FOUND:tt('ts.rev.deal.errNotFound'),
        ASSIGNMENT_NOT_ASSIGNABLE:tt('ts.rev.deal.errNotAssignable'),
        ASSIGNMENT_FILLED:tt('ts.rev.deal.errFilled'),
        ALREADY_ASSIGNED:tt('ts.rev.deal.errAlreadyAssigned'),
        WORKER_ALREADY_LINKED:tt('ts.rev.deal.errWorkerLinked'),
        WORKER_NOT_FOUND:tt('ts.rev.deal.errWorkerNotFound'),
        WORKER_INACTIVE:tt('ts.rev.deal.errWorkerInactive'),
        SCHEDULE_CONFLICT:tt('ts.rev.deal.errScheduleConflict')
      };
      throw new Error(messages[d.error]||d.error||tt('ts.rev.msg.error'));
    }
    toast(successMessage,'success');
    invalidateStaffingDataCache(assignmentId);
    await loadDealAsgn();
    await loadAsgn();
    await refreshWorkerAssignmentDrawerAfterMutation(assignmentId);
    return true;
  }catch(error){
    toast(error?.message||tt('ts.rev.msg.assignError'),'error');
    return false;
  }
}
async function assignDealWorker(assignmentId){
  if(!ensurePermission('workerEdit',tt('ts.rev.perm.dealAssign')))return;
  const sel=document.getElementById('dealWkr-'+assignmentId);
  const wkrId=sel?sel.value:'';
  if(!wkrId){toast(tt('ts.rev.deal.selectWorker'),'error');return;}
  await assignDealWorkerRequest(assignmentId,wkrId,{
    clientName:getAssignmentClientName(assignmentId),
    successMessage:tt('ts.rev.deal.assigned')
  });
}
window.toggleStaffingPanel=toggleStaffingPanel;
window.refreshStaffingPanel=refreshStaffingPanel;
window.setStaffingSuggestionMode=setStaffingSuggestionMode;
window.quickAssignSelectedStaffingWorkers=quickAssignSelectedStaffingWorkers;
window.quickAssignSingleStaffingWorker=quickAssignSingleStaffingWorker;
window.sendSelectedStaffingInvites=sendSelectedStaffingInvites;
window.queueSelectedStaffingWorkers=queueSelectedStaffingWorkers;
window.sendNextWaitlistWave=sendNextWaitlistWave;
window.inviteTopWorkers=inviteTopWorkers;
window.openChoiceSetDrw=openChoiceSetDrw;
window.closeChoiceSetDrw=closeChoiceSetDrw;
window.submitChoiceSet=submitChoiceSet;
window.assignStaffingChoiceOption=assignStaffingChoiceOption;
window.assignDealWorker=assignDealWorker;

/* ASSIGNMENT LINKS */
// Welle 7 – Phase 10+11: Europe/Berlin-Heute als YYYY-MM-DD, timezone-safe.
// new Date().toISOString() liefert UTC; bei z.B. 23:30 Berlin-Zeit wuerde
// dadurch "heute" bereits als "morgen" interpretiert und aktive Einsaetze
// in Archiv rutschen. Intl.DateTimeFormat kapselt DST + CET/CEST korrekt.
const _BERLIN_DATE_FMT=new Intl.DateTimeFormat('en-CA',{
  timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'
});
function todayBerlinIso(){
  return _BERLIN_DATE_FMT.format(new Date());
}
function assignmentLifecycleState(link){
  if(link&&typeof link.assignment_lifecycle_state==='string'&&link.assignment_lifecycle_state)return link.assignment_lifecycle_state;
  if(link&&link.assignment_status==='completed')return 'completed';
  if(link&&link.assignment_status==='cancelled')return 'cancelled';
  if(link&&link.is_active===false)return 'archived';
  const today=todayBerlinIso();
  const end=link&&(
    link.assignment_effective_end_date
    || link.end_date
    || link.asg_end
    || null
  );
  const endDate=end?String(end).slice(0,10):null;
  if(endDate&&endDate<today)return 'expired';
  if(endDate&&endDate===today)return 'ends_today';
  return 'active';
}
function assignmentLifecycleBucket(link){
  if(link&&link.assignment_lifecycle_bucket==='active')return 'active';
  if(link&&link.assignment_lifecycle_bucket==='history')return 'history';
  const state=assignmentLifecycleState(link);
  return (state==='active'||state==='ends_today')?'active':'history';
}
function isCurrentAssignmentLink(link){
  if(link&&typeof link.assignment_is_current==='boolean')return link.assignment_is_current;
  return assignmentLifecycleBucket(link)==='active';
}
function assignmentLifecyclePill(link){
  const state=assignmentLifecycleState(link);
  const map={
    active:{cls:'pill-act',label:tt('ts.rev.asgn.statusActive')},
    ends_today:{cls:'pill-pend',label:tt('ts.rev.life.endsToday')},
    expired:{cls:'pill-off',label:tt('ts.rev.life.expired')},
    completed:{cls:'pill-off',label:tt('ts.rev.life.completed')},
    cancelled:{cls:'pill-off',label:tt('ts.rev.life.cancelled')},
    archived:{cls:'pill-off',label:tt('ts.rev.asgn.statusArchived')}
  };
  const cfg=map[state]||map.active;
  return '<span class="pill '+cfg.cls+'">'+cfg.label+'</span>';
}
async function loadAsgn(){
  if(!pageAccess.tabs.asgn){
    linksLoaded=true;
    setPanelNotice(
      'asgnStateNotice',
      tt('ts.rev.asgn.noAccessTitle'),
      tt('ts.rev.notice.noOrgAccess'),
      'info'
    );
    toggleElement('ldAsgn',false);
    toggleElement('ctAsgn',false);
    toggleElement('dealAsgnSection',false);
    return;
  }
  setPanelNotice('asgnStateNotice','','');
  if(pageAccess.permissions.workerEdit){
    setPanelNotice('asgnEditNotice','','');
  }
  document.getElementById('ldAsgn').style.display='block';
  document.getElementById('ctAsgn').style.display='none';
  try{
    const d=await fetchJson(`${API}/supplier/assignment-links`);
    allLinks=d.items||[];
    setAsgnKpis();
    linksLoaded=true;
    document.getElementById('tc-asgn').textContent=allLinks.filter(isCurrentAssignmentLink).length||'0';
    document.getElementById('ldAsgn').style.display='none';
    document.getElementById('ctAsgn').style.display='block';
    if(!pageAccess.permissions.workerEdit)toggleElement('dealAsgnSection',false);
    renderAsgns();
    loadComplaintInbox();
  }catch(error){
    if(isTransientError(error)){
      document.getElementById('ldAsgn').style.display='none';
      return;
    }
    allLinks=[];
    linksLoaded=true;
    document.getElementById('tc-asgn').textContent='–';
    document.getElementById('ldAsgn').style.display='none';
    document.getElementById('ctAsgn').style.display='none';
    toggleElement('dealAsgnSection',false);
    setPanelNotice(
      'asgnStateNotice',
      isAccessDeniedError(error)?tt('ts.rev.asgn.noAccessTitle'):tt('ts.rev.asgn.loadFailTitle'),
      isAccessDeniedError(error)
        ? tt('ts.rev.notice.noOrgAccess')
        : (error?.message||tt('ts.rev.notice.retryLater')),
      isAccessDeniedError(error)?'info':'danger'
    );
  }
}
function setAsgnKpis(){
  const act=allLinks.filter(isCurrentAssignmentLink).length;
  const cfg=allLinks.filter(l=>isCurrentAssignmentLink(l)&&(l.client_name||l.location_address)).length;
  const noI=allLinks.filter(l=>isCurrentAssignmentLink(l)&&!l.instructions).length;
  const wkrs=new Set(allLinks.filter(isCurrentAssignmentLink).map(l=>l.worker_user_id)).size;
  document.getElementById('ka1').textContent=act;
  document.getElementById('ka2').textContent=cfg;
  document.getElementById('ka3').textContent=noI;
  document.getElementById('ka4').textContent=wkrs;
}
function setAsgnFilter(f,btn){
  asgnFilter=f;
  document.querySelectorAll('.asgn-status-btns .rev-pill').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  renderAsgns();
}
function filterAsgn(){
  asgnQuery=(document.getElementById('aSearch')?.value||'').trim().toLowerCase();
  renderAsgns();
}
function renderAsgns(){
  const grid=document.getElementById('asgnGrid'),emp=document.getElementById('asgnEmpty');
  if(!grid)return;
  if(asgnViewMode==='planung'){ renderPlanungView(); return; }
  let list=allLinks;
  // Welle 7 – Phase 10+11: Aktiv / Archiv / Alle. Archiv zeigt alle Nicht-
  // aktiven Links (expired/completed/cancelled/archived) timezone-sicher.
  if(asgnFilter==='active')list=list.filter(isCurrentAssignmentLink);
  else if(asgnFilter==='archived')list=list.filter((l)=>!isCurrentAssignmentLink(l));
  if(asgnQuery)list=list.filter(l=>
    ((l.first_name||'')+' '+(l.last_name||'')+' '+(l.worker_email||'')+' '+(l.client_name||'')+' '+(l.location_address||''))
    .toLowerCase().includes(asgnQuery));
  if(!list.length){grid.innerHTML='';emp.style.display='block';return;}
  emp.style.display='none';
  grid.innerHTML=list.map(renderAsgnCard).join('');
}
function renderAsgnCard(l){
  const ini=((l.first_name||'?')[0]+(l.last_name||'?')[0]).toUpperCase();
  const tf=x=>x?String(x).substring(0,5):null;
  const fv=(val,em)=>val
    ?('<span class="asgn-field-val">'+esc(String(val))+'</span>')
    :('<span class="asgn-field-val empty">'+esc(em||tt('ts.rev.card.notSpecified'))+'</span>');
  const row=(ic,lb,val,em)=>'<div class="asgn-field-row"><span class="asgn-field-icon">'+ic+'</span><span class="asgn-field-label">'+lb+'</span>'+fv(val,em)+'</div>';
  const dr=l.start_date?(fmtD(l.start_date)+(l.end_date?' \u2013 '+fmtD(l.end_date):' (offen)')):null;
  const st=(l.default_shift_start&&l.default_shift_end)
    ?(tf(l.default_shift_start)+' \u2013 '+tf(l.default_shift_end)+' Uhr')
    :(l.default_hours_per_day?l.default_hours_per_day+' '+tt('ts.rev.asgn.hoursPerDay'):null);
  const ct=l.contact_name||(l.contact_phone||null);
  const ctFull=ct?(l.contact_name&&l.contact_phone?(l.contact_name+' / '+l.contact_phone):ct):null;
  const filled=[l.location_address,l.client_name,l.instructions,ct,l.default_shift_start].filter(Boolean).length;
  const pct=Math.round((filled/5)*100);
  const pc=pct>=80?'var(--wk-success)':pct>=40?'var(--wk-warning)':'var(--wk-danger)';
  const editAction=pageAccess.permissions.workerEdit
    ? '<button class="wk-btn wk-btn-primary wk-btn-sm" onclick="openLnkDrwById(\''+l.id+'\')">&#9998; Konfigurieren</button>'
    : '';
  // P1.1: Ersatz bei Krankheit/Ausfall — nur auf aktiven Einsaetzen + mit Edit-Recht
  const replaceAction=(pageAccess.permissions.workerEdit&&isCurrentAssignmentLink(l))
    ? '<button class="wk-btn wk-btn-sm" style="background:var(--tc-tone-danger-bg,#fef1f1);color:var(--tc-tone-danger-text,#b42318);border:1px solid var(--wk-danger,#e5484d)" onclick="openReplaceModal(\''+l.id+'\')" title="'+esc(tt('ts.rev.asgn.replaceTitle'))+'">&#8644; '+esc(tt('ts.rev.asgn.replaceCta'))+'</button>'
    : '';
  /* Zurueckziehen (Migration 198): NUR solange die Anfrage offen ist. Wer schon
     zugesagt hat, wird nicht zurueckgezogen — dafuer gibt es den Ersatz-Weg mit
     Wirk-Datum. `worker.manage` statt `worker.edit`, wie in der Route: der
     Rueckzug loest Meldungen an Arbeiter UND Kunde aus. */
  const withdrawAction=(pageAccess.permissions.workerManage
      &&l.worker_confirmation_status==='pending_confirmation'&&l.is_active!==false)
    ? '<button class="wk-btn wk-btn-sm" onclick="openWithdrawModal(\''+l.id+'\')" title="'+esc(tt('ts.rev.asgn.withdrawTitle'))+'">&#8617; '+esc(tt('ts.rev.asgn.withdrawCta'))+'</button>'
    : '';
  return '<div class="asgn-card">'
    +'<div class="asgn-card-head">'
    +'<div class="wk-avatar" style="'+aColor((l.first_name||'')+(l.last_name||''))+'">'+ini+'</div>'
    +'<div style="flex:1;min-width:0">'
    +'<div class="asgn-card-name">'+esc(l.first_name||'')+' '+esc(l.last_name||'')+'</div>'
    +'<div class="asgn-card-sub">'+esc(l.worker_email||'')+(l.personnel_number?' &middot; '+esc(l.personnel_number):'')+'</div>'
    +'</div>'
    +assignmentLifecyclePill(l)
    +(l.worker_confirmation_status&&l.worker_confirmation_status!=='auto_confirmed'?confBadge(l.worker_confirmation_status):'')
    +'</div>'
    +'<div class="asgn-fields">'
    +row('&#127970;',tt('ts.rev.asgn.rowClient'),l.client_name,tt('ts.rev.asgn.rowClientEmpty'))
    +row('&#128205;',tt('ts.rev.card.location'),l.location_address,null)
    +row('&#128197;',tt('ts.rev.asgn.rowPeriod'),dr,tt('ts.rev.asgn.rowPeriodEmpty'))
    +row('&#128336;',tt('ts.rev.card.shiftTime'),st,tt('ts.rev.card.noShiftTime'))
    +row('&#128203;',tt('ts.rev.card.instructions'),l.instructions?l.instructions.substring(0,60)+(l.instructions.length>60?'...':''):null,tt('ts.rev.card.noInstructions'))
    +(ctFull?row('&#128100;',tt('ts.rev.card.contact'),ctFull,null):'')
    +'</div>'
    +'<div style="margin:0 0 14px">'
    +'<div style="display:flex;justify-content:space-between;margin-bottom:5px">'
    +'<span style="font-size:.71rem;color:var(--wk-text-muted);text-transform:uppercase;letter-spacing:.05em">'+esc(tt('ts.rev.card.completeness'))+'</span>'
    +'<span style="font-size:.74rem;font-weight:700;color:'+pc+'">'+pct+'%</span>'
    +'</div>'
    +'<div style="height:3px;border-radius:2px;background:var(--tc-progress-track)">'
    +'<div style="height:100%;width:'+pct+'%;background:'+pc+';border-radius:2px;transition:width .4s ease"></div>'
    +'</div>'
    +'</div>'
    +'<div class="asgn-card-foot">'
    +editAction
    +withdrawAction
    +replaceAction
    +'</div>'
    +'</div>';
}

/* ── Anfrage zurueckziehen (Migration 198) ──────────────────────────────────
 *
 * Grund ist Pflicht (min. 3 Zeichen, wie beim Ersatz-Weg): er landet im Audit.
 * Ohne ihn liesse sich spaeter nicht mehr sagen, warum jemandem eine Anfrage
 * genommen wurde. Ein `prompt` statt eines eigenen Modals, weil genau das
 * gebraucht wird — eine Frage, eine Antwort; ein Drawer waere hier Zierrat. */
function openWithdrawModal(linkId){
  if(!ensurePermission('workerManage',tt('ts.rev.perm.lnkEdit')))return;
  var l=allLinks.find(function(x){return x.id===linkId;});
  var wer=l?((l.first_name||'')+' '+(l.last_name||'')).trim():'';
  var grund=window.prompt(tt('ts.rev.asgn.withdrawPrompt')+(wer?'\n\n'+wer:''),'');
  if(grund===null)return;                       // abgebrochen
  grund=String(grund).trim();
  if(grund.length<3){toast(tt('ts.rev.asgn.withdrawNeedsReason'),'error');return;}
  withdrawLink(linkId,grund);
}
async function withdrawLink(linkId,reason){
  try{
    var csrf=await getCsrf();
    const r=await fetch(`${API}/worker-assignment-links/${encodeURIComponent(linkId)}/zurueckziehen`,{
      method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({reason})
    });
    const d=await r.json().catch(function(){return {};});
    if(!r.ok){
      /* Rohe Fehlerschluessel gehoeren nicht in einen Toast. */
      var txt=d.error==='NICHT_MEHR_OFFEN'?tt('ts.rev.asgn.withdrawTooLate')
             :d.error==='NOT_FOUND'?tt('ts.rev.asgn.withdrawGone')
             :tt('ts.rev.asgn.withdrawFailed');
      toast(txt,'error');
      await loadAsgn();                         // Ansicht auf den echten Stand ziehen
      return;
    }
    toast(tt('ts.rev.asgn.withdrawDone'),'success');
    await loadAsgn();
  }catch(e){
    toast(tt('ts.rev.asgn.withdrawFailed'),'error');
  }
}
function openLnkDrwById(id){
  if(!ensurePermission('workerEdit',tt('ts.rev.perm.lnkEdit')))return;
  var l=allLinks.find(function(x){return x.id===id;});if(l)openLnkDrw(l);
}
function openLnkDrw(l){
  if(!ensurePermission('workerEdit',tt('ts.rev.perm.lnkEdit')))return;
  editingLinkId=l.id;
  document.getElementById('lnkDrwTitle').textContent=tt('ts.rev.lnk.title');
  document.getElementById('lnkDrwSub').textContent=(l.first_name||'')+' '+(l.last_name||'')+(l.client_name?' \u00b7 '+l.client_name:'');
  const h=x=>esc(x||'');
  const dv=x=>x?String(x).substring(0,10):'';
  const tv=x=>x?String(x).substring(0,5):'';
  const nv=x=>(x!=null&&x!=='')?String(x):'';
  document.getElementById('lnkDrwBody').innerHTML=''
    +'<div class="wk-alert wk-alert-info" style="margin-bottom:20px;font-size:.83rem;line-height:1.5">'
    +'<span>&#128161;</span><span>'+esc(tt('ts.rev.lnk.visibleFor'))+' <strong>'+h(l.first_name)+'</strong>.</span>'
    +'</div>'
    +'<div class="drw-section">'
    +'<div class="drw-section-title">'+esc(tt('ts.rev.lnk.sectionDetails'))+'</div>'
    +'<div class="wk-form-group"><label class="wk-label">'+esc(tt('ts.rev.lnk.clientName'))+'</label>'
    +'<input type="text" class="wk-input" id="le-client_name" value="'+h(l.client_name)+'" placeholder="'+esc(tt('ts.rev.lnk.clientNamePh'))+'"></div>'
    +'<div class="wk-form-group"><label class="wk-label">'+esc(tt('ts.rev.lnk.address'))+'</label>'
    +'<input type="text" class="wk-input" id="le-location_address" value="'+h(l.location_address)+'" placeholder="'+esc(tt('ts.rev.lnk.addressPh'))+'"></div>'
    +'<div class="wk-form-group"><label class="wk-label">'+esc(tt('ts.rev.lnk.meetingPoint'))+'</label>'
    +'<input type="text" class="wk-input" id="le-meeting_point" value="'+h(l.meeting_point)+'" placeholder="'+esc(tt('ts.rev.lnk.meetingPointPh'))+'"></div>'
    /* P10/E3 — Montage steht neben der Adresse, weil sie eine Aussage ueber den
       Ort ist. Ohne diese Erfassung bliebe der Reiter "Montage" in der
       Live-Belegschaft dauerhaft leer. */
    +'<div class="wk-form-group"><label class="wk-label" style="display:flex;align-items:center;gap:8px;cursor:pointer">'
    +'<input type="checkbox" id="le-is_montage" style="width:auto;margin:0"'+(l.is_montage?' checked':'')+'>'
    +'<span>'+esc(tt('ts.rev.lnk.montage'))+'</span></label>'
    +'<div style="font-size:.78rem;color:var(--wk-text-muted,#64748b);margin-top:4px">'+esc(tt('ts.rev.lnk.montageHint'))+'</div></div>'
    +'<div class="drw-grid-2">'
    +'<div class="wk-form-group"><label class="wk-label">'+esc(tt('ts.rev.lnk.startDate'))+' <span class="required">*</span></label>'
    +'<input type="date" class="wk-input" id="le-start_date" value="'+dv(l.start_date)+'"></div>'
    +'<div class="wk-form-group"><label class="wk-label">'+esc(tt('ts.rev.lnk.endDate'))+'</label>'
    +'<input type="date" class="wk-input" id="le-end_date" value="'+dv(l.end_date)+'"></div>'
    +'</div>'
    +'</div>'
    +'<div class="drw-section">'
    +'<div class="drw-section-title">'+esc(tt('ts.rev.lnk.sectionHours'))+'</div>'
    +'<div class="drw-grid-2">'
    +'<div class="wk-form-group"><label class="wk-label">'+esc(tt('ts.rev.lnk.shiftStart'))+'</label>'
    +'<input type="time" class="wk-input" id="le-default_shift_start" value="'+tv(l.default_shift_start)+'"></div>'
    +'<div class="wk-form-group"><label class="wk-label">'+esc(tt('ts.rev.lnk.shiftEnd'))+'</label>'
    +'<input type="time" class="wk-input" id="le-default_shift_end" value="'+tv(l.default_shift_end)+'"></div>'
    +'</div>'
    +'<div class="drw-grid-2">'
    +'<div class="wk-form-group"><label class="wk-label">'+esc(tt('ts.rev.lnk.hoursPerDay'))+'</label>'
    +'<input type="number" class="wk-input" id="le-default_hours_per_day" value="'+nv(l.default_hours_per_day)+'" min="0.5" max="24" step="0.5" placeholder="8"></div>'
    +'<div class="wk-form-group"><label class="wk-label">'+esc(tt('ts.rev.lnk.breakMinutes'))+'</label>'
    +'<input type="number" class="wk-input" id="le-default_break_minutes" value="'+nv(l.default_break_minutes)+'" min="0" max="120" step="5" placeholder="30"></div>'
    +'</div>'
    +'</div>'
    +'<div class="drw-section">'
    +'<div class="drw-section-title">'+esc(tt('ts.rev.lnk.sectionInstructions'))+'</div>'
    +'<div class="wk-form-group"><label class="wk-label">'+esc(tt('ts.rev.lnk.instructions'))+'</label>'
    +'<textarea class="wk-textarea" id="le-instructions" rows="3" placeholder="'+esc(tt('ts.rev.lnk.instructionsPh'))+'">'+h(l.instructions)+'</textarea></div>'
    +'<div class="wk-form-group"><label class="wk-label">'+esc(tt('ts.rev.lnk.dressCode'))+'</label>'
    +'<input type="text" class="wk-input" id="le-dress_code" value="'+h(l.dress_code)+'" placeholder="'+esc(tt('ts.rev.lnk.dressCodePh'))+'"></div>'
    +'<div class="wk-form-group"><label class="wk-label">'+esc(tt('ts.rev.lnk.internalNotes'))+' <span style="font-weight:400;color:var(--wk-text-muted)">'+esc(tt('ts.rev.lnk.internalNotesHint'))+'</span></label>'
    +'<textarea class="wk-textarea" id="le-notes" rows="2" placeholder="'+esc(tt('ts.rev.lnk.notesPh'))+'">'+h(l.notes)+'</textarea></div>'
    +'</div>'
    +'<div class="drw-section">'
    +'<div class="drw-section-title">'+esc(tt('ts.rev.lnk.sectionContact'))+'</div>'
    +'<div class="wk-form-group"><label class="wk-label">'+esc(tt('ts.rev.lnk.contactName'))+'</label>'
    +'<input type="text" class="wk-input" id="le-contact_name" value="'+h(l.contact_name)+'" placeholder="'+esc(tt('ts.rev.lnk.contactNamePh'))+'"></div>'
    +'<div class="drw-grid-2">'
    +'<div class="wk-form-group"><label class="wk-label">'+esc(tt('ts.rev.lnk.contactPhone'))+'</label>'
    +'<input type="tel" class="wk-input" id="le-contact_phone" value="'+h(l.contact_phone)+'" placeholder="+49 89 &hellip;"></div>'
    +'<div class="wk-form-group"><label class="wk-label">'+esc(tt('ts.rev.lnk.contactEmail'))+'</label>'
    +'<input type="email" class="wk-input" id="le-contact_email" value="'+h(l.contact_email)+'" placeholder="kontakt@firma.de"></div>'
    +'</div>'
    +'</div>'
    +'<div class="drw-section">'
    +'<div class="drw-section-title">'+esc(tt('ts.rev.lnk.sectionDispatcher'))+'</div>'
    +'<div class="wk-form-group"><label class="wk-label">'+esc(tt('ts.rev.lnk.dispatcherName'))+'</label>'
    +'<input type="text" class="wk-input" id="le-dispatcher_name" value="'+h(l.dispatcher_name)+'" placeholder="'+esc(tt('ts.rev.lnk.dispatcherNamePh'))+'"></div>'
    +'<div class="drw-grid-2">'
    +'<div class="wk-form-group"><label class="wk-label">'+esc(tt('ts.rev.lnk.dispatcherPhone'))+'</label>'
    +'<input type="tel" class="wk-input" id="le-dispatcher_phone" value="'+h(l.dispatcher_phone)+'" placeholder="+49 170 &hellip;"></div>'
    +'<div class="wk-form-group"><label class="wk-label">'+esc(tt('ts.rev.lnk.dispatcherEmail'))+'</label>'
    +'<input type="email" class="wk-input" id="le-dispatcher_email" value="'+h(l.dispatcher_email)+'" placeholder="disponent@agentur.de"></div>'
    +'</div>'
    +'</div>'
    +'<div id="lnkErr" style="display:none;padding:10px 12px;background:var(--tc-tone-danger-bg);border-radius:8px;font-size:.83rem;color:var(--tc-tone-danger-text);border-left:3px solid var(--wk-danger);margin-top:4px"></div>';
  document.getElementById('lnkDrwOvl').classList.add('on');
  document.getElementById('lnkDrw').classList.add('on');
  requestAnimationFrame(function(){document.getElementById('lnkDrwBody').scrollTop=0;});
}
function closeLnkDrw(){
  document.getElementById('lnkDrwOvl').classList.remove('on');
  document.getElementById('lnkDrw').classList.remove('on');
  editingLinkId=null;
}
async function saveLnkEdit(){
  if(!ensurePermission('workerEdit',tt('ts.rev.perm.lnkSave')))return;
  if(!editingLinkId)return;
  const gs=id=>{const e=document.getElementById('le-'+id);return e?e.value.trim()||null:undefined;};
  const body={};
  ['client_name','location_address','meeting_point','instructions','dress_code',
   'contact_name','contact_phone','contact_email','dispatcher_name','dispatcher_phone','dispatcher_email','notes'
  ].forEach(f=>{const v=gs(f);if(v!==undefined)body[f]=v;});
  const sd=document.getElementById('le-start_date')?.value?.trim();
  if(sd)body.start_date=sd;
  body.end_date=document.getElementById('le-end_date')?.value?.trim()||null;
  body.default_shift_start=document.getElementById('le-default_shift_start')?.value?.trim()||null;
  body.default_shift_end=document.getElementById('le-default_shift_end')?.value?.trim()||null;
  const hp=document.getElementById('le-default_hours_per_day')?.value?.trim();
  if(hp)body.default_hours_per_day=parseFloat(hp);
  const bm=document.getElementById('le-default_break_minutes')?.value?.trim();
  if(bm)body.default_break_minutes=parseInt(bm,10);
  // Ein Schalter hat keinen leeren Zustand: er wird immer mitgeschickt, sonst
  // liesse sich eine faelschlich gesetzte Montage nie wieder abwaehlen.
  const mont=document.getElementById('le-is_montage');
  if(mont)body.is_montage=!!mont.checked;
  const err=document.getElementById('lnkErr');
  if(!sd){err.textContent=tt('ts.rev.lnk.startRequired');err.style.display='block';return;}
  err.style.display='none';
  const btn=document.getElementById('lnkSaveBtn');
  btn.disabled=true;btn.textContent=tt('ts.rev.btn.saving');
  try{
    const csrf=await getCsrf();
    const r=await fetch(`${API}/worker-assignment-links/${editingLinkId}`,{
      method:'PATCH',credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify(body)
    });
    const d=await r.json();
    if(!r.ok){
      let msg=d.error||d.message||tt('ts.rev.msg.error');
      if(d.error==='VALIDATION'&&d.details?.[0])msg='Ung\u00fcltige Eingabe: '+(d.details[0].message||d.details[0].path?.join('.')||'');
      throw new Error(msg);
    }
    const idx=allLinks.findIndex(l=>l.id===editingLinkId);
    if(idx>=0)allLinks[idx]=Object.assign({},allLinks[idx],d);
    toast(tt('ts.rev.lnk.saved'),'success');
    closeLnkDrw();renderAsgns();setAsgnKpis();
  }catch(e){err.textContent=e.message||tt('ts.rev.msg.saveError');err.style.display='block';}
  finally{btn.disabled=false;btn.textContent=tt('ts.rev.lnk.save');}
}
async function viewWorkerLinks(workerId){
  if(!pageAccess.tabs.asgn){
    toast(tt('ts.rev.perm.lnkRole'),'error');
    return;
  }
  const w=allWrks.find(x=>(x.id||x.user_id)===workerId);
  if(!w)return;
  setStaffingWorkerPrefill(workerId);
  const name=((w.first_name||'')+' '+(w.last_name||'')).trim();
  asgnQuery=name.toLowerCase();
  asgnFilter='all';
  const inp=document.getElementById('aSearch');
  if(inp)inp.value=name;
  document.querySelectorAll('.asgn-status-btns .rev-pill').forEach(function(b,i){b.classList.toggle('on',i===1);});
  await switchTab('asgn');
  applyStaffingWorkerPrefill(workerId);
  if(linksLoaded)renderAsgns();
}
/* ── P3.2: Beschwerde-Eingang der Agentur (Rückkanal zur Kundenmeldung) ─────────
 * Zeigt Meldungen über eigene Kräfte und verdrahtet jede Meldung mit ihrer Antwort:
 * „Ersatz zuweisen" (P1.1) auf demselben Einsatz + Statusfortschritt für den Kunden. */
const CMP_SEV_LABEL={high:'Hoch',medium:'Mittel',low:'Niedrig'};
let complaintItems=[];

async function loadComplaintInbox(){
  const box=document.getElementById('cmpInbox');
  if(!box)return;
  try{
    const d=await fetchJson(`${API}/workers/complaints?status=open`);
    complaintItems=d.items||[];
  }catch(error){
    // Rückkanal ist Zusatzinformation — ein Fehler darf die Einsatzliste nie blockieren.
    complaintItems=[];
  }
  renderComplaintInbox();
}

function renderComplaintInbox(){
  const box=document.getElementById('cmpInbox');
  if(!box)return;
  if(!complaintItems.length){box.style.display='none';box.innerHTML='';return;}
  const rows=complaintItems.map((c)=>{
    const name=((c.first_name||'')+' '+(c.last_name||'')).trim()||tt('ts.rev.cmp.workerFallback');
    const sev=CMP_SEV_LABEL[c.severity]||c.severity||'–';
    const when=c.created_at?new Date(c.created_at).toLocaleDateString('de-DE'):'';
    const canEdit=pageAccess.permissions.workerEdit;
    const replaceBtn=(canEdit&&c.assignment_link_id)
      ? '<button class="wk-btn wk-btn-sm" style="background:var(--tc-tone-danger-bg,#fef1f1);color:var(--tc-tone-danger-text,#b42318);border:1px solid var(--wk-danger,#e5484d)" onclick="openReplaceModal(\''+esc(c.assignment_link_id)+'\')">&#8644; Ersatz zuweisen</button>'
      : '';
    return '<div class="wk-card" style="padding:12px 14px;margin-bottom:8px;border-left:3px solid var(--wk-danger,#e5484d)">'
      +'<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">'
        +'<div style="min-width:220px">'
          +'<div style="font-weight:700">'+esc(name)+' <span class="wk-sub" style="font-weight:400">· '+esc(c.company_name||tt('ts.rev.cmp.clientFallback'))+'</span></div>'
          +'<div class="wk-sub">Dringlichkeit: '+esc(sev)+(when?(' · gemeldet '+esc(when)):'')+'</div>'
          +'<div style="margin-top:6px">'+esc(c.reason||'')+'</div>'
        +'</div>'
        +'<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'
          +replaceBtn
          +'<button class="wk-btn wk-btn-sm" onclick="setComplaintStatus(\''+esc(c.id)+'\',\'acknowledged\')" title="'+esc(tt('ts.rev.cmp.acknowledgeTitle'))+'">'+esc(tt('ts.rev.cmp.acknowledge'))+'</button>'
          +'<button class="wk-btn wk-btn-sm wk-btn-primary" onclick="setComplaintStatus(\''+esc(c.id)+'\',\'resolved\')">Erledigt</button>'
        +'</div>'
      +'</div>'
    +'</div>';
  }).join('');
  box.innerHTML='<div class="wk-alert wk-alert-warn" style="margin-bottom:10px">'
    +'<strong>'+complaintItems.length+' offene Kundenmeldung'+(complaintItems.length===1?'':'en')+'</strong> '
    +'<span class="wk-sub">'+esc(tt('ts.rev.cmp.title'))+'</span>'
    +'</div>'+rows;
  box.style.display='block';
}

async function setComplaintStatus(id,status){
  if(!ensurePermission('workerManage',tt('ts.rev.perm.complaint')))return;
  try{
    const csrf=await getCsrf();
    await fetchJson(`${API}/workers/complaints/${encodeURIComponent(id)}`,{
      method:'PATCH',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({status})
    });
    toast(status==='resolved'?'Meldung als erledigt markiert.':'Meldung als angenommen markiert.','success');
    loadComplaintInbox();
  }catch(error){
    toast(tt('ts.rev.msg.saveFailed')+' '+(error?.message||tt('ts.rev.msg.error')),'error');
  }
}
window.setComplaintStatus=setComplaintStatus;

/* ── P1.1: Ersatz bei Krankheit/Ausfall (Chef weist Ersatz ab Wirk-Datum zu) ──── */
let replacingLinkId=null;
function openReplaceModal(id){
  if(!ensurePermission('workerEdit',tt('ts.rev.perm.lnkEdit')))return;
  var l=allLinks.find(function(x){return x.id===id;});
  if(!l){toast(tt('ts.rev.rep.notFound'),'error');return;}
  replacingLinkId=id;
  var ailingId=l.worker_user_id;
  var wname=function(w){return ((w.first_name||'')+' '+(w.last_name||'')).trim()||w.email||w.worker_email||w.personnel_number||'Arbeiter';};
  var cands=(allWrks||[]).filter(function(w){var uid=w.user_id||w.id;return w.is_active!==false&&uid&&uid!==ailingId;})
    .sort(function(a,b){return wname(a).localeCompare(wname(b),'de');});
  var opts=cands.map(function(w){var uid=w.user_id||w.id;return '<option value="'+esc(String(uid))+'">'+esc(wname(w))+(w.personnel_number?' ('+esc(String(w.personnel_number))+')':'')+'</option>';}).join('');
  var todayIso=(function(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})();
  var ailingName=esc(((l.first_name||'')+' '+(l.last_name||'')).trim()||'Arbeiter');
  var client=l.client_name?(' · '+esc(String(l.client_name))):'';
  var endInfo=l.end_date?tt('ts.rev.rep.endsOriginal', { date: esc(fmtD(l.end_date)) }):tt('ts.rev.rep.endsOpen');
  var body=''
    +'<div class="wk-alert wk-alert-info" style="margin-bottom:18px;font-size:.83rem;line-height:1.5">'
    +'<span>&#8644;</span><span><strong>'+ailingName+'</strong>'+client+' '+esc(tt('ts.rev.rep.removedText'))+' '+endInfo+' '+esc(tt('ts.rev.rep.billableText'))+'</span>'
    +'</div>'
    +'<div class="wk-form-group"><label class="wk-label">'+esc(tt('ts.rev.rep.effectiveDate'))+' <span class="required">*</span></label>'
    +'<input type="date" class="wk-input" id="rep-date" value="'+todayIso+'"></div>'
    +'<div class="wk-form-group"><label class="wk-label">Ersatz-Arbeiter <span class="required">*</span></label>'
    +(cands.length?('<select class="wk-input" id="rep-worker"><option value="">'+esc(tt('ts.rev.rep.pleaseSelect'))+'</option>'+opts+'</select>')
      :('<div class="wk-alert wk-alert-warning" style="font-size:.82rem">'+esc(tt('ts.rev.rep.noCandidates'))+'</div>'))
    +'</div>'
    +'<div class="wk-form-group"><label class="wk-label">'+esc(tt('ts.rev.rep.reason'))+' <span class="required">*</span></label>'
    +'<textarea class="wk-textarea" id="rep-reason" rows="2" placeholder="z.B. Krankmeldung, Ausfall, Kundenwunsch…"></textarea></div>'
    +'<div id="repErr" style="display:none;padding:10px 12px;background:var(--tc-tone-danger-bg,#fef1f1);border-radius:8px;font-size:.83rem;color:var(--tc-tone-danger-text,#b42318);border-left:3px solid var(--wk-danger,#e5484d);margin-top:4px"></div>';
  var ovl=document.getElementById('repModalOvl');
  if(!ovl){
    ovl=document.createElement('div');ovl.id='repModalOvl';
    ovl.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9998;display:flex;align-items:center;justify-content:center;padding:20px';
    ovl.addEventListener('click',function(e){if(e.target===ovl)closeReplaceModal();});
    var box=document.createElement('div');box.id='repModalBox';
    box.style.cssText='background:var(--wk-surface,#fff);border-radius:14px;max-width:460px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.35)';
    ovl.appendChild(box);document.body.appendChild(ovl);
  }
  document.getElementById('repModalBox').innerHTML=''
    +'<div style="padding:20px 22px 0"><div style="font-size:1.05rem;font-weight:700;color:var(--wk-text,#0f172a)">Ersatz zuweisen</div>'
    +'<div style="font-size:.82rem;color:var(--wk-text-muted,#64748b);margin-top:2px">'+esc(tt('ts.rev.rep.subtitle'))+'</div></div>'
    +'<div style="padding:18px 22px">'+body+'</div>'
    +'<div style="display:flex;gap:10px;justify-content:flex-end;padding:0 22px 20px">'
    +'<button class="wk-btn wk-btn-sm" style="background:var(--wk-surface-2,#f1f5f9);color:var(--wk-text,#0f172a)" onclick="closeReplaceModal()">'+esc(tt('ts.rev.rep.cancel'))+'</button>'
    +'<button class="wk-btn wk-btn-sm" id="repSubmitBtn" style="background:var(--wk-danger,#e5484d);color:#fff" '+(cands.length?'':'disabled')+' onclick="submitReplace()">&#8644; Ersatz zuweisen</button>'
    +'</div>';
  ovl.style.display='flex';
}
function closeReplaceModal(){
  var ovl=document.getElementById('repModalOvl');
  if(ovl)ovl.style.display='none';
  replacingLinkId=null;
}
async function submitReplace(){
  if(!ensurePermission('workerEdit',tt('ts.rev.perm.replacement')))return;
  if(!replacingLinkId)return;
  var err=document.getElementById('repErr');
  var showErr=function(m){if(err){err.textContent=m;err.style.display='block';}};
  var date=(document.getElementById('rep-date')&&document.getElementById('rep-date').value||'').trim();
  var worker=(document.getElementById('rep-worker')&&document.getElementById('rep-worker').value||'').trim();
  var reason=(document.getElementById('rep-reason')&&document.getElementById('rep-reason').value||'').trim();
  if(!date){showErr(tt('ts.rev.rep.errDate'));return;}
  if(!worker){showErr(tt('ts.rev.rep.errWorker'));return;}
  if(reason.length<3){showErr(tt('ts.rev.rep.errReason'));return;}
  showErr('');err.style.display='none';
  var btn=document.getElementById('repSubmitBtn');
  if(btn){btn.disabled=true;btn.textContent=tt('ts.rev.btn.assigning');}
  try{
    var csrf=await getCsrf();
    var r=await fetch(`${API}/worker-assignment-links/${replacingLinkId}/replace`,{
      method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({replacement_worker_user_id:worker,effective_date:date,reason:reason})
    });
    var d=await r.json().catch(function(){return {};});
    if(!r.ok){
      var msg=d.error||d.message||tt('ts.rev.msg.error');
      var map={NOT_FOUND:tt('ts.rev.rep.errNotFound'),LINK_NOT_ACTIVE:tt('ts.rev.rep.errNotActive'),SAME_WORKER:tt('ts.rev.rep.errSameWorker'),REPLACEMENT_NOT_IN_ORG:tt('ts.rev.rep.errNotInOrg'),REPLACEMENT_INACTIVE:tt('ts.rev.rep.errInactive'),SCHEDULE_CONFLICT:tt('ts.rev.rep.errConflict')};
      if(d.error==='VALIDATION'&&d.details&&d.details[0])msg=tt('ts.rev.rep.errValidation')+' '+(d.details[0].message||'');
      else if(map[d.error])msg=map[d.error];
      throw new Error(msg);
    }
    toast('Ersatz zugewiesen ✓ Ausfallender ab '+fmtD(date)+' freigestellt.','success');
    closeReplaceModal();
    await loadAsgn();
  }catch(e){showErr(e.message||tt('ts.rev.rep.failed'));}
  finally{if(btn){btn.disabled=false;btn.innerHTML='&#8644; Ersatz zuweisen';}}
}
/* ── P1.4: Vorausplanung — Timeline je Arbeiter (clientseitig aus allLinks) ────── */
var asgnViewMode='cards';
var planMonth=null; // Date am 1. des angezeigten Monats
function setAsgnView(mode,btn){
  asgnViewMode=mode;
  document.querySelectorAll('#asgnViewToggle .rev-pill').forEach(function(b){b.classList.remove('on');});
  if(btn)btn.classList.add('on');
  var cards=mode==='cards';
  var grid=document.getElementById('asgnGrid');
  var plan=document.getElementById('planungView');
  var statusBtns=document.getElementById('asgnStatusBtns');
  if(grid)grid.style.display=cards?'':'none';
  if(plan)plan.style.display=cards?'none':'block';
  if(statusBtns)statusBtns.style.display=cards?'':'none';
  if(cards){ renderAsgns(); }
  else{ if(!planMonth){var n=new Date();planMonth=new Date(n.getFullYear(),n.getMonth(),1);} renderPlanungView(); }
}
function planShiftMonth(delta){
  if(!planMonth){var n=new Date();planMonth=new Date(n.getFullYear(),n.getMonth(),1);}
  planMonth=new Date(planMonth.getFullYear(),planMonth.getMonth()+delta,1);
  renderPlanungView();
}
function planToday(){ var n=new Date();planMonth=new Date(n.getFullYear(),n.getMonth(),1);renderPlanungView(); }
function renderPlanungView(){
  var host=document.getElementById('planungView');
  if(!host)return;
  if(!planMonth){var n0=new Date();planMonth=new Date(n0.getFullYear(),n0.getMonth(),1);}
  var y=planMonth.getFullYear(), m=planMonth.getMonth();
  var monthStart=new Date(y,m,1), monthEnd=new Date(y,m+1,0);
  var daysInMonth=monthEnd.getDate();
  var monthLabel=planMonth.toLocaleDateString('de-DE',{month:'long',year:'numeric'});
  var pad=function(n){return String(n).padStart(2,'0');};
  var iso=function(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
  var monthStartIso=iso(monthStart), monthEndIso=iso(monthEnd);
  var td=new Date(); var todayIso=iso(new Date(td.getFullYear(),td.getMonth(),td.getDate()));
  var parseD=function(s){return s?String(s).substring(0,10):null;};
  var wname=function(l){return ((l.first_name||'')+' '+(l.last_name||'')).trim()||l.worker_email||'Arbeiter';};
  var esc2=function(s){return esc(String(s==null?'':s));};
  var dayPct=100/daysInMonth;
  var colFor=function(d){return (d-1)*dayPct;};

  // Links, die den Monat berühren (Datumsfenster-Überschneidung)
  var linksInMonth=(allLinks||[]).filter(function(l){
    var s=parseD(l.start_date); if(!s)return false;
    var e=parseD(l.end_date)||'9999-12-31';
    return s<=monthEndIso && e>=monthStartIso;
  });
  var byWorker=new Map();
  linksInMonth.forEach(function(l){
    var k=l.worker_user_id||l.id;
    if(!byWorker.has(k))byWorker.set(k,{name:wname(l),id:k,links:[]});
    byWorker.get(k).links.push(l);
  });
  var workers=Array.from(byWorker.values()).sort(function(a,b){return a.name.localeCompare(b.name,'de');});

  // Tagesraster (Hintergrund) + Wochen-Ticks
  var gridCols='', tickRow='';
  for(var d=1; d<=daysInMonth; d++){
    var dt=new Date(y,m,d); var we=(dt.getDay()===0||dt.getDay()===6);
    gridCols+='<div class="plan-daycol'+(we?' we':'')+'" style="left:'+colFor(d)+'%;width:'+dayPct+'%"></div>';
    if(dt.getDay()===1||d===1){ tickRow+='<div class="plan-tick" style="left:'+(colFor(d)+dayPct/2)+'%">'+d+'</div>'; }
  }
  var todayMarker='';
  if(todayIso>=monthStartIso && todayIso<=monthEndIso){
    todayMarker='<div class="plan-today" style="left:'+(colFor(td.getDate())+dayPct/2)+'%" title="Heute"></div>';
  }
  var blockClass=function(l){
    /* Nicht zustande gekommene Besetzungen duerfen im Monatsplan nicht wie
       gebuchte aussehen — der Knopf weist ihn als abrechnungsrelevant aus.
       `expired` (Frist verstrichen, Migration 195) und `worker_declined`
       (abgelehnt) liefen vorher in die Datumslogik und wurden dort zu einem
       blauen "Geplant"-Balken. Dieselbe Klasse wie bei einer Abwesenheit:
       gemeint ist beide Male "hier arbeitet niemand". */
    if(l.worker_confirmation_status==='worker_unavailable'
       ||l.worker_confirmation_status==='expired'
       ||l.worker_confirmation_status==='withdrawn'
       ||l.worker_confirmation_status==='worker_declined')return 'pb-unavail';
    var s=parseD(l.start_date), e=parseD(l.end_date)||'9999-12-31';
    if(e<todayIso)return 'pb-past';
    if(l.assignment_lifecycle_state==='ends_today'||e===todayIso)return 'pb-ends';
    if(s>todayIso)return 'pb-planned';
    return 'pb-active';
  };
  var rowFor=function(w){
    var blocks=w.links.map(function(l){
      var s=parseD(l.start_date), e=parseD(l.end_date)||monthEndIso;
      var cs=s<monthStartIso?1:parseInt(s.substring(8,10),10);
      var ce=e>monthEndIso?daysInMonth:parseInt(e.substring(8,10),10);
      if(ce<cs)ce=cs;
      var left=colFor(cs);
      var width=Math.max(dayPct*0.6,(ce-cs+1)*dayPct);
      var label=l.client_name||l.location_address||l.worker_description||tt('ts.rev.plan.assignmentFallback');
      var range=(l.start_date?fmtD(l.start_date):'?')+(l.end_date?(' – '+fmtD(l.end_date)):' (offen)');
      var contL=(s<monthStartIso?'‹ ':''), contR=(e>monthEndIso?' ›':'');
      return '<div class="plan-block '+blockClass(l)+'" style="left:'+left+'%;width:'+width+'%" '
        +'title="'+esc2(label)+' · '+esc2(range)+'" onclick="openLnkDrwById(\''+esc2(l.id)+'\')">'
        +esc2(contL+label+contR)+'</div>';
    }).join('');
    var planBtn=pageAccess.permissions.workerEdit
      ? '<button class="wk-btn wk-btn-sm wk-btn-outline plan-plusbtn" title="'+esc(tt('ts.rev.plan.blockTitle'))+'" onclick="planBlockForWorker(\''+esc2(w.id)+'\')">'+esc(tt('ts.rev.plan.blockCta'))+'</button>'
      : '<span class="plan-plusbtn" style="width:74px"></span>';
    return '<div class="plan-row">'
      +'<div class="plan-name">'+esc2(w.name)+'<small>'+esc(tt('ts.rev.plan.assignmentsInMonth', { n: w.links.length }))+'</small></div>'
      +'<div class="plan-track">'+gridCols+todayMarker+blocks+'</div>'
      +planBtn+'</div>';
  };
  var legend='<div class="plan-legend">'
    +'<span><i style="background:var(--wk-success,#12a150)"></i>'+esc(tt('ts.rev.plan.legendActive'))+'</span>'
    +'<span><i style="background:var(--hub-accent,#3b82f6)"></i>Geplant</span>'
    +'<span><i style="background:var(--wk-warning,#d97706)"></i>Endet</span>'
    +'<span><i style="background:var(--wk-text-muted,#94a3b8)"></i>Vergangen</span>'
    +'<span><i style="background:var(--wk-danger,#e5484d)"></i>Freigestellt</span></div>';
  var nav='<div class="plan-nav">'
    +'<button class="wk-btn wk-btn-sm wk-btn-outline" onclick="planShiftMonth(-1)" title="Vormonat">&#8249;</button>'
    +'<div class="plan-month">'+esc2(monthLabel)+'</div>'
    +'<button class="wk-btn wk-btn-sm wk-btn-outline" onclick="planShiftMonth(1)" title="Folgemonat">&#8250;</button>'
    +'<button class="wk-btn wk-btn-sm" onclick="planToday()">Heute</button>'
    +'<button class="wk-btn wk-btn-sm wk-btn-outline" onclick="planDownloadPdf()" title="Monats-Einsatzplan als PDF herunterladen (abrechnungsrelevant)">&#8681; PDF</button>'
    +legend+'</div>';
  if(!workers.length){
    host.innerHTML=nav+'<div class="hub-empty" style="display:block"><h3>'+esc(tt('ts.rev.plan.emptyTitle', { month: esc2(monthLabel) }))+'</h3><p>'+esc(tt('ts.rev.plan.emptyText'))+'</p></div>';
    return;
  }
  var axisHead='<div class="plan-head"><div class="plan-name"></div><div class="plan-track plan-axis">'+gridCols+tickRow+todayMarker+'</div><span class="plan-plusbtn" style="width:74px"></span></div>';
  host.innerHTML=nav+'<div class="plan-grid">'+axisHead+workers.map(rowFor).join('')+'</div>';
}
function planDownloadPdf(){
  if(!planMonth){var n=new Date();planMonth=new Date(n.getFullYear(),n.getMonth(),1);}
  var y=planMonth.getFullYear(), mo=planMonth.getMonth()+1;
  window.open(API+'/supplier/plan/monthly.pdf?year='+y+'&month='+mo,'_blank');
}
function planBlockForWorker(workerId){
  if(!ensurePermission('workerEdit',tt('ts.rev.perm.planBlock')))return;
  if(typeof setStaffingWorkerPrefill==='function')setStaffingWorkerPrefill(workerId);
  if(typeof openAssignDrw==='function'){
    openAssignDrw();
    if(typeof applyStaffingWorkerPrefill==='function')applyStaffingWorkerPrefill(workerId);
  }
}
/* UTILS */
function confBadge(s){
  const m={
    pending_confirmation:'<span class="pill pill-warn" style="margin-left:6px">'+esc(tt('ts.rev.conf.pending'))+'</span>',
    worker_confirmed:'<span class="pill pill-act" style="margin-left:6px">'+esc(tt('ts.rev.conf.confirmed'))+'</span>',
    worker_declined:'<span class="pill pill-danger" style="margin-left:6px">'+esc(tt('ts.rev.conf.declined'))+'</span>',
    /* Verfall ist keine Absage — neutral statt rot. Ohne diese beiden Eintraege
       blieb die Karte wortlos, und der Disponent sah keinen Unterschied zu
       einer bestaetigten Besetzung. */
    expired:'<span class="pill" style="margin-left:6px">'+esc(tt('ts.rev.conf.expired'))+'</span>',
    worker_unavailable:'<span class="pill pill-danger" style="margin-left:6px">'+esc(tt('ts.rev.conf.unavailable'))+'</span>',
    withdrawn:'<span class="pill" style="margin-left:6px">'+esc(tt('ts.rev.conf.withdrawn'))+'</span>'
  };
  return m[s]||'';
}
// P2.1: Einreichfrist-Indikator — überfällig (offen + Frist verstrichen) / verspätet (nach Frist abgegeben) / Frist-Hinweis.
function subDeadlineTag(s){
  if(!s)return'';
  if(s.is_overdue) return ' <span class="wk-badge" style="background:var(--wk-danger,#e5484d);color:#fff" title="'+esc(tt('ts.rev.due.overdueTitle'))+'">'+esc(tt('ts.rev.due.overdue'))+'</span>';
  if(s.submitted_late) return ' <span class="wk-badge" style="background:var(--wk-warning,#d97706);color:#fff" title="'+esc(tt('ts.rev.due.lateTitle'))+'">'+esc(tt('ts.rev.due.late'))+'</span>';
  if((s.status==='draft'||s.status==='needs_correction') && s.submission_deadline)
    return ' <span style="font-size:.72rem;color:var(--wk-text-muted)" title="Einreichfrist">· Frist '+esc(fmtD(s.submission_deadline))+'</span>';
  return '';
}
function badge(s){
  const m={
    draft:                  '<span class="wk-badge wk-badge-draft">'+esc(tt('ts.rev.status.draft'))+'</span>',
    submitted:              '<span class="wk-badge wk-badge-submitted">'+esc(tt('ts.rev.status.submitted'))+'</span>',
    under_review:           '<span class="wk-badge wk-badge-under-review">'+esc(tt('ts.rev.status.underReview'))+'</span>',
    needs_correction:       '<span class="wk-badge wk-badge-needs-correction">'+esc(tt('ts.rev.status.needsCorrection'))+'</span>',
    approved_internal:      '<span class="wk-badge wk-badge-approved-internal">'+esc(tt('ts.rev.status.approvedInternal'))+'</span>',
    sent_to_customer:       '<span class="wk-badge wk-badge-sent-to-customer">'+esc(tt('ts.rev.status.sentToCustomer'))+'</span>',
    customer_confirmed:     '<span class="wk-badge wk-badge-cust-confirmed">\u2713 '+esc(tt('ts.rev.status.customerConfirmed'))+'</span>',
    customer_rejected:      '<span class="wk-badge wk-badge-cust-rejected">\u26a0 '+esc(tt('ts.rev.status.customerRejected'))+'</span>',
    posted_to_timesheet:    '<span class="wk-badge wk-badge-posted">\u2713 '+esc(tt('ts.rev.status.posted'))+'</span>',
    accepted_into_timesheet:'<span class="wk-badge wk-badge-accepted">\u2713 '+esc(tt('ts.rev.status.accepted'))+'</span>',
    rejected:               '<span class="wk-badge wk-badge-rejected">'+esc(tt('ts.rev.status.rejected'))+'</span>'
  };
  return m[s]||`<span class="wk-badge wk-badge-draft">${esc(s)}</span>`;
}
function stLbl(s){
  const m={
    submitted:tt('ts.rev.status.submitted'),under_review:tt('ts.rev.status.underReview'),needs_correction:tt('ts.rev.status.needsCorrectionLong'),
    approved_internal:tt('ts.rev.status.approvedInternal'),sent_to_customer:tt('ts.rev.status.sentToCustomer'),
    customer_confirmed:tt('ts.rev.status.customerConfirmed'),customer_rejected:tt('ts.rev.status.customerRejected'),
    posted_to_timesheet:tt('ts.rev.status.posted'),accepted_into_timesheet:tt('ts.rev.status.transferred'),
    rejected:tt('ts.rev.status.rejected'),draft:tt('ts.rev.status.draft')
  };
  return m[s]||s;
}
function evLbl(t){
  const m={created:tt('ts.rev.ev.created'),submitted:tt('ts.rev.ev.submitted'),review_started:tt('ts.rev.ev.reviewStarted'),
    correction_requested:tt('ts.rev.ev.correctionRequested'),corrected:tt('ts.rev.ev.corrected'),
    approved_internal:tt('ts.rev.ev.approvedInternal'),sent_to_customer:tt('ts.rev.ev.sentToCustomer'),
    customer_confirmed:tt('ts.rev.ev.customerConfirmed'),customer_rejected:tt('ts.rev.ev.customerRejected'),
    posted_to_timesheet:tt('ts.rev.ev.posted'),
    accepted:tt('ts.rev.ev.accepted'),rejected:tt('ts.rev.ev.rejected'),comment_added:tt('ts.rev.ev.comment')
  };
  return m[t]||t;
}
function evClr(t){
  if(['accepted','approved_internal','customer_confirmed','posted_to_timesheet'].includes(t))return 'g';
  if(['review_started','sent_to_customer'].includes(t))return 'b';
  if(['correction_requested','customer_rejected'].includes(t))return 'o';
  if(t==='rejected')return 'r';
  return '';
}
function fmtWeek(st,en){if(!st)return'';const s=new Date(st),e=new Date(en||st);const fmt=d=>d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'});return `KW ${kw(s)} – ${fmt(s)} – ${fmt(e)}`;}
function fmtD(d){return new Date(d).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'});}
function dayN(d){return['So','Mo','Di','Mi','Do','Fr','Sa'][new Date(d).getDay()];}
function kw(d){const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const day=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-day);const y=t.getUTCFullYear();return Math.floor((t-new Date(Date.UTC(y,0,1)))/604800000)+1;}
function relT(d){const s=(Date.now()-new Date(d).getTime())/1000;if(s<60)return'gerade eben';if(s<3600)return`vor ${Math.floor(s/60)} Min.`;if(s<86400)return`vor ${Math.floor(s/3600)} Std.`;return`vor ${Math.floor(s/86400)} Tagen`;}
function aColor(n){const c=['background:linear-gradient(135deg,var(--ds-brand),var(--ds-accent))','background:linear-gradient(135deg,var(--ds-success),var(--ds-brand-hover))','background:linear-gradient(135deg,var(--ds-warning),var(--ds-danger))','background:linear-gradient(135deg,var(--ds-accent),var(--ds-brand-hover))','background:linear-gradient(135deg,var(--ds-brand-hover),var(--ds-success))'];let h=0;for(let i=0;i<(n||'').length;i++)h=(h*31+(n||'').charCodeAt(i))&0xffffffff;return c[Math.abs(h)%c.length];}
function esc(s){return String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]||c));}
function toast(msg,type=''){const t=document.getElementById('wk-toast');t.textContent=msg;t.className=type?`show ${type}`:'show';setTimeout(()=>t.className='',3500);}

/* ── Expose functions called from HTML onclick handlers ────── */
window.reloadAll = reloadAll;
window.setFilter = setFilter;
window.selSub = selSub;
window.switchTab = switchTab;
window.togNote = togNote;
window.doAct = doAct;
window.doActSend = doActSend;
window.doActConf = doActConf;
window.doActCRej = doActCRej;
window.sendBundleByKey = sendBundleByKey;
window.previewBundleScope = previewBundleScope;
window.openBundleDetail = openBundleDetail;
window.downloadBundleCsv = downloadBundleCsv;
window.postBundle = postBundle;
window.onBundlePeriodModeChange = onBundlePeriodModeChange;
window.renderBundleDetailTable = renderBundleDetailTable;
window.openSubmissionFromBundle = openSubmissionFromBundle;
window.closeBundleModal = closeBundleModal;
window.filterW = filterW;
window.togWrk = togWrk;
window.resendInv = resendInv;
window.revokeInv = revokeInv;
window.openWorkerAssignDrw = openWorkerAssignDrw;
window.closeWorkerAssignDrw = closeWorkerAssignDrw;
window.toggleWorkerAssignAssignment = toggleWorkerAssignAssignment;
window.refreshWorkerAssignmentCardContext = refreshWorkerAssignmentCardContext;
window.quickAssignWorkerFromDrawer = quickAssignWorkerFromDrawer;
window.manualAssignWorkerFromDrawer = manualAssignWorkerFromDrawer;
window.openWorkerAssignmentInStaffingTab = openWorkerAssignmentInStaffingTab;
window.openDrw = openDrw;
window.closeDrw = closeDrw;
window.sendInv = sendInv;
window.openCreateDrw = openCreateDrw;
window.closeCreateDrw = closeCreateDrw;
window.submitCreate = submitCreate;
window.openAssignDrw = openAssignDrw;
window.closeAssignDrw = closeAssignDrw;
window.onCapSelect = onCapSelect;
window.submitAssign = submitAssign;
window.retryLoadAssignData = retryLoadAssignData;
window.assignDealWorker = assignDealWorker;
window.setAsgnFilter = setAsgnFilter;
window.filterAsgn = filterAsgn;
window.openLnkDrwById = openLnkDrwById;
window.closeLnkDrw = closeLnkDrw;
window.saveLnkEdit = saveLnkEdit;
window.viewWorkerLinks = viewWorkerLinks;
window.openReplaceModal = openReplaceModal;
window.closeReplaceModal = closeReplaceModal;
window.submitReplace = submitReplace;
window.setAsgnView = setAsgnView;
window.planShiftMonth = planShiftMonth;
window.planToday = planToday;
window.planDownloadPdf = planDownloadPdf;
window.planBlockForWorker = planBlockForWorker;

/* Sprachwechsel: die Listen, Karten und Drawer dieser Seite entstehen in JS und
   tragen deshalb keine data-i18n-Marker — TCi18n.apply() erreicht sie nicht.
   Nach einem Wechsel wird der aktive Tab neu aufgebaut, damit Status-Pills,
   Aktionsknoepfe und Leerzustaende nicht in der alten Sprache stehen bleiben. */
document.addEventListener('tc:langchange', function () {
  if (!currentTab || !pageAccess.tabs[currentTab]) return;
  Promise.resolve(switchTab(currentTab, { force: true })).catch(function () {
    /* Netz-/Zugriffsfehler melden bereits die jeweiligen load*-Notices. */
  });
});
