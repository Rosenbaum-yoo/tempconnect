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
