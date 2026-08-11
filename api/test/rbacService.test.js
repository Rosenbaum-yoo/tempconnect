/**
 * RbacService extended tests — membership queries, checkPermission,
 * createOrganization (transaction), member CRUD.
 * (hasPermission, PERMISSIONS, ROLE_HIERARCHY covered in rbac.test.js + rbac-hardening.test.js)
 *
 * Run: node --test --test-force-exit test/rbacService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getMembership,
  getUserMemberships,
  getPrimaryOrg,
  checkPermission,
  createOrganization,
  addMember,
  updateMemberRole,
  deactivateMember,
  listOrgMembers,
  getLocation,
  locationBelongsToOrg,
  canAccessLocation,
  getAllowedLocationsForMembership,
  updateMemberScope,
  CROSS_LOCATION_ROLES
} from "../services/rbacService.js";

/* ── helpers ──────────────────────────────────────────────── */

function mockPool(response) {
  const queries = [];
  return {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (typeof response === "function") return response(sql, params);
      return response;
    },
    queries
  };
}

function sequencePool(...responses) {
  let idx = 0;
  const queries = [];
  return {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (idx >= responses.length) throw new Error(`Unexpected query #${idx + 1}`);
      const r = responses[idx++];
      if (r instanceof Error) throw r;
      return r;
    },
    queries
  };
}

const MEMBERSHIP = {
  user_id: "user-1",
  org_id: "org-1",
  role_key: "owner",
  is_active: true,
  org_name: "Test GmbH",
  org_type: "company",
  org_plan: "PRO"
};

/* ═══════════════════════════════════════════════════════════
   getMembership
   ═══════════════════════════════════════════════════════════ */

describe("getMembership", () => {
  it("returns membership when found", async () => {
    const pool = mockPool({ rows: [MEMBERSHIP] });
    const result = await getMembership(pool, "user-1", "org-1");
    assert.deepStrictEqual(result, MEMBERSHIP);
    assert.ok(pool.queries[0].sql.includes("org_memberships om"));
    assert.ok(pool.queries[0].sql.includes("is_active = TRUE"));
    assert.deepStrictEqual(pool.queries[0].params, ["user-1", "org-1"]);
  });

  it("returns null when not found", async () => {
    const pool = mockPool({ rows: [] });
    assert.strictEqual(await getMembership(pool, "user-1", "org-2"), null);
  });

  it("returns null for inactive membership (SQL filter)", async () => {
    // is_active = TRUE in WHERE clause filters out inactive
    const pool = mockPool({ rows: [] });
    assert.strictEqual(await getMembership(pool, "user-1", "org-1"), null);
  });

  it("propagates pool error", async () => {
    const pool = { query: async () => { throw new Error("conn_reset"); } };
    await assert.rejects(() => getMembership(pool, "user-1", "org-1"), { message: "conn_reset" });
  });
});

/* ═══════════════════════════════════════════════════════════
   getUserMemberships
   ═══════════════════════════════════════════════════════════ */

describe("getUserMemberships", () => {
  it("returns all active memberships for user", async () => {
    const memberships = [
      { ...MEMBERSHIP },
      { ...MEMBERSHIP, org_id: "org-2", org_name: "Agency AG", role_key: "member" }
    ];
    const pool = mockPool({ rows: memberships });
    const result = await getUserMemberships(pool, "user-1");
    assert.strictEqual(result.length, 2);
    assert.ok(pool.queries[0].sql.includes("LEFT JOIN org_locations"));
    assert.ok(pool.queries[0].sql.includes("LEFT JOIN org_departments"));
    assert.ok(pool.queries[0].sql.includes("ORDER BY o.name ASC"));
  });

  it("returns empty array when no memberships", async () => {
    const pool = mockPool({ rows: [] });
    const result = await getUserMemberships(pool, "user-new");
    assert.deepStrictEqual(result, []);
  });
});

/* ═══════════════════════════════════════════════════════════
   getPrimaryOrg
   ═══════════════════════════════════════════════════════════ */

describe("getPrimaryOrg", () => {
  it("fast path: resolves via users.org_id", async () => {
    // Query 1: SELECT org_id FROM users → returns org_id
    // Query 2: getMembership → returns membership
    const pool = sequencePool(
      { rows: [{ org_id: "org-1" }] },        // users table
      { rows: [MEMBERSHIP] }                    // getMembership
    );
    const result = await getPrimaryOrg(pool, "user-1");
    assert.deepStrictEqual(result, MEMBERSHIP);
    assert.strictEqual(pool.queries.length, 2);
    assert.ok(pool.queries[0].sql.includes("SELECT org_id FROM users"));
    /*
     * MUTATION-KILL (Welle 1). Bis hierher pruefte der Test nur die ERSTE
     * Abfrage. Streicht man `if (orgId)`, laeuft der Code in den Rueckfall —
     * ebenfalls zwei Abfragen, ebenfalls dieselbe erste. Der Mutant ueberlebte.
     *
     * Der Unterschied ist nicht kosmetisch: der Rueckfall liefert die AELTESTE
     * aktive Mitgliedschaft. Weicht sie von `users.org_id` ab, bekommt der
     * Nutzer den falschen Mandantenkontext — und darauf baut jede weitere
     * Berechtigungspruefung auf.
     */
    assert.ok(pool.queries[1].params.includes("org-1"),
      "der Schnellpfad muss die Mitgliedschaft zu users.org_id laden");
    assert.ok(!pool.queries[1].sql.includes("ORDER BY om.created_at"),
      "das ist der Rueckfall — er darf hier gar nicht erst laufen");
  });

  it("fallback: uses first active membership when users.org_id is null", async () => {
    const pool = sequencePool(
      { rows: [{ org_id: null }] },             // no org_id in users
      { rows: [MEMBERSHIP] }                     // fallback query
    );
    const result = await getPrimaryOrg(pool, "user-1");
    assert.deepStrictEqual(result, MEMBERSHIP);
    assert.ok(pool.queries[1].sql.includes("ORDER BY om.created_at ASC LIMIT 1"));
  });

  it("returns null when user has no org_id and no memberships", async () => {
    const pool = sequencePool(
      { rows: [{ org_id: null }] },
      { rows: [] }
    );
    assert.strictEqual(await getPrimaryOrg(pool, "user-orphan"), null);
  });

  it("returns null when user does not exist", async () => {
    const pool = sequencePool(
      { rows: [] },  // user not found
      { rows: [] }   // fallback also empty
    );
    const result = await getPrimaryOrg(pool, "nonexistent");
    // org_id is undefined → falsy → goes to fallback
    assert.strictEqual(result, null);
  });
});

/* ═══════════════════════════════════════════════════════════
   checkPermission
   ═══════════════════════════════════════════════════════════ */

describe("checkPermission", () => {
  it("returns allowed=true when user has permission", async () => {
    const pool = mockPool({ rows: [MEMBERSHIP] });
    const result = await checkPermission(pool, "user-1", "org-1", "requisition.create");
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.reason, null);
    assert.deepStrictEqual(result.membership, MEMBERSHIP);
  });

  it("returns allowed=false with NOT_ORG_MEMBER when no membership", async () => {
    const pool = mockPool({ rows: [] });
    const result = await checkPermission(pool, "user-1", "org-x", "requisition.create");
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, "NOT_ORG_MEMBER");
    assert.strictEqual(result.membership, null);
  });

  it("returns allowed=false with MEMBERSHIP_INACTIVE for inactive member", async () => {
    const inactive = { ...MEMBERSHIP, is_active: false };
    const pool = mockPool({ rows: [inactive] });
    const result = await checkPermission(pool, "user-1", "org-1", "requisition.create");
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, "MEMBERSHIP_INACTIVE");
  });

  it("returns allowed=false with PERMISSION_DENIED for wrong role", async () => {
    const viewer = { ...MEMBERSHIP, role_key: "viewer", is_active: true };
    const pool = mockPool({ rows: [viewer] });
    const result = await checkPermission(pool, "user-1", "org-1", "requisition.create");
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, "PERMISSION_DENIED");
  });

  it("owner has org.settings permission", async () => {
    const pool = mockPool({ rows: [MEMBERSHIP] }); // role_key = 'owner'
    const result = await checkPermission(pool, "user-1", "org-1", "org.settings");
    assert.strictEqual(result.allowed, true);
  });

  it("viewer cannot create requisitions", async () => {
    const viewer = { ...MEMBERSHIP, role_key: "viewer", is_active: true };
    const pool = mockPool({ rows: [viewer] });
    const result = await checkPermission(pool, "user-1", "org-1", "requisition.create");
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, "PERMISSION_DENIED");
  });

  it("propagates pool error", async () => {
    const pool = { query: async () => { throw new Error("db_err"); } };
    await assert.rejects(() => checkPermission(pool, "u", "o", "p"), { message: "db_err" });
  });
});

/* ═══════════════════════════════════════════════════════════
   createOrganization — transactional
   ═══════════════════════════════════════════════════════════ */

describe("createOrganization", () => {
  function txPool(orgRow, shouldFail = false) {
    const queries = [];
    let released = false;
    const client = {
      query: async (sql, params) => {
        queries.push({ sql, params });
        if (shouldFail && sql.includes("INSERT INTO org_memberships")) {
          throw new Error("fk_violation");
        }
        if (sql.includes("INSERT INTO organizations")) {
          return { rows: [orgRow] };
        }
        return { rows: [], rowCount: 1 };
      },
      release: () => { released = true; }
    };
    return {
      connect: async () => client,
      queries,
      get released() { return released; }
    };
  }

  const ORG = { id: "org-new", name: "Neue GmbH", slug: "neue-gmbh", type: "company" };

  it("creates org, membership, updates user in transaction", async () => {
    const pool = txPool(ORG);
    const result = await createOrganization(pool, "user-1", {
      name: "Neue GmbH", slug: "neue-gmbh", type: "company"
    });
    assert.strictEqual(result.id, "org-new");
    const sqls = pool.queries.map(q => q.sql);
    assert.ok(sqls[0] === "BEGIN");
    assert.ok(sqls[1].includes("INSERT INTO organizations"));
    assert.ok(sqls[2].includes("INSERT INTO org_memberships"));
    assert.ok(sqls[2].includes("'owner'")); // user becomes owner
    assert.ok(sqls[3].includes("UPDATE users SET org_id"));
    assert.ok(sqls[4] === "COMMIT");
    assert.strictEqual(pool.released, true);
  });

  it("rolls back on failure", async () => {
    const pool = txPool(ORG, true);
    await assert.rejects(
      () => createOrganization(pool, "user-1", { name: "X", slug: "x", type: "company" }),
      { message: "fk_violation" }
    );
    const sqls = pool.queries.map(q => q.sql);
    assert.ok(sqls.includes("ROLLBACK"));
    assert.strictEqual(pool.released, true);
  });

  it("passes optional fields as null", async () => {
    const pool = txPool(ORG);
    await createOrganization(pool, "user-1", { name: "X", slug: "x", type: "agency" });
    const insertParams = pool.queries[1].params;
    assert.strictEqual(insertParams[3], null); // billing_email
    assert.strictEqual(insertParams[4], null); // tax_id
    assert.strictEqual(insertParams[5], null); // website
  });
});

/* ═══════════════════════════════════════════════════════════
   addMember
   ═══════════════════════════════════════════════════════════ */

describe("addMember", () => {
  it("inserts membership and returns row", async () => {
    const newMember = { ...MEMBERSHIP, role_key: "member" };
    const pool = mockPool({ rows: [newMember] });
    const result = await addMember(pool, "org-1", "user-2", "member");
    assert.strictEqual(result.role_key, "member");
    assert.ok(pool.queries[0].sql.includes("INSERT INTO org_memberships"));
    assert.ok(pool.queries[0].sql.includes("ON CONFLICT (user_id, org_id) DO UPDATE"));
  });

  it("upserts on conflict — re-activates deactivated member", async () => {
    const reactivated = { ...MEMBERSHIP, role_key: "hiring_manager", is_active: true };
    const pool = mockPool({ rows: [reactivated] });
    const result = await addMember(pool, "org-1", "user-3", "hiring_manager");
    assert.strictEqual(result.role_key, "hiring_manager");
    assert.ok(pool.queries[0].sql.includes("is_active = TRUE"));
  });

  it("passes optional department_id and location_id", async () => {
    const pool = mockPool({ rows: [MEMBERSHIP] });
    await addMember(pool, "org-1", "user-4", "recruiter", {
      department_id: "dept-1",
      location_id: "loc-1"
    });
    const params = pool.queries[0].params;
    assert.strictEqual(params[3], "dept-1");
    assert.strictEqual(params[4], "loc-1");
  });

  it("defaults optional fields to null", async () => {
    const pool = mockPool({ rows: [MEMBERSHIP] });
    await addMember(pool, "org-1", "user-5", "viewer");
    const params = pool.queries[0].params;
    assert.strictEqual(params[3], null); // department_id
    assert.strictEqual(params[4], null); // location_id
  });
});

/* ═══════════════════════════════════════════════════════════
   updateMemberRole
   ═══════════════════════════════════════════════════════════ */

describe("updateMemberRole", () => {
  it("updates role and returns updated row", async () => {
    const updated = { ...MEMBERSHIP, role_key: "admin" };
    // Last-Owner-Guard fuehrt zuerst eine SELECT-1-Pruefung aus; hier ist das Ziel
    // KEIN aktiver Owner (rowCount 0) -> Guard kehrt zurueck, danach laeuft das UPDATE.
    const pool = mockPool((sql) =>
      /SELECT 1 FROM org_memberships/i.test(sql) ? { rowCount: 0, rows: [] } : { rows: [updated] }
    );
    const result = await updateMemberRole(pool, "org-1", "user-1", "admin");
    assert.strictEqual(result.role_key, "admin");
    const upd = pool.queries.find((q) => /UPDATE org_memberships SET role_key/i.test(q.sql));
    assert.ok(upd, "UPDATE-Query muss ausgefuehrt werden");
    assert.ok(upd.sql.includes("role_key = $3"));
    assert.ok(upd.sql.includes("is_active = TRUE"));
    assert.deepStrictEqual(upd.params, ["org-1", "user-1", "admin"]);
  });

  it("returns null when membership not found", async () => {
    const pool = mockPool({ rows: [] });
    assert.strictEqual(await updateMemberRole(pool, "org-1", "missing", "admin"), null);
  });

  it("returns null for inactive membership (SQL filter)", async () => {
    const pool = mockPool({ rows: [] });
    assert.strictEqual(await updateMemberRole(pool, "org-1", "user-1", "admin"), null);
  });
});

/* ═══════════════════════════════════════════════════════════
   deactivateMember
   ═══════════════════════════════════════════════════════════ */

describe("deactivateMember", () => {
  it("returns true when deactivated", async () => {
    // Ziel ist KEIN aktiver Owner (Guard SELECT-1 rowCount 0) -> Deaktivierung laeuft durch.
    const pool = mockPool((sql) =>
      /SELECT 1 FROM org_memberships/i.test(sql) ? { rowCount: 0, rows: [] } : { rowCount: 1 }
    );
    assert.strictEqual(await deactivateMember(pool, "org-1", "user-1"), true);
    const del = pool.queries.find((q) => /is_active = FALSE/i.test(q.sql));
    assert.ok(del, "Deaktivierungs-UPDATE muss ausgefuehrt werden");
    assert.deepStrictEqual(del.params, ["org-1", "user-1"]);
  });

  it("returns false when not found", async () => {
    const pool = mockPool({ rowCount: 0 });
    assert.strictEqual(await deactivateMember(pool, "org-1", "missing"), false);
  });
});

/* ═══════════════════════════════════════════════════════════
   listOrgMembers
   ═══════════════════════════════════════════════════════════ */

describe("listOrgMembers", () => {
  it("returns active members with user details", async () => {
    const members = [
      { ...MEMBERSHIP, email: "admin@firma.de", company_name: "Firma GmbH" },
      { ...MEMBERSHIP, user_id: "user-2", role_key: "member", email: "user@firma.de" }
    ];
    const pool = mockPool({ rows: members });
    const result = await listOrgMembers(pool, "org-1");
    assert.strictEqual(result.length, 2);
    assert.ok(pool.queries[0].sql.includes("JOIN users u ON u.id = om.user_id"));
    assert.ok(pool.queries[0].sql.includes("is_active = TRUE"));
    assert.ok(pool.queries[0].sql.includes("ORDER BY om.role_key ASC"));
    assert.deepStrictEqual(pool.queries[0].params, ["org-1"]);
  });

  it("returns empty array when no members", async () => {
    const pool = mockPool({ rows: [] });
    assert.deepStrictEqual(await listOrgMembers(pool, "org-empty"), []);
  });
});

/* ═══════════════════════════════════════════════════════════
   CROSS_LOCATION_ROLES constant
   ═══════════════════════════════════════════════════════════ */

describe("CROSS_LOCATION_ROLES", () => {
  it("includes owner, admin, program_manager, supplier_manager, finance", () => {
    assert.ok(CROSS_LOCATION_ROLES.has('owner'));
    assert.ok(CROSS_LOCATION_ROLES.has('admin'));
    assert.ok(CROSS_LOCATION_ROLES.has('program_manager'));
    assert.ok(CROSS_LOCATION_ROLES.has('supplier_manager'));
    assert.ok(CROSS_LOCATION_ROLES.has('finance'));
  });

  it("does NOT include hiring_manager, dispatcher, recruiter, member, viewer", () => {
    assert.ok(!CROSS_LOCATION_ROLES.has('hiring_manager'));
    assert.ok(!CROSS_LOCATION_ROLES.has('dispatcher'));
    assert.ok(!CROSS_LOCATION_ROLES.has('recruiter'));
    assert.ok(!CROSS_LOCATION_ROLES.has('member'));
    assert.ok(!CROSS_LOCATION_ROLES.has('viewer'));
  });
});

/* ═══════════════════════════════════════════════════════════
   getLocation
   ═══════════════════════════════════════════════════════════ */

describe("getLocation", () => {
  const LOC = { id: "loc-1", name: "München HQ", city: "München", postal_code: "80331", country: "DE", is_hq: true };

  it("returns location when found and active", async () => {
    const pool = mockPool({ rows: [LOC] });
    const result = await getLocation(pool, "loc-1");
    assert.deepStrictEqual(result, LOC);
    assert.ok(pool.queries[0].sql.includes("is_active = TRUE"));
    assert.deepStrictEqual(pool.queries[0].params, ["loc-1"]);
  });

  it("returns null when location not found", async () => {
    const pool = mockPool({ rows: [] });
    assert.strictEqual(await getLocation(pool, "loc-missing"), null);
  });

  it("returns null for null locationId", async () => {
    const pool = mockPool({ rows: [LOC] }); // should not be called
    assert.strictEqual(await getLocation(pool, null), null);
  });
});

/* ═══════════════════════════════════════════════════════════
   locationBelongsToOrg
   ═══════════════════════════════════════════════════════════ */

describe("locationBelongsToOrg", () => {
  it("returns true when location belongs to org", async () => {
    const pool = mockPool({ rows: [{ "?column?": 1 }] });
    const result = await locationBelongsToOrg(pool, "loc-1", "org-1");
    assert.strictEqual(result, true);
    assert.ok(pool.queries[0].sql.includes("org_id = $2"));
    assert.ok(pool.queries[0].sql.includes("is_active = TRUE"));
  });

  it("returns false when location does not belong to org", async () => {
    const pool = mockPool({ rows: [] });
    assert.strictEqual(await locationBelongsToOrg(pool, "loc-1", "org-other"), false);
  });

  it("returns false for null locationId or orgId", async () => {
    const pool = mockPool({ rows: [{}] }); // should not be called
    assert.strictEqual(await locationBelongsToOrg(pool, null, "org-1"), false);
    assert.strictEqual(await locationBelongsToOrg(pool, "loc-1", null), false);
  });
});

/* ═══════════════════════════════════════════════════════════
   canAccessLocation
   ═══════════════════════════════════════════════════════════ */

describe("canAccessLocation", () => {
  const ORG_ID = "org-1";
  const LOC_A  = "loc-a";
  const LOC_B  = "loc-b";

  it("bound membership: allows access to its own location", async () => {
    const pool = mockPool({ rows: [] }); // no query expected (direct comparison)
    const membership = { org_id: ORG_ID, location_id: LOC_A };
    assert.strictEqual(await canAccessLocation(pool, membership, LOC_A), true);
  });

  it("bound membership: denies access to a different location", async () => {
    const pool = mockPool({ rows: [] }); // no query expected
    const membership = { org_id: ORG_ID, location_id: LOC_A };
    assert.strictEqual(await canAccessLocation(pool, membership, LOC_B), false);
  });

  it("unbound membership: allows access to any location in org", async () => {
    const pool = mockPool({ rows: [{ "?column?": 1 }] }); // locationBelongsToOrg → true
    const membership = { org_id: ORG_ID, location_id: null };
    assert.strictEqual(await canAccessLocation(pool, membership, LOC_A), true);
  });

  it("unbound membership: denies access to location in different org", async () => {
    const pool = mockPool({ rows: [] }); // locationBelongsToOrg → false
    const membership = { org_id: ORG_ID, location_id: null };
    assert.strictEqual(await canAccessLocation(pool, membership, LOC_A), false);
  });

  it("returns false for null membership or locationId", async () => {
    const pool = mockPool({ rows: [] });
    assert.strictEqual(await canAccessLocation(pool, null, LOC_A), false);
    assert.strictEqual(await canAccessLocation(pool, { org_id: ORG_ID, location_id: null }, null), false);
  });
});

/* ═══════════════════════════════════════════════════════════
   getAllowedLocationsForMembership
   ═══════════════════════════════════════════════════════════ */

describe("getAllowedLocationsForMembership", () => {
  const ORG_ID = "org-1";
  const LOC_ROW = { id: "loc-a", name: "HQ", city: "München", is_hq: true };

  it("bound membership returns only the bound location", async () => {
    const pool = mockPool({ rows: [LOC_ROW] }); // getLocation query
    const membership = { org_id: ORG_ID, location_id: "loc-a" };
    const result = await getAllowedLocationsForMembership(pool, membership);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, "loc-a");

    /*
     * MUTATION-KILL (Welle 1). Der Mock beantwortet JEDE Abfrage mit derselben
     * Zeile. Streicht man den `if (membership.location_id)`-Rumpf, faellt der
     * Code in die org-weite Abfrage — und bekommt vom Mock wieder genau diese
     * eine Zeile. Beide Zusicherungen oben blieben gruen, der Mutant ueberlebte.
     *
     * Was dabei durchginge, ist keine Kleinigkeit: ein an EINEN Standort
     * gebundenes Mitglied saehe jede Niederlassung der Organisation. Deshalb
     * wird hier nicht das Ergebnis geprueft, sondern WELCHE Abfrage lief.
     */
    assert.strictEqual(pool.queries.length, 1);
    assert.ok(pool.queries[0].params.includes("loc-a"),
      "es muss gezielt der gebundene Standort geladen werden");
    assert.ok(!pool.queries[0].sql.includes("ORDER BY is_hq DESC"),
      "das ist die org-weite Liste — sie wuerde die Standortbindung aushebeln");
  });

  it("bound membership returns empty array if bound location is inactive/missing", async () => {
    const pool = mockPool({ rows: [] }); // getLocation: not found
    const membership = { org_id: ORG_ID, location_id: "loc-gone" };
    const result = await getAllowedLocationsForMembership(pool, membership);
    assert.deepStrictEqual(result, []);
  });

  it("unbound membership returns all active org locations", async () => {
    const allLocs = [
      { id: "loc-a", name: "HQ",    city: "München", is_hq: true  },
      { id: "loc-b", name: "Berlin", city: "Berlin",  is_hq: false }
    ];
    const pool = mockPool({ rows: allLocs });
    const membership = { org_id: ORG_ID, location_id: null };
    const result = await getAllowedLocationsForMembership(pool, membership);
    assert.strictEqual(result.length, 2);
    assert.ok(pool.queries[0].sql.includes("ORDER BY is_hq DESC"));
    assert.deepStrictEqual(pool.queries[0].params, [ORG_ID]);
  });

  it("returns empty array for null membership", async () => {
    const pool = mockPool({ rows: [] });
    const result = await getAllowedLocationsForMembership(pool, null);
    assert.deepStrictEqual(result, []);
  });
});

/* ═══════════════════════════════════════════════════════════
   updateMemberScope
   ═══════════════════════════════════════════════════════════

   NEU (Mutation-Welle 1). Diese Funktion hatte keinen einzigen Test — alle
   Mutanten darin ueberlebten zwangslaeufig. Sie schreibt den Standort- und
   Abteilungs-Scope eines Mitglieds, also genau die Bindung, die
   getAllowedLocationsForMembership danach auswertet. Ein stiller Fehler hier
   erweitert Zugriff, ohne dass irgendwo eine Rolle geaendert wird. */

describe("updateMemberScope", () => {
  const ROW = { id: "m1", org_id: "org-1", location_id: "loc-a", department_id: "dep-1" };

  it("schreibt Standort und Abteilung wirklich", async () => {
    const pool = mockPool({ rows: [ROW] });
    const result = await updateMemberScope(pool, "org-1", "m1", {
      location_id: "loc-a", department_id: "dep-1"
    });

    assert.deepStrictEqual(result, ROW);
    /*
     * MUTATION-KILL: `location_id ?? null` wurde zu `location_id && null`
     * mutiert — der Wert wird damit IMMER null. Das Mitglied verliert seine
     * Standortbindung und wird org-weit, ohne dass jemand eine Rolle aendert.
     * Ohne diese Zusicherung faellt das keinem Test auf.
     */
    assert.strictEqual(pool.queries[0].params[2], "loc-a",
      "der Standort muss geschrieben werden, nicht null");
    assert.strictEqual(pool.queries[0].params[3], "dep-1",
      "die Abteilung ebenso");
  });

  it("bindet die Aenderung an die Organisation", async () => {
    const pool = mockPool({ rows: [ROW] });
    await updateMemberScope(pool, "org-1", "m1", { location_id: "loc-a", department_id: null });
    assert.ok(pool.queries[0].sql.includes("org_id = $2"),
      "ohne Org-Bedingung liesse sich der Scope eines fremden Mitglieds aendern");
    assert.strictEqual(pool.queries[0].params[1], "org-1");
    assert.ok(pool.queries[0].sql.includes("is_active = TRUE"),
      "eine deaktivierte Mitgliedschaft wird nicht stillschweigend wiederbelebt");
  });

  it("macht aus 'kein Standort' ein echtes NULL, nicht undefined", async () => {
    const pool = mockPool({ rows: [{ ...ROW, location_id: null, department_id: null }] });
    await updateMemberScope(pool, "org-1", "m1", {});
    assert.strictEqual(pool.queries[0].params[2], null);
    assert.strictEqual(pool.queries[0].params[3], null);
  });

  it("gibt null zurueck, wenn nichts getroffen wurde", async () => {
    // Fremde Org oder inaktive Mitgliedschaft: das UPDATE trifft keine Zeile.
    const pool = mockPool({ rows: [] });
    const result = await updateMemberScope(pool, "org-fremd", "m1", { location_id: "loc-a" });
    assert.strictEqual(result, null,
      "ein stiller Erfolg waere hier das gefaehrlichste Ergebnis");
  });
});
