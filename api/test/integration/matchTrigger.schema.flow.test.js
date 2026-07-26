/**
 * Instant-Matching (P4.1) — Schema-Smoke gegen eine echte Datenbank.
 *
 * Warum zusaetzlich zu `test/matchTrigger.test.js`: der Mock-Pool prueft SQL-FORM,
 * aber kein Postgres parst sie. Ein Spalten-/Alias-Tippfehler kaeme dort durch.
 * Dieser Test fuehrt dieselben Abfragen gegen das echte Schema aus — mit UUIDs, die
 * es nicht gibt. Ergebnis: 0 Treffer, aber Postgres hat die VOLLE Abfrage geparst
 * und geplant. Dazu die eine Eigenschaft, die nur die DB garantieren kann: der
 * partielle UNIQUE-Index laesst dieselbe Paarung kein zweites Mal zu.
 *
 * Requires: DATABASE_URL (oder DB_HOST + POSTGRES_PASSWORD) — sonst skip.
 * Run: node --test --test-force-exit test/integration/matchTrigger.schema.flow.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hasDb, createPool } from "./helpers.js";
import { buildPairKey, runMatchTrigger } from "../../services/matchTriggerService.js";

describe("Instant-Matching — Schema-Smoke", { skip: !hasDb && "No database configured" }, () => {
  let pool;

  before(() => { pool = createPool(); });
  after(async () => { if (pool) await pool.end(); });

  it("die Quellabfragen laufen gegen das echte Schema (alle drei Quelltypen)", async () => {
    for (const sourceType of ["capacity_post", "demand_request", "requisition"]) {
      const out = await runMatchTrigger(pool, { sourceType, sourceId: randomUUID() });
      assert.equal(out.skipped, "not_matchable", `${sourceType}: unbekannte ID darf nichts ausloesen`);
      assert.equal(out.alerts, 0);
    }
  });

  it("die Auswertungsspur match_logs existiert und nimmt Eintraege an", async () => {
    // Regression: `logMatch` schrieb jahrelang in eine Tabelle, die es nicht gab —
    // der try/catch hat das still geschluckt. Ohne diese Spur hat 4.3 keine Baseline.
    const { logMatch } = await import("../../services/matchingEngine.js");
    const sourceId = randomUUID();
    try {
      await logMatch(pool, {
        match_type: "schema_smoke", source_id: sourceId, target_id: randomUUID(),
        score: 42, reasons: [], outcome: "alerted", org_id: null
      });
      const { rows } = await pool.query("SELECT outcome, score FROM match_logs WHERE source_id = $1", [sourceId]);
      assert.equal(rows.length, 1, "der Eintrag landet wirklich in der DB, nicht im Nichts");
      assert.equal(rows[0].outcome, "alerted");
      assert.equal(rows[0].score, 42);
    } finally {
      await pool.query("DELETE FROM match_logs WHERE source_id = $1", [sourceId]);
    }
  });

  it("der UNIQUE-Index verhindert den zweiten Alarm fuer dieselbe Paarung", async () => {
    const { rows: users } = await pool.query("SELECT id FROM users LIMIT 1");
    if (!users.length) return; // leere Dev-DB: nichts zu pruefen

    const userId = users[0].id;
    const pairKey = buildPairKey("capacity_post", randomUUID(), "demand_request", randomUUID());
    const insert = (sourceType, counterpartType) => pool.query(
      `INSERT INTO match_alerts
         (user_id, match_count, source_type, source_id, match_score, match_reasons, severity,
          counterpart_type, counterpart_id, pair_key)
       VALUES ($1, 1, $2, $3, 70, '[]'::jsonb, 'info', $4, $5, $6)
       ON CONFLICT (user_id, pair_key) WHERE pair_key IS NOT NULL DO NOTHING`,
      [userId, sourceType, randomUUID(), counterpartType, randomUUID(), pairKey]
    );

    try {
      const first = await insert("capacity_post", "demand_request");
      assert.equal(first.rowCount, 1, "erster Alarm wird geschrieben");

      // Gegenrichtung, dasselbe Paar: derselbe kanonische Schluessel -> kein zweiter Alarm.
      const second = await insert("demand_request", "capacity_post");
      assert.equal(second.rowCount, 0, "dieselbe Paarung alarmiert kein zweites Mal");
    } finally {
      await pool.query("DELETE FROM match_alerts WHERE user_id = $1 AND pair_key = $2", [userId, pairKey]);
    }
  });
});
