/**
 * rbacService — Last-Owner-Schutz.
 *
 * Eine Org muss immer >= 1 aktiven Owner behalten. Demotion oder Deaktivierung
 * des EINZIGEN aktiven Owners muss mit LAST_OWNER (HTTP 409) scheitern; bei
 * mehreren Ownern bzw. Nicht-Owner-Zielen laeuft die Operation normal durch.
 *
 * DB-frei (Mock-Pool, der je nach SQL antwortet).
 *
 * Run: node --test --test-force-exit test/rbacLastOwner.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as rbac from "../services/rbacService.js";

// Mock-Pool: antwortet anhand der SQL-Form.
function makePool({ targetIsOwner = true, ownerCount = 1 } = {}) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/SELECT 1 FROM org_memberships/i.test(sql)) {
        return { rowCount: targetIsOwner ? 1 : 0, rows: targetIsOwner ? [{ ok: 1 }] : [] };
      }
      if (/COUNT\(\*\)::int AS n/i.test(sql)) {
        return { rows: [{ n: ownerCount }], rowCount: 1 };
      }
      if (/UPDATE org_memberships SET role_key/i.test(sql)) {
        return { rows: [{ id: "m1", role_key: params[2] }], rowCount: 1 };
      }
      if (/UPDATE org_memberships SET is_active = FALSE/i.test(sql)) {
        return { rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  };
}

const ranUpdate = (p) => p.calls.some((c) => /UPDATE org_memberships SET role_key/i.test(c.sql));
const ranDeactivate = (p) => p.calls.some((c) => /SET is_active = FALSE/i.test(c.sql));
const ranGuard = (p) => p.calls.some((c) => /SELECT 1 FROM org_memberships/i.test(c.sql));

describe("rbacService — Last-Owner-Schutz", () => {
  it("blockt Demotion des einzigen aktiven Owners (LAST_OWNER 409)", async () => {
    const pool = makePool({ targetIsOwner: true, ownerCount: 1 });
    await assert.rejects(
      () => rbac.updateMemberRole(pool, "org1", "u1", "admin"),
      (err) => err.code === "LAST_OWNER" && err.status === 409
    );
    assert.ok(!ranUpdate(pool), "UPDATE darf bei Block nicht ausgefuehrt werden");

    /*
     * MUTATION-KILL (Welle 1). `assertNotLastOwner` waehlt ueber
     * `const byId = !!target.membershipId` zwischen zwei Abfragen:
     *
     *     byId ? "... WHERE id = $1 ..." : "... WHERE user_id = $1 ..."
     *
     * Dreht ein Mutant dieses `!!` in ein `!`, sucht die Abfrage in der
     * FALSCHEN Spalte, findet nichts — und `if (!rowCount) return;`
     * ueberspringt den Schutz vollstaendig. Die letzte Eigentuemer-Rolle einer
     * Organisation liesse sich entfernen, die Firma bliebe ohne Administrator.
     *
     * Unbemerkt blieb das, weil der Mock auf /SELECT 1 FROM org_memberships/
     * trifft — das passt auf BEIDE Varianten, also war die Spalte egal. Genau
     * dieselbe Wurzel wie beim Standort-Fund: der Test prueft das Ergebnis,
     * nicht WELCHE Abfrage lief.
     */
    const guard = pool.calls.find((c) => /SELECT 1 FROM org_memberships/i.test(c.sql));
    assert.ok(/user_id = \$1/.test(guard.sql),
      "beim Ziel {userId} muss ueber user_id gesucht werden");
    assert.strictEqual(guard.params[0], "u1");
    assert.strictEqual(guard.params[1], "org1", "und org-gebunden");
  });

  it("erlaubt Demotion, wenn weitere aktive Owner existieren", async () => {
    const pool = makePool({ targetIsOwner: true, ownerCount: 2 });
    const res = await rbac.updateMemberRole(pool, "org1", "u1", "admin");
    assert.equal(res.role_key, "admin");
    assert.ok(ranUpdate(pool));
  });

  it("erlaubt Rollenwechsel eines Nicht-Owners unabhaengig von der Owner-Zahl", async () => {
    const pool = makePool({ targetIsOwner: false, ownerCount: 1 });
    const res = await rbac.updateMemberRole(pool, "org1", "u2", "finance");
    assert.equal(res.role_key, "finance");
    assert.ok(ranUpdate(pool));
  });

  it("Promotion ZU owner ueberspringt den Guard", async () => {
    const pool = makePool({ targetIsOwner: true, ownerCount: 1 });
    const res = await rbac.updateMemberRole(pool, "org1", "u1", "owner");
    assert.equal(res.role_key, "owner");
    assert.ok(!ranGuard(pool), "Guard-Query darf bei Promotion zu owner nicht laufen");
  });

  it("blockt Deaktivierung des einzigen aktiven Owners", async () => {
    const pool = makePool({ targetIsOwner: true, ownerCount: 1 });
    await assert.rejects(
      () => rbac.deactivateMember(pool, "org1", "u1"),
      (err) => err.code === "LAST_OWNER" && err.status === 409
    );
    assert.ok(!ranDeactivate(pool), "Deaktivierung darf bei Block nicht ausgefuehrt werden");
  });

  it("erlaubt Deaktivierung eines Nicht-Owners", async () => {
    const pool = makePool({ targetIsOwner: false, ownerCount: 1 });
    assert.equal(await rbac.deactivateMember(pool, "org1", "u2"), true);
    assert.ok(ranDeactivate(pool));
  });

  it("erlaubt Deaktivierung eines Owners, wenn weitere Owner existieren", async () => {
    const pool = makePool({ targetIsOwner: true, ownerCount: 2 });
    assert.equal(await rbac.deactivateMember(pool, "org1", "u1"), true);
    assert.ok(ranDeactivate(pool));
  });

  it("updateMemberRoleByMembershipId blockt den letzten Owner (per Membership-ID)", async () => {
    const pool = makePool({ targetIsOwner: true, ownerCount: 1 });
    await assert.rejects(
      () => rbac.updateMemberRoleByMembershipId(pool, "org1", "m1", "viewer"),
      (err) => err.code === "LAST_OWNER"
    );
    assert.ok(!ranUpdate(pool));

    // MUTATION-KILL (Welle 1): Gegenstueck zum Test oben. Beide Aufrufformen
    // brauchen den Nachweis, sonst faellt die Inversion von `byId` nur in einer
    // von beiden auf — und ein Mutant ueberlebt in der anderen.
    const guard = pool.calls.find((c) => /SELECT 1 FROM org_memberships/i.test(c.sql));
    assert.ok(/WHERE id = \$1/.test(guard.sql),
      "beim Ziel {membershipId} muss ueber die Mitgliedschafts-ID gesucht werden");
    assert.strictEqual(guard.params[0], "m1");
    assert.strictEqual(guard.params[1], "org1", "und org-gebunden");
  });

  it("countActiveOwners liefert die Anzahl aktiver Owner", async () => {
    assert.equal(await rbac.countActiveOwners(makePool({ ownerCount: 3 }), "org1"), 3);
  });
});
