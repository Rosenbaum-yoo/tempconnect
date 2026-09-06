/**
 * Der Notdienst-Leitstand (N7.4, 2026-09-05).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS HIER BEWACHT WIRD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `api/routes/emergency.js` traegt elf fertige, auditierte Endpunkte. Gemessen
 * am 2026-09-05 riefen die Oberflaechen davon ZWEI auf — beide `:id/commitments`,
 * einmal lesend, einmal schreibend. Die uebrigen neun waren gebaut, getestet und
 * unerreichbar.
 *
 * Beim Verdrahten fielen zwei Dinge auf, die vorher niemand sehen konnte, weil
 * sie niemand benutzt hat:
 *
 *   1. EINE ESKALATION OHNE EIGENTUEMER. `POST /emergency/:id/escalate` prueft
 *      weder Rolle noch Eigentum — in der Route nicht und im Dienst nicht.
 *      `escalateEmergency` nimmt `actorId` entgegen, protokolliert sie und
 *      vergleicht sie nie mit `requester_company_id`. Jeder Angemeldete mit
 *      `emergency_staffing` im Tarif konnte jede fremde Notlage dreimal
 *      hochstufen; jede Stufe loest einen E-Mail-Rundruf an bis zu 50 Anbieter
 *      aus. Diese Datei haelt die Luecke geschlossen.
 *
 *   2. DAS DUERFEN LAG IM BROWSER. Um einen Knopf "Zusage zuruecknehmen" zu
 *      zeigen, haette die Oberflaeche selbst vergleichen muessen, ob sie die
 *      zusagende Agentur ist. Die Hausregel verbietet das ("Berechtigungs-
 *      entscheidung kommt immer aus dem Backend; Frontend zeigt nur an"), und
 *      zwar aus einem praktischen Grund: eine Ableitung im Browser ist eine
 *      zweite Wahrheit, die von der ersten abweichen kann, ohne dass es jemand
 *      merkt. `GET /:id/commitments` liefert das Duerfen jetzt mit.
 *
 * Run: node --test --test-force-exit test/notdienstLeitstand.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEmergencyRouter } from "../routes/emergency.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HIER, "..");

/* ── Vorrichtung ─────────────────────────────────────────────────────── */

const requireAuth = (_req, _res, next) => next();
const requireFeature = () => (_req, _res, next) => next();
const stillerLog = { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };

function anfrage(overrides = {}) {
  return { session: { userId: "u1" }, params: {}, body: {}, query: {}, headers: {}, ip: "127.0.0.1", get: () => "", ...overrides };
}

function antwort() {
  return {
    _status: 200, _json: null, locals: {},
    status(c) { this._status = c; return this; },
    json(b) { this._json = b; return this; },
    send() { return this; }, set() { return this; }, type() { return this; }, end() { return this; }
  };
}

/**
 * Zugang, der jede Abfrage protokolliert und Zeilen nach Teilzeichenkette
 * ausliefert. BEGIN/COMMIT/ROLLBACK werden verschluckt.
 */
function zugang(regeln = []) {
  const calls = [];
  const TX = new Set(["BEGIN", "COMMIT", "ROLLBACK"]);
  const lauf = async (sql, params = []) => {
    if (typeof sql === "string" && TX.has(sql.trim().toUpperCase())) return { rows: [], rowCount: 0 };
    calls.push({ sql, params });
    for (const [nadel, wert] of regeln) {
      if (typeof sql === "string" && sql.includes(nadel)) {
        const rows = typeof wert === "function" ? wert(sql, params) : wert;
        return { rows, rowCount: rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return { calls, query: lauf, connect: async () => ({ query: lauf, release() {} }) };
}

function deps(pool, role = "company") {
  return { pool, requireAuth, requireFeature, logger: stillerLog, getUserAndPlan: async (id) => ({ id, role, plan: "PRO", org_id: id }) };
}

function handler(router, method, pfad) {
  for (const layer of router.stack) {
    if (!layer.route || layer.route.path !== pfad || !layer.route.methods[method]) continue;
    return layer.route.stack[layer.route.stack.length - 1].handle;
  }
  throw new Error(`Route ${method.toUpperCase()} ${pfad} nicht gefunden`);
}

function notlage(overrides = {}) {
  return {
    id: "demand-1", requester_company_id: "company-1", urgency: "notdienst", status: "open",
    required_total_count: 5, currently_committed_count: 1, remaining_open_count: 4,
    title: "Nachtschicht", role: "Pflegekraft", location_city: "Muenster", escalation_level: 0,
    ...overrides
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   1. Die Eskalation gehoert dem, der die Notlage gemeldet hat
   ═══════════════════════════════════════════════════════════════════════ */

describe("N7.4 · Eskalation nur im eigenen Vorgang", () => {

  it("EIN FREMDER ESKALIERT NICHT — und erreicht den Dienst gar nicht erst", async () => {
    /*
     * Der Kern des Befunds. Vor dieser Welle antwortete diese Route einem
     * beliebigen Angemeldeten mit 200 und stufte eine fremde Notlage hoch.
     *
     * Geprueft wird BEIDES: die Antwort (403) UND dass kein Schreibzugriff
     * stattgefunden hat. Nur die Antwort zu pruefen waere die Sorte
     * Stellvertreter-Pruefung, die eine spaetere Umstellung durchlaesst, bei
     * der zuerst geschrieben und danach abgelehnt wird.
     */
    const pool = zugang([["FROM demand_requests", () => [notlage()]]]);
    const router = createEmergencyRouter(deps(pool));
    const res = antwort();
    await handler(router, "post", "/emergency/:id/escalate")(
      anfrage({ params: { id: "demand-1" }, session: { userId: "fremder-99" } }), res
    );
    assert.strictEqual(res._status, 403, "eine fremde Notlage liess sich hochstufen");
    assert.strictEqual(res._json.error, "FORBIDDEN");

    const geschrieben = pool.calls.filter((c) => /UPDATE demand_requests/i.test(c.sql));
    assert.strictEqual(geschrieben.length, 0,
      "es wurde trotz Ablehnung in die fremde Notlage geschrieben");
    assert.strictEqual(res.locals.audit, undefined,
      "ein abgelehnter Versuch hinterliess einen Erfolgs-Auditeintrag");
  });

  it("der Melder selbst darf — und die Stufe steigt wirklich", async () => {
    const pool = zugang([
      ["FROM demand_requests", () => [notlage({ requester_company_id: "company-1" })]]
    ]);
    const router = createEmergencyRouter(deps(pool));
    const res = antwort();
    await handler(router, "post", "/emergency/:id/escalate")(
      anfrage({ params: { id: "demand-1" }, session: { userId: "company-1" } }), res
    );
    assert.strictEqual(res._status, 200, `abgelehnt statt zugelassen: ${JSON.stringify(res._json)}`);
    assert.strictEqual(res._json.new_level, 1);

    const upd = pool.calls.find((c) => /UPDATE demand_requests SET escalation_level/i.test(c.sql));
    assert.ok(upd, "die Stufe wurde nie geschrieben");
    assert.deepStrictEqual(upd.params, [1, "demand-1"]);
    assert.strictEqual(res.locals.audit.action, "emergency.escalate");
    assert.strictEqual(res.locals.audit.entity_id, "demand-1");
  });

  it("die Kollegin aus derselben Organisation darf ebenfalls", async () => {
    /*
     * Ohne diese Probe waere die Reparatur eine Verschlechterung: bei Urlaub
     * oder Krankheit haette niemand sonst die Notlage hochstufen koennen.
     * `canAccessAsOwner` deckt den Fall ab — hier wird nachgewiesen, dass die
     * Route ihn wirklich benutzt und nicht auf Gleichheit der Kennungen prueft.
     */
    const pool = zugang([
      ["FROM demand_requests", () => [notlage({ requester_company_id: "company-1" })]],
      ["FROM org_memberships", () => [{ "?column?": 1 }]]
    ]);
    const router = createEmergencyRouter(deps(pool));
    const res = antwort();
    await handler(router, "post", "/emergency/:id/escalate")(
      anfrage({ params: { id: "demand-1" }, session: { userId: "kollegin-7" } }), res
    );
    assert.strictEqual(res._status, 200,
      "eine Kollegin derselben Organisation wurde ausgesperrt — die Pruefung vergleicht nur Kennungen");
  });

  it("eine unbekannte Notlage bleibt 404, nicht 403", async () => {
    const pool = zugang([["FROM demand_requests", () => []]]);
    const router = createEmergencyRouter(deps(pool));
    const res = antwort();
    await handler(router, "post", "/emergency/:id/escalate")(
      anfrage({ params: { id: "gibt-es-nicht" } }), res
    );
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("die Pruefung steht VOR dem Dienst, nicht daneben", () => {
    /*
     * Eine Formprobe gegen die Reihenfolge im Quelltext. Sie faengt die
     * Umstellung, bei der jemand die Pruefung spaeter hinter den Dienstaufruf
     * schiebt: dann laeuft der Rundruf, und die Ablehnung kommt zu spaet.
     */
    const quelle = fs.readFileSync(path.join(API, "routes", "emergency.js"), "utf8");
    const block = quelle.slice(quelle.indexOf('router.post("/emergency/:id/escalate"'));
    const bisDienst = block.indexOf("escalateEmergency(");
    const beiPruefung = block.indexOf("canAccessAsOwner(");
    assert.ok(beiPruefung > -1, "die Eigentumspruefung ist aus der Eskalation verschwunden");
    assert.ok(beiPruefung < bisDienst,
      "die Eigentumspruefung steht hinter dem Dienstaufruf — der Rundruf laeuft dann trotzdem");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. Das Duerfen kommt aus dem Backend
   ═══════════════════════════════════════════════════════════════════════ */

function zusage(overrides = {}) {
  return {
    id: "c-1", demand_request_id: "demand-1", supplier_company_id: "agentur-1",
    supplier_company_name: "Agentur Nord", committed_quantity: 3, status: "committed",
    committed_at: "2026-09-01T08:00:00.000Z", note: null, ...overrides
  };
}

async function zusagenFuer(userId, role, zusagen, notlageOverrides = {}) {
  const pool = zugang([
    ["FROM demand_requests dr", () => [notlage(notlageOverrides)]],
    ["FROM matches m", () => []],
    ["FROM emergency_provider_commitments c", () => zusagen],
    ["FROM org_memberships", () => []]
  ]);
  const res = antwort();
  await handler(createEmergencyRouter(deps(pool, role)), "get", "/emergency/:id/commitments")(
    anfrage({ params: { id: "demand-1" }, session: { userId } }), res
  );
  return res;
}

describe("N7.4 · wer darf was — entschieden im Backend", () => {

  it("das anfragende Unternehmen darf ablehnen, aber nicht zuruecknehmen", async () => {
    const res = await zusagenFuer("company-1", "company", [zusage()]);
    assert.strictEqual(res._status, 200, JSON.stringify(res._json));
    const d = res._json.commitments[0].darf;
    assert.deepStrictEqual(d, { zuruecknehmen: false, ablehnen: true, vereinbarung: true },
      "die Rechte des Anfragenden stimmen nicht");
    assert.strictEqual(res._json.viewer.is_requester, true);
  });

  it("die zusagende Agentur darf zuruecknehmen, aber nicht ablehnen", async () => {
    /*
     * Das ist der Punkt, um den es in dieser Welle geht: bis heute gab es
     * KEINEN Weg, eine Teilzusage zurueckzunehmen. Eine Agentur, die drei
     * Leute zugesagt hat und sie verliert, konnte das nirgends sagen — das
     * Unternehmen rechnete weiter mit drei.
     */
    const pool = zugang([
      ["FROM demand_requests dr", () => [notlage()]],
      ["FROM matches m", () => [{ "?column?": 1 }]],
      ["FROM emergency_provider_commitments c", () => [zusage({ supplier_company_id: "agentur-1" })]]
    ]);
    const res = antwort();
    await handler(createEmergencyRouter(deps(pool, "agency")), "get", "/emergency/:id/commitments")(
      anfrage({ params: { id: "demand-1" }, session: { userId: "agentur-1" } }), res
    );
    assert.strictEqual(res._status, 200, JSON.stringify(res._json));
    assert.deepStrictEqual(res._json.commitments[0].darf,
      { zuruecknehmen: true, ablehnen: false, vereinbarung: true });
    assert.strictEqual(res._json.viewer.is_matched_agency, true);
  });

  it("EINE FREMDE ZUSAGE nimmt niemand zurueck", async () => {
    /* Zwei Agenturen an derselben Notlage: die zweite darf die Zusage der
       ersten sehen (sie ist zugeordnet), aber nicht anfassen. */
    const pool = zugang([
      ["FROM demand_requests dr", () => [notlage()]],
      ["FROM matches m", () => [{ "?column?": 1 }]],
      ["FROM emergency_provider_commitments c", () => [zusage({ supplier_company_id: "agentur-1" })]],
      ["FROM org_memberships", () => []]
    ]);
    const res = antwort();
    await handler(createEmergencyRouter(deps(pool, "agency")), "get", "/emergency/:id/commitments")(
      anfrage({ params: { id: "demand-1" }, session: { userId: "agentur-2" } }), res
    );
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.commitments[0].darf.zuruecknehmen, false,
      "eine fremde Zusage liess sich zuruecknehmen");
    assert.strictEqual(res._json.commitments[0].darf.vereinbarung, false,
      "aus einer fremden Zusage liess sich eine bindende Vereinbarung machen");
  });

  it("eine bereits beendete Zusage traegt keinen einzigen Knopf", async () => {
    /*
     * Beide Dienste weisen eine nicht mehr offene Zusage ab
     * (INVALID_TRANSITION bzw. COMMITMENT_NOT_ACTIVE). Ein Knopf, der
     * verlaesslich einen Fehler erzeugt, ist schlimmer als kein Knopf.
     */
    for (const status of ["withdrawn", "rejected", "expired", "fulfilled"]) {
      const res = await zusagenFuer("company-1", "company", [zusage({ status })]);
      assert.deepStrictEqual(res._json.commitments[0].darf,
        { zuruecknehmen: false, ablehnen: false, vereinbarung: false },
        `Status ${status} zeigte noch Handlungsmoeglichkeiten`);
    }
  });

  it("die Zaehlwerte der Notlage bleiben unveraendert in der Antwort", async () => {
    /* Die Ergaenzung darf nichts wegnehmen — der bestehende Aufrufer in
       marketplace_demand_detail.html liest genau diese vier Felder. */
    const res = await zusagenFuer("company-1", "company", [zusage()]);
    assert.strictEqual(res._json.demand_id, "demand-1");
    assert.strictEqual(res._json.required_total_count, 5);
    assert.strictEqual(res._json.currently_committed_count, 1);
    assert.strictEqual(res._json.remaining_open_count, 4);
    assert.strictEqual(res._json.commitments[0].committed_quantity, 3,
      "die urspruenglichen Felder der Zusage fehlen nach dem Anreichern");
  });

  it("dieselbe Agentur wird EINMAL geprueft, nicht je Zusage", async () => {
    /*
     * Eine Agentur kann mehrfach zusagen - etwa als Nachschlag, wenn sich
     * Kapazitaet ergeben hat. `canAccessAsOwner` schlaegt fuer eine Kollegin in
     * der Datenbank nach; je Zusage zu fragen holt dieselbe Antwort mehrfach.
     *
     * Die Menge waechst mit den zugeordneten Agenturen und nicht mit der
     * Plattform, ist also klein. Trotzdem: dieselbe Frage zweimal zu stellen ist
     * auch bei kleiner Menge falsch, und ohne diese Probe faellt der Rueckbau
     * niemandem auf.
     */
    const pool = zugang([
      ["FROM demand_requests dr", () => [notlage()]],
      ["FROM matches m", () => [{ "?column?": 1 }]],
      ["FROM emergency_provider_commitments c", () => [
        zusage({ id: "c-1", supplier_company_id: "agentur-9" }),
        zusage({ id: "c-2", supplier_company_id: "agentur-9" }),
        zusage({ id: "c-3", supplier_company_id: "agentur-9" })
      ]],
      ["FROM org_memberships", () => []]
    ]);
    const res = antwort();
    await handler(createEmergencyRouter(deps(pool, "agency")), "get", "/emergency/:id/commitments")(
      anfrage({ params: { id: "demand-1" }, session: { userId: "agentur-fremd" } }), res
    );
    assert.strictEqual(res._status, 200);
    /* NUR die Nachfragen ZUR AGENTUR zaehlen. Die Route schlaegt ausserdem
       einmal nach, ob der Abrufende der Anfragende ist - das ist eine andere
       Frage und gehoert nicht in diese Zahl. Eine Probe, die beide zusammen
       zaehlt, misst nicht, was sie behauptet. */
    const nachfragen = pool.calls.filter(
      (c) => /FROM org_memberships/i.test(c.sql) && c.params[0] === "agentur-9");
    assert.strictEqual(nachfragen.length, 1,
      `dieselbe Agentur wurde ${nachfragen.length}-mal nachgeschlagen statt einmal`);
    assert.deepStrictEqual(
      res._json.commitments.map((c) => c.darf.zuruecknehmen), [false, false, false],
      "das Ergebnis der einen Nachfrage wurde nicht auf alle Zusagen angewandt");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. Die Oberflaeche ist wirklich verdrahtet — nicht nur vorhanden
   ═══════════════════════════════════════════════════════════════════════ */

const OEFFENTLICH = path.resolve(API, "..", "frontend", "public");
const LEITSTAND_HTML = path.join(OEFFENTLICH, "notdienst_leitstand.html");
const LEITSTAND_JS = path.join(OEFFENTLICH, "js", "pages", "notdienstLeitstand.js");
const DETAIL_HTML = path.join(OEFFENTLICH, "marketplace_demand_detail.html");

/*
 * Pfadaufloesung ueber import.meta.url, nie ueber process.cwd(): sonst
 * verschwindet dieser ganze Abschnitt lautlos, je nachdem aus welchem
 * Verzeichnis der Lauf startet — und die "gruene" Suite prueft weniger, als
 * sie behauptet.
 */
const oberflaecheDa = fs.existsSync(LEITSTAND_HTML) && fs.existsSync(LEITSTAND_JS) && fs.existsSync(DETAIL_HTML);

describe("N7.4 · die Oberflaeche ist verdrahtet", { skip: oberflaecheDa ? false : "frontend/public nicht im Abbild" }, () => {

  const html = oberflaecheDa ? fs.readFileSync(LEITSTAND_HTML, "utf8") : "";
  const js = oberflaecheDa ? fs.readFileSync(LEITSTAND_JS, "utf8") : "";
  const detail = oberflaecheDa ? fs.readFileSync(DETAIL_HTML, "utf8") : "";

  it("die Seite laedt ihr eigenes Skript — und die Datumshilfe davor", () => {
    assert.match(html, /<script src="\/public\/js\/pages\/notdienstLeitstand\.js">/,
      "die Seite bindet ihr Skript nicht ein — sie waere ein Geruest ohne Inhalt");

    /* Reihenfolge, nicht nur Anwesenheit: `dateDE.js` legt `window.TCDate` an.
       Kommt es spaeter, ist es beim ersten Zeichnen noch nicht da, und der
       Verlauf zeigt "2026-08-30" statt "30.08.2026". Ein Fehler, den man einmal
       sieht und danach nie wieder sucht. */
    const datum = html.indexOf('/public/js/dateDE.js');
    const seite = html.indexOf('/public/js/pages/notdienstLeitstand.js');
    assert.ok(datum > -1, "die Datumshilfe wird nicht geladen — Daten erscheinen roh");
    assert.ok(datum < seite,
      "die Datumshilfe wird NACH dem Seitenskript geladen — beim ersten Zeichnen fehlt sie");
  });

  it("JEDE Kennung, in die das Skript schreibt, gibt es im Markup", () => {
    /*
     * Der haeufigste stille Fehler dieser Bauart: das Skript zeichnet
     * gewissenhaft in ein Element, das die Seite nie hatte. Kein Fehler in der
     * Konsole, kein Absturz — nur eine Kachel, die "–" bleibt.
     *
     * Geprueft werden beide Schreibweisen: `el("x")` und
     * `document.getElementById("x")`.
     */
    const kennungen = new Set();
    for (const m of js.matchAll(/\bel\("([a-z0-9-]+)"\)/gi)) kennungen.add(m[1]);
    for (const m of js.matchAll(/getElementById\("([a-z0-9-]+)"\)/gi)) kennungen.add(m[1]);
    /* Die Kachelwerte werden ueber eine Liste gesetzt (`{ id: "kpi-offen" }`),
       nicht ueber einen Aufruf mit festem Text. Genau diese acht laufen beim
       naechsten Umbau am ehesten auseinander — ohne sie prueft der Auszug die
       Haelfte und meldet trotzdem gruen. Aufgefallen, weil die Untergrenze
       unten angeschlagen hat. */
    for (const m of js.matchAll(/\bid:\s*"([a-z0-9-]+)"/gi)) kennungen.add(m[1]);
    assert.ok(kennungen.size >= 12,
      `zu wenige Kennungen gefunden (${kennungen.size}) — der Auszug greift nicht mehr`);

    const fehlend = [...kennungen].filter((k) => !new RegExp(`id="${k}"`).test(html));
    assert.deepEqual(fehlend, [],
      "das Skript zeichnet in Elemente, die es im Markup nicht gibt: " + fehlend.join(", "));
  });

  it("alle vier Endpunkte werden wirklich gerufen", () => {
    for (const [pfad, was] of [
      ['hole("/dashboard")', "die Kennzahlen"],
      ['hole("/active")', "die offenen Notlagen"],
      ['hole("/history', "der Verlauf"],
      ["/escalate", "die Eskalation"]
    ]) {
      assert.ok(js.includes(pfad), `${was} wird nie abgerufen (${pfad})`);
    }
    assert.match(js, /fetch\("\/api\/emergency" \+ pfad, \{ credentials: "include" \}\)/,
      "die Abrufe schicken die Sitzung nicht mit — jede Antwort waere 401");
  });

  it("Lade-, Leer- und Fehlerzustand sind alle drei behandelt", () => {
    /*
     * ERST NACH EINER RUECKMUTATION RICHTIG. Die erste Fassung fragte
     * `/function zeigeLaedt/` - und `zeigeLaedtNichtMehr` enthaelt das ebenso.
     * Eine Probe, die ein WORT sucht statt die Sache, kann das Fehlen des
     * kuerzeren von zwei verschachtelten Namen nie melden.
     *
     * Jetzt wird gepruefit, WELCHE Bloecke einen Lade- und einen Fehlerzustand
     * bekommen. Das ist auch die interessantere Zusage: ein Fehlerzustand, den
     * nur die Haelfte der Seite hat, faellt sonst erst auf, wenn das Netz weg
     * ist.
     */
    assert.match(js, /function zeigeLaedt\(/, "es gibt keinen Ladezustand");
    assert.match(js, /function zeigeFehler\(/, "es gibt keinen Fehlerzustand");

    const geladen = [...js.matchAll(/zeigeLaedt\("([a-z0-9-]+)"\)/g)].map((m) => m[1]).sort();
    assert.deepEqual(geladen, ["lst-offen", "lst-verlauf"],
      "nicht jede Liste zeigt beim Laden etwas an: " + geladen.join(", "));

    const gefehlert = [...js.matchAll(/zeigeFehler\("([a-z0-9-]+)"/g)].map((m) => m[1]).sort();
    assert.deepEqual(gefehlert, ["lst-offen", "lst-verlauf"],
      "nicht jede Liste behandelt ihren Fehlerfall: " + gefehlert.join(", "));

    assert.match(js, /nd\.lst\.empty\.open/, "die leere Liste hat keinen eigenen Text");
    assert.match(js, /nd\.lst\.empty\.history/, "der leere Verlauf hat keinen eigenen Text");

    /* Der Wiederholen-Knopf braucht BEIDES: gezeichnet und gebunden. Nur eines
       von beiden ergibt einen Knopf, der nichts tut. */
    /* Bis zum ENDE der Funktion, nicht 900 Zeichen weit: ein Fenster fester
       Laenge ist keine Pruefung, sondern eine Wette darauf, dass die Funktion
       nicht waechst. Sie ist gewachsen (der Tarif-Weg kam dazu), und die Probe
       wurde rot, ohne dass etwas fehlte. */
    const abFehler = js.slice(js.indexOf("function zeigeFehler("));
    const ENDE_DER_FUNKTION = String.fromCharCode(10) + "  }";
    const fehlerRumpf = abFehler.slice(0, abFehler.indexOf(ENDE_DER_FUNKTION) + 4);
    assert.ok(fehlerRumpf.length > 200 && fehlerRumpf.length < abFehler.length,
      "der Rumpf von zeigeFehler liess sich nicht abgrenzen");
    assert.match(fehlerRumpf, /data-neu-laden/,
      "der Fehlerzustand zeichnet keinen Wiederholen-Knopf");
    assert.match(js, /closest\("\[data-neu-laden\]"\)/,
      "der Wiederholen-Knopf ist an keinen Handler gebunden");
  });

  it("ein TARIF-Riegel zeigt den Weg nach vorn, keine Sackgasse", () => {
    /*
     * Hausregel, Pfeiler 4: "hidden_plan_locked zeigt konkreten Upgrade-Pfad,
     * kein generisches Nicht-verfuegbar". Der Riegel trifft jemanden, der
     * gerade Interesse zeigt - ihn dort ohne Weiter stehen zu lassen ist die
     * teuerste Sackgasse der ganzen Seite.
     *
     * Und der Knopf muss der RICHTIGE sein: "Erneut versuchen" hilft bei einem
     * Tarif-Riegel nie, es wird beim zweiten Mal genauso 403.
     */
    /*
     * BEIDE Stellen, nicht irgendeine. Der Riegel schlaegt an zwei Orten zu:
     * im Fehlerzustand der Listen und unter den Kennzahlen. Eine Probe, die
     * nur fragt "kommt der Link vor", ist zufrieden, sobald EINE der beiden
     * ihn hat - eine Rueckmutation hat genau das ausgenutzt und ueberlebt.
     */
    const wege = (js.match(/href="\/public\/sla_abo\.html"/g) || []).length;
    assert.strictEqual(wege, 2,
      `der Weg zum Tarif steht ${wege}-mal statt zweimal (Listen-Fehler und Kennzahlen)`);
    const kpiZweig = js.slice(js.indexOf('el("lst-kpi-fehler")'));
    assert.match(kpiZweig.slice(0, 600), /sla_abo\.html/,
      "unter den Kennzahlen endet der Tarif-Riegel in einer Sackgasse");
    assert.match(js, /nd\.lst\.err\.planCta/,
      "der Weg zum Tarif hat keine uebersetzte Beschriftung");
    assert.match(js, /var knopf = tarif/,
      "Tarif-Riegel und Netzfehler zeigen denselben Knopf - `Erneut versuchen` "
      + "hilft bei einem Tarif-Riegel nie");
    for (const sprache of ["de", "en"]) {
      assert.ok(html.includes("'nd.lst.err.planCta'"),
        `die Beschriftung fehlt im Woerterbuch (${sprache})`);
    }
  });

  it("die Eskalation zeigt ihre WIRKUNG, bevor sie ausgeloest wird", () => {
    /*
     * Bei einer Belegschaft von einem Menschen (CLAUDE.md) schuetzt kein
     * zweites Augenpaar. Was schuetzt: vorher zu lesen, was gleich passiert.
     * Eine Eskalation benachrichtigt bis zu 50 Anbieter erneut, auch per Mail.
     */
    assert.match(js, /function frageEskalation/,
      "die Eskalation feuert ohne Rueckfrage");
    assert.match(js, /nd\.lst\.esk\.effect2/,
      "die Rueckfrage nennt die Wirkung nicht — dann ist sie nur eine Verzoegerung");
    const rueckfrage = js.indexOf("frageEskalation");
    const ausloesung = js.indexOf('method: "POST"');
    assert.ok(rueckfrage > -1 && rueckfrage < ausloesung,
      "die Rueckfrage steht hinter dem Absenden");
  });

  it("der Takt haelt an, wenn niemand hinsieht", () => {
    /*
     * ERST NACH EINER RUECKMUTATION RICHTIG. Die erste Fassung fragte, ob
     * `document.hidden` IRGENDWO vorkommt — und es kommt zweimal vor: im Takt
     * und im visibilitychange-Handler. Wer den ersten entfernt, blieb gruen.
     * Beide Stellen werden jetzt einzeln geprueft.
     */
    const takt = js.slice(js.indexOf("function taktStarten"), js.indexOf("function taktStoppen"));
    assert.ok(takt.length > 50, "der Takt wurde umbenannt oder entfernt");
    assert.match(takt, /if \(document\.hidden\) return;/,
      "der Leitstand fragt auch im Hintergrund-Tab jede Minute nach");
    assert.match(js, /"visibilitychange", function \(\) \{\s*\n?\s*if \(!document\.hidden\) ladeAlles\(\);/,
      "beim Zurueckkehren wird nicht sofort nachgeladen — die Zahlen waeren bis zu 60 s alt");
  });

  /* ── Die Grenze, die diese Seite nicht ueberschreitet ──────────────── */

  it("KEIN `all=1` — nirgends im Frontend", () => {
    /*
     * `GET /emergency/active?all=1` und `/dashboard?all=1` heben die
     * Org-Grenze auf. Der Schalter ist beabsichtigt und getestet; unbeabsichtigt
     * ist, was dabei mitgeht: `getActiveEmergencies` liefert `dr.*`, also die
     * ganze Zeile — samt `contact_name`/`contact_phone`, der Durchwahl der
     * Ansprechperson des FREMDEN Unternehmens (Migration 192).
     *
     * Dass das nicht gemeint ist, zeigt der ausdruecklich oeffentliche
     * Nachbarpfad `/marketplace/public/demand-requests`: er waehlt 16 Felder von
     * Hand aus und laesst genau diese beiden weg. Die Auswahl ist die Absicht,
     * `dr.*` ist die Nachlaessigkeit.
     *
     * Solange das nicht entschieden ist, faerbt diese Probe rot, sobald eine
     * Oberflaeche den Schalter benutzt.
     */
    const treffer = [];
    const suche = (verzeichnis) => {
      for (const eintrag of fs.readdirSync(verzeichnis, { withFileTypes: true })) {
        const p = path.join(verzeichnis, eintrag.name);
        if (eintrag.isDirectory()) { suche(p); continue; }
        if (!/\.(js|html)$/.test(eintrag.name)) continue;
        const roh = fs.readFileSync(p, "utf8");
        if (!roh.includes("emergency")) continue;
        /*
         * NUR CODE, KEINE PROSA. Beim ersten Lauf hat diese Wache ihre eigene
         * Begruendung angeklagt: der Kommentar in notdienstLeitstand.js NENNT
         * den Schalter, um zu erklaeren, warum die Seite ihn nicht benutzt.
         * Eine Wache, die Benutzen und Erwaehnen nicht unterscheidet, zwingt
         * dazu, die Begruendung wegzulassen - und loescht damit genau das
         * Wissen, das den naechsten davon abhaelt.
         */
        const inhalt = roh
          .replace(/\/\*[\s\S]*?\*\//g, " ")
          .replace(/^[ \t]*\/\/.*$/gm, " ")
          .replace(/<!--[\s\S]*?-->/g, " ");
        if (/all=1|all:\s*["']1["']|all=\$\{/.test(inhalt)) {
          treffer.push(path.relative(OEFFENTLICH, p).replace(/\\/g, "/"));
        }
      }
    };
    suche(OEFFENTLICH);
    assert.deepEqual(treffer, [],
      "eine Oberflaeche benutzt den org-uebergreifenden Schalter des Notdienstes: " + treffer.join(", "));
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4. Der Weg, eine Teilzusage zurueckzunehmen
   ═══════════════════════════════════════════════════════════════════════ */

describe("N7.4 · Zusage zuruecknehmen, ablehnen, verbindlich machen", { skip: oberflaecheDa ? false : "frontend/public nicht im Abbild" }, () => {

  const detail = oberflaecheDa ? fs.readFileSync(DETAIL_HTML, "utf8") : "";

  it("der Ruecknahme-Weg ist verdrahtet", () => {
    assert.match(detail, /fetch\("\/api\/emergency\/commitments\/" \+ commitmentId, \{\s*\n?\s*method: "PATCH"/,
      "PATCH /emergency/commitments/:id wird nicht gerufen — die Ruecknahme bleibt unmoeglich");
    assert.match(detail, /status: status, note: grund/,
      "die Begruendung wird nicht mitgeschickt");
  });

  it("die Sofortvereinbarung ist verdrahtet — und ihre Antwort passt zum Fenster", () => {
    assert.match(detail, /\/commitments\/" \+ commitmentId \+ "\/create-agreement/,
      "create-agreement wird nicht gerufen");

    /*
     * Die beiden Wege liefern NICHT dieselbe Form. `showAgrModal` stammt vom
     * Angebots-Annehmen und liest `result.agreement_ref` an der Wurzel;
     * `createEmergencyAgreement` legt das Kennzeichen ins Angebot
     * (`{ offer: { ..., agreement_ref } }`, dealAgreementService.js).
     *
     * Ohne Umsetzung oeffnet das Fenster und benennt die Vereinbarung nicht -
     * ein Knopf, der das Richtige tut und es nicht zeigt. Genau die Sorte
     * halber Verdrahtung, gegen die diese ganze Spur gebaut ist.
     */
    assert.match(detail, /agreement_ref: result && result\.offer \? result\.offer\.agreement_ref : null/,
      "das Kennzeichen der Vereinbarung wird nicht aus `result.offer` geholt — "
      + "das Fenster oeffnet ohne Nummer");
  });

  it("die Knoepfe kommen aus `darf`, nicht aus einem Vergleich im Browser", () => {
    /*
     * Die Hausregel: "Berechtigungsentscheidung kommt immer aus dem Backend;
     * Frontend zeigt nur an." Ein Vergleich der eigenen Kennung im Browser
     * waere eine zweite Wahrheit neben der des Servers — und sie kann
     * abweichen, ohne dass es jemand merkt.
     */
    assert.match(detail, /var darf = c\.darf \|\| \{\};/,
      "die Rechte werden nicht aus der Antwort gelesen");
    for (const recht of ["darf.zuruecknehmen", "darf.ablehnen", "darf.vereinbarung"]) {
      assert.ok(detail.includes(recht), `${recht} wird nicht ausgewertet`);
    }
    assert.ok(!/supplier_company_id\s*===/.test(detail),
      "die Seite vergleicht selbst Kennungen — genau die zweite Wahrheit, die vermieden werden soll");
  });

  it("die Begruendung ist Pflicht", () => {
    assert.match(detail, /grund\.length < 10/,
      "eine Ruecknahme ohne Begruendung geht durch — die Gegenseite liest genau diesen Satz");
  });

  it("Anbietername und Notiz werden escaped", () => {
    /*
     * Die Notiz kommt aus dem Formular der Gegenseite (bis 1000 Zeichen) und
     * ging bis heute ungeprueft in innerHTML. Die Seite hatte gar kein esc().
     */
    assert.match(detail, /function esc\(v\)/, "die Seite hat weiterhin kein esc()");
    assert.match(detail, /esc\(c\.supplier_company_name/, "der Anbietername wird nicht escaped");
    assert.match(detail, /esc\(c\.note\)/, "die Notiz der Gegenseite wird nicht escaped");
    assert.match(detail, /esc\(o\.notes\)/, "die Notiz am Angebot wird nicht escaped");
    assert.match(detail, /\.replace\(\/"\/g, "&quot;"\)/,
      "esc() laesst Anfuehrungszeichen stehen — ein Wert bricht aus dem Attribut aus");
  });

  it("nach jeder Aenderung wird neu geladen", () => {
    /* Sonst zeigt die Karte weiter den alten Stand, und der naechste Klick
       laeuft in INVALID_TRANSITION. */
    const rumpf = detail.slice(detail.indexOf("function zusageAendern"));
    assert.match(rumpf.slice(0, 2000), /p\.then\(function\s*\(\)\s*\{\s*loadDetail\(\);/,
      "die Liste wird nach der Ruecknahme nicht neu geladen");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   5. Das Skript laeuft wirklich — Antwort rein, DOM raus
   ═══════════════════════════════════════════════════════════════════════

   Die Proben oben lesen den Quelltext. Das faengt viel, aber nicht den Fall,
   in dem beim Laden eine Ausnahme fliegt und die Seite leer bleibt — im
   Quelltext sieht das tadellos aus.

   Hier laeuft das Skript deshalb wirklich: in einem eigenen vm-Kontext, gegen
   eine DOM-Attrappe und eine Fetch-Attrappe, die die ECHTE Antwortform der drei
   Endpunkte liefert (abgeschrieben von `getEmergencyDashboard`,
   `getActiveEmergencies` und `getEmergencyHistory`).

   Kein jsdom, keine neue Abhaengigkeit: gebraucht werden getElementById,
   addEventListener und ein paar Eigenschaften. Eine Attrappe dafuer ist
   billiger als ein Paket — und sie zeigt genau, worauf sich die Seite
   verlaesst.
*/

import vm from "node:vm";

function attrappe(js) {
  const knoten = new Map();
  const macheKnoten = (id) => ({
    id, _innerHTML: "", textContent: "", hidden: false,
    get innerHTML() { return this._innerHTML; },
    set innerHTML(v) { this._innerHTML = String(v); },
    classList: { add() {}, remove() {} },
    querySelector: () => null,
    setAttribute() {}, getAttribute: () => null, focus() {}
  });

  const document = {
    readyState: "complete",
    hidden: false,
    _lauscher: [],
    getElementById(id) {
      if (!knoten.has(id)) knoten.set(id, macheKnoten(id));
      return knoten.get(id);
    },
    querySelector: () => null,
    addEventListener(art, fn) { document._lauscher.push([art, fn]); }
  };

  const abrufe = [];
  const fetchAttrappe = (url) => {
    abrufe.push(String(url));
    const daten = String(url).includes("/dashboard")
      ? { active: { total: 3, notdienst: 2, urgent: 1, escalated: 1, sla_breached: 1 },
          metrics_30d: { total: 9, response_rate: 78, avg_response_minutes: 95, sla_met_rate: 67, fill_rate: 55, sla_breach_rate: 22 } }
      : String(url).includes("/active")
        ? { count: 1, items: [{
            id: "d-1", title: '<script>alarm()</' + 'script>', role: "Pflegekraft",
            location_city: "Muenster", urgency: "notdienst", urgency_level: "NOTDIENST",
            urgency_label: "Notdienst", age_minutes: 137, sla_overdue: true,
            required_total_count: 4, currently_committed_count: 1, escalation_level: 1
          }] }
        : { count: 1, items: [{
            id: "d-0", title: "Frueher Fall", role: "Lagerhelfer", location_city: "Bremen",
            status: "closed", sla_status: "MET", escalation_level: 0,
            supplier_response_count: 2, response_minutes: 41, created_at: "2026-08-30T05:12:00.000Z"
          }] };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(daten) });
  };

  const sandkasten = {
    document,
    window: { TCNotdienstLeitstand: null },
    fetch: fetchAttrappe,
    setInterval: () => 1,
    clearInterval: () => {},
    console: { log() {}, warn() {}, error() {} },
    Intl, Promise, Math, Number, String, Array, JSON, Set, Map, Date, encodeURIComponent
  };
  sandkasten.window.document = document;
  vm.createContext(sandkasten);

  /*
   * DIE ATTRAPPE LAEDT, WAS DIE SEITE LAEDT. Ohne `dateDE.js` faellt `datumDE`
   * auf einen rohen Anschnitt zurueck und zeigt "2026-08-30" statt
   * "30.08.2026" - was die erste Fassung dieser Probe zu Recht angeklagt hat.
   *
   * Der Ruecklauf ist ABSICHT und bleibt: eine Seite, die eine Hilfsdatei
   * vergisst, soll ein unschoenes Datum zeigen und nicht abstuerzen. Geprueft
   * wird der Weg, den die echte Seite geht - und dass sie ihn geht, sichert die
   * Reihenfolgen-Probe weiter unten.
   */
  vm.runInContext(fs.readFileSync(path.join(OEFFENTLICH, "js", "dateDE.js"), "utf8"),
    sandkasten, { filename: "dateDE.js" });
  vm.runInContext(js, sandkasten, { filename: "notdienstLeitstand.js" });
  return { knoten, abrufe, sandkasten };
}

describe("N7.4 · das Skript laeuft, und die Zahlen landen im DOM", { skip: oberflaecheDa ? false : "frontend/public nicht im Abbild" }, () => {

  const js = oberflaecheDa ? fs.readFileSync(LEITSTAND_JS, "utf8") : "";

  it("es laeuft ohne Ausnahme und ruft alle drei Endpunkte", async () => {
    const { abrufe } = attrappe(js);
    await new Promise((f) => setTimeout(f, 30));
    assert.ok(abrufe.some((u) => u.endsWith("/api/emergency/dashboard")), "kein Abruf der Kennzahlen: " + abrufe.join(", "));
    assert.ok(abrufe.some((u) => u.endsWith("/api/emergency/active")), "kein Abruf der offenen Notlagen");
    assert.ok(abrufe.some((u) => u.includes("/api/emergency/history")), "kein Abruf des Verlaufs");
    assert.ok(!abrufe.some((u) => u.includes("all=1")), "die Seite hat den org-uebergreifenden Schalter benutzt");
  });

  it("die Kennzahlen stehen wirklich in den Kacheln", async () => {
    const { knoten } = attrappe(js);
    await new Promise((f) => setTimeout(f, 30));
    assert.strictEqual(knoten.get("kpi-offen").textContent, "3");
    assert.strictEqual(knoten.get("kpi-notdienst").textContent, "2");
    assert.strictEqual(knoten.get("kpi-eskaliert").textContent, "1");
    assert.strictEqual(knoten.get("kpi-reaktionsquote").textContent, "78 %");
    assert.strictEqual(knoten.get("kpi-reaktionszeit").textContent, "1 h 35 min",
      "die Reaktionszeit wird als rohe Minutenzahl gezeigt statt als Dauer");
  });

  it("eine NULL faerbt nicht", () => {
    /*
     * "Eskaliert: 0" in Warnfarbe ist ein Alarm ohne Anlass - und nach dem
     * dritten Mal sieht niemand mehr hin. Die Farbe gehoert an den Zustand,
     * nicht an die Kategorie. Geprueft wird die Umschaltung im Skript und die
     * Regel im Stilblatt: ohne eine von beiden passiert nichts Sichtbares.
     */
    assert.match(js, /classList\.toggle\("lst-kachel--still", !brennt\)/,
      "die Kachelfarbe haengt weiter an der Kategorie statt am Wert");
    assert.match(js, /var brennt = Number\(k\.wert\) > 0;/,
      "es wird nicht am WERT entschieden");
    /* `html` gehoert dem Abschnitt weiter oben - hier eigenstaendig lesen. */
    const markup = fs.readFileSync(LEITSTAND_HTML, "utf8");
    assert.match(markup, /\.lst-kachel--still \.lst-kachel__wert\{color:var\(--ds-text\)\}/,
      "die Klasse wird gesetzt, aber das Stilblatt kennt sie nicht - dann bleibt die Null rot");
  });

  it("die offene Notlage erscheint — mit Alter, SLA-Warnung und Deckung", async () => {
    const { knoten } = attrappe(js);
    await new Promise((f) => setTimeout(f, 30));
    const html = knoten.get("lst-offen").innerHTML;
    assert.match(html, /Pflegekraft/, "die Rolle fehlt");
    assert.match(html, /Muenster/, "der Ort fehlt");
    assert.match(html, /2 h 17 min/, "das Alter wird nicht als Dauer gezeigt");
    assert.match(html, /lst-karte--gerissen/, "die gerissene SLA faerbt die Karte nicht");
    assert.match(html, /1 \/ 4/, "die Deckung fehlt");
    assert.match(html, /data-eskaliere="d-1"/, "der Eskalationsknopf fehlt");
    assert.match(html, /marketplace_demand_detail\.html\?id=d-1/, "der Weg zur Ausschreibung fehlt");
    assert.strictEqual(knoten.get("lst-offen-zahl").textContent, "1");
  });

  it("EIN TITEL MIT MARKUP LANDET NICHT ALS MARKUP IM DOM", async () => {
    /*
     * Der Titel kommt aus dem Formular des Unternehmens. Bei `?all=1` kaeme er
     * sogar aus einem FREMDEN — ein Grund mehr, ihn nie zu glauben.
     */
    const { knoten } = attrappe(js);
    await new Promise((f) => setTimeout(f, 30));
    const html = knoten.get("lst-offen").innerHTML;
    assert.ok(!/<script>/.test(html), "ein Titel mit Markup wurde als Markup eingesetzt");
    assert.match(html, /&lt;script&gt;/, "der Titel taucht gar nicht auf — die Probe prueft nichts");
  });

  it("der Verlauf wird zur Tabelle", async () => {
    const { knoten } = attrappe(js);
    await new Promise((f) => setTimeout(f, 30));
    const html = knoten.get("lst-verlauf").innerHTML;
    assert.match(html, /<table class="lst-tabelle">/, "der Verlauf ist keine Tabelle");
    assert.match(html, /Frueher Fall/, "der Eintrag fehlt");
    assert.match(html, /30\.08\.2026/, "das Datum wird nicht deutsch gezeigt");
    assert.match(html, /41 min/, "die Reaktionszeit fehlt");
  });

  it("der Stand traegt eine Uhrzeit", async () => {
    const { knoten } = attrappe(js);
    await new Promise((f) => setTimeout(f, 30));
    assert.match(knoten.get("lst-stand").textContent, /Stand \d{2}:\d{2}/,
      "der Leitstand sagt nicht, wie alt seine Zahlen sind");
  });
});
