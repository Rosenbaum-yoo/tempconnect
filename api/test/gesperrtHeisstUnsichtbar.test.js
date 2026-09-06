/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WELLE N4 — GESPERRT HEISST UNSICHTBAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ein Unternehmen kann eine Kraft sperren. Der Riegel beim BUCHEN steht seit
 * Welle J2c (409 WORKER_BLOCKED_FOR_COMPANY) — er hat immer gehalten.
 *
 * Gemessen am 2026-09-06 hielt sonst nichts:
 *
 *   Feed              blendete aus   (die einzige Stelle im Repo)
 *   Suche             zeigte an
 *   Detailansicht     zeigte an
 *   Verhandlungsweg   liess durch — legte Bedarf + Angebot an, mailte die
 *                     Zeitarbeitsfirma an, und erst der Abschluss faellt
 *
 * Ein Angebot, das man nicht buchen darf, ist keine Auskunft, sondern eine
 * Falle: der Kunde plant damit, telefoniert, stimmt Konditionen ab — und
 * erfaehrt die Sperre am Ende. Zwei Haeuser haben dann Zeit fuer etwas
 * aufgewendet, das von Anfang an ausgeschlossen war.
 *
 * Und die Gegenrichtung: die Sperrliste ging AN DIE AGENTUR heraus, mit
 * Kundennamen und GRUND — der Disponenten-Bildschirm zeigte die Gruende an.
 * Owner-Entscheid 2026-09-06: ohne Grund, ohne Kundenname.
 *
 * Diese Datei bewacht beide Richtungen.
 *
 * Lauf: node --test --test-force-exit test/gesperrtHeisstUnsichtbar.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import * as sperrDienst from "../services/companyBlocklistService.js";
import * as kapazitaetsDienst from "../services/capacityExchangeService.js";
import * as sucheDienst from "../services/searchService.js";
import * as deckungsDienst from "../services/capacityOfferMatchService.js";
import { createCapacityExchangeRouter } from "../routes/capacityExchange.js";
import { createMarketplaceRouter } from "../routes/marketplace.js";
import { createWorkersRouter } from "../routes/workers.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HIER, "..");
const OEFFENTLICH = path.resolve(API, "..", "frontend", "public");
const DISPO = path.join(OEFFENTLICH, "js", "pages", "workerSubmissionsReview.js");

const ORG_KUNDE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ORG_ANDERE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CP = "11111111-2222-4333-8444-555555555555";
const PROFIL = "66666666-7777-4888-8999-aaaaaaaaaaaa";

/* ── Vorrichtung ───────────────────────────────────────────────────────── */

function pool(regeln = []) {
  const calls = [];
  const lauf = async (sql, params = []) => {
    const text = typeof sql === "string" ? sql : sql?.text ?? "";
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text.trim().toUpperCase())) {
      return { rows: [], rowCount: 0 };
    }
    calls.push({ sql: text, params });
    for (const [nadel, wert] of regeln) {
      const treffer = typeof nadel === "function" ? nadel(text) : text.includes(nadel);
      if (treffer) {
        const rows = typeof wert === "function" ? wert(text, params) : wert;
        return { rows, rowCount: rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return {
    calls, regeln, query: lauf,
    connect: async () => ({ query: lauf, release() {} }),
    finde(teil) { return calls.filter((c) => c.sql.includes(teil)); }
  };
}

const durchlass = (_q, _s, next) => next();

function deps(p, ueber = {}) {
  const ich = {
    id: "u1", plan: "PRO", company_name: "ACME",
    role: ueber.role ?? "company", org_id: ORG_KUNDE,
    limits: { notdienst: true, max_workers_per_request: -1 }
  };
  return {
    pool: p, logger: { info() {}, warn() {}, error() {}, debug() {} },
    requireAuth: durchlass, requireFeature: () => durchlass, requestLimiter: durchlass,
    sendMail: async () => true, config: {},
    getUserAndPlan: async () => ich
  };
}

function handler(router, method, pfad) {
  for (const l of router.stack) {
    if (l.route && l.route.path === pfad && l.route.methods[method]) {
      return l.route.stack[l.route.stack.length - 1].handle;
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${pfad} fehlt`);
}

function antwort() {
  return {
    _status: 200, _json: null, locals: {},
    status(c) { this._status = c; return this; },
    json(b) { this._json = b; return this; },
    set() { return this; }, setHeader() { return this; }
  };
}

const anfrage = (ueber = {}) => ({
  session: { userId: "u1" }, params: {}, query: {}, body: {},
  headers: {}, orgId: ORG_KUNDE, ip: "127.0.0.1", get: () => "", ...ueber
});

/* Eine aktive Sperrzeile, wie sie die Sperrliste liefert. */
const SPERRE = [{ id: "b1", reason: "zu spaet gekommen", blocked_until: null }];

/* ═══════════════════════════════════════════════════════════════════════
   1. DER BAUSTEIN — eine Bedingung, nicht drei Abschriften
   ═══════════════════════════════════════════════════════════════════════ */

describe("N4.1 · nichtGesperrtSql — die Bedingung selbst", () => {

  it("nennt beide Tabellen, den Alias, den Platzhalter und die Frist", () => {
    /*
     * Form-Probe. Der Muster-Pool fuehrt diese Abfrage nie aus, also kann kein
     * Test darin einen vertauschten Spaltennamen fangen — ausser er pinnt die
     * Bestandteile einzeln. Genau das tut diese Probe.
     */
    const sql = sperrDienst.nichtGesperrtSql("cp", 7);
    assert.match(sql, /^NOT EXISTS \(/, "die Bedingung schliesst nicht aus, sondern ein");
    assert.ok(sql.includes("FROM company_worker_blocklist bl"), "Sperrtabelle fehlt");
    assert.ok(sql.includes("JOIN worker_profiles wpb ON wpb.user_id = bl.worker_user_id"),
      "die Bruecke Profil→Nutzer fehlt — ohne sie vergleicht die Bedingung zwei verschiedene Dinge");
    assert.ok(sql.includes("wpb.id = cp.worker_profile_id"), "der Alias wird nicht verwendet");
    assert.ok(sql.includes("bl.company_org_id = $7"), "der Platzhalter steht nicht am Kunden");
    assert.ok(sql.includes("bl.blocked_until IS NULL OR bl.blocked_until >= CURRENT_DATE"),
      "eine ABGELAUFENE Sperre wuerde weiter ausblenden");
  });

  it("der Alias wandert wirklich mit", () => {
    // Sonst wuerde ein zweiter Verwender still gegen `cp` filtern.
    assert.ok(sperrDienst.nichtGesperrtSql("k", 2).includes("wpb.id = k.worker_profile_id"));
    assert.ok(!sperrDienst.nichtGesperrtSql("k", 2).includes("cp.worker_profile_id"));
  });

  it("die Spalte ist waehlbar — und ebenso geschuetzt", () => {
    /*
     * Nicht jede Flaeche geht von einem ANGEBOT aus: die Deckungsrechnung
     * laeuft auf den Profilzeilen selbst, dort heisst dieselbe Kennung `id`.
     * Ohne diese Wahl haette sie eine eigene Abschrift der Bedingung gebraucht.
     */
    assert.ok(sperrDienst.nichtGesperrtSql("k", 8, { spalte: "id" }).includes("wpb.id = k.id"));
    assert.ok(sperrDienst.nichtGesperrtSql("cp", 1).includes("wpb.id = cp.worker_profile_id"),
      "ohne Angabe muss die Standardspalte stehen bleiben");
    assert.throws(() => sperrDienst.nichtGesperrtSql("k", 1, { spalte: "id; DROP TABLE users --" }),
      /BLOCKLIST_SPALTE_UNGUELTIG/);
  });

  it("ein eingeschleuster Alias und ein krummer Platzhalter fliegen raus", () => {
    /*
     * Der Alias landet UNMASKIERT im SQL — er kommt aus dem eigenen Code, aber
     * genau solche Stellen werden spaeter durchgereicht. Die Schranke steht
     * hier, nicht im Vertrauen auf alle kuenftigen Aufrufer.
     */
    assert.throws(() => sperrDienst.nichtGesperrtSql("cp; DROP TABLE users --", 1),
      /BLOCKLIST_ALIAS_UNGUELTIG/);
    assert.throws(() => sperrDienst.nichtGesperrtSql("cp WHERE 1=1", 1),
      /BLOCKLIST_ALIAS_UNGUELTIG/);
    assert.throws(() => sperrDienst.nichtGesperrtSql("cp", 0), /BLOCKLIST_PLATZHALTER_UNGUELTIG/);
    assert.throws(() => sperrDienst.nichtGesperrtSql("cp", "1; --"), /BLOCKLIST_PLATZHALTER_UNGUELTIG/);
    assert.throws(() => sperrDienst.nichtGesperrtSql("cp", 1.5), /BLOCKLIST_PLATZHALTER_UNGUELTIG/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. DIE DREI FLAECHEN BENUTZEN DENSELBEN BAUSTEIN
   ═══════════════════════════════════════════════════════════════════════ */

describe("N4.2 · Feed und Suche filtern dieselbe Bedingung", () => {

  it("der Feed setzt die Bedingung ein und bindet die Betrachter-Org", async () => {
    const p = pool();
    await kapazitaetsDienst.browseFeed(p, { viewer_company_org_id: ORG_KUNDE, limit: 10 });
    const mit = p.calls.filter((c) => c.sql.includes("FROM company_worker_blocklist bl"));
    assert.ok(mit.length >= 1, "der Feed filtert die Sperre nicht mehr");
    assert.ok(mit.some((c) => c.params.includes(ORG_KUNDE)),
      "die Bedingung steht da, aber die Org des Betrachters wird nicht gebunden");
  });

  it("ohne Betrachter-Org filtert der Feed nicht — sonst waere er fuer alle leer", async () => {
    const p = pool();
    await kapazitaetsDienst.browseFeed(p, { limit: 10 });
    assert.strictEqual(p.calls.filter((c) => c.sql.includes("company_worker_blocklist")).length, 0);
  });

  it("die SUCHE blendet gesperrte Kraefte aus — Abfrage UND Zaehlung", async () => {
    /*
     * Beides, und das ist kein Doppel: die Zaehlung speist die Trefferzahl.
     * Filtert nur die Liste, steht ueber einer Seite ohne den Treffer weiterhin
     * "12 Ergebnisse" — und der Benutzer sucht nach dem dreizehnten.
     */
    const p = pool();
    await sucheDienst.search(p, "Pflege", { type: "capacity_posts", viewerOrgId: ORG_KUNDE });
    const kap = p.calls.filter((c) => c.sql.includes("FROM capacity_posts cp"));
    assert.strictEqual(kap.length, 2, "erwartet: eine Liste und eine Zaehlung");
    for (const c of kap) {
      assert.ok(c.sql.includes("FROM company_worker_blocklist bl"),
        "eine der beiden Abfragen kennt die Sperre nicht");
      assert.ok(c.params.includes(ORG_KUNDE), "die Betrachter-Org wird nicht gebunden");
    }
  });

  it("der gebundene Platzhalter zeigt auf die richtige Stelle", async () => {
    /*
     * Die Liste bindet $5, die Zaehlung $3 — dieselbe Bedingung, zwei Nummern.
     * Eine vertauschte Nummer filtert lautlos nach dem Suchbegriff statt nach
     * der Org und laesst damit alles durch.
     */
    const p = pool();
    await sucheDienst.search(p, "Pflege", { type: "capacity_posts", viewerOrgId: ORG_KUNDE });
    const [liste, zaehlung] = p.calls.filter((c) => c.sql.includes("FROM capacity_posts cp"));
    const nummer = (sql) => Number(/bl\.company_org_id = \$(\d+)/.exec(sql)[1]);
    assert.strictEqual(liste.params[nummer(liste.sql) - 1], ORG_KUNDE);
    assert.strictEqual(zaehlung.params[nummer(zaehlung.sql) - 1], ORG_KUNDE);
  });

  it("ohne Betrachter-Org bleibt die Suche vollstaendig", async () => {
    // Ein hartes `false` haette den ganzen Zweig geleert — der Marktplatz ist
    // oeffentlich, und dort gibt es niemanden, der gesperrt haette.
    const p = pool();
    await sucheDienst.search(p, "Pflege", { type: "capacity_posts", viewerOrgId: null });
    const kap = p.calls.filter((c) => c.sql.includes("FROM capacity_posts cp"));
    assert.strictEqual(kap.length, 2);
    for (const c of kap) {
      assert.ok(!c.sql.includes("company_worker_blocklist"));
      assert.ok(c.sql.includes("AND TRUE"), "die Bedingung wurde ersatzlos gestrichen statt neutralisiert");
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. DIE DETAILANSICHT
   ═══════════════════════════════════════════════════════════════════════ */

describe("N4.1 · die Detailansicht verweigert die gesperrte Kraft", () => {

  const eintrag = (ueber = {}) => [{
    id: CP, supplier_company_id: "u9", title: "Pflegekraft", role: "Pflege",
    status: "active", worker_profile_id: PROFIL, headcount: 1, ...ueber
  }];

  it("409 statt 404 — das Unternehmen hat die Sperre selbst gesetzt", async () => {
    /*
     * KEIN 404. Wer "nicht gefunden" liest, sucht den Fehler bei sich: falscher
     * Link, geloeschtes Angebot. Der Code ist derselbe wie beim Buchen, damit
     * die Oberflaeche nicht zwei Faelle unterscheiden muss.
     */
    const p = pool([
      ["FROM capacity_posts cp", eintrag()],
      ["FROM company_worker_blocklist bl", [{ id: "b1", reason: "x", blocked_until: "2099-01-01" }]]
    ]);
    const res = antwort();
    await handler(createCapacityExchangeRouter(deps(p)), "get", "/capacity-exchange/feed/:id")(
      anfrage({ params: { id: CP } }), res, () => {}
    );
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._json.error, "WORKER_BLOCKED_FOR_COMPANY");
    assert.strictEqual(res._json.blocked_until, "2099-01-01");
  });

  it("die Sperrpruefung fragt nach der EIGENEN Org, nicht nach dem Angebot", async () => {
    const p = pool([
      ["FROM capacity_posts cp", eintrag()],
      ["FROM company_worker_blocklist bl", [{ id: "b1", blocked_until: null }]]
    ]);
    await handler(createCapacityExchangeRouter(deps(p)), "get", "/capacity-exchange/feed/:id")(
      anfrage({ params: { id: CP }, orgId: ORG_KUNDE }), antwort(), () => {}
    );
    const pruefung = p.finde("FROM company_worker_blocklist bl")[0];
    assert.ok(pruefung, "es wurde gar nicht geprueft");
    assert.deepStrictEqual(pruefung.params, [ORG_KUNDE, PROFIL],
      "geprueft wird gegen die falsche Org oder das falsche Profil");
  });

  it("eine ZEITARBEITSFIRMA wird nicht ausgesperrt", async () => {
    // Die Sperre gilt zwischen Kunde und Kraft. Ein Anbieter, der sein eigenes
    // Angebot ansieht, hat damit nichts zu tun.
    const p = pool([
      ["FROM capacity_posts cp", eintrag()],
      ["FROM company_worker_blocklist bl", [{ id: "b1", blocked_until: null }]]
    ]);
    const res = antwort();
    await handler(createCapacityExchangeRouter(deps(p, { role: "agency" })), "get", "/capacity-exchange/feed/:id")(
      anfrage({ params: { id: CP } }), res, () => {}
    );
    assert.notStrictEqual(res._status, 409);
    assert.strictEqual(p.finde("FROM company_worker_blocklist bl").length, 0,
      "fuer eine Agentur wurde die Sperrliste ueberhaupt abgefragt");
  });

  it("ohne Sperre bleibt die Ansicht offen", async () => {
    const p = pool([["FROM capacity_posts cp", eintrag()]]);
    const res = antwort();
    await handler(createCapacityExchangeRouter(deps(p)), "get", "/capacity-exchange/feed/:id")(
      anfrage({ params: { id: CP } }), res, () => {}
    );
    assert.notStrictEqual(res._status, 409);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4. DER VERHANDLUNGSWEG — die ernstere der beiden Luecken
   ═══════════════════════════════════════════════════════════════════════ */

describe("N4.2 · negotiate-deal riegelt wie accept-deal", () => {

  /* Ein Weg ohne Sperre, der wirklich bis zum INSERT durchlaeuft. Die zweite
     Abfrage auf `capacity_posts` (ohne FOR UPDATE) speist die Platzrechnung —
     fehlt sie, endet jeder Aufruf in CAPACITY_UNAVAILABLE, und die Probe
     bestuende ohne je den Riegel beruehrt zu haben. */
  const offenerWeg = (ueber = {}) => {
    const zeile = { id: CP, supplier_company_id: "u9", status: "active", headcount: 1,
      title: "Pflege", role: "Pflege", availability_from: "2026-10-01",
      location_city: "Berlin", ...ueber };
    return pool([
      [(s) => s.includes("FOR UPDATE OF cp"), [zeile]],
      [(s) => /SELECT id, headcount\s+FROM capacity_posts/.test(s), [{ id: CP, headcount: zeile.headcount }]],
      ["INSERT INTO demand_requests", [{ id: "dr1" }]],
      ["INSERT INTO offers", [{ id: "of1" }]]
    ]);
  };

  const gesperrt = () => pool([
    [(s) => s.includes("FOR UPDATE OF cp"),
      [{ id: CP, supplier_company_id: "u9", status: "active", headcount: 1,
        worker_profile_id: PROFIL, title: "Pflege", role: "Pflege" }]],
    ["FROM company_worker_blocklist", SPERRE]
  ]);

  it("409 WORKER_BLOCKED_FOR_COMPANY", async () => {
    const p = gesperrt();
    const res = antwort();
    await handler(createMarketplaceRouter(deps(p)), "post", "/marketplace/capacity-posts/:id/negotiate-deal")(
      anfrage({ params: { id: CP } }), res, () => {}
    );
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._json.error, "WORKER_BLOCKED_FOR_COMPANY");
  });

  it("und es entsteht NICHTS — kein Bedarf, kein Angebot, keine Nachricht", async () => {
    /*
     * Der Statuscode allein reicht hier nicht. Der Weg legt einen Bedarf an,
     * schreibt ein Angebot, benachrichtigt die Gegenseite und mailt sie an.
     * Waere der Riegel zu spaet gesetzt, saehe die Antwort richtig aus und die
     * Zeitarbeitsfirma haette trotzdem eine Anfrage im Postfach.
     */
    const p = gesperrt();
    let gemailt = 0;
    const d = deps(p);
    d.sendMail = async () => { gemailt++; return true; };
    await handler(createMarketplaceRouter(d), "post", "/marketplace/capacity-posts/:id/negotiate-deal")(
      anfrage({ params: { id: CP } }), antwort(), () => {}
    );
    assert.strictEqual(p.finde("INSERT INTO offers").length, 0, "ein Angebot wurde geschrieben");
    assert.strictEqual(p.finde("INSERT INTO demand_requests").length, 0, "ein Bedarf wurde angelegt");
    assert.strictEqual(gemailt, 0, "die Zeitarbeitsfirma hat eine Mail bekommen");
  });

  it("die Pruefung laeuft VOR der Verfuegbarkeitsrechnung", async () => {
    // Sonst haengt der Riegel daran, ob gerade Plaetze frei sind — eine
    // ausgebuchte gesperrte Kraft ergaebe CAPACITY_UNAVAILABLE, und beim
    // naechsten freien Platz stuende die Luecke wieder offen.
    const p = gesperrt();
    await handler(createMarketplaceRouter(deps(p)), "post", "/marketplace/capacity-posts/:id/negotiate-deal")(
      anfrage({ params: { id: CP } }), antwort(), () => {}
    );
    const idxSperre = p.calls.findIndex((c) => c.sql.includes("company_worker_blocklist"));
    const idxRest = p.calls.findIndex((c) => /remaining_headcount|capacity_deal|offered_quantity/i.test(c.sql));
    assert.ok(idxSperre >= 0, "es wurde nicht geprueft");
    assert.ok(idxRest === -1 || idxSperre < idxRest, "die Sperre wird zu spaet geprueft");
  });

  it("ohne Sperre laeuft die Verhandlung weiter", async () => {
    const p = offenerWeg({ worker_profile_id: PROFIL });
    const res = antwort();
    await handler(createMarketplaceRouter(deps(p)), "post", "/marketplace/capacity-posts/:id/negotiate-deal")(
      anfrage({ params: { id: CP } }), res, () => {}
    );
    assert.strictEqual(res._status, 201, JSON.stringify(res._json));
    assert.strictEqual(p.finde("INSERT INTO offers").length, 1, "es entstand kein Angebot");
  });

  it("ein Angebot OHNE Kraft dahinter wird nicht blockiert", async () => {
    /*
     * Ein Sammelangebot ("3 Pflegekraefte") haengt an keinem Profil. Es gibt
     * nichts zu sperren — und ein Riegel, der hier zuschlaegt, waere ein
     * Ausfall des Marktplatzes fuer jeden, der irgendwen gesperrt hat. Die
     * Sperrliste antwortet hier absichtlich MIT einer Zeile: sie darf gar nicht
     * erst gefragt werden.
     */
    const p = offenerWeg({ worker_profile_id: null, headcount: 3 });
    p.regeln.unshift(["FROM company_worker_blocklist", SPERRE]);
    const res = antwort();
    await handler(createMarketplaceRouter(deps(p)), "post", "/marketplace/capacity-posts/:id/negotiate-deal")(
      anfrage({ params: { id: CP } }), res, () => {}
    );
    assert.strictEqual(res._status, 201, JSON.stringify(res._json));
    assert.strictEqual(p.finde("company_worker_blocklist").length, 0,
      "ohne Kraft dahinter wurde trotzdem die Sperrliste befragt");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4b. DAS BUENDEL — eine Zahl, die haelt
   ═══════════════════════════════════════════════════════════════════════ */

describe("N4.2 · die Deckungsrechnung zaehlt Gesperrte nicht mit", () => {

  /* Ein Muster-Pool, der die Faehigkeit aufloest und eine Belegschaft liefert. */
  const deckungsPool = () => pool([
    ["FROM platform_skills WHERE id = ANY", [{ id: "s1", name: "Pflege", category: "care" }]],
    ["FROM worker_profiles wp", [{ worker_profile_id: "wp1", treffer: 1, treffer_namen: ["Pflege"] }]]
  ]);

  it("mit Kunde: die Bedingung steht in der Abfrage und der Kunde ist gebunden", async () => {
    const p = deckungsPool();
    await deckungsDienst.checkOfferCoverage(p, {
      orgId: ORG_ANDERE, skillIds: ["s1"], headcount: 14, kundeOrgId: ORG_KUNDE
    });
    const rechnung = p.calls.find((c) => c.sql.includes("WITH forderung AS"));
    assert.ok(rechnung, "die Deckungsabfrage lief gar nicht");
    assert.ok(rechnung.sql.includes("FROM company_worker_blocklist bl"),
      "die Deckung rechnet weiterhin mit gesperrten Kraeften");
    assert.ok(rechnung.sql.includes("wpb.id = k.id"),
      "die Bedingung greift auf die falsche Spalte — auf Profilzeilen heisst die Kennung `id`");
    assert.strictEqual(rechnung.params.length, 8, "der Kunde wurde nicht gebunden");
    assert.strictEqual(rechnung.params[7], ORG_KUNDE);
    const nummer = Number(/bl\.company_org_id = \$(\d+)/.exec(rechnung.sql)[1]);
    assert.strictEqual(rechnung.params[nummer - 1], ORG_KUNDE,
      "der Platzhalter zeigt auf eine andere Stelle als den Kunden");
  });

  it("ohne Kunde bleibt die Rechnung unveraendert", async () => {
    /*
     * Das Angebotsformular hat noch keinen Empfaenger — dort gibt es niemanden,
     * der gesperrt haben koennte. Waere die Bedingung trotzdem da (mit NULL),
     * lieferte `bl.company_org_id = NULL` nie einen Treffer: die Bedingung waere
     * wirkungslos, aber die Abfrage teurer. Sie gehoert also ganz weg.
     */
    const p = deckungsPool();
    await deckungsDienst.checkOfferCoverage(p, {
      orgId: ORG_ANDERE, skillIds: ["s1"], headcount: 3
    });
    const rechnung = p.calls.find((c) => c.sql.includes("WITH forderung AS"));
    assert.ok(!rechnung.sql.includes("company_worker_blocklist"));
    assert.ok(rechnung.sql.includes("AND TRUE"), "die Bedingung wurde gestrichen statt neutralisiert");
    assert.strictEqual(rechnung.params.length, 7);
  });

  it("die Vorschau am fremden Bedarf reicht den Kunden durch", async () => {
    /*
     * Die Sperrliste haengt an der ORG, `requester_company_id` ist eine
     * NUTZER-Kennung. Wer die beiden verwechselt, filtert gegen etwas, das es
     * in der Sperrliste nie gibt — und die Rechnung sieht gefiltert aus,
     * ohne es zu sein.
     */
    const p = pool([
      ["FROM demand_requests dr", [{
        id: "dr1", status: "open", role: "Pflege", skill_tags: [], headcount: 14,
        requester_company_id: "u-kunde", requester_org_id: ORG_KUNDE,
        start_date: "2026-10-01", end_date: "2026-11-30"
      }]],
      /* Der Aufloeser VERBINDET auf `platform_skills`, er waehlt nicht daraus —
         und er braucht `suchbegriff` zurueck, sonst bleibt die Zuordnung leer
         und die Rechnung bricht vor der eigentlichen Abfrage ab. */
      ["JOIN platform_skills ps", [{ id: "s1", name: "Pflege", category: "care", suchbegriff: "pflege" }]]
    ]);
    const req = anfrage({ params: { id: "dr1" }, orgId: ORG_ANDERE, user: { id: "u1", role: "agency" } });
    await handler(createCapacityExchangeRouter(deps(p, { role: "agency" })), "get",
      "/capacity-exchange/demands/:id/coverage")(req, antwort(), () => {});
    const rechnung = p.calls.find((c) => c.sql.includes("WITH forderung AS"));
    assert.ok(rechnung, "die Deckung wurde gar nicht gerechnet");
    assert.ok(rechnung.params.includes(ORG_KUNDE), "die Org des Bedarfstellers kam nicht an");
    assert.ok(!rechnung.params.includes("u-kunde"),
      "gefiltert wird gegen die NUTZER-Kennung — in der Sperrliste steht die Org");
  });

  it("und der Bedarf traegt diese Org ueberhaupt", async () => {
    // Ohne die Spalte ist `requester_org_id` still `undefined`, die Bedingung
    // faellt weg und niemandem faellt etwas auf.
    const p = pool([["FROM demand_requests dr", [{ id: "dr1" }]]]);
    const { getDemandById } = await import("../services/marketplaceService.js");
    await getDemandById(p, "dr1");
    assert.ok(/u\.org_id AS requester_org_id/.test(p.calls[0].sql),
      "die Org des Bedarfstellers wird nicht mitgeladen");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   5. DIE GEGENRICHTUNG — was die Agentur erfaehrt
   ═══════════════════════════════════════════════════════════════════════ */

describe("N4.3 · die Auskunft an die Agentur nennt weder Grund noch Kunden", () => {

  it("mit Kunde: nur Kraft und Frist, gebunden an BEIDE Orgs", async () => {
    const p = pool();
    await sperrDienst.listBlocksForSupplier(p, ORG_ANDERE, { companyOrgId: ORG_KUNDE });
    const [q] = p.calls;
    assert.ok(q.sql.includes("b.worker_user_id"), "die Kraft fehlt");
    assert.ok(q.sql.includes("b.blocked_until"), "die Frist fehlt — ohne sie steht 'gesperrt' ohne Ende da");
    assert.ok(!/b\.reason/.test(q.sql), "der GRUND geht wieder an die Agentur");
    assert.ok(!/company_name|organizations/i.test(q.sql), "der KUNDENNAME geht wieder an die Agentur");
    assert.ok(q.sql.includes("wp.supplier_org_id = $1"), "die eigene Belegschaft ist nicht die Grenze");
    assert.deepStrictEqual(q.params, [ORG_ANDERE, ORG_KUNDE]);
  });

  it("ohne Kunde: eine Zeile je Kraft — die ANZAHL verraet sonst, bei wie vielen", async () => {
    /*
     * Zwei Kunden sperren dieselbe Kraft. Eine Zeile je Sperre haette gesagt:
     * "dieser Mensch ist zweimal aufgefallen." Das ist eine Aussage ueber ihn,
     * und sie steht in keinem Feld — sie entsteht aus der Zeilenzahl.
     */
    const p = pool();
    await sperrDienst.listBlocksForSupplier(p, ORG_ANDERE);
    const [q] = p.calls;
    assert.ok(/GROUP BY\s+b\.worker_user_id/.test(q.sql), "es wird nicht je Kraft zusammengefasst");
    assert.ok(!/b\.reason/.test(q.sql), "der Grund faehrt mit");
    assert.ok(!/company_org_id(?!\s*=)/.test(q.sql.replace(/WHERE[\s\S]*$/, "")),
      "der Kunde faehrt in der Auswahl mit");
    assert.deepStrictEqual(q.params, [ORG_ANDERE]);
  });

  it("eine unbefristete Sperre schlaegt jede befristete", async () => {
    // MAX() ueber gemischte Fristen liefert sonst ein Datum, und die Oberflaeche
    // schriebe "gesperrt bis 30.09." ueber eine Sperre ohne Ende.
    const p = pool();
    await sperrDienst.listBlocksForSupplier(p, ORG_ANDERE);
    assert.ok(/bool_or\(b\.blocked_until IS NULL\)/.test(p.calls[0].sql),
      "eine unbefristete Sperre wuerde als befristet dargestellt");
  });

  it("ohne eigene Org wird gar nicht gefragt", async () => {
    const p = pool();
    assert.deepStrictEqual(await sperrDienst.listBlocksForSupplier(p, null), []);
    assert.strictEqual(p.calls.length, 0);
  });

  it("der Endpunkt reicht nur eine echte Kennung durch", async () => {
    /*
     * Freitext wuerde die Abfrage mit 22P02 abbrechen — ein 500 sieht aus wie
     * ein Serverfehler, obwohl der Aufruf falsch war.
     */
    for (const [eingabe, erwartetScoped] of [
      [ORG_KUNDE, true], ["  " + ORG_KUNDE + "  ", true],
      ["nicht-uuid", false], ["", false], ["' OR 1=1 --", false]
    ]) {
      const p = pool();
      const res = antwort();
      await handler(createWorkersRouter(deps(p, { role: "agency" })), "get", "/workers/blocks")(
        anfrage({ query: { company_org_id: eingabe }, orgId: ORG_ANDERE }), res, () => {}
      );
      assert.strictEqual(res._json.scoped_to_company, erwartetScoped, `Eingabe: ${JSON.stringify(eingabe)}`);
      const q = p.calls[0];
      assert.strictEqual(q.params.length, erwartetScoped ? 2 : 1);
      if (erwartetScoped) assert.strictEqual(q.params[1], ORG_KUNDE, "die Kennung wurde ungetrimmt gebunden");
    }
  });

  it("die Antwort traegt in KEINEM Fall einen Grund", async () => {
    // Die Zeilen kommen aus der Datenbank; wenn die Abfrage sich aendert, faellt
    // es hier auf, bevor es in der Oberflaeche steht.
    for (const query of [{}, { company_org_id: ORG_KUNDE }]) {
      const p = pool([["company_worker_blocklist", [{ worker_user_id: "w1", blocked_until: null }]]]);
      const res = antwort();
      await handler(createWorkersRouter(deps(p, { role: "agency" })), "get", "/workers/blocks")(
        anfrage({ query, orgId: ORG_ANDERE }), res, () => {}
      );
      assert.ok(!p.calls[0].sql.includes("reason"));
      for (const zeile of res._json.items) {
        assert.ok(!("reason" in zeile) && !("company_name" in zeile) && !("company_org_id" in zeile),
          "die Antwort traegt " + Object.keys(zeile).join(", "));
      }
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   6. DER DISPONENTEN-BILDSCHIRM
   ═══════════════════════════════════════════════════════════════════════ */

describe("N4.3 · die Oberflaeche zeigt die Einschraenkung, nicht das Urteil", () => {

  const da = fs.existsSync(DISPO);
  const lies = () => fs.readFileSync(DISPO, "utf8");

  it("kein Sperrgrund wird gerendert", { skip: !da && "Datei fehlt" }, () => {
    const s = lies();
    assert.ok(!/b\.reason\|\|'ohne Grundangabe'/.test(s), "der Grund steht wieder im Hinweis");
    assert.ok(!/blockedHint[^\n]*\{names\}/.test(s), "der Hinweistext hat wieder einen Platz fuer Gruende");
    assert.ok(!/blockedHint',\s*\{/.test(s), "dem Hinweis werden wieder Werte uebergeben");
  });

  it("die Sperren werden je Kunde geholt, nicht am Stueck", { skip: !da && "Datei fehlt" }, () => {
    const s = lies();
    assert.ok(s.includes("/workers/blocks?company_org_id="),
      "es wird weiterhin die ganze Liste geholt");
    assert.ok(!/fetchJson\(`\$\{API\}\/workers\/blocks`\)/.test(s),
      "der ungefilterte Abruf steht noch da");
    assert.ok(!/loadSupplierBlocks/.test(s), "der Vorab-Abruf lebt weiter");
  });

  it("und die Auswahl wartet darauf", { skip: !da && "Datei fehlt" }, () => {
    /*
     * `rebuildWorkerSelect` liest den Zwischenspeicher SYNCHRON. Wird das Holen
     * nicht abgewartet, baut sich die Liste einmal ohne Sperren auf — und der
     * Disponent sieht genau in dem Moment eine waehlbare Kraft, in dem er waehlt.
     */
    const s = lies();
    const i = s.indexOf("await ladeSperren(");
    const j = s.indexOf("rebuildWorkerSelect(Array.isArray(c.assigned_worker_user_ids)");
    assert.ok(i > 0 && j > 0 && i < j, "die Liste wird gebaut, bevor die Sperren da sind");
    assert.ok(/async function onCapSelect\(\)/.test(s), "onCapSelect kann gar nicht warten");
  });

  it("ein fehlgeschlagener Abruf wird NICHT gemerkt", { skip: !da && "Datei fehlt" }, () => {
    /*
     * Sonst macht ein einziger Netzhaenger die Sperren fuer den Rest der
     * Sitzung unsichtbar — und die Seite sieht dabei voellig gesund aus.
     * Gemessen an der Stelle des `set` relativ zum `catch`.
     */
    const s = lies();
    const block = /async function ladeSperren\([\s\S]*?\n\}/.exec(s);
    assert.ok(block, "ladeSperren fehlt");
    const i = block[0].indexOf("sperrenJeKunde.set(");
    const j = block[0].indexOf("}catch");
    assert.ok(i > 0 && j > 0 && i < j, "der Fehlschlag landet im Zwischenspeicher");
  });

  it("die gesperrte Kraft bleibt sichtbar und ist deaktiviert", { skip: !da && "Datei fehlt" }, () => {
    // Verstecken waere hier falsch: der Disponent sucht sonst nach jemandem,
    // der einfach fehlt. Sichtbar-aber-gesperrt beantwortet die Frage.
    const s = lies();
    assert.ok(/<option value="\$\{uid\}" disabled>/.test(s), "die Kraft wird nicht mehr deaktiviert angezeigt");
    assert.ok(s.includes("ts.rev.assign.blockedSuffix"), "der Vermerk am Namen fehlt");
  });
});


/* ═══════════════════════════════════════════════════════════════════════
   7. DERSELBE BILDSCHIRM — AUSGEFUEHRT, NICHT GELESEN
   ═══════════════════════════════════════════════════════════════════════

   Abschnitt 6 prueft den Quelltext. Das faengt die Rueckkehr des Grundes,
   aber es beweist NICHT, was der Disponent am Ende sieht: ob die gesperrte
   Kraft wirklich deaktiviert im Auswahlfeld steht, ob der Hinweis wirklich
   ohne Grund auskommt, ob ein zweiter Kunde wirklich neu geladen wird.

   Der Vorschau-Server dieses Aufbaus bedient einen ANDEREN Arbeitsbaum —
   ein Bildschirmfoto bewiese also nichts ueber diese Dateien. Deshalb wird
   der Abschnitt hier herausgeschnitten und in einer Sandbox mit einem
   handgebauten DOM ausgefuehrt. Was hier steht, ist gelaufen.
   ═══════════════════════════════════════════════════════════════════════ */

describe("N4.3 · der Bildschirm, ausgefuehrt", () => {

  const da = fs.existsSync(DISPO);

  /** Schneidet die vier Funktionen heraus und laesst sie in einer Sandbox laufen. */
  function bildschirm({ antwort: netzAntwort, wirft = false } = {}) {
    const quelle = fs.readFileSync(DISPO, "utf8");
    const von = quelle.indexOf("const sperrenJeKunde=new Map();");
    const bis = quelle.indexOf("async function onCapSelect()");
    assert.ok(von > 0 && bis > von, "der Abschnitt liegt nicht mehr, wo er lag");
    const ausschnitt = quelle.slice(von, bis);

    const abrufe = [];
    const feld = { value: "", innerHTML: "" };
    const infoBox = { html: "", insertAdjacentHTML(_wo, s) { this.html += s; } };

    const umgebung = {
      API: "/api",
      allWrks: [
        { id: "w1", first_name: "Anna",  last_name: "Berg",  is_active: true },
        { id: "w2", first_name: "Bernd", last_name: "Cordes", is_active: true },
        { id: "w3", first_name: "Cem",   last_name: "Demir",  is_active: true }
      ],
      document: {
        getElementById: (id) => (id === "asgWkr" ? feld : id === "asgCapInfo" ? infoBox : null)
      },
      esc: (v) => String(v ?? "").replace(/[&<>"]/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])),
      fmtD: (d) => String(d),
      tt: (schluessel, werte) => {
        const texte = {
          "ts.rev.assign.pleaseChoose": "– Bitte waehlen –",
          "ts.rev.assign.blockedSuffix": "— gesperrt bei diesem Kunden",
          "ts.rev.assign.blockedTitle": `${werte?.n} Kraft/Kraefte von diesem Kunden gesperrt`,
          "ts.rev.assign.blockedHint": "— im Dropdown deaktiviert. Den Grund kennt nur der Kunde."
        };
        /* Absichtlich streng: ein Text, der noch einen Platzhalter traegt, faellt
           hier auf, statt als "{names}" im Browser zu landen. */
        const t = texte[schluessel];
        assert.ok(t !== undefined, "unbekannter Textschluessel: " + schluessel);
        return t;
      },
      fetchJson: async (url) => {
        abrufe.push(url);
        if (wirft) throw new Error("Netz weg");
        return netzAntwort ?? { items: [] };
      },
      console
    };
    vm.createContext(umgebung);
    new vm.Script(ausschnitt).runInContext(umgebung);
    return { umgebung, abrufe, feld, infoBox };
  }

  const EINE_SPERRE = { items: [{ worker_user_id: "w2", blocked_until: null }] };

  it("die gesperrte Kraft steht deaktiviert da — und ohne Grund", { skip: !da && "Datei fehlt" }, async () => {
    const b = bildschirm({ antwort: EINE_SPERRE });
    await b.umgebung.ladeSperren("kunde-1");
    b.umgebung.rebuildWorkerSelect([], "kunde-1");

    assert.ok(b.feld.innerHTML.includes('<option value="w2" disabled>'),
      "die gesperrte Kraft ist nicht deaktiviert");
    assert.ok(b.feld.innerHTML.includes('<option value="w1">'), "eine freie Kraft wurde deaktiviert");
    assert.ok(b.feld.innerHTML.includes("Bernd"), "die gesperrte Kraft wurde VERSTECKT statt deaktiviert");
    assert.ok(!/zu spaet|Qualitaet|Grund:/i.test(b.feld.innerHTML), "im Auswahlfeld steht ein Grund");
  });

  it("der Hinweis nennt die Zahl, nicht den Grund", { skip: !da && "Datei fehlt" }, async () => {
    const b = bildschirm({ antwort: EINE_SPERRE });
    await b.umgebung.ladeSperren("kunde-1");
    b.umgebung.rebuildWorkerSelect([], "kunde-1");

    assert.ok(b.infoBox.html.includes("1 Kraft/Kraefte"), "die Zahl fehlt im Hinweis");
    assert.ok(b.infoBox.html.includes("Den Grund kennt nur der Kunde"), "der Hinweistext fehlt");
    assert.ok(!b.infoBox.html.includes("{names}"), "ein Platzhalter blieb unersetzt stehen");
    assert.ok(!/Grund:\s*\S/.test(b.infoBox.html), "es steht doch ein Grund im Hinweis");
  });

  it("ohne Sperre bleibt der Hinweis ganz weg", { skip: !da && "Datei fehlt" }, async () => {
    const b = bildschirm({ antwort: { items: [] } });
    await b.umgebung.ladeSperren("kunde-1");
    b.umgebung.rebuildWorkerSelect([], "kunde-1");
    assert.strictEqual(b.infoBox.html, "", "ein leerer Warnkasten erscheint ohne Anlass");
  });

  it("gefragt wird je Kunde — und der Kunde steht in der Abfrage", { skip: !da && "Datei fehlt" }, async () => {
    const b = bildschirm({ antwort: EINE_SPERRE });
    await b.umgebung.ladeSperren("kunde-1");
    assert.deepStrictEqual(b.abrufe, ["/api/workers/blocks?company_org_id=kunde-1"]);

    /* Zweiter Aufruf, gleicher Kunde: kein zweites Mal ueber das Netz. */
    await b.umgebung.ladeSperren("kunde-1");
    assert.strictEqual(b.abrufe.length, 1, "derselbe Kunde wurde erneut abgefragt");

    /* Anderer Kunde: sehr wohl. */
    await b.umgebung.ladeSperren("kunde-2");
    assert.strictEqual(b.abrufe.length, 2, "der zweite Kunde wurde nicht abgefragt");
  });

  it("ein Netzfehler macht die Sperren NICHT dauerhaft unsichtbar", { skip: !da && "Datei fehlt" }, async () => {
    /*
     * Die teuerste stille Fehlfunktion in diesem Stueck: ein einzelner
     * Aussetzer, danach zeigt die Seite fuer den Rest der Sitzung keine Sperre
     * mehr — und sieht dabei voellig gesund aus.
     */
    const b = bildschirm({ wirft: true });
    const leer = await b.umgebung.ladeSperren("kunde-1");
    assert.strictEqual(leer.size, 0, "ein Fehlschlag darf keine Sperren erfinden");
    b.umgebung.rebuildWorkerSelect([], "kunde-1");
    assert.ok(!b.feld.innerHTML.includes("disabled"), "ohne Daten wurde jemand gesperrt angezeigt");

    /* Und jetzt der Punkt: der naechste Versuch geht wieder ans Netz. */
    await b.umgebung.ladeSperren("kunde-1");
    assert.strictEqual(b.abrufe.length, 2, "der Fehlschlag wurde gemerkt — die Sperren blieben weg");
  });

  it("eine befristete Sperre nennt ihr Ende, eine unbefristete sagt 'dauerhaft'",
    { skip: !da && "Datei fehlt" }, async () => {
    const b = bildschirm({ antwort: { items: [
      { worker_user_id: "w1", blocked_until: "2026-12-31" },
      { worker_user_id: "w2", blocked_until: null }
    ] } });
    await b.umgebung.ladeSperren("kunde-1");
    b.umgebung.rebuildWorkerSelect([], "kunde-1");
    assert.ok(b.feld.innerHTML.includes("bis 2026-12-31"), "die Frist wird nicht genannt");
    assert.ok(b.feld.innerHTML.includes("dauerhaft"), "eine unbefristete Sperre bekommt kein Wort");
  });
});
