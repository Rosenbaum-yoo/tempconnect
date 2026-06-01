/**
 * ownerControlAccess.js - OCC Access Guard
 *
 * Harte Owner-Allowlist. Kein Bypass ueber platform_admin/owner/admin/Org-Rollen.
 * Pruefung:
 *   1) Session vorhanden und User eingeloggt
 *   2) User ist in `tempconnect_owners` mit is_active = TRUE
 *   3) Fuer mutierende Pfade: `requireOwnerStepUp` setzt zusaetzliche Pruefung
 *
 * Fuer Bootstrap: wenn `tempconnect_owners` leer ist, kann via ENV `OWNER_USER_IDS`
 * eine Initial-Owner-Liste bestimmt werden (Komma-separierte UUIDs).
 * Dieser Bootstrap-Pfad ist NICHT fuer laufenden Betrieb gedacht.
 */

const OWNER_BOOTSTRAP_IDS = String(process.env.OWNER_USER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function extractUserId(req) {
  // OCC nutzt ausschliesslich seine eigene Session, siehe app.js mount.
  return req.session?.ownerUserId || null;
}

export function createOwnerControlAccessMiddleware(deps) {
  const { pool, logger } = deps;
  return async function ownerControlAccess(req, res, next) {
    try {
      const userId = extractUserId(req);
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { code: "OCC_NOT_AUTHENTICATED", message: "Owner-Zentrale erfordert separaten Owner-Login." }
        });
      }

      // Primaerer Pfad: Allowlist-Tabelle
      const { rows } = await pool.query(
        `SELECT user_id, email, display_name, is_active, requires_step_up, last_access_at
         FROM tempconnect_owners WHERE user_id = $1`,
        [userId]
      );
      let owner = rows[0] || null;

      // Bootstrap-Pfad: ENV OWNER_USER_IDS akzeptieren, wenn Tabelle leer ODER User noch nicht eingetragen
      if (!owner && OWNER_BOOTSTRAP_IDS.includes(userId)) {
        const { rows: bootstrapRows } = await pool.query(
          `INSERT INTO tempconnect_owners (user_id, email, is_active, requires_step_up, notes)
           SELECT u.id, u.email, TRUE, TRUE, 'Bootstrap via OWNER_USER_IDS env'
           FROM users u WHERE u.id = $1
           ON CONFLICT (user_id) DO UPDATE SET is_active = TRUE, revoked_at = NULL
           RETURNING user_id, email, display_name, is_active, requires_step_up, last_access_at`,
          [userId]
        );
        owner = bootstrapRows[0] || null;
        if (owner) {
          logger?.warn({ userId }, "OCC: bootstrap-owner via OWNER_USER_IDS env");
        }
      }

      if (!owner || owner.is_active !== true) {
        logger?.warn({ userId, path: req.path }, "OCC access denied: not in allowlist");
        return res.status(403).json({
          success: false,
          error: { code: "OCC_NOT_AUTHORIZED", message: "Kein Zugriff auf Owner Control Center." }
        });
      }

      // Session hart an OCC-Flag gebunden
      if (req.session.occAuthorizedAt == null) {
        req.session.occAuthorizedAt = Date.now();
      }

      req.occOwner = owner;
      req.occActorId = userId;

      // Last-Access-Stempel (best effort, nicht blockierend)
      pool.query(
        "UPDATE tempconnect_owners SET last_access_at = NOW() WHERE user_id = $1",
        [userId]
      ).catch(() => {});

      next();
    } catch (err) {
      logger?.error({ err }, "OCC access middleware error");
      res.status(500).json({ success: false, error: { code: "OCC_GUARD_ERROR" } });
    }
  };
}

/**
 * Step-up Middleware: erfordert einen juengeren Step-up-Timestamp
 * fuer mutierende Aktionen (default 15 Min).
 * Der Step-up wird per `POST /owner/api/auth/step-up` gesetzt.
 */
export function createOwnerStepUpMiddleware(opts = {}) {
  const maxAgeMs = Number(opts.maxAgeMs || 15 * 60 * 1000);
  return function ownerStepUp(req, res, next) {
    if (!req.occOwner) {
      return res.status(401).json({ success: false, error: { code: "OCC_NOT_AUTHENTICATED" } });
    }
    if (req.occOwner.requires_step_up === false) {
      return next();
    }
    const ts = req.session?.ownerStepUpAt;
    if (!ts) {
      return res.status(428).json({
        success: false,
        error: { code: "OCC_STEP_UP_REQUIRED", message: "Re-Authentifizierung erforderlich." }
      });
    }
    if (Date.now() - Number(ts) > maxAgeMs) {
      return res.status(428).json({
        success: false,
        error: { code: "OCC_STEP_UP_EXPIRED", message: "Re-Authentifizierung abgelaufen, bitte erneut bestaetigen." }
      });
    }
    next();
  };
}

/**
 * Zusaetzlicher Confirm-/Reason-Guard: blockt mutierende Aktionen,
 * wenn `confirmed: true` und eine `reason` (min. 10 Zeichen) fehlen.
 */
export function requireConfirmAndReason(req, res, next) {
  const body = req.body || {};
  if (body.confirmed !== true) {
    return res.status(400).json({
      success: false,
      error: { code: "OCC_CONFIRM_REQUIRED", message: "confirmed=true erforderlich." }
    });
  }
  const reason = String(body.reason || "").trim();
  if (reason.length < 10) {
    return res.status(400).json({
      success: false,
      error: { code: "OCC_REASON_REQUIRED", message: "Begruendung (reason) mit mindestens 10 Zeichen erforderlich." }
    });
  }
  req.occReason = reason;
  req.occConfirmed = true;
  next();
}
