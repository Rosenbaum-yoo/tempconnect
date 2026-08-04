/* ═══════════════════════════════════════════════════════
   Capacity Exchange Form — Page Logic
   ═══════════════════════════════════════════════════════ */

/* ── Woerterbuch (P6.1, DE/EN) ─────────────────────────────────────────────
   Die Seite laedt i18n.js im head, dieses Modul laeuft ausschliesslich auf
   capacity_exchange_form.html — TCi18n ist hier also garantiert vorhanden.

   Rollenschicht: Personal einstellen ist eine AGENTUR-Handlung. Der Server
   erlaubt Schreibzugriffe auf /capacity-exchange/entries ausschliesslich
   Personaldienstleistern (403 AGENCY_ONLY). Deshalb tragen genau die
   rollengefaerbten Saetze einen agency-Schluessel (cap.page.agency.*,
   cap.section.agency.*, cap.toast.agency.*) — so bleibt sichtbar, wessen
   Sprache dort steht, und ein spaeterer Unternehmens-Zweig kann daneben
   entstehen statt den Bestand zu ueberschreiben.

   Bewusst NICHT uebersetzt:
   - option-value-Attribute (immediate, night, temporary, DE, public, ...):
     das sind Server-Enums; nur ihre sichtbaren Labels wechseln die Sprache.
   - Kategorie-Rohwerte (Helfer, Fachkraft, ...) wandern als value an die API,
     ebenfalls unveraendert.
   - alles aus pageShell.js (Topbar, Navigation, Sprach-Umschalter)
   - rollenabhaengige Begriffe aus terminologyLabels.js                       */
TCi18n.register('de', {
  'cap.page.agency.docTitle': 'Personal einstellen – TempConnect',
  'cap.page.agency.title': 'Personal einstellen',
  'cap.page.agency.subtitle': 'Erfassen Sie Ihr verfügbares Personal. Pflichtfelder sind mit * markiert.',
  'cap.page.agency.titleEdit': 'Personalangebot bearbeiten',
  'cap.page.subtitleEdit': 'Aendern Sie die Angaben und speichern Sie.',
  'cap.page.back': 'Zurueck zur Liste',

  'cap.paywall.home': 'Startseite',
  'cap.paywall.title': 'Bereich nicht verfuegbar',
  'cap.paywall.plan': 'Aktueller Plan:',
  'cap.paywall.cta': 'Abo ansehen',

  'cap.section.agency.offer': 'Personalangebot',
  'cap.section.timing': 'Zeitraum & Einsatzmodell',
  'cap.section.location': 'Standort & Einsatzgebiet',
  'cap.section.qualifications': 'Qualifikationen & Compliance',
  'cap.section.commercial': 'Konditionen',
  'cap.section.visibility': 'Sichtbarkeit & Steuerung',
  'cap.section.media': 'Vorschaubild (optional)',

  'cap.f.title': 'Titel',
  'cap.f.titlePh': 'z.B. 5 Lagerhelfer Raum Stuttgart',
  'cap.f.role': 'Rolle / Beruf',
  'cap.f.rolePh': 'z.B. Lagerhelfer',
  'cap.f.category': 'Kategorie',
  'cap.f.headcount': 'Anzahl Personen',
  'cap.f.skills': 'Skills (kommagetrennt)',
  'cap.f.skillsPh': 'z.B. Stapler, Kommissionierung, SAP',
  'cap.f.skillsHelp': 'Kommagetrennte Schlagworte fuer besseres Matching.',
  'cap.f.availType': 'Verfuegbarkeitstyp',
  'cap.f.from': 'Verfuegbar ab',
  'cap.f.to': 'Verfuegbar bis',
  'cap.f.toHelp': 'Leer = unbefristet',
  'cap.f.shift': 'Schichtmodell',
  'cap.f.employment': 'Einsatzart',
  'cap.f.city': 'Stadt',
  'cap.f.cityPh': 'z.B. Stuttgart',
  'cap.f.postal': 'PLZ',
  'cap.f.postalPh': 'z.B. 70173',
  'cap.f.radius': 'Einsatzradius (km)',
  'cap.f.country': 'Land',
  'cap.f.mobility': 'Mobilitaetshinweise',
  'cap.f.mobilityPh': 'z.B. Eigener PKW vorhanden, bundesweit einsetzbar',
  'cap.f.qualifications': 'Qualifikationsprofil',
  'cap.f.qualificationsPh': 'Zusammenfassung relevanter Qualifikationen und Erfahrungen',
  'cap.f.certifications': 'Zertifikate / Nachweise',
  'cap.f.certificationsPh': 'z.B. Staplerschein, Erste-Hilfe, Sicherheitsunterweisung',
  'cap.f.compliance': 'Compliance-Status',
  'cap.f.priceType': 'Preistyp',
  'cap.f.priceMin': 'Preis min (EUR)',
  'cap.f.priceMax': 'Preis max (EUR)',
  'cap.f.priceHint': 'Preishinweis',
  'cap.f.priceHintPh': 'z.B. Staffelpreise ab 10 MA moeglich',
  'cap.f.notes': 'Interne Notizen',
  'cap.f.notesPh': 'Nur fuer interne Zwecke sichtbar',
  'cap.f.visibility': 'Sichtbarkeit',
  'cap.f.priority': 'Prioritaet',
  'cap.f.validUntil': 'Gueltig bis',
  'cap.f.validUntilHelp': 'Auto-Ablauf nach diesem Datum',
  'cap.f.searchAgent': 'Such-Agent aktivieren (automatisch auf passende Anfragen matchen)',
  'cap.f.listingImage': 'Eintragsbild',

  'cap.opt.none': '– Keine Angabe –',
  'cap.cat.helper': 'Helfer',
  'cap.cat.skilled': 'Fachkraft',
  'cap.cat.specialist': 'Spezialist',
  'cap.cat.lead': 'Fuehrungskraft',
  'cap.avail.immediate': 'Sofort verfuegbar (heute oder morgen)',
  'cap.avail.scheduled': 'Geplant',
  'cap.avail.flexible': 'Flexibel',
  'cap.shift.day': 'Tagschicht',
  'cap.shift.night': 'Nachtschicht',
  'cap.shift.rotating': 'Wechselschicht',
  'cap.shift.flexible': 'Flexibel',
  'cap.shift.weekend': 'Wochenende',
  'cap.shift.onCall': 'Bereitschaft',
  'cap.emp.temporary': 'Arbeitnehmerueberlassung',
  'cap.emp.contract': 'Werkvertrag',
  'cap.emp.tempToPerm': 'Temp-to-Perm',
  'cap.emp.project': 'Projektbasis',
  'cap.emp.onCall': 'Abruf',
  'cap.country.de': 'Deutschland',
  'cap.country.at': 'Oesterreich',
  'cap.country.ch': 'Schweiz',
  'cap.compliance.unknown': 'Unbekannt',
  'cap.compliance.pending': 'In Pruefung',
  'cap.compliance.partial': 'Teilweise',
  'cap.compliance.complete': 'Vollstaendig',
  'cap.price.hourly': 'Stundensatz',
  'cap.price.daily': 'Tagessatz',
  'cap.price.fixed': 'Festpreis',
  'cap.vis.public': 'Oeffentlich',
  'cap.vis.planGated': 'Plan-beschraenkt',
  'cap.vis.vendorPool': 'Nur Vendor-Pool',
  'cap.vis.private': 'Privat',
  'cap.prio.normal': 'Normal',
  'cap.prio.elevated': 'Erhoeht',
  'cap.prio.urgent': 'Dringend',

  'cap.media.helper': 'PNG/JPG/WEBP, max. 5 MB. Wird im Feed und in der Detailansicht bevorzugt.',
  'cap.media.previewAlt': 'Vorschau Eintragsbild',
  'cap.media.remove': 'Bild entfernen',
  'cap.media.logoTitle': 'Logo-Fallback',
  'cap.media.logoHelper': 'Wenn kein Eintragsbild gesetzt wird, verwendet TempConnect automatisch das Firmenlogo aus dem bestehenden Profil. Falls dort kein Logo hinterlegt ist, wird ein neutraler Placeholder angezeigt.',

  'cap.btn.draft': 'Als Entwurf speichern',
  'cap.btn.activate': 'Speichern & aktivieren',
  'cap.btn.saveChanges': 'Aenderungen speichern',
  'cap.disclaimer': 'Hinweis: Alle Angaben dienen der Vermittlungsunterstuetzung. TempConnect garantiert keinen Vermittlungserfolg. Angaben ohne Gewaehr.',

  'cap.cov.title': 'Deckung aus Ihrer Belegschaft',
  'cap.cov.coveredOne': 'Gedeckt — {n} Kraft frei',
  'cap.cov.covered': 'Gedeckt — {n} Kraefte frei',
  'cap.cov.gap': 'Es fehlen {missing} von {required}',
  'cap.cov.periodRange': 'Zeitraum ab {von} bis {bis}',
  'cap.cov.periodOpen': 'Zeitraum ab {von} (offen)',
  'cap.cov.noneInCatalog': 'Keine Kraft in Ihrer Belegschaft fuehrt diese Faehigkeit im Katalog.',
  'cap.cov.unknownSkills': 'Kein Katalog-Eintrag fuer: {list}',
  'cap.cov.availableFrom': 'wieder ab {date}',
  'cap.cov.openEnd': 'Ende offen',
  'cap.state.frei': 'frei',
  'cap.state.verplant': 'verplant',
  'cap.state.spaeter_frei': 'erst spaeter',
  'cap.state.abwesend': 'abwesend',

  'cap.val.title': 'Titel ist erforderlich',
  'cap.val.role': 'Rolle ist erforderlich',
  'cap.val.date': 'Datum ist erforderlich',
  'cap.val.city': 'Stadt ist erforderlich',
  'cap.val.priceRange': 'Max darf nicht kleiner als Min sein',

  'cap.geo.ok': 'Standort georeferenziert ({lat}, {lng})',
  'cap.geo.fail': 'Standort konnte nicht georeferenziert werden – Umkreissuche ggf. eingeschraenkt.',

  'cap.err.imageType': 'Nur PNG, JPG oder WEBP sind erlaubt.',
  'cap.err.imageSize': 'Bild ist zu gross (max. 5 MB).',
  'cap.err.uploadFailed': 'Bild-Upload fehlgeschlagen',
  'cap.err.imageRemove': 'Bild konnte nicht entfernt werden',
  'cap.err.notFound': 'Eintrag nicht gefunden',
  'cap.err.generic': 'Fehler',
  'cap.err.savedImagePartial': 'Eintrag gespeichert, Bild konnte nicht vollstaendig verarbeitet werden',
  'cap.err.save': 'Fehler beim Speichern',
  'cap.toast.saved': 'Aenderungen gespeichert',
  'cap.toast.agency.created': 'Personal eingestellt'
});
TCi18n.register('en', {
  'cap.page.agency.docTitle': 'List staff – TempConnect',
  'cap.page.agency.title': 'List staff',
  'cap.page.agency.subtitle': 'Record the staff you have available. Required fields are marked with *.',
  'cap.page.agency.titleEdit': 'Edit staff offer',
  'cap.page.subtitleEdit': 'Change the details and save.',
  'cap.page.back': 'Back to the list',

  'cap.paywall.home': 'Home',
  'cap.paywall.title': 'Section not available',
  'cap.paywall.plan': 'Current plan:',
  'cap.paywall.cta': 'View subscription',

  'cap.section.agency.offer': 'Staff offer',
  'cap.section.timing': 'Period & engagement model',
  'cap.section.location': 'Location & service area',
  'cap.section.qualifications': 'Qualifications & compliance',
  'cap.section.commercial': 'Commercial terms',
  'cap.section.visibility': 'Visibility & control',
  'cap.section.media': 'Preview image (optional)',

  'cap.f.title': 'Title',
  'cap.f.titlePh': 'e.g. 5 warehouse assistants, Stuttgart area',
  'cap.f.role': 'Role / occupation',
  'cap.f.rolePh': 'e.g. warehouse assistant',
  'cap.f.category': 'Category',
  'cap.f.headcount': 'Number of people',
  'cap.f.skills': 'Skills (comma-separated)',
  'cap.f.skillsPh': 'e.g. forklift, order picking, SAP',
  'cap.f.skillsHelp': 'Comma-separated keywords for better matching.',
  'cap.f.availType': 'Availability type',
  'cap.f.from': 'Available from',
  'cap.f.to': 'Available until',
  'cap.f.toHelp': 'Empty = open-ended',
  'cap.f.shift': 'Shift model',
  'cap.f.employment': 'Engagement type',
  'cap.f.city': 'City',
  'cap.f.cityPh': 'e.g. Stuttgart',
  'cap.f.postal': 'Postcode',
  'cap.f.postalPh': 'e.g. 70173',
  'cap.f.radius': 'Service radius (km)',
  'cap.f.country': 'Country',
  'cap.f.mobility': 'Mobility notes',
  'cap.f.mobilityPh': 'e.g. own car available, deployable nationwide',
  'cap.f.qualifications': 'Qualification profile',
  'cap.f.qualificationsPh': 'Summary of relevant qualifications and experience',
  'cap.f.certifications': 'Certificates / proof',
  'cap.f.certificationsPh': 'e.g. forklift licence, first aid, safety briefing',
  'cap.f.compliance': 'Compliance status',
  'cap.f.priceType': 'Price type',
  'cap.f.priceMin': 'Price min (EUR)',
  'cap.f.priceMax': 'Price max (EUR)',
  'cap.f.priceHint': 'Price note',
  'cap.f.priceHintPh': 'e.g. volume pricing from 10 staff possible',
  'cap.f.notes': 'Internal notes',
  'cap.f.notesPh': 'Visible for internal purposes only',
  'cap.f.visibility': 'Visibility',
  'cap.f.priority': 'Priority',
  'cap.f.validUntil': 'Valid until',
  'cap.f.validUntilHelp': 'Automatic expiry after this date',
  'cap.f.searchAgent': 'Activate search agent (match automatically against fitting requests)',
  'cap.f.listingImage': 'Listing image',

  'cap.opt.none': '– Not specified –',
  'cap.cat.helper': 'Assistant',
  'cap.cat.skilled': 'Skilled worker',
  'cap.cat.specialist': 'Specialist',
  'cap.cat.lead': 'Manager',
  'cap.avail.immediate': 'Available immediately (today or tomorrow)',
  'cap.avail.scheduled': 'Scheduled',
  'cap.avail.flexible': 'Flexible',
  'cap.shift.day': 'Day shift',
  'cap.shift.night': 'Night shift',
  'cap.shift.rotating': 'Rotating shift',
  'cap.shift.flexible': 'Flexible',
  'cap.shift.weekend': 'Weekend',
  'cap.shift.onCall': 'Standby',
  'cap.emp.temporary': 'Temporary agency work',
  'cap.emp.contract': 'Contract for work',
  'cap.emp.tempToPerm': 'Temp-to-perm',
  'cap.emp.project': 'Project-based',
  'cap.emp.onCall': 'On call',
  'cap.country.de': 'Germany',
  'cap.country.at': 'Austria',
  'cap.country.ch': 'Switzerland',
  'cap.compliance.unknown': 'Unknown',
  'cap.compliance.pending': 'Under review',
  'cap.compliance.partial': 'Partial',
  'cap.compliance.complete': 'Complete',
  'cap.price.hourly': 'Hourly rate',
  'cap.price.daily': 'Day rate',
  'cap.price.fixed': 'Fixed price',
  'cap.vis.public': 'Public',
  'cap.vis.planGated': 'Plan-restricted',
  'cap.vis.vendorPool': 'Supplier pool only',
  'cap.vis.private': 'Private',
  'cap.prio.normal': 'Normal',
  'cap.prio.elevated': 'Elevated',
  'cap.prio.urgent': 'Urgent',

  'cap.media.helper': 'PNG/JPG/WEBP, max. 5 MB. Preferred in the feed and in the detail view.',
  'cap.media.previewAlt': 'Listing image preview',
  'cap.media.remove': 'Remove image',
  'cap.media.logoTitle': 'Logo fallback',
  'cap.media.logoHelper': 'If no listing image is set, TempConnect automatically uses the company logo from the existing profile. If no logo is stored there, a neutral placeholder is shown.',

  'cap.btn.draft': 'Save as draft',
  'cap.btn.activate': 'Save & activate',
  'cap.btn.saveChanges': 'Save changes',
  'cap.disclaimer': 'Note: all details support the matching process. TempConnect does not guarantee matching success. Information without warranty.',

  'cap.cov.title': 'Coverage from your workforce',
  'cap.cov.coveredOne': 'Covered — {n} person available',
  'cap.cov.covered': 'Covered — {n} people available',
  'cap.cov.gap': '{missing} of {required} still missing',
  'cap.cov.periodRange': 'Period from {von} to {bis}',
  'cap.cov.periodOpen': 'Period from {von} (open end)',
  'cap.cov.noneInCatalog': 'Nobody in your workforce carries this skill in the catalogue.',
  'cap.cov.unknownSkills': 'No catalogue entry for: {list}',
  'cap.cov.availableFrom': 'available again from {date}',
  'cap.cov.openEnd': 'End open',
  'cap.state.frei': 'available',
  'cap.state.verplant': 'booked',
  'cap.state.spaeter_frei': 'later only',
  'cap.state.abwesend': 'absent',

  'cap.val.title': 'Title is required',
  'cap.val.role': 'Role is required',
  'cap.val.date': 'Date is required',
  'cap.val.city': 'City is required',
  'cap.val.priceRange': 'Max must not be lower than min',

  'cap.geo.ok': 'Location geocoded ({lat}, {lng})',
  'cap.geo.fail': 'Location could not be geocoded – radius search may be limited.',

  'cap.err.imageType': 'Only PNG, JPG or WEBP are allowed.',
  'cap.err.imageSize': 'Image is too large (max. 5 MB).',
  'cap.err.uploadFailed': 'Image upload failed',
  'cap.err.imageRemove': 'Image could not be removed',
  'cap.err.notFound': 'Entry not found',
  'cap.err.generic': 'Error',
  'cap.err.savedImagePartial': 'Entry saved, image could not be processed completely',
  'cap.err.save': 'Error while saving',
  'cap.toast.saved': 'Changes saved',
  'cap.toast.agency.created': 'Staff listed'
});

  (function() {
    var API = "/api";
    var editId = new URLSearchParams(window.location.search).get("id");
    var isEdit = !!editId;
    var MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    var ALLOWED_IMAGE_MIMES = { "image/png": true, "image/jpeg": true, "image/webp": true };
    var selectedListingImageFile = null;
    var existingLogoAssetId = null;
    var shouldDeleteExistingLogo = false;

    function t(key, params) { return TCi18n.t(key, params); }

    /**
     * Text setzen, den auch ein spaeterer Sprachwechsel korrekt nachzieht.
     *  key gesetzt -> der Marker wandert mit, das naechste TCi18n.apply()
     *                 liefert dieselbe Aussage in der neuen Sprache.
     *  key null    -> der Text traegt Laufzeitwerte (z. B. Koordinaten) und
     *                 hat kein statisches Pendant; der Marker MUSS weichen,
     *                 sonst setzt apply() den Default zurueck.
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

    function apiFetch(path, opts) {
      opts = opts || {};
      var headers = { "Content-Type": "application/json" };
      if (opts.csrf) headers["X-CSRF-Token"] = opts.csrf;
      if (opts.method && opts.method !== "GET") {
        headers["Idempotency-Key"] = (crypto.randomUUID ? crypto.randomUUID() : "x-" + Math.random().toString(36).slice(2) + "-" + Date.now());
      }
      return fetch(API + path, { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: "include" });
    }

    function toAssetUrl(rawPath) {
      var p = String(rawPath || "");
      if (!p) return "";
      if (p.startsWith("http://") || p.startsWith("https://") || p.startsWith("/")) return p;
      return "/" + p;
    }
    function todayDateString() {
      var now = new Date();
      var year = now.getFullYear();
      var month = String(now.getMonth() + 1).padStart(2, "0");
      var day = String(now.getDate()).padStart(2, "0");
      return year + "-" + month + "-" + day;
    }

    function setImagePreview(fileOrUrl) {
      var img = document.getElementById("f-listing-image-preview");
      if (!img) return;
      if (!fileOrUrl) {
        img.removeAttribute("src");
        img.style.display = "none";
        return;
      }
      if (typeof fileOrUrl === "string") {
        img.src = fileOrUrl;
      } else {
        img.src = URL.createObjectURL(fileOrUrl);
      }
      img.style.display = "block";
    }

    /** Gibt einen Woerterbuch-Schluessel zurueck (nicht den fertigen Text) —
        so bleibt die Meldung bis zur Anzeige sprachneutral. */
    function validateListingImage(file) {
      if (!file) return null;
      if (!ALLOWED_IMAGE_MIMES[file.type]) {
        return "cap.err.imageType";
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return "cap.err.imageSize";
      }
      return null;
    }

    function uploadListingImage(entryId) {
      if (!selectedListingImageFile) return Promise.resolve();
      return getCsrf().then(function(c) {
        var fd = new FormData();
        fd.append("file", selectedListingImageFile);
        fd.append("asset_type", "logo");
        return fetch(API + "/offer-assets/" + entryId + "/upload", {
          method: "POST",
          headers: { "X-CSRF-Token": c.csrfToken || c.token },
          body: fd,
          credentials: "include"
        });
      }).then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error((d.error && d.error.message) || t("cap.err.uploadFailed")); });
        return r.json();
      });
    }

    function deleteExistingLogoIfNeeded() {
      if (!isEdit || !shouldDeleteExistingLogo || !existingLogoAssetId) return Promise.resolve();
      return getCsrf().then(function(c) {
        return apiFetch("/offer-assets/" + existingLogoAssetId, { method: "DELETE", csrf: c.csrfToken || c.token });
      }).then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error((d.error && d.error.message) || t("cap.err.imageRemove")); });
      });
    }

    function loadExistingMediaForEdit() {
      if (!isEdit) return;
      apiFetch("/offer-assets/" + editId).then(function(r) {
        if (!r.ok) return null;
        return r.json();
      }).then(function(resp) {
        if (!resp || !resp.data || !resp.data.logo || !resp.data.logo.file_path) return;
        existingLogoAssetId = resp.data.logo.id || null;
        setImagePreview(toAssetUrl(resp.data.logo.file_path));
      }).catch(function() {});
    }

    // Geocode helper
    function geocode(city, postal) {
      var q = postal
        ? "/geo/coordinates?postal_code=" + encodeURIComponent(postal) + "&city=" + encodeURIComponent(city)
        : "/geo/coordinates?q=" + encodeURIComponent(city);
      return fetch(API + q, { credentials: "include" }).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; });
    }

    // Populate form for edit mode
    if (isEdit) {
      setI18nText(document.getElementById("page-title"), "cap.page.agency.titleEdit");
      setI18nText(document.getElementById("page-subtitle"), "cap.page.subtitleEdit");
      apiFetch("/capacity-exchange/entries/" + editId).then(function(r) {
        if (r.status === 401) { window.location.href = "/"; return null; }
        if (!r.ok) { toast(t("cap.err.notFound"), "danger"); return null; }
        return r.json();
      }).then(function(e) {
        if (!e) return;
        var val = function(id, v) { var el = document.getElementById(id); if (el && v != null) el.value = v; };
        val("f-title", e.title);
        val("f-role", e.role);
        val("f-worker-category", e.worker_category || "");
        val("f-headcount", e.headcount || 1);
        val("f-skills", Array.isArray(e.skill_tags) ? e.skill_tags.join(", ") : "");
        val("f-availability-type", e.availability_type || "immediate");
        val("f-from", e.availability_from ? String(e.availability_from).substring(0,10) : "");
        val("f-to", e.availability_to ? String(e.availability_to).substring(0,10) : "");
        val("f-shift", e.shift_model || "");
        val("f-employment", e.employment_type || "temporary");
        val("f-city", e.location_city);
        val("f-postal", e.location_postal || "");
        val("f-radius", e.radius_km || 25);
        val("f-country", e.country || "DE");
        val("f-mobility", e.mobility_notes || "");
        val("f-qualifications", e.qualification_summary || "");
        val("f-certifications", e.certifications_summary || "");
        val("f-compliance", e.compliance_status || "unknown");
        val("f-price-type", e.price_type || "");
        val("f-price-min", e.price_min != null ? e.price_min : "");
        val("f-price-max", e.price_max != null ? e.price_max : "");
        val("f-price-hint", e.price_hint || "");
        val("f-notes", e.notes || "");
        val("f-visibility", e.visibility_status || "public");
        val("f-priority", e.priority_level || "normal");
        val("f-valid-until", e.valid_until ? String(e.valid_until).substring(0,10) : "");
        if (e.is_search_agent) document.getElementById("f-search-agent").checked = true;

        // In edit mode, adjust button labels
        setI18nText(document.getElementById("btn-draft"), "cap.btn.saveChanges");
        setI18nText(document.getElementById("btn-activate"), "cap.btn.activate");
      });
    }
    loadExistingMediaForEdit();

    // Collect form data
    function collectData() {
      var tags = document.getElementById("f-skills").value.split(",").map(function(t) { return t.trim(); }).filter(Boolean);
      return {
        title: document.getElementById("f-title").value.trim(),
        role: document.getElementById("f-role").value.trim(),
        worker_category: document.getElementById("f-worker-category").value || null,
        headcount: parseInt(document.getElementById("f-headcount").value, 10) || 1,
        skill_tags: tags,
        availability_type: document.getElementById("f-availability-type").value,
        availability_from: document.getElementById("f-from").value,
        availability_to: document.getElementById("f-to").value || null,
        shift_model: document.getElementById("f-shift").value || null,
        employment_type: document.getElementById("f-employment").value || "temporary",
        location_city: document.getElementById("f-city").value.trim(),
        location_postal: document.getElementById("f-postal").value.trim() || null,
        radius_km: parseInt(document.getElementById("f-radius").value, 10) || 25,
        country: document.getElementById("f-country").value || "DE",
        mobility_notes: document.getElementById("f-mobility").value.trim() || null,
        qualification_summary: document.getElementById("f-qualifications").value.trim() || null,
        certifications_summary: document.getElementById("f-certifications").value.trim() || null,
        compliance_status: document.getElementById("f-compliance").value || "unknown",
        price_type: document.getElementById("f-price-type").value || null,
        price_min: parseFloat(document.getElementById("f-price-min").value) || null,
        price_max: parseFloat(document.getElementById("f-price-max").value) || null,
        price_hint: document.getElementById("f-price-hint").value.trim() || null,
        notes: document.getElementById("f-notes").value.trim() || null,
        visibility_status: document.getElementById("f-visibility").value || "public",
        priority_level: document.getElementById("f-priority").value || "normal",
        valid_until: document.getElementById("f-valid-until").value || null,
        is_search_agent: document.getElementById("f-search-agent").checked
      };
    }

    /* ── Deckungsvorschau (Welle 6) ─────────────────────────────────────────
       Beantwortet waehrend des Tippens, ob die eigene Belegschaft die angebotene
       Kopfzahl im gewaehlten Zeitraum wirklich traegt. Wer sechs Kraefte einstellt
       und vier liefert, verliert den Kunden beim ersten Mal. */

    var coverageTimer = null;
    var coverageSeq = 0;
    // Letzter Stand, damit ein Sprachwechsel die per innerHTML gebaute Liste
    // neu aufbauen kann, ohne erneut das Netz zu befragen.
    var lastCoverage = null;

    function esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }

    /** Datum in der aktiven Sprache (DE: 31.12.2026, EN: 31/12/2026). */
    function datumLokal(iso) {
      if (!iso) return "";
      var teile = String(iso).slice(0, 10).split("-");
      if (teile.length !== 3) return String(iso);
      var d = new Date(Number(teile[0]), Number(teile[1]) - 1, Number(teile[2]));
      if (isNaN(d.getTime())) return teile[2] + "." + teile[1] + "." + teile[0];
      return d.toLocaleDateString(TCi18n.dateLocale());
    }

    function zustandText(zustand) {
      return t("cap.state." + zustand) || String(zustand || "");
    }

    function renderCoverage(data) {
      lastCoverage = data || null;
      var panel = document.getElementById("coverage-panel");
      var summary = document.getElementById("coverage-summary");
      var note = document.getElementById("coverage-note");
      var list = document.getElementById("coverage-list");
      if (!panel) return;

      panel.classList.remove("ce-coverage--gedeckt", "ce-coverage--luecke");

      if (!data || !data.auswertbar) {
        panel.hidden = true;
        return;
      }
      panel.hidden = false;

      var gedeckt = data.luecke === 0;
      panel.classList.add(gedeckt ? "ce-coverage--gedeckt" : "ce-coverage--luecke");
      // Nicht "N von M": sind mehr Kraefte frei als angeboten, laese sich "2 von 1" unsinnig.
      summary.textContent = gedeckt
        ? t(data.frei === 1 ? "cap.cov.coveredOne" : "cap.cov.covered", { n: data.frei })
        : t("cap.cov.gap", { missing: data.luecke, required: data.gefordert });

      var hinweise = [];
      if (data.zeitraum && data.zeitraum.von) {
        hinweise.push(data.zeitraum.bis
          ? t("cap.cov.periodRange", { von: datumLokal(data.zeitraum.von), bis: datumLokal(data.zeitraum.bis) })
          : t("cap.cov.periodOpen", { von: datumLokal(data.zeitraum.von) }));
      }
      if (!data.kandidaten.length) {
        hinweise.push(t("cap.cov.noneInCatalog"));
      }
      if (data.unbekannte_faehigkeiten && data.unbekannte_faehigkeiten.length) {
        hinweise.push(t("cap.cov.unknownSkills", { list: data.unbekannte_faehigkeiten.join(", ") }));
      }
      note.textContent = hinweise.join(" · ");

      list.innerHTML = data.kandidaten.map(function(k) {
        var zusatz = [];
        if (k.grund) zusatz.push(k.grund);
        if (k.frei_ab) zusatz.push(t("cap.cov.availableFrom", { date: datumLokal(k.frei_ab) }));
        else if (k.zustand === "verplant") zusatz.push(t("cap.cov.openEnd"));
        if (k.city) zusatz.push(k.city);
        return '<li class="ce-coverage__row">' +
          '<span class="ce-coverage__name">' + esc(k.name) +
            (k.treffer_namen && k.treffer_namen.length
              ? ' <span class="ce-coverage__meta">' + esc(k.treffer_namen.join(", ")) + '</span>'
              : '') +
          '</span>' +
          '<span class="ce-coverage__state ce-coverage__state--' + esc(k.zustand) + '">' +
            esc(zustandText(k.zustand)) +
            (zusatz.length ? ' <span class="ce-coverage__meta">' + esc(zusatz.join(" · ")) + '</span>' : '') +
          '</span>' +
        '</li>';
      }).join("");
    }

    function refreshCoverage() {
      var skills = document.getElementById("f-skills").value.trim();
      var rolle = document.getElementById("f-role").value.trim();
      // Die Rolle mitschicken: viele Disponenten tippen "Staplerfahrer" dorthin und
      // lassen das Skill-Feld leer. Ohne sie bliebe die Vorschau bei ihnen stumm.
      var begriffe = (skills + (skills && rolle ? "," : "") + rolle).trim();
      if (!begriffe) { renderCoverage(null); return; }

      var params = new URLSearchParams();
      params.set("skills", begriffe);
      params.set("headcount", String(parseInt(document.getElementById("f-headcount").value, 10) || 1));
      var von = document.getElementById("f-from").value;
      var bis = document.getElementById("f-to").value;
      if (von) params.set("from", von);
      if (bis) params.set("to", bis);

      var meine = ++coverageSeq;
      apiFetch("/capacity-exchange/offer-coverage?" + params.toString())
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
          // Eine ueberholte Antwort darf eine neuere nicht ueberschreiben.
          if (meine !== coverageSeq) return;
          renderCoverage(data);
        })
        .catch(function() { if (meine === coverageSeq) renderCoverage(null); });
    }

    function scheduleCoverage() {
      clearTimeout(coverageTimer);
      coverageTimer = setTimeout(refreshCoverage, 400);
    }

    ["f-skills", "f-role", "f-headcount", "f-from", "f-to"].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", scheduleCoverage);
        el.addEventListener("change", scheduleCoverage);
      }
    });

    /* Georeferenz-Meldung als eigene Funktion: nur so kann der Sprachwechsel
       auch die Variante MIT Koordinaten neu formulieren — sie traegt Laufzeit-
       werte und ist deshalb fuer die deklarative Hydration unerreichbar. */
    var lastGeo = null;
    function renderGeoStatus(state) {
      lastGeo = state || null;
      var geoEl = document.getElementById("geo-status");
      if (!geoEl) return;
      if (!lastGeo) { geoEl.style.display = "none"; return; }
      if (lastGeo.ok) {
        setI18nText(geoEl, null, t("cap.geo.ok", { lat: lastGeo.lat, lng: lastGeo.lng }));
        geoEl.className = "ds-alert ds-alert--success";
      } else {
        setI18nText(geoEl, "cap.geo.fail");
        geoEl.className = "ds-alert ds-alert--warning";
      }
      geoEl.style.display = "flex";
    }

    /* Sprachwechsel: was per innerHTML/Laufzeitwerten entstanden ist, traegt die
       deklarative Hydration nicht — Deckungsvorschau und Geo-Meldung werden
       deshalb gezielt neu aufgebaut, sonst bliebe die halbe Seite deutsch. */
    document.addEventListener("tc:langchange", function() {
      renderCoverage(lastCoverage);
      if (lastGeo) renderGeoStatus(lastGeo);
    });

    var targetStatus = "draft";
    var formDirty = false;

    // Track dirty state
    document.getElementById("ce-form").addEventListener("input", function() { formDirty = true; });
    document.getElementById("ce-form").addEventListener("change", function() { formDirty = true; });
    window.addEventListener("beforeunload", function(ev) {
      if (formDirty) { ev.preventDefault(); ev.returnValue = ""; }
    });

    // Character counters on textareas
    document.querySelectorAll("#ce-form .ds-textarea[maxlength]").forEach(function(ta) {
      var max = parseInt(ta.getAttribute("maxlength"), 10);
      var counter = document.createElement("div");
      counter.className = "ce-char-count";
      counter.textContent = "0 / " + max;
      ta.parentNode.appendChild(counter);
      ta.addEventListener("input", function() {
        var len = ta.value.length;
        counter.textContent = len + " / " + max;
        counter.className = "ce-char-count" + (len >= max ? " ce-char-count--limit" : len >= max * 0.9 ? " ce-char-count--warn" : "");
      });
    });

    // Prefill today for availability_from in create mode
    if (!isEdit) {
      var today = todayDateString();
      var fromEl = document.getElementById("f-from");
      if (!fromEl.value) fromEl.value = today;
    }
    var availabilityTypeEl = document.getElementById("f-availability-type");
    if (availabilityTypeEl) {
      availabilityTypeEl.addEventListener("change", function() {
        if (availabilityTypeEl.value === "immediate") {
          var fromEl = document.getElementById("f-from");
          if (fromEl) fromEl.value = todayDateString();
        }
      });
    }

    // Inline validation
    function validateForm() {
      var ok = true;
      document.querySelectorAll(".ds-input--error, .ds-textarea--error").forEach(function(el) {
        el.classList.remove("ds-input--error", "ds-textarea--error");
      });
      document.querySelectorAll(".ds-field-error").forEach(function(el) { el.remove(); });

      function markErr(id, key) {
        var el = document.getElementById(id);
        if (!el) return;
        el.classList.add(el.tagName === "TEXTAREA" ? "ds-textarea--error" : "ds-input--error");
        var span = document.createElement("div");
        span.className = "ds-field-error";
        // Marker mitschreiben: ein Sprachwechsel formuliert die Fehlermeldung neu.
        setI18nText(span, key);
        el.parentNode.appendChild(span);
        ok = false;
      }

      if (!document.getElementById("f-title").value.trim()) markErr("f-title", "cap.val.title");
      if (!document.getElementById("f-role").value.trim()) markErr("f-role", "cap.val.role");
      if (!document.getElementById("f-from").value) markErr("f-from", "cap.val.date");
      if (!document.getElementById("f-city").value.trim()) markErr("f-city", "cap.val.city");

      var pMin = parseFloat(document.getElementById("f-price-min").value);
      var pMax = parseFloat(document.getElementById("f-price-max").value);
      if (!isNaN(pMin) && !isNaN(pMax) && pMin > pMax) markErr("f-price-max", "cap.val.priceRange");

      if (!ok) {
        var first = document.querySelector(".ds-input--error, .ds-textarea--error");
        if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return ok;
    }

    document.getElementById("btn-draft").addEventListener("click", function() { targetStatus = "draft"; });
    document.getElementById("btn-activate").addEventListener("click", function() { targetStatus = "active"; });
    document.getElementById("f-listing-image").addEventListener("change", function(ev) {
      var file = ev.target.files && ev.target.files[0] ? ev.target.files[0] : null;
      if (!file) return;
      var validationErrorKey = validateListingImage(file);
      if (validationErrorKey) {
        selectedListingImageFile = null;
        ev.target.value = "";
        setImagePreview(null);
        toast(t(validationErrorKey), "danger");
        return;
      }
      shouldDeleteExistingLogo = false;
      selectedListingImageFile = file;
      setImagePreview(file);
    });
    document.getElementById("btn-remove-listing-image").addEventListener("click", function() {
      selectedListingImageFile = null;
      document.getElementById("f-listing-image").value = "";
      setImagePreview(null);
      if (isEdit && existingLogoAssetId) shouldDeleteExistingLogo = true;
    });

    document.getElementById("ce-form").addEventListener("submit", function(ev) {
      ev.preventDefault();
      if (!validateForm()) return;
      var data = collectData();

      var btns = document.querySelectorAll(".ce-form-actions button");
      btns.forEach(function(b) { b.disabled = true; });

      // Geocode first
      geocode(data.location_city, data.location_postal).then(function(coords) {
        if (coords && coords.lat != null && coords.lng != null) {
          data.location_lat = coords.lat;
          data.location_lng = coords.lng;
          renderGeoStatus({ ok: true, lat: coords.lat.toFixed(4), lng: coords.lng.toFixed(4) });
        } else {
          renderGeoStatus({ ok: false });
        }

        return getCsrf();
      }).then(function(csrf) {
        var token = csrf.csrfToken || csrf.token;

        if (isEdit) {
          // PATCH update
          return apiFetch("/capacity-exchange/entries/" + editId, {
            method: "PATCH", csrf: token, body: data
          }).then(function(r) {
            if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || t("cap.err.generic")); });
            return r.json();
          }).then(function(entry) {
            // If target is active and current status is draft, also activate
            if (targetStatus === "active" && entry.status === "draft") {
              return apiFetch("/capacity-exchange/entries/" + editId + "/activate", { method: "POST", csrf: token }).then(function(r2) {
                return r2.ok ? r2.json() : entry;
              });
            }
            return entry;
          });
        } else {
          // POST create
          data.status = targetStatus;
          return apiFetch("/capacity-exchange/entries", {
            method: "POST", csrf: token, body: data
          }).then(function(r) {
            if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || d.message || t("cap.err.generic")); });
            return r.json();
          });
        }
      }).then(function(entry) {
        var entryId = (entry && entry.id) ? entry.id : editId;
        return deleteExistingLogoIfNeeded().then(function() {
          return uploadListingImage(entryId);
        }).then(function() {
          return entry;
        }).catch(function(assetErr) {
          toast(assetErr.message || t("cap.err.savedImagePartial"), "warning");
          return entry;
        });
      }).then(function() {
        formDirty = false;
        toast(isEdit ? t("cap.toast.saved") : t("cap.toast.agency.created"), "success");
        setTimeout(function() {
          window.location.href = "/public/capacity_exchange_manage.html";
        }, 1200);
      }).catch(function(e) {
        toast(e.message || t("cap.err.save"), "danger");
        btns.forEach(function(b) { b.disabled = false; });
      });
    });
  })();
