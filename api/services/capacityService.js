/**
 * Model B capacity service: search (available_effective from active reservations only),
 * reserve (no capacity change), accept (reduce available_workers + convert reservation),
 * decline (expire reservation), finalize (no capacity change), expiry batch.
 * Option A: reserve does NOT change capacities; ACCEPT reduces capacities.available_workers.
 */

import * as stateMachine from "./stateMachine.js";

const RESERVATION_TTL_MINUTES = 30;

/** Haversine-Distanz in km (fuer Umkreissuche) */
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

/**
 * Search capacities with filters. available_effective = available_workers - SUM(quantity WHERE reservations.status = 'active').
 * @param {import('pg').Pool} pool
 * @param {Object} opts - region, role, available_from, available_min, tags (array), max_rate_cents, page, limit
 * @returns {{ items: Array, total: number, page: number, limit: number }}
 */
export async function searchCapacities(pool, opts = {}) {
  const page = Math.max(1, parseInt(opts.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(opts.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const params = [];
  const where = ["c.is_active = TRUE"];

  if (opts.region) {
    params.push(opts.region);
    where.push(`c.region = $${params.length}`);
  }
  if (opts.role) {
    params.push(opts.role);
    where.push(`c.role = $${params.length}`);
  }
  if (opts.available_from) {
    params.push(opts.available_from);
    where.push(`c.available_from >= $${params.length}`);
  }
  if (opts.max_rate_cents != null) {
    params.push(opts.max_rate_cents);
    where.push(`(c.hourly_rate_cents IS NULL OR c.hourly_rate_cents <= $${params.length})`);
  }
  if (Array.isArray(opts.tags) && opts.tags.length > 0) {
    params.push(opts.tags);
    where.push(`c.tags && $${params.length}`);
  }

  const havingClause = [];
  if (opts.available_min != null && opts.available_min > 0) {
    havingClause.push("(c.available_workers - COALESCE(res.reserved, 0)) >= " + (params.length + 1));
    params.push(opts.available_min);
  }
  const havingSql = havingClause.length ? " HAVING " + havingClause.join(" AND ") : "";

  const countParams = [...params];
  const countWhere = where.join(" AND ");
  const subFrom = `
    FROM capacities c
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(r.quantity), 0)::int AS reserved
      FROM capacity_reservations r
      WHERE r.capacity_id = c.id AND r.status = 'active'
    ) res ON true
    WHERE ${countWhere}
  `;
  const countQuery = `
    SELECT COUNT(*)::int AS total
    ${subFrom}
  `;
  const countResult = await pool.query(countQuery, countParams);
  let total = countResult.rows[0]?.total ?? 0;

  if (opts.available_min != null && opts.available_min > 0) {
    params.push(opts.available_min);
    const countMinQuery = `
      SELECT COUNT(*)::int AS total
      FROM capacities c
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(r.quantity), 0)::int AS reserved
        FROM capacity_reservations r
        WHERE r.capacity_id = c.id AND r.status = 'active'
      ) res ON true
      WHERE ${countWhere} AND (c.available_workers - COALESCE(res.reserved, 0)) >= $${params.length}
    `;
    const countMinResult = await pool.query(countMinQuery, params);
    total = countMinResult.rows[0]?.total ?? 0;
  }

  params.push(limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const havingWhere =
    opts.available_min != null && opts.available_min > 0
      ? ` AND (c.available_workers - COALESCE(res.reserved, 0)) >= $${params.length - 2}`
      : "";
  const listQuery = `
    SELECT c.id, c.agency_id, c.role, c.region, c.available_from, c.available_workers,
           (c.available_workers - COALESCE(res.reserved, 0))::int AS available_effective,
           c.tags, c.hourly_rate_cents, c.note, c.is_active, c.created_at, c.updated_at,
           c.latitude, c.longitude, c.radius_km, c.city, c.postal_code,
           u.company_name AS agency_company_name
    FROM capacities c
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(r.quantity), 0)::int AS reserved
      FROM capacity_reservations r
      WHERE r.capacity_id = c.id AND r.status = 'active'
    ) res ON true
    JOIN users u ON u.id = c.agency_id
    WHERE ${countWhere}${havingWhere}
    ORDER BY c.available_from ASC, c.updated_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;
  const listResult = await pool.query(listQuery, params);
  let items = listResult.rows;

  // Post-Query Haversine-Filter fuer Umkreissuche
  if (opts.latitude != null && opts.longitude != null && opts.radius_km != null) {
    const searchLat = Number(opts.latitude);
    const searchLng = Number(opts.longitude);
    const searchRadius = Number(opts.radius_km);
    items = items.filter((r) => {
      if (r.latitude == null || r.longitude == null) return false;
      const dist = haversineKm(searchLat, searchLng, r.latitude, r.longitude);
      r._distance_km = Math.round(dist * 10) / 10;
      return dist <= Math.max(searchRadius, r.radius_km || 25);
    });
    // Naehere zuerst
    items.sort((a, b) => (a._distance_km || 0) - (b._distance_km || 0));
    total = items.length;
  }

  return {
    items: items.map((r) => ({
      id: r.id,
      agency_id: r.agency_id,
      agency_company_name: r.agency_company_name ?? null,
      role: r.role,
      region: r.region,
      available_from: r.available_from,
      available_workers: r.available_workers,
      available_effective: r.available_effective ?? r.available_workers,
      tags: r.tags ?? [],
      hourly_rate_cents: r.hourly_rate_cents,
      note: r.note,
      is_active: r.is_active,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
      radius_km: r.radius_km ?? 25,
      city: r.city ?? null,
      postal_code: r.postal_code ?? null,
      distance_km: r._distance_km ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at
    })),
    total,
    page,
    limit
  };
}

/**
 * Get single capacity by id. If inactive, only owner may see it.
 */
export async function getCapacityById(pool, capacityId, viewerUserId = null) {
  const q = `
    SELECT c.*, u.company_name AS agency_company_name,
           (c.available_workers - COALESCE(res.reserved, 0))::int AS available_effective
    FROM capacities c
    JOIN users u ON u.id = c.agency_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(r.quantity), 0)::int AS reserved
      FROM capacity_reservations r
      WHERE r.capacity_id = c.id AND r.status = 'active'
    ) res ON true
    WHERE c.id = $1
  `;
  const r = await pool.query(q, [capacityId]);
  const row = r.rows[0];
  if (!row) return null;
  if (!row.is_active && viewerUserId !== row.agency_id) return null;
  return {
    ...row,
    available_effective: row.available_effective ?? row.available_workers
  };
}

/**
 * Create capacity (agency only). Caller must enforce role === 'agency'.
 */
export async function createCapacity(pool, agencyId, data) {
  const r = await pool.query(
    `INSERT INTO capacities (agency_id, role, region, available_from, available_workers, tags, hourly_rate_cents, note, latitude, longitude, radius_km, city, postal_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      agencyId,
      data.role,
      data.region,
      data.available_from,
      data.available_workers ?? 1,
      data.tags ?? null,
      data.hourly_rate_cents ?? null,
      data.note ?? null,
      data.latitude ?? null,
      data.longitude ?? null,
      data.radius_km ?? 25,
      data.city ?? null,
      data.postal_code ?? null
    ]
  );
  const row = r.rows[0];
  const withEffective = await getCapacityById(pool, row.id, agencyId);
  return withEffective ?? row;
}

/**
 * Update capacity. Only owner may update.
 */
export async function updateCapacity(pool, capacityId, agencyId, data) {
  const fields = [];
  const values = [];
  let idx = 1;
  const allowed = [
    "role",
    "region",
    "available_from",
    "available_workers",
    "tags",
    "hourly_rate_cents",
    "note",
    "is_active",
    "latitude",
    "longitude",
    "radius_km",
    "city",
    "postal_code"
  ];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(data[key]);
      idx++;
    }
  }
  if (fields.length === 0) return getCapacityById(pool, capacityId, agencyId);

  values.push(capacityId, agencyId);
  const r = await pool.query(
    `UPDATE capacities SET ${fields.join(", ")}, updated_at = NOW()
     WHERE id = $${idx} AND agency_id = $${idx + 1}
     RETURNING *`,
    values
  );
  if (!r.rows[0]) return null;
  return getCapacityById(pool, capacityId, agencyId);
}

/**
 * Reserve capacity: lock capacity row, check effective >= quantity, insert reservation (TTL 30 min).
 * Does NOT update capacities.available_workers.
 * @returns {{ reservation, error } } error: 'NOT_FOUND' | 'INSUFFICIENT_CAPACITY'
 */
export async function reserve(pool, capacityId, quantity, requestId = null) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const cap = await client.query(
      "SELECT id, available_workers FROM capacities WHERE id = $1 FOR UPDATE",
      [capacityId]
    );
    if (!cap.rows[0]) {
      await client.query("ROLLBACK");
      return { reservation: null, error: "NOT_FOUND" };
    }

    const sumRes = await client.query(
      `SELECT COALESCE(SUM(quantity), 0)::int AS reserved
       FROM capacity_reservations
       WHERE capacity_id = $1 AND status = 'active'`,
      [capacityId]
    );
    const reserved = sumRes.rows[0]?.reserved ?? 0;
    const effective = cap.rows[0].available_workers - reserved;
    if (effective < quantity) {
      await client.query("ROLLBACK");
      return { reservation: null, error: "INSUFFICIENT_CAPACITY" };
    }

    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000);
    const ins = await client.query(
      `INSERT INTO capacity_reservations (capacity_id, request_id, quantity, expires_at, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING *`,
      [capacityId, requestId, quantity, expiresAt]
    );
    await client.query("COMMIT");
    return { reservation: ins.rows[0], error: null };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Accept request (capacity flow): lock request + capacity, convert reservation, reduce available_workers, set request ACCEPTED.
 * @returns { { request: object | null, error: string | null } }
 */
export async function acceptRequest(pool, requestId, receiverId, options = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const reqRow = await client.query(
      "SELECT id, capacity_id, quantity, status, receiver_id FROM requests WHERE id = $1 FOR UPDATE",
      [requestId]
    );
    if (!reqRow.rows[0]) {
      await client.query("ROLLBACK");
      return { request: null, error: "NOT_FOUND" };
    }
    const req = reqRow.rows[0];
    if (req.receiver_id !== receiverId) {
      await client.query("ROLLBACK");
      return { request: null, error: "FORBIDDEN" };
    }
    try {
      stateMachine.assertTransition("REQUEST", req.status, "ACCEPTED");
    } catch (e) {
      await client.query("ROLLBACK");
      return { request: null, error: "INVALID_STATE" };
    }
    if (!req.capacity_id) {
      await client.query("ROLLBACK");
      return { request: null, error: "NOT_CAPACITY_REQUEST" };
    }

    const quantity = req.quantity ?? 1;
    const capacityId = req.capacity_id;

    const capRow = await client.query(
      "SELECT id, available_workers FROM capacities WHERE id = $1 FOR UPDATE",
      [capacityId]
    );
    if (!capRow.rows[0]) {
      await client.query("ROLLBACK");
      return { request: null, error: "NOT_FOUND" };
    }

    const sumRes = await client.query(
      `SELECT COALESCE(SUM(quantity), 0)::int AS reserved
       FROM capacity_reservations
       WHERE capacity_id = $1 AND status = 'active' AND (request_id IS NULL OR request_id <> $2)`,
      [capacityId, requestId]
    );
    const reserved = sumRes.rows[0]?.reserved ?? 0;
    const effective = capRow.rows[0].available_workers - reserved;
    if (effective < quantity) {
      await client.query("ROLLBACK");
      return { request: null, error: "INSUFFICIENT_CAPACITY" };
    }

    await client.query(
      "UPDATE capacity_reservations SET status = 'converted' WHERE request_id = $1 AND status = 'active'",
      [requestId]
    );
    await client.query(
      "UPDATE capacities SET available_workers = available_workers - $1, updated_at = NOW() WHERE id = $2",
      [quantity, capacityId]
    );

    const contactEmail = options.contact_email ?? null;
    const contactPhone = options.contact_phone ?? null;
    await client.query(
      `UPDATE requests SET status = 'ACCEPTED', contact_email = COALESCE($1, contact_email), contact_phone = COALESCE($2, contact_phone), updated_at = NOW() WHERE id = $3`,
      [contactEmail, contactPhone, requestId]
    );

    const updated = await client.query("SELECT * FROM requests WHERE id = $1", [requestId]);
    await client.query("COMMIT");
    return { request: updated.rows[0], error: null };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Release reservation for a request (decline/cancel): set reservation status = 'expired', update request status.
 * Does NOT change capacities.available_workers (reserve never reduced it).
 */
export async function releaseReservationAndSetStatus(pool, requestId, newStatus, userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const reqRow = await client.query(
      "SELECT id, requester_id, receiver_id, status FROM requests WHERE id = $1 FOR UPDATE",
      [requestId]
    );
    if (!reqRow.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false, error: "NOT_FOUND" };
    }
    const req = reqRow.rows[0];
    const allowed =
      newStatus === "DECLINED"
        ? req.receiver_id === userId
        : newStatus === "CANCELED"
          ? req.requester_id === userId || req.receiver_id === userId
          : false;
    if (!allowed) {
      await client.query("ROLLBACK");
      return { ok: false, error: "FORBIDDEN" };
    }
    stateMachine.assertTransition("RESERVATION", "active", "expired");

    await client.query(
      "UPDATE capacity_reservations SET status = 'expired' WHERE request_id = $1 AND status = 'active'",
      [requestId]
    );
    await client.query("UPDATE requests SET status = $1, updated_at = NOW() WHERE id = $2", [
      newStatus,
      requestId
    ]);
    await client.query("COMMIT");
    return { ok: true, error: null };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Finalize request (deal). No capacity change (already reduced on accept).
 * Optionally set other ACCEPTED requests for same capacity to FILLED (same requester).
 */
export async function finalizeRequest(pool, requestId, requesterId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const reqRow = await client.query(
      "SELECT id, requester_id, receiver_id, status, capacity_id, listing_id FROM requests WHERE id = $1 FOR UPDATE",
      [requestId]
    );
    if (!reqRow.rows[0]) {
      await client.query("ROLLBACK");
      return { request: null, error: "NOT_FOUND" };
    }
    const req = reqRow.rows[0];
    if (req.requester_id !== requesterId) {
      await client.query("ROLLBACK");
      return { request: null, error: "FORBIDDEN" };
    }
    if (req.status !== "ACCEPTED") {
      await client.query("ROLLBACK");
      return { request: null, error: "MUST_BE_ACCEPTED_FIRST" };
    }
    stateMachine.assertTransition("REQUEST", "ACCEPTED", "FINALIZED");

    if (req.capacity_id) {
      await client.query(
        `UPDATE requests SET status = 'FILLED', updated_at = NOW()
         WHERE capacity_id = $1 AND requester_id = $2 AND status = 'ACCEPTED' AND id <> $3`,
        [req.capacity_id, requesterId, requestId]
      );
    } else {
      await client.query(
        `UPDATE requests SET status = 'FILLED', updated_at = NOW()
         WHERE listing_id = $1 AND requester_id = $2 AND status = 'ACCEPTED' AND id <> $3`,
        [req.listing_id, requesterId, requestId]
      );
    }

    await client.query("UPDATE requests SET status = 'FINALIZED', updated_at = NOW() WHERE id = $1", [
      requestId
    ]);
    const updated = await client.query("SELECT * FROM requests WHERE id = $1", [requestId]);
    await client.query("COMMIT");
    return { request: updated.rows[0], error: null };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Expiry job: set status = 'expired' for active reservations where expires_at < NOW().
 * Batch by batchSize. No capacity row update (Option A: reserve never reduced available_workers).
 */
export async function expireReservationsBatch(pool, batchSize = 100) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const sel = await client.query(
      `SELECT id, capacity_id FROM capacity_reservations
       WHERE status = 'active' AND expires_at < NOW()
       ORDER BY expires_at ASC
       LIMIT $1`,
      [batchSize]
    );
    const ids = sel.rows.map((r) => r.id);
    if (ids.length === 0) {
      await client.query("COMMIT");
      return { expired: 0 };
    }
    stateMachine.assertTransition("RESERVATION", "active", "expired");

    await client.query(
      "UPDATE capacity_reservations SET status = 'expired' WHERE id = ANY($1::uuid[])",
      [ids]
    );
    await client.query("COMMIT");
    return { expired: ids.length };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
