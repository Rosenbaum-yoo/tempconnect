/**
 * pricing.js — Renderer fuer die oeffentliche Tarifseite.
 *
 * Ab Welle 8 Schritt 13 nutzt diese Datei NUR noch den Shared-Renderer
 * `TC.catalog` aus `frontend/public/js/catalogRenderer.js`. Plan-Karten,
 * Tier-Karten, Feature-Vergleichstabelle und Disclaimer werden zentral
 * gerendert; pricing.js kuemmert sich um Page-spezifische CTAs und Empty-
 * /Error-States.
 *
 * Datenquelle: `GET /api/public/catalog` aus Welle 8 Schritt 2
 * (`api/config/planCatalog.js` ist die Single Source of Truth fuer Tarife,
 * Tiers, Features und Add-ons).
 *
 * CTAs:
 *   - Standardtarif (BASIS/PLUS/PRO) -> selectPlan -> TC.authIntent.navigateForPlan
 *   - INDIVIDUELL-Plan / Tier S/M/L/Enterprise -> selectIndividuellTier
 *   - Pilot anfragen -> requestPilot -> /public/enterprise_anfrage.html?intent=pilot
 *
 * Empty/Error: Wenn /api/public/catalog nicht erreichbar ist, rendern wir
 * eine sichtbare Fehler-Karte mit Reload-Knopf statt einer leeren Seite.
 */

/* ── Woerterbuch (P6.1, DE/EN) ─────────────────────────────────────────────
   pricing.html laedt i18n.js im head; dieses Modul laeuft ausschliesslich auf
   pricing.html, TCi18n ist hier also garantiert vorhanden. Namensraum: pr.a.*

   Bewusst NICHT uebersetzt:
   - Katalog-Daten aus /api/public/catalog (Plan-Namen, Feature-Namen, Preise):
     das sind Serverwerte, die der Shared-Renderer ausgibt.
   - Plan-Schluessel (DEMO, BASIS, PLUS, PRO, INDIVIDUELL) — technische Enums.
   - alles aus pageShell.js (Topbar, Navigation, Nutzerbereich) und footer.js
   - der hidden LEGACY-Block sowie der noscript-Fallback in pricing.html       */
TCi18n.register('de', {
  'pr.a.docTitle': 'Tarife für Zeitarbeitssteuerung – TempConnect',

  'pr.a.hero.eyebrow': 'Tarife & Preise',
  'pr.a.hero.title': 'Tarife für Einsatzunternehmen mit wiederkehrenden Zeitarbeitsbedarfen',
  'pr.a.hero.sub': 'TempConnect ist buyer-first: Arbeitsplatzangebote, Lieferantensteuerung, Preisrahmen, Einsaetze und Stundenzettel laufen in einer Plattform. Personaldienstleister arbeiten auf derselben Plattform als Ausbau-ICP und Supply-Seite mit.',
  'pr.a.aud.primary': 'Primärer ICP: Einsatzunternehmen',
  'pr.a.aud.secondary': 'Ausbau-ICP: Personaldienstleister',

  'pr.a.pilot.eyebrow': 'Pilot-ready',
  'pr.a.pilot.title': 'Voller Pilot-Mindeststandard ab PLUS, Steuerungsschicht im individuellen Tarif',
  'pr.a.pilot.text': 'BASIS validiert erste Arbeitsplatzangebote und Deals. PLUS deckt den Kern fuer die ersten echten Pilotkunden ab: Arbeitsplatzangebot, Deal, Einsatz und digitale Zeiten. Der individuelle Tarif erweitert diese Basis um Lieferantensteuerung, Governance und Rollout-Tiefe.',
  'pr.a.tag.fromBasis': 'ab BASIS',
  'pr.a.tag.fromPlus': 'ab PLUS',
  'pr.a.tag.individuell': 'Individueller Tarif',
  'pr.a.tag.individuellUpper': 'INDIVIDUELLER TARIF',
  'pr.a.pilot.i1.title': 'Arbeitsplatzangebot & Deal',
  'pr.a.pilot.i1.desc': 'Erste Arbeitsplatzangebote, Marktreaktionen und digitale Deals fuer kleinere Volumina.',
  'pr.a.pilot.i2.title': 'Zeiten & Freigaben',
  'pr.a.pilot.i2.desc': 'Digitale Stundenzettel, Freigaben und Folgeprozesse fuer echte Pilotabwicklung.',
  'pr.a.pilot.i3.title': 'Demo-Reife',
  'pr.a.pilot.i3.desc': 'Buyer-first Kernstory, Notdienst-Signale und klare CTA fuer den Sales-Funnel.',
  'pr.a.pilot.i4.title': 'Steuerung & Rollout',
  'pr.a.pilot.i4.desc': 'Vendor Pool, Preisrahmen, Freigabe-Workflows, Audit und Multi-Team-Steuerung.',

  'pr.a.vp1.title': 'Arbeitsplatzangebote & Lieferantensteuerung',
  'pr.a.vp1.desc': 'Wiederkehrende Arbeitsplatzangebote platzieren, Preferred Vendors priorisieren und Reaktionen transparent steuern — statt Mail, Excel und Nachtelefonieren.',
  'pr.a.vp2.title': 'Digitale Stundenzettel',
  'pr.a.vp2.desc': 'Vorbefuellt, digital unterschrieben, per Klick genehmigt. ArbZG-konform mit automatischer Pausenvalidierung.',
  'pr.a.vp3.title': 'Preisrahmen & Kostenkontrolle',
  'pr.a.vp3.desc': 'Genehmigte Stunden, Ziel- und Max-Saetze sowie Ausgaben bleiben in einem operativen Steuerungsbild verbunden.',
  'pr.a.vp4.title': 'Notdienst fuer kritische Arbeitsplatzangebote',
  'pr.a.vp4.desc': '30 Minuten statt 3 Stunden. Kritische Ausfaelle werden mit priorisiertem Matching und automatischer Eskalation abgefedert.',
  'pr.a.vp5.title': 'Lieferantenbewertung',
  'pr.a.vp5.desc': 'Tier-System, Performance-Dashboard und Coverage-Analyse machen Ihre besten Lieferanten sichtbar und steuerbar.',
  'pr.a.vp6.title': 'Spend & Marktpreise',
  'pr.a.vp6.desc': 'Was kostet ein Schweisser in Berlin? Datenbasierte Preisspannen und Spend-Sicht statt Bauchgefühl und Preisdrift.',

  'pr.a.trust.gdpr': 'DSGVO-konform',
  'pr.a.trust.hosting': 'Hosting in Deutschland',
  'pr.a.trust.monthly': 'Monatlich kuendbar',
  'pr.a.trust.lockin': 'Kein Lock-in',

  'pr.a.path.title': 'Pilotpfad für Einsatzunternehmen',
  'pr.a.path.t1': 'Kein eigener Sondertarif, kein CTA-Chaos: Der Standard-Pilot fuer den primären ICP läuft über',
  'pr.a.path.t2': '. Größere Organisationen mit mehreren Standorten, Lieferanten oder Freigabe-Workflows gehen direkt in den',
  'pr.a.path.strong': 'individuellen Tarif',
  'pr.a.path.t3': '. BASIS bleibt der Einstieg für kleinere Volumina, PRO ist ein Ausbaupfad — nicht die erste Verkaufsgeschichte.',
  'pr.a.path.ctaPlus': 'PLUS als Pilot starten',
  'pr.a.path.ctaIndividuell': 'Individuellen Tarif anfragen',
  'pr.a.path.note': 'PLUS = Standard-Pilot, individueller Tarif = Direct-/Enterprise-Pfad',
  'pr.a.path.b1': 'DEMO prueft die Story, PLUS prueft den echten operativen Pilotkern',
  'pr.a.path.b2': 'Individueller Tarif erst bei Multi-Standort-, Governance- oder Lieferantensteuerungs-Tiefe',
  'pr.a.path.b3': 'BASIS bleibt für kleinere Volumina, PRO für Skalierung zwischen PLUS und Enterprise',
  'pr.a.path.b4': 'Keine parallelen Pilotgeschichten neben dem buyer-first Kernpfad',

  'pr.a.cmp.eyebrow': 'Vergleich',
  'pr.a.cmp.title': 'Alle Features im Detail',
  'pr.a.cmp.desc': 'Detaillierter Vergleich aller Funktionen nach Tarif. Primärer Einsatz: Einsatzunternehmen ab PLUS und individueller Tarif; Personaldienstleister wachsen über dieselbe Plattform mit.',

  'pr.a.faq.eyebrow': 'Haeufige Fragen',
  'pr.a.faq.title': 'FAQ zu Tarifen & Abrechnung',
  'pr.a.faq.q1': 'Wie funktioniert das Matching?',
  'pr.a.faq.a1': 'TempConnect bewertet verfuegbare Dienstleister anhand von 13 Faktoren: Rolle, Skills, Standort (GPS-genau), Verfuegbarkeit, Verifizierung, Vendor-Pool-Tier, Compliance, Stundensatz, Dringlichkeit, Personal, Reputation, Preferred-First-Status und Smart Ranking. Jeder Faktor ist transparent — Sie sehen genau, warum ein Dienstleister passt. Kein Blackbox.',
  'pr.a.faq.q2': 'Was beinhalten die digitalen Stundenzettel?',
  'pr.a.faq.a2': 'Stundenzettel werden automatisch aus dem Einsatz vorbefuellt (Rolle, Schicht, Arbeitszeit). Mitarbeiter unterschreiben digital, Sie genehmigen per Klick oder als Batch. Die Plattform prueft automatisch die Einhaltung von ArbZG §4 (Pausenregelung bei >6h / >9h). Genehmigte Stundenzettel koennen direkt zur Rechnung werden.',
  'pr.a.faq.q3': 'Was ist der Notdienst-Modus?',
  'pr.a.faq.a3': 'Emergency Staffing fuer dringende Personalbedarfe. 5 Stufen (Normal bis Notdienst) mit automatischer SLA-Ueberwachung. Bei Notdienst: 30-Minuten-SLA, sofortiges Matching, erzwungene E-Mail-Benachrichtigung an alle passenden Dienstleister, automatische Eskalation nach 10/20 Minuten bei Nicht-Reaktion.',
  'pr.a.faq.q4': 'Kann ich jederzeit upgraden oder downgraden?',
  'pr.a.faq.a4': 'Ja. Sie koennen Ihren Tarif jederzeit aendern. Ein Upgrade wird sofort wirksam. Bei einem Downgrade behalten Sie bis zum Ende der aktuellen Abrechnungsperiode Zugriff auf alle Funktionen Ihres bisherigen Tarifs.',
  'pr.a.faq.q5': 'Gibt es eine Vertragslaufzeit?',
  'pr.a.faq.a5': 'Nein. Alle Tarife sind monatlich kuendbar. Es gibt keine Mindestlaufzeit und keinen Lock-in.',
  'pr.a.faq.q6': 'Welche Zahlungsmethoden werden akzeptiert?',
  'pr.a.faq.a6': 'Wir unterstuetzen Kreditkarte, SEPA-Lastschrift, Sofortueberweisung und Giropay ueber unseren Zahlungspartner Stripe. Alle Zahlungen werden sicher und verschluesselt abgewickelt.',
  'pr.a.faq.q7': 'Was passiert mit meinen Daten bei Kuendigung?',
  'pr.a.faq.a7': 'Bei einer Kuendigung bleiben Ihr Konto und Ihre Daten erhalten. Sie verlieren lediglich den Zugang zu den erweiterten Funktionen Ihres bisherigen Tarifs. Deals und abgeschlossene Vorgaenge bleiben dokumentiert. Sie koennen jederzeit einen neuen Demo-Zugang anfordern.',
  'pr.a.faq.q8': 'Was bedeutet Pulse-Timer?',
  'pr.a.faq.a8': 'Der Pulse-Timer gibt die Zeitspanne an, innerhalb derer die Plattform einen dokumentierten Matching-Versuch fuer Ihre Anfrage unternimmt. Dies ist ein Prozessnachweis – kein Vermittlungsversprechen. PLUS-Kunden erhalten 120 Minuten, PRO-Kunden 60 Minuten, Kunden mit individuellem Tarif 30 Minuten.',
  'pr.a.faq.q9': 'Wie funktioniert der individuelle Tarif?',
  'pr.a.faq.a9a': 'Der individuelle Tarif wird auf Ihre Anforderungen zugeschnitten. Ueber unseren',
  'pr.a.faq.a9link': 'Konfigurator fuer individuelle Tarife',
  'pr.a.faq.a9b': 'koennen Sie Zusatzmodule auswaehlen und eine Live-Kostenvorschau einsehen. Unser Team erstellt Ihnen daraufhin ein verbindliches Angebot.',
  'pr.a.faq.q10': 'Erhalte ich eine Rechnung?',
  'pr.a.faq.a10': 'Ja. Sie erhalten eine ordnungsgemaesse Rechnung fuer jeden Abrechnungszeitraum. Rechnungen sind in Ihrem Konto unter Zahlungshistorie einsehbar und koennen als PDF heruntergeladen werden.',

  'pr.a.cta.title': 'Bereit fuer professionelle Personalkoordination?',
  'pr.a.cta.sub': 'Starten Sie kostenlos und entdecken Sie, wie TempConnect Ihre Zeitarbeitskoordination vereinfacht.',
  'pr.a.cta.pilot': 'Pilot anfragen',
  'pr.a.cta.individuell': 'Individuell anfragen',
  'pr.a.cta.sales': 'Vertrieb kontaktieren',

  'pr.a.js.loadingPlans': 'Lade Tarife…',
  'pr.a.js.loadingCompare': 'Lade Featurevergleich…',
  'pr.a.js.errorTitle': 'Tarife konnten nicht geladen werden.',
  'pr.a.js.errorUnknown': 'Unbekannter Fehler',
  'pr.a.js.retry': 'Erneut versuchen',
  'pr.a.js.emptyPlans': 'Keine Tarife verfügbar.',
  'pr.a.js.emptyCompare': 'Keine Vergleichsdaten verfügbar.',
  'pr.a.js.ctaDemo': 'Demo starten',
  'pr.a.js.ctaConfigure': 'Individuellen Tarif konfigurieren',
  'pr.a.js.ctaChoosePlan': 'Plan wählen',
  'pr.a.js.tierTitle': 'Individueller Tarif — Größenklassen',
  'pr.a.js.tierIntro': 'Der individuelle Tarif richtet sich nach Ihrer Beschaeftigtenzahl. Die Einstufung erfolgt automatisch bei der Registrierung. Enterprise gilt ab 351 Beschaeftigten oder bei Sonderbedarf (z.B. Multi-Mandanten, eigene SLA).'
});

TCi18n.register('en', {
  'pr.a.docTitle': 'Plans for temporary staffing control – TempConnect',

  'pr.a.hero.eyebrow': 'Plans & pricing',
  'pr.a.hero.title': 'Plans for client companies with recurring temporary staffing needs',
  'pr.a.hero.sub': 'TempConnect is buyer-first: job postings, supplier management, rate cards, assignments and timesheets all run on one platform. Staffing providers work on the same platform as an expansion ICP and supply side.',
  'pr.a.aud.primary': 'Primary ICP: client companies',
  'pr.a.aud.secondary': 'Expansion ICP: staffing providers',

  'pr.a.pilot.eyebrow': 'Pilot-ready',
  'pr.a.pilot.title': 'Full pilot minimum standard from PLUS, control layer in the individual plan',
  'pr.a.pilot.text': 'BASIS validates your first job postings and deals. PLUS covers the core for the first real pilot customers: job posting, deal, assignment and digital time recording. The individual plan extends that base with supplier management, governance and rollout depth.',
  'pr.a.tag.fromBasis': 'from BASIS',
  'pr.a.tag.fromPlus': 'from PLUS',
  'pr.a.tag.individuell': 'Individual plan',
  'pr.a.tag.individuellUpper': 'INDIVIDUAL PLAN',
  'pr.a.pilot.i1.title': 'Job posting & deal',
  'pr.a.pilot.i1.desc': 'First job postings, market responses and digital deals for smaller volumes.',
  'pr.a.pilot.i2.title': 'Time recording & approvals',
  'pr.a.pilot.i2.desc': 'Digital timesheets, approvals and follow-up processes for real pilot operations.',
  'pr.a.pilot.i3.title': 'Demo readiness',
  'pr.a.pilot.i3.desc': 'Buyer-first core story, emergency signals and a clear CTA for the sales funnel.',
  'pr.a.pilot.i4.title': 'Control & rollout',
  'pr.a.pilot.i4.desc': 'Vendor pool, rate cards, approval workflows, audit and multi-team control.',

  'pr.a.vp1.title': 'Job postings & supplier management',
  'pr.a.vp1.desc': 'Place recurring job postings, prioritise preferred vendors and steer responses transparently — instead of email, spreadsheets and chasing calls.',
  'pr.a.vp2.title': 'Digital timesheets',
  'pr.a.vp2.desc': 'Pre-filled, signed digitally, approved with one click. ArbZG-compliant with automatic break validation.',
  'pr.a.vp3.title': 'Rate cards & cost control',
  'pr.a.vp3.desc': 'Approved hours, target and maximum rates as well as spend stay connected in one operational control view.',
  'pr.a.vp4.title': 'Emergency service for critical job postings',
  'pr.a.vp4.desc': '30 minutes instead of 3 hours. Critical shortfalls are cushioned with prioritised matching and automatic escalation.',
  'pr.a.vp5.title': 'Supplier scorecard',
  'pr.a.vp5.desc': 'A tier system, performance dashboard and coverage analysis make your best suppliers visible and manageable.',
  'pr.a.vp6.title': 'Spend & market rates',
  'pr.a.vp6.desc': 'What does a welder cost in Berlin? Data-based rate ranges and a spend view instead of gut feeling and rate drift.',

  'pr.a.trust.gdpr': 'GDPR-compliant',
  'pr.a.trust.hosting': 'Hosted in Germany',
  'pr.a.trust.monthly': 'Cancel monthly',
  'pr.a.trust.lockin': 'No lock-in',

  'pr.a.path.title': 'Pilot path for client companies',
  'pr.a.path.t1': 'No separate special plan, no CTA chaos: the standard pilot for the primary ICP runs on',
  'pr.a.path.t2': '. Larger organisations with several sites, suppliers or approval workflows go straight into the',
  'pr.a.path.strong': 'individual plan',
  'pr.a.path.t3': '. BASIS remains the entry point for smaller volumes, PRO is a growth path — not the first sales story.',
  'pr.a.path.ctaPlus': 'Start PLUS as pilot',
  'pr.a.path.ctaIndividuell': 'Request individual plan',
  'pr.a.path.note': 'PLUS = standard pilot, individual plan = direct/enterprise path',
  'pr.a.path.b1': 'DEMO validates the story, PLUS validates the real operational pilot core',
  'pr.a.path.b2': 'Individual plan only for multi-site, governance or supplier-management depth',
  'pr.a.path.b3': 'BASIS stays for smaller volumes, PRO for scaling between PLUS and Enterprise',
  'pr.a.path.b4': 'No parallel pilot narratives alongside the buyer-first core path',

  'pr.a.cmp.eyebrow': 'Comparison',
  'pr.a.cmp.title': 'All features in detail',
  'pr.a.cmp.desc': 'Detailed comparison of every function by plan. Primary use: client companies from PLUS and the individual plan; staffing providers grow on the same platform.',

  'pr.a.faq.eyebrow': 'Frequently asked questions',
  'pr.a.faq.title': 'FAQ on plans & billing',
  'pr.a.faq.q1': 'How does matching work?',
  'pr.a.faq.a1': 'TempConnect rates available providers on 13 factors: role, skills, location (GPS-precise), availability, verification, vendor pool tier, compliance, hourly rate, urgency, staff, reputation, preferred-first status and smart ranking. Every factor is transparent — you see exactly why a provider fits. No black box.',
  'pr.a.faq.q2': 'What do the digital timesheets include?',
  'pr.a.faq.a2': 'Timesheets are pre-filled automatically from the assignment (role, shift, working time). Staff sign digitally, you approve with one click or as a batch. The platform automatically checks compliance with ArbZG §4 (break rules above 6h / 9h). Approved timesheets can be turned into an invoice directly.',
  'pr.a.faq.q3': 'What is emergency mode?',
  'pr.a.faq.a3': 'Emergency staffing for urgent personnel needs. 5 levels (normal through emergency) with automatic SLA monitoring. In emergency mode: 30-minute SLA, immediate matching, enforced email notification to all matching providers, automatic escalation after 10/20 minutes without a response.',
  'pr.a.faq.q4': 'Can I upgrade or downgrade at any time?',
  'pr.a.faq.a4': 'Yes. You can change your plan at any time. An upgrade takes effect immediately. On a downgrade you keep access to all functions of your previous plan until the end of the current billing period.',
  'pr.a.faq.q5': 'Is there a minimum contract term?',
  'pr.a.faq.a5': 'No. All plans can be cancelled monthly. There is no minimum term and no lock-in.',
  'pr.a.faq.q6': 'Which payment methods are accepted?',
  'pr.a.faq.a6': 'We support credit card, SEPA direct debit, Sofort and Giropay through our payment partner Stripe. All payments are processed securely and encrypted.',
  'pr.a.faq.q7': 'What happens to my data if I cancel?',
  'pr.a.faq.a7': 'If you cancel, your account and your data are retained. You only lose access to the advanced functions of your previous plan. Deals and completed transactions remain documented. You can request a new demo access at any time.',
  'pr.a.faq.q8': 'What does the pulse timer mean?',
  'pr.a.faq.a8': 'The pulse timer states the period within which the platform makes a documented matching attempt for your request. This is proof of process – not a placement guarantee. PLUS customers get 120 minutes, PRO customers 60 minutes, individual-plan customers 30 minutes.',
  'pr.a.faq.q9': 'How does the individual plan work?',
  'pr.a.faq.a9a': 'The individual plan is tailored to your requirements. Using our',
  'pr.a.faq.a9link': 'configurator for individual plans',
  'pr.a.faq.a9b': 'you can select add-on modules and see a live cost preview. Our team then prepares a binding quote for you.',
  'pr.a.faq.q10': 'Do I receive an invoice?',
  'pr.a.faq.a10': 'Yes. You receive a proper invoice for every billing period. Invoices are available in your account under payment history and can be downloaded as PDF.',

  'pr.a.cta.title': 'Ready for professional staffing coordination?',
  'pr.a.cta.sub': 'Start for free and discover how TempConnect simplifies your temporary staffing coordination.',
  'pr.a.cta.pilot': 'Request pilot',
  'pr.a.cta.individuell': 'Request individual plan',
  'pr.a.cta.sales': 'Contact sales',

  'pr.a.js.loadingPlans': 'Loading plans…',
  'pr.a.js.loadingCompare': 'Loading feature comparison…',
  'pr.a.js.errorTitle': 'Plans could not be loaded.',
  'pr.a.js.errorUnknown': 'Unknown error',
  'pr.a.js.retry': 'Try again',
  'pr.a.js.emptyPlans': 'No plans available.',
  'pr.a.js.emptyCompare': 'No comparison data available.',
  'pr.a.js.ctaDemo': 'Start demo',
  'pr.a.js.ctaConfigure': 'Configure individual plan',
  'pr.a.js.ctaChoosePlan': 'Choose plan',
  'pr.a.js.tierTitle': 'Individual plan — size tiers',
  'pr.a.js.tierIntro': 'The individual plan follows your headcount. Classification happens automatically at registration. Enterprise applies from 351 employees or for special requirements (e.g. multi-tenant setups, a dedicated SLA).'
});

(function () {
  "use strict";

  function tcCatalog() { return (window.TC && window.TC.catalog) ? window.TC.catalog : null; }

  var state = { catalog: null, isLoggedIn: false };

  function esc(s) { return tcCatalog() ? tcCatalog().esc(s) : String(s == null ? "" : s); }
  function t(key, params) { return TCi18n.t(key, params); }

  function init() {
    // Login-Check (best-effort) - erlaubt CTA-Variation bei eingeloggtem Nutzer
    try {
      fetch("/api/me", { credentials: "include" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (me) { state.isLoggedIn = !!(me && me.id); })
        .catch(function () { /* silent */ });
    } catch (e) { /* silent */ }

    var R = tcCatalog();
    if (!R) {
      showError(new Error("catalogRenderer fehlt (TC.catalog)"));
      return;
    }

    showLoading();
    R.load()
      .then(function (cat) {
        state.catalog = cat;
        renderAll();
      })
      .catch(showError);
  }

  function renderAll() {
    renderPlans();
    renderTiers();
    renderComparison();
    renderDisclaimer();
  }

  function showLoading() {
    var p = document.getElementById("pricingPlanGrid");
    if (p) p.innerHTML = '<div class="pricing-loading">' + esc(t('pr.a.js.loadingPlans')) + '</div>';
  }

  function showError(err) {
    var p = document.getElementById("pricingPlanGrid");
    if (!p) return;
    var msg = err && err.message ? err.message : t('pr.a.js.errorUnknown');
    p.innerHTML =
      '<div class="pricing-error">' +
        '<div class="pricing-error__title">' + esc(t('pr.a.js.errorTitle')) + '</div>' +
        '<div class="pricing-error__sub">' + esc(msg) + '</div>' +
        '<button type="button" class="ds-btn" onclick="location.reload()">' + esc(t('pr.a.js.retry')) + '</button>' +
      '</div>';
    var tier = document.getElementById("pricingTierGrid");
    if (tier) tier.innerHTML = "";
    var c = document.getElementById("pricingComparisonBody");
    if (c) c.innerHTML = "";
  }

  /* ── Plan-Karten — jetzt ueber TC.catalog ist Single Source of Truth ── */

  function buildPricingPlanCta(plan) {
    // Page-spezifische CTAs (selectPlan / selectIndividuellTier).
    if (plan.key === "DEMO") {
      return { html: '<a href="/demo.html" class="ds-btn ds-w-full">' + esc(t('pr.a.js.ctaDemo')) + '</a>' };
    }
    if (plan.key === "INDIVIDUELL") {
      return {
        html: '<button type="button" class="ds-btn ds-btn--primary ds-w-full" onclick="selectIndividuellTier(\'\')">' +
          esc(t('pr.a.js.ctaConfigure')) + '</button>'
      };
    }
    return { onclick: "selectPlan('" + plan.key + "')", label: t('pr.a.js.ctaChoosePlan'), primary: plan.key === "PLUS" };
  }

  function renderPlans() {
    var R = tcCatalog();
    var host = document.getElementById("pricingPlanGrid");
    if (!host || !R) return;
    var plans = (state.catalog && state.catalog.plans) || [];
    if (!plans.length) {
      host.innerHTML = '<div class="pricing-empty">' + esc(t('pr.a.js.emptyPlans')) + '</div>';
      return;
    }
    host.innerHTML = plans.map(function (plan) {
      return R.renderPlanCard(plan, {
        highlights: R.planHighlights(state.catalog, plan.key, 6),
        cta: buildPricingPlanCta(plan)
      });
    }).join("");
  }

  /* ── Tier-Grid (S/M/L/Enterprise) ────────────────────── */

  function renderTiers() {
    var R = tcCatalog();
    var host = document.getElementById("pricingTierGrid");
    if (!host || !R) return;
    var tiers = (state.catalog && state.catalog.individual_tiers) || [];
    var baseline = (state.catalog && state.catalog.individuell_baseline) || null;
    if (!tiers.length) { host.innerHTML = ""; return; }
    host.innerHTML =
      '<div style="font-size:16px;font-weight:800;margin-bottom:var(--ds-space-3);color:var(--ds-accent)">' +
        esc(t('pr.a.js.tierTitle')) + '</div>' +
      '<p style="font-size:13px;color:var(--ds-text-secondary);margin-bottom:var(--ds-space-4);line-height:1.6">' +
        esc(t('pr.a.js.tierIntro')) +
      '</p>' +
      '<div class="pricing-tier-grid">' +
        tiers.map(function (tier) { return R.renderTierCard(tier, baseline); }).join("") +
      '</div>';
  }

  /* ── Vergleichstabelle — Shared-Renderer ─────────────── */

  function renderComparison() {
    var R = tcCatalog();
    var head = document.getElementById("pricingComparisonHead");
    var body = document.getElementById("pricingComparisonBody");
    if (!head || !body || !R) return;
    var plans = ((state.catalog && state.catalog.plans) || []).slice().sort(function (a, b) { return a.sort_order - b.sort_order; });
    var features = (state.catalog && state.catalog.features) || [];
    if (!plans.length || !features.length) {
      head.innerHTML = "";
      body.innerHTML = '<tr><td colspan="6" class="pricing-empty">' + esc(t('pr.a.js.emptyCompare')) + '</td></tr>';
      return;
    }
    head.innerHTML = R.renderComparisonHead(plans);
    body.innerHTML = R.renderComparisonBody(plans, features);
  }

  /* ── Disclaimer ─────────────────────────────────── */

  function renderDisclaimer() {
    var R = tcCatalog();
    var d = document.getElementById("pricingDisclaimer");
    if (!d || !R) return;
    d.innerHTML = R.renderDisclaimer(state.catalog);
  }

  /* Sprachwechsel: die per innerHTML gebauten Flaechen (Plan-Karten, Tier-Grid,
     Vergleichstabelle) traegt die deklarative Hydration nicht — nur der bereits
     geladene Katalog wird hier mit den neuen CTA-Labeln neu gerendert. */
  document.addEventListener('tc:langchange', function () {
    if (!state.catalog) return;
    renderAll();
  });

  /* ── CTA-Handler (global, weil aus inline-onclick gerufen) ─── */

  function navigateForPlan(planKey) {
    if (window.TC && window.TC.authIntent && typeof window.TC.authIntent.navigateForPlan === "function") {
      window.TC.authIntent.navigateForPlan({ plan: planKey, isLoggedIn: state.isLoggedIn });
      return;
    }
    if (state.isLoggedIn) {
      location.href = "/public/sla_abo.html?plan=" + encodeURIComponent(planKey);
    } else {
      location.href = "/?auth=register&plan=" + encodeURIComponent(planKey);
    }
  }

  window.selectPlan = function (planKey) {
    if (planKey === "INDIVIDUELL") { window.selectIndividuellTier(""); return; }
    navigateForPlan(planKey);
  };

  window.selectIndividuellTier = function (tierKey) {
    var params = new URLSearchParams();
    params.set("source", "pricing");
    params.set("plan", "INDIVIDUELL");
    params.set("intent", "request");
    if (tierKey) params.set("tier", tierKey);
    location.href = "/public/enterprise_anfrage.html?" + params.toString();
  };

  window.requestPilot = function () {
    var params = new URLSearchParams();
    params.set("source", "pricing");
    params.set("intent", "pilot");
    params.set("plan", "INDIVIDUELL");
    location.href = "/public/enterprise_anfrage.html?" + params.toString();
  };

  /* ── Bootstrap ─────────────────────────────────────────────── */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
