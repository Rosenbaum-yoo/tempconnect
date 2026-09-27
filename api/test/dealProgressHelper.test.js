/**
 * Deal Progress Helper unit tests — pure logic, no DB required.
 * Tests: getNextAction mapping, getDealProgress with mock pool.
 *
 * Run: node --test --test-force-exit test/dealProgressHelper.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { getNextAction, getDealProgress } from "../services/dealProgressHelper.js";

// ─────────────────────────────────────────────────────────────
// getNextAction — pure status → next action mapping
// ─────────────────────────────────────────────────────────────

describe("getNextAction — active statuses", () => {
  it("CREATED requires requester to send offer", () => {
    const action = getNextAction("CREATED");
    assert.strictEqual(action.actor, "requester");
    assert.strictEqual(action.action, "send_offer");
    assert.ok(action.label.length > 0);
  });

  it("SENT requires receiver to respond", () => {
    const action = getNextAction("SENT");
    assert.strictEqual(action.actor, "receiver");
    assert.strictEqual(action.action, "respond");
  });

  it("OFFER_SENT requires requester to review offer", () => {
    const action = getNextAction("OFFER_SENT");
    assert.strictEqual(action.actor, "requester");
    assert.strictEqual(action.action, "review_offer");
  });

  it("ACCEPTED requires requester to confirm deal", () => {
    const action = getNextAction("ACCEPTED");
    assert.strictEqual(action.actor, "requester");
    assert.strictEqual(action.action, "confirm_deal");
  });

  it("CONFIRMED requires receiver to start assignment", () => {
    const action = getNextAction("CONFIRMED");
    assert.strictEqual(action.actor, "receiver");
    assert.strictEqual(action.action, "start_assignment");
  });

  it("FILLED requires requester to finalize", () => {
    const action = getNextAction("FILLED");
    assert.strictEqual(action.actor, "requester");
    assert.strictEqual(action.action, "finalize");
  });

  it("ASSIGNMENT_STARTED requires both to complete", () => {
    const action = getNextAction("ASSIGNMENT_STARTED");
    assert.strictEqual(action.actor, "both");
    assert.strictEqual(action.action, "complete");
  });
});

describe("getNextAction — terminal statuses", () => {
  for (const status of ["FINALIZED", "COMPLETED", "DECLINED", "CANCELED"]) {
    it(`${status} returns null (terminal)`, () => {
      assert.strictEqual(getNextAction(status), null);
    });
  }
});

describe("getNextAction — unknown status", () => {
  it("returns null for unknown status", () => {
    assert.strictEqual(getNextAction("NONEXISTENT"), null);
  });

  it("returns null for empty string", () => {
    assert.strictEqual(getNextAction(""), null);
  });
});

// ─────────────────────────────────────────────────────────────
// getDealProgress — with mock pool
// ─────────────────────────────────────────────────────────────

let _letzteZeitleistenAbfrage = null;

function mockPool(status, { notFound = false, transitionRows = [] } = {}) {
  _letzteZeitleistenAbfrage = null;
  return {
    query: async (sql, params) => {
      if (sql.includes("FROM requests")) {
        if (notFound) return { rows: [] };
        return {
          rows: [{
            id: params[0],
            status,
            requester_id: "user-req",
            receiver_id: "user-rec",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-15T00:00:00Z"
          }]
        };
      }
      /* Z3: die Zeitleiste kommt aus `audit_log`, nicht aus `state_transitions`
         (die Tabelle gab es nie). Reine Fixture-Pflege: der Schluessel folgt der
         geaenderten Quelle, die Zusicherungen darunter sind unberuehrt. */
      if (sql.includes("audit_log")) {
        _letzteZeitleistenAbfrage = { sql, params };
        return { rows: transitionRows };
      }
      return { rows: [] };
    }
  };
}

describe("getDealProgress — basic responses", () => {
  it("returns null for non-existent request", async () => {
    const pool = mockPool(null, { notFound: true });
    const result = await getDealProgress(pool, "nonexistent");
    assert.strictEqual(result, null);
  });

  it("returns correct progress for CREATED status", async () => {
    const pool = mockPool("CREATED");
    const result = await getDealProgress(pool, "deal-1");
    assert.strictEqual(result.status, "CREATED");
    assert.strictEqual(result.progress_pct, 10);
    assert.strictEqual(result.status_label, "Erstellt");
    assert.ok(result.next_action);
    assert.strictEqual(result.next_action.action, "send_offer");
    assert.strictEqual(result.requester_id, "user-req");
    assert.strictEqual(result.receiver_id, "user-rec");
  });

  it("returns 100% for COMPLETED", async () => {
    const pool = mockPool("COMPLETED");
    const result = await getDealProgress(pool, "deal-1");
    assert.strictEqual(result.progress_pct, 100);
    assert.strictEqual(result.next_action, null);
  });

  it("returns 0% for DECLINED", async () => {
    const pool = mockPool("DECLINED");
    const result = await getDealProgress(pool, "deal-1");
    assert.strictEqual(result.progress_pct, 0);
    assert.strictEqual(result.next_action, null);
  });

  it("returns 50% for ACCEPTED", async () => {
    const pool = mockPool("ACCEPTED");
    const result = await getDealProgress(pool, "deal-1");
    assert.strictEqual(result.progress_pct, 50);
  });

  it("returns 85% for ASSIGNMENT_STARTED", async () => {
    const pool = mockPool("ASSIGNMENT_STARTED");
    const result = await getDealProgress(pool, "deal-1");
    assert.strictEqual(result.progress_pct, 85);
  });
});

describe("getDealProgress — timeline", () => {
  it("includes transition timeline", async () => {
    const transitions = [
      { from_status: "CREATED", to_status: "OFFER_SENT", actor_id: "a1", created_at: "2025-01-02", details: {} },
      { from_status: "OFFER_SENT", to_status: "ACCEPTED", actor_id: "a2", created_at: "2025-01-03", details: {} }
    ];
    const pool = mockPool("ACCEPTED", { transitionRows: transitions });
    const result = await getDealProgress(pool, "deal-1");
    assert.strictEqual(result.timeline.length, 2);
    assert.strictEqual(result.timeline[0].to, "OFFER_SENT");
    assert.strictEqual(result.timeline[1].to, "ACCEPTED");
    assert.ok(result.timeline[0].label);
  });

  it("returns empty timeline on error (graceful fallback)", async () => {
    const pool = {
      query: async (sql) => {
        if (sql.includes("FROM requests")) {
          return { rows: [{ id: "d1", status: "CREATED", requester_id: "r", receiver_id: "s", created_at: new Date(), updated_at: new Date() }] };
        }
        throw new Error("state_transitions table missing");
      }
    };
    const result = await getDealProgress(pool, "d1");
    assert.ok(Array.isArray(result.timeline));
    assert.strictEqual(result.timeline.length, 0);
    /* Z3: DAS fehlte, und genau daran lag der Befund. Eine leere Zeitleiste und
       eine nicht ladbare sahen von aussen gleich aus - die Oberflaeche zeigte
       "es ist nichts passiert", wo "wir wissen es nicht" richtig gewesen waere. */
    assert.strictEqual(result.timeline_available, false,
      "der Fehlschlag ist von aussen nicht zu erkennen - dann ist die leere Zeitleiste eine falsche Auskunft");
  });

  it("Z3: gelingt die Abfrage, sagt die Antwort das auch", async () => {
    const pool = mockPool("ACCEPTED", { transitionRows: [] });
    const result = await getDealProgress(pool, "deal-1");
    assert.deepEqual(result.timeline, []);
    assert.strictEqual(result.timeline_available, true,
      "eine geglueckte, leere Zeitleiste wird als nicht verfuegbar gemeldet");
  });

  it("Z3: die Zeitleiste fragt das Audit-Log, entdoppelt und nennt die alte Tabelle nicht mehr", async () => {
    /* FORM- UND BINDUNGS-PROBE. Der Muster-Pool kann die Abfrage nicht
       AUSFUEHREN - genau deshalb ist der Befund lange unentdeckt geblieben.
       Ausgefuehrt wird sie in
       test/integration/dealZeitleisteKommtAn.flow.test.js. */
    const pool = mockPool("ACCEPTED", { transitionRows: [] });
    await getDealProgress(pool, "deal-77");
    const q = _letzteZeitleistenAbfrage;
    assert.ok(q, "es wurde ueberhaupt keine Zeitleisten-Abfrage gestellt");
    const sql = q.sql;
    assert.ok(sql.includes("FROM audit_log"), "die Zeitleiste liest nicht aus dem Audit-Log");
    assert.ok(sql.includes("entity_type = 'request'"),
      "der Filter nennt nicht den Wert, den stateMachine.logTransition wirklich schreibt (ENTITY_TYPE_MAP bildet DEAL auf request ab)");
    assert.equal(sql.includes("'DEAL'"), false,
      "der alte Filterwert ist zurueck - kein Schreiber hinterlaesst ihn, die Zeitleiste bliebe leer");
    assert.equal(sql.includes("state_transitions"), false,
      "die Abfrage nennt wieder eine Tabelle, die es nicht gibt");
    for (const teil of ["state_machine.transition", "request.status_change"]) {
      assert.ok(sql.includes(teil), "die Abfrage kennt den Schreiber " + teil + " nicht");
    }
    assert.ok(sql.includes("DISTINCT ON"),
      "ohne Entdopplung stuende jede Station doppelt: beide Schreiber protokollieren denselben Wechsel");
    assert.ok(sql.includes("(action = 'state_machine.transition') DESC"),
      "bei zwei Zeilen fuer denselben Wechsel bleibt nicht die des kanonischen Schreibers");
    assert.deepEqual(q.params, ["deal-77"],
      "die Abfrage ist nicht an die uebergebene Anfrage gebunden");
  });
});
