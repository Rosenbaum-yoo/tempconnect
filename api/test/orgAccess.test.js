import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requireCompanyOrg, requireAgencyOrg } from "../middleware/orgAccess.js";

function mockLogger() {
  return {
    warnCalls: [],
    errorCalls: [],
    warn(payload, message) { this.warnCalls.push({ payload, message }); },
    error(payload, message) { this.errorCalls.push({ payload, message }); }
  };
}

function mockRes() {
  const res = {
    _status: 200,
    _json: null,
    status(code) { this._status = code; return this; },
    json(payload) { this._json = payload; return this; }
  };
  return res;
}

describe("requireCompanyOrg", () => {
  it("returns ORG_CONTEXT_REQUIRED without an organization context", async () => {
    const logger = mockLogger();
    const middleware = requireCompanyOrg({ pool: { query: async () => ({ rows: [] }) }, logger });
    const req = { session: { userId: "user-1" } };
    const res = mockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res._status, 400);
    assert.deepEqual(res._json, { error: "ORG_CONTEXT_REQUIRED" });
  });

  it("returns NO_ORG_MEMBERSHIP when no membership can be resolved", async () => {
    const logger = mockLogger();
    const pool = { query: async () => ({ rows: [] }) };
    const middleware = requireCompanyOrg({ pool, logger });
    const req = { orgId: "org-1", session: { userId: "user-1" } };
    const res = mockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res._status, 403);
    assert.deepEqual(res._json, {
      error: "NO_ORG_MEMBERSHIP",
      message: "Organisations-Mitgliedschaft erforderlich."
    });
  });

  it("denies non-company memberships with the configured buyer-only error", async () => {
    const logger = mockLogger();
    const pool = {
      query: async () => ({
        rows: [{ org_id: "org-1", org_type: "agency", role_key: "owner" }]
      })
    };
    const middleware = requireCompanyOrg({ pool, logger }, {
      errorCode: "EXECUTIVE_DASHBOARD_NOT_AVAILABLE_FOR_ORG_TYPE",
      errorMessage: "Steuerung & Analytik steht nur fuer Unternehmensorganisationen zur Verfuegung."
    });
    const req = { orgId: "org-1", session: { userId: "user-1" } };
    const res = mockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res._status, 403);
    assert.deepEqual(res._json, {
      error: "EXECUTIVE_DASHBOARD_NOT_AVAILABLE_FOR_ORG_TYPE",
      message: "Steuerung & Analytik steht nur fuer Unternehmensorganisationen zur Verfuegung."
    });
    assert.equal(logger.warnCalls.length, 1);
  });

  it("allows company memberships and stores the resolved membership on the request", async () => {
    const logger = mockLogger();
    const membership = { org_id: "org-1", org_type: "company", role_key: "owner" };
    const pool = { query: async () => ({ rows: [membership] }) };
    const middleware = requireCompanyOrg({ pool, logger });
    const req = { orgId: "org-1", session: { userId: "user-1" } };
    const res = mockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(res._status, 200);
    assert.equal(req.orgMembership.org_type, "company");
    assert.equal(logger.errorCalls.length, 0);
  });

  // P2-D: Worker-Portal Abgrenzung — Worker explizit auf Company-Routen sperren
  it("sperrt Worker (org_type=worker) von Company-Routen mit 403", async () => {
    const logger = mockLogger();
    const pool = {
      query: async () => ({
        rows: [{ org_id: "org-w", org_type: "worker", role_key: "member" }]
      })
    };
    const middleware = requireCompanyOrg({ pool, logger });
    const req = { orgId: "org-w", session: { userId: "worker-user-1" } };
    const res = mockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false, "next() darf nicht aufgerufen werden fuer Worker");
    assert.equal(res._status, 403);
    assert.equal(res._json.error, "BUYER_ORG_REQUIRED");
    assert.equal(logger.warnCalls.length, 1, "Warnung muss geloggt werden");
  });

  it("sperrt Worker mit custom errorCode von Company-Routen", async () => {
    const logger = mockLogger();
    const pool = {
      query: async () => ({
        rows: [{ org_id: "org-w", org_type: "worker", role_key: "member" }]
      })
    };
    const middleware = requireCompanyOrg({ pool, logger }, {
      errorCode: "SPEND_ANALYTICS_NOT_AVAILABLE_FOR_ORG_TYPE",
      errorMessage: "Spend Analytics steht nur fuer Unternehmensorganisationen zur Verfuegung."
    });
    const req = { orgId: "org-w", session: { userId: "worker-user-2" } };
    const res = mockRes();

    await middleware(req, res, () => {});

    assert.equal(res._status, 403);
    assert.equal(res._json.error, "SPEND_ANALYTICS_NOT_AVAILABLE_FOR_ORG_TYPE");
  });
});

describe("M3.7 · requireAgencyOrg — das Arbeitskraefte-Modul gehoert der Zeitarbeitsfirma", () => {
  /*
   * ═══════════════════════════════════════════════════════════════════════════
   * DAS TOR PRUEFTE DEN TARIF UND NICHT DIE SEITE
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * `routes/workers.js` hing an `requireWorkerFeature` — einem PLAN-Tor.
   * `worker_module` tragen PLUS, PRO, INDIVIDUELL und ENTERPRISE, gleich ob
   * Zeitarbeitsfirma oder Unternehmen. Ein Unternehmen auf PRO konnte damit
   * Arbeitskraefte importieren und verwalten.
   *
   * GEMESSEN AM 2026-09-04: von 65 Wegen mit diesem Stapel sind 36 belegbar
   * agenturseitig (`supplierOrgId` im Rumpf), NULL kundenseitig.
   * `workerService` schreibt 87-mal `supplier_org_id` und einmal
   * `client_org_id`. Ein Unternehmen, das hier importiert, erzeugt
   * Arbeitskraefte, deren LIEFERANT ein Unternehmen ist — ein Widerspruch im
   * Datenmodell, nicht bloss eine Rechtefrage.
   */

  /** Ein Pool, der die Org-Art zurueckgibt und jede Abfrage mitschreibt. */
  function orgPool(typ) {
    const abfragen = [];
    return {
      abfragen,
      query: async (sql, params) => {
        abfragen.push({ sql: String(sql), params: params || [] });
        return typ === null
          ? { rows: [], rowCount: 0 }
          : { rows: [{ org_type: typ }], rowCount: 1 };
      }
    };
  }

  async function fahren(middleware, req) {
    const res = mockRes();
    let weiter = false;
    await middleware(req, res, () => { weiter = true; });
    return { res, weiter };
  }

  it("eine Agentur kommt durch", async () => {
    const pool = orgPool("agency");
    const e = await fahren(requireAgencyOrg({ pool, logger: mockLogger() }),
      { orgId: "org-1", session: { userId: "u-1" } });
    assert.equal(e.weiter, true);
    assert.equal(e.res._status, 200);
  });

  it("ein Unternehmen bekommt 403 — die Abnahme von M3.7", async () => {
    const pool = orgPool("company");
    const e = await fahren(requireAgencyOrg({ pool, logger: mockLogger() }),
      { orgId: "org-1", session: { userId: "u-1" } });
    assert.equal(e.weiter, false);
    assert.equal(e.res._status, 403);
    assert.equal(e.res._json.error, "AGENCY_ORG_REQUIRED");
  });

  it("EIN MASCHINENSCHLUESSEL KOMMT DURCH — hinter ihm steht kein Mensch", async () => {
    /*
     * DER FEHLER, DEN DIE ERSTE FASSUNG HATTE, und er waere ein Ausfall
     * gewesen, kein Schoenheitsfehler.
     *
     * Sie holte die Org-Art ueber `getMembership(pool, req.session.userId, ...)`.
     * `middleware/apiKeyAuth.js` setzt aber NUR `req.orgId` (Zeile 50 und 79)
     * und nie `req.orgMembership` — ein Schluessel hat keine Mitgliedschaft,
     * weil hinter ihm kein Mensch steht. JEDER Maschinenschluessel haette ab
     * dem Deploy 403 bekommen.
     *
     * Gefunden hat es nicht diese Datei, sondern `workers.scope.test.js`: dort
     * bekam eine NACHBARzusicherung ploetzlich einen anderen Fehlercode. Genau
     * dafuer sind Nachbarproben da.
     */
    const pool = orgPool("agency");
    const e = await fahren(requireAgencyOrg({ pool, logger: mockLogger() }),
      { orgId: "org-1", isApiKeyAuth: true, apiKeyId: "k-1" });   // KEINE session, KEINE Mitgliedschaft
    assert.equal(e.weiter, true,
      "Ein Maschinenschluessel ohne Mitgliedschaft wurde gesperrt — genau der Ausfall, "
      + "den die erste Fassung dieses Riegels gehabt haette");
    assert.ok(pool.abfragen.some((a) => /FROM\s+organizations/i.test(a.sql)),
      "die Org-Art wurde nicht bei der ORGANISATION erfragt");
    assert.deepEqual(pool.abfragen[0].params, ["org-1"],
      "gefragt wurde nach einer anderen Org als der der Anfrage");
  });

  it("eine bereits geladene Mitgliedschaft spart die Abfrage", async () => {
    /* Die Abkuerzung darf das Ergebnis nicht aendern — nur den Weg dorthin. */
    const pool = orgPool(null);   // wuerde fail-closed antworten
    const e = await fahren(requireAgencyOrg({ pool, logger: mockLogger() }),
      { orgId: "org-1", orgMembership: { org_type: "agency" } });
    assert.equal(e.weiter, true);
    assert.equal(pool.abfragen.length, 0, "es wurde trotz geladener Mitgliedschaft abgefragt");
  });

  it("ohne Org-Kontext: 400, und zwar bevor irgendetwas gefragt wird", async () => {
    const pool = orgPool("agency");
    const e = await fahren(requireAgencyOrg({ pool, logger: mockLogger() }), { session: { userId: "u-1" } });
    assert.equal(e.res._status, 400);
    assert.equal(e.res._json.error, "ORG_CONTEXT_REQUIRED");
    assert.equal(pool.abfragen.length, 0);
  });

  it("fail-closed: eine unbekannte oder leere Org-Art kommt NICHT durch", async () => {
    /*
     * Dieselbe Lehre wie bei `requireCompanyOrg` in M2.7: dort stand
     * `if (orgType && orgType !== "company")`, und eine Mitgliedschaft ohne
     * Org-Art kam durch — fail-OPEN an der Wache, die entscheidet, wer welche
     * Flaeche sieht. Hier gilt von Anfang an: was kein `agency` ist, kommt
     * nicht durch, auch nicht, wenn es gar nichts ist.
     */
    for (const typ of [null, "", "  ", "unbekannt", "worker"]) {
      const pool = typ === null ? orgPool(null) : orgPool(typ);
      const e = await fahren(requireAgencyOrg({ pool, logger: mockLogger() }),
        { orgId: "org-1", session: { userId: "u-1" } });
      assert.equal(e.weiter, false, `Org-Art ${JSON.stringify(typ)} kam durch`);
      assert.equal(e.res._status, 403);
    }
  });

  it("Schreibweise entscheidet nicht", async () => {
    for (const typ of ["AGENCY", " Agency ", "agency"]) {
      const pool = orgPool(typ);
      const e = await fahren(requireAgencyOrg({ pool, logger: mockLogger() }),
        { orgId: "org-1", session: { userId: "u-1" } });
      assert.equal(e.weiter, true, `Org-Art ${JSON.stringify(typ)} wurde nicht erkannt`);
    }
  });

  it("ein Lesefehler blockiert, statt zu oeffnen", async () => {
    const pool = { query: async () => { throw new Error("Datenbank weg"); } };
    const logger = mockLogger();
    const e = await fahren(requireAgencyOrg({ pool, logger }), { orgId: "org-1", session: { userId: "u-1" } });
    assert.equal(e.weiter, false, "ein Datenbankfehler hat die Tuer geoeffnet");
    assert.equal(e.res._status, 500);
    assert.equal(logger.errorCalls.length, 1, "der Fehlschlag wurde nicht protokolliert");
  });

  it("die Middleware traegt einen Namen", async () => {
    /* Eine anonyme Middleware ist in Stapelspuren unsichtbar, und kein Waechter
     * kann fragen "traegt DIESE Route die Pruefung?" — dieselbe Lehre wie in
     * M2.7 fuer requireCompanyOrg. */
    const m = requireAgencyOrg({ pool: orgPool("agency"), logger: mockLogger() });
    assert.equal(m.name, "requireAgencyOrgMiddleware");
  });
});
