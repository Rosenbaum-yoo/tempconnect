/**
 * Vendor Management VMS unit tests.
 * Covers: CRUD, history-logging, notes, enriched list, dashboard, consolidated profile,
 * VALID_TIERS/VALID_STATUSES exports.
 *
 * Run: node --test --test-force-exit test/vendorManagement.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  VALID_TIERS,
  VALID_STATUSES,
  addToPool,
  changeTier,
  changeStatus,
  blockVendor,
  removeFromPool,
  listForClient,
  listForSupplier,
  getEntry,
  isInPool,
  poolStats,
  getHistory,
  addNote,
  listNotes,
  listForClientEnriched,
  getVendorDashboard
} from "../services/vendorPoolService.js";

// ── Mock helpers ──────────────────────────────────────

function mockPool(queryFn) {
  return { query: queryFn };
}

function returnPool(rows = [], rowCount = rows.length) {
  return mockPool(async () => ({ rows, rowCount }));
}

function sequencePool(...responses) {
  let idx = 0;
  return mockPool(async () => {
    if (idx >= responses.length) return { rows: [], rowCount: 0 };
    const resp = responses[idx++];
    if (resp instanceof Error) throw resp;
    return resp;
  });
}

function capturingPool(capturedQueries = []) {
  return mockPool(async (sql, params) => {
    capturedQueries.push({ sql, params });
    return { rows: [{ id: 'mock-id', tier: 'SECONDARY', status: 'active' }], rowCount: 1 };
  });
}

// ═══════════════════════════════════════════════════════
// VALID_TIERS / VALID_STATUSES
// ═══════════════════════════════════════════════════════

describe("vendorPoolService — VALID_TIERS", () => {
  it("exports all 5 valid tiers", () => {
    assert.deepStrictEqual(VALID_TIERS, ['PREFERRED', 'SECONDARY', 'TRIAL', 'RESTRICTED', 'BLOCKED']);
  });

  it("exports all 3 valid statuses", () => {
    assert.deepStrictEqual(VALID_STATUSES, ['active', 'suspended', 'removed']);
  });
});

// ═══════════════════════════════════════════════════════
// addToPool
// ═══════════════════════════════════════════════════════

describe("vendorPoolService — addToPool", () => {
  it("inserts a new vendor pool entry with defaults", async () => {
    const captured = [];
    const pool = capturingPool(captured);
    const result = await addToPool(pool, {
      client_org_id: 'org-1',
      supplier_org_id: 'org-2'
    });
    assert.ok(result);
    assert.ok(captured[0].sql.includes('INSERT INTO vendor_pool'));
    assert.strictEqual(captured[0].params[0], 'org-1');
    assert.strictEqual(captured[0].params[1], 'org-2');
    assert.strictEqual(captured[0].params[2], 'SECONDARY'); // default tier
  });

  it("uses specified tier when provided", async () => {
    const captured = [];
    const pool = capturingPool(captured);
    await addToPool(pool, {
      client_org_id: 'org-1',
      supplier_org_id: 'org-2',
      tier: 'PREFERRED'
    });
    assert.strictEqual(captured[0].params[2], 'PREFERRED');
  });

  it("passes category, location_id, department_id", async () => {
    const captured = [];
    const pool = capturingPool(captured);
    await addToPool(pool, {
      client_org_id: 'org-1',
      supplier_org_id: 'org-2',
      category: 'IT',
      location_id: 'loc-1',
      department_id: 'dep-1'
    });
    // addToPool calls assertLocationBelongsToOrg (captured[0]) and
    // assertDepartmentBelongsToOrg (captured[1]) before the INSERT (captured[2]).
    const insertQuery = captured.find(q => q.sql.includes('INSERT INTO vendor_pool'));
    assert.ok(insertQuery, 'INSERT query should have been captured');
    assert.strictEqual(insertQuery.params[3], 'IT');
    assert.strictEqual(insertQuery.params[4], 'loc-1');
    assert.strictEqual(insertQuery.params[5], 'dep-1');
  });
});

// ═══════════════════════════════════════════════════════
// changeTier (with history)
// ═══════════════════════════════════════════════════════

describe("vendorPoolService — changeTier", () => {
  it("rejects invalid tier", async () => {
    const pool = returnPool([]);
    await assert.rejects(
      () => changeTier(pool, 'id-1', 'INVALID', 'actor-1', 'test'),
      { message: 'Ungueltiger Tier: INVALID' }
    );
  });

  /*
   * Z6 (2026-09-27): DIESE PROBEN WAREN GRUEN, WAEHREND NICHTS GESCHRIEBEN WURDE.
   *
   * Sie haben den Schreibvorgang nach `vendor_pool_history` festgenagelt - gegen
   * einen Muster-Pool, der die Abfrage annimmt. Die Tabelle existiert nicht; im
   * Betrieb hat `swallow` den Wurf gefangen, jede Tier-Aenderung eine Warnung
   * erzeugt und keinen Verlauf hinterlassen. Nach Paragraph 0.9 ist das der
   * dokumentierte Ausnahmefall (die Probe kodiert einen Bruch als Soll), also
   * werden sie ERSETZT: gemessen wird jetzt, dass der Dienst KEINE eigene
   * Verlaufstabelle mehr anfasst - der Verlauf steht im Audit-Log, geschrieben
   * von der Route und gelesen von `getHistory` (belegt in
   * test/integration/lieferantAkteUndVerlauf.flow.test.js an der echten
   * Datenbank).
   */
  it("updates tier — und schreibt KEINE eigene Verlaufszeile mehr", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      // 1st call: SELECT old tier
      if (sql.includes('SELECT tier FROM vendor_pool')) {
        return { rows: [{ tier: 'TRIAL' }] };
      }
      // 2nd call: UPDATE
      if (sql.includes('UPDATE vendor_pool SET tier')) {
        return { rows: [{ id: 'vp-1', tier: 'PREFERRED' }] };
      }
      // 3rd call: INSERT history
      return { rows: [] };
    });
    const result = await changeTier(pool, 'vp-1', 'PREFERRED', 'actor-1', 'Promoted');
    assert.ok(result);
    assert.strictEqual(result.tier, 'PREFERRED');
    /* Z6: KEINE eigene Verlaufstabelle mehr - siehe Vorwort oben. */
    const historyInsert = captured.find(c => c.sql.includes('vendor_pool_history'));
    assert.strictEqual(historyInsert, undefined,
      'der Dienst schreibt wieder in vendor_pool_history - die Tabelle existiert nicht, '
      + 'der Verlauf gehoert ins Audit-Log');
  });

  it("does NOT write history when tier unchanged", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      if (sql.includes('SELECT tier FROM vendor_pool')) {
        return { rows: [{ tier: 'PREFERRED' }] };
      }
      if (sql.includes('UPDATE vendor_pool SET tier')) {
        return { rows: [{ id: 'vp-1', tier: 'PREFERRED' }] };
      }
      return { rows: [] };
    });
    await changeTier(pool, 'vp-1', 'PREFERRED', 'actor-1');
    const historyInsert = captured.find(c => c.sql.includes('vendor_pool_history'));
    assert.strictEqual(historyInsert, undefined, 'No history insert for same tier');
  });

  it("returns null when entry not found", async () => {
    const pool = sequencePool(
      { rows: [] },  // SELECT old tier: nothing
      { rows: [] }   // UPDATE: nothing
    );
    const result = await changeTier(pool, 'nonexistent', 'PREFERRED', 'actor-1');
    assert.strictEqual(result, null);
  });
});

// ═══════════════════════════════════════════════════════
// changeStatus (with history)
// ═══════════════════════════════════════════════════════

describe("vendorPoolService — changeStatus", () => {
  it("rejects invalid status", async () => {
    const pool = returnPool([]);
    await assert.rejects(
      () => changeStatus(pool, 'id-1', 'INVALID', 'actor-1'),
      { message: 'Ungueltiger Status: INVALID' }
    );
  });

  it("updates status — und schreibt KEINE eigene Verlaufszeile mehr", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      if (sql.includes('SELECT status FROM vendor_pool')) {
        return { rows: [{ status: 'active' }] };
      }
      if (sql.includes('UPDATE vendor_pool SET status')) {
        return { rows: [{ id: 'vp-1', status: 'suspended' }] };
      }
      return { rows: [] };
    });
    const result = await changeStatus(pool, 'vp-1', 'suspended', 'actor-1', 'Compliance issue');
    assert.ok(result);
    const historyInsert = captured.find(c => c.sql.includes('vendor_pool_history'));
    assert.strictEqual(historyInsert, undefined,
      'der Dienst schreibt wieder in vendor_pool_history');
    /* Dass der Wechsel WIRKT, steht in der Zusicherung auf `result` darueber;
       von-nach und Grund stehen im Audit-Log und werden in
       test/integration/lieferantAkteUndVerlauf.flow.test.js an der echten
       Datenbank gelesen. */
    assert.strictEqual(result.status, 'suspended');
  });

  it("does NOT write history when status unchanged", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      if (sql.includes('SELECT status FROM vendor_pool')) {
        return { rows: [{ status: 'active' }] };
      }
      if (sql.includes('UPDATE vendor_pool SET status')) {
        return { rows: [{ id: 'vp-1', status: 'active' }] };
      }
      return { rows: [] };
    });
    await changeStatus(pool, 'vp-1', 'active', 'actor-1');
    const historyInsert = captured.find(c => c.sql.includes('vendor_pool_history'));
    assert.strictEqual(historyInsert, undefined);
  });
});

// ═══════════════════════════════════════════════════════
// blockVendor
// ═══════════════════════════════════════════════════════

describe("vendorPoolService — blockVendor", () => {
  it("sets tier BLOCKED and status suspended", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [{ id: 'vp-1', tier: 'BLOCKED', status: 'suspended' }] };
    });
    const result = await blockVendor(pool, 'org-1', 'org-2', 'actor-1', 'Breach');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].tier, 'BLOCKED');
    assert.ok(captured[0].sql.includes("tier = 'BLOCKED'"));
    assert.ok(captured[0].sql.includes("status = 'suspended'"));
  });
});

// ═══════════════════════════════════════════════════════
// removeFromPool
// ═══════════════════════════════════════════════════════

describe("vendorPoolService — removeFromPool", () => {
  it("sets status to removed", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [{ id: 'vp-1', status: 'removed' }] };
    });
    const result = await removeFromPool(pool, 'vp-1');
    assert.strictEqual(result.status, 'removed');
    assert.ok(captured[0].sql.includes("status = 'removed'"));
  });

  it("returns null when entry not found", async () => {
    const pool = returnPool([]);
    const result = await removeFromPool(pool, 'nonexistent');
    assert.strictEqual(result, null);
  });
});

// ═══════════════════════════════════════════════════════
// listForClient
// ═══════════════════════════════════════════════════════

describe("vendorPoolService — listForClient", () => {
  it("returns rows for given clientOrgId", async () => {
    const pool = returnPool([
      { id: 'vp-1', tier: 'PREFERRED', supplier_org_name: 'Acme' },
      { id: 'vp-2', tier: 'SECONDARY', supplier_org_name: 'Beta' }
    ]);
    const result = await listForClient(pool, 'org-1');
    assert.strictEqual(result.length, 2);
  });

  it("applies tier filter", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await listForClient(pool, 'org-1', { tier: 'PREFERRED' });
    assert.ok(captured[0].sql.includes('vp.tier = $'));
    assert.ok(captured[0].params.includes('PREFERRED'));
  });

  it("applies status filter", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await listForClient(pool, 'org-1', { status: 'suspended' });
    assert.ok(captured[0].sql.includes('vp.status = $'));
    assert.ok(captured[0].params.includes('suspended'));
  });

  it("excludes removed by default", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await listForClient(pool, 'org-1');
    assert.ok(captured[0].sql.includes("vp.status != 'removed'"));
  });
});

// ═══════════════════════════════════════════════════════
// listForSupplier
// ═══════════════════════════════════════════════════════

describe("vendorPoolService — listForSupplier", () => {
  it("returns rows for given supplierOrgId", async () => {
    const pool = returnPool([
      { id: 'vp-1', client_org_name: 'Corp A' }
    ]);
    const result = await listForSupplier(pool, 'org-2');
    assert.strictEqual(result.length, 1);
  });
});

// ═══════════════════════════════════════════════════════
// getEntry / isInPool
// ═══════════════════════════════════════════════════════

describe("vendorPoolService — getEntry", () => {
  it("returns entry when found", async () => {
    const pool = returnPool([{ id: 'vp-1', tier: 'PREFERRED' }]);
    const result = await getEntry(pool, 'vp-1');
    assert.ok(result);
    assert.strictEqual(result.tier, 'PREFERRED');
  });

  it("returns null when not found", async () => {
    const pool = returnPool([]);
    const result = await getEntry(pool, 'nonexistent');
    assert.strictEqual(result, null);
  });
});

describe("vendorPoolService — isInPool", () => {
  it("returns entry when supplier is in pool", async () => {
    const pool = returnPool([{ id: 'vp-1', tier: 'PREFERRED', status: 'active' }]);
    const result = await isInPool(pool, 'org-1', 'org-2');
    assert.ok(result);
    assert.strictEqual(result.tier, 'PREFERRED');
  });

  it("returns null when not in pool", async () => {
    const pool = returnPool([]);
    const result = await isInPool(pool, 'org-1', 'org-2');
    assert.strictEqual(result, null);
  });
});

// ═══════════════════════════════════════════════════════
// poolStats
// ═══════════════════════════════════════════════════════

describe("vendorPoolService — poolStats", () => {
  it("aggregates tier counts", async () => {
    const pool = returnPool([
      { tier: 'PREFERRED', count: 5 },
      { tier: 'SECONDARY', count: 10 },
      { tier: 'TRIAL', count: 3 }
    ]);
    const stats = await poolStats(pool, 'org-1');
    assert.strictEqual(stats.PREFERRED, 5);
    assert.strictEqual(stats.SECONDARY, 10);
    assert.strictEqual(stats.TRIAL, 3);
    assert.strictEqual(stats.RESTRICTED, 0);
    assert.strictEqual(stats.BLOCKED, 0);
    assert.strictEqual(stats.total, 18);
  });

  it("returns all-zero stats when pool is empty", async () => {
    const pool = returnPool([]);
    const stats = await poolStats(pool, 'org-1');
    assert.strictEqual(stats.total, 0);
    assert.strictEqual(stats.PREFERRED, 0);
  });
});

// ═══════════════════════════════════════════════════════
// getHistory
// ═══════════════════════════════════════════════════════

describe("vendorPoolService — getHistory", () => {
  it("returns history entries ordered by created_at DESC", async () => {
    const pool = returnPool([
      { id: 'h-1', field_changed: 'tier', old_value: 'TRIAL', new_value: 'PREFERRED', created_at: '2026-03-15' },
      { id: 'h-2', field_changed: 'status', old_value: 'active', new_value: 'suspended', created_at: '2026-03-14' }
    ]);
    const result = await getHistory(pool, 'vp-1');
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].field_changed, 'tier');
  });

  it("returns empty array when no history", async () => {
    const pool = returnPool([]);
    const result = await getHistory(pool, 'vp-1');
    assert.strictEqual(result.length, 0);
  });

  it("caps limit at 200", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await getHistory(pool, 'vp-1', 999);
    assert.strictEqual(captured[0].params[1], 200);
  });
});

// ═══════════════════════════════════════════════════════
// Notes: addNote / listNotes
// ═══════════════════════════════════════════════════════

describe("vendorPoolService — addNote", () => {
  it("creates a note with trimmed text", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [{ id: 'note-1', vendor_pool_id: 'vp-1', note_text: 'Good supplier' }] };
    });
    const result = await addNote(pool, 'vp-1', 'user-1', '  Good supplier  ');
    assert.ok(result);
    assert.strictEqual(result.note_text, 'Good supplier');
    assert.strictEqual(captured[0].params[2], 'Good supplier');
  });

  it("rejects empty text", async () => {
    const pool = returnPool([]);
    await assert.rejects(
      () => addNote(pool, 'vp-1', 'user-1', ''),
      { message: 'Note text required' }
    );
  });

  it("rejects null text", async () => {
    const pool = returnPool([]);
    await assert.rejects(
      () => addNote(pool, 'vp-1', 'user-1', null),
      { message: 'Note text required' }
    );
  });

  it("rejects whitespace-only text", async () => {
    const pool = returnPool([]);
    await assert.rejects(
      () => addNote(pool, 'vp-1', 'user-1', '   '),
      { message: 'Note text required' }
    );
  });
});

describe("vendorPoolService — listNotes", () => {
  it("returns notes for given vendorPoolId", async () => {
    const pool = returnPool([
      { id: 'n-1', note_text: 'First note', author_email: 'a@b.com' },
      { id: 'n-2', note_text: 'Second note', author_email: 'c@d.com' }
    ]);
    const result = await listNotes(pool, 'vp-1');
    assert.strictEqual(result.length, 2);
  });

  it("caps limit at 200", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await listNotes(pool, 'vp-1', 500);
    assert.strictEqual(captured[0].params[1], 200);
  });
});

// ═══════════════════════════════════════════════════════
// listForClientEnriched
// ═══════════════════════════════════════════════════════

describe("vendorPoolService — listForClientEnriched", () => {
  it("returns rows with reputation and metrics fields", async () => {
    const pool = returnPool([{
      id: 'vp-1', tier: 'PREFERRED', supplier_org_name: 'Acme',
      reputation_score: 85.5, reputation_grade: 'GOLD', avg_stars: 4.3,
      fill_rate_pct: 75.0, sla_breach_rate_pct: 5.0
    }]);
    const result = await listForClientEnriched(pool, 'org-1');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].reputation_score, 85.5);
    assert.strictEqual(result[0].reputation_grade, 'GOLD');
    assert.strictEqual(result[0].fill_rate_pct, 75.0);
  });

  it("joins supplier_reputation and supplier_metrics", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await listForClientEnriched(pool, 'org-1');
    assert.ok(captured[0].sql.includes('supplier_reputation'));
    assert.ok(captured[0].sql.includes('supplier_metrics'));
  });

  it("applies tier/status/category filters", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await listForClientEnriched(pool, 'org-1', { tier: 'PREFERRED', category: 'IT' });
    assert.ok(captured[0].params.includes('PREFERRED'));
    assert.ok(captured[0].params.includes('IT'));
  });

  it("supports buyer_activity_30d scope as a distinct supplier drilldown", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await listForClientEnriched(pool, 'org-1', { activity_scope: 'buyer_activity_30d' });
    assert.ok(captured[0].sql.includes('DISTINCT ON (vp.supplier_org_id)'));
    assert.ok(captured[0].sql.includes("vp.status = 'active'"));
    assert.ok(captured[0].sql.includes('FROM requisition_candidates rc'));
    assert.ok(captured[0].sql.includes('FROM assignments a'));
    assert.ok(captured[0].sql.includes('LEFT JOIN timesheets t'));
  });
});

// ═══════════════════════════════════════════════════════
// getVendorDashboard
// ═══════════════════════════════════════════════════════

describe("vendorPoolService — getVendorDashboard", () => {
  it("returns structured dashboard object", async () => {
    let callIdx = 0;
    const pool = mockPool(async (sql) => {
      callIdx++;
      // poolStats (called internally)
      if (sql.includes('GROUP BY tier')) {
        return { rows: [{ tier: 'PREFERRED', count: 3 }, { tier: 'SECONDARY', count: 7 }] };
      }
      // Status composition
      if (sql.includes('GROUP BY status')) {
        return { rows: [{ status: 'active', count: 8 }, { status: 'suspended', count: 2 }] };
      }
      // Aggregate KPIs
      if (sql.includes('AVG(sr.reputation_score)')) {
        return { rows: [{ avg_reputation: 72.5, avg_stars: 4.1, avg_deal_success: 80.0, top_grade_count: 3 }] };
      }
      // Top 5
      if (sql.includes('ORDER BY sr.reputation_score DESC')) {
        return { rows: [{ id: 'vp-1', supplier_name: 'Best Co', reputation_score: 95 }] };
      }
      // Bottom 5
      if (sql.includes('ORDER BY sr.reputation_score ASC')) {
        return { rows: [{ id: 'vp-5', supplier_name: 'Worst Co', reputation_score: 30 }] };
      }
      /* Recent changes — Z6: aus dem Audit-Log, nicht aus `vendor_pool_history`
         (die Tabelle gab es nie, die Abfrage warf und riss die ganze Uebersicht
         mit). Reine Fixture-Pflege: die Zusicherungen darunter sind unberuehrt. */
      if (sql.includes('FROM audit_log a') && sql.includes('vendor_pool.tier_change')) {
        return { rows: [{ field_changed: 'tier', old_value: 'TRIAL', new_value: 'PREFERRED' }] };
      }
      return { rows: [] };
    });

    const dashboard = await getVendorDashboard(pool, 'org-1');

    // Pool composition
    assert.strictEqual(dashboard.pool_composition.PREFERRED, 3);
    assert.strictEqual(dashboard.pool_composition.SECONDARY, 7);
    assert.strictEqual(dashboard.pool_composition.total, 10);

    // Status composition
    assert.strictEqual(dashboard.status_composition.active, 8);
    assert.strictEqual(dashboard.status_composition.suspended, 2);

    // KPIs
    assert.strictEqual(dashboard.kpis.avg_reputation, 72.5);
    assert.strictEqual(dashboard.kpis.avg_stars, 4.1);
    assert.strictEqual(dashboard.kpis.top_grade_count, 3);

    // Top/Bottom performers
    assert.strictEqual(dashboard.top_performers.length, 1);
    assert.strictEqual(dashboard.top_performers[0].supplier_name, 'Best Co');
    assert.strictEqual(dashboard.underperformers.length, 1);
    assert.strictEqual(dashboard.underperformers[0].supplier_name, 'Worst Co');

    // Recent changes
    assert.strictEqual(dashboard.recent_changes.length, 1);
  });

  it("handles empty pool gracefully", async () => {
    const pool = returnPool([]);
    const dashboard = await getVendorDashboard(pool, 'org-empty');
    assert.strictEqual(dashboard.pool_composition.total, 0);
    assert.ok(dashboard.kpis);
    assert.deepStrictEqual(dashboard.top_performers, []);
    assert.deepStrictEqual(dashboard.underperformers, []);
  });
});

// ═══════════════════════════════════════════════════════
// Consolidated Profile (supplierManagementService)
// ═══════════════════════════════════════════════════════

describe("supplierManagementService — getSupplierProfile", () => {
  // Dynamic import to avoid circular dependency issues
  it("returns consolidated profile with all sections", async () => {
    let callIdx = 0;
    const pool = mockPool(async (sql) => {
      callIdx++;
      // vendor_pool entry
      if (sql.includes('FROM vendor_pool vp') && sql.includes('JOIN organizations so')) {
        return { rows: [{ id: 'vp-1', tier: 'PREFERRED', status: 'active', supplier_name: 'Test Corp' }] };
      }
      // compliance_stats
      if (sql.includes('compliance') || sql.includes('org_documents')) {
        return { rows: [{ total: 5, approved: 4, pending: 1 }] };
      }
      // contracts
      if (sql.includes('FROM contracts')) {
        return { rows: [{ id: 'c-1', title: 'MSA', status: 'active' }] };
      }
      // supplier_metrics (getScorecard)
      if (sql.includes('supplier_metrics')) {
        return { rows: [{ agency_id: 'org-2', requests_received: 10, requests_accepted: 8, sla_breaches: 1, avg_rating: 4.2, requests_finalized: 7 }] };
      }
      // supplier_reputation (getReputation)
      if (sql.includes('supplier_reputation')) {
        return { rows: [{ supplier_id: 'org-2', reputation_score: 82, grade: 'GOLD', avg_stars: 4.3 }] };
      }
      // vendor_pool_history
      if (sql.includes('vendor_pool_history')) {
        return { rows: [{ id: 'h-1', field_changed: 'tier' }] };
      }
      // vendor_pool_notes
      if (sql.includes('vendor_pool_notes')) {
        return { rows: [{ id: 'n-1', note_text: 'Great' }] };
      }
      // active workers
      if (sql.includes('FROM requests') && sql.includes('ACCEPTED')) {
        return { rows: [{ count: 3 }] };
      }
      return { rows: [] };
    });

    const { getSupplierProfile } = await import("../services/supplierManagementService.js");
    const profile = await getSupplierProfile(pool, 'org-1', 'org-2');

    assert.ok(profile.vendor_pool, 'should have vendor_pool');
    assert.strictEqual(profile.vendor_pool.tier, 'PREFERRED');
    assert.ok(profile.contracts, 'should have contracts');
    assert.ok(profile.scorecard !== undefined, 'should have scorecard field');
    assert.ok(profile.reputation !== undefined, 'should have reputation field');
    assert.ok(Array.isArray(profile.history), 'should have history array');
    assert.ok(Array.isArray(profile.notes), 'should have notes array');
    assert.strictEqual(typeof profile.active_workers, 'number');
  });

  it("returns null vendor_pool when supplier not in pool", async () => {
    const pool = returnPool([]);
    const { getSupplierProfile } = await import("../services/supplierManagementService.js");
    const profile = await getSupplierProfile(pool, 'org-1', 'org-none');
    assert.strictEqual(profile.vendor_pool, null);
  });
});

// ═══════════════════════════════════════════════════════
// Integration: changeTier triggers history write
// ═══════════════════════════════════════════════════════

describe("vendorPoolService — Integration: tier-Wechsel schreibt KEINEN eigenen Verlauf", () => {
  it("fasst vendor_pool_history nicht mehr an", async () => {
    /* Z6: hier stand eine Probe, die die sechs Parameter des Schreibvorgangs
       festgenagelt hat - gegen eine Tabelle, die es nicht gibt. Der Gegenstand
       ist umgedreht: gemessen wird, dass der Dienst sie NICHT mehr anfasst.
       Was stattdessen passiert (Audit-Eintrag der Route mit alt, neu und Grund),
       ist an der echten Datenbank belegt:
       test/integration/lieferantAkteUndVerlauf.flow.test.js. */
    const gesehen = [];
    const pool = mockPool(async (sql) => {
      gesehen.push(sql);
      if (sql.includes("SELECT tier FROM vendor_pool")) return { rows: [{ tier: "SECONDARY" }] };
      if (sql.includes("UPDATE vendor_pool SET tier")) return { rows: [{ id: "vp-1", tier: "PREFERRED" }] };
      return { rows: [] };
    });
    const ergebnis = await changeTier(pool, "vp-1", "PREFERRED", "actor-1", "Grund");
    assert.strictEqual(ergebnis.tier, "PREFERRED", "der Wechsel wirkt nicht");
    assert.strictEqual(gesehen.some((s) => s.includes("vendor_pool_history")), false,
      "der Dienst schreibt wieder in eine Tabelle, die es nicht gibt: "
      + JSON.stringify(gesehen.filter((s) => s.includes("vendor_pool_history"))));
  });
});

describe("vendorPoolService — Integration: status-Wechsel schreibt KEINEN eigenen Verlauf", () => {
  it("fasst vendor_pool_history nicht mehr an", async () => {
    /* Z6: hier stand eine Probe, die die sechs Parameter des Schreibvorgangs
       festgenagelt hat - gegen eine Tabelle, die es nicht gibt. Der Gegenstand
       ist umgedreht: gemessen wird, dass der Dienst sie NICHT mehr anfasst.
       Was stattdessen passiert (Audit-Eintrag der Route mit alt, neu und Grund),
       ist an der echten Datenbank belegt:
       test/integration/lieferantAkteUndVerlauf.flow.test.js. */
    const gesehen = [];
    const pool = mockPool(async (sql) => {
      gesehen.push(sql);
      if (sql.includes("SELECT status FROM vendor_pool")) return { rows: [{ status: "active" }] };
      if (sql.includes("UPDATE vendor_pool SET status")) return { rows: [{ id: "vp-1", status: "suspended" }] };
      return { rows: [] };
    });
    const ergebnis = await changeStatus(pool, "vp-1", "suspended", "actor-1", "Grund");
    assert.strictEqual(ergebnis.status, "suspended", "der Wechsel wirkt nicht");
    assert.strictEqual(gesehen.some((s) => s.includes("vendor_pool_history")), false,
      "der Dienst schreibt wieder in eine Tabelle, die es nicht gibt: "
      + JSON.stringify(gesehen.filter((s) => s.includes("vendor_pool_history"))));
  });
});

