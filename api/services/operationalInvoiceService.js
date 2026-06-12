/**
 * Operational Invoice Service — B2B Einsatz-Abrechnung.
 *
 * Erzeugt Rechnungen aus freigegebenen Timesheets:
 *   Timesheet (approved) → Invoice (draft) → issued → paid / overdue / void
 *
 * Berechnung: regular_hours × rate  +  overtime_hours × rate × (1 + surcharge%)
 * Tax:        19% German VAT (configurable per invoice).
 * Currency:   EUR.
 *
 * Separiert von invoiceService.js (SaaS-Subscription), gleiche DB-Tabellen.
 */

import * as auditLog from "./auditLog.js";
import { swallow } from "../utils/logger.js";

const DEFAULT_TAX_RATE = 19.0;
const DEFAULT_OVERTIME_SURCHARGE_PCT = 25.0;
const MAX_LIMIT = 200;

const VALID_TRANSITIONS = {
  draft:   ["issued", "void"],
  issued:  ["paid", "overdue", "void"],
  overdue: ["paid", "void"],
  paid:    [],
  void:    []
};

/* ── Helpers ──────────────────────────────────────────────── */

async function nextInvoiceNumber(client) {
  const { rows } = await client.query("SELECT nextval('invoice_number_seq') AS seq");
  const seq = String(rows[0].seq).padStart(6, "0");
  const year = new Date().getFullYear();
  return `TC-${year}-${seq}`;
}

function clampLimit(v, max = MAX_LIMIT) {
  return Math.min(max, Math.max(1, v || 100));
}

/* ═══════════════════════════════════════════════════════════
   generateFromTimesheets
   ═══════════════════════════════════════════════════════════ */

/**
 * Erzeugt eine operative Rechnung aus freigegebenen Timesheets.
 *
 * @param {import('pg').Pool} pool
 * @param {object} opts
 * @param {string} opts.orgId          — Rechnungsstellende Org (Supplier)
 * @param {string} opts.assignmentId   — Assignment-Bezug
 * @param {string[]} opts.timesheetIds — IDs der zu berechnenden Timesheets
 * @param {string} opts.actorId        — Ersteller
 * @param {string} [opts.referenceNumber] — Kundenreferenz
 * @param {string} [opts.billingContactName]
 * @param {string} [opts.notes]
 * @param {number} [opts.taxRatePct]
 * @param {number} [opts.overtimeSurchargePct]
 * @returns {Promise<object>} Invoice row or { error }
 */
export async function generateFromTimesheets(pool, opts) {
  const {
    orgId, assignmentId, timesheetIds, actorId,
    referenceNumber, billingContactName, notes,
    taxRatePct = DEFAULT_TAX_RATE,
    overtimeSurchargePct = DEFAULT_OVERTIME_SURCHARGE_PCT
  } = opts;

  if (!timesheetIds?.length) return { error: "NO_TIMESHEETS" };

  // 1. Assignment laden + Rate ermitteln
  const { rows: aRows } = await pool.query(
    `SELECT a.id, a.org_id, a.supplier_org_id, a.hourly_rate_cents,
            a.worker_description, a.status, o.name AS buyer_org_name
     FROM assignments a
     LEFT JOIN organizations o ON o.id = a.org_id
     WHERE a.id = $1`,
    [assignmentId]
  );
  const assignment = aRows[0];
  if (!assignment) return { error: "ASSIGNMENT_NOT_FOUND" };
  if (!assignment.hourly_rate_cents) return { error: "NO_HOURLY_RATE", message: "Assignment hat keinen Stundensatz." };

  // Org-Boundary: Anfragender muss buyer oder supplier sein
  if (assignment.org_id !== orgId && assignment.supplier_org_id !== orgId) {
    return { error: "ORG_BOUNDARY_VIOLATION" };
  }

  // 2. Timesheets validieren (alle approved + noch nicht abgerechnet + richtiges Assignment)
  const { rows: timesheets } = await pool.query(
    `SELECT id, assignment_id, status, invoice_id, total_hours, overtime_hours,
            worker_name, week_start, week_end
     FROM timesheets
     WHERE id = ANY($1)
     ORDER BY week_start ASC`,
    [timesheetIds]
  );

  if (timesheets.length !== timesheetIds.length) {
    return { error: "TIMESHEETS_NOT_FOUND", message: `${timesheetIds.length - timesheets.length} Timesheets nicht gefunden.` };
  }

  for (const ts of timesheets) {
    if (ts.status !== "approved") {
      return { error: "TIMESHEET_NOT_APPROVED", timesheet_id: ts.id, status: ts.status };
    }
    if (ts.invoice_id) {
      return { error: "TIMESHEET_ALREADY_INVOICED", timesheet_id: ts.id, invoice_id: ts.invoice_id };
    }
    if (ts.assignment_id && ts.assignment_id !== assignmentId) {
      return { error: "TIMESHEET_ASSIGNMENT_MISMATCH", timesheet_id: ts.id };
    }
  }

  // 3. Berechnung
  const rateCents = assignment.hourly_rate_cents;
  const overtimeMultiplier = 1 + overtimeSurchargePct / 100;

  let totalRegularCents = 0;
  let totalOvertimeCents = 0;
  const lineItems = [];

  for (const ts of timesheets) {
    const regularHours = Math.max(0, (ts.total_hours || 0) - (ts.overtime_hours || 0));
    const overtimeHours = ts.overtime_hours || 0;

    const regularCents = Math.round(regularHours * rateCents);
    const overtimeCents = Math.round(overtimeHours * rateCents * overtimeMultiplier);

    totalRegularCents += regularCents;
    totalOvertimeCents += overtimeCents;

    if (regularHours > 0) {
      lineItems.push({
        timesheetId: ts.id,
        assignmentId,
        itemType: "timesheet_regular",
        description: `${ts.worker_name || "Worker"} — Regelstunden ${ts.week_start} bis ${ts.week_end}`,
        quantity: regularHours,
        unitAmountCents: rateCents,
        totalCents: regularCents
      });
    }
    if (overtimeHours > 0) {
      lineItems.push({
        timesheetId: ts.id,
        assignmentId,
        itemType: "timesheet_overtime",
        description: `${ts.worker_name || "Worker"} — Überstunden ${ts.week_start} bis ${ts.week_end} (+${overtimeSurchargePct}%)`,
        quantity: overtimeHours,
        unitAmountCents: Math.round(rateCents * overtimeMultiplier),
        totalCents: overtimeCents
      });
    }
  }

  const netCents = totalRegularCents + totalOvertimeCents;
  const taxCents = Math.round(netCents * taxRatePct / 100);
  const totalCents = netCents + taxCents;

  // Periode = frühester week_start bis spätester week_end
  const periodStart = timesheets[0].week_start;
  const periodEnd = timesheets[timesheets.length - 1].week_end || timesheets[timesheets.length - 1].week_start;
  const dueAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // Net 14

  // 4. Transaktion: Invoice + Items + Timesheets markieren
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const invoiceNumber = await nextInvoiceNumber(client);

    const { rows: invRows } = await client.query(
      `INSERT INTO invoices (
         invoice_number, invoice_type, org_id, supplier_org_id, user_id,
         assignment_id, billing_period_start, billing_period_end,
         amount_cents, tax_rate_pct, tax_amount_cents, total_cents,
         currency, status, issued_at, due_at,
         billing_contact_name, reference_number, overtime_surcharge_pct, notes
       ) VALUES ($1,'operational',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'EUR','draft',NULL,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        invoiceNumber,
        assignment.org_id,         // buyer org = Rechnungsempfänger
        assignment.supplier_org_id, // supplier org = Leistungserbringer
        actorId,
        assignmentId,
        periodStart, periodEnd,
        netCents, taxRatePct, taxCents, totalCents,
        dueAt.toISOString(),
        billingContactName || null,
        referenceNumber || null,
        overtimeSurchargePct,
        notes || null
      ]
    );
    const invoice = invRows[0];

    // Line Items
    for (const li of lineItems) {
      await client.query(
        `INSERT INTO invoice_items
           (invoice_id, timesheet_id, assignment_id, item_type, description, quantity, unit_amount_cents, total_cents)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [invoice.id, li.timesheetId, li.assignmentId, li.itemType, li.description, li.quantity, li.unitAmountCents, li.totalCents]
      );
    }

    // Timesheets als abgerechnet markieren
    await client.query(
      `UPDATE timesheets SET invoice_id = $1, updated_at = NOW() WHERE id = ANY($2)`,
      [invoice.id, timesheetIds]
    );

    await client.query("COMMIT");

    await auditLog.writeAudit(pool, {
      action: "invoice.operational_created",
      entity_type: "invoice",
      entity_id: invoice.id,
      actor_id: actorId,
      details: {
        assignment_id: assignmentId,
        timesheet_count: timesheets.length,
        net_cents: netCents,
        total_cents: totalCents,
        period: `${periodStart} – ${periodEnd}`
      }
    });

    return { invoice, items: lineItems };
  } catch (e) {
    await client.query("ROLLBACK").catch(swallow("operationalInvoiceService"));
    throw e;
  } finally {
    client.release();
  }
}

/* ═══════════════════════════════════════════════════════════
   getOperationalInvoice — Detail mit Items + Timesheet-Daten
   ═══════════════════════════════════════════════════════════ */

export async function getOperationalInvoice(pool, invoiceId, orgId) {
  const { rows } = await pool.query(
    `SELECT i.*,
            o.name  AS buyer_org_name,
            so.name AS supplier_org_name,
            a.worker_description AS assignment_description,
            a.hourly_rate_cents  AS assignment_rate_cents,
            a.start_date         AS assignment_start,
            a.planned_end_date   AS assignment_end
     FROM invoices i
     LEFT JOIN organizations o  ON o.id = i.org_id
     LEFT JOIN organizations so ON so.id = i.supplier_org_id
     LEFT JOIN assignments a    ON a.id = i.assignment_id
     WHERE i.id = $1 AND i.invoice_type = 'operational'`,
    [invoiceId]
  );
  const invoice = rows[0];
  if (!invoice) return null;

  // Org-Boundary
  if (orgId && invoice.org_id !== orgId && invoice.supplier_org_id !== orgId) {
    return { error: "ORG_BOUNDARY_VIOLATION" };
  }

  // Items mit Timesheet-Info
  const { rows: items } = await pool.query(
    `SELECT ii.*,
            ts.worker_name, ts.week_start, ts.week_end,
            ts.total_hours AS timesheet_total_hours, ts.overtime_hours AS timesheet_overtime_hours
     FROM invoice_items ii
     LEFT JOIN timesheets ts ON ts.id = ii.timesheet_id
     WHERE ii.invoice_id = $1
     ORDER BY ts.week_start ASC, ii.created_at ASC`,
    [invoiceId]
  );

  return { ...invoice, items };
}

/* ═══════════════════════════════════════════════════════════
   listOperationalInvoices
   ═══════════════════════════════════════════════════════════ */

export async function listOperationalInvoices(pool, filters = {}) {
  const params = [];
  const where = ["i.invoice_type = 'operational'"];
  let idx = 1;

  if (filters.orgId) {
    where.push(`(i.org_id = $${idx} OR i.supplier_org_id = $${idx})`);
    params.push(filters.orgId); idx++;
  }
  if (filters.status) {
    where.push(`i.status = $${idx}`); params.push(filters.status); idx++;
  }
  if (filters.assignmentId) {
    where.push(`i.assignment_id = $${idx}`); params.push(filters.assignmentId); idx++;
  }
  if (filters.dateFrom) {
    where.push(`i.billing_period_start >= $${idx}`); params.push(filters.dateFrom); idx++;
  }
  if (filters.dateTo) {
    where.push(`i.billing_period_end <= $${idx}`); params.push(filters.dateTo); idx++;
  }
  if (filters.search) {
    where.push(`(i.invoice_number ILIKE $${idx} OR i.reference_number ILIKE $${idx} OR o.name ILIKE $${idx} OR so.name ILIKE $${idx})`);
    params.push(`%${filters.search}%`); idx++;
  }

  const limit = clampLimit(filters.limit);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT i.*,
            o.name  AS buyer_org_name,
            so.name AS supplier_org_name,
            a.worker_description AS assignment_description
     FROM invoices i
     LEFT JOIN organizations o  ON o.id = i.org_id
     LEFT JOIN organizations so ON so.id = i.supplier_org_id
     LEFT JOIN assignments a    ON a.id = i.assignment_id
     WHERE ${where.join(" AND ")}
     ORDER BY i.created_at DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

/* ═══════════════════════════════════════════════════════════
   getInvoiceKpis — Dashboard
   ═══════════════════════════════════════════════════════════ */

export async function getInvoiceKpis(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total_invoices,
       COUNT(*) FILTER (WHERE status = 'draft')::int   AS draft_count,
       COUNT(*) FILTER (WHERE status = 'issued')::int  AS issued_count,
       COUNT(*) FILTER (WHERE status = 'overdue')::int AS overdue_count,
       COUNT(*) FILTER (WHERE status = 'paid')::int    AS paid_count,
       COALESCE(SUM(total_cents) FILTER (WHERE status IN ('issued','overdue')), 0)::bigint AS outstanding_cents,
       COALESCE(SUM(total_cents) FILTER (WHERE status = 'overdue'), 0)::bigint AS overdue_cents,
       COALESCE(SUM(total_cents) FILTER (WHERE status = 'paid'
         AND paid_at >= date_trunc('month', NOW())), 0)::bigint AS paid_this_month_cents,
       COALESCE(SUM(total_cents) FILTER (WHERE status = 'paid'), 0)::bigint AS paid_total_cents
     FROM invoices
     WHERE invoice_type = 'operational'
       AND (org_id = $1 OR supplier_org_id = $1)`,
    [orgId]
  );
  const row = rows[0] || {};
  return {
    total_invoices:       row.total_invoices ?? 0,
    draft_count:          row.draft_count ?? 0,
    issued_count:         row.issued_count ?? 0,
    overdue_count:        row.overdue_count ?? 0,
    paid_count:           row.paid_count ?? 0,
    outstanding_cents:    row.outstanding_cents ?? 0,
    overdue_cents:        row.overdue_cents ?? 0,
    paid_this_month_cents: row.paid_this_month_cents ?? 0,
    paid_total_cents:     row.paid_total_cents ?? 0
  };
}

/* ═══════════════════════════════════════════════════════════
   getBillableTimesheets — approved + nicht abgerechnet
   ═══════════════════════════════════════════════════════════ */

export async function getBillableTimesheets(pool, orgId, filters = {}) {
  const params = [orgId];
  const where = [
    "(ts.org_id = $1 OR ts.supplier_org_id = $1)",
    "ts.status = 'approved'",
    "ts.invoice_id IS NULL"
  ];
  let idx = 2;

  if (filters.assignmentId) {
    where.push(`ts.assignment_id = $${idx}`); params.push(filters.assignmentId); idx++;
  }
  if (filters.workerName) {
    where.push(`ts.worker_name ILIKE $${idx}`); params.push(`%${filters.workerName}%`); idx++;
  }

  const limit = clampLimit(filters.limit, 500);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT ts.id, ts.assignment_id, ts.worker_name, ts.week_start, ts.week_end,
            ts.total_hours, ts.overtime_hours, ts.approved_at,
            a.hourly_rate_cents, a.worker_description AS assignment_description,
            o.name AS org_name, so.name AS supplier_org_name
     FROM timesheets ts
     LEFT JOIN assignments a ON a.id = ts.assignment_id
     LEFT JOIN organizations o ON o.id = ts.org_id
     LEFT JOIN organizations so ON so.id = ts.supplier_org_id
     WHERE ${where.join(" AND ")}
     ORDER BY ts.week_start ASC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

/* ═══════════════════════════════════════════════════════════
   addCorrectionItem — Nachträgliche Korrekturposition
   ═══════════════════════════════════════════════════════════ */

export async function addCorrectionItem(pool, invoiceId, opts) {
  const { description, amountCents, actorId } = opts;

  // Invoice laden + Status prüfen
  const { rows: inv } = await pool.query(
    "SELECT id, status, org_id, supplier_org_id FROM invoices WHERE id = $1 AND invoice_type = 'operational'",
    [invoiceId]
  );
  if (!inv[0]) return { error: "NOT_FOUND" };
  if (inv[0].status !== "draft") return { error: "NOT_EDITABLE", status: inv[0].status };

  // Item hinzufügen
  const { rows: items } = await pool.query(
    `INSERT INTO invoice_items (invoice_id, item_type, description, quantity, unit_amount_cents, total_cents)
     VALUES ($1, 'adjustment', $2, 1, $3, $3)
     RETURNING *`,
    [invoiceId, description, amountCents]
  );

  // Totals aktualisieren
  await pool.query(
    `UPDATE invoices SET
       amount_cents = (SELECT COALESCE(SUM(total_cents), 0) FROM invoice_items WHERE invoice_id = $1),
       tax_amount_cents = ROUND((SELECT COALESCE(SUM(total_cents), 0) FROM invoice_items WHERE invoice_id = $1) * tax_rate_pct / 100),
       total_cents = (SELECT COALESCE(SUM(total_cents), 0) FROM invoice_items WHERE invoice_id = $1)
                   + ROUND((SELECT COALESCE(SUM(total_cents), 0) FROM invoice_items WHERE invoice_id = $1) * tax_rate_pct / 100),
       updated_at = NOW()
     WHERE id = $1`,
    [invoiceId]
  );

  await auditLog.writeAudit(pool, {
    action: "invoice.correction_added",
    entity_type: "invoice",
    entity_id: invoiceId,
    actor_id: actorId,
    details: { description, amount_cents: amountCents }
  });

  return { item: items[0] };
}

/* ═══════════════════════════════════════════════════════════
   transitionInvoice — Status-Lifecycle mit Audit
   ═══════════════════════════════════════════════════════════ */

export async function transitionInvoice(pool, invoiceId, newStatus, actorId) {
  const { rows: inv } = await pool.query(
    "SELECT id, status, org_id, supplier_org_id FROM invoices WHERE id = $1 AND invoice_type = 'operational'",
    [invoiceId]
  );
  if (!inv[0]) return { error: "NOT_FOUND" };

  const current = inv[0].status;
  const allowed = VALID_TRANSITIONS[current] || [];
  if (!allowed.includes(newStatus)) {
    return { error: "INVALID_TRANSITION", from: current, to: newStatus, allowed };
  }

  const extra = [];
  const params = [invoiceId, newStatus];

  if (newStatus === "issued") {
    extra.push("issued_at = NOW()");
  } else if (newStatus === "paid") {
    extra.push("paid_at = NOW()");
  }

  const setClause = ["status = $2", "updated_at = NOW()", ...extra].join(", ");
  const { rows } = await pool.query(
    `UPDATE invoices SET ${setClause} WHERE id = $1 RETURNING *`,
    params
  );

  await auditLog.writeAudit(pool, {
    action: `invoice.${newStatus}`,
    entity_type: "invoice",
    entity_id: invoiceId,
    actor_id: actorId,
    details: { from: current, to: newStatus }
  });

  return { invoice: rows[0] };
}

/* ═══════════════════════════════════════════════════════════
   exportOperationalInvoiceCsv — Einzelrechnung CSV
   ═══════════════════════════════════════════════════════════ */

export function exportOperationalInvoiceCsv(invoice) {
  const headers = [
    "position", "item_type", "description", "worker_name",
    "week_start", "week_end", "quantity_hours",
    "unit_rate_eur", "total_eur"
  ];

  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const items = invoice.items || [];
  const rows = items.map((it, i) => [
    esc(i + 1),
    esc(it.item_type),
    esc(it.description),
    esc(it.worker_name || ""),
    esc(it.week_start || ""),
    esc(it.week_end || ""),
    esc(it.quantity),
    esc(((it.unit_amount_cents || 0) / 100).toFixed(2)),
    esc(((it.total_cents || 0) / 100).toFixed(2))
  ].join(","));

  // Summary
  rows.push("");
  rows.push(`,,Nettobetrag,,,,,,${esc(((invoice.amount_cents || 0) / 100).toFixed(2))}`);
  rows.push(`,,MwSt. ${invoice.tax_rate_pct || 19}%,,,,,,${esc(((invoice.tax_amount_cents || 0) / 100).toFixed(2))}`);
  rows.push(`,,Gesamtbetrag,,,,,,${esc(((invoice.total_cents || 0) / 100).toFixed(2))}`);

  return [headers.join(","), ...rows].join("\n");
}
