/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WELLE N2.7 — DER PUNKT ENTSTEHT VOR DEM BEDARF
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * N2.0 trug die Koordinaten NACH dem Anlegen nach — mit dem Kommentar "die
 * Koordinaten muessen vor dem Matching stehen". Die Pruefung vom 12.09. fand,
 * dass das nicht stimmte:
 *
 *   * `runInitialMatching` lief schon VOR dem Nachtragen. Der erste, fuer den
 *     Kunden sichtbarste Durchgang — samt der Mails an bis zu fuenfzehn
 *     Anbieter — rechnete ohne Punkt, ueber den Vergleich von Staedtenamen.
 *   * Der Notdienst-Zweig kehrte VOR dem Nachtragen zurueck. Ausgerechnet der
 *     dringendste Bedarf bekam nie Koordinaten.
 *   * Der Kartendienst hatte kein Zeitlimit — antwortete Nominatim nicht, hing
 *     das Absenden.
 *
 * Die Probe, die die Reihenfolge bewachen sollte, war GRUEN: sie verglich die
 * Position zweier Zeichenketten im Quelltext — Nachtragen vor
 * `scheduleMatchTrigger`. Das erste Matching stand aber noch weiter oben. Ein
 * Waechter am Wortlaut, der die falsche Stelle verglich.
 *
 * DIESE DATEI PRUEFT DIE WIRKUNG: der Kartendienst wird ueber `fetch` ersetzt,
 * die Route laeuft, und gemessen wird, was in der Datenbank ankommt — und in
 * welcher Reihenfolge.
 *
 * Lauf: node --test --test-force-exit test/punktVorDemBedarf.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createMarketplaceRouter } from "../routes/marketplace.js";
import * as geoService from "../services/geoService.js";
import { todayDE } from "../utils/dateDE.js";

const ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MUENSTER = [{ lat: "51.9607", lon: "7.6261" }];

/* ── Vorrichtung ───────────────────────────────────────────────────────── */

function pool(regeln = []) {
  const calls = [];
  const lauf = async (sql, params = []) => {
    const text = String(sql);
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text.trim().toUpperCase())) return { rows: [], rowCount: 0 };
    calls.push({ sql: text, params });
    for (const [nadel, wert] of regeln) {
      if (text.includes(nadel)) {
        const rows = typeof wert === "function" ? wert(text, params) : wert;
        return { rows, rowCount: rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return {
    calls, query: lauf, connect: async () => ({ query: lauf, release() {} }),
    stelle(nadel) { return calls.findIndex((c) => c.sql.includes(nadel)); },
    finde(nadel) { return calls.find((c) => c.sql.includes(nadel)); }
  };
}

const durchlass = (_q, _s, next) => next();

function deps(p, rolle = "company") {
  const ich = { id: "u1", plan: "PRO", company_name: "ACME", role: rolle, org_id: ORG,
    limits: { notdienst: true, max_workers_per_request: -1 } };
  return {
    pool: p, logger: { info() {}, warn() {}, error() {}, debug() {} },
    requireAuth: durchlass, requireFeature: () => durchlass, requestLimiter: durchlass,
    sendMail: async () => true, config: {}, getUserAndPlan: async () => ich
  };
}

function handler(router, method, pfad) {
  for (const l of router.stack) {
    if (l.route && l.route.path === pfad && l.route.methods[method]) {
      return l.route.stack[l.route.stack.length - 1].handle;
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${pfad} fehlt`);
}

function antwort() {
  return {
    _status: 200, _json: null, locals: {},
    status(c) { this._status = c; return this; },
    json(b) { this._json = b; return this; },
    set() { return this; }, setHeader() { return this; }
  };
}

const anfrage = (body) => ({
  session: { userId: "u1" }, params: {}, query: {}, body,
  headers: {}, orgId: ORG, ip: "127.0.0.1", get: () => ""
});

/**
 * Ersetzt den Kartendienst fuer die Dauer einer Probe. Gemerkt werden nur
 * Anfragen an Nominatim — alles andere bleibt dem echten `fetch`.
 */
async function mitKartendienst(verhalten, probe) {
  const vorher = globalThis.fetch;
  const gefragt = [];
  globalThis.fetch = async (url, opt) => {
    const u = String(url);
    if (!u.includes("nominatim")) return vorher(url, opt);
    gefragt.push({ url: u, opt });
    if (verhalten instanceof Error) throw verhalten;
    return { ok: true, json: async () => verhalten };
  };
  try {
    return await probe(gefragt);
  } finally {
    globalThis.fetch = vorher;
  }
}

const BEDARF = {
  title: "10 Pflegekraefte", role: "Pflege", headcount: 2,
  location_city: "Münster", location_postal: "48143", radius_km: 25
};
const angelegterBedarf = (ueber = {}) => [{ id: "dr1", ...BEDARF, start_date: "2027-03-01",
  end_date: null, sla_status: null, urgency: "normal", requester_company_id: "u1", ...ueber }];

/* ═══════════════════════════════════════════════════════════════════════ */

describe("N2.7 · der Bedarf traegt seinen Punkt ab dem ersten Augenblick", () => {

  it("der Punkt steht im INSERT — und das INSERT kommt vor dem ersten Matching", async () => {
    await mitKartendienst(MUENSTER, async (gefragt) => {
      const p = pool([["INSERT INTO demand_requests", angelegterBedarf()]]);
      await handler(createMarketplaceRouter(deps(p)), "post", "/marketplace/demand-requests")(
        anfrage({ ...BEDARF, start_date: "2027-03-01" }), antwort(), () => {});

      assert.strictEqual(gefragt.length >= 1, true, "der Kartendienst wurde gar nicht gefragt");
      const insert = p.finde("INSERT INTO demand_requests");
      assert.ok(insert, "der Bedarf wurde nicht angelegt");
      assert.ok(insert.params.includes(51.9607) && insert.params.includes(7.6261),
        "der Bedarf entsteht ohne Punkt");
      const anlage = p.stelle("INSERT INTO demand_requests");
      const matching = p.stelle("availability_from <= $1");
      assert.ok(matching > 0, "das erste Matching lief nicht");
      assert.ok(anlage < matching, "das Matching lief, bevor der Bedarf mit Punkt existierte");
    });
  });

  it("der NOTDIENST-Bedarf bekommt ihn ebenso — vor seiner Alarmierung", async () => {
    /* Der Notdienst-Zweig kehrte vor dem Nachtragen zurueck. Seine Alarmierung
       verglich Staedtenamen — beim dringendsten aller Bedarfe. */
    const heute = todayDE();
    await mitKartendienst(MUENSTER, async () => {
      const p = pool([["INSERT INTO demand_requests", angelegterBedarf({ start_date: heute, urgency: "notdienst" })]]);
      const res = antwort();
      await handler(createMarketplaceRouter(deps(p)), "post", "/marketplace/demand-requests")(
        anfrage({ ...BEDARF, start_date: heute }), res, () => {});

      assert.ok(res._json?.emergency, "der Notdienst-Weg wurde nicht genommen — die Probe misst sonst etwas anderes");
      const insert = p.finde("INSERT INTO demand_requests");
      assert.ok(insert?.params.includes(51.9607), "der Notdienst-Bedarf entsteht ohne Punkt");
      const alarm = p.stelle("supplier_name");
      assert.ok(alarm > p.stelle("INSERT INTO demand_requests"), "die Alarmierung lief vor der Anlage mit Punkt");
    });
  });

  it("das Angebot bekommt ihn im selben Schritt", async () => {
    await mitKartendienst(MUENSTER, async () => {
      const p = pool([["INSERT INTO capacity_posts", [{ id: "cp1", role: "Pflege" }]]]);
      await handler(createMarketplaceRouter(deps(p, "agency")), "post", "/marketplace/capacity-posts")(
        anfrage({ title: "Pflege", role: "Pflege", availability_from: "2027-03-01",
          location_city: "Münster", location_postal: "48143", headcount: 1 }), antwort(), () => {});
      const insert = p.finde("INSERT INTO capacity_posts");
      assert.ok(insert, "das Angebot wurde nicht angelegt");
      assert.ok(insert.params.includes(51.9607), "das Angebot entsteht ohne Punkt");
    });
  });

  it("mitgeschickte Koordinaten gelten — und niemand wird gefragt", async () => {
    /* Eine vorhandene Angabe kann von Hand gesetzt und genauer sein als jede
       Schaetzung. Und jede ueberfluessige Frage belastet einen freien Dienst. */
    await mitKartendienst(MUENSTER, async (gefragt) => {
      const p = pool([["INSERT INTO demand_requests", angelegterBedarf()]]);
      await handler(createMarketplaceRouter(deps(p)), "post", "/marketplace/demand-requests")(
        anfrage({ ...BEDARF, start_date: "2027-03-01", location_lat: 50.1, location_lng: 8.6 }), antwort(), () => {});
      assert.strictEqual(gefragt.length, 0, "trotz mitgeschickter Koordinaten wurde gefragt");
      const insert = p.finde("INSERT INTO demand_requests");
      assert.ok(insert.params.includes(50.1) && !insert.params.includes(51.9607),
        "die mitgeschickten Koordinaten wurden ueberschrieben");
    });
  });

  it("faellt der Kartendienst aus, entsteht der Bedarf trotzdem", async () => {
    /* Der Nutzer hat alles richtig gemacht. Ein fremder Dienst darf ihm keinen
       Fehler bescheren — der Bedarf faellt auf den Stadtvergleich zurueck. */
    await mitKartendienst(new Error("Nominatim weg"), async () => {
      const p = pool([["INSERT INTO demand_requests", angelegterBedarf()]]);
      const res = antwort();
      await handler(createMarketplaceRouter(deps(p)), "post", "/marketplace/demand-requests")(
        anfrage({ ...BEDARF, start_date: "2027-03-01" }), res, () => {});
      assert.strictEqual(res._status, 201, "der Ausfall des Kartendienstes brach die Anlage ab");
      assert.ok(p.finde("INSERT INTO demand_requests"), "der Bedarf wurde nicht angelegt");
    });
  });
});

describe("N2.7 · der Kartendienst hat eine Frist", () => {

  it("jede Anfrage traegt ein Abbruchsignal", async () => {
    await mitKartendienst(MUENSTER, async (gefragt) => {
      await geoService.geocodeQuery("48143 Münster");
      await geoService.geocode("48143", "Münster");
      assert.strictEqual(gefragt.length, 2);
      for (const g of gefragt) {
        assert.ok(g.opt?.signal instanceof AbortSignal, "eine Anfrage an den Kartendienst hat keine Frist");
      }
    });
  });

  it("antwortet der Dienst nicht, kommt nach der Frist `null` — nicht nie", async () => {
    /*
     * Der eigentliche Fall. Ein `fetch`, das nie antwortet, aber das Signal
     * respektiert — so verhaelt sich ein haengender Server. Ohne Frist wartete
     * das Absenden des Bedarfs darauf, bis irgendwo ein Socket aufgibt.
     */
    /*
     * DIE PROBE BRICHT SELBST AB. Die erste Fassung wartete einfach auf das
     * Ergebnis — fehlte die Frist, hing sie EWIG, statt rot zu werden. Beim
     * Rueckmutieren musste der Lauf von Hand beendet werden, und das Skript
     * stellte die mutierte Datei erst danach wieder her. Eine Probe fuer eine
     * fehlende Frist, die selbst keine Frist hat, ist derselbe Fehler noch einmal.
     */
    const vorher = globalThis.fetch;
    globalThis.fetch = (_url, opt) => new Promise((_ok, fehler) => {
      opt?.signal?.addEventListener("abort", () => fehler(new Error("abgebrochen")));
    });
    let sicherung;
    try {
      const HAENGT = Symbol("haengt");
      const notbremse = new Promise((ok) => { sicherung = setTimeout(() => ok(HAENGT), 1500); });
      const beginn = Date.now();
      const punkt = await Promise.race([geoService.geocodeQuery("48143 Münster", { timeoutMs: 40 }), notbremse]);
      assert.notStrictEqual(punkt, HAENGT, "ohne wirksame Frist wartet die Anfrage — und mit ihr das Absenden");
      assert.strictEqual(punkt, null);
      assert.ok(Date.now() - beginn < 1500, "die Frist hat nicht gegriffen");
    } finally {
      clearTimeout(sicherung);
      globalThis.fetch = vorher;
    }
  });

  it("die Standardfrist ist endlich und kurz", () => {
    assert.ok(Number.isFinite(geoService.GEO_TIMEOUT_MS) && geoService.GEO_TIMEOUT_MS > 0);
    assert.ok(geoService.GEO_TIMEOUT_MS <= 5000,
      "eine Anlage wartet laenger als fuenf Sekunden auf einen fremden Dienst");
  });
});
