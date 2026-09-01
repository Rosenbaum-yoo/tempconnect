/**
 * M3 — die 6 A-Faelle aus `middleware/orgContext.js`.
 *
 * WAS HIER AUF DEM SPIEL STEHT
 * Diese Middleware entscheidet fuer JEDE angemeldete Anfrage, als welche
 * Organisation und an welchem Standort sie laeuft. Ihre sechs offenen Faelle
 * betreffen drei Zusagen, die anderswo im Code vorausgesetzt werden:
 *
 *   1. Eine kaputte UUID im Kopf wird ABGEWIESEN (400), nicht stillschweigend
 *      uebernommen — beide Anker des Musters tragen diese Zusage.
 *   2. Ein nicht aufloesbarer Org-Wunsch faellt auf die EIGENE Org zurueck
 *      (Regel 7). Waere `req.orgId` danach leer, schalteten sich 45
 *      Grenzpruefungen der Form `if (req.orgId && fremd) 403` selbst ab — das
 *      war bis zum 2026-07-26 ein erreichbares Cross-Org-Leck.
 *   3. Nur der HEADER gilt als Absicht, die Organisation zu wechseln, und nur
 *      ein echter Wechsel verwirft den Standort-Cache (Regel 6).
 *
 * Die uebrigen 18 Faelle dieser Datei bekommen bewusst keinen Test; die
 * Begruendung steht je Fall in
 * `docs/qualitaet/mutation/2026-08-14-rbac/triage.json` — die meisten sind
 * gleichwertige Mutanten, die gar nicht toetbar sind.
 *
 * Diese Datei muss in `stryker.rbac.conf.json` unter `commandRunner` stehen.
 * DB-frei (Mock-Pool).
 * Run: node --test --test-force-exit test/orgContextMutanten.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { orgContextMiddleware } from "../middleware/orgContext.js";

const ORG_A = "a0b1c2d3-e4f5-6789-abcd-ef0123456789";
const ORG_B = "b1c2d3e4-f5a6-7890-bcde-f01234567890";
const LOC_A = "c2d3e4f5-a6b7-8901-cdef-012345678901";
const USER = "user-abc-123";

const MITGLIED_A = { org_id: ORG_A, role_key: "owner", org_name: "Test GmbH", location_id: null, department_id: null };

function pool(...antworten) {
  let i = 0;
  const abfragen = [];
  return {
    abfragen,
    query: async (sql, params) => {
      abfragen.push({ sql, params });
      if (i >= antworten.length) throw new Error(`Unerwartete Abfrage #${i + 1}: ${sql.slice(0, 60)}`);
      return antworten[i++];
    },
  };
}

function req(overrides = {}) {
  return { session: { userId: USER }, headers: {}, query: {}, body: {}, ...overrides };
}

function res() {
  const r = { _status: 200, _body: null };
  r.status = (s) => ((r._status = s), r);
  r.json = (b) => ((r._body = b), r);
  return r;
}

/** Middleware laufen lassen und melden, ob sie durchgelassen hat. */
async function lauf(p, anfrage) {
  const antwort = res();
  let weiter = false;
  await orgContextMiddleware(p)(anfrage, antwort, () => {
    weiter = true;
  });
  return { antwort, weiter };
}

/* ═══════════════════════════════════════════════════════════
 *  Die beiden Anker des UUID-Musters
 *
 *  Ohne Anfangsanker passiert "muell<uuid>" die Pruefung, ohne Endanker
 *  "<uuid>muell". Beides sind Werte, die anschliessend als Org- bzw.
 *  Standort-Kennung weiterverwendet wuerden.
 * ═══════════════════════════════════════════════════════════ */

describe("M3 — eine kaputte Kennung wird abgewiesen, nicht uebernommen", () => {
  it("nr 0: Muell VOR der UUID wird abgewiesen (Anfangsanker)", async () => {
    const p = pool();
    const anfrage = req({ headers: { "x-org-id": `muell${ORG_A}` } });
    const { antwort, weiter } = await lauf(p, anfrage);

    assert.equal(antwort._status, 400, "Ohne Anfangsanker rutscht ein vorangestellter Rest durch");
    assert.equal(antwort._body.error, "INVALID_ORG_ID");
    assert.equal(weiter, false, "Nach einer 400 darf die Kette nicht weiterlaufen");
    assert.equal(p.abfragen.length, 0, "Und es darf keine Abfrage mit dem kaputten Wert geben");
  });

  it("nr 1: Muell NACH der UUID wird abgewiesen (Endanker)", async () => {
    const p = pool();
    const anfrage = req({ headers: { "x-location-id": `${LOC_A}muell` } });
    const { antwort, weiter } = await lauf(p, anfrage);

    assert.equal(antwort._status, 400, "Ohne Endanker rutscht ein angehaengter Rest durch");
    assert.equal(antwort._body.error, "INVALID_LOCATION_ID");
    assert.equal(weiter, false);
    assert.equal(p.abfragen.length, 0);
  });

  it("die Gegenprobe: eine saubere UUID kommt durch", async () => {
    const p = pool({ rows: [MITGLIED_A] });
    const anfrage = req({ headers: { "x-org-id": ORG_A } });
    const { antwort, weiter } = await lauf(p, anfrage);

    assert.equal(antwort._status, 200);
    assert.equal(weiter, true);
    assert.equal(anfrage.orgId, ORG_A);
  });
});

/* ═══════════════════════════════════════════════════════════
 *  Regel 7 — der Kontext bleibt nie leer
 * ═══════════════════════════════════════════════════════════ */

describe("M3 — ein unaufloesbarer Org-Wunsch faellt auf die eigene Org zurueck", () => {
  it("nr 8: fremde Org im Kopf, keine Mitgliedschaft -> eigene Org, nicht leer", async () => {
    const p = pool(
      { rows: [] }, // getMembership fuer die fremde Org: keine Mitgliedschaft
      { rows: [{ org_id: ORG_A }] }, // getPrimaryOrg: users.org_id
      { rows: [MITGLIED_A] } // getMembership fuer die eigene Org
    );
    const anfrage = req({ headers: { "x-org-id": ORG_B } });
    const { weiter } = await lauf(p, anfrage);

    assert.equal(weiter, true);
    assert.equal(
      anfrage.orgId,
      ORG_A,
      "Der Kontext muss auf die EIGENE Org fallen. Bleibt er leer, schalten sich 45 " +
        "Grenzpruefungen der Form 'if (req.orgId && fremd) 403' selbst ab — genau im Angriffsfall"
    );
    assert.notEqual(anfrage.orgId, ORG_B, "Und niemals die gewuenschte fremde Org");
  });
});

/* ═══════════════════════════════════════════════════════════
 *  Regel 6 — nur der Header ist eine Absicht
 * ═══════════════════════════════════════════════════════════ */

describe("M3 — nur der Header wechselt die Organisation dauerhaft", () => {
  it("nr 9: ein ?org_id= in der Adresszeile landet NICHT im Sitzungs-Cache", async () => {
    const p = pool({ rows: [MITGLIED_A] });
    const anfrage = req({ query: { org_id: ORG_A } });
    await lauf(p, anfrage);

    assert.equal(anfrage.orgId, ORG_A, "Als Wunsch fuer diese eine Anfrage gilt er");
    assert.equal(
      anfrage.session._orgCache,
      undefined,
      "Aber er darf nicht in den Cache — sonst wirkt ein Wert aus der Adresszeile in allen " +
        "folgenden Anfragen weiter, ohne dass ihn jemand noch einmal nennt"
    );
  });

  it("nr 10 + 11: derselbe Org-Kopf laesst den Standort-Cache stehen", async () => {
    const p = pool(
      { rows: [MITGLIED_A] }, // getMembership
      { rows: [{ id: LOC_A, name: "Werk Nord" }] } // resolveLocation fuer den Cache-Standort
    );
    const anfrage = req({
      headers: { "x-org-id": ORG_A },
      session: {
        userId: USER,
        _orgCache: { orgId: ORG_A, role: "owner", name: "Test GmbH", defaultLocationId: null },
        _locationCache: { locationId: LOC_A, locationName: "Werk Nord" },
      },
    });

    await lauf(p, anfrage);

    assert.ok(
      anfrage.session._locationCache,
      "Ohne echten Org-Wechsel darf der Standort-Cache nicht verworfen werden — sonst " +
        "verliert der Nutzer bei jeder Anfrage seine Standortwahl und sieht wieder org-weit"
    );
    assert.equal(anfrage.locationId, LOC_A);
    assert.equal(anfrage.locationScope, "active");
  });

  it("die Gegenrichtung: ein echter Org-Wechsel verwirft den Standort-Cache", async () => {
    const p = pool(
      { rows: [MITGLIED_A] }, // getMembership fuer ORG_A
      { rows: [] } // etwaige Standort-Aufloesung laeuft ins Leere
    );
    const anfrage = req({
      headers: { "x-org-id": ORG_A },
      session: {
        userId: USER,
        _orgCache: { orgId: ORG_B, role: "owner", name: "Andere GmbH", defaultLocationId: null },
        _locationCache: { locationId: LOC_A, locationName: "Werk Nord" },
      },
    });

    await lauf(p, anfrage);

    assert.equal(
      anfrage.session._locationCache,
      undefined,
      "Nach einem Org-Wechsel waere der alte Standort ein Standort der FREMDEN Organisation"
    );
  });
});

/* ═══════════════════════════════════════════════════════════
 *  NACHTRAG — Mutationslauf 2026-09-01
 *
 *  WARUM ES DIESEN BLOCK GIBT
 *  Der Lauf vom 2026-09-01 meldet in `middleware/orgContext.js` 14 Stellen,
 *  an denen sich der Quelltext veraendern laesst, ohne dass eine Probe rot
 *  wird. Die Owner-Vorgabe verlangt 90 % je Bereich — und diese Datei
 *  entscheidet fuer JEDE angemeldete Anfrage, als welche Organisation und an
 *  welchem Standort sie laeuft. Eine unbewachte Zeile ist hier keine
 *  Formsache, sondern die Mandantengrenze selbst.
 *
 *  Die schwerste der gemeldeten Stellen ist die Brauchbarkeitspruefung des
 *  Sitzungs-Zwischenspeichers. Wird dort das `&&` zu einem `||`, gilt der
 *  Zwischenspeicher eines FREMDEN Nutzers als brauchbar und `req.orgId` zeigt
 *  auf dessen Organisation. Genau dieser Effekt war am 2026-08-21 im
 *  Vorgangsprotokoll zaehlbar: 102 Eintraege trugen eine Org, in der der
 *  Handelnde nie Mitglied war. Der erste Fall unten haelt ihn fest.
 *
 *  Aufbau und Hilfsmittel wie oben: derselbe Mock-Pool, dasselbe
 *  `req()` / `res()` / `lauf()`. Keine zweite Bauart daneben.
 * ═══════════════════════════════════════════════════════════ */

const LOC_B = "d3e4f5a6-b7c8-9012-def0-123456789012";
const USER_FREMD = "user-fremd-999";

/** Mitgliedschaft, die fest an einen Standort gebunden ist (Regel 4). */
const MITGLIED_GEBUNDEN = { ...MITGLIED_A, location_id: LOC_A };

describe("Nachtrag — der Sitzungs-Zwischenspeicher gehoert genau einem Nutzer", () => {
  // Der Schaden: uebernimmt jemand eine Sitzung, ohne sie neu zu erzeugen, erbt
  // er die Organisation seines Vorgaengers. 45 Routen pruefen die Mandanten-
  // grenze als `if (req.orgId && fremd) 403` — sie pruefen dann gegen die
  // FALSCHE Org und lassen fremde Daten durch.
  it("ein Zwischenspeicher eines ANDEREN Nutzers wird nicht wiederverwendet, sondern verworfen", async () => {
    const p = pool(
      { rows: [{ org_id: ORG_A }] }, // getPrimaryOrg: users.org_id
      { rows: [MITGLIED_A] } // getMembership fuer die eigene Org
    );
    const anfrage = req({
      session: {
        userId: USER,
        _orgCache: {
          userId: USER_FREMD,
          orgId: ORG_B,
          role: "owner",
          name: "Fremd GmbH",
          defaultLocationId: LOC_A,
        },
        _locationCache: { locationId: LOC_A, locationName: "Werk Nord" },
      },
    });

    const { weiter } = await lauf(p, anfrage);

    assert.equal(weiter, true);
    assert.equal(
      anfrage.orgId,
      ORG_A,
      "Der Kontext muss frisch fuer DIESEN Nutzer aufgeloest werden — niemals aus dem " +
        "Zwischenspeicher des Vorgaengers"
    );
    assert.notEqual(anfrage.orgId, ORG_B, "Und niemals die Organisation des fremden Nutzers");
    assert.equal(
      anfrage.session._orgCache.userId,
      USER,
      "Der neu geschriebene Zwischenspeicher traegt den Nutzer, fuer den er gilt"
    );
    assert.equal(anfrage.session._orgCache.orgId, ORG_A);
    assert.equal(
      anfrage.session._locationCache,
      undefined,
      "Der Standort des Vorgaengers gehoert zu dessen Org und muss mit verworfen werden — " +
        "sonst bleibt ein fremder Standort im Kontext haengen"
    );
    assert.equal(anfrage.locationScope, "org");
    assert.equal(
      p.abfragen.length,
      2,
      "Zwei Abfragen belegen, dass die Org wirklich neu aufgeloest und nicht geerbt wurde"
    );
  });

  it("der eigene Zwischenspeicher wird ohne einzige Abfrage wiederverwendet", async () => {
    const p = pool(); // jede Abfrage waere hier ein Fehler
    const anfrage = req({
      session: {
        userId: USER,
        _orgCache: {
          userId: USER,
          orgId: ORG_A,
          role: "owner",
          name: "Test GmbH",
          defaultLocationId: null,
        },
      },
    });

    const { weiter } = await lauf(p, anfrage);

    assert.equal(weiter, true);
    assert.equal(anfrage.orgId, ORG_A);
    assert.equal(anfrage.orgRole, "owner");
    assert.equal(anfrage.orgName, "Test GmbH");
    assert.equal(
      p.abfragen.length,
      0,
      "Der Schnellpfad spart die Aufloesung — sonst kostet jede Anfrage der Plattform zwei Abfragen"
    );
    assert.equal(
      anfrage.orgMembership,
      undefined,
      "Auf dem Schnellpfad wird bewusst keine Mitgliedschaftszeile gesetzt: sie waere veraltet"
    );
    assert.equal(anfrage.locationScope, "org");
  });
});

describe("Nachtrag — was der Nutzer bei einer Abweisung zu lesen bekommt", () => {
  // Antwort-Koerper sind das, was beim Aufrufer ankommt. Eine leere Meldung
  // laesst ihn ratlos zurueck und macht aus einem klaren Eingabefehler ein
  // vermeintliches Serverproblem.
  it("eine kaputte Org-Kennung wird mit Grund und Klartext abgewiesen", async () => {
    const p = pool();
    const anfrage = req({ headers: { "x-org-id": "keine-uuid" } });
    const { antwort, weiter } = await lauf(p, anfrage);

    assert.equal(antwort._status, 400);
    assert.deepEqual(antwort._body, {
      error: "INVALID_ORG_ID",
      message: "X-Org-Id muss eine gültige UUID sein.",
    });
    assert.equal(weiter, false);
  });

  it("eine kaputte Standort-Kennung wird mit Grund und Klartext abgewiesen", async () => {
    const p = pool();
    const anfrage = req({ headers: { "x-location-id": "keine-uuid" } });
    const { antwort, weiter } = await lauf(p, anfrage);

    assert.equal(antwort._status, 400);
    assert.deepEqual(antwort._body, {
      error: "INVALID_LOCATION_ID",
      message: "X-Location-Id muss eine gültige UUID sein.",
    });
    assert.equal(weiter, false);
  });

  // Zugriffsverweigerung: hier muss ausser dem Code auch der Grund stehen —
  // der Aufrufer soll unterscheiden koennen zwischen "du darfst den Standort
  // nicht wechseln" und "diesen Standort gibt es in deiner Org nicht".
  it("eine standortgebundene Mitgliedschaft darf den Standort nicht wechseln und erfaehrt warum", async () => {
    const p = pool({ rows: [MITGLIED_GEBUNDEN] });
    const anfrage = req({ headers: { "x-org-id": ORG_A, "x-location-id": LOC_B } });
    const { antwort, weiter } = await lauf(p, anfrage);

    assert.equal(antwort._status, 403);
    assert.deepEqual(antwort._body, {
      error: "LOCATION_ACCESS_DENIED",
      message: "Ihre Mitgliedschaft ist auf einen festen Standort beschränkt.",
    });
    assert.equal(weiter, false, "Nach einer Verweigerung darf die Kette nicht weiterlaufen");
    assert.equal(
      p.abfragen.length,
      1,
      "Der fremde Standort darf nach der Verweigerung nicht mehr nachgeschlagen werden"
    );
  });

  it("ein Standort ausserhalb der eigenen Org wird abgewiesen und erfaehrt warum", async () => {
    const p = pool(
      { rows: [MITGLIED_A] }, // getMembership: ungebundene Mitgliedschaft
      { rows: [] } // resolveLocation: der Standort gehoert nicht zur Org
    );
    const anfrage = req({ headers: { "x-org-id": ORG_A, "x-location-id": LOC_B } });
    const { antwort, weiter } = await lauf(p, anfrage);

    assert.equal(antwort._status, 403);
    assert.deepEqual(antwort._body, {
      error: "LOCATION_NOT_IN_ORG",
      message: "Der Standort gehört nicht zu Ihrer Organisation oder ist inaktiv.",
    });
    assert.equal(weiter, false);
    assert.equal(anfrage.locationId, undefined, "Ein abgewiesener Standort wird nie gesetzt");
  });
});

describe("Nachtrag — der Standort-Kontext steht am Ende jeder Anfrage fest", () => {
  // Der Schaden: stuerzt die Aufloesung mittendrin ab, faengt das `catch` den
  // Fehler still auf — und die Anfrage laeuft mit UNBESTIMMTEM Standort-Umfang
  // weiter. "org-weit" ist eine Entscheidung, `undefined` ist keine.
  it("ohne Sitzungs-Zwischenspeicher endet die Anfrage org-weit, nicht unbestimmt", async () => {
    const p = pool({ rows: [MITGLIED_A] });
    const anfrage = req({ query: { org_id: ORG_A } });
    const { weiter } = await lauf(p, anfrage);

    assert.equal(weiter, true);
    assert.equal(anfrage.orgId, ORG_A);
    assert.equal(
      anfrage.locationScope,
      "org",
      "Ohne Zwischenspeicher und ohne gebundenen Standort ist der Umfang die ganze Org"
    );
    assert.equal(p.abfragen.length, 1, "Und das ohne einen Nachschlag in org_locations");
  });

  it("ein zwischengespeicherter Standort, den es nicht mehr gibt, faellt org-weit zurueck", async () => {
    const p = pool(
      { rows: [MITGLIED_A] }, // getMembership
      { rows: [] } // resolveLocation: Standort geloescht oder deaktiviert
    );
    const anfrage = req({
      headers: { "x-org-id": ORG_A },
      session: {
        userId: USER,
        _locationCache: { locationId: LOC_A, locationName: "Werk Nord" },
      },
    });

    const { weiter } = await lauf(p, anfrage);

    assert.equal(weiter, true);
    assert.equal(anfrage.locationId, undefined, "Ein toter Standort wird nicht gesetzt");
    assert.equal(anfrage.locationScope, "org");
    assert.equal(
      anfrage.session._locationCache,
      undefined,
      "Der tote Eintrag muss aus der Sitzung verschwinden — sonst laeuft bei JEDER folgenden " +
        "Anfrage derselbe vergebliche Nachschlag"
    );
  });

  it("ein deaktivierter gebundener Standort laesst die Anfrage org-weit laufen, nicht unbestimmt", async () => {
    const p = pool(
      { rows: [MITGLIED_GEBUNDEN] }, // getMembership: an LOC_A gebunden
      { rows: [] } // resolveLocation: LOC_A ist inaktiv
    );
    const anfrage = req({ headers: { "x-org-id": ORG_A } });
    const { weiter } = await lauf(p, anfrage);

    assert.equal(weiter, true);
    assert.equal(anfrage.locationId, undefined);
    assert.equal(
      anfrage.locationScope,
      "org",
      "Auch hier gilt: ein leerer Umfang ist keine Entscheidung, sondern ein verschluckter Fehler"
    );
  });
});

describe("Nachtrag — ein veralteter Standort in der Sitzung wird wirklich entfernt", () => {
  // Der Schaden: bleibt der veraltete Eintrag stehen, wirkt er in dem Moment
  // wieder, in dem die Standortbindung der Mitgliedschaft aufgehoben wird —
  // dann sieht der Nutzer ploetzlich einen Standort, den er nie gewaehlt hat.
  it("bei gebundener Mitgliedschaft wird ein abweichender Eintrag verworfen und der gebundene Standort gesetzt", async () => {
    const p = pool(
      { rows: [MITGLIED_GEBUNDEN] }, // getMembership: an LOC_A gebunden
      { rows: [{ id: LOC_A, name: "Werk Nord" }] } // resolveLocation fuer den gebundenen Standort
    );
    const anfrage = req({
      headers: { "x-org-id": ORG_A },
      session: {
        userId: USER,
        _locationCache: { locationId: LOC_B, locationName: "Werk Sued" },
      },
    });

    const { weiter } = await lauf(p, anfrage);

    assert.equal(weiter, true);
    assert.equal(
      anfrage.session._locationCache,
      undefined,
      "Der abweichende Eintrag muss aus der Sitzung entfernt werden, nicht nur uebergangen"
    );
    assert.equal(anfrage.locationId, LOC_A, "Es gilt der gebundene Standort der Mitgliedschaft");
    assert.equal(anfrage.locationName, "Werk Nord");
    assert.equal(anfrage.locationScope, "bound");
  });

  it("ein passender Eintrag loest genau EINEN Nachschlag aus, nicht zwei", async () => {
    const p = pool(
      { rows: [MITGLIED_GEBUNDEN] }, // getMembership: an LOC_A gebunden
      { rows: [{ id: LOC_A, name: "Werk Nord" }] } // resolveLocation aus dem Zwischenspeicher
    );
    const anfrage = req({
      headers: { "x-org-id": ORG_A },
      session: {
        userId: USER,
        _locationCache: { locationId: LOC_A, locationName: "Werk Nord" },
      },
    });

    await lauf(p, anfrage);

    assert.equal(anfrage.locationId, LOC_A);
    assert.equal(anfrage.locationScope, "bound");
    const standortAbfragen = p.abfragen.filter((a) => a.sql.includes("org_locations"));
    assert.equal(
      standortAbfragen.length,
      1,
      "Ein bereits aufgeloester Standort wird nicht erneut nachgeschlagen — die zweite Abfrage " +
        "faellt sonst bei JEDER Anfrage jedes Nutzers an"
    );
  });
});

describe("Nachtrag — die Middleware haelt auch unvollstaendige Anfragen aus", () => {
  // Der Schaden: diese Middleware haengt vor ALLEN angemeldeten Routen. Ein
  // Absturz beim Lesen von `req.query` / `req.body` — beides liegt VOR dem
  // schuetzenden `try` — reisst nicht eine Route, sondern die ganze Flaeche mit.
  it("eine Anfrage ohne query-Objekt wird normal aufgeloest", async () => {
    const p = pool({ rows: [{ org_id: ORG_A }] }, { rows: [MITGLIED_A] });
    const anfrage = req({ query: undefined, body: undefined });
    const { weiter } = await lauf(p, anfrage);

    assert.equal(weiter, true);
    assert.equal(anfrage.orgId, ORG_A);
  });

  it("eine Anfrage ohne body-Objekt wird normal aufgeloest", async () => {
    const p = pool({ rows: [{ org_id: ORG_A }] }, { rows: [MITGLIED_A] });
    const anfrage = req({ query: { seite: "2" }, body: undefined });
    const { weiter } = await lauf(p, anfrage);

    assert.equal(weiter, true);
    assert.equal(anfrage.orgId, ORG_A);
  });

  it("ein zwischengespeicherter Standort ohne Kennung loest keine Abfrage aus", async () => {
    const p = pool(); // jede Abfrage waere hier eine mit leerer Kennung
    const anfrage = req({
      session: {
        userId: USER,
        _orgCache: {
          userId: USER,
          orgId: ORG_A,
          role: "owner",
          name: "Test GmbH",
          defaultLocationId: null,
        },
        // Eintrag aus einer aelteren Fassung: die Kennung fehlt.
        _locationCache: { locationId: null, locationName: "Werk Nord" },
      },
    });

    const { weiter } = await lauf(p, anfrage);

    assert.equal(weiter, true);
    assert.equal(
      p.abfragen.length,
      0,
      "Mit leerer Kennung darf gar nicht erst gefragt werden — die Abfrage kann nur leer " +
        "ausgehen und kostet trotzdem eine Runde zur Datenbank"
    );
    assert.equal(
      anfrage.session._locationCache,
      undefined,
      "Der unbrauchbare Eintrag verlaesst die Sitzung"
    );
    assert.equal(anfrage.locationId, undefined);
    assert.equal(anfrage.locationScope, "org");
  });
});

describe("Nachtrag — ohne aufgeloeste Org gibt es keinen RLS-Helfer", () => {
  // Der Schaden: `req.setOrgContext` setzt `app.current_org_id`. Existiert der
  // Helfer, obwohl keine Org aufgeloest wurde, setzt ein Dienst, der ihn
  // arglos aufruft, die Mandantenkennung auf `undefined` — die Zeilen-
  // sicherheit haengt dann an einem Wert, den niemand gesetzt hat.
  it("nach einem Datenbankfehler laeuft die Anfrage weiter, aber ohne Org-Helfer", async () => {
    const p = pool(); // die Aufloesung scheitert an der ersten Abfrage
    const anfrage = req();
    const { antwort, weiter } = await lauf(p, anfrage);

    assert.equal(weiter, true, "Ein unerwarteter Datenbankfehler blockiert die Anfrage nicht");
    assert.equal(antwort._status, 200, "Und er wird nicht zu einer 400/403 umgedeutet");
    assert.equal(anfrage.orgId, undefined);
    assert.equal(
      anfrage.setOrgContext,
      undefined,
      "Ohne Org darf es den Helfer nicht geben — er wuerde app.current_org_id auf undefined setzen"
    );
  });

  it("mit aufgeloester Org steht der Helfer bereit und traegt genau diese Org ein", async () => {
    const p = pool({ rows: [MITGLIED_A] });
    const anfrage = req({ headers: { "x-org-id": ORG_A } });
    await lauf(p, anfrage);

    assert.equal(typeof anfrage.setOrgContext, "function");

    const abfragen = [];
    await anfrage.setOrgContext({ query: async (sql, params) => abfragen.push({ sql, params }) });
    assert.deepEqual(abfragen, [
      { sql: "SET LOCAL app.current_org_id = $1", params: [ORG_A] },
      { sql: "SET LOCAL app.rls_bypass = $1", params: [""] },
    ]);
  });
});
