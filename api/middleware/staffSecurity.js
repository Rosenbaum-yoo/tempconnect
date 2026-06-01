/**
 * staffSecurity.js — SCC WAVE 03: Staff Control Center Security Middleware
 *
 * Bereitgestellte Middlewares:
 *   staffApiCacheControl    — Cache-Control: no-store fuer alle /staff/api Responses
 *   staffSecurityHeaders    — X-Robots-Tag, Referrer-Policy (ergaenzt helmet)
 *   createStaffOriginGuard  — Origin/Referer-Check fuer mutierende SCC-Requests
 *
 * Design-Entscheidung:
 *   Diese Middlewares laufen auf App-Ebene VOR den SCC-Routen — Defense in Depth.
 *   Sie ersetzen NICHT den staffControlAccess-Guard, sondern ergaenzen ihn.
 *   Reihenfolge im Mount: CacheControl → SecurityHeaders → OriginGuard → Routers
 *
 * Fehler-Codes:
 *   SCC_ORIGIN_FORBIDDEN (403) — mutierender Request ohne/mit unerlaubtem Origin
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Verhindert Browser/Proxy-Caching aller SCC-Responses.
 * Staff-Daten (Infrastruktur-Status, Kunden-Anfragen, Audit-Logs) duerfen
 * nie aus einem lokalen Cache bedient werden.
 */
export function staffApiCacheControl(_req, res, next) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  next();
}

/**
 * Setzt SCC-spezifische Security-Response-Headers:
 *   - X-Robots-Tag: noindex, nofollow  → SCC-Pfade werden von Suchmaschinen ignoriert
 *   - Referrer-Policy: no-referrer     → kein Referrer-Leak beim Navigieren aus SCC heraus
 *
 * (X-Content-Type-Options, HSTS, X-Frame-Options kommen bereits von helmet.)
 */
export function staffSecurityHeaders(_req, res, next) {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
}

/**
 * Erstellt einen Origin/Referer-Guard fuer mutierende SCC-Requests (POST/PUT/PATCH/DELETE).
 *
 * Schutz-Ziel: Verhindert, dass Cross-Site-Requests mutierende SCC-Operationen ausloesen
 * (CSRF-Defense-in-Depth, ergaenzt SameSite=strict auf dem Staff-Cookie).
 *
 * Verhalten:
 *   - GET/HEAD/OPTIONS: immer durchgelassen (idempotent)
 *   - Development (isLocalDev=true): Localhost-Origins immer erlaubt, andere nur Warnung
 *   - Production: Origin oder Referer MUSS gesetzt sein und einer erlaubten Origin entsprechen
 *
 * @param {{
 *   baseUrl?: string,           URL aus config.BASE_URL — Origin wird daraus abgeleitet
 *   additionalOrigins?: string[], Explizite zusaetzliche erlaubte Origins
 *   isLocalDev?: boolean,       Dev-Modus: Localhost zugelassen, kein Block (nur Warn)
 *   logger?: object             Pino-kompatibles Logger-Interface
 * }} opts
 * @returns {Function} Express-Middleware
 */
export function createStaffOriginGuard(opts = {}) {
  const { baseUrl = "", additionalOrigins = [], isLocalDev = false, logger } = opts;

  // Erlaubte Origins aus baseUrl ableiten
  const allowed = new Set();
  if (baseUrl) {
    try {
      const u = new URL(baseUrl);
      allowed.add(u.origin); // z.B. "https://app.tempconnect.de"
    } catch { /* ungueltige baseUrl ignorieren */ }
  }
  for (const o of additionalOrigins) {
    if (o) allowed.add(String(o).trim());
  }

  // Localhost-Patterns fuer Dev-Modus
  const LOCALHOST_PREFIXES = [
    "http://localhost",
    "http://127.0.0.1",
  ];

  function isLocalhost(origin) {
    return LOCALHOST_PREFIXES.some((p) => origin.startsWith(p));
  }

  function extractOrigin(req) {
    const rawOrigin = (req.headers["origin"] || "").trim();
    if (rawOrigin) {
      try { return new URL(rawOrigin).origin; } catch { /* ignore */ }
    }
    const rawReferer = (req.headers["referer"] || "").trim();
    if (rawReferer) {
      try { return new URL(rawReferer).origin; } catch { /* ignore */ }
    }
    return "";
  }

  return function staffOriginGuard(req, res, next) {
    // Nur mutierende Methoden pruefen
    if (!MUTATING_METHODS.has(req.method)) return next();

    const originHost = extractOrigin(req);

    // ── Development: tolerant ────────────────────────────────────────────────
    if (isLocalDev) {
      if (!originHost || isLocalhost(originHost)) return next();
      if (allowed.size > 0 && allowed.has(originHost)) return next();
      // In Dev: Warnung, aber kein Block (erlaubt z.B. curl-Aufrufe in Entwicklung)
      logger?.warn(
        { originHost, path: req.path, method: req.method },
        "SCC origin guard: non-localhost origin in dev — warning only, not blocked"
      );
      return next();
    }

    // ── Production: strikt ───────────────────────────────────────────────────
    if (!originHost) {
      logger?.warn(
        { path: req.path, method: req.method, ip: req.ip },
        "SCC origin guard: missing origin/referer on mutating request"
      );
      return res.status(403).json({
        success: false,
        error: {
          code: "SCC_ORIGIN_FORBIDDEN",
          message: "Origin nicht gesetzt. Direkte API-Aufrufe ohne Browser-Kontext sind nicht erlaubt."
        }
      });
    }

    if (!allowed.has(originHost)) {
      logger?.warn(
        { originHost, path: req.path, method: req.method, ip: req.ip },
        "SCC origin guard: forbidden origin"
      );
      return res.status(403).json({
        success: false,
        error: {
          code: "SCC_ORIGIN_FORBIDDEN",
          message: "Origin nicht autorisiert fuer Staff Control Center."
        }
      });
    }

    next();
  };
}
