/**
 * API Key Authentication Middleware
 *
 * Unterstuetzt zwei Auth-Pfade:
 *   1. X-API-Key Header
 *   2. Authorization: Bearer tc_live_*
 *
 * Wenn ein gültiger API-Key gefunden wird:
 *   - req.orgId wird gesetzt (Multi-Tenancy)
 *   - req.apiKeyId wird gesetzt (fuer Audit)
 *   - req.apiKeyScopes wird gesetzt (fuer Scope-Enforcement)
 *   - req.isApiKeyAuth = true
 *   - last_used_at wird async aktualisiert (non-blocking)
 *
 * Wenn kein API-Key Header vorhanden: next() → Session-Auth greift.
 * Wenn Key ungueltig/abgelaufen/revoked: 401.
 */

import { hashKey, lookupByHash, touchLastUsed, hasScope } from "../services/apiKeyService.js";
import { swallow } from "../utils/logger.js";

const KEY_PREFIX = "tc_live_";

/**
 * Middleware-Factory fuer API-Key-Authentifizierung.
 * @param {import('pg').Pool} pool
 * @param {{ logger: object }} opts
 * @returns {Function} Express Middleware
 */
export function apiKeyAuthMiddleware(pool, { logger }) {
  return async (req, _res, next) => {
    const rawKey = extractApiKey(req);
    if (!rawKey) return next(); // Kein API-Key → Session-Auth

    try {
      const keyHash = hashKey(rawKey);
      const record = await lookupByHash(pool, keyHash);

      if (!record) {
        logger.warn({ key_prefix: rawKey.slice(0, 16) }, "API-Key auth failed: invalid or expired");
        return _res.status(401).json({
          success: false,
          error: { code: "API_KEY_INVALID", message: "API-Key ungueltig, abgelaufen oder widerrufen." }
        });
      }

      // Auth erfolgreich → Request anreichern
      req.orgId = record.org_id;
      req.apiKeyId = record.id;
      req.apiKeyScopes = record.scopes || [];
      req.isApiKeyAuth = true;

      // last_used_at async aktualisieren (non-blocking, Fehler ignorieren)
      touchLastUsed(pool, record.id).catch(swallow("apiKeyAuth"));

      next();
    } catch (err) {
      logger.error({ err: err.message }, "API-Key auth error");
      _res.status(500).json({
        success: false,
        error: { code: "SERVER_ERROR", message: "Interner Authentifizierungsfehler." }
      });
    }
  };
}

/**
 * Extrahiert den API-Key aus dem Request.
 * Unterstuetzt X-API-Key Header und Authorization: Bearer tc_live_*.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function extractApiKey(req) {
  // X-API-Key Header (bevorzugt)
  const xApiKey = req.headers["x-api-key"];
  if (xApiKey && xApiKey.startsWith(KEY_PREFIX)) return xApiKey;

  // Authorization: Bearer tc_live_*
  const auth = req.headers.authorization;
  if (auth) {
    const parts = auth.split(" ");
    if (parts.length === 2 && parts[0].toLowerCase() === "bearer" && parts[1].startsWith(KEY_PREFIX)) {
      return parts[1];
    }
  }

  return null;
}

/**
 * Scope-Enforcement Middleware-Factory.
 *
 * Fuer API-Key-authentifizierte Requests: prueft ob der Key den benoetigten Scope hat.
 * Fuer Session-authentifizierte Requests: durchlassen (Session-User haben implizit alle Scopes).
 *
 * @param {string} scope - Benoetigter Scope (z.B. "read", "write:timesheets")
 * @returns {Function} Express Middleware
 */
export function requireScope(scope) {
  return (req, res, next) => {
    // Session-Auth: kein Scope-Check (RBAC steuert Zugriff)
    if (!req.isApiKeyAuth) return next();

    // API-Key-Auth: Scope pruefen
    if (hasScope(req.apiKeyScopes, scope)) return next();

    res.status(403).json({
      success: false,
      error: {
        code: "SCOPE_INSUFFICIENT",
        message: `API-Key hat nicht den benoetigten Scope: ${scope}`
      }
    });
  };
}
