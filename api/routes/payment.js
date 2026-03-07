import crypto from "crypto";
import express from "express";
import { Router } from "express";
import { PLAN_LIMITS } from "../services/userService.js";
import * as paymentService from "../services/paymentService.js";

export function createPaymentRouter(deps) {
  const { pool, config, stripe, sendMail, getUserAndPlan, requireAuth, logger } = deps;
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

  router.get("/payment/config", (req, res) => {
    res.json({
      mode: PAYMENT_MODE,
      stripe_enabled: !!STRIPE_SECRET_KEY,
      stripe_publishable_key: STRIPE_PUBLISHABLE_KEY || null,
      paypal_enabled: !!PAYPAL_CLIENT_ID,
      plans: PLAN_LIMITS
    });
  });

  router.post("/payment/checkout", requireAuth, async (req, res) => {
    const plan = String(req.body?.plan || "");
    const paymentMethod = String(req.body?.payment_method || req.body?.method || "demo");
    if (!["BASIS", "PLUS", "NOTDIENST"].includes(plan)) return res.status(400).json({ error: "INVALID_PLAN" });
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
                description: plan === "BASIS" ? "5 Anfragen, 5 Karteikarten/Monat" : plan === "PLUS" ? "20 Anfragen, 20 Karteikarten/Monat" : "Unbegrenzt + Notdienst"
              },
              unit_amount: planInfo.price * 100,
              recurring: { interval: "month" }
            },
            quantity: 1
          }],
          customer_email: me.email,
          client_reference_id: req.session.userId.toString(),
          metadata: { checkout_id: checkoutId, plan, user_id: req.session.userId.toString() },
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

  router.post("/payment/confirm", requireAuth, async (req, res) => {
    const checkoutId = String(req.body?.checkout_id || "");
    if (!checkoutId) return res.status(400).json({ error: "MISSING_CHECKOUT_ID" });
    try {
      const paymentSession = await paymentService.getPaymentSession(pool, checkoutId, req.session.userId);
      if (!paymentSession) return res.status(404).json({ error: "SESSION_NOT_FOUND" });
      if (paymentSession.status === "completed") return res.status(400).json({ error: "ALREADY_COMPLETED" });
      if (PAYMENT_MODE === "demo" || paymentSession.method === "demo") {
        await paymentService.activatePlan(pool, req.session.userId, paymentSession.plan);
        await paymentService.completePaymentSession(pool, checkoutId);
        const me = await getUserAndPlan(req.session.userId);
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
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const checkoutId = session.metadata?.checkout_id;
      const plan = session.metadata?.plan;
      const userId = session.metadata?.user_id;
      if (checkoutId && plan && userId) {
        try {
          const existingStatus = await paymentService.getPaymentSessionStatus(pool, checkoutId);
          if (existingStatus === "completed") return res.json({ received: true });
          await paymentService.activatePlan(pool, userId, plan);
          await paymentService.completePaymentSession(pool, checkoutId, {
            stripePaymentIntent: session.payment_intent || undefined,
            stripeSubscriptionId: session.subscription || undefined
          });
          const me = await getUserAndPlan(userId);
          if (me) await sendMail(me.email, "TempConnect: Abo aktiviert - " + plan, "<h2>Vielen Dank fuer dein Abo!</h2><p>Dein Plan <b>" + plan + "</b> wurde erfolgreich aktiviert.</p>");
        } catch (e) {
          logger.error({ err: e }, "Stripe webhook processing");
        }
      }
    } else if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const subId = subscription.id;
      try {
        const row = await paymentService.getPaymentSessionByStripeSubscriptionId(pool, subId);
        if (row && row.user_id) {
          await paymentService.activatePlan(pool, row.user_id, "FREE");
          logger.info({ userId: row.user_id, stripeSubscriptionId: subId }, "User plan set to FREE after subscription deleted");
        }
      } catch (e) {
        logger.error({ err: e, stripeSubscriptionId: subId }, "Stripe subscription.deleted processing");
      }
    }
    res.json({ received: true });
  });

  router.post("/payment/webhook/paypal", async (req, res) => {
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
