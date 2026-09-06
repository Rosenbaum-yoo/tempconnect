/**
 * Der Faehigkeiten-Katalog auf beiden Marktseiten (N1, 2026-09-06).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS HIER BEWACHT WIRD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Beide Seiten des Marktplatzes tippten Faehigkeiten als FREITEXT ein — die
 * Nachfrage in `marketplace_demand_create.html`, das Angebot in
 * `capacity_exchange_form.html`, beide mit dem Etikett "Skills
 * (kommagetrennt)". Was dabei entsteht, ist keine gemeinsame Achse, sondern ein
 * Haufen Schreibvarianten: "Stapler", "stapler", "Gabelstapler",
 * "Staplerschein". Nichts davon findet einander, und niemand sieht, warum die
 * Suche leer bleibt.
 *
 * Der Katalog existiert seit Migration 145 — 162 Faehigkeiten in 14 Kategorien,
 * MIT Schreibvarianten in `aliases`. Er war auf keiner der beiden Seiten
 * erreichbar.
 *
 * ── DREI DINGE, DIE BEIM BAUEN AUFFIELEN ────────────────────────────────
 *
 * 1. `mitarbeiter.js` traegt eine ZWEITE, fest verdrahtete Liste (12 Gruppen,
 *    142 Faehigkeiten, ohne Aliase). Sie ist eine Schattenwahrheit neben
 *    `platform_skills`; dieser Waechter haelt fest, dass der neue Waehler sie
 *    NICHT benutzt.
 *
 * 2. Der Plan nennt als Nachweis "je Faehigkeit die Zahl verfuegbarer Kraefte,
 *    aus `capacity-discovery/by-role`". Gemessen: `aggregateByRole` gruppiert
 *    nach `cp.role`, nicht nach `cp.skill_tags` — die Rolle beantwortet eine
 *    andere Frage. Deshalb `aggregateBySkill`, neu gebaut.
 *
 * 3. Ein verstecktes Feld feuert KEIN `input`/`change`, wenn ein Skript seinen
 *    Wert setzt. Auf der Angebotsseite haengt daran die Deckungsvorschau, beim
 *    Bearbeiten die Vorbelegung. Beide Bruecken werden hier geprueft — sie
 *    gehen sonst still kaputt.
 *
 * Run: node --test --test-force-exit test/faehigkeitenKatalog.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { aggregateBySkill } from "../services/capacityDiscoveryService.js";
import { createCapacityDiscoveryRouter } from "../routes/capacityDiscovery.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HIER, "..");
const OEFFENTLICH = path.resolve(API, "..", "frontend", "public");

const PICKER = path.join(OEFFENTLICH, "js", "skillPicker.js");
const NACHFRAGE = path.join(OEFFENTLICH, "marketplace_demand_create.html");
const ANGEBOT = path.join(OEFFENTLICH, "capacity_exchange_form.html");
const ANGEBOT_JS = path.join(OEFFENTLICH, "js", "pages", "capacityExchangeForm.js");
const oberflaecheDa = [PICKER, NACHFRAGE, ANGEBOT, ANGEBOT_JS].every((p) => fs.existsSync(p));

/* ── Vorrichtung fuer die Abfrage-Proben ─────────────────────────────── */

function zugang(zeilen = []) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      return { rows: zeilen, rowCount: zeilen.length };
    }
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   1. Der Bestand je FAEHIGKEIT — die Form der Abfrage
   ═══════════════════════════════════════════════════════════════════════ */

describe("N1.3 · die Abfrage fragt nach Faehigkeiten, nicht nach Rollen", () => {

  it("sie entfaltet `skill_tags` und gruppiert danach", async () => {
    /*
     * FORM-PROBE. Ein Muster-Zugang fuehrt nichts aus — er kann nicht zeigen,
     * ob die Abfrage stimmt. Was er zeigen kann, ist WELCHE Abfrage gestellt
     * wird; deshalb wird jeder tragende Bestandteil einzeln gepinnt. Die
     * Ausfuehrbarkeit beweist `test/integration/bestandJeFaehigkeit.flow.test.js`
     * an einer echten Datenbank.
     */
    const pool = zugang([]);
    await aggregateBySkill(pool, {});
    const sql = pool.calls[0].sql;

    assert.match(sql, /UNNEST\(cp\.skill_tags\)/,
      "die Faehigkeiten werden nicht entfaltet — dann zaehlt sie niemand einzeln");
    assert.match(sql, /GROUP BY je\.skill/,
      "es wird nicht nach Faehigkeit gruppiert");
    assert.ok(!/GROUP BY cp\.role/.test(sql),
      "es wird nach ROLLE gruppiert — das ist die Frage, die `by-role` schon beantwortet");
    assert.match(sql, /cp\.status = 'active'/,
      "auch stillgelegte Eintraege zaehlen mit");
    assert.match(sql, /FROM capacity_posts cp/,
      "die Angebotsseite wird gar nicht gelesen");
  });

  it("bereits vergebene Koepfe zaehlen nicht als verfuegbar", async () => {
    /* Sonst meldet die Zahl neben der Faehigkeit Kraefte, die laengst
       verbindlich woanders stehen — und die Ausschreibung geht ins Leere. */
    const pool = zugang([]);
    await aggregateBySkill(pool, {});
    const sql = pool.calls[0].sql;
    assert.match(sql, /GREATEST\(cp\.headcount - COALESCE\(commercial_state\.committed_headcount, 0\), 0\)/,
      "der Rest wird nicht gerechnet — die Zahl waere die BRUTTO-Menge");
    assert.match(sql, /LEFT JOIN LATERAL/,
      "der Verbund auf die vergebene Menge fehlt");
    assert.match(sql, /> 0/, "Eintraege ohne Rest werden nicht ausgeschlossen");
  });

  it("jeder Filter landet wirklich in den Parametern", async () => {
    const pool = zugang([]);
    await aggregateBySkill(pool, {
      org_id: "org-1", city: "Muenster", worker_category: "hilfskraft",
      skills: ["Stapler", "SAP"], limit: 7
    });
    const { sql, params } = pool.calls[0];
    assert.ok(params.includes("org-1"), "die Organisation wird nicht gebunden");
    assert.ok(params.includes("Muenster"), "der Ort wird nicht gebunden");
    assert.ok(params.includes("hilfskraft"), "die Kategorie wird nicht gebunden");
    assert.ok(params.includes(7), "die Obergrenze wird nicht gebunden");
    assert.deepEqual(params.find((p) => Array.isArray(p)), ["stapler", "sap"],
      "die Vorauswahl kommt nicht kleingeschrieben an — der Katalog schreibt gross, "
      + "die Eintraege womoeglich klein, und die Zahl waere faelschlich 0");
    assert.match(sql, /LOWER\(je\.skill\) = ANY/,
      "der Vergleich achtet auf Gross- und Kleinschreibung");
  });

  it("ohne Vorauswahl steht keine Faehigkeits-Bedingung im SQL", async () => {
    const pool = zugang([]);
    await aggregateBySkill(pool, {});
    assert.ok(!/LOWER\(je\.skill\) = ANY/.test(pool.calls[0].sql),
      "es wird gegen eine leere Vorauswahl gefiltert — dann kommt nie etwas zurueck");
  });

  it("die Obergrenze laesst sich nicht beliebig hochdrehen", async () => {
    const pool = zugang([]);
    await aggregateBySkill(pool, { limit: 99999 });
    assert.ok(pool.calls[0].params.includes(300),
      "eine unbegrenzte Antwort waere ein Weg, die Datenbank zu beschaeftigen");
  });

  it("eine leere Antwort ist eine leere Liste, kein Fehler", async () => {
    assert.deepEqual(await aggregateBySkill(zugang([]), {}), []);
  });

  it("die Zeilen kommen aufbereitet, nicht roh", async () => {
    const pool = zugang([{ skill: "Stapler", entry_count: "3", total_headcount: "11", cities: ["Muenster"] }]);
    const zeilen = await aggregateBySkill(pool, {});
    assert.deepEqual(zeilen, [{ skill: "Stapler", entry_count: 3, total_headcount: 11, cities: ["Muenster"] }]);
    assert.equal(typeof zeilen[0].total_headcount, "number",
      "die Zahl kommt als Zeichenkette an — im Browser wuerde daraus eine Verkettung");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. Die Route
   ═══════════════════════════════════════════════════════════════════════ */

describe("N1.3 · die Route reicht die Vorauswahl durch", () => {

  function handler(pool, pfad = "/capacity-discovery/by-skill") {
    const router = createCapacityDiscoveryRouter({
      pool, requireAuth: (_q, _s, n) => n(), logger: { info() {}, warn() {}, error() {} }
    });
    for (const l of router.stack) {
      if (l.route && l.route.path === pfad && l.route.methods.get) {
        return l.route.stack[l.route.stack.length - 1].handle;
      }
    }
    throw new Error("Route fehlt: " + pfad);
  }

  function antwort() {
    return { _json: null, _status: 200, json(b) { this._json = b; return this; },
             status(c) { this._status = c; return this; } };
  }

  it("aus `skills=a,b` wird eine Liste", async () => {
    const pool = zugang([]);
    const res = antwort();
    await handler(pool)({ query: { skills: " Stapler , SAP ,, " }, session: {} }, res);
    assert.deepEqual(pool.calls[0].params.find((p) => Array.isArray(p)), ["stapler", "sap"],
      "die Aufteilung oder das Trimmen fehlt");
    assert.equal(res._json.count, 0);
    assert.deepEqual(res._json.items, []);
  });

  it("hundert Faehigkeiten sind genug", async () => {
    /* Die Oberflaeche fragt nach den sichtbaren Kacheln. Eine Anfrage mit
       zehntausend Begriffen ist keine Oberflaeche, sondern eine Last. */
    const pool = zugang([]);
    const viele = Array.from({ length: 500 }, (_, i) => "s" + i).join(",");
    await handler(pool)({ query: { skills: viele }, session: {} }, antwort());
    assert.equal(pool.calls[0].params.find((p) => Array.isArray(p)).length, 100);
  });

  it("ohne `skills` wird nicht gefiltert", async () => {
    const pool = zugang([]);
    await handler(pool)({ query: {}, session: {} }, antwort());
    assert.ok(!pool.calls[0].params.some((p) => Array.isArray(p)),
      "es wird gegen eine leere Liste gefiltert");
  });

  it("der Nachbar `by-role` ist unveraendert erreichbar", () => {
    assert.ok(typeof handler(zugang([]), "/capacity-discovery/by-role") === "function");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. N1.4 — kein Freitext mehr, auf keiner der beiden Seiten
   ═══════════════════════════════════════════════════════════════════════ */

describe("N1.4 · Freitext ist auf beiden Seiten nicht mehr moeglich",
  { skip: oberflaecheDa ? false : "frontend/public nicht im Abbild" }, () => {

  const nachfrage = oberflaecheDa ? fs.readFileSync(NACHFRAGE, "utf8") : "";
  const angebot = oberflaecheDa ? fs.readFileSync(ANGEBOT, "utf8") : "";
  const angebotJs = oberflaecheDa ? fs.readFileSync(ANGEBOT_JS, "utf8") : "";
  const picker = oberflaecheDa ? fs.readFileSync(PICKER, "utf8") : "";

  it("das Feld der NACHFRAGE nimmt keine Tastatur mehr an", () => {
    assert.match(nachfrage, /<input type="hidden" id="skill_tags" name="skill_tags"\/>/,
      "das Freitextfeld steht wieder da — Schreibvarianten kehren zurueck");
    assert.ok(!/<input id="skill_tags"[^>]*placeholder/.test(nachfrage),
      "es gibt weiterhin ein tippbares Feld mit Platzhalter");
    assert.match(nachfrage, /<div id="skillPicker"><\/div>/,
      "es gibt keinen Ort, an dem der Waehler zeichnen koennte");
  });

  it("das Feld des ANGEBOTS nimmt keine Tastatur mehr an", () => {
    assert.match(angebot, /<input type="hidden" id="f-skills"\/>/,
      "das Freitextfeld steht wieder da");
    assert.ok(!/id="f-skills"[^>]*type="text"/.test(angebot),
      "das Feld ist wieder ein Textfeld");
    assert.match(angebot, /<div id="skillPickerAngebot"><\/div>/);
  });

  it("beide Seiten laden den Waehler", () => {
    for (const [name, html] of [["Nachfrage", nachfrage], ["Angebot", angebot]]) {
      assert.match(html, /<script src="\/public\/js\/skillPicker\.js"><\/script>/,
        `${name}: der Waehler wird nicht geladen — das Feld bliebe leer und unbedienbar`);
      assert.match(html, /TCSkillPicker\.mount\(\{/,
        `${name}: der Waehler wird geladen, aber nie aufgesetzt`);
    }
  });

  it("BEIDE Bruecken um das versteckte Feld stehen", () => {
    /*
     * Ein verstecktes Feld feuert kein Ereignis, wenn ein Skript seinen Wert
     * setzt. Daran haengen auf der Angebotsseite zwei Dinge, die sonst still
     * kaputtgehen — und zwar so, dass es nicht nach Fehler aussieht.
     */
    assert.match(angebot, /dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/,
      "die Deckungsvorschau erfaehrt nichts mehr von einer Auswahl");
    /* ERST NACH EINER RUECKMUTATION RICHTIG. Die erste Fassung suchte nur
       `new CustomEvent("tc:skills-loaded"` — und `void 0 && document.dispatch
       Event(new CustomEvent(...))` enthaelt das ebenso. Geprueft wird jetzt der
       ABSENDEVORGANG am Zeilenanfang, nicht das Vorkommen des Namens. */
    assert.match(angebotJs, /\n\s*document\.dispatchEvent\(new CustomEvent\("tc:skills-loaded"/,
      "beim Bearbeiten erfaehrt der Waehler nichts von der geladenen Auswahl");
    assert.match(angebot, /"tc:skills-loaded"/,
      "die Meldung wird gesendet, aber niemand hoert zu");
  });

  it("die Nachfrageseite gibt den ORT mit — sonst ist die Zahl eine andere", () => {
    /* "23 verfuegbar" und "23 verfuegbar in Muenster" sind verschiedene
       Aussagen. Wer den Ort wechselt, bekommt neue Zahlen. */
    assert.match(nachfrage, /city: ort \|\| null/,
      "die Bestandszahlen ignorieren den Ort");
    assert.match(nachfrage, /addEventListener\("change", function \(\) \{\s*\n?\s*if \(\(ortFeld\.value \|\| ""\)\.trim\(\) !== letzterOrt\) aufsetzen\(\);/,
      "ein Ortswechsel laesst die alten Zahlen stehen");
  });

  it("der Waehler liest den Katalog aus dem BACKEND, nicht aus dem Browser", () => {
    /*
     * `mitarbeiter.js` traegt eine eigene, fest verdrahtete Liste. Sie ist eine
     * zweite Wahrheit neben `platform_skills` — ohne Aliase, ohne Bestand, und
     * sie veraltet lautlos. Der neue Waehler darf sie nicht erben.
     */
    assert.match(picker, /hole\("\/skills\/catalog"\)/,
      "der Waehler holt den Katalog nicht vom Backend");
    assert.ok(!/SKILL_CATALOG_GROUPS/.test(picker),
      "der Waehler hat die fest verdrahtete Liste aus mitarbeiter.js uebernommen");
  });

  it("der eigene Begriff wird gefuehrt, nicht abgewiesen", () => {
    assert.match(picker, /fetch\("\/api\/skills\/propose"/,
      "es gibt keinen Weg fuer einen Begriff, der nicht im Katalog steht");
    assert.match(picker, /res\.matched && res\.skill && res\.skill\.name/,
      "die Antwort auf eine bekannte Schreibvariante wird nicht ausgewertet — "
      + "dann fuehrt `Gabelstaplerfahrer` zu nichts");
    /* BEIDES: gezeichnet UND gebunden. Der Name kommt zweimal vor — im Knopf
       und im Klick-Handler. Eine Probe, die ihn irgendwo findet, ist zufrieden,
       sobald EINE der beiden Stellen steht; eine Rueckmutation hat genau das
       ausgenutzt. Ein Knopf ohne Handler tut nichts, ein Handler ohne Knopf
       ebenso. */
    assert.match(picker, /'<button type="button" class="skp-knopf" data-skp-waehle="'/,
      "es werden keine nahen Begriffe zum Anklicken angeboten");
    assert.match(picker, /closest\("\[data-skp-waehle\]"\)/,
      "die nahen Begriffe sind an keinen Handler gebunden — sie tun nichts");
    assert.match(picker, /"X-CSRF-Token": token/,
      "der Vorschlag geht ohne CSRF-Merkmal hinaus");
  });

  it("alles, was in Markup landet, ist escaped", () => {
    assert.match(picker, /function esc\(v\)/, "der Waehler hat kein esc()");
    assert.match(picker, /\.replace\(\/"\/g, "&quot;"\)/,
      "Anfuehrungszeichen bleiben stehen — ein Katalogname braeche aus dem Attribut aus");
    /* Die Namen kommen aus der Datenbank und sind zum Teil von Nutzern
       vorgeschlagen worden. Sie sind Daten, nicht Markup. */
    /* `esc(s.name)` kommt an ZWEI Stellen vor (Attribut und Text). Eine
       Textsuche ist zufrieden, sobald eine davon steht — die eigentliche
       Pruefung steht deshalb weiter unten als Laufzeit-Probe mit einem
       Katalognamen, der Markup enthaelt. */
    assert.match(picker, /esc\(suche\)/, "die Eingabe wird ungeprueft zurueckgezeichnet");
  });

  it("der Waehler bringt sein Stilblatt mit", () => {
    /* Die beiden Zielseiten laden `enterprise.css`, andere `design-system.css`.
       Ein Bauteil, das seine Gestalt aus einer bestimmten Datei bezieht, ist nur
       dort einsetzbar — und in keinem Folgeprojekt. */
    assert.match(picker, /id = "tc-skillpicker-stil"/,
      "der Waehler haengt an einem fremden Stilblatt");
    assert.match(picker, /if \(document\.getElementById\("tc-skillpicker-stil"\)\) return;/,
      "zwei Waehler auf einer Seite legen das Stilblatt zweimal an");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4. Der Waehler laeuft wirklich — Katalog rein, DOM raus
   ═══════════════════════════════════════════════════════════════════════ */

const KATALOG = {
  available: true, total: 3, category_count: 2,
  categories: [
    { category: "Logistik & Lager", skill_count: 2, skills: [
      { id: "s1", name: "Stapler", aliases: ["Gabelstapler", "Staplerfahrer"], usage_count: 9 },
      { id: "s2", name: "Kommissionierung", aliases: [], usage_count: 4 }
    ] },
    { category: "IT & Fachkraefte", skill_count: 1, skills: [
      { id: "s3", name: "SAP", aliases: [], usage_count: 2 }
    ] }
  ]
};

function waehlerLauf(js, { initial = [], showAvailability = false, bestand = [], portionFaellt = -1 } = {}) {
  const knoten = new Map();
  const mache = (id) => ({
    id, _html: "", value: "", hidden: false,
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); },
    textContent: "", classList: { add() {}, remove() {}, toggle() {} },
    _lauscher: [],
    addEventListener(a, f) { this._lauscher.push([a, f]); },
    querySelector: () => null,
    appendChild() {}, setAttribute() {}, getAttribute: () => null,
    focus() {}, setSelectionRange() {}, dispatchEvent() { return true; }
  });

  const abrufe = [];
  const document_ = {
    readyState: "complete",
    head: { appendChild() {} },
    getElementById(id) {
      if (id === "tc-skillpicker-stil") return null;
      if (!knoten.has(id)) knoten.set(id, mache(id));
      return knoten.get(id);
    },
    createElement: () => mache("stil"),
    addEventListener() {},
    querySelector: () => null
  };

  let bestandsRuf = 0;
  const fetch_ = (url) => {
    abrufe.push(String(url));
    if (String(url).includes("/by-skill")) {
      /* `portionFaellt` laesst genau eine Portion scheitern - so laesst sich
         pruefen, dass ihre Faehigkeiten OHNE Zahl bleiben statt mit einer 0. */
      const meine = bestandsRuf++;
      if (meine === portionFaellt) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: "SERVER_ERROR" }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: bestand, count: bestand.length }) });
    }
    const d = String(url).includes("/skills/catalog") ? KATALOG : {};
    return Promise.resolve({ ok: true, json: () => Promise.resolve(d) });
  };

  const sandkasten = {
    document: document_, window: {}, fetch: fetch_,
    console: { log() {}, warn() {}, error() {} },
    Promise, Math, Number, String, Array, JSON, Set, Map, Object, RegExp,
    encodeURIComponent, Event: function () {}, CustomEvent: function () {}
  };
  sandkasten.window.document = document_;
  vm.createContext(sandkasten);
  vm.runInContext(js, sandkasten, { filename: "skillPicker.js" });

  const instanz = sandkasten.window.TCSkillPicker.mount({
    container: "ziel", hiddenInput: "feld", initial, showAvailability
  });
  return { knoten, abrufe, instanz, sandkasten };
}

describe("N1.1 · der Waehler zeichnet den Katalog wirklich",
  { skip: oberflaecheDa ? false : "frontend/public nicht im Abbild" }, () => {

  const js = oberflaecheDa ? fs.readFileSync(PICKER, "utf8") : "";

  it("er holt den Katalog und zeichnet Kategorien und Optionen", async () => {
    const { knoten, abrufe } = waehlerLauf(js);
    await new Promise((f) => setTimeout(f, 30));
    assert.ok(abrufe.some((u) => u.endsWith("/api/skills/catalog")),
      "der Katalog wird nicht geholt: " + abrufe.join(", "));
    const html = knoten.get("ziel").innerHTML;
    assert.match(html, /Logistik &amp; Lager/, "die Kategorie fehlt (und ihr &amp; ist nicht escaped)");
    assert.match(html, /data-skp-um="Stapler"/, "die Faehigkeit ist nicht anklickbar");
    assert.match(html, /data-skp-um="SAP"/);
  });

  it("eine Vorbelegung aus dem Katalog wird uebernommen und ins Feld geschrieben", async () => {
    const { knoten } = waehlerLauf(js, { initial: ["Stapler", "SAP"] });
    await new Promise((f) => setTimeout(f, 30));
    assert.equal(knoten.get("feld").value, "Stapler, SAP",
      "die Auswahl erreicht das Formular nicht — abgeschickt wuerde nichts");
  });

  it("EIN ALTER FREITEXT-WERT KEHRT NICHT DURCH DIE HINTERTUER ZURUECK", async () => {
    /*
     * Beim Bearbeiten einer alten Ausschreibung stehen dort Begriffe, die es im
     * Katalog nie gab. Sie einfach zu uebernehmen hiesse, die ganze Welle
     * rueckgaengig zu machen — und zwar unsichtbar. Sie fallen weg, und das
     * wird GESAGT.
     */
    const { knoten } = waehlerLauf(js, { initial: ["Stapler", "Irgendwas Getipptes"] });
    await new Promise((f) => setTimeout(f, 30));
    assert.equal(knoten.get("feld").value, "Stapler",
      "ein Begriff ausserhalb des Katalogs wurde uebernommen");
    assert.match(knoten.get("ziel").innerHTML, /Irgendwas Getipptes/,
      "der weggefallene Begriff wird verschwiegen — der Nutzer merkt den Verlust nie");
  });

  it("EINE VORBELEGUNG MIT ALIAS GEHT NICHT VERLOREN", async () => {
    /*
     * Gefunden erst durch einen Lauf gegen die ECHTEN Katalogdaten: kanonisch
     * heisst es "Staplerfahrer:in", in alten Anzeigen steht "Gabelstaplerfahrer"
     * — und das ist ein hinterlegter Alias.
     *
     * Die erste Fassung verglich nur NAMEN. Beim Bearbeiten waere die
     * Faehigkeit damit weggefallen, obwohl die Plattform genau weiss, was
     * gemeint ist. Die Suche im Waehler kannte die Aliase laengst; die
     * Vorbelegung nicht — eine Ungleichheit, die man einer erfundenen
     * Vorrichtung nicht ansieht, weil man sie selbst erfindet.
     */
    const { knoten } = waehlerLauf(js, { initial: ["Gabelstapler"] });
    await new Promise((f) => setTimeout(f, 30));
    assert.equal(knoten.get("feld").value, "Stapler",
      "ein hinterlegter Alias wurde verworfen statt aufgeloest");
    assert.ok(!/Gabelstapler<\/div>|skp-meldung--hinweis/.test(knoten.get("ziel").innerHTML),
      "der Alias wurde als `nicht im Katalog` gemeldet, obwohl er aufgeloest wurde");
  });

  it("ein NAME schlaegt einen fremden Alias", async () => {
    /* Kollidieren Name und Alias, gewinnt der Name — sonst zoege ein Alias
       eine echte Faehigkeit auf einen anderen Begriff. */
    const { sandkasten } = waehlerLauf(js);
    await new Promise((f) => setTimeout(f, 20));
    const kollision = {
      available: true, total: 2, category_count: 1,
      categories: [{ category: "K", skill_count: 2, skills: [
        { id: "a", name: "Alpha", aliases: ["Beta"], usage_count: 0 },
        { id: "b", name: "Beta", aliases: [], usage_count: 0 }
      ] }]
    };
    const jsK = js.replace(
      'if (!katalogVersprechen) katalogVersprechen = hole("/skills/catalog");',
      "if (!katalogVersprechen) katalogVersprechen = Promise.resolve(" + JSON.stringify(kollision) + ");");
    const { knoten } = waehlerLauf(jsK, { initial: ["Beta"] });
    await new Promise((f) => setTimeout(f, 30));
    assert.equal(knoten.get("feld").value, "Beta",
      "der Alias von `Alpha` hat den echten Namen `Beta` ueberschrieben");
    void sandkasten;
  });

  it("teilen sich ZWEI Faehigkeiten einen Alias, gewinnt immer dieselbe", async () => {
    /*
     * Die Waechter-Klausel in der Alias-Schleife entscheidet genau DIESEN Fall
     * — nicht den Fall Name-gegen-Alias, den die Reihenfolge schon regelt (die
     * Namen werden danach gesetzt und ueberschreiben jeden Alias). Das hat eine
     * ueberlebende Rueckmutation gezeigt: ohne diese Probe waere die Klausel
     * ein Zweig ohne Nachweis gewesen.
     *
     * Warum die Bestimmtheit zaehlt: ohne sie entscheidet die REIHENFOLGE im
     * Katalog, auf welchen Begriff eine alte Anzeige gezogen wird — und die
     * aendert sich, sobald jemand eine Faehigkeit anlegt. Dieselbe Anzeige
     * bekaeme dann beim naechsten Bearbeiten eine andere Faehigkeit.
     */
    const geteilt = {
      available: true, total: 2, category_count: 1,
      categories: [{ category: "K", skill_count: 2, skills: [
        { id: "a", name: "Erste", aliases: ["Geteilt"], usage_count: 0 },
        { id: "b", name: "Zweite", aliases: ["Geteilt"], usage_count: 0 }
      ] }]
    };
    const jsG = js.replace(
      'if (!katalogVersprechen) katalogVersprechen = hole("/skills/catalog");',
      "if (!katalogVersprechen) katalogVersprechen = Promise.resolve(" + JSON.stringify(geteilt) + ");");
    const { knoten } = waehlerLauf(jsG, { initial: ["Geteilt"] });
    await new Promise((f) => setTimeout(f, 30));
    assert.equal(knoten.get("feld").value, "Erste",
      "der geteilte Alias fuehrt nicht zur ERSTEN Faehigkeit — dann haengt das "
      + "Ergebnis an der Reihenfolge im Katalog und aendert sich bei der naechsten Ergaenzung");
  });

  it("die Vorbelegung wird auf die Schreibweise des Katalogs gezogen", async () => {
    const { knoten } = waehlerLauf(js, { initial: ["stapler"] });
    await new Promise((f) => setTimeout(f, 30));
    assert.equal(knoten.get("feld").value, "Stapler",
      "die Kleinschreibung blieb stehen — genau die Schreibvariante, die niemand findet");
  });

  it("die Bestandszahl steht neben der Faehigkeit", async () => {
    const { knoten, abrufe } = waehlerLauf(js, {
      showAvailability: true,
      bestand: [{ skill: "Stapler", entry_count: 4, total_headcount: 23, cities: ["Muenster"] }]
    });
    await new Promise((f) => setTimeout(f, 40));
    assert.ok(abrufe.some((u) => u.includes("/capacity-discovery/by-skill")),
      "die Zahlen werden nicht geholt");
    const html = knoten.get("ziel").innerHTML;
    assert.match(html, /skp-zahl--da[^>]*>23</, "die 23 steht nicht neben Stapler");
    assert.match(html, /skp-zahl--leer/,
      "eine Faehigkeit ohne Bestand traegt keine 0 — dann sieht sie aus wie ungeprueft");
  });

  it("DIE ZAHLEN KOMMEN IN PORTIONEN, die zur Obergrenze der Route passen", async () => {
    /*
     * Der Fehler, der beim ersten Bauen fast durchgerutscht waere: die Route
     * nimmt hoechstens 100 Faehigkeiten je Anfrage (bewusst). Der echte Katalog
     * traegt 162. Wer alle auf einmal schickt, bekommt Zahlen fuer 100 — und
     * die uebrigen 62 hier mit einer 0.
     *
     * Eine 0 sieht aus wie eine Antwort ("niemand verfuegbar") und waere in
     * Wahrheit "nie gefragt". Genau die stille Falschaussage, gegen die die
     * Zahl gebaut ist.
     */
    const viele = {
      available: true, total: 250, category_count: 1,
      categories: [{ category: "Viele", skill_count: 250, skills:
        Array.from({ length: 250 }, (_, i) => ({ id: "s" + i, name: "F" + i, aliases: [], usage_count: 0 })) }]
    };
    const jsViele = js.replace(
      'if (!katalogVersprechen) katalogVersprechen = hole("/skills/catalog");',
      "if (!katalogVersprechen) katalogVersprechen = Promise.resolve(" + JSON.stringify(viele) + ");");

    const { abrufe, knoten } = waehlerLauf(jsViele, { showAvailability: true, bestand: [] });
    await new Promise((f) => setTimeout(f, 60));

    const anfragen = abrufe.filter((u) => u.includes("/by-skill"));
    assert.equal(anfragen.length, 3, `250 Faehigkeiten muessen 3 Anfragen ergeben, waren ${anfragen.length}`);
    for (const u of anfragen) {
      const liste = decodeURIComponent((u.match(/skills=([^&]*)/) || [])[1] || "").split(",").filter(Boolean);
      assert.ok(liste.length <= 100,
        `eine Anfrage trug ${liste.length} Faehigkeiten — die Route wirft alles ab 101 weg`);
    }
    /* Und die letzte Faehigkeit hat trotzdem ihre Marke bekommen. */
    assert.match(knoten.get("ziel").innerHTML, /data-skp-um="F249"[\s\S]{0,200}skp-zahl/,
      "die letzte Faehigkeit blieb ohne Zahl — sie war in keiner Portion");
  });

  it("EINE AUSGEFALLENE PORTION LAESST KEINE NULLEN ZURUECK", async () => {
    /*
     * Der Unterschied, um den es bei dieser Zahl ueberhaupt geht: "niemand
     * verfuegbar" und "nicht gefragt" sehen als 0 gleich aus, sind aber
     * gegensaetzliche Aussagen. Faellt eine Portion aus, bleiben ihre
     * Faehigkeiten deshalb OHNE Marke - unbekannt ist ehrlicher als falsch.
     *
     * Diese Probe gab es zuerst nicht, und eine Rueckmutation hat die Luecke
     * genutzt: sie schrieb die Nullen fuer ALLE Namen statt nur fuer die der
     * geglueckten Portion, und nichts wurde rot.
     */
    const viele = {
      available: true, total: 150, category_count: 1,
      categories: [{ category: "Viele", skill_count: 150, skills:
        Array.from({ length: 150 }, (_, i) => ({ id: "s" + i, name: "F" + i, aliases: [], usage_count: 0 })) }]
    };
    const jsViele = js.replace(
      'if (!katalogVersprechen) katalogVersprechen = hole("/skills/catalog");',
      "if (!katalogVersprechen) katalogVersprechen = Promise.resolve(" + JSON.stringify(viele) + ");");

    /* Die ZWEITE Portion faellt aus (F100..F149). */
    const { knoten } = waehlerLauf(jsViele, { showAvailability: true, bestand: [], portionFaellt: 1 });
    await new Promise((f) => setTimeout(f, 60));
    const html = knoten.get("ziel").innerHTML;

    const marke = (name) => {
      const i = html.indexOf('data-skp-um="' + name + '"');
      if (i < 0) return "fehlt";
      const bis = html.indexOf("</label>", i);
      return /skp-zahl/.test(html.slice(i, bis)) ? "hat-zahl" : "ohne-zahl";
    };
    assert.equal(marke("F0"), "hat-zahl",
      "die geglueckte Portion traegt keine Zahl");
    assert.equal(marke("F149"), "ohne-zahl",
      "eine Faehigkeit aus der AUSGEFALLENEN Portion traegt eine 0 — das liest sich als "
      + "\"niemand verfuegbar\" und ist in Wahrheit \"nicht gefragt\"");
  });

  it("ohne `showAvailability` wird gar nicht erst gefragt", async () => {
    const { abrufe } = waehlerLauf(js, { showAvailability: false });
    await new Promise((f) => setTimeout(f, 30));
    assert.ok(!abrufe.some((u) => u.includes("/by-skill")),
      "die Angebotsseite holt Zahlen, die sie nicht zeigt");
  });

  it("der Katalog wird EINMAL geholt, auch bei zwei Waehlern", async () => {
    /* Zwei Wähler auf einer Seite sind moeglich (Formular + Filter). Der
       Katalog gilt plattformweit; ihn zweimal zu holen ist Verschwendung im
       heissesten Moment der Seite. */
    const { abrufe, sandkasten } = waehlerLauf(js);
    await new Promise((f) => setTimeout(f, 20));
    sandkasten.window.TCSkillPicker.mount({ container: "zweitziel", hiddenInput: "feld2" });
    await new Promise((f) => setTimeout(f, 20));
    assert.equal(abrufe.filter((u) => u.endsWith("/api/skills/catalog")).length, 1,
      "der Katalog wurde mehrfach geholt");
  });

  it("EIN KATALOGNAME MIT MARKUP LANDET NICHT ALS MARKUP IM DOM", async () => {
    /*
     * Die Namen stehen in `platform_skills` — und dort landen auch VORSCHLAEGE
     * von Nutzern (`POST /skills/propose` schreibt mit `status='proposed'`).
     * Wird einer davon freigegeben, steht Nutzertext im Katalog. Er ist Daten,
     * nie Markup.
     *
     * Diese Probe ersetzt eine Textsuche nach `esc(s.name)`, die eine
     * Rueckmutation ueberlebt hat: der Aufruf kommt zweimal vor, und die Suche
     * war schon mit einem zufrieden.
     */
    const boese = {
      available: true, total: 1, category_count: 1,
      categories: [{ category: "Test", skill_count: 1, skills: [
        { id: "x", name: '<img src=x onerror=alarm()>', aliases: [], usage_count: 0 }
      ] }]
    };
    const jsBoese = js.replace(
      'if (!katalogVersprechen) katalogVersprechen = hole("/skills/catalog");',
      "if (!katalogVersprechen) katalogVersprechen = Promise.resolve("
      + JSON.stringify(boese) + ");");
    const { knoten } = waehlerLauf(jsBoese);
    await new Promise((f) => setTimeout(f, 30));
    const html = knoten.get("ziel").innerHTML;
    assert.ok(!/<img/.test(html), "ein Katalogname mit Markup wurde als Markup eingesetzt");
    /*
     * `onerror=` DARF als escapter Text dastehen — genau das ist der Beweis,
     * dass es nicht mehr als Merkmal gelesen wird. Die erste Fassung dieser
     * Probe verbot die Zeichenfolge ueberhaupt und klagte damit die RICHTIGE
     * Loesung an. Entscheidend ist nicht, ob die Zeichen vorkommen, sondern ob
     * daraus ein Element wird.
     *
     * Gezaehlt wird deshalb: kein einziges `<` aus dem Namen ueberlebt roh.
     * Der Name kommt zweimal vor (Attribut und Text), also muessen es genau
     * zwei escapte Vorkommen sein — und null rohe.
     */
    const roh = (html.match(/<img/g) || []);
    assert.deepEqual(roh, [],
      "aus dem Namen ist ein Element geworden — ohne Tag kann `onerror` kein Merkmal sein, "
      + "deshalb ist genau DAS die Pruefung und nicht das Vorkommen der Zeichenfolge");
    assert.equal((html.match(/&lt;img/g) || []).length, 2,
      "der Name steht nicht an beiden Stellen escapt (Attribut und sichtbarer Text)");
    assert.match(html, /&lt;img/, "der Name taucht gar nicht auf — die Probe prueft nichts");
    assert.match(html, /data-skp-um="&lt;img/,
      "im ATTRIBUT ist der Name ungeprueft — dort bricht er ohne ein spitzes Zeichen aus");
  });

  it("die Aehnlichkeit findet den nahen Begriff, aber nicht jeden", async () => {
    const { sandkasten } = waehlerLauf(js);
    const nah = sandkasten.window.TCSkillPicker._aehnlichkeit;
    assert.equal(nah("Stapler", "Stapler"), 1);
    assert.ok(nah("Gabelstapler", "Stapler") > 0.5, "die Teilzeichenkette wird nicht erkannt");
    assert.equal(nah("Stapler", "SAP"), 0, "voellig Fremdes gilt als aehnlich");
    assert.equal(nah("", "Stapler"), 0);
  });
});
