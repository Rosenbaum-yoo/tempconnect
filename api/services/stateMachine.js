/**
 * Strict state machine guards for requests, offers, and capacity_reservations.
 * Use assertTransition() before changing status; logTransition() after successful change.
 */

import * as auditLog from "./auditLog.js";

/** Allowed transitions: fromStatus -> [toStatus, ...] */
export const REQUEST_TRANSITIONS = {
  SENT: ["ACCEPTED", "DECLINED", "CANCELED"],
  ACCEPTED: ["FINALIZED", "FILLED", "CANCELED"],
  DECLINED: [],
  FILLED: [],
  FINALIZED: [],
  CANCELED: []
};

/** Offer lifecycle: draft → sent ↔ countered → accepted|rejected|withdrawn. */
export const OFFER_TRANSITIONS = {
  draft:     ["sent", "withdrawn"],
  sent:      ["accepted", "rejected", "countered", "withdrawn"],
  countered: ["sent", "withdrawn"],
  accepted:  [],
  rejected:  [],
  withdrawn: []
};

/** capacity_reservations: active -> converted | expired; converted/expired are terminal. */
export const RESERVATION_TRANSITIONS = {
  active: ["converted", "expired"],
  converted: [],
  expired: []
};

/** Requisition Lifecycle: DRAFT -> ... -> FILLED/CLOSED/CANCELLED
 *  PARTIALLY_FILLED added in migration 113: some but not all headcount positions filled.
 */
export const REQUISITION_TRANSITIONS = {
  DRAFT:             ["PENDING_APPROVAL", "OPEN", "CANCELLED"],
  PENDING_APPROVAL:  ["APPROVED", "CANCELLED"],
  APPROVED:          ["OPEN", "CANCELLED"],
  OPEN:              ["IN_REVIEW", "PARTIALLY_FILLED", "FILLED", "CLOSED", "CANCELLED"],
  IN_REVIEW:         ["SHORTLISTED", "OPEN", "PARTIALLY_FILLED", "FILLED", "CLOSED", "CANCELLED"],
  SHORTLISTED:       ["PARTIALLY_FILLED", "FILLED", "IN_REVIEW", "CLOSED", "CANCELLED"],
  PARTIALLY_FILLED:  ["FILLED", "OPEN", "IN_REVIEW", "CLOSED", "CANCELLED"],
  FILLED:            ["CLOSED"],
  CLOSED:            [],
  CANCELLED:         []
};

/** Capacity Post Lifecycle: draft -> active -> reserved/paused/filled/expired -> archived */
export const CAPACITY_POST_TRANSITIONS = {
  draft:    ["active"],
  active:   ["paused", "filled", "expired", "reserved"],
  reserved: ["active", "filled", "archived"],
  paused:   ["active", "archived"],
  filled:   ["archived"],
  expired:  ["active", "archived"],
  archived: []
};

/** Deal Lifecycle: created -> offer_sent -> accepted -> confirmed -> assignment_started -> completed */
export const DEAL_TRANSITIONS = {
  CREATED:            ["OFFER_SENT", "CANCELLED"],
  OFFER_SENT:         ["ACCEPTED", "DECLINED", "CANCELLED"],
  ACCEPTED:           ["CONFIRMED", "CANCELLED"],
  CONFIRMED:          ["ASSIGNMENT_STARTED", "CANCELLED"],
  ASSIGNMENT_STARTED: ["COMPLETED", "CANCELLED"],
  COMPLETED:          [],
  DECLINED:           [],
  CANCELLED:          []
};

/** Submission Lifecycle: Kandidaten-Einreichung fuer Requisitions */
export const SUBMISSION_TRANSITIONS = {
  DRAFT:        ["SUBMITTED", "WITHDRAWN"],
  SUBMITTED:    ["UNDER_REVIEW", "WITHDRAWN"],
  UNDER_REVIEW: ["ACCEPTED", "REJECTED", "WITHDRAWN"],
  ACCEPTED:     [],
  REJECTED:     [],
  WITHDRAWN:    []
};

/**
 * Agreement Lifecycle (auf offers.agreement_status):
 *   none → pending_confirmation → confirmed → activated
 *   pending_confirmation/confirmed → cancelled | expired
 */
export const AGREEMENT_TRANSITIONS = {
  none:                  ["pending_confirmation"],
  pending_confirmation:  ["confirmed", "cancelled", "expired"],
  confirmed:             ["activated", "cancelled"],
  // Welle 7 – Phase 9: Aktivierte Deals duerfen explizit storniert werden.
  // Der Storno-Pfad dreht Staffing-Reservations/Invites und das Assignment
  // zurueck (siehe dealAgreementService.cancelAgreement). Ohne diese
  // Transition bleiben falsch aktivierte Deals operativ in Quarantaene.
  activated:             ["cancelled"],
  cancelled:             [],
  expired:               []
};

const MAPS = {
  REQUEST: REQUEST_TRANSITIONS,
  OFFER: OFFER_TRANSITIONS,
  RESERVATION: RESERVATION_TRANSITIONS,
  REQUISITION: REQUISITION_TRANSITIONS,
  CAPACITY_POST: CAPACITY_POST_TRANSITIONS,
  DEAL: DEAL_TRANSITIONS,
  SUBMISSION: SUBMISSION_TRANSITIONS,
  AGREEMENT: AGREEMENT_TRANSITIONS
};

export class TransitionError extends Error {
  constructor(entityType, from, to) {
    super(`Invalid transition: ${entityType} ${from} -> ${to}`);
    this.name = "TransitionError";
    this.entityType = entityType;
    this.from = from;
    this.to = to;
  }
}

/**
 * Asserts that the transition is allowed. Throws TransitionError if not.
 * @param {string} entityType - 'REQUEST' | 'OFFER' | 'RESERVATION'
 * @param {string} fromStatus - current status
 * @param {string} toStatus - desired status
 * @throws {TransitionError}
 */
export function assertTransition(entityType, fromStatus, toStatus) {
  const map = MAPS[entityType];
  if (!map) {
    throw new TransitionError(entityType, fromStatus, toStatus);
  }
  const allowed = map[fromStatus];
  if (!Array.isArray(allowed) || !allowed.includes(toStatus)) {
    throw new TransitionError(entityType, fromStatus, toStatus);
  }
}

/**
 * Logs a successful status transition to audit_log.
 * @param {import('pg').Pool} pool
 * @param {Object} opts
 * @param {string} opts.entityType - 'REQUEST' | 'OFFER' | 'RESERVATION'
 * @param {string} opts.from - previous status
 * @param {string} opts.to - new status
 * @param {string} [opts.entity_id] - request id, reservation id, etc.
 * @param {string} [opts.actor_id] - user id who performed the transition
 * @param {string} [opts.request_id]
 * @param {string} [opts.capacity_id]
 * @param {string} [opts.reservation_id]
 * @param {Object} [opts.details] - extra payload (e.g. { count } for batch)
 */
export async function logTransition(pool, opts) {
  const entityType = opts.entityType;
  const ENTITY_TYPE_MAP = {
    REQUEST: "request",
    RESERVATION: "capacity_reservation",
    AGREEMENT: "offer",
    DEAL: "request"
  };
  const entity_type = ENTITY_TYPE_MAP[entityType] || "request";
  await auditLog.writeAudit(pool, {
    action: "state_machine.transition",
    entity_type,
    entity_id: opts.entity_id ?? null,
    actor_id: opts.actor_id ?? null,
    request_id: opts.request_id ?? null,
    capacity_id: opts.capacity_id ?? null,
    reservation_id: opts.reservation_id ?? null,
    details: { from: opts.from, to: opts.to, ...(opts.details || {}) }
  });
}
