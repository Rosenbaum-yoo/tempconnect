/**
 * DSGVO-Retention + Anonymisierung — Schema-Wahrheit (Ticket 2026-08-03).
 *
 * Hintergrund: getRetentionStatus/executeRetentionCleanup zielten auf
 * worker_invites.org_id, anonymizeUser auf created_by — beide Spalten
 * existieren nicht (Mig 029: supplier_org_id/invited_by). safeQuery schluckte
 * die Fehler still (Retention loeschte NIE), und in der Anonymisierung rollte
 * der Wurf die GESAMTE Art.-17-Loeschung zurueck. Zusaetzlich las der
 * Invite-Delete die E-Mail per Subquery NACH der users-Anonymisierung —
 * er traf also selbst mit korrekter Spalte nie.
 *
 * Zwei Schichten (Projekt-Disziplin):
 * 1. Mock: SQL-Form der ausgegebenen Queries (richtige Spalten, richtige
 *    Reihenfolge, praezises Session-Delete statt LIKE-Blob-Scan).
 * 2. DB-Smoke (skip ohne DB): die ECHTEN Retention-Queries laufen in einer
 *    zurueckgerollten Transaktion gegen das echte Schema — Postgres parst
 *    und plant sie voll; ein Spalten-Tippfehler wird sofort rot.
 *
 * Run: node --test --test-force-exit test/dataGovernanceRetention.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/dataGovernanceService.js";

function capturePool(responder) {
  const calls = [];
  const query = async (sql, params = []) => {
    calls.push({ sql, params });
    return responder ? responder(sql, params, calls.length) : { rows: [] };
  };
  return {
    calls,
    query,
    connect: async () => ({ query, release() {} })
  };
}

const ORG = "33333333-3333-3333-3333-333333333333";

describe("Retention — richtige Spalten (supplier_org_id)", () => {
  it("getRetentionStatus zaehlt ueber supplier_org_id, nie org_id", async () => {
    const pool = capturePool(() => ({ rows: [{ c: 0 }] }));
    await svc.getRetentionStatus(pool, ORG);
    const inviteSql = pool.calls.find((c) => c.sql.includes("worker_invites")).sql;
    assert.match(inviteSql, /supplier_org_id = \$1/);
    assert.doesNotMatch(inviteSql, /\borg_id\b/);
  });

  it("executeRetentionCleanup loescht ueber supplier_org_id, nie org_id", async () => {
    const pool = capturePool(() => ({ rows: [] }));
    const r = await svc.executeRetentionCleanup(pool, ORG, false);
    assert.equal(r.dry_run, false);
    const del = pool.calls.find((c) => c.sql.includes("DELETE FROM worker_invites")).sql;
    assert.match(del, /supplier_org_id = \$1/);
    assert.match(del, /90 days/);
    assert.doesNotMatch(del, /\borg_id\b/);
    // accepted bleibt IMMER stehen (Registriert-Signal fuer den Bulk-Invite-
    // Dedup) — geloescht wird nur, was tot ist.
    assert.match(del, /status IN \('expired','revoked'\) OR \(status = 'pending' AND expires_at < NOW\(\)\)/);
  });

  it("Status-Zaehlung nutzt DASSELBE Prädikat wie die Loeschung (ehrliches Dry-Run)", async () => {
    const pool = capturePool(() => ({ rows: [{ c: 0 }] }));
    await svc.getRetentionStatus(pool, ORG);
    const cnt = pool.calls.find((c) => c.sql.includes("worker_invites")).sql;
    assert.match(cnt, /status IN \('expired','revoked'\) OR \(status = 'pending' AND expires_at < NOW\(\)\)/);
  });
});

describe("anonymizeUser — Reihenfolge + Praezision", () => {
  function anonymizePool() {
    return capturePool((sql, _params, n) => {
      if (n <= 3) return { rows: [{ c: 0 }] };                       // canDeleteUser
      if (sql.includes("SELECT email FROM users")) return { rows: [{ email: "Original@Firma.de" }] };
      return { rows: [] };
    });
  }

  it("sichert die Original-E-Mail VOR dem users-UPDATE und loescht Invites damit", async () => {
    const pool = anonymizePool();
    const r = await svc.anonymizeUser(pool, "u1", "actor1");
    assert.equal(r.success, true);
    const sqls = pool.calls.map((c) => c.sql);
    const emailIdx = sqls.findIndex((s) => s.includes("SELECT email FROM users"));
    const usersUpdIdx = sqls.findIndex((s) => s.includes("UPDATE users SET email"));
    assert.ok(emailIdx >= 0 && emailIdx < usersUpdIdx, "E-Mail-Sicherung muss vor der Anonymisierung laufen");
    const inviteDel = pool.calls.find((c) => c.sql.includes("DELETE FROM worker_invites"));
    assert.match(inviteDel.sql, /LOWER\(email\) = LOWER\(\$1\)/);
    assert.equal(inviteDel.params[0], "Original@Firma.de", "geloescht wird ueber die ORIGINAL-Adresse");
    assert.doesNotMatch(inviteDel.sql, /created_by/, "created_by existiert nicht — rollte frueher alles zurueck");
  });

  it("Session-Delete nutzt den JSON-Pfad statt LIKE ueber den Blob (P5.1)", async () => {
    const pool = anonymizePool();
    await svc.anonymizeUser(pool, "u1", "actor1");
    const sessDel = pool.calls.find((c) => c.sql.includes("DELETE FROM session"));
    assert.match(sessDel.sql, /sess->>'userId' = \$1/);
    assert.doesNotMatch(sessDel.sql, /LIKE/);
    assert.equal(sessDel.params[0], "u1");
  });

  it("deleteWorkerData: E-Mail-Subquery ohne created_by, LOWER beidseitig", async () => {
    const pool = capturePool(() => ({ rows: [] }));
    await svc.deleteWorkerData(pool, "w1", "actor1");
    const inviteDel = pool.calls.find((c) => c.sql.includes("DELETE FROM worker_invites"));
    assert.match(inviteDel.sql, /LOWER\(email\) IN \(SELECT LOWER\(email\) FROM users/);
    assert.doesNotMatch(inviteDel.sql, /created_by/);
  });
});

/* ── Schicht 2: DB-Smoke gegen das echte Schema (zurueckgerollt) ─────────── */

const DATABASE_URL = process.env.DATABASE_URL || "";
const dbSuite = DATABASE_URL ? describe : describe.skip;

dbSuite("Retention — DB-Smoke (echte Queries, Transaktion, Rollback)", () => {
  it("alle Retention-SELECTs/DELETEs parsen gegen das echte Schema", async () => {
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      await client.query("BEGIN");
      // Facade: Service laeuft komplett in DIESER Transaktion
      const facade = { query: (sql, params) => client.query(sql, params) };
      const status = await svc.getRetentionStatus(facade, ORG);
      assert.equal(typeof status.expired_invites, "number");
      const result = await svc.executeRetentionCleanup(facade, ORG, false);
      assert.equal(result.dry_run, false);
      assert.equal(typeof result.deleted.deleted_invites, "number");
      // Waere irgendeine Query am Schema gescheitert, waere die Transaktion
      // abgebrochen — dieses SELECT wuerfe dann "current transaction is aborted".
      const probe = await client.query("SELECT 1 AS ok");
      assert.equal(probe.rows[0].ok, 1);
    } finally {
      try { await client.query("ROLLBACK"); } catch { /* noop */ }
      await client.end();
    }
  });
});
