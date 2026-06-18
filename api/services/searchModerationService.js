/**
 * searchModerationService — Phase 5 Verfeinerung: Faekal-/Vulgaersprache in Suchanfragen.
 *
 * screenQuery() nutzt den bestehenden contentModerationService (DE-Schimpfwort-/Hassrede-Filter,
 * Leetspeak-/Umlaut-/Evasions-tolerant) — KEINE neue Wortliste. Geflaggte Anfragen werden in der
 * Suche aussortiert (geblockt) und via recordFlaggedQuery ins Staff Center gemeldet (Upsert ->
 * bounded; Wiederholungen erhoehen hit_count). Staff sichtet via list-/resolveFlaggedQuery.
 */
import { moderateComment } from "./contentModerationService.js";

function normQuery(q) {
  return String(q || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Prueft eine Suchanfrage auf Faekal-/Vulgaersprache.
 * @returns {{ flagged: boolean, severity: string, matches: Array<{word,severity}> }}
 */
export function screenQuery(query) {
  const res = moderateComment(query);
  return { flagged: res.flagged, severity: res.severity, matches: res.matches };
}

/**
 * Meldet eine geflaggte Suchanfrage ans Staff Center (Upsert, bounded je (user_id, query_norm)).
 * Soft-fail-freundlich: der Aufrufer feuert fire-and-forget, die Suchantwort haengt nie daran.
 * @returns {Promise<boolean>} true wenn gespeichert.
 */
export async function recordFlaggedQuery(pool, { userId = null, orgId = null, query, severity = "medium", matchedTerms = [], ip = null, userAgent = null }) {
  const raw = String(query || "").trim();
  const norm = normQuery(raw);
  if (!norm) return false;
  const terms = Array.isArray(matchedTerms) ? matchedTerms.slice(0, 20) : [];
  await pool.query(
    `INSERT INTO flagged_search_queries (user_id, org_id, raw_query, query_norm, severity, matched_terms, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, query_norm) DO UPDATE
       SET hit_count     = flagged_search_queries.hit_count + 1,
           last_seen_at  = NOW(),
           updated_at    = NOW(),
           severity      = EXCLUDED.severity,
           matched_terms = EXCLUDED.matched_terms,
           raw_query     = EXCLUDED.raw_query`,
    [userId, orgId, raw, norm, severity, terms, ip, userAgent]
  );
  return true;
}

/**
 * Staff: geflaggte Suchanfragen auflisten (Default: offene zuerst, jüngste zuerst).
 * @returns {Promise<{ items: Array, total: number, limit: number, offset: number }>}
 */
export async function listFlaggedQueries(pool, { status = null, limit = 100, offset = 0 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const { rows } = await pool.query(
    `SELECT f.id, f.user_id, f.org_id, f.raw_query, f.severity, f.matched_terms, f.hit_count,
            f.status, f.reviewed_by, f.reviewed_at, f.resolution_note, f.ip,
            f.first_seen_at, f.last_seen_at,
            u.email AS user_email, o.name AS org_name
     FROM flagged_search_queries f
     LEFT JOIN users u ON u.id = f.user_id
     LEFT JOIN organizations o ON o.id = f.org_id
     WHERE ($1::text IS NULL OR f.status = $1)
     ORDER BY (f.status = 'open') DESC, f.last_seen_at DESC
     LIMIT $2 OFFSET $3`,
    [status, lim, off]
  );
  const { rows: c } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM flagged_search_queries WHERE ($1::text IS NULL OR status = $1)`,
    [status]
  );
  return { items: rows, total: c[0]?.total || 0, limit: lim, offset: off };
}

/**
 * Staff: einen geflaggten Eintrag abschliessen. action: 'dismiss' (harmlos) | 'action' (bestaetigt/eskaliert).
 * @returns {Promise<{ ok: boolean, row?: object, error?: string }>}
 */
export async function resolveFlaggedQuery(pool, { id, actorId, action, note = null }) {
  const status = action === "dismiss" ? "dismissed" : action === "action" ? "actioned" : null;
  if (!status) return { ok: false, error: "INVALID_ACTION" };
  const { rows } = await pool.query(
    `UPDATE flagged_search_queries
     SET status = $2, reviewed_by = $3, reviewed_at = NOW(), resolution_note = $4, updated_at = NOW()
     WHERE id = $1
     RETURNING id, status, reviewed_at`,
    [id, status, actorId || null, note]
  );
  if (!rows.length) return { ok: false, error: "NOT_FOUND" };
  return { ok: true, row: rows[0] };
}
