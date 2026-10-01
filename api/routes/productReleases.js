/**
 * Produktmitteilungen ("Was ist neu") — die LESER-Seite: jeder angemeldete Nutzer
 * sieht, was fuer ihn bestimmt ist, und bestaetigt das Gelesene.
 *
 * Die PFLEGE (anlegen, aendern, veroeffentlichen, mailen, loeschen) ist mit W-E10
 * (2026-10-01) ins Staff Control Center umgezogen: `/staff/api/produkt-updates`
 * in `routes/staffControlCenter.js`. Hier lag sie unter `/admin/`, bewacht von
 * einer Org-Rolle — und eine Mitteilung ist plattformweit, sie gehoert nicht in
 * die Welt eines Mandanten. Befund vom selben Tag: bis zum Fix 9c4af72 konnte
 * jeder Kunden-Admin sie anlegen und an alle Nutzer mailen.
 * Probe, dass die Wege nicht zurueckkehren: test/produktUpdatesNurPlattform.test.js.
 */
import { Router } from "express";
import { z } from "zod";
import * as productReleaseService from "../services/productReleaseService.js";

export function createProductReleasesRouter(deps) {
  const { pool, requireAuth, getUserAndPlan, logger, config } = deps;
  const router = Router();
  const abmeldeSchluessel = config?.JWT_SECRET || config?.SESSION_SECRET || null;
  const begrenzt = deps.requestLimiter || ((_req, _res, next) => next());

  /**
   * Produktneuheiten per E-Mail abbestellen — der Weg hinter dem Link in jeder
   * Produkt-Mail (§ 7 Abs. 3 UWG, Owner-Entscheid 2026-10-01).
   *
   * Bewusst OHNE Anmeldung: wer widersprechen will, darf nicht erst ein Passwort
   * suchen muessen. Die Berechtigung ist die Signatur im Link (HMAC ueber die
   * Nutzerkennung, zweckgebunden) — sie laesst nur EINE Wirkung zu: fuer genau
   * diesen Nutzer die E-Mail-Kategorie "product_updates" ausschalten. CSRF-Token
   * holt die Abmeldeseite wie jedes oeffentliche Formular ueber /api/csrf.
   */
  const abmeldeSchema = z.object({ u: z.string().uuid(), t: z.string().min(16).max(200) });
  router.post("/product-releases/abmelden", begrenzt, async (req, res) => {
    const parsed = abmeldeSchema.safeParse(req.body || {});
    if (!parsed.success || !productReleaseService.pruefeAbmeldung(parsed.data.u, parsed.data.t, abmeldeSchluessel)) {
      return res.status(400).json({
        success: false,
        error: { code: "LINK_UNGUELTIG", message: "Dieser Abmeldelink ist ungültig oder unvollständig." }
      });
    }
    try {
      const gefunden = await productReleaseService.abmelden(pool, parsed.data.u);
      if (!gefunden) {
        return res.status(404).json({ success: false, error: { code: "KONTO_UNBEKANNT", message: "Zu diesem Link gibt es kein Konto mehr." } });
      }
      res.locals.audit = {
        action: "product_release.unsubscribe",
        entity_type: "user",
        entity_id: parsed.data.u,
        details: { kategorie: productReleaseService.ABMELDE_KATEGORIE, weg: "abmeldelink", responsible_actor_user_id: parsed.data.u }
      };
      res.json({ success: true, data: { abgemeldet: true } });
    } catch (e) {
      logger.error({ err: e }, "product-releases abmelden");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  /* ── Authenticated users ─────────────────────────────────── */

  router.get("/product-releases", requireAuth, async (req, res) => {
    try {
      const inAppOnly = req.query.in_app_only === "true";
      const items = await productReleaseService.listVisibleForUser(pool, req.session.userId, getUserAndPlan, {
        inAppOnly
      });
      res.json({ success: true, data: { items } });
    } catch (e) {
      logger.error({ err: e }, "product-releases list");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  router.get("/product-releases/inbox", requireAuth, async (req, res) => {
    try {
      const summary = await productReleaseService.getInboxSummary(pool, req.session.userId, getUserAndPlan);
      res.json({ success: true, data: summary });
    } catch (e) {
      logger.error({ err: e }, "product-releases inbox");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  router.post("/product-releases/mark-all-seen", requireAuth, async (req, res) => {
    try {
      const n = await productReleaseService.markAllSeenForUser(pool, req.session.userId, getUserAndPlan);
      res.locals.audit = { action: "product_release.mark_all_seen", entity_type: "user", details: { count: n } };
      res.json({ success: true, data: { marked: n } });
    } catch (e) {
      logger.error({ err: e }, "product-releases mark-all-seen");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  const ackSchema = z.object({
    action: z.enum(["seen", "modal_dismiss"])
  });

  router.post("/product-releases/:id/ack", requireAuth, async (req, res) => {
    let body;
    try {
      body = ackSchema.parse(req.body || {});
    } catch {
      return res.status(400).json({ success: false, error: { code: "VALIDATION", message: "action required" } });
    }
    const { id } = req.params;
    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION" } });
    }
    try {
      const ctx = await productReleaseService.loadReleaseContext(pool, req.session.userId, getUserAndPlan);
      const row = (await pool.query(`SELECT * FROM product_release_entries WHERE id = $1`, [id])).rows[0];
      if (!row || !ctx || !productReleaseService.entryVisibleForUser(row, ctx)) {
        return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });
      }
      if (body.action === "seen") {
        await productReleaseService.ackSeen(pool, req.session.userId, id);
      } else {
        await productReleaseService.ackModalDismissed(pool, req.session.userId, id);
      }
      res.locals.audit = {
        action: `product_release.ack_${body.action}`,
        entity_type: "product_release_entries",
        entity_id: id
      };
      res.json({ success: true });
    } catch (e) {
      logger.error({ err: e }, "product-releases ack");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  return router;
}
