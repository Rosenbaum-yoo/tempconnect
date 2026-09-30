/**
 * Notdienst-Leitstand — was gerade brennt, und was daraus geworden ist.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM ES DIESE SEITE GIBT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `api/routes/emergency.js` traegt elf fertige, auditierte Endpunkte. Gemessen
 * am 2026-09-05 riefen die Oberflaechen davon ZWEI auf. Neun waren gebaut,
 * geprueft und unerreichbar — darunter die gesamte Uebersicht ueber die eigenen
 * Notlagen und der einzige Weg, eine laufende Notlage hochzustufen.
 *
 * Ein Unternehmen, das um 5:40 Uhr eine Schicht ausfallen sieht, konnte eine
 * Notlage melden und danach nirgends nachsehen, was daraus wurde. Es gab keine
 * Liste, keinen Stand, keine SLA-Anzeige — nur die einzelne Ausschreibung, wenn
 * man ihre Kennung noch hatte.
 *
 * ── DREI ENTSCHEIDUNGEN, DIE MAN DER SEITE ANSIEHT ──────────────────────
 *
 * ES GIBT KEIN `?all=1`. Beide Uebersichts-Endpunkte kennen einen Schalter, der
 * die Org-Grenze aufhebt und plattformweit liefert. Diese Seite benutzt ihn
 * nicht und darf ihn nicht benutzen: `getActiveEmergencies` gibt `dr.*` zurueck,
 * also die ganze Zeile — samt `contact_name`/`contact_phone`, der Durchwahl der
 * Ansprechperson des fremden Unternehmens (Migration 192). Der ausdruecklich
 * oeffentliche Nachbarpfad `/marketplace/public/demand-requests` waehlt genau
 * 16 Felder von Hand aus und laesst diese beiden weg. Diese Auswahl ist die
 * Absicht; `dr.*` ist die Nachlaessigkeit. Ein Waechter haelt das fest.
 *
 * DIE WIRKUNG STEHT VOR DER HANDLUNG. Eine Eskalation ist nicht "ein Knopf mehr":
 * sie benachrichtigt bis zu 50 Anbieter erneut, auch per E-Mail. Wer sie
 * ausloest, liest vorher, was gleich passiert, und wie oft es noch geht. Bei
 * einer Belegschaft von einem Menschen (siehe CLAUDE.md) schuetzt kein zweites
 * Augenpaar — es schuetzt nur, dass man vorher sieht, was man tut.
 *
 * DIE SEITE ATMET. Ein Leitstand, der beim Laden einmal Zahlen zeigt und dann
 * einfriert, ist schlimmer als keiner: er sieht aktuell aus. Alle 60 Sekunden
 * wird nachgeladen, und nur solange das Fenster sichtbar ist — ein Leitstand in
 * einem Hintergrund-Tab braucht keine Abfrage pro Minute.
 */
(function () {
  "use strict";

  var TAKT_MS = 60000;
  var taktZeiger = null;
  var letzte = { dashboard: null, aktiv: null, verlauf: null };

  /* ── Werkzeug ────────────────────────────────────────────────────────── */

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function t(schluessel, ersatz) {
    var s = (window.TCi18n && typeof TCi18n.t === "function") ? TCi18n.t(schluessel) : "";
    return s || ersatz;
  }

  function el(id) { return document.getElementById(id); }

  /** Uhrzeit in Berliner Zeit — nie roher UTC-Anschnitt. */
  var uhrFmt = null;
  function jetztBerlin() {
    if (!uhrFmt) {
      uhrFmt = new Intl.DateTimeFormat("de-DE", {
        timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit"
      });
    }
    return uhrFmt.format(new Date());
  }

  function datumDE(wert) {
    if (!wert) return "–";
    /* Durchgehend ueber `window`: in einem Browser sind `window.TCDate` und
       das blanke `TCDate` dasselbe, ueberall sonst nicht. Die Mischung aus
       beidem hat die Laufzeitprobe sofort zerlegt - `window.TCDate` war da,
       `TCDate` nicht, und der ganze Verlauf landete im Fehlerzustand. */
    if (window.TCDate && typeof window.TCDate.isoDateDE === "function") {
      var iso = window.TCDate.isoDateDE(wert);
      if (!iso) return "–";
      var s = iso.split("-");
      return s[2] + "." + s[1] + "." + s[0];
    }
    return String(wert).slice(0, 10);
  }

  /** Alter in Minuten als lesbare Dauer. */
  function dauer(minuten) {
    var m = Math.max(0, Math.round(Number(minuten) || 0));
    if (m < 60) return m + " min";
    var h = Math.floor(m / 60);
    if (h < 24) return h + " h " + (m % 60) + " min";
    return Math.floor(h / 24) + " T " + (h % 24) + " h";
  }

  /**
   * Holt vom Notdienst-Backend. KEIN `all`-Parameter — siehe Kopfkommentar.
   */
  function hole(pfad) {
    return fetch("/api/emergency" + pfad, { credentials: "include" }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) {
          var e = new Error((d && (d.message || d.error)) || "API_ERROR");
          e.code = (d && d.error) || String(r.status);
          e.status = r.status;
          throw e;
        }
        return d;
      });
    });
  }

  function csrfHolen() {
    return fetch("/api/csrf", { credentials: "include" })
      .then(function (r) { return r.json(); })
      .then(function (d) { return (d && (d.csrfToken || d.token)) || ""; })
      .catch(function () { return ""; });
  }

  /* ── Zustaende ───────────────────────────────────────────────────────── */

  function zeigeLaedt(knotenId) {
    var n = el(knotenId);
    if (n) n.innerHTML = '<div class="lst-zustand">' + esc(t("nd.lst.loading", "Wird geladen …")) + "</div>";
  }

  function zeigeFehler(knotenId, fehler) {
    var n = el(knotenId);
    if (!n) return;
    var tarif = fehler && fehler.code === "FEATURE_NOT_ALLOWED";
    var text = tarif
      ? t("nd.lst.err.plan", "Der Notdienst gehoert nicht zu Ihrem Tarif.")
      : (fehler && fehler.status === 401)
        ? t("nd.lst.err.auth", "Bitte neu anmelden.")
        : t("nd.lst.err.load", "Konnte nicht geladen werden.");

    /*
     * Ein Tarif-Riegel OHNE Weg nach vorn ist eine Sackgasse - und ausgerechnet
     * an der Stelle, an der jemand gerade Interesse zeigt. Die Hausregel sagt es
     * ausdruecklich: "hidden_plan_locked zeigt konkreten Upgrade-Pfad, kein
     * generisches Nicht-verfuegbar". Beim Netzfehler ist der richtige Knopf ein
     * anderer - wiederholen -, deshalb schliessen die beiden einander aus.
     */
    var knopf = tarif
      ? '<a class="ds-btn ds-btn--sm ds-btn--primary" href="/public/sla_abo.html">'
        + esc(t("nd.lst.err.planCta", "Tarif ansehen")) + "</a>"
      : '<button class="ds-btn ds-btn--sm" data-neu-laden>'
        + esc(t("nd.lst.retry", "Erneut versuchen")) + "</button>";

    n.innerHTML = '<div class="lst-zustand lst-zustand--fehler">' + esc(text) + " " + knopf + "</div>";
  }

  /* ── 1. Die Kennzahlen ───────────────────────────────────────────────── */

  function zeichneKennzahlen(d) {
    letzte.dashboard = d;
    var a = (d && d.active) || {};
    var m = (d && d.metrics_30d) || {};

    var kacheln = [
      { id: "kpi-offen", wert: a.total || 0 },
      { id: "kpi-notdienst", wert: a.notdienst || 0 },
      { id: "kpi-eskaliert", wert: a.escalated || 0 },
      { id: "kpi-sla", wert: a.sla_breached || 0 },
      { id: "kpi-reaktionsquote", wert: (m.response_rate != null ? m.response_rate + " %" : "–") },
      { id: "kpi-reaktionszeit", wert: (m.avg_response_minutes != null ? dauer(m.avg_response_minutes) : "–") },
      { id: "kpi-slaquote", wert: (m.sla_met_rate != null ? m.sla_met_rate + " %" : "–") },
      { id: "kpi-besetzung", wert: (m.fill_rate != null ? m.fill_rate + " %" : "–") }
    ];
    kacheln.forEach(function (k) {
      var n = el(k.id);
      if (!n) return;
      n.textContent = String(k.wert);
      /*
       * DIE FARBE GEHOERT AN DEN ZUSTAND, NICHT AN DIE KATEGORIE. "Eskaliert: 0"
       * in Warnfarbe ist ein Alarm ohne Anlass - und nach dem dritten Mal sieht
       * niemand mehr hin. Die Kachel traegt ihre Farbklasse im Markup; hier
       * wird sie abgeschaltet, solange die Zahl 0 ist.
       */
      var kachel = n.parentNode;
      if (!kachel || !kachel.classList) return;
      var brennt = Number(k.wert) > 0;
      kachel.classList.toggle("lst-kachel--still", !brennt);
    });

    /* Die 30-Tage-Reihe ohne einen einzigen Vorgang zeigt vier Nullen, die wie
       ein Ergebnis aussehen. Sie sind keines — der Hinweis sagt das. */
    var leer = el("kpi-30d-leer");
    if (leer) leer.hidden = !(m.total === 0);
  }

  /* ── 2. Die offenen Notlagen ─────────────────────────────────────────── */

  function dringlichkeitsChip(zeile) {
    var stufe = String(zeile.urgency_level || zeile.urgency || "").toUpperCase();
    var klasse = stufe === "NOTDIENST" ? "lst-chip--notdienst"
      : (stufe === "CRITICAL" ? "lst-chip--kritisch" : "lst-chip--dringend");
    return '<span class="lst-chip ' + klasse + '">' + esc(zeile.urgency_label || stufe) + "</span>";
  }

  function deckungsBalken(zeile) {
    var soll = Number(zeile.required_total_count || zeile.headcount || 1);
    var ist = Number(zeile.currently_committed_count || 0);
    var pct = soll > 0 ? Math.min(100, Math.round((ist / soll) * 100)) : 0;
    return '<div class="lst-deckung" title="' + esc(ist + " / " + soll) + '">'
      + '<div class="lst-deckung__bar"><span style="width:' + pct + '%"></span></div>'
      + '<span class="lst-deckung__text">' + esc(ist) + " / " + esc(soll) + "</span></div>";
  }

  function zeichneOffene(daten) {
    letzte.aktiv = daten;
    var zeilen = (daten && Array.isArray(daten.items)) ? daten.items : [];
    var n = el("lst-offen");
    if (!n) return;

    var zaehler = el("lst-offen-zahl");
    if (zaehler) zaehler.textContent = String(zeilen.length);

    if (!zeilen.length) {
      n.innerHTML = '<div class="lst-zustand">'
        + esc(t("nd.lst.empty.open", "Gerade keine offene Notlage in Ihrem Unternehmen. Das ist der Normalfall — und der gute."))
        + "</div>";
      return;
    }

    n.innerHTML = zeilen.map(function (z) {
      var stufe = Number(z.escalation_level || 0);
      var kannNochEskalieren = stufe < 3;
      return '<article class="lst-karte' + (z.sla_overdue ? " lst-karte--gerissen" : "") + '">'
        + '<div class="lst-karte__kopf">'
        +   dringlichkeitsChip(z)
        +   '<h3 class="lst-karte__titel">' + esc(z.title || "–") + "</h3>"
        + "</div>"
        + '<div class="lst-karte__meta">'
        +   "<span>" + esc(z.role || "–") + "</span>"
        +   "<span>" + esc(z.location_city || "–") + "</span>"
        +   "<span>" + esc(t("nd.lst.age", "seit")) + " " + esc(dauer(z.age_minutes)) + "</span>"
        +   (z.sla_overdue
              ? '<span class="lst-warn">' + esc(t("nd.lst.slaOver", "SLA gerissen")) + "</span>"
              : (z.sla_due_at ? "<span>" + esc(t("nd.lst.slaDue", "SLA bis")) + " " + esc(datumDE(z.sla_due_at)) + "</span>" : ""))
        +   (stufe > 0 ? '<span class="lst-warn">' + esc(t("nd.lst.escLevel", "Eskalationsstufe") + " " + stufe) + "</span>" : "")
        + "</div>"
        + deckungsBalken(z)
        + '<div class="lst-karte__aktionen">'
        +   '<a class="ds-btn ds-btn--sm" href="/public/marketplace_demand_detail.html?id=' + encodeURIComponent(z.id) + '">'
        +     esc(t("nd.lst.open", "Ausschreibung oeffnen")) + "</a>"
        +   (kannNochEskalieren
              ? '<button class="ds-btn ds-btn--sm lst-btn-esk" data-eskaliere="' + esc(z.id)
                + '" data-stufe="' + stufe + '" data-titel="' + esc(z.title || "") + '">'
                + esc(t("nd.lst.escalate", "Eskalieren")) + "</button>"
              : '<span class="lst-hinweis">' + esc(t("nd.lst.escMax", "hoechste Stufe erreicht")) + "</span>")
        + "</div>"
        + '<div class="lst-eskalation" data-esk-fuer="' + esc(z.id) + '" hidden></div>'
        + "</article>";
    }).join("");
  }

  /* ── 3. Der Verlauf ──────────────────────────────────────────────────── */

  function zeichneVerlauf(daten) {
    letzte.verlauf = daten;
    var zeilen = (daten && Array.isArray(daten.items)) ? daten.items : [];
    var n = el("lst-verlauf");
    if (!n) return;

    if (!zeilen.length) {
      n.innerHTML = '<div class="lst-zustand">'
        + esc(t("nd.lst.empty.history", "Noch keine Notlage gemeldet.")) + "</div>";
      return;
    }

    n.innerHTML = '<table class="lst-tabelle"><thead><tr>'
      + "<th>" + esc(t("nd.lst.th.when", "Gemeldet")) + "</th>"
      + "<th>" + esc(t("nd.lst.th.what", "Bedarf")) + "</th>"
      + "<th>" + esc(t("nd.lst.th.where", "Ort")) + "</th>"
      + "<th>" + esc(t("nd.lst.th.status", "Status")) + "</th>"
      + "<th>" + esc(t("nd.lst.th.reactions", "Reaktionen")) + "</th>"
      + "<th>" + esc(t("nd.lst.th.firstReply", "Erste Reaktion")) + "</th>"
      + "</tr></thead><tbody>"
      + zeilen.map(function (z) {
        return "<tr>"
          + "<td>" + esc(datumDE(z.created_at)) + "</td>"
          + '<td><a href="/public/marketplace_demand_detail.html?id=' + encodeURIComponent(z.id) + '">'
          +   esc(z.title || "–") + "</a><br><span class=\"lst-klein\">" + esc(z.role || "") + "</span></td>"
          + "<td>" + esc(z.location_city || "–") + "</td>"
          + "<td>" + esc(String(z.status || "").toUpperCase())
          +   (z.sla_status ? ' <span class="lst-klein">' + esc(z.sla_status) + "</span>" : "")
          +   (Number(z.escalation_level) > 0 ? ' <span class="lst-klein">E' + esc(z.escalation_level) + "</span>" : "")
          + "</td>"
          + "<td>" + esc(z.supplier_response_count || 0) + "</td>"
          + "<td>" + (z.response_minutes != null ? esc(dauer(z.response_minutes)) : "–") + "</td>"
          + "</tr>";
      }).join("")
      + "</tbody></table>";
  }

  /* ── 4. Eskalation — mit Wirkungsvorschau ────────────────────────────── */

  /**
   * Oeffnet die Rueckfrage. Sie nennt, WAS gleich passiert: eine Eskalation
   * benachrichtigt bis zu 50 Anbieter erneut, auch per E-Mail. Ohne diesen Satz
   * ist "Eskalieren" ein Knopf, den man aus Ungeduld dreimal drueckt.
   */
  function frageEskalation(knopf) {
    var id = knopf.getAttribute("data-eskaliere");
    var stufe = Number(knopf.getAttribute("data-stufe") || 0);
    var titel = knopf.getAttribute("data-titel") || "";
    var block = document.querySelector('[data-esk-fuer="' + (window.CSS && window.CSS.escape ? window.CSS.escape(id) : id) + '"]');
    if (!block) return;

    block.hidden = false;
    block.innerHTML = '<p class="lst-esk__frage">'
      + esc(t("nd.lst.esk.q", "Notlage hochstufen?")) + " <b>" + esc(titel) + "</b></p>"
      + '<p class="lst-esk__wirkung">'
      + esc(t("nd.lst.esk.effect1", "Stufe") + " " + stufe + " → " + (stufe + 1) + ". ")
      + esc(t("nd.lst.esk.effect2", "Bis zu 50 passende Anbieter werden erneut benachrichtigt, auch per E-Mail."))
      + " " + esc(t("nd.lst.esk.effect3", "Danach bleiben")) + " " + esc(Math.max(0, 3 - stufe - 1)) + " "
      + esc(t("nd.lst.esk.effect4", "weitere Stufen.")) + "</p>"
      + '<div class="lst-esk__knoepfe">'
      +   '<button class="ds-btn ds-btn--sm ds-btn--primary" data-esk-ab="' + esc(id) + '">'
      +     esc(t("nd.lst.esk.confirm", "Jetzt hochstufen")) + "</button>"
      +   '<button class="ds-btn ds-btn--sm" data-esk-weg>' + esc(t("nd.lst.cancel", "Abbrechen")) + "</button>"
      +   '<span class="lst-esk__hinweis" data-esk-hinweis></span>'
      + "</div>";
  }

  function eskaliere(block, id) {
    var knopf = block.querySelector("[data-esk-ab]");
    var hinweis = block.querySelector("[data-esk-hinweis]");
    knopf.disabled = true;
    hinweis.textContent = t("nd.lst.esk.sending", "Wird hochgestuft …");
    hinweis.classList.remove("lst-warn");

    csrfHolen().then(function (token) {
      return fetch("/api/emergency/" + encodeURIComponent(id) + "/escalate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
        body: "{}"
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) {
            var e = new Error((d && (d.message || d.error)) || "API_ERROR");
            e.code = (d && d.error) || String(r.status);
            throw e;
          }
          return d;
        });
      });
    }).then(function () {
      block.hidden = true;
      ladeAlles();
    }).catch(function (e) {
      knopf.disabled = false;
      hinweis.classList.add("lst-warn");
      hinweis.textContent =
        e.code === "FORBIDDEN" ? t("nd.lst.esk.err.foreign", "Diese Notlage gehoert einem anderen Unternehmen.")
        : e.code === "MAX_ESCALATION_REACHED" ? t("nd.lst.esk.err.max", "Hoechste Stufe bereits erreicht.")
        : e.code === "NOT_OPEN" ? t("nd.lst.esk.err.closed", "Diese Notlage ist nicht mehr offen.")
        : e.code === "CSRF_INVALID" ? t("nd.lst.err.auth", "Bitte neu anmelden.")
        : (e.message || t("nd.lst.err.load", "Konnte nicht geladen werden."));
    });
  }

  /* ── 5. Laden und Takt ───────────────────────────────────────────────── */

  function ladeAlles() {
    var stand = el("lst-stand");
    if (stand) stand.textContent = t("nd.lst.updating", "aktualisiert …");

    hole("/dashboard").then(zeichneKennzahlen).catch(function (e) {
      var n = el("lst-kpi-fehler");
      if (n) {
        n.hidden = false;
        n.innerHTML = e.code === "FEATURE_NOT_ALLOWED"
          ? esc(t("nd.lst.err.plan", "Der Notdienst gehoert nicht zu Ihrem Tarif."))
            + ' <a href="/public/sla_abo.html">' + esc(t("nd.lst.err.planCta", "Tarif ansehen")) + "</a>"
          : esc(t("nd.lst.err.load", "Konnte nicht geladen werden."));
      }
    });

    hole("/active").then(zeichneOffene).catch(function (e) { zeigeFehler("lst-offen", e); });
    hole("/history?limit=50").then(zeichneVerlauf).catch(function (e) { zeigeFehler("lst-verlauf", e); });

    if (stand) {
      stand.textContent = t("nd.lst.asOf", "Stand") + " " + jetztBerlin();
    }
  }

  function taktStarten() {
    taktStoppen();
    taktZeiger = setInterval(function () {
      if (document.hidden) return;
      ladeAlles();
    }, TAKT_MS);
  }

  function taktStoppen() {
    if (taktZeiger) { clearInterval(taktZeiger); taktZeiger = null; }
  }

  /* ── 6. Verdrahtung ──────────────────────────────────────────────────── */

  function start() {
    zeigeLaedt("lst-offen");
    zeigeLaedt("lst-verlauf");

    document.addEventListener("click", function (ev) {
      var esk = ev.target.closest && ev.target.closest("[data-eskaliere]");
      if (esk) { frageEskalation(esk); return; }

      var weg = ev.target.closest && ev.target.closest("[data-esk-weg]");
      if (weg) { weg.closest("[data-esk-fuer]").hidden = true; return; }

      var ab = ev.target.closest && ev.target.closest("[data-esk-ab]");
      if (ab) { eskaliere(ab.closest("[data-esk-fuer]"), ab.getAttribute("data-esk-ab")); return; }

      var neu = ev.target.closest && ev.target.closest("[data-neu-laden]");
      if (neu) { ladeAlles(); }
    });

    /* Sprachwechsel: neu zeichnen aus dem Speicher, ohne Netzabruf. */
    document.addEventListener("tc:langchange", function () {
      if (letzte.dashboard) zeichneKennzahlen(letzte.dashboard);
      if (letzte.aktiv) zeichneOffene(letzte.aktiv);
      if (letzte.verlauf) zeichneVerlauf(letzte.verlauf);
    });

    /* Beim Zurueckkehren sofort nachladen statt bis zum naechsten Takt zu warten. */
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) ladeAlles();
    });

    ladeAlles();
    taktStarten();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  /* Fuer die Probe: die reinen Rechenteile ohne DOM. */
  window.TCNotdienstLeitstand = { dauer: dauer, esc: esc };
})();
