import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createSupportRouter } from "../routes/support.js";

/*
 * `resend_verification` UND `resend_invite` AM FALL WAREN ATTRAPPEN.
 *
 * BEFUND (2026-08-22): Der vollstaendige Zweig lautete
 *
 *   } else if (action === "resend_verification" || action === "resend_invite") {
 *     await insertCaseEvent(client, currentRow.id, req.supportAgent.id, action, nowEventDetail);
 *     auditAction = action;
 *
 * Eine Zeitleisten-Zeile, ein Audit-Wort, `success: true`. Kein `sendMail`,
 * kein UPDATE, nicht einmal `updated_at`.
 *
 * Es war kein "Daten fehlen"-Fall: `createCaseBaseSelect` liefert
 * `reporter_user_id` und `reporter_email` direkt in `currentRow`.
 *
 * VERSCHAERFEND: Der EINZIGE POST der gesamten Support-Oberflaeche ging auf
 * diese Attrappe, waehrend die funktionierende Route `/support/user-actions`
 * gar keinen Aufrufer hatte. Ein Agent klickte, bekam eine Bestaetigung, und
 * der Kunde wartete weiter auf eine Mail, die nie kam.
 *
 * Owner-Entscheid 2026-08-23: echten Versand anschliessen.
 */

function baue({ reporterUserId = "r1", mailWirft = false } = {}) {
  const ablauf = [];
  const calls = [];
  const query = async (sql, params = []) => {
    const text = typeof sql === "string" ? sql : sql?.text ?? "";
    calls.push({ sql: text, params });
    ablauf.push("sql:" + text.trim().slice(0, 12));
    if (text.includes("FROM support_cases sc") && text.includes("LIMIT 1")) {
      return {
        rows: [{
          id: "case-1", case_number: "SC-1001", subject: "Login kaputt", description: "d",
          status: "open", priority: "normal", case_type: "general",
          queue_id: "q1", queue_name: "Allgemein", assigned_to_agent_id: null,
          reporter_user_id: reporterUserId, reporter_org_id: "o1",
          reporter_email: "kunde@x.test", is_escalated: false, escalation_target: null,
        }],
        rowCount: 1,
      };
    }
    if (/FROM users/.test(text)) return { rows: [{ email: "kunde@x.test" }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const pool = { calls, query, connect: async () => ({ query, release() {} }) };

  const mails = [];
  const sendMail = async (an, betreff, koerper) => {
    ablauf.push("mail");
    if (mailWirft) throw new Error("SMTP tot");
    mails.push({ an, betreff, koerper });
    return true;
  };
  return { pool, sendMail, mails, ablauf, calls };
}

function agent() {
  return {
    id: "agent-1", user_id: "u1", role: "internal_support_lead", scope: "internal",
    vendor_id: null, data_scope: "all", allowed_queues: [], allowed_case_types: [],
    allowed_actions: ["accept", "assign", "change_status", "change_priority", "add_note", "escalate", "resend_verification", "resend_invite", "close"],
    is_active: true, display_name: "Lead",
  };
}

async function fallAktion(action, umgebung = baue()) {
  const a = agent();
  const router = createSupportRouter({
    pool: umgebung.pool,
    logger: { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} },
    requireAuth: (_q, _s, n) => n(),
    supportRateLimit: (_q, _s, n) => n(),
    sendMail: umgebung.sendMail,
    config: { SUPPORT_OPS_ENABLED: true, BASE_URL: "https://x.test" },
  });
  const schicht = router.stack.find(
    (l) => l.route?.path === "/support/cases/:id/action" && l.route.methods.post
  );
  const handler = schicht.route.stack[schicht.route.stack.length - 1].handle;
  const res = {
    _status: 200, _json: null, locals: {},
    status(c) { this._status = c; return this; },
    json(j) { this._json = j; return this; },
    setHeader() { return this; }, set() { return this; }, send() { return this; }, end() { return this; },
  };
  await handler({
    session: { userId: a.user_id }, params: { id: "case-1" },
    body: { action, reason: "Der Kunde hat die Mail nicht erhalten." },
    query: {}, headers: {}, ip: "127.0.0.1", get: () => "",
    supportAgent: a, supportAllowedActions: a.allowed_actions,
    supportMaskingRules: { mask_email: false },
    supportFeatures: { user_lookup: true, org_lookup: true, knowledge_base: true, supervisor_view: true, audit_view: true, quality_metrics: true },
  }, res);
  return { status: res._status, json: res._json, ...umgebung };
}

describe("Versand am Fall — es wird wirklich gesendet", () => {
  it("`resend_invite` verschickt eine Mail an den Melder", async () => {
    const r = await fallAktion("resend_invite");
    assert.equal(r.status, 200);
    assert.equal(r.mails.length, 1,
      "Der Zweig schrieb frueher nur eine Zeitleisten-Zeile und antwortete `success: true` — " +
      "der Kunde wartete auf eine Mail, die nie kam.");
    assert.equal(r.mails[0].an, "kunde@x.test");
    assert.match(r.mails[0].betreff, /Einladung/);
  });

  it("die Antwort sagt, ob der Versand gelungen ist", async () => {
    const r = await fallAktion("resend_invite");
    assert.equal(r.json?.versand?.ok, true,
      "`success: true` allein war genau das, was die Attrappe so lange unsichtbar gemacht hat.");
  });
});

describe("Versand am Fall — erst der Vorgang, dann die Mail", () => {
  /*
   * Eine verschickte Mail holt kein Rollback zurueck. Wuerde im Zweig gesendet
   * und die Transaktion scheiterte danach, haette der Kunde eine Mail zu einem
   * Vorgang, den es nicht gibt. Deshalb wird der Auftrag nur vermerkt und nach
   * dem COMMIT ausgefuehrt.
   */
  it("die Mail geht NACH dem COMMIT hinaus", async () => {
    const r = await fallAktion("resend_invite");
    const commit = r.ablauf.findIndex((s) => s.startsWith("sql:COMMIT"));
    const mail = r.ablauf.indexOf("mail");
    assert.ok(commit >= 0, "es muss committet werden");
    assert.ok(mail >= 0, "es muss gesendet werden");
    assert.ok(mail > commit,
      `Die Mail ging VOR dem COMMIT hinaus (Mail an ${mail}, COMMIT an ${commit}). ` +
      "Scheitert die Transaktion danach, haelt der Kunde eine Mail zu einem Vorgang, den es " +
      "nicht gibt — und niemand kann sie zurueckholen.");
  });

  it("ein gescheiterter Versand wirft den Vorgang NICHT um", async () => {
    const r = await fallAktion("resend_invite", baue({ mailWirft: true }));
    assert.equal(r.status, 200,
      "Der Vorgang steht bereits in der Datenbank; ein Versandfehler danach darf ihn nicht " +
      "umwerfen.");
    assert.ok(r.calls.some((c) => /COMMIT/.test(c.sql)), "committet wurde trotzdem");
    assert.ok(!r.calls.some((c) => /ROLLBACK/.test(c.sql)), "und nicht zurueckgerollt");
  });

  it("aber er wird gemeldet, statt als Erfolg durchzugehen", async () => {
    const r = await fallAktion("resend_invite", baue({ mailWirft: true }));
    assert.equal(r.json?.versand?.ok, false,
      "Der Agent muss es wissen, BEVOR er dem Kunden sagt, die Mail sei unterwegs.");
    assert.equal(r.json?.versand?.grund, "SEND_FAILED");
  });
});

describe("Versand am Fall — ohne Empfaenger wird gar nicht erst geschrieben", () => {
  it("ein Fall ohne Melder wird abgewiesen", async () => {
    const r = await fallAktion("resend_invite", baue({ reporterUserId: null }));
    assert.equal(r.status, 400);
    assert.equal(r.json?.error, "NO_REPORTER");
    assert.equal(r.mails.length, 0);
    assert.ok(r.calls.some((c) => /ROLLBACK/.test(c.sql)),
      "kein Zeitleisten-Eintrag fuer einen Versand, den es nicht geben kann");
  });
});

describe("Versand — ein Weg, nicht zwei", () => {
  /*
   * Bis 2026-08-23 gab es zwei Kopien desselben Vorgangs: `/support/user-actions`
   * versendete wirklich, der Fall-Zweig war die Attrappe — und die Oberflaeche
   * rief ausgerechnet die Attrappe auf. Zwei Kopien driften. Heute ist das an
   * drei weiteren Stellen dieses Repos passiert (Grund-Vokabular,
   * Sichtbarkeitsregel, Erstreaktionsgrenze).
   */
  const quelle = fs.readFileSync(new URL("../routes/support.js", import.meta.url), "utf8");

  it("beide Aufrufer gehen durch dieselbe Funktion", () => {
    const aufrufe = [ ...quelle.matchAll(/versendeAnNutzer\(/g) ];
    assert.ok(aufrufe.length >= 3,
      `nur ${aufrufe.length} Vorkommen von versendeAnNutzer (Definition + zwei Aufrufer erwartet)`);
  });

  it("es gibt nur EINE Stelle, die die Einladungsmail formuliert", () => {
    const stellen = [ ...quelle.matchAll(/TempConnect Einladung/g) ];
    assert.equal(stellen.length, 1,
      "Zwei Formulierungen derselben Mail sind zwei Texte, die auseinanderlaufen.");
  });

  it("es gibt nur EINE Stelle, die die Verifizierungsmail ausloest", () => {
    const stellen = [ ...quelle.matchAll(/resendVerificationForUser\(/g) ];
    assert.equal(stellen.length, 1,
      "sonst haengt an einem der beiden Wege irgendwann eine andere Vorlage");
  });

  it("die Attrappe ist wirklich weg", () => {
    /* Rueckmutation in Worten: der alte Zweig bestand aus genau zwei Zeilen
     * zwischen `else if` und dem naechsten `else if`. Wenn dort wieder kein
     * Versand steht, ist die Attrappe zurueck. */
    const zweig = quelle.match(/action === "resend_verification" \|\| action === "resend_invite"\)\s*\{[\s\S]*?\} else if/);
    assert.ok(zweig, "der Zweig wurde nicht gefunden — greift das Muster noch?");
    assert.match(zweig[0], /versandAuftrag = \{/,
      "Der Zweig muss einen Versandauftrag vermerken. Tut er es nicht, schreibt er wieder nur " +
      "eine Zeitleisten-Zeile und antwortet `success` — die Attrappe.");
  });
});
