/**
 * Worker Notification Service
 * Erzeugt worker-spezifische Benachrichtigungen, die im Einsatzportal angezeigt werden.
 * Alle Notifications sind user-scoped (der jeweilige Arbeitnehmer) und enthalten Deep-Links.
 */

import { logger } from "../config/index.js";

const SEVERITY_MAP = {
  worker_assignment_new:                    "info",
  worker_assignment_changed:                "warning",
  worker_assignment_pending_confirmation:   "warning",
  worker_assignment_confirmed:              "success",
  worker_assignment_declined:               "warning",
  worker_staffing_request_new:              "info",
  worker_staffing_request_reminder:         "info",
  worker_staffing_request_question:         "warning",
  worker_staffing_choice_request:           "info",
  worker_staffing_choice_submitted:         "info",
  worker_staffing_choice_declined:          "warning",
  worker_submission_correction_requested:   "warning",
  worker_submission_accepted:               "success",
  worker_submission_rejected:               "error",
  worker_shift_reminder:                    "info",
  // Worker Lifecycle Completion (073)
  worker_unavailable_reported:              "warning",
  worker_submission_submitted:              "info",
  worker_submission_corrected:              "info",
  worker_submission_sent_to_customer:       "info",
  worker_document_verified:                 "success",
  worker_document_rejected:                 "error",
  worker_document_expiring:                 "warning",
  worker_document_expired:                  "error",
  worker_blocked_by_company:                "warning"
};

/**
 * Erstellt eine Notification für einen Worker.
 * Fehler werden geloggt aber NICHT geworfen (fire-and-forget Semantik).
 */
export async function notifyWorker(pool, {
  workerUserId,
  type,
  title,
  message,
  entityType = null,
  entityId   = null,
  linkPath   = null,
  throwOnError = false
}) {
  const insertWithType = async (effectiveType, effectiveTitle, effectiveMessage) => {
    const severity = SEVERITY_MAP[effectiveType] || "info";
    await pool.query(
      `INSERT INTO notifications
         (user_id, type, title, message, entity_type, entity_id, severity, link_path)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8
       WHERE NOT EXISTS (
         SELECT 1 FROM notifications
         WHERE user_id = $1 AND type = $2 AND entity_type = $5 AND entity_id = $6
           AND created_at > NOW() - INTERVAL '1 hour'
       )`,
      [workerUserId, effectiveType, effectiveTitle, effectiveMessage || null,
       entityType || null, entityId || null, severity, linkPath || null]
    );
  };

  try {
    // Dedupe: skip if identical notification for same user+type+entity exists within 1h
    await insertWithType(type, title, message);
  } catch (err) {
    // Schema drift guard: some environments may still have an outdated notifications_type_check.
    // We degrade gracefully to a generic type instead of dropping the notification entirely.
    if (err?.constraint === "notifications_type_check") {
      try {
        await insertWithType(
          "general",
          title || "Hinweis",
          `[${type}] ${message || ""}`.trim()
        );
        logger.warn(
          { workerUserId, type, fallbackType: "general" },
          "Worker notification type not allowed by DB constraint, used fallback type"
        );
        return;
      } catch (fallbackErr) {
        if (throwOnError) throw fallbackErr;
        logger.error(
          { err: fallbackErr, workerUserId, type, fallbackType: "general" },
          "Worker notification fallback could not be saved"
        );
        return;
      }
    }
    if (throwOnError) throw err;
    // Notification-Fehler blockieren niemals den Haupt-Prozess
    logger.error({ err, workerUserId, type }, "Worker notification could not be saved");
  }
}

/* ── Vorgefertigte Notification-Factories ────────────────────────────────────── */

/** Neuer Einsatz zugewiesen */
export async function notifyAssignmentNew(pool, workerUserId, assignmentLinkId, clientName) {
  await notifyWorker(pool, {
    workerUserId,
    type:        "worker_assignment_new",
    title:       "Neuer Einsatz zugewiesen",
    message:     `Sie wurden einem neuen Einsatz${clientName ? ` bei ${clientName}` : ""} zugewiesen.`,
    entityType:  "worker_assignment_link",
    entityId:    assignmentLinkId,
    linkPath:    `/public/einsatzportal-einsaetze.html`
  });
}

/** Einsatz-Herausnahme: Arbeiter wurde (z. B. wegen Krankheit) durch Ersatz abgelöst (P1.1) */
export async function notifyAssignmentRemoved(pool, workerUserId, assignmentLinkId, { effectiveFrom = null, reason = null } = {}) {
  const dateLabel = effectiveFrom
    ? new Date(effectiveFrom).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
    : null;
  await notifyWorker(pool, {
    workerUserId,
    type:        "worker_assignment_changed",
    title:       "Aus Einsatz herausgenommen",
    message:     `Sie wurden${dateLabel ? ` ab ${dateLabel}` : ""} aus diesem Einsatz herausgenommen; ein Ersatz übernimmt.${reason ? ` Grund: ${String(reason).slice(0, 140)}${String(reason).length > 140 ? "…" : ""}` : ""} Bereits geleistete Tage bleiben abrechenbar.`,
    entityType:  "worker_assignment_link",
    entityId:    assignmentLinkId,
    linkPath:    `/public/einsatzportal-einsaetze.html`
  });
}

/** Stundenzettel-Korrektur angefordert */
export async function notifySubmissionCorrectionRequested(pool, workerUserId, submissionId, correctionNote) {
  await notifyWorker(pool, {
    workerUserId,
    type:        "worker_submission_correction_requested",
    title:       "Korrektur erforderlich",
    message:     correctionNote
      ? `Ihr Stundenzettel muss korrigiert werden: ${correctionNote.slice(0, 120)}${correctionNote.length > 120 ? "…" : ""}`
      : "Ihr Stundenzettel wurde zur Korrektur zurückgesendet.",
    entityType:  "worker_time_submission",
    entityId:    submissionId,
    linkPath:    `/public/einsatzportal-stundenzettel.html?id=${submissionId}`
  });
}

export async function notifyWorkerDocumentVerified(pool, workerUserId, documentId, title) {
  await notifyWorker(pool, {
    workerUserId,
    type:        "worker_document_verified",
    title:       "Nachweis verifiziert ✓",
    message:     `${title || "Ihr Nachweis"} wurde geprüft und freigegeben.`,
    entityType:  "worker_profile_document",
    entityId:    documentId,
    linkPath:    "/public/einsatzportal-profil.html#documents"
  });
}

export async function notifyWorkerDocumentRejected(pool, workerUserId, documentId, title, reason) {
  await notifyWorker(pool, {
    workerUserId,
    type:        "worker_document_rejected",
    title:       "Nachweis abgelehnt",
    message:     reason
      ? `${title || "Ihr Nachweis"} wurde abgelehnt: ${String(reason).slice(0, 160)}${String(reason).length > 160 ? "…" : ""}`
      : `${title || "Ihr Nachweis"} wurde abgelehnt. Bitte laden Sie eine korrigierte Version hoch.`,
    entityType:  "worker_profile_document",
    entityId:    documentId,
    linkPath:    "/public/einsatzportal-profil.html#documents"
  });
}

export async function notifyWorkerDocumentExpiring(pool, workerUserId, documentId, title, validUntil, daysLeft) {
  const dueLabel = validUntil
    ? new Date(validUntil).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
    : null;
  await notifyWorker(pool, {
    workerUserId,
    type:        "worker_document_expiring",
    title:       "Nachweis läuft bald ab",
    message:     `${title || "Ein Nachweis"} läuft${daysLeft != null && daysLeft >= 0 ? ` in ${daysLeft} Tagen` : " bald"}${dueLabel ? ` am ${dueLabel}` : ""} ab. Bitte laden Sie rechtzeitig eine aktuelle Version hoch.`,
    entityType:  "worker_profile_document",
    entityId:    documentId,
    linkPath:    "/public/einsatzportal-profil.html#documents"
  });
}

export async function notifyWorkerDocumentExpired(pool, workerUserId, documentId, title, validUntil) {
  const dueLabel = validUntil
    ? new Date(validUntil).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
    : null;
  await notifyWorker(pool, {
    workerUserId,
    type:        "worker_document_expired",
    title:       "Nachweis abgelaufen",
    message:     `${title || "Ein Nachweis"} ist${dueLabel ? ` seit ${dueLabel}` : ""} abgelaufen. Bitte laden Sie umgehend einen gültigen Ersatz hoch.`,
    entityType:  "worker_profile_document",
    entityId:    documentId,
    linkPath:    "/public/einsatzportal-profil.html#documents"
  });
}

/** Stundenzettel angenommen / ins Timesheet übertragen */
export async function notifySubmissionAccepted(pool, workerUserId, submissionId, weekLabel) {
  await notifyWorker(pool, {
    workerUserId,
    type:        "worker_submission_accepted",
    title:       "Stundenzettel angenommen ✓",
    message:     `Ihr Stundenzettel${weekLabel ? ` für ${weekLabel}` : ""} wurde geprüft und ins Timesheet übernommen.`,
    entityType:  "worker_time_submission",
    entityId:    submissionId,
    linkPath:    `/public/einsatzportal-stundenzettel.html?id=${submissionId}`
  });
}

/** Neuer Einsatz: Worker muss bestätigen */
export async function notifyAssignmentPendingConfirmation(pool, workerUserId, assignmentLinkId, clientName) {
  await notifyWorker(pool, {
    workerUserId,
    type:        "worker_assignment_pending_confirmation",
    title:       "Neuer Einsatz — Bestätigung erforderlich",
    message:     `Sie wurden einem Einsatz${clientName ? ` bei ${clientName}` : ""} zugewiesen. Bitte bestätigen oder ablehnen.`,
    entityType:  "worker_assignment_link",
    entityId:    assignmentLinkId,
    linkPath:    `/public/einsatzportal-benachrichtigungen.html`
  });
}

export async function notifyStaffingRequestNew(pool, workerUserId, inviteId, context = {}, options = {}) {
  const clientName = context?.clientName ? ` bei ${context.clientName}` : "";
  const title = context?.title || "Neue Einsatzanfrage";
  const openQuantity = Number.isFinite(Number(context?.openQuantity))
    ? ` Noch offen: ${Number(context.openQuantity)}.`
    : "";
  const deadlineLabel = context?.deadlineLabel ? ` Antwort bis ${context.deadlineLabel}.` : "";

  await notifyWorker(pool, {
    workerUserId,
    type:        "worker_staffing_request_new",
    title:       "Neue Staffing-Anfrage",
    message:     `${title}${clientName}. Bitte prüfen und annehmen oder ablehnen.${openQuantity}${deadlineLabel}`,
    entityType:  "assignment_staffing_invite",
    entityId:    inviteId,
    linkPath:    `/public/einsatzportal-benachrichtigungen.html`,
    throwOnError: !!options.throwOnError
  });
}

export async function notifyStaffingChoiceRequest(pool, workerUserId, choiceSetId, context = {}, options = {}) {
  const title = context?.title || "Neue Einsatzauswahl";
  const optionCount = Number.isFinite(Number(context?.optionCount))
    ? ` ${Number(context.optionCount)} Optionen stehen zur Auswahl.`
    : "";
  const deadlineLabel = context?.deadlineLabel ? ` Bitte bis ${context.deadlineLabel} reagieren.` : "";
  const modeLabel = context?.modeLabel ? ` Modus: ${context.modeLabel}.` : "";

  await notifyWorker(pool, {
    workerUserId,
    type:        "worker_staffing_choice_request",
    title:       "Neue Einsatzauswahl",
    message:     `${title}.${optionCount}${modeLabel}${deadlineLabel}`.trim(),
    entityType:  "assignment_staffing_choice_set",
    entityId:    choiceSetId,
    linkPath:    `/public/einsatzportal-benachrichtigungen.html`,
    throwOnError: !!options.throwOnError
  });
}

export async function notifyStaffingChoiceSubmittedToDispatcher(pool, dispatcherUserId, choiceSetId, workerName, summary) {
  await notifyWorker(pool, {
    workerUserId: dispatcherUserId,
    type:         "worker_staffing_choice_submitted",
    title:        "Worker-Präferenz eingegangen",
    message:      `${workerName || "Ein Mitarbeiter"} hat eine Einsatzauswahl abgegeben.${summary ? " " + summary.slice(0, 220) : ""}`,
    entityType:   "assignment_staffing_choice_set",
    entityId:     choiceSetId,
    linkPath:     `/public/worker-submissions-review.html`
  });
}

export async function notifyStaffingChoiceDeclinedToDispatcher(pool, dispatcherUserId, choiceSetId, workerName, note) {
  await notifyWorker(pool, {
    workerUserId: dispatcherUserId,
    type:         "worker_staffing_choice_declined",
    title:        "Einsatzauswahl abgelehnt",
    message:      `${workerName || "Ein Mitarbeiter"} hat alle angebotenen Einsatzoptionen abgelehnt.${note ? " Grund: " + String(note).slice(0, 160) : ""}`,
    entityType:   "assignment_staffing_choice_set",
    entityId:     choiceSetId,
    linkPath:     `/public/worker-submissions-review.html`
  });
}

export async function notifyStaffingRequestReminder(pool, workerUserId, inviteId, context = {}, options = {}) {
  const title = context?.title || "Erinnerung zur Staffing-Anfrage";
  const deadlineLabel = context?.deadlineLabel ? ` Antwort bis ${context.deadlineLabel}.` : "";

  await notifyWorker(pool, {
    workerUserId,
    type:        "worker_staffing_request_reminder",
    title:       "Erinnerung: Staffing-Anfrage offen",
    message:     `${title}. Ihre Entscheidung steht noch aus.${deadlineLabel}`,
    entityType:  "assignment_staffing_invite",
    entityId:    inviteId,
    linkPath:    `/public/einsatzportal-benachrichtigungen.html`,
    throwOnError: !!options.throwOnError
  });
}

/** Disponent-Notification: Worker hat Einsatz bestätigt */
export async function notifyAssignmentConfirmedToDispatcher(pool, dispatcherUserId, assignmentLinkId, workerName) {
  await notifyWorker(pool, {
    workerUserId: dispatcherUserId,
    type:         "worker_assignment_confirmed",
    title:        "Einsatz bestätigt ✓",
    message:      `${workerName || "Ein Mitarbeiter"} hat den zugewiesenen Einsatz bestätigt.`,
    entityType:   "worker_assignment_link",
    entityId:     assignmentLinkId,
    linkPath:     `/public/worker-submissions-review.html`
  });
}

export async function notifyStaffingInviteAcceptedToDispatcher(pool, dispatcherUserId, inviteId, workerName) {
  await notifyWorker(pool, {
    workerUserId: dispatcherUserId,
    type:         "worker_assignment_confirmed",
    title:        "Staffing-Anfrage angenommen ✓",
    message:      `${workerName || "Ein Mitarbeiter"} hat eine Staffing-Anfrage angenommen.`,
    entityType:   "assignment_staffing_invite",
    entityId:     inviteId,
    linkPath:     `/public/worker-submissions-review.html`
  });
}

export async function notifyStaffingInviteDeclinedToDispatcher(pool, dispatcherUserId, inviteId, workerName, reason) {
  await notifyWorker(pool, {
    workerUserId: dispatcherUserId,
    type:         "worker_assignment_declined",
    title:        "Staffing-Anfrage abgelehnt",
    message:      `${workerName || "Ein Mitarbeiter"} hat eine Staffing-Anfrage abgelehnt.${reason ? " Grund: " + reason.slice(0, 120) : ""}`,
    entityType:   "assignment_staffing_invite",
    entityId:     inviteId,
    linkPath:     `/public/worker-submissions-review.html`
  });
}

export async function notifyStaffingQuestionToDispatcher(pool, dispatcherUserId, inviteId, workerName, question) {
  await notifyWorker(pool, {
    workerUserId: dispatcherUserId,
    type:         "worker_staffing_request_question",
    title:        "Rückfrage zu Staffing-Anfrage",
    message:      `${workerName || "Ein Mitarbeiter"} hat eine Rückfrage gestellt.${question ? " Frage: " + question.slice(0, 180) : ""}`,
    entityType:   "assignment_staffing_invite",
    entityId:     inviteId,
    linkPath:     `/public/worker-submissions-review.html`
  });
}

/** Disponent-Notification: Worker hat Einsatz abgelehnt */
export async function notifyAssignmentDeclinedToDispatcher(pool, dispatcherUserId, assignmentLinkId, workerName, reason) {
  await notifyWorker(pool, {
    workerUserId: dispatcherUserId,
    type:         "worker_assignment_declined",
    title:        "Einsatz abgelehnt",
    message:      `${workerName || "Ein Mitarbeiter"} hat den Einsatz abgelehnt.${reason ? " Grund: " + reason.slice(0, 120) : ""}`,
    entityType:   "worker_assignment_link",
    entityId:     assignmentLinkId,
    linkPath:     `/public/worker-submissions-review.html`
  });
}

/** Worker hat Abwesenheit gemeldet → Dispatcher informieren */
export async function notifyUnavailableReported(pool, dispatcherUserId, assignmentLinkId, workerName, unavailableFrom) {
  const fromLabel = unavailableFrom ? new Date(unavailableFrom).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "sofort";
  await notifyWorker(pool, {
    workerUserId: dispatcherUserId,
    type:         "worker_unavailable_reported",
    title:        "Abwesenheit gemeldet",
    message:      `${workerName || "Ein Mitarbeiter"} hat sich ab ${fromLabel} als nicht verf\u00fcgbar gemeldet. Bitte pr\u00fcfen Sie die Einsatzplanung.`,
    entityType:   "worker_assignment_link",
    entityId:     assignmentLinkId,
    linkPath:     "/public/worker-submissions-review.html"
  });
}

/** Beschwerde-Meldung eines Unternehmens → Disponent informieren (P3.2) */
export async function notifyComplaintToDispatcher(pool, dispatcherUserId, complaintId, workerName, { severity = "medium", reason = null } = {}) {
  if (!dispatcherUserId) return;
  const sev = severity === "high" ? "Hohe Priorität" : (severity === "low" ? "Niedrige Priorität" : "Mittlere Priorität");
  await notifyWorker(pool, {
    workerUserId: dispatcherUserId,
    type:         "worker_complaint_filed",
    title:        "Beschwerde vom Unternehmen",
    message:      `${workerName || "Eine Kraft"}: Das einsetzende Unternehmen hat ein Problem gemeldet (${sev}).${reason ? " Grund: " + String(reason).slice(0, 140) : ""} Ggf. Ersatz stellen.`,
    entityType:   "worker_complaint",
    entityId:     complaintId,
    linkPath:     "/public/worker-submissions-review.html"
  });
}

/**
 * Ein Einsatzunternehmen hat eine Kraft fuer kuenftige Einsaetze gesperrt (P3.3).
 *
 * Warum das eine Benachrichtigung braucht: bisher stand die Sperre nur als Hinweis im
 * Zuweisungs-Drawer — die Agentur erfuhr davon erst, wenn sie zufaellig hinsah, im
 * schlechtesten Fall beim Versuch, genau diese Kraft erneut dorthin zu schicken.
 *
 * Empfaenger sind alle, die in der Agentur disponieren duerfen (Rechte-Matrix statt
 * hartkodierter Rollen) — der Aufrufer ermittelt sie und uebergibt die Liste.
 */
export async function notifyWorkerBlockedToAgency(pool, recipientUserIds, blockId, workerName, {
  companyName = null, blockedUntil = null, reason = null
} = {}) {
  const ids = Array.isArray(recipientUserIds) ? recipientUserIds.filter(Boolean) : [];
  if (!ids.length) return { notified: 0 };

  const bis = blockedUntil ? `bis ${String(blockedUntil).slice(0, 10)}` : "unbefristet";
  const wer = companyName || "Ein Einsatzunternehmen";
  const grund = reason ? ` Grund: ${String(reason).slice(0, 140)}` : "";

  for (const userId of ids) {
    await notifyWorker(pool, {
      workerUserId: userId,
      type:         "worker_blocked_by_company",
      title:        "Kraft vom Kunden gesperrt",
      message:      `${wer} hat ${workerName || "eine Kraft"} für künftige Einsätze gesperrt (${bis}).${grund} Bei der Disposition berücksichtigen.`,
      entityType:   "company_worker_blocklist",
      entityId:     blockId,
      linkPath:     "/public/worker-submissions-review.html"
    });
  }
  return { notified: ids.length };
}

/** Worker hat Stundenzettel eingereicht → Reviewer/Dispatcher informieren */
export async function notifySubmissionSubmitted(pool, reviewerUserId, submissionId, workerName, weekLabel) {
  await notifyWorker(pool, {
    workerUserId: reviewerUserId,
    type:         "worker_submission_submitted",
    title:        "Neuer Stundenzettel eingereicht",
    message:      `${workerName || "Ein Mitarbeiter"} hat den Stundenzettel${weekLabel ? " f\u00fcr " + weekLabel : ""} eingereicht. Bitte pr\u00fcfen.`,
    entityType:   "worker_time_submission",
    entityId:     submissionId,
    linkPath:     "/public/worker-submissions-review.html"
  });
}

/** Worker hat korrigierten Stundenzettel eingereicht → Reviewer informieren */
export async function notifySubmissionCorrected(pool, reviewerUserId, submissionId, workerName) {
  await notifyWorker(pool, {
    workerUserId: reviewerUserId,
    type:         "worker_submission_corrected",
    title:        "Korrigierter Stundenzettel eingereicht",
    message:      `${workerName || "Ein Mitarbeiter"} hat den korrigierten Stundenzettel eingereicht. Bitte erneut pr\u00fcfen.`,
    entityType:   "worker_time_submission",
    entityId:     submissionId,
    linkPath:     "/public/worker-submissions-review.html"
  });
}

/** Stundenzettel an Kunden gesendet → internen Reviewer informieren */
export async function notifySubmissionSentToCustomer(pool, reviewerUserId, submissionId, customerName) {
  await notifyWorker(pool, {
    workerUserId: reviewerUserId,
    type:         "worker_submission_sent_to_customer",
    title:        "Stundenzettel an Kunden gesendet",
    message:      `Der Stundenzettel wurde${customerName ? " an " + customerName : ""} zur Kundenfreigabe versendet.`,
    entityType:   "worker_time_submission",
    entityId:     submissionId,
    linkPath:     "/public/worker-submissions-review.html"
  });
}

/** Stundenzettel abgelehnt */
export async function notifySubmissionRejected(pool, workerUserId, submissionId, reason) {
  await notifyWorker(pool, {
    workerUserId,
    type:        "worker_submission_rejected",
    title:       "Stundenzettel abgelehnt",
    message:     reason
      ? `Ihr Stundenzettel wurde abgelehnt: ${reason.slice(0, 120)}${reason.length > 120 ? "…" : ""}`
      : "Ihr Stundenzettel wurde abgelehnt. Bitte kontaktieren Sie Ihren Disponenten.",
    entityType:  "worker_time_submission",
    entityId:    submissionId,
    linkPath:    `/public/einsatzportal-stundenzettel.html?id=${submissionId}`
  });
}
