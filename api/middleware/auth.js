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
  // Webhook-Endpunkte (Stripe/PayPal) sind sessionlos und HMAC-signaturgesichert —
  // CSRF greift dort konzeptionell nicht und wuerde sie faelschlich mit 403 blockieren.
  // Hinweis: csrfProtect ist unter app.use("/api/", …) gemountet → req.path ist um /api
  // gekuerzt, die optionale /vN-Version bleibt aber (z.B. "/v1/payment/webhook/stripe").
  if (path === "/csrf" || path === "/analytics/track-public" || /^(\/v\d+)?\/payment\/webhook\//.test(path)) return next();
  // OIDC-Token-Endpoint: sessionlos, per Client-Credentials (HTTP-Basic/Body) gesichert — CSRF
  // (schuetzt Cookie-Sessions) greift hier nicht und wuerde die Token-Ausgabe faelschlich blockieren.
  if (/^(\/v\d+)?\/oauth\/token$/.test(path)) return next();
  // API-Key-/M2M-Auth ist Header-getragen (X-API-Key bzw. Authorization: Bearer), NICHT cookie-/
  // session-basiert. CSRF schuetzt nur ambient Cookie-Credentials; ein Cross-Site-Angreifer kann
  // diese Header nicht setzen (kein Key, CORS-Preflight). Ohne diese Ausnahme wuerde JEDE per
  // API-Key authentifizierte Mutation (SCIM, Inbound-REST) faelschlich mit 403 CSRF_INVALID enden.
  if (req.headers["x-api-key"] || /^bearer\s+/i.test(req.headers.authorization || "")) return next();
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
