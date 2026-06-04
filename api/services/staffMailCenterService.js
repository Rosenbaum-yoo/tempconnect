/**
 * Staff Mail Center (Phase E/F) — read-only Operator-Sicht auf den Mailversand.
 *
 * Aggregiert bestehende Wahrheiten plattformweit (SCC = Operatorrolle, requireStaff):
 *   - Provider-Status aus emailProviderService.describeEmail(config)
 *     (welcher Versandweg aktiv, welche Fähigkeiten real, welche Warnungen).
 *   - Zustellungs-Kennzahlen aus subscription_notification_log (Summen je mail_status).
 *   - Kanal-Verteilung je dispatched_via (db / email / both / skipped).
 *   - Letzte Notifications (Mail-Status + Fehler), Empfänger PII-maskiert.
 *
 * Datenquelle: subscription_notification_log (Migration 103) — geschrieben vom
 * subscriptionNotificationService als Idempotency- + Mail-Beobachtbarkeits-Schicht.
 * Indizes auf created_at DESC + event_key sind bereits vorhanden.
 *
 * KEINE Migration, KEINE Mutation, KEIN Versand. Zero-State garantiert (leeres Log →
 * Summen 0 + leere Liste). Versand/Retry laufen NICHT hier, sondern über die
 * bestehenden Notification-/Email-Pfade. "Domain owns truth, SCC owns aggregation."
 *
 * Entkoppelt von emailService.js (Transport): importiert describeEmail direkt aus
 * der Provider-Abstraktion — isolierter Mail-Diff ohne Cross-Coupling.
 */

import { config } from "../config/index.js";
import { describeEmail } from "./emailProviderService.js";

// Kanonische mail_status-Werte (= DB-CHECK in Migration 103). NULL → 'none'
// (in-app-only, kein Mailversuch) wird in den Summen separat als 'none' geführt.
export const MAIL_STATUSES = Object.freeze(["ok", "failed", "no_smtp", "skipped"]);

// Kanonische dispatched_via-Werte (= DB-CHECK in Migration 103).
export const DISPATCH_CHANNELS = Object.freeze(["db", "email", "both", "skipped"]);

const STATUS_NULL_KEY = "none";

const DEFAULT_RECENT_LIMIT = 25;
const MAX_RECENT_LIMIT = 100;
const MAX_ERROR_LEN = 240;

function clampLimit(value) {
  const n = parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RECENT_LIMIT;
  return Math.min(n, MAX_RECENT_LIMIT);
}

/**
 * Empfänger-Adresse PII-schonend maskieren: erste Stelle + Domain bleiben sichtbar
 * (z.B. "a***@firma.de"), damit der Operator die Zieldomain prüfen kann, ohne die
 * vollständige Personen-Adresse zu exponieren.
 */
function maskEmail(email) {
  if (!email) return null;
  const str = String(email).trim();
  const at = str.indexOf("@");
  if (at <= 0) return "***"; // kein gültiges Format → vollständig maskieren
  const head = str.slice(0, 1);
  const domain = str.slice(at + 1);
  return `${head}***@${domain}`;
}

function emptyStatusTotals() {
  const by_status = {};
  for (const s of MAIL_STATUSES) by_status[s] = 0;
  by_status[STATUS_NULL_KEY] = 0;
  return by_status;
}

function emptyChannelTotals() {
  const by_channel = {};
  for (const c of DISPATCH_CHANNELS) by_channel[c] = 0;
  return by_channel;
}

function mapRecent(row) {
  return {
    id: row.id,
    created_at: row.created_at || null,
    context_type: row.context_type,
    event_key: row.event_key,
    recipient_role: row.recipient_role,
    recipient: maskEmail(row.recipient_email),
    dispatched_via: row.dispatched_via,
    mail_status: row.mail_status || null,
    mail_error: row.mail_error ? String(row.mail_error).slice(0, MAX_ERROR_LEN) : null
  };
}

/**
 * Plattformweite Zustell-Summen je mail_status (read-only Aggregat).
 * NULL (nur in-app, kein Mailversuch) wird als 'none' geführt.
 * @param {import('pg').Pool} pool
 */
async function loadStatusTotals(pool) {
  const by_status = emptyStatusTotals();
  let events = 0;
  const { rows } = await pool.query(
    `SELECT COALESCE(mail_status, 'none') AS status, COUNT(*)::int AS cnt
       FROM subscription_notification_log
      GROUP BY COALESCE(mail_status, 'none')`
  );
  for (const r of rows) {
    const cnt = Number(r.cnt) || 0;
    events += cnt;
    if (Object.prototype.hasOwnProperty.call(by_status, r.status)) {
      by_status[r.status] = cnt;
    } else {
      by_status[STATUS_NULL_KEY] += cnt; // unbekannt (sollte DB-CHECK verhindern)
    }
  }
  return { events, by_status };
}

/**
 * Kanal-Verteilung je dispatched_via (db / email / both / skipped).
 * @param {import('pg').Pool} pool
 */
async function loadChannelTotals(pool) {
  const by_channel = emptyChannelTotals();
  const { rows } = await pool.query(
    `SELECT dispatched_via AS via, COUNT(*)::int AS cnt
       FROM subscription_notification_log
      GROUP BY dispatched_via`
  );
  for (const r of rows) {
    const cnt = Number(r.cnt) || 0;
    if (Object.prototype.hasOwnProperty.call(by_channel, r.via)) {
      by_channel[r.via] = cnt;
    }
  }
  return by_channel;
}

/**
 * Verteilung je event_key (≈ Benachrichtigungs-/Template-Typ) mit Fehlerquote.
 * Nutzt den vorhandenen Index subscription_notification_log_event_idx (event_key).
 * Inhärent gebunden: die DB-CHECK-Liste begrenzt event_key auf ~15 Werte → kein LIMIT
 * nötig (≤ #Event-Typen Ergebniszeilen, wie GROUP BY status).
 * @param {import('pg').Pool} pool
 */
async function loadEventBreakdown(pool) {
  const { rows } = await pool.query(
    `SELECT event_key,
            COUNT(*)::int                                        AS total,
            COUNT(*) FILTER (WHERE mail_status = 'failed')::int  AS failed,
            COUNT(*) FILTER (WHERE mail_status = 'no_smtp')::int AS no_smtp
       FROM subscription_notification_log
      GROUP BY event_key
      ORDER BY COUNT(*) DESC, event_key ASC`
  );
  return rows.map((r) => ({
    event_key: r.event_key,
    total: Number(r.total) || 0,
    failed: Number(r.failed) || 0,
    no_smtp: Number(r.no_smtp) || 0
  }));
}

/**
 * Letzte Notifications (neueste zuerst), optional nach mail_status gefiltert.
 * Nutzt den vorhandenen Index subscription_notification_log_created_idx (created_at DESC).
 * @param {import('pg').Pool} pool
 * @param {{status?:string|null, limit:number}} args
 */
async function loadRecent(pool, { status, limit }) {
  const params = [];
  let where = "";
  if (status) {
    params.push(status);
    where = `WHERE mail_status = $${params.length}`;
  }
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT id, created_at, context_type, context_id, event_key, recipient_role,
            recipient_email, dispatched_via, mail_status, mail_error
       FROM subscription_notification_log
       ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
}

/**
 * @param {import('pg').Pool} pool
 * @param {{status?:string|null, limit?:number|string}} [opts]
 */
export async function getMailOverview(pool, opts = {}) {
  const generated_at = new Date().toISOString();
  const email = describeEmail(config);

  const status = MAIL_STATUSES.includes(String(opts.status)) ? String(opts.status) : null;
  const limit = clampLimit(opts.limit);

  // loadRecent MUSS vorletzte Position behalten und der Event-Breakdown ans Ende:
  // bestehende Tests prüfen pool.calls[2] == recent-Query (Call-Index-Stabilität).
  const [totals, channels, recentRows, eventsByKey] = await Promise.all([
    loadStatusTotals(pool),
    loadChannelTotals(pool),
    loadRecent(pool, { status, limit }),
    loadEventBreakdown(pool)
  ]);

  return {
    available: true,
    email,
    totals,
    channels,
    events_by_key: eventsByKey,
    recent: (recentRows || []).map(mapRecent),
    scope: { platform: true, status, limit },
    generated_at
  };
}

/** Statische Metadaten für Filter-UI (Zero-Query). */
export function meta() {
  return {
    mail_statuses: [...MAIL_STATUSES],
    dispatch_channels: [...DISPATCH_CHANNELS]
  };
}
