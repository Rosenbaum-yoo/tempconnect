/**
 * Mentoring-Service: Sessions erstellen, abschliessen, zaehlen.
 */

export async function createSession(pool, mentorId, menteeId, data) {
  const { rows } = await pool.query(
    `INSERT INTO mentoring_sessions (mentor_id, mentee_id, topic, description, scheduled_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [mentorId, menteeId, data.topic || "", data.description || null, data.scheduled_at || null]
  );
  return rows[0];
}

export async function completeSession(pool, sessionId, userId) {
  const { rows } = await pool.query(
    `UPDATE mentoring_sessions SET status = 'completed', completed_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND (mentor_id = $2 OR mentee_id = $2) AND status IN ('scheduled','in_progress')
     RETURNING *`,
    [sessionId, userId]
  );
  return rows[0] || null;
}

export async function cancelSession(pool, sessionId, userId) {
  const { rows } = await pool.query(
    `UPDATE mentoring_sessions SET status = 'canceled', updated_at = NOW()
     WHERE id = $1 AND (mentor_id = $2 OR mentee_id = $2) AND status IN ('scheduled','in_progress')
     RETURNING *`,
    [sessionId, userId]
  );
  return rows[0] || null;
}

export async function addFeedback(pool, sessionId, userId, feedback, rating) {
  // Determine if user is mentor or mentee
  const { rows: session } = await pool.query(
    "SELECT mentor_id, mentee_id FROM mentoring_sessions WHERE id = $1", [sessionId]
  );
  if (!session[0]) return null;
  const isMentor = session[0].mentor_id === userId;
  const field = isMentor ? "feedback_mentor" : "feedback_mentee";
  const { rows } = await pool.query(
    `UPDATE mentoring_sessions SET ${field} = $1, rating = COALESCE($2, rating), updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [feedback, rating || null, sessionId]
  );
  return rows[0] || null;
}

export async function getMentoringCount(pool, userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM mentoring_sessions
     WHERE mentor_id = $1 AND status = 'completed'`, [userId]
  );
  return rows[0]?.count || 0;
}

export async function listSessions(pool, userId, role) {
  const where = role === "mentor" ? "mentor_id = $1" : role === "mentee" ? "mentee_id = $1" : "(mentor_id = $1 OR mentee_id = $1)";
  const { rows } = await pool.query(
    `SELECT ms.*, u1.company_name AS mentor_name, u2.company_name AS mentee_name
     FROM mentoring_sessions ms
     LEFT JOIN users u1 ON u1.id = ms.mentor_id
     LEFT JOIN users u2 ON u2.id = ms.mentee_id
     WHERE ${where} ORDER BY ms.created_at DESC LIMIT 50`, [userId]
  );
  return rows;
}
