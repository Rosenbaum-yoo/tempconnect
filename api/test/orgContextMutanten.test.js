/**
 * M3 — die 6 A-Faelle aus `middleware/orgContext.js`.
 *
 * WAS HIER AUF DEM SPIEL STEHT
 * Diese Middleware entscheidet fuer JEDE angemeldete Anfrage, als welche
 * Organisation und an welchem Standort sie laeuft. Ihre sechs offenen Faelle
 * betreffen drei Zusagen, die anderswo im Code vorausgesetzt werden:
 *
 *   1. Eine kaputte UUID im Kopf wird ABGEWIESEN (400), nicht stillschweigend
 *      uebernommen — beide Anker des Musters tragen diese Zusage.
 *   2. Ein nicht aufloesbarer Org-Wunsch faellt auf die EIGENE Org zurueck
 *      (Regel 7). Waere `req.orgId` danach leer, schalteten sich 45
 *      Grenzpruefungen der Form `if (req.orgId && fremd) 403` selbst ab — das
 *      war bis zum 2026-07-26 ein erreichbares Cross-Org-Leck.
 *   3. Nur der HEADER gilt als Absicht, die Organisation zu wechseln, und nur
 *      ein echter Wechsel verwirft den Standort-Cache (Regel 6).
 *
 * Die uebrigen 18 Faelle dieser Datei bekommen bewusst keinen Test; die
 * Begruendung steht je Fall in
 * `docs/qualitaet/mutation/2026-08-14-rbac/triage.json` — die meisten sind
 * gleichwertige Mutanten, die gar nicht toetbar sind.
 *
 * Diese Datei muss in `stryker.rbac.conf.json` unter `commandRunner` stehen.
 * DB-frei (Mock-Pool).
 * Run: node --test --test-force-exit test/orgContextMutanten.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { orgContextMiddleware } from "../middleware/orgContext.js";

const ORG_A = "a0b1c2d3-e4f5-6789-abcd-ef0123456789";
const ORG_B = "b1c2d3e4-f5a6-7890-bcde-f01234567890";
const LOC_A = "c2d3e4f5-a6b7-8901-cdef-012345678901";
const USER = "user-abc-123";

const MITGLIED_A = { org_id: ORG_A, role_key: "owner", org_name: "Test GmbH", location_id: null, department_id: null };

function pool(...antworten) {
  let i = 0;
  const abfragen = [];
  return {
    abfragen,
    query: async (sql, params) => {
      abfragen.push({ sql, params });
      if (i >= antworten.length) throw new Error(`Unerwartete Abfrage #${i + 1}: ${sql.slice(0, 60)}`);
      return antworten[i++];
    },
  };
}

function req(overrides = {}) {
  return { session: { userId: USER }, headers: {}, query: {}, body: {}, ...overrides };
}

function res() {
  const r = { _status: 200, _body: null };
  r.status = (s) => ((r._status = s), r);
  r.json = (b) => ((r._body = b), r);
  return r;
}

/** Middleware laufen lassen und melden, ob sie durchgelassen hat. */
async function lauf(p, anfrage) {
  const antwort = res();
  let weiter = false;
  await orgContextMiddleware(p)(anfrage, antwort, () => {
    weiter = true;
  });
  return { antwort, weiter };
}

/* ═══════════════════════════════════════════════════════════
 *  Die beiden Anker des UUID-Musters
 *
 *  Ohne Anfangsanker passiert "muell<uuid>" die Pruefung, ohne Endanker
 *  "<uuid>muell". Beides sind Werte, die anschliessend als Org- bzw.
 *  Standort-Kennung weiterverwendet wuerden.
 * ═══════════════════════════════════════════════════════════ */

describe("M3 — eine kaputte Kennung wird abgewiesen, nicht uebernommen", () => {
  it("nr 0: Muell VOR der UUID wird abgewiesen (Anfangsanker)", async () => {
    const p = pool();
    const anfrage = req({ headers: { "x-org-id": `muell${ORG_A}` } });
    const { antwort, weiter } = await lauf(p, anfrage);

    assert.equal(antwort._status, 400, "Ohne Anfangsanker rutscht ein vorangestellter Rest durch");
    assert.equal(antwort._body.error, "INVALID_ORG_ID");
    assert.equal(weiter, false, "Nach einer 400 darf die Kette nicht weiterlaufen");
    assert.equal(p.abfragen.length, 0, "Und es darf keine Abfrage mit dem kaputten Wert geben");
  });

  it("nr 1: Muell NACH der UUID wird abgewiesen (Endanker)", async () => {
    const p = pool();
    const anfrage = req({ headers: { "x-location-id": `${LOC_A}muell` } });
    const { antwort, weiter } = await lauf(p, anfrage);

    assert.equal(antwort._status, 400, "Ohne Endanker rutscht ein angehaengter Rest durch");
    assert.equal(antwort._body.error, "INVALID_LOCATION_ID");
    assert.equal(weiter, false);
    assert.equal(p.abfragen.length, 0);
  });

  it("die Gegenprobe: eine saubere UUID kommt durch", async () => {
    const p = pool({ rows: [MITGLIED_A] });
    const anfrage = req({ headers: { "x-org-id": ORG_A } });
    const { antwort, weiter } = await lauf(p, anfrage);

    assert.equal(antwort._status, 200);
    assert.equal(weiter, true);
    assert.equal(anfrage.orgId, ORG_A);
  });
});

/* ═══════════════════════════════════════════════════════════
 *  Regel 7 — der Kontext bleibt nie leer
 * ═══════════════════════════════════════════════════════════ */

describe("M3 — ein unaufloesbarer Org-Wunsch faellt auf die eigene Org zurueck", () => {
  it("nr 8: fremde Org im Kopf, keine Mitgliedschaft -> eigene Org, nicht leer", async () => {
    const p = pool(
      { rows: [] }, // getMembership fuer die fremde Org: keine Mitgliedschaft
      { rows: [{ org_id: ORG_A }] }, // getPrimaryOrg: users.org_id
      { rows: [MITGLIED_A] } // getMembership fuer die eigene Org
    );
    const anfrage = req({ headers: { "x-org-id": ORG_B } });
    const { weiter } = await lauf(p, anfrage);

    assert.equal(weiter, true);
    assert.equal(
      anfrage.orgId,
      ORG_A,
      "Der Kontext muss auf die EIGENE Org fallen. Bleibt er leer, schalten sich 45 " +
        "Grenzpruefungen der Form 'if (req.orgId && fremd) 403' selbst ab — genau im Angriffsfall"
    );
    assert.notEqual(anfrage.orgId, ORG_B, "Und niemals die gewuenschte fremde Org");
  });
});

/* ═══════════════════════════════════════════════════════════
 *  Regel 6 — nur der Header ist eine Absicht
 * ═══════════════════════════════════════════════════════════ */

describe("M3 — nur der Header wechselt die Organisation dauerhaft", () => {
  it("nr 9: ein ?org_id= in der Adresszeile landet NICHT im Sitzungs-Cache", async () => {
    const p = pool({ rows: [MITGLIED_A] });
    const anfrage = req({ query: { org_id: ORG_A } });
    await lauf(p, anfrage);

    assert.equal(anfrage.orgId, ORG_A, "Als Wunsch fuer diese eine Anfrage gilt er");
    assert.equal(
      anfrage.session._orgCache,
      undefined,
      "Aber er darf nicht in den Cache — sonst wirkt ein Wert aus der Adresszeile in allen " +
        "folgenden Anfragen weiter, ohne dass ihn jemand noch einmal nennt"
    );
  });

  it("nr 10 + 11: derselbe Org-Kopf laesst den Standort-Cache stehen", async () => {
    const p = pool(
      { rows: [MITGLIED_A] }, // getMembership
      { rows: [{ id: LOC_A, name: "Werk Nord" }] } // resolveLocation fuer den Cache-Standort
    );
    const anfrage = req({
      headers: { "x-org-id": ORG_A },
      session: {
        userId: USER,
        _orgCache: { orgId: ORG_A, role: "owner", name: "Test GmbH", defaultLocationId: null },
        _locationCache: { locationId: LOC_A, locationName: "Werk Nord" },
      },
    });

    await lauf(p, anfrage);

    assert.ok(
      anfrage.session._locationCache,
      "Ohne echten Org-Wechsel darf der Standort-Cache nicht verworfen werden — sonst " +
        "verliert der Nutzer bei jeder Anfrage seine Standortwahl und sieht wieder org-weit"
    );
    assert.equal(anfrage.locationId, LOC_A);
    assert.equal(anfrage.locationScope, "active");
  });

  it("die Gegenrichtung: ein echter Org-Wechsel verwirft den Standort-Cache", async () => {
    const p = pool(
      { rows: [MITGLIED_A] }, // getMembership fuer ORG_A
      { rows: [] } // etwaige Standort-Aufloesung laeuft ins Leere
    );
    const anfrage = req({
      headers: { "x-org-id": ORG_A },
      session: {
        userId: USER,
        _orgCache: { orgId: ORG_B, role: "owner", name: "Andere GmbH", defaultLocationId: null },
        _locationCache: { locationId: LOC_A, locationName: "Werk Nord" },
      },
    });

    await lauf(p, anfrage);

    assert.equal(
      anfrage.session._locationCache,
      undefined,
      "Nach einem Org-Wechsel waere der alte Standort ein Standort der FREMDEN Organisation"
    );
  });
});
