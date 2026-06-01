/**
 * Requisition-Service: CRUD, State Machine, Event-Historie, Approval, Shortlist.
 * Requisitions = Bedarfsanforderungen / Suchauftraege als First-Class Enterprise-Objekt.
 */

import { assertLocationBelongsToOrg, assertDepartmentBelongsToOrg } from "../utils/orgBoundary.js";

/** Erlaubte Status-Uebergaenge
 *  PARTIALLY_FILLED: Migration 113 — einige, aber nicht alle Headcount-Positionen besetzt.
 */
export const REQUISITION_TRANSITIONS = {
  DRAFT:             ['PENDING_APPROVAL', 'OPEN', 'CANCELLED'],
  PENDING_APPROVAL:  ['APPROVED', 'CANCELLED'],
  APPROVED:          ['OPEN', 'CANCELLED'],
  OPEN:              ['IN_REVIEW', 'PARTIALLY_FILLED', 'FILLED', 'CLOSED', 'CANCELLED'],
  IN_REVIEW:         ['SHORTLISTED', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CLOSED', 'CANCELLED'],
  SHORTLISTED:       ['PARTIALLY_FILLED', 'FILLED', 'IN_REVIEW', 'CLOSED', 'CANCELLED'],
  PARTIALLY_FILLED:  ['FILLED', 'OPEN', 'IN_REVIEW', 'CLOSED', 'CANCELLED'],
  FILLED:            ['CLOSED'],
  CLOSED:            [],
  CANCELLED:         []
};

export class RequisitionTransitionError extends Error {
  constructor(from, to) {
    super(`Ungueltiger Statusuebergang: ${from} -> ${to}`);
    this.name = 'RequisitionTransitionError';
    this.from = from;
    this.to = to;
  }
}

export function assertTransition(from, to) {
  const allowed = REQUISITION_TRANSITIONS[from];
  if (!Array.isArray(allowed) || !allowed.includes(to)) {
    throw new RequisitionTransitionError(from, to);
  }
}

/* ── Event-Logging ────────────────────────────────────── */

async function writeEvent(pool, requisitionId, eventType, actorId, payload = null) {
  await pool.query(
    `INSERT INTO requisition_events (requisition_id, event_type, actor_id, payload)
     VALUES ($1, $2, $3, $4)`,
    [requisitionId, eventType, actorId, payload ? JSON.stringify(payload) : null]
  );
}

/* ── CRUD ─────────────────────────────────────────────── */

export async function createRequisition(pool, userId, data) {
  // Org-Boundary: Standort und Abteilung muessen zur eigenen Org gehoeren.
  await assertLocationBelongsToOrg(pool, data.location_id, data.org_id);
  await assertDepartmentBelongsToOrg(pool, data.department_id, data.org_id);

  const approvalRequired = data.approval_required ?? false;
  // Alle neuen Requisitions starten in DRAFT — expliziter Uebergang nach OPEN oder PENDING_APPROVAL erforderlich.
  const initialStatus = 'DRAFT';
  const { rows } = await pool.query(
    `INSERT INTO requisitions
     (org_id, created_by, assigned_to, location_id, department_id,
      title, description, role, skill_tags, headcount,
      start_date, end_date, location_city, location_postal, latitude, longitude, radius_km,
      shift_requirements, qualifications, budget_min_cents, budget_max_cents,
      urgency, priority, status, approval_required)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
     RETURNING *`,
    [
      data.org_id || null, userId, data.assigned_to || null,
      data.location_id || null, data.department_id || null,
      data.title, data.description || null, data.role,
      data.skill_tags || [], data.headcount ?? 1,
      data.start_date || null, data.end_date || null,
      data.location_city || null, data.location_postal || null,
      data.latitude ?? null, data.longitude ?? null, data.radius_km ?? 25,
      data.shift_requirements ? JSON.stringify(data.shift_requirements) : null,
      data.qualifications ? JSON.stringify(data.qualifications) : null,
      data.budget_min_cents ?? null, data.budget_max_cents ?? null,
      data.urgency || 'normal', data.priority ?? 0,
      initialStatus, approvalRequired
    ]
  );
  const req = rows[0];
  await writeEvent(pool, req.id, 'CREATED', userId, {
    title: req.title, role: req.role, headcount: req.headcount
  });
  return req;
}

export async function getRequisitionById(pool, id) {
  const { rows } = await pool.query(
    `SELECT r.*,
            u_created.email AS created_by_email, u_created.company_name AS created_by_name,
            u_assigned.email AS assigned_to_email, u_assigned.company_name AS assigned_to_name,
            ol.name AS location_name, od.name AS department_name,
            o.name AS org_name
     FROM requisitions r
     LEFT JOIN users u_created ON u_created.id = r.created_by
     LEFT JOIN users u_assigned ON u_assigned.id = r.assigned_to
     LEFT JOIN org_locations ol ON ol.id = r.location_id
     LEFT JOIN org_departments od ON od.id = r.department_id
     LEFT JOIN organizations o ON o.id = r.org_id
     WHERE r.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function listRequisitions(pool, filters = {}) {
  const params = [];
  const where = [];
  let idx = 1;

  if (filters.org_id) { where.push(`r.org_id = $${idx}`); params.push(filters.org_id); idx++; }
  if (filters.created_by) { where.push(`r.created_by = $${idx}`); params.push(filters.created_by); idx++; }
  if (filters.status) { where.push(`r.status = $${idx}`); params.push(filters.status); idx++; }
  if (filters.urgency) { where.push(`r.urgency = $${idx}`); params.push(filters.urgency); idx++; }
  if (filters.assigned_to) { where.push(`r.assigned_to = $${idx}`); params.push(filters.assigned_to); idx++; }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(100, filters.limit || 50);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT r.*, u.email AS created_by_email, u.company_name AS created_by_name,
            o.name AS org_name
     FROM requisitions r
     LEFT JOIN users u ON u.id = r.created_by
     LEFT JOIN organizations o ON o.id = r.org_id
     ${whereClause}
     ORDER BY r.priority DESC, r.created_at DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

export async function updateRequisition(pool, id, userId, data) {
  const allowed = [
    'title', 'description', 'role', 'skill_tags', 'headcount',
    'start_date', 'end_date', 'location_city', 'location_postal',
    'latitude', 'longitude', 'radius_km',
    'shift_requirements', 'qualifications', 'budget_min_cents', 'budget_max_cents',
    'urgency', 'priority', 'assigned_to', 'location_id', 'department_id'
  ];
  const fields = [];
  const values = [];
  let idx = 3;
  for (const key of allowed) {
    if (data[key] !== undefined) {
      const val = (key === 'shift_requirements' || key === 'qualifications')
        ? (data[key] ? JSON.stringify(data[key]) : null)
        : data[key];
      fields.push(`${key} = $${idx}`);
      values.push(val);
      idx++;
    }
  }
  if (fields.length === 0) return null;
  fields.push('updated_at = NOW()');

  const { rows } = await pool.query(
    `UPDATE requisitions SET ${fields.join(', ')} WHERE id = $1 AND created_by = $2 RETURNING *`,
    [id, userId, ...values]
  );
  if (rows[0]) {
    await writeEvent(pool, id, 'FIELD_CHANGED', userId, { changed_fields: Object.keys(data) });
  }
  return rows[0] || null;
}

/* ── Status-Uebergaenge ──────────────────────────────── */

export async function transitionStatus(pool, id, userId, newStatus, payload = {}) {
  const req = await getRequisitionById(pool, id);
  if (!req) return { error: 'NOT_FOUND' };
  assertTransition(req.status, newStatus);

  const extraFields = [];
  const extraValues = [];
  // Params: $1=id, $2=newStatus, $3+=extraValues (userId was previously stray $2 — bug fixed)
  let idx = 3;

  if (newStatus === 'PENDING_APPROVAL') {
    // Keine Extra-Felder
  } else if (newStatus === 'APPROVED') {
    extraFields.push(`approved_by = $${idx}`, `approved_at = NOW()`);
    extraValues.push(userId); idx++;
  } else if (newStatus === 'FILLED') {
    extraFields.push(`filled_at = NOW()`);
  } else if (newStatus === 'CLOSED') {
    extraFields.push(`closed_at = NOW()`);
  } else if (newStatus === 'CANCELLED') {
    extraFields.push(`cancelled_at = NOW()`);
    if (payload.cancel_reason) {
      extraFields.push(`cancel_reason = $${idx}`);
      extraValues.push(payload.cancel_reason); idx++;
    }
  }

  const setClause = [`status = $2`, 'updated_at = NOW()', ...extraFields].join(', ');
  const { rows } = await pool.query(
    `UPDATE requisitions SET ${setClause} WHERE id = $1 RETURNING *`,
    [id, newStatus, ...extraValues]
  );
  if (!rows[0]) return { error: 'NOT_FOUND' };

  // Statusnamen → Eventnamen (DB-Constraint erlaubt nur deklarierte Werte)
  const STATUS_TO_EVENT = {
    'PENDING_APPROVAL':  'SUBMITTED_FOR_APPROVAL',
    'APPROVED':          'APPROVED',
    'OPEN':              'OPENED',           // DB-Constraint hat 'OPENED', nicht 'OPEN'
    'IN_REVIEW':         'IN_REVIEW',
    'SHORTLISTED':       'SHORTLISTED',
    'PARTIALLY_FILLED':  'PARTIALLY_FILLED', // WAVE_16: Migration 115 erweitert CHECK-Constraint
    'FILLED':            'FILLED',
    'CLOSED':            'CLOSED',
    'CANCELLED':         'CANCELLED',
  };
  const eventType = STATUS_TO_EVENT[newStatus] || newStatus;
  await writeEvent(pool, id, eventType, userId, payload);

  return { requisition: rows[0] };
}

/** Freigabe-Kurzfunktion */
export function submitForApproval(pool, id, userId) {
  return transitionStatus(pool, id, userId, 'PENDING_APPROVAL');
}

export function approveRequisition(pool, id, approverId) {
  return transitionStatus(pool, id, approverId, 'APPROVED');
}

export function openRequisition(pool, id, userId) {
  return transitionStatus(pool, id, userId, 'OPEN');
}

export function cancelRequisition(pool, id, userId, reason) {
  return transitionStatus(pool, id, userId, 'CANCELLED', { cancel_reason: reason });
}

/* ── Events / History ────────────────────────────────── */

export async function getRequisitionEvents(pool, requisitionId) {
  const { rows } = await pool.query(
    `SELECT re.*, u.email AS actor_email, u.company_name AS actor_name
     FROM requisition_events re
     LEFT JOIN users u ON u.id = re.actor_id
     WHERE re.requisition_id = $1
     ORDER BY re.created_at ASC`,
    [requisitionId]
  );
  return rows;
}

/* ── Candidates / Shortlist ──────────────────────────── */

export async function addCandidate(pool, requisitionId, data, actorId) {
  const { rows } = await pool.query(
    `INSERT INTO requisition_candidates
     (requisition_id, capacity_post_id, supplier_org_id, match_score, match_reasons, internal_notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (requisition_id, capacity_post_id) DO UPDATE SET
       match_score = EXCLUDED.match_score, match_reasons = EXCLUDED.match_reasons, updated_at = NOW()
     RETURNING *`,
    [
      requisitionId, data.capacity_post_id || null, data.supplier_org_id || null,
      data.match_score ?? null,
      data.match_reasons ? JSON.stringify(data.match_reasons) : '[]',
      data.internal_notes || null
    ]
  );
  if (rows[0]) {
    await writeEvent(pool, requisitionId, 'CANDIDATE_ADDED', actorId, {
      candidate_id: rows[0].id, capacity_post_id: data.capacity_post_id
    });
  }
  return rows[0];
}

export async function listCandidates(pool, requisitionId) {
  const { rows } = await pool.query(
    `SELECT rc.*,
            cp.title AS capacity_title, cp.role AS capacity_role, cp.location_city AS capacity_city,
            u_supplier.company_name AS supplier_name,
            u_reviewer.email AS reviewed_by_email
     FROM requisition_candidates rc
     LEFT JOIN capacity_posts cp ON cp.id = rc.capacity_post_id
     LEFT JOIN organizations so ON so.id = rc.supplier_org_id
     LEFT JOIN users u_supplier ON u_supplier.id = cp.supplier_company_id
     LEFT JOIN users u_reviewer ON u_reviewer.id = rc.reviewed_by
     WHERE rc.requisition_id = $1
     ORDER BY rc.match_score DESC NULLS LAST, rc.created_at ASC`,
    [requisitionId]
  );
  return rows;
}

export async function updateCandidateStatus(pool, candidateId, userId, newStatus, payload = {}) {
  const extra = [];
  const values = [candidateId, newStatus, userId];
  let idx = 4;

  if (newStatus === 'shortlisted') {
    extra.push(`shortlisted_at = NOW()`);
  }
  if (newStatus === 'rejected' && payload.rejected_reason) {
    extra.push(`rejected_reason = $${idx}`);
    values.push(payload.rejected_reason); idx++;
  }
  if (['under_review', 'shortlisted', 'rejected'].includes(newStatus)) {
    extra.push(`reviewed_by = $3, reviewed_at = NOW()`);
  }
  if (payload.internal_notes !== undefined) {
    extra.push(`internal_notes = $${idx}`);
    values.push(payload.internal_notes); idx++;
  }

  const setClause = [`status = $2`, 'updated_at = NOW()', ...extra].join(', ');
  const { rows } = await pool.query(
    `UPDATE requisition_candidates SET ${setClause} WHERE id = $1 RETURNING *`,
    values
  );
  if (rows[0]) {
    const eventType = newStatus === 'shortlisted' ? 'CANDIDATE_SHORTLISTED'
      : newStatus === 'rejected' ? 'CANDIDATE_REJECTED'
      : 'CANDIDATE_ADDED';
    await writeEvent(pool, rows[0].requisition_id, eventType, userId, {
      candidate_id: candidateId, status: newStatus
    });
  }
  return rows[0] || null;
}

/** Notiz / Kommentar zu einer Requisition hinzufuegen */
export async function addComment(pool, requisitionId, userId, text) {
  await writeEvent(pool, requisitionId, 'COMMENT', userId, { text });
}
