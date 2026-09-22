/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TCKatalogFeld — ein bestehendes Rollen-/Taetigkeitsfeld an den Katalog haengen
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WARUM ES DIESE DATEI GIBT (Welle N8.1)
 *
 * Owner: "Freitext fuer Suche durch Checkboxen mit Katalogeintraegen ersetzen,
 * damit Matching funktioniert." Gemessen am 2026-09-21 gegen die laufende
 * Datenbank: der Katalog fuehrt 162 aktive Eintraege, im Markt stehen 44
 * verschiedene Rollen — und 19 davon treffen den Katalog NIE. Darunter
 * "Bauhelfer" (der Katalog kennt "Bauhelfer:in"), "Lagerhelfer", "lager",
 * "helfer", "spezial", "KI", "ljoj" und "IJF)IE". Solange eine Marktseite
 * Freitext nimmt, KANN das Matching dort nicht treffen — das ist keine Frage
 * der Rangformel, sondern des Vokabulars.
 *
 * WAS ES NICHT IST: ein zweiter Waehler. Die Auswahl selbst macht
 * `js/skillPicker.js` — derselbe Katalog, dieselben Aliase, derselbe gefuehrte
 * Ausweg fuer unbekannte Begriffe (`POST /skills/propose`). Diese Datei
 * VERBINDET ihn nur mit einem Feld, das es schon gibt.
 *
 * WARUM DAS FELD BLEIBT, WIE ES IST: `loadFeed()` liest
 * `document.getElementById("ff-role").value`, der Filter-Speicher schreibt ihn
 * zurueck, die Treffer-Vorschau hoert auf `change`. Ein Bauteil, das dieses
 * Feld ERSETZT, muesste all das nachbauen. Es bleibt also die Quelle der
 * Wahrheit; der Waehler schreibt hinein und meldet es per `change`-Ereignis.
 *
 * ALTE LINKS BRECHEN NICHT (N8.1c). Ein `?role=pflege` aus einer Mail von
 * vorletzter Woche wird beim Laden gegen den Katalog gehalten:
 *
 *   exakt / Alias        -> kanonischer Begriff wird uebernommen, sichtbar
 *   ein Praefix-Treffer  -> ebenso ("bauhel" -> "Bauhelfer:in")
 *   mehrere Treffer      -> der Waehler oeffnet mit vorbelegter Suche
 *   kein Treffer         -> der Text BLEIBT als Filter stehen und wird als
 *                           "nicht im Katalog" gekennzeichnet
 *
 * Der letzte Fall ist der wichtige: ein Link, der ploetzlich nichts mehr
 * findet, ist schlimmer als einer, der ehrlich sagt, warum er wenig findet.
 *
 * ── EINBINDUNG ──────────────────────────────────────────────────────────
 *
 *   <script src="/public/js/skillPicker.js"></script>
 *   <script src="/public/js/katalogFeld.js"></script>
 *   TCKatalogFeld.binde({ input: "ff-role", onPick: function (name) {} });
 */
(function (global) {
  "use strict";

  var katalogVersprechen = null;

  function t(schluessel, ersatz) {
    try {
      if (global.TCi18n && typeof TCi18n.t === "function") {
        var v = TCi18n.t(schluessel);
        if (v && v !== schluessel) return v;
      }
    } catch (e) { /* ohne Uebersetzung: der Ersatztext */ }
    return ersatz;
  }

  /** Vergleichsform: Gross/Klein, Bindestriche und das generische ":in" weg. */
  function schluessel(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/:in\b/g, "")
      .replace(/[\s\-_/]+/g, "")
      .replace(/[äöüß]/g, function (c) { return { "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss" }[c]; })
      .trim();
  }

  function katalogHolen() {
    if (katalogVersprechen) return katalogVersprechen;
    katalogVersprechen = fetch("/api/skills/catalog", { credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : { categories: [] }; })
      .then(function (d) {
        var flach = [];
        (d && d.categories ? d.categories : []).forEach(function (k) {
          (k.skills || k.items || []).forEach(function (s) {
            flach.push({ name: s.name || s, aliases: s.aliases || [] });
          });
        });
        return flach;
      })
      .catch(function () { return []; });
    return katalogVersprechen;
  }

  /**
   * Einen eingehenden Freitext gegen den Katalog halten.
   * @returns {{art: string, name: (string|null), kandidaten: string[]}}
   */
  function aufloesen(text, flach) {
    var roh = String(text || "").trim();
    if (!roh) return { art: "leer", name: null, kandidaten: [] };
    if (!flach || !flach.length) return { art: "kein-katalog", name: roh, kandidaten: [] };

    var k = schluessel(roh);

    for (var i = 0; i < flach.length; i++) {
      if (schluessel(flach[i].name) === k) return { art: "exakt", name: flach[i].name, kandidaten: [] };
    }
    for (var j = 0; j < flach.length; j++) {
      var treffer = (flach[j].aliases || []).some(function (a) { return schluessel(a) === k; });
      if (treffer) return { art: "alias", name: flach[j].name, kandidaten: [] };
    }

    var praefix = flach.filter(function (s) {
      if (schluessel(s.name).indexOf(k) === 0) return true;
      return (s.aliases || []).some(function (a) { return schluessel(a).indexOf(k) === 0; });
    }).map(function (s) { return s.name; });

    if (praefix.length === 1) return { art: "praefix", name: praefix[0], kandidaten: [] };
    if (praefix.length > 1) return { art: "mehrdeutig", name: null, kandidaten: praefix };
    return { art: "unbekannt", name: roh, kandidaten: [] };
  }

  function stilEinmal() {
    if (document.getElementById("tc-katalogfeld-styles")) return;
    var s = document.createElement("style");
    s.id = "tc-katalogfeld-styles";
    s.textContent = [
      ".tc-kf{position:relative;display:inline-block}",
      ".tc-kf__knopf{margin-left:6px;border:1px solid var(--ds-border,#e2e8f0);background:var(--ds-bg-surface,#fff);",
      "border-radius:8px;padding:6px 10px;font-size:.8rem;cursor:pointer;color:inherit}",
      ".tc-kf__pop{position:absolute;z-index:60;top:calc(100% + 6px);left:0;min-width:320px;max-width:min(560px,90vw);",
      "max-height:60vh;overflow:auto;background:var(--ds-bg-surface,#fff);border:1px solid var(--ds-border,#e2e8f0);",
      "border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.14);padding:12px}",
      ".tc-kf__pop[hidden]{display:none}",
      ".tc-kf__hinweis{font-size:.75rem;margin-top:4px;color:var(--ds-text-secondary,#64748b)}",
      ".tc-kf__hinweis--frei{color:var(--ds-warning,#b45309)}"
    ].join("");
    document.head.appendChild(s);
  }

  /**
   * @param {{input: (string|HTMLElement), onPick?: function, showAvailability?: boolean,
   *          city?: (string|null)}} opt
   */
  function binde(opt) {
    var feld = typeof opt.input === "string" ? document.getElementById(opt.input) : opt.input;
    if (!feld || feld.dataset.tcKatalog === "1") return null;
    if (!global.TCSkillPicker) return null;
    stilEinmal();

    feld.dataset.tcKatalog = "1";
    feld.setAttribute("autocomplete", "off");

    var huelle = document.createElement("span");
    huelle.className = "tc-kf";
    feld.parentNode.insertBefore(huelle, feld);
    huelle.appendChild(feld);

    var knopf = document.createElement("button");
    knopf.type = "button";
    knopf.className = "tc-kf__knopf";
    knopf.setAttribute("aria-expanded", "false");
    knopf.textContent = t("kf.choose", "Aus Katalog");
    huelle.appendChild(knopf);

    var pop = document.createElement("div");
    pop.className = "tc-kf__pop";
    pop.hidden = true;
    var halter = document.createElement("div");
    halter.id = "tc-kf-halter-" + (feld.id || Math.floor(Date.now() % 100000));
    pop.appendChild(halter);
    huelle.appendChild(pop);

    var hinweis = document.createElement("div");
    hinweis.className = "tc-kf__hinweis";
    huelle.appendChild(hinweis);

    var waehler = null;

    function meldung(text, frei) {
      hinweis.textContent = text || "";
      hinweis.className = "tc-kf__hinweis" + (frei ? " tc-kf__hinweis--frei" : "");
    }

    function oeffnen(vorbelegung) {
      pop.hidden = false;
      knopf.setAttribute("aria-expanded", "true");
      if (!waehler) {
        waehler = TCSkillPicker.mount({
          container: halter,
          hiddenInput: feld,
          einzeln: true,
          initial: [],
          showAvailability: opt.showAvailability !== false,
          city: opt.city || null,
          onPick: function (name) {
            schliessen();
            meldung("", false);
            if (typeof opt.onPick === "function") opt.onPick(name);
          }
        });
      }
      if (vorbelegung) {
        var suchfeld = halter.querySelector("[data-skp-suche]");
        if (suchfeld) {
          suchfeld.value = vorbelegung;
          try { suchfeld.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) { /* alt */ }
          suchfeld.focus();
        }
      }
    }

    function schliessen() {
      pop.hidden = true;
      knopf.setAttribute("aria-expanded", "false");
    }

    knopf.addEventListener("click", function () {
      if (pop.hidden) oeffnen(String(feld.value || "").trim());
      else schliessen();
    });

    document.addEventListener("click", function (e) {
      if (!pop.hidden && !huelle.contains(e.target)) schliessen();
    });
    feld.addEventListener("keydown", function (e) {
      if (e.key === "Escape") schliessen();
    });

    /* Tippen bleibt moeglich — aber es ist eine Suche IM Katalog (N8.1b). */
    var tippZeit = null;
    feld.addEventListener("input", function () {
      if (tippZeit) clearTimeout(tippZeit);
      tippZeit = setTimeout(function () {
        var roh = String(feld.value || "").trim();
        if (roh.length < 2) { meldung("", false); return; }
        katalogHolen().then(function (flach) {
          var r = aufloesen(roh, flach);
          if (r.art === "exakt" || r.art === "alias" || r.art === "praefix") {
            if (r.name !== roh) meldung(t("kf.meant", "Gemeint ist: ") + r.name, false);
            else meldung("", false);
          } else if (r.art === "mehrdeutig") {
            meldung(r.kandidaten.length + " " + t("kf.several", "Treffer im Katalog — bitte waehlen"), false);
          } else if (r.art === "unbekannt") {
            meldung(t("kf.unknown", "Nicht im Katalog — die Suche findet damit wenig"), true);
          }
        });
      }, 250);
    });

    /**
     * Einen von aussen gesetzten Wert (Link, Filter-Speicher) aufloesen.
     * Gibt das Ergebnis zurueck, damit der Aufrufer es pruefen kann.
     */
    function uebernehmen(text) {
      return katalogHolen().then(function (flach) {
        var r = aufloesen(text, flach);
        if (r.art === "exakt" || r.art === "alias" || r.art === "praefix") {
          if (r.name !== text) {
            feld.value = r.name;
            try { feld.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) { /* alt */ }
            meldung(t("kf.adopted", "Aus dem Katalog uebernommen: ") + r.name, false);
          }
        } else if (r.art === "mehrdeutig") {
          meldung(r.kandidaten.length + " " + t("kf.several", "Treffer im Katalog — bitte waehlen"), false);
          oeffnen(text);
        } else if (r.art === "unbekannt") {
          /* NICHT loeschen: der Link soll weiter etwas liefern, und der Nutzer
             soll sehen, warum es wenig ist. */
          meldung(t("kf.unknown", "Nicht im Katalog — die Suche findet damit wenig"), true);
        }
        return r;
      });
    }

    var start = String(feld.value || "").trim();
    if (start) uebernehmen(start);

    /*
     * Der Griff haengt AM FELD, nicht nur am Rueckgabewert. Wer den Wert
     * spaeter per Skript setzt (ein Modal, das eine Rolle uebernimmt), loest
     * damit KEIN Ereignis aus — dieses Bauteil wuerde es also nie erfahren.
     * Ueber `feld.tcKatalog.uebernehmen(wert)` kann jede Stelle die Aufloesung
     * anstossen, ohne den Griff durchreichen zu muessen.
     */
    var griff = { oeffnen: oeffnen, schliessen: schliessen, uebernehmen: uebernehmen, feld: feld };
    feld.tcKatalog = griff;
    return griff;
  }

  global.TCKatalogFeld = { binde: binde, _aufloesen: aufloesen, _schluessel: schluessel };
})(window);
