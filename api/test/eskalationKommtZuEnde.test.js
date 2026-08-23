import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createSupportRouter } from "../routes/support.js";

/*
 * EINE ESKALATION KONNTE NIE ZU ENDE KOMMEN.
 *
 * BEFUND (2026-08-22): Zwei INSERTs mit fest verdrahtetem `'pending'`,
 * repo-weit NULL `UPDATE` und NULL `DELETE` auf `support_escalations`, keine
 * Trigger, keine Rules. Die Spalten `resolved_at`, `resolution_note` und
 * `resolved_by_agent_id` existieren seit Migration 110 ohne Default — und ohne
 * einen einzigen Schreiber. Die einzige Oberflaeche war eine reine Anzeige
 * (`<td>{e.status}</td>`, kein Aktions-Knopf); es gab zwei GET und einen POST,
 * kein PATCH.
 *
 * Zwei Folgen, beide dauerhaft:
 *   * Im OCC zaehlte `occ/bootstrap.js` jede Eskalation als offen, solange der
 *     Fall offen war.
 *   * Im Staff CC filtert die Liste zwar auf `status IN ('pending',
 *     'acknowledged')` — nur konnte den Status nie jemand verlassen. Jede je
 *     erzeugte Eskalation blieb fuer immer stehen, und die
 *     Prioritaetssortierung schob die aeltesten toten Eintraege nach vorn.
 *
 * Owner-Entscheid 2026-08-23: der Supervisor darf abhaken, UND ein
 * Owner-Entscheid im OCC schlaegt automatisch durch — mit Vorrang fuer den OCC.
 */

function spionPool(eskalationsZeile = { id: "esk-1", case_id: "case-1", target: "ops", status: "resolved", related_occ_request_id: null }) {
  const calls = [];
  const query = async (sql, params = []) => {
    const text = typeof sql === "string" ? sql : sql?.text ?? "";
    calls.push({ sql: text, params });
    if (/UPDATE support_escalations/.test(text)) {
      return { rows: eskalationsZeile ? [eskalationsZeile] : [], rowCount: eskalationsZeile ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  };
  return { calls, query, connect: async () => ({ query, release() {} }) };
}

function agent(role) {
  return {
    id: "agent-1", user_id: "u1", role, scope: "internal",
    vendor_id: null, data_scope: "all", allowed_queues: [], allowed_case_types: [],
    allowed_actions: ["accept", "assign", "change_status", "change_priority", "add_note", "escalate", "close"],
    is_active: true, display_name: role,
  };
}

async function schliesse(body, role = "internal_support_lead", pool = spionPool()) {
  const a = agent(role);
  const router = createSupportRouter({
    pool,
    logger: { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} },
    requireAuth: (_q, _s, n) => n(),
    supportRateLimit: (_q, _s, n) => n(),
    sendMail: async () => true,
    config: { SUPPORT_OPS_ENABLED: true, BASE_URL: "https://x.test" },
  });
  const schicht = router.stack.find(
    (l) => l.route?.path === "/support/escalations/:id/resolve" && l.route.methods.post
  );
  assert.ok(schicht, "die Route /support/escalations/:id/resolve fehlt");
  const handler = schicht.route.stack[schicht.route.stack.length - 1].handle;
  const res = {
    _status: 200, _json: null, locals: {},
    status(c) { this._status = c; return this; },
    json(j) { this._json = j; return this; },
    setHeader() { return this; }, set() { return this; }, send() { return this; }, end() { return this; },
  };
  await handler({
    session: { userId: a.user_id }, params: { id: "esk-1" }, body,
    query: {}, headers: {}, ip: "127.0.0.1", get: () => "",
    supportAgent: a, supportAllowedActions: a.allowed_actions,
    supportMaskingRules: { mask_email: false },
    supportFeatures: { user_lookup: true, org_lookup: true, knowledge_base: true, supervisor_view: true, audit_view: true, quality_metrics: true },
  }, res);
  return { status: res._status, json: res._json, locals: res.locals, pool };
}

const gueltig = { status: "resolved", resolution_note: "Mit dem Kunden telefoniert, Preisrahmen angepasst." };

describe("Eskalation abschliessen — der Weg existiert ueberhaupt", () => {
  it("ein Supervisor kann abhaken", async () => {
    const r = await schliesse(gueltig);
    assert.equal(r.status, 200);
    const update = r.pool.calls.find((c) => /UPDATE support_escalations/.test(c.sql));
    assert.ok(update, "es muss wirklich geschrieben werden — vorher gab es repo-weit KEIN UPDATE");
    assert.ok(update.params.includes("resolved"));
    assert.match(update.sql, /resolved_by_agent_id = \$3::uuid/,
      "wer abgehakt hat, gehoert in die Zeile — die Spalte existiert seit Migration 110 ohne Schreiber");
    assert.match(update.sql, /resolved_at = NOW\(\)/);
  });

  it("ein einfacher Agent nicht", async () => {
    const r = await schliesse(gueltig, "internal_support_agent");
    assert.equal(r.status, 403);
    assert.equal(r.json?.error, "PERMISSION_DENIED");
    assert.equal(r.pool.calls.length, 0, "es darf nicht einmal gelesen werden");
  });

  it("nur die drei Abschlusszustaende sind erlaubt", async () => {
    for (const s of ["acknowledged", "resolved", "rejected"]) {
      const r = await schliesse({ ...gueltig, status: s });
      assert.equal(r.status, 200, `${s} muss gehen`);
    }
    for (const s of ["pending", "erfunden", ""]) {
      const r = await schliesse({ ...gueltig, status: s });
      assert.equal(r.status, 400, `${s} darf nicht gehen`);
      assert.equal(r.json?.error, "INVALID_STATUS");
    }
  });

  it("ohne Begruendung geht nichts", async () => {
    for (const notiz of [undefined, "", "zu kurz"]) {
      const r = await schliesse({ status: "resolved", resolution_note: notiz });
      assert.equal(r.status, 400);
      assert.equal(r.json?.error, "RESOLUTION_NOTE_REQUIRED",
        "Eine Eskalation abzuhaken ist eine Aussage darueber, was mit einem herausgehobenen " +
        "Vorgang geschehen ist. Ohne Begruendung ist sie eine leere Geste — dieselbe Schwelle " +
        "wie beim Eskalieren selbst.");
      assert.equal(r.pool.calls.length, 0);
    }
  });

  it("ein bereits abgeschlossener Vorgang wird nicht zweimal abgeschlossen", async () => {
    const r = await schliesse(gueltig, "internal_support_lead", spionPool(null));
    assert.equal(r.status, 404);
    assert.equal(r.json?.error, "NOT_FOUND_OR_ALREADY_CLOSED");
    const update = r.pool.calls.find((c) => /UPDATE support_escalations/.test(c.sql));
    assert.match(update.sql, /status IN \('pending', 'acknowledged'\)/,
      "Die Bedingung steht im WHERE: sonst ueberschriebe der zweite Klick die Begruendung " +
      "des ersten und verschoebe resolved_at.");
  });
});

describe("Eskalation abschliessen — der Fall bleibt ehrlich", () => {
  it("`is_escalated` wird NEU BERECHNET, nicht blind auf FALSE gesetzt", async () => {
    const r = await schliesse(gueltig);
    const fall = r.pool.calls.find((c) => /UPDATE support_cases/.test(c.sql));
    assert.ok(fall, "der Fall muss nachgezogen werden");
    assert.match(fall.sql, /is_escalated = EXISTS \(/,
      "Ein Fall mit ZWEI Eskalationen, von denen eine erledigt ist, ist nicht " +
      "'nicht mehr eskaliert'. `is_escalated = FALSE` waere hier eine zweite Luege " +
      "in denselben Zahlen.");
    assert.match(fall.sql, /se\.status IN \('pending', 'acknowledged'\)/);
  });

  it("der Verlauf des Falles haelt es fest", async () => {
    const r = await schliesse(gueltig);
    const ereignis = r.pool.calls.find((c) => /INSERT INTO support_case_events/.test(c.sql));
    assert.ok(ereignis, "ohne Ereignis steht im Verlauf nur, dass eskaliert wurde — nie, wie es ausging");
    assert.ok(ereignis.params.includes("escalation_resolved"));
  });

  it("und das Protokoll auch", async () => {
    const r = await schliesse(gueltig);
    assert.equal(r.locals.audit?.action, "support.escalation.resolved");
    assert.equal(r.locals.audit?.entity_type, "support_escalation");
  });
});

describe("Eskalation abschliessen — der OCC-Entscheid schlaegt durch", () => {
  /*
   * `support_escalations.related_occ_request_id` gab es seit jeher — die
   * Verbindung existierte, aber nur in EINE Richtung. Der Support legte den
   * OCC-Vorgang an; entschied der Owner ihn, erfuhr die Eskalation davon
   * nichts. Owner-Entscheid: OCC hat Vorrang.
   */
  const occ = fs.readFileSync(new URL("../routes/occ/decisionsRequests.js", import.meta.url), "utf8");

  it("der Entscheid schliesst die verknuepfte Eskalation", () => {
    assert.match(occ, /UPDATE support_escalations[\s\S]{0,400}?WHERE related_occ_request_id = \$1::uuid/,
      "Wer im OCC entscheidet, soll nicht zusaetzlich daran denken muessen, im Support " +
      "Center abzuhaken. Genau deshalb steht es dort und nicht als optionaler Nachtrag.");
  });

  it("aber ueberschreibt keine Arbeit, die schon getan ist", () => {
    const block = occ.match(/UPDATE support_escalations[\s\S]{0,500}?RETURNING id, case_id/);
    assert.ok(block, "der Block wurde nicht gefunden");
    assert.match(block[0], /status IN \('pending', 'acknowledged'\)/,
      "Ein Supervisor, der schon abgehakt hat, behaelt seine Begruendung. Vorrang heisst " +
      "nicht, vorhandene Arbeit zu ueberschreiben.");
  });

  it("eine Ablehnung im OCC wird auch als Ablehnung vermerkt", () => {
    assert.match(occ, /validation\.action === "reject" \? "rejected" : "resolved"/,
      "sonst stuende bei einer abgelehnten Anfrage 'resolved' in der Eskalation");
  });

  it("und der Fall wird mitgezogen", () => {
    assert.match(occ, /is_escalated = EXISTS \([\s\S]{0,300}?se\.status IN \('pending', 'acknowledged'\)/,
      "sonst traegt der Fall die Eskalation weiter, obwohl sie entschieden ist");
  });

  it("ein Fehler dabei laesst den Entscheid NICHT scheitern — aber nicht still", () => {
    /* Der OCC-Vorgang IST entschieden; die Eskalation ist die Nachwirkung. Ein
     * Fehler in der Nachwirkung darf den Entscheid nicht zurueckdrehen — er
     * darf aber auch nicht verschwinden. */
    assert.match(occ, /catch \(err\) \{[\s\S]{0,300}?OCC-Entscheid gefallen, aber die verknuepfte Support-Eskalation blieb offen/,
      "Fail-open mit Protokoll: die Entscheidung steht, das Problem ist sichtbar.");
  });
});
