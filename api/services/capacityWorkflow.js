/**
 * Capacity Exchange workflow: status transitions, validation rules,
 * activation requirements. Uses the same pattern as stateMachine.js.
 */

/** Allowed capacity_post status transitions */
export const CAPACITY_POST_TRANSITIONS = {
  draft:    ['active'],
  active:   ['paused', 'filled', 'expired'],
  paused:   ['active', 'archived'],
  filled:   ['archived'],
  expired:  ['active', 'archived'],  // reactivation allowed from expired
  archived: []
};

export class CapacityTransitionError extends Error {
  constructor(from, to, reason) {
    super(reason || `Invalid capacity transition: ${from} -> ${to}`);
    this.name = 'CapacityTransitionError';
    this.from = from;
    this.to = to;
  }
}

/**
 * Assert a capacity_post status transition is allowed.
 * @param {string} fromStatus
 * @param {string} toStatus
 * @throws {CapacityTransitionError}
 */
export function assertTransition(fromStatus, toStatus) {
  const allowed = CAPACITY_POST_TRANSITIONS[fromStatus];
  if (!Array.isArray(allowed) || !allowed.includes(toStatus)) {
    throw new CapacityTransitionError(fromStatus, toStatus);
  }
}

/**
 * Validate that a capacity entry meets requirements for activation.
 * @param {Object} entry - capacity_post row
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateForActivation(entry) {
  const errors = [];

  if (!entry.title || entry.title.trim().length === 0) {
    errors.push('title is required');
  }
  if (!entry.role || entry.role.trim().length === 0) {
    errors.push('role is required');
  }
  if (!entry.availability_from) {
    errors.push('availability_from date is required');
  }
  if (!entry.location_city || entry.location_city.trim().length === 0) {
    errors.push('location_city is required');
  }
  if ((entry.headcount ?? 0) < 1) {
    errors.push('headcount must be at least 1');
  }
  if (!entry.valid_until) {
    errors.push('valid_until is required for active entries');
  } else {
    const validUntil = new Date(entry.valid_until);
    if (validUntil <= new Date()) {
      errors.push('valid_until must be in the future');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Compute the is_active boolean for backward compatibility.
 * Active capacity posts = status 'active'.
 */
export function isEffectivelyActive(status) {
  return status === 'active';
}

/**
 * Determine if an entry should be auto-expired.
 * @param {Object} entry
 * @returns {boolean}
 */
export function shouldAutoExpire(entry) {
  if (entry.status !== 'active') return false;
  if (!entry.valid_until) return false;
  return new Date(entry.valid_until) < new Date();
}

/**
 * Determine if an entry is stale (needs reconfirmation).
 * @param {Object} entry
 * @param {number} staleDays - days since last confirmation before considered stale
 * @returns {boolean}
 */
export function isStale(entry, staleDays = 7) {
  if (entry.status !== 'active') return false;
  const ref = entry.last_confirmed_at || entry.updated_at || entry.created_at;
  if (!ref) return true;
  const age = (Date.now() - new Date(ref).getTime()) / (1000 * 60 * 60 * 24);
  return age > staleDays;
}
