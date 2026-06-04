/**
 * DB-gestützter SQL-Validitäts-Smoke für loadRecentOpenCasesByOrg (Support-Org-Lookup).
 *
 * Der DB-freie Unit-Test (test/support.recentCasesByOrg.test.js) sichert Query-ZÄHLUNG
 * (genau 1, kein N+1) + SQL-FORM + Gruppierung über einen Mock-Pool ab — er kann aber
 * NICHT beweisen, dass die nicht-triviale verschachtelte Window-Query (createCaseBaseSelect
 * gewrappt in ROW_NUMBER() OVER PARTITION BY) gegen das REALE Schema gültiges Postgres ist
 * (ein vertippter Spaltenname / falscher Alias würde erst zur Laufzeit knallen).
 *
 * Dieser Test führt die Query mit einer NICHT existierenden Org-UUID aus: 0 Treffer, aber
 * Postgres parst + plant die VOLLE Query → fängt Spalten-/Alias-/Syntaxfehler ab, die der
 * Mock-Pool durchlässt. Sowohl der scope-freie als auch der scope-behaftete Pfad (buildScope
 * fügt zusätzliche WHERE-Fragmente + Params ein) werden geprüft.
 *
 * Läuft NUR mit DB (CI-integration-Job, Postgres 16, nach allen Migrationen). Ohne DB skippt
 * der Block automatisch — der DB-freie unit-Job bleibt grün.
 *
 * Requires: DATABASE_URL (oder DB_HOST + POSTGRES_PASSWORD)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hasDb, createPool } from "./helpers.js";
import { loadRecentOpenCasesByOrg } from "../../routes/support.js";

describe("loadRecentOpenCasesByOrg — SQL-Validität gegen reales Schema", { skip: !hasDb && "No database configured" }, () => {
  let pool;

  before(() => {
    if (!hasDb) return;
    pool = createPool();
  });

  after(async () => {
    await pool?.end();
  });

  // Agent ohne Scope → buildScope ergänzt nichts: prüft die Basis-Query (createCaseBaseSelect
  // + Window + ANY($1::uuid[])) gegen die echten Spalten von support_cases & Join-Tabellen.
  it("scope-freie Window-Query ist gültiges Postgres (0 Treffer für unbekannte Org)", async () => {
    const agent = { id: randomUUID(), role: "internal_support_agent", allowed_queues: [], allowed_case_types: [], data_scope: "all" };
    const map = await loadRecentOpenCasesByOrg(pool, [randomUUID()], agent);
    assert.strictEqual(map.size, 0); // kein Treffer, aber: Query lief ohne Throw → Schema-konform
  });

  // Agent MIT Queue-Scope → buildScope pusht queue_id::text = ANY($2::text[]): prüft, dass die
  // scope-erweiterte Variante der Query ebenfalls gültiges Postgres ist (Param-Nummerierung + Cast).
  it("scope-behaftete Window-Query (allowed_queues) ist gültiges Postgres", async () => {
    const agent = { id: randomUUID(), role: "internal_support_agent", allowed_queues: [randomUUID()], allowed_case_types: ["billing"], data_scope: "all" };
    const map = await loadRecentOpenCasesByOrg(pool, [randomUUID()], agent);
    assert.strictEqual(map.size, 0);
  });
});
