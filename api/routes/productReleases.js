/**
 * Product release notes ("What's New") — user changelog + admin CRUD.
 */
import { Router } from "express";
import { z } from "zod";
import * as productReleaseService from "../services/productReleaseService.js";

const audienceSchema = z.enum(["worker", "agency", "company", "admin", "supplier_user"]);
const planSchema = z.enum(["DEMO", "BASIS", "PLUS", "PRO", "ENTERPRISE"]);

const releaseCreateSchema = z.object({
  title: z.string().min(1).max(500),
  summary: z.string().max(8000).optional().nullable(),
  body: z.string().max(50000).optional().nullable(),
  feature_key: z.string().max(120).optional().nullable(),
  audiences: z.array(audienceSchema).optional().default([]),
  min_plan: planSchema.optional().nullable(),
  required_feature_key: z.string().max(120).optional().nullable(),
  visibility: z.enum(["public", "internal"]),
  status: z.enum(["draft", "published"]),
  published_at: z.union([z.string(), z.null()]).optional(),
  show_in_app: z.boolean().optional(),
  send_email_on_publish: z.boolean().optional(),
  priority: z.number().int().min(-100).max(100).optional(),
  show_as_modal: z.boolean().optional()
});

const releasePatchSchema = releaseCreateSchema.partial();

/**
 * Die Pflege der Produktmitteilungen gehoert der PLATTFORMVERWALTUNG.
 *
 * BEFUND (2026-10-01, am laufenden System belegt): hier stand eine Wache, die
 * jede Org-Rolle `owner` oder `admin` durchliess — also jeden Kunden-Admin.
 * Angemeldet als Owner eines Unternehmens kam `POST /admin/product-releases`
 * mit 201 durch. Eine Mitteilung ist plattformweit: veroeffentlicht erscheint
 * sie bei JEDEM Nutzer in der App, auf Wunsch als Modal und per E-Mail aus dem
 * Versand von TempConnect. Ein Kunde konnte damit allen anderen Kunden im Namen
 * der Plattform schreiben. Der Pfad `/admin/` und der Name `requireAdmin` haben
 * die Wache aussehen lassen wie eine Plattformpruefung — derselbe Irrtum, den
 * Befund 8.1.1 (d) in `routes/admin.js` schon einmal aufgeloest hat, nur hier
 * nie nachgezogen.
 *
 * Bewusst OHNE den Schalter `ADMIN_PANEL_OPEN`: der oeffnet eine lokale
 * Umgebung zum Ausprobieren, er darf keinen Weg oeffnen, auf dem man alle
 * Nutzer anschreibt.
 */
function nurPlattformverwaltung(logger) {
  return function nurPlattformverwaltung(req, res, next) {
    const rolle = req.orgRole || req.orgMembership?.role_key || null;
    if (rolle === "platform_admin" || req.session?.userRole === "platform_admin") return next();
    logger.warn({ userId: req.session?.userId, path: req.path }, "Produktmitteilungen: nur Plattformverwaltung");
    res.status(403).json({
      success: false,
      error: { code: "NUR_PLATTFORMVERWALTUNG", message: "Dieser Bereich gehoert zur Plattformverwaltung." }
    });
  };
}

export function createProductReleasesRouter(deps) {
  const { pool, requireAuth, getUserAndPlan, sendMail, logger, config } = deps;
  const router = Router();
  const admin = nurPlattformverwaltung(logger);
  const baseUrl = config?.BASE_URL || process.env.BASE_URL || "http://localhost:8080";

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

  /* ── Admin ───────────────────────────────────────────────── */

  router.get("/admin/product-releases", requireAuth, admin, async (_req, res) => {
    try {
      const items = await productReleaseService.listAllAdmin(pool);
      res.json({ success: true, data: { items } });
    } catch (e) {
      logger.error({ err: e }, "admin product-releases list");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  router.post("/admin/product-releases", requireAuth, admin, async (req, res) => {
    let payload;
    try {
      payload = releaseCreateSchema.parse(req.body || {});
    } catch (e) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION", message: String(e) } });
    }
    try {
      const publishedAt = payload.published_at ? new Date(payload.published_at) : null;
      const created = await productReleaseService.createEntry(pool, req.session.userId, {
        ...payload,
        published_at: publishedAt
      });
      res.locals.audit = {
        action: "product_release.create",
        entity_type: "product_release_entries",
        entity_id: created.id,
        new_values: { title: created.title, status: created.status }
      };
      res.status(201).json({ success: true, data: created });
    } catch (e) {
      logger.error({ err: e }, "admin product-releases create");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  router.patch("/admin/product-releases/:id", requireAuth, admin, async (req, res) => {
    const { id } = req.params;
    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION" } });
    }
    let payload;
    try {
      payload = releasePatchSchema.parse(req.body || {});
    } catch (e) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION", message: String(e) } });
    }
    try {
      if (payload.published_at !== undefined && payload.published_at !== null) {
        payload.published_at = new Date(payload.published_at);
      }
      const updated = await productReleaseService.updateEntry(pool, id, payload);
      if (!updated) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });
      res.locals.audit = {
        action: "product_release.update",
        entity_type: "product_release_entries",
        entity_id: id
      };
      res.json({ success: true, data: updated });
    } catch (e) {
      logger.error({ err: e }, "admin product-releases patch");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  router.post("/admin/product-releases/:id/publish", requireAuth, admin, async (req, res) => {
    const { id } = req.params;
    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION" } });
    }
    try {
      const updated = await productReleaseService.publishEntry(pool, id);
      if (!updated) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });
      res.locals.audit = {
        action: "product_release.publish",
        entity_type: "product_release_entries",
        entity_id: id
      };

      let emailResult = null;
      if (updated.send_email_on_publish && sendMail) {
        try {
          emailResult = await productReleaseService.dispatchReleaseEmails(
            pool,
            id,
            getUserAndPlan,
            sendMail,
            logger,
            baseUrl
          );
        } catch (err) {
          logger.error({ err, id }, "product_release publish email failed");
        }
      }

      res.json({ success: true, data: { entry: updated, email: emailResult } });
    } catch (e) {
      logger.error({ err: e }, "admin product-releases publish");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  router.post("/admin/product-releases/:id/send-email", requireAuth, admin, async (req, res) => {
    const { id } = req.params;
    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION" } });
    }
    const confirm = req.body?.confirm === true;
    if (!confirm) {
      return res.status(400).json({
        success: false,
        error: { code: "CONFIRM_REQUIRED", message: "Set confirm:true fuer manuellen E-Mail-Versand." }
      });
    }
    try {
      const result = await productReleaseService.dispatchReleaseEmails(
        pool,
        id,
        getUserAndPlan,
        sendMail,
        logger,
        baseUrl
      );
      res.locals.audit = {
        action: "product_release.send_email",
        entity_type: "product_release_entries",
        entity_id: id,
        details: result
      };
      res.json({ success: true, data: result });
    } catch (e) {
      logger.error({ err: e }, "admin product-releases send-email");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  router.delete("/admin/product-releases/:id", requireAuth, admin, async (req, res) => {
    const { id } = req.params;
    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION" } });
    }
    try {
      const { rowCount } = await pool.query(`DELETE FROM product_release_entries WHERE id = $1`, [id]);
      if (!rowCount) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });
      res.locals.audit = { action: "product_release.delete", entity_type: "product_release_entries", entity_id: id };
      res.json({ success: true });
    } catch (e) {
      logger.error({ err: e }, "admin product-releases delete");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  return router;
}
