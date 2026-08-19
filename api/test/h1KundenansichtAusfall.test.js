/**
 * Welle H1 — der Kunde sieht, DASS eine gebuchte Kraft ausfaellt. Nie WARUM.
 *
 * DAS GATE DIESER WELLE, WOERTLICH:
 *   "Die Kundenansicht zeigt, dass eine gebuchte Kraft ausfaellt — und bis wann
 *    voraussichtlich. NIE die Art. Der Deep-Link fuehrt zur betroffenen Zeile."
 *
 * WARUM DIESE DATEI NEBEN g4bKundenBenachrichtigung.test.js STEHT
 * Jene Datei schuetzt den BENACHRICHTIGUNGS-Weg (die Zeile in `notifications`).
 * Diese hier schuetzt die ANSICHT — den zweiten Weg, auf dem dieselben Daten
 * beim Kunden ankommen. Es ist derselbe Schutz an einer anderen Tuer, und die
 * zweite Tuer stand bis zu dieser Welle offen: `getCompanyLiveWorkforce` gab
 * die rohen Datenbankzeilen heraus. Solange niemand die SELECT-Liste anfasste,
 * fiel das nicht auf.
 *
 * DREI ENTSCHEIDUNGEN ZUR BAUFORM, TEUER GELERNT:
 *  1. GEPRUEFT WIRD DAS ERGEBNIS, NICHT DIE SCHREIBWEISE. Ein Test, der im
 *     Quelltext nach "kein abw.art" sucht, ueberlebt jede Umgehung ueber ein
 *     Zwischenfeld — und schlaegt ausgerechnet auf dem Kommentar an, der die
 *     Regel erklaert. Hier laeuft der echte Route-Handler, und geprueft wird
 *     `JSON.stringify(res._json)`.
 *  2. POSITIVLISTE STATT WORTLISTE. Eine Wortliste faengt "krank". Sie faengt
 *     nicht das Feld, das jemand naechstes Jahr ergaenzt. Deshalb muss die
 *     Schluesselmenge der Zeile eine TEILMENGE von ERLAUBT sein — was neu
 *     hinzukommt, wird hier rot, bevor es beim Kunden ankommt.
 *  3. DIE OBERFLAECHE WIRD WIRKLICH AUSGEFUEHRT. Der gefaehrlichste Teil war
 *     nicht ein fehlender Zustand, sondern ein LUEGENDER: `liveBadge()` war ein
 *     binaeres Ternaer, in dem jeder unbekannte Zustand als gruenes "Im Einsatz"
 *     landete. Wer nur das Backend erweitert haette, haette die Lage
 *     verschlechtert. Der Renderer wird deshalb in einer vm-Sandbox ueber den
 *     OEFFENTLICHEN Weg (`ctLoadLive`) gefahren, nicht ueber Interna.
 *
 * Run: node --test --test-force-exit test/h1KundenansichtAusfall.test.js
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { createCompanyTimesheetsRouter } from "../routes/companyTimesheets.js";
import { getCompanyLiveWorkforce } from "../services/workforceService.js";
import { fuerKunde, kundenDeepLink } from "../services/workerAbsenceService.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));

/** Die Angaben, die den Kunden NICHTS angehen — in jeder Schreibweise.
 *  Dieselbe Liste wie in g4bKundenBenachrichtigung.test.js: es ist dieselbe
 *  Zusage, nur an der zweiten Tuer. */
const VERRAETERISCH = ["krank", "urlaub", "grippe", "fieber", "hausarzt", "krankschreibung", "bandscheibe", "attest"];

/** Was eine Zeile der Kundenansicht tragen DARF. Alles andere ist rot. */
const ERLAUBT = new Set([
  "link_id", "assignment_id", "worker_user_id",
  "first_name", "last_name", "personnel_number",
  "role", "start_date", "effective_end_date",
  "shift_start", "shift_end",
  "agency_name", "supplier_org_id", "worker_description",
  "lifecycle_state", "endet_bald", "live_status", "ausfall_bis"
]);

/* ═══════════════════════════════════════════════════════════════════════════
 *  Teil A — was der Server herausgibt
 * ═══════════════════════════════════════════════════════════════════════════ */

function aufzeichnenderPool(...antworten) {
  let i = 0;
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql: String(sql), params });
      return antworten[i++] ?? { rows: [], rowCount: 0 };
    }
  };
}
const mockLogger = () => ({ info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} });
const baseDeps = (pool) => ({
  pool,
  requireAuth: (_r, _s, next) => next(),
  requireFeature: () => (_r, _s, next) => next(),
  logger: mockLogger()
});

function mockRes() {
  const res = {
    _status: 200, _json: null, locals: {},
    status(c) { res._status = c; return res; },
    json(d) { res._json = d; return res; }
  };
  return res;
}

function letzterHandler(router, method, fragment) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    const m = Object.keys(layer.route.methods)[0];
    if (m === method && layer.route.path.includes(fragment)) {
      const stack = layer.route.stack;
      return stack[stack.length - 1].handle;
    }
  }
  throw new Error(`Route ${method} ${fragment} nicht gefunden`);
}

/**
 * Eine Zeile, wie sie eine NAIV erweiterte Abfrage liefern wuerde: mit allen
 * Feldern der Agenturtafel. Genau das ist der realistische Fehler — jemand
 * kopiert den Join von `getWorkerLiveBoard` herueber und merkt nicht, dass
 * `abw.art` dort erlaubt ist und hier nicht.
 */
function vergifteteZeile(extra = {}) {
  return {
    link_id: "l1", assignment_id: "a-1", worker_user_id: "w1",
    first_name: "Anna", last_name: "Bauer", personnel_number: "4711",
    role: "Staplerfahrerin", start_date: "2026-08-01", effective_end_date: "2026-09-30",
    shift_start: "06:00:00", shift_end: "14:30:00",
    agency_name: "Muster Zeitarbeit", supplier_org_id: "sup-1",
    worker_description: "Lager", lifecycle_state: "active", endet_bald: false,
    // ── ab hier: was ein naiver Join mitschleppen wuerde ──
    abw_id: "abw-1", abw_von: "2026-08-18", abw_bis: "2026-08-25",
    abw_zustand: "wirksam", abw_aufgehoben_am: null,
    absence_art: "krank", absence_notiz: "Grippe, Hausarzt bis Freitag",
    art: "krank", notiz: "Attest liegt vor",
    beschreibung: "Seit gestern Fieber, war beim Hausarzt, Krankschreibung liegt vor.",
    diagnose_code: "J11.1",
    ...extra
  };
}

async function rufeRoute(zeilen) {
  const pool = aufzeichnenderPool({ rows: zeilen, rowCount: zeilen.length });
  const router = createCompanyTimesheetsRouter(baseDeps(pool));
  const handler = letzterHandler(router, "get", "/company/live-workforce");
  const res = mockRes();
  await handler({ orgId: "company-org-1", query: {}, session: { userId: "u1" } }, res, (e) => { throw e; });
  return { res, pool };
}

describe("H1 · Teil A — was die Kundenansicht herausgibt", () => {
  it("kein Feld der Antwort verraet die Art der Abwesenheit", async () => {
    const { res } = await rufeRoute([vergifteteZeile()]);
    const alles = JSON.stringify(res._json).toLowerCase();
    for (const wort of VERRAETERISCH) {
      assert.ok(!alles.includes(wort),
        `"${wort}" ist in die Kundenansicht gerutscht — das ist ein Gesundheits- bzw. ` +
        "Beschaeftigtendatum, und das Einsatzunternehmen ist ein Dritter (Art. 9 DSGVO)");
    }
    assert.ok(!alles.includes("j11.1"), "ein spaeter ergaenztes Feld ist mitgefahren");
  });

  it("die Zeile traegt AUSSCHLIESSLICH erlaubte Schluessel", async () => {
    const { res } = await rufeRoute([vergifteteZeile()]);
    const zeile = res._json.workers[0];
    const unerlaubt = Object.keys(zeile).filter((k) => !ERLAUBT.has(k));
    assert.deepEqual(unerlaubt, [],
      "neue Felder erreichen den Kunden nur, wenn sie hier bewusst eingetragen werden");
    /* Gegenprobe: die Positivliste ist nicht deshalb erfuellt, weil die Zeile
     * leer ist. Ohne diese Zeile waere ein kaputter Handler von einem
     * sauberen nicht zu unterscheiden. */
    assert.ok(Object.keys(zeile).length >= 15, "die Zeile ist unerwartet duenn — hier stimmt etwas nicht");
  });

  it("eine wirksame Abwesenheit wird zu 'faellt_aus' samt voraussichtlichem Ende", async () => {
    const { res } = await rufeRoute([vergifteteZeile()]);
    const zeile = res._json.workers[0];
    assert.equal(zeile.live_status, "faellt_aus");
    assert.equal(zeile.ausfall_bis, "2026-08-25", "der Kunde erfaehrt, bis wann er planen muss");
    assert.equal(res._json.kpis.faellt_aus, 1);
    assert.equal(res._json.kpis.im_einsatz, 0, "wer ausfaellt, steht nicht in 'im Einsatz'");
  });

  it("ein offenes Ende wird als NULL ausgewiesen, nicht geraten", async () => {
    const { res } = await rufeRoute([vergifteteZeile({ abw_bis: null })]);
    assert.equal(res._json.workers[0].live_status, "faellt_aus");
    assert.equal(res._json.workers[0].ausfall_bis, null);
  });

  it("eine erst BEANTRAGTE Selbstmeldung erreicht den Kunden nicht", async () => {
    /* Der Mock-Pool umgeht die WHERE-Bedingung absichtlich: nur so laesst sich
     * beweisen, dass die zweite Schranke — fuerKunde() im Dienst — wirklich
     * traegt und nicht bloss die Abfrage. Genau diese Grenze steht in G1:
     * eine beantragte Meldung ist eine Entscheidung, die beim Arbeitgeber
     * noch aussteht. */
    const { res } = await rufeRoute([vergifteteZeile({ abw_zustand: "beantragt" })]);
    const zeile = res._json.workers[0];
    assert.equal(zeile.live_status, "im_einsatz", "eine unentschiedene Meldung ist kein Ausfall");
    assert.equal(zeile.ausfall_bis, null);
    assert.equal(res._json.kpis.faellt_aus, 0);
  });

  it("eine zurueckgenommene Meldung ebenfalls nicht", async () => {
    const { res } = await rufeRoute([vergifteteZeile({ abw_aufgehoben_am: "2026-08-19T08:00:00.000Z" })]);
    assert.equal(res._json.workers[0].live_status, "im_einsatz");
    assert.equal(res._json.kpis.faellt_aus, 0);
  });

  it("der Ausfall schlaegt das nahende Ende — ohne es zu verschweigen", async () => {
    const { res } = await rufeRoute([vergifteteZeile({ endet_bald: true })]);
    const zeile = res._json.workers[0];
    assert.equal(zeile.live_status, "faellt_aus", "der Ausfall ist die dringendere Auskunft");
    assert.equal(zeile.endet_bald, true, "das nahende Ende bleibt als eigenes Feld erhalten");
    assert.equal(res._json.kpis.endet_bald, 1, "und wird weiter gezaehlt");
  });

  it("die Zeile traegt die Einsatz-Kennung, an der der Deep-Link landet", async () => {
    const { res } = await rufeRoute([vergifteteZeile()]);
    assert.equal(res._json.workers[0].assignment_id, "a-1");
    /* Und der Link, der dorthin fuehrt, zeigt auf dieselbe Kennung. Ohne diese
     * Verbindung fuehrte die Meldung aus G4b auf eine Uebersicht. */
    assert.ok(kundenDeepLink("a-1").includes("einsatz=a-1"));
  });

  it("die Kennzahlen gehen auf: im Einsatz + Ausfall = gebuchte Belegschaft", async () => {
    const { res } = await rufeRoute([
      vergifteteZeile(),
      vergifteteZeile({ link_id: "l2", assignment_id: "a-2", abw_id: null, abw_zustand: null, supplier_org_id: "sup-2" }),
      vergifteteZeile({ link_id: "l3", assignment_id: "a-3", abw_id: null, abw_zustand: null, endet_bald: true })
    ]);
    const k = res._json.kpis;
    assert.equal(k.total, 3);
    assert.equal(k.faellt_aus, 1);
    assert.equal(k.im_einsatz, 2);
    assert.equal(k.im_einsatz + k.faellt_aus, k.total, "sonst zeigt eine Kachel eine Zahl, die es nicht gibt");
    assert.equal(k.endet_bald, 1, "'endet bald' ist eine Ueberlagerung, kein eigener Zustand");
    assert.equal(k.agencies, 2);
  });

  it("der Zero-State kennt den neuen Zaehler ebenfalls", async () => {
    const board = await getCompanyLiveWorkforce({ query: async () => ({ rows: [] }) }, null);
    assert.equal(board.available, false);
    assert.equal(board.kpis.faellt_aus, 0, "eine fehlende Kennzahl rendert als 'undefined' in der Kachel");
  });

  it("fuerKunde() ist die einzige Definition von 'faellt aus' — und wird hier benutzt", () => {
    /* Reine Funktion, mit echten Werten gefuettert (statt im Quelltext gesucht). */
    assert.equal(fuerKunde({ id: "x", von: "2026-08-18", bis: null, zustand: "wirksam", aufgehoben_am: null }).faellt_aus, true);
    assert.equal(fuerKunde({ id: "x", von: "2026-08-18", bis: null, zustand: "beantragt", aufgehoben_am: null }).faellt_aus, false);
    assert.equal(fuerKunde(null), null);
    assert.deepEqual(Object.keys(fuerKunde({ id: "x", art: "krank", notiz: "n", beschreibung: "b" })).sort(),
      ["bis", "faellt_aus", "id", "von"], "die Positivliste selbst darf nicht wachsen");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 *  Teil B — die Abfrage selbst
 *  Ergaenzung, NICHT Ersatz fuer Teil A: sie faengt den Fall, in dem jemand
 *  den Filter lockert, ohne die Projektion anzufassen. Positiv formuliert —
 *  gesucht wird, WAS dastehen muss, nicht was nicht dastehen darf.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("H1 · Teil B — die Abfrage bindet die Mandantengrenze", () => {
  let sql;
  before(async () => {
    const { pool } = await rufeRoute([]);
    sql = pool.calls[0].sql;
    assert.ok(sql.length > 500, "Gegenprobe: es wurde ueberhaupt eine Abfrage aufgezeichnet");
  });

  it("die Kaeufer-Bindung von P2.3 bleibt unberuehrt", () => {
    assert.match(sql, /wal\.org_id = \$1/);
  });

  it("der Name der Kraft haengt NICHT an der Firma des Profils", () => {
    /* Bewusst so — eine korrigierte Annahme, kein Versehen. Die Vorabrecherche
     * zu H1 hielt worker_profiles(user_id) fuer mehrdeutig (gelesen wurde der
     * INDEX in Mig 029:57-58) und schlug vor, den Profil-Join zusaetzlich
     * org-zu-binden. Die Spalte traegt aber seit Mig 029:35 ein inline UNIQUE;
     * gegen die laufende Datenbank belegt, existiert
     * 'worker_profiles_user_id_key'. Der Join kann also nichts verdoppeln.
     * Die Bedingung anzuhaengen haette genau einen Effekt gehabt: weicht die
     * Firma des Profils einmal von der der Verknuepfung ab (Wechsel der
     * Zeitarbeitsfirma bei noch laufendem Alt-Einsatz), fiele der NAME der
     * Kraft aus der Kundenliste. Die Mandantengrenze gehoert an die
     * Abwesenheit — und dort steht sie (naechster Test). */
    assert.match(sql, /LEFT JOIN worker_profiles wp ON wp\.user_id = wal\.worker_user_id\s*\n/,
      "der Profil-Join bleibt einzeilig und unbeschraenkt");
  });

  it("die Abwesenheit ist org-gebunden, wirksam und nicht zurueckgenommen", () => {
    for (const bedingung of [
      /ab\.supplier_org_id\s*=\s*wal\.supplier_org_id/,
      /ab\.zustand\s*=\s*'wirksam'/,
      /ab\.aufgehoben_am IS NULL/,
      /ab\.von <= CURRENT_DATE/
    ]) {
      assert.match(sql, bedingung);
    }
  });

  it("die Abwesenheits-Abfrage laedt GENAU fuenf Spalten — Zeitraum und Zustand", () => {
    /* Positiv formuliert (und nicht als Verbot), weil ein Verbot auf dem
     * erklaerenden Kommentar daneben anschlaegt: der SQL-Text enthaelt ihn.
     * Geprueft wird deshalb die Spaltenliste selbst. */
    const treffer = sql.match(/SELECT (ab\.[^\n]*)\n\s*FROM worker_absences ab/);
    assert.ok(treffer, "die Abwesenheits-Abfrage wurde nicht gefunden");
    const spalten = treffer[1].split(",").map((s) => s.trim());
    assert.deepEqual(spalten, ["ab.id", "ab.von", "ab.bis", "ab.zustand", "ab.aufgehoben_am"],
      "was nicht geladen wird, kann auch nicht durchrutschen — diese Liste waechst nicht");
  });

  it("die Einsatz-Kennung wird mitgeladen", () => {
    assert.match(sql, /a\.id AS assignment_id/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 *  Teil C — die Oberflaeche, wirklich ausgefuehrt
 * ═══════════════════════════════════════════════════════════════════════════ */

/* Aufwaerts suchen UND auf Inhalt pruefen: Docker legt Mount-Ziele als leere
 * Verzeichnisse an, und ein leeres Verzeichnis macht jede Pruefung lautlos
 * gruen. Diese Falle ist in dieser Codebasis mehrfach zugeschnappt. */
function findeWurzel() {
  for (const start of [HIER, process.cwd()]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      const kandidat = path.join(dir, "frontend/public/js/pages/companyTimesheets.js");
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

suite("H1 · Teil C — die Kundenansicht rendert den Ausfall", () => {
  let js, html;

  /** Baut eine frische Sandbox und laesst das Modul (inkl. init()) laufen. */
  async function sandbox({ search = "", hash = "", antworten = {} } = {}) {
    const elemente = {};
    const woerter = { de: {}, en: {} };
    const timer = { intervalle: [], zeitgeber: [] };

    function elem(id) {
      const e = {
        id, innerHTML: "", textContent: "", value: "", style: {},
        _classes: new Set(),
        classList: {
          add: (c) => e._classes.add(c),
          remove: (c) => e._classes.delete(c),
          toggle: (c, an) => (an ? e._classes.add(c) : e._classes.delete(c)),
          contains: (c) => e._classes.has(c)
        },
        addEventListener: () => {},
        appendChild: () => {},
        scrollIntoView: () => { e._gescrollt = true; },
        _gescrollt: false
      };
      return e;
    }
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

    const gerufen = [];
    const TC = {
      api: {
        get: async (pfad) => {
          gerufen.push(pfad);
          for (const [muster, antwort] of Object.entries(antworten)) {
            if (pfad.indexOf(muster) === 0) return antwort;
          }
          return {};
        },
        post: async () => ({}),
        delete: async () => ({})
      }
    };

    const ctx = {
      TC, TCi18n, console,
      document: {
        readyState: "complete",
        addEventListener: () => {},
        /* Auto-anlegen: die Seite spricht viele Kennungen an, und eine
         * fehlende wuerde als TypeError durchschlagen statt als Befund. */
        getElementById: (id) => hole(id),
        querySelectorAll: () => [],
        /* Nur so viel, wie fokussiereEinsatz() braucht: die Zeile im
         * gerenderten Markup suchen. Damit ist der Fokus ein VERHALTENS-
         * nachweis und keine Behauptung ueber den Quelltext. */
        querySelector: (sel) => {
          const m = /\[data-einsatz="([^"]*)"\]/.exec(sel);
          if (!m) return null;
          return elemente.lwBody.innerHTML.includes('data-einsatz="' + m[1] + '"')
            ? (elemente["__zeile_" + m[1]] = elemente["__zeile_" + m[1]] || elem("zeile"))
            : null;
        },
        createElement: () => elem("tmp")
      },
      window: { location: { search, hash, href: "/public/company-timesheets.html" } },
      localStorage: { getItem: () => null, setItem: () => {} },
      navigator: { language: "de-DE", languages: ["de-DE"] },
      URLSearchParams, Date, Math, JSON, encodeURIComponent, decodeURIComponent, Intl, String, Boolean, Number, Object, Array, RegExp, Error, Promise,
      /* Zeitgeber werden AUFGEZEICHNET statt geplant: ein laufender
       * 30-Sekunden-Takt haelt den Testprozess offen, und der Takt selbst ist
       * das, was geprueft werden soll. */
      setInterval: (fn, ms) => { timer.intervalle.push({ fn, ms }); return timer.intervalle.length; },
      clearInterval: (id) => { if (id) timer.intervalle[id - 1] = null; },
      setTimeout: (fn, ms) => { timer.zeitgeber.push({ fn, ms }); return timer.zeitgeber.length; },
      clearTimeout: () => {},
      alert: () => {}, confirm: () => true
    };
    ctx.window.TC = TC;
    ctx.window.TCi18n = TCi18n;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(js, ctx, { filename: "companyTimesheets.js" });

    // init() laeuft asynchron an — ein paar Runden geben ihm Zeit.
    for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r));

    return { ctx, elemente, woerter, timer, gerufen, hole };
  }

  const ZEILE = {
    link_id: "l1", assignment_id: "a-1", worker_user_id: "w1",
    first_name: "Anna", last_name: "Bauer", personnel_number: "4711",
    role: "Staplerfahrerin", start_date: "2026-08-01", effective_end_date: "2026-09-30",
    shift_start: "06:00:00", shift_end: "14:30:00",
    agency_name: "Muster Zeitarbeit", supplier_org_id: "sup-1",
    worker_description: "Lager", lifecycle_state: "active",
    endet_bald: false, live_status: "im_einsatz", ausfall_bis: null
  };
  const antwort = (workers, kpis = {}) => ({
    "/company/live-workforce": {
      available: true, workers,
      kpis: { total: workers.length, im_einsatz: workers.length, endet_bald: 0, faellt_aus: 0, agencies: 1, ...kpis }
    },
    "/me": { id: "u1" },
    "/company/submissions": { items: [] }
  });

  before(() => {
    js = fs.readFileSync(path.join(ROOT, "frontend/public/js/pages/companyTimesheets.js"), "utf8");
    html = fs.readFileSync(path.join(ROOT, "frontend/public/company-timesheets.html"), "utf8");
    // Gegenprobe: gelesen wurde wirklich etwas, und zwar diese Seite.
    assert.ok(js.length > 5000 && html.length > 5000, "Datei leer oder Mount-Attrappe");
  });

  /* ── Die Woerterbuecher ────────────────────────────────────────────────── */

  it("jeder neue Schluessel steht in DE UND EN", async () => {
    const { woerter } = await sandbox();
    const neu = Object.keys(woerter.de).filter((k) => k.indexOf("cts.live.out.") === 0 || k === "cts.live.badge.out" || k === "cts.live.badge.unknown" || k === "cts.live.kpi.out");
    assert.ok(neu.length >= 6, `erwartet: die Schluessel der Welle H1, gefunden: ${neu.length}`);
    assert.deepEqual(neu.filter((k) => !woerter.en[k]), [], "diese Schluessel fehlen im englischen Woerterbuch");
  });

  it("JEDER Schluessel steht in beiden Sprachen — nicht nur die neuen", async () => {
    /* Die staerkere Fassung der Zusage: eine Liste der "neuen" Schluessel
     * altert, weil niemand sie pflegt. Das ganze Woerterbuch zu pruefen faengt
     * auch den Schluessel, den die naechste Welle vergisst. */
    const { woerter } = await sandbox();
    assert.ok(Object.keys(woerter.de).length > 80, "Gegenprobe: das Woerterbuch wurde geladen");
    assert.deepEqual(Object.keys(woerter.de).filter((k) => !(k in woerter.en)), [],
      "diese Schluessel fehlen im englischen Woerterbuch — die englische Oberflaeche faellt dort stumm auf Deutsch zurueck");
    assert.deepEqual(Object.keys(woerter.en).filter((k) => !(k in woerter.de)), [],
      "diese Schluessel gibt es nur auf Englisch");
  });

  it("kein Wort der Oberflaeche nennt die Art der Abwesenheit", async () => {
    const { woerter } = await sandbox();
    const alles = JSON.stringify(woerter).toLowerCase();
    for (const wort of ["krank", "grippe", "urlaub", "attest"]) {
      assert.ok(!alles.includes(wort),
        `"${wort}" steht im Woerterbuch der Kundenseite — schon der Text darf die Art nicht andeuten`);
    }
  });

  /* ── Der Zustand in der Zeile ─────────────────────────────────────────── */

  async function rendere(workers, kpis) {
    const s = await sandbox({ hash: "#live", antworten: antwort(workers, kpis) });
    return { markup: s.elemente.lwBody.innerHTML, ...s };
  }

  it("eine ausgefallene Kraft wird NIE als 'Im Einsatz' gezeigt", async () => {
    const { markup } = await rendere([{ ...ZEILE, live_status: "faellt_aus", ausfall_bis: "2026-08-25" }]);
    assert.ok(markup.length > 100, "Gegenprobe: es wurde ueberhaupt gerendert");
    assert.ok(!markup.includes("ct-badge--live"), "der gruene Zustand darf hier nicht entstehen");
    assert.ok(!markup.includes("Im Einsatz"), "und auch sein Text nicht");
    assert.ok(markup.includes("ct-badge--out") && markup.includes("Fällt aus"), "der Ausfall wird benannt");
  });

  it("der Ausfall nennt das voraussichtliche Ende — in DACH-Schreibweise", async () => {
    const { markup } = await rendere([{ ...ZEILE, live_status: "faellt_aus", ausfall_bis: "2026-08-25" }]);
    assert.ok(markup.includes("vsl. bis 25.08.2026"), "der Kunde muss wissen, bis wann er planen muss");
  });

  it("ein offenes Ende wird ausgesprochen, nicht verschwiegen", async () => {
    const { markup } = await rendere([{ ...ZEILE, live_status: "faellt_aus", ausfall_bis: null }]);
    assert.ok(markup.includes("Rückkehr noch offen"));
  });

  it("die Spalte 'Bis' zeigt weiter das Ende des EINSATZES, nicht das der Abwesenheit", async () => {
    const { markup } = await rendere([{ ...ZEILE, live_status: "faellt_aus", ausfall_bis: "2026-08-25" }]);
    const zellen = markup.split("<td");
    const bisZelle = zellen[6] || "";
    assert.ok(bisZelle.includes("30.09.2026"), "die Spalte Bis gehoert dem Einsatz");
    assert.ok(!bisZelle.includes("25.08.2026"), "das Abwesenheitsende darf sie nicht ueberschreiben — sonst plant der Kunde falsch");
  });

  it("das nahende Einsatzende geht neben dem Ausfall nicht verloren", async () => {
    const { markup } = await rendere([{ ...ZEILE, live_status: "faellt_aus", ausfall_bis: "2026-08-25", endet_bald: true }]);
    assert.ok(markup.includes("Einsatz endet ohnehin bald"));
  });

  it("ein UNBEKANNTER Zustand faellt nicht auf gruen zurueck", async () => {
    /* Der eigentliche Befund dieser Welle: vorher landete jeder unbekannte
     * Wert im gruenen "Im Einsatz". Er haette also nicht gefehlt, sondern das
     * Gegenteil behauptet. */
    const { markup } = await rendere([{ ...ZEILE, live_status: "montage" }]);
    assert.ok(!markup.includes("ct-badge--live"), "ein unbekannter Zustand ist kein gruener");
    assert.ok(!markup.includes("Im Einsatz"));
    assert.ok(markup.includes("Zustand unbekannt"), "und wird als unbekannt ausgewiesen");
  });

  it("die bekannten Zustaende rendern weiterhin korrekt", async () => {
    const a = await rendere([{ ...ZEILE, live_status: "im_einsatz" }]);
    assert.ok(a.markup.includes("ct-badge--live") && a.markup.includes("Im Einsatz"));
    const b = await rendere([{ ...ZEILE, live_status: "endet_bald" }]);
    assert.ok(b.markup.includes("ct-badge--soon") && b.markup.includes("Endet bald"));
  });

  /* ── Die Spalte "Rolle" ───────────────────────────────────────────────── */

  it("die Spalte 'Rolle' zeigt die TAETIGKEIT, nie den technischen Besetzungswert", async () => {
    /* `wal.role` ist ein geschlossener CHECK auf 'primary'|'backup' (Mig 029)
     * — eine Besetzungsart, keine Taetigkeit. Sie stand unuebersetzt in der
     * Kundenspalte "Rolle", und zwar in jeder Zeile: die Spalte ist NOT NULL
     * mit Vorgabe 'primary'. */
    const { markup } = await rendere([{ ...ZEILE, role: "primary", worker_description: "Kommissionierung" }]);
    assert.ok(markup.includes("Kommissionierung"), "die Taetigkeit gehoert in die Spalte");
    assert.ok(!markup.includes("primary"), "der technische Wert darf den Kunden nie erreichen");
  });

  it("ein ERSATZ wird als solcher benannt — das ist echte Auskunft", async () => {
    const { markup } = await rendere([{ ...ZEILE, role: "backup", worker_description: "Kommissionierung" }]);
    assert.ok(markup.includes("Kommissionierung"));
    assert.ok(markup.includes("Springer"), "der Kunde soll sehen, dass hier jemand vertritt");
    assert.ok(!markup.includes("backup"), "aber nicht im Rohwert");
  });

  it("ohne Taetigkeitsangabe steht ein Strich, kein Ersatzwort", async () => {
    const { markup } = await rendere([{ ...ZEILE, role: "primary", worker_description: null }]);
    assert.ok(!markup.includes("primary"));
    const zellen = markup.split("<td");
    assert.ok((zellen[3] || "").includes("–"), "leere Angabe bleibt leer statt sich etwas auszudenken");
  });

  /* ── Die Kacheln ──────────────────────────────────────────────────────── */

  it("die vierte Kachel zaehlt die Ausfaelle — und die erste zaehlt sie NICHT mit", async () => {
    const { elemente } = await rendere(
      [{ ...ZEILE, live_status: "faellt_aus" }, { ...ZEILE, link_id: "l2", assignment_id: "a-2" }],
      { total: 2, im_einsatz: 1, faellt_aus: 1, endet_bald: 0, agencies: 1 }
    );
    assert.equal(String(elemente.lwOut.textContent), "1", "die Ausfall-Kachel");
    assert.equal(String(elemente.lwTotal.textContent), "1",
      "'Aktuell im Einsatz' darf eine ausgefallene Kraft nicht mitzaehlen — sonst ist die Kachel eine Luege");
  });

  it("die Seite bringt die vierte Kachel und die dritte Abzeichen-Klasse mit", () => {
    assert.ok(html.includes('id="lwOut"'), "die Kachel, die updateLiveKPIs beschreibt, muss es geben");
    assert.ok(html.includes("cts.live.kpi.out"), "mit uebersetzbarer Beschriftung");
    assert.ok(/\.ct-badge--out\s*\{/.test(html), "die dritte Abzeichen-Klasse fehlt — der Zustand waere unsichtbar");
  });

  /* ── Der Deep-Link aus der Ausfallmeldung ─────────────────────────────── */

  it("jede Zeile traegt die Einsatz-Kennung als Anker", async () => {
    const { markup } = await rendere([ZEILE]);
    assert.ok(markup.includes('data-einsatz="a-1"'));
  });

  it("?einsatz= oeffnet den Live-Reiter — nicht die Stundenzettel-Liste", async () => {
    const { elemente, gerufen } = await sandbox({
      search: "?einsatz=a-1", hash: "#live",
      antworten: antwort([{ ...ZEILE, live_status: "faellt_aus", ausfall_bis: "2026-08-25" }], { faellt_aus: 1, im_einsatz: 0 })
    });
    assert.ok(elemente.tabLive._classes.has("ct-tab--active"), "der Live-Reiter ist aktiv");
    assert.equal(elemente.viewLive.style.display, "", "die Live-Ansicht ist sichtbar");
    assert.equal(elemente.viewTimesheets.style.display, "none");
    assert.ok(gerufen.includes("/company/live-workforce"), "und ihre Daten wurden geholt");
  });

  it("der Deep-Link fuehrt zur ZEILE, nicht nur in ihre Naehe", async () => {
    const { elemente } = await sandbox({
      search: "?einsatz=a-1", hash: "#live",
      antworten: antwort([{ ...ZEILE, live_status: "faellt_aus" }, { ...ZEILE, link_id: "l2", assignment_id: "a-2" }], { faellt_aus: 1, im_einsatz: 1, total: 2 })
    });
    const ziel = elemente.__zeile_a1 || elemente["__zeile_a-1"];
    assert.ok(ziel, "die gesuchte Zeile wurde nicht angesteuert");
    assert.ok(ziel._gescrollt, "sie wurde nicht in den Blick geholt");
    assert.ok(String(ziel.style.outline).includes("solid"), "sie wurde nicht hervorgehoben");
  });

  it("ohne Adressangabe bleibt der Startzustand die Stundenzettel-Liste", async () => {
    const { gerufen } = await sandbox({ antworten: antwort([ZEILE]) });
    assert.ok(gerufen.includes("/company/submissions"), "der Standardreiter laedt weiterhin");
    assert.ok(!gerufen.includes("/company/live-workforce"),
      "ohne Deep-Link wird die Live-Tafel nicht geholt — der Reiter laedt sie beim Oeffnen");
  });

  /* ── Der Takt ─────────────────────────────────────────────────────────── */

  it("die Live-Tafel erneuert sich von selbst, solange ihr Reiter offen ist", async () => {
    const { ctx, timer } = await sandbox({ hash: "#live", antworten: antwort([ZEILE]) });
    const laufend = timer.intervalle.filter(Boolean);
    assert.equal(laufend.length, 1, "genau ein Takt — nicht keiner und nicht zwei");
    assert.equal(laufend[0].ms, 30000, "derselbe Takt wie auf der Agenturtafel");

    /* Ueber window, weil das Modul eine IIFE ist: nur was es dort ablegt,
       ist von aussen bedienbar — genau wie im Browser. */
    ctx.window.ctView("timesheets");
    assert.deepEqual(timer.intervalle.filter(Boolean), [],
      "wer den Reiter verlaesst, soll nicht weiter abfragen — sonst laeuft die Seite unbemerkt im Hintergrund");
  });
});
