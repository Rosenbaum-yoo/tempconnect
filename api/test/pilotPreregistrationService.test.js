/**
 * Pilot-Voranmeldung — Sicherheits-/Logik-Tests via Mock-Pool.
 * Run: node --test --test-force-exit test/pilotPreregistrationService.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createPrereg, confirmPrereg, getPublicCounts, setPreregStatus, SLOTS_PER_SIDE,
} from "../services/pilotPreregistrationService.js";

function capturePool(responder) {
  const calls = [];
  return { calls, query: async (sql, params) => { calls.push({ sql, params }); return responder ? responder(sql, params) : { rows: [] }; } };
}

const VALID = { side: "company", sector: "logistik", org_name: "Acme", contact_name: "Max", email: "Max@Acme.de" };

describe("Pilot-Voranmeldung", () => {
  it("createPrereg lehnt ungueltige Email / Seite / Pflichtfelder ab", async () => {
    const pool = capturePool(() => ({ rows: [{ id: "p1", status: "pending" }] }));
    await assert.rejects(() => createPrereg(pool, { ...VALID, email: "kaputt" }), /INVALID_EMAIL/);
    await assert.rejects(() => createPrereg(pool, { ...VALID, side: "worker" }), /INVALID_SIDE/);
    await assert.rejects(() => createPrereg(pool, { ...VALID, org_name: "" }), /MISSING_FIELDS/);
  });

  it("createPrereg speichert nur Token-Hash, normalisiert Email, default sector='andere'", async () => {
    let params = null;
    const pool = capturePool((sql, p) => { if (sql.includes("INSERT")) { params = p; return { rows: [{ id: "p1", status: "pending" }] }; } return { rows: [] }; });
    const { rawToken } = await createPrereg(pool, { ...VALID, sector: "quatsch" }, { ip: "1.2.3.4" });
    assert.ok(rawToken && rawToken.length > 20);
    // params: cohort, region, side, sector, org, contact, email, phone, size, einsatzort, cap, msg, ref, source, tokenHash, ip, ua
    assert.equal(params[6], "max@acme.de", "Email lowercased");
    assert.equal(params[3], "andere", "unbekannter Sektor -> 'andere'");
    assert.equal(params[14].length, 64, "Token als SHA-256-Hash");
    assert.notEqual(params[14], rawToken, "Klartext-Token nicht gespeichert");
  });

  it("createPrereg: Duplikat (unique email+cohort) -> ALREADY_REGISTERED", async () => {
    const pool = capturePool((sql) => { if (sql.includes("INSERT")) { const e = new Error("dup"); e.code = "23505"; throw e; } return { rows: [] }; });
    await assert.rejects(() => createPrereg(pool, VALID), /ALREADY_REGISTERED/);
  });

  it("confirmPrereg bestaetigt per Token-Hash (kein Klartext in der Query)", async () => {
    const pool = capturePool((sql, p) => ({ rows: p[0].length === 64 ? [{ id: "p1", side: "company", status: "confirmed" }] : [] }));
    const res = await confirmPrereg(pool, "rawtok");
    assert.equal(res.status, "confirmed");
    assert.match(pool.calls[0].sql, /THEN 'confirmed'/, "pending -> confirmed via CASE (idempotent)");
    assert.equal(pool.calls[0].params[0].length, 64);
  });

  it("getPublicCounts: 30 Plaetze je Seite, remaining = 30 - accepted", async () => {
    const pool = capturePool(() => ({ rows: [{ side: "company", accepted: "7" }, { side: "agency", accepted: "30" }] }));
    const c = await getPublicCounts(pool);
    assert.equal(c.slots_per_side, SLOTS_PER_SIDE);
    assert.equal(c.company.accepted, 7);
    assert.equal(c.company.remaining, 23);
    assert.equal(c.agency.remaining, 0, "ausgebucht -> 0, nie negativ");
  });

  it("setPreregStatus: validiert Status + NOT_FOUND", async () => {
    await assert.rejects(() => setPreregStatus(capturePool(), { id: "p1", status: "bogus" }), /INVALID_STATUS/);
    const empty = capturePool(() => ({ rows: [] }));
    await assert.rejects(() => setPreregStatus(empty, { id: "ghost", status: "accepted" }), /NOT_FOUND/);
  });
});
