/**
 * Der Fähigkeiten-Wähler — eine gemeinsame Achse für beide Marktseiten.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM ES IHN GIBT (Welle N1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Beide Seiten des Marktplatzes tippten Fähigkeiten als FREITEXT ein:
 * `marketplace_demand_create.html` ("Skills (kommagetrennt)") und
 * `capacity_exchange_form.html` ebenso. Was dabei entsteht, ist keine gemeinsame
 * Achse, sondern ein Haufen Schreibvarianten: „Stapler", „stapler",
 * „Gabelstapler", „Staplerschein", „Gabelstaplerfahrer". Nichts davon findet
 * einander, und niemand sieht, warum die Suche leer bleibt.
 *
 * Der Katalog dagegen existiert seit Migration 145 — 162 Fähigkeiten in 14
 * Kategorien, MIT Schreibvarianten in `aliases`. Er war nur auf keiner der
 * beiden Seiten erreichbar.
 *
 * ── DREI ENTSCHEIDUNGEN ─────────────────────────────────────────────────
 *
 * DER KATALOG AUS DEM BACKEND, NICHT AUS DEM BROWSER. `mitarbeiter.js` trägt
 * eine eigene, fest verdrahtete Liste (12 Gruppen, 142 Fähigkeiten, ohne
 * Aliase). Sie ist eine zweite Wahrheit neben `platform_skills` und wird
 * getrennt behandelt — dieser Wähler liest ausschließlich `/skills/catalog`.
 *
 * WER SEINEN BEGRIFF NICHT FINDET, WIRD GEFÜHRT — NICHT ABGEWIESEN. Ein Feld,
 * das „gibt es nicht" sagt und sonst nichts, ist schlimmer als Freitext: der
 * Nutzer weiß nicht, was er stattdessen tun soll. `POST /skills/propose` kennt
 * die Schreibvarianten und antwortet mit dem kanonischen Begriff; nur wenn es
 * wirklich neu ist, entsteht ein Vorschlag zur Prüfung — und dann sagen wir das
 * auch und bieten die nächstliegenden vorhandenen Begriffe an.
 *
 * DIE ZAHL STEHT VOR DER ENTSCHEIDUNG, NICHT DANACH. Neben jeder Fähigkeit
 * steht, wie viele Kräfte sie mitbringen (`/capacity-discovery/by-skill`). Wer
 * „Pick-by-Voice: 0" sieht, wählt etwas anderes — bevor er eine Ausschreibung
 * schreibt, auf die sich niemand meldet.
 *
 * ── EINBINDUNG ──────────────────────────────────────────────────────────
 *
 *   <script src="/public/js/skillPicker.js"></script>
 *   TCSkillPicker.mount({
 *     container: "meinDiv",        // Element oder Kennung
 *     hiddenInput: "skill_tags",   // bestehendes Feld: bleibt die Quelle für das Formular
 *     initial: ["Stapler"],
 *     showAvailability: true,      // Bestandszahlen holen
 *     city: "Münster",             // optional, engt die Zahlen ein
 *     onChange: function (skills) {}
 *   });
 *
 * Der Wähler SCHREIBT die Auswahl kommagetrennt in `hiddenInput` zurück. Damit
 * bleibt jeder bestehende Formular-Code unverändert gültig — er liest weiter
 * dasselbe Feld.
 */
(function (global) {
  "use strict";

  /*
   * DAS STILBLATT KOMMT MIT. Die beiden Zielseiten laden `enterprise.css`,
   * andere `design-system.css` — ein Bauteil, das seine Gestalt aus einer
   * bestimmten Datei bezieht, ist genau dort einsetzbar, wo diese Datei liegt,
   * und nirgends sonst. Hier reicht EIN Script-Tag; die Farben kommen aus den
   * Merkmalen des Design-Systems, mit Rueckfall fuer Seiten, die sie nicht
   * kennen. Genau die Bauart, die sich in die naechsten Projekte mitnehmen
   * laesst.
   */
  var STIL = [
    ".skp-gewaehlt{display:flex;flex-wrap:wrap;gap:6px;min-height:30px;align-items:center;margin-bottom:8px}",
    ".skp-leer{font-size:12px;color:var(--ds-text-secondary,#8d9bba)}",
    ".skp-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:999px;",
    "  background:var(--ds-brand-soft,rgba(74,158,255,.12));color:var(--ds-brand,#4a9eff);font-size:12px;font-weight:700}",
    ".skp-chip__weg{border:none;background:none;color:inherit;cursor:pointer;font-size:15px;line-height:1;padding:0}",
    ".skp-suchzeile{margin-bottom:8px}",
    ".skp-suche{width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid var(--ds-border,#2a3550);",
    "  border-radius:var(--ds-radius-md,8px);background:var(--ds-bg,transparent);color:inherit;font:inherit}",
    ".skp-gruppe{margin-bottom:10px}",
    ".skp-gruppe__titel{font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;",
    "  color:var(--ds-text-secondary,#8d9bba);margin-bottom:5px}",
    ".skp-gruppe__zahl{font-weight:600;opacity:.7}",
    ".skp-raster{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:4px}",
    ".skp-option{display:flex;align-items:center;gap:7px;padding:5px 8px;border:1px solid transparent;",
    "  border-radius:var(--ds-radius-md,8px);font-size:13px;cursor:pointer}",
    ".skp-option:hover{background:var(--ds-bg-surface,rgba(255,255,255,.03))}",
    ".skp-option--an{border-color:var(--ds-brand,#4a9eff)}",
    ".skp-option span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".skp-zahl{font-size:11px;font-weight:800;font-variant-numeric:tabular-nums;padding:1px 6px;border-radius:999px}",
    ".skp-zahl--da{background:var(--ds-success-soft,rgba(52,211,153,.14));color:var(--ds-success,#34d399)}",
    ".skp-zahl--leer{background:transparent;color:var(--ds-text-secondary,#8d9bba);opacity:.65}",
    ".skp-zustand{padding:12px;border:1px dashed var(--ds-border,#2a3550);border-radius:var(--ds-radius-md,8px);",
    "  font-size:13px;color:var(--ds-text-secondary,#8d9bba)}",
    ".skp-zustand--fehler{color:var(--ds-danger,#f87171);border-color:var(--ds-danger,#f87171)}",
    ".skp-nahe{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}",
    ".skp-knopf{padding:4px 10px;border:1px solid var(--ds-border,#2a3550);border-radius:999px;",
    "  background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}",
    ".skp-knopf--haupt{border-color:var(--ds-brand,#4a9eff);color:var(--ds-brand,#4a9eff);font-weight:700}",
    ".skp-meldung{margin:6px 0;font-size:12px;line-height:1.5}",
    ".skp-meldung--gut{color:var(--ds-success,#34d399)}",
    ".skp-meldung--hinweis{color:var(--ds-warning,#f59e0b)}",
    ".skp-meldung--fehler{color:var(--ds-danger,#f87171)}",
    ".skp-meldung--warte{color:var(--ds-text-secondary,#8d9bba)}"
  ].join("");

  function stilEinmal() {
    if (document.getElementById("tc-skillpicker-stil")) return;
    var el = document.createElement("style");
    el.id = "tc-skillpicker-stil";
    el.textContent = STIL;
    document.head.appendChild(el);
  }

  /* Der Katalog ändert sich selten und gilt plattformweit: einmal holen,
     alle Instanzen teilen sich ihn. Das Versprechen wird geteilt, nicht das
     Ergebnis — sonst holen zwei Wähler auf derselben Seite ihn zweimal. */
  var katalogVersprechen = null;

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function t(schluessel, ersatz) {
    var s = (global.TCi18n && typeof global.TCi18n.t === "function") ? global.TCi18n.t(schluessel) : "";
    return s || ersatz;
  }

  function hole(pfad) {
    return fetch("/api" + pfad, { credentials: "include" }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) {
          var e = new Error((d && (d.message || d.error)) || "API_ERROR");
          e.code = (d && d.error) || String(r.status);
          throw e;
        }
        return d;
      });
    });
  }

  function csrf() {
    return fetch("/api/csrf", { credentials: "include" })
      .then(function (r) { return r.json(); })
      .then(function (d) { return (d && (d.csrfToken || d.token)) || ""; })
      .catch(function () { return ""; });
  }

  function katalogHolen() {
    if (!katalogVersprechen) katalogVersprechen = hole("/skills/catalog");
    return katalogVersprechen;
  }

  /** Normalisiert für Vergleiche — nicht für die Anzeige. */
  function schluessel(s) {
    return String(s || "").trim().toLowerCase();
  }

  /**
   * Wie ähnlich sind sich zwei Begriffe? Absichtlich einfach: gemeinsame
   * Wortanfänge und Teilzeichenketten. Eine echte Distanzfunktion wäre hier
   * Aufwand ohne Gewinn — die Aliase im Katalog leisten die eigentliche Arbeit,
   * das hier ist nur der Rettungsanker für den Fall, dass auch die nicht greifen.
   */
  function aehnlichkeit(a, b) {
    var x = schluessel(a), y = schluessel(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    if (y.indexOf(x) >= 0 || x.indexOf(y) >= 0) return 0.8;
    var xs = x.split(/[^a-zäöüß0-9]+/).filter(Boolean);
    var ys = y.split(/[^a-zäöüß0-9]+/).filter(Boolean);
    var treffer = 0;
    xs.forEach(function (w) {
      if (w.length < 4) return;
      ys.forEach(function (v) {
        if (v.length < 4) return;
        if (v.indexOf(w) === 0 || w.indexOf(v) === 0) treffer++;
      });
    });
    return treffer ? Math.min(0.7, 0.35 * treffer) : 0;
  }

  /* ── Eine Instanz ────────────────────────────────────────────────────── */

  function mount(opt) {
    var wurzel = typeof opt.container === "string"
      ? document.getElementById(opt.container) : opt.container;
    if (!wurzel) return null;

    var feld = typeof opt.hiddenInput === "string"
      ? document.getElementById(opt.hiddenInput) : (opt.hiddenInput || null);

    var gewaehlt = [];
    var katalog = null;          // { categories: [...] }
    var flach = [];              // [{name, category, aliases}]
    var bestand = {};            // { schluessel(name): anzahl }
    var suche = "";
    var meldung = null;          // { art, text }

    /* Vorbelegung: nur Begriffe, die der Katalog kennt. Ein alter Freitext-Wert
       darf nicht durch die Hintertür wieder zur Auswahl werden — sonst hätte
       die ganze Welle nichts geändert. Was wegfällt, wird GEZEIGT, nicht
       verschwiegen. */
    var mitgebracht = Array.isArray(opt.initial) ? opt.initial.slice() : [];
    var verworfen = [];

    function schreibeZurueck() {
      if (feld) feld.value = gewaehlt.join(", ");
      if (typeof opt.onChange === "function") opt.onChange(gewaehlt.slice());
    }

    function istGewaehlt(name) {
      return gewaehlt.some(function (g) { return schluessel(g) === schluessel(name); });
    }

    function umschalten(name) {
      if (istGewaehlt(name)) {
        gewaehlt = gewaehlt.filter(function (g) { return schluessel(g) !== schluessel(name); });
      } else {
        gewaehlt.push(name);
      }
      schreibeZurueck();
      zeichnen();
    }

    /* ── Bestandszahlen ─────────────────────────────────────────────── */

    /*
     * IN PORTIONEN, und zwar aus einem Grund, der beim ersten Bauen fast
     * durchgerutscht wäre: die Route nimmt höchstens 100 Fähigkeiten je
     * Anfrage entgegen (bewusst — eine Anfrage mit zehntausend Begriffen ist
     * keine Oberfläche, sondern eine Last). Der Katalog trägt 162.
     *
     * Wer alle 162 auf einmal schickt, bekommt Zahlen für 100 — und die
     * übrigen 62 stünden hier mit einer 0 da. Eine 0 sieht aus wie eine
     * Antwort („niemand verfügbar") und wäre in Wahrheit „nie gefragt". Genau
     * die Sorte stiller Falschaussage, gegen die die Zahl überhaupt gebaut ist.
     *
     * Also portionsweise, und die 0 nur für Namen, nach denen wirklich gefragt
     * wurde.
     */
    var PORTION = 100;

    function bestandHolen(namen) {
      if (!opt.showAvailability || !namen.length) return Promise.resolve();
      var teile = [];
      for (var i = 0; i < namen.length; i += PORTION) teile.push(namen.slice(i, i + PORTION));

      return Promise.all(teile.map(function (teil) {
        var qs = "?skills=" + encodeURIComponent(teil.join(","));
        if (opt.city) qs += "&city=" + encodeURIComponent(opt.city);
        return hole("/capacity-discovery/by-skill" + qs).then(function (d) {
          (d.items || []).forEach(function (z) { bestand[schluessel(z.skill)] = z.total_headcount; });
          /* Nur für DIESE Portion: was nicht zurückkam, hat wirklich niemanden. */
          teil.forEach(function (n) {
            if (bestand[schluessel(n)] === undefined) bestand[schluessel(n)] = 0;
          });
        }).catch(function () {
          /* Eine ausgefallene Portion bleibt OHNE Zahl statt mit einer 0 —
             „unbekannt" ist ehrlicher als „niemand". */
        });
      })).then(function () {});
    }

    /* ── Der eigene Begriff ─────────────────────────────────────────── */

    function vorschlagen(text) {
      var name = String(text || "").trim();
      if (name.length < 2) return;
      meldung = { art: "warte", text: t("skp.checking", "Wird geprüft …") };
      zeichnen();

      csrf().then(function (token) {
        return fetch("/api/skills/propose", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
          body: JSON.stringify({ name: name })
        }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (d) {
            if (!r.ok) { var e = new Error((d && d.error) || "API_ERROR"); e.code = d && d.error; throw e; }
            return d;
          });
        });
      }).then(function (res) {
        if (res.matched && res.skill && res.skill.name) {
          /*
           * DER FALL, FÜR DEN DIE ALIASE DA SIND. „Gabelstaplerfahrer" führt zu
           * „Staplerfahrer" — und zwar sichtbar, damit beim nächsten Mal klar
           * ist, wie die Plattform es nennt.
           */
          if (!istGewaehlt(res.skill.name)) gewaehlt.push(res.skill.name);
          schreibeZurueck();
          meldung = {
            art: "gut",
            text: t("skp.mappedPrefix", "Bei uns heisst das") + " \u201e" + res.skill.name + "\u201c" +
                  (res.matched_on === "alias"
                    ? " (" + t("skp.mappedAlias", "bekannte Schreibvariante") + ")"
                    : "") + " — " + t("skp.mappedAdded", "übernommen.")
          };
          suche = "";
          var feldSuche = wurzel.querySelector("[data-skp-suche]");
          if (feldSuche) feldSuche.value = "";
        } else {
          /*
           * WIRKLICH NEU. Der Vorschlag geht in die Prüfung und taucht NICHT im
           * Katalog auf (`status='proposed'`, und `/skills/catalog` liefert nur
           * `approved`). Ihn hier trotzdem auswählbar zu machen, wäre Freitext
           * durch die Hintertür — und er würde beim Matching nichts finden.
           *
           * Also: sagen, was passiert ist, und die nächstliegenden vorhandenen
           * Begriffe anbieten. Das ist der Unterschied zwischen führen und
           * abweisen.
           */
          meldung = { art: "hinweis", text: t("skp.proposed",
            "Der Begriff ist neu und geht in die Prüfung. Bis dahin findet die Suche darüber nichts — bitte wählen Sie einen vorhandenen Begriff.") };
        }
        zeichnen();
      }).catch(function (e) {
        meldung = { art: "fehler", text: e.code === "INVALID_SKILL_NAME"
          ? t("skp.invalid", "Dieser Begriff ist zu kurz oder enthält unerlaubte Zeichen.")
          : t("skp.proposeFailed", "Der Vorschlag konnte nicht übermittelt werden.") };
        zeichnen();
      });
    }

    /* ── Zeichnen ───────────────────────────────────────────────────── */

    function sichtbare() {
      var q = schluessel(suche);
      if (!q) return flach;
      return flach.filter(function (s) {
        if (schluessel(s.name).indexOf(q) >= 0) return true;
        /* Die Suche läuft ÜBER DIE ALIASE mit: wer „Gabelstapler" tippt, soll
           „Stapler" schon in der Liste finden und gar nicht erst vorschlagen. */
        return (s.aliases || []).some(function (a) { return schluessel(a).indexOf(q) >= 0; });
      });
    }

    function bestandsMarke(name) {
      if (!opt.showAvailability) return "";
      var n = bestand[schluessel(name)];
      if (n === undefined) return "";
      var klasse = n > 0 ? "skp-zahl skp-zahl--da" : "skp-zahl skp-zahl--leer";
      var titel = n > 0
        ? t("skp.availableTitle", "verfügbare Kräfte mit dieser Fähigkeit")
        : t("skp.noneTitle", "derzeit niemand mit dieser Fähigkeit verfügbar");
      return '<span class="' + klasse + '" title="' + esc(titel) + '">' + esc(n) + "</span>";
    }

    function zeichnen() {
      var liste = sichtbare();
      var html = "";

      /* 1. Die Auswahl, immer oben und immer sichtbar. */
      html += '<div class="skp-gewaehlt">';
      if (!gewaehlt.length) {
        html += '<span class="skp-leer">' + esc(t("skp.nothingChosen", "Noch nichts gewählt.")) + "</span>";
      } else {
        html += gewaehlt.map(function (g) {
          return '<span class="skp-chip">' + esc(g)
            + '<button type="button" class="skp-chip__weg" data-skp-weg="' + esc(g) + '" aria-label="'
            + esc(t("skp.remove", "Entfernen")) + '">&times;</button></span>';
        }).join("");
      }
      html += "</div>";

      if (verworfen.length) {
        /* Kein stilles Verschlucken: wer eine Ausschreibung bearbeitet, in der
           alte Freitext-Begriffe standen, muss sehen, dass sie weg sind. */
        html += '<div class="skp-meldung skp-meldung--hinweis">'
          + esc(t("skp.droppedPrefix", "Nicht im Katalog und deshalb entfernt:")) + " "
          + esc(verworfen.join(", ")) + "</div>";
      }

      /* 2. Suchen. */
      html += '<div class="skp-suchzeile">'
        + '<input type="text" class="skp-suche" data-skp-suche autocomplete="off" placeholder="'
        + esc(t("skp.searchPh", "Fähigkeit suchen …")) + '" value="' + esc(suche) + '"/>'
        + "</div>";

      if (meldung) {
        html += '<div class="skp-meldung skp-meldung--' + esc(meldung.art) + '">' + esc(meldung.text) + "</div>";
      }

      /* 3. Treffer — oder der geführte Ausweg. */
      if (!katalog) {
        html += '<div class="skp-zustand">' + esc(t("skp.loading", "Katalog wird geladen …")) + "</div>";
      } else if (!flach.length) {
        html += '<div class="skp-zustand skp-zustand--fehler">'
          + esc(t("skp.catalogEmpty", "Der Fähigkeitskatalog ist nicht erreichbar."))
          + ' <button type="button" class="skp-knopf" data-skp-neu>'
          + esc(t("skp.retry", "Erneut versuchen")) + "</button></div>";
      } else if (!liste.length) {
        var nahe = flach.map(function (s) { return { name: s.name, w: aehnlichkeit(suche, s.name) }; })
          .filter(function (x) { return x.w > 0; })
          .sort(function (a, b) { return b.w - a.w; })
          .slice(0, 5);
        html += '<div class="skp-zustand">'
          + esc(t("skp.noHitPrefix", "Kein Treffer fuer")) + " \u201e" + esc(suche) + "\u201c.";
        if (nahe.length) {
          html += '<div class="skp-nahe">' + esc(t("skp.didYouMean", "Meinten Sie:")) + " "
            + nahe.map(function (x) {
                return '<button type="button" class="skp-knopf" data-skp-waehle="' + esc(x.name) + '">'
                  + esc(x.name) + "</button>";
              }).join(" ") + "</div>";
        }
        html += '<div class="skp-nahe"><button type="button" class="skp-knopf skp-knopf--haupt" data-skp-vorschlag="'
          + esc(suche) + '">\u201e' + esc(suche) + '\u201c ' + esc(t("skp.propose", "pruefen lassen")) + "</button></div>";
        html += "</div>";
      } else {
        var nachKat = {};
        liste.forEach(function (s) {
          var k = s.category || t("skp.uncategorised", "Ohne Kategorie");
          (nachKat[k] = nachKat[k] || []).push(s);
        });
        html += Object.keys(nachKat).map(function (kat) {
          return '<div class="skp-gruppe"><div class="skp-gruppe__titel">' + esc(kat)
            + ' <span class="skp-gruppe__zahl">' + esc(nachKat[kat].length) + "</span></div>"
            + '<div class="skp-raster">'
            + nachKat[kat].map(function (s) {
                return '<label class="skp-option' + (istGewaehlt(s.name) ? " skp-option--an" : "") + '">'
                  + '<input type="checkbox" data-skp-um="' + esc(s.name) + '"'
                  + (istGewaehlt(s.name) ? " checked" : "") + "/>"
                  + "<span>" + esc(s.name) + "</span>" + bestandsMarke(s.name)
                  + "</label>";
              }).join("")
            + "</div></div>";
        }).join("");
      }

      wurzel.innerHTML = html;
      var sf = wurzel.querySelector("[data-skp-suche]");
      if (sf && document.activeElement !== sf && suche) {
        sf.focus();
        sf.setSelectionRange(sf.value.length, sf.value.length);
      }
    }

    /* ── Ereignisse, delegiert ──────────────────────────────────────── */

    wurzel.addEventListener("click", function (ev) {
      var um = ev.target.closest && ev.target.closest("[data-skp-um]");
      if (um) { umschalten(um.getAttribute("data-skp-um")); return; }

      var weg = ev.target.closest && ev.target.closest("[data-skp-weg]");
      if (weg) { ev.preventDefault(); umschalten(weg.getAttribute("data-skp-weg")); return; }

      var waehle = ev.target.closest && ev.target.closest("[data-skp-waehle]");
      if (waehle) {
        ev.preventDefault();
        var n = waehle.getAttribute("data-skp-waehle");
        if (!istGewaehlt(n)) { gewaehlt.push(n); schreibeZurueck(); }
        suche = ""; meldung = null; zeichnen();
        return;
      }

      var vor = ev.target.closest && ev.target.closest("[data-skp-vorschlag]");
      if (vor) { ev.preventDefault(); vorschlagen(vor.getAttribute("data-skp-vorschlag")); return; }

      var neu = ev.target.closest && ev.target.closest("[data-skp-neu]");
      if (neu) { ev.preventDefault(); katalogVersprechen = null; laden(); }
    });

    wurzel.addEventListener("input", function (ev) {
      if (!ev.target.matches || !ev.target.matches("[data-skp-suche]")) return;
      suche = ev.target.value;
      meldung = null;
      zeichnen();
    });

    /* Die Eingabetaste im Suchfeld darf das FORMULAR nicht abschicken —
       sie gehört dem Wähler. */
    wurzel.addEventListener("keydown", function (ev) {
      if (!ev.target.matches || !ev.target.matches("[data-skp-suche]")) return;
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      var liste = sichtbare();
      if (liste.length === 1) { umschalten(liste[0].name); suche = ""; zeichnen(); }
      else if (!liste.length && suche.trim().length >= 2) vorschlagen(suche);
    });

    /* ── Laden ──────────────────────────────────────────────────────── */

    function laden() {
      zeichnen();
      return katalogHolen().then(function (k) {
        katalog = k || {};
        flach = [];
        (katalog.categories || []).forEach(function (c) {
          (c.skills || []).forEach(function (s) {
            flach.push({ name: s.name, category: c.category, aliases: s.aliases || [] });
          });
        });

        /*
         * Erst jetzt lässt sich sagen, was von der Vorbelegung im Katalog steht.
         *
         * ÜBER DIE ALIASE MIT — der Punkt, den erst ein Lauf gegen die ECHTEN
         * Katalogdaten gezeigt hat. Kanonisch heißt es „Staplerfahrer:in"; in
         * alten Anzeigen steht aber „Gabelstaplerfahrer", und genau das ist ein
         * hinterlegter Alias. Ihn beim Bearbeiten wegzuwerfen wäre absurd: die
         * Plattform weiß, was gemeint ist, und würde die Fähigkeit trotzdem
         * verlieren. Die Suche im Wähler kennt die Aliase längst; die
         * Vorbelegung tat es nicht.
         *
         * Die Namen gewinnen: ein Alias darf einen echten Katalognamen nie
         * überschreiben, falls beides kollidiert.
         */
        var bekannt = {};
        flach.forEach(function (s) {
          (s.aliases || []).forEach(function (a) {
            if (bekannt[schluessel(a)] === undefined) bekannt[schluessel(a)] = s.name;
          });
        });
        flach.forEach(function (s) { bekannt[schluessel(s.name)] = s.name; });
        mitgebracht.forEach(function (m) {
          var kanon = bekannt[schluessel(m)];
          if (kanon) { if (!istGewaehlt(kanon)) gewaehlt.push(kanon); }
          else verworfen.push(m);
        });
        if (gewaehlt.length || verworfen.length) schreibeZurueck();

        zeichnen();
        return bestandHolen(flach.map(function (s) { return s.name; })).then(zeichnen);
      }).catch(function () {
        katalog = {}; flach = [];
        zeichnen();
      });
    }

    stilEinmal();
    laden();

    return {
      /** Die aktuelle Auswahl. */
      werte: function () { return gewaehlt.slice(); },
      /** Auswahl von außen setzen (z. B. beim Bearbeiten). */
      setzen: function (namen) {
        mitgebracht = Array.isArray(namen) ? namen.slice() : [];
        gewaehlt = []; verworfen = [];
        katalogVersprechen = katalogVersprechen || null;
        laden();
      },
      /** Neu laden, etwa nach einem Sprachwechsel. */
      neu: zeichnen
    };
  }

  global.TCSkillPicker = { mount: mount, _aehnlichkeit: aehnlichkeit };
})(window);
