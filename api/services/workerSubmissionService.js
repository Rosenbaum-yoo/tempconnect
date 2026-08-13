/**
 * Worker Submission Service
 * Lifecycle: draft → submitted → under_review → needs_correction / accepted_into_timesheet / rejected
 * Transfer: accepted_into_timesheet → erstellt Timesheet im bestehenden System (Single Source of Truth)
 */
import * as workerNotifications from "./workerNotificationService.js";
import { sendMail } from "./emailService.js";
import { timesheetSentToCustomerEmail } from "./emailHtmlTemplates.js";
import { config } from "../config/index.js";
import { swallow } from "../utils/logger.js";
import { dateOnlyDE } from "../utils/dateDE.js";

/* ── Statusübergänge ────────────────────────────────────────────────────────── */

const VALID_TRANSITIONS = {
  draft:                   ["submitted"],
  submitted:               ["under_review", "needs_correction", "rejected"],
  under_review:            ["needs_correction", "approved_internal", "rejected"],
  needs_correction:        ["submitted"],       // Worker korrigiert und reicht erneut ein
  approved_internal:       ["sent_to_customer", "posted_to_timesheet"], // intern genehmigt
  sent_to_customer:        ["customer_confirmed", "customer_rejected"],
  customer_confirmed:      ["posted_to_timesheet"],
  customer_rejected:       ["under_review"],     // zurück zur internen Prüfung
  posted_to_timesheet:     [],                  // Terminal
  accepted_into_timesheet: [],                  // Terminal (Legacy)
  rejected:                [],                  // Terminal
  superseded:              []                   // Terminal
};

function canTransition(from, to) {
  return (VALID_TRANSITIONS[from] || []).includes(to);
}

function normalizePeriodMode(periodMode) {
  return periodMode === "month" ? "month" : "week";
}

/**
 * Klasse DB_WERT_NACH_UTC — gemeinsame Basis aller Wochen-/Monatsrechnungen hier.
 *
 * `week_start`/`work_date` sind DATE-Spalten. node-postgres parst sie als LOKALE
 * Mitternacht; der Container laeuft auf Europe/Berlin, also 22:00/23:00 UTC des
 * VORTAGS. Jede nachfolgende UTC-Arithmetik (getUTCDay/setUTCHours/toISOString)
 * rechnet damit ganztaegig mit dem falschen Kalendertag.
 * Deshalb wird hier zuerst der lokale Kalendertag bestimmt und dann als echte
 * UTC-Mitternacht verankert — ab da ist die UTC-Arithmetik unten wieder korrekt.
 */
function toDateOnlyUtc(dateLike) {
  const iso = dateOnlyDE(dateLike);
  return iso ? new Date(`${iso}T00:00:00.000Z`) : new Date(NaN);
}

function startOfWeekUtc(dateLike) {
  const d = toDateOnlyUtc(dateLike);
  const day = d.getUTCDay(); // 0 Sun..6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function startOfMonthUtc(dateLike) {
  const d = toDateOnlyUtc(dateLike);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Klasse DB_WERT_NACH_UTC: ohne die Verankerung in toDateOnlyUtc faellt der
// Periodenschluessel einer am Monatsersten beginnenden Woche in den Vormonat —
// die Sammelfreigabe erschiene dann unter "Juli" statt "August".
function toIsoDate(d) {
  return toDateOnlyUtc(d).toISOString().slice(0, 10);
}

function periodKeyFromWeekStart(weekStart, periodMode) {
  const mode = normalizePeriodMode(periodMode);
  const d = mode === "month" ? startOfMonthUtc(weekStart) : startOfWeekUtc(weekStart);
  return toIsoDate(d);
}

function buildBundleKey(orgId, periodMode, periodKey) {
  return `org:${orgId}|mode:${normalizePeriodMode(periodMode)}|period:${periodKey}`;
}

function toUtcDateOnly(dateLike) {
  return toDateOnlyUtc(dateLike);
}

// Klasse DB_WERT_NACH_UTC: work_date/week_start kommen als lokale Mitternacht an.
// Ohne Normalisierung waeren die erwarteten Arbeitstage einer Woche komplett um
// einen Tag verschoben — die Vollstaendigkeitspruefung meldete dann Tage als
// fehlend, die eingetragen sind, und uebersaehe die echte Luecke.
function formatIsoDate(dateLike) {
  return toDateOnlyUtc(dateLike).toISOString().slice(0, 10);
}

function expectedWeekDates(weekStart, weekEnd) {
  const start = toUtcDateOnly(weekStart);
  const end = toUtcDateOnly(weekEnd);
  const dates = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(formatIsoDate(d));
  }
  return dates;
}

export function computeWeeklyCompletion(weekStart, weekEnd, entries = []) {
  const expectedDates = expectedWeekDates(weekStart, weekEnd);
  // DB liefert `DATE`-Spalten teils als String, teils als Date-Objekt (je nach pg-Parser).
  // Wir formatieren deshalb robust immer auf ISO-Date-only (YYYY-MM-DD).
  const actualDatesSet = new Set((entries || []).map((e) => formatIsoDate(e.work_date)));
  const missingDates = expectedDates.filter((d) => !actualDatesSet.has(d));
  return {
    expected_days: expectedDates.length,
    filled_days: expectedDates.length - missingDates.length,
    is_complete: missingDates.length === 0,
    missing_dates: missingDates
  };
}

/* ── Totals neu berechnen ───────────────────────────────────────────────────── */

async function recalcTotals(client, submissionId) {
  await client.query(
    `UPDATE worker_time_submissions SET
       total_hours    = COALESCE((SELECT SUM(hours_regular + hours_overtime)
                                  FROM worker_time_submission_entries
                                  WHERE submission_id = $1), 0),
       overtime_hours = COALESCE((SELECT SUM(hours_overtime)
                                  FROM worker_time_submission_entries
                                  WHERE submission_id = $1), 0),
       updated_at     = NOW()
     WHERE id = $1`,
    [submissionId]
  );
}

/* ── Event-Log ──────────────────────────────────────────────────────────────── */

async function logEvent(client, { submissionId, actorId, eventType, note, meta }) {
  await client.query(
    `INSERT INTO worker_submission_events (submission_id, actor_id, event_type, note, meta)
     VALUES ($1, $2, $3, $4, $5)`,
    [submissionId, actorId || null, eventType, note || null,
     meta ? JSON.stringify(meta) : null]
  );
}

/* ── Submission abrufen ─────────────────────────────────────────────────────── */

export async function getSubmission(pool, submissionId) {
  const { rows } = await pool.query(
    `SELECT wts.*,
            (wts.submission_deadline IS NOT NULL
              AND wts.status IN ('draft','needs_correction')
              AND CURRENT_DATE > wts.submission_deadline) AS is_overdue,
            u.email AS worker_email,
            wp.first_name, wp.last_name, wp.personnel_number,
            o.name  AS client_name,
            so.name AS supplier_name,
            a.worker_description AS assignment_description
     FROM worker_time_submissions wts
     JOIN users u ON u.id = wts.worker_user_id
     LEFT JOIN worker_profiles wp ON wp.user_id = wts.worker_user_id
     LEFT JOIN organizations o  ON o.id  = wts.org_id
     LEFT JOIN organizations so ON so.id = wts.supplier_org_id
     LEFT JOIN assignments a    ON a.id  = wts.assignment_id
     WHERE wts.id = $1`,
    [submissionId]
  );
  return rows[0] || null;
}

export async function getSubmissionWithEntries(pool, submissionId) {
  const sub = await getSubmission(pool, submissionId);
  if (!sub) return null;

  const [entries, events] = await Promise.all([
    pool.query(
      `SELECT * FROM worker_time_submission_entries
       WHERE submission_id = $1
       ORDER BY work_date ASC`,
      [submissionId]
    ),
    pool.query(
      `SELECT wse.*, u.email AS actor_email
       FROM worker_submission_events wse
       LEFT JOIN users u ON u.id = wse.actor_id
       WHERE wse.submission_id = $1
       ORDER BY wse.created_at DESC`,
      [submissionId]
    )
  ]);

  const completion = computeWeeklyCompletion(sub.week_start, sub.week_end, entries.rows);
  return { ...sub, entries: entries.rows, events: events.rows, completion };
}

/* ── Submission-Liste ───────────────────────────────────────────────────────── */

export async function listSubmissions(pool, {
  workerUserId = null,
  supplierOrgId = null,
  orgId = null,
  assignmentId = null,
  status = null,
  weekStartFrom = null,
  weekStartTo = null,
  limit = 100
}) {
  const params = [];
  const conditions = [];

  if (workerUserId)  { params.push(workerUserId);  conditions.push(`wts.worker_user_id = $${params.length}`); }
  if (supplierOrgId) { params.push(supplierOrgId); conditions.push(`wts.supplier_org_id = $${params.length}`); }
  if (orgId)         { params.push(orgId);         conditions.push(`wts.org_id = $${params.length}`); }
  if (assignmentId)  { params.push(assignmentId);  conditions.push(`wts.assignment_id = $${params.length}`); }
  if (status) {
    params.push(status);
    conditions.push(`wts.status = $${params.length}`);
  }
  if (weekStartFrom) { params.push(weekStartFrom); conditions.push(`wts.week_start >= $${params.length}`); }
  if (weekStartTo)   { params.push(weekStartTo);   conditions.push(`wts.week_start <= $${params.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT wts.id, wts.worker_user_id, wts.assignment_id,
            wts.org_id, wts.supplier_org_id,
            wts.week_start, wts.week_end,
            wts.total_hours, wts.overtime_hours,
            wts.status, wts.submitted_at, wts.reviewed_at,
            wts.worker_comment, wts.reviewer_comment, wts.correction_note,
            wts.timesheet_id, wts.created_at,
            wts.submission_deadline, wts.submitted_late,
            (wts.submission_deadline IS NOT NULL
              AND wts.status IN ('draft','needs_correction')
              AND CURRENT_DATE > wts.submission_deadline) AS is_overdue,
            (SELECT COUNT(*)::int FROM worker_time_submission_entries e WHERE e.submission_id = wts.id) AS filled_days,
            (DATE_PART('day', wts.week_end::timestamp - wts.week_start::timestamp)::int + 1) AS expected_days,
            wp.first_name, wp.last_name, wp.personnel_number,
            u.email AS worker_email,
            o.name  AS client_name,
            so.name AS supplier_name
     FROM worker_time_submissions wts
     JOIN users u ON u.id = wts.worker_user_id
     LEFT JOIN worker_profiles wp ON wp.user_id = wts.worker_user_id
     LEFT JOIN organizations o  ON o.id  = wts.org_id
     LEFT JOIN organizations so ON so.id = wts.supplier_org_id
     ${where}
     ORDER BY wts.week_start DESC, wts.created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return rows;
}

/**
 * Freigabe-Grenze Agentur → Kunde: NUR diese Status darf die Käufer-Org überhaupt sehen.
 * Alles davor (draft / submitted / approved_internal) ist der interne Prüfstand der Agentur —
 * ein Kunde darf weder unfertige noch intern noch nicht freigegebene Stunden lesen.
 * Single source of truth für Liste UND Detail-Guard (siehe routes/companyTimesheets.js).
 */
export const COMPANY_VISIBLE_STATUSES = Object.freeze([
  "sent_to_customer", "customer_confirmed", "customer_rejected", "posted_to_timesheet"
]);

/**
 * Käufer-Sicht (P2.2): Stundenzettel, die AN DIE eigene Unternehmens-Org gesendet wurden.
 * Gescoped auf `wts.org_id = companyOrgId` (die Einsatz-/Käufer-Org), NICHT supplier_org_id.
 * Default: alle käufer-sichtbaren Status. Ein `status`-Filter kann die Freigabe-Grenze
 * NICHT aufweiten — ein nicht-whitelisteter Wert fällt auf den Default zurück.
 */
export async function listCompanySubmissions(pool, companyOrgId, { status = null, limit = 100 } = {}) {
  const params = [companyOrgId];
  const visibleList = COMPANY_VISIBLE_STATUSES.map((s) => `'${s}'`).join(",");
  let statusClause = `wts.status IN (${visibleList})`;
  if (status && COMPANY_VISIBLE_STATUSES.includes(status)) {
    params.push(status);
    statusClause = `wts.status = $${params.length}`;
  }
  params.push(Math.min(500, Math.max(1, Number(limit) || 100)));
  const { rows } = await pool.query(
    `SELECT wts.id, wts.status, wts.week_start, wts.week_end,
            wts.total_hours, wts.overtime_hours,
            wts.submitted_at, wts.sent_to_customer_at,
            wts.customer_confirmed_at, wts.customer_rejected_at, wts.customer_note,
            wts.worker_comment,
            wp.first_name, wp.last_name, wp.personnel_number,
            u.email  AS worker_email,
            so.name  AS supplier_name, wts.supplier_org_id,
            a.worker_description AS assignment_description
       FROM worker_time_submissions wts
       JOIN users u ON u.id = wts.worker_user_id
       LEFT JOIN worker_profiles wp ON wp.user_id = wts.worker_user_id
       LEFT JOIN organizations so ON so.id = wts.supplier_org_id
       LEFT JOIN assignments a ON a.id = wts.assignment_id
      WHERE wts.org_id = $1 AND ${statusClause}
      ORDER BY (wts.status = 'sent_to_customer') DESC,
               wts.sent_to_customer_at DESC NULLS LAST, wts.week_start DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
}

/* ── Submission anlegen ─────────────────────────────────────────────────────── */

// Einreichfrist (P2.1): Standard = Wochenende + N Tage. Weiche Frist (kein Hard-Block).
// Als Konstante materialisiert je Submission → später ohne Schema-Änderung auf ein
// Org-Setting (settingsService, Tier-3) umstellbar; nur diese Zahl muss dann eine Query werden.
export const TIMESHEET_DEADLINE_DAYS = 3;

export async function createSubmission(pool, {
  workerUserId, workerAssignmentLinkId, orgId, supplierOrgId,
  assignmentId, weekStart, weekEnd, workerComment
}) {
  // Woche validieren (muss genau 7 Kalendertage sein)
  const expectedDates = expectedWeekDates(weekStart, weekEnd);
  if (expectedDates.length !== 7) return { error: "INVALID_WEEK_RANGE", expected_days: 7, actual_days: expectedDates.length };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: [sub] } = await client.query(
      `INSERT INTO worker_time_submissions
         (worker_user_id, worker_assignment_link_id, org_id, supplier_org_id,
          assignment_id, week_start, week_end, worker_comment, submission_deadline)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, ($7::date + INTERVAL '${TIMESHEET_DEADLINE_DAYS} days')::date)
       RETURNING *`,
      [workerUserId, workerAssignmentLinkId || null, orgId, supplierOrgId,
       assignmentId || null, weekStart, weekEnd, workerComment || null]
    );

    await logEvent(client, {
      submissionId: sub.id, actorId: workerUserId, eventType: "created"
    });

    await client.query("COMMIT");
    return { submission: sub };
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") return { error: "DUPLICATE_WEEK" };
    throw err;
  } finally {
    client.release();
  }
}

/* ── Tageseintrag hinzufügen / aktualisieren ────────────────────────────────── */

export async function upsertEntry(pool, submissionId, workerUserId, entry) {
  const sub = await getSubmission(pool, submissionId);
  if (!sub) return { error: "NOT_FOUND" };
  if (sub.worker_user_id !== workerUserId) return { error: "FORBIDDEN" };
  if (sub.status !== "draft" && sub.status !== "needs_correction") {
    return { error: "SUBMISSION_NOT_EDITABLE", status: sub.status };
  }
  // Datum muss innerhalb der Woche liegen
  if (entry.work_date < sub.week_start || entry.work_date > sub.week_end) {
    return { error: "DATE_OUT_OF_RANGE" };
  }
  // Ziel 2: Wenn Einsatz als unavailable gemeldet, keine Einträge ab unavailable_from
  if (sub.worker_assignment_link_id) {
    try {
      const { rows: linkRows } = await pool.query(
        `SELECT worker_confirmation_status, unavailable_from
         FROM worker_assignment_links WHERE id = $1`,
        [sub.worker_assignment_link_id]
      );
      const link = linkRows[0];
      if (link && link.worker_confirmation_status === 'worker_unavailable' && link.unavailable_from) {
        // Klasse DB_WERT_NACH_UTC: unavailable_from ist eine DATE-Spalte und kommt
        // als lokale Mitternacht (Europe/Berlin) an. Ueber toISOString() waere der
        // Cutoff ganztaegig der Vortag — der letzte tatsaechlich gearbeitete Tag vor
        // der Abmeldung wuerde abgelehnt und dem Nutzer ein zu fruehes Abmeldedatum
        // genannt. Das sind nicht erfasste Arbeitsstunden.
        const cutoff = typeof link.unavailable_from === 'string'
          ? link.unavailable_from.slice(0, 10)
          : dateOnlyDE(link.unavailable_from);
        if (entry.work_date >= cutoff) {
          return { error: "DATE_AFTER_UNAVAILABLE", unavailable_from: cutoff };
        }
      }
    } catch { /* defensive: don't block if link lookup fails */ }
  }
  // Stunden-Plausibilität
  const total = parseFloat(entry.hours_regular || 0) + parseFloat(entry.hours_overtime || 0);
  if (total > 24) return { error: "HOURS_EXCEED_DAILY_MAX" };
  if (total < 0)  return { error: "NEGATIVE_HOURS" };
  const breakMinutes = parseInt(entry.break_minutes || 0, 10);
  if (breakMinutes > 600) return { error: "BREAK_EXCEED_MAX" };
  const hasStart = !!entry.shift_start;
  const hasEnd = !!entry.shift_end;
  if (hasStart !== hasEnd) return { error: "SHIFT_PARTIAL" };
  if (hasStart && hasEnd && entry.shift_end <= entry.shift_start) return { error: "SHIFT_INVALID_RANGE" };
  if (total === 0 && (hasStart || hasEnd || breakMinutes > 0)) return { error: "ZERO_DAY_WITH_SHIFT_OR_BREAK" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [e] } = await client.query(
      `INSERT INTO worker_time_submission_entries
         (submission_id, work_date, hours_regular, hours_overtime,
          break_minutes, shift_start, shift_end, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (submission_id, work_date) DO UPDATE
         SET hours_regular   = EXCLUDED.hours_regular,
             hours_overtime  = EXCLUDED.hours_overtime,
             break_minutes   = EXCLUDED.break_minutes,
             shift_start     = EXCLUDED.shift_start,
             shift_end       = EXCLUDED.shift_end,
             notes           = EXCLUDED.notes,
             updated_at      = NOW()
       RETURNING *`,
      [submissionId,
       entry.work_date,
       entry.hours_regular   || 0,
       entry.hours_overtime  || 0,
       entry.break_minutes   || 0,
       entry.shift_start     || null,
       entry.shift_end       || null,
       entry.notes           || null]
    );
    await recalcTotals(client, submissionId);
    await client.query("COMMIT");
    return { entry: e };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteEntry(pool, submissionId, entryId, workerUserId) {
  const sub = await getSubmission(pool, submissionId);
  if (!sub) return { error: "NOT_FOUND" };
  if (sub.worker_user_id !== workerUserId) return { error: "FORBIDDEN" };
  if (!["draft","needs_correction"].includes(sub.status)) {
    return { error: "SUBMISSION_NOT_EDITABLE" };
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM worker_time_submission_entries WHERE id=$1 AND submission_id=$2`,
      [entryId, submissionId]
    );
    await recalcTotals(client, submissionId);
    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/* ── Status-Lifecycle ───────────────────────────────────────────────────────── */

async function transition(pool, submissionId, newStatus, actorId, {
  reviewerComment = null, correctionNote = null, eventNote = null, eventType
} = {}) {
  const sub = await getSubmission(pool, submissionId);
  if (!sub) return { error: "NOT_FOUND" };
  if (!canTransition(sub.status, newStatus)) {
    return { error: "INVALID_TRANSITION", from: sub.status, to: newStatus };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const params  = [submissionId];
    const sets    = [`status = '${newStatus}'`, `updated_at = NOW()`];

    if (newStatus === "submitted") {
      sets.push(`submitted_at = NOW()`, `submitted_by = $${params.push(actorId) && params.length}`);
      sets.push(`correction_note = NULL`); // zurücksetzen
      // P2.1: verspätete Abgabe markieren (weiche Frist — Einreichen bleibt erlaubt).
      sets.push(`submitted_late = (submission_deadline IS NOT NULL AND CURRENT_DATE > submission_deadline)`);
    }
    if (newStatus === "under_review") {
      sets.push(`reviewed_at = NOW()`, `reviewed_by = $${params.push(actorId) && params.length}`);
    }
    if (newStatus === "approved_internal") {
      sets.push(`approved_internal_at = NOW()`, `approved_internal_by = $${params.push(actorId) && params.length}`);
    }
    if (newStatus === "sent_to_customer") {
      sets.push(`sent_to_customer_at = NOW()`, `sent_to_customer_by = $${params.push(actorId) && params.length}`);
    }
    if (newStatus === "customer_confirmed") {
      sets.push(`customer_confirmed_at = NOW()`);
    }
    if (newStatus === "customer_rejected") {
      sets.push(`customer_rejected_at = NOW()`);
    }
    if (newStatus === "posted_to_timesheet") {
      sets.push(`posted_to_timesheet_at = NOW()`, `posted_to_timesheet_by = $${params.push(actorId) && params.length}`);
    }
    if (newStatus === "accepted_into_timesheet") {
      sets.push(`accepted_at = NOW()`, `accepted_by = $${params.push(actorId) && params.length}`);
    }
    if (newStatus === "rejected") {
      sets.push(`rejected_at = NOW()`, `rejected_by = $${params.push(actorId) && params.length}`);
    }
    if (reviewerComment !== null) {
      sets.push(`reviewer_comment = $${params.push(reviewerComment) && params.length}`);
    }
    if (correctionNote !== null) {
      sets.push(`correction_note = $${params.push(correctionNote) && params.length}`);
    }

    await client.query(
      `UPDATE worker_time_submissions SET ${sets.join(", ")} WHERE id = $1`,
      params
    );

    await logEvent(client, {
      submissionId, actorId, eventType: eventType || newStatus,
      note: eventNote || reviewerComment || correctionNote,
      meta: { from: sub.status, to: newStatus }
    });

    await client.query("COMMIT");
    return { ok: true, from: sub.status, to: newStatus };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function submitSubmission(pool, submissionId, workerUserId) {
  const sub = await getSubmissionWithEntries(pool, submissionId);
  if (!sub) return { error: "NOT_FOUND" };
  if (sub.worker_user_id !== workerUserId) return { error: "FORBIDDEN" };
  const completion = sub.completion || computeWeeklyCompletion(sub.week_start, sub.week_end, sub.entries || []);
  if (!completion.is_complete) {
    return { error: "INCOMPLETE_WEEK", completion };
  }
  const result = await transition(pool, submissionId, "submitted", workerUserId, {
    eventType: "submitted"
  });
  // Ziel 3: Notification an Reviewer/Dispatcher nach Submit
  if (result.ok) {
    try {
      const workerName = `${sub.first_name || ""} ${sub.last_name || ""}`.trim() || null;
      const weekLabel = sub.week_start
        ? new Date(sub.week_start).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
        : null;
      // Empfänger: created_by des Assignment-Links (Dispatcher) oder reviewed_by
      let recipientId = sub.reviewed_by || null;
      if (!recipientId && sub.worker_assignment_link_id) {
        const { rows } = await pool.query(
          "SELECT created_by FROM worker_assignment_links WHERE id = $1",
          [sub.worker_assignment_link_id]
        );
        recipientId = rows[0]?.created_by || null;
      }
      if (recipientId) {
        await workerNotifications.notifySubmissionSubmitted(
          pool, recipientId, submissionId, workerName, weekLabel
        );
      }
    } catch { /* notification non-critical */ }
  }
  return result;
}

export function startReview(pool, submissionId, reviewerUserId) {
  return transition(pool, submissionId, "under_review", reviewerUserId, {
    eventType: "review_started"
  });
}

export async function requestCorrection(pool, submissionId, reviewerUserId, correctionNote) {
  const sub = await getSubmissionWithEntries(pool, submissionId);
  if (!sub) return { error: "NOT_FOUND" };

  // Ziel 4: Snapshot der aktuellen Entries für späteren Vergleich sichern
  // Klasse DB_WERT_NACH_UTC: work_date ueber formatIsoDate (Europe/Berlin) statt
  // toISOString(). Sonst nennt das Korrektur-Protokoll durchgaengig den falschen
  // Arbeitstag ("am 09.08. wurden 8 auf 6 Stunden geaendert"), und der fruehere
  // String/Date-Zweig lieferte fuer denselben Tag je nach pg-Parser zwei
  // verschiedene Werte. formatIsoDate wird bewusst auch in submitCorrected()
  // benutzt, damit der spaetere JSON-Vergleich beide Seiten identisch normalisiert.
  const snapshot = (sub.entries || []).map(e => ({
    work_date: formatIsoDate(e.work_date),
    hours_regular: parseFloat(e.hours_regular || 0),
    hours_overtime: parseFloat(e.hours_overtime || 0),
    break_minutes: parseInt(e.break_minutes || 0, 10),
    shift_start: e.shift_start || null,
    shift_end: e.shift_end || null
  })).sort((a, b) => a.work_date.localeCompare(b.work_date));

  const result = await transition(pool, submissionId, "needs_correction", reviewerUserId, {
    correctionNote,
    eventType: "correction_requested",
    eventNote: correctionNote
  });
  if (result.ok) {
    // Speichere Snapshot als eigenes Event für späteren Vergleich
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO worker_submission_events (submission_id, actor_id, event_type, note, meta)
         VALUES ($1, $2, 'correction_snapshot', $3, $4)`,
        [submissionId, reviewerUserId, correctionNote || null, JSON.stringify({ entries_snapshot: snapshot })]
      );
    } catch { /* non-critical */ } finally { client.release(); }
    await workerNotifications.notifySubmissionCorrectionRequested(
      pool, sub.worker_user_id, submissionId, correctionNote
    );
  }
  return result;
}

/**
 * Ziel 4: Worker reicht korrigierten Stundenzettel ein.
 * Prüft serverseitig ob echte fachliche Änderungen vorliegen.
 */
export async function submitCorrected(pool, submissionId, workerUserId) {
  const sub = await getSubmissionWithEntries(pool, submissionId);
  if (!sub) return { error: "NOT_FOUND" };
  if (sub.worker_user_id !== workerUserId) return { error: "FORBIDDEN" };
  if (sub.status !== "needs_correction") {
    return { error: "INVALID_TRANSITION", from: sub.status, to: "submitted" };
  }
  const completion = sub.completion || computeWeeklyCompletion(sub.week_start, sub.week_end, sub.entries || []);
  if (!completion.is_complete) return { error: "INCOMPLETE_WEEK", completion };

  // Lade letzten Snapshot
  const { rows: snapEvents } = await pool.query(
    `SELECT meta FROM worker_submission_events
     WHERE submission_id = $1 AND event_type = 'correction_snapshot'
     ORDER BY created_at DESC LIMIT 1`,
    [submissionId]
  );
  const prevSnapshot = snapEvents[0]?.meta?.entries_snapshot || null;

  // Aktuelle Entries normalisieren
  // Klasse DB_WERT_NACH_UTC: identische Normalisierung wie im Snapshot oben —
  // beide Seiten muessen denselben Kalendertag liefern, sonst meldet der Vergleich
  // eine Aenderung, die keine ist (oder uebersieht eine echte).
  const currentEntries = (sub.entries || []).map(e => ({
    work_date: formatIsoDate(e.work_date),
    hours_regular: parseFloat(e.hours_regular || 0),
    hours_overtime: parseFloat(e.hours_overtime || 0),
    break_minutes: parseInt(e.break_minutes || 0, 10),
    shift_start: e.shift_start || null,
    shift_end: e.shift_end || null
  })).sort((a, b) => a.work_date.localeCompare(b.work_date));

  // Vergleich: wenn Snapshot vorhanden, prüfen ob echte Änderung
  if (prevSnapshot && Array.isArray(prevSnapshot)) {
    const hasChange = JSON.stringify(currentEntries) !== JSON.stringify(prevSnapshot);
    if (!hasChange) {
      return { error: "NO_CHANGES_DETECTED", message: "Bitte nehmen Sie zuerst fachliche \u00c4nderungen an den Eintr\u00e4gen vor." };
    }
  }

  const result = await transition(pool, submissionId, "submitted", workerUserId, {
    eventType: "corrected"
  });

  // Notification an Reviewer
  if (result.ok) {
    try {
      const workerName = `${sub.first_name || ""} ${sub.last_name || ""}`.trim() || null;
      let recipientId = sub.reviewed_by || null;
      if (!recipientId && sub.worker_assignment_link_id) {
        const { rows } = await pool.query(
          "SELECT created_by FROM worker_assignment_links WHERE id = $1",
          [sub.worker_assignment_link_id]
        );
        recipientId = rows[0]?.created_by || null;
      }
      if (recipientId) {
        await workerNotifications.notifySubmissionCorrected(pool, recipientId, submissionId, workerName);
      }
    } catch { /* non-critical */ }
  }
  return result;
}

export async function rejectSubmission(pool, submissionId, reviewerUserId, reason) {
  const sub = await getSubmission(pool, submissionId);
  const result = await transition(pool, submissionId, "rejected", reviewerUserId, {
    reviewerComment: reason,
    eventType: "rejected",
    eventNote: reason
  });
  if (result.ok && sub) {
    await workerNotifications.notifySubmissionRejected(
      pool, sub.worker_user_id, submissionId, reason
    );
  }
  return result;
}

/* ── Transfer ins bestehende Timesheet-System ───────────────────────────────── */

export async function acceptIntoTimesheet(pool, submissionId, reviewerUserId) {
  const sub = await getSubmissionWithEntries(pool, submissionId);
  if (!sub) return { error: "NOT_FOUND" };
  if (!canTransition(sub.status, "accepted_into_timesheet")) {
    return { error: "INVALID_TRANSITION", from: sub.status };
  }

  // Prüfe: bereits ein Timesheet für diese Woche/Worker?
  if (sub.timesheet_id) return { error: "TIMESHEET_ALREADY_EXISTS" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Timesheet anlegen
    const { rows: [ts] } = await client.query(
      // `source = 'worker_submission'` (Mig 156): dieser Zettel beruht auf einer
      // Meldung der Kraft selbst — es gibt einen Nachweis. Der Unterschied zur
      // direkten Erfassung ist in Abrechnung und Streitfall entscheidend.
      `INSERT INTO timesheets
         (org_id, supplier_org_id, assignment_id,
          worker_name, worker_identifier,
          week_start, week_end, status, created_by,
          notes, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,'worker_submission')
       RETURNING *`,
      [
        sub.org_id, sub.supplier_org_id, sub.assignment_id,
        `${sub.first_name || ""} ${sub.last_name || ""}`.trim() || sub.worker_email,
        sub.personnel_number || null,
        sub.week_start, sub.week_end,
        reviewerUserId,
        `Übernommen aus Worker-Einreichung ${submissionId}. ${sub.worker_comment || ""}`.trim()
      ]
    );

    // 2. Einträge übertragen
    for (const e of (sub.entries || [])) {
      await client.query(
        `INSERT INTO timesheet_entries
           (timesheet_id, work_date, hours_regular, hours_overtime,
            break_minutes, shift_start, shift_end, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (timesheet_id, work_date) DO NOTHING`,
        [ts.id, e.work_date, e.hours_regular, e.hours_overtime,
         e.break_minutes, e.shift_start, e.shift_end, e.notes]
      );
    }

    // 3. Timesheet-Totals berechnen
    await client.query(
      `UPDATE timesheets SET
         total_hours    = (SELECT COALESCE(SUM(hours_regular + hours_overtime), 0)
                           FROM timesheet_entries WHERE timesheet_id = $1),
         overtime_hours = (SELECT COALESCE(SUM(hours_overtime), 0)
                           FROM timesheet_entries WHERE timesheet_id = $1)
       WHERE id = $1`,
      [ts.id]
    );

    // 4. Submission abschließen + timesheet_id verknüpfen
    await client.query(
      `UPDATE worker_time_submissions SET
         status = 'accepted_into_timesheet',
         accepted_at = NOW(), accepted_by = $1,
         timesheet_id = $2, updated_at = NOW()
       WHERE id = $3`,
      [reviewerUserId, ts.id, submissionId]
    );

    await logEvent(client, {
      submissionId, actorId: reviewerUserId, eventType: "accepted",
      note: `Timesheet ${ts.id} erstellt`,
      meta: { timesheetId: ts.id }
    });

    await client.query("COMMIT");

    // Notification an Worker (fire-and-forget, außerhalb der Transaktion)
    const weekLabel = sub.week_start
      ? new Date(sub.week_start).toLocaleDateString("de-DE", { day:"2-digit", month:"2-digit", year:"numeric" })
      : null;
    await workerNotifications.notifySubmissionAccepted(pool, sub.worker_user_id, submissionId, weekLabel);

    return { ok: true, timesheet: ts };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/* ── Intern genehmigen ─────────────────────────────────────────────────────── */

export async function approveInternal(pool, submissionId, reviewerUserId, note) {
  const sub = await getSubmission(pool, submissionId);
  if (!sub) return { error: "NOT_FOUND" };
  // Org-Boundary: nur eigene Agentur
  const result = await transition(pool, submissionId, "approved_internal", reviewerUserId, {
    reviewerComment: note,
    eventType: "approved_internal",
    eventNote: note
  });
  if (result.ok && sub) {
    await workerNotifications.notifySubmissionAccepted(pool, sub.worker_user_id, submissionId,
      sub.week_start ? new Date(sub.week_start).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }) : null
    ).catch(swallow("workerSubmissionService"));
  }
  return result;
}

/* ── An Kunden senden ──────────────────────────────────────────────────────── */

export async function sendToCustomer(pool, submissionId, reviewerUserId, {
  customerContactName = null,
  customerContactEmail = null,
  note = null
} = {}) {
  const sub = await getSubmission(pool, submissionId);
  if (!sub) return { error: "NOT_FOUND" };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (!canTransition(sub.status, 'sent_to_customer')) {
      await client.query('ROLLBACK');
      return { error: 'INVALID_TRANSITION', from: sub.status, to: 'sent_to_customer' };
    }

    await client.query(
      `UPDATE worker_time_submissions SET
         status = 'sent_to_customer',
         sent_to_customer_at = NOW(),
         sent_to_customer_by = $1,
         customer_contact_name  = COALESCE($2, customer_contact_name),
         customer_contact_email = COALESCE($3, customer_contact_email),
         reviewer_comment = COALESCE($4, reviewer_comment),
         updated_at = NOW()
       WHERE id = $5`,
      [reviewerUserId, customerContactName, customerContactEmail, note, submissionId]
    );

    await logEvent(client, {
      submissionId, actorId: reviewerUserId, eventType: 'sent_to_customer',
      note: note || `An Kundenkontakt ${customerContactName || customerContactEmail || 'gesendet'}`,
      meta: { customerContactName, customerContactEmail }
    });

    await client.query('COMMIT');

    // Ziel 5: Notification an internen Reviewer nach Kundenversand
    try {
      const reviewerId = sub.approved_internal_by || sub.reviewed_by || null;
      if (reviewerId) {
        await workerNotifications.notifySubmissionSentToCustomer(
          pool, reviewerId, submissionId, customerContactName
        );
      }
    } catch { /* non-critical */ }

    // Ergänzung Ziel 5: Kunden-E-Mail aktiv versenden
    const resolvedEmail = customerContactEmail || sub.customer_contact_email || null;
    let customerNotified = false;
    if (resolvedEmail) {
      try {
        const workerName = `${sub.first_name || ''} ${sub.last_name || ''}`.trim() || null;
        const fmtDate = (d) => d ? new Date(d).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }) : '\u2013';
        const baseUrl = config.BASE_URL || 'https://app.tempconnect.de';

        const html = timesheetSentToCustomerEmail({
          customerName: customerContactName || sub.customer_contact_name || null,
          supplierName: sub.supplier_name || null,
          workerName,
          weekStart: fmtDate(sub.week_start),
          weekEnd: fmtDate(sub.week_end),
          totalHours: sub.total_hours,
          overtimeHours: sub.overtime_hours,
          note: note || null,
          actionUrl: `${baseUrl}/public/worker-submissions-review.html`
        });

        await sendMail({
          to: resolvedEmail,
          subject: `Stundenzettel zur Pr\u00fcfung \u2014 ${fmtDate(sub.week_start)} bis ${fmtDate(sub.week_end)}`,
          html
        });
        customerNotified = true;

        // Audit: customer_notified Event
        const auditClient = await pool.connect();
        try {
          await auditClient.query(
            `INSERT INTO worker_submission_events (submission_id, actor_id, event_type, note, meta)
             VALUES ($1, $2, 'sent_to_customer', $3, $4)`,
            [submissionId, reviewerUserId, `Kunde per E-Mail benachrichtigt: ${resolvedEmail}`,
             JSON.stringify({ customer_email: resolvedEmail, customer_name: customerContactName, notified: true })]
          );
        } catch { /* non-critical */ } finally { auditClient.release(); }
      } catch (emailErr) {
        // E-Mail-Fehler loggen, aber Prozess nicht blockieren
        const auditClient = await pool.connect();
        try {
          await auditClient.query(
            `INSERT INTO worker_submission_events (submission_id, actor_id, event_type, note, meta)
             VALUES ($1, $2, 'sent_to_customer', $3, $4)`,
            [submissionId, reviewerUserId, `Kundenbenachrichtigung fehlgeschlagen: ${emailErr?.message || 'Unbekannt'}`,
             JSON.stringify({ customer_email: resolvedEmail, notified: false, error: emailErr?.message })]
          );
        } catch { /* non-critical */ } finally { auditClient.release(); }
      }
    } else {
      // Kein Kundenkontakt verfügbar — nachvollziehbar dokumentieren
      const auditClient = await pool.connect();
      try {
        await auditClient.query(
          `INSERT INTO worker_submission_events (submission_id, actor_id, event_type, note, meta)
           VALUES ($1, $2, 'sent_to_customer', $3, $4)`,
          [submissionId, reviewerUserId, 'Keine Kundenkontakt-E-Mail verf\u00fcgbar \u2013 Kundenbenachrichtigung \u00fcbersprungen.',
           JSON.stringify({ notified: false, reason: 'no_customer_email' })]
        );
      } catch { /* non-critical */ } finally { auditClient.release(); }
    }

    return { ok: true, from: sub.status, to: 'sent_to_customer', customer_notified: customerNotified, customer_email: resolvedEmail || null };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/* ── Kundenbestätigung

export async function confirmByCustomer(pool, submissionId, actorUserId, {
  customerConfirmedBy = null,
  note = null
} = {}) {
  const sub = await getSubmission(pool, submissionId);
  if (!sub) return { error: 'NOT_FOUND' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (!canTransition(sub.status, 'customer_confirmed')) {
      await client.query('ROLLBACK');
      return { error: 'INVALID_TRANSITION', from: sub.status, to: 'customer_confirmed' };
    }

    await client.query(
      `UPDATE worker_time_submissions SET
         status = 'customer_confirmed',
         customer_confirmed_at = NOW(),
         customer_confirmed_by = $1,
         customer_note = COALESCE($2, customer_note),
         updated_at = NOW()
       WHERE id = $3`,
      [customerConfirmedBy, note, submissionId]
    );

    await logEvent(client, {
      submissionId, actorId: actorUserId, eventType: 'customer_confirmed',
      note: note || `Vom Kunden bestätigt${customerConfirmedBy ? ' durch ' + customerConfirmedBy : ''}`,
      meta: { customerConfirmedBy }
    });

    await client.query('COMMIT');
    return { ok: true, from: sub.status, to: 'customer_confirmed' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/* ── Vom Kunden abgelehnt ──────────────────────────────────────────────────── */

export async function rejectByCustomer(pool, submissionId, actorUserId, {
  customerConfirmedBy = null,
  note = null
} = {}) {
  const sub = await getSubmission(pool, submissionId);
  if (!sub) return { error: 'NOT_FOUND' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (!canTransition(sub.status, 'customer_rejected')) {
      await client.query('ROLLBACK');
      return { error: 'INVALID_TRANSITION', from: sub.status, to: 'customer_rejected' };
    }

    await client.query(
      `UPDATE worker_time_submissions SET
         status = 'customer_rejected',
         customer_rejected_at = NOW(),
         customer_note = $1,
         updated_at = NOW()
       WHERE id = $2`,
      [note, submissionId]
    );

    await logEvent(client, {
      submissionId, actorId: actorUserId, eventType: 'customer_rejected',
      note: note || 'Vom Kunden abgelehnt',
      meta: { customerConfirmedBy }
    });

    // Worker benachrichtigen
    if (sub.worker_user_id) {
      await workerNotifications.notifySubmissionCorrectionRequested(
        pool, sub.worker_user_id, submissionId,
        `Kundenseitig abgelehnt: ${note || 'Bitte Rücksprache mit Disponenten.'}`
      ).catch(swallow("workerSubmissionService"));
    }

    await client.query('COMMIT');
    return { ok: true, from: sub.status, to: 'customer_rejected' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/* ── In Abrechnung übernehmen (posted_to_timesheet) ───────────────────────── */

export async function postToTimesheet(pool, submissionId, reviewerUserId) {
  const sub = await getSubmissionWithEntries(pool, submissionId);
  if (!sub) return { error: 'NOT_FOUND' };
  if (!canTransition(sub.status, 'posted_to_timesheet')) {
    return { error: 'INVALID_TRANSITION', from: sub.status };
  }
  if (sub.timesheet_id) return { error: 'TIMESHEET_ALREADY_EXISTS' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Timesheet anlegen
    const { rows: [ts] } = await client.query(
      // `source = 'worker_submission'` (Mig 156) — siehe oben.
      `INSERT INTO timesheets
         (org_id, supplier_org_id, assignment_id,
          worker_name, worker_identifier,
          week_start, week_end, status, created_by, notes, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'submitted',$8,$9,'worker_submission')
       RETURNING *`,
      [
        sub.org_id, sub.supplier_org_id, sub.assignment_id,
        `${sub.first_name || ''} ${sub.last_name || ''}`.trim() || sub.worker_email,
        sub.personnel_number || null,
        sub.week_start, sub.week_end,
        reviewerUserId,
        `Übernommen aus Worker-Einreichung ${submissionId}. Kundenfreigabe am ${new Date().toLocaleDateString('de-DE')}. ${sub.worker_comment || ''}`.trim()
      ]
    );

    // Einträge übertragen
    for (const e of (sub.entries || [])) {
      await client.query(
        `INSERT INTO timesheet_entries
           (timesheet_id, work_date, hours_regular, hours_overtime,
            break_minutes, shift_start, shift_end, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (timesheet_id, work_date) DO NOTHING`,
        [ts.id, e.work_date, e.hours_regular, e.hours_overtime,
         e.break_minutes, e.shift_start, e.shift_end, e.notes]
      );
    }

    // Timesheet-Totals
    await client.query(
      `UPDATE timesheets SET
         total_hours    = (SELECT COALESCE(SUM(hours_regular + hours_overtime), 0)
                           FROM timesheet_entries WHERE timesheet_id = $1),
         overtime_hours = (SELECT COALESCE(SUM(hours_overtime), 0)
                           FROM timesheet_entries WHERE timesheet_id = $1)
       WHERE id = $1`,
      [ts.id]
    );

    // Submission abschließen
    await client.query(
      `UPDATE worker_time_submissions SET
         status = 'posted_to_timesheet',
         posted_to_timesheet_at = NOW(),
         posted_to_timesheet_by = $1,
         timesheet_id = $2,
         updated_at = NOW()
       WHERE id = $3`,
      [reviewerUserId, ts.id, submissionId]
    );

    await logEvent(client, {
      submissionId, actorId: reviewerUserId, eventType: 'posted_to_timesheet',
      note: `Timesheet ${ts.id} erstellt und zur Abrechnung übergeben`,
      meta: { timesheetId: ts.id }
    });

    await client.query('COMMIT');

    await workerNotifications.notifySubmissionAccepted(
      pool, sub.worker_user_id, submissionId,
      sub.week_start ? new Date(sub.week_start).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }) : null
    ).catch(swallow("workerSubmissionService"));

    return { ok: true, timesheet: ts };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/* ── Kommentar hinzufügen ──────────────────────────────────────────────────── */

export async function addComment(pool, submissionId, actorId, note) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await logEvent(client, { submissionId, actorId, eventType: "comment_added", note });
    // Reviewer-Kommentar aktualisieren wenn Reviewer
    await client.query(
      `UPDATE worker_time_submissions SET reviewer_comment = $1, updated_at=NOW() WHERE id = $2`,
      [note, submissionId]
    );
    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/* ── KPI-Übersicht für Supplier-Dashboard ───────────────────────────────────── */

export async function getSupplierSubmissionKPIs(pool, supplierOrgId) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'submitted')                                                     AS pending_review,
       COUNT(*) FILTER (WHERE status = 'under_review')                                                  AS in_review,
       COUNT(*) FILTER (WHERE status = 'needs_correction')                                              AS needs_correction,
       COUNT(*) FILTER (WHERE status = 'approved_internal')                                             AS approved_internal,
       COUNT(*) FILTER (WHERE status = 'sent_to_customer')                                              AS sent_to_customer,
       COUNT(*) FILTER (WHERE status IN ('customer_confirmed','posted_to_timesheet','accepted_into_timesheet')) AS confirmed,
       COUNT(*) FILTER (WHERE status = 'customer_rejected')                                             AS customer_rejected,
       COUNT(*) FILTER (WHERE status = 'rejected')                                                      AS rejected,
       COUNT(*) FILTER (WHERE status = 'posted_to_timesheet')                                           AS posted,
       COUNT(*) FILTER (WHERE week_start >= DATE_TRUNC('week', NOW()))                                  AS this_week
     FROM worker_time_submissions
     WHERE supplier_org_id = $1`,
    [supplierOrgId]
  );
  return rows[0] || {};
}

/* ── Agentur-Sicht: alle Einreichungen mit Filtern ──────────────────────────── */

export async function listAgencySubmissions(pool, {
  supplierOrgId,
  orgId       = null,
  assignmentId = null,
  workerSearch = null,
  status      = null,
  weekFrom    = null,
  weekTo      = null,
  limit       = 100,
  offset      = 0
}) {
  const params = [supplierOrgId];
  const conditions = ['wts.supplier_org_id = $1'];

  if (orgId)        { params.push(orgId);        conditions.push(`wts.org_id = $${params.length}`); }
  if (assignmentId) { params.push(assignmentId); conditions.push(`wts.assignment_id = $${params.length}`); }
  if (status) {
    // Status kann kommagetrennte Liste sein: "submitted,under_review"
    const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
    params.push(statuses);
    conditions.push(`wts.status = ANY($${params.length})`);
  }
  if (weekFrom) { params.push(weekFrom); conditions.push(`wts.week_start >= $${params.length}`); }
  if (weekTo)   { params.push(weekTo);   conditions.push(`wts.week_start <= $${params.length}`); }
  if (workerSearch) {
    params.push(`%${workerSearch}%`);
    const n = params.length;
    conditions.push(`(wp.first_name ILIKE $${n} OR wp.last_name ILIKE $${n} OR u.email ILIKE $${n} OR wp.personnel_number ILIKE $${n})`);
  }

  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT
       wts.id, wts.worker_user_id, wts.assignment_id,
       wts.org_id, wts.supplier_org_id,
       wts.week_start, wts.week_end,
       wts.total_hours, wts.overtime_hours,
       wts.status, wts.submitted_at, wts.reviewed_at,
       wts.approved_internal_at, wts.sent_to_customer_at,
       wts.customer_confirmed_at, wts.customer_rejected_at,
       wts.posted_to_timesheet_at,
       wts.worker_comment, wts.reviewer_comment, wts.correction_note,
       wts.customer_note, wts.customer_contact_name, wts.customer_contact_email,
       wts.customer_bundle_key, wts.customer_bundle_ref, wts.customer_bundle_status,
       wts.customer_bundle_period_from, wts.customer_bundle_period_to,
       wts.customer_bundle_sent_at, wts.customer_bundle_sent_by,
       wts.timesheet_id, wts.template_id,
       wts.created_at, wts.updated_at,
       wts.submission_deadline, wts.submitted_late,
       (wts.submission_deadline IS NOT NULL
         AND wts.status IN ('draft','needs_correction')
         AND CURRENT_DATE > wts.submission_deadline) AS is_overdue,
       wp.first_name, wp.last_name, wp.personnel_number,
       u.email AS worker_email,
       o.name   AS client_name,
       so.name  AS supplier_name,
       a.worker_description AS assignment_description,
       a.start_date AS asg_start, a.planned_end_date AS asg_end,
       -- Planungsdaten für Vergleich
       wal.default_shift_start, wal.default_shift_end, wal.default_break_minutes,
       wal.default_hours_per_day
     FROM worker_time_submissions wts
     JOIN users u ON u.id = wts.worker_user_id
     LEFT JOIN worker_profiles wp ON wp.user_id = wts.worker_user_id
     LEFT JOIN organizations o  ON o.id  = wts.org_id
     LEFT JOIN organizations so ON so.id = wts.supplier_org_id
     LEFT JOIN assignments a    ON a.id  = wts.assignment_id
     LEFT JOIN worker_assignment_links wal ON wal.worker_user_id = wts.worker_user_id
                                          AND wal.assignment_id = wts.assignment_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY wts.week_start DESC, wts.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

export async function previewCustomerBundles(pool, {
  supplierOrgId,
  orgId = null,
  periodMode = "week",
  weekFrom = null,
  weekTo = null
}) {
  const params = [supplierOrgId];
  const cond = ["wts.supplier_org_id = $1", "wts.status = 'approved_internal'"];
  if (orgId) { params.push(orgId); cond.push(`wts.org_id = $${params.length}`); }
  if (weekFrom) { params.push(weekFrom); cond.push(`wts.week_start >= $${params.length}`); }
  if (weekTo) { params.push(weekTo); cond.push(`wts.week_start <= $${params.length}`); }

  const { rows } = await pool.query(
    `SELECT
       wts.id, wts.org_id, wts.week_start, wts.week_end, wts.total_hours, wts.status,
       o.name AS client_name
     FROM worker_time_submissions wts
     LEFT JOIN organizations o ON o.id = wts.org_id
     WHERE ${cond.join(" AND ")}
     ORDER BY wts.org_id, wts.week_start ASC, wts.created_at ASC`,
    params
  );

  const grouped = new Map();
  for (const r of rows) {
    const periodKey = periodKeyFromWeekStart(r.week_start, periodMode);
    const bundleKey = buildBundleKey(r.org_id, periodMode, periodKey);
    const k = bundleKey;
    if (!grouped.has(k)) {
      grouped.set(k, {
        bundle_key: bundleKey,
        period_mode: normalizePeriodMode(periodMode),
        period_key: periodKey,
        org_id: r.org_id,
        client_name: r.client_name || null,
        submission_count: 0,
        total_hours: 0,
        earliest_week_start: r.week_start,
        latest_week_end: r.week_end,
        submission_ids: []
      });
    }
    const g = grouped.get(k);
    g.submission_count += 1;
    g.total_hours += Number(r.total_hours || 0);
    if (r.week_start < g.earliest_week_start) g.earliest_week_start = r.week_start;
    if (r.week_end > g.latest_week_end) g.latest_week_end = r.week_end;
    g.submission_ids.push(r.id);
  }

  return Array.from(grouped.values()).sort((a, b) => String(a.period_key).localeCompare(String(b.period_key)));
}

export async function sendBundleToCustomer(pool, {
  supplierOrgId,
  actorId,
  orgId,
  periodMode = "week",
  periodKey,
  submissionIds = [],
  customerContactName = null,
  customerContactEmail = null,
  bundleRef = null,
  note = null
}) {
  const mode = normalizePeriodMode(periodMode);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let rows = [];
    let targetOrgId = orgId || null;
    let targetPeriodKey = periodKey || null;
    const requestedIds = Array.isArray(submissionIds)
      ? Array.from(new Set(submissionIds.filter(Boolean)))
      : [];

    if (requestedIds.length > 0) {
      const { rows: selected } = await client.query(
        `SELECT id, org_id, week_start, week_end, status
         FROM worker_time_submissions
         WHERE supplier_org_id = $1
           AND id = ANY($2::uuid[])
         FOR UPDATE`,
        [supplierOrgId, requestedIds]
      );
      rows = selected;

      const foundIds = new Set(rows.map((row) => row.id));
      const missingSubmissionIds = requestedIds.filter((id) => !foundIds.has(id));
      if (missingSubmissionIds.length) {
        await client.query("ROLLBACK");
        return {
          error: "BUNDLE_SELECTION_INVALID",
          reason: "MISSING_SUBMISSIONS",
          missing_submission_ids: missingSubmissionIds
        };
      }

      const actualOrgIds = Array.from(new Set(rows.map((row) => row.org_id)));
      const actualPeriodKeys = Array.from(new Set(rows.map((row) => periodKeyFromWeekStart(row.week_start, mode))));
      const canonicalOrgId = actualOrgIds[0] || null;
      const canonicalPeriodKey = actualPeriodKeys[0] || null;
      targetOrgId = targetOrgId || canonicalOrgId;
      targetPeriodKey = targetPeriodKey || canonicalPeriodKey;

      if (actualOrgIds.length > 1 || (targetOrgId && canonicalOrgId !== targetOrgId)) {
        await client.query("ROLLBACK");
        return {
          error: "BUNDLE_SCOPE_MISMATCH",
          scope: "org_id",
          expected_org_id: targetOrgId,
          actual_org_ids: actualOrgIds,
          expected_period_key: targetPeriodKey,
          actual_period_keys: actualPeriodKeys
        };
      }

      if (actualPeriodKeys.length > 1 || (targetPeriodKey && canonicalPeriodKey !== targetPeriodKey)) {
        await client.query("ROLLBACK");
        return {
          error: "BUNDLE_SCOPE_MISMATCH",
          scope: "period_key",
          expected_org_id: targetOrgId,
          actual_org_ids: actualOrgIds,
          expected_period_key: targetPeriodKey,
          actual_period_keys: actualPeriodKeys
        };
      }

      const invalidSubmissions = rows
        .filter((row) => row.status !== "approved_internal")
        .map((row) => ({ id: row.id, status: row.status }));
      if (invalidSubmissions.length) {
        await client.query("ROLLBACK");
        return {
          error: "BUNDLE_SELECTION_INVALID",
          reason: "INELIGIBLE_STATUS",
          expected_status: "approved_internal",
          invalid_submissions: invalidSubmissions
        };
      }
    } else {
      if (!orgId || !periodKey) {
        await client.query("ROLLBACK");
        return { error: "BUNDLE_SCOPE_REQUIRED" };
      }
      const { rows: selected } = await client.query(
        `SELECT id, org_id, week_start, week_end, status
         FROM worker_time_submissions
         WHERE supplier_org_id = $1
           AND org_id = $2
           AND status = 'approved_internal'
         FOR UPDATE`,
        [supplierOrgId, orgId]
      );
      rows = selected.filter((r) => periodKeyFromWeekStart(r.week_start, mode) === periodKey);
    }

    if (!rows.length) {
      await client.query("ROLLBACK");
      return { error: "NO_ELIGIBLE_SUBMISSIONS" };
    }

    const bundleKey = buildBundleKey(targetOrgId, mode, targetPeriodKey);
    const eligible = requestedIds.length > 0
      ? rows
      : rows.filter((r) => r.status === "approved_internal");
    if (!eligible.length) {
      await client.query("ROLLBACK");
      return { error: "NO_ELIGIBLE_SUBMISSIONS" };
    }

    const ids = eligible.map((r) => r.id);
    const periodFrom = eligible.reduce((acc, r) => (!acc || r.week_start < acc ? r.week_start : acc), null);
    const periodTo = eligible.reduce((acc, r) => (!acc || r.week_end > acc ? r.week_end : acc), null);

    await client.query(
      `UPDATE worker_time_submissions
       SET status = 'sent_to_customer',
           sent_to_customer_at = NOW(),
           sent_to_customer_by = $1,
           customer_contact_name = COALESCE($2, customer_contact_name),
           customer_contact_email = COALESCE($3, customer_contact_email),
           reviewer_comment = COALESCE($4, reviewer_comment),
           customer_bundle_key = $5,
           customer_bundle_ref = COALESCE($6, customer_bundle_ref),
           customer_bundle_status = 'sent',
           customer_bundle_period_from = $7,
           customer_bundle_period_to = $8,
           customer_bundle_sent_at = NOW(),
           customer_bundle_sent_by = $1,
           updated_at = NOW()
       WHERE id = ANY($9::uuid[])`,
      [actorId, customerContactName, customerContactEmail, note, bundleKey, bundleRef, periodFrom, periodTo, ids]
    );

    await client.query(
      `INSERT INTO worker_submission_events (submission_id, actor_id, event_type, note, meta)
       SELECT x.id, $1, 'sent_to_customer', $2, jsonb_build_object('bundleKey', $3, 'bundleRef', $4)
       FROM unnest($5::uuid[]) AS x(id)`,
      [actorId, note || "Sammelversand an Kunden", bundleKey, bundleRef, ids]
    );

    await client.query("COMMIT");
    return {
      ok: true,
      bundle_key: bundleKey,
      bundle_ref: bundleRef || null,
      period_mode: mode,
      period_key: targetPeriodKey,
      submission_count: ids.length
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listSentBundles(pool, {
  supplierOrgId,
  orgId = null
}) {
  const params = [supplierOrgId];
  const cond = ["wts.supplier_org_id = $1", "wts.customer_bundle_key IS NOT NULL"];
  if (orgId) { params.push(orgId); cond.push(`wts.org_id = $${params.length}`); }

  const { rows } = await pool.query(
    `SELECT
       wts.customer_bundle_key,
       wts.customer_bundle_ref,
       wts.customer_bundle_status,
       wts.customer_bundle_period_from,
       wts.customer_bundle_period_to,
       wts.customer_bundle_sent_at,
       wts.org_id,
       o.name AS client_name,
       COUNT(*) AS submission_count,
       COUNT(*) FILTER (WHERE wts.status = 'sent_to_customer') AS sent_count,
       COUNT(*) FILTER (WHERE wts.status = 'customer_confirmed') AS customer_confirmed_count,
       COUNT(*) FILTER (WHERE wts.status = 'customer_rejected') AS customer_rejected_count,
       COUNT(*) FILTER (WHERE wts.status = 'posted_to_timesheet') AS posted_count,
       SUM(wts.total_hours) AS total_hours
     FROM worker_time_submissions wts
     LEFT JOIN organizations o ON o.id = wts.org_id
     WHERE ${cond.join(" AND ")}
     GROUP BY
       wts.customer_bundle_key, wts.customer_bundle_ref, wts.customer_bundle_status,
       wts.customer_bundle_period_from, wts.customer_bundle_period_to, wts.customer_bundle_sent_at,
       wts.org_id, o.name
     ORDER BY COALESCE(wts.customer_bundle_sent_at, NOW()) DESC`,
    params
  );
  return rows;
}

export async function getBundleDetails(pool, {
  supplierOrgId,
  bundleKey
}) {
  const { rows } = await pool.query(
    `SELECT
       wts.id, wts.org_id, wts.week_start, wts.week_end, wts.total_hours, wts.overtime_hours,
       wts.status, wts.worker_user_id, wts.assignment_id, wts.timesheet_id,
       wts.customer_bundle_key, wts.customer_bundle_ref, wts.customer_bundle_status,
       wts.customer_bundle_period_from, wts.customer_bundle_period_to, wts.customer_bundle_sent_at,
       wp.first_name, wp.last_name, wp.personnel_number, u.email AS worker_email,
       o.name AS client_name
     FROM worker_time_submissions wts
     JOIN users u ON u.id = wts.worker_user_id
     LEFT JOIN worker_profiles wp ON wp.user_id = wts.worker_user_id
     LEFT JOIN organizations o ON o.id = wts.org_id
     WHERE wts.supplier_org_id = $1
       AND wts.customer_bundle_key = $2
     ORDER BY wts.week_start ASC, wts.created_at ASC`,
    [supplierOrgId, bundleKey]
  );
  return rows;
}

export async function postBundleToTimesheets(pool, {
  supplierOrgId,
  bundleKey,
  actorId
}) {
  const items = await getBundleDetails(pool, { supplierOrgId, bundleKey });
  if (!items.length) return { error: "NOT_FOUND" };

  const eligible = items.filter((x) => x.status === "customer_confirmed");
  if (!eligible.length) return { error: "NO_ELIGIBLE_SUBMISSIONS" };

  const results = [];
  for (const item of eligible) {
    const r = await postToTimesheet(pool, item.id, actorId);
    results.push({ submission_id: item.id, ok: !!r.ok, error: r.error || null, timesheet_id: r.timesheet?.id || null });
  }

  const allOk = results.every((r) => r.ok);
  const bundleStatus = allOk ? "confirmed" : "partially_confirmed";
  await pool.query(
    `UPDATE worker_time_submissions
     SET customer_bundle_status = $1, updated_at = NOW()
     WHERE supplier_org_id = $2 AND customer_bundle_key = $3`,
    [bundleStatus, supplierOrgId, bundleKey]
  );

  return {
    ok: true,
    bundle_key: bundleKey,
    bundle_status: bundleStatus,
    processed: results.length,
    results
  };
}
