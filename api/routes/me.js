import bcrypt from "bcryptjs";
import { Router } from "express";
import * as geoService from "../services/geoService.js";
import * as userService from "../services/userService.js";

/**
 * @param {{ pool, config, sendMail, getUserAndPlan, requireAuth, logger }} deps
 */
export function createMeRouter(deps) {
  const { pool, config, sendMail, getUserAndPlan, requireAuth, logger } = deps;
  const router = Router();

  router.post("/me/change-password", requireAuth, async (req, res) => {
    try {
      const currentPassword = String(req.body?.currentPassword || "");
      const newPassword = String(req.body?.newPassword || "");
      if (!currentPassword || !newPassword) return res.status(400).json({ error: "PASSWORD_REQUIRED", message: "Altes und neues Passwort erforderlich." });
      if (newPassword.length < 8) return res.status(400).json({ error: "PASSWORD_TOO_SHORT", message: "Mindestens 8 Zeichen." });
      const u = await userService.getUserPasswordHash(pool, req.session.userId);
      if (!u) return res.status(404).json({ error: "USER_NOT_FOUND" });
      const ok = await bcrypt.compare(currentPassword, u.password_hash);
      if (!ok) return res.status(400).json({ error: "INVALID_CURRENT_PASSWORD", message: "Das aktuelle Passwort ist falsch." });
      const password_hash = await bcrypt.hash(newPassword, 10);
      await userService.changePassword(pool, req.session.userId, password_hash);
      res.locals.audit = { action: "user.password_change", entity_type: "user", entity_id: req.session.userId };
      res.json({ ok: true });
    } catch (e) {
      logger.error({ err: e }, "Passwort-Änderung fehlgeschlagen");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/me", requireAuth, async (req, res) => {
    const me = await getUserAndPlan(req.session.userId);
    if (!me) return res.status(401).json({ error: "NOT_AUTHENTICATED" });
    res.json(me);
  });

  router.get("/me/export", requireAuth, async (req, res) => {
    try {
      const exportData = await userService.exportUserData(pool, req.session.userId);
      if (!exportData) return res.status(404).json({ error: "USER_NOT_FOUND" });
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", "attachment; filename=tempconnect-datenexport.json");
      res.json(exportData);
    } catch (e) {
      logger.error({ err: e }, "DSGVO-Export fehlgeschlagen");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/me/plan", requireAuth, async (req, res) => {
    const plan = String(req.body?.plan || "");
    if (!["FREE", "BASIS", "PLUS", "NOTDIENST"].includes(plan)) return res.status(400).json({ error: "INVALID_PLAN" });
    await userService.changePlan(pool, req.session.userId, plan);
    const me = await getUserAndPlan(req.session.userId);
    res.locals.audit = { action: "user.plan_change", entity_type: "user", entity_id: req.session.userId, new_values: { plan } };
    res.json(me);
  });

  router.post("/me/plan/cancel", requireAuth, async (req, res) => {
    await userService.cancelPlan(pool, req.session.userId);
    res.locals.audit = { action: "user.plan_cancel", entity_type: "user", entity_id: req.session.userId, new_values: { plan: "FREE" } };
    const me = await getUserAndPlan(req.session.userId);
    res.json(me);
  });

  router.delete("/me", requireAuth, async (req, res) => {
    try {
      const userEmail = await userService.deleteUser(pool, req.session.userId);
      if (!userEmail) return res.status(404).json({ error: "USER_NOT_FOUND" });
      res.locals.audit = { action: "user.delete", entity_type: "user", entity_id: req.session.userId };
      req.session.destroy();
      await sendMail(
        userEmail,
        "TempConnect: Account gelöscht",
        `<h2>Dein Account wurde gelöscht</h2><p>Alle deine Daten wurden aus unserem System entfernt.</p><p>Wir danken dir für die Zeit, die du bei TempConnect verbracht hast.</p><p>Falls du zurückkommen möchtest, kannst du jederzeit ein neues Konto erstellen.</p>`
      );
      res.json({ ok: true, message: "Account wurde erfolgreich gelöscht." });
    } catch (e) {
      logger.error({ err: e }, "Account-Löschung fehlgeschlagen");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.put("/me/profile", requireAuth, async (req, res) => {
    try {
      const profileData = {
        company_name: String(req.body?.company_name || "").trim().slice(0, 200),
        phone: String(req.body?.phone || "").trim().slice(0, 50),
        contact_person: String(req.body?.contact_person || "").trim().slice(0, 120),
        street: String(req.body?.street || "").trim().slice(0, 200),
        postal_code: String(req.body?.postal_code || "").trim().slice(0, 20),
        city: String(req.body?.city || "").trim().slice(0, 120),
        vat_id: String(req.body?.vat_id || "").trim().slice(0, 30),
        handelsregister_number: String(req.body?.handelsregister_number || "").trim().slice(0, 50)
      };

      await userService.updateProfile(pool, req.session.userId, profileData);

      try {
        if (profileData.postal_code || profileData.city) {
          const coords = await geoService.geocode(profileData.postal_code || null, profileData.city || null);
          if (coords) {
            await userService.updateUserGeo(pool, req.session.userId, coords.lat, coords.lng);
          } else {
            await userService.clearUserGeo(pool, req.session.userId);
          }
        } else {
          await userService.clearUserGeo(pool, req.session.userId);
        }
      } catch (geoErr) {
        await userService.clearUserGeo(pool, req.session.userId).catch(() => {});
      }

      const me = await getUserAndPlan(req.session.userId);
      res.locals.audit = { action: "user.profile_update", entity_type: "user", entity_id: req.session.userId, details: { changed_fields: Object.keys(profileData) } };
      res.json(me);
    } catch (e) {
      logger.error({ err: e }, "Profil-Update fehlgeschlagen");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
