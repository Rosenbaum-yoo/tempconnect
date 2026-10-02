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

  // BENANNT statt anonym: dieses Tor ist die EINZIGE Eintrittsbedingung der
  // gesamten Owner-Flaeche — der privilegiertesten des Systems. Anonym ist es in
  // Stapelspuren und fuer jede Strukturpruefung unsichtbar; kein Test konnte
  // belegen, dass es ueberhaupt noch montiert ist. Der Name ist Teil der
  // Absicherung, nicht Kosmetik (gleiche Lehre wie bei `supportAuth`).
  return async function ownerControlAuth(req, res, next) {
    if (!req.session?.userId) {
      return res.status(401).json({
        success: false,
        data: null,
        error: { code: "NOT_AUTHENTICATED", message: "Nicht eingeloggt." }
      });
    }

    try {
      /*
       * ABLAUF UND WIDERRUF STEHEN IM `WHERE`, NICHT IN EINER JS-NACHPRUEFUNG
       * (Owner-Punkt 17, Migration 230).
       *
       * Dieselbe Form wie im Staff-Tor (`staffControlAccess.js`), und aus
       * demselben Grund: eine Bedingung, die erst nach dem Laden greift, fehlt
       * beim naechsten Aufrufer dieser Abfrage. Gemessen hatte dieses Tor nur
       * `revoked_at` — die privilegierteste Flaeche des Systems war damit die
       * einzige, deren Zugaenge nicht von selbst enden.
       *
       * `expires_at IS NULL` heisst ausdruecklich "kein Ablauf" und gilt fuer die
       * Eigentuemer selbst. Die Stop-Regel dazu steht in Migration 230: die Menge
       * der wirksamen Zugaenge enthaelt immer mindestens einen ohne Ablauf —
       * sonst sperrt der Verfall die Eigentuemer aus einer Flaeche aus, in der das
       * Aufheben passiert.
       */
      const result = await pool.query(
        `SELECT id, occ_role, expires_at
           FROM occ_owner_access
          WHERE user_id = $1
            AND revoked_at IS NULL
            AND (expires_at IS NULL OR expires_at > NOW())
          LIMIT 1`,
        [req.session.userId]
      );

      if (result.rowCount === 0) {
        /*
         * FAIL-CLOSED, ABER NICHT STILL (Owner-Punkt 17, dieselbe Form wie
         * staffControlAccess.js). Die ANTWORT bleibt fuer jeden Ablehnungsgrund
         * dieselbe — sonst waere sie ein Orakel darueber, wer Zugang hat. Das
         * PROTOKOLL darf und muss unterscheiden: ohne diese Zeile sieht ein
         * Eigentuemer nicht, ob sein Zugang ABGELAUFEN oder nie vorhanden war,
         * und bekommt fuer zwei voellig verschiedene Lagen dieselbe ratlose
         * Fehlersuche. Die Abfrage laeuft nur im Ablehnungsfall, kostet also
         * nichts auf dem heissen Pfad.
         */
        let grund = "nicht_in_occ_owner_access";
        try {
          const { rows: diag } = await pool.query(
            `SELECT revoked_at IS NOT NULL AS widerrufen,
                    (expires_at IS NOT NULL AND expires_at <= NOW()) AS abgelaufen,
                    expires_at
               FROM occ_owner_access WHERE user_id = $1 LIMIT 1`,
            [req.session.userId]
          );
          if (diag[0]?.abgelaufen) grund = "abgelaufen";
          else if (diag[0]?.widerrufen) grund = "widerrufen";
        } catch {
          /* Der Grund ist Komfort, nicht Entscheidung — eine fehlgeschlagene
           * Diagnose darf die Ablehnung nicht in einen 500er verwandeln. */
        }
        await writeAccessAudit({
          userId: req.session.userId,
          action: "access_denied",
          metadata: {
            path: req.path,
            method: req.method,
            ip: req.ip,
            grund
          }
        });
        logger?.warn?.(
          { userId: req.session.userId, path: req.path, grund },
          "OCC access denied"
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
