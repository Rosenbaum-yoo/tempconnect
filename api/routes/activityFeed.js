/**
 * Activity Feed REST-Router: paginated, org-scoped activity timeline.
 *
 * Beschriftung, Symbol und Deep-Link liefert `eventTrackingService.describeEvent`
 * (P4.4). Frueher lagen die Label-/Icon-Tabellen hier — ein neuer Event-Typ war damit
 * entweder ungueltig oder erschien im Feed als technischer Rohname.
 */
import { Router } from "express";
import * as eventService from "../services/eventTrackingService.js";

export function createActivityFeedRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();

  router.get("/activity-feed", requireAuth, async (req, res) => {
    try {
      const orgId = req.orgId || null;
      const limit = Math.min(100, parseInt(req.query.limit) || 30);

      // Org-Boundary (P4.4): ohne Org-Kontext wuerde `queryEvents` OHNE WHERE laufen und
      // plattformweit lesen. Solange die Tabelle leer war, fiel das nicht auf — mit den
      // neuen Events aus P1-P4 waere es ein Datenleck. Ohne Org gibt es nur die
      // eigenen Vorgaenge.
      const scope = orgId
        ? { org_id: orgId }
        : { actor_id: req.session.userId };

      const events = await eventService.queryEvents(pool, {
        ...scope,
        limit,
        from_date: req.query.from || null,
        to_date: req.query.to || null,
        event_type: req.query.type || null
      });
      // Beschriftung, Symbol und Deep-Link kommen aus dem Katalog des Services —
      // eine Wahrheit fuer alle Oberflaechen.
      const items = events.map(eventService.describeEvent);
      res.json({ success: true, data: { items, count: items.length, scope: orgId ? "org" : "own" } });
    } catch (e) {
      logger.error({ err: e }, "activity-feed GET");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  return router;
}
