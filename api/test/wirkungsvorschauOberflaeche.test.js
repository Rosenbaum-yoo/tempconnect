/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE WIRKUNGSVORSCHAU IN DER OBERFLÄCHE (U6.2b)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der Dienst kann die Folge richtig berechnen und die Oberfläche sie trotzdem
 * nicht zeigen — das ist in dieser Codebasis die häufigste Lücke, und sie sieht
 * in jedem Backend-Test grün aus. Deshalb wird `vendorPool.js` hier in einer
 * vm-Sandbox WIRKLICH ausgeführt und die Sätze werden an echten Zahlen gebaut.
 *
 * WAS DIESE DATEI ÜBER DIE BLOSSE ANWESENHEIT HINAUS PRÜFT:
 *
 *   1. Kein Weg an der Vorschau vorbei. Vorher feuerte `suspendEntry` sofort,
 *      ohne Rückfrage, mit einem fest eingebauten Grund — und hing auf
 *      `window`. Diese Datei sichert zu, dass es KEINE Funktion mehr gibt, die
 *      `status: 'suspended'` oder `tier: 'BLOCKED'` schickt, ohne durch den
 *      Dialog gegangen zu sein. Eine Prüfung „der Dialog existiert" hätte den
 *      zweiten Weg nicht gesehen.
 *   2. Die Sätze entstehen aus GEMESSENEN Zahlen. Keine Zahl, kein Satz: eine
 *      Vorschau, die „0 Konditionskarten verweisen auf diesen Lieferanten"
 *      schreibt, ist Lärm und macht die echten Sätze unglaubwürdig.
 *   3. Der ehrliche Leerzustand. „Keine messbare Folge" ist eine Auskunft, die
 *      das Handeln erleichtert — ein leerer Kasten liest sich wie dieselbe
 *      Auskunft, beweist sie aber nicht und erscheint auch dann, wenn das Laden
 *      gescheitert ist.
 *   4. Beide Sprachen. Ein fehlender englischer Schlüssel fällt stumm auf
 *      Deutsch zurück — in einer Vorschau, die über eine Sperre entscheidet,
 *      ist das kein Schönheitsfehler.
 *
 * Run: node --test --test-force-exit test/wirkungsvorschauOberflaeche.test.js
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* Aufwärts suchen UND auf Inhalt prüfen: Docker legt Mount-Ziele als leere
   Verzeichnisse an, und ein leeres Verzeichnis macht jede Prüfung lautlos grün. */
function findeWurzel() {
  for (const start of [__dirname, process.cwd()]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      const kandidat = path.join(dir, "frontend/public/js/pages/vendorPool.js");
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

suite("U6.2b — die Wirkungsvorschau in der Oberfläche", () => {
  let ctx;
  let elemente;
  let html;
  let js;
  let woerter;

  function elem(id) {
    return {
      id, innerHTML: "", textContent: "", value: "", disabled: false,
      style: {}, _classes: new Set(),
      classList: {
        add(c) { elemente[id]._classes.add(c); },
        remove(c) { elemente[id]._classes.delete(c); },
        contains(c) { return elemente[id]._classes.has(c); }
      },
      focus() {}, appendChild() {}
    };
  }

  before(() => {
    html = fs.readFileSync(path.join(ROOT, "frontend/public/vendor_pool.html"), "utf8");
    js = fs.readFileSync(path.join(ROOT, "frontend/public/js/pages/vendorPool.js"), "utf8");

    elemente = {};
    woerter = { de: {}, en: {} };
    const hole = (id) => (elemente[id] = elemente[id] || elem(id));

    const TCi18n = {
      register: (lang, dict) => Object.assign(woerter[lang] = woerter[lang] || {}, dict),
      t: (key, params) => {
        const wert = woerter.de[key];
        if (wert == null) return "";
        return String(wert).replace(/\{(\w+)\}/g, (m, n) => (params && n in params ? String(params[n]) : m));
      },
      locale: () => "de",
      dateLocale: () => "de-DE"
    };

    ctx = {
      TCi18n, console,
      document: {
        readyState: "loading",
        addEventListener: () => {},
        getElementById: (id) => elemente[id] || null,
        querySelectorAll: () => [],
        querySelector: () => null,
        /* esc() baut ein echtes div und liest innerHTML — der Ersatz muss das
           tun, was esc() davon braucht, sonst prüft diese Datei eine Attrappe. */
        createElement: () => ({
          _t: "",
          set textContent(v) { this._t = String(v); },
          get textContent() { return this._t; },
          get innerHTML() {
            return this._t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          }
        }),
        documentElement: { setAttribute: () => {} }
      },
      window: { location: { search: "", href: "/public/vendor_pool.html" } },
      localStorage: { getItem: () => null, setItem: () => {} },
      navigator: { language: "de-DE", languages: ["de-DE"] },
      fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve("{}") }),
      setTimeout, clearTimeout, setInterval, clearInterval,
      URLSearchParams, URL,
      Date, Math, JSON, encodeURIComponent, decodeURIComponent, Intl,
      alert: () => {}, confirm: () => true, prompt: () => "Grund"
    };
    ctx.window.TCi18n = TCi18n;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(js, ctx, { filename: "vendorPool.js" });

    hole("wirkungBody");
    hole("wirkungModal");
    hole("wirkungReason");
    hole("wirkungReasonHint");
    hole("wirkungConfirm");
    hole("poolState");
  });

  /* ── Es gibt keinen Weg vorbei ──────────────────────────────────────────── */

  it("suspendEntry ist weg — und zwar als Funktion UND als window-Export", () => {
    /*
     * DIE WICHTIGSTE ZUSICHERUNG DIESER DATEI. Ein stehengelassenes
     * `suspendEntry` wäre kein toter Code, sondern eine offene Tür: aus der
     * Konsole sofort benutzbar, und beim nächsten Umbau nur einen
     * Knopf-Umzug entfernt. Geprüft wird die LAUFZEIT, nicht der Text —
     * ein Quelltext-Muster hätte an meinen eigenen Kommentaren angeschlagen,
     * in denen der Name noch dreimal vorkommt.
     */
    assert.equal(typeof ctx.suspendEntry, "undefined",
      "suspendEntry ist noch definiert — der Weg an der Vorschau vorbei ist offen");
    assert.equal(typeof ctx.window.suspendEntry, "undefined",
      "window.suspendEntry ist noch da — aus der Konsole sofort aufrufbar");
  });

  it("die drei Funktionen des Dialogs sind am window — sonst tun die onclick-Handler nichts", () => {
    for (const name of ["oeffneWirkung", "bestaetigeWirkung", "closeWirkung"]) {
      assert.equal(typeof ctx.window[name], "function",
        "window." + name + " fehlt — der Knopf im Markup zeigt ins Leere");
    }
  });

  it("jeder onclick im Vorschau-Dialog zeigt auf eine vorhandene Funktion", () => {
    const dialog = html.match(/<div class="modal" id="wirkungModal">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
    assert.ok(dialog, "der Dialog steht nicht im Markup");
    const aufrufe = [...dialog[0].matchAll(/onclick="(\w+)\(/g)].map(m => m[1]);
    assert.ok(aufrufe.length >= 3, "erwartet: mindestens Bestätigen und zweimal Abbrechen, gefunden: " + aufrufe.length);
    for (const name of new Set(aufrufe)) {
      assert.equal(typeof ctx.window[name], "function",
        'onclick="' + name + '(" im Dialog, aber window.' + name + " existiert nicht");
    }
  });

  it("der Sperr-Knopf in der Zeile und die Stufe BLOCKED gehen BEIDE durch die Vorschau", () => {
    /* Die zweite Tür: die Auswahlliste der Stufen enthält BLOCKED, und BLOCKED
       nimmt den Lieferanten nach der Pool-Definition aus U6.2 aus dem Pool.
       Hätte der Dialog nur am Sperr-Knopf gehangen, wäre die Liste der stille
       Weg daran vorbei gewesen. */
    assert.match(js, /onclick="oeffneWirkung\(\\'/,
      "der Sperr-Knopf in der Zeile ruft die Vorschau nicht");
    assert.match(js, /if\(tier==='BLOCKED'\)\{\s*oeffneWirkung\(id,'blocked'\);\s*return;\s*\}/,
      "eine Abstufung auf BLOCKED umgeht die Vorschau");
  });

  it("niemand schickt suspended oder BLOCKED ausserhalb von bestaetigeWirkung", () => {
    /*
     * ERREICHBARKEIT, NICHT ANWESENHEIT. Eine Zählung von Vorkommen hätte
     * nichts bewiesen; hier wird der Quelltext an den Funktionsgrenzen zerlegt
     * und geprüft, WELCHE Funktion die Mutation absetzt.
     */
    const schreibende = [...js.matchAll(/status:\s*'suspended'|tier:\s*'BLOCKED'/g)];
    assert.ok(schreibende.length >= 2, "die beiden Schreibvorgänge sind nicht mehr auffindbar");
    for (const treffer of schreibende) {
      const davor = js.slice(0, treffer.index);
      const funktion = [...davor.matchAll(/(?:async\s+)?function\s+(\w+)\s*\(/g)].pop();
      assert.ok(funktion, "Schreibvorgang ausserhalb jeder Funktion gefunden");
      assert.equal(funktion[1], "bestaetigeWirkung",
        "'" + treffer[0] + "' wird in " + funktion[1] + "() abgesetzt, nicht in " +
        "bestaetigeWirkung() — damit gibt es einen Weg an der Wirkungsvorschau vorbei");
    }
  });

  /* ── Die Sätze entstehen aus Zahlen ─────────────────────────────────────── */

  it("keine Zahl, kein Satz", () => {
    const leer = ctx.wirkungSaetze({
      konditionskarten: 0, laufende_einsaetze: 0, offene_verteilungen: 0,
      rahmenvertraege: 0, einsaetze_aus_abschluss: 0, bleibt_partner: false
    });
    const texte = leer.map(z => z.text).join(" | ");
    assert.doesNotMatch(texte, /\b0 Konditionskarten/,
      "eine Null wird als Satz ausgegeben — das macht die echten Sätze unglaubwürdig");
    assert.doesNotMatch(texte, /\b0 laufende/, "eine Null wird als Satz ausgegeben");
    /* Was trotzdem kommen MUSS: die Partner-Aussage und der Hinweis auf die
       offenen Runden. Beide gelten unabhängig von jeder Zahl. */
    assert.equal(leer.length, 2,
      "erwartet genau zwei unbedingte Sätze (Partner-Lage + offene Runden), gefunden: " + leer.length);
  });

  it("jede gemessene Zahl erscheint mit ihrem Wert im Satz", () => {
    const voll = ctx.wirkungSaetze({
      konditionskarten: 3, laufende_einsaetze: 7, offene_verteilungen: 2,
      rahmenvertraege: 0, einsaetze_aus_abschluss: 0, bleibt_partner: false
    });
    const texte = voll.map(z => z.text).join(" | ");
    assert.match(texte, /\b3\b/, "die Zahl der Konditionskarten fehlt im Satz");
    assert.match(texte, /\b7\b/, "die Zahl der laufenden Einsätze fehlt im Satz");
    assert.match(texte, /\b2\b/, "die Zahl der offenen Verteilungen fehlt im Satz");
    assert.equal(voll.length, 5, "erwartet 3 Zahlensätze + 2 unbedingte, gefunden: " + voll.length);
  });

  it("die Sperre wird als SPERRE gezeigt, nicht als Hinweis", () => {
    /* Der einzige Satz, der etwas verbietet, muss sich auch so lesen — und als
       einziger den Ton 'bad' tragen. Ein Satz, der eine Sperre im Fliesston
       nennt, wird überlesen. */
    const gesperrt = ctx.wirkungSaetze({
      konditionskarten: 0, laufende_einsaetze: 0, offene_verteilungen: 0,
      rahmenvertraege: 0, einsaetze_aus_abschluss: 0, bleibt_partner: false
    });
    const schlimm = gesperrt.filter(z => z.ton === "bad");
    assert.equal(schlimm.length, 1, "genau ein Satz darf den schwersten Ton tragen");
    assert.match(schlimm[0].text, /KEIN neuer Einsatz/,
      "der Sperr-Satz benennt die Sperre nicht deutlich");

    const offen = ctx.wirkungSaetze({
      konditionskarten: 0, laufende_einsaetze: 0, offene_verteilungen: 0,
      rahmenvertraege: 1, einsaetze_aus_abschluss: 0, bleibt_partner: true
    });
    assert.equal(offen.filter(z => z.ton === "bad").length, 0,
      "mit bestehender Partnerschaft darf kein Sperr-Satz erscheinen");
  });

  it("der ehrliche Leerzustand steht im Kasten — und nur dann", () => {
    ctx.renderWirkung({
      konditionskarten: 0, laufende_einsaetze: 0, offene_verteilungen: 0,
      rahmenvertraege: 1, einsaetze_aus_abschluss: 0, bleibt_partner: true
    });
    assert.match(elemente.wirkungBody.innerHTML, /Keine messbare Folge/,
      "ohne Folge fehlt die Auskunft, dass es keine gibt — ein leerer Kasten " +
      "sieht genauso aus wie ein gescheitertes Laden");

    ctx.renderWirkung({
      konditionskarten: 2, laufende_einsaetze: 0, offene_verteilungen: 0,
      rahmenvertraege: 1, einsaetze_aus_abschluss: 0, bleibt_partner: true
    });
    assert.doesNotMatch(elemente.wirkungBody.innerHTML, /Keine messbare Folge/,
      "mit 2 Konditionskarten wird trotzdem 'keine Folge' behauptet");
  });

  it("Fremdtext in den Sätzen kommt escaped an", () => {
    /*
     * esc() ist Pflicht vor innerHTML. Die Zusicherung gehört an den PFAD, nicht
     * an die heutigen Daten: heute sind die eingesetzten Werte Zahlen, aber jede
     * künftige Erweiterung (ein Lieferantenname im Satz, eine Kategorie) nimmt
     * genau diesen Weg.
     *
     * ERSTER VERSUCH WAR LEER GRÜN, und der Grund ist lehrreich: ich hatte
     * `konditionskarten: "3<script>…"` übergeben. Der Satz wird aber nur bei
     * `w.konditionskarten > 0` gebaut — und `"3<script>…" > 0` ist `NaN > 0`,
     * also **false**. Der gefährliche Text hat die Ausgabe nie erreicht; die
     * Rückmutation (esc() entfernt) blieb grün, weil die Probe ihren Gegenstand
     * gar nicht herstellte. Dritter Fall dieser Art in dieser Woche.
     *
     * Jetzt wird der Text dort eingesetzt, wo er die Ausgabe GARANTIERT erreicht:
     * im Wörterbuch-Eintrag des unbedingten Partner-Satzes.
     */
    const echt = woerter.de["exe.vp.wirkung.keinPartner"];
    woerter.de["exe.vp.wirkung.keinPartner"] = 'KEIN neuer Einsatz <script>alert(1)</script>';
    try {
      ctx.renderWirkung({
        konditionskarten: 0, laufende_einsaetze: 0, offene_verteilungen: 0,
        rahmenvertraege: 0, einsaetze_aus_abschluss: 0, bleibt_partner: false
      });
      /* Erst belegen, DASS der Satz angekommen ist — sonst prüft die Zusicherung
         unten wieder nichts. */
      assert.match(elemente.wirkungBody.innerHTML, /KEIN neuer Einsatz/,
        "der Satz ist gar nicht in der Ausgabe — die Zusicherung wäre leer grün");
      assert.doesNotMatch(elemente.wirkungBody.innerHTML, /<script>/,
        "ungeescapter Fremdtext landet im innerHTML");
      assert.match(elemente.wirkungBody.innerHTML, /&lt;script&gt;/,
        "der Text wurde nicht escaped, sondern entfernt — das verschweigt Inhalt");
    } finally {
      woerter.de["exe.vp.wirkung.keinPartner"] = echt;
    }
  });

  /* ── Beide Sprachen ─────────────────────────────────────────────────────── */

  it("jeder Schlüssel der Vorschau steht in DE UND EN", () => {
    const neue = Object.keys(woerter.de).filter(k => k.indexOf("exe.vp.wirkung.") === 0);
    assert.ok(neue.length >= 13,
      "erwartet: die Schlüssel der Vorschau, gefunden: " + neue.length);
    for (const k of neue) {
      assert.ok(woerter.en[k], k + " fehlt im englischen Katalog — die englische " +
        "Oberfläche fällt stumm auf Deutsch zurück");
      assert.notEqual(woerter.de[k], "", k + " ist im deutschen Katalog leer");
    }
  });

  it("die Sätze mit Zahlen tragen den Platzhalter {n} in BEIDEN Katalogen", () => {
    for (const k of ["exe.vp.wirkung.karten", "exe.vp.wirkung.einsaetze", "exe.vp.wirkung.verteilungen"]) {
      assert.match(woerter.de[k], /\{n\}/, k + " (DE) hat keinen Platzhalter — die Zahl fehlt im Satz");
      assert.match(woerter.en[k], /\{n\}/, k + " (EN) hat keinen Platzhalter");
    }
  });

  /* ── Der Grund ist Pflicht ──────────────────────────────────────────────── */

  it("ohne Grund von mindestens 10 Zeichen wird NICHT geschrieben", async () => {
    let gerufen = 0;
    ctx.fetch = () => { gerufen++; return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("{}") }); };
    /* Das Ziel setzen, ohne den Ladepfad zu durchlaufen: geprüft wird die
       Vorprüfung, nicht das Öffnen. */
    ctx.wirkungZiel = { id: "abc", aktion: "suspend" };
    elemente.wirkungReason.value = "zu kurz";
    await ctx.bestaetigeWirkung();
    assert.equal(gerufen, 0, "mit 7 Zeichen Grund wurde trotzdem geschrieben");
    assert.match(elemente.wirkungReasonHint.textContent, /mindestens 10/,
      "der Hinweis auf die Mindestlänge erscheint nicht");
  });

  it("ohne Ziel tut die Bestätigung nichts", async () => {
    let gerufen = 0;
    ctx.fetch = () => { gerufen++; return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("{}") }); };
    ctx.wirkungZiel = null;
    elemente.wirkungReason.value = "ein ausreichend langer Grund";
    await ctx.bestaetigeWirkung();
    assert.equal(gerufen, 0, "ohne Ziel wurde eine Mutation abgesetzt");
  });
});
