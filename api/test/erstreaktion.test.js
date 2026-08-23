import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createSupportRouter } from "../routes/support.js";

/*
 * DIE ERSTREAKTIONSZEIT MASS "EIN AGENT HAT DEN FALL ANGEFASST".
 *
 * Ausgewiesen wurde sie als "Ø Erstreaktion" — und dem Kunden in seiner eigenen
 * Fallakte gezeigt (`supportIntakeService.js` liefert
 * `sla_first_responded_at` aus).
 *
 * BEFUND (2026-08-22): drei Schreibstellen, keine davon eine Antwort.
 *   * `accept`        — jemand nimmt den Fall an,
 *   * `change_status` — mit `$2 <> 'new'`, also stoppte schon das Verschieben
 *                       nach `waiting_internal` die Uhr,
 *   * `add_note`      — OHNE jede Unterscheidung nach Notiztyp; der Parameter
 *                       war nur `[currentRow.id]`.
 *
 * Der Code definiert selbst, was der Kunde sieht: `supportIntakeService.js`
 * filtert hart auf `note_type = 'external'`. Genau diese Grenze hat die Uhr
 * ignoriert — zwei von drei zulaessigen Notiztypen stoppten sie unsichtbar.
 *
 * Owner-Entscheid 2026-08-23: es zaehlt nur eine externe Notiz. Und die
 * Unbeantworteten bekommen eine eigene Zahl, weil `AVG()` NULL still
 * ueberspringt: ein nie beantworteter Fall verschlechtert den Mittelwert nicht,
 * er verschwindet aus ihm.
 */

function spionPool(fallStatus = "open") {
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

function agent() {
  return {
    id: "agent-1", user_id: "u1", role: "internal_support_lead", scope: "internal",
    vendor_id: null, data_scope: "all", allowed_queues: [], allowed_case_types: [],
    allowed_actions: ["accept", "assign", "change_status", "change_priority", "add_note", "escalate", "close"],
    is_active: true, display_name: "Lead",
  };
}

async function fuehreAus(body, fallStatus = "open") {
  const pool = spionPool(fallStatus);
  const a = agent();
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
  const handler = schicht.route.stack[schicht.route.stack.length - 1].handle;
  const res = {
    _status: 200, _json: null,
    status(c) { this._status = c; return this; },
    json(j) { this._json = j; return this; },
    setHeader() { return this; }, set() { return this; }, send() { return this; }, end() { return this; },
  };
  await handler({
    session: { userId: a.user_id }, params: { id: "case-1" }, body,
    query: {}, headers: {}, ip: "127.0.0.1", get: () => "",
    supportAgent: a, supportAllowedActions: a.allowed_actions,
    supportMaskingRules: { mask_email: false },
    supportFeatures: { user_lookup: true, org_lookup: true, knowledge_base: true, supervisor_view: true, audit_view: true, quality_metrics: true },
  }, res);
  return { status: res._status, json: res._json, pool };
}

/** Die UPDATEs auf support_cases, die die Uhr ueberhaupt anfassen. */
const uhrStellen = (pool) =>
  pool.calls.filter((c) => /UPDATE support_cases/.test(c.sql) && /sla_first_responded_at/.test(c.sql));

describe("Erstreaktion — nur eine echte Antwort stoppt die Uhr", () => {
  it("eine EXTERNE Notiz stoppt sie", async () => {
    const r = await fuehreAus({ action: "add_note", note: "Wir haben Ihr Konto entsperrt.", note_type: "external" });
    assert.equal(r.status, 200);
    const stellen = uhrStellen(r.pool);
    assert.equal(stellen.length, 1, "genau eine Stelle darf die Uhr anfassen");
    assert.ok(stellen[0].params.includes("external"),
      "der Notiztyp muss als Parameter in die Abfrage — sonst kann sie nicht unterscheiden");
    assert.match(stellen[0].sql, /WHEN \$2 = 'external' THEN COALESCE\(sla_first_responded_at, NOW\(\)\)/,
      "die Grenze gehoert ins SQL, nicht in eine JS-Bedingung davor — sonst geht sie beim " +
      "naechsten Umbau der Abfrage verloren");
  });

  it("eine INTERNE Notiz stoppt sie NICHT", async () => {
    const r = await fuehreAus({ action: "add_note", note: "Kollege prueft das Log.", note_type: "internal" });
    assert.equal(r.status, 200);
    const stellen = uhrStellen(r.pool);
    assert.equal(stellen.length, 1);
    assert.ok(stellen[0].params.includes("internal"),
      "die Abfrage laeuft, aber mit 'internal' — der CASE laesst die Spalte dann unberuehrt");
    assert.ok(!stellen[0].params.includes("external"));
  });

  it("eine SYSTEM-Notiz stoppt sie ebenfalls nicht", async () => {
    const r = await fuehreAus({ action: "add_note", note: "Automatischer Vermerk.", note_type: "system" });
    assert.equal(r.status, 200);
    assert.ok(uhrStellen(r.pool)[0].params.includes("system"));
  });

  it("`accept` fasst die Uhr NICHT mehr an", async () => {
    /* Jemand nimmt den Fall an — der Kunde merkt davon nichts. */
    const r = await fuehreAus({ action: "accept" });
    assert.equal(r.status, 200);
    assert.deepEqual(uhrStellen(r.pool), [],
      "Annehmen ist keine Antwort. Frueher stoppte es die Uhr, und die Kennzahl mass damit " +
      "'ein Agent hat geklickt'.");
  });

  it("`change_status` fasst die Uhr NICHT mehr an", async () => {
    const r = await fuehreAus({ action: "change_status", new_status: "waiting_internal" });
    assert.equal(r.status, 200);
    assert.deepEqual(uhrStellen(r.pool), [],
      "Das war die irrefuehrendste der drei Stellen: `$2 <> 'new'` hiess 'irgendein anderer " +
      "Zustand', also stoppte schon das Verschieben nach `waiting_internal` die Uhr — ein " +
      "Zustand, den der Kunde nie zu sehen bekommt.");
  });

  it("S: die Probe wuerde ein Zurueckfallen bemerken", () => {
    /* Rueckmutation. Die alte Fassung stempelte bedingungslos. */
    const alt = "SET updated_at = NOW(), sla_first_responded_at = COALESCE(sla_first_responded_at, NOW())";
    assert.ok(!/\$2 = 'external'/.test(alt),
      "die Probe wuerde die bedingungslose Fassung durchgehen lassen");
  });
});

describe("Erstreaktion — die Unbeantworteten verschwinden nicht mehr im Mittelwert", () => {
  /*
   * `AVG()` ueberspringt NULL still. Ein Fall, den nie jemand beantwortet hat,
   * verschlechtert die "Ø Erstreaktion" also nicht — er faellt aus ihr heraus.
   * Je schlechter der Support arbeitet, desto besser sieht die Zahl aus. Und
   * `close` schreibt die Spalte ohnehin nie: ein Fall kann ohne jede Antwort
   * geschlossen werden.
   */
  const quelle = fs.readFileSync(new URL("../routes/support.js", import.meta.url), "utf8");

  it("die Kennzahl zaehlt ueberfaellige Faelle ohne Antwort", () => {
    assert.match(quelle, /COUNT\(\*\) FILTER \(\s*\n?\s*WHERE sc\.sla_first_responded_at IS NULL\s*\n?\s*AND sc\.sla_first_response_deadline IS NOT NULL\s*\n?\s*AND sc\.sla_first_response_deadline < NOW\(\)\s*\n?\s*\)::int AS ohne_erstreaktion/,
      "Ohne diese Zahl misst der Mittelwert nur die Faelle, die jemand angefasst hat.");
  });

  it("und die, die ohne jede Antwort abgeschlossen wurden", () => {
    assert.match(quelle, /AND sc\.status IN \('resolved', 'closed'\)\s*\n?\s*\)::int AS ohne_erstreaktion_abgeschlossen/,
      "`close` schreibt sla_first_responded_at nie — ein Fall kann ohne Antwort enden, und " +
      "genau das darf keine Zahl verschweigen");
  });

  it("ein Fall, dessen Frist noch laeuft, gilt NICHT als unbeantwortet", () => {
    /* Sonst waere jeder frisch eingegangene Fall sofort ein Versaeumnis, und
     * die Zahl waere Laerm statt Signal. */
    assert.match(quelle, /sla_first_response_deadline < NOW\(\)/,
      "die Faelligkeit muss Teil der Bedingung sein");
    assert.match(quelle, /sla_first_response_deadline IS NOT NULL/,
      "wo keine Frist gesetzt ist, gilt der Fall als noch nicht faellig — nicht als versaeumt");
  });

  it("beide Zahlen gehen auch wirklich hinaus", () => {
    const antwort = quelle.match(/reopen_rate_percent: toNumber[\s\S]{0,600}?csat_score: null/);
    assert.ok(antwort, "die Antwort-Form der Kennzahlen wurde nicht gefunden");
    assert.match(antwort[0], /ohne_erstreaktion: toInt/,
      "eine Zahl, die nur im SQL steht, sieht niemand");
    assert.match(antwort[0], /ohne_erstreaktion_abgeschlossen: toInt/);
  });
});

describe("Erstreaktion — die Grenze stimmt mit der ueberein, die der Kunde sieht", () => {
  /*
   * DER EIGENTLICHE RIEGEL. Der Fehler war nicht, dass irgendeine Bedingung
   * fehlte — sondern dass ZWEI Stellen im selben Haus verschiedene Antworten
   * auf dieselbe Frage gaben: "Was bekommt der Kunde zu sehen?"
   */
  const support = fs.readFileSync(new URL("../routes/support.js", import.meta.url), "utf8");
  const eingang = fs.readFileSync(new URL("../services/supportIntakeService.js", import.meta.url), "utf8");

  it("die Kundensicht liefert nur externe Notizen", () => {
    assert.match(eingang, /note_type = 'external'/,
      "Wenn sich das aendert, gehoert die Uhr mitgeaendert — sonst driften beide wieder auseinander.");
  });

  it("und die Uhr stoppt bei genau demselben Notiztyp", () => {
    assert.match(support, /\$2 = 'external'/,
      "Die Uhr muss dieselbe Grenze ziehen wie die Kundensicht. Tut sie es nicht, misst " +
      "'Erstreaktion' wieder etwas, das der Kunde nie zu sehen bekommt.");
  });
});
