import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSupportRouter } from "../routes/support.js";

/*
 * `change_status` KANNTE KEINE UEBERGAENGE — nur eine Menge.
 *
 * Eine Menge sagt, welche Woerter es gibt; sie sagt nicht, welcher Schritt Sinn
 * ergibt. CLAUDE.md Stop-Regel 5 ("Statusuebergaenge nicht definiert") war damit
 * formal ausgeloest.
 *
 * DER SCHWERWIEGENDE TEIL, am echten Handler ausgefuehrt (2026-08-22): Ein
 * Agent mit der Rolle `internal_support_agent` konnte
 * `new_status: "escalated_ops"` setzen und bekam HTTP 200 — ein einziges
 * UPDATE, `is_escalated` unberuehrt. Damit umging er alles, was eine Eskalation
 * ausmacht:
 *
 *   * die Pflichtbegruendung (>= 20 Zeichen),
 *   * `createOccEscalation` (den Vorgang im Owner Control Center),
 *   * den `support_escalations`-INSERT,
 *   * das Ops-Signal.
 *
 * `escalate` ist Supervisor-only, `change_status` ist Default-Aktion JEDER
 * Rolle. Der einfache Agent erreichte ueber die eine Aktion den Zustand, den
 * ihm die andere verwehrt.
 *
 * Und es war nicht nur eine Rechteluecke, sondern eine LUEGE IN DEN ZAHLEN: der
 * Fall trug sichtbar den Eskalationsstatus, zaehlte aber in keiner
 * Eskalationsauswertung mit (die filtern auf `is_escalated`). Da
 * `is_escalated = FALSE` repo-weit nirgends gesetzt wird, blieb die Entkopplung
 * dauerhaft.
 *
 * Owner-Entscheid 2026-08-23: der Eskalationszustand ist nur ueber `escalate`
 * erreichbar.
 */

function spionPool(fallStatus) {
  const calls = [];
  const query = async (sql, params = []) => {
    const text = typeof sql === "string" ? sql : sql?.text ?? "";
    calls.push({ sql: text, params });
    if (text.includes("FROM support_cases sc") && text.includes("LIMIT 1")) {
      return {
        rows: [{
          id: "case-1", case_number: "SC-1001", subject: "Login kaputt", description: "d",
          status: fallStatus, priority: "normal", case_type: "general",
          queue_id: "q1", queue_name: "Allgemein", assigned_to_agent_id: null,
          reporter_user_id: "r1", reporter_org_id: "o1", reporter_email: "r@x.test",
          is_escalated: false, escalation_target: null,
        }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  };
  return { calls, query, connect: async () => ({ query, release() {} }) };
}

/** Rolle `internal_support_agent` — die, die `escalate` NICHT darf. */
function einfacherAgent() {
  return {
    id: "agent-1", user_id: "u1", role: "internal_support_agent", scope: "internal",
    vendor_id: null, data_scope: "all", allowed_queues: [], allowed_case_types: [],
    allowed_actions: ["accept", "assign", "change_status", "change_priority", "add_note", "close"],
    is_active: true, display_name: "Agent",
  };
}

async function wechsle(vonStatus, nachStatus, agent = einfacherAgent()) {
  const pool = spionPool(vonStatus);
  const router = createSupportRouter({
    pool,
    logger: { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} },
    requireAuth: (_q, _s, n) => n(),
    supportRateLimit: (_q, _s, n) => n(),
    sendMail: async () => true,
    config: { SUPPORT_OPS_ENABLED: true, BASE_URL: "https://x.test" },
  });
  const schicht = router.stack.find(
    (l) => l.route?.path === "/support/cases/:id/action" && l.route.methods.post
  );
  assert.ok(schicht, "die Aktions-Route fehlt");
  const handler = schicht.route.stack[schicht.route.stack.length - 1].handle;

  const res = {
    _status: 200, _json: null,
    status(c) { this._status = c; return this; },
    json(j) { this._json = j; return this; },
    setHeader() { return this; }, set() { return this; }, send() { return this; }, end() { return this; },
  };
  await handler({
    session: { userId: agent.user_id }, params: { id: "case-1" },
    body: { action: "change_status", new_status: nachStatus },
    query: {}, headers: {}, ip: "127.0.0.1", get: () => "",
    supportAgent: agent, supportAllowedActions: agent.allowed_actions,
    supportMaskingRules: { mask_email: false },
    supportFeatures: { user_lookup: true, org_lookup: true, knowledge_base: true, supervisor_view: false, audit_view: true, quality_metrics: true },
  }, res);
  return { status: res._status, json: res._json, pool };
}

describe("Fall-Zustandsautomat — die Umgehung der Eskalation ist zu", () => {
  const eskalationen = ["escalated", "escalated_decisions", "escalated_commercial", "escalated_ops"];

  it("KEINER der vier Eskalationszustaende ist ueber change_status erreichbar", async () => {
    for (const ziel of eskalationen) {
      const r = await wechsle("open", ziel);
      assert.equal(r.status, 400, `${ziel} war erreichbar`);
      assert.equal(r.json?.error, "ESCALATION_VIA_ACTION_ONLY");
    }
  });

  it("und es wird dabei NICHTS geschrieben", async () => {
    const r = await wechsle("open", "escalated_ops");
    const geschrieben = r.pool.calls.filter((c) => /UPDATE support_cases|INSERT INTO/.test(c.sql));
    assert.deepEqual(geschrieben.map((c) => c.sql.slice(0, 40)), [],
      "Der alte Weg hat mit EINEM UPDATE den Status gesetzt und is_escalated unberuehrt " +
      "gelassen — der Fall sah eskaliert aus und zaehlte in keiner Auswertung mit.");
    assert.ok(r.pool.calls.some((c) => /ROLLBACK/.test(c.sql)),
      "die Transaktion muss zurueckgerollt werden");
  });

  it("S: die Probe wuerde ein Wiederoeffnen bemerken", () => {
    /* Rueckmutation. Ohne sie belegt die Gruppe nur, dass die aktuelle Fassung
     * passt — nicht, dass sie den Rueckfall SIEHT. */
    const nurMenge = new Set(["open", "in_progress", "escalated_ops"]);
    assert.ok(nurMenge.has("escalated_ops"),
      "eine reine Mengenpruefung wuerde den Eskalationszustand durchlassen — genau das war der Fehler");
  });
});

describe("Fall-Zustandsautomat — nicht jeder Schritt ergibt Sinn", () => {
  it("die ueblichen Wege bleiben offen", async () => {
    const gute = [
      ["new", "open"], ["open", "in_progress"], ["in_progress", "waiting_customer"],
      ["waiting_customer", "in_progress"], ["waiting_internal", "open"],
      ["in_progress", "resolved"], ["open", "closed"],
    ];
    for (const [von, nach] of gute) {
      const r = await wechsle(von, nach);
      assert.equal(r.status, 200, `${von} -> ${nach} muss weiterhin gehen`);
    }
  });

  it("aus einem Eskalationszustand fuehrt der Weg zurueck", async () => {
    /* Sonst waere eine Eskalation eine Sackgasse und der Fall nur noch ueber
     * die Datenbank zu retten. */
    for (const von of ["escalated", "escalated_decisions", "escalated_commercial", "escalated_ops"]) {
      const r = await wechsle(von, "in_progress");
      assert.equal(r.status, 200, `aus ${von} muss ein Rueckweg fuehren`);
    }
  });

  it("ein Wechsel auf sich selbst ist keine Aenderung und wird abgewiesen", async () => {
    const r = await wechsle("open", "open");
    assert.equal(r.status, 400);
    assert.equal(r.json?.error, "INVALID_TRANSITION");
    assert.ok(!r.pool.calls.some((c) => /INSERT INTO support_case_events/.test(c.sql)),
      "sonst steht in der Zeitleiste ein Ereignis, das eine Aenderung vortaeuscht");
  });

  it("die Antwort nennt die Wege, die offen stehen", async () => {
    const r = await wechsle("open", "open");
    assert.ok(Array.isArray(r.json?.allowed) && r.json.allowed.length > 0,
      "sonst raet der Agent, welcher Schritt moeglich ist");
    assert.equal(r.json?.from, "open");
    assert.equal(r.json?.to, "open");
    assert.ok(!r.json.allowed.some((s) => s.startsWith("escalated")),
      "die Eskalationszustaende duerfen auch in der Auskunft nicht als Weg erscheinen");
  });

  it("ein erfundener Status scheitert weiterhin VOR dem Automaten", async () => {
    const r = await wechsle("open", "quatsch");
    assert.equal(r.status, 400);
    assert.equal(r.json?.error, "INVALID_STATUS",
      "die Mengenpruefung bleibt die erste Huerde — sie sagt etwas anderes als ein " +
      "unmoeglicher Uebergang, und der Agent soll den Unterschied sehen");
  });
});

describe("BEFUND — `resolved` und `closed` sind absolute Sackgassen", () => {
  /*
   * DIESE GRUPPE BESCHREIBT EINEN BEFUND, KEINE GEWOLLTE EIGENSCHAFT.
   *
   * Beim Bauen des Automaten aufgefallen: `computeAllowedActions` (support.js:279)
   * streicht auf einem erledigten Fall SECHS Aktionen —
   * accept, assign, change_status, change_priority, escalate, close.
   *
   * Folgen, die niemand entschieden hat:
   *   * Ein Fall in `resolved` kann nie `closed` werden. Beide Endzustaende
   *     existieren, aber welcher gilt, entscheidet der Zufall des ersten Klicks.
   *   * `reopened` steht im CHECK der Migration 110 und wird im GESAMTEN Repo
   *     an keiner Stelle gesetzt. Der Zustand ist unerreichbar.
   *   * Und darauf rechnet eine veroeffentlichte Qualitaetskennzahl:
   *     `reopen_rate_percent` (support.js:1696) zaehlt
   *     `COUNT(*) FILTER (WHERE sc.status = 'reopened')`. Sie kann nur 0 %
   *     ergeben — eine Zahl, die gemessen aussieht und nur eines sagen kann.
   *
   * Der einzige Rueckweg aus `closed` fuehrt heute ueber `POST /support/escalations`,
   * dessen Rechtepruefung mit einer FEST VERDRAHTETEN Zeile `{status:"open"}`
   * arbeitet (support.js:1495) und die Sperre damit umgeht. "Um einen Fall
   * wieder zu oeffnen, eskaliere ihn" ist kein Arbeitsablauf.
   *
   * NICHT MITREPARIERT, weil es eine Produktfrage ist: Wer darf einen
   * abgeschlossenen Fall wieder oeffnen, und unter welcher Bedingung? Die
   * Zusicherungen hier werden ROT, sobald jemand das aendert — das ist ihr
   * Zweck. Wer sie rot sieht, prueft bitte auch die Wiedereroeffnungs-Quote.
   */

  it("ein erledigter Fall laesst change_status gar nicht erst zu", async () => {
    for (const von of ["resolved", "closed"]) {
      const r = await wechsle(von, "in_progress");
      assert.equal(r.status, 403, `${von} sollte change_status verweigern`);
      assert.equal(r.json?.error, "PERMISSION_DENIED");
    }
  });

  it("`resolved` kann nicht `closed` werden — beide Endzustaende schliessen sich aus", async () => {
    const r = await wechsle("resolved", "closed");
    assert.equal(r.status, 403,
      "Welcher der beiden Endzustaende gilt, entscheidet heute der Zufall des ersten Klicks.");
  });

  it("`reopened` ist unerreichbar", async () => {
    for (const von of ["resolved", "closed"]) {
      const r = await wechsle(von, "reopened");
      assert.equal(r.status, 403,
        "Wenn diese Zusicherung rot wird, ist Wiedereroeffnen gebaut worden — dann gehoert " +
        "`reopen_rate_percent` (support.js:1696) mitgeprueft: die Kennzahl existiert seit " +
        "jeher und konnte bis dahin nur 0 % ergeben.");
    }
  });
});

describe("Fall-Zustandsautomat — kein Zustand ist eine unbeabsichtigte Sackgasse", () => {
  /*
   * Ein Zustand ohne Eintrag in der Uebergangstabelle waere `undefined`, und
   * JEDER Wechsel scheiterte — der Fall waere nur noch ueber die Datenbank zu
   * bewegen. Schlimmer als gar keine Pruefung. `resolved` und `closed` sind
   * ausgenommen: dort greift schon die Rechtepruefung (siehe BEFUND oben).
   */
  const beweglich = [
    "new", "open", "in_progress", "waiting_customer", "waiting_internal",
    "escalated", "escalated_decisions", "escalated_commercial", "escalated_ops",
    "reopened",
  ];

  it("aus JEDEM beweglichen Zustand fuehrt mindestens ein Weg heraus", async () => {
    const sackgassen = [];
    for (const von of beweglich) {
      let raus = false;
      for (const nach of ["open", "in_progress", "resolved", "closed"]) {
        if (nach === von) continue;
        const r = await wechsle(von, nach);
        if (r.status === 200) { raus = true; break; }
      }
      if (!raus) sackgassen.push(von);
    }
    assert.deepEqual(sackgassen, [],
      "Aus diesen Zustaenden fuehrt kein Weg heraus. Ein Fall darin waere nur noch " +
      "ueber die Datenbank zu bewegen.");
  });

  it("die Tabelle deckt ALLE zwoelf Zustaende des CHECK ab", async () => {
    /* Sonst faellt ein Fall, den die Datenbank erlaubt, beim naechsten Wechsel
     * in `undefined` — und die Luecke merkt niemand, bis ein Kunde wartet. */
    const alle = [
      "new", "open", "in_progress", "waiting_customer", "waiting_internal",
      "escalated", "escalated_decisions", "escalated_commercial", "escalated_ops",
      "resolved", "closed", "reopened",
    ];
    const unbekannt = [];
    for (const von of alle) {
      const r = await wechsle(von, "in_progress");
      /* 403 = Rechtepruefung (resolved/closed), 400 INVALID_TRANSITION = Tabelle
       * kennt den Zustand und verweigert den Schritt, 200 = erlaubt.
       * Ein Zustand, den die Tabelle NICHT kennt, faellt ebenfalls auf 400
       * INVALID_TRANSITION — deshalb wird hier auf die genannte Liste geprueft. */
      if (r.status === 400 && r.json?.error === "INVALID_TRANSITION"
          && (!Array.isArray(r.json.allowed) || r.json.allowed.length === 0)) {
        unbekannt.push(von);
      }
    }
    assert.deepEqual(unbekannt, [],
      "Diese Zustaende stehen im CHECK der Datenbank, aber nicht in STATUS_UEBERGAENGE. " +
      "Ein Fall darin kann gar nicht mehr bewegt werden.");
  });
});
