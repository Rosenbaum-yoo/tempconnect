"use strict";

/**
 * enterpriseHub.js — Enterprise Hub Page Logic
 * Handles: Plan-gated card locks, CE nudges, value report, global search.
 */
(function () {
  var grid = document.getElementById("hub-grid");
  if (!grid) return;

  /* ── Helpers ──────────────────────────────────────────────────── */
  function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
  function $(id) { return document.getElementById(id); }
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
  function getSupplierGovernanceCopy(access) {
    if (!access || access.mode === "locked") {
      return {
        desc: "Lieferantenpool, Bewertung und Spend auf Erfuellung ausrichten.",
        note: "Staerkt Abschlussquote und Steuerbarkeit, bleibt aber hinter Bedarf, Deal und Zeiten nachgelagert."
      };
    }
    if (access.mode === "full") {
      return {
        desc: "Lieferantenpool, Bewertung, Preisrahmen und Spend auf Erfuellung ausrichten.",
        note: "Staerkt Abschlussquote und Steuerbarkeit; Preisrahmen greifen dort mit, wo Organisation, Tarif und Rolle dafuer freigeschaltet sind."
      };
    }
    if (access.mode === "read_only") {
      return {
        desc: "Lieferantenpool, Bewertung, Preisrahmen und Spend auf Erfuellung ausrichten.",
        note: "Preisrahmen bleiben fuer Ihre Rolle lesbar; die operative Konditionspflege liegt bei schreibberechtigten Procurement-Rollen."
      };
    }
    if (access.mode === "plan_locked") {
      return {
        desc: "Lieferantenpool, Bewertung und Spend auf Erfuellung ausrichten.",
        note: "Preisrahmen bleiben in dieser Steuerungsschicht fuer berechtigte PRO-/Individuell-Zugaenge reserviert."
      };
    }
    if (access.mode === "org_locked") {
      return {
        desc: "Lieferantenpool, Bewertung und Spend auf Erfuellung ausrichten.",
        note: "Preisrahmen bleiben buyer-seitig fuer Unternehmensorganisationen reserviert und werden hier bewusst nicht als Standardzugang beworben."
      };
    }
    if (access.mode === "role_locked") {
      return {
        desc: "Lieferantenpool, Bewertung und Spend auf Erfuellung ausrichten.",
        note: "Preisrahmen bleiben nur fuer leseberechtigte Procurement-/Steuerungsrollen sichtbar."
      };
    }
    return {
      desc: "Lieferantenpool, Bewertung und Spend auf Erfuellung ausrichten.",
      note: "Staerkt Abschlussquote und Steuerbarkeit, bleibt aber hinter Bedarf, Deal und Zeiten nachgelagert."
    };
  }
  function applySupplierGovernanceCopy(me) {
    var copy = getSupplierGovernanceCopy(resolveRateCardAccess(me));
    var desc = $("supplierGovernanceDesc");
    var note = $("supplierGovernanceNote");
    if (desc) desc.textContent = copy.desc;
    if (note) note.textContent = copy.note;
  }

  /**
   * Welle 7 – Phase 0+1: Hub-Card "Einsaetze & Zeiten" ist der operative
   * Arbeitsplatz der Agentur. Fuer Unternehmen wird sie zu "Einsatzverfolgung"
   * (lesende Sicht) umetikettiert und als Begleitsicht statt Pilot-Kern ausgezeichnet.
   */
  function applyAssignmentsCopy(me) {
    var orgType = String(me && me.org_type || "").toLowerCase();
    if (orgType !== "company") return;
    var eyebrow = $("assignmentsCardEyebrow");
    var title = $("assignmentsCardTitle");
    var desc = $("assignmentsCardDesc");
    var note = $("assignmentsCardNote");
    if (eyebrow) eyebrow.textContent = "Begleitsicht";
    if (title) title.textContent = "Einsatzverfolgung";
    if (desc) {
      desc.textContent = "Einsatzstatus, laufende Zuweisungen und Abrechnungsstand lesend einsehen.";
    }
    if (note) {
      note.textContent = "Operative Einsatzsteuerung und Freigaben laufen beim beauftragten Personaldienstleister; Ihre Unternehmenssicht ist bewusst lesend.";
    }
  }

  /**
   * Track C: Die Marktplatz-Hub-Card traegt rollenabhaengige Sprache.
   * Unternehmen suchen Personal -> "Personal finden".
   * Zeitarbeitsfirmen suchen Plaetze fuer ihr Personal -> "Arbeitsplatz finden".
   * Spiegelt die bereits rollenbewusste Hauptnavigation (navMarketplace) und
   * nutzt denselben Terminologie-Helfer (keine doppelten String-Konstanten).
   */
  function applyMarketplaceCopy(me) {
    var orgType = String(me && me.org_type || "").toLowerCase();
    if (!orgType) return; // unbekannte Rolle: HTML-Default ("Personal finden") belassen
    var label = (window.TC && TC.terminology)
      ? TC.terminology.get("marketplace", orgType, null)
      : null;
    if (label) {
      // Hub-Card-Titel + Aktivierungs-Nudge-CTA fuehren auf denselben Marktplatz-Feed
      var title = $("hub-card-marketplace-title");
      if (title) title.textContent = label;
      var nudgeCta = $("ce-nudge-cta-marketplace");
      if (nudgeCta) nudgeCta.textContent = label;
    }

    // Rollenrichtige Create-CTA im Aktivierungs-Nudge (Fixplan 3.1):
    // Einsatzunternehmen bieten Arbeitsplaetze an (kein "Personal einstellen");
    // Personaldienstleister stellen Personal ein (kein "Arbeitsplatz anbieten").
    // Nur UI-Sichtbarkeit ueber org_type — keine DB-/API-/Logik-Aenderung.
    var ctaPostStaff = $("ce-nudge-cta-1");      // "Personal einstellen" — Dienstleister-Aktion
    var ctaPostWorkplace = $("ce-nudge-cta-2");  // "Arbeitsplatz anbieten" — Unternehmens-Aktion
    if (orgType === "company" && ctaPostStaff) ctaPostStaff.style.display = "none";
    if (orgType === "agency" && ctaPostWorkplace) ctaPostWorkplace.style.display = "none";

    // Agentur-Sicht: Beschreibung/Fussnote auf Arbeitsplatzsuche ausrichten
    // (Company-Default bleibt unveraendert).
    if (orgType !== "agency") return;
    var desc = $("hub-card-marketplace-desc");
    var note = $("hub-card-marketplace-note");
    if (desc) desc.textContent = "Offene Arbeitsplatzangebote, passende Einsaetze und Vermittlungsreaktionen im offenen Markt.";
    if (note) note.textContent = "Frueher Einstieg fuer Arbeitsplatzsuche, Reaktion und Match — ohne glatten Start kippt auch der Dealflow.";
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
        meta.textContent = "Verf\u00fcgbar ab " + minPlan;
        var upg = document.createElement("a");
        upg.href = "/public/sla_abo.html";
        upg.className = "ds-hub-card__upgrade";
        upg.innerHTML = "Upgrade ansehen &rarr;";
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
        badge.innerHTML = "&#128679;"; // 🚧 construction
        card.insertBefore(badge, card.firstChild);
      }

      // Pilot-specific status text
      var content = card.querySelector(".ds-hub-card__content");
      if (content && !content.querySelector(".ds-hub-card__meta")) {
        var meta = document.createElement("div");
        meta.className = "ds-hub-card__meta";
        meta.textContent = "Wird aktuell fertiggestellt";
        var hint = document.createElement("div");
        hint.className = "ds-hub-card__pilot-hint";
        hint.textContent = "Bald verf\u00fcgbar \u2013 dieser Bereich wird f\u00fcr Sie freigeschaltet.";
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
        badge.innerHTML = "&#128679;"; // 🚧
        card.insertBefore(badge, card.firstChild);
      }

      var content = card.querySelector(".ds-hub-card__content");
      if (content && !content.querySelector(".ds-hub-card__meta")) {
        var meta = document.createElement("div");
        meta.className = "ds-hub-card__meta";
        meta.textContent = "In Entwicklung";
        var hint = document.createElement("div");
        hint.className = "ds-hub-card__pilot-hint";
        hint.textContent = "Dieses Modul wird aktuell fertiggestellt und bald freigeschaltet.";
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
   * Soft-Fail; greift nur solange Onboarding nicht abgeschlossen ist. */
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
        if (title) title.textContent = "Ihr nächster Schritt: " + (step.label || "");
        var text = $("ce-nudge-text");
        if (text && step.description) text.textContent = step.description;
        var cta1 = $("ce-nudge-cta-1");
        var row = cta1 ? cta1.parentNode : null;
        if (row && !$("nba-primary-cta")) {
          var a = document.createElement("a");
          a.id = "nba-primary-cta";
          a.href = link;
          a.className = "ds-btn ds-btn--primary ds-btn--sm";
          a.setAttribute("data-cta-write", "true");
          a.textContent = (step.cta || "Jetzt erledigen") + " →";
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
        $("vr-fill-hours").textContent = d.avg_fill_hours != null ? d.avg_fill_hours.toFixed(1) : "\u2013";
        $("vr-hours-saved").textContent = d.estimated_hours_saved || 0;
        if (d.member_since) {
          $("vr-member-since").textContent = new Date(d.member_since).toLocaleDateString("de-DE", { month: "short", year: "numeric" });
        }
        $("vr-discount").textContent = (d.bounty_discount_pct || 0) + "%";
      }).catch(function () {});
  }

  /* ── Global Search ───────────────────────────────────────────── */
  /* \u2500\u2500 Globale Suche: Intent-/Synonym-Schicht (rollenbasiert \u00fcber sichtbare Hub-Cards) \u2500\u2500
   * "Funktion Nr. 1": Tippt jemand eine Absicht ("arbeiter einstellen", "mitarbeiter suchen",
   * "rechnung", "stundenzettel" \u2026), zeigen wir SOFORT die passenden Schnellzugriffe \u2014 gemappt
   * auf die echten Hub-Cards/CTAs, die f\u00fcr die Rolle/den Plan des Nutzers sichtbar sind. Darunter
   * laufen die DB-Volltextergebnisse weiter. Synonyme bewusst breit, umlaut-/tippfehler-tolerant. */
  var SEARCH_INTENTS = [
    { surface: "marketplace", label: "Personal finden", kw: ["personal","arbeiter","mitarbeiter","fachkraft","fachkrafte","kraft","krafte","leute","kollege","aushilfe","springer","helfer","suchen","finden","personalsuche","zeitarbeit","leiharbeit","leiharbeiter","notdienst","markt","marktplatz","kapazitat","kapazitaten","verfugbar"] },
    { surface: "requisitions", label: "Bedarfe / Arbeitsplatzangebote", kw: ["bedarf","bedarfe","arbeitsplatz","arbeitsplatzangebot","job","stelle","stellen","auftrag","anfrage","ausschreibung","ausschreiben","personalbedarf","requisition","anforderung"] },
    { surface: "deals", label: "Deals & Eins\u00e4tze", kw: ["deal","deals","einsatz","einsatze","vertrag","vertrage","vereinbarung","abschluss","buchung","auftragsabschluss"] },
    { surface: "assignments", label: "Eins\u00e4tze & Stundenzettel", kw: ["stunde","stunden","stundenzettel","zeiterfassung","timesheet","arbeitszeit","disposition","submission","freigabe","review","einsatzportal"] },
    { surface: "vendor_pool", label: "Lieferanten / Agenturen", kw: ["lieferant","lieferanten","agentur","agenturen","vendor","partner","dienstleister","pool","subunternehmer"] },
    { surface: "my_company", label: "Firmenprofil", kw: ["firma","unternehmen","firmenprofil","profil","unternehmensprofil"] },
    { surface: "trust_center", label: "Nachweise & Compliance", kw: ["nachweis","nachweise","dokument","dokumente","zertifikat","compliance","datenschutz","trust","governance","prufung"] },
    { surface: "executive_dashboard", label: "Berichte & Kennzahlen", kw: ["dashboard","report","bericht","berichte","kennzahl","kennzahlen","kpi","auswertung","statistik","executive","analyse","reporting","rechnung","rechnungen","abrechnung","finanzen","kosten","ausgaben","spend","umsatz"] },
    { surface: "activity", label: "Aktivit\u00e4t & Verlauf", kw: ["aktivitat","aktivitaten","verlauf","historie","log","protokoll","ereignis"] },
    { surface: "bounties", label: "Pr\u00e4mien / Bounties", kw: ["bounty","bounties","pramie","pramien","belohnung","kopfgeld"] },
    { surface: "location_management", label: "Steuerung / Organisation", kw: ["steuerung","verwaltung","organisation","einstellungen","standort","standorte","team","nutzer","benutzer","rollen","konfiguration"] },
    { surface: "admin_panel", label: "Administration", kw: ["admin","administration","systemverwaltung","plattformverwaltung"] }
  ];
  // Direkte Aktions-Schnellzugriffe (CTAs) \u2014 nur wenn real sichtbar (rollen-/plan-gegated).
  var SEARCH_ACTIONS = [
    { sel: "a[href='/public/capacity_exchange_form.html']", label: "Personal einstellen", kw: ["einstellen","anheuern","anwerben","rekrutieren","neue kraft","personal einstellen","mitarbeiter einstellen","arbeiter einstellen"] },
    { sel: "a[href='/public/marketplace_demand_create.html']", label: "Arbeitsplatz anbieten", kw: ["anbieten","arbeitsplatz anbieten","stelle anbieten","auftrag anbieten","bedarf melden","arbeitsplatzangebot","ausschreiben"] }
  ];

  function isVisibleEl(el) { return !!(el && el.offsetParent !== null && el.getAttribute("aria-hidden") !== "true"); }
  function normQ(q) { return (q || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); }
  function matchIntents(q) {
    var nq = normQ(q);
    if (nq.length < 2) return [];
    var hits = [];
    SEARCH_ACTIONS.forEach(function (a) {
      var score = a.kw.reduce(function (s, k) { return s + (nq.indexOf(normQ(k)) !== -1 ? 1 : 0); }, 0);
      if (!score) return;
      var el = document.querySelector(a.sel);
      if (!isVisibleEl(el)) return;
      hits.push({ href: el.getAttribute("href"), label: a.label, score: score + 2 });
    });
    SEARCH_INTENTS.forEach(function (intent) {
      var score = intent.kw.reduce(function (s, k) { return s + (nq.indexOf(normQ(k)) !== -1 ? 1 : 0); }, 0);
      if (!score) return;
      var card = grid.querySelector('[data-surface="' + intent.surface + '"]');
      if (!isVisibleEl(card)) return;
      hits.push({ href: card.getAttribute("href"), label: intent.label, score: score });
    });
    var seen = {}, out = [];
    hits.sort(function (a, b) { return b.score - a.score; }).forEach(function (h) {
      if (!h.href || seen[h.href]) return; seen[h.href] = 1; out.push(h);
    });
    return out.slice(0, 6);
  }
  function intentsHtml(q) {
    var hits = matchIntents(q);
    if (!hits.length) return "";
    var html = '<div class="tc-search-section">Schnellzugriff</div>';
    hits.forEach(function (h) {
      html += '<a class="tc-search-intent" href="' + esc(h.href) + '"><strong class="ds-text-sm">'
        + esc(h.label) + '</strong><span class="tc-search-intent__arrow">&rarr;</span></a>';
    });
    return html;
  }

  async function runGlobalSearch() {
    var q = $("globalSearchInput").value.trim();
    if (!q || q.length < 2) return;
    var type = $("globalSearchType").value;
    var box = $("searchResults");
    box.style.display = "block";
    var intents = intentsHtml(q);
    box.innerHTML = intents + '<p class="ds-text-muted">Suche l\u00e4uft\u2026</p>';
    try {
      var r = await fetch("/api/search?q=" + encodeURIComponent(q) + "&type=" + type + "&limit=20", { credentials: "include" });
      if (!r.ok) { box.innerHTML = intents + '<p class="ds-text-danger">Fehler: ' + r.status + "</p>"; return; }
      var data = await r.json();
      var results = (data.data && data.data.results) || data.results || [];
      var total = (data.data && data.data.total) || data.total || 0;
      var source = (data.data && data.data.source) || data.source || "";
      var html = intents;
      if (!results.length) {
        html += '<p class="ds-text-muted">Keine direkten Treffer f\u00fcr \u201e' + esc(q) + '\u201c'
          + (intents ? " \u2013 nutze die Schnellzugriffe oben." : ".") + "</p>";
        box.innerHTML = html; return;
      }
      if (intents) html += '<div class="tc-search-section">Treffer</div>';
      html += '<div class="ds-text-xs ds-text-muted ds-mb-2">' + esc(String(total)) + " Treffer (Quelle: " + esc(source) + ")</div>";
      results.forEach(function (item) {
        var title = item.company_name || item.name || item.title || item.role || item.skill_name || "Unbekannt";
        var sub = item._index || item.type || "";
        var extra = item.city || item.location_city || item.region || "";
        html += '<div class="tc-search-item ds-flex ds-flex--between ds-flex--center" style="padding:8px 0">';
        html += '<div><strong class="ds-text-sm">' + esc(title) + "</strong>";
        if (extra) html += ' <span class="ds-text-xs ds-text-muted">' + esc(extra) + "</span>";
        html += "</div>";
        if (sub) html += '<span class="ds-badge ds-badge--neutral" style="font-size:10px">' + esc(sub) + "</span>";
        html += "</div>";
      });
      box.innerHTML = html;
    } catch (e) {
      box.innerHTML = intents + '<p class="ds-text-danger">Suche fehlgeschlagen: ' + esc(e.message) + "</p>";
    }
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

  /* ── Boot ────────────────────────────────────────────────────── */
  fetch("/api/me", { credentials: "include" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (me) {
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

  /* ── Expose for HTML onclick handlers ────────────────────────────── */
  window.runGlobalSearch = runGlobalSearch;

  /* ── Live-Schnellzugriffe während des Tippens (clientseitig, kein API-Call) ──
   * Gibt der Suche sofort das "Funktion Nr. 1"-Gefühl: Intents erscheinen beim Tippen,
   * Enter/Button löst zusätzlich die DB-Volltextsuche aus. */
  (function () {
    var input = $("globalSearchInput"); var box = $("searchResults");
    if (!input || !box) return;
    var t;
    input.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(function () {
        var q = input.value.trim();
        if (q.length < 2) { box.style.display = "none"; box.innerHTML = ""; return; }
        var html = intentsHtml(q);
        if (html) {
          box.style.display = "block";
          box.innerHTML = html + '<div class="ds-text-xs ds-text-muted" style="margin-top:8px">Enter für Volltextsuche…</div>';
        } else { box.style.display = "none"; box.innerHTML = ""; }
      }, 120);
    });
  })();
})();
