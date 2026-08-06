/**
 * Zweiter Zustellweg der Einladung — Versand-Adapter (Mig 161).
 *
 * Die entscheidende Eigenschaft ist nicht, dass eine SMS rausgeht, sondern dass
 * ihr Ausbleiben NICHTS kaputt macht. Die E-Mail ist der verlaessliche Kanal, die
 * SMS die Zugabe. Eine Einladung, die scheitert, weil kein SMS-Anbieter
 * konfiguriert ist, waere eine Verschlechterung gegenueber vorher.
 *
 * Run: node --test --test-force-exit test/smsInviteDelivery.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sendSms, buildInviteSms } from "../services/smsService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(API_ROOT, "..");

const TWILIO_ECHT = {
  SMS_PROVIDER: "twilio",
  TWILIO_ACCOUNT_SID: "AC1234567890abcdef",
  TWILIO_AUTH_TOKEN: "echtes_token_1234567890",
  SMS_SENDER: "+4915112345678"
};

describe("sendSms — meldet ehrlich, statt zu werfen", () => {
  it("ohne Konfiguration: nicht gesendet, aber KEIN Fehler", async () => {
    const r = await sendSms({}, { phone: "+49 151 12345678", text: "Test" });
    assert.equal(r.sent, false);
    assert.equal(r.provider, "console");
    assert.equal(r.reason, "CONSOLE_ONLY");
  });

  it("ausdruecklich abgeschaltet: nicht gesendet, eigener Grund", async () => {
    const r = await sendSms({ SMS_PROVIDER: "disabled" }, { phone: "+4915112345678", text: "T" });
    assert.equal(r.sent, false);
    assert.equal(r.reason, "DISABLED");
  });

  it("Anbieter aktiv, aber keine Nummer: Grund NO_PHONE", async () => {
    const r = await sendSms(TWILIO_ECHT, { phone: null, text: "T" });
    assert.equal(r.sent, false);
    assert.equal(r.reason, "NO_PHONE");
  });

  it("Anbieter aktiv und Nummer da: NO_ADAPTER — ehrlich, statt still zu schweigen", async () => {
    const r = await sendSms(TWILIO_ECHT, { phone: "+49 151 12345678", text: "T" });
    assert.equal(r.sent, false);
    assert.equal(r.reason, "NO_ADAPTER",
      "solange kein Anbieter gewaehlt ist, gibt es bewusst keinen Netzaufruf");
  });

  it("wirft unter keinen Umstaenden — eine Einladung darf daran nicht scheitern", async () => {
    for (const cfg of [{}, TWILIO_ECHT, { SMS_PROVIDER: "brieftaube" }, null]) {
      for (const phone of [null, "", "123", "+49 151 12345678"]) {
        await assert.doesNotReject(() => sendSms(cfg || {}, { phone, text: "T" }));
      }
    }
  });
});

describe("buildInviteSms", () => {
  it("enthaelt Anrede, Link und Frist — mehr passt nicht in eine SMS", () => {
    const t = buildInviteSms({ firstName: "Ada", inviteUrl: "https://x.de/i?invite=abc" });
    assert.match(t, /Ada/);
    assert.match(t, /https:\/\/x\.de\/i\?invite=abc/);
    assert.match(t, /7 Tage/);
  });

  it("bleibt deutsch — die Sprache des Empfaengers ist beim Versand unbekannt", () => {
    const t = buildInviteSms({ firstName: "Ada", inviteUrl: "https://x.de" });
    assert.doesNotMatch(t, /invited|account|valid for/i);
  });

  it("nennt die einladende Firma, wenn bekannt", () => {
    const t = buildInviteSms({ firstName: "Ada", inviteUrl: "https://x.de", orgName: "StahlPro" });
    assert.match(t, /StahlPro/);
  });
});

describe("Verdrahtung in der Einladung", () => {
  const route = fs.readFileSync(path.join(API_ROOT, "routes/workers.js"), "utf8");

  it("die SMS laeuft NACH der E-Mail und bricht den Vorgang nicht ab", () => {
    const block = route.match(/router\.post\("\/worker-invites"[\s\S]*?res\.status\(201\)/);
    assert.ok(block, "Einladungs-Route nicht gefunden");
    assert.ok(block[0].indexOf("sendMail") < block[0].indexOf("smsService.sendSms"),
      "die verlaessliche E-Mail zuerst");
    assert.match(block[0], /catch \(smsErr\)/, "ein SMS-Fehler darf die Einladung nicht kippen");
  });

  it("die Nummer landet nicht im Klartext im Audit (S-2)", () => {
    const block = route.match(/action: "worker\.invite_sent"[\s\S]*?\};/);
    assert.ok(block, "Audit-Block nicht gefunden");
    assert.doesNotMatch(block[0], /invite\.phone/,
      "personenbezogene Nummer gehoert nicht ins Audit — nur ob der Weg griff");
    assert.match(block[0], /sms_sent/);
  });

  it("der Zeitstempel wird nur bei echtem Versand gesetzt", () => {
    assert.match(route, /if \(smsErgebnis\.sent\)[\s\S]{0,140}sms_sent_at = NOW\(\)/,
      "sonst liesse sich 'nicht versucht' nicht von 'fehlgeschlagen' unterscheiden");
  });
});

describe("Migration 161", () => {
  const sql = fs.readFileSync(
    path.join(REPO_ROOT, "sql/migrations/161_worker_invite_phone.sql"), "utf8"
  );

  it("nullable — ohne Nummer bleibt der Bestandsablauf unveraendert", () => {
    assert.match(sql, /ADD COLUMN IF NOT EXISTS phone TEXT/);
    assert.doesNotMatch(sql, /phone TEXT NOT NULL/);
  });

  it("haelt fest, ob der zweite Weg versucht wurde", () => {
    assert.match(sql, /sms_sent_at TIMESTAMPTZ/);
  });

  it("nennt einen Rollback-Weg", () => {
    assert.match(sql, /Rollback:/);
    assert.match(sql, /DROP COLUMN IF EXISTS phone/);
  });
});
