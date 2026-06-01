/**
 * Referral-Programm Routes — /api/referral/*
 *
 * Pilotkunden:  1 Monat gratis + max 6 Monate per Referral+Umfrage
 * Geworbene:    1 Monat gratis, dann Cashback per eigenem Referral+Umfrage (max 6)
 */

import { Router } from "express";
import { z } from "zod";
import * as refService from "../services/referralProgramService.js";

const inviteSchema = z.object({
  email: z.string().email().max(255)
});

const surveySchema = z.object({
  rating: z.number().int().min(1).max(5),
  feedback: z.string().max(2000).optional().nullable(),
  how_found: z.string().max(500).optional().nullable(),
  would_recommend: z.boolean().optional()
});

const trackSchema = z.object({
  referral_code: z.string().min(4).max(20),
  email: z.string().email().max(255).optional()
});

export function createReferralProgramRouter(deps) {
  const { pool, requireAuth, sendMail, logger } = deps;
  const router = Router();

  /* ── GET /api/referral/status — Vollstaendiger Referral-Status ── */
  router.get("/referral/status", requireAuth, async (req, res) => {
    try {
      const status = await refService.getReferralStatus(pool, req.session.userId);
      res.json(status);
    } catch (e) {
      logger.error({ err: e.message }, "GET /referral/status");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── POST /api/referral/register-pilot — Als Pilotkunde registrieren ── */
  router.post("/referral/register-pilot", requireAuth, async (req, res) => {
    try {
      const result = await refService.registerAsPilot(pool, req.session.userId);
      if (!result.ok) {
        return res.status(409).json({ error: result.error });
      }
      res.locals.audit = { action: "referral.register_pilot", entity_type: "referral_code", entity_id: result.referralCode.id };
      res.json(result);
    } catch (e) {
      logger.error({ err: e.message }, "POST /referral/register-pilot");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── GET /api/referral/code — Eigenen Referral-Code abrufen ──── */
  router.get("/referral/code", requireAuth, async (req, res) => {
    try {
      const codeRow = await refService.getOrCreateReferralCode(pool, req.session.userId);
      res.json({ code: codeRow.code, is_pilot: codeRow.is_pilot });
    } catch (e) {
      logger.error({ err: e.message }, "GET /referral/code");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── POST /api/referral/invite — Neuen Kunden einladen ──────── */
  router.post("/referral/invite", requireAuth, async (req, res) => {
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    try {
      const result = await refService.createReferralInvite(pool, req.session.userId, parsed.data.email);
      if (!result.ok) {
        return res.status(result.error === "MAX_REFERRALS_REACHED" ? 403 : 409).json({ error: result.error, limit: result.limit });
      }

      // E-Mail an den eingeladenen Kontakt
      try {
        const { rows } = await pool.query("SELECT company_name, email FROM users WHERE id = $1", [req.session.userId]);
        const sender = rows[0];
        const code = result.referral.referral_code;
        if (sender) {
          await sendMail(
            parsed.data.email,
            "TempConnect: Einladung zur Plattform",
            `<h2>Sie wurden eingeladen!</h2>
             <p><b>${sender.company_name || sender.email}</b> empfiehlt Ihnen TempConnect — die B2B-Plattform fuer Zeitarbeit und Personalvermittlung.</p>
             <p><b>Ihr Vorteil:</b> 1 Monat kostenlos testen!</p>
             <p>Registrieren Sie sich mit dem Empfehlungscode: <b style="font-size:18px;color:#4a9eff">${code}</b></p>
             <p style="margin-top:20px"><a href="${process.env.BASE_URL || 'https://tempconnect.de'}/?ref=${code}" style="background:#4a9eff;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Jetzt kostenlos starten</a></p>
             <p style="font-size:12px;color:#888;margin-top:20px">Nach der Registrierung und einer kurzen Umfrage erhaelt Ihr Empfehler einen weiteren Gratis-Monat.</p>`
          );
        }
      } catch (emailErr) {
        logger.warn({ err: emailErr?.message }, "Referral invite email failed");
      }

      res.locals.audit = { action: "referral.invite", entity_type: "referral", entity_id: result.referral.id, details: { referred_email: parsed.data.email } };
      res.status(201).json(result);
    } catch (e) {
      logger.error({ err: e.message }, "POST /referral/invite");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── POST /api/referral/track — Registrierung eines geworbenen Kunden ── */
  router.post("/referral/track", requireAuth, async (req, res) => {
    const parsed = trackSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    try {
      const { rows } = await pool.query("SELECT email FROM users WHERE id = $1", [req.session.userId]);
      const email = parsed.data.email || rows[0]?.email;
      const referral = await refService.trackReferralRegistration(pool, parsed.data.referral_code, req.session.userId, email);
      if (!referral) return res.status(404).json({ error: "REFERRAL_NOT_FOUND" });
      res.locals.audit = { action: "referral.track", entity_type: "referral", entity_id: referral.id };
      res.json({ ok: true, referral });
    } catch (e) {
      logger.error({ err: e.message }, "POST /referral/track");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── POST /api/referral/survey — Umfrage einreichen ─────────── */
  router.post("/referral/survey", requireAuth, async (req, res) => {
    const parsed = surveySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    try {
      const result = await refService.submitSurvey(pool, req.session.userId, parsed.data);
      if (!result.ok) {
        return res.status(result.error === "SURVEY_ALREADY_SUBMITTED" ? 409 : 404).json({ error: result.error });
      }
      res.locals.audit = { action: "referral.survey", entity_type: "referral_survey", details: { referral_id: result.referral_id, reward_type: result.reward_type } };
      res.json(result);
    } catch (e) {
      logger.error({ err: e.message }, "POST /referral/survey");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
