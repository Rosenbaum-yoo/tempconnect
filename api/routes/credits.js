import crypto from "node:crypto";
import { Router } from "express";
import Stripe from "stripe";
import * as creditService from "../services/creditService.js";

export function createCreditsRouter(deps) {
  const { pool, requireAuth, logger, config = {} } = deps;
  const router = Router();

  /* Befund P1-22, Owner-Entscheidung 2026-08-21: Guthaben gibt es nur gegen
     Zahlung, und der Weg dorthin ist Stripe — derselbe, den die Abos gehen. */
  const STRIPE_SECRET_KEY = config.STRIPE_SECRET_KEY || "";
  const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
  const BASE_URL = (config.BASE_URL || "http://localhost:8080").replace(/\/$/, "");
  const erfolgUrl = (config.STRIPE_CREDITS_SUCCESS_URL || "").trim()
    || `${BASE_URL}/public/credits.html?payment=success&session_id={CHECKOUT_SESSION_ID}`;
  const abbruchUrl = (config.STRIPE_CREDITS_CANCEL_URL || "").trim()
    || `${BASE_URL}/public/credits.html?payment=cancelled`;

  router.get("/credits/balance", requireAuth, async (req, res) => {
    try {
      const account = await creditService.getBalance(pool, req.session.userId);
      res.json(account);
    } catch (e) { logger.error({ err: e }, "GET /credits/balance"); res.status(500).json({ error: "SERVER_ERROR" }); }
  });

  router.get("/credits/transactions", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 50;
      const rows = await creditService.getTransactionHistory(pool, req.session.userId, limit);
      res.json({ transactions: rows });
    } catch (e) { logger.error({ err: e }, "GET /credits/transactions"); res.status(500).json({ error: "SERVER_ERROR" }); }
  });

  router.get("/credits/packages", async (_req, res) => {
    try {
      const packages = await creditService.getPackages(pool);
      res.json({ packages });
    } catch (e) { logger.error({ err: e }, "GET /credits/packages"); res.status(500).json({ error: "SERVER_ERROR" }); }
  });

  /* ═══════════════════════════════════════════════════════════════════════
     Befund P1-22 — hier wurde ein BEPREISTES Paket ohne Bezahlschritt
     gutgeschrieben
     ═══════════════════════════════════════════════════════════════════════

     Die alte Fassung rief `purchasePackage` und war fertig: Paket nachschlagen,
     Guthaben plus Bonus gutschreiben, antworten. Kein Preis, keine Zahlung, nur
     `requireAuth`. Drei bepreiste Pakete stehen in der Datenbank
     (9,99 / 39,99 / 129,99 EUR).

     Kein aktives Leck war das nur, weil `spendCredits` keinen Aufrufer hatte —
     die Waehrung kaufte nichts. Ein schlafender Defekt, der am Tag der ersten
     Ausgabe aufgewacht waere.

     Jetzt: Sitzung erzeugen, Kunde zahlt bei Stripe, der signaturgepruefte
     Webhook schreibt gut (`routes/payment.js`). Diese Route schreibt NICHTS
     mehr — es gibt keinen Weg mehr von hier zur Gutschrift.

     OHNE STRIPE KEIN KAUF: ist kein Schluessel gesetzt, antwortet die Route mit
     503 statt auf einen kostenlosen Ersatzweg zu fallen. Genau dieser Ersatzweg
     war der Befund.                                                            */
  router.post("/credits/purchase", requireAuth, async (req, res) => {
    try {
      const { package_id } = req.body || {};
      if (!package_id) return res.status(400).json({ error: "PACKAGE_ID_REQUIRED" });

      if (!stripe) {
        return res.status(503).json({
          error: "PAYMENT_NOT_CONFIGURED",
          message: "Guthaben koennen nur gegen Zahlung erworben werden; Stripe ist nicht eingerichtet."
        });
      }

      const vorbereitet = await creditService.startPurchase(pool, package_id);
      if (vorbereitet.error) {
        const status = vorbereitet.error === "PACKAGE_NOT_FOUND" ? 404 : 400;
        return res.status(status).json({ error: vorbereitet.error });
      }

      /* Die Kauf-Referenz wird HIER erzeugt und wandert durch Stripe zurueck.
         Sie ist der Anker der Einmaligkeit: der eindeutige Index aus Migration
         186 laesst eine zweite Gutschrift darauf auflaufen. */
      const kaufReferenz = crypto.randomUUID();

      const sitzung = await stripe.checkout.sessions.create({
        payment_method_types: ["card", "sepa_debit", "sofort", "giropay"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "eur",
            product_data: {
              name: `TempConnect Guthaben: ${vorbereitet.paket.name}`,
              description: `${vorbereitet.gutschrift} Guthaben`
                + (vorbereitet.paket.bonus_pct ? ` (inkl. ${vorbereitet.paket.bonus_pct}% Bonus)` : "")
            },
            unit_amount: vorbereitet.preisCent
          },
          quantity: 1
        }],
        client_reference_id: String(req.session.userId),
        metadata: {
          checkout_id: kaufReferenz,
          credit_package_id: String(package_id),
          user_id: String(req.session.userId)
        },
        success_url: erfolgUrl,
        cancel_url: abbruchUrl
      });

      res.locals.audit = {
        action: "credits.checkout",
        entity_type: "credit_purchase",
        entity_id: kaufReferenz,
        details: { package_id, amount_cent: vorbereitet.preisCent, method: "stripe" }
      };
      res.json({
        checkout_id: kaufReferenz,
        mode: "stripe",
        stripe_session_id: sitzung.id,
        redirect_url: sitzung.url,
        package: vorbereitet.paket.name,
        credits: vorbereitet.gutschrift,
        amount_cent: vorbereitet.preisCent
      });
    } catch (e) {
      logger.error({ err: e }, "POST /credits/purchase");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
