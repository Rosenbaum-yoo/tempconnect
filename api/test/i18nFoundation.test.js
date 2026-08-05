/**
 * i18n-Fundament (P6.1) — Schicht + erste migrierte Seite (worker-login).
 *
 * Schicht (vm-Sandbox, echtes /public/js/i18n.js):
 *  - Aufloesung: gespeicherte Wahl > Browser-Englisch > DE-Default (DACH)
 *  - t(): EN-Luecke faellt ehrlich auf DE zurueck, nie roher Key; {param}-Interpolation
 *  - set(): persistiert, stempelt <html lang>, uebersetzt neu, feuert tc:langchange
 *  - Hydration: data-i18n (textContent) + data-i18n-ph (placeholder) + Switcher-Render
 *
 * Seite (Struktur + Paritaet):
 *  - i18n.js im <head>, Switcher VOR dem Login sichtbar
 *  - JEDER DE-Schluessel hat einen EN-Schluessel (und umgekehrt) — eine fehlende
 *    Uebersetzung faellt sonst still auf Deutsch zurueck und faellt nie auf
 *  - dynamische JS-Meldungen laufen ueber t(), keine hart kodierten Reste
 *
 * Run: node --test --test-force-exit test/i18nFoundation.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKER_REL = "frontend/public/js/i18n.js";
const ROOT_CWD = process.cwd();
const ROOT_LOCAL = path.resolve(__dirname, "..", "..");
const ROOT = fs.existsSync(path.join(ROOT_CWD, MARKER_REL)) ? ROOT_CWD : ROOT_LOCAL;
const AVAILABLE = fs.existsSync(path.join(ROOT, MARKER_REL));
const suite = AVAILABLE ? describe : describe.skip;

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/* ── Mini-DOM fuer die vm-Sandbox ─────────────────────────────────────────── */

function fakeEl(attrs = {}) {
  const el = {
    _attrs: { ...attrs },
    textContent: "",
    innerHTML: "",
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(el._attrs, n) ? el._attrs[n] : null; },
    setAttribute(n, v) { el._attrs[n] = String(v); },
    appendChild() {},
    closest() { return null; }
  };
  return el;
}

function makeSandbox({ stored = null, navLang = "de-DE" } = {}) {
  const store = new Map();
  if (stored) store.set("tempconnect-lang", stored);
  const textNodes = [fakeEl({ "data-i18n": "k.greet" })];
  const phNodes = [fakeEl({ "data-i18n-ph": "k.ph" })];
  const switcherHosts = [fakeEl({ "data-i18n-switcher": "" })];
  const events = [];
  const docEl = fakeEl();
  const sandbox = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v))
    },
    navigator: { language: navLang, languages: [navLang] },
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } },
    document: {
      documentElement: docEl,
      readyState: "complete",
      head: fakeEl(),
      getElementById: () => null,
      createElement: () => fakeEl(),
      addEventListener: (type, fn) => events.push({ type, fn }),
      dispatchEvent: (ev) => { events.filter((e) => e.type === ev.type).forEach((e) => e.fn(ev)); sandbox._dispatched.push(ev); },
      querySelectorAll: (sel) => {
        if (sel === "[data-i18n]") return textNodes;
        if (sel === "[data-i18n-ph]") return phNodes;
        if (sel === "[data-i18n-title]") return [];
        if (sel === "[data-i18n-switcher]") return switcherHosts;
        return [];
      }
    },
    window: {},
    _store: store, _textNodes: textNodes, _phNodes: phNodes, _switcherHosts: switcherHosts, _docEl: docEl, _dispatched: []
  };
  vm.createContext(sandbox);
  new vm.Script(read(MARKER_REL), { filename: "i18n.js" }).runInContext(sandbox);
  return sandbox;
}

suite("i18n-Schicht — Aufloesung & Uebersetzung", () => {
  it("Default DE (DACH); Browser-Englisch nur ohne gespeicherte Wahl; Storage gewinnt", () => {
    assert.equal(makeSandbox().window.TCi18n.locale(), "de");
    assert.equal(makeSandbox({ navLang: "en-US" }).window.TCi18n.locale(), "en");
    assert.equal(makeSandbox({ stored: "de", navLang: "en-US" }).window.TCi18n.locale(), "de");
    assert.equal(makeSandbox({ stored: "en" }).window.TCi18n.locale(), "en");
  });

  it("t(): DE-Fallback bei EN-Luecke, nie roher Key, {param}-Interpolation", () => {
    const { window: w } = makeSandbox({ stored: "en" });
    w.TCi18n.register("de", { "k.greet": "Hallo {name}", "k.only_de": "Nur Deutsch" });
    w.TCi18n.register("en", { "k.greet": "Hello {name}" });
    assert.equal(w.TCi18n.t("k.greet", { name: "Ada" }), "Hello Ada");
    assert.equal(w.TCi18n.t("k.only_de"), "Nur Deutsch", "EN-Luecke -> ehrlicher DE-Fallback");
    assert.equal(w.TCi18n.t("k.unbekannt"), "", "unbekannter Key wird NIE roh angezeigt");
  });

  it("set('en'): persistiert, stempelt <html lang>, uebersetzt data-i18n/-ph neu, feuert Event", () => {
    const sb = makeSandbox();
    const w = sb.window;
    w.TCi18n.register("de", { "k.greet": "Hallo", "k.ph": "Ihr Passwort" });
    w.TCi18n.register("en", { "k.greet": "Hello", "k.ph": "Your password" });
    w.TCi18n.apply();
    assert.equal(sb._textNodes[0].textContent, "Hallo");
    w.TCi18n.set("en");
    assert.equal(sb._store.get("tempconnect-lang"), "en");
    assert.equal(sb._store.get("tempconnect-lang-explicit"), "1");
    assert.equal(sb._docEl.getAttribute("lang"), "en");
    assert.equal(sb._textNodes[0].textContent, "Hello");
    assert.equal(sb._phNodes[0].getAttribute("placeholder"), "Your password");
    assert.equal(sb._dispatched.filter((e) => e.type === "tc:langchange").length, 1);
    assert.equal(sb._dispatched[0].detail.locale, "en");
  });

  it("Switcher-Render: DE|EN-Knoepfe mit aktivem Zustand", () => {
    const sb = makeSandbox({ stored: "en" });
    sb.window.TCi18n.apply();
    const html = sb._switcherHosts[0].innerHTML;
    assert.match(html, /data-lang="de"/);
    assert.match(html, /data-lang="en"[^>]*aria-pressed="true"|class="tc-lang-btn active" data-lang="en"/);
  });
});

/* ── Erste migrierte Seite: worker-login ──────────────────────────────────── */

function extractDictKeys(html, locale, minKeys = 20) {
  const re = new RegExp("TCi18n\\.register\\('" + locale + "',\\s*\\{([\\s\\S]*?)\\}\\);");
  const m = html.match(re);
  assert.ok(m, "register('" + locale + "') Block nicht gefunden");
  const keys = [...m[1].matchAll(/'([\w.]+)':/g)].map((x) => x[1]);
  assert.ok(keys.length > minKeys, "Woerterbuch " + locale + " unerwartet klein (" + keys.length + " Keys)");
  return new Set(keys);
}

suite("worker-login — erste zweisprachige Seite", () => {
  const html = AVAILABLE ? read("frontend/public/worker-login.html") : "";

  it("i18n.js im <head>, Switcher VOR dem Login sichtbar", () => {
    assert.match(html, /<script src="\/public\/js\/i18n\.js"><\/script>/);
    assert.ok(html.indexOf('src="/public/js/i18n.js"') < html.indexOf("</head>"));
    assert.match(html, /data-i18n-switcher/);
  });

  it("DE/EN-Schluessel sind exakt paritaetisch — keine stille Luecke", () => {
    const de = extractDictKeys(html, "de");
    const en = extractDictKeys(html, "en");
    const missingEn = [...de].filter((k) => !en.has(k));
    const missingDe = [...en].filter((k) => !de.has(k));
    assert.deepEqual(missingEn, [], "Keys ohne EN-Uebersetzung");
    assert.deepEqual(missingDe, [], "EN-Keys ohne DE-Quelle");
  });

  it("alle im Markup referenzierten Keys existieren im DE-Woerterbuch", () => {
    const de = extractDictKeys(html, "de");
    const used = [...html.matchAll(/data-i18n(?:-ph|-title)?="([\w.]+)"/g)].map((m) => m[1]);
    assert.ok(used.length >= 15, "zu wenige data-i18n-Marker — Migration unvollstaendig?");
    const unknown = used.filter((k) => !de.has(k));
    assert.deepEqual(unknown, [], "Markup referenziert unbekannte Keys");
  });

  it("dynamische JS-Meldungen laufen ueber t() — keine hart kodierten Reste", () => {
    assert.match(html, /errEl\.textContent = t\('wk\.login\.errEmpty'\)/);
    assert.match(html, /btn\.textContent = t\('wk\.invite\.working'\)/);
    assert.match(html, /t\('wk\.invite\.hello', \{ first: /);
    assert.doesNotMatch(html, /textContent = 'Bitte E-Mail und Passwort eingeben\.'/);
    assert.doesNotMatch(html, /textContent = 'E-Mail oder Passwort falsch\.'/);
    // Sprachwahl wird nach Login/Accept ins Profil geschrieben
    assert.match(html, /preferred_locale: TCi18n\.locale\(\)/);
    assert.match(html, /await persistLocale\(csrf\)/);
  });
});

/* ── Einsatzportal: Shell-Woerterbuch + alle migrierten Seiten ────────────── */

suite("Portal-Shell — gemeinsames Woerterbuch (ep.nav/ep.shell)", () => {
  const shell = AVAILABLE ? read("frontend/public/js/workerPortal/portalShell.js") : "";

  it("Shell registriert nav/shell-Keys paritaetisch + Profil-Sync ist verdrahtet", () => {
    const de = extractDictKeys(shell, "de", 10);
    const en = extractDictKeys(shell, "en", 10);
    assert.deepEqual([...de].filter((k) => !en.has(k)), [], "Shell-Keys ohne EN");
    assert.deepEqual([...en].filter((k) => !de.has(k)), [], "Shell-EN-Keys ohne DE");
    assert.ok(de.has("ep.nav.start") && de.has("ep.shell.logout"));
    // preferred_locale: Profil anwenden (nicht-explizit) + Wechsel persistieren
    assert.match(shell, /hasExplicitChoice\(\)/);
    assert.match(shell, /set\(pref, \{ explicit: false \}\)/);
    assert.match(shell, /PortalApi\.patch\('\/worker\/me', \{ preferred_locale: e\.detail\.locale \}\)/);
  });
});

const PORTAL_PAGES = [
  "dashboard", "einsaetze", "plan", "stundenzettel", "benachrichtigungen", "kontakt", "profil"
];

/** Alle Inline-Scripts (ohne src) einer Seite. */
function inlineScripts(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

/* ── Plattform-Kernflow: Seiten mit teils AUSGELAGERTEM Seiten-JS ────────── */

/**
 * Migrierte Plattform-Seiten AUTOMATISCH entdecken statt sie zu listen: eine
 * Seite gilt als migriert, sobald sie (oder ihre ausgelagerte Seiten-JS) ein
 * Woerterbuch registriert. So deckt das Gate jede weitere Welle ohne
 * Pflegeaufwand ab — eine handgepflegte Liste waere genau die Sorte Wahrheit,
 * die still veraltet (dieselbe Lehre wie bei der Sichtbarkeits-Ausnahmeliste).
 */
function migriertePlattformSeiten() {
  const dir = path.join(ROOT, "frontend/public");
  const out = [];
  for (const page of fs.readdirSync(dir).filter((f) => f.endsWith(".html"))) {
    if (/^einsatzportal-|^worker-login/.test(page)) continue; // eigene Suite
    const html = fs.readFileSync(path.join(dir, page), "utf8");
    if (!html.includes("js/i18n.js")) continue;
    if (html.includes("TCi18n.register")) { out.push({ page, js: null }); continue; }
    const treffer = [...html.matchAll(/js\/pages\/([a-zA-Z]+)\.js/g)].map((m) => `js/pages/${m[1]}.js`);
    const mitDict = treffer.find((rel) => {
      const p = path.join(dir, rel);
      return fs.existsSync(p) && fs.readFileSync(p, "utf8").includes("TCi18n.register");
    });
    if (mitDict) out.push({ page, js: mitDict });
  }
  return out;
}

const KERNFLOW = migriertePlattformSeiten();

suite("Plattform-Kernflow — zweisprachig (Woerterbuch ggf. im ausgelagerten JS)", () => {
  for (const item of KERNFLOW) {
    it(`${item.page}: DE/EN-Paritaet, bekannte Marker, gueltige Syntax`, () => {
      const html = read(`frontend/public/${item.page}`);
      // Das Woerterbuch liegt entweder inline in der Seite oder in ihrer JS-Datei.
      const dictSource = item.js ? read(`frontend/public/${item.js}`) : html;
      const de = extractDictKeys(dictSource, "de", 3);
      const en = extractDictKeys(dictSource, "en", 3);
      assert.deepEqual([...de].filter((k) => !en.has(k)), [], "Keys ohne EN-Uebersetzung");
      assert.deepEqual([...en].filter((k) => !de.has(k)), [], "EN-Keys ohne DE-Quelle");

      // Marker im Markup muessen aufloesbar sein (Shell-/Portal-Keys zaehlen als bekannt).
      const used = [...html.matchAll(/data-i18n(?:-ph|-title|-aria)?="([\w.]+)"/g)].map((m) => m[1]);
      assert.ok(used.length >= 5, `zu wenige data-i18n-Marker (${used.length})`);
      const unknown = used.filter((k) => !de.has(k) && !/^(shell|ep)\./.test(k));
      assert.deepEqual(unknown, [], "Markup referenziert unbekannte Keys");

      // Kein Woerterbuch-Selbstverweis (stiller Leertext)
      assert.deepEqual([...dictSource.matchAll(/'([\w.]+)':\s*TCi18n\.t\(/g)].map((m) => m[1]), [],
        "Woerterbuch-Werte muessen Texte sein");

      // Syntax: Inline-Scripts der Seite …
      inlineScripts(html).forEach((code, i) => {
        assert.doesNotThrow(() => new vm.Script(code, { filename: `${item.page}-inline-${i}.js` }),
          `Syntaxfehler im Inline-Script #${i} von ${item.page}`);
      });
      // … und die ausgelagerte Seiten-JS
      if (item.js) {
        assert.doesNotThrow(() => new vm.Script(read(`frontend/public/${item.js}`), { filename: item.js }),
          `Syntaxfehler in ${item.js}`);
      }
    });
  }

  it("Zustaendigkeit bleibt getrennt: keine Seite uebersetzt Shell-Navigation selbst", () => {
    for (const item of KERNFLOW) {
      const html = read(`frontend/public/${item.page}`);
      const ownNav = [...html.matchAll(/data-i18n="(shell\.nav\.[\w.]+)"/g)].map((m) => m[1]);
      assert.deepEqual(ownNav, [], `${item.page} markiert Shell-Navigation selbst`);
    }
  });

  it("rollenabhaengige Begriffe bleiben der Terminologie-Matrix ueberlassen", () => {
    // Ein data-i18n-Marker auf einem Element, das TC.terminology befuellt,
    // wuerde die rollenrichtige Fassung beim naechsten apply() ueberschreiben.
    const feed = read("frontend/public/capacity_exchange_feed.html");
    const h1 = feed.match(/<h1[^>]*id="feed-page-h1"[^>]*>/);
    if (h1) assert.doesNotMatch(h1[0], /data-i18n=/, "Terminologie-Element darf keinen i18n-Marker tragen");
  });
});

/* ── Drei-Seiten-Gate: eingefrorene Rollenbegriffe aufspueren ─────────────
   TempConnect bedient DREI Kundenseiten (Unternehmen, Personaldienstleister,
   Arbeiter). Dieselbe Stelle traegt je Rolle bewusst verschiedene Begriffe.
   Die Gefahr der i18n-Migration: ein rollenabhaengiger Begriff wird als
   FESTER Woerterbuch-Wert eingefroren — dann liest eine Zeitarbeitsfirma
   "Personal finden" statt "Arbeitsplatz finden", also die Sprache der
   Gegenseite. Weder Syntax- noch Paritaets-Test sehen das.

   Regel: Steht ein rollenabhaengiger Begriff woertlich als Woerterbuch-Wert,
   MUSS dieselbe Flaeche ihn zur Laufzeit rollenrichtig ueberschreiben
   (TC.terminology.get) ODER rollenspezifische Schluessel fuehren
   (…agency.… / …company.… / …worker.…). Sonst: Ausnahme mit Begruendung. */
suite("Drei-Seiten-Gate — kein eingefrorener Rollenbegriff", () => {
  /** Begriffe, die sich zwischen company und agency unterscheiden. */
  function rollenabhaengigeBegriffe() {
    const js = read("frontend/public/js/terminologyLabels.js");
    const block = js.match(/var LABELS = \{([\s\S]*?)\n  \};/);
    assert.ok(block, "LABELS-Block nicht gefunden");
    const werte = new Map(); // Begriff -> Rollen, die ihn tragen
    for (const line of block[1].split("\n")) {
      const m = line.match(/^\s{4}\w+:\s*\{(.+)\},?\s*$/);
      if (!m) continue;
      const roles = {};
      for (const rm of m[1].matchAll(/(\w+):\s*(?:"([^"]*)"|null)/g)) roles[rm[1]] = rm[2];
      if (roles.company && roles.agency && roles.company !== roles.agency) {
        for (const r of ["company", "agency"]) {
          if (roles[r]) werte.set(roles[r], r);
        }
      }
    }
    assert.ok(werte.size > 5, "zu wenige rollenabhaengige Begriffe erkannt");
    return werte;
  }

  /**
   * Eine Seite, die nur EINE Rolle je erreicht, braucht keine Rollen-
   * verzweigung — dort ist die feste Sprache dieser Rolle korrekt.
   * Diese Wahrheit steht bereits in api/config/visibilityMatrix.js
   * (allowed_org_types, serverseitig durchgesetzt). Wir lesen sie von dort,
   * statt sie in einer Liste zu verdoppeln, die still veraltet: aendert
   * jemand die Sichtbarkeit, zieht dieses Gate automatisch nach.
   *
   * (Frueher stand hier eine handgepflegte Ausnahmeliste. Ihre Begruendung
   * fuer requisitions war schlicht falsch — "Agentur-Sicht spaeter nachziehen",
   * obwohl eine Agentur die Seite gar nicht erreicht. Genau solche Eintraege
   * erzeugen spaeter unnoetige Arbeit.)
   */
  function einRollenSeiten() {
    const src = fs.readFileSync(path.join(ROOT, "api/config/visibilityMatrix.js"), "utf8");
    const out = new Set();
    for (const m of src.matchAll(/page:\s*"([^"]+)"[\s\S]*?allowed_org_types:\s*\[([^\]]*)\]/g)) {
      const typen = [...m[2].matchAll(/"(\w+)"/g)].map((x) => x[1]).filter((t) => t !== "worker");
      if (typen.length === 1) out.add(m[1]);
    }
    return out;
  }

  /** Rest-Ausnahmen, die NICHT aus der Sichtbarkeit folgen — mit Begruendung. */
  const BESTANDS_AUSNAHMEN = {
    "hilfe.html": "Hilfe-Texte adressieren bewusst beide Seiten nacheinander im selben Satz — eine Rollenverzweigung wuerde die jeweils andere Haelfte verstecken."
  };

  const FLAECHEN = [
    "enterprise.html", "js/pages/enterpriseHub.js",
    "capacity_exchange_feed.html", "js/pages/marketplaceFeed.js",
    "requisitions.html", "js/pages/requisitions.js",
    "deal_management.html", "mitarbeiter.html", "js/pages/mitarbeiter.js", "hilfe.html"
  ];

  /** Ausgelagerte Seiten-JS gehoert zur Sichtbarkeit ihrer Seite. */
  const JS_ZU_SEITE = {
    "js/pages/enterpriseHub.js": "enterprise.html",
    "js/pages/marketplaceFeed.js": "capacity_exchange_feed.html",
    "js/pages/requisitions.js": "requisitions.html",
    "js/pages/mitarbeiter.js": "mitarbeiter.html"
  };

  it("jeder woertlich eingefrorene Rollenbegriff wird zur Laufzeit aufgeloest", () => {
    const begriffe = rollenabhaengigeBegriffe();
    const nurEineRolle = einRollenSeiten();
    const verstoesse = [];
    for (const rel of FLAECHEN) {
      // Erreicht nur EINE Rolle diese Seite? Dann ist ihre feste Sprache korrekt.
      const seite = JS_ZU_SEITE[rel] || rel;
      if (nurEineRolle.has(seite)) continue;
      const src = read(`frontend/public/${rel}`);
      // Loest diese Flaeche Rollen ueberhaupt auf?
      const loestRollenAuf = /terminology\.get\(/.test(src) ||
        /'[\w.]*\.(agency|company|worker)\.[\w.]*':/.test(src);
      if (loestRollenAuf) continue;
      const treffer = [];
      for (const [begriff, rolle] of begriffe) {
        // Nur als Woerterbuch-WERT suchen (nicht in Fliesstext/Kommentaren)
        const re = new RegExp("'[\\w.]+':\\s*'" + begriff.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "'");
        if (re.test(src)) treffer.push(`${begriff} (Sprache der Rolle ${rolle})`);
      }
      if (treffer.length && !BESTANDS_AUSNAHMEN[rel]) {
        verstoesse.push(`${rel}: ${treffer.join(", ")}`);
      }
    }
    assert.deepEqual(verstoesse, [],
      "Rollenbegriff eingefroren, ohne Laufzeit-Aufloesung und ohne dokumentierte Ausnahme");
  });

  it("die Ausnahmeliste bleibt ehrlich: jeder Eintrag zeigt auf eine echte Datei", () => {
    for (const rel of Object.keys(BESTANDS_AUSNAHMEN)) {
      assert.ok(fs.existsSync(path.join(ROOT, "frontend/public", rel)),
        `Ausnahme fuer nicht existierende Datei: ${rel}`);
      assert.ok(BESTANDS_AUSNAHMEN[rel].length > 30, `Ausnahme ohne echte Begruendung: ${rel}`);
    }
  });

  /* ── Dritte Seite: der Arbeiter ────────────────────────────────────────
     Warum der Arbeiter in der Terminologie nur drei Begriffe hat (und das
     RICHTIG ist): Unternehmen und Personaldienstleister teilen sich Flaechen,
     dort muss derselbe Ort je Rolle anders heissen. Der Arbeiter dagegen hat
     eine EIGENE Flaeche (Einsatzportal) — dort ist alles seine Sprache, eine
     Rollenverzweigung waere sinnlos. Seine Schutzregel ist deshalb eine
     andere: in SEINE Flaeche darf keine Firmen-/Handelssprache sickern, die
     ihn zum Objekt macht. */
  const ARBEITER_FLAECHEN = [
    "einsatzportal-dashboard.html", "einsatzportal-einsaetze.html", "einsatzportal-plan.html",
    "einsatzportal-stundenzettel.html", "einsatzportal-benachrichtigungen.html",
    "einsatzportal-kontakt.html", "einsatzportal-profil.html", "worker-login.html"
  ];

  it("Aufforderung und Knopf gehoeren derselben Rolle (Hub-Nudge)", () => {
    // Perspektiv-Audit 04.08.: Der Aktivierungs-Nudge forderte Unternehmen zu
    // "Personal anbieten" auf, waehrend applyMarketplaceCopy genau diesen Knopf
    // fuer sie ausblendet — die Karte verlangte etwas, wofuer sie den Weg
    // versteckt hatte. Titel/Text muessen derselben Rolle folgen wie die CTAs.
    const js = read("frontend/public/js/pages/enterpriseHub.js");
    for (const rolle of ["company", "agency"]) {
      for (const teil of ["title", "text"]) {
        assert.match(js, new RegExp(`'ent\\.nudge\\.${teil}\\.${rolle}':`),
          `rollenrichtige Nudge-Fassung fehlt: ${teil}/${rolle}`);
      }
    }
    assert.match(js, /setI18nText\(\$\("ce-nudge-title"\), "ent\.nudge\.title\." \+ orgType\)/,
      "Nudge-Titel wird nicht rollenrichtig gesetzt");
    assert.match(js, /setI18nText\(\$\("ce-nudge-text"\), "ent\.nudge\.text\." \+ orgType\)/,
      "Nudge-Text wird nicht rollenrichtig gesetzt");
    // Die company-Fassung darf die Handlung der Gegenseite nicht nennen
    const compTitle = js.match(/'ent\.nudge\.title\.company':\s*'([^']*)'/)[1];
    const compText = js.match(/'ent\.nudge\.text\.company':\s*'([^']*)'/)[1];
    for (const s of [compTitle, compText]) {
      assert.doesNotMatch(s, /Personal (anbieten|veroeffentlichen|einstellen)/,
        `Unternehmens-Fassung nennt eine Dienstleister-Handlung: "${s}"`);
    }
  });

  it("ein Gegenstand, ein englischer Begriff (Arbeitsplatzangebot)", () => {
    // Perspektiv-Audit: derselbe Gegenstand hiess auf Englisch viermal anders
    // (Job offers / Job opening / Placement offer / My postings). "Placement"
    // ist zudem der Agentur-Sicht vorbehalten (LABELS_EN: "Find placements").
    const dateien = [
      "js/pages/enterpriseHub.js", "js/pages/marketplaceFeed.js", "deal_management.html"
    ];
    const verstoesse = [];
    for (const rel of dateien) {
      const src = read(`frontend/public/${rel}`);
      for (const m of src.matchAll(/'[\w.]+':\s*'([^']*(Job offer|Job opening|Placement offer)[^']*)'/g)) {
        verstoesse.push(`${rel}: „${m[1]}"`);
      }
    }
    assert.deepEqual(verstoesse, [], "uneinheitlicher englischer Begriff — 'job posting' ist gesetzt");
  });

  it("Arbeiter-Flaechen bleiben frei von Firmen-/Handelssprache", () => {
    // Bewusst NICHT verboten: "Disponent" — er ist die Bezugsperson des
    // Arbeiters ("Ihr Disponent hat Ihnen den Einsatz zugewiesen"), also
    // seine eigene Perspektive, kein Firmenjargon.
    const VERBOTEN = [
      { wort: "Kapazität", warum: "handelt den Arbeiter als Ware" },
      { wort: "Kapazitaet", warum: "handelt den Arbeiter als Ware" },
      { wort: "Personal einstellen", warum: "Agentur-Aktion, nicht Arbeiter-Sicht" },
      { wort: "Bedarf anlegen", warum: "Unternehmens-Aktion" },
      { wort: "Ressource", warum: "entmenschlichend" },
      { wort: "Vermittlung steuern", warum: "Disponenten-Aktion" }
    ];
    const verstoesse = [];
    for (const rel of ARBEITER_FLAECHEN) {
      const src = read(`frontend/public/${rel}`);
      for (const v of VERBOTEN) {
        // Nur in sichtbaren Texten (Woerterbuch-Werte), nicht in Kommentaren/Code
        const re = new RegExp("'[\\w.]+':\\s*'[^']*" + v.wort + "[^']*'");
        const m = src.match(re);
        if (m) verstoesse.push(`${rel}: „${v.wort}" (${v.warum}) → ${m[0].slice(0, 70)}`);
      }
    }
    assert.deepEqual(verstoesse, [], "Firmensprache in der Arbeiter-Flaeche");
  });

  it("Arbeiter-Begriffe der Terminologie sind zweisprachig vollstaendig", () => {
    const js = read("frontend/public/js/terminologyLabels.js");
    const workerKeys = (block) => {
      const m = js.match(new RegExp("var " + block + " = \\{([\\s\\S]*?)\\n  \\};"));
      return new Set([...m[1].matchAll(/^\s{4}(\w+):\s*\{\s*worker:/gm)].map((x) => x[1]));
    };
    const de = workerKeys("LABELS");
    const en = workerKeys("LABELS_EN");
    assert.ok(de.size >= 3, "Arbeiter-Begriffe fehlen in der Terminologie");
    assert.deepEqual([...de].filter((k) => !en.has(k)), [], "Arbeiter-Begriff ohne englische Fassung");
  });

  it("Englisch verliert die Rollenunterscheidung nicht", () => {
    const js = read("frontend/public/js/terminologyLabels.js");
    const enBlock = js.match(/var LABELS_EN = \{([\s\S]*?)\n  \};/);
    assert.ok(enBlock, "LABELS_EN nicht gefunden");
    const deBlock = js.match(/var LABELS = \{([\s\S]*?)\n  \};/)[1];
    const parse = (block) => {
      const out = {};
      for (const line of block.split("\n")) {
        const m = line.match(/^\s{4}(\w+):\s*\{(.+)\},?\s*$/);
        if (!m) continue;
        const roles = {};
        for (const rm of m[2].matchAll(/(\w+):\s*(?:"([^"]*)"|null)/g)) roles[rm[1]] = rm[2] === undefined ? null : rm[2];
        out[m[1]] = roles;
      }
      return out;
    };
    const de = parse(deBlock);
    const en = parse(enBlock[1]);
    const eingeebnet = [];
    for (const key of Object.keys(de)) {
      const d = de[key], e = en[key];
      if (!e || !d.company || !d.agency) continue;
      // Deutsch unterscheidet -> Englisch muss auch unterscheiden
      if (d.company !== d.agency && e.company && e.agency && e.company === e.agency) {
        eingeebnet.push(key);
      }
    }
    assert.deepEqual(eingeebnet, [],
      "Englisch ebnet eine Rollenunterscheidung ein, die im Deutschen besteht");
  });
});

suite("Plattform — Terminologie ist eine Matrix aus Rolle UND Sprache", () => {
  /** Laedt terminologyLabels.js (optional mit i18n-Locale) in eine Sandbox. */
  function loadTerminology(locale) {
    const sandbox = {
      document: {
        documentElement: { setAttribute() {}, getAttribute: () => null },
        readyState: "complete", head: { appendChild() {} },
        getElementById: () => null, createElement: () => ({ setAttribute() {}, appendChild() {} }),
        addEventListener() {}, dispatchEvent() {}, querySelectorAll: () => []
      },
      navigator: { language: "de-DE", languages: ["de-DE"] },
      localStorage: { getItem: () => null, setItem() {} },
      CustomEvent: class {},
      window: {}
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    if (locale) sandbox.window.TCi18n = { locale: () => locale, t: () => "" };
    new vm.Script(read("frontend/public/js/terminologyLabels.js"), { filename: "terminologyLabels.js" }).runInContext(sandbox);
    return sandbox.window.TC.terminology;
  }

  it("beide Dimensionen bleiben erhalten: Rolle x Sprache", () => {
    const de = loadTerminology(null);
    const en = loadTerminology("en");
    // Rollen-Dimension (Bestand) — darf durch i18n NICHT eingeebnet werden
    assert.equal(de.get("marketplace", "company"), "Personal finden");
    assert.equal(de.get("marketplace", "agency"), "Arbeitsplatz finden");
    // Sprach-Dimension — je Rolle eine eigene Uebersetzung
    assert.equal(en.get("marketplace", "company"), "Find staff");
    assert.equal(en.get("marketplace", "agency"), "Find placements");
    assert.notEqual(en.get("marketplace", "company"), en.get("marketplace", "agency"),
      "Englisch darf die Rollenunterscheidung nicht verlieren");
  });

  it("'nicht anwendbar' (null) gilt auch auf Englisch", () => {
    const en = loadTerminology("en");
    assert.equal(en.get("createDemand", "agency"), null);
    assert.equal(en.get("capacityCreate", "company"), null);
  });

  it("fehlende EN-Uebersetzung faellt auf Deutsch zurueck, nie auf den Schluessel", () => {
    const en = loadTerminology("en");
    const v = en.get("marketplaceActivity", "company");
    assert.ok(v && v !== "marketplaceActivity");
  });

  it("jeder DE-Begriff hat eine EN-Entsprechung (Luecken werden sichtbar)", () => {
    const js = read("frontend/public/js/terminologyLabels.js");
    const block = (name) => {
      const m = js.match(new RegExp("var " + name + " = \\{([\\s\\S]*?)\\n  \\};"));
      assert.ok(m, name + " nicht gefunden");
      return new Set([...m[1].matchAll(/^\s{4}(\w+):/gm)].map((x) => x[1]));
    };
    const de = block("LABELS");
    const en = block("LABELS_EN");
    assert.deepEqual([...de].filter((k) => !en.has(k)), [], "Begriffe ohne englische Fassung");
    assert.deepEqual([...en].filter((k) => !de.has(k)), [], "EN-Begriffe ohne deutsche Quelle");
  });
});

suite("Plattform-Seiten — i18n-Schicht eingebunden", () => {
  it("jede Seite mit pageShell laedt auch i18n.js", () => {
    const dir = path.join(ROOT, "frontend/public");
    const missing = fs.readdirSync(dir)
      .filter((f) => f.endsWith(".html"))
      .filter((f) => fs.readFileSync(path.join(dir, f), "utf8").includes("js/pageShell.js"))
      .filter((f) => !fs.readFileSync(path.join(dir, f), "utf8").includes("js/i18n.js"));
    assert.deepEqual(missing, [], "Plattform-Seiten ohne i18n.js");
  });

  it("pageShell rendert Sprach-Umschalter + uebersetzt Nav und Rolle", () => {
    const js = read("frontend/public/js/pageShell.js");
    assert.match(js, /data-i18n-switcher/, "Umschalter fehlt in der Topbar");
    assert.match(js, /shellT\('shell\.nav\.' \+ item\.key, item\.label\)/);
    assert.match(js, /shellT\('shell\.role\.' \+ me\.role/);
    // Sprachwechsel muss die per innerHTML gebaute Nav nachziehen …
    assert.match(js, /addEventListener\("tc:langchange"/);
    // … und danach die Rollen-Terminologie erneut anwenden (sie darf gewinnen)
    assert.match(js, /if \(_lastOrgType\) updateNavLabels\(_lastOrgType\)/);
  });
});

suite("surfaceAccess — Sperr-Begruendungen zweisprachig", () => {
  // Diese Begruendungen ("warum ist die Flaeche gesperrt") erscheinen auf
  // vielen Seiten. Sie waren der Grund, warum auf englisch gestellten
  // Flaechen noch deutsche Saetze standen. Uebersetzt wird an der EINEN
  // Stelle, durch die jede Begruendung laeuft (softLocked/readOnly).
  function load(locale) {
    const sb = {
      window: {}, navigator: { language: "de", languages: ["de"] },
      localStorage: { getItem: () => null, setItem() {} },
      document: {
        documentElement: { setAttribute() {}, getAttribute: () => null },
        readyState: "complete", head: { appendChild() {} },
        getElementById: () => null, createElement: () => ({ setAttribute() {}, appendChild() {} }),
        addEventListener() {}, dispatchEvent() {}, querySelectorAll: () => []
      },
      CustomEvent: class {}, console
    };
    sb.window = sb;
    vm.createContext(sb);
    if (locale) new vm.Script(read(MARKER_REL), { filename: "i18n.js" }).runInContext(sb);
    if (locale === "en") sb.window.TCi18n.set("en");
    new vm.Script(read("frontend/public/js/surfaceAccess.js"), { filename: "surfaceAccess.js" }).runInContext(sb);
    return sb.window.TC.surfaceAccess;
  }
  const probe = (api) => api.resolve({ plan: "BASIS", org_type: "agency", org_role: "member" }, "rate_cards").reason || "";

  it("DE unveraendert, EN uebersetzt, ohne Schicht deutscher Fallback", () => {
    const de = probe(load("de")), en = probe(load("en")), ohne = probe(load(null));
    assert.match(de, /Preisrahmen/);
    assert.match(en, /Rate cards/);
    assert.doesNotMatch(en, /Preisrahmen/, "EN darf keinen deutschen Rest tragen");
    assert.equal(ohne, de, "ohne i18n-Schicht exakt das alte Verhalten");
  });

  it("jede deutsche Begruendung hat eine englische Fassung", () => {
    const js = read("frontend/public/js/surfaceAccess.js");
    const map = js.match(/var REASONS_EN = \{([\s\S]*?)\n  \};/);
    assert.ok(map, "REASONS_EN nicht gefunden");
    const paare = [...map[1].matchAll(/'([^']+)':\s*\n?\s*'([^']+)'/g)];
    assert.ok(paare.length >= 8, `zu wenige Begruendungen erfasst (${paare.length})`);
    for (const [, deText, enText] of paare) {
      assert.notEqual(deText, enText, `unuebersetzt: ${deText.slice(0, 40)}`);
    }
  });
});

suite("portalStatus — Status-Labels zweisprachig, DE bleibt Fallback", () => {
  /** Laedt i18n.js + portalStatus.js in EINE Sandbox (wie im Browser). */
  function loadStatusModule({ withI18n = true, locale = "de" } = {}) {
    const store = new Map();
    if (locale !== "de") store.set("tempconnect-lang", locale);
    const sandbox = {
      localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
      navigator: { language: "de-DE", languages: ["de-DE"] },
      CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
      document: {
        documentElement: { setAttribute() {}, getAttribute: () => null },
        readyState: "complete", head: { appendChild() {} },
        getElementById: () => null, createElement: () => ({ setAttribute() {}, appendChild() {} }),
        addEventListener() {}, dispatchEvent() {}, querySelectorAll: () => []
      },
      window: {}
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    if (withI18n) new vm.Script(read(MARKER_REL), { filename: "i18n.js" }).runInContext(sandbox);
    new vm.Script(read("frontend/public/js/workerPortal/portalStatus.js"), { filename: "portalStatus.js" }).runInContext(sandbox);
    return sandbox.window.PortalStatus;
  }

  it("DE unveraendert (Bestandsverhalten)", () => {
    const S = loadStatusModule({ locale: "de" });
    assert.equal(S.submissionLabel("needs_correction"), "Korrektur erforderlich");
    assert.equal(S.assignmentLabel("pending_confirmation"), "Bestätigung ausstehend");
    assert.equal(S.documentCategoryLabel("permit"), "Erlaubnis");
    assert.equal(S.notificationLabel("document_expiring"), "Nachweis läuft ab");
    assert.equal(S.documentBadgeLabel({ status: "verified" }), "Verifiziert");
    assert.equal(S.documentBadgeLabel({ status: "pending_review", is_expiring_soon: true }), "Fristkritisch");
  });

  it("EN uebersetzt alle fuenf Label-Familien inkl. Badge-HTML", () => {
    const S = loadStatusModule({ locale: "en" });
    assert.equal(S.submissionLabel("needs_correction"), "Correction required");
    assert.equal(S.assignmentLabel("pending_confirmation"), "Confirmation pending");
    assert.equal(S.documentLabel("expired"), "Expired");
    assert.equal(S.documentCategoryLabel("permit"), "Permit");
    assert.equal(S.notificationLabel("document_expiring"), "Document expiring");
    assert.match(S.submissionBadgeHtml("customer_confirmed"), /Confirmed by client/);
    assert.match(S.submissionBadgeHtml("customer_confirmed"), /ep-badge-accepted/, "Badge-Klasse bleibt");
    assert.equal(S.documentBadgeLabel({ status: "verified" }), "Verified");
  });

  it("ohne geladenes i18n.js: exakt das alte Verhalten (kein Absturz)", () => {
    const S = loadStatusModule({ withI18n: false });
    assert.equal(S.submissionLabel("draft"), "Entwurf");
    assert.equal(S.notificationLabel("general"), "Mitteilung");
    assert.equal(S.submissionLabel("voellig_unbekannt"), "voellig_unbekannt", "unbekannter Status bleibt roh");
  });

  it("jeder DE-Status hat eine EN-Entsprechung (keine stille Luecke)", () => {
    const de = loadStatusModule({ locale: "de" });
    const en = loadStatusModule({ locale: "en" });
    const families = [
      ["SUBMISSION_LABELS", "submissionLabel"], ["ASSIGNMENT_LABELS", "assignmentLabel"],
      ["DOCUMENT_LABELS", "documentLabel"], ["DOCUMENT_CATEGORY_LABELS", "documentCategoryLabel"],
      ["NOTIFICATION_LABELS", "notificationLabel"]
    ];
    const missing = [];
    for (const [mapName, fn] of families) {
      for (const key of Object.keys(de[mapName])) {
        if (en[fn](key) === de[fn](key)) missing.push(`${mapName}.${key}`);
      }
    }
    assert.deepEqual(missing, [], "Status ohne echte EN-Uebersetzung");
  });
});

suite("Einsatzportal-Seiten — Woerterbuch-Werte sind echte Texte", () => {
  // Gelernt am 04.08.: eine Literal-Ersetzung ueber die ganze Datei trifft AUCH
  // den DE-Wert im Woerterbuch und macht daraus 'key': TCi18n.t('key') — ein
  // Selbstverweis, der still einen leeren Text liefert. Die Suite haette das
  // ueber Syntax/Paritaet NICHT gesehen: beides bleibt gueltig.
  for (const slug of ["worker-login", ...PORTAL_PAGES.map((s) => `einsatzportal-${s}`)]) {
    it(`${slug}: kein Woerterbuch-Eintrag verweist auf sich selbst`, () => {
      const html = read(`frontend/public/${slug}.html`);
      const selfRefs = [...html.matchAll(/'([\w.]+)':\s*TCi18n\.t\(/g)].map((m) => m[1]);
      assert.deepEqual(selfRefs, [], "Woerterbuch-Werte muessen Texte sein, keine t()-Aufrufe");
    });
  }
});

suite("Einsatzportal-Seiten — Inline-Scripts parsen (Woerterbuch-Syntax)", () => {
  // Der teuerste Fehler dieser Migration waere ein nicht escaptes Apostroph im
  // Woerterbuch: das reisst das GANZE Seiten-Script mit und die Seite ist tot.
  // vm.Script parst ohne auszufuehren — genau die richtige Pruefung.
  for (const slug of PORTAL_PAGES) {
    it(`einsatzportal-${slug}: jedes Inline-Script ist syntaktisch gueltig`, () => {
      const scripts = inlineScripts(read(`frontend/public/einsatzportal-${slug}.html`));
      assert.ok(scripts.length > 0, "kein Inline-Script gefunden");
      scripts.forEach((code, i) => {
        assert.doesNotThrow(
          () => new vm.Script(code, { filename: `${slug}-inline-${i}.js` }),
          `Syntaxfehler in Inline-Script #${i} von einsatzportal-${slug}.html`
        );
      });
    });
  }
});

suite("Einsatzportal-Seiten — zweisprachig mit Schluessel-Paritaet", () => {
  const shell = AVAILABLE ? read("frontend/public/js/workerPortal/portalShell.js") : "";
  const shellKeys = AVAILABLE ? extractDictKeys(shell, "de", 10) : new Set();

  for (const slug of PORTAL_PAGES) {
    it(`einsatzportal-${slug}: i18n.js + Switcher + DE/EN-Paritaet + bekannte Marker`, () => {
      const html = read(`frontend/public/einsatzportal-${slug}.html`);
      assert.match(html, /<script src="\/public\/js\/i18n\.js"><\/script>/, "i18n.js fehlt im head");
      assert.match(html, /data-i18n-switcher/, "Sprach-Umschalter fehlt");
      const de = extractDictKeys(html, "de", 3);
      const en = extractDictKeys(html, "en", 3);
      assert.deepEqual([...de].filter((k) => !en.has(k)), [], "Keys ohne EN-Uebersetzung");
      assert.deepEqual([...en].filter((k) => !de.has(k)), [], "EN-Keys ohne DE-Quelle");
      const used = [...html.matchAll(/data-i18n(?:-ph|-title)?="([\w.]+)"/g)].map((m) => m[1]);
      assert.ok(used.length >= 8, "zu wenige data-i18n-Marker (" + used.length + ")");
      const unknown = used.filter((k) => !de.has(k) && !shellKeys.has(k));
      assert.deepEqual(unknown, [], "Markup referenziert unbekannte Keys");
    });
  }
});
