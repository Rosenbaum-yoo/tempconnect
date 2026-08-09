/**
 * Notification Matrix: event → notification dispatch.
 * Maps business events to notification inserts and optional email queue jobs.
 * Uses existing notifications table from migration 019 + BullMQ email queue.
 */

import { createServiceLogger } from "../utils/logger.js";
import * as rbacService from "./rbacService.js";

const logger = createServiceLogger("notificationMatrix");

/* ── Event → Notification config ──────────────────────── */

const MATRIX = {
  'requisition.submitted_for_approval': {
    type: 'requisition_approval',
    severity: 'info',
    title: 'Requisition zur Freigabe eingereicht',
    recipientStrategy: 'org_approvers',
    linkPath: '/public/requisitions.html'
  },
  'requisition.approved': {
    type: 'requisition_approval',
    severity: 'success',
    title: 'Requisition freigegeben',
    recipientStrategy: 'requisition_creator',
    linkPath: '/public/requisitions.html'
  },
  'requisition.rejected': {
    type: 'requisition_approval',
    severity: 'warning',
    title: 'Requisition abgelehnt',
    recipientStrategy: 'requisition_creator',
    linkPath: '/public/requisitions.html'
  },
  'requisition.filled': {
    type: 'requisition_filled',
    severity: 'success',
    title: 'Requisition besetzt',
    recipientStrategy: 'requisition_creator',
    linkPath: '/public/requisitions.html'
  },
  'requisition.cancelled': {
    type: 'requisition_cancelled',
    severity: 'warning',
    title: 'Requisition storniert',
    recipientStrategy: 'requisition_stakeholders',
    linkPath: '/public/requisitions.html'
  },
  'supplier.invited': {
    type: 'vendor_pool_change',
    severity: 'info',
    title: 'Einladung als Lieferant',
    recipientStrategy: 'supplier_org_admins',
    linkPath: '/public/vendor_pool.html'
  },
  'offer.received': {
    type: 'offer_received',
    severity: 'info',
    title: 'Neues Angebot eingegangen',
    recipientStrategy: 'requisition_creator',
    linkPath: '/public/angebote_verwalten.html'
  },
  'offer.accepted': {
    type: 'offer_accepted',
    severity: 'success',
    title: 'Angebot angenommen',
    recipientStrategy: 'offer_supplier',
    linkPath: '/public/angebote_verwalten.html'
  },
  'offer.rejected': {
    type: 'offer_rejected',
    severity: 'warning',
    title: 'Angebot abgelehnt',
    recipientStrategy: 'offer_supplier',
    linkPath: '/public/angebote_verwalten.html'
  },
  'offer.countered': {
    type: 'offer_counter_received',
    severity: 'info',
    title: 'Gegenangebot erhalten',
    recipientStrategy: 'offer_supplier',
    linkPath: '/public/angebote_verwalten.html'
  },
  'offer.withdrawn': {
    type: 'offer_withdrawn',
    severity: 'warning',
    title: 'Angebot zur\u00fcckgezogen',
    recipientStrategy: 'offer_counterparty',
    linkPath: '/public/angebote_verwalten.html'
  },
  'compliance.expiring': {
    type: 'compliance_expiring',
    severity: 'warning',
    title: 'Dokument läuft bald ab',
    recipientStrategy: 'doc_owner_org_admins',
    linkPath: '/public/compliance_overview.html'
  },
  'compliance.verified': {
    type: 'compliance_verified',
    severity: 'success',
    title: 'Dokument verifiziert',
    recipientStrategy: 'doc_uploader',
    linkPath: '/public/compliance_overview.html'
  },
  'contract.expiring': {
    type: 'general',
    severity: 'warning',
    title: 'Vertrag läuft bald ab',
    recipientStrategy: 'contract_stakeholders',
    linkPath: '/public/timesheets.html'
  },
  'assignment.starting_soon': {
    type: 'general',
    severity: 'info',
    title: 'Einsatz beginnt bald',
    recipientStrategy: 'assignment_stakeholders',
    linkPath: '/public/timesheets.html'
  },
  'deal.completed': {
    type: 'deal_completed',
    severity: 'success',
    title: 'Deal abgeschlossen',
    recipientStrategy: 'deal_participants',
    linkPath: '/public/deal_management.html'
  },

  // ── Capacity Exchange events ──
  'capacity.interest_received': {
    type: 'capacity_interest',
    severity: 'info',
    title: 'Neues Interesse an Kapazitaet',
    recipientStrategy: 'capacity_supplier',
    linkPath: '/public/capacity_exchange_manage.html'
  },
  'capacity.expiring_soon': {
    type: 'capacity_expiring',
    severity: 'warning',
    title: 'Kapazitaetseintrag laeuft bald ab',
    recipientStrategy: 'capacity_supplier',
    linkPath: '/public/capacity_exchange_manage.html'
  },
  'capacity.match_found': {
    type: 'capacity_match',
    severity: 'info',
    title: 'Neuer Match fuer Kapazitaet',
    recipientStrategy: 'capacity_supplier',
    linkPath: '/public/capacity_exchange_feed.html'
  },
  'capacity.stale': {
    type: 'capacity_stale',
    severity: 'warning',
    title: 'Kapazitaetseintrag benoetigt Bestaetigung',
    recipientStrategy: 'capacity_supplier',
    linkPath: '/public/capacity_exchange_manage.html'
  },

  // ── Demand matching events ──
  'demand.match_found': {
    type: 'demand_match',
    severity: 'info',
    title: 'Neues Kapazitaetsangebot passt zu Ihrer Nachfrage',
    recipientStrategy: 'demand_creator',
    linkPath: '/public/capacity_exchange_feed.html'
  },

  // ── Deal lifecycle events ──
  'deal.offer_sent': {
    type: 'deal_offer_sent',
    severity: 'info',
    title: 'Neues Angebot erhalten',
    recipientStrategy: 'deal_requester',
    linkPath: '/public/company_requests.html'
  },
  'deal.accepted': {
    type: 'deal_accepted',
    severity: 'success',
    title: 'Angebot angenommen',
    recipientStrategy: 'deal_supplier',
    linkPath: '/public/company_requests.html'
  },
  'deal.confirmed': {
    type: 'deal_confirmed',
    severity: 'success',
    title: 'Deal bestaetigt',
    recipientStrategy: 'deal_participants',
    linkPath: '/public/company_requests.html'
  },
  'deal.assignment_started': {
    type: 'deal_assignment_started',
    severity: 'info',
    title: 'Einsatz gestartet',
    recipientStrategy: 'deal_participants',
    linkPath: '/public/company_requests.html'
  },
  'deal.staffing_ready': {
    type: 'deal_staffing_ready',
    severity: 'info',
    title: 'Staffing bereit',
    recipientStrategy: 'deal_supplier',
    linkPath: '/public/worker-submissions-review.html#asgn'
  },

  // ── Deal-Agreement-Lifecycle (Marktplatz: offers/assignments) ──
  // Werden in routes/marketplace.js + routes/emergency.js bereits dispatched;
  // ohne diese Eintraege waren sie No-ops ("Unknown event") -> keine Card-
  // Benachrichtigung. Reuse bestehender deals-Surface-Typen (notificationSurfaceMap.js)
  // -> leuchten die "Meine Deals"-Hub-Card.
  'deal.agreement_created': {
    type: 'deal_offer_sent',
    severity: 'info',
    title: 'Einsatzvereinbarung erstellt',
    recipientStrategy: 'deal_supplier',
    linkPath: '/public/deal_management.html'
  },
  'deal.agreement_confirmed': {
    type: 'deal_confirmed',
    severity: 'success',
    title: 'Einsatzvereinbarung bestätigt',
    recipientStrategy: 'deal_requester',
    linkPath: '/public/deal_management.html'
  },
  'deal.agreement_activated': {
    type: 'deal_assignment_started',
    severity: 'success',
    title: 'Deal abgeschlossen – Einsatz aktiviert',
    recipientStrategy: 'deal_participants',
    linkPath: '/public/deal_management.html'
  },
  'deal.agreement_cancelled': {
    type: 'deal_cancelled',
    severity: 'warning',
    title: 'Einsatzvereinbarung storniert',
    recipientStrategy: 'deal_counterparty',
    linkPath: '/public/deal_management.html'
  },
  'deal.agreement_signature_prepared': {
    type: 'deal_confirmed',
    severity: 'info',
    title: 'Signaturstrecke vorbereitet',
    recipientStrategy: 'deal_supplier',
    linkPath: '/public/deal_management.html'
  },
  'deal.emergency_agreement_created': {
    type: 'deal_offer_sent',
    severity: 'urgent',
    title: 'Notdienst-Sofortvereinbarung erstellt',
    recipientStrategy: 'deal_requester',
    linkPath: '/public/deal_management.html'
  },

  // ── Capacity-/Demand-Deal-Anbahnung (Marktplatz) ──
  'capacity.deal_accepted': {
    type: 'deal_accepted',
    severity: 'success',
    title: 'Ihr Kapazitätsangebot wurde angenommen',
    recipientStrategy: 'capacity_supplier',
    linkPath: '/public/deal_management.html'
  },
  'capacity.deal_negotiation_started': {
    type: 'deal_offer_sent',
    severity: 'info',
    title: 'Verhandlung zu Ihrem Kapazitätsangebot',
    recipientStrategy: 'capacity_supplier',
    linkPath: '/public/deal_management.html'
  },
  'demand.deal_accepted': {
    type: 'deal_accepted',
    severity: 'success',
    title: 'Ihr Bedarf wurde angenommen',
    recipientStrategy: 'demand_creator',
    linkPath: '/public/deal_management.html'
  },
  'demand.deal_negotiation_started': {
    type: 'deal_offer_sent',
    severity: 'info',
    title: 'Verhandlung zu Ihrem Bedarf',
    recipientStrategy: 'demand_creator',
    linkPath: '/public/deal_management.html'
  },
  'emergency.commitment_received': {
    type: 'demand_match',
    severity: 'urgent',
    title: 'Notdienst: Teilzusage erhalten',
    recipientStrategy: 'demand_creator',
    linkPath: '/public/marketplace.html'
  },

  // ── Emergency Staffing events ──
  'emergency.request_created': {
    type: 'emergency_request',
    severity: 'urgent',
    title: '\u{1F534} NOTDIENST: Dringender Personalbedarf',
    recipientStrategy: 'matching_suppliers',
    linkPath: '/public/marketplace.html'
  },
  'emergency.escalated': {
    type: 'emergency_escalation',
    severity: 'urgent',
    title: '\u26A0\uFE0F Eskalation: Dringender Personalbedarf',
    recipientStrategy: 'matching_suppliers',
    linkPath: '/public/marketplace.html'
  },

  // ── Timesheet events ──
  'timesheet.submitted': {
    type: 'timesheet_submitted',
    severity: 'info',
    title: 'Stundenzettel eingereicht',
    recipientStrategy: 'assignment_stakeholders',
    linkPath: '/public/timesheets.html'
  },
  'timesheet.approved': {
    type: 'timesheet_approved',
    severity: 'success',
    title: 'Stundenzettel genehmigt',
    recipientStrategy: 'timesheet_worker',
    linkPath: '/public/timesheets.html'
  },
  'timesheet.rejected': {
    type: 'timesheet_rejected',
    severity: 'warning',
    title: 'Stundenzettel abgelehnt',
    recipientStrategy: 'timesheet_worker',
    linkPath: '/public/timesheets.html'
  },
  'timesheet.signed': {
    type: 'timesheet_signed',
    severity: 'info',
    title: 'Stundenzettel digital unterschrieben',
    recipientStrategy: 'assignment_stakeholders',
    linkPath: '/public/timesheets.html'
  },

  /* ── Bounty-Anstupser (P9 Welle A5) ──────────────────────────
   *
   * Drei Anlaesse, mehr nicht. Der Titel ist bewusst kurz und der Klartext
   * kommt als `context.message` aus `bountyNudgeService` — dort steht die
   * Regel, hier nur die Zustellung.
   *
   * WICHTIG: Jeder Typ hier braucht einen Eintrag im CHECK von
   * `notifications.type` (Migration 171) UND in der Surface-Map. Fehlt eines
   * von beiden, scheitert der INSERT still — genau die Drift, die Migration
   * 139 einmal schliessen musste.
   */
  'bounty.near': {
    type: 'bounty_near',
    severity: 'info',
    title: 'Fast geschafft',
    recipientStrategy: 'bounty_owner',
    linkPath: '/public/bounties.html'
  },
  'bounty.earned': {
    type: 'bounty_earned',
    severity: 'success',
    title: 'Rabatt freigeschaltet',
    recipientStrategy: 'bounty_owner',
    linkPath: '/public/bounties.html'
  },
  'bounty.lost': {
    type: 'bounty_lost',
    severity: 'warning',
    title: 'Rabatt entfallen',
    recipientStrategy: 'bounty_owner',
    linkPath: '/public/bounties.html'
  }
};

/* ── Dispatch ─────────────────────────────────────────── */

/**
 * Dispatch a notification for a business event.
 * Now preference-aware: checks notification_preferences before sending.
 * @param {import('pg').Pool} pool
 * @param {string} eventKey - e.g. 'requisition.approved'
 * @param {Object} context - { recipientUserIds, orgId, entityType, entityId, message, emailQueue, _skipPreferenceCheck }
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
    // Check user preferences (unless caller already checked)
    let prefInApp = true;
    let prefEmail = context.emailQueue || false;
    if (!context._skipPreferenceCheck) {
      try {
        const { getUserPreferences } = await import("./matchAlertService.js");
        const prefs = await getUserPreferences(pool, userId, eventKey);
        prefInApp = prefs.inApp;
        prefEmail = context.emailQueue ? prefs.email : false;
      } catch (_e) {
        // Fallback: send in-app, respect explicit emailQueue flag
      }
    }

    // In-app notification (if preference allows)
    if (prefInApp) {
      const linkPath = context.linkPath || config.linkPath || null;
      const { rowCount } = await pool.query(
        `INSERT INTO notifications (user_id, org_id, type, title, message, entity_type, entity_id, severity, link_path)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9
         WHERE NOT EXISTS (
           SELECT 1 FROM notifications
           WHERE user_id = $1 AND type = $3 AND entity_type = $6 AND entity_id = $7
             AND created_at > NOW() - INTERVAL '1 hour'
         )`,
        [
          userId, context.orgId || null, config.type,
          config.title, context.message || null,
          context.entityType || null, context.entityId || null,
          config.severity, linkPath
        ]
      );
      if (rowCount > 0) sent++;
    }

    // Email (if preference allows)
    if (prefEmail) {
      try {
        const { enqueue, emailQueue } = await import("../queue/queues.js");
        const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
        if (rows[0]?.email) {
          await enqueue(emailQueue, 'notification-email', {
            to: rows[0].email,
            subject: context.emailSubject || config.title,
            // `emailText` erlaubt einen abweichenden Mailtext — gebraucht z. B.
            // fuer den Abmeldeweg, der in der In-App-Meldung nur stoeren wuerde.
            text: context.emailText || context.message || config.title
          });
        }
      } catch (e) {
        logger.warn({ err: e.message }, 'Failed to enqueue notification email');
      }
    }
  }

  // ── Fire-and-forget: dispatch to Slack/Teams integrations ──
  if (context.orgId && sent > 0) {
    try {
      const { dispatchToIntegrations } = await import("./integrationService.js");
      dispatchToIntegrations(pool, eventKey, {
        orgId: context.orgId,
        message: context.message || config.title,
        entityType: context.entityType,
        entityId: context.entityId,
        severity: config.severity,
        linkPath: context.linkPath || config.linkPath
      }).catch(e => logger.warn({ err: e.message }, 'Integration dispatch failed (non-blocking)'));
    } catch (e) {
      logger.warn({ err: e.message }, 'Integration module not available');
    }
  }

  return { sent };
}

/**
 * Empfänger aus einer PERMISSION ableiten statt aus einer hartkodierten Rollenliste.
 *
 * Warum das der richtige Weg ist: `findOrgApprovers`/`findOrgAdmins` schreiben ihre Rollen
 * direkt ins SQL. Ändert jemand die Rechte-Matrix in `rbacService.PERMISSIONS`, driftet der
 * Benachrichtigungs-Kreis still auseinander — es wird benachrichtigt, wer gar nicht handeln
 * darf, oder der Zuständige bekommt nichts. Hier ist die Matrix die einzige Wahrheit:
 * benachrichtigt wird genau, **wer die Aktion auch ausführen darf**.
 *
 * Fallback: hat niemand die Permission (z. B. kleine Org mit ungewöhnlicher Rollenverteilung),
 * wird der Org-Owner benachrichtigt — eine Benachrichtigung an niemanden ist immer ein Bug.
 *
 * @param {string} permission z. B. 'timesheet.approve'
 * @returns {Promise<string[]>} user_ids
 */
export async function findOrgMembersWithPermission(pool, orgId, permission) {
  if (!orgId || !permission) return [];
  const roles = rbacService.PERMISSIONS[permission];
  if (!Array.isArray(roles) || !roles.length) {
    logger.warn({ permission }, 'Unbekannte Permission fuer Empfaenger-Aufloesung');
    return [];
  }
  const { rows } = await pool.query(
    `SELECT user_id FROM org_memberships
      WHERE org_id = $1 AND is_active = TRUE AND role_key = ANY($2::text[])`,
    [orgId, roles]
  );
  if (rows.length) return rows.map(r => r.user_id);

  const { rows: owners } = await pool.query(
    `SELECT user_id FROM org_memberships
      WHERE org_id = $1 AND is_active = TRUE AND role_key = 'owner'`,
    [orgId]
  );
  if (owners.length) logger.warn({ orgId, permission }, 'Niemand mit Permission — Fallback auf Org-Owner');
  return owners.map(r => r.user_id);
}

/** Exported matrix for introspection / documentation. */
export function getMatrix() { return { ...MATRIX }; }
