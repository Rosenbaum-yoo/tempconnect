/**
 * SLA-Suchaufträge (sla_search_jobs) – persistente Suchprofile für Marketplace/SLA.
 * SLA = Prozessnachweis (Matchingversuch/Benachrichtigung), kein Erfolgsversprechen.
 */

import { PLAN } from "../config/planFeatures.js";

/** Haversine-Distanz in km (für Jobs mit Lat/Lng). */
function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(Number(lat2) - Number(lat1));
  const dLng = toRad(Number(lng2) - Number(lng1));
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(Number(lat1))) * Math.cos(toRad(Number(lat2))) *
    Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Score für Job->Capacity (ähnlich marketplaceService, aber unabhängig). */
function scoreJobAgainstCapacity(job, cap) {
  let score = 0;
  if (job.role && cap.role && job.role.toLowerCase().trim() === cap.role.toLowerCase().trim()) score += 30;
  const jTags = new Set((job.skill_tags || []).map((t) => String(t).toLowerCase().trim()));
  const cTags = new Set((cap.skill_tags || []).map((t) => String(t).toLowerCase().trim()));
  jTags.forEach((t) => { if (cTags.has(t)) score += 5; });
  if (job.location_lat != null && job.location_lng != null && cap.location_lat != null && cap.location_lng != null) {
    const dist = haversineKm(job.location_lat, job.location_lng, cap.location_lat, cap.location_lng);
    const maxR = Math.max(job.radius_km || 25, cap.radius_km || 25);
    if (dist <= maxR) score += Math.max(0, 25 - Math.floor(dist / 10));
  } else if (job.location_city && cap.location_city &&
    job.location_city.toLowerCase().trim() === cap.location_city.toLowerCase().trim()) {
    score += 15;
  }
  return score;
}

/** Score für Job->Demand (Agency sucht Aufträge). */
function scoreJobAgainstDemand(job, d) {
  let score = 0;
  if (job.role && d.role && job.role.toLowerCase().trim() === d.role.toLowerCase().trim()) score += 30;
  const jTags = new Set((job.skill_tags || []).map((t) => String(t).toLowerCase().trim()));
  const dTags = new Set((d.skill_tags || []).map((t) => String(t).toLowerCase().trim()));
  jTags.forEach((t) => { if (dTags.has(t)) score += 5; });
  if (job.location_lat != null && job.location_lng != null && d.location_lat != null && d.location_lng != null) {
    const dist = haversineKm(job.location_lat, job.location_lng, d.location_lat, d.location_lng);
    const maxR = job.radius_km || 25;
    if (dist <= maxR) score += Math.max(0, 25 - Math.floor(dist / 10));
  } else if (job.location_city && d.location_city &&
    job.location_city.toLowerCase().trim() === d.location_city.toLowerCase().trim()) {
    score += 15;
  }
  return score;
}

/* ── CRUD für sla_search_jobs ────────────────────────────────── */

export async function createSearchJob(pool, ownerId, ownerType, plan, payload) {
  const useSla = plan === PLAN.PLUS || plan === PLAN.PRO;
  const urgency = (payload.urgency || "normal").toLowerCase();
  const defaultMinutes = urgency === "notdienst" ? 30 : 120;
  const slaMinutes = useSla ? (payload.sla_minutes ?? defaultMinutes) : null;
  const now = new Date();
  const slaDueAt = useSla && slaMinutes ? new Date(now.getTime() + slaMinutes * 60 * 1000) : null;

  const { rows } = await pool.query(
    `INSERT INTO sla_search_jobs
     (owner_company_id, owner_type, target_type, title, role, skill_tags, headcount,
      location_city, location_postal, location_lat, location_lng, radius_km,
      urgency, status,
      sla_started_at, sla_minutes, sla_due_at, sla_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'open',$14,$15,$16,$17)
     RETURNING *`,
    [
      ownerId,
      ownerType,
      payload.target_type,
      payload.title,
      payload.role || null,
      payload.skill_tags || [],
      payload.headcount ?? 1,
      payload.location_city || null,
      payload.location_postal || null,
      payload.location_lat ?? null,
      payload.location_lng ?? null,
      payload.radius_km ?? 25,
      urgency,
      useSla ? now : null,
      slaMinutes,
      slaDueAt,
      useSla ? "RUNNING" : null
    ]
  );
  return rows[0];
}

export async function listSearchJobsForOwner(pool, ownerId) {
  const { rows } = await pool.query(
    `SELECT *
     FROM sla_search_jobs
     WHERE owner_company_id = $1
     ORDER BY created_at DESC`,
    [ownerId]
  );
  return rows;
}

export async function getSearchJobById(pool, id) {
  const { rows } = await pool.query(
    "SELECT * FROM sla_search_jobs WHERE id = $1",
    [id]
  );
  return rows[0] || null;
}

export async function updateSearchJob(pool, id, ownerId, data) {
  const fields = [];
  const values = [];
  let idx = 3;
  const allowed = ["title", "role", "skill_tags", "headcount", "location_city", "location_postal", "location_lat", "location_lng", "radius_km", "urgency", "sla_minutes"];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(data[key]);
      idx++;
    }
  }
  if (fields.length === 0) return null;
  fields.push("updated_at = NOW()");
  const { rows } = await pool.query(
    `UPDATE sla_search_jobs SET ${fields.join(", ")} WHERE id = $1 AND owner_company_id = $2 RETURNING *`,
    [id, ownerId, ...values]
  );
  return rows[0] || null;
}

export async function deleteSearchJob(pool, id, ownerId) {
  // Delete matches and events first, then the job
  await pool.query("DELETE FROM sla_search_matches WHERE search_job_id = $1", [id]);
  await pool.query("DELETE FROM sla_search_events WHERE search_job_id = $1", [id]);
  await pool.query("DELETE FROM match_alerts WHERE job_id = $1", [id]);
  const { rowCount } = await pool.query(
    "DELETE FROM sla_search_jobs WHERE id = $1 AND owner_company_id = $2",
    [id, ownerId]
  );
  return rowCount > 0;
}

export async function updateSearchJobStatus(pool, id, ownerId, nextStatus) {
  const allowed = ["open", "paused", "closed"];
  if (!allowed.includes(nextStatus)) throw new Error("invalid_status");
  const closeFields = nextStatus === "closed"
    ? ", closed_at = COALESCE(closed_at, NOW())"
    : "";
  const { rows } = await pool.query(
    `UPDATE sla_search_jobs
     SET status = $3, updated_at = NOW()${closeFields}
     WHERE id = $1 AND owner_company_id = $2
     RETURNING *`,
    [id, ownerId, nextStatus]
  );
  return rows[0] || null;
}

/* ── SLA-Events ──────────────────────────────────────────────── */

export async function writeSearchSlaEvent(pool, jobId, eventType, payload = {}) {
  await pool.query(
    "INSERT INTO sla_search_events (search_job_id, event_type, payload) VALUES ($1,$2,$3)",
    [jobId, eventType, typeof payload === "object" ? JSON.stringify(payload) : payload]
  );
}

export async function recordSearchSlaStarted(pool, jobId) {
  await writeSearchSlaEvent(pool, jobId, "SLA_STARTED", { at: new Date().toISOString() });
}

export async function recordSearchMatchingAttempt(pool, jobId, payload = {}) {
  const r = await pool.query(
    `UPDATE sla_search_jobs
     SET first_matching_attempt_at = COALESCE(first_matching_attempt_at, NOW()), updated_at = NOW()
     WHERE id = $1 AND first_matching_attempt_at IS NULL
     RETURNING id`,
    [jobId]
  );
  if (r.rowCount === 0) return { recorded: false };
  await writeSearchSlaEvent(pool, jobId, "MATCHING_ATTEMPT", payload);
  return { recorded: true };
}

export async function recordSearchNotificationSent(pool, jobId, payload = {}) {
  const r = await pool.query(
    `UPDATE sla_search_jobs
     SET first_notification_sent_at = COALESCE(first_notification_sent_at, NOW()), updated_at = NOW()
     WHERE id = $1 AND first_notification_sent_at IS NULL
     RETURNING id`,
    [jobId]
  );
  if (r.rowCount === 0) return { recorded: false };
  await writeSearchSlaEvent(pool, jobId, "NOTIFICATION_SENT", payload);
  return { recorded: true };
}

export async function markSearchSlaMet(pool, jobId) {
  const r = await pool.query(
    `UPDATE sla_search_jobs
     SET sla_status = 'MET', sla_met_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND sla_status = 'RUNNING'
     RETURNING id`,
    [jobId]
  );
  if (r.rowCount === 0) return { updated: false };
  await writeSearchSlaEvent(pool, jobId, "SLA_MET", { at: new Date().toISOString() });
  return { updated: true };
}

export async function getSearchSlaEvents(pool, jobId) {
  const { rows } = await pool.query(
    "SELECT id, event_type, payload, created_at FROM sla_search_events WHERE search_job_id = $1 ORDER BY created_at ASC",
    [jobId]
  );
  return rows;
}

/* ── Matching für Suchaufträge ──────────────────────────────── */

export async function runSearchMatching(pool, jobRow) {
  if (!jobRow || jobRow.status !== "open") {
    return { candidateCount: 0, matchCount: 0, matches: [] };
  }

  if (jobRow.target_type === "CAPACITY") {
    const { rows: caps } = await pool.query(
      `SELECT * FROM capacity_posts
       WHERE is_active = TRUE`
    );
    const scored = [];
    for (const cap of caps) {
      const score = scoreJobAgainstCapacity(jobRow, cap);
      if (score <= 0) continue;
      scored.push({ cap, score });
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 25);
    for (const m of top) {
      await pool.query(
        `INSERT INTO sla_search_matches (search_job_id, capacity_post_id, match_score, reasons, status)
         VALUES ($1,$2,$3,$4,'suggested')
         ON CONFLICT (search_job_id, capacity_post_id)
         DO UPDATE SET match_score = EXCLUDED.match_score, reasons = EXCLUDED.reasons, updated_at = NOW()`,
        [
          jobRow.id,
          m.cap.id,
          m.score,
          JSON.stringify([{ type: "score", value: m.score }])
        ]
      );
    }
    return { candidateCount: caps.length, matchCount: top.length, matches: top };
  }

  if (jobRow.target_type === "DEMAND") {
    const { rows: demands } = await pool.query(
      `SELECT * FROM demand_requests
       WHERE status = 'open'`
    );
    const scored = [];
    for (const d of demands) {
      const score = scoreJobAgainstDemand(jobRow, d);
      if (score <= 0) continue;
      scored.push({ demand: d, score });
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 25);
    for (const m of top) {
      await pool.query(
        `INSERT INTO sla_search_matches (search_job_id, demand_request_id, match_score, reasons, status)
         VALUES ($1,$2,$3,$4,'suggested')
         ON CONFLICT (search_job_id, demand_request_id)
         DO UPDATE SET match_score = EXCLUDED.match_score, reasons = EXCLUDED.reasons, updated_at = NOW()`,
        [
          jobRow.id,
          m.demand.id,
          m.score,
          JSON.stringify([{ type: "score", value: m.score }])
        ]
      );
    }
    return { candidateCount: demands.length, matchCount: top.length, matches: top };
  }

  return { candidateCount: 0, matchCount: 0, matches: [] };
}

export async function getSearchMatches(pool, jobId) {
  const { rows } = await pool.query(
    `SELECT m.*, 
            cp.title       AS capacity_title,
            cp.role        AS capacity_role,
            cp.location_city AS capacity_city,
            dr.title       AS demand_title,
            dr.role        AS demand_role,
            dr.location_city AS demand_city
     FROM sla_search_matches m
     LEFT JOIN capacity_posts cp ON cp.id = m.capacity_post_id
     LEFT JOIN demand_requests dr ON dr.id = m.demand_request_id
     WHERE m.search_job_id = $1
     ORDER BY m.match_score DESC NULLS LAST`,
    [jobId]
  );
  return rows;
}

/* ── Cron-Helfer: SLA-Scan & Batch-Matching ──────────────────── */

export async function searchSlaScan(pool, batchSize) {
  const size = Math.min(500, batchSize || 100);
  const { rows } = await pool.query(
    `SELECT id
     FROM sla_search_jobs
     WHERE status = 'open' AND sla_status = 'RUNNING' AND sla_due_at < NOW()
     ORDER BY sla_due_at ASC
     LIMIT $1`,
    [size]
  );
  let breached = 0;
  for (const row of rows) {
    const r = await pool.query(
      `UPDATE sla_search_jobs
       SET sla_status = 'BREACHED', sla_breached_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND sla_status = 'RUNNING'
       RETURNING id`,
      [row.id]
    );
    if (r.rowCount > 0) {
      await writeSearchSlaEvent(pool, row.id, "SLA_BREACHED", { at: new Date().toISOString() });
      breached++;
    }
  }
  return { breached };
}

export async function runSearchJobsBatch(pool, sendMail, batchSize) {
  const size = Math.min(100, batchSize || 50);
  const { rows: jobs } = await pool.query(
    `SELECT *
     FROM sla_search_jobs
     WHERE status = 'open'
     ORDER BY created_at ASC
     LIMIT $1`,
    [size]
  );
  let processed = 0;
  for (const job of jobs) {
    const { candidateCount, matchCount, matches } = await runSearchMatching(pool, job);
    await recordSearchMatchingAttempt(pool, job.id, { candidateCount, matchCount });

    let notified = 0;
    if (matchCount > 0 && typeof sendMail === "function") {
      const top = matches.slice(0, 15);
      for (const m of top) {
        try {
          let email = null;
          if (job.target_type === "CAPACITY" && m.cap) {
            const cap = m.cap;
            const u = await pool.query("SELECT email FROM users WHERE id = $1", [cap.supplier_company_id]);
            email = u.rows[0]?.email || null;
          } else if (job.target_type === "DEMAND" && m.demand) {
            const d = m.demand;
            const u = await pool.query("SELECT email FROM users WHERE id = $1", [d.requester_company_id]);
            email = u.rows[0]?.email || null;
          }
          if (!email) continue;
          const subject = job.target_type === "CAPACITY"
            ? "TempConnect: Neuer Suchauftrag – Personal passt"
            : "TempConnect: Neuer Suchauftrag – Nachfrage passt";
          const html = job.target_type === "CAPACITY"
            ? `<h2>Suchauftrag eines Unternehmens</h2>
               <p>Ein Suchauftrag passt zu einem deiner Personalangebote.</p>
               <p><b>Suchauftrag:</b> ${job.title} – ${job.role || ""}, ${job.location_city || ""}</p>
               <p style="margin-top:12px;font-size:13px;color:#9ca3af">Hinweis: Dies ist ein Matching-Versuch im Rahmen eines SLA-Prozesses. Es wird kein Vermittlungserfolg zugesagt.</p>`
            : `<h2>Suchauftrag einer Agentur</h2>
               <p>Ein Suchauftrag passt zu deiner Nachfrage im Marketplace.</p>
               <p><b>Suchauftrag:</b> ${job.title} – ${job.role || ""}, ${job.location_city || ""}</p>
               <p style="margin-top:12px;font-size:13px;color:#9ca3af">Hinweis: Dies ist ein Matching-Versuch im Rahmen eines SLA-Prozesses. Es wird kein Vermittlungserfolg zugesagt.</p>`;
          const sent = await sendMail(email, subject, html);
          if (sent) notified++;
        } catch {
          // E-Mail-Fehler werden bewusst nur geloggt vom Caller.
        }
      }
    }

    if (notified > 0) {
      await recordSearchNotificationSent(pool, job.id, { notifiedCount: notified });
    }

    // Match-Alert erzeugen wenn neue Matches
    if (matchCount > 0) {
      await createMatchAlert(pool, job.owner_company_id, job.id, matchCount);
    }

    if (job.sla_status === "RUNNING" && job.sla_due_at && matchCount > 0) {
      if (new Date() <= new Date(job.sla_due_at)) {
        await markSearchSlaMet(pool, job.id);
      }
    }

    processed++;
  }
  return { processed };
}

/* ── Match Alerts ───────────────────────────────────────────── */

export async function createMatchAlert(pool, userId, jobId, matchCount) {
  await pool.query(
    `INSERT INTO match_alerts (user_id, job_id, match_count) VALUES ($1,$2,$3)`,
    [userId, jobId, matchCount]
  );
}

export async function getUnreadAlerts(pool, userId) {
  const { rows } = await pool.query(
    `SELECT ma.*, sj.title AS job_title, sj.role AS job_role, sj.location_city AS job_city
     FROM match_alerts ma
     JOIN sla_search_jobs sj ON sj.id = ma.job_id
     WHERE ma.user_id = $1 AND ma.is_read = FALSE
     ORDER BY ma.created_at DESC
     LIMIT 50`,
    [userId]
  );
  return rows;
}

export async function getUnreadAlertCount(pool, userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM match_alerts WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  );
  return rows[0]?.count || 0;
}

export async function markAlertRead(pool, alertId, userId) {
  const { rows } = await pool.query(
    `UPDATE match_alerts SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *`,
    [alertId, userId]
  );
  return rows[0] || null;
}

export async function markAllAlertsRead(pool, userId) {
  const { rowCount } = await pool.query(
    `UPDATE match_alerts SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  );
  return { updated: rowCount };
}

