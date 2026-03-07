/** SLA timer, events and escalation. RUNNING -> MET | BREACHED (terminal). */

export async function setSla(pool, requestId, slaMinutes, actorId) {
  const r = await pool.query("SELECT id, created_at, requester_id FROM requests WHERE id=$1", [requestId]);
  if (!r.rows[0]) return { ok: false, error: "NOT_FOUND" };
  const req = r.rows[0];
  if (req.requester_id !== actorId) return { ok: false, error: "FORBIDDEN" };
  const respondBy = new Date(new Date(req.created_at).getTime() + slaMinutes * 60 * 1000);
  await pool.query("UPDATE requests SET sla_minutes=$1, sla_respond_by=$2, updated_at=NOW() WHERE id=$3", [slaMinutes, respondBy, requestId]);
  await pool.query("INSERT INTO sla_events (request_id, event_type, details) VALUES ($1, 'deadline_set', $2)", [requestId, JSON.stringify({ sla_minutes: slaMinutes, respond_by: respondBy.toISOString() })]);
  return { ok: true, request_id: requestId, sla_minutes: slaMinutes, sla_respond_by: respondBy };
}

/** Idempotent: set first_matching_attempt_at once, insert MATCHING_ATTEMPT. */
export async function recordMatchingAttempt(pool, requestId, details = {}) {
  const r = await pool.query(
    "UPDATE requests SET first_matching_attempt_at = COALESCE(first_matching_attempt_at, NOW()), updated_at = NOW() WHERE id = $1 AND first_matching_attempt_at IS NULL RETURNING id",
    [requestId]
  );
  if (r.rowCount === 0) return { recorded: false };
  await pool.query("INSERT INTO sla_events (request_id, event_type, details) VALUES ($1, 'MATCHING_ATTEMPT', $2)", [requestId, JSON.stringify(details)]);
  return { recorded: true };
}

/** Idempotent: set first_notification_sent_at once, insert NOTIFICATION_SENT. */
export async function recordNotificationSent(pool, requestId, details = {}) {
  const r = await pool.query(
    "UPDATE requests SET first_notification_sent_at = COALESCE(first_notification_sent_at, NOW()), updated_at = NOW() WHERE id = $1 AND first_notification_sent_at IS NULL RETURNING id",
    [requestId]
  );
  if (r.rowCount === 0) return { recorded: false };
  await pool.query("INSERT INTO sla_events (request_id, event_type, details) VALUES ($1, 'NOTIFICATION_SENT', $2)", [requestId, JSON.stringify(details)]);
  return { recorded: true };
}

/** Only RUNNING -> MET. Sets sla_met_at, inserts SLA_MET. */
export async function markSlaMet(pool, requestId) {
  const r = await pool.query(
    "UPDATE requests SET sla_status = 'MET', sla_met_at = NOW(), updated_at = NOW() WHERE id = $1 AND sla_status = 'RUNNING' RETURNING id",
    [requestId]
  );
  if (r.rowCount === 0) return { updated: false };
  await pool.query("INSERT INTO sla_events (request_id, event_type, details) VALUES ($1, 'SLA_MET', $2)", [requestId, JSON.stringify({ at: new Date().toISOString() })]);
  return { updated: true };
}

/** Insert SLA_STARTED (call after request create). */
export async function recordSlaStarted(pool, requestId) {
  await pool.query("INSERT INTO sla_events (request_id, event_type, details) VALUES ($1, 'SLA_STARTED', $2)", [requestId, JSON.stringify({ at: new Date().toISOString() })]);
}

export async function slaScan(pool, batchSize) {
  const size = Math.min(500, batchSize || 100);
  const client = await pool.connect();
  let breached = 0;
  try {
    const sel = await client.query(
      "SELECT id FROM requests WHERE status = 'SENT' AND sla_status IN ('OK','RUNNING') AND sla_respond_by < NOW() ORDER BY sla_respond_by ASC LIMIT $1",
      [size]
    );
    for (const row of sel.rows) {
      await client.query("BEGIN");
      const cur = await client.query("SELECT sla_status FROM requests WHERE id=$1 FOR UPDATE", [row.id]);
      const status = cur.rows[0]?.sla_status;
      if (status !== "OK" && status !== "RUNNING") {
        await client.query("ROLLBACK");
        continue;
      }
      const now = new Date();
      await client.query("UPDATE requests SET sla_status='BREACHED', sla_breached_at=$1, escalation_level=COALESCE(escalation_level,0)+1, updated_at=NOW() WHERE id=$2", [now, row.id]);
      await client.query("INSERT INTO sla_events (request_id, event_type, details) VALUES ($1, 'SLA_BREACHED', $2)", [row.id, JSON.stringify({ breached_at: now.toISOString() })]);
      await client.query("INSERT INTO sla_events (request_id, event_type, details) VALUES ($1, 'escalated', $2)", [row.id, JSON.stringify({ escalation_level: 1 })]);
      await client.query("COMMIT");
      breached++;
    }
  } finally {
    client.release();
  }
  return { breached };
}

export async function markSlaResolved(pool, requestId) {
  const r = await pool.query("SELECT sla_status FROM requests WHERE id=$1", [requestId]);
  if (!r.rows[0] || r.rows[0].sla_status !== "BREACHED") return;
  await pool.query("UPDATE requests SET sla_status='RESOLVED', updated_at=NOW() WHERE id=$1", [requestId]);
  await pool.query("INSERT INTO sla_events (request_id, event_type, details) VALUES ($1, 'resolved', $2)", [requestId, JSON.stringify({ at: new Date().toISOString() })]);
}

/** Notdienst-Eskalation: RUNNING NOTDIENST nach 10 min -> Stufe 2, nach 20 min -> Stufe 3. Idempotent pro Request. */
const NOTDIENST_STAGE2_MINUTES = 10;
const NOTDIENST_STAGE3_MINUTES = 20;

export async function notdienstEscalationScan(pool, batchSize) {
  const size = Math.min(100, batchSize || 50);
  const client = await pool.connect();
  let escalated = 0;
  try {
    const now = new Date();
    const stage2Threshold = new Date(now.getTime() - NOTDIENST_STAGE2_MINUTES * 60 * 1000);
    const stage3Threshold = new Date(now.getTime() - NOTDIENST_STAGE3_MINUTES * 60 * 1000);
    const rows = await client.query(
      `SELECT id, created_at, escalation_level FROM requests
       WHERE status = 'SENT' AND sla_status = 'RUNNING' AND priority = 'NOTDIENST'
         AND capacity_id IS NOT NULL
       ORDER BY created_at ASC LIMIT $1`,
      [size]
    );
    for (const row of rows.rows) {
      const created = new Date(row.created_at);
      const lvl = row.escalation_level ?? 0;
      if (lvl >= 2) continue;
      if (lvl === 1 && created < stage3Threshold) {
        const r = await client.query("UPDATE requests SET escalation_level = 2, updated_at = NOW() WHERE id = $1 AND escalation_level = 1 RETURNING id", [row.id]);
        if (r.rowCount > 0) {
          await client.query("INSERT INTO sla_events (request_id, event_type, details) VALUES ($1, 'escalated', $2)", [row.id, JSON.stringify({ stage: 3, at: now.toISOString() })]);
          escalated++;
        }
      } else if (lvl === 0 && created < stage2Threshold) {
        const r = await client.query("UPDATE requests SET escalation_level = COALESCE(escalation_level, 0) + 1, updated_at = NOW() WHERE id = $1 AND (escalation_level IS NULL OR escalation_level = 0) RETURNING id", [row.id]);
        if (r.rowCount > 0) {
          await client.query("INSERT INTO sla_events (request_id, event_type, details) VALUES ($1, 'escalated', $2)", [row.id, JSON.stringify({ stage: 2, at: now.toISOString() })]);
          escalated++;
        }
      }
    }
  } finally {
    client.release();
  }
  return { escalated };
}
