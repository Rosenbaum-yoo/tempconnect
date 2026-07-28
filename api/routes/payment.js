import crypto from "crypto";
import express, { Router } from "express";
import { PLAN_LIMITS } from "../services/userService.js";
import * as paymentService from "../services/paymentService.js";
import * as invoiceService from "../services/invoiceService.js";
import * as pilotPolicyService from "../services/pilotPolicyService.js";
import * as subscriptionRequestService from "../services/subscriptionRequestService.js";
import * as quoteSnapshotService from "../services/subscriptionQuoteSnapshotService.js";
import * as auditLogService from "../services/auditLog.js";
import { describeBilling, mapStripeEvent, isStripeConfigured } from "../services/billingProviderService.js";
import { computeIndividuellQuote } from "../services/individuellPricingService.js";
import { PLAN } from "../config/planFeatures.js";
import { requireMfa } from "../middleware/requireMfa.js";
import { requireCompanyOrg, requireOrgNotSuspended } from "../middleware/orgAccess.js";
import * as orgAccessSuspensionService from "../services/orgAccessSuspensionService.js";

export function createPaymentRouter(deps) {
  const { pool, config, stripe, sendMail, getUserAndPlan, requireAuth, logger } = deps;
  const invoiceSvc = deps.invoiceService || invoiceService;
  // DI mit Real-Modul-Fallback (wie invoiceSvc): haelt den Self-Service-INDIVIDUELL-
  // Pfad und die Webhook-Aktivierungsbruecke testbar, ohne ~20 Pool-Queries der
  // Service-Transaktionen sequenzieren zu muessen. Produktiv (app.js) wird nichts
  // uebergeben → die echten Module greifen.
  const subReqSvc = deps.subscriptionRequestService || subscriptionRequestService;
  const quoteSvc = deps.quoteSnapshotService || quoteSnapshotService;
  const auditSvc = deps.auditLog || auditLogService;
  const orgSuspensionSvc = deps.orgAccessSuspensionService || orgAccessSuspensionService;
  const mfaGuard = requireMfa({ pool }); // MFA env-gesteuert (O-05): Default Audit-Only, scharf via MFA_ENFORCE
  // Tarif-/Subscription-Buchung ist ein Käufer-(Unternehmens-)Konzept: Worker und
  // sonstige Nicht-Company-Org-Typen dürfen keinen Plan buchen. Zentrale Guard-
  // Wiederverwendung (wie spendAnalytics/vendorPool/suppliers/reporting) statt eines
  // Inline-Rollenchecks. Greift VOR jedem Checkout-Handler — auch im Demo-Modus.
  const companyOrg = requireCompanyOrg(deps, {
    errorCode: "BUYER_ORG_REQUIRED",
    errorMessage: "Tarif-Buchungen stehen nur Unternehmensorganisationen zur Verfuegung."
  });
  // Kill-Switch-Durchsetzung: eine vom Betreiber gesperrte Org (access_suspended_at)
  // darf KEINE Self-Service-Buchung ausloesen — sonst unterlaeuft Self-Service den
  // Operator-Hold. Greift VOR Quote-Freeze/Stripe-Session auf beiden Checkout-Routen.
  const orgNotSuspended = requireOrgNotSuspended(deps, {});
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

  router.post("/payment/checkout", requireAuth, mfaGuard, companyOrg, orgNotSuspended, async (req, res) => {
    const plan = String(req.body?.plan || "");
    const paymentMethod = String(req.body?.payment_method || req.body?.method || "demo");
    if (!["BASIS", "PLUS", "PRO"].includes(plan)) return res.status(400).json({ error: "INVALID_PLAN" });
    const planInfo = PLAN_LIMITS[plan];
    const me = await getUserAndPlan(req.session.userId);
    // randomUUID() statt randomBytes(16).toString("hex"):
    //
    // `payment_sessions.id` ist eine UUID-Spalte. Postgres akzeptiert eine
    // bindestrichlose 32-Hex-Kette zwar als Eingabe, speichert sie aber
    // **normalisiert** — mit Bindestrichen. Der Checkout gab damit
    // "0123456789abcdef…" zurueck, waehrend jede spaetere Antwort
    // "01234567-89ab-cdef-…" lieferte: derselbe Vorgang unter zwei Namen.
    // Clients konnten ihren eigenen Checkout in `GET /payment/history` nicht
    // wiederfinden, und der Audit-Eintrag (`entity_id: checkoutId`) liess sich
    // nicht mehr mit der Zeile verbinden, die er beschreibt.
    const checkoutId = crypto.randomUUID();

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

  /* ── Self-Service INDIVIDUELL-Buchung (Phase 2, Slice B) ──────────
   * Der Konfigurator liefert NUR die Auswahl (Seats + Add-on-Keys). Der Preis
   * wird IMMER server-seitig deterministisch nachgerechnet (computeIndividuellQuote);
   * ein vom Client mitgeschickter Preis wird bewusst ignoriert ("never trust client price").
   *
   * Genau EINE Anfrage (new_individual) wird erzeugt und der Quote eingefroren —
   * das ist die Vertragswahrheit zum Buchungszeitpunkt (Manipulationsschutz-Basislinie).
   * Danach zwei Wege:
   *   (a) reine Self-Service-Auswahl + Stripe verfuegbar → Stripe-Subscription-Session
   *       (Aktivierung folgt NUR nach verifizierter Zahlung via Webhook, Slice C).
   *   (b) freigabepflichtig ODER kein Stripe → Anfrage-Modus (Staff/Owner uebernimmt).
   * Ungueltige Auswahl → 200 ok:false + errors (Zero-State, kein 500, keine Anfrage,
   * kein Geldfluss).
   * ───────────────────────────────────────────────────────────────── */
  router.post("/payment/checkout/individuell", requireAuth, mfaGuard, companyOrg, orgNotSuspended, async (req, res) => {
    const orgId = req.orgId || null;
    if (!orgId) return res.status(400).json({ error: "ORG_REQUIRED" });

    // Auswahl parsen — der Preis aus dem Body wird NICHT gelesen.
    const rawAddons = req.body?.addons;
    const addons = Array.isArray(rawAddons)
      ? rawAddons
      : typeof rawAddons === "string"
        ? rawAddons.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    const seats = req.body?.seats;
    const employeeCount = req.body?.employee_count;

    // Server-seitige, deterministische Preisrechnung (Single Source of Truth).
    const quote = computeIndividuellQuote({ seats, addons, employee_count: employeeCount });
    if (!quote.ok) {
      // Zero-State: keine Anfrage, kein Checkout, kein Geld — UI korrigiert die Auswahl.
      return res.status(200).json({ ok: false, errors: quote.errors, quote });
    }

    try {
      const me = await getUserAndPlan(req.session.userId);
      const seatsInt = quote.seats.requested;

      // 1) Anfrage (new_individual) erzeugen. desired_addons traegt die aufgeloesten
      //    Katalog-Add-ons; proposed_price_cents = server-gerechneter Monatspreis.
      const created = await subReqSvc.createRequest(pool, {
        request_type: subscriptionRequestService.REQUEST_TYPES.NEW_INDIVIDUAL,
        org_id: orgId,
        user_id: req.session.userId,
        contact_email: me?.email || req.body?.contact_email || null,
        contact_name: req.body?.contact_name || null,
        requester_company_name: req.body?.company_name || null,
        desired_plan: PLAN.INDIVIDUELL,
        desired_individual_tier: quote.tier || null,
        desired_addons: quote.addons,
        employee_count: Number.isFinite(Number(employeeCount)) ? Number(employeeCount) : seatsInt,
        user_count: seatsInt,
        proposed_price_cents: quote.total_monthly_cents,
        context: {
          source: "self_service_configurator",
          seats: seatsInt,
          requires_staff_approval: quote.requires_staff_approval === true,
          total_monthly_cents: quote.total_monthly_cents,
          total_onetime_cents: quote.total_onetime_cents
        },
        submitted_ip: req.ip || null,
        submitted_user_agent: req.headers?.["user-agent"] || null
      });
      const requestId = created.id;

      // 2) Quote einfrieren = Vertragspreis zum Buchungszeitpunkt (tamper-Basislinie).
      const frozen = await quoteSvc.freezeQuoteSnapshot(pool, { requestId, actorUserId: req.session.userId });
      if (!frozen.ok) {
        logger.error({ requestId, err: frozen.error }, "INDIVIDUELL checkout: quote freeze failed");
        return res.status(500).json({ error: "QUOTE_FREEZE_FAILED" });
      }

      const selfService = quote.requires_staff_approval !== true;
      const stripeAvailable = !!stripe && isStripeConfigured(config) && PAYMENT_MODE !== "demo";

      // (b) Anfrage-Modus: freigabepflichtig ODER kein Stripe → kein Checkout.
      if (!selfService || !stripeAvailable) {
        res.locals.audit = {
          action: "subscription_request.self_service_created",
          entity_type: "subscription_request",
          entity_id: requestId,
          details: {
            mode: "inquiry",
            org_id: orgId,
            requires_staff_approval: !selfService,
            stripe_available: stripeAvailable,
            total_monthly_cents: quote.total_monthly_cents
          }
        };
        return res.json({
          ok: true,
          mode: "inquiry",
          request_id: requestId,
          requires_staff_approval: !selfService,
          total_monthly_cents: quote.total_monthly_cents,
          total_onetime_cents: quote.total_onetime_cents,
          currency: quote.currency
        });
      }

      // (a) Self-Service-Checkout: EINE konsolidierte, wiederkehrende Position.
      //     Bezahlter Betrag == proposed_price_cents (kein Tax/Proration) →
      //     exakter Manipulationsschutz im Webhook (Slice C).
      // Kanonische UUID — siehe Begruendung beim ersten Checkout weiter oben:
      // `payment_sessions.id` ist UUID, eine bindestrichlose Kette kaeme
      // normalisiert zurueck und passte nicht mehr zum ausgegebenen Wert.
      const checkoutId = crypto.randomUUID();
      const addonSummary = quote.addons.length
        ? ` + ${quote.addons.map((a) => a.name).join(", ")}`
        : "";
      try {
        const stripeSession = await stripe.checkout.sessions.create({
          payment_method_types: ["card", "sepa_debit", "sofort", "giropay"],
          mode: "subscription",
          line_items: [{
            price_data: {
              currency: "eur",
              product_data: {
                name: "TempConnect INDIVIDUELL",
                description: `${seatsInt} Sitze${addonSummary}`
              },
              unit_amount: quote.total_monthly_cents,
              recurring: { interval: "month" }
            },
            quantity: 1
          }],
          customer_email: me?.email,
          client_reference_id: String(req.session.userId),
          metadata: {
            checkout_id: checkoutId,
            request_id: requestId,
            plan: PLAN.INDIVIDUELL,
            user_id: String(req.session.userId),
            org_id: orgId
          },
          success_url: stripeSuccessUrl,
          cancel_url: stripeCancelUrl
        });
        await paymentService.createPaymentSession(pool, {
          id: checkoutId,
          userId: req.session.userId,
          plan: PLAN.INDIVIDUELL,
          amount: quote.total_monthly_cents / 100,
          method: "stripe",
          stripeSessionId: stripeSession.id,
          orgId,
          requestId // Korrelation für den Aktivierungs-Diskriminator (Mig 130)
        });
        res.locals.audit = {
          action: "payment.checkout.individuell",
          entity_type: "payment_session",
          entity_id: checkoutId,
          details: {
            request_id: requestId,
            org_id: orgId,
            method: "stripe",
            total_monthly_cents: quote.total_monthly_cents
          }
        };
        return res.json({
          ok: true,
          mode: "stripe",
          request_id: requestId,
          checkout_id: checkoutId,
          stripe_session_id: stripeSession.id,
          redirect_url: stripeSession.url,
          total_monthly_cents: quote.total_monthly_cents,
          currency: quote.currency
        });
      } catch (e) {
        logger.error({ err: e, requestId }, "INDIVIDUELL checkout: stripe session failed");
        return res.status(500).json({ error: "STRIPE_ERROR", message: e.message });
      }
    } catch (e) {
      // Service-Fehler (z.B. CONTACT_EMAIL_REQUIRED, ADDON_NOT_AVAILABLE) → 4xx,
      // unerwartete Fehler → 500. Kein Geldfluss vor erfolgreicher Anfrage-Erzeugung.
      const code = e?.code || "CHECKOUT_FAILED";
      const status = e?.status || (code === "CHECKOUT_FAILED" ? 500 : 400);
      if (status >= 500) logger.error({ err: e }, "POST /payment/checkout/individuell");
      return res.status(status).json({ error: code, message: e.message });
    }
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

  /* ── Aktivierungsbruecke fuer Self-Service INDIVIDUELL (Phase 2, Slice C) ──
   * Wird vom Stripe-Webhook aufgerufen, wenn ein checkout.session.completed eine
   * request_id im Metadata traegt (= Self-Service-INDIVIDUELL). Aktivierung erfolgt
   * NUR nach im Webhook verifizierter Zahlung gegen den eingefrorenen Vertragspreis;
   * danach wird die Anfrage ueber die bestehende applyApprovedChange-Bruecke nach
   * 'active' getrieben (setzt org.plan=INDIVIDUELL + feature_bundle + billing_mode +
   * Add-ons). Idempotent (getPaymentSessionStatus + Status-Guard); jeder Frueh-Exit
   * laesst die Payment-Session offen → spaeterer Retry moeglich.
   * ───────────────────────────────────────────────────────────────── */
  async function handleIndividuellActivation(intent) {
    const checkoutId = intent.checkout_id;
    const requestId = intent.request_id;
    const userId = intent.user_id;
    if (!checkoutId || !requestId || !userId) {
      logger.warn({ checkoutId, requestId, userId }, "INDIVIDUELL webhook: missing identifiers");
      return;
    }
    try {
      // Idempotenz: bereits abgeschlossene Session → nichts tun.
      const existingStatus = await paymentService.getPaymentSessionStatus(pool, checkoutId);
      if (existingStatus === "completed") return;

      const reqRow = await subReqSvc.getRequest(pool, requestId);
      if (!reqRow) {
        logger.warn({ requestId, checkoutId }, "INDIVIDUELL webhook: request not found");
        return;
      }

      // Schon aktiv (Apply ok, aber completePaymentSession zuvor gescheitert):
      // nur die Payment-Session schliessen, NICHT erneut aktivieren.
      if (reqRow.status === subscriptionRequestService.STATUS.ACTIVE) {
        await paymentService.completePaymentSession(pool, checkoutId, {
          stripePaymentIntent: intent.stripe_payment_intent || undefined,
          stripeSubscriptionId: intent.stripe_subscription_id || undefined
        });
        return;
      }

      // Kill-Switch: eine vom Betreiber gesperrte Org darf NICHT per Zahlung aktiviert
      // werden — sonst wuerde die Aktivierung den Operator-Hold unterlaufen. Audit + Stopp,
      // Payment-Session bleibt offen (Staff prueft: Reaktivierung+Aktivierung ODER Erstattung).
      if (await orgSuspensionSvc.isOrgAccessSuspended(pool, reqRow.org_id)) {
        await auditSvc.writeAudit(pool, {
          action: "subscription_request.activation_blocked_suspended",
          entity_type: "subscription_request",
          entity_id: requestId,
          actor_id: userId || null,
          org_id: reqRow.org_id || null,
          details: { checkout_id: checkoutId, reason: "org_access_suspended" }
        });
        logger.warn({ requestId, checkoutId, orgId: reqRow.org_id }, "INDIVIDUELL webhook: org access suspended — activation blocked");
        return; // Payment-Session bleibt offen; Staff reaktiviert+aktiviert oder erstattet.
      }

      // Manipulationsschutz: bezahlter Netto-Betrag MUSS dem eingefrorenen
      // Vertragspreis exakt entsprechen. Mismatch → KEINE Aktivierung, Audit, Stopp.
      const expectedCents = reqRow.quote_snapshot?.proposed_price_cents;
      const paidCents = Number.isFinite(intent.amount_subtotal)
        ? intent.amount_subtotal
        : intent.amount_total;
      // Manipulationsschutz deckt Betrag UND Waehrung ab: die bezahlte Waehrung muss der
      // eingefrorenen Vertragswaehrung entsprechen (Blueprint-Haertung fuer Mehrwaehrung).
      const expectedCurrency = String(reqRow.quote_snapshot?.currency || "EUR").toLowerCase();
      const paidCurrency = String(intent.currency || "").toLowerCase();
      if (!Number.isFinite(expectedCents) || !Number.isFinite(paidCents) || paidCents !== expectedCents || !paidCurrency || paidCurrency !== expectedCurrency) {
        await auditSvc.writeAudit(pool, {
          action: "subscription_request.payment_amount_mismatch",
          entity_type: "subscription_request",
          entity_id: requestId,
          actor_id: userId || null,
          org_id: reqRow.org_id || null,
          details: {
            checkout_id: checkoutId,
            expected_cents: Number.isFinite(expectedCents) ? expectedCents : null,
            paid_cents: Number.isFinite(paidCents) ? paidCents : null,
            currency: intent.currency || null,
            expected_currency: expectedCurrency,
            stripe_subscription_id: intent.stripe_subscription_id || null
          }
        });
        logger.warn({ requestId, checkoutId, expectedCents, paidCents }, "INDIVIDUELL webhook: paid amount mismatch — activation blocked");
        return; // Payment-Session bleibt offen; Staff prueft/erstattet.
      }

      // Anfrage → accepted (falls noch nicht), dann ueber applyApprovedChange → active.
      // Die Zahlung IST die Annahme des Kunden (Self-Service); Actor = zahlender User.
      if (reqRow.status !== subscriptionRequestService.STATUS.ACCEPTED) {
        const appr = await subReqSvc.approve(pool, {
          requestId,
          actorUserId: userId,
          reason: "self_service_payment_confirmed",
          details: { source: "stripe_webhook", checkout_id: checkoutId }
        });
        if (!appr.ok) {
          logger.error({ requestId, checkoutId, error: appr.error, from: appr.from }, "INDIVIDUELL webhook: approve failed");
          return;
        }
      }

      const applied = await subReqSvc.applyApprovedChange(pool, {
        requestId,
        actorUserId: userId,
        reason: "stripe_payment_activation",
        // Der Webhook hat den Betrag/die Waehrung gegen den eingefrorenen Quote
        // verifiziert → er DARF die Self-Service-Anfrage aktivieren (Staff/Cron nicht).
        verifiedPayment: true
      });
      if (!applied.ok) {
        logger.error({ requestId, checkoutId, error: applied.error }, "INDIVIDUELL webhook: applyApprovedChange failed");
        return;
      }

      await paymentService.completePaymentSession(pool, checkoutId, {
        stripePaymentIntent: intent.stripe_payment_intent || undefined,
        stripeSubscriptionId: intent.stripe_subscription_id || undefined
      });

      // Rechnung + Bestaetigungsmail (Betrag = tatsaechlich bezahlt).
      try {
        await invoiceSvc.createInvoice(pool, {
          userId,
          orgId: reqRow.org_id || null,
          plan: PLAN.INDIVIDUELL,
          amountCents: paidCents,
          paymentSessionId: checkoutId,
          stripeInvoiceId: intent.stripe_invoice_id || null,
          notes: intent.stripe_payment_intent
            ? `stripe_payment_intent=${intent.stripe_payment_intent};request_id=${requestId}`
            : `request_id=${requestId}`
        });
      } catch (invoiceErr) {
        logger.warn({ err: invoiceErr.message, checkoutId }, "Invoice creation skipped (INDIVIDUELL webhook)");
      }
      try {
        const me = await getUserAndPlan(userId);
        if (me) await sendMail(me.email, "TempConnect: INDIVIDUELL aktiviert", "<h2>Vielen Dank fuer deine Buchung!</h2><p>Dein individueller Tarif wurde erfolgreich aktiviert.</p>");
      } catch (mailErr) {
        logger.warn({ err: mailErr.message, checkoutId }, "Activation mail skipped (INDIVIDUELL webhook)");
      }
    } catch (e) {
      logger.error({ err: e, requestId, checkoutId }, "INDIVIDUELL webhook processing");
    }
  }

  router.post("/payment/webhook/stripe", express.raw({ type: "application/json" }), async (req, res) => {
    if (!stripe) return res.status(400).json({ error: "STRIPE_NOT_CONFIGURED" });
    const sig = req.headers["stripe-signature"];
    if (!STRIPE_WEBHOOK_SECRET) {
      logger.warn("Stripe webhook called but STRIPE_WEBHOOK_SECRET is not set – event ignored");
      return res.status(400).json({ error: "WEBHOOK_SECRET_REQUIRED" });
    }
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody || req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      logger.warn({ err: err.message }, "Stripe webhook signature verification failed");
      return res.status(400).json({ error: "INVALID_SIGNATURE" });
    }
    // Provider-unabhängige Event-Semantik (billingProviderService) – EINE Stelle
    // entscheidet, was ein Event bedeutet. Seiteneffekte unverändert (preserve-first).
    const intent = mapStripeEvent(event);
    if (intent.kind === "activation" && intent.request_id) {
      // Self-Service-INDIVIDUELL (Slice C): Aktivierung NUR nach im Webhook
      // verifizierter Zahlung gegen den eingefrorenen Vertragspreis.
      await handleIndividuellActivation(intent);
    } else if (intent.kind === "activation") {
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
