/**
 * dealFeedbackService.js — Deal-Feedback v2 (eBay-modelliert, transaktions-verankert).
 *
 * Phase 1 (Fundament): Eligibility aus completed assignment, Abgabe (submit), Lesen.
 * Mutual-blind Reveal (P2), Reply (P4), Reputation (P5) bauen hierauf auf.
 *
 * Anker = abgeschlossenes Assignment (die "Transaktion"). Beidseitig org<->org:
 *   - company_to_supplier: das anfragende Unternehmen (assignments.org_id) bewertet den Lieferanten
 *   - supplier_to_company: der Lieferant (assignments.supplier_org_id) bewertet das Unternehmen
 * Spec: docs/finalization/RATING_SYSTEM_V2_EBAY_SPEC.md
 */

/** Rollenabhängige Bewertungs-Dimensionen (eBay-DSRs), je 1–5. */
export const DIMENSION_KEYS = {
  company_to_supplier: ["zuverlaessigkeit", "kommunikation", "qualitaet", "termintreue"],
  supplier_to_company: ["briefing_klarheit", "kommunikation", "zahlungsmoral", "fairness"]
};

export const FEEDBACK_WINDOW_DAYS = 60;
const SENTIMENTS = ["positive", "neutral", "negative"];

/** Bestimmt Richtung + bewertete Org aus Assignment + Bewerter-Org. null = keine Partei. */
export function resolveDirection(assignment, raterOrgId) {
  if (!assignment || !raterOrgId) return null;
  if (assignment.org_id === raterOrgId) {
    return { direction: "company_to_supplier", ratedOrgId: assignment.supplier_org_id };
  }
  if (assignment.supplier_org_id === raterOrgId) {
    return { direction: "supplier_to_company", ratedOrgId: assignment.org_id };
  }
  return null;
}

/** Validiert die Dimensionen gegen die für die Richtung erlaubten Schlüssel (alle 1–5). */
export function validateDimensions(direction, dimensions) {
  const allowed = DIMENSION_KEYS[direction];
  if (!allowed) return false;
  if (!dimensions || typeof dimensions !== "object" || Array.isArray(dimensions)) return false;
  const keys = Object.keys(dimensions);
  if (keys.length === 0) return false;
  for (const k of keys) {
    if (!allowed.includes(k)) return false;
    const v = dimensions[k];
    if (!Number.isInteger(v) || v < 1 || v > 5) return false;
  }
  return true;
}

/**
 * Bewertbare abgeschlossene Deals für die Org(s) eines Nutzers:
 * status='completed', im Abgabefenster, in der eigenen Richtung noch nicht bewertet.
 */
export async function getPendingFeedback(pool, { orgIds, windowDays = FEEDBACK_WINDOW_DAYS } = {}) {
  if (!Array.isArray(orgIds) || orgIds.length === 0) return [];
  const dirExpr = "CASE WHEN a.org_id = ANY($1::uuid[]) THEN 'company_to_supplier' ELSE 'supplier_to_company' END";
  const { rows } = await pool.query(
    `SELECT a.id AS assignment_id, a.org_id, a.supplier_org_id, a.completed_at,
            co.name AS company_name, so.name AS supplier_name,
            ${dirExpr} AS direction
       FROM assignments a
       LEFT JOIN organizations co ON co.id = a.org_id
       LEFT JOIN organizations so ON so.id = a.supplier_org_id
      WHERE a.status = 'completed'
        AND a.completed_at > NOW() - make_interval(days => $2)
        AND (a.org_id = ANY($1::uuid[]) OR a.supplier_org_id = ANY($1::uuid[]))
        AND NOT EXISTS (
          SELECT 1 FROM deal_feedback f
           WHERE f.assignment_id = a.id AND f.direction = ${dirExpr}
        )
      ORDER BY a.completed_at DESC
      LIMIT 50`,
    [orgIds, windowDays]
  );
  return rows;
}

/**
 * Feedback abgeben. Validiert: Assignment existiert + completed, Bewerter ist Partei,
 * im Fenster, Sentiment/Dimensionen gültig, je Richtung nur 1× (UNIQUE).
 * Phase 1: status='submitted', moderation='pending' (Reveal in P2).
 */
export async function submitFeedback(pool, { assignmentId, raterOrgId, actorUserId, sentiment, dimensions, comment }, opts = {}) {
  const windowDays = opts.windowDays || FEEDBACK_WINDOW_DAYS;
  const { rows } = await pool.query(
    "SELECT id, org_id, supplier_org_id, status, completed_at FROM assignments WHERE id = $1",
    [assignmentId]
  );
  const a = rows[0];
  if (!a) return { error: "NOT_FOUND" };
  if (a.status !== "completed") return { error: "NOT_COMPLETED" };

  const dir = resolveDirection(a, raterOrgId);
  if (!dir) return { error: "FORBIDDEN" };
  if (!dir.ratedOrgId) return { error: "NO_COUNTERPARTY" };

  if (a.completed_at && (Date.now() - new Date(a.completed_at).getTime()) > windowDays * 86400000) {
    return { error: "WINDOW_CLOSED" };
  }
  if (!SENTIMENTS.includes(sentiment)) return { error: "INVALID_SENTIMENT" };
  if (!validateDimensions(dir.direction, dimensions)) return { error: "INVALID_DIMENSIONS" };
  if (comment != null && String(comment).length > 500) return { error: "COMMENT_TOO_LONG" };

  const ins = await pool.query(
    `INSERT INTO deal_feedback
       (assignment_id, direction, rater_org_id, rated_org_id, actor_user_id, sentiment, dimensions, comment)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     ON CONFLICT (assignment_id, direction) DO NOTHING
     RETURNING *`,
    [assignmentId, dir.direction, raterOrgId, dir.ratedOrgId, actorUserId || null, sentiment, JSON.stringify(dimensions), comment || null]
  );
  if (!ins.rows[0]) return { error: "ALREADY_RATED" };
  return { ok: true, feedback: ins.rows[0] };
}

/** Öffentlich sichtbares Feedback einer Org (nur revealed + approved). Wird ab P2 befüllt. */
export async function getOrgFeedback(pool, orgId, { limit = 20 } = {}) {
  const { rows } = await pool.query(
    `SELECT f.id, f.direction, f.sentiment, f.dimensions, f.comment, f.reply, f.reply_at,
            f.created_at, f.revealed_at, r.name AS rater_org_name
       FROM deal_feedback f
       LEFT JOIN organizations r ON r.id = f.rater_org_id
      WHERE f.rated_org_id = $1 AND f.status = 'revealed' AND f.moderation = 'approved'
      ORDER BY f.revealed_at DESC NULLS LAST, f.created_at DESC
      LIMIT $2`,
    [orgId, limit]
  );
  return rows;
}
