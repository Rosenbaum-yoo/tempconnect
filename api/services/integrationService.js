/**
 * Integration Service: CRUD for org_integrations + event dispatch pipeline.
 * All operations are org-scoped. Webhook URLs are never exposed in list responses.
 * Delivery logging, HMAC-SHA256 signing, retry mechanism.
 */

import crypto from "crypto";
import { logger } from "../config/index.js";
import { sendIntegrationEvent } from "./integrationAdapters.js";

/* ── Supported Events ────────────────────────────────────── */

export const SUPPORTED_EVENTS = [
  // Offers
  'offer.received',
  'offer.accepted',
  'offer.rejected',
  // Requisitions
  'requisition.submitted_for_approval',
  'requisition.approved',
  'requisition.rejected',
  'requisition.filled',
  'requisition.cancelled',
  // Deals & Assignments
  'deal.completed',
  'assignment.starting_soon',
  'assignment.completed',
  // Capacity
  'capacity.match_found',
  'capacity.interest_received',
  'capacity.expiring_soon',
  // Compliance
  'compliance.expiring',
  'compliance.verified',
  // Supplier
  'supplier.invited',
  // Timesheets
  'timesheet.submitted',
  'timesheet.approved',
  'timesheet.rejected',
  // Contracts
  'contract.activated',
  'contract.terminated',
  // Invoices
  'invoice.issued',
  'invoice.paid'
];

/* ── Signing ─────────────────────────────────────────────── */

/**
 * Generate a cryptographically secure signing secret (64 hex chars = 32 bytes).
 * @returns {string}
 */
export function generateSigningSecret() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Compute HMAC-SHA256 signature for a payload string.
 * @param {string} payloadString - JSON string of the webhook body
 * @param {string} secret - Hex-encoded signing secret
 * @returns {string} Hex-encoded HMAC digest
 */
export function computeSignature(payloadString, secret) {
  return crypto.createHmac('sha256', secret).update(payloadString, 'utf8').digest('hex');
}

/* ── CRUD ─────────────────────────────────────────────────── */

/**
 * List integrations for an org. Webhook URLs are masked.
 */
export async function listIntegrations(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT id, org_id, provider, label, is_active, enabled_events,
            last_success_at, last_error, created_at, updated_at,
            LEFT(webhook_url, 20) || '••••••' AS webhook_url_masked
     FROM org_integrations
     WHERE org_id = $1
     ORDER BY created_at DESC`,
    [orgId]
  );
  return rows;
}

/**
 * Get a single integration (full webhook_url for internal use only).
 */
export async function getIntegration(pool, integrationId, orgId) {
  const { rows } = await pool.query(
    `SELECT * FROM org_integrations WHERE id = $1 AND org_id = $2`,
    [integrationId, orgId]
  );
  return rows[0] || null;
}

/**
 * Create a new integration. Auto-generates a signing secret.
 */
export async function createIntegration(pool, orgId, data) {
  const { provider, label, webhook_url, enabled_events } = data;
  const filteredEvents = (enabled_events || []).filter(e => SUPPORTED_EVENTS.includes(e));
  const signingSecret = generateSigningSecret();

  const { rows } = await pool.query(
    `INSERT INTO org_integrations (org_id, provider, label, webhook_url, enabled_events, created_by, signing_secret)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, org_id, provider, label, is_active, enabled_events,
               LEFT(webhook_url, 20) || '••••••' AS webhook_url_masked,
               signing_secret, created_at, updated_at`,
    [orgId, provider, label || '', webhook_url, filteredEvents, data.created_by || null, signingSecret]
  );
  return rows[0];
}

/**
 * Update an integration.
 */
export async function updateIntegration(pool, integrationId, orgId, data) {
  const existing = await getIntegration(pool, integrationId, orgId);
  if (!existing) return null;

  const updates = {
    label: data.label !== undefined ? data.label : existing.label,
    webhook_url: data.webhook_url !== undefined ? data.webhook_url : existing.webhook_url,
    enabled_events: data.enabled_events !== undefined
      ? (data.enabled_events || []).filter(e => SUPPORTED_EVENTS.includes(e))
      : existing.enabled_events,
    is_active: data.is_active !== undefined ? data.is_active : existing.is_active
  };

  const { rows } = await pool.query(
    `UPDATE org_integrations
     SET label = $3, webhook_url = $4, enabled_events = $5, is_active = $6, updated_at = NOW()
     WHERE id = $1 AND org_id = $2
     RETURNING id, org_id, provider, label, is_active, enabled_events,
               LEFT(webhook_url, 20) || '••••••' AS webhook_url_masked,
               last_success_at, last_error, created_at, updated_at`,
    [integrationId, orgId, updates.label, updates.webhook_url, updates.enabled_events, updates.is_active]
  );
  return rows[0] || null;
}

/**
 * Delete an integration.
 */
export async function deleteIntegration(pool, integrationId, orgId) {
  const { rowCount } = await pool.query(
    `DELETE FROM org_integrations WHERE id = $1 AND org_id = $2`,
    [integrationId, orgId]
  );
  return rowCount > 0;
}

/* ── Test Send ────────────────────────────────────────────── */

/**
 * Send a test message to an integration.
 */
export async function testIntegration(pool, integrationId, orgId) {
  const integration = await getIntegration(pool, integrationId, orgId);
  if (!integration) return { ok: false, error: 'NOT_FOUND' };
  if (!integration.webhook_url) return { ok: false, error: 'NO_WEBHOOK_URL' };

  const result = await sendIntegrationEvent(
    integration.provider,
    integration.webhook_url,
    'capacity.match_found',
    {
      message: 'Dies ist eine Testnachricht von TempConnect. Integration funktioniert!',
      linkPath: '/public/enterprise.html',
      orgName: 'Test-Organisation'
    }
  );

  // Update status
  if (result.ok) {
    await pool.query(
      `UPDATE org_integrations SET last_success_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1`,
      [integrationId]
    );
  } else {
    await pool.query(
      `UPDATE org_integrations SET last_error = $2, updated_at = NOW() WHERE id = $1`,
      [integrationId, result.error || 'Unknown error']
    );
  }

  return result;
}

/* ── Event Dispatch Pipeline ─────────────────────────────── */

/**
 * Dispatch an integration event to all matching active integrations for the given org.
 * Logs every delivery to webhook_deliveries. Uses signing secret for HMAC headers.
 * Fire-and-forget: errors are logged but never thrown.
 *
 * @param {import('pg').Pool} pool
 * @param {string} eventKey - e.g. 'offer.received'
 * @param {Object} context - { orgId, message, linkPath, entityType, entityId }
 */
export async function dispatchToIntegrations(pool, eventKey, context = {}) {
  if (!context.orgId) return;

  try {
    // Find all active integrations for this org that have this event enabled
    const { rows: integrations } = await pool.query(
      `SELECT id, provider, webhook_url, label, signing_secret
       FROM org_integrations
       WHERE org_id = $1 AND is_active = TRUE AND $2 = ANY(enabled_events)`,
      [context.orgId, eventKey]
    );

    if (integrations.length === 0) return;

    // Resolve org name for message context
    let orgName = context.orgName || '';
    if (!orgName && context.orgId) {
      const { rows: orgRows } = await pool.query(
        'SELECT name FROM organizations WHERE id = $1', [context.orgId]
      );
      orgName = orgRows[0]?.name || '';
    }

    const enrichedContext = { ...context, orgName };

    // Send to all matching integrations in parallel
    const results = await Promise.allSettled(
      integrations.map(async (intg) => {
        const result = await sendIntegrationEvent(
          intg.provider, intg.webhook_url, eventKey, enrichedContext,
          { signingSecret: intg.signing_secret || null }
        );

        // Log delivery to webhook_deliveries
        try {
          const status = result.ok ? 'success' : 'failed';
          const nextRetry = !result.ok
            ? new Date(Date.now() + 60_000)  // 1 min for first retry
            : null;
          await pool.query(
            `INSERT INTO webhook_deliveries
               (integration_id, event_key, payload, status, http_status, error_message, completed_at, next_retry_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              intg.id, eventKey,
              JSON.stringify({ event: eventKey, message: enrichedContext.message, entityType: enrichedContext.entityType, entityId: enrichedContext.entityId }),
              status,
              result.status || null,
              result.ok ? null : (result.error || 'Unknown').slice(0, 500),
              result.ok ? new Date() : null,
              nextRetry
            ]
          );
        } catch (logErr) {
          logger.warn({ err: logErr.message }, 'Failed to log webhook delivery');
        }

        // Update integration status
        if (result.ok) {
          await pool.query(
            `UPDATE org_integrations SET last_success_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1`,
            [intg.id]
          ).catch(() => {});
        } else {
          await pool.query(
            `UPDATE org_integrations SET last_error = $2, updated_at = NOW() WHERE id = $1`,
            [intg.id, (result.error || 'Unknown').slice(0, 500)]
          ).catch(() => {});
        }

        return { integrationId: intg.id, provider: intg.provider, ...result };
      })
    );

    const sent = results.filter(r => r.status === 'fulfilled' && r.value?.ok).length;
    if (sent > 0) {
      logger.info({ eventKey, orgId: context.orgId, sent, total: integrations.length }, 'Integration events dispatched');
    }
  } catch (err) {
    // Never let integration errors affect the main flow
    logger.warn({ err: err.message, eventKey, orgId: context.orgId }, 'Integration dispatch error (suppressed)');
  }
}

/* ── Delivery Log & Retry ────────────────────────────────── */

/**
 * Get recent webhook deliveries for an integration (debugging).
 * @param {import('pg').Pool} pool
 * @param {string} integrationId
 * @param {string} orgId - For org-boundary check
 * @param {number} [limit=50]
 */
export async function getDeliveryLog(pool, integrationId, orgId, limit = 50) {
  // Verify integration belongs to org
  const intg = await getIntegration(pool, integrationId, orgId);
  if (!intg) return null;

  const safeLimit = Math.min(200, Math.max(1, limit));
  const { rows } = await pool.query(
    `SELECT id, event_key, status, http_status, error_message, attempt, max_attempts,
            next_retry_at, created_at, completed_at
     FROM webhook_deliveries
     WHERE integration_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [integrationId, safeLimit]
  );
  return rows;
}

/**
 * Retry failed webhook deliveries that are due for retry.
 * Picks rows with status='failed', attempt < max_attempts, next_retry_at <= NOW().
 * Uses exponential backoff: next retry = attempt * 60 seconds.
 * @param {import('pg').Pool} pool
 * @returns {{ retried: number, succeeded: number, failed: number }}
 */
export async function retryFailedDeliveries(pool) {
  const { rows: pendingRetries } = await pool.query(
    `SELECT wd.id, wd.integration_id, wd.event_key, wd.payload, wd.attempt, wd.max_attempts,
            oi.provider, oi.webhook_url, oi.signing_secret
     FROM webhook_deliveries wd
     JOIN org_integrations oi ON oi.id = wd.integration_id
     WHERE wd.status = 'failed'
       AND wd.attempt < wd.max_attempts
       AND wd.next_retry_at <= NOW()
       AND oi.is_active = TRUE
     ORDER BY wd.next_retry_at ASC
     LIMIT 100`
  );

  let retried = 0, succeeded = 0, failed = 0;

  for (const row of pendingRetries) {
    retried++;
    const newAttempt = row.attempt + 1;

    // Mark as retrying
    await pool.query(
      `UPDATE webhook_deliveries SET status = 'retrying', attempt = $2 WHERE id = $1`,
      [row.id, newAttempt]
    );

    // Parse event context from stored payload
    const payloadData = typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload || {});
    const result = await sendIntegrationEvent(
      row.provider, row.webhook_url, row.event_key, payloadData,
      { signingSecret: row.signing_secret || null }
    );

    if (result.ok) {
      succeeded++;
      await pool.query(
        `UPDATE webhook_deliveries SET status = 'success', http_status = $2, error_message = NULL, completed_at = NOW() WHERE id = $1`,
        [row.id, result.status || null]
      );
      await pool.query(
        `UPDATE org_integrations SET last_success_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1`,
        [row.integration_id]
      ).catch(() => {});
    } else {
      failed++;
      const nextRetryMs = newAttempt * 60_000; // exponential: 2min, 3min, ...
      const reachedMax = newAttempt >= row.max_attempts;
      await pool.query(
        `UPDATE webhook_deliveries
         SET status = $2, http_status = $3, error_message = $4, next_retry_at = $5
         WHERE id = $1`,
        [
          row.id,
          reachedMax ? 'failed' : 'failed',
          result.status || null,
          (result.error || 'Unknown').slice(0, 500),
          reachedMax ? null : new Date(Date.now() + nextRetryMs)
        ]
      );
    }
  }

  if (retried > 0) {
    logger.info({ retried, succeeded, failed }, 'Webhook delivery retry cycle complete');
  }
  return { retried, succeeded, failed };
}

/**
 * Delete old webhook delivery log entries.
 * @param {import('pg').Pool} pool
 * @param {number} [daysOld=30]
 * @returns {number} deleted count
 */
export async function cleanupOldDeliveries(pool, daysOld = 30) {
  const { rowCount } = await pool.query(
    `DELETE FROM webhook_deliveries WHERE created_at < NOW() - ($1 || ' days')::INTERVAL`,
    [String(daysOld)]
  );
  if (rowCount > 0) {
    logger.info({ deleted: rowCount, daysOld }, 'Webhook delivery log cleanup');
  }
  return rowCount;
}

/**
 * Get all supported events with metadata.
 */
export function getSupportedEvents() {
  return SUPPORTED_EVENTS.map(key => ({ key, label: key }));
}
