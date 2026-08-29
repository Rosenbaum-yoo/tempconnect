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

import { firmaZuPartei, pruefeFirmenstammdaten } from "./eRechnungService.js";

import * as auditLog from "./auditLog.js";
import { swallow } from "../utils/logger.js";
/* Planwerte immer ueber den Katalog normalisieren (Projektregel) — der CHECK
 * auf `invoices.plan` kennt nur die fuenf kanonischen Schluessel. */
import { normalizePlanKey } from "../config/planCatalog.js";

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

/**
 * Die Mandantengrenze einer operativen Rechnung ist ZWEISEITIG: sie gehoert
 * dem Kunden (org_id) UND dem Lieferanten (supplier_org_id). Dieselbe Regel
 * steht in getOperationalInvoice — hier als benannte Funktion, damit die
 * Schreibwege sie nicht in eigener Schreibweise nachbauen.
 *
 * Fail-closed: ohne orgId gehoert die Rechnung niemandem.
 */
function gehoertZurOrg(rechnung, orgId) {
  if (!orgId || !rechnung) return false;
  return String(rechnung.org_id) === String(orgId)
      || String(rechnung.supplier_org_id) === String(orgId);
}

/**
 * Ist diese Organisation der RECHNUNGSSTELLER — nicht nur beteiligt?
 *
 * DER BEFUND (2026-08-28, beim Bau der Empfangsseite an der echten Datenbank
 * belegt): `gehoertZurOrg` fragt nur, OB eine Org an der Rechnung beteiligt
 * ist. Damit stand dem EMPFAENGER der gesamte Beleg des Ausstellers offen. Ein
 * Unternehmen konnte an einer Rechnung, die an es selbst gerichtet ist:
 *
 *   - sie ueberhaupt erst ERZEUGEN (im Namen der Zeitarbeitsfirma),
 *   - den Entwurf KORRIGIEREN und damit den Betrag aendern,
 *   - sie STELLEN — und dabei eine Nummer aus dem Kreis der Zeitarbeitsfirma
 *     ziehen, also genau die Lueckenlosigkeit zerstoeren, die Mig 203 herstellt,
 *   - sie als BEZAHLT markieren, ohne bezahlt zu haben.
 *
 * Die zweiseitige Grenze ist fuer das LESEN richtig — der Entleiher braucht
 * denselben Beleg fuer seine Buchhaltung wie der Verleiher (so begruendet es
 * auch der Eintrag der E-Rechnung im Org-Grenzen-Register). Fuers SCHREIBEN
 * ist sie falsch: einen Beleg stellt aus, wer die Leistung erbracht hat.
 */
function istRechnungssteller(rechnung, orgId) {
  if (!orgId || !rechnung) return false;
  return String(rechnung.supplier_org_id) === String(orgId);
}

/**
 * Die naechste Rechnungsnummer der ZEITARBEITSFIRMA (Welle J7, Mig 203).
 *
 * ZWEI DINGE HABEN SICH GEAENDERT, beide aus demselben Grund — der Kreis
 * gehoert der Firma, nicht der Plattform:
 *
 *   1. EIGENER ZAEHLER statt der globalen `invoice_number_seq`. Die teilte sich
 *      die operative Rechnung mit der Abo-Rechnung der Plattform; jede
 *      Abo-Rechnung riss damit eine Luecke in den Kreis der Firma. Erklaeren
 *      muss sie der Rechnungssteller, nicht wir — also nehmen wir ihm die
 *      Erklaerung ab.
 *   2. VERGABE BEIM STELLEN, nicht beim Entwurf. Vorher fiel die Nummer in
 *      `generateFromTimesheets`; ein verworfener Entwurf hinterliess eine
 *      Luecke, die niemand mehr zuordnen kann.
 *
 * Warum eine TABELLENZEILE und keine Postgres-Sequenz je Org: Sequenzen lassen
 * sich nicht transaktional zuruecknehmen (nextval haelt auch nach ROLLBACK),
 * waeren nicht aufzaehlbar und brauchten DDL fuer jede neue Organisation.
 * `FOR UPDATE` auf der Zeile serialisiert die Vergabe innerhalb DERSELBEN
 * Transaktion wie die Rechnung — bricht sie ab, ist auch die Nummer wieder
 * frei. Genau das macht den Kreis lueckenlos.
 *
 * @param {import('pg').PoolClient} client — MUSS in der Transaktion der
 *   Rechnung laufen, sonst ist die Lueckenlosigkeit nicht garantiert.
 */
async function nextInvoiceNumber(client, supplierOrgId, jahr) {
  if (!supplierOrgId) {
    const fehler = new Error("NO_SUPPLIER_ORG");
    fehler.code = "NO_SUPPLIER_ORG";
    throw fehler;
  }
  /* Anlegen und Sperren in einem Schritt: ON CONFLICT DO UPDATE gibt die Zeile
   * auch dann gesperrt zurueck, wenn sie schon existierte — ein getrenntes
   * INSERT/SELECT haette zwischen beiden ein Fenster fuer einen zweiten
   * Schreiber. Das no-op-UPDATE ist der guenstigste Weg zu RETURNING. */
  const { rows } = await client.query(
    `INSERT INTO invoice_number_sequences (supplier_org_id, jahr, letzte_nummer)
          VALUES ($1, $2, 1)
     ON CONFLICT (supplier_org_id, jahr) DO UPDATE
            SET letzte_nummer = invoice_number_sequences.letzte_nummer + 1,
                updated_at = NOW()
      RETURNING letzte_nummer, praefix`,
    [supplierOrgId, jahr]
  );
  const { letzte_nummer: nummer, praefix } = rows[0];
  return `${praefix}-${jahr}-${String(nummer).padStart(6, "0")}`;
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

  /* ZWEI STUFEN, bewusst getrennt — die Antwort soll den Grund nennen:
   *
   *   1. GAR NICHT BETEILIGT -> ORG_BOUNDARY_VIOLATION. Die fremde Org hat mit
   *      diesem Einsatz nichts zu tun.
   *   2. BETEILIGT, ABER FALSCHE ROLLE -> NOT_INVOICE_ISSUER (Befund
   *      2026-08-28). Vorher genuegte die Beteiligung — damit konnte das
   *      EMPFANGENDE Unternehmen sich selbst eine Rechnung im Namen der
   *      Zeitarbeitsfirma ausstellen. Einen Beleg stellt aus, wer die Leistung
   *      erbracht hat.
   */
  if (assignment.org_id !== orgId && assignment.supplier_org_id !== orgId) {
    return { error: "ORG_BOUNDARY_VIOLATION" };
  }
  if (String(assignment.supplier_org_id) !== String(orgId)) {
    return {
      error: "NOT_INVOICE_ISSUER",
      message: "Nur die leistungserbringende Zeitarbeitsfirma stellt diese Rechnung aus."
    };
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
    /* KEINE Nummer im Entwurf (Welle J7, Mig 203): sie faellt erst beim
     * Stellen. Ein verworfener Entwurf soll keine Luecke im Kreis der
     * Zeitarbeitsfirma hinterlassen. `invoice_number` ist dafuer nullable —
     * der UNIQUE-Index traegt beliebig viele NULLs. */
    /* `plan` und `gross_amount_cents` sind NOT NULL — Erbe der geteilten
     * Tabelle: beide Felder stammen aus der ABO-Rechnung (Mig 030 bzw. 170,
     * Bounty-Rabatt) und sind fuer eine operative Rechnung ohne Bedeutung.
     * Der INSERT setzte sie bis hierher nicht, weshalb `generateFromTimesheets`
     * gegen eine echte Datenbank IMMER scheiterte — gefunden beim ersten
     * DB-gebundenen Lauf (Welle J7, 2026-08-28). Genau deshalb existierte
     * keine einzige operative Rechnung.
     *
     * `plan` traegt den Tarif des Rechnungsstellers (Rueckfall BASIS, damit
     * der CHECK auf die fuenf kanonischen Plaene haelt), `gross_amount_cents`
     * den Nettobetrag vor Rabatt — auf einer operativen Rechnung gibt es
     * keinen, also entspricht er dem Nettobetrag. */
    const { rows: planRows } = await client.query(
      "SELECT plan FROM organizations WHERE id = $1",
      [assignment.supplier_org_id]
    );
    const rechnungsPlan = normalizePlanKey(planRows[0]?.plan) || "BASIS";

    const { rows: invRows } = await client.query(
      `INSERT INTO invoices (
         invoice_number, invoice_type, org_id, supplier_org_id, user_id,
         assignment_id, billing_period_start, billing_period_end,
         amount_cents, tax_rate_pct, tax_amount_cents, total_cents,
         currency, status, issued_at, due_at,
         billing_contact_name, reference_number, overtime_surcharge_pct, notes,
         rate_cents_frozen, plan, gross_amount_cents
       ) VALUES (NULL,'operational',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'EUR','draft',NULL,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [
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
        notes || null,
        /* Der Satz, mit dem gerechnet wurde — eingefroren an der Rechnung
         * (Welle J7, Mig 203). `assignments.hourly_rate_cents` steht in der
         * Update-Whitelist (assignmentService.js) und ist jederzeit aenderbar;
         * ohne diese Kopie rechnete eine spaetere Aenderung rueckwirkend an
         * einer bereits erzeugten Rechnung mit. */
        rateCents,
        rechnungsPlan,
        netCents
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
  const { description, amountCents, actorId, orgId } = opts;

  // Invoice laden + Status prüfen
  const { rows: inv } = await pool.query(
    "SELECT id, status, org_id, supplier_org_id FROM invoices WHERE id = $1 AND invoice_type = 'operational' AND (org_id = $2 OR supplier_org_id = $2)",
    [invoiceId, orgId]
  );
  if (!inv[0]) return { error: "NOT_FOUND" };
  // Befund E-2 (2026-08-19): org_id und supplier_org_id wurden zwar geladen,
  // aber nie verglichen — die Zeile darueber hat die Grenze jetzt im SQL, hier
  // steht sie zusaetzlich in JS, damit ein entfernter WHERE-Teil nicht reicht.
  if (!gehoertZurOrg(inv[0], orgId)) return { error: "ORG_BOUNDARY_VIOLATION" };
  /* Und danach die ROLLE (Befund 2026-08-28): beteiligt zu sein genuegt nicht,
   * um den Betrag zu aendern — sonst korrigiert der Empfaenger den Beleg des
   * Ausstellers nach unten. */
  if (!istRechnungssteller(inv[0], orgId)) {
    return {
      error: "NOT_INVOICE_ISSUER",
      message: "Nur der Rechnungssteller kann Positionen ergaenzen."
    };
  }
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

export async function transitionInvoice(pool, invoiceId, newStatus, actorId, orgId) {
  const { rows: inv } = await pool.query(
    "SELECT id, status, org_id, supplier_org_id, invoice_number FROM invoices WHERE id = $1 AND invoice_type = 'operational' AND (org_id = $2 OR supplier_org_id = $2)",
    [invoiceId, orgId]
  );
  if (!inv[0]) return { error: "NOT_FOUND" };
  // Befund E-2 (2026-08-19): siehe addCorrectionItem — die Grenze steht jetzt
  // doppelt, im SQL oben und hier.
  if (!gehoertZurOrg(inv[0], orgId)) return { error: "ORG_BOUNDARY_VIOLATION" };
  /* Und die ROLLE (Befund 2026-08-28): Stellen, Stornieren und "bezahlt"
   * gehoeren dem Rechnungssteller. Der Empfaenger konnte sonst eine Nummer aus
   * dem fremden Kreis ziehen (und dessen Lueckenlosigkeit zerstoeren) oder
   * "bezahlt" behaupten, ohne bezahlt zu haben. Den Zahlungseingang sieht
   * ohnehin nur der Empfaenger des Geldes. */
  if (!istRechnungssteller(inv[0], orgId)) {
    return {
      error: "NOT_INVOICE_ISSUER",
      message: "Nur der Rechnungssteller kann den Status dieser Rechnung aendern."
    };
  }

  const current = inv[0].status;
  const allowed = VALID_TRANSITIONS[current] || [];
  if (!allowed.includes(newStatus)) {
    return { error: "INVALID_TRANSITION", from: current, to: newStatus, allowed };
  }

  /* NUR DAS STELLEN VERGIBT DIE NUMMER (Welle J7, Mig 203).
   *
   * Es laeuft in einer Transaktion, weil Nummernvergabe und Statuswechsel
   * zusammengehoeren: bricht der Wechsel ab, muss die Nummer wieder frei sein —
   * sonst entsteht genau die Luecke, die dieser Umbau beseitigt. Die uebrigen
   * Uebergaenge (paid/void/overdue) brauchen keine Transaktion; sie bekommen
   * den bisherigen, einfachen Weg.
   *
   * Eine bereits vergebene Nummer wird NICHT ueberschrieben: 'overdue' kann
   * laut Zustandsautomat zurueck auf 'issued' gehen, und eine zweite Nummer
   * fuer dieselbe Rechnung waere ein Beleg-Duplikat. */
  const vergibtNummer = newStatus === "issued" && !inv[0].invoice_number;

  if (vergibtNummer) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const jahr = new Date().getFullYear();
      const nummer = await nextInvoiceNumber(client, inv[0].supplier_org_id, jahr);
      const { rows } = await client.query(
        `UPDATE invoices
            SET status = $2, invoice_number = $3, issued_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND (org_id = $4 OR supplier_org_id = $4) AND status = $5
          RETURNING *`,
        [invoiceId, newStatus, nummer, orgId, current]
      );
      /* Kein Treffer: die Zeile gehoert nicht mehr zur Org ODER ein zweiter
       * Schreiber war schneller (deshalb `status = $5`). Beides ist ein Grund
       * zurueckzurollen — dann ist auch die Nummer wieder frei. */
      if (!rows[0]) {
        await client.query("ROLLBACK");
        return { error: "NOT_FOUND" };
      }
      await client.query("COMMIT");
      await auditLog.writeAudit(pool, {
        action: `invoice.${newStatus}`,
        entity_type: "invoice",
        entity_id: invoiceId,
        actor_id: actorId,
        details: { from: current, to: newStatus, invoice_number: nummer }
      });
      return { invoice: rows[0] };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      if (err?.code === "NO_SUPPLIER_ORG") return { error: "NO_SUPPLIER_ORG" };
      throw err;
    } finally {
      client.release();
    }
  }

  const extra = [];
  const params = [invoiceId, newStatus];

  if (newStatus === "issued") {
    extra.push("issued_at = NOW()");
  } else if (newStatus === "paid") {
    extra.push("paid_at = NOW()");
  }

  const setClause = ["status = $2", "updated_at = NOW()", ...extra].join(", ");
  params.push(orgId);
  const orgIdx = params.length;
  const { rows } = await pool.query(
    `UPDATE invoices SET ${setClause}
     WHERE id = $1 AND (org_id = $${orgIdx} OR supplier_org_id = $${orgIdx})
     RETURNING *`,
    params
  );
  // Kein Treffer heisst hier: die Zeile gehoert nicht (mehr) zur Org. Ohne
  // diese Wache liefe der Audit-Eintrag auf eine Rechnung, die nie geschrieben
  // wurde.
  if (!rows[0]) return { error: "NOT_FOUND" };

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

/* ═══════════════════════════════════════════════════════════
   ladeERechnungsdaten — Rechnung + Positionen + beide Firmen
   ═══════════════════════════════════════════════════════════ */

/**
 * Laedt alles, was eine E-Rechnung nach EN 16931 verlangt: die Rechnung, ihre
 * Positionen und BEIDE Firmen mit vollstaendigen Rechnungsstammdaten (Migration 187).
 *
 * WARUM NICHT getOperationalInvoice ALLEIN: die liefert von den Firmen nur den Namen.
 * Die Norm verlangt fuer beide Seiten Anschrift und Laendercode und fuer den
 * Rechnungssteller zusaetzlich eine steuerliche Kennung. Fehlt davon etwas, weist der
 * Empfaenger das Dokument ab — deshalb werden die Stammdaten hier vollstaendig geholt.
 *
 * EINE Query fuer beide Firmen (ANY statt zwei Einzelabfragen): der Aufruf haengt am
 * Download-Pfad und wird pro Rechnung ausgeloest.
 *
 * Mandantengrenze: `getOperationalInvoice` prueft sie bereits zweiseitig — die Rechnung
 * gehoert Kaeufer UND Verkaeufer. Das Ergebnis wird hier unveraendert durchgereicht.
 *
 * @returns {null | {error: string} | {invoice: object, items: Array, verkaeufer: object, kaeufer: object}}
 */
export async function ladeERechnungsdaten(pool, invoiceId, orgId) {
  const invoice = await getOperationalInvoice(pool, invoiceId, orgId);
  if (!invoice) return null;
  if (invoice.error) return invoice;

  const ids = [invoice.supplier_org_id, invoice.org_id].filter(Boolean);
  const { rows } = ids.length
    ? await pool.query(
        `SELECT id, name, legal_name, commercial_register, billing_email, billing_contact,
                tax_id, vat_id, billing_street, billing_address_2, billing_postal_code,
                billing_city, billing_country_code, iban, bic
           FROM organizations
          WHERE id = ANY($1::uuid[])`,
        [ids]
      )
    : { rows: [] };

  const nachId = new Map(rows.map((r) => [String(r.id), r]));
  return {
    invoice,
    items: invoice.items || [],
    // Leistungserbringer = Rechnungssteller. Faellt die Zeile aus, bleibt wenigstens
    // der Name erhalten — die Pflichtfeldpruefung meldet den Rest im Klartext.
    verkaeufer: nachId.get(String(invoice.supplier_org_id)) || { name: invoice.supplier_org_name },
    kaeufer: nachId.get(String(invoice.org_id)) || { name: invoice.buyer_org_name }
  };
}

/* ═══════════════════════════════════════════════════════════
   pruefeERechnungBereitschaft — bin ich ab 2027 versandfaehig?
   ═══════════════════════════════════════════════════════════ */

/**
 * Prueft die Stammdaten der EIGENEN Organisation gegen die Pflichtangaben der Norm.
 *
 * WARUM VORAB UND NICHT ERST BEIM VERSAND: Ab dem 01.01.2027 muessen Unternehmen mit
 * mehr als 800.000 EUR Vorjahresumsatz strukturierte Rechnungen ausstellen, ab dem
 * 01.01.2028 alle. Wer das am Tag der ersten abgewiesenen Rechnung merkt, hat ein
 * Liquiditaetsproblem, kein Datenpflegeproblem. Diese Pruefung macht die Luecke
 * sichtbar, solange sie noch billig zu schliessen ist.
 *
 * Geprueft wird die Rolle des RECHNUNGSSTELLERS — die strengere der beiden:
 * nur sie verlangt zusaetzlich eine steuerliche Kennung.
 *
 * @returns {null | {error: string} | {bereit: boolean, fehlend: Array, hinweise: Array, fristen: object}}
 */
export async function pruefeERechnungBereitschaft(pool, orgId) {
  if (!orgId) return { error: "ORG_REQUIRED" };

  const { rows } = await pool.query(
    `SELECT id, name, legal_name, commercial_register, billing_email, billing_contact,
            tax_id, vat_id, billing_street, billing_address_2, billing_postal_code,
            billing_city, billing_country_code, iban, bic
       FROM organizations
      WHERE id = $1`,
    [orgId]
  );
  const org = rows[0];
  if (!org) return null;

  const partei = firmaZuPartei(org);
  const fehlend = pruefeFirmenstammdaten(partei, "verkaeufer");

  // Die Bankverbindung ist KEINE Pflichtangabe der Norm — ohne sie ist die Rechnung
  // gueltig. Sie fehlt hier trotzdem als Hinweis: der Empfaenger muss die Kontodaten
  // sonst woanders suchen, und das verzoegert jede Zahlung.
  const hinweise = [];
  if (!partei.iban) {
    hinweise.push({
      feld: "IBAN",
      hinweis: "Keine Pflichtangabe. Ohne Bankverbindung im Beleg muss der Empfaenger sie woanders suchen."
    });
  }

  return {
    bereit: fehlend.length === 0,
    fehlend,
    hinweise,
    fristen: {
      empfangspflicht_seit: "2025-01-01",
      versandpflicht_ab_800k_umsatz: "2027-01-01",
      versandpflicht_alle: "2028-01-01"
    }
  };
}
