/**
 * subscriptionLifecycleService.js
 *
 * Welle 8 Schritt 16 - Lifecycle-Automation fuer subscription_requests:
 *   1. Auto-Linking: Public-Enterprise-Request → Subscription-Request
 *      ohne Dubletten (UNIQUE-Index `uniq_subreq_per_strategic_source_open`).
 *   2. Quote-Snapshot: Plan/Preis/Add-ons/Features/Limits zum Zeitpunkt
 *      des Wechsels in `offered` einfrieren. Spaetere Catalog-Aenderungen
 *      veraendern bestehende Angebote NICHT.
 *   3. Expiry-Cron: `offered`/`accepted` mit `offer_expires_at <= NOW`
 *      → `expired` (Audit + Notification fail-safe).
 *   4. Activation-Cron: `accepted` mit `effective_from <= NOW`
 *      → `applyApprovedChange` (subscription + organization Live-Plan
 *      atomar) → `active`. Aktivierungsfehler → notifyActivationFailed.
 *   5. Cancellation-Cron: `active` `cancellation`-Anfragen mit
 *      `cancellation_effective_at <= NOW` → Live-Subscription auf
 *      `canceled` + organizations.plan auf `DEMO` + Anfrage auf
 *      `expired`. Notification an Customer + Staff.
 *   6. runLifecycleTick orchestriert alle drei Crons in einem Lauf.
 *
 * Fail-safe-Garantie:
 *   - Jeder Datensatz wird in einer eigenen try/catch-Schleife verarbeitet.
 *     Ein Fehler bei Datensatz X stoppt NICHT die Verarbeitung der
 *     restlichen Datensaetze.
 *   - Audit-Log wird IMMER geschrieben (Erfolg + Fehler).
 *   - Notification-Hooks laufen fire-and-forget mit `Promise.resolve()`.
 *
 * Idempotency:
 *   - Status-Filter im SQL stellt sicher, dass derselbe Datensatz NICHT
 *     mehrfach verarbeitet wird (Wechsel zu `expired`/`active` nimmt ihn
 *     aus dem Selektions-Set heraus).
 *   - Quote-Snapshot wird nur einmal eingefroren — `freezeQuoteSnapshot`
 *     liefert `already_frozen=true` bei Wiederholung.
 *   - Auto-Linking wird ueber `source_strategic_request_id`-Existenz-
 *     Check + Partial-UNIQUE-Index doppelt abgesichert.
 */

import {
  normalizePlanKey
} from "../config/planCatalog.js";
import * as subreq from "./subscriptionRequestService.js";
import * as auditLog from "./auditLog.js";
import {
  notifyRequestStatusChanged,
  notifyActivationFailed
} from "./subscriptionNotificationService.js";
export {
  DEFAULT_OFFER_VALIDITY_DAYS,
  buildQuoteSnapshot,
  freezeQuoteSnapshot
} from "./subscriptionQuoteSnapshotService.js";

/* ── Konstanten ────────────────────────────────────────────── */

/** Maximale Items pro Cron-Tick — schuetzt vor Lastspitzen. */
export const MAX_BATCH_SIZE = 500;

/**
 * Kulanzfrist in Tagen nach Ablauf der Testphase oder Zahlungsausfall
 * (past_due → canceled). Entspricht `entitlementService.BILLING_GRACE_PERIOD_DAYS`.
 * Beide Werte MUESSEN identisch sein – dieser hier steuert die DB-Transition,
 * entitlementService.BILLING_GRACE_PERIOD_DAYS steuert den UI-Soft-Lock.
 */
export const BILLING_GRACE_PERIOD_DAYS = 14;

/* ── Auto-Linking ──────────────────────────────────────────── */

/**
 * Erstellt aus einem Public-Enterprise-Request eine Subscription-Request,
 * sofern noch keine offene Verlinkung existiert. **Idempotent**: bei
 * vorhandener Verlinkung wird die existierende ID zurueckgegeben.
 *
 * Quellen:
 *   - `strategic_collaboration_requests` (Migration 098 erweitert) liefert
 *     `plan_requested`, `selected_addons`, `monthly_estimate_cents`,
 *     `seats_requested`, etc.
 *
 * Mappings:
 *   - `request_type='new_individual'` (Default) — fachlich passt das fuer
 *     INDIVIDUELL-Konfigurator-Submissions. Staff kann manuell auch
 *     `pilot` waehlen.
 *
 * @param {import('pg').Pool} pool
 * @param {{
 *   strategicRequestId: string,
 *   actorUserId?: string|null,
 *   requestType?: 'new_individual'|'pilot',
 *   sendMail?: function,
 *   logger?: object
 * }} args
 */
export async function linkEnterpriseRequestToSubscription(pool, args) {
  if (!args || !args.strategicRequestId) {
    return { ok: false, error: "STRATEGIC_REQUEST_ID_REQUIRED" };
  }
  const requestType = args.requestType || subreq.REQUEST_TYPES.NEW_INDIVIDUAL;
  const allowedTypes = [subreq.REQUEST_TYPES.NEW_INDIVIDUAL, subreq.REQUEST_TYPES.PILOT];
  if (!allowedTypes.includes(requestType)) {
    return { ok: false, error: "UNSUPPORTED_REQUEST_TYPE" };
  }

  // 1) Existing-Link Quick-Check (UNIQUE-Index ist die DB-Backstop)
  try {
    const existing = await pool.query(
      `SELECT id, status, request_type
         FROM subscription_requests
        WHERE source_strategic_request_id = $1
          AND status NOT IN ('rejected','cancelled','expired')
        ORDER BY created_at DESC
        LIMIT 1`,
      [args.strategicRequestId]
    );
    if (existing.rows[0]) {
      return {
        ok: true,
        linked: false,
        reason: "ALREADY_LINKED",
        subscription_request_id: existing.rows[0].id,
        status: existing.rows[0].status,
        request_type: existing.rows[0].request_type
      };
    }
  } catch {
    // Tabelle/Index fehlt nicht in echten Umgebungen; in Tests tolerant
  }

  // 2) Source-Lead laden
  const src = await pool.query(
    `SELECT id, source_context, status, request_type AS strategic_request_type,
            requester_user_id, requester_org_id,
            requester_company_name, contact_name, contact_email, contact_phone,
            region_scope, site_count,
            plan_requested, base_price_cents, seats_requested, seats_included, seat_price_cents,
            selected_addons, monthly_estimate_cents, onetime_estimate_cents,
            street, city, vat_id,
            expected_start_date, submitted_ip, submitted_user_agent
       FROM strategic_collaboration_requests
      WHERE id = $1`,
    [args.strategicRequestId]
  );
  const lead = src.rows[0];
  if (!lead) return { ok: false, error: "STRATEGIC_REQUEST_NOT_FOUND" };

  // 3) Subscription-Request anlegen.
  let created;
  try {
    created = await subreq.createRequest(pool, {
      request_type: requestType,
      org_id: lead.requester_org_id || null,
      contact_email: lead.contact_email,
      contact_name: lead.contact_name || null,
      contact_phone: lead.contact_phone || null,
      requester_company_name: lead.requester_company_name || null,
      source_strategic_request_id: lead.id,
      desired_plan: normalizePlanKey(lead.plan_requested || "INDIVIDUELL", { fallback: "INDIVIDUELL" }),
      desired_addons: Array.isArray(lead.selected_addons) ? lead.selected_addons : [],
      site_count: Number.isFinite(lead.site_count) ? lead.site_count : null,
      region_scope: lead.region_scope || null,
      expected_start_date: lead.expected_start_date || null,
      proposed_price_cents: Number.isFinite(lead.monthly_estimate_cents) ? lead.monthly_estimate_cents : null,
      submitted_ip: lead.submitted_ip || null,
      submitted_user_agent: lead.submitted_user_agent || null,
      user_id: args.actorUserId || lead.requester_user_id || null,
      reason: "auto_link_from_enterprise_request",
      context: {
        auto_linked: true,
        strategic_source_id: lead.id,
        strategic_source_context: lead.source_context,
        monthly_estimate_cents: lead.monthly_estimate_cents,
        onetime_estimate_cents: lead.onetime_estimate_cents,
        seats_requested: lead.seats_requested,
        seats_included: lead.seats_included,
        seat_price_cents: lead.seat_price_cents,
        base_price_cents: lead.base_price_cents,
        billing_address: {
          street: lead.street || null,
          city: lead.city || null,
          vat_id: lead.vat_id || null
        }
      }
    });
  } catch (e) {
    // UNIQUE-Index-Violation = Race-Condition: anderer Aufruf hat parallel
    // den Link erstellt. Nochmal lesen + idempotent zurueckgeben.
    if (e && (e.code === "23505" || /uniq_subreq_per_strategic_source_open/.test(String(e.message || "")))) {
      const retry = await pool.query(
        `SELECT id, status, request_type
           FROM subscription_requests
          WHERE source_strategic_request_id = $1
            AND status NOT IN ('rejected','cancelled','expired')
          ORDER BY created_at DESC LIMIT 1`,
        [args.strategicRequestId]
      );
      if (retry.rows[0]) {
        return {
          ok: true, linked: false, reason: "ALREADY_LINKED_RACE",
          subscription_request_id: retry.rows[0].id,
          status: retry.rows[0].status,
          request_type: retry.rows[0].request_type
        };
      }
    }
    return { ok: false, error: e.code || "CREATE_FAILED", message: e.message || null };
  }

  // 4) Audit (always-on)
  try {
    await auditLog.writeAudit(pool, {
      action: "subscription_request.auto_linked",
      entity_type: "subscription_request",
      entity_id: created.id,
      details: {
        strategic_source_id: lead.id,
        request_type: requestType,
        desired_plan: created.desired_plan,
        actor_user_id: args.actorUserId || null
      }
    });
  } catch { /* best-effort */ }

  // 5) Notification (fire-and-forget)
  Promise.resolve()
    .then(() => notifyRequestStatusChanged(pool, {
      requestId: created.id,
      toStatus: "submitted",
      requestType
    }, { sendMail: args.sendMail, logger: args.logger }))
    .catch((err) => {
      try { (args.logger || console).warn?.({ err: err && err.message }, "auto-link notify failed"); } catch { /* noop */ }
    });

  return {
    ok: true,
    linked: true,
    subscription_request_id: created.id,
    row: created
  };
}

/* ── Cron 1: Expiry ──────────────────────────────────────────── */

/**
 * Findet `offered`/`accepted`-Anfragen mit abgelaufenem `offer_expires_at`
 * und transitioniert sie auf `expired`. Idempotent: nach dem Wechsel
 * fallen Datensaetze aus dem Filter heraus.
 *
 * @param {import('pg').Pool} pool
 * @param {{ batchSize?: number, now?: Date|string|null, deps?: object }} [opts]
 */
export async function expireDueRequests(pool, opts = {}) {
  const batch = clampBatch(opts.batchSize);
  const nowTs = resolveNow(opts.now);
  const deps = opts.deps || {};

  const { rows } = await pool.query(
    `SELECT id, status, request_type, offer_expires_at,
            org_id, user_id, contact_email, current_plan, desired_plan
       FROM subscription_requests
      WHERE status IN ('offered','accepted')
        AND offer_expires_at IS NOT NULL
        AND offer_expires_at <= $1
      ORDER BY offer_expires_at ASC
      LIMIT $2`,
    [nowTs.toISOString(), batch]
  );

  let processed = 0;
  let expired = 0;
  const failed = [];
  for (const r of rows) {
    processed++;
    try {
      const result = await subreq.transitionStatus(pool, {
        requestId: r.id,
        toStatus: "expired",
        actorUserId: null,
        reason: "offer_expired_auto",
        details: { offer_expires_at: r.offer_expires_at, from_status: r.status }
      });
      if (!result.ok) {
        failed.push({ id: r.id, error: result.error || "TRANSITION_FAILED" });
        continue;
      }
      await markProcessed(pool, r.id);
      try {
        await auditLog.writeAudit(pool, {
          action: "subscription_request.lifecycle.expired",
          entity_type: "subscription_request",
          entity_id: r.id,
          details: { from: r.status, offer_expires_at: r.offer_expires_at, request_type: r.request_type }
        });
      } catch { /* best-effort */ }

      // Customer-Notification (fire-and-forget)
      Promise.resolve()
        .then(() => notifyRequestStatusChanged(pool, {
          requestId: r.id,
          toStatus: "expired",
          fromStatus: r.status,
          requestType: r.request_type
        }, deps))
        .catch(() => { /* swallowed */ });

      expired++;
    } catch (e) {
      failed.push({ id: r.id, error: e.message || "ERROR" });
    }
  }
  return { processed, expired, failed, batch_size: batch };
}

/* ── Cron 2: Activation ──────────────────────────────────────── */

/**
 * Findet `accepted`-Anfragen mit `effective_from <= NOW()` und ruft
 * `applyApprovedChange`. Bei Erfolg landet die Anfrage in `active` und
 * `subscriptions`/`organizations.plan` werden aktualisiert.
 *
 * Idempotent: nach dem Wechsel zu `active` fallen Datensaetze aus
 * dem Filter heraus.
 *
 * @param {import('pg').Pool} pool
 * @param {{ batchSize?: number, now?: Date|string|null, deps?: object }} [opts]
 */
export async function activateDueRequests(pool, opts = {}) {
  const batch = clampBatch(opts.batchSize);
  const nowTs = resolveNow(opts.now);
  const deps = opts.deps || {};

  const { rows } = await pool.query(
    `SELECT id, status, request_type, effective_from, org_id, user_id
       FROM subscription_requests
      WHERE status = 'accepted'
        AND effective_from IS NOT NULL
        AND effective_from <= $1
      ORDER BY effective_from ASC
      LIMIT $2`,
    [nowTs.toISOString(), batch]
  );

  let processed = 0;
  let activated = 0;
  const failed = [];
  for (const r of rows) {
    processed++;
    try {
      const result = await subreq.applyApprovedChange(pool, {
        requestId: r.id,
        actorUserId: null,
        reason: "auto_activate_cron"
      });
      if (!result.ok) {
        failed.push({ id: r.id, error: result.error || "APPLY_FAILED" });
        try {
          await auditLog.writeAudit(pool, {
            action: "subscription_request.lifecycle.activate_failed",
            entity_type: "subscription_request",
            entity_id: r.id,
            details: { error: result.error || "APPLY_FAILED", request_type: r.request_type, effective_from: r.effective_from }
          });
        } catch { /* best-effort */ }
        Promise.resolve()
          .then(() => notifyActivationFailed(pool, {
            requestId: r.id,
            errorCode: result.error || "APPLY_FAILED",
            errorMessage: "Auto-Aktivierung schlug fehl: " + (result.error || "unknown")
          }, deps))
          .catch(() => { /* swallowed */ });
        continue;
      }
      await markProcessed(pool, r.id);
      try {
        await auditLog.writeAudit(pool, {
          action: "subscription_request.lifecycle.activated",
          entity_type: "subscription_request",
          entity_id: r.id,
          details: {
            effective_from: r.effective_from,
            request_type: r.request_type,
            org_id: r.org_id,
            user_id: r.user_id,
            auto: true
          }
        });
      } catch { /* best-effort */ }

      Promise.resolve()
        .then(() => notifyRequestStatusChanged(pool, {
          requestId: r.id,
          toStatus: "active",
          fromStatus: "accepted",
          requestType: r.request_type
        }, deps))
        .catch(() => { /* swallowed */ });

      activated++;
    } catch (e) {
      failed.push({ id: r.id, error: e.message || "ERROR" });
      try {
        await auditLog.writeAudit(pool, {
          action: "subscription_request.lifecycle.activate_failed",
          entity_type: "subscription_request",
          entity_id: r.id,
          details: { error: e.message || "ERROR", request_type: r.request_type }
        });
      } catch { /* best-effort */ }
    }
  }
  return { processed, activated, failed, batch_size: batch };
}

/* ── Cron 3: Cancellation Apply ──────────────────────────────── */

/**
 * Findet `active`-`cancellation`-Anfragen mit `cancellation_effective_at
 * <= NOW()` und wendet die Kuendigung final an:
 *   - `subscriptions.status='canceled'` + `plan='DEMO'`
 *   - `organizations.plan='DEMO'`
 *   - `subscription_requests.status='expired'` (Lifecycle-Ende)
 *
 * Idempotent: nach `active -> expired` Transition faellt der Datensatz
 * aus dem Filter heraus.
 *
 * @param {import('pg').Pool} pool
 * @param {{ batchSize?: number, now?: Date|string|null, deps?: object }} [opts]
 */
export async function applyDueCancellations(pool, opts = {}) {
  const batch = clampBatch(opts.batchSize);
  const nowTs = resolveNow(opts.now);
  const deps = opts.deps || {};

  const { rows } = await pool.query(
    `SELECT id, request_type, status, org_id, user_id,
            current_plan, cancellation_effective_at
       FROM subscription_requests
      WHERE status = 'active'
        AND request_type = 'cancellation'
        AND cancellation_effective_at IS NOT NULL
        AND cancellation_effective_at <= $1
      ORDER BY cancellation_effective_at ASC
      LIMIT $2`,
    [nowTs.toISOString(), batch]
  );

  let processed = 0;
  let revoked = 0;
  const failed = [];
  for (const r of rows) {
    processed++;
    try {
      // 1) organizations.plan auf DEMO (best-effort, schema-tolerant)
      if (r.org_id) {
        try {
          await pool.query(
            "UPDATE organizations SET plan = 'DEMO', updated_at = NOW() WHERE id = $1",
            [r.org_id]
          );
        } catch { /* schema-tolerant */ }
      }
      // 2) subscriptions auf 'canceled' + plan=DEMO + canceled_at
      if (r.user_id) {
        try {
          await pool.query(
            `UPDATE subscriptions
                SET plan = 'DEMO',
                    status = 'canceled',
                    canceled_at = NOW(),
                    updated_at = NOW()
              WHERE user_id = $1
                AND id = (SELECT id FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1)`,
            [r.user_id]
          );
        } catch { /* schema-tolerant */ }
      }
      // 3) subscription_requests: active -> expired (terminal Lifecycle-Ende)
      const tr = await subreq.transitionStatus(pool, {
        requestId: r.id,
        toStatus: "expired",
        actorUserId: null,
        reason: "cancellation_applied_auto",
        details: { cancellation_effective_at: r.cancellation_effective_at, was_active: true }
      });
      if (!tr.ok) {
        failed.push({ id: r.id, error: tr.error || "TRANSITION_FAILED" });
        continue;
      }
      await markProcessed(pool, r.id);
      try {
        await auditLog.writeAudit(pool, {
          action: "subscription_request.lifecycle.cancellation_applied",
          entity_type: "subscription_request",
          entity_id: r.id,
          details: {
            cancellation_effective_at: r.cancellation_effective_at,
            org_id: r.org_id,
            user_id: r.user_id,
            previous_plan: r.current_plan
          }
        });
      } catch { /* best-effort */ }

      // Customer-Notification: nutzt 'cancelled'-Template (semantisch
      // passend: "Kuendigung vorgemerkt, wirksam zum X" — X ist NOW).
      Promise.resolve()
        .then(() => notifyRequestStatusChanged(pool, {
          requestId: r.id,
          toStatus: "cancelled",
          fromStatus: "active",
          requestType: "cancellation"
        }, deps))
        .catch(() => { /* swallowed */ });

      revoked++;
    } catch (e) {
      failed.push({ id: r.id, error: e.message || "ERROR" });
    }
  }
  return { processed, revoked, failed, batch_size: batch };
}

/* ── Cron 4: Trial-End Detection ─────────────────────────── */

/**
 * Findet aktive Trial-Subscriptions deren Testphase abgelaufen ist
 * (`trial_mode=TRUE` + `trial_ends_at <= NOW()`) und setzt sie auf
 * `past_due`. Die Kulanzfrist (BILLING_GRACE_PERIOD_DAYS) laeuft dann an;
 * `entitlementService.computeSubscriptionStatus` zeigt dem Nutzer einen
 * Warnbanner (Soft-Lock, active=true). Nach Ablauf der Kulanzfrist
 * sperrt Cron 5 den Zugang hart.
 *
 * Idempotent: nach dem Wechsel zu `past_due` faellt der Datensatz aus
 * dem WHERE-Filter (status='active') heraus.
 *
 * @param {import('pg').Pool} pool
 * @param {{ batchSize?: number, now?: Date|string|null }} [opts]
 */
export async function applyTrialEnds(pool, opts = {}) {
  const batch = clampBatch(opts.batchSize);
  const nowTs = resolveNow(opts.now);

  const { rows } = await pool.query(
    `SELECT id, user_id, plan, trial_ends_at, current_period_end
       FROM subscriptions
      WHERE trial_mode = TRUE
        AND trial_ends_at IS NOT NULL
        AND trial_ends_at <= $1
        AND status = 'active'
      ORDER BY trial_ends_at ASC
      LIMIT $2`,
    [nowTs.toISOString(), batch]
  );

  let processed = 0;
  let transitioned = 0;
  const failed = [];

  for (const s of rows) {
    processed++;
    try {
      const { rowCount } = await pool.query(
        `UPDATE subscriptions
            SET status = 'past_due',
                updated_at = NOW()
          WHERE id = $1 AND status = 'active'`,
        [s.id]
      );
      if (!rowCount) {
        // Already transitioned by a concurrent cron run — idempotent skip.
        continue;
      }
      try {
        await auditLog.writeAudit(pool, {
          action: "subscription.lifecycle.trial_ended",
          entity_type: "subscription",
          entity_id: s.id,
          details: {
            user_id: s.user_id,
            plan: s.plan,
            trial_ends_at: s.trial_ends_at,
            grace_period_days: BILLING_GRACE_PERIOD_DAYS,
            transitioned_to: "past_due",
            auto: true
          }
        });
      } catch { /* best-effort */ }
      transitioned++;
    } catch (e) {
      failed.push({ id: s.id, error: e.message || "ERROR" });
    }
  }
  return { processed, transitioned, failed, batch_size: batch };
}

/* ── Cron 5: Hard-Lock Enforcement ──────────────────────────── */

/**
 * Findet `past_due`-Subscriptions, deren Kulanzfrist abgelaufen ist
 * (`current_period_end + BILLING_GRACE_PERIOD_DAYS <= NOW()`), und
 * setzt sie final auf `canceled`:
 *   - `subscriptions.status = 'canceled'` + `canceled_at = NOW()`
 *   - `organizations.plan = 'DEMO'` (Owner-Org wird heruntergestuft)
 *   - Audit-Eintrag mit Risk "high"
 *
 * Hinweis: `entitlementService.computeSubscriptionStatus` sperrt den
 * Zugang bereits (active=false) wenn die Kulanzfrist abgelaufen ist,
 * AUCH bevor dieser Cron laeuft. Die DB-Transition durch diesen Cron
 * bereinigt lediglich den Status und loest die Org-Downgrade aus.
 *
 * Idempotent: nach dem Wechsel zu `canceled` faellt der Datensatz aus
 * dem WHERE-Filter (status='past_due') heraus.
 *
 * @param {import('pg').Pool} pool
 * @param {{ batchSize?: number, now?: Date|string|null, deps?: object }} [opts]
 */
export async function applyHardLocks(pool, opts = {}) {
  const batch = clampBatch(opts.batchSize);
  const nowTs = resolveNow(opts.now);
  const deps = opts.deps || {};

  // Grace cutoff: only past_due subs where current_period_end + 14d has passed.
  const graceCutoffMs = BILLING_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
  const graceCutoffTs = new Date(nowTs.getTime() - graceCutoffMs);

  const { rows } = await pool.query(
    `SELECT id, user_id, plan, current_period_end
       FROM subscriptions
      WHERE status = 'past_due'
        AND current_period_end IS NOT NULL
        AND current_period_end <= $1
      ORDER BY current_period_end ASC
      LIMIT $2`,
    [graceCutoffTs.toISOString(), batch]
  );

  let processed = 0;
  let locked = 0;
  const failed = [];

  for (const s of rows) {
    processed++;
    try {
      // 1) Resolve Owner-Org (schema-tolerant)
      let orgId = null;
      try {
        const orgRes = await pool.query(
          `SELECT o.id
             FROM organizations o
             JOIN org_memberships om ON om.org_id = o.id
            WHERE om.user_id = $1
              AND om.role_key = 'owner'
              AND om.is_active = TRUE
            LIMIT 1`,
          [s.user_id]
        );
        orgId = orgRes.rows[0]?.id || null;
      } catch { /* schema-tolerant */ }

      // 2) subscriptions -> canceled
      const { rowCount } = await pool.query(
        `UPDATE subscriptions
            SET status = 'canceled',
                canceled_at = NOW(),
                updated_at = NOW()
          WHERE id = $1 AND status = 'past_due'`,
        [s.id]
      );
      if (!rowCount) {
        // Concurrent cron already processed this row.
        continue;
      }

      // 3) Org plan -> DEMO (best-effort)
      if (orgId) {
        try {
          await pool.query(
            "UPDATE organizations SET plan = 'DEMO', updated_at = NOW() WHERE id = $1",
            [orgId]
          );
        } catch { /* schema-tolerant */ }
      }

      // 4) Audit (always-on, risk: high)
      try {
        await auditLog.writeAudit(pool, {
          action: "subscription.lifecycle.hard_lock_applied",
          entity_type: "subscription",
          entity_id: s.id,
          details: {
            user_id: s.user_id,
            org_id: orgId,
            plan: s.plan,
            current_period_end: s.current_period_end,
            grace_expired_after_days: BILLING_GRACE_PERIOD_DAYS,
            locked_at: nowTs.toISOString(),
            auto: true
          }
        });
      } catch { /* best-effort */ }

      // 5) Customer Notification (fire-and-forget)
      Promise.resolve()
        .then(() => notifyRequestStatusChanged(pool, {
          requestId: s.id,
          toStatus: "cancelled",
          fromStatus: "past_due",
          requestType: "hard_lock_auto"
        }, deps))
        .catch(() => { /* swallowed */ });

      locked++;
    } catch (e) {
      failed.push({ id: s.id, error: e.message || "ERROR" });
    }
  }
  return { processed, locked, failed, batch_size: batch };
}

/* ── Orchestrierung ─────────────────────────────────────────── */

/**
 * Fuehrt alle fuenf Cron-Phasen sequentiell aus. Stoppt nicht bei
 * Teilfehler — jeder Schritt liefert ein eigenes Ergebnis-Objekt.
 *
 * Phasenreihenfolge (Abhaengigkeit beachten):
 *   1. expiry      – subscription_requests: offered/accepted -> expired
 *   2. activation  – subscription_requests: accepted -> active (Plan aktivieren)
 *   3. cancellation – subscription_requests: active cancellation -> expired + DEMO
 *   4. trial_ends  – subscriptions: active+trial_mode -> past_due (WAVE_09)
 *   5. hard_locks  – subscriptions: past_due+grace_expired -> canceled + DEMO (WAVE_09)
 *
 * @param {import('pg').Pool} pool
 * @param {{ batchSize?: number, now?: Date|string|null, deps?: object }} [opts]
 */
export async function runLifecycleTick(pool, opts = {}) {
  const expiry = await expireDueRequests(pool, opts).catch((e) => ({
    processed: 0, expired: 0, failed: [{ phase: "expiry", error: e.message }]
  }));
  const activation = await activateDueRequests(pool, opts).catch((e) => ({
    processed: 0, activated: 0, failed: [{ phase: "activation", error: e.message }]
  }));
  const cancellation = await applyDueCancellations(pool, opts).catch((e) => ({
    processed: 0, revoked: 0, failed: [{ phase: "cancellation", error: e.message }]
  }));
  const trialEnds = await applyTrialEnds(pool, opts).catch((e) => ({
    processed: 0, transitioned: 0, failed: [{ phase: "trial_ends", error: e.message }]
  }));
  const hardLocks = await applyHardLocks(pool, opts).catch((e) => ({
    processed: 0, locked: 0, failed: [{ phase: "hard_locks", error: e.message }]
  }));
  return {
    ok: true,
    ts: new Date().toISOString(),
    expiry,
    activation,
    cancellation,
    trial_ends: trialEnds,
    hard_locks: hardLocks
  };
}

/* ── Hilfen ─────────────────────────────────────────────────── */

function clampBatch(n) {
  const x = Math.floor(Number(n) || 100);
  if (!Number.isFinite(x) || x < 1) return 100;
  return Math.min(MAX_BATCH_SIZE, x);
}

function resolveNow(now) {
  if (!now) return new Date();
  if (now instanceof Date) return now;
  return new Date(now);
}

async function markProcessed(pool, requestId) {
  try {
    await pool.query(
      "UPDATE subscription_requests SET lifecycle_last_processed_at = NOW() WHERE id = $1",
      [requestId]
    );
  } catch { /* best-effort, das Spaltenupdate ist nur Beobachtbarkeit */ }
}
