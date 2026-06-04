/**
 * Request-Service: Anfragen-CRUD, Listen, Status, Broadcast, Compliance.
 */

import * as stateMachine from "./stateMachine.js";

/* ── Lookup-Helpers (Validierung + E-Mail-Kontext) ─────────── */

export async function getActiveCapacity(pool, capacityId) {
  const { rows } = await pool.query(
    "SELECT id, agency_id FROM capacities WHERE id=$1 AND is_active=TRUE", [capacityId]
  );
  return rows[0] || null;
}

export async function getActiveListing(pool, listingId) {
  const { rows } = await pool.query(
    "SELECT id, owner_id, type FROM listings WHERE id=$1 AND is_active=TRUE", [listingId]
  );
  return rows[0] || null;
}

export async function getUserContact(pool, userId) {
  const { rows } = await pool.query(
    "SELECT email, company_name, phone FROM users WHERE id=$1", [userId]
  );
  return rows[0] || null;
}

export async function getListingMeta(pool, listingId) {
  const { rows } = await pool.query(
    "SELECT category, region FROM listings WHERE id=$1", [listingId]
  );
  return rows[0] || null;
}

export async function getCapacityMeta(pool, capacityId) {
  const { rows } = await pool.query(
    "SELECT role, region FROM capacities WHERE id=$1", [capacityId]
  );
  return rows[0] || null;
}

/* ── Request CRUD ──────────────────────────────────────────── */

export async function createCapacityRequest(pool, p) {
  const { rows } = await pool.query(
    `INSERT INTO requests (listing_id, capacity_id, requester_id, receiver_id, message, priority,
      role, quantity, location_text, region, start_date, end_date, duration_days, shift_schedule,
      qualification_tags, required_certifications, max_hourly_rate_cents, urgency, notes, contact_email, contact_phone,
      sla_minutes, sla_respond_by, sla_started_at, sla_status)
     VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW(), 'RUNNING')
     RETURNING *`,
    [
      p.capacity_id, p.requester_id, p.receiver_id, p.message ?? null, p.priority,
      p.role ?? null, p.quantity ?? 1, p.location_text ?? null, p.region ?? null,
      p.start_date ?? null, p.end_date ?? null, p.duration_days ?? null,
      p.shift_schedule ? JSON.stringify(p.shift_schedule) : null,
      p.qualification_tags ?? null, p.required_certifications ?? null,
      p.max_hourly_rate_cents ?? null, p.urgency ?? null, p.notes ?? null,
      p.contact_email ?? null, p.contact_phone ?? null,
      p.sla_minutes, p.sla_respond_by
    ]
  );
  return rows[0];
}

export async function createListingRequest(pool, p) {
  const { rows } = await pool.query(
    `INSERT INTO requests (listing_id, requester_id, receiver_id, message, priority)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [p.listing_id, p.requester_id, p.receiver_id, p.message || null, p.priority]
  );
  return rows[0];
}

export async function getRequestById(pool, id) {
  const { rows } = await pool.query(
    "SELECT id, requester_id, receiver_id, listing_id, capacity_id, status FROM requests WHERE id=$1",
    [id]
  );
  return rows[0] || null;
}

export async function getFullRequest(pool, id) {
  const { rows } = await pool.query("SELECT * FROM requests WHERE id=$1", [id]);
  return rows[0] || null;
}

export async function getRequestDetail(pool, id) {
  const { rows } = await pool.query(
    `SELECT r.*, l.category AS listing_category, l.region AS listing_region,
            c.role AS capacity_role, c.region AS capacity_region,
            u_req.company_name AS requester_company, u_recv.company_name AS receiver_company
     FROM requests r
     LEFT JOIN listings l ON l.id = r.listing_id
     LEFT JOIN capacities c ON c.id = r.capacity_id
     LEFT JOIN users u_req ON u_req.id = r.requester_id
     LEFT JOIN users u_recv ON u_recv.id = r.receiver_id
     WHERE r.id=$1`,
    [id]
  );
  return rows[0] || null;
}

export async function getRequestComplianceAndEvents(pool, id) {
  const [compliance, events] = await Promise.all([
    pool.query("SELECT status AS compliance_status, reasons AS compliance_reasons FROM request_compliance WHERE request_id=$1", [id]),
    pool.query("SELECT id, event_type, details, created_at FROM sla_events WHERE request_id=$1 ORDER BY created_at ASC", [id])
  ]);
  return {
    compliance_status: compliance.rows[0]?.compliance_status ?? null,
    compliance_reasons: compliance.rows[0]?.compliance_reasons ?? [],
    sla_events: events.rows
  };
}

export async function getRequestSla(pool, id) {
  const { rows } = await pool.query(
    "SELECT id, sla_minutes, sla_respond_by, sla_status FROM requests WHERE id=$1", [id]
  );
  return rows[0] || null;
}

/* ── Request-Listen ────────────────────────────────────────── */

const SENT_QUERY = `
  SELECT r.id, r.listing_id, r.capacity_id, r.status, r.priority, r.message, r.created_at,
         r.contact_email, r.contact_phone, r.receiver_id,
         r.role, r.quantity, r.location_text, r.region, r.start_date, r.end_date, r.duration_days,
         r.shift_schedule, r.qualification_tags, r.required_certifications, r.max_hourly_rate_cents, r.urgency, r.notes,
         r.sla_minutes, r.sla_respond_by, r.sla_status, r.sla_breached_at,
         rc.status AS compliance_status, rc.reasons AS compliance_reasons,
         l.category AS listing_category, l.region AS listing_region,
         c.role AS capacity_role, c.region AS capacity_region,
         u.email AS receiver_email, u.company_name AS receiver_company, u.phone AS receiver_phone,
         (SELECT COUNT(*) FROM ratings rt WHERE rt.request_id = r.id AND rt.rater_id = $1) > 0 AS has_rated,
         COALESCE(rs.avg_rating, 0) AS partner_avg_rating,
         COALESCE(rs.rating_count, 0)::int AS partner_rating_count
  FROM requests r
  LEFT JOIN request_compliance rc ON rc.request_id = r.id
  LEFT JOIN listings l ON l.id = r.listing_id
  LEFT JOIN capacities c ON c.id = r.capacity_id
  JOIN users u ON u.id = r.receiver_id
  LEFT JOIN (SELECT rated_id, ROUND(AVG(stars)::numeric, 1) AS avg_rating, COUNT(*) AS rating_count FROM ratings GROUP BY rated_id) rs ON rs.rated_id = r.receiver_id
  WHERE r.requester_id=$1
  ORDER BY r.created_at DESC
  LIMIT 200
`;

export async function getSentRequests(pool, userId) {
  const { rows } = await pool.query(SENT_QUERY, [userId]);
  return rows;
}

const RECEIVED_QUERY = `
  SELECT r.id, r.listing_id, r.capacity_id, r.status, r.priority, r.message, r.created_at,
         r.contact_email, r.contact_phone, r.requester_id,
         r.role, r.quantity, r.location_text, r.region, r.start_date, r.end_date, r.duration_days,
         r.shift_schedule, r.qualification_tags, r.required_certifications, r.max_hourly_rate_cents, r.urgency, r.notes,
         r.sla_minutes, r.sla_respond_by, r.sla_status, r.sla_breached_at,
         rc.status AS compliance_status, rc.reasons AS compliance_reasons,
         l.category AS listing_category, l.region AS listing_region,
         c.role AS capacity_role, c.region AS capacity_region,
         u.email AS requester_email, u.company_name AS requester_company, u.phone AS requester_phone,
         (SELECT COUNT(*) FROM ratings rt WHERE rt.request_id = r.id AND rt.rater_id = $1) > 0 AS has_rated,
         COALESCE(rs.avg_rating, 0) AS partner_avg_rating,
         COALESCE(rs.rating_count, 0)::int AS partner_rating_count
  FROM requests r
  LEFT JOIN request_compliance rc ON rc.request_id = r.id
  LEFT JOIN listings l ON l.id = r.listing_id
  LEFT JOIN capacities c ON c.id = r.capacity_id
  JOIN users u ON u.id = r.requester_id
  LEFT JOIN (SELECT rated_id, ROUND(AVG(stars)::numeric, 1) AS avg_rating, COUNT(*) AS rating_count FROM ratings GROUP BY rated_id) rs ON rs.rated_id = r.requester_id
  WHERE r.receiver_id=$1
  ORDER BY r.created_at DESC
  LIMIT 200
`;

export async function getReceivedRequests(pool, userId) {
  const { rows } = await pool.query(RECEIVED_QUERY, [userId]);
  return rows;
}

/** Admin/backoffice overview across all requests (tenant-agnostic admin view). */
export async function listRequestsAdmin(pool, opts = {}) {
  const limit = Math.min(200, Math.max(1, Number(opts.limit || 50)));
  const offset = Math.max(0, Number(opts.offset || 0));
  const status = opts.status ? String(opts.status).trim().toUpperCase() : null;

  const params = [];
  let where = "";
  if (status) {
    params.push(status);
    where = `WHERE r.status = $${params.length}`;
  }
  params.push(limit, offset);
  const limIdx = params.length - 1;
  const offIdx = params.length;

  const { rows } = await pool.query(
    `SELECT r.id, r.status, r.priority, r.created_at, r.updated_at,
            r.requester_id, r.receiver_id, r.listing_id, r.capacity_id,
            r.role, r.quantity, r.region, r.start_date, r.end_date,
            u_req.company_name AS requester_company, u_req.email AS requester_email,
            u_recv.company_name AS receiver_company, u_recv.email AS receiver_email
       FROM requests r
       LEFT JOIN users u_req ON u_req.id = r.requester_id
       LEFT JOIN users u_recv ON u_recv.id = r.receiver_id
       ${where}
      ORDER BY r.created_at DESC
      LIMIT $${limIdx} OFFSET $${offIdx}`,
    params
  );
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM requests r ${where}`,
    status ? [status] : []
  );
  return { items: rows, total: countRows[0]?.total || 0 };
}

/* ── Status-Updates ────────────────────────────────────────── */

export async function updateRequestStatus(pool, id, status, contactEmail, contactPhone) {
  if (status === "ACCEPTED" && contactEmail) {
    const { rows } = await pool.query(
      "UPDATE requests SET status=$1, contact_email=$2, contact_phone=$3, updated_at=NOW() WHERE id=$4 RETURNING *",
      [status, contactEmail, contactPhone || null, id]
    );
    return rows[0];
  }
  const { rows } = await pool.query(
    "UPDATE requests SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *",
    [status, id]
  );
  return rows[0];
}

export async function fillRelatedRequests(pool, listingId, requesterId, excludeId) {
  stateMachine.assertTransition("REQUEST", "ACCEPTED", "FILLED");
  await pool.query(
    `UPDATE requests SET status='FILLED', updated_at=NOW()
     WHERE listing_id=$1 AND requester_id=$2 AND status='ACCEPTED' AND id <> $3`,
    [listingId, requesterId, excludeId]
  );
}

/* ── Broadcast ─────────────────────────────────────────────── */

export async function findBroadcastTargets(pool, userId, allowedType, filters) {
  const params = [];
  const where = ["l.is_active=TRUE", "l.owner_id <> $1"];
  params.push(userId);
  params.push(allowedType);
  where.push(`l.type=$${params.length}`);
  if (filters.category) { params.push(`%${filters.category}%`); where.push(`l.category ILIKE $${params.length}`); }
  if (filters.region) { params.push(`%${filters.region}%`); where.push(`l.region ILIKE $${params.length}`); }
  if (filters.notdienst_only) where.push("l.notdienst=TRUE");
  const minQty = Number(filters.min_qty || 1);
  if (minQty > 1) { params.push(minQty); where.push(`l.qty >= $${params.length}`); }
  const centerLat = filters.center_lat != null ? parseFloat(filters.center_lat) : NaN;
  const centerLng = filters.center_lng != null ? parseFloat(filters.center_lng) : NaN;
  const radiusKm = filters.radius_km != null ? parseFloat(filters.radius_km) : NaN;
  const useRadius = !Number.isNaN(centerLat) && !Number.isNaN(centerLng) && !Number.isNaN(radiusKm) && radiusKm > 0;
  if (useRadius) {
    params.push(centerLat, centerLng, radiusKm);
    const clat = params.length - 2;
    const clng = params.length - 1;
    const rkm = params.length;
    where.push(`((l.latitude IS NULL OR l.longitude IS NULL) OR (6371 * acos(least(1, greatest(-1, cos(radians(l.latitude)) * cos(radians($${clat})) * cos(radians($${clng}) - radians(l.longitude)) + sin(radians(l.latitude)) * sin(radians($${clat}))))) <= $${rkm}))`);
  }
  const q = `
    SELECT l.id AS listing_id, l.owner_id AS receiver_id, l.qty, l.category, l.region
    FROM listings l
    WHERE ${where.join(" AND ")}
    ORDER BY l.notdienst DESC, l.qty DESC, l.updated_at DESC
    LIMIT 50
  `;
  const { rows } = await pool.query(q, params);
  return rows;
}

export async function insertBroadcastRequest(pool, listingId, requesterId, receiverId, message, priority) {
  await pool.query(
    `INSERT INTO requests (listing_id, requester_id, receiver_id, message, priority)
     VALUES ($1,$2,$3,$4,$5)`,
    [listingId, requesterId, receiverId, message || null, priority]
  );
}

/* ── Compliance-Policies ───────────────────────────────────── */

export async function createCompliancePolicy(pool, companyId, data) {
  await pool.query(
    `INSERT INTO compliance_policies (company_id, role_pattern, required_fields, required_certifications, strict_mode, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [companyId, data.role_pattern, JSON.stringify(data.required_fields || []), JSON.stringify(data.required_certifications || []), data.strict_mode]
  );
  const { rows } = await pool.query(
    "SELECT * FROM compliance_policies WHERE company_id=$1 ORDER BY updated_at DESC LIMIT 1",
    [companyId]
  );
  return rows[0];
}

/* ── Reservierungen ────────────────────────────────────────── */

export async function linkReservationToRequest(pool, requestId, reservationId) {
  await pool.query(
    "UPDATE capacity_reservations SET request_id=$1 WHERE id=$2",
    [requestId, reservationId]
  );
}

export async function getReservationByStatus(pool, requestId, status) {
  const { rows } = await pool.query(
    "SELECT id FROM capacity_reservations WHERE request_id=$1 AND status=$2 ORDER BY created_at DESC LIMIT 1",
    [requestId, status]
  );
  return rows[0] || null;
}

/** Für Reserve-Flow: Request-Zeile mit id, requester_id, capacity_id, status, quantity. */
export async function getRequestForReserve(pool, requestId) {
  const { rows } = await pool.query(
    "SELECT id, requester_id, capacity_id, status, quantity FROM requests WHERE id=$1",
    [requestId]
  );
  return rows[0] || null;
}

/** Prüft, ob für die Anfrage bereits eine aktive Reservierung existiert. */
export async function hasActiveReservationForRequest(pool, requestId) {
  const { rows } = await pool.query(
    "SELECT id FROM capacity_reservations WHERE request_id=$1 AND status='active'",
    [requestId]
  );
  return rows.length > 0;
}
