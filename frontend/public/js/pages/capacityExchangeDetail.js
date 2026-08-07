"use strict";

/* Woerterbuch (P6.1, DE/EN) fuer capacity_exchange_detail.html.
   Die Seite laedt i18n.js im head, dieses Modul laeuft ausschliesslich auf
   der Detailseite — TCi18n ist hier also garantiert vorhanden.

   Bewusst NICHT uebersetzt:
   - Topbar/Navigation/Nutzerbereich (uebersetzt pageShell.js mit shell-Keys)
   - rollenabhaengige Begriffe aus terminologyLabels.js
   - Rohwerte aus der API (Titel, Rolle, Ort, Status-Codes, Preistyp)
   - der an die Gegenseite gesendete Nachrichtentext (buildInteractionMessage):
     das ist ein Datenwert, dessen Empfaengersprache hier unbekannt ist        */
TCi18n.register('de', {
  'capm.paywall.home': 'Startseite',
  'capm.paywall.title': 'Bereich nicht verfuegbar',
  'capm.paywall.currentPlan': 'Aktueller Plan:',
  'capm.paywall.cta': 'Abo ansehen',

  'capm.detail.docTitle': 'Personalangebot / Anfrage – TempConnect',
  'capm.hero.empty': 'Kein Eintragsbild vorhanden',
  'capm.hero.badge': 'Eintragsvorschau',
  'capm.disclaimer': 'Alle Angaben ohne Gewaehr. TempConnect vermittelt, garantiert aber keinen Vermittlungserfolg.',

  'capm.sect.workforce': 'Personalangebot',
  'capm.sect.workforceHint': '— Welches Personal wird angeboten?',
  'capm.sect.demand': 'Arbeitsplatzangebot',
  'capm.sect.demandHint': '— Welche Qualifikationen werden benoetigt?',
  'capm.sect.timing': 'Zeitraum & Einsatzmodell',
  'capm.sect.timingHint': '— Wann und wie wird eingesetzt?',
  'capm.sect.location': 'Standort',
  'capm.sect.locationHint': '— Wo ist der Einsatzort?',
  'capm.sect.qual': 'Qualifikationen',
  'capm.sect.price': 'Konditionen',
  'capm.sect.priceHint': '— Preis und Verguetungsdetails',
  'capm.sect.safety': 'Sicherheitshinweise',
  'capm.sect.gallery': 'Angebotsbilder',
  'capm.sect.complianceDocs': 'Compliance-Dokumente',
  'capm.sect.matches': 'Passende Anfragen (Matching)',
  'capm.sect.interactions': 'Eingegangene Interaktionen',
  'capm.sect.trust': 'Vertrauenssignale',
  'capm.sect.trustHint': '— Bewertung des Anbieters',
  'capm.sect.compliance': 'Compliance',
  'capm.sect.complianceHint': '— Nachweis- und Dokumentenstatus',
  'capm.sect.quickActions': 'Schnellaktionen',
  'capm.sect.recentlyViewed': 'Zuletzt angesehen',
  'capm.sect.ownerActions': 'Aktionen',

  'capm.field.role': 'Rolle',
  'capm.field.category': 'Kategorie',
  'capm.field.headcount': 'Anzahl',
  'capm.field.skills': 'Skills',
  'capm.field.availability': 'Verfuegbarkeit',
  'capm.field.availType': 'Typ',
  'capm.field.shift': 'Schichtmodell',
  'capm.field.employment': 'Einsatzart',
  'capm.field.cityZip': 'Stadt / PLZ',
  'capm.field.radius': 'Einsatzradius',
  'capm.field.country': 'Land',
  'capm.field.mobility': 'Mobilitaet',
  'capm.field.profile': 'Profil',
  'capm.field.certificates': 'Zertifikate',
  'capm.field.priceType': 'Preistyp',
  'capm.field.min': 'Min',
  'capm.field.max': 'Max',
  'capm.field.hint': 'Hinweis',

  'capm.state.loadingMatches': 'Lade Matches…',
  'capm.state.loading': 'Lade…',

  'capm.action.save': 'Merken',
  'capm.action.saveTitle': 'Personalangebot merken',
  'capm.action.copyLink': 'Link kopieren',
  'capm.action.emergencyCommit': 'Notdienst-Zusage senden',
  'capm.action.dealAccept': 'Konditionen zustimmen',
  'capm.action.dealNegotiate': 'Um Verhandlung bitten',
  'capm.action.ask': 'Frage stellen',

  'capm.im.title': 'Interaktion senden',
  'capm.im.close': 'Schliessen',
  'capm.im.start': 'Gewuenschter Start',
  'capm.im.end': 'Gewuenschter Endtermin',
  'capm.im.headcount': 'Anzahl / Umfang',
  'capm.im.headcountPh': 'z.B. 5',
  'capm.im.location': 'Standortbezug',
  'capm.im.locationPh': 'z.B. Stuttgart, 25 km',
  'capm.im.deadline': 'Rueckmeldung bis',
  'capm.im.contactPref': 'Kontaktpraeferenz',
  'capm.im.contactDefault': 'Standard ueber Plattform',
  'capm.im.contactPlatform': 'Nur Plattformnachricht',
  'capm.im.contactEmail': 'E-Mail bevorzugt',
  'capm.im.contactCall': 'Rueckruf gewuenscht',
  'capm.im.priceHeading': 'Preisvorstellung',
  'capm.im.priceMin': 'Min. Stundensatz (EUR)',
  'capm.im.priceMinPh': 'z.B. 18.50',
  'capm.im.priceMax': 'Max. Stundensatz (EUR)',
  'capm.im.priceMaxPh': 'z.B. 25.00',
  'capm.im.topic': 'Betreff / Thema',
  'capm.im.topicScope': 'Leistungsumfang',
  'capm.im.topicAvailability': 'Verfuegbarkeit',
  'capm.im.topicCompliance': 'Compliance/Nachweise',
  'capm.im.topicPricing': 'Konditionen/Preisrahmen',
  'capm.im.topicOperations': 'Operativer Ablauf',
  'capm.im.requirements': 'Besondere Anforderungen',
  'capm.im.requirementsPh': 'z.B. Schicht, Zertifikate, Startfenster',
  'capm.im.message': 'Nachricht',
  'capm.im.messagePh': 'Kurze, konkrete Nachricht mit den wichtigsten Eckdaten',
  'capm.im.hint': 'Nach dem Senden wird die Gegenseite benachrichtigt und der Vorgang ist nachvollziehbar in den Interaktionen dokumentiert.',
  'capm.im.cancel': 'Abbrechen',
  'capm.im.submit': 'Senden',
  'capm.im.ref': 'Bezug',
  'capm.im.entry': 'Eintrag',
  'capm.im.na': 'n/a',
  'capm.im.needQuestion': 'Bitte formulieren Sie kurz Ihre Rueckfrage.',
  'capm.im.confirmAccept': 'Konditionen jetzt VERBINDLICH zustimmen?\n\nDamit starten Sie einen verbindlichen Deal zu den angebotenen Konditionen. Bitte nur bestaetigen, wenn Sie sicher sind.',
  'capm.im.preparing': 'Deal wird vorbereitet…',

  'capm.ag.title': 'Deal erfolgreich gestartet',
  'capm.ag.conditions': 'Vereinbarte Konditionen',
  'capm.ag.loading': 'Wird geladen…',
  'capm.ag.docLoading': 'Einsatzvereinbarung wird geladen…',
  'capm.ag.open': 'Vereinbarung oeffnen',
  'capm.ag.sheet': 'Konditionsblatt',
  'capm.ag.toDeal': 'Zur Dealakte & naechste Schritte',
  'capm.ag.info1': 'Das Angebot wurde aus der Vermittlung entfernt und reserviert.',
  'capm.ag.info2': 'Die Zeitarbeitsfirma wurde per E-Mail und In-App benachrichtigt.',
  'capm.ag.close': 'Schliessen',
  'capm.ag.refCreated': 'Einsatzvereinbarung {ref} erstellt',
  'capm.ag.created': 'Einsatzbestaetigung erstellt',
  'capm.ag.statusDone': 'Deal abgeschlossen — die Gegenseite wird benachrichtigt.',
  'capm.ag.statusPartial': 'Personalangebot teilweise gebunden — noch {n} freie Plaetze verbleiben.',
  'capm.ag.statusReserved': 'Personalangebot reserviert — keine freie Restmenge mehr.',
  'capm.ag.gridRole': 'Rolle',
  'capm.ag.gridCity': 'Ort',
  'capm.ag.gridPeople': 'Personen im Deal',
  'capm.ag.gridPeriod': 'Zeitraum',
  'capm.ag.gridRemaining': 'Restfrei nach Deal',
  'capm.ag.gridTotal': 'Stellen gesamt',
  'capm.ag.gridPrice': 'Preis',
  'capm.ag.docPending': 'Dokument wird nach Bestaetigung finalisiert.',
  'capm.ag.docTitle': 'Einsatzvereinbarung',

  'capm.hc.persons': '{n} Personen',
  'capm.hc.split': '{free} frei / {total} gesamt',
  'capm.hc.committed': ' · {n} dealgebunden',
  'capm.hc.fullyReserved': 'Voll reserviert · 0 von {total} frei',
  'capm.hc.freeOf': '{free} von {total} frei',

  'capm.cfg.interestTitleSupply': 'Interesse am Angebot bekunden',
  'capm.cfg.interestTitleDemand': 'Interesse am Arbeitsplatzangebot bekunden',
  'capm.cfg.interestSubSupply': 'Qualifizierter Erstkontakt fuer moegliche Besetzung',
  'capm.cfg.interestSubDemand': 'Qualifizierter Erstkontakt zur Besetzung',
  'capm.cfg.interestBtn': 'Interesse senden',
  'capm.cfg.interestNext': 'Die Gegenseite erhaelt Ihr strukturiertes Interesse und kann die naechste Deal-Abstimmung starten.',
  'capm.cfg.offerTitleSupply': 'Angebot anfragen',
  'capm.cfg.offerTitleDemand': 'Verfuegbarkeit anfragen',
  'capm.cfg.offerSubSupply': 'Anfrage mit operativen Eckdaten statt Freitext',
  'capm.cfg.offerSubDemand': 'Rueckmeldung mit Umsetzungsdaten vorbereiten',
  'capm.cfg.offerBtnSupply': 'Anfrage senden',
  'capm.cfg.offerBtnDemand': 'Rueckfrage senden',
  'capm.cfg.offerNext': 'Die Anfrage wird mit Zeitraum, Umfang und Kontext gespeichert und kann direkt in den Deal-Prozess uebergehen.',
  'capm.cfg.questionTitle': 'Fachliche Rueckfrage stellen',
  'capm.cfg.questionSub': 'Kontextbezogene Frage mit klarer Zuordnung zum Eintrag',
  'capm.cfg.questionBtn': 'Frage senden',
  'capm.cfg.questionNext': 'Die Rueckfrage ist dem Eintrag eindeutig zugeordnet und fuer beide Seiten nachvollziehbar.',
  'capm.cfg.contactTitle': 'Kontakt abstimmen',
  'capm.cfg.contactSub': 'Kommunikationsweg und naechsten operativen Schritt festlegen',
  'capm.cfg.contactBtn': 'Kontaktanfrage senden',
  'capm.cfg.contactNext': 'Die Kontaktpraeferenz wird dokumentiert, damit der Austausch ohne Medienbruch starten kann.',
  'capm.cfg.acceptTitle': 'Konditionen zustimmen',
  'capm.cfg.acceptSub': 'Signalisieren Sie verbindliche Dealbereitschaft zu den angebotenen Konditionen.',
  'capm.cfg.acceptBtn': 'Zustimmung verbindlich uebermitteln',
  'capm.cfg.acceptNext': 'Die Zeitarbeitsfirma wird sofort informiert. Danach folgt die operative Abstimmung ueber TempConnect, E-Mail oder Telefon.',
  'capm.cfg.negotiateTitle': 'Um Verhandlung bitten',
  'capm.cfg.negotiateSub': 'Teilen Sie mit, welche Konditionen angepasst werden sollen.',
  'capm.cfg.negotiateBtn': 'Verhandlungsanfrage senden',
  'capm.cfg.negotiateNext': 'Die Gegenseite erhaelt eine strukturierte Verhandlungsanfrage. Der Deal bleibt offen bis zur Einigung.',
  'capm.cfg.emergencyTitle': 'Notdienst-Zusage senden',
  'capm.cfg.emergencySub': 'Schnelle Zusage fuer eine dringende Anfrage.',
  'capm.cfg.emergencyBtn': 'Notdienst zusagen',
  'capm.cfg.emergencyNext': 'Ihre Zusage wird sofort dokumentiert und an die anfragende Seite uebermittelt.',

  'capm.az.title': 'Naechste Schritte',
  'capm.az.leadDemand': 'Reagieren Sie auf dieses Arbeitsplatzangebot.',
  'capm.az.leadSupply': 'Reagieren Sie auf dieses Angebot der Zeitarbeitsfirma.',
  'capm.az.leadEmergency': 'Notdienst-Anfrage mit sofortigem Handlungsbedarf.',
  'capm.az.leadEmergencyOpen': ' Noch {n} offen.',
  'capm.az.openCount': '{n} offen',
  'capm.az.full': 'voll',
  'capm.az.roleBlocked': 'Fuer diese Rolle ist hier keine direkte Interaktion vorgesehen.',
  'capm.az.toDeal': 'Zum Deal',

  'capm.sum.start': 'Start',
  'capm.sum.end': 'Ende',
  'capm.sum.scope': 'Umfang',
  'capm.sum.location': 'Standort',
  'capm.sum.deadline': 'Rueckmeldung bis',
  'capm.sum.contact': 'Kontakt',
  'capm.sum.sent': '{label} gesendet.',
  'capm.sum.captured': 'Erfasst: {parts}',
  'capm.sum.contextual': 'Kontextbezogene Nachricht erfasst.',
  'capm.sum.fallbackLabel': 'Interaktion',

  'capm.ilabel.interest': 'Interesse',
  'capm.ilabel.offer_request': 'Angebotsanfrage',
  'capm.ilabel.question': 'Frage',
  'capm.ilabel.save': 'Gespeichert',
  'capm.ilabel.requisition_link': 'Verknuepfung',
  'capm.ilabel.deal_start': 'Deal',
  'capm.ilabel.contact': 'Kontakt',
  'capm.ilabel.deal_accept': 'Konditionen zugestimmt',
  'capm.ilabel.deal_negotiate': 'Verhandlungsanfrage',
  'capm.ilabel.emergency_commit': 'Notdienst-Zusage',

  'capm.err.ACTION_NOT_ALLOWED_ROLE': 'Ihre Rolle kann diese Aktion hier nicht ausfuehren.',
  'capm.err.SELF_INTERACTION_FORBIDDEN': 'Eigene Eintraege koennen nicht kontaktiert werden.',
  'capm.err.ENTRY_NOT_INTERACTABLE': 'Dieser Eintrag ist aktuell nicht mehr fuer neue Anfragen offen.',
  'capm.err.DEMAND_NOT_INTERACTABLE': 'Dieses Arbeitsplatzangebot ist aktuell nicht mehr fuer neue Rueckmeldungen offen.',
  'capm.err.SUPPLIER_NOT_MATCHED': 'Nur gematchte Anbieter koennen eine Notdienst-Zusage senden.',
  'capm.err.OVERFILL_NOT_ALLOWED': 'Die zugesagte Menge ueberschreitet die offenen Stellen.',
  'capm.err.NOT_EMERGENCY': 'Dieses Arbeitsplatzangebot ist kein Notdienst.',
  'capm.err.NOT_OPEN': 'Der Notdienst ist nicht mehr offen.',
  'capm.err.ALREADY_FULLY_COVERED': 'Das Arbeitsplatzangebot ist bereits vollstaendig besetzt.',
  'capm.err.INVALID_QUANTITY': 'Bitte geben Sie eine gueltige Menge an.',
  'capm.err.AGENCY_ONLY': 'Nur Agenturen koennen eine Notdienst-Zusage senden.',
  'capm.err.NOT_FOUND': 'Der Eintrag wurde nicht gefunden oder ist nicht mehr sichtbar.',
  'capm.err.CAPACITY_UNAVAILABLE': 'Die verfuegbaren Stellen reichen fuer diesen Deal nicht mehr aus.',
  'capm.err.VALIDATION': 'Bitte pruefen Sie Ihre Eingaben und senden Sie erneut.',
  'capm.err.default': 'Die Aktion konnte gerade nicht abgeschlossen werden. Bitte erneut versuchen.',
  'capm.err.generic': 'Fehler',
  'capm.err.selfDeal': 'Eigenes Angebot.',
  'capm.err.notActive': 'Nicht mehr verfuegbar.',
  'capm.err.capacityShort': 'Nicht mehr genuegend freie Stellen.',
  'capm.err.companyOnly': 'Nur Unternehmen.',
  'capm.err.http': 'Fehler: {code}',
  'capm.err.dealSelf': 'Sie koennen nicht mit Ihrem eigenen Angebot handeln.',
  'capm.err.dealNotActive': 'Dieses Angebot ist nicht mehr verfuegbar.',
  'capm.err.dealCapacity': 'Die verfuegbaren Stellen reichen fuer diese Anfrage nicht mehr aus.',
  'capm.err.dealCompanyOnly': 'Nur Unternehmen koennen Deals starten.',
  'capm.err.dealFailed': 'Deal-Aktion fehlgeschlagen.',
  'capm.err.actionFailed': 'Aktion fehlgeschlagen.',
  'capm.err.emergencyFailed': 'Notdienst-Zusage fehlgeschlagen.',
  'capm.err.loadEntry': 'Fehler beim Laden des Eintrags.',
  'capm.err.loadHttp': 'Fehler beim Laden (HTTP {code})',
  'capm.err.notFoundUrl': 'Eintrag nicht gefunden – bitte pruefen Sie die URL.',
  'capm.err.loadFailed': 'Fehler beim Laden.',

  'capm.deal.startedRemaining': 'Deal gestartet — {n} freie Plaetze verbleiben.',
  'capm.deal.startedReserved': 'Deal gestartet — Personalangebot ist jetzt voll reserviert.',
  'capm.deal.startedRef': 'Deal gestartet — Einsatzbestaetigung {ref} erstellt.',
  'capm.deal.toastAccepted': 'Konditionen zugestimmt — Einsatzbestaetigung erstellt',
  'capm.deal.acceptRemaining': 'Einsatzvereinbarung {ref} erstellt. Noch {n} freie Plaetze verbleiben.',
  'capm.deal.acceptReserved': 'Einsatzvereinbarung {ref} erstellt. Das Personalangebot ist jetzt voll reserviert.',
  'capm.deal.acceptDemand': 'Einsatzvereinbarung {ref} erstellt. Das Angebot wurde reserviert.',
  'capm.deal.startedStrong': 'Deal gestartet!',
  'capm.deal.closed': 'Deal abgeschlossen — {text}',
  'capm.deal.toAgreement': 'Zur Einsatzvereinbarung',
  'capm.deal.toastStarted': 'Konditionen zugestimmt — Deal gestartet',
  'capm.deal.negotiationStrong': 'Verhandlung gestartet!',
  'capm.deal.negotiationText': 'Ihre Anpassungswuensche wurden an die Gegenseite uebermittelt.',
  'capm.deal.negotiationStatus': 'Verhandlung gestartet — die Gegenseite wurde informiert.',
  'capm.deal.toNegotiation': 'Zum Verhandlungsvorgang',
  'capm.deal.toastNegotiation': 'Verhandlungsanfrage gesendet',

  'capm.em.supplyOnly': 'Notdienst-Zusagen sind nur fuer Arbeitsplatzangebote verfuegbar.',
  'capm.em.needQty': 'Bitte geben Sie die zugesagte Menge an.',
  'capm.em.sending': 'Notdienst-Zusage wird uebermittelt…',
  'capm.em.registeredOpen': 'Notdienst-Zusage registriert — noch {n} offen.',
  'capm.em.registeredFull': 'Notdienst-Zusage registriert — Angebot besetzt.',
  'capm.em.registered': 'Notdienst-Zusage registriert.',
  'capm.em.toast': 'Notdienst-Zusage gesendet',

  'capm.toast.documented': 'Vorgang dokumentiert: {text}',
  'capm.toast.interactionSent': 'Interaktion erfolgreich gesendet',
  'capm.toast.linkCopied': 'Link kopiert',

  'capm.status.draft': 'Entwurf',
  'capm.status.active': 'Aktiv',
  'capm.status.reserved': 'Reserviert',
  'capm.status.paused': 'Pausiert',
  'capm.status.expired': 'Abgelaufen',
  'capm.status.filled': 'Besetzt',
  'capm.status.archived': 'Archiviert',
  'capm.status.open': 'Offen',
  'capm.status.partially_covered': 'Teilweise gedeckt',
  'capm.status.fulfilled': 'Erfuellt',
  'capm.status.closed': 'Geschlossen',
  'capm.status.validUntil': 'Gueltig bis: {date}',

  'capm.shift.day': 'Tagschicht',
  'capm.shift.night': 'Nachtschicht',
  'capm.shift.rotating': 'Wechselschicht',
  'capm.shift.flexible': 'Flexibel',
  'capm.shift.weekend': 'Wochenende',
  'capm.shift.on_call': 'Bereitschaft',

  'capm.emp.temporary': 'ANUe',
  'capm.emp.contract': 'Werkvertrag',
  'capm.emp.temp_to_perm': 'Temp-to-Perm',
  'capm.emp.project': 'Projekt',
  'capm.emp.on_call': 'Abruf',

  'capm.avail.immediate': 'Sofort (heute oder morgen)',
  'capm.avail.scheduled': 'Geplant',
  'capm.avail.flexible': 'Flexibel',

  'capm.comp.unknown': 'Unbekannt',
  'capm.comp.pending': 'In Pruefung',
  'capm.comp.partial': 'Teilweise',
  'capm.comp.complete': 'Vollstaendig',

  'capm.fresh.unconfirmed': 'Nicht bestaetigt',
  'capm.fresh.current': 'Aktuell',
  'capm.fresh.aging': 'Altert',
  'capm.fresh.stale': 'Veraltet',

  'capm.trust.none': 'Keine Signale',
  'capm.trust.successRate': '{pct}% Zuverlässigkeit',
  'capm.trust.successRateTitle': 'Anteil eingehaltener verbindlicher Zusagen der letzten 12 Monate. Stornos weniger als 48 Stunden vor Beginn zählen doppelt, ab 14 Tagen Vorlauf gar nicht. Kundenabsagen und Krankmeldungen zählen nicht gegen die Zeitarbeitsfirma. Sichtbar ab 5 Abschlüssen.',
  'capm.trust.responseTime': '{label} Antwortzeit',
  'capm.trust.verified': 'Verifiziert',
  'capm.trust.verifiedTitle': 'Mindestens ein Nachweis wurde verifiziert',
  'capm.trust.compliance': 'Compliance vollst.',
  'capm.trust.complianceTitle': 'Alle Compliance-Dokumente sind verifiziert und gueltig',
  'capm.trust.subscriber': 'Aktiver Abonnent',
  'capm.trust.subscriberTitle': 'Nutzer hat einen aktiven kostenpflichtigen Tarif',
  'capm.trust.deals': '{n} Deals',
  'capm.trust.dealsTitle': 'Anzahl erfolgreich abgeschlossener Deals auf der Plattform',
  'capm.trust.recent': 'Kuerzlich bestaetigt',
  'capm.trust.recentTitle': 'Das Personalangebot wurde in den letzten 48 Stunden als aktuell bestaetigt',
  'capm.trust.profile': 'Profil {pct}%',
  'capm.trust.profileTitle': 'Wie vollstaendig das Firmenprofil ausgefuellt ist',

  'capm.ds.orgTitle': 'Anfragende Organisation',
  'capm.ds.urgencyNormal': 'Normal',
  'capm.ds.urgencyNotdienst': 'Notdienst',
  'capm.ds.urgencyCritical': 'Kritisch',
  'capm.ds.urgencyUrgent': 'Dringend',
  'capm.ds.urgencyPrioritized': 'Priorisiert',
  'capm.ds.urgencyTitle': 'Dringlichkeit des Arbeitsplatzangebots',
  'capm.ds.startTitle': 'Gewuenschter Starttermin',
  'capm.ds.start': 'Start {date}',
  'capm.ds.budgetTitle': 'Budgetrahmen des Arbeitsplatzangebots',
  'capm.ds.headcountTitle': 'Angefragter Umfang',
  'capm.ds.headcount': '{n} Personen',
  'capm.ds.createdTitle': 'Erstellungsdatum',
  'capm.ds.created': 'erstellt {date}',
  'capm.ds.fallback': 'Angebotsdaten verfuegbar',

  'capm.type.demand': 'Nachfrage',
  'capm.type.supply': 'Angebot',
  'capm.hdr.edit': 'Bearbeiten',
  'capm.hdr.toList': 'Zur Liste',
  'capm.hdr.backToFeed': 'Zurueck zur Boerse',
  'capm.dates.open': '(offen)',
  'capm.compliance.demand': 'Arbeitsplatzangebot',
  'capm.profileCompleteness': 'Profilvollstaendigkeit: {pct}%',
  'capm.save.offer': 'Angebot merken',
  'capm.save.demandTitle': 'Nachfrage merken',
  'capm.save.offerSaved': 'Angebot gemerkt',
  'capm.save.saved': 'Gemerkt',
  'capm.save.staffSaved': 'Personal gemerkt',

  'capm.oa.activate': 'Aktivieren',
  'capm.oa.confirm': 'Aktualitaet bestaetigen',
  'capm.oa.pause': 'Pausieren',
  'capm.oa.reactivate': 'Reaktivieren',
  'capm.oa.fill': 'Als besetzt markieren',
  'capm.oa.archive': 'Archivieren',
  'capm.oa.confirmArchive': 'Archivieren?',
  'capm.oa.done': 'Aktion ausgefuehrt',

  'capm.match.none': 'Keine passenden Anfragen gefunden.',
  'capm.match.request': 'Anfrage',
  'capm.match.score': 'Score {n}',
  'capm.match.unavailable': 'Matching nicht verfuegbar.',
  'capm.inter.none': 'Noch keine Interaktionen.',

  'capm.asset.safetyAlt': 'Sicherheitsbild',
  'capm.asset.galleryAlt': 'Angebotsbild',
  'capm.asset.fullAlt': 'Vollbild',
  'capm.asset.logoAlt': 'Firmenlogo',
  'capm.asset.previewAlt': 'Eintragsvorschau',
  'capm.asset.uploadLogo': 'Logo hochladen',
  'capm.asset.uploadSafety': 'Sicherheitsbild hochladen',
  'capm.asset.uploadGallery': 'Bild hochladen',
  'capm.asset.uploadDoc': 'Dokument hochladen',
  'capm.asset.uploadGeneric': 'Hochladen',
  'capm.asset.uploading': 'Wird hochgeladen…',
  'capm.asset.complianceCard': 'Compliance Card',
  'capm.asset.download': 'Download',
  'capm.asset.document': 'Dokument',
  'capm.asset.validUntil': 'Gueltig bis: {date}',
  'capm.asset.uploaded': 'Datei hochgeladen',
  'capm.asset.uploadFailed': 'Upload fehlgeschlagen',
  'capm.asset.confirmDelete': 'Asset wirklich loeschen?',
  'capm.asset.deleted': 'Asset geloescht',
  'capm.asset.deleteFailed': 'Loeschen fehlgeschlagen'
});

TCi18n.register('en', {
  'capm.paywall.home': 'Home',
  'capm.paywall.title': 'Section not available',
  'capm.paywall.currentPlan': 'Current plan:',
  'capm.paywall.cta': 'View plans',

  'capm.detail.docTitle': 'Staff offer / request – TempConnect',
  'capm.hero.empty': 'No listing image available',
  'capm.hero.badge': 'Listing preview',
  'capm.disclaimer': 'All information without warranty. TempConnect facilitates matching but does not guarantee a successful placement.',

  'capm.sect.workforce': 'Staff offer',
  'capm.sect.workforceHint': '— Which staff is being offered?',
  'capm.sect.demand': 'Job posting',
  'capm.sect.demandHint': '— Which qualifications are required?',
  'capm.sect.timing': 'Period & assignment model',
  'capm.sect.timingHint': '— When and how will the assignment run?',
  'capm.sect.location': 'Location',
  'capm.sect.locationHint': '— Where is the place of work?',
  'capm.sect.qual': 'Qualifications',
  'capm.sect.price': 'Terms',
  'capm.sect.priceHint': '— Pricing and compensation details',
  'capm.sect.safety': 'Safety instructions',
  'capm.sect.gallery': 'Listing images',
  'capm.sect.complianceDocs': 'Compliance documents',
  'capm.sect.matches': 'Matching requests',
  'capm.sect.interactions': 'Incoming interactions',
  'capm.sect.trust': 'Trust signals',
  'capm.sect.trustHint': '— Provider rating',
  'capm.sect.compliance': 'Compliance',
  'capm.sect.complianceHint': '— Proof and document status',
  'capm.sect.quickActions': 'Quick actions',
  'capm.sect.recentlyViewed': 'Recently viewed',
  'capm.sect.ownerActions': 'Actions',

  'capm.field.role': 'Role',
  'capm.field.category': 'Category',
  'capm.field.headcount': 'Headcount',
  'capm.field.skills': 'Skills',
  'capm.field.availability': 'Availability',
  'capm.field.availType': 'Type',
  'capm.field.shift': 'Shift model',
  'capm.field.employment': 'Assignment type',
  'capm.field.cityZip': 'City / postcode',
  'capm.field.radius': 'Travel radius',
  'capm.field.country': 'Country',
  'capm.field.mobility': 'Mobility',
  'capm.field.profile': 'Profile',
  'capm.field.certificates': 'Certificates',
  'capm.field.priceType': 'Price type',
  'capm.field.min': 'Min',
  'capm.field.max': 'Max',
  'capm.field.hint': 'Note',

  'capm.state.loadingMatches': 'Loading matches…',
  'capm.state.loading': 'Loading…',

  'capm.action.save': 'Save',
  'capm.action.saveTitle': 'Save staff offer',
  'capm.action.copyLink': 'Copy link',
  'capm.action.emergencyCommit': 'Send emergency commitment',
  'capm.action.dealAccept': 'Accept terms',
  'capm.action.dealNegotiate': 'Request negotiation',
  'capm.action.ask': 'Ask a question',

  'capm.im.title': 'Send interaction',
  'capm.im.close': 'Close',
  'capm.im.start': 'Preferred start',
  'capm.im.end': 'Preferred end date',
  'capm.im.headcount': 'Headcount / scope',
  'capm.im.headcountPh': 'e.g. 5',
  'capm.im.location': 'Location context',
  'capm.im.locationPh': 'e.g. Stuttgart, 25 km',
  'capm.im.deadline': 'Reply by',
  'capm.im.contactPref': 'Contact preference',
  'capm.im.contactDefault': 'Default via platform',
  'capm.im.contactPlatform': 'Platform message only',
  'capm.im.contactEmail': 'Email preferred',
  'capm.im.contactCall': 'Call back requested',
  'capm.im.priceHeading': 'Price expectation',
  'capm.im.priceMin': 'Min. hourly rate (EUR)',
  'capm.im.priceMinPh': 'e.g. 18.50',
  'capm.im.priceMax': 'Max. hourly rate (EUR)',
  'capm.im.priceMaxPh': 'e.g. 25.00',
  'capm.im.topic': 'Subject / topic',
  'capm.im.topicScope': 'Scope of services',
  'capm.im.topicAvailability': 'Availability',
  'capm.im.topicCompliance': 'Compliance/proofs',
  'capm.im.topicPricing': 'Terms/price range',
  'capm.im.topicOperations': 'Operational process',
  'capm.im.requirements': 'Special requirements',
  'capm.im.requirementsPh': 'e.g. shift, certificates, start window',
  'capm.im.message': 'Message',
  'capm.im.messagePh': 'Short, concrete message with the key facts',
  'capm.im.hint': 'After sending, the other side is notified and the process is documented in the interactions log.',
  'capm.im.cancel': 'Cancel',
  'capm.im.submit': 'Send',
  'capm.im.ref': 'Reference',
  'capm.im.entry': 'Listing',
  'capm.im.na': 'n/a',
  'capm.im.needQuestion': 'Please briefly describe your question.',
  'capm.im.confirmAccept': 'Accept the terms as BINDING now?\n\nThis starts a binding deal on the offered terms. Only confirm if you are sure.',
  'capm.im.preparing': 'Preparing deal…',

  'capm.ag.title': 'Deal started successfully',
  'capm.ag.conditions': 'Agreed terms',
  'capm.ag.loading': 'Loading…',
  'capm.ag.docLoading': 'Loading assignment agreement…',
  'capm.ag.open': 'Open agreement',
  'capm.ag.sheet': 'Terms sheet',
  'capm.ag.toDeal': 'To the deal file & next steps',
  'capm.ag.info1': 'The offer was removed from matching and reserved.',
  'capm.ag.info2': 'The staffing provider was notified by email and in-app.',
  'capm.ag.close': 'Close',
  'capm.ag.refCreated': 'Assignment agreement {ref} created',
  'capm.ag.created': 'Assignment confirmation created',
  'capm.ag.statusDone': 'Deal closed — the other side is being notified.',
  'capm.ag.statusPartial': 'Staff offer partially committed — {n} places still available.',
  'capm.ag.statusReserved': 'Staff offer reserved — no remaining capacity.',
  'capm.ag.gridRole': 'Role',
  'capm.ag.gridCity': 'Location',
  'capm.ag.gridPeople': 'People in the deal',
  'capm.ag.gridPeriod': 'Period',
  'capm.ag.gridRemaining': 'Remaining after deal',
  'capm.ag.gridTotal': 'Positions total',
  'capm.ag.gridPrice': 'Price',
  'capm.ag.docPending': 'The document is finalised after confirmation.',
  'capm.ag.docTitle': 'Assignment agreement',

  'capm.hc.persons': '{n} people',
  'capm.hc.split': '{free} available / {total} total',
  'capm.hc.committed': ' · {n} committed to deals',
  'capm.hc.fullyReserved': 'Fully reserved · 0 of {total} available',
  'capm.hc.freeOf': '{free} of {total} available',

  'capm.cfg.interestTitleSupply': 'Express interest in the offer',
  'capm.cfg.interestTitleDemand': 'Express interest in the job posting',
  'capm.cfg.interestSubSupply': 'Qualified first contact for a possible placement',
  'capm.cfg.interestSubDemand': 'Qualified first contact for the placement',
  'capm.cfg.interestBtn': 'Send interest',
  'capm.cfg.interestNext': 'The other side receives your structured interest and can start the next deal step.',
  'capm.cfg.offerTitleSupply': 'Request an offer',
  'capm.cfg.offerTitleDemand': 'Request availability',
  'capm.cfg.offerSubSupply': 'Request with operational key data instead of free text',
  'capm.cfg.offerSubDemand': 'Prepare a reply with delivery details',
  'capm.cfg.offerBtnSupply': 'Send request',
  'capm.cfg.offerBtnDemand': 'Send query',
  'capm.cfg.offerNext': 'The request is stored with period, scope and context and can move straight into the deal process.',
  'capm.cfg.questionTitle': 'Ask a technical question',
  'capm.cfg.questionSub': 'Contextual question clearly linked to this listing',
  'capm.cfg.questionBtn': 'Send question',
  'capm.cfg.questionNext': 'The question is clearly linked to the listing and traceable for both sides.',
  'capm.cfg.contactTitle': 'Agree on contact',
  'capm.cfg.contactSub': 'Define the communication channel and the next operational step',
  'capm.cfg.contactBtn': 'Send contact request',
  'capm.cfg.contactNext': 'The contact preference is documented so the exchange can start without a media break.',
  'capm.cfg.acceptTitle': 'Accept terms',
  'capm.cfg.acceptSub': 'Signal binding readiness to deal on the offered terms.',
  'capm.cfg.acceptBtn': 'Submit binding acceptance',
  'capm.cfg.acceptNext': 'The staffing provider is informed immediately. Operational coordination then follows via TempConnect, email or phone.',
  'capm.cfg.negotiateTitle': 'Request negotiation',
  'capm.cfg.negotiateSub': 'Tell the other side which terms should be adjusted.',
  'capm.cfg.negotiateBtn': 'Send negotiation request',
  'capm.cfg.negotiateNext': 'The other side receives a structured negotiation request. The deal stays open until you agree.',
  'capm.cfg.emergencyTitle': 'Send emergency commitment',
  'capm.cfg.emergencySub': 'Fast commitment for an urgent request.',
  'capm.cfg.emergencyBtn': 'Commit to emergency',
  'capm.cfg.emergencyNext': 'Your commitment is documented immediately and sent to the requesting side.',

  'capm.az.title': 'Next steps',
  'capm.az.leadDemand': 'Respond to this job posting.',
  'capm.az.leadSupply': 'Respond to this offer from the staffing provider.',
  'capm.az.leadEmergency': 'Emergency request requiring immediate action.',
  'capm.az.leadEmergencyOpen': ' {n} still open.',
  'capm.az.openCount': '{n} open',
  'capm.az.full': 'full',
  'capm.az.roleBlocked': 'Direct interaction is not intended here for your role.',
  'capm.az.toDeal': 'To the deal',

  'capm.sum.start': 'Start',
  'capm.sum.end': 'End',
  'capm.sum.scope': 'Scope',
  'capm.sum.location': 'Location',
  'capm.sum.deadline': 'Reply by',
  'capm.sum.contact': 'Contact',
  'capm.sum.sent': '{label} sent.',
  'capm.sum.captured': 'Captured: {parts}',
  'capm.sum.contextual': 'Contextual message captured.',
  'capm.sum.fallbackLabel': 'Interaction',

  'capm.ilabel.interest': 'Interest',
  'capm.ilabel.offer_request': 'Offer request',
  'capm.ilabel.question': 'Question',
  'capm.ilabel.save': 'Saved',
  'capm.ilabel.requisition_link': 'Link',
  'capm.ilabel.deal_start': 'Deal',
  'capm.ilabel.contact': 'Contact',
  'capm.ilabel.deal_accept': 'Terms accepted',
  'capm.ilabel.deal_negotiate': 'Negotiation request',
  'capm.ilabel.emergency_commit': 'Emergency commitment',

  'capm.err.ACTION_NOT_ALLOWED_ROLE': 'Your role cannot perform this action here.',
  'capm.err.SELF_INTERACTION_FORBIDDEN': 'You cannot contact your own listings.',
  'capm.err.ENTRY_NOT_INTERACTABLE': 'This listing is no longer open for new requests.',
  'capm.err.DEMAND_NOT_INTERACTABLE': 'This job posting is no longer open for new replies.',
  'capm.err.SUPPLIER_NOT_MATCHED': 'Only matched providers can send an emergency commitment.',
  'capm.err.OVERFILL_NOT_ALLOWED': 'The committed quantity exceeds the open positions.',
  'capm.err.NOT_EMERGENCY': 'This job posting is not an emergency request.',
  'capm.err.NOT_OPEN': 'The emergency request is no longer open.',
  'capm.err.ALREADY_FULLY_COVERED': 'The job posting is already fully staffed.',
  'capm.err.INVALID_QUANTITY': 'Please enter a valid quantity.',
  'capm.err.AGENCY_ONLY': 'Only agencies can send an emergency commitment.',
  'capm.err.NOT_FOUND': 'The listing was not found or is no longer visible.',
  'capm.err.CAPACITY_UNAVAILABLE': 'The available positions are no longer sufficient for this deal.',
  'capm.err.VALIDATION': 'Please check your input and send again.',
  'capm.err.default': 'The action could not be completed just now. Please try again.',
  'capm.err.generic': 'Error',
  'capm.err.selfDeal': 'Your own offer.',
  'capm.err.notActive': 'No longer available.',
  'capm.err.capacityShort': 'Not enough free positions left.',
  'capm.err.companyOnly': 'Companies only.',
  'capm.err.http': 'Error: {code}',
  'capm.err.dealSelf': 'You cannot deal on your own offer.',
  'capm.err.dealNotActive': 'This offer is no longer available.',
  'capm.err.dealCapacity': 'The available positions are no longer sufficient for this request.',
  'capm.err.dealCompanyOnly': 'Only companies can start deals.',
  'capm.err.dealFailed': 'Deal action failed.',
  'capm.err.actionFailed': 'Action failed.',
  'capm.err.emergencyFailed': 'Emergency commitment failed.',
  'capm.err.loadEntry': 'Error loading the listing.',
  'capm.err.loadHttp': 'Error while loading (HTTP {code})',
  'capm.err.notFoundUrl': 'Listing not found – please check the URL.',
  'capm.err.loadFailed': 'Error while loading.',

  'capm.deal.startedRemaining': 'Deal started — {n} places still available.',
  'capm.deal.startedReserved': 'Deal started — the staff offer is now fully reserved.',
  'capm.deal.startedRef': 'Deal started — assignment confirmation {ref} created.',
  'capm.deal.toastAccepted': 'Terms accepted — assignment confirmation created',
  'capm.deal.acceptRemaining': 'Assignment agreement {ref} created. {n} places still available.',
  'capm.deal.acceptReserved': 'Assignment agreement {ref} created. The staff offer is now fully reserved.',
  'capm.deal.acceptDemand': 'Assignment agreement {ref} created. The offer has been reserved.',
  'capm.deal.startedStrong': 'Deal started!',
  'capm.deal.closed': 'Deal closed — {text}',
  'capm.deal.toAgreement': 'To the assignment agreement',
  'capm.deal.toastStarted': 'Terms accepted — deal started',
  'capm.deal.negotiationStrong': 'Negotiation started!',
  'capm.deal.negotiationText': 'Your requested adjustments were sent to the other side.',
  'capm.deal.negotiationStatus': 'Negotiation started — the other side has been informed.',
  'capm.deal.toNegotiation': 'To the negotiation',
  'capm.deal.toastNegotiation': 'Negotiation request sent',

  'capm.em.supplyOnly': 'Emergency commitments are only available for job postings.',
  'capm.em.needQty': 'Please enter the committed quantity.',
  'capm.em.sending': 'Sending emergency commitment…',
  'capm.em.registeredOpen': 'Emergency commitment registered — {n} still open.',
  'capm.em.registeredFull': 'Emergency commitment registered — posting fully staffed.',
  'capm.em.registered': 'Emergency commitment registered.',
  'capm.em.toast': 'Emergency commitment sent',

  'capm.toast.documented': 'Process documented: {text}',
  'capm.toast.interactionSent': 'Interaction sent successfully',
  'capm.toast.linkCopied': 'Link copied',

  'capm.status.draft': 'Draft',
  'capm.status.active': 'Active',
  'capm.status.reserved': 'Reserved',
  'capm.status.paused': 'Paused',
  'capm.status.expired': 'Expired',
  'capm.status.filled': 'Filled',
  'capm.status.archived': 'Archived',
  'capm.status.open': 'Open',
  'capm.status.partially_covered': 'Partially covered',
  'capm.status.fulfilled': 'Fulfilled',
  'capm.status.closed': 'Closed',
  'capm.status.validUntil': 'Valid until: {date}',

  'capm.shift.day': 'Day shift',
  'capm.shift.night': 'Night shift',
  'capm.shift.rotating': 'Rotating shift',
  'capm.shift.flexible': 'Flexible',
  'capm.shift.weekend': 'Weekend',
  'capm.shift.on_call': 'On call',

  'capm.emp.temporary': 'Temporary agency work',
  'capm.emp.contract': 'Service contract',
  'capm.emp.temp_to_perm': 'Temp-to-perm',
  'capm.emp.project': 'Project',
  'capm.emp.on_call': 'On demand',

  'capm.avail.immediate': 'Immediately (today or tomorrow)',
  'capm.avail.scheduled': 'Scheduled',
  'capm.avail.flexible': 'Flexible',

  'capm.comp.unknown': 'Unknown',
  'capm.comp.pending': 'Under review',
  'capm.comp.partial': 'Partial',
  'capm.comp.complete': 'Complete',

  'capm.fresh.unconfirmed': 'Not confirmed',
  'capm.fresh.current': 'Current',
  'capm.fresh.aging': 'Ageing',
  'capm.fresh.stale': 'Outdated',

  'capm.trust.none': 'No signals',
  'capm.trust.successRate': '{pct}% reliability',
  'capm.trust.successRateTitle': 'Share of binding commitments honoured over the last 12 months. Cancellations less than 48 hours before the start count double, those with 14 days notice or more do not count at all. Client cancellations and sick leave are not held against the staffing agency. Shown from 5 closed deals onwards.',
  'capm.trust.responseTime': '{label} response time',
  'capm.trust.verified': 'Verified',
  'capm.trust.verifiedTitle': 'At least one proof has been verified',
  'capm.trust.compliance': 'Compliance complete',
  'capm.trust.complianceTitle': 'All compliance documents are verified and valid',
  'capm.trust.subscriber': 'Active subscriber',
  'capm.trust.subscriberTitle': 'This user holds an active paid plan',
  'capm.trust.deals': '{n} deals',
  'capm.trust.dealsTitle': 'Number of successfully closed deals on the platform',
  'capm.trust.recent': 'Recently confirmed',
  'capm.trust.recentTitle': 'The staff offer was confirmed as current within the last 48 hours',
  'capm.trust.profile': 'Profile {pct}%',
  'capm.trust.profileTitle': 'How complete the company profile is',

  'capm.ds.orgTitle': 'Requesting organisation',
  'capm.ds.urgencyNormal': 'Normal',
  'capm.ds.urgencyNotdienst': 'Emergency',
  'capm.ds.urgencyCritical': 'Critical',
  'capm.ds.urgencyUrgent': 'Urgent',
  'capm.ds.urgencyPrioritized': 'Prioritised',
  'capm.ds.urgencyTitle': 'Urgency of the job posting',
  'capm.ds.startTitle': 'Requested start date',
  'capm.ds.start': 'Start {date}',
  'capm.ds.budgetTitle': 'Budget range of the job posting',
  'capm.ds.headcountTitle': 'Requested scope',
  'capm.ds.headcount': '{n} people',
  'capm.ds.createdTitle': 'Creation date',
  'capm.ds.created': 'created {date}',
  'capm.ds.fallback': 'Listing data available',

  'capm.type.demand': 'Demand',
  'capm.type.supply': 'Offer',
  'capm.hdr.edit': 'Edit',
  'capm.hdr.toList': 'To the list',
  'capm.hdr.backToFeed': 'Back to matching',
  'capm.dates.open': '(open)',
  'capm.compliance.demand': 'Job posting',
  'capm.profileCompleteness': 'Profile completeness: {pct}%',
  'capm.save.offer': 'Save offer',
  'capm.save.demandTitle': 'Save demand',
  'capm.save.offerSaved': 'Offer saved',
  'capm.save.saved': 'Saved',
  'capm.save.staffSaved': 'Staff saved',

  'capm.oa.activate': 'Activate',
  'capm.oa.confirm': 'Confirm as current',
  'capm.oa.pause': 'Pause',
  'capm.oa.reactivate': 'Reactivate',
  'capm.oa.fill': 'Mark as filled',
  'capm.oa.archive': 'Archive',
  'capm.oa.confirmArchive': 'Archive?',
  'capm.oa.done': 'Action completed',

  'capm.match.none': 'No matching requests found.',
  'capm.match.request': 'Request',
  'capm.match.score': 'Score {n}',
  'capm.match.unavailable': 'Matching not available.',
  'capm.inter.none': 'No interactions yet.',

  'capm.asset.safetyAlt': 'Safety image',
  'capm.asset.galleryAlt': 'Listing image',
  'capm.asset.fullAlt': 'Full screen',
  'capm.asset.logoAlt': 'Company logo',
  'capm.asset.previewAlt': 'Listing preview',
  'capm.asset.uploadLogo': 'Upload logo',
  'capm.asset.uploadSafety': 'Upload safety image',
  'capm.asset.uploadGallery': 'Upload image',
  'capm.asset.uploadDoc': 'Upload document',
  'capm.asset.uploadGeneric': 'Upload',
  'capm.asset.uploading': 'Uploading…',
  'capm.asset.complianceCard': 'Compliance card',
  'capm.asset.download': 'Download',
  'capm.asset.document': 'Document',
  'capm.asset.validUntil': 'Valid until: {date}',
  'capm.asset.uploaded': 'File uploaded',
  'capm.asset.uploadFailed': 'Upload failed',
  'capm.asset.confirmDelete': 'Really delete this asset?',
  'capm.asset.deleted': 'Asset deleted',
  'capm.asset.deleteFailed': 'Deletion failed'
});

/** Uebersetzung an der Verwendungsstelle (i18n.js ist im head garantiert da). */
function capmT(key, params) {
  return (window.TCi18n && window.TCi18n.t(key, params)) || '';
}

/** Text setzen UND den Marker mitfuehren, damit ein Sprachwechsel nachzieht.
 *  Nur fuer parameterlose Schluessel — sonst verlaere apply() die Parameter. */
function capmSetText(el, key) {
  if (!el) return;
  el.setAttribute('data-i18n', key);
  el.textContent = capmT(key);
}

/** Parametrisierter Text: kein Marker, sonst wuerde apply() ihn entkernen. */
function capmSetPlain(el, text) {
  if (!el) return;
  el.removeAttribute('data-i18n');
  el.textContent = text;
}

  (function() {
    var API = "/api";
    var t = capmT;
    var params = new URLSearchParams(window.location.search);
    var entryId = params.get("id");
    var isOwner = params.get("owner") === "1";
    var feedType = params.get("type") || "supply";
    var isDemand = feedType === "demand";
    var currentEntry = null;
    var currentIsDemand = isDemand;
    var activeInteractionType = null;
    var viewerRole = null;
    var detailBooted = false;

    if (!entryId) { window.location.href = "/public/capacity_exchange_feed.html"; return; }

    function esc(s) { return s == null ? "" : String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
    function fmtDate(d) { return d ? String(d).substring(0,10) : "—"; }
    function fmtSize(bytes) { if (!bytes) return ""; if (bytes < 1024) return bytes + " B"; if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB"; return (bytes / 1048576).toFixed(1) + " MB"; }
    function toAssetUrl(rawPath) {
      var p = String(rawPath || "");
      if (!p) return "";
      if (p.startsWith("http://") || p.startsWith("https://") || p.startsWith("/")) return p;
      return "/" + p;
    }
    function count(value, fallback) {
      var num = Number(value);
      if (isFinite(num)) return Math.max(0, Math.trunc(num));
      return fallback;
    }
    function entryTotalHeadcount(entry) {
      return Math.max(1, count(entry && entry.headcount, 1));
    }
    function entryRemainingHeadcount(entry) {
      if (!entry) return 1;
      if (entry.remaining_open_count != null) return Math.max(0, count(entry.remaining_open_count, 0));
      if (entry.remaining_headcount != null) return Math.max(0, count(entry.remaining_headcount, 0));
      if (entry.capacity_remaining_headcount != null) return Math.max(0, count(entry.capacity_remaining_headcount, 0));
      return entryTotalHeadcount(entry);
    }
    function entryCommittedHeadcount(entry) {
      if (!entry) return 0;
      if (entry.committed_headcount != null) return Math.max(0, count(entry.committed_headcount, 0));
      if (entry.capacity_committed_headcount != null) return Math.max(0, count(entry.capacity_committed_headcount, 0));
      return 0;
    }
    function normalizeUrgency(value) {
      return String(value || "").toLowerCase();
    }
    function isEmergencyUrgency(value) {
      var u = normalizeUrgency(value);
      return u === "notdienst" || u === "urgent" || u === "critical";
    }
    function demandRemainingOpenCount(entry) {
      if (!entry) return 1;
      if (entry.remaining_open_count != null) return Math.max(0, count(entry.remaining_open_count, 0));
      if (entry.required_total_count != null || entry.currently_committed_count != null) {
        var total = Math.max(1, count(entry.required_total_count || entry.headcount, 1));
        var committed = Math.max(0, count(entry.currently_committed_count, 0));
        return Math.max(total - committed, 0);
      }
      return entryTotalHeadcount(entry);
    }
    function formatSupplyHeadcount(entry) {
      var total = entryTotalHeadcount(entry);
      var remaining = entryRemainingHeadcount(entry);
      var committed = entryCommittedHeadcount(entry);
      if (committed > 0 || remaining !== total || entry.status === "reserved") {
        return t("capm.hc.split", { free: remaining, total: total })
          + (committed > 0 ? t("capm.hc.committed", { n: committed }) : "");
      }
      return t("capm.hc.persons", { n: total });
    }
    function formatStatusCapacityHint(entry) {
      if (!entry || currentIsDemand) return "";
      var total = entryTotalHeadcount(entry);
      var remaining = entryRemainingHeadcount(entry);
      if (entry.status === "reserved") {
        return t("capm.hc.fullyReserved", { total: total });
      }
      if (remaining < total) {
        return t("capm.hc.freeOf", { free: remaining, total: total });
      }
      return "";
    }

    function toast(msg, type) {
      var el = document.getElementById("toast");
      el.textContent = msg;
      el.className = "ds-toast ds-alert ds-alert--" + (type || "info") + " show";
      clearTimeout(el._t);
      el._t = setTimeout(function() { el.classList.remove("show"); }, 3500);
    }

    function getCsrf() {
      return fetch(API + "/csrf", { credentials: "include" }).then(function(r) { return r.ok ? r.json() : {}; });
    }

    function interactionApiPath() {
      return currentIsDemand
        ? ("/marketplace/demand-requests/" + entryId + "/interactions")
        : ("/capacity-exchange/entries/" + entryId + "/interactions");
    }

    function apiFetch(path, opts) {
      opts = opts || {};
      var headers = { "Content-Type": "application/json" };
      if (opts.csrf) headers["X-CSRF-Token"] = opts.csrf;
      if (opts.method && opts.method !== "GET") {
        headers["Idempotency-Key"] = (crypto.randomUUID ? crypto.randomUUID() : "x-" + Math.random().toString(36).slice(2) + "-" + Date.now());
      }
      return fetch(API + path, { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: "include" });
    }

    function getInteractionConfig(type) {
      var supply = !currentIsDemand;
      // Schluessel statt Text: der Modal-Kopf traegt sie als data-i18n weiter,
      // damit ein Sprachwechsel am offenen Dialog sofort greift.
      var map = {
        interest: {
          titleKey: supply ? "capm.cfg.interestTitleSupply" : "capm.cfg.interestTitleDemand",
          subtitleKey: supply ? "capm.cfg.interestSubSupply" : "capm.cfg.interestSubDemand",
          buttonKey: "capm.cfg.interestBtn",
          nextHintKey: "capm.cfg.interestNext"
        },
        offer_request: {
          titleKey: supply ? "capm.cfg.offerTitleSupply" : "capm.cfg.offerTitleDemand",
          subtitleKey: supply ? "capm.cfg.offerSubSupply" : "capm.cfg.offerSubDemand",
          buttonKey: supply ? "capm.cfg.offerBtnSupply" : "capm.cfg.offerBtnDemand",
          nextHintKey: "capm.cfg.offerNext"
        },
        question: {
          titleKey: "capm.cfg.questionTitle",
          subtitleKey: "capm.cfg.questionSub",
          buttonKey: "capm.cfg.questionBtn",
          nextHintKey: "capm.cfg.questionNext"
        },
        contact: {
          titleKey: "capm.cfg.contactTitle",
          subtitleKey: "capm.cfg.contactSub",
          buttonKey: "capm.cfg.contactBtn",
          nextHintKey: "capm.cfg.contactNext"
        },
        deal_accept: {
          titleKey: "capm.cfg.acceptTitle",
          subtitleKey: "capm.cfg.acceptSub",
          buttonKey: "capm.cfg.acceptBtn",
          nextHintKey: "capm.cfg.acceptNext"
        },
        deal_negotiate: {
          titleKey: "capm.cfg.negotiateTitle",
          subtitleKey: "capm.cfg.negotiateSub",
          buttonKey: "capm.cfg.negotiateBtn",
          nextHintKey: "capm.cfg.negotiateNext"
        },
        emergency_commit: {
          titleKey: "capm.cfg.emergencyTitle",
          subtitleKey: "capm.cfg.emergencySub",
          buttonKey: "capm.cfg.emergencyBtn",
          nextHintKey: "capm.cfg.emergencyNext"
        }
      };
      return map[type] || map.question;
    }

    function buildActionZoneCopy() {
      var leadEl = document.getElementById("action-zone-lead");
      var titleEl = document.getElementById("interact-title");
      if (!leadEl) return;
      var isEmergencyDemand = currentIsDemand && currentEntry && isEmergencyUrgency(currentEntry.urgency);
      var remainingOpen = isEmergencyDemand && currentEntry ? demandRemainingOpenCount(currentEntry) : null;
      var emergencyBtn = document.getElementById("btn-emergency-commit");
      var emergencyMeta = document.getElementById("btn-emergency-commit-meta");
      if (emergencyBtn) {
        if (isEmergencyDemand) {
          emergencyBtn.style.display = "inline-flex";
          emergencyBtn.disabled = remainingOpen != null && remainingOpen <= 0;
          if (emergencyMeta) {
            emergencyMeta.textContent = remainingOpen != null
              ? (remainingOpen > 0 ? t("capm.az.openCount", { n: remainingOpen }) : t("capm.az.full"))
              : "";
          }
        } else {
          emergencyBtn.style.display = "none";
        }
      }
      capmSetText(titleEl, "capm.az.title");
      if (currentIsDemand) {
        if (isEmergencyDemand) {
          capmSetPlain(leadEl, t("capm.az.leadEmergency")
            + (remainingOpen != null ? t("capm.az.leadEmergencyOpen", { n: remainingOpen }) : ""));
        } else {
          capmSetText(leadEl, "capm.az.leadDemand");
        }
      } else {
        capmSetText(leadEl, "capm.az.leadSupply");
      }
    }

    // Gegenseitenlogik: CTA nur anzeigen wenn Viewer die richtige Marktseite ist
    function shouldShowActionZone() {
      if (!viewerRole) return true; // Fallback: anzeigen wenn Rolle unbekannt
      if (currentIsDemand) {
        // Demand von Company: nur Agency darf reagieren
        return viewerRole === "agency";
      }
      // Supply von Agency: nur Company darf reagieren
      return viewerRole === "company";
    }

    function canUseActionZone() {
      if (!viewerRole) return true;
      if (viewerRole === "worker" || viewerRole === "admin") return false;
      if (currentIsDemand && viewerRole === "company") return false;
      if (!currentIsDemand && viewerRole === "agency") return false;
      return true;
    }

    /** Sichtbares Label eines Interaktionstyps (UI). Der an die Gegenseite
     *  gesendete Nachrichtentext nutzt bewusst weiter INTERACTION_LABELS. */
    function interactionLabel(type) {
      return t("capm.ilabel." + type) || INTERACTION_LABELS[type] || type;
    }

    function summarizeInteractionPayload(type, payload) {
      var parts = [];
      if (payload.start_date) parts.push(t("capm.sum.start") + ": " + payload.start_date);
      if (payload.end_date) parts.push(t("capm.sum.end") + ": " + payload.end_date);
      if (payload.headcount) parts.push(t("capm.sum.scope") + ": " + payload.headcount);
      if (payload.location_context) parts.push(t("capm.sum.location") + ": " + payload.location_context);
      if (payload.response_deadline) parts.push(t("capm.sum.deadline") + ": " + payload.response_deadline);
      if (payload.contact_preference) parts.push(t("capm.sum.contact") + ": " + payload.contact_preference);
      var prefix = interactionLabel(type) || t("capm.sum.fallbackLabel");
      return t("capm.sum.sent", { label: prefix }) + " "
        + (parts.length ? t("capm.sum.captured", { parts: parts.join(" | ") }) : t("capm.sum.contextual"));
    }

    /* Bewusst deutsch: dieser Text wird als Nachricht an die GEGENSEITE
       gespeichert und dort gelesen. Die Sprache des Empfaengers ist hier
       nicht bekannt — eine Uebersetzung nach Absendersprache waere ein
       Datenfehler, kein UI-Fortschritt. */
    function buildInteractionMessage(type, payload) {
      var lines = [];
      lines.push("[TC-Interaction]");
      lines.push("Typ: " + (INTERACTION_LABELS[type] || type));
      lines.push("Eintrag: " + (currentEntry && currentEntry.title ? currentEntry.title : entryId));
      lines.push("Flow: " + (currentIsDemand ? "Nachfrage" : "Angebot"));
      if (payload.start_date) lines.push("Start: " + payload.start_date);
      if (payload.end_date) lines.push("Ende: " + payload.end_date);
      if (payload.headcount) lines.push("Umfang: " + payload.headcount);
      if (payload.location_context) lines.push("Standort: " + payload.location_context);
      if (payload.response_deadline) lines.push("Rueckmeldung bis: " + payload.response_deadline);
      if (payload.topic) lines.push("Thema: " + payload.topic);
      if (payload.requirements) lines.push("Anforderungen: " + payload.requirements);
      if (payload.contact_preference) lines.push("Kontaktpraeferenz: " + payload.contact_preference);
      if (payload.message) {
        lines.push("Nachricht:");
        lines.push(payload.message);
      }
      lines.push("Naechster Schritt: Kontakt/Deal-Abstimmung ueber TempConnect.");
      return lines.join("\n").substring(0, 2000);
    }

    /* ── Einsatzbestaetigungs-Dokumenten-Modal ───────────────── */
    function showAgreementModal(result) {
      var backdrop = document.getElementById("agreement-modal-backdrop");
      if (!backdrop) return;
      var refEl = document.getElementById("agreement-modal-ref");
      var statusEl = document.getElementById("agreement-modal-status");
      var docEl = document.getElementById("agreement-modal-doc");
      var downloadBtn = document.getElementById("agreement-modal-download");
      var conditionsBtn = document.getElementById("agreement-modal-conditions");
      var dealBtn = document.getElementById("agreement-modal-deal");
      var closeBtn = document.getElementById("agreement-modal-close");
      var condGrid = document.getElementById("agreement-modal-conditions-grid");

      if (refEl) refEl.textContent = result.agreement_ref
        ? t("capm.ag.refCreated", { ref: result.agreement_ref })
        : t("capm.ag.created");
      if (statusEl) {
        var remainingAfterDeal = count(result && result.remaining_headcount, null);
        var statusCopy = t("capm.ag.statusDone");
        if (!currentIsDemand && remainingAfterDeal != null) {
          statusCopy = remainingAfterDeal > 0
            ? t("capm.ag.statusPartial", { n: remainingAfterDeal })
            : t("capm.ag.statusReserved");
        }
        statusEl.innerHTML = '<div class="ds-alert ds-alert--success" style="text-align:center">' + esc(statusCopy) + '</div>';
      }

      // Konditions-Summary inline rendern (aus Entry-Daten)
      if (condGrid && currentEntry) {
        var e = currentEntry;
        var requestedHeadcount = count(result && result.requested_headcount, currentIsDemand ? entryTotalHeadcount(e) : entryRemainingHeadcount(e));
        var gridLabel = 'font-size:10px;color:var(--ds-text-tertiary);text-transform:uppercase';
        var gridHtml = '';
        gridHtml += '<div><div style="' + gridLabel + '">' + esc(t('capm.ag.gridRole')) + '</div><div style="font-weight:700">' + esc(e.role || '\u2014') + '</div></div>';
        gridHtml += '<div><div style="' + gridLabel + '">' + esc(t('capm.ag.gridCity')) + '</div><div style="font-weight:700">' + esc(e.location_city || '\u2014') + '</div></div>';
        gridHtml += '<div><div style="' + gridLabel + '">' + esc(t('capm.ag.gridPeople')) + '</div><div style="font-weight:700">' + requestedHeadcount + '</div></div>';
        gridHtml += '<div><div style="' + gridLabel + '">' + esc(t('capm.ag.gridPeriod')) + '</div><div style="font-weight:700">' + fmtDate(e.availability_from) + (e.availability_to ? ' \u2013 ' + fmtDate(e.availability_to) : '') + '</div></div>';
        if (!currentIsDemand && result && result.remaining_headcount != null) {
          gridHtml += '<div><div style="' + gridLabel + '">' + esc(t('capm.ag.gridRemaining')) + '</div><div style="font-weight:700">' + count(result.remaining_headcount, 0) + '</div></div>';
          gridHtml += '<div><div style="' + gridLabel + '">' + esc(t('capm.ag.gridTotal')) + '</div><div style="font-weight:700">' + entryTotalHeadcount(e) + '</div></div>';
        }
        if (e.price_min || e.price_max) {
          gridHtml += '<div><div style="' + gridLabel + '">' + esc(t('capm.ag.gridPrice')) + '</div><div style="font-weight:700;color:var(--ds-brand)">' + (e.price_min ? e.price_min + ' EUR' : '') + (e.price_max ? ' \u2013 ' + e.price_max + ' EUR' : '') + '</div></div>';
        }
        condGrid.innerHTML = gridHtml;
      }

      // Dokument als iframe laden (kompakte Preview)
      if (docEl && result.document_url) {
        docEl.innerHTML = '<iframe src="' + esc(result.document_url) + '" style="width:100%;height:100%;border:none" title="' + esc(t('capm.ag.docTitle')) + '"></iframe>';
      } else if (docEl) {
        docEl.innerHTML = '<div style="text-align:center;padding:var(--ds-space-6);color:#94a3b8">' + esc(t('capm.ag.docPending')) + '</div>';
      }

      // Aktions-Buttons
      if (downloadBtn && result.document_url) {
        downloadBtn.href = result.document_url;
        downloadBtn.style.display = "inline-flex";
      }
      if (conditionsBtn && result.conditions_url) {
        conditionsBtn.href = result.conditions_url;
        conditionsBtn.style.display = "inline-flex";
      }
      if (dealBtn && result.offer && result.offer.id) {
        dealBtn.href = "/public/offer_detail.html?id=" + result.offer.id;
        dealBtn.style.display = "flex";
      }

      // Modal oeffnen
      backdrop.style.display = "flex";
      backdrop.setAttribute("aria-hidden", "false");
      document.body.classList.add("ce-modal-open");

      // Schliessen-Handler
      function closeAgreementModal() {
        backdrop.style.display = "none";
        backdrop.setAttribute("aria-hidden", "true");
        document.body.classList.remove("ce-modal-open");
      }
      if (closeBtn) closeBtn.onclick = closeAgreementModal;
      backdrop.onclick = function(ev) { if (ev.target === backdrop) closeAgreementModal(); };
    }

    function setActionZoneStatus(text, tone) {
      var el = document.getElementById("action-zone-status");
      if (!el) return;
      el.style.display = "block";
      el.className = "ce-action-status ds-alert ds-alert--" + (tone || "info");
      el.textContent = text;
    }

    // Persistenter "Zum Deal"-Button in der Aktionszone — bleibt nach dem
    // Ergebnis-Modal sichtbar, damit man jederzeit direkt zum Deal kommt.
    function showDealLink(offerId) {
      if (!offerId) return;
      var statusEl = document.getElementById("action-zone-status");
      if (!statusEl) return;
      var link = document.getElementById("action-zone-deal-link");
      if (!link) {
        link = document.createElement("a");
        link.id = "action-zone-deal-link";
        link.className = "ds-btn ds-btn--primary";
        link.style.cssText = "margin-top:10px;display:inline-flex;align-items:center;gap:6px";
        var arrow = document.createTextNode("→ ");
        var linkLabel = document.createElement("span");
        capmSetText(linkLabel, "capm.az.toDeal");
        link.appendChild(arrow);
        link.appendChild(linkLabel);
        statusEl.insertAdjacentElement("afterend", link);
      }
      link.href = "/public/offer_detail.html?id=" + encodeURIComponent(offerId);
      link.style.display = "inline-flex";
    }

    /* Serverseitige Fehlercodes bleiben Rohwerte — nur ihre Erklaerung
       ist uebersetzt (Schluessel capm.err.<CODE>). */
    var INTERACTION_ERROR_CODES = [
      "ACTION_NOT_ALLOWED_ROLE", "SELF_INTERACTION_FORBIDDEN", "ENTRY_NOT_INTERACTABLE",
      "DEMAND_NOT_INTERACTABLE", "SUPPLIER_NOT_MATCHED", "OVERFILL_NOT_ALLOWED",
      "NOT_EMERGENCY", "NOT_OPEN", "ALREADY_FULLY_COVERED", "INVALID_QUANTITY",
      "AGENCY_ONLY", "NOT_FOUND", "CAPACITY_UNAVAILABLE", "VALIDATION"
    ];

    function interactionErrorMessage(code) {
      if (INTERACTION_ERROR_CODES.indexOf(code) >= 0) return t("capm.err." + code);
      return t("capm.err.default");
    }

    function setFieldVisibility(id, visible) {
      var el = document.getElementById(id);
      if (!el) return;
      var wrap = el.closest(".ce-field");
      if (wrap) wrap.style.display = visible ? "" : "none";
    }

    function openInteractionModal(type) {
      activeInteractionType = type;
      var cfg = getInteractionConfig(type);
      var backdrop = document.getElementById("interaction-modal-backdrop");
      var isEmergencyCommit = type === "emergency_commit";
      capmSetText(document.getElementById("interaction-modal-title"), cfg.titleKey);
      capmSetText(document.getElementById("interaction-modal-subtitle"), cfg.subtitleKey);
      capmSetText(document.getElementById("interaction-modal-submit"), cfg.buttonKey);
      capmSetText(document.getElementById("im-next-step-hint"), cfg.nextHintKey);
      document.getElementById("interaction-modal-feedback").style.display = "none";

      var summary = [];
      summary.push(t("capm.im.ref") + ": " + (currentEntry && currentEntry.title ? currentEntry.title : t("capm.im.entry")));
      summary.push(t("capm.field.role") + ": " + (currentEntry && currentEntry.role ? currentEntry.role : t("capm.im.na")));
      summary.push(t("capm.ag.gridCity") + ": " + (currentEntry && currentEntry.location_city ? currentEntry.location_city : t("capm.im.na")));
      capmSetPlain(document.getElementById("interaction-modal-summary"), summary.join(" | "));

      var showTopic = type === "question" || type === "contact";
      document.getElementById("im-topic-wrap").style.display = showTopic ? "block" : "none";
      setFieldVisibility("im-start", !isEmergencyCommit);
      setFieldVisibility("im-end", !isEmergencyCommit);
      setFieldVisibility("im-location", !isEmergencyCommit);
      setFieldVisibility("im-response-deadline", !isEmergencyCommit);
      setFieldVisibility("im-contact-pref", !isEmergencyCommit);
      setFieldVisibility("im-requirements", !isEmergencyCommit);

      // Preis-Felder nur bei Verhandlung einblenden
      var priceWrap = document.getElementById("im-price-wrap");
      if (priceWrap) {
        var showPrice = type === "deal_negotiate";
        priceWrap.style.display = showPrice ? "block" : "none";
        if (showPrice && currentEntry) {
          var pmn = document.getElementById("im-price-min");
          var pmx = document.getElementById("im-price-max");
          if (pmn && currentEntry.price_min != null) pmn.value = currentEntry.price_min;
          if (pmx && currentEntry.price_max != null) pmx.value = currentEntry.price_max;
        }
      }
      document.getElementById("im-start").value = "";
      document.getElementById("im-end").value = "";
      var headcountInput = document.getElementById("im-headcount");
      if (headcountInput) {
        var defaultHeadcount = currentEntry ? (currentIsDemand ? entryTotalHeadcount(currentEntry) : entryRemainingHeadcount(currentEntry)) : "";
        if (isEmergencyCommit && currentIsDemand && currentEntry) {
          var openCount = demandRemainingOpenCount(currentEntry);
          if (openCount > 0) defaultHeadcount = openCount;
          if (openCount > 0) {
            headcountInput.max = String(openCount);
          } else {
            headcountInput.removeAttribute("max");
          }
        } else {
          headcountInput.removeAttribute("max");
        }
        headcountInput.value = defaultHeadcount !== "" ? String(defaultHeadcount) : "";
      }
      document.getElementById("im-location").value = currentEntry && currentEntry.location_city ? currentEntry.location_city : "";
      document.getElementById("im-response-deadline").value = "";
      document.getElementById("im-contact-pref").value = "";
      document.getElementById("im-requirements").value = "";
      document.getElementById("im-message").value = "";

      backdrop.style.display = "flex";
      backdrop.setAttribute("aria-hidden", "false");
      document.body.classList.add("ce-modal-open");
    }

    function closeInteractionModal() {
      var backdrop = document.getElementById("interaction-modal-backdrop");
      backdrop.style.display = "none";
      backdrop.setAttribute("aria-hidden", "true");
      document.body.classList.remove("ce-modal-open");
      activeInteractionType = null;
    }

    function bindInteractionModal() {
      var closeBtn = document.getElementById("interaction-modal-close");
      var cancelBtn = document.getElementById("interaction-modal-cancel");
      var backdrop = document.getElementById("interaction-modal-backdrop");
      closeBtn.addEventListener("click", closeInteractionModal);
      cancelBtn.addEventListener("click", closeInteractionModal);
      backdrop.addEventListener("click", function(ev) {
        if (ev.target === backdrop) closeInteractionModal();
      });
      document.getElementById("interaction-modal-form").addEventListener("submit", function(ev) {
        ev.preventDefault();
        if (!activeInteractionType) return;
        var payload = {
          start_date: document.getElementById("im-start").value || null,
          end_date: document.getElementById("im-end").value || null,
          headcount: document.getElementById("im-headcount").value || null,
          location_context: document.getElementById("im-location").value.trim() || null,
          response_deadline: document.getElementById("im-response-deadline").value || null,
          contact_preference: document.getElementById("im-contact-pref").value || null,
          requirements: document.getElementById("im-requirements").value.trim() || null,
          topic: document.getElementById("im-topic-wrap").style.display === "block" ? (document.getElementById("im-topic").value || null) : null,
          message: document.getElementById("im-message").value.trim() || null,
          // Preis-Felder fuer Verhandlung
          price_min: document.getElementById("im-price-min") ? document.getElementById("im-price-min").value || null : null,
          price_max: document.getElementById("im-price-max") ? document.getElementById("im-price-max").value || null : null
        };
        if (!payload.message && activeInteractionType === "question") {
          var fbReq = document.getElementById("interaction-modal-feedback");
          fbReq.className = "ds-alert ds-alert--warning";
          capmSetPlain(fbReq, t("capm.im.needQuestion"));
          fbReq.style.display = "flex";
          return;
        }
        sendInteraction(activeInteractionType, payload);
      });
      document.querySelectorAll("[data-open-action]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          var action = btn.getAttribute("data-open-action");

          // deal_accept: Direkt API-Call + Dokumenten-Modal
          // Supply: Company -> capacity-posts/accept-deal
          // Demand: Agency -> demand-requests/:id/offers (Offer erstellen) + accept
          if (action === "deal_accept") {
            // Verklick-Schutz: verbindlicher Deal-Start wird vor dem API-Call best\u00e4tigt.
            if (!confirm(t("capm.im.confirmAccept"))) {
              return;
            }
            btn.disabled = true;
            var acceptLabelEl = document.getElementById("btn-deal-accept-label");
            capmSetText(acceptLabelEl || btn, "capm.im.preparing");

            // Route abhaengig von Feed-Typ
            var acceptPath;
            var acceptBody = {};
            if (currentIsDemand) {
              // Agency reagiert auf Company-Demand: Offer erstellen + sofort accepten
              acceptPath = "/marketplace/demand-requests/" + entryId + "/accept-deal";
              acceptBody = {
                price_min: currentEntry && currentEntry.price_min != null ? currentEntry.price_min : null,
                price_max: currentEntry && currentEntry.price_max != null ? currentEntry.price_max : null,
                headcount: currentEntry ? entryTotalHeadcount(currentEntry) : 1
              };
            } else {
              // Company reagiert auf Agency-Supply: capacity-posts/accept-deal
              acceptPath = "/marketplace/capacity-posts/" + entryId + "/accept-deal";
              acceptBody = {
                headcount: currentEntry ? entryRemainingHeadcount(currentEntry) : 1
              };
            }

            getCsrf().then(function(c) {
              return apiFetch(acceptPath, {
                method: "POST", csrf: c.csrfToken || c.token, body: acceptBody
              });
            }).then(function(r) {
              if (!r.ok) return r.json().then(function(d) {
                var msg = d.error === "SELF_DEAL_FORBIDDEN" ? t("capm.err.selfDeal")
                  : d.error === "NOT_ACTIVE" ? t("capm.err.notActive")
                  : d.error === "CAPACITY_UNAVAILABLE" ? t("capm.err.capacityShort")
                  : d.error === "COMPANY_ONLY" ? t("capm.err.companyOnly")
                  : t("capm.err.http", { code: d.error || r.status });
                throw new Error(msg);
              });
              return r.json();
            }).then(function(result) {
              // Erfolg: Dokumenten-Modal oeffnen
              showAgreementModal(result);
              var remainingStatus = result && result.remaining_headcount != null && !currentIsDemand
                ? (count(result.remaining_headcount, 0) > 0
                    ? t("capm.deal.startedRemaining", { n: count(result.remaining_headcount, 0) })
                    : t("capm.deal.startedReserved"))
                : t("capm.deal.startedRef", { ref: result.agreement_ref || "" });
              setActionZoneStatus(remainingStatus, "success");
              if (result && result.offer && result.offer.id) showDealLink(result.offer.id);
              toast(t("capm.deal.toastAccepted"), "success");
              // Deal-Buttons deaktivieren
              document.querySelectorAll('[data-open-action="deal_accept"],[data-open-action="deal_negotiate"]').forEach(function(b) {
                b.disabled = true; b.style.opacity = '.5';
              });
            }).catch(function(e) {
              setActionZoneStatus(e.message || t("capm.err.dealFailed"), "danger");
              toast(e.message || t("capm.err.generic"), "danger");
              btn.disabled = false;
              capmSetText(acceptLabelEl || btn, "capm.action.dealAccept");
            });
            return;
          }

          openInteractionModal(action);
        });
      });
    }

    function sendInteraction(type, payload) {
      var submitBtn = document.getElementById("interaction-modal-submit");
      var fb = document.getElementById("interaction-modal-feedback");
      submitBtn.disabled = true;

      // ── Deal-Routen: accept und negotiate nutzen die echten Deal-APIs ──
      if (type === "deal_accept" || type === "deal_negotiate") {
        var dealPath;
        if (currentIsDemand) {
          dealPath = type === "deal_accept"
            ? "/marketplace/demand-requests/" + entryId + "/accept-deal"
            : "/marketplace/demand-requests/" + entryId + "/negotiate-deal";
        } else {
          dealPath = type === "deal_accept"
            ? "/marketplace/capacity-posts/" + entryId + "/accept-deal"
            : "/marketplace/capacity-posts/" + entryId + "/negotiate-deal";
        }
        var dealBody = {};
        if (type === "deal_negotiate") {
          dealBody.message = (payload && payload.message) || null;
          if (payload && payload.headcount) dealBody.headcount = parseInt(payload.headcount, 10);
          if (payload && payload.start_date) dealBody.start_date = payload.start_date;
          if (payload && payload.end_date) dealBody.end_date = payload.end_date;
          // Preis-Felder fuer strukturierte Verhandlung
          if (payload && payload.price_min) dealBody.price_min = parseFloat(payload.price_min);
          if (payload && payload.price_max) dealBody.price_max = parseFloat(payload.price_max);
          if (payload && payload.price_type) dealBody.price_type = payload.price_type;
        }
        getCsrf().then(function(c) {
          return apiFetch(dealPath, { method: "POST", csrf: c.csrfToken || c.token, body: dealBody });
        }).then(function(r) {
          if (!r.ok) return r.json().then(function(d) {
            var errMsg = d.error === "SELF_DEAL_FORBIDDEN" ? t("capm.err.dealSelf")
              : d.error === "NOT_ACTIVE" ? t("capm.err.dealNotActive")
              : d.error === "CAPACITY_UNAVAILABLE" ? t("capm.err.dealCapacity")
              : d.error === "COMPANY_ONLY" ? t("capm.err.dealCompanyOnly")
              : interactionErrorMessage(d.error || "UNKNOWN");
            throw new Error(errMsg);
          });
          return r.json();
        }).then(function(result) {
          fb.className = "ds-alert ds-alert--success";
          fb.removeAttribute("data-i18n");
          var ref = (result && result.agreement_ref) || '';
          if (type === "deal_accept") {
            var remainingAfterAccept = count(result && result.remaining_headcount, null);
            var acceptText = remainingAfterAccept != null && !currentIsDemand
              ? (remainingAfterAccept > 0
                  ? t('capm.deal.acceptRemaining', { ref: ref, n: remainingAfterAccept })
                  : t('capm.deal.acceptReserved', { ref: ref }))
              : t('capm.deal.acceptDemand', { ref: ref });
            fb.innerHTML = '<strong>' + esc(t('capm.deal.startedStrong')) + '</strong> ' + esc(acceptText);
            setActionZoneStatus(t("capm.deal.closed", { text: acceptText }), "success");
            // Offer-Detail-Seite verlinken
            if (result.offer && result.offer.id) {
              fb.innerHTML += '<br><a href="/public/offer_detail.html?id=' + esc(result.offer.id) + '" class="ds-btn ds-btn--sm" style="margin-top:8px">' + esc(t('capm.deal.toAgreement')) + '</a>';
              showDealLink(result.offer.id);
            }
            toast(t("capm.deal.toastStarted"), "success");
          } else {
            fb.innerHTML = '<strong>' + esc(t('capm.deal.negotiationStrong')) + '</strong> ' + esc(t('capm.deal.negotiationText'));
            setActionZoneStatus(t("capm.deal.negotiationStatus"), "success");
            if (result.offer && result.offer.id) {
              fb.innerHTML += '<br><a href="/public/offer_detail.html?id=' + esc(result.offer.id) + '" class="ds-btn ds-btn--sm" style="margin-top:8px">' + esc(t('capm.deal.toNegotiation')) + '</a>';
            }
            toast(t("capm.deal.toastNegotiation"), "success");
          }
          fb.style.display = "flex";
          // Deal-Buttons deaktivieren nach erfolgreicher Aktion
          document.querySelectorAll('[data-open-action="deal_accept"],[data-open-action="deal_negotiate"]').forEach(function(btn) {
            btn.disabled = true; btn.style.opacity = '.5';
          });
          setTimeout(function() { closeInteractionModal(); }, 1500);
        }).catch(function(e) {
          fb.className = "ds-alert ds-alert--danger";
          capmSetPlain(fb, e.message || t("capm.err.generic"));
          fb.style.display = "flex";
          setActionZoneStatus(e.message || t("capm.err.dealFailed"), "danger");
        }).finally(function() { submitBtn.disabled = false; });
        return;
      }
      if (type === "emergency_commit") {
        if (!currentIsDemand) {
          fb.className = "ds-alert ds-alert--danger";
          capmSetPlain(fb, t("capm.em.supplyOnly"));
          fb.style.display = "flex";
          submitBtn.disabled = false;
          return;
        }
        var qty = payload && payload.headcount ? parseInt(payload.headcount, 10) : 0;
        if (!qty || qty < 1) {
          fb.className = "ds-alert ds-alert--warning";
          capmSetPlain(fb, t("capm.em.needQty"));
          fb.style.display = "flex";
          submitBtn.disabled = false;
          return;
        }
        fb.className = "ds-alert ds-alert--info";
        capmSetPlain(fb, t("capm.em.sending"));
        fb.style.display = "flex";
        getCsrf().then(function(c) {
          return apiFetch("/emergency/" + entryId + "/commitments", {
            method: "POST",
            csrf: c.csrfToken || c.token,
            body: { committed_quantity: qty, note: payload && payload.message ? payload.message : null }
          });
        }).then(function(r) {
          if (!r.ok) return r.json().then(function(d) {
            if (d && d.remaining_open_count != null) {
              var hc = document.getElementById("im-headcount");
              if (hc) {
                hc.max = String(d.remaining_open_count);
                if (parseInt(hc.value, 10) > d.remaining_open_count) hc.value = String(d.remaining_open_count);
              }
            }
            var err = new Error(interactionErrorMessage(d.error || "UNKNOWN"));
            err.code = d.error || "UNKNOWN";
            throw err;
          });
          return r.json();
        }).then(function(result) {
          var coverage = result && result.coverage ? result.coverage : null;
          if (coverage && currentEntry) {
            if (coverage.required_total_count != null) currentEntry.required_total_count = coverage.required_total_count;
            if (coverage.currently_committed_count != null) currentEntry.currently_committed_count = coverage.currently_committed_count;
            if (coverage.remaining_open_count != null) currentEntry.remaining_open_count = coverage.remaining_open_count;
            if (coverage.status) currentEntry.status = coverage.status;
          }
          var remaining = currentEntry ? demandRemainingOpenCount(currentEntry) : null;
          var statusText = remaining != null
            ? (remaining > 0
                ? t("capm.em.registeredOpen", { n: remaining })
                : t("capm.em.registeredFull"))
            : t("capm.em.registered");
          fb.className = "ds-alert ds-alert--success";
          capmSetPlain(fb, statusText);
          fb.style.display = "flex";
          setActionZoneStatus(statusText, "success");
          toast(t("capm.em.toast"), "success");
          buildActionZoneCopy();
          setTimeout(function() { closeInteractionModal(); }, 900);
        }).catch(function(e) {
          fb.className = "ds-alert ds-alert--danger";
          capmSetPlain(fb, e.message || t("capm.err.generic"));
          fb.style.display = "flex";
          setActionZoneStatus(e.message || t("capm.err.emergencyFailed"), "danger");
        }).finally(function() { submitBtn.disabled = false; });
        return;
      }

      // ── Standard-Interaktionen (Interesse, Frage, Kontakt etc.) ──
      var msg = buildInteractionMessage(type, payload || {});
      getCsrf().then(function(c) {
        return apiFetch(interactionApiPath(), {
          method: "POST", csrf: c.csrfToken || c.token,
          body: { interaction_type: type, message: msg || null }
        });
      }).then(function(r) {
        if (!r.ok) return r.json().then(function(d) {
          var err = new Error(interactionErrorMessage(d.error || "UNKNOWN"));
          err.code = d.error || "UNKNOWN";
          throw err;
        });
        return r.json();
      }).then(function() {
        var summaryText = summarizeInteractionPayload(type, payload || {});
        fb.className = "ds-alert ds-alert--success";
        capmSetPlain(fb, summaryText);
        fb.style.display = "flex";
        setActionZoneStatus(t("capm.toast.documented", { text: summaryText }), "success");
        toast(t("capm.toast.interactionSent"), "success");
        setTimeout(function() {
          closeInteractionModal();
        }, 700);
      }).catch(function(e) {
        fb.className = "ds-alert ds-alert--danger";
        capmSetPlain(fb, e.message || t("capm.err.generic"));
        fb.style.display = "flex";
        setActionZoneStatus(e.message || t("capm.err.actionFailed"), "danger");
      }).finally(function() { submitBtn.disabled = false; });
    }

    /* Rohwerte bleiben Schluessel (Server-Enums) — nur das Label ist uebersetzt. */
    var STATUS_MAP = {
      draft: { css:"ds-badge--neutral" }, active: { css:"ds-badge--success" },
      reserved: { css:"ds-badge--brand" },
      paused: { css:"ds-badge--warning" }, expired: { css:"ds-badge--danger" },
      filled: { css:"ds-badge--accent" }, archived: { css:"ds-badge--neutral" },
      open: { css:"ds-badge--success" }, partially_covered: { css:"ds-badge--warning" }, fulfilled: { css:"ds-badge--accent" }, closed: { css:"ds-badge--neutral" }
    };
    var SHIFT_KEYS = ["day", "night", "rotating", "flexible", "weekend", "on_call"];
    var EMPLOYMENT_KEYS = ["temporary", "contract", "temp_to_perm", "project", "on_call"];
    var AVAIL_KEYS = ["immediate", "scheduled", "flexible"];
    var COMPLIANCE_MAP = { unknown:{ color:"--grey" }, pending:{ color:"--yellow" }, partial:{ color:"--yellow" }, complete:{ color:"--green" } };
    /* Deutsche Fassung fuer den an die Gegenseite gesendeten Nachrichtentext
       (siehe buildInteractionMessage) — die UI nutzt interactionLabel(). */
    var INTERACTION_LABELS = { interest:"Interesse", offer_request:"Angebotsanfrage", question:"Frage", save:"Gespeichert", requisition_link:"Verknuepfung", deal_start:"Deal", contact:"Kontakt", deal_accept:"Konditionen zugestimmt", deal_negotiate:"Verhandlungsanfrage", emergency_commit:"Notdienst-Zusage" };

    function mapLabel(prefix, keys, raw) {
      return keys.indexOf(raw) >= 0 ? t(prefix + raw) : "";
    }

    function freshnessHtml(ts) {
      if (!ts) return '<span class="ce-freshness"><span class="ce-freshness__dot ce-freshness__dot--stale"></span>' + esc(t("capm.fresh.unconfirmed")) + '</span>';
      var h = (Date.now() - new Date(ts).getTime()) / 36e5;
      if (h < 48) return '<span class="ce-freshness"><span class="ce-freshness__dot ce-freshness__dot--fresh"></span>' + esc(t("capm.fresh.current")) + ' – ' + fmtDate(ts) + '</span>';
      if (h < 96) return '<span class="ce-freshness"><span class="ce-freshness__dot ce-freshness__dot--aging"></span>' + esc(t("capm.fresh.aging")) + ' – ' + fmtDate(ts) + '</span>';
      return '<span class="ce-freshness"><span class="ce-freshness__dot ce-freshness__dot--stale"></span>' + esc(t("capm.fresh.stale")) + ' – ' + fmtDate(ts) + '</span>';
    }

    var GRADE_STYLES = {
      PLATINUM: { bg: 'rgba(168,85,247,.12)', color: '#a855f7', icon: '&#9733;' },
      GOLD:     { bg: 'rgba(234,179,8,.12)',   color: '#eab308', icon: '&#9733;' },
      SILVER:   { bg: 'rgba(148,163,184,.12)', color: '#94a3b8', icon: '&#9733;' },
      BRONZE:   { bg: 'rgba(180,83,9,.12)',    color: '#b45309', icon: '&#9733;' }
    };

    function trustBadgesHtml(ts) {
      var noSignals = '<span class="ds-text-sm ds-text-muted">' + esc(t("capm.trust.none")) + '</span>';
      if (!ts) return noSignals;
      var html = "";

      // Reputation badge (primary, prominent)
      if (ts.reputation_score != null && ts.reputation_grade && ts.reputation_grade !== 'UNRATED') {
        var gs = GRADE_STYLES[ts.reputation_grade] || GRADE_STYLES.BRONZE;
        html += '<span class="ds-trust-badge" style="background:' + gs.bg + ';color:' + gs.color + ';font-weight:700;font-size:13px;padding:4px 10px">';
        html += gs.icon + ' ' + Number(ts.reputation_score).toFixed(0) + ' ' + ts.reputation_grade;
        html += '</span>';
      }

      // Zuverlaessigkeitsquote (P8 Welle B) — Feldname bleibt deal_success_rate
      if (ts.deal_success_rate != null) {
        var dsColor = ts.deal_success_rate >= 80 ? 'var(--ds-success)' : ts.deal_success_rate >= 60 ? 'var(--ds-warning)' : 'var(--ds-danger)';
        html += '<span class="ds-trust-badge" style="color:' + dsColor + ';font-weight:600" title="' + esc(t("capm.trust.successRateTitle")) + '">&#10003; ' + esc(t("capm.trust.successRate", { pct: Math.round(ts.deal_success_rate) })) + '</span>';
      }

      // Response time
      if (ts.response_time_label) {
        html += '<span class="ds-trust-badge ds-trust-badge--response">&#9201; ' + esc(t("capm.trust.responseTime", { label: ts.response_time_label })) + '</span>';
      }

      if (ts.supplier_verified) html += '<span class="ds-trust-badge ds-trust-badge--verified" title="' + esc(t("capm.trust.verifiedTitle")) + '">&#10003; ' + esc(t("capm.trust.verified")) + '</span>';
      if (ts.compliance_complete) html += '<span class="ds-trust-badge ds-trust-badge--compliance" title="' + esc(t("capm.trust.complianceTitle")) + '">' + esc(t("capm.trust.compliance")) + '</span>';
      if (ts.active_subscriber) html += '<span class="ds-trust-badge ds-trust-badge--active" title="' + esc(t("capm.trust.subscriberTitle")) + '">' + esc(t("capm.trust.subscriber")) + '</span>';
      if (ts.completed_deals > 0) html += '<span class="ds-trust-badge ds-trust-badge--deals" title="' + esc(t("capm.trust.dealsTitle")) + '">' + esc(t("capm.trust.deals", { n: ts.completed_deals })) + '</span>';
      if (ts.recently_confirmed) html += '<span class="ds-trust-badge ds-trust-badge--response" title="' + esc(t("capm.trust.recentTitle")) + '">' + esc(t("capm.trust.recent")) + '</span>';
      if (ts.profile_completeness != null) {
        var pcVal = ts.profile_completeness > 1 ? Math.round(ts.profile_completeness) : Math.round(ts.profile_completeness * 100);
        html += '<span class="ds-trust-badge" title="' + esc(t("capm.trust.profileTitle")) + '">' + esc(t("capm.trust.profile", { pct: pcVal })) + '</span>';
      }
      return html || noSignals;
    }

    function demandSignalsHtml(e) {
      var html = "";
      if (e.requester_company_name) {
        html += '<span class="ds-trust-badge ds-trust-badge--verified" title="' + esc(t("capm.ds.orgTitle")) + '">&#127970; ' + esc(e.requester_company_name) + "</span>";
      }
      if (e.urgency) {
        var urgencyValue = normalizeUrgency(e.urgency);
        var urgencyLabel = t("capm.ds.urgencyNormal");
        if (urgencyValue === "notdienst") urgencyLabel = t("capm.ds.urgencyNotdienst");
        else if (urgencyValue === "critical") urgencyLabel = t("capm.ds.urgencyCritical");
        else if (urgencyValue === "urgent") urgencyLabel = t("capm.ds.urgencyUrgent");
        else if (urgencyValue === "high" || urgencyValue === "plus") urgencyLabel = t("capm.ds.urgencyPrioritized");
        html += '<span class="ds-trust-badge ds-trust-badge--response" title="' + esc(t("capm.ds.urgencyTitle")) + '">&#9888; ' + esc(urgencyLabel) + "</span>";
      }
      if (e.start_date) {
        html += '<span class="ds-trust-badge" title="' + esc(t("capm.ds.startTitle")) + '">&#128197; ' + esc(t("capm.ds.start", { date: fmtDate(e.start_date) })) + "</span>";
      }
      if (e.budget_min != null || e.budget_max != null) {
        var b = [];
        if (e.budget_min != null) b.push(Number(e.budget_min).toFixed(0));
        if (e.budget_max != null) b.push(Number(e.budget_max).toFixed(0));
        html += '<span class="ds-trust-badge ds-trust-badge--active" title="' + esc(t("capm.ds.budgetTitle")) + '">&#8364; ' + esc(b.join(" - ")) + "</span>";
      }
      if (e.headcount != null) {
        html += '<span class="ds-trust-badge ds-trust-badge--deals" title="' + esc(t("capm.ds.headcountTitle")) + '">&#128101; ' + esc(t("capm.ds.headcount", { n: e.headcount })) + "</span>";
      }
      if (e.created_at) {
        html += '<span class="ds-trust-badge" title="' + esc(t("capm.ds.createdTitle")) + '">&#9201; ' + esc(t("capm.ds.created", { date: fmtDate(e.created_at) })) + "</span>";
      }
      return html || '<span class="ds-text-sm ds-text-muted">' + esc(t("capm.ds.fallback")) + '</span>';
    }

    // Load entry — cascading fallback for robust loading
    var endpoints = [];
    if (isOwner) {
      endpoints.push({ path: "/capacity-exchange/entries/" + entryId, type: "owner" });
      endpoints.push({ path: "/marketplace/demand-requests/" + entryId, type: "demand_owner" });
      endpoints.push({ path: "/capacity-exchange/feed/" + entryId, type: "supply" });
      endpoints.push({ path: "/marketplace/public/demand-requests/" + entryId, type: "demand" });
    } else if (isDemand) {
      endpoints.push({ path: "/marketplace/public/demand-requests/" + entryId, type: "demand" });
      endpoints.push({ path: "/capacity-exchange/feed/" + entryId, type: "supply" });
    } else {
      endpoints.push({ path: "/capacity-exchange/feed/" + entryId, type: "supply" });
      endpoints.push({ path: "/marketplace/public/demand-requests/" + entryId, type: "demand" });
    }

    function tryLoad(idx) {
      if (idx >= endpoints.length) {
        document.getElementById("loading").innerHTML = '<div class="ds-alert ds-alert--danger">' + esc(t("capm.err.notFoundUrl")) + '</div>';
        return Promise.resolve(null);
      }
      return apiFetch(endpoints[idx].path).then(function(r) {
        if (r.status === 401) { window.location.href = "/"; return null; }
        if (r.status === 404 || r.status === 403) return tryLoad(idx + 1);
        if (!r.ok) { toast(t("capm.err.loadHttp", { code: r.status }), "danger"); return null; }
        return r.json().then(function(data) { data._source = endpoints[idx].type; return data; });
      });
    }

    function initDetail() {
    tryLoad(0).then(function(e) {
      if (!e) return;
      currentEntry = e;

      // Adjust isOwner based on actually resolved endpoint
      if (e._source !== "owner" && e._source !== "demand_owner") isOwner = false;
      document.getElementById("loading").style.display = "none";
      document.getElementById("detail").style.display = "block";

      // P12-2: Zuletzt angesehen — save to localStorage
      try {
        var recentKey = "tc_recently_viewed";
        var recent = JSON.parse(localStorage.getItem(recentKey) || "[]");
        recent = recent.filter(function(r) { return r.id !== entryId; });
        recent.unshift({ id: entryId, title: "loading", ts: Date.now() });
        if (recent.length > 10) recent = recent.slice(0, 10);
        localStorage.setItem(recentKey, JSON.stringify(recent));
      } catch(_rvErr) { /* intentional: localStorage may be unavailable */ }
      // Marker entfernen: ab jetzt traegt der Titel den Eintragsnamen, ein
      // spaeterer Sprachwechsel darf ihn nicht wieder generisch ueberschreiben.
      var docTitleEl = document.querySelector("title");
      if (docTitleEl) docTitleEl.removeAttribute("data-i18n");
      document.title = esc(e.title) + " – TempConnect";

      // P12-2: Update recently-viewed with title + render sidebar
      try {
        var rvKey = "tc_recently_viewed";
        var rvList = JSON.parse(localStorage.getItem(rvKey) || "[]");
        if (rvList.length && rvList[0].id === entryId) { rvList[0].title = e.title; rvList[0].city = e.location_city || ""; localStorage.setItem(rvKey, JSON.stringify(rvList)); }
        var rvEl = document.getElementById("d-recently-viewed");
        if (rvEl && rvList.length > 1) {
          var rvH = "";
          rvList.forEach(function(rv, ri) { if (ri === 0) return; rvH += "<a href=\"/public/capacity_exchange_detail.html?id=" + esc(rv.id) + "\" class=\"ds-text-sm\" style=\"display:block;padding:4px 0;color:var(--ds-text-secondary);text-decoration:none\">" + esc(rv.title) + " <span class=\"ds-text-xs ds-text-muted\">" + esc(rv.city || "") + "</span></a>"; });
          if (rvH) { rvEl.innerHTML = rvH; rvEl.parentElement.style.display = "block"; }
        }
      } catch(_rv2) { /* intentional: localStorage may be unavailable */ }

      // Header
      // Auto-detect demand type from response data (not just URL param)
      var detectedDemand = isDemand || e._source === "demand" || (!e.availability_from && !!e.start_date);
      currentIsDemand = detectedDemand;

      // Demand owner has a dedicated, richer detail page. Avoid mixing supply actions/endpoints.
      // This prevents confusing "confirm" actions and capacity-exchange 404s for demand entries.
      if (detectedDemand && isOwner && e._source === "demand_owner") {
        window.location.replace("/public/marketplace_demand_detail.html?id=" + encodeURIComponent(entryId) + "&owner=1");
        return;
      }

      var typeLabelKey = detectedDemand ? "capm.type.demand" : "capm.type.supply";
      var typeBadgeCss = detectedDemand ? "ds-badge--warning" : "ds-badge--success";
      document.getElementById("d-title").innerHTML = esc(e.title) + ' <span class="ds-badge ' + typeBadgeCss + '" style="font-size:12px;vertical-align:middle" data-i18n="' + typeLabelKey + '">' + esc(t(typeLabelKey)) + '</span>';
      // Always normalize fields regardless of URL param
      e.availability_from = e.availability_from || e.start_date;
      e.availability_to = e.availability_to || e.end_date;
      if (e.price_min == null && e.budget_min != null) e.price_min = e.budget_min;
      if (e.price_max == null && e.budget_max != null) e.price_max = e.budget_max;
      if (detectedDemand) {
        // Nur die beiden Text-Knoten tauschen (statt innerHTML): so bleiben
        // die i18n-Marker erhalten und ein Sprachwechsel zieht mit.
        capmSetText(document.getElementById("sect-workforce-label"), "capm.sect.demand");
        capmSetText(document.getElementById("sect-workforce-hint"), "capm.sect.demandHint");
      }
      document.getElementById("d-subtitle").textContent = e.role + (e.worker_category ? " – " + e.worker_category : "") + " – " + (e.location_city || "–");

      // Header actions
      var ha = document.getElementById("d-header-actions");
      if (isOwner) {
        ha.innerHTML = '<a href="/public/capacity_exchange_form.html?id=' + esc(e.id) + '" class="ds-btn" data-i18n="capm.hdr.edit">' + esc(t("capm.hdr.edit")) + '</a><a href="/public/capacity_exchange_manage.html" class="ds-btn ds-btn--ghost" data-i18n="capm.hdr.toList">' + esc(t("capm.hdr.toList")) + '</a>';
      } else {
        ha.innerHTML = '<a href="/public/capacity_exchange_feed.html" class="ds-btn" data-i18n="capm.hdr.backToFeed">' + esc(t("capm.hdr.backToFeed")) + '</a>';
      }

      // Status bar
      var sm = STATUS_MAP[e.status] || { css: "ds-badge--neutral" };
      var smLabel = STATUS_MAP[e.status] ? t("capm.status." + e.status) : e.status;
      var sb = document.getElementById("d-status-bar");
      sb.innerHTML = '<span class="ds-badge ' + sm.css + '">' + esc(smLabel) + '</span>' + freshnessHtml(e.last_confirmed_at);
      var capacityHint = formatStatusCapacityHint(e);
      if (capacityHint) sb.innerHTML += '<span class="ds-text-sm ds-text-muted">' + esc(capacityHint) + '</span>';
      if (e.valid_until) sb.innerHTML += '<span class="ds-text-sm ds-text-muted">' + esc(t("capm.status.validUntil", { date: fmtDate(e.valid_until) })) + '</span>';

      // Workforce fields
      document.getElementById("d-role").textContent = e.role || "–";
      document.getElementById("d-category").textContent = e.worker_category || "–";
      document.getElementById("d-headcount").textContent = detectedDemand ? t("capm.hc.persons", { n: (e.headcount || 1) }) : formatSupplyHeadcount(e);
      document.getElementById("d-skills").textContent = Array.isArray(e.skill_tags) && e.skill_tags.length ? e.skill_tags.join(", ") : "–";

      // Timing
      document.getElementById("d-dates").textContent = fmtDate(e.availability_from) + (e.availability_to ? " – " + fmtDate(e.availability_to) : (" " + t("capm.dates.open")));
      document.getElementById("d-avail-type").textContent = mapLabel("capm.avail.", AVAIL_KEYS, e.availability_type) || e.availability_type || "–";
      document.getElementById("d-shift").textContent = mapLabel("capm.shift.", SHIFT_KEYS, e.shift_model) || e.shift_model || "–";
      var empLabel = mapLabel("capm.emp.", EMPLOYMENT_KEYS, e.employment_type) || e.employment_type || "–";
      document.getElementById("d-employment").innerHTML = esc(empLabel) + (e.employment_type ? ' <span class="ds-badge ds-badge--neutral" style="font-size:11px;vertical-align:middle">' + esc(empLabel) + '</span>' : "");

      // Location
      document.getElementById("d-location").textContent = (e.location_city || "–") + (e.location_postal ? " " + e.location_postal : "");
      document.getElementById("d-radius").textContent = (e.radius_km || 25) + " km";
      document.getElementById("d-country").textContent = e.country || "DE";
      if (e.mobility_notes) {
        document.getElementById("d-mobility-wrap").style.display = "block";
        document.getElementById("d-mobility").textContent = e.mobility_notes;
      }

      // Qualifications
      if (e.qualification_summary || e.certifications_summary) {
        document.getElementById("sect-qual").style.display = "block";
        if (e.qualification_summary) { document.getElementById("d-qual-wrap").style.display = "block"; document.getElementById("d-qualifications").textContent = e.qualification_summary; }
        if (e.certifications_summary) { document.getElementById("d-cert-wrap").style.display = "block"; document.getElementById("d-certifications").textContent = e.certifications_summary; }
      }

      // Commercial
      if (e.price_type || e.price_min != null || e.price_max != null || e.price_hint) {
        document.getElementById("sect-price").style.display = "block";
        var ph = "";
        if (e.price_type) ph += '<div class="ce-field"><div class="ce-field__label" data-i18n="capm.field.priceType">' + esc(t("capm.field.priceType")) + '</div><div class="ce-field__value">' + esc(e.price_type) + '</div></div>';
        if (e.price_min != null) ph += '<div class="ce-field"><div class="ce-field__label" data-i18n="capm.field.min">' + esc(t("capm.field.min")) + '</div><div class="ce-field__value">' + Number(e.price_min).toFixed(2) + ' EUR</div></div>';
        if (e.price_max != null) ph += '<div class="ce-field"><div class="ce-field__label" data-i18n="capm.field.max">' + esc(t("capm.field.max")) + '</div><div class="ce-field__value">' + Number(e.price_max).toFixed(2) + ' EUR</div></div>';
        if (e.price_hint) ph += '<div class="ce-field" style="grid-column:1/-1"><div class="ce-field__label" data-i18n="capm.field.hint">' + esc(t("capm.field.hint")) + '</div><div class="ce-field__value">' + esc(e.price_hint) + '</div></div>';
        document.getElementById("d-price-fields").innerHTML = ph;
      }

      // Trust/Signals sidebar
      if (detectedDemand) {
        document.getElementById("d-trust").innerHTML = demandSignalsHtml(e);
      } else {
        document.getElementById("d-trust").innerHTML = trustBadgesHtml(e.trust_signals);
      }

      // Compliance
      if (detectedDemand) {
        document.getElementById("d-compliance-display").innerHTML = '<span class="ds-traffic-light ds-traffic-light--grey"></span><span data-i18n="capm.compliance.demand">' + esc(t("capm.compliance.demand")) + '</span>';
        document.getElementById("d-completeness").style.display = "none";
      } else {
        var comp = COMPLIANCE_MAP[e.compliance_status] || { color: "--grey" };
        var compLabel = COMPLIANCE_MAP[e.compliance_status] ? t("capm.comp." + e.compliance_status) : "–";
        document.getElementById("d-compliance-display").innerHTML = '<span class="ds-traffic-light ds-traffic-light' + comp.color + '"></span>' + esc(compLabel);

        // Profile completeness bar
        var pc = e.trust_signals && e.trust_signals.profile_completeness;
        if (pc != null) {
          var pct = pc > 1 ? Math.round(pc) : Math.round(pc * 100);
          document.getElementById("d-completeness").style.display = "block";
          document.getElementById("d-completeness-fill").style.width = pct + "%";
          document.getElementById("d-completeness-fill").style.background = pct >= 80 ? "var(--ds-success)" : pct >= 50 ? "var(--ds-warning)" : "var(--ds-danger)";
          document.getElementById("d-completeness-label").textContent = t("capm.profileCompleteness", { pct: pct });
        } else {
          document.getElementById("d-completeness").style.display = "none";
        }
      }

      var interactionEnabled = !isOwner && (e.status === "active" || e.status === "open" || e.status === "partially_covered");

      // Buyer quick actions (save + share)
      if (interactionEnabled) {
        document.getElementById("sect-buyer-actions").style.display = "block";
        var saveBtn = document.getElementById("btn-save-entry");
        var saveBtnLabel = document.getElementById("btn-save-entry-label");
        if (currentIsDemand) {
          capmSetText(saveBtnLabel, "capm.save.offer");
          saveBtn.setAttribute("data-i18n-title", "capm.save.demandTitle");
          saveBtn.title = t("capm.save.demandTitle");
        }
        saveBtn.addEventListener("click", function() {
          var btn = this;
          btn.disabled = true;
          getCsrf().then(function(c) {
            return apiFetch(interactionApiPath(), {
              method: "POST", csrf: c.csrfToken || c.token, body: { interaction_type: "save", message: null }
            });
          }).then(function(r) {
            btn.disabled = false;
            if (r.ok) {
              var savedKey = currentIsDemand ? "capm.save.offerSaved" : "capm.save.saved";
              var titleKey = currentIsDemand ? "capm.save.offerSaved" : "capm.save.staffSaved";
              capmSetText(saveBtnLabel, savedKey);
              btn.setAttribute("data-i18n-title", titleKey);
              btn.title = t(titleKey);
              toast(t(titleKey), "success");
            }
          }).catch(function() { btn.disabled = false; });
        });
        document.getElementById("btn-share-entry").addEventListener("click", function() {
          var url = window.location.href;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function() { toast(t("capm.toast.linkCopied"), "success"); });
          } else {
            var inp = document.createElement("input"); inp.value = url; document.body.appendChild(inp); inp.select(); document.execCommand("copy"); document.body.removeChild(inp);
            toast(t("capm.toast.linkCopied"), "success");
          }
        });
      }

      // Buyer: show interaction panel (nur fuer Gegenseite!)
      if (interactionEnabled && canUseActionZone() && shouldShowActionZone()) {
        document.getElementById("sect-interact").style.display = "block";
        buildActionZoneCopy();

        // Inline Merken-Button
        var inlineSave = document.getElementById("btn-interact-save");
        var inlineSaveLabel = document.getElementById("btn-interact-save-label");
        if (inlineSave) {
          if (currentIsDemand) {
            capmSetText(inlineSaveLabel, "capm.save.offer");
            inlineSave.setAttribute("data-i18n-title", "capm.save.offer");
            inlineSave.title = t("capm.save.offer");
          }
          inlineSave.addEventListener("click", function() {
            inlineSave.disabled = true;
            getCsrf().then(function(c) {
              return apiFetch(interactionApiPath(), { method: "POST", csrf: c.csrfToken || c.token, body: { interaction_type: "save", message: null } });
            }).then(function(r) {
              inlineSave.disabled = false;
              if (r.ok) {
                capmSetText(inlineSaveLabel, currentIsDemand ? "capm.save.offerSaved" : "capm.save.saved");
                toast(t("capm.save.saved"), "success");
              }
            }).catch(function() { inlineSave.disabled = false; });
          });
        }

        // Inline Link-kopieren-Button
        var inlineShare = document.getElementById("btn-interact-share");
        if (inlineShare) {
          inlineShare.addEventListener("click", function() {
            var url = window.location.href;
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(url).then(function() { toast(t("capm.toast.linkCopied"), "success"); });
            } else {
              var inp = document.createElement("input"); inp.value = url; document.body.appendChild(inp); inp.select(); document.execCommand("copy"); document.body.removeChild(inp);
              toast(t("capm.toast.linkCopied"), "success");
            }
          });
        }
      } else if (interactionEnabled && !canUseActionZone()) {
        setActionZoneStatus(t("capm.az.roleBlocked"), "warning");
      }

      // Owner: show actions + matches + interactions
      if (isOwner) {
        showOwnerActions(e);
        loadMatches();
        loadInteractions();
      }

      // Assets laden (Bilder, Dokumente) — fuer alle Nutzer
      loadAssets();
    }).catch(function(err) {
      console.error("[capacity-detail] Ladefehler:", err);
      var msg = t("capm.err.loadEntry");
      if (err && err.message) msg += " (" + err.message + ")";
      document.getElementById("loading").innerHTML = '<div class="ds-alert ds-alert--danger">' + esc(msg) + '</div>';
    });

    function showOwnerActions(e) {
      document.getElementById("sect-owner-actions").style.display = "block";
      var el = document.getElementById("d-owner-actions");
      var h = "", s = e.status;
      function oaBtn(action, cls, extraStyle) {
        var key = "capm.oa." + action;
        return '<button class="' + cls + '" data-oa="' + action + '"' + (extraStyle ? ' style="' + extraStyle + '"' : '')
          + ' data-i18n="' + key + '">' + esc(t(key)) + '</button>';
      }
      if (s === "draft") h += oaBtn("activate", "ds-btn ds-btn--success");
      if (s === "active") h += oaBtn("confirm", "ds-btn");
      if (s === "active") h += oaBtn("pause", "ds-btn ds-btn--ghost");
      if (s === "paused" || s === "expired") h += oaBtn("reactivate", "ds-btn ds-btn--success");
      if (s === "active" || s === "paused") h += oaBtn("fill", "ds-btn ds-btn--ghost");
      if (s !== "archived") h += oaBtn("archive", "ds-btn ds-btn--ghost", "color:var(--ds-text-tertiary)");
      el.innerHTML = h;
      el.querySelectorAll("[data-oa]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          var action = btn.getAttribute("data-oa");
          if (action === "archive" && !confirm(t("capm.oa.confirmArchive"))) return;
          btn.disabled = true;
          getCsrf().then(function(c) {
            return apiFetch("/capacity-exchange/entries/" + entryId + "/" + action, { method: "POST", csrf: c.csrfToken || c.token });
          }).then(function(r) {
            if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || t("capm.err.generic")); });
            toast(t("capm.oa.done"), "success");
            setTimeout(function() { window.location.reload(); }, 800);
          }).catch(function(e) { toast(e.message, "danger"); btn.disabled = false; });
        });
      });
    }

    function loadMatches() {
      document.getElementById("sect-matches").style.display = "block";
      apiFetch("/capacity-exchange/entries/" + entryId + "/matches").then(function(r) { return r.ok ? r.json() : []; }).then(function(matches) {
        var el = document.getElementById("d-matches");
        if (!matches || !matches.length) { el.innerHTML = '<span class="ds-text-sm ds-text-muted" data-i18n="capm.match.none">' + esc(t("capm.match.none")) + '</span>'; return; }
        var h = "";
        matches.forEach(function(m) {
          h += '<div class="ce-match-card"><strong>' + esc(m.title || m.role || t("capm.match.request")) + '</strong>';
          if (m.location_city) h += ' – ' + esc(m.location_city);
          if (m.match_score != null) h += ' <span class="ds-badge ds-badge--brand">' + esc(t("capm.match.score", { n: m.match_score })) + '</span>';
          h += '</div>';
        });
        el.innerHTML = h;
      }).catch(function() {
        document.getElementById("d-matches").innerHTML = '<span class="ds-text-sm ds-text-muted" data-i18n="capm.match.unavailable">' + esc(t("capm.match.unavailable")) + '</span>';
      });
    }

    function loadInteractions() {
      document.getElementById("sect-interactions").style.display = "block";
      apiFetch("/capacity-exchange/entries/" + entryId + "/interactions").then(function(r) { return r.ok ? r.json() : []; }).then(function(items) {
        var el = document.getElementById("d-interactions");
        if (!items || !items.length) { el.innerHTML = '<span class="ds-text-sm ds-text-muted" data-i18n="capm.inter.none">' + esc(t("capm.inter.none")) + '</span>'; return; }
        var h = "";
        items.forEach(function(i) {
          var label = interactionLabel(i.interaction_type);
          h += '<div class="ce-interaction-item"><span class="ds-badge ds-badge--brand" style="margin-right:6px">' + esc(label) + '</span>';
          if (i.message) h += '<span class="ds-text-sm">' + esc(i.message) + '</span>';
          h += '<br><span class="ds-text-xs ds-text-muted">' + fmtDate(i.created_at) + '</span></div>';
        });
        el.innerHTML = h;
      }).catch(function() {
        document.getElementById("d-interactions").innerHTML = '<span class="ds-text-sm ds-text-muted" data-i18n="capm.err.loadFailed">' + esc(t("capm.err.loadFailed")) + '</span>';
      });
    }

    /* ── Offer Assets: Load & Render ─────────────────── */

    function loadAssets() {
      apiFetch("/offer-assets/" + entryId).then(function(r) {
        if (!r.ok) return null;
        return r.json();
      }).then(function(resp) {
        if (!resp || !resp.data) return;
        renderAssets(resp.data);
      }).catch(function(err) {
        console.warn("[assets] Laden fehlgeschlagen:", err);
      });
    }

    function renderAssets(data) {
      var entryLogoFallback = currentEntry && currentEntry.supplier_logo_url ? String(currentEntry.supplier_logo_url) : "";

      // Reset: Sektionen zuruecksetzen um doppelte Anzeige bei Re-Render zu verhindern
      document.getElementById("d-hero-img").style.display = "none";
      document.getElementById("d-hero-img").src = "";
      document.getElementById("d-hero-fallback").style.display = "flex";
      document.getElementById("sect-logo").style.display = "none";
      document.getElementById("d-logo-img").src = "";
      document.getElementById("d-logo-upload").innerHTML = "";
      document.getElementById("sect-safety").style.display = "none";
      document.getElementById("d-safety-images").innerHTML = "";
      document.getElementById("d-safety-upload").innerHTML = "";
      document.getElementById("sect-gallery").style.display = "none";
      document.getElementById("d-gallery-images").innerHTML = "";
      document.getElementById("d-gallery-upload").innerHTML = "";
      document.getElementById("sect-compliance-docs").style.display = "none";
      document.getElementById("d-compliance-docs").innerHTML = "";
      document.getElementById("d-compliance-upload").innerHTML = "";

      // Prominent entry preview: gallery image -> logo asset -> supplier logo -> fallback.
      var heroPath = "";
      if (data.gallery && data.gallery.length && data.gallery[0].file_path) {
        heroPath = data.gallery[0].file_path;
      } else if (data.logo && data.logo.file_path) {
        heroPath = data.logo.file_path;
      } else if (entryLogoFallback) {
        heroPath = entryLogoFallback;
      }
      if (heroPath) {
        var heroImg = document.getElementById("d-hero-img");
        var heroFallback = document.getElementById("d-hero-fallback");
        heroImg.src = toAssetUrl(heroPath);
        heroImg.style.display = "block";
        heroFallback.style.display = "none";
        heroImg.onerror = function() {
          heroImg.style.display = "none";
          heroFallback.style.display = "flex";
        };
      }

      // Logo
      if (data.logo && data.logo.file_path) {
        document.getElementById("sect-logo").style.display = "flex";
        document.getElementById("d-logo-img").src = toAssetUrl(data.logo.file_path);
      } else if (entryLogoFallback) {
        document.getElementById("sect-logo").style.display = "flex";
        document.getElementById("d-logo-img").src = toAssetUrl(entryLogoFallback);
      }
      if (isOwner) {
        var logoUpEl = document.getElementById("d-logo-upload");
        logoUpEl.style.display = "block";
        logoUpEl.innerHTML = '<label class="ds-btn ds-btn--sm ce-upload-btn">' + esc(t("capm.asset.uploadLogo")) + '<input type="file" accept="image/png,image/jpeg,image/webp" data-asset-type="logo"/></label>';
        logoUpEl.querySelector("input").addEventListener("change", function() { uploadAsset("logo", this); });
      }

      // Safety images
      if (data.safety_images && data.safety_images.length) {
        document.getElementById("sect-safety").style.display = "block";
        var sh = "";
        data.safety_images.forEach(function(a) {
          sh += '<img src="/' + esc(a.file_path) + '" alt="' + esc(a.original_name || t('capm.asset.safetyAlt')) + '" data-lightbox/>';
        });
        document.getElementById("d-safety-images").innerHTML = sh;
      }
      if (isOwner) {
        var safeUpEl = document.getElementById("d-safety-upload");
        safeUpEl.style.display = "flex";
        safeUpEl.innerHTML = '<label class="ds-btn ds-btn--sm ce-upload-btn">' + esc(t("capm.asset.uploadSafety")) + '<input type="file" accept="image/png,image/jpeg,image/webp" data-asset-type="safety"/></label>';
        safeUpEl.querySelector("input").addEventListener("change", function() { uploadAsset("safety", this); });
        document.getElementById("sect-safety").style.display = "block";
      }

      // Gallery
      if (data.gallery && data.gallery.length) {
        document.getElementById("sect-gallery").style.display = "block";
        var gh = "";
        data.gallery.forEach(function(a) {
          gh += '<img src="/' + esc(a.file_path) + '" alt="' + esc(a.original_name || t('capm.asset.galleryAlt')) + '" data-lightbox/>';
        });
        document.getElementById("d-gallery-images").innerHTML = gh;
      }
      if (isOwner) {
        var galUpEl = document.getElementById("d-gallery-upload");
        galUpEl.style.display = "flex";
        galUpEl.innerHTML = '<label class="ds-btn ds-btn--sm ce-upload-btn">' + esc(t("capm.asset.uploadGallery")) + '<input type="file" accept="image/png,image/jpeg,image/webp" data-asset-type="gallery"/></label>';
        galUpEl.querySelector("input").addEventListener("change", function() { uploadAsset("gallery", this); });
        document.getElementById("sect-gallery").style.display = "block";
      }

      // Compliance docs
      if (data.compliance_docs && data.compliance_docs.length) {
        document.getElementById("sect-compliance-docs").style.display = "block";
        var ch = "";
        data.compliance_docs.forEach(function(doc) {
          var icon = doc.mime_type === "application/pdf" ? "&#128196;" : "&#128203;";
          var source = doc.source_type === "compliance_card" ? ' <span class="ds-badge ds-badge--neutral" style="font-size:10px">' + esc(t("capm.asset.complianceCard")) + '</span>' : "";
          var statusBadge = "";
          if (doc.compliance_status) {
            var stColor = doc.compliance_status === "verified" ? "ds-badge--success" : "ds-badge--warning";
            statusBadge = ' <span class="ds-badge ' + stColor + '" style="font-size:10px">' + esc(doc.compliance_status) + '</span>';
          }
          var link = doc.file_path ? '<a href="/' + esc(doc.file_path) + '" target="_blank" class="ds-btn ds-btn--sm ds-btn--ghost" style="font-size:11px" data-i18n="capm.asset.download">' + esc(t("capm.asset.download")) + '</a>' : '';
          ch += '<li class="ce-doc-item">';
          ch += '<span class="ce-doc-icon">' + icon + '</span>';
          ch += '<div class="ce-doc-meta"><div class="ce-doc-name">' + esc(doc.original_name || doc.doc_name || t('capm.asset.document')) + source + statusBadge + '</div>';
          if (doc.compliance_doc_type) ch += '<div class="ce-doc-sub">' + esc(doc.compliance_doc_type) + '</div>';
          if (doc.file_size) ch += '<div class="ce-doc-sub">' + fmtSize(doc.file_size) + '</div>';
          if (doc.valid_until) ch += '<div class="ce-doc-sub">' + esc(t("capm.asset.validUntil", { date: fmtDate(doc.valid_until) })) + '</div>';
          ch += '</div>';
          ch += link;
          if (isOwner && doc.source_type !== "compliance_card" && doc.id) {
            ch += '<button class="ds-btn ds-btn--sm ds-btn--ghost" style="color:var(--ds-danger);font-size:11px" data-delete-asset="' + esc(doc.id) + '">&#10005;</button>';
          }
          ch += '</li>';
        });
        document.getElementById("d-compliance-docs").innerHTML = ch;
        // Bind delete buttons
        document.querySelectorAll("[data-delete-asset]").forEach(function(btn) {
          btn.addEventListener("click", function() { deleteAsset(btn.getAttribute("data-delete-asset")); });
        });
      }
      if (isOwner) {
        var compUpEl = document.getElementById("d-compliance-upload");
        compUpEl.style.display = "flex";
        compUpEl.innerHTML = '<label class="ds-btn ds-btn--sm ce-upload-btn">' + esc(t("capm.asset.uploadDoc")) + '<input type="file" accept="image/png,image/jpeg,application/pdf" data-asset-type="compliance"/></label>';
        compUpEl.querySelector("input").addEventListener("change", function() { uploadAsset("compliance", this); });
        document.getElementById("sect-compliance-docs").style.display = "block";
      }

      // Lightbox for images
      document.querySelectorAll("[data-lightbox]").forEach(function(img) {
        img.addEventListener("click", function() {
          var lb = document.createElement("div");
          lb.className = "ce-lightbox";
          lb.innerHTML = '<img src="' + img.src + '" alt="' + esc(t("capm.asset.fullAlt")) + '"/>';
          lb.addEventListener("click", function() { lb.remove(); });
          document.body.appendChild(lb);
        });
      });
    }

    function uploadAsset(assetType, input) {
      if (!input.files || !input.files[0]) return;
      var file = input.files[0];
      var label = input.closest("label");
      if (label) label.textContent = t("capm.asset.uploading");

      getCsrf().then(function(c) {
        var fd = new FormData();
        fd.append("file", file);
        fd.append("asset_type", assetType);
        return fetch(API + "/offer-assets/" + entryId + "/upload", {
          method: "POST",
          headers: { "X-CSRF-Token": c.csrfToken || c.token },
          body: fd,
          credentials: "include"
        });
      }).then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error((d.error && d.error.message) || t("capm.asset.uploadFailed")); });
        return r.json();
      }).then(function() {
        toast(t("capm.asset.uploaded"), "success");
        loadAssets(); // Reload to show new asset
      }).catch(function(err) {
        toast(err.message || t("capm.asset.uploadFailed"), "danger");
      }).finally(function() {
        input.value = "";
        if (label) {
          var labelKeys = { logo: "capm.asset.uploadLogo", safety: "capm.asset.uploadSafety", gallery: "capm.asset.uploadGallery", compliance: "capm.asset.uploadDoc" };
          label.textContent = t(labelKeys[assetType] || "capm.asset.uploadGeneric");
          label.appendChild(input);
        }
      });
    }

    function deleteAsset(assetId) {
      if (!confirm(t("capm.asset.confirmDelete"))) return;
      getCsrf().then(function(c) {
        return apiFetch("/offer-assets/" + assetId, { method: "DELETE", csrf: c.csrfToken || c.token });
      }).then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error((d.error && d.error.message) || t("capm.asset.deleteFailed")); });
        toast(t("capm.asset.deleted"), "success");
        loadAssets();
      }).catch(function(err) {
        toast(err.message || t("capm.asset.deleteFailed"), "danger");
      });
    }
  }
  // Starte erst nach slaGuardPassed
  function startDetailFlow() {
    if (detailBooted) return;
    detailBooted = true;
    apiFetch("/me").then(function(r) {
      return r && r.ok ? r.json() : null;
    }).then(function(me) {
      viewerRole = me && me.role ? me.role : null;
      bindInteractionModal();
      initDetail();
    }).catch(function() {
      bindInteractionModal();
      initDetail();
    });
  }

  document.addEventListener("slaGuardPassed", function(ev) {
    if (ev.detail && ev.detail.passed) {
      startDetailFlow();
    }
  });

  setTimeout(function() {
    if (!currentEntry) startDetailFlow();
  }, 1200);
  })();
