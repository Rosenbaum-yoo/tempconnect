/**
 * Supplier scorecard: fill rate, on-time, quality, SLA breach rate. Uses supplier_metrics or computes on the fly.
 */

function computeGrade(received, breaches, avgRating, accepted) {
  if (received === 0) return "C";
  const fillRate = accepted / received;
  const breachRate = breaches / received;
  const rating = avgRating ?? 0;
  if (fillRate >= 0.7 && breachRate <= 0.1 && rating >= 4.2) return "A";
  if (fillRate >= 0.4 && breachRate <= 0.25) return "B";
  return "C";
}

export async function recomputeForWindow(pool, windowDays) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const agencies = await pool.query(
    "SELECT DISTINCT receiver_id AS agency_id FROM requests WHERE receiver_id IS NOT NULL AND created_at >= $1",
    [cutoffStr]
  );

  for (const { agency_id } of agencies.rows) {
    const received = await pool.query(
      "SELECT COUNT(*)::int AS c FROM requests WHERE receiver_id=$1 AND created_at>=$2",
      [agency_id, cutoffStr]
    );
    const accepted = await pool.query(
      "SELECT COUNT(*)::int AS c FROM requests WHERE receiver_id=$1 AND status IN ('ACCEPTED','FILLED','FINALIZED') AND created_at>=$2",
      [agency_id, cutoffStr]
    );
    const finalized = await pool.query(
      "SELECT COUNT(*)::int AS c FROM requests WHERE receiver_id=$1 AND status='FINALIZED' AND created_at>=$2",
      [agency_id, cutoffStr]
    );
    const breaches = await pool.query(
      "SELECT COUNT(*)::int AS c FROM requests WHERE receiver_id=$1 AND sla_status='BREACHED' AND created_at>=$2",
      [agency_id, cutoffStr]
    );
    const ratingsRow = await pool.query(
      "SELECT ROUND(AVG((stars + reliability + communication + quality) / 4.0)::numeric, 2) AS avg_rating FROM ratings WHERE rated_id=$1 AND created_at>=$2",
      [agency_id, cutoffStr]
    );

    const r = received.rows[0]?.c ?? 0;
    const a = accepted.rows[0]?.c ?? 0;
    const f = finalized.rows[0]?.c ?? 0;
    const b = breaches.rows[0]?.c ?? 0;
    const avg = ratingsRow.rows[0]?.avg_rating ?? null;

    await pool.query(
      `INSERT INTO supplier_metrics (agency_id, window_days, requests_received, offers_submitted, requests_accepted, requests_finalized, sla_breaches, avg_rating, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (agency_id, window_days) DO UPDATE SET
         requests_received=EXCLUDED.requests_received,
         offers_submitted=EXCLUDED.offers_submitted,
         requests_accepted=EXCLUDED.requests_accepted,
         requests_finalized=EXCLUDED.requests_finalized,
         sla_breaches=EXCLUDED.sla_breaches,
         avg_rating=EXCLUDED.avg_rating,
         updated_at=NOW()`,
      [agency_id, windowDays, r, r, a, f, b, avg]
    );
  }
  return { window_days: windowDays, agencies_updated: agencies.rows.length };
}

export async function getScorecard(pool, agencyId, windowDays = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const cached = await pool.query(
    "SELECT * FROM supplier_metrics WHERE agency_id=$1 AND window_days=$2",
    [agencyId, windowDays]
  );
  if (cached.rows[0]) {
    const m = cached.rows[0];
    const received = m.requests_received || 0;
    const accepted = m.requests_accepted || 0;
    const finalized = m.requests_finalized || 0;
    const breaches = m.sla_breaches || 0;
    return {
      agency_id: agencyId,
      window_days: windowDays,
      fill_rate: received > 0 ? Math.round((accepted / received) * 1000) / 1000 : null,
      on_time_rate: received > 0 ? Math.round(((received - breaches) / received) * 1000) / 1000 : null,
      avg_rating: m.avg_rating != null ? Number(m.avg_rating) : null,
      sla_breach_rate: received > 0 ? Math.round((breaches / received) * 1000) / 1000 : 0,
      totals: { requests_received: received, requests_accepted: accepted, requests_finalized: finalized, sla_breaches: breaches },
      grade: computeGrade(received, breaches, m.avg_rating, accepted)
    };
  }

  const received = await pool.query(
    "SELECT COUNT(*)::int AS c FROM requests WHERE receiver_id=$1 AND created_at>=$2",
    [agencyId, cutoffStr]
  );
  const accepted = await pool.query(
    "SELECT COUNT(*)::int AS c FROM requests WHERE receiver_id=$1 AND status IN ('ACCEPTED','FILLED','FINALIZED') AND created_at>=$2",
    [agencyId, cutoffStr]
  );
  const finalized = await pool.query(
    "SELECT COUNT(*)::int AS c FROM requests WHERE receiver_id=$1 AND status='FINALIZED' AND created_at>=$2",
    [agencyId, cutoffStr]
  );
  const breaches = await pool.query(
    "SELECT COUNT(*)::int AS c FROM requests WHERE receiver_id=$1 AND sla_status='BREACHED' AND created_at>=$2",
    [agencyId, cutoffStr]
  );
  const rating = await pool.query(
    "SELECT ROUND(AVG((stars + reliability + communication + quality) / 4.0)::numeric, 2) AS avg_rating FROM ratings WHERE rated_id=$1 AND created_at>=$2",
    [agencyId, cutoffStr]
  );

  const r = received.rows[0]?.c ?? 0;
  const a = accepted.rows[0]?.c ?? 0;
  const f = finalized.rows[0]?.c ?? 0;
  const b = breaches.rows[0]?.c ?? 0;
  const avg = rating.rows[0]?.avg_rating != null ? Number(rating.rows[0].avg_rating) : null;

  return {
    agency_id: agencyId,
    window_days: windowDays,
    fill_rate: r > 0 ? Math.round((a / r) * 1000) / 1000 : null,
    on_time_rate: r > 0 ? Math.round(((r - b) / r) * 1000) / 1000 : null,
    avg_rating: avg,
    sla_breach_rate: r > 0 ? Math.round((b / r) * 1000) / 1000 : 0,
    totals: { requests_received: r, requests_accepted: a, requests_finalized: f, sla_breaches: b },
    grade: computeGrade(r, b, avg, a)
  };
}
