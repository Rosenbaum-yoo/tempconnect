/**
 * subscriptionNotificationService.js
 *
 * Welle 8 Schritt 15 - Zentraler Hook fuer Enterprise-Request-Eingang +
 * Subscription-Request-Statuswechsel.
 *
 * Aufrufer:
 *   - `routes/strategicCollaboration.js` POST /enterprise-request
 *   - `services/subscriptionRequestService.js` createRequest / transitionStatus
 *     / approve / reject / activate / applyApprovedChange
 *
 * Eigenschaften:
 *   - **Idempotent**: jeder (context_type, context_id, event_key, recipient_role,
 *     recipient_user_id) liefert max. eine Notification + max. eine Mail.
 *     Realisiert ueber `subscription_notification_log.idempotency_key UNIQUE`.
 *   - **Mail-fail-safe**: SMTP-Probleme (oder kein SMTP_HOST) brechen NIEMALS
 *     die ausloesende Status-Transition ab. In-App-Notification wird trotzdem
 *     persistiert; Mail-Fehler landen im `mail_status='failed'`-Feld.
 *   - **Praeferenzbasiert** (best-effort): wenn `notification_preferences`
 *     fuer einen User `channel_email=false` setzt, ueberspringen wir die Mail.
 *     Default ist `true` (Mail aktiv) wenn keine Praeferenz vorhanden.
 *
 * KEINE Aussagen ueber Vermittlungserfolg oder Rechnungsstellung in den
 * Templates (siehe subscriptionNotificationTemplates.js).
 */

import { CUSTOMER_TEMPLATES, STAFF_TEMPLATES } from "./subscriptionNotificationTemplates.js";

const NOTIFICATION_TYPE_BY_EVENT = {
  // Customer events
  submitted:           "subscription_request_submitted",
  under_review:        "subscription_request_under_review",
  needs_clarification: "subscription_request_needs_clarification",
  offered:             "subscription_request_offered",
  accepted:            "subscription_request_accepted",
  active:              "subscription_request_active",
  rejected:            "subscription_request_rejected",
  cancelled:           "subscription_request_cancelled",
  expired:             "subscription_request_expired",
  // Staff events
  enterprise_request_received:           "enterprise_request_received",
  staff_subscription_request_submitted:  "subscription_request_submitted",
  staff_subscription_request_accepted:   "subscription_request_accepted",
  staff_subscription_request_cancellation: "subscription_request_cancelled",
  staff_subscription_request_activation_failed: "subscription_request_activation_failed",
  staff_subscription_request_expiring_soon: "subscription_request_expiring_soon"
};

/* ── Recipient-Helpers ──────────────────────────────────────── */

async function listActiveStaffRecipients(pool) {
  // Staff sind in `tempconnect_staff` registriert; users-Join liefert email + id.
  try {
    const { rows } = await pool.query(
      `SELECT s.user_id, COALESCE(u.email, s.email) AS email, COALESCE(u.contact_person, s.display_name) AS display_name
         FROM tempconnect_staff s
         LEFT JOIN users u ON u.id = s.user_id
        WHERE s.is_active = TRUE`
    );
    return rows.filter((r) => r.user_id);
  } catch {
    return [];
  }
}

async function getCustomerRecipientForSubscriptionRequest(pool, requestId) {
  // Empfaenger-Reihenfolge:
  //   1) sr.user_id (direkter Antragsteller, falls vorhanden)
  //   2) Owner-User der zugehoerigen Org (org_memberships role='owner')
  //   3) anonym: nur contact_email (kein user_id)
  try {
    const { rows } = await pool.query(
      `SELECT sr.id, sr.user_id, sr.org_id, sr.contact_email, sr.contact_name,
              sr.request_type, sr.current_plan, sr.desired_plan,
              sr.proposed_price_cents, sr.proposed_term_months,
              sr.expected_start_date, sr.cancellation_effective_at,
              sr.rejection_reason
         FROM subscription_requests sr
        WHERE sr.id = $1`,
      [requestId]
    );
    const row = rows[0];
    if (!row) return null;

    let userId = row.user_id || null;
    let email = row.contact_email || null;
    let name = row.contact_name || null;

    if (!userId && row.org_id) {
      try {
        const { rows: ownerRows } = await pool.query(
          `SELECT u.id AS user_id, u.email, u.contact_person
             FROM org_memberships m
             JOIN users u ON u.id = m.user_id
            WHERE m.org_id = $1 AND m.role = 'owner'
            ORDER BY m.created_at ASC LIMIT 1`,
          [row.org_id]
        );
        if (ownerRows[0]) {
          userId = ownerRows[0].user_id;
          if (!email) email = ownerRows[0].email;
          if (!name) name = ownerRows[0].contact_person;
        }
      } catch { /* org_memberships might not exist in some envs - ignore */ }
    }
    return { userId, email, name, payload: row };
  } catch {
    return null;
  }
}

/* ── Praeferenzen ───────────────────────────────────────────── */

async function isEmailPreferred(pool, userId, eventCategory) {
  // Default: TRUE (Mail aktiv). Nur wenn der User eine ausdrueckliche
  // Praeferenz fuer DIESE Kategorie auf channel_email=false gesetzt hat,
  // wird die Mail uebersprungen.
  if (!userId) return true;
  try {
    const { rows } = await pool.query(
      `SELECT channel_email FROM notification_preferences
        WHERE user_id = $1 AND event_category = $2`,
      [userId, eventCategory]
    );
    if (!rows[0]) return true;
    return rows[0].channel_email !== false;
  } catch {
    return true;
  }
}

/* ── Persist (DB-Notification + Log) ────────────────────────── */

async function insertNotificationRow(pool, { userId, orgId, type, title, message, severity, entityType, entityId }) {
  if (!userId) return null;
  try {
    const { rows } = await pool.query(
      `INSERT INTO notifications (user_id, org_id, type, title, message, severity, entity_type, entity_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [userId, orgId || null, type, title || "", message || "", severity || "info", entityType || null, entityId || null]
    );
    return rows[0]?.id || null;
  } catch {
    // Bei CHECK-Constraint-Verletzung loggen, nicht werfen.
    return null;
  }
}

async function recordLog(pool, args) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO subscription_notification_log
         (idempotency_key, context_type, context_id, event_key,
          recipient_role, recipient_user_id, recipient_email,
          notification_id, dispatched_via, mail_status, mail_message_id, mail_error, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id, idempotency_key`,
      [
        args.idempotencyKey,
        args.contextType,
        args.contextId,
        args.eventKey,
        args.recipientRole,
        args.recipientUserId || null,
        args.recipientEmail || null,
        args.notificationId || null,
        args.dispatchedVia,
        args.mailStatus || null,
        args.mailMessageId || null,
        args.mailError || null,
        JSON.stringify(args.payload || {})
      ]
    );
    return { inserted: rows.length > 0, row: rows[0] || null };
  } catch (err) {
    return { inserted: false, row: null, error: err && err.code ? err.code : "LOG_FAIL" };
  }
}

/* ── Mail Dispatch (fail-safe) ─────────────────────────────── */

async function safeSendMail(deps, mailArgs) {
  const sendMail = deps && deps.sendMail;
  const logger = (deps && deps.logger) || null;
  if (typeof sendMail !== "function") {
    return { status: "no_smtp", messageId: null, error: null };
  }
  if (!mailArgs.to) {
    return { status: "skipped", messageId: null, error: "NO_RECIPIENT" };
  }
  try {
    const info = await sendMail({ to: mailArgs.to, subject: mailArgs.subject, text: mailArgs.text, html: mailArgs.html });
    return { status: "ok", messageId: info?.messageId || null, error: null };
  } catch (err) {
    const errorMsg = err && err.message ? err.message : String(err);
    logger?.warn?.({ err: errorMsg, to: mailArgs.to }, "subscription notification mail failed");
    return { status: "failed", messageId: null, error: errorMsg };
  }
}

/* ── Idempotenter Dispatcher ───────────────────────────────── */

function buildIdempotencyKey({ contextType, contextId, eventKey, recipientRole, recipientUserId, recipientEmail }) {
  const recipient = recipientUserId || ("email:" + (recipientEmail || ""));
  return [contextType, contextId, eventKey, recipientRole, recipient].join(":");
}

async function dispatchSingle(pool, deps, args) {
  const idempotencyKey = buildIdempotencyKey(args);
  // Quick-Check, ob Eintrag schon existiert -> nichts mehr tun.
  try {
    const { rows } = await pool.query(
      `SELECT id, dispatched_via FROM subscription_notification_log WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    if (rows[0]) return { skipped: true, reason: "ALREADY_DISPATCHED", id: rows[0].id };
  } catch {
    // ignore - bei DB-Probleme machen wir trotzdem weiter, Insert wird per ON CONFLICT geguarded
  }

  const t = args.template;
  const notificationType = NOTIFICATION_TYPE_BY_EVENT[args.notificationEventKey] || "general";

  // 1) DB-Notification (nur wenn ein userId existiert).
  const notificationId = await insertNotificationRow(pool, {
    userId: args.recipientUserId,
    orgId: args.orgId || null,
    type: notificationType,
    title: t.in_app_title,
    message: t.in_app_body,
    severity: t.severity,
    entityType: args.contextType,
    entityId: args.contextId
  });

  // 2) Mail (nur wenn Praeferenz erlaubt).
  const eventCategory = args.notificationEventKey;
  const mailAllowed = await isEmailPreferred(pool, args.recipientUserId, eventCategory);
  let mailResult = { status: "skipped", messageId: null, error: null };
  if (mailAllowed && args.recipientEmail) {
    mailResult = await safeSendMail(deps, {
      to: args.recipientEmail,
      subject: t.subject,
      text: t.text,
      html: t.html
    });
  } else if (!args.recipientEmail) {
    mailResult = { status: "skipped", messageId: null, error: "NO_EMAIL" };
  } else {
    mailResult = { status: "skipped", messageId: null, error: "PREFERENCE_OFF" };
  }

  let dispatchedVia = "skipped";
  if (notificationId && mailResult.status === "ok") dispatchedVia = "both";
  else if (notificationId) dispatchedVia = "db";
  else if (mailResult.status === "ok") dispatchedVia = "email";

  await recordLog(pool, {
    idempotencyKey,
    contextType: args.contextType,
    contextId: args.contextId,
    eventKey: args.eventKey,
    recipientRole: args.recipientRole,
    recipientUserId: args.recipientUserId || null,
    recipientEmail: args.recipientEmail || null,
    notificationId,
    dispatchedVia,
    mailStatus: mailResult.status,
    mailMessageId: mailResult.messageId,
    mailError: mailResult.error,
    payload: args.payload || {}
  });

  return {
    skipped: false,
    idempotency_key: idempotencyKey,
    notification_id: notificationId,
    dispatched_via: dispatchedVia,
    mail_status: mailResult.status
  };
}

/* ── Public API ─────────────────────────────────────────────── */

/**
 * Public Enterprise-Request ist eingegangen \u2014 alle aktiven Staff
 * werden benachrichtigt.
 *
 * @param {import('pg').Pool} pool
 * @param {{
 *   requestId: string,
 *   companyName?: string,
 *   contactName?: string,
 *   contactEmail?: string,
 *   planRequested?: string,
 *   monthlyEstimateCents?: number|null,
 *   seatsRequested?: number|null
 * }} ctx
 * @param {{ sendMail?: function, logger?: object }} [deps]
 */
export async function notifyEnterpriseRequestReceived(pool, ctx, deps = {}) {
  if (!pool || !ctx || !ctx.requestId) return { ok: false, error: "INVALID_ARGS" };
  const recipients = await listActiveStaffRecipients(pool);
  if (!recipients.length) {
    return { ok: true, dispatched: 0, recipients: 0, note: "no_active_staff" };
  }
  const tpl = STAFF_TEMPLATES.enterprise_request_received(ctx);
  let dispatched = 0;
  let skipped = 0;
  for (const r of recipients) {
    const res = await dispatchSingle(pool, deps, {
      contextType: "enterprise_request",
      contextId: ctx.requestId,
      eventKey: "received",
      notificationEventKey: "enterprise_request_received",
      recipientRole: "staff",
      recipientUserId: r.user_id,
      recipientEmail: r.email,
      orgId: null,
      template: tpl,
      payload: { plan: ctx.planRequested, contact: ctx.contactEmail }
    });
    if (res.skipped) skipped++; else dispatched++;
  }
  return { ok: true, dispatched, skipped, recipients: recipients.length };
}

/**
 * Subscription-Request-Statuswechsel: Customer + ggf. Staff benachrichtigen.
 *
 * @param {import('pg').Pool} pool
 * @param {{
 *   requestId: string,
 *   toStatus: string,
 *   fromStatus?: string,
 *   requestType?: string
 * }} change
 * @param {{ sendMail?: function, logger?: object }} [deps]
 */
export async function notifyRequestStatusChanged(pool, change, deps = {}) {
  if (!pool || !change || !change.requestId || !change.toStatus) return { ok: false, error: "INVALID_ARGS" };
  const customer = await getCustomerRecipientForSubscriptionRequest(pool, change.requestId);
  if (!customer) return { ok: false, error: "REQUEST_NOT_FOUND" };

  const ctx = {
    requestId: change.requestId,
    requestType: customer.payload?.request_type || change.requestType,
    contactName: customer.name,
    currentPlan: customer.payload?.current_plan,
    desiredPlan: customer.payload?.desired_plan,
    proposedPriceCents: customer.payload?.proposed_price_cents,
    proposedTermMonths: customer.payload?.proposed_term_months,
    expectedStartDate: customer.payload?.expected_start_date,
    cancellationEffectiveAt: customer.payload?.cancellation_effective_at,
    rejectionReason: customer.payload?.rejection_reason
  };

  const summary = { ok: true, customer: null, staff: null };

  // Customer
  const customerTpl = CUSTOMER_TEMPLATES[change.toStatus];
  if (customerTpl) {
    const tpl = customerTpl(ctx);
    summary.customer = await dispatchSingle(pool, deps, {
      contextType: "subscription_request",
      contextId: change.requestId,
      eventKey: "status_" + change.toStatus,
      notificationEventKey: change.toStatus,
      recipientRole: "customer",
      recipientUserId: customer.userId,
      recipientEmail: customer.email,
      orgId: customer.payload?.org_id,
      template: tpl,
      payload: { fromStatus: change.fromStatus, toStatus: change.toStatus }
    });
  }

  // Staff (nur fuer kritische Events)
  const staffEventKey = mapStaffEvent(change);
  if (staffEventKey) {
    const staffTplFn = STAFF_TEMPLATES[staffEventKey];
    if (staffTplFn) {
      const staffTpl = staffTplFn({
        ...ctx,
        orgName: customer.payload?.org_name || null,
        orgId: customer.payload?.org_id,
        contactEmail: customer.email
      });
      const recipients = await listActiveStaffRecipients(pool);
      const results = [];
      for (const r of recipients) {
        const res = await dispatchSingle(pool, deps, {
          contextType: "subscription_request",
          contextId: change.requestId,
          eventKey: "staff_" + change.toStatus,
          notificationEventKey: "staff_" + staffEventKey,
          recipientRole: "staff",
          recipientUserId: r.user_id,
          recipientEmail: r.email,
          orgId: null,
          template: staffTpl,
          payload: { fromStatus: change.fromStatus, toStatus: change.toStatus, request_type: ctx.requestType }
        });
        results.push(res);
      }
      summary.staff = { recipients: recipients.length, results };
    }
  }

  return summary;
}

function mapStaffEvent(change) {
  // Welche Customer-Statuswechsel ziehen ein Staff-Notification nach sich?
  if (change.toStatus === "submitted") return "subscription_request_submitted";
  if (change.toStatus === "accepted") return "subscription_request_accepted";
  if (change.toStatus === "cancelled" || change.requestType === "cancellation") return "subscription_request_cancellation";
  return null;
}

/**
 * Aktivierung fehlgeschlagen \u2014 Staff bekommt einen `error`-severity-Eintrag.
 */
export async function notifyActivationFailed(pool, ctx, deps = {}) {
  if (!pool || !ctx || !ctx.requestId) return { ok: false, error: "INVALID_ARGS" };
  const recipients = await listActiveStaffRecipients(pool);
  const tpl = STAFF_TEMPLATES.subscription_request_activation_failed(ctx);
  let dispatched = 0;
  for (const r of recipients) {
    const res = await dispatchSingle(pool, deps, {
      contextType: "subscription_request",
      contextId: ctx.requestId,
      eventKey: "activation_failed",
      notificationEventKey: "staff_subscription_request_activation_failed",
      recipientRole: "staff",
      recipientUserId: r.user_id,
      recipientEmail: r.email,
      orgId: null,
      template: tpl,
      payload: { error_code: ctx.errorCode, error_message: ctx.errorMessage }
    });
    if (!res.skipped) dispatched++;
  }
  return { ok: true, dispatched, recipients: recipients.length };
}

/**
 * Soon-to-Expire Reminder fuer Staff. Ruft der Cron-Job spaeter pro
 * Anfrage einmal pro Tag (Idempotency haelt das wirksam).
 */
export async function notifyExpiringSoon(pool, ctx, deps = {}) {
  if (!pool || !ctx || !ctx.requestId) return { ok: false, error: "INVALID_ARGS" };
  const recipients = await listActiveStaffRecipients(pool);
  const tpl = STAFF_TEMPLATES.subscription_request_expiring_soon(ctx);
  for (const r of recipients) {
    await dispatchSingle(pool, deps, {
      contextType: "subscription_request",
      contextId: ctx.requestId,
      // Ein neuer Idempotency-Key pro Tag, damit Cron taeglich erneut fuern darf.
      eventKey: "expiring_soon:" + new Date().toISOString().slice(0, 10),
      notificationEventKey: "staff_subscription_request_expiring_soon",
      recipientRole: "staff",
      recipientUserId: r.user_id,
      recipientEmail: r.email,
      orgId: null,
      template: tpl,
      payload: { expires_at: ctx.expiresAt }
    });
  }
  return { ok: true, recipients: recipients.length };
}

/* Test-Hooks (intern fuer Unit-Tests) */
export const __internal = {
  buildIdempotencyKey,
  mapStaffEvent,
  NOTIFICATION_TYPE_BY_EVENT
};
