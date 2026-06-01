/**
 * orgContext.js — Tenant-Context-Utilitys für Row-Level Security (RLS).
 *
 * PostgreSQL RLS ist in migration 031_rls_prep.sql aktiviert.
 * Die Policies filtern anhand von `app.current_org_id` (Session-Variable).
 *
 * Strategie:
 *   - `SET LOCAL app.current_org_id = ?`   → gilt nur innerhalb einer Transaktion (safe für Pool)
 *   - `SET LOCAL app.rls_bypass = 'staff'`  → explizites Staff-Bypass (kein IS NULL Wildcard mehr)
 *
 * Sicherheitskonzept:
 *   - Ohne gesetzten Kontext: RLS blockt tenant-scoped Tabellen (deny-by-default nach Migration 120)
 *   - Normaler Request: withOrgContext setzt org_id und filtert nur die eigene Org
 *   - Staff-Request: withStaffContext setzt rls_bypass und erlaubt Cross-Org-Zugriff (auditiert!)
 *   - Background-Jobs mit Org-Bezug: withOrgContext(pool, jobOrgId, fn)
 *   - Platform-Migrations: laufen außerhalb Transaktionen mit superuser (BYPASSRLS)
 *
 * Warnung: SET LOCAL wirkt NUR innerhalb einer offenen Transaktion (BEGIN...COMMIT).
 *   Für ad-hoc pool.query()-Aufrufe außerhalb von Transaktionen greift der Context nicht.
 *   Alle Zugriffe auf RLS-geschützte Tabellen MÜSSEN über withOrgContext / withStaffContext laufen.
 *
 * WAVE 05 — Phase 2 — 2026-05-26
 */

import { withTransaction } from "./transaction.js";

/**
 * Führt `fn(client)` in einer Transaktion aus und setzt vorher den Org-Kontext.
 *
 * SET LOCAL app.current_org_id = orgId → RLS filtert auf diese Org.
 * SET LOCAL app.rls_bypass = ''         → kein Staff-Bypass (Standard).
 *
 * @param {import('pg').Pool} pool
 * @param {string | null} orgId  - UUID der Organisation; null → kein Org-Context (verhält sich wie deny)
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
export async function withOrgContext(pool, orgId, fn) {
  return await withTransaction(pool, async (client) => {
    if (orgId) {
      await client.query("SET LOCAL app.current_org_id = $1", [orgId]);
    }
    // Reset staff bypass explizit (kein Vertrauen auf Pool-State)
    await client.query("SET LOCAL app.rls_bypass = $1", [""]);
    return fn(client);
  });
}

/**
 * Führt `fn(client)` in einer Transaktion aus und setzt den Staff-Bypass-Kontext.
 *
 * SET LOCAL app.rls_bypass = 'staff' → RLS-Policy erlaubt Cross-Org-Zugriff.
 * Darf NUR in verifizierten Staff-Kontexten (staffControlAccess-Middleware) verwendet werden.
 *
 * Jede Nutzung von withStaffContext MUSS in audit_log eingetragen werden:
 *   await client.query("INSERT INTO audit_log (action, ...) VALUES ('staff_cross_org_access', ...)")
 *
 * @param {import('pg').Pool} pool
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @param {{ reason: string, actorUserId?: string }} opts - Pflichtfeld für Audit
 * @returns {Promise<T>}
 * @template T
 */
export async function withStaffContext(pool, fn, opts = {}) {
  if (!opts.reason) {
    throw new Error("withStaffContext: opts.reason ist Pflichtfeld (Audit-Anforderung)");
  }
  return await withTransaction(pool, async (client) => {
    await client.query("SET LOCAL app.rls_bypass = $1", ["staff"]);
    // Org-Context leer lassen (Staff sieht alles — Policy erlaubt es via rls_bypass)
    await client.query("SET LOCAL app.current_org_id = $1", [""]);
    return fn(client);
  });
}

/**
 * Gibt den aktuell gesetzten Org-Context aus der DB zurück (für Health-Checks / Tests).
 *
 * @param {import('pg').PoolClient | import('pg').Pool} client
 * @returns {Promise<{ current_org_id: string | null, rls_bypass: string }>}
 */
export async function getOrgContextState(client) {
  const { rows } = await client.query(`
    SELECT
      current_setting('app.current_org_id', TRUE) AS current_org_id,
      current_setting('app.rls_bypass', TRUE)      AS rls_bypass
  `);
  return {
    current_org_id: rows[0]?.current_org_id ?? null,  // null = truly unset; "" = explicitly cleared
    rls_bypass:     rows[0]?.rls_bypass || "",
  };
}
