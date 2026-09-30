/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WELLE N2.1 — FUENF SCHRITTE, DER ORT VORN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner-Vorgabe (Nachtrag 2026-09-06, Korrektur des ersten Entwurfs): der
 * Einsatzort wird AUSDRUECKLICH gefragt und steht VORN — vorbelegt, aber
 * aenderbar.
 *
 * Der Grund ist kein Bedienkomfort: der Standortkontext ist die
 * Rechnungsadresse oder Niederlassung, NICHT der Einsatzort. Eine
 * Pflegeeinrichtung mit vier Haeusern sucht fuer EIN Haus. Wer den Kontext
 * ungefragt als Einsatzort nimmt, rechnet die Entfernung gegen den falschen
 * Punkt — und seit N2.4b rechnet sie wirklich.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS HIER GEPRUEFT WIRD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dass es KEIN zweites Formular gibt. Der Assistent verschiebt keine Felder
 * und verdoppelt keine — er ordnet die vorhandenen je einem Schritt zu. Es
 * bleibt ein Anlagepfad, ein Datensatz, eine Absendestelle.
 *
 * Und dass jedes Feld, das der Server bekommt, in genau einem Schritt
 * erreichbar ist. Ein Feld, das in keinem Schritt vorkommt, waere unter dem
 * Assistenten unerreichbar — der Bedarf ginge stillschweigend ohne es raus.
 *
 * Lauf: node --test --test-force-exit test/bedarfInFuenfSchritten.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const SEITE = path.resolve(HIER, "..", "..", "frontend", "public", "marketplace_demand_create.html");
const da = fs.existsSync(SEITE);
const html = da ? fs.readFileSync(SEITE, "utf8") : "";

/* ── Der Assistent in einer Sandbox, mit handgebautem DOM ───────────────── */

function assistent({ standorte = null, wirft = false } = {}) {
  const von = html.indexOf("var SCHRITTE = [");
  const bis = html.indexOf("window.__tcAssistent");
  assert.ok(von > 0 && bis > von, "der Assistent liegt nicht mehr, wo er lag");
  const quelle = html.slice(von, bis);

  const knoten = new Map();
  const abrufe = [];

  function neu(id, art) {
    const k = {
      id, value: "", textContent: "", innerHTML: "", hidden: false, tagName: art || "INPUT",
      _klassen: new Set(), _attr: {}, _hoerer: {},
      classList: {
        toggle: (name, an) => { if (an) k._klassen.add(name); else k._klassen.delete(name); },
        contains: (name) => k._klassen.has(name)
      },
      setAttribute: (a, v) => { k._attr[a] = String(v); },
      getAttribute: (a) => (a in k._attr ? k._attr[a] : null),
      removeAttribute: (a) => { delete k._attr[a]; },
      addEventListener: (art2, fn) => { (k._hoerer[art2] = k._hoerer[art2] || []).push(fn); },
      dispatchEvent: () => true,
      closest: () => k._traeger || null,
      focus: () => { k._fokus = true; },
      scrollIntoView: () => {},
      klick: () => (k._hoerer.click || []).forEach((fn) => fn()),
      taste: (e) => (k._hoerer.keydown || []).forEach((fn) => fn(e))
    };
    knoten.set(id, k);
    return k;
  }

  /* Jedes Feld bekommt einen eigenen Traeger — genau wie im Raster, wo jedes
     Feld in seinem eigenen <div> mit Beschriftung sitzt. */
  const FELDER = ["location_city", "location_postal", "radius_km", "title", "role", "skill_tags",
    "headcount", "start_date", "end_date", "urgencyAnzeige", "preisVorschlag",
    "budget_min", "budget_max", "contact_name", "contact_phone"];
  FELDER.forEach((id) => {
    const feld = neu(id);
    const traeger = neu("traeger:" + id, "DIV");
    feld._traeger = traeger;
  });

  ["asLeiste", "asKopf", "asHinweis", "asZurueck", "asWeiter", "submitBtn", "asZaehler", "asFehler"]
    .forEach((id) => neu(id, id === "asLeiste" ? "UL" : "DIV"));
  const form = neu("demandForm", "FORM");

  const hinweise = {
    "dem.create.contactHint": neu("hinweis:kontakt", "P"),
    "dem.create.urgencyHint": neu("hinweis:notdienst", "P")
  };

  const umgebung = {
    document: {
      /* "loading": sonst startet der Assistent schon beim Laden der Quelle und
         fragt den Standort ein zweites Mal — die Proben zaehlten dann Abrufe,
         die sie nie ausgeloest haben. Die Proben rufen `_start()` selbst. */
      readyState: "loading",
      getElementById: (id) => knoten.get(id) || null,
      querySelector: (w) => {
        if (w === "form") return form;
        const treffer = /data-i18n='([^']+)'/.exec(w);
        return treffer ? (hinweise[treffer[1]] || null) : null;
      },
      createElement: () => {
        const n = { textContent: "", get innerHTML() {
          return String(n.textContent).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        } };
        return n;
      },
      addEventListener: () => {}
    },
    window: {}, Event: function () {}, Number, String, Math, Object, Array, JSON, RegExp,
    console: { log() {}, warn() {}, error() {} },
    fetch: (url) => {
      abrufe.push(url);
      if (wirft) return Promise.reject(new Error("Netz weg"));
      return Promise.resolve({ ok: true, json: () => Promise.resolve(standorte) });
    }
  };
  vm.createContext(umgebung);
  vm.runInContext(quelle
    + "\nglobalThis._start = start;"
    + "\nglobalThis._gehe = gehe;"
    + "\nglobalThis._jetzt = function(){ return jetzt; };"
    + "\nglobalThis._schritte = SCHRITTE;"
    + "\nglobalThis._vorbelegen = ortVorbelegen;",
    umgebung, { filename: "assistent" });

  return { umgebung, knoten, form, abrufe, feld: (id) => knoten.get(id),
    traegerVon: (id) => knoten.get("traeger:" + id) };
}

const sichtbar = (t) => !t._klassen.has("as-verborgen");

/* ═══════════════════════════════════════════════════════════════════════
   1. KEIN FELD GEHT VERLOREN
   ═══════════════════════════════════════════════════════════════════════ */

describe("N2.1 · jedes Feld ist in genau einem Schritt erreichbar", { skip: !da && "Seite fehlt" }, () => {

  it("alle Felder, die der Server bekommt, kommen in einem Schritt vor", () => {
    /*
     * DIE WICHTIGSTE PROBE DIESER DATEI. Ein Feld, das in keinem Schritt
     * steht, waere unter dem Assistenten unerreichbar — der Bedarf ginge
     * stillschweigend ohne es raus, und niemand saehe einen Fehler.
     *
     * Verglichen wird gegen das, was der Absendecode WIRKLICH liest, nicht
     * gegen eine gepflegte Liste: `document.getElementById("x").value` im
     * Rumpf des Formulars.
     */
    const gelesen = new Set();
    const beginn = html.indexOf("var body = {");
    assert.ok(beginn > 0, "der Rumpf des Absendecodes steht nicht mehr da");
    const rumpf = html.slice(beginn, beginn + 2000);
    const muster = /getElementById\("([a-z_]+)"\)/g;
    let treffer;
    while ((treffer = muster.exec(rumpf)) !== null) gelesen.add(treffer[1]);
    assert.ok(gelesen.size >= 10, "der Absendecode wurde nicht gefunden (" + gelesen.size + " Felder)");

    const a = assistent();
    const inSchritten = new Set();
    a.umgebung._schritte.forEach((s) => s.felder.forEach((f) => inSchritten.add(f)));

    const fehlend = [...gelesen].filter((f) => !inSchritten.has(f));
    assert.deepStrictEqual(fehlend, [],
      "diese Felder werden abgeschickt, stehen aber in keinem Schritt: " + fehlend.join(", "));
  });

  it("kein Feld steht in zwei Schritten", () => {
    // Sonst waere es zweimal sichtbar und der Nutzer suchte den Unterschied.
    const a = assistent();
    const gesehen = new Set();
    a.umgebung._schritte.forEach((s) => s.felder.forEach((f) => {
      assert.ok(!gesehen.has(f), f + " steht in mehr als einem Schritt");
      gesehen.add(f);
    }));
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. DER ORT STEHT VORN
   ═══════════════════════════════════════════════════════════════════════ */

describe("N2.1 · der Ort ist der erste Schritt", { skip: !da && "Seite fehlt" }, () => {

  it("Schritt 1 zeigt Ort, PLZ und Umkreis — und sonst nichts", () => {
    const a = assistent();
    a.umgebung._start();
    assert.strictEqual(a.umgebung._jetzt(), 0);
    for (const id of ["location_city", "location_postal", "radius_km"]) {
      assert.ok(sichtbar(a.traegerVon(id)), id + " fehlt im ersten Schritt");
    }
    for (const id of ["title", "headcount", "start_date", "budget_min"]) {
      assert.ok(!sichtbar(a.traegerVon(id)), id + " steht schon im ersten Schritt");
    }
  });

  it("ohne Ort geht es nicht weiter", () => {
    /* Der Ort ist die Grundlage der Entfernungsrechnung. Ohne ihn faellt der
       Bedarf auf den Vergleich der Stadt-Zeichenkette zurueck. */
    const a = assistent();
    a.umgebung._start();
    a.umgebung._gehe(1);
    assert.strictEqual(a.umgebung._jetzt(), 0, "es ging ohne Ort weiter");
    assert.strictEqual(a.feld("asFehler").hidden, false, "es wird nicht gesagt, was fehlt");
  });

  it("mit Ort geht es weiter", () => {
    const a = assistent();
    a.umgebung._start();
    a.feld("location_city").value = "Münster";
    a.umgebung._gehe(1);
    assert.strictEqual(a.umgebung._jetzt(), 1);
    assert.ok(sichtbar(a.traegerVon("title")), "der zweite Schritt zeigt nichts");
    assert.ok(!sichtbar(a.traegerVon("location_city")), "der erste Schritt bleibt stehen");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. VORBELEGT, ABER AENDERBAR
   ═══════════════════════════════════════════════════════════════════════ */

describe("N2.1 · die Vorbelegung", { skip: !da && "Seite fehlt" }, () => {

  const STANDORTE = {
    location_id: "l2",
    locations: [
      { id: "l1", name: "Zentrale", city: "Hamburg", is_hq: true },
      { id: "l2", name: "Haus Nord", city: "Münster", is_hq: false }
    ]
  };

  it("der AKTIVE Standort gewinnt, nicht die Zentrale", async () => {
    /* Eine Pflegeeinrichtung mit vier Haeusern sucht fuer EIN Haus. Die
       Zentrale einzusetzen waere genau der Fehler, den die Owner-Korrektur
       benennt. */
    const a = assistent({ standorte: STANDORTE });
    await a.umgebung._vorbelegen();
    await new Promise((f) => setImmediate(f));
    assert.strictEqual(a.feld("location_city").value, "Münster");
    assert.deepStrictEqual(a.abrufe, ["/api/me/active-location"]);
  });

  it("ohne aktiven Standort die Zentrale", async () => {
    const a = assistent({ standorte: { location_id: null, locations: STANDORTE.locations } });
    await a.umgebung._vorbelegen();
    await new Promise((f) => setImmediate(f));
    assert.strictEqual(a.feld("location_city").value, "Hamburg");
  });

  it("was der Nutzer getippt hat, wird NICHT ueberschrieben", async () => {
    /* "Aenderbar" heisst auch: eine spaet eintreffende Antwort darf eine
       Eingabe nicht zurueckdrehen. */
    const a = assistent({ standorte: STANDORTE });
    a.feld("location_city").value = "Dortmund";
    await a.umgebung._vorbelegen();
    await new Promise((f) => setImmediate(f));
    assert.strictEqual(a.feld("location_city").value, "Dortmund");
    assert.deepStrictEqual(a.abrufe, [], "es wurde trotz Eingabe gefragt");
  });

  it("ein Netzfehler laesst das Formular unberuehrt", async () => {
    const a = assistent({ wirft: true });
    await assert.doesNotReject(() => a.umgebung._vorbelegen());
    assert.strictEqual(a.feld("location_city").value, "");
  });

  it("eine Antwort ohne Standorte erfindet nichts", async () => {
    const a = assistent({ standorte: { location_id: null, locations: [] } });
    await a.umgebung._vorbelegen();
    await new Promise((f) => setImmediate(f));
    assert.strictEqual(a.feld("location_city").value, "");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4. ABSENDEN ERST AM ENDE
   ═══════════════════════════════════════════════════════════════════════ */

describe("N2.1 · abgeschickt wird erst im letzten Schritt", { skip: !da && "Seite fehlt" }, () => {

  function bisSchritt(a, ziel) {
    a.umgebung._start();
    const werte = { location_city: "Münster", title: "10 Helfer", role: "Helfer", start_date: "2026-10-01" };
    Object.keys(werte).forEach((id) => { a.feld(id).value = werte[id]; });
    while (a.umgebung._jetzt() < ziel) a.umgebung._gehe(1);
  }

  it("der Absendeknopf ist unterwegs verborgen", () => {
    /*
     * Sonst entsteht ein halber Bedarf: ohne Zeitraum laeuft die
     * Notdienst-Ableitung ins Leere, ohne Rolle gibt es keinen Preisvorschlag
     * und kein Matching.
     */
    const a = assistent();
    bisSchritt(a, 0);
    assert.strictEqual(a.feld("submitBtn").hidden, true, "im ersten Schritt kann abgeschickt werden");
    bisSchritt(a, 2);
    assert.strictEqual(a.feld("submitBtn").hidden, true);
  });

  it("im letzten Schritt ist er da — und `Weiter` verschwindet", () => {
    const a = assistent();
    bisSchritt(a, 4);
    assert.strictEqual(a.umgebung._jetzt(), 4);
    assert.strictEqual(a.feld("submitBtn").hidden, false, "am Ende fehlt der Absendeknopf");
    assert.strictEqual(a.feld("asWeiter").hidden, true);
    assert.strictEqual(a.feld("asZurueck").hidden, false);
  });

  it("die Eingabetaste blaettert weiter, statt abzuschicken", () => {
    /* Ein Druck auf Enter im ersten Feld ist die haeufigste Art, ein Formular
       versehentlich abzuschicken. */
    const a = assistent();
    a.umgebung._start();
    a.feld("location_city").value = "Münster";
    let verhindert = false;
    a.form.taste({ key: "Enter", target: { tagName: "INPUT" }, preventDefault: () => { verhindert = true; } });
    assert.ok(verhindert, "die Eingabetaste wurde durchgelassen");
    assert.strictEqual(a.umgebung._jetzt(), 1, "sie hat nicht weitergeblaettert");
  });

  it("im letzten Schritt darf die Eingabetaste abschicken", () => {
    const a = assistent();
    bisSchritt(a, 4);
    let verhindert = false;
    a.form.taste({ key: "Enter", target: { tagName: "INPUT" }, preventDefault: () => { verhindert = true; } });
    assert.ok(!verhindert, "am Ende wird das Abschicken verhindert");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   5. OHNE JAVASCRIPT BLEIBT ES EIN FORMULAR
   ═══════════════════════════════════════════════════════════════════════ */

describe("N2.1 · der Assistent ist eine Zugabe, keine Bedingung", { skip: !da && "Seite fehlt" }, () => {

  it("ausgeblendet wird nur unter `data-assistent=an`", () => {
    /*
     * Faellt das Skript aus, steht das Formular wie zuvor als EINE Seite da
     * und bleibt absendbar. Eine Regel, die ohne diese Bedingung ausblendet,
     * machte aus einem Skriptfehler eine unbenutzbare Seite.
     */
    /*
     * Gezaehlt wird, nicht ersetzt. Die erste Fassung strich den Waechter
     * `form[data-assistent="an"] ` aus dem Text und suchte dann nach einer
     * unbedingten Regel — und fand natuerlich genau die, die sie selbst
     * gerade erzeugt hatte. Eine Probe, die sich ihren Befund herstellt.
     *
     * Jetzt: JEDES Vorkommen der Ausblendregel muss den Waechter davor haben.
     */
    const stellen = [...html.matchAll(/\.as-verborgen\s*\{\s*display:\s*none/g)];
    assert.ok(stellen.length >= 1, "es gibt gar keine Ausblendregel mehr");
    for (const stelle of stellen) {
      const davor = html.slice(Math.max(0, stelle.index - 40), stelle.index);
      assert.ok(davor.includes('form[data-assistent="an"] '),
        "eine Ausblendregel haengt nicht am Schalter — ein Skriptfehler machte die Seite unbenutzbar");
    }
  });

  it("der Schalter wird erst beim Start gesetzt", () => {
    const a = assistent();
    assert.strictEqual(a.form.getAttribute("data-assistent"), null);
    a.umgebung._start();
    assert.strictEqual(a.form.getAttribute("data-assistent"), "an");
  });
});
