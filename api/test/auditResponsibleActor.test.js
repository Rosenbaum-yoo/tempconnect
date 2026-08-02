/**
 * Audit-Verantwortlichkeit — jede Mutation beantwortet „wer verantwortet das?"
 * (Audit-Backlog B-5 / S-3, CLAUDE.md Produktionspfeiler 5).
 *
 * Die Regel stand seit langem in CLAUDE.md, befolgt wurde sie an 7 von 319
 * `res.locals.audit`-Markierungen — dazu 98 direkte `writeAudit()`-Aufrufe, die an der
 * Middleware vorbeigehen. Eine Regel, die an rund 400 Stellen einzeln eingehalten werden
 * muss, wird nicht eingehalten. Deshalb sitzt sie jetzt in `writeAudit` selbst, dem einen
 * Punkt, durch den alles laeuft.
 *
 * Diese Tests halten drei Dinge fest:
 *   1. Der Verantwortliche steht in JEDER Zeile — auch wenn die Route nichts angibt.
 *   2. Gibt die Route ihn ausdruecklich an, gewinnt IHR Wert (Handelnder != Verantwortlicher).
 *   3. Ohne Mensch steht dort ausdruecklich `null` — unterscheidbar von „vergessen".
 *
 * Run: node --test --test-force-exit test/auditResponsibleActor.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  writeAudit, withResponsibleActor, writeAuditEnhanced, resolveAuditActor, withMachineActor
} from "../services/auditLog.js";

/** Pool-Attrappe, die die Parameter des INSERT festhaelt. */
function capturePool() {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql: String(sql), params });
      return { rows: [], rowCount: 1 };
    },
    /** Die `details`-Spalte ist Parameter 5 des INSERT. */
    lastDetails() {
      const p = calls[calls.length - 1]?.params;
      return p?.[4] ? JSON.parse(p[4]) : null;
    }
  };
}

const BASE = { action: "timesheet.approve", entity_type: "timesheet", entity_id: "ts-1" };

describe("writeAudit — Verantwortlichkeit steht in jeder Zeile", () => {
  it("ergaenzt den Verantwortlichen, wenn die Route nichts angibt", async () => {
    const pool = capturePool();
    await writeAudit(pool, { ...BASE, actor_id: "user-42" });
    assert.equal(pool.lastDetails().responsible_actor_user_id, "user-42");
  });

  it("ergaenzt ihn auch, wenn es ueberhaupt keine Details gibt", async () => {
    const pool = capturePool();
    await writeAudit(pool, { ...BASE, actor_id: "user-42", details: null });
    const details = pool.lastDetails();
    assert.ok(details, "Auch ohne Details muss eine details-Spalte geschrieben werden");
    assert.equal(details.responsible_actor_user_id, "user-42");
  });

  it("laesst die uebrigen Detaildaten unangetastet", async () => {
    const pool = capturePool();
    await writeAudit(pool, {
      ...BASE, actor_id: "user-42",
      details: { reason: "Woche vollstaendig", hours: 38.5 }
    });
    const details = pool.lastDetails();
    assert.equal(details.reason, "Woche vollstaendig");
    assert.equal(details.hours, 38.5);
    assert.equal(details.responsible_actor_user_id, "user-42");
  });

  it("der Wert der Route gewinnt — Handelnder und Verantwortlicher duerfen auseinanderfallen", async () => {
    // Der Fall: Support handelt im Auftrag eines Kunden. `actor_id` ist der Support-
    // Mitarbeiter, verantwortlich bleibt der Kunde. Wuerde der Wrapper ueberschreiben,
    // ginge genau diese Unterscheidung verloren.
    const pool = capturePool();
    await writeAudit(pool, {
      ...BASE, actor_id: "support-7",
      details: { responsible_actor_user_id: "kunde-99", channel: "support" }
    });
    const details = pool.lastDetails();
    assert.equal(details.responsible_actor_user_id, "kunde-99");
    assert.equal(pool.calls[0].params[0], "support-7", "actor_id bleibt der Handelnde");
  });

  it("Systemvorgaenge tragen ausdruecklich null — nicht gar nichts", async () => {
    // Cron, Webhook, Systemlauf: es gibt keinen verantwortlichen Menschen. Ein FEHLENDES
    // Feld waere mehrdeutig ("Systemvorgang" oder "vergessen?"), ein ausdrueckliches null
    // ist eindeutig.
    const pool = capturePool();
    await writeAudit(pool, { ...BASE, actor_id: null });
    const details = pool.lastDetails();
    assert.ok("responsible_actor_user_id" in details, "Der Schluessel muss vorhanden sein");
    assert.equal(details.responsible_actor_user_id, null);
  });

  it("ein ausdruecklich auf null gesetzter Wert wird nicht ueberschrieben", async () => {
    const pool = capturePool();
    await writeAudit(pool, { ...BASE, actor_id: "user-42", details: { responsible_actor_user_id: null } });
    assert.equal(pool.lastDetails().responsible_actor_user_id, null);
  });
});

describe("withResponsibleActor — Randfaelle ohne Datenverlust", () => {
  it("wirft ein Array nicht weg, um Platz fuer das Feld zu schaffen", () => {
    const arr = [{ a: 1 }];
    assert.deepEqual(withResponsibleActor(arr, "user-1"), arr);
  });

  it("laesst eine Zeichenkette unveraendert", () => {
    assert.equal(withResponsibleActor("nur ein Hinweis", "user-1"), "nur ein Hinweis");
  });

  it("veraendert das uebergebene Objekt nicht (kein Seiteneffekt beim Aufrufer)", () => {
    const original = { reason: "x" };
    const result = withResponsibleActor(original, "user-1");
    assert.equal(original.responsible_actor_user_id, undefined, "Das Original bleibt unberuehrt");
    assert.equal(result.responsible_actor_user_id, "user-1");
  });
});

/**
 * Maschinen-Auth (API-Key / M2M-JWT) — der zweite Weg, auf dem Mutationen entstehen.
 *
 * Bis hierher loesten beide Audit-Wege den Akteur nur aus `req.session.userId` auf. Ein
 * Request per API-Key hat keine Session: er schrieb `actor_id: null` und war damit von
 * einem Cron-/Systemlauf nicht zu unterscheiden — obwohl es sehr wohl einen
 * Verantwortlichen gibt (den Ersteller des Keys, `org_api_keys.created_by`).
 * Betroffen waren alle scope-faehigen Routen (workers, timesheets, requisitions, invoices,
 * assignments, capacityExchange, companyTimesheets), nicht nur SCIM.
 *
 * `resolveAuditActor` ist die eine Stelle, die das entscheidet — beide Wege benutzen sie.
 */
describe("Audit-Akteur bei Maschinen-Auth", () => {
  const apiKeyReq = (over = {}) => ({
    isApiKeyAuth: true, apiKeyId: "key-1", apiKeyOwnerUserId: "owner-1",
    orgId: "org-1", ip: "10.0.0.9", headers: { "user-agent": "Okta-SCIM/2.0" }, ...over
  });

  it("Session gewinnt und bleibt unveraendert — kein Maschinen-Kontext", () => {
    const { actor_id, machine } = resolveAuditActor({ session: { userId: "u-1" }, isApiKeyAuth: true });
    assert.equal(actor_id, "u-1");
    assert.equal(machine, null, "Session-Eintraege duerfen sich nicht veraendern");
  });

  it("API-Key → Verantwortlicher ist der Key-Ersteller", () => {
    const { actor_id, machine } = resolveAuditActor(apiKeyReq());
    assert.equal(actor_id, "owner-1");
    assert.equal(machine.actor_type, "api_key");
    assert.equal(machine.api_key_id, "key-1");
    assert.equal(machine.responsible_actor_unknown, undefined);
  });

  it("M2M-JWT wird als eigener actor_type gefuehrt", () => {
    assert.equal(resolveAuditActor(apiKeyReq({ isM2mToken: true })).machine.actor_type, "m2m_token");
  });

  it("Key-Ersteller geloescht → ausdruecklich als unbekannt markiert", () => {
    // Sonst waere der Eintrag (actor_id null) von einem echten Systemlauf nicht zu trennen.
    const { actor_id, machine } = resolveAuditActor(apiKeyReq({ apiKeyOwnerUserId: null }));
    assert.equal(actor_id, null);
    assert.equal(machine.actor_type, "api_key");
    assert.equal(machine.responsible_actor_unknown, true);
  });

  it("Weder Session noch Maschine → echter Systemvorgang (null, kein Kontext)", () => {
    const { actor_id, machine } = resolveAuditActor({});
    assert.equal(actor_id, null);
    assert.equal(machine, null);
  });

  it("withMachineActor laesst Details ohne Maschine unberuehrt", () => {
    const d = { reason: "x" };
    assert.deepEqual(withMachineActor(d, null), d);
    assert.equal(withMachineActor(null, null), null);
  });

  it("withMachineActor veraendert das Original nicht", () => {
    const original = { reason: "x" };
    const out = withMachineActor(original, { actor_type: "api_key" });
    assert.equal(original.actor_type, undefined);
    assert.equal(out.actor_type, "api_key");
    assert.equal(out.reason, "x");
  });

  it("writeAuditEnhanced schreibt Verantwortlichen + Maschinen-Kontext in einem Zug", async () => {
    const pool = capturePool();
    await writeAuditEnhanced(pool, apiKeyReq(), { ...BASE, details: { reason: "HR-Sync" } });
    const d = pool.lastDetails();
    assert.equal(d.responsible_actor_user_id, "owner-1");
    assert.equal(d.actor_type, "api_key");
    assert.equal(d.api_key_id, "key-1");
    assert.equal(d.reason, "HR-Sync", "fachliche Details bleiben erhalten");
    assert.equal(pool.calls[0].params[0], "owner-1", "actor_id-Spalte gefuellt");
    assert.equal(pool.calls[0].params[8], "org-1", "org_id-Spalte gefuellt");
  });

  it("ausdruecklicher actor_id des Aufrufers gewinnt weiterhin", async () => {
    const pool = capturePool();
    await writeAuditEnhanced(pool, apiKeyReq(), { ...BASE, actor_id: "support-7" });
    assert.equal(pool.lastDetails().responsible_actor_user_id, "support-7");
  });

  it("writeAuditEnhanced ohne Details erzeugt trotzdem den vollen Nachweis", async () => {
    const pool = capturePool();
    await writeAuditEnhanced(pool, apiKeyReq(), { ...BASE });
    const d = pool.lastDetails();
    assert.equal(d.responsible_actor_user_id, "owner-1");
    assert.equal(d.actor_type, "api_key");
  });
});
