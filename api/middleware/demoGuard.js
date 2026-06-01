/**
 * Demo-Guard: Blockiert gefährliche Mutationen in Demo-Sessions.
 *
 * - Account löschen (DELETE /api/me)
 * - Passwort ändern (POST /api/me/change-password)
 * - Plan wechseln  (POST /api/me/plan, POST /api/me/plan/cancel)
 */

const BLOCKED_ROUTES = [
  { method: "DELETE", path: "/api/me" },
  { method: "POST",  path: "/api/me/change-password" },
  { method: "POST",  path: "/api/me/plan" },
  { method: "POST",  path: "/api/me/plan/cancel" }
];

/**
 * Express-Middleware: prüft req.session.isDemo und blockiert definierte Routen.
 */
export function demoGuard(req, res, next) {
  if (!req.session?.isDemo) return next();

  const blocked = BLOCKED_ROUTES.some(
    (r) => req.method === r.method && req.originalUrl === r.path
  );

  if (blocked) {
    return res.status(403).json({
      error: "DEMO_RESTRICTED",
      message: "Diese Aktion ist im Demo-Modus nicht verfügbar. Erstelle ein kostenloses Konto, um alle Funktionen zu nutzen."
    });
  }

  next();
}
