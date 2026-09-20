/**
 * WER TC.api AUFRUFT, MUSS api.js VORHER LADEN (gefunden 2026-09-17)
 *
 * Der Owner meldete: bei Unternehmen verlangt die Kachel "Stundenzettel"
 * immer eine Anmeldung — obwohl man angemeldet ist.
 *
 * Gemessen an der laufenden Seite: `typeof TC.api` war "undefined". `TC.api`
 * wird ausschliesslich in `js/api.js` definiert, und drei Seiten haben diese
 * Datei nie geladen: `timesheets.html`, `company-timesheets.html`,
 * `company-live-workforce.html` — ausgerechnet die Kernseiten der
 * Unternehmen. Ihr `init()` rief `TC.api.get('/me')`, bekam einen TypeError,
 * und der `catch` machte daraus pauschal "Anmeldung erforderlich".
 *
 * Kein Rueckschritt: die Seiten haben api.js laut Git-Geschichte NIE geladen.
 * Unbemerkt blieb es, weil die Fehlermeldung eine andere Ursache behauptete —
 * wer "Anmeldung erforderlich" liest, meldet sich an und sucht nicht weiter.
 *
 * Dieser Waechter ist ENTDECKEND: er kennt die drei Seiten nicht, sondern
 * prueft jede. Die naechste Seite, die dasselbe tut, faellt von selbst auf.
 *
 * Run: node --test test/apiClientGeladen.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* Wie in erreichbarkeit.test.js: aufwaerts suchen UND auf Inhalt pruefen —
 * ein leeres Mount-Verzeichnis darf die Pruefung nicht lautlos gruen machen. */
function findeWurzel() {
  for (const start of [process.cwd(), __dirname]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      if (fs.existsSync(path.join(dir, "frontend/public/js/api.js"))
        && fs.existsSync(path.join(dir, "frontend/public/js/pageShell.js"))) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel();
const vorhanden = ROOT !== null;
const PUB = vorhanden ? path.join(ROOT, "frontend/public") : null;

/** Ein echter Aufruf — nicht die abgesicherte Pruefung `TC.api && typeof TC.api.x`. */
const AUFRUF = /TC\.api\.(get|post|put|patch|delete|upload)\s*\(/;

/**
 * Prueft EINE Seite. Reine Funktion, damit der Selbsttest sie mit erfundenem
 * Markup fuettern kann.
 *
 * Gezaehlt werden Inline-Skripte und SEITENskripte (`/js/pages/`). Gemeinsame
 * Skripte wie pageShell.js pruefen `TC.api` selbst ab, bevor sie es benutzen.
 *
 * @returns {{ nutzer: string|null, apiVorher: boolean }}
 */
function pruefeSeite(html, lesePublic) {
  const skripte = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  let apiGesehen = false;
  for (const [, attr, rumpf] of skripte) {
    const src = (/\bsrc="([^"]+)"/i.exec(attr) || [])[1] || null;
    if (src && /\/js\/api\.js(\?|$)/.test(src)) { apiGesehen = true; continue; }
    let inhalt = rumpf;
    if (src) inhalt = src.includes("/js/pages/") ? lesePublic(src) : "";
    if (AUFRUF.test(inhalt)) return { nutzer: src || "inline", apiVorher: apiGesehen };
  }
  return { nutzer: null, apiVorher: apiGesehen };
}

function lesePublic(src) {
  const rel = src.replace(/^\/public\//, "").split("?")[0];
  const datei = path.join(PUB, rel);
  return fs.existsSync(datei) ? fs.readFileSync(datei, "utf8") : "";
}

describe("TC.api — jede Seite, die es aufruft, laedt api.js vorher",
  { skip: !vorhanden && "Repo-Wurzel nicht gefunden" }, () => {

  it("keine Seite ruft TC.api auf, ohne api.js vorher zu laden", () => {
    const seiten = fs.readdirSync(PUB).filter((f) => f.endsWith(".html"));
    const nutzer = [];
    const verstoesse = [];
    for (const seite of seiten) {
      const erg = pruefeSeite(fs.readFileSync(path.join(PUB, seite), "utf8"), lesePublic);
      if (!erg.nutzer) continue;
      nutzer.push(seite);
      if (!erg.apiVorher) verstoesse.push(`${seite} (${erg.nutzer})`);
    }

    /* Die Probe prueft zuerst ihren Gegenstand: findet sie keine einzige Seite,
     * die TC.api benutzt, ist ein "keine Verstoesse" wertlos. Die drei Seiten
     * des Befunds MUESSEN als Nutzer erkannt werden. */
    for (const bekannt of ["timesheets.html", "company-timesheets.html", "company-live-workforce.html"]) {
      assert.ok(nutzer.includes(bekannt), `${bekannt} wurde nicht als TC.api-Nutzer erkannt — die Probe sieht nichts`);
    }

    assert.deepEqual(verstoesse, [],
      "Diese Seiten rufen TC.api auf, laden aber /public/js/api.js nicht davor.\n"
      + "  Folge: TypeError im init(), und der catch zeigt 'Anmeldung erforderlich'.\n  "
      + verstoesse.join("\n  "));
  });

  it("Selbsttest: fehlend und zu spaet sind Verstoesse, abgesicherte Pruefung nicht", () => {
    const leser = (inhalt) => () => inhalt;
    const nutzt = "TC.api.get('/me')";

    const fehlt = pruefeSeite('<script src="/public/js/pages/x.js"></script>', leser(nutzt));
    assert.equal(fehlt.nutzer, "/public/js/pages/x.js");
    assert.equal(fehlt.apiVorher, false, "fehlendes api.js nicht erkannt");

    const zuSpaet = pruefeSeite(
      '<script src="/public/js/pages/x.js"></script><script src="/public/js/api.js"></script>', leser(nutzt));
    assert.equal(zuSpaet.apiVorher, false, "api.js NACH dem Seitenskript faelschlich als rechtzeitig gewertet");

    const richtig = pruefeSeite(
      '<script src="/public/js/api.js"></script><script src="/public/js/pages/x.js"></script>', leser(nutzt));
    assert.equal(richtig.apiVorher, true);

    const inline = pruefeSeite(`<script>${nutzt}</script>`, leser(""));
    assert.equal(inline.nutzer, "inline", "Inline-Skript nicht geprueft");

    const abgesichert = pruefeSeite('<script src="/public/js/pages/x.js"></script>',
      leser("if (window.TC && TC.api && typeof TC.api.getActiveLocationId === 'function') {}"));
    assert.equal(abgesichert.nutzer, null, "abgesicherte Pruefung faelschlich als Aufruf gewertet");
  });
});

/*
 * DIE WEITERLEITUNG DER ALTEN SEITE — AUSGEFUEHRT, NICHT GELESEN
 *
 * timesheets.html gehoert zum alten Stundenzettel-Modell. Ein Unternehmen, das
 * dort landet (Kachel, Benachrichtigung, Aktivitaet, Lesezeichen), wird in
 * seinen Eingang company-timesheets.html weitergeleitet. Geprueft wird das
 * Verhalten des echten Skripts in einer Sandbox — eine Suche nach dem Wort
 * "company-timesheets" im Quelltext waere schon bei einem Kommentar gruen.
 */
describe("Stundenzettel — ein Unternehmen landet in seinem Eingang",
  { skip: !vorhanden && "Repo-Wurzel nicht gefunden" }, () => {

  /** Alles, was das Skript nebenbei anfasst, ohne dass es fuer die Probe zaehlt. */
  function nachgiebig() {
    const ziel = function () {};
    const p = new Proxy(ziel, {
      get: (_t, k) => (k === "then" ? undefined : k === Symbol.toPrimitive ? () => "" : p),
      set: () => true,
      apply: () => p,
      construct: () => p,
    });
    return p;
  }

  async function fuehreAus(orgType) {
    const quelle = fs.readFileSync(path.join(PUB, "js/pages/timesheets.js"), "utf8");
    const weiterleitungen = [];
    let planGeladen = false;
    const tc = {
      api: { get: async (p) => (p === "/me" ? { org_type: orgType, plan: "PRO" } : { items: [], total: 0 }) },
    };
    const sandbox = {
      document: nachgiebig(),
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      location: {
        pathname: "/public/timesheets.html", search: "?status=submitted", hash: "#woche",
        href: "http://x/public/timesheets.html?status=submitted#woche",
        replace: (url) => weiterleitungen.push(url),
      },
      PlanFeatures: { load: async () => { planGeladen = true; }, hasFeature: () => true },
      TC: new Proxy(tc, { get: (t, k) => (k in t ? t[k] : nachgiebig()) }),
      TCDate: nachgiebig(),
      /* Globale Helfer, die das Skript beim Laden anfasst (i18n-Woerterbuecher). */
      TCi18n: nachgiebig(),
      TCToast: nachgiebig(),
      URLSearchParams, console: { log() {}, warn() {}, error() {} },
      setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
      fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
      navigator: { language: "de-DE" },
    };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    vm.createContext(sandbox);
    try { vm.runInContext(quelle, sandbox, { filename: "timesheets.js" }); } catch { /* Randfolgen der Attrappe */ }
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    return { weiterleitungen, planGeladen };
  }

  it("Unternehmen → company-timesheets.html, mit Filter und Sprungziel", async () => {
    const { weiterleitungen, planGeladen } = await fuehreAus("company");
    assert.deepEqual(weiterleitungen, ["/public/company-timesheets.html?status=submitted#woche"]);
    assert.equal(planGeladen, false, "nach der Weiterleitung lief die alte Seite weiter");
  });

  it("Zeitarbeitsfirma bleibt — und die Seite laeuft wirklich weiter", async () => {
    const { weiterleitungen, planGeladen } = await fuehreAus("agency");
    /* Gegenstand zuerst: ohne planGeladen waere "keine Weiterleitung" auch
     * dann gruen, wenn init() gar nicht bis hierher kaeme. */
    assert.equal(planGeladen, true, "init() erreichte die Planpruefung nicht — die Probe misst nichts");
    assert.deepEqual(weiterleitungen, []);
  });
});
