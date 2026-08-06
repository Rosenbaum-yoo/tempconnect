import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Router } from "express";
import * as geoService from "../services/geoService.js";
import * as authService from "../services/authService.js";
import * as workerService from "../services/workerService.js";
import * as pilotPolicyService from "../services/pilotPolicyService.js";
import { writeAudit } from "../services/auditLog.js";
import { trackProductEvent, deriveCustomerSegment } from "../services/productAnalyticsService.js";
import { catchAsync } from "../utils/routeHandler.js";
import { domainLogger, swallow } from "../utils/logger.js";
import { stampSession, bindSessionToDevice, destroyAllUserSessions, countUserSessions } from "../services/sessionSecurityService.js";
import { isEnforceSSO } from "../services/ssoService.js";
import * as totpService from "../services/totpService.js";

import { getIndividualTierByEmployeeCount } from "../config/planFeatures.js";
import { classifyCompanySize } from "../services/pricingTierService.js";

const VALID_SIZE_CLASSES = ["I", "II", "III", "IV"];
const SIZE_CLASS_EMPLOYEE_DEFAULTS = { I: 15, II: 100, III: 500, IV: 2000 };

const registerSchema = z.object({
  role: z.enum(["company", "agency"]),
  org_role: z.enum(["owner", "admin", "dispatcher", "member"]).optional().default("owner"),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  company_name: z.string().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  postal_code: z.string().max(20).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  plan: z.enum(["DEMO", "FREE", "BASIS", "PLUS", "PRO", "ENTERPRISE", "INDIVIDUELL", "INDIVIDUAL"]).optional().default("DEMO"),
  employee_count: z.number().int().min(1).max(999999).optional().nullable(),
  individual_signup_mode: z.enum(["pilot", "direct"]).optional().nullable(),
  company_size_class: z.enum(["I", "II", "III", "IV"]).optional().nullable()
}).refine(
  (d) => {
    const isIndividual = ["INDIVIDUELL", "INDIVIDUAL", "ENTERPRISE"].includes(d.plan);
    if (!isIndividual) return true;
    // Individuell: entweder company_size_class oder employee_count muss vorhanden sein
    if (d.company_size_class && VALID_SIZE_CLASSES.includes(d.company_size_class)) return true;
    if (d.employee_count && d.employee_count >= 1) return true;
    return false;
  },
  { message: "Unternehmensgroesze oder Beschaeftigtenzahl ist bei individuellem Tarif erforderlich.", path: ["company_size_class"] }
);

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
  // Ohne Angabe bleibt es beim Bestandsverhalten (Geraet merken) — ein Update
  // darf niemanden ueberraschend beim naechsten Fensterschliessen abmelden.
  remember_me: z.boolean().optional().default(true)
});

/**
 * @param {{ pool, config, sendMail, getUserAndPlan, requireAuth, authLimiter, logger }} deps
 */
export function createAuthRouter(deps) {
  const { pool, config, sendMail, getUserAndPlan, requireAuth, authLimiter, logger } = deps;
  const BASE_URL = config.BASE_URL || "http://localhost:8080";
  const router = Router();

  router.post("/auth/register", authLimiter, catchAsync(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

    const { role, org_role, email, password, company_name, phone, postal_code, city, employee_count, individual_signup_mode, company_size_class } = parsed.data;
    if (await authService.emailExists(pool, email)) return res.status(409).json({ error: "EMAIL_EXISTS" });

    const password_hash = await bcrypt.hash(password, 12);
    const verification_token = crypto.randomBytes(32).toString("hex");

    const userId = await authService.createUser(pool, {
      role, email, passwordHash: password_hash,
      companyName: company_name, phone, postalCode: postal_code, city, verificationToken: verification_token,
      employeeCount: employee_count || null
    });

    try {
      if (postal_code || city) {
        const coords = await geoService.geocode(postal_code || null, city || null);
        if (coords) await authService.setUserGeo(pool, userId, coords.lat, coords.lng);
      }
    } catch (geoErr) {
      logger.warn({ err: geoErr?.message }, "Geocoding bei Registrierung uebersprungen");
    }

    // ── Plan-Routing: saubere Trennung Demo vs. Pilot vs. Direct vs. Bezahlt ──
    const rawPlan = parsed.data.plan;
    const isIndividualPlan = ["INDIVIDUELL", "INDIVIDUAL", "ENTERPRISE"].includes(rawPlan);
    const signupMode = isIndividualPlan ? (individual_signup_mode || "pilot") : null;
    const isDirect = signupMode === "direct";

    // employee_count aus company_size_class ableiten falls nur Klasse angegeben
    const effectiveEmployeeCount = employee_count
      || (company_size_class ? SIZE_CLASS_EMPLOYEE_DEFAULTS[company_size_class] : null)
      || null;

    // Korrekte Subscription: INDIVIDUELL für alle Individuell-Varianten, sonst den gewählten Plan
    const subscriptionPlan = isIndividualPlan ? "INDIVIDUELL" : rawPlan;
    await authService.createSubscription(pool, userId, subscriptionPlan);

    // Organisation + Membership anlegen (immer)
    let orgId = null;
    try {
      orgId = await authService.createOrgWithMembership(pool, userId, {
        orgName: company_name || email,
        orgType: role,
        roleKey: org_role || 'owner',
        plan: subscriptionPlan
      });
    } catch (orgErr) {
      logger.warn({ err: orgErr?.message }, "Org-Erstellung bei Registrierung fehlgeschlagen");
    }

    // ── Individuell-spezifische Org-Einrichtung ──
    if (isIndividualPlan && orgId) {
      try {
        // Tier + Size-Class auf Org setzen (für Pilot UND Direct)
        if (effectiveEmployeeCount && effectiveEmployeeCount >= 1) {
          const tierAuto = getIndividualTierByEmployeeCount(effectiveEmployeeCount);
          const sizeClassObj = classifyCompanySize(effectiveEmployeeCount);
          await pool.query(
            `UPDATE organizations SET
               individual_tier_auto = $1,
               feature_bundle = 'enterprise_full',
               employee_count_approx = $2,
               company_size_class = $3,
               updated_at = NOW()
             WHERE id = $4`,
            [tierAuto, effectiveEmployeeCount, company_size_class || sizeClassObj?.class || null, orgId]
          ).catch(swallow("auth"));
        }

        if (!isDirect) {
          // ── PILOT-FLOW: Pilotphase aktivieren (bestehendes Verhalten) ──
          await pilotPolicyService.activatePilotForOrganization(pool, {
            orgId,
            actorUserId: userId,
            source: "signup"
          });
          await writeAudit(pool, {
            action: "pilot.activated_at_signup",
            entity_type: "organization",
            entity_id: orgId,
            actor_id: userId,
            details: { plan: "INDIVIDUELL", employee_count: effectiveEmployeeCount, company_size_class, signup_mode: "pilot" }
          }).catch(swallow("auth"));
        } else {
          // ── DIRECT-FLOW: Kein Pilot, stattdessen Vertragsanfrage ──
          await pool.query(
            `UPDATE organizations SET
               customer_stage = 'contract_requested',
               billing_mode = 'individual_contract',
               updated_at = NOW()
             WHERE id = $1`,
            [orgId]
          );
          await writeAudit(pool, {
            action: "individual.direct_signup",
            entity_type: "organization",
            entity_id: orgId,
            actor_id: userId,
            details: { plan: "INDIVIDUELL", employee_count: effectiveEmployeeCount, company_size_class, signup_mode: "direct" }
          }).catch(swallow("auth"));
        }
      } catch (setupErr) {
        logger.warn({ err: setupErr?.message, code: setupErr?.code }, "Individuell-Setup bei Registrierung fehlgeschlagen");
      }
    }

    const verifyUrl = `${BASE_URL}?verify=${verification_token}`;
    await sendMail(
      email,
      "TempConnect: Bitte bestätige deine E-Mail-Adresse",
      `<h2>Willkommen bei TempConnect!</h2>
     <p>Bitte klicke auf den folgenden Link, um deine E-Mail-Adresse zu bestätigen:</p>
     <p><a href="${verifyUrl}">${verifyUrl}</a></p>
     <p>Falls du dich nicht registriert hast, ignoriere diese E-Mail.</p>`
    );

    // SEC-001: Regenerate session to prevent session fixation
    await new Promise((resolve, reject) => req.session.regenerate((err) => err ? reject(err) : resolve()));
    req.session.userId = userId;
    stampSession(req.session); // P5.1: Hoechstalter zaehlt ab hier — nach regenerate, sonst verworfen
    const me = await getUserAndPlan(userId);
    try {
      await trackProductEvent(pool, {
        event_name: "signup_completed",
        session_id: req.sessionID || `srv_${userId}`,
        user_id: userId,
        org_id: me?.org_id || null,
        user_role: me?.role || role,
        org_role: me?.org_role || org_role || null,
        user_plan: me?.plan || subscriptionPlan,
        customer_segment: deriveCustomerSegment({ plan: me?.plan || subscriptionPlan, isDemo: me?.is_demo, orgName: me?.org_name || me?.company_name }),
        page_path: "/api/auth/register",
        flow_key: "registration_to_usage",
        source: "api"
      });
    } catch { /* analytics non-critical */ }
    domainLogger.userRegistered({ userId, email, role });
    res.locals.audit = { action: "auth.register", entity_type: "user", entity_id: userId, action_type: "CREATE", details: { role, email } };
    res.json({ ...me, verification_sent: true });
  }));

  router.get("/auth/verify/:token", catchAsync(async (req, res) => {
    const token = String(req.params.token || "");
    if (!token) return res.status(400).json({ error: "INVALID_TOKEN" });
    const verified = await authService.verifyEmail(pool, token);
    if (!verified) return res.status(404).json({ error: "TOKEN_NOT_FOUND" });
    res.json({ ok: true, email: verified.email });
  }));

  router.post("/auth/resend-verification", requireAuth, catchAsync(async (req, res) => {
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
    res.locals.audit = { action: "auth.resend_verification", entity_type: "user", entity_id: req.session.userId, action_type: "SECURITY" };
    res.json({ ok: true, sent: true });
  }));

  router.post("/auth/login", authLimiter, catchAsync(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    const { email, password, remember_me: rememberMe } = parsed.data;
    const creds = await authService.getUserCredentials(pool, email);
    if (!creds) {
      // Login FAILED: Benutzer nicht gefunden — Security-Event loggen (fire-and-forget)
      try { await writeAudit(pool, { action: 'auth.login_failed', entity_type: 'user', action_type: 'LOGIN', status: 'DENIED', details: { email, reason: 'USER_NOT_FOUND' }, ip_address: req.ip || null, user_agent: (req.headers?.['user-agent'] || '').slice(0, 500) }); } catch { /* audit non-critical */ }
      return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "E-Mail oder Passwort falsch." });
    }
    const ok = await bcrypt.compare(password, creds.password_hash);
    if (!ok) {
      // Login FAILED: falsches Passwort — Security-Event loggen (fire-and-forget)
      try { await writeAudit(pool, { action: 'auth.login_failed', entity_type: 'user', entity_id: String(creds.id), action_type: 'LOGIN', status: 'DENIED', details: { email, reason: 'INVALID_PASSWORD' }, ip_address: req.ip || null, user_agent: (req.headers?.['user-agent'] || '').slice(0, 500) }); } catch { /* audit non-critical */ }
      return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "E-Mail oder Passwort falsch." });
    }
    // Enforce-SSO: Passwort-Login blockieren wenn Org enforce_sso=true
    // Break-Glass: Wenn SSO im Stub-Modus (nicht produktiv), enforce_sso ignorieren —
    // sonst sind Nutzer permanent ausgesperrt wenn SSO nicht funktioniert (Stop-Regel 8).
    try {
      const { getSSOMode } = await import("../services/ssoService.js");
      const ssoOperational = getSSOMode() === "saml";
      const ssoCheck = await isEnforceSSO(pool, email);
      if (ssoCheck.enforced && ssoOperational) {
        try { await writeAudit(pool, { action: 'auth.login_blocked_sso', entity_type: 'user', entity_id: String(creds.id), action_type: 'LOGIN', status: 'DENIED', details: { email, reason: 'SSO_ENFORCED', org: ssoCheck.org_name }, ip_address: req.ip || null, user_agent: (req.headers?.['user-agent'] || '').slice(0, 500) }); } catch { /* audit non-critical */ }
        return res.status(403).json({ error: "SSO_REQUIRED", message: `Passwort-Login ist fuer ${ssoCheck.org_name} deaktiviert. Bitte nutze SSO/SAML Login.` });
      }
      // Stub-Modus + enforce_sso: Passwort-Login als Break-Glass erlaubt, Warnung loggen
      if (ssoCheck.enforced && !ssoOperational) {
        req.log?.warn({ email, org: ssoCheck.org_name }, "sso_enforce_bypass: SSO stub-mode – allowing password login as break-glass");
      }
    } catch { /* SSO-Check non-critical – Login fortsetzen */ }
    // MFA/TOTP Check: wenn aktiviert, Token pruefen bevor Session erstellt wird
    try {
      const needsTotp = await totpService.requiresTOTP(pool, creds.id);
      if (needsTotp) {
        const totpToken = String(req.body?.totp_token || "").trim();
        if (!totpToken) {
          return res.status(403).json({ error: "TOTP_REQUIRED", message: "2-Faktor-Code erforderlich." });
        }
        const totpValid = await totpService.validateLoginTOTP(pool, creds.id, totpToken);
        if (!totpValid) {
          try { await writeAudit(pool, { action: 'auth.login_failed', entity_type: 'user', entity_id: String(creds.id), action_type: 'LOGIN', status: 'DENIED', details: { email, reason: 'INVALID_TOTP' }, ip_address: req.ip || null }); } catch { /* audit non-critical */ }
          return res.status(403).json({ error: "INVALID_TOTP", message: "Ungueltiger 2-Faktor-Code." });
        }
      }
    } catch { /* TOTP check non-critical — proceed with login if table missing */ }

    // SEC-001: Regenerate session to prevent session fixation
    await new Promise((resolve, reject) => req.session.regenerate((err) => err ? reject(err) : resolve()));
    req.session.userId = creds.id;
    stampSession(req.session); // P5.1: Hoechstalter zaehlt ab hier
    // Geteilte Rechner (Lagerbuero, Pfoertnerloge): ohne "angemeldet bleiben"
    // stirbt die Sitzung mit dem Fenster. Verkuerzt die Fristen, verlaengert nie.
    bindSessionToDevice(req.session, rememberMe !== false);
    req.session.userRole = creds.role;  // needed by requireWorkerRole gate
    const me = await getUserAndPlan(creds.id);
    try {
      await trackProductEvent(pool, {
        event_name: "login_success",
        session_id: req.sessionID || `srv_${creds.id}`,
        user_id: creds.id,
        org_id: me?.org_id || null,
        user_role: me?.role || creds.role,
        org_role: me?.org_role || null,
        user_plan: me?.plan || null,
        customer_segment: deriveCustomerSegment({ plan: me?.plan, isDemo: me?.is_demo, orgName: me?.org_name || me?.company_name }),
        page_path: "/api/auth/login",
        flow_key: "registration_to_usage",
        source: "api"
      });
    } catch { /* analytics non-critical */ }
    domainLogger.userLogin({ userId: creds.id, email, ip: req.ip });
    res.locals.audit = { action: "auth.login", entity_type: "user", entity_id: creds.id, action_type: "LOGIN", details: { email } };
    res.json(me);
  }));

  router.post("/auth/logout", (req, res) => {
    const userId = req.session.userId;
    domainLogger.userLogout({ userId });
    req.session.destroy(() => {
      res.locals.audit = { action: "auth.logout", entity_type: "user", entity_id: userId, action_type: "LOGIN" };
      res.clearCookie("tc.sid", { path: "/", httpOnly: true, sameSite: "lax" });
      // Prevent browser-back from showing cached enterprise content
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.json({ ok: true });
    });
  });

  /**
   * Wie viele Sitzungen sind offen? (P5.1)
   * Ohne diese Zahl waere "Alle Geraete abmelden" ein Knopf ins Leere — der Nutzer soll
   * sehen, dass es ueberhaupt etwas zu beenden gibt.
   */
  router.get("/auth/sessions", requireAuth, catchAsync(async (req, res) => {
    const offen = await countUserSessions(pool, req.session.userId);
    res.json({ offen, weitere_geraete: Math.max(0, offen - 1) });
  }));

  /**
   * Fernabmeldung (P5.1): beendet alle Sitzungen des eigenen Kontos.
   * Der Normalfall ist ein verlorenes Geraet — deshalb bleibt die AKTUELLE Sitzung
   * standardmaessig bestehen: wer sich gerade selbst aussperrt, kann nicht nachsehen,
   * ob es geklappt hat. Mit `include_current` wird auch sie beendet.
   */
  router.post("/auth/logout-all", requireAuth, catchAsync(async (req, res) => {
    const userId = req.session.userId;
    const auchDiese = req.body?.include_current === true;
    const { beendet } = await destroyAllUserSessions(pool, userId, {
      exceptSid: auchDiese ? null : req.sessionID
    });
    domainLogger.userLogout({ userId });
    res.locals.audit = {
      action: "auth.logout_all", entity_type: "user", entity_id: userId, action_type: "LOGIN",
      details: { beendet, include_current: auchDiese }
    };
    if (!auchDiese) return res.json({ ok: true, beendet });
    req.session.destroy(() => {
      res.clearCookie("tc.sid", { path: "/", httpOnly: true, sameSite: "lax" });
      res.json({ ok: true, beendet });
    });
  }));

  router.post("/auth/forgot-password", authLimiter, catchAsync(async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "EMAIL_REQUIRED" });
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
    res.locals.audit = { action: "auth.forgot_password", entity_type: "user", action_type: "SECURITY", details: { email } };
    res.json({ ok: true, message: "Falls ein Konto existiert, wurde eine E-Mail gesendet." });
  }));

  router.get("/auth/reset-password/:token", catchAsync(async (req, res) => {
    const token = String(req.params.token || "");
    if (!token) return res.status(400).json({ error: "INVALID_TOKEN" });
    const u = await authService.validateResetToken(pool, token);
    if (!u) return res.status(400).json({ error: "TOKEN_EXPIRED", message: "Der Link ist ungültig oder abgelaufen." });
    res.json({ ok: true, email: u.email });
  }));

  router.post("/auth/reset-password", authLimiter, catchAsync(async (req, res) => {
    const token = String(req.body?.token || "");
    const password = String(req.body?.password || "");
    if (!token) return res.status(400).json({ error: "TOKEN_REQUIRED" });
    if (!password || password.length < 8) return res.status(400).json({ error: "PASSWORD_TOO_SHORT", message: "Mindestens 8 Zeichen." });
    const u = await authService.validateResetToken(pool, token);
    if (!u) return res.status(400).json({ error: "TOKEN_EXPIRED", message: "Der Link ist ungültig oder abgelaufen." });
    const password_hash = await bcrypt.hash(password, 12);
    await authService.resetPassword(pool, u.id, password_hash);
    res.locals.audit = { action: "auth.password_reset", entity_type: "user", entity_id: u.id, action_type: "SECURITY" };
    await sendMail(
      u.email,
      "TempConnect: Passwort wurde geändert",
      `<h2>Passwort geändert</h2><p>Dein Passwort wurde erfolgreich geändert.</p><p>Falls du diese Änderung nicht durchgeführt hast, kontaktiere uns sofort!</p>`
    );
    res.json({ ok: true, message: "Passwort wurde erfolgreich geändert." });
  }));

  /* ── Worker Invite: Token prüfen (public, kein Auth) ─────────────────────── */

  router.get("/auth/worker/invite/:token", catchAsync(async (req, res) => {
    const token = String(req.params.token || "");
    if (!token || token.length < 32) return res.status(400).json({ error: "INVALID_TOKEN" });
    const invite = await workerService.getInviteByToken(pool, token);
    if (!invite) return res.status(404).json({ error: "INVITE_NOT_FOUND" });
    if (invite.status === "accepted")  return res.status(409).json({ error: "INVITE_ALREADY_USED" });
    if (invite.status === "revoked")   return res.status(410).json({ error: "INVITE_REVOKED" });
    if (invite.status === "expired" || new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ error: "INVITE_EXPIRED" });
    }
    res.json({
      valid: true,
      email:              invite.email,
      first_name:         invite.first_name,
      last_name:          invite.last_name,
      supplier_org_name:  invite.supplier_org_name,
      expires_at:         invite.expires_at
    });
  }));

  /* ── Worker Invite: Account einrichten + Session starten ────────────────── */

  router.post("/auth/worker/accept-invite", authLimiter, catchAsync(async (req, res) => {
    const token    = String(req.body?.token    || "");
    const password = String(req.body?.password || "");
    if (!token)               return res.status(400).json({ error: "TOKEN_REQUIRED" });
    if (password.length < 8)  return res.status(400).json({ error: "PASSWORD_TOO_SHORT", message: "Mindestens 8 Zeichen." });
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await workerService.acceptInvite(pool, { token, passwordHash });

    if (result.error) {
      const status = result.error === "INVITE_NOT_FOUND"  ? 404
                   : result.error === "INVITE_EXPIRED"    ? 410
                   : result.error === "INVITE_REVOKED"    ? 410
                   : result.error === "INVITE_ALREADY_USED" ? 409 : 400;
      return res.status(status).json({ error: result.error });
    }

    // SEC-001: Regenerate session to prevent session fixation
    await new Promise((resolve, reject) => req.session.regenerate((err) => err ? reject(err) : resolve()));
    req.session.userId = result.user.id;
    stampSession(req.session); // P5.1: Hoechstalter zaehlt ab hier
    req.session.userRole = result.user.role;  // needed by requireWorkerRole gate
    try {
      await trackProductEvent(pool, {
        event_name: "worker_registered",
        session_id: req.sessionID || `srv_${result.user.id}`,
        user_id: result.user.id,
        org_id: result.profile?.supplier_org_id || result.user.org_id || null,
        user_role: "worker",
        org_role: "worker",
        user_plan: null,
        customer_segment: "live",
        page_path: "/api/auth/worker/accept-invite",
        flow_key: "worker_to_timesheet",
        source: "api"
      });
    } catch { /* analytics non-critical */ }
    domainLogger.userRegistered({ userId: result.user.id, email: result.user.email, role: "worker" });
    res.locals.audit = {
      action: "auth.worker_invite_accepted",
      entity_type: "user",
      entity_id: result.user.id,
      action_type: "CREATE",
      details: { email: result.user.email }
    };

    // Willkommens-Mail
    try {
      await sendMail(
        result.user.email,
        "Willkommen bei TempConnect!",
        `<h2>Konto erfolgreich eingerichtet</h2>
         <p>Hallo ${result.profile.first_name},</p>
         <p>Ihr Worker-Konto wurde erfolgreich eingerichtet. Sie können sich jetzt im Portal anmelden.</p>
         <p><a href="${BASE_URL}/public/einsatzportal-dashboard.html">Zum Einsatzportal</a></p>`
      );
    } catch (mailErr) {
      logger.warn({ err: mailErr?.message }, "Worker-Welcome-Mail konnte nicht gesendet werden");
    }

    res.json({
      ok: true,
      user: result.user,
      profile: result.profile
    });
  }));

  return router;
}
