/**
 * Standardisiertes API-Response-Format.
 * Nutzung: import { ok, fail } from "../utils/response.js";
 *   ok(res, data)              → { success: true, data, error: null }
 *   fail(res, code, message)   → { success: false, data: null, error: { code, message } }
 */

/**
 * Erfolgreiche Antwort.
 * @param {import('express').Response} res
 * @param {*} data
 * @param {number} [status=200]
 */
export function ok(res, data = {}, status = 200) {
  return res.status(status).json({ success: true, data, error: null });
}

/**
 * Fehler-Antwort.
 * @param {import('express').Response} res
 * @param {string} code - Fehler-Code (z.B. "VALIDATION", "NOT_FOUND")
 * @param {string} message - Menschenlesbare Fehlermeldung
 * @param {number} [status=400]
 * @param {*} [details] - Optionale Details (z.B. Zod-Issues)
 */
export function fail(res, code, message, status = 400, details = undefined) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return res.status(status).json({ success: false, data: null, error });
}
