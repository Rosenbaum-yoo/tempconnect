/**
 * orgAccessSuspensionService.js — Betreiber-Kill-Switch (Phase 1).
 *
 * Die EINZIGE mutierende Schicht fuer die Org-Access-Sperre (Mig 127). Der
 * Staff/Operator sperrt bei Nicht-Zahlung (oder anderem schweren Grund) den
 * Zugang einer Kunden-Org und gibt ihn wieder frei. Die Tarif-AKTIVIERUNG bleibt
 * bewusst zahlungsgetrieben (Stripe-Webhook) und liegt NICHT hier.
 *
 * Enforcement: Wir setzen/loeschen nur organizations.access_suspended_* — die
 * Wirkung (Soft-Lock) entsteht in entitlementService.computeSubscriptionStatus,
 * das access_suspended_at als hoechste Prioritaet prueft. Login/Session bleiben
 * unberuehrt; der Kunde sieht die Sperre + Grund und kann zahlen/Kontakt aufnehmen.
 *
 * State-Machine (wie ops_incidents): aktiv -> suspended -> aktiv. Doppelter
 * Aufruf liefert NO-CHANGE (ALREADY_SUSPENDED / NOT_SUSPENDED), kein stiller
 * Erfolg. Die Sperre selbst ist EIN atomares UPDATE mit WHERE-Guard (kein
 * Double-Suspend-Race). Reads laufen ueber staffCustomerOperationsService
 * (Roster + Detail) — hier gibt es bewusst KEINEN zweiten Listenpfad.
 *
 * Audit: NICHT hier. Der Aufrufer (staffControlCenter.js) schreibt writeStaffAudit
 * mit actor/reason/confirmed/riskLevel — das ist die Historien-Wahrheit. Diese
 * Spalten spiegeln nur den AKTUELLEN Zustand.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Muss exakt der CHECK-Whitelist in Mig 127 entsprechen. Neue Arten => neue Migration.
export const SUSPENSION_KINDS = Object.freeze([
  "non_payment", "manual", "compliance", "security", "other"
]);

// Mindestlaenge der Begruendung — spiegelt requireConfirmAndReason (>=10) als
// Defense-in-Depth (Service vertraut dem Aufrufer nicht blind).
const MIN_REASON_LEN = 10;

function normKind(v) {
  const s = String(v == null ? "" : v).trim();
  return SUSPENSION_KINDS.includes(s) ? s : "manual";
}

function mapSuspendedRow(r) {
  return {
    org_id: r.id,
    name: r.name,
    plan: r.plan || null,
    customer_stage: r.customer_stage || null,
    suspended: r.access_suspended_at != null,
    suspended_at: r.access_suspended_at || null,
    suspended_reason: r.access_suspended_reason || null,
    suspended_kind: r.access_suspended_kind || null,
    suspended_by: r.access_suspended_by || null
  };
}

/**
 * Org-Zugang sperren (aktiv -> suspended). Idempotent via WHERE-Guard.
 * @returns {Promise<{ok:true,row:object}|{ok:false,error:string}>}
 *   Fehler: INVALID_ORG_ID | REASON_TOO_SHORT | ORG_NOT_FOUND | ALREADY_SUSPENDED
 */
export async function suspendOrgAccess(pool, { orgId, actorUserId, reason, kind } = {}) {
  if (!orgId || !UUID_RE.test(String(orgId))) return { ok: false, error: "INVALID_ORG_ID" };
  const r = String(reason == null ? "" : reason).trim();
  if (r.length < MIN_REASON_LEN) return { ok: false, error: "REASON_TOO_SHORT" };
  const k = normKind(kind);

  const upd = await pool.query(
    `UPDATE organizations
        SET access_suspended_at     = NOW(),
            access_suspended_reason = $2,
            access_suspended_by     = $3,
            access_suspended_kind   = $4
      WHERE id = $1 AND access_suspended_at IS NULL
      RETURNING id, name, plan, customer_stage,
                access_suspended_at, access_suspended_reason,
                access_suspended_kind, access_suspended_by`,
    [orgId, r, actorUserId || null, k]
  );
  if (upd.rowCount === 1) return { ok: true, row: mapSuspendedRow(upd.rows[0]) };

  // 0 Zeilen: entweder Org existiert nicht oder ist bereits gesperrt — disambiguieren.
  const chk = await pool.query(
    "SELECT access_suspended_at FROM organizations WHERE id = $1",
    [orgId]
  );
  if (chk.rowCount === 0) return { ok: false, error: "ORG_NOT_FOUND" };
  return { ok: false, error: "ALREADY_SUSPENDED" };
}

/**
 * Org-Zugang wieder freigeben (suspended -> aktiv). Idempotent via WHERE-Guard.
 * @returns {Promise<{ok:true,row:object}|{ok:false,error:string}>}
 *   Fehler: INVALID_ORG_ID | REASON_TOO_SHORT | ORG_NOT_FOUND | NOT_SUSPENDED
 */
export async function reactivateOrgAccess(pool, { orgId, reason } = {}) {
  if (!orgId || !UUID_RE.test(String(orgId))) return { ok: false, error: "INVALID_ORG_ID" };
  const r = String(reason == null ? "" : reason).trim();
  if (r.length < MIN_REASON_LEN) return { ok: false, error: "REASON_TOO_SHORT" };

  const upd = await pool.query(
    `UPDATE organizations
        SET access_suspended_at     = NULL,
            access_suspended_reason = NULL,
            access_suspended_by     = NULL,
            access_suspended_kind   = NULL
      WHERE id = $1 AND access_suspended_at IS NOT NULL
      RETURNING id, name, plan, customer_stage,
                access_suspended_at, access_suspended_reason,
                access_suspended_kind, access_suspended_by`,
    [orgId]
  );
  if (upd.rowCount === 1) return { ok: true, row: mapSuspendedRow(upd.rows[0]) };

  const chk = await pool.query(
    "SELECT access_suspended_at FROM organizations WHERE id = $1",
    [orgId]
  );
  if (chk.rowCount === 0) return { ok: false, error: "ORG_NOT_FOUND" };
  return { ok: false, error: "NOT_SUSPENDED" };
}

/** Statische Metadaten fuer die UI (Zero-Query). */
export function meta() {
  return { suspension_kinds: [...SUSPENSION_KINDS], min_reason_len: MIN_REASON_LEN };
}

/**
 * Read-only Enforcement-Check: ist der Zugang der Org aktuell gesperrt?
 * Genutzt von requireOrgNotSuspended (Self-Service-Checkout) UND der Webhook-
 * Aktivierung — ein Operator-Hold darf nicht per Self-Service/Zahlung unterlaufen
 * werden. Fail-safe: ungueltige orgId → DB-Fehler propagiert zum Aufrufer (Guard
 * blockt mit 500); 0 Zeilen → false (kein Suspend-Datum = nicht gesperrt).
 */
export async function isOrgAccessSuspended(pool, orgId) {
  if (!orgId) return false;
  const r = await pool.query(
    "SELECT access_suspended_at FROM organizations WHERE id = $1",
    [orgId]
  );
  const row = r && r.rows && r.rows[0];
  return !!(row && row.access_suspended_at != null);
}
