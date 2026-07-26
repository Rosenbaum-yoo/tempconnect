/**
 * Match Alert Service: Enterprise-grade alert orchestration.
 *
 * Consolidates match alert creation, deduplication, preference-checking,
 * priority escalation, professional email templates, and audit logging.
 *
 * Triggers:
 *   - New capacity post activated → matching demands/requisitions notified
 *   - New demand request created → matching capacity suppliers notified
 *   - Requisition approved (OPEN) → matching capacity suppliers notified
 *   - Saved search job batch run → search owner notified
 *
 * Dedup: same (user, source_type, source_id) within DEDUP_WINDOW_HOURS → skip.
 * Preferences: notification_preferences table consulted per user (default: in-app=true, email=false).
 * Priority: urgent/notdienst → email always sent regardless of preference, severity='urgent'.
 */

import { createServiceLogger } from "../utils/logger.js";

const logger = createServiceLogger("matchAlertService");

/* ── Constants ─────────────────────────────────────── */

const DEDUP_WINDOW_HOURS = 4;

/** Map notification event types → preference category */
const EVENT_CATEGORY_MAP = {
  'capacity.match_found':  'match_alerts',
  'demand.match_found':    'match_alerts',
  'requisition.approved':  'requisition_updates',
  'requisition.submitted_for_approval': 'requisition_updates',
  'requisition.rejected':  'requisition_updates',
  'requisition.filled':    'requisition_updates',
  'requisition.cancelled': 'requisition_updates',
  'capacity.interest_received': 'capacity_updates',
  'capacity.expiring_soon': 'capacity_updates',
  'capacity.stale':        'capacity_updates',
  'compliance.expiring':   'compliance',
  'compliance.verified':   'compliance',
  'deal.completed':        'deals',
  'deal.offer_sent':       'deals',
  'deal.accepted':         'deals',
  'deal.confirmed':        'deals',
  'deal.assignment_started': 'deals',
  'offer.received':        'deals',
  'offer.accepted':        'deals',
  'offer.rejected':        'deals',
  'contract.expiring':     'compliance',
  'assignment.starting_soon': 'deals',
  'emergency.request_created': 'match_alerts',
  'emergency.escalated':   'match_alerts',
  'timesheet.submitted':   'timesheet_updates',
  'timesheet.approved':    'timesheet_updates',
  'timesheet.rejected':    'timesheet_updates',
  'timesheet.signed':      'timesheet_updates'
};

export { EVENT_CATEGORY_MAP };

/* ── Preference check ──────────────────────────────── */

/**
 * Check user notification preferences for a given event.
 * Returns { inApp: boolean, email: boolean }.
 * Defaults: in-app=true, email=false (unless urgent/notdienst).
 */
export async function getUserPreferences(pool, userId, eventKey, urgency) {
  const category = EVENT_CATEGORY_MAP[eventKey] || 'match_alerts';
  const urgencyValue = String(urgency || '').toLowerCase();
  const isEmergencyEvent = typeof eventKey === 'string' && eventKey.startsWith('emergency.');
  const isUrgent = isEmergencyEvent || urgencyValue === 'urgent' || urgencyValue === 'notdienst' || urgencyValue === 'critical';

  const { rows } = await pool.query(
    `SELECT channel_in_app, channel_email FROM notification_preferences
     WHERE user_id = $1 AND event_category = $2`,
    [userId, category]
  );

  if (rows.length === 0) {
    // No preference set → defaults
    return { inApp: true, email: isUrgent };
  }

  const pref = rows[0];
  return {
    inApp: pref.channel_in_app !== false,
    // Urgent/Notdienst always get email, regardless of preference
    email: isUrgent ? true : (pref.channel_email === true)
  };
}

/* ── Deduplication ─────────────────────────────────── */

/**
 * Check if a match alert already exists for this user+source within the dedup window.
 * Returns true if a duplicate exists (should skip).
 */
export async function isDuplicateAlert(pool, userId, sourceType, sourceId) {
  const { rows } = await pool.query(
    `SELECT id FROM match_alerts
     WHERE user_id = $1 AND source_type = $2 AND source_id = $3
       AND created_at > NOW() - INTERVAL '${DEDUP_WINDOW_HOURS} hours'
     LIMIT 1`,
    [userId, sourceType, sourceId]
  );
  return rows.length > 0;
}

/* ── Core: Create match alert ──────────────────────── */

/**
 * Create a single match alert for a user, respecting dedup + preferences.
 * @param {import('pg').Pool} pool
 * @param {Object} opts
 * @param {string} opts.userId - recipient
 * @param {string} opts.sourceType - 'demand_request' | 'requisition' | 'capacity_post' | 'search_job'
 * @param {string} opts.sourceId - ID of the source entity
 * @param {number} [opts.matchScore] - 0-100
 * @param {Array} [opts.matchReasons] - top match reasons
 * @param {string} [opts.urgency] - 'normal' | 'high' | 'urgent' | 'notdienst'
 * @param {number} [opts.matchCount] - number of matches (for batch alerts)
 * @param {string} [opts.jobId] - optional sla_search_jobs.id (backward compat)
 * @returns {{ created: boolean, alertId: string|null, skipped: string|null }}
 */
export async function createMatchAlertRecord(pool, opts) {
  const {
    userId, sourceType, sourceId,
    matchScore, matchReasons, urgency,
    matchCount, jobId
  } = opts;

  // Dedup check
  const isDup = await isDuplicateAlert(pool, userId, sourceType, sourceId);
  if (isDup) {
    return { created: false, alertId: null, skipped: 'duplicate' };
  }

  const urgencyValue = String(urgency || '').toLowerCase();
  const severity = (urgencyValue === 'urgent' || urgencyValue === 'notdienst' || urgencyValue === 'critical') ? 'urgent' : 'info';
  const topReasons = Array.isArray(matchReasons) ? matchReasons.slice(0, 3) : null;

  const { rows } = await pool.query(
    `INSERT INTO match_alerts
     (user_id, job_id, match_count, source_type, source_id, match_score, match_reasons, severity)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      userId,
      jobId || null,
      matchCount || 1,
      sourceType,
      sourceId,
      matchScore || null,
      topReasons ? JSON.stringify(topReasons) : null,
      severity
    ]
  );

  return { created: true, alertId: rows[0]?.id || null, skipped: null };
}

/* ── Trigger: Match Alerts for Requisition Approval ── */

/**
 * When a requisition is approved and moves to OPEN status,
 * find matching capacity suppliers and alert them.
 *
 * @deprecated Seit P4.1 laeuft die Ausloesung ueber den Chokepoint
 * `matchTriggerService.runMatchTrigger({ sourceType: 'requisition' })`: der alarmiert
 * BEIDE Seiten, dedupliziert paarbasiert in der DB und verlinkt auf das konkrete
 * Gegenstueck. Diese Einbahn-Variante (nur Anbieter, Zeitfenster-Dedup, Link auf die
 * Uebersicht) bleibt nur fuer Bestandsaufrufe erhalten und bekommt keine neuen.
 */
export async function triggerRequisitionMatchAlerts(pool, requisitionId, requisitionData, opts = {}) {
  try {
    const { autoMatchRequisition } = await import("./matchingEngine.js");
    const { dispatch } = await import("./notificationMatrix.js");

    const { matches } = await autoMatchRequisition(pool, requisitionId, requisitionData, opts);
    if (!matches || matches.length === 0) {
      logger.debug({ requisitionId }, 'No matches for approved requisition');
      return { alerted: 0 };
    }

    const urgency = requisitionData.urgency || 'normal';
    let alerted = 0;

    // Collect unique supplier IDs
    const supplierAlerts = new Map(); // supplierId → best match
    for (const m of matches) {
      const supplierId = m.capacity_post?.supplier_company_id;
      if (!supplierId) continue;
      const existing = supplierAlerts.get(supplierId);
      if (!existing || m.score > existing.score) {
        supplierAlerts.set(supplierId, m);
      }
    }

    for (const [supplierId, match] of supplierAlerts) {
      // Create match_alert record
      const result = await createMatchAlertRecord(pool, {
        userId: supplierId,
        sourceType: 'requisition',
        sourceId: requisitionId,
        matchScore: match.score,
        matchReasons: match.reasons,
        urgency,
        matchCount: 1
      });

      if (!result.created) continue;

      // In-app notification via matrix
      const prefs = await getUserPreferences(pool, supplierId, 'capacity.match_found', urgency);

      if (prefs.inApp) {
        await dispatch(pool, 'capacity.match_found', {
          recipientUserIds: [supplierId],
          entityType: 'requisition',
          entityId: requisitionId,
          message: buildAlertMessage('requisition', requisitionData, match.score, urgency),
          linkPath: '/public/requisitions.html',
          _skipPreferenceCheck: true // already checked
        });
      }

      // Email
      if (prefs.email) {
        await sendMatchAlertEmail(pool, supplierId, {
          sourceType: 'requisition',
          sourceData: requisitionData,
          matchScore: match.score,
          matchReasons: match.reasons,
          urgency
        });
      }

      // ML audit log
      await logMatchAlert(pool, {
        matchType: 'requisition_capacity',
        sourceId: requisitionId,
        targetId: match.capacity_post?.id,
        score: match.score,
        reasons: match.reasons,
        orgId: requisitionData.org_id
      });

      alerted++;
    }

    logger.info({ requisitionId, alerted, totalMatches: matches.length }, 'Requisition match alerts sent');
    return { alerted, totalMatches: matches.length };
  } catch (err) {
    logger.error({ err: err.message, requisitionId }, 'triggerRequisitionMatchAlerts failed');
    return { alerted: 0, error: err.message };
  }
}

/* ── Trigger: Match Alerts for Capacity Activation ─── */

/**
 * Enhanced capacity activation alerts with preferences + dedup.
 *
 * @deprecated Seit P4.1 uebernimmt das der Chokepoint
 * `matchTriggerService.runMatchTrigger({ sourceType: 'capacity_post' })` — siehe
 * Begruendung bei `triggerRequisitionMatchAlerts`.
 */
export async function triggerCapacityMatchAlerts(pool, capacityPostId, capacityData, opts = {}) {
  try {
    const { matchCapacityToRequisitions } = await import("./matchingEngine.js");
    const { dispatch } = await import("./notificationMatrix.js");

    const matches = await matchCapacityToRequisitions(pool, capacityPostId, {
      topN: 10, minScore: 20, ...opts
    });
    if (!matches || matches.length === 0) return { alerted: 0 };

    let alerted = 0;
    const notifiedUsers = new Set();

    for (const match of matches) {
      // Determine recipient
      let recipientId = null;
      let urgency = 'normal';

      if (match.type === 'demand_request') {
        recipientId = match.entity?.requester_company_id;
      } else if (match.type === 'requisition') {
        recipientId = match.entity?.created_by;
        urgency = match.entity?.urgency || 'normal';
      }

      if (!recipientId || notifiedUsers.has(recipientId)) continue;
      notifiedUsers.add(recipientId);

      // Create match_alert record
      const result = await createMatchAlertRecord(pool, {
        userId: recipientId,
        sourceType: 'capacity_post',
        sourceId: capacityPostId,
        matchScore: match.score,
        matchReasons: match.reasons,
        urgency,
        matchCount: 1
      });

      if (!result.created) continue;

      // Preference check
      const eventKey = match.type === 'demand_request' ? 'demand.match_found' : 'capacity.match_found';
      const prefs = await getUserPreferences(pool, recipientId, eventKey, urgency);

      if (prefs.inApp) {
        await dispatch(pool, eventKey, {
          recipientUserIds: [recipientId],
          entityType: 'capacity_post',
          entityId: capacityPostId,
          message: buildAlertMessage('capacity_post', capacityData, match.score, urgency),
          _skipPreferenceCheck: true
        });
      }

      if (prefs.email) {
        await sendMatchAlertEmail(pool, recipientId, {
          sourceType: 'capacity_post',
          sourceData: capacityData,
          matchScore: match.score,
          matchReasons: match.reasons,
          urgency
        });
      }

      await logMatchAlert(pool, {
        matchType: 'capacity_demand',
        sourceId: capacityPostId,
        targetId: match.entity?.id,
        score: match.score,
        reasons: match.reasons
      });

      alerted++;
    }

    return { alerted, totalMatches: matches.length };
  } catch (err) {
    logger.error({ err: err.message, capacityPostId }, 'triggerCapacityMatchAlerts failed');
    return { alerted: 0, error: err.message };
  }
}

/* ── Alert message builder ─────────────────────────── */

export function buildAlertMessage(sourceType, sourceData, score, urgency) {
  const prefix = (urgency === 'urgent' || urgency === 'notdienst') ? '🔴 DRINGEND: ' : '';
  const title = sourceData?.title || sourceData?.role || 'Unbekannt';
  const location = sourceData?.location_city || '';
  const scoreText = score ? ` (Score: ${score}%)` : '';

  const templates = {
    requisition: `${prefix}Neue passende Anforderung: "${title}" ${location}${scoreText}`,
    capacity_post: `${prefix}Neues passendes Kapazitaetsangebot: "${title}" ${location}${scoreText}`,
    demand_request: `${prefix}Neue passende Nachfrage: "${title}" ${location}${scoreText}`,
    search_job: `${prefix}Ihr Suchauftrag "${title}" hat neue Treffer${scoreText}`
  };

  return templates[sourceType] || `${prefix}Neuer Match gefunden${scoreText}`;
}

/* ── Professional Email Template ───────────────────── */

export function buildMatchAlertEmailHtml(opts) {
  const {
    sourceType, sourceData, matchScore, matchReasons, urgency
  } = opts;

  const isUrgent = urgency === 'urgent' || urgency === 'notdienst';
  const title = sourceData?.title || sourceData?.role || 'Neue Anfrage';
  const role = sourceData?.role || '';
  const location = sourceData?.location_city || '';
  const scorePercent = matchScore || 0;

  // Top 3 reasons
  const reasonRows = (matchReasons || []).slice(0, 3).map(r => {
    const factor = r.factor || '';
    const detail = r.detail || '';
    const points = r.points ?? 0;
    const max = r.max ?? 0;
    return `<tr><td style="padding:4px 12px;font-size:14px">${factor}</td><td style="padding:4px 12px;font-size:14px">${detail}</td><td style="padding:4px 12px;font-size:14px;text-align:right">${points}/${max}</td></tr>`;
  }).join('');

  const urgencyBanner = isUrgent
    ? `<div style="background:#dc2626;color:#fff;padding:10px 16px;font-weight:bold;text-align:center;margin-bottom:16px;border-radius:4px">
        ⚠️ DRINGEND${urgency === 'notdienst' ? ' – NOTDIENST' : ''}: Schnelles Handeln erforderlich
       </div>`
    : '';

  const linkMap = {
    requisition: '/public/requisitions.html',
    capacity_post: '/public/capacity_exchange_feed.html',
    demand_request: '/public/marketplace.html',
    search_job: '/public/sla_search_jobs.html'
  };
  const ctaLink = linkMap[sourceType] || '/public/dashboard.html';

  const scoreColor = scorePercent >= 70 ? '#16a34a' : scorePercent >= 40 ? '#d97706' : '#6b7280';

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f3f4f6">
  <div style="max-width:600px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    <!-- Header -->
    <div style="background:#1e40af;padding:20px 24px;color:#fff">
      <h1 style="margin:0;font-size:20px">TempConnect</h1>
      <p style="margin:4px 0 0;font-size:14px;opacity:0.9">Match Alert</p>
    </div>

    <div style="padding:24px">
      ${urgencyBanner}

      <h2 style="margin:0 0 8px;font-size:18px;color:#1f2937">${title}</h2>
      ${role ? `<p style="margin:0 0 4px;font-size:14px;color:#6b7280">Rolle: ${role}</p>` : ''}
      ${location ? `<p style="margin:0 0 16px;font-size:14px;color:#6b7280">Standort: ${location}</p>` : ''}

      <!-- Score -->
      <div style="display:inline-block;padding:8px 16px;border-radius:20px;background:${scoreColor};color:#fff;font-weight:bold;font-size:16px;margin-bottom:16px">
        Match-Score: ${scorePercent}%
      </div>

      <!-- Reasons -->
      ${reasonRows ? `
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <thead>
          <tr style="background:#f9fafb">
            <th style="padding:6px 12px;text-align:left;font-size:13px;color:#6b7280">Faktor</th>
            <th style="padding:6px 12px;text-align:left;font-size:13px;color:#6b7280">Detail</th>
            <th style="padding:6px 12px;text-align:right;font-size:13px;color:#6b7280">Punkte</th>
          </tr>
        </thead>
        <tbody>${reasonRows}</tbody>
      </table>` : ''}

      <!-- CTA -->
      <a href="${ctaLink}" style="display:inline-block;padding:12px 24px;background:#1e40af;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:12px">
        Jetzt ansehen →
      </a>
    </div>

    <!-- Footer -->
    <div style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af">
      <p style="margin:0 0 4px">Dies ist ein automatischer Matching-Hinweis von TempConnect.</p>
      <p style="margin:0 0 4px">Es wird kein Vermittlungserfolg zugesagt. Der Match-Score dient als Orientierung.</p>
      <p style="margin:0">Benachrichtigungseinstellungen: Einstellungen → Benachrichtigungen</p>
    </div>
  </div>
</body>
</html>`;
}

/* ── Send match alert email ────────────────────────── */

async function sendMatchAlertEmail(pool, userId, opts) {
  try {
    const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
    const email = rows[0]?.email;
    if (!email) return;

    const html = buildMatchAlertEmailHtml(opts);
    const isUrgent = opts.urgency === 'urgent' || opts.urgency === 'notdienst';
    const subject = isUrgent
      ? `🔴 DRINGEND – TempConnect Match Alert: ${opts.sourceData?.title || 'Neuer Match'}`
      : `TempConnect Match Alert: ${opts.sourceData?.title || 'Neuer Match'}`;

    const { enqueue, emailQueue } = await import("../queue/queues.js");
    await enqueue(emailQueue, 'match-alert-email', { to: email, subject, html });
  } catch (e) {
    logger.warn({ err: e.message, userId }, 'Match alert email failed (non-blocking)');
  }
}

/* ── ML audit log ──────────────────────────────────── */

async function logMatchAlert(pool, entry) {
  try {
    const { logMatch } = await import("./matchingEngine.js");
    await logMatch(pool, {
      match_type: entry.matchType || 'match_alert',
      source_id: entry.sourceId,
      target_id: entry.targetId,
      score: entry.score || 0,
      reasons: entry.reasons || [],
      outcome: 'alerted',
      org_id: entry.orgId || null
    });
  } catch (_e) {
    // Non-critical
  }
}

/* ── Match Alert CRUD (general, extends slaSearchService) ── */

export async function getMatchAlerts(pool, userId, opts = {}) {
  const unreadOnly = opts.unreadOnly === true;
  const limit = Math.min(100, opts.limit || 50);
  const offset = Math.max(0, opts.offset || 0);

  const where = ['ma.user_id = $1'];
  const params = [userId];
  let idx = 2;

  if (unreadOnly) where.push('ma.is_read = FALSE');
  if (opts.sourceType) { where.push(`ma.source_type = $${idx}`); params.push(opts.sourceType); idx++; }
  if (opts.severity) { where.push(`ma.severity = $${idx}`); params.push(opts.severity); idx++; }

  params.push(limit);
  const limitIdx = idx; idx++;
  params.push(offset);

  const { rows } = await pool.query(
    `SELECT ma.*,
            sj.title AS job_title, sj.role AS job_role, sj.location_city AS job_city
     FROM match_alerts ma
     LEFT JOIN sla_search_jobs sj ON sj.id = ma.job_id
     WHERE ${where.join(' AND ')}
     ORDER BY
       CASE WHEN ma.severity = 'urgent' THEN 0 ELSE 1 END,
       ma.created_at DESC
     LIMIT $${limitIdx} OFFSET $${idx}`,
    params
  );

  const { rows: countRows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM match_alerts WHERE user_id = $1 AND is_read = FALSE',
    [userId]
  );

  return { items: rows, unread_count: countRows[0]?.count ?? 0 };
}

export async function getMatchAlertUnreadCount(pool, userId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM match_alerts WHERE user_id = $1 AND is_read = FALSE',
    [userId]
  );
  return rows[0]?.count ?? 0;
}

export async function markMatchAlertRead(pool, alertId, userId) {
  const { rows } = await pool.query(
    'UPDATE match_alerts SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *',
    [alertId, userId]
  );
  return rows[0] || null;
}

export async function markAllMatchAlertsRead(pool, userId) {
  const { rowCount } = await pool.query(
    'UPDATE match_alerts SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
    [userId]
  );
  return { updated: rowCount };
}
