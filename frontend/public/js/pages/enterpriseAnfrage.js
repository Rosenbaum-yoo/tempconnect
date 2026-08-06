/* ══════════════════════════════════════════════════════
   Individueller Tarif Anfrage — Page Logic

   Ab Welle 8 Schritt 13 holt diese Datei ALLE Add-ons (`addons[]`) UND den
   Individuell-Sockel (`individuell_baseline`) aus `GET /api/public/catalog`
   ueber `TC.catalog`. Hartcodierte Preise / Seat-Limits / Add-on-Listen
   sind entfernt. Submit-Payload bleibt zur bestehenden
   `enterprise_config`-Backend-Logik kompatibel (EUR-Werte; Server multipliziert
   *100 zu Cents).
   ═════════════════════════════════════════════════════ */
(function() {
  'use strict';

  /* ── Bruecke statt harter Abhaengigkeit (wie js/pages/marketplaceFeed.js) ──
     Diese Datei wird auch in einer vm-Sandbox OHNE geladene i18n-Schicht
     ausgefuehrt (test/enterprisePrefill.test.js prueft dort das Vorbefuellen
     der Kontaktfelder). Ohne window.TCi18n uebernimmt ein lokaler Ersatz mit
     exakt dem heutigen deutschen Verhalten — kein Absturz, kein leerer Text. */
  var TCi18n = (typeof window !== 'undefined' && window.TCi18n) ? window.TCi18n : createLocalI18n();

  function createLocalI18n() {
    var dicts = { de: {}, en: {} };
    return {
      register: function(locale, entries) {
        var target = dicts[locale];
        if (!target || !entries) return;
        for (var k in entries) {
          if (Object.prototype.hasOwnProperty.call(entries, k)) target[k] = entries[k];
        }
      },
      t: function(key, params) {
        var val = dicts.de[key];
        if (val == null) return "";
        if (!params) return val;
        return String(val).replace(/\{(\w+)\}/g, function(m, name) {
          return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m;
        });
      },
      locale: function() { return "de"; },
      dateLocale: function() { return "de-DE"; }
    };
  }

/* ── Woerterbuch (P6.1, DE/EN) ─────────────────────────────────────────────
   Woerterbuch der ganzen Seite: enterprise_anfrage.html laedt i18n.js im head
   und hat kein eigenes Inline-Script; alle rst.h.*-Schluessel stehen hier.

   Drei-Seiten-Regel: Der individuelle Tarif richtet sich ausschliesslich an
   Einsatzunternehmen (Hero: "fuer Einsatzunternehmen"), die Gegenseite bucht
   ihn nicht. Die feste Unternehmenssprache ist hier also korrekt; kein
   rollenabhaengiger Begriff aus terminologyLabels.js wird eingefroren.

   Englische Begriffswelt: "Arbeitsplatzangebot" = job posting, "Lieferant" =
   supplier, "Preisrahmen" = rate card, "Freigabe" = approval, "Tarif" = plan.

   Bewusst NICHT uebersetzt:
   - Name, Beschreibung und Einheit der Add-ons (Katalogdaten aus
     /api/public/catalog) sowie alle Preise und Plan-Rohwerte
   - Server-Fehlermeldungen (data.message) und Rollen-Rohwerte
   - der Text, der in das Anmerkungsfeld VORAUSGEFUELLT und damit an unser
     Tarif-Team GESENDET wird (siehe KONTEXT_DE) — die Sprache des Lesenden
     steht beim Absenden nicht fest, deshalb bleibt er deutsch
   - Topbar/Navigation/Nutzerbereich (pageShell.js)                          */
TCi18n.register('de', {
  'rst.h.docTitle': 'Individuellen Tarif für Lieferantensteuerung konfigurieren – TempConnect',
  'rst.h.hero.label': 'Individueller Tarif',
  'rst.h.hero.title': 'Konfigurieren Sie Ihren individuellen Tarif für Einsatzunternehmen',
  'rst.h.hero.desc': 'Für wiederkehrende Zeitarbeitsbedarfe mit mehreren Lieferanten, Preisrahmen, Freigaben und Standorten. Waehlen Sie Zusatzmodule, die Ihre Lieferantensteuerung staerker machen.',
  'rst.h.incl.title': '✅ Im Standard des individuellen Tarifs enthalten',
  'rst.h.incl.desc': 'Alles aus PRO plus die buyer-first Steuerungsmodule für wiederkehrende Zeitarbeit — sofort verfuegbar.',
  'rst.h.incl.1': 'Unbegrenzte Arbeitsplatzangebote & Angebote',
  'rst.h.incl.2': '13-Faktor-Matching & Ranking',
  'rst.h.incl.3': 'Lieferantenpool & Preferred First',
  'rst.h.incl.4': 'Preisrahmen & Rate Compliance',
  'rst.h.incl.5': 'Spend & Kostenanalytik',
  'rst.h.incl.6': 'Multi-Abteilungen & Standorte',
  'rst.h.incl.7': 'Freigabe-Workflows',
  'rst.h.incl.8': 'Vertragsmanagement',
  'rst.h.incl.9': 'Compliance-Management',
  'rst.h.incl.10': 'Audit- & Executive-Reporting',
  'rst.h.incl.11': 'Digitale Stundenzettel & Rechnungsbezug',
  'rst.h.incl.12': 'Emergency Staffing / Notdienst',
  'rst.h.incl.13': 'Pulse-Timer (30 Min)',
  'rst.h.incl.14': '99,5 % Plattformverfuegbarkeit',
  'rst.h.incl.15': 'Dedizierter Ansprechpartner',
  'rst.h.addons.title': 'Zusatzmodule hinzubuchen',
  'rst.h.addons.desc': 'Optionale Erweiterungen — waehlen Sie nur, was Sie brauchen.',
  'rst.h.addons.loading': 'Lade Add-ons…',
  'rst.h.addons.error': 'Add-ons konnten nicht geladen werden.',
  'rst.h.addons.retry': 'Erneut versuchen',
  'rst.h.addons.empty': 'Aktuell keine Add-ons verfügbar.',
  'rst.h.addons.soon': 'Bald verfügbar',
  'rst.h.addons.owned': 'Bereits gebucht',
  'rst.h.addons.unitMonthly': '/Monat',
  'rst.h.addons.unitOnce': 'einmalig',
  'rst.h.seats.title': 'Benutzer-Kontingent',
  'rst.h.seats.desc': 'Der Standard des individuellen Tarifs beinhaltet bis zu 50 Benutzer. Darueber hinaus: 29 EUR / Nutzer / Monat.',
  'rst.h.seats.count': 'Anzahl Benutzer:',
  'rst.h.seats.included': 'Im Standard enthalten',
  'rst.h.seats.surcharge': '+{betrag} EUR/Monat',
  'rst.h.ctx.label': 'Anfrage-Kontext',
  'rst.h.ctx.title': 'Individueller Tarif auf Anfrage',
  'rst.h.ctx.fromAbo': 'Sie starten eine Anfrage aus den Abo-Modellen. Wir nehmen Ihre Anforderungen auf und erstellen ein individuelles Angebot.',
  'rst.h.ctx.default': 'Sie starten eine Anfrage fuer den individuellen Tarif. Unser Team begleitet Sie bis zum Angebot.',
  'rst.h.ctx.source': 'Quelle',
  'rst.h.ctx.currentPlan': 'Aktueller Plan',
  'rst.h.ctx.interest': 'Interesse',
  'rst.h.ctx.goal': 'Ziel',
  'rst.h.ctx.planIndividuell': 'Individueller Tarif',
  'rst.h.ctx.srcSlaAbo': 'Abo-Modelle',
  'rst.h.ctx.intentUpgrade': 'Upgrade auf individuellen Tarif',
  'rst.h.ctx.intentRequest': 'Individuellen Tarif anfragen',
  'rst.h.contact.title': 'Kontakt & Rechnungsdaten',
  'rst.h.contact.desc': 'Unser Tarif-Team meldet sich innerhalb von 24 Stunden bei Ihnen, um Standorte, Lieferanten und Bedarfsvolumen zu qualifizieren.',
  'rst.h.f.company': 'Firma *',
  'rst.h.f.contact': 'Ansprechpartner *',
  'rst.h.f.email': 'E-Mail *',
  'rst.h.f.role': 'Rolle / Funktion',
  'rst.h.f.phone': 'Telefon',
  'rst.h.f.street': 'Strasse & Nr.',
  'rst.h.f.city': 'PLZ / Ort',
  'rst.h.f.vat': 'USt-IdNr.',
  'rst.h.f.start': 'Erwarteter Start',
  'rst.h.f.tech': 'Technische Anforderungen (optional, Mehrfachauswahl)',
  'rst.h.f.notes': 'Anmerkungen / Anforderungen',
  'rst.h.f.sites': 'Anzahl Standorte (optional)',
  'rst.h.f.region': 'Region / Scope (optional)',
  'rst.h.f.context': 'Kontext (optional)',
  'rst.h.ph.company': 'Muster GmbH',
  'rst.h.ph.contact': 'Max Mustermann',
  'rst.h.ph.role': 'z.B. Einkauf, HR, Geschäftsführung',
  'rst.h.ph.street': 'Musterstrasse 1',
  'rst.h.ph.notes': 'Besondere Anforderungen, Anzahl Standorte, aktive Lieferanten, Integrationen, Bedarfe pro Monat...',
  'rst.h.ph.sites': 'z.B. 12',
  'rst.h.ph.region': 'z.B. DACH, EU',
  'rst.h.ph.context': 'Kurz: Worum geht es, welche Eckdaten helfen fuer eine qualifizierte Rueckmeldung?',
  'rst.h.tech.sso': 'SSO / SAML',
  'rst.h.tech.ssoDesc': 'z.B. Azure AD, Okta, Keycloak',
  'rst.h.tech.mfa': 'MFA-Pflicht',
  'rst.h.tech.mfaDesc': 'Zwei-Faktor fuer alle Admin-Nutzer',
  'rst.h.tech.api': 'REST-API / Integration',
  'rst.h.tech.apiDesc': 'API-Keys, Webhooks, ERP-Anbindung',
  'rst.h.tech.compliance': 'Compliance & Audit',
  'rst.h.tech.complianceDesc': 'Audit-Log, DSGVO-Export, Pruefpfade',
  'rst.h.collab.label': 'Interesse an strategischer Zusammenarbeit / Rahmenkonditionen',
  'rst.h.collab.optIn': 'Ich moechte ein qualifiziertes Kooperationsinteresse fuer eine moegliche Zusammenarbeit im individuellen Tarif anfragen.',
  'rst.h.collab.optInNote': 'Kein unmittelbarer Vertragsabschluss ueber die Plattform.',
  'rst.h.ss.headline': '⚡ Direkt buchen & sofort freischalten',
  'rst.h.ss.desc': 'Ihre Auswahl ergibt einen festen Monatspreis. Buchen Sie den individuellen Tarif direkt und sicher über unseren Zahlungsdienstleister – die Freischaltung erfolgt automatisch nach erfolgreicher Zahlung.',
  'rst.h.ss.book': 'Jetzt buchen & freischalten',
  'rst.h.ss.preparing': 'Wird vorbereitet…',
  'rst.h.ss.redirect': 'Weiterleitung zu Stripe…',
  'rst.h.ss.note': 'Enthält Ihre Auswahl Komponenten, die wir individuell für Sie ausarbeiten, leiten wir Sie automatisch in den Anfrage-Prozess – es wird dann nichts berechnet.',
  'rst.h.submit.hint': 'Nach Absenden erhalten Sie eine Zusammenfassung per E-Mail. Unser Tarif-Team erstellt Ihnen ein verbindliches Angebot.',
  'rst.h.submit.send': 'Anfrage absenden',
  'rst.h.submit.sending': 'Wird gesendet…',
  'rst.h.success.title': '✅ Anfrage erfolgreich gesendet!',
  'rst.h.success.text': 'Vielen Dank fuer Ihr Interesse am individuellen Tarif. Unser Team wird sich innerhalb von 24 Stunden bei Ihnen melden und ein individuelles Angebot erstellen.',
  'rst.h.success.back': 'Zurueck zu den Abo-Modellen',
  'rst.h.success.previewIntro': 'Ihre unverbindliche Kostenvorschau wurde erzeugt.',
  'rst.h.success.previewDocId': 'Dokument-ID:',
  'rst.h.success.previewDownload': 'Kostenvorschau herunterladen',
  'rst.h.success.previewNote': 'Unverbindliche Preview; das verbindliche Angebot folgt nach Pruefung durch das Tarif-Team.',
  'rst.h.inv.title': 'Kostenvorschau',
  'rst.h.inv.badge': 'INDIVIDUELLER TARIF',
  'rst.h.inv.base': 'Basispaket individueller Tarif',
  'rst.h.inv.baseHint': 'Alle Standard-Features, bis {n} Nutzer',
  'rst.h.inv.extraSeats': 'Zusaetzliche Nutzer',
  'rst.h.inv.monthly': 'Monatlich',
  'rst.h.inv.onetime': 'Einmalig',
  'rst.h.inv.note': 'Alle Preise in EUR netto zzgl. gesetzlicher MwSt. Dies ist eine unverbindliche Kostenvorschau. Das verbindliche Angebot erhalten Sie nach Pruefung durch unser Tarif-Team.',
  'rst.h.inv.print': 'Kostenvorschau drucken',
  'rst.h.disclaimer': 'Alle Preise verstehen sich in EUR netto zzgl. gesetzlicher MwSt. Die angezeigte Kostenvorschau ist unverbindlich. Das verbindliche Angebot wird nach individueller Pruefung erstellt. Alle Angaben ohne Gewaehr.',
  'rst.h.err.required': 'Bitte Firma, Ansprechpartner und E-Mail ausfuellen.',
  'rst.h.err.offline': 'Verbindung fehlgeschlagen. Bitte Internetverbindung pruefen und erneut versuchen.',
  'rst.h.err.server': 'Server nicht erreichbar. Bitte spaeter erneut versuchen.',
  'rst.h.err.status': 'Anfrage fehlgeschlagen (Status {status}).',
  'rst.h.err.validationPath': 'Bitte Eingaben pruefen ({pfad}).',
  'rst.h.err.validation': 'Bitte Eingaben pruefen.',
  'rst.h.err.rateLimited': 'Zu viele Anfragen in kurzer Zeit. Bitte einige Minuten warten.',
  'rst.h.err.duplicate': 'Wir haben bereits eine offene Anfrage zu dieser E-Mail. Wir melden uns in Kuerze.',
  'rst.h.err.csrf': 'Sicherheitstoken abgelaufen. Bitte Seite neu laden und erneut versuchen.',
  'rst.h.err.generic': 'Anfrage fehlgeschlagen. Bitte erneut versuchen.',
  'rst.h.err.selection': 'Bitte Auswahl pruefen.',
  'rst.h.err.invalidSeats': 'Bitte eine gueltige Nutzeranzahl (mindestens 1) waehlen.',
  'rst.h.err.unknownAddon': 'Ein gewaehltes Zusatzmodul ist nicht verfuegbar. Bitte Seite neu laden.',
  'rst.h.err.addonInactive': 'Ein gewaehltes Zusatzmodul ist derzeit nicht buchbar.',
  'rst.h.err.addonSoon': 'Ein gewaehltes Zusatzmodul ist noch nicht verfuegbar.',
  'rst.h.err.addonNotForPlan': 'Ein gewaehltes Zusatzmodul ist fuer diesen Tarif nicht buchbar.',
  'rst.h.err.orgRequired': 'Bitte melden Sie sich mit Ihrem Unternehmenskonto an, um direkt zu buchen.',
  'rst.h.err.quoteFreeze': 'Der Preis konnte nicht fixiert werden. Bitte erneut versuchen.',
  'rst.h.err.stripe': 'Die Zahlung konnte nicht gestartet werden. Bitte erneut versuchen.',
  'rst.h.err.forbidden': 'Zugriff verweigert. Bitte anmelden und ggf. die Zwei-Faktor-Authentifizierung abschliessen.',
  'rst.h.err.checkoutOffline': 'Verbindung fehlgeschlagen. Bitte erneut versuchen.',
  'rst.h.err.checkoutGeneric': 'Buchung fehlgeschlagen. Bitte erneut versuchen.'
});
TCi18n.register('en', {
  'rst.h.docTitle': 'Configure a custom plan for supplier management – TempConnect',
  'rst.h.hero.label': 'Custom plan',
  'rst.h.hero.title': 'Configure your custom plan for client companies',
  'rst.h.hero.desc': 'For recurring temporary staffing demand across several suppliers, rate cards, approvals and locations. Choose the add-on modules that strengthen your supplier management.',
  'rst.h.incl.title': '✅ Included in the custom plan as standard',
  'rst.h.incl.desc': 'Everything in PRO plus the buyer-first control modules for recurring temporary staffing — available immediately.',
  'rst.h.incl.1': 'Unlimited job postings & offers',
  'rst.h.incl.2': '13-factor matching & ranking',
  'rst.h.incl.3': 'Supplier pool & preferred first',
  'rst.h.incl.4': 'Rate cards & rate compliance',
  'rst.h.incl.5': 'Spend & cost analytics',
  'rst.h.incl.6': 'Multiple departments & locations',
  'rst.h.incl.7': 'Approval workflows',
  'rst.h.incl.8': 'Contract management',
  'rst.h.incl.9': 'Compliance management',
  'rst.h.incl.10': 'Audit & executive reporting',
  'rst.h.incl.11': 'Digital timesheets & invoice reference',
  'rst.h.incl.12': 'Emergency staffing',
  'rst.h.incl.13': 'Pulse timer (30 min)',
  'rst.h.incl.14': '99.5 % platform availability',
  'rst.h.incl.15': 'Dedicated contact person',
  'rst.h.addons.title': 'Add optional modules',
  'rst.h.addons.desc': 'Optional extensions — pick only what you need.',
  'rst.h.addons.loading': 'Loading add-ons…',
  'rst.h.addons.error': 'Add-ons could not be loaded.',
  'rst.h.addons.retry': 'Try again',
  'rst.h.addons.empty': 'No add-ons available at the moment.',
  'rst.h.addons.soon': 'Coming soon',
  'rst.h.addons.owned': 'Already booked',
  'rst.h.addons.unitMonthly': '/month',
  'rst.h.addons.unitOnce': 'one-off',
  'rst.h.seats.title': 'User allowance',
  'rst.h.seats.desc': 'The custom plan includes up to 50 users as standard. Beyond that: EUR 29 per user per month.',
  'rst.h.seats.count': 'Number of users:',
  'rst.h.seats.included': 'Included as standard',
  'rst.h.seats.surcharge': '+{betrag} EUR/month',
  'rst.h.ctx.label': 'Request context',
  'rst.h.ctx.title': 'Custom plan on request',
  'rst.h.ctx.fromAbo': 'You are starting a request from the plan overview. We will record your requirements and prepare an individual quote.',
  'rst.h.ctx.default': 'You are starting a request for the custom plan. Our team will guide you through to the quote.',
  'rst.h.ctx.source': 'Source',
  'rst.h.ctx.currentPlan': 'Current plan',
  'rst.h.ctx.interest': 'Interest',
  'rst.h.ctx.goal': 'Goal',
  'rst.h.ctx.planIndividuell': 'Custom plan',
  'rst.h.ctx.srcSlaAbo': 'Plans',
  'rst.h.ctx.intentUpgrade': 'Upgrade to the custom plan',
  'rst.h.ctx.intentRequest': 'Request the custom plan',
  'rst.h.contact.title': 'Contact & billing details',
  'rst.h.contact.desc': 'Our plan team will contact you within 24 hours to qualify locations, suppliers and demand volume.',
  'rst.h.f.company': 'Company *',
  'rst.h.f.contact': 'Contact person *',
  'rst.h.f.email': 'Email *',
  'rst.h.f.role': 'Role / function',
  'rst.h.f.phone': 'Phone',
  'rst.h.f.street': 'Street & no.',
  'rst.h.f.city': 'Postcode / city',
  'rst.h.f.vat': 'VAT ID',
  'rst.h.f.start': 'Expected start',
  'rst.h.f.tech': 'Technical requirements (optional, multiple choice)',
  'rst.h.f.notes': 'Notes / requirements',
  'rst.h.f.sites': 'Number of locations (optional)',
  'rst.h.f.region': 'Region / scope (optional)',
  'rst.h.f.context': 'Context (optional)',
  'rst.h.ph.company': 'Example Ltd',
  'rst.h.ph.contact': 'Jane Doe',
  'rst.h.ph.role': 'e.g. procurement, HR, management',
  'rst.h.ph.street': 'Example Street 1',
  'rst.h.ph.notes': 'Special requirements, number of locations, active suppliers, integrations, demand per month...',
  'rst.h.ph.sites': 'e.g. 12',
  'rst.h.ph.region': 'e.g. DACH, EU',
  'rst.h.ph.context': 'Briefly: what is it about, which key facts help us reply in a qualified way?',
  'rst.h.tech.sso': 'SSO / SAML',
  'rst.h.tech.ssoDesc': 'e.g. Azure AD, Okta, Keycloak',
  'rst.h.tech.mfa': 'Mandatory MFA',
  'rst.h.tech.mfaDesc': 'Two-factor for all admin users',
  'rst.h.tech.api': 'REST API / integration',
  'rst.h.tech.apiDesc': 'API keys, webhooks, ERP connection',
  'rst.h.tech.compliance': 'Compliance & audit',
  'rst.h.tech.complianceDesc': 'Audit log, GDPR export, audit trails',
  'rst.h.collab.label': 'Interest in strategic collaboration / framework conditions',
  'rst.h.collab.optIn': 'I would like to register qualified interest in a possible collaboration within the custom plan.',
  'rst.h.collab.optInNote': 'No contract is concluded directly via the platform.',
  'rst.h.ss.headline': '⚡ Book directly & activate immediately',
  'rst.h.ss.desc': 'Your selection results in a fixed monthly price. Book the custom plan directly and securely via our payment provider – activation happens automatically once payment succeeds.',
  'rst.h.ss.book': 'Book & activate now',
  'rst.h.ss.preparing': 'Preparing…',
  'rst.h.ss.redirect': 'Redirecting to Stripe…',
  'rst.h.ss.note': 'If your selection contains components we tailor individually for you, we will move you into the request process automatically – nothing is charged in that case.',
  'rst.h.submit.hint': 'After submitting you receive a summary by email. Our plan team will prepare a binding quote for you.',
  'rst.h.submit.send': 'Send request',
  'rst.h.submit.sending': 'Sending…',
  'rst.h.success.title': '✅ Request sent successfully!',
  'rst.h.success.text': 'Thank you for your interest in the custom plan. Our team will contact you within 24 hours and prepare an individual quote.',
  'rst.h.success.back': 'Back to the plans',
  'rst.h.success.previewIntro': 'Your non-binding cost preview has been generated.',
  'rst.h.success.previewDocId': 'Document ID:',
  'rst.h.success.previewDownload': 'Download cost preview',
  'rst.h.success.previewNote': 'Non-binding preview; the binding quote follows once our plan team has reviewed it.',
  'rst.h.inv.title': 'Cost preview',
  'rst.h.inv.badge': 'CUSTOM PLAN',
  'rst.h.inv.base': 'Custom plan base package',
  'rst.h.inv.baseHint': 'All standard features, up to {n} users',
  'rst.h.inv.extraSeats': 'Additional users',
  'rst.h.inv.monthly': 'Monthly',
  'rst.h.inv.onetime': 'One-off',
  'rst.h.inv.note': 'All prices in EUR net plus statutory VAT. This is a non-binding cost preview. You receive the binding quote once our plan team has reviewed it.',
  'rst.h.inv.print': 'Print cost preview',
  'rst.h.disclaimer': 'All prices are in EUR net plus statutory VAT. The cost preview shown is non-binding. The binding quote is issued after an individual review. All information without guarantee.',
  'rst.h.err.required': 'Please fill in company, contact person and email.',
  'rst.h.err.offline': 'Connection failed. Please check your internet connection and try again.',
  'rst.h.err.server': 'Server unreachable. Please try again later.',
  'rst.h.err.status': 'Request failed (status {status}).',
  'rst.h.err.validationPath': 'Please check your input ({pfad}).',
  'rst.h.err.validation': 'Please check your input.',
  'rst.h.err.rateLimited': 'Too many requests in a short time. Please wait a few minutes.',
  'rst.h.err.duplicate': 'We already have an open request for this email address. We will be in touch shortly.',
  'rst.h.err.csrf': 'Security token expired. Please reload the page and try again.',
  'rst.h.err.generic': 'Request failed. Please try again.',
  'rst.h.err.selection': 'Please check your selection.',
  'rst.h.err.invalidSeats': 'Please choose a valid number of users (at least 1).',
  'rst.h.err.unknownAddon': 'One selected module is not available. Please reload the page.',
  'rst.h.err.addonInactive': 'One selected module cannot be booked at the moment.',
  'rst.h.err.addonSoon': 'One selected module is not available yet.',
  'rst.h.err.addonNotForPlan': 'One selected module cannot be booked on this plan.',
  'rst.h.err.orgRequired': 'Please sign in with your company account to book directly.',
  'rst.h.err.quoteFreeze': 'The price could not be fixed. Please try again.',
  'rst.h.err.stripe': 'The payment could not be started. Please try again.',
  'rst.h.err.forbidden': 'Access denied. Please sign in and complete two-factor authentication if required.',
  'rst.h.err.checkoutOffline': 'Connection failed. Please try again.',
  'rst.h.err.checkoutGeneric': 'Booking failed. Please try again.'
});

    function t(key, params) { return TCi18n.t(key, params); }
    function R() { return (window.TC && window.TC.catalog) ? window.TC.catalog : null; }

    /* Deutsche Kontext-Bezeichnungen fuer den VORAUSGEFUELLTEN Anmerkungstext.
       Dieser Text wird mitgesendet und von unserem Tarif-Team gelesen — er
       bleibt deshalb deutsch, unabhaengig von der Anzeigesprache. */
    var KONTEXT_DE = {
      source: { sla_abo: "Abo-Modelle", pricing: "Pricing", landing: "Landing", enterprise: "Enterprise" },
      intent: { upgrade: "Upgrade auf individuellen Tarif", request: "Individuellen Tarif anfragen" },
      planIndividuell: "Individueller Tarif",
      quelle: "Quelle", interesse: "Interesse", aktuellerPlan: "Aktueller Plan", ziel: "Ziel"
    };

    /* ── Catalog-State (gefuellt im init aus /api/public/catalog) ─── */
    var ADDONS = [];                  // Aktive Add-ons (interval=monthly|onetime)
    var BASE_PRICE = 2499;            // EUR Sockel (Default-Fallback)
    var SEAT_INCLUDED = 50;
    var SEAT_PRICE = 29;
    var selectedAddons = {};
    var ownedAddons = {};   // bereits gebuchte Add-on-Keys (Entitlements) -> ausgegraut, nicht doppelt buchbar
    var catalogReady = false;
    var catalogError = null;
    var lastEstimate = { monthly: BASE_PRICE, onetime: 0 };

    /**
     * Mappt einen Catalog-Addon-Eintrag (Cents) auf das interne Render-Format
     * (EUR + unit-Label). `id` muss dem `key` entsprechen, damit der bestehende
     * Submit-Payload (`addons:[{id,name,price,type}]`) kompatibel bleibt.
     */
    function mapCatalogAddon(a) {
      if (!a) return null;
      var priceEur = (typeof a.price_cents === "number" && isFinite(a.price_cents))
        ? Math.round(a.price_cents / 100) : 0;
      var unit = (a.interval === "onetime") ? t('rst.h.addons.unitOnce') : t('rst.h.addons.unitMonthly');
      return {
        id: a.key,
        name: a.name,
        desc: a.description || "",
        price: priceEur,
        unit: unit,
        type: (a.interval === "onetime") ? "onetime" : "monthly",
        soon: a.coming_soon === true
      };
    }

    function applyCatalog(cat) {
      if (!cat) { catalogError = catalogError || new Error("NO_CATALOG"); return; }
      var addons = Array.isArray(cat.addons) ? cat.addons : [];
      ADDONS = addons.map(mapCatalogAddon).filter(Boolean);
      var baseline = cat.individuell_baseline || null;
      if (baseline) {
        if (typeof baseline.base_monthly_cents === "number") BASE_PRICE = Math.round(baseline.base_monthly_cents / 100);
        if (typeof baseline.seats_included === "number") SEAT_INCLUDED = baseline.seats_included;
        if (typeof baseline.extra_seat_cents_per_month === "number") SEAT_PRICE = Math.round(baseline.extra_seat_cents_per_month / 100);
      }
      catalogReady = true;
    }

    /* ── Render Add-on Grid ──────────────────────────── */
    function renderAddons() {
      var grid = document.getElementById("addonGrid");
      if (!grid) return;
      grid.innerHTML = "";
      if (!catalogReady) {
        if (catalogError) {
          grid.innerHTML = '<div class="addon-empty" style="padding:var(--ds-space-4);color:var(--ds-text-secondary);font-size:13px">' + esc(t('rst.h.addons.error')) + ' <button type="button" class="ds-btn ds-btn--sm" style="margin-left:8px" onclick="location.reload()">' + esc(t('rst.h.addons.retry')) + '</button></div>';
        } else {
          grid.innerHTML = '<div class="addon-empty" style="padding:var(--ds-space-4);color:var(--ds-text-secondary);font-size:13px">' + esc(t('rst.h.addons.loading')) + '</div>';
        }
        return;
      }
      if (!ADDONS.length) {
        grid.innerHTML = '<div class="addon-empty" style="padding:var(--ds-space-4);color:var(--ds-text-secondary);font-size:13px">' + esc(t('rst.h.addons.empty')) + '</div>';
        return;
      }
      ADDONS.forEach(function(a) {
        var item = document.createElement("label");
        item.className = "addon-item";
        item.setAttribute("data-addon", a.id);

        var owned = ownedAddons[a.id] === true;
        if (owned) item.classList.add("addon-item--owned");

        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.disabled = a.soon === true || owned;   // bereits gebucht -> nicht erneut buchbar
        // Bereits getroffene Auswahl ueberlebt ein erneutes Rendern (Katalog
        // nachgeladen, Sprache gewechselt) — sonst waere der Haken weg, die
        // Auswahl im Zustand aber noch da.
        cb.checked = owned || selectedAddons[a.id] === true;
        if (cb.checked && !owned) item.classList.add("selected");
        cb.onchange = function() { if (!owned) toggleAddon(a.id, cb.checked); };

        var info = document.createElement("div");
        info.className = "addon-info";
        var soonHtml = a.soon ? " <span class='soon-tag'>" + esc(t('rst.h.addons.soon')) + "</span>" : "";
        var ownedHtml = owned ? " <span class='owned-tag'>" + esc(t('rst.h.addons.owned')) + "</span>" : "";
        info.innerHTML = "<div class='addon-name'>" + esc(a.name) + soonHtml + ownedHtml + "</div><div class='addon-desc'>" + esc(a.desc) + "</div>";

        var price = document.createElement("div");
        price.className = "addon-price";
        price.innerHTML = a.price + " EUR<span>" + esc(a.unit) + "</span>";

        item.appendChild(cb);
        item.appendChild(info);
        item.appendChild(price);
        grid.appendChild(item);
      });
    }

    function applyBaselineToDom() {
      // Baseline-Texte ("Basispaket / 50 Nutzer / 29 EUR") auf der rechten
      // Invoice-Seite synchron halten. HTML hat statische Strings,
      // die wir hier mit Catalog-Daten ueberschreiben (idempotent).
      var renderer = R();
      var fmt = renderer ? renderer.fmtCents : null;
      var baseLine = document.querySelector(".invoice-line.base .amount");
      if (baseLine && fmt) {
        var fmtBase = fmt(BASE_PRICE * 100);
        if (fmtBase) baseLine.textContent = fmtBase;
      }
      var hint = document.querySelector(".invoice-line.base + div");
      if (hint) hint.textContent = t('rst.h.inv.baseHint', { n: SEAT_INCLUDED });
    }

    /** Knopfbeschriftung mitsamt Marker setzen (Ruhe- und Wartezustand). */
    function setBtnLabel(btn, key, busy) {
      if (!btn) return;
      btn.setAttribute("data-i18n", key);
      btn.textContent = t(key);
      btn.disabled = !!busy;
    }

    function toggleAddon(id, checked) {
      if (checked) {
        selectedAddons[id] = true;
      } else {
        delete selectedAddons[id];
      }
      // Visual state
      var item = document.querySelector('.addon-item[data-addon="' + id + '"]');
      if (item) { item.classList.toggle("selected", checked); }
      window.recalc();
    }

    /* ── Recalculate Invoice ───────────────────────── */
    window.recalc = function recalc() {
      var monthly = BASE_PRICE;
      var onetime = 0;
      var addonHtml = "";

      // Add-ons
      ADDONS.forEach(function(a) {
        if (!selectedAddons[a.id]) return;
        if (a.type === "monthly") {
          monthly += a.price;
          addonHtml += "<div class='invoice-line addon'><span class='label'>" + esc(a.name) + "</span><span class='amount'>" + a.price + " EUR</span></div>";
        } else {
          onetime += a.price;
        }
      });
      document.getElementById("invoiceAddons").innerHTML = addonHtml;

      // Seats
      var seats = parseInt(document.getElementById("seatCount").value) || 50;
      if (seats < 1) seats = 1;
      var extraSeats = Math.max(0, seats - SEAT_INCLUDED);
      var seatCost = extraSeats * SEAT_PRICE;
      monthly += seatCost;

      var seatLabel = document.getElementById("seatCostLabel");
      var seatLine = document.getElementById("invoiceSeatLine");
      if (extraSeats > 0) {
        seatLabel.textContent = t('rst.h.seats.surcharge', { betrag: seatCost });
        seatLine.style.display = "flex";
        document.getElementById("invoiceSeatQty").textContent = extraSeats + " x " + SEAT_PRICE + " EUR";
        document.getElementById("invoiceSeatAmount").textContent = seatCost + " EUR";
      } else {
        seatLabel.textContent = t('rst.h.seats.included');
        seatLine.style.display = "none";
      }

      // Totals
      document.getElementById("invoiceMonthly").textContent = fmtPrice(monthly) + " EUR";

      var einmaligRow = document.getElementById("invoiceEinmaligRow");
      if (onetime > 0) {
        einmaligRow.style.display = "flex";
        document.getElementById("invoiceEinmalig").textContent = fmtPrice(onetime) + " EUR";
      } else {
        einmaligRow.style.display = "none";
      }

      lastEstimate.monthly = monthly;
      lastEstimate.onetime = onetime;
    };

    /* ── Submit ───────────────────────────────────────────── */
    window.submitRequest = function() {
      var company = document.getElementById("fCompany").value.trim();
      var contact = document.getElementById("fContact").value.trim();
      var email   = document.getElementById("fEmail").value.trim();
      var contactRole = document.getElementById("fContactRole") ? document.getElementById("fContactRole").value.trim() : "";

      if (!company || !contact || !email) {
        alert(t('rst.h.err.required'));
        return;
      }

      var errEl = document.getElementById("submitError");
      if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }

      var btn = document.getElementById("btnSubmit");
      // Auch die Wartebeschriftung traegt ihren Marker, damit ein Sprachwechsel
      // waehrend des Absendens den Knopf nicht zurueckstellt.
      setBtnLabel(btn, 'rst.h.submit.sending', true);

      // Konfiguration einsammeln
      var seats = parseInt(document.getElementById("seatCount").value) || 50;
      if (seats < 1) seats = 1;
      var addons = [];
      ADDONS.forEach(function(a) {
        if (selectedAddons[a.id]) addons.push({ id: a.id, name: a.name, price: a.price, type: a.type });
      });

      var payload = {
        // Plan-Wunsch (Server normalisiert ENTERPRISE -> INDIVIDUELL).
        plan: "INDIVIDUELL",
        base_price: BASE_PRICE,
        addons: addons,
        seats: seats,
        seats_included: SEAT_INCLUDED,
        extra_seat_price: SEAT_PRICE,
        monthly_estimate: lastEstimate.monthly,
        onetime_estimate: lastEstimate.onetime,
        company: company,
        contact: contact,
        email: email,
        phone: document.getElementById("fPhone").value.trim(),
        street: document.getElementById("fStreet").value.trim(),
        city: document.getElementById("fCity").value.trim(),
        vat_id: document.getElementById("fVat").value.trim(),
        expected_start: document.getElementById("fStart").value,
        notes: document.getElementById("fNotes").value.trim(),

        // Optionaler Kooperations-Block (kein Vertragsabschluss).
        strategic_collaboration_interest: document.getElementById("fStrategicCollabInterest")
          ? document.getElementById("fStrategicCollabInterest").checked === true
          : false,
        strategic_collaboration_message: document.getElementById("fStrategicCollabMessage")
          ? (document.getElementById("fStrategicCollabMessage").value.trim() || null)
          : null,
        strategic_collaboration_site_count: document.getElementById("fStrategicCollabSiteCount")
          ? (document.getElementById("fStrategicCollabSiteCount").value
              ? Number(document.getElementById("fStrategicCollabSiteCount").value)
              : null)
          : null,
        strategic_collaboration_region_scope: document.getElementById("fStrategicCollabRegionScope")
          ? (document.getElementById("fStrategicCollabRegionScope").value.trim() || null)
          : null
      };
      // Technische Anforderungen (SSO/MFA/API/Compliance) in Notes zusammenfuehren
      var techReqs = [];
      if (document.getElementById("fReqSso") && document.getElementById("fReqSso").checked) techReqs.push("SSO/SAML");
      if (document.getElementById("fReqMfa") && document.getElementById("fReqMfa").checked) techReqs.push("MFA-Pflicht");
      if (document.getElementById("fReqApi") && document.getElementById("fReqApi").checked) techReqs.push("REST-API/Integration");
      if (document.getElementById("fReqCompliance") && document.getElementById("fReqCompliance").checked) techReqs.push("Compliance/Audit");
      if (techReqs.length) {
        var techNote = "Technische Anforderungen: " + techReqs.join(", ");
        payload.notes = techNote + (payload.notes ? " \u00b7 " + payload.notes : "");
      }

      if (contactRole) {
        var note = payload.notes || "";
        if (note.indexOf("Kontaktrolle:") === -1) {
          payload.notes = ("Kontaktrolle: " + contactRole + (note ? " \u00b7 " + note : "")).trim();
        }
      }

      function showError(msg) {
        if (!errEl) { alert(msg); return; }
        errEl.textContent = msg;
        errEl.style.display = "block";
      }

      function describeError(httpStatus, payloadData) {
        if (!payloadData) {
          if (httpStatus === 0) return t('rst.h.err.offline');
          if (httpStatus >= 500) return t('rst.h.err.server');
          return t('rst.h.err.status', { status: httpStatus });
        }
        // Backend liefert in v1 entweder { error: "CODE", message } oder
        // { error: { code, message } }.
        var code = (payloadData.error && payloadData.error.code) || payloadData.error || null;
        var msg = (payloadData.error && payloadData.error.message) || payloadData.message || null;
        if (code === "VALIDATION") {
          var details = payloadData.details || (payloadData.error && payloadData.error.details) || [];
          if (Array.isArray(details) && details.length) {
            var first = details[0];
            var path = Array.isArray(first.path) ? first.path.join(".") : (first.path || "");
            return path ? t('rst.h.err.validationPath', { pfad: path }) : t('rst.h.err.validation');
          }
          return t('rst.h.err.validation');
        }
        if (code === "RATE_LIMITED") return t('rst.h.err.rateLimited');
        if (code === "DUPLICATE_OPEN_REQUEST") return t('rst.h.err.duplicate');
        if (code === "CSRF_INVALID") return t('rst.h.err.csrf');
        if (msg) return msg;
        if (typeof code === "string") return code;
        return t('rst.h.err.generic');
      }

      // Backend-Call. Public-Visitors bekommen via GET /api/csrf eine Session.
      fetch("/api/csrf", { credentials: "include" })
        .then(function(r) { return r.ok ? r.json() : {}; })
        .then(function(csrf) {
          return fetch("/api/enterprise-request", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-csrf-token": csrf.csrfToken || csrf.token || ""
            },
            body: JSON.stringify(payload),
            credentials: "include"
          }).then(function(resp) {
            return resp.json().catch(function() { return null; }).then(function(data) {
              return { status: resp.status, ok: resp.ok, data: data };
            });
          });
        })
        .then(function(result) {
          if (!result.ok) {
            showError(describeError(result.status, result.data));
            setBtnLabel(btn, 'rst.h.submit.send', false);
            return;
          }
          showSuccess(result.data && result.data.data ? result.data.data : result.data);
        })
        .catch(function(e) {
          showError(describeError(0, null));
          if (e && e.message && window.console) { window.console.warn("enterprise-request submit failed", e); }
          setBtnLabel(btn, 'rst.h.submit.send', false);
        });
    };

    function showSuccess(responseData) {
      document.getElementById("contactCard").style.display = "none";
      document.getElementById("successMsg").classList.add("visible");
      renderSuccessPreviewDocument(responseData);
      var actions = document.getElementById("successActions");
      if (actions && actions.dataset && actions.dataset.ready === "true") {
        actions.style.display = "flex";
      }
      window.scrollTo({ top: document.getElementById("successMsg").offsetTop - 80, behavior: "smooth" });
    }

    function renderSuccessPreviewDocument(responseData) {
      var success = document.getElementById("successMsg");
      if (!success) return;
      var existing = document.getElementById("successPreviewDocument");
      if (existing) existing.remove();
      var doc = responseData && (responseData.cost_preview_document || responseData.costPreviewDocument || responseData.document);
      if (!doc || !doc.id || !doc.download_url) return;
      var url = safePublicPreviewDownloadUrl(doc.download_url);
      if (!url) return;
      var block = document.createElement("div");
      block.id = "successPreviewDocument";
      block.style.marginTop = "var(--ds-space-4)";
      block.style.padding = "var(--ds-space-3)";
      block.style.border = "1px solid rgba(57,217,138,.25)";
      block.style.borderRadius = "var(--ds-radius-md)";
      block.style.background = "rgba(0,0,0,.08)";
      block.innerHTML =
        '<div style="font-size:12px;color:var(--ds-text-secondary);margin-bottom:6px">' + esc(t('rst.h.success.previewIntro')) + '</div>' +
        '<div style="font-size:13px;margin-bottom:8px"><strong>' + esc(t('rst.h.success.previewDocId')) + '</strong> <code>' + esc(doc.id) + '</code>' +
          (doc.document_number ? ' <span style="color:var(--ds-text-secondary)">(' + esc(doc.document_number) + ')</span>' : '') +
        '</div>' +
        '<a class="ds-btn ds-btn--primary" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(t('rst.h.success.previewDownload')) + '</a>' +
        '<div style="font-size:11px;color:var(--ds-text-tertiary);margin-top:8px">' + esc(t('rst.h.success.previewNote')) + '</div>';
      var actions = document.getElementById("successActions");
      if (actions && actions.parentNode === success) {
        success.insertBefore(block, actions);
      } else {
        success.appendChild(block);
      }
    }

    function safePublicPreviewDownloadUrl(value) {
      var v = String(value || "").trim();
      if (!v) return "";
      if (v.startsWith("//") || v.startsWith("http://") || v.startsWith("https://")) return "";
      if (!/^\/api\/subscription-documents\/[^/]+\/public-download$/.test(v)) return "";
      return v;
    }

    /* ── Print ────────────────────────────────────────────── */
    window.printInvoice = function() { window.print(); };

    window.toggleStrategicCollabBlock = function toggleStrategicCollabBlock() {
      var cb = document.getElementById("fStrategicCollabInterest");
      var msg = document.getElementById("fStrategicCollabMessage");
      var sites = document.getElementById("fStrategicCollabSiteCount");
      var scope = document.getElementById("fStrategicCollabRegionScope");
      if (!cb || !msg || !sites || !scope) return;
      var enabled = cb.checked === true;
      msg.disabled = !enabled;
      sites.disabled = !enabled;
      scope.disabled = !enabled;
    };
    /* ── Prefill Contact Fields ─────────────────────────── */
    function safeTrim(v) { return String(v || "").trim(); }
    function firstNonEmpty() {
      for (var i = 0; i < arguments.length; i++) {
        var v = safeTrim(arguments[i]);
        if (v) return v;
      }
      return "";
    }
    function setIfEmpty(id, value) {
      var el = document.getElementById(id);
      if (!el) return;
      if (safeTrim(el.value)) return;
      var v = safeTrim(value);
      if (!v) return;
      el.value = v;
    }
    function formatCity(postalCode, city) {
      var p = safeTrim(postalCode);
      var c = safeTrim(city);
      if (p && c) return p + " " + c;
      return p || c || "";
    }
    function unwrapProfileResponse(payload) {
      if (!payload) return null;
      return payload.data || payload;
    }
    function pickPrimaryContact(contacts) {
      if (!Array.isArray(contacts) || !contacts.length) return null;
      for (var i = 0; i < contacts.length; i++) {
        if (contacts[i] && contacts[i].is_primary) return contacts[i];
      }
      return contacts[0] || null;
    }
    function isBillingContact(contact) {
      if (!contact) return false;
      var role = safeTrim(contact.role_title).toLowerCase();
      var email = safeTrim(contact.email).toLowerCase();
      var keywords = ["billing", "rechnung", "finance", "buchhaltung", "accounting", "invoice"];
      for (var i = 0; i < keywords.length; i++) {
        if (role.indexOf(keywords[i]) >= 0) return true;
      }
      return email.indexOf("billing") >= 0 || email.indexOf("rechnung") >= 0 || email.indexOf("invoice") >= 0;
    }
    function pickBillingContact(contacts) {
      if (!Array.isArray(contacts) || !contacts.length) return null;
      for (var i = 0; i < contacts.length; i++) {
        if (contacts[i] && isBillingContact(contacts[i])) return contacts[i];
      }
      return null;
    }
    function fetchJson(path) {
      return fetch(path, { credentials: "include" })
        .then(function(r) { return r.ok ? r.json() : null; })
        .catch(function() { return null; });
    }
    function prefillContactFields() {
      return fetchJson("/api/me").then(function(me) {
        var orgFetch = (me && me.org_id) ? fetchJson("/api/organizations/" + encodeURIComponent(me.org_id)) : Promise.resolve(null);
        return Promise.all([Promise.resolve(me || {}), fetchJson("/api/company-profile"), orgFetch]);
      }).then(function(results) {
          var me = results[0] || {};
          var profilePayload = unwrapProfileResponse(results[1]) || {};
          var org = results[2] || {};
          var profile = profilePayload.profile || {};
          var user = profilePayload.user || {};
          var contacts = profilePayload.contacts || [];
          var billingContact = pickBillingContact(contacts) || {};
          var primaryContact = pickPrimaryContact(contacts) || {};
          var roleMap = {
            owner: "Owner",
            admin: "Admin",
            finance: "Finance",
            program_manager: "Programm-Manager",
            hiring_manager: "Hiring Manager",
            supplier_manager: "Supplier Manager",
            member: "Mitglied",
            viewer: "Viewer",
            supplier_user: "Lieferant",
            recruiter: "Recruiter",
            dispatcher: "Dispatcher",
            platform_admin: "Platform Admin"
          };
          var roleTitle = firstNonEmpty(
            billingContact.role_title,
            primaryContact.role_title,
            roleMap[String(me.org_role || "").toLowerCase()] || ""
          );

          var companyName = firstNonEmpty(
            org.legal_name,
            org.name,
            profile.legal_name,
            me.org_name,
            user.company_name,
            me.company_name
          );
          var contactName = firstNonEmpty(
            billingContact.name,
            org.billing_contact,
            primaryContact.name,
            me.contact_person,
            user.contact_person
          );
          var email = firstNonEmpty(
            org.billing_email,
            billingContact.email,
            primaryContact.email,
            profile.contact_email,
            me.email,
            user.email
          );
          var phone = firstNonEmpty(
            billingContact.phone,
            primaryContact.phone,
            profile.contact_phone,
            me.phone,
            user.phone
          );
          var street = firstNonEmpty(
            me.street,
            user.street
          );
          var cityLine = formatCity(
            firstNonEmpty(me.postal_code, user.postal_code),
            firstNonEmpty(me.city, user.city)
          );
          var vatId = firstNonEmpty(
            me.vat_id,
            user.vat_id
          );

          setIfEmpty("fCompany", companyName);
          setIfEmpty("fContact", contactName);
          setIfEmpty("fEmail", email);
          setIfEmpty("fContactRole", roleTitle);
          setIfEmpty("fPhone", phone);
          setIfEmpty("fStreet", street);
          setIfEmpty("fCity", cityLine);
          setIfEmpty("fVat", vatId);
          return { me: me, org: org, profile: profile, contacts: contacts };
        });
    }
    /* ── Context / Prefill from URL ─────────────────────── */
    function normalizePlanKey(plan) {
      var p = String(plan || "").toUpperCase();
      if (p === "FREE") p = "DEMO";
      if (p === "ENTERPRISE" || p === "INDIVIDUAL") p = "INDIVIDUELL";
      return p || "";
    }
    function getPlanLabel(plan) {
      var key = normalizePlanKey(plan);
      if (!key) return "";
      if (key === "INDIVIDUELL") return t('rst.h.ctx.planIndividuell');
      return key;
    }
    function getSourceLabel(source) {
      var s = String(source || "").toLowerCase();
      var map = {
        sla_abo: t('rst.h.ctx.srcSlaAbo'),
        pricing: "Pricing",
        landing: "Landing",
        enterprise: "Enterprise"
      };
      return map[s] || (s ? s : "");
    }
    function getIntentLabel(intent) {
      var i = String(intent || "").toLowerCase();
      if (!i) return "";
      if (i === "upgrade") return t('rst.h.ctx.intentUpgrade');
      if (i === "request") return t('rst.h.ctx.intentRequest');
      return i;
    }
    function parseContextParams() {
      var params = new URLSearchParams(window.location.search || "");
      var source = params.get("source") || params.get("context") || "";
      var plan = normalizePlanKey(params.get("plan") || "");
      var currentPlan = normalizePlanKey(params.get("current_plan") || params.get("currentPlan") || "");
      var intent = params.get("intent") || "";
      var returnTo = params.get("return_to") || "";
      if (!returnTo && source === "sla_abo") returnTo = "/public/sla_abo.html";
      return {
        source: source,
        sourceLabel: getSourceLabel(source),
        plan: plan,
        planLabel: getPlanLabel(plan),
        currentPlan: currentPlan,
        currentPlanLabel: getPlanLabel(currentPlan),
        intent: intent,
        intentLabel: getIntentLabel(intent),
        returnTo: returnTo
      };
    }
    function safeReturnPath(value) {
      var v = String(value || "").trim();
      if (!v) return "";
      if (v.startsWith("//") || v.startsWith("http://") || v.startsWith("https://")) return "";
      if (!v.startsWith("/")) return "";
      return v;
    }
    function applyContextBanner(ctx) {
      var banner = document.getElementById("contextBanner");
      if (!banner) return;
      if (!ctx || (!ctx.source && !ctx.plan && !ctx.currentPlan)) return;
      banner.style.display = "block";
      var textEl = document.getElementById("contextBannerText");
      if (textEl) {
        if (ctx.source === "sla_abo") {
          textEl.textContent = t('rst.h.ctx.fromAbo');
        } else {
          textEl.textContent = t('rst.h.ctx.default');
        }
      }
      var meta = [];
      if (ctx.sourceLabel) meta.push(t('rst.h.ctx.source') + ": " + ctx.sourceLabel);
      if (ctx.currentPlanLabel) meta.push(t('rst.h.ctx.currentPlan') + ": " + ctx.currentPlanLabel);
      if (ctx.planLabel) meta.push(t('rst.h.ctx.interest') + ": " + ctx.planLabel);
      if (ctx.intentLabel) meta.push(t('rst.h.ctx.goal') + ": " + ctx.intentLabel);
      var metaEl = document.getElementById("contextBannerMeta");
      if (metaEl) metaEl.textContent = meta.join(" • ");
    }
    function applyContextPrefill(ctx) {
      if (!ctx) return;
      var notes = document.getElementById("fNotes");
      if (!notes) return;
      if (safeTrim(notes.value)) return;
      // Dieser Text wird MITGESENDET (Anmerkungsfeld) und von unserem Tarif-Team
      // gelesen — er bleibt deshalb deutsch, auch wenn die Oberflaeche auf
      // Englisch steht. Deshalb KONTEXT_DE statt der uebersetzten Label.
      function planDe(key) { return key === "INDIVIDUELL" ? KONTEXT_DE.planIndividuell : (key || ""); }
      var srcDe = KONTEXT_DE.source[String(ctx.source || "").toLowerCase()] || ctx.source || "";
      var intentDe = KONTEXT_DE.intent[String(ctx.intent || "").toLowerCase()] || ctx.intent || "";
      var parts = [];
      if (srcDe) parts.push(KONTEXT_DE.quelle + ": " + srcDe);
      if (planDe(ctx.plan)) parts.push(KONTEXT_DE.interesse + ": " + planDe(ctx.plan));
      if (planDe(ctx.currentPlan)) parts.push(KONTEXT_DE.aktuellerPlan + ": " + planDe(ctx.currentPlan));
      if (intentDe) parts.push(KONTEXT_DE.ziel + ": " + intentDe);
      if (parts.length) notes.value = parts.join(" · ");
    }

    /** Kontext-Beschriftungen nach einem Sprachwechsel neu aufloesen. */
    function refreshContextLabels(ctx) {
      if (!ctx) return;
      ctx.sourceLabel = getSourceLabel(ctx.source);
      ctx.planLabel = getPlanLabel(ctx.plan);
      ctx.currentPlanLabel = getPlanLabel(ctx.currentPlan);
      ctx.intentLabel = getIntentLabel(ctx.intent);
    }
    function prepareSuccessReturn(ctx) {
      var actions = document.getElementById("successActions");
      var link = document.getElementById("successReturnLink");
      if (!actions || !link || !ctx) return;
      var safePath = safeReturnPath(ctx.returnTo);
      if (!safePath) return;
      link.setAttribute("href", safePath);
      actions.dataset.ready = "true";
    }

    /* ── Helpers ──────────────────────────────────────────── */
    function esc(s) { return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
    function fmtPrice(n) { return n.toLocaleString(TCi18n.dateLocale()); }

    /* ── Self-Service Direktbuchung (Phase 2, Slice E) ──────────
       Eingeloggte Org-Nutzer mit aktivem Stripe buchen den individuellen
       Tarif direkt. Der Preis wird IMMER server-seitig gerechnet
       (POST /api/payment/checkout/individuell) — ein Client-Preis wird ignoriert.
       Der Server entscheidet den Folgepfad:
         mode:"stripe"  → Redirect zur Stripe-Checkout-Session
         mode:"inquiry" → freigabepflichtig/kein Stripe → Anfrage wurde erstellt
         ok:false       → ungueltige Auswahl (Zero-State, kein Geldfluss)
       Anonyme Besucher sehen weiter ausschliesslich die klassische Anfrage. */
    var paymentConfig = null;

    function loadPaymentConfig() { return fetchJson("/api/payment/config"); }

    function isLoggedInWithOrg(me) {
      if (!me) return false;
      var orgId = me.org_id || me.orgId || null;
      var hasIdentity = me.id || me.user_id || me.userId || me.email;
      return !!(orgId && hasIdentity);
    }

    function applySelfServiceMode(me, cfg) {
      var cta = document.getElementById("selfServiceCta");
      var anfrageSection = document.getElementById("anfrageSubmitSection");
      if (!cta) return;
      var stripeReady = !!(cfg && cfg.stripe_enabled === true && cfg.mode !== "demo");
      var eligible = stripeReady && isLoggedInWithOrg(me);
      if (eligible) {
        cta.classList.add("visible");
        if (anfrageSection) anfrageSection.style.display = "none";
      } else {
        cta.classList.remove("visible");
        if (anfrageSection) anfrageSection.style.display = "";
      }
    }

    function showSelfServiceError(msg) {
      var el = document.getElementById("selfServiceError");
      if (!el) { alert(msg); return; }
      el.textContent = msg;
      el.style.display = "block";
    }

    function resetSelfServiceButton() {
      var btn = document.getElementById("btnSelfServiceCheckout");
      setBtnLabel(btn, 'rst.h.ss.book', false);
    }

    function describeQuoteErrors(errors) {
      if (!Array.isArray(errors) || !errors.length) return t('rst.h.err.selection');
      var codes = {
        INVALID_SEATS: t('rst.h.err.invalidSeats'),
        UNKNOWN_ADDON: t('rst.h.err.unknownAddon'),
        ADDON_INACTIVE: t('rst.h.err.addonInactive'),
        ADDON_COMING_SOON: t('rst.h.err.addonSoon'),
        ADDON_NOT_FOR_PLAN: t('rst.h.err.addonNotForPlan')
      };
      var first = errors[0] || {};
      return codes[first.code] || t('rst.h.err.selection');
    }

    function describeCheckoutError(httpStatus, data) {
      var code = data && data.error ? (data.error.code || data.error) : null;
      if (code === "ORG_REQUIRED") return t('rst.h.err.orgRequired');
      if (code === "QUOTE_FREEZE_FAILED") return t('rst.h.err.quoteFreeze');
      if (code === "STRIPE_ERROR") return t('rst.h.err.stripe');
      if (code === "CSRF_INVALID") return t('rst.h.err.csrf');
      if (httpStatus === 401 || httpStatus === 403) return t('rst.h.err.forbidden');
      if (httpStatus === 0) return t('rst.h.err.checkoutOffline');
      if (httpStatus >= 500) return t('rst.h.err.server');
      if (data && data.message) return data.message;
      return t('rst.h.err.checkoutGeneric');
    }

    window.submitSelfServiceCheckout = function() {
      var company = document.getElementById("fCompany").value.trim();
      var contact = document.getElementById("fContact").value.trim();
      var email   = document.getElementById("fEmail").value.trim();
      if (!company || !contact || !email) {
        showSelfServiceError(t('rst.h.err.required'));
        return;
      }
      var errEl = document.getElementById("selfServiceError");
      if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }
      var btn = document.getElementById("btnSelfServiceCheckout");
      setBtnLabel(btn, 'rst.h.ss.preparing', true);

      var seats = parseInt(document.getElementById("seatCount").value, 10) || 50;
      if (seats < 1) seats = 1;
      var addonKeys = [];
      ADDONS.forEach(function(a) { if (selectedAddons[a.id]) addonKeys.push(a.id); });

      var payload = {
        // Server rechnet den Preis aus seats + addons neu (never trust client price).
        seats: seats,
        employee_count: seats,
        addons: addonKeys,
        company_name: company,
        contact_name: contact,
        contact_email: email
      };

      fetch("/api/csrf", { credentials: "include" })
        .then(function(r) { return r.ok ? r.json() : {}; })
        .then(function(csrf) {
          return fetch("/api/payment/checkout/individuell", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-csrf-token": csrf.csrfToken || csrf.token || ""
            },
            body: JSON.stringify(payload),
            credentials: "include"
          });
        })
        .then(function(resp) {
          return resp.json().catch(function() { return null; }).then(function(data) {
            return { status: resp.status, ok: resp.ok, data: data || {} };
          });
        })
        .then(function(result) {
          var data = result.data || {};
          if (result.ok && data.ok && data.mode === "stripe" && data.redirect_url) {
            setBtnLabel(btn, 'rst.h.ss.redirect', true);
            window.location.href = data.redirect_url;
            return;
          }
          if (result.ok && data.ok && data.mode === "inquiry") {
            // Server hat die Auswahl als freigabepflichtig eingestuft → Anfrage erstellt.
            showSuccess(data);
            return;
          }
          if (result.ok && data.ok === false) {
            showSelfServiceError(describeQuoteErrors(data.errors));
            resetSelfServiceButton();
            return;
          }
          showSelfServiceError(describeCheckoutError(result.status, data));
          resetSelfServiceButton();
        })
        .catch(function(e) {
          showSelfServiceError(describeCheckoutError(0, null));
          if (e && e.message && window.console) { window.console.warn("individuell checkout failed", e); }
          resetSelfServiceButton();
        });
    };

    /* ── Init ─────────────────────────────────────── */
    function loadCatalogSafe() {
      if (!R()) {
        catalogError = new Error("catalogRenderer fehlt (TC.catalog)");
        return Promise.resolve(null);
      }
      return R().load().then(function (cat) {
        applyCatalog(cat);
        return cat;
      }).catch(function (err) {
        catalogError = err;
        return null;
      });
    }

    /* Bereits gebuchte Add-ons der Org laden (Entitlements). 401/Fehler -> leer
       (Neukunde sieht alle Add-ons buchbar). Verhindert Doppelbuchung beim Erweitern. */
    function loadOwnedAddons() {
      return fetch("/api/me/entitlements", { credentials: "include", headers: { Accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          ownedAddons = {};
          var list = data && Array.isArray(data.active_addons) ? data.active_addons : [];
          list.forEach(function (aa) {
            var key = aa && (aa.key || aa.addon_key || aa.id);
            if (key) ownedAddons[String(key)] = true;
          });
        })
        .catch(function () { /* still: keine Org-Session -> alle Add-ons buchbar */ });
    }

    // Erste Render-Phase mit Defaults (Sockel/Seats), damit das Skelett da ist.
    renderAddons();
    window.toggleStrategicCollabBlock();
    var requestContext = parseContextParams();
    applyContextBanner(requestContext);
    prepareSuccessReturn(requestContext);

    // Catalog + bereits gebuchte Add-ons laden, dann erneut rendern + recalc.
    Promise.all([loadCatalogSafe(), loadOwnedAddons()]).then(function () {
      applyBaselineToDom();
      renderAddons();
      window.recalc();
    });

    // Sprachwechsel: Add-on-Liste, Kostenvorschau und Kontext-Banner entstehen
    // zur Laufzeit — sie werden aus dem bereits geladenen Katalog neu gezeichnet,
    // ohne erneuten Netz-Abruf. Die Einheiten (/Monat, einmalig) haengen an der
    // Sprache und werden dabei ueber mapCatalogAddon neu gesetzt.
    // Gleiche Ueberlegung wie bei der i18n-Bruecke oben: die Datei laeuft auch
    // in einer vm-Sandbox mit minimalem DOM. Fehlt der Ereignis-Bus, entfaellt
    // nur das Nachzeichnen beim Sprachwechsel — der Rest arbeitet normal weiter.
    if (typeof document.addEventListener === "function") {
      document.addEventListener("tc:langchange", function () {
        ADDONS = ADDONS.map(function (a) {
          a.unit = (a.type === "onetime") ? t('rst.h.addons.unitOnce') : t('rst.h.addons.unitMonthly');
          return a;
        });
        applyBaselineToDom();
        renderAddons();
        window.recalc();
        refreshContextLabels(requestContext);
        applyContextBanner(requestContext);
      });
    }

    Promise.all([
      loadPaymentConfig(),
      prefillContactFields().catch(function() { return null; })
    ]).then(function(res) {
      paymentConfig = res[0] || null;
      var result = res[1];
      var me = result && result.me ? result.me : null;
      if (me && !requestContext.currentPlan) {
        var fallbackPlan = normalizePlanKey(me.plan || "");
        if (fallbackPlan) {
          requestContext.currentPlan = fallbackPlan;
          requestContext.currentPlanLabel = getPlanLabel(fallbackPlan);
        }
      }
      applyContextBanner(requestContext);
      applyContextPrefill(requestContext);
      // Self-Service-CTA nur fuer eingeloggte Org-Nutzer bei aktivem Stripe.
      applySelfServiceMode(me, paymentConfig);
    });
  })();
