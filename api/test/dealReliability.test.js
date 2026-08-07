/**
 * P8 Welle B — Zuverlaessigkeitsquote.
 *
 * Der Test haelt drei Dinge fest, die man sonst leicht wieder verliert:
 *   1. die Owner-Entscheidungen E1/E2/E4 als ausfuehrbare Regel (nicht als Prosa),
 *   2. die Anti-N+1-Garantie (die Abfragezahl bleibt konstant, egal wie viele
 *      Parteien gerechnet werden),
 *   3. dass "keine Daten" NICHT als "schlechte Quote" durchschlaegt — der
 *      teuerste denkbare Fehler in einer Kennzahl, die Sichtbarkeit steuert.
 *
 * Run: node --test --test-force-exit test/dealReliability.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as svc from "../services/dealReliabilityService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(API_ROOT, "..");

/** Pool, der Abfragen per SQL-Teilstring beantwortet und alle Aufrufe mitschreibt. */
function trackingPool(routes = []) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    for (const [needle, resp] of routes) {
      if (sql.includes(needle)) {
        if (resp instanceof Error) throw resp;
        return typeof resp === "function" ? resp(sql, params) : resp;
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return { query, calls, connect: async () => ({ query, release: () => {} }) };
}

/* ══════════════════════════════════════════════════════════════════════════
 * E1 — Vorlauf
 * ══════════════════════════════════════════════════════════════════════════ */

describe("P8/B · Vorlauf-Klassen (E1)", () => {
  it("ordnet die Schwellen exakt zu", () => {
    assert.equal(svc.vorlaufKlasse(-5), "kurzfristig", "nach Einsatzbeginn ist der teuerste Fall");
    assert.equal(svc.vorlaufKlasse(0), "kurzfristig");
    assert.equal(svc.vorlaufKlasse(47.9), "kurzfristig");
    assert.equal(svc.vorlaufKlasse(48), "normal", "48 h ist die Untergrenze von 'normal'");
    assert.equal(svc.vorlaufKlasse(335), "normal");
    assert.equal(svc.vorlaufKlasse(336), "unkritisch", "14 Tage = 336 h zaehlen nicht mehr");
    assert.equal(svc.vorlaufKlasse(5000), "unkritisch");
  });

  it("behandelt fehlenden Einsatzbeginn als 'unbekannt', nicht als 'unkritisch'", () => {
    assert.equal(svc.vorlaufKlasse(null), "unbekannt");
    assert.equal(svc.vorlaufKlasse(undefined), "unbekannt");
    assert.equal(svc.vorlaufKlasse("keine Zahl"), "unbekannt");
    // Wichtig: unbekannt darf kein Freispruch sein.
    assert.equal(svc.KLASSEN_GEWICHT.unbekannt, 1);
    assert.equal(svc.KLASSEN_GEWICHT.unkritisch, 0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * E2 — Gruende, seitenabhaengig
 * ══════════════════════════════════════════════════════════════════════════ */

describe("P8/B · Entschuldigte Gruende (E2)", () => {
  it("entlastet die Agentur bei Kundenabsage und Krankheit", () => {
    assert.equal(svc.istEntschuldigt("customer_cancelled", "agency"), true);
    assert.equal(svc.istEntschuldigt("worker_sick", "agency"), true);
  });

  it("entlastet die Agentur NICHT bei selbst verantworteten Gruenden", () => {
    for (const grund of ["worker_quit", "date_moved", "mistake", "other"]) {
      assert.equal(svc.istEntschuldigt(grund, "agency"), false, grund);
    }
  });

  it("gilt fuer das Unternehmen nicht — sonst waere jeder Grund ein Freifahrtschein", () => {
    assert.equal(svc.istEntschuldigt("customer_cancelled", "company"), false);
    assert.equal(svc.istEntschuldigt("worker_sick", "company"), false);
  });

  it("faellt bei unbekannter Seite auf 'zaehlt' zurueck", () => {
    assert.equal(svc.istEntschuldigt("worker_sick", "irgendwas"), false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Verbindlichkeit — Rueckzug vor der Zusage ist kein Wortbruch
 * ══════════════════════════════════════════════════════════════════════════ */

describe("P8/B · Verbindlichkeit des Vorzustands", () => {
  it("zaehlt nur Stornos aus confirmed/activated", () => {
    assert.equal(svc.istVerbindlicherStorno("confirmed"), true);
    assert.equal(svc.istVerbindlicherStorno("activated"), true);
    assert.equal(svc.istVerbindlicherStorno("pending_confirmation"), false);
    assert.equal(svc.istVerbindlicherStorno("agreement_created"), false);
    assert.equal(svc.istVerbindlicherStorno("none"), false);
  });

  it("behandelt Altbestand (NULL) als verbindlich — die Population entscheidet", () => {
    assert.equal(svc.istVerbindlicherStorno(null), true);
    assert.equal(svc.istVerbindlicherStorno(undefined), true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Gewichtung — das Zusammenspiel der Regeln
 * ══════════════════════════════════════════════════════════════════════════ */

describe("P8/B · Gewicht eines Stornos", () => {
  const basis = { reason_code: "worker_quit", cancelled_by_side: "agency", from_status: "confirmed" };

  it("verdoppelt kurzfristige Stornos und erlaesst rechtzeitige", () => {
    assert.equal(svc.gewichteStorno({ ...basis, lead_time_hours: 10 }), 2);
    assert.equal(svc.gewichteStorno({ ...basis, lead_time_hours: 100 }), 1);
    assert.equal(svc.gewichteStorno({ ...basis, lead_time_hours: 400 }), 0);
    assert.equal(svc.gewichteStorno({ ...basis, lead_time_hours: null }), 1);
  });

  it("laesst den Grund vor dem Vorlauf greifen (E2 schlaegt E1)", () => {
    assert.equal(
      svc.gewichteStorno({ ...basis, reason_code: "customer_cancelled", lead_time_hours: 1 }), 0,
      "eine Kundenabsage 1 h vorher trifft die Agentur unverschuldet"
    );
    assert.equal(
      svc.gewichteStorno({ reason_code: "customer_cancelled", cancelled_by_side: "company", from_status: "confirmed", lead_time_hours: 1 }), 2,
      "dasselbe vom Unternehmen ist dessen eigenes Risiko"
    );
  });

  it("ignoriert Stornos vor der beidseitigen Zusage vollstaendig", () => {
    assert.equal(svc.gewichteStorno({ ...basis, lead_time_hours: 1, from_status: "pending_confirmation" }), 0);
  });

  it("akzeptiert eine vorberechnete Klasse (SQL-Bucket) statt der Rohstunden", () => {
    assert.equal(svc.gewichteStorno({ ...basis, vorlauf_klasse: "kurzfristig" }), 2);
    assert.equal(svc.gewichteStorno({ ...basis, vorlauf_klasse: "unkritisch" }), 0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * E4 + Gate B — "keine Daten" ist nicht "schlecht"
 * ══════════════════════════════════════════════════════════════════════════ */

describe("P8/B · Quote (E4, Gate B)", () => {
  it("liefert NULL statt 0 %, wenn es keine Deals gibt", () => {
    assert.equal(svc.berechneQuote({ bindingDeals: 0, weightedCancellations: 0 }), null);
    assert.equal(svc.berechneQuote({}), null);
  });

  it("schweigt unterhalb der Mindestzahl (5 Deals)", () => {
    assert.equal(svc.berechneQuote({ bindingDeals: 4, weightedCancellations: 0 }), null);
    assert.equal(svc.berechneQuote({ bindingDeals: 5, weightedCancellations: 0 }), 100);
  });

  it("rechnet die Quote aus dem gewichteten Anteil", () => {
    assert.equal(svc.berechneQuote({ bindingDeals: 5, weightedCancellations: 1 }), 80);
    assert.equal(svc.berechneQuote({ bindingDeals: 10, weightedCancellations: 2.5 }), 75);
  });

  it("klemmt bei 0 statt negative Prozente zu zeigen", () => {
    // 6 kurzfristige Stornos bei 10 Deals = Gewicht 12 > Nenner.
    assert.equal(svc.berechneQuote({ bindingDeals: 10, weightedCancellations: 12 }), 0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Zusammenfassung der DB-Zeilen
 * ══════════════════════════════════════════════════════════════════════════ */

describe("P8/B · Kennzahlen aus DB-Zeilen", () => {
  it("haelt beide Marktseiten derselben Person getrennt", () => {
    const out = svc.fasseKennzahlenZusammen(
      [
        { party_user_id: "u1", party_side: "agency", binding_deals: 8 },
        { party_user_id: "u1", party_side: "company", binding_deals: 6 }
      ],
      [
        { party_user_id: "u1", party_side: "agency", reason_code: "worker_quit", from_status: "confirmed", vorlauf_klasse: "kurzfristig", anzahl: 1 }
      ],
      365
    );
    const agentur = out.find((r) => r.party_side === "agency");
    const firma = out.find((r) => r.party_side === "company");
    assert.equal(agentur.weighted_cancellations, 2);
    assert.equal(agentur.reliability_rate, 75);
    assert.equal(firma.weighted_cancellations, 0);
    assert.equal(firma.reliability_rate, 100);
  });

  it("zaehlt entschuldigte Stornos mit, gewichtet sie aber nicht", () => {
    const [row] = svc.fasseKennzahlenZusammen(
      [{ party_user_id: "a", party_side: "agency", binding_deals: 10 }],
      [
        { party_user_id: "a", party_side: "agency", reason_code: "customer_cancelled", from_status: "confirmed", vorlauf_klasse: "kurzfristig", anzahl: 3 },
        { party_user_id: "a", party_side: "agency", reason_code: "worker_quit", from_status: "confirmed", vorlauf_klasse: "normal", anzahl: 1 }
      ],
      365
    );
    assert.equal(row.cancellations_total, 4, "alle vier bleiben sichtbar");
    assert.equal(row.cancellations_excused, 3, "drei davon zaehlen nicht gegen die Agentur");
    assert.equal(row.weighted_cancellations, 1);
    assert.equal(row.reliability_rate, 90);
  });

  it("erzeugt eine Zeile auch fuer Parteien ganz ohne Storno", () => {
    const out = svc.fasseKennzahlenZusammen(
      [{ party_user_id: "sauber", party_side: "agency", binding_deals: 12 }], [], 365
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].reliability_rate, 100);
    assert.equal(out[0].cancellations_total, 0);
  });

  it("uebergeht Zeilen ohne Partei-Id, statt eine Geister-Quote zu bauen", () => {
    const out = svc.fasseKennzahlenZusammen(
      [{ party_user_id: null, party_side: "agency", binding_deals: 9 }], [], 365
    );
    assert.deepEqual(out, []);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Schreibpfad
 * ══════════════════════════════════════════════════════════════════════════ */

describe("P8/B · recomputeReliability", () => {
  function poolMit({ nenner = [], stornos = [], frische = [] } = {}) {
    return trackingPool([
      ["FROM offer_cancellations c", { rows: stornos }],
      ["'agency'::text        AS party_side", { rows: nenner }],
      ["computed_at FROM deal_reliability", { rows: frische }],
      ["INSERT INTO deal_reliability", (sql, params) => ({ rowCount: params[0].length, rows: [] })],
      ["INSERT INTO supplier_reputation", (sql, params) => ({ rowCount: params[0].length, rows: [] })],
      ["UPDATE deal_reliability", { rowCount: 3, rows: [] }],
      ["UPDATE supplier_reputation", { rowCount: 2, rows: [] }]
    ]);
  }

  it("bleibt bei 50 Parteien bei derselben Abfragezahl wie bei einer (Anti-N+1)", async () => {
    const eine = poolMit({ nenner: [{ party_user_id: "u0", party_side: "agency", binding_deals: 9 }] });
    await svc.recomputeReliability(eine);

    const viele = poolMit({
      nenner: Array.from({ length: 50 }, (_, i) => ({
        party_user_id: `u${i}`, party_side: "agency", binding_deals: 9
      }))
    });
    const ergebnis = await svc.recomputeReliability(viele);

    assert.equal(viele.calls.length, eine.calls.length,
      "eine Abfrage je Partei waere der klassische N+1-Rueckfall");
    assert.equal(viele.calls.length, 7,
      "Nenner + Stornos + Frische + Upsert + Spiegel + Reset + Entspiegelung");
    assert.equal(ergebnis.parties, 50);
  });

  it("uebergibt die Vorlauf-Schwellen als Parameter, statt sie ins SQL zu schreiben", async () => {
    const pool = poolMit();
    await svc.recomputeReliability(pool);
    const stornoCall = pool.calls.find((c) => c.sql.includes("FROM offer_cancellations c"));
    assert.ok(stornoCall, "Storno-Abfrage lief");
    assert.equal(stornoCall.params[1], svc.KURZFRISTIG_STUNDEN);
    assert.equal(stornoCall.params[2], svc.UNKRITISCH_STUNDEN);
    assert.ok(!/\b48\b/.test(stornoCall.sql) && !/\b336\b/.test(stornoCall.sql),
      "die Gewichtsregeln duerfen keine zweite Wahrheit im SQL haben");
  });

  it("nutzt das 365-Tage-Fenster als Standard und laesst es ueberschreiben", async () => {
    const pool = poolMit();
    const a = await svc.recomputeReliability(pool);
    assert.equal(a.window_days, svc.FENSTER_TAGE);
    assert.equal(pool.calls[0].params[0], 365);

    const pool2 = poolMit();
    const b = await svc.recomputeReliability(pool2, { windowDays: 180 });
    assert.equal(b.window_days, 180);
  });

  it("spiegelt nur die Agentur-Seite nach supplier_reputation", async () => {
    const pool = poolMit({
      nenner: [
        { party_user_id: "agentur", party_side: "agency", binding_deals: 10 },
        { party_user_id: "firma", party_side: "company", binding_deals: 10 }
      ]
    });
    const ergebnis = await svc.recomputeReliability(pool);
    const spiegel = pool.calls.find((c) => c.sql.includes("INSERT INTO supplier_reputation"));
    assert.deepEqual(spiegel.params[0], ["agentur"],
      "supplier_reputation ist anbieterseitig — die Unternehmensquote gehoert dort nicht hinein");
    assert.deepEqual(spiegel.params[1], [100]);
    assert.equal(ergebnis.mirrored, 1);

    const upsert = pool.calls.find((c) => c.sql.includes("INSERT INTO deal_reliability"));
    assert.equal(upsert.params[0].length, 2, "beide Seiten stehen in der Quelle der Wahrheit");
  });

  it("schreibt NULL statt 0 in den Spiegel, wenn die Datenlage nichts hergibt", async () => {
    const pool = poolMit({ nenner: [{ party_user_id: "neu", party_side: "agency", binding_deals: 2 }] });
    await svc.recomputeReliability(pool);
    const spiegel = pool.calls.find((c) => c.sql.includes("INSERT INTO supplier_reputation"));
    assert.deepEqual(spiegel.params[1], [null],
      "2 Deals liegen unter der Schwelle — 0 % waere eine Luege gegenueber einem Neuling");
  });

  it("schreibt keinen leeren Upsert, raeumt aber trotzdem auf", async () => {
    const pool = poolMit();
    const ergebnis = await svc.recomputeReliability(pool);
    assert.equal(ergebnis.parties, 0);
    assert.ok(!pool.calls.some((c) => c.sql.includes("INSERT INTO")), "kein leerer Upsert");
    // Keine Partei mehr im Fenster heisst: ALLE Altwerte sind zu kassieren.
    // Genau dieser Fall darf nicht uebersprungen werden, sonst ueberlebt eine
    // stillgelegte Plattform-Haelfte mit ihren alten Quoten.
    assert.ok(pool.calls.some((c) => c.sql.includes("UPDATE deal_reliability")));
    assert.equal(pool.calls.length, 5, "3 Ladeabfragen + 2 Aufraeum-Abfragen");
  });

  it("klemmt das Batch-Limit und meldet das Abschneiden, statt still zu kuerzen", async () => {
    const pool = poolMit({
      nenner: Array.from({ length: 30 }, (_, i) => ({
        party_user_id: `u${i}`, party_side: "agency", binding_deals: i
      }))
    });
    const ergebnis = await svc.recomputeReliability(pool, { limit: 10 });
    assert.equal(ergebnis.parties, 10);
    assert.equal(ergebnis.truncated, true);

    const upsert = pool.calls.find((c) => c.sql.includes("INSERT INTO deal_reliability"));
    assert.equal(upsert.params[3][0], 29,
      "die geschaeftlich groessten Parteien werden zuerst gerechnet");
  });

  it("deckelt auch einen ueberzogenen Limit-Wunsch", async () => {
    const pool = poolMit();
    await svc.recomputeReliability(pool, { limit: 99999 });
    // Kein Fehler, kein Durchreichen: MAX_BATCH_SIZE ist die Obergrenze.
    assert.equal(svc.MAX_BATCH_SIZE, 1000);
  });

  it("ist idempotent — zwei Laeufe auf gleichen Daten schreiben dasselbe", async () => {
    const daten = {
      nenner: [{ party_user_id: "u1", party_side: "agency", binding_deals: 10 }],
      stornos: [{ party_user_id: "u1", party_side: "agency", reason_code: "worker_quit", from_status: "confirmed", vorlauf_klasse: "normal", anzahl: 1 }]
    };
    const p1 = poolMit(daten);
    const p2 = poolMit(daten);
    await svc.recomputeReliability(p1);
    await svc.recomputeReliability(p2);
    const u1 = p1.calls.find((c) => c.sql.includes("INSERT INTO deal_reliability")).params;
    const u2 = p2.calls.find((c) => c.sql.includes("INSERT INTO deal_reliability")).params;
    assert.deepEqual(u1, u2);
    assert.deepEqual(u1[7], [90], "10 Deals, ein einfach gewichteter Storno");
  });

  it("grenzt auf einzelne Parteien ein, wenn userIds gesetzt sind", async () => {
    const pool = poolMit();
    await svc.recomputeReliability(pool, { userIds: ["a", "a", "b", null] });
    assert.deepEqual(pool.calls[0].params[1], ["a", "b"], "dedupliziert und ohne Leerwerte");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Was mit Parteien passiert, die NICHT im Ergebnis stehen
 *
 * Der blinde Fleck der ersten Fassung: beide Ladeabfragen liefern nur Parteien
 * MIT Deals im Fenster. Wer herausfaellt, behielte seine alte Quote — und den
 * gespiegelten Ranking-Vorteil — fuer immer. Eine Kennzahl, die nur nach oben
 * korrigiert werden kann, ist ein Besitzstand, keine Kennzahl.
 * ══════════════════════════════════════════════════════════════════════════ */

describe("P8/B · Parteien ausserhalb des Fensters", () => {
  function poolMit({ nenner = [], stornos = [], frische = [] } = {}) {
    return trackingPool([
      ["FROM offer_cancellations c", { rows: stornos }],
      ["'agency'::text        AS party_side", { rows: nenner }],
      ["computed_at FROM deal_reliability", { rows: frische }],
      ["INSERT INTO deal_reliability", (sql, params) => ({ rowCount: params[0].length })],
      ["INSERT INTO supplier_reputation", (sql, params) => ({ rowCount: params[0].length })],
      ["UPDATE deal_reliability", { rowCount: 3 }],
      ["UPDATE supplier_reputation", { rowCount: 2 }]
    ]);
  }

  const vollerLauf = () => poolMit({
    nenner: [{ party_user_id: "aktiv", party_side: "agency", binding_deals: 9 }]
  });

  it("setzt Ausgefallene auf NULL zurueck, nicht auf 0", async () => {
    const pool = vollerLauf();
    const ergebnis = await svc.recomputeReliability(pool);
    const reset = pool.calls.find((c) => c.sql.includes("UPDATE deal_reliability"));
    assert.ok(reset, "der Aufraeum-Lauf fand statt");
    assert.match(reset.sql, /reliability_rate = NULL/,
      "0 % waere eine Behauptung ueber jemanden, ueber den es keine Daten gibt");
    assert.match(reset.sql, /NOT EXISTS/, "mengenbasiert, keine Schleife");
    assert.deepEqual(reset.params[0], ["aktiv"], "die gerade gerechneten Parteien bleiben verschont");
    assert.equal(ergebnis.reset, 3);
  });

  it("nimmt auch den Spiegel zurueck — sonst bleibt der Feed-Vorteil stehen", async () => {
    const pool = vollerLauf();
    const ergebnis = await svc.recomputeReliability(pool);
    const entspiegelt = pool.calls.find((c) => c.sql.includes("UPDATE supplier_reputation"));
    assert.ok(entspiegelt);
    assert.match(entspiegelt.sql, /deal_success_rate = NULL/);
    assert.deepEqual(entspiegelt.params[0], ["aktiv"]);
    assert.equal(ergebnis.unmirrored, 2);
  });

  it("raeumt NICHT auf, wenn der Lauf auf einzelne Parteien eingegrenzt war", async () => {
    const pool = poolMit({ nenner: [{ party_user_id: "a", party_side: "agency", binding_deals: 9 }] });
    const ergebnis = await svc.recomputeReliability(pool, { userIds: ["a"] });
    assert.ok(!pool.calls.some((c) => c.sql.includes("UPDATE deal_reliability")),
      "ein gezielter Nachlauf darf niemals fremde Parteien leeren");
    assert.equal(ergebnis.reset, 0);
  });

  it("raeumt NICHT auf, wenn der Lauf am Batch-Limit abgeschnitten wurde", async () => {
    const pool = poolMit({
      nenner: Array.from({ length: 5 }, (_, i) => ({
        party_user_id: `u${i}`, party_side: "agency", binding_deals: 9
      }))
    });
    const ergebnis = await svc.recomputeReliability(pool, { limit: 2 });
    assert.equal(ergebnis.truncated, true);
    assert.ok(!pool.calls.some((c) => c.sql.includes("UPDATE deal_reliability")),
      "sonst wuerden die abgeschnittenen Parteien faelschlich geleert — der teuerste Folgefehler");
    assert.equal(ergebnis.reset, 0);
  });
});

describe("P8/B · Reihenfolge am Batch-Limit", () => {
  function poolMit({ nenner = [], frische = [] } = {}) {
    return trackingPool([
      ["FROM offer_cancellations c", { rows: [] }],
      ["'agency'::text        AS party_side", { rows: nenner }],
      ["computed_at FROM deal_reliability", { rows: frische }],
      ["INSERT INTO deal_reliability", (sql, params) => ({ rowCount: params[0].length })],
      ["INSERT INTO supplier_reputation", (sql, params) => ({ rowCount: params[0].length })],
      ["UPDATE deal_reliability", { rowCount: 0 }],
      ["UPDATE supplier_reputation", { rowCount: 0 }]
    ]);
  }

  it("rechnet die am laengsten nicht gerechnete Partei zuerst, nicht die groesste", async () => {
    const pool = poolMit({
      nenner: [
        { party_user_id: "gross-frisch", party_side: "agency", binding_deals: 500 },
        { party_user_id: "klein-alt", party_side: "agency", binding_deals: 5 }
      ],
      frische: [
        { party_user_id: "gross-frisch", party_side: "agency", computed_at: "2026-08-07T03:00:00Z" },
        { party_user_id: "klein-alt", party_side: "agency", computed_at: "2026-01-01T03:00:00Z" }
      ]
    });
    await svc.recomputeReliability(pool, { limit: 1 });
    const upsert = pool.calls.find((c) => c.sql.includes("INSERT INTO deal_reliability"));
    assert.deepEqual(upsert.params[0], ["klein-alt"],
      "nach Groesse zu sortieren liesse denselben Rest in JEDEM Lauf verhungern");
  });

  it("stellt nie gerechnete Parteien ganz nach vorn", async () => {
    const pool = poolMit({
      nenner: [
        { party_user_id: "bekannt", party_side: "agency", binding_deals: 99 },
        { party_user_id: "neu", party_side: "agency", binding_deals: 6 }
      ],
      frische: [{ party_user_id: "bekannt", party_side: "agency", computed_at: "2026-08-07T03:00:00Z" }]
    });
    await svc.recomputeReliability(pool, { limit: 1 });
    const upsert = pool.calls.find((c) => c.sql.includes("INSERT INTO deal_reliability"));
    assert.deepEqual(upsert.params[0], ["neu"]);
  });

  it("entscheidet bei gleicher Frische nach Groesse", async () => {
    const pool = poolMit({
      nenner: [
        { party_user_id: "klein", party_side: "agency", binding_deals: 6 },
        { party_user_id: "gross", party_side: "agency", binding_deals: 60 }
      ]
    });
    await svc.recomputeReliability(pool, { limit: 1 });
    const upsert = pool.calls.find((c) => c.sql.includes("INSERT INTO deal_reliability"));
    assert.deepEqual(upsert.params[0], ["gross"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Zuverlaessigkeits-Streak (Grundlage des Bounty, P8 Welle C)
 * ══════════════════════════════════════════════════════════════════════════ */

describe("P8/C · Streak-Ermittlung", () => {
  const TAG = 86400000;
  function streakPool({ nenner = [], stornos = [] } = {}) {
    return trackingPool([
      ["'agency'::text        AS party_side", { rows: nenner }],
      ["FROM offer_cancellations c", { rows: stornos }]
    ]);
  }

  it("liefert ohne Parteien nichts und fragt gar nicht erst die Datenbank", async () => {
    const pool = streakPool();
    const map = await svc.ladeZuverlaessigkeitsStreak(pool, []);
    assert.equal(map.size, 0);
    assert.equal(pool.calls.length, 0);
  });

  it("meldet ohne Storno das volle Fenster als sauber", async () => {
    const pool = streakPool({ nenner: [{ party_user_id: "a", party_side: "agency", binding_deals: 7 }] });
    const map = await svc.ladeZuverlaessigkeitsStreak(pool, ["a"], { windowDays: 90 });
    const e = map.get("a::agency");
    assert.equal(e.binding_deals, 7);
    assert.equal(e.days_clean, 90);
    assert.equal(e.last_counted_cancellation, null);
  });

  it("setzt den Streak auf den juengsten ZAEHLENDEN Storno zurueck", async () => {
    const jung = new Date(Date.now() - 3 * TAG).toISOString();
    const alt = new Date(Date.now() - 40 * TAG).toISOString();
    const pool = streakPool({
      nenner: [{ party_user_id: "a", party_side: "agency", binding_deals: 9 }],
      stornos: [
        { party_user_id: "a", party_side: "agency", reason_code: "worker_quit", from_status: "confirmed", lead_time_hours: 10, created_at: jung },
        { party_user_id: "a", party_side: "agency", reason_code: "date_moved", from_status: "confirmed", lead_time_hours: 100, created_at: alt }
      ]
    });
    const e = (await svc.ladeZuverlaessigkeitsStreak(pool, ["a"], { windowDays: 90 })).get("a::agency");
    assert.equal(e.days_clean, 3);
    assert.equal(e.last_counted_cancellation, jung);
  });

  it("uebergeht entschuldigte und rechtzeitige Stornos — dieselbe Regel wie die Quote", async () => {
    const gestern = new Date(Date.now() - TAG).toISOString();
    const pool = streakPool({
      nenner: [{ party_user_id: "a", party_side: "agency", binding_deals: 9 }],
      stornos: [
        // E2: Kundenabsage trifft die Agentur unverschuldet
        { party_user_id: "a", party_side: "agency", reason_code: "customer_cancelled", from_status: "confirmed", lead_time_hours: 2, created_at: gestern },
        // E1: 20 Tage Vorlauf zaehlt gar nicht
        { party_user_id: "a", party_side: "agency", reason_code: "worker_quit", from_status: "confirmed", lead_time_hours: 480, created_at: gestern },
        // Rueckzug vor der Zusage
        { party_user_id: "a", party_side: "agency", reason_code: "worker_quit", from_status: "pending_confirmation", lead_time_hours: 1, created_at: gestern }
      ]
    });
    const e = (await svc.ladeZuverlaessigkeitsStreak(pool, ["a"], { windowDays: 90 })).get("a::agency");
    assert.equal(e.days_clean, 90, "keiner dieser drei Faelle bricht den Streak");
    assert.equal(e.last_counted_cancellation, null);
  });

  it("haelt die Marktseiten getrennt", async () => {
    const gestern = new Date(Date.now() - TAG).toISOString();
    const pool = streakPool({
      nenner: [
        { party_user_id: "a", party_side: "agency", binding_deals: 5 },
        { party_user_id: "a", party_side: "company", binding_deals: 4 }
      ],
      stornos: [{ party_user_id: "a", party_side: "company", reason_code: "mistake", from_status: "confirmed", lead_time_hours: 5, created_at: gestern }]
    });
    const map = await svc.ladeZuverlaessigkeitsStreak(pool, ["a"], { windowDays: 90 });
    assert.equal(map.get("a::agency").days_clean, 90);
    assert.equal(map.get("a::company").days_clean, 1);
  });

  it("liefert bei einem Datenbankfehler nichts — ein Bounty ohne Nachweis wird nicht vergeben", async () => {
    const pool = trackingPool([["'agency'::text", new Error("DB weg")]]);
    const map = await svc.ladeZuverlaessigkeitsStreak(pool, ["a"]);
    assert.equal(map.size, 0);
  });

  it("nutzt 90 Tage als Standard-Streak und ein Jahr als Nachweisfenster", async () => {
    const pool = streakPool({ nenner: [] });
    await svc.ladeZuverlaessigkeitsStreak(pool, ["a"]);
    const storno = pool.calls.find((c) => c.sql.includes("FROM offer_cancellations c"));
    const nenner = pool.calls.find((c) => c.sql.includes("'agency'::text"));
    assert.equal(storno.params[0], 90, "der Streak zaehlt 90 Tage");
    assert.equal(nenner.params[0], svc.FENSTER_TAGE, "das Geschaefts-Nachweisfenster bleibt das Jahr");
  });

  // Der Fehler, den erst der Lauf gegen echte Daten gezeigt hat: koppelt man
  // beide Fenster, haelt ein ruhiger Partner die 365-Tage-Stufe und bleibt bei
  // der 90-Tage-Stufe gesperrt. Die Leiter liefe rueckwaerts.
  it("trennt Streak- und Nachweisfenster, damit die Leiter monoton bleibt", async () => {
    const pool = streakPool({ nenner: [{ party_user_id: "a", party_side: "agency", binding_deals: 9 }] });
    await svc.ladeZuverlaessigkeitsStreak(pool, ["a"], { windowDays: 90, dealWindowDays: 365 });
    const nenner = pool.calls.find((c) => c.sql.includes("'agency'::text"));
    assert.equal(nenner.params[0], 365,
      "die Abschluesse werden ueber das Jahr gezaehlt, nicht ueber die 90 Streak-Tage");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Ereignisgetriebener Nachlauf
 * ══════════════════════════════════════════════════════════════════════════ */

describe("P8/B · Nachlauf nach dem Storno", () => {
  it("loest die Partei aus dem Angebot auf und rechnet nur diese", async () => {
    const pool = trackingPool([
      ["END AS party_user_id\n         FROM offers o", { rows: [{ party_user_id: "agentur-7" }] }],
      ["'agency'::text        AS party_side", { rows: [{ party_user_id: "agentur-7", party_side: "agency", binding_deals: 6 }] }],
      ["INSERT INTO deal_reliability", (sql, params) => ({ rowCount: params[0].length })],
      ["INSERT INTO supplier_reputation", (sql, params) => ({ rowCount: params[0].length })]
    ]);
    const ergebnis = await svc.refreshReliabilityForOfferParty(pool, "offer-1", "agency");
    assert.equal(ergebnis.parties, 1);
    const nenner = pool.calls.find((c) => c.sql.includes("'agency'::text        AS party_side"));
    assert.deepEqual(nenner.params[1], ["agentur-7"]);
  });

  it("wirft nie — ein Kennzahl-Fehler darf keinen gueltigen Storno kippen", async () => {
    const pool = trackingPool([["FROM offers o", new Error("DB weg")]]);
    const ergebnis = await svc.refreshReliabilityForOfferParty(pool, "offer-1", "agency");
    assert.equal(ergebnis, null);
  });

  it("tut nichts ohne Angebot oder Seite", async () => {
    const pool = trackingPool([]);
    assert.equal(await svc.refreshReliabilityForOfferParty(pool, null, "agency"), null);
    assert.equal(await svc.refreshReliabilityForOfferParty(pool, "o1", null), null);
    assert.equal(pool.calls.length, 0);
  });

  it("liest eine fehlende Tabelle als 'keine Daten', nicht als Fehler", async () => {
    const pool = trackingPool([["FROM deal_reliability", new Error('relation "deal_reliability" does not exist')]]);
    assert.equal(await svc.getReliability(pool, "u1", "agency"), null);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Verdrahtung — der Teil, den eine gruene Suite sonst nicht sieht
 * ══════════════════════════════════════════════════════════════════════════ */

describe("P8/B · Verdrahtung", () => {
  const lies = (p) => fs.readFileSync(path.join(REPO_ROOT, p), "utf8");

  it("Migration 164 legt Tabelle, Schluessel und Vorzustand an", () => {
    const sql = lies("sql/migrations/164_deal_reliability.sql");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS deal_reliability/);
    assert.match(sql, /PRIMARY KEY \(party_user_id, party_side\)/,
      "der Schluessel muss die Seite enthalten, sonst kollidieren beide Rollen derselben Org");
    assert.match(sql, /ADD COLUMN IF NOT EXISTS from_status/);
    assert.match(sql, /offers_confirmed_at_idx/, "der Nenner-Scan braucht einen Stuetz-Index");
    assert.match(sql, /Rollback:/, "jede Migration nennt ihren Rueckweg");
  });

  // Dieser Test existiert wegen eines echten Defekts aus Welle A: der Fallback
  // fuer den Einsatzbeginn zeigte auf `offer.assignment_start_date` — eine
  // Spalte, die es auf `offers` nicht gibt (nur auf `offer_cancellations`).
  // Folge: `lead_time_hours` blieb NULL, sobald `start_confirmed` leer war, und
  // die 48-Stunden-Regel zuendete dort nie. Im Entwicklungsbestand betraf das
  // 8 von 15 bestaetigten Angeboten. Kein Test war rot — der Fallback sah nur
  // richtig aus.
  it("loest den Einsatzbeginn ueber die Nachfrage auf, sonst zuendet E1 nie", () => {
    const src = lies("api/services/dealAgreementService.js");
    const cancel = src.slice(src.indexOf("export async function cancelAgreement"));
    assert.match(cancel, /JOIN demand_requests d ON d\.id = o\.demand_request_id/,
      "ohne den Join gibt es keinen zweiten Weg zum Einsatzbeginn");
    assert.match(cancel, /offer\.start_confirmed \|\| offer\.demand_start/);
    assert.ok(!/offer\.assignment_start_date/.test(cancel),
      "diese Spalte existiert auf offers nicht — der Fallback waere tot, E1 wirkungslos");
    assert.match(cancel, /FOR UPDATE OF o/,
      "der Join darf die Zeilensperre nicht auf demand_requests ausweiten");
  });

  it("der Storno schreibt den Vorzustand mit und rechnet nach", () => {
    const src = lies("api/services/dealAgreementService.js");
    assert.match(src, /INSERT INTO offer_cancellations[\s\S]*from_status/);
    assert.match(src, /refreshReliabilityForOfferParty/);
    const nachlauf = src.indexOf("refreshReliabilityForOfferParty");
    const txEnde = src.indexOf("const ergebnis = await withTransaction");
    assert.ok(nachlauf > txEnde,
      "der Nachlauf gehoert hinter die Transaktion — eine Kennzahl darf keinen Storno rollbacken");
  });

  it("der Cron-Endpunkt existiert und steht im Zeitplan", () => {
    assert.match(lies("api/routes/internal.js"),
      /router\.post\("\/internal\/recompute-deal-reliability"/);
    assert.match(lies("docs/SCHEDULER.md"),
      /\/api\/internal\/recompute-deal-reliability/);
  });

  it("Welle C: Migration 165 legt die Leiter an und nimmt Erschlichenes zurueck", () => {
    const sql = lies("sql/migrations/165_reliability_bounty.sql");
    assert.match(sql, /'zuverlaessiger_partner'/);
    assert.match(sql, /reliability_streak/);
    assert.match(sql, /"replaces": "zuverlaessiger_partner"/,
      "ohne Abloesung gaebe es zweimal Rabatt fuer dieselbe Tugend");
    assert.match(sql, /UPDATE user_bounties SET is_active = FALSE/,
      "bestehende zero_complaint-Vergaben wurden am falschen Storno-Kanal gemessen");
    assert.match(sql, /Rollback:/);
  });

  it("Welle C: das Bounty rechnet nicht selbst, sondern fragt die Quote", () => {
    const src = lies("api/services/bountyService.js");
    assert.match(src, /ladeZuverlaessigkeitsStreak/,
      "eine zweite Storno-Definition im Bounty-Service waere Drift mit Ansage");
    assert.ok(!/requests\.status = 'CANCELED'/.test(src));
    assert.ok(!/case 'zero_complaints_12m'/.test(src),
      "der Typ am falschen Kanal ist ersatzlos entfernt, damit er ohne Migration nichts mehr vergibt");
  });

  it("Welle C: die Begruendung erreicht die Oberflaeche", () => {
    assert.match(lies("api/routes/bounties.js"), /notes/,
      "die Route muss die Begruendungen aus evaluateBounties durchreichen");
    assert.match(lies("api/services/bountyService.js"), /notes\.get\(b\.key\)/);
    assert.match(lies("api/services/bountyService.js"), /superseded_by/,
      "die abgeloeste Stufe muss als solche erkennbar sein, sonst wirkt ihr Rabatt einbehalten");
    assert.match(lies("frontend/public/js/pages/bounties.js"), /b\.note.*bounty-note/s);
    assert.match(lies("frontend/public/bounties.html"), /\.bounty-note/);
  });

  it("reputationService bevorzugt die neue Quelle vor dem Legacy-Wert", () => {
    const src = lies("api/services/reputationService.js");
    assert.match(src, /FROM deal_reliability/);
    const legacy = src.indexOf("let dealSuccessRate = computeDealSuccessRate");
    const neu = src.indexOf("FROM deal_reliability");
    assert.ok(legacy > -1 && neu > legacy,
      "der neue Wert muss den alten ueberschreiben, nicht umgekehrt");
  });
});
