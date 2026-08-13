/**
 * Workforce Management unit tests.
 * Covers: Overview, Detail, KPIs, PendingActions, filter handling, org-boundary.
 *
 * Run: node --test --test-force-exit test/workforceManagement.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getWorkforceOverview,
  getWorkforceDetail,
  getWorkforceKpis,
  getPendingActions,
  getWorkerLiveBoard
} from "../services/workforceService.js";

// ── Mock helpers ──────────────────────────────────────

function mockPool(queryFn) {
  const wrappedFn = async (sql, params) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
    return queryFn(sql, params);
  };
  return {
    query: wrappedFn,
    connect: async () => ({ query: wrappedFn, release: () => {} })
  };
}

function returnPool(rows = []) {
  return mockPool(async () => ({ rows }));
}

// ═══════════════════════════════════════════════════════
// getWorkforceOverview
// ═══════════════════════════════════════════════════════

describe("workforceService — getWorkforceOverview", () => {
  it("returns rows with worker/timesheet aggregates", async () => {
    const pool = returnPool([{
      id: 'asg-1', status: 'active', org_name: 'Corp A', supplier_org_name: 'Agency B',
      active_workers: 3, pending_confirmations: 1, total_workers: 4,
      open_timesheets: 2, submitted_timesheets: 1, rejected_timesheets: 0
    }]);
    const result = await getWorkforceOverview(pool, 'org-1');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].active_workers, 3);
    assert.strictEqual(result[0].pending_confirmations, 1);
    assert.strictEqual(result[0].open_timesheets, 2);
  });

  it("applies status filter", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await getWorkforceOverview(pool, 'org-1', { status: 'active' });
    assert.ok(captured[0].sql.includes('a.status = $'));
    assert.ok(captured[0].params.includes('active'));
  });

  it("excludes cancelled by default", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await getWorkforceOverview(pool, 'org-1');
    assert.ok(captured[0].sql.includes("a.status NOT IN ('cancelled')"));
  });

  it("applies search filter across multiple fields", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await getWorkforceOverview(pool, 'org-1', { search: 'Pfleger' });
    assert.ok(captured[0].sql.includes('ILIKE'));
    assert.ok(captured[0].params.includes('%Pfleger%'));
  });

  it("applies lifecycle bucket filters", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await getWorkforceOverview(pool, 'org-1', { lifecycle_bucket: 'history' });
    assert.ok(captured[0].sql.includes("NOT IN ('active','ends_today')"));
  });

  it("applies date_from and supplier_org_id filters", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await getWorkforceOverview(pool, 'org-1', { date_from: '2026-01-01', supplier_org_id: 'sup-1' });
    assert.ok(captured[0].params.includes('2026-01-01'));
    assert.ok(captured[0].params.includes('sup-1'));
  });

  it("queries for buyer OR supplier perspective", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await getWorkforceOverview(pool, 'org-1');
    assert.ok(captured[0].sql.includes('a.org_id = $1 OR a.supplier_org_id = $1'));
  });

  it("caps limit at 200", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await getWorkforceOverview(pool, 'org-1', { limit: 999 });
    assert.ok(captured[0].params.includes(200));
  });

  it("returns empty array for empty org", async () => {
    const pool = returnPool([]);
    const result = await getWorkforceOverview(pool, 'org-empty');
    assert.deepStrictEqual(result, []);
  });
});

// ═══════════════════════════════════════════════════════
// getWorkforceDetail
// ═══════════════════════════════════════════════════════

describe("workforceService — getWorkforceDetail", () => {
  it("returns null when assignment not found", async () => {
    const pool = returnPool([]);
    const result = await getWorkforceDetail(pool, 'nonexistent', 'org-1');
    assert.strictEqual(result, null);
  });

  it("returns org boundary violation when not authorized", async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('FROM assignments a') && sql.includes('WHERE a.id')) {
        return { rows: [{ id: 'asg-1', org_id: 'org-other', supplier_org_id: 'sup-other' }] };
      }
      return { rows: [] };
    });
    const result = await getWorkforceDetail(pool, 'asg-1', 'org-1');
    assert.strictEqual(result.error, 'ORG_BOUNDARY_VIOLATION');
  });

  it("returns full detail when authorized as buyer", async () => {
    let callCount = 0;
    const pool = mockPool(async (sql) => {
      callCount++;
      // Assignment
      if (sql.includes('FROM assignments a') && sql.includes('WHERE a.id')) {
        return { rows: [{ id: 'asg-1', org_id: 'org-1', supplier_org_id: 'sup-1', status: 'active', contract_id: null }] };
      }
      // Workers
      if (sql.includes('worker_assignment_links')) {
        return { rows: [
          { link_id: 'wal-1', worker_user_id: 'w-1', is_active: true, worker_confirmation_status: 'worker_confirmed', first_name: 'Max', last_name: 'Mueller' },
          { link_id: 'wal-2', worker_user_id: 'w-2', is_active: true, worker_confirmation_status: 'pending_confirmation', first_name: 'Lisa', last_name: 'Schmidt' }
        ]};
      }
      // Timesheets
      if (sql.includes('FROM timesheets')) {
        return { rows: [{ id: 'ts-1', status: 'submitted', worker_name: 'Max Mueller', total_hours: 40 }] };
      }
      // Submissions
      if (sql.includes('worker_time_submissions')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await getWorkforceDetail(pool, 'asg-1', 'org-1');
    assert.ok(result.assignment);
    assert.strictEqual(result.assignment.id, 'asg-1');
    assert.strictEqual(result.workers.length, 2);
    assert.strictEqual(result.timesheets.length, 1);
    assert.ok(Array.isArray(result.action_flags));
    // Should have pending_confirmation flag
    const pendingFlag = result.action_flags.find(f => f.type === 'pending_confirmations');
    assert.ok(pendingFlag, 'Should have pending confirmation flag');
    assert.strictEqual(pendingFlag.count, 1);
  });

  it("returns full detail when authorized as supplier", async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('FROM assignments a') && sql.includes('WHERE a.id')) {
        return { rows: [{ id: 'asg-1', org_id: 'buyer-1', supplier_org_id: 'org-1', status: 'active', contract_id: null }] };
      }
      return { rows: [] };
    });
    const result = await getWorkforceDetail(pool, 'asg-1', 'org-1');
    assert.ok(result.assignment);
    assert.strictEqual(result.assignment.supplier_org_id, 'org-1');
  });

  it("skips contract lookup when no contract_id", async () => {
    let contractQueried = false;
    const pool = mockPool(async (sql) => {
      if (sql.includes('FROM assignments a') && sql.includes('WHERE a.id')) {
        return { rows: [{ id: 'asg-1', org_id: 'org-1', supplier_org_id: 'sup-1', status: 'active', contract_id: null }] };
      }
      if (sql.includes('FROM contracts')) {
        contractQueried = true;
        return { rows: [] };
      }
      return { rows: [] };
    });
    await getWorkforceDetail(pool, 'asg-1', 'org-1');
    assert.strictEqual(contractQueried, false, 'Should not query contracts when no contract_id');
  });

  it("includes expiring_soon flag when assignment ends within 14 days", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const pool = mockPool(async (sql) => {
      if (sql.includes('FROM assignments a') && sql.includes('WHERE a.id')) {
        return { rows: [{
          id: 'asg-1', org_id: 'org-1', supplier_org_id: 'sup-1',
          status: 'active', contract_id: null,
          planned_end_date: futureDate.toISOString().slice(0, 10),
          assignment_effective_end_date: futureDate.toISOString().slice(0, 10),
          assignment_is_current: true
        }] };
      }
      return { rows: [] };
    });
    const result = await getWorkforceDetail(pool, 'asg-1', 'org-1');
    const expiringFlag = result.action_flags.find(f => f.type === 'expiring_soon');
    assert.ok(expiringFlag, 'Should have expiring_soon flag');
    assert.ok(expiringFlag.days_remaining <= 14);
  });
});

// ═══════════════════════════════════════════════════════
// getWorkforceKpis
// ═══════════════════════════════════════════════════════

describe("workforceService — getWorkforceKpis", () => {
  it("returns structured KPI object", async () => {
    let callIdx = 0;
    const pool = mockPool(async (sql) => {
      callIdx++;
      // Worker stats (check first — more specific, also contains "assignments a")
      if (sql.includes("worker_assignment_links")) {
        return { rows: [{ deployed_workers: 12, pending_confirmations: 3 }] };
      }
      // Assignment stats
      if (sql.includes("COUNT(*) FILTER") && sql.includes("assignments a")) {
        return { rows: [{ active_assignments: 5, planned_assignments: 2, completed_assignments: 10, cancelled_assignments: 1, total_assignments: 18 }] };
      }
      // Timesheet stats
      if (sql.includes("timesheets ts")) {
        return { rows: [{ draft_timesheets: 4, submitted_timesheets: 2, rejected_timesheets: 1 }] };
      }
      // Expiring
      if (sql.includes("CURRENT_DATE + 14")) {
        return { rows: [{ count: 2 }] };
      }
      return { rows: [{}] };
    });

    const kpis = await getWorkforceKpis(pool, 'org-1');
    assert.strictEqual(kpis.active_assignments, 5);
    assert.strictEqual(kpis.planned_assignments, 2);
    assert.strictEqual(kpis.deployed_workers, 12);
    assert.strictEqual(kpis.pending_confirmations, 3);
    assert.strictEqual(kpis.draft_timesheets, 4);
    assert.strictEqual(kpis.submitted_timesheets, 2);
    assert.strictEqual(kpis.rejected_timesheets, 1);
    assert.strictEqual(kpis.expiring_in_14d, 2);
  });

  it("returns zero-values for empty org", async () => {
    const pool = returnPool([{}]);
    const kpis = await getWorkforceKpis(pool, 'org-empty');
    assert.strictEqual(kpis.active_assignments, 0);
    assert.strictEqual(kpis.deployed_workers, 0);
    assert.strictEqual(kpis.draft_timesheets, 0);
  });

  it("queries for both buyer and supplier perspective", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [{}] };
    });
    await getWorkforceKpis(pool, 'org-1');
    // All queries should use OR for dual perspective
    for (const c of captured) {
      assert.ok(
        c.sql.includes('org_id = $1 OR supplier_org_id = $1') ||
        c.sql.includes('a.org_id = $1 OR a.supplier_org_id = $1') ||
        c.sql.includes('ts.org_id = $1 OR ts.supplier_org_id = $1'),
        `Query should use dual perspective: ${c.sql.slice(0, 80)}...`
      );
    }
  });

  it("uses calendar-date windows for expiring assignment KPIs", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [{}] };
    });
    await getWorkforceKpis(pool, 'org-1');
    assert.ok(captured.some((entry) => entry.sql.includes("CURRENT_DATE + 14")));
    assert.ok(captured.some((entry) => entry.sql.includes("CURRENT_DATE")));
  });
});

// ═══════════════════════════════════════════════════════
// getPendingActions
// ═══════════════════════════════════════════════════════

describe("workforceService — getPendingActions", () => {
  it("returns array of action items", async () => {
    let callIdx = 0;
    const pool = mockPool(async (sql) => {
      callIdx++;
      // Pending confirmations
      if (sql.includes("pending_confirmation") && sql.includes("worker_assignment_links")) {
        return { rows: [{ link_id: 'wal-1', assignment_id: 'asg-1', first_name: 'Max', last_name: 'Mueller', start_date: '2026-03-20', org_name: 'Corp A' }] };
      }
      // Rejected timesheets
      if (sql.includes("status = 'rejected'")) {
        return { rows: [{ id: 'ts-1', assignment_id: 'asg-1', worker_name: 'Lisa Schmidt', week_start: '2026-03-10', rejection_reason: 'Stunden fehlerhaft' }] };
      }
      // Pending approval
      if (sql.includes("status = 'submitted'")) {
        return { rows: [{ id: 'ts-2', assignment_id: 'asg-2', worker_name: 'Tom Braun', week_start: '2026-03-10', total_hours: 38.5 }] };
      }
      // Expiring
      if (sql.includes("CURRENT_DATE + 14")) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 5);
        return { rows: [{ id: 'asg-3', worker_description: 'CNC-Operator', assignment_effective_end_date: futureDate.toISOString().slice(0, 10), org_name: 'Corp B' }] };
      }
      return { rows: [] };
    });

    const actions = await getPendingActions(pool, 'org-1');
    assert.ok(actions.length >= 4, `Expected at least 4 actions, got ${actions.length}`);

    // Check types present
    const types = actions.map(a => a.type);
    assert.ok(types.includes('pending_confirmation'));
    assert.ok(types.includes('rejected_timesheet'));
    assert.ok(types.includes('pending_approval'));
    assert.ok(types.includes('expiring_assignment'));

    // Check severity ordering (error first)
    const firstError = actions.findIndex(a => a.severity === 'error');
    const firstWarning = actions.findIndex(a => a.severity === 'warning');
    const firstInfo = actions.findIndex(a => a.severity === 'info');
    if (firstError >= 0 && firstWarning >= 0) {
      assert.ok(firstError < firstWarning, 'Errors should come before warnings');
    }
    if (firstWarning >= 0 && firstInfo >= 0) {
      assert.ok(firstWarning < firstInfo, 'Warnings should come before info');
    }
  });

  it("returns empty array when no pending actions", async () => {
    const pool = returnPool([]);
    const actions = await getPendingActions(pool, 'org-empty');
    assert.deepStrictEqual(actions, []);
  });

  it("caps limit at 50", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await getPendingActions(pool, 'org-1', 999);
    // All queries should use the capped limit
    for (const c of captured) {
      if (c.params.length >= 2) {
        assert.ok(c.params[1] <= 50, `Limit should be capped at 50, got ${c.params[1]}`);
      }
    }
  });

  it("each action has required fields", async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes("pending_confirmation") && sql.includes("worker_assignment_links")) {
        return { rows: [{ link_id: 'wal-1', assignment_id: 'asg-1', first_name: 'Max', last_name: 'Mueller', start_date: '2026-03-20', org_name: 'Corp A' }] };
      }
      return { rows: [] };
    });
    const actions = await getPendingActions(pool, 'org-1');
    if (actions.length > 0) {
      const a = actions[0];
      assert.ok(a.type, 'Should have type');
      assert.ok(a.severity, 'Should have severity');
      assert.ok(a.entity_type, 'Should have entity_type');
      assert.ok(a.entity_id, 'Should have entity_id');
      assert.ok(a.description, 'Should have description');
      assert.ok(a.details, 'Should have details');
    }
  });
});

// ═══════════════════════════════════════════════════════
// Assignment Service — listAssignments
// ═══════════════════════════════════════════════════════

describe("assignmentService — listAssignments filters", () => {
  it("filters by org_id", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    const { listAssignments } = await import("../services/assignmentService.js");
    await listAssignments(pool, { org_id: 'org-1' });
    assert.ok(captured[0].sql.includes('a.org_id = $'));
    assert.ok(captured[0].params.includes('org-1'));
  });

  it("filters by supplier_org_id", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    const { listAssignments } = await import("../services/assignmentService.js");
    await listAssignments(pool, { supplier_org_id: 'sup-1' });
    assert.ok(captured[0].sql.includes('a.supplier_org_id = $'));
    assert.ok(captured[0].params.includes('sup-1'));
  });

  it("filters by status", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    const { listAssignments } = await import("../services/assignmentService.js");
    await listAssignments(pool, { status: 'active' });
    assert.ok(captured[0].sql.includes('a.status = $'));
    assert.ok(captured[0].params.includes('active'));
  });

  it("filters by lifecycle bucket", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    const { listAssignments } = await import("../services/assignmentService.js");
    await listAssignments(pool, { lifecycle_bucket: 'history' });
    assert.ok(captured[0].sql.includes("NOT IN ('active','ends_today')"));
  });
});

// ═══════════════════════════════════════════════════════
// Assignment Service — VALID_TRANSITIONS
// ═══════════════════════════════════════════════════════

describe("assignmentService — transitions", () => {
  it("planned can transition to active or cancelled", async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('FROM assignments a') && sql.includes('WHERE a.id')) {
        return { rows: [{ id: 'asg-1', status: 'planned', org_id: 'org-1', supplier_org_id: 'sup-1' }] };
      }
      if (sql.includes('UPDATE assignments')) {
        return { rows: [{ id: 'asg-1', status: 'active' }] };
      }
      return { rows: [] };
    });
    const { transitionAssignment } = await import("../services/assignmentService.js");
    const result = await transitionAssignment(pool, 'asg-1', 'active', 'actor-1');
    assert.ok(result.assignment || !result.error);
  });

  it("completed cannot transition", async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('FROM assignments a') && sql.includes('WHERE a.id')) {
        return { rows: [{ id: 'asg-1', status: 'completed', org_id: 'org-1', supplier_org_id: 'sup-1' }] };
      }
      return { rows: [] };
    });
    const { transitionAssignment } = await import("../services/assignmentService.js");
    const result = await transitionAssignment(pool, 'asg-1', 'active', 'actor-1');
    assert.strictEqual(result.error, 'INVALID_TRANSITION');
  });
});

// ═══════════════════════════════════════════════════════
// getWorkerLiveBoard (Live-Belegschaft / Disposition)
// ═══════════════════════════════════════════════════════

describe("workforceService — getWorkerLiveBoard", () => {
  it("leere/fehlende Org → available:false, Zero-State", async () => {
    const pool = returnPool([]);
    const res = await getWorkerLiveBoard(pool, null);
    assert.strictEqual(res.available, false);
    assert.strictEqual(res.workers.length, 0);
    assert.strictEqual(res.kpis.total, 0);
  });

  it("aggregiert KPIs + Auslastung aus den Worker-Zeilen", async () => {
    const pool = returnPool([
      { user_id: 'u1', is_active: true,  live_status: 'im_einsatz', open_timesheets: 1 },
      { user_id: 'u2', is_active: true,  live_status: 'verfuegbar', open_timesheets: 0 },
      { user_id: 'u3', is_active: true,  live_status: 'endet_bald', open_timesheets: 2 },
      { user_id: 'u4', is_active: false, live_status: 'inaktiv',    open_timesheets: 0 }
    ]);
    const res = await getWorkerLiveBoard(pool, 'agency-1');
    assert.strictEqual(res.available, true);
    assert.strictEqual(res.kpis.total, 4);
    assert.strictEqual(res.kpis.im_einsatz, 1);
    assert.strictEqual(res.kpis.verfuegbar, 1);
    assert.strictEqual(res.kpis.endet_bald, 1);
    assert.strictEqual(res.kpis.inaktiv, 1);
    assert.strictEqual(res.kpis.open_timesheets, 3);
    // onAssignment = im_einsatz(1)+endet_bald(1)=2; aktive Worker = 4-1(inaktiv)=3 → 67%
    assert.strictEqual(res.kpis.auslastung_pct, 67);
  });

  it("ist strikt org-gebunden: supplier_org_id = $1 überall (Org-Boundary in SQL)", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => { captured.push({ sql, params }); return { rows: [] }; });
    await getWorkerLiveBoard(pool, 'agency-1');
    const q = captured[0];
    assert.strictEqual(q.params[0], 'agency-1');
    assert.ok(q.sql.includes('wp.supplier_org_id = $1'), 'worker_profiles org-gebunden');
    assert.ok(q.sql.includes('wal.supplier_org_id = $1'), 'assignment-links org-gebunden');
    assert.ok(/worker_time_submissions[\s\S]*supplier_org_id = \$1/.test(q.sql), 'timesheets org-gebunden');
  });

  /* Welle E4: die Reiter zaehlen die GELADENEN Zeilen. Wird die Menge am Limit
     abgeschnitten, zaehlen sie zu wenig — und eine stille Deckelung liest sich
     wie Vollstaendigkeit. Deshalb sagt die Antwort es ausdruecklich. */
  it("nennt die Obergrenze im Scope statt sie nur im SQL zu verstecken", async () => {
    const pool = returnPool([]);
    const res = await getWorkerLiveBoard(pool, 'agency-1');
    assert.strictEqual(res.scope.limit, 300, 'Standardgrenze');
    assert.strictEqual(res.truncated, false);

    const eng = await getWorkerLiveBoard(returnPool([]), 'agency-1', { limit: 50 });
    assert.strictEqual(eng.scope.limit, 50);
  });

  it("meldet truncated, wenn die Liste genau am Limit endet", async () => {
    const zeilen = Array.from({ length: 2 }, (_, i) => ({ id: 'p' + i, live_status: 'verfuegbar', open_timesheets: 0 }));
    const res = await getWorkerLiveBoard(returnPool(zeilen), 'agency-1', { limit: 2 });
    assert.strictEqual(res.truncated, true,
      'sonst behaupten die Reiter eine Gesamtzahl, die nur eine Teilmenge ist');

    const weniger = await getWorkerLiveBoard(returnPool(zeilen), 'agency-1', { limit: 3 });
    assert.strictEqual(weniger.truncated, false);
  });

  it("die Obergrenze bleibt gedeckelt — auch wenn jemand 99999 anfragt", async () => {
    const res = await getWorkerLiveBoard(returnPool([]), 'agency-1', { limit: 99999 });
    assert.strictEqual(res.scope.limit, 500);
  });

  it("Suchfilter fügt ILIKE-Parameter hinzu", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => { captured.push({ sql, params }); return { rows: [] }; });
    await getWorkerLiveBoard(pool, 'agency-1', { search: 'müller' });
    assert.ok(captured[0].sql.includes('ILIKE'));
    assert.ok(captured[0].params.some((p) => String(p).includes('müller')));
  });
});
