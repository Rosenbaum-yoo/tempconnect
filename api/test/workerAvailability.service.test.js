/**
 * Verfuegbarkeit: herleiten statt fragen (Multi-Skill Welle 2).
 *
 * Owner-Vorgabe war "alles erfassen, aber die manuelle Eingabe auf das Minimum".
 * Das ist kein Widerspruch, sondern eine Rangfolge: ausdrueckliche Angabe schlaegt
 * Herleitung schlaegt Vererbung. Was uebrig bleibt, ist die EINZIGE Frage, die der
 * Aufnahme-Assistent stellen muss.
 *
 * Diese Tests halten die Rangfolge fest — und die Faelle, in denen bewusst NICHT geraten
 * wird. Ein falsches "ab morgen verfuegbar" erzeugt Angebote, die die Agentur nicht halten
 * kann; das ist schaedlicher als ein ehrliches "wissen wir nicht".
 *
 * Run: node --test --test-force-exit test/workerAvailability.service.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveAvailability, setAvailability, HERKUNFT } from "../services/workerAvailabilityService.js";
import { todayDE } from "../utils/dateDE.js";

const PROFIL_ID = "wp-1";
const USER_ID = "u-1";
const ORG_ID = "org-agentur";

// Berlin-Zeit, nicht UTC: der Dienst rechnet in Europe/Berlin. Rechnete der Test in UTC,
// wuerde er zwischen 00:00 und 02:00 Berliner Zeit einen anderen Tag pruefen als die Produktion.
function heute() { return todayDE(); }

function inTagen(n) {
  const d = new Date(`${todayDE()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Pool-Attrappe: erste Abfrage = Profil (+ Betriebseinstellung), zweite = Einsatzhistorie.
 */
function poolStub({ profil = {}, historie = {} } = {}) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      const s = String(sql);
      calls.push({ sql: s, params });
      if (/FROM worker_profiles wp/i.test(s)) {
        return { rows: [{
          id: PROFIL_ID, user_id: USER_ID, supplier_org_id: ORG_ID,
          available_from: null, weekly_hours: null, travel_radius_km: null,
          default_radius_km: null, ...profil
        }] };
      }
      if (/FROM worker_assignment_links/i.test(s)) {
        return { rows: [{
          letztes_ende: null, unbefristet_gebunden: false, schnitt_stunden_tag: null,
          abwesend_ab: null, abwesenheitsgrund: null, ...historie
        }] };
      }
      return { rows: [] };
    }
  };
}

describe("verfuegbar ab", () => {
  it("nimmt die ausdrueckliche Angabe, auch wenn ein Einsatz laeuft", async () => {
    const out = await resolveAvailability(
      poolStub({ profil: { available_from: "2026-12-01" }, historie: { letztes_ende: "2026-09-15" } }),
      PROFIL_ID
    );
    assert.equal(out.available_from, "2026-12-01");
    assert.equal(out.herkunft.available_from, HERKUNFT.AUSDRUECKLICH);
  });

  it("leitet den Tag NACH dem letzten Einsatz ab", async () => {
    const ende = inTagen(10);
    const out = await resolveAvailability(poolStub({ historie: { letztes_ende: ende } }), PROFIL_ID);
    assert.equal(out.available_from, inTagen(11), "Am Endtag selbst ist die Kraft noch gebunden");
    assert.equal(out.herkunft.available_from, HERKUNFT.ABGELEITET);
  });

  it("meldet 'ab heute', wenn der letzte Einsatz in der Vergangenheit endete", async () => {
    const out = await resolveAvailability(poolStub({ historie: { letztes_ende: "2020-01-01" } }), PROFIL_ID);
    assert.equal(out.available_from, heute(), "Ein Datum aus 2020 waere zwar korrekt hergeleitet, aber unbrauchbar");
  });

  it("raet NICHT bei einem unbefristeten Einsatz — es wird zur Frage", async () => {
    // Der schaedliche Fall: ein erfundenes "ab morgen" erzeugt Angebote, die die Agentur
    // nicht halten kann. Lieber ehrlich nachfragen.
    const out = await resolveAvailability(poolStub({ historie: { unbefristet_gebunden: true } }), PROFIL_ID);
    assert.equal(out.available_from, null);
    assert.equal(out.herkunft.available_from, HERKUNFT.UNBEKANNT);
    assert.ok(out.offene_fragen.includes("available_from"));
  });

  it("liest auch ein Date-Objekt als denselben Kalendertag", async () => {
    // DATE-Spalten kommen dank db/typeParsers.js als Zeichenkette an — dieser Test sichert
    // den anderen Fall ab: kaeme hier je ein Zeitstempel an, wuerde `toISOString()` lokale
    // Mitternacht in Berlin auf 22:00 des VORTAGS schieben. Aus einem Einsatzende am 15.09.
    // wuerde der 14.09., und die Kraft gaelte einen Tag zu frueh als frei — genau das
    // Angebot, das die Agentur nicht halten kann. Ein Schutz, den der Parser heute traegt
    // und der beim naechsten Treiber-Wechsel nicht still verloren gehen soll.
    const ende = inTagen(10);
    const [jahr, monat, tag] = ende.split("-").map(Number);
    const out = await resolveAvailability(
      poolStub({ historie: { letztes_ende: new Date(jahr, monat - 1, tag) } }),
      PROFIL_ID
    );
    assert.equal(out.belegt_bis, ende, "Das Einsatzende darf nicht auf den Vortag rutschen");
    assert.equal(out.available_from, inTagen(11), "Frei ist die Kraft erst am Tag DANACH");
  });

  it("neue Kraft ohne Historie: eine Frage, keine Annahme", async () => {
    const out = await resolveAvailability(poolStub(), PROFIL_ID);
    assert.equal(out.available_from, null);
    assert.ok(out.offene_fragen.includes("available_from"));
  });
});

describe("Umfang", () => {
  it("rechnet Tagesstunden auf die Woche hoch", async () => {
    const out = await resolveAvailability(poolStub({ historie: { schnitt_stunden_tag: 8 } }), PROFIL_ID);
    assert.equal(out.weekly_hours, 40);
    assert.equal(out.herkunft.weekly_hours, HERKUNFT.ABGELEITET);
  });

  it("kommt auch mit Teilzeit klar", async () => {
    const out = await resolveAvailability(poolStub({ historie: { schnitt_stunden_tag: 4.5 } }), PROFIL_ID);
    assert.equal(out.weekly_hours, 22.5);
  });

  it("die ausdrueckliche Angabe schlaegt die Historie", async () => {
    const out = await resolveAvailability(
      poolStub({ profil: { weekly_hours: "30.00" }, historie: { schnitt_stunden_tag: 8 } }), PROFIL_ID
    );
    assert.equal(out.weekly_hours, 30);
    assert.equal(out.herkunft.weekly_hours, HERKUNFT.AUSDRUECKLICH);
  });

  it("ohne Historie wird gefragt", async () => {
    const out = await resolveAvailability(poolStub(), PROFIL_ID);
    assert.ok(out.offene_fragen.includes("weekly_hours"));
  });
});

describe("Einsatzradius — die Angabe, die niemand tippen muss", () => {
  it("erbt vom Betrieb", async () => {
    const out = await resolveAvailability(poolStub({ profil: { default_radius_km: 60 } }), PROFIL_ID);
    assert.equal(out.radius_km, 60);
    assert.equal(out.herkunft.radius_km, HERKUNFT.GEERBT);
  });

  it("die Kraft kann abweichen", async () => {
    const out = await resolveAvailability(
      poolStub({ profil: { travel_radius_km: 15, default_radius_km: 60 } }), PROFIL_ID
    );
    assert.equal(out.radius_km, 15);
    assert.equal(out.herkunft.radius_km, HERKUNFT.AUSDRUECKLICH);
  });

  it("faellt auf denselben Wert zurueck wie die Betriebseinstellung selbst", async () => {
    const out = await resolveAvailability(poolStub(), PROFIL_ID);
    assert.equal(out.radius_km, 25, "Muss zum Default in settingsService passen");
    assert.equal(out.herkunft.radius_km, HERKUNFT.GEERBT);
  });

  it("wird NIE zur offenen Frage — er gehoert an den Betrieb", async () => {
    const out = await resolveAvailability(poolStub(), PROFIL_ID);
    assert.ok(!out.offene_fragen.includes("travel_radius_km"));
    assert.ok(!out.offene_fragen.includes("radius_km"));
  });
});

describe("Bestandskraft vs. Neuling — der eigentliche Nutzen", () => {
  it("Bestandskraft: keine einzige Frage", async () => {
    const out = await resolveAvailability(
      poolStub({ profil: { default_radius_km: 40 }, historie: { letztes_ende: inTagen(5), schnitt_stunden_tag: 8 } }),
      PROFIL_ID
    );
    assert.deepEqual(out.offene_fragen, [], "Alles herleitbar — der Assistent zeigt nur an");
    assert.equal(out.available_from, inTagen(6));
    assert.equal(out.weekly_hours, 40);
    assert.equal(out.radius_km, 40);
  });

  it("Neuling: genau zwei Fragen, nicht drei", async () => {
    const out = await resolveAvailability(poolStub({ profil: { default_radius_km: 40 } }), PROFIL_ID);
    assert.deepEqual(out.offene_fragen.sort(), ["available_from", "weekly_hours"]);
    assert.equal(out.radius_km, 40, "Der Radius kommt vom Betrieb, ohne Frage");
  });
});

describe("gemeldete Abwesenheit", () => {
  it("wird durchgereicht, damit die Oberflaeche sie zeigen kann", async () => {
    const out = await resolveAvailability(
      poolStub({ historie: { letztes_ende: inTagen(20), abwesend_ab: inTagen(3), abwesenheitsgrund: "Krank" } }),
      PROFIL_ID
    );
    assert.equal(out.abwesend_ab, inTagen(3));
    assert.equal(out.abwesenheitsgrund, "Krank");
  });
});

describe("Randfaelle", () => {
  it("unbekanntes Profil ergibt null, keinen Absturz", async () => {
    const pool = { query: async () => ({ rows: [] }) };
    assert.equal(await resolveAvailability(pool, "gibt-es-nicht"), null);
  });

  it("fragt nur aktive Einsatzverknuepfungen ab", async () => {
    const pool = poolStub();
    await resolveAvailability(pool, PROFIL_ID);
    const q = pool.calls.find((c) => /worker_assignment_links/i.test(c.sql));
    assert.match(q.sql, /is_active = TRUE/i, "Eine geloeste Zuordnung sagt nichts ueber die Zukunft");
  });
});

describe("setAvailability", () => {
  function updatePool(rows = [{ id: PROFIL_ID }]) {
    const calls = [];
    return { calls, query: async (sql, params = []) => { calls.push({ sql: String(sql), params }); return { rows }; } };
  }

  it("bleibt an der Org-Grenze", async () => {
    const pool = updatePool();
    await setAvailability(pool, PROFIL_ID, { weekly_hours: 20 }, ORG_ID);
    assert.match(pool.calls[0].sql, /supplier_org_id = \$\d/);
    assert.ok(pool.calls[0].params.includes(ORG_ID));
  });

  it("schreibt nur, was uebergeben wurde", async () => {
    const pool = updatePool();
    await setAvailability(pool, PROFIL_ID, { weekly_hours: 20 }, ORG_ID);
    assert.match(pool.calls[0].sql, /weekly_hours = /);
    assert.ok(!/available_from = /.test(pool.calls[0].sql), "Nicht uebergebene Felder bleiben unberuehrt");
  });

  it("null loescht die Angabe und schaltet zurueck auf Herleitung", async () => {
    const pool = updatePool();
    await setAvailability(pool, PROFIL_ID, { available_from: null }, ORG_ID);
    assert.match(pool.calls[0].sql, /available_from = /);
    assert.equal(pool.calls[0].params[0], null);
  });

  it("behandelt den leeren String wie null — Formulare senden ihn staendig", async () => {
    const pool = updatePool();
    await setAvailability(pool, PROFIL_ID, { available_from: "" }, ORG_ID);
    assert.equal(pool.calls[0].params[0], null);
  });

  it("ohne Angaben passiert nichts", async () => {
    const pool = updatePool();
    assert.deepEqual(await setAvailability(pool, PROFIL_ID, {}, ORG_ID), { unveraendert: true });
    assert.equal(pool.calls.length, 0);
  });

  it("fremde Org bekommt NOT_FOUND, nicht die Daten", async () => {
    const pool = updatePool([]);
    assert.deepEqual(await setAvailability(pool, PROFIL_ID, { weekly_hours: 20 }, "org-fremd"), { error: "NOT_FOUND" });
  });
});
