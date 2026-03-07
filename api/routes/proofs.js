/**
 * Nachweise (SLA-proofs) API – gated by sla_proofs.
 * Stub: returns 501 NOT_IMPLEMENTED until storage is implemented.
 */

import { Router } from "express";

/**
 * @param {{ requireAuth, requireFeature, logger }} deps
 */
export function createProofsRouter(deps) {
  const { requireAuth, requireFeature } = deps;
  const router = Router();
  const slaProofs = requireFeature("sla_proofs");

  router.get("/proofs", requireAuth, slaProofs, (req, res) => {
    res.status(501).json({
      ok: false,
      code: "NOT_IMPLEMENTED",
      message: "Nachweise-Liste kommt in Kürze."
    });
  });

  router.post("/proofs", requireAuth, slaProofs, (req, res) => {
    res.status(501).json({
      ok: false,
      code: "NOT_IMPLEMENTED",
      message: "Nachweise-Upload kommt in Kürze."
    });
  });

  return router;
}
