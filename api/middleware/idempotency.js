/**
 * Idempotency for write endpoints: Idempotency-Key header.
 * Scoped per (user_id, key): same key for different users does not replay.
 * Keys expire after 24h; expired keys are treated as new. Cleanup: POST /api/internal/cleanup-idempotency.
 */

import crypto from "crypto";
import { swallow } from "../utils/logger.js";

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const KEY_MAX_LEN = 128;
const TTL_HOURS = 24;

function normalizePath(req) {
  const p = (req.baseUrl || "") + (req.path || "");
  return p.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id");
}

function requestBodyHash(body) {
  if (!body || typeof body !== "object") return null;
  try {
    const str = JSON.stringify(body);
    if (str.length > 10000) return null;
    return crypto.createHash("sha256").update(str).digest("hex").slice(0, 64);
  } catch {
    return null;
  }
}

/**
 * Returns middleware that checks Idempotency-Key and either replays stored response or runs next and stores response.
 * @param {import('pg').Pool} pool
 * @param {{ logger?: { warn: (o: object, msg: string) => void } }} [opts]
 */
export function idempotencyMiddleware(pool, opts = {}) {
  const logger = opts.logger || { warn: () => {} };

  return async (req, res, next) => {
    const rawKey = (req.headers["idempotency-key"] || "").trim();
    const key = rawKey.slice(0, KEY_MAX_LEN);

    if (!WRITE_METHODS.has(req.method)) return next();

    if (!key) {
      logger.warn({ method: req.method, path: (req.baseUrl || "") + (req.path || "") }, "Idempotency-Key header missing on write request");
      return next();
    }

    const method = req.method;
    const path = normalizePath(req);
    const userId = req.session?.userId ?? null;
    const scope = userId != null ? String(userId) : "";

    try {
      const existing = await pool.query(
        `SELECT response_status, response_body FROM idempotency_keys
         WHERE scope = $1 AND key = $2 AND expires_at > NOW()`,
        [scope, key]
      );
      if (existing.rows[0]) {
        const { response_status, response_body } = existing.rows[0];
        res.status(response_status).json(response_body);
        return;
      }
    } catch (e) {
      return next(e);
    }

    let captured = null;
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      captured = { status: res.statusCode, body };
      return originalJson(body);
    };

    res.on("finish", async () => {
      if (!captured || captured.status < 200 || captured.status >= 600) return;
      const hash = requestBodyHash(req.body);
      const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);
      await pool.query(
        `INSERT INTO idempotency_keys (scope, key, user_id, method, path, request_hash, response_status, response_body, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (scope, key) DO NOTHING`,
        [scope, key, userId, method, path, hash, captured.status, JSON.stringify(captured.body), expiresAt]
      ).catch(swallow("idempotency"));
    });

    next();
  };
}
