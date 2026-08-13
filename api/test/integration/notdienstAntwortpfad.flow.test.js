/**
 * Nachtrag zu den Owner-Abschnitten 2-4 — Befund P1-15, am ECHTEN Schema geprueft.
 *
 * WARUM DIESER TEST EXISTIERT UND WARUM ER DB-GESTUETZT SEIN MUSS
 * Der Defekt war monatelang unsichtbar, OBWOHL es Tests gab: ihre Attrappen
 * erfanden die beiden Spalten, also lief jede Abfrage gruen durch, waehrend die
 * echte Datenbank `column does not exist` warf. Ein weiterer Mock haette den
 * Fehler erneut zugedeckt.
 *
 * Geprueft wird deshalb gegen das reale Schema — und zwar beides:
 *   1. der Schreibpfad (POST /api/emergency/:id/respond -> recordSupplierResponse)
 *   2. der Lesepfad (GET /api/emergency/dashboard)
 * Beide lieferten vorher 500.
 *
 * Requires: DATABASE_URL (oder DB_HOST + POSTGRES_PASSWORD)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { hasDb, createPool, createSupplierOrg } from "./helpers.js";
import * as notdienst from "../../services/emergencyStaffingService.js";

describe("Notdienst-Antwortpfad am realen Schema (P1-15)", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  let org;
  let nutzer;
  let bedarf;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    org = await createSupplierOrg(pool, "P1-15 Testbetrieb");

    const stempel = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const { rows: u } = await pool.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, 'x', 'company') RETURNING id`,
      [`p115-${stempel}@test.tempconnect.invalid`]
    );
    nutzer = u[0].id;

    /* Ein echter Notfall-Bedarf. Die Spaltenliste bewusst knapp: was hier fehlt,
     * hat einen Default — und ein Test, der 30 Felder fuellt, prueft vor allem
     * sich selbst. */
    const { rows: d } = await pool.query(
      `INSERT INTO demand_requests
         (requester_company_id, title, role, location_city, start_date, end_date, urgency, status)
       VALUES ($1, 'P1-15 Notfall', 'Helfer', 'Kiel', CURRENT_DATE, CURRENT_DATE + 3, 'notdienst', 'open')
       RETURNING id`,
      [nutzer]
    );
    bedarf = d[0].id;
  });

  after(async () => {
    if (!hasDb || !pool) return;
    await pool.query("DELETE FROM demand_requests WHERE requester_company_id = $1", [nutzer]).catch(() => {});
    await pool.query("DELETE FROM users WHERE id = $1", [nutzer]).catch(() => {});
    await pool.query("DELETE FROM organizations WHERE id = $1", [org]).catch(() => {});
    await pool.end();
  });

  it("die beiden Spalten gibt es wirklich — das war der ganze Defekt", async () => {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'demand_requests'
          AND column_name IN ('supplier_response_count', 'first_supplier_response_at')
        ORDER BY column_name`
    );
    assert.deepEqual(rows.map((r) => r.column_name),
      ["first_supplier_response_at", "supplier_response_count"]);
  });

  it("eine Lieferanten-Antwort wird gezaehlt statt in einen 500er zu laufen", async () => {
    const res = await notdienst.recordSupplierResponse(pool, bedarf, nutzer);
    assert.ok(!res.error, res.error || "");

    const { rows } = await pool.query(
      `SELECT supplier_response_count, first_supplier_response_at FROM demand_requests WHERE id = $1`,
      [bedarf]
    );
    assert.strictEqual(rows[0].supplier_response_count, 1);
    assert.ok(rows[0].first_supplier_response_at, "der Zeitpunkt der ersten Antwort steht");
  });

  it("die zweite Antwort zaehlt weiter, verschiebt aber den ERSTEN Zeitpunkt nicht", async () => {
    // Davon haengt die ausgewiesene Reaktionszeit ab: waere der Zeitstempel
    // beweglich, saehe der Notdienst umso besser aus, je oefter geantwortet wird.
    const { rows: vorher } = await pool.query(
      `SELECT first_supplier_response_at FROM demand_requests WHERE id = $1`, [bedarf]);

    await notdienst.recordSupplierResponse(pool, bedarf, nutzer);

    const { rows: nachher } = await pool.query(
      `SELECT supplier_response_count, first_supplier_response_at FROM demand_requests WHERE id = $1`, [bedarf]);
    assert.strictEqual(nachher[0].supplier_response_count, 2);
    assert.deepEqual(nachher[0].first_supplier_response_at, vorher[0].first_supplier_response_at);
  });

  it("das Notdienst-Dashboard laeuft durch — es las dieselben Spalten", async () => {
    const board = await notdienst.getEmergencyDashboard(pool, nutzer);
    assert.ok(board, "das Dashboard antwortet ueberhaupt");
    assert.ok(typeof board === "object");
  });

  it("Zaehler und Zeitstempel koennen nicht auseinanderlaufen", async () => {
    // Ein Zeitstempel ohne Antwort (oder umgekehrt) waere ein Widerspruch in der
    // Akte — die Datenbank weist ihn ab, nicht erst die Auswertung.
    await assert.rejects(
      () => pool.query(
        `UPDATE demand_requests SET supplier_response_count = 0 WHERE id = $1`, [bedarf]
      ),
      (err) => err.code === "23514"
    );
  });
});
