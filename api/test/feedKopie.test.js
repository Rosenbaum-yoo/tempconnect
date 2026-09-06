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
    assert.equal(kopie.istKopierwuerdig({ page: 1, limit: 25, viewer_role: "company" }), true);
    assert.equal(kopie.istKopierwuerdig({ viewer_role: "company" }), true, "ohne page gilt Seite 1");
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
      assert.equal(kopie.istKopierwuerdig({ page: 1, viewer_role: "company", [f]: "x" }), false, f);
    }
    assert.ok(filter.length >= 15, "die Filterliste ist geschrumpft — greift die Probe noch?");
  });

  it("Seite 2 ist nicht kopierwuerdig", () => {
    assert.equal(kopie.istKopierwuerdig({ page: 2, viewer_role: "company" }), false);
  });
});

/* ── Schreiben ─────────────────────────────────────────────────────────── */

describe("K4 · die Kopie wird abgelegt", () => {
  it("eine gefuellte Liste wird aufgehoben", async () => {
    const p = pool();
    assert.equal(await kopie.kopieSchreiben(p, { items: [{ id: "a" }, { id: "b" }], total: 2 }, kopie.SEITEN.supply), true);
    const ins = p.find("INSERT INTO marktplatz_feed_kopie")[0];
    assert.ok(ins, "kein INSERT beobachtet");
    assert.equal(ins.params[1], 2, "die Eintragszahl muss mitgeschrieben werden");
  });

  it("eine LEERE Liste wird NICHT aufgehoben", async () => {
    /* Sonst koennte ein einzelner leerer Moment zur dauerhaften
     * Rueckfall-Antwort werden — und der Rueckfall zeigte genau das, was er
     * verhindern soll. */
    const p = pool();
    assert.equal(await kopie.kopieSchreiben(p, { items: [], total: 0 }, kopie.SEITEN.supply), false);
    assert.equal(p.find("INSERT INTO marktplatz_feed_kopie").length, 0);
  });

  it("ein Schreibfehler kippt nichts", async () => {
    const p = { query: async () => { throw new Error("Tabelle fehlt"); } };
    await assert.doesNotReject(() => kopie.kopieSchreiben(p, { items: [{ id: "a" }] }, kopie.SEITEN.supply));
    assert.equal(await kopie.kopieSchreiben(p, { items: [{ id: "a" }] }, kopie.SEITEN.supply), false);
  });
});

/* ── Lesen ─────────────────────────────────────────────────────────────── */

describe("K4 · die Kopie wird nur ausgeliefert, wenn sie taugt", () => {
  it("eine frische Kopie kommt zurueck", async () => {
    const p = pool({ select: { rows: [zeile()] } });
    const k = await kopie.kopieLesen(p, kopie.SEITEN.supply);
    assert.ok(k, "die frische Kopie muss ausgeliefert werden");
    assert.deepEqual(k.inhalt.items, [{ id: "a" }]);
    assert.ok(k.erstellt_am, "ohne Datum darf sie nicht ausgeliefert werden");
  });

  it("gibt es keine Kopie, bleibt es beim ehrlichen Fehler", async () => {
    assert.equal(await kopie.kopieLesen(pool({ select: { rows: [] } }), kopie.SEITEN.supply), null);
  });

  it("aelter als 24 Stunden wird NICHT mehr ausgeliefert", async () => {
    /* Ab da ist Schweigen ehrlicher als ein Stand von gestern, den jemand
     * fuer heute haelt. */
    const p = pool({ select: { rows: [zeile({ alter_stunden: 24.5 })] } });
    assert.equal(await kopie.kopieLesen(p, kopie.SEITEN.supply), null);
  });

  it("genau an der Grenze wird noch ausgeliefert", async () => {
    const p = pool({ select: { rows: [zeile({ alter_stunden: kopie.HOECHSTALTER_STUNDEN })] } });
    assert.ok(await kopie.kopieLesen(p, kopie.SEITEN.supply));
  });

  it("der Rueckfall wird gezaehlt", async () => {
    /* Es gibt keinen Kanal, der das Team erreicht — die Zahl ist das, was
     * bleibt. Ohne sie liefe der Marktplatz wochenlang aus der Konserve,
     * ohne dass es jemand sagen koennte. */
    const p = pool({ select: { rows: [zeile()] } });
    await kopie.kopieLesen(p, kopie.SEITEN.supply);
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
    const k = await kopie.kopieLesen(p, kopie.SEITEN.supply);
    assert.ok(k, "ein kaputter Zaehler darf die Kopie nicht verschlucken");
  });

  it("ein Lesefehler wirft nicht, sondern liefert null", async () => {
    const p = { query: async () => { throw new Error("kaputt"); } };
    await assert.doesNotReject(() => kopie.kopieLesen(p, kopie.SEITEN.supply));
    assert.equal(await kopie.kopieLesen(p, kopie.SEITEN.supply), null);
  });
});

/* ── Rueckmutations-Sicherung ──────────────────────────────────────────── */

describe("K4 · S: die Proben wuerden einen Stummel bemerken", () => {
  it("istKopierwuerdig ist nicht einfach immer wahr", () => {
    assert.equal(kopie.istKopierwuerdig({ role: "Elektriker", viewer_role: "company" }), false);
  });

  it("kopieLesen gibt nicht einfach immer etwas zurueck", async () => {
    assert.equal(await kopie.kopieLesen(pool({ select: { rows: [] } }), kopie.SEITEN.supply), null);
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

  function deps(p, rolle = "company") {
    const durchlassen = () => (_req, _res, next) => next();
    return {
      pool: p,
      requireAuth: durchlassen(),
      requireFeature: () => durchlassen(),
      getUserAndPlan: async () => ({ role: rolle, plan: "PRO" }),
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

  /* ═══════════════════════════════════════════════════════════════════════
   * N4.4 — DIE ROUTE MUSS DIE SEITE AUCH DURCHREICHEN
   * ═══════════════════════════════════════════════════════════════════════
   *
   * Diese vier Proben gibt es, weil zwei Rueckmutationen ueberlebt haben: der
   * Dienst war lueckenlos bewacht, die VERDRAHTUNG dorthin nicht. Man konnte
   * die Seite in der Route weglassen oder fest auf `supply` stellen, und keine
   * einzige Probe wurde rot — der Fehler waere genau der alte gewesen.
   * ═══════════════════════════════════════════════════════════════════════ */

  /* Ein Feed, der WIRKLICH etwas liefert. Der Standard-`routenPool` gibt auf
     die Feed-Abfragen leere Zeilen zurueck — und eine leere Liste wird bewusst
     nie kopiert (Regel 2 im Dienst). Ohne echte Eintraege maesse die Probe also
     nur, dass nichts passiert. Die Marktseite der Zeile muss zur Rolle passen,
     sonst schneidet die Gegenseitenlogik sie wieder heraus. */
  function poolMitEintrag(feedTyp) {
    const calls = [];
    const zeilen = [{
      id: "cp-1", feed_type: feedTyp, supplier_company_id: "u-9",
      title: "Pflegekraft", role: "Pflege", status: "active",
      headcount: 1, location_city: "Berlin", availability_from: "2026-10-01"
    }];
    return {
      calls,
      query: async (sql, params) => {
        const s = String(sql);
        calls.push({ sql: s, params: params || [] });
        if (/marktplatz_feed_kopie/i.test(s)) return { rowCount: 1, rows: [] };
        if (/COUNT\(/i.test(s)) return { rows: [{ total: 1, count: 1, c: 1 }] };
        return { rows: zeilen, rowCount: zeilen.length };
      }
    };
  }

  it("ein Unternehmen schreibt auf die Angebots-Seite, eine Agentur auf die Bedarfs-Seite", async () => {
    for (const [rolle, erwartet, typ] of [
      ["company", kopie.SEITEN.supply, "supply"],
      ["agency", kopie.SEITEN.demand, "demand"]
    ]) {
      const p = poolMitEintrag(typ);
      const r = res();
      await handler(createCapacityExchangeRouter(deps(p, rolle)), "/capacity-exchange/feed")(req(), r);
      /* Das Schreiben ist absichtlich losgeloest (fire-and-forget) — einen
         Anlauf abwarten, sonst misst die Probe den Zeitpunkt statt die Sache. */
      await new Promise((fertig) => setImmediate(fertig));
      const schreiben = p.calls.filter((c) => /INSERT INTO marktplatz_feed_kopie/i.test(c.sql));
      assert.equal(schreiben.length, 1, `${rolle}: es wurde nicht genau einmal geschrieben`);
      assert.ok(schreiben[0].params.includes(erwartet),
        `${rolle}: geschrieben wurde auf die falsche Marktseite`);
    }
  });

  it("und liest im Fehlerfall die eigene Seite", async () => {
    for (const [rolle, erwartet] of [["company", kopie.SEITEN.supply], ["agency", kopie.SEITEN.demand]]) {
      const p = routenPool({ feedWirft: true });
      const r = res();
      await handler(createCapacityExchangeRouter(deps(p, rolle)), "/capacity-exchange/feed")(req(), r);
      assert.equal(r._status, 200, `${rolle}: die Kopie kam nicht`);
      const lesen = p.calls.filter((c) => /FROM marktplatz_feed_kopie/i.test(c.sql));
      assert.equal(lesen.length, 1, `${rolle}: es wurde nicht genau einmal gelesen`);
      assert.ok(lesen[0].params.includes(erwartet),
        `${rolle}: im Fehlerfall kam die Liste der ANDEREN Marktseite`);
    }
  });

  it("ein Unternehmen MIT Sperrliste hinterlaesst keine Kopie", async () => {
    /*
     * Der Befund, der N4.4 ausgeloest hat — hier auf der Ebene, auf der er
     * entstanden ist. `req.orgId` gesetzt heisst: die Liste ist um die Sperren
     * dieses einen Kunden beschnitten. Sie darf nicht die Kopie fuer alle werden.
     */
    const p = poolMitEintrag("supply");
    const r = res();
    const anfrage = { ...req(), orgId: "org-mit-sperren" };
    await handler(createCapacityExchangeRouter(deps(p, "company")), "/capacity-exchange/feed")(anfrage, r);
    await new Promise((fertig) => setImmediate(fertig));
    assert.equal(p.calls.filter((c) => /INSERT INTO marktplatz_feed_kopie/i.test(c.sql)).length, 0,
      "die beschnittene Liste eines Kunden wurde zur Kopie fuer alle");
  });

  it("und bekommt im Fehlerfall den ehrlichen Fehler statt einer fremden Liste", async () => {
    /* Konsequenz derselben Regel: wer nicht kopierwuerdig ist, ist auch nicht
       rueckfallberechtigt — sonst saehe er die Kraefte wieder, die er gesperrt hat. */
    const p = routenPool({ feedWirft: true });
    const r = res();
    const anfrage = { ...req(), orgId: "org-mit-sperren" };
    await handler(createCapacityExchangeRouter(deps(p, "company")), "/capacity-exchange/feed")(anfrage, r);
    assert.equal(r._status, 500);
    assert.equal(p.calls.filter((c) => /FROM marktplatz_feed_kopie/i.test(c.sql)).length, 0);
  });
});


/* ═══════════════════════════════════════════════════════════════════════════
 * N4.4 — DIE KOPIE HAT EINE MARKTSEITE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bis zum 2026-09-06 gab es EINE Zeile fuer beide Marktseiten, und
 * `istKopierwuerdig` zaehlte nur die 15 Query-Filter. Gemessen galten damit
 * ALLE Betrachter-Situationen als kopierwuerdig — auch die Agentur-Anfrage
 * (andere Marktseite) und die Unternehmens-Anfrage, die zusaetzlich nach der
 * Sperrliste filtert.
 *
 * Zwei Fehler, beide live gewesen:
 *   1. Die Kopie trug die falsche Marktseite: ein Unternehmen bekam im
 *      Fehlerfall die Bedarfe anderer Unternehmen statt der Angebote.
 *   2. Ein Kunde trug seine Sperrliste in die Ansicht aller anderen.
 *
 * Owner-Entscheid 2026-09-06: eine Kopie je Marktseite (Migration 216).
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("N4.4 · die Marktseite entscheidet, welche Kopie gilt", () => {

  it("jede Rolle bekommt ihre Seite — und eine unbekannte Rolle keine", () => {
    assert.equal(kopie.seiteFuer("company"), kopie.SEITEN.supply,
      "ein Unternehmen sieht Angebote");
    assert.equal(kopie.seiteFuer("agency"), kopie.SEITEN.demand,
      "eine Zeitarbeitsfirma sieht Bedarfe");
    assert.equal(kopie.seiteFuer("worker"), null);
    assert.equal(kopie.seiteFuer(undefined), null);
    assert.notEqual(kopie.SEITEN.supply, kopie.SEITEN.demand,
      "beide Seiten teilen sich wieder eine Zeile");
  });

  it("ohne erkennbare Marktseite wird nichts aufgehoben", () => {
    /* Sonst waere unklar, wem die Kopie je gehoeren soll — und genau daraus
     * entstand der Fehler: sie gehoerte dem, der zuletzt da war. */
    assert.equal(kopie.istKopierwuerdig({ page: 1 }), false, "ohne Rolle");
    assert.equal(kopie.istKopierwuerdig({ page: 1, viewer_role: "worker" }), false, "fremde Rolle");
  });

  it("ein Unternehmen MIT Sperrliste liefert keine Kopie", () => {
    /*
     * Der Kern des Befunds. `viewer_company_org_id` ist keine Zeile in der URL,
     * schneidet die Liste aber genauso zu — und was es herausschneidet, ist das
     * Urteil EINES Kunden ueber einen Menschen.
     */
    assert.equal(
      kopie.istKopierwuerdig({ page: 1, viewer_role: "company", viewer_company_org_id: "org-1" }),
      false,
      "die beschnittene Liste eines Kunden wird wieder zur Kopie fuer alle");
  });

  it("eine Agentur mit Inter-Agency-Freigabe ebenfalls nicht", () => {
    // Sie sieht zusaetzlich die andere Marktseite — das ist nicht der Normalfall.
    assert.equal(
      kopie.istKopierwuerdig({ page: 1, viewer_role: "agency", inter_agency_supply_visible: true }),
      false);
    assert.equal(
      kopie.istKopierwuerdig({ page: 1, viewer_role: "agency", inter_agency_enabled: true }),
      false);
    assert.equal(kopie.istKopierwuerdig({ page: 1, viewer_role: "agency" }), true,
      "die schlichte Agentur-Anfrage muss weiterhin kopierwuerdig sein");
  });

  it("geschrieben wird auf die Zeile der eigenen Seite", async () => {
    for (const [rolle, erwartet] of [["company", kopie.SEITEN.supply], ["agency", kopie.SEITEN.demand]]) {
      const p = pool();
      await kopie.kopieSchreiben(p, { items: [{ id: "a" }] }, kopie.seiteFuer(rolle));
      const q = p.find("INSERT INTO marktplatz_feed_kopie")[0];
      assert.ok(q, `${rolle}: nichts geschrieben`);
      assert.ok(q.params.includes(erwartet), `${rolle}: falsche Zeile beschrieben`);
      assert.ok(!/VALUES \(1,/.test(q.sql),
        "die Zeilennummer steht wieder fest im SQL statt als Parameter");
    }
  });

  it("eine unbekannte Seite wird abgelehnt, nicht geraten", async () => {
    /* Die Zahl landet im Primaerschluessel. Raten hiesse hier: die fremde Seite
       ueberschreiben. */
    const p = pool();
    assert.equal(await kopie.kopieSchreiben(p, { items: [{ id: "a" }] }, 7), false);
    assert.equal(await kopie.kopieSchreiben(p, { items: [{ id: "a" }] }, undefined), false);
    assert.equal(p.find("INSERT INTO marktplatz_feed_kopie").length, 0,
      "es wurde trotzdem geschrieben");
  });

  it("gelesen wird die eigene Seite — und der Rueckfall dort gezaehlt", async () => {
    const p = pool({ select: { rows: [zeile()] } });
    const k = await kopie.kopieLesen(p, kopie.SEITEN.demand);
    assert.ok(k, "die Kopie kam nicht zurueck");

    const lesen = p.find("FROM marktplatz_feed_kopie")[0];
    assert.ok(lesen.params.includes(kopie.SEITEN.demand), "es wurde die falsche Seite gelesen");
    assert.ok(!/WHERE id = 1/.test(lesen.sql), "die Seite steht wieder fest im SQL");

    const zaehler = p.find("UPDATE marktplatz_feed_kopie")[0];
    assert.ok(zaehler, "der Rueckfall wurde nicht gezaehlt");
    assert.ok(zaehler.params.includes(kopie.SEITEN.demand),
      "der Rueckfall wurde auf der falschen Seite gezaehlt");
  });

  it("ohne gueltige Seite wird gar nicht erst gelesen", async () => {
    const p = pool({ select: { rows: [zeile()] } });
    assert.equal(await kopie.kopieLesen(p, null), null);
    assert.equal(await kopie.kopieLesen(p, 7), null);
    assert.equal(p.calls.length, 0, "es wurde trotzdem eine Kopie gesucht");
  });

  it("die beiden Seiten stehen sich nicht im Weg", async () => {
    /* Die eigentliche Zusicherung der Migration: was die eine Seite schreibt,
       ueberschreibt nicht, was die andere gelesen bekommt. */
    const p = pool();
    await kopie.kopieSchreiben(p, { items: [{ id: "angebot" }] }, kopie.SEITEN.supply);
    await kopie.kopieSchreiben(p, { items: [{ id: "bedarf" }] }, kopie.SEITEN.demand);
    const [erste, zweite] = p.find("INSERT INTO marktplatz_feed_kopie");
    assert.notDeepEqual(erste.params, zweite.params);
    assert.ok(erste.params.includes(kopie.SEITEN.supply));
    assert.ok(zweite.params.includes(kopie.SEITEN.demand));
  });
});
