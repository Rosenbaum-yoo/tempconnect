/**
 * requireMfa.js — MFA-Enforcement-Middleware für kritische Rollen.
 *
 * Verwendung:
 *   router.post("/sensitive-action", requireAuth, requireMfa({ pool }), handler);
 *
 * Verhalten:
 *   - Nutzer mit mfa_enabled = FALSE: 428 MFA_REQUIRED (muss MFA zuerst einrichten)
 *   - Nutzer ohne frische MFA-Verifikation in Session: 428 MFA_VERIFY_REQUIRED
 *   - Gültige MFA-Session: next()
 *
 * MFA-Session-Gültigkeit:
 *   req.session.mfaVerifiedAt + opts.maxAgeMs (Standard: 8h)
 *
 * Enforce-Auflösung (O-05 — Owner-Flip ohne Code-Änderung):
 *   - opts.enforce === true|false  → expliziter Override gewinnt IMMER
 *       (true = harte Blockierung, false = Audit-Only; z. B. Enrollment-Flächen)
 *   - opts.enforce weggelassen     → env-gesteuert via isMfaEnforced() (request-time):
 *       MFA_ENFORCE (Tier-2 Env-Kill-Switch, DEFAULT AUS = Audit-Only) + optionale
 *       Enrollment-Frist MFA_ENFORCE_FROM (ISO-Datum; vor dem Datum bleibt es
 *       Audit-Only → Grace-Period). Solange MFA_ENFORCE nicht gesetzt ist, ist das
 *       Verhalten identisch zum bisherigen Audit-Only — kein Verhaltenswechsel.
 *
 * WAVE 09 — Phase 2 — 2026-05-26  ·  Enforce-Flip + Grace-Period: 2026-06-14
 */

const DEFAULT_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 Stunden

const TRUTHY = ["true", "1", "yes", "on"];

/**
 * Auflösung des plattformweiten MFA-Enforce-Status (Tier-2 Env-Kill-Switch).
 * Liest process.env zur Laufzeit (request-time), damit die Enrollment-Frist
 * (MFA_ENFORCE_FROM) auch in langlaufenden Prozessen korrekt greift und Tests
 * deterministisch sind.
 * @param {number} [now] Epoch-ms (Default: jetzt) — für Tests injizierbar
 * @returns {boolean} true = scharf schalten, false = Audit-Only
 */
export function isMfaEnforced(now = Date.now()) {
  const on = TRUTHY.includes(String(process.env.MFA_ENFORCE || "").toLowerCase().trim());
  if (!on) return false;
  // Optionale Enrollment-Frist: vor diesem Datum bleibt es Audit-Only.
  const from = process.env.MFA_ENFORCE_FROM;
  if (from && String(from).trim() !== "") {
    const ts = Date.parse(from);
    // Fail-safe: ein gesetztes, aber unparsierbares Datum (Tippfehler) hält
    // Audit-Only — NICHT sofort scharf schalten. Sonst defeated ein Typo die
    // Grace-Period und würde unerwartet hart enforcen.
    if (Number.isNaN(ts)) return false;
    if (now < ts) return false;
  }
  return true;
}

/**
 * @param {{ pool: import('pg').Pool, maxAgeMs?: number, enforce?: boolean }} opts
 *   enforce: true|false → expliziter Override; weggelassen → env-gesteuert (s. o.)
 */
export function requireMfa(opts = {}) {
  const maxAgeMs = Number(opts.maxAgeMs || DEFAULT_MAX_AGE_MS);
  // Expliziter Boolean gewinnt; sonst pro Request env-gesteuert auflösen.
  const explicitEnforce = typeof opts.enforce === "boolean" ? opts.enforce : null;

  return async function mfaGuard(req, res, next) {
    const enforce = explicitEnforce !== null ? explicitEnforce : isMfaEnforced();

    // Identitaet: Plattform-Session (userId) ODER separierte Staff-Session (staffUserId).
    // Ohne den staffUserId-Zweig blockte der Precheck JEDE SCC-Mutation mit 401 —
    // auch im Audit-Only-Modus (enforce:false), der laut Vertrag nie blockieren darf.
    const userId = req.session?.userId || req.session?.staffUserId;
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: "NOT_AUTHENTICATED" } });
    }

    try {
      const { pool } = opts;
      const { rows } = await pool.query(
        "SELECT mfa_enabled FROM users WHERE id = $1",
        [userId]
      );
      const mfaEnabled = rows[0]?.mfa_enabled === true;

      // MFA nicht eingerichtet → Enrollment erforderlich
      if (!mfaEnabled) {
        if (!enforce) {
          req.mfaAuditNote = "mfa_not_enabled";
          return next();
        }
        return res.status(428).json({
          success: false,
          error: {
            code: "MFA_REQUIRED",
            message: "Für diese Aktion ist MFA erforderlich. Bitte richten Sie MFA unter Einstellungen ein.",
            setup_url: "/public/settings.html#mfa"
          }
        });
      }

      // MFA eingerichtet → prüfen ob Session-Verifikation frisch
      const verifiedAt = req.session?.mfaVerifiedAt;
      if (!verifiedAt || (Date.now() - Number(verifiedAt)) > maxAgeMs) {
        if (!enforce) {
          req.mfaAuditNote = verifiedAt ? "mfa_session_expired" : "mfa_not_verified";
          return next();
        }
        return res.status(428).json({
          success: false,
          error: {
            code: "MFA_VERIFY_REQUIRED",
            message: "MFA-Verifikation erforderlich oder abgelaufen. Bitte bestätigen Sie mit Ihrem TOTP-Code.",
            verify_url: "/api/mfa/verify"
          }
        });
      }

      // MFA verifiziert ✓
      next();
    } catch (_err) {
      // Fail-open in Audit-Modus, Fail-closed in Enforce-Modus
      if (!enforce) {
        req.mfaAuditNote = "mfa_check_error";
        return next();
      }
      return res.status(500).json({ success: false, error: { code: "MFA_CHECK_ERROR" } });
    }
  };
}
