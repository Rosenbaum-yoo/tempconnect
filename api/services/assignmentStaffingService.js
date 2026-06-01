import * as auditLog from "./auditLog.js";
import * as workerNotifications from "./workerNotificationService.js";
import { enqueue, staffingQueue } from "../queue/queues.js";
import { withTransaction } from "../utils/transaction.js";
import { haversineKm } from "./matchingEngine.js";
import { buildAssignmentActivePredicateSql } from "./assignmentLifecycleService.js";

const ASSIGNABLE_STATUSES = new Set(["planned", "active", "extended"]);
const LIVE_INVITE_STATUSES = new Set(["sent", "viewed", "interested", "accepted"]);
const ACTIONABLE_INVITE_STATUSES = new Set(["sent", "viewed", "interested"]);
const AUTO_BACKFILL_INVITE_MULTIPLIER = 3;
const AUTO_BACKFILL_WAITLIST_MULTIPLIER = 2;
const DEFAULT_AUTO_BACKFILL_COOLDOWN_MINUTES = 15;
const DEFAULT_STAFFING_REMINDER_MINUTES = 120;
const MIN_STAFFING_REMINDER_MINUTES = 15;
const DEFAULT_STAFFING_CHOICE_SET_HOURS = 72;
export const STAFFING_CHOICE_MODES = Object.freeze(["preference_only", "ranked_choice", "free_choice"]);
const ACTIVE_STAFFING_CHOICE_SET_STATUSES = new Set(["options_presented", "preference_submitted", "preference_ranked", "manual_override"]);
const TERMINAL_STAFFING_CHOICE_SET_STATUSES = new Set(["assigned", "declined", "expired", "cancelled"]);
const _STAFFING_CHOICE_WORKER_RESPONSES = new Set(["pending", "preferred", "acceptable", "ranked", "selected", "declined"]);
const _STAFFING_CHOICE_DISPATCHER_STATES = new Set(["pending", "assigned", "manual_override", "withdrawn"]);
const WORKER_SUGGESTION_FACTOR_WEIGHTS = Object.freeze({
  availabilityMatch: 25,
  skillMatch: 20,
  distanceScore: 15,
  qualificationScore: 15,
  reliabilityScore: 10,
  preferenceScore: 5,
  experienceScore: 10
});
const staffingAssignmentIsCurrentSql = buildAssignmentActivePredicateSql({ assignmentAlias: "a" });
const staffingAssignmentLinkIsCurrentSql = buildAssignmentActivePredicateSql({
  assignmentAlias: "a",
  linkAlias: "wal"
});

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : null;
}

function formatDateLabel(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return dateOnly(value);
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTimeLabel(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatEuroCents(value) {
  const cents = Number(value);
  if (!Number.isFinite(cents)) return null;
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function buildDurationLabel(startDate, endDate) {
  const startLabel = formatDateLabel(startDate);
  const endLabel = formatDateLabel(endDate);
  if (!startLabel) return null;
  if (!endLabel || dateOnly(startDate) === dateOnly(endDate)) return startLabel;

  const start = new Date(startDate);
  const end = new Date(endDate);
  const daySpan = Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())
    ? null
    : Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);

  return `${startLabel} – ${endLabel}${daySpan && daySpan > 1 ? ` (${daySpan} Tage)` : ""}`;
}

function uniqueStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((entry) => String(entry || "").trim().toLowerCase())
      .filter(Boolean)
  )];
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseStringList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return uniqueStrings(value);
  if (typeof value === "string") {
    const parsed = parseJson(value);
    if (parsed) return parseStringList(parsed);
    return uniqueStrings(
      value
        .split(/[,;\n]/g)
        .map((entry) => entry.trim())
        .filter(Boolean)
    );
  }
  if (typeof value === "object") {
    return uniqueStrings([
      ...Object.keys(value),
      ...Object.values(value).flatMap((entry) => parseStringList(entry))
    ]);
  }
  return [];
}

function parseQualificationKeywords(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return uniqueStrings(value.flatMap((entry) => {
      if (typeof entry === "string") return [entry];
      if (entry && typeof entry === "object") {
        return [
          entry.name,
          entry.title,
          entry.label,
          entry.value,
          entry.qualification,
          entry.qualification_name
        ];
      }
      return [];
    }));
  }
  if (typeof value === "string") {
    const parsed = parseJson(value);
    return parsed ? parseQualificationKeywords(parsed) : parseStringList(value);
  }
  if (typeof value === "object") {
    return uniqueStrings([
      ...Object.keys(value),
      ...Object.values(value).flatMap((entry) => parseQualificationKeywords(entry))
    ]);
  }
  return [];
}

function buildWorkerName(worker) {
  return [worker?.first_name, worker?.last_name].filter(Boolean).join(" ").trim() || worker?.email || worker?.user_id || "Unbekannter Worker";
}
export function getAutoBackfillBatchSize(openQuantity) {
  const normalizedOpenQuantity = Math.max(1, toInt(openQuantity, 1));
  return clamp(Math.max(normalizedOpenQuantity * AUTO_BACKFILL_INVITE_MULTIPLIER, normalizedOpenQuantity), 1, 20);
}

function getWaitlistSeedSize(openQuantity) {
  return clamp(getAutoBackfillBatchSize(openQuantity) * AUTO_BACKFILL_WAITLIST_MULTIPLIER, 5, 40);
}


function getAssignmentRequestedQuantity(assignment) {
  return Math.max(
    1,
    toInt(
      assignment?.requested_quantity
      ?? assignment?.worker_count
      ?? assignment?.offered_quantity
      ?? assignment?.required_total_count
      ?? 1,
      1
    )
  );
}

function deriveAssignmentRequirements(assignment) {
  const demandRequirements = parseJson(assignment?.demand_requirements) || {};
  const requisitionQualifications = parseJson(assignment?.requisition_qualifications);
  const shiftRequirements = parseJson(assignment?.requisition_shift_requirements) || parseJson(assignment?.demand_shifts) || {};

  return {
    role:
      assignment?.requisition_role
      || assignment?.demand_role
      || assignment?.worker_description
      || assignment?.requisition_title
      || assignment?.demand_title
      || null,
    location_city: assignment?.requisition_location_city || assignment?.demand_location_city || null,
    location_lat: assignment?.requisition_location_lat ?? assignment?.demand_location_lat ?? null,
    location_lng: assignment?.requisition_location_lng ?? assignment?.demand_location_lng ?? null,
    radius_km: Math.max(
      1,
      toInt(
        assignment?.requisition_radius_km
        ?? assignment?.demand_radius_km
        ?? 25,
        25
      )
    ),
    shift_model: shiftRequirements?.model || shiftRequirements?.type || shiftRequirements?.shift_model || null,
    required_skills: uniqueStrings([
      ...parseStringList(assignment?.requisition_skill_tags),
      ...parseStringList(assignment?.demand_skill_tags),
      ...parseStringList(demandRequirements.skills)
    ]),
    required_qualifications: uniqueStrings([
      ...parseQualificationKeywords(requisitionQualifications),
      ...parseQualificationKeywords(demandRequirements.qualifications),
      ...parseQualificationKeywords(demandRequirements.certifications)
    ])
  };
}

function buildInviteRequestSnapshot(assignment, {
  campaign = null,
  rootCampaignId = null,
  message = null,
  expiresAt = null
} = {}) {
  const requirements = deriveAssignmentRequirements(assignment);
  const payRateCents = Number.isFinite(Number(assignment?.hourly_rate_cents))
    ? Number(assignment.hourly_rate_cents)
    : null;
  const requestedQuantity = getAssignmentRequestedQuantity(assignment);
  const filledQuantity = Math.max(0, toInt(assignment?.filled_quantity, 0));
  const reservedQuantity = Math.max(0, toInt(assignment?.reserved_quantity, 0));
  const openQuantity = Math.max(
    0,
    toInt(
      assignment?.open_quantity,
      Math.max(requestedQuantity - filledQuantity - reservedQuantity, 0)
    )
  );

  return {
    assignment_id: assignment?.id || null,
    campaign_id: campaign?.id || null,
    root_campaign_id: rootCampaignId || campaign?.source_campaign_id || campaign?.id || null,
    title: assignment?.worker_description || requirements.role || assignment?.demand_title || assignment?.requisition_title || "Einsatzanfrage",
    role: requirements.role || null,
    client_org_name: assignment?.client_org_name || null,
    supplier_org_name: assignment?.supplier_org_name || null,
    location_city: requirements.location_city || null,
    location_label: requirements.location_city || assignment?.client_org_name || null,
    start_date: assignment?.start_date || null,
    planned_end_date: assignment?.planned_end_date || null,
    duration_label: buildDurationLabel(assignment?.start_date, assignment?.planned_end_date),
    shift_model: requirements.shift_model || null,
    shift_label: requirements.shift_model ? `Schicht: ${requirements.shift_model}` : null,
    pay_rate_cents: payRateCents,
    pay_label: payRateCents != null ? `${formatEuroCents(payRateCents)}/h` : null,
    response_deadline_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    response_deadline_label: expiresAt ? formatDateTimeLabel(expiresAt) : null,
    requested_quantity: requestedQuantity,
    filled_quantity: filledQuantity,
    reserved_quantity: reservedQuantity,
    open_quantity: openQuantity,
    campaign_name: campaign?.name || null,
    personal_message: message || null
  };
}

function parseInviteRequestSnapshot(value) {
  const snapshot = parseJson(value);
  return snapshot && typeof snapshot === "object" ? snapshot : {};
}

function buildStaffingNotificationContext(invite) {
  const snapshot = parseInviteRequestSnapshot(invite?.request_snapshot);
  return {
    title: snapshot.title || invite?.request_title || invite?.worker_description || "Neue Einsatzanfrage",
    clientName: snapshot.client_org_name || invite?.client_org_name || null,
    openQuantity: Number.isFinite(Number(invite?.open_quantity))
      ? Number(invite.open_quantity)
      : snapshot.open_quantity,
    deadlineLabel: snapshot.response_deadline_label || formatDateTimeLabel(invite?.expires_at)
  };
}

function buildWorkerRequestContext(invite) {
  const snapshot = parseInviteRequestSnapshot(invite?.request_snapshot);
  const payRateCents = Number.isFinite(Number(snapshot.pay_rate_cents))
    ? Number(snapshot.pay_rate_cents)
    : (Number.isFinite(Number(invite?.hourly_rate_cents)) ? Number(invite.hourly_rate_cents) : null);

  return {
    assignment_id: invite?.assignment_id || snapshot.assignment_id || null,
    campaign_id: invite?.campaign_id || snapshot.campaign_id || null,
    root_campaign_id: snapshot.root_campaign_id || invite?.root_campaign_id || invite?.campaign_id || null,
    title: snapshot.title || invite?.request_title || invite?.worker_description || "Einsatzanfrage",
    role: snapshot.role || invite?.request_role || null,
    client_org_name: snapshot.client_org_name || invite?.client_org_name || null,
    supplier_org_name: snapshot.supplier_org_name || invite?.supplier_org_name || null,
    location_city: snapshot.location_city || invite?.location_city || null,
    location_label: snapshot.location_label || snapshot.location_city || invite?.location_city || null,
    start_date: snapshot.start_date || invite?.start_date || null,
    planned_end_date: snapshot.planned_end_date || invite?.planned_end_date || null,
    duration_label: snapshot.duration_label || buildDurationLabel(invite?.start_date, invite?.planned_end_date),
    shift_model: snapshot.shift_model || null,
    shift_label: snapshot.shift_label || null,
    pay_rate_cents: payRateCents,
    pay_label: snapshot.pay_label || (payRateCents != null ? `${formatEuroCents(payRateCents)}/h` : null),
    response_deadline_at: snapshot.response_deadline_at || invite?.expires_at || null,
    response_deadline_label: snapshot.response_deadline_label || formatDateTimeLabel(invite?.expires_at),
    requested_quantity: Number.isFinite(Number(snapshot.requested_quantity))
      ? Number(snapshot.requested_quantity)
      : toInt(invite?.requested_quantity, 1),
    filled_quantity: Number.isFinite(Number(snapshot.filled_quantity))
      ? Number(snapshot.filled_quantity)
      : toInt(invite?.filled_quantity, 0),
    reserved_quantity: Number.isFinite(Number(snapshot.reserved_quantity))
      ? Number(snapshot.reserved_quantity)
      : toInt(invite?.reserved_quantity, 0),
    open_quantity: Number.isFinite(Number(snapshot.open_quantity))
      ? Number(snapshot.open_quantity)
      : toInt(invite?.open_quantity, 0),
    campaign_name: snapshot.campaign_name || invite?.campaign_name || null,
    personal_message: snapshot.personal_message || invite?.personal_message || null
  };
}

function buildWorkerRequestPriority(invite) {
  const score = Number(invite?.score) || 0;
  const openQuantity = toInt(invite?.open_quantity, toInt(parseInviteRequestSnapshot(invite?.request_snapshot)?.open_quantity, 0));
  const deadlineAt = invite?.expires_at ? new Date(invite.expires_at) : null;
  const msUntilDeadline = deadlineAt && !Number.isNaN(deadlineAt.getTime()) ? deadlineAt.getTime() - Date.now() : null;

  if (msUntilDeadline != null && msUntilDeadline <= 12 * 60 * 60 * 1000) {
    return { level: "high", label: "Zeitkritisch", sort_order: 3 };
  }
  if (openQuantity > 0 && openQuantity <= 1) {
    return { level: "high", label: "Letzter offener Platz", sort_order: 3 };
  }
  if (score >= 80) {
    return { level: "high", label: "Hohe Priorität", sort_order: 3 };
  }
  if (score >= 60) {
    return { level: "medium", label: "Guter Match", sort_order: 2 };
  }
  return { level: "normal", label: "Offene Anfrage", sort_order: 1 };
}

function summarizeSchedulingConflicts(conflicts = []) {
  const assignmentCount = conflicts.filter((entry) => entry.conflict_type === "assignment").length;
  const reservationCount = conflicts.filter((entry) => entry.conflict_type === "reservation").length;
  if (!assignmentCount && !reservationCount) {
    return { count: 0, label: "Keine Konflikte" };
  }

  const parts = [];
  if (assignmentCount) parts.push(`${assignmentCount} Einsatz${assignmentCount === 1 ? "" : "e"}`);
  if (reservationCount) parts.push(`${reservationCount} Reservierung${reservationCount === 1 ? "" : "en"}`);
  return {
    count: conflicts.length,
    label: `Überschneidung mit ${parts.join(" und ")}`
  };
}

function normalizeReminderMinutes(value) {
  return clamp(toInt(value, DEFAULT_STAFFING_REMINDER_MINUTES), MIN_STAFFING_REMINDER_MINUTES, 10080);
}

function resolveReminderTarget(invite, requestedMinutes = DEFAULT_STAFFING_REMINDER_MINUTES) {
  const normalizedMinutes = normalizeReminderMinutes(requestedMinutes);
  const now = Date.now();
  let targetTs = now + (normalizedMinutes * 60 * 1000);

  if (invite?.expires_at) {
    const expiresAt = new Date(invite.expires_at).getTime();
    if (Number.isFinite(expiresAt)) {
      const latestReminderTs = expiresAt - (5 * 60 * 1000);
      if (latestReminderTs <= now) return { error: "INVITE_EXPIRES_TOO_SOON" };
      targetTs = Math.min(targetTs, latestReminderTs);
      if (targetTs - now < MIN_STAFFING_REMINDER_MINUTES * 60 * 1000) {
        return { error: "INVITE_EXPIRES_TOO_SOON" };
      }
    }
  }

  return {
    remindAfter: new Date(targetTs),
    reminderMinutes: Math.max(Math.round((targetTs - now) / 60000), MIN_STAFFING_REMINDER_MINUTES)
  };
}

async function writeStaffingEvent(client, {
  assignmentId,
  campaignId = null,
  inviteId = null,
  reservationId = null,
  choiceSetId = null,
  choiceOptionId = null,
  actorId = null,
  eventType,
  oldValues = null,
  newValues = null,
  meta = null
}) {
  await client.query(
    `INSERT INTO assignment_staffing_events
       (assignment_id, campaign_id, invite_id, reservation_id, choice_set_id, choice_option_id, actor_id, event_type, old_values, new_values, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      assignmentId,
      campaignId,
      inviteId,
      reservationId,
      choiceSetId,
      choiceOptionId,
      actorId,
      eventType,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      meta ? JSON.stringify(meta) : null
    ]
  );
}

async function writeStaffingMessage(client, {
  assignmentId,
  campaignId = null,
  inviteId,
  workerUserId,
  actorId = null,
  senderRole,
  messageType,
  body = null,
  meta = null
}) {
  const { rows } = await client.query(
    `INSERT INTO assignment_staffing_messages
       (assignment_id, campaign_id, invite_id, worker_user_id, actor_id, sender_role, message_type, body, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      assignmentId,
      campaignId,
      inviteId,
      workerUserId,
      actorId,
      senderRole,
      messageType,
      body,
      meta ? JSON.stringify(meta) : JSON.stringify({})
    ]
  );
  return rows[0] || null;
}

async function loadAssignmentContext(db, assignmentId, supplierOrgId = null, { lock = false } = {}) {
  const params = [assignmentId];
  let whereClause = "a.id = $1";

  if (supplierOrgId) {
    params.push(supplierOrgId);
    whereClause += ` AND a.supplier_org_id = $${params.length}`;
  }

  const { rows } = await db.query(
    `SELECT a.*, buyer.name AS client_org_name, supplier.name AS supplier_org_name,
            r.title AS requisition_title, r.role AS requisition_role,
            r.skill_tags AS requisition_skill_tags,
            r.qualifications AS requisition_qualifications,
            r.location_city AS requisition_location_city,
            r.latitude AS requisition_location_lat,
            r.longitude AS requisition_location_lng,
            r.radius_km AS requisition_radius_km,
            r.shift_requirements AS requisition_shift_requirements,
            dr.title AS demand_title, dr.role AS demand_role,
            dr.skill_tags AS demand_skill_tags,
            dr.requirements AS demand_requirements,
            dr.location_city AS demand_location_city,
            dr.location_lat AS demand_location_lat,
            dr.location_lng AS demand_location_lng,
            dr.radius_km AS demand_radius_km,
            dr.shifts AS demand_shifts,
            dr.required_total_count, dr.currently_committed_count, dr.remaining_open_count,
            dr.status AS demand_status,
            off.offered_quantity, off.notes AS offer_notes
     FROM assignments a
     LEFT JOIN organizations buyer ON buyer.id = a.org_id
     LEFT JOIN organizations supplier ON supplier.id = a.supplier_org_id
     LEFT JOIN requisitions r ON r.id = a.requisition_id
     LEFT JOIN demand_requests dr ON dr.id = a.demand_request_id
     LEFT JOIN offers off ON off.id = a.offer_id
     WHERE ${whereClause}${lock ? " FOR UPDATE OF a" : ""}`,
    params
  );

  return rows[0] || null;
}
async function touchCampaignAutoBackfillHeartbeat(client, campaignId) {
  if (!campaignId) return null;
  const { rows } = await client.query(
    `UPDATE assignment_staffing_campaigns
     SET last_auto_backfill_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [campaignId]
  );
  return rows[0] || null;
}

function buildStaffingDeliveryJobId(inviteId, kind = "initial") {
  return `staffing:${kind}:${inviteId}`;
}

async function loadInviteDeliveryContext(db, inviteId) {
  const { rows } = await db.query(
    `SELECT i.*, c.name AS campaign_name, c.created_by AS campaign_created_by,
            COALESCE(c.source_campaign_id, c.id) AS root_campaign_id,
            a.worker_description, a.start_date, a.planned_end_date, a.open_quantity,
            buyer.name AS client_org_name,
            wp.first_name, wp.last_name, u.email
     FROM assignment_staffing_invites i
     JOIN assignment_staffing_campaigns c ON c.id = i.campaign_id
     LEFT JOIN assignment_staffing_choice_options cso ON cso.invite_id = i.id
     LEFT JOIN assignment_staffing_choice_sets cs ON cs.id = cso.choice_set_id
     JOIN assignments a ON a.id = i.assignment_id
     LEFT JOIN organizations buyer ON buyer.id = a.org_id
     LEFT JOIN worker_profiles wp ON wp.user_id = i.worker_user_id
     LEFT JOIN users u ON u.id = i.worker_user_id
     WHERE i.id = $1`,
    [inviteId]
  );
  return rows[0] || null;
}

async function markInviteDeliveryQueued(db, inviteId, kind = "initial") {
  const { rows } = await db.query(
    `UPDATE assignment_staffing_invites
     SET delivery_status = 'queued',
         delivery_last_error = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [inviteId]
  );
  const invite = rows[0] || null;
  if (!invite) return null;

  await writeStaffingEvent(db, {
    assignmentId: invite.assignment_id,
    campaignId: invite.campaign_id,
    inviteId,
    eventType: "invite_delivery_queued",
    newValues: { kind, delivery_status: "queued" }
  });
  return invite;
}

async function markInviteDeliveryOutcome(db, invite, {
  kind = "initial",
  errorMessage = null
}) {
  const isReminder = kind === "reminder";
  const nextStatus = errorMessage ? "failed" : "delivered";
  await db.query(
    `UPDATE assignment_staffing_invites
     SET delivery_status = $2,
         delivery_attempt_count = delivery_attempt_count + 1,
         delivery_last_attempt_at = NOW(),
         delivery_last_success_at = CASE WHEN $3::TEXT IS NULL THEN NOW() ELSE delivery_last_success_at END,
         delivery_last_error = $3,
         remind_after = CASE WHEN $4 AND $3::TEXT IS NULL THEN NULL ELSE remind_after END,
         last_reminder_sent_at = CASE WHEN $4 AND $3::TEXT IS NULL THEN NOW() ELSE last_reminder_sent_at END,
         reminder_count = CASE WHEN $4 AND $3::TEXT IS NULL THEN reminder_count + 1 ELSE reminder_count END,
         updated_at = NOW()
     WHERE id = $1`,
    [invite.id, nextStatus, errorMessage, isReminder]
  );

  await writeStaffingEvent(db, {
    assignmentId: invite.assignment_id,
    campaignId: invite.campaign_id,
    inviteId: invite.id,
    eventType: errorMessage
      ? "invite_delivery_failed"
      : (isReminder ? "invite_reminder_sent" : "invite_delivered"),
    newValues: errorMessage
      ? { kind, delivery_status: nextStatus, error: errorMessage }
      : { kind, delivery_status: nextStatus }
  });

  if (isReminder && !errorMessage) {
    await writeStaffingMessage(db, {
      assignmentId: invite.assignment_id,
      campaignId: invite.campaign_id,
      inviteId: invite.id,
      workerUserId: invite.worker_user_id,
      senderRole: "system",
      messageType: "reminder_sent",
      body: "Erinnerung zur offenen Staffing-Anfrage gesendet.",
      meta: { remind_after: invite.remind_after }
    });
  }
}

async function deliverStaffingInviteNotification(db, inviteId, {
  kind = "initial"
} = {}) {
  const invite = await loadInviteDeliveryContext(db, inviteId);
  if (!invite) return { skipped: "INVITE_NOT_FOUND" };
  if (!LIVE_INVITE_STATUSES.has(invite.status)) return { skipped: "INVITE_NOT_LIVE" };
  if (kind === "reminder" && (!invite.remind_after || new Date(invite.remind_after).getTime() > Date.now())) {
    return { skipped: "REMINDER_NOT_DUE" };
  }

  try {
    const notifyContext = buildStaffingNotificationContext(invite);
    if (kind === "reminder") {
      await workerNotifications.notifyStaffingRequestReminder(
        db,
        invite.worker_user_id,
        invite.id,
        notifyContext,
        { throwOnError: true }
      );
    } else {
      await workerNotifications.notifyStaffingRequestNew(
        db,
        invite.worker_user_id,
        invite.id,
        notifyContext,
        { throwOnError: true }
      );
    }
    await markInviteDeliveryOutcome(db, invite, { kind });
    return { delivered: true, kind };
  } catch (error) {
    await markInviteDeliveryOutcome(db, invite, {
      kind,
      errorMessage: String(error?.message || "DELIVERY_FAILED").slice(0, 500)
    }).catch(() => {});
    throw error;
  }
}

async function queueStaffingInviteDelivery(db, inviteId, {
  kind = "initial"
} = {}) {
  const queuedInvite = await markInviteDeliveryQueued(db, inviteId, kind);
  if (!queuedInvite) return { skipped: "INVITE_NOT_FOUND" };

  const queuedJob = await enqueue(
    staffingQueue,
    "staffing-invite-deliver",
    { inviteId, kind },
    {
      jobId: buildStaffingDeliveryJobId(inviteId, kind),
      removeOnComplete: 100,
      removeOnFail: 100
    }
  );

  if (queuedJob) {
    return { queued: true, job_id: queuedJob.id || buildStaffingDeliveryJobId(inviteId, kind) };
  }

  return deliverStaffingInviteNotification(db, inviteId, { kind });
}

async function queueStaffingInviteDeliveries(db, invites = [], { kind = "initial" } = {}) {
  for (const invite of invites) {
    await queueStaffingInviteDelivery(db, invite.id, { kind });
  }
}

export function processStaffingDeliveryJob(pool, {
  inviteId,
  kind = "initial"
}) {
  return deliverStaffingInviteNotification(pool, inviteId, { kind });
}

async function refreshCampaignMetrics(client, campaignId) {
  const { rows: campaignRows } = await client.query(
    `SELECT id, assignment_id, status, completed_at
     FROM assignment_staffing_campaigns
     WHERE id = $1
     FOR UPDATE`,
    [campaignId]
  );
  const campaign = campaignRows[0];
  if (!campaign) return null;

  const { rows: metricRows } = await client.query(
    `SELECT COUNT(*)::INT AS total_count,
            COUNT(*) FILTER (WHERE status = 'viewed')::INT AS viewed_count,
            COUNT(*) FILTER (WHERE status = 'interested')::INT AS interested_count,
            COUNT(*) FILTER (WHERE status = 'accepted')::INT AS accepted_count,
            COUNT(*) FILTER (WHERE status = 'declined')::INT AS declined_count,
            COUNT(*) FILTER (WHERE status = 'expired')::INT AS expired_count,
            COUNT(*) FILTER (WHERE status = 'cancelled')::INT AS cancelled_count,
            COUNT(*) FILTER (WHERE status IN ('sent','viewed','interested','accepted'))::INT AS live_count
     FROM assignment_staffing_invites
     WHERE campaign_id = $1`,
    [campaignId]
  );
  const metrics = metricRows[0] || {};
  const totalCount = toInt(metrics.total_count, 0);
  const liveCount = toInt(metrics.live_count, 0);

  let nextStatus = campaign.status;
  if (campaign.status === "active" && totalCount > 0 && liveCount === 0) {
    nextStatus = "completed";
  }

  const { rows } = await client.query(
    `UPDATE assignment_staffing_campaigns
     SET status = $2,
         sent_count = $3,
         viewed_count = $4,
         interested_count = $5,
         accepted_count = $6,
         declined_count = $7,
         expired_count = $8,
         cancelled_count = $9,
         completed_at = CASE
           WHEN $2 IN ('completed','auto_stopped') THEN COALESCE(completed_at, NOW())
           ELSE completed_at
         END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      campaignId,
      nextStatus,
      totalCount,
      toInt(metrics.viewed_count, 0),
      toInt(metrics.interested_count, 0),
      toInt(metrics.accepted_count, 0),
      toInt(metrics.declined_count, 0),
      toInt(metrics.expired_count, 0),
      toInt(metrics.cancelled_count, 0)
    ]
  );

  return rows[0] || null;
}

async function syncDemandCoverage(client, assignment, staffing) {
  if (!assignment?.demand_request_id) return null;

  const { rows } = await client.query(
    `SELECT id, status, required_total_count, headcount, fulfilled_at
     FROM demand_requests
     WHERE id = $1
     FOR UPDATE`,
    [assignment.demand_request_id]
  );
  const demand = rows[0];
  if (!demand || ["closed", "cancelled", "expired"].includes(demand.status)) return demand;

  const required = Math.max(
    1,
    toInt(demand.required_total_count ?? demand.headcount ?? staffing.requested_quantity, staffing.requested_quantity)
  );
  const committed = clamp(staffing.filled_quantity + staffing.reserved_quantity, 0, required);
  const remaining = Math.max(required - committed, 0);
  const nextStatus = committed >= required ? "fulfilled" : "partially_covered";

  const { rows: updatedRows } = await client.query(
    `UPDATE demand_requests
     SET currently_committed_count = $2,
         remaining_open_count = $3,
         status = $4,
         fulfilled_at = CASE
           WHEN $4 = 'fulfilled' THEN COALESCE(fulfilled_at, NOW())
           ELSE NULL
         END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [demand.id, committed, remaining, nextStatus]
  );

  return updatedRows[0] || demand;
}

export function deriveStaffingStatus(assignment, {
  filledQuantity,
  reservedQuantity,
  openQuantity,
  sourcingCount
}) {
  if (assignment?.status === "cancelled") return "cancelled";
  if (assignment?.status === "completed") return "closed";
  if (openQuantity <= 0 && filledQuantity >= getAssignmentRequestedQuantity(assignment)) return "filled";
  if (filledQuantity > 0) return "partially_filled";
  if (reservedQuantity > 0 || sourcingCount > 0) return "sourcing";
  return "open";
}

export async function recalcAssignmentStaffing(db, assignmentId, { lock = false, writeEvent = true } = {}) {
  const assignment = await loadAssignmentContext(db, assignmentId, null, { lock });
  if (!assignment) return null;

  const requestedQuantity = getAssignmentRequestedQuantity(assignment);
  const { rows: countRows } = await db.query(
    `SELECT
        COALESCE((
          SELECT COUNT(*)::INT
          FROM worker_assignment_links wal
          WHERE wal.assignment_id = $1
            AND wal.is_active = TRUE
            AND wal.worker_confirmation_status IN ('auto_confirmed','worker_confirmed')
        ), 0) AS filled_quantity,
        COALESCE((
          SELECT COUNT(*)::INT
          FROM worker_assignment_links wal
          WHERE wal.assignment_id = $1
            AND wal.is_active = TRUE
            AND wal.worker_confirmation_status = 'pending_confirmation'
        ), 0) AS pending_quantity,
        COALESCE((
          SELECT COUNT(*)::INT
          FROM assignment_staffing_reservations r
          WHERE r.assignment_id = $1
            AND r.status = 'reserved'
            AND (r.expires_at IS NULL OR r.expires_at > NOW())
        ), 0) AS reservation_quantity,
        COALESCE((
          SELECT COUNT(*)::INT
          FROM assignment_staffing_invites i
          WHERE i.assignment_id = $1
            AND i.status IN ('sent','viewed','interested','accepted')
            AND (i.expires_at IS NULL OR i.expires_at > NOW())
        ), 0) AS live_invite_quantity`,
    [assignmentId]
  );

  const counters = countRows[0] || {};
  const filledQuantity = toInt(counters.filled_quantity, 0);
  const reservedQuantity = toInt(counters.pending_quantity, 0) + toInt(counters.reservation_quantity, 0);
  const openQuantity = Math.max(requestedQuantity - filledQuantity - reservedQuantity, 0);
  const staffingStatus = deriveStaffingStatus(assignment, {
    filledQuantity,
    reservedQuantity,
    openQuantity,
    sourcingCount: toInt(counters.live_invite_quantity, 0)
  });

  const oldValues = {
    requested_quantity: assignment.requested_quantity,
    filled_quantity: assignment.filled_quantity,
    reserved_quantity: assignment.reserved_quantity,
    open_quantity: assignment.open_quantity,
    staffing_status: assignment.staffing_status
  };

  const { rows } = await db.query(
    `UPDATE assignments
     SET requested_quantity = $2,
         worker_count = $2,
         filled_quantity = $3,
         reserved_quantity = $4,
         open_quantity = $5,
         staffing_status = $6,
         staffing_last_recalculated_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [assignmentId, requestedQuantity, filledQuantity, reservedQuantity, openQuantity, staffingStatus]
  );

  const updated = { ...assignment, ...(rows[0] || {}) };
  await syncDemandCoverage(db, updated, {
    requested_quantity: requestedQuantity,
    filled_quantity: filledQuantity,
    reserved_quantity: reservedQuantity,
    open_quantity: openQuantity
  });

  if (writeEvent) {
    const changed = Object.keys(oldValues).some((key) => oldValues[key] !== updated[key]);
    await writeStaffingEvent(db, {
      assignmentId,
      eventType: "assignment_staffing_recalculated",
      oldValues: changed ? oldValues : null,
      newValues: {
        requested_quantity: updated.requested_quantity,
        filled_quantity: updated.filled_quantity,
        reserved_quantity: updated.reserved_quantity,
        open_quantity: updated.open_quantity,
        staffing_status: updated.staffing_status
      }
    });
  }

  return updated;
}

async function getWorkerSchedulingConflicts(client, workerUserId, startDate, endDate, {
  excludeAssignmentId = null,
  excludeReservationId = null
} = {}) {
  const { rows } = await client.query(
    `SELECT 'assignment'::TEXT AS conflict_type,
            wal.id AS conflict_id,
            wal.assignment_id,
            a.worker_description AS title,
            wal.start_date,
            wal.end_date AS planned_end_date,
            wal.worker_confirmation_status AS status
     FROM worker_assignment_links wal
     JOIN assignments a ON a.id = wal.assignment_id
     WHERE wal.worker_user_id = $1
       AND wal.is_active = TRUE
       AND wal.worker_confirmation_status NOT IN ('worker_declined','worker_unavailable')
       AND ${staffingAssignmentLinkIsCurrentSql}
       AND wal.start_date <= $3
       AND (wal.end_date IS NULL OR wal.end_date >= $2)
       AND ($4::uuid IS NULL OR wal.assignment_id <> $4)
     UNION ALL
     SELECT 'reservation'::TEXT AS conflict_type,
            r.id AS conflict_id,
            r.assignment_id,
            a.worker_description AS title,
            a.start_date,
            a.planned_end_date,
            r.status
     FROM assignment_staffing_reservations r
     JOIN assignments a ON a.id = r.assignment_id
     WHERE r.worker_user_id = $1
       AND r.status = 'reserved'
       AND (r.expires_at IS NULL OR r.expires_at > NOW())
       AND a.start_date <= $3
       AND (a.planned_end_date IS NULL OR a.planned_end_date >= $2)
       AND ($4::uuid IS NULL OR r.assignment_id <> $4)
       AND ($5::uuid IS NULL OR r.id <> $5)
     ORDER BY start_date ASC NULLS LAST, planned_end_date ASC NULLS LAST`,
    [
      workerUserId,
      dateOnly(startDate),
      dateOnly(endDate) || "9999-12-31",
      excludeAssignmentId,
      excludeReservationId
    ]
  );
  return rows.map((row) => ({
    ...row,
    id: row.conflict_id
  }));
}


async function createWorkerAssignmentLink(client, {
  assignment,
  workerUserId,
  createdBy,
  workerConfirmationStatus,
  note = null
}) {
  const { rows: existingRows } = await client.query(
    `SELECT id
     FROM worker_assignment_links
     WHERE assignment_id = $1
       AND worker_user_id = $2
     LIMIT 1`,
    [assignment.id, workerUserId]
  );
  if (existingRows[0]) {
    return { error: "WORKER_ALREADY_LINKED", existing_link_id: existingRows[0].id };
  }

  const defaultHoursPerDay = 8;
  const defaultBreakMinutes = 30;
  const clientName = assignment.client_org_name || null;
  const workerConfirmedAt = workerConfirmationStatus === "worker_confirmed" ? new Date() : null;

  const { rows } = await client.query(
    `INSERT INTO worker_assignment_links
       (worker_user_id, assignment_id, org_id, supplier_org_id,
        deal_request_id, default_hours_per_day, default_break_minutes,
        start_date, end_date, client_name, notes, created_by,
        worker_confirmation_status, worker_confirmed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      workerUserId,
      assignment.id,
      assignment.org_id,
      assignment.supplier_org_id,
      assignment.deal_request_id || null,
      defaultHoursPerDay,
      defaultBreakMinutes,
      assignment.start_date,
      assignment.planned_end_date || null,
      clientName,
      note || null,
      createdBy || null,
      workerConfirmationStatus,
      workerConfirmedAt
    ]
  );

  return { link: rows[0] || null };
}

async function promoteReservationInternal(client, reservation, {
  actorId,
  note = null
}) {
  const assignment = await loadAssignmentContext(client, reservation.assignment_id, null, { lock: true });
  if (!assignment) return { error: "ASSIGNMENT_NOT_FOUND" };

  if (!ASSIGNABLE_STATUSES.has(assignment.status)) {
    return { error: "ASSIGNMENT_NOT_ASSIGNABLE", status: assignment.status };
  }

  if (reservation.status !== "reserved") {
    return { error: "RESERVATION_NOT_ACTIVE", current_status: reservation.status };
  }

  if (reservation.expires_at && new Date(reservation.expires_at).getTime() <= Date.now()) {
    await client.query(
      `UPDATE assignment_staffing_reservations
       SET status = 'expired',
           released_at = NOW(),
           release_reason = 'timeout',
           updated_at = NOW()
       WHERE id = $1`,
      [reservation.id]
    );
    return { error: "RESERVATION_EXPIRED" };
  }

  const conflicts = await getWorkerSchedulingConflicts(
    client,
    reservation.worker_user_id,
    assignment.start_date,
    assignment.planned_end_date || "9999-12-31",
    { excludeReservationId: reservation.id }
  );
  if (conflicts.length > 0) {
    return {
      error: "SCHEDULE_CONFLICT",
      conflicts,
      conflicting_link_ids: conflicts
        .filter((entry) => entry.conflict_type === "assignment")
        .map((entry) => entry.id),
      conflicting_reservation_ids: conflicts
        .filter((entry) => entry.conflict_type === "reservation")
        .map((entry) => entry.id)
    };
  }

  const linkResult = await createWorkerAssignmentLink(client, {
    assignment,
    workerUserId: reservation.worker_user_id,
    createdBy: actorId,
    workerConfirmationStatus: "worker_confirmed",
    note
  });
  if (linkResult.error) return linkResult;

  const { rows } = await client.query(
    `UPDATE assignment_staffing_reservations
     SET status = 'promoted',
         promoted_at = NOW(),
         promoted_link_id = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [reservation.id, linkResult.link.id]
  );

  await writeStaffingEvent(client, {
    assignmentId: reservation.assignment_id,
    campaignId: reservation.campaign_id,
    inviteId: reservation.invite_id,
    reservationId: reservation.id,
    actorId,
    eventType: "reservation_promoted",
    newValues: { promoted_link_id: linkResult.link.id }
  });
  await updateWaitlistCandidateState(client, {
    assignmentId: reservation.assignment_id,
    workerUserId: reservation.worker_user_id,
    status: "assigned",
    rootCampaignId: await getAssignmentWaitlistRootCampaignId(client, reservation.assignment_id),
    campaignId: reservation.campaign_id || null,
    inviteId: reservation.invite_id || null,
    reservationId: reservation.id,
    linkId: linkResult.link.id,
    actorId
  });

  const updatedAssignment = await recalcAssignmentStaffing(client, reservation.assignment_id, { lock: true, writeEvent: false });
  await syncStaffingChoiceSetsForAssignmentLink(client, {
    assignmentId: reservation.assignment_id,
    workerUserId: reservation.worker_user_id,
    linkId: linkResult.link.id,
    actorId,
    note
  });
  return {
    reservation: rows[0] || reservation,
    link: linkResult.link,
    assignment: updatedAssignment
  };
}

async function autoStopIfFilled(client, assignmentId, actorId = null) {
  const staffing = await recalcAssignmentStaffing(client, assignmentId, { lock: true, writeEvent: false });
  if (!staffing || staffing.open_quantity > 0) return staffing;

  await client.query(
    `UPDATE assignment_staffing_invites
     SET status = 'cancelled',
         cancelled_at = NOW(),
         responded_at = COALESCE(responded_at, NOW()),
         updated_at = NOW(),
         response_note = COALESCE(response_note, 'AUTO_STOP_FILLED')
     WHERE assignment_id = $1
       AND status IN ('sent','viewed','interested')`,
    [assignmentId]
  );
  await client.query(
    `UPDATE assignment_staffing_waitlist
     SET status = 'removed',
         removed_at = COALESCE(removed_at, NOW()),
         removal_reason = COALESCE(removal_reason, 'assignment_filled'),
         updated_at = NOW()
     WHERE assignment_id = $1
       AND status IN ('queued','invited')`,
    [assignmentId]
  );

  const { rows: campaignRows } = await client.query(
    `SELECT id
     FROM assignment_staffing_campaigns
     WHERE assignment_id = $1
       AND status = 'active'`,
    [assignmentId]
  );

  for (const campaign of campaignRows) {
    await client.query(
      `UPDATE assignment_staffing_campaigns
       SET status = 'auto_stopped',
           completed_at = COALESCE(completed_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [campaign.id]
    );
    await refreshCampaignMetrics(client, campaign.id);
  }

  await writeStaffingEvent(client, {
    assignmentId,
    actorId,
    eventType: "assignment_auto_stopped",
    newValues: { open_quantity: 0 }
  });

  return recalcAssignmentStaffing(client, assignmentId, { lock: true, writeEvent: false });
}

export function autoStopFilledAssignment(pool, assignmentId, actorId = null) {
  return withTransaction(pool, (client) => autoStopIfFilled(client, assignmentId, actorId));
}
function tokenizeText(value) {
  if (!value) return [];
  return uniqueStrings(
    String(value)
      .toLowerCase()
      .split(/[^a-z0-9äöüß]+/gi)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length >= 2)
  );
}

function computeNeedleCoverage(needle, corpusTokens, corpusText) {
  const normalizedNeedle = String(needle || "").trim().toLowerCase();
  if (!normalizedNeedle) {
    return { isMatch: true, matchedTokens: [], ratio: 1 };
  }

  if (String(corpusText || "").includes(normalizedNeedle)) {
    const tokens = tokenizeText(normalizedNeedle);
    return { isMatch: true, matchedTokens: tokens, ratio: 1 };
  }

  const needleTokens = tokenizeText(normalizedNeedle);
  if (!needleTokens.length) {
    return { isMatch: false, matchedTokens: [], ratio: 0 };
  }

  const matchedTokens = needleTokens.filter((token) => corpusTokens.includes(token));
  const ratio = matchedTokens.length / needleTokens.length;
  return {
    isMatch: ratio >= 0.6,
    matchedTokens,
    ratio
  };
}

function createFactorScore(factor, points, max, detail, { applicable = true } = {}) {
  return {
    factor,
    points: clamp(Math.round(Number(points) || 0), 0, max),
    max,
    applicable,
    detail
  };
}

function createReason(code, label, weight, kind = "factor") {
  return { code, label, weight, kind };
}

function summarizeFactorReasons(factorScores) {
  return factorScores
    .filter((entry) => entry.applicable && entry.points > 0)
    .sort((left, right) => {
      if (right.points !== left.points) return right.points - left.points;
      return right.max - left.max;
    })
    .map((entry) => createReason(entry.factor, entry.detail, entry.points, "factor"));
}

function evaluateWorkerDistance(requirements, worker) {
  const targetLat = Number(requirements.location_lat);
  const targetLng = Number(requirements.location_lng);
  const workerLat = Number(worker.worker_latitude);
  const workerLng = Number(worker.worker_longitude);
  const weight = WORKER_SUGGESTION_FACTOR_WEIGHTS.distanceScore;
  const radiusKm = Math.max(1, toInt(requirements.radius_km, 25));

  if (
    Number.isFinite(targetLat)
    && Number.isFinite(targetLng)
    && Number.isFinite(workerLat)
    && Number.isFinite(workerLng)
  ) {
    const distanceKm = haversineKm(targetLat, targetLng, workerLat, workerLng);
    if (distanceKm <= radiusKm) {
      const proximityRatio = Math.max(0, 1 - (distanceKm / radiusKm));
      const points = Math.max(3, Math.round((0.35 + (proximityRatio * 0.65)) * weight));
      return createFactorScore(
        "distanceScore",
        points,
        weight,
        `${Math.round(distanceKm)} km Entfernung (Radius ${radiusKm} km)`
      );
    }
    if (distanceKm <= radiusKm * 2) {
      const overflowRatio = Math.max(0, 1 - ((distanceKm - radiusKm) / radiusKm));
      return createFactorScore(
        "distanceScore",
        Math.round(overflowRatio * (weight * 0.35)),
        weight,
        `${Math.round(distanceKm)} km entfernt (außerhalb ${radiusKm} km Radius)`
      );
    }
    return createFactorScore(
      "distanceScore",
      0,
      weight,
      `${Math.round(distanceKm)} km entfernt (deutlich außerhalb ${radiusKm} km Radius)`
    );
  }

  const targetCity = String(requirements.location_city || "").trim().toLowerCase();
  const workerCity = String(worker.city || "").trim().toLowerCase();
  if (targetCity && workerCity) {
    if (targetCity === workerCity) {
      return createFactorScore("distanceScore", 11, weight, `Ort passt: ${worker.city}`);
    }
    if (targetCity.includes(workerCity) || workerCity.includes(targetCity)) {
      return createFactorScore("distanceScore", 6, weight, `Nahe am Einsatzort: ${worker.city}`);
    }
    return createFactorScore("distanceScore", 0, weight, `Anderer Ort: ${worker.city}`);
  }

  return createFactorScore(
    "distanceScore",
    0,
    weight,
    "Keine belastbaren Standortdaten verfügbar",
    { applicable: false }
  );
}

function dedupeQuickAssignBlockers(items) {
  const deduped = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const code = String(item?.code || "").trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    deduped.push({
      code,
      label: item?.label || code
    });
  }
  return deduped;
}

export function getSuggestionQuickAssignState(suggestion) {
  if (!suggestion) {
    return {
      quick_assign_eligible: false,
      quick_assign_blockers: [{
        code: "not_suggested",
        label: "Kein aktueller Staffing-Vorschlag vorhanden."
      }]
    };
  }

  const blockers = [
    ...(Array.isArray(suggestion.hard_failures) ? suggestion.hard_failures : []),
    ...(Array.isArray(suggestion.missing_requirements) ? suggestion.missing_requirements : []),
    ...(suggestion.has_open_invite ? [{
      code: "open_invite",
      label: "Offene Staffing-Anfrage läuft bereits"
    }] : []),
    ...(suggestion.already_contacted ? [{
      code: "already_contacted",
      label: "Für diesen Bedarf bereits kontaktiert"
    }] : [])
  ];

  const quickAssignBlockers = dedupeQuickAssignBlockers(blockers);
  return {
    quick_assign_eligible: quickAssignBlockers.length === 0,
    quick_assign_blockers: quickAssignBlockers
  };
}

function scoreWorkersForAssignment(_client, assignment, workerRows, filters = {}) {
  const requirements = deriveAssignmentRequirements(assignment);
  const requiredSkillNeedle = String(filters.requiredSkill || "").trim().toLowerCase();
  const requiredQualificationNeedle = String(filters.requiredQualification || "").trim().toLowerCase();

  const scored = workerRows.map((worker) => {
    const workerSkills = uniqueStrings(parseStringList(worker.skill_tags));
    const workerQualifications = uniqueStrings([
      ...parseQualificationKeywords(worker.qualifications),
      ...parseStringList(worker.verified_doc_names)
    ]);
    const workerCorpusText = [
      ...workerSkills,
      ...workerQualifications,
      worker.profile_text,
      worker.availability_note,
      worker.city
    ].filter(Boolean).join(" ").toLowerCase();
    const workerCorpusTokens = uniqueStrings([
      ...workerSkills,
      ...workerQualifications,
      ...tokenizeText(worker.profile_text),
      ...tokenizeText(worker.availability_note),
      ...tokenizeText(worker.city)
    ]);

    if (requiredSkillNeedle && !workerSkills.includes(requiredSkillNeedle)) return null;
    if (
      requiredQualificationNeedle
      && !workerQualifications.some((entry) => entry.includes(requiredQualificationNeedle) || requiredQualificationNeedle.includes(entry))
    ) {
      return null;
    }

    const conflictCount = toInt(worker.conflict_count, 0);
    const reservationConflictCount = toInt(worker.reservation_conflict_count, 0);
    const currentAssignmentCount = toInt(worker.current_assignment_count, 0);
    const currentReservationCount = toInt(worker.current_reservation_count, 0);
    const activeAssignmentCount = toInt(worker.active_assignment_count, 0);
    const verifiedDocCount = toInt(worker.verified_doc_count, 0);
    const expiredDocCount = toInt(worker.expired_doc_count, 0);
    const sameClientAssignmentCount = toInt(worker.same_client_assignment_count, 0);
    const confirmedAssignmentCount = toInt(worker.confirmed_assignment_count, 0);
    const approvedSubmissionCount = toInt(worker.approved_submission_count, 0);
    const customerConfirmedSubmissionCount = toInt(worker.customer_confirmed_submission_count, 0);
    const postedSubmissionCount = toInt(worker.posted_submission_count, 0);
    const needsAttentionSubmissionCount = toInt(worker.needs_attention_submission_count, 0);
    const customerRejectedSubmissionCount = toInt(worker.customer_rejected_submission_count, 0);
    const openInviteCount = toInt(worker.open_invite_count, 0);
    const historicalInviteCount = toInt(worker.historical_invite_count, 0);
    const alreadyContacted = historicalInviteCount > 0;
    const hasOpenInvite = openInviteCount > 0;

    if (filters.onlyAvailable && (conflictCount > 0 || reservationConflictCount > 0)) return null;

    const skillOverlap = workerSkills.filter((skill) => requirements.required_skills.includes(skill));
    const missingSkills = requirements.required_skills.filter((required) => !workerSkills.includes(required));
    const qualificationOverlap = workerQualifications.filter((entry) =>
      requirements.required_qualifications.some((required) => entry.includes(required) || required.includes(entry))
    );
    const missingRequiredQualifications = requirements.required_qualifications.filter((required) =>
      !workerQualifications.some((entry) => entry.includes(required) || required.includes(entry))
    );
    const roleCoverage = computeNeedleCoverage(requirements.role, workerCorpusTokens, workerCorpusText);
    const shiftCoverage = computeNeedleCoverage(requirements.shift_model, workerCorpusTokens, workerCorpusText);

    const hardFailures = [];
    const missingRequirements = [];

    if (currentAssignmentCount > 0) {
      hardFailures.push({
        code: "already_assigned",
        label: "Bereits diesem Einsatz zugeordnet"
      });
    }
    if (currentReservationCount > 0) {
      hardFailures.push({
        code: "already_reserved",
        label: "Bereits für diesen Einsatz reserviert"
      });
    }
    if (conflictCount > 0 || reservationConflictCount > 0) {
      hardFailures.push({
        code: "schedule_conflict",
        label: "Terminüberschneidung mit laufendem Einsatz oder Reservierung"
      });
    }
    if (missingRequiredQualifications.length > 0) {
      hardFailures.push({
        code: "missing_required_qualifications",
        label: `Pflichtnachweise fehlen: ${missingRequiredQualifications.slice(0, 3).join(", ")}`
      });
    }
    if (requirements.role && !roleCoverage.isMatch) {
      missingRequirements.push({
        code: "role",
        label: `Rollenfit nicht sauber belegt: ${requirements.role}`
      });
    }
    if (requirements.shift_model && !shiftCoverage.isMatch) {
      missingRequirements.push({
        code: "shift",
        label: `Schichtfähigkeit nicht belegt: ${requirements.shift_model}`
      });
    }
    if (missingSkills.length > 0) {
      missingRequirements.push({
        code: "skills",
        label: `Fehlende Skill-Treffer: ${missingSkills.slice(0, 3).join(", ")}`
      });
    }

    const factorScores = [];
    factorScores.push(
      createFactorScore(
        "availabilityMatch",
        hardFailures.some((entry) => ["schedule_conflict", "already_assigned", "already_reserved"].includes(entry.code))
          ? 0
          : WORKER_SUGGESTION_FACTOR_WEIGHTS.availabilityMatch,
        WORKER_SUGGESTION_FACTOR_WEIGHTS.availabilityMatch,
        hardFailures.some((entry) => ["schedule_conflict", "already_assigned", "already_reserved"].includes(entry.code))
          ? "Nicht frei im angefragten Zeitraum"
          : "Im angefragten Zeitraum aktuell disponierbar"
      )
    );

    factorScores.push(
      createFactorScore(
        "skillMatch",
        requirements.required_skills.length
          ? Math.round((skillOverlap.length / requirements.required_skills.length) * WORKER_SUGGESTION_FACTOR_WEIGHTS.skillMatch)
          : 0,
        WORKER_SUGGESTION_FACTOR_WEIGHTS.skillMatch,
        requirements.required_skills.length
          ? `${skillOverlap.length}/${requirements.required_skills.length} Skills passend`
          : "Keine Pflicht-Skills strukturiert hinterlegt",
        { applicable: requirements.required_skills.length > 0 }
      )
    );

    factorScores.push(evaluateWorkerDistance(requirements, worker));

    let qualificationPoints = 0;
    const qualificationApplicable = requirements.required_qualifications.length > 0 || verifiedDocCount > 0 || workerQualifications.length > 0;
    if (requirements.required_qualifications.length > 0) {
      qualificationPoints = Math.round(
        (qualificationOverlap.length / requirements.required_qualifications.length) * WORKER_SUGGESTION_FACTOR_WEIGHTS.qualificationScore
      );
    } else if (verifiedDocCount > 0) {
      qualificationPoints = Math.min(
        WORKER_SUGGESTION_FACTOR_WEIGHTS.qualificationScore,
        verifiedDocCount * 3
      );
    }
    if (expiredDocCount > 0) {
      qualificationPoints = Math.max(0, qualificationPoints - Math.min(6, expiredDocCount * 2));
    }
    factorScores.push(
      createFactorScore(
        "qualificationScore",
        qualificationPoints,
        WORKER_SUGGESTION_FACTOR_WEIGHTS.qualificationScore,
        requirements.required_qualifications.length > 0
          ? `${qualificationOverlap.length}/${requirements.required_qualifications.length} Pflichtnachweise belegbar`
          : `${verifiedDocCount} verifizierte Nachweise`,
        { applicable: qualificationApplicable }
      )
    );

    const positiveReliabilitySignals = approvedSubmissionCount + customerConfirmedSubmissionCount + postedSubmissionCount;
    const negativeReliabilitySignals = needsAttentionSubmissionCount + customerRejectedSubmissionCount;
    const reliabilitySignalTotal = positiveReliabilitySignals + negativeReliabilitySignals;
    let reliabilityPoints = Math.round(
      ((reliabilitySignalTotal > 0 ? (positiveReliabilitySignals / reliabilitySignalTotal) : 0.6))
      * WORKER_SUGGESTION_FACTOR_WEIGHTS.reliabilityScore
    );
    if (expiredDocCount > 0) {
      reliabilityPoints = Math.max(0, reliabilityPoints - Math.min(3, expiredDocCount));
    }
    factorScores.push(
      createFactorScore(
        "reliabilityScore",
        reliabilityPoints,
        WORKER_SUGGESTION_FACTOR_WEIGHTS.reliabilityScore,
        reliabilitySignalTotal > 0
          ? `${positiveReliabilitySignals} positive Signale, ${negativeReliabilitySignals} Gegenläufer`
          : "Noch wenig belastbare Leistungs-Historie"
      )
    );

    factorScores.push(
      createFactorScore(
        "preferenceScore",
        Math.min(WORKER_SUGGESTION_FACTOR_WEIGHTS.preferenceScore, sameClientAssignmentCount * 2),
        WORKER_SUGGESTION_FACTOR_WEIGHTS.preferenceScore,
        sameClientAssignmentCount > 0
          ? `${sameClientAssignmentCount} frühere Einsätze beim gleichen Kunden`
          : "Noch keine Kundenvorerfahrung für diesen Auftrag"
      )
    );

    const experienceComposite = Math.min(1, confirmedAssignmentCount / 10) * 0.75
      + Math.min(1, sameClientAssignmentCount / 4) * 0.25;
    factorScores.push(
      createFactorScore(
        "experienceScore",
        Math.round(experienceComposite * WORKER_SUGGESTION_FACTOR_WEIGHTS.experienceScore),
        WORKER_SUGGESTION_FACTOR_WEIGHTS.experienceScore,
        `${confirmedAssignmentCount} bestätigte Einsätze, ${activeAssignmentCount} aktuell aktiv`
      )
    );

    const applicableFactorMax = factorScores
      .filter((entry) => entry.applicable)
      .reduce((sum, entry) => sum + entry.max, 0);
    const applicableFactorPoints = factorScores
      .filter((entry) => entry.applicable)
      .reduce((sum, entry) => sum + entry.points, 0);
    const softScore = applicableFactorMax > 0
      ? Math.round((applicableFactorPoints / applicableFactorMax) * 100)
      : 0;
    const hardMatch = hardFailures.length === 0 && missingRequirements.length === 0;
    const suggestionStatus = hardFailures.length > 0
      ? "blocked"
      : (hardMatch ? "hard_match" : "soft_match");
    const matchReasons = [
      ...hardFailures.map((entry) => createReason(entry.code, entry.label, -100, "hard_failure")),
      ...missingRequirements.map((entry) => createReason(entry.code, entry.label, -18, "missing_requirement")),
      ...summarizeFactorReasons(factorScores),
      ...(alreadyContacted ? [createReason("already_contacted", "Für diesen Bedarf bereits kontaktiert", -12, "history")] : []),
      ...(hasOpenInvite ? [createReason("open_invite", "Offene Staffing-Anfrage läuft bereits", -20, "history")] : [])
    ]
      .sort((left, right) => Math.abs(right.weight) - Math.abs(left.weight))
      .slice(0, 8);

    return {
      worker_user_id: worker.user_id,
      first_name: worker.first_name,
      last_name: worker.last_name,
      personnel_number: worker.personnel_number,
      city: worker.city,
      email: worker.email,
      worker_latitude: worker.worker_latitude ?? null,
      worker_longitude: worker.worker_longitude ?? null,
      active_assignment_count: activeAssignmentCount,
      confirmed_assignment_count: confirmedAssignmentCount,
      same_client_assignment_count: sameClientAssignmentCount,
      conflict_count: conflictCount,
      reservation_conflict_count: reservationConflictCount,
      current_assignment_count: currentAssignmentCount,
      current_reservation_count: currentReservationCount,
      open_invite_count: openInviteCount,
      historical_invite_count: historicalInviteCount,
      already_contacted: alreadyContacted,
      has_open_invite: hasOpenInvite,
      is_selectable: hardFailures.length === 0,
      can_invite: hardFailures.length === 0 && !alreadyContacted && !hasOpenInvite,
      hard_match: hardMatch,
      suggestion_status: suggestionStatus,
      score: softScore,
      soft_score: softScore,
      total_score: softScore,
      fit_label: suggestionStatus === "blocked"
        ? "blockiert"
        : (hardMatch
          ? (softScore >= 80 ? "hoch" : (softScore >= 60 ? "gut" : "solide"))
          : "weich"),
      hard_failures: hardFailures,
      missing_requirements: missingRequirements,
      factor_scores: factorScores,
      match_reasons: matchReasons
    };
  }).filter(Boolean);

  return scored.sort((left, right) => {
    const leftSelectable = left.is_selectable ? 1 : 0;
    const rightSelectable = right.is_selectable ? 1 : 0;
    if (rightSelectable !== leftSelectable) return rightSelectable - leftSelectable;

    const leftHardMatch = left.hard_match ? 1 : 0;
    const rightHardMatch = right.hard_match ? 1 : 0;
    if (rightHardMatch !== leftHardMatch) return rightHardMatch - leftHardMatch;

    if (right.total_score !== left.total_score) return right.total_score - left.total_score;
    if (right.same_client_assignment_count !== left.same_client_assignment_count) {
      return right.same_client_assignment_count - left.same_client_assignment_count;
    }
    if (right.confirmed_assignment_count !== left.confirmed_assignment_count) {
      return right.confirmed_assignment_count - left.confirmed_assignment_count;
    }

    const lastNameComparison = String(left.last_name || "").localeCompare(String(right.last_name || ""), "de");
    if (lastNameComparison !== 0) return lastNameComparison;
    const firstNameComparison = String(left.first_name || "").localeCompare(String(right.first_name || ""), "de");
    if (firstNameComparison !== 0) return firstNameComparison;
    return String(left.worker_user_id || "").localeCompare(String(right.worker_user_id || ""), "de");
  }).map((entry, index) => {
    const quickAssignState = getSuggestionQuickAssignState(entry);
    return {
      ...entry,
      rank: index + 1,
      quick_assign_eligible: quickAssignState.quick_assign_eligible,
      quick_assign_blockers: quickAssignState.quick_assign_blockers
    };
  });
}

async function queryWorkerSuggestionBase(client, assignment, limit = 50, workerIds = null) {
  const params = [
    assignment.supplier_org_id,
    assignment.id,
    dateOnly(assignment.start_date),
    dateOnly(assignment.planned_end_date) || "9999-12-31",
    assignment.org_id || null
  ];

  let workerFilterSql = "";
  if (workerIds && workerIds.length > 0) {
    params.push(workerIds);
    workerFilterSql = ` AND wp.user_id = ANY($${params.length}::uuid[])`;
  }

  params.push(clamp(limit, 1, 250));
  const limitParam = params.length;

  const { rows } = await client.query(
    `SELECT wp.user_id, wp.first_name, wp.last_name, wp.personnel_number, wp.city,
            wp.skill_tags, wp.qualifications, wp.profile_text, wp.availability_note,
            wp.is_active, u.email, u.latitude AS worker_latitude, u.longitude AS worker_longitude,
            COALESCE(link_stats.active_assignment_count, 0) AS active_assignment_count,
            COALESCE(link_stats.current_assignment_count, 0) AS current_assignment_count,
            COALESCE(link_stats.same_client_assignment_count, 0) AS same_client_assignment_count,
            COALESCE(link_stats.confirmed_assignment_count, 0) AS confirmed_assignment_count,
            COALESCE(conflicts.conflict_count, 0) AS conflict_count,
            COALESCE(reservations.reservation_conflict_count, 0) AS reservation_conflict_count,
            COALESCE(reservations.current_reservation_count, 0) AS current_reservation_count,
            COALESCE(docs.verified_doc_count, 0) AS verified_doc_count,
            COALESCE(docs.expired_doc_count, 0) AS expired_doc_count,
            COALESCE(docs.verified_doc_names, ARRAY[]::TEXT[]) AS verified_doc_names,
            COALESCE(invite_stats.open_invite_count, 0) AS open_invite_count,
            COALESCE(invite_stats.historical_invite_count, 0) AS historical_invite_count,
            COALESCE(submission_stats.approved_submission_count, 0) AS approved_submission_count,
            COALESCE(submission_stats.customer_confirmed_submission_count, 0) AS customer_confirmed_submission_count,
            COALESCE(submission_stats.posted_submission_count, 0) AS posted_submission_count,
            COALESCE(submission_stats.needs_attention_submission_count, 0) AS needs_attention_submission_count,
            COALESCE(submission_stats.customer_rejected_submission_count, 0) AS customer_rejected_submission_count
     FROM worker_profiles wp
     JOIN users u ON u.id = wp.user_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*) FILTER (
                WHERE wal.is_active = TRUE
                  AND wal.worker_confirmation_status NOT IN ('worker_declined','worker_unavailable')
                  AND ${staffingAssignmentLinkIsCurrentSql}
              )::INT AS active_assignment_count,
              COUNT(*) FILTER (
                WHERE wal.assignment_id = $2
                  AND wal.is_active = TRUE
                  AND wal.worker_confirmation_status NOT IN ('worker_declined','worker_unavailable')
                  AND ${staffingAssignmentLinkIsCurrentSql}
              )::INT AS current_assignment_count,
              COUNT(*) FILTER (
                WHERE wal.org_id = $5
                  AND wal.worker_confirmation_status IN ('auto_confirmed','worker_confirmed')
              )::INT AS same_client_assignment_count,
              COUNT(*) FILTER (
                WHERE wal.worker_confirmation_status IN ('auto_confirmed','worker_confirmed')
              )::INT AS confirmed_assignment_count
       FROM worker_assignment_links wal
       JOIN assignments a ON a.id = wal.assignment_id
       WHERE wal.worker_user_id = wp.user_id
     ) link_stats ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::INT AS conflict_count
       FROM worker_assignment_links wal
       JOIN assignments a ON a.id = wal.assignment_id
       WHERE wal.worker_user_id = wp.user_id
         AND wal.is_active = TRUE
         AND wal.worker_confirmation_status NOT IN ('worker_declined','worker_unavailable')
         AND ${staffingAssignmentLinkIsCurrentSql}
         AND wal.start_date <= $4
         AND (wal.end_date IS NULL OR wal.end_date >= $3)
     ) conflicts ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*) FILTER (
                WHERE r.status = 'reserved'
                  AND (r.expires_at IS NULL OR r.expires_at > NOW())
                  AND r.assignment_id = $2
              )::INT AS current_reservation_count,
              COUNT(*) FILTER (
                WHERE r.status = 'reserved'
                  AND (r.expires_at IS NULL OR r.expires_at > NOW())
                  AND a2.start_date <= $4
                  AND (a2.planned_end_date IS NULL OR a2.planned_end_date >= $3)
              )::INT AS reservation_conflict_count
       FROM assignment_staffing_reservations r
       LEFT JOIN assignments a2 ON a2.id = r.assignment_id
       WHERE r.worker_user_id = wp.user_id
     ) reservations ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*) FILTER (WHERE status = 'verified')::INT AS verified_doc_count,
              COUNT(*) FILTER (
                WHERE status = 'verified' AND valid_until IS NOT NULL AND valid_until < CURRENT_DATE
              )::INT AS expired_doc_count,
              ARRAY_REMOVE(ARRAY_AGG(LOWER(COALESCE(qualification_name, title))), NULL) AS verified_doc_names
       FROM worker_profile_documents wpd
       WHERE wpd.worker_user_id = wp.user_id
     ) docs ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*) FILTER (
                WHERE asi.status IN ('sent','viewed','interested','accepted')
                  AND (asi.expires_at IS NULL OR asi.expires_at > NOW())
              )::INT AS open_invite_count,
              COUNT(*)::INT AS historical_invite_count
       FROM assignment_staffing_invites asi
       WHERE asi.assignment_id = $2
         AND asi.worker_user_id = wp.user_id
     ) invite_stats ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*) FILTER (
                WHERE wts.status IN ('approved_internal','accepted_into_timesheet')
              )::INT AS approved_submission_count,
              COUNT(*) FILTER (
                WHERE wts.status = 'customer_confirmed'
              )::INT AS customer_confirmed_submission_count,
              COUNT(*) FILTER (
                WHERE wts.status = 'posted_to_timesheet'
              )::INT AS posted_submission_count,
              COUNT(*) FILTER (
                WHERE wts.status IN ('needs_correction','rejected')
              )::INT AS needs_attention_submission_count,
              COUNT(*) FILTER (
                WHERE wts.status = 'customer_rejected'
              )::INT AS customer_rejected_submission_count
       FROM worker_time_submissions wts
       WHERE wts.worker_user_id = wp.user_id
     ) submission_stats ON TRUE
     WHERE wp.supplier_org_id = $1
       AND wp.is_active = TRUE${workerFilterSql}
     ORDER BY wp.last_name ASC, wp.first_name ASC
     LIMIT $${limitParam}`,
    params
  );

  return rows;
}

async function getAssignmentWaitlistRootCampaignId(client, assignmentId) {
  const { rows } = await client.query(
    `SELECT COALESCE(source_campaign_id, id) AS root_campaign_id
     FROM assignment_staffing_campaigns
     WHERE assignment_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [assignmentId]
  );
  return rows[0]?.root_campaign_id || null;
}

async function assignWaitlistRootCampaign(client, assignmentId, rootCampaignId) {
  if (!rootCampaignId) return;
  await client.query(
    `UPDATE assignment_staffing_waitlist
     SET root_campaign_id = COALESCE(root_campaign_id, $2),
         updated_at = NOW()
     WHERE assignment_id = $1
       AND root_campaign_id IS NULL`,
    [assignmentId, rootCampaignId]
  );
}

async function getAssignmentWaitlistMaxRank(client, assignmentId) {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(queue_rank), 0)::INT AS max_rank
     FROM assignment_staffing_waitlist
     WHERE assignment_id = $1`,
    [assignmentId]
  );
  return toInt(rows[0]?.max_rank, 0);
}

function buildWaitlistCandidateSnapshot(candidate) {
  return {
    score: Number(candidate?.total_score ?? candidate?.score ?? 0),
    soft_score: Number(candidate?.soft_score ?? candidate?.score ?? 0),
    hard_match: !!candidate?.hard_match,
    is_selectable: !!candidate?.is_selectable,
    hard_failures: Array.isArray(candidate?.hard_failures) ? candidate.hard_failures : [],
    missing_requirements: Array.isArray(candidate?.missing_requirements) ? candidate.missing_requirements : [],
    factor_scores: Array.isArray(candidate?.factor_scores) ? candidate.factor_scores : [],
    match_reasons: Array.isArray(candidate?.match_reasons) ? candidate.match_reasons : []
  };
}

function waitlistEventTypeForStatus(status) {
  if (status === "queued") return "waitlist_queued";
  if (status === "invited") return "waitlist_invited";
  if (status === "reserved") return "waitlist_reserved";
  if (status === "assigned") return "waitlist_assigned";
  return "waitlist_removed";
}

async function upsertWaitlistCandidates(client, {
  assignment,
  rootCampaignId = null,
  sourceCampaignId = null,
  campaignId = null,
  actorId = null,
  candidates = [],
  status = "queued",
  inviteMap = new Map(),
  rankOffset = 0,
  removalReason = null
}) {
  const results = [];
  let index = 0;

  for (const candidate of candidates) {
    const snapshot = buildWaitlistCandidateSnapshot(candidate);
    const queueRank = Math.max(
      1,
      toInt(candidate?.queue_rank ?? candidate?.rank ?? (rankOffset + index + 1), rankOffset + index + 1)
    );
    const invite = inviteMap.get(candidate.worker_user_id);
    const inviteId = invite?.id || candidate?.current_invite_id || null;
    const reservationId = candidate?.current_reservation_id || null;
    const linkId = candidate?.promoted_link_id || null;
    const { rows } = await client.query(
      `INSERT INTO assignment_staffing_waitlist
         (assignment_id, root_campaign_id, source_campaign_id, current_campaign_id,
          current_invite_id, current_reservation_id, promoted_link_id,
          worker_user_id, org_id, supplier_org_id, status, queue_rank,
          score, soft_score, hard_match, is_selectable,
          hard_failures, missing_requirements, factor_scores, match_reasons,
          last_evaluated_at, queued_at, invited_at, reserved_at, assigned_at,
          removed_at, removal_reason, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW(),
               CASE WHEN $11 = 'queued' THEN NOW() ELSE NULL END,
               CASE WHEN $11 = 'invited' THEN NOW() ELSE NULL END,
               CASE WHEN $11 = 'reserved' THEN NOW() ELSE NULL END,
               CASE WHEN $11 = 'assigned' THEN NOW() ELSE NULL END,
               CASE WHEN $11 = 'removed' THEN NOW() ELSE NULL END,
               $21,$22)
       ON CONFLICT (assignment_id, worker_user_id) DO UPDATE
       SET root_campaign_id = COALESCE(assignment_staffing_waitlist.root_campaign_id, EXCLUDED.root_campaign_id),
           source_campaign_id = COALESCE(EXCLUDED.source_campaign_id, assignment_staffing_waitlist.source_campaign_id),
           current_campaign_id = COALESCE(EXCLUDED.current_campaign_id, assignment_staffing_waitlist.current_campaign_id),
           current_invite_id = COALESCE(EXCLUDED.current_invite_id, assignment_staffing_waitlist.current_invite_id),
           current_reservation_id = COALESCE(EXCLUDED.current_reservation_id, assignment_staffing_waitlist.current_reservation_id),
           promoted_link_id = COALESCE(EXCLUDED.promoted_link_id, assignment_staffing_waitlist.promoted_link_id),
           status = EXCLUDED.status,
           queue_rank = LEAST(assignment_staffing_waitlist.queue_rank, EXCLUDED.queue_rank),
           score = EXCLUDED.score,
           soft_score = EXCLUDED.soft_score,
           hard_match = EXCLUDED.hard_match,
           is_selectable = EXCLUDED.is_selectable,
           hard_failures = EXCLUDED.hard_failures,
           missing_requirements = EXCLUDED.missing_requirements,
           factor_scores = EXCLUDED.factor_scores,
           match_reasons = EXCLUDED.match_reasons,
           last_evaluated_at = EXCLUDED.last_evaluated_at,
           queued_at = COALESCE(assignment_staffing_waitlist.queued_at, EXCLUDED.queued_at),
           invited_at = CASE
             WHEN EXCLUDED.status = 'invited' THEN COALESCE(assignment_staffing_waitlist.invited_at, EXCLUDED.invited_at, NOW())
             ELSE assignment_staffing_waitlist.invited_at
           END,
           reserved_at = CASE
             WHEN EXCLUDED.status = 'reserved' THEN COALESCE(assignment_staffing_waitlist.reserved_at, EXCLUDED.reserved_at, NOW())
             ELSE assignment_staffing_waitlist.reserved_at
           END,
           assigned_at = CASE
             WHEN EXCLUDED.status = 'assigned' THEN COALESCE(assignment_staffing_waitlist.assigned_at, EXCLUDED.assigned_at, NOW())
             ELSE assignment_staffing_waitlist.assigned_at
           END,
           removed_at = CASE
             WHEN EXCLUDED.status = 'removed' THEN COALESCE(assignment_staffing_waitlist.removed_at, EXCLUDED.removed_at, NOW())
             ELSE NULL
           END,
           removal_reason = CASE
             WHEN EXCLUDED.status = 'removed' THEN EXCLUDED.removal_reason
             ELSE NULL
           END,
           updated_at = NOW()
       RETURNING *`,
      [
        assignment.id,
        rootCampaignId,
        sourceCampaignId,
        campaignId,
        inviteId,
        reservationId,
        linkId,
        candidate.worker_user_id,
        assignment.org_id,
        assignment.supplier_org_id,
        status,
        queueRank,
        snapshot.score,
        snapshot.soft_score,
        snapshot.hard_match,
        snapshot.is_selectable,
        JSON.stringify(snapshot.hard_failures),
        JSON.stringify(snapshot.missing_requirements),
        JSON.stringify(snapshot.factor_scores),
        JSON.stringify(snapshot.match_reasons),
        removalReason,
        actorId || null
      ]
    );
    const upserted = rows[0] || null;
    if (upserted) {
      results.push(upserted);
      await writeStaffingEvent(client, {
        assignmentId: assignment.id,
        campaignId: campaignId || rootCampaignId || null,
        inviteId,
        actorId,
        eventType: waitlistEventTypeForStatus(status),
        newValues: {
          worker_user_id: candidate.worker_user_id,
          status,
          queue_rank: upserted.queue_rank,
          root_campaign_id: upserted.root_campaign_id,
          score: snapshot.score
        }
      });
    }
    index += 1;
  }

  return results;
}

async function updateWaitlistCandidateState(client, {
  assignmentId,
  workerUserId,
  status,
  rootCampaignId = null,
  sourceCampaignId = null,
  campaignId = null,
  inviteId = null,
  reservationId = null,
  linkId = null,
  removalReason = null,
  actorId = null,
  evaluation = null
}) {
  const snapshot = evaluation ? buildWaitlistCandidateSnapshot(evaluation) : null;
  const { rows } = await client.query(
    `UPDATE assignment_staffing_waitlist
     SET root_campaign_id = COALESCE(root_campaign_id, $3),
         source_campaign_id = COALESCE($4, source_campaign_id),
         current_campaign_id = COALESCE($5, current_campaign_id),
         current_invite_id = COALESCE($6, current_invite_id),
         current_reservation_id = COALESCE($7, current_reservation_id),
         promoted_link_id = COALESCE($8, promoted_link_id),
         status = $9,
         score = COALESCE($10, score),
         soft_score = COALESCE($11, soft_score),
         hard_match = COALESCE($12, hard_match),
         is_selectable = COALESCE($13, is_selectable),
         hard_failures = COALESCE($14::jsonb, hard_failures),
         missing_requirements = COALESCE($15::jsonb, missing_requirements),
         factor_scores = COALESCE($16::jsonb, factor_scores),
         match_reasons = COALESCE($17::jsonb, match_reasons),
         last_evaluated_at = CASE WHEN $18 THEN NOW() ELSE last_evaluated_at END,
         invited_at = CASE WHEN $9 = 'invited' THEN COALESCE(invited_at, NOW()) ELSE invited_at END,
         reserved_at = CASE WHEN $9 = 'reserved' THEN COALESCE(reserved_at, NOW()) ELSE reserved_at END,
         assigned_at = CASE WHEN $9 = 'assigned' THEN COALESCE(assigned_at, NOW()) ELSE assigned_at END,
         removed_at = CASE WHEN $9 = 'removed' THEN COALESCE(removed_at, NOW()) ELSE NULL END,
         removal_reason = CASE WHEN $9 = 'removed' THEN COALESCE($19, removal_reason) ELSE NULL END,
         updated_at = NOW()
     WHERE assignment_id = $1
       AND worker_user_id = $2
     RETURNING *`,
    [
      assignmentId,
      workerUserId,
      rootCampaignId,
      sourceCampaignId,
      campaignId,
      inviteId,
      reservationId,
      linkId,
      status,
      snapshot?.score ?? null,
      snapshot?.soft_score ?? null,
      snapshot ? snapshot.hard_match : null,
      snapshot ? snapshot.is_selectable : null,
      snapshot ? JSON.stringify(snapshot.hard_failures) : null,
      snapshot ? JSON.stringify(snapshot.missing_requirements) : null,
      snapshot ? JSON.stringify(snapshot.factor_scores) : null,
      snapshot ? JSON.stringify(snapshot.match_reasons) : null,
      !!snapshot,
      removalReason
    ]
  );
  const updated = rows[0] || null;
  if (!updated) return null;

  await writeStaffingEvent(client, {
    assignmentId,
    campaignId: campaignId || rootCampaignId || null,
    inviteId,
    reservationId,
    actorId,
    eventType: waitlistEventTypeForStatus(status),
    newValues: {
      worker_user_id: workerUserId,
      status,
      removal_reason: removalReason || null
    }
  });

  return updated;
}

async function listAssignmentWaitlistRows(client, assignmentId, { limit = 40 } = {}) {
  const { rows } = await client.query(
    `SELECT w.*, wp.first_name, wp.last_name, wp.personnel_number,
            i.status AS invite_status
     FROM assignment_staffing_waitlist w
     LEFT JOIN worker_profiles wp ON wp.user_id = w.worker_user_id
     LEFT JOIN assignment_staffing_invites i ON i.id = w.current_invite_id
     WHERE w.assignment_id = $1
     ORDER BY CASE w.status
                WHEN 'queued' THEN 0
                WHEN 'invited' THEN 1
                WHEN 'reserved' THEN 2
                WHEN 'assigned' THEN 3
                ELSE 4
              END,
              w.queue_rank ASC,
              w.updated_at DESC
     LIMIT $2`,
    [assignmentId, clamp(toInt(limit, 40), 1, 100)]
  );
  return rows;
}

async function getAssignmentWaitlistSummary(client, assignmentId) {
  const { rows } = await client.query(
    `SELECT COUNT(*) FILTER (WHERE status = 'queued')::INT AS queued_count,
            COUNT(*) FILTER (WHERE status = 'invited')::INT AS invited_count,
            COUNT(*) FILTER (WHERE status = 'reserved')::INT AS reserved_count,
            COUNT(*) FILTER (WHERE status = 'assigned')::INT AS assigned_count,
            COUNT(*) FILTER (WHERE status = 'removed')::INT AS removed_count
     FROM assignment_staffing_waitlist
     WHERE assignment_id = $1`,
    [assignmentId]
  );
  return rows[0] || {
    queued_count: 0,
    invited_count: 0,
    reserved_count: 0,
    assigned_count: 0,
    removed_count: 0
  };
}

async function selectQueuedWaitlistCandidatesForWave(client, assignment, rootCampaignId, limit) {
  const fetchLimit = Math.max(clamp(toInt(limit, 5), 1, 50) * 4, 10);
  const { rows: queuedRows } = await client.query(
    `SELECT *
     FROM assignment_staffing_waitlist
     WHERE assignment_id = $1
       AND status = 'queued'
       AND ($2::uuid IS NULL OR root_campaign_id IS NULL OR root_campaign_id = $2)
     ORDER BY CASE WHEN root_campaign_id = $2 THEN 0 ELSE 1 END,
              queue_rank ASC,
              created_at ASC
     LIMIT $3`,
    [assignment.id, rootCampaignId, fetchLimit]
  );

  if (!queuedRows.length) {
    return { candidates: [], removed_count: 0 };
  }

  const workerRows = await queryWorkerSuggestionBase(
    client,
    assignment,
    queuedRows.length,
    queuedRows.map((entry) => entry.worker_user_id)
  );
  const rescored = scoreWorkersForAssignment(client, assignment, workerRows, { onlyAvailable: true });
  const rescoredByWorkerId = new Map(rescored.map((entry) => [entry.worker_user_id, entry]));
  const selected = [];
  let removedCount = 0;

  for (const queued of queuedRows) {
    const candidate = rescoredByWorkerId.get(queued.worker_user_id);
    if (!candidate || !candidate.can_invite) {
      await updateWaitlistCandidateState(client, {
        assignmentId: assignment.id,
        workerUserId: queued.worker_user_id,
        status: "removed",
        rootCampaignId,
        sourceCampaignId: rootCampaignId,
        removalReason: candidate?.already_contacted ? "already_contacted" : "no_longer_invitable",
        actorId: null,
        evaluation: candidate || null
      });
      removedCount += 1;
      continue;
    }

    selected.push({ ...candidate, queue_rank: queued.queue_rank });
    if (selected.length >= limit) break;
  }

  return {
    candidates: selected,
    removed_count: removedCount
  };
}

export async function listOpenStaffingAssignments(pool, supplierOrgId, { limit = 50 } = {}) {
  const { rows } = await pool.query(
    `SELECT a.id AS assignment_id,
            a.org_id, a.supplier_org_id, a.deal_request_id, a.demand_request_id, a.offer_id,
            a.worker_description, a.worker_count, a.requested_quantity,
            a.filled_quantity, a.reserved_quantity,
            COALESCE(a.open_quantity, GREATEST(COALESCE(a.requested_quantity, a.worker_count, 1) - COALESCE(a.filled_quantity, 0) - COALESCE(a.reserved_quantity, 0), 0)) AS open_quantity,
            a.staffing_status, a.status, a.start_date, a.planned_end_date, a.notes, a.created_at,
            buyer.name AS client_org_name,
            r.urgency AS request_urgency,
            r.status AS request_status,
            r.role AS request_role,
            dr.status AS demand_status,
            dr.role AS demand_role,
            dr.title AS demand_title,
            dr.location_city AS demand_location_city,
            COALESCE(NULLIF(r.role, ''), NULLIF(dr.role, ''), NULLIF(dr.title, ''), a.worker_description, 'Einsatz') AS request_title
     FROM assignments a
     LEFT JOIN organizations buyer ON buyer.id = a.org_id
     LEFT JOIN requests r ON r.id = a.deal_request_id
     LEFT JOIN demand_requests dr ON dr.id = a.demand_request_id
     WHERE a.supplier_org_id = $1
       AND a.status IN ('planned','active','extended')
       AND ${staffingAssignmentIsCurrentSql}
       AND (a.deal_request_id IS NOT NULL OR a.demand_request_id IS NOT NULL OR a.offer_id IS NOT NULL)
       AND COALESCE(a.open_quantity, GREATEST(COALESCE(a.requested_quantity, a.worker_count, 1) - COALESCE(a.filled_quantity, 0) - COALESCE(a.reserved_quantity, 0), 0)) > 0
     ORDER BY a.start_date ASC, a.created_at DESC
     LIMIT $2`,
    [supplierOrgId, clamp(toInt(limit, 50), 1, 250)]
  );
  return rows;
}

/**
 * Welle 7 – Phase 3+4: Abgeschlossene Deals hart verfuegbar.
 *
 * Gibt Assignments zurueck, die aus aktivierten/abgeschlossenen Deals stammen
 * und im agency-seitigen Review sichtbar bleiben muessen – auch wenn die
 * Besetzung bereits vollstaendig ist. "Abgeschlossen" meint hier:
 *  - Status completed (Einsatz planmaessig beendet)
 *  - Status activated und open_quantity == 0 (Deal vollstaendig besetzt)
 *  - Status cancelled (damit Stornos nicht verschwinden)
 *
 * Die Aktiv-Sicht (listOpenStaffingAssignments) bleibt unveraendert und zeigt
 * nur offene Besetzungsluecken; Abgeschlossene Deals fuehren jetzt eine eigene
 * stabile Liste, damit Freigaben, Stundenzettel und Lifecycle-Aktionen nach
 * der vollstaendigen Besetzung nicht aus der Sicht fallen.
 */
export async function listClosedDealAssignments(pool, supplierOrgId, { limit = 100 } = {}) {
  const { rows } = await pool.query(
    `SELECT a.id AS assignment_id,
            a.org_id, a.supplier_org_id, a.deal_request_id, a.demand_request_id, a.offer_id,
            a.worker_description, a.worker_count, a.requested_quantity,
            a.filled_quantity, a.reserved_quantity,
            COALESCE(a.open_quantity, GREATEST(COALESCE(a.requested_quantity, a.worker_count, 1) - COALESCE(a.filled_quantity, 0) - COALESCE(a.reserved_quantity, 0), 0)) AS open_quantity,
            a.staffing_status, a.status, a.start_date, a.planned_end_date, a.notes, a.created_at,
            buyer.name AS client_org_name,
            r.urgency AS request_urgency,
            r.status AS request_status,
            r.role AS request_role,
            dr.status AS demand_status,
            dr.role AS demand_role,
            dr.title AS demand_title,
            dr.location_city AS demand_location_city,
            COALESCE(NULLIF(r.role, ''), NULLIF(dr.role, ''), NULLIF(dr.title, ''), a.worker_description, 'Einsatz') AS request_title,
            o.agreement_status AS offer_agreement_status,
            o.agreement_ref AS offer_agreement_ref,
            (SELECT COUNT(*)::INT FROM worker_assignment_links wal
              WHERE wal.assignment_id = a.id) AS link_total_count,
            (SELECT COUNT(*)::INT FROM worker_assignment_links wal
              WHERE wal.assignment_id = a.id
                AND wal.is_active = TRUE
                AND wal.worker_confirmation_status NOT IN ('worker_declined','worker_unavailable')) AS link_active_count
     FROM assignments a
     LEFT JOIN organizations buyer ON buyer.id = a.org_id
     LEFT JOIN requests r ON r.id = a.deal_request_id
     LEFT JOIN demand_requests dr ON dr.id = a.demand_request_id
     LEFT JOIN offers o ON o.id = a.offer_id
     WHERE a.supplier_org_id = $1
       AND (a.deal_request_id IS NOT NULL OR a.demand_request_id IS NOT NULL OR a.offer_id IS NOT NULL)
       AND (
         a.status IN ('completed','cancelled')
         OR (
           a.status IN ('planned','active','extended')
           AND COALESCE(a.open_quantity, GREATEST(COALESCE(a.requested_quantity, a.worker_count, 1) - COALESCE(a.filled_quantity, 0) - COALESCE(a.reserved_quantity, 0), 0)) <= 0
         )
       )
     ORDER BY COALESCE(a.planned_end_date, a.start_date) DESC NULLS LAST, a.created_at DESC
     LIMIT $2`,
    [supplierOrgId, clamp(toInt(limit, 100), 1, 250)]
  );
  return rows;
}

export async function getAssignmentStaffingOverview(pool, assignmentId, supplierOrgId) {
  const assignment = await recalcAssignmentStaffing(pool, assignmentId, { writeEvent: false });
  if (!assignment || (supplierOrgId && assignment.supplier_org_id !== supplierOrgId)) return null;

  const requirements = deriveAssignmentRequirements(assignment);
  const { rows: currentWorkers } = await pool.query(
    `SELECT wal.*, wp.first_name, wp.last_name, wp.personnel_number, u.email AS worker_email
     FROM worker_assignment_links wal
     JOIN users u ON u.id = wal.worker_user_id
     LEFT JOIN worker_profiles wp ON wp.user_id = wal.worker_user_id
     WHERE wal.assignment_id = $1
     ORDER BY wal.is_active DESC, wal.created_at DESC`,
    [assignmentId]
  );

  const { rows: reservations } = await pool.query(
    `SELECT r.*, wp.first_name, wp.last_name, wp.personnel_number
     FROM assignment_staffing_reservations r
     LEFT JOIN worker_profiles wp ON wp.user_id = r.worker_user_id
     WHERE r.assignment_id = $1
     ORDER BY r.reserved_at DESC`,
    [assignmentId]
  );

  const { rows: invites } = await pool.query(
    `SELECT i.*, wp.first_name, wp.last_name, wp.personnel_number,
            msg.total_messages, msg.question_count, msg.reminder_request_count,
            msg.latest_sender_role, msg.latest_message_type, msg.latest_body, msg.latest_message_at
     FROM assignment_staffing_invites i
     LEFT JOIN worker_profiles wp ON wp.user_id = i.worker_user_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::INT AS total_messages,
              COUNT(*) FILTER (WHERE message_type = 'question')::INT AS question_count,
              COUNT(*) FILTER (WHERE message_type = 'reminder_request')::INT AS reminder_request_count,
              (ARRAY_AGG(sender_role ORDER BY created_at DESC))[1] AS latest_sender_role,
              (ARRAY_AGG(message_type ORDER BY created_at DESC))[1] AS latest_message_type,
              (ARRAY_AGG(body ORDER BY created_at DESC))[1] AS latest_body,
              MAX(created_at) AS latest_message_at
       FROM assignment_staffing_messages m
       WHERE m.invite_id = i.id
     ) msg ON TRUE
     WHERE i.assignment_id = $1
     ORDER BY COALESCE(i.responded_at, i.sent_at) DESC
     LIMIT 40`,
    [assignmentId]
  );

  const { rows: campaigns } = await pool.query(
    `SELECT *
     FROM assignment_staffing_campaigns
     WHERE assignment_id = $1
     ORDER BY created_at DESC
     LIMIT 12`,
    [assignmentId]
  );
  const waitlist = await listAssignmentWaitlistRows(pool, assignmentId, { limit: 40 });
  const waitlistSummary = await getAssignmentWaitlistSummary(pool, assignmentId);
  const rootCampaignId = await getAssignmentWaitlistRootCampaignId(pool, assignmentId);
  const choiceSets = await listAssignmentStaffingChoiceSets(pool, assignmentId, supplierOrgId);

  return {
    assignment,
    requirements,
    current_workers: currentWorkers,
    reservations,
    recent_invites: invites,
    campaigns,
    root_campaign_id: rootCampaignId,
    waitlist,
    waitlist_summary: waitlistSummary,
    choice_sets: choiceSets
  };
}

export async function listAssignmentSuggestions(pool, assignmentId, supplierOrgId, filters = {}) {
  const limit = clamp(toInt(filters.limit, 20), 1, 50);
  const assignment = await loadAssignmentContext(pool, assignmentId, supplierOrgId);
  if (!assignment) return null;
  const workerUserId = String(filters.workerUserId || filters.worker_user_id || "").trim() || null;
  const workerIds = workerUserId ? [workerUserId] : null;
  const workerRows = await queryWorkerSuggestionBase(
    pool,
    assignment,
    workerIds ? workerIds.length : Math.max(limit * 5, 60),
    workerIds
  );
  const scoredSuggestions = await scoreWorkersForAssignment(pool, assignment, workerRows, filters);
  const waitlistSummary = await getAssignmentWaitlistSummary(pool, assignmentId);
  const filteredSuggestions = filters.hardOnly
    ? scoredSuggestions.filter((entry) => entry.hard_match)
    : (filters.includeBlocked === false
      ? scoredSuggestions.filter((entry) => entry.is_selectable)
      : scoredSuggestions);

  return {
    assignment: await recalcAssignmentStaffing(pool, assignmentId, { writeEvent: false }),
    requirements: deriveAssignmentRequirements(assignment),
    summary: {
      total_candidates: scoredSuggestions.length,
      hard_match_count: scoredSuggestions.filter((entry) => entry.hard_match).length,
      soft_match_count: scoredSuggestions.filter((entry) => entry.is_selectable && !entry.hard_match).length,
      blocked_count: scoredSuggestions.filter((entry) => !entry.is_selectable).length,
      queued_waitlist_count: toInt(waitlistSummary?.queued_count, 0)
    },
    waitlist_summary: waitlistSummary,
    suggestions: filteredSuggestions.slice(0, limit)
  };
}
async function createStaffingCampaignInternal(client, {
  assignment,
  staffing,
  actorId,
  workerUserIds,
  message = null,
  name = null,
  expiresAt = null,
  promotionMode = "auto_finalize",
  reservationWindowMinutes = 30,
  autoBackfillEnabled = false,
  sourceCampaignId = null,
  seedWaitlist = true
}) {
  const selectedWorkerIds = [...new Set((Array.isArray(workerUserIds) ? workerUserIds : []).filter(Boolean))];
  if (selectedWorkerIds.length === 0) return { error: "NO_WORKERS_SELECTED" };

  const workerRows = await queryWorkerSuggestionBase(client, assignment, selectedWorkerIds.length, selectedWorkerIds);
  const scoreRows = await scoreWorkersForAssignment(client, assignment, workerRows, { limit: selectedWorkerIds.length });
  const scoreMap = new Map(scoreRows.map((entry) => [entry.worker_user_id, entry]));

  const selectedWorkers = selectedWorkerIds.map((workerId) => scoreMap.get(workerId)).filter(Boolean);
  const eligibleWorkers = selectedWorkers.filter((worker) => worker.can_invite);
  const skippedWorkers = selectedWorkers
    .filter((worker) => !eligibleWorkers.some((selected) => selected.worker_user_id === worker.worker_user_id))
    .map((worker) => ({
      worker_user_id: worker.worker_user_id,
      first_name: worker.first_name,
      last_name: worker.last_name,
      reason: worker.already_contacted
        ? "already_contacted"
        : (worker.has_open_invite ? "open_invite" : "not_selectable")
    }));

  if (eligibleWorkers.length === 0) {
    return { error: "NO_ELIGIBLE_WORKERS", skipped_workers: skippedWorkers };
  }

  const normalizedReservationWindow = clamp(toInt(reservationWindowMinutes, 30), 1, 10080);
  const normalizedExpiresAt = expiresAt
    ? new Date(expiresAt)
    : new Date(Date.now() + (72 * 60 * 60 * 1000));
  if (Number.isNaN(normalizedExpiresAt.getTime())) {
    return { error: "INVALID_EXPIRES_AT" };
  }

  const normalizedAutoBackfillEnabled = !!autoBackfillEnabled;
  const autoBackfillHeartbeatAt = normalizedAutoBackfillEnabled ? new Date() : null;
  const { rows: campaignRows } = await client.query(
    `INSERT INTO assignment_staffing_campaigns
       (assignment_id, org_id, supplier_org_id, name, message, status,
        promotion_mode, reservation_window_minutes, target_quantity,
        auto_backfill_enabled, source_campaign_id, last_auto_backfill_at, created_by)
     VALUES ($1,$2,$3,$4,$5,'active',$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      assignment.id,
      assignment.org_id,
      assignment.supplier_org_id,
      name || `Staffing-Kampagne ${new Date().toLocaleDateString("de-DE")}`,
      message || null,
      promotionMode === "manual_review" ? "manual_review" : "auto_finalize",
      normalizedReservationWindow,
      Math.min(staffing.open_quantity, eligibleWorkers.length),
      normalizedAutoBackfillEnabled,
      sourceCampaignId || null,
      autoBackfillHeartbeatAt,
      actorId || null
    ]
  );
  const campaign = campaignRows[0];
  const rootCampaignId = sourceCampaignId || campaign.id;
  await assignWaitlistRootCampaign(client, assignment.id, rootCampaignId);

  const waitlistSeedCandidates = [];
  if (seedWaitlist) {
    const waitlistSeedSize = getWaitlistSeedSize(staffing.open_quantity);
    const suggestionPoolRows = await queryWorkerSuggestionBase(
      client,
      assignment,
      Math.max(waitlistSeedSize + selectedWorkerIds.length + 20, 80)
    );
    const suggestionPool = await scoreWorkersForAssignment(client, assignment, suggestionPoolRows, {});
    waitlistSeedCandidates.push(
      ...suggestionPool
        .filter((worker) =>
          worker.can_invite
          && !selectedWorkerIds.includes(worker.worker_user_id)
        )
        .slice(0, waitlistSeedSize)
    );
  }

  await writeStaffingEvent(client, {
    assignmentId: assignment.id,
    campaignId: campaign.id,
    actorId,
    eventType: "campaign_created",
    newValues: {
      target_quantity: campaign.target_quantity,
      promotion_mode: campaign.promotion_mode,
      auto_backfill_enabled: campaign.auto_backfill_enabled,
      source_campaign_id: campaign.source_campaign_id
    }
  });
  const requestSnapshot = buildInviteRequestSnapshot(assignment, {
    campaign,
    rootCampaignId,
    message,
    expiresAt: normalizedExpiresAt
  });

  const invites = [];
  const inviteMap = new Map();
  for (const worker of eligibleWorkers) {
    const { rows: inviteRows } = await client.query(
      `INSERT INTO assignment_staffing_invites
         (assignment_id, campaign_id, worker_user_id, org_id, supplier_org_id,
          status, score, score_reasons, personal_message, expires_at, request_snapshot, created_by)
       VALUES ($1,$2,$3,$4,$5,'sent',$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        assignment.id,
        campaign.id,
        worker.worker_user_id,
        assignment.org_id,
        assignment.supplier_org_id,
        worker.score,
        JSON.stringify({
          match_reasons: worker.match_reasons || [],
          factor_scores: worker.factor_scores || [],
          hard_failures: worker.hard_failures || [],
          missing_requirements: worker.missing_requirements || [],
          hard_match: !!worker.hard_match,
          soft_score: worker.soft_score ?? worker.score ?? 0
        }),
        message || null,
        normalizedExpiresAt,
        JSON.stringify(requestSnapshot),
        actorId || null
      ]
    );
    const invite = inviteRows[0];
    inviteMap.set(worker.worker_user_id, invite);
    invites.push({
      ...invite,
      first_name: worker.first_name,
      last_name: worker.last_name,
      personnel_number: worker.personnel_number,
      match_reasons: worker.match_reasons,
      factor_scores: worker.factor_scores,
      hard_failures: worker.hard_failures,
      missing_requirements: worker.missing_requirements,
      hard_match: worker.hard_match,
      request_snapshot: invite.request_snapshot
    });

    await writeStaffingEvent(client, {
      assignmentId: assignment.id,
      campaignId: campaign.id,
      inviteId: invite.id,
      actorId,
      eventType: "invite_sent",
      newValues: { worker_user_id: worker.worker_user_id, score: worker.score }
    });
  }

  await upsertWaitlistCandidates(client, {
    assignment,
    rootCampaignId,
    sourceCampaignId: rootCampaignId,
    campaignId: campaign.id,
    actorId,
    candidates: eligibleWorkers,
    status: "invited",
    inviteMap
  });

  let queuedWaitlist = [];
  if (waitlistSeedCandidates.length > 0) {
    const waitlistRankOffset = await getAssignmentWaitlistMaxRank(client, assignment.id);
    queuedWaitlist = await upsertWaitlistCandidates(client, {
      assignment,
      rootCampaignId,
      sourceCampaignId: rootCampaignId,
      campaignId: campaign.id,
      actorId,
      candidates: waitlistSeedCandidates,
      status: "queued",
      rankOffset: waitlistRankOffset
    });
  }

  await refreshCampaignMetrics(client, campaign.id);
  const updatedAssignment = await recalcAssignmentStaffing(client, assignment.id, { lock: true, writeEvent: false });

  await auditLog.writeAudit(client, {
    action: "assignment.staffing_campaign_created",
    entity_type: "assignment",
    entity_id: assignment.id,
    actor_id: actorId,
    details: {
      campaign_id: campaign.id,
      invite_count: invites.length,
      promotion_mode: campaign.promotion_mode,
      auto_backfill_enabled: campaign.auto_backfill_enabled,
      source_campaign_id: campaign.source_campaign_id
    }
  });

  return {
    campaign,
    invites,
    root_campaign_id: rootCampaignId,
    queued_waitlist: queuedWaitlist,
    skipped_workers: skippedWorkers,
    assignment: updatedAssignment
  };
}

async function queueStaffingCampaignInvites(pool, result) {
  if (result?.error || !Array.isArray(result?.invites)) return;
  await queueStaffingInviteDeliveries(pool, result.invites, { kind: "initial" }).catch(() => {});
}

export async function createStaffingCampaign(pool, {
  assignmentId,
  supplierOrgId,
  actorId,
  workerUserIds,
  message = null,
  name = null,
  expiresAt = null,
  promotionMode = "auto_finalize",
  reservationWindowMinutes = 30,
  autoBackfillEnabled = false,
  sourceCampaignId = null
}) {
  const result = await withTransaction(pool, async (client) => {
    const assignment = await loadAssignmentContext(client, assignmentId, supplierOrgId, { lock: true });
    if (!assignment) return { error: "ASSIGNMENT_NOT_FOUND" };
    if (!ASSIGNABLE_STATUSES.has(assignment.status)) {
      return { error: "ASSIGNMENT_NOT_ASSIGNABLE", status: assignment.status };
    }

    const staffing = await recalcAssignmentStaffing(client, assignmentId, { lock: true, writeEvent: false });
    if (!staffing || staffing.open_quantity <= 0) {
      return { error: "ASSIGNMENT_FILLED" };
    }

    return createStaffingCampaignInternal(client, {
      assignment,
      staffing,
      actorId,
      workerUserIds,
      message,
      name,
      expiresAt,
      promotionMode,
      reservationWindowMinutes,
      autoBackfillEnabled,
      sourceCampaignId
    });
  });
  await queueStaffingCampaignInvites(pool, result);

  return result;
}

export function queueAssignmentWaitlistWorkers(pool, {
  assignmentId,
  supplierOrgId,
  actorId,
  workerUserIds
}) {
  return withTransaction(pool, async (client) => {
    const assignment = await loadAssignmentContext(client, assignmentId, supplierOrgId, { lock: true });
    if (!assignment) return { error: "ASSIGNMENT_NOT_FOUND" };
    if (!ASSIGNABLE_STATUSES.has(assignment.status)) {
      return { error: "ASSIGNMENT_NOT_ASSIGNABLE", status: assignment.status };
    }

    const selectedWorkerIds = [...new Set((Array.isArray(workerUserIds) ? workerUserIds : []).filter(Boolean))];
    if (!selectedWorkerIds.length) return { error: "NO_WORKERS_SELECTED" };

    const workerRows = await queryWorkerSuggestionBase(client, assignment, selectedWorkerIds.length, selectedWorkerIds);
    const scoredWorkers = scoreWorkersForAssignment(client, assignment, workerRows, {});
    const scoredByWorkerId = new Map(scoredWorkers.map((entry) => [entry.worker_user_id, entry]));
    const queueableWorkers = selectedWorkerIds
      .map((workerId) => scoredByWorkerId.get(workerId))
      .filter(Boolean)
      .filter((worker) => worker.can_invite);
    const skippedWorkers = selectedWorkerIds
      .map((workerId) => scoredByWorkerId.get(workerId))
      .filter(Boolean)
      .filter((worker) => !queueableWorkers.some((entry) => entry.worker_user_id === worker.worker_user_id))
      .map((worker) => ({
        worker_user_id: worker.worker_user_id,
        first_name: worker.first_name,
        last_name: worker.last_name,
        reason: worker.already_contacted
          ? "already_contacted"
          : (worker.has_open_invite ? "open_invite" : "not_selectable")
      }));

    if (!queueableWorkers.length) {
      return { error: "NO_ELIGIBLE_WORKERS", skipped_workers: skippedWorkers };
    }

    const rootCampaignId = await getAssignmentWaitlistRootCampaignId(client, assignment.id);
    const rankOffset = await getAssignmentWaitlistMaxRank(client, assignment.id);
    const queuedWaitlist = await upsertWaitlistCandidates(client, {
      assignment,
      rootCampaignId,
      sourceCampaignId: rootCampaignId,
      campaignId: rootCampaignId,
      actorId,
      candidates: queueableWorkers,
      status: "queued",
      rankOffset
    });

    return {
      assignment: await recalcAssignmentStaffing(client, assignment.id, { lock: true, writeEvent: false }),
      root_campaign_id: rootCampaignId,
      waitlist: queuedWaitlist,
      skipped_workers: skippedWorkers
    };
  });
}

export async function sendStaffingWaitlistWave(pool, {
  assignmentId,
  supplierOrgId,
  actorId,
  limit = null,
  message = null,
  name = null,
  promotionMode = "auto_finalize",
  reservationWindowMinutes = 30,
  autoBackfillEnabled = false
}) {
  const result = await withTransaction(pool, async (client) => {
    const assignment = await loadAssignmentContext(client, assignmentId, supplierOrgId, { lock: true });
    if (!assignment) return { error: "ASSIGNMENT_NOT_FOUND" };
    if (!ASSIGNABLE_STATUSES.has(assignment.status)) {
      return { error: "ASSIGNMENT_NOT_ASSIGNABLE", status: assignment.status };
    }

    const staffing = await recalcAssignmentStaffing(client, assignmentId, { lock: true, writeEvent: false });
    if (!staffing || staffing.open_quantity <= 0) {
      return { error: "ASSIGNMENT_FILLED" };
    }

    const rootCampaignId = await getAssignmentWaitlistRootCampaignId(client, assignment.id);
    const targetInviteCount = clamp(
      toInt(limit, getAutoBackfillBatchSize(staffing.open_quantity)),
      1,
      Math.max(getAutoBackfillBatchSize(staffing.open_quantity), 1)
    );
    const queueSelection = await selectQueuedWaitlistCandidatesForWave(client, assignment, rootCampaignId, targetInviteCount);
    if (!queueSelection.candidates.length) {
      return { error: "NO_WAITLIST_CANDIDATES", removed_count: queueSelection.removed_count };
    }

    const campaignResult = await createStaffingCampaignInternal(client, {
      assignment,
      staffing,
      actorId,
      workerUserIds: queueSelection.candidates.map((candidate) => candidate.worker_user_id),
      message: message || `Nächste Nachrücker-Welle – noch offen: ${Number(staffing.open_quantity || 0)}`,
      name: name || `${assignment.worker_description || "Staffing-Kampagne"} · Waitlist-Welle`,
      promotionMode,
      reservationWindowMinutes,
      autoBackfillEnabled,
      sourceCampaignId: rootCampaignId || null
    });

    if (campaignResult?.error) return campaignResult;
    return {
      ...campaignResult,
      removed_count: queueSelection.removed_count
    };
  });
  await queueStaffingCampaignInvites(pool, result);
  return result;
}

export async function listAssignmentsReadyForAutoBackfill(pool, {
  limit = 25,
  cooldownMinutes = DEFAULT_AUTO_BACKFILL_COOLDOWN_MINUTES
} = {}) {
  const cappedLimit = clamp(toInt(limit, 25), 1, 100);
  const normalizedCooldownMinutes = clamp(toInt(cooldownMinutes, DEFAULT_AUTO_BACKFILL_COOLDOWN_MINUTES), 1, 1440);
  const { rows } = await pool.query(
    `SELECT a.id AS assignment_id,
            a.org_id,
            a.supplier_org_id,
            a.worker_description,
            a.start_date,
            a.planned_end_date,
            COALESCE(a.open_quantity, GREATEST(COALESCE(a.requested_quantity, a.worker_count, 1) - COALESCE(a.filled_quantity, 0) - COALESCE(a.reserved_quantity, 0), 0)) AS open_quantity,
            c.id AS campaign_id,
            COALESCE(c.source_campaign_id, c.id) AS root_campaign_id,
            c.name AS campaign_name,
            c.message AS campaign_message,
            c.promotion_mode,
            c.reservation_window_minutes,
            c.created_by,
            c.last_auto_backfill_at
     FROM assignments a
     JOIN (
       SELECT DISTINCT ON (assignment_id) *
       FROM assignment_staffing_campaigns
       WHERE auto_backfill_enabled = TRUE
         AND status <> 'cancelled'
       ORDER BY assignment_id, created_at DESC
     ) c ON c.assignment_id = a.id
     WHERE a.status IN ('planned','active','extended')
       AND COALESCE(a.open_quantity, GREATEST(COALESCE(a.requested_quantity, a.worker_count, 1) - COALESCE(a.filled_quantity, 0) - COALESCE(a.reserved_quantity, 0), 0)) > 0
       AND NOT EXISTS (
         SELECT 1
         FROM assignment_staffing_invites i
         WHERE i.assignment_id = a.id
           AND i.status IN ('sent','viewed','interested','accepted')
           AND (i.expires_at IS NULL OR i.expires_at > NOW())
       )
       AND COALESCE(c.last_auto_backfill_at, c.created_at) <= NOW() - ($1::INT * INTERVAL '1 minute')
     ORDER BY a.start_date ASC NULLS LAST, a.created_at DESC
     LIMIT $2`,
    [normalizedCooldownMinutes, cappedLimit]
  );
  return rows;
}

export async function runAutoBackfill(pool, {
  limit = 25,
  cooldownMinutes = DEFAULT_AUTO_BACKFILL_COOLDOWN_MINUTES
} = {}) {
  const assignments = await listAssignmentsReadyForAutoBackfill(pool, { limit, cooldownMinutes });
  const summary = {
    assignments_considered: assignments.length,
    assignments_backfilled: 0,
    campaigns_created: 0,
    invited_workers: 0,
    skipped_no_candidates: 0
  };

  for (const assignment of assignments) {
    const targetInviteCount = getAutoBackfillBatchSize(assignment.open_quantity);
    let candidateWorkerIds = [];
    if (assignment.root_campaign_id || assignment.campaign_id) {
      const queuedBundle = await withTransaction(pool, async (client) => {
        const lockedAssignment = await loadAssignmentContext(client, assignment.assignment_id, assignment.supplier_org_id, { lock: true });
        if (!lockedAssignment) return { candidates: [], removed_count: 0 };
        return selectQueuedWaitlistCandidatesForWave(
          client,
          lockedAssignment,
          assignment.root_campaign_id || assignment.campaign_id,
          targetInviteCount
        );
      });
      candidateWorkerIds = queuedBundle.candidates.map((worker) => worker.worker_user_id);
    }
    const suggestionBundle = await listAssignmentSuggestions(pool, assignment.assignment_id, assignment.supplier_org_id, {
      limit: Math.max(targetInviteCount * 3, 30),
      onlyAvailable: true,
      includeBlocked: false
    });
    if (candidateWorkerIds.length < targetInviteCount) {
      const freshWorkerIds = (suggestionBundle?.suggestions || [])
        .filter((worker) =>
          worker.can_invite
          && !candidateWorkerIds.includes(worker.worker_user_id)
        )
        .slice(0, Math.max(targetInviteCount - candidateWorkerIds.length, 0))
        .map((worker) => worker.worker_user_id);
      candidateWorkerIds = [...candidateWorkerIds, ...freshWorkerIds];
    }

    if (candidateWorkerIds.length === 0) {
      await touchCampaignAutoBackfillHeartbeat(pool, assignment.campaign_id);
      summary.skipped_no_candidates += 1;
      continue;
    }

    const result = await createStaffingCampaign(pool, {
      assignmentId: assignment.assignment_id,
      supplierOrgId: assignment.supplier_org_id,
      actorId: assignment.created_by || null,
      workerUserIds: candidateWorkerIds,
      message: assignment.campaign_message || `Automatische Nachsteuerung – noch offen: ${Number(assignment.open_quantity || 0)}`,
      name: `${assignment.campaign_name || "Staffing-Kampagne"} · Auto-Backfill`,
      promotionMode: assignment.promotion_mode || "auto_finalize",
      reservationWindowMinutes: assignment.reservation_window_minutes || 30,
      autoBackfillEnabled: true,
      sourceCampaignId: assignment.root_campaign_id || assignment.campaign_id
    });

    if (result?.error === "NO_ELIGIBLE_WORKERS") {
      await touchCampaignAutoBackfillHeartbeat(pool, assignment.campaign_id);
      summary.skipped_no_candidates += 1;
      continue;
    }
    if (result?.error) continue;

    summary.assignments_backfilled += 1;
    summary.campaigns_created += 1;
    summary.invited_workers += result.invites?.length || 0;
  }

  return summary;
}

export function markStaffingInviteViewed(pool, inviteId, workerUserId) {
  return withTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `UPDATE assignment_staffing_invites
       SET status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END,
           viewed_at = COALESCE(viewed_at, NOW()),
           last_worker_action_at = COALESCE(last_worker_action_at, NOW()),
           updated_at = NOW()
       WHERE id = $1
         AND worker_user_id = $2
         AND status IN ('sent','viewed','interested','accepted')
       RETURNING *`,
      [inviteId, workerUserId]
    );
    const invite = rows[0] || null;
    if (!invite) return null;
    await refreshCampaignMetrics(client, invite.campaign_id);
    await writeStaffingEvent(client, {
      assignmentId: invite.assignment_id,
      campaignId: invite.campaign_id,
      inviteId: invite.id,
      actorId: workerUserId,
      eventType: "invite_viewed"
    });
    return invite;
  });
}

export function listWorkerStaffingRequests(pool, workerUserId, { limit = 25, markViewed = false } = {}) {
  return withTransaction(pool, async (client) => {
    const cappedLimit = clamp(toInt(limit, 25), 1, 50);
    const { rows } = await client.query(
      `SELECT i.id, i.assignment_id, i.campaign_id, i.worker_user_id, i.status, i.score,
              i.score_reasons, i.personal_message, i.sent_at, i.viewed_at,
              i.responded_at, i.accepted_at, i.declined_at, i.response_note,
              i.expires_at, i.created_at, i.request_snapshot,
              i.delivery_status, i.delivery_attempt_count, i.delivery_last_attempt_at,
              i.delivery_last_success_at, i.delivery_last_error,
              i.remind_after, i.reminder_requested_at, i.last_reminder_sent_at,
              i.reminder_count, i.last_worker_action_at,
              cso.choice_set_id, cso.id AS choice_option_id,
              cs.choice_mode, cs.status AS choice_set_status,
              a.worker_description, a.start_date, a.planned_end_date,
              a.requested_quantity, a.filled_quantity, a.reserved_quantity, a.hourly_rate_cents,
              a.open_quantity, a.staffing_status,
              c.name AS campaign_name, c.promotion_mode,
              COALESCE(c.source_campaign_id, c.id) AS root_campaign_id,
              buyer.name AS client_org_name,
              COALESCE(NULLIF(r.role, ''), NULLIF(dr.role, ''), NULLIF(dr.title, ''), a.worker_description, 'Einsatz') AS request_title,
              COALESCE(NULLIF(r.role, ''), NULLIF(dr.role, ''), NULLIF(dr.title, '')) AS request_role,
              COALESCE(r.location_city, dr.location_city) AS location_city
       FROM assignment_staffing_invites i
       JOIN assignments a ON a.id = i.assignment_id
       LEFT JOIN assignment_staffing_campaigns c ON c.id = i.campaign_id
       LEFT JOIN assignment_staffing_choice_options cso ON cso.invite_id = i.id
       LEFT JOIN assignment_staffing_choice_sets cs ON cs.id = cso.choice_set_id
       LEFT JOIN organizations buyer ON buyer.id = a.org_id
       LEFT JOIN requests r ON r.id = a.deal_request_id
       LEFT JOIN demand_requests dr ON dr.id = a.demand_request_id
       WHERE i.worker_user_id = $1
         AND i.status IN ('sent','viewed','interested','accepted')
         AND (
           cso.id IS NULL
           OR cs.id IS NULL
           OR cs.status IN ('assigned','declined','expired','cancelled')
         )
       ORDER BY i.sent_at DESC
       LIMIT $2`,
      [workerUserId, cappedLimit]
    );

    if (markViewed) {
      const sentInvites = rows.filter((invite) => invite.status === "sent");
      for (const invite of sentInvites) {
        await markStaffingInviteViewed(client, invite.id, workerUserId);
        invite.status = "viewed";
        invite.viewed_at = new Date().toISOString();
      }
      const uniqueCampaignIds = [...new Set(sentInvites.map((invite) => invite.campaign_id).filter(Boolean))];
      for (const campaignId of uniqueCampaignIds) {
        await refreshCampaignMetrics(client, campaignId);
      }
    }
    if (!rows.length) return [];

    const inviteIds = rows.map((invite) => invite.id);
    const { rows: messageRows } = await client.query(
      `WITH latest_messages AS (
         SELECT DISTINCT ON (invite_id)
                invite_id,
                sender_role,
                message_type,
                body,
                created_at
         FROM assignment_staffing_messages
         WHERE invite_id = ANY($1::uuid[])
         ORDER BY invite_id, created_at DESC
       )
       SELECT m.invite_id,
              COUNT(*)::INT AS total_messages,
              COUNT(*) FILTER (WHERE m.message_type = 'question')::INT AS question_count,
              COUNT(*) FILTER (WHERE m.message_type = 'reminder_request')::INT AS reminder_request_count,
              l.sender_role AS latest_sender_role,
              l.message_type AS latest_message_type,
              l.body AS latest_body,
              l.created_at AS latest_message_at
       FROM assignment_staffing_messages m
       JOIN latest_messages l ON l.invite_id = m.invite_id
       WHERE m.invite_id = ANY($1::uuid[])
       GROUP BY m.invite_id, l.sender_role, l.message_type, l.body, l.created_at`,
      [inviteIds]
    );
    const messageByInviteId = new Map(messageRows.map((row) => [row.invite_id, row]));

    const enrichedRows = [];
    for (const invite of rows) {
      const conflicts = await getWorkerSchedulingConflicts(
        client,
        workerUserId,
        invite.start_date,
        invite.planned_end_date || "9999-12-31",
        { excludeAssignmentId: invite.assignment_id }
      );
      const conflictSummary = summarizeSchedulingConflicts(conflicts);
      const requestContext = buildWorkerRequestContext(invite);
      const messageSummary = messageByInviteId.get(invite.id) || null;
      const scoreReasons = parseJson(invite.score_reasons) || {};
      enrichedRows.push({
        ...invite,
        request_context: requestContext,
        priority: buildWorkerRequestPriority({ ...invite, ...requestContext }),
        score_reasons: scoreReasons,
        message_summary: messageSummary
          ? {
            total_messages: toInt(messageSummary.total_messages, 0),
            question_count: toInt(messageSummary.question_count, 0),
            reminder_request_count: toInt(messageSummary.reminder_request_count, 0),
            latest_sender_role: messageSummary.latest_sender_role,
            latest_message_type: messageSummary.latest_message_type,
            latest_body: messageSummary.latest_body,
            latest_message_at: messageSummary.latest_message_at
          }
          : {
            total_messages: 0,
            question_count: 0,
            reminder_request_count: 0,
            latest_sender_role: null,
            latest_message_type: null,
            latest_body: null,
            latest_message_at: null
          },
        delivery: {
          status: invite.delivery_status,
          attempt_count: toInt(invite.delivery_attempt_count, 0),
          last_attempt_at: invite.delivery_last_attempt_at,
          last_success_at: invite.delivery_last_success_at,
          last_error: invite.delivery_last_error
        },
        reminder: {
          remind_after: invite.remind_after,
          requested_at: invite.reminder_requested_at,
          last_sent_at: invite.last_reminder_sent_at,
          count: toInt(invite.reminder_count, 0),
          is_requested: !!invite.remind_after
        },
        conflicts: {
          has_conflicts: conflictSummary.count > 0,
          count: conflictSummary.count,
          label: conflictSummary.label,
          items: conflicts
        },
        is_expired: !!invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()
      });
    }

    return enrichedRows;
  });
}

async function loadWorkerInviteActionContext(client, inviteId, workerUserId) {
  const { rows } = await client.query(
    `SELECT i.*, c.promotion_mode, c.reservation_window_minutes, c.created_by AS campaign_created_by,
            c.source_campaign_id,
            cso.id AS choice_option_id,
            cso.choice_set_id,
            cs.choice_mode,
            cs.status AS choice_set_status,
            wp.first_name, wp.last_name, u.email
     FROM assignment_staffing_invites i
     JOIN assignment_staffing_campaigns c ON c.id = i.campaign_id
     LEFT JOIN assignment_staffing_choice_options cso ON cso.invite_id = i.id
     LEFT JOIN assignment_staffing_choice_sets cs ON cs.id = cso.choice_set_id
     LEFT JOIN worker_profiles wp ON wp.user_id = i.worker_user_id
     LEFT JOIN users u ON u.id = i.worker_user_id
     WHERE i.id = $1
       AND i.worker_user_id = $2
     FOR UPDATE OF i, c`,
    [inviteId, workerUserId]
  );
  return rows[0] || null;
}

async function expireInviteForWorkerAction(client, invite, workerUserId) {
  const assignment = await loadAssignmentContext(client, invite.assignment_id, invite.supplier_org_id, { lock: true });
  if (!assignment) return { error: "ASSIGNMENT_NOT_FOUND" };
  if (!(invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now() && LIVE_INVITE_STATUSES.has(invite.status))) {
    return { assignment, expired: false };
  }

  await client.query(
    `UPDATE assignment_staffing_invites
     SET status = 'expired',
         expired_at = NOW(),
         responded_at = COALESCE(responded_at, NOW()),
         updated_at = NOW()
     WHERE id = $1`,
    [invite.id]
  );
  await refreshCampaignMetrics(client, invite.campaign_id);
  await recalcAssignmentStaffing(client, assignment.id, { lock: true, writeEvent: false });
  await writeStaffingEvent(client, {
    assignmentId: assignment.id,
    campaignId: invite.campaign_id,
    inviteId: invite.id,
    actorId: workerUserId,
    eventType: "invite_expired"
  });
  await updateWaitlistCandidateState(client, {
    assignmentId: assignment.id,
    workerUserId,
    status: "removed",
    rootCampaignId: invite.source_campaign_id || invite.campaign_id,
    campaignId: invite.campaign_id,
    inviteId: invite.id,
    removalReason: "invite_expired",
    actorId: workerUserId
  });
  return { assignment, expired: true, error: "INVITE_EXPIRED" };
}

function isActiveStaffingChoiceSetStatus(status) {
  return ACTIVE_STAFFING_CHOICE_SET_STATUSES.has(status);
}

function buildStaffingChoiceModeLabel(choiceMode) {
  const labels = {
    preference_only: "Nur Präferenz",
    ranked_choice: "Priorisierte Auswahl",
    free_choice: "Freie Wahl"
  };
  return labels[choiceMode] || "Präferenz";
}

function buildStaffingChoiceSetTitle(title, optionCount) {
  const normalizedTitle = String(title || "").trim();
  if (normalizedTitle) return normalizedTitle;
  return `Einsatzauswahl${Number.isFinite(Number(optionCount)) ? ` (${Number(optionCount)} Optionen)` : ""}`;
}

function normalizeStaffingChoiceSetDeadline(value) {
  const candidate = value ? new Date(value) : new Date(Date.now() + (DEFAULT_STAFFING_CHOICE_SET_HOURS * 60 * 60 * 1000));
  if (Number.isNaN(candidate.getTime())) return null;
  return candidate;
}

function deriveStaffingChoiceOptionLiveState(option) {
  if (option?.promoted_link_id) return "assigned";
  if (option?.reservation_status === "promoted") return "assigned";
  if (option?.reservation_status === "reserved") return "reserved";
  if (option?.invite_status === "expired") return "expired";
  if (option?.invite_status === "declined") return "declined";
  if (option?.invite_status === "cancelled") return "cancelled";
  if (option?.invite_status === "accepted") return "selected";
  return "open";
}

function getWorkerPrimaryChoiceOption(choiceSet) {
  const options = Array.isArray(choiceSet?.options) ? choiceSet.options : [];
  const selected = options.find((option) => option.worker_response === "selected");
  if (selected) return selected;
  const preferred = options.find((option) => option.worker_response === "preferred");
  if (preferred) return preferred;
  const ranked = options
    .filter((option) => Number.isFinite(Number(option.worker_rank)))
    .sort((left, right) => Number(left.worker_rank) - Number(right.worker_rank))[0];
  if (ranked) return ranked;
  return options.find((option) => option.worker_response === "acceptable") || null;
}

function buildStaffingChoiceDispatcherSummary(choiceSet) {
  const options = Array.isArray(choiceSet?.options) ? choiceSet.options : [];
  const primary = getWorkerPrimaryChoiceOption(choiceSet);
  const primaryTitle = primary?.request_context?.title || primary?.request_context?.role || primary?.assignment_id || null;
  const primaryClient = primary?.request_context?.client_org_name || null;
  const acceptableCount = options.filter((option) => option.worker_response === "acceptable").length;
  const rankedOptions = options
    .filter((option) => Number.isFinite(Number(option.worker_rank)))
    .sort((left, right) => Number(left.worker_rank) - Number(right.worker_rank))
    .slice(0, 3);

  if (choiceSet?.choice_mode === "ranked_choice" && rankedOptions.length) {
    return `Ranking: ${rankedOptions.map((option) => `${Number(option.worker_rank)}. ${option.request_context?.title || option.assignment_id}`).join(" · ")}`;
  }
  if (primaryTitle) {
    return `${choiceSet?.choice_mode === "free_choice" ? "Ausgewählt" : "Favorit"}: ${primaryTitle}${primaryClient ? ` (${primaryClient})` : ""}${acceptableCount ? ` · ${acceptableCount} weitere Option${acceptableCount === 1 ? "" : "en"} ok` : ""}`;
  }
  if (acceptableCount) {
    return `${acceptableCount} Option${acceptableCount === 1 ? "" : "en"} als möglich markiert`;
  }
  return "";
}

function buildStaffingChoiceNotificationContext(choiceSet) {
  return {
    title: choiceSet?.title || "Neue Einsatzauswahl",
    optionCount: Array.isArray(choiceSet?.options) ? choiceSet.options.length : 0,
    deadlineLabel: formatDateTimeLabel(choiceSet?.response_deadline_at),
    modeLabel: buildStaffingChoiceModeLabel(choiceSet?.choice_mode)
  };
}

function mapStaffingChoiceSets(rows = []) {
  const grouped = new Map();

  for (const row of rows) {
    if (!grouped.has(row.id)) {
      grouped.set(row.id, {
        id: row.id,
        worker_user_id: row.worker_user_id,
        supplier_org_id: row.supplier_org_id,
        status: row.status,
        choice_mode: row.choice_mode,
        title: row.title,
        message: row.message,
        response_deadline_at: row.response_deadline_at,
        worker_note: row.worker_note,
        manual_override_note: row.manual_override_note,
        final_assignment_id: row.final_assignment_id,
        final_link_id: row.final_link_id,
        final_choice_option_id: row.final_choice_option_id,
        presented_at: row.presented_at,
        viewed_at: row.viewed_at,
        responded_at: row.responded_at,
        manual_override_at: row.manual_override_at,
        assigned_at: row.assigned_at,
        declined_at: row.declined_at,
        expired_at: row.expired_at,
        cancelled_at: row.cancelled_at,
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
        worker: {
          user_id: row.worker_user_id,
          first_name: row.first_name,
          last_name: row.last_name,
          personnel_number: row.personnel_number,
          email: row.worker_email
        },
        options: []
      });
    }

    const choiceSet = grouped.get(row.id);
    const requestContext = buildWorkerRequestContext({
      assignment_id: row.option_assignment_id,
      campaign_id: row.option_campaign_id,
      request_snapshot: row.request_snapshot,
      request_title: row.worker_description,
      request_role: row.worker_description,
      client_org_name: row.option_client_org_name,
      start_date: row.start_date,
      planned_end_date: row.planned_end_date,
      requested_quantity: row.requested_quantity,
      filled_quantity: row.filled_quantity,
      reserved_quantity: row.reserved_quantity,
      open_quantity: row.open_quantity,
      hourly_rate_cents: row.hourly_rate_cents,
      campaign_name: row.option_campaign_name
    });

    const option = {
      id: row.option_id,
      choice_set_id: row.id,
      assignment_id: row.option_assignment_id,
      invite_id: row.option_invite_id,
      campaign_id: row.option_campaign_id,
      option_order: toInt(row.option_order, 0),
      worker_response: row.worker_response,
      worker_rank: row.worker_rank == null ? null : toInt(row.worker_rank, null),
      worker_note: row.option_worker_note,
      worker_responded_at: row.worker_responded_at,
      dispatcher_state: row.dispatcher_state,
      dispatcher_note: row.dispatcher_note,
      dispatcher_updated_at: row.dispatcher_updated_at,
      invite_status: row.invite_status,
      invite_expires_at: row.expires_at,
      delivery_status: row.delivery_status,
      last_worker_action_at: row.last_worker_action_at,
      reservation_id: row.reservation_id,
      reservation_status: row.reservation_status,
      reservation_expires_at: row.reservation_expires_at,
      promoted_link_id: row.promoted_link_id,
      request_context: requestContext
    };
    option.live_state = deriveStaffingChoiceOptionLiveState(option);
    option.is_actionable = option.live_state === "open" && ACTIONABLE_INVITE_STATUSES.has(option.invite_status);
    choiceSet.options.push(option);
  }

  return [...grouped.values()].map((choiceSet) => {
    choiceSet.options.sort((left, right) => Number(left.option_order) - Number(right.option_order));
    const primary = getWorkerPrimaryChoiceOption(choiceSet);
    const selected = choiceSet.options.find((option) => option.id === choiceSet.final_choice_option_id)
      || choiceSet.options.find((option) => option.worker_response === "selected")
      || null;
    const rankedCount = choiceSet.options.filter((option) => option.worker_rank != null).length;
    const acceptableCount = choiceSet.options.filter((option) => option.worker_response === "acceptable").length;
    const activeOptionCount = choiceSet.options.filter((option) => option.live_state === "open" || option.live_state === "reserved" || option.live_state === "selected").length;

    choiceSet.summary = {
      primary_option_id: primary?.id || null,
      selected_option_id: selected?.id || null,
      ranked_count: rankedCount,
      acceptable_count: acceptableCount,
      active_option_count: activeOptionCount,
      dispatcher_summary: buildStaffingChoiceDispatcherSummary(choiceSet)
    };
    choiceSet.is_terminal = TERMINAL_STAFFING_CHOICE_SET_STATUSES.has(choiceSet.status);
    choiceSet.mode_label = buildStaffingChoiceModeLabel(choiceSet.choice_mode);
    return choiceSet;
  });
}

async function listStaffingChoiceSetIds(db, {
  workerUserId = null,
  supplierOrgId = null,
  assignmentId = null,
  activeOnly = false,
  limit = 20
} = {}) {
  const clauses = [];
  const params = [];

  if (workerUserId) {
    params.push(workerUserId);
    clauses.push(`cs.worker_user_id = $${params.length}`);
  }
  if (supplierOrgId) {
    params.push(supplierOrgId);
    clauses.push(`cs.supplier_org_id = $${params.length}`);
  }
  if (assignmentId) {
    params.push(assignmentId);
    clauses.push(`opt.assignment_id = $${params.length}`);
  }
  if (activeOnly) {
    clauses.push(`cs.status NOT IN ('assigned','declined','expired','cancelled')`);
  }

  params.push(clamp(toInt(limit, 20), 1, 50));
  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  // Postgres-Regel bei SELECT DISTINCT: jede ORDER BY-Spalte muss auch im
  // SELECT-List stehen. `cs.created_at` daher explizit projizieren, damit die
  // Tie-Breaker-Sortierung nach Erstelldatum erhalten bleibt. Deduplizierung
  // entsteht durch DISTINCT ueber den Paar (id, sort_at, created_at); da
  // id pro choice_set eindeutig ist, bleibt das Ergebnis semantisch gleich.
  const { rows } = await db.query(
    `SELECT DISTINCT cs.id,
            COALESCE(cs.assigned_at, cs.responded_at, cs.presented_at, cs.created_at) AS sort_at,
            cs.created_at
     FROM assignment_staffing_choice_sets cs
     JOIN assignment_staffing_choice_options opt ON opt.choice_set_id = cs.id
     ${whereClause}
     ORDER BY sort_at DESC NULLS LAST, cs.created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return rows.map((row) => row.id);
}

async function loadStaffingChoiceSetRows(db, choiceSetIds, { lock = false } = {}) {
  if (!Array.isArray(choiceSetIds) || !choiceSetIds.length) return [];
  const { rows } = await db.query(
    `SELECT cs.*,
            wp.first_name, wp.last_name, wp.personnel_number, wu.email AS worker_email,
            opt.id AS option_id,
            opt.assignment_id AS option_assignment_id,
            opt.invite_id AS option_invite_id,
            opt.campaign_id AS option_campaign_id,
            opt.option_order,
            opt.worker_response,
            opt.worker_rank,
            opt.worker_note AS option_worker_note,
            opt.worker_responded_at,
            opt.dispatcher_state,
            opt.dispatcher_note,
            opt.dispatcher_updated_at,
            i.status AS invite_status,
            i.expires_at,
            i.request_snapshot,
            i.delivery_status,
            i.last_worker_action_at,
            a.worker_description,
            a.start_date,
            a.planned_end_date,
            a.requested_quantity,
            a.filled_quantity,
            a.reserved_quantity,
            a.open_quantity,
            a.hourly_rate_cents,
            buyer.name AS option_client_org_name,
            camp.name AS option_campaign_name,
            res.id AS reservation_id,
            res.status AS reservation_status,
            res.expires_at AS reservation_expires_at,
            res.promoted_link_id
     FROM assignment_staffing_choice_sets cs
     JOIN assignment_staffing_choice_options opt ON opt.choice_set_id = cs.id
     JOIN assignment_staffing_invites i ON i.id = opt.invite_id
     JOIN assignments a ON a.id = opt.assignment_id
     LEFT JOIN organizations buyer ON buyer.id = a.org_id
     LEFT JOIN assignment_staffing_campaigns camp ON camp.id = i.campaign_id
     LEFT JOIN worker_profiles wp ON wp.user_id = cs.worker_user_id
     LEFT JOIN users wu ON wu.id = cs.worker_user_id
     LEFT JOIN LATERAL (
       SELECT r.id, r.status, r.expires_at, r.promoted_link_id
       FROM assignment_staffing_reservations r
       WHERE r.invite_id = opt.invite_id
       ORDER BY CASE
         WHEN r.status = 'reserved' THEN 0
         WHEN r.status = 'promoted' THEN 1
         ELSE 2
       END,
       r.reserved_at DESC NULLS LAST
       LIMIT 1
     ) res ON TRUE
     WHERE cs.id = ANY($1::uuid[])
     ORDER BY COALESCE(cs.assigned_at, cs.responded_at, cs.presented_at, cs.created_at) DESC NULLS LAST,
              cs.created_at DESC,
              opt.option_order ASC${lock ? " FOR UPDATE OF cs, opt, i" : ""}`,
    [choiceSetIds]
  );
  return rows;
}

async function loadSingleStaffingChoiceSet(db, choiceSetId, {
  workerUserId = null,
  supplierOrgId = null,
  lock = false
} = {}) {
  const rows = await loadStaffingChoiceSetRows(db, [choiceSetId], { lock });
  const choiceSet = mapStaffingChoiceSets(rows)[0] || null;
  if (!choiceSet) return null;
  if (workerUserId && choiceSet.worker_user_id !== workerUserId) return null;
  if (supplierOrgId && choiceSet.supplier_org_id !== supplierOrgId) return null;
  return choiceSet;
}

async function refreshStaffingChoiceSetLifecycle(db, choiceSetId, { lock = false } = {}) {
  const choiceSet = await loadSingleStaffingChoiceSet(db, choiceSetId, { lock });
  if (!choiceSet || TERMINAL_STAFFING_CHOICE_SET_STATUSES.has(choiceSet.status)) return choiceSet;

  const hasReserved = choiceSet.options.some((option) => option.reservation_status === "reserved");
  const hasLiveOptions = choiceSet.options.some((option) => ["open", "reserved", "selected"].includes(option.live_state));
  const hasRanked = choiceSet.options.some((option) => option.worker_rank != null);
  const hasSubmittedPreference = choiceSet.options.some((option) => ["preferred", "acceptable", "selected"].includes(option.worker_response));
  const allDeclined = choiceSet.options.every((option) => option.worker_response === "declined" || option.invite_status === "declined");
  const allInactive = choiceSet.options.every((option) => ["declined", "expired", "cancelled", "assigned"].includes(option.live_state));

  let nextStatus = choiceSet.status;
  if (choiceSet.final_link_id || choiceSet.assigned_at) {
    nextStatus = "assigned";
  } else if (choiceSet.manual_override_at && !hasReserved) {
    nextStatus = "manual_override";
  } else if (allDeclined) {
    nextStatus = "declined";
  } else if (!hasLiveOptions && allInactive) {
    nextStatus = choiceSet.options.some((option) => option.live_state === "expired") ? "expired" : "cancelled";
  } else if (hasRanked && choiceSet.choice_mode === "ranked_choice") {
    nextStatus = "preference_ranked";
  } else if (hasSubmittedPreference) {
    nextStatus = "preference_submitted";
  } else {
    nextStatus = "options_presented";
  }

  if (nextStatus === choiceSet.status) return choiceSet;

  await db.query(
    `UPDATE assignment_staffing_choice_sets
     SET status = $2,
         responded_at = CASE
           WHEN $2 IN ('preference_submitted','preference_ranked','manual_override','assigned','declined')
             THEN COALESCE(responded_at, NOW())
           ELSE responded_at
         END,
         assigned_at = CASE WHEN $2 = 'assigned' THEN COALESCE(assigned_at, NOW()) ELSE assigned_at END,
         declined_at = CASE WHEN $2 = 'declined' THEN COALESCE(declined_at, NOW()) ELSE declined_at END,
         expired_at = CASE WHEN $2 = 'expired' THEN COALESCE(expired_at, NOW()) ELSE expired_at END,
         cancelled_at = CASE WHEN $2 = 'cancelled' THEN COALESCE(cancelled_at, NOW()) ELSE cancelled_at END,
         updated_at = NOW()
     WHERE id = $1`,
    [choiceSetId, nextStatus]
  );

  return loadSingleStaffingChoiceSet(db, choiceSetId, { lock: false });
}

async function markStaffingChoiceSetsViewed(db, choiceSets, workerUserId) {
  const setIds = (Array.isArray(choiceSets) ? choiceSets : [])
    .map((choiceSet) => choiceSet?.id)
    .filter(Boolean);
  if (!setIds.length) return;

  await db.query(
    `UPDATE assignment_staffing_choice_sets
     SET viewed_at = COALESCE(viewed_at, NOW()),
         updated_at = NOW()
     WHERE id = ANY($1::uuid[])`,
    [setIds]
  );

  for (const choiceSet of choiceSets) {
    for (const option of choiceSet.options || []) {
      if (option.invite_status === "sent") {
        await markStaffingInviteViewed(db, option.invite_id, workerUserId);
      }
    }
  }
}

async function markGroupedChoiceInviteDelivered(db, option, choiceSet) {
  if (!option?.invite_id) return;
  await db.query(
    `UPDATE assignment_staffing_invites
     SET delivery_status = 'delivered',
         delivery_attempt_count = CASE WHEN delivery_attempt_count >= 1 THEN delivery_attempt_count ELSE 1 END,
         delivery_last_attempt_at = COALESCE(delivery_last_attempt_at, NOW()),
         delivery_last_success_at = COALESCE(delivery_last_success_at, NOW()),
         delivery_last_error = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [option.invite_id]
  );
  await writeStaffingEvent(db, {
    assignmentId: option.assignment_id,
    campaignId: option.campaign_id,
    inviteId: option.invite_id,
    choiceSetId: choiceSet.id,
    choiceOptionId: option.id,
    actorId: choiceSet.created_by,
    eventType: "invite_delivered",
    newValues: { kind: "choice_set_grouped", delivery_status: "delivered" }
  });
}

async function cancelSiblingChoiceOptions(db, choiceSet, selectedOptionId, {
  actorId = null,
  reason = "choice_set_superseded"
} = {}) {
  const affectedAssignments = new Set();
  const affectedCampaigns = new Set();

  for (const option of choiceSet.options || []) {
    if (option.id === selectedOptionId) continue;
    affectedAssignments.add(option.assignment_id);
    if (option.campaign_id) affectedCampaigns.add(option.campaign_id);

    if (LIVE_INVITE_STATUSES.has(option.invite_status)) {
      await db.query(
        `UPDATE assignment_staffing_invites
         SET status = 'cancelled',
             cancelled_at = COALESCE(cancelled_at, NOW()),
             responded_at = COALESCE(responded_at, NOW()),
             remind_after = NULL,
             updated_at = NOW(),
             response_note = COALESCE(response_note, $2)
         WHERE id = $1`,
        [option.invite_id, reason]
      );
      await writeStaffingEvent(db, {
        assignmentId: option.assignment_id,
        campaignId: option.campaign_id,
        inviteId: option.invite_id,
        choiceSetId: choiceSet.id,
        choiceOptionId: option.id,
        actorId,
        eventType: "invite_cancelled",
        newValues: { reason }
      });
    }

    if (option.reservation_status === "reserved" && option.reservation_id) {
      await db.query(
        `UPDATE assignment_staffing_reservations
         SET status = 'released',
             released_at = NOW(),
             release_reason = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [option.reservation_id, reason]
      );
      await writeStaffingEvent(db, {
        assignmentId: option.assignment_id,
        campaignId: option.campaign_id,
        inviteId: option.invite_id,
        reservationId: option.reservation_id,
        choiceSetId: choiceSet.id,
        choiceOptionId: option.id,
        actorId,
        eventType: "reservation_released",
        newValues: { release_reason: reason }
      });
    }

    await db.query(
      `UPDATE assignment_staffing_choice_options
       SET dispatcher_state = 'withdrawn',
           dispatcher_note = COALESCE(dispatcher_note, $2),
           dispatcher_updated_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [option.id, reason]
    );

    await updateWaitlistCandidateState(db, {
      assignmentId: option.assignment_id,
      workerUserId: choiceSet.worker_user_id,
      status: "removed",
      rootCampaignId: await getAssignmentWaitlistRootCampaignId(db, option.assignment_id),
      campaignId: option.campaign_id,
      inviteId: option.invite_id,
      reservationId: option.reservation_id,
      removalReason: reason,
      actorId
    });
  }

  for (const campaignId of affectedCampaigns) {
    await refreshCampaignMetrics(db, campaignId);
  }
  for (const assignmentId of affectedAssignments) {
    await recalcAssignmentStaffing(db, assignmentId, { lock: true, writeEvent: false });
  }
}

async function finalizeStaffingChoiceSetAssignmentInternal(db, choiceSet, selectedOption, {
  linkId,
  actorId = null,
  note = null
} = {}) {
  const primaryWorkerOption = getWorkerPrimaryChoiceOption(choiceSet);
  const isManualOverride = !!primaryWorkerOption && primaryWorkerOption.id !== selectedOption.id;
  const normalizedNote = String(note || "").trim() || null;
  const closeReason = isManualOverride ? "choice_set_manual_override" : "choice_set_assigned";

  if (!selectedOption.reservation_id && LIVE_INVITE_STATUSES.has(selectedOption.invite_status)) {
    await db.query(
      `UPDATE assignment_staffing_invites
       SET status = 'cancelled',
           cancelled_at = COALESCE(cancelled_at, NOW()),
           responded_at = COALESCE(responded_at, NOW()),
           remind_after = NULL,
           updated_at = NOW(),
           response_note = COALESCE(response_note, $2)
       WHERE id = $1`,
      [selectedOption.invite_id, closeReason]
    );
    await writeStaffingEvent(db, {
      assignmentId: selectedOption.assignment_id,
      campaignId: selectedOption.campaign_id,
      inviteId: selectedOption.invite_id,
      choiceSetId: choiceSet.id,
      choiceOptionId: selectedOption.id,
      actorId,
      eventType: "invite_cancelled",
      newValues: { reason: closeReason }
    });
  }

  await db.query(
    `UPDATE assignment_staffing_choice_options
     SET dispatcher_state = $2,
         dispatcher_note = COALESCE($3, dispatcher_note),
         dispatcher_updated_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [selectedOption.id, isManualOverride ? "manual_override" : "assigned", normalizedNote]
  );

  await updateWaitlistCandidateState(db, {
    assignmentId: selectedOption.assignment_id,
    workerUserId: choiceSet.worker_user_id,
    status: "assigned",
    rootCampaignId: await getAssignmentWaitlistRootCampaignId(db, selectedOption.assignment_id),
    campaignId: selectedOption.campaign_id,
    inviteId: selectedOption.invite_id,
    reservationId: selectedOption.reservation_id,
    linkId,
    actorId
  });

  await cancelSiblingChoiceOptions(db, choiceSet, selectedOption.id, { actorId, reason: closeReason });

  await db.query(
    `UPDATE assignment_staffing_choice_sets
     SET status = 'assigned',
         final_choice_option_id = $2,
         final_assignment_id = $3,
         final_link_id = $4,
         responded_at = COALESCE(responded_at, NOW()),
         manual_override_at = CASE WHEN $5 THEN COALESCE(manual_override_at, NOW()) ELSE manual_override_at END,
         manual_override_note = CASE WHEN $5 THEN COALESCE($6, manual_override_note) ELSE manual_override_note END,
         assigned_at = COALESCE(assigned_at, NOW()),
         updated_at = NOW()
     WHERE id = $1`,
    [choiceSet.id, selectedOption.id, selectedOption.assignment_id, linkId, isManualOverride, normalizedNote]
  );

  if (selectedOption.campaign_id) {
    await refreshCampaignMetrics(db, selectedOption.campaign_id);
  }
  await recalcAssignmentStaffing(db, selectedOption.assignment_id, { lock: true, writeEvent: false });

  if (isManualOverride) {
    await writeStaffingEvent(db, {
      assignmentId: selectedOption.assignment_id,
      campaignId: selectedOption.campaign_id,
      inviteId: selectedOption.invite_id,
      reservationId: selectedOption.reservation_id,
      choiceSetId: choiceSet.id,
      choiceOptionId: selectedOption.id,
      actorId,
      eventType: "choice_manual_override",
      newValues: {
        final_link_id: linkId,
        final_assignment_id: selectedOption.assignment_id,
        note: normalizedNote
      }
    });
  }
  await writeStaffingEvent(db, {
    assignmentId: selectedOption.assignment_id,
    campaignId: selectedOption.campaign_id,
    inviteId: selectedOption.invite_id,
    reservationId: selectedOption.reservation_id,
    choiceSetId: choiceSet.id,
    choiceOptionId: selectedOption.id,
    actorId,
    eventType: "choice_assigned",
    newValues: {
      final_link_id: linkId,
      final_assignment_id: selectedOption.assignment_id,
      manual_override: isManualOverride
    }
  });

  await auditLog.writeAudit(db, {
    action: isManualOverride
      ? "assignment.staffing_choice_set.manual_override"
      : "assignment.staffing_choice_set.assigned",
    entity_type: "assignment_staffing_choice_set",
    entity_id: choiceSet.id,
    actor_id: actorId,
    details: {
      worker_user_id: choiceSet.worker_user_id,
      selected_option_id: selectedOption.id,
      assignment_id: selectedOption.assignment_id,
      link_id: linkId,
      manual_override: isManualOverride
    }
  });

  return loadSingleStaffingChoiceSet(db, choiceSet.id);
}

async function listAssignmentStaffingChoiceSets(db, assignmentId, supplierOrgId) {
  const choiceSetIds = await listStaffingChoiceSetIds(db, {
    supplierOrgId,
    assignmentId,
    limit: 20
  });
  if (!choiceSetIds.length) return [];

  const refreshedIds = [];
  for (const choiceSetId of choiceSetIds) {
    const refreshed = await refreshStaffingChoiceSetLifecycle(db, choiceSetId);
    if (refreshed) refreshedIds.push(choiceSetId);
  }
  if (!refreshedIds.length) return [];

  return mapStaffingChoiceSets(await loadStaffingChoiceSetRows(db, refreshedIds))
    .filter((choiceSet) => choiceSet.options.some((option) => option.assignment_id === assignmentId));
}

export function listWorkerStaffingChoiceSets(pool, workerUserId, {
  limit = 10,
  markViewed = false
} = {}) {
  return withTransaction(pool, async (client) => {
    const choiceSetIds = await listStaffingChoiceSetIds(client, {
      workerUserId,
      activeOnly: true,
      limit
    });
    if (!choiceSetIds.length) return [];

    const activeIds = [];
    for (const choiceSetId of choiceSetIds) {
      const refreshed = await refreshStaffingChoiceSetLifecycle(client, choiceSetId);
      if (refreshed && isActiveStaffingChoiceSetStatus(refreshed.status)) {
        activeIds.push(choiceSetId);
      }
    }
    if (!activeIds.length) return [];

    let choiceSets = mapStaffingChoiceSets(await loadStaffingChoiceSetRows(client, activeIds));
    if (markViewed) {
      await markStaffingChoiceSetsViewed(client, choiceSets, workerUserId);
      choiceSets = mapStaffingChoiceSets(await loadStaffingChoiceSetRows(client, activeIds));
    }
    return choiceSets;
  });
}

export function getStaffingChoiceSet(pool, choiceSetId, {
  workerUserId = null,
  supplierOrgId = null
} = {}) {
  return withTransaction(pool, async (client) => {
    const choiceSet = await refreshStaffingChoiceSetLifecycle(client, choiceSetId);
    if (!choiceSet) return null;
    if (workerUserId && choiceSet.worker_user_id !== workerUserId) return null;
    if (supplierOrgId && choiceSet.supplier_org_id !== supplierOrgId) return null;
    return choiceSet;
  });
}

export async function createStaffingChoiceSet(pool, {
  workerUserId,
  supplierOrgId,
  actorId,
  assignmentIds,
  choiceMode = "preference_only",
  title = null,
  message = null,
  responseDeadlineAt = null
}) {
  const normalizedAssignmentIds = [...new Set((Array.isArray(assignmentIds) ? assignmentIds : []).filter(Boolean))];
  if (normalizedAssignmentIds.length < 2) return { error: "INSUFFICIENT_OPTIONS" };
  if (!STAFFING_CHOICE_MODES.includes(choiceMode)) return { error: "INVALID_CHOICE_MODE" };

  const deadline = normalizeStaffingChoiceSetDeadline(responseDeadlineAt);
  if (!deadline) return { error: "INVALID_RESPONSE_DEADLINE" };

  const result = await withTransaction(pool, async (client) => {
    const { rows: workerRows } = await client.query(
      `SELECT wp.user_id, wp.is_active, wp.first_name, wp.last_name, u.email
       FROM worker_profiles wp
       LEFT JOIN users u ON u.id = wp.user_id
       WHERE wp.user_id = $1
         AND wp.supplier_org_id = $2`,
      [workerUserId, supplierOrgId]
    );
    const worker = workerRows[0] || null;
    if (!worker) return { error: "WORKER_NOT_FOUND" };
    if (!worker.is_active) return { error: "WORKER_INACTIVE" };

    const { rows: overlappingChoiceRows } = await client.query(
      `SELECT DISTINCT opt.assignment_id
       FROM assignment_staffing_choice_sets cs
       JOIN assignment_staffing_choice_options opt ON opt.choice_set_id = cs.id
       WHERE cs.worker_user_id = $1
         AND cs.status NOT IN ('assigned','declined','expired','cancelled')
         AND opt.assignment_id = ANY($2::uuid[])`,
      [workerUserId, normalizedAssignmentIds]
    );
    if (overlappingChoiceRows.length) {
      return {
        error: "CHOICE_SET_OPTION_ALREADY_ACTIVE",
        assignment_ids: overlappingChoiceRows.map((row) => row.assignment_id)
      };
    }

    const normalizedTitle = buildStaffingChoiceSetTitle(title, normalizedAssignmentIds.length);
    const { rows: choiceSetRows } = await client.query(
      `INSERT INTO assignment_staffing_choice_sets
         (worker_user_id, supplier_org_id, status, choice_mode, title, message, response_deadline_at, created_by)
       VALUES ($1,$2,'options_presented',$3,$4,$5,$6,$7)
       RETURNING *`,
      [workerUserId, supplierOrgId, choiceMode, normalizedTitle, String(message || "").trim() || null, deadline, actorId || null]
    );
    const choiceSet = choiceSetRows[0];

    let optionOrder = 1;
    for (const assignmentId of normalizedAssignmentIds) {
      const assignment = await loadAssignmentContext(client, assignmentId, supplierOrgId, { lock: true });
      if (!assignment) return { error: "ASSIGNMENT_NOT_FOUND", assignment_id: assignmentId };
      if (!ASSIGNABLE_STATUSES.has(assignment.status)) {
        return { error: "ASSIGNMENT_NOT_ASSIGNABLE", assignment_id: assignmentId, status: assignment.status };
      }

      const staffing = await recalcAssignmentStaffing(client, assignmentId, { lock: true, writeEvent: false });
      if (!staffing || staffing.open_quantity <= 0) {
        return { error: "ASSIGNMENT_FILLED", assignment_id: assignmentId };
      }

      const campaignResult = await createStaffingCampaignInternal(client, {
        assignment,
        staffing,
        actorId,
        workerUserIds: [workerUserId],
        message,
        name: normalizedTitle,
        expiresAt: deadline,
        promotionMode: "manual_review",
        reservationWindowMinutes: 30,
        autoBackfillEnabled: false,
        seedWaitlist: false
      });
      if (campaignResult?.error) {
        return {
          ...campaignResult,
          assignment_id: assignmentId
        };
      }

      const invite = campaignResult.invites?.[0] || null;
      if (!invite) return { error: "INVITE_CREATION_FAILED", assignment_id: assignmentId };

      const { rows: optionRows } = await client.query(
        `INSERT INTO assignment_staffing_choice_options
           (choice_set_id, assignment_id, invite_id, campaign_id, worker_user_id, supplier_org_id, option_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [choiceSet.id, assignment.id, invite.id, invite.campaign_id, workerUserId, supplierOrgId, optionOrder]
      );
      const option = optionRows[0];

      await markGroupedChoiceInviteDelivered(client, {
        id: option.id,
        assignment_id: assignment.id,
        invite_id: invite.id,
        campaign_id: invite.campaign_id
      }, choiceSet);
      await writeStaffingEvent(client, {
        assignmentId: assignment.id,
        campaignId: invite.campaign_id,
        inviteId: invite.id,
        choiceSetId: choiceSet.id,
        choiceOptionId: option.id,
        actorId,
        eventType: "choice_set_created",
        newValues: {
          choice_mode: choiceMode,
          option_order: optionOrder
        }
      });
      optionOrder += 1;
    }

    await auditLog.writeAudit(client, {
      action: "assignment.staffing_choice_set.created",
      entity_type: "assignment_staffing_choice_set",
      entity_id: choiceSet.id,
      actor_id: actorId,
      details: {
        worker_user_id: workerUserId,
        assignment_ids: normalizedAssignmentIds,
        choice_mode: choiceMode,
        option_count: normalizedAssignmentIds.length
      }
    });

    return loadSingleStaffingChoiceSet(client, choiceSet.id);
  });

  if (!result?.error && result?.id) {
    workerNotifications.notifyStaffingChoiceRequest(
      pool,
      workerUserId,
      result.id,
      buildStaffingChoiceNotificationContext(result),
      { throwOnError: false }
    ).catch(() => {});
  }

  return result;
}

export function syncStaffingChoiceSetsForAssignmentLink(pool, {
  assignmentId,
  workerUserId,
  linkId,
  actorId = null,
  note = null,
  choiceSetId = null,
  choiceOptionId = null
}) {
  return withTransaction(pool, async (client) => {
    const targetChoiceSetIds = choiceSetId
      ? [choiceSetId]
      : await listStaffingChoiceSetIds(client, {
        workerUserId,
        assignmentId,
        activeOnly: true,
        limit: 10
      });
    const synced = [];

    for (const targetId of targetChoiceSetIds) {
      const choiceSet = await loadSingleStaffingChoiceSet(client, targetId, {
        workerUserId,
        lock: true
      });
      if (!choiceSet || choiceSet.is_terminal) continue;

      const selectedOption = choiceOptionId
        ? choiceSet.options.find((option) => option.id === choiceOptionId)
        : choiceSet.options.find((option) => option.assignment_id === assignmentId);
      if (!selectedOption) continue;

      synced.push(await finalizeStaffingChoiceSetAssignmentInternal(client, choiceSet, selectedOption, {
        linkId,
        actorId,
        note
      }));
    }

    return synced;
  });
}

function resolveStaffingChoiceSetActionError(choiceSet, expectedMode = null) {
  if (!choiceSet) return "CHOICE_SET_NOT_FOUND";
  if (expectedMode && choiceSet.choice_mode !== expectedMode) return "CHOICE_SET_MODE_MISMATCH";
  if (choiceSet.status === "assigned") return "CHOICE_SET_ALREADY_ASSIGNED";
  if (choiceSet.status === "declined") return "CHOICE_SET_ALREADY_DECLINED";
  if (choiceSet.status === "expired") return "CHOICE_SET_EXPIRED";
  if (choiceSet.status === "cancelled") return "CHOICE_SET_CANCELLED";
  if (choiceSet.status === "manual_override") return "CHOICE_SET_MANUAL_OVERRIDE";
  return null;
}

export async function submitStaffingChoicePreferences(pool, {
  choiceSetId,
  workerUserId,
  primaryOptionId = null,
  acceptableOptionIds = [],
  note = null
}) {
  const normalizedNote = String(note || "").trim() || null;
  const result = await withTransaction(pool, async (client) => {
    const choiceSet = await loadSingleStaffingChoiceSet(client, choiceSetId, {
      workerUserId,
      lock: true
    });
    const actionError = resolveStaffingChoiceSetActionError(choiceSet, "preference_only");
    if (actionError) return { error: actionError, choice_mode: choiceSet?.choice_mode || null };
    if ((choiceSet.options || []).some((option) => option.worker_response === "selected" || option.reservation_status === "reserved")) {
      return { error: "CHOICE_SET_ALREADY_SELECTED" };
    }

    const optionIds = new Set((choiceSet.options || []).map((option) => option.id));
    if (primaryOptionId && !optionIds.has(primaryOptionId)) return { error: "CHOICE_OPTION_NOT_FOUND" };

    const acceptableSet = new Set(
      (Array.isArray(acceptableOptionIds) ? acceptableOptionIds : [])
        .filter((optionId) => optionIds.has(optionId) && optionId !== primaryOptionId)
    );
    if (!primaryOptionId && acceptableSet.size === 0) return { error: "NO_PREFERENCE_SELECTED" };

    for (const option of choiceSet.options || []) {
      const nextResponse = option.id === primaryOptionId
        ? "preferred"
        : (acceptableSet.has(option.id) ? "acceptable" : "pending");
      const nextNote = option.id === primaryOptionId ? normalizedNote : null;
      await client.query(
        `UPDATE assignment_staffing_choice_options
         SET worker_response = $2,
             worker_rank = NULL,
             worker_note = $3,
             worker_responded_at = CASE WHEN $2 <> 'pending' THEN NOW() ELSE worker_responded_at END,
             updated_at = NOW()
         WHERE id = $1`,
        [option.id, nextResponse, nextNote]
      );
      if (nextResponse !== "pending") {
        await writeStaffingEvent(client, {
          assignmentId: option.assignment_id,
          campaignId: option.campaign_id,
          inviteId: option.invite_id,
          choiceSetId,
          choiceOptionId: option.id,
          actorId: workerUserId,
          eventType: "choice_preference_submitted",
          newValues: {
            worker_response: nextResponse
          }
        });
      }
    }

    await client.query(
      `UPDATE assignment_staffing_choice_sets
       SET status = 'preference_submitted',
           worker_note = $2,
           responded_at = COALESCE(responded_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [choiceSetId, normalizedNote]
    );
    await auditLog.writeAudit(client, {
      action: "assignment.staffing_choice_set.preference_submitted",
      entity_type: "assignment_staffing_choice_set",
      entity_id: choiceSetId,
      actor_id: workerUserId,
      details: {
        primary_option_id: primaryOptionId,
        acceptable_option_ids: [...acceptableSet]
      }
    });

    return loadSingleStaffingChoiceSet(client, choiceSetId);
  });

  if (!result?.error && result?.created_by) {
    workerNotifications.notifyStaffingChoiceSubmittedToDispatcher(
      pool,
      result.created_by,
      result.id,
      buildWorkerName(result.worker),
      result.summary?.dispatcher_summary || null
    ).catch(() => {});
  }
  return result;
}

export async function submitStaffingChoiceRanking(pool, {
  choiceSetId,
  workerUserId,
  rankedOptionIds = [],
  note = null
}) {
  const normalizedNote = String(note || "").trim() || null;
  const result = await withTransaction(pool, async (client) => {
    const choiceSet = await loadSingleStaffingChoiceSet(client, choiceSetId, {
      workerUserId,
      lock: true
    });
    const actionError = resolveStaffingChoiceSetActionError(choiceSet, "ranked_choice");
    if (actionError) return { error: actionError, choice_mode: choiceSet?.choice_mode || null };
    if ((choiceSet.options || []).some((option) => option.worker_response === "selected" || option.reservation_status === "reserved")) {
      return { error: "CHOICE_SET_ALREADY_SELECTED" };
    }

    const uniqueRankedOptionIds = [...new Set((Array.isArray(rankedOptionIds) ? rankedOptionIds : []).filter(Boolean))];
    if (!uniqueRankedOptionIds.length) return { error: "NO_RANKING_SELECTED" };

    const optionIds = new Set((choiceSet.options || []).map((option) => option.id));
    if (uniqueRankedOptionIds.some((optionId) => !optionIds.has(optionId))) return { error: "CHOICE_OPTION_NOT_FOUND" };

    for (const option of choiceSet.options || []) {
      const rank = uniqueRankedOptionIds.indexOf(option.id);
      const nextRank = rank >= 0 ? rank + 1 : null;
      const nextResponse = nextRank ? "ranked" : "pending";
      await client.query(
        `UPDATE assignment_staffing_choice_options
         SET worker_response = $2,
             worker_rank = $3,
             worker_note = CASE WHEN $3 = 1 THEN $4 ELSE worker_note END,
             worker_responded_at = CASE WHEN $2 <> 'pending' THEN NOW() ELSE worker_responded_at END,
             updated_at = NOW()
         WHERE id = $1`,
        [option.id, nextResponse, nextRank, normalizedNote]
      );
      if (nextRank) {
        await writeStaffingEvent(client, {
          assignmentId: option.assignment_id,
          campaignId: option.campaign_id,
          inviteId: option.invite_id,
          choiceSetId,
          choiceOptionId: option.id,
          actorId: workerUserId,
          eventType: "choice_ranking_submitted",
          newValues: {
            worker_rank: nextRank
          }
        });
      }
    }

    await client.query(
      `UPDATE assignment_staffing_choice_sets
       SET status = 'preference_ranked',
           worker_note = $2,
           responded_at = COALESCE(responded_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [choiceSetId, normalizedNote]
    );
    await auditLog.writeAudit(client, {
      action: "assignment.staffing_choice_set.ranking_submitted",
      entity_type: "assignment_staffing_choice_set",
      entity_id: choiceSetId,
      actor_id: workerUserId,
      details: {
        ranked_option_ids: uniqueRankedOptionIds
      }
    });

    return loadSingleStaffingChoiceSet(client, choiceSetId);
  });

  if (!result?.error && result?.created_by) {
    workerNotifications.notifyStaffingChoiceSubmittedToDispatcher(
      pool,
      result.created_by,
      result.id,
      buildWorkerName(result.worker),
      result.summary?.dispatcher_summary || null
    ).catch(() => {});
  }
  return result;
}

export async function selectStaffingChoiceOption(pool, {
  choiceSetId,
  workerUserId,
  choiceOptionId,
  note = null
}) {
  const normalizedNote = String(note || "").trim() || null;
  const result = await withTransaction(pool, async (client) => {
    const choiceSet = await loadSingleStaffingChoiceSet(client, choiceSetId, {
      workerUserId,
      lock: true
    });
    const actionError = resolveStaffingChoiceSetActionError(choiceSet, "free_choice");
    if (actionError) return { error: actionError, choice_mode: choiceSet?.choice_mode || null };
    if ((choiceSet.options || []).some((option) => option.worker_response === "selected" || option.reservation_status === "reserved" || option.promoted_link_id)) {
      return { error: "CHOICE_SET_ALREADY_SELECTED" };
    }

    const selectedOption = (choiceSet.options || []).find((option) => option.id === choiceOptionId);
    if (!selectedOption) return { error: "CHOICE_OPTION_NOT_FOUND" };
    if (!selectedOption.is_actionable) {
      return { error: "CHOICE_OPTION_NOT_AVAILABLE", current_status: selectedOption.invite_status };
    }

    const inviteResult = await respondToStaffingInviteInternal(client, {
      inviteId: selectedOption.invite_id,
      workerUserId,
      action: "accept",
      note: normalizedNote,
      allowChoiceSetInvite: true
    });
    if (inviteResult.error) return inviteResult;

    for (const option of choiceSet.options || []) {
      const nextResponse = option.id === selectedOption.id ? "selected" : "pending";
      await client.query(
        `UPDATE assignment_staffing_choice_options
         SET worker_response = $2,
             worker_rank = CASE WHEN $2 = 'selected' THEN 1 ELSE NULL END,
             worker_note = CASE WHEN $2 = 'selected' THEN $3 ELSE worker_note END,
             worker_responded_at = CASE WHEN $2 = 'selected' THEN NOW() ELSE worker_responded_at END,
             updated_at = NOW()
         WHERE id = $1`,
        [option.id, nextResponse, normalizedNote]
      );
    }

    await cancelSiblingChoiceOptions(client, choiceSet, selectedOption.id, {
      actorId: workerUserId,
      reason: "choice_option_selected"
    });
    await client.query(
      `UPDATE assignment_staffing_choice_sets
       SET status = 'preference_submitted',
           worker_note = $2,
           responded_at = COALESCE(responded_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [choiceSetId, normalizedNote]
    );
    await writeStaffingEvent(client, {
      assignmentId: selectedOption.assignment_id,
      campaignId: selectedOption.campaign_id,
      inviteId: selectedOption.invite_id,
      reservationId: inviteResult.reservation?.id || null,
      choiceSetId,
      choiceOptionId: selectedOption.id,
      actorId: workerUserId,
      eventType: "choice_option_selected",
      newValues: {
        reservation_id: inviteResult.reservation?.id || null
      }
    });
    await auditLog.writeAudit(client, {
      action: "assignment.staffing_choice_set.option_selected",
      entity_type: "assignment_staffing_choice_set",
      entity_id: choiceSetId,
      actor_id: workerUserId,
      details: {
        selected_option_id: selectedOption.id,
        assignment_id: selectedOption.assignment_id
      }
    });

    let updatedChoiceSet = await loadSingleStaffingChoiceSet(client, choiceSetId);
    if (inviteResult.link?.id) {
      const synced = await syncStaffingChoiceSetsForAssignmentLink(client, {
        assignmentId: selectedOption.assignment_id,
        workerUserId,
        linkId: inviteResult.link.id,
        actorId: workerUserId,
        note: normalizedNote,
        choiceSetId,
        choiceOptionId: selectedOption.id
      });
      updatedChoiceSet = synced?.[0] || updatedChoiceSet;
    }

    return {
      ...inviteResult,
      choice_set: updatedChoiceSet
    };
  });

  if (!result?.error && result?.dispatcher_user_id) {
    if (result.link?.id) {
      workerNotifications.notifyAssignmentConfirmedToDispatcher(
        pool,
        result.dispatcher_user_id,
        result.link.id,
        result.worker_name
      ).catch(() => {});
    } else {
      workerNotifications.notifyStaffingInviteAcceptedToDispatcher(
        pool,
        result.dispatcher_user_id,
        result.invite?.id || result.reservation?.invite_id || null,
        result.worker_name
      ).catch(() => {});
    }
  }

  return result;
}

export async function declineStaffingChoiceSet(pool, {
  choiceSetId,
  workerUserId,
  note = null
}) {
  const normalizedNote = String(note || "").trim() || null;
  const result = await withTransaction(pool, async (client) => {
    const choiceSet = await loadSingleStaffingChoiceSet(client, choiceSetId, {
      workerUserId,
      lock: true
    });
    const actionError = resolveStaffingChoiceSetActionError(choiceSet);
    if (actionError) return { error: actionError };
    if ((choiceSet.options || []).some((option) => option.worker_response === "selected" || option.reservation_status === "reserved" || option.promoted_link_id)) {
      return { error: "CHOICE_SET_ALREADY_SELECTED" };
    }

    const affectedAssignments = new Set();
    const affectedCampaigns = new Set();
    for (const option of choiceSet.options || []) {
      affectedAssignments.add(option.assignment_id);
      if (option.campaign_id) affectedCampaigns.add(option.campaign_id);

      await client.query(
        `UPDATE assignment_staffing_choice_options
         SET worker_response = 'declined',
             worker_rank = NULL,
             worker_responded_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [option.id]
      );

      if (ACTIONABLE_INVITE_STATUSES.has(option.invite_status)) {
        await client.query(
          `UPDATE assignment_staffing_invites
           SET status = 'declined',
               declined_at = COALESCE(declined_at, NOW()),
               responded_at = COALESCE(responded_at, NOW()),
               response_note = $2,
               remind_after = NULL,
               last_worker_action_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [option.invite_id, normalizedNote]
        );
        await writeStaffingEvent(client, {
          assignmentId: option.assignment_id,
          campaignId: option.campaign_id,
          inviteId: option.invite_id,
          choiceSetId,
          choiceOptionId: option.id,
          actorId: workerUserId,
          eventType: "invite_declined",
          newValues: { response_note: normalizedNote }
        });
      }

      await updateWaitlistCandidateState(client, {
        assignmentId: option.assignment_id,
        workerUserId,
        status: "removed",
        rootCampaignId: await getAssignmentWaitlistRootCampaignId(client, option.assignment_id),
        campaignId: option.campaign_id,
        inviteId: option.invite_id,
        removalReason: "choice_set_declined",
        actorId: workerUserId
      });
      await writeStaffingEvent(client, {
        assignmentId: option.assignment_id,
        campaignId: option.campaign_id,
        inviteId: option.invite_id,
        choiceSetId,
        choiceOptionId: option.id,
        actorId: workerUserId,
        eventType: "choice_set_declined",
        newValues: {
          response_note: normalizedNote
        }
      });
    }

    await client.query(
      `UPDATE assignment_staffing_choice_sets
       SET status = 'declined',
           worker_note = $2,
           responded_at = COALESCE(responded_at, NOW()),
           declined_at = COALESCE(declined_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [choiceSetId, normalizedNote]
    );

    for (const campaignId of affectedCampaigns) {
      await refreshCampaignMetrics(client, campaignId);
    }
    for (const assignmentId of affectedAssignments) {
      await recalcAssignmentStaffing(client, assignmentId, { lock: true, writeEvent: false });
    }

    await auditLog.writeAudit(client, {
      action: "assignment.staffing_choice_set.declined",
      entity_type: "assignment_staffing_choice_set",
      entity_id: choiceSetId,
      actor_id: workerUserId,
      details: {
        worker_user_id: workerUserId
      }
    });

    return loadSingleStaffingChoiceSet(client, choiceSetId);
  });

  if (!result?.error && result?.created_by) {
    workerNotifications.notifyStaffingChoiceDeclinedToDispatcher(
      pool,
      result.created_by,
      result.id,
      buildWorkerName(result.worker),
      normalizedNote
    ).catch(() => {});
  }
  return result;
}

export async function askStaffingInviteQuestion(pool, {
  inviteId,
  workerUserId,
  question
}) {
  const normalizedQuestion = String(question || "").trim();
  if (!normalizedQuestion) return { error: "QUESTION_REQUIRED" };

  const result = await withTransaction(pool, async (client) => {
    const invite = await loadWorkerInviteActionContext(client, inviteId, workerUserId);
    if (!invite) return { error: "INVITE_NOT_FOUND" };

    const expirationState = await expireInviteForWorkerAction(client, invite, workerUserId);
    if (expirationState.error) return { error: expirationState.error };

    if (!ACTIONABLE_INVITE_STATUSES.has(invite.status)) {
      return { error: "INVITE_NOT_ACTIONABLE", current_status: invite.status };
    }

    const { rows: updatedRows } = await client.query(
      `UPDATE assignment_staffing_invites
       SET status = CASE WHEN status IN ('sent','viewed') THEN 'interested' ELSE status END,
           viewed_at = COALESCE(viewed_at, NOW()),
           last_worker_action_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [invite.id]
    );
    const updatedInvite = updatedRows[0] || invite;

    if (invite.status !== "interested" && updatedInvite.status === "interested") {
      await writeStaffingEvent(client, {
        assignmentId: invite.assignment_id,
        campaignId: invite.campaign_id,
        inviteId: invite.id,
        actorId: workerUserId,
        eventType: "invite_interested"
      });
    }

    const message = await writeStaffingMessage(client, {
      assignmentId: invite.assignment_id,
      campaignId: invite.campaign_id,
      inviteId: invite.id,
      workerUserId,
      actorId: workerUserId,
      senderRole: "worker",
      messageType: "question",
      body: normalizedQuestion
    });

    await writeStaffingEvent(client, {
      assignmentId: invite.assignment_id,
      campaignId: invite.campaign_id,
      inviteId: invite.id,
      actorId: workerUserId,
      eventType: "worker_question_asked",
      newValues: { message_id: message?.id || null }
    });
    await refreshCampaignMetrics(client, invite.campaign_id);

    return {
      invite: updatedInvite,
      message,
      dispatcher_user_id: invite.campaign_created_by,
      worker_name: buildWorkerName(invite)
    };
  });

  if (!result?.error && result.dispatcher_user_id) {
    workerNotifications.notifyStaffingQuestionToDispatcher(
      pool,
      result.dispatcher_user_id,
      inviteId,
      result.worker_name,
      normalizedQuestion
    ).catch(() => {});
  }

  return result;
}

export function requestStaffingInviteReminder(pool, {
  inviteId,
  workerUserId,
  remindAfterMinutes = DEFAULT_STAFFING_REMINDER_MINUTES,
  note = null
}) {
  return withTransaction(pool, async (client) => {
    const invite = await loadWorkerInviteActionContext(client, inviteId, workerUserId);
    if (!invite) return { error: "INVITE_NOT_FOUND" };

    const expirationState = await expireInviteForWorkerAction(client, invite, workerUserId);
    if (expirationState.error) return { error: expirationState.error };

    if (!ACTIONABLE_INVITE_STATUSES.has(invite.status)) {
      return { error: "INVITE_NOT_ACTIONABLE", current_status: invite.status };
    }

    const reminderTarget = resolveReminderTarget(invite, remindAfterMinutes);
    if (reminderTarget.error) return { error: reminderTarget.error };

    const normalizedNote = String(note || "").trim() || null;
    const { rows: updatedRows } = await client.query(
      `UPDATE assignment_staffing_invites
       SET status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END,
           viewed_at = COALESCE(viewed_at, NOW()),
           remind_after = $2,
           reminder_requested_at = NOW(),
           last_worker_action_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [invite.id, reminderTarget.remindAfter]
    );
    const updatedInvite = updatedRows[0] || invite;

    const message = await writeStaffingMessage(client, {
      assignmentId: invite.assignment_id,
      campaignId: invite.campaign_id,
      inviteId: invite.id,
      workerUserId,
      actorId: workerUserId,
      senderRole: "worker",
      messageType: "reminder_request",
      body: normalizedNote || `Bitte in ca. ${reminderTarget.reminderMinutes} Minuten erneut erinnern.`,
      meta: {
        remind_after: reminderTarget.remindAfter,
        reminder_minutes: reminderTarget.reminderMinutes
      }
    });

    await writeStaffingEvent(client, {
      assignmentId: invite.assignment_id,
      campaignId: invite.campaign_id,
      inviteId: invite.id,
      actorId: workerUserId,
      eventType: "invite_reminder_requested",
      newValues: {
        message_id: message?.id || null,
        remind_after: reminderTarget.remindAfter,
        reminder_minutes: reminderTarget.reminderMinutes
      }
    });
    await refreshCampaignMetrics(client, invite.campaign_id);

    return {
      invite: updatedInvite,
      remind_after: reminderTarget.remindAfter,
      reminder_minutes: reminderTarget.reminderMinutes
    };
  });
}

function notifyStaffingInviteWorkerAction(pool, normalizedAction, inviteId, result, note = null) {
  if (result?.error || !result?.dispatcher_user_id) return;
  if (normalizedAction === "decline") {
    workerNotifications.notifyStaffingInviteDeclinedToDispatcher(
      pool,
      result.dispatcher_user_id,
      result.invite?.id || inviteId,
      result.worker_name,
      note || null
    ).catch(() => {});
    return;
  }
  if (result.link?.id) {
    workerNotifications.notifyAssignmentConfirmedToDispatcher(
      pool,
      result.dispatcher_user_id,
      result.link.id,
      result.worker_name
    ).catch(() => {});
    return;
  }
  workerNotifications.notifyStaffingInviteAcceptedToDispatcher(
    pool,
    result.dispatcher_user_id,
    result.invite?.id || inviteId,
    result.worker_name
  ).catch(() => {});
}

async function respondToStaffingInviteInternal(client, {
  inviteId,
  workerUserId,
  action,
  note = null,
  allowChoiceSetInvite = false
}) {
  const normalizedAction = action === "decline" ? "decline" : "accept";
  const invite = await loadWorkerInviteActionContext(client, inviteId, workerUserId);
  if (!invite) return { error: "INVITE_NOT_FOUND" };

  const expirationState = await expireInviteForWorkerAction(client, invite, workerUserId);
  if (expirationState.error) return { error: expirationState.error };
  const assignment = expirationState.assignment;

  if (invite.choice_set_id && isActiveStaffingChoiceSetStatus(invite.choice_set_status) && !allowChoiceSetInvite) {
    return {
      error: "INVITE_CONTROLLED_BY_CHOICE_SET",
      choice_set_id: invite.choice_set_id,
      choice_mode: invite.choice_mode
    };
  }
  if (!ACTIONABLE_INVITE_STATUSES.has(invite.status)) {
    return { error: "INVITE_NOT_ACTIONABLE", current_status: invite.status };
  }

  if (normalizedAction === "decline") {
    const { rows: updatedRows } = await client.query(
      `UPDATE assignment_staffing_invites
       SET status = 'declined',
           declined_at = NOW(),
           responded_at = NOW(),
           response_note = $2,
           remind_after = NULL,
           last_worker_action_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [invite.id, note || null]
    );
    const updatedInvite = updatedRows[0];
    await refreshCampaignMetrics(client, invite.campaign_id);
    const updatedAssignment = await recalcAssignmentStaffing(client, assignment.id, { lock: true, writeEvent: false });
    await writeStaffingEvent(client, {
      assignmentId: assignment.id,
      campaignId: invite.campaign_id,
      inviteId: invite.id,
      actorId: workerUserId,
      eventType: "invite_declined",
      newValues: { response_note: note || null }
    });
    await updateWaitlistCandidateState(client, {
      assignmentId: assignment.id,
      workerUserId,
      status: "removed",
      rootCampaignId: invite.source_campaign_id || invite.campaign_id,
      campaignId: invite.campaign_id,
      inviteId: invite.id,
      removalReason: "invite_declined",
      actorId: workerUserId
    });
    return {
      invite: updatedInvite,
      assignment: updatedAssignment,
      dispatcher_user_id: invite.campaign_created_by,
      worker_name: buildWorkerName(invite)
    };
  }

  const staffing = await recalcAssignmentStaffing(client, assignment.id, { lock: true, writeEvent: false });
  if (!staffing || staffing.open_quantity <= 0) {
    return { error: "ASSIGNMENT_FILLED" };
  }

  const conflicts = await getWorkerSchedulingConflicts(
    client,
    workerUserId,
    assignment.start_date,
    assignment.planned_end_date || "9999-12-31"
  );
  if (conflicts.length > 0) {
    return {
      error: "SCHEDULE_CONFLICT",
      conflicts,
      conflicting_link_ids: conflicts
        .filter((entry) => entry.conflict_type === "assignment")
        .map((entry) => entry.id),
      conflicting_reservation_ids: conflicts
        .filter((entry) => entry.conflict_type === "reservation")
        .map((entry) => entry.id)
    };
  }

  const reservationExpiresAt = new Date(Date.now() + (clamp(toInt(invite.reservation_window_minutes, 30), 1, 10080) * 60 * 1000));
  const { rows: reservationRows } = await client.query(
    `INSERT INTO assignment_staffing_reservations
       (assignment_id, campaign_id, invite_id, worker_user_id, org_id, supplier_org_id,
        status, expires_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'reserved',$7,$8)
     RETURNING *`,
    [
      assignment.id,
      invite.campaign_id,
      invite.id,
      workerUserId,
      assignment.org_id,
      assignment.supplier_org_id,
      reservationExpiresAt,
      workerUserId
    ]
  );
  const reservation = reservationRows[0];

  const { rows: updatedInviteRows } = await client.query(
    `UPDATE assignment_staffing_invites
     SET status = 'accepted',
         accepted_at = NOW(),
         responded_at = NOW(),
         response_note = $2,
         remind_after = NULL,
         last_worker_action_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [invite.id, note || null]
  );
  const updatedInvite = updatedInviteRows[0];

  await writeStaffingEvent(client, {
    assignmentId: assignment.id,
    campaignId: invite.campaign_id,
    inviteId: invite.id,
    reservationId: reservation.id,
    actorId: workerUserId,
    eventType: "reservation_created",
    newValues: { expires_at: reservation.expires_at }
  });
  await writeStaffingEvent(client, {
    assignmentId: assignment.id,
    campaignId: invite.campaign_id,
    inviteId: invite.id,
    reservationId: reservation.id,
    actorId: workerUserId,
    eventType: "invite_accepted",
    newValues: { reservation_id: reservation.id }
  });
  await updateWaitlistCandidateState(client, {
    assignmentId: assignment.id,
    workerUserId,
    status: "reserved",
    rootCampaignId: invite.source_campaign_id || invite.campaign_id,
    campaignId: invite.campaign_id,
    inviteId: invite.id,
    reservationId: reservation.id,
    actorId: workerUserId
  });

  await refreshCampaignMetrics(client, invite.campaign_id);
  let promotion = null;
  if (invite.promotion_mode !== "manual_review") {
    promotion = await promoteReservationInternal(client, reservation, {
      actorId: invite.campaign_created_by || workerUserId,
      note: note || "Auto-Finalisierung nach Invite-Annahme"
    });
    if (promotion?.error) return promotion;
  }

  const updatedAssignment = await autoStopIfFilled(client, assignment.id, invite.campaign_created_by || workerUserId);
  return {
    invite: updatedInvite,
    reservation: promotion?.reservation || reservation,
    link: promotion?.link || null,
    assignment: updatedAssignment || staffing,
    dispatcher_user_id: invite.campaign_created_by,
    worker_name: buildWorkerName(invite),
    promotion_mode: invite.promotion_mode
  };
}

export async function respondToStaffingInvite(pool, {
  inviteId,
  workerUserId,
  action,
  note = null
}) {
  const normalizedAction = action === "decline" ? "decline" : "accept";
  const result = await withTransaction(pool, (client) => respondToStaffingInviteInternal(client, {
    inviteId,
    workerUserId,
    action: normalizedAction,
    note,
    allowChoiceSetInvite: false
  }));
  notifyStaffingInviteWorkerAction(pool, normalizedAction, inviteId, result, note);
  return result;
}

export function promoteReservation(pool, reservationId, {
  actorId,
  supplierOrgId = null,
  note = null
}) {
  return withTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `SELECT *
       FROM assignment_staffing_reservations
       WHERE id = $1${supplierOrgId ? " AND supplier_org_id = $2" : ""}
       FOR UPDATE`,
      supplierOrgId ? [reservationId, supplierOrgId] : [reservationId]
    );
    const reservation = rows[0];
    if (!reservation) return { error: "RESERVATION_NOT_FOUND" };
    return promoteReservationInternal(client, reservation, { actorId, note });
  });
}

export function expireStaleStaffingState(pool) {
  return withTransaction(pool, async (client) => {
    const expiredAssignments = new Set();
    const expiredCampaigns = new Set();
    let expiredInvites = 0;
    let expiredReservations = 0;

    const { rows: inviteRows } = await client.query(
      `SELECT id, assignment_id, campaign_id, worker_user_id
       FROM assignment_staffing_invites
       WHERE status IN ('sent','viewed','interested','accepted')
         AND expires_at IS NOT NULL
         AND expires_at <= NOW()
       FOR UPDATE`
    );
    for (const invite of inviteRows) {
      await client.query(
        `UPDATE assignment_staffing_invites
         SET status = 'expired',
             expired_at = NOW(),
             responded_at = COALESCE(responded_at, NOW()),
             updated_at = NOW()
         WHERE id = $1`,
        [invite.id]
      );
      expiredAssignments.add(invite.assignment_id);
      expiredCampaigns.add(invite.campaign_id);
      expiredInvites += 1;
      await writeStaffingEvent(client, {
        assignmentId: invite.assignment_id,
        campaignId: invite.campaign_id,
        inviteId: invite.id,
        eventType: "invite_expired"
      });
      await updateWaitlistCandidateState(client, {
        assignmentId: invite.assignment_id,
        workerUserId: invite.worker_user_id,
        status: "removed",
        rootCampaignId: await getAssignmentWaitlistRootCampaignId(client, invite.assignment_id),
        campaignId: invite.campaign_id,
        inviteId: invite.id,
        removalReason: "invite_expired",
        actorId: null
      });
    }

    const { rows: reservationRows } = await client.query(
      `SELECT id, assignment_id, campaign_id, invite_id, worker_user_id
       FROM assignment_staffing_reservations
       WHERE status = 'reserved'
         AND expires_at IS NOT NULL
         AND expires_at <= NOW()
       FOR UPDATE`
    );
    for (const reservation of reservationRows) {
      await client.query(
        `UPDATE assignment_staffing_reservations
         SET status = 'expired',
             released_at = NOW(),
             release_reason = 'timeout',
             updated_at = NOW()
         WHERE id = $1`,
        [reservation.id]
      );
      if (reservation.invite_id) {
        await client.query(
          `UPDATE assignment_staffing_invites
           SET status = 'expired',
               expired_at = NOW(),
               updated_at = NOW()
           WHERE id = $1
             AND status = 'accepted'`,
          [reservation.invite_id]
        );
      }
      expiredAssignments.add(reservation.assignment_id);
      if (reservation.campaign_id) expiredCampaigns.add(reservation.campaign_id);
      expiredReservations += 1;
      await writeStaffingEvent(client, {
        assignmentId: reservation.assignment_id,
        campaignId: reservation.campaign_id,
        inviteId: reservation.invite_id,
        reservationId: reservation.id,
        eventType: "reservation_expired"
      });
      await updateWaitlistCandidateState(client, {
        assignmentId: reservation.assignment_id,
        workerUserId: reservation.worker_user_id,
        status: "removed",
        rootCampaignId: await getAssignmentWaitlistRootCampaignId(client, reservation.assignment_id),
        campaignId: reservation.campaign_id || null,
        inviteId: reservation.invite_id || null,
        reservationId: reservation.id,
        removalReason: "reservation_expired",
        actorId: null
      });
    }

    for (const campaignId of expiredCampaigns) {
      await refreshCampaignMetrics(client, campaignId);
    }
    for (const assignmentId of expiredAssignments) {
      await recalcAssignmentStaffing(client, assignmentId, { lock: true, writeEvent: false });
    }

    return {
      expired_invites: expiredInvites,
      expired_reservations: expiredReservations
    };
  });
}

export function dispatchDueStaffingReminders(pool, { limit = 50 } = {}) {
  return withTransaction(pool, async (client) => {
    const cappedLimit = clamp(toInt(limit, 50), 1, 200);
    const { rows } = await client.query(
      `SELECT id
       FROM assignment_staffing_invites
       WHERE status IN ('sent','viewed','interested')
         AND remind_after IS NOT NULL
         AND remind_after <= NOW()
       ORDER BY remind_after ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [cappedLimit]
    );

    for (const invite of rows) {
      await queueStaffingInviteDelivery(client, invite.id, { kind: "reminder" });
    }

    return {
      reminders_queued: rows.length
    };
  });
}

export async function runStaffingMaintenance(pool, {
  limit = 25,
  cooldownMinutes = DEFAULT_AUTO_BACKFILL_COOLDOWN_MINUTES
} = {}) {
  const expired = await expireStaleStaffingState(pool);
  const reminders = await dispatchDueStaffingReminders(pool, { limit: Math.max(limit * 2, 25) });
  const backfill = await runAutoBackfill(pool, { limit, cooldownMinutes });

  return {
    ...expired,
    ...reminders,
    ...backfill
  };
}
