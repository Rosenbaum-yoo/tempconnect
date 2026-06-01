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
  async function runGlobalSearch() {
    var q = $("globalSearchInput").value.trim();
    if (!q || q.length < 2) return;
    var type = $("globalSearchType").value;
    var box = $("searchResults");
    box.style.display = "block";
    box.innerHTML = '<p class="ds-text-muted">Suche l\u00e4uft\u2026</p>';
    try {
      var r = await fetch("/api/search?q=" + encodeURIComponent(q) + "&type=" + type + "&limit=20", { credentials: "include" });
      if (!r.ok) { box.innerHTML = '<p class="ds-text-danger">Fehler: ' + r.status + "</p>"; return; }
      var data = await r.json();
      var results = (data.data && data.data.results) || data.results || [];
      var total = (data.data && data.data.total) || data.total || 0;
      var source = (data.data && data.data.source) || data.source || "";
      if (!results.length) {
        box.innerHTML = '<p class="ds-text-muted">Keine Ergebnisse f\u00fcr \u201e' + esc(q) + '\u201c</p>';
        return;
      }
      var html = '<div class="ds-text-xs ds-text-muted ds-mb-2">' + esc(String(total)) + " Treffer (Quelle: " + esc(source) + ")</div>";
      results.forEach(function (item) {
        var title = item.company_name || item.name || item.title || item.role || item.skill_name || "Unbekannt";
        var sub = item._index || item.type || "";
        var extra = item.city || item.location_city || item.region || "";
        html += '<div class="ds-flex ds-flex--between ds-flex--center" style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)">';
        html += '<div><strong class="ds-text-sm">' + esc(title) + "</strong>";
        if (extra) html += ' <span class="ds-text-xs ds-text-muted">' + esc(extra) + "</span>";
        html += "</div>";
        if (sub) html += '<span class="ds-badge ds-badge--neutral" style="font-size:10px">' + esc(sub) + "</span>";
        html += "</div>";
      });
      box.innerHTML = html;
    } catch (e) {
      box.innerHTML = '<p class="ds-text-danger">Suche fehlgeschlagen: ' + esc(e.message) + "</p>";
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

  /* ── Boot ────────────────────────────────────────────────────── */
  fetch("/api/me", { credentials: "include" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (me) {
      window._slaPlan = (me && me.plan) ? me.plan : "DEMO";
      applySupplierGovernanceCopy(me);
      applyAssignmentsCopy(me);
      applyHubVisibility(me);
      applyCTAVisibility(me);
      PlanFeatures.load().then(function (pf) {
        applyStaticCardLocks(window._slaPlan);
        applyMaturityGates(pf && pf.MATURITY_GATES ? pf.MATURITY_GATES : null);
      });
      if (me) {
        applyPilotLocks(me);
        loadCeNudges();
        loadValueReport();
      }
    })
    .catch(function () {
      window._slaPlan = "DEMO";
      applySupplierGovernanceCopy(null);
      applyAssignmentsCopy(null);
      applyHubVisibility(null);
      PlanFeatures.load().then(function (pf) {
        applyStaticCardLocks("DEMO");
        applyMaturityGates(pf && pf.MATURITY_GATES ? pf.MATURITY_GATES : null);
      });
    });

  /* ── Expose for HTML onclick handlers ────────────────────────────── */
  window.runGlobalSearch = runGlobalSearch;
})();
