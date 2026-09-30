/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WELLE N2.11 — WAS DIE GEGENPRUEFUNG IM BROWSER FAND
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Vier Befunde der adversarischen Pruefung vom 2026-09-15, hier AUSGEFUEHRT:
 *
 *  1. Wiederhergestellte Faehigkeiten erschienen nicht im Katalogwaehler — sie
 *     wurden unsichtbar mitgesendet oder beim ersten Klick still verworfen.
 *  2. Das Absenden scheiterte LAUTLOS an ungueltigen Pflicht-/Bereichsfeldern in
 *     ausgeblendeten Schritten (vor allem nach einem erfolgreichen Absenden:
 *     `form.reset()` leert, der Assistent blieb im letzten Schritt stehen).
 *  3. Die Eingabetaste blaetterte auch auf Knoepfen weiter — "Zurueck" sprang
 *     vorwaerts — und zusaetzlich im Suchfeld des Katalogwaehlers.
 *  4. Die Treffer-Vorschau blieb nach dem Wiederherstellen unsichtbar, bis ein
 *     Feld angefasst wurde.
 *
 * Dazu der Wettlauf in der Dispo-Ansicht (workerSubmissionsReview.js): nach dem
 * Warten auf die Kundensperren schrieb der alte Einsatz Zeitraum und Sperren in
 * den inzwischen gewaehlten.
 *
 * Lauf: node --test --test-force-exit test/gegenpruefungFrontend.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.resolve(HIER, "..", "..", "frontend", "public");
const SEITE = path.join(PUB, "marketplace_demand_create.html");
const DISPO = path.join(PUB, "js", "pages", "workerSubmissionsReview.js");
const da = fs.existsSync(SEITE) && fs.existsSync(DISPO);
const html = da ? fs.readFileSync(SEITE, "utf8") : "";
const dispo = da ? fs.readFileSync(DISPO, "utf8") : "";

/* ── Der Assistent in einer Sandbox ─────────────────────────────────────── */

function assistent({ ort = "", ungueltig = null } = {}) {
  const von = html.indexOf("var SCHRITTE = [");
  const bis = html.indexOf("window.__tcAssistent");
  assert.ok(von > 0 && bis > von, "der Assistent liegt nicht mehr, wo er lag");
  const quelle = html.slice(von, bis);

  const knoten = new Map();
  const abrufe = [];
  const dokumentHoerer = {};

  function neu(id, art) {
    const k = {
      id, value: "", defaultValue: "", textContent: "", innerHTML: "", hidden: false,
      tagName: art || "INPUT", noValidate: false,
      _klassen: new Set(), _attr: {}, _hoerer: {}, _fokus: false, _gemeldet: false,
      classList: {
        toggle: (n, an) => { if (an) k._klassen.add(n); else k._klassen.delete(n); },
        contains: (n) => k._klassen.has(n)
      },
      setAttribute: (a, v) => { k._attr[a] = String(v); },
      getAttribute: (a) => (a in k._attr ? k._attr[a] : null),
      removeAttribute: (a) => { delete k._attr[a]; },
      addEventListener: (art2, fn) => { (k._hoerer[art2] = k._hoerer[art2] || []).push(fn); },
      dispatchEvent: () => true,
      closest: (w) => (w === "#skillPicker" ? k._imWaehler || null : k._traeger || null),
      focus: () => { k._fokus = true; },
      scrollIntoView: () => {},
      /* Die Browser-Pruefung, wie sie das Formular kennt. */
      checkValidity: () => !(ungueltig && ungueltig.id === id),
      reportValidity: () => { k._gemeldet = true; return k.checkValidity(); },
      get validationMessage() { return ungueltig && ungueltig.id === id ? (ungueltig.text || "ungueltig") : ""; },
      klick: () => (k._hoerer.click || []).forEach((fn) => fn()),
      taste: (e) => (k._hoerer.keydown || []).forEach((fn) => fn(e)),
      absenden: (e) => (k._hoerer.submit || []).forEach((fn) => fn(e))
    };
    knoten.set(id, k);
    return k;
  }

  const FELDER = ["location_city", "location_postal", "radius_km", "title", "role", "skill_tags",
    "headcount", "start_date", "end_date", "urgencyAnzeige", "preisVorschlag",
    "budget_min", "budget_max", "contact_name", "contact_phone"];
  FELDER.forEach((id) => {
    const feld = neu(id);
    feld._traeger = neu("traeger:" + id, "DIV");
  });
  ["asLeiste", "asKopf", "asHinweis", "asZurueck", "asWeiter", "submitBtn", "asZaehler", "asFehler", "asTreffer"]
    .forEach((id) => neu(id, id === "asLeiste" ? "UL" : "DIV"));
  const form = neu("demandForm", "FORM");
  knoten.get("location_city").value = ort;

  const hinweise = {
    "dem.create.contactHint": neu("hinweis:kontakt", "P"),
    "dem.create.urgencyHint": neu("hinweis:notdienst", "P")
  };

  const umgebung = {
    document: {
      readyState: "loading",
      getElementById: (id) => knoten.get(id) || null,
      querySelector: (w) => {
        if (w === "form") return form;
        const treffer = /data-i18n='([^']+)'/.exec(w);
        return treffer ? (hinweise[treffer[1]] || null) : null;
      },
      createElement: () => {
        const n = { textContent: "", get innerHTML() { return String(n.textContent); } };
        return n;
      },
      addEventListener: (art, fn) => { (dokumentHoerer[art] = dokumentHoerer[art] || []).push(fn); }
    },
    window: {}, Event: function () {}, Number, String, Math, Object, Array, JSON, RegExp,
    setTimeout, clearTimeout,
    console: { log() {}, warn() {}, error() {} },
    fetch: (url) => {
      abrufe.push(String(url));
      return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
    }
  };
  vm.createContext(umgebung);
  vm.runInContext(quelle
    + "\nglobalThis._start = start;"
    + "\nglobalThis._gehe = gehe;"
    + "\nglobalThis._jetzt = function(){ return jetzt; };"
    + "\nglobalThis._schritte = SCHRITTE;",
    umgebung, { filename: "assistent" });

  return {
    umgebung, knoten, form, abrufe, dokumentHoerer,
    feld: (id) => knoten.get(id),
    melden: (art, e) => (dokumentHoerer[art] || []).forEach((fn) => fn(e))
  };
}

/* Die Pflichtfelder aller Schritte fuellen — sonst blaettert der Assistent zu
   Recht nicht weiter, und die Probe misst die falsche Sache. */
function pflichtGefuellt(a) {
  a.umgebung._schritte.forEach((s) => (s.pflicht || []).forEach((id) => {
    const f = a.feld(id);
    if (f && !f.value) f.value = id.includes("date") ? "2027-01-01" : "x";
  }));
}

/* Arrays aus der Sandbox sind fremde Objekte — der strenge Vergleich sieht das. */
const wie = (x) => JSON.parse(JSON.stringify(x));

/* Ein Ereignis, das mitschreibt, was mit ihm geschah. */
const ereignis = (ueber = {}) => ({
  key: "Enter", defaultPrevented: false, _gestoppt: false,
  preventDefault() { this.defaultPrevented = true; },
  stopImmediatePropagation() { this._gestoppt = true; },
  ...ueber
});

describe("N2.11 · das Absenden scheitert nicht mehr lautlos", { skip: !da && "Seite fehlt" }, () => {

  it("die Browser-Pruefung wird abgeschaltet — sonst blockiert sie unsichtbar", () => {
    const a = assistent();
    a.umgebung._start();
    assert.strictEqual(a.form.noValidate, true,
      "die native Pruefung laeuft weiter: ein ausgeblendetes ungueltiges Feld bricht das Absenden ohne Meldung ab");
  });

  it("ein ungueltiges Feld aus einem ANDEREN Schritt: kein Absenden, Sprung dorthin, Meldung", () => {
    const a = assistent({ ungueltig: { id: "title", text: "Bitte ausfuellen." } });
    a.umgebung._start();
    pflichtGefuellt(a);
    a.umgebung._gehe(1); a.umgebung._gehe(1); a.umgebung._gehe(1); a.umgebung._gehe(1);
    const vorher = a.umgebung._jetzt();
    const e = ereignis({ type: "submit" });
    a.form.absenden(e);
    assert.strictEqual(e.defaultPrevented, true, "das Formular wurde trotzdem abgeschickt");
    assert.strictEqual(e._gestoppt, true, "der eigentliche Absende-Handler laeuft trotzdem weiter");
    assert.notStrictEqual(a.umgebung._jetzt(), vorher, "der Assistent blieb stehen, wo der Fehler nicht zu sehen ist");
    const titelSchritt = a.umgebung._schritte.findIndex((s) => s.felder.indexOf("title") >= 0);
    assert.strictEqual(a.umgebung._jetzt(), titelSchritt);
    assert.strictEqual(a.feld("asFehler").hidden, false, "es erscheint keine Meldung");
    assert.match(a.feld("asFehler").textContent, /Bitte ausfuellen\./);
    assert.strictEqual(a.feld("title")._fokus, true, "das ungueltige Feld bekommt keinen Fokus");
  });

  it("ist alles gueltig, laesst der Assistent das Absenden durch", () => {
    const a = assistent();
    a.umgebung._start();
    const e = ereignis({ type: "submit" });
    a.form.absenden(e);
    assert.strictEqual(e.defaultPrevented, false, "ein gueltiges Formular wurde aufgehalten");
    assert.strictEqual(e._gestoppt, false);
  });

  it("nach dem Anlegen faengt der Assistent von vorn an", () => {
    /* `form.reset()` leert die Pflichtfelder der frueheren Schritte. Bleibt der
       Assistent im letzten Schritt, laeuft der naechste Klick auf "Absenden" in
       ein ausgeblendetes leeres Pflichtfeld. */
    const a = assistent();
    a.umgebung._start();
    pflichtGefuellt(a);
    a.umgebung._gehe(1); a.umgebung._gehe(1);
    assert.ok(a.umgebung._jetzt() > 0, "Probe ohne Gegenstand: der Assistent steht schon am Anfang");
    a.melden("tc:bedarf-angelegt", {});
    assert.strictEqual(a.umgebung._jetzt(), 0, "der Assistent bleibt im letzten Schritt stehen");
  });
});

describe("N2.11 · die Eingabetaste blaettert nur aus einem Eingabefeld", { skip: !da && "Seite fehlt" }, () => {

  const mitTaste = (ziel, ueber = {}) => {
    const a = assistent();
    a.umgebung._start();
    pflichtGefuellt(a);
    const vorher = a.umgebung._jetzt();
    a.form.taste(ereignis({ target: ziel(a), ...ueber }));
    return { a, vorher };
  };

  it("aus einem Textfeld: weiter", () => {
    const { a, vorher } = mitTaste((x) => x.feld("location_city"));
    assert.strictEqual(a.umgebung._jetzt(), vorher + 1, "aus dem Feld heraus blaettert sie nicht mehr");
  });

  /* WICHTIG: erst die Pflichtfelder fuellen. Sonst blaettert der Assistent
     ohnehin nicht weiter, und die Probe saehe keinen Unterschied — genau daran
     haben zwei Rueckmutationen ueberlebt (gemessen 2026-09-16). */
  const nichtWeiter = (ziel, ueber = {}) => {
    const a = assistent();
    a.umgebung._start();
    pflichtGefuellt(a);
    const vorher = a.umgebung._jetzt();
    // Vorbedingung: aus einem Feld heraus WUERDE sie blaettern.
    const gegenprobe = assistent();
    gegenprobe.umgebung._start();
    pflichtGefuellt(gegenprobe);
    gegenprobe.form.taste(ereignis({ target: gegenprobe.feld("location_city") }));
    assert.strictEqual(gegenprobe.umgebung._jetzt(), vorher + 1,
      "Probe ohne Gegenstand: die Eingabetaste blaettert hier gar nicht");
    a.form.taste(ereignis({ target: ziel(a), ...ueber }));
    return { a, vorher };
  };

  it("auf einem Knopf: NICHT weiter — sonst springt 'Zurueck' vorwaerts", () => {
    const { a, vorher } = nichtWeiter((x) => {
      const knopf = x.feld("asZurueck");
      knopf.tagName = "BUTTON";
      return knopf;
    });
    assert.strictEqual(a.umgebung._jetzt(), vorher, "die Eingabetaste auf einem Knopf blaettert weiter");
  });

  it("im Suchfeld des Katalogwaehlers: NICHT weiter — die Taste gehoert dem Waehler", () => {
    const { a, vorher } = nichtWeiter((x) => {
      const suchfeld = x.feld("skill_tags");
      suchfeld._imWaehler = { id: "skillPicker" };
      return suchfeld;
    });
    assert.strictEqual(a.umgebung._jetzt(), vorher, "der Assistent blaettert zusaetzlich zum Waehler weiter");
  });

  it("wenn jemand anderes die Taste schon behandelt hat: NICHT weiter", () => {
    const { a, vorher } = nichtWeiter((x) => x.feld("location_city"), { defaultPrevented: true });
    assert.strictEqual(a.umgebung._jetzt(), vorher);
  });
});

describe("N2.11 · die Treffer-Vorschau meldet sich auch nach dem Wiederherstellen", { skip: !da && "Seite fehlt" }, () => {

  it("mit vorbelegtem Ort wird die Zahl sofort geholt", () => {
    const a = assistent({ ort: "Münster" });
    a.umgebung._start();
    assert.ok(a.abrufe.some((u) => u.includes("/api/geo/coordinates")),
      "nach dem Wiederherstellen bleibt die Vorschau stumm: " + JSON.stringify(a.abrufe));
  });

  it("ohne Ort wird nichts geholt — kein Abruf auf Verdacht", () => {
    const a = assistent({ ort: "" });
    a.umgebung._start();
    assert.equal(a.abrufe.some((u) => u.includes("/api/geo/coordinates")), false);
  });
});

describe("N2.11 · der Katalogwaehler kennt die wiederhergestellten Faehigkeiten", { skip: !da && "Seite fehlt" }, () => {

  function waehlerBlock({ feldWert }) {
    const von = html.indexOf("var waehler = null;");
    const bis = html.indexOf("})();", von);
    assert.ok(von > 0 && bis > von, "der Katalogwaehler-Block liegt nicht mehr, wo er lag");
    const gemountet = [];
    const felder = {
      location_city: { id: "location_city", value: "Münster", addEventListener() {} },
      skill_tags: { id: "skill_tags", value: feldWert, addEventListener() {} },
      skillPicker: { id: "skillPicker" }
    };
    const umgebung = {
      document: {
        readyState: "loading",
        getElementById: (id) => felder[id] || null,
        addEventListener: () => {}
      },
      TCSkillPicker: { mount: (opt) => { gemountet.push(opt); return { werte: () => opt.initial, neu() {} }; } },
      String, Array, Object, Number, console: { log() {}, warn() {}, error() {} }
    };
    vm.createContext(umgebung);
    vm.runInContext(html.slice(von, bis) + "\nglobalThis._start = start;", umgebung, { filename: "waehler" });
    umgebung._start();
    return gemountet;
  }

  it("beim ersten Aufsetzen kommt die Vorauswahl aus dem versteckten Feld", () => {
    /* Der Waehler liest NUR `opt.initial` (skillPicker.js). Stand dort `[]`,
       waren die wiederhergestellten Faehigkeiten unsichtbar — und der erste
       Klick im Waehler hat sie ueberschrieben. */
    const [erster] = waehlerBlock({ feldWert: "Pflege, Nachtdienst" });
    assert.ok(erster, "der Waehler wurde gar nicht aufgesetzt");
    assert.deepEqual(wie(erster.initial), ["Pflege", "Nachtdienst"]);
    assert.strictEqual(erster.hiddenInput, "skill_tags");
  });

  it("ohne Entwurf bleibt die Vorauswahl leer", () => {
    const [erster] = waehlerBlock({ feldWert: "" });
    assert.deepEqual(wie(erster.initial), []);
  });
});

describe("N2.11 · die Dispo-Auswahl: wer nach dem Warten schreibt, muss noch gemeint sein", { skip: !da && "Seite fehlt" }, () => {

  function auswahl() {
    const von = dispo.indexOf("let capAuswahlLauf = 0;");
    const bis = dispo.indexOf("async function submitAssign", von);
    assert.ok(von > 0 && bis > von, "onCapSelect liegt nicht mehr, wo es lag");

    const felder = {
      asgCap: { id: "asgCap", value: "", style: {} },
      asgCapInfo: { id: "asgCapInfo", value: "", innerHTML: "", style: {} },
      asgStart: { id: "asgStart", value: "" },
      asgEnd: { id: "asgEnd", value: "" },
      asgClient: { id: "asgClient", value: "" }
    };
    const aufgebaut = [];
    let aufloesen = [];
    const umgebung = {
      document: { getElementById: (id) => felder[id] || null },
      unassignedCaps: [],
      parseAssignableSelection: (roh) => (roh ? { source: "capacity", id: roh } : null),
      rebuildWorkerSelect: (ids, kunde) => { aufgebaut.push({ ids, kunde }); },
      ladeSperren: (kunde) => new Promise((fertig) => { aufloesen.push(() => fertig(kunde)); }),
      esc: (x) => String(x == null ? "" : x),
      tt: (k) => k,
      fmtD: (x) => String(x),
      Number, String, Array, Object, JSON, Math,
      console: { log() {}, warn() {}, error() {} }
    };
    vm.createContext(umgebung);
    vm.runInContext(dispo.slice(von, bis) + "\nglobalThis._onCapSelect = onCapSelect;", umgebung, { filename: "dispo" });
    return { umgebung, felder, aufgebaut, aufloesen: () => aufloesen, warten: () => new Promise((f) => setImmediate(f)) };
  }

  it("die spaete Antwort des frueheren Einsatzes schreibt nichts mehr", async () => {
    const s = auswahl();
    s.umgebung.unassignedCaps = [
      { source: "capacity", id: "A", title: "A", client_org_id: "kunde-X", availability_from: "2026-10-01", availability_to: "2026-10-31" },
      { source: "capacity", id: "B", title: "B", client_org_id: "kunde-Y", availability_from: "2026-12-01", availability_to: "2026-12-15" }
    ];
    s.felder.asgCap.value = "A";
    const ersterLauf = s.umgebung._onCapSelect();
    s.felder.asgCap.value = "B";
    const zweiterLauf = s.umgebung._onCapSelect();

    // Die Antwort fuer B kommt zuerst, die fuer A danach — der reale Fall.
    s.aufloesen()[1]();
    await s.warten();
    s.aufloesen()[0]();
    await Promise.all([ersterLauf, zweiterLauf]);

    assert.deepEqual(s.aufgebaut.map((x) => x.kunde), ["kunde-Y"],
      "die Kraefte-Liste wurde mit den Sperren des frueheren Kunden aufgebaut");
    assert.strictEqual(s.felder.asgStart.value, "2026-12-01", "der Zeitraum des frueheren Einsatzes steht im Formular");
    assert.strictEqual(s.felder.asgEnd.value, "2026-12-15");
  });

  it("ohne Wettlauf schreibt der einzige Lauf ganz normal", async () => {
    const s = auswahl();
    s.umgebung.unassignedCaps = [
      { source: "capacity", id: "A", title: "A", client_org_id: "kunde-X", availability_from: "2026-10-01", availability_to: "2026-10-31" }
    ];
    s.felder.asgCap.value = "A";
    const lauf = s.umgebung._onCapSelect();
    s.aufloesen()[0]();
    await lauf;
    assert.deepEqual(s.aufgebaut.map((x) => x.kunde), ["kunde-X"]);
    assert.strictEqual(s.felder.asgStart.value, "2026-10-01");
  });
});
