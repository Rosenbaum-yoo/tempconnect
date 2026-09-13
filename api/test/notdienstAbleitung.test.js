/**
 * Der Notdienst wird abgeleitet, nicht gefragt (N2.1, 2026-09-06).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE VORGABE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner, 2026-09-05: *„taggenau ist besser, dann braucht der Notdienst nicht
 * extra angegeben werden. Wenn er sagt Einsatz ab morgen, ist es Notdienst;
 * wenn er sagt Einsatz in 2 Tagen, ist es auch Notdienst; alles andere nicht
 * Notdienst."* Bestätigt und ergänzt am 2026-09-06.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM DAS EIN BUG-FIX IST UND KEIN KOMFORT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die Dringlichkeit war ein Feld im Formular. Es liess sich in BEIDE Richtungen
 * falsch setzen, und beide Richtungen kosten:
 *
 *   Einsatz morgen als „normal"       Die 30-Minuten-Uhr laeuft nie an, niemand
 *                                     wird alarmiert, die Schicht bleibt leer.
 *   Einsatz in drei Wochen als        50 Anbieter werden ohne Anlass alarmiert -
 *   „Notdienst"                       und beim naechsten Mal sieht keiner hin.
 *
 * Der Einsatzbeginn steht ohnehin im Formular. Aus zwei Angaben eine zu machen,
 * die einander widersprechen koennen, ist die Fehlerquelle.
 *
 * Run: node --test --test-force-exit test/notdienstAbleitung.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import {
  notdienstAusStartdatum, NOTDIENST_VORLAUF_TAGE
} from "../services/emergencyStaffingService.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HIER, "..");
const OEFFENTLICH = path.resolve(API, "..", "frontend", "public");
const FORMULAR = path.join(OEFFENTLICH, "marketplace_demand_create.html");
const formularDa = fs.existsSync(FORMULAR);

/** JJJJ-MM-TT, `tage` Kalendertage von `heute` entfernt. */
function tagVersetzt(heute, tage) {
  const t = Date.UTC(+heute.slice(0, 4), +heute.slice(5, 7) - 1, +heute.slice(8, 10), 12);
  return new Date(t + tage * 86400000).toISOString().slice(0, 10);
}

const HEUTE = "2026-09-06";

/* ═══════════════════════════════════════════════════════════════════════
   1. Die Regel
   ═══════════════════════════════════════════════════════════════════════ */

describe("N2.1 · die Regel: Vorlauf entscheidet", () => {

  it("die Grenze liegt bei ZWEI Kalendertagen", () => {
    /* Die Vorgabe nennt beide Seiten der Grenze ausdruecklich: „Einsatz in 2
       Tagen ist auch Notdienst". Ein `<` statt `<=` waere ein stiller
       Off-by-one, den niemand bemerkt, bis eine Schicht leer bleibt. */
    for (const [tage, erwartet] of [
      [0, "notdienst"], [1, "notdienst"], [2, "notdienst"],
      [3, "normal"], [7, "normal"], [90, "normal"]
    ]) {
      assert.strictEqual(
        notdienstAusStartdatum(tagVersetzt(HEUTE, tage), { heute: HEUTE }), erwartet,
        `Vorlauf ${tage} Tage`);
    }
  });

  it("ein Beginn in der VERGANGENHEIT ist erst recht Notdienst", () => {
    /* Ein nachgetragener Bedarf fuer gestern ist nicht „normal" - er ist schon
       ueberfaellig. Ohne diesen Fall waere die dringendste Lage die
       harmloseste Einstufung. */
    for (const tage of [-1, -3, -30]) {
      assert.strictEqual(
        notdienstAusStartdatum(tagVersetzt(HEUTE, tage), { heute: HEUTE }), "notdienst",
        `Beginn vor ${-tage} Tagen`);
    }
  });

  it("ohne gueltiges Datum gibt es KEINE Einstufung aus dem Nichts", () => {
    for (const unsinn of [null, undefined, "", "  ", "morgen", "2026-13-45", 42, {}]) {
      assert.strictEqual(notdienstAusStartdatum(unsinn, { heute: HEUTE }), "normal",
        `${JSON.stringify(unsinn)} erzeugte eine Einstufung`);
    }
  });

  it("DIE MITTERNACHTS-FALLE, gegen die todayDE() gebaut ist", () => {
    /*
     * Der Grund, warum hier `todayDE()` steht und nicht
     * `new Date().toISOString().slice(0,10)`.
     *
     * Ein Bedarf fuer den 08.09., angelegt am 06.09. um 23:30 Berliner Zeit:
     * tagesgenau sind das 2 Tage Vorlauf - ein Notdienst. Der rohe UTC-Schnitt
     * liest zu diesem Zeitpunkt noch den 05.09. und rechnet 3 Tage. Aus dem
     * Notdienst wird eine regulaere Suche, und niemand wird alarmiert.
     *
     * Zwei Stunden am Tag, an denen die Einstufung kippt.
     */
    assert.strictEqual(notdienstAusStartdatum("2026-09-08", { heute: "2026-09-06" }), "notdienst",
      "tagesgenau Berlin");
    assert.strictEqual(notdienstAusStartdatum("2026-09-08", { heute: "2026-09-05" }), "normal",
      "die Probe belegt den Unterschied nicht — dann prueft sie nichts");

    /*
     * Und die Form dazu. Das Verhalten oben zeigt, DASS der Tag entscheidet -
     * es kann aber nicht zeigen, WELCHE Uhr gelesen wird, weil beide Faelle
     * `heute` mitgegeben bekommen. Der Unterschied faellt nur zwischen 23:00
     * und 01:00 auf, also an zwei Stunden am Tag; eine Probe, die darauf
     * wartet, ist keine.
     *
     * Eine Rueckmutation auf `new Date().toISOString().slice(0,10)` hat genau
     * deshalb ueberlebt. Deshalb hier zusaetzlich der Blick in den Quelltext.
     */
    const dienst = fs.readFileSync(path.join(API, "services", "emergencyStaffingService.js"), "utf8");
    const rumpf = dienst.slice(dienst.indexOf("export function notdienstAusStartdatum"));
    const funktion = rumpf.slice(0, rumpf.indexOf("\n}") + 2);
    assert.match(funktion, /opt\.heute \|\| todayDE\(\)/,
      "die Regel liest nicht den Berliner Kalendertag — zwischen 23 und 1 Uhr stuft sie falsch ein");
    assert.ok(!/toISOString\(\)\.slice/.test(funktion),
      "ein roher UTC-Schnitt ist zurueck");
  });

  it("ein Zeitpunkt MIT Uhrzeit wird nach Berlin gerechnet", () => {
    /* 22:30 UTC am 8. ist in Berlin bereits 00:30 am 9. — also drei Tage
       Vorlauf, nicht zwei. Wer hier UTC stehen laesst, stuft falsch ein. */
    assert.strictEqual(notdienstAusStartdatum("2026-09-08T10:00:00Z", { heute: HEUTE }), "notdienst");
    assert.strictEqual(notdienstAusStartdatum("2026-09-08T22:30:00Z", { heute: HEUTE }), "normal");
  });

  it("ein reiner Kalendertag behaelt seinen Tag", () => {
    /*
     * Hier stand einmal ein Sonderweg im Dienst, der reine Kalendertage an der
     * Zeitzonenrechnung vorbeifuehrte. Eine Rueckmutation hat gezeigt, dass er
     * nichts bewirkt: `new Date("2026-09-08")` ist Mitternacht UTC, und Berlin
     * liegt ganzjaehrig davor - derselbe Tag. Der Zweig ist entfernt, die
     * Zusicherung bleibt: ein Kalendertag darf nicht verrutschen.
     */
    assert.strictEqual(notdienstAusStartdatum("2026-09-08", { heute: HEUTE }), "notdienst");
    assert.strictEqual(notdienstAusStartdatum("2026-09-09", { heute: HEUTE }), "normal");
  });

  it("ohne `heute` rechnet sie gegen den heutigen Berliner Tag", () => {
    /* Die Vorrichtung gibt `heute` mit, damit die Proben nicht morgen anders
       ausgehen. Der Normalfall muss trotzdem laufen. */
    const heuteEcht = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
    assert.strictEqual(notdienstAusStartdatum(heuteEcht), "notdienst");
    assert.strictEqual(notdienstAusStartdatum(tagVersetzt(heuteEcht, 10)), "normal");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. Die Verdrahtung: das Feld im Rumpf hat keine Wirkung mehr
   ═══════════════════════════════════════════════════════════════════════ */

describe("N2.1 · die Route leitet ab, statt zu fragen", () => {

  const ROUTE = fs.readFileSync(path.join(API, "routes", "marketplace.js"), "utf8");
  const rumpf = ROUTE.slice(ROUTE.indexOf('router.post("/marketplace/demand-requests", requireAuth'));
  const handler = rumpf.slice(0, rumpf.indexOf("\n  router."));

  it("die Dringlichkeit kommt aus dem Startdatum", () => {
    assert.match(handler, /emergencyService\.notdienstAusStartdatum\(parsed\.data\.start_date\)/,
      "die Ableitung wird nicht aus dem Startdatum gespeist");
  });

  it("der Wert aus dem Rumpf wird nirgends mehr gelesen", () => {
    assert.ok(!/req\.body\?\.urgency/.test(handler),
      "der Handler liest weiterhin `req.body.urgency` — dann gibt es wieder zwei Wahrheiten");
  });

  it("BEIDE Wege bekommen die abgeleitete Dringlichkeit", () => {
    /*
     * Der Fehler, den eine Probe beim Bauen gefangen hat:
     * `createEmergencyRequest` liest `payload.urgency`, und im geparsten Rumpf
     * stand noch der Standardwert des Schemas ("normal"). Die
     * Notdienst-Maschinerie waere mit NORMALER SLA angelaufen — 120 Minuten
     * statt 30, kein Antwortfenster, keine Eskalation. Ein Notdienst, der
     * keiner ist, und niemand haette es gesehen.
     */
    /* Nachgezogen in N4.5: das Regex verlangte hier ein schliessendes ` }`
       direkt nach `urgency` — also "kein weiterer Schluessel". Das ist nicht die
       Zusage, sondern ein Detail: N4.5 haengt `requester_org_id` fuer die
       Kundensperre an. Die Zusage bleibt unveraendert streng — `urgency` steht
       UNMITTELBAR nach dem Spread, sonst gewinnt der Schema-Standard. */
    assert.match(handler, /createEmergencyRequest\(\s*\n?\s*pool, req\.session\.userId, plan, \{ \.\.\.parsed\.data, urgency(?:\s*\}|,)/,
      "der Notdienst-Weg bekommt die abgeleitete Stufe nicht");
    assert.ok(!/createEmergencyRequest\([\s\S]{0,160}?urgency,[^}]*\burgency\s*:/.test(handler),
      "hinter der abgeleiteten Stufe wird `urgency` erneut gesetzt — dann gewinnt der spaetere Wert");
    assert.match(handler, /\.\.\.parsed\.data,\s*\n\s*\/\* Nach dem Spread[\s\S]{0,120}?\n\s*urgency,/,
      "der normale Weg bekommt sie nicht — oder VOR dem Spread, dann gewinnt der Schema-Standard");
  });

  it("ohne Tarif wird nicht gesperrt, sondern hingewiesen", () => {
    /*
     * Bisher 403. Abgeleitet waere daraus eine Sperre fuer jeden kurzfristigen
     * Bedarf — und sie braechte nichts ein: derselbe Kunde setzt heute einfach
     * „normal" und schreibt aus. Er bekommt jetzt dasselbe, plus den Hinweis.
     */
    assert.ok(!/PLAN_REQUIRED_NOTDIENST" \}\);/.test(handler),
      "ein kurzfristiger Bedarf wird weiterhin mit 403 abgewiesen");
    assert.match(handler, /notdienst_verfuegbar: !notdienstOhneTarif/,
      "der Kunde erfaehrt nicht, dass ihm der Notdienst fehlt");
    assert.match(handler, /notdienst_hinweis: "PLAN_REQUIRED_NOTDIENST"/,
      "der Hinweis nennt den Grund nicht");
  });

  it("die Nebenbei-Bedarfe bleiben bewusst `normal`", () => {
    /*
     * Zwei Pfade legen einen Bedarf NEBENBEI an, waehrend ein
     * Kapazitaetsangebot angenommen oder verhandelt wird ("Zustimmung: …").
     * Er ist im selben Moment schon gedeckt. Ihn als Notdienst zu markieren
     * wuerde die Notdienst-Tafel mit bereits erledigten Faellen fuellen — die
     * Tafel zeigt `status = 'open'`, und wer sie dreimal umsonst oeffnet,
     * oeffnet sie beim vierten Mal nicht mehr.
     */
    const treffer = (ROUTE.match(/urgency: "normal"/g) || []).length;
    assert.strictEqual(treffer, 2,
      `${treffer} statt 2 Nebenbei-Bedarfe mit fester Einstufung — wurde einer umgestellt?`);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. Das Formular fragt nicht mehr — und zeigt dieselbe Regel
   ═══════════════════════════════════════════════════════════════════════ */

describe("N2.1 · kein Haekchen mehr",
  { skip: formularDa ? false : "frontend/public nicht im Abbild" }, () => {

  const html = formularDa ? fs.readFileSync(FORMULAR, "utf8") : "";

  it("das Auswahlfeld ist weg", () => {
    assert.ok(!/<select id="urgency"/.test(html),
      "die Dringlichkeit laesst sich wieder von Hand setzen");
    assert.ok(!/getElementById\("urgency"\)\.value/.test(html),
      "das Formular schickt weiterhin eine Dringlichkeit — eine zweite Wahrheit");
    assert.match(html, /<div id="urgencyAnzeige"/,
      "es gibt keinen Ort, an dem die abgeleitete Stufe erscheint");
  });

  it("die Anzeige haengt am Startdatum, nicht an einem Knopf", () => {
    assert.match(html, /feld\.addEventListener\("input", zeigeDringlichkeit\)/,
      "die Stufe erscheint nicht beim Tippen des Datums");
    assert.match(html, /feld\.addEventListener\("change", zeigeDringlichkeit\)/,
      "ein Datum aus dem Kalenderfeld loest die Anzeige nicht aus");
  });

  it("BEIDE KOPIEN DER REGEL NENNEN DIESELBE ZAHL", () => {
    /*
     * Die Regel steht zweimal: im Dienst (er ENTSCHEIDET) und im Formular (es
     * ZEIGT nur an). Die Doppelung ist Absicht — eine Anzeige, die auf eine
     * Serverantwort wartet, kaeme zu spaet; sie soll beim Tippen erscheinen.
     *
     * Genau deshalb braucht sie diese Wache: liefen die Zahlen auseinander,
     * saehe der Kunde „regulaere Suche" und bekaeme einen Notdienst, oder
     * umgekehrt. Ein Widerspruch, den niemand meldet, weil beide Seiten fuer
     * sich stimmig sind.
     */
    const imFormular = html.match(/var VORLAUF_TAGE = (\d+);/);
    assert.ok(imFormular, "das Formular nennt keine Vorlaufzahl mehr");
    assert.strictEqual(Number(imFormular[1]), NOTDIENST_VORLAUF_TAGE,
      `Formular sagt ${imFormular[1]} Tage, der Dienst ${NOTDIENST_VORLAUF_TAGE}`);
  });

  it("die Anzeige stuft genauso ein wie der Dienst", () => {
    /*
     * ERST NACH EINER RUECKMUTATION RICHTIG.
     *
     * Die erste Fassung holte sich `tageBis` und `VORLAUF_TAGE` aus dem
     * Formular und verglich dann SELBST (`tage <= VORLAUF`). Damit prueft sie
     * ihre eigene Rechnung, nicht die des Formulars: ein `<` statt `<=` DORT
     * blieb unsichtbar, weil die Zahl ja stimmte.
     *
     * Jetzt laeuft die Anzeige wirklich - mit einer DOM-Attrappe - und es wird
     * gelesen, was sie hinschreibt.
     */
    const block = html.slice(html.indexOf("var VORLAUF_TAGE"));
    const quelle = block.slice(0, block.indexOf("function start()"));

    const ziel = { className: "", innerHTML: "" };
    const feld = { value: "" };
    const document_ = {
      getElementById: (id) => id === "urgencyAnzeige" ? ziel : (id === "start_date" ? feld : null)
    };
    const sandkasten = {
      document: document_, window: {}, Intl, Date, Math, Number, String, RegExp,
      console: { log() {} }
    };
    vm.createContext(sandkasten);
    vm.runInContext(quelle + "\nglobalThis._zeige = zeigeDringlichkeit;",
      sandkasten, { filename: "urgencyAnzeige" });

    const heuteEcht = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());

    for (const tage of [-1, 0, 1, 2, 3, 10]) {
      const datum = tagVersetzt(heuteEcht, tage);
      feld.value = datum;
      sandkasten._zeige();
      const imBrowser = /urgency-anzeige--notdienst/.test(ziel.className) ? "notdienst" : "normal";
      const imDienst = notdienstAusStartdatum(datum);
      assert.strictEqual(imBrowser, imDienst,
        `Vorlauf ${tage} Tage: die Anzeige sagt ${imBrowser}, der Dienst sagt ${imDienst}`);
    }

    /* Und ohne Datum sagt sie gar nichts - keine erfundene Einstufung. */
    feld.value = "";
    sandkasten._zeige();
    assert.ok(!/urgency-anzeige--notdienst/.test(ziel.className),
      "ohne Datum behauptet die Anzeige einen Notdienst");
  });
});
