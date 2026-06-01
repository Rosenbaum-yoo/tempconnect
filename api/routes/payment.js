import crypto from "crypto";
import express, { Router } from "express";
import { PLAN_LIMITS } from "../services/userService.js";
import * as paymentService from "../services/paymentService.js";
import * as invoiceService from "../services/invoiceService.js";
import * as pilotPolicyService from "../services/pilotPolicyService.js";
import { describeBilling, mapStripeEvent } from "../services/billingProviderService.js";
import { requireMfa } from "../middleware/requireMfa.js";

export function createPaymentRouter(deps) {
  const { pool, config, stripe, sendMail, getUserAndPlan, requireAuth, logger } = deps;
  const invoiceSvc = deps.invoiceService || invoiceService;
  const mfaGuard = requireMfa({ pool, enforce: false });
  const PAYMENT_MODE = config.PAYMENT_MODE || "demo";
  const STRIPE_SECRET_KEY = config.STRIPE_SECRET_KEY || "";
  const STRIPE_PUBLISHABLE_KEY = config.STRIPE_PUBLISHABLE_KEY || "";
  const STRIPE_WEBHOOK_SECRET = config.STRIPE_WEBHOOK_SECRET || "";
  const STRIPE_SUCCESS_URL = (config.STRIPE_SUCCESS_URL || "").trim();
  const STRIPE_CANCEL_URL = (config.STRIPE_CANCEL_URL || "").trim();
  const PAYPAL_CLIENT_ID = config.PAYPAL_CLIENT_ID || "";
  const BASE_URL = (config.BASE_URL || "http://localhost:8080").replace(/\/$/, "");
  const router = Router();

  const stripeSuccessUrl = STRIPE_SUCCESS_URL || `${BASE_URL}/public/sla_abo.html?payment=success&session_id={CHECKOUT_SESSION_ID}`;
  const stripeCancelUrl = STRIPE_CANCEL_URL || `${BASE_URL}/public/sla_abo.html?payment=cancelled`;
  const stripeCustomerPortalEnabled = !!(STRIPE_SECRET_KEY && stripe?.billingPortal?.sessions?.create);

  function safePortalReturnUrl(value) {
    const fallback = `${BASE_URL}/public/sla_abo.html`;
    if (!value) return fallback;
    try {
      const base = new URL(BASE_URL);
      const url = new URL(String(value), BASE_URL);
      if (url.origin !== base.origin) return fallback;
      return url.toString();
    } catch {
      return fallback;
    }
  }

  function euroToCents(amountEuro) {
    const value = Number(amountEuro);
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.round(value * 100);
  }

  router.get("/payment/config", (req, res) => {
    res.json({
      mode: PAYMENT_MODE,
      stripe_enabled: !!STRIPE_SECRET_KEY,
      stripe_publishable_key: STRIPE_PUBLISHABLE_KEY || null,
      stripe_customer_portal_enabled: stripeCustomerPortalEnabled,
      stripe_customer_portal_endpoint: stripeCustomerPortalEnabled ? "/api/payment/customer-portal" : null,
      paypal_enabled: !!PAYPAL_CLIENT_ID,
      billing: describeBilling(config),
      plans: PLAN_LIMITS
    });
  });

  router.post("/payment/customer-portal", requireAuth, mfaGuard, async (req, res) => {
    if (!stripeCustomerPortalEnabled) {
      return res.status(404).json({ error: { code: "STRIPE_CUSTOMER_PORTAL_UNAVAILABLE" } });
    }
    try {
      const latest = await paymentService.getLatestStripeSessionForCustomerPortal(pool, {
        userId: req.session.userId,
        orgId: req.orgId || null
      });
      if (!latest?.stripe_session_id) {
        return res.status(404).json({ error: { code: "STRIPE_CUSTOMER_NOT_FOUND" } });
      }
      const checkoutSession = await stripe.checkout.sessions.retrieve(latest.stripe_session_id);
      const customerId = typeof checkoutSession.customer === "string"
        ? checkoutSession.customer
        : checkoutSession.customer?.id;
      if (!customerId) {
        return res.status(409).json({ error: { code: "STRIPE_CUSTOMER_NOT_FOUND" } });
      }
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: safePortalReturnUrl(req.body?.return_url)
      });
      res.locals.audit = {
        action: "payment.customer_portal.create",
        entity_type: "payment_session",
        entity_id: latest.id,
        details: { provider: "stripe", org_id: latest.org_id || null }
      };
      res.json({ success: true, data: { url: portal.url } });
    } catch (e) {
      logger.error({ err: e }, "POST /api/payment/customer-portal");
      res.status(500).json({ error: { code: "STRIPE_CUSTOMER_PORTAL_ERROR", message: e.message } });
    }
  });

  router.post("/payment/checkout", requireAuth, mfaGuard, async (req, res) => {
    const plan = String(req.body?.plan || "");
    const paymentMethod = String(req.body?.payment_method || req.body?.method || "demo");
    if (!["BASIS", "PLUS", "PRO"].includes(plan)) return res.status(400).json({ error: "INVALID_PLAN" });
    const planInfo = PLAN_LIMITS[plan];
    const me = await getUserAndPlan(req.session.userId);
    const checkoutId = crypto.randomBytes(16).toString("hex");

    if (PAYMENT_MODE === "demo" || paymentMethod === "demo") {
      await paymentService.createPaymentSession(pool, { id: checkoutId, userId: req.session.userId, plan, amount: planInfo.price, method: "demo", orgId: req.orgId });
      res.locals.audit = { action: "payment.checkout", entity_type: "payment_session", entity_id: checkoutId, details: { plan, method: "demo", amount: planInfo.price } };
      return res.json({ checkout_id: checkoutId, mode: "demo", plan, amount: planInfo.price, currency: "EUR" });
    }
    if (paymentMethod === "stripe" && stripe) {
      try {
        const stripeSession = await stripe.checkout.sessions.create({
          payment_method_types: ["card", "sepa_debit", "sofort", "giropay"],
          mode: "subscription",
          line_items: [{
            price_data: {
              currency: "eur",
              product_data: {
                name: `TempConnect ${plan}`,
              description: plan === "BASIS" ? "5 Anfragen, 5 Karteikarten/Monat" : plan === "PLUS" ? "20 Anfragen, 20 Karteikarten/Monat" : "Unbegrenzt + Erweitertes Matching"
              },
              unit_amount: planInfo.price * 100,
              recurring: { interval: "month" }
            },
            quantity: 1
          }],
          customer_email: me.email,
          client_reference_id: req.session.userId.toString(),
          metadata: { checkout_id: checkoutId, plan, user_id: req.session.userId.toString(), org_id: req.orgId || "" },
          success_url: stripeSuccessUrl,
          cancel_url: stripeCancelUrl
        });
        await paymentService.createPaymentSession(pool, { id: checkoutId, userId: req.session.userId, plan, amount: planInfo.price, method: "stripe", stripeSessionId: stripeSession.id, orgId: req.orgId });
        res.locals.audit = { action: "payment.checkout", entity_type: "payment_session", entity_id: checkoutId, details: { plan, method: "stripe", amount: planInfo.price } };
        return res.json({ checkout_id: checkoutId, mode: "stripe", stripe_session_id: stripeSession.id, redirect_url: stripeSession.url, plan, amount: planInfo.price });
      } catch (e) {
        return res.status(500).json({ error: "STRIPE_ERROR", message: e.message });
      }
    }
    if (paymentMethod === "paypal" && PAYPAL_CLIENT_ID) {
      await paymentService.createPaymentSession(pool, { id: checkoutId, userId: req.session.userId, plan, amount: planInfo.price, method: "paypal", orgId: req.orgId });
      res.locals.audit = { action: "payment.checkout", entity_type: "payment_session", entity_id: checkoutId, details: { plan, method: "paypal", amount: planInfo.price } };
      return res.json({ checkout_id: checkoutId, mode: "paypal", redirect_url: `https://paypal.com/placeholder/${checkoutId}`, plan, amount: planInfo.price });
    }
    res.status(400).json({ error: "PAYMENT_METHOD_NOT_AVAILABLE" });
  });

  router.post("/payment/confirm", requireAuth, mfaGuard, async (req, res) => {
    const checkoutId = String(req.body?.checkout_id || "");
    if (!checkoutId) return res.status(400).json({ error: "MISSING_CHECKOUT_ID" });
    try {
      const paymentSession = await paymentService.getPaymentSession(pool, checkoutId, req.session.userId);
      if (!paymentSession) return res.status(404).json({ error: "SESSION_NOT_FOUND" });
      if (paymentSession.status === "completed") return res.status(400).json({ error: "ALREADY_COMPLETED" });
      if (PAYMENT_MODE === "demo" || paymentSession.method === "demo") {
        await paymentService.activatePlan(pool, req.session.userId, paymentSession.plan);
        const orgId = paymentSession.org_id || null;
        if (orgId) {
          try {
            await pilotPolicyService.convertPilotForOrganization(pool, {
              orgId,
              actorUserId: req.session.userId,
              plan: paymentSession.plan
            });
          } catch (pilotErr) {
            logger.warn({ err: pilotErr?.message, orgId }, "Pilot conversion skipped on payment confirm");
          }
        }
        await paymentService.completePaymentSession(pool, checkoutId);
        const me = await getUserAndPlan(req.session.userId);
        // Generate invoice for demo / manual confirm
        try {
          const fallbackPlanPriceEur = PLAN_LIMITS[paymentSession.plan]?.price ?? 0;
          const amountCents = euroToCents(paymentSession.amount ?? fallbackPlanPriceEur);
          await invoiceSvc.createInvoice(pool, {
            userId: req.session.userId,
            orgId: paymentSession.org_id || null,
            plan: paymentSession.plan,
            amountCents,
            paymentSessionId: checkoutId,
            notes: `source=payment_confirm_demo;method=${paymentSession.method || "demo"}`
          });
        } catch (invoiceErr) {
          logger.warn({ err: invoiceErr.message }, "Invoice creation skipped (demo confirm)");
        }
        await sendMail(me.email, "TempConnect: Abo aktiviert - " + paymentSession.plan,
          "<h2>Vielen Dank fuer dein Abo!</h2><p>Dein Plan <b>" + paymentSession.plan + "</b> wurde erfolgreich aktiviert.</p><p>Betrag: <b>" + paymentSession.amount + " EUR</b></p><p>Du kannst jetzt alle Funktionen deines Plans nutzen.</p>");
        const updatedMe = await getUserAndPlan(req.session.userId);
        res.locals.audit = { action: "payment.confirm", entity_type: "payment_session", entity_id: checkoutId, details: { plan: paymentSession.plan, method: "demo" }, old_values: { status: "pending" }, new_values: { status: "completed" } };
        return res.json({ ok: true, user: updatedMe });
      }
      if (paymentSession.status !== "paid") return res.status(402).json({ error: "PAYMENT_PENDING" });
    } catch (e) {
      logger.error({ err: e }, "POST /api/payment/confirm");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/payment/webhook/stripe", express.raw({ type: "application/json" }), async (req, res) => {
    if (!stripe) return res.status(400).json({ error: "STRIPE_NOT_CONFIGURED" });
    const sig = req.headers["stripe-signature"];
    if (!STRIPE_WEBHOOK_SECRET) {
      logger.warn("Stripe webhook called but STRIPE_WEBHOOK_SECRET is not set – event ignored");
      return res.status(400).json({ error: "WEBHOOK_SECRET_REQUIRED" });
    }
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      logger.warn({ err: err.message }, "Stripe webhook signature verification failed");
      return res.status(400).json({ error: "INVALID_SIGNATURE" });
    }
    // Provider-unabhängige Event-Semantik (billingProviderService) – EINE Stelle
    // entscheidet, was ein Event bedeutet. Seiteneffekte unverändert (preserve-first).
    const intent = mapStripeEvent(event);
    if (intent.kind === "activation") {
      const checkoutId = intent.checkout_id;
      const plan = intent.plan;
      const userId = intent.user_id;
      if (checkoutId && plan && userId) {
        try {
          const existingStatus = await paymentService.getPaymentSessionStatus(pool, checkoutId);
          if (existingStatus === "completed") return res.json({ received: true });
          await paymentService.activatePlan(pool, userId, plan);
          let orgId = intent.org_id || null;
          if (!orgId) {
            const persistedSession = await paymentService.getPaymentSession(pool, checkoutId, userId);
            orgId = persistedSession?.org_id || null;
          }
          if (orgId) {
            try {
              await pilotPolicyService.convertPilotForOrganization(pool, {
                orgId,
                actorUserId: userId,
                plan
              });
            } catch (pilotErr) {
              logger.warn({ err: pilotErr?.message, orgId, checkoutId }, "Pilot conversion skipped on stripe webhook");
            }
          }
          await paymentService.completePaymentSession(pool, checkoutId, {
            stripePaymentIntent: intent.stripe_payment_intent || undefined,
            stripeSubscriptionId: intent.stripe_subscription_id || undefined
          });
          const me = await getUserAndPlan(userId);
          // Generate invoice on successful Stripe checkout
          try {
            const planInfo = PLAN_LIMITS[plan];
            await invoiceSvc.createInvoice(pool, {
              userId,
              orgId,
              plan,
              amountCents: euroToCents(planInfo?.price ?? 0),
              paymentSessionId: checkoutId,
              stripeInvoiceId: intent.stripe_invoice_id || null,
              notes: intent.stripe_payment_intent ? `stripe_payment_intent=${intent.stripe_payment_intent}` : null
            });
          } catch (invoiceErr) {
            logger.warn({ err: invoiceErr.message, checkoutId }, "Invoice creation skipped (stripe webhook)");
          }
          if (me) await sendMail(me.email, "TempConnect: Abo aktiviert - " + plan, "<h2>Vielen Dank fuer dein Abo!</h2><p>Dein Plan <b>" + plan + "</b> wurde erfolgreich aktiviert.</p>");
          // Referral-Reward qualifizieren wenn geworbener Kunde bezahltes Abo abschliesst
          try {
            const { qualifyReferralReward } = await import("../services/referralProgramService.js");
            await qualifyReferralReward(pool, userId);
          } catch { /* referral non-critical */ }
        } catch (e) {
          logger.error({ err: e }, "Stripe webhook processing");
        }
      }
    } else if (intent.kind === "cancellation") {
      const subId = intent.stripe_subscription_id;
      try {
        const row = await paymentService.getPaymentSessionByStripeSubscriptionId(pool, subId);
        if (row && row.user_id) {
          await paymentService.activatePlan(pool, row.user_id, "FREE");
          logger.info({ userId: row.user_id, stripeSubscriptionId: subId }, "User plan set to FREE(DEMO) after subscription deleted");
        }
      } catch (e) {
        logger.error({ err: e, stripeSubscriptionId: subId }, "Stripe subscription.deleted processing");
      }
    } else if (intent.kind === "payment_failed") {
      // Enterprise-Dunning ist operator-getrieben: KEIN Auto-Cancel, KEINE Kunden-Mail,
      // KEINE Status-Mutation hier. Der Fehlversuch wird für die Ops-Sicht protokolliert;
      // offene Forderungen werden in der SCC-Billing-Sicht als überfällige Rechnungen
      // sichtbar. Terminaler Fall läuft über customer.subscription.deleted.
      logger.warn({
        stripeSubscriptionId: intent.stripe_subscription_id,
        stripeInvoiceId: intent.stripe_invoice_id,
        attemptCount: intent.attempt_count,
        nextPaymentAttempt: intent.next_payment_attempt
      }, "Stripe invoice.payment_failed (observability only, no auto-action)");
    }
    res.json({ received: true });
  });

  /* ── Dunning: Stripe invoice.payment_failed ──────────────────── */
  // Slice 3: Der Webhook protokolliert invoice.payment_failed (kind "payment_failed")
  // als Ops-Signal — bewusst OHNE Auto-Cancel/Mail/Status-Mutation (Enterprise-Dunning
  // ist operator-getrieben, Default-Provider=manual/Rechnung). Stripe versucht die
  // Zahlung 3x über 7 Tage; der terminale Fall läuft über customer.subscription.deleted.
  // Sichtbarkeit offener Forderungen = überfällige Rechnungen in der SCC-Billing-Sicht.

  router.post("/payment/webhook/paypal", (_req, res) => {
    res.json({ received: true });
  });

  router.get("/payment/history", requireAuth, async (req, res) => {
    try {
      const rows = await paymentService.getPaymentHistory(pool, req.session.userId);
      res.json(rows);
    } catch (e) {
      logger.error({ err: e }, "GET /api/payment/history");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
