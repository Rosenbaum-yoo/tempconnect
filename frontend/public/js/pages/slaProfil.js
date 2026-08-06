"use strict";

/* ── Woerterbuch (P6.1, DE/EN) ─────────────────────────────────────────
   Woerterbuch der ganzen Seite: sla_profil.html laedt i18n.js im head und
   registriert selbst nichts; auch die beiden Inline-Scripts (Promotions,
   Profilreichweite) ziehen ihre Texte ueber diese rst.j.*-Schluessel. Diese
   Datei ist zwar defer geladen, laeuft aber VOR DOMContentLoaded — und beide
   Inline-Scripts uebersetzen erst in ihren DOMContentLoaded-Rueckrufen.

   Drei-Seiten-Regel: "Mein Unternehmen" haengt an sla_profile und wird von
   Zeitarbeitsfirmen wie Unternehmen geoeffnet. Die Beschriftungen bleiben
   deshalb rollenneutral; kein Begriff aus terminologyLabels.js wird als
   fester Wert eingefroren. Die Lieferanten-Bewertung ist keine Ausnahme:
   sie bewertet begrifflich immer den Liefernden ("Lieferant" = supplier).

   Bewusst NICHT uebersetzt:
   - alle Profildaten (Firmenname, Beschreibung, Kompetenz-Schlagworte,
     Standorte, Zertifikatsnamen, Ansprechpartner) — Kundeninhalte
   - die value-Attribute der Auswahlfelder (Zertifikatstyp, Ja/Nein,
     Unternehmensgroesse, Promotion-Typ) — sie gehen an den Server
   - Compliance-Rohwerte (green/yellow/red) und Server-Fehlermeldungen
   - Topbar/Navigation/Nutzerbereich (pageShell.js), Onboarding-Schritte
     (onboardingChecklist.js) und die Sperr-Begruendung (slaGuard.js)      */
TCi18n.register('de', {
  'rst.j.docTitle': 'Mein Unternehmen – TempConnect',
  'rst.j.paywall.home': 'Startseite',
  'rst.j.paywall.title': 'Bereich nicht verfügbar',
  'rst.j.paywall.featurePre': 'Das Feature "',
  'rst.j.paywall.featurePost': '" ist mit deinem aktuellen Plan nicht nutzbar.',
  'rst.j.paywall.currentPlan': 'Aktueller Plan:',
  'rst.j.paywall.cta': 'Abo ansehen',
  'rst.j.page.title': 'Mein Unternehmen',
  'rst.j.page.subtitle': 'Firmenprofil, Abo-Modelle, Organisation, Integrationen und Plattform-Einrichtung – zentral verwalten.',
  'rst.j.page.publicProfile': 'Oeffentliches Profil',
  'rst.j.onboarding.title': 'Plattform einrichten',
  'rst.j.onboarding.toggle': 'Auf-/Zuklappen',
  'rst.j.onboarding.dismiss': 'Ausblenden',
  'rst.j.hub.self.title': 'Mein Unternehmen',
  'rst.j.hub.self.desc': 'Sie befinden sich im Unternehmensbereich.',
  'rst.j.hub.profile.title': 'Firmenprofil',
  'rst.j.hub.profile.desc': 'Firmenprofil, Standorte, Zertifizierungen und Kompetenzen.',
  'rst.j.hub.plans.title': 'Abo-Modelle',
  'rst.j.hub.plans.desc': 'DEMO, BASIS, PLUS, PRO, Individueller Tarif – Tarife und Features.',
  'rst.j.hub.org.title': 'Organisation',
  'rst.j.hub.org.desc': 'Mitglieder, API Keys, Webhooks, Audit-Log und Sicherheit.',
  'rst.j.hub.integrations.title': 'Integrationen',
  'rst.j.hub.integrations.desc': 'Slack- und Teams-Webhooks konfigurieren, Events empfangen.',
  'rst.j.hub.docs.title': 'Dokumente & PDFs',
  'rst.j.hub.docs.desc': 'Rechnungen, Vertraege, Policies und Nachweise sicher ablegen, verwalten und als PDF herunterladen.',
  'rst.j.state.loading': 'Profil wird geladen –',
  'rst.j.state.busy': 'Wird geladen…',
  'rst.j.state.error': 'Profil konnte nicht geladen werden. Bitte einloggen.',
  'rst.j.side.completeness': 'Profil-Vollstaendigkeit',
  'rst.j.side.scorecard': 'Lieferanten-Bewertung',
  'rst.j.side.details': 'Details ansehen →',
  'rst.j.sec.overview': 'Unternehmensuebersicht',
  'rst.j.sec.photo': 'Firmenbild / Standort',
  'rst.j.sec.security': 'Sicherheit & Geräte',
  'rst.j.sec.basic': 'Kontakt & Stammdaten',
  'rst.j.sec.capabilities': 'Kompetenzen & Dienstleistungen',
  'rst.j.sec.locations': 'Standorte',
  'rst.j.sec.certifications': 'Zertifizierungen',
  'rst.j.sec.contacts': 'Ansprechpartner',
  'rst.j.sec.compliance': 'Compliance-Status',
  'rst.j.sec.promotions': 'Promotions & Sichtbarkeits-Boosts',
  'rst.j.sec.reach': 'Profilreichweite',
  'rst.j.action.edit': 'Bearbeiten',
  'rst.j.action.cancel': 'Abbrechen',
  'rst.j.action.save': 'Speichern',
  'rst.j.action.add': 'Hinzufuegen',
  'rst.j.action.manage': 'Verwalten →',
  'rst.j.action.addLocation': '+ Standort',
  'rst.j.action.addCert': '+ Zertifikat',
  'rst.j.action.addContact': '+ Kontakt',
  'rst.j.photo.desc': 'Laden Sie ein Foto Ihres Firmengebaeudes oder Standorts hoch. Das Bild erscheint auf Ihrem oeffentlichen Profil.',
  'rst.j.photo.upload': 'Foto hochladen',
  'rst.j.photo.hint': 'PNG, JPG oder WebP — max. 5 MB',
  'rst.j.photo.alt': 'Firmenfoto',
  'rst.j.photo.remove': 'Foto entfernen',
  'rst.j.photo.none': 'Noch kein Foto hochgeladen.',
  'rst.j.photo.tooBig': 'Datei zu gross (max. 5 MB)',
  'rst.j.photo.wrongType': 'Nur PNG, JPG oder WebP',
  'rst.j.photo.saved': 'Foto gespeichert',
  'rst.j.photo.uploadFailed': 'Upload fehlgeschlagen',
  'rst.j.photo.removed': 'Foto entfernt',
  'rst.j.security.desc': 'Gerät verloren oder an einem fremden Rechner angemeldet geblieben? Hier beenden Sie Sitzungen Ihres Kontos aus der Ferne.',
  'rst.j.security.loading': 'Lädt…',
  'rst.j.security.logoutOthers': 'Andere Geräte abmelden',
  'rst.j.security.logoutAll': 'Überall abmelden (inkl. dieses Gerät)',
  'rst.j.security.sessionsOne': '<b>{n}</b> aktive Sitzung',
  'rst.j.security.sessionsMany': '<b>{n}</b> aktive Sitzungen',
  'rst.j.security.otherDevices': ' — davon <b>{n}</b> auf anderen Geräten',
  'rst.j.security.onlyThisDevice': ' — nur dieses Gerät',
  'rst.j.security.none': 'Keine aktiven Sitzungen gefunden.',
  'rst.j.security.loadFailed': 'Sitzungen konnten nicht geladen werden.',
  'rst.j.security.confirmOthers': 'Alle Sitzungen auf ANDEREN Geräten beenden? Dieses Gerät bleibt angemeldet.',
  'rst.j.security.confirmAll': 'Wirklich ÜBERALL abmelden — auch auf diesem Gerät? Sie müssen sich danach neu anmelden.',
  'rst.j.security.failed': 'Fernabmeldung fehlgeschlagen',
  'rst.j.security.endedOne': '{n} Sitzung beendet',
  'rst.j.security.endedMany': '{n} Sitzungen beendet',
  'rst.j.of.legalName': 'Rechtlicher Name',
  'rst.j.of.website': 'Website',
  'rst.j.of.description': 'Beschreibung',
  'rst.j.of.founded': 'Gruendungsjahr',
  'rst.j.of.size': 'Unternehmensgroesse',
  'rst.j.of.industry': 'Branchenfokus',
  'rst.j.of.hqCity': 'Hauptsitz Stadt',
  'rst.j.of.hqCountry': 'Hauptsitz Land',
  'rst.j.of.linkedin': 'LinkedIn',
  'rst.j.of.email': 'Kontakt-Email',
  'rst.j.of.phone': 'Kontakt-Telefon',
  'rst.j.of.logo': 'Logo URL',
  'rst.j.of.choose': 'Bitte waehlen',
  'rst.j.bf.companyName': 'Firmenname',
  'rst.j.bf.contactPerson': 'Ansprechpartner',
  'rst.j.bf.phone': 'Telefon',
  'rst.j.bf.street': 'Strasse',
  'rst.j.bf.postal': 'PLZ',
  'rst.j.bf.city': 'Ort',
  'rst.j.bf.vat': 'USt-IdNr',
  'rst.j.bf.register': 'Handelsregister-Nr.',
  'rst.j.cf.staffCategories': 'Personalkategorien',
  'rst.j.cf.industries': 'Branchen',
  'rst.j.cf.roles': 'Typische Rollen',
  'rst.j.cf.regions': 'Verfuegbarkeitsregionen',
  'rst.j.cf.languages': 'Sprachen',
  'rst.j.cf.specializations': 'Spezialisierungen',
  'rst.j.cf.enterHint': '(Enter zum Hinzufuegen)',
  'rst.j.loc.empty': 'Noch keine Standorte hinterlegt.',
  'rst.j.loc.fallback': 'Standort',
  'rst.j.loc.city': 'Stadt *',
  'rst.j.loc.postal': 'PLZ',
  'rst.j.loc.country': 'Land',
  'rst.j.loc.label': 'Bezeichnung',
  'rst.j.loc.labelPh': 'z.B. Hauptsitz, Filiale Nord',
  'rst.j.loc.radius': 'Radius (km)',
  'rst.j.loc.isHq': 'Hauptsitz?',
  'rst.j.opt.no': 'Nein',
  'rst.j.opt.yes': 'Ja',
  'rst.j.loc.cityRequired': 'Stadt ist erforderlich',
  'rst.j.loc.added': 'Standort hinzugefuegt',
  'rst.j.loc.confirmRemove': 'Standort wirklich entfernen?',
  'rst.j.loc.removed': 'Standort entfernt',
  'rst.j.cert.empty': 'Noch keine Zertifizierungen hinterlegt.',
  'rst.j.cert.expired': 'Abgelaufen',
  'rst.j.cert.active': 'Aktiv',
  'rst.j.cert.issuer': 'Aussteller:',
  'rst.j.cert.expiry': 'Ablauf:',
  'rst.j.cert.name': 'Zertifikatsname *',
  'rst.j.cert.type': 'Typ',
  'rst.j.cert.issuerField': 'Aussteller',
  'rst.j.cert.expiryField': 'Ablaufdatum',
  'rst.j.cert.typeOther': 'Sonstiges',
  'rst.j.cert.typeIndustry': 'Branchenzertifikat',
  'rst.j.cert.typeQuality': 'Qualitaetssiegel',
  'rst.j.cert.added': 'Zertifikat hinzugefuegt',
  'rst.j.cert.confirmRemove': 'Zertifikat wirklich entfernen?',
  'rst.j.cert.removed': 'Zertifikat entfernt',
  'rst.j.con.empty': 'Noch keine Ansprechpartner hinterlegt.',
  'rst.j.con.primary': 'Primaer',
  'rst.j.con.name': 'Name *',
  'rst.j.con.role': 'Rolle / Titel',
  'rst.j.con.email': 'E-Mail',
  'rst.j.con.phone': 'Telefon',
  'rst.j.con.isPrimary': 'Primaer-Kontakt?',
  'rst.j.con.added': 'Kontakt hinzugefuegt',
  'rst.j.con.confirmRemove': 'Kontakt wirklich entfernen?',
  'rst.j.con.removed': 'Kontakt entfernt',
  'rst.j.score.fill': 'Fill Rate',
  'rst.j.score.onTime': 'Puenktlichkeit',
  'rst.j.score.breaches': 'SLA-Brueche',
  'rst.j.toast.profileSaved': 'Firmenprofil gespeichert',
  'rst.j.toast.basicSaved': 'Stammdaten gespeichert',
  'rst.j.toast.capsSaved': 'Kompetenzen gespeichert',
  'rst.j.toast.saveFailed': 'Speichern fehlgeschlagen',
  'rst.j.toast.addFailed': 'Fehler beim Hinzufuegen',
  'rst.j.toast.error': 'Fehler',
  'rst.j.err.nameRequired': 'Name ist erforderlich',
  'rst.j.promo.soonTitle': 'Demnächst verfügbar',
  'rst.j.promo.soonText': 'Mit Promotions können Sie Ihr Profil gezielt hervorheben — durch Featured-Badge, Such-Boost oder Kategorie-Top-Platzierung. Alle Promotions werden von TempConnect geprüft und freigegeben.',
  'rst.j.promo.soonNote': 'Verfügbar ab INDIVIDUELL-Plan · Aktivierung durch TempConnect-Staff',
  'rst.j.promo.newRequest': 'Neuen Antrag stellen',
  'rst.j.promo.typeFeatured': 'Featured-Badge',
  'rst.j.promo.typeBoost': 'Such-Boost',
  'rst.j.promo.typeTop': 'Kategorie-Top',
  'rst.j.promo.create': 'Antrag erstellen',
  'rst.j.promo.empty': 'Noch keine Anträge.',
  'rst.j.promo.staffNote': 'Hinweis Staff:',
  'rst.j.promo.cancel': 'Stornieren',
  'rst.j.promo.confirmCancel': 'Antrag wirklich stornieren?',
  'rst.j.promo.badgeActive': 'Aktiv',
  'rst.j.promo.createFailed': 'Antrag fehlgeschlagen.',
  'rst.j.promo.networkError': 'Netzwerkfehler.',
  'rst.j.st.draft': 'Entwurf',
  'rst.j.st.pending': 'In Prüfung',
  'rst.j.st.approved': 'Genehmigt',
  'rst.j.st.active': 'Aktiv',
  'rst.j.st.rejected': 'Abgelehnt',
  'rst.j.st.expired': 'Abgelaufen',
  'rst.j.st.cancelled': 'Storniert',
  'rst.j.reach.views7': 'Aufrufe (7 Tage)',
  'rst.j.reach.views30': 'Aufrufe (30 Tage)',
  'rst.j.reach.likes': 'Likes',
  'rst.j.reach.ranking': 'Marketplace-Ranking',
  'rst.j.reach.position': 'Platz #{n}',
  'rst.j.seg.unrated': 'Nicht bewertet',
  'rst.j.seg.bronze': 'Bronze',
  'rst.j.seg.silver': 'Silber',
  'rst.j.seg.gold': 'Gold',
  'rst.j.seg.platinum': 'Platin',
  'rst.j.vis.visible': 'Ihr Profil ist derzeit im Marketplace sichtbar.',
  'rst.j.vis.visibleShort': 'Sichtbar',
  'rst.j.vis.review': 'Ihr Profil wird gerade geprüft. Sie werden benachrichtigt.',
  'rst.j.vis.reviewShort': 'In Prüfung',
  'rst.j.vis.draft': 'Profil noch nicht eingereicht.',
  'rst.j.vis.draftLink': 'Jetzt einreichen →',
  'rst.j.vis.rejected': 'Profil wurde abgelehnt. Bitte beheben Sie die angegebenen Mängel und reichen Sie erneut ein.',
  'rst.j.vis.rejectedShort': 'Abgelehnt',
  'rst.j.vis.suspended': 'Profil ist derzeit suspendiert. Bitte kontaktieren Sie den Support.',
  'rst.j.vis.suspendedShort': 'Suspendiert',
  'rst.j.disclaimer': 'Hinweis: Inhalte dienen der Unterstützung und ersetzen keine rechtliche Prüfung. Angaben ohne Gewähr.'
});
TCi18n.register('en', {
  'rst.j.docTitle': 'My company – TempConnect',
  'rst.j.paywall.home': 'Home',
  'rst.j.paywall.title': 'Area not available',
  'rst.j.paywall.featurePre': 'The feature "',
  'rst.j.paywall.featurePost': '" is not included in your current plan.',
  'rst.j.paywall.currentPlan': 'Current plan:',
  'rst.j.paywall.cta': 'View plans',
  'rst.j.page.title': 'My company',
  'rst.j.page.subtitle': 'Company profile, plans, organisation, integrations and platform setup – all in one place.',
  'rst.j.page.publicProfile': 'Public profile',
  'rst.j.onboarding.title': 'Set up the platform',
  'rst.j.onboarding.toggle': 'Expand / collapse',
  'rst.j.onboarding.dismiss': 'Hide',
  'rst.j.hub.self.title': 'My company',
  'rst.j.hub.self.desc': 'You are in the company area.',
  'rst.j.hub.profile.title': 'Company profile',
  'rst.j.hub.profile.desc': 'Company profile, locations, certifications and capabilities.',
  'rst.j.hub.plans.title': 'Plans',
  'rst.j.hub.plans.desc': 'DEMO, BASIS, PLUS, PRO, custom plan – tiers and features.',
  'rst.j.hub.org.title': 'Organisation',
  'rst.j.hub.org.desc': 'Members, API keys, webhooks, audit log and security.',
  'rst.j.hub.integrations.title': 'Integrations',
  'rst.j.hub.integrations.desc': 'Configure Slack and Teams webhooks, receive events.',
  'rst.j.hub.docs.title': 'Documents & PDFs',
  'rst.j.hub.docs.desc': 'Store, manage and download invoices, contracts, policies and certificates as PDF.',
  'rst.j.state.loading': 'Loading profile –',
  'rst.j.state.busy': 'Loading…',
  'rst.j.state.error': 'The profile could not be loaded. Please sign in.',
  'rst.j.side.completeness': 'Profile completeness',
  'rst.j.side.scorecard': 'Supplier rating',
  'rst.j.side.details': 'View details →',
  'rst.j.sec.overview': 'Company overview',
  'rst.j.sec.photo': 'Company photo / location',
  'rst.j.sec.security': 'Security & devices',
  'rst.j.sec.basic': 'Contact & master data',
  'rst.j.sec.capabilities': 'Capabilities & services',
  'rst.j.sec.locations': 'Locations',
  'rst.j.sec.certifications': 'Certifications',
  'rst.j.sec.contacts': 'Contacts',
  'rst.j.sec.compliance': 'Compliance status',
  'rst.j.sec.promotions': 'Promotions & visibility boosts',
  'rst.j.sec.reach': 'Profile reach',
  'rst.j.action.edit': 'Edit',
  'rst.j.action.cancel': 'Cancel',
  'rst.j.action.save': 'Save',
  'rst.j.action.add': 'Add',
  'rst.j.action.manage': 'Manage →',
  'rst.j.action.addLocation': '+ Location',
  'rst.j.action.addCert': '+ Certificate',
  'rst.j.action.addContact': '+ Contact',
  'rst.j.photo.desc': 'Upload a photo of your building or site. The image appears on your public profile.',
  'rst.j.photo.upload': 'Upload photo',
  'rst.j.photo.hint': 'PNG, JPG or WebP — max. 5 MB',
  'rst.j.photo.alt': 'Company photo',
  'rst.j.photo.remove': 'Remove photo',
  'rst.j.photo.none': 'No photo uploaded yet.',
  'rst.j.photo.tooBig': 'File too large (max. 5 MB)',
  'rst.j.photo.wrongType': 'Only PNG, JPG or WebP',
  'rst.j.photo.saved': 'Photo saved',
  'rst.j.photo.uploadFailed': 'Upload failed',
  'rst.j.photo.removed': 'Photo removed',
  'rst.j.security.desc': 'Lost a device or stayed signed in on someone else\u2019s computer? End sessions of your account remotely here.',
  'rst.j.security.loading': 'Loading…',
  'rst.j.security.logoutOthers': 'Sign out other devices',
  'rst.j.security.logoutAll': 'Sign out everywhere (including this device)',
  'rst.j.security.sessionsOne': '<b>{n}</b> active session',
  'rst.j.security.sessionsMany': '<b>{n}</b> active sessions',
  'rst.j.security.otherDevices': ' — <b>{n}</b> of them on other devices',
  'rst.j.security.onlyThisDevice': ' — this device only',
  'rst.j.security.none': 'No active sessions found.',
  'rst.j.security.loadFailed': 'Sessions could not be loaded.',
  'rst.j.security.confirmOthers': 'End all sessions on OTHER devices? This device stays signed in.',
  'rst.j.security.confirmAll': 'Really sign out EVERYWHERE — including this device? You will have to sign in again afterwards.',
  'rst.j.security.failed': 'Remote sign-out failed',
  'rst.j.security.endedOne': '{n} session ended',
  'rst.j.security.endedMany': '{n} sessions ended',
  'rst.j.of.legalName': 'Legal name',
  'rst.j.of.website': 'Website',
  'rst.j.of.description': 'Description',
  'rst.j.of.founded': 'Year founded',
  'rst.j.of.size': 'Company size',
  'rst.j.of.industry': 'Industry focus',
  'rst.j.of.hqCity': 'Headquarters city',
  'rst.j.of.hqCountry': 'Headquarters country',
  'rst.j.of.linkedin': 'LinkedIn',
  'rst.j.of.email': 'Contact email',
  'rst.j.of.phone': 'Contact phone',
  'rst.j.of.logo': 'Logo URL',
  'rst.j.of.choose': 'Please choose',
  'rst.j.bf.companyName': 'Company name',
  'rst.j.bf.contactPerson': 'Contact person',
  'rst.j.bf.phone': 'Phone',
  'rst.j.bf.street': 'Street',
  'rst.j.bf.postal': 'Postcode',
  'rst.j.bf.city': 'City',
  'rst.j.bf.vat': 'VAT ID',
  'rst.j.bf.register': 'Commercial register no.',
  'rst.j.cf.staffCategories': 'Staff categories',
  'rst.j.cf.industries': 'Industries',
  'rst.j.cf.roles': 'Typical roles',
  'rst.j.cf.regions': 'Availability regions',
  'rst.j.cf.languages': 'Languages',
  'rst.j.cf.specializations': 'Specialisations',
  'rst.j.cf.enterHint': '(press Enter to add)',
  'rst.j.loc.empty': 'No locations added yet.',
  'rst.j.loc.fallback': 'Location',
  'rst.j.loc.city': 'City *',
  'rst.j.loc.postal': 'Postcode',
  'rst.j.loc.country': 'Country',
  'rst.j.loc.label': 'Label',
  'rst.j.loc.labelPh': 'e.g. head office, branch north',
  'rst.j.loc.radius': 'Radius (km)',
  'rst.j.loc.isHq': 'Headquarters?',
  'rst.j.opt.no': 'No',
  'rst.j.opt.yes': 'Yes',
  'rst.j.loc.cityRequired': 'City is required',
  'rst.j.loc.added': 'Location added',
  'rst.j.loc.confirmRemove': 'Really remove this location?',
  'rst.j.loc.removed': 'Location removed',
  'rst.j.cert.empty': 'No certifications added yet.',
  'rst.j.cert.expired': 'Expired',
  'rst.j.cert.active': 'Active',
  'rst.j.cert.issuer': 'Issuer:',
  'rst.j.cert.expiry': 'Expires:',
  'rst.j.cert.name': 'Certificate name *',
  'rst.j.cert.type': 'Type',
  'rst.j.cert.issuerField': 'Issuer',
  'rst.j.cert.expiryField': 'Expiry date',
  'rst.j.cert.typeOther': 'Other',
  'rst.j.cert.typeIndustry': 'Industry certificate',
  'rst.j.cert.typeQuality': 'Quality seal',
  'rst.j.cert.added': 'Certificate added',
  'rst.j.cert.confirmRemove': 'Really remove this certificate?',
  'rst.j.cert.removed': 'Certificate removed',
  'rst.j.con.empty': 'No contacts added yet.',
  'rst.j.con.primary': 'Primary',
  'rst.j.con.name': 'Name *',
  'rst.j.con.role': 'Role / title',
  'rst.j.con.email': 'Email',
  'rst.j.con.phone': 'Phone',
  'rst.j.con.isPrimary': 'Primary contact?',
  'rst.j.con.added': 'Contact added',
  'rst.j.con.confirmRemove': 'Really remove this contact?',
  'rst.j.con.removed': 'Contact removed',
  'rst.j.score.fill': 'Fill rate',
  'rst.j.score.onTime': 'On time',
  'rst.j.score.breaches': 'SLA breaches',
  'rst.j.toast.profileSaved': 'Company profile saved',
  'rst.j.toast.basicSaved': 'Master data saved',
  'rst.j.toast.capsSaved': 'Capabilities saved',
  'rst.j.toast.saveFailed': 'Saving failed',
  'rst.j.toast.addFailed': 'Could not add the entry',
  'rst.j.toast.error': 'Error',
  'rst.j.err.nameRequired': 'Name is required',
  'rst.j.promo.soonTitle': 'Coming soon',
  'rst.j.promo.soonText': 'With promotions you can highlight your profile — via a featured badge, a search boost or a top position in your category. Every promotion is reviewed and approved by TempConnect.',
  'rst.j.promo.soonNote': 'Available from the INDIVIDUELL plan · activated by TempConnect staff',
  'rst.j.promo.newRequest': 'Submit a new request',
  'rst.j.promo.typeFeatured': 'Featured badge',
  'rst.j.promo.typeBoost': 'Search boost',
  'rst.j.promo.typeTop': 'Category top',
  'rst.j.promo.create': 'Create request',
  'rst.j.promo.empty': 'No requests yet.',
  'rst.j.promo.staffNote': 'Staff note:',
  'rst.j.promo.cancel': 'Cancel request',
  'rst.j.promo.confirmCancel': 'Really cancel this request?',
  'rst.j.promo.badgeActive': 'Active',
  'rst.j.promo.createFailed': 'The request failed.',
  'rst.j.promo.networkError': 'Network error.',
  'rst.j.st.draft': 'Draft',
  'rst.j.st.pending': 'In review',
  'rst.j.st.approved': 'Approved',
  'rst.j.st.active': 'Active',
  'rst.j.st.rejected': 'Rejected',
  'rst.j.st.expired': 'Expired',
  'rst.j.st.cancelled': 'Cancelled',
  'rst.j.reach.views7': 'Views (7 days)',
  'rst.j.reach.views30': 'Views (30 days)',
  'rst.j.reach.likes': 'Likes',
  'rst.j.reach.ranking': 'Marketplace ranking',
  'rst.j.reach.position': 'Rank #{n}',
  'rst.j.seg.unrated': 'Not rated',
  'rst.j.seg.bronze': 'Bronze',
  'rst.j.seg.silver': 'Silver',
  'rst.j.seg.gold': 'Gold',
  'rst.j.seg.platinum': 'Platinum',
  'rst.j.vis.visible': 'Your profile is currently visible in the marketplace.',
  'rst.j.vis.visibleShort': 'Visible',
  'rst.j.vis.review': 'Your profile is being reviewed. You will be notified.',
  'rst.j.vis.reviewShort': 'In review',
  'rst.j.vis.draft': 'Profile not submitted yet.',
  'rst.j.vis.draftLink': 'Submit now →',
  'rst.j.vis.rejected': 'The profile was rejected. Please fix the issues listed and submit again.',
  'rst.j.vis.rejectedShort': 'Rejected',
  'rst.j.vis.suspended': 'The profile is currently suspended. Please contact support.',
  'rst.j.vis.suspendedShort': 'Suspended',
  'rst.j.disclaimer': 'Note: the content is for guidance only and does not replace a legal review. All information without guarantee.'
});


  (function(){
    "use strict";
    var API = "/api/company-profile";
    var data = null;
    var csrfToken = "";

    function tr(key, params){ return TCi18n.t(key, params); }
    function esc(s){ var d=document.createElement("div"); d.textContent=s||""; return d.innerHTML; }
    function $(id){ return document.getElementById(id); }
    function toast(msg, ok){
      var t=$("ep-toast"); t.textContent=msg;
      t.style.background=ok===false?"var(--ds-danger)":"var(--ds-success)";
      t.classList.add("show"); setTimeout(function(){ t.classList.remove("show"); },2600);
    }
    async function api(path, opts){
      if(!opts) opts={};
      opts.credentials="include";
      if(!opts.headers) opts.headers={};
      if(csrfToken) opts.headers["x-csrf-token"]=csrfToken;
      if(opts.body && typeof opts.body==="object" && !(opts.body instanceof FormData)){
        opts.headers["Content-Type"]="application/json";
        opts.body=JSON.stringify(opts.body);
      }
      var r=await fetch(path, opts);
      if(!r.ok) throw new Error("HTTP "+r.status);
      return r.json();
    }
    function fieldVal(obj, key){
      var v=(obj&&obj[key])||"";
      if(Array.isArray(v)) return v.join(", ");
      return String(v).trim();
    }

    async function fetchCsrf(){
      try{ var r=await fetch("/api/csrf",{credentials:"include"}); var d=await r.json(); csrfToken=d.csrfToken||d.token||""; }catch(e){ /* non-critical: CSRF fetch may fail on first load */ }
    }

    async function load(){
      try{
        await fetchCsrf();
        var res=await api(API);
        data=res.data||res;
        $("ep-loading").style.display="none";
        $("ep-main").style.display="grid";
        $("preview-btn").style.display="inline-flex";
        renderAll();
      }catch(e){
        // Marker mitfuehren, damit ein Sprachwechsel die Meldung uebersetzt
        // statt sie auf "Profil wird geladen" zurueckzusetzen.
        var ladeEl=$("ep-loading");
        ladeEl.setAttribute("data-i18n","rst.j.state.error");
        ladeEl.style.color="var(--ds-danger)";
        ladeEl.textContent=tr('rst.j.state.error');
      }
    }

    function renderAll(){
      renderCompleteness();
      renderOverview();
      renderPhoto();
      renderBasic();
      renderCapabilities();
      renderLocations();
      renderCerts();
      renderContacts();
      renderScorecard();
      renderCompliance();
    }

    /* -- COMPLETENESS ------------------------------ */
    function renderCompleteness(){
      var c=data.completeness||{percentage:0,sections:[]};
      var pct=c.percentage||0;
      var circ=2*Math.PI*16;
      var offset=circ-(pct/100)*circ;
      $("ring-fg").setAttribute("stroke-dashoffset", offset);
      $("ring-pct").textContent=pct+"%";
      var nav=$("ep-nav");
      var html="";
      var secMap={overview:"sec-overview",capabilities:"sec-capabilities",locations:"sec-locations",certifications:"sec-certifications",contacts:"sec-contacts"};
      (c.sections||[]).forEach(function(s){
        var done=s.complete?"done":"";
        var target=secMap[s.key]||"";
        html+="<button class='ep-nav-item "+done+"' onclick=\"document.getElementById('"+target+"').scrollIntoView({behavior:'smooth',block:'start'})\">";
        html+="<span class='ep-nav-check'>"+(s.complete?"&#10003;":"")+"</span>";
        html+=esc(s.label)+"</button>";
      });
      nav.innerHTML=html;
    }

    /* -- OVERVIEW ---------------------------------- */
    var overviewFields=[
      // label traegt jetzt den i18n-Schluessel; gerendert wird ueber tr(f.label).
      {key:"legal_name",label:"rst.j.of.legalName",full:false},
      {key:"website",label:"rst.j.of.website",full:false},
      {key:"company_description",label:"rst.j.of.description",full:true,type:"textarea"},
      {key:"year_founded",label:"rst.j.of.founded",full:false},
      {key:"company_size",label:"rst.j.of.size",full:false,type:"select",options:["","1-10","11-50","51-200","201-500","501-1000","1001-5000","5000+"]},
      {key:"industry_focus",label:"rst.j.of.industry",full:false},
      {key:"headquarters_city",label:"rst.j.of.hqCity",full:false},
      {key:"headquarters_country",label:"rst.j.of.hqCountry",full:false},
      {key:"linkedin_url",label:"rst.j.of.linkedin",full:false},
      {key:"contact_email",label:"rst.j.of.email",full:false},
      {key:"contact_phone",label:"rst.j.of.phone",full:false},
      {key:"logo_url",label:"rst.j.of.logo",full:false}
    ];
    function renderOverview(){
      var p=data.profile||{};
      var html="<div class='ep-form'>";
      overviewFields.forEach(function(f){
        var v=fieldVal(p,f.key)||fieldVal(data.user,f.key);
        html+="<div class='ep-field "+(f.full?"full":"")+"'><label>"+esc(tr(f.label))+"</label><div class='val'>"+(v?esc(v):"<span style='color:var(--ds-text-tertiary)'>–</span>")+"</div></div>";
      });
      html+="</div>";
      $("overview-view").innerHTML=html;
    }
    function renderOverviewEdit(){
      var p=data.profile||{};
      var html="<div class='ep-form'>";
      overviewFields.forEach(function(f){
        var v=fieldVal(p,f.key)||fieldVal(data.user,f.key);
        html+="<div class='ep-field "+(f.full?"full":"")+"'><label>"+esc(tr(f.label))+"</label>";
        if(f.type==="textarea") html+="<textarea id='ov-"+f.key+"'>"+esc(v)+"</textarea>";
        else if(f.type==="select"){
          html+="<select id='ov-"+f.key+"'>";
          (f.options||[]).forEach(function(o){ html+="<option value='"+esc(o)+"'"+(o===v?" selected":"")+">"+esc(o||tr('rst.j.of.choose'))+"</option>"; });
          html+="</select>";
        } else html+="<input id='ov-"+f.key+"' value='"+esc(v)+"'/>";
        html+="</div>";
      });
      html+="</div><div class='ep-actions'><button class='ep-btn' onclick='EP.toggleEdit(\"overview\")'>"+esc(tr('rst.j.action.cancel'))+"</button><button class='ep-btn ep-btn--primary' onclick='EP.saveOverview()'>"+esc(tr('rst.j.action.save'))+"</button></div>";
      $("overview-edit").innerHTML=html;
    }

    /* -- BASIC -------------------------------------- */
    var basicFields=[
      {key:"company_name",label:"rst.j.bf.companyName"},
      {key:"contact_person",label:"rst.j.bf.contactPerson"},
      {key:"phone",label:"rst.j.bf.phone"},
      {key:"street",label:"rst.j.bf.street"},
      {key:"postal_code",label:"rst.j.bf.postal"},
      {key:"city",label:"rst.j.bf.city"},
      {key:"vat_id",label:"rst.j.bf.vat"},
      {key:"handelsregister_number",label:"rst.j.bf.register"}
    ];
    function renderBasic(){
      var u=data.user||{};
      var html="<div class='ep-form'>";
      basicFields.forEach(function(f){
        var v=fieldVal(u,f.key);
        html+="<div class='ep-field'><label>"+esc(tr(f.label))+"</label><div class='val'>"+(v?esc(v):"<span style='color:var(--ds-text-tertiary)'>–</span>")+"</div></div>";
      });
      html+="</div>";
      $("basic-view").innerHTML=html;
    }
    function renderBasicEdit(){
      var u=data.user||{};
      var html="<div class='ep-form'>";
      basicFields.forEach(function(f){
        var v=fieldVal(u,f.key);
        html+="<div class='ep-field'><label>"+esc(tr(f.label))+"</label><input id='ba-"+f.key+"' value='"+esc(v)+"'/></div>";
      });
      html+="</div><div class='ep-actions'><button class='ep-btn' onclick='EP.toggleEdit(\"basic\")'>"+esc(tr('rst.j.action.cancel'))+"</button><button class='ep-btn ep-btn--primary' onclick='EP.saveBasic()'>"+esc(tr('rst.j.action.save'))+"</button></div>";
      $("basic-edit").innerHTML=html;
    }

    /* -- CAPABILITIES ------------------------------ */
    var capFields=[
      {key:"staff_categories",label:"rst.j.cf.staffCategories"},
      {key:"industries_served",label:"rst.j.cf.industries"},
      {key:"typical_roles",label:"rst.j.cf.roles"},
      {key:"availability_regions",label:"rst.j.cf.regions"},
      {key:"languages",label:"rst.j.cf.languages"},
      {key:"specializations",label:"rst.j.cf.specializations"}
    ];
    function renderCapabilities(){
      var c=data.capabilities||{};
      var html="<div class='ep-form'>";
      capFields.forEach(function(f){
        var arr=c[f.key]||[];
        html+="<div class='ep-field'><label>"+esc(tr(f.label))+"</label>";
        if(arr.length){
          html+="<div class='ep-tags'>";
          arr.forEach(function(t){ html+="<span class='ep-tag'>"+esc(t)+"</span>"; });
          html+="</div>";
        } else { html+="<div class='val'><span style='color:var(--ds-text-tertiary)'>–</span></div>"; }
        html+="</div>";
      });
      html+="</div>";
      $("capabilities-view").innerHTML=html;
    }
    var _capDraft={};
    function initCapDraft(){
      var c=data.capabilities||{};
      _capDraft={};
      capFields.forEach(function(f){ _capDraft[f.key]=(c[f.key]||[]).slice(); });
    }
    function renderCapabilitiesEdit(){
      var html="<div class='ep-form'>";
      capFields.forEach(function(f){
        var arr=_capDraft[f.key]||[];
        html+="<div class='ep-field'><label>"+esc(f.label)+" <span style='font-weight:400;text-transform:none;letter-spacing:0'>"+esc(tr('rst.j.cf.enterHint'))+"</span></label>";
        html+="<div class='ep-tags' id='tags-"+f.key+"'>";
        arr.forEach(function(t,i){ html+="<span class='ep-tag'>"+esc(t)+"<span class='x' data-field='"+f.key+"' data-idx='"+i+"'>&times;</span></span>"; });
        html+="<input class='ep-tag-input' data-field='"+f.key+"' placeholder='+' onkeydown='EP.tagKey(event)'/>";
        html+="</div></div>";
      });
      html+="</div><div class='ep-actions'><button class='ep-btn' onclick='EP.toggleEdit(\"capabilities\")'>"+esc(tr('rst.j.action.cancel'))+"</button><button class='ep-btn ep-btn--primary' onclick='EP.saveCapabilities()'>"+esc(tr('rst.j.action.save'))+"</button></div>";
      $("capabilities-edit").innerHTML=html;
      $("capabilities-edit").querySelectorAll(".x").forEach(function(el){
        el.onclick=function(){ _removeTag(el.dataset.field, parseInt(el.dataset.idx)); };
      });
    }

    /* -- LOCATIONS ---------------------------------- */
    function renderLocations(){
      var locs=data.locations||[];
      if(!locs.length){ $("locations-list").innerHTML="<div class='ep-empty'>"+esc(tr('rst.j.loc.empty'))+"</div>"; return; }
      var html="";
      locs.forEach(function(l){
        html+="<div class='ep-list-item'><div class='ep-list-item__body'>";
        html+="<div class='ep-list-item__title'>"+esc(l.city||tr('rst.j.loc.fallback'))+(l.is_headquarters?" <span class='ep-badge ep-badge--ok'>HQ</span>":"")+"</div>";
        html+="<div class='ep-list-item__sub'>"+(l.label?esc(l.label)+" – ":"")+(l.postal_code?esc(l.postal_code)+" ":"")+esc(l.country||"")+(l.radius_km?" – Radius: "+l.radius_km+" km":"")+"</div>";
        html+="</div><div class='ep-list-item__actions'>";
        html+="<button class='ep-btn ep-btn--sm ep-btn--danger' onclick='EP.removeLocation("+l.id+")'>&#128465;</button>";
        html+="</div></div>";
      });
      $("locations-list").innerHTML=html;
    }

    /* -- CERTIFICATIONS ---------------------------- */
    function renderCerts(){
      var certs=data.certifications||[];
      if(!certs.length){ $("certs-list").innerHTML="<div class='ep-empty'>"+esc(tr('rst.j.cert.empty'))+"</div>"; return; }
      var html="";
      certs.forEach(function(c){
        var badge=c.is_expired?"ep-badge--miss":c.status==="active"?"ep-badge--ok":"ep-badge--warn";
        var label=c.is_expired?esc(tr('rst.j.cert.expired')):c.status==="active"?esc(tr('rst.j.cert.active')):esc(c.status||"");
        html+="<div class='ep-list-item'><div class='ep-list-item__body'>";
        html+="<div class='ep-list-item__title'>"+esc(c.cert_name)+" <span class='ep-badge "+badge+"'>"+label+"</span></div>";
        html+="<div class='ep-list-item__sub'>"+(c.cert_type?esc(c.cert_type)+" – ":"")+(c.issuer?esc(tr('rst.j.cert.issuer'))+" "+esc(c.issuer):"")+(c.expires_at?" – "+esc(tr('rst.j.cert.expiry'))+" "+new Date(c.expires_at).toLocaleDateString(TCi18n.dateLocale()):"")+"</div>";
        html+="</div><div class='ep-list-item__actions'>";
        html+="<button class='ep-btn ep-btn--sm ep-btn--danger' onclick='EP.removeCert("+c.id+")'>&#128465;</button>";
        html+="</div></div>";
      });
      $("certs-list").innerHTML=html;
    }

    /* -- CONTACTS ----------------------------------- */
    function renderContacts(){
      var list=data.contacts||[];
      if(!list.length){ $("contacts-list").innerHTML="<div class='ep-empty'>"+esc(tr('rst.j.con.empty'))+"</div>"; return; }
      var html="";
      list.forEach(function(c){
        html+="<div class='ep-list-item'><div class='ep-list-item__body'>";
        html+="<div class='ep-list-item__title'>"+esc(c.name)+(c.is_primary?" <span class='ep-badge ep-badge--ok'>"+esc(tr('rst.j.con.primary'))+"</span>":"")+"</div>";
        html+="<div class='ep-list-item__sub'>"+(c.role_title?esc(c.role_title)+" – ":"")+(c.email?esc(c.email):"")+(c.phone?" – "+esc(c.phone):"")+"</div>";
        html+="</div><div class='ep-list-item__actions'>";
        html+="<button class='ep-btn ep-btn--sm ep-btn--danger' onclick='EP.removeContact("+c.id+")'>&#128465;</button>";
        html+="</div></div>";
      });
      $("contacts-list").innerHTML=html;
    }

    /* -- SCORECARD ---------------------------------- */
    function renderScorecard(){
      var s=data.scorecard;
      if(!s||!s.grade){ $("scorecard-widget").style.display="none"; return; }
      var colors={A:"var(--ds-success)",B:"var(--ds-warning)",C:"var(--ds-danger)"};
      var bg={A:"var(--ds-success-muted)",B:"var(--ds-warning-muted)",C:"var(--ds-danger-muted)"};
      var html="<div class='ep-score'>";
      html+="<div class='ep-score-grade' style='background:"+(bg[s.grade]||bg.C)+";color:"+(colors[s.grade]||colors.C)+"'>"+esc(s.grade)+"</div>";
      html+="<div class='ep-score-kpis'>";
      html+="<div class='ep-score-kpi'><div class='v'>"+Math.round((s.fill_rate||0)*100)+"%</div><div class='l'>"+esc(tr('rst.j.score.fill'))+"</div></div>";
      html+="<div class='ep-score-kpi'><div class='v'>"+Math.round((s.on_time_rate||0)*100)+"%</div><div class='l'>"+esc(tr('rst.j.score.onTime'))+"</div></div>";
      html+="<div class='ep-score-kpi'><div class='v'>"+(s.sla_breach_count||0)+"</div><div class='l'>"+esc(tr('rst.j.score.breaches'))+"</div></div>";
      html+="</div></div>";
      $("scorecard-body").innerHTML=html;
      $("scorecard-widget").style.display="block";
    }

    /* -- COMPLIANCE -------------------------------- */
    function renderCompliance(){
      var c=data.compliance;
      if(!c){ $("sec-compliance").style.display="none"; return; }
      $("sec-compliance").style.display="block";
      var colors={green:"var(--ds-success)",yellow:"var(--ds-warning)",red:"var(--ds-danger)"};
      var html="<div style='display:flex;gap:var(--ds-space-6);flex-wrap:wrap'>";
      ["green","yellow","red"].forEach(function(k){
        var count=c[k]||0;
        html+="<div style='text-align:center'><div style='font-size:24px;font-weight:900;color:"+colors[k]+"'>"+count+"</div><div style='font-size:11px;color:var(--ds-text-secondary);text-transform:uppercase'>"+k+"</div></div>";
      });
      html+="</div>";
      $("compliance-body").innerHTML=html;
    }

    /* -- TOGGLE EDIT ------------------------------- */
    function toggleEdit(sec){
      var view=$(sec+"-view"), edit=$(sec+"-edit");
      if(!view||!edit) return;
      if(edit.style.display==="none"){
        if(sec==="overview") renderOverviewEdit();
        if(sec==="basic") renderBasicEdit();
        if(sec==="capabilities"){ initCapDraft(); renderCapabilitiesEdit(); }
        view.style.display="none"; edit.style.display="block";
      } else {
        view.style.display="block"; edit.style.display="none";
      }
    }

    /* -- SAVE: Overview ---------------------------- */
    async function saveOverview(){
      var body={};
      overviewFields.forEach(function(f){ body[f.key]=$("ov-"+f.key).value.trim(); });
      try{
        await api(API+"/overview",{method:"PUT",body:body});
        var res=await api(API); data=res.data||res;
        toggleEdit("overview");
        renderAll();
        toast(tr('rst.j.toast.profileSaved'));
      }catch(e){ toast(tr('rst.j.toast.saveFailed'),false); }
    }

    /* -- SAVE: Basic ------------------------------- */
    async function saveBasic(){
      var body={};
      basicFields.forEach(function(f){ body[f.key]=$("ba-"+f.key).value.trim(); });
      try{
        await api("/api/me/profile",{method:"PUT",body:body});
        var res=await api(API); data=res.data||res;
        toggleEdit("basic");
        renderAll();
        toast(tr('rst.j.toast.basicSaved'));
      }catch(e){ toast(tr('rst.j.toast.saveFailed'),false); }
    }

    /* -- SAVE: Capabilities ------------------------ */
    async function saveCapabilities(){
      var body={};
      capFields.forEach(function(f){
        var tags=[];
        var container=$("tags-"+f.key);
        if(container){
          container.querySelectorAll(".ep-tag").forEach(function(el){
            var txt=el.childNodes[0];
            if(txt) tags.push(txt.textContent.trim());
          });
        }
        body[f.key]=tags;
      });
      try{
        await api(API+"/capabilities",{method:"PUT",body:body});
        var res=await api(API); data=res.data||res;
        toggleEdit("capabilities");
        renderAll();
        toast(tr('rst.j.toast.capsSaved'));
      }catch(e){ toast(tr('rst.j.toast.saveFailed'),false); }
    }

    /* -- TAG INPUT ---------------------------------- */
    function tagKey(e){
      if(e.key!=="Enter") return;
      e.preventDefault();
      var inp=e.target, val=inp.value.trim();
      if(!val) return;
      var field=inp.dataset.field;
      var container=$("tags-"+field);
      var tag=document.createElement("span");
      tag.className="ep-tag";
      tag.innerHTML=esc(val)+"<span class='x'>&times;</span>";
      tag.querySelector(".x").onclick=function(){ tag.remove(); };
      container.insertBefore(tag, inp);
      inp.value="";
    }
    function _removeTag(field, idx){
      _capDraft[field].splice(idx,1);
      renderCapabilitiesEdit();
    }

    /* -- ADD LOCATION ------------------------------ */
    function showAddLocation(){
      // Nur die Beschriftungen sind uebersetzt; die value-Attribute (false/true,
      // Laendername, Radius) gehen unveraendert an /api/company-profile/locations.
      $("location-form").innerHTML="<div class='ep-form' style='margin-top:var(--ds-space-3)'>"+
        "<div class='ep-field'><label>"+esc(tr('rst.j.loc.city'))+"</label><input id='loc-city'/></div>"+
        "<div class='ep-field'><label>"+esc(tr('rst.j.loc.postal'))+"</label><input id='loc-postal'/></div>"+
        "<div class='ep-field'><label>"+esc(tr('rst.j.loc.country'))+"</label><input id='loc-country' value='Deutschland'/></div>"+
        "<div class='ep-field'><label>"+esc(tr('rst.j.loc.label'))+"</label><input id='loc-label' placeholder='"+esc(tr('rst.j.loc.labelPh'))+"'/></div>"+
        "<div class='ep-field'><label>"+esc(tr('rst.j.loc.radius'))+"</label><input id='loc-radius' type='number' value='50'/></div>"+
        "<div class='ep-field'><label>"+esc(tr('rst.j.loc.isHq'))+"</label><select id='loc-hq'><option value='false'>"+esc(tr('rst.j.opt.no'))+"</option><option value='true'>"+esc(tr('rst.j.opt.yes'))+"</option></select></div>"+
        "</div><div class='ep-actions'><button class='ep-btn' onclick='EP.hideForm(\"location-form\")'>"+esc(tr('rst.j.action.cancel'))+"</button>"+
        "<button class='ep-btn ep-btn--primary' onclick='EP.addLocation()'>"+esc(tr('rst.j.action.add'))+"</button></div>";
      $("location-form").style.display="block";
    }
    async function addLocation(){
      var body={city:$("loc-city").value.trim(),postal_code:$("loc-postal").value.trim(),country:$("loc-country").value.trim(),label:$("loc-label").value.trim(),radius_km:parseInt($("loc-radius").value)||50,is_headquarters:$("loc-hq").value==="true"};
      if(!body.city){ toast(tr('rst.j.loc.cityRequired'),false); return; }
      try{
        await api(API+"/locations",{method:"POST",body:body});
        var res=await api(API); data=res.data||res;
        $("location-form").style.display="none";
        renderAll(); toast(tr('rst.j.loc.added'));
      }catch(e){ toast(tr('rst.j.toast.addFailed'),false); }
    }
    async function removeLocation(id){
      if(!confirm(tr('rst.j.loc.confirmRemove'))) return;
      try{
        await api(API+"/locations/"+id,{method:"DELETE"});
        var res=await api(API); data=res.data||res;
        renderAll(); toast(tr('rst.j.loc.removed'));
      }catch(e){ toast(tr('rst.j.toast.error'),false); }
    }

    /* -- ADD CERT ---------------------------------- */
    function showAddCert(){
      // Zertifikats-Eigennamen (ISO, TUeV, DEKRA, AUeG) bleiben unveraendert —
      // sie heissen in beiden Sprachen gleich; die value-Attribute gehen an den Server.
      $("cert-form").innerHTML="<div class='ep-form' style='margin-top:var(--ds-space-3)'>"+
        "<div class='ep-field'><label>"+esc(tr('rst.j.cert.name'))+"</label><input id='cert-name'/></div>"+
        "<div class='ep-field'><label>"+esc(tr('rst.j.cert.type'))+"</label><select id='cert-type'>"+
        "<option value='aueg_lizenz'>AUeG-Lizenz</option><option value='iso_9001'>ISO 9001</option>"+
        "<option value='iso_27001'>ISO 27001</option><option value='iso_45001'>ISO 45001</option>"+
        "<option value='tuev'>TUeV</option><option value='dekra'>DEKRA</option>"+
        "<option value='branchenzertifikat'>"+esc(tr('rst.j.cert.typeIndustry'))+"</option>"+
        "<option value='qualitaetssiegel'>"+esc(tr('rst.j.cert.typeQuality'))+"</option>"+
        "<option value='sonstige'>"+esc(tr('rst.j.cert.typeOther'))+"</option></select></div>"+
        "<div class='ep-field'><label>"+esc(tr('rst.j.cert.issuerField'))+"</label><input id='cert-issuer'/></div>"+
        "<div class='ep-field'><label>"+esc(tr('rst.j.cert.expiryField'))+"</label><input id='cert-expires' type='date'/></div>"+
        "</div><div class='ep-actions'><button class='ep-btn' onclick='EP.hideForm(\"cert-form\")'>"+esc(tr('rst.j.action.cancel'))+"</button>"+
        "<button class='ep-btn ep-btn--primary' onclick='EP.addCert()'>"+esc(tr('rst.j.action.add'))+"</button></div>";
      $("cert-form").style.display="block";
    }
    async function addCert(){
      var body={cert_name:$("cert-name").value.trim(),cert_type:$("cert-type").value,issuer:$("cert-issuer").value.trim(),expires_at:$("cert-expires").value||null};
      if(!body.cert_name){ toast(tr('rst.j.err.nameRequired'),false); return; }
      try{
        await api(API+"/certifications",{method:"POST",body:body});
        var res=await api(API); data=res.data||res;
        $("cert-form").style.display="none";
        renderAll(); toast(tr('rst.j.cert.added'));
      }catch(e){ toast(tr('rst.j.toast.error'),false); }
    }
    async function removeCert(id){
      if(!confirm(tr('rst.j.cert.confirmRemove'))) return;
      try{
        await api(API+"/certifications/"+id,{method:"DELETE"});
        var res=await api(API); data=res.data||res;
        renderAll(); toast(tr('rst.j.cert.removed'));
      }catch(e){ toast(tr('rst.j.toast.error'),false); }
    }

    /* -- ADD CONTACT ------------------------------- */
    function showAddContact(){
      $("contact-form").innerHTML="<div class='ep-form' style='margin-top:var(--ds-space-3)'>"+
        "<div class='ep-field'><label>"+esc(tr('rst.j.con.name'))+"</label><input id='con-name'/></div>"+
        "<div class='ep-field'><label>"+esc(tr('rst.j.con.role'))+"</label><input id='con-role'/></div>"+
        "<div class='ep-field'><label>"+esc(tr('rst.j.con.email'))+"</label><input id='con-email' type='email'/></div>"+
        "<div class='ep-field'><label>"+esc(tr('rst.j.con.phone'))+"</label><input id='con-phone'/></div>"+
        "<div class='ep-field'><label>"+esc(tr('rst.j.con.isPrimary'))+"</label><select id='con-primary'><option value='false'>"+esc(tr('rst.j.opt.no'))+"</option><option value='true'>"+esc(tr('rst.j.opt.yes'))+"</option></select></div>"+
        "</div><div class='ep-actions'><button class='ep-btn' onclick='EP.hideForm(\"contact-form\")'>"+esc(tr('rst.j.action.cancel'))+"</button>"+
        "<button class='ep-btn ep-btn--primary' onclick='EP.addContact()'>"+esc(tr('rst.j.action.add'))+"</button></div>";
      $("contact-form").style.display="block";
    }
    async function addContact(){
      var body={name:$("con-name").value.trim(),role_title:$("con-role").value.trim(),email:$("con-email").value.trim(),phone:$("con-phone").value.trim(),is_primary:$("con-primary").value==="true"};
      if(!body.name){ toast(tr('rst.j.err.nameRequired'),false); return; }
      try{
        await api(API+"/contacts",{method:"POST",body:body});
        var res=await api(API); data=res.data||res;
        $("contact-form").style.display="none";
        renderAll(); toast(tr('rst.j.con.added'));
      }catch(e){ toast(tr('rst.j.toast.error'),false); }
    }
    async function removeContact(id){
      if(!confirm(tr('rst.j.con.confirmRemove'))) return;
      try{
        await api(API+"/contacts/"+id,{method:"DELETE"});
        var res=await api(API); data=res.data||res;
        renderAll(); toast(tr('rst.j.con.removed'));
      }catch(e){ toast(tr('rst.j.toast.error'),false); }
    }

    function hideForm(id){ $(id).style.display="none"; }

    /* -- SICHERHEIT & GERAETE (P5.1 Fernabmeldung) -------------------
       Backend existiert seit P5.1 (GET /auth/sessions, POST /auth/logout-all
       mit Audit); hier die fehlende Oberflaeche. Die AKTUELLE Sitzung bleibt
       beim Standard-Knopf bestehen (Backend-Default) — wer sich selbst
       aussperrt, kann nicht pruefen, ob es geklappt hat. */
    async function loadSessions(){
      var box=$("security-sessions"); if(!box) return;
      try{
        var res=await api("/api/auth/sessions");
        var offen=res.offen||0, weitere=res.weitere_geraete||0;
        var btn=$("btn-logout-others"); if(btn) btn.disabled = weitere===0;
        box.innerHTML = offen
          ? tr(offen===1?'rst.j.security.sessionsOne':'rst.j.security.sessionsMany', { n: offen })+
            (weitere ? tr('rst.j.security.otherDevices', { n: weitere }) : tr('rst.j.security.onlyThisDevice'))
          : tr('rst.j.security.none');
      }catch(e){
        box.innerHTML="<span style='color:var(--ds-danger)'>"+esc(tr('rst.j.security.loadFailed'))+"</span>";
      }
    }
    async function logoutOtherDevices(){
      if(!window.confirm(tr('rst.j.security.confirmOthers'))) return;
      try{
        var res=await api("/api/auth/logout-all",{method:"POST",body:{}});
        var beendet=res.beendet||0;
        toast(tr(beendet===1?'rst.j.security.endedOne':'rst.j.security.endedMany', { n: beendet }));
        loadSessions();
      }catch(e){ toast(tr('rst.j.security.failed'),false); }
    }
    async function logoutEverywhere(){
      if(!window.confirm(tr('rst.j.security.confirmAll'))) return;
      try{
        await api("/api/auth/logout-all",{method:"POST",body:{include_current:true}});
        window.location.href="/";
      }catch(e){ toast(tr('rst.j.security.failed'),false); }
    }

    /* -- FIRMENFOTO (P7b) --------------------------------------------
       Der Upload-Button in sla_profil.html rief uploadPhoto() auf, die
       Funktion existierte aber nie (toter Button). Jetzt end-to-end:
       Upload -> POST /company-profile/photo -> Vorschau + oeffentliches
       Profil zeigen dasselbe photo_url. */
    function renderPhoto(){
      var box=$("photo-preview"); if(!box) return;
      var url=(data&&data.profile&&data.profile.photo_url)||"";
      if(url){
        box.innerHTML="<img src='"+esc(url)+"' alt='"+esc(tr('rst.j.photo.alt'))+"' style='max-width:320px;width:100%;border-radius:var(--ds-radius-lg);border:1px solid var(--ds-border);display:block'/>"+
          "<button class='ep-btn ep-btn--sm' style='margin-top:var(--ds-space-2)' onclick='EP.deletePhoto()'>"+esc(tr('rst.j.photo.remove'))+"</button>";
      } else {
        box.innerHTML="<span style='font-size:12px;color:var(--ds-text-tertiary)'>"+esc(tr('rst.j.photo.none'))+"</span>";
      }
    }
    async function uploadPhoto(input){
      var file=input&&input.files&&input.files[0];
      if(!file) return;
      input.value="";
      if(file.size>5*1024*1024){ toast(tr('rst.j.photo.tooBig'),false); return; }
      if(["image/png","image/jpeg","image/webp"].indexOf(file.type)<0){ toast(tr('rst.j.photo.wrongType'),false); return; }
      try{
        var fd=new FormData(); fd.append("file",file);
        var res=await api(API+"/photo",{method:"POST",body:fd});
        var payload=res.data||res;
        if(!data.profile) data.profile={};
        data.profile.photo_url=payload.photo_url;
        renderPhoto(); toast(tr('rst.j.photo.saved'));
      }catch(e){ toast(tr('rst.j.photo.uploadFailed'),false); }
    }
    async function deletePhoto(){
      try{
        await api(API+"/photo",{method:"DELETE"});
        if(data.profile) data.profile.photo_url=null;
        renderPhoto(); toast(tr('rst.j.photo.removed'));
      }catch(e){ toast(tr('rst.j.toast.error'),false); }
    }

    window.EP={toggleEdit:toggleEdit,saveOverview:saveOverview,saveBasic:saveBasic,saveCapabilities:saveCapabilities,tagKey:tagKey,_removeTag:_removeTag,showAddLocation:showAddLocation,addLocation:addLocation,removeLocation:removeLocation,showAddCert:showAddCert,addCert:addCert,removeCert:removeCert,showAddContact:showAddContact,addContact:addContact,removeContact:removeContact,hideForm:hideForm,deletePhoto:deletePhoto,logoutOtherDevices:logoutOtherDevices,logoutEverywhere:logoutEverywhere};
    window.uploadPhoto=uploadPhoto; // inline onchange in sla_profil.html
    // Sprachwechsel: Vollstaendigkeits-Navigation, Uebersicht, Stammdaten,
    // Kompetenzen, Listen, Bewertung und Compliance entstehen alle als
    // HTML-String. Sie werden aus dem bereits geladenen Datensatz neu
    // gezeichnet — ohne erneuten Netz-Abruf. Offene Bearbeiten-Formulare
    // bleiben unberuehrt, damit keine Eingabe verloren geht.
    document.addEventListener("tc:langchange", function(){
      if (data) renderAll();
      loadSessions();
    });

    load();
    loadSessions(); // unabhaengig vom Profil-Load — Sicherheitskarte soll auch bei Profil-Fehlern funktionieren
  })();
