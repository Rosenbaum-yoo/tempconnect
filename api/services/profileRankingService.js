/**
 * Profile Ranking Service — Marketplace Visibility Center (M-03)
 *
 * Verwaltet Ranking-Snapshots fuer oeffentliche Profile und erstellt
 * das kuratierte oeffentliche Marketplace-Ranking.
 *
 * Baut direkt auf reputationService.js auf:
 *   - computeRankingScore()        — statischer 0-70-Score
 *   - computePremiumBoost()        — Plan-Boost (gedeckelt)
 *   - computeEffectiveRankScore()  — finaler 0-100-Score
 *   - computeScoreGrade()          — UNRATED/BRONZE/SILVER/GOLD/PLATINUM
 *
 * Das Scoring selbst ist in reputationService.js implementiert.
 * Dieser Service fügt hinzu: Persistenz (Snapshots), Ranking-Positionen,
 * oeffentliche Ranking-API.
 *
 * Ranking-Boost-Cap: Max +10% des Basis-Scores (Pflicht lt. Sicherheitsanforderungen).
 * Implementiert in reputationService.computePremiumBoost() und computeEffectiveRankScore().
 */

import {
  computeRankingScore,
  computeEffectiveRankScore,
  computePremiumBoost,
  computeScoreGrade
} from './reputationService.js';
import { getApprovedPublicOrgIds } from './profileVisibilityService.js';

/* ── Snapshot schreiben ───────────────────────────────── */

/**
 * Speichert einen Ranking-Snapshot fuer eine Organisation (taeglich).
 * ON CONFLICT: Update wenn gleicher Tag bereits vorhanden.
 *
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @param {{
 *   snapshotDate?: string,      // ISO date, default: today
 *   rankingScore: number,
 *   reputationScore?: number|null,
 *   activityScore?: number|null,
 *   premiumBoost?: number|null,
 *   effectiveRankScore?: number|null,
 *   rankSegment?: string|null
 * }} data
 * @returns {Promise<Object|null>}
 */
export async function saveRankingSnapshot(pool, orgId, data) {
  const date = data.snapshotDate || new Date().toISOString().slice(0, 10);
  try {
    const { rows } = await pool.query(
      `INSERT INTO profile_ranking_snapshots
         (org_id, snapshot_date, ranking_score, reputation_score, activity_score,
          premium_boost, effective_rank_score, rank_segment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (org_id, snapshot_date) DO UPDATE SET
         ranking_score        = EXCLUDED.ranking_score,
         reputation_score     = EXCLUDED.reputation_score,
         activity_score       = EXCLUDED.activity_score,
         premium_boost        = EXCLUDED.premium_boost,
         effective_rank_score = EXCLUDED.effective_rank_score,
         rank_segment         = EXCLUDED.rank_segment
       RETURNING *`,
      [
        orgId,
        date,
        data.rankingScore ?? 0,
        data.reputationScore ?? null,
        data.activityScore ?? null,
        data.premiumBoost ?? null,
        data.effectiveRankScore ?? null,
        data.rankSegment ?? null
      ]
    );
    return rows[0] || null;
  } catch { return null; }
}

/**
 * Holt den aktuellsten Snapshot einer Organisation.
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @returns {Promise<Object|null>}
 */
export async function getLatestSnapshot(pool, orgId) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM profile_ranking_snapshots
       WHERE org_id = $1
       ORDER BY snapshot_date DESC
       LIMIT 1`,
      [orgId]
    );
    return rows[0] || null;
  } catch { return null; }
}

/* ── Snapshot für eine Organisation berechnen ────────── */

/**
 * Berechnet und persistiert einen Ranking-Snapshot fuer eine Organisation.
 * Liest Reputation aus supplier_reputation, berechnet Scores und speichert.
 *
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @returns {Promise<Object|null>} Der gespeicherte Snapshot oder null
 */
export async function buildSnapshotForOrg(pool, orgId) {
  // Reputation aus supplier_reputation lesen
  // supplier_reputation.supplier_id = user_id des Org-Owners
  // Da Orgs mehrere Member haben, nehmen wir den primären Owner (created_by oder ältestes Mitglied)
  let rep = null;
  try {
    const { rows } = await pool.query(
      `SELECT sr.reputation_score, sr.activity_score, sr.response_time_score,
              sr.deal_success_rate, sr.ranking_score AS legacy_ranking_score,
              o.plan AS org_plan
       FROM organizations o
       LEFT JOIN org_memberships om ON om.org_id = o.id AND om.role = 'owner'
       LEFT JOIN supplier_reputation sr ON sr.supplier_id = om.user_id
       WHERE o.id = $1
       LIMIT 1`,
      [orgId]
    );
    rep = rows[0] || null;
  } catch { /* org oder supplier_reputation nicht gefunden */ }

  if (!rep) return null;

  const factors = {
    reputationScore:  Number(rep.reputation_score) || 0,
    responseTimeScore: Number(rep.response_time_score) || 0,
    dealSuccessRate:  Number(rep.deal_success_rate) || 0,
    activityScore:    Number(rep.activity_score) || 0
  };

  const rankingScore     = computeRankingScore(factors);
  const premiumBoost     = computePremiumBoost(rep.org_plan || 'DEMO', factors.reputationScore);
  // Kein recency-Boost in täglichem Batch (wird query-time angewendet), priorityBoost = 0
  const effectiveRankScore = computeEffectiveRankScore(rankingScore, 0, premiumBoost, 0);
  const rankSegment      = computeScoreGrade(factors.reputationScore);

  return saveRankingSnapshot(pool, orgId, {
    rankingScore,
    reputationScore:  factors.reputationScore,
    activityScore:    factors.activityScore,
    premiumBoost,
    effectiveRankScore,
    rankSegment
  });
}

/* ── Täglicher Batch-Run ──────────────────────────────── */

/**
 * Erstellt Snapshots für alle Organisationen mit genehmigtem oeffentlichem Profil.
 * Intended für täglichen Cron-Job.
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<{processed: number, errors: number}>}
 */
export async function runDailySnapshotBatch(pool) {
  const orgIds = await getApprovedPublicOrgIds(pool, { limit: 1000 });
  let processed = 0;
  let errors = 0;

  for (const orgId of orgIds) {
    const result = await buildSnapshotForOrg(pool, orgId);
    if (result) {
      processed++;
    } else {
      errors++;
    }
  }

  return { processed, errors };
}

/* ── Rang-Positionen zuweisen ─────────────────────────── */

/**
 * Weist allen Snapshots eines bestimmten Datums rank_position zu
 * basierend auf effective_rank_score (absteigend).
 * Position 1 = bestes Profil.
 *
 * @param {import('pg').Pool} pool
 * @param {string} [snapshotDate] - ISO date, default: heute
 * @returns {Promise<number>} Anzahl aktualisierter Snapshots
 */
export async function updateRankPositions(pool, snapshotDate) {
  const date = snapshotDate || new Date().toISOString().slice(0, 10);
  try {
    const { rowCount } = await pool.query(
      `UPDATE profile_ranking_snapshots prs
       SET rank_position = ranks.pos
       FROM (
         SELECT id,
                ROW_NUMBER() OVER (ORDER BY COALESCE(effective_rank_score, 0) DESC, created_at ASC) AS pos
         FROM profile_ranking_snapshots
         WHERE snapshot_date = $1
       ) ranks
       WHERE prs.id = ranks.id`,
      [date]
    );
    return rowCount || 0;
  } catch { return 0; }
}

/* ── Öffentliches Ranking ─────────────────────────────── */

/**
 * Öffentliche Rangliste der besten Profile.
 * Nur für Orgs mit genehmigtem oeffentlichem Profil.
 * Nutzt den aktuellsten Snapshot pro Organisation.
 *
 * @param {import('pg').Pool} pool
 * @param {{
 *   limit?: number,
 *   segment?: 'BRONZE'|'SILVER'|'GOLD'|'PLATINUM'|null,
 *   snapshotDate?: string
 * }} opts
 * @returns {Promise<Object[]>}
 */
export async function getPublicRanking(pool, { limit = 100, segment = null, snapshotDate } = {}) {
  const date = snapshotDate || new Date().toISOString().slice(0, 10);
  try {
    const params = [date, limit];
    const segmentClause = segment ? `AND prs.rank_segment = $3` : '';
    if (segment) params.push(segment);

    const { rows } = await pool.query(
      `SELECT
         prs.org_id,
         prs.rank_position,
         prs.ranking_score,
         prs.effective_rank_score,
         prs.rank_segment,
         prs.reputation_score,
         prs.activity_score,
         o.name AS org_name,
         cp.logo_url,
         cp.industry_focus,
         cp.headquarters_city,
         cp.company_size
       FROM profile_ranking_snapshots prs
       JOIN profile_visibility_settings pvs ON pvs.org_id = prs.org_id
                                            AND pvs.is_public = true
                                            AND pvs.status = 'approved'
       JOIN organizations o ON o.id = prs.org_id
       LEFT JOIN (
         SELECT cp2.user_id, cp2.logo_url, cp2.industry_focus,
                cp2.headquarters_city, cp2.company_size
         FROM company_profiles cp2
         JOIN org_memberships om2 ON om2.user_id = cp2.user_id AND om2.role = 'owner'
       ) cp ON cp.user_id IN (
         SELECT user_id FROM org_memberships WHERE org_id = prs.org_id AND role = 'owner'
       )
       WHERE prs.snapshot_date = $1
         ${segmentClause}
       ORDER BY COALESCE(prs.rank_position, 99999) ASC,
                COALESCE(prs.effective_rank_score, 0) DESC
       LIMIT $2`,
      params
    );
    return rows;
  } catch { return []; }
}

/**
 * Rankingeinstieg für eine einzelne Org (für Profilseite).
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @returns {Promise<{rank_position: number|null, rank_segment: string|null, effective_rank_score: number|null}|null>}
 */
export async function getOrgRankInfo(pool, orgId) {
  try {
    const { rows } = await pool.query(
      `SELECT rank_position, rank_segment, effective_rank_score
       FROM profile_ranking_snapshots
       WHERE org_id = $1
       ORDER BY snapshot_date DESC
       LIMIT 1`,
      [orgId]
    );
    return rows[0] || null;
  } catch { return null; }
}
