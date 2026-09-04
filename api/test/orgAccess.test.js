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

describe("requireCompanyOrg · der Zwischenspeicher darf die Anfrage nicht vergiften", () => {
  /*
   * Aus der Mutationspruefung: `if (membership) req.orgMembership = membership;`
   * liess sich zu `if (true)` machen, ohne dass etwas rot wurde. Fuer DIESE
   * Wache ist das folgenlos — die naechste Zeile antwortet ohnehin mit 403.
   *
   * Folgenlos ist es aber nur HIER. `req.orgMembership` ist ein gemeinsames
   * Feld: `arbeiterSitzung` liest es, `requireAgencyOrg` nimmt es als
   * Abkuerzung. Eine Wache, die es im Ablehnungsfall auf `null` setzt, hat der
   * Anfrage etwas hinzugefuegt, das vorher nicht dastand — und die naechste
   * Schicht kann das nicht von "geladen und leer" unterscheiden.
   */
  it("bei fehlender Mitgliedschaft bleibt das Feld unberuehrt", async () => {
    const pool = { query: async () => ({ rows: [] }) };
    const req = { orgId: "org-1", session: { userId: "u-1" } };
    const res = mockRes();
    await requireCompanyOrg({ pool, logger: mockLogger() })(req, res, () => {});

    assert.equal(res._status, 403);
    assert.equal(res._json.error, "NO_ORG_MEMBERSHIP");
    assert.ok(!("orgMembership" in req),
      "die Wache hat `req.orgMembership` gesetzt, obwohl sie keine gefunden hat — "
      + "die naechste Schicht sieht dann ein leeres Feld statt gar keines");
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

  it("die Abfrage fragt WIRKLICH nach der Org-Art dieser Org", async () => {
    /*
     * FORM- UND BINDUNGSPROBE, und sie ist noetig, weil der Muster-Pool auf
     * JEDE Abfrage dasselbe antwortet. Ohne sie steht der Abfragetext nirgends
     * fest: man koennte `organizations` durch `users` ersetzen, `type` durch
     * irgendetwas, und alle anderen Proben blieben gruen.
     *
     * Genau dafuer sieht die Mutations-Direktive die Form-Probe vor: eine
     * DB-freie Suite kann den Mutanten in einem SQL-Text nicht toeten, weil sie
     * die Abfrage nie ausfuehrt — also wird ihr Vertrag Bestandteil fuer
     * Bestandteil festgenagelt.
     */
    const pool = orgPool("agency");
    await fahren(requireAgencyOrg({ pool, logger: mockLogger() }),
      { orgId: "org-42", session: { userId: "u-1" } });

    const { sql, params } = pool.abfragen[0];
    assert.match(sql, /FROM\s+organizations/i, "es wird eine andere Tabelle gefragt");
    assert.match(sql, /SELECT\s+type\s+AS\s+org_type/i,
      "die Spalte heisst anders — dann ist `rows[0].org_type` immer undefined und "
      + "der Riegel sperrt jeden");
    assert.match(sql, /WHERE\s+id = \$1/i, "es wird nicht nach der Kennung gefiltert");
    assert.deepEqual(params, ["org-42"],
      "gefragt wurde nach einer anderen Org als der der Anfrage");
  });

  it("die Abkuerzung ueber die Mitgliedschaft haengt nicht an der Schreibweise", async () => {
    /*
     * Dieselbe Luecke wie in `arbeiterSitzung`, nur auf dem anderen Pfad:
     * `org_type` kommt aus der Datenbank. Ein " Agency " oder "AGENCY" aus einem
     * Import oder einer Migration darf den Riegel nicht schliessen — sonst
     * sperrt er eine Agentur aus, und der Fehler sieht aus wie eine Rechtefrage.
     */
    for (const typ of ["AGENCY", " agency ", "\tAgency\n"]) {
      const pool = orgPool(null);   // wuerde fail-closed antworten
      const e = await fahren(requireAgencyOrg({ pool, logger: mockLogger() }),
        { orgId: "org-1", orgMembership: { org_type: typ } });
      assert.equal(e.weiter, true, `Mitgliedschaft mit ${JSON.stringify(typ)} wurde gesperrt`);
      assert.equal(pool.abfragen.length, 0, "die Abkuerzung hat trotzdem abgefragt");
    }
  });

  it("die Meldung an den Aufrufer ist ein Vertrag, kein Text", async () => {
    /* Der Fehlercode wird von Oberflaechen ausgewertet (die Einsatzportal-Seite
     * unterscheidet ihn von RATE_LIMIT und WORKER_LIMIT_EXCEEDED). Und die
     * Meldung muss dem Menschen sagen, WARUM — "verboten" allein schickt ihn in
     * den Support. */
    const e = await fahren(requireAgencyOrg({ pool: orgPool("company"), logger: mockLogger() }),
      { orgId: "org-1", session: { userId: "u-1" } });
    assert.equal(e.res._json.error, "AGENCY_ORG_REQUIRED");
    assert.match(e.res._json.message, /Zeitarbeitsfirma/,
      "die Meldung nennt nicht, wem der Bereich gehoert");
    assert.match(e.res._json.message, /Unternehmenskonto/,
      "die Meldung nennt nicht, wer hier steht");
  });

  it("Code und Meldung lassen sich je Einsatzort ueberschreiben", async () => {
    /* Sonst waere die Schnittstelle eine Behauptung: `options` steht in der
     * Signatur, und niemand haette gemerkt, dass sie ignoriert wird. */
    const e = await fahren(
      requireAgencyOrg({ pool: orgPool("company"), logger: mockLogger() },
        { errorCode: "NUR_AGENTUR", errorMessage: "Eigener Text." }),
      { orgId: "org-1", session: { userId: "u-1" } });
    assert.equal(e.res._json.error, "NUR_AGENTUR");
    assert.equal(e.res._json.message, "Eigener Text.");
  });

  it("die Sperre wird protokolliert — mit Org, Art und Mensch", async () => {
    /*
     * Kein Formatierungs-Logging, sondern der AUDITVERTRAG. Wer eine Sperre
     * untersucht, braucht drei Angaben: WELCHE Org, WELCHE Art, WELCHER Mensch.
     * Fehlt eine, beginnt die Suche bei null — und das faellt erst im Ernstfall
     * auf. Dieselbe Begruendung wie bei `requireCompanyOrg` in M2.7.
     */
    const logger = mockLogger();
    await fahren(requireAgencyOrg({ pool: orgPool("company"), logger }),
      { orgId: "org-7", session: { userId: "u-9" } });

    assert.equal(logger.warnCalls.length, 1, "die Sperre wurde nicht protokolliert");
    const { payload, message } = logger.warnCalls[0];
    assert.equal(payload.orgId, "org-7");
    assert.equal(payload.orgType, "company");
    assert.equal(payload.userId, "u-9");
    assert.match(String(message), /denied/i, "der Eintrag benennt den Vorgang nicht");
  });

  it("ohne Sitzung steht `null` im Protokoll, nicht `undefined`", async () => {
    /* Ein Maschinenschluessel hat keinen Menschen. `null` ist die Aussage
     * "niemand", `undefined` faellt beim Serialisieren still heraus — und dann
     * sieht der Eintrag aus, als haette jemand das Feld vergessen. */
    const logger = mockLogger();
    await fahren(requireAgencyOrg({ pool: orgPool("company"), logger }),
      { orgId: "org-7", isApiKeyAuth: true });
    assert.strictEqual(logger.warnCalls[0].payload.userId, null);
  });

  it("der Fehlerzweig meldet SERVER_ERROR und protokolliert den Grund", async () => {
    /* Der Zweig, den niemand freiwillig betritt — und deshalb der, in dem ein
     * falscher Rumpf am laengsten unbemerkt bleibt. */
    const logger = mockLogger();
    const pool = { query: async () => { throw new Error("Datenbank weg"); } };
    const e = await fahren(requireAgencyOrg({ pool, logger }),
      { orgId: "org-1", session: { userId: "u-1" } });

    assert.equal(e.res._status, 500);
    assert.deepEqual(e.res._json, { error: "SERVER_ERROR" },
      "der Rumpf des Fehlerfalls hat sich geaendert — Oberflaechen werten ihn aus");
    assert.equal(logger.errorCalls.length, 1);
    assert.ok(logger.errorCalls[0].payload.err, "der Grund fehlt im Protokoll");
    assert.match(String(logger.errorCalls[0].message), /Agency-org guard/i,
      "der Eintrag benennt die Wache nicht — in einem Protokoll voller Fehler ist "
      + "das der Unterschied zwischen Fund und Rauschen");
  });

  it("die volle Meldung steht fest, nicht nur ihr Anfang", async () => {
    /* Aus der Mutationspruefung: die zweite Zeile der Meldung liess sich
     * ersetzen, weil beide bisherigen Zusicherungen auf die ERSTE zielten. Eine
     * Meldung, von der nur der Anfang festgenagelt ist, kann in der Haelfte
     * etwas anderes sagen. */
    const e = await fahren(requireAgencyOrg({ pool: orgPool("company"), logger: mockLogger() }),
      { orgId: "org-1", session: { userId: "u-1" } });
    assert.match(e.res._json.message, /keine eigenen Arbeitskraefte/,
      "die Meldung sagt nicht mehr, was ein Unternehmenskonto hier NICHT tut");
  });

  it("eine unbekannte Org wird als leere Art protokolliert, nicht als Erfindung", async () => {
    /* Der Unterschied zwischen "nachgesehen und nichts gefunden" und "hier stand
     * irgendetwas". Im Protokoll ist das die Frage, ob jemand die Org sucht oder
     * den Code. */
    const logger = mockLogger();
    await fahren(requireAgencyOrg({ pool: orgPool(null), logger }),
      { orgId: "org-unbekannt", session: { userId: "u-1" } });
    assert.strictEqual(logger.warnCalls[0].payload.orgType, "",
      "eine Org ohne Zeile muss als leere Art erscheinen");
  });

  it("die Middleware traegt einen Namen", async () => {
    /* Eine anonyme Middleware ist in Stapelspuren unsichtbar, und kein Waechter
     * kann fragen "traegt DIESE Route die Pruefung?" — dieselbe Lehre wie in
     * M2.7 fuer requireCompanyOrg. */
    const m = requireAgencyOrg({ pool: orgPool("agency"), logger: mockLogger() });
    assert.equal(m.name, "requireAgencyOrgMiddleware");
  });
});
