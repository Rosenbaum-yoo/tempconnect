/**
 * M2.7 — die Entscheidungen der Zugangs-Middleware, Mutant fuer Mutant.
 *
 * `orgAccess.test.js` deckt `requireCompanyOrg` in seinen Hauptfaellen ab.
 * `requireOrgNotSuspended` — der Notschalter des Betreibers — hatte am
 * 2026-09-03 **keinen einzigen Test**. Ein Schalter, den niemand prueft, ist
 * eine Behauptung.
 *
 * Diese Datei prueft, was ein stiller Logik-Kipper anrichten wuerde: aus 403
 * wird 200, aus "gesperrt" wird "offen", aus einem Fehler wird ein Durchlass.
 * Jede Probe zielt auf eine ENTSCHEIDUNG, nicht auf eine Formulierung.
 *
 * Lauf: node --test --test-force-exit test/orgAccessMutanten.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requireCompanyOrg, requireOrgNotSuspended, verweigereArbeiter }
  from "../middleware/orgAccess.js";

const UID = "11111111-1111-1111-1111-111111111111";
const OID = "22222222-2222-2222-2222-222222222222";

const still = () => {};
const logger = { info: still, warn: still, error: still, debug: still };

/** Ein Protokoll, das sich merkt, WAS gemeldet wurde — nicht nur DASS. */
function protokoll() {
  const eintraege = [];
  const fn = (art) => (a, b) => eintraege.push({ art, nutzlast: a, text: b });
  return { eintraege, info: fn("info"), warn: fn("warn"), error: fn("error"), debug: fn("debug"),
    letzter: (art) => [...eintraege].reverse().find((x) => x.art === art) };
}

function antwortPool(zeilen) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => { calls.push({ sql: String(sql), params }); return zeilen; }
  };
}

function lauf(mw, req = {}) {
  return new Promise((fertig) => {
    let weiter = false;
    const res = {
      _code: 200, _rumpf: null,
      status(c) { this._code = c; return this; },
      json(b) { this._rumpf = b; fertig({ code: this._code, rumpf: b, weiter }); return this; }
    };
    const ergebnis = mw({ session: { userId: UID }, ...req }, res, () => {
      weiter = true;
      fertig({ code: null, rumpf: null, weiter: true });
    });
    if (ergebnis?.catch) ergebnis.catch(() => fertig({ code: res._code, rumpf: res._rumpf, weiter }));
  });
}

/* ══ requireOrgNotSuspended — der Notschalter ═════════════════════════════ */

describe("requireOrgNotSuspended", () => {
  const mw = (zeilen) => requireOrgNotSuspended({ pool: antwortPool(zeilen), logger });

  it("ohne Org-Kontext: 400, und der Handler laeuft NICHT", async () => {
    const r = await lauf(mw({ rows: [] }), { orgId: null });
    assert.equal(r.code, 400);
    assert.equal(r.rumpf?.error, "ORG_CONTEXT_REQUIRED");
    assert.equal(r.weiter, false, "ohne Org-Kontext darf nichts durchlaufen");
  });

  it("gesperrte Org: 403 — und der Handler laeuft NICHT", async () => {
    const r = await lauf(
      mw({ rows: [{ access_suspended_at: "2026-08-01T00:00:00.000Z" }] }),
      { orgId: OID });
    assert.equal(r.code, 403, "eine gesperrte Org kommt durch — der Notschalter ist tot");
    assert.equal(r.rumpf?.error, "ACCESS_SUSPENDED");
    assert.equal(r.weiter, false);
  });

  it("offene Org: der Handler laeuft, ohne Antwort davor", async () => {
    const r = await lauf(mw({ rows: [{ access_suspended_at: null }] }), { orgId: OID });
    assert.equal(r.weiter, true, "eine offene Org wird blockiert — der Schalter greift zu weit");
    assert.equal(r.code, null, "es wurde geantwortet, obwohl weitergereicht werden sollte");
  });

  it("Org gibt es nicht: der Handler laeuft (keine Zeile heisst nicht gesperrt)", async () => {
    const r = await lauf(mw({ rows: [] }), { orgId: OID });
    assert.equal(r.weiter, true);
  });

  it("Datenbankfehler: 500 und BLOCKIERT — fail-closed", async () => {
    const pool = { query: async () => { throw new Error("Verbindung weg"); } };
    const r = await lauf(requireOrgNotSuspended({ pool, logger }), { orgId: OID });
    assert.equal(r.code, 500, "ein Lesefehler darf nicht durchlassen");
    assert.equal(r.rumpf?.error, "SERVER_ERROR",
      "der Fehlerschluessel fehlt — der Aufrufer kann 'Wache kaputt' nicht von "
      + "'Zugang gesperrt' unterscheiden");
    assert.equal(r.weiter, false,
      "bei einem Fehler laeuft der Handler trotzdem — der Notschalter waere "
      + "genau dann offen, wenn die Datenbank klemmt");
  });

  it("sperrt auch ohne Sitzung, statt zu werfen", async () => {
    /* Die Protokollzeile liest `req.session?.userId`; ohne das Fragezeichen wuerde
       die Wache genau beim Sperren werfen und ein 500 statt eines 403 liefern. */
    const log = protokoll();
    const r = await lauf(
      requireOrgNotSuspended({ pool: antwortPool({ rows: [{ access_suspended_at: "2026-08-01" }] }), logger: log }),
      { orgId: OID, session: undefined });
    assert.equal(r.code, 403);
    assert.equal(log.letzter("warn")?.nutzlast?.userId, null,
      "ohne Sitzung gehoert dort null hin");
  });

  it("der eigene Fehlerschluessel wird benutzt, nicht der Standard", async () => {
    const r = await lauf(
      requireOrgNotSuspended({ pool: antwortPool({ rows: [{ access_suspended_at: "2026-08-01" }] }), logger },
        { errorCode: "PILOT_GESPERRT", errorMessage: "eigener Text" }),
      { orgId: OID });
    assert.equal(r.rumpf?.error, "PILOT_GESPERRT");
    assert.equal(r.rumpf?.message, "eigener Text");
  });

  it("fragt genau die Org der Anfrage ab, nicht irgendeine", async () => {
    const pool = antwortPool({ rows: [{ access_suspended_at: null }] });
    await lauf(requireOrgNotSuspended({ pool, logger }), { orgId: OID });
    assert.equal(pool.calls.length, 1, "erwartet genau eine Abfrage");
    assert.ok(/access_suspended_at/.test(pool.calls[0].sql),
      "die Abfrage liest nicht mehr die Sperrspalte");
    assert.deepEqual(pool.calls[0].params, [OID],
      "die Sperre wird gegen eine ANDERE Org geprueft als die der Anfrage");
  });
});

/* ══ requireCompanyOrg — die Raender ══════════════════════════════════════ */

describe("requireCompanyOrg — die Raender", () => {
  const mit = (m) => requireCompanyOrg({ pool: antwortPool({ rows: m ? [m] : [] }), logger });

  it("die zwischengespeicherte Mitgliedschaft wird benutzt, ohne zweite Abfrage", async () => {
    const pool = antwortPool({ rows: [] });
    const r = await lauf(requireCompanyOrg({ pool, logger }),
      { orgId: OID, orgMembership: { org_type: "company", role_key: "owner" } });
    assert.equal(r.weiter, true);
    assert.equal(pool.calls.length, 0,
      "trotz vorhandener Mitgliedschaft wurde nachgeschlagen — bei jeder Anfrage");
  });

  it("Grossschreibung und Leerzeichen aendern das Urteil nicht", async () => {
    for (const typ of ["COMPANY", " company ", "Company"]) {
      const r = await lauf(mit({ org_type: typ, role_key: "owner" }), { orgId: OID });
      assert.equal(r.weiter, true, `'${typ}' wird abgewiesen`);
    }
    for (const typ of ["AGENCY", " agency "]) {
      const r = await lauf(mit({ org_type: typ, role_key: "owner" }), { orgId: OID });
      assert.equal(r.code, 403, `'${typ}' kommt durch`);
    }
  });

  it("ein Lesefehler blockiert mit 500, statt durchzulassen", async () => {
    const pool = { query: async () => { throw new Error("Verbindung weg"); } };
    const r = await lauf(requireCompanyOrg({ pool, logger }), { orgId: OID });
    assert.equal(r.code, 500);
    assert.equal(r.rumpf?.error, "SERVER_ERROR",
      "der Fehlerschluessel fehlt — der Aufrufer kann 'Wache kaputt' nicht von "
      + "'Zugang verweigert' unterscheiden");
    assert.equal(r.weiter, false, "ein Lesefehler darf nicht durchlassen");
  });

  it("eine Mitgliedschaft OHNE Org-Typ kommt NICHT durch", async () => {
    /*
     * Fail-closed, seit M2.7. Vorher stand hier `if (orgType && orgType !== "company")`
     * und ein leerer Typ passierte die Wache. Erreichbar war das nicht — die Spalte
     * ist NOT NULL und alle drei Quellen lesen sie mit —, aber der Zweig haengt damit
     * an einer Datenbankbedingung statt an dieser Wache. Diese Probe haelt fest,
     * dass er nicht zurueckkommt.
     */
    for (const typ of [null, undefined, "", "   "]) {
      const r = await lauf(mit({ org_type: typ, role_key: "owner" }), { orgId: OID });
      assert.equal(r.weiter, false,
        `org_type ${JSON.stringify(typ)} kommt durch — fail-open an der Unternehmens-Wache`);
      assert.equal(r.code, 403);
    }
  });

  it("protokolliert auch dann, wenn es gar keine Sitzung gibt", async () => {
    /*
     * Die Protokollzeile liest `req.session?.userId`. Faellt das Fragezeichen weg,
     * wirft die Wache genau dort, wo sie ablehnen soll — und aus einem sauberen 403
     * wird ein 500. Deshalb ein Fall ganz OHNE Sitzung.
     */
    const log = protokoll();
    const r = await lauf(
      requireCompanyOrg({ pool: antwortPool({ rows: [] }), logger: log }),
      { orgId: OID, session: undefined, orgMembership: { org_type: "agency", role_key: "owner" } });
    assert.equal(r.code, 403, "ohne Sitzung wird geworfen statt abgelehnt");
    const e = log.letzter("warn");
    assert.ok(e, "keine Spur");
    assert.equal(e.nutzlast?.userId, null, "ohne Sitzung gehoert dort null hin");
  });

  it("ohne Sitzung wird gar nicht erst nachgeschlagen", async () => {
    const pool = antwortPool({ rows: [] });
    const r = await lauf(requireCompanyOrg({ pool, logger }), { orgId: OID, session: null });
    assert.equal(r.code, 403);
    assert.equal(r.rumpf?.error, "NO_ORG_MEMBERSHIP");
    assert.equal(pool.calls.length, 0,
      "ohne Sitzung wurde die Datenbank befragt — eine Abfrage ohne Nutzer ist sinnlos");
  });

  it("fragt Nutzer UND Org ab, in dieser Reihenfolge", async () => {
    const pool = antwortPool({ rows: [{ org_type: "company", role_key: "owner" }] });
    await lauf(requireCompanyOrg({ pool, logger }), { orgId: OID });
    assert.deepEqual(pool.calls[0].params, [UID, OID],
      "die Mitgliedschaft wird mit den falschen Werten gesucht");
  });

  it("die aufgeloeste Mitgliedschaft haengt danach am Request", async () => {
    const pool = antwortPool({ rows: [{ org_type: "company", role_key: "finance" }] });
    const req = { session: { userId: UID }, orgId: OID };
    await new Promise((f) => requireCompanyOrg({ pool, logger })(req,
      { status() { return this; }, json() { f(); return this; } }, f));
    assert.equal(req.orgMembership?.role_key, "finance",
      "nachfolgende Handler muessten erneut nachschlagen");
  });
});

/* ══ Was eine Abweisung hinterlaesst ══════════════════════════════════════ */

describe("jede Abweisung ist nachvollziehbar", () => {
  /*
   * Das Protokoll ist hier kein Format, sondern der Auditvertrag: wer eine
   * Sperre untersucht, braucht WELCHE Org, WELCHER Mensch und WARUM. Fehlt ein
   * Feld, beginnt die Suche bei null — und das faellt erst im Ernstfall auf.
   * Deshalb steht die Nutzlast hier als Zusicherung, nicht die Formulierung.
   */

  it("requireCompanyOrg meldet Org, Typ und Mensch", async () => {
    const log = protokoll();
    const r = await lauf(
      requireCompanyOrg({ pool: antwortPool({ rows: [{ org_type: "agency", role_key: "owner" }] }), logger: log }),
      { orgId: OID });
    assert.equal(r.code, 403);
    const e = log.letzter("warn");
    assert.ok(e, "eine Abweisung ohne Spur — sie waere unsichtbar");
    assert.equal(e.nutzlast?.orgId, OID, "die Org fehlt in der Meldung");
    assert.equal(e.nutzlast?.orgType, "agency", "der Grund (der Org-Typ) fehlt");
    assert.equal(e.nutzlast?.userId, UID, "der Mensch fehlt");
    assert.ok(typeof e.text === "string" && e.text.length > 10, "die Meldung ist leer");
  });

  it("requireOrgNotSuspended meldet Org und Mensch", async () => {
    const log = protokoll();
    const r = await lauf(
      requireOrgNotSuspended({ pool: antwortPool({ rows: [{ access_suspended_at: "2026-08-01" }] }), logger: log }),
      { orgId: OID });
    assert.equal(r.code, 403);
    const e = log.letzter("warn");
    assert.ok(e, "eine gesperrte Org wird ohne Spur abgewiesen");
    assert.equal(e.nutzlast?.orgId, OID);
    assert.equal(e.nutzlast?.userId, UID);
    assert.ok(typeof e.text === "string" && e.text.length > 10);
  });

  it("verweigereArbeiter meldet, WELCHE Rolle abgewiesen wurde", async () => {
    const log = protokoll();
    const r = await lauf(verweigereArbeiter({ logger: log }),
      { orgId: OID, orgMembership: { role_key: "worker" } });
    assert.equal(r.code, 403);
    const e = log.letzter("warn");
    assert.ok(e, "der Riegel schweigt");
    assert.equal(e.nutzlast?.orgId, OID);
    assert.equal(e.nutzlast?.userId, UID);
    assert.equal(e.nutzlast?.rolle, "worker",
      "ohne die Rolle ist nicht erkennbar, WARUM abgewiesen wurde");
    assert.ok(typeof e.text === "string" && e.text.length > 10);
  });

  it("verweigereArbeiter protokolliert auch ohne Sitzung", async () => {
    /* Die Nutzlast liest `req.session?.userId`. Ohne das Fragezeichen wuerde der
       Riegel beim Abweisen werfen — und ein geworfener Riegel ist kein Riegel. */
    const log = protokoll();
    const r = await lauf(verweigereArbeiter({ logger: log }),
      { orgId: undefined, session: undefined, orgMembership: { role_key: "worker" } });
    assert.equal(r.code, 403);
    const e = log.letzter("warn");
    assert.ok(e, "keine Spur");
    assert.equal(e.nutzlast?.userId, null);
    assert.equal(e.nutzlast?.orgId, null, "ohne Org-Kontext gehoert dort null hin");
  });

  it("verweigereArbeiter kommt auch ohne Protokoll aus", () => {
    /* Der Riegel wird auch aus Tests und kleinen Skripten heraus gebaut. Ein
       fehlendes Protokoll darf ihn nicht werfen lassen — sonst faellt der Riegel
       genau dann aus, wenn er gebraucht wird. */
    let code = null;
    verweigereArbeiter({})({ orgMembership: { role_key: "worker" }, session: {} },
      { status(c) { code = c; return this; }, json() { return this; } }, () => {});
    assert.equal(code, 403);
    assert.doesNotThrow(() => verweigereArbeiter()({ session: {} },
      { status() { return this; }, json() { return this; } }, () => {}));
  });

  it("ein Lesefehler wird mit seiner Ursache protokolliert, nicht nur gezaehlt", async () => {
    for (const [name, bau] of [
      ["requireCompanyOrg", requireCompanyOrg],
      ["requireOrgNotSuspended", requireOrgNotSuspended]
    ]) {
      const log = protokoll();
      const pool = { query: async () => { throw new Error("Verbindung weg"); } };
      const r = await lauf(bau({ pool, logger: log }), { orgId: OID });
      assert.equal(r.code, 500, `${name}: kein 500`);
      const e = log.letzter("error");
      assert.ok(e, `${name}: der Fehler wird verschluckt`);
      assert.ok(e.nutzlast?.err, `${name}: die Ursache fehlt in der Meldung`);
      assert.ok(typeof e.text === "string" && e.text.length > 10, `${name}: leere Meldung`);
    }
  });

  it("die Ablehnungen nennen einen lesbaren Grund, nicht nur einen Schluessel", async () => {
    /* Ein Fehlerschluessel ohne Text landet unuebersetzt vor einem Menschen. */
    const faelle = [
      [requireCompanyOrg({ pool: antwortPool({ rows: [{ org_type: "agency" }] }), logger }), { orgId: OID }, "BUYER_ORG_REQUIRED"],
      [requireOrgNotSuspended({ pool: antwortPool({ rows: [{ access_suspended_at: "2026-08-01" }] }), logger }), { orgId: OID }, "ACCESS_SUSPENDED"],
      [verweigereArbeiter({ logger }), { orgId: OID, orgMembership: { role_key: "worker" } }, "WORKER_NOT_ALLOWED"]
    ];
    for (const [mw, req, schluessel] of faelle) {
      const r = await lauf(mw, req);
      assert.equal(r.rumpf?.error, schluessel, `erwartet ${schluessel}`);
      assert.ok(typeof r.rumpf?.message === "string" && r.rumpf.message.length >= 20,
        `${schluessel}: ohne lesbaren Text`);
    }
  });
});

/* ══ Beide Riegel tragen einen NAMEN ══════════════════════════════════════ */

describe("die Riegel sind benannt", () => {
  it("jede Zugangs-Middleware traegt einen Namen", () => {
    /*
     * `middleware/rbac.js` traegt die Lehre schon im Quelltext: eine anonyme
     * Middleware ist in Stapelspuren unsichtbar, und KEIN Waechter kann fragen
     * "traegt DIESE Route eine Zugangspruefung?" — er kann nur zaehlen. Genau so
     * blieb dort ein Befund lange unentdeckt.
     *
     * `requireCompanyOrg` und `requireOrgNotSuspended` hatten diesen Namen bis
     * M2.7 nicht. Sie haben ihn jetzt, und diese Probe haelt ihn fest.
     */
    const faelle = [
      [requireCompanyOrg({ pool: antwortPool({ rows: [] }), logger }), "requireCompanyOrgMiddleware"],
      [requireOrgNotSuspended({ pool: antwortPool({ rows: [] }), logger }), "requireOrgNotSuspendedMiddleware"],
      [verweigereArbeiter({ logger }), "verweigereArbeiterMiddleware"]
    ];
    for (const [mw, name] of faelle) {
      assert.equal(mw.name, name,
        `die Middleware heisst '${mw.name}' statt '${name}' — ein Waechter, der `
        + "Ketten nach Namen durchsucht, sieht sie nicht");
    }
  });
});
