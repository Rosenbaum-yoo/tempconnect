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
import * as eventTracking from "./eventTrackingService.js";
import { dispatch } from "./notificationMatrix.js";
import { createServiceLogger, domainLogger } from "../utils/logger.js";
import { withTransaction } from "../utils/transaction.js";

const logger = createServiceLogger("dealWorkflow");

/**
 * Accept a request — transitions from SENT → ACCEPTED.
 * @param {import('pg').Pool} pool
 * @param {string} requestId
 * @param {string} actorId - user performing the action
 * @param {Object} [opts] - { message }
 */
export function acceptRequest(pool, requestId, actorId, opts = {}) {
  return transitionRequest(pool, requestId, "ACCEPTED", actorId, opts);
}

/**
 * Decline a request — transitions from SENT → DECLINED.
 */
export function declineRequest(pool, requestId, actorId, opts = {}) {
  return transitionRequest(pool, requestId, "DECLINED", actorId, opts);
}

/**
 * Mark a request as filled — transitions from ACCEPTED → FILLED.
 */
export function fillRequest(pool, requestId, actorId, opts = {}) {
  return transitionRequest(pool, requestId, "FILLED", actorId, opts);
}

/**
 * Finalize (close) a request — transitions from ACCEPTED → FINALIZED.
 */
export function finalizeRequest(pool, requestId, actorId, opts = {}) {
  return transitionRequest(pool, requestId, "FINALIZED", actorId, opts);
}

/**
 * Cancel a request — transitions from any non-terminal status → CANCELED.
 */
export function cancelRequest(pool, requestId, actorId, opts = {}) {
  return transitionRequest(pool, requestId, "CANCELED", actorId, opts);
}

/* ── Extended Deal Lifecycle ───────────────────────────── */

/**
 * Create a new deal (transitions to CREATED status if not set).
 */
export function createDeal(pool, requestId, actorId, opts = {}) {
  return transitionDeal(pool, requestId, "OFFER_SENT", actorId, opts);
}

/**
 * Send an offer — transitions from CREATED → OFFER_SENT.
 */
export function sendOffer(pool, requestId, actorId, opts = {}) {
  return transitionDeal(pool, requestId, "OFFER_SENT", actorId, opts);
}

/**
 * Confirm a deal — transitions from ACCEPTED → CONFIRMED.
 */
export function confirmDeal(pool, requestId, actorId, opts = {}) {
  return transitionDeal(pool, requestId, "CONFIRMED", actorId, opts);
}

/**
 * Start assignment — transitions from CONFIRMED → ASSIGNMENT_STARTED.
 */
export function startAssignment(pool, requestId, actorId, opts = {}) {
  return transitionDeal(pool, requestId, "ASSIGNMENT_STARTED", actorId, opts);
}

/**
 * Complete a deal — transitions from ASSIGNMENT_STARTED → COMPLETED.
 */
export function completeDeal(pool, requestId, actorId, opts = {}) {
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

  await withTransaction(pool, async (client) => {
    await client.query(
      "UPDATE requests SET status = $1, updated_at = NOW() WHERE id = $2",
      [toStatus, requestId]
    );
    await logTransition(client, {
      entityType: "DEAL",
      from: fromStatus,
      to: toStatus,
      entity_id: requestId,
      actor_id: actorId,
      request_id: requestId,
      details: opts.message ? { message: opts.message } : undefined
    });
  });

  // Non-transactional side-effects (fire-and-forget)
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

  const requesterId = rows[0].requester_id;
  const receiverId = rows[0].receiver_id;
  const notifyMap = {
    OFFER_SENT:         { event: 'deal.offer_sent',         recipients: [requesterId].filter(Boolean) },
    ACCEPTED:           { event: 'deal.accepted',           recipients: [receiverId].filter(Boolean) },
    CONFIRMED:          { event: 'deal.confirmed',          recipients: [requesterId, receiverId].filter(Boolean) },
    ASSIGNMENT_STARTED: { event: 'deal.assignment_started',  recipients: [requesterId, receiverId].filter(Boolean) },
    COMPLETED:          { event: 'deal.completed',          recipients: [requesterId, receiverId].filter(Boolean) }
  };
  const notify = notifyMap[toStatus];
  if (notify && notify.recipients.length > 0) {
    dispatch(pool, notify.event, {
      recipientUserIds: [...new Set(notify.recipients)],
      entityType: 'request',
      entityId: requestId,
      message: `Deal #${requestId.slice(0, 8)}: Status → ${toStatus}`
    }).catch(err => logger.warn({ err: err?.message, requestId }, 'Deal notification dispatch failed'));
  }

  // Domain event logging for key milestones
  if (toStatus === "COMPLETED") domainLogger.dealCompleted({ dealId: requestId, requestId, actorId });
  if (toStatus === "OFFER_SENT") domainLogger.dealCreated({ dealId: requestId, requestId, actorId, status: toStatus });

  logger.info({ requestId, from: fromStatus, to: toStatus, actorId }, "Deal transition completed");
  return { requestId, from: fromStatus, to: toStatus };
}

/* ── Internal (Legacy) ──────────────────────────────────────── */

async function transitionRequest(pool, requestId, toStatus, actorId, opts = {}) {
  const { rows } = await pool.query("SELECT status FROM requests WHERE id = $1", [requestId]);
  if (!rows.length) throw Object.assign(new Error("Request not found"), { status: 404 });

  const fromStatus = rows[0].status;

  // Validate via state machine
  assertTransition("REQUEST", fromStatus, toStatus);

  // Perform update + audit in a single transaction
  await withTransaction(pool, async (client) => {
    await client.query(
      "UPDATE requests SET status = $1, updated_at = NOW() WHERE id = $2",
      [toStatus, requestId]
    );
    await logTransition(client, {
      entityType: "REQUEST",
      from: fromStatus,
      to: toStatus,
      entity_id: requestId,
      actor_id: actorId,
      request_id: requestId,
      details: opts.message ? { message: opts.message } : undefined
    });
  });

  logger.info({ requestId, from: fromStatus, to: toStatus, actorId }, "Deal transition completed");

  return { requestId, from: fromStatus, to: toStatus };
}
