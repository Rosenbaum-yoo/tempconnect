/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Z2 — DIE KENNZAHL DES STUNDENZETTELS LAEUFT, AM REALEN SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `getWorkerTimesheetSummary` zaehlte mit
 *
 *     COUNT(*) FILTER (WHERE ts.worker_signed_at IS NOT NULL) AS signed_count
 *
 * auf einer Spalte, die es nicht gibt (gemessen 2026-09-27: `timesheets` hat 26
 * Spalten, keine Unterschrift; auch keine Migration nennt sie). Weil die Spalte
 * MITTEN IN EINEM FILTER stand, warf nicht die Kennzahl, sondern die GANZE
 * Abfrage: `GET /timesheets/worker-summary` lieferte immer eine 500, keinen
 * einzigen Tag eine Zahl.
 *
 * WARUM DIE VORHANDENEN PROBEN DAS NICHT GEFANGEN HABEN, und das ist die Lehre
 * der ganzen Welle: `timesheetPerfect.test.js` prueft die Rueckgabe gegen einen
 * Muster-Pool, der jede Abfrage annimmt und vorgefertigte Zeilen liefert. Vier
 * Proben auf diese Funktion waren gruen. Ein Muster-Pool kann SQL nicht
 * AUSFUEHREN — er beweist den Vertrag, nicht die Ausfuehrbarkeit. Genau diese
 * Luecke schliesst diese Datei, und nur sie.
 *
 * Gemessen wird in einer zurueckgerollten Transaktion:
 *   - die Abfrage laeuft ueberhaupt (vorher: Wurf)
 *   - `worker_confirmed_count` zaehlt `source='worker_submission'`
 *   - und NUR das: ein Zettel mit `source='manual'` erhoeht sie nicht
 *
 * Der Uebersprung ohne Datenbank ist SICHTBAR (Lehre aus M4c.15).
 *
 * Lauf: DATABASE_URL=postgres://… node --test test/integration/stundenzettelKennzahlLaeuft.flow.test.js
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import * as timesheetService from "../../services/timesheetService.js";

const hasDb = !!(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.POSTGRES_PASSWORD));
const createPool = () => new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.POSTGRES_USER || process.env.DB_USER,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DB || process.env.DB_NAME
      }
);

describe("Z2 — die Kennzahl des Stundenzettels, am realen Schema", () => {
  let pool;
  let client;
  let paar = null; // { org_id, supplier_org_id } eines bestehenden Zettels

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    client = await pool.connect();
    await client.query("BEGIN");
    /* Ein bestehendes Paar nehmen, statt Organisationen zu erfinden: so sind
       alle Fremdschluessel gueltig, ohne dass die Probe das Datenmodell
       nachbauen muss. */
    const { rows } = await client.query(
      "SELECT org_id, supplier_org_id FROM timesheets LIMIT 1");
    paar = rows[0] || null;
  });

  after(async () => {
    try { await client?.query("ROLLBACK"); } finally {
      client?.release();
      await pool?.end();
    }
  });

  beforeEach(async () => { if (hasDb && paar) await client.query("SAVEPOINT probe"); });
  afterEach(async () => { if (hasDb && paar) await client.query("ROLLBACK TO SAVEPOINT probe"); });

  const zettelAnlegen = (quelle) => client.query(
    `INSERT INTO timesheets
       (org_id, supplier_org_id, worker_name, week_start, week_end,
        total_hours, overtime_hours, status, source)
     VALUES ($1, $2, 'Z2 Probe', DATE '2026-01-05', DATE '2026-01-11',
             8, 0, 'draft', $3)
     RETURNING id`,
    [paar.org_id, paar.supplier_org_id, quelle]
  );

  it("es gibt einen Stundenzettel, an dem sich das zeigen laesst", (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!paar) return t.skip("kein Stundenzettel im Bestand");
    assert.ok(paar.org_id);
  });

  it("die Abfrage LAEUFT — vorher warf genau sie, und zwar vollstaendig", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!paar) return t.skip("kein Gegenstand");
    const ergebnis = await timesheetService.getWorkerTimesheetSummary(client, { orgId: paar.org_id });
    assert.ok(!ergebnis.error, "die Zusammenfassung meldet einen Fehler: " + JSON.stringify(ergebnis));
    assert.equal(typeof ergebnis.total_timesheets, "number");
    assert.equal(typeof ergebnis.worker_confirmed_count, "number",
      "worker_confirmed_count fehlt in der Antwort");
  });

  it("die alte Kennzahl ist fort — nicht nur umbenannt", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!paar) return t.skip("kein Gegenstand");
    const ergebnis = await timesheetService.getWorkerTimesheetSummary(client, { orgId: paar.org_id });
    assert.equal(Object.prototype.hasOwnProperty.call(ergebnis, "signed_count"), false,
      "signed_count steht noch in der Antwort — dann hat der Umbau nur die Abfrage erwischt");
  });

  it("ein Zettel AUS EINER MELDUNG DER KRAFT erhoeht die Zahl um genau eins", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!paar) return t.skip("kein Gegenstand");
    const vorher = await timesheetService.getWorkerTimesheetSummary(client, { orgId: paar.org_id });
    await zettelAnlegen("worker_submission");
    const nachher = await timesheetService.getWorkerTimesheetSummary(client, { orgId: paar.org_id });
    assert.equal(nachher.worker_confirmed_count, vorher.worker_confirmed_count + 1,
      "die Kennzahl folgt der Quelle nicht");
    assert.equal(nachher.total_timesheets, vorher.total_timesheets + 1,
      "der Zettel ist gar nicht angekommen — dann sagt die Zeile darueber nichts");
  });

  it("ein DIREKT ERFASSTER Zettel erhoeht sie NICHT", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!paar) return t.skip("kein Gegenstand");
    /* Die Gegenprobe. Ohne sie waere die Zeile darueber auch dann gruen, wenn
       die Kennzahl einfach alle Zettel zaehlt — und die Unterscheidung
       "steht die Kraft dahinter" ist laut workerSubmissionService genau die,
       die "in Abrechnung und Streitfall entscheidend" ist. */
    const vorher = await timesheetService.getWorkerTimesheetSummary(client, { orgId: paar.org_id });
    await zettelAnlegen("manual");
    const nachher = await timesheetService.getWorkerTimesheetSummary(client, { orgId: paar.org_id });
    assert.equal(nachher.worker_confirmed_count, vorher.worker_confirmed_count,
      "ein direkt erfasster Zettel zaehlt als von der Kraft bestaetigt — das ist eine falsche Auskunft auf einem Geldpfad");
    assert.equal(nachher.total_timesheets, vorher.total_timesheets + 1,
      "der Zettel ist gar nicht angekommen — dann prueft die Zeile darueber nichts");
  });

  it("die Unterschriftsspalten existieren nach wie vor nicht — der Befund bleibt behoben", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'timesheets' AND column_name LIKE 'worker_signed%'`);
    assert.deepEqual(rows, [],
      "die Spalten sind aufgetaucht — dann ist die Entscheidung gegen sie stillschweigend zurueckgenommen worden");
  });
});
