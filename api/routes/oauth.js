/**
 * OAuth/OIDC M2M-Router (Welle B1) — client_credentials Token-Endpoint.
 *
 * Externe Systeme tauschen ihren API-Key (client_secret) gegen ein kurzlebiges Bearer-JWT.
 * Nur aktiv wenn config.OAUTH_M2M_ENABLED (sonst 404 — Endpoint inert). Akzeptiert client_id/
 * client_secret als Form-Body ODER HTTP-Basic (client_secret_basic). Scopes = API-Key-Scopes.
 */
import express, { Router } from "express";
import { hashKey, lookupByHash } from "../services/apiKeyService.js";
import { signM2MToken } from "../services/m2mTokenService.js";
import * as auditLog from "../services/auditLog.js";

/** @param {{ pool, config, logger }} deps */
export function createOAuthRouter(deps) {
  const { pool, config, logger } = deps;
  const router = Router();
  // OAuth-Clients senden i.d.R. application/x-www-form-urlencoded → robust hier mitparsen.
  router.use("/oauth/token", express.urlencoded({ extended: false }));

  // OIDC-Discovery (token_endpoint bekanntgeben). Bei AUS leeres Grant-Set ausweisen.
  router.get("/.well-known/openid-configuration", (_req, res) => {
    const base = String(config.BASE_URL || "").replace(/\/+$/, "");
    res.json({
      issuer: "tempconnect",
      token_endpoint: base + "/api/oauth/token",
      grant_types_supported: config.OAUTH_M2M_ENABLED ? ["client_credentials"] : [],
      token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
      response_types_supported: [],
      id_token_signing_alg_values_supported: ["HS256"]
    });
  });

  router.post("/oauth/token", async (req, res) => {
    if (!config.OAUTH_M2M_ENABLED) return res.status(404).json({ error: "not_found" });
    try {
      if (req.body?.grant_type !== "client_credentials") {
        return res.status(400).json({ error: "unsupported_grant_type" });
      }
      let clientId = req.body?.client_id;
      let clientSecret = req.body?.client_secret;
      // HTTP-Basic (client_secret_basic) als Alternative zum Form-Body.
      const auth = req.headers.authorization;
      if ((!clientSecret) && auth && /^Basic /i.test(auth)) {
        const dec = Buffer.from(auth.replace(/^Basic /i, ""), "base64").toString("utf8");
        const i = dec.indexOf(":");
        if (i >= 0) { clientId = clientId || dec.slice(0, i); clientSecret = dec.slice(i + 1); }
      }
      if (!clientSecret) return res.status(400).json({ error: "invalid_request", error_description: "client_secret erforderlich" });
      if (!config.JWT_SECRET) { logger.error({}, "oauth/token: JWT_SECRET fehlt"); return res.status(500).json({ error: "server_error" }); }

      const record = await lookupByHash(pool, hashKey(clientSecret));
      if (!record) return res.status(401).json({ error: "invalid_client" });
      // Falls client_id mitgesendet: muss zur Key-ID passen (verhindert Verwechslung).
      if (clientId && String(clientId) !== String(record.id)) return res.status(401).json({ error: "invalid_client" });

      const { token, expires_in } = signM2MToken({
        orgId: record.org_id, scopes: record.scopes || [], keyId: record.id, secret: config.JWT_SECRET
      });
      try {
        await auditLog.writeAudit(pool, {
          action: "oauth.token_issued", entity_type: "api_key", entity_id: record.id,
          details: { org_id: record.org_id, grant: "client_credentials", scopes: record.scopes || [], expires_in }
        });
      } catch { /* best-effort */ }

      res.json({ access_token: token, token_type: "Bearer", expires_in, scope: (record.scopes || []).join(" ") });
    } catch (err) {
      logger.error({ err: err.message }, "POST /oauth/token");
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}
