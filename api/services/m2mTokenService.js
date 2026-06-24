/**
 * m2mTokenService — Machine-to-Machine Access-Tokens (OIDC client_credentials, Welle B1).
 *
 * Stellt kurzlebige, signierte JWTs (HS256) für API-Key-Inhaber aus, damit externe Systeme
 * (SAP/HR/DATEV-Middleware) den Standard-OIDC-`client_credentials`-Flow nutzen können statt
 * den rohen API-Key bei jedem Request mitzusenden. KEINE Dependency — HMAC-SHA256 via node:crypto.
 *
 * Signiert mit `config.JWT_SECRET` (HS256). Token enthält org_id + scope (Leerzeichen-getrennt,
 * gespiegelt aus den API-Key-Scopes) + exp. Verifikation prüft Signatur (constant-time), exp,
 * iss/aud und token_use. Nur aktiv wenn `OAUTH_M2M_ENABLED` (Gate liegt im Endpoint/Middleware).
 */

import crypto from "node:crypto";

export const M2M_TOKEN_TTL_SECONDS = 3600;       // 1 Stunde
export const M2M_ISSUER = "tempconnect";
export const M2M_AUDIENCE = "tempconnect-api";
export const M2M_ALG = "HS256";

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlJson(obj) { return b64url(Buffer.from(JSON.stringify(obj), "utf8")); }
function b64urlDecodeJson(seg) {
  try {
    const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch { return null; }
}
function nowSec(opt) { return Math.floor(((opt instanceof Date ? opt.getTime() : Date.now())) / 1000); }

/**
 * Signiert ein M2M-JWT.
 * @param {{ orgId:string, scopes?:string[], keyId?:string, secret:string, now?:Date, ttl?:number }} p
 * @returns {{ token:string, expires_in:number, payload:object }}
 */
export function signM2MToken(p) {
  if (!p || !p.secret) throw new Error("M2M_SIGNING_SECRET_MISSING");
  if (!p.orgId) throw new Error("M2M_ORG_REQUIRED");
  const iat = nowSec(p.now);
  const ttl = Number.isFinite(p.ttl) && p.ttl > 0 ? Math.floor(p.ttl) : M2M_TOKEN_TTL_SECONDS;
  const exp = iat + ttl;
  const header = { alg: M2M_ALG, typ: "JWT" };
  const payload = {
    iss: M2M_ISSUER, aud: M2M_AUDIENCE,
    sub: p.keyId || p.orgId, org_id: p.orgId,
    scope: (p.scopes || []).join(" "),
    token_use: "m2m", iat, exp
  };
  const signingInput = b64urlJson(header) + "." + b64urlJson(payload);
  const sig = b64url(crypto.createHmac("sha256", p.secret).update(signingInput).digest());
  return { token: signingInput + "." + sig, expires_in: exp - iat, payload };
}

/**
 * Verifiziert ein M2M-JWT. Gibt das Payload zurück oder null (ungültig/abgelaufen/manipuliert).
 * @param {string} token
 * @param {string} secret
 * @param {{ now?:Date }} [opts]
 * @returns {object|null}
 */
export function verifyM2MToken(token, secret, opts = {}) {
  if (!token || !secret || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, pl, sig] = parts;
  // Signatur (constant-time)
  const expected = b64url(crypto.createHmac("sha256", secret).update(h + "." + pl).digest());
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  // Header-Alg muss HS256 sein (kein alg=none / Verwechslung)
  const header = b64urlDecodeJson(h);
  if (!header || header.alg !== M2M_ALG) return null;
  const payload = b64urlDecodeJson(pl);
  if (!payload) return null;
  if (payload.iss !== M2M_ISSUER || payload.aud !== M2M_AUDIENCE) return null;
  if (payload.token_use !== "m2m") return null;
  if (!payload.org_id) return null;
  const t = nowSec(opts.now);
  if (!payload.exp || t >= payload.exp) return null;       // abgelaufen
  if (payload.iat && t + 60 < payload.iat) return null;    // in der Zukunft ausgestellt (Clock-Skew 60s)
  return payload;
}
