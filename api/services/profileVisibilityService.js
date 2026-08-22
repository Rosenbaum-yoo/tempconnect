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
/*
 * DREI FEHLER UEBEREINANDER, alle drei lautlos — am 2026-08-22 gegen die
 * laufende Datenbank bewiesen (Migration 189 traegt die Belege im Kopf):
 *
 *   1. Drei der fuenf erlaubten Gruende (`fake_profile`, `misleading_info`,
 *      `inappropriate_content`) verletzten den CHECK der Tabelle, der die
 *      Kurzformen aus Migration 120 verlangte.
 *   2. `ON CONFLICT (reported_org_id, reporter_user_id)` hatte KEINEN passenden
 *      eindeutigen Index — Postgres lehnte damit auch die verbleibenden zwei
 *      Gruende ab. Also JEDE Meldung.
 *   3. `catch { return { ok:false, reason:"DB_ERROR" } }` verschluckte beides.
 *      Der Nutzer las "Meldung konnte nicht gespeichert werden", niemand
 *      erfuhr warum, und die leere Tabelle sah aus wie "es meldet halt niemand".
 *
 * Migration 189 raeumt 1 und 2 aus. Hier bleibt 3: der Fehler wird nicht mehr
 * verschluckt, sondern als `fehler` mitgegeben, damit die Route ihn
 * protokollieren kann. Ein Fehlerpfad, den niemand sieht, ist kein Fehlerpfad —
 * er ist eine Lücke, die sich als Ruhe tarnt.
 */

/** Kurzformen aus Migration 120 auf das Vokabular der API und der Oberflaeche. */
const GRUND_ABBILDUNG = Object.freeze({
  fake: "fake_profile",
  misleading: "misleading_info",
  inappropriate: "inappropriate_content",
});
const ERLAUBTE_GRUENDE = Object.freeze([
  "spam", "fake_profile", "misleading_info", "inappropriate_content", "other",
]);

export async function reportProfileAbuse(pool, {
  reportedOrgId, reporterUserId, reason, details, zielArt = "profil", zielId = null,
}) {
  const grund = GRUND_ABBILDUNG[reason] || reason;
  if (!ERLAUBTE_GRUENDE.includes(grund)) {
    return { ok: false, reason: "INVALID_REASON" };
  }
  if (!["profil", "angebot"].includes(zielArt)) {
    return { ok: false, reason: "INVALID_TARGET" };
  }
  // Kein Selbst-Report
  if (!reportedOrgId || !reporterUserId) return { ok: false, reason: "MISSING_PARAMS" };
  /* Bei einer Profilmeldung IST das Ziel die Organisation. Die Spalte bewusst
   * auch dann zu fuellen erspart einen COALESCE-Ausdrucksindex — und genau so
   * ein Index war Fehler 2. */
  const ziel = zielArt === "profil" ? reportedOrgId : zielId;
  if (!ziel) return { ok: false, reason: "MISSING_TARGET" };

  try {
    const { rows } = await pool.query(
      `INSERT INTO profile_abuse_reports
         (reported_org_id, reporter_user_id, reason, details, ziel_art, ziel_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (reporter_user_id, ziel_art, ziel_id)
         DO UPDATE SET reason = EXCLUDED.reason, details = EXCLUDED.details, updated_at = NOW()
       RETURNING id`,
      [reportedOrgId, reporterUserId, grund, details || null, zielArt, ziel]
    );
    return { ok: true, id: rows[0]?.id };
  } catch (fehler) {
    return { ok: false, reason: "DB_ERROR", fehler };
  }
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
      /* `status = 'pending'` stand hier — ein Wert, den der CHECK dieser Tabelle
       * NIE erlaubt hat (`open | under_review | resolved_dismissed |
       * resolved_action_taken`, Vorgabe `open`). Der Posteingang war damit
       * dauerhaft leer, und weil `catch { return []; }` daneben stand, sah das
       * aus wie "keine Meldungen" statt wie "die Abfrage trifft nichts".
       *
       * `under_review` gehoert dazu: ein Fall, den jemand angefasst hat, darf
       * nicht aus der Liste fallen, bevor er erledigt ist — sonst arbeitet man
       * ihn zweimal an oder gar nicht. */
      `SELECT par.id, par.reason, par.details, par.status,
              par.created_at, par.updated_at,
              par.ziel_art, par.ziel_id,
              o.name AS reported_org_name, par.reported_org_id
       FROM profile_abuse_reports par
       JOIN organizations o ON o.id = par.reported_org_id
       WHERE par.status IN ('open', 'under_review')
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
/*
 * Die Aufrufer (`staffControlCenter.js:2115`, `:2134`) sprechen `resolved` und
 * `dismissed`. Die Tabelle kennt `resolved_action_taken` und
 * `resolved_dismissed`. Geschrieben wurde bisher das WORT DES AUFRUFERS — was
 * den CHECK verletzt haette, wenn die Abfrage ueberhaupt je eine Zeile getroffen
 * haette: `WHERE ... status = 'pending'` traf nie etwas, also endete jede
 * Aktion in "NOT_FOUND_OR_ALREADY_PROCESSED". Zwei Fehler, die sich gegenseitig
 * verdeckt haben.
 *
 * Die Abbildung steht hier und nicht bei den Aufrufern: sonst muss sie jeder
 * neue Aufrufer erneut richtig treffen.
 */
const ABSCHLUSS_STATUS = Object.freeze({
  resolved: "resolved_action_taken",
  dismissed: "resolved_dismissed",
});

export async function resolveAbuseReport(pool, reportId, newStatus, staffUserId) {
  const zielStatus = ABSCHLUSS_STATUS[newStatus];
  if (!zielStatus) {
    return { ok: false, reason: "INVALID_STATUS" };
  }
  try {
    const { rowCount } = await pool.query(
      `UPDATE profile_abuse_reports
       SET status = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status IN ('open', 'under_review')`,
      [reportId, zielStatus, staffUserId]
    );
    if (!rowCount) return { ok: false, reason: "NOT_FOUND_OR_ALREADY_PROCESSED" };
    return { ok: true };
  } catch (fehler) { return { ok: false, reason: "DB_ERROR", fehler }; }
}
