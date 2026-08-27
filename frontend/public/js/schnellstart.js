/* ═══════════════════════════════════════════════════════════════════════════
   Schnellstart — zwei Fragen statt eines Formulars (Welle J10)

   OWNER-AUFTRAG (2026-08-26/27): "vorgefertigte Anfragen wie 'suchst du
   Personal' und mit Ja und Nein beantworten lassen … vielleicht mit
   Notdienst-Button oder schneller liefern als 48 Stunden". Owner-Platzierung
   1a: ueberall beim Suchen — Marktplatz-Feed, Personalsuche UND Verfuegbare
   Kraefte; einmal beantwortet, merkt er sich die Antwort und verschwindet.

   DAS PRINZIP: Antworten statt Bedienen. Wer Personal sucht, soll nicht
   ueberlegen, welches der sieben Filterfelder er zuerst anfasst, sondern zwei
   Fragen beantworten:

     1. "Suchen Sie Personal?"                       Ja / Nein
     2. "Brauchen Sie es in unter 48 Stunden?"       Ja -> Notdienst-Weg
                                                     Nein -> normaler Weg
     3. Drei Angaben (was, wo, ab wann) — dieselben drei, die spaeter das
        Buchungsmodal stellt (Plan J §0.2). Wer sie hier tippt, tippt sie
        nirgends noch einmal.

   EINE DATEI, DREI SEITEN: Selbstmontage ueber eine Pfad-Tabelle, wie
   contextHints.js. Jede Seite bindet nur das Skript ein; der Einstieg weiss
   selbst, wo er hingehoert, welche Felder er befuellt und wie er die Suche
   ausloest. Kein Einbau an drei Stellen, kein dreifach gepflegter Text.

   ABWEISBAR UND VERGESSLICH: Ein Einstieg, der jeden Tag wieder fragt, ist
   eine Zumutung. Die Antwort merkt sich localStorage; "Nein" oder das
   Schliessen blendet ihn dauerhaft aus (wiederherstellbar ueber den kleinen
   Wiederoeffnen-Knopf).

   NUR FUER UNTERNEHMEN: Eine Zeitarbeitsfirma sucht kein Personal, sie bietet
   welches an. Der Einstieg erscheint deshalb nur, wenn die Shell eine
   Unternehmens-Rolle meldet — und wartet notfalls auf sie (tc:shell-context).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var MERKER = "tcSchnellstart:erledigt";

  /* Wo der Einstieg erscheint und was er dort tut.
   *
   *   anker      Element, VOR dem er eingehaengt wird (erstes Treffer-Element).
   *   uebergabe  'adresse'  -> Antworten als Query-Parameter, Seite laedt neu
   *                            (der Feed liest sie beim Start selbst aus:
   *                             marketplaceFeed.js readUrlFilters)
   *              'felder'   -> Felder direkt befuellen und Suche ausloesen
   *                            (kein Neuladen, kein Flackern)
   *   felder     Zuordnung Frage -> Element-ID (nur bei 'felder')
   *   ausloesen  Funktion, die nach dem Befuellen die Suche startet
   */
  var FLAECHEN = {
    "/capacity_exchange_feed": {
      /* Gemessen 2026-08-27: die Filterleiste ist `.ce-filter`, darueber
         steht `#feed-stats`. Mehrere Anker, weil ein umbenannter Container
         den Einstieg sonst lautlos verschwinden liesse. */
      anker: [".ce-filter", "#feed-stats", "main"],
      uebergabe: "adresse",
      parameter: { was: "role", wo: "city", anzahl: "min_headcount", ab: "availability_from" }
    },
    "/capacity_search": {
      anker: ["#searchForm", "main"],
      uebergabe: "felder",
      felder: { was: "role", wo: "region", anzahl: "available_min", ab: "available_from" },
      sofortFeld: "available_window_immediate",
      ausloesen: function () {
        var f = document.getElementById("searchForm");
        if (!f) return;
        /* requestSubmit() loest den onsubmit-Handler samt Validierung aus —
           f.submit() wuerde ihn UEBERSPRINGEN und die Seite neu laden. */
        if (typeof f.requestSubmit === "function") f.requestSubmit();
        else if (typeof f.onsubmit === "function") f.onsubmit(new Event("submit"));
      }
    },
    "/company-live-workforce": {
      anker: ["#viewAvailable .ct-toolbar", "#viewAvailable"],
      uebergabe: "felder",
      felder: { was: "avRole", wo: "avCity", anzahl: "avCount", ab: "avFrom" },
      /* Die Fläche hat mehrere Reiter — der Einstieg gehoert in den, der
         Kraefte zeigt, und muss ihn notfalls selbst oeffnen. */
      vorbereiten: function () { if (typeof window.clwView === "function") window.clwView("available"); },
      ausloesen: function () { if (typeof window.clwLoadAvailable === "function") window.clwLoadAvailable(); }
    }
  };

  var TEXTE = {
    de: {
      titel: "Schnellstart",
      frage1: "Suchen Sie Personal?",
      ja: "Ja",
      nein: "Nein, danke",
      frage2: "Brauchen Sie die Kräfte in unter 48 Stunden?",
      ja48: "Ja – dringend",
      nein48: "Nein, geplant",
      notdienstTitel: "Notdienst",
      notdienstText: "Wir zeigen Ihnen sofort, wer kurzfristig starten kann. Angebote mit Notdienst-Kennzeichen erscheinen zuerst.",
      frage3: "Drei Angaben, dann sind Sie da:",
      wasLabel: "Welche Tätigkeit?",
      wasPh: "z. B. Staplerfahrer, Pflege, Elektro",
      woLabel: "Wo?",
      woPh: "Ort oder Postleitzahl",
      abLabel: "Ab wann?",
      anzahlLabel: "Wie viele?",
      los: "Passende Kräfte anzeigen",
      ueberspringen: "Lieber selbst filtern",
      wieder: "Schnellstart",
      wiederTitel: "Schnellstart erneut öffnen",
      schliessen: "Schließen",
      zurueck: "Zurück"
    },
    en: {
      titel: "Quick start",
      frage1: "Are you looking for staff?",
      ja: "Yes",
      nein: "No thanks",
      frage2: "Do you need them within 48 hours?",
      ja48: "Yes – urgent",
      nein48: "No, planned",
      notdienstTitel: "Emergency",
      notdienstText: "We will show you straight away who can start at short notice. Offers flagged as emergency appear first.",
      frage3: "Three details and you are there:",
      wasLabel: "Which role?",
      wasPh: "e.g. forklift driver, care, electrical",
      woLabel: "Where?",
      woPh: "City or postcode",
      abLabel: "From when?",
      anzahlLabel: "How many?",
      los: "Show matching staff",
      ueberspringen: "I will filter myself",
      wieder: "Quick start",
      wiederTitel: "Open quick start again",
      schliessen: "Close",
      zurueck: "Back"
    }
  };

  function t(schluessel) {
    var lang = (window.TCi18n && TCi18n.locale && TCi18n.locale() === "en") ? "en" : "de";
    return (TEXTE[lang] && TEXTE[lang][schluessel]) || TEXTE.de[schluessel] || "";
  }

  function esc(v) {
    if (v == null) return "";
    return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function heuteIso() {
    var d = new Date();
    /* Ortszeit, nicht toISOString: der UTC-Schnitt liefert abends den Vortag
       (Befundklasse F1, Living-Platform-Direktive "DACH-first Zeit"). */
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function erledigt() {
    try { return localStorage.getItem(MERKER) === "1"; } catch (e) { return false; }
  }
  function merkeErledigt() {
    try { localStorage.setItem(MERKER, "1"); } catch (e) { /* privater Modus: dann fragt er halt wieder */ }
  }
  function vergiss() {
    try { localStorage.removeItem(MERKER); } catch (e) { /* egal */ }
  }

  /* Erkennungsmerkmal je Flaeche: ein Element, das es NUR dort gibt.
   * Zweitweg neben dem Pfad, weil ein Pfad nicht immer stimmt — hinter einem
   * Reverse-Proxy, einer Weiterleitung oder einem Verzeichnis-Index steht in
   * location.pathname etwas anderes als der Dateiname. Ein Einstieg, der
   * daran lautlos verschwindet, waere nicht zu diagnostizieren. */
  var KENNZEICHEN = {
    "/capacity_exchange_feed": "#ff-role",
    "/capacity_search": "#searchForm",
    "/company-live-workforce": "#viewAvailable"
  };

  function flaeche() {
    var pfad = location.pathname.replace(/^\/public\//, "/").replace(/\.html$/, "").replace(/\/+$/, "") || "/";
    if (FLAECHEN[pfad]) return FLAECHEN[pfad];
    var schluessel = Object.keys(KENNZEICHEN);
    for (var i = 0; i < schluessel.length; i++) {
      if (document.querySelector(KENNZEICHEN[schluessel[i]])) return FLAECHEN[schluessel[i]];
    }
    return null;
  }

  /** Nur Unternehmen suchen Personal. Ohne Kontext: nicht zeigen. */
  function istUnternehmen() {
    var ctx = (window.TC && TC.shell && TC.shell.context) || {};
    var me = ctx.me || null;
    if (!me) return null; /* noch unbekannt — der Aufrufer wartet */
    var typ = String(me.org_type || "").toLowerCase();
    if (typ) return typ === "company";
    return String(me.role || "").toLowerCase() === "company";
  }

  /* ── Aufbau ──────────────────────────────────────────────────────────── */

  function stileEinmalig() {
    if (document.getElementById("tc-schnellstart-styles")) return;
    var s = document.createElement("style");
    s.id = "tc-schnellstart-styles";
    s.textContent = [
      ".tc-qs{border:1px solid var(--ds-border,#e2e8f0);border-left:3px solid var(--ds-brand,#4a9eff);",
      "background:var(--ds-bg-surface,var(--ds-surface,#fff));border-radius:10px;padding:14px 16px;margin:0 0 16px;",
      "font-size:.9rem;line-height:1.5}",
      ".tc-qs__head{display:flex;align-items:center;gap:8px;margin-bottom:10px}",
      ".tc-qs__badge{font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;font-weight:700;",
      "color:var(--ds-brand,#4a9eff);background:var(--ds-brand-muted,rgba(74,158,255,.12));padding:2px 8px;border-radius:999px}",
      ".tc-qs__frage{font-weight:600;margin:0}",
      ".tc-qs__spacer{flex:1}",
      ".tc-qs__x{background:none;border:none;cursor:pointer;color:var(--ds-text-secondary,#64748b);font-size:1rem;line-height:1;padding:2px 6px}",
      ".tc-qs__row{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}",
      ".tc-qs__btn{border:1px solid var(--ds-border,#e2e8f0);background:var(--ds-bg-surface,#fff);border-radius:8px;",
      "padding:7px 14px;font-size:.85rem;cursor:pointer;font-weight:600}",
      ".tc-qs__btn--ja{background:var(--ds-brand,#4a9eff);border-color:var(--ds-brand,#4a9eff);color:#fff}",
      ".tc-qs__btn--not{background:var(--ds-danger,#dc2626);border-color:var(--ds-danger,#dc2626);color:#fff}",
      ".tc-qs__btn--link{border:none;background:none;color:var(--ds-text-secondary,#64748b);font-weight:400;text-decoration:underline}",
      ".tc-qs__feld{display:flex;flex-direction:column;gap:3px}",
      ".tc-qs__feld label{font-size:.72rem;color:var(--ds-text-secondary,#64748b);font-weight:600}",
      ".tc-qs__feld input{border:1px solid var(--ds-border,#e2e8f0);border-radius:8px;padding:7px 10px;font-size:.85rem;",
      "background:var(--ds-bg-surface,#fff);color:inherit;min-width:150px}",
      ".tc-qs__not{background:var(--ds-danger-muted,rgba(220,38,38,.1));border-radius:8px;padding:8px 10px;",
      "margin-bottom:10px;font-size:.83rem}",
      ".tc-qs__not strong{color:var(--ds-danger,#dc2626)}",
      ".tc-qs-wieder{border:1px dashed var(--ds-border,#e2e8f0);background:none;border-radius:999px;",
      "padding:4px 12px;font-size:.75rem;color:var(--ds-text-secondary,#64748b);cursor:pointer;margin:0 0 12px}"
    ].join("");
    document.head.appendChild(s);
  }

  function einhaengen(el, konf) {
    for (var i = 0; i < konf.anker.length; i++) {
      var ziel = document.querySelector(konf.anker[i]);
      if (ziel && ziel.parentNode) { ziel.parentNode.insertBefore(el, ziel); return true; }
    }
    return false;
  }

  function bauen(konf) {
    stileEinmalig();
    var box = document.createElement("div");
    box.className = "tc-qs";
    box.id = "tc-schnellstart";
    var notdienst = false;

    function kopf(frage) {
      return '<div class="tc-qs__head"><span class="tc-qs__badge">' + esc(t("titel")) + "</span>" +
        '<p class="tc-qs__frage">' + esc(frage) + "</p><span class=\"tc-qs__spacer\"></span>" +
        '<button type="button" class="tc-qs__x" data-qs="zu" title="' + esc(t("schliessen")) + '" aria-label="' + esc(t("schliessen")) + '">&#10005;</button></div>';
    }

    function schrittEins() {
      box.innerHTML = kopf(t("frage1")) +
        '<div class="tc-qs__row">' +
        '<button type="button" class="tc-qs__btn tc-qs__btn--ja" data-qs="ja">' + esc(t("ja")) + "</button>" +
        '<button type="button" class="tc-qs__btn" data-qs="nein">' + esc(t("nein")) + "</button>" +
        "</div>";
    }

    function schrittZwei() {
      box.innerHTML = kopf(t("frage2")) +
        '<div class="tc-qs__row">' +
        '<button type="button" class="tc-qs__btn tc-qs__btn--not" data-qs="dringend">' + esc(t("ja48")) + "</button>" +
        '<button type="button" class="tc-qs__btn" data-qs="geplant">' + esc(t("nein48")) + "</button>" +
        '<button type="button" class="tc-qs__btn tc-qs__btn--link" data-qs="zurueck">' + esc(t("zurueck")) + "</button>" +
        "</div>";
    }

    function schrittDrei() {
      box.innerHTML = kopf(t("frage3")) +
        (notdienst
          ? '<div class="tc-qs__not"><strong>' + esc(t("notdienstTitel")) + "</strong> &middot; " + esc(t("notdienstText")) + "</div>"
          : "") +
        '<div class="tc-qs__row">' +
        '<div class="tc-qs__feld"><label for="qs-was">' + esc(t("wasLabel")) + "</label>" +
        '<input id="qs-was" type="text" placeholder="' + esc(t("wasPh")) + '" autocomplete="off"></div>' +
        '<div class="tc-qs__feld"><label for="qs-wo">' + esc(t("woLabel")) + "</label>" +
        '<input id="qs-wo" type="text" placeholder="' + esc(t("woPh")) + '" autocomplete="off"></div>' +
        '<div class="tc-qs__feld"><label for="qs-ab">' + esc(t("abLabel")) + "</label>" +
        '<input id="qs-ab" type="date" value="' + esc(heuteIso()) + '"></div>' +
        '<div class="tc-qs__feld"><label for="qs-anzahl">' + esc(t("anzahlLabel")) + "</label>" +
        '<input id="qs-anzahl" type="number" min="1" step="1" value="1"></div>' +
        '<button type="button" class="tc-qs__btn tc-qs__btn--ja" data-qs="los">' + esc(t("los")) + "</button>" +
        '<button type="button" class="tc-qs__btn tc-qs__btn--link" data-qs="nein">' + esc(t("ueberspringen")) + "</button>" +
        "</div>";
      var erstes = box.querySelector("#qs-was");
      if (erstes) erstes.focus();
    }

    function wert(id) {
      var el = box.querySelector(id);
      return el ? String(el.value || "").trim() : "";
    }

    function los() {
      var antworten = {
        was: wert("#qs-was"),
        wo: wert("#qs-wo"),
        ab: wert("#qs-ab"),
        anzahl: wert("#qs-anzahl")
      };
      merkeErledigt();
      if (konf.uebergabe === "adresse") {
        /* Der Feed liest seine Filter beim Start aus der Adresse
           (marketplaceFeed.js readUrlFilters) — die Uebergabe braucht deshalb
           keinen Eingriff in seine Filterlogik. */
        var p = new URLSearchParams(window.location.search);
        Object.keys(konf.parameter).forEach(function (frage) {
          if (antworten[frage]) p.set(konf.parameter[frage], antworten[frage]);
        });
        if (notdienst) p.set("availability_window", "immediate");
        window.location.search = p.toString();
        return;
      }
      if (typeof konf.vorbereiten === "function") konf.vorbereiten();
      /* REIHENFOLGE IST WICHTIG: erst das Sofort-Kennzeichen, dann die Felder.
       * Die "sofort"-Checkbox der Personalsuche setzt das Datumsfeld auf heute
       * UND deaktiviert es (setImmediateState, capacity_search.html:530-552).
       * Umgekehrt herum wuerde sie das gewaehlte "ab wann" ueberschreiben —
       * der Nutzer haette getippt und die Seite haette es weggeworfen. */
      if (notdienst && konf.sofortFeld) {
        var sofort = document.getElementById(konf.sofortFeld);
        if (sofort && "checked" in sofort) {
          sofort.checked = true;
          /* Das change-Ereignis gehoert dazu: an ihm haengt die Folgelogik
             (Datum setzen/sperren). Ohne es bliebe die Seite halb geschaltet. */
          sofort.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      Object.keys(konf.felder || {}).forEach(function (frage) {
        var el = document.getElementById(konf.felder[frage]);
        /* Ein deaktiviertes Feld nicht ueberschreiben: es steht unter der
           Hoheit der Seite (siehe Sofort-Kennzeichen oben). */
        if (el && !el.disabled && antworten[frage]) el.value = antworten[frage];
      });
      entfernen();
      if (typeof konf.ausloesen === "function") konf.ausloesen();
    }

    function entfernen() {
      var w = document.getElementById("tc-schnellstart-wieder");
      if (w) w.remove();
      box.remove();
      wiederKnopf(konf);
    }

    box.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-qs]") : null;
      if (!b) return;
      var was = b.getAttribute("data-qs");
      if (was === "ja") { schrittZwei(); return; }
      if (was === "zurueck") { schrittEins(); return; }
      if (was === "dringend") { notdienst = true; schrittDrei(); return; }
      if (was === "geplant") { notdienst = false; schrittDrei(); return; }
      if (was === "los") { los(); return; }
      if (was === "nein" || was === "zu") { merkeErledigt(); entfernen(); }
    });

    schrittEins();
    return box;
  }

  /** Der kleine Weg zurueck: einmal abgewiesen heisst nicht fuer immer weg. */
  function wiederKnopf(konf) {
    if (document.getElementById("tc-schnellstart-wieder")) return;
    stileEinmalig();
    var b = document.createElement("button");
    b.type = "button";
    b.id = "tc-schnellstart-wieder";
    b.className = "tc-qs-wieder";
    b.title = t("wiederTitel");
    b.textContent = "↺ " + t("wieder");
    b.addEventListener("click", function () {
      vergiss();
      b.remove();
      var box = bauen(konf);
      if (!einhaengen(box, konf)) document.body.appendChild(box);
    });
    einhaengen(b, konf);
  }

  function start() {
    var konf = flaeche();
    if (!konf) return;
    var unternehmen = istUnternehmen();
    if (unternehmen === false) return;      /* Agentur/Worker: nicht anzeigen */
    if (unternehmen === null) {             /* Kontext noch nicht da: warten */
      document.addEventListener("tc:shell-context", function einmal() {
        document.removeEventListener("tc:shell-context", einmal);
        start();
      });
      return;
    }
    if (erledigt()) { wiederKnopf(konf); return; }
    var box = bauen(konf);
    einhaengen(box, konf);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  /* Fuer Tests und die Konsole: der Einstieg laesst sich zuruecksetzen. */
  window.TCSchnellstart = { start: start, vergiss: vergiss, erledigt: erledigt };
})();
