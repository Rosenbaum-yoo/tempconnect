/**
 * recurringBillingService.js
 *
 * SaaS-Self-Service-Billing — der bezahlte Zwilling von subscriptionLifecycleService.
 * Erweitert die bestehende Lifecycle-/Invoice-Infrastruktur (KEINE Parallelstruktur):
 *
 *   1. generateRecurringInvoices — Folge-Rechnung am Periodenende.
 *      Aktive, bezahlte (plan<>DEMO, kein Trial) Subscriptions mit
 *      `current_period_end <= NOW` erhalten eine neue Rechnung (invoiceService.createInvoice,
 *      Net-14, 19% USt) und werden auf `past_due` gesetzt — exakt analog zu
 *      `applyTrialEnds`. Damit greift die BESTEHENDE Grace-/Hard-Lock-Mechanik
 *      (`applyHardLocks`): unbezahlt nach 14 Tagen → `canceled` + Org auf DEMO.
 *      Bezahlt → `applyRenewalPayment` rollt die Periode weiter.
 *
 *   2. runDunningSweep — gestaffelte Zahlungserinnerungen (Mahnstufe 1..3)
 *      für überfällige Rechnungen, getrackt über `invoices.dunning_level` /
 *      `last_dunning_at` (Migration 142). Versendet pro Stufe genau eine Mail.
 *
 *   3. applyRenewalPayment — Happy-Path beim Zahlungseingang einer Folgerechnung
 *      (Staff-Aktion heute / Stripe `invoice.paid`-Webhook nach UG-Gründung):
 *      `past_due` → `active`, Periode +1 Monat.
 *
 * AKTIVIERUNG: ausschließlich über die Env-Flags RECURRING_BILLING_ENABLED /
 * DUNNING_ENABLED (Default AUS). Die /internal-Cron-Endpunkte sind No-Ops solange
 * die Flags aus sind — „kein Auto-Billing, solange manuelle Rechnung Default ist".
 *
 * Fail-safe (wie subscriptionLifecycleService):
 *   - Jeder Datensatz in eigener try/catch-Schleife; ein Fehler stoppt den Lauf nicht.
 *   - Audit-Log best-effort.
 *   - Status-Flip (active→past_due) UND Rechnungserstellung laufen ATOMAR in EINER Transaktion:
 *     Bricht der Prozess/die DB dazwischen ab, rollt alles zurück → kein „past_due ohne Rechnung"-
 *     Zombie. Der atomare `UPDATE … WHERE status='active'` hält zugleich den Row-Lock und dient als
 *     Idempotenz-/Concurrency-Guard (kein Doppel-Invoice bei Parallel-Lauf).
 */

import * as invoiceService from "./invoiceService.js";
import * as auditLog from "./auditLog.js";
import { getPlanPriceCentsByKey, normalizePlanKey } from "../config/planCatalog.js";
import { dunningEmail } from "./emailHtmlTemplates.js";
import { withTransaction } from "../utils/transaction.js";

/* ── Konstanten ────────────────────────────────────────────── */

/** Maximale Items pro Cron-Tick — schützt vor Lastspitzen (wie subscriptionLifecycleService). */
export const MAX_BATCH_SIZE = 500;

/**
 * Kulanzfrist in Tagen. MUSS identisch zu subscriptionLifecycleService.BILLING_GRACE_PERIOD_DAYS
 * und entitlementService.BILLING_GRACE_PERIOD_DAYS sein (Grace läuft ab current_period_end).
 */
export const BILLING_GRACE_PERIOD_DAYS = 14;

/**
 * Dunning-Stufen: Tage seit Rechnungs-Fälligkeit → Mahnstufe. Liegen innerhalb der
 * 14-Tage-Kulanz, damit die letzte Mahnung VOR dem Hard-Lock beim Kunden ankommt.
 */
export const DUNNING_STAGES = [
  { level: 1, afterDays: 3 },
  { level: 2, afterDays: 7 },
  { level: 3, afterDays: 11 }
];
export const MAX_DUNNING_LEVEL = 3;

/** Mindestabstand zwischen zwei Erinnerungen derselben Rechnung (Doppelversand-Schutz). */
const DUNNING_MIN_INTERVAL_HOURS = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

/* ── Helfer ─────────────────────────────────────────────────── */

function clampBatch(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return MAX_BATCH_SIZE;
  return Math.min(MAX_BATCH_SIZE, Math.floor(v));
}

function resolveNow(now) {
  if (now instanceof Date && !Number.isNaN(now.getTime())) return now;
  if (typeof now === "string" || typeof now === "number") {
    const d = new Date(now);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/**
 * Bestimmt die höchste fällige Mahnstufe, die noch nicht versendet wurde.
 * @param {number} daysOverdue
 * @param {number} currentLevel  bereits versendete Stufe (0 = keine)
 * @returns {number} neue Stufe (>currentLevel) oder 0 (keine neue Stufe fällig)
 */
export function resolveDunningLevel(daysOverdue, currentLevel) {
  let target = 0;
  for (const stage of DUNNING_STAGES) {
    if (Number(daysOverdue) >= stage.afterDays) target = stage.level;
  }
  return target > (Number(currentLevel) || 0) ? target : 0;
}

/**
 * Löst Owner-Org, Empfänger-E-Mail und Netto-Abrechnungspreis (Cent) einer
 * Subscription auf — exakt über denselben Owner-Org-Pfad wie applyHardLocks
 * (`org_memberships.role_key='owner'`). INDIVIDUELL nutzt den Vertragspreis der Org,
 * Katalog-Pläne den Katalogpreis.
 *
 * @param {import('pg').Pool} pool
 * @param {{ user_id: string, plan: string }} sub
 * @returns {Promise<{ orgId: string|null, orgName: string|null, email: string|null, amountCents: number|null }>}
 */
async function resolveOwnerBilling(pool, sub) {
  let row = null;
  try {
    const res = await pool.query(
      `SELECT o.id AS org_id, o.name AS org_name,
              o.billing_mode, o.individual_contract_price_cents,
              u.email AS user_email
         FROM org_memberships om
         JOIN organizations o ON o.id = om.org_id
         JOIN users u ON u.id = om.user_id
        WHERE om.user_id = $1 AND om.role_key = 'owner' AND om.is_active = TRUE
        LIMIT 1`,
      [sub.user_id]
    );
    row = res.rows[0] || null;
  } catch { /* schema-tolerant — Preis für Katalog-Pläne bleibt auflösbar */ }

  const planKey = normalizePlanKey(sub.plan, { fallback: null });
  let amountCents = null;
  if (planKey === "INDIVIDUELL") {
    const contract = Number(row?.individual_contract_price_cents);
    amountCents = Number.isFinite(contract) ? contract : null;
  } else if (planKey) {
    amountCents = getPlanPriceCentsByKey(planKey);
  }

  return {
    orgId: row?.org_id || null,
    orgName: row?.org_name || null,
    email: row?.user_email || null,
    amountCents
  };
}

/* ── 1) Recurring Invoice Generation ────────────────────────── */

/**
 * Erzeugt Folge-Rechnungen für fällige aktive Subscriptions und setzt sie auf
 * `past_due` (bezahlter Zwilling von applyTrialEnds). Flip + Rechnung laufen atomar in
 * einer Transaktion (Crash → Rollback, kein Zombie); der Flip ist Idempotenz-/Concurrency-Guard.
 * Subscriptions ohne auflösbaren Preis ODER ohne Owner-Org werden übersprungen + auditiert.
 *
 * @param {import('pg').Pool} pool
 * @param {{ batchSize?: number, now?: Date|string|null, logger?: object, createInvoice?: Function }} [opts]
 */
export async function generateRecurringInvoices(pool, opts = {}) {
  const batch = clampBatch(opts.batchSize);
  const nowTs = resolveNow(opts.now);
  const logger = opts.logger || null;
  const createInvoice = opts.createInvoice || invoiceService.createInvoice; // injizierbar für Tests

  const { rows } = await pool.query(
    `SELECT id, user_id, plan, current_period_start, current_period_end
       FROM subscriptions
      WHERE status = 'active'
        AND trial_mode = FALSE
        AND plan <> 'DEMO'
        AND current_period_end IS NOT NULL
        AND current_period_end <= $1
      ORDER BY current_period_end ASC
      LIMIT $2`,
    [nowTs.toISOString(), batch]
  );

  let processed = 0;
  let invoiced = 0;
  let skipped = 0;
  const failed = [];

  for (const s of rows) {
    processed++;
    try {
      const billing = await resolveOwnerBilling(pool, s);

      // Ohne auflösbaren Netto-Preis kann nicht abgerechnet werden
      // (z.B. INDIVIDUELL ohne hinterlegten Vertragspreis) → bewusst überspringen + auditieren.
      if (!Number.isFinite(Number(billing.amountCents)) || Number(billing.amountCents) <= 0) {
        skipped++;
        try {
          await auditLog.writeAudit(pool, {
            action: "subscription.recurring_invoice_skipped",
            entity_type: "subscription",
            entity_id: s.id,
            details: { user_id: s.user_id, plan: s.plan, reason: "NO_RESOLVABLE_PRICE", org_id: billing.orgId, auto: true }
          });
        } catch { /* best-effort */ }
        continue;
      }

      // Ohne auflösbaren Owner-Org-Kontext NICHT abrechnen — sonst entstünde eine verwaiste
      // Rechnung mit org_id=NULL (Org-Boundary-Verletzung). Tritt z.B. auf, wenn der Owner-Lookup
      // transient fehlschlägt (resolveOwnerBilling fängt DB-Fehler schema-tolerant ab → orgId=null).
      // Sauber überspringen + auditieren; Status bleibt 'active' → nächster Lauf versucht erneut.
      if (!billing.orgId) {
        skipped++;
        try {
          await auditLog.writeAudit(pool, {
            action: "subscription.recurring_invoice_skipped",
            entity_type: "subscription",
            entity_id: s.id,
            details: { user_id: s.user_id, plan: s.plan, reason: "NO_OWNER_ORG", auto: true }
          });
        } catch { /* best-effort */ }
        continue;
      }

      // Status-Flip (active→past_due) UND Rechnung ATOMAR: Crash/DB-Abbruch dazwischen → Rollback,
      // kein „past_due ohne Rechnung"-Zombie. Der UPDATE … WHERE status='active' hält den Row-Lock
      // bis COMMIT und ist zugleich Idempotenz-/Concurrency-Guard (kein Doppel-Invoice).
      // createInvoice erhält den Transaktions-Client; withTransaction erkennt den geschachtelten
      // Client (.release vorhanden) und öffnet KEINE zweite Transaktion.
      const invoice = await withTransaction(pool, async (client) => {
        const { rowCount } = await client.query(
          `UPDATE subscriptions
              SET status = 'past_due',
                  updated_at = NOW()
            WHERE id = $1 AND status = 'active'`,
          [s.id]
        );
        if (!rowCount) return null; // Parallel-Lauf hat den Datensatz bereits verarbeitet.
        return createInvoice(client, {
          orgId: billing.orgId,
          userId: s.user_id,
          plan: s.plan,
          amountCents: Number(billing.amountCents),
          notes: `Automatische Folgerechnung (Abo-Verlängerung) — Periode ab ${new Date(s.current_period_end).toISOString().slice(0, 10)}`
        });
      });

      if (!invoice) {
        // Row war beim Flip nicht mehr 'active' (Parallel-Lauf) → nichts erstellt.
        continue;
      }

      try {
        await auditLog.writeAudit(pool, {
          action: "subscription.recurring_invoice_issued",
          entity_type: "subscription",
          entity_id: s.id,
          details: {
            user_id: s.user_id,
            org_id: billing.orgId,
            plan: s.plan,
            amount_cents: Number(billing.amountCents),
            invoice_id: invoice?.id || null,
            invoice_number: invoice?.invoice_number || null,
            period_end_before: s.current_period_end,
            transitioned_to: "past_due",
            auto: true
          }
        });
      } catch { /* best-effort */ }

      invoiced++;
    } catch (e) {
      if (logger && typeof logger.warn === "function") {
        logger.warn({ subscription_id: s.id, err: e.message }, "recurring-billing: invoice failed for subscription");
      }
      failed.push({ id: s.id, error: e.message || "ERROR" });
    }
  }

  return { processed, invoiced, skipped, failed, batch_size: batch };
}

/* ── 2) Dunning Sweep ───────────────────────────────────────── */

/**
 * Versendet gestaffelte Zahlungserinnerungen für überfällige Abo-Rechnungen.
 * Pro Rechnung genau eine Mail je Stufe (getrackt über dunning_level/last_dunning_at).
 *
 * @param {import('pg').Pool} pool
 * @param {{ batchSize?: number, now?: Date|string|null, logger?: object, sendMail?: Function, baseUrl?: string }} [opts]
 */
export async function runDunningSweep(pool, opts = {}) {
  const batch = clampBatch(opts.batchSize);
  const nowTs = resolveNow(opts.now);
  const logger = opts.logger || null;
  const sendMail = typeof opts.sendMail === "function" ? opts.sendMail : null;
  const baseUrl = (opts.baseUrl || "").replace(/\/+$/, "");

  // Ohne Mailer kein Versand — die Erinnerung darf nicht „verloren" gehen (keine Markierung).
  if (!sendMail) {
    return { processed: 0, reminded: 0, skipped: 0, failed: [], batch_size: batch, note: "NO_MAILER" };
  }

  const cooldownTs = new Date(nowTs.getTime() - DUNNING_MIN_INTERVAL_HOURS * 60 * 60 * 1000);

  const { rows } = await pool.query(
    `SELECT i.id, i.invoice_number, i.user_id, i.org_id, i.total_cents, i.currency,
            i.due_at, i.dunning_level, i.last_dunning_at, i.plan,
            u.email AS user_email, o.name AS org_name
       FROM invoices i
       LEFT JOIN users u ON u.id = i.user_id
       LEFT JOIN organizations o ON o.id = i.org_id
      WHERE i.status = 'overdue'
        AND i.invoice_type = 'subscription'
        AND i.dunning_level < $1
        AND (i.last_dunning_at IS NULL OR i.last_dunning_at <= $2)
      ORDER BY i.due_at ASC
      LIMIT $3`,
    [MAX_DUNNING_LEVEL, cooldownTs.toISOString(), batch]
  );

  let processed = 0;
  let reminded = 0;
  let skipped = 0;
  const failed = [];

  for (const inv of rows) {
    processed++;
    try {
      const dueAt = inv.due_at ? new Date(inv.due_at) : null;
      const daysOverdue = dueAt ? Math.max(0, Math.floor((nowTs.getTime() - dueAt.getTime()) / DAY_MS)) : 0;

      const targetLevel = resolveDunningLevel(daysOverdue, inv.dunning_level || 0);
      if (!targetLevel) { skipped++; continue; } // noch keine neue Stufe fällig

      const email = inv.user_email;
      if (!email) { skipped++; continue; } // kein Empfänger → ohne Versand keine Markierung

      const graceUntil = dueAt
        ? new Date(dueAt.getTime() + BILLING_GRACE_PERIOD_DAYS * DAY_MS).toISOString().slice(0, 10)
        : null;
      const downloadUrl = baseUrl ? `${baseUrl}/public/sla_abo.html` : "";

      const { subject, html } = dunningEmail({
        invoiceNumber: inv.invoice_number,
        amount: (Number(inv.total_cents) || 0) / 100,
        currency: inv.currency || "EUR",
        dueDate: dueAt ? dueAt.toISOString().slice(0, 10) : "—",
        orgName: inv.org_name || "Ihre Organisation",
        level: targetLevel,
        daysOverdue,
        graceUntil,
        downloadUrl
      });

      const sent = await sendMail(email, subject, html);
      if (!sent) { failed.push({ id: inv.id, error: "MAIL_NOT_SENT" }); continue; }

      // Stufe erst NACH erfolgreichem Versand markieren.
      await pool.query(
        `UPDATE invoices
            SET dunning_level = $1, last_dunning_at = NOW(), updated_at = NOW()
          WHERE id = $2 AND status = 'overdue'`,
        [targetLevel, inv.id]
      );

      try {
        await auditLog.writeAudit(pool, {
          action: "invoice.dunning_reminder_sent",
          entity_type: "invoice",
          entity_id: inv.id,
          details: {
            invoice_number: inv.invoice_number,
            user_id: inv.user_id,
            org_id: inv.org_id,
            dunning_level: targetLevel,
            days_overdue: daysOverdue,
            auto: true
          }
        });
      } catch { /* best-effort */ }

      reminded++;
    } catch (e) {
      if (logger && typeof logger.warn === "function") {
        logger.warn({ invoice_id: inv.id, err: e.message }, "dunning-sweep: reminder failed for invoice");
      }
      failed.push({ id: inv.id, error: e.message || "ERROR" });
    }
  }

  return { processed, reminded, skipped, failed, batch_size: batch };
}

/* ── 3) Renewal Payment (Happy-Path) ────────────────────────── */

/**
 * Wird beim Zahlungseingang einer Folgerechnung aufgerufen (Staff-Aktion heute /
 * Stripe `invoice.paid`-Webhook nach UG-Gründung). Setzt eine `past_due`-Subscription
 * auf `active` zurück und rollt die Abrechnungsperiode +1 Monat. Idempotent (nur past_due).
 *
 * @param {import('pg').Pool} pool
 * @param {{ userId?: string, subscriptionId?: string, now?: Date|string }} [opts]
 * @returns {Promise<object|null>} aktualisierte Subscription-Zeile oder null
 */
export async function applyRenewalPayment(pool, opts = {}) {
  const nowTs = resolveNow(opts.now);
  const target = opts.subscriptionId
    ? { clause: "id = $1", param: opts.subscriptionId }
    : opts.userId
      ? { clause: "user_id = $1", param: opts.userId }
      : null;
  if (!target) throw new Error("RENEWAL_PAYMENT_TARGET_REQUIRED");

  const { rows } = await pool.query(
    `UPDATE subscriptions
        SET status = 'active',
            current_period_start = COALESCE(current_period_end, $2::timestamptz),
            current_period_end   = COALESCE(current_period_end, $2::timestamptz) + INTERVAL '1 month',
            updated_at = NOW()
      WHERE ${target.clause} AND status = 'past_due'
      RETURNING id, user_id, plan, status, current_period_start, current_period_end`,
    [target.param, nowTs.toISOString()]
  );

  const sub = rows[0] || null;
  if (sub) {
    try {
      await auditLog.writeAudit(pool, {
        action: "subscription.renewal_payment_applied",
        entity_type: "subscription",
        entity_id: sub.id,
        details: { user_id: sub.user_id, plan: sub.plan, new_period_end: sub.current_period_end, auto: true }
      });
    } catch { /* best-effort */ }
  }
  return sub;
}
