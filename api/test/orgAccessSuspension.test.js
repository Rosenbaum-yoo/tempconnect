/**
 * orgAccessSuspensionService — Betreiber-Kill-Switch (Phase 1, Mig 127).
 *
 * Service-Ebene mit Fake-Pool. Prueft die State-Machine (aktiv <-> suspended),
 * den atomaren WHERE-Guard (UPDATE rowCount), die Disambiguierung 0-Zeilen
 * (ORG_NOT_FOUND vs ALREADY_SUSPENDED/NOT_SUSPENDED), Eingabe-Validierung
 * (UUID, reason>=10), Kind-Normalisierung und die SQL-Parameter-Bindung.
 * RBAC (requireStaff) + Audit liegen auf der Route (staffControlCenter.js) und
 * werden dort getestet — hier liegt die Mutationslogik.
 *
 * Run: node --test --test-force-exit api/test/orgAccessSuspension.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  suspendOrgAccess, reactivateOrgAccess, meta, SUSPENSION_KINDS
} from "../services/orgAccessSuspensionService.js";

const ORG = "11111111-1111-1111-1111-111111111111";

function seqPool(...responses) {
  const calls = [];
  let i = 0;
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      const r = i < responses.length ? responses[i++] : { rowCount: 0, rows: [] };
      if (r instanceof Error) throw r;
      return r;
    }
  };
}

const suspendedRow = (over = {}) => ({
  id: ORG, name: "Acme GmbH", plan: "PRO", customer_stage: "live",
  access_suspended_at: "2026-06-05T10:00:00.000Z",
  access_suspended_reason: "Rechnung #123 seit 30 Tagen offen",
  access_suspended_kind: "non_payment",
  access_suspended_by: "staff-1",
  ...over
});

describe("orgAccessSuspensionService.suspendOrgAccess", () => {
  it("sperrt eine aktive Org -> ok:true, Zustand gemappt, EIN UPDATE", async () => {
    const pool = seqPool({ rowCount: 1, rows: [suspendedRow()] });
    const out = await suspendOrgAccess(pool, {
      orgId: ORG, actorUserId: "staff-1", reason: "Rechnung #123 seit 30 Tagen offen", kind: "non_payment"
    });
    assert.equal(out.ok, true);
    assert.equal(out.row.suspended, true);
    assert.equal(out.row.suspended_kind, "non_payment");
    assert.equal(out.row.suspended_by, "staff-1");
    assert.equal(pool.calls.length, 1, "Erfolg = genau ein UPDATE, kein Folge-SELECT");
  });

  it("bindet UPDATE-Parameter korrekt ($1 orgId, $2 reason, $3 actor, $4 kind)", async () => {
    const pool = seqPool({ rowCount: 1, rows: [suspendedRow()] });
    await suspendOrgAccess(pool, { orgId: ORG, actorUserId: "staff-7", reason: "Zahlung ausgeblieben, gesperrt", kind: "non_payment" });
    const { sql, params } = pool.calls[0];
    assert.match(sql, /UPDATE organizations/);
    assert.match(sql, /access_suspended_at\s*IS NULL/, "WHERE-Guard verhindert Double-Suspend");
    assert.equal(params[0], ORG);
    assert.equal(params[1], "Zahlung ausgeblieben, gesperrt");
    assert.equal(params[2], "staff-7");
    assert.equal(params[3], "non_payment");
  });

  it("normalisiert unbekannte kind -> 'manual'", async () => {
    const pool = seqPool({ rowCount: 1, rows: [suspendedRow({ access_suspended_kind: "manual" })] });
    await suspendOrgAccess(pool, { orgId: ORG, actorUserId: "s", reason: "Grund lang genug hier", kind: "totally_bogus" });
    assert.equal(pool.calls[0].params[3], "manual");
  });

  it("akzeptiert alle Whitelist-Arten unveraendert", async () => {
    for (const k of SUSPENSION_KINDS) {
      const pool = seqPool({ rowCount: 1, rows: [suspendedRow({ access_suspended_kind: k })] });
      await suspendOrgAccess(pool, { orgId: ORG, actorUserId: "s", reason: "Begruendung lang genug", kind: k });
      assert.equal(pool.calls[0].params[3], k);
    }
  });

  it("INVALID_ORG_ID bei kaputter UUID — KEINE DB-Query", async () => {
    const pool = seqPool();
    const out = await suspendOrgAccess(pool, { orgId: "nope", actorUserId: "s", reason: "Begruendung lang genug" });
    assert.equal(out.ok, false);
    assert.equal(out.error, "INVALID_ORG_ID");
    assert.equal(pool.calls.length, 0);
  });

  it("REASON_TOO_SHORT bei reason < 10 Zeichen — KEINE DB-Query", async () => {
    const pool = seqPool();
    const out = await suspendOrgAccess(pool, { orgId: ORG, actorUserId: "s", reason: "kurz" });
    assert.equal(out.ok, false);
    assert.equal(out.error, "REASON_TOO_SHORT");
    assert.equal(pool.calls.length, 0);
  });

  it("ALREADY_SUSPENDED wenn UPDATE 0 trifft und Org existiert + bereits gesperrt", async () => {
    const pool = seqPool(
      { rowCount: 0, rows: [] },                                  // UPDATE: kein Treffer (schon gesperrt)
      { rowCount: 1, rows: [{ access_suspended_at: "2026-06-01T00:00:00Z" }] } // SELECT: existiert
    );
    const out = await suspendOrgAccess(pool, { orgId: ORG, actorUserId: "s", reason: "Begruendung lang genug" });
    assert.equal(out.ok, false);
    assert.equal(out.error, "ALREADY_SUSPENDED");
    assert.equal(pool.calls.length, 2);
  });

  it("ORG_NOT_FOUND wenn UPDATE 0 trifft und Org nicht existiert", async () => {
    const pool = seqPool(
      { rowCount: 0, rows: [] },   // UPDATE
      { rowCount: 0, rows: [] }    // SELECT: nicht da
    );
    const out = await suspendOrgAccess(pool, { orgId: ORG, actorUserId: "s", reason: "Begruendung lang genug" });
    assert.equal(out.ok, false);
    assert.equal(out.error, "ORG_NOT_FOUND");
  });
});

describe("orgAccessSuspensionService.reactivateOrgAccess", () => {
  it("gibt eine gesperrte Org frei -> ok:true, EIN UPDATE", async () => {
    const pool = seqPool({ rowCount: 1, rows: [suspendedRow({ access_suspended_at: null, access_suspended_reason: null, access_suspended_kind: null, access_suspended_by: null })] });
    const out = await reactivateOrgAccess(pool, { orgId: ORG, reason: "Zahlung eingegangen, Freigabe" });
    assert.equal(out.ok, true);
    assert.equal(out.row.suspended, false);
    assert.equal(pool.calls.length, 1);
  });

  it("UPDATE-Guard verlangt access_suspended_at IS NOT NULL ($1 orgId)", async () => {
    const pool = seqPool({ rowCount: 1, rows: [suspendedRow({ access_suspended_at: null })] });
    await reactivateOrgAccess(pool, { orgId: ORG, reason: "Zahlung eingegangen, Freigabe" });
    const { sql, params } = pool.calls[0];
    assert.match(sql, /UPDATE organizations/);
    assert.match(sql, /access_suspended_at\s*IS NOT NULL/);
    assert.equal(params[0], ORG);
  });

  it("NOT_SUSPENDED wenn Org existiert aber nicht gesperrt war", async () => {
    const pool = seqPool(
      { rowCount: 0, rows: [] },
      { rowCount: 1, rows: [{ access_suspended_at: null }] }
    );
    const out = await reactivateOrgAccess(pool, { orgId: ORG, reason: "Freigabe-Begruendung lang" });
    assert.equal(out.ok, false);
    assert.equal(out.error, "NOT_SUSPENDED");
  });

  it("ORG_NOT_FOUND wenn Org nicht existiert", async () => {
    const pool = seqPool({ rowCount: 0, rows: [] }, { rowCount: 0, rows: [] });
    const out = await reactivateOrgAccess(pool, { orgId: ORG, reason: "Freigabe-Begruendung lang" });
    assert.equal(out.ok, false);
    assert.equal(out.error, "ORG_NOT_FOUND");
  });

  it("INVALID_ORG_ID / REASON_TOO_SHORT ohne DB-Query", async () => {
    const p1 = seqPool();
    assert.equal((await reactivateOrgAccess(p1, { orgId: "x", reason: "Freigabe-Begruendung lang" })).error, "INVALID_ORG_ID");
    assert.equal(p1.calls.length, 0);
    const p2 = seqPool();
    assert.equal((await reactivateOrgAccess(p2, { orgId: ORG, reason: "kurz" })).error, "REASON_TOO_SHORT");
    assert.equal(p2.calls.length, 0);
  });
});

describe("orgAccessSuspensionService.meta", () => {
  it("liefert Kind-Whitelist + Mindestlaenge der Begruendung", () => {
    const m = meta();
    assert.deepEqual(m.suspension_kinds, ["non_payment", "manual", "compliance", "security", "other"]);
    assert.equal(m.min_reason_len, 10);
  });
});
