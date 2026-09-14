/**
 * Welle N2.9 — die manuelle Einsatz-Anlage haengt nichts an Fremdes.
 *
 * BEFUND 2026-09-13: `POST /api/assignments` schrieb offer_id, supplier_org_id,
 * demand_request_id, deal_request_id, contract_id und requisition_id ungeprueft
 * in den Einsatz. Ein Kunde mit Anlagerecht konnte einen Einsatz an ein fremdes
 * Angebot oder eine beliebige Zeitarbeitsfirma haengen — er erschien in deren
 * Portal und zaehlte, einmal besetzt, gegen die freie Kopfzahl des fremden
 * Angebots. `PATCH` liess dasselbe fuer contract_id zu.
 *
 * Owner-Entscheid: Angebot und Deal nur ueber den Abschluss; alles Uebrige
 * gegen die eigene Org; die Zeitarbeitsfirma muss erklaerter Partner sein.
 *
 * Geprueft wird die WIRKUNG am Handler: Antwort UND ob der Einsatz geschrieben
 * wurde — ein 403 nach dem INSERT waere keiner. Dazu die Bindung der Org (sie
 * kommt aus der Sitzung, nicht aus dem Rumpf) und die Form der Partner-Abfrage,
 * weil ein Muster-Pool einen SQL-Text nie ausfuehrt.
 *
 * Run: node --test --test-force-exit test/einsatzAnlageVerweise.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAssignmentsRouter } from "../routes/assignments.js";
import { NUR_UEBER_DEAL } from "../services/assignmentService.js";
import { baseDeps, findHandlerExact, mockReq, mockRes } from "./helpers/security-mocks.js";

const ORG = "11111111-1111-4111-8111-111111111111";
const FREMD = "22222222-2222-4222-8222-222222222222";
// Mit Buchstaben: die Grossbuchstaben-Probe braucht etwas, das sich aendert.
const ZAF = "3abcdef3-3333-4333-8333-33333333abcd";
const ANDERE_ZAF = "44444444-4444-4444-8444-444444444444";
const ID = {
  angebot: "55555555-5555-4555-8555-555555555555",
  deal: "66666666-6666-4666-8666-666666666666",
  anforderung: "77777777-7777-4777-8777-777777777777",
  bedarf: "88888888-8888-4888-8888-888888888888",
  vertrag: "99999999-9999-4999-8999-999999999999",
  einsatz: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
};
const GRUND = { start_date: "2026-10-01" };

/*
 * Ein Pool, der jede Abfrage mitschreibt und nach Stichwort antwortet. Die
 * Welt ist ein Objekt: was darin fehlt, gibt es nicht (leere Zeilen).
 */
function welt({ anforderung = false, bedarf = false, vertrag = null, partner = false, bestand = null } = {}) {
  const calls = [];
  const query = async (sql, params = []) => {
    const text = String(sql);
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text.trim().toUpperCase())) return { rows: [], rowCount: 0 };
    calls.push({ sql: text, params });
    const leer = { rows: [], rowCount: 0 };
    if (/FROM requisitions WHERE id = \$1 AND org_id = \$2/.test(text)) return anforderung ? { rows: [{ "?column?": 1 }], rowCount: 1 } : leer;
    if (/FROM demand_requests d/.test(text)) return bedarf ? { rows: [{ "?column?": 1 }], rowCount: 1 } : leer;
    if (/FROM contracts WHERE id = \$1 AND buyer_org_id = \$2/.test(text)) return vertrag ? { rows: [vertrag], rowCount: 1 } : leer;
    if (/AS partner/.test(text)) return { rows: [{ partner }], rowCount: 1 };
    if (/INSERT INTO assignments/.test(text)) return { rows: [{ id: ID.einsatz, requisition_id: params[1], supplier_org_id: params[2] }], rowCount: 1 };
    if (/SELECT a\.\*, o\.name AS org_name/.test(text)) return bestand ? { rows: [bestand], rowCount: 1 } : leer;
    if (/UPDATE assignments SET/.test(text)) return { rows: [{ ...bestand, contract_id: params[params.length - 1] }], rowCount: 1 };
    return leer;
  };
  return { query, connect: async () => ({ query, release() {} }), calls };
}

const geschrieben = (pool) => pool.calls.some((c) => /INSERT INTO assignments/.test(c.sql));
const abfrage = (pool, muster) => pool.calls.find((c) => muster.test(c.sql));

async function anlegen(pool, body, reqExtra = {}) {
  const router = createAssignmentsRouter(baseDeps(pool));
  const handler = findHandlerExact(router, "post", "/assignments");
  const req = mockReq({ orgId: ORG, session: { userId: "u-1" }, body: { ...GRUND, ...body }, ...reqExtra });
  const res = mockRes();
  await handler(req, res);
  return res;
}

async function aendern(pool, body) {
  const router = createAssignmentsRouter(baseDeps(pool));
  const handler = findHandlerExact(router, "patch", "/assignments/:id");
  const req = mockReq({ orgId: ORG, session: { userId: "u-1" }, params: { id: ID.einsatz }, body });
  const res = mockRes();
  await handler(req, res);
  return res;
}

describe("N2.9 — Angebot und Deal nur ueber den Abschluss", () => {
  it("die Liste der gesperrten Felder ist genau Angebot und Deal", () => {
    assert.deepEqual([...NUR_UEBER_DEAL], ["offer_id", "deal_request_id"]);
    assert.ok(Object.isFrozen(NUR_UEBER_DEAL));
  });

  for (const [feld, wert] of [["offer_id", ID.angebot], ["deal_request_id", ID.deal]]) {
    it(`${feld}: 400 LINK_VIA_DEAL_ONLY, und der Einsatz wird NICHT geschrieben`, async () => {
      const pool = welt({ partner: true });
      const res = await anlegen(pool, { [feld]: wert });
      assert.equal(res._status, 400);
      assert.deepEqual(res._json, { error: "LINK_VIA_DEAL_ONLY", field: feld });
      assert.equal(geschrieben(pool), false, `${feld} darf keinen Einsatz erzeugen`);
    });
  }

  it("ohne Angebot und Deal ist die Anlage unveraendert moeglich (201, keine Verweis-Abfrage)", async () => {
    const pool = welt();
    const res = await anlegen(pool, { worker_description: "Lager" });
    assert.equal(res._status, 201);
    assert.equal(geschrieben(pool), true);
    for (const muster of [/FROM requisitions/, /FROM demand_requests/, /FROM contracts/, /AS partner/]) {
      assert.equal(abfrage(pool, muster), undefined, `ohne Verweis keine Abfrage ${muster}`);
    }
  });
});

describe("N2.9 — jeder eigene Verweis gegen die Org der Sitzung", () => {
  it("fremde Anforderung: 403 mit Feld, nichts geschrieben; gebunden an die Sitzungs-Org", async () => {
    const pool = welt({ anforderung: false });
    const res = await anlegen(pool, { requisition_id: ID.anforderung });
    assert.equal(res._status, 403);
    assert.deepEqual(res._json, { error: "ORG_BOUNDARY_VIOLATION", field: "requisition_id" });
    assert.equal(geschrieben(pool), false);
    assert.deepEqual(abfrage(pool, /FROM requisitions/).params, [ID.anforderung, ORG]);
  });

  it("eigene Anforderung: 201 und der Verweis steht im Einsatz", async () => {
    const pool = welt({ anforderung: true });
    const res = await anlegen(pool, { requisition_id: ID.anforderung });
    assert.equal(res._status, 201);
    assert.equal(abfrage(pool, /INSERT INTO assignments/).params[1], ID.anforderung);
  });

  it("fremder Bedarf: 403 mit Feld, nichts geschrieben", async () => {
    const pool = welt({ bedarf: false });
    const res = await anlegen(pool, { demand_request_id: ID.bedarf });
    assert.equal(res._status, 403);
    assert.deepEqual(res._json, { error: "ORG_BOUNDARY_VIOLATION", field: "demand_request_id" });
    assert.equal(geschrieben(pool), false);
  });

  it("Bedarf: Org ueber users.org_id ODER aktive Mitgliedschaft, beide an $2 gebunden", async () => {
    const pool = welt({ bedarf: true });
    const res = await anlegen(pool, { demand_request_id: ID.bedarf });
    assert.equal(res._status, 201);
    const q = abfrage(pool, /FROM demand_requests d/);
    assert.deepEqual(q.params, [ID.bedarf, ORG]);
    assert.match(q.sql, /JOIN users u ON u\.id = d\.requester_company_id/);
    assert.match(q.sql, /u\.org_id = \$2/);
    assert.match(q.sql, /om\.user_id = u\.id AND om\.org_id = \$2 AND om\.is_active = TRUE/);
  });

  it("die Org im Rumpf kann die Pruefung nicht umlenken (fremde org_id → 403 vor jeder Verweis-Abfrage)", async () => {
    const pool = welt({ anforderung: true, partner: true });
    const res = await anlegen(pool, { org_id: FREMD, requisition_id: ID.anforderung });
    assert.equal(res._status, 403);
    assert.equal(geschrieben(pool), false);
    assert.equal(abfrage(pool, /FROM requisitions/), undefined);
  });
});

describe("N2.9 — Vertrag und Zeitarbeitsfirma", () => {
  it("fremder Vertrag: 403 mit Feld, nichts geschrieben", async () => {
    const pool = welt({ vertrag: null });
    const res = await anlegen(pool, { contract_id: ID.vertrag });
    assert.equal(res._status, 403);
    assert.deepEqual(res._json, { error: "ORG_BOUNDARY_VIOLATION", field: "contract_id" });
    assert.equal(geschrieben(pool), false);
    assert.deepEqual(abfrage(pool, /FROM contracts WHERE id/).params, [ID.vertrag, ORG]);
  });

  it("eigener Vertrag mit ANDERER Zeitarbeitsfirma: 400 SUPPLIER_CONTRACT_MISMATCH", async () => {
    const pool = welt({ vertrag: { supplier_org_id: ANDERE_ZAF }, partner: true });
    const res = await anlegen(pool, { contract_id: ID.vertrag, supplier_org_id: ZAF });
    assert.equal(res._status, 400);
    assert.deepEqual(res._json, { error: "SUPPLIER_CONTRACT_MISMATCH", field: "supplier_org_id" });
    assert.equal(geschrieben(pool), false);
  });

  it("eigener Vertrag, passende Firma in Grossbuchstaben: kein Scheinwiderspruch (201)", async () => {
    const pool = welt({ vertrag: { supplier_org_id: ZAF }, partner: true });
    const gross = ZAF.toUpperCase();
    assert.notEqual(gross, ZAF, "die Probe braucht eine Kennung, die sich in Grossbuchstaben aendert");
    const res = await anlegen(pool, { contract_id: ID.vertrag, supplier_org_id: gross });
    assert.equal(res._status, 201);
    assert.equal(geschrieben(pool), true);
  });

  it("Zeitarbeitsfirma ohne Partnerschaft: 403 SUPPLIER_NOT_PARTNER, nichts geschrieben", async () => {
    const pool = welt({ partner: false });
    const res = await anlegen(pool, { supplier_org_id: ZAF });
    assert.equal(res._status, 403);
    assert.deepEqual(res._json, { error: "SUPPLIER_NOT_PARTNER", field: "supplier_org_id" });
    assert.equal(geschrieben(pool), false);
    assert.deepEqual(abfrage(pool, /AS partner/).params, [ORG, ZAF]);
  });

  it("ein unklares Partner-Ergebnis (null) ist KEIN Partner", async () => {
    const pool = welt({ partner: null });
    const res = await anlegen(pool, { supplier_org_id: ZAF });
    assert.equal(res._status, 403);
    assert.equal(geschrieben(pool), false);
  });

  it("Partner: 201 und die Firma steht im Einsatz", async () => {
    const pool = welt({ partner: true });
    const res = await anlegen(pool, { supplier_org_id: ZAF });
    assert.equal(res._status, 201);
    assert.equal(abfrage(pool, /INSERT INTO assignments/).params[2], ZAF);
  });

  it("die eigene Org als Lieferant braucht keine Partnerschaft (interne Besetzung)", async () => {
    const pool = welt({ partner: false });
    const res = await anlegen(pool, { supplier_org_id: ORG });
    assert.equal(res._status, 201);
    assert.equal(abfrage(pool, /AS partner/), undefined);
  });

  it("Partner heisst: Vendor-Pool aktiv/nicht gesperrt/nicht abgelaufen, aktiver Vertrag, oder Einsatz aus Deal", async () => {
    const pool = welt({ partner: true });
    await anlegen(pool, { supplier_org_id: ZAF });
    const sql = abfrage(pool, /AS partner/).sql.replace(/\s+/g, " ");
    for (const teil of [
      "vp.client_org_id = $1 AND vp.supplier_org_id = $2",
      "vp.status = 'active' AND vp.tier <> 'BLOCKED'",
      "(vp.valid_until IS NULL OR vp.valid_until >= CURRENT_DATE)",
      "c.buyer_org_id = $1 AND c.supplier_org_id = $2 AND c.status = 'active'",
      "a.org_id = $1 AND a.supplier_org_id = $2 AND a.offer_id IS NOT NULL"
    ]) {
      assert.ok(sql.includes(teil), `Partner-Abfrage ohne: ${teil}`);
    }
    // Die drei Wege sind ODER-verknuepft — ein UND verlangte alle drei zugleich.
    assert.equal((sql.match(/\) OR EXISTS \(/g) || []).length, 2);
  });

  it("ohne Org-Kontext: Verweise werden abgelehnt (400), nicht ungeprueft geschrieben", async () => {
    const pool = welt({ partner: true, anforderung: true });
    const res = await anlegen(pool, { supplier_org_id: ZAF }, { orgId: null });
    assert.equal(res._status, 400);
    assert.deepEqual(res._json, { error: "ORG_CONTEXT_REQUIRED", field: "supplier_org_id" });
    assert.equal(geschrieben(pool), false);
  });
});

describe("N2.9 — PATCH setzt keinen fremden Vertrag", () => {
  const bestand = { id: ID.einsatz, org_id: ORG, supplier_org_id: ZAF, status: "planned" };

  it("fremder Vertrag: 403, kein UPDATE", async () => {
    const pool = welt({ bestand, vertrag: null });
    const res = await aendern(pool, { contract_id: ID.vertrag });
    assert.equal(res._status, 403);
    assert.deepEqual(res._json, { error: "ORG_BOUNDARY_VIOLATION", field: "contract_id" });
    assert.equal(pool.calls.some((c) => /UPDATE assignments SET/.test(c.sql)), false);
    assert.deepEqual(abfrage(pool, /FROM contracts WHERE id/).params, [ID.vertrag, ORG]);
  });

  it("eigener Vertrag mit einer anderen Firma als der des Einsatzes: 400, kein UPDATE", async () => {
    const pool = welt({ bestand, vertrag: { supplier_org_id: ANDERE_ZAF } });
    const res = await aendern(pool, { contract_id: ID.vertrag });
    assert.equal(res._status, 400);
    assert.deepEqual(res._json, { error: "SUPPLIER_CONTRACT_MISMATCH", field: "contract_id" });
    assert.equal(pool.calls.some((c) => /UPDATE assignments SET/.test(c.sql)), false);
  });

  it("passender eigener Vertrag: 200 und das UPDATE traegt ihn", async () => {
    const pool = welt({ bestand, vertrag: { supplier_org_id: ZAF } });
    const res = await aendern(pool, { contract_id: ID.vertrag });
    assert.equal(res._status, 200);
    const update = abfrage(pool, /UPDATE assignments SET/);
    assert.ok(update, "das UPDATE muss laufen");
    assert.ok(update.params.includes(ID.vertrag));
  });

  it("PATCH ohne contract_id fragt keinen Vertrag ab", async () => {
    const pool = welt({ bestand });
    const res = await aendern(pool, { notes: "x" });
    assert.equal(res._status, 200);
    assert.equal(abfrage(pool, /FROM contracts/), undefined);
  });
});
