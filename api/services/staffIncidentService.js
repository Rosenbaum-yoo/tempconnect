/**
 * Staff Incident Service (Phase 5) — operativer Incident-Track (SCC Operations).
 *
 * Schliesst die vom Schema vorgezeichnete Luecke (warp_executions.incident_id, Mig 108):
 * ein Ort, an dem ein Operator einen Betriebsvorfall eroeffnet, quittiert und mit Grund
 * schliesst — der ueberdauert. Datenquelle: ops_incidents (Migration 121).
 *
 * Read-only Lesepfad (listIncidents/meta) folgt exakt der SCC-Aggregat-Linie wie
 * staffMailCenterService: plattformweite Summen + paginierte Liste, Zero-State by
 * construction, requireStaff im Router. Scope traegt `platform:true` + generated_at.
 *
 * Zusaetzlich listet listOpenSignals (read-only) plattformweite Betriebssignale OHNE
 * verknuepften Incident — fehlgeschlagene warp_executions (status='failed',
 * incident_id IS NULL; nutzt den vorgezeichneten Hook aus Mig 108) + nach event_key
 * aggregierte Mail-Zustellfehler (subscription_notification_log mail_status='failed').
 * Jedes Signal traegt einen `suggested`-Block (title/severity/source/signal_code) zum
 * Vorbefuellen der Incident-Eroeffnung. Keine Mutation, keine Migration, kein Versand.
 *
 * Mutationen (openIncident/acknowledgeIncident/resolveIncident) geben ein
 * diskriminiertes `{ ok, row | error }`-Ergebnis zurueck — wie staffCombinedInboxService.
 * Das Audit schreibt der ROUTER (writeStaffAudit, area "operations",
 * action staff_control.incident.*), konsistent mit allen anderen SCC-Mutationsrouten.
 * Statusuebergaenge sind streng: open -> acknowledged -> resolved (keine Rueckspruenge).
 * Quittieren/Schliessen nutzen SELECT ... FOR UPDATE innerhalb withTransaction, damit
 * konkurrierende Operatoren nicht denselben Vorfall doppelt verarbeiten.
 *
 * KEINE RLS (Staff-Ops-Tabelle wie staff_control_audit_log) — plattformweiter Zugriff.
 * org_id ist NUR informativ und KEINE Tenant-Grenze.
 */

import { withTransaction } from "../utils/transaction.js";

// Kanonische Enums (= DB-CHECK in Migration 121).
export const INCIDENT_SEVERITIES = Object.freeze(["low", "medium", "high", "critical"]);
export const INCIDENT_STATUSES = Object.freeze(["open", "acknowledged", "resolved"]);
export const INCIDENT_SOURCES = Object.freeze(["manual", "sla", "staffing", "infra", "automation", "email"]);

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const MAX_TITLE_LEN = 200;
const MAX_SIGNAL_LEN = 80;
const MAX_NOTE_LEN = 2000;
const MIN_REASON_LEN = 10;

// Signal-Feed (offene Signale ohne Incident) — Read-only Fenster + Caps.
const DEFAULT_SIGNAL_WINDOW_HOURS = 168; // 7 Tage
const MAX_SIGNAL_WINDOW_HOURS = 720;     // 30 Tage
const DEFAULT_SIGNAL_LIMIT = 20;
const MAX_SIGNAL_LIMIT = 100;

function clampLimit(value) {
  const n = parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIST_LIMIT;
  return Math.min(n, MAX_LIST_LIMIT);
}

function emptyStatusTotals() {
  const by_status = {};
  for (const s of INCIDENT_STATUSES) by_status[s] = 0;
  return by_status;
}

function emptySeverityTotals() {
  const by_severity = {};
  for (const s of INCIDENT_SEVERITIES) by_severity[s] = 0;
  return by_severity;
}

function isPlainObject(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function mapIncident(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    severity: row.severity,
    status: row.status,
    source: row.source,
    signal_code: row.signal_code || null,
    org_id: row.org_id || null,
    details: isPlainObject(row.details) ? row.details : {},
    opened_by: row.opened_by || null,
    opened_reason: row.opened_reason || null,
    acknowledged_by: row.acknowledged_by || null,
    acknowledged_at: row.acknowledged_at || null,
    resolved_by: row.resolved_by || null,
    resolved_at: row.resolved_at || null,
    resolution_note: row.resolution_note || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

/**
 * Plattformweite Summen je status (open/acknowledged/resolved).
 * @param {import('pg').Pool} pool
 */
async function loadStatusTotals(pool) {
  const by_status = emptyStatusTotals();
  const { rows } = await pool.query(
    `SELECT status, COUNT(*)::int AS cnt
       FROM ops_incidents
      GROUP BY status`
  );
  for (const r of rows) {
    if (Object.prototype.hasOwnProperty.call(by_status, r.status)) {
      by_status[r.status] = Number(r.cnt) || 0;
    }
  }
  return by_status;
}

/**
 * Plattformweite Summen je severity (low/medium/high/critical).
 * @param {import('pg').Pool} pool
 */
async function loadSeverityTotals(pool) {
  const by_severity = emptySeverityTotals();
  const { rows } = await pool.query(
    `SELECT severity, COUNT(*)::int AS cnt
       FROM ops_incidents
      GROUP BY severity`
  );
  for (const r of rows) {
    if (Object.prototype.hasOwnProperty.call(by_severity, r.severity)) {
      by_severity[r.severity] = Number(r.cnt) || 0;
    }
  }
  return by_severity;
}

/**
 * Liste der Incidents, optional nach status/severity gefiltert, neueste zuerst.
 * Nutzt den Index idx_ops_incidents_status_created (status, created_at DESC).
 * @param {import('pg').Pool} pool
 * @param {{status?:string|null, severity?:string|null, limit:number}} args
 */
async function loadList(pool, { status, severity, limit }) {
  const params = [];
  const conds = [];
  if (status) { params.push(status); conds.push(`status = $${params.length}`); }
  if (severity) { params.push(severity); conds.push(`severity = $${params.length}`); }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT id, title, severity, status, source, signal_code, org_id, details,
            opened_by, opened_reason, acknowledged_by, acknowledged_at,
            resolved_by, resolved_at, resolution_note, created_at, updated_at
       FROM ops_incidents
       ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
}

/**
 * Read-only Operator-Sicht: Summen je status/severity + paginierte Liste.
 * Zero-State by construction (leeres Log → Summen 0 + leere Liste).
 * @param {import('pg').Pool} pool
 * @param {{status?:string|null, severity?:string|null, limit?:number|string}} [opts]
 */
export async function listIncidents(pool, opts = {}) {
  const generated_at = new Date().toISOString();
  const status = INCIDENT_STATUSES.includes(String(opts.status)) ? String(opts.status) : null;
  const severity = INCIDENT_SEVERITIES.includes(String(opts.severity)) ? String(opts.severity) : null;
  const limit = clampLimit(opts.limit);

  const [by_status, by_severity, rows] = await Promise.all([
    loadStatusTotals(pool),
    loadSeverityTotals(pool),
    loadList(pool, { status, severity, limit })
  ]);

  return {
    available: true,
    totals: {
      by_status,
      by_severity,
      open: by_status.open,
      total: by_status.open + by_status.acknowledged + by_status.resolved
    },
    incidents: rows.map(mapIncident),
    scope: { platform: true, status, severity, limit },
    generated_at
  };
}

/** Statische Metadaten für Filter-/Formular-UI (Zero-Query). */
export function meta() {
  return {
    severities: [...INCIDENT_SEVERITIES],
    statuses: [...INCIDENT_STATUSES],
    sources: [...INCIDENT_SOURCES]
  };
}

function clampSignalWindow(value) {
  const n = parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SIGNAL_WINDOW_HOURS;
  return Math.min(n, MAX_SIGNAL_WINDOW_HOURS);
}

function clampSignalLimit(value) {
  const n = parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SIGNAL_LIMIT;
  return Math.min(n, MAX_SIGNAL_LIMIT);
}

/** Mail-Fehler-Schweregrad nach Häufigkeit (Vorschlag, kein DB-Wert). */
function mailFailureSeverity(count) {
  if (count >= 10) return "high";
  if (count >= 3) return "medium";
  return "low";
}

/**
 * Fehlgeschlagene Warp-Ausführungen ohne verknüpften Incident.
 * Nutzt idx_warp_executions_status + idx_warp_executions_started (Mig 108).
 * @param {import('pg').Pool} pool
 * @param {{windowHours:number, limit:number}} args
 */
async function loadFailedWarpSignals(pool, { windowHours, limit }) {
  const { rows } = await pool.query(
    `SELECT id, runbook_name, host_name, risk_level, error, started_at
       FROM warp_executions
      WHERE status = 'failed' AND incident_id IS NULL
        AND started_at >= NOW() - make_interval(hours => $1::int)
      ORDER BY started_at DESC
      LIMIT $2`,
    [windowHours, limit]
  );
  return rows.map((r) => {
    const runbook = r.runbook_name || "warp";
    const host = r.host_name || null;
    const title = (host ? `Warp fehlgeschlagen: ${runbook} @ ${host}` : `Warp fehlgeschlagen: ${runbook}`).slice(0, MAX_TITLE_LEN);
    const severity = INCIDENT_SEVERITIES.includes(r.risk_level) ? r.risk_level : "medium";
    return {
      kind: "warp_failed",
      ref_id: r.id,
      title,
      detail: r.error ? String(r.error).slice(0, 240) : null,
      occurred_at: r.started_at || null,
      count: 1,
      suggested: {
        title,
        severity,
        source: "infra",
        signal_code: `warp.${runbook}`.slice(0, MAX_SIGNAL_LEN)
      }
    };
  });
}

/**
 * Mail-Zustellfehler, nach event_key aggregiert (häufigste zuerst).
 * Read-only auf subscription_notification_log (mail_status='failed').
 * @param {import('pg').Pool} pool
 * @param {{windowHours:number, limit:number}} args
 */
async function loadMailFailureSignals(pool, { windowHours, limit }) {
  const { rows } = await pool.query(
    `SELECT event_key, COUNT(*)::int AS cnt, MAX(created_at) AS last_at
       FROM subscription_notification_log
      WHERE mail_status = 'failed'
        AND created_at >= NOW() - make_interval(hours => $1::int)
      GROUP BY event_key
      ORDER BY cnt DESC, last_at DESC
      LIMIT $2`,
    [windowHours, limit]
  );
  return rows.map((r) => {
    const eventKey = r.event_key || "unbekannt";
    const count = Number(r.cnt) || 0;
    const title = `Mail-Zustellfehler: ${eventKey} (${count}×)`.slice(0, MAX_TITLE_LEN);
    return {
      kind: "mail_failed",
      ref_id: eventKey,
      title,
      detail: null,
      occurred_at: r.last_at || null,
      count,
      suggested: {
        title,
        severity: mailFailureSeverity(count),
        source: "email",
        signal_code: `mail.${eventKey}`.slice(0, MAX_SIGNAL_LEN)
      }
    };
  });
}

/**
 * Read-only Feed offener Betriebssignale OHNE Incident — Eröffnungs-Vorschläge.
 * Zwei plattformweite Quellen (parallel): fehlgeschlagene warp_executions +
 * nach event_key aggregierte Mail-Zustellfehler. Zero-State by construction.
 * @param {import('pg').Pool} pool
 * @param {{window_hours?:number|string, limit?:number|string}} [opts]
 */
export async function listOpenSignals(pool, opts = {}) {
  const generated_at = new Date().toISOString();
  const windowHours = clampSignalWindow(opts.window_hours);
  const limit = clampSignalLimit(opts.limit);

  const [warp_failed, mail_failed] = await Promise.all([
    loadFailedWarpSignals(pool, { windowHours, limit }),
    loadMailFailureSignals(pool, { windowHours, limit })
  ]);

  return {
    available: true,
    signals: { warp_failed, mail_failed },
    totals: {
      warp_failed: warp_failed.length,
      mail_failed_events: mail_failed.length,
      mail_failed_total: mail_failed.reduce((sum, m) => sum + m.count, 0)
    },
    scope: { platform: true, window_hours: windowHours, limit },
    generated_at
  };
}

/**
 * Incident eroeffnen. Einzel-INSERT (Audit schreibt der Router).
 * @param {import('pg').Pool} pool
 * @param {{title:string, severity?:string, source?:string, signal_code?:string|null,
 *          org_id?:string|null, details?:object, opened_by?:string|null,
 *          opened_reason:string}} input
 * @returns {Promise<{ok:true, row:object} | {ok:false, error:string}>}
 */
export async function openIncident(pool, input = {}) {
  const title = String(input.title || "").trim().slice(0, MAX_TITLE_LEN);
  if (!title) return { ok: false, error: "TITLE_REQUIRED" };

  const openedReason = String(input.opened_reason || "").trim();
  if (openedReason.length < MIN_REASON_LEN) return { ok: false, error: "REASON_TOO_SHORT" };

  const severity = INCIDENT_SEVERITIES.includes(input.severity) ? input.severity : "medium";
  const source = INCIDENT_SOURCES.includes(input.source) ? input.source : "manual";
  const signalCode = input.signal_code ? String(input.signal_code).trim().slice(0, MAX_SIGNAL_LEN) : null;
  const orgId = input.org_id || null;
  const details = isPlainObject(input.details) ? input.details : {};
  const openedBy = input.opened_by || null;

  const { rows } = await pool.query(
    `INSERT INTO ops_incidents
       (title, severity, status, source, signal_code, org_id, details, opened_by, opened_reason)
     VALUES ($1, $2, 'open', $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [title, severity, source, signalCode, orgId, JSON.stringify(details), openedBy, openedReason]
  );
  return { ok: true, row: mapIncident(rows[0]) };
}

/**
 * Status-Uebergang mit Sperre (SELECT ... FOR UPDATE) gegen Doppelverarbeitung.
 * @param {import('pg').Pool} pool
 * @param {string} id
 * @param {string} fromStatus   erwarteter Ausgangsstatus
 * @param {string} toStatus     Zielstatus
 * @param {(client:any, current:object)=>Promise<object>} apply  fuehrt das UPDATE aus
 * @returns {Promise<{ok:true, row:object} | {ok:false, error:string, current?:string}>}
 */
function transition(pool, id, fromStatus, toStatus, apply) {
  if (!id) return { ok: false, error: "INCIDENT_NOT_FOUND" };
  return withTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `SELECT id, status FROM ops_incidents WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (rows.length === 0) return { ok: false, error: "INCIDENT_NOT_FOUND" };
    const current = rows[0].status;
    if (current === toStatus) return { ok: false, error: "NO_CHANGE", current };
    if (current !== fromStatus) return { ok: false, error: "INVALID_TRANSITION", current };
    const updated = await apply(client);
    return { ok: true, row: mapIncident(updated) };
  });
}

/**
 * Incident quittieren: open -> acknowledged.
 * @returns {Promise<{ok:true, row:object} | {ok:false, error:string, current?:string}>}
 */
export function acknowledgeIncident(pool, id, { actorId } = {}) {
  return transition(pool, id, "open", "acknowledged", async (client) => {
    const { rows } = await client.query(
      `UPDATE ops_incidents
          SET status = 'acknowledged',
              acknowledged_by = $2,
              acknowledged_at = NOW(),
              updated_at = NOW()
        WHERE id = $1
      RETURNING *`,
      [id, actorId || null]
    );
    return rows[0];
  });
}

/**
 * Incident schliessen: acknowledged -> resolved (optionaler Loesungsvermerk).
 * @returns {Promise<{ok:true, row:object} | {ok:false, error:string, current?:string}>}
 */
export function resolveIncident(pool, id, { actorId, note } = {}) {
  const resolutionNote = note != null ? String(note).trim().slice(0, MAX_NOTE_LEN) || null : null;
  return transition(pool, id, "acknowledged", "resolved", async (client) => {
    const { rows } = await client.query(
      `UPDATE ops_incidents
          SET status = 'resolved',
              resolved_by = $2,
              resolved_at = NOW(),
              resolution_note = $3,
              updated_at = NOW()
        WHERE id = $1
      RETURNING *`,
      [id, actorId || null, resolutionNote]
    );
    return rows[0];
  });
}
