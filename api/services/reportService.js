/**
 * Report-Service: SQL-Queries fuer User-Meldungen.
 */

/** Prueft ob der gemeldete User existiert. */
export async function userExists(pool, userId) {
  const r = await pool.query("SELECT id FROM users WHERE id=$1", [userId]);
  return !!r.rows[0];
}

/** Prueft ob Reporter und gemeldeter User an der Anfrage beteiligt sind. */
export async function validateReportRequest(pool, requestId, reporterId, reportedUserId) {
  const r = await pool.query(
    "SELECT id, requester_id, receiver_id FROM requests WHERE id=$1",
    [requestId]
  );
  if (!r.rows[0]) return { found: false };
  const rq = r.rows[0];
  const reporterIsParticipant = rq.requester_id === reporterId || rq.receiver_id === reporterId;
  const reportedIsParticipant = rq.requester_id === reportedUserId || rq.receiver_id === reportedUserId;
  return { found: true, reporterIsParticipant, reportedIsParticipant };
}

/** Erstellt eine Meldung. */
export async function submitReport(pool, { reporterId, reportedUserId, requestId, reason, comment }) {
  await pool.query(
    `INSERT INTO reports (reporter_id, reported_user_id, request_id, reason, comment)
     VALUES ($1, $2, $3, $4, $5)`,
    [reporterId, reportedUserId, requestId || null, reason, comment || null]
  );
}
