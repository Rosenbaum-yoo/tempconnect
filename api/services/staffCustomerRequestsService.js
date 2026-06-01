/**
 * staffCustomerRequestsService.js
 *
 * Kundenanfragen-Inbox fuer das TempConnect-Team. Datenquelle (Phase 1):
 * `strategic_collaboration_requests` (individuelles Abo, Upgrade, INDIVIDUELL,
 * Pilot-/Sonderfreigabe-Anfragen). Thread und Zuweisung leben in den
 * neuen SCC-Tabellen `staff_customer_request_messages` / `_assignments`.
 *
 * Staff-Aktionen:
 *   - listRequests(filters)          Inbox mit Status/Zuweisungs-Filter
 *   - getRequest(id)                 Detail inkl. Thread + aktuelle Zuweisung
 *   - addMessage(id, staffId, body, isInternal)
 *   - transitionStatus(id, staffId, nextStatus, reason)
 *   - assign(id, staffId, assigneeId)
 *   - release(id, staffId, reasonText)
 *
 * Kein direkter Kunden-Mail-Versand hier — das macht die Integration
 * ueber `sendMail` im Router (saubere Trennung Service / Transport).
 */

const ALLOWED_TRANSITIONS = {
  eingegangen:        ["rueckfrage_offen", "angebot_erstellt", "abgelehnt"],
  rueckfrage_offen:   ["eingegangen", "angebot_erstellt", "abgelehnt"],
  angebot_erstellt:   ["rueckfrage_offen", "bestaetigt", "abgelehnt"],
  bestaetigt:         ["aktiviert", "rueckfrage_offen"],
  aktiviert:          ["abgeschlossen"],
  abgeschlossen:      [],
  abgelehnt:          []
};

export function isValidTransition(from, to) {
  const next = ALLOWED_TRANSITIONS[String(from || "").trim()];
  if (!next) return false;
  return next.includes(String(to || "").trim());
}

export function listAllowedNextStatuses(from) {
  return ALLOWED_TRANSITIONS[String(from || "").trim()] || [];
}

export async function listRequests(pool, opts = {}) {
  const { status, assigneeStaffId, unassigned, limit = 50, offset = 0 } = opts;
  const conds = [];
  const params = [];

  if (status) { params.push(status); conds.push(`s.status = $${params.length}`); }
  if (assigneeStaffId) {
    params.push(assigneeStaffId);
    conds.push(`EXISTS (SELECT 1 FROM staff_customer_request_assignments a
                        WHERE a.request_id = s.id AND a.staff_id = $${params.length} AND a.released_at IS NULL)`);
  }
  if (unassigned === true) {
    conds.push(`NOT EXISTS (SELECT 1 FROM staff_customer_request_assignments a
                            WHERE a.request_id = s.id AND a.released_at IS NULL)`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  params.push(Math.min(200, Math.max(1, Number(limit) || 50)));
  params.push(Math.max(0, Number(offset) || 0));

  const { rows } = await pool.query(
    `SELECT s.id, s.status, s.created_at, s.updated_at,
            s.contact_email          AS requester_email,
            s.contact_name,
            s.requester_company_name,
            COALESCE(s.requester_org_id, s.target_org_id) AS org_id,
            s.request_type,
            s.plan_requested,
            s.source_context,
            (SELECT a.staff_id FROM staff_customer_request_assignments a
              WHERE a.request_id = s.id AND a.released_at IS NULL
              ORDER BY a.assigned_at DESC LIMIT 1) AS assignee_staff_id,
            (SELECT COUNT(*)::int FROM staff_customer_request_messages m
              WHERE m.request_id = s.id) AS message_count,
            (SELECT MAX(m.created_at) FROM staff_customer_request_messages m
              WHERE m.request_id = s.id) AS last_message_at
       FROM strategic_collaboration_requests s
     ${where}
     ORDER BY COALESCE(s.updated_at, s.created_at) DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

export async function getRequest(pool, requestId) {
  const { rows } = await pool.query(
    `SELECT s.*,
            (SELECT a.staff_id FROM staff_customer_request_assignments a
              WHERE a.request_id = s.id AND a.released_at IS NULL
              ORDER BY a.assigned_at DESC LIMIT 1) AS assignee_staff_id
       FROM strategic_collaboration_requests s
       WHERE s.id = $1`,
    [requestId]
  );
  if (!rows[0]) return null;

  const messages = await pool.query(
    `SELECT id, author_staff_id, is_internal, body, created_at, meta
       FROM staff_customer_request_messages
       WHERE request_id = $1
       ORDER BY created_at ASC`,
    [requestId]
  );

  return { ...rows[0], messages: messages.rows };
}

export async function addMessage(pool, { requestId, staffId, body, isInternal = true, meta = {} }) {
  const trimmed = String(body || "").trim();
  if (!trimmed) return { error: "EMPTY_BODY" };
  if (trimmed.length > 10000) return { error: "BODY_TOO_LONG" };

  const exists = await pool.query("SELECT id FROM strategic_collaboration_requests WHERE id = $1", [requestId]);
  if (!exists.rows[0]) return { error: "REQUEST_NOT_FOUND" };

  const { rows } = await pool.query(
    `INSERT INTO staff_customer_request_messages (request_id, author_staff_id, is_internal, body, meta)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, created_at, is_internal`,
    [requestId, staffId, isInternal === false ? false : true, trimmed, JSON.stringify(meta || {})]
  );
  // Touch updated_at der Quell-Anfrage
  await pool.query(
    `UPDATE strategic_collaboration_requests SET updated_at = NOW() WHERE id = $1`,
    [requestId]
  );
  return rows[0];
}

export async function transitionStatus(pool, { requestId, staffId, nextStatus, reason }) {
  const cur = await pool.query("SELECT id, status FROM strategic_collaboration_requests WHERE id = $1", [requestId]);
  const current = cur.rows[0];
  if (!current) return { error: "REQUEST_NOT_FOUND" };

  if (!isValidTransition(current.status, nextStatus)) {
    return { error: "INVALID_TRANSITION", from: current.status, to: nextStatus, allowed: listAllowedNextStatuses(current.status) };
  }

  const { rows } = await pool.query(
    `UPDATE strategic_collaboration_requests
        SET status = $1, updated_at = NOW()
        WHERE id = $2
     RETURNING id, status, updated_at`,
    [nextStatus, requestId]
  );
  // Notiz als internen Audit-Kommentar im Thread.
  await pool.query(
    `INSERT INTO staff_customer_request_messages (request_id, author_staff_id, is_internal, body, meta)
     VALUES ($1,$2, TRUE, $3, $4)`,
    [requestId, staffId, `[status] ${current.status} -> ${nextStatus}`, JSON.stringify({ reason, kind: "status_transition" })]
  );
  return rows[0];
}

export async function assign(pool, { requestId, staffId, assigneeId }) {
  const exists = await pool.query("SELECT id FROM strategic_collaboration_requests WHERE id = $1", [requestId]);
  if (!exists.rows[0]) return { error: "REQUEST_NOT_FOUND" };
  const isStaff = await pool.query(
    "SELECT user_id FROM tempconnect_staff WHERE user_id = $1 AND is_active = TRUE",
    [assigneeId]
  );
  if (!isStaff.rows[0]) return { error: "ASSIGNEE_NOT_STAFF" };

  // Alte aktive Assignment beenden, neue oeffnen.
  await pool.query(
    `UPDATE staff_customer_request_assignments
       SET released_at = NOW(), released_reason = 'reassigned'
     WHERE request_id = $1 AND released_at IS NULL`,
    [requestId]
  );
  const { rows } = await pool.query(
    `INSERT INTO staff_customer_request_assignments (request_id, staff_id, assigned_by)
     VALUES ($1,$2,$3)
     RETURNING id, assigned_at, staff_id`,
    [requestId, assigneeId, staffId]
  );
  return rows[0];
}

export async function release(pool, { requestId, staffId, reasonText }) {
  const { rowCount } = await pool.query(
    `UPDATE staff_customer_request_assignments
       SET released_at = NOW(), released_reason = $3
     WHERE request_id = $1 AND released_at IS NULL AND staff_id = $2`,
    [requestId, staffId, reasonText || null]
  );
  return { released: rowCount > 0 };
}
