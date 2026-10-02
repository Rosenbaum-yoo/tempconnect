import { isEmergency } from "./emergencyStaffingService.js";
import { swallow } from "../utils/logger.js";

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

/*
 * N3.0/M5.1 (Owner-Entscheid 2026-09-19): EIN Rechner fuer die Restmenge.
 *
 * Hier stand eine eigene Rechnung, die NUR die Notdienst-Zusagen zaehlte — und
 * damit die angenommenen Angebote desselben Bedarfs ueberschrieb. Jetzt rechnet
 * `marketplaceService.syncDemandCommercialState` fuer alle Quellen zusammen
 * (Angebote, Notdienst-Zusagen ohne Angebot, Einsaetze ohne Angebot).
 * Der Rueckgabewert bleibt wortgleich, damit die Aufrufer unveraendert bleiben.
 */
async function recalcDemandCoverage(client, demandId) {
  const { syncDemandCommercialState } = await import("./marketplaceService.js");
  const bedarf = await syncDemandCommercialState(client, demandId);
  if (!bedarf) return null;
  /* `??` statt `||` (Owner-Punkt 14). `bedarf` kommt hier aus
   * `syncDemandCommercialState`, das die Rueckfallkette auf `headcount` schon
   * angewandt hat — der Wert ist also nie NULL und `|| 1` war hier wirkungslos.
   * Gewechselt wird trotzdem: `|| 1` ist das Muster, das an der Stelle weiter
   * unten den Defekt getragen hat, und ein Muster, das an einer Stelle falsch und
   * an der anderen nur zufaellig richtig ist, wird kopiert. */
  const requiredTotal = Number(bedarf.required_total_count ?? 1) || 1;
  const committedTotal = Number(bedarf.committed_headcount ?? bedarf.currently_committed_count ?? 0);
  const { status, remaining } = mapDemandStatus(requiredTotal, committedTotal);
  return {
    required_total_count: requiredTotal,
    currently_committed_count: committedTotal,
    remaining_open_count: Number(bedarf.remaining_open_count ?? remaining),
    status: bedarf.status || status
  };
}

/* Nur fuer Proben: die Neuberechnung ist intern, aber ihre Delegation an den
   einen Rechner (N3.0/M5.1) ist genau die Zusicherung dieser Welle. */
export const _FUER_PROBEN = Object.freeze({ recalcDemandCoverage });

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
      /*
       * `headcount` GEHOERT IN DIESE AUSWAHL (Owner-Punkt 14, 2026-10-02).
       *
       * Darunter stand `Number(demand.required_total_count || 1)`. Solange
       * `required_total_count` die Vorgabe 1 trug, war das unauffaellig falsch:
       * ein Bedarf ueber drei Plaetze wurde als einer gelesen. Seit Migration 229
       * die Vorgabe entfernt, ist der Wert bei einem Rohinsert NULL — und
       * `NULL || 1` ist WIEDER 1. Derselbe Fehler, nur mit anderem Grund.
       *
       * Die Rueckfallkette braucht also die Spalte, auf die sie zurueckfaellt.
       * Ohne `headcount` in der Auswahl kann sie hier gar nicht greifen, egal wie
       * sie geschrieben ist.
       */
      `SELECT id, urgency, status, headcount, required_total_count, currently_committed_count, remaining_open_count, overfill_allowed
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

    /* `??` statt `||`, und `headcount` als zweite Stufe (Owner-Punkt 14).
     * `required_total_count || 1` machte aus einer 0 UND aus NULL eine 1; jetzt
     * faellt NULL auf `headcount` zurueck, so wie der Lesepfad in
     * marketplaceService es ohnehin tut. Dieselbe Kette an beiden Stellen - zwei
     * verschiedene Ketten fuer dieselbe Frage sind auf Dauer eine Kette, und zwar
     * die schwaechere von beiden. */
    const verlangt = Number(demand.required_total_count ?? demand.headcount ?? 1) || 1;
    const remaining = Number(demand.remaining_open_count ?? (verlangt - Number(demand.currently_committed_count || 0)));
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
    await client.query("ROLLBACK").catch(swallow("emergencyCommitmentService"));
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
    await client.query("ROLLBACK").catch(swallow("emergencyCommitmentService"));
    throw e;
  } finally {
    client.release();
  }
}
