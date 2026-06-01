/**
 * Profile Visibility Service — Marketplace Visibility Center (M-03)
 *
 * Steuert den Sichtbarkeitsstatus oeffentlicher Organisationsprofile.
 * Zustandsmaschine:
 *   draft → submitted → approved | rejected
 *   approved → suspended (Staff) | paused (Org)
 *   paused | rejected → submitted (erneute Einreichung)
 *
 * Nicht-verhandelbare Sicherheitsregel:
 *   Ein Profil ist NUR sichtbar wenn is_public=true UND status='approved'.
 *   Alle anderen Zustände verbergen das Profil — keine Ausnahmen.
 *
 * Staff-Aktionen (approve/reject/suspend) erfordern serverseitig
 * requireStaffAccess — wird in der Route geprüft, NICHT hier.
 */

/* ── Erlaubte Status-Übergänge ─────────────────────────── */

const VALID_TRANSITIONS = {
  draft:      ['submitted'],
  submitted:  ['approved', 'rejected'],
  approved:   ['suspended', 'paused'],
  paused:     ['submitted', 'approved'],   // resume = Staff setzt direkt auf approved
  rejected:   ['submitted'],
  suspended:  []                           // Suspended kann NUR Staff aufheben (admin-Aktion)
};

/**
 * Prüft ob ein Status-Übergang erlaubt ist.
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function isTransitionAllowed(from, to) {
  return (VALID_TRANSITIONS[from] || []).includes(to);
}

/* ── Get / Init ───────────────────────────────────────── */

/**
 * Holt die Sichtbarkeitseinstellungen einer Organisation.
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @returns {Promise<Object|null>}
 */
export async function getVisibilitySettings(pool, orgId) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM profile_visibility_settings WHERE org_id = $1`,
      [orgId]
    );
    return rows[0] || null;
  } catch { return null; }
}

/**
 * Legt Standard-Einstellungen an wenn noch nicht vorhanden (idempotent).
 * Default: is_public=false, status='draft'.
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @returns {Promise<Object>}
 */
export async function initVisibilitySettings(pool, orgId) {
  const { rows } = await pool.query(
    `INSERT INTO profile_visibility_settings (org_id)
     VALUES ($1)
     ON CONFLICT (org_id) DO UPDATE SET updated_at = updated_at
     RETURNING *`,
    [orgId]
  );
  return rows[0];
}

/* ── Org-seitige Aktionen ─────────────────────────────── */

/**
 * Schaltet das OPT-IN-Flag um.
 * Erlaubt nur wenn status IN ('draft', 'submitted', 'paused').
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @param {boolean} isPublic
 * @returns {Promise<{ok: boolean, reason?: string, settings?: Object}>}
 */
export async function setPublicOptIn(pool, orgId, isPublic) {
  await initVisibilitySettings(pool, orgId);
  const { rows } = await pool.query(
    `UPDATE profile_visibility_settings
     SET is_public = $2, updated_at = NOW()
     WHERE org_id = $1
       AND status NOT IN ('approved', 'suspended')
     RETURNING *`,
    [orgId, !!isPublic]
  );
  if (!rows[0]) return { ok: false, reason: 'CANNOT_CHANGE_APPROVED_OR_SUSPENDED' };
  return { ok: true, settings: rows[0] };
}

/**
 * Reicht das Profil zur Staff-Prüfung ein (draft|paused|rejected → submitted).
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @returns {Promise<{ok: boolean, reason?: string, settings?: Object}>}
 */
export async function submitForReview(pool, orgId) {
  await initVisibilitySettings(pool, orgId);
  const current = await getVisibilitySettings(pool, orgId);
  if (!current) return { ok: false, reason: 'NOT_FOUND' };
  if (!isTransitionAllowed(current.status, 'submitted')) {
    return { ok: false, reason: `INVALID_TRANSITION_FROM_${current.status.toUpperCase()}` };
  }
  const { rows } = await pool.query(
    `UPDATE profile_visibility_settings
     SET status = 'submitted', submitted_at = NOW(), updated_at = NOW()
     WHERE org_id = $1
     RETURNING *`,
    [orgId]
  );
  return { ok: true, settings: rows[0] };
}

/* ── Staff-Aktionen ───────────────────────────────────── */

/**
 * Genehmigt ein eingereichtes Profil. Nur Staff.
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @param {string} staffUserId
 * @returns {Promise<{ok: boolean, reason?: string, settings?: Object}>}
 */
export async function approveVisibility(pool, orgId, staffUserId) {
  const current = await getVisibilitySettings(pool, orgId);
  if (!current) return { ok: false, reason: 'NOT_FOUND' };
  if (!isTransitionAllowed(current.status, 'approved')) {
    return { ok: false, reason: `INVALID_TRANSITION_FROM_${current.status.toUpperCase()}` };
  }
  const { rows } = await pool.query(
    `UPDATE profile_visibility_settings
     SET status = 'approved',
         approved_at  = NOW(),
         reviewed_at  = NOW(),
         reviewed_by  = $2,
         rejection_reason = NULL,
         updated_at   = NOW()
     WHERE org_id = $1
     RETURNING *`,
    [orgId, staffUserId]
  );
  return { ok: true, settings: rows[0] };
}

/**
 * Lehnt ein eingereichtes Profil ab. Nur Staff.
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @param {string} staffUserId
 * @param {string} reason
 * @returns {Promise<{ok: boolean, reason?: string, settings?: Object}>}
 */
export async function rejectVisibility(pool, orgId, staffUserId, reason) {
  const current = await getVisibilitySettings(pool, orgId);
  if (!current) return { ok: false, reason: 'NOT_FOUND' };
  if (!isTransitionAllowed(current.status, 'rejected')) {
    return { ok: false, reason: `INVALID_TRANSITION_FROM_${current.status.toUpperCase()}` };
  }
  const { rows } = await pool.query(
    `UPDATE profile_visibility_settings
     SET status = 'rejected',
         reviewed_at      = NOW(),
         reviewed_by      = $2,
         rejection_reason = $3,
         approved_at      = NULL,
         updated_at       = NOW()
     WHERE org_id = $1
     RETURNING *`,
    [orgId, staffUserId, reason || null]
  );
  return { ok: true, settings: rows[0] };
}

/**
 * Suspendiert ein genehmigtes Profil (schwerer Eingriff). Nur Staff.
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @param {string} staffUserId
 * @param {string} reason
 * @returns {Promise<{ok: boolean, reason?: string, settings?: Object}>}
 */
export async function suspendVisibility(pool, orgId, staffUserId, reason) {
  const current = await getVisibilitySettings(pool, orgId);
  if (!current) return { ok: false, reason: 'NOT_FOUND' };
  if (!isTransitionAllowed(current.status, 'suspended')) {
    return { ok: false, reason: `INVALID_TRANSITION_FROM_${current.status.toUpperCase()}` };
  }
  const { rows } = await pool.query(
    `UPDATE profile_visibility_settings
     SET status = 'suspended',
         suspended_at     = NOW(),
         suspended_reason = $2,
         reviewed_by      = $3,
         updated_at       = NOW()
     WHERE org_id = $1
     RETURNING *`,
    [orgId, reason || null, staffUserId]
  );
  return { ok: true, settings: rows[0] };
}

/**
 * Pausiert ein genehmigtes Profil (temporär, org-initiiert).
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @returns {Promise<{ok: boolean, reason?: string, settings?: Object}>}
 */
export async function pauseVisibility(pool, orgId) {
  const current = await getVisibilitySettings(pool, orgId);
  if (!current) return { ok: false, reason: 'NOT_FOUND' };
  if (!isTransitionAllowed(current.status, 'paused')) {
    return { ok: false, reason: `INVALID_TRANSITION_FROM_${current.status.toUpperCase()}` };
  }
  const { rows } = await pool.query(
    `UPDATE profile_visibility_settings
     SET status = 'paused', updated_at = NOW()
     WHERE org_id = $1
     RETURNING *`,
    [orgId]
  );
  return { ok: true, settings: rows[0] };
}

/**
 * Reaktiviert ein pausiertes Profil (direktes Resume durch Staff).
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @param {string} staffUserId
 * @returns {Promise<{ok: boolean, reason?: string, settings?: Object}>}
 */
export async function resumeVisibility(pool, orgId, staffUserId) {
  const current = await getVisibilitySettings(pool, orgId);
  if (!current) return { ok: false, reason: 'NOT_FOUND' };
  if (current.status !== 'paused') {
    return { ok: false, reason: `INVALID_TRANSITION_FROM_${current.status.toUpperCase()}` };
  }
  const { rows } = await pool.query(
    `UPDATE profile_visibility_settings
     SET status = 'approved',
         approved_at  = COALESCE(approved_at, NOW()),
         reviewed_at  = NOW(),
         reviewed_by  = $2,
         updated_at   = NOW()
     WHERE org_id = $1
     RETURNING *`,
    [orgId, staffUserId]
  );
  return { ok: true, settings: rows[0] };
}

/* ── Sichtbarkeitsprüfungen ───────────────────────────── */

/**
 * Schnellprüfung: Ist dieses Profil oeffentlich sichtbar?
 * Bedingung: is_public=true AND status='approved'.
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @returns {Promise<boolean>}
 */
export async function isProfilePubliclyVisible(pool, orgId) {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM profile_visibility_settings
       WHERE org_id = $1 AND is_public = true AND status = 'approved'
       LIMIT 1`,
      [orgId]
    );
    return rows.length > 0;
  } catch { return false; }
}

/**
 * Listet alle Organisationen mit genehmigtem oeffentlichem Profil.
 * Verwendet für Ranking-Batch und Marketplace-Suche.
 * @param {import('pg').Pool} pool
 * @param {{ limit?: number, offset?: number }} opts
 * @returns {Promise<string[]>} Array von org_id-Werten
 */
export async function getApprovedPublicOrgIds(pool, { limit = 500, offset = 0 } = {}) {
  try {
    const { rows } = await pool.query(
      `SELECT org_id FROM profile_visibility_settings
       WHERE is_public = true AND status = 'approved'
       ORDER BY approved_at ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return rows.map(r => r.org_id);
  } catch { return []; }
}

/* ── Staff-Übersicht ──────────────────────────────────── */

/**
 * Listet alle eingereichten Profile (status='submitted') für Staff-Review.
 * @param {import('pg').Pool} pool
 * @param {{ limit?: number }} opts
 * @returns {Promise<Object[]>}
 */
export async function getPendingVisibilitySubmissions(pool, { limit = 50 } = {}) {
  try {
    const { rows } = await pool.query(
      `SELECT pvs.*, o.name AS org_name
       FROM profile_visibility_settings pvs
       JOIN organizations o ON o.id = pvs.org_id
       WHERE pvs.status = 'submitted'
       ORDER BY pvs.submitted_at ASC
       LIMIT $1`,
      [limit]
    );
    return rows;
  } catch { return []; }
}

/* ── M-11: Missbrauchsschutz ──────────────────────────── */

/**
 * Meldet ein Profil als missbräuchlich.
 * UNIQUE(reported_org_id, reporter_user_id) — idempotent, kein Double-Report.
 *
 * @param {import('pg').Pool} pool
 * @param {{ reportedOrgId: string, reporterUserId: string, reason: string, details?: string }} params
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function reportProfileAbuse(pool, { reportedOrgId, reporterUserId, reason, details }) {
  const ALLOWED_REASONS = ["spam", "fake_profile", "misleading_info", "inappropriate_content", "other"];
  if (!ALLOWED_REASONS.includes(reason)) {
    return { ok: false, reason: "INVALID_REASON" };
  }
  // Kein Selbst-Report
  if (!reportedOrgId || !reporterUserId) return { ok: false, reason: "MISSING_PARAMS" };
  try {
    const { rows } = await pool.query(
      `INSERT INTO profile_abuse_reports
         (reported_org_id, reporter_user_id, reason, details)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (reported_org_id, reporter_user_id)
         DO UPDATE SET reason = EXCLUDED.reason, details = EXCLUDED.details, updated_at = NOW()
       RETURNING id`,
      [reportedOrgId, reporterUserId, reason, details || null]
    );
    return { ok: true, id: rows[0]?.id };
  } catch { return { ok: false, reason: "DB_ERROR" }; }
}

/**
 * Staff: Listet alle offenen Abuse-Reports (status='pending').
 * @param {import('pg').Pool} pool
 * @param {{ limit?: number }} opts
 * @returns {Promise<Object[]>}
 */
export async function getPendingAbuseReports(pool, { limit = 100 } = {}) {
  try {
    const { rows } = await pool.query(
      `SELECT par.id, par.reason, par.details, par.status,
              par.created_at, par.updated_at,
              o.name AS reported_org_name, par.reported_org_id
       FROM profile_abuse_reports par
       JOIN organizations o ON o.id = par.reported_org_id
       WHERE par.status = 'pending'
       ORDER BY par.created_at ASC
       LIMIT $1`,
      [limit]
    );
    return rows;
  } catch { return []; }
}

/**
 * Staff: Schliesst einen Abuse-Report (pending → resolved / dismissed).
 * @param {import('pg').Pool} pool
 * @param {string} reportId
 * @param {'resolved' | 'dismissed'} newStatus
 * @param {string} staffUserId
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function resolveAbuseReport(pool, reportId, newStatus, staffUserId) {
  if (!["resolved", "dismissed"].includes(newStatus)) {
    return { ok: false, reason: "INVALID_STATUS" };
  }
  try {
    const { rowCount } = await pool.query(
      `UPDATE profile_abuse_reports
       SET status = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'pending'`,
      [reportId, newStatus, staffUserId]
    );
    if (!rowCount) return { ok: false, reason: "NOT_FOUND_OR_ALREADY_PROCESSED" };
    return { ok: true };
  } catch { return { ok: false, reason: "DB_ERROR" }; }
}
