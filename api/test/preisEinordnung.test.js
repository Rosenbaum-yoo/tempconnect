/**
 * Die Einordnung des eigenen Satzes (N7.2, 2026-09-05).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS HIER BEWACHT WIRD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `smartPricingService` ist seit langem fertig und hatte NULL Frontend-Aufrufer.
 * Er liefert eine Spanne. Die Abnahme aus dem Plan verlangt mehr:
 * **"Die Firma sieht, ob sie ueber oder unter Markt liegt."**
 *
 * Eine Spanne neben einen eigenen Satz zu legen ist Kopfrechnen — und
 * Kopfrechnen tut niemand bei jedem Angebot. Die Einordnung nimmt es ab.
 *
 * DIE HEIKLE GRENZE, DIE HIER BEWUSST GEZOGEN IST: es entsteht KEINE
 * Untergrenze und KEINE Empfehlung. Die Zahlen sind beobachtete Daten zwischen
 * je zwei Parteien; daraus eine plattformweite Vorgabe zu machen waere
 * Preisabstimmung (Welle O, O-L1). Der Text sagt, WO die Firma steht — nicht,
 * was sie tun soll.
 *
 * Run: node --test --test-force-exit test/preisEinordnung.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HIER, "..");

/* Der Rechner ist modulintern. Geprueft wird er ueber `getSuggestion` — also
   ueber den Weg, den die Oberflaeche wirklich nimmt. */
import { getSuggestion } from "../services/smartPricingService.js";

/**
 * Ein Zugang, der jeder Stufe dieselben Beobachtungen liefert. Die genauen
 * Zahlen sind gleichgueltig — geprueft wird die EINORDNUNG, nicht die Statistik.
 */
function musterPool(median = 3000, p25 = 2800, p75 = 3400) {
  return {
    query: async () => ({
      rows: [{ sample_count: 25, median, p25, p75, avg: median }]
    })
  };
}

async function einordnungFuer(ownPriceCents) {
  const r = await getSuggestion(musterPool(), {
    role: "Pflegekraft", region: "Muenster", urgency: "normal",
    context: "supply", ownPriceCents
  });
  return { einordnung: r.einordnung, spanne: r.suggestion };
}

/* ── 1. Die drei Lagen ───────────────────────────────────────────────── */

describe("N7.2 · ueber, unter oder im Rahmen", () => {
  it("ohne eigenen Satz gibt es KEINE Einordnung", async () => {
    /*
     * Ein leeres Feld ist ehrlicher als eine erfundene Null: "0 Cent unter
     * Markt" waere eine Aussage, und zwar eine falsche.
     */
    const r = await getSuggestion(musterPool(), { role: "Pflegekraft" });
    assert.equal(r.einordnung, null);
  });

  it("ein Satz unterhalb der Spanne heisst `unter`", async () => {
    const { einordnung } = await einordnungFuer(100);
    assert.equal(einordnung.lage, "unter");
    assert.ok(einordnung.abstand_cents < 0, "der Abstand zeigt nicht nach unten");
    assert.match(einordnung.text, /unter Wert/i,
      "der Text nennt nicht, was daran unangenehm ist");
  });

  it("ein Satz oberhalb der Spanne heisst `ueber`", async () => {
    const { einordnung } = await einordnungFuer(999999);
    assert.equal(einordnung.lage, "ueber");
    assert.ok(einordnung.abstand_cents > 0);
    assert.match(einordnung.text, /unbeantwortet/i,
      "der Text nennt die Folge nicht — 'zu teuer' allein hilft niemandem");
  });

  it("DIE RAENDER GEHOEREN DAZU", async () => {
    /*
     * Wer genau auf dem Minimum liegt, liegt IM Rahmen — nicht darunter. Eine
     * Einordnung, die den Grenzfall zum Problem erklaert, erzeugt Alarm ohne
     * Anlass und wird nach dem dritten Mal ignoriert.
     */
    const voll = await getSuggestion(musterPool(), {
      role: "Pflegekraft", context: "supply", ownPriceCents: 1
    });
    const min = voll.suggestion.min_cents;
    const max = voll.suggestion.max_cents;

    for (const [preis, name] of [[min, "genau auf dem Minimum"], [max, "genau auf dem Maximum"]]) {
      const { einordnung } = await einordnungFuer(preis);
      assert.equal(einordnung.lage, "im_rahmen", `${name} wurde als Ausreisser gemeldet`);
      assert.equal(einordnung.abstand_cents, 0, `${name}: der Abstand ist nicht null`);
    }
  });

  it("der Abstand wird zur GRENZE gemessen, nicht zur Mitte", async () => {
    /* Die Frage lautet "wie weit bin ich draussen", nicht "wie weit vom
       Durchschnitt" — sonst meldet die Einordnung einen Abstand, obwohl die
       Firma im Rahmen liegt. */
    const voll = await getSuggestion(musterPool(), {
      role: "Pflegekraft", context: "supply", ownPriceCents: 1
    });
    const min = voll.suggestion.min_cents;
    const { einordnung } = await einordnungFuer(min - 500);
    assert.equal(einordnung.abstand_cents, -500);
    assert.ok(Math.abs(einordnung.abstand_pct + (500 / min) * 100) < 0.2,
      `der Prozentabstand passt nicht zur Grenze: ${einordnung.abstand_pct}`);
  });

  it("OHNE MARKTDATEN gibt es keine Einordnung", async () => {
    /*
     * Der Fall, den eine ueberlebende Rueckmutation aufgedeckt hat: meine
     * Vorrichtung lieferte immer Beobachtungen, also feuerte die Pruefung auf
     * eine gueltige Spanne nie.
     *
     * Kennt die Plattform zu einer Rolle nichts, steht die Spanne auf `null`.
     * "Sie liegen ueber Markt" waere dann eine Aussage aus dem Nichts — und
     * ausgerechnet bei einem NEUEN Gewerk, wo die Firma am ehesten hinsieht und
     * am wenigsten pruefen kann.
     */
    const leer = { query: async () => ({
      rows: [{ sample_count: 0, median: null, p25: null, p75: null, avg: null }] }) };
    const r = await getSuggestion(leer, {
      role: "Gewerk-das-es-noch-nicht-gibt", context: "supply", ownPriceCents: 3000
    });
    assert.equal(r.suggestion.min_cents, null, "die Vorrichtung liefert doch Daten");
    assert.equal(r.einordnung, null,
      "es wurde gegen eine leere Spanne eingeordnet — eine Aussage aus dem Nichts");
  });

  it("unsinnige Eingaben erzeugen keine Einordnung", async () => {
    for (const unsinn of [0, -100, NaN, "abc", null, undefined]) {
      const r = await getSuggestion(musterPool(), {
        role: "Pflegekraft", context: "supply", ownPriceCents: unsinn
      });
      assert.equal(r.einordnung, null, `${JSON.stringify(unsinn)} erzeugte eine Einordnung`);
    }
  });
});

/* ── 2. Die Grenze, die nicht ueberschritten wird ────────────────────── */

describe("N7.2 · eine Beobachtung, keine Vorgabe", () => {
  it("der Text empfiehlt keinen Preis", async () => {
    /*
     * O-L1 und die Kartellgrenze aus Welle O: bilaterale Konditionen sind
     * normal, eine PLATTFORMWEITE Untergrenze waere Preisabstimmung. Ein Text
     * wie "senken Sie auf 28 EUR" waere genau das, nur freundlicher formuliert.
     */
    for (const preis of [100, 999999]) {
      const { einordnung } = await einordnungFuer(preis);
      assert.ok(!/senken|erhoehen|sollten Sie|empfehlen/i.test(einordnung.text),
        `der Text empfiehlt einen Preis statt eine Lage zu nennen: ${einordnung.text}`);
    }
  });

  it("der Vorbehalt steht weiterhin in der Antwort", async () => {
    const r = await getSuggestion(musterPool(), {
      role: "Pflegekraft", context: "supply", ownPriceCents: 3000
    });
    assert.match(r.disclaimer, /Unverbindlich/i,
      "der Vorbehalt ist verschwunden — dann liest sich die Spanne wie eine Zusage");
    assert.match(r.disclaimer, /Kein Preisversprechen/i);
  });

  it("`ueber Markt` ist kein Urteil", async () => {
    /* Eine Firma mit Fahrdienst und Nachtzuschlag DARF darueber liegen
       (M-E11). Der Text sagt das mit. */
    const { einordnung } = await einordnungFuer(999999);
    assert.match(einordnung.text, /kann berechtigt sein/i,
      "der Text erklaert einen hoeheren Satz zum Fehler");
  });
});

/* ── 3. Der Weg nach draussen ────────────────────────────────────────── */

describe("N7.2 · die Route nimmt den eigenen Satz entgegen", () => {
  const ROUTE = fs.readFileSync(path.join(API, "routes", "smartPricing.js"), "utf8");

  it("das Feld ist geprueft, nicht geglaubt", () => {
    assert.match(ROUTE, /own_price_cents: z\.coerce\.number\(\)\.int\(\)\.positive\(\)/,
      "der eigene Satz wird ungeprueft durchgereicht");
    assert.match(ROUTE, /\.max\(1000000\)/,
      "es fehlt eine Obergrenze — ein absurder Wert erzeugt eine absurde Einordnung");
    assert.match(ROUTE, /\.optional\(\)/,
      "das Feld ist Pflicht geworden — dann bricht jeder bisherige Aufruf");
  });

  it("er erreicht den Dienst wirklich", () => {
    assert.match(ROUTE, /own_price_cents: ownPriceCents/,
      "das Feld wird geparst und dann nicht entnommen");
    assert.match(ROUTE, /\n\s*ownPriceCents\n?\s*\}\);/,
      "der Wert wird nicht an getSuggestion weitergereicht — genau die Sorte "
      + "halber Verdrahtung, gegen die diese Spur gebaut ist");
  });
});
