/**
 * Org-Invitation-Service (Fixplan 3.3): Sicherheits- + Logik-Tests via Mock-Pool.
 * Run: node --test --test-force-exit test/orgInviteService.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createInvite, acceptInvite, revokeInvite, getInviteByToken } from "../services/orgInviteService.js";

function capturePool(responder) {
  const calls = [];
  return { calls, query: async (sql, params) => { calls.push({ sql, params }); return responder ? responder(sql, params) : { rows: [] }; } };
}

describe("orgInviteService — Sicherheit + Logik", () => {
  it("createInvite lehnt owner/worker ab (kein Privilege-Escalation per Invite)", async () => {
    const pool = capturePool(() => ({ rows: [] }));
    await assert.rejects(() => createInvite(pool, { orgId: "o1", email: "a@b.de", roleKey: "owner" }), /INVALID_ROLE/);
    await assert.rejects(() => createInvite(pool, { orgId: "o1", email: "a@b.de", roleKey: "worker" }), /INVALID_ROLE/);
  });

  it("createInvite lehnt ungueltige Email ab", async () => {
    const pool = capturePool(() => ({ rows: [] }));
    await assert.rejects(() => createInvite(pool, { orgId: "o1", email: "kaputt", roleKey: "member" }), /INVALID_EMAIL/);
  });

  it("createInvite lehnt bestehendes Mitglied ab (409)", async () => {
    const pool = capturePool((sql) => sql.includes("org_memberships") ? { rows: [{ "1": 1 }] } : { rows: [] });
    await assert.rejects(() => createInvite(pool, { orgId: "o1", email: "a@b.de", roleKey: "member" }), /ALREADY_MEMBER/);
  });

  it("createInvite speichert NUR den SHA-256-Token-Hash + normalisiert die Email", async () => {
    let insertedHash = null;
    const pool = capturePool((sql, params) => {
      if (sql.includes("org_memberships")) return { rows: [] };
      if (sql.includes("INSERT INTO org_invitations")) { insertedHash = params[3]; return { rows: [{ id: "i1", status: "pending" }] }; }
      return { rows: [] };
    });
    const { invite, rawToken } = await createInvite(pool, { orgId: "o1", email: "A@B.de", roleKey: "member", invitedBy: "u1" });
    assert.equal(invite.status, "pending");
    assert.ok(rawToken && rawToken.length > 20, "rawToken zurueckgegeben");
    assert.notEqual(insertedHash, rawToken, "Klartext-Token NICHT gespeichert");
    assert.equal(insertedHash.length, 64, "SHA-256 hex");
    const ins = pool.calls.find(c => c.sql.includes("INSERT INTO org_invitations"));
    assert.equal(ins.params[1], "a@b.de", "Email lowercased");
  });

  it("createInvite: doppelte offene Einladung -> 409", async () => {
    const pool = capturePool((sql) => {
      if (sql.includes("org_memberships")) return { rows: [] };
      if (sql.includes("INSERT INTO org_invitations")) { const e = new Error("dup"); e.code = "23505"; throw e; }
      return { rows: [] };
    });
    await assert.rejects(() => createInvite(pool, { orgId: "o1", email: "a@b.de", roleKey: "member" }), /INVITE_PENDING/);
  });

  it("acceptInvite verlangt Email-Match (403 sonst)", async () => {
    const client = { query: async (sql) => sql.includes("FOR UPDATE") ? { rows: [{ id: "i1", org_id: "o1", email: "a@b.de", role_key: "member" }] } : { rows: [] }, release: () => {} };
    const pool = { connect: async () => client };
    await assert.rejects(() => acceptInvite(pool, { rawToken: "tok", userId: "u9", userEmail: "wrong@x.de" }), /EMAIL_MISMATCH/);
  });

  it("acceptInvite legt Membership an + markiert accepted (bei Email-Match)", async () => {
    const calls = [];
    const client = { query: async (sql, params) => { calls.push({ sql, params }); return sql.includes("FOR UPDATE") ? { rows: [{ id: "i1", org_id: "o1", email: "a@b.de", role_key: "admin" }] } : { rows: [] }; }, release: () => {} };
    const pool = { connect: async () => client };
    const res = await acceptInvite(pool, { rawToken: "tok", userId: "u9", userEmail: "A@b.de" });
    assert.equal(res.org_id, "o1");
    assert.equal(res.role_key, "admin");
    assert.ok(calls.some(c => c.sql.includes("INSERT INTO org_memberships")), "membership angelegt");
    assert.ok(calls.some(c => c.sql.includes("status = 'accepted'")), "invite accepted");
  });

  it("getInviteByToken sucht per Hash (kein Klartext-Token in der Query)", async () => {
    const pool = capturePool((sql, params) => ({ rows: params[0].length === 64 ? [{ id: "i1", org_name: "Acme" }] : [] }));
    const res = await getInviteByToken(pool, "rawtok");
    assert.ok(res);
    assert.equal(pool.calls[0].params[0].length, 64);
  });

  it("revokeInvite betrifft nur offene Einladungen der eigenen Org", async () => {
    const pool = capturePool(() => ({ rows: [{ id: "i1" }] }));
    assert.equal(await revokeInvite(pool, { orgId: "o1", inviteId: "i1" }), true);
    assert.match(pool.calls[0].sql, /status = 'revoked'/);
    assert.match(pool.calls[0].sql, /org_id = \$2/);
  });
});
