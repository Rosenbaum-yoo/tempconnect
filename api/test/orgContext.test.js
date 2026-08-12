/**
 * Org Context Middleware unit tests.
 * Tests all resolution branches: no session, explicit org header,
 * session cache, primary org fallback, error resilience.
 * Plus: location-scope validation, binding enforcement, UUID 400s.
 *
 * Run: node --test --test-force-exit test/orgContext.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { orgContextMiddleware } from "../middleware/orgContext.js";

// ── Mock factories ────────────────────────────────────────────

const ORG_ID   = "a0b1c2d3-e4f5-6789-abcd-ef0123456789";
const ORG_ID_B = "b1c2d3e4-f5a6-7890-bcde-f01234567890";
const LOC_A    = "c2d3e4f5-a6b7-8901-cdef-012345678901";
const LOC_B    = "d3e4f5a6-b7c8-9012-defa-123456789012";
const USER_ID  = "user-abc-123";

const MEMBERSHIP = {
  org_id:      ORG_ID,
  role_key:    "owner",
  org_name:    "Test GmbH",
  location_id: null,
  department_id: null,
};

const MEMBERSHIP_BOUND = {
  ...MEMBERSHIP,
  role_key:    "member",
  location_id: LOC_A,
};

const MEMBERSHIP_WITH_DEPT = {
  ...MEMBERSHIP,
  department_id: "dept-uuid-0000-0000-0000-000000000001",
};

function sequencePool(...responses) {
  let idx = 0;
  return {
    query: async () => {
      if (idx >= responses.length) throw new Error(`Unexpected query #${idx + 1}`);
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

function errorPool() {
  return { query: async () => { throw new Error("DB unavailable"); } };
}

/** Pool that throws if query() is ever called. */
function noQueryPool() {
  return { query: async () => { throw new Error("no DB calls expected"); } };
}

function mockReq(overrides = {}) {
  return {
    session: { userId: USER_ID },
    headers: {},
    query: {},
    body: {},
    ...overrides
  };
}

function mockRes() {
  const res = { _status: 200, _body: null };
  res.status = (s) => { res._status = s; return res; };
  res.json   = (b) => { res._body  = b; return res; };
  return res;
}

// ═══════════════════════════════════════════════════════════════
// No session — skip entirely
// ═══════════════════════════════════════════════════════════════

describe("orgContextMiddleware — no session", () => {
  /*
   * MUTATION-KILL (Welle 2). `if (!req.session?.userId) return next();` liess
   * sich zu `false` mutieren, ohne dass ein Test es merkte — der bestehende
   * Test daneben prueft nur, DASS next() kommt, nicht dass vorher NICHTS
   * passiert ist.
   *
   * Ohne die Abkuerzung laeuft ein unangemeldeter Request durch die gesamte
   * Org-Aufloesung: Datenbankabfragen fuer einen Benutzer, den es nicht gibt,
   * bei jedem Aufruf, auch von aussen ausloesbar. Kein Datenabfluss — die
   * Abfragen liefern nichts —, aber unnoetige Last auf einem Pfad, den jeder
   * ohne Anmeldung erreicht.
   */
  /*
   * MUTATION-KILL (Welle 2). `req.setOrgContext` ist der Weg, über den eine
   * Route den Mandanten-Kontext in ihre Transaktion setzt:
   *
   *     SET LOCAL app.current_org_id = <org>
   *     SET LOCAL app.rls_bypass     = ''
   *
   * Drei Mutanten überlebten hier — der Block liess sich leeren, die Bedingung
   * umdrehen. Fehlt der Helfer, greift die Row-Level-Security nicht: entweder
   * bricht der Aufruf laut (`undefined is not a function`), oder ein Aufrufer
   * mit `if (req.setOrgContext)` überspringt ihn stillschweigend — und dann
   * läuft die Abfrage ohne Mandantenfilter.
   *
   * Der Reset auf '' ist dabei so wichtig wie das Setzen: ohne ihn kann eine
   * wiederverwendete Pool-Verbindung einen Staff-Bypass aus einem früheren
   * Request behalten.
   */
  it("stellt setOrgContext bereit und setzt damit Org UND Bypass-Reset", async () => {
    const pool = { query: async () => ({ rows: [{ ...MEMBERSHIP, org_id: ORG_ID }] }) };
    const mw = orgContextMiddleware(pool);
    const req = mockReq({ headers: { "x-org-id": ORG_ID } });

    await mw(req, mockRes(), () => {});

    assert.strictEqual(typeof req.setOrgContext, "function",
      "ohne diesen Helfer setzt keine Route den Mandanten-Kontext");

    const abgesetzt = [];
    await req.setOrgContext({ query: async (sql, params) => { abgesetzt.push({ sql, params }); return {}; } });

    const org = abgesetzt.find((q) => q.sql.includes("current_org_id"));
    assert.ok(org, "app.current_org_id muss gesetzt werden");
    assert.strictEqual(org.params[0], ORG_ID, "und zwar auf die aufgelöste Org");

    const bypass = abgesetzt.find((q) => q.sql.includes("rls_bypass"));
    assert.ok(bypass, "der Staff-Bypass muss ausdrücklich zurückgesetzt werden");
    assert.strictEqual(bypass.params[0], "",
      "ein stehengebliebenes 'staff' aus einer wiederverwendeten Verbindung wäre ein Cross-Org-Leseweg");
  });

  it("setzt setOrgContext NICHT, wenn keine Org aufgelöst wurde", async () => {
    // Ohne Org gibt es nichts zu setzen — ein Helfer, der `null` in
    // app.current_org_id schriebe, wäre schlimmer als keiner.
    const pool = { query: async () => ({ rows: [] }) };
    const mw = orgContextMiddleware(pool);
    const req = mockReq({});

    await mw(req, mockRes(), () => {});

    assert.strictEqual(req.orgId, undefined);
    assert.strictEqual(req.setOrgContext, undefined);
  });

  it("fragt ohne Anmeldung nicht die Datenbank", async () => {
    let abfragen = 0;
    const pool = { query: async () => { abfragen++; return { rows: [] }; } };
    const mw = orgContextMiddleware(pool);
    const req = { headers: {}, session: {} };   // angemeldet: nein
    let nextCalled = false;

    await mw(req, mockRes(), () => { nextCalled = true; });

    assert.ok(nextCalled);
    assert.strictEqual(abfragen, 0,
      "die Abkuerzung muss VOR jeder Abfrage greifen — sonst ist der Pfad ohne Anmeldung erreichbar");
    assert.strictEqual(req.orgId, undefined, "und es darf kein Org-Kontext entstehen");
  });

  it("calls next() immediately when no session", async () => {
    const mw = orgContextMiddleware(noQueryPool());
    let nextCalled = false;
    await mw({ headers: {}, query: {}, body: {} }, mockRes(), () => { nextCalled = true; });
    assert.ok(nextCalled);
  });

  it("calls next() when session exists but userId is missing", async () => {
    const mw = orgContextMiddleware(noQueryPool());
    let nextCalled = false;
    await mw(mockReq({ session: {} }), mockRes(), () => { nextCalled = true; });
    assert.ok(nextCalled);
  });
});

// ═══════════════════════════════════════════════════════════════
// UUID header validation → 400 (rules 1 & 2)
// ═══════════════════════════════════════════════════════════════

describe("orgContextMiddleware — invalid UUID headers return 400", () => {
  it("returns 400 for non-UUID X-Org-Id header", async () => {
    const mw = orgContextMiddleware(noQueryPool()); // DB must not be called
    const req = mockReq({ headers: { "x-org-id": "not-a-uuid" } });
    const res = mockRes();
    let nextCalled = false;

    await mw(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res._status, 400);
    assert.equal(res._body?.error, "INVALID_ORG_ID");
  });

  it("returns 400 for SQL injection attempt in X-Org-Id header", async () => {
    const mw = orgContextMiddleware(noQueryPool());
    const req = mockReq({ headers: { "x-org-id": "'; DROP TABLE users; --" } });
    const res = mockRes();
    let nextCalled = false;

    await mw(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res._status, 400);
    assert.equal(res._body?.error, "INVALID_ORG_ID");
  });

  it("returns 400 for non-UUID X-Location-Id header", async () => {
    const pool = sequencePool(
      { rows: [{ org_id: ORG_ID }] }, // getPrimaryOrg: users query
      { rows: [MEMBERSHIP] }           // getMembership
    );
    const mw = orgContextMiddleware(pool);
    const req = mockReq({ headers: { "x-location-id": "not-a-uuid" } });
    const res = mockRes();
    let nextCalled = false;

    await mw(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res._status, 400);
    assert.equal(res._body?.error, "INVALID_LOCATION_ID");
  });

  it("returns 400 for SQL injection in X-Location-Id header", async () => {
    const mw = orgContextMiddleware(noQueryPool());
    const req = mockReq({ headers: { "x-location-id": "'); DROP TABLE org_locations;--" } });
    const res = mockRes();
    let nextCalled = false;

    await mw(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res._status, 400);
    assert.equal(res._body?.error, "INVALID_LOCATION_ID");
  });

  /*
   * MUTATION-KILL (Welle 2). `if (fallbackOrg && !UUID_RE.test(...)) fallbackOrg = null;`
   * liess sich zu `false` mutieren und ueberlebte: der bestehende Test daneben
   * belegt nur, dass KEIN 400 kommt — nicht, dass der ungueltige Wert wirklich
   * verworfen wird.
   *
   * Ohne das Verwerfen wandert eine ungepruefte Zeichenkette aus query/body in
   * die Org-Aufloesung und landet als Parameter in der Datenbankabfrage. Die
   * Abfrage findet nichts, aber die Absicht der Zeile — nur UUIDs weiterreichen
   * — waere unbelegt. Genau solche stillen Filter sind es wert, festgenagelt zu
   * werden.
   */
  it("reicht eine ungueltige org_id aus query nicht an die Datenbank weiter", async () => {
    const gesehen = [];
    const pool = {
      query: async (_sql, params = []) => {
        gesehen.push(...params);
        return { rows: [] };
      }
    };
    const mw = orgContextMiddleware(pool);
    const req = mockReq({ query: { org_id: "'; DROP TABLE users; --" } });

    await mw(req, mockRes(), () => {});

    assert.ok(!gesehen.includes("'; DROP TABLE users; --"),
      "der ungueltige Wert muss verworfen werden, bevor er irgendeine Abfrage erreicht");
  });

  it("silently ignores invalid UUID in query.org_id (not a header → no 400)", async () => {
    // query param with invalid UUID → silently skip, fall through to primary org resolve
    const pool = sequencePool(
      { rows: [] },  // getPrimaryOrg: no user.org_id
      { rows: [] }   // no membership
    );
    const mw = orgContextMiddleware(pool);
    const req = mockReq({ query: { org_id: "not-a-uuid" } });
    const res = mockRes();
    let nextCalled = false;

    await mw(req, res, () => { nextCalled = true; });

    assert.ok(nextCalled);
    assert.equal(res._status, 200); // unchanged
  });
});

// ═══════════════════════════════════════════════════════════════
// Explicit org from X-Org-Id header
// ═══════════════════════════════════════════════════════════════

describe("orgContextMiddleware — explicit org via header", () => {
  it("resolves org from X-Org-Id header with valid UUID", async () => {
    const pool = sequencePool(
      { rows: [MEMBERSHIP] },    // getMembership
      { rows: [] }               // location resolution (no default loc) — no location cached
    );
    const mw = orgContextMiddleware(pool);
    const req = mockReq({ headers: { "x-org-id": ORG_ID } });
    let nextCalled = false;

    await mw(req, mockRes(), () => { nextCalled = true; });

    assert.ok(nextCalled);
    assert.strictEqual(req.orgId, ORG_ID);
    assert.strictEqual(req.orgRole, "owner");
    assert.strictEqual(req.orgName, "Test GmbH");
    assert.deepStrictEqual(req.orgMembership, MEMBERSHIP);
    assert.ok(req.session._orgCache, "Explicit org should update session cache");
    assert.strictEqual(req.session._orgCache.orgId, ORG_ID);
  });

  it("no membership for explicit org → org fields not set", async () => {
    const pool = sequencePool({ rows: [] }); // getMembership returns null
    const mw = orgContextMiddleware(pool);
    const req = mockReq({ headers: { "x-org-id": ORG_ID } });
    let nextCalled = false;

    await mw(req, mockRes(), () => { nextCalled = true; });

    assert.ok(nextCalled);
    assert.strictEqual(req.orgId, undefined);
  });

  /*
   * MUTATION-KILL (Welle 2). `if (!req.orgId) { … }` — der Rückfall auf
   * Sitzungs-Cache bzw. Haupt-Org — liess sich zu `true` mutieren und überlebte.
   *
   * Über den HEADER ist das folgenlos: dort wird `_orgCache` unmittelbar davor
   * auf dieselbe Org gesetzt, der Rückfall stellt also denselben Wert wieder her.
   * Über den QUERY-Parameter nicht: dort bleibt der Cache unberührt (die
   * Aktualisierung hängt an `if (explicitOrgHeader)`), und ein noch stehender
   * Cache aus einer früheren Org gewinnt.
   *
   * Folge: der Nutzer arbeitet in Org A weiter, obwohl er ausdrücklich Org B
   * angefragt hat — bei beiden ist er Mitglied, es ist also kein Zugriffsbruch,
   * aber er sieht die Daten der falschen Firma. In einer Mandantenanwendung ist
   * das die Sorte Fehler, die man erst bemerkt, wenn jemand etwas ins falsche
   * Unternehmen schreibt.
   */
  it("ein org_id aus query sticht einen noch stehenden Sitzungs-Cache", async () => {
    const mw = orgContextMiddleware({
      query: async () => ({ rows: [{ ...MEMBERSHIP, org_id: ORG_ID_B, org_name: "Zweite" }] })
    });
    const req = mockReq({
      query: { org_id: ORG_ID_B },
      session: {
        userId:    USER_ID,
        _orgCache: { orgId: ORG_ID, role: "owner", name: "Erste", defaultLocationId: null }
      }
    });

    await mw(req, mockRes(), () => {});

    assert.strictEqual(req.orgId, ORG_ID_B,
      "die ausdrücklich angefragte Org muss gewinnen, nicht der alte Cache");
    assert.strictEqual(req.orgName, "Zweite");
  });

  it("explicit org_id from query param is accepted (valid UUID)", async () => {
    const pool = sequencePool({ rows: [MEMBERSHIP] });
    const mw = orgContextMiddleware(pool);
    const req = mockReq({ query: { org_id: ORG_ID } });
    let nextCalled = false;

    await mw(req, mockRes(), () => { nextCalled = true; });

    assert.ok(nextCalled);
    assert.strictEqual(req.orgId, ORG_ID);
  });

  it("org switch via header clears stale location cache", async () => {
    const pool = sequencePool({ rows: [{ ...MEMBERSHIP, org_id: ORG_ID_B, org_name: "New Org" }] });
    const mw = orgContextMiddleware(pool);
    const req = mockReq({
      headers: { "x-org-id": ORG_ID_B },
      session: {
        userId: USER_ID,
        _orgCache:      { orgId: ORG_ID, role: "owner", name: "Old Org", defaultLocationId: null },
        _locationCache: { locationId: LOC_A, locationName: "Alter Standort" }
      }
    });

    await mw(req, mockRes(), () => {});

    assert.strictEqual(req.orgId, ORG_ID_B);
    assert.equal(req.session._locationCache, undefined, "location cache must be cleared on org switch");
  });
});

// ═══════════════════════════════════════════════════════════════
// Session cache
// ═══════════════════════════════════════════════════════════════

describe("orgContextMiddleware — session cache", () => {
  it("uses cached org when available (no DB query)", async () => {
    const mw = orgContextMiddleware(noQueryPool());
    const req = mockReq({
      session: {
        userId: USER_ID,
        _orgCache: { orgId: ORG_ID, role: "admin", name: "Cached GmbH", defaultLocationId: null }
      }
    });
    let nextCalled = false;

    await mw(req, mockRes(), () => { nextCalled = true; });

    assert.ok(nextCalled);
    assert.strictEqual(req.orgId, ORG_ID);
    assert.strictEqual(req.orgRole, "admin");
    assert.strictEqual(req.orgName, "Cached GmbH");
  });
});

// ═══════════════════════════════════════════════════════════════
// Primary org fallback + caching
// ═══════════════════════════════════════════════════════════════

describe("orgContextMiddleware — primary org resolution", () => {
  it("resolves primary org and caches in session", async () => {
    const pool = sequencePool(
      { rows: [{ org_id: ORG_ID }] },  // users.org_id lookup
      { rows: [MEMBERSHIP] }            // getMembership
    );
    const mw = orgContextMiddleware(pool);
    const req = mockReq();
    let nextCalled = false;

    await mw(req, mockRes(), () => { nextCalled = true; });

    assert.ok(nextCalled);
    assert.strictEqual(req.orgId, ORG_ID);
    assert.strictEqual(req.orgRole, "owner");
    assert.ok(req.session._orgCache);
    assert.strictEqual(req.session._orgCache.orgId, ORG_ID);
  });

  it("no membership → org fields not set, still calls next", async () => {
    const pool = sequencePool(
      { rows: [] },  // users.org_id: null
      { rows: [] }   // fallback membership: none
    );
    const mw = orgContextMiddleware(pool);
    const req = mockReq();
    let nextCalled = false;

    await mw(req, mockRes(), () => { nextCalled = true; });

    assert.ok(nextCalled);
    assert.strictEqual(req.orgId, undefined);
  });
});

// ═══════════════════════════════════════════════════════════════
// Location scope — locationScope field
// ═══════════════════════════════════════════════════════════════

describe("orgContextMiddleware — req.locationScope", () => {
  it("locationScope is 'org' when no location is selected", async () => {
    const pool = sequencePool(
      { rows: [{ org_id: ORG_ID }] },
      { rows: [MEMBERSHIP] }          // membership.location_id = null
    );
    const mw = orgContextMiddleware(pool);
    const req = mockReq();

    await mw(req, mockRes(), () => {});

    assert.strictEqual(req.locationScope, 'org');
    assert.strictEqual(req.locationId, undefined);
  });

  it("locationScope is 'bound' when membership has a default location", async () => {
    const pool = sequencePool(
      { rows: [{ org_id: ORG_ID }] },
      { rows: [MEMBERSHIP_BOUND] },         // membership.location_id = LOC_A
      { rows: [{ id: LOC_A, name: "HQ" }] } // resolveLocation for default
    );
    const mw = orgContextMiddleware(pool);
    const req = mockReq();

    await mw(req, mockRes(), () => {});

    assert.strictEqual(req.locationScope, 'bound');
    assert.strictEqual(req.locationId, LOC_A);
    assert.strictEqual(req.locationName, "HQ");
  });

  it("locationScope is 'active' when location explicitly chosen via header", async () => {
    const pool = sequencePool(
      { rows: [MEMBERSHIP] },               // getMembership for X-Org-Id
      { rows: [{ id: LOC_A, name: "Berlin" }] } // resolveLocation for X-Location-Id
    );
    const mw = orgContextMiddleware(pool);
    const req = mockReq({
      headers: { "x-org-id": ORG_ID, "x-location-id": LOC_A }
    });

    await mw(req, mockRes(), () => {});

    assert.strictEqual(req.locationScope, 'active');
    assert.strictEqual(req.locationId, LOC_A);
  });

  it("locationScope is null when no org context", async () => {
    const pool = sequencePool({ rows: [] }, { rows: [] }); // no user org, no membership
    const mw = orgContextMiddleware(pool);
    const req = mockReq();

    await mw(req, mockRes(), () => {});

    assert.strictEqual(req.locationScope, null);
    assert.strictEqual(req.orgId, undefined);
  });
});

// ═══════════════════════════════════════════════════════════════
// Location security rules (rules 3, 4)
// ═══════════════════════════════════════════════════════════════

describe("orgContextMiddleware — location security", () => {
  it("returns 403 when X-Location-Id does not belong to org (rule 3)", async () => {
    const pool = sequencePool(
      { rows: [MEMBERSHIP] },  // getMembership for X-Org-Id
      { rows: [] }             // resolveLocation: no match (cross-org location)
    );
    const mw = orgContextMiddleware(pool);
    const req = mockReq({
      headers: { "x-org-id": ORG_ID, "x-location-id": LOC_A }
    });
    const res = mockRes();
    let nextCalled = false;

    await mw(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res._status, 403);
    assert.equal(res._body?.error, "LOCATION_NOT_IN_ORG");
  });

  it("returns 403 when bound membership tries to switch location (rule 4)", async () => {
    const pool = sequencePool(
      { rows: [{ org_id: ORG_ID }] },
      { rows: [MEMBERSHIP_BOUND] } // membership.location_id = LOC_A
    );
    const mw = orgContextMiddleware(pool);
    const req = mockReq({
      // LOC_B !== LOC_A → binding violation
      headers: { "x-location-id": LOC_B }
    });
    const res = mockRes();
    let nextCalled = false;

    await mw(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res._status, 403);
    assert.equal(res._body?.error, "LOCATION_ACCESS_DENIED");
  });

  it("bound membership allowed to confirm its own location via X-Location-Id", async () => {
    const pool = sequencePool(
      { rows: [{ org_id: ORG_ID }] },
      { rows: [MEMBERSHIP_BOUND] },           // membership.location_id = LOC_A
      { rows: [{ id: LOC_A, name: "HQ" }] }  // resolveLocation for LOC_A (same as bound)
    );
    const mw = orgContextMiddleware(pool);
    const req = mockReq({
      headers: { "x-location-id": LOC_A }    // same as membership.location_id → allowed
    });

    await mw(req, mockRes(), () => {});

    assert.strictEqual(req.locationId, LOC_A);
    assert.strictEqual(req.locationScope, 'bound');
  });

  /*
   * MUTATION-KILL (Welle 2). Sechs Mutanten ueberlebten in dieser einen Zeile:
   *
   *     if (isBound && cached.locationId !== membershipLocationId) {
   *       delete req.session._locationCache;
   *
   * Feuert die Bereinigung nicht, laeuft der else-Zweig: der zwischengespeicherte
   * Standort wird aufgeloest und — weil isBound gilt — mit scope 'bound'
   * uebernommen. Ein an Standort A gebundenes Mitglied arbeitet dann auf
   * Standort B, innerhalb derselben Organisation und ohne jede Meldung.
   *
   * Der bestehende Test daneben deckt nur den ORG-Wechsel ab. Der gefaehrlichere
   * Fall ist der hier: gleiche Org, veralteter Standort, gebundene Mitgliedschaft.
   * Es ist der dritte Fundort derselben Klasse — nach getAllowedLocationsForMembership
   * und der Standort-Bindung in Welle 1.
   */
  it("verwirft einen zwischengespeicherten Standort, der nicht der gebundene ist", async () => {
    /*
     * Der Mock antwortet hier ABSICHTLICH abhaengig vom Parameter. Mit einer
     * festen Antwort haette der Test nicht getrennt: er saehe dieselbe Zeile,
     * egal ob nach dem gebundenen oder nach dem zwischengespeicherten Standort
     * gefragt wurde — und der Mutant haette ueberlebt. (Genau daran ist dieser
     * Test im ersten Anlauf gescheitert.) Beide Standorte existieren in der Org;
     * unterschieden wird ausschliesslich ueber die ANGEFRAGTE ID.
     */
    const namen = { [LOC_A]: "HQ", [LOC_B]: "Fremder Standort" };
    let n = 0;
    const pool = {
      query: async (_sql, params = []) => {
        n++;
        if (n === 1) return { rows: [{ org_id: ORG_ID }] };
        if (n === 2) return { rows: [MEMBERSHIP_BOUND] };
        const gefragt = params.find((p) => namen[p]);
        return gefragt ? { rows: [{ id: gefragt, name: namen[gefragt] }] } : { rows: [] };
      }
    };
    const mw = orgContextMiddleware(pool);
    const req = mockReq({
      session: {
        userId:         USER_ID,
        _locationCache: { locationId: LOC_B, locationName: "Fremder Standort" }
      }
    });

    await mw(req, mockRes(), () => {});

    assert.notStrictEqual(req.locationId, LOC_B,
      "der zwischengespeicherte Standort darf die Bindung nicht aushebeln");
    assert.strictEqual(req.locationId, LOC_A,
      "das Mitglied gehoert auf seinen gebundenen Standort");
  });

  it("stale cached location for wrong org gets cleared on org switch", async () => {
    const pool = sequencePool(
      { rows: [{ ...MEMBERSHIP, org_id: ORG_ID_B, org_name: "New" }] }  // new org
    );
    const mw = orgContextMiddleware(pool);
    const req = mockReq({
      headers: { "x-org-id": ORG_ID_B },
      session: {
        userId:         USER_ID,
        _orgCache:      { orgId: ORG_ID, role: "owner", name: "Old", defaultLocationId: null },
        _locationCache: { locationId: LOC_A, locationName: "Old Location" }
      }
    });

    await mw(req, mockRes(), () => {});

    assert.equal(req.session._locationCache, undefined, "stale cache must be cleared");
  });
});

// ═══════════════════════════════════════════════════════════════
// req.departmentId
// ═══════════════════════════════════════════════════════════════

describe("orgContextMiddleware — req.departmentId", () => {
  it("sets req.departmentId from membership.department_id", async () => {
    const pool = sequencePool(
      { rows: [{ org_id: ORG_ID }] },
      { rows: [MEMBERSHIP_WITH_DEPT] }
    );
    const mw = orgContextMiddleware(pool);
    const req = mockReq();

    await mw(req, mockRes(), () => {});

    assert.strictEqual(req.departmentId, MEMBERSHIP_WITH_DEPT.department_id);
  });

  it("req.departmentId is undefined when membership has no department", async () => {
    const pool = sequencePool(
      { rows: [{ org_id: ORG_ID }] },
      { rows: [MEMBERSHIP] }
    );
    const mw = orgContextMiddleware(pool);
    const req = mockReq();

    await mw(req, mockRes(), () => {});

    assert.strictEqual(req.departmentId, undefined);
  });
});

// ═══════════════════════════════════════════════════════════════
// Error resilience — non-blocking
// ═══════════════════════════════════════════════════════════════

describe("orgContextMiddleware — error resilience", () => {
  it("unexpected DB error → still calls next() (non-blocking)", async () => {
    const mw = orgContextMiddleware(errorPool());
    const req = mockReq();
    let nextCalled = false;

    await mw(req, mockRes(), () => { nextCalled = true; });

    assert.ok(nextCalled, "Middleware must not block on unexpected DB errors");
    assert.strictEqual(req.orgId, undefined);
  });

  it("legacy user without org_membership → no 500, calls next()", async () => {
    const pool = sequencePool(
      { rows: [{ org_id: null }] }, // users.org_id = null
      { rows: [] }                  // no memberships
    );
    const mw = orgContextMiddleware(pool);
    const req = mockReq();
    let nextCalled = false;

    await mw(req, mockRes(), () => { nextCalled = true; });

    assert.ok(nextCalled);
    assert.strictEqual(req.orgId, undefined);
  });
});
