/**
 * Oeffentliche Pilot-Voranmeldung (Marktstart One-Pager).
 *  - POST /pilot-preregistration  : anlegen (kein Auth) + Double-Opt-in-Mail + Owner-Benachrichtigung.
 *  - GET  /pilot-preregistration/confirm?token=… : Opt-in bestaetigen -> Redirect zum One-Pager.
 *  - GET  /pilot-preregistration/counts : oeffentlicher "X von 30"-Zaehler (keine personenbezogenen Daten).
 * Schutz: Honeypot + globaler /api/ Rate-Limit + Unique-Email-Constraint. CSRF greift global
 * (die Seite holt den Token via GET /api/csrf, wie der anonyme Login-Flow). Kein Enumeration-Leak.
 */
import { Router } from "express";
import { z } from "zod";
import * as prereg from "../services/pilotPreregistrationService.js";

const schema = z.object({
  side: z.enum(["company", "agency"]),
  sector: z.enum(["logistik", "pflege", "industrie", "andere"]).optional(),
  org_name: z.string().min(1).max(200),
  contact_name: z.string().min(1).max(160),
  email: z.string().email().max(320),
  phone: z.string().max(60).optional().nullable(),
  company_size: z.string().max(60).optional().nullable(),
  einsatzort_confirmed: z.boolean().optional(),
  capacity_or_need: z.string().max(2000).optional().nullable(),
  message: z.string().max(2000).optional().nullable(),
  referred_by: z.string().max(200).optional().nullable(),
  source: z.string().max(120).optional().nullable(),
});

export function createPilotPreregistrationRouter(deps) {
  const { pool, logger, config, sendMail } = deps;
  const router = Router();

  router.get("/pilot-preregistration/counts", async (req, res) => {
    try {
      const counts = await prereg.getPublicCounts(pool, req.query.cohort || undefined);
      res.json({ success: true, data: counts });
    } catch (e) {
      logger.error({ err: e.message }, "prereg counts");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  router.post("/pilot-preregistration", async (req, res) => {
    // Honeypot: gefuelltes verstecktes Feld -> stiller Erfolg (Bot ohne Hinweis abweisen).
    if (req.body && typeof req.body.website === "string" && req.body.website.trim() !== "") {
      return res.status(202).json({ success: true, data: { status: "ok" } });
    }
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION", details: parsed.error.issues } });
    }
    try {
      const meta = { ip: req.ip, userAgent: String(req.get("user-agent") || "").slice(0, 300) };
      let result;
      try {
        result = await prereg.createPrereg(pool, parsed.data, meta);
      } catch (e) {
        // Kein Enumeration-Leak: Duplikat = gleiche Erfolgsmeldung wie Neuanmeldung.
        if (e.code === "ALREADY_REGISTERED") return res.json({ success: true, data: { status: "pending" } });
        if (["INVALID_EMAIL", "INVALID_SIDE", "MISSING_FIELDS"].includes(e.code)) {
          return res.status(400).json({ success: false, error: { code: e.code } });
        }
        throw e;
      }

      const base = (config.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
      const confirmUrl = `${base}/api/pilot-preregistration/confirm?token=${encodeURIComponent(result.rawToken)}`;

      // Opt-in-Mail an den Bewerber (best-effort).
      try {
        await sendMail({
          to: parsed.data.email,
          subject: "Bitte bestätigen: Ihre Pilot-Voranmeldung bei TempConnect",
          text: `Danke für Ihr Interesse am TempConnect-Pilot (Einsatzort Hamburg).\n`
              + `Bitte bestätigen Sie Ihre Voranmeldung: ${confirmUrl}\n\nWir melden uns persönlich bei Ihnen.`,
          html: `<p>Danke für Ihr Interesse am <strong>TempConnect</strong>-Pilot (Einsatzort Hamburg).</p>`
              + `<p><a href="${confirmUrl}">Voranmeldung bestätigen</a></p>`
              + `<p>Wir melden uns persönlich bei Ihnen.</p>`,
        });
      } catch (mailErr) { logger.warn({ err: mailErr.message }, "prereg optin mail failed"); }

      // Owner-Benachrichtigung (best-effort) — fuer schnelles Telefon-Follow-up.
      if (config.PILOT_NOTIFY_EMAIL) {
        try {
          await sendMail({
            to: config.PILOT_NOTIFY_EMAIL,
            subject: `Neue Pilot-Voranmeldung: ${parsed.data.org_name} (${parsed.data.side})`,
            text: `Org: ${parsed.data.org_name}\nSeite: ${parsed.data.side}\nBranche: ${parsed.data.sector || "-"}\n`
                + `Kontakt: ${parsed.data.contact_name} · ${parsed.data.email} · ${parsed.data.phone || "-"}\n`
                + `Kapazität/Bedarf: ${parsed.data.capacity_or_need || "-"}`,
          });
        } catch (notifyErr) { logger.warn({ err: notifyErr.message }, "prereg owner notify failed"); }
      }

      res.json({ success: true, data: { status: "pending" } });
    } catch (e) {
      logger.error({ err: e.message }, "prereg create");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  router.get("/pilot-preregistration/confirm", async (req, res) => {
    try {
      const r = await prereg.confirmPrereg(pool, String(req.query.token || ""));
      res.redirect(`/public/onepager.html?confirmed=${r ? "1" : "0"}`);
    } catch (e) {
      logger.error({ err: e.message }, "prereg confirm");
      res.redirect("/public/onepager.html?confirmed=0");
    }
  });

  return router;
}
