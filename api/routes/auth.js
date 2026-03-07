import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Router } from "express";
import * as geoService from "../services/geoService.js";
import * as authService from "../services/authService.js";

const registerSchema = z.object({
  role: z.enum(["company", "agency"]),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  company_name: z.string().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  postal_code: z.string().max(20).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  plan: z.enum(["FREE", "BASIS", "PLUS", "NOTDIENST"]).optional().default("FREE")
});

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128)
});

/**
 * @param {{ pool, config, sendMail, getUserAndPlan, requireAuth, authLimiter, logger }} deps
 */
export function createAuthRouter(deps) {
  const { pool, config, sendMail, getUserAndPlan, requireAuth, authLimiter, logger } = deps;
  const BASE_URL = config.BASE_URL || "http://localhost:8080";
  const router = Router();

  router.post("/auth/register", authLimiter, async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

    const { role, email, password, company_name, phone, postal_code, city } = parsed.data;
    try {
      if (await authService.emailExists(pool, email)) return res.status(409).json({ error: "EMAIL_EXISTS" });

      const password_hash = await bcrypt.hash(password, 10);
      const verification_token = crypto.randomBytes(32).toString("hex");

      const userId = await authService.createUser(pool, {
        role, email, passwordHash: password_hash,
        companyName: company_name, phone, postalCode: postal_code, city, verificationToken: verification_token
      });

      try {
        if (postal_code || city) {
          const coords = await geoService.geocode(postal_code || null, city || null);
          if (coords) await authService.setUserGeo(pool, userId, coords.lat, coords.lng);
        }
      } catch (geoErr) {
        logger.warn({ err: geoErr?.message }, "Geocoding bei Registrierung uebersprungen");
      }

      const selectedPlan = parsed.data.plan || "FREE";
      await authService.createSubscription(pool, userId, selectedPlan);

      const verifyUrl = `${BASE_URL}?verify=${verification_token}`;
      await sendMail(
        email,
        "TempConnect: Bitte bestätige deine E-Mail-Adresse",
        `<h2>Willkommen bei TempConnect!</h2>
       <p>Bitte klicke auf den folgenden Link, um deine E-Mail-Adresse zu bestätigen:</p>
       <p><a href="${verifyUrl}">${verifyUrl}</a></p>
       <p>Falls du dich nicht registriert hast, ignoriere diese E-Mail.</p>`
      );

      req.session.userId = userId;
      const me = await getUserAndPlan(userId);
      res.locals.audit = { action: "auth.register", entity_type: "user", entity_id: userId, details: { role, email } };
      res.json({ ...me, verification_sent: true });
    } catch (e) {
      logger.error({ err: e }, "POST /api/auth/register");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/auth/verify/:token", async (req, res) => {
    const token = String(req.params.token || "");
    if (!token) return res.status(400).json({ error: "INVALID_TOKEN" });
    try {
      const verified = await authService.verifyEmail(pool, token);
      if (!verified) return res.status(404).json({ error: "TOKEN_NOT_FOUND" });
      res.json({ ok: true, email: verified.email });
    } catch (e) {
      logger.error({ err: e }, "GET /api/auth/verify");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/auth/resend-verification", requireAuth, async (req, res) => {
    try {
      const info = await authService.getVerificationInfo(pool, req.session.userId);
      if (!info) return res.status(404).json({ error: "USER_NOT_FOUND" });
      if (info.is_verified) return res.json({ ok: true, already_verified: true });
      let token = info.verification_token;
      if (!token) {
        token = crypto.randomBytes(32).toString("hex");
        await authService.setVerificationToken(pool, req.session.userId, token);
      }
      const verifyUrl = `${BASE_URL}?verify=${token}`;
      await sendMail(
        info.email,
        "TempConnect: Bitte bestätige deine E-Mail-Adresse",
        `<h2>E-Mail-Bestätigung</h2><p>Bitte klicke auf den folgenden Link, um deine E-Mail-Adresse zu bestätigen:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`
      );
      res.locals.audit = { action: "auth.resend_verification", entity_type: "user", entity_id: req.session.userId };
      res.json({ ok: true, sent: true });
    } catch (e) {
      logger.error({ err: e }, "POST /api/auth/resend-verification");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/auth/login", authLimiter, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    const { email, password } = parsed.data;
    try {
      const creds = await authService.getUserCredentials(pool, email);
      if (!creds) return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "E-Mail oder Passwort falsch." });
      const ok = await bcrypt.compare(password, creds.password_hash);
      if (!ok) return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "E-Mail oder Passwort falsch." });
      req.session.userId = creds.id;
      const me = await getUserAndPlan(creds.id);
      res.locals.audit = { action: "auth.login", entity_type: "user", entity_id: creds.id, details: { email } };
      res.json(me);
    } catch (e) {
      logger.error({ err: e }, "POST /api/auth/login");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/auth/logout", (req, res) => {
    const userId = req.session.userId;
    req.session.destroy(() => {
      res.locals.audit = { action: "auth.logout", entity_type: "user", entity_id: userId };
      res.clearCookie("tc.sid");
      res.json({ ok: true });
    });
  });

  router.post("/auth/forgot-password", authLimiter, async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "EMAIL_REQUIRED" });
    try {
      const u = await authService.getUserByEmail(pool, email);
      if (!u) return res.json({ ok: true, message: "Falls ein Konto existiert, wurde eine E-Mail gesendet." });
      const resetToken = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000);
      await authService.setResetToken(pool, u.id, resetToken, expires);
      const resetUrl = `${BASE_URL}?reset=${resetToken}`;
      await sendMail(
        u.email,
        "TempConnect: Passwort zurücksetzen",
        `<h2>Passwort zurücksetzen</h2>
       <p>Du hast eine Passwort-Zurücksetzung angefordert.</p>
       <p>Klicke auf den folgenden Link, um ein neues Passwort zu setzen:</p>
       <p><a href="${resetUrl}" style="background:#635bff;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Neues Passwort setzen</a></p>
       <p style="margin-top:20px;color:#666">Der Link ist 1 Stunde gültig.</p>
       <p style="color:#666">Falls du keine Zurücksetzung angefordert hast, ignoriere diese E-Mail.</p>`
      );
      res.locals.audit = { action: "auth.forgot_password", entity_type: "user", details: { email } };
      res.json({ ok: true, message: "Falls ein Konto existiert, wurde eine E-Mail gesendet." });
    } catch (e) {
      logger.error({ err: e }, "POST /api/auth/forgot-password");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/auth/reset-password/:token", async (req, res) => {
    const token = String(req.params.token || "");
    if (!token) return res.status(400).json({ error: "INVALID_TOKEN" });
    try {
      const u = await authService.validateResetToken(pool, token);
      if (!u) return res.status(400).json({ error: "TOKEN_EXPIRED", message: "Der Link ist ungültig oder abgelaufen." });
      res.json({ ok: true, email: u.email });
    } catch (e) {
      logger.error({ err: e }, "GET /api/auth/reset-password/:token");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/auth/reset-password", authLimiter, async (req, res) => {
    const token = String(req.body?.token || "");
    const password = String(req.body?.password || "");
    if (!token) return res.status(400).json({ error: "TOKEN_REQUIRED" });
    if (!password || password.length < 8) return res.status(400).json({ error: "PASSWORD_TOO_SHORT", message: "Mindestens 8 Zeichen." });
    try {
      const u = await authService.validateResetToken(pool, token);
      if (!u) return res.status(400).json({ error: "TOKEN_EXPIRED", message: "Der Link ist ungültig oder abgelaufen." });
      const password_hash = await bcrypt.hash(password, 10);
      await authService.resetPassword(pool, u.id, password_hash);
      res.locals.audit = { action: "auth.password_reset", entity_type: "user", entity_id: u.id };
      await sendMail(
        u.email,
        "TempConnect: Passwort wurde geändert",
        `<h2>Passwort geändert</h2><p>Dein Passwort wurde erfolgreich geändert.</p><p>Falls du diese Änderung nicht durchgeführt hast, kontaktiere uns sofort!</p>`
      );
      res.json({ ok: true, message: "Passwort wurde erfolgreich geändert." });
    } catch (e) {
      logger.error({ err: e }, "POST /api/auth/reset-password");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
