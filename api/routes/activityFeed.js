/**
 * Activity Feed REST-Router: paginated, org-scoped activity timeline.
 */
import { Router } from "express";
import * as eventService from "../services/eventTrackingService.js";

/** Human-readable labels for event types */
const EVENT_LABELS = {
  supplier_invited: "Lieferant eingeladen",
  supplier_approved: "Lieferant freigeschaltet",
  supplier_blocked: "Lieferant gesperrt",
  requisition_created: "Requisition erstellt",
  requisition_distributed: "Requisition verteilt",
  requisition_filled: "Requisition besetzt",
  offer_submitted: "Angebot eingereicht",
  offer_created: "Angebot erstellt",
  offer_accepted: "Angebot angenommen",
  offer_rejected: "Angebot abgelehnt",
  offer_withdrawn: "Angebot zurueckgezogen",
  deal_completed: "Deal abgeschlossen",
  deal_cancelled: "Deal storniert",
  rating_submitted: "Bewertung abgegeben",
  capacity_published: "Kapazitaet veroeffentlicht",
  capacity_expired: "Kapazitaet abgelaufen",
  capacity_filled: "Kapazitaet besetzt",
  capacity_interest: "Interesse an Kapazitaet",
  assignment_started: "Einsatz gestartet",
  assignment_completed: "Einsatz abgeschlossen",
  profile_updated: "Profil aktualisiert",
  search_job_created: "Suchauftrag erstellt",
  search_job_closed: "Suchauftrag geschlossen",
  document_uploaded: "Dokument hochgeladen",
  document_verified: "Dokument verifiziert",
  document_expired: "Dokument abgelaufen",
  org_created: "Organisation erstellt",
  org_updated: "Organisation aktualisiert",
  member_added: "Mitglied hinzugefuegt",
  member_removed: "Mitglied entfernt",
  role_changed: "Rolle geaendert",
  login: "Anmeldung",
  password_changed: "Passwort geaendert",
  match_found: "Match gefunden",
  notification_sent: "Benachrichtigung gesendet"
};

const EVENT_ICONS = {
  supplier_invited: "&#129309;", supplier_approved: "&#9989;", supplier_blocked: "&#128683;",
  requisition_created: "&#128196;", requisition_filled: "&#9989;",
  offer_submitted: "&#128228;", offer_created: "&#128228;", offer_accepted: "&#9989;",
  offer_rejected: "&#10060;", deal_completed: "&#127881;",
  capacity_published: "&#128259;", capacity_interest: "&#128065;",
  profile_updated: "&#128100;", search_job_created: "&#128269;",
  document_uploaded: "&#128206;", document_verified: "&#128737;",
  org_created: "&#127970;", member_added: "&#128101;",
  match_found: "&#11088;", login: "&#128274;"
};

export function createActivityFeedRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();

  router.get("/activity-feed", requireAuth, async (req, res) => {
    try {
      const orgId = req.orgId || null;
      const limit = Math.min(100, parseInt(req.query.limit) || 30);
      const events = await eventService.queryEvents(pool, {
        org_id: orgId,
        limit,
        from_date: req.query.from || null,
        to_date: req.query.to || null,
        event_type: req.query.type || null
      });
      const items = events.map(e => ({
        ...e,
        label: EVENT_LABELS[e.event_type] || e.event_type,
        icon: EVENT_ICONS[e.event_type] || "&#128308;"
      }));
      res.json({ success: true, data: { items, count: items.length } });
    } catch (e) {
      logger.error({ err: e }, "activity-feed GET");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  return router;
}
