/**
 * requireOwnerControlAccess
 * Prueft: 1) Session/User vorhanden, 2) User in occ_owner_access, 3) nicht revoked.
 * KEIN Bypass ueber normale Rollen.
 */

export function requireOwnerControlAccess(deps) {
  const { pool, logger } = deps;

  async function writeAccessAudit({ userId, action, note, performedBy, metadata }) {
    try {
      await pool.query(
        `INSERT INTO owner_control_access_audit (user_id, action, performed_by, note, metadata)
         VALUES ($1::uuid, $2, $3::uuid, $4, $5::jsonb)`,
        [
          userId || null,
          action,
          performedBy || null,
          note || null,
          JSON.stringify(metadata || {})
        ]
      );
    } catch {
      // audit write must not block access checks
    }
  }

  return async (req, res, next) => {
    if (!req.session?.userId) {
      return res.status(401).json({
        success: false,
        data: null,
        error: { code: "NOT_AUTHENTICATED", message: "Nicht eingeloggt." }
      });
    }

    try {
      const result = await pool.query(
        `SELECT id, occ_role
           FROM occ_owner_access
          WHERE user_id = $1
            AND revoked_at IS NULL
          LIMIT 1`,
        [req.session.userId]
      );

      if (result.rowCount === 0) {
        await writeAccessAudit({
          userId: req.session.userId,
          action: "access_denied",
          metadata: {
            path: req.path,
            method: req.method,
            ip: req.ip
          }
        });
        logger?.warn?.(
          { userId: req.session.userId, path: req.path },
          "OCC access denied - user not in allowlist"
        );
        return res.status(403).json({
          success: false,
          data: null,
          error: { code: "OCC_FORBIDDEN", message: "Kein Zugriff auf das Owner Control Center." }
        });
      }

      req.occAccess = {
        user_id: req.session.userId,
        occ_role: result.rows[0].occ_role
      };

      next();
    } catch (err) {
      logger?.error?.({ err, userId: req.session.userId }, "OCC access check failed");
      return res.status(500).json({
        success: false,
        data: null,
        error: { code: "SERVER_ERROR", message: "Interner Fehler beim Zugriffsprüfen." }
      });
    }
  };
}
