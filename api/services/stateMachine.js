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

/** No offers table in schema; no transitions allowed. */
export const OFFER_TRANSITIONS = {};

/** capacity_reservations: active -> converted | expired; converted/expired are terminal. */
export const RESERVATION_TRANSITIONS = {
  active: ["converted", "expired"],
  converted: [],
  expired: []
};

/** Requisition Lifecycle: DRAFT -> ... -> FILLED/CLOSED/CANCELLED */
export const REQUISITION_TRANSITIONS = {
  DRAFT:             ["PENDING_APPROVAL", "OPEN", "CANCELLED"],
  PENDING_APPROVAL:  ["APPROVED", "CANCELLED"],
  APPROVED:          ["OPEN", "CANCELLED"],
  OPEN:              ["IN_REVIEW", "FILLED", "CLOSED", "CANCELLED"],
  IN_REVIEW:         ["SHORTLISTED", "OPEN", "FILLED", "CLOSED", "CANCELLED"],
  SHORTLISTED:       ["FILLED", "IN_REVIEW", "CLOSED", "CANCELLED"],
  FILLED:            ["CLOSED"],
  CLOSED:            [],
  CANCELLED:         []
};

/** Capacity Post Lifecycle: draft -> active -> paused/filled/expired -> archived */
export const CAPACITY_POST_TRANSITIONS = {
  draft:    ["active"],
  active:   ["paused", "filled", "expired"],
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

const MAPS = {
  REQUEST: REQUEST_TRANSITIONS,
  OFFER: OFFER_TRANSITIONS,
  RESERVATION: RESERVATION_TRANSITIONS,
  REQUISITION: REQUISITION_TRANSITIONS,
  CAPACITY_POST: CAPACITY_POST_TRANSITIONS,
  DEAL: DEAL_TRANSITIONS,
  SUBMISSION: SUBMISSION_TRANSITIONS
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
  const entity_type =
    entityType === "REQUEST"
      ? "request"
      : entityType === "RESERVATION"
        ? "capacity_reservation"
        : "request";
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
