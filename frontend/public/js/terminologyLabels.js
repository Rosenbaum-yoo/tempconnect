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
    capacityList:       { company: "Verfügbares Personal",    agency: "Verfügbares Personal" },
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
