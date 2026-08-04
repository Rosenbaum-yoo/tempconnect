"use strict";

/* ══════════════════════════════════════════════════════════
   i18n (P6.1) — Seiten-Woerterbuch fuer mitarbeiter.html.
   Shell-Texte (Topbar, Navigation, Nutzerbereich) gehoeren pageShell.js,
   rollenabhaengige Begriffe kommen aus terminologyLabels.js — beides wird
   hier bewusst NICHT dupliziert. Diese Datei wird nur von mitarbeiter.html
   geladen, i18n.js steht synchron im head: TCi18n ist hier garantiert da.
   ══════════════════════════════════════════════════════════ */
TCi18n.register('de', {
  'mit.docTitle': 'TempConnect – Mitarbeiter verwalten',

  /* Paywall */
  'mit.paywall.title': 'Bereich nicht verfügbar',
  'mit.paywall.currentPlan': 'Aktueller Plan:',
  'mit.paywall.cta': 'Abo ansehen',

  /* Seitenkopf + Tabs */
  'mit.page.title': 'Mitarbeiter',
  'mit.page.subtitle': 'Workforce-Hub: Personalstammdaten, Skills, Qualifikationen und Einsatzhistorie.',
  'mit.page.selfService': 'Worker Self-Service',
  'mit.page.createCta': '+ Anlegen',
  'mit.tab.list': 'Mitarbeiter',
  'mit.tab.live': 'Live-Belegschaft',
  'mit.tab.skills': 'Profil & Talent Hub',
  'mit.tab.create': 'Manuell anlegen',
  'mit.tab.invite': 'Einladen',
  'mit.tab.invites': 'Einladungen',
  'mit.tab.csv': 'CSV-Import',

  /* Mitarbeiterliste */
  'mit.list.searchPh': 'Suche nach Name, E-Mail, Personalnr...',
  'mit.list.filterAll': 'Alle',
  'mit.list.filterActive': 'Aktiv',
  'mit.list.filterInactive': 'Inaktiv',
  'mit.list.poolOffer': '+ Sammelangebot',
  'mit.list.inviteAll': 'Alle einladen',
  'mit.list.inviteAllTitle': 'Alle noch nicht registrierten Mitarbeiter ins Einsatzportal einladen',
  'mit.list.loading': 'Mitarbeiter werden geladen...',
  'mit.list.emptyNone': 'Noch keine Mitarbeiter angelegt.',
  'mit.list.emptyCta': 'Ersten Mitarbeiter anlegen',
  'mit.list.emptyFiltered': 'Keine Mitarbeiter gefunden.',
  'mit.col.name': 'Name',
  'mit.col.email': 'E-Mail',
  'mit.col.personnelNr': 'Personal-Nr.',
  'mit.col.phone': 'Telefon',
  'mit.col.status': 'Status',
  'mit.col.actions': 'Aktionen',
  'mit.meta.skills': '{count} Skills',
  'mit.meta.qualifications': '{count} Qualifikationen',
  'mit.meta.documents': '{count} Nachweise',
  'mit.meta.expired': '{count} abgelaufen',
  'mit.meta.expiringSoon': '{count} läuft bald ab',
  'mit.meta.nextDeadline': 'nächste Frist {date}',
  'mit.meta.publiclyShared': 'extern freigegeben',
  'mit.status.active': 'Aktiv',
  'mit.status.inactive': 'Inaktiv',
  'mit.reg.registered': 'Registriert',
  'mit.reg.invited': 'Eingeladen',
  'mit.reg.inviteExpired': 'Einladung abgelaufen',
  'mit.reg.notRegistered': 'Nicht registriert',

  /* Aktionen */
  'mit.action.profile': 'Profil',
  'mit.action.edit': 'Bearbeiten',
  'mit.action.offers': 'Angebote',
  'mit.action.invite': 'Einladen',
  'mit.action.inviteTitle': 'Einladung ins Einsatzportal senden',
  'mit.action.deactivate': 'Deaktivieren',
  'mit.action.activate': 'Aktivieren',
  'mit.action.cancel': 'Abbrechen',
  'mit.action.save': 'Speichern',
  'mit.action.back': 'Zurück',
  'mit.action.refresh': 'Aktualisieren',
  'mit.action.add': '+ Hinzufügen',
  'mit.action.resend': 'Erneut senden',
  'mit.action.revoke': 'Widerrufen',
  'mit.action.download': 'Download',
  'mit.action.verify': 'Verifizieren',
  'mit.action.reject': 'Ablehnen',
  'mit.action.delete': 'Löschen',
  'mit.action.creating': 'Erstelle…',

  /* Live-Belegschaft */
  'mit.live.searchPh': 'Mitarbeiter suchen...',
  'mit.live.loading': 'Live-Belegschaft wird geladen...',
  'mit.live.loadError': 'Live-Belegschaft konnte nicht geladen werden.',
  'mit.live.empty': 'Noch keine Mitarbeiter in der Belegschaft.',
  'mit.live.asOf': 'Stand: {time}',
  'mit.live.atClient': 'bei {client}',
  'mit.live.until': 'bis {date}',
  'mit.live.timesheetsBadge': '{count} Stundenzettel',
  'mit.live.status.endingSoon': 'Endet bald',
  'mit.live.status.onAssignment': 'Im Einsatz',
  'mit.live.status.available': 'Verfügbar',
  'mit.live.status.inactive': 'Inaktiv',
  'mit.live.kpi.utilization': 'Auslastung',
  'mit.live.kpi.openTimesheets': 'Stundenzettel offen',
  'mit.live.kpi.workforce': 'Belegschaft',

  /* Anlegen / Einladen */
  'mit.create.title': 'Neuen Mitarbeiter anlegen',
  'mit.create.intro': 'Der Mitarbeiter erhält einen Account und kann sich im Worker Self-Service Portal anmelden.',
  'mit.create.passwordLabel': 'Passwort (min. 8 Zeichen, optional — wird sonst generiert)',
  'mit.create.passwordPh': 'Passwort für den Mitarbeiter',
  'mit.create.submit': 'Mitarbeiter anlegen',
  'mit.invite.title': 'Mitarbeiter per E-Mail einladen',
  'mit.invite.intro': 'Der Mitarbeiter erhält eine E-Mail mit einem Link zur Registrierung im Worker-Portal.',
  'mit.invite.submit': 'Einladung senden',

  /* Formularfelder */
  'mit.field.firstName': 'Vorname',
  'mit.field.lastName': 'Nachname',
  'mit.field.firstNameReq': 'Vorname *',
  'mit.field.lastNameReq': 'Nachname *',
  'mit.field.emailReq': 'E-Mail *',
  'mit.field.personnelNr': 'Personalnummer',
  'mit.field.phone': 'Telefon',
  'mit.field.city': 'Stadt',
  'mit.field.street': 'Straße',
  'mit.field.postal': 'PLZ',
  'mit.field.country': 'Land',
  'mit.field.birthDate': 'Geburtsdatum',
  'mit.field.locale': 'Sprache / Locale',
  'mit.field.notes': 'Notizen',
  'mit.field.internalNotes': 'Interne Notizen',
  'mit.field.availabilityNote': 'Interne Verfügbarkeitsnotiz',
  'mit.field.profileText': 'Kurzprofil / Lebenslauftext',
  'mit.ph.street': 'Musterstr. 1',
  'mit.ph.streetLong': 'Musterstraße 1',
  'mit.ph.availabilityNote': 'z.B. ab nächster Woche im Raum Hamburg verfügbar',
  'mit.ph.profileText': 'Freitext: Erfahrungen, Besonderheiten, Einsatzpräferenzen, fachlicher Werdegang...',
  'mit.ph.internalNotes': 'Nur intern sichtbar',

  /* Profil- & Talent-Hub */
  'mit.hub.title': 'Profil & Talent Hub',
  'mit.hub.intro': 'Der bestehende Worker-Bestand wird hier zum zentralen Mitarbeiterprofil ausgebaut: Stammdaten, Skills, Qualifikationen, interne Einsatzsicht und kontrollierte externe Freigabe in einer Ansicht.',
  'mit.hub.selectWorker': 'Mitarbeiter auswählen...',
  'mit.hub.masterData': 'Stammdaten & internes Profil',
  'mit.hub.emptyTitle': 'Mitarbeiter auswählen',
  'mit.hub.emptyText': 'Wählen Sie oben einen Mitarbeiter aus, um Profil, Skills, Qualifikationen, Einsatzkontext und externe Freigabe zentral zu verwalten.',
  'mit.hub.resetSelection': 'Auswahl zurücksetzen',
  'mit.hub.save': 'Profil-Hub speichern',
  'mit.hub.okSaved': 'Profil-Hub gespeichert!',
  'mit.hub.errLoadProfile': 'Profil konnte nicht geladen werden.',
  'mit.hub.errPublicFields': 'Bitte mindestens ein freigegebenes Feld definieren.',
  'mit.hub.errNoChanges': 'Keine Änderungen zum Speichern erkannt.',
  'mit.hub.badgeCompletion': 'Profil {percent}%',
  'mit.hub.badgePublic': 'extern freigegeben',
  'mit.hub.badgeInternal': 'nur intern',
  'mit.hub.badgeVerified': 'Account verifiziert',
  'mit.hub.badgeUnverified': 'Account nicht verifiziert',
  'mit.hub.statDocuments': 'Nachweise',

  /* Skills */
  'mit.skills.title': 'Skills & Kompetenzen',
  'mit.skills.intro': 'Breiter, einsatz- und matchingorientierter Skill-Katalog für alle typischen Workforce-Szenarien. Zertifikate, Scheine und formale Nachweise bitte weiterhin separat unter Qualifikationen pflegen.',
  'mit.skills.filterPh': 'Skill-Katalog filtern (z.B. Logistik, Schweissen, Office)...',
  'mit.skills.clearAll': 'Auswahl leeren',
  'mit.skills.selected': 'Ausgewählte Skills',
  'mit.skills.extraTitle': 'Zusätzlicher Spezial-Skill',
  'mit.skills.extraPh': 'Skill eingeben (z.B. Schweissen)',
  'mit.skills.extraHint': 'Sonderfälle, kundenspezifische Begriffe und seltene Nischen-Kompetenzen können hier ergänzt werden und bleiben zusammen mit der Checkbox-Auswahl gespeichert.',
  'mit.skills.metaCatalog': '{skills} Katalog-Skills in {groups} Gruppen',
  'mit.skills.metaSelected': '{count} ausgewählt',
  'mit.skills.metaCustom': '{count} individuell ergänzt',
  'mit.skills.metaFilter': 'Filter aktiv: {query}',
  'mit.skills.metaHint': 'Scheine und Nachweise bitte unter Qualifikationen pflegen',
  'mit.skills.groupSelected': '{selected} von {total} gewählt',
  'mit.skills.groupHits': '{count} Treffer',
  'mit.skills.selectGroup': 'Kategorie wählen',
  'mit.skills.clearGroup': 'Leeren',
  'mit.skills.noMatch': 'Keine Katalog-Skills zum aktuellen Filter gefunden.',
  'mit.skills.noMatchHint': 'Nutzen Sie den Freitext unten für seltene oder sehr kundenspezifische Spezialskills.',
  'mit.skills.noneSelected': 'Noch keine Skills ausgewählt.',
  'mit.skills.summary': '{total} Skills ausgewählt · {catalog} aus dem Katalog',
  'mit.skills.summaryCustom': '{count} individuell',
  'mit.skills.emptyHint': 'Noch keine Skills ausgewählt. Wählen Sie passende Einsatzskills aus dem Katalog oder ergänzen Sie individuelle Spezialskills.',
  'mit.skills.customBadge': 'individuell',
  'mit.skills.limit': 'Maximal {max} Skills pro Mitarbeiterprofil.',
  'mit.skills.groupAdded': '{group}: {count} Skills übernommen.',
  'mit.skills.groupCleared': '{group} geleert.',
  'mit.skills.allCleared': 'Skill-Auswahl geleert.',

  /* Skill-Katalog: Gruppentitel und -beschreibungen.
     Die Skill-NAMEN selbst bleiben deutsch — sie sind Datenwerte. */
  'mit.skillgroup.lager_logistik.title': 'Lager & Logistik',
  'mit.skillgroup.lager_logistik.desc': 'Operative Lager-, Versand- und Intralogistik-Kompetenzen.',
  'mit.skillgroup.produktion_montage.title': 'Produktion & Montage',
  'mit.skillgroup.produktion_montage.desc': 'Serienfertigung, Montage und Linienkompetenzen.',
  'mit.skillgroup.metall_industrie.title': 'Metall & Industrie',
  'mit.skillgroup.metall_industrie.desc': 'Technische und industrielle Fertigungskompetenzen.',
  'mit.skillgroup.bau_handwerk.title': 'Bau & Handwerk',
  'mit.skillgroup.bau_handwerk.desc': 'Baunahe, handwerkliche und montageorientierte Fähigkeiten.',
  'mit.skillgroup.transport_fahrdienst.title': 'Transport & Fahrdienst',
  'mit.skillgroup.transport_fahrdienst.desc': 'Fahr-, Touren- und Transportfertigkeiten.',
  'mit.skillgroup.buero_verwaltung.title': 'Büro & Verwaltung',
  'mit.skillgroup.buero_verwaltung.desc': 'Administrative, kaufmännische und koordinative Skills.',
  'mit.skillgroup.handel_service.title': 'Handel & Service',
  'mit.skillgroup.handel_service.desc': 'Vertriebs-, Retail- und serviceorientierte Kompetenzen.',
  'mit.skillgroup.gastro_event.title': 'Gastro & Event',
  'mit.skillgroup.gastro_event.desc': 'Gastgewerbe-, Veranstaltungs- und Front-of-House-Skills.',
  'mit.skillgroup.pflege_soziales.title': 'Pflege & Soziales',
  'mit.skillgroup.pflege_soziales.desc': 'Pflege-, Betreuungs- und sozialnahe Kompetenzen.',
  'mit.skillgroup.facility_reinigung.title': 'Facility & Reinigung',
  'mit.skillgroup.facility_reinigung.desc': 'Gebäude-, Reinigungs- und Betreiberservices.',
  'mit.skillgroup.digital_systeme.title': 'Digital & Systeme',
  'mit.skillgroup.digital_systeme.desc': 'IT-nahe, systemische und prozessunterstützende Skills.',
  'mit.skillgroup.sprachen_kommunikation.title': 'Sprachen & Kommunikation',
  'mit.skillgroup.sprachen_kommunikation.desc': 'Sprachkompetenzen für Einsätze, Kundenkontakt und Teams.',

  /* Qualifikationen */
  'mit.qual.title': 'Qualifikationen & Nachweise',
  'mit.qual.name': 'Bezeichnung',
  'mit.qual.namePh': 'z.B. Staplerschein',
  'mit.qual.issuer': 'Aussteller',
  'mit.qual.issuerPh': 'TÜV / DEKRA / intern',
  'mit.qual.validUntil': 'Gültig bis',
  'mit.qual.document': 'Nachweis / Dokument',
  'mit.qual.documentPh': 'PDF / Scan / Referenz',
  'mit.qual.note': 'Notiz',
  'mit.qual.notePh': 'Optionaler Hinweis',
  'mit.qual.add': '+ Qualifikation hinzufügen',
  'mit.qual.empty': 'Noch keine Qualifikationen eingetragen.',
  'mit.qual.proof': 'Nachweis',
  'mit.qual.linkedDocs': 'Verknüpfte Nachweise',

  /* Nachweisakte */
  'mit.doc.title': 'Nachweisakte & Dokumente',
  'mit.doc.intro': 'Seriöse Personalakten-Sicht: dokumentierte Nachweise, interne Prüfung, Gültigkeiten und Dateiablage direkt am Mitarbeiterprofil.',
  'mit.doc.stored': 'Hinterlegte Nachweise',
  'mit.doc.addTitle': 'Neuen Nachweis hinterlegen',
  'mit.doc.category': 'Kategorie',
  'mit.doc.cat.qualification': 'Qualifikation',
  'mit.doc.cat.identity': 'Identität',
  'mit.doc.cat.permit': 'Erlaubnis',
  'mit.doc.cat.medical': 'Medizin',
  'mit.doc.cat.training': 'Training',
  'mit.doc.cat.other': 'Sonstiges',
  'mit.doc.titleField': 'Titel / Nachweis',
  'mit.doc.titlePh': 'z.B. Staplerschein PDF',
  'mit.doc.linkedQual': 'Verknüpfte Qualifikation',
  'mit.doc.issuerPh': 'DEKRA / TÜV / intern',
  'mit.doc.validFrom': 'Gültig ab',
  'mit.doc.file': 'Datei',
  'mit.doc.note': 'Interne Notiz',
  'mit.doc.notePh': 'Prüfhinweis, Einschränkung, interne Einordnung',
  'mit.doc.upload': 'Nachweis hochladen',
  'mit.doc.uploadHint': 'Erlaubt: PDF, PNG, JPG, WEBP bis 10 MB. Externe Freigabe bleibt davon strikt getrennt.',
  'mit.doc.empty': 'Noch keine Nachweise hinterlegt.',
  'mit.doc.genericDocument': 'Dokument',
  'mit.doc.noFileSize': 'ohne Dateigröße',
  'mit.doc.statTotal': 'Gesamt',
  'mit.doc.statExpiringSoon': 'Läuft bald ab',
  'mit.doc.status.pendingReview': 'In Prüfung',
  'mit.doc.status.verified': 'Verifiziert',
  'mit.doc.status.rejected': 'Abgelehnt',
  'mit.doc.status.archived': 'Archiviert',
  'mit.doc.status.expired': 'Abgelaufen',
  'mit.doc.status.open': 'offen',
  'mit.doc.validFromValue': 'ab {date}',
  'mit.doc.validUntilValue': 'bis {date}',
  'mit.doc.errPickFile': 'Bitte eine Datei auswählen.',
  'mit.doc.errTooLarge': 'Datei ist zu groß (max. 10 MB).',
  'mit.doc.errMime': 'Dateityp nicht erlaubt.',
  'mit.doc.errStore': 'Nachweis konnte nicht gespeichert werden.',
  'mit.doc.okStored': 'Nachweis hinterlegt.',
  'mit.doc.promptVerifyNote': 'Optionale Verifikationsnotiz',
  'mit.doc.okVerified': 'Nachweis verifiziert.',
  'mit.doc.errVerify': 'Nachweis konnte nicht verifiziert werden.',
  'mit.doc.promptRejectReason': 'Bitte Ablehnungsgrund eingeben',
  'mit.doc.errRejectReason': 'Bitte einen Ablehnungsgrund angeben.',
  'mit.doc.okRejected': 'Nachweis abgelehnt.',
  'mit.doc.errReject': 'Nachweis konnte nicht abgelehnt werden.',
  'mit.doc.confirmDelete': 'Nachweis wirklich löschen?',
  'mit.doc.okDeleted': 'Nachweis gelöscht.',
  'mit.doc.errDelete': 'Nachweis konnte nicht gelöscht werden.',

  /* Account & Einsatzportal */
  'mit.linkage.title': 'Account & Einsatzportal',
  'mit.linkage.account': 'Account',
  'mit.linkage.createdAt': 'Angelegt',
  'mit.linkage.portal': 'Portal',
  'mit.linkage.sharing': 'Freigabe',
  'mit.linkage.verified': 'verifiziert',
  'mit.linkage.notVerified': 'nicht verifiziert',
  'mit.linkage.membershipInactive': 'Mitgliedschaft inaktiv',
  'mit.linkage.portalActive': 'Portalzugang aktiv',
  'mit.linkage.sharedExternally': 'Extern freigegeben',
  'mit.linkage.internalOnly': 'Nur intern',
  'mit.linkage.noFields': 'keine Felder',

  /* Operativer Kontext */
  'mit.ops.title': 'Operativer Kontext',
  'mit.ops.assignments': 'Einsätze & Zuweisungen',
  'mit.ops.submissions': 'Submissions / Stundenzettel',
  'mit.ops.activeAssignments': 'Aktive Einsätze',
  'mit.ops.pendingConfirmations': 'Offene Bestätigungen',
  'mit.ops.submitted': 'Submitted',
  'mit.ops.corrections': 'Korrekturen',
  'mit.ops.assignmentsEmpty': 'Noch keine Einsatzverknüpfungen vorhanden.',
  'mit.ops.assignmentFallback': 'Einsatz',
  'mit.ops.submissionsEmpty': 'Noch keine Worker-Submissions vorhanden.',
  'mit.ops.weekRange': 'KW {from} – {to}',
  'mit.ops.hours': '{hours} h',
  'mit.ops.noAssignment': 'ohne Einsatz',
  'mit.asgState.endsToday': 'Endet heute',
  'mit.asgState.completed': 'Beendet',
  'mit.asgState.cancelled': 'Storniert',
  'mit.asgState.archived': 'Archiv',
  'mit.asgState.pendingConfirmation': 'Bestätigung offen',
  'mit.asgState.unavailable': 'Abwesend',

  /* Externe Profilfreigabe */
  'mit.public.title': 'Externe Profilfreigabe',
  'mit.public.intro': 'Kein automatischer Public-Mode: Sichtbar werden ausschließlich die explizit freigegebenen Felder.',
  'mit.public.toggle': 'Profil extern freigeben',
  'mit.public.f.name': 'Name',
  'mit.public.f.nameDesc': 'Vollständiger Name',
  'mit.public.f.city': 'Ort',
  'mit.public.f.cityDesc': 'Nur Stadt, keine genaue Adresse',
  'mit.public.f.skills': 'Skills',
  'mit.public.f.skillsDesc': 'Kompetenzen & Tags',
  'mit.public.f.quals': 'Qualifikationen',
  'mit.public.f.qualsDesc': 'Zertifikate & Nachweise',
  'mit.public.f.profileText': 'Kurzprofil',
  'mit.public.f.profileTextDesc': 'Freigegebener Beschreibungstext',
  'mit.public.f.availability': 'Verfügbarkeit',
  'mit.public.f.availabilityDesc': 'Manuelle interne Freigabenotiz',
  'mit.public.shareLink': 'Share-Link',
  'mit.public.copyLink': 'Link kopieren',
  'mit.public.preview': 'Vorschau öffnen',
  'mit.public.internalOnly': 'Profil ist aktuell rein intern sichtbar.',
  'mit.public.pickAtLeastOne': 'Bitte mindestens ein Feld für die externe Freigabe auswählen.',
  'mit.public.shared': 'Freigegeben: {fields}',
  'mit.public.okCopied': 'Link kopiert.',
  'mit.public.errCopy': 'Link konnte nicht kopiert werden.',
  'mit.public.errNoActiveShare': 'Keine aktive externe Freigabe vorhanden.',

  /* Einladungen */
  'mit.invites.loading': 'Einladungen werden geladen...',
  'mit.invites.loadError': 'Einladungen konnten nicht geladen werden.',
  'mit.invites.empty': 'Noch keine Einladungen gesendet.',
  'mit.inviteStatus.pending': 'Ausstehend',
  'mit.inviteStatus.accepted': 'Angenommen',
  'mit.inviteStatus.revoked': 'Widerrufen',
  'mit.inviteStatus.expired': 'Abgelaufen',

  /* Bearbeiten-Modal */
  'mit.edit.title': 'Mitarbeiter bearbeiten',

  /* Angebotsgenerator */
  'mit.og.submit': 'Ausgewählte Angebote erstellen',
  'mit.og.titleFor': 'Angebote generieren – {name}',
  'mit.og.workerFallback': 'Mitarbeiter',
  'mit.og.loading': 'Vorschläge werden geladen…',
  'mit.og.loadError': 'Konnte Vorschläge nicht laden.',
  'mit.og.noSkills': 'Dieser Mitarbeiter hat noch keine Fähigkeiten hinterlegt. Skills werden im Einsatzportal des Mitarbeiters erfasst – erst dann können Angebote generiert werden.',
  'mit.og.noCity': 'Kein Wohnort hinterlegt. Bitte zuerst unter „Bearbeiten" die Stadt ergänzen – sonst können keine Angebote erstellt werden.',
  'mit.og.summaryA': '{count} Fähigkeiten →',
  'mit.og.summaryB': '{count} neue Angebote möglich',
  'mit.og.summaryExisting': '{count} bereits vorhanden',
  'mit.og.singleTitle': 'Einzelangebote (1 je Fähigkeit)',
  'mit.og.exists': 'vorhanden',
  'mit.og.bundleTitle': 'Gesamtangebot (alle Fähigkeiten gebündelt)',
  'mit.og.bundleLabel': 'Allround-Kraft ({count} Fähigkeiten)',
  'mit.og.tierTitle': 'Angebotsstufe',
  'mit.og.tierStandard': 'Standard',
  'mit.og.tierUrgent': 'Notdienst – höhere Priorität',
  'mit.og.premium': 'Premium – mehr Sichtbarkeit (höheres Ranking)',
  'mit.og.draftHint': 'Angebote werden als Entwurf erstellt. Sichtbar im Marktplatz werden sie erst nach dem Aktivieren in der Kapazitätsbörse.',
  'mit.og.errSelectOne': 'Bitte mindestens ein Angebot auswählen.',
  'mit.og.okCreated': '{count} Angebot(e) als Entwurf erstellt',
  'mit.og.okSkipped': '{count} übersprungen',

  /* Sammelangebot */
  'mit.pool.title': 'Sammelangebot erstellen',
  'mit.pool.intro': 'Bündeln Sie mehrere freie Mitarbeiter mit derselben Fähigkeit in einem Angebot – „N auf einmal anbieten".',
  'mit.pool.skillsLabel': 'Fähigkeiten (eine oder mehrere)',
  'mit.pool.addSkill': 'Fähigkeit hinzufügen…',
  'mit.pool.submit': 'Sammelangebot erstellen',
  'mit.pool.catalogError': 'Fähigkeiten-Katalog konnte nicht geladen werden.',
  'mit.pool.loading': 'Mitarbeiter werden geladen…',
  'mit.pool.loadError': 'Mitarbeiter konnten nicht geladen werden.',
  'mit.pool.emptySingle': 'Kein Mitarbeiter mit dieser Fähigkeit gefunden.',
  'mit.pool.emptyMulti': 'Kein Mitarbeiter mit allen gewählten Fähigkeiten gefunden.',
  'mit.pool.summaryA': '{count} Mitarbeiter mit „{skills}"',
  'mit.pool.summaryFree': '{count} frei',
  'mit.pool.summaryHint': '(frei ist vorausgewählt)',
  'mit.pool.busy': 'im Einsatz',
  'mit.pool.tierUrgent': 'Notdienst',
  'mit.pool.premium': 'Premium – mehr Sichtbarkeit',
  'mit.pool.kindMulti': 'mehrere Fähigkeiten',
  'mit.pool.kindSingle': 'eine Fähigkeit',
  'mit.pool.draftHint': 'Erstellt ein Sammelangebot ({kind}) als Entwurf.',
  'mit.pool.errSelectSkill': 'Bitte mindestens eine Fähigkeit wählen.',
  'mit.pool.errSelectWorker': 'Bitte mindestens einen Mitarbeiter wählen.',
  'mit.pool.okCreated': 'Sammelangebot erstellt ({count} Mitarbeiter, Entwurf).',
  'mit.pool.errNoValidMembers': 'Keine gültigen Mitarbeiter für dieses Angebot.',

  /* CSV-Import */
  'mit.csv.step1': 'Upload',
  'mit.csv.step2': 'Mapping',
  'mit.csv.step3': 'Validierung',
  'mit.csv.step4': 'Import',
  'mit.csv.uploadTitle': 'CSV-Datei hochladen',
  'mit.csv.uploadIntro': 'Wählen Sie eine CSV-Datei mit Ihren Mitarbeiterdaten. Unterstützte Trennzeichen: Komma, Semikolon, Tab.',
  'mit.csv.dropzone': 'CSV-Datei hierher ziehen oder klicken',
  'mit.csv.dropzoneMeta': 'Max. 1000 Datensätze • .csv Format',
  'mit.csv.example': 'Beispiel-CSV',
  'mit.csv.mapTitle': 'Spalten zuordnen',
  'mit.csv.mapIntro': 'Ordnen Sie die CSV-Spalten den TempConnect-Feldern zu. Pflichtfelder sind mit * markiert.',
  'mit.csv.startValidation': 'Validierung starten →',
  'mit.csv.validationTitle': 'Validierung & Vorschau',
  'mit.csv.onDuplicates': 'Bei Duplikaten:',
  'mit.csv.dupSkip': 'Überspringen',
  'mit.csv.dupUpdate': 'Aktualisieren',
  'mit.csv.startImport': 'Import starten',
  'mit.csv.resultTitle': 'Import-Ergebnis',
  'mit.csv.newImport': 'Neuer Import',
  'mit.csv.toList': 'Zur Mitarbeiterliste',
  'mit.csv.colCsv': 'CSV-Spalte',
  'mit.csv.colTarget': 'TempConnect-Feld',
  'mit.csv.sample': 'z.B. {value}',
  'mit.csv.doNotImport': '— Nicht importieren —',
  'mit.csv.errMinRows': 'CSV muss mindestens eine Kopfzeile und eine Datenzeile enthalten.',
  'mit.csv.errMaxRows': 'Max. {max} Datensätze erlaubt ({found} gefunden).',
  'mit.csv.errNotCsv': 'Bitte eine .csv-Datei wählen.',
  'mit.csv.errFileTooLarge': 'Datei zu groß (max. 5 MB).',
  'mit.csv.fileMeta': '{rows} Datensätze · {columns} Spalten',
  'mit.csv.errMissingRequired': 'Pflichtfelder nicht zugeordnet: {fields}',
  'mit.csv.errFieldMissing': '{field} fehlt',
  'mit.csv.errInvalidEmail': 'Ungültige E-Mail',
  'mit.csv.errDuplicateEmail': 'Doppelte E-Mail in CSV (Zeile {row})',
  'mit.csv.kpiTotal': 'Gesamt',
  'mit.csv.kpiValid': 'Gültig',
  'mit.csv.kpiErrors': 'Fehler',
  'mit.csv.kpiDuplicates': 'Duplikate',
  'mit.csv.kpiCreated': 'Erstellt',
  'mit.csv.kpiUpdated': 'Aktualisiert',
  'mit.csv.kpiSkipped': 'Übersprungen',
  'mit.csv.rowDuplicate': 'Duplikat',
  'mit.csv.rowOk': 'OK',
  'mit.csv.importing': 'Importiere...',
  'mit.csv.transferring': 'Daten werden übertragen...',
  'mit.csv.noValidRows': 'Keine gültigen Datensätze zum Importieren.',
  'mit.csv.noValidRowsShort': 'Keine gültigen Datensätze',
  'mit.csv.importingRows': 'Importiere {count} Datensätze...',
  'mit.csv.importDone': 'Import abgeschlossen!',
  'mit.csv.importFailed': 'Import fehlgeschlagen',
  'mit.csv.errorPrefix': 'Fehler: {message}',
  'mit.csv.inviteImportedCta': 'Jetzt alle {count} importierten Mitarbeiter einladen',
  'mit.csv.rowLabel': 'Zeile {row}:',
  'mit.csv.unknownError': 'Unbekannter Fehler',
  'mit.csv.headCreated': 'Erstellt ({count})',
  'mit.csv.headUpdated': 'Aktualisiert ({count})',
  'mit.csv.andMore': '... und {count} weitere',

  /* Meldungen */
  'mit.ok.created': 'Mitarbeiter erfolgreich angelegt!',
  'mit.ok.updated': 'Mitarbeiter aktualisiert!',
  'mit.ok.activated': 'Mitarbeiter aktiviert.',
  'mit.ok.deactivated': 'Mitarbeiter deaktiviert.',
  'mit.ok.inviteSent': 'Einladung erfolgreich gesendet!',
  'mit.ok.inviteSentTo': 'Einladung an {email} gesendet.',
  'mit.ok.inviteResent': 'Einladung erneut gesendet!',
  'mit.ok.inviteRevoked': 'Einladung widerrufen.',
  'mit.ok.allAlreadyInvited': 'Alle Mitarbeiter sind bereits registriert oder eingeladen.',
  'mit.ok.bulkInvited': '{count} eingeladen',
  'mit.ok.bulkMailErrors': '{count} Mail-Fehler',
  'mit.ok.bulkSkipped': '{count} übersprungen',
  'mit.confirm.inviteImported': '{count} importierte Mitarbeiter jetzt ins Einsatzportal einladen? Bereits Eingeladene/Registrierte werden übersprungen.',
  'mit.confirm.inviteUnregistered': '{count} noch nicht registrierte Mitarbeiter einladen? Bereits Registrierte werden übersprungen.',
  'mit.confirm.revokeInvite': 'Einladung wirklich widerrufen?',
  'mit.err.requiredFields': 'Bitte Vorname, Nachname und E-Mail ausfüllen.',
  'mit.err.emailExists': 'Diese E-Mail ist bereits registriert.',
  'mit.err.limitUpgrade': 'Mitarbeiter-Limit erreicht. Bitte Plan upgraden.',
  'mit.err.limitReached': 'Mitarbeiter-Limit erreicht.',
  'mit.err.featureUpgrade': 'Worker-Modul nicht verfügbar. Bitte Plan upgraden (PLUS/PRO).',
  'mit.err.featureUpgradeShort': 'Worker-Modul nicht verfügbar. Bitte Plan upgraden.',
  'mit.err.create': 'Fehler beim Anlegen',
  'mit.err.createFailed': 'Erstellen fehlgeschlagen.',
  'mit.err.save': 'Fehler beim Speichern',
  'mit.err.load': 'Fehler beim Laden',
  'mit.err.generic': 'Fehler',
  'mit.err.noEmailOnWorker': 'Für diesen Mitarbeiter ist keine E-Mail hinterlegt.',
  'mit.err.invitePending': 'Es gibt bereits eine offene Einladung.',
  'mit.err.invitePendingEmail': 'Es gibt bereits eine offene Einladung für diese E-Mail.',
  'mit.err.inviteFailed': 'Einladung fehlgeschlagen.',
  'mit.err.bulkInviteFailed': 'Bulk-Einladung fehlgeschlagen.',
  'mit.err.planLimitUpgrade': 'Plan-Limit erreicht — Upgrade nötig.',

  /* Plan / Upgrade-Banner */
  'mit.plan.individual': 'Individueller Tarif',
  'mit.upgrade.activeWorkers': 'Aktive Worker: {current} / {max}',
  'mit.upgrade.featureTitle': 'Workforce-Hub freischalten',
  'mit.upgrade.featureText': 'Der Workforce-Hub ist ab {plans} verfügbar. Verwalten Sie Mitarbeiterprofile, Skills und Qualifikationen zentral.',
  'mit.upgrade.featureItem1': 'Mitarbeiterprofile und Skill-Katalog',
  'mit.upgrade.featureItem2': 'Qualifikationen, Nachweise und Ablaufdaten',
  'mit.upgrade.featureItem3': 'CSV-Import für schnelle Aktivierung',
  'mit.upgrade.limitTitle': 'Mitarbeiter-Limit erreicht',
  'mit.upgrade.limitText': 'Ihr aktueller Plan stößt beim Workforce-Hub an die Grenze. Erhöhen Sie das Kontingent für aktive Mitarbeiter und Einsätze.',
  'mit.upgrade.limitItem1': 'Mehr aktive Worker und Einsätze',
  'mit.upgrade.limitItem2': 'Skalierbarer CSV-Import und Dokumentenverwaltung',
  'mit.upgrade.limitItem3': 'Zusätzliche Steuerungs- und Reporting-Tiefe',
  'mit.upgrade.currentPlan': 'Aktueller Plan: {plan}',
  'mit.upgrade.ctaIndividual': 'Individuell anfragen',
  'mit.upgrade.ctaStart': 'Upgrade starten',

  /* Werte / Platzhalter */
  'mit.value.unknown': 'Unbekannt',
  'mit.value.unnamed': 'Unbenannt',
  'mit.value.noEmail': 'Keine E-Mail',
  'mit.value.external': 'extern'
});

TCi18n.register('en', {
  'mit.docTitle': 'TempConnect – Manage workers',

  'mit.paywall.title': 'Area not available',
  'mit.paywall.currentPlan': 'Current plan:',
  'mit.paywall.cta': 'View plans',

  'mit.page.title': 'Workers',
  'mit.page.subtitle': 'Workforce hub: worker master data, skills, qualifications and assignment history.',
  'mit.page.selfService': 'Worker self-service',
  'mit.page.createCta': '+ Add',
  'mit.tab.list': 'Workers',
  'mit.tab.live': 'Live workforce',
  'mit.tab.skills': 'Profile & talent hub',
  'mit.tab.create': 'Add manually',
  'mit.tab.invite': 'Invite',
  'mit.tab.invites': 'Invitations',
  'mit.tab.csv': 'CSV import',

  'mit.list.searchPh': 'Search by name, email, staff no...',
  'mit.list.filterAll': 'All',
  'mit.list.filterActive': 'Active',
  'mit.list.filterInactive': 'Inactive',
  'mit.list.poolOffer': '+ Pooled offer',
  'mit.list.inviteAll': 'Invite all',
  'mit.list.inviteAllTitle': 'Invite every worker who has not registered yet to the worker portal',
  'mit.list.loading': 'Loading workers...',
  'mit.list.emptyNone': 'No workers created yet.',
  'mit.list.emptyCta': 'Add your first worker',
  'mit.list.emptyFiltered': 'No workers found.',
  'mit.col.name': 'Name',
  'mit.col.email': 'Email',
  'mit.col.personnelNr': 'Staff no.',
  'mit.col.phone': 'Phone',
  'mit.col.status': 'Status',
  'mit.col.actions': 'Actions',
  'mit.meta.skills': '{count} skills',
  'mit.meta.qualifications': '{count} qualifications',
  'mit.meta.documents': '{count} documents',
  'mit.meta.expired': '{count} expired',
  'mit.meta.expiringSoon': '{count} expiring soon',
  'mit.meta.nextDeadline': 'next deadline {date}',
  'mit.meta.publiclyShared': 'shared externally',
  'mit.status.active': 'Active',
  'mit.status.inactive': 'Inactive',
  'mit.reg.registered': 'Registered',
  'mit.reg.invited': 'Invited',
  'mit.reg.inviteExpired': 'Invitation expired',
  'mit.reg.notRegistered': 'Not registered',

  'mit.action.profile': 'Profile',
  'mit.action.edit': 'Edit',
  'mit.action.offers': 'Offers',
  'mit.action.invite': 'Invite',
  'mit.action.inviteTitle': 'Send an invitation to the worker portal',
  'mit.action.deactivate': 'Deactivate',
  'mit.action.activate': 'Activate',
  'mit.action.cancel': 'Cancel',
  'mit.action.save': 'Save',
  'mit.action.back': 'Back',
  'mit.action.refresh': 'Refresh',
  'mit.action.add': '+ Add',
  'mit.action.resend': 'Resend',
  'mit.action.revoke': 'Revoke',
  'mit.action.download': 'Download',
  'mit.action.verify': 'Verify',
  'mit.action.reject': 'Reject',
  'mit.action.delete': 'Delete',
  'mit.action.creating': 'Creating…',

  'mit.live.searchPh': 'Search workers...',
  'mit.live.loading': 'Loading live workforce...',
  'mit.live.loadError': 'Live workforce could not be loaded.',
  'mit.live.empty': 'No workers in the workforce yet.',
  'mit.live.asOf': 'As of: {time}',
  'mit.live.atClient': 'at {client}',
  'mit.live.until': 'until {date}',
  'mit.live.timesheetsBadge': '{count} timesheets',
  'mit.live.status.endingSoon': 'Ending soon',
  'mit.live.status.onAssignment': 'On assignment',
  'mit.live.status.available': 'Available',
  'mit.live.status.inactive': 'Inactive',
  'mit.live.kpi.utilization': 'Utilisation',
  'mit.live.kpi.openTimesheets': 'Open timesheets',
  'mit.live.kpi.workforce': 'Workforce',

  'mit.create.title': 'Add a new worker',
  'mit.create.intro': 'The worker receives an account and can sign in to the worker self-service portal.',
  'mit.create.passwordLabel': 'Password (min. 8 characters, optional — generated otherwise)',
  'mit.create.passwordPh': 'Password for the worker',
  'mit.create.submit': 'Create worker',
  'mit.invite.title': 'Invite a worker by email',
  'mit.invite.intro': 'The worker receives an email with a link to register in the worker portal.',
  'mit.invite.submit': 'Send invitation',

  'mit.field.firstName': 'First name',
  'mit.field.lastName': 'Last name',
  'mit.field.firstNameReq': 'First name *',
  'mit.field.lastNameReq': 'Last name *',
  'mit.field.emailReq': 'Email *',
  'mit.field.personnelNr': 'Staff number',
  'mit.field.phone': 'Phone',
  'mit.field.city': 'City',
  'mit.field.street': 'Street',
  'mit.field.postal': 'Postcode',
  'mit.field.country': 'Country',
  'mit.field.birthDate': 'Date of birth',
  'mit.field.locale': 'Language / locale',
  'mit.field.notes': 'Notes',
  'mit.field.internalNotes': 'Internal notes',
  'mit.field.availabilityNote': 'Internal availability note',
  'mit.field.profileText': 'Short profile / CV text',
  'mit.ph.street': 'Sample St. 1',
  'mit.ph.streetLong': 'Sample Street 1',
  'mit.ph.availabilityNote': 'e.g. available around Hamburg from next week',
  'mit.ph.profileText': 'Free text: experience, specifics, assignment preferences, career background...',
  'mit.ph.internalNotes': 'Visible internally only',

  'mit.hub.title': 'Profile & talent hub',
  'mit.hub.intro': 'Your existing worker pool becomes one central worker profile here: master data, skills, qualifications, the internal assignment view and controlled external sharing in a single place.',
  'mit.hub.selectWorker': 'Select a worker...',
  'mit.hub.masterData': 'Master data & internal profile',
  'mit.hub.emptyTitle': 'Select a worker',
  'mit.hub.emptyText': 'Pick a worker above to manage profile, skills, qualifications, assignment context and external sharing in one place.',
  'mit.hub.resetSelection': 'Reset selection',
  'mit.hub.save': 'Save profile hub',
  'mit.hub.okSaved': 'Profile hub saved.',
  'mit.hub.errLoadProfile': 'Profile could not be loaded.',
  'mit.hub.errPublicFields': 'Please define at least one shared field.',
  'mit.hub.errNoChanges': 'No changes to save.',
  'mit.hub.badgeCompletion': 'Profile {percent}%',
  'mit.hub.badgePublic': 'shared externally',
  'mit.hub.badgeInternal': 'internal only',
  'mit.hub.badgeVerified': 'Account verified',
  'mit.hub.badgeUnverified': 'Account not verified',
  'mit.hub.statDocuments': 'Documents',

  'mit.skills.title': 'Skills & competencies',
  'mit.skills.intro': 'A broad, assignment- and matching-oriented skill catalogue for all common workforce scenarios. Please keep certificates, licences and formal proof separately under qualifications.',
  'mit.skills.filterPh': 'Filter the skill catalogue (e.g. logistics, welding, office)...',
  'mit.skills.clearAll': 'Clear selection',
  'mit.skills.selected': 'Selected skills',
  'mit.skills.extraTitle': 'Additional specialist skill',
  'mit.skills.extraPh': 'Enter a skill (e.g. welding)',
  'mit.skills.extraHint': 'Edge cases, client-specific terms and rare niche competencies can be added here and are stored together with the checkbox selection.',
  'mit.skills.metaCatalog': '{skills} catalogue skills in {groups} groups',
  'mit.skills.metaSelected': '{count} selected',
  'mit.skills.metaCustom': '{count} added manually',
  'mit.skills.metaFilter': 'Filter active: {query}',
  'mit.skills.metaHint': 'Please keep licences and proof under qualifications',
  'mit.skills.groupSelected': '{selected} of {total} selected',
  'mit.skills.groupHits': '{count} matches',
  'mit.skills.selectGroup': 'Select category',
  'mit.skills.clearGroup': 'Clear',
  'mit.skills.noMatch': 'No catalogue skills match the current filter.',
  'mit.skills.noMatchHint': 'Use the free-text field below for rare or highly client-specific skills.',
  'mit.skills.noneSelected': 'No skills selected yet.',
  'mit.skills.summary': '{total} skills selected · {catalog} from the catalogue',
  'mit.skills.summaryCustom': '{count} custom',
  'mit.skills.emptyHint': 'No skills selected yet. Pick matching assignment skills from the catalogue or add your own specialist skills.',
  'mit.skills.customBadge': 'custom',
  'mit.skills.limit': 'Maximum {max} skills per worker profile.',
  'mit.skills.groupAdded': '{group}: {count} skills added.',
  'mit.skills.groupCleared': '{group} cleared.',
  'mit.skills.allCleared': 'Skill selection cleared.',

  'mit.skillgroup.lager_logistik.title': 'Warehouse & logistics',
  'mit.skillgroup.lager_logistik.desc': 'Hands-on warehouse, shipping and intralogistics competencies.',
  'mit.skillgroup.produktion_montage.title': 'Production & assembly',
  'mit.skillgroup.produktion_montage.desc': 'Series production, assembly and production-line skills.',
  'mit.skillgroup.metall_industrie.title': 'Metal & industry',
  'mit.skillgroup.metall_industrie.desc': 'Technical and industrial manufacturing competencies.',
  'mit.skillgroup.bau_handwerk.title': 'Construction & trades',
  'mit.skillgroup.bau_handwerk.desc': 'Construction-related, skilled-trade and installation abilities.',
  'mit.skillgroup.transport_fahrdienst.title': 'Transport & driving',
  'mit.skillgroup.transport_fahrdienst.desc': 'Driving, route and transport skills.',
  'mit.skillgroup.buero_verwaltung.title': 'Office & administration',
  'mit.skillgroup.buero_verwaltung.desc': 'Administrative, commercial and coordinating skills.',
  'mit.skillgroup.handel_service.title': 'Retail & service',
  'mit.skillgroup.handel_service.desc': 'Sales, retail and service-oriented competencies.',
  'mit.skillgroup.gastro_event.title': 'Hospitality & events',
  'mit.skillgroup.gastro_event.desc': 'Hospitality, event and front-of-house skills.',
  'mit.skillgroup.pflege_soziales.title': 'Care & social work',
  'mit.skillgroup.pflege_soziales.desc': 'Nursing, care and social-support competencies.',
  'mit.skillgroup.facility_reinigung.title': 'Facility & cleaning',
  'mit.skillgroup.facility_reinigung.desc': 'Building, cleaning and facility operation services.',
  'mit.skillgroup.digital_systeme.title': 'Digital & systems',
  'mit.skillgroup.digital_systeme.desc': 'IT-adjacent, systems and process-support skills.',
  'mit.skillgroup.sprachen_kommunikation.title': 'Languages & communication',
  'mit.skillgroup.sprachen_kommunikation.desc': 'Language skills for assignments, client contact and teams.',

  'mit.qual.title': 'Qualifications & proof',
  'mit.qual.name': 'Title',
  'mit.qual.namePh': 'e.g. forklift licence',
  'mit.qual.issuer': 'Issuer',
  'mit.qual.issuerPh': 'TÜV / DEKRA / internal',
  'mit.qual.validUntil': 'Valid until',
  'mit.qual.document': 'Proof / document',
  'mit.qual.documentPh': 'PDF / scan / reference',
  'mit.qual.note': 'Note',
  'mit.qual.notePh': 'Optional note',
  'mit.qual.add': '+ Add qualification',
  'mit.qual.empty': 'No qualifications recorded yet.',
  'mit.qual.proof': 'Proof',
  'mit.qual.linkedDocs': 'Linked documents',

  'mit.doc.title': 'Document file & records',
  'mit.doc.intro': 'A proper personnel-file view: documented proof, internal review, validity periods and file storage right on the worker profile.',
  'mit.doc.stored': 'Stored documents',
  'mit.doc.addTitle': 'Add a new document',
  'mit.doc.category': 'Category',
  'mit.doc.cat.qualification': 'Qualification',
  'mit.doc.cat.identity': 'Identity',
  'mit.doc.cat.permit': 'Permit',
  'mit.doc.cat.medical': 'Medical',
  'mit.doc.cat.training': 'Training',
  'mit.doc.cat.other': 'Other',
  'mit.doc.titleField': 'Title / document',
  'mit.doc.titlePh': 'e.g. forklift licence PDF',
  'mit.doc.linkedQual': 'Linked qualification',
  'mit.doc.issuerPh': 'DEKRA / TÜV / internal',
  'mit.doc.validFrom': 'Valid from',
  'mit.doc.file': 'File',
  'mit.doc.note': 'Internal note',
  'mit.doc.notePh': 'Review note, restriction, internal classification',
  'mit.doc.upload': 'Upload document',
  'mit.doc.uploadHint': 'Allowed: PDF, PNG, JPG, WEBP up to 10 MB. External sharing stays strictly separate.',
  'mit.doc.empty': 'No documents stored yet.',
  'mit.doc.genericDocument': 'Document',
  'mit.doc.noFileSize': 'no file size',
  'mit.doc.statTotal': 'Total',
  'mit.doc.statExpiringSoon': 'Expiring soon',
  'mit.doc.status.pendingReview': 'In review',
  'mit.doc.status.verified': 'Verified',
  'mit.doc.status.rejected': 'Rejected',
  'mit.doc.status.archived': 'Archived',
  'mit.doc.status.expired': 'Expired',
  'mit.doc.status.open': 'open',
  'mit.doc.validFromValue': 'from {date}',
  'mit.doc.validUntilValue': 'until {date}',
  'mit.doc.errPickFile': 'Please select a file.',
  'mit.doc.errTooLarge': 'File is too large (max. 10 MB).',
  'mit.doc.errMime': 'File type not allowed.',
  'mit.doc.errStore': 'The document could not be saved.',
  'mit.doc.okStored': 'Document stored.',
  'mit.doc.promptVerifyNote': 'Optional verification note',
  'mit.doc.okVerified': 'Document verified.',
  'mit.doc.errVerify': 'The document could not be verified.',
  'mit.doc.promptRejectReason': 'Please enter a reason for rejection',
  'mit.doc.errRejectReason': 'Please provide a reason for rejection.',
  'mit.doc.okRejected': 'Document rejected.',
  'mit.doc.errReject': 'The document could not be rejected.',
  'mit.doc.confirmDelete': 'Really delete this document?',
  'mit.doc.okDeleted': 'Document deleted.',
  'mit.doc.errDelete': 'The document could not be deleted.',

  'mit.linkage.title': 'Account & worker portal',
  'mit.linkage.account': 'Account',
  'mit.linkage.createdAt': 'Created',
  'mit.linkage.portal': 'Portal',
  'mit.linkage.sharing': 'Sharing',
  'mit.linkage.verified': 'verified',
  'mit.linkage.notVerified': 'not verified',
  'mit.linkage.membershipInactive': 'Membership inactive',
  'mit.linkage.portalActive': 'Portal access active',
  'mit.linkage.sharedExternally': 'Shared externally',
  'mit.linkage.internalOnly': 'Internal only',
  'mit.linkage.noFields': 'no fields',

  'mit.ops.title': 'Operational context',
  'mit.ops.assignments': 'Assignments & placements',
  'mit.ops.submissions': 'Submissions / timesheets',
  'mit.ops.activeAssignments': 'Active assignments',
  'mit.ops.pendingConfirmations': 'Pending confirmations',
  'mit.ops.submitted': 'Submitted',
  'mit.ops.corrections': 'Corrections',
  'mit.ops.assignmentsEmpty': 'No assignment links yet.',
  'mit.ops.assignmentFallback': 'Assignment',
  'mit.ops.submissionsEmpty': 'No worker submissions yet.',
  'mit.ops.weekRange': 'Week {from} – {to}',
  'mit.ops.hours': '{hours} h',
  'mit.ops.noAssignment': 'no assignment',
  'mit.asgState.endsToday': 'Ends today',
  'mit.asgState.completed': 'Completed',
  'mit.asgState.cancelled': 'Cancelled',
  'mit.asgState.archived': 'Archive',
  'mit.asgState.pendingConfirmation': 'Confirmation pending',
  'mit.asgState.unavailable': 'Unavailable',

  'mit.public.title': 'External profile sharing',
  'mit.public.intro': 'No automatic public mode: only the fields you explicitly release become visible.',
  'mit.public.toggle': 'Share profile externally',
  'mit.public.f.name': 'Name',
  'mit.public.f.nameDesc': 'Full name',
  'mit.public.f.city': 'Location',
  'mit.public.f.cityDesc': 'City only, no exact address',
  'mit.public.f.skills': 'Skills',
  'mit.public.f.skillsDesc': 'Competencies & tags',
  'mit.public.f.quals': 'Qualifications',
  'mit.public.f.qualsDesc': 'Certificates & proof',
  'mit.public.f.profileText': 'Short profile',
  'mit.public.f.profileTextDesc': 'Released description text',
  'mit.public.f.availability': 'Availability',
  'mit.public.f.availabilityDesc': 'Manual internal availability note',
  'mit.public.shareLink': 'Share link',
  'mit.public.copyLink': 'Copy link',
  'mit.public.preview': 'Open preview',
  'mit.public.internalOnly': 'This profile is currently visible internally only.',
  'mit.public.pickAtLeastOne': 'Please select at least one field for external sharing.',
  'mit.public.shared': 'Shared: {fields}',
  'mit.public.okCopied': 'Link copied.',
  'mit.public.errCopy': 'The link could not be copied.',
  'mit.public.errNoActiveShare': 'No active external sharing.',

  'mit.invites.loading': 'Loading invitations...',
  'mit.invites.loadError': 'Invitations could not be loaded.',
  'mit.invites.empty': 'No invitations sent yet.',
  'mit.inviteStatus.pending': 'Pending',
  'mit.inviteStatus.accepted': 'Accepted',
  'mit.inviteStatus.revoked': 'Revoked',
  'mit.inviteStatus.expired': 'Expired',

  'mit.edit.title': 'Edit worker',

  'mit.og.submit': 'Create selected offers',
  'mit.og.titleFor': 'Generate offers – {name}',
  'mit.og.workerFallback': 'Worker',
  'mit.og.loading': 'Loading suggestions…',
  'mit.og.loadError': 'Suggestions could not be loaded.',
  'mit.og.noSkills': 'This worker has no skills on file yet. Skills are captured in the worker portal – only then can offers be generated.',
  'mit.og.noCity': 'No home location on file. Please add the city under Edit first – otherwise no offers can be created.',
  'mit.og.summaryA': '{count} skills →',
  'mit.og.summaryB': '{count} new offers possible',
  'mit.og.summaryExisting': '{count} already exist',
  'mit.og.singleTitle': 'Single offers (one per skill)',
  'mit.og.exists': 'exists',
  'mit.og.bundleTitle': 'Combined offer (all skills bundled)',
  'mit.og.bundleLabel': 'All-rounder ({count} skills)',
  'mit.og.tierTitle': 'Offer tier',
  'mit.og.tierStandard': 'Standard',
  'mit.og.tierUrgent': 'Urgent – higher priority',
  'mit.og.premium': 'Premium – more visibility (higher ranking)',
  'mit.og.draftHint': 'Offers are created as drafts. They only appear on the marketplace once activated in the capacity exchange.',
  'mit.og.errSelectOne': 'Please select at least one offer.',
  'mit.og.okCreated': '{count} offer(s) created as drafts',
  'mit.og.okSkipped': '{count} skipped',

  'mit.pool.title': 'Create pooled offer',
  'mit.pool.intro': 'Bundle several available workers with the same skill into one offer – offer N at once.',
  'mit.pool.skillsLabel': 'Skills (one or more)',
  'mit.pool.addSkill': 'Add a skill…',
  'mit.pool.submit': 'Create pooled offer',
  'mit.pool.catalogError': 'The skill catalogue could not be loaded.',
  'mit.pool.loading': 'Loading workers…',
  'mit.pool.loadError': 'Workers could not be loaded.',
  'mit.pool.emptySingle': 'No worker found with this skill.',
  'mit.pool.emptyMulti': 'No worker found with all selected skills.',
  'mit.pool.summaryA': '{count} workers with "{skills}"',
  'mit.pool.summaryFree': '{count} available',
  'mit.pool.summaryHint': '(available ones are preselected)',
  'mit.pool.busy': 'on assignment',
  'mit.pool.tierUrgent': 'Urgent',
  'mit.pool.premium': 'Premium – more visibility',
  'mit.pool.kindMulti': 'several skills',
  'mit.pool.kindSingle': 'one skill',
  'mit.pool.draftHint': 'Creates one pooled offer ({kind}) as a draft.',
  'mit.pool.errSelectSkill': 'Please select at least one skill.',
  'mit.pool.errSelectWorker': 'Please select at least one worker.',
  'mit.pool.okCreated': 'Pooled offer created ({count} workers, draft).',
  'mit.pool.errNoValidMembers': 'No valid workers for this offer.',

  'mit.csv.step1': 'Upload',
  'mit.csv.step2': 'Mapping',
  'mit.csv.step3': 'Validation',
  'mit.csv.step4': 'Import',
  'mit.csv.uploadTitle': 'Upload a CSV file',
  'mit.csv.uploadIntro': 'Choose a CSV file with your worker data. Supported delimiters: comma, semicolon, tab.',
  'mit.csv.dropzone': 'Drag a CSV file here or click',
  'mit.csv.dropzoneMeta': 'Max. 1000 records • .csv format',
  'mit.csv.example': 'Example CSV',
  'mit.csv.mapTitle': 'Map columns',
  'mit.csv.mapIntro': 'Map the CSV columns to the TempConnect fields. Required fields are marked with *.',
  'mit.csv.startValidation': 'Start validation →',
  'mit.csv.validationTitle': 'Validation & preview',
  'mit.csv.onDuplicates': 'On duplicates:',
  'mit.csv.dupSkip': 'Skip',
  'mit.csv.dupUpdate': 'Update',
  'mit.csv.startImport': 'Start import',
  'mit.csv.resultTitle': 'Import result',
  'mit.csv.newImport': 'New import',
  'mit.csv.toList': 'Back to worker list',
  'mit.csv.colCsv': 'CSV column',
  'mit.csv.colTarget': 'TempConnect field',
  'mit.csv.sample': 'e.g. {value}',
  'mit.csv.doNotImport': '— Do not import —',
  'mit.csv.errMinRows': 'The CSV must contain at least a header row and one data row.',
  'mit.csv.errMaxRows': 'Max. {max} records allowed ({found} found).',
  'mit.csv.errNotCsv': 'Please choose a .csv file.',
  'mit.csv.errFileTooLarge': 'File too large (max. 5 MB).',
  'mit.csv.fileMeta': '{rows} records · {columns} columns',
  'mit.csv.errMissingRequired': 'Required fields not mapped: {fields}',
  'mit.csv.errFieldMissing': '{field} missing',
  'mit.csv.errInvalidEmail': 'Invalid email',
  'mit.csv.errDuplicateEmail': 'Duplicate email in CSV (row {row})',
  'mit.csv.kpiTotal': 'Total',
  'mit.csv.kpiValid': 'Valid',
  'mit.csv.kpiErrors': 'Errors',
  'mit.csv.kpiDuplicates': 'Duplicates',
  'mit.csv.kpiCreated': 'Created',
  'mit.csv.kpiUpdated': 'Updated',
  'mit.csv.kpiSkipped': 'Skipped',
  'mit.csv.rowDuplicate': 'Duplicate',
  'mit.csv.rowOk': 'OK',
  'mit.csv.importing': 'Importing...',
  'mit.csv.transferring': 'Transferring data...',
  'mit.csv.noValidRows': 'No valid records to import.',
  'mit.csv.noValidRowsShort': 'No valid records',
  'mit.csv.importingRows': 'Importing {count} records...',
  'mit.csv.importDone': 'Import complete.',
  'mit.csv.importFailed': 'Import failed',
  'mit.csv.errorPrefix': 'Error: {message}',
  'mit.csv.inviteImportedCta': 'Invite all {count} imported workers now',
  'mit.csv.rowLabel': 'Row {row}:',
  'mit.csv.unknownError': 'Unknown error',
  'mit.csv.headCreated': 'Created ({count})',
  'mit.csv.headUpdated': 'Updated ({count})',
  'mit.csv.andMore': '... and {count} more',

  'mit.ok.created': 'Worker created successfully.',
  'mit.ok.updated': 'Worker updated.',
  'mit.ok.activated': 'Worker activated.',
  'mit.ok.deactivated': 'Worker deactivated.',
  'mit.ok.inviteSent': 'Invitation sent successfully.',
  'mit.ok.inviteSentTo': 'Invitation sent to {email}.',
  'mit.ok.inviteResent': 'Invitation sent again.',
  'mit.ok.inviteRevoked': 'Invitation revoked.',
  'mit.ok.allAlreadyInvited': 'All workers are already registered or invited.',
  'mit.ok.bulkInvited': '{count} invited',
  'mit.ok.bulkMailErrors': '{count} mail errors',
  'mit.ok.bulkSkipped': '{count} skipped',
  'mit.confirm.inviteImported': 'Invite {count} imported workers to the worker portal now? Anyone already invited or registered is skipped.',
  'mit.confirm.inviteUnregistered': 'Invite {count} workers who are not registered yet? Anyone already registered is skipped.',
  'mit.confirm.revokeInvite': 'Really revoke this invitation?',
  'mit.err.requiredFields': 'Please fill in first name, last name and email.',
  'mit.err.emailExists': 'This email address is already registered.',
  'mit.err.limitUpgrade': 'Worker limit reached. Please upgrade your plan.',
  'mit.err.limitReached': 'Worker limit reached.',
  'mit.err.featureUpgrade': 'Worker module not available. Please upgrade your plan (PLUS/PRO).',
  'mit.err.featureUpgradeShort': 'Worker module not available. Please upgrade your plan.',
  'mit.err.create': 'Error while creating',
  'mit.err.createFailed': 'Creation failed.',
  'mit.err.save': 'Error while saving',
  'mit.err.load': 'Error while loading',
  'mit.err.generic': 'Error',
  'mit.err.noEmailOnWorker': 'No email address on file for this worker.',
  'mit.err.invitePending': 'There is already a pending invitation.',
  'mit.err.invitePendingEmail': 'There is already a pending invitation for this email address.',
  'mit.err.inviteFailed': 'Invitation failed.',
  'mit.err.bulkInviteFailed': 'Bulk invitation failed.',
  'mit.err.planLimitUpgrade': 'Plan limit reached — upgrade required.',

  'mit.plan.individual': 'Custom plan',
  'mit.upgrade.activeWorkers': 'Active workers: {current} / {max}',
  'mit.upgrade.featureTitle': 'Unlock the workforce hub',
  'mit.upgrade.featureText': 'The workforce hub is available from {plans}. Manage worker profiles, skills and qualifications in one place.',
  'mit.upgrade.featureItem1': 'Worker profiles and skill catalogue',
  'mit.upgrade.featureItem2': 'Qualifications, documents and expiry dates',
  'mit.upgrade.featureItem3': 'CSV import for a fast start',
  'mit.upgrade.limitTitle': 'Worker limit reached',
  'mit.upgrade.limitText': 'Your current plan has hit its workforce hub limit. Raise the quota for active workers and assignments.',
  'mit.upgrade.limitItem1': 'More active workers and assignments',
  'mit.upgrade.limitItem2': 'Scalable CSV import and document management',
  'mit.upgrade.limitItem3': 'Additional control and reporting depth',
  'mit.upgrade.currentPlan': 'Current plan: {plan}',
  'mit.upgrade.ctaIndividual': 'Request a custom plan',
  'mit.upgrade.ctaStart': 'Start upgrade',

  'mit.value.unknown': 'Unknown',
  'mit.value.unnamed': 'Unnamed',
  'mit.value.noEmail': 'No email',
  'mit.value.external': 'external'
});

var _workers = [];
var _invites = [];
var _editUserId = null;
var _currentSkillWorker = null;
var _currentSkills = [];
var _currentQuals = [];
var _currentWorkerDocuments = [];
var _currentWorkerDocumentSummary = null;
var MAX_SKILL_TAGS = 50;
var PLAN_ORDER = ["DEMO", "BASIS", "PLUS", "PRO", "INDIVIDUELL"];
/* P6.1: Labels kommen aus dem Woerterbuch — die Feld-Schluessel (name, city, …)
   bleiben unveraendert, weil sie an das Backend gehen. */
var _publicFieldLabelKeys = {
  name: "mit.public.f.name",
  city: "mit.public.f.city",
  skill_tags: "mit.public.f.skills",
  qualifications: "mit.public.f.quals",
  profile_text: "mit.public.f.profileText",
  availability_note: "mit.public.f.availability"
};
var SKILL_CATALOG_GROUPS = [
  {
    id: "lager_logistik",
    title: "Lager & Logistik",
    description: "Operative Lager-, Versand- und Intralogistik-Kompetenzen.",
    skills: ["Kommissionierung", "Wareneingang", "Warenausgang", "Stapler", "Frontstapler", "Schubmaststapler", "Hochregal", "Scanner / MDE", "Pick-by-Voice", "Versand", "Verpackung", "Inventur"]
  },
  {
    id: "produktion_montage",
    title: "Produktion & Montage",
    description: "Serienfertigung, Montage und Linienkompetenzen.",
    skills: ["Maschinenbedienung", "Montage", "Serienfertigung", "Qualitätskontrolle", "Sichtprüfung", "Rüsten", "Endkontrolle", "Löten", "Kabelkonfektion", "Kunststoffverarbeitung", "Lebensmittelproduktion", "Pharma-Produktion"]
  },
  {
    id: "metall_industrie",
    title: "Metall & Industrie",
    description: "Technische und industrielle Fertigungskompetenzen.",
    skills: ["MAG-Schweißen", "WIG-Schweißen", "MIG-Schweißen", "Metallbau", "Kanten / Biegen", "Drehen", "Fräsen", "CNC-Bedienung", "Zeichnung lesen", "Instandhaltung", "Hydraulik", "Pneumatik"]
  },
  {
    id: "bau_handwerk",
    title: "Bau & Handwerk",
    description: "Baunahe, handwerkliche und montageorientierte Fähigkeiten.",
    skills: ["Trockenbau", "Elektroinstallation", "Sanitär", "Heizungsbau", "Malerarbeiten", "Fliesenlegen", "Holzmontage", "Fenster- / Türenmontage", "Rohbau", "Betonarbeiten", "Garten- und Landschaftsbau", "Gerüstbau"]
  },
  {
    id: "transport_fahrdienst",
    title: "Transport & Fahrdienst",
    description: "Fahr-, Touren- und Transportfertigkeiten.",
    skills: ["Führerschein B", "Führerschein C / CE", "Ladungssicherung", "Auslieferung", "Tourenplanung", "Nahverkehr", "Fernverkehr", "Kurierdienst", "Fahrzeugpflege", "Fahrerkarte", "Kühltransport", "Personenbeförderung"]
  },
  {
    id: "buero_verwaltung",
    title: "Büro & Verwaltung",
    description: "Administrative, kaufmännische und koordinative Skills.",
    skills: ["MS Office", "Excel-Reporting", "Datenerfassung", "Sachbearbeitung", "Auftragsbearbeitung", "Disposition", "Terminplanung", "Empfang", "Telefonzentrale", "Rechnungsprüfung", "Personalassistenz", "Dokumentenmanagement"]
  },
  {
    id: "handel_service",
    title: "Handel & Service",
    description: "Vertriebs-, Retail- und serviceorientierte Kompetenzen.",
    skills: ["Kundenberatung", "Kasse / POS", "Warenverräumung", "Merchandising", "Reklamationsbearbeitung", "Call Center", "Telesales", "Serviceannahme", "Filialsupport", "Upselling", "Beschwerdemanagement", "Front Office"]
  },
  {
    id: "gastro_event",
    title: "Gastro & Event",
    description: "Gastgewerbe-, Veranstaltungs- und Front-of-House-Skills.",
    skills: ["Service", "Küche", "Spülküche", "Bar", "Housekeeping", "Rezeption", "Catering", "Bankettservice", "Veranstaltungsaufbau", "Garderobe", "Frühstücksservice", "Night Audit"]
  },
  {
    id: "pflege_soziales",
    title: "Pflege & Soziales",
    description: "Pflege-, Betreuungs- und sozialnahe Kompetenzen.",
    skills: ["Grundpflege", "Behandlungspflege", "Betreuung", "Seniorenbetreuung", "Pflegedokumentation", "Medikamentengabe", "OP-Begleitung", "Stationshilfe", "Alltagsbegleitung", "Kita-Betreuung", "Schulbegleitung", "Sozialberatung"]
  },
  {
    id: "facility_reinigung",
    title: "Facility & Reinigung",
    description: "Gebäude-, Reinigungs- und Betreiberservices.",
    skills: ["Unterhaltsreinigung", "Glasreinigung", "Industriereinigung", "Maschinenreinigung", "Hausmeisterservice", "Gebäudetechnik", "Winterdienst", "Grünpflege", "Abfallmanagement", "Sicherheitsdienst", "Empfangsdienst", "Zutrittskontrolle"]
  },
  {
    id: "digital_systeme",
    title: "Digital & Systeme",
    description: "IT-nahe, systemische und prozessunterstützende Skills.",
    skills: ["Hardware-Rollout", "First-Level-Support", "Ticketing", "ERP / Warenwirtschaft", "SAP-Grundkenntnisse", "CRM-Pflege", "E-Commerce Support", "Contentpflege", "Social Media Support", "Datenanalyse", "Power BI", "Prozessdokumentation"]
  },
  {
    id: "sprachen_kommunikation",
    title: "Sprachen & Kommunikation",
    description: "Sprachkompetenzen für Einsätze, Kundenkontakt und Teams.",
    skills: ["Deutsch B2", "Deutsch C1", "Englisch B1", "Englisch B2", "Polnisch", "Rumänisch", "Türkisch", "Arabisch", "Russisch", "Französisch"]
  }
];
var _skillCatalogMeta = null;

/* ── API + CSRF ──────────────────────────────────────── */
var _csrf = null;
function getCsrf() {
  if (_csrf) return Promise.resolve(_csrf);
  return fetch("/api/csrf", { credentials: "include" })
    .then(function(r) { return r.json(); })
    .then(function(d) { _csrf = d.token || null; return _csrf; })
    .catch(function() { return null; });
}

function api(path, opts) {
  opts = opts || {};
  var method = opts.method || "GET";
  var headers = {};
  var isFormData = !!opts.formData;
  if (!isFormData) headers["Content-Type"] = "application/json";

  function doFetch(csrf) {
    if (csrf && method !== "GET") headers["x-csrf-token"] = csrf;
    var o = { method: method, credentials: "include", headers: headers };
    if (opts.body) o.body = JSON.stringify(opts.body);
    if (opts.formData) o.body = opts.formData;
    return fetch("/api" + path, o).then(function(r) {
      if (!r.ok) return r.json().then(function(e) { throw e; });
      return r.json();
    });
  }

  if (method === "GET") return doFetch(null);
  return getCsrf().then(function(csrf) {
    return doFetch(csrf).catch(function(err) {
      if (err && (err.error === "CSRF_INVALID" || err.error === "CSRF_MISSING")) {
        _csrf = null;
        return getCsrf().then(doFetch);
      }
      throw err;
    });
  });
}

/* Skill-Gruppen: Titel/Beschreibung sind UI-Text und kommen aus dem
   Woerterbuch (Schluessel aus der Gruppen-ID). Die Skill-NAMEN bleiben
   bewusst deutsch — sie werden als skill_tags gespeichert und gematcht. */
function skillGroupTitle(group) {
  if (!group) return "";
  return TCi18n.t("mit.skillgroup." + group.id + ".title") || group.title;
}
function skillGroupDescription(group) {
  if (!group) return "";
  return TCi18n.t("mit.skillgroup." + group.id + ".desc") || group.description;
}

function toast(msg, type) {
  var el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast show " + (type || "ok");
  clearTimeout(el._t);
  el._t = setTimeout(function() { el.className = "toast"; }, 4000);
}

function esc(s) { return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function normalizePlan(plan) {
  var p = String(plan || "").toUpperCase();
  if (p === "FREE") p = "DEMO";
  if (p === "ENTERPRISE" || p === "INDIVIDUAL") p = "INDIVIDUELL";
  return p || null;
}

function formatPlanLabel(plan) {
  if (window.PlanFeatures && typeof window.PlanFeatures.getDisplayPlanLabel === "function") {
    return window.PlanFeatures.getDisplayPlanLabel(plan);
  }
  return plan === "INDIVIDUELL" ? TCi18n.t("mit.plan.individual") : plan;
}

function getNextPlan(plan) {
  var idx = PLAN_ORDER.indexOf(plan);
  if (idx < 0 || idx >= PLAN_ORDER.length - 1) return null;
  return PLAN_ORDER[idx + 1];
}

function sortPlans(plans) {
  return plans.slice().sort(function(a, b) {
    return PLAN_ORDER.indexOf(a) - PLAN_ORDER.indexOf(b);
  });
}

function buildUpgradeHref(plan) {
  if (!plan) return "/public/sla_abo.html";
  if (plan === "INDIVIDUELL") return "/public/enterprise_anfrage.html";
  return "/public/sla_abo.html?plan=" + encodeURIComponent(plan);
}

function getWorkerLimitMeta(planLimits) {
  if (!planLimits || !Array.isArray(planLimits.checks)) return null;
  var check = planLimits.checks.find(function(c) { return c.metric === "active_workers"; });
  if (!check) return null;
  var max = (check.max === null || check.max === undefined) ? "∞" : check.max;
  return TCi18n.t("mit.upgrade.activeWorkers", { current: check.current, max: max });
}

function showWorkerUpgradeBanner(info) {
  var banner = document.getElementById("workerUpgradeBanner");
  if (!banner) return;
  var titleEl = document.getElementById("workerUpgradeTitle");
  var textEl = document.getElementById("workerUpgradeText");
  var listEl = document.getElementById("workerUpgradeList");
  var metaEl = document.getElementById("workerUpgradeMeta");
  var ctaEl = document.getElementById("workerUpgradeCta");

  var reason = info && info.reason ? info.reason : "feature";
  var currentPlan = normalizePlan(info.current_plan || (info.plan_limits && info.plan_limits.plan) || info.plan);
  var requiredPlans = Array.isArray(info.required_plans)
    ? sortPlans(info.required_plans.map(normalizePlan).filter(Boolean))
    : [];
  var minPlan = requiredPlans.length ? requiredPlans[0] : "PLUS";
  var targetPlan = reason === "limit" ? (getNextPlan(currentPlan) || minPlan) : minPlan;
  if (currentPlan === "INDIVIDUELL" && reason === "limit") targetPlan = "INDIVIDUELL";

  var title = TCi18n.t("mit.upgrade.featureTitle");
  var text = TCi18n.t("mit.upgrade.featureText", { plans: "PLUS" });
  var listItems = [
    TCi18n.t("mit.upgrade.featureItem1"),
    TCi18n.t("mit.upgrade.featureItem2"),
    TCi18n.t("mit.upgrade.featureItem3")
  ];

  if (reason === "limit") {
    title = TCi18n.t("mit.upgrade.limitTitle");
    text = TCi18n.t("mit.upgrade.limitText");
    listItems = [
      TCi18n.t("mit.upgrade.limitItem1"),
      TCi18n.t("mit.upgrade.limitItem2"),
      TCi18n.t("mit.upgrade.limitItem3")
    ];
  } else if (requiredPlans.length) {
    text = TCi18n.t("mit.upgrade.featureText", { plans: requiredPlans.map(formatPlanLabel).join(" / ") });
  }

  if (titleEl) titleEl.textContent = title;
  if (textEl) textEl.textContent = text;

  if (listEl) {
    listEl.innerHTML = "";
    if (listItems && listItems.length) {
      listEl.style.display = "";
      listItems.forEach(function(item) {
        var li = document.createElement("li");
        li.textContent = item;
        listEl.appendChild(li);
      });
    } else {
      listEl.style.display = "none";
    }
  }

  if (metaEl) {
    var metaParts = [];
    if (currentPlan) metaParts.push(TCi18n.t("mit.upgrade.currentPlan", { plan: formatPlanLabel(currentPlan) }));
    if (reason === "limit") {
      var limitMeta = getWorkerLimitMeta(info.plan_limits);
      if (limitMeta) metaParts.push(limitMeta);
    }
    metaEl.textContent = metaParts.join(" · ");
    metaEl.style.display = metaParts.length ? "" : "none";
  }

  if (ctaEl) {
    ctaEl.href = buildUpgradeHref(targetPlan);
    ctaEl.textContent = targetPlan === "INDIVIDUELL" ? TCi18n.t("mit.upgrade.ctaIndividual") : TCi18n.t("mit.upgrade.ctaStart");
  }

  banner.style.display = "flex";
}

function showWorkerUpgradeFromError(err) {
  if (!err || !err.error) return false;
  if (err.error === "FEATURE_NOT_AVAILABLE") {
    showWorkerUpgradeBanner(Object.assign({}, err, { reason: "feature" }));
    return true;
  }
  if (err.error === "WORKER_LIMIT_EXCEEDED") {
    showWorkerUpgradeBanner(Object.assign({}, err, { reason: "limit" }));
    return true;
  }
  return false;
}

/* ── Tabs ────────────────────────────────────────────── */
function showTab(name) {
  document.querySelectorAll(".panel").forEach(function(p) { p.classList.remove("active"); });
  document.querySelectorAll(".tab-btn").forEach(function(b) { b.classList.remove("active"); });
  var panel = document.getElementById("panel-" + name);
  if (panel) panel.classList.add("active");
  var tab = document.querySelector('.tab-btn[data-tab="' + name + '"]');
  if (tab) tab.classList.add("active");
  if (name === "invites") loadInvites();
  if (name === "skills") populateSkillsWorkerSelect();
  if (name === "live") startLiveBoard(); else stopLiveBoard();
}

/* ── Live-Belegschaft (Disposition) ─────────────────────
 * Pro-Worker-Live-Status (verfügbar/im Einsatz/endet bald/inaktiv + offene Stundenzettel),
 * Polling alle 30 s (nur solange der Tab aktiv ist). Serverseitig org-gebunden. */
var _liveTimer = null;
var _liveSearchT = null;
var LIVE_POLL_MS = 30000;
/* Die Status-SCHLUESSEL (endet_bald, …) kommen roh vom Server und bleiben —
   uebersetzt wird nur das Label an der Verwendungsstelle. */
var LIVE_STATUS = {
  endet_bald: { labelKey: "mit.live.status.endingSoon", color: "var(--ds-warning,#f59e0b)" },
  im_einsatz: { labelKey: "mit.live.status.onAssignment", color: "var(--ds-brand,#4a9eff)" },
  verfuegbar: { labelKey: "mit.live.status.available",  color: "var(--ds-success,#34d399)" },
  inaktiv:    { labelKey: "mit.live.status.inactive",    color: "var(--ds-text-tertiary,#8d9bba)" }
};

function startLiveBoard() {
  loadLiveBoard();
  if (_liveTimer) clearInterval(_liveTimer);
  _liveTimer = setInterval(loadLiveBoard, LIVE_POLL_MS);
}
function stopLiveBoard() {
  if (_liveTimer) { clearInterval(_liveTimer); _liveTimer = null; }
}
function filterLiveBoard() {
  if (_liveSearchT) clearTimeout(_liveSearchT);
  _liveSearchT = setTimeout(loadLiveBoard, 300);
}
function loadLiveBoard() {
  var q = (document.getElementById("liveSearch") || {}).value || "";
  return api("/workers/live-board" + (q ? "?search=" + encodeURIComponent(q) : "")).then(function(data) {
    renderLiveKpis((data && data.kpis) || {});
    renderLiveList((data && data.workers) || []);
    var u = document.getElementById("liveUpdated");
    if (u) u.textContent = TCi18n.t("mit.live.asOf", { time: new Date().toLocaleTimeString(TCi18n.dateLocale()) });
  }).catch(function() {
    var l = document.getElementById("liveList");
    if (l) l.innerHTML = '<div class="empty-state">' + esc(TCi18n.t("mit.live.loadError")) + '</div>';
  });
}
function renderLiveKpis(k) {
  var el = document.getElementById("liveKpis"); if (!el) return;
  function tile(label, val, color) {
    return '<div style="flex:1;min-width:120px;padding:14px 16px;border:1px solid var(--ds-border,rgba(0,0,0,.1));border-radius:12px;background:var(--ds-bg-surface,#fff)">' +
           '<div style="font-size:24px;font-weight:800;color:' + (color || "var(--ds-text,#0f172a)") + '">' + esc(String(val != null ? val : "–")) + '</div>' +
           '<div style="font-size:12px;color:var(--wk-text-muted,#64748b)">' + esc(label) + '</div></div>';
  }
  el.innerHTML =
    tile(TCi18n.t("mit.live.kpi.utilization"), (k.auslastung_pct != null ? k.auslastung_pct + " %" : "–"), "var(--ds-brand,#4a9eff)") +
    tile(TCi18n.t("mit.live.status.onAssignment"), (k.im_einsatz || 0) + (k.endet_bald ? " (+" + k.endet_bald + ")" : ""), null) +
    tile(TCi18n.t("mit.live.status.available"), k.verfuegbar || 0, "var(--ds-success,#34d399)") +
    tile(TCi18n.t("mit.live.status.endingSoon"), k.endet_bald || 0, "var(--ds-warning,#f59e0b)") +
    tile(TCi18n.t("mit.live.kpi.openTimesheets"), k.open_timesheets || 0, null) +
    tile(TCi18n.t("mit.live.kpi.workforce"), k.total || 0, null);
}
function renderLiveList(workers) {
  var el = document.getElementById("liveList"); if (!el) return;
  if (!workers.length) { el.innerHTML = '<div class="empty-state">' + esc(TCi18n.t("mit.live.empty")) + '</div>'; return; }
  var order = ["endet_bald", "im_einsatz", "verfuegbar", "inaktiv"]; // Handlungsbedarf zuerst
  var html = "";
  order.forEach(function(st) {
    var group = workers.filter(function(w) { return w.live_status === st; });
    if (!group.length) return;
    var cfg = LIVE_STATUS[st] || { labelKey: null, color: "var(--ds-text,#0f172a)" };
    var statusLabel = (cfg.labelKey && TCi18n.t(cfg.labelKey)) || st;
    html += '<div style="margin:18px 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:' + cfg.color + '">' + esc(statusLabel) + ' (' + group.length + ')</div>';
    group.forEach(function(w) {
      var name = esc(((w.first_name || "") + " " + (w.last_name || "")).trim() || "—") +
                 (w.personnel_number ? ' <span style="color:var(--wk-text-muted,#64748b);font-weight:400">#' + esc(w.personnel_number) + '</span>' : "");
      var sub = [];
      if (w.client_name) sub.push(esc(TCi18n.t("mit.live.atClient", { client: w.client_name })));
      if (w.effective_end_date) sub.push(esc(TCi18n.t("mit.live.until", { date: formatDateLabel(w.effective_end_date) })));
      var ts = (w.open_timesheets > 0)
        ? '<a href="/public/worker-submissions-review.html" class="badge" style="background:var(--ds-warning-muted,rgba(245,158,11,.15));color:var(--ds-warning,#b45309);text-decoration:none">' + esc(TCi18n.t("mit.live.timesheetsBadge", { count: w.open_timesheets })) + '</a>'
        : "";
      html += '<div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px">' +
                '<div><div style="font-weight:700">' + name + '</div>' +
                (sub.length ? '<div style="font-size:13px;color:var(--wk-text-muted,#64748b)">' + sub.join(" · ") + '</div>' : "") + '</div>' +
                '<div style="display:flex;gap:8px;align-items:center;flex-shrink:0">' + ts +
                  '<span class="badge" style="background:transparent;border:1px solid ' + cfg.color + ';color:' + cfg.color + '">' + esc(statusLabel) + '</span>' +
                '</div></div>';
    });
  });
  el.innerHTML = html;
}

/* ── Init ────────────────────────────────────────────── */
function init() {
  api("/me").then(function(me) {
    if (!me) { window.location.href = "/"; return; }
    var displayPlan = me.plan || "DEMO";
    if (displayPlan === "FREE") displayPlan = "DEMO";
    var badge = document.getElementById("userBadge");
    if (badge) badge.textContent = (me.company_name || me.email) + " · " + displayPlan;
    loadWorkers();
    loadInvites();
    populateSkillsWorkerSelect();
  }).catch(function() {
    window.location.href = "/";
  });
}

/* ── Workers laden ───────────────────────────────────── */
function loadWorkers() {
  var status = document.getElementById("filterStatus").value;
  var url = "/workers?limit=200";
  if (status) url += "&is_active=" + status;
  api(url).then(function(data) {
    _workers = data.items || [];
    document.getElementById("workerCount").textContent = _workers.length;
    renderWorkers();
  }).catch(function(e) {
    showWorkerUpgradeFromError(e);
    document.getElementById("workerList").innerHTML = '<div class="empty-state"><div class="icon">&#9888;</div>' + esc(e.message || e.error || TCi18n.t("mit.err.load")) + '</div>';
  });
}

function filterWorkers() {
  renderWorkers();
}

function renderWorkers() {
  var q = (document.getElementById("searchInput").value || "").toLowerCase();
  var filtered = _workers.filter(function(w) {
    if (!q) return true;
    var s = ((w.first_name || "") + " " + (w.last_name || "") + " " + (w.email || "") + " " + (w.personnel_number || "")).toLowerCase();
    return s.indexOf(q) >= 0;
  });
  var el = document.getElementById("workerList");
  if (filtered.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="icon">&#128100;</div>' +
      (_workers.length === 0
        ? esc(TCi18n.t("mit.list.emptyNone")) + '<br><button class="btn primary" style="margin-top:12px" onclick="showTab(\'create\')">' + esc(TCi18n.t("mit.list.emptyCta")) + '</button>'
        : esc(TCi18n.t("mit.list.emptyFiltered"))) +
      '</div>';
    return;
  }
  var html = '<table class="w-table"><thead><tr><th>' + esc(TCi18n.t("mit.col.name")) + '</th><th>' + esc(TCi18n.t("mit.col.email")) + '</th><th>' + esc(TCi18n.t("mit.col.personnelNr")) + '</th><th>' + esc(TCi18n.t("mit.col.phone")) + '</th><th>' + esc(TCi18n.t("mit.col.status")) + '</th><th>' + esc(TCi18n.t("mit.col.actions")) + '</th></tr></thead><tbody>';
  filtered.forEach(function(w) {
    var isActive = w.is_active !== false;
    var profileMeta = [];
    if (w.skill_count) profileMeta.push(TCi18n.t("mit.meta.skills", { count: w.skill_count }));
    if (w.qualification_count) profileMeta.push(TCi18n.t("mit.meta.qualifications", { count: w.qualification_count }));
    if (w.document_count) profileMeta.push(TCi18n.t("mit.meta.documents", { count: w.document_count }));
    if (w.expired_document_count) profileMeta.push(TCi18n.t("mit.meta.expired", { count: w.expired_document_count }));
    if (w.expiring_soon_document_count) profileMeta.push(TCi18n.t("mit.meta.expiringSoon", { count: w.expiring_soon_document_count }));
    if (w.next_document_expiry) profileMeta.push(TCi18n.t("mit.meta.nextDeadline", { date: formatDateLabel(w.next_document_expiry) }));
    if (w.profile_public) profileMeta.push(TCi18n.t("mit.meta.publiclyShared"));
    html += '<tr>' +
      '<td class="name">' + esc(w.first_name || "") + ' ' + esc(w.last_name || "") +
        (profileMeta.length ? '<div class="meta">' + esc(profileMeta.join(" · ")) + '</div>' : '') + '</td>' +
      '<td class="meta">' + esc(w.email || "") + '</td>' +
      '<td class="meta">' + esc(w.personnel_number || "–") + '</td>' +
      '<td class="meta">' + esc(w.phone || "–") + '</td>' +
      '<td><span class="status-dot ' + (isActive ? 'active' : 'inactive') + '"></span>' + esc(isActive ? TCi18n.t("mit.status.active") : TCi18n.t("mit.status.inactive")) +
        // Einladungs-/Registrierungsstatus (7c-Bonus): sichtbar in der Liste,
        // nicht nur im Einladungen-Tab — Farben wie renderInvites.
        (w.is_verified ? '<div class="meta"><span class="tag green">' + esc(TCi18n.t("mit.reg.registered")) + '</span></div>'
          : w.invite_status === 'pending' ? '<div class="meta"><span class="tag yellow">' + esc(TCi18n.t("mit.reg.invited")) + '</span></div>'
          : w.invite_status === 'expired' ? '<div class="meta"><span class="tag muted">' + esc(TCi18n.t("mit.reg.inviteExpired")) + '</span></div>'
          : '<div class="meta"><span class="tag muted">' + esc(TCi18n.t("mit.reg.notRegistered")) + '</span></div>') + '</td>' +
      '<td style="white-space:nowrap">' +
        '<button class="action-btn" onclick="openWorkerProfileHub(\'' + w.user_id + '\')">' + esc(TCi18n.t("mit.action.profile")) + '</button> ' +
        '<button class="action-btn" onclick="openEdit(\'' + w.user_id + '\')">' + esc(TCi18n.t("mit.action.edit")) + '</button> ' +
        '<button class="action-btn" onclick="openOfferGen(\'' + w.profile_id + '\')">' + esc(TCi18n.t("mit.action.offers")) + '</button> ' +
        (w.is_verified === false && w.invite_status !== 'pending' ? '<button class="action-btn" onclick="inviteFromRow(\'' + w.profile_id + '\')" title="' + esc(TCi18n.t("mit.action.inviteTitle")) + '">' + esc(TCi18n.t("mit.action.invite")) + '</button> ' : '') +
        (isActive
          ? '<button class="action-btn danger" onclick="toggleActive(\'' + w.user_id + '\', false)">' + esc(TCi18n.t("mit.action.deactivate")) + '</button>'
          : '<button class="action-btn good" onclick="toggleActive(\'' + w.user_id + '\', true)">' + esc(TCi18n.t("mit.action.activate")) + '</button>') +
      '</td></tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

/* ── Worker anlegen ──────────────────────────────────── */
function createWorker() {
  var data = {
    first_name: document.getElementById("cFirstName").value.trim(),
    last_name:  document.getElementById("cLastName").value.trim(),
    email:      document.getElementById("cEmail").value.trim(),
    personnel_number: document.getElementById("cPersonnelNr").value.trim() || null,
    phone:      document.getElementById("cPhone").value.trim() || null,
    city:       document.getElementById("cCity").value.trim() || null,
    street:     document.getElementById("cStreet").value.trim() || null,
    postal_code: document.getElementById("cPostal").value.trim() || null
  };
  var pw = document.getElementById("cPassword").value;
  if (pw) data.password = pw;

  if (!data.first_name || !data.last_name || !data.email) {
    toast(TCi18n.t("mit.err.requiredFields"), "err");
    return;
  }

  document.getElementById("btnCreate").disabled = true;
  api("/workers", { method: "POST", body: data }).then(function() {
    toast(TCi18n.t("mit.ok.created"));
    document.querySelectorAll("#panel-create input").forEach(function(i) { i.value = ""; });
    showTab("list");
    loadWorkers();
  }).catch(function(e) {
    var msg = e.error === "EMAIL_EXISTS" ? TCi18n.t("mit.err.emailExists")
            : e.error === "WORKER_LIMIT_EXCEEDED" ? TCi18n.t("mit.err.limitUpgrade")
            : e.error === "FEATURE_NOT_AVAILABLE" ? TCi18n.t("mit.err.featureUpgrade")
            : (e.message || e.error || TCi18n.t("mit.err.create"));
    showWorkerUpgradeFromError(e);
    toast(msg, "err");
  }).finally(function() {
    document.getElementById("btnCreate").disabled = false;
  });
}

/* ── Worker einladen ─────────────────────────────────── */
function inviteWorker() {
  var data = {
    first_name: document.getElementById("iFirstName").value.trim(),
    last_name:  document.getElementById("iLastName").value.trim(),
    email:      document.getElementById("iEmail").value.trim(),
    personnel_number: document.getElementById("iPersonnelNr").value.trim() || null
  };
  if (!data.first_name || !data.last_name || !data.email) {
    toast(TCi18n.t("mit.err.requiredFields"), "err");
    return;
  }
  document.getElementById("btnInvite").disabled = true;
  api("/worker-invites", { method: "POST", body: data }).then(function() {
    toast(TCi18n.t("mit.ok.inviteSent"));
    document.querySelectorAll("#panel-invite input").forEach(function(i) { i.value = ""; });
    showTab("invites");
    loadInvites();
  }).catch(function(e) {
    var msg = e.error === "INVITE_ALREADY_PENDING" ? TCi18n.t("mit.err.invitePendingEmail")
            : e.error === "WORKER_LIMIT_EXCEEDED" ? TCi18n.t("mit.err.limitReached")
            : e.error === "FEATURE_NOT_AVAILABLE" ? TCi18n.t("mit.err.featureUpgradeShort")
            : (e.message || e.error || TCi18n.t("mit.err.generic"));
    showWorkerUpgradeFromError(e);
    toast(msg, "err");
  }).finally(function() {
    document.getElementById("btnInvite").disabled = false;
  });
}

/* ── 1-Klick-Einladung aus der Worker-Liste (E-Mail vorbefüllt) ──────────── */
function inviteFromRow(profileId) {
  var w = (_workers || []).filter(function(x) { return x.profile_id === profileId; })[0];
  if (!w || !w.email) { toast(TCi18n.t("mit.err.noEmailOnWorker"), "err"); return; }
  api("/worker-invites", {
    method: "POST",
    body: { first_name: w.first_name, last_name: w.last_name, email: w.email, personnel_number: w.personnel_number || undefined }
  }).then(function() {
    toast(TCi18n.t("mit.ok.inviteSentTo", { email: w.email }));
    loadWorkers();
    loadInvites();
  }).catch(function(e) {
    toast(e.error === "INVITE_ALREADY_PENDING" ? TCi18n.t("mit.err.invitePending") : (e.message || e.error || TCi18n.t("mit.err.inviteFailed")), "err");
  });
}

/* ── CSV-Ergebnis → direkt einladen (7c-Bonus) ─────────────────────────────
   Ruft die Bulk-Route direkt: die lokale _workers-Liste ist nach dem Import
   noch stale — der Server kennt die frischen Kandidaten (is_verified=false)
   und dedupliziert ohnehin serverseitig. */
function csvInviteImported(createdCount) {
  if (!window.confirm(TCi18n.t("mit.confirm.inviteImported", { count: createdCount }))) return;
  api("/worker-invites/bulk", { method: "POST", body: {} }).then(function(r) {
    toast(TCi18n.t("mit.ok.bulkInvited", { count: r.invited_count || 0 }) +
      (r.failed_count ? " · " + TCi18n.t("mit.ok.bulkMailErrors", { count: r.failed_count }) : "") + ".");
    showTab("invites");
    loadWorkers();
    loadInvites();
  }).catch(function(e) {
    toast(e.error === "WORKER_LIMIT_EXCEEDED" ? TCi18n.t("mit.err.planLimitUpgrade") : (e.message || e.error || TCi18n.t("mit.err.bulkInviteFailed")), "err");
  });
}

/* ── Alle noch nicht registrierten Mitarbeiter einladen (kollisionsfrei) ──── */
function inviteAllUnregistered() {
  var count = (_workers || []).filter(function(w) { return w.is_verified === false; }).length;
  if (!count) { toast(TCi18n.t("mit.ok.allAlreadyInvited")); return; }
  if (!window.confirm(TCi18n.t("mit.confirm.inviteUnregistered", { count: count }))) return;
  api("/worker-invites/bulk", { method: "POST", body: {} }).then(function(r) {
    toast(TCi18n.t("mit.ok.bulkInvited", { count: r.invited_count || 0 }) +
      (r.failed_count ? " · " + TCi18n.t("mit.ok.bulkSkipped", { count: r.failed_count }) : "") + ".");
    loadWorkers();
    loadInvites();
  }).catch(function(e) {
    toast(e.error === "WORKER_LIMIT_EXCEEDED" ? TCi18n.t("mit.err.planLimitUpgrade") : (e.message || e.error || TCi18n.t("mit.err.bulkInviteFailed")), "err");
  });
}

/* ── Einladungen laden ───────────────────────────────── */
function loadInvites() {
  api("/worker-invites").then(function(data) {
    _invites = data.items || [];
    document.getElementById("inviteCount").textContent = _invites.filter(function(i) { return i.status === "pending"; }).length;
    renderInvites();
  }).catch(function(e) {
    showWorkerUpgradeFromError(e);
    document.getElementById("inviteList").innerHTML = '<div class="empty-state">' + esc(TCi18n.t("mit.invites.loadError")) + '</div>';
  });
}

function renderInvites() {
  var el = document.getElementById("inviteList");
  if (_invites.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="icon">&#128233;</div>' + esc(TCi18n.t("mit.invites.empty")) + '</div>';
    return;
  }
  var statusLabelKeys = { pending: "mit.inviteStatus.pending", accepted: "mit.inviteStatus.accepted", revoked: "mit.inviteStatus.revoked", expired: "mit.inviteStatus.expired" };
  var statusColors = { pending: "yellow", accepted: "green", revoked: "red", expired: "muted" };
  var html = "";
  _invites.forEach(function(inv) {
    var st = inv.status || "pending";
    html += '<div class="invite-item">' +
      '<div class="info"><div class="name">' + esc(inv.first_name) + ' ' + esc(inv.last_name) + '</div><div class="email">' + esc(inv.email) + (inv.personnel_number ? ' · ' + esc(inv.personnel_number) : '') + '</div></div>' +
      '<span class="tag ' + (statusColors[st] || 'muted') + '">' + esc((statusLabelKeys[st] && TCi18n.t(statusLabelKeys[st])) || st) + '</span>' +
      '<div class="actions">' +
        (st === "pending" ? '<button class="action-btn" onclick="resendInvite(\'' + inv.id + '\')">' + esc(TCi18n.t("mit.action.resend")) + '</button><button class="action-btn danger" onclick="revokeInvite(\'' + inv.id + '\')">' + esc(TCi18n.t("mit.action.revoke")) + '</button>' : '') +
      '</div></div>';
  });
  el.innerHTML = html;
}

function resendInvite(id) {
  api("/worker-invites/" + id + "/resend", { method: "POST" }).then(function() {
    toast(TCi18n.t("mit.ok.inviteResent"));
  }).catch(function(e) { toast(e.message || e.error || TCi18n.t("mit.err.generic"), "err"); });
}

function revokeInvite(id) {
  if (!confirm(TCi18n.t("mit.confirm.revokeInvite"))) return;
  api("/worker-invites/" + id + "/revoke", { method: "POST" }).then(function() {
    toast(TCi18n.t("mit.ok.inviteRevoked"));
    loadInvites();
  }).catch(function(e) { toast(e.message || e.error || TCi18n.t("mit.err.generic"), "err"); });
}

/* ── Aktivieren / Deaktivieren ───────────────────────── */
function toggleActive(userId, activate) {
  var action = activate ? "activate" : "deactivate";
  api("/workers/" + userId + "/" + action, { method: "POST" }).then(function() {
    toast(activate ? TCi18n.t("mit.ok.activated") : TCi18n.t("mit.ok.deactivated"));
    loadWorkers();
  }).catch(function(e) {
    toast(e.message || e.error || TCi18n.t("mit.err.generic"), "err");
  });
}

/* ── Bearbeiten ──────────────────────────────────────── */
function openEdit(userId) {
  _editUserId = userId;
  api("/workers/" + userId).then(function(w) {
    document.getElementById("eFirstName").value = w.first_name || "";
    document.getElementById("eLastName").value = w.last_name || "";
    document.getElementById("ePersonnelNr").value = w.personnel_number || "";
    document.getElementById("ePhone").value = w.phone || "";
    document.getElementById("eCity").value = w.city || "";
    document.getElementById("eStreet").value = w.street || "";
    document.getElementById("ePostal").value = w.postal_code || "";
    document.getElementById("eNotes").value = w.notes || "";
    document.getElementById("editModal").classList.add("show");
  }).catch(function(e) { toast(e.message || TCi18n.t("mit.err.generic"), "err"); });
}

function closeEditModal() {
  document.getElementById("editModal").classList.remove("show");
  _editUserId = null;
}

function saveEdit() {
  if (!_editUserId) return;
  var data = {
    first_name:       document.getElementById("eFirstName").value.trim() || undefined,
    last_name:        document.getElementById("eLastName").value.trim() || undefined,
    personnel_number: document.getElementById("ePersonnelNr").value.trim() || null,
    phone:            document.getElementById("ePhone").value.trim() || null,
    city:             document.getElementById("eCity").value.trim() || null,
    street:           document.getElementById("eStreet").value.trim() || null,
    postal_code:      document.getElementById("ePostal").value.trim() || null,
    notes:            document.getElementById("eNotes").value.trim() || null
  };
  api("/workers/" + _editUserId, { method: "PATCH", body: data }).then(function() {
    toast(TCi18n.t("mit.ok.updated"));
    closeEditModal();
    loadWorkers();
  }).catch(function(e) { toast(e.message || e.error || TCi18n.t("mit.err.generic"), "err"); });
}

/* ── Multi-Skill Angebotsgenerator (Welle 3) ─────────── */
var _offerGenProfileId = null;

function openOfferGen(profileId) {
  _offerGenProfileId = profileId;
  var w = (_workers || []).filter(function(x) { return x.profile_id === profileId; })[0];
  var fallbackName = TCi18n.t("mit.og.workerFallback");
  var name = w ? (((w.first_name || "") + " " + (w.last_name || "")).trim() || fallbackName) : fallbackName;
  document.getElementById("ogTitle").textContent = TCi18n.t("mit.og.titleFor", { name: name });
  document.getElementById("ogBody").innerHTML = '<div class="og-loading">' + esc(TCi18n.t("mit.og.loading")) + '</div>';
  document.getElementById("ogFooter").style.display = "none";
  document.getElementById("offerGenModal").classList.add("show");
  api("/capacity-exchange/workers/" + profileId + "/offer-suggestions").then(function(data) {
    renderOfferSuggestions(data);
  }).catch(function(e) {
    document.getElementById("ogBody").innerHTML = '<div class="og-error">' + esc(e.message || e.error || TCi18n.t("mit.og.loadError")) + '</div>';
  });
}

function renderOfferSuggestions(data) {
  var body = document.getElementById("ogBody");
  if (!data.skill_count) {
    body.innerHTML = '<div class="og-empty">' + esc(TCi18n.t("mit.og.noSkills")) + '</div>';
    document.getElementById("ogFooter").style.display = "none";
    return;
  }
  var html = "";
  if (!data.location_ready) {
    html += '<div class="og-warn">' + esc(TCi18n.t("mit.og.noCity")) + '</div>';
  }
  html += '<div class="og-summary">' + esc(TCi18n.t("mit.og.summaryA", { count: data.skill_count })) + ' <strong>' + esc(TCi18n.t("mit.og.summaryB", { count: data.suggested_new_offers })) + '</strong>' +
          (data.existing_offer_count ? ' · ' + esc(TCi18n.t("mit.og.summaryExisting", { count: data.existing_offer_count })) : '') + '</div>';
  html += '<div class="og-section-title">' + esc(TCi18n.t("mit.og.singleTitle")) + '</div><div class="og-chips">';
  (data.single || []).forEach(function(s) {
    if (s.already_exists) {
      html += '<label class="og-chip exists"><input type="checkbox" disabled checked><span>' + esc(s.skill_name) + '</span><em>' + esc(TCi18n.t("mit.og.exists")) + '</em></label>';
    } else {
      html += '<label class="og-chip"><input type="checkbox" class="og-single" value="' + esc(s.skill_id) + '" checked><span>' + esc(s.skill_name) + '</span></label>';
    }
  });
  html += "</div>";
  if (data.bundle) {
    var bundleLabel = TCi18n.t("mit.og.bundleLabel", { count: data.bundle.skill_ids.length });
    html += '<div class="og-section-title">' + esc(TCi18n.t("mit.og.bundleTitle")) + '</div><div class="og-chips">';
    if (data.bundle.already_exists) {
      html += '<label class="og-chip exists"><input type="checkbox" disabled checked><span>' + esc(bundleLabel) + '</span><em>' + esc(TCi18n.t("mit.og.exists")) + '</em></label>';
    } else {
      html += '<label class="og-chip"><input type="checkbox" id="ogBundle" checked><span>' + esc(bundleLabel) + '</span></label>';
    }
    html += "</div>";
  }
  html += '<div class="og-section-title">' + esc(TCi18n.t("mit.og.tierTitle")) + '</div><div class="og-chips" id="ogTier">' +
    '<label class="og-chip"><input type="radio" name="ogTier" value="normal" checked><span>' + esc(TCi18n.t("mit.og.tierStandard")) + '</span></label>' +
    '<label class="og-chip"><input type="radio" name="ogTier" value="notdienst"><span>' + esc(TCi18n.t("mit.og.tierUrgent")) + '</span></label>' +
    '</div>';
  html += '<div class="og-chips" style="margin-top:8px">' +
    '<label class="og-chip"><input type="checkbox" id="ogPremium"><span>' + esc(TCi18n.t("mit.og.premium")) + '</span></label>' +
    '</div>';
  html += '<div class="og-hint">' + esc(TCi18n.t("mit.og.draftHint")) + '</div>';
  body.innerHTML = html;
  document.getElementById("ogFooter").style.display = data.location_ready ? "" : "none";
}

function generateOffers() {
  if (!_offerGenProfileId) return;
  var singleIds = [].slice.call(document.querySelectorAll(".og-single:checked")).map(function(c) { return c.value; });
  var bundleEl = document.getElementById("ogBundle");
  var includeBundle = !!(bundleEl && bundleEl.checked);
  if (!singleIds.length && !includeBundle) { toast(TCi18n.t("mit.og.errSelectOne"), "err"); return; }
  var tierEl = document.querySelector('input[name="ogTier"]:checked');
  var tier = (tierEl && tierEl.value) || "normal";
  var premiumEl = document.getElementById("ogPremium");
  var premium = !!(premiumEl && premiumEl.checked);
  var btn = document.getElementById("ogGenerateBtn");
  var prev = btn.textContent;
  btn.disabled = true; btn.textContent = TCi18n.t("mit.action.creating");
  api("/capacity-exchange/workers/" + _offerGenProfileId + "/generate-offers", {
    method: "POST", body: { single_skill_ids: singleIds, include_bundle: includeBundle, priority_level: tier, premium: premium }
  }).then(function(res) {
    toast(TCi18n.t("mit.og.okCreated", { count: res.created_count }) +
      (res.skipped_count ? " · " + TCi18n.t("mit.og.okSkipped", { count: res.skipped_count }) : "") + ".");
    closeOfferGenModal();
    loadWorkers();
  }).catch(function(e) {
    toast(e.message || e.error || TCi18n.t("mit.err.createFailed"), "err");
  }).finally(function() {
    btn.disabled = false; btn.textContent = prev;
  });
}

function closeOfferGenModal() {
  document.getElementById("offerGenModal").classList.remove("show");
  _offerGenProfileId = null;
}

/* ── Sammelangebot-Generator (Welle 4a) ──────────────── */
var _poolCatalogLoaded = false;
var _poolSkills = []; // [{ id, name }] — eine oder mehrere Fähigkeiten

function openPoolGen() {
  _poolSkills = [];
  renderPoolSkills();
  document.getElementById("poolBody").innerHTML = "";
  document.getElementById("poolFooter").style.display = "none";
  document.getElementById("poolGenModal").classList.add("show");
  if (_poolCatalogLoaded) return;
  api("/skills/catalog").then(function(cat) {
    var sel = document.getElementById("poolSkill");
    (cat.categories || []).forEach(function(c) {
      var og = document.createElement("optgroup");
      og.label = c.category;
      (c.skills || []).forEach(function(s) {
        var o = document.createElement("option");
        o.value = s.id; o.textContent = s.name;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    _poolCatalogLoaded = true;
  }).catch(function() { toast(TCi18n.t("mit.pool.catalogError"), "err"); });
}

function addPoolSkill() {
  var sel = document.getElementById("poolSkill");
  var id = sel.value;
  if (!id) return;
  var name = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : id;
  sel.value = "";
  if (_poolSkills.some(function(s) { return s.id === id; })) return;
  _poolSkills.push({ id: id, name: name });
  renderPoolSkills();
  loadPoolMembers();
}

function removePoolSkill(id) {
  _poolSkills = _poolSkills.filter(function(s) { return s.id !== id; });
  renderPoolSkills();
  if (_poolSkills.length) {
    loadPoolMembers();
  } else {
    document.getElementById("poolBody").innerHTML = "";
    document.getElementById("poolFooter").style.display = "none";
  }
}

function renderPoolSkills() {
  var el = document.getElementById("poolSelectedSkills");
  if (!el) return;
  el.innerHTML = _poolSkills.map(function(s) {
    return '<span class="og-chip" style="cursor:default">' + esc(s.name) +
      ' <a href="#" onclick="removePoolSkill(\'' + esc(s.id) + '\');return false" style="color:var(--ds-danger,#b91c1c);text-decoration:none;font-weight:700">×</a></span>';
  }).join("");
}

function loadPoolMembers() {
  var body = document.getElementById("poolBody");
  var footer = document.getElementById("poolFooter");
  if (!_poolSkills.length) { body.innerHTML = ""; footer.style.display = "none"; return; }
  body.innerHTML = '<div class="og-loading">' + esc(TCi18n.t("mit.pool.loading")) + '</div>';
  var idsParam = _poolSkills.map(function(s) { return s.id; }).join(",");
  api("/capacity-exchange/pool/suggestion?skill_ids=" + encodeURIComponent(idsParam)).then(function(d) {
    if (!d.total) {
      body.innerHTML = '<div class="og-empty">' + esc(_poolSkills.length > 1 ? TCi18n.t("mit.pool.emptyMulti") : TCi18n.t("mit.pool.emptySingle")) + '</div>';
      footer.style.display = "none";
      return;
    }
    var label = (d.skill_names || []).join(" + ");
    var html = '<div class="og-summary">' + esc(TCi18n.t("mit.pool.summaryA", { count: d.total, skills: label })) +
      ' · <strong>' + esc(TCi18n.t("mit.pool.summaryFree", { count: d.free_count })) + '</strong> ' + esc(TCi18n.t("mit.pool.summaryHint")) + '</div><div class="og-chips">';
    (d.members || []).forEach(function(m) {
      var checked = m.free ? "checked" : "";
      var busy = m.free ? "" : ' <em style="font-style:normal;color:var(--ds-text-muted,#64748b)">(' + esc(TCi18n.t("mit.pool.busy")) + ')</em>';
      html += '<label class="og-chip"><input type="checkbox" class="pool-member" value="' + esc(m.worker_profile_id) + '" ' + checked +
        '><span>' + esc(m.name || "—") + (m.city ? ' · ' + esc(m.city) : '') + busy + '</span></label>';
    });
    html += '</div>';
    html += '<div class="og-section-title">' + esc(TCi18n.t("mit.og.tierTitle")) + '</div><div class="og-chips" id="poolTier">' +
      '<label class="og-chip"><input type="radio" name="poolTier" value="normal" checked><span>' + esc(TCi18n.t("mit.og.tierStandard")) + '</span></label>' +
      '<label class="og-chip"><input type="radio" name="poolTier" value="notdienst"><span>' + esc(TCi18n.t("mit.pool.tierUrgent")) + '</span></label>' +
      '</div>';
    html += '<div class="og-chips" style="margin-top:8px"><label class="og-chip"><input type="checkbox" id="poolPremium"><span>' + esc(TCi18n.t("mit.pool.premium")) + '</span></label></div>';
    html += '<div class="og-hint">' + esc(TCi18n.t("mit.pool.draftHint", { kind: d.offer_kind === "pool_multi_skill" ? TCi18n.t("mit.pool.kindMulti") : TCi18n.t("mit.pool.kindSingle") })) + '</div>';
    body.innerHTML = html;
    footer.style.display = "";
  }).catch(function(e) {
    body.innerHTML = '<div class="og-error">' + esc(e.message || e.error || TCi18n.t("mit.pool.loadError")) + '</div>';
    footer.style.display = "none";
  });
}

function generatePool() {
  if (!_poolSkills.length) { toast(TCi18n.t("mit.pool.errSelectSkill"), "err"); return; }
  var ids = [].slice.call(document.querySelectorAll(".pool-member:checked")).map(function(c) { return c.value; });
  if (!ids.length) { toast(TCi18n.t("mit.pool.errSelectWorker"), "err"); return; }
  var tierEl = document.querySelector('input[name="poolTier"]:checked');
  var tier = (tierEl && tierEl.value) || "normal";
  var premiumEl = document.getElementById("poolPremium");
  var premium = !!(premiumEl && premiumEl.checked);
  var btn = document.getElementById("poolGenerateBtn");
  var prev = btn.textContent;
  btn.disabled = true; btn.textContent = TCi18n.t("mit.action.creating");
  api("/capacity-exchange/pool/generate", {
    method: "POST",
    body: { skill_ids: _poolSkills.map(function(s) { return s.id; }), worker_profile_ids: ids, priority_level: tier, premium: premium }
  }).then(function(res) {
    toast(TCi18n.t("mit.pool.okCreated", { count: res.member_count || 0 }));
    closePoolGenModal();
  }).catch(function(e) {
    toast(e.error === "NO_VALID_MEMBERS" ? TCi18n.t("mit.pool.errNoValidMembers") : (e.message || e.error || TCi18n.t("mit.err.createFailed")), "err");
  }).finally(function() {
    btn.disabled = false; btn.textContent = prev;
  });
}

function closePoolGenModal() {
  document.getElementById("poolGenModal").classList.remove("show");
}

document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") closeEditModal();
});

/* ── Profil- & Talent-Hub ───────────────────────────── */
function formatDateInput(value) {
  return value ? String(value).slice(0, 10) : "";
}

/* Datumsanzeige folgt der Sprachwahl: DE 15.01.2026, EN 15/01/2026 (en-GB).
   Bewusst manuell statt toLocaleDateString — reine Datums-Strings wuerden
   sonst je nach Zeitzone auf den Vortag rutschen. */
function formatDateLabel(value) {
  var iso = formatDateInput(value);
  if (!iso) return "–";
  var parts = iso.split("-");
  if (parts.length !== 3) return iso;
  var sep = TCi18n.locale() === "en" ? "/" : ".";
  return parts[2] + sep + parts[1] + sep + parts[0];
}

function publicFieldLabel(field) {
  var key = _publicFieldLabelKeys[field];
  return (key && TCi18n.t(key)) || field;
}

function renderHubList(items, emptyText, renderItem) {
  if (!items || items.length === 0) {
    return '<div class="hub-list-item"><div class="hub-list-title">' + esc(emptyText) + "</div></div>";
  }
  return items.map(renderItem).join("");
}

function normalizeSkillKey(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function getSkillCatalogMeta() {
  if (_skillCatalogMeta) return _skillCatalogMeta;
  var order = {};
  var groups = {};
  var totalSkills = 0;
  SKILL_CATALOG_GROUPS.forEach(function(group) {
    groups[group.id] = group;
    group.skills.forEach(function(skill) {
      var key = normalizeSkillKey(skill);
      if (order[key]) return;
      order[key] = {
        label: skill,
        groupId: group.id,
        groupTitle: group.title,
        index: totalSkills
      };
      totalSkills += 1;
    });
  });
  _skillCatalogMeta = {
    order: order,
    groups: groups,
    totalSkills: totalSkills
  };
  return _skillCatalogMeta;
}

function isCatalogSkill(skill) {
  return !!getSkillCatalogMeta().order[normalizeSkillKey(skill)];
}

function hasSkill(skill) {
  var key = normalizeSkillKey(skill);
  return _currentSkills.some(function(current) { return normalizeSkillKey(current) === key; });
}

function sortSkillList(skills) {
  var catalogOrder = getSkillCatalogMeta().order;
  return (skills || []).slice().sort(function(a, b) {
    var aMeta = catalogOrder[normalizeSkillKey(a)];
    var bMeta = catalogOrder[normalizeSkillKey(b)];
    if (aMeta && bMeta) return aMeta.index - bMeta.index;
    if (aMeta) return -1;
    if (bMeta) return 1;
    return String(a || "").localeCompare(String(b || ""), TCi18n.dateLocale(), { sensitivity: "base" });
  });
}

function setCurrentSkills(skills) {
  var next = [];
  var seen = {};
  (skills || []).forEach(function(skill) {
    var value = String(skill || "").trim().replace(/\s+/g, " ");
    var key = normalizeSkillKey(value);
    if (!value || value.length > 80 || seen[key]) return;
    seen[key] = true;
    if (next.length < MAX_SKILL_TAGS) next.push(value);
  });
  _currentSkills = sortSkillList(next);
}

function addSkillValue(skill, opts) {
  var options = opts || {};
  var value = String(skill || "").trim().replace(/\s+/g, " ");
  if (!value) return false;
  if (hasSkill(value)) return false;
  if (_currentSkills.length >= MAX_SKILL_TAGS) {
    if (!options.silentLimitToast) toast(TCi18n.t("mit.skills.limit", { max: MAX_SKILL_TAGS }), "err");
    return false;
  }
  _currentSkills.push(value);
  _currentSkills = sortSkillList(_currentSkills);
  return true;
}

function removeSkillValue(skill) {
  var key = normalizeSkillKey(skill);
  _currentSkills = _currentSkills.filter(function(current) {
    return normalizeSkillKey(current) !== key;
  });
  _currentSkills = sortSkillList(_currentSkills);
}

function updateSkillSelectionViews() {
  renderSkillTags();
  renderSkillCatalog();
  renderWorkerHubHeader(_currentSkillWorker);
}

function populateSkillsWorkerSelect() {
  var sel = document.getElementById("skillsWorkerSelect");
  if (!sel) return Promise.resolve();
  var current = sel.value || (_currentSkillWorker && (_currentSkillWorker.user_id || _currentSkillWorker.id)) || "";
  return api("/workers?limit=200").then(function(data) {
    var items = data.items || [];
    var placeholder = '<option value="">' + esc(TCi18n.t("mit.hub.selectWorker")) + '</option>';
    sel.innerHTML = placeholder + items.map(function(w) {
      var id = w.user_id || w.id || "";
      var label = ((w.first_name || "") + " " + (w.last_name || "")).trim() || (w.email || TCi18n.t("mit.value.unknown"));
      var meta = [];
      if (w.personnel_number) meta.push(w.personnel_number);
      if (w.profile_public) meta.push(TCi18n.t("mit.value.external"));
      return '<option value="' + esc(id) + '">' + esc(label) + (meta.length ? " (" + esc(meta.join(" · ")) + ")" : "") + "</option>";
    }).join("");
    if (current) sel.value = current;
  }).catch(function(e) {
    showWorkerUpgradeFromError(e);
    sel.innerHTML = '<option value="">' + esc(TCi18n.t("mit.hub.selectWorker")) + '</option>';
  });
}

function resetWorkerHubSelection() {
  _currentSkillWorker = null;
  setCurrentSkills([]);
  _currentQuals = [];
  _currentWorkerDocuments = [];
  _currentWorkerDocumentSummary = null;
  var sel = document.getElementById("skillsWorkerSelect");
  if (sel) sel.value = "";
  ["workerDocumentTitle", "workerDocumentQualification", "workerDocumentIssuer", "workerDocumentValidFrom", "workerDocumentValidUntil", "workerDocumentNotes", "newSkillInput", "skillCatalogSearch"].forEach(function(id) {
    var field = document.getElementById(id);
    if (field) field.value = "";
  });
  var fileInput = document.getElementById("workerDocumentFile");
  if (fileInput) fileInput.value = "";
  var panel = document.getElementById("skillsWorkerPanel");
  var hint = document.getElementById("skillsEmptyHint");
  if (panel) panel.style.display = "none";
  if (hint) hint.style.display = "";
  renderSkillTags();
  renderSkillCatalog();
}

function openWorkerProfileHub(userId) {
  showTab("skills");
  populateSkillsWorkerSelect().then(function() {
    var sel = document.getElementById("skillsWorkerSelect");
    if (!sel) return;
    sel.value = userId;
    loadWorkerSkills();
  });
}

function setPublicFieldSelection(fields) {
  var fieldSet = {};
  (fields || []).forEach(function(field) { fieldSet[field] = true; });
  document.querySelectorAll("#publicProfileFields input[data-public-field]").forEach(function(box) {
    box.checked = !!fieldSet[box.getAttribute("data-public-field")];
  });
}

function getSelectedPublicFields() {
  var fields = [];
  document.querySelectorAll("#publicProfileFields input[data-public-field]").forEach(function(box) {
    if (box.checked) fields.push(box.getAttribute("data-public-field"));
  });
  return fields;
}

function updatePublicProfileControls() {
  var isPublic = !!(document.getElementById("profilePublic") && document.getElementById("profilePublic").checked);
  var fields = getSelectedPublicFields();
  document.querySelectorAll("#publicProfileFields input[data-public-field]").forEach(function(box) {
    box.disabled = !isPublic;
  });
  var linkValue = _currentSkillWorker ? (_currentSkillWorker.public_profile_url || _currentSkillWorker.public_profile_path || "") : "";
  var linkInput = document.getElementById("publicProfileLink");
  var previewLink = document.getElementById("publicProfilePreviewLink");
  var summary = document.getElementById("publicProfilePreviewSummary");
  if (linkInput) linkInput.value = linkValue;
  if (previewLink) {
    previewLink.href = linkValue || "#";
    previewLink.style.opacity = (isPublic && linkValue) ? "1" : ".5";
    previewLink.style.pointerEvents = (isPublic && linkValue) ? "" : "none";
  }
  if (summary) {
    if (!isPublic) summary.textContent = TCi18n.t("mit.public.internalOnly");
    else if (!fields.length) summary.textContent = TCi18n.t("mit.public.pickAtLeastOne");
    else summary.textContent = TCi18n.t("mit.public.shared", { fields: fields.map(publicFieldLabel).join(", ") });
  }
}

function renderWorkerHubHeader(worker) {
  var el = document.getElementById("skillsWorkerHeader");
  if (!el || !worker) return;
  var name = ((worker.first_name || "") + " " + (worker.last_name || "")).trim() || (worker.email || TCi18n.t("mit.value.unknown"));
  var initials = ((worker.first_name || "?").slice(0, 1) + (worker.last_name || "?").slice(0, 1)).toUpperCase();
  var ops = worker.operational_context || {};
  var badges = [
    '<span class="hub-badge info">' + esc(TCi18n.t("mit.hub.badgeCompletion", { percent: worker.profile_completion_percent || 0 })) + '</span>',
    '<span class="hub-badge ' + (worker.profile_public ? "good" : "warn") + '">' + esc(worker.profile_public ? TCi18n.t("mit.hub.badgePublic") : TCi18n.t("mit.hub.badgeInternal")) + '</span>',
    '<span class="hub-badge ' + (worker.linkage && worker.linkage.is_verified ? "good" : "warn") + '">' + esc((worker.linkage && worker.linkage.is_verified) ? TCi18n.t("mit.hub.badgeVerified") : TCi18n.t("mit.hub.badgeUnverified")) + '</span>'
  ];
  el.innerHTML =
    '<div class="hub-hero">' +
      '<div class="hub-hero-main">' +
        '<div class="hub-avatar">' + esc(initials) + "</div>" +
        '<div>' +
          '<h3 class="hub-hero-title">' + esc(name) + "</h3>" +
          '<div class="hub-hero-meta">' +
            '<span>' + esc(worker.email || TCi18n.t("mit.value.noEmail")) + "</span>" +
            '<span>' + esc(TCi18n.t("mit.col.personnelNr")) + ': ' + esc(worker.personnel_number || "–") + "</span>" +
            '<span>' + esc(TCi18n.t("mit.col.status")) + ': ' + esc(worker.is_active === false ? TCi18n.t("mit.status.inactive") : TCi18n.t("mit.status.active")) + "</span>" +
          "</div>" +
          '<div class="hub-badges">' + badges.join("") + "</div>" +
        "</div>" +
      "</div>" +
      '<div class="hub-hero-side">' +
        '<div class="hub-stat"><div class="hub-stat-label">' + esc(TCi18n.t("mit.ops.activeAssignments")) + '</div><div class="hub-stat-value">' + esc(String(ops.active_assignment_count || 0)) + "</div></div>" +
        '<div class="hub-stat"><div class="hub-stat-label">' + esc(TCi18n.t("mit.ops.pendingConfirmations")) + '</div><div class="hub-stat-value">' + esc(String(ops.pending_confirmation_count || 0)) + "</div></div>" +
        '<div class="hub-stat"><div class="hub-stat-label">' + esc(TCi18n.t("mit.public.f.skills")) + '</div><div class="hub-stat-value">' + esc(String((_currentSkills || []).length)) + "</div></div>" +
        '<div class="hub-stat"><div class="hub-stat-label">' + esc(TCi18n.t("mit.public.f.quals")) + '</div><div class="hub-stat-value">' + esc(String((_currentQuals || []).length)) + "</div></div>" +
        '<div class="hub-stat"><div class="hub-stat-label">' + esc(TCi18n.t("mit.hub.statDocuments")) + '</div><div class="hub-stat-value">' + esc(String((_currentWorkerDocuments || []).length)) + "</div></div>" +
      "</div>" +
    "</div>";
}
function renderSkillCatalog() {
  var container = document.getElementById("skillCatalogSections");
  if (!container) return;
  var metaEl = document.getElementById("skillCatalogMeta");
  var searchInput = document.getElementById("skillCatalogSearch");
  var query = (searchInput && searchInput.value || "").trim().toLowerCase();
  var catalogMeta = getSkillCatalogMeta();
  var selectedCatalogCount = _currentSkills.filter(function(skill) { return isCatalogSkill(skill); }).length;
  var customCount = Math.max(0, _currentSkills.length - selectedCatalogCount);
  if (metaEl) {
    var metaParts = [
      TCi18n.t("mit.skills.metaCatalog", { skills: catalogMeta.totalSkills, groups: SKILL_CATALOG_GROUPS.length }),
      TCi18n.t("mit.skills.metaSelected", { count: _currentSkills.length })
    ];
    if (customCount) metaParts.push(TCi18n.t("mit.skills.metaCustom", { count: customCount }));
    if (query) metaParts.push(TCi18n.t("mit.skills.metaFilter", { query: query }));
    metaParts.push(TCi18n.t("mit.skills.metaHint"));
    metaEl.textContent = metaParts.join(" · ");
  }
  var groupsHtml = SKILL_CATALOG_GROUPS.map(function(group) {
    var groupTitle = skillGroupTitle(group);
    var groupDescription = skillGroupDescription(group);
    var visibleSkills = group.skills.filter(function(skill) {
      if (!query) return true;
      // Suche laeuft ueber die angezeigte (uebersetzte) Gruppenbeschriftung
      // UND die deutschen Skill-Namen — beides ist auf dem Schirm sichtbar.
      var haystack = (groupTitle + " " + groupDescription + " " + skill).toLowerCase();
      return haystack.indexOf(query) >= 0;
    });
    if (!visibleSkills.length) return "";
    var selectedCount = group.skills.filter(function(skill) { return hasSkill(skill); }).length;
    var groupMeta = TCi18n.t("mit.skills.groupSelected", { selected: selectedCount, total: group.skills.length });
    if (query) groupMeta = TCi18n.t("mit.skills.groupHits", { count: visibleSkills.length }) + " · " + groupMeta;
    return '<div class="skill-catalog-group">' +
      '<div class="skill-catalog-group__head">' +
        '<div>' +
          '<div class="hub-section-title" style="margin:0 0 2px">' + esc(groupTitle) + '</div>' +
          '<div class="skill-catalog-group__meta">' + esc(groupDescription) + ' · ' + esc(groupMeta) + '</div>' +
        "</div>" +
        '<div class="skill-catalog-group__actions">' +
          '<button type="button" class="action-btn" data-group-id="' + esc(group.id) + '" onclick="selectSkillGroup(this.getAttribute(&quot;data-group-id&quot;))">' + esc(TCi18n.t("mit.skills.selectGroup")) + '</button>' +
          '<button type="button" class="action-btn" data-group-id="' + esc(group.id) + '" onclick="clearSkillGroup(this.getAttribute(&quot;data-group-id&quot;))">' + esc(TCi18n.t("mit.skills.clearGroup")) + '</button>' +
        "</div>" +
      "</div>" +
      '<div class="skill-checkbox-grid">' +
        visibleSkills.map(function(skill) {
          return '<label class="skill-checkbox-option">' +
            '<input type="checkbox" data-skill="' + esc(skill) + '" ' + (hasSkill(skill) ? "checked" : "") + ' onchange="handleSkillCatalogToggle(this)">' +
            '<span>' + esc(skill) + "</span>" +
          "</label>";
        }).join("") +
      "</div>" +
    "</div>";
  }).join("");
  if (!groupsHtml) {
    container.innerHTML = '<div class="hub-list-item"><div class="hub-list-title">' + esc(TCi18n.t("mit.skills.noMatch")) + '</div><div class="hub-list-meta">' + esc(TCi18n.t("mit.skills.noMatchHint")) + '</div></div>';
    return;
  }
  container.innerHTML = groupsHtml;
}

function renderSkillTags() {
  var el = document.getElementById("skillTagsList");
  var summaryEl = document.getElementById("skillSelectionSummary");
  if (!el) return;
  var catalogCount = _currentSkills.filter(function(skill) { return isCatalogSkill(skill); }).length;
  var customCount = Math.max(0, _currentSkills.length - catalogCount);
  if (summaryEl) {
    if (!_currentSkills.length) summaryEl.textContent = TCi18n.t("mit.skills.noneSelected");
    else summaryEl.textContent = TCi18n.t("mit.skills.summary", { total: _currentSkills.length, catalog: catalogCount }) +
      (customCount ? " · " + TCi18n.t("mit.skills.summaryCustom", { count: customCount }) : "");
  }
  if (!_currentSkills.length) {
    el.innerHTML = '<span style="color:var(--wk-text-muted);font-size:13px">' + esc(TCi18n.t("mit.skills.emptyHint")) + '</span>';
    return;
  }
  el.innerHTML = _currentSkills.map(function(skill, index) {
    var customClass = isCatalogSkill(skill) ? "" : " custom";
    var customBadge = isCatalogSkill(skill) ? "" : '<span class="skill-chip-note">' + esc(TCi18n.t("mit.skills.customBadge")) + '</span>';
    return '<span class="hub-chip' + customClass + '">' + esc(skill) + customBadge + '<button onclick="removeSkill(' + index + ')" style="background:none;border:none;color:var(--wk-text-muted);cursor:pointer;font-size:14px;padding:0;line-height:1">&times;</button></span>';
  }).join("");
}

function addSkillTag() {
  var input = document.getElementById("newSkillInput");
  var value = (input && input.value || "").trim();
  if (!value) return;
  addSkillValue(value);
  if (input) input.value = "";
  updateSkillSelectionViews();
}

function handleSkillCatalogToggle(input) {
  if (!input) return;
  var skill = input.getAttribute("data-skill") || "";
  if (input.checked) addSkillValue(skill);
  else removeSkillValue(skill);
  updateSkillSelectionViews();
}

function selectSkillGroup(groupId) {
  var group = getSkillCatalogMeta().groups[groupId];
  if (!group) return;
  var added = 0;
  var limitHit = false;
  group.skills.forEach(function(skill) {
    var alreadySelected = hasSkill(skill);
    if (addSkillValue(skill, { silentLimitToast: true })) added += 1;
    else if (!alreadySelected && _currentSkills.length >= MAX_SKILL_TAGS) limitHit = true;
  });
  updateSkillSelectionViews();
  if (limitHit) toast(TCi18n.t("mit.skills.limit", { max: MAX_SKILL_TAGS }), "err");
  else if (added > 0) toast(TCi18n.t("mit.skills.groupAdded", { group: skillGroupTitle(group), count: added }));
}

function clearSkillGroup(groupId) {
  var group = getSkillCatalogMeta().groups[groupId];
  if (!group) return;
  var before = _currentSkills.length;
  group.skills.forEach(function(skill) { removeSkillValue(skill); });
  updateSkillSelectionViews();
  if (before !== _currentSkills.length) toast(TCi18n.t("mit.skills.groupCleared", { group: skillGroupTitle(group) }));
}

function clearAllSkills() {
  if (!_currentSkills.length) return;
  setCurrentSkills([]);
  updateSkillSelectionViews();
  toast(TCi18n.t("mit.skills.allCleared"));
}

function removeSkill(index) {
  _currentSkills.splice(index, 1);
  _currentSkills = sortSkillList(_currentSkills);
  updateSkillSelectionViews();
}

function getDocumentsForQualification(name) {
  var key = String(name || "").trim().toLowerCase();
  if (!key) return [];
  return (_currentWorkerDocuments || []).filter(function(document) {
    return String(document.qualification_name || "").trim().toLowerCase() === key;
  });
}

/* Kategorie-/Status-SCHLUESSEL kommen vom Server und bleiben unveraendert —
   nur die Beschriftung wird uebersetzt. */
function documentCategoryLabel(category) {
  var keys = {
    qualification: "mit.doc.cat.qualification",
    identity: "mit.doc.cat.identity",
    permit: "mit.doc.cat.permit",
    medical: "mit.doc.cat.medical",
    training: "mit.doc.cat.training",
    other: "mit.doc.cat.other"
  };
  return (keys[category] && TCi18n.t(keys[category])) || TCi18n.t("mit.doc.genericDocument");
}

function documentStatusLabel(status) {
  var keys = {
    pending_review: "mit.doc.status.pendingReview",
    verified: "mit.doc.status.verified",
    rejected: "mit.doc.status.rejected",
    archived: "mit.doc.status.archived",
    expired: "mit.doc.status.expired"
  };
  return (keys[status] && TCi18n.t(keys[status])) || status || TCi18n.t("mit.doc.status.open");
}

function documentBadgeClass(status) {
  if (status === "verified") return "good";
  if (status === "pending_review") return "warn";
  if (status === "expired" || status === "rejected") return "warn";
  return "info";
}

function formatFileSize(bytes) {
  var value = Number(bytes || 0);
  if (!value) return TCi18n.t("mit.doc.noFileSize");
  // Dezimaltrenner folgt der Sprache: 1,4 MB (DE) vs. 1.4 MB (EN).
  if (value >= 1024 * 1024) {
    var mb = (value / (1024 * 1024)).toFixed(1);
    return (TCi18n.locale() === "en" ? mb : mb.replace(".", ",")) + " MB";
  }
  return Math.round(value / 1024) + " KB";
}

function renderQualifications() {
  var el = document.getElementById("qualificationsList");
  if (!el) return;
  if (!_currentQuals.length) {
    el.innerHTML = '<span style="color:var(--wk-text-muted);font-size:13px">' + esc(TCi18n.t("mit.qual.empty")) + '</span>';
    return;
  }
  el.innerHTML = _currentQuals.map(function(qualification, index) {
    var linkedDocuments = getDocumentsForQualification(qualification.name);
    return '<div class="qualification-item">' +
      '<div class="hub-list-head">' +
        '<div class="hub-list-title">' + esc(qualification.name || TCi18n.t("mit.value.unnamed")) + "</div>" +
        '<button onclick="removeQual(' + index + ')" style="background:none;border:none;color:var(--wk-text-muted);cursor:pointer;font-size:14px;line-height:1">&times;</button>' +
      "</div>" +
      '<div class="qualification-meta">' +
        (qualification.issuer ? '<span>' + esc(TCi18n.t("mit.qual.issuer")) + ': ' + esc(qualification.issuer) + "</span>" : "") +
        (qualification.expires_at ? '<span>' + esc(TCi18n.t("mit.qual.validUntil")) + ': ' + esc(formatDateLabel(qualification.expires_at)) + "</span>" : "") +
        (qualification.document_label ? '<span>' + esc(TCi18n.t("mit.qual.proof")) + ': ' + esc(qualification.document_label) + "</span>" : "") +
      "</div>" +
      (qualification.note ? '<div style="font-size:12px;color:var(--wk-text-muted)">' + esc(qualification.note) + "</div>" : "") +
      (linkedDocuments.length ? '<div style="font-size:12px;color:var(--wk-text-muted);margin-top:6px">' + esc(TCi18n.t("mit.qual.linkedDocs")) + ': ' + linkedDocuments.map(function(document) {
        return esc(document.title || document.original_name || TCi18n.t("mit.doc.genericDocument")) + ' (' + esc(documentStatusLabel(document.effective_status || document.status)) + ')';
      }).join(", ") + "</div>" : "") +
    "</div>";
  }).join("");
}

function addQualification() {
  var qualification = {
    name: (document.getElementById("newQualName").value || "").trim(),
    issuer: (document.getElementById("newQualIssuer").value || "").trim() || null,
    expires_at: (document.getElementById("newQualExpiry").value || "").trim() || null,
    document_label: (document.getElementById("newQualDocument").value || "").trim() || null,
    note: (document.getElementById("newQualNote").value || "").trim() || null
  };
  if (!qualification.name) return;
  _currentQuals.push(qualification);
  ["newQualName","newQualIssuer","newQualExpiry","newQualDocument","newQualNote"].forEach(function(id) {
    var field = document.getElementById(id);
    if (field) field.value = "";
  });
  renderQualifications();
  renderWorkerHubHeader(_currentSkillWorker);
}

function removeQual(index) {
  _currentQuals.splice(index, 1);
  renderQualifications();
  renderWorkerHubHeader(_currentSkillWorker);
}

function renderWorkerDocuments() {
  var statsEl = document.getElementById("workerDocumentStats");
  var listEl = document.getElementById("workerDocumentList");
  var summary = _currentWorkerDocumentSummary || { total: 0, verified: 0, pending_review: 0, expired: 0, expiring_soon: 0 };
  if (statsEl) {
    statsEl.innerHTML =
      '<span class="hub-badge info">' + esc(TCi18n.t("mit.doc.statTotal")) + ': ' + esc(String(summary.total || 0)) + "</span>" +
      '<span class="hub-badge good">' + esc(TCi18n.t("mit.doc.status.verified")) + ': ' + esc(String(summary.verified || 0)) + "</span>" +
      '<span class="hub-badge warn">' + esc(TCi18n.t("mit.doc.status.pendingReview")) + ': ' + esc(String(summary.pending_review || 0)) + "</span>" +
      '<span class="hub-badge ' + ((summary.expired || 0) ? "warn" : "info") + '">' + esc(TCi18n.t("mit.doc.status.expired")) + ': ' + esc(String(summary.expired || 0)) + "</span>" +
      '<span class="hub-badge ' + ((summary.expiring_soon || 0) ? "warn" : "info") + '">' + esc(TCi18n.t("mit.doc.statExpiringSoon")) + ': ' + esc(String(summary.expiring_soon || 0)) + "</span>";
  }
  if (!listEl) return;
  listEl.innerHTML = renderHubList(_currentWorkerDocuments || [], TCi18n.t("mit.doc.empty"), function(document) {
    var validity = [];
    if (document.valid_from) validity.push(TCi18n.t("mit.doc.validFromValue", { date: formatDateLabel(document.valid_from) }));
    if (document.valid_until) validity.push(TCi18n.t("mit.doc.validUntilValue", { date: formatDateLabel(document.valid_until) }));
    return '<div class="hub-list-item">' +
      '<div class="hub-list-head">' +
        '<div class="hub-list-title">' + esc(document.title || document.original_name || TCi18n.t("mit.doc.genericDocument")) + "</div>" +
        '<span class="hub-badge ' + documentBadgeClass(document.effective_status || document.status) + '">' + esc(documentStatusLabel(document.effective_status || document.status)) + "</span>" +
      "</div>" +
      '<div class="hub-list-meta">' +
        esc(documentCategoryLabel(document.category)) +
        (document.issuer ? " · " + esc(document.issuer) : "") +
        (document.qualification_name ? " · " + esc(document.qualification_name) : "") +
        (validity.length ? " · " + esc(validity.join(" / ")) : "") +
      "</div>" +
      '<div style="font-size:12px;color:var(--wk-text-muted);margin-top:6px">' +
        esc(formatFileSize(document.file_size_bytes)) +
        (document.review_note ? " · " + esc(document.review_note) : "") +
      "</div>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
        (document.download_path ? '<button class="btn" onclick="downloadWorkerDocument(\'' + esc(document.id) + '\')">' + esc(TCi18n.t("mit.action.download")) + '</button>' : "") +
        '<button class="btn" onclick="verifyWorkerDocument(\'' + esc(document.id) + '\')">' + esc(TCi18n.t("mit.action.verify")) + '</button>' +
        '<button class="btn" onclick="rejectWorkerDocument(\'' + esc(document.id) + '\')">' + esc(TCi18n.t("mit.action.reject")) + '</button>' +
        '<button class="btn" onclick="deleteWorkerDocument(\'' + esc(document.id) + '\')">' + esc(TCi18n.t("mit.action.delete")) + '</button>' +
      "</div>" +
    "</div>";
  });
}

function uploadWorkerDocument() {
  if (!_currentSkillWorker) return;
  var fileInput = document.getElementById("workerDocumentFile");
  var file = fileInput && fileInput.files && fileInput.files[0];
  if (!file) {
    toast(TCi18n.t("mit.doc.errPickFile"), "err");
    return;
  }
  var formData = new FormData();
  formData.append("category", document.getElementById("workerDocumentCategory").value || "qualification");
  formData.append("title", (document.getElementById("workerDocumentTitle").value || "").trim());
  formData.append("qualification_name", (document.getElementById("workerDocumentQualification").value || "").trim());
  formData.append("issuer", (document.getElementById("workerDocumentIssuer").value || "").trim());
  formData.append("valid_from", document.getElementById("workerDocumentValidFrom").value || "");
  formData.append("valid_until", document.getElementById("workerDocumentValidUntil").value || "");
  formData.append("notes", (document.getElementById("workerDocumentNotes").value || "").trim());
  formData.append("file", file);
  api("/workers/" + encodeURIComponent(_currentSkillWorker.user_id || _currentSkillWorker.id) + "/documents", { method: "POST", formData: formData }).then(function() {
    ["workerDocumentTitle", "workerDocumentQualification", "workerDocumentIssuer", "workerDocumentValidFrom", "workerDocumentValidUntil", "workerDocumentNotes"].forEach(function(id) {
      var field = document.getElementById(id);
      if (field) field.value = "";
    });
    if (fileInput) fileInput.value = "";
    toast(TCi18n.t("mit.doc.okStored"));
    loadWorkerSkills();
  }).catch(function(e) {
    var msg = e.error === "FILE_REQUIRED" ? TCi18n.t("mit.doc.errPickFile")
            : e.error === "FILE_TOO_LARGE" ? TCi18n.t("mit.doc.errTooLarge")
            : e.error === "INVALID_MIME" ? (e.message || TCi18n.t("mit.doc.errMime"))
            : (e.message || e.error || TCi18n.t("mit.doc.errStore"));
    toast(msg, "err");
  });
}

function downloadWorkerDocument(documentId) {
  if (!_currentSkillWorker) return;
  window.open("/api/workers/" + encodeURIComponent(_currentSkillWorker.user_id || _currentSkillWorker.id) + "/documents/" + encodeURIComponent(documentId) + "/download", "_blank", "noopener");
}

function verifyWorkerDocument(documentId) {
  if (!_currentSkillWorker) return;
  var note = window.prompt(TCi18n.t("mit.doc.promptVerifyNote"), "") || "";
  api("/workers/" + encodeURIComponent(_currentSkillWorker.user_id || _currentSkillWorker.id) + "/documents/" + encodeURIComponent(documentId) + "/verify", {
    method: "POST",
    body: { note: note.trim() || null }
  }).then(function() {
    toast(TCi18n.t("mit.doc.okVerified"));
    loadWorkerSkills();
  }).catch(function(e) {
    toast(e.message || e.error || TCi18n.t("mit.doc.errVerify"), "err");
  });
}

function rejectWorkerDocument(documentId) {
  if (!_currentSkillWorker) return;
  var note = window.prompt(TCi18n.t("mit.doc.promptRejectReason"), "");
  if (note === null) return;
  if (!String(note).trim()) {
    toast(TCi18n.t("mit.doc.errRejectReason"), "err");
    return;
  }
  api("/workers/" + encodeURIComponent(_currentSkillWorker.user_id || _currentSkillWorker.id) + "/documents/" + encodeURIComponent(documentId) + "/reject", {
    method: "POST",
    body: { note: String(note).trim() }
  }).then(function() {
    toast(TCi18n.t("mit.doc.okRejected"));
    loadWorkerSkills();
  }).catch(function(e) {
    toast(e.message || e.error || TCi18n.t("mit.doc.errReject"), "err");
  });
}

function deleteWorkerDocument(documentId) {
  if (!_currentSkillWorker) return;
  if (!window.confirm(TCi18n.t("mit.doc.confirmDelete"))) return;
  api("/workers/" + encodeURIComponent(_currentSkillWorker.user_id || _currentSkillWorker.id) + "/documents/" + encodeURIComponent(documentId), {
    method: "DELETE"
  }).then(function() {
    toast(TCi18n.t("mit.doc.okDeleted"));
    loadWorkerSkills();
  }).catch(function(e) {
    toast(e.message || e.error || TCi18n.t("mit.doc.errDelete"), "err");
  });
}

function renderWorkerLinkage(worker) {
  var el = document.getElementById("workerLinkageInfo");
  if (!el || !worker) return;
  var linkage = worker.linkage || {};
  var rows = [
    { label: TCi18n.t("mit.linkage.account"), value: linkage.email || worker.email || "–", meta: linkage.is_verified ? TCi18n.t("mit.linkage.verified") : TCi18n.t("mit.linkage.notVerified") },
    { label: TCi18n.t("mit.linkage.createdAt"), value: formatDateLabel(linkage.account_created_at), meta: worker.supplier_org_name || "–" },
    { label: TCi18n.t("mit.linkage.portal"), value: linkage.worker_portal_path || "/public/einsatzportal-profil.html", meta: linkage.org_membership_active === false ? TCi18n.t("mit.linkage.membershipInactive") : TCi18n.t("mit.linkage.portalActive") },
    { label: TCi18n.t("mit.linkage.sharing"), value: worker.profile_public ? TCi18n.t("mit.linkage.sharedExternally") : TCi18n.t("mit.linkage.internalOnly"), meta: (worker.public_profile_preview && worker.public_profile_preview.public_fields || []).map(publicFieldLabel).join(", ") || TCi18n.t("mit.linkage.noFields") }
  ];
  el.innerHTML = rows.map(function(row) {
    return '<div class="hub-linkage-row"><div><strong>' + esc(row.label) + '</strong>' + esc(row.value || "–") + '</div><div style="font-size:12px;color:var(--wk-text-muted);text-align:right">' + esc(row.meta || "–") + "</div></div>";
  }).join("");
}

function getOperationalAssignmentBadge(item) {
  var today = new Date().toISOString().slice(0, 10);
  var state = item && item.assignment_lifecycle_state;
  if (!state) {
    if (item && item.assignment_status === "completed") state = "completed";
    else if (item && item.assignment_status === "cancelled") state = "cancelled";
    else if (item && item.is_active === false) state = "archived";
    else {
      var endDate = item && (item.assignment_effective_end_date || item.end_date || item.asg_end || null);
      if (endDate && endDate < today) state = "expired";
      else if (endDate && endDate === today) state = "ends_today";
      else state = "active";
    }
  }
  if (state === "ends_today") return { tone: "warn", label: TCi18n.t("mit.asgState.endsToday") };
  if (state === "expired") return { tone: "warn", label: TCi18n.t("mit.doc.status.expired") };
  if (state === "completed") return { tone: "good", label: TCi18n.t("mit.asgState.completed") };
  if (state === "cancelled") return { tone: "warn", label: TCi18n.t("mit.asgState.cancelled") };
  if (state === "archived") return { tone: "info", label: TCi18n.t("mit.asgState.archived") };

  var confirmation = item && item.worker_confirmation_status;
  if (confirmation === "pending_confirmation") return { tone: "warn", label: TCi18n.t("mit.asgState.pendingConfirmation") };
  if (confirmation === "worker_unavailable") return { tone: "warn", label: TCi18n.t("mit.asgState.unavailable") };
  if (confirmation === "worker_declined") return { tone: "warn", label: TCi18n.t("mit.doc.status.rejected") };
  return { tone: "good", label: TCi18n.t("mit.status.active") };
}

function renderOperationalContext(worker) {
  var ops = worker.operational_context || {};
  var stats = document.getElementById("workerOpsStats");
  if (stats) {
    var correctionCount = ops.submission_status_counts && ops.submission_status_counts.needs_correction || 0;
    var submittedCount = ops.submission_status_counts && ops.submission_status_counts.submitted || 0;
    stats.innerHTML =
      '<span class="hub-badge info">' + esc(TCi18n.t("mit.ops.activeAssignments")) + ': ' + esc(String(ops.active_assignment_count || 0)) + "</span>" +
      '<span class="hub-badge warn">' + esc(TCi18n.t("mit.ops.pendingConfirmations")) + ': ' + esc(String(ops.pending_confirmation_count || 0)) + "</span>" +
      '<span class="hub-badge info">' + esc(TCi18n.t("mit.ops.submitted")) + ': ' + esc(String(submittedCount)) + "</span>" +
      '<span class="hub-badge ' + (correctionCount ? "warn" : "good") + '">' + esc(TCi18n.t("mit.ops.corrections")) + ': ' + esc(String(correctionCount)) + "</span>";
  }
  var assignmentsEl = document.getElementById("workerAssignmentTimeline");
  if (assignmentsEl) {
    assignmentsEl.innerHTML = renderHubList(ops.recent_assignments || [], TCi18n.t("mit.ops.assignmentsEmpty"), function(item) {
      var badge = getOperationalAssignmentBadge(item);
      return '<div class="hub-list-item">' +
        '<div class="hub-list-head"><div class="hub-list-title">' + esc(item.client_display_name || item.client_name || item.worker_description || TCi18n.t("mit.ops.assignmentFallback")) + '</div><span class="hub-badge ' + esc(badge.tone) + '">' + esc(badge.label) + "</span></div>" +
        '<div class="hub-list-meta">' + esc(formatDateLabel(item.start_date)) + (item.end_date ? " – " + esc(formatDateLabel(item.end_date)) : "") + (item.location_address ? " · " + esc(item.location_address) : "") + "</div>" +
      "</div>";
    });
  }
  var submissionsEl = document.getElementById("workerSubmissionTimeline");
  if (submissionsEl) {
    submissionsEl.innerHTML = renderHubList(ops.recent_submissions || [], TCi18n.t("mit.ops.submissionsEmpty"), function(item) {
      return '<div class="hub-list-item">' +
        '<div class="hub-list-head"><div class="hub-list-title">' + esc(TCi18n.t("mit.ops.weekRange", { from: formatDateLabel(item.week_start), to: formatDateLabel(item.week_end) })) + '</div><span class="hub-badge ' + (item.status === "needs_correction" ? "warn" : "info") + '">' + esc(item.status || TCi18n.t("mit.doc.status.open")) + "</span></div>" +
        '<div class="hub-list-meta">' + esc(TCi18n.t("mit.ops.hours", { hours: item.total_hours || 0 })) + " · " + esc(item.client_name || item.supplier_name || TCi18n.t("mit.ops.noAssignment")) + "</div>" +
      "</div>";
    });
  }
}

function fillWorkerHubForm(worker) {
  document.getElementById("profilePhone").value = worker.phone || "";
  document.getElementById("profileBirthDate").value = formatDateInput(worker.date_of_birth);
  document.getElementById("profileStreet").value = worker.street || "";
  document.getElementById("profilePostal").value = worker.postal_code || "";
  document.getElementById("profileCity").value = worker.city || "";
  document.getElementById("profileLocale").value = worker.preferred_locale || "";
  document.getElementById("availabilityNoteInput").value = worker.availability_note || "";
  document.getElementById("profileTextarea").value = worker.profile_text || "";
  document.getElementById("profileNotes").value = worker.notes || "";
  document.getElementById("profilePublic").checked = !!worker.profile_public;
  setPublicFieldSelection((worker.public_profile_preview && worker.public_profile_preview.public_fields) || worker.public_profile_fields || []);
}

function loadWorkerSkills() {
  var sel = document.getElementById("skillsWorkerSelect");
  var id = sel && sel.value;
  var panel = document.getElementById("skillsWorkerPanel");
  var hint = document.getElementById("skillsEmptyHint");
  if (!id) {
    if (panel) panel.style.display = "none";
    if (hint) hint.style.display = "";
    return;
  }
  api("/workers/" + encodeURIComponent(id)).then(function(worker) {
    _currentSkillWorker = worker;
    setCurrentSkills((worker.skill_tags || []).slice());
    _currentQuals = (worker.qualifications || []).slice();
    _currentWorkerDocuments = (worker.document_hub && worker.document_hub.recent_documents || []).slice();
    _currentWorkerDocumentSummary = worker.document_hub && worker.document_hub.summary || null;
    if (panel) panel.style.display = "";
    if (hint) hint.style.display = "none";
    fillWorkerHubForm(worker);
    renderSkillCatalog();
    renderSkillTags();
    renderQualifications();
    renderWorkerDocuments();
    renderWorkerHubHeader(worker);
    renderWorkerLinkage(worker);
    renderOperationalContext(worker);
    updatePublicProfileControls();
  }).catch(function(e) {
    toast(e.message || e.error || TCi18n.t("mit.hub.errLoadProfile"), "err");
  });
}

function saveWorkerHub() {
  if (!_currentSkillWorker) return;
  var isPublic = !!document.getElementById("profilePublic").checked;
  var publicFields = getSelectedPublicFields();
  if (isPublic && publicFields.length === 0) {
    toast(TCi18n.t("mit.public.pickAtLeastOne"), "err");
    return;
  }
  var body = {
    phone: document.getElementById("profilePhone").value.trim() || null,
    date_of_birth: document.getElementById("profileBirthDate").value || null,
    street: document.getElementById("profileStreet").value.trim() || null,
    postal_code: document.getElementById("profilePostal").value.trim() || null,
    city: document.getElementById("profileCity").value.trim() || null,
    preferred_locale: document.getElementById("profileLocale").value.trim() || null,
    availability_note: document.getElementById("availabilityNoteInput").value.trim() || null,
    profile_text: document.getElementById("profileTextarea").value.trim() || null,
    notes: document.getElementById("profileNotes").value.trim() || null,
    skill_tags: _currentSkills.slice(),
    qualifications: _currentQuals.slice(),
    profile_public: isPublic,
    public_profile_fields: publicFields
  };
  api("/workers/" + encodeURIComponent(_currentSkillWorker.user_id || _currentSkillWorker.id), { method: "PATCH", body: body }).then(function(worker) {
    _currentSkillWorker = worker;
    setCurrentSkills((worker.skill_tags || []).slice());
    _currentQuals = (worker.qualifications || []).slice();
    _currentWorkerDocuments = (worker.document_hub && worker.document_hub.recent_documents || []).slice();
    _currentWorkerDocumentSummary = worker.document_hub && worker.document_hub.summary || null;
    fillWorkerHubForm(worker);
    renderSkillCatalog();
    renderSkillTags();
    renderQualifications();
    renderWorkerDocuments();
    renderWorkerHubHeader(worker);
    renderWorkerLinkage(worker);
    renderOperationalContext(worker);
    updatePublicProfileControls();
    loadWorkers();
    populateSkillsWorkerSelect();
    toast(TCi18n.t("mit.hub.okSaved"));
  }).catch(function(e) {
    var msg = e.error === "PUBLIC_FIELDS_REQUIRED" ? TCi18n.t("mit.hub.errPublicFields")
            : e.error === "NO_FIELDS" ? TCi18n.t("mit.hub.errNoChanges")
            : (e.message || e.error || TCi18n.t("mit.err.save"));
    toast(msg, "err");
  });
}

function copyPublicProfileLink() {
  var link = document.getElementById("publicProfileLink");
  if (!document.getElementById("profilePublic").checked || !link || !link.value) {
    toast(TCi18n.t("mit.public.errNoActiveShare"), "err");
    return;
  }
  function fallbackCopy() {
    link.focus();
    link.select();
    try {
      document.execCommand("copy");
      toast(TCi18n.t("mit.public.okCopied"));
    } catch (_) {
      toast(TCi18n.t("mit.public.errCopy"), "err");
    }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link.value).then(function() {
      toast(TCi18n.t("mit.public.okCopied"));
    }).catch(fallbackCopy);
  } else {
    fallbackCopy();
  }
}

function saveSkills() { saveWorkerHub(); }
function saveProfile() { saveWorkerHub(); }

/* ══════════════════════════════════════════════════════════
   CSV-Import Wizard
   ══════════════════════════════════════════════════════════ */
var _csvData = { headers: [], rows: [], mapping: {}, validated: [], dupInfo: {} };

/* labelKey = Anzeige (uebersetzt), key + aliases = Datenvertrag (bleiben roh:
   die Aliase matchen echte CSV-Kopfzeilen und duerfen nie uebersetzt werden). */
var CSV_FIELDS = [
  { key: "email",            labelKey: "mit.field.emailReq",       required: true,  aliases: ["email","e-mail","mail","e_mail","emailaddress","e-mailadresse"] },
  { key: "first_name",       labelKey: "mit.field.firstNameReq",   required: true,  aliases: ["first_name","vorname","firstname","given_name","givenname","vname"] },
  { key: "last_name",        labelKey: "mit.field.lastNameReq",    required: true,  aliases: ["last_name","nachname","lastname","surname","family_name","familyname","nname","zuname"] },
  { key: "personnel_number", labelKey: "mit.field.personnelNr",    required: false, aliases: ["personnel_number","personalnummer","personnelnumber","personal_nr","personnr","pnr","mitarbeiter_nr","employee_id","mitarbeiternummer","staffnr"] },
  { key: "phone",            labelKey: "mit.field.phone",          required: false, aliases: ["phone","telefon","tel","telephone","mobile","handy","mobilnummer","mobiltelefon","rufnummer"] },
  { key: "street",           labelKey: "mit.field.street",         required: false, aliases: ["street","strasse","stra\u00dfe","address","adresse","anschrift"] },
  { key: "postal_code",      labelKey: "mit.field.postal",         required: false, aliases: ["postal_code","plz","postalcode","zip","zipcode","postleitzahl"] },
  { key: "city",             labelKey: "mit.field.city",           required: false, aliases: ["city","stadt","ort","wohnort","location","standort"] },
  { key: "country",          labelKey: "mit.field.country",        required: false, aliases: ["country","land","laendercode","countrycode"] },
  { key: "date_of_birth",    labelKey: "mit.field.birthDate",      required: false, aliases: ["date_of_birth","geburtsdatum","dob","birthday","birthdate","geburtstag","geb_datum"] },
  { key: "notes",            labelKey: "mit.field.notes",          required: false, aliases: ["notes","notizen","bemerkung","kommentar","comment","anmerkung","info"] }
];

/** Anzeigename eines CSV-Feldes (mit "*" bei Pflichtfeldern, wie im Woerterbuch). */
function csvFieldLabel(field) {
  return (field && TCi18n.t(field.labelKey)) || (field && field.key) || "";
}
/** Anzeigename ohne Pflicht-Sternchen \u2014 fuer Fehlermeldungen. */
function csvFieldName(field) {
  return csvFieldLabel(field).replace(" *", "");
}
// Enterprise: Zusaetzliche Felder koennen per Org-Konfiguration hinzugefuegt werden
// z.B. Abteilung, Kostenstelle, Qualifikation, Fuehrerschein etc.
// Die API akzeptiert beliebige Zusatzfelder im 'notes' Feld als JSON-Erweiterung.

/* ── CSV Parsing ─────────────────────────────────────── */
function csvDetectDelimiter(text) {
  var first = text.split(/\r?\n/)[0] || "";
  var counts = { ";":0, ",":0, "\t":0 };
  for (var i = 0; i < first.length; i++) {
    if (counts[first[i]] !== undefined) counts[first[i]]++;
  }
  if (counts[";"] >= counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] >= counts[","]) return "\t";
  return ",";
}

function csvParseLine(line, delim) {
  var fields = [];
  var current = "";
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = false; }
      } else { current += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === delim) { fields.push(current.trim()); current = ""; }
      else { current += c; }
    }
  }
  fields.push(current.trim());
  return fields;
}

function csvParseText(text) {
  var delim = csvDetectDelimiter(text);
  var lines = text.split(/\r?\n/).filter(function(l) { return l.trim() !== ""; });
  if (lines.length < 2) { toast(TCi18n.t("mit.csv.errMinRows"), "err"); return false; }
  if (lines.length > 1001) { toast(TCi18n.t("mit.csv.errMaxRows", { max: 1000, found: lines.length - 1 }), "err"); return false; }
  var headers = csvParseLine(lines[0], delim);
  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    var vals = csvParseLine(lines[i], delim);
    if (vals.length === 1 && vals[0] === "") continue;
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = (vals[j] || "").trim();
    }
    row._row = i + 1;
    rows.push(row);
  }
  _csvData.headers = headers;
  _csvData.rows = rows;
  return true;
}

/* ── Drag & Drop / File Input ────────────────────────── */
function csvInitUpload() {
  var dz = document.getElementById("csv-dropzone");
  var fi = document.getElementById("csv-file-input");
  dz.addEventListener("click", function() { fi.click(); });
  dz.addEventListener("dragover", function(e) { e.preventDefault(); dz.style.borderColor = "var(--tc-tone-brand-border)"; });
  dz.addEventListener("dragleave", function() { dz.style.borderColor = "var(--tc-dash-border)"; });
  dz.addEventListener("drop", function(e) {
    e.preventDefault(); dz.style.borderColor = "var(--tc-dash-border)";
    if (e.dataTransfer.files.length) csvHandleFile(e.dataTransfer.files[0]);
  });
  fi.addEventListener("change", function() {
    if (fi.files.length) csvHandleFile(fi.files[0]);
  });
}

function csvHandleFile(file) {
  if (!file.name.match(/\.(csv|txt)$/i)) { toast(TCi18n.t("mit.csv.errNotCsv"), "err"); return; }
  if (file.size > 5 * 1024 * 1024) { toast(TCi18n.t("mit.csv.errFileTooLarge"), "err"); return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    var text = e.target.result;
    if (csvParseText(text)) {
      document.getElementById("csv-file-name").textContent = file.name;
      document.getElementById("csv-file-meta").textContent = TCi18n.t("mit.csv.fileMeta", { rows: _csvData.rows.length, columns: _csvData.headers.length });
      document.getElementById("csv-file-info").style.display = "block";
      setTimeout(function() { csvGoStep(2); }, 400);
    }
  };
  reader.readAsText(file, "UTF-8");
}

/* ── Step Navigation ─────────────────────────────────── */
function csvGoStep(n) {
  for (var s = 1; s <= 4; s++) {
    var panel = document.getElementById("csv-step-" + s);
    if (panel) panel.style.display = s === n ? "block" : "none";
  }
  document.querySelectorAll("#csv-steps .csv-step").forEach(function(el) {
    var step = parseInt(el.getAttribute("data-step"));
    el.className = "csv-step" + (step === n ? " csv-step--active" : (step < n ? " csv-step--done" : ""));
  });
  if (n === 2) csvBuildMapping();
  if (n === 3) csvRunValidation();
}

/* ── Step 2: Column Mapping ──────────────────────────── */
function csvAutoMap() {
  var mapping = {};
  _csvData.headers.forEach(function(h) {
    var lower = h.toLowerCase().replace(/[^a-z0-9_äöüß]/g, "");
    for (var i = 0; i < CSV_FIELDS.length; i++) {
      var f = CSV_FIELDS[i];
      for (var j = 0; j < f.aliases.length; j++) {
        if (lower === f.aliases[j].replace(/[^a-z0-9_äöüß]/g, "")) {
          if (!mapping[h]) mapping[h] = f.key;
          break;
        }
      }
    }
  });
  return mapping;
}

function csvBuildMapping() {
  _csvData.mapping = csvAutoMap();
  var grid = document.getElementById("csv-mapping-grid");
  var html = '<div style="font-size:11px;font-weight:700;color:var(--wk-text-muted);text-transform:uppercase">' + esc(TCi18n.t("mit.csv.colCsv")) + '</div>' +
             '<div></div>' +
             '<div style="font-size:11px;font-weight:700;color:var(--wk-text-muted);text-transform:uppercase">' + esc(TCi18n.t("mit.csv.colTarget")) + '</div>';
  _csvData.headers.forEach(function(h) {
    var sample = "";
    for (var i = 0; i < Math.min(3, _csvData.rows.length); i++) {
      if (_csvData.rows[i][h]) { sample = _csvData.rows[i][h]; break; }
    }
    html += '<div class="csv-mapping-row">';
    html += '<div class="csv-col-name">' + esc(h) + (sample ? '<br><span style="font-size:11px;color:var(--wk-text-muted);font-weight:400">' + esc(TCi18n.t("mit.csv.sample", { value: sample })) + '</span>' : '') + '</div>';
    html += '<div class="csv-arrow">\u2192</div>';
    html += '<select onchange="csvUpdateMapping(\'' + esc(h).replace(/'/g, "\\'") + '\', this.value)">';
    html += '<option value="">' + esc(TCi18n.t("mit.csv.doNotImport")) + '</option>';
    CSV_FIELDS.forEach(function(f) {
      var sel = (_csvData.mapping[h] === f.key) ? ' selected' : '';
      html += '<option value="' + f.key + '"' + sel + '>' + esc(csvFieldLabel(f)) + '</option>';
    });
    html += '</select>';
    html += '</div>';
  });
  grid.innerHTML = html;
}

function csvUpdateMapping(csvCol, fieldKey) {
  if (fieldKey) {
    Object.keys(_csvData.mapping).forEach(function(k) {
      if (_csvData.mapping[k] === fieldKey && k !== csvCol) delete _csvData.mapping[k];
    });
    _csvData.mapping[csvCol] = fieldKey;
  } else {
    delete _csvData.mapping[csvCol];
  }
  csvBuildMapping();
}

/* ── Step 3: Validation ──────────────────────────────── */
function csvRunValidation() {
  var mappedFields = {};
  Object.keys(_csvData.mapping).forEach(function(csvCol) {
    mappedFields[_csvData.mapping[csvCol]] = csvCol;
  });
  var required = CSV_FIELDS.filter(function(f) { return f.required; });
  var missingRequired = required.filter(function(f) { return !mappedFields[f.key]; });
  if (missingRequired.length > 0) {
    toast(TCi18n.t("mit.csv.errMissingRequired", { fields: missingRequired.map(csvFieldLabel).join(", ") }), "err");
    csvGoStep(2);
    return;
  }

  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var validated = [];
  var okCount = 0;
  var errCount = 0;
  var emails = {};

  _csvData.rows.forEach(function(row) {
    var rec = { _row: row._row, _errors: [], _data: {} };
    CSV_FIELDS.forEach(function(f) {
      var csvCol = mappedFields[f.key];
      var val = csvCol ? (row[csvCol] || "").trim() : "";
      if (f.required && !val) { rec._errors.push(TCi18n.t("mit.csv.errFieldMissing", { field: csvFieldName(f) })); }
      if (f.key === "email" && val && !emailRe.test(val)) { rec._errors.push(TCi18n.t("mit.csv.errInvalidEmail")); }
      if (f.key === "email" && val) {
        var lower = val.toLowerCase();
        if (emails[lower]) { rec._errors.push(TCi18n.t("mit.csv.errDuplicateEmail", { row: emails[lower] })); }
        else { emails[lower] = row._row; }
      }
      rec._data[f.key] = val;
    });
    if (rec._errors.length > 0) errCount++; else okCount++;
    validated.push(rec);
  });
  _csvData.validated = validated;

  var summary = document.getElementById("csv-validation-summary");
  summary.innerHTML =
    '<div class="csv-kpi info"><span class="num">' + validated.length + '</span> ' + esc(TCi18n.t("mit.csv.kpiTotal")) + '</div>' +
    '<div class="csv-kpi ok"><span class="num">' + okCount + '</span> ' + esc(TCi18n.t("mit.csv.kpiValid")) + '</div>' +
    '<div class="csv-kpi err"><span class="num">' + errCount + '</span> ' + esc(TCi18n.t("mit.csv.kpiErrors")) + '</div>';

  csvCheckDuplicates(function(dupInfo) {
    _csvData.dupInfo = dupInfo || {};
    var dupCount = Object.keys(_csvData.dupInfo).length;
    if (dupCount > 0) {
      summary.innerHTML += '<div class="csv-kpi dup"><span class="num">' + dupCount + '</span> ' + esc(TCi18n.t("mit.csv.kpiDuplicates")) + '</div>';
    }
    csvRenderValidationTable();
    document.getElementById("csv-btn-import").disabled = (okCount === 0 && errCount > 0);
  });
}

function csvCheckDuplicates(cb) {
  var emails = _csvData.validated
    .filter(function(r) { return r._data.email && r._errors.length === 0; })
    .map(function(r) { return r._data.email; });
  if (emails.length === 0) { cb({}); return; }
  api("/workers/check-duplicates", { method: "POST", body: { emails: emails } })
    .then(function(res) { cb(res.duplicates || {}); })
    .catch(function() { cb({}); });
}

function csvRenderValidationTable() {
  var el = document.getElementById("csv-validation-table");
  var html = '<table class="w-table"><thead><tr><th>#</th><th>' + esc(TCi18n.t("mit.col.email")) + '</th><th>' + esc(TCi18n.t("mit.field.firstName")) + '</th><th>' + esc(TCi18n.t("mit.field.lastName")) + '</th><th>' + esc(TCi18n.t("mit.col.status")) + '</th></tr></thead><tbody>';
  _csvData.validated.forEach(function(rec) {
    var email = rec._data.email || "";
    var isDup = _csvData.dupInfo[email.toLowerCase()];
    var hasErr = rec._errors.length > 0;
    var statusHtml;
    if (hasErr) {
      statusHtml = '<span class="csv-val-err">\u2716 ' + esc(rec._errors[0]) + (rec._errors.length > 1 ? ' (+' + (rec._errors.length - 1) + ')' : '') + '</span>';
    } else if (isDup) {
      statusHtml = '<span class="csv-val-dup">\u2194 ' + esc(TCi18n.t("mit.csv.rowDuplicate")) + '</span>';
    } else {
      statusHtml = '<span class="csv-val-ok">\u2714 ' + esc(TCi18n.t("mit.csv.rowOk")) + '</span>';
    }
    html += '<tr><td>' + rec._row + '</td><td class="meta">' + esc(email) + '</td><td>' + esc(rec._data.first_name) + '</td><td>' + esc(rec._data.last_name) + '</td><td>' + statusHtml + '</td></tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

/* ── Step 4: Execute Import ──────────────────────────── */
function csvExecuteImport() {
  var btn = document.getElementById("csv-btn-import");
  btn.disabled = true;
  btn.textContent = TCi18n.t("mit.csv.importing");
  csvGoStep(4);

  var progress = document.getElementById("csv-progress");
  var bar = document.getElementById("csv-progress-bar");
  var ptext = document.getElementById("csv-progress-text");
  progress.style.display = "block";
  bar.style.width = "20%";
  ptext.textContent = TCi18n.t("mit.csv.transferring");

  var strategy = document.getElementById("csv-dup-strategy").value;
  var workers = _csvData.validated
    .filter(function(r) { return r._errors.length === 0; })
    .map(function(r) {
      var clean = {};
      Object.keys(r._data).forEach(function(k) {
        var v = r._data[k];
        clean[k] = (v === "" || v === undefined) ? null : v;
      });
      return clean;
    });

  if (workers.length === 0) {
    bar.style.width = "100%";
    ptext.textContent = TCi18n.t("mit.csv.noValidRows");
    document.getElementById("csv-result-summary").innerHTML = '<div class="csv-kpi err"><span class="num">0</span> ' + esc(TCi18n.t("mit.csv.noValidRowsShort")) + '</div>';
    return;
  }

  bar.style.width = "50%";
  ptext.textContent = TCi18n.t("mit.csv.importingRows", { count: workers.length });

  api("/workers/import", { method: "POST", body: { workers: workers, on_duplicate: strategy } })
    .then(function(res) {
      bar.style.width = "100%";
      ptext.textContent = TCi18n.t("mit.csv.importDone");
      csvShowResult(res);
    })
    .catch(function(e) {
      bar.style.width = "100%";
      bar.style.background = "var(--tc-tone-danger-border)";
      var msg = e.error === "FEATURE_NOT_AVAILABLE" ? TCi18n.t("mit.err.featureUpgrade")
              : e.error === "WORKER_LIMIT_EXCEEDED" ? TCi18n.t("mit.err.limitReached")
              : (e.message || e.error || TCi18n.t("mit.csv.importFailed"));
      showWorkerUpgradeFromError(e);
      ptext.textContent = TCi18n.t("mit.csv.errorPrefix", { message: msg });
      document.getElementById("csv-result-summary").innerHTML = '<div class="csv-kpi err" style="width:100%"><span class="num">!</span> ' + esc(msg) + '</div>';
    });
}

function csvShowResult(res) {
  var summary = document.getElementById("csv-result-summary");
  var created = (res.created || []).length;
  var updated = (res.updated || []).length;
  var skipped = (res.skipped || []).length;
  var errors  = (res.errors  || []).length;
  summary.innerHTML =
    '<div class="csv-kpi ok"><span class="num">' + created + '</span> ' + esc(TCi18n.t("mit.csv.kpiCreated")) + '</div>' +
    '<div class="csv-kpi info"><span class="num">' + updated + '</span> ' + esc(TCi18n.t("mit.csv.kpiUpdated")) + '</div>' +
    '<div class="csv-kpi dup"><span class="num">' + skipped + '</span> ' + esc(TCi18n.t("mit.csv.kpiSkipped")) + '</div>' +
    (errors > 0 ? '<div class="csv-kpi err"><span class="num">' + errors + '</span> ' + esc(TCi18n.t("mit.csv.kpiErrors")) + '</div>' : '') +
    // 7c-Bonus: Import endet nicht in der Sackgasse \u2014 die frisch importierten
    // Kraefte (is_verified=false) sind jetzt Einladungs-Kandidaten.
    (created > 0
      ? '<div style="flex-basis:100%;margin-top:10px"><button class="btn primary" onclick="csvInviteImported(' + created + ')" title="' + esc(TCi18n.t("mit.list.inviteAllTitle")) + '">' +
        esc(TCi18n.t("mit.csv.inviteImportedCta", { count: created })) + '</button></div>'
      : '');

  var details = document.getElementById("csv-result-details");
  var html = '';
  if (res.errors && res.errors.length > 0) {
    html += '<h3 style="font-size:14px;font-weight:700;color:var(--tc-tone-danger-strong-text);margin:0 0 8px">' + esc(TCi18n.t("mit.csv.kpiErrors")) + '</h3>';
    html += '<div style="margin-bottom:16px">';
    res.errors.forEach(function(err) {
      html += '<div style="padding:6px 10px;margin-bottom:4px;border-radius:8px;background:var(--tc-tone-danger-bg);border:1px solid var(--tc-tone-danger-border);font-size:12px">';
      html += '<strong>' + esc(TCi18n.t("mit.csv.rowLabel", { row: err.row || '?' })) + '</strong> ' + esc(err.error || err.message || TCi18n.t("mit.csv.unknownError"));
      if (err.email) html += ' <span style="color:var(--wk-text-muted)">(' + esc(err.email) + ')</span>';
      html += '</div>';
    });
    html += '</div>';
  }
  if (res.created && res.created.length > 0) {
    html += '<h3 style="font-size:14px;font-weight:700;color:var(--tc-tone-success-strong-text);margin:0 0 8px">' + esc(TCi18n.t("mit.csv.headCreated", { count: res.created.length })) + '</h3>';
    html += '<div style="margin-bottom:16px;font-size:12px;color:var(--wk-text-muted)">';
    res.created.slice(0, 20).forEach(function(w) {
      html += '<div>' + esc(w.email || w.first_name + ' ' + w.last_name) + '</div>';
    });
    if (res.created.length > 20) html += '<div>' + esc(TCi18n.t("mit.csv.andMore", { count: res.created.length - 20 })) + '</div>';
    html += '</div>';
  }
  if (res.updated && res.updated.length > 0) {
    html += '<h3 style="font-size:14px;font-weight:700;color:var(--tc-tone-brand-text);margin:0 0 8px">' + esc(TCi18n.t("mit.csv.headUpdated", { count: res.updated.length })) + '</h3>';
    html += '<div style="margin-bottom:16px;font-size:12px;color:var(--wk-text-muted)">';
    res.updated.slice(0, 20).forEach(function(w) {
      html += '<div>' + esc(w.email || w.first_name + ' ' + w.last_name) + '</div>';
    });
    if (res.updated.length > 20) html += '<div>' + esc(TCi18n.t("mit.csv.andMore", { count: res.updated.length - 20 })) + '</div>';
    html += '</div>';
  }
  details.innerHTML = html;
}

/* ── Reset Wizard ────────────────────────────────────── */
function csvReset() {
  _csvData = { headers: [], rows: [], mapping: {}, validated: [], dupInfo: {} };
  document.getElementById("csv-file-input").value = "";
  document.getElementById("csv-file-info").style.display = "none";
  document.getElementById("csv-mapping-grid").innerHTML = "";
  document.getElementById("csv-validation-summary").innerHTML = "";
  document.getElementById("csv-validation-table").innerHTML = "";
  document.getElementById("csv-result-summary").innerHTML = "";
  document.getElementById("csv-result-details").innerHTML = "";
  document.getElementById("csv-progress").style.display = "none";
  document.getElementById("csv-progress-bar").style.width = "0%";
  document.getElementById("csv-progress-bar").style.background = "linear-gradient(90deg,var(--ds-brand),var(--ds-success))";
  document.getElementById("csv-btn-import").disabled = true;
  document.getElementById("csv-btn-import").textContent = TCi18n.t("mit.csv.startImport");
  csvGoStep(1);
}

/* ── Expose functions called from HTML onclick handlers ──── */
window.showTab = showTab;
window.filterWorkers = filterWorkers;
window.createWorker = createWorker;
window.inviteWorker = inviteWorker;
window.resendInvite = resendInvite;
window.revokeInvite = revokeInvite;
window.toggleActive = toggleActive;
window.openEdit = openEdit;
window.saveEdit = saveEdit;
window.populateSkillsWorkerSelect = populateSkillsWorkerSelect;
window.loadWorkerSkills = loadWorkerSkills;
window.openWorkerProfileHub = openWorkerProfileHub;
window.resetWorkerHubSelection = resetWorkerHubSelection;
window.renderSkillCatalog = renderSkillCatalog;
window.handleSkillCatalogToggle = handleSkillCatalogToggle;
window.selectSkillGroup = selectSkillGroup;
window.clearSkillGroup = clearSkillGroup;
window.clearAllSkills = clearAllSkills;
window.addSkillTag = addSkillTag;
window.removeSkill = removeSkill;
window.addQualification = addQualification;
window.removeQual = removeQual;
window.uploadWorkerDocument = uploadWorkerDocument;
window.downloadWorkerDocument = downloadWorkerDocument;
window.verifyWorkerDocument = verifyWorkerDocument;
window.rejectWorkerDocument = rejectWorkerDocument;
window.deleteWorkerDocument = deleteWorkerDocument;
window.updatePublicProfileControls = updatePublicProfileControls;
window.saveWorkerHub = saveWorkerHub;
window.copyPublicProfileLink = copyPublicProfileLink;
window.saveSkills = saveSkills;
window.saveProfile = saveProfile;
window.csvUpdateMapping = csvUpdateMapping;
window.csvExecuteImport = csvExecuteImport;
window.csvReset = csvReset;

/* Sprachwechsel: data-i18n deckt nur statisches Markup ab. Alles, was diese
   Seite per JS aufbaut (Tabelle, Live-Board, Skill-Katalog, Hub-Karten),
   muss beim Wechsel neu gerendert werden — sonst bleibt die halbe Seite
   in der alten Sprache stehen. */
document.addEventListener("tc:langchange", function() {
  renderWorkers();
  renderInvites();
  renderSkillCatalog();
  renderSkillTags();
  if (_currentSkillWorker) {
    renderQualifications();
    renderWorkerDocuments();
    renderWorkerHubHeader(_currentSkillWorker);
    renderWorkerLinkage(_currentSkillWorker);
    renderOperationalContext(_currentSkillWorker);
  }
  updatePublicProfileControls();
  populateSkillsWorkerSelect();
  if (_liveTimer) loadLiveBoard();
  if (_csvData.headers.length) csvBuildMapping();
  if (_csvData.validated.length) csvRenderValidationTable();
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function() { init(); csvInitUpload(); renderSkillCatalog(); });
} else {
  init(); csvInitUpload(); renderSkillCatalog();
}
