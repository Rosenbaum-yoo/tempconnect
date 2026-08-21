import * as internalControlCenterService from "../services/internalControlCenterService.js";

export function requireInternalPermission(permission, deps) {
  const { pool, logger } = deps;
  // BENANNT statt anonym — die fuenfte Wache dieser Welle, die keinen Namen
  // hatte. Sie traegt die gesamte interne Steuerungsflaeche
  // (`internal.*`-Rechte) und war fuer jede Strukturpruefung unsichtbar; bei
  // der Bestandsaufnahme zu P1-21 fielen ihre Routen als "ohne Wache" auf,
  // obwohl sie bewacht sind. Vergleiche `requirePermissionMiddleware`,
  // `supportAuth`, `ownerControlAuth`.
  return async function requireInternalPermissionMiddleware(req, res, next) {
    if (!req.session?.userId) {
      return res.status(401).json({ success: false, error: { code: "NOT_AUTHENTICATED" } });
    }
    const snapshot = await internalControlCenterService.getInternalAccessSnapshot(pool, req.session.userId);
    if (!snapshot.roles.length) {
      logger.warn({ userId: req.session.userId, permission }, "internal_access_denied_no_role");
      return res.status(403).json({ success: false, error: { code: "INTERNAL_ACCESS_REQUIRED", message: "Interne Berechtigung erforderlich." } });
    }
    if (!snapshot.permissions.includes(permission)) {
      logger.warn({ userId: req.session.userId, permission, roles: snapshot.roles }, "internal_access_denied_permission");
      return res.status(403).json({ success: false, error: { code: "INTERNAL_PERMISSION_DENIED", message: "Keine Berechtigung fuer diese interne Aktion." } });
    }
    req.internalAccess = snapshot;
    next();
  };
}
