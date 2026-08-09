/**
 * Invoice Service — B2B Subscription Invoice Management
 *
 * Creates and manages invoices tied to payment sessions / Stripe checkouts.
 * Tax: 19% German VAT (configurable).
 * Currency: EUR.
 *
 * Invoice number format: TC-YYYY-NNNNNN (e.g. TC-2026-001042)
 */

import { withTransaction } from "../utils/transaction.js";
import { swallow } from "../utils/logger.js";
import { dateOnlyDE } from "../utils/dateDE.js";

const TAX_RATE_PCT = 19.0;

/**
 * Rechnet den Bounty-Rabatt aus (P9 Welle A4).
 *
 * Der Rabatt gilt auf den PLANBETRAG, nicht auf Einmalgebuehren: ein Treuerabatt
 * bezieht sich auf das Abo, nicht auf eine gebuchte Premium-Anzeige. Ihn dort
 * mitlaufen zu lassen waere grosszuegig, aber unsauber — und beim naechsten
 * Preisgespraech nicht mehr erklaerbar.
 *
 * Kaufmaennisch gerundet und nach oben gedeckelt: mehr als der Planbetrag kann
 * nie abgezogen werden, auch wenn eine Fehlkonfiguration >100 % liefert.
 *
 * @returns {{ satz: number, betragCents: number }}
 */
export function berechneRabatt(planNettoCents, rabattProzent) {
  const satz = Number(rabattProzent);
  if (!Number.isFinite(satz) || satz <= 0) return { satz: 0, betragCents: 0 };
  const begrenzt = Math.min(100, satz);
  const betrag = Math.min(planNettoCents, Math.round(planNettoCents * begrenzt / 100));
  return { satz: begrenzt, betragCents: Math.max(0, betrag) };
}

/**
 * Generate a sequential invoice number from the DB sequence.
 * @param {import('pg').PoolClient} client
 * @returns {Promise<string>}
 */
async function nextInvoiceNumber(client) {
  const { rows } = await client.query("SELECT nextval('invoice_number_seq') AS seq");
  const seq = String(rows[0].seq).padStart(6, "0");
  const year = new Date().getFullYear();
  return `TC-${year}-${seq}`;
}

/**
 * Create a new invoice record when a plan is activated.
 *
 * @param {import('pg').Pool} pool
 * @param {object} opts
 * @param {string|null} opts.orgId
 * @param {string} opts.userId
 * @param {string} opts.plan  - 'BASIS' | 'PLUS' | 'PRO'
 * @param {number} opts.amountCents  - net amount (before tax)
 * @param {string|null} [opts.paymentSessionId]
 * @param {string|null} [opts.stripeInvoiceId]
 * @param {string|null} [opts.notes]
 * @returns {Promise<object>} Invoice row
 */
export async function createInvoice(pool, opts) {
  const {
    orgId, userId, plan, amountCents, paymentSessionId, stripeInvoiceId, notes,
    // P9/A4: Rabattsatz wird vom Aufrufer uebergeben und hier EINGEFROREN.
    // Bewusst nicht selbst nachgeschlagen: der Aufrufer weiss, ob der Betrag
    // bereits rabattiert eingezogen wurde (Stripe-Checkout) oder ob dieser
    // Beleg die Forderung selbst ist (Folgerechnung).
    discountPct, discountSource
  } = opts;
  const normalizedAmountCents = Number(amountCents);
  if (!plan || !Number.isFinite(normalizedAmountCents) || normalizedAmountCents < 0) {
    throw new Error("INVALID_INVOICE_INPUT");
  }
  const netAmountCents = Math.round(normalizedAmountCents);

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const dueAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // Net 14

  return await withTransaction(pool, async (client) => {
    const invoiceNumber = await nextInvoiceNumber(client);

    // Premium-Anzeigen: offene Einmalgebuehren dieser Org werden auf die Monatsrechnung
    // addiert (Owner-Modell; schema-tolerant — ohne Tabelle kommt [] zurueck).
    const { lockPendingCharges, markChargesInvoiced } = await import("./premiumListingService.js");
    const premiumCharges = orgId ? await lockPendingCharges(client, orgId) : [];
    const premiumCents = premiumCharges.reduce((s, c) => s + (Number(c.amount_cents) || 0), 0);

    // P9/A4: Der Rabatt greift auf den Planbetrag, nicht auf die Einmalgebuehren.
    // Ohne Rabatt sind bruttoNettoCents und combinedNetCents identisch — der
    // Betrag ist dann byte-genau der von vorher.
    const rabatt = berechneRabatt(netAmountCents, discountPct);
    const bruttoNettoCents = netAmountCents + premiumCents;
    const combinedNetCents = bruttoNettoCents - rabatt.betragCents;
    const taxAmount = Math.round(combinedNetCents * TAX_RATE_PCT / 100);
    const totalCents = combinedNetCents + taxAmount;

    const { rows } = await client.query(
      `INSERT INTO invoices (
         invoice_number, org_id, user_id,
         billing_period_start, billing_period_end,
         plan, amount_cents, tax_rate_pct, tax_amount_cents, total_cents,
         currency, status, payment_session_id, stripe_invoice_id,
         issued_at, due_at, notes,
         gross_amount_cents, discount_pct, discount_amount_cents, discount_source
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'issued',$12,$13,NOW(),$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        invoiceNumber,
        orgId || null,
        userId,
        // dateOnlyDE statt toISOString().split("T")[0]:
        //
        // `new Date(jahr, monat, 1)` ist lokale Mitternacht. In der Sommerzeit
        // (+02:00) schiebt toISOString() das um zwei Stunden zurueck — auf den
        // letzten Tag des VORMONATS. Jede Rechnung trug damit einen
        // Abrechnungszeitraum, der einen Tag zu frueh begann und endete; auf
        // einem Beleg ist das kein Schoenheitsfehler. Genau der Off-by-one, den
        // die DACH-first-Regel des Projekts benennt.
        dateOnlyDE(periodStart),
        dateOnlyDE(periodEnd),
        plan,
        combinedNetCents,
        TAX_RATE_PCT,
        taxAmount,
        totalCents,
        "EUR",
        paymentSessionId || null,
        stripeInvoiceId || null,
        dueAt.toISOString(),
        notes || null,
        bruttoNettoCents,
        rabatt.satz,
        rabatt.betragCents,
        rabatt.betragCents > 0 ? (discountSource || "bounty") : null
      ]
    );

    const invoice = rows[0];

    // Add a single line item for the subscription
    await client.query(
      `INSERT INTO invoice_items (invoice_id, description, quantity, unit_amount_cents, total_cents)
       VALUES ($1, $2, 1, $3, $4)`,
      [
        invoice.id,
        `TempConnect ${plan} — Monatliches Abonnement (${periodStart.toLocaleDateString("de-DE")} – ${periodEnd.toLocaleDateString("de-DE")})`,
        netAmountCents,
        netAmountCents
      ]
    );

    // Premium-Anzeigen als eigene Rechnungspositionen + Posten als 'invoiced' markieren.
    for (const c of premiumCharges) {
      await client.query(
        `INSERT INTO invoice_items (invoice_id, description, quantity, unit_amount_cents, total_cents)
         VALUES ($1, $2, 1, $3, $4)`,
        [invoice.id, c.description, c.amount_cents, c.amount_cents]
      );
    }
    await markChargesInvoiced(client, premiumCharges.map((c) => c.id), invoice.id);

    return invoice;
  }).then((invoice) => {
    // Auto-Ablage: Rechnung landet sofort als PDF im Dokumenten-Tresor (fire-and-forget).
    import("./documentIngestService.js").then((m) => m.ingestInvoicePdf(pool, invoice)).catch(swallow("invoiceService"));
    return invoice;
  });
}

/**
 * Mark an invoice as paid.
 * @param {import('pg').Pool} pool
 * @param {string} invoiceId
 * @returns {Promise<object|null>}
 */
export async function markInvoicePaid(pool, invoiceId) {
  const { rows } = await pool.query(
    `UPDATE invoices SET status = 'paid', paid_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status IN ('issued','overdue')
     RETURNING *`,
    [invoiceId]
  );
  return rows[0] || null;
}

/**
 * Mark an invoice as void.
 * @param {import('pg').Pool} pool
 * @param {string} invoiceId
 * @returns {Promise<object|null>}
 */
export async function voidInvoice(pool, invoiceId) {
  const { rows } = await pool.query(
    `UPDATE invoices SET status = 'void', updated_at = NOW()
     WHERE id = $1 AND status NOT IN ('paid','void')
     RETURNING *`,
    [invoiceId]
  );
  return rows[0] || null;
}

/**
 * List invoices for an org or user.
 * @param {import('pg').Pool} pool
 * @param {object} filters
 * @param {string|null} filters.orgId
 * @param {string|null} filters.userId
 * @param {string|null} filters.status
 * @param {number} [filters.limit]
 * @returns {Promise<object[]>}
 */
export async function listInvoices(pool, { orgId, userId, status, limit = 50 }) {
  const conditions = [];
  const params = [];

  if (orgId) {
    conditions.push(`i.org_id = $${params.push(orgId)}`);
  } else if (userId) {
    conditions.push(`i.user_id = $${params.push(userId)}`);
  }
  if (status) {
    conditions.push(`i.status = $${params.push(status)}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(Math.min(limit, 200));

  const { rows } = await pool.query(
    `SELECT i.*,
            COALESCE(o.name, u.company_name, u.email) AS billing_name
     FROM invoices i
     LEFT JOIN organizations o ON o.id = i.org_id
     LEFT JOIN users u ON u.id = i.user_id
     ${where}
     ORDER BY i.created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return rows;
}

/**
 * Get a single invoice with its line items.
 * @param {import('pg').Pool} pool
 * @param {string} invoiceId
 * @returns {Promise<object|null>}
 */
export async function getInvoice(pool, invoiceId) {
  const { rows } = await pool.query(
    `SELECT i.*,
            COALESCE(o.name, u.company_name, u.email) AS billing_name,
            o.tax_id AS billing_tax_id,
            u.vat_id AS user_vat_id
     FROM invoices i
     LEFT JOIN organizations o ON o.id = i.org_id
     LEFT JOIN users u ON u.id = i.user_id
     WHERE i.id = $1`,
    [invoiceId]
  );
  if (!rows[0]) return null;

  const { rows: items } = await pool.query(
    "SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY created_at ASC",
    [invoiceId]
  );

  return { ...rows[0], items };
}

/**
 * Export a list of invoices as a CSV string.
 * @param {object[]} invoices
 * @returns {string}
 */
export function exportInvoicesCsv(invoices) {
  const headers = [
    "invoice_number", "billing_name", "plan",
    "billing_period_start", "billing_period_end",
    "amount_eur", "tax_eur", "total_eur",
    "status", "issued_at", "paid_at",
    // P9/A4 bewusst ANGEHAENGT statt einsortiert: wer die Datei positionsbasiert
    // liest, bricht sonst. Ohne diese drei Spalten steht in der Buchhaltung ein
    // niedrigerer Betrag ohne Begruendung — genau das, was die Rabattfelder
    // verhindern sollen.
    "gross_eur", "discount_pct", "discount_eur"
  ];

  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const rows = invoices.map(inv => [
    esc(inv.invoice_number),
    esc(inv.billing_name),
    esc(inv.plan),
    esc(inv.billing_period_start),
    esc(inv.billing_period_end),
    esc(((inv.amount_cents || 0) / 100).toFixed(2)),
    esc(((inv.tax_amount_cents || 0) / 100).toFixed(2)),
    esc(((inv.total_cents || 0) / 100).toFixed(2)),
    esc(inv.status),
    esc(inv.issued_at ? dateOnlyDE(inv.issued_at) : ""),
    esc(inv.paid_at ? dateOnlyDE(inv.paid_at) : ""),
    esc((((inv.gross_amount_cents ?? inv.amount_cents) || 0) / 100).toFixed(2)),
    esc(Number(inv.discount_pct || 0).toFixed(2)),
    esc(((inv.discount_amount_cents || 0) / 100).toFixed(2))
  ].join(","));

  return [headers.join(","), ...rows].join("\n");
}

/**
 * Mark all overdue invoices (status = issued, due_at < NOW()) as overdue.
 * Intended to be called by a scheduled job.
 * @param {import('pg').Pool} pool
 * @returns {Promise<number>} count of updated rows
 */
export async function markOverdueInvoices(pool) {
  const { rowCount } = await pool.query(
    `UPDATE invoices SET status = 'overdue', updated_at = NOW()
     WHERE status = 'issued' AND due_at < NOW()`
  );
  return rowCount;
}
