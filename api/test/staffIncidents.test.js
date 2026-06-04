/**
 * staffIncidentService tests (Phase 5) — operativer Incident-Track.
 * Read-only Aggregat + Mutationen (open/acknowledge/resolve) gegen ops_incidents (Mig 121).
 * Fake pool, keine echte DB. withTransaction laeuft auf dem Fake-Pool direkt (kein .connect)
 * → SELECT FOR UPDATE + UPDATE sind zwei sequentielle query()-Aufrufe.
 *
 * Run: node --test --test-force-exit test/staffIncidents.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  listIncidents,
  meta,
  openIncident,
  acknowledgeIncident,
  resolveIncident,
  listOpenSignals,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  INCIDENT_SOURCES
} from "../services/staffIncidentService.js";

// Fake pool: liefert vorab gequeuete Antworten in Reihenfolge der Aufrufe.
function sequencePool(...responses) {
  let idx = 0;
  const calls = [];
  return {
    calls,
    query: (sql, params) => {
      calls.push({ sql, params });
      if (idx >= responses.length) throw new Error(`Unexpected query #${idx + 1}`);
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

// Vollstaendige DB-Zeile (RETURNING *) zum Durchreichen durch mapIncident.
function incidentRow(over = {}) {
  return {
    id: "inc-1",
    title: "DB-Pool erschöpft",
    severity: "high",
    status: "open",
    source: "manual",
    signal_code: null,
    org_id: null,
    details: { host: "db-1" },
    opened_by: "actor-1",
    opened_reason: "Pool-Auslastung dauerhaft >95%",
    acknowledged_by: null,
    acknowledged_at: null,
    resolved_by: null,
    resolved_at: null,
    resolution_note: null,
    created_at: "2026-06-02T10:00:00Z",
    updated_at: "2026-06-02T10:00:00Z",
    ...over
  };
}

describe("meta", () => {
  it("exposes severities, statuses, sources for filter/form UI", () => {
    assert.deepStrictEqual(meta(), {
      severities: ["low", "medium", "high", "critical"],
      statuses: ["open", "acknowledged", "resolved"],
      sources: ["manual", "sla", "staffing", "infra", "automation", "email"]
    });
  });
  it("exported constants are the canonical sets", () => {
    assert.deepStrictEqual([...INCIDENT_SEVERITIES], ["low", "medium", "high", "critical"]);
    assert.deepStrictEqual([...INCIDENT_STATUSES], ["open", "acknowledged", "resolved"]);
    assert.deepStrictEqual([...INCIDENT_SOURCES], ["manual", "sla", "staffing", "infra", "automation", "email"]);
  });
});

describe("listIncidents — shape + zero-state", () => {
  it("zero-state: empty table → all buckets present and 0, incidents []", async () => {
    const pool = sequencePool({ rows: [] }, { rows: [] }, { rows: [] });
    const out = await listIncidents(pool);

    assert.strictEqual(out.available, true);
    for (const s of INCIDENT_STATUSES) assert.strictEqual(out.totals.by_status[s], 0, `status ${s}`);
    for (const s of INCIDENT_SEVERITIES) assert.strictEqual(out.totals.by_severity[s], 0, `severity ${s}`);
    assert.strictEqual(out.totals.open, 0);
    assert.strictEqual(out.totals.total, 0);
    assert.deepStrictEqual(out.incidents, []);
    assert.strictEqual(out.scope.platform, true);
    assert.ok(typeof out.generated_at === "string" && out.generated_at.includes("T"));
  });
});

describe("listIncidents — aggregation", () => {
  it("sums by_status/by_severity, derives open+total, maps incidents with details passthrough", async () => {
    const pool = sequencePool(
      { rows: [{ status: "open", cnt: 3 }, { status: "acknowledged", cnt: 1 }, { status: "resolved", cnt: 6 }] },
      { rows: [{ severity: "critical", cnt: 1 }, { severity: "high", cnt: 2 }, { severity: "medium", cnt: 7 }] },
      { rows: [incidentRow({ id: "inc-a", status: "open", severity: "critical", details: { foo: "bar" } })] }
    );
    const out = await listIncidents(pool);

    assert.strictEqual(out.totals.by_status.open, 3);
    assert.strictEqual(out.totals.by_status.acknowledged, 1);
    assert.strictEqual(out.totals.by_status.resolved, 6);
    assert.strictEqual(out.totals.open, 3);
    assert.strictEqual(out.totals.total, 10);
    assert.strictEqual(out.totals.by_severity.critical, 1);
    assert.strictEqual(out.totals.by_severity.high, 2);
    assert.strictEqual(out.totals.by_severity.low, 0);

    assert.strictEqual(out.incidents.length, 1);
    const inc = out.incidents[0];
    assert.strictEqual(inc.id, "inc-a");
    assert.strictEqual(inc.status, "open");
    assert.deepStrictEqual(inc.details, { foo: "bar" }, "jsonb details passed through as object");
  });

  it("non-object details coerced to {} (no crash)", async () => {
    const pool = sequencePool(
      { rows: [] }, { rows: [] },
      { rows: [incidentRow({ details: null }), incidentRow({ id: "inc-2", details: "garbage" })] }
    );
    const out = await listIncidents(pool);
    assert.deepStrictEqual(out.incidents[0].details, {});
    assert.deepStrictEqual(out.incidents[1].details, {});
  });
});

describe("listIncidents — input sanitation", () => {
  it("rejects unknown status/severity (→ null) and clamps oversized limit to 200", async () => {
    const pool = sequencePool({ rows: [] }, { rows: [] }, { rows: [] });
    const out = await listIncidents(pool, { status: "bogus", severity: "nope", limit: 9999 });
    assert.strictEqual(out.scope.status, null);
    assert.strictEqual(out.scope.severity, null);
    assert.strictEqual(out.scope.limit, 200);
  });

  it("forwards sanitized status+severity into the list query as bound params, defaults limit 50", async () => {
    const pool = sequencePool({ rows: [] }, { rows: [] }, { rows: [] });
    const out = await listIncidents(pool, { status: "open", severity: "critical" });
    assert.strictEqual(out.scope.limit, 50);
    // 3. Query (index 2) = loadList → WHERE status + severity + LIMIT als Params
    const listCall = pool.calls[2];
    assert.ok(listCall.params.includes("open"), "status bound");
    assert.ok(listCall.params.includes("critical"), "severity bound");
    assert.ok(listCall.params.includes(50), "limit forwarded as param");
    assert.ok(/status\s*=\s*\$1/.test(listCall.sql), "parametrized status, not inlined");
    assert.ok(/severity\s*=\s*\$2/.test(listCall.sql), "parametrized severity, not inlined");
  });

  it("no filters → no WHERE clause, only limit param", async () => {
    const pool = sequencePool({ rows: [] }, { rows: [] }, { rows: [] });
    await listIncidents(pool);
    const listCall = pool.calls[2];
    assert.strictEqual(listCall.params.length, 1, "only limit param");
    assert.ok(!/WHERE/.test(listCall.sql), "no WHERE clause when unfiltered");
  });
});

describe("openIncident", () => {
  it("happy path: inserts with status open, returns mapped row, stringifies details", async () => {
    const pool = sequencePool({ rows: [incidentRow({ id: "inc-new", severity: "high", source: "sla", signal_code: "SLA_COMPLIANCE_LOW" })] });
    const result = await openIncident(pool, {
      title: "SLA unter 60%",
      severity: "high",
      source: "sla",
      signal_code: "SLA_COMPLIANCE_LOW",
      org_id: "org-9",
      details: { compliance: 0.55 },
      opened_by: "actor-7",
      opened_reason: "SLA-Compliance kritisch niedrig, Eskalation nötig"
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.row.id, "inc-new");
    const call = pool.calls[0];
    assert.ok(/INSERT INTO ops_incidents/.test(call.sql));
    assert.ok(/'open'/.test(call.sql), "status hardcoded to open at insert");
    assert.strictEqual(call.params[0], "SLA unter 60%", "title");
    assert.strictEqual(call.params[1], "high", "severity");
    assert.strictEqual(call.params[2], "sla", "source");
    assert.strictEqual(call.params[3], "SLA_COMPLIANCE_LOW", "signal_code");
    assert.strictEqual(call.params[4], "org-9", "org_id");
    assert.strictEqual(call.params[5], JSON.stringify({ compliance: 0.55 }), "details JSON-stringified for jsonb");
    assert.strictEqual(call.params[6], "actor-7", "opened_by");
    assert.strictEqual(call.params[7], "SLA-Compliance kritisch niedrig, Eskalation nötig", "opened_reason");
  });

  it("defaults invalid severity→medium, invalid source→manual, non-object details→{}", async () => {
    const pool = sequencePool({ rows: [incidentRow()] });
    await openIncident(pool, { title: "X", severity: "ultra", source: "moon", details: [1, 2], opened_reason: "lange genug begründet" });
    const call = pool.calls[0];
    assert.strictEqual(call.params[1], "medium", "invalid severity falls back");
    assert.strictEqual(call.params[2], "manual", "invalid source falls back");
    assert.strictEqual(call.params[5], JSON.stringify({}), "array/non-object details → empty object");
  });

  it("rejects empty title with TITLE_REQUIRED and runs no query", async () => {
    const pool = sequencePool();
    const result = await openIncident(pool, { title: "   ", opened_reason: "lange genug begründet" });
    assert.deepStrictEqual(result, { ok: false, error: "TITLE_REQUIRED" });
    assert.strictEqual(pool.calls.length, 0, "no DB write on validation failure");
  });

  it("rejects short reason with REASON_TOO_SHORT and runs no query", async () => {
    const pool = sequencePool();
    const result = await openIncident(pool, { title: "Echter Titel", opened_reason: "kurz" });
    assert.deepStrictEqual(result, { ok: false, error: "REASON_TOO_SHORT" });
    assert.strictEqual(pool.calls.length, 0);
  });
});

describe("acknowledgeIncident — open → acknowledged", () => {
  it("happy path: locks row, updates to acknowledged, returns mapped row", async () => {
    const pool = sequencePool(
      { rows: [{ id: "inc-1", status: "open" }] },                       // SELECT ... FOR UPDATE
      { rows: [incidentRow({ status: "acknowledged", acknowledged_by: "actor-2", acknowledged_at: "2026-06-02T11:00:00Z" })] } // UPDATE
    );
    const result = await acknowledgeIncident(pool, "inc-1", { actorId: "actor-2" });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.row.status, "acknowledged");
    assert.strictEqual(result.row.acknowledged_by, "actor-2");
    assert.strictEqual(pool.calls.length, 2, "SELECT FOR UPDATE + UPDATE");
    assert.ok(/FOR UPDATE/.test(pool.calls[0].sql), "row locked before transition");
    assert.ok(/SET status = 'acknowledged'/.test(pool.calls[1].sql));
    assert.strictEqual(pool.calls[1].params[1], "actor-2", "actor recorded as acknowledged_by");
  });

  it("INCIDENT_NOT_FOUND when row missing — single query, no UPDATE", async () => {
    const pool = sequencePool({ rows: [] });
    const result = await acknowledgeIncident(pool, "ghost", { actorId: "a" });
    assert.deepStrictEqual(result, { ok: false, error: "INCIDENT_NOT_FOUND" });
    assert.strictEqual(pool.calls.length, 1, "no UPDATE attempted");
  });

  it("NO_CHANGE when already acknowledged", async () => {
    const pool = sequencePool({ rows: [{ id: "inc-1", status: "acknowledged" }] });
    const result = await acknowledgeIncident(pool, "inc-1", { actorId: "a" });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, "NO_CHANGE");
    assert.strictEqual(result.current, "acknowledged");
    assert.strictEqual(pool.calls.length, 1);
  });

  it("INVALID_TRANSITION when resolved (no backward jump)", async () => {
    const pool = sequencePool({ rows: [{ id: "inc-1", status: "resolved" }] });
    const result = await acknowledgeIncident(pool, "inc-1", { actorId: "a" });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, "INVALID_TRANSITION");
    assert.strictEqual(result.current, "resolved");
    assert.strictEqual(pool.calls.length, 1);
  });

  it("INCIDENT_NOT_FOUND when id missing — no query at all", async () => {
    const pool = sequencePool();
    const result = await acknowledgeIncident(pool, "", { actorId: "a" });
    assert.deepStrictEqual(result, { ok: false, error: "INCIDENT_NOT_FOUND" });
    assert.strictEqual(pool.calls.length, 0);
  });
});

describe("resolveIncident — acknowledged → resolved", () => {
  it("happy path: updates to resolved with sliced note", async () => {
    const pool = sequencePool(
      { rows: [{ id: "inc-1", status: "acknowledged" }] },
      { rows: [incidentRow({ status: "resolved", resolved_by: "actor-3", resolution_note: "Pool vergrößert" })] }
    );
    const result = await resolveIncident(pool, "inc-1", { actorId: "actor-3", note: "  Pool vergrößert  " });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.row.status, "resolved");
    assert.strictEqual(pool.calls.length, 2);
    assert.ok(/SET status = 'resolved'/.test(pool.calls[1].sql));
    assert.strictEqual(pool.calls[1].params[1], "actor-3");
    assert.strictEqual(pool.calls[1].params[2], "Pool vergrößert", "note trimmed");
  });

  it("note null when not provided", async () => {
    const pool = sequencePool(
      { rows: [{ id: "inc-1", status: "acknowledged" }] },
      { rows: [incidentRow({ status: "resolved" })] }
    );
    await resolveIncident(pool, "inc-1", { actorId: "actor-3" });
    assert.strictEqual(pool.calls[1].params[2], null, "resolution_note null when omitted");
  });

  it("INVALID_TRANSITION when still open (must acknowledge first)", async () => {
    const pool = sequencePool({ rows: [{ id: "inc-1", status: "open" }] });
    const result = await resolveIncident(pool, "inc-1", { actorId: "a" });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, "INVALID_TRANSITION");
    assert.strictEqual(result.current, "open");
    assert.strictEqual(pool.calls.length, 1, "no UPDATE on invalid transition");
  });
});

describe("listOpenSignals", () => {
  it("zero-state: leere Quellen → leere Signale + Null-Totals", async () => {
    const pool = sequencePool({ rows: [] }, { rows: [] });
    const out = await listOpenSignals(pool, {});

    assert.strictEqual(out.available, true);
    assert.deepStrictEqual(out.signals.warp_failed, []);
    assert.deepStrictEqual(out.signals.mail_failed, []);
    assert.deepStrictEqual(out.totals, {
      warp_failed: 0,
      mail_failed_events: 0,
      mail_failed_total: 0
    });
    assert.strictEqual(out.scope.platform, true);
    assert.strictEqual(out.scope.window_hours, 168, "Default-Fenster 7 Tage");
    assert.strictEqual(typeof out.generated_at, "string");
  });

  it("aggregiert warp + mail mit suggested-Block + Totals", async () => {
    const pool = sequencePool(
      { rows: [{ id: "we-1", runbook_name: "deploy", host_name: "app-1", risk_level: "high", error: "exit 1", started_at: "2026-06-02T10:00:00Z" }] },
      { rows: [{ event_key: "invoice.created", cnt: 12, last_at: "2026-06-02T09:00:00Z" }] }
    );
    const out = await listOpenSignals(pool, {});

    const w = out.signals.warp_failed[0];
    assert.strictEqual(w.kind, "warp_failed");
    assert.strictEqual(w.ref_id, "we-1");
    assert.strictEqual(w.title, "Warp fehlgeschlagen: deploy @ app-1");
    assert.strictEqual(w.detail, "exit 1");
    assert.strictEqual(w.count, 1);
    assert.deepStrictEqual(w.suggested, {
      title: "Warp fehlgeschlagen: deploy @ app-1",
      severity: "high",
      source: "infra",
      signal_code: "warp.deploy"
    });

    const m = out.signals.mail_failed[0];
    assert.strictEqual(m.kind, "mail_failed");
    assert.strictEqual(m.ref_id, "invoice.created");
    assert.ok(m.title.includes("(12×)"));
    assert.strictEqual(m.count, 12);
    assert.strictEqual(m.suggested.source, "email");
    assert.strictEqual(m.suggested.severity, "high");
    assert.strictEqual(m.suggested.signal_code, "mail.invoice.created");

    assert.deepStrictEqual(out.totals, {
      warp_failed: 1,
      mail_failed_events: 1,
      mail_failed_total: 12
    });
  });

  it("warp-Query bindet status='failed' + incident_id IS NULL; calls deterministisch", async () => {
    const pool = sequencePool({ rows: [] }, { rows: [] });
    await listOpenSignals(pool, {});
    // Promise.all-Reihenfolge: [0]=warp, [1]=mail
    assert.ok(/status = 'failed'/.test(pool.calls[0].sql));
    assert.ok(/incident_id IS NULL/.test(pool.calls[0].sql));
    assert.ok(/mail_status = 'failed'/.test(pool.calls[1].sql));
    assert.ok(/GROUP BY event_key/.test(pool.calls[1].sql));
  });

  it("klemmt window_hours/limit + bindet Default bei Garbage", async () => {
    const tooBig = sequencePool({ rows: [] }, { rows: [] });
    await listOpenSignals(tooBig, { window_hours: 9999, limit: 9999 });
    assert.deepStrictEqual(tooBig.calls[0].params, [720, 100], "warp: window→720h, limit→100");
    assert.deepStrictEqual(tooBig.calls[1].params, [720, 100], "mail: identisch geklammert");

    const garbage = sequencePool({ rows: [] }, { rows: [] });
    const out = await listOpenSignals(garbage, { window_hours: "abc", limit: "x" });
    assert.deepStrictEqual(garbage.calls[0].params, [168, 20], "Garbage→Defaults 168h/20");
    assert.strictEqual(out.scope.window_hours, 168);
    assert.strictEqual(out.scope.limit, 20);
  });

  it("Mail-Severity nach Häufigkeit (low/medium/high) + null event_key→unbekannt", async () => {
    const pool = sequencePool(
      { rows: [] },
      { rows: [
        { event_key: "a", cnt: 2, last_at: "2026-06-02T09:00:00Z" },
        { event_key: "b", cnt: 5, last_at: "2026-06-02T08:00:00Z" },
        { event_key: null, cnt: 10, last_at: "2026-06-02T07:00:00Z" }
      ] }
    );
    const out = await listOpenSignals(pool, {});
    const byRef = Object.fromEntries(out.signals.mail_failed.map((s) => [s.ref_id, s]));
    assert.strictEqual(byRef.a.suggested.severity, "low", "2 → low");
    assert.strictEqual(byRef.b.suggested.severity, "medium", "5 → medium");
    assert.strictEqual(byRef.unbekannt.suggested.severity, "high", "10 → high");
    assert.strictEqual(byRef.unbekannt.suggested.signal_code, "mail.unbekannt");
    assert.strictEqual(out.totals.mail_failed_events, 3);
    assert.strictEqual(out.totals.mail_failed_total, 17);
  });
});
