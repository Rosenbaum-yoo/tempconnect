import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireOwnerControlAccess } from "../middleware/requireOwnerControlAccess.js";
import { createOccBootstrapRouter } from "./occ/bootstrap.js";
import { createOccExecutiveRouter } from "./occ/executive.js";
import { createOccDecisionsRouter } from "./occ/decisionsRequests.js";
import { createOccRevenueRouter } from "./occ/revenue.js";
import { createOccPlatformRouter } from "./occ/platform.js";
import { createOccOperationsRouter } from "./occ/operations.js";
import { createOccSupportRouter } from "./occ/support.js";
import { createOccAuditRouter } from "./occ/audit.js";
import { createOccInfraRouter } from "./occ/infrastructure.js";
import { createOccWarpRouter } from "./occ/warp.js";
import { createOccAutomationRouter } from "./occ/automation.js";
import { createOccRiskRouter } from "./occ/risk.js";
import { createOccDataExplorerRouter } from "./occ/dataExplorer.js";

export function createOwnerControlCenterRouter(deps) {
  const router = Router();
  const occMiddleware = requireOwnerControlAccess(deps);
  const occRateLimit = deps.occRateLimit || ((_req, _res, next) => next());

  router.use("/owner-control", occRateLimit, requireAuth, occMiddleware);
  router.use("/owner-control", createOccBootstrapRouter(deps));
  router.use("/owner-control", createOccExecutiveRouter(deps));
  router.use("/owner-control", createOccDecisionsRouter(deps));
  router.use("/owner-control", createOccRevenueRouter(deps));
  router.use("/owner-control", createOccPlatformRouter(deps));
  router.use("/owner-control", createOccOperationsRouter(deps));
  router.use("/owner-control", createOccSupportRouter(deps));
  router.use("/owner-control", createOccAuditRouter(deps));
  router.use("/owner-control", createOccInfraRouter(deps));
  router.use("/owner-control", createOccWarpRouter(deps));
  router.use("/owner-control", createOccAutomationRouter(deps));
  router.use("/owner-control", createOccRiskRouter(deps));
  router.use("/owner-control", createOccDataExplorerRouter(deps));

  return router;
}
