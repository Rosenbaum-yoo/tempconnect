/**
 * Skalierungs-Index-Sicherungstest (Phase Q / Phase O — Index-Review).
 *
 * Sichert die Cron-Sweep-Stuetzindizes aus den Migrationen 122 + 123 ab.
 * Diese Indizes sind reine Performance-Add-ons (kein Schema-/Verhaltenswechsel),
 * daher gibt es keinen Laufzeit-Effekt, den ein Mock-Pool-Test pruefen koennte.
 * Stattdessen verifizieren wir gegen das REALE Schema (nach Anwendung aller
 * Migrationen im CI-integration-Job), dass jeder Index existiert und die
 * korrekte Form hat:
 *   - richtige Zugriffsmethode (btree vs. BRIN — ein Tippfehler waere fatal,
 *     da BRIN bewusst gewaehlt wurde, um den heissen Insert-Pfad zu schonen),
 *   - richtige Tabelle + Spalte (faengt Spalten-/Tabellen-Tippfehler in der
 *     Migration ab, die sonst still einen funktionslosen Index erzeugen),
 *   - korrektes Partial-Praedikat (der Sweep wird nur gestuetzt, wenn die
 *     WHERE-Bedingung des Index zur Query passt).
 *
 * Laeuft NUR mit DB (CI-integration-Job, Postgres 16). Ohne DB skippt der
 * Block automatisch — der DB-freie unit-Job bleibt gruen.
 *
 * Requires: DATABASE_URL (oder DB_HOST + POSTGRES_PASSWORD)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { hasDb, createPool } from "./helpers.js";

/**
 * Erwartete Indizes aus Mig 122 (5 btree-Partials) + Mig 123 (1 BRIN).
 * `predicate`: Teilstrings, die in pg_indexes.indexdef vorkommen MUESSEN.
 * Hinweis zur Normalisierung von pg_indexes.indexdef:
 *   - Zugriffsmethode klein: "USING btree" / "USING brin".
 *   - Gleichheits-Literale erscheinen als "spalte = 'wert'::text" — der
 *     Teilstring "spalte = 'wert'" ist robust gegen den Cast-Suffix.
 *   - IN-Listen werden zu "= ANY (ARRAY[...])" normalisiert, daher pruefen wir
 *     die einzelnen Werte ('sent', 'viewed', ...) statt der IN-Syntax.
 */
const EXPECTED_INDEXES = [
  {
    name: "webhook_deliveries_retry_failed_idx",
    migration: "122",
    table: "webhook_deliveries",
    am: "btree",
    column: "next_retry_at",
    predicate: ["status = 'failed'"]
  },
  {
    name: "staffing_invites_expiry_idx",
    migration: "122",
    table: "assignment_staffing_invites",
    am: "btree",
    column: "expires_at",
    predicate: ["expires_at IS NOT NULL", "'sent'", "'viewed'", "'interested'", "'accepted'"]
  },
  {
    name: "staffing_reservations_expiry_idx",
    migration: "122",
    table: "assignment_staffing_reservations",
    am: "btree",
    column: "expires_at",
    predicate: ["expires_at IS NOT NULL", "status = 'reserved'"]
  },
  {
    name: "demand_requests_notdienst_escalate_idx",
    migration: "122",
    table: "demand_requests",
    am: "btree",
    column: "created_at",
    predicate: ["status = 'open'", "sla_status = 'RUNNING'", "urgency = 'notdienst'"]
  },
  {
    name: "sla_search_jobs_open_created_idx",
    migration: "122",
    table: "sla_search_jobs",
    am: "btree",
    column: "created_at",
    predicate: ["status = 'open'"]
  },
  {
    name: "product_analytics_events_occurred_brin_idx",
    migration: "123",
    table: "product_analytics_events",
    am: "brin",
    column: "occurred_at",
    predicate: [] // BRIN-Zeitindex, kein Partial
  }
];

describe("Scaling cron-sweep indexes (Mig 122 + 123)", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  /** @type {Map<string, string>} indexname -> indexdef */
  const indexDefs = new Map();

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    const names = EXPECTED_INDEXES.map((i) => i.name);
    const { rows } = await pool.query(
      "SELECT indexname, indexdef FROM pg_indexes WHERE indexname = ANY($1)",
      [names]
    );
    for (const row of rows) {
      indexDefs.set(row.indexname, row.indexdef);
    }
  });

  after(async () => {
    await pool?.end();
  });

  for (const spec of EXPECTED_INDEXES) {
    it(`Mig ${spec.migration}: ${spec.name} existiert mit korrekter Form`, () => {
      const def = indexDefs.get(spec.name);
      assert.ok(
        def,
        `Index ${spec.name} fehlt im Schema — Migration ${spec.migration} nicht angewendet oder Index-Name/Tabelle falsch.`
      );

      // Zugriffsmethode: btree vs. BRIN (case-insensitiv geprueft).
      const lower = def.toLowerCase();
      assert.ok(
        lower.includes(`using ${spec.am}`),
        `${spec.name}: erwartete Zugriffsmethode '${spec.am}' nicht in indexdef: ${def}`
      );

      // Tabelle + Spalte muessen vorkommen.
      assert.ok(
        def.includes(spec.table),
        `${spec.name}: Tabelle '${spec.table}' nicht in indexdef: ${def}`
      );
      assert.ok(
        def.includes(spec.column),
        `${spec.name}: Spalte '${spec.column}' nicht in indexdef: ${def}`
      );

      // Partial-Praedikat: jeder erwartete Teilstring muss vorkommen.
      for (const fragment of spec.predicate) {
        assert.ok(
          def.includes(fragment),
          `${spec.name}: Praedikat-Fragment '${fragment}' nicht in indexdef: ${def}`
        );
      }
    });
  }

  it("BRIN-Index nutzt wirklich BRIN (Insert-Pfad-Schonung), kein versehentliches btree", () => {
    const def = indexDefs.get("product_analytics_events_occurred_brin_idx");
    assert.ok(def, "BRIN-Index fehlt — Migration 123 nicht angewendet.");
    assert.ok(
      def.toLowerCase().includes("using brin"),
      `BRIN-Index ist nicht als BRIN angelegt (Write-Amplification-Risiko auf der volumenstaerksten Insert-Tabelle): ${def}`
    );
    assert.ok(
      !def.toLowerCase().includes("using btree"),
      `BRIN-Index darf nicht als btree existieren: ${def}`
    );
  });
});
