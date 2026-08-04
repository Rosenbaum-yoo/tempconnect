/**
 * terminologyLabels.js — Rollenabhaengige UI-Sprache
 *
 * Source of Truth: docs/product/TERMINOLOGY_GUIDE.md
 * Track C Phase 2 | 2026-05-29
 *
 * Verwendung:
 *   TC.terminology.get("marketplace", "company")   // "Personal finden"
 *   TC.terminology.get("marketplace", "agency")    // "Arbeitsplatz finden"
 *   TC.terminology.get("createDemand", "company")  // "Arbeitsplatz anbieten"
 *
 * Wichtig:
 *   - Keine DB-Felder, API-Routen oder Enums aendern — nur UI-Strings
 *   - Kein Lader / kein Fetch — synchron, keine Abhaengigkeiten
 *   - Haengt an window.TC (globaler Namespace, sicher fuer alle Pages)
 */
"use strict";

(function () {
  window.TC = window.TC || {};

  /** @type {Record<string, {company?: string, agency?: string, worker?: string, neutral?: string}>} */
  var LABELS = {
    // ─── Hauptnavigation / Seiten-H1 ─────────────────────────────────────────
    marketplace:        { company: "Personal finden",         agency: "Arbeitsplatz finden",   neutral: "Vermittlung" },
    marketplaceTitle:   { company: "Personal finden",         agency: "Arbeitsplatz finden",   neutral: "Vermittlung" },

    // ─── Bedarfe / Requisitions ───────────────────────────────────────────────
    createDemand:       { company: "Arbeitsplatz anbieten",   agency: null },
    demandList:         { company: "Arbeitsplatzangebote",    agency: "Offene Arbeitsplatzangebote" },
    demandDetail:       { company: "Arbeitsplatzangebot",     agency: "Arbeitsplatzangebot" },
    demandCreate:       { company: "Neues Arbeitsplatzangebot anlegen", agency: null },
    demandSave:         { company: "Arbeitsplatzangebot speichern",     agency: null },
    demandClose:        { company: "Arbeitsplatzangebot schließen",     agency: null },
    demandPublish:      { company: "Arbeitsplatzangebot veröffentlichen", agency: null },
    demandProfile:      { company: "Stellenprofil",           agency: "Stellenprofil" },
    openDemands:        { company: "Offene Positionen",       agency: "Offene Arbeitsplatzangebote" },
    fillingRate:        { company: "Besetzungsstand",         agency: "Besetzungsstand" },

    // ─── Kapazitäten / Personal ───────────────────────────────────────────────
    capacityCreate:     { company: null,                      agency: "Personal einstellen" },
    capacityList:       { company: "Verfügbares Personal",    agency: "Eingestelltes Personal" },
    capacitySearch:     { company: "Personal finden",         agency: "Personal finden" },
    capacityProfile:    { company: "Personalprofil",          agency: "Personalprofil" },
    capacityOffer:      { company: null,                      agency: "Personalangebot" },
    capacityOffers:     { company: "Verfügbares Personal",    agency: "Personalangebote" },

    // ─── CTAs / Buttons ───────────────────────────────────────────────────────
    findStaff:          { company: "Personal finden",         agency: null },
    findWorkplace:      { company: null,                      agency: "Arbeitsplatz finden" },
    offerWorkplace:     { company: "Arbeitsplatz anbieten",   agency: null },
    offerStaff:         { company: null,                      agency: "Mitarbeiter anbieten" },
    startFilling:       { company: "Besetzung starten",       agency: null },
    checkFilling:       { company: "Besetzung prüfen",        agency: null },

    // ─── Navigation / Breadcrumbs ─────────────────────────────────────────────
    navMarketplace:     { company: "Personal finden",         agency: "Arbeitsplatz finden",   neutral: "Vermittlung" },
    navDemands:         { company: "Arbeitsplatzangebote",    agency: "Offene Arbeitsplatzangebote" },
    navCapacity:        { company: "Verfügbares Personal",    agency: "Personal einstellen" },

    // ─── Empty States ─────────────────────────────────────────────────────────
    emptyDemands:       { company: "Sie haben noch keine Arbeitsplatzangebote erstellt.", agency: "Aktuell gibt es keine passenden Arbeitsplatzangebote." },
    emptyCapacity:      { company: "Aktuell wurde kein passendes Personal gefunden.",    agency: "Sie haben noch kein verfügbares Personal eingestellt." },
    emptyDemandsCta:    { company: "Arbeitsplatz anbieten",   agency: "Filter anpassen" },
    emptyCapacityCta:   { company: "Suchkriterien anpassen",  agency: "Personal einstellen" },

    // ─── Sonstige sichtbare Labels ────────────────────────────────────────────
    marketplaceActivity: { company: "Vermittlungsaktivität",  agency: "Vermittlungsaktivität",  neutral: "Vermittlungsaktivität" },
    staffSearch:         { company: "Personal finden",        agency: "Personal finden" },
    demandCount:         { company: "Arbeitsplatzangebote",   agency: "Arbeitsplatzangebote" },

    // ─── Worker ───────────────────────────────────────────────────────────────
    myAssignments:      { worker: "Meine Einsätze" },
    workplaceDetail:    { worker: "Arbeitsplatzdetails" },
    myAvailability:     { worker: "Meine Verfügbarkeit" },
  };

  /**
   * Englische Entsprechungen (P6). Das Label ist eine MATRIX aus Rolle UND
   * Sprache — ein Unternehmen liest "Personal finden", eine Agentur
   * "Arbeitsplatz finden", und beides braucht eine englische Fassung.
   * Deshalb steht Englisch als eigene Rollen-Tabelle daneben statt als
   * flache Uebersetzung darueber: sonst ginge eine der beiden Dimensionen
   * verloren. Fehlt ein Key oder eine Rolle hier, greift automatisch das
   * deutsche Original (ehrlicher Fallback, nie ein roher Schluessel).
   * `null` bleibt "fuer diese Rolle nicht anwendbar" — auch auf Englisch.
   */
  var LABELS_EN = {
    marketplace:        { company: "Find staff",              agency: "Find placements",       neutral: "Matching" },
    marketplaceTitle:   { company: "Find staff",              agency: "Find placements",       neutral: "Matching" },

    createDemand:       { company: "Post a job",              agency: null },
    demandList:         { company: "Job postings",            agency: "Open job postings" },
    demandDetail:       { company: "Job posting",             agency: "Job posting" },
    demandCreate:       { company: "Create a new job posting", agency: null },
    demandSave:         { company: "Save job posting",        agency: null },
    demandClose:        { company: "Close job posting",       agency: null },
    demandPublish:      { company: "Publish job posting",     agency: null },
    demandProfile:      { company: "Role profile",            agency: "Role profile" },
    openDemands:        { company: "Open positions",          agency: "Open job postings" },
    fillingRate:        { company: "Fill rate",               agency: "Fill rate" },

    capacityCreate:     { company: null,                      agency: "List staff" },
    capacityList:       { company: "Available staff",         agency: "Listed staff" },
    capacitySearch:     { company: "Find staff",              agency: "Find staff" },
    capacityProfile:    { company: "Staff profile",           agency: "Staff profile" },
    capacityOffer:      { company: null,                      agency: "Staff offer" },
    capacityOffers:     { company: "Available staff",         agency: "Staff offers" },

    findStaff:          { company: "Find staff",              agency: null },
    findWorkplace:      { company: null,                      agency: "Find placements" },
    offerWorkplace:     { company: "Post a job",              agency: null },
    offerStaff:         { company: null,                      agency: "Offer staff" },
    startFilling:       { company: "Start filling",           agency: null },
    checkFilling:       { company: "Review filling",          agency: null },

    navMarketplace:     { company: "Find staff",              agency: "Find placements",       neutral: "Matching" },
    navDemands:         { company: "Job postings",            agency: "Open job postings" },
    navCapacity:        { company: "Available staff",         agency: "List staff" },

    emptyDemands:       { company: "You have not created any job postings yet.", agency: "There are currently no matching job postings." },
    emptyCapacity:      { company: "No matching staff found at the moment.",     agency: "You have not listed any available staff yet." },
    emptyDemandsCta:    { company: "Post a job",              agency: "Adjust filters" },
    emptyCapacityCta:   { company: "Adjust search criteria",  agency: "List staff" },

    marketplaceActivity: { company: "Matching activity",      agency: "Matching activity",     neutral: "Matching activity" },
    staffSearch:         { company: "Find staff",             agency: "Find staff" },
    demandCount:         { company: "Job postings",           agency: "Job postings" },

    myAssignments:      { worker: "My assignments" },
    workplaceDetail:    { worker: "Placement details" },
    myAvailability:     { worker: "My availability" }
  };

  /**
   * Waehlt die sprachrichtige Rollen-Tabelle. Deutsche Werte fuellen Luecken
   * der englischen auf — eine fehlende Uebersetzung zeigt lieber Deutsch als
   * gar nichts. Ohne geladene i18n-Schicht bleibt alles wie bisher.
   */
  function localizedEntry(key, entry) {
    if (!window.TCi18n || window.TCi18n.locale() === "de") return entry;
    var loc = LABELS_EN[key];
    if (!loc) return entry;
    var merged = {};
    for (var k in entry) {
      if (Object.prototype.hasOwnProperty.call(entry, k)) merged[k] = entry[k];
    }
    for (var k2 in loc) {
      if (Object.prototype.hasOwnProperty.call(loc, k2)) merged[k2] = loc[k2];
    }
    return merged;
  }

  /**
   * Gibt das rollenabhaengige UI-Label fuer einen Key zurueck.
   *
   * @param {string} key       - Schluessel aus LABELS (z. B. "marketplace", "createDemand")
   * @param {string} orgType   - Rollencode: "company" | "agency" | "worker" | "staff" | "admin"
   * @param {string} [fallback] - Rueckgabe wenn kein Eintrag gefunden (default: key)
   * @returns {string}
   */
  function get(key, orgType, fallback) {
    var entry = LABELS[key];
    if (!entry) return fallback !== undefined ? fallback : key;
    entry = localizedEntry(key, entry); // P6: Sprach-Dimension, Rollen-Logik unveraendert

    var role = String(orgType || "").trim().toLowerCase();

    // Explizit null: "nicht anwendbar fuer diese Rolle" — sofort null zurueckgeben
    if (role && Object.prototype.hasOwnProperty.call(entry, role) && entry[role] === null) return null;

    // Direkte Rolle mit Wert
    if (role && entry[role] != null) return entry[role];

    // Staff/Admin: technische Begriffe OK — kein Override
    if (role === "staff" || role === "admin") return fallback !== undefined ? fallback : key;

    // Neutral-Fallback fuer rollenunabhaengige Stellen (z. B. Footer)
    if (entry.neutral != null) return entry.neutral;

    // Company als Default fuer unbekannte Rollen
    if (entry.company != null) return entry.company;

    return fallback !== undefined ? fallback : key;
  }

  /**
   * Gibt den org_type des aktuellen Nutzers zurueck (aus TC.shell.context oder me).
   * Kann aufgerufen werden sobald pageShell geladen hat.
   *
   * @returns {string|null}
   */
  function currentOrgType() {
    try {
      if (window.TC && window.TC.shell && window.TC.shell.context && window.TC.shell.context.me) {
        return String(window.TC.shell.context.me.org_type || "").trim().toLowerCase() || null;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  /**
   * Gibt alle Keys zurueck (fuer Debugging / Tests).
   * @returns {string[]}
   */
  function keys() {
    return Object.keys(LABELS);
  }

  window.TC.terminology = {
    get: get,
    currentOrgType: currentOrgType,
    keys: keys,
    _labels: LABELS // fuer Tests
  };
})();
