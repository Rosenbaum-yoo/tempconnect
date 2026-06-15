/**
 * searchHistoryService — Phase 5 Slice 2: persoenliche Such-Historie (pro Nutzer).
 *
 * Bounded by design: Upsert auf (user_id, query_norm) statt Append -> distinkte Suchbegriffe je
 * Nutzer, kein unbegrenztes Wachstum. Speist die "Letzte Suchen" im Topbar-Suchfeld.
 * Die Suche selbst bleibt serverseitig RBAC-/sichtbarkeits-gefiltert; hier wird nur der
 * Suchbegriff des Nutzers (sein eigener) gespeichert — keine fremden Daten.
 */

const VALID_TYPES = new Set(["all", "requisitions", "capacity_posts", "companies"]);

function normQuery(q) {
  return String(q || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Zeichnet eine Suche auf (Upsert). Soft-fail-freundlich: wirft nur bei echten DB-Fehlern,
 * der Aufrufer (Route) feuert dies bewusst "fire-and-forget" und schluckt Fehler, damit die
 * Suchantwort nie an der Historie haengt.
 * @returns {Promise<boolean>} true bei Treffer (gespeichert), false wenn ignoriert (kein User/zu kurz).
 */
export async function recordSearch(pool, { userId, orgId = null, query, type = "all", resultCount = 0 }) {
  if (!userId) return false;
  const raw = String(query || "").trim();
  const norm = normQuery(raw);
  if (norm.length < 2) return false;
  const safeType = VALID_TYPES.has(type) ? type : "all";
  const count = Number.isFinite(resultCount) ? Math.max(0, Math.trunc(resultCount)) : 0;

  await pool.query(
    `INSERT INTO search_history (user_id, org_id, query, query_norm, type, result_count)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, query_norm) DO UPDATE
       SET search_count = search_history.search_count + 1,
           last_used_at = NOW(),
           result_count = EXCLUDED.result_count,
           type         = EXCLUDED.type,
           query        = EXCLUDED.query`,
    [userId, orgId, raw, norm, safeType, count]
  );
  return true;
}

/**
 * Letzte (distinkte) Suchen eines Nutzers, jüngste zuerst.
 * @returns {Promise<Array<{ query, type, result_count, last_used_at }>>}
 */
export async function getRecentSearches(pool, userId, limit = 6) {
  if (!userId) return [];
  const lim = Math.min(Math.max(parseInt(limit, 10) || 6, 1), 20);
  const { rows } = await pool.query(
    `SELECT query, type, result_count, last_used_at
     FROM search_history WHERE user_id = $1
     ORDER BY last_used_at DESC LIMIT $2`,
    [userId, lim]
  );
  return rows;
}

/**
 * Loescht die Historie eines Nutzers — entweder einen einzelnen Begriff (query) oder alle.
 * Strikt user-gescoped (nur die eigene Historie).
 * @returns {Promise<number>} Anzahl geloeschter Zeilen.
 */
export async function clearHistory(pool, userId, { query = null } = {}) {
  if (!userId) return 0;
  if (query) {
    const { rowCount } = await pool.query(
      `DELETE FROM search_history WHERE user_id = $1 AND query_norm = $2`,
      [userId, normQuery(query)]
    );
    return rowCount;
  }
  const { rowCount } = await pool.query(
    `DELETE FROM search_history WHERE user_id = $1`,
    [userId]
  );
  return rowCount;
}
