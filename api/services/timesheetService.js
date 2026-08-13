/**
 * Timesheet Service – Stundenzettel / Zeiterfassung fuer Zeitarbeitseinsaetze.
 * Baut auf assignments auf. Feature-gated fuer PRO / ENTERPRISE.
 *
 * Statusmodell: draft -> submitted -> approved | rejected
 *                      \-> cancelled (solange noch nicht approved)
 */

import * as auditLog from './auditLog.js';
import { getTemplateForAssignment } from './timesheetTemplateService.js';
import { withTransaction } from '../utils/transaction.js';
import { dateOnlyDE } from '../utils/dateDE.js';

/* ── Hilfsfunktionen ────────────────────────────────────────────────────────── */

/** Erlaubte Status-Uebergaenge */
const VALID_TRANSITIONS = {
  draft:     ['submitted', 'cancelled'],
  submitted: ['approved', 'rejected', 'draft'],   // draft = Rueckziehen
  approved:  [],                                   // gesperrt
  rejected:  ['draft'],                            // Korrektur moeglich
  cancelled: []
};

function assertTransition(from, to) {
  const allowed = VALID_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    return { error: 'INVALID_TRANSITION', from, to, allowed };
  }
  return null;
}

/** Gesamtstunden aus entries berechnen */
async function recalcTotals(pool, timesheetId) {
  const { rows } = await pool.query(
    `UPDATE timesheets ts
     SET total_hours    = COALESCE((
           SELECT SUM(e.hours_regular + e.hours_overtime)
           FROM timesheet_entries e WHERE e.timesheet_id = ts.id
         ), 0),
         overtime_hours = COALESCE((
           SELECT SUM(e.hours_overtime)
           FROM timesheet_entries e WHERE e.timesheet_id = ts.id
         ), 0),
         updated_at = NOW()
     WHERE ts.id = $1
     RETURNING id, total_hours, overtime_hours`,
    [timesheetId]
  );
  return rows[0];
}

/* ── CRUD ───────────────────────────────────────────────────────────────────── */

export async function createTimesheet(pool, data) {
  // week_end muss nach week_start liegen
  if (data.week_end < data.week_start) {
    return { error: 'INVALID_DATE_RANGE', message: 'week_end muss nach week_start liegen' };
  }

  // Assignment validieren wenn angegeben
  if (data.assignment_id) {
    const { rows: aRows } = await pool.query(
      `SELECT id, org_id, supplier_org_id, status
       FROM assignments WHERE id = $1`, [data.assignment_id]
    );
    const a = aRows[0];
    if (!a) return { error: 'ASSIGNMENT_NOT_FOUND' };
    if (a.status === 'cancelled') return { error: 'ASSIGNMENT_CANCELLED' };
    // Org-Boundary: Anfragender muss buyer oder supplier des Assignments sein
    if (data.org_id && a.org_id !== data.org_id && a.supplier_org_id !== data.org_id) {
      return { error: 'ORG_BOUNDARY_VIOLATION' };
    }
  }

  const ts = await withTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO timesheets
         (org_id, supplier_org_id, assignment_id, worker_name, worker_identifier,
          week_start, week_end, notes, created_by, status, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10)
       RETURNING *`,
      [
        data.org_id, data.supplier_org_id, data.assignment_id || null,
        data.worker_name, data.worker_identifier || null,
        data.week_start, data.week_end, data.notes || null,
        data.created_by || null,
        // Herkunft (Mig 156): dieser Weg ist die direkte Erfassung — der Name der Kraft
        // ist Freitext, es gibt keine Worker-Meldung dagegen. Aufrufer, die aus einer
        // freigegebenen Meldung heraus anlegen, geben 'worker_submission' mit.
        data.source === 'worker_submission' ? 'worker_submission' : 'manual'
      ]
    );
    const row = rows[0];
    await auditLog.writeAudit(client, {
      action: 'timesheet.created', entity_type: 'timesheet', entity_id: row.id,
      actor_id: data.created_by,
      details: { org_id: row.org_id, supplier_org_id: row.supplier_org_id, worker_name: row.worker_name, week_start: row.week_start, source: row.source }
    });
    return row;
  });
  return { timesheet: ts };
}

export async function getTimesheet(pool, id) {
  const { rows } = await pool.query(
    `SELECT ts.*,
            o.name  AS org_name,
            so.name AS supplier_org_name,
            a.worker_description AS assignment_description,
            a.start_date AS assignment_start,
            a.planned_end_date AS assignment_end,
            ub.email AS submitted_by_email,
            ua.email AS approved_by_email,
            ur.email AS rejected_by_email
     FROM timesheets ts
     LEFT JOIN organizations o  ON o.id  = ts.org_id
     LEFT JOIN organizations so ON so.id = ts.supplier_org_id
     LEFT JOIN assignments a    ON a.id  = ts.assignment_id
     LEFT JOIN users ub ON ub.id = ts.submitted_by
     LEFT JOIN users ua ON ua.id = ts.approved_by
     LEFT JOIN users ur ON ur.id = ts.rejected_by
     WHERE ts.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function getTimesheetWithEntries(pool, id) {
  const ts = await getTimesheet(pool, id);
  if (!ts) return null;
  const { rows: entries } = await pool.query(
    `SELECT * FROM timesheet_entries WHERE timesheet_id = $1 ORDER BY work_date ASC`,
    [id]
  );
  ts.entries = entries;
  return ts;
}

export async function listTimesheets(pool, filters = {}) {
  const params = [];
  const where = [];
  let idx = 1;

  // Org-Sicht: ein Stundenzettel hat ZWEI Seiten — den Kunden (`org_id`) und den
  // Lieferanten (`supplier_org_id`). `member_org_id` bedeutet "meine Org ist eine
  // der beiden Seiten" und ist die richtige Klammer fuer "zeig mir meine
  // Stundenzettel".
  //
  // WARUM DAS HIER STEHT: die Liste filterte frueher nur auf `org_id`. Eine
  // Agentur, die einen Zettel selbst angelegt hatte, sah ihn in
  // `GET /api/timesheets` **nicht** — waehrend `GET /api/timesheets/:id` ihn per
  // `checkOrgBoundary` (beide Seiten) sehr wohl herausgab. Man konnte einen
  // Datensatz oeffnen, den man nicht finden konnte. Kein Leck, aber die
  // Lieferantenseite der Strecke war praktisch unbenutzbar.
  if (filters.member_org_id) {
    where.push(`(ts.org_id = $${idx} OR ts.supplier_org_id = $${idx})`);
    params.push(filters.member_org_id);
    idx++;
  }
  if (filters.org_id)          { where.push(`ts.org_id = $${idx}`);          params.push(filters.org_id);          idx++; }
  if (filters.supplier_org_id) { where.push(`ts.supplier_org_id = $${idx}`); params.push(filters.supplier_org_id); idx++; }
  if (filters.assignment_id)   { where.push(`ts.assignment_id = $${idx}`);   params.push(filters.assignment_id);   idx++; }
  if (filters.status)          { where.push(`ts.status = $${idx}`);          params.push(filters.status);          idx++; }
  if (filters.worker_name)     { where.push(`ts.worker_name ILIKE $${idx}`); params.push(`%${filters.worker_name}%`); idx++; }
  if (filters.week_start_from) { where.push(`ts.week_start >= $${idx}`);     params.push(filters.week_start_from); idx++; }
  if (filters.week_start_to)   { where.push(`ts.week_start <= $${idx}`);     params.push(filters.week_start_to);   idx++; }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(500, filters.limit || 100);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT ts.*,
            o.name  AS org_name,
            so.name AS supplier_org_name
     FROM timesheets ts
     LEFT JOIN organizations o  ON o.id  = ts.org_id
     LEFT JOIN organizations so ON so.id = ts.supplier_org_id
     ${whereClause}
     ORDER BY ts.week_start DESC, ts.created_at DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

export function listTimesheetsForAssignment(pool, assignmentId, filters = {}) {
  return listTimesheets(pool, { ...filters, assignment_id: assignmentId });
}

export async function updateTimesheet(pool, id, data, actorId) {
  const ts = await getTimesheet(pool, id);
  if (!ts) return { error: 'NOT_FOUND' };
  if (ts.status !== 'draft') return { error: 'NOT_EDITABLE', status: ts.status };

  const allowed = ['worker_name', 'worker_identifier', 'week_start', 'week_end', 'notes', 'assignment_id'];
  const fields = [];
  const values = [id];
  let idx = 2;

  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(data[key]);
      idx++;
    }
  }
  if (fields.length === 0) return { timesheet: ts };

  fields.push('updated_at = NOW()');
  const { rows } = await pool.query(
    `UPDATE timesheets SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
    values
  );
  await auditLog.writeAudit(pool, {
    action: 'timesheet.updated', entity_type: 'timesheet', entity_id: id,
    actor_id: actorId, details: { changed_fields: Object.keys(data).filter(k => allowed.includes(k)) }
  });
  return { timesheet: rows[0] };
}

/* ── Lifecycle ──────────────────────────────────────────────────────────────── */

export async function submitTimesheet(pool, id, actorId) {
  const ts = await getTimesheet(pool, id);
  if (!ts) return { error: 'NOT_FOUND' };
  const err = assertTransition(ts.status, 'submitted');
  if (err) return err;
  if (ts.total_hours <= 0) return { error: 'NO_HOURS', message: 'Stundenzettel enthaelt keine Stunden.' };

  return withTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `UPDATE timesheets
       SET status = 'submitted', submitted_at = NOW(), submitted_by = $2, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, actorId]
    );
    await auditLog.writeAudit(client, {
      action: 'timesheet.submitted', entity_type: 'timesheet', entity_id: id,
      actor_id: actorId, details: { total_hours: ts.total_hours, worker_name: ts.worker_name }
    });
    return { timesheet: rows[0] };
  });
}

export async function approveTimesheet(pool, id, actorId) {
  const ts = await getTimesheet(pool, id);
  if (!ts) return { error: 'NOT_FOUND' };
  const err = assertTransition(ts.status, 'approved');
  if (err) return err;

  return withTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `UPDATE timesheets
       SET status = 'approved', approved_at = NOW(), approved_by = $2, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, actorId]
    );
    await auditLog.writeAudit(client, {
      action: 'timesheet.approved', entity_type: 'timesheet', entity_id: id,
      actor_id: actorId, details: { total_hours: ts.total_hours, worker_name: ts.worker_name }
    });
    return { timesheet: rows[0] };
  });
}

export async function rejectTimesheet(pool, id, actorId, reason) {
  const ts = await getTimesheet(pool, id);
  if (!ts) return { error: 'NOT_FOUND' };
  const err = assertTransition(ts.status, 'rejected');
  if (err) return err;

  return withTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `UPDATE timesheets
       SET status = 'rejected', rejected_at = NOW(), rejected_by = $2,
           rejection_reason = $3, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, actorId, reason || null]
    );
    await auditLog.writeAudit(client, {
      action: 'timesheet.rejected', entity_type: 'timesheet', entity_id: id,
      actor_id: actorId, details: { rejection_reason: reason, worker_name: ts.worker_name }
    });
    return { timesheet: rows[0] };
  });
}

export async function cancelTimesheet(pool, id, actorId) {
  const ts = await getTimesheet(pool, id);
  if (!ts) return { error: 'NOT_FOUND' };
  const err = assertTransition(ts.status, 'cancelled');
  if (err) return err;

  return withTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `UPDATE timesheets
       SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $2, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, actorId]
    );
    await auditLog.writeAudit(client, {
      action: 'timesheet.cancelled', entity_type: 'timesheet', entity_id: id,
      actor_id: actorId, details: { worker_name: ts.worker_name }
    });
    return { timesheet: rows[0] };
  });
}

export async function returnToDraft(pool, id, actorId) {
  const ts = await getTimesheet(pool, id);
  if (!ts) return { error: 'NOT_FOUND' };
  const err = assertTransition(ts.status, 'draft');
  if (err) return err;

  return withTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `UPDATE timesheets
       SET status = 'draft',
           submitted_at = NULL, submitted_by = NULL,
           rejected_at = NULL,  rejected_by = NULL, rejection_reason = NULL,
           updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );
    await auditLog.writeAudit(client, {
      action: 'timesheet.returned_to_draft', entity_type: 'timesheet', entity_id: id,
      actor_id: actorId, details: { from_status: ts.status }
    });
    return { timesheet: rows[0] };
  });
}

/* ── Tages-Eintraege ────────────────────────────────────────────────────────── */

export async function addEntry(pool, timesheetId, data, _actorId) {
  // Nur in draft erlaubt
  const ts = await getTimesheet(pool, timesheetId);
  if (!ts) return { error: 'NOT_FOUND' };
  if (ts.status !== 'draft') return { error: 'NOT_EDITABLE', status: ts.status };

  // Plausibilitaet: Stunden <= 24 pro Tag
  const totalDay = (parseFloat(data.hours_regular) || 0) + (parseFloat(data.hours_overtime) || 0);
  if (totalDay > 24) return { error: 'HOURS_EXCEED_DAY', message: 'Summe der Stunden pro Tag darf 24h nicht ueberschreiten.' };

  const { rows } = await pool.query(
    `INSERT INTO timesheet_entries
       (timesheet_id, work_date, hours_regular, hours_overtime, break_minutes, shift_start, shift_end, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (timesheet_id, work_date) DO UPDATE SET
       hours_regular  = EXCLUDED.hours_regular,
       hours_overtime = EXCLUDED.hours_overtime,
       break_minutes  = EXCLUDED.break_minutes,
       shift_start    = EXCLUDED.shift_start,
       shift_end      = EXCLUDED.shift_end,
       notes          = EXCLUDED.notes,
       updated_at     = NOW()
     RETURNING *`,
    [
      timesheetId, data.work_date,
      data.hours_regular ?? 0, data.hours_overtime ?? 0,
      data.break_minutes ?? 0, data.shift_start || null, data.shift_end || null,
      data.notes || null
    ]
  );
  // Gesamtstunden im Timesheet aktualisieren
  await recalcTotals(pool, timesheetId);
  return { entry: rows[0] };
}

export async function updateEntry(pool, timesheetId, entryId, data, _actorId) {
  const ts = await getTimesheet(pool, timesheetId);
  if (!ts) return { error: 'NOT_FOUND' };
  if (ts.status !== 'draft') return { error: 'NOT_EDITABLE', status: ts.status };

  const totalDay = (parseFloat(data.hours_regular) || 0) + (parseFloat(data.hours_overtime) || 0);
  if (totalDay > 24) return { error: 'HOURS_EXCEED_DAY', message: 'Summe der Stunden pro Tag darf 24h nicht ueberschreiten.' };

  const allowed = ['hours_regular', 'hours_overtime', 'break_minutes', 'shift_start', 'shift_end', 'notes'];
  const fields = [];
  const values = [entryId, timesheetId];
  let idx = 3;
  for (const key of allowed) {
    if (data[key] !== undefined) { fields.push(`${key} = $${idx}`); values.push(data[key]); idx++; }
  }
  if (fields.length === 0) {
    const { rows: e } = await pool.query('SELECT * FROM timesheet_entries WHERE id=$1 AND timesheet_id=$2', [entryId, timesheetId]);
    return { entry: e[0] || null };
  }
  fields.push('updated_at = NOW()');
  const { rows } = await pool.query(
    `UPDATE timesheet_entries SET ${fields.join(', ')} WHERE id=$1 AND timesheet_id=$2 RETURNING *`,
    values
  );
  if (!rows[0]) return { error: 'ENTRY_NOT_FOUND' };
  await recalcTotals(pool, timesheetId);
  return { entry: rows[0] };
}

export async function deleteEntry(pool, timesheetId, entryId, _actorId) {
  const ts = await getTimesheet(pool, timesheetId);
  if (!ts) return { error: 'NOT_FOUND' };
  if (ts.status !== 'draft') return { error: 'NOT_EDITABLE', status: ts.status };

  const { rowCount } = await pool.query(
    'DELETE FROM timesheet_entries WHERE id=$1 AND timesheet_id=$2',
    [entryId, timesheetId]
  );
  if (rowCount === 0) return { error: 'ENTRY_NOT_FOUND' };
  await recalcTotals(pool, timesheetId);
  return { ok: true };
}

/* ══════════════════════════════════════════════════════════════════════════════
   Pre-Fill: Wochenstundenzettel aus Assignment + Template-Defaults erstellen
   ══════════════════════════════════════════════════════════════════════════════ */

/**
 * Erstellt einen vorbelegten draft-Timesheet + Tageseintraege fuer eine Woche.
 * Defaults aus: 1. worker_assignment_link  2. timesheet_template  3. Fallback 8h/30min
 */
export async function prefillFromAssignment(pool, { assignmentId, supplierOrgId, weekStart, weekEnd, workerUserId, createdBy }) {
  // Assignment laden
  const { rows: aRows } = await pool.query(
    `SELECT a.id, a.org_id, a.supplier_org_id, a.status, a.worker_description,
            a.start_date, a.planned_end_date
     FROM assignments a WHERE a.id = $1`,
    [assignmentId]
  );
  const asg = aRows[0];
  if (!asg) return { error: 'ASSIGNMENT_NOT_FOUND' };
  if (asg.status === 'cancelled') return { error: 'ASSIGNMENT_CANCELLED' };
  if (supplierOrgId && asg.org_id !== supplierOrgId && asg.supplier_org_id !== supplierOrgId) {
    return { error: 'ORG_BOUNDARY_VIOLATION' };
  }

  // Worker-Assignment-Link Defaults laden (Schicht, Pause, Stunden/Tag)
  const { rows: linkRows } = await pool.query(
    `SELECT default_hours_per_day, default_shift_start, default_shift_end,
            default_break_minutes, client_name
     FROM worker_assignment_links
     WHERE assignment_id = $1 AND supplier_org_id = $2
       ${workerUserId ? 'AND worker_user_id = $3' : ''}
     LIMIT 1`,
    workerUserId ? [assignmentId, supplierOrgId, workerUserId] : [assignmentId, supplierOrgId]
  );
  const link = linkRows[0] || {};

  // Template-Defaults (Fallback)
  let tmplDefaults = {};
  try {
    const tmpl = await getTemplateForAssignment(pool, assignmentId, supplierOrgId);
    if (tmpl) {
      tmplDefaults = {
        default_hours_per_day: tmpl.default_hours_per_day,
        default_shift_start:   tmpl.default_shift_start,
        default_shift_end:     tmpl.default_shift_end,
        default_break_minutes: tmpl.default_break_minutes
      };
    }
  } catch { /* Template optional */ }

  // Effektive Defaults (Link > Template > Fallback)
  const hoursPerDay  = link.default_hours_per_day  ?? tmplDefaults.default_hours_per_day  ?? 8;
  const shiftStart   = link.default_shift_start    ?? tmplDefaults.default_shift_start    ?? null;
  const shiftEnd     = link.default_shift_end      ?? tmplDefaults.default_shift_end      ?? null;
  const breakMinutes = link.default_break_minutes  ?? tmplDefaults.default_break_minutes  ?? 30;

  // Worker-Name ermitteln
  let workerName = asg.worker_description || 'Mitarbeiter';
  if (workerUserId) {
    const { rows: wpRows } = await pool.query(
      `SELECT first_name, last_name FROM worker_profiles WHERE user_id = $1`,
      [workerUserId]
    );
    if (wpRows[0]) workerName = `${wpRows[0].first_name} ${wpRows[0].last_name}`.trim();
  }

  // Wochenraster VOR dem Anlegen bestimmen — sonst bliebe bei unparsbarem Zeitraum
  // ein Timesheet ohne Tageseintraege zurueck.
  //
  // Klasse DB_WERT_NACH_UTC: week_start/week_end sind reine Kalendertage. Zuvor lief
  // die Tagesschleife mit LOKALER Datums-Arithmetik (getDate/setDate) und schnitt das
  // Ergebnis per toISOString nach UTC — lokale Mitternacht Berlin ist 22:00/23:00 UTC
  // des Vortags, also lagen alle Arbeitstage ganztaegig einen Tag zu frueh. In der
  // Woche der Zeitumstellung (29.03.) kam der Wochentag zusaetzlich doppelt und der
  // Folgetag fehlte, weil der Sprung von CET auf CEST den UTC-Zeitpunkt zurueckzog.
  // Deshalb: Kalendertag in Europe/Berlin bestimmen und rein in UTC weiterzaehlen —
  // UTC kennt keine Zeitumstellung, jeder Schritt ist exakt ein Kalendertag.
  const startIso = dateOnlyDE(weekStart);
  const endIso = dateOnlyDE(weekEnd);
  const startMs = startIso ? Date.parse(`${startIso}T00:00:00Z`) : NaN;
  const endMs = endIso ? Date.parse(`${endIso}T00:00:00Z`) : NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { error: 'INVALID_DATE_RANGE', message: 'week_start/week_end ist kein gueltiger Kalendertag' };
  }

  // Timesheet erstellen
  const tsResult = await createTimesheet(pool, {
    org_id: asg.org_id,
    supplier_org_id: asg.supplier_org_id,
    assignment_id: assignmentId,
    worker_name: workerName,
    worker_identifier: null,
    week_start: weekStart,
    week_end: weekEnd,
    notes: null,
    created_by: createdBy
  });
  if (tsResult.error) return tsResult;

  // Tageseintraege fuer Mo-Fr (oder Sa/So je nach Zeitraum) vorbelegen
  const entries = [];
  for (let d = new Date(startMs); d.getTime() <= endMs; d.setUTCDate(d.getUTCDate() + 1)) {
    const dayOfWeek = d.getUTCDay(); // 0=So, 6=Sa
    const isWorkday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const workDate = d.toISOString().slice(0, 10);
    const entry = await addEntry(pool, tsResult.timesheet.id, {
      work_date: workDate,
      hours_regular: isWorkday ? hoursPerDay : 0,
      hours_overtime: 0,
      break_minutes: isWorkday ? breakMinutes : 0,
      shift_start: isWorkday ? shiftStart : null,
      shift_end: isWorkday ? shiftEnd : null,
      notes: null
    });
    if (entry.entry) entries.push(entry.entry);
  }

  return { timesheet: tsResult.timesheet, entries, defaults: { hoursPerDay, shiftStart, shiftEnd, breakMinutes } };
}

/* ══════════════════════════════════════════════════════════════════════════════
   Digitale Unterschrift
   ══════════════════════════════════════════════════════════════════════════════ */

export async function signTimesheet(pool, id, actorId, { ip } = {}) {
  const ts = await getTimesheet(pool, id);
  if (!ts) return { error: 'NOT_FOUND' };
  if (!['draft', 'submitted'].includes(ts.status)) {
    return { error: 'NOT_SIGNABLE', status: ts.status, message: 'Unterschrift nur in draft/submitted moeglich.' };
  }
  if (ts.worker_signed_at) {
    return { error: 'ALREADY_SIGNED', signed_at: ts.worker_signed_at };
  }

  const { rows } = await pool.query(
    `UPDATE timesheets
     SET worker_signed_at = NOW(), worker_signed_ip = $2, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, ip || null]
  );
  await auditLog.writeAudit(pool, {
    action: 'timesheet.signed', entity_type: 'timesheet', entity_id: id,
    actor_id: actorId, details: { ip: ip || null }
  });
  return { timesheet: rows[0] };
}

/* ══════════════════════════════════════════════════════════════════════════════
   Batch-Operationen
   ══════════════════════════════════════════════════════════════════════════════ */

export async function batchApprove(pool, ids, actorId) {
  if (!Array.isArray(ids) || ids.length === 0) return { error: 'NO_IDS' };
  if (ids.length > 100) return { error: 'BATCH_TOO_LARGE', max: 100 };

  const results = { approved: [], errors: [] };
  for (const id of ids) {
    const result = await approveTimesheet(pool, id, actorId);
    if (result.error) {
      results.errors.push({ id, error: result.error });
    } else {
      results.approved.push(id);
    }
  }
  return results;
}

export async function batchReject(pool, ids, actorId, reason) {
  if (!Array.isArray(ids) || ids.length === 0) return { error: 'NO_IDS' };
  if (ids.length > 100) return { error: 'BATCH_TOO_LARGE', max: 100 };

  const results = { rejected: [], errors: [] };
  for (const id of ids) {
    const result = await rejectTimesheet(pool, id, actorId, reason);
    if (result.error) {
      results.errors.push({ id, error: result.error });
    } else {
      results.rejected.push(id);
    }
  }
  return results;
}

/* ══════════════════════════════════════════════════════════════════════════════
   ArbZG-Pausenvalidierung
   ══════════════════════════════════════════════════════════════════════════════ */

/**
 * Validiert Pausen gemaess ArbZG §4.
 * Gibt warnings[] zurueck (kein Hard-Block, nur Hinweise).
 * Regeln:
 *   - >6h Arbeitszeit → mind. 30min Pause
 *   - >9h Arbeitszeit → mind. 45min Pause
 */
export function validateBreakCompliance(entries) {
  const warnings = [];
  for (const e of entries) {
    const totalHours = (parseFloat(e.hours_regular) || 0) + (parseFloat(e.hours_overtime) || 0);
    const breakMin   = parseInt(e.break_minutes, 10) || 0;
    const date       = e.work_date;

    if (totalHours > 9 && breakMin < 45) {
      warnings.push({
        work_date: date,
        rule: 'ARBZG_9H_45MIN',
        total_hours: totalHours,
        break_minutes: breakMin,
        required_break: 45,
        message: `${date}: Bei >9h Arbeitszeit sind mind. 45min Pause vorgeschrieben (ArbZG §4).`
      });
    } else if (totalHours > 6 && breakMin < 30) {
      warnings.push({
        work_date: date,
        rule: 'ARBZG_6H_30MIN',
        total_hours: totalHours,
        break_minutes: breakMin,
        required_break: 30,
        message: `${date}: Bei >6h Arbeitszeit sind mind. 30min Pause vorgeschrieben (ArbZG §4).`
      });
    }
  }
  return warnings;
}

/* ══════════════════════════════════════════════════════════════════════════════
   Status-Meta (Labels, Farben, Icons fuer Frontend)
   ══════════════════════════════════════════════════════════════════════════════ */

const STATUS_META = {
  draft:     { label: 'Entwurf',     labelEn: 'Draft',     color: '#6B7280', bgColor: '#F3F4F6', icon: 'edit' },
  submitted: { label: 'Eingereicht', labelEn: 'Submitted', color: '#2563EB', bgColor: '#DBEAFE', icon: 'send' },
  approved:  { label: 'Genehmigt',   labelEn: 'Approved',  color: '#059669', bgColor: '#D1FAE5', icon: 'check-circle' },
  rejected:  { label: 'Abgelehnt',   labelEn: 'Rejected',  color: '#DC2626', bgColor: '#FEE2E2', icon: 'x-circle' },
  cancelled: { label: 'Storniert',   labelEn: 'Cancelled', color: '#9CA3AF', bgColor: '#F9FAFB', icon: 'ban' }
};

export function getTimesheetStatusMeta(status = null) {
  if (status) return STATUS_META[status] || null;
  return { ...STATUS_META };
}

/* ══════════════════════════════════════════════════════════════════════════════
   Worker Timesheet Summary (KPIs)
   ══════════════════════════════════════════════════════════════════════════════ */

export async function getWorkerTimesheetSummary(pool, { workerName, orgId, supplierOrgId }) {
  const params = [];
  const conditions = [];

  if (workerName)    { params.push(`%${workerName}%`); conditions.push(`ts.worker_name ILIKE $${params.length}`); }
  if (orgId)         { params.push(orgId);         conditions.push(`ts.org_id = $${params.length}`); }
  if (supplierOrgId) { params.push(supplierOrgId); conditions.push(`ts.supplier_org_id = $${params.length}`); }

  if (conditions.length === 0) return { error: 'FILTER_REQUIRED' };

  const where = conditions.join(' AND ');

  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total_timesheets,
       COUNT(*) FILTER (WHERE ts.status = 'draft')::int      AS draft_count,
       COUNT(*) FILTER (WHERE ts.status = 'submitted')::int  AS submitted_count,
       COUNT(*) FILTER (WHERE ts.status = 'approved')::int   AS approved_count,
       COUNT(*) FILTER (WHERE ts.status = 'rejected')::int   AS rejected_count,
       COALESCE(SUM(ts.total_hours) FILTER (WHERE ts.status = 'approved'), 0)::numeric AS approved_hours_total,
       COALESCE(SUM(ts.total_hours) FILTER (
         WHERE ts.status = 'approved'
           AND ts.week_start >= DATE_TRUNC('month', NOW())
       ), 0)::numeric AS approved_hours_this_month,
       COALESCE(SUM(ts.overtime_hours) FILTER (
         WHERE ts.status = 'approved'
           AND ts.week_start >= DATE_TRUNC('month', NOW())
       ), 0)::numeric AS overtime_hours_this_month,
       COUNT(*) FILTER (
         WHERE ts.worker_signed_at IS NOT NULL
       )::int AS signed_count
     FROM timesheets ts
     WHERE ${where}`,
    params
  );

  const row = rows[0] || {};
  return {
    total_timesheets:         row.total_timesheets ?? 0,
    draft_count:              row.draft_count ?? 0,
    submitted_count:          row.submitted_count ?? 0,
    approved_count:           row.approved_count ?? 0,
    rejected_count:           row.rejected_count ?? 0,
    approved_hours_total:     parseFloat(row.approved_hours_total) || 0,
    approved_hours_this_month: parseFloat(row.approved_hours_this_month) || 0,
    overtime_hours_this_month: parseFloat(row.overtime_hours_this_month) || 0,
    signed_count:             row.signed_count ?? 0
  };
}
