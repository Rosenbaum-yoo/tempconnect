/**
 * infrastructureSnapshotService unit tests — Operator-Frühwarn-Severity-Matrix.
 * Uses a recording mock pool — no database required (läuft im DB-freien unit-Job).
 *
 * Nur `ingestInfrastructureSnapshots` ist exportiert; die wertvolle interne Logik
 * (computeRiskState mit den Backup-Staleness-Schwellen 12/24/48h, normalizeSnapshot-
 * Input-Härtung, mapHostStatus) wird über den öffentlichen Ingest getestet:
 *   - items[].risk_state / host_status  → computeRiskState + mapHostStatus
 *   - die erfassten INSERT-Parameter     → normalize* (Sanitisierung vor SQL)
 *
 * Schützt das R8-Disaster-Recovery-Frühwarnsignal: backup_age_h fließt via
 * scripts/collect-infrastructure-snapshot.sh (.last_success_epoch) ein und wird
 * hier zu critical/high/medium gestuft. Diese Schwellen dürfen nicht still
 * wegrefactored werden — die Boundary-Tests pinnen sie fest.
 *
 * Run: node --test --test-force-exit test/infrastructureSnapshotService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ingestInfrastructureSnapshots } from "../services/infrastructureSnapshotService.js";

// Branching recording pool: INSERT → liefert id, alles andere (UPDATE warp_hosts) → leer.
// Erfasst alle Calls (sql+params) für Parameter-Assertions. Kein DB nötig.
function recordingPool() {
  const calls = [];
  let nextId = 1;
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/INSERT INTO infrastructure_snapshots/i.test(sql)) {
        return { rows: [{ id: nextId++ }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 }; // UPDATE warp_hosts (+ Fallback)
    }
  };
}

// INSERT-Parameter-Reihenfolge (siehe writeSnapshot):
const P = {
  host_name: 0, env: 1, cpu: 2, ram: 3, disk: 4,
  docker_running: 5, docker_unhealthy: 6, tls_days: 7, backup_age_h: 8,
  deployment_version: 9, deployment_status: 10, metadata: 11, collected_at: 12
};

// Ingest EINES Snapshots; gibt item + erfasste INSERT-Parameter zurück.
async function ingestOne(raw, options) {
  const pool = recordingPool();
  const res = await ingestInfrastructureSnapshots(pool, [raw], options);
  const insertCall = pool.calls.find((c) => /INSERT INTO infrastructure_snapshots/i.test(c.sql));
  return { res, item: res.items[0], insertParams: insertCall?.params, pool };
}

// ════════════════════════════════════════════════════════════════════════════
// Backup-Staleness (R8) — backup_age_h als alleiniger Treiber (alle übrigen
// Metriken absent → null → tragen nicht bei). Boundaries pinnen 12/24/48h fest.
// ════════════════════════════════════════════════════════════════════════════
describe("computeRiskState — Backup-Staleness-Schwellen (R8 Frühwarnsignal)", () => {
  const cases = [
    [49, "critical", "degraded"], // > 48 → critical
    [48, "high", "degraded"],     // nicht > 48, aber > 24 → high (Boundary!)
    [25, "high", "degraded"],
    [24, "medium", "warning"],    // nicht > 24, aber > 12 → medium (Boundary!)
    [13, "medium", "warning"],
    [12, "ok", "healthy"],        // nicht > 12 → ok (Boundary!)
    [6, "ok", "healthy"],
    [0, "ok", "healthy"]          // frisches Backup (age 0) ist gesund, nicht "unknown"
  ];
  for (const [age, expectedRisk, expectedStatus] of cases) {
    it(`backup_age_h=${age}h → risk='${expectedRisk}', host_status='${expectedStatus}'`, async () => {
      const { item } = await ingestOne({ host_name: "h1", backup_age_h: age });
      assert.strictEqual(item.ok, true);
      assert.strictEqual(item.risk_state, expectedRisk);
      assert.strictEqual(item.host_status, expectedStatus);
    });
  }

  it("absenter backup_age_h triggert KEIN Backup-Risiko (null ist neutral)", async () => {
    const { item } = await ingestOne({ host_name: "h1", cpu_percent: 10 });
    assert.strictEqual(item.risk_state, "ok"); // cpu 10 healthy, backup null neutral
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Übrige Risiko-Signale — die ganze Matrix festpinnen, damit ein Refactor kein
// Signal still fallen lässt.
// ════════════════════════════════════════════════════════════════════════════
describe("computeRiskState — übrige Signale", () => {
  const critical = [
    ["cpu_percent", 95], ["ram_percent", 95], ["disk_percent", 96],
    ["docker_unhealthy_count", 1], ["tls_days_remaining", 6]
  ];
  for (const [field, value] of critical) {
    it(`${field}=${value} → critical/degraded`, async () => {
      const { item } = await ingestOne({ host_name: "h", [field]: value });
      assert.strictEqual(item.risk_state, "critical");
      assert.strictEqual(item.host_status, "degraded");
    });
  }

  const high = [["cpu_percent", 90], ["ram_percent", 90], ["disk_percent", 90], ["tls_days_remaining", 13]];
  for (const [field, value] of high) {
    it(`${field}=${value} → high/degraded`, async () => {
      const { item } = await ingestOne({ host_name: "h", [field]: value });
      assert.strictEqual(item.risk_state, "high");
      assert.strictEqual(item.host_status, "degraded");
    });
  }

  const medium = [["cpu_percent", 80], ["disk_percent", 85], ["tls_days_remaining", 29]];
  for (const [field, value] of medium) {
    it(`${field}=${value} → medium/warning`, async () => {
      const { item } = await ingestOne({ host_name: "h", [field]: value });
      assert.strictEqual(item.risk_state, "medium");
      assert.strictEqual(item.host_status, "warning");
    });
  }

  it("gesunde Metriken → ok/healthy", async () => {
    const { item } = await ingestOne({ host_name: "h", cpu_percent: 40, ram_percent: 50, disk_percent: 60, tls_days_remaining: 90 });
    assert.strictEqual(item.risk_state, "ok");
    assert.strictEqual(item.host_status, "healthy");
  });

  it("gar kein Signal (nur host_name) → unknown/unknown", async () => {
    const { item } = await ingestOne({ host_name: "h" });
    assert.strictEqual(item.risk_state, "unknown");
    assert.strictEqual(item.host_status, "unknown");
  });

  it("docker_running_count>0 allein zählt als Signal → ok (nicht unknown)", async () => {
    const { item } = await ingestOne({ host_name: "h", docker_running_count: 3 });
    assert.strictEqual(item.risk_state, "ok");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Input-Härtung — garbage Host-Input darf weder crashen noch ungesäubert in SQL.
// (Produktionspfeiler: Zero-State/Robustheit — der Collector läuft auf fremden Hosts.)
// ════════════════════════════════════════════════════════════════════════════
describe("normalizeSnapshot — Sanitisierung der INSERT-Parameter", () => {
  it("Prozent > 100 wird auf 100 geklemmt, < 0 auf 0", async () => {
    const { insertParams } = await ingestOne({ host_name: "h", cpu_percent: 150, ram_percent: -10 });
    assert.strictEqual(insertParams[P.cpu], 100);
    assert.strictEqual(insertParams[P.ram], 0);
  });

  it("nicht-numerisches backup_age_h → null", async () => {
    const { insertParams } = await ingestOne({ host_name: "h", backup_age_h: "abc" });
    assert.strictEqual(insertParams[P.backup_age_h], null);
  });

  it("negatives backup_age_h → null (positive number only)", async () => {
    const { insertParams } = await ingestOne({ host_name: "h", backup_age_h: -5 });
    assert.strictEqual(insertParams[P.backup_age_h], null);
  });

  it("numerische Strings für Counts → Integer; Garbage → Fallback 0", async () => {
    const { insertParams } = await ingestOne({ host_name: "h", docker_running_count: "7", docker_unhealthy_count: "x" });
    assert.strictEqual(insertParams[P.docker_running], 7);
    assert.strictEqual(insertParams[P.docker_unhealthy], 0);
  });

  it("unbekanntes env fällt auf 'production' zurück; gültiges wird kleingeschrieben", async () => {
    const a = await ingestOne({ host_name: "h", env: "wibble" });
    assert.strictEqual(a.insertParams[P.env], "production");
    const b = await ingestOne({ host_name: "h", env: "STAGING" });
    assert.strictEqual(b.insertParams[P.env], "staging");
  });

  it("ungültiges collected_at → gültiger ISO-Fallback (kein null in NOT-NULL-Spalte)", async () => {
    const { insertParams } = await ingestOne({ host_name: "h", collected_at: "not-a-date" });
    const ts = insertParams[P.collected_at];
    assert.ok(ts && !Number.isNaN(new Date(ts).getTime()), `collected_at sollte gültiger ISO sein, war: ${ts}`);
  });

  it("metadata.source spiegelt die Ingest-Quelle", async () => {
    const def = await ingestOne({ host_name: "h" });
    assert.strictEqual(JSON.parse(def.insertParams[P.metadata]).source, "internal_collector");
    const host = await ingestOne({ host_name: "h" }, { source: "host_collector" });
    assert.strictEqual(JSON.parse(host.insertParams[P.metadata]).source, "host_collector");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Validierung + Aggregat-Shape — defektes Input wird sauber abgewiesen, nicht geworfen.
// ════════════════════════════════════════════════════════════════════════════
describe("ingestInfrastructureSnapshots — Validierung & Aggregat", () => {
  it("Nicht-Objekt-Snapshot → ok:false, INVALID_SNAPSHOT_OBJECT (kein Throw)", async () => {
    const res = await ingestInfrastructureSnapshots(recordingPool(), [null]);
    assert.strictEqual(res.items[0].ok, false);
    assert.strictEqual(res.items[0].error, "INVALID_SNAPSHOT_OBJECT");
    assert.strictEqual(res.failed, 1);
    assert.strictEqual(res.inserted, 0);
  });

  it("fehlender host_name → ok:false, MISSING_HOST_NAME", async () => {
    const res = await ingestInfrastructureSnapshots(recordingPool(), [{ cpu_percent: 10 }]);
    assert.strictEqual(res.items[0].ok, false);
    assert.strictEqual(res.items[0].error, "MISSING_HOST_NAME");
  });

  it("Nicht-Array-Eingabe → leeres, sicheres Aggregat", async () => {
    const res = await ingestInfrastructureSnapshots(recordingPool(), undefined);
    assert.deepStrictEqual(res, { inserted: 0, failed: 0, critical_hosts: 0, items: [] });
  });

  it("gemischte Charge: zählt inserted/failed/critical_hosts korrekt", async () => {
    const pool = recordingPool();
    const res = await ingestInfrastructureSnapshots(pool, [
      { host_name: "crit", backup_age_h: 72 }, // critical
      null,                                     // invalid
      { host_name: "fine", cpu_percent: 20 }    // ok
    ]);
    assert.strictEqual(res.inserted, 2);
    assert.strictEqual(res.failed, 1);
    assert.strictEqual(res.critical_hosts, 1); // nur der stale-backup-Host
  });

  it("DB-Fehler beim Schreiben wird pro Host gefangen (ok:false), nicht geworfen", async () => {
    const throwingPool = {
      query: async (sql) => {
        if (/INSERT INTO infrastructure_snapshots/i.test(sql)) throw new Error("DB_DOWN");
        return { rows: [], rowCount: 0 };
      }
    };
    const res = await ingestInfrastructureSnapshots(throwingPool, [{ host_name: "h", cpu_percent: 10 }]);
    assert.strictEqual(res.items[0].ok, false);
    assert.match(res.items[0].error, /DB_DOWN/);
    assert.strictEqual(res.failed, 1);
  });
});
