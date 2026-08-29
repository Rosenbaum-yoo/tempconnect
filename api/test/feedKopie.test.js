/**
 * Der Feed faellt nie auf eine leere Liste zurueck (Welle K4).
 *
 * ANLASS: Am 26.08. warf `GET /capacity-exchange/feed` fuer JEDEN angemeldeten
 * Betrachter einen 500er — ein ueberzaehliger Bind-Parameter (Postgres 08P01),
 * behoben in `e845c2d`. Was ankam, war eine LEERE FLAECHE, und die ist
 * ununterscheidbar von "es gibt gerade keine Angebote": falsch, und sie
 * alarmiert niemanden.
 *
 * Owner-Entscheid: bei einem Fehler die letzte gute Liste zeigen, datiert.
 *
 * Run: node --test --test-force-exit test/feedKopie.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as kopie from "../services/feedKopieService.js";
import { createCapacityExchangeRouter } from "../routes/capacityExchange.js";

/* ── Werkzeug ──────────────────────────────────────────────────────────── */

function pool(antworten = {}) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params: params || [] });
      const s = String(sql);
      if (/INSERT INTO marktplatz_feed_kopie/i.test(s)) return antworten.insert ?? { rowCount: 1, rows: [] };
      if (/UPDATE marktplatz_feed_kopie/i.test(s)) return antworten.update ?? { rowCount: 1, rows: [] };
      if (/FROM marktplatz_feed_kopie/i.test(s)) return antworten.select ?? { rows: [] };
      return { rows: [] };
    },
    find(teil) { return calls.filter((c) => c.sql.includes(teil)); }
  };
}

const zeile = (over = {}) => ({
  inhalt: { items: [{ id: "a" }], total: 1 },
  eintraege: 1,
  erstellt_am: new Date("2026-08-27T14:20:00Z"),
  alter_stunden: 0.5,
  ...over
});

/* ── Welcher Abruf wird aufgehoben ─────────────────────────────────────── */

describe("K4 · nur die ungefilterte erste Seite wird kopiert", () => {
  it("Seite 1 ohne Filter ist kopierwuerdig", () => {
    assert.equal(kopie.istKopierwuerdig({ page: 1, limit: 25 }), true);
    assert.equal(kopie.istKopierwuerdig({}), true, "ohne page gilt Seite 1");
  });

  it("jeder einzelne Filter schliesst die Kopie aus", () => {
    /* Wer gefiltert hat, bekaeme im Fehlerfall sonst eine Liste, die seinen
     * Filter IGNORIERT — das waere eine neue Unwahrheit statt einer alten. */
    const filter = [
      "worker_category", "role", "location_city", "availability_from",
      "availability_window", "min_headcount", "shift_model", "compliance_status",
      "priority_level", "latitude", "longitude", "radius_km", "skill_tags",
      "merkmale", "sort"
    ];
    for (const f of filter) {
      assert.equal(kopie.istKopierwuerdig({ page: 1, [f]: "x" }), false, f);
    }
    assert.ok(filter.length >= 15, "die Filterliste ist geschrumpft — greift die Probe noch?");
  });

  it("Seite 2 ist nicht kopierwuerdig", () => {
    assert.equal(kopie.istKopierwuerdig({ page: 2 }), false);
  });
});

/* ── Schreiben ─────────────────────────────────────────────────────────── */

describe("K4 · die Kopie wird abgelegt", () => {
  it("eine gefuellte Liste wird aufgehoben", async () => {
    const p = pool();
    assert.equal(await kopie.kopieSchreiben(p, { items: [{ id: "a" }, { id: "b" }], total: 2 }), true);
    const ins = p.find("INSERT INTO marktplatz_feed_kopie")[0];
    assert.ok(ins, "kein INSERT beobachtet");
    assert.equal(ins.params[1], 2, "die Eintragszahl muss mitgeschrieben werden");
  });

  it("eine LEERE Liste wird NICHT aufgehoben", async () => {
    /* Sonst koennte ein einzelner leerer Moment zur dauerhaften
     * Rueckfall-Antwort werden — und der Rueckfall zeigte genau das, was er
     * verhindern soll. */
    const p = pool();
    assert.equal(await kopie.kopieSchreiben(p, { items: [], total: 0 }), false);
    assert.equal(p.find("INSERT INTO marktplatz_feed_kopie").length, 0);
  });

  it("ein Schreibfehler kippt nichts", async () => {
    const p = { query: async () => { throw new Error("Tabelle fehlt"); } };
    await assert.doesNotReject(() => kopie.kopieSchreiben(p, { items: [{ id: "a" }] }));
    assert.equal(await kopie.kopieSchreiben(p, { items: [{ id: "a" }] }), false);
  });
});

/* ── Lesen ─────────────────────────────────────────────────────────────── */

describe("K4 · die Kopie wird nur ausgeliefert, wenn sie taugt", () => {
  it("eine frische Kopie kommt zurueck", async () => {
    const p = pool({ select: { rows: [zeile()] } });
    const k = await kopie.kopieLesen(p);
    assert.ok(k, "die frische Kopie muss ausgeliefert werden");
    assert.deepEqual(k.inhalt.items, [{ id: "a" }]);
    assert.ok(k.erstellt_am, "ohne Datum darf sie nicht ausgeliefert werden");
  });

  it("gibt es keine Kopie, bleibt es beim ehrlichen Fehler", async () => {
    assert.equal(await kopie.kopieLesen(pool({ select: { rows: [] } })), null);
  });

  it("aelter als 24 Stunden wird NICHT mehr ausgeliefert", async () => {
    /* Ab da ist Schweigen ehrlicher als ein Stand von gestern, den jemand
     * fuer heute haelt. */
    const p = pool({ select: { rows: [zeile({ alter_stunden: 24.5 })] } });
    assert.equal(await kopie.kopieLesen(p), null);
  });

  it("genau an der Grenze wird noch ausgeliefert", async () => {
    const p = pool({ select: { rows: [zeile({ alter_stunden: kopie.HOECHSTALTER_STUNDEN })] } });
    assert.ok(await kopie.kopieLesen(p));
  });

  it("der Rueckfall wird gezaehlt", async () => {
    /* Es gibt keinen Kanal, der das Team erreicht — die Zahl ist das, was
     * bleibt. Ohne sie liefe der Marktplatz wochenlang aus der Konserve,
     * ohne dass es jemand sagen koennte. */
    const p = pool({ select: { rows: [zeile()] } });
    await kopie.kopieLesen(p);
    const upd = p.find("UPDATE marktplatz_feed_kopie")[0];
    assert.ok(upd, "der Rueckfall wurde nicht gezaehlt");
    assert.match(upd.sql, /rueckfaelle = rueckfaelle \+ 1/);
  });

  it("scheitert das Zaehlen, wird trotzdem ausgeliefert", async () => {
    /* Die Liste ist wichtiger als ihre Statistik. */
    const p = {
      query: async (sql) => {
        if (/UPDATE marktplatz_feed_kopie/i.test(String(sql))) throw new Error("Zaehler kaputt");
        return { rows: [zeile()] };
      }
    };
    const k = await kopie.kopieLesen(p);
    assert.ok(k, "ein kaputter Zaehler darf die Kopie nicht verschlucken");
  });

  it("ein Lesefehler wirft nicht, sondern liefert null", async () => {
    const p = { query: async () => { throw new Error("kaputt"); } };
    await assert.doesNotReject(() => kopie.kopieLesen(p));
    assert.equal(await kopie.kopieLesen(p), null);
  });
});

/* ── Rueckmutations-Sicherung ──────────────────────────────────────────── */

describe("K4 · S: die Proben wuerden einen Stummel bemerken", () => {
  it("istKopierwuerdig ist nicht einfach immer wahr", () => {
    assert.equal(kopie.istKopierwuerdig({ role: "Elektriker" }), false);
  });

  it("kopieLesen gibt nicht einfach immer etwas zurueck", async () => {
    assert.equal(await kopie.kopieLesen(pool({ select: { rows: [] } })), null);
  });
});

/* ── Die Verdrahtung: liefert die Route die Kopie wirklich aus? ─────────── */

describe("K4 · der Endpunkt greift auf die Kopie zurueck", () => {
  /*
   * DIE WICHTIGSTE PROBE DIESER DATEI.
   *
   * Die Fehlerklasse dieser Welle heisst "gebaut, montiert — und niemand
   * benutzt es". Ein Rueckfall, den der Endpunkt nie anfasst, waere gruen
   * getestet und im Ernstfall trotzdem stumm: der Betrachter saehe wieder eine
   * leere Flaeche.
   */

  /** Pool, der den Feed-Aufruf steuern kann und die Kopie bedient. */
  function routenPool({ feedWirft = false, kopieVorhanden = true } = {}) {
    const calls = [];
    return {
      calls,
      query: async (sql, params) => {
        const s = String(sql);
        calls.push({ sql: s, params: params || [] });

        if (/FROM marktplatz_feed_kopie/i.test(s)) {
          return kopieVorhanden
            ? { rows: [{
                inhalt: { items: [{ id: "aus-der-kopie" }], total: 1 },
                eintraege: 1,
                erstellt_am: new Date("2026-08-27T14:20:00Z"),
                alter_stunden: 0.5
              }] }
            : { rows: [] };
        }
        if (/marktplatz_feed_kopie/i.test(s)) return { rowCount: 1, rows: [] };

        /* Alles andere ist der Feed selbst. */
        if (feedWirft) throw new Error("bind message supplies 9 parameters");
        return { rows: [], rowCount: 0 };
      },
      connect: async () => ({ query: async () => ({ rows: [] }), release() {} }),
      find(teil) { return calls.filter((c) => c.sql.includes(teil)); }
    };
  }

  function deps(p) {
    const durchlassen = () => (_req, _res, next) => next();
    return {
      pool: p,
      requireAuth: durchlassen(),
      requireFeature: () => durchlassen(),
      getUserAndPlan: async () => ({ role: "company", plan: "PRO" }),
      logger: { warn() {}, info() {}, error() {} }
    };
  }

  function handler(router, pfad) {
    for (const layer of router.stack) {
      if (!layer.route || layer.route.path !== pfad) continue;
      if (!layer.route.methods.get) continue;
      return layer.route.stack[layer.route.stack.length - 1].handle;
    }
    throw new Error("Route GET " + pfad + " nicht gefunden");
  }

  const req = (query = {}) => ({
    session: { userId: "u-1" }, user: { id: "u-1" },
    params: {}, query, body: {}, headers: {}, orgId: null
  });

  function res() {
    const r = { _status: 200, _json: null };
    r.status = (c) => { r._status = c; return r; };
    r.json = (b) => { r._json = b; return r; };
    return r;
  }

  it("faellt der Feed, kommt die Kopie — mit sichtbarem Stand", async () => {
    const p = routenPool({ feedWirft: true });
    const r = res();
    await handler(createCapacityExchangeRouter(deps(p)), "/capacity-exchange/feed")(req(), r);

    assert.equal(r._status, 200, "der Betrachter darf keinen 500er sehen, solange eine Kopie da ist");
    assert.ok(r._json, "keine Antwort");
    assert.deepEqual(r._json.items, [{ id: "aus-der-kopie" }], "die Kopie wurde nicht ausgeliefert");
    assert.equal(r._json.aus_kopie, true, "ohne Kennzeichnung haelt der Betrachter sie fuer aktuell");
    assert.ok(r._json.kopie_stand, "ohne Datum ist die Kopie gefaehrlicher als gar keine");
  });

  it("ohne brauchbare Kopie bleibt es beim ehrlichen Fehler", async () => {
    const p = routenPool({ feedWirft: true, kopieVorhanden: false });
    const r = res();
    await handler(createCapacityExchangeRouter(deps(p)), "/capacity-exchange/feed")(req(), r);
    assert.equal(r._status, 500);
    assert.equal(r._json.error, "SERVER_ERROR");
  });

  it("mit Filter wird NICHT auf die Kopie zurueckgefallen", async () => {
    /* Wer nach Elektrikern gesucht hat, bekaeme sonst eine Liste, die seinen
     * Filter ignoriert — eine neue Unwahrheit statt einer alten. */
    const p = routenPool({ feedWirft: true });
    const r = res();
    await handler(createCapacityExchangeRouter(deps(p)), "/capacity-exchange/feed")(req({ role: "Elektriker" }), r);
    assert.equal(r._status, 500, "gefilterte Abrufe bekommen den ehrlichen Fehler");
  });
});
