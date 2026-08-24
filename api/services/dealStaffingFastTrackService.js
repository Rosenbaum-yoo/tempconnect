import { checkOverride } from "./featureOverrideService.js";
import { dispatch } from "./notificationMatrix.js";
import { hasPermission, listOrgMembers } from "./rbacService.js";
import * as assignmentStaffingService from "./assignmentStaffingService.js";
import * as workerService from "./workerService.js";

export const STAFFING_READY_FAST_TRACK_FEATURE_KEY = "staffing_ready_fast_track";

export async function isStaffingFastTrackEnabled(pool, orgId) {
  try {
    const override = await checkOverride(pool, STAFFING_READY_FAST_TRACK_FEATURE_KEY, orgId || null);
    if (override?.overridden) return override.enabled === true;
  } catch {
    // non-critical: additive fast-track stays available unless explicitly disabled
  }
  return true;
}

export async function resolveStaffingReadyRecipientUserIds(pool, supplierOrgId, { fallbackUserId = null } = {}) {
  if (!supplierOrgId) {
    return fallbackUserId ? [fallbackUserId] : [];
  }

  let recipients = [];
  try {
    const members = await listOrgMembers(pool, supplierOrgId);
    recipients = members
      .filter((member) => hasPermission(member.role_key, "worker.edit"))
      .map((member) => member.user_id)
      .filter(Boolean);
  } catch {
    recipients = [];
  }

  const deduped = [...new Set(recipients)];
  if (deduped.length > 0) return deduped;
  return fallbackUserId ? [fallbackUserId] : [];
}

export function buildStaffingReadyLink({ assignmentId, offerId } = {}) {
  const params = new URLSearchParams();
  if (assignmentId) params.set("assignment_id", assignmentId);
  if (offerId) params.set("offer_id", offerId);
  params.set("mode", "staffing_ready");
  const query = params.toString();
  return `/public/worker-submissions-review.html${query ? `?${query}` : ""}#asgn`;
}

function toPositiveInt(value, fallback = null) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return Math.max(0, Math.trunc(parsed));
  return fallback;
}

function buildStaffingReadyMessage({ roleLabel, clientName, openQuantity, requestedQuantity }) {
  const role = String(roleLabel || "Einsatz").trim();
  const client = String(clientName || "").trim();
  const open = toPositiveInt(openQuantity);
  const requested = toPositiveInt(requestedQuantity);
  const quantityText = open != null
    ? (requested != null ? `${open} offen von ${requested}` : `${open} offen`)
    : "";
  const clientText = client ? ` bei ${client}` : "";
  return `Staffing bereit${clientText} – ${role}${quantityText ? ` · ${quantityText}` : ""}. Sichere Direktzuweisung oder manuelle Besetzung jetzt starten.`;
}

export async function dispatchStaffingReadyNotification(pool, {
  assignmentId,
  offerId,
  supplierOrgId,
  fallbackUserId = null,
  requestedQuantity = null,
  openQuantity = null,
  clientName = null,
  roleLabel = null
} = {}) {
  if (!assignmentId || !supplierOrgId) {
    return { sent: 0, recipient_user_ids: [], link_path: null };
  }

  const enabled = await isStaffingFastTrackEnabled(pool, supplierOrgId);
  if (!enabled) {
    return { sent: 0, recipient_user_ids: [], link_path: null };
  }

  const recipientUserIds = await resolveStaffingReadyRecipientUserIds(pool, supplierOrgId, {
    fallbackUserId
  });
  if (!recipientUserIds.length) {
    return { sent: 0, recipient_user_ids: [], link_path: null };
  }

  const linkPath = buildStaffingReadyLink({ assignmentId, offerId });
  const result = await dispatch(pool, "deal.staffing_ready", {
    recipientUserIds,
    entityType: "assignment",
    entityId: assignmentId,
    message: buildStaffingReadyMessage({
      roleLabel,
      clientName,
      openQuantity,
      requestedQuantity
    }),
    linkPath
  });

  return {
    ...result,
    recipient_user_ids: recipientUserIds,
    link_path: linkPath
  };
}

function mapQuickAssignFailure(errorCode) {
  switch (errorCode) {
    case "ASSIGNMENT_FILLED":
      return {
        status: "skipped_assignment_filled",
        reason_code: "assignment_filled",
        reason_label: "Der Einsatz ist bereits vollständig besetzt."
      };
    case "ALREADY_ASSIGNED":
    case "WORKER_ALREADY_LINKED":
      return {
        status: "skipped_already_linked",
        reason_code: "already_linked",
        reason_label: "Der Worker ist diesem Einsatz bereits zugeordnet."
      };
    case "SCHEDULE_CONFLICT":
      return {
        status: "failed_conflict",
        reason_code: "schedule_conflict",
        reason_label: "Terminüberschneidung mit einem bestehenden Einsatz oder einer Reservierung."
      };
    case "WORKER_NOT_FOUND":
      return {
        status: "failed_worker_not_found",
        reason_code: "worker_not_found",
        reason_label: "Der Worker konnte nicht gefunden werden."
      };
    case "WORKER_INACTIVE":
      return {
        status: "failed_worker_inactive",
        reason_code: "worker_inactive",
        reason_label: "Der Worker ist aktuell inaktiv."
      };
    case "ASSIGNMENT_NOT_ASSIGNABLE":
      return {
        status: "failed_assignment_not_assignable",
        reason_code: "assignment_not_assignable",
        reason_label: "Der Einsatz ist aktuell nicht zuweisbar."
      };
    default:
      return {
        status: "failed_unknown",
        reason_code: String(errorCode || "unknown_error").toLowerCase(),
        reason_label: "Die Direktzuweisung konnte nicht abgeschlossen werden."
      };
  }
}

function buildWorkerResultContext(suggestion) {
  return {
    first_name: suggestion?.first_name || null,
    last_name: suggestion?.last_name || null,
    personnel_number: suggestion?.personnel_number || null
  };
}

export async function quickAssignSuggestedWorkers(pool, {
  assignmentId,
  supplierOrgId,
  actorId,
  workerUserIds,
  clientName = null,
  notes = null
} = {}) {
  const selectedWorkerIds = [...new Set((Array.isArray(workerUserIds) ? workerUserIds : []).filter(Boolean))];
  if (selectedWorkerIds.length === 0) {
    return { error: "NO_WORKERS_SELECTED" };
  }

  const overview = await assignmentStaffingService.getAssignmentStaffingOverview(pool, assignmentId, supplierOrgId);
  const assignment = overview?.assignment || null;
  if (!assignment) {
    return { error: "ASSIGNMENT_NOT_FOUND" };
  }
  if (!["planned", "active", "extended"].includes(assignment.status)) {
    return { error: "ASSIGNMENT_NOT_ASSIGNABLE", status: assignment.status };
  }

  const openQuantityBefore = toPositiveInt(assignment.open_quantity, 0);
  if (openQuantityBefore <= 0) {
    return { error: "ASSIGNMENT_FILLED" };
  }

  const suggestionBundle = await assignmentStaffingService.listAssignmentSuggestions(pool, assignmentId, supplierOrgId, {
    limit: Math.max(selectedWorkerIds.length * 6, 60),
    onlyAvailable: false,
    hardOnly: false,
    includeBlocked: true
  });
  if (!suggestionBundle?.assignment) {
    return { error: "ASSIGNMENT_NOT_FOUND" };
  }

  const suggestionMap = new Map(
    (suggestionBundle.suggestions || []).map((suggestion) => [suggestion.worker_user_id, suggestion])
  );

  const results = [];
  const assignedLinks = [];
  let latestAssignment = suggestionBundle.assignment || assignment;

  for (const workerUserId of selectedWorkerIds) {
    const liveOpenQuantity = toPositiveInt(latestAssignment?.open_quantity, 0);
    if (liveOpenQuantity <= 0) {
      results.push({
        worker_user_id: workerUserId,
        status: "skipped_assignment_filled",
        reason_code: "assignment_filled",
        reason_label: "Der Einsatz ist bereits vollständig besetzt."
      });
      continue;
    }

    const suggestion = suggestionMap.get(workerUserId) || null;
    const quickAssignState = assignmentStaffingService.getSuggestionQuickAssignState(suggestion);
    if (!quickAssignState.quick_assign_eligible) {
      results.push({
        worker_user_id: workerUserId,
        status: "skipped_not_safe",
        reason_code: quickAssignState.quick_assign_blockers[0]?.code || "not_safe",
        reason_label: quickAssignState.quick_assign_blockers[0]?.label || "Nicht für Direktzuweisung geeignet.",
        quick_assign_blockers: quickAssignState.quick_assign_blockers,
        ...buildWorkerResultContext(suggestion)
      });
      continue;
    }

    const result = await workerService.assignDealToWorker(pool, {
      assignmentId,
      workerUserId,
      supplierOrgId,
      clientName,
      notes,
      createdBy: actorId
    });

    if (result?.error) {
      const failure = mapQuickAssignFailure(result.error);
      results.push({
        worker_user_id: workerUserId,
        ...failure,
        quick_assign_blockers: quickAssignState.quick_assign_blockers,
        ...buildWorkerResultContext(suggestion)
      });
      if (result.error === "ASSIGNMENT_FILLED") {
        latestAssignment = { ...latestAssignment, open_quantity: 0 };
      }
      continue;
    }

    latestAssignment = result.assignment || latestAssignment;
    assignedLinks.push({
      worker_user_id: workerUserId,
      link_id: result.link?.id || null,
      /* Die Frist muss mit nach oben: der Aufrufer schreibt sie in den
       * Erst-Text der Benachrichtigung (Migration 195). Ohne sie hier gaebe es
       * fuer die Schnellbesetzung eine Frist, die niemand mitgeteilt bekommt. */
      frist_bis: result.link?.frist_bis || null
    });
    results.push({
      worker_user_id: workerUserId,
      status: "assigned",
      link_id: result.link?.id || null,
      worker_confirmation_status: result.link?.worker_confirmation_status || null,
      open_quantity_after: toPositiveInt(latestAssignment?.open_quantity, 0),
      ...buildWorkerResultContext(suggestion)
    });
  }

  const refreshedOverview = await assignmentStaffingService.getAssignmentStaffingOverview(pool, assignmentId, supplierOrgId);
  const finalAssignment = refreshedOverview?.assignment || latestAssignment;
  const assignedCount = results.filter((entry) => entry.status === "assigned").length;

  return {
    assignment: finalAssignment,
    summary: {
      requested_count: selectedWorkerIds.length,
      assigned_count: assignedCount,
      skipped_count: results.length - assignedCount,
      open_quantity_before: openQuantityBefore,
      open_quantity_after: toPositiveInt(finalAssignment?.open_quantity, 0)
    },
    assigned_links: assignedLinks,
    results
  };
}
