/**
 * staffControlService.test.js — SCC WAVE 12
 *
 * Unit-Tests für:
 *   staffControlService   — alle Snapshot-Funktionen (soft-fail, shape, KPI-Werte)
 *   staffAuditService     — writeStaffAudit, listStaffAudit, auditContextFromReq
 *
 * Pool-Mock: responses[] werden sequenziell abgearbeitet.
 * Kein Express-Server nötig — reine Service-Unit-Tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  loadExecutiveSnapshot,
  loadPlatformSnapshot,
  loadSupportSnapshot,
  loadOperationsSnapshot,
  loadRiskSnapshot,
  loadAuditDecisionsSnapshot,
  loadRevenueSnapshot,
  listDataExplorerViews,
  runDataExplorerView,
} from "../services/staffControlService.js";

import {
  writeStaffAudit,
  listStaffAudit,
  auditContextFromReq,
} from "../services/staffAuditService.js";

// ── Pool-Mock-Helper ──────────────────────────────────────────────

/**
 * Erstellt einen Pool-Mock, der Antworten sequenziell aus dem Array liefert.
 * Ein Error-Objekt im Array wird geworfen; undefined/null → { rows: [] }.
 */
function makePool(...responses) {
  let i = 0;
  return {
    query: async () => {
      const r = responses[i++];
      if (r instanceof Error) throw r;
      return r ?? { rows: [] };
    },
    _calls() { return i; },
  };
}

// ─────────────────────────────────────────────────────────────────
// loadExecutiveSnapshot
// ─────────────────────────────────────────────────────────────────

describe("loadExecutiveSnapshot — shape + KPI", () => {
  it("liefert korrekte Grundstruktur", async () => {
    const pool = makePool(
      { rows: [] },   // plans
      null,            // pilot (optional, catch)
      null,            // customer_requests (optional)
      { rows: [{ n: 0 }] }  // incidents
    );
    const snap = await loadExecutiveSnapshot(pool);
    assert.ok(snap.generated_at);
    assert.ok(Array.isArray(snap.plans.items));
    assert.equal(typeof snap.plans.total_active, "number");
    assert.equal(typeof snap.incidents_24h, "number");
    assert.ok(["ok", "warning", "degraded", "unknown"].includes(snap.platform_status));
  });

  it("plan.total_active summiert active_count korrekt", async () => {
    const pool = makePool(
      { rows: [{ plan: "BASIS", active_count: 3 }, { plan: "DEMO", active_count: 1 }] },
      null, null,
      { rows: [{ n: 0 }] }
    );
    const snap = await loadExecutiveSnapshot(pool);
    assert.equal(snap.plans.total_active, 4);
    assert.equal(snap.plans.items.length, 2);
  });

  it("platform_status = ok bei 0 incidents", async () => {
    const pool = makePool(null, null, null, { rows: [{ n: 0 }] });
    const snap = await loadExecutiveSnapshot(pool);
    assert.equal(snap.platform_status, "ok");
  });

  it("platform_status = warning bei 3 incidents", async () => {
    const pool = makePool(null, null, null, { rows: [{ n: 3 }] });
    const snap = await loadExecutiveSnapshot(pool);
    assert.equal(snap.platform_status, "warning");
  });

  it("platform_status = degraded bei 11 incidents", async () => {
    const pool = makePool(null, null, null, { rows: [{ n: 11 }] });
    const snap = await loadExecutiveSnapshot(pool);
    assert.equal(snap.platform_status, "degraded");
  });

  it("soft-fail: DB-Fehler in plans befüllt errors[], kein Throw", async () => {
    // First query throws — rest succeed
    const pool = makePool(
      new Error("relation does not exist"),
      null, null,
      { rows: [{ n: 0 }] }
    );
    const snap = await loadExecutiveSnapshot(pool);
    assert.ok(Array.isArray(snap.errors));
    assert.ok(snap.errors.length >= 1);
    assert.equal(snap.errors[0].area, "plans");
    assert.equal(snap.plans.total_active, 0);  // default
  });

  it("customer_requests.open zählt nur nicht-abgeschlossene Stati", async () => {
    const pool = makePool(
      { rows: [] },   // plans
      null,            // pilot
      {
        rows: [
          { status: "eingegangen",   count: 2 },
          { status: "abgeschlossen", count: 5 },
          { status: "abgelehnt",     count: 1 },
        ]
      },
      { rows: [{ n: 0 }] }  // incidents
    );
    const snap = await loadExecutiveSnapshot(pool);
    assert.equal(snap.customer_requests.open, 2);   // nur "eingegangen"
    assert.equal(snap.customer_requests.pipeline.length, 3);
  });
});

// ─────────────────────────────────────────────────────────────────
// loadRiskSnapshot
// ─────────────────────────────────────────────────────────────────

describe("loadRiskSnapshot — shape + KPI", () => {
  it("liefert alle kpi-Keys", async () => {
    // 7 Queries: dsgvo kpi, dsgvo list, compliance expired, compliance expiring, compliance list, hr kpi, hr list
    const pool = makePool(...Array(7).fill({ rows: [{ n: 0 }] }));
    const snap = await loadRiskSnapshot(pool);
    assert.ok("dsgvo_requests_open"        in snap.kpi);
    assert.ok("compliance_docs_expired"    in snap.kpi);
    assert.ok("compliance_docs_expiring_30d" in snap.kpi);
    assert.ok("high_risk_actions_7d"       in snap.kpi);
    assert.ok(Array.isArray(snap.dsgvo_recent));
    assert.ok(Array.isArray(snap.compliance_expiring));
    assert.ok(Array.isArray(snap.high_risk_audit));
  });

  it("kpi.dsgvo_requests_open korrekt aus DB", async () => {
    const pool = makePool(
      { rows: [{ n: 7 }] },   // dsgvo KPI
      { rows: [] },             // dsgvo list
      { rows: [{ n: 0 }] },   // compliance expired
      { rows: [{ n: 0 }] },   // compliance expiring
      { rows: [] },             // compliance list
      { rows: [{ n: 0 }] },   // hr kpi
      { rows: [] }              // hr list
    );
    const snap = await loadRiskSnapshot(pool);
    assert.equal(snap.kpi.dsgvo_requests_open, 7);
  });

  it("kpi.high_risk_actions_7d korrekt aus DB", async () => {
    const pool = makePool(
      { rows: [{ n: 0 }] },
      { rows: [] },
      { rows: [{ n: 0 }] },
      { rows: [{ n: 0 }] },
      { rows: [] },
      { rows: [{ n: 4 }] },   // high_risk_actions_7d = 4
      { rows: [] }
    );
    const snap = await loadRiskSnapshot(pool);
    assert.equal(snap.kpi.high_risk_actions_7d, 4);
  });

  it("dsgvo_recent Array mit Daten befüllt", async () => {
    const dsgvoRow = { id: "d1", request_type: "erasure", subject_type: "user", status: "pending", created_at: new Date().toISOString() };
    const pool = makePool(
      { rows: [{ n: 1 }] },
      { rows: [dsgvoRow] },     // dsgvo list
      { rows: [{ n: 0 }] },
      { rows: [{ n: 0 }] },
      { rows: [] },
      { rows: [{ n: 0 }] },
      { rows: [] }
    );
    const snap = await loadRiskSnapshot(pool);
    assert.equal(snap.dsgvo_recent.length, 1);
    assert.equal(snap.dsgvo_recent[0].id, "d1");
  });

  it("soft-fail: einzelne Tabelle fehlt → rest läuft durch", async () => {
    const pool = makePool(
      new Error("relation data_governance_requests does not exist"),
      new Error("relation data_governance_requests does not exist"),
      { rows: [{ n: 2 }] },  // compliance expired
      { rows: [{ n: 1 }] },
      { rows: [] },
      { rows: [{ n: 0 }] },
      { rows: [] }
    );
    const snap = await loadRiskSnapshot(pool);
    assert.equal(snap.kpi.dsgvo_requests_open, 0);    // default wegen Error
    assert.equal(snap.kpi.compliance_docs_expired, 2); // gelesen
    assert.equal(typeof snap.kpi.high_risk_actions_7d, "number");
  });
});

// ─────────────────────────────────────────────────────────────────
// loadSupportSnapshot
// ─────────────────────────────────────────────────────────────────

describe("loadSupportSnapshot — shape + impersonation", () => {
  it("impersonation.allowed ist immer false (hardcoded)", async () => {
    const pool = makePool({ rows: [{ open_cases: 0, escalated_cases: 0, sla_breach_count: 0, critical_count: 0 }] }, { rows: [] });
    const snap = await loadSupportSnapshot(pool);
    assert.equal(snap.impersonation.allowed, false);
  });

  it("kpi.open_cases korrekt aus support_cases", async () => {
    const pool = makePool(
      { rows: [{ open_cases: 5, escalated_cases: 2, sla_breach_count: 1, critical_count: 0 }] },
      { rows: [] }  // escalations
    );
    const snap = await loadSupportSnapshot(pool);
    assert.equal(snap.kpi.open_cases, 5);
    assert.equal(snap.kpi.escalated_cases, 2);
    assert.equal(snap.kpi.sla_breach_count, 1);
  });

  it("escalations Array aus support_escalations", async () => {
    const esc = { id: "e1", target: "tier2", priority: "critical", summary: "Test", status: "pending", created_at: new Date().toISOString(), case_number: "SC-001", case_subject: "Login error", org_name: "Acme" };
    const pool = makePool(
      { rows: [{ open_cases: 1, escalated_cases: 1, sla_breach_count: 0, critical_count: 1 }] },
      { rows: [esc] }
    );
    const snap = await loadSupportSnapshot(pool);
    assert.equal(snap.escalations.length, 1);
    assert.equal(snap.escalations[0].id, "e1");
  });

  it("soft-fail: support_cases fehlt → kpi defaults, kein Throw", async () => {
    const pool = makePool(
      new Error("relation support_cases does not exist"),
      { rows: [] }
    );
    const snap = await loadSupportSnapshot(pool);
    assert.equal(snap.kpi.open_cases, 0);
    assert.ok(Array.isArray(snap.escalations));
  });
});

// ─────────────────────────────────────────────────────────────────
// loadOperationsSnapshot
// ─────────────────────────────────────────────────────────────────

describe("loadOperationsSnapshot — runbook_runs + infra_health", () => {
  it("recent_runs aus staff_control_runbook_runs", async () => {
    const run = { runbook_key: "db:vacuum", status: "success", started_at: new Date().toISOString(), finished_at: new Date().toISOString() };
    const pool = makePool(
      { rows: [run] },   // runbook_runs
      { rows: [] }        // infra_health
    );
    const snap = await loadOperationsSnapshot(pool);
    assert.equal(snap.recent_runs.length, 1);
    assert.equal(snap.recent_runs[0].runbook_key, "db:vacuum");
  });

  it("infra_health aus infrastructure_snapshots", async () => {
    const host = { host_name: "prod-01", env: "production", cpu_percent: 45, ram_percent: 60, disk_percent: 30, docker_running_count: 5, docker_unhealthy_count: 0, tls_days_remaining: 90, backup_age_h: 2, deployment_version: "v1.2.0", deployment_status: "ok", collected_at: new Date().toISOString() };
    const pool = makePool(
      { rows: [] },      // runbook_runs
      { rows: [host] }   // infrastructure_snapshots
    );
    const snap = await loadOperationsSnapshot(pool);
    assert.equal(snap.infra_health.length, 1);
    assert.equal(snap.infra_health[0].host_name, "prod-01");
    assert.equal(snap.infra_health[0].cpu_percent, 45);
  });

  it("soft-fail: infrastructure_snapshots fehlt → infra_health = []", async () => {
    const pool = makePool(
      { rows: [] },
      new Error("relation infrastructure_snapshots does not exist")
    );
    const snap = await loadOperationsSnapshot(pool);
    assert.deepEqual(snap.infra_health, []);
  });

  // ── Phase I Slice 2: Live-Service-Health via getSystemDiagnostics ──
  it("service_health wird via getSystemDiagnostics befüllt (db/billing/email-Komponenten)", async () => {
    const pool = makePool(
      { rows: [] },                  // runbook_runs
      { rows: [] },                  // infra_health
      { rows: [{ "?column?": 1 }] }  // getSystemDiagnostics: SELECT 1 (database)
    );
    const snap = await loadOperationsSnapshot(pool);
    assert.ok(snap.service_health, "service_health soll befüllt sein");
    assert.equal(typeof snap.service_health.status, "string");
    assert.ok(snap.service_health.components, "components fehlen");
    assert.ok(snap.service_health.components.database, "database-Komponente fehlt");
    assert.ok(snap.service_health.components.billing, "billing-Komponente fehlt (Phase I Slice 1)");
    assert.ok(snap.service_health.components.email, "email-Komponente fehlt (Phase I Slice 1)");
  });

  it("soft-fail: DB-Fehler in Live-Diagnostics kippt den Snapshot nicht (database = critical)", async () => {
    const pool = makePool(
      { rows: [] },                       // runbook_runs (unberührt)
      { rows: [] },                       // infra_health (unberührt)
      new Error("SELECT 1 unreachable")   // getSystemDiagnostics database-Ping schlägt fehl
    );
    const snap = await loadOperationsSnapshot(pool);
    // Snapshot kommt ohne Throw zurück; Runbooks/Infra unberührt.
    assert.deepEqual(snap.recent_runs, []);
    assert.deepEqual(snap.infra_health, []);
    // getSystemDiagnostics fängt den DB-Fehler intern → service_health bleibt befüllt,
    // database-Komponente meldet critical (kein Secret, kein Throw nach oben).
    assert.ok(snap.service_health, "service_health soll trotz DB-Fehler befüllt sein");
    assert.equal(snap.service_health.components.database.status, "critical");
  });
});

// ─────────────────────────────────────────────────────────────────
// loadAuditDecisionsSnapshot
// ─────────────────────────────────────────────────────────────────

describe("loadAuditDecisionsSnapshot — shape", () => {
  it("liefert recent_audit + recent_decisions Arrays", async () => {
    const auditRow = { id: "a1", actor_id: "u1", created_at: new Date().toISOString(), area: "auth", action: "staff_control.auth.login", status: "ok", risk_level: "medium" };
    const decRow   = { id: "d1", area: "platform", title: "Feature X aktiviert", decision: "Ja", confirmed_at: new Date().toISOString(), reversible: true, reverted_at: null };
    const pool = makePool({ rows: [auditRow] }, { rows: [decRow] });
    const snap = await loadAuditDecisionsSnapshot(pool);
    assert.equal(snap.recent_audit.length, 1);
    assert.equal(snap.recent_audit[0].id, "a1");
    assert.equal(snap.recent_decisions.length, 1);
    assert.equal(snap.recent_decisions[0].id, "d1");
  });

  it("soft-fail: staff_control_audit_log fehlt → errors[] befüllt", async () => {
    const pool = makePool(
      new Error("relation staff_control_audit_log does not exist"),
      { rows: [] }
    );
    const snap = await loadAuditDecisionsSnapshot(pool);
    assert.ok(snap.errors.length >= 1);
    assert.equal(snap.errors[0].area, "staff_audit");
    assert.deepEqual(snap.recent_audit, []);
  });
});

// ─────────────────────────────────────────────────────────────────
// loadRevenueSnapshot
// ─────────────────────────────────────────────────────────────────

describe("loadRevenueSnapshot — shape", () => {
  it("active_subscriptions Array aus subscriptions", async () => {
    const pool = makePool({ rows: [{ plan: "BASIS", status: "active", count: 8 }] });
    const snap = await loadRevenueSnapshot(pool);
    assert.equal(snap.active_subscriptions.length, 1);
    assert.equal(snap.active_subscriptions[0].count, 8);
  });
});

// ─────────────────────────────────────────────────────────────────
// loadPlatformSnapshot
// ─────────────────────────────────────────────────────────────────

describe("loadPlatformSnapshot — shape", () => {
  it("feature_flags Array aus staff_control_feature_flags", async () => {
    const flag = { flag_key: "platform.read_only_mode", is_enabled: false, description: "Read-Only", risk_level: "critical", updated_by: null, updated_at: null, reason: null };
    const pool = makePool({ rows: [flag] });
    const snap = await loadPlatformSnapshot(pool);
    assert.equal(snap.feature_flags.length, 1);
    assert.equal(snap.feature_flags[0].flag_key, "platform.read_only_mode");
  });
});

// ─────────────────────────────────────────────────────────────────
// listDataExplorerViews + runDataExplorerView
// ─────────────────────────────────────────────────────────────────

describe("listDataExplorerViews", () => {
  it("liefert genau 4 vordefinierte Views", () => {
    const views = listDataExplorerViews();
    assert.equal(views.length, 4);
  });

  it("alle erwarteten View-Keys vorhanden", () => {
    const keys = listDataExplorerViews().map((v) => v.key);
    assert.ok(keys.includes("top_pilot_orgs"));
    assert.ok(keys.includes("recent_customer_requests"));
    assert.ok(keys.includes("failed_audit_actions_24h"));
    assert.ok(keys.includes("staff_audit_high_risk"));
  });

  it("jede View hat key + description", () => {
    for (const v of listDataExplorerViews()) {
      assert.ok(typeof v.key === "string" && v.key.length > 0);
      assert.ok(typeof v.description === "string" && v.description.length > 0);
    }
  });
});

describe("runDataExplorerView", () => {
  it("gibt VIEW_NOT_FOUND zurück für unbekannten Key", async () => {
    const pool = makePool();
    const r = await runDataExplorerView(pool, "nonexistent_view");
    assert.equal(r.error, "VIEW_NOT_FOUND");
  });

  it("führt SQL aus und liefert rows + rowCount", async () => {
    const rows = [{ id: "o1", name: "Acme", plan: "BASIS", pilot_status: "active", created_at: new Date().toISOString() }];
    const pool = makePool({ rows, rowCount: 1 });
    const r = await runDataExplorerView(pool, "top_pilot_orgs");
    assert.equal(r.key, "top_pilot_orgs");
    assert.ok(typeof r.description === "string");
    assert.equal(r.rowCount, 1);
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].id, "o1");
  });

  it("soft-fail: DB-Fehler → error im Result (kein Throw)", async () => {
    const pool = makePool(new Error("column does not exist"));
    const r = await runDataExplorerView(pool, "top_pilot_orgs");
    assert.ok(typeof r.error === "string");
    assert.ok(r.error.length > 0);
  });
});

// ─────────────────────────────────────────────────────────────────
// writeStaffAudit
// ─────────────────────────────────────────────────────────────────

describe("writeStaffAudit — Pflichtfelder + INSERT", () => {
  it("wirft Error wenn actorId fehlt", async () => {
    const pool = makePool();
    await assert.rejects(
      () => writeStaffAudit(pool, { area: "auth", action: "test" }),
      /actorId, area, action/
    );
  });

  it("wirft Error wenn area fehlt", async () => {
    const pool = makePool();
    await assert.rejects(
      () => writeStaffAudit(pool, { actorId: "u1", action: "test" }),
      /actorId, area, action/
    );
  });

  it("wirft Error wenn action fehlt", async () => {
    const pool = makePool();
    await assert.rejects(
      () => writeStaffAudit(pool, { actorId: "u1", area: "auth" }),
      /actorId, area, action/
    );
  });

  it("INSERT mit korrekten params: actorId, area, action, riskLevel", async () => {
    let captured = null;
    const pool = {
      query: async (sql, params) => {
        if (/INSERT INTO staff_control_audit_log/i.test(sql)) {
          captured = params;
          return { rows: [{ id: "a1", created_at: new Date().toISOString() }] };
        }
        return { rows: [] };
      }
    };
    await writeStaffAudit(pool, {
      actorId: "u1", area: "platform", action: "staff_control.platform.test",
      status: "ok", riskLevel: "high", reason: "Testgrund"
    });
    assert.ok(captured);
    assert.equal(captured[0], "u1");   // actorId
    assert.equal(captured[1], "platform"); // area
    assert.equal(captured[2], "staff_control.platform.test"); // action
    assert.equal(captured[5], "ok");       // status
    assert.equal(captured[6], "Testgrund"); // reason
    assert.equal(captured[8], "high");     // risk_level
  });

  it("gibt id und created_at zurück", async () => {
    const now = new Date().toISOString();
    const pool = {
      query: async () => ({ rows: [{ id: "a99", created_at: now }] })
    };
    const row = await writeStaffAudit(pool, { actorId: "u1", area: "auth", action: "login" });
    assert.equal(row.id, "a99");
    assert.equal(row.created_at, now);
  });
});

// ─────────────────────────────────────────────────────────────────
// listStaffAudit — Filter-WHERE-Bau
// ─────────────────────────────────────────────────────────────────

describe("listStaffAudit — Filter und Pagination", () => {
  it("kein Filter → kein WHERE in SQL", async () => {
    let capturedSql = "";
    const pool = { query: async (sql) => { capturedSql = sql; return { rows: [] }; } };
    await listStaffAudit(pool, {});
    assert.ok(!capturedSql.includes("WHERE"));
  });

  it("area-Filter → SQL enthält 'area ='", async () => {
    let capturedSql = "";
    const pool = { query: async (sql) => { capturedSql = sql; return { rows: [] }; } };
    await listStaffAudit(pool, { area: "platform" });
    assert.ok(capturedSql.includes("area = "));
  });

  it("riskLevel-Filter → SQL enthält 'risk_level ='", async () => {
    let capturedSql = "";
    const pool = { query: async (sql) => { capturedSql = sql; return { rows: [] }; } };
    await listStaffAudit(pool, { riskLevel: "high" });
    assert.ok(capturedSql.includes("risk_level = "));
  });

  it("actorId-Filter → SQL enthält 'actor_id ='", async () => {
    let capturedSql = "";
    const pool = { query: async (sql) => { capturedSql = sql; return { rows: [] }; } };
    await listStaffAudit(pool, { actorId: "u1" });
    assert.ok(capturedSql.includes("actor_id = "));
  });

  it("since/until → SQL enthält created_at >=  und <=", async () => {
    let capturedSql = "";
    const pool = { query: async (sql) => { capturedSql = sql; return { rows: [] }; } };
    await listStaffAudit(pool, { since: "2026-01-01", until: "2026-12-31" });
    assert.ok(capturedSql.includes("created_at >="));
    assert.ok(capturedSql.includes("created_at <="));
  });

  it("liefert rows zurück", async () => {
    const row = { id: "a1", actor_id: "u1", created_at: new Date().toISOString(), area: "auth", action: "login", status: "ok", risk_level: "medium" };
    const pool = { query: async () => ({ rows: [row] }) };
    const rows = await listStaffAudit(pool, {});
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "a1");
  });

  it("limit wird auf max 500 geclampt", async () => {
    let capturedParams = null;
    const pool = { query: async (sql, params) => { capturedParams = params; return { rows: [] }; } };
    await listStaffAudit(pool, { limit: 9999 });
    const limitParam = capturedParams[capturedParams.length - 2];
    assert.ok(limitParam <= 500);
  });
});

// ─────────────────────────────────────────────────────────────────
// auditContextFromReq
// ─────────────────────────────────────────────────────────────────

describe("auditContextFromReq", () => {
  it("liest x-forwarded-for als ip", () => {
    const req = { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" }, ip: "10.0.0.1", session: {} };
    const ctx = auditContextFromReq(req);
    assert.equal(ctx.ip, "1.2.3.4");
  });

  it("fällt auf req.ip zurück wenn kein x-forwarded-for", () => {
    const req = { headers: {}, ip: "10.0.0.1", session: {} };
    const ctx = auditContextFromReq(req);
    assert.equal(ctx.ip, "10.0.0.1");
  });

  it("liest user-agent header", () => {
    const req = { headers: { "user-agent": "Mozilla/5.0 TestBrowser" }, ip: null, session: {} };
    const ctx = auditContextFromReq(req);
    assert.ok(ctx.userAgent.includes("TestBrowser"));
  });

  it("stepUpAt aus session als ISO-String", () => {
    const ts = Date.now() - 1000;
    const req = { headers: {}, ip: null, session: { staffStepUpAt: ts } };
    const ctx = auditContextFromReq(req);
    assert.ok(typeof ctx.stepUpAt === "string");
    assert.ok(ctx.stepUpAt.includes("T")); // ISO-Format
  });

  it("gibt null zurück wenn keine Session", () => {
    const req = { headers: {}, ip: null, session: {} };
    const ctx = auditContextFromReq(req);
    assert.equal(ctx.stepUpAt, null);
  });
});
