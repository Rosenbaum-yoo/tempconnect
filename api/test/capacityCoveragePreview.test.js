/**
 * P8 Welle E — Besetzbarkeits-Vorschau beim Ueberfahren.
 *
 * Zwei Zusicherungen tragen diese Welle, und beide sind hier festgehalten:
 *   1. ANONYMITAET (Leitentscheidung 3.5): die Vorschau laeuft ueber eine
 *      fremde Bedarfs-Karte. Sie darf Zahlen, Katalog-Rollen und Datumsangaben
 *      nennen — niemals eine Person. Der bestehende Deckungs-Dienst liefert
 *      Namen, Wohnort und Profil-Ids; hier wird geprueft, dass davon nichts
 *      durchrutscht.
 *   2. GATE E: der Feed loest beim Rendern keine einzige Abfrage aus.
 *
 * Run: node --test --test-force-exit test/capacityCoveragePreview.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fasseDeckungAnonymZusammen, ZUSTAND } from "../services/capacityOfferMatchService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const lies = (p) => fs.readFileSync(path.join(REPO_ROOT, p), "utf8");

const HEUTE = "2026-08-07";

function kandidat(over = {}) {
  return {
    worker_profile_id: "wp-1",
    name: "Erika Mustermann",
    city: "Berlin",
    treffer: 1,
    treffer_namen: ["Lagerhelfer"],
    zustand: ZUSTAND.FREI,
    frei_ab: null,
    grund: null,
    ...over
  };
}

function deckung(over = {}) {
  return {
    auswertbar: true,
    zeitraum: { von: HEUTE, bis: null },
    skills: [{ id: "s1", name: "Lagerhelfer" }],
    unbekannte_faehigkeiten: [],
    gefordert: 5,
    frei: 0,
    luecke: 5,
    kandidaten: [],
    ...over
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * Anonymitaet — die Regel, die diese Welle tragen muss
 * ══════════════════════════════════════════════════════════════════════════ */

describe("P8/E · Die Vorschau nennt keine Person", () => {
  it("laesst Name, Wohnort und Profil-Id vollstaendig weg", () => {
    const out = fasseDeckungAnonymZusammen(deckung({
      kandidaten: [
        kandidat({ name: "Erika Mustermann", city: "Berlin" }),
        kandidat({ worker_profile_id: "wp-2", name: "Max Beispiel", city: "Hamburg" })
      ],
      frei: 2
    }), { heute: HEUTE });

    const roh = JSON.stringify(out);
    assert.ok(!roh.includes("Mustermann"), "kein Nachname");
    assert.ok(!roh.includes("Erika"), "kein Vorname");
    assert.ok(!roh.includes("Berlin"), "kein Wohnort");
    assert.ok(!roh.includes("wp-1") && !roh.includes("wp-2"), "keine Profil-Id");
    assert.ok(!("kandidaten" in out), "die Kandidatenliste selbst geht nicht hinaus");
  });

  it("nennt Katalog-Rollen — die sind Referenzdaten, keine Personendaten", () => {
    const out = fasseDeckungAnonymZusammen(deckung({
      gefordert: 5,
      kandidaten: [
        kandidat({ treffer_namen: ["Gabelstaplerfahrer"] }),
        kandidat({ treffer_namen: ["Gabelstaplerfahrer"] }),
        kandidat({ treffer_namen: ["Lagerhelfer"] })
      ]
    }), { heute: HEUTE });

    assert.deepEqual(out.rollen, [
      { name: "Gabelstaplerfahrer", anzahl: 2 },
      { name: "Lagerhelfer", anzahl: 1 }
    ]);
    assert.equal(out.sofort_verfuegbar, 3);
  });

  it("zaehlt nur die Rollen der FREIEN Kraefte", () => {
    const out = fasseDeckungAnonymZusammen(deckung({
      kandidaten: [
        kandidat({ treffer_namen: ["Lagerhelfer"] }),
        kandidat({ treffer_namen: ["Kranfuehrer"], zustand: ZUSTAND.VERPLANT, frei_ab: "2026-09-01" })
      ]
    }), { heute: HEUTE });
    assert.deepEqual(out.rollen.map((r) => r.name), ["Lagerhelfer"],
      "eine gebundene Kraft ist keine verfuegbare Rolle");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Die Aussage der Box
 * ══════════════════════════════════════════════════════════════════════════ */

describe("P8/E · Was die Box sagt", () => {
  it("meldet vollstaendige Deckung ab heute", () => {
    const out = fasseDeckungAnonymZusammen(deckung({
      gefordert: 2,
      kandidaten: [kandidat(), kandidat({ worker_profile_id: "wp-2" })]
    }), { heute: HEUTE });
    assert.equal(out.luecke, 0);
    assert.equal(out.vollstaendig_moeglich, true);
    assert.equal(out.vollstaendig_ab, HEUTE);
  });

  it("rechnet aus, ab wann es vollstaendig reicht", () => {
    const out = fasseDeckungAnonymZusammen(deckung({
      gefordert: 3,
      kandidaten: [
        kandidat(),
        kandidat({ worker_profile_id: "wp-2", zustand: ZUSTAND.VERPLANT, frei_ab: "2026-08-12" }),
        kandidat({ worker_profile_id: "wp-3", zustand: ZUSTAND.VERPLANT, frei_ab: "2026-08-21" })
      ]
    }), { heute: HEUTE });
    assert.equal(out.sofort_verfuegbar, 1);
    assert.equal(out.luecke, 2);
    assert.equal(out.vollstaendig_ab, "2026-08-21", "erst der dritte Kopf schliesst die Luecke");
    assert.equal(out.vollstaendig_moeglich, true);
  });

  it("raet NICHT bei Einsaetzen ohne Enddatum", () => {
    const out = fasseDeckungAnonymZusammen(deckung({
      gefordert: 2,
      kandidaten: [
        kandidat(),
        kandidat({ worker_profile_id: "wp-2", zustand: ZUSTAND.VERPLANT, frei_ab: null })
      ]
    }), { heute: HEUTE });
    assert.equal(out.vollstaendig_moeglich, false);
    assert.equal(out.vollstaendig_ab, null);
    assert.equal(out.gebunden_ohne_ende, 1, "das Ende ist offen und wird als solches gemeldet");
  });

  it("gruppiert gebundene Kraefte nach ihrem Bindungsende", () => {
    const out = fasseDeckungAnonymZusammen(deckung({
      gefordert: 4,
      kandidaten: [
        kandidat({ zustand: ZUSTAND.VERPLANT, frei_ab: "2026-08-21" }),
        kandidat({ worker_profile_id: "wp-2", zustand: ZUSTAND.VERPLANT, frei_ab: "2026-08-21" }),
        kandidat({ worker_profile_id: "wp-3", zustand: ZUSTAND.VERPLANT, frei_ab: "2026-09-02" })
      ]
    }), { heute: HEUTE });
    // frei_ab ist der erste freie Tag — "gebunden bis" ist der Tag davor.
    assert.deepEqual(out.gebunden, [
      { bis: "2026-08-20", anzahl: 2 },
      { bis: "2026-09-01", anzahl: 1 }
    ]);
  });

  it("liefert eine ehrliche Leermeldung statt eines leeren Kaestchens (Gate E)", () => {
    const ohneKraft = fasseDeckungAnonymZusammen(deckung({ kandidaten: [] }), { heute: HEUTE });
    assert.equal(ohneKraft.grund, "keine_passende_kraft");
    assert.equal(ohneKraft.sofort_verfuegbar, 0);

    const ohneSkill = fasseDeckungAnonymZusammen(
      { auswertbar: false, gefordert: 3, unbekannte_faehigkeiten: ["hexerei"] }, { heute: HEUTE });
    assert.equal(ohneSkill.auswertbar, false);
    assert.equal(ohneSkill.grund, "keine_auswertbare_faehigkeit");
    assert.deepEqual(ohneSkill.unbekannte_faehigkeiten, ["hexerei"]);
    assert.equal(ohneSkill.luecke, 3);
  });

  it("deckelt die Rollenliste, damit die Karte lesbar bleibt", () => {
    const viele = Array.from({ length: 9 }, (_, i) =>
      kandidat({ worker_profile_id: `wp-${i}`, treffer_namen: [`Rolle ${i}`] }));
    const out = fasseDeckungAnonymZusammen(deckung({ gefordert: 9, kandidaten: viele }), { heute: HEUTE });
    assert.equal(out.rollen.length, 4);
  });

  it("verkraftet fehlende Felder ohne zu werfen", () => {
    const out = fasseDeckungAnonymZusammen(null, { heute: HEUTE });
    assert.equal(out.auswertbar, false);
    assert.equal(out.gefordert, 1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Verdrahtung + Gate E
 * ══════════════════════════════════════════════════════════════════════════ */

describe("P8/E · Verdrahtung", () => {
  it("die Route existiert, ist lesend und agency-only", () => {
    const src = lies("api/routes/capacityExchange.js");
    assert.match(src, /router\.get\("\/capacity-exchange\/demands\/:id\/coverage"/);
    const block = src.slice(src.indexOf("/capacity-exchange/demands/:id/coverage"));
    const ende = block.indexOf("/* ── Supplier: Update entry");
    const route = block.slice(0, ende > 0 ? ende : 3000);
    assert.match(route, /AGENCY_ONLY/, "eine Firma ohne Belegschaft hat hier nichts zu holen");
    assert.match(route, /ORG_REQUIRED/);
    assert.ok(!/res\.locals\.audit|writeAudit/.test(route), "eine Vorschau ist keine Handlung");
    assert.match(route, /fasseDeckungAnonymZusammen/, "es geht die anonyme Fassung hinaus");
    assert.ok(!/checkOfferCoverage[\s\S]{0,200}res\.json\(deckung\)/.test(route),
      "das Rohergebnis mit Namen darf die Route nicht verlassen");
  });

  it("nutzt dieselbe Rechenmaschine wie die Formular-Vorschau", () => {
    const src = lies("api/routes/capacityExchange.js");
    assert.match(src, /capacityOfferMatchService\.checkOfferCoverage/,
      "eine zweite Deckungslogik wuerde beim ersten Regelwechsel auseinanderlaufen");
  });

  it("Gate E: der Feed laedt beim Rendern nichts", () => {
    const js = lies("frontend/public/js/pages/marketplaceFeed.js");
    // Das Fach entsteht leer.
    assert.match(js, /class="ce-card__coverage" data-coverage-for=/);
    // Geladen wird ausschliesslich am Zeigergeraet bzw. am Fokus.
    assert.match(js, /addEventListener\('mouseenter', function \(\) \{ ladeDeckung\(slot\); \}\)/);
    assert.match(js, /addEventListener\('focusin', function \(\) \{ ladeDeckung\(slot\); \}\)/);
    // renderCard selbst darf nichts holen.
    const render = js.slice(js.indexOf("function renderCard(e)"), js.indexOf("function setImmediateState"));
    assert.ok(!/TC\.api\.get|fetch\(/.test(render),
      "eine Abfrage im Render waere bei 50 Karten genau der N+1, den Gate E ausschliesst");
  });

  it("Gate E: jede Karte wird hoechstens einmal abgefragt", () => {
    const js = lies("frontend/public/js/pages/marketplaceFeed.js");
    assert.match(js, /var deckungCache = \{\}/);
    assert.match(js, /if \(!id \|\| slot\.dataset\.state\) return;/, "kein zweiter Lauf waehrend des Ladens");
    assert.match(js, /if \(deckungCache\[id\]\)/, "gemerkte Antwort wird wiederverwendet");
  });

  it("nur Zeitarbeitsfirmen bekommen den Loader ueberhaupt gebunden", () => {
    const js = lies("frontend/public/js/pages/marketplaceFeed.js");
    assert.match(js, /if \(viewerRole !== 'agency'\) return;/);
  });

  it("das leere Fach ist unsichtbar, solange nichts drinsteht", () => {
    const css = lies("frontend/public/css/pages/marketplace-feed.css");
    assert.match(css, /\.ce-card__coverage:empty \{ display: none; \}/,
      "ein dauerhaft sichtbares leeres Kaestchen ist genau das, was Gate E ausschliesst");
    assert.ok(!/#[0-9a-fA-F]{6}/.test(css.slice(css.indexOf(".ce-card__coverage"), css.indexOf(".ce-coverage__muted") + 200)),
      "keine harten Farbwerte — Design-Tokens");
  });
});
