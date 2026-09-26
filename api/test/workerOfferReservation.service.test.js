/**
 * workerOfferReservationService — Hard-Reserve-Sweep (Welle 4b, M4c.3).
 * DB-frei: Mock-Pool prüft, dass Reserve + Release als set-basierte UPDATEs laufen
 * und die Zähler korrekt zurückkommen.
 *
 * M4c.3 — WARUM EINE PROBE HIER UMGESCHRIEBEN WURDE.
 *
 * Hier stand die Probe "Sammelangebote (pool_*) werden NICHT reserviert
 * (nur single_skill/bundle)". Sie war nicht falsch, sie hat eine VERTAGUNG
 * festgenagelt: der Dienst trug dazu den Satz "Feinlogik: eigener Ausbau", und
 * Migration 146 hat `capacity_post_pool_members` ausdrücklich für "die spätere
 * Reservierung (Welle 4b)" angelegt. Gebaut wurde sie nie — die Tabelle wurde
 * seither nur geschrieben, nie gelesen.
 *
 * Der Owner-Satz "ein Mensch, fünfmal gebucht, wäre Betrug" hebt diese Vertagung
 * auf. Gemessen am 2026-09-24 gegen die Entwicklungsdatenbank: derselbe Mensch
 * stand gleichzeitig in einem aktiven Sammelangebot UND in einem aktiven
 * Einzelangebot — heute zweimal buchbar.
 *
 * Die Probe wird deshalb an die neue Regel gehängt, nicht entfernt und nicht
 * abgeschwächt: dass die personengebundene Abfrage KEINE Sammelangebote anfasst,
 * bleibt zugesichert (die Mechaniken sind verschieden und dürfen sich nicht
 * vermischen) — dazu kommt, dass es die zweite Mechanik überhaupt gibt und dass
 * sie an denselben Bedingungen hängt.
 *
 * Run: node --test test/workerOfferReservation.service.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/workerOfferReservationService.js";
import { gebundenSql } from "../services/bindungSql.js";

const PAUSIERT = "SET status = 'paused'";
const AKTIVIERT = "SET status = 'active'";
const PERSONEN_ARTEN = "cp.offer_kind IN ('single_skill', 'bundle')";
const POOL_ARTEN = "cp.offer_kind IN ('pool_single_skill', 'pool_multi_skill')";

/** Trennt die vier Abfragen des Sweeps: personengebunden vs. Sammelangebot. */
function zerlegen(calls) {
  const sql = calls.map((c) => (typeof c === "string" ? c : c.sql));
  return {
    personenReserve: sql.find((s) => s.includes(PAUSIERT) && s.includes(PERSONEN_ARTEN)),
    personenRelease: sql.find((s) => s.includes(AKTIVIERT) && s.includes("cp.worker_profile_id IS NOT NULL")),
    poolReserve: sql.find((s) => s.includes(PAUSIERT) && s.includes(POOL_ARTEN)),
    poolRelease: sql.find((s) => s.includes(AKTIVIERT) && s.includes(POOL_ARTEN)),
    alle: sql
  };
}

function sammelPool() {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("worker_reserved = TRUE, worker_reserved_at = NOW()")) return { rowCount: 3, rows: [] };
      if (sql.includes("worker_reserved = FALSE, worker_reserved_at = NULL")) return { rowCount: 2, rows: [] };
      return { rowCount: 0, rows: [] };
    }
  };
}

describe("workerOfferReservationService.sweepReservations", () => {
  it("führt Reserve + Release aus und liefert die Zähler", async () => {
    const pool = sammelPool();
    const res = await svc.sweepReservations(pool);
    assert.equal(res.reserved, 3);
    assert.equal(res.released, 2);

    const q = zerlegen(pool.calls);
    // Reserve: aktive Einzel-/Bündelangebote im-Einsatz-Arbeiter -> paused
    assert.ok(q.personenReserve, "die personengebundene Reserve-Abfrage fehlt");
    assert.ok(q.personenReserve.includes("EXISTS"));
    // Release: reservierte -> active, sobald Arbeiter frei (NOT EXISTS)
    assert.ok(q.personenRelease, "die personengebundene Release-Abfrage fehlt");
    assert.ok(q.personenRelease.includes("cp.worker_reserved = TRUE"));
    assert.ok(q.personenRelease.includes("NOT"));
  });

  it("die personengebundene Abfrage fasst KEINE Sammelangebote an", async () => {
    /*
     * Die Trennung der Mechaniken bleibt zugesichert. Würde `pool_single_skill`
     * in die personengebundene Abfrage geraten, liefe die Regel "EIN gebundener
     * Mensch sperrt das Angebot" auf ein Sammelangebot — und 29 freie Kräfte
     * verschwänden, weil eine gebunden ist.
     */
    const pool = sammelPool();
    await svc.sweepReservations(pool);
    const q = zerlegen(pool.calls);
    assert.ok(q.personenReserve);
    assert.ok(!q.personenReserve.includes("pool_single_skill"));
    assert.ok(!q.personenReserve.includes("pool_multi_skill"));
  });

  it("M4c.3: Sammelangebote werden reserviert — als eigene, vierte Abfrage", async () => {
    const pool = sammelPool();
    const res = await svc.sweepReservations(pool);
    const q = zerlegen(pool.calls);

    assert.equal(q.alle.length, 4, "der Sweep läuft nicht über vier Abfragen");
    assert.ok(q.poolReserve, "es gibt keine Reserve-Abfrage für Sammelangebote");
    assert.ok(q.poolRelease, "es gibt keine Release-Abfrage für Sammelangebote");
    assert.equal(res.pools_reserved, 3);
    assert.equal(res.pools_released, 2);
  });

  it("ein Sammelangebot wird erst gesperrt, wenn KEIN Mitglied mehr frei ist", () => {
    /*
     * Die Schwelle ist der ganze Unterschied zur personengebundenen Regel. Stünde
     * hier `> 0` statt `= 0`, verschwände jedes Sammelangebot, sobald auch nur
     * eine Kraft frei ist — also genau das Gegenteil. Stünde gar keine Schwelle,
     * verschwände jedes Sammelangebot sofort.
     */
    const frei = svc._FUER_PROBEN.POOL_FREIE_MITGLIEDER_SQL;
    const s = svc._FUER_PROBEN.POOL_RESERVE_SQL;
    assert.ok(s.includes(POOL_ARTEN), "die Reserve-Abfrage ist nicht auf Sammelangebote begrenzt");
    assert.ok(s.includes(`${frei} = 0`),
      "die Sperrschwelle haengt nicht als '= 0' an der Zaehlung der freien Mitglieder");

    const r = svc._FUER_PROBEN.POOL_RELEASE_SQL;
    assert.ok(r.includes(POOL_ARTEN), "die Release-Abfrage ist nicht auf Sammelangebote begrenzt");
    assert.ok(r.includes(`${frei} > 0`),
      "die Freigabe haengt nicht als '> 0' an der Zaehlung der freien Mitglieder");
    assert.ok(r.includes("cp.worker_reserved = TRUE"), "die Freigabe greift nicht nur auf selbst Reserviertes");
  });

  it("ein Sammelangebot OHNE Mitglieder wird nicht angefasst", () => {
    /*
     * Migration 146 erlaubt ausdrücklich "pauschal N Helfer ohne konkrete
     * Personen". Ohne diese Bedingung zählt die Mitglieder-Abfrage 0 freie
     * Mitglieder — weil es gar keine gibt — und der Sweep pausierte jedes
     * pauschale Sammelangebot der Plattform. Ein stiller Totalausfall.
     */
    const s = svc._FUER_PROBEN.POOL_RESERVE_SQL;
    assert.ok(s.includes("EXISTS (SELECT 1 FROM capacity_post_pool_members m0"),
      "die Bedingung 'hat überhaupt Mitglieder' fehlt");
    /*
     * NICHT PER TEILZEICHENKETTE. Die erste Fassung endete hier — und blieb in der
     * Gegenpruefung gruen, als `EXISTS` zu `NOT EXISTS` umgedreht wurde: der
     * kuerzere Name steckt im laengeren. Umgedreht bedeutete die Bedingung das
     * Gegenteil (nur noch PAUSCHALE Sammelangebote wuerden gesperrt, und die mit
     * Mitgliedern nie), und kein Nachweis haette es gemeldet.
     */
    const h = svc._FUER_PROBEN.POOL_HAT_MITGLIEDER_SQL;
    assert.ok(h.trimStart().startsWith("EXISTS ("),
      "die Bedingung beginnt nicht mit EXISTS — umgedreht sperrt sie genau die falschen");
    assert.ok(!/NOT\s+EXISTS/.test(h),
      "die Bedingung ist verneint: pauschale Sammelangebote wuerden gesperrt, bemannte nie");
    assert.ok(s.includes(`AND ${h}`),
      "die Bedingung haengt nicht als eigene UND-Bedingung in der Reserve-Abfrage");
  });

  it("die Gebunden-Regel der Mitglieder ist BUCHSTAEBLICH dieselbe wie die der Personen", () => {
    /*
     * Hier standen die Bestandteile der Regel einzeln: `worker_assignment_links`,
     * `is_active`, die Datumsregel. Das sicherte AEHNLICHKEIT zu — zwei Fassungen,
     * die sich gleich lesen und trotzdem auseinanderlaufen koennen, sobald jemand
     * nur eine anfasst. Genau so war es: die Fassung hier kannte die BUCHUNG
     * nicht, die des Feeds auch nicht, und ein gebuchter Mensch zaehlte in einem
     * Sammelangebot weiter als freier Kopf (Audit-Befund F5).
     *
     * Seit M4c.3b gibt es die Regel einmal (`bindungSql.js`). Die Zusicherung
     * lautet deshalb nicht mehr "sieht gleich aus", sondern "IST dieselbe": der
     * Ausdruck muss buchstaeblich der geteilte sein, auf die Spalte des
     * Mitglieds angewandt. Ihre Bestandteile pinnt `bindungSql.test.js` — hier
     * zu wiederholen hiesse, die Abschrift durch die Hintertuer wieder
     * einzufuehren.
     */
    const f = svc._FUER_PROBEN.POOL_FREIE_MITGLIEDER_SQL;
    assert.ok(f.includes("FROM capacity_post_pool_members m"),
      "gezaehlt wird nicht ueber die Mitgliedertabelle");
    assert.ok(f.includes("m.capacity_post_id = cp.id"),
      "die Mitglieder sind nicht an DIESES Angebot gebunden");
    assert.ok(f.includes(`NOT ${gebundenSql("m.worker_profile_id")}`),
      "die Mitglieder-Regel ist nicht die geteilte Bindung — eine zweite Fassung laeuft von ihr weg");

    /* Und dieselbe Regel auf der personengebundenen Seite, auf deren Spalte. */
    assert.ok(svc._FUER_PROBEN.RESERVE_SQL.includes(gebundenSql("cp.worker_profile_id")),
      "die personengebundene Reserve benutzt eine eigene Fassung der Bindung");
    assert.ok(svc._FUER_PROBEN.RELEASE_SQL.includes(`NOT ${gebundenSql("cp.worker_profile_id")}`),
      "die Freigabe benutzt eine eigene Fassung der Bindung");
  });

  it("syncWorkerReservation grenzt auf einen Arbeiter ein — auch über die Mitgliedschaft", async () => {
    /*
     * Die frühere Fassung verlangte `cp.worker_profile_id = $1` in JEDER Abfrage.
     * Ein Sammelangebot trägt diese Spalte gar nicht (sie ist dort NULL) — die
     * Eingrenzung läuft deshalb über die Mitgliedschaft. Die Zusicherung selbst
     * bleibt dieselbe und wird hier enger geführt: keine Abfrage ohne eine der
     * beiden benannten Eingrenzungen, und jede mit demselben Parameter.
     */
    const calls = [];
    const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rowCount: 1, rows: [] }; } };
    const res = await svc.syncWorkerReservation(pool, "w1");
    assert.equal(res.reserved, 1);
    assert.equal(res.released, 1);
    assert.equal(res.pools_reserved, 1);
    assert.equal(res.pools_released, 1);
    assert.equal(calls.length, 4);

    for (const c of calls) {
      const personengebunden = c.sql.includes("cp.worker_profile_id = $1");
      const ueberMitgliedschaft = c.sql.includes("m2.worker_profile_id = $1");
      assert.ok(personengebunden || ueberMitgliedschaft,
        "eine Abfrage läuft ohne Eingrenzung über die ganze Plattform");
      assert.deepEqual(c.params, ["w1"], "die Eingrenzung hängt nicht am übergebenen Menschen");
    }
    assert.equal(calls.filter((c) => c.sql.includes("m2.worker_profile_id = $1")).length, 2,
      "die beiden Sammelangebot-Abfragen sind nicht über die Mitgliedschaft eingegrenzt");
  });
});
