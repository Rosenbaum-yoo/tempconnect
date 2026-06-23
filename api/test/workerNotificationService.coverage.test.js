import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/workerNotificationService.js";

/* ──────────────────────────────────────────────────────────────────────────
 * Tracking pool: records every {sql, params} and returns a configurable result.
 * The whole call graph of this service funnels through exactly one
 * pool.query() per public call (the dedupe INSERT inside notifyWorker).
 * ────────────────────────────────────────────────────────────────────────── */
function trackingPool({ fail = null } = {}) {
  const calls = [];
  const queryFn = async (sql, params) => {
    calls.push({ sql, params });
    if (fail) throw fail;
    return { rows: [], rowCount: 1 };
  };
  return {
    calls,
    query: queryFn,
    connect: async () => ({ query: queryFn, release: () => {} })
  };
}

/** Build an Error that mimics the Postgres notifications_type_check violation. */
function typeCheckError() {
  const e = new Error('new row for relation "notifications" violates check constraint "notifications_type_check"');
  e.constraint = "notifications_type_check";
  return e;
}

/** Param index reference (INSERT ... SELECT $1..$8). */
const P = {
  userId: 0, type: 1, title: 2, message: 3,
  entityType: 4, entityId: 5, severity: 6, linkPath: 7
};

function last(pool) {
  return pool.calls[pool.calls.length - 1];
}

/* ──────────────────────────────────────────────────────────────────────────
 * Core: notifyWorker
 * ────────────────────────────────────────────────────────────────────────── */
describe("notifyWorker (core)", () => {
  it("inserts with mapped severity and full param shape (happy path)", async () => {
    const pool = trackingPool();
    await svc.notifyWorker(pool, {
      workerUserId: "u-1",
      type: "worker_submission_accepted", // → success in SEVERITY_MAP
      title: "T",
      message: "M",
      entityType: "worker_time_submission",
      entityId: "e-9",
      linkPath: "/x"
    });
    assert.equal(pool.calls.length, 1);
    const c = last(pool);
    assert.match(c.sql, /INSERT INTO notifications/);
    assert.match(c.sql, /WHERE NOT EXISTS/); // dedupe guard present
    assert.match(c.sql, /INTERVAL '1 hour'/);
    assert.equal(c.params[P.userId], "u-1");
    assert.equal(c.params[P.type], "worker_submission_accepted");
    assert.equal(c.params[P.title], "T");
    assert.equal(c.params[P.message], "M");
    assert.equal(c.params[P.entityType], "worker_time_submission");
    assert.equal(c.params[P.entityId], "e-9");
    assert.equal(c.params[P.severity], "success");
    assert.equal(c.params[P.linkPath], "/x");
    assert.equal(c.params.length, 8);
  });

  it("defaults severity to 'info' for unknown type", async () => {
    const pool = trackingPool();
    await svc.notifyWorker(pool, { workerUserId: "u", type: "totally_unknown_type", title: "T", message: "M" });
    assert.equal(last(pool).params[P.severity], "info");
  });

  it("maps error-severity types correctly", async () => {
    const pool = trackingPool();
    await svc.notifyWorker(pool, { workerUserId: "u", type: "worker_submission_rejected", title: "T", message: "M" });
    assert.equal(last(pool).params[P.severity], "error");
  });

  it("coerces empty/undefined optional fields to null", async () => {
    const pool = trackingPool();
    await svc.notifyWorker(pool, { workerUserId: "u", type: "worker_shift_reminder", title: "T" });
    const c = last(pool);
    assert.equal(c.params[P.message], null);
    assert.equal(c.params[P.entityType], null);
    assert.equal(c.params[P.entityId], null);
    assert.equal(c.params[P.linkPath], null);
  });

  it("swallows generic DB errors when throwOnError is falsy (fire-and-forget)", async () => {
    const pool = trackingPool({ fail: new Error("connection lost") });
    // Must NOT throw.
    await svc.notifyWorker(pool, { workerUserId: "u", type: "worker_shift_reminder", title: "T", message: "M" });
    assert.equal(pool.calls.length, 1);
  });

  it("rethrows generic DB errors when throwOnError is true", async () => {
    const pool = trackingPool({ fail: new Error("boom") });
    await assert.rejects(
      () => svc.notifyWorker(pool, { workerUserId: "u", type: "worker_shift_reminder", title: "T", throwOnError: true }),
      /boom/
    );
  });

  it("falls back to 'general' type on notifications_type_check violation", async () => {
    // First insert throws the constraint error; fallback insert succeeds.
    let n = 0;
    const calls = [];
    const queryFn = async (sql, params) => {
      calls.push({ sql, params });
      n += 1;
      if (n === 1) throw typeCheckError();
      return { rows: [], rowCount: 1 };
    };
    const pool = { calls, query: queryFn, connect: async () => ({ query: queryFn, release: () => {} }) };

    await svc.notifyWorker(pool, {
      workerUserId: "u-7",
      type: "worker_assignment_new",
      title: "Orig title",
      message: "Body",
      entityType: "worker_assignment_link",
      entityId: "e-1"
    });

    assert.equal(calls.length, 2, "should attempt original then fallback insert");
    const fb = calls[1];
    assert.equal(fb.params[P.type], "general");
    assert.equal(fb.params[P.title], "Orig title");
    // message becomes "[<origType>] <origMessage>"
    assert.equal(fb.params[P.message], "[worker_assignment_new] Body");
    // severity for "general" is unknown → info
    assert.equal(fb.params[P.severity], "info");
  });

  it("fallback uses default title 'Hinweis' when original title missing", async () => {
    let n = 0;
    const calls = [];
    const queryFn = async (sql, params) => {
      calls.push({ sql, params });
      n += 1;
      if (n === 1) throw typeCheckError();
      return { rows: [], rowCount: 1 };
    };
    const pool = { calls, query: queryFn, connect: async () => ({ query: queryFn, release: () => {} }) };

    await svc.notifyWorker(pool, { workerUserId: "u", type: "weird_type", title: "", message: "" });
    assert.equal(calls[1].params[P.title], "Hinweis");
    assert.equal(calls[1].params[P.message], "[weird_type]"); // trimmed
  });

  it("swallows fallback failure when throwOnError falsy", async () => {
    const err = typeCheckError();
    const pool = trackingPool({ fail: err }); // both original and fallback throw
    await svc.notifyWorker(pool, { workerUserId: "u", type: "x", title: "T", message: "M" });
    // original + fallback = 2 attempts, no throw
    assert.equal(pool.calls.length, 2);
  });

  it("rethrows fallback failure when throwOnError true", async () => {
    const err = typeCheckError();
    const pool = trackingPool({ fail: err });
    await assert.rejects(
      () => svc.notifyWorker(pool, { workerUserId: "u", type: "x", title: "T", throwOnError: true }),
      /notifications_type_check/
    );
    assert.equal(pool.calls.length, 2);
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * Factory wrappers — verify type, entityType, linkPath, message composition.
 * ────────────────────────────────────────────────────────────────────────── */
describe("notification factories", () => {
  let pool;
  beforeEach(() => { pool = trackingPool(); });

  it("notifyAssignmentNew includes client name in message", async () => {
    await svc.notifyAssignmentNew(pool, "u", "link-1", "ACME GmbH");
    const c = last(pool);
    assert.equal(c.params[P.type], "worker_assignment_new");
    assert.equal(c.params[P.entityType], "worker_assignment_link");
    assert.equal(c.params[P.entityId], "link-1");
    assert.equal(c.params[P.linkPath], "/public/einsatzportal-einsaetze.html");
    assert.match(c.params[P.message], /bei ACME GmbH/);
    assert.equal(c.params[P.severity], "info");
  });

  it("notifyAssignmentNew omits client clause when name missing", async () => {
    await svc.notifyAssignmentNew(pool, "u", "link-1", null);
    assert.doesNotMatch(last(pool).params[P.message], /bei /);
  });

  it("notifySubmissionCorrectionRequested truncates long correction note with ellipsis", async () => {
    const longNote = "x".repeat(200);
    await svc.notifySubmissionCorrectionRequested(pool, "u", "sub-3", longNote);
    const c = last(pool);
    assert.equal(c.params[P.type], "worker_submission_correction_requested");
    assert.equal(c.params[P.linkPath], "/public/einsatzportal-stundenzettel.html?id=sub-3");
    assert.ok(c.params[P.message].includes("…"), "long note should be truncated");
    assert.ok(c.params[P.message].includes("x".repeat(120)));
    assert.ok(!c.params[P.message].includes("x".repeat(121)));
  });

  it("notifySubmissionCorrectionRequested uses default message when no note", async () => {
    await svc.notifySubmissionCorrectionRequested(pool, "u", "sub-3", null);
    assert.match(last(pool).params[P.message], /zur Korrektur zurückgesendet/);
  });

  it("notifyWorkerDocumentVerified maps to success severity + profile link", async () => {
    await svc.notifyWorkerDocumentVerified(pool, "u", "doc-1", "Führerschein");
    const c = last(pool);
    assert.equal(c.params[P.type], "worker_document_verified");
    assert.equal(c.params[P.severity], "success");
    assert.equal(c.params[P.entityType], "worker_profile_document");
    assert.equal(c.params[P.linkPath], "/public/einsatzportal-profil.html#documents");
    assert.match(c.params[P.message], /Führerschein/);
  });

  it("notifyWorkerDocumentVerified falls back to generic noun without title", async () => {
    await svc.notifyWorkerDocumentVerified(pool, "u", "doc-1", null);
    assert.match(last(pool).params[P.message], /Ihr Nachweis/);
  });

  it("notifyWorkerDocumentRejected with reason truncates at 160 chars", async () => {
    const reason = "r".repeat(200);
    await svc.notifyWorkerDocumentRejected(pool, "u", "doc-1", "Zeugnis", reason);
    const c = last(pool);
    assert.equal(c.params[P.type], "worker_document_rejected");
    assert.equal(c.params[P.severity], "error");
    assert.ok(c.params[P.message].includes("…"));
    assert.ok(c.params[P.message].includes("r".repeat(160)));
    assert.ok(!c.params[P.message].includes("r".repeat(161)));
  });

  it("notifyWorkerDocumentRejected without reason uses upload-hint message", async () => {
    await svc.notifyWorkerDocumentRejected(pool, "u", "doc-1", "Zeugnis", null);
    assert.match(last(pool).params[P.message], /korrigierte Version hoch/);
  });

  it("notifyWorkerDocumentExpiring formats days + due date", async () => {
    await svc.notifyWorkerDocumentExpiring(pool, "u", "doc-1", "Pass", "2026-12-31", 10);
    const c = last(pool);
    assert.equal(c.params[P.type], "worker_document_expiring");
    assert.equal(c.params[P.severity], "warning");
    assert.match(c.params[P.message], /in 10 Tagen/);
    assert.match(c.params[P.message], /31\.12\.2026/);
  });

  it("notifyWorkerDocumentExpiring uses 'bald' when daysLeft null and no date", async () => {
    await svc.notifyWorkerDocumentExpiring(pool, "u", "doc-1", null, null, null);
    const c = last(pool);
    assert.match(c.params[P.message], /Ein Nachweis läuft bald ab/);
    assert.doesNotMatch(c.params[P.message], /Tagen/);
  });

  it("notifyWorkerDocumentExpiring treats negative daysLeft as 'bald'", async () => {
    await svc.notifyWorkerDocumentExpiring(pool, "u", "doc-1", "Pass", null, -3);
    assert.doesNotMatch(last(pool).params[P.message], /Tagen/);
  });

  it("notifyWorkerDocumentExpired includes 'seit <date>' when date present", async () => {
    await svc.notifyWorkerDocumentExpired(pool, "u", "doc-1", "Pass", "2026-01-15");
    const c = last(pool);
    assert.equal(c.params[P.type], "worker_document_expired");
    assert.equal(c.params[P.severity], "error");
    assert.match(c.params[P.message], /seit 15\.01\.2026/);
  });

  it("notifyWorkerDocumentExpired without date omits 'seit' clause", async () => {
    await svc.notifyWorkerDocumentExpired(pool, "u", "doc-1", null, null);
    const c = last(pool);
    assert.match(c.params[P.message], /Ein Nachweis ist abgelaufen/);
    assert.doesNotMatch(c.params[P.message], /seit/);
  });

  it("notifySubmissionAccepted includes week label", async () => {
    await svc.notifySubmissionAccepted(pool, "u", "sub-1", "KW 12");
    const c = last(pool);
    assert.equal(c.params[P.type], "worker_submission_accepted");
    assert.equal(c.params[P.severity], "success");
    assert.match(c.params[P.message], /für KW 12/);
  });

  it("notifySubmissionAccepted omits week clause when missing", async () => {
    await svc.notifySubmissionAccepted(pool, "u", "sub-1", null);
    assert.doesNotMatch(last(pool).params[P.message], /für /);
  });

  it("notifyAssignmentPendingConfirmation targets benachrichtigungen page", async () => {
    await svc.notifyAssignmentPendingConfirmation(pool, "u", "link-1", "ACME");
    const c = last(pool);
    assert.equal(c.params[P.type], "worker_assignment_pending_confirmation");
    assert.equal(c.params[P.severity], "warning");
    assert.equal(c.params[P.linkPath], "/public/einsatzportal-benachrichtigungen.html");
    assert.match(c.params[P.message], /bei ACME/);
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * Staffing factories — context object handling + throwOnError passthrough.
 * ────────────────────────────────────────────────────────────────────────── */
describe("staffing factories", () => {
  let pool;
  beforeEach(() => { pool = trackingPool(); });

  it("notifyStaffingRequestNew composes all context segments", async () => {
    await svc.notifyStaffingRequestNew(pool, "u", "inv-1", {
      clientName: "ACME", title: "Spätschicht", openQuantity: 3, deadlineLabel: "Fr 18:00"
    });
    const c = last(pool);
    assert.equal(c.params[P.type], "worker_staffing_request_new");
    assert.equal(c.params[P.entityType], "assignment_staffing_invite");
    assert.equal(c.params[P.entityId], "inv-1");
    assert.match(c.params[P.message], /Spätschicht bei ACME/);
    assert.match(c.params[P.message], /Noch offen: 3\./);
    assert.match(c.params[P.message], /Antwort bis Fr 18:00\./);
  });

  it("notifyStaffingRequestNew handles empty context with defaults", async () => {
    await svc.notifyStaffingRequestNew(pool, "u", "inv-1");
    const c = last(pool);
    assert.match(c.params[P.message], /Neue Einsatzanfrage/);
    assert.doesNotMatch(c.params[P.message], /Noch offen/);
    assert.doesNotMatch(c.params[P.message], /Antwort bis/);
  });

  it("notifyStaffingRequestNew omits openQuantity when non-numeric", async () => {
    await svc.notifyStaffingRequestNew(pool, "u", "inv-1", { openQuantity: "abc" });
    assert.doesNotMatch(last(pool).params[P.message], /Noch offen/);
  });

  it("notifyStaffingRequestNew passes throwOnError through to core", async () => {
    const failing = trackingPool({ fail: new Error("db down") });
    await assert.rejects(
      () => svc.notifyStaffingRequestNew(failing, "u", "inv-1", {}, { throwOnError: true }),
      /db down/
    );
  });

  it("notifyStaffingRequestNew swallows errors by default", async () => {
    const failing = trackingPool({ fail: new Error("db down") });
    await svc.notifyStaffingRequestNew(failing, "u", "inv-1", {});
    assert.equal(failing.calls.length, 1);
  });

  it("notifyStaffingChoiceRequest composes optionCount + mode + deadline", async () => {
    await svc.notifyStaffingChoiceRequest(pool, "u", "cs-1", {
      title: "Auswahl A", optionCount: 4, modeLabel: "Single", deadlineLabel: "Mo"
    });
    const c = last(pool);
    assert.equal(c.params[P.type], "worker_staffing_choice_request");
    assert.equal(c.params[P.entityType], "assignment_staffing_choice_set");
    assert.match(c.params[P.message], /4 Optionen/);
    assert.match(c.params[P.message], /Modus: Single\./);
    assert.match(c.params[P.message], /bis Mo reagieren\./);
  });

  it("notifyStaffingChoiceRequest with empty context still produces trimmed message", async () => {
    await svc.notifyStaffingChoiceRequest(pool, "u", "cs-1");
    const c = last(pool);
    assert.equal(c.params[P.message], "Neue Einsatzauswahl.");
  });

  it("notifyStaffingChoiceRequest passes throwOnError through", async () => {
    const failing = trackingPool({ fail: new Error("x") });
    await assert.rejects(
      () => svc.notifyStaffingChoiceRequest(failing, "u", "cs-1", {}, { throwOnError: true }),
      /x/
    );
  });

  it("notifyStaffingRequestReminder composes deadline clause", async () => {
    await svc.notifyStaffingRequestReminder(pool, "u", "inv-2", { title: "Anfrage X", deadlineLabel: "Di" });
    const c = last(pool);
    assert.equal(c.params[P.type], "worker_staffing_request_reminder");
    assert.match(c.params[P.message], /Anfrage X\. Ihre Entscheidung steht noch aus\./);
    assert.match(c.params[P.message], /Antwort bis Di\./);
  });

  it("notifyStaffingRequestReminder uses default title and omits deadline", async () => {
    await svc.notifyStaffingRequestReminder(pool, "u", "inv-2");
    const c = last(pool);
    assert.match(c.params[P.message], /Erinnerung zur Staffing-Anfrage/);
    assert.doesNotMatch(c.params[P.message], /Antwort bis/);
  });

  it("notifyStaffingRequestReminder passes throwOnError through", async () => {
    const failing = trackingPool({ fail: new Error("y") });
    await assert.rejects(
      () => svc.notifyStaffingRequestReminder(failing, "u", "inv-2", {}, { throwOnError: true }),
      /y/
    );
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * Dispatcher / reviewer-directed notifications.
 * ────────────────────────────────────────────────────────────────────────── */
describe("dispatcher & reviewer notifications", () => {
  let pool;
  beforeEach(() => { pool = trackingPool(); });

  it("notifyStaffingChoiceSubmittedToDispatcher targets dispatcher user + review page", async () => {
    await svc.notifyStaffingChoiceSubmittedToDispatcher(pool, "disp-1", "cs-1", "Max", "Summary text");
    const c = last(pool);
    assert.equal(c.params[P.userId], "disp-1");
    assert.equal(c.params[P.type], "worker_staffing_choice_submitted");
    assert.equal(c.params[P.linkPath], "/public/worker-submissions-review.html");
    assert.match(c.params[P.message], /Max hat eine Einsatzauswahl/);
    assert.match(c.params[P.message], /Summary text/);
  });

  it("notifyStaffingChoiceSubmittedToDispatcher uses fallback name + omits summary", async () => {
    await svc.notifyStaffingChoiceSubmittedToDispatcher(pool, "disp-1", "cs-1", null, null);
    const c = last(pool);
    assert.match(c.params[P.message], /Ein Mitarbeiter hat eine Einsatzauswahl/);
  });

  it("notifyStaffingChoiceDeclinedToDispatcher includes note (truncated 160)", async () => {
    await svc.notifyStaffingChoiceDeclinedToDispatcher(pool, "disp-1", "cs-1", "Max", "n".repeat(200));
    const c = last(pool);
    assert.equal(c.params[P.type], "worker_staffing_choice_declined");
    assert.equal(c.params[P.severity], "warning");
    assert.match(c.params[P.message], /Grund: /);
    assert.ok(c.params[P.message].includes("n".repeat(160)));
    assert.ok(!c.params[P.message].includes("n".repeat(161)));
  });

  it("notifyAssignmentConfirmedToDispatcher uses confirmed type + success severity", async () => {
    await svc.notifyAssignmentConfirmedToDispatcher(pool, "disp-1", "link-1", "Max");
    const c = last(pool);
    assert.equal(c.params[P.userId], "disp-1");
    assert.equal(c.params[P.type], "worker_assignment_confirmed");
    assert.equal(c.params[P.severity], "success");
    assert.equal(c.params[P.entityType], "worker_assignment_link");
    assert.match(c.params[P.message], /Max hat den zugewiesenen Einsatz bestätigt/);
  });

  it("notifyStaffingInviteAcceptedToDispatcher reuses confirmed type with invite entity", async () => {
    await svc.notifyStaffingInviteAcceptedToDispatcher(pool, "disp-1", "inv-1", null);
    const c = last(pool);
    assert.equal(c.params[P.type], "worker_assignment_confirmed");
    assert.equal(c.params[P.entityType], "assignment_staffing_invite");
    assert.match(c.params[P.message], /Ein Mitarbeiter hat eine Staffing-Anfrage angenommen/);
  });

  it("notifyStaffingInviteDeclinedToDispatcher includes reason (truncated 120)", async () => {
    await svc.notifyStaffingInviteDeclinedToDispatcher(pool, "disp-1", "inv-1", "Max", "z".repeat(200));
    const c = last(pool);
    assert.equal(c.params[P.type], "worker_assignment_declined");
    assert.match(c.params[P.message], /Grund: /);
    assert.ok(c.params[P.message].includes("z".repeat(120)));
    assert.ok(!c.params[P.message].includes("z".repeat(121)));
  });

  it("notifyStaffingInviteDeclinedToDispatcher omits reason clause when absent", async () => {
    await svc.notifyStaffingInviteDeclinedToDispatcher(pool, "disp-1", "inv-1", "Max", null);
    assert.doesNotMatch(last(pool).params[P.message], /Grund:/);
  });

  it("notifyStaffingQuestionToDispatcher includes question (truncated 180)", async () => {
    await svc.notifyStaffingQuestionToDispatcher(pool, "disp-1", "inv-1", "Max", "q".repeat(200));
    const c = last(pool);
    assert.equal(c.params[P.type], "worker_staffing_request_question");
    assert.match(c.params[P.message], /Frage: /);
    assert.ok(c.params[P.message].includes("q".repeat(180)));
    assert.ok(!c.params[P.message].includes("q".repeat(181)));
  });

  it("notifyAssignmentDeclinedToDispatcher includes reason (truncated 120)", async () => {
    await svc.notifyAssignmentDeclinedToDispatcher(pool, "disp-1", "link-1", "Max", "w".repeat(200));
    const c = last(pool);
    assert.equal(c.params[P.type], "worker_assignment_declined");
    assert.equal(c.params[P.entityType], "worker_assignment_link");
    assert.match(c.params[P.message], /Max hat den Einsatz abgelehnt/);
    assert.ok(c.params[P.message].includes("w".repeat(120)));
  });

  it("notifyUnavailableReported formats from-date", async () => {
    await svc.notifyUnavailableReported(pool, "disp-1", "link-1", "Max", "2026-03-05");
    const c = last(pool);
    assert.equal(c.params[P.type], "worker_unavailable_reported");
    assert.equal(c.params[P.severity], "warning");
    assert.match(c.params[P.message], /ab 05\.03\.2026/);
  });

  it("notifyUnavailableReported uses 'sofort' when no from-date", async () => {
    await svc.notifyUnavailableReported(pool, "disp-1", "link-1", null, null);
    const c = last(pool);
    assert.match(c.params[P.message], /Ein Mitarbeiter hat sich ab sofort/);
  });

  it("notifySubmissionSubmitted includes week label + reviewer target", async () => {
    await svc.notifySubmissionSubmitted(pool, "rev-1", "sub-1", "Max", "KW 9");
    const c = last(pool);
    assert.equal(c.params[P.userId], "rev-1");
    assert.equal(c.params[P.type], "worker_submission_submitted");
    assert.equal(c.params[P.entityType], "worker_time_submission");
    assert.match(c.params[P.message], /für KW 9/);
  });

  it("notifySubmissionSubmitted omits week clause when missing", async () => {
    await svc.notifySubmissionSubmitted(pool, "rev-1", "sub-1", "Max", null);
    assert.doesNotMatch(last(pool).params[P.message], /für/);
  });

  it("notifySubmissionCorrected targets reviewer with corrected type", async () => {
    await svc.notifySubmissionCorrected(pool, "rev-1", "sub-1", "Max");
    const c = last(pool);
    assert.equal(c.params[P.type], "worker_submission_corrected");
    assert.match(c.params[P.message], /Max hat den korrigierten Stundenzettel/);
  });

  it("notifySubmissionSentToCustomer includes customer name", async () => {
    await svc.notifySubmissionSentToCustomer(pool, "rev-1", "sub-1", "Kunde GmbH");
    const c = last(pool);
    assert.equal(c.params[P.type], "worker_submission_sent_to_customer");
    assert.match(c.params[P.message], /an Kunde GmbH/);
  });

  it("notifySubmissionSentToCustomer omits customer clause when absent", async () => {
    await svc.notifySubmissionSentToCustomer(pool, "rev-1", "sub-1", null);
    assert.doesNotMatch(last(pool).params[P.message], / an /);
  });

  it("notifySubmissionRejected truncates reason at 120 + error severity", async () => {
    await svc.notifySubmissionRejected(pool, "u", "sub-1", "a".repeat(200));
    const c = last(pool);
    assert.equal(c.params[P.type], "worker_submission_rejected");
    assert.equal(c.params[P.severity], "error");
    assert.ok(c.params[P.message].includes("…"));
    assert.ok(c.params[P.message].includes("a".repeat(120)));
    assert.ok(!c.params[P.message].includes("a".repeat(121)));
  });

  it("notifySubmissionRejected uses default message when no reason", async () => {
    await svc.notifySubmissionRejected(pool, "u", "sub-1", null);
    assert.match(last(pool).params[P.message], /kontaktieren Sie Ihren Disponenten/);
  });
});
