import { isEmergency } from "./emergencyStaffingService.js";

function mapDemandStatus(requiredTotal, committedTotal) {
  if (committedTotal <= 0) return { status: "open", remaining: requiredTotal };
  if (committedTotal < requiredTotal) return { status: "partially_covered", remaining: requiredTotal - committedTotal };
  return { status: "fulfilled", remaining: 0 };
}

async function hasSupplierMatch(pool, demandId, supplierCompanyId) {
  const { rows } = await pool.query(
    `SELECT 1
       FROM matches m
       JOIN capacity_posts cp ON cp.id = m.capacity_post_id
      WHERE m.demand_request_id = $1
        AND cp.supplier_company_id = $2
      LIMIT 1`,
    [demandId, supplierCompanyId]
  );
  return Boolean(rows[0]);
}

async function recalcDemandCoverage(client, demandId) {
  const demandQ = await client.query(
    `SELECT id, required_total_count
       FROM demand_requests
      WHERE id = $1
      FOR UPDATE`,
    [demandId]
  );
  const demand = demandQ.rows[0];
  if (!demand) return null;

  const committedQ = await client.query(
    `SELECT COALESCE(SUM(committed_quantity), 0)::int AS total
       FROM emergency_provider_commitments
      WHERE demand_request_id = $1
        AND status = 'committed'`,
    [demandId]
  );
  const committedTotal = Number(committedQ.rows[0]?.total || 0);
  const requiredTotal = Number(demand.required_total_count || 1);
  const { status, remaining } = mapDemandStatus(requiredTotal, committedTotal);

  await client.query(
    `UPDATE demand_requests
        SET currently_committed_count = $2,
            remaining_open_count = $3,
            status = $4,
            fulfilled_at = CASE WHEN $4 = 'fulfilled' THEN COALESCE(fulfilled_at, NOW()) ELSE fulfilled_at END,
            updated_at = NOW()
      WHERE id = $1`,
    [demandId, committedTotal, remaining, status]
  );

  return { required_total_count: requiredTotal, currently_committed_count: committedTotal, remaining_open_count: remaining, status };
}

export async function listCommitments(pool, demandId) {
  const { rows } = await pool.query(
    `SELECT c.*, u.company_name AS supplier_company_name
       FROM emergency_provider_commitments c
       JOIN users u ON u.id = c.supplier_company_id
      WHERE c.demand_request_id = $1
      ORDER BY c.committed_at DESC`,
    [demandId]
  );
  return rows;
}

export async function createCommitment(pool, { demandId, supplierCompanyId, quantity, actorUserId, note }) {
  if (!Number.isInteger(quantity) || quantity <= 0) return { error: "INVALID_QUANTITY" };
  if (!(await hasSupplierMatch(pool, demandId, supplierCompanyId))) return { error: "SUPPLIER_NOT_MATCHED" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const demandQ = await client.query(
      `SELECT id, urgency, status, required_total_count, currently_committed_count, remaining_open_count, overfill_allowed
         FROM demand_requests
        WHERE id = $1
        FOR UPDATE`,
      [demandId]
    );
    const demand = demandQ.rows[0];
    if (!demand) {
      await client.query("ROLLBACK");
      return { error: "NOT_FOUND" };
    }
    if (!isEmergency(demand.urgency)) {
      await client.query("ROLLBACK");
      return { error: "NOT_EMERGENCY" };
    }
    if (!["open", "partially_covered"].includes(demand.status)) {
      await client.query("ROLLBACK");
      return { error: "NOT_OPEN" };
    }

    const remaining = Number(demand.remaining_open_count ?? (Number(demand.required_total_count || 1) - Number(demand.currently_committed_count || 0)));
    if (remaining <= 0) {
      await client.query("ROLLBACK");
      return { error: "ALREADY_FULLY_COVERED" };
    }
    if (!demand.overfill_allowed && quantity > remaining) {
      await client.query("ROLLBACK");
      return { error: "OVERFILL_NOT_ALLOWED", remaining_open_count: remaining };
    }

    const inserted = await client.query(
      `INSERT INTO emergency_provider_commitments
       (demand_request_id, supplier_company_id, committed_quantity, status, note)
       VALUES ($1, $2, $3, 'committed', $4)
       RETURNING *`,
      [demandId, supplierCompanyId, quantity, note || null]
    );

    const commitment = inserted.rows[0];
    await client.query(
      `INSERT INTO emergency_provider_commitment_events
       (commitment_id, demand_request_id, actor_user_id, event_type, new_values)
       VALUES ($1, $2, $3, 'commitment_created', $4::jsonb)`,
      [commitment.id, demandId, actorUserId || null, JSON.stringify({ committed_quantity: commitment.committed_quantity, status: commitment.status })]
    );

    const coverage = await recalcDemandCoverage(client, demandId);
    await client.query(
      `UPDATE demand_requests
          SET latest_response_at = NOW()
        WHERE id = $1`,
      [demandId]
    );

    await client.query("COMMIT");
    return { commitment, coverage };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function updateCommitmentStatus(pool, { commitmentId, actorUserId, actorRole, status, note }) {
  if (!["withdrawn", "rejected", "expired"].includes(status)) return { error: "INVALID_STATUS" };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const q = await client.query(
      `SELECT c.*, d.requester_company_id
         FROM emergency_provider_commitments c
         JOIN demand_requests d ON d.id = c.demand_request_id
        WHERE c.id = $1
        FOR UPDATE`,
      [commitmentId]
    );
    const row = q.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { error: "NOT_FOUND" };
    }
    const isSupplierOwner = row.supplier_company_id === actorUserId;
    const isRequesterOwner = row.requester_company_id === actorUserId;
    if (!(isSupplierOwner || isRequesterOwner || actorRole === "admin")) {
      await client.query("ROLLBACK");
      return { error: "FORBIDDEN" };
    }
    if (row.status !== "committed") {
      await client.query("ROLLBACK");
      return { error: "INVALID_TRANSITION", current: row.status };
    }

    const upd = await client.query(
      `UPDATE emergency_provider_commitments
          SET status = $2,
              note = COALESCE($3, note),
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [commitmentId, status, note || null]
    );
    const updated = upd.rows[0];
    await client.query(
      `INSERT INTO emergency_provider_commitment_events
       (commitment_id, demand_request_id, actor_user_id, event_type, old_values, new_values)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
      [
        updated.id,
        updated.demand_request_id,
        actorUserId || null,
        status === "withdrawn" ? "commitment_withdrawn" : status === "rejected" ? "commitment_rejected" : "commitment_expired",
        JSON.stringify({ status: row.status }),
        JSON.stringify({ status: updated.status })
      ]
    );

    const coverage = await recalcDemandCoverage(client, updated.demand_request_id);
    await client.query("COMMIT");
    return { commitment: updated, coverage };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
