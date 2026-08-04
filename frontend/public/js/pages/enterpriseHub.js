"use strict";

/**
 * enterpriseHub.js — Enterprise Hub Page Logic
 * Handles: Plan-gated card locks, CE nudges, value report, global search.
 *
 * i18n (P6.1): Diese Datei wird ausschliesslich von enterprise.html geladen,
 * und dort steht i18n.js im <head> (synchron, vor diesem defer-Script) —
 * TCi18n ist also garantiert vorhanden und wird direkt genutzt.
 * Nicht hier uebersetzt: Topbar/Navigation/Nutzerbereich (gehoeren pageShell.js)
 * und rollenabhaengige Begriffe aus TC.terminology (eigene Sprachfassung in
 * js/terminologyLabels.js).
 */
(function () {

  /* ── i18n-Woerterbuch (P6.1) ──────────────────────────────────────
     Steht bewusst ganz vorne: die Marker im Markup werden erst uebersetzt,
     wenn i18n.js beim DOMContentLoaded apply() faehrt — bis dahin muessen
     die Keys registriert sein. Die deutschen Werte sind Quelle UND Fallback;
     eine EN-Luecke faellt ehrlich auf Deutsch zurueck (nie auf den Key). */
  TCi18n.register('de', {
    'ent.docTitle': 'Operations-Hub – TempConnect',

    'ent.paywall.home': 'Startseite',
    'ent.paywall.title': 'Bereich nicht verfügbar',
    'ent.paywall.featurePrefix': 'Das Feature "',
    'ent.paywall.featureSuffix': '" ist mit deinem aktuellen Plan nicht nutzbar.',
    'ent.paywall.currentPlan': 'Aktueller Plan:',
    'ent.paywall.minPlan': 'Für diesen Bereich benötigst du mindestens einen PLUS-Plan.',
    'ent.paywall.cta': 'Abo ansehen',

    'ent.banner.eyebrow': 'workflow-Standard jetzt',
    'ent.banner.title': 'Arbeitsplatzangebot → Deal → Besetzung/Einsatz → Zeiten ',
    'ent.banner.text': 'Diese Plattform priorisiert bewusst klare Bedienbarkeit und robuste Kernflows. Steuerungs-, Trust- und Admin-Bereiche bleiben sichtbar, werden aber dem operativen Pilotkern nachgeordnet.',
    'ent.banner.pillOffers': 'Angebote & Vermittlung',
    'ent.banner.pillDeal': 'Dealabschluss',
    'ent.banner.pillAssign': 'Worker-Zuweisung',
    'ent.banner.pillTimesheets': 'Stundenzettel & Freigabe',
    'ent.banner.asideTitle': 'Bewusst nachgelagert',
    'ent.banner.asideText': 'Executive, Trust, Admin und breitere Ausbauflächen staerken Vertrieb und Betrieb, ersetzen aber nicht den Pilotstandard. Neue Themen ziehen nur vor, wenn sie Abschluss, Demo oder Robustheit direkt verbessern.',

    'ent.onboarding.label': 'Plattform einrichten',
    'ent.onboarding.toggleTitle': 'Auf-/Zuklappen',
    'ent.onboarding.dismissTitle': 'Ausblenden',

    'ent.value.status': 'Operativer Status',
    'ent.value.matches': 'Matches',
    'ent.value.fillTime': 'Besetzungszeit',
    'ent.value.hoursSaved': 'Std. gespart',
    'ent.value.memberSince': 'Mitglied seit',
    'ent.value.bounty': 'Bounty',
    'ent.value.details': 'Details →',

    // Rollenneutrale Fassung: nur sichtbar, solange die Rolle unbekannt ist.
    'ent.nudge.title': 'Pilot-Standard starten: Arbeitsplatzangebot platzieren oder Personal anbieten',
    'ent.nudge.text': 'Starten Sie den Kernflow der Plattform: Arbeitsplatzangebot erfassen, Personal veroeffentlichen und ohne Medienbruch zum belastbaren Deal gelangen.',
    // Rollenrichtige Fassungen — der Nudge nennt nur die Handlung, deren Knopf
    // die Rolle auch sieht (vorher forderte er Unternehmen zu "Personal
    // anbieten" auf, waehrend genau dieser Knopf fuer sie ausgeblendet wird).
    'ent.nudge.title.company': 'Pilot-Standard starten: Arbeitsplatzangebot platzieren',
    'ent.nudge.text.company': 'Starten Sie den Kernflow der Plattform: Arbeitsplatzangebot erfassen, passendes Personal finden und ohne Medienbruch zum belastbaren Deal gelangen.',
    'ent.nudge.title.agency': 'Pilot-Standard starten: Personal einstellen',
    'ent.nudge.text.agency': 'Starten Sie den Kernflow der Plattform: eigenes Personal veroeffentlichen, passende Arbeitsplaetze finden und ohne Medienbruch zum belastbaren Deal gelangen.',
    'ent.nudge.ctaPostStaff': 'Personal einstellen',
    'ent.nudge.ctaPostWorkplace': 'Arbeitsplatz anbieten',
    'ent.nudge.ctaMarketplace': 'Personal finden',

    'ent.publish.lead': 'Sichtbarkeit erhöhen:',
    'ent.publish.text': 'Weiteres Personal verbessert Ihr Matching und Ihre Angebotschancen.',
    'ent.publish.cta': 'Weitere einstellen',

    'ent.card.marketplace.eyebrow': 'Pilot-Standard',
    'ent.card.marketplace.title': 'Personal finden',
    'ent.card.marketplace.desc': 'Verfuegbares Personal, Angebote, Matching und Suchauftraege im offenen Markt.',
    'ent.card.marketplace.note': 'Frueher Einstieg fuer Personalsuche, Reaktion und Match — ohne glatten Start kippt auch der Dealflow.',
    'ent.card.marketplace.agency.desc': 'Offene Arbeitsplatzangebote, passende Einsaetze und Vermittlungsreaktionen im offenen Markt.',
    'ent.card.marketplace.agency.note': 'Frueher Einstieg fuer Arbeitsplatzsuche, Reaktion und Match — ohne glatten Start kippt auch der Dealflow.',

    'ent.card.requisitions.eyebrow': 'Pilot-Standard',
    'ent.card.requisitions.title': 'Arbeitsplatzangebote',
    'ent.card.requisitions.desc': 'Arbeitsplatzangebote erfassen, priorisieren und mit Lieferanten- sowie Preissteuerung verzahnen.',
    'ent.card.requisitions.note': 'Muss vor Pilotkunden ohne Rueckfragen vom ersten Angebot bis zur klaren Priorisierung bedienbar sein.',

    'ent.card.deals.eyebrow': 'Pilot-Standard',
    'ent.card.deals.title': 'Meine Deals',
    'ent.card.deals.desc': 'Angebote, Einsatzvereinbarungen, Verhandlungen und Dealstatus bis zur Aktivierung.',
    'ent.card.deals.note': 'Pilotkritisch fuer Abschluss, Vereinbarung, naechsten Verantwortlichen und Aktivierung.',

    'ent.card.assignments.eyebrow': 'Pilot-Standard',
    'ent.card.assignments.title': 'Einsaetze & Zeiten',
    'ent.card.assignments.desc': 'Einsatzkraefte, Stundenzettel, Freigaben und laufende Einsaetze operativ steuern.',
    'ent.card.assignments.note': 'Hier entscheidet sich, ob Besetzung, Kundenfreigabe und Folgeprozesse operativ belastbar laufen.',
    'ent.card.assignments.company.eyebrow': 'Begleitsicht',
    'ent.card.assignments.company.title': 'Einsatzverfolgung',
    'ent.card.assignments.company.desc': 'Einsatzstatus, laufende Zuweisungen und Abrechnungsstand lesend einsehen.',
    'ent.card.assignments.company.note': 'Operative Einsatzsteuerung und Freigaben laufen beim beauftragten Personaldienstleister; Ihre Unternehmenssicht ist bewusst lesend.',

    'ent.card.supplier.eyebrow': 'Pilot-Stabilisierung',
    'ent.card.supplier.title': 'Lieferantensteuerung',
    'ent.card.supplier.desc': 'Lieferantenpool, Bewertung und Spend auf Erfuellung ausrichten.',
    'ent.card.supplier.note': 'Staerkt Abschlussquote und Steuerbarkeit, bleibt aber hinter Angeboten, Deals und Zeiten nachgelagert.',

    'ent.card.company.eyebrow': 'Onboarding',
    'ent.card.company.title': 'Mein Unternehmen',
    'ent.card.company.desc': 'Profil, Organisation, Abos und Plattform-Einrichtung.',
    'ent.card.company.note': 'Wichtig fuer sauberes Setup, aber nicht der Tagesprozess nach Livegang.',

    'ent.card.activity.eyebrow': 'Pilotbetrieb',
    'ent.card.activity.title': 'Activity Center',
    'ent.card.activity.desc': 'Benachrichtigungen zu Arbeitsplatzangeboten, Deals, Einsaetzen, Freigaben und Match-Alerts.',
    'ent.card.activity.note': 'Unterstuetzt den Pilotkern, ist aber Begleitflaeche statt Primär-Einstieg.',

    'ent.card.bounties.eyebrow': 'Reputation',
    'ent.card.bounties.title': 'Bounty & Reputation',
    'ent.card.bounties.desc': 'Status, Bounty-Rabatte, Meilensteine und Reputation transparent einsehen.',
    'ent.card.bounties.note': 'Sichtbar fuer Unternehmen und Zeitarbeitsfirmen; belohnt robuste Plattformnutzung ohne zusaetzliche Freischaltung.',

    'ent.card.trust.eyebrow': 'Vertrauensschicht',
    'ent.card.trust.title': 'Trust Center',
    'ent.card.trust.desc': 'Datenschutz, Sicherheit, DSGVO-Governance und API-Dokumentation.',
    'ent.card.trust.note': 'Staerkt Vertrauen und Enterprise-Reife, ersetzt aber keinen operativen Kernflow.',

    'ent.card.executive.eyebrow': 'Steuerungsschicht',
    'ent.card.executive.title': 'Steuerung & Analytik',
    'ent.card.executive.desc': 'KPIs, Besetzungsdruck, Spend, Plattformzustand und Managementsicht.',
    'ent.card.executive.note': 'Nachgelagerte Managementsicht — erst operative Signale, dann KPI-Aggregation.',

    'ent.card.admin.eyebrow': 'Ausbau nach Pilot',
    'ent.card.admin.title': 'Admin',
    'ent.card.admin.desc': 'Benutzer, Organisationen, Audit-Log, Metriken und Plattform-Workflows.',
    'ent.card.admin.note': 'Wichtig fuer Kontrolle und Governance, aber bewusst nicht der aktuelle Kernhebel fuer Pilotabschluss.',

    'ent.card.locations.eyebrow': 'Org-Einstellungen',
    'ent.card.locations.title': 'Standorte & Struktur',
    'ent.card.locations.desc': 'Standorte verwalten, Abteilungen anlegen und Org-Struktur pflegen.',

    'ent.supplier.desc.rates': 'Lieferantenpool, Bewertung, Preisrahmen und Spend auf Erfuellung ausrichten.',
    'ent.supplier.note.base': 'Staerkt Abschlussquote und Steuerbarkeit, bleibt aber hinter Bedarf, Deal und Zeiten nachgelagert.',
    'ent.supplier.note.full': 'Staerkt Abschlussquote und Steuerbarkeit; Preisrahmen greifen dort mit, wo Organisation, Tarif und Rolle dafuer freigeschaltet sind.',
    'ent.supplier.note.readOnly': 'Preisrahmen bleiben fuer Ihre Rolle lesbar; die operative Konditionspflege liegt bei schreibberechtigten Procurement-Rollen.',
    'ent.supplier.note.planLocked': 'Preisrahmen bleiben in dieser Steuerungsschicht fuer berechtigte PRO-/Individuell-Zugaenge reserviert.',
    'ent.supplier.note.orgLocked': 'Preisrahmen bleiben buyer-seitig fuer Unternehmensorganisationen reserviert und werden hier bewusst nicht als Standardzugang beworben.',
    'ent.supplier.note.roleLocked': 'Preisrahmen bleiben nur fuer leseberechtigte Procurement-/Steuerungsrollen sichtbar.',

    'ent.lock.availableFrom': 'Verfügbar ab',
    'ent.lock.upgrade': 'Upgrade ansehen →',
    'ent.pilotLock.meta': 'Wird aktuell fertiggestellt',
    'ent.pilotLock.hint': 'Bald verfügbar – dieser Bereich wird für Sie freigeschaltet.',
    'ent.maturity.meta': 'In Entwicklung',
    'ent.maturity.hint': 'Dieses Modul wird aktuell fertiggestellt und bald freigeschaltet.',

    'ent.nba.titlePrefix': 'Ihr nächster Schritt:',
    'ent.nba.ctaFallback': 'Jetzt erledigen →'
  });

  TCi18n.register('en', {
    'ent.docTitle': 'Operations Hub – TempConnect',

    'ent.paywall.home': 'Home',
    'ent.paywall.title': 'Area not available',
    'ent.paywall.featurePrefix': 'The feature "',
    'ent.paywall.featureSuffix': '" is not included in your current plan.',
    'ent.paywall.currentPlan': 'Current plan:',
    'ent.paywall.minPlan': 'This area requires at least a PLUS plan.',
    'ent.paywall.cta': 'View plans',

    'ent.banner.eyebrow': 'Workflow standard now',
    'ent.banner.title': 'Job posting → Deal → Placement/Assignment → Hours ',
    'ent.banner.text': 'This platform deliberately prioritises clear usability and robust core flows. Steering, trust and admin areas stay visible, but rank behind the operational pilot core.',
    'ent.banner.pillOffers': 'Offers & placement',
    'ent.banner.pillDeal': 'Deal closing',
    'ent.banner.pillAssign': 'Worker assignment',
    'ent.banner.pillTimesheets': 'Timesheets & approval',
    'ent.banner.asideTitle': 'Deliberately deferred',
    'ent.banner.asideText': 'Executive, trust, admin and wider expansion areas strengthen sales and operations, but they do not replace the pilot standard. New topics only move up if they directly improve closing, demo or robustness.',

    'ent.onboarding.label': 'Set up platform',
    'ent.onboarding.toggleTitle': 'Expand/collapse',
    'ent.onboarding.dismissTitle': 'Hide',

    'ent.value.status': 'Operational status',
    'ent.value.matches': 'Matches',
    'ent.value.fillTime': 'Time to fill',
    'ent.value.hoursSaved': 'Hrs saved',
    'ent.value.memberSince': 'Member since',
    'ent.value.bounty': 'Bounty',
    'ent.value.details': 'Details →',

    'ent.nudge.title': 'Start the pilot standard: post a job or offer staff',
    'ent.nudge.text': 'Start the platform core flow: capture a job posting, publish staff and reach a solid deal without any media break.',
    'ent.nudge.title.company': 'Start the pilot standard: post a job',
    'ent.nudge.text.company': 'Start the platform core flow: capture a job posting, find matching staff and reach a solid deal without any media break.',
    'ent.nudge.title.agency': 'Start the pilot standard: list your staff',
    'ent.nudge.text.agency': 'Start the platform core flow: publish your own staff, find matching placements and reach a solid deal without any media break.',
    'ent.nudge.ctaPostStaff': 'Post staff',
    'ent.nudge.ctaPostWorkplace': 'Offer a workplace',
    'ent.nudge.ctaMarketplace': 'Find staff',

    'ent.publish.lead': 'Increase visibility:',
    'ent.publish.text': 'More published staff improves your matching and your chances of getting offers.',
    'ent.publish.cta': 'Post more',

    'ent.card.marketplace.eyebrow': 'Pilot standard',
    'ent.card.marketplace.title': 'Find staff',
    'ent.card.marketplace.desc': 'Available staff, offers, matching and search agents on the open market.',
    'ent.card.marketplace.note': 'Early entry point for staff search, response and match — without a smooth start the deal flow breaks too.',
    'ent.card.marketplace.agency.desc': 'Open job offers, matching assignments and placement responses on the open market.',
    'ent.card.marketplace.agency.note': 'Early entry point for workplace search, response and match — without a smooth start the deal flow breaks too.',

    'ent.card.requisitions.eyebrow': 'Pilot standard',
    'ent.card.requisitions.title': 'Job postings',
    'ent.card.requisitions.desc': 'Capture and prioritise job offers and tie them into supplier and rate governance.',
    'ent.card.requisitions.note': 'Must be usable for pilot customers without questions — from the first offer to clear prioritisation.',

    'ent.card.deals.eyebrow': 'Pilot standard',
    'ent.card.deals.title': 'My deals',
    'ent.card.deals.desc': 'Offers, assignment agreements, negotiations and deal status through to activation.',
    'ent.card.deals.note': 'Pilot-critical for closing, agreement, next owner and activation.',

    'ent.card.assignments.eyebrow': 'Pilot standard',
    'ent.card.assignments.title': 'Assignments & hours',
    'ent.card.assignments.desc': 'Run field staff, timesheets, approvals and active assignments operationally.',
    'ent.card.assignments.note': 'This is where it shows whether placement, client approval and follow-up processes really hold up.',
    'ent.card.assignments.company.eyebrow': 'Companion view',
    'ent.card.assignments.company.title': 'Assignment tracking',
    'ent.card.assignments.company.desc': 'Read-only view of assignment status, active placements and billing progress.',
    'ent.card.assignments.company.note': 'Operational assignment control and approvals sit with the staffing provider you hired; your company view is deliberately read-only.',

    'ent.card.supplier.eyebrow': 'Pilot stabilisation',
    'ent.card.supplier.title': 'Supplier governance',
    'ent.card.supplier.desc': 'Align supplier pool, scoring and spend with fulfilment.',
    'ent.card.supplier.note': 'Strengthens close rate and control, but ranks behind offers, deals and hours.',

    'ent.card.company.eyebrow': 'Onboarding',
    'ent.card.company.title': 'My company',
    'ent.card.company.desc': 'Profile, organisation, subscriptions and platform setup.',
    'ent.card.company.note': 'Important for a clean setup, but not the day-to-day process after go-live.',

    'ent.card.activity.eyebrow': 'Pilot operations',
    'ent.card.activity.title': 'Activity Center',
    'ent.card.activity.desc': 'Notifications on job offers, deals, assignments, approvals and match alerts.',
    'ent.card.activity.note': 'Supports the pilot core, but is a companion surface rather than the primary entry point.',

    'ent.card.bounties.eyebrow': 'Reputation',
    'ent.card.bounties.title': 'Bounty & reputation',
    'ent.card.bounties.desc': 'See status, bounty discounts, milestones and reputation transparently.',
    'ent.card.bounties.note': 'Visible to companies and staffing firms; rewards solid platform use without extra activation.',

    'ent.card.trust.eyebrow': 'Trust layer',
    'ent.card.trust.title': 'Trust Center',
    'ent.card.trust.desc': 'Data protection, security, GDPR governance and API documentation.',
    'ent.card.trust.note': 'Strengthens trust and enterprise maturity, but does not replace an operational core flow.',

    'ent.card.executive.eyebrow': 'Steering layer',
    'ent.card.executive.title': 'Steering & analytics',
    'ent.card.executive.desc': 'KPIs, staffing pressure, spend, platform health and management view.',
    'ent.card.executive.note': 'Downstream management view — operational signals first, then KPI aggregation.',

    'ent.card.admin.eyebrow': 'Post-pilot expansion',
    'ent.card.admin.title': 'Admin',
    'ent.card.admin.desc': 'Users, organisations, audit log, metrics and platform workflows.',
    'ent.card.admin.note': 'Important for control and governance, but deliberately not the current lever for closing the pilot.',

    'ent.card.locations.eyebrow': 'Org settings',
    'ent.card.locations.title': 'Locations & structure',
    'ent.card.locations.desc': 'Manage locations, create departments and maintain the org structure.',

    'ent.supplier.desc.rates': 'Align supplier pool, scoring, rate cards and spend with fulfilment.',
    'ent.supplier.note.base': 'Strengthens close rate and control, but ranks behind demand, deal and hours.',
    'ent.supplier.note.full': 'Strengthens close rate and control; rate cards apply wherever organisation, plan and role are enabled for them.',
    'ent.supplier.note.readOnly': 'Rate cards stay readable for your role; day-to-day rate maintenance sits with procurement roles that have write access.',
    'ent.supplier.note.planLocked': 'Rate cards in this steering layer stay reserved for eligible PRO/Individuell access.',
    'ent.supplier.note.orgLocked': 'Rate cards stay reserved for buyer-side company organisations and are deliberately not promoted here as standard access.',
    'ent.supplier.note.roleLocked': 'Rate cards stay visible only to procurement/steering roles with read access.',

    'ent.lock.availableFrom': 'Available from',
    'ent.lock.upgrade': 'View upgrade →',
    'ent.pilotLock.meta': 'Currently being finalised',
    'ent.pilotLock.hint': 'Coming soon – this area will be unlocked for you.',
    'ent.maturity.meta': 'In development',
    'ent.maturity.hint': 'This module is being finalised and will be unlocked soon.',

    'ent.nba.titlePrefix': 'Your next step:',
    'ent.nba.ctaFallback': 'Do it now →'
  });

  var grid = document.getElementById("hub-grid");
  if (!grid) return;

  /* ── Helpers ──────────────────────────────────────────────────── */
  function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
  function $(id) { return document.getElementById(id); }
  function t(key, params) { return TCi18n.t(key, params); }

  /**
   * Text setzen, den auch ein spaeterer Sprachwechsel korrekt nachzieht.
   *  key gesetzt -> Marker wandert mit, TCi18n.apply() liefert danach dieselbe
   *                 Aussage in der neuen Sprache.
   *  key null    -> Text kommt aus der Rollen-Terminologie (terminologyLabels.js)
   *                 und hat kein Woerterbuch-Pendant; der Marker MUSS weichen,
   *                 sonst setzt die naechste apply()-Runde den Default zurueck.
   */
  function setI18nText(el, key, text) {
    if (!el) return;
    if (key) {
      el.setAttribute("data-i18n", key);
      el.textContent = t(key);
    } else {
      el.removeAttribute("data-i18n");
      el.textContent = text;
    }
  }

  function resolveRateCardAccess(me) {
    if (window.TC && TC.shell && typeof TC.shell.resolveRateCardAccess === "function") {
      return TC.shell.resolveRateCardAccess(me);
    }
    var roleType = String(me && me.role || "").toLowerCase();
    var plan = String(me && me.plan || "DEMO").toUpperCase();
    var orgRole = String(me && me.org_role || "").trim();
    var readRoles = {
      platform_admin: true,
      owner: true,
      admin: true,
      program_manager: true,
      hiring_manager: true,
      supplier_manager: true,
      finance: true,
      viewer: true
    };
    var writeRoles = {
      platform_admin: true,
      owner: true,
      admin: true,
      program_manager: true,
      finance: true
    };
    if (plan === "FREE") plan = "DEMO";
    if (plan === "ENTERPRISE" || plan === "INDIVIDUAL") plan = "INDIVIDUELL";
    if (!me) return { mode: "locked", canRead: false, canWrite: false };
    if (plan !== "PRO" && plan !== "INDIVIDUELL") return { mode: "plan_locked", canRead: false, canWrite: false };
    if (roleType === "agency") return { mode: "org_locked", canRead: false, canWrite: false };
    if (!readRoles[orgRole]) return { mode: "role_locked", canRead: false, canWrite: false };
    if (!writeRoles[orgRole]) return { mode: "read_only", canRead: true, canWrite: false };
    return { mode: "full", canRead: true, canWrite: true };
  }

  /** Zugriffslage -> Woerterbuch-Schluessel (nicht -> Text): so bleibt die
   *  Aussage pro Lage eine einzige Wahrheit und wird zweisprachig gerendert. */
  function getSupplierGovernanceCopy(access) {
    if (!access || access.mode === "locked") {
      return { descKey: "ent.card.supplier.desc", noteKey: "ent.supplier.note.base" };
    }
    if (access.mode === "full") {
      return { descKey: "ent.supplier.desc.rates", noteKey: "ent.supplier.note.full" };
    }
    if (access.mode === "read_only") {
      return { descKey: "ent.supplier.desc.rates", noteKey: "ent.supplier.note.readOnly" };
    }
    if (access.mode === "plan_locked") {
      return { descKey: "ent.card.supplier.desc", noteKey: "ent.supplier.note.planLocked" };
    }
    if (access.mode === "org_locked") {
      return { descKey: "ent.card.supplier.desc", noteKey: "ent.supplier.note.orgLocked" };
    }
    if (access.mode === "role_locked") {
      return { descKey: "ent.card.supplier.desc", noteKey: "ent.supplier.note.roleLocked" };
    }
    return { descKey: "ent.card.supplier.desc", noteKey: "ent.supplier.note.base" };
  }
  function applySupplierGovernanceCopy(me) {
    var copy = getSupplierGovernanceCopy(resolveRateCardAccess(me));
    setI18nText($("supplierGovernanceDesc"), copy.descKey);
    setI18nText($("supplierGovernanceNote"), copy.noteKey);
  }

  /**
   * Welle 7 – Phase 0+1: Hub-Card "Einsaetze & Zeiten" ist der operative
   * Arbeitsplatz der Agentur. Fuer Unternehmen wird sie zu "Einsatzverfolgung"
   * (lesende Sicht) umetikettiert und als Begleitsicht statt Pilot-Kern ausgezeichnet.
   */
  function applyAssignmentsCopy(me) {
    var orgType = String(me && me.org_type || "").toLowerCase();
    if (orgType !== "company") return;
    setI18nText($("assignmentsCardEyebrow"), "ent.card.assignments.company.eyebrow");
    setI18nText($("assignmentsCardTitle"), "ent.card.assignments.company.title");
    setI18nText($("assignmentsCardDesc"), "ent.card.assignments.company.desc");
    setI18nText($("assignmentsCardNote"), "ent.card.assignments.company.note");
  }

  /**
   * Track C: Die Marktplatz-Hub-Card traegt rollenabhaengige Sprache.
   * Unternehmen suchen Personal -> "Personal finden".
   * Zeitarbeitsfirmen suchen Plaetze fuer ihr Personal -> "Arbeitsplatz finden".
   * Spiegelt die bereits rollenbewusste Hauptnavigation (navMarketplace) und
   * nutzt denselben Terminologie-Helfer (keine doppelten String-Konstanten).
   * Seit P6 ist dieser Helfer selbst sprachfaehig — deshalb bleibt der Aufruf
   * unveraendert und der i18n-Marker weicht (siehe setI18nText).
   */
  function applyMarketplaceCopy(me) {
    var orgType = String(me && me.org_type || "").toLowerCase();
    if (!orgType) return; // unbekannte Rolle: Woerterbuch-Default ("Personal finden") belassen
    var label = (window.TC && TC.terminology)
      ? TC.terminology.get("marketplace", orgType, null)
      : null;
    if (label) {
      // Hub-Card-Titel + Aktivierungs-Nudge-CTA fuehren auf denselben Marktplatz-Feed
      setI18nText($("hub-card-marketplace-title"), null, label);
      setI18nText($("ce-nudge-cta-marketplace"), null, label);
    }

    // Rollenrichtige Create-CTA im Aktivierungs-Nudge (Fixplan 3.1):
    // Einsatzunternehmen bieten Arbeitsplaetze an (kein "Personal einstellen");
    // Personaldienstleister stellen Personal ein (kein "Arbeitsplatz anbieten").
    // Nur UI-Sichtbarkeit ueber org_type — keine DB-/API-/Logik-Aenderung.
    var ctaPostStaff = $("ce-nudge-cta-1");      // "Personal einstellen" — Dienstleister-Aktion
    var ctaPostWorkplace = $("ce-nudge-cta-2");  // "Arbeitsplatz anbieten" — Unternehmens-Aktion
    if (orgType === "company" && ctaPostStaff) ctaPostStaff.style.display = "none";
    if (orgType === "agency" && ctaPostWorkplace) ctaPostWorkplace.style.display = "none";

    // Ueberschrift und Beschreibung MUESSEN derselben Rolle folgen wie die
    // Knoepfe darunter. Vorher blieb hier die rollenneutrale Fassung stehen:
    // Ein Unternehmen las "…oder Personal anbieten" — eine Handlung, deren
    // Knopf ihm die Zeile darueber gerade weggenommen hatte.
    if (orgType === "company" || orgType === "agency") {
      setI18nText($("ce-nudge-title"), "ent.nudge.title." + orgType);
      setI18nText($("ce-nudge-text"), "ent.nudge.text." + orgType);
    }

    // Agentur-Sicht: Beschreibung/Fussnote auf Arbeitsplatzsuche ausrichten
    // (Company-Default bleibt unveraendert).
    if (orgType !== "agency") return;
    setI18nText($("hub-card-marketplace-desc"), "ent.card.marketplace.agency.desc");
    setI18nText($("hub-card-marketplace-note"), "ent.card.marketplace.agency.note");
  }

  /* ── Plan-gated Card Locks ────────────────────────────────────── */
  function applyStaticCardLocks(plan) {
    document.querySelectorAll("[data-feature]").forEach(function (card) {
      var feat = card.getAttribute("data-feature");
      if (!feat || PlanFeatures.hasFeature(plan, feat)) return;
      card.classList.add("ds-hub-card--locked");
      if (!card.querySelector(".ds-hub-card__lock")) {
        var lock = document.createElement("span");
        lock.className = "ds-hub-card__lock";
        lock.setAttribute("aria-hidden", "true");
        lock.innerHTML = "&#128274;";
        card.insertBefore(lock, card.firstChild);
      }
      var content = card.querySelector(".ds-hub-card__content");
      if (content && !content.querySelector(".ds-hub-card__meta")) {
        var allowed = PlanFeatures.getAllowedPlans(feat);
        var minPlan = allowed.length ? allowed[0] : "PLUS";
        var meta = document.createElement("div");
        meta.className = "ds-hub-card__meta";
        // Plan-Name ist ein Datenwert (kanonischer Planschluessel) und bleibt
        // unuebersetzt — nur das Label traegt den i18n-Marker.
        meta.innerHTML = '<span data-i18n="ent.lock.availableFrom">' +
          esc(t("ent.lock.availableFrom")) + "</span> " + esc(minPlan);
        var upg = document.createElement("a");
        upg.href = "/public/sla_abo.html";
        upg.className = "ds-hub-card__upgrade";
        setI18nText(upg, "ent.lock.upgrade");
        content.appendChild(meta);
        content.appendChild(upg);
      }
    });
  }

  /* ── Pilot-Customer Card Locks ───────────────────────────────── */

  /**
   * Determines whether the current user is a pilot customer.
   * Uses the organisation's pilot_status from the /api/me payload.
   * Pilot customers have pilot.pilot_status === 'active' and have NOT converted yet.
   * Defensive: if pilot data is missing or malformed, returns false (no lock).
   */
  function isPilotCustomer(me) {
    if (!me || !me.pilot) return false;
    var p = me.pilot;
    // Active pilot who has not yet converted to a paid plan
    if (p.pilot_status === "active" && !p.converted_at) return true;
    // Also treat "trial" or similar pre-launch stages as pilot
    if (p.pilot_status === "trial") return true;
    return false;
  }

  /**
   * Applies soft-lock to cards marked with data-pilot-disabled="true".
   * Reuses the existing ds-hub-card--locked visual pattern with a pilot-specific
   * hint instead of the plan-upgrade CTA.
   * Only runs for pilot customers — live/converted users see no change.
   */
  function applyPilotLocks(me) {
    if (!isPilotCustomer(me)) return;

    document.querySelectorAll('[data-pilot-disabled="true"]').forEach(function (card) {
      // Prevent double-application
      if (card.classList.contains("ds-hub-card--pilot-locked")) return;

      // Apply locked visual (reuses existing locked style from enterprise.css)
      card.classList.add("ds-hub-card--locked", "ds-hub-card--pilot-locked");

      // Remove href to prevent navigation (keeps the <a> in layout)
      card.removeAttribute("href");
      card.setAttribute("aria-disabled", "true");
      card.setAttribute("tabindex", "-1");
      card.setAttribute("role", "link");

      // Pilot hint instead of plan-gated lock icon
      if (!card.querySelector(".ds-hub-card__lock")) {
        var badge = document.createElement("span");
        badge.className = "ds-hub-card__lock";
        badge.setAttribute("aria-hidden", "true");
        badge.innerHTML = "&#128679;"; // construction sign
        card.insertBefore(badge, card.firstChild);
      }

      // Pilot-specific status text
      var content = card.querySelector(".ds-hub-card__content");
      if (content && !content.querySelector(".ds-hub-card__meta")) {
        var meta = document.createElement("div");
        meta.className = "ds-hub-card__meta";
        setI18nText(meta, "ent.pilotLock.meta");
        var hint = document.createElement("div");
        hint.className = "ds-hub-card__pilot-hint";
        setI18nText(hint, "ent.pilotLock.hint");
        content.appendChild(meta);
        content.appendChild(hint);
      }
    });
  }

  /* ── Maturity Gates ───────────────────────────────────────────── */

  /**
   * Greys out hub cards whose module is not yet mature.
   * Uses data-maturity-gate attribute and MATURITY_GATES from /api/plan-features.
   * Applies to ALL users regardless of plan — unreife Module are always locked.
   */
  function applyMaturityGates(maturityGates) {
    if (!maturityGates || typeof maturityGates !== "object") return;
    document.querySelectorAll("[data-maturity-gate]").forEach(function (card) {
      var gate = card.getAttribute("data-maturity-gate");
      if (!gate || maturityGates[gate] !== false) return;

      // Already handled by pilot lock
      if (card.classList.contains("ds-hub-card--pilot-locked")) return;

      card.classList.add("ds-hub-card--locked", "ds-hub-card--maturity-locked");
      card.removeAttribute("href");
      card.setAttribute("aria-disabled", "true");
      card.setAttribute("tabindex", "-1");

      if (!card.querySelector(".ds-hub-card__lock")) {
        var badge = document.createElement("span");
        badge.className = "ds-hub-card__lock";
        badge.setAttribute("aria-hidden", "true");
        badge.innerHTML = "&#128679;"; // construction sign
        card.insertBefore(badge, card.firstChild);
      }

      var content = card.querySelector(".ds-hub-card__content");
      if (content && !content.querySelector(".ds-hub-card__meta")) {
        var meta = document.createElement("div");
        meta.className = "ds-hub-card__meta";
        setI18nText(meta, "ent.maturity.meta");
        var hint = document.createElement("div");
        hint.className = "ds-hub-card__pilot-hint";
        setI18nText(hint, "ent.maturity.hint");
        content.appendChild(meta);
        content.appendChild(hint);
      }
    });
  }

  /* ── CE Activation Nudges ────────────────────────────────────── */
  function loadCeNudges() {
    fetch("/api/capacity-exchange/stats", { credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (stats) {
        if (!stats) return;
        var total = stats.total || 0;
        if (total === 0) {
          var nudge = $("ce-activation-nudge");
          if (nudge) nudge.style.display = "block";
        } else if (total < 3) {
          var pubNudge = $("ce-publish-nudge");
          if (pubNudge) pubNudge.style.display = "block";
        }
      }).catch(function () {});
  }

  /* ── Next-Best-Action ────────────────────────────────────────────
   * Personalisiert die prominente Hero-Karte (#ce-activation-nudge) mit dem
   * ECHTEN naechsten Schritt des Nutzers aus /api/onboarding/status
   * (suggested_next). Macht aus der statischen Karte eine kontextbezogene NBA:
   * "Ihr naechster Schritt: …" + eine klare Primaer-Aktion zum exakten Ziel.
   * Soft-Fail; greift nur solange Onboarding nicht abgeschlossen ist.
   * Schritt-Label/-Beschreibung/-CTA sind API-Daten und bleiben unuebersetzt —
   * nur das Rahmen-Wording traegt i18n-Marker. */
  function loadNextBestAction() {
    fetch("/api/onboarding/status", { credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.success || !d.data) return;
        var data = d.data;
        if (data.dismissed || data.progress_pct >= 100 || !data.suggested_next) return;
        var steps = data.steps || [];
        var step = null;
        for (var j = 0; j < steps.length; j++) {
          if ((steps[j].key || steps[j].step_key) === data.suggested_next) { step = steps[j]; break; }
        }
        if (!step) return;
        var link = step.link || data.suggested_next_link;
        if (!link) return;
        var nudge = $("ce-activation-nudge");
        if (!nudge) return;
        var title = $("ce-nudge-title");
        if (title) {
          title.removeAttribute("data-i18n");
          title.innerHTML = '<span data-i18n="ent.nba.titlePrefix">' +
            esc(t("ent.nba.titlePrefix")) + "</span> " + esc(step.label || "");
        }
        var text = $("ce-nudge-text");
        if (text && step.description) {
          text.removeAttribute("data-i18n");
          text.textContent = step.description;
        }
        var cta1 = $("ce-nudge-cta-1");
        var row = cta1 ? cta1.parentNode : null;
        if (row && !$("nba-primary-cta")) {
          var a = document.createElement("a");
          a.id = "nba-primary-cta";
          a.href = link;
          a.className = "ds-btn ds-btn--primary ds-btn--sm";
          a.setAttribute("data-cta-write", "true");
          if (step.cta) {
            a.textContent = step.cta + " →";
          } else {
            setI18nText(a, "ent.nba.ctaFallback");
          }
          row.insertBefore(a, row.firstChild);
          // Eine klare Hierarchie: bestehende Primaer-Buttons zu Sekundaer degradieren.
          var others = row.querySelectorAll(".ds-btn--primary");
          for (var i = 0; i < others.length; i++) {
            if (others[i] !== a) others[i].classList.remove("ds-btn--primary");
          }
        }
        nudge.style.display = "block";
      }).catch(function () {});
  }

  /* ── Value Report Widget ─────────────────────────────────────── */
  function loadValueReport() {
    fetch("/api/value-report", { credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        $("value-report-widget").style.display = "block";
        $("vr-matches").textContent = d.total_matches || 0;
        $("vr-fill-hours").textContent = d.avg_fill_hours != null ? d.avg_fill_hours.toFixed(1) : "–";
        $("vr-hours-saved").textContent = d.estimated_hours_saved || 0;
        if (d.member_since) {
          $("vr-member-since").textContent = new Date(d.member_since).toLocaleDateString(TCi18n.dateLocale(), { month: "short", year: "numeric" });
        }
        $("vr-discount").textContent = (d.bounty_discount_pct || 0) + "%";
      }).catch(function () {});
  }

  /* ── Rollen-/Surface-basierte Card-Sichtbarkeit ───────────────── */
  function applyHubVisibility(me) {
    if (!window.TC || !window.TC.hubVisibility || typeof window.TC.hubVisibility.resolve !== "function") return;
    var cards = grid.querySelectorAll("[data-surface]");
    cards.forEach(function (card) {
      var key = card.getAttribute("data-surface");
      if (!key) return;
      var decision = window.TC.hubVisibility.resolve(me, key);
      if (!decision || decision.visible) {
        card.removeAttribute("aria-hidden");
        card.removeAttribute("data-surface-state");
        card.classList.remove("ds-hub-card--read-only");
        return;
      }
      if (decision.state === "read_only") {
        // Karte bleibt sichtbar und navigierbar — nur lesend (kein Schreib-CTA).
        card.setAttribute("data-surface-state", "read_only");
        card.classList.add("ds-hub-card--read-only");
        return;
      }
      // Komplett ausblenden: kein Render, kein Klick, kein Folge-Request.
      card.style.display = "none";
      card.setAttribute("aria-hidden", "true");
      card.setAttribute("data-surface-state", decision.state || "hidden");
      card.removeAttribute("href");
      card.setAttribute("tabindex", "-1");
    });
  }

  /**
   * applyCTAVisibility(me)
   * Blendet Schreib-CTAs (data-cta-write="true") fuer Rollen aus,
   * die keinen Schreibzugriff auf den Hub haben (viewer, finance).
   * Aktionslose Rollen sollen keine "Bedarf erfassen"- / "Kapazitaet anbieten"-
   * Buttons sehen — sie koennen lesen und Berichte einsehen.
   */
  function applyCTAVisibility(me) {
    var writeOnlyRoles = ["viewer", "finance"];
    var orgRole = me && (me.org_role || me.role) || "";
    var hideCTAs = writeOnlyRoles.indexOf(orgRole) !== -1;
    if (!hideCTAs) return;
    var writeCtaEls = document.querySelectorAll("[data-cta-write]");
    writeCtaEls.forEach(function (el) {
      el.style.display = "none";
      el.setAttribute("aria-hidden", "true");
    });
  }

  /* ── Notification-Badges pro Hub-Card ─────────────────────────────
   * Wird ausschliesslich von frontend/public/js/hubCardBadges.js gerendert
   * (ein einziges Badge-System: .ds-hub-card--active Glow + Gold-Pille +
   * Hover-Tooltip + mark-read-on-click Deep-Link, 60s-Polling). Die frueher
   * hier parallel laufende rote .tc-hub-card-notif-Variante (surface-summary)
   * wurde entfernt — sie erzeugte doppelte/abweichende Badges auf derselben Card.
   * Der Endpoint /api/notifications/surface-summary bleibt fuer Tests/externe
   * Konsumenten bestehen, wird vom Hub aber nicht mehr doppelt gerendert. */

  /* ── Sprachwechsel ────────────────────────────────────────────────
   * TCi18n.apply() setzt beim Umschalten zuerst ALLE Marker auf den
   * Woerterbuch-Default zurueck. Danach muss die rollenabhaengige Schicht
   * erneut gewinnen — dieselbe Reihenfolge wie in der Shell (updateNavLabels).
   * Ohne diesen Hook stuende nach dem Umschalten wieder "Personal finden"
   * statt "Arbeitsplatz finden" auf der Agentur-Karte. */
  var lastMe = null;
  document.addEventListener("tc:langchange", function () {
    applySupplierGovernanceCopy(lastMe);
    applyAssignmentsCopy(lastMe);
    applyMarketplaceCopy(lastMe);
  });

  /* ── Boot ────────────────────────────────────────────────────── */
  fetch("/api/me", { credentials: "include" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (me) {
      lastMe = me;
      window._slaPlan = (me && me.plan) ? me.plan : "DEMO";
      applySupplierGovernanceCopy(me);
      applyAssignmentsCopy(me);
      applyMarketplaceCopy(me);
      applyHubVisibility(me);
      applyCTAVisibility(me);
      PlanFeatures.load().then(function (pf) {
        applyStaticCardLocks(window._slaPlan);
        applyMaturityGates(pf && pf.MATURITY_GATES ? pf.MATURITY_GATES : null);
      });
      if (me) {
        applyPilotLocks(me);
        loadCeNudges();
        loadNextBestAction();
        loadValueReport();
        // Hub-Card-Badges werden ausschliesslich von hubCardBadges.js gerendert
        // (Glow + Tooltip + mark-read Deep-Link, einziges Badge-System).
      }
    })
    .catch(function () {
      lastMe = null;
      window._slaPlan = "DEMO";
      applySupplierGovernanceCopy(null);
      applyAssignmentsCopy(null);
      applyMarketplaceCopy(null);
      applyHubVisibility(null);
      PlanFeatures.load().then(function (pf) {
        applyStaticCardLocks("DEMO");
        applyMaturityGates(pf && pf.MATURITY_GATES ? pf.MATURITY_GATES : null);
      });
    });

})();
