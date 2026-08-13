/**
 * Gate E5 gegen das REALE Schema — das Protokoll laesst sich nicht umgehen.
 *
 * DIE ZUSAGE, DIE HIER GEPRUEFT WIRD
 *   "Ein Test belegt, dass ein Zustandswechsel OHNE Protokolleintrag nicht
 *    moeglich ist."
 *
 * Ein Mock-Test kann das grundsaetzlich nicht: er wuerde hoechstens zeigen, dass
 * UNSER Dienst protokolliert. Die Zusage ist aber staerker — sie behauptet, dass
 * es keinen Weg vorbei gibt. Deshalb schreibt dieser Test ausschliesslich mit
 * ROHEM SQL, ganz ohne Anwendungscode. Was hier ankommt, kommt von den Triggern
 * aus Migration 179.
 *
 * Zweiter Zweck: die Abgleichprobe. Der Zustand ist zweimal definiert — in
 * `worker_live_status()` (fuer die Trigger) und in getWorkerLiveBoard (fuer die
 * Tafel). Doppelte Logik braucht doppelte Tests, sonst driftet sie. Der letzte
 * Block vergleicht beide an denselben Daten.
 *
 * Requires: DATABASE_URL (oder DB_HOST + POSTGRES_PASSWORD)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { hasDb, createPool, createSupplierOrg } from "./helpers.js";
import { getWorkerLiveBoard } from "../../services/workforceService.js";
import { getStatusTimeline, aufbewahrungDurchsetzen } from "../../services/workerStatusEventService.js";

describe("Welle E5 — das Protokoll entsteht an der Quelle", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  let org;
  let fremdeOrg;
  let firma;
  let nutzer;
  let profil;
  let auftrag;

  const ereignisse = async () => {
    const { rows } = await pool.query(
      `SELECT von_zustand, nach_zustand, ausgeloest_durch, bezug_typ, zeitpunkt
         FROM worker_status_events
        WHERE worker_profile_id = $1
        ORDER BY zeitpunkt ASC, id ASC`,
      [profil]
    );
    return rows;
  };

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    org = await createSupplierOrg(pool, "E5 Testagentur");
    fremdeOrg = await createSupplierOrg(pool, "E5 Fremde Agentur");
    firma = await createSupplierOrg(pool, "E5 Kundenbetrieb");

    const stempel = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const { rows: u } = await pool.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, 'x', 'worker') RETURNING id`,
      [`e5-${stempel}@test.tempconnect.invalid`]
    );
    nutzer = u[0].id;

    const { rows: p } = await pool.query(
      `INSERT INTO worker_profiles (user_id, supplier_org_id, first_name, last_name, personnel_number)
       VALUES ($1, $2, 'Zeit', 'Strahl', $3) RETURNING id`,
      [nutzer, org, `E5-${stempel}`]
    );
    profil = p[0].id;

    const { rows: a } = await pool.query(
      `INSERT INTO assignments (org_id, supplier_org_id, start_date, planned_end_date, status)
       VALUES ($1, $2, CURRENT_DATE - 10, CURRENT_DATE + 90, 'active') RETURNING id`,
      [firma, org]
    );
    auftrag = a[0].id;
  });

  after(async () => {
    if (!hasDb || !pool) return;
    const orgs = [org, fremdeOrg, firma];
    await pool.query("DELETE FROM worker_status_events WHERE supplier_org_id = ANY($1::uuid[])", [orgs]).catch(() => {});
    await pool.query("DELETE FROM worker_assignment_links WHERE supplier_org_id = ANY($1::uuid[])", [orgs]).catch(() => {});
    await pool.query("DELETE FROM assignments WHERE supplier_org_id = ANY($1::uuid[])", [orgs]).catch(() => {});
    await pool.query("DELETE FROM worker_absences WHERE supplier_org_id = ANY($1::uuid[])", [orgs]).catch(() => {});
    await pool.query("DELETE FROM worker_profiles WHERE supplier_org_id = ANY($1::uuid[])", [orgs]).catch(() => {});
    await pool.query("DELETE FROM users WHERE id = $1", [nutzer]).catch(() => {});
    await pool.query("DELETE FROM organizations WHERE id = ANY($1::uuid[])", [orgs]).catch(() => {});
    await pool.end();
  });

  /* ── Der Kern des Gates ──────────────────────────────────────────────────── */

  it("ein Einsatz per rohem SQL erzeugt einen Protokolleintrag — ohne jeden Anwendungscode", async () => {
    await pool.query(
      `INSERT INTO worker_assignment_links
         (worker_user_id, assignment_id, org_id, supplier_org_id, start_date, end_date)
       VALUES ($1, $2, $3, $4, CURRENT_DATE - 10, CURRENT_DATE + 90)`,
      [nutzer, auftrag, firma, org]
    );
    const e = await ereignisse();
    assert.strictEqual(e.length, 1, "genau ein Ereignis");
    assert.strictEqual(e[0].von_zustand, null, "das erste Ereignis hat keinen Vorzustand — eine erfundene Vorgeschichte waere schlimmer");
    assert.strictEqual(e[0].nach_zustand, "im_einsatz");
    assert.strictEqual(e[0].ausgeloest_durch, "einsatz");
  });

  it("eine Krankmeldung per rohem SQL ebenso — mit dem richtigen Vorzustand", async () => {
    await pool.query(
      `INSERT INTO worker_absences (worker_profile_id, supplier_org_id, art, von, bis)
       VALUES ($1, $2, 'krank', CURRENT_DATE, CURRENT_DATE + 3)`,
      [profil, org]
    );
    const e = await ereignisse();
    assert.strictEqual(e.length, 2);
    assert.strictEqual(e[1].von_zustand, "im_einsatz");
    assert.strictEqual(e[1].nach_zustand, "abwesend");
    assert.strictEqual(e[1].ausgeloest_durch, "abwesenheit");
  });

  it("die Ruecknahme der Krankmeldung fuehrt zurueck in den Einsatz", async () => {
    await pool.query(
      `UPDATE worker_absences SET aufgehoben_am = NOW() WHERE worker_profile_id = $1`,
      [profil]
    );
    const e = await ereignisse();
    assert.strictEqual(e.length, 3);
    assert.strictEqual(e[2].von_zustand, "abwesend");
    assert.strictEqual(e[2].nach_zustand, "im_einsatz");
  });

  it("Montage ist ein eigener Wechsel, nicht dieselbe Zeile mit anderem Wort", async () => {
    await pool.query(
      `UPDATE worker_assignment_links SET is_montage = TRUE WHERE worker_user_id = $1`,
      [nutzer]
    );
    const e = await ereignisse();
    assert.strictEqual(e.length, 4);
    assert.strictEqual(e[3].von_zustand, "im_einsatz");
    assert.strictEqual(e[3].nach_zustand, "montage");
  });

  it("eine Aenderung OHNE Zustandswirkung schreibt nichts", async () => {
    // Sonst fuellte sich der Zeitstrahl mit "montage -> montage", und die eine
    // echte Aenderung ginge darin unter.
    const vorher = (await ereignisse()).length;
    await pool.query(
      `UPDATE worker_assignment_links SET location_address = 'Musterstrasse 1' WHERE worker_user_id = $1`,
      [nutzer]
    );
    await pool.query(
      `UPDATE worker_assignment_links SET end_date = CURRENT_DATE + 120 WHERE worker_user_id = $1`,
      [nutzer]
    );
    assert.strictEqual((await ereignisse()).length, vorher,
      "weder die Adresse noch ein spaeteres Enddatum aendern den Zustand");
  });

  it("das Stilllegen des Profils wird protokolliert — und schlaegt alles andere", async () => {
    await pool.query(`UPDATE worker_profiles SET is_active = FALSE WHERE id = $1`, [profil]);
    const e = await ereignisse();
    assert.strictEqual(e[e.length - 1].von_zustand, "montage");
    assert.strictEqual(e[e.length - 1].nach_zustand, "inaktiv");
    assert.strictEqual(e[e.length - 1].ausgeloest_durch, "profil");
    await pool.query(`UPDATE worker_profiles SET is_active = TRUE WHERE id = $1`, [profil]);
  });

  /* ── Der Zeitstrahl, den Gate E5 verlangt ────────────────────────────────── */

  it("der Zeitstrahl zeigt jede Aenderung mit Zeitpunkt und Ausloeser", async () => {
    const t = await getStatusTimeline(pool, org, profil, { tage: 90 });
    assert.strictEqual(t.available, true);
    assert.ok(t.items.length >= 6, `erwartet mindestens 6 Ereignisse, gefunden ${t.items.length}`);
    assert.strictEqual(t.scope.tage, 90);
    for (const e of t.items) {
      assert.ok(e.zeitpunkt, "jedes Ereignis hat einen Zeitpunkt");
      assert.ok(["abwesenheit", "einsatz", "profil"].includes(e.ausgeloest_durch), "und einen Ausloeser");
    }
    // Neueste zuerst — der Disponent liest von oben.
    const zeiten = t.items.map((e) => new Date(e.zeitpunkt).getTime());
    assert.deepEqual(zeiten, [...zeiten].sort((a, b) => b - a));
    assert.strictEqual(t.worker.first_name, "Zeit");
  });

  it("eine fremde Agentur sieht den Zeitstrahl nicht", async () => {
    const t = await getStatusTimeline(pool, fremdeOrg, profil, {});
    assert.strictEqual(t.error, "ORG_BOUNDARY_VIOLATION");
    assert.strictEqual(t.status, 403);
  });

  it("ein unbekanntes Profil ist 404, nicht 403 — der Unterschied verraet nichts", async () => {
    const t = await getStatusTimeline(pool, org, "00000000-0000-0000-0000-000000000000", {});
    assert.strictEqual(t.error, "NOT_FOUND");
  });

  /* ── Abgleichprobe: eine Definition, zwei Leser ──────────────────────────── */

  it("worker_live_status() und die Tafel sagen dasselbe", async () => {
    // Doppelte Logik braucht doppelte Tests. Driftet eine der beiden Stellen,
    // faellt es hier auf — und nicht erst im Protokoll eines Kunden.
    const board = await getWorkerLiveBoard(pool, org);
    const zeile = board.workers.find((w) => w.id === profil);
    const { rows } = await pool.query(`SELECT worker_live_status($1) AS zustand`, [profil]);

    const tafel = zeile.live_status === "endet_bald" ? "im_einsatz" : zeile.live_status;
    assert.strictEqual(rows[0].zustand, tafel,
      "die Funktion der Trigger und die Anzeige der Tafel duerfen nicht auseinanderlaufen");
  });

  it("'endet_bald' taucht im Protokoll nicht auf — es ist eine Frist, kein Zustand", async () => {
    await pool.query(
      `UPDATE worker_assignment_links SET end_date = CURRENT_DATE + 2 WHERE worker_user_id = $1`,
      [nutzer]
    );
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM worker_status_events
        WHERE worker_profile_id = $1 AND nach_zustand = 'endet_bald'`,
      [profil]
    );
    assert.strictEqual(rows[0].n, 0);

    // Die Tafel zeigt die Frist trotzdem — sie ist nur kein Protokoll-Ereignis.
    const board = await getWorkerLiveBoard(pool, org);
    const zeile = board.workers.find((w) => w.id === profil);
    assert.strictEqual(zeile.endet_bald, true);
  });

  /* ── Aufbewahrung ────────────────────────────────────────────────────────── */

  it("die Aufbewahrung loescht, was aelter als 24 Monate ist — und sonst nichts", async () => {
    await pool.query(
      `INSERT INTO worker_status_events
         (worker_profile_id, supplier_org_id, von_zustand, nach_zustand, ausgeloest_durch, zeitpunkt)
       VALUES ($1, $2, 'verfuegbar', 'inaktiv', 'profil', NOW() - INTERVAL '25 months')`,
      [profil, org]
    );
    const vorher = (await ereignisse()).length;

    const { geloescht } = await aufbewahrungDurchsetzen(pool);
    assert.ok(geloescht >= 1, "der alte Eintrag ist weg");

    const nachher = await ereignisse();
    assert.strictEqual(nachher.length, vorher - geloescht);
    assert.ok(nachher.every((e) => new Date(e.zeitpunkt) > new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 2)),
      "die juengeren Eintraege bleiben unangetastet");
  });

  it("ein geloeschtes Profil nimmt sein Protokoll mit — keine verwaisten Zeilen", async () => {
    const { rows: p } = await pool.query(
      `INSERT INTO worker_profiles (user_id, supplier_org_id, first_name, last_name, personnel_number)
       VALUES (NULL, $1, 'Weg', 'Damit', $2) RETURNING id`,
      [org, `E5X-${Date.now()}`]
    );
    const opfer = p[0].id;
    await pool.query(
      `INSERT INTO worker_absences (worker_profile_id, supplier_org_id, art, von)
       VALUES ($1, $2, 'urlaub', CURRENT_DATE)`,
      [opfer, org]
    );
    const { rows: vorher } = await pool.query(
      `SELECT count(*)::int AS n FROM worker_status_events WHERE worker_profile_id = $1`, [opfer]);
    assert.ok(vorher[0].n >= 1, "das Profil hat ein Protokoll");

    await pool.query(`DELETE FROM worker_profiles WHERE id = $1`, [opfer]);
    const { rows: nachher } = await pool.query(
      `SELECT count(*)::int AS n FROM worker_status_events WHERE worker_profile_id = $1`, [opfer]);
    assert.strictEqual(nachher[0].n, 0);
  });
});
