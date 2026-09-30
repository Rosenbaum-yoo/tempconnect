/**
 * Der Schnellstart-Einstieg (Welle J10) — zwei Fragen statt eines Formulars.
 *
 * Owner-Auftrag 2026-08-26/27 mit Platzierung 1a: "vorgefertigte Anfragen …
 * mit Ja und Nein beantworten lassen … vielleicht mit Notdienst-Button oder
 * schneller liefern als 48 Stunden" — sichtbar ueberall dort, wo ein
 * Unternehmen sucht.
 *
 * WAS HIER GESCHUETZT WIRD, und warum jeweils:
 *
 *   A) Die VERDRAHTUNG. Der Einstieg lebt in EINER Datei und montiert sich
 *      selbst auf drei Seiten. Genau das ist seine Staerke und seine
 *      Schwachstelle: faellt eine Einbindung weg oder wird ein Anker-Element
 *      umbenannt, verschwindet er LAUTLOS. Niemand bekommt einen Fehler; der
 *      Einstieg ist einfach weg. Deshalb prueft dieser Teil die Einbindung in
 *      allen drei Seiten UND die Existenz jedes Ankers und jedes Feldes, das
 *      er befuellen will — gegen das echte Markup.
 *
 *   B) Das VERHALTEN, in einer vm-Sandbox wirklich ausgefuehrt (Muster aus
 *      h1KundenansichtAusfall Teil C): Rollenweiche, Fragenfolge,
 *      Notdienst-Abzweig, Uebergabe in die Filter, Merker, Rueckweg.
 *      Struktur allein wuerde nicht beweisen, dass der Klickpfad traegt.
 *
 * Run: node --test --test-force-exit test/schnellstart.test.js
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));

/* Aufwaerts suchen UND auf Inhalt pruefen: Docker legt Mount-Ziele als leere
 * Verzeichnisse an, und ein leeres Verzeichnis macht jede Pruefung lautlos
 * gruen — diese Falle ist in dieser Codebasis mehrfach zugeschnappt. */
function findeWurzel() {
  for (const start of [HIER, process.cwd()]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      const kandidat = path.join(dir, "frontend/public/js/schnellstart.js");
      if (fs.existsSync(kandidat) && fs.statSync(kandidat).size > 1000) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel();
const suite = ROOT ? describe : describe.skip;

/** Die drei Flaechen und was der Einstieg dort braucht. */
const FLAECHEN = [
  {
    seite: "capacity_exchange_feed.html",
    anker: [".ce-filter", "feed-stats"],
    /* Der Feed bekommt seine Antworten ueber die ADRESSE — er liest sie beim
     * Start selbst aus (marketplaceFeed.js readUrlFilters). Geprueft wird
     * deshalb, dass er genau diese Parameter kennt. */
    parameter: ["role", "city", "min_headcount", "availability_from"],
    modul: "js/pages/marketplaceFeed.js"
  },
  {
    seite: "capacity_search.html",
    anker: ["searchForm"],
    felder: ["role", "region", "available_min", "available_from", "available_window_immediate"]
  },
  {
    seite: "company-live-workforce.html",
    anker: ["viewAvailable"],
    felder: ["avRole", "avCity", "avCount", "avFrom"]
  }
];

suite("Schnellstart · Teil A — die Verdrahtung", () => {
  let quelle;
  before(() => {
    quelle = fs.readFileSync(path.join(ROOT, "frontend/public/js/schnellstart.js"), "utf8");
    assert.ok(quelle.length > 3000, "Gegenprobe: die Datei wurde wirklich gelesen");
  });

  for (const f of FLAECHEN) {
    it(`${f.seite}: bindet den Schnellstart ein`, () => {
      const html = fs.readFileSync(path.join(ROOT, "frontend/public", f.seite), "utf8");
      assert.ok(html.includes("js/schnellstart.js"),
        "die Einbindung fehlt — der Einstieg verschwindet auf dieser Seite LAUTLOS, " +
        "ohne Fehler in der Konsole");
    });

    it(`${f.seite}: jeder Anker existiert im Markup`, () => {
      const html = fs.readFileSync(path.join(ROOT, "frontend/public", f.seite), "utf8");
      for (const anker of f.anker) {
        const alsId = `id="${anker}"`;
        const alsKlasse = `class="${anker.replace(/^\./, "")}`;
        assert.ok(html.includes(alsId) || html.includes(anker.replace(/^\./, "")),
          `Anker "${anker}" gibt es nicht mehr — der Einstieg findet keinen Platz. ` +
          `Gesucht als ${alsId} oder ${alsKlasse}`);
      }
    });

    if (f.felder) {
      it(`${f.seite}: jedes Feld, das befuellt wird, gibt es auch`, () => {
        const html = fs.readFileSync(path.join(ROOT, "frontend/public", f.seite), "utf8");
        for (const feld of f.felder) {
          assert.ok(html.includes(`id="${feld}"`),
            `Feld "${feld}" fehlt — der Schnellstart schriebe seine Antwort ins Leere`);
        }
        /* Gegenprobe: die Datei nennt die Felder auch wirklich. */
        for (const feld of f.felder) {
          assert.ok(quelle.includes(feld), `schnellstart.js kennt "${feld}" nicht (mehr)`);
        }
      });
    }

    if (f.parameter) {
      it(`${f.seite}: die Zielseite liest die uebergebenen Parameter`, () => {
        const modul = fs.readFileSync(path.join(ROOT, "frontend/public", f.modul), "utf8");
        for (const p of f.parameter) {
          assert.ok(modul.includes(`${p}:`) || modul.includes(`"${p}"`),
            `${f.modul} kennt den Parameter "${p}" nicht — die Uebergabe ueber die Adresse ` +
            "kaeme dort nie an");
        }
        assert.ok(modul.includes("availability_window"),
          "der Notdienst-Weg setzt availability_window=immediate — die Zielseite muss ihn lesen");
      });
    }
  }

  it("die Rollenweiche steht im Code: nur Unternehmen suchen Personal", () => {
    assert.match(quelle, /istUnternehmen/);
    assert.match(quelle, /org_type/, "die Rolle kommt aus dem Shell-Kontext");
  });

  it("der Merker ist abweisbar UND widerrufbar", () => {
    assert.match(quelle, /localStorage\.setItem/, "einmal beantwortet, nicht wieder fragen");
    assert.match(quelle, /localStorage\.removeItem/, "aber der Rueckweg muss existieren");
  });

  it("das Sofort-Kennzeichen wird VOR den Feldern gesetzt", () => {
    /* Die "sofort"-Checkbox der Personalsuche setzt das Datumsfeld auf heute
     * UND deaktiviert es (capacity_search.html setImmediateState). Wuerde der
     * Schnellstart erst die Felder fuellen und dann die Checkbox setzen,
     * verwuerfe die Seite das gerade eingetippte "ab wann" — der Nutzer haette
     * geantwortet und es waere weg. */
    const iSofort = quelle.indexOf("konf.sofortFeld");
    const iFelder = quelle.indexOf("konf.felder[frage]");
    assert.ok(iSofort > 0 && iFelder > 0, "beide Stellen muessen existieren");
    assert.ok(iSofort < iFelder,
      "das Sofort-Kennzeichen muss VOR dem Befuellen gesetzt werden, sonst ueberschreibt " +
      "die Seitenlogik die Antwort des Nutzers");
    assert.match(quelle, /!el\.disabled/,
      "ein deaktiviertes Feld steht unter der Hoheit der Seite und wird nicht ueberschrieben");
  });

  it("das Datum kommt aus der Ortszeit, nicht aus dem UTC-Schnitt", () => {
    assert.ok(!/toISOString\(\)\.slice/.test(quelle),
      "toISOString().slice(0,10) liefert abends den VORTAG (Befundklasse F1, " +
      "Living-Platform-Direktive 'DACH-first Zeit')");
    assert.match(quelle, /getFullYear\(\)/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 *  Teil B — der Klickpfad, wirklich ausgefuehrt
 * ═══════════════════════════════════════════════════════════════════════════ */

suite("Schnellstart · Teil B — das Verhalten", () => {
  let js;
  before(() => {
    js = fs.readFileSync(path.join(ROOT, "frontend/public/js/schnellstart.js"), "utf8");
  });

  /** Minimale Sandbox mit genau so viel DOM, wie der Einstieg anfasst. */
  function sandbox({ rolle = "company", pfad = "/public/company-live-workforce.html", gemerkt = false } = {}) {
    const speicher = gemerkt ? { "tcSchnellstart:erledigt": "1" } : {};
    const felder = {};
    const eingehaengt = [];

    function elem(tag) {
      const e = {
        tagName: tag, id: "", className: "", innerHTML: "", textContent: "", value: "", type: "",
        style: {}, checked: false, _kinder: [], parentNode: null, _weg: false,
        setAttribute() {}, getAttribute() { return null; }, focus() {},
        addEventListener(typ, fn) { (e._h = e._h || {})[typ] = fn; },
        dispatchEvent(ev) { if (e._h && e._h[ev.type]) e._h[ev.type](ev); return true; },
        appendChild(k) { e._kinder.push(k); return k; },
        insertBefore(neu) { eingehaengt.push(neu); neu.parentNode = e; return neu; },
        remove() { e._weg = true; },
        /* Der Einstieg fragt nur nach [data-qs] und .tc-qs__frage. */
        querySelector(sel) {
          if (sel === ".tc-qs__frage") return { textContent: (/<p class="tc-qs__frage">([^<]*)</.exec(e.innerHTML) || [])[1] || "" };
          const m = /\[data-qs="([a-z]+)"\]/.exec(sel);
          if (m) return e.innerHTML.includes(`data-qs="${m[1]}"`) ? { getAttribute: () => m[1] } : null;
          if (sel.startsWith("#qs-")) return felder[sel.slice(1)] || null;
          if (sel === ".tc-qs__not") return e.innerHTML.includes("tc-qs__not") ? {} : null;
          return null;
        },
        querySelectorAll() { return []; }
      };
      return e;
    }

    /* Die Felder, die der Einstieg auf dieser Flaeche befuellt. */
    for (const id of ["avRole", "avCity", "avCount", "avFrom", "qs-was", "qs-wo", "qs-ab", "qs-anzahl"]) {
      felder[id] = elem("input");
      felder[id].id = id;
    }

    const anker = elem("div");
    anker.className = "ct-toolbar";
    anker.parentNode = elem("div");

    const gerufen = [];
    const ctx = {
      console, Event, URLSearchParams, Date, Math, JSON, String, Object, Array, Boolean, Number, RegExp, Error, Promise,
      setTimeout: (fn) => { fn(); return 1; },
      localStorage: {
        getItem: (k) => (k in speicher ? speicher[k] : null),
        setItem: (k, v) => { speicher[k] = String(v); },
        removeItem: (k) => { delete speicher[k]; }
      },
      document: {
        readyState: "complete",
        head: elem("head"),
        body: elem("body"),
        addEventListener() {},
        removeEventListener() {},
        createElement: (tag) => elem(tag),
        getElementById: (id) => felder[id] || null,
        querySelector: (sel) => {
          if (sel === "#viewAvailable .ct-toolbar" || sel === "#viewAvailable") return anker;
          if (sel === "#tc-schnellstart-styles" || sel === "#tc-schnellstart-wieder") return null;
          return null;
        }
      },
      window: {
        location: { pathname: pfad, search: "" },
        TC: { shell: { context: { me: rolle ? { org_type: rolle, role: rolle } : null } } },
        TCi18n: { locale: () => "de" },
        clwView: (m) => gerufen.push("view:" + m),
        clwLoadAvailable: () => { gerufen.push("laden"); return Promise.resolve(); }
      },
      gerufen, felder, eingehaengt, speicher
    };
    ctx.globalThis = ctx;
    ctx.window.document = ctx.document;
    ctx.window.localStorage = ctx.localStorage;
    /* Im Browser sind `location` und `TCi18n` globale Bindungen, nicht nur
     * Eigenschaften von window. Die Sandbox muss beides ebenso anbieten,
     * sonst scheitert der Code an der Sandbox statt an sich selbst. */
    ctx.location = ctx.window.location;
    ctx.TCi18n = ctx.window.TCi18n;
    ctx.TC = ctx.window.TC;
    vm.createContext(ctx);
    vm.runInContext(js, ctx, { filename: "schnellstart.js" });
    return ctx;
  }

  /** Den zuletzt eingehaengten Kasten holen (der Einstieg ersetzt sein Markup in place). */
  function kasten(ctx) {
    return ctx.eingehaengt.filter((e) => e.id === "tc-schnellstart").pop() || null;
  }
  /**
   * Einen Knopf im Kasten klicken. Der Einstieg haengt EINEN Handler an den
   * Kasten und findet den Knopf ueber e.target.closest('[data-qs]') — die
   * Sandbox muss deshalb genau das liefern: den geklickten Knopf, nicht
   * irgendeinen. Ein Stellvertreter, der immer denselben zurueckgibt, wuerde
   * jeden Test gruen machen, ohne etwas zu beweisen.
   */
  function klick(box, was) {
    assert.ok(box._h && box._h.click, "der Kasten hoert nicht auf Klicks");
    assert.ok(box.innerHTML.includes(`data-qs="${was}"`),
      `der Knopf "${was}" steht gerade nicht im Kasten`);
    box._h.click({ target: { closest: () => ({ getAttribute: () => was }) } });
  }

  it("eine Agentur sieht den Einstieg nicht — sie sucht kein Personal", () => {
    const ctx = sandbox({ rolle: "agency" });
    assert.equal(kasten(ctx), null);
  });

  it("ein Unternehmen bekommt die erste Frage", () => {
    const ctx = sandbox();
    const box = kasten(ctx);
    assert.ok(box, "der Einstieg wurde nicht eingehaengt");
    assert.match(box.innerHTML, /Suchen Sie Personal\?/);
    assert.match(box.innerHTML, /data-qs="ja"/);
    assert.match(box.innerHTML, /data-qs="nein"/);
  });

  it("wer schon geantwortet hat, wird nicht wieder gefragt", () => {
    const ctx = sandbox({ gemerkt: true });
    assert.equal(kasten(ctx), null, "der Einstieg draengt sich nicht auf");
    assert.ok(ctx.eingehaengt.some((e) => e.id === "tc-schnellstart-wieder"),
      "aber der Rueckweg steht bereit");
  });

  it("Ja fuehrt zur 48-Stunden-Frage, Dringend zum Notdienst-Hinweis", () => {
    const ctx = sandbox();
    const box = kasten(ctx);
    klick(box, "ja");
    assert.match(box.innerHTML, /unter 48 Stunden/);
    klick(box, "dringend");
    assert.match(box.innerHTML, /tc-qs__not/, "der Notdienst-Hinweis fehlt");
    assert.match(box.innerHTML, /id="qs-was"/, "und die drei Angaben stehen bereit");
  });

  it("Nein blendet ihn aus und merkt sich das", () => {
    const ctx = sandbox();
    const box = kasten(ctx);
    klick(box, "nein");
    assert.equal(ctx.speicher["tcSchnellstart:erledigt"], "1");
    assert.ok(box._weg, "der Kasten wurde entfernt");
  });

  it("die drei Antworten landen in den echten Filtern und loesen die Suche aus", () => {
    const ctx = sandbox();
    const box = kasten(ctx);
    klick(box, "ja");
    klick(box, "geplant");
    ctx.felder["qs-was"].value = "Staplerfahrer";
    ctx.felder["qs-wo"].value = "Hamburg";
    ctx.felder["qs-anzahl"].value = "3";
    ctx.felder["qs-ab"].value = "2026-09-01";
    klick(box, "los");
    assert.equal(ctx.felder.avRole.value, "Staplerfahrer");
    assert.equal(ctx.felder.avCity.value, "Hamburg");
    assert.equal(ctx.felder.avCount.value, "3");
    assert.equal(ctx.felder.avFrom.value, "2026-09-01");
    assert.ok(ctx.gerufen.includes("laden"), "die Suche wurde nicht ausgeloest");
    assert.ok(ctx.gerufen.includes("view:available"), "der richtige Reiter wurde nicht geoeffnet");
    assert.equal(ctx.speicher["tcSchnellstart:erledigt"], "1");
  });
});
