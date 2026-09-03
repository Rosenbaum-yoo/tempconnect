/**
 * Profile Bounties Routes — Marketplace Visibility Center (M-04)
 * Kunden-seitige Bounty-Verwaltung.
 *
 * Endpoints:
 *   GET    /profile-bounties/me          — eigene Bounty-Anträge (INDIVIDUELL)
 *   POST   /profile-bounties/me          — neuen Antrag erstellen (INDIVIDUELL)
 *   POST   /profile-bounties/:id/submit  — Antrag einreichen (zur Staff-Prüfung)
 *   DELETE /profile-bounties/:id         — Antrag stornieren
 *
 * Staff-Aktionen (approve/activate/reject) sind in M-07 unter /staff/api/ implementiert.
 *
 * Plan-Gates:
 *   profile_bounties  INDIVIDUELL (MATURITY_GATE: false — noch nicht live)
 *
 * Da profile_bounties maturity-gated ist (false), sind diese Endpoints
 * de facto blockiert bis MATURITY_GATES.profile_bounties = true gesetzt wird.
 */

import { z } from "zod";
import { Router } from "express";
import * as bountySvc from "../services/profileBountyService.js";
import { writeAuditEnhanced } from "../services/auditLog.js";
import { swallow } from "../utils/logger.js";
import { verweigereArbeiter } from "../middleware/orgAccess.js";

const createBountySchema = z.object({
  bounty_type: z.enum(["featured_badge", "search_boost", "category_top"])
});

export function createProfileBountiesRouter(deps) {
  const { pool, requireAuth, requireFeature, logger } = deps;
  const router = Router();

  const uid  = (req) => req.session.userId;
  const ok   = (res, data) => res.json({ success: true, data });
  const fail = (res, status, code, msg) =>
    res.status(status).json({ success: false, error: { code, message: msg } });

  const audit = (req, action, entityId, details) =>
    writeAuditEnhanced(pool, req, { action, entity_type: "profile_bounty", entity_id: entityId,
      actor_id: uid(req), details }).catch(swallow("profileBounties"));

  // MATURITY_GATE: profile_bounties = false → requireFeature blockiert automatisch
  const bountyAccess = requireFeature("profile_bounties");

  /* ── Eigene Bounty-Anträge lesen ───────────────────────── */

  /*
   * M2.5/M2.7 — `/profile-bounties/me` heisst "me" und meint die ORG.
   *
   * Gemessen am 2026-09-03: `getOrgBountyHistory(pool, req.orgId)` liefert die
   * Praemienhistorie der TRAEGERORG. Dieselbe Namensfalle wie bei
   * `/subscription-requests/mine` — und sie hat auch mich getaeuscht: die Route
   * stand zuerst als "eigene Daten" im Register, bis der Waechter eine
   * Begruendung verlangte und beim Aufschreiben auffiel, dass es keine gibt.
   *
   * Die drei Schreibwege daneben wiegen schwerer als der Leseweg:
   * `POST /profile-bounties/me` legt einen Antrag `{ orgId: req.orgId,
   * requestedBy: uid(req) }` an — ein Arbeiter haette im NAMEN SEINES
   * ARBEITGEBERS eine Praemie beantragen koennen; `DELETE /profile-bounties/:id`
   * storniert eine bestehende.
   *
   * `bountyAccess` sah aus wie eine Wache und ist keine: es prueft den PLAN, und
   * den holt es aus der FIRMA. Je besser deren Tarif, desto weiter kam er.
   *
   * Bewusst `verweigereArbeiter` und nicht `requirePermission(...)`: welche
   * Rollen Praemien beantragen duerfen, ist eine Produktfrage und gehoert dem
   * Owner (M2.6).
   */
  const keinArbeiter = verweigereArbeiter({ logger });

  router.get("/profile-bounties/me", requireAuth, bountyAccess, keinArbeiter, async (req, res) => {
    try {
      if (!req.orgId) return fail(res, 403, "NO_ORG", "Keine aktive Organisation.");
      const data = await bountySvc.getOrgBountyHistory(pool, req.orgId);
      ok(res, data);
    } catch (e) {
      logger.error({ err: e }, "GET /profile-bounties/me");
      fail(res, 500, "SERVER_ERROR", "Bounty-Anträge konnten nicht geladen werden.");
    }
  });

  /* ── Neuen Antrag erstellen ────────────────────────────── */

  router.post("/profile-bounties/me", requireAuth, bountyAccess, keinArbeiter, async (req, res) => {
    const parsed = createBountySchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION", "bounty_type erforderlich.");
    try {
      if (!req.orgId) return fail(res, 403, "NO_ORG", "Keine aktive Organisation.");
      const bounty = await bountySvc.createBountyRequest(pool, {
        orgId:        req.orgId,
        requestedBy:  uid(req),
        bountyType:   parsed.data.bounty_type
      });
      if (!bounty) return fail(res, 400, "CREATE_FAILED", "Antrag konnte nicht erstellt werden.");
      audit(req, "profile_bounty.created", bounty.id, { bounty_type: parsed.data.bounty_type });
      ok(res, bounty);
    } catch (e) {
      logger.error({ err: e }, "POST /profile-bounties/me");
      fail(res, 500, "SERVER_ERROR", "Antrag konnte nicht erstellt werden.");
    }
  });

  /* ── Antrag einreichen ─────────────────────────────────── */

  router.post("/profile-bounties/:id/submit", requireAuth, bountyAccess, keinArbeiter, async (req, res) => {
    try {
      if (!req.orgId) return fail(res, 403, "NO_ORG", "Keine aktive Organisation.");
      const result = await bountySvc.submitBountyRequest(pool, req.params.id, req.orgId);
      if (!result.ok) return fail(res, 400, result.reason, "Einreichung nicht möglich.");
      audit(req, "profile_bounty.submitted", req.params.id, {});
      ok(res, result.bounty);
    } catch (e) {
      logger.error({ err: e }, "POST /profile-bounties/:id/submit");
      fail(res, 500, "SERVER_ERROR", "Einreichung fehlgeschlagen.");
    }
  });

  /* ── Antrag stornieren ─────────────────────────────────── */

  router.delete("/profile-bounties/:id", requireAuth, bountyAccess, keinArbeiter, async (req, res) => {
    try {
      if (!req.orgId) return fail(res, 403, "NO_ORG", "Keine aktive Organisation.");
      const result = await bountySvc.cancelBounty(pool, req.params.id, req.orgId);
      if (!result.ok) return fail(res, 400, result.reason, "Stornierung nicht möglich.");
      audit(req, "profile_bounty.cancelled", req.params.id, {});
      ok(res, result.bounty);
    } catch (e) {
      logger.error({ err: e }, "DELETE /profile-bounties/:id");
      fail(res, 500, "SERVER_ERROR", "Stornierung fehlgeschlagen.");
    }
  });

  return router;
}
