/**
 * requireAuth: ensure session.userId exists.
 * csrfProtect: validate x-csrf-token for state-changing methods (skip GET/HEAD/OPTIONS and /csrf).
 */

export function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: "NOT_AUTHENTICATED" });
  next();
}

export function csrfProtect(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const path = (req.path || "").replace(/^\/api(\/v\d+)?/, "") || "/";
  if (path === "/csrf" || path === "/analytics/track-public") return next();
  const token = req.headers["x-csrf-token"];
  const sessionToken = req.session?.csrfToken;
  if (!sessionToken || token !== sessionToken) {
    return res.status(403).json({
      error: "CSRF_INVALID",
      message: "Sicherheitstoken abgelaufen. Die App holt automatisch einen neuen – bitte Aktion erneut ausfuehren."
    });
  }
  next();
}
