/**
 * Bulk-Worker-Einladungen (7c-Bonus) — set-based Dedup + Race-Sicherheit.
 *
 * Prueft die drei Wahrheiten des Slices:
 * 1. bulkCreateWorkerInvites: EINE Dedup-Query + EIN UNNEST-Insert (kein N+1),
 *    pending/accepted werden uebersprungen, In-Batch-Dubletten und Invalide
 *    gezaehlt, Cap 200, ON CONFLICT auf den partiellen Unique-Index (Mig 159).
 * 2. listWorkers liefert den Einladungs-Status je Zeile (LATERAL auf
 *    worker_invites) — Grundlage fuer das Listen-Badge.
 * 3. Import-Fix: createWorkerAccount(isVerified:false) schreibt FALSE —
 *    CSV-importierte Kraefte bleiben Einladungs-Kandidaten (der alte Hardcode
 *    TRUE machte sie fuer die gesamte Einladungs-Kette unsichtbar).
 *
 * Run: node --test --test-force-exit test/workerInviteBulk.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bulkCreateWorkerInvites, createWorkerAccount, listWorkers, BULK_INVITE_MAX } from "../services/workerService.js";

function capturePool(responder) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      return responder(sql, params, calls.length);
    },
    connect: async () => {
      const clientCalls = [];
      const client = {
        calls: clientCalls,
        query: async (sql, params) => {
          calls.push({ sql, params, client: true });
          return responder(sql, params, calls.length);
        },
        release() {}
      };
      return client;
    }
  };
}

const ORG = "org-1";
const item = (email, fn = "Max", ln = "M", pnr = null) => ({ email, first_name: fn, last_name: ln, personnel_number: pnr });

describe("bulkCreateWorkerInvites — set-based + Dedup", () => {
  it("2 Queries gesamt: Bestands-Dedup + UNNEST-Insert mit ON CONFLICT", async () => {
    const pool = capturePool((sql) => {
      if (sql.includes("SELECT LOWER(email)")) {
        return { rows: [
          { email: "offen@firma.de", status: "pending" },
          { email: "fertig@firma.de", status: "accepted" }
        ] };
      }
      if (sql.includes("INSERT INTO worker_invites")) {
        return { rows: [{ id: "i1", email: "neu@firma.de", first_name: "Neu", last_name: "N", token: "t", expires_at: "x", status: "pending" }] };
      }
      return { rows: [] };
    });
    const r = await bulkCreateWorkerInvites(pool, {
      supplierOrgId: ORG, invitedBy: "u1",
      items: [item("neu@firma.de", "Neu", "N"), item("OFFEN@firma.de", "O", "F"), item("fertig@firma.de", "F", "G")]
    });
    assert.equal(pool.calls.length, 2, "genau 2 Queries — kein N+1");
    assert.equal(r.invites.length, 1);
    assert.equal(r.skipped_pending, 1, "case-insensitiv gegen offenen Invite dedupliziert");
    assert.equal(r.skipped_accepted, 1);
    const ins = pool.calls[1];
    assert.match(ins.sql, /UNNEST\(/);
    assert.match(ins.sql, /ON CONFLICT \(supplier_org_id, LOWER\(email\)\) WHERE status = 'pending' DO NOTHING/,
      "Race-Sicherheit haengt am partiellen Unique-Index aus Mig 159");
    assert.deepEqual(ins.params[3], ["neu@firma.de"], "nur der nicht-deduplizierte Kandidat wird eingefuegt");
    assert.equal(ins.params[7].length, ins.params[8].length, "Token und Hash paarweise");
  });

  it("In-Batch-Dubletten, Invalide und Cap 200 werden gezaehlt statt verschluckt", async () => {
    const many = [];
    for (let i = 0; i < 205; i++) many.push(item(`w${i}@firma.de`));
    many.push(item("w0@firma.de"));            // In-Batch-Dublette
    many.push(item("keinemail", "A", "B"));    // invalid: keine E-Mail
    many.push(item("x@firma.de", "", "B"));    // invalid: Vorname fehlt
    const pool = capturePool((sql) => sql.includes("INSERT") ? { rows: [] } : { rows: [] });
    const r = await bulkCreateWorkerInvites(pool, { supplierOrgId: ORG, invitedBy: "u1", items: many });
    assert.equal(r.truncated, 5, "205 unique - 200 Cap = 5 abgeschnitten");
    assert.equal(r.invalid, 2);
    const ins = pool.calls.find((c) => c.sql.includes("INSERT INTO worker_invites"));
    assert.equal(ins.params[3].length, BULK_INVITE_MAX, "Insert respektiert die harte Obergrenze");
  });

  it("leere/ungueltige Eingabe: keine einzige Query", async () => {
    const pool = capturePool(() => ({ rows: [] }));
    const r = await bulkCreateWorkerInvites(pool, { supplierOrgId: ORG, invitedBy: "u1", items: [item("kaputt")] });
    assert.equal(pool.calls.length, 0);
    assert.deepEqual(r.invites, []);
    assert.equal(r.invalid, 1);
  });
});

describe("listWorkers — Einladungs-Status je Zeile (LATERAL)", () => {
  it("SQL joint worker_invites lateral und selektiert invite_status", async () => {
    const pool = capturePool(() => ({ rows: [] }));
    await listWorkers(pool, { supplierOrgId: ORG });
    const sql = pool.calls[0].sql;
    assert.match(sql, /LEFT JOIN LATERAL/);
    assert.match(sql, /wi\.supplier_org_id = wp\.supplier_org_id/, "Org-Boundary auch im Invite-Join");
    assert.match(sql, /LOWER\(wi\.email\) = LOWER\(u\.email\)/);
    assert.match(sql, /inv\.invite_status, inv\.invite_expires_at/);
  });
});

describe("createWorkerAccount — isVerified-Steuerung (Import-Fix)", () => {
  async function runWith(isVerified) {
    const pool = capturePool((sql) => {
      if (sql.includes("INSERT INTO users")) return { rows: [{ id: "u-new" }] };
      if (sql.includes("INSERT INTO worker_profiles")) return { rows: [{ id: "wp-new", user_id: "u-new" }] };
      return { rows: [] };
    });
    await createWorkerAccount(pool, {
      supplierOrgId: ORG, email: "a@b.de", firstName: "A", lastName: "B",
      passwordHash: "hash", ...(isVerified === undefined ? {} : { isVerified })
    });
    return pool.calls.find((c) => c.sql.includes("INSERT INTO users"));
  }

  it("Default bleibt TRUE (manueller Anlage-Pfad unveraendert)", async () => {
    const ins = await runWith(undefined);
    assert.equal(ins.params[2], true);
  });

  it("isVerified:false schreibt FALSE — Import-Kraefte bleiben einladbar", async () => {
    const ins = await runWith(false);
    assert.equal(ins.params[2], false);
  });
});
