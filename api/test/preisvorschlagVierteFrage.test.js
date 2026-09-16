/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WELLE N2.2 — DIE VIERTE FRAGE BEANTWORTET SICH SELBST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `/api/pricing/suggest` ist fertig, getestet und plan-gegated — und hatte am
 * 2026-09-06 gemessen NULL Aufrufer im gesamten Frontend. Der Plan nennt das
 * "die billigste Wow-Lieferung des ganzen Projekts": es fehlte nur die Anzeige.
 *
 * Warum die Anzeige mehr ist als Bequemlichkeit: ein Budget, das niemand
 * bedienen kann, ist die haeufigste Ursache fuer einen Bedarf, auf den nie
 * jemand antwortet. Der Kunde erfaehrt das nie — er sieht nur Stille und
 * schliesst daraus auf den Markt statt auf seine Zahl.
 *
 * DIESE DATEI FUEHRT DIE ANZEIGE AUS. Sie liest nicht den Quelltext: eine
 * Probe, die `includes("pricing/suggest")` prueft, bliebe gruen, wenn die
 * Anzeige nie zeichnet, den Platzhalter `{n}` woertlich hinschreibt oder bei
 * jedem Tastendruck erneut gegen eine 403 laeuft. Genau diese drei Fehler
 * hatte die erste Fassung.
 *
 * Lauf: node --test --test-force-exit test/preisvorschlagVierteFrage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { createSmartPricingRouter } from "../routes/smartPricing.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HIER, "..");
const SEITE = path.resolve(API, "..", "frontend", "public", "marketplace_demand_create.html");
const seiteDa = fs.existsSync(SEITE);
const html = seiteDa ? fs.readFileSync(SEITE, "utf8") : "";

/* ── Die Anzeige in einem Sandkasten laufen lassen ──────────────────────
 *
 * Derselbe Schnitt wie in `notdienstAbleitung.test.js`: der Block zwischen
 * `var VORLAUF_TAGE` und `function start()`. Der Preisteil sitzt bewusst in
 * DERSELBEN IIFE wie die Notdienst-Ableitung — er haengt an der Dringlichkeit,
 * und die Vorlauf-Regel darf nicht ein drittes Mal im Code stehen.
 */
function anzeige({ antwort, status = 200, wirft = false } = {}) {
  const block = html.slice(html.indexOf("var VORLAUF_TAGE"));
  const quelle = block.slice(0, block.indexOf("function start()"));
  assert.ok(quelle.includes("function holePreis"), "der Preisteil liegt nicht mehr in diesem Block");

  const felder = {
    role: { value: "" },
    location_city: { value: "" },
    start_date: { value: "" },
    budget_min: { value: "" },
    budget_max: { value: "" }
  };
  const knoepfe = [];
  const ziel = {
    _html: "", _attr: {},
    get innerHTML() { return this._html; },
    set innerHTML(v) {
      this._html = v;
      /* Eine sehr kleine Auswertung: nur so viel, dass ein per innerHTML
         erzeugter Knopf danach wirklich gefunden wird — sonst prueft die Probe
         das Binden gar nicht. */
      knoepfe.length = 0;
      if (/id="preisUebernehmen"/.test(v)) knoepfe.push({ id: "preisUebernehmen", hoerer: [],
        addEventListener(_art, fn) { this.hoerer.push(fn); },
        klick() { this.hoerer.forEach((fn) => fn()); } });
    },
    setAttribute(k, v) { this._attr[k] = v; },
    removeAttribute(k) { delete this._attr[k]; },
    className: ""
  };

  const abrufe = [];
  const sandkasten = {
    document: {
      documentElement: { lang: "de" },
      getElementById: (id) => {
        if (id === "preisVorschlag") return ziel;
        if (id === "preisUebernehmen") return knoepfe[0] || null;
        if (id === "urgencyAnzeige") return { className: "", innerHTML: "" };
        return felder[id] || null;
      },
      createElement: () => {
        const knoten = { textContent: "", get innerHTML() {
          return String(knoten.textContent)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        } };
        return knoten;
      },
      addEventListener() {}
    },
    window: {}, Intl, Date, Math, Number, String, RegExp, Object, JSON,
    setTimeout: (fn) => { fn(); return 1; },   // ohne Wartezeit, damit die Probe nicht schlaeft
    clearTimeout: () => {},
    encodeURIComponent,
    console: { log() {}, warn() {}, error() {} },
    fetch: (url) => {
      abrufe.push(url);
      if (wirft) return Promise.reject(new Error("Netz weg"));
      return Promise.resolve({
        status, ok: status >= 200 && status < 300,
        json: () => Promise.resolve(antwort)
      });
    }
  };
  vm.createContext(sandkasten);
  vm.runInContext(
    quelle
    + "\nglobalThis._hole = holePreis;"
    + "\nglobalThis._zeichne = zeichnePreis;"
    + "\nglobalThis._anstoss = preisAngestossen;"
    + "\nglobalThis._gesperrt = function(){ return preisGesperrt; };",
    sandkasten, { filename: "preisVorschlag" }
  );
  return { sandkasten, felder, ziel, abrufe, knopf: () => knoepfe[0] };
}

const ANTWORT = {
  suggestion: { min_eur: 28, max_eur: 34, mid_eur: 31, currency: "EUR", surcharge_pct: 0 },
  confidence: "high",
  total_data_points: 42,
  explanation: "Aus 42 Abschluessen im Raum Muenster.",
  disclaimer: "Unverbindliche Preisorientierung auf Basis historischer Plattformdaten. Kein Preisversprechen."
};

/* ═══════════════════════════════════════════════════════════════════════
   1. DER MOTOR HAT JETZT EINEN AUFRUFER
   ═══════════════════════════════════════════════════════════════════════ */

describe("N2.2 · die Anzeige fragt den Preismotor wirklich", () => {

  it("ohne Rolle UND ohne Ort wird gar nicht gefragt", { skip: !seiteDa && "Seite fehlt" }, async () => {
    /* Der Motor verlangt mindestens eines von beidem und antwortet sonst mit
       400. Eine Abfrage, deren Fehlschlag feststeht, gehoert nicht gestellt. */
    const a = anzeige({ antwort: ANTWORT });
    await a.sandkasten._hole();
    assert.deepStrictEqual(a.abrufe, []);
  });

  it("mit Rolle wird gefragt — und Rolle, Ort und Dringlichkeit fahren mit", { skip: !seiteDa && "Seite fehlt" }, async () => {
    const a = anzeige({ antwort: ANTWORT });
    a.felder.role.value = "Pflegefachkraft";
    a.felder.location_city.value = "Münster";
    await a.sandkasten._hole();

    /*
     * `holePreis` gibt seine Zusage ZURUECK — deshalb ist nach diesem `await`
     * auch wirklich gezeichnet. Vorher gab es sie nicht zurueck: mehrere Proben
     * hier liefen dann vor der Antwort durch und waren gruen, ohne je eine
     * gesehen zu haben. Diese Zusicherung haelt beides fest.
     */
    assert.strictEqual(a.ziel._attr["data-sichtbar"], "ja",
      "nach der Antwort ist die Karte immer noch verborgen — wurde die Zusage nicht zurueckgegeben?");

    assert.strictEqual(a.abrufe.length, 1);
    const url = a.abrufe[0];
    assert.ok(url.startsWith("/api/pricing/suggest?"), "es wird ein anderer Weg gefragt: " + url);
    assert.ok(url.includes("role=Pflegefachkraft"), "die Rolle fehlt");
    assert.ok(url.includes("region=M%C3%BCnster"), "der Ort fehlt oder ist nicht kodiert");
    assert.ok(url.includes("context=demand"), "der Zusammenhang fehlt");
  });

  it("die Dringlichkeit kommt aus DEMSELBEN Vorlauf wie die Notdienst-Anzeige", { skip: !seiteDa && "Seite fehlt" }, async () => {
    /*
     * Der Aufschlag haengt an der Stufe. Stuende die Vorlauf-Regel hier ein
     * drittes Mal (Server, Anzeige, Preis), liefe sie irgendwann auseinander —
     * und der Kunde saehe den Notdienst-Hinweis, bekaeme aber den normalen
     * Preis. Deshalb steht der Preisteil in derselben IIFE und benutzt
     * `tageBis` und `VORLAUF_TAGE` mit. Diese Probe haelt das fest.
     */
    const heute = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
    const versetzt = (tage) => {
      const t = Date.UTC(+heute.slice(0, 4), +heute.slice(5, 7) - 1, +heute.slice(8, 10), 12);
      return new Date(t + tage * 86400000).toISOString().slice(0, 10);
    };

    for (const [tage, erwartet] of [[1, "notdienst"], [2, "notdienst"], [3, "normal"], [30, "normal"]]) {
      const a = anzeige({ antwort: ANTWORT });
      a.felder.role.value = "Pflegefachkraft";
      a.felder.start_date.value = versetzt(tage);
      await a.sandkasten._hole();
      assert.ok(a.abrufe[0].includes("urgency=" + erwartet),
        `Vorlauf ${tage} Tage: erwartet ${erwartet}, gefragt wurde ${a.abrufe[0]}`);
    }
  });

  it("ohne Startdatum ist es die regulaere Suche, nicht der Notdienst", { skip: !seiteDa && "Seite fehlt" }, async () => {
    // Ein leeres Datum als "sofort" zu lesen waere der teuerste Standardwert:
    // jeder halb ausgefuellte Bedarf ergaebe den Notdienst-Aufschlag.
    const a = anzeige({ antwort: ANTWORT });
    a.felder.role.value = "Pflegefachkraft";
    await a.sandkasten._hole();
    assert.ok(a.abrufe[0].includes("urgency=normal"));
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. WAS AUF DEM SCHIRM STEHT
   ═══════════════════════════════════════════════════════════════════════ */

describe("N2.2 · die Anzeige zeigt die Spanne, den Beleg und den Vorbehalt", () => {

  it("die Spanne steht da, mit Waehrung", { skip: !seiteDa && "Seite fehlt" }, () => {
    const a = anzeige({ antwort: ANTWORT });
    a.sandkasten._zeichne(ANTWORT);
    assert.match(a.ziel.innerHTML, /28,00–34,00 €\/h/,
      "die Spanne fehlt oder ist nicht deutsch formatiert: " + a.ziel.innerHTML);
    assert.strictEqual(a.ziel._attr["data-sichtbar"], "ja", "die Karte bleibt verborgen");
  });

  it("der Platzhalter wird ersetzt — nicht woertlich gezeigt", { skip: !seiteDa && "Seite fehlt" }, () => {
    /*
     * Das `t()` dieser IIFE reicht KEINE Werte weiter. Die erste Fassung rief
     * es mit einem dritten Argument auf — und haette "{n} Datenpunkte"
     * woertlich auf den Schirm geschrieben. Gefangen wurde das beim Lesen,
     * festgehalten wird es hier.
     */
    const a = anzeige({ antwort: ANTWORT });
    a.sandkasten._zeichne(ANTWORT);
    assert.ok(!a.ziel.innerHTML.includes("{n}"), "ein Platzhalter steht woertlich auf dem Schirm");
    assert.ok(a.ziel.innerHTML.includes("42"), "die Zahl der Datenpunkte fehlt");
  });

  it("Guete und Vorbehalt stehen dabei", { skip: !seiteDa && "Seite fehlt" }, () => {
    // Der Vorbehalt ist kein Beiwerk: die Spanne stammt aus Verlaufsdaten und
    // ist ausdruecklich kein Preisversprechen. Sie ohne ihn zu zeigen macht
    // aus einer Orientierung eine Zusage.
    const a = anzeige({ antwort: ANTWORT });
    a.sandkasten._zeichne(ANTWORT);
    assert.ok(a.ziel.innerHTML.includes("gut belegt"), "die Datenguete fehlt");
    assert.ok(a.ziel.innerHTML.includes("Kein Preisversprechen"), "der Vorbehalt fehlt");
    assert.ok(a.ziel.innerHTML.includes("Raum Muenster"), "die Begruendung fehlt");
  });

  it("eine Antwort OHNE Spanne erzeugt keine leere Karte", { skip: !seiteDa && "Seite fehlt" }, () => {
    /* Eine Ueberschrift ohne Zahl behauptet eine Auskunft, die es nicht gibt. */
    for (const leer of [
      { suggestion: null, confidence: "low", total_data_points: 0 },
      { suggestion: { min_eur: null, max_eur: null }, confidence: "low", total_data_points: 0 },
      {}
    ]) {
      const a = anzeige({ antwort: leer });
      a.sandkasten._zeichne(leer);
      assert.strictEqual(a.ziel.innerHTML, "", "es steht doch etwas da: " + a.ziel.innerHTML);
      assert.ok(!("data-sichtbar" in a.ziel._attr), "die leere Karte ist sichtbar");
    }
  });

  it("Fremdtext aus der Antwort wird maskiert", { skip: !seiteDa && "Seite fehlt" }, () => {
    /* Die Begruendung baut der Server aus Daten — aber `innerHTML` verzeiht
       keine Ausnahme, und die naechste Quelle koennte eine andere sein. */
    const boese = { ...ANTWORT, explanation: '<img src=x onerror=alert(1)>' };
    const a = anzeige({ antwort: boese });
    a.sandkasten._zeichne(boese);
    assert.ok(!a.ziel.innerHTML.includes("<img"), "ein Tag aus der Antwort steht ungefiltert im DOM");
    assert.ok(a.ziel.innerHTML.includes("&lt;img"), "der Text fehlt ganz statt maskiert zu sein");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. EIN VORSCHLAG IST EIN VORSCHLAG
   ═══════════════════════════════════════════════════════════════════════ */

describe("N2.2 · uebernommen wird nur auf Klick", () => {

  it("von selbst wird KEIN Budget gesetzt", { skip: !seiteDa && "Seite fehlt" }, async () => {
    /*
     * Owner-Vorgabe im Plan: "Der Vorschlag ist ein Vorschlag, keine Vorgabe."
     * Ein selbsttaetig gefuelltes Feld waere genau das Gegenteil — und der
     * Kunde merkte nie, dass er eine fremde Zahl abgeschickt hat.
     */
    const a = anzeige({ antwort: ANTWORT });
    a.felder.role.value = "Pflegefachkraft";
    await a.sandkasten._hole();
    assert.strictEqual(a.felder.budget_min.value, "", "das Budget wurde ungefragt gesetzt");
    assert.strictEqual(a.felder.budget_max.value, "", "das Budget wurde ungefragt gesetzt");
  });

  it("nach dem Klick stehen genau die vorgeschlagenen Werte drin", { skip: !seiteDa && "Seite fehlt" }, () => {
    const a = anzeige({ antwort: ANTWORT });
    a.sandkasten._zeichne(ANTWORT);
    const knopf = a.knopf();
    assert.ok(knopf, "es gibt keinen Uebernehmen-Knopf");
    assert.ok(knopf.hoerer.length >= 1, "der Knopf ist gerendert, aber nichts haengt daran");
    knopf.klick();
    assert.strictEqual(a.felder.budget_min.value, 28);
    assert.strictEqual(a.felder.budget_max.value, 34);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4. OHNE TARIF KEIN VORSCHLAG — ABER AUCH KEINE SPERRE
   ═══════════════════════════════════════════════════════════════════════ */

describe("N2.2 · der Tarif entscheidet ueber den Vorschlag, nicht ueber den Bedarf", () => {

  it("403 verbirgt die Karte und blockiert nichts", { skip: !seiteDa && "Seite fehlt" }, async () => {
    const a = anzeige({ status: 403, antwort: { error: "FEATURE_LOCKED" } });
    a.felder.role.value = "Pflegefachkraft";
    await a.sandkasten._hole();
    assert.strictEqual(a.ziel.innerHTML, "", "bei fehlendem Tarif steht etwas da");
    assert.ok(!("data-sichtbar" in a.ziel._attr));
  });

  it("und danach wird NICHT weiter gefragt", { skip: !seiteDa && "Seite fehlt" }, async () => {
    /*
     * Ein Tarif aendert sich nicht waehrend des Tippens. Ohne diese Sperre
     * liefe bei jedem Tastendruck eine 403 — Laerm im Netz, im Protokoll und
     * in jeder Fehlerstatistik, die daraufhin nichts mehr wert ist.
     */
    const a = anzeige({ status: 403, antwort: { error: "FEATURE_LOCKED" } });
    a.felder.role.value = "Pflegefachkraft";
    await a.sandkasten._hole();
    await a.sandkasten._hole();
    await a.sandkasten._hole();
    assert.strictEqual(a.abrufe.length, 1, "es wurde " + a.abrufe.length + "-mal gegen die 403 gelaufen");
    assert.strictEqual(a.sandkasten._gesperrt(), true);
  });

  it("ein Netzfehler beschaedigt das Formular nicht", { skip: !seiteDa && "Seite fehlt" }, async () => {
    const a = anzeige({ wirft: true });
    a.felder.role.value = "Pflegefachkraft";
    await assert.doesNotReject(() => a.sandkasten._hole());
    assert.strictEqual(a.ziel.innerHTML, "");
    /* Und er sperrt NICHT dauerhaft: ein Aussetzer ist kein fehlender Tarif. */
    assert.strictEqual(a.sandkasten._gesperrt(), false);
  });

  it("ein 500 zeigt keine halbe Karte", { skip: !seiteDa && "Seite fehlt" }, async () => {
    const a = anzeige({ status: 500, antwort: { error: "SERVER_ERROR" } });
    a.felder.role.value = "Pflegefachkraft";
    await a.sandkasten._hole();
    assert.strictEqual(a.ziel.innerHTML, "");
    assert.strictEqual(a.sandkasten._gesperrt(), false, "ein Serverfehler wurde als fehlender Tarif gelesen");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   5. DER MOTOR SELBST — das Tor bleibt, wo es ist
   ═══════════════════════════════════════════════════════════════════════ */

describe("N2.2 · der Endpunkt bleibt plan-gegated", () => {

  it("das Tor `smart_pricing` steht vor der Route", () => {
    /*
     * Die Anzeige degradiert freundlich — das ist eine Frontend-Entscheidung
     * und darf NIE dazu fuehren, dass jemand das Tor am Server aufmacht, damit
     * "die Karte immer erscheint". Diese Probe haelt die Reihenfolge fest.
     */
    /*
     * N2.11 — Befund der Pruefung vom 2026-09-15: hier stand nur "requireFeature
     * wurde IRGENDWANN mit smart_pricing aufgerufen" und "der Stapel hat >= 3
     * Schichten". Ausgefuehrt: `router.get("/pricing/suggest", requireAuth,
     * requireAuth, …)` blieb 65/65 gruen — jeder Angemeldete ohne Tarif bekam den
     * Preisvorschlag. Jetzt an der Wirkung: ein Tor, das ABLEHNT, laesst den
     * Handler nie laufen — und genau dieses Tor steht in genau dieser Route.
     */
    const tore = new Map();
    let abgefragt = 0;
    const anmeldung = function anmeldung(_q, _s, next) { next(); };
    const router = createSmartPricingRouter({
      pool: { query: async () => { abgefragt += 1; return { rows: [] }; } },
      requireAuth: anmeldung,
      requireFeature: (merkmal) => {
        const tor = function tarifTor(_q, res) { res.status(403).json({ error: "PLAN_LOCKED", feature: merkmal }); };
        tore.set(merkmal, tor);
        return tor;
      },
      logger: { error() {}, warn() {}, info() {} }
    });
    assert.ok(tore.has("smart_pricing"), "das Plan-Tor wurde entfernt");

    const schicht = router.stack.find((l) => l.route && l.route.path === "/pricing/suggest" && l.route.methods.get);
    assert.ok(schicht, "die Route gibt es nicht mehr");
    const kette = schicht.route.stack.map((l) => l.handle);
    const tor = kette.indexOf(tore.get("smart_pricing"));
    assert.ok(tor > kette.indexOf(anmeldung) && tor < kette.length - 1,
      "das smart_pricing-Tor haengt nicht zwischen Anmeldung und Handler dieser Route");

    // Die Kette so laufen lassen, wie Express es tut: bis eine Schicht antwortet.
    const res = { _status: 200, _json: null, status(c) { this._status = c; return this; }, json(b) { this._json = b; return this; } };
    return (async () => {
      for (const schritt of kette) {
        let weiter = false;
        await schritt({ query: { role: "Pflege" }, session: { userId: "u1" } }, res, () => { weiter = true; });
        if (!weiter) break;
      }
      assert.strictEqual(res._status, 403, "ohne Tarif kam die Route durch");
      assert.strictEqual(abgefragt, 0, "der Preisvorschlag wurde trotz geschlossenem Tor gerechnet");
    })();
  });

  it("mindestens Rolle oder Region ist Pflicht", async () => {
    // Ohne beides waere die Antwort eine Spanne ueber den GESAMTEN Markt —
    // eine Zahl, die zu allem passt und deshalb nichts sagt.
    const router = createSmartPricingRouter({
      pool: { query: async () => ({ rows: [] }) },
      requireAuth: (_q, _s, next) => next(),
      requireFeature: () => (_q, _s, next) => next(),
      logger: { error() {}, warn() {}, info() {} }
    });
    const schicht = router.stack.find((l) => l.route && l.route.path === "/pricing/suggest");
    const handler = schicht.route.stack[schicht.route.stack.length - 1].handle;
    const res = {
      _status: 200, _json: null,
      status(c) { this._status = c; return this; },
      json(b) { this._json = b; return this; }
    };
    await handler({ query: {} }, res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });
});
