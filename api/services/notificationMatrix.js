/**
 * Notification Matrix: event → notification dispatch.
 * Maps business events to notification inserts and optional email queue jobs.
 * Uses existing notifications table from migration 019 + BullMQ email queue.
 */

import { logger } from "../config/index.js";

/* ── Event → Notification config ──────────────────────── */

const MATRIX = {
  'requisition.submitted_for_approval': {
    type: 'requisition_approval',
    severity: 'info',
    title: 'Requisition zur Freigabe eingereicht',
    recipientStrategy: 'org_approvers'
  },
  'requisition.approved': {
    type: 'requisition_approval',
    severity: 'success',
    title: 'Requisition freigegeben',
    recipientStrategy: 'requisition_creator'
  },
  'requisition.rejected': {
    type: 'requisition_approval',
    severity: 'warning',
    title: 'Requisition abgelehnt',
    recipientStrategy: 'requisition_creator'
  },
  'requisition.filled': {
    type: 'requisition_filled',
    severity: 'success',
    title: 'Requisition besetzt',
    recipientStrategy: 'requisition_creator'
  },
  'requisition.cancelled': {
    type: 'requisition_cancelled',
    severity: 'warning',
    title: 'Requisition storniert',
    recipientStrategy: 'requisition_stakeholders'
  },
  'supplier.invited': {
    type: 'vendor_pool_change',
    severity: 'info',
    title: 'Einladung als Lieferant',
    recipientStrategy: 'supplier_org_admins'
  },
  'offer.received': {
    type: 'offer_received',
    severity: 'info',
    title: 'Neues Angebot eingegangen',
    recipientStrategy: 'requisition_creator'
  },
  'offer.accepted': {
    type: 'offer_accepted',
    severity: 'success',
    title: 'Angebot angenommen',
    recipientStrategy: 'offer_supplier'
  },
  'offer.rejected': {
    type: 'offer_rejected',
    severity: 'warning',
    title: 'Angebot abgelehnt',
    recipientStrategy: 'offer_supplier'
  },
  'compliance.expiring': {
    type: 'compliance_expiring',
    severity: 'warning',
    title: 'Dokument läuft bald ab',
    recipientStrategy: 'doc_owner_org_admins'
  },
  'compliance.verified': {
    type: 'compliance_verified',
    severity: 'success',
    title: 'Dokument verifiziert',
    recipientStrategy: 'doc_uploader'
  },
  'contract.expiring': {
    type: 'general',
    severity: 'warning',
    title: 'Vertrag läuft bald ab',
    recipientStrategy: 'contract_stakeholders'
  },
  'assignment.starting_soon': {
    type: 'general',
    severity: 'info',
    title: 'Einsatz beginnt bald',
    recipientStrategy: 'assignment_stakeholders'
  },
  'deal.completed': {
    type: 'general',
    severity: 'success',
    title: 'Deal abgeschlossen',
    recipientStrategy: 'deal_participants'
  },

  // ── Capacity Exchange events ──
  'capacity.interest_received': {
    type: 'capacity_interest',
    severity: 'info',
    title: 'Neues Interesse an Kapazitaet',
    recipientStrategy: 'capacity_supplier'
  },
  'capacity.expiring_soon': {
    type: 'capacity_expiring',
    severity: 'warning',
    title: 'Kapazitaetseintrag laeuft bald ab',
    recipientStrategy: 'capacity_supplier'
  },
  'capacity.match_found': {
    type: 'capacity_match',
    severity: 'info',
    title: 'Neuer Match fuer Kapazitaet',
    recipientStrategy: 'capacity_supplier'
  },
  'capacity.stale': {
    type: 'capacity_stale',
    severity: 'warning',
    title: 'Kapazitaetseintrag benoetigt Bestaetigung',
    recipientStrategy: 'capacity_supplier'
  }
};

/* ── Dispatch ─────────────────────────────────────────── */

/**
 * Dispatch a notification for a business event.
 * @param {import('pg').Pool} pool
 * @param {string} eventKey - e.g. 'requisition.approved'
 * @param {Object} context - { recipientUserIds, orgId, entityType, entityId, message, emailQueue }
 */
export async function dispatch(pool, eventKey, context = {}) {
  const config = MATRIX[eventKey];
  if (!config) {
    logger.warn({ eventKey }, 'Unknown notification event — skipped');
    return { sent: 0 };
  }

  const recipientIds = context.recipientUserIds || [];
  if (recipientIds.length === 0) {
    logger.debug({ eventKey }, 'No recipients for notification');
    return { sent: 0 };
  }

  let sent = 0;
  for (const userId of recipientIds) {
    await pool.query(
      `INSERT INTO notifications (user_id, org_id, type, title, message, entity_type, entity_id, severity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId, context.orgId || null, config.type,
        config.title, context.message || null,
        context.entityType || null, context.entityId || null,
        config.severity
      ]
    );
    sent++;
  }

  // Optionally enqueue email notifications
  if (context.emailQueue && sent > 0) {
    try {
      const { enqueue, emailQueue } = await import("../queue/queues.js");
      for (const userId of recipientIds) {
        const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
        if (rows[0]?.email) {
          await enqueue(emailQueue, 'notification-email', {
            to: rows[0].email,
            subject: config.title,
            text: context.message || config.title
          });
        }
      }
    } catch (e) {
      logger.warn({ err: e.message }, 'Failed to enqueue notification emails');
    }
  }

  return { sent };
}

/**
 * Helper: find org approvers (owner/admin/program_manager).
 */
export async function findOrgApprovers(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT user_id FROM org_memberships
     WHERE org_id = $1 AND is_active = TRUE AND role_key IN ('owner','admin','program_manager')`,
    [orgId]
  );
  return rows.map(r => r.user_id);
}

/**
 * Helper: find org admins for a supplier org.
 */
export async function findOrgAdmins(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT user_id FROM org_memberships
     WHERE org_id = $1 AND is_active = TRUE AND role_key IN ('owner','admin')`,
    [orgId]
  );
  return rows.map(r => r.user_id);
}

/** Exported matrix for introspection / documentation. */
export function getMatrix() { return { ...MATRIX }; }
