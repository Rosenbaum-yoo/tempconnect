/**
 * Assignment Service: post-deal fulfillment lifecycle.
 * Connects requisitions, suppliers, and deals to actual worker assignments.
 */

import * as auditLog from "./auditLog.js";
import { notifyAssignmentNew } from "./workerNotificationService.js";
import { withTransaction } from "../utils/transaction.js";
import { assertLocationBelongsToOrg, assertDepartmentBelongsToOrg } from "../utils/orgBoundary.js";
import { swallow } from "../utils/logger.js";
import {
  buildAssignmentActivePredicateSql,
  buildAssignmentHistoryPredicateSql,
  buildAssignmentLifecycleBucketSql,
  buildAssignmentLifecycleStateSql,
  buildAssignmentEffectiveEndDateSql,
  normalizeAssignmentLifecycleBucket
} from "./assignmentLifecycleService.js";

const VALID_TRANSITIONS = {
  planned:   ['active', 'cancelled'],
  active:    ['completed', 'cancelled', 'extended'],
  extended:  ['completed', 'cancelled'],
  completed: [],
  cancelled: []
};

/* ── Verweise bei der manuellen Anlage ─────────────────── */

/*
 * BEFUND 2026-09-13 (Welle N2.9). `POST /api/assignments` schrieb sechs
 * Fremdschluessel ungeprueft in den Einsatz — geprueft wurden nur Standort und
 * Abteilung. Wer das Anlagerecht hatte, konnte einen Einsatz an ein FREMDES
 * Angebot, einen fremden Bedarf oder eine beliebige Zeitarbeitsfirma haengen:
 * der Einsatz erschien in deren Portal (die Liste liest beide Seiten), und
 * sobald er besetzt war, zaehlte er im Handelsstand gegen die freie Kopfzahl
 * des fremden Angebots.
 *
 * Owner-Entscheid: `offer_id` und `deal_request_id` setzt NUR der
 * Deal-Abschluss (`dealAgreementService.activateAgreement`, `requests.js`) —
 * dort sind beide Seiten und die Vereinbarung geprueft. Alle uebrigen Verweise
 * muessen zur anlegenden Org gehoeren; die Zeitarbeitsfirma muss ein
 * erklaerter Partner sein.
 *
 * Fremd und nicht vorhanden sind absichtlich DIESELBE Antwort: sonst liesse
 * sich mit der Anlage abfragen, welche Kennungen es bei anderen gibt.
 */
export const NUR_UEBER_DEAL = Object.freeze(["offer_id", "deal_request_id"]);

const EIGENE_VERWEISE = Object.freeze(["requisition_id", "demand_request_id", "contract_id", "supplier_org_id"]);

// Zod laesst UUIDs in Grossbuchstaben durch, Postgres liefert sie klein. Ein
// Vergleich in JavaScript muss das ausgleichen, sonst meldet er einen Widerspruch,
// den es nicht gibt (in SQL vergleicht der uuid-Typ ohnehin ohne Gross/Klein).
const gleicheKennung = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

async function vertragGehoertZurOrg(db, orgId, contractId) {
  const { rows } = await db.query(
    "SELECT supplier_org_id FROM contracts WHERE id = $1 AND buyer_org_id = $2",
    [contractId, orgId]
  );
  return rows[0] || null;
}

/**
 * Prueft die Verweise eines neu anzulegenden Einsatzes gegen die anlegende Org.
 * @returns {null | { status: number, error: string, field: string }} null = in Ordnung
 */
export async function pruefeAnlageVerweise(db, orgId, data) {
  for (const feld of NUR_UEBER_DEAL) {
    if (data[feld]) return { status: 400, error: "LINK_VIA_DEAL_ONLY", field: feld };
  }
  const gesetzt = EIGENE_VERWEISE.filter((feld) => data[feld]);
  if (gesetzt.length === 0) return null;
  // Ohne Org gibt es nichts, wogegen ein Verweis geprueft werden koennte —
  // und ein ungepruefter Verweis ist genau der Befund.
  if (!orgId) return { status: 400, error: "ORG_CONTEXT_REQUIRED", field: gesetzt[0] };

  if (data.requisition_id) {
    const { rows } = await db.query(
      "SELECT 1 FROM requisitions WHERE id = $1 AND org_id = $2",
      [data.requisition_id, orgId]
    );
    if (!rows.length) return { status: 403, error: "ORG_BOUNDARY_VIOLATION", field: "requisition_id" };
  }

  if (data.demand_request_id) {
    // Ein Bedarf gehoert der Org seines Anlegers: ueber `users.org_id` oder
    // eine aktive Mitgliedschaft (dieselben zwei Wege wie rbacService.getPrimaryOrg).
    const { rows } = await db.query(
      `SELECT 1
         FROM demand_requests d
         JOIN users u ON u.id = d.requester_company_id
        WHERE d.id = $1
          AND (u.org_id = $2
               OR EXISTS (SELECT 1 FROM org_memberships om
                           WHERE om.user_id = u.id AND om.org_id = $2 AND om.is_active = TRUE))`,
      [data.demand_request_id, orgId]
    );
    if (!rows.length) return { status: 403, error: "ORG_BOUNDARY_VIOLATION", field: "demand_request_id" };
  }

  let vertrag = null;
  if (data.contract_id) {
    vertrag = await vertragGehoertZurOrg(db, orgId, data.contract_id);
    if (!vertrag) return { status: 403, error: "ORG_BOUNDARY_VIOLATION", field: "contract_id" };
    if (data.supplier_org_id && !gleicheKennung(vertrag.supplier_org_id, data.supplier_org_id)) {
      return { status: 400, error: "SUPPLIER_CONTRACT_MISMATCH", field: "supplier_org_id" };
    }
  }

  if (data.supplier_org_id && !gleicheKennung(data.supplier_org_id, orgId)) {
    /*
     * Partner ist, wen die Org selbst als solchen erklaert hat — im Vendor-Pool
     * (aktiv, nicht gesperrt, nicht abgelaufen), per aktivem Rahmenvertrag, oder
     * durch einen Einsatz aus einem abgeschlossenen Deal (`offer_id` gesetzt:
     * der entsteht nur ueber den geprueften Abschluss, nie ueber diesen Pfad).
     *
     * GRENZE, BENANNT: das beweist eine ERKLAERTE Beziehung, nicht die
     * Zustimmung der Zeitarbeitsfirma. Vendor-Pool und Vertrag legt die Org
     * selbst an — aber als eigene, auditierte Handlung an anderer Stelle, nicht
     * als Nebenwirkung eines einzelnen Aufrufs.
     */
    const { rows } = await db.query(
      `SELECT (
         EXISTS (SELECT 1 FROM vendor_pool vp
                  WHERE vp.client_org_id = $1 AND vp.supplier_org_id = $2
                    AND vp.status = 'active' AND vp.tier <> 'BLOCKED'
                    AND (vp.valid_until IS NULL OR vp.valid_until >= CURRENT_DATE))
         OR EXISTS (SELECT 1 FROM contracts c
                     WHERE c.buyer_org_id = $1 AND c.supplier_org_id = $2 AND c.status = 'active')
         OR EXISTS (SELECT 1 FROM assignments a
                     WHERE a.org_id = $1 AND a.supplier_org_id = $2 AND a.offer_id IS NOT NULL)
       ) AS partner`,
      [orgId, data.supplier_org_id]
    );
    if (rows[0]?.partner !== true) return { status: 403, error: "SUPPLIER_NOT_PARTNER", field: "supplier_org_id" };
  }

  return null;
}

/**
 * Nachtraegliches Setzen eines Vertrags (PATCH): der Vertrag muss der Org des
 * Einsatzes gehoeren und — falls der Einsatz schon eine Zeitarbeitsfirma hat —
 * mit genau dieser geschlossen sein.
 */
export async function pruefeVertragsVerweis(db, einsatz, contractId) {
  if (!contractId) return null;
  if (!einsatz?.org_id) return { status: 400, error: "ORG_CONTEXT_REQUIRED", field: "contract_id" };
  const vertrag = await vertragGehoertZurOrg(db, einsatz.org_id, contractId);
  if (!vertrag) return { status: 403, error: "ORG_BOUNDARY_VIOLATION", field: "contract_id" };
  if (einsatz.supplier_org_id && !gleicheKennung(vertrag.supplier_org_id, einsatz.supplier_org_id)) {
    return { status: 400, error: "SUPPLIER_CONTRACT_MISMATCH", field: "contract_id" };
  }
  return null;
}

/* ── CRUD ─────────────────────────────────────────────── */

export async function createAssignment(pool, data) {
  // Org-Boundary: Standort und Abteilung muessen zur eigenen Org gehoeren.
  await assertLocationBelongsToOrg(pool, data.location_id, data.org_id);
  await assertDepartmentBelongsToOrg(pool, data.department_id, data.org_id);

  const a = await withTransaction(pool, async (client) => {
    const requestedQuantity = Math.max(1, Number.parseInt(data.requested_quantity ?? data.worker_count ?? 1, 10) || 1);
    const staffingStatus = data.status === "cancelled"
      ? "cancelled"
      : (data.status === "completed" ? "closed" : "open");
    const { rows } = await client.query(
      `INSERT INTO assignments
       (org_id, requisition_id, supplier_org_id, deal_request_id, demand_request_id, offer_id, contract_id,
        location_id, department_id,
        worker_description, worker_count, requested_quantity, filled_quantity, reserved_quantity, open_quantity, staffing_status,
        start_date, planned_end_date, hourly_rate_cents, notes, created_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,0,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [
        data.org_id || null, data.requisition_id || null,
        data.supplier_org_id || null, data.deal_request_id || null,
        data.demand_request_id || null, data.offer_id || null,
        data.contract_id || null,
        data.location_id || null, data.department_id || null,
        data.worker_description || null,
        requestedQuantity, requestedQuantity, requestedQuantity, staffingStatus,
        data.start_date, data.planned_end_date || null,
        data.hourly_rate_cents ?? null, data.notes || null,
        data.created_by || null, data.status || 'planned'
      ]
    );
    const row = rows[0];
    await auditLog.writeAudit(client, {
      action: 'assignment.created', entity_type: 'assignment', entity_id: row.id,
      actor_id: data.created_by,
      details: { requisition_id: row.requisition_id, supplier_org_id: row.supplier_org_id }
    });
    return row;
  });

  // P12-4: Notify linked workers about new assignment (non-transactional, fire-and-forget)
  if (data.worker_user_ids && Array.isArray(data.worker_user_ids)) {
    for (const wId of data.worker_user_ids) {
      notifyAssignmentNew(pool, wId, a.id, data.client_name || null).catch(swallow("assignmentService"));
    }
  }

  return a;
}

export async function getAssignment(pool, id) {
  const assignmentEffectiveEndDateSql = buildAssignmentEffectiveEndDateSql({ assignmentAlias: "a" });
  const assignmentLifecycleStateSql = buildAssignmentLifecycleStateSql({ assignmentAlias: "a" });
  const assignmentLifecycleBucketSql = buildAssignmentLifecycleBucketSql({ assignmentAlias: "a" });
  const assignmentIsCurrentSql = buildAssignmentActivePredicateSql({ assignmentAlias: "a" });
  const assignmentIsHistorySql = buildAssignmentHistoryPredicateSql({ assignmentAlias: "a" });
  const { rows } = await pool.query(
    `SELECT a.*, o.name AS org_name, so.name AS supplier_org_name,
            r.title AS requisition_title, dr.title AS demand_title,
            dr.role AS demand_role, u.email AS created_by_email,
            ${assignmentEffectiveEndDateSql} AS assignment_effective_end_date,
            ${assignmentLifecycleStateSql} AS assignment_lifecycle_state,
            ${assignmentLifecycleBucketSql} AS assignment_lifecycle_bucket,
            ${assignmentIsCurrentSql} AS assignment_is_current,
            ${assignmentIsHistorySql} AS assignment_is_history,
            (${assignmentLifecycleStateSql} = 'ends_today') AS assignment_ends_today,
            (${assignmentLifecycleStateSql} = 'expired') AS assignment_is_expired
     FROM assignments a
     LEFT JOIN organizations o ON o.id = a.org_id
     LEFT JOIN organizations so ON so.id = a.supplier_org_id
     LEFT JOIN requisitions r ON r.id = a.requisition_id
     LEFT JOIN demand_requests dr ON dr.id = a.demand_request_id
     LEFT JOIN users u ON u.id = a.created_by
     WHERE a.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function listAssignments(pool, filters = {}) {
  const params = [];
  const where = [];
  let idx = 1;
  const lifecycleBucket = normalizeAssignmentLifecycleBucket(filters.lifecycle_bucket, null);

  if (filters.org_id) { where.push(`a.org_id = $${idx}`); params.push(filters.org_id); idx++; }
  if (filters.supplier_org_id) { where.push(`a.supplier_org_id = $${idx}`); params.push(filters.supplier_org_id); idx++; }
  if (filters.requisition_id) { where.push(`a.requisition_id = $${idx}`); params.push(filters.requisition_id); idx++; }
  if (filters.location_id) { where.push(`a.location_id = $${idx}`); params.push(filters.location_id); idx++; }
  if (filters.department_id) { where.push(`a.department_id = $${idx}`); params.push(filters.department_id); idx++; }
  if (filters.status) { where.push(`a.status = $${idx}`); params.push(filters.status); idx++; }
  if (lifecycleBucket === "active") {
    where.push(buildAssignmentActivePredicateSql({ assignmentAlias: "a" }));
  } else if (lifecycleBucket === "history") {
    where.push(buildAssignmentHistoryPredicateSql({ assignmentAlias: "a" }));
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(200, filters.limit || 100);
  params.push(limit);
  const assignmentEffectiveEndDateSql = buildAssignmentEffectiveEndDateSql({ assignmentAlias: "a" });
  const assignmentLifecycleStateSql = buildAssignmentLifecycleStateSql({ assignmentAlias: "a" });
  const assignmentLifecycleBucketSql = buildAssignmentLifecycleBucketSql({ assignmentAlias: "a" });
  const assignmentIsCurrentSql = buildAssignmentActivePredicateSql({ assignmentAlias: "a" });
  const assignmentIsHistorySql = buildAssignmentHistoryPredicateSql({ assignmentAlias: "a" });

  const { rows } = await pool.query(
    `SELECT a.*, o.name AS org_name, so.name AS supplier_org_name,
            r.title AS requisition_title, dr.title AS demand_title,
            dr.role AS demand_role,
            ${assignmentEffectiveEndDateSql} AS assignment_effective_end_date,
            ${assignmentLifecycleStateSql} AS assignment_lifecycle_state,
            ${assignmentLifecycleBucketSql} AS assignment_lifecycle_bucket,
            ${assignmentIsCurrentSql} AS assignment_is_current,
            ${assignmentIsHistorySql} AS assignment_is_history,
            (${assignmentLifecycleStateSql} = 'ends_today') AS assignment_ends_today,
            (${assignmentLifecycleStateSql} = 'expired') AS assignment_is_expired
     FROM assignments a
     LEFT JOIN organizations o ON o.id = a.org_id
     LEFT JOIN organizations so ON so.id = a.supplier_org_id
     LEFT JOIN requisitions r ON r.id = a.requisition_id
     LEFT JOIN demand_requests dr ON dr.id = a.demand_request_id
     ${whereClause}
     ORDER BY a.start_date ASC, a.created_at DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

export async function updateAssignment(pool, id, data, _actorId) {
  const allowed = [
    'worker_description', 'start_date', 'planned_end_date',
    'hourly_rate_cents', 'notes', 'contract_id',
    'location_id', 'department_id'
  ];
  const fields = [];
  const values = [id];
  let idx = 2;
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(data[key]);
      idx++;
    }
  }
  const normalizedRequestedQuantity = data.requested_quantity !== undefined
    ? data.requested_quantity
    : data.worker_count;
  if (normalizedRequestedQuantity !== undefined) {
    fields.push(`requested_quantity = $${idx}`);
    values.push(normalizedRequestedQuantity);
    idx++;
    fields.push(`worker_count = $${idx}`);
    values.push(normalizedRequestedQuantity);
    idx++;
    fields.push(`open_quantity = GREATEST($${idx - 2} - COALESCE(filled_quantity, 0) - COALESCE(reserved_quantity, 0), 0)`);
  }
  if (fields.length === 0) return null;
  fields.push('updated_at = NOW()');
  const { rows } = await pool.query(
    `UPDATE assignments SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
    values
  );
  return rows[0] || null;
}

/* ── Lifecycle ─────────────────────────────────────────── */

export async function transitionAssignment(pool, id, newStatus, actorId, opts = {}) {
  const a = await getAssignment(pool, id);
  if (!a) return { error: 'NOT_FOUND' };

  const allowed = VALID_TRANSITIONS[a.status];
  if (!allowed || !allowed.includes(newStatus)) {
    return { error: 'INVALID_TRANSITION', from: a.status, to: newStatus };
  }

  const extra = [];
  const values = [id, newStatus];
  let idx = 3;

  if (newStatus === 'completed') {
    extra.push(`completed_by = $${idx}`, 'completed_at = NOW()');
    values.push(actorId); idx++;
    if (opts.actual_end_date) {
      extra.push(`actual_end_date = $${idx}`);
      values.push(opts.actual_end_date); idx++;
    }
  } else if (newStatus === 'cancelled') {
    extra.push('cancelled_at = NOW()');
    if (opts.cancel_reason) {
      extra.push(`cancel_reason = $${idx}`);
      values.push(opts.cancel_reason); idx++;
    }
  } else if (newStatus === 'extended' && opts.planned_end_date) {
    extra.push(`planned_end_date = $${idx}`);
    values.push(opts.planned_end_date); idx++;
  }

  const setClause = ['status = $2', 'updated_at = NOW()', ...extra].join(', ');

  return withTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `UPDATE assignments SET ${setClause} WHERE id = $1 RETURNING *`,
      values
    );
    if (rows[0]) {
      await auditLog.writeAudit(client, {
        action: `assignment.${newStatus}`, entity_type: 'assignment', entity_id: id,
        actor_id: actorId, details: { from: a.status, to: newStatus }
      });
    }
    return { assignment: rows[0] };
  });
}

export async function completeAssignment(pool, id, actorId, opts = {}) {
  /*
   * ══════════════════════════════════════════════════════════════════════════
   * Z5 (2026-09-27): HIER STAND EIN ZWEITER SCHREIBER AUF supplier_reputation
   * ══════════════════════════════════════════════════════════════════════════
   *
   * `updateSupplierReputation(pool, supplier_org_id, 'completed')` rechnete aus
   * `assignments` vier Kennzahlen und schrieb sie nach
   *
   *     INSERT INTO supplier_reputation (supplier_org_id, score,
   *       completed_assignments, cancelled_assignments, total_assignments,
   *       avg_duration_days) ... ON CONFLICT (supplier_org_id)
   *
   * SECHS dieser Spalten existieren nicht, und die siebte Annahme auch nicht:
   * `supplier_reputation` ist auf `supplier_id` geschluesselt, mit
   * `NOT NULL` und einem Fremdschluessel auf `users(id)`. Eine org-geschluesselte
   * Zeile ist dort STRUKTURELL unmoeglich — es fehlten also nicht Spalten, es
   * fehlte die Tabelle, die dieser Code meinte.
   *
   * Der Wurf lief in ein leeres catch mit dem Vermerk "Non-critical". Jede
   * abgeschlossene Zuweisung hat seit immer stumm nichts aktualisiert.
   *
   * DIE TABELLE HAT EINEN EIGENTUEMER: `reputationService` (Zeile ~497) setzt
   * ALLE fuenfzehn echten Spalten in EINEM Upsert, geschluesselt auf
   * `supplier_id`. Ein zweiter Schreiber mit eigenem Schluessel und eigener
   * Skala (1–5 neben `reputation_score` 0–100) waere auch mit Spalten falsch.
   *
   * WAS DAMIT NICHT MEHR GESCHIEHT, offen gesagt: der kanonische Dienst rechnet
   * Abschluesse aus `requests` (FINALIZED/COMPLETED), nicht aus `assignments`.
   * Ein Signal "diese Agentur bringt Einsaetze zu Ende" ist heute also NICHT im
   * Score. Es war es nie — aber jetzt steht es hier, statt in einem toten Pfad
   * zu behaupten, es sei da. Gehoert es hinein, dann in den Eigentuemer der
   * Tabelle und mit einer Entscheidung ueber die Gewichtung: das verschiebt
   * Rangplaetze in einer Faehigkeit, die ab PRO verkauft wird, und ist damit
   * eine Owner-Entscheidung, keine Aufraeumarbeit.
   */
  return transitionAssignment(pool, id, 'completed', actorId, opts);
}

export function cancelAssignment(pool, id, actorId, reason) {
  return transitionAssignment(pool, id, 'cancelled', actorId, { cancel_reason: reason });
}

export function activateAssignment(pool, id, actorId) {
  return transitionAssignment(pool, id, 'active', actorId);
}
