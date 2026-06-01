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
 * WAVE 09 — Phase 2 — 2026-05-26
 */

const DEFAULT_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 Stunden

/**
 * @param {{ pool: import('pg').Pool, maxAgeMs?: number, enforce?: boolean }} opts
 *   enforce: false → Audit-Only-Modus (loggt aber blockiert nicht) — für schrittweisen Rollout
 */
export function requireMfa(opts = {}) {
  const maxAgeMs = Number(opts.maxAgeMs || DEFAULT_MAX_AGE_MS);
  const enforce = opts.enforce !== false; // Standard: echte Blockierung

  return async function mfaGuard(req, res, next) {
    const userId = req.session?.userId;
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
