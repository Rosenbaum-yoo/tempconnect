/**
 * Welle N3.0 / M5 Teil 1 — DIE MENGE STIMMT, UND DREI RIEGEL HALTEN.
 *
 * Owner-Entscheid 2026-09-19 ("Riegel zuerst, dann Korb, dann Sammelabschluss").
 *
 * BEFUNDE, die diese Welle schliesst:
 *   * M5.1 DREI Rechner fuer dieselben Spalten. Der Staffing-Rechner schrieb die
 *     Besetzung EINES Einsatzes in den Bedarf — bei zwei Zeitarbeitsfirmen loeschte
 *     die zweite Neuberechnung den Anteil der ersten; ausgeloest auch vom blossen
 *     Lesen einer Dealakte. Der Notdienst-Rechner zaehlte nur seine Zusagen und
 *     ueberschrieb damit die Angebote.
 *   * M5.2 Der Ueberfuellungs-Riegel stand NUR im Notdienst: auf dem Normalweg
 *     konnte ein Bedarf ueber 30 Plaetze zweimal 30 annehmen.
 *   * M5.3 `offered_quantity` blieb NULL, und die Deckung las NULL als "der ganze
 *     Bedarf" — ein Angebot ueber eine Kraft galt als volle Deckung.
 *   * M5.8 Ein Unternehmen konnte auf den EIGENEN Bedarf bieten und annehmen.
 *   * M5.9 `partial_fulfillment_allowed` war eine tote Spalte ("Alle 30 oder keiner").
 *
 * Geprueft an der Wirkung: welche Abfragen laufen, was gebunden wird, und ob
 * VOR dem Schreiben abgewiesen wird.
 *
 * Run: node --test --test-force-exit test/mengeUndRiegel.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as marktDienst from "../services/marketplaceService.js";
import * as notdienstZusagen from "../services/emergencyCommitmentService.js";
import * as besetzung from "../services/assignmentStaffingService.js";

const BEDARF = "11111111-1111-4111-8111-111111111111";
const ANGEBOT = "22222222-2222-4222-8222-222222222222";
const KUNDE = "33333333-3333-4333-8333-333333333333";
const FIRMA = "44444444-4444-4444-8444-444444444444";

const TX = new Set(["BEGIN", "COMMIT", "ROLLBACK"]);
function pool(regeln = []) {
  const calls = [];
  const query = async (sql, params = []) => {
    const text = String(sql);
    if (TX.has(text.trim().toUpperCase())) return { rows: [], rowCount: 0 };
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
    calls, query, connect: async () => ({ query, release() {} }),
    finde: (teil) => calls.filter((c) => (teil instanceof RegExp ? teil.test(c.sql) : c.sql.includes(teil)))
  };
}

/** Die kanonische Deckungsabfrage — sie traegt alle drei Quellen. */
const deckungsAbfrage = (p) => p.finde("dr.id AS demand_request_id")[0];

/**
 * Ein Bedarf mit N Plaetzen, von denen `gedeckt` schon zugesagt sind, und ein
 * Angebot, das `menge` Plaetze anbietet.
 */
function welt({ plaetze = 4, gedeckt = 0, menge = 2, ueberfuellung = false, teilerfuellung = true,
  besteller = KUNDE, anbieter = FIRMA } = {}) {
  const angebot = {
    id: ANGEBOT, status: "sent", supplier_company_id: anbieter, requester_company_id: besteller,
    demand_request_id: BEDARF, offered_quantity: menge
  };
  const bedarf = {
    id: BEDARF, status: gedeckt > 0 ? "partially_covered" : "open", headcount: plaetze,
    required_total_count: plaetze, currently_committed_count: gedeckt,
    remaining_open_count: Math.max(plaetze - gedeckt, 0),
    overfill_allowed: ueberfuellung, partial_fulfillment_allowed: teilerfuellung
  };
  let angenommen = false;
  return pool([
    ["FROM offers o", [angebot]],
    [(s) => s.includes("UPDATE offers SET status"), () => { angenommen = true; return [{ ...angebot, status: "accepted" }]; }],
    ["dr.id AS demand_request_id", () => [{
      demand_request_id: BEDARF, required_total_count: plaetze,
      committed_headcount: angenommen ? gedeckt + menge : gedeckt,
      active_offer_count: angenommen ? 1 : 0, is_capacity_origin: false
    }]],
    ["UPDATE demand_requests", (_s, params) => [{ ...bedarf, status: params[1], currently_committed_count: params[3], remaining_open_count: params[4] }]],
    ["FROM demand_requests", [bedarf]]
  ]);
}

describe("N3.0 · der EINE Restmengen-Rechner", () => {
  it("zaehlt drei Quellen — und jede genau einmal", async () => {
    const p = pool();
    await marktDienst.getDemandCommercialStates(p, [BEDARF]);
    const q = deckungsAbfrage(p);
    assert.ok(q, "die Deckung wurde gar nicht gerechnet");
    const sql = q.sql.replace(/\s+/g, " ");
    assert.deepEqual(q.params, [[BEDARF]]);
    assert.ok(sql.includes("FROM offers ang"), "die angenommenen Angebote fehlen");
    assert.ok(sql.includes("ang.status = 'accepted'"), "auch nicht angenommene Angebote zaehlen mit");
    assert.ok(sql.includes("FROM emergency_provider_commitments notd"), "die Notdienst-Zusagen fehlen");
    assert.ok(sql.includes("notd.agreement_offer_id IS NULL"),
      "eine Notdienst-Zusage, aus der ein Angebot wurde, wuerde doppelt zaehlen");
    assert.ok(sql.includes("FROM assignments eins"), "die Einsaetze ohne Angebot fehlen");
    /* Und die SUMME selbst: eine Quelle, die zwar verbunden, aber nicht addiert
       wird, faellt sonst nur mit Datenbank auf (gemessen bei der Rueckmutation). */
    assert.ok(sql.includes("(COALESCE(angebote.menge, 0) + COALESCE(notdienst.menge, 0) + COALESCE(einsaetze.menge, 0))"),
      "die Summe zaehlt nicht alle drei Quellen");
    assert.ok(sql.includes("eins.offer_id IS NULL"),
      "ein Einsatz aus einem Angebot wuerde doppelt zaehlen");
    assert.ok(sql.includes("eins.status NOT IN ('cancelled', 'completed')"),
      "stornierte oder beendete Einsaetze halten Plaetze besetzt");
  });

  it("die Notdienst-Zusage rechnet nicht mehr selbst — sie stoesst den einen Rechner an", async () => {
    const p = welt({ plaetze: 5, gedeckt: 1 });
    await notdienstZusagen._FUER_PROBEN.recalcDemandCoverage(p, BEDARF);
    assert.ok(deckungsAbfrage(p), "die kanonische Deckung wurde nicht gerechnet");
    assert.equal(p.finde("SELECT COALESCE(SUM(committed_quantity)").length, 0,
      "der Notdienst zaehlt weiterhin nur seine eigenen Zusagen");
  });

  it("die Besetzung eines Einsatzes schreibt die Deckung NICHT mehr aus einem Einsatz", async () => {
    /*
     * DER GEFAEHRLICHSTE DER DREI: er schrieb die Besetzung EINES Einsatzes in
     * den Bedarf. Zwei Zeitarbeitsfirmen an einem Bedarf — die zweite
     * Neuberechnung loeschte den Anteil der ersten. Hier steht die Besetzung
     * (0 Menschen zugeordnet) bewusst im Widerspruch zur kaufmaennischen
     * Deckung (3 aus einem angenommenen Angebot): geschrieben werden muss die 3.
     */
    const EINSATZ = { id: "asg-1", org_id: "org-k", supplier_org_id: "org-z", status: "active",
      requested_quantity: 3, worker_count: 3, filled_quantity: 0, reserved_quantity: 0, open_quantity: 3,
      staffing_status: "open", start_date: "2027-05-01", planned_end_date: "2027-05-31",
      demand_request_id: BEDARF, requisition_skill_tags: [], requisition_qualifications: [], demand_skill_tags: [] };
    const p = pool([
      ["LEFT JOIN organizations buyer", [EINSATZ]],
      ["SELECT 1 FROM assignments", [{ "?column?": 1 }]],
      ["FROM worker_profiles wp", [{
        user_id: "w-1", first_name: "Wanda", last_name: "Beispiel", city: "Münster",
        skill_tags: [], qualifications: [], is_active: true, verified_doc_names: [],
        open_invite_count: 0, historical_invite_count: 0, conflict_count: 0,
        reservation_conflict_count: 0, current_reservation_count: 0, verified_doc_count: 1,
        expired_doc_count: 0, active_assignment_count: 0, current_assignment_count: 0,
        same_client_assignment_count: 0, confirmed_assignment_count: 2
      }]],
      ["COALESCE(source_campaign_id, id)", [{ root_campaign_id: "root-1" }]],
      ["COALESCE(MAX(queue_rank)", [{ max_rank: 0 }]],
      ["INSERT INTO assignment_staffing_waitlist", [{ id: "wl-1", worker_user_id: "w-1", status: "queued", queue_rank: 1 }]],
      [(s) => s.includes("AS live_invite_quantity") || s.includes("AS filled_quantity"),
        [{ filled_quantity: 0, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }]],
      ["UPDATE assignments", [EINSATZ]],
      ["dr.id AS demand_request_id", [{ demand_request_id: BEDARF, required_total_count: 6,
        committed_headcount: 3, active_offer_count: 1, is_capacity_origin: false }]],
      ["UPDATE demand_requests", (_s, params) => [{ id: BEDARF, status: params[1],
        currently_committed_count: params[3], remaining_open_count: params[4] }]],
      ["FROM demand_requests", [{ id: BEDARF, status: "open", headcount: 6, required_total_count: 6,
        currently_committed_count: 0, remaining_open_count: 6 }]]
    ]);
    await besetzung.queueAssignmentWaitlistWorkers(p, {
      assignmentId: EINSATZ.id, supplierOrgId: EINSATZ.supplier_org_id, actorId: "dispo-1", workerUserIds: ["w-1"]
    });
    const schreiben = p.finde("UPDATE demand_requests");
    assert.equal(schreiben.length, 1, "der Bedarf wurde nicht genau einmal fortgeschrieben");
    assert.equal(schreiben[0].params.length, 5, "das ist nicht die kanonische Fortschreibung");
    assert.equal(schreiben[0].params[3], 3,
      `geschrieben wurde ${schreiben[0].params[3]} — die Besetzung dieses einen Einsatzes statt der Deckung des Bedarfs`);
    assert.equal(schreiben[0].params[4], 3, "die Restmenge passt nicht zur Deckung");
  });
});

describe("N3.0 · der Ueberfuellungs-Riegel gilt auch auf dem Normalweg", () => {
  it("mehr als offen ist: abgewiesen, und das Angebot bleibt unveraendert", async () => {
    const p = welt({ plaetze: 4, gedeckt: 3, menge: 2 });
    const r = await marktDienst.updateOfferStatus(p, ANGEBOT, "accepted", KUNDE);
    assert.equal(r.error, "OVERFILL_NOT_ALLOWED");
    assert.equal(r.remaining_open_count, 1);
    assert.equal(r.requested_headcount, 2);
    assert.equal(p.finde("UPDATE offers SET status").length, 0, "das Angebot wurde trotzdem angenommen");
    assert.equal(p.finde("UPDATE demand_requests").length, 0, "der Bedarf wurde trotzdem fortgeschrieben");
  });

  it("genau passend geht durch", async () => {
    const p = welt({ plaetze: 4, gedeckt: 2, menge: 2 });
    const r = await marktDienst.updateOfferStatus(p, ANGEBOT, "accepted", KUNDE);
    assert.equal(r.error, undefined, JSON.stringify(r));
    assert.equal(r.offer.status, "accepted");
  });

  it("wer Ueberfuellung ausdruecklich erlaubt, darf ueberfuellen", async () => {
    const p = welt({ plaetze: 4, gedeckt: 3, menge: 2, ueberfuellung: true });
    const r = await marktDienst.updateOfferStatus(p, ANGEBOT, "accepted", KUNDE);
    assert.equal(r.error, undefined, JSON.stringify(r));
  });

  it("der Bedarf wird dafuer gesperrt — sonst gewinnt bei zwei Annahmen der Zufall", async () => {
    const p = welt({ plaetze: 4, gedeckt: 0, menge: 2 });
    await marktDienst.updateOfferStatus(p, ANGEBOT, "accepted", KUNDE);
    const sperre = p.finde(/FROM demand_requests[\s\S]*FOR UPDATE/)[0];
    assert.ok(sperre, "der Bedarf wird beim Annehmen nicht gesperrt");
    assert.deepEqual(sperre.params, [BEDARF]);
  });
});

describe("N3.0 · 'Alle 30 oder keiner' wirkt", () => {
  it("Teilerfuellung ausgeschlossen: ein Angebot ueber weniger als den Rest wird abgewiesen", async () => {
    const p = welt({ plaetze: 4, gedeckt: 0, menge: 3, teilerfuellung: false });
    const r = await marktDienst.updateOfferStatus(p, ANGEBOT, "accepted", KUNDE);
    assert.equal(r.error, "PARTIAL_NOT_ALLOWED");
    assert.equal(r.remaining_open_count, 4);
    assert.equal(p.finde("UPDATE offers SET status").length, 0);
  });

  it("deckt es den Rest vollstaendig, geht es durch", async () => {
    const p = welt({ plaetze: 4, gedeckt: 0, menge: 4, teilerfuellung: false });
    const r = await marktDienst.updateOfferStatus(p, ANGEBOT, "accepted", KUNDE);
    assert.equal(r.error, undefined, JSON.stringify(r));
  });

  it("ohne Angabe bleibt Teilerfuellung erlaubt — der bisherige Weg", async () => {
    const p = welt({ plaetze: 4, gedeckt: 0, menge: 1, teilerfuellung: undefined });
    const r = await marktDienst.updateOfferStatus(p, ANGEBOT, "accepted", KUNDE);
    assert.equal(r.error, undefined, JSON.stringify(r));
  });
});

describe("N3.0 · niemand handelt mit sich selbst", () => {
  it("annehmen: wer Besteller UND Anbieter ist, wird abgewiesen — vor jeder Deckungsrechnung", async () => {
    const p = welt({ besteller: KUNDE, anbieter: KUNDE });
    const r = await marktDienst.updateOfferStatus(p, ANGEBOT, "accepted", KUNDE);
    assert.equal(r.error, "SELF_DEAL_FORBIDDEN");
    assert.equal(p.finde("UPDATE offers SET status").length, 0);
    assert.equal(deckungsAbfrage(p), undefined, "es wurde trotzdem gerechnet");
  });

  it("anbieten: auf den eigenen Bedarf gibt es kein Angebot", async () => {
    const p = pool([["SELECT requester_company_id FROM demand_requests", [{ requester_company_id: KUNDE }]]]);
    const r = await marktDienst.createOffer(p, KUNDE, BEDARF, { price_type: "hourly" });
    assert.equal(r.error, "SELF_DEAL_FORBIDDEN");
    assert.equal(p.finde("INSERT INTO offers").length, 0, "das Angebot wurde trotzdem geschrieben");
  });

  it("fuer eine fremde Firma bleibt der Weg offen — mit der Menge 1 als Vorgabe", async () => {
    const p = pool([
      ["SELECT requester_company_id FROM demand_requests", [{ requester_company_id: KUNDE }]],
      ["INSERT INTO offers", [{ id: ANGEBOT }]]
    ]);
    const r = await marktDienst.createOffer(p, FIRMA, BEDARF, { price_type: "hourly" });
    assert.equal(r.error, undefined);
    assert.equal(p.finde("INSERT INTO offers")[0].params[9], 1,
      "ohne Angabe gilt wieder 'der ganze Bedarf' statt einer Kraft");
  });
});
