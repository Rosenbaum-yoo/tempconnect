/**
 * Kunden-Sperre → Agentur wird benachrichtigt (Audit-Backlog C-9).
 *
 * Die beiden dokumentierten Fallen dieses Repos werden hier direkt geprueft:
 *   1. Ein `notifications.type` ohne Eintrag im CHECK-Constraint laesst den INSERT
 *      **still** scheitern — deshalb prueft ein Test, dass Migration 154 den Typ kennt.
 *   2. Empfaenger aus einer hartkodierten Rollenliste driften von der Rechte-Matrix weg —
 *      deshalb kommen sie aus `findOrgMembersWithPermission`.
 *
 * Run: node --test --test-force-exit test/workerBlockNotification.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { notifyWorkerBlockedToAgency } from "../services/workerNotificationService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_CWD = process.cwd();
const ROOT_LOCAL = path.resolve(__dirname, "..", "..");
const MIG = "sql/migrations/154_notification_type_worker_blocked.sql";
const ROOT = fs.existsSync(path.join(ROOT_CWD, MIG)) ? ROOT_CWD : ROOT_LOCAL;

function poolStub() {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql: String(sql), params });
      return { rows: [], rowCount: 1 };
    },
    inserts() { return calls.filter((c) => c.sql.includes("INSERT INTO notifications")); }
  };
}

describe("Kunden-Sperre — Benachrichtigung an die Agentur", () => {
  it("benachrichtigt jeden dispositionsberechtigten Empfaenger", async () => {
    const pool = poolStub();
    const out = await notifyWorkerBlockedToAgency(pool, ["u1", "u2"], "block-1", "Anna Muster", {
      companyName: "Klinik Nord", blockedUntil: "2026-09-30", reason: "Wiederholt zu spaet"
    });
    assert.equal(out.notified, 2);
    assert.equal(pool.inserts().length, 2);
  });

  it("nennt Unternehmen, Kraft, Frist und Grund — nicht nur 'es gibt Neuigkeiten'", async () => {
    const pool = poolStub();
    await notifyWorkerBlockedToAgency(pool, ["u1"], "block-1", "Anna Muster", {
      companyName: "Klinik Nord", blockedUntil: "2026-09-30", reason: "Wiederholt zu spaet"
    });
    const msg = pool.inserts()[0].params.find((p) => typeof p === "string" && p.includes("Klinik Nord"));
    assert.ok(msg, "Der Unternehmensname gehoert in die Nachricht");
    assert.match(msg, /Anna Muster/);
    assert.match(msg, /2026-09-30/);
    assert.match(msg, /Wiederholt zu spaet/);
  });

  it("sagt 'unbefristet', wenn kein Enddatum gesetzt ist", async () => {
    const pool = poolStub();
    await notifyWorkerBlockedToAgency(pool, ["u1"], "block-1", "Anna Muster", { companyName: "Klinik Nord" });
    const msg = pool.inserts()[0].params.find((p) => typeof p === "string" && p.includes("Klinik Nord"));
    assert.match(msg, /unbefristet/);
  });

  it("nutzt den Typ, den Migration 154 erlaubt", async () => {
    const pool = poolStub();
    await notifyWorkerBlockedToAgency(pool, ["u1"], "block-1", "Anna", {});
    assert.ok(pool.inserts()[0].params.includes("worker_blocked_by_company"));
  });

  it("verlinkt auf eine konkrete Seite statt ins Leere", async () => {
    const pool = poolStub();
    await notifyWorkerBlockedToAgency(pool, ["u1"], "block-1", "Anna", {});
    assert.ok(pool.inserts()[0].params.some((p) => typeof p === "string" && p.startsWith("/public/")));
  });

  it("tut nichts, wenn es niemanden zu benachrichtigen gibt", async () => {
    const pool = poolStub();
    assert.deepEqual(await notifyWorkerBlockedToAgency(pool, [], "b", "A", {}), { notified: 0 });
    assert.deepEqual(await notifyWorkerBlockedToAgency(pool, null, "b", "A", {}), { notified: 0 });
    assert.equal(pool.calls.length, 0);
  });
});

describe("Migration 154 — ohne CHECK-Eintrag verschwindet die Benachrichtigung still", () => {
  const sql = fs.readFileSync(path.join(ROOT, MIG), "utf8");

  it("nimmt den neuen Typ in den CHECK auf", () => {
    assert.match(sql, /'worker_blocked_by_company'/);
  });

  it("behaelt die bestehenden Typen — der CHECK wird ersetzt, nicht beschnitten", () => {
    for (const t of ["worker_complaint_filed", "requisition_approval", "deal_staffing_ready", "general", "system"]) {
      assert.ok(sql.includes(`'${t}'`), `Typ aus der Vorgaenger-Migration fehlt: ${t}`);
    }
  });

  it("setzt den Constraint idempotent neu", () => {
    assert.match(sql, /DROP CONSTRAINT IF EXISTS notifications_type_check/);
    assert.match(sql, /ADD CONSTRAINT notifications_type_check CHECK/);
  });
});

describe("Verdrahtung in der Sperr-Route", () => {
  const route = fs.readFileSync(path.join(ROOT, "api/routes/companyTimesheets.js"), "utf8");

  it("ruft die Benachrichtigung beim Sperren auf", () => {
    assert.match(route, /notifyWorkerBlockedToAgency/);
  });

  it("holt die Empfaenger aus der Rechte-Matrix, nicht aus einer Rollenliste", () => {
    assert.match(route, /findOrgMembersWithPermission\(pool, supplierOrgId, "worker\.manage"\)/);
  });

  it("laeuft fire-and-forget — eine Sperre darf daran nie scheitern", () => {
    assert.match(route, /catch\(swallow\("company\.blocklist\.notify"\)\)/);
  });
});
