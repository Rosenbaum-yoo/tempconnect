/**
 * Deal workflow service — manages the lifecycle of a deal (request → acceptance → fulfillment).
 * Wraps the state machine with business logic, audit logging, and notifications.
 *
 * Extended deal lifecycle:
 *   CREATED → OFFER_SENT → ACCEPTED → CONFIRMED → ASSIGNMENT_STARTED → COMPLETED
 *                           ↘ DECLINED
 *   Any non-terminal → CANCELLED
 *
 * Legacy flow (still supported):
 *   SENT → ACCEPTED → FILLED → FINALIZED
 *          ↘ DECLINED
 *   Any non-terminal → CANCELED
 */

import { assertTransition, logTransition } from "./stateMachine.js";
import * as auditLog from "./auditLog.js";
import * as eventTracking from "./eventTrackingService.js";
import { logger } from "../config/index.js";

/**
 * Accept a request — transitions from SENT → ACCEPTED.
 * @param {import('pg').Pool} pool
 * @param {string} requestId
 * @param {string} actorId - user performing the action
 * @param {Object} [opts] - { message }
 */
export async function acceptRequest(pool, requestId, actorId, opts = {}) {
  return transitionRequest(pool, requestId, "ACCEPTED", actorId, opts);
}

/**
 * Decline a request — transitions from SENT → DECLINED.
 */
export async function declineRequest(pool, requestId, actorId, opts = {}) {
  return transitionRequest(pool, requestId, "DECLINED", actorId, opts);
}

/**
 * Mark a request as filled — transitions from ACCEPTED → FILLED.
 */
export async function fillRequest(pool, requestId, actorId, opts = {}) {
  return transitionRequest(pool, requestId, "FILLED", actorId, opts);
}

/**
 * Finalize (close) a request — transitions from ACCEPTED → FINALIZED.
 */
export async function finalizeRequest(pool, requestId, actorId, opts = {}) {
  return transitionRequest(pool, requestId, "FINALIZED", actorId, opts);
}

/**
 * Cancel a request — transitions from any non-terminal status → CANCELED.
 */
export async function cancelRequest(pool, requestId, actorId, opts = {}) {
  return transitionRequest(pool, requestId, "CANCELED", actorId, opts);
}

/* ── Extended Deal Lifecycle ───────────────────────────── */

/**
 * Create a new deal (transitions to CREATED status if not set).
 */
export async function createDeal(pool, requestId, actorId, opts = {}) {
  return transitionDeal(pool, requestId, "OFFER_SENT", actorId, opts);
}

/**
 * Send an offer — transitions from CREATED → OFFER_SENT.
 */
export async function sendOffer(pool, requestId, actorId, opts = {}) {
  return transitionDeal(pool, requestId, "OFFER_SENT", actorId, opts);
}

/**
 * Confirm a deal — transitions from ACCEPTED → CONFIRMED.
 */
export async function confirmDeal(pool, requestId, actorId, opts = {}) {
  return transitionDeal(pool, requestId, "CONFIRMED", actorId, opts);
}

/**
 * Start assignment — transitions from CONFIRMED → ASSIGNMENT_STARTED.
 */
export async function startAssignment(pool, requestId, actorId, opts = {}) {
  return transitionDeal(pool, requestId, "ASSIGNMENT_STARTED", actorId, opts);
}

/**
 * Complete a deal — transitions from ASSIGNMENT_STARTED → COMPLETED.
 */
export async function completeDeal(pool, requestId, actorId, opts = {}) {
  return transitionDeal(pool, requestId, "COMPLETED", actorId, opts);
}

/* ── Internal (Extended) ──────────────────────────────── */

/**
 * Transition a deal through the extended DEAL lifecycle.
 * Falls back to legacy REQUEST transitions if the current status is in the legacy map.
 */
async function transitionDeal(pool, requestId, toStatus, actorId, opts = {}) {
  const { rows } = await pool.query(
    "SELECT status, requester_id, receiver_id FROM requests WHERE id = $1",
    [requestId]
  );
  if (!rows.length) throw Object.assign(new Error("Request not found"), { status: 404 });

  const fromStatus = rows[0].status;

  // Try DEAL transitions first, fall back to REQUEST
  try {
    assertTransition("DEAL", fromStatus, toStatus);
  } catch {
    assertTransition("REQUEST", fromStatus, toStatus);
  }

  await pool.query(
    "UPDATE requests SET status = $1, updated_at = NOW() WHERE id = $2",
    [toStatus, requestId]
  );

  await logTransition(pool, {
    entityType: "DEAL",
    from: fromStatus,
    to: toStatus,
    entity_id: requestId,
    actor_id: actorId,
    request_id: requestId,
    details: opts.message ? { message: opts.message } : undefined
  });

  // Track platform event for key deal milestones
  const eventMap = {
    OFFER_SENT: 'offer_submitted',
    COMPLETED: 'deal_completed',
    CANCELLED: 'deal_cancelled',
    ASSIGNMENT_STARTED: 'assignment_started'
  };
  if (eventMap[toStatus]) {
    eventTracking.trackEvent(pool, {
      event_type: eventMap[toStatus],
      actor_id: actorId,
      entity_type: 'request',
      entity_id: requestId,
      metadata: { from: fromStatus, to: toStatus }
    }).catch(() => {});
  }

  logger.info({ requestId, from: fromStatus, to: toStatus, actorId }, "Deal transition completed");
  return { requestId, from: fromStatus, to: toStatus };
}

/* ── Internal (Legacy) ────────────────────────────────── */

async function transitionRequest(pool, requestId, toStatus, actorId, opts = {}) {
  const { rows } = await pool.query("SELECT status FROM requests WHERE id = $1", [requestId]);
  if (!rows.length) throw Object.assign(new Error("Request not found"), { status: 404 });

  const fromStatus = rows[0].status;

  // Validate via state machine
  assertTransition("REQUEST", fromStatus, toStatus);

  // Perform the update
  await pool.query(
    "UPDATE requests SET status = $1, updated_at = NOW() WHERE id = $2",
    [toStatus, requestId]
  );

  // Audit log
  await logTransition(pool, {
    entityType: "REQUEST",
    from: fromStatus,
    to: toStatus,
    entity_id: requestId,
    actor_id: actorId,
    request_id: requestId,
    details: opts.message ? { message: opts.message } : undefined
  });

  logger.info({ requestId, from: fromStatus, to: toStatus, actorId }, "Deal transition completed");

  return { requestId, from: fromStatus, to: toStatus };
}
