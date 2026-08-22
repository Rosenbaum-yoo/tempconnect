import { swallow } from "../utils/logger.js";
/**
 * staffControlAccess.js - Staff Control Center (SCC) Access Guard
 *
 * ACHTUNG: Dieser Guard ist bewusst NICHT auf die normale RBAC/Session aufgesetzt.
 * SCC ist die interne Betriebs-Konsole von TempConnect (Team-intern).
 * Abo-Kunden, Org-Owner, Plattform-Admins haben HIER keinen Zugriff.
 *
 * Pruefung:
 *   1) Session.staffUserId vorhanden (separate /staff-Session)
 *   2) User ist in `tempconnect_staff` mit is_active = TRUE
 *   3) Fuer mutierende Pfade: `requireStaffStepUp` + `requireConfirmAndReason`
 *
 * Bootstrap: ENV `STAFF_USER_IDS` (Komma-separierte UUIDs) akzeptiert einmalig
 * initiale Mitglieder, traegt sie dauerhaft in `tempconnect_staff` ein.
 */

const STAFF_BOOTSTRAP_IDS = String(process.env.STAFF_USER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function createStaffControlAccessMiddleware(deps) {
  const { pool, logger } = deps;
  return async function staffControlAccess(req, res, next) {
    try {
      const userId = req.session?.staffUserId || null;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { code: "SCC_NOT_AUTHENTICATED", message: "Staff Control Center erfordert separaten Team-Login." }
        });
      }

      /*
       * ABLAUF UND WIDERRUF STEHEN IM `WHERE`, NICHT IN EINER JS-NACHPRUEFUNG.
       *
       * BEFUND (2026-08-22, gegen die laufende Datenbank belegt): Der Kommentar
       * von Migration 118 nennt woertlich DIESE Funktion als die Stelle, die
       * das Ablaufdatum prueft —
       *
       *   COMMENT ON COLUMN tempconnect_staff.expires_at IS
       *     'Optionales Ablaufdatum — NULL = kein Ablauf.
       *      Pruefung in createStaffControlAccessMiddleware (WAVE 11)'
       *
       * — und die Abfrage holte die Spalte nicht einmal. Es gibt sogar einen
       * Teilindex dafuer (118:40-42): jemand hat den Index fuer eine Pruefung
       * gebaut, die nie geschrieben wurde. Ein befristeter Berater-Zugang lief
       * damit nie ab, waehrend ein Access-Reviewer der Zusage glaubte.
       *
       * `revoked_at` war noch schwaecher: NIEMAND setzt es (die Deaktivierung
       * schreibt nur `is_active = FALSE`, staffControlCenter.js:548) und
       * NIEMAND prueft es. Wer es von Hand setzt, weil die Spalte danach
       * aussieht, sperrt niemanden aus. Jetzt schon.
       *
       * Im WHERE und nicht in JS, weil eine Bedingung, die erst nach dem Laden
       * greift, beim naechsten Aufrufer dieser Abfrage fehlt — und weil das
       * Vorbild nebenan es genauso macht (requireOwnerControlAccess.js:43-49).
       *
       * WIRKUNG HEUTE: keine. Gemessen — eine Zeile, `expires_at IS NULL`,
       * `revoked_at IS NULL`. Es wird niemand ausgesperrt; es kann kuenftig nur
       * niemand mehr drinbleiben, der draussen sein soll.
       */
      const { rows } = await pool.query(
        `SELECT user_id, email, display_name, is_active, requires_step_up, last_access_at,
                expires_at
         FROM tempconnect_staff
          WHERE user_id = $1
            AND revoked_at IS NULL
            AND (expires_at IS NULL OR expires_at > NOW())`,
        [userId]
      );
      let staff = rows[0] || null;

      if (!staff && STAFF_BOOTSTRAP_IDS.includes(userId)) {
        /* `expires_at = NULL` gehoert AUSDRUECKLICH dazu, seit der Ablauf oben
         * wirklich greift. Sonst haette dieser Zweig genau das Loch gerissen,
         * das er nicht schliessen soll: die Abfrage oben liefert bei
         * abgelaufenem Zugang KEINE Zeile, der Bootstrap liefe an, das
         * ON CONFLICT setzte `is_active` und `revoked_at` zurueck — und der
         * abgelaufene Zugang waere wieder da, ohne dass jemand ihn verlaengert
         * haette.
         *
         * Das ist die Notoeffnung: wer die Umgebungsvariable setzen kann, hat
         * ohnehin Zugriff auf den Server. Sie soll aber ABSICHTLICH oeffnen,
         * nicht nebenbei — deshalb steht es hier und wird laut protokolliert. */
        const { rows: bootstrapRows } = await pool.query(
          `INSERT INTO tempconnect_staff (user_id, email, is_active, requires_step_up, notes)
           SELECT u.id, u.email, TRUE, TRUE, 'Bootstrap via STAFF_USER_IDS env'
           FROM users u WHERE u.id = $1
           ON CONFLICT (user_id) DO UPDATE
             SET is_active = TRUE, revoked_at = NULL, expires_at = NULL
           RETURNING user_id, email, display_name, is_active, requires_step_up, last_access_at,
                     expires_at`,
          [userId]
        );
        staff = bootstrapRows[0] || null;
        if (staff) {
          logger?.warn({ userId }, "SCC: bootstrap-staff via STAFF_USER_IDS env — Ablauf und Widerruf wurden dabei zurueckgesetzt");
        }
      }

      if (!staff || staff.is_active !== true) {
        /*
         * FAIL-CLOSED, ABER NICHT STILL. Die ANTWORT bleibt fuer alle
         * Ablehnungsgruende dieselbe — sonst waere sie ein Orakel. Das
         * PROTOKOLL darf und muss unterscheiden: ohne diese Zeile sieht ein
         * Betreiber nicht, ob jemand nie Staff war oder ob sein Zugang
         * abgelaufen ist, und ein abgelaufener Berater bekaeme dieselbe
         * ratlose Fehlersuche wie ein Fremder. Die Abfrage laeuft nur im
         * Ablehnungsfall, kostet also nichts auf dem heissen Pfad.
         */
        let grund = "not_in_tempconnect_staff";
        try {
          const { rows: diag } = await pool.query(
            `SELECT is_active, revoked_at IS NOT NULL AS widerrufen,
                    (expires_at IS NOT NULL AND expires_at <= NOW()) AS abgelaufen
               FROM tempconnect_staff WHERE user_id = $1`,
            [userId]
          );
          const z = diag[0];
          if (z) {
            if (z.abgelaufen) grund = "expired";
            else if (z.widerrufen) grund = "revoked";
            else if (z.is_active !== true) grund = "inactive";
            else grund = "unknown_row_present";
          }
        } catch (err) {
          logger?.error({ err: err.message }, "SCC: Ablehnungsgrund konnte nicht bestimmt werden");
        }
        logger?.warn({ userId, path: req.path, grund }, "SCC access denied");
        return res.status(403).json({
          success: false,
          error: { code: "SCC_NOT_AUTHORIZED", message: "Kein Zugriff auf Staff Control Center." }
        });
      }

      if (req.session.sccAuthorizedAt == null) {
        req.session.sccAuthorizedAt = Date.now();
      }
      req.sccStaff = staff;
      req.sccActorId = userId;

      // RLS-Integration (WAVE 05): Staff-Requests erhalten einen withStaffContext-Helper.
      // Alle DB-Operationen die Cross-Org-Daten lesen/schreiben MÜSSEN withStaffContext nutzen.
      // Verwendung: await req.withStaffContext(async (client) => { ... })
      req.withStaffContext = async (fn) => {
        const { withStaffContext } = await import("../utils/orgContext.js");
        return withStaffContext(pool, fn, {
          reason: `staff_control_access path=${req.path}`,
          actorUserId: userId,
        });
      };

      pool.query(
        "UPDATE tempconnect_staff SET last_access_at = NOW() WHERE user_id = $1",
        [userId]
      ).catch(swallow("staffControlAccess"));

      next();
    } catch (err) {
      logger?.error({ err }, "SCC access middleware error");
      res.status(500).json({ success: false, error: { code: "SCC_GUARD_ERROR" } });
    }
  };
}

// SCC WAVE 02: Risk-basierte Step-up TTLs
const STEP_UP_TTL_BY_RISK = {
  critical: 5 * 60 * 1000,   // 5 Minuten
  high:    10 * 60 * 1000,   // 10 Minuten
  medium:  15 * 60 * 1000    // 15 Minuten (default)
};

export function createStaffStepUpMiddleware(opts = {}) {
  // Backward-kompatibel: maxAgeMs direkt ODER riskLevel → TTL-Lookup
  const maxAgeMs = opts.maxAgeMs != null
    ? Number(opts.maxAgeMs)
    : (STEP_UP_TTL_BY_RISK[opts.riskLevel] || STEP_UP_TTL_BY_RISK.medium);
  const riskLabel = opts.riskLevel || (opts.maxAgeMs != null ? "custom" : "medium");

  return function staffStepUp(req, res, next) {
    if (!req.sccStaff) {
      return res.status(401).json({ success: false, error: { code: "SCC_NOT_AUTHENTICATED" } });
    }
    if (req.sccStaff.requires_step_up === false) return next();
    const ts = req.session?.staffStepUpAt;
    if (!ts) {
      return res.status(428).json({
        success: false,
        error: {
          code: "SCC_STEP_UP_REQUIRED",
          message: "Re-Authentifizierung erforderlich.",
          risk_level: riskLabel
        }
      });
    }
    if (Date.now() - Number(ts) > maxAgeMs) {
      return res.status(428).json({
        success: false,
        error: {
          code: "SCC_STEP_UP_EXPIRED",
          message: `Re-Authentifizierung abgelaufen (${riskLabel}: ${Math.round(maxAgeMs / 60000)} Min). Bitte erneut bestaetigen.`,
          risk_level: riskLabel,
          max_age_min: Math.round(maxAgeMs / 60000)
        }
      });
    }
    next();
  };
}

/**
 * SCC WAVE 02: Typed Confirmation Middleware.
 * Für critical-Risk-Aktionen: Staff muss exakt den erwarteten String eintippen.
 *
 * @param {string | ((req: Request) => string | null)} computeExpected
 *   Entweder ein fixer String ODER eine Funktion die den String aus dem Request berechnet.
 *   Gibt null zurück → kein typed_confirmation erforderlich für diesen Request.
 */
export function requireTypedConfirmation(computeExpected) {
  return function typedConfirmation(req, res, next) {
    const expected = typeof computeExpected === "function" ? computeExpected(req) : computeExpected;
    if (!expected) return next(); // kein typed confirmation für diesen Kontext
    const provided = String(req.body?.typed_confirmation || "").trim();
    if (!provided || provided !== expected) {
      return res.status(400).json({
        success: false,
        error: {
          code: "SCC_TYPED_CONFIRMATION_REQUIRED",
          message: `Tippe zur Bestätigung genau ein: "${expected}"`,
          expected_hint: expected
        }
      });
    }
    req.sccTypedConfirmation = provided;
    next();
  };
}

export function requireConfirmAndReason(req, res, next) {
  const body = req.body || {};
  if (body.confirmed !== true) {
    return res.status(400).json({
      success: false,
      error: { code: "SCC_CONFIRM_REQUIRED", message: "confirmed=true erforderlich." }
    });
  }
  const reason = String(body.reason || "").trim();
  if (reason.length < 10) {
    return res.status(400).json({
      success: false,
      error: { code: "SCC_REASON_REQUIRED", message: "Begruendung (reason) mit mindestens 10 Zeichen erforderlich." }
    });
  }
  req.sccReason = reason;
  req.sccConfirmed = true;
  next();
}
