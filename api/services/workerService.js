/**
 * Worker Service
 * Verwaltung von Arbeitnehmer-Accounts, Einladungen, Profilen und Assignment-Links.
 * Alle Operationen sind org-scoped (supplier_org_id) und auditierbar.
 */
import crypto from "crypto";
import * as assignmentStaffingService from "./assignmentStaffingService.js";
import { isWorkerBlockedForCompany } from "./companyBlocklistService.js";
import * as submissionSvc from "./workerSubmissionService.js";
import { withTransaction } from "../utils/transaction.js";
import {
  buildAssignmentActivePredicateSql,
  buildAssignmentHistoryPredicateSql,
  buildAssignmentLifecycleBucketSql,
  buildAssignmentLifecycleStateSql,
  buildAssignmentEffectiveEndDateSql
} from "./assignmentLifecycleService.js";

const workerAssignmentEffectiveEndDateSql = buildAssignmentEffectiveEndDateSql({
  assignmentAlias: "a",
  linkAlias: "wal"
});
const workerAssignmentLifecycleStateSql = buildAssignmentLifecycleStateSql({
  assignmentAlias: "a",
  linkAlias: "wal"
});
const workerAssignmentLifecycleBucketSql = buildAssignmentLifecycleBucketSql({
  assignmentAlias: "a",
  linkAlias: "wal"
});
const workerAssignmentIsCurrentSql = buildAssignmentActivePredicateSql({
  assignmentAlias: "a",
  linkAlias: "wal"
});
const workerAssignmentIsHistorySql = buildAssignmentHistoryPredicateSql({
  assignmentAlias: "a",
  linkAlias: "wal"
});
const workerAssignmentLifecycleSelectSql = `
       ${workerAssignmentEffectiveEndDateSql} AS assignment_effective_end_date,
       ${workerAssignmentLifecycleStateSql} AS assignment_lifecycle_state,
       ${workerAssignmentLifecycleBucketSql} AS assignment_lifecycle_bucket,
       ${workerAssignmentIsCurrentSql} AS assignment_is_current,
       ${workerAssignmentIsHistorySql} AS assignment_is_history,
       (${workerAssignmentLifecycleStateSql} = 'ends_today') AS assignment_ends_today,
       (${workerAssignmentLifecycleStateSql} = 'expired') AS assignment_is_expired`;

/* ── Hilfsfunktionen ────────────────────────────────────────────────────────── */

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateInviteToken() {
  return crypto.randomBytes(48).toString("hex");
}

export const PUBLIC_PROFILE_FIELDS = Object.freeze([
  "name",
  "city",
  "skill_tags",
  "qualifications",
  "profile_text",
  "availability_note"
]);

export const WORKER_DOCUMENT_CATEGORIES = Object.freeze([
  "qualification",
  "identity",
  "permit",
  "medical",
  "training",
  "other"
]);

export const WORKER_DOCUMENT_STATUSES = Object.freeze([
  "pending_review",
  "verified",
  "rejected",
  "archived",
  "expired"
]);

export const WORKER_DOCUMENT_EXPIRY_WARNING_DAYS = 30;

function toListArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  if (typeof value === "string") {
    return value
      .split(/[\n,;|]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [value];
}

function parseJsonValue(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}
function normalizeIsoDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
  }
  const text = String(value).trim();
  if (!text) return null;
  const directMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directMatch) return directMatch[1];
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

export function getWorkerDocumentDaysUntilExpiry(document, referenceDate = todayIsoDate()) {
  const validUntil = normalizeIsoDateValue(document?.valid_until);
  const refDate = normalizeIsoDateValue(referenceDate);
  if (!validUntil || !refDate) return null;
  const expiry = Date.parse(validUntil + "T00:00:00Z");
  const ref = Date.parse(refDate + "T00:00:00Z");
  if (!Number.isFinite(expiry) || !Number.isFinite(ref)) return null;
  return Math.floor((expiry - ref) / 86400000);
}

export function isWorkerDocumentExpiringSoon(document, warningDays = WORKER_DOCUMENT_EXPIRY_WARNING_DAYS) {
  const effectiveStatus = document?.effective_status || getWorkerDocumentEffectiveStatus(document);
  const daysUntilExpiry = getWorkerDocumentDaysUntilExpiry(document);
  return effectiveStatus === "verified"
    && daysUntilExpiry !== null
    && daysUntilExpiry >= 0
    && daysUntilExpiry <= warningDays;
}

function workerDocumentRequiresAction(document) {
  const effectiveStatus = document?.effective_status || getWorkerDocumentEffectiveStatus(document);
  return effectiveStatus === "expired"
    || effectiveStatus === "rejected"
    || isWorkerDocumentExpiringSoon(document);
}

export function sanitizeSkillTags(value) {
  const seen = new Set();
  const result = [];
  for (const raw of toListArray(value)) {
    const skill = String(raw || "").trim().replace(/\s+/g, " ");
    const key = skill.toLowerCase();
    if (!skill || skill.length > 80 || seen.has(key)) continue;
    seen.add(key);
    result.push(skill);
    if (result.length >= 50) break;
  }
  return result;
}

export function normalizeQualificationList(value) {
  const items = toListArray(parseJsonValue(value, []));
  const normalized = [];
  for (const item of items) {
    if (typeof item === "string") {
      const name = item.trim();
      if (!name) continue;
      normalized.push({
        name: name.slice(0, 200),
        issuer: null,
        expires_at: null,
        document_label: null,
        document_url: null,
        note: null
      });
    } else if (item && typeof item === "object") {
      const name = String(item.name || item.label || "").trim();
      if (!name) continue;
      const expiresAt = item.expires_at || item.expiry || item.expiry_date || null;
      normalized.push({
        name: name.slice(0, 200),
        issuer: item.issuer ? String(item.issuer).trim().slice(0, 200) : null,
        expires_at: expiresAt ? String(expiresAt).slice(0, 10) : null,
        document_label: item.document_label ? String(item.document_label).trim().slice(0, 200) : null,
        document_url: item.document_url ? String(item.document_url).trim().slice(0, 2000) : null,
        note: item.note ? String(item.note).trim().slice(0, 1000) : null
      });
    }
    if (normalized.length >= 50) break;
  }
  return normalized;
}

function sanitizePublicProfileFields(value) {
  const allowed = new Set(PUBLIC_PROFILE_FIELDS);
  const seen = new Set();
  const fields = [];
  for (const raw of toListArray(value)) {
    const field = String(raw || "").trim();
    if (!allowed.has(field) || seen.has(field)) continue;
    seen.add(field);
    fields.push(field);
  }
  return fields;
}

function normalizeWorkerProfileRecord(profile) {
  if (!profile) return null;
  return {
    ...profile,
    skill_tags: sanitizeSkillTags(profile.skill_tags),
    qualifications: normalizeQualificationList(profile.qualifications),
    public_profile_fields: sanitizePublicProfileFields(profile.public_profile_fields),
    profile_public: !!profile.profile_public,
    availability_note: profile.availability_note || null
  };
}

function calculateProfileCompleteness(profile) {
  const checks = [
    !!profile?.first_name,
    !!profile?.last_name,
    !!profile?.email,
    !!profile?.phone,
    !!profile?.city,
    Array.isArray(profile?.skill_tags) && profile.skill_tags.length > 0,
    Array.isArray(profile?.qualifications) && profile.qualifications.length > 0,
    !!profile?.profile_text
  ];
  const completed = checks.filter(Boolean).length;
  return Math.round((completed / checks.length) * 100);
}

export function buildWorkerPublicProfile(profile, { force = false } = {}) {
  const normalized = normalizeWorkerProfileRecord(profile);
  if (!normalized) return null;
  if (!force && !normalized.profile_public) return null;

  const fieldSet = new Set(normalized.public_profile_fields || []);
  const publicProfile = {
    slug: normalized.public_profile_slug,
    public_fields: Array.from(fieldSet),
    updated_at: normalized.updated_at || null
  };

  if (fieldSet.has("name")) {
    publicProfile.name = `${normalized.first_name || ""} ${normalized.last_name || ""}`.trim() || null;
  }
  if (fieldSet.has("city")) {
    publicProfile.city = normalized.city || null;
  }
  if (fieldSet.has("skill_tags")) {
    publicProfile.skill_tags = normalized.skill_tags || [];
  }
  if (fieldSet.has("qualifications")) {
    publicProfile.qualifications = (normalized.qualifications || []).map((qualification) => ({
      name: qualification.name,
      issuer: qualification.issuer || null,
      expires_at: qualification.expires_at || null,
      document_label: qualification.document_label || null
    }));
  }
  if (fieldSet.has("profile_text")) {
    publicProfile.profile_text = normalized.profile_text || null;
  }
  if (fieldSet.has("availability_note")) {
    publicProfile.availability_note = normalized.availability_note || null;
  }
  return publicProfile;
}

export function getWorkerDocumentEffectiveStatus(document) {
  const validUntil = normalizeIsoDateValue(document?.valid_until);
  if (!document) return "pending_review";
  if (document.status === "verified" && validUntil && validUntil < todayIsoDate()) {
    return "expired";
  }
  return document.status || "pending_review";
}

function getWorkerDocumentTrafficLight(document) {
  const effectiveStatus = document.effective_status || getWorkerDocumentEffectiveStatus(document);
  if (effectiveStatus === "expired" || effectiveStatus === "rejected") return "red";
  if (effectiveStatus === "archived") return "grey";
  if (effectiveStatus === "pending_review") return "yellow";
  if (isWorkerDocumentExpiringSoon(document)) return "yellow";
  return "green";
}

function normalizeWorkerDocumentRecord(document) {
  if (!document) return null;
  const validFrom = normalizeIsoDateValue(document.valid_from);
  const validUntil = normalizeIsoDateValue(document.valid_until);
  const effectiveStatus = getWorkerDocumentEffectiveStatus(document);
  const daysUntilExpiry = getWorkerDocumentDaysUntilExpiry(document);
  const expiringSoon = isWorkerDocumentExpiringSoon({ ...document, effective_status: effectiveStatus });
  const requiresAction = workerDocumentRequiresAction({ ...document, effective_status: effectiveStatus });
  return {
    ...document,
    category: document.category || "other",
    qualification_name: document.qualification_name || null,
    issuer: document.issuer || null,
    file_ref: document.file_ref || null,
    original_name: document.original_name || null,
    mime_type: document.mime_type || null,
    notes: document.notes || null,
    review_note: document.review_note || null,
    valid_from: validFrom,
    valid_until: validUntil,
    expiry_reminder_sent_at: document.expiry_reminder_sent_at || null,
    expiry_notice_sent_at: document.expiry_notice_sent_at || null,
    effective_status: effectiveStatus,
    days_until_expiry: daysUntilExpiry,
    is_expiring_soon: expiringSoon,
    requires_action: requiresAction,
    expiry_state: !validUntil
      ? "open_ended"
      : effectiveStatus === "expired"
        ? "expired"
        : expiringSoon
          ? "expiring_soon"
          : "valid",
    traffic_light: getWorkerDocumentTrafficLight({ ...document, effective_status: effectiveStatus }),
    has_file: !!document.file_ref,
    download_path: document.id && document.worker_user_id
      ? `/api/workers/${document.worker_user_id}/documents/${document.id}/download`
      : null
  };
}

export function summarizeWorkerDocuments(documents = []) {
  const normalized = documents.map((document) => normalizeWorkerDocumentRecord(document));
  const summary = {
    total: normalized.length,
    pending_review: 0,
    verified: 0,
    rejected: 0,
    archived: 0,
    expired: 0,
    expiring_soon: 0,
    expiring_within_7_days: 0,
    action_required: 0,
    with_files: 0,
    linked_qualifications: 0,
    next_expiry: null
  };

  for (const document of normalized) {
    const status = document.effective_status || "pending_review";
    summary[status] = (summary[status] || 0) + 1;
    if (document.file_ref) summary.with_files += 1;
    if (document.qualification_name) summary.linked_qualifications += 1;
    if (document.is_expiring_soon) {
      summary.expiring_soon += 1;
      if (document.days_until_expiry !== null && document.days_until_expiry <= 7) {
        summary.expiring_within_7_days += 1;
      }
    }
    if (document.requires_action) summary.action_required += 1;
    if (status === "verified" && document.valid_until) {
      const validUntil = String(document.valid_until).slice(0, 10);
      if (!summary.next_expiry || validUntil < summary.next_expiry) {
        summary.next_expiry = validUntil;
      }
    }
  }
  return summary;
}

async function queryWorkerDocuments(pool, { workerUserId, supplierOrgId, limit = 25, includeArchived = true }) {
  const params = [workerUserId, supplierOrgId];
  let where = "wpd.worker_user_id = $1 AND wpd.supplier_org_id = $2";
  if (!includeArchived) {
    where += " AND wpd.status <> 'archived'";
  }
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT wpd.*, u_up.email AS uploaded_by_email, u_ver.email AS verified_by_email
     FROM worker_profile_documents wpd
     LEFT JOIN users u_up ON u_up.id = wpd.uploaded_by
     LEFT JOIN users u_ver ON u_ver.id = wpd.verified_by
     WHERE ${where}
     ORDER BY
       CASE
         WHEN wpd.status = 'verified' AND wpd.valid_until IS NOT NULL THEN wpd.valid_until
         ELSE NULL
       END ASC NULLS LAST,
       wpd.created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return rows.map((row) => normalizeWorkerDocumentRecord(row));
}

/* ── Worker-Profil abrufen ──────────────────────────────────────────────────── */

export async function getWorkerProfile(pool, userId) {
  const { rows } = await pool.query(
    `SELECT wp.*, u.email, u.is_verified, u.created_at AS account_created_at,
            om.is_active AS org_membership_active
     FROM worker_profiles wp
     JOIN users u ON u.id = wp.user_id
     LEFT JOIN org_memberships om
       ON om.user_id = wp.user_id
      AND om.org_id = wp.supplier_org_id
      AND om.role_key = 'worker'
     WHERE wp.user_id = $1`,
    [userId]
  );
  return normalizeWorkerProfileRecord(rows[0] || null);
}

export async function getWorkerByUserId(pool, userId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.role, u.is_verified,
            wp.first_name, wp.last_name, wp.personnel_number,
            wp.supplier_org_id, wp.phone, wp.is_active,
            wp.preferred_locale, wp.notes, wp.skill_tags,
            wp.qualifications, wp.profile_text, wp.profile_public,
            wp.public_profile_fields, wp.public_profile_slug,
            wp.availability_note
     FROM users u
     LEFT JOIN worker_profiles wp ON wp.user_id = u.id
     WHERE u.id = $1 AND u.role = 'worker'`,
    [userId]
  );
  return normalizeWorkerProfileRecord(rows[0] || null);
}

/* ── Worker-Liste für Zeitarbeitsfirma ──────────────────────────────────────── */

export async function listWorkers(pool, { supplierOrgId, isActive = null, search = null, limit = 100, offset = 0 }) {
  const params = [supplierOrgId];
  let where = "wp.supplier_org_id = $1";
  if (isActive !== null) {
    params.push(isActive);
    where += ` AND wp.is_active = $${params.length}`;
  }
  if (search) {
    params.push(`%${search}%`);
    const n = params.length;
    where += ` AND (wp.first_name ILIKE $${n} OR wp.last_name ILIKE $${n} OR u.email ILIKE $${n} OR wp.personnel_number ILIKE $${n})`;
  }
  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT wp.id AS profile_id, u.id AS id, u.id AS user_id, u.email, u.is_verified,
            wp.first_name, wp.last_name, wp.personnel_number,
            wp.phone, wp.is_active, wp.preferred_locale,
            wp.created_at, wp.profile_public, wp.public_profile_slug,
            wp.availability_note,
            COALESCE(array_length(wp.skill_tags, 1), 0) AS skill_count,
            COALESCE(jsonb_array_length(COALESCE(wp.qualifications, '[]'::jsonb)), 0) AS qualification_count,
            (SELECT COUNT(*) FROM worker_profile_documents wpd
             WHERE wpd.worker_user_id = u.id
               AND wpd.supplier_org_id = wp.supplier_org_id) AS document_count,
            (SELECT COUNT(*) FROM worker_profile_documents wpd
             WHERE wpd.worker_user_id = u.id
               AND wpd.supplier_org_id = wp.supplier_org_id
               AND wpd.status = 'verified'
               AND wpd.valid_until IS NOT NULL
               AND wpd.valid_until < CURRENT_DATE) AS expired_document_count,
            (SELECT COUNT(*) FROM worker_profile_documents wpd
             WHERE wpd.worker_user_id = u.id
               AND wpd.supplier_org_id = wp.supplier_org_id
               AND wpd.status = 'verified'
               AND wpd.valid_until IS NOT NULL
               AND wpd.valid_until >= CURRENT_DATE
               AND wpd.valid_until <= CURRENT_DATE + ${WORKER_DOCUMENT_EXPIRY_WARNING_DAYS}) AS expiring_soon_document_count,
            (SELECT MIN(wpd.valid_until)
             FROM worker_profile_documents wpd
             WHERE wpd.worker_user_id = u.id
               AND wpd.supplier_org_id = wp.supplier_org_id
               AND wpd.status = 'verified'
               AND wpd.valid_until IS NOT NULL
               AND wpd.valid_until >= CURRENT_DATE) AS next_document_expiry,
            (SELECT COUNT(*) FROM worker_assignment_links wal
             JOIN assignments a ON a.id = wal.assignment_id
             WHERE wal.worker_user_id = u.id
               AND wal.is_active = TRUE
               AND ${workerAssignmentIsCurrentSql}) AS active_assignments,
            (SELECT COUNT(*) FROM worker_time_submissions wts
             WHERE wts.worker_user_id = u.id
               AND wts.status NOT IN ('rejected','superseded')) AS total_submissions
     FROM worker_profiles wp
     JOIN users u ON u.id = wp.user_id
     WHERE ${where}
     ORDER BY wp.last_name ASC, wp.first_name ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows.map((row) => normalizeWorkerProfileRecord(row));
}

/**
 * Nicht-registrierte, kollisionsfreie Einladungskandidaten einer Org: aktive Worker,
 * deren Account noch nicht verifiziert ist (nie registriert) UND für die keine offene
 * Einladung existiert. Basis für "Alle einladen" ohne Kollision mit bereits Registrierten.
 */
export async function listInvitableWorkers(pool, supplierOrgId) {
  const { rows } = await pool.query(
    `SELECT u.email, wp.first_name, wp.last_name, wp.personnel_number
       FROM worker_profiles wp
       JOIN users u ON u.id = wp.user_id
      WHERE wp.supplier_org_id = $1
        AND wp.is_active = TRUE
        AND u.is_verified = FALSE
        AND NOT EXISTS (
          SELECT 1 FROM worker_invites wi
           WHERE wi.supplier_org_id = wp.supplier_org_id
             AND LOWER(wi.email) = LOWER(u.email)
             AND wi.status = 'pending' AND wi.expires_at > NOW())
      ORDER BY wp.last_name, wp.first_name`,
    [supplierOrgId]
  );
  return rows;
}

/* ── Worker direkt anlegen (ohne Invite) ────────────────────────────────────── */

export async function createWorkerAccount(pool, {
  supplierOrgId, email, firstName, lastName, personnelNumber,
  phone, street, postalCode, city, country = "DE",
  passwordHash, createdBy
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // User anlegen
    const { rows: [user] } = await client.query(
      `INSERT INTO users (role, email, password_hash, is_verified)
       VALUES ('worker', $1, $2, TRUE)
       RETURNING id`,
      [email.toLowerCase().trim(), passwordHash]
    );


    // Org-Membership als worker-Rolle
    await client.query(
      `INSERT INTO org_memberships (user_id, org_id, role_key, is_active)
       VALUES ($1, $2, 'worker', TRUE)
       ON CONFLICT (user_id, org_id) DO UPDATE SET role_key = 'worker', is_active = TRUE`,
      [user.id, supplierOrgId]
    );

    // Worker-Profil anlegen
    const { rows: [profile] } = await client.query(
      `INSERT INTO worker_profiles
         (user_id, supplier_org_id, first_name, last_name, personnel_number,
          phone, street, postal_code, city, country, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [user.id, supplierOrgId, firstName, lastName, personnelNumber || null,
       phone || null, street || null, postalCode || null, city || null,
       country, createdBy || null]
    );

    await client.query("COMMIT");
    return { user, profile: normalizeWorkerProfileRecord(profile) };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/* ── Einladung erstellen + versenden ────────────────────────────────────────── */

export async function createWorkerInvite(pool, {
  supplierOrgId, invitedBy, email, firstName, lastName, personnelNumber
}) {
  // Prüfe: existiert bereits ein aktiver Worker mit dieser E-Mail in der Org?
  const { rows: existing } = await pool.query(
    `SELECT wi.id FROM worker_invites wi
     WHERE wi.supplier_org_id = $1 AND LOWER(wi.email) = LOWER($2)
       AND wi.status = 'pending' AND wi.expires_at > NOW()`,
    [supplierOrgId, email]
  );
  if (existing.length > 0) {
    return { error: "INVITE_ALREADY_PENDING", inviteId: existing[0].id };
  }

  const token = generateInviteToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 Tage

  const { rows: [invite] } = await pool.query(
    `INSERT INTO worker_invites
       (supplier_org_id, invited_by, email, first_name, last_name,
        personnel_number, token, token_hash, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, email, first_name, last_name, expires_at, status`,
    [supplierOrgId, invitedBy, email.toLowerCase().trim(),
     firstName, lastName, personnelNumber || null,
     token, tokenHash, expiresAt]
  );

  return { invite, token }; // token wird per Mail versendet, NICHT gespeichert
}

export async function getInviteByToken(pool, token) {
  const tokenHash = hashToken(token);
  const { rows } = await pool.query(
    `SELECT wi.*, o.name AS supplier_org_name
     FROM worker_invites wi
     JOIN organizations o ON o.id = wi.supplier_org_id
     WHERE wi.token_hash = $1`,
    [tokenHash]
  );
  return rows[0] || null;
}

export async function acceptInvite(pool, { token, passwordHash }) {
  const invite = await getInviteByToken(pool, token);
  if (!invite) return { error: "INVITE_NOT_FOUND" };
  if (invite.status === "accepted") return { error: "INVITE_ALREADY_USED" };
  if (invite.status === "revoked") return { error: "INVITE_REVOKED" };
  if (new Date(invite.expires_at) < new Date()) {
    await pool.query("UPDATE worker_invites SET status='expired' WHERE id=$1", [invite.id]);
    return { error: "INVITE_EXPIRED" };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // User anlegen
    const { rows: [user] } = await client.query(
      `INSERT INTO users (role, email, password_hash, is_verified)
       VALUES ('worker', $1, $2, TRUE)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash, is_verified = TRUE
       RETURNING id, email, role`,
      [invite.email, passwordHash]
    );

    // Org-Membership
    await client.query(
      `INSERT INTO org_memberships (user_id, org_id, role_key, is_active)
       VALUES ($1, $2, 'worker', TRUE)
       ON CONFLICT (user_id, org_id) DO UPDATE SET role_key = 'worker', is_active = TRUE`,
      [user.id, invite.supplier_org_id]
    );

    // Worker-Profil anlegen
    const { rows: [profile] } = await client.query(
      `INSERT INTO worker_profiles
         (user_id, supplier_org_id, first_name, last_name, personnel_number, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id) DO UPDATE
         SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
             personnel_number = EXCLUDED.personnel_number, updated_at = NOW()
       RETURNING *`,
      [user.id, invite.supplier_org_id, invite.first_name, invite.last_name,
       invite.personnel_number || null, invite.invited_by]
    );

    // Invite abschließen
    await client.query(
      `UPDATE worker_invites
       SET status='accepted', accepted_at=NOW(), worker_user_id=$1
       WHERE id=$2`,
      [user.id, invite.id]
    );

    await client.query("COMMIT");
    return { user, profile: normalizeWorkerProfileRecord(profile), invite };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function revokeInvite(pool, inviteId, supplierOrgId) {
  const { rowCount } = await pool.query(
    `UPDATE worker_invites SET status='revoked'
     WHERE id=$1 AND supplier_org_id=$2 AND status='pending'`,
    [inviteId, supplierOrgId]
  );
  return rowCount > 0;
}

export async function resendInvite(pool, inviteId, supplierOrgId) {
  // Token erneuern + Ablauf verlängern
  const token = generateInviteToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const { rows } = await pool.query(
    `UPDATE worker_invites
     SET token=$1, token_hash=$2, expires_at=$3,
         last_sent_at=NOW(), resend_count=resend_count+1
     WHERE id=$4 AND supplier_org_id=$5 AND status='pending'
     RETURNING id, email, first_name, last_name, expires_at`,
    [token, tokenHash, expiresAt, inviteId, supplierOrgId]
  );
  if (!rows[0]) return null;
  return { invite: rows[0], token };
}

export async function listInvites(pool, optsOrSupplierOrgId, legacyStatus = null) {
  const options = typeof optsOrSupplierOrgId === "string"
    ? { supplierOrgId: optsOrSupplierOrgId, status: legacyStatus }
    : (optsOrSupplierOrgId || {});
  const { supplierOrgId, status = null } = options;
  const params = [supplierOrgId];
  let where = "wi.supplier_org_id = $1";
  if (status) {
    params.push(status);
    where += ` AND wi.status = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT wi.id, wi.email, wi.first_name, wi.last_name, wi.personnel_number,
            wi.status, wi.expires_at, wi.accepted_at, wi.last_sent_at, wi.resend_count,
            u.id AS invited_by_id, u.email AS invited_by_email
     FROM worker_invites wi
     LEFT JOIN users u ON u.id = wi.invited_by
     WHERE ${where}
     ORDER BY wi.created_at DESC`,
    params
  );
  return rows;
}

async function getWorkerAssignmentActionContext(pool, linkId, workerUserId) {
  const { rows } = await pool.query(
    `SELECT wal.id, wal.assignment_id, wal.worker_confirmation_status, wal.is_active,
            ${workerAssignmentLifecycleSelectSql}
     FROM worker_assignment_links wal
     JOIN assignments a ON a.id = wal.assignment_id
     WHERE wal.id = $1
       AND wal.worker_user_id = $2`,
    [linkId, workerUserId]
  );
  return rows[0] || null;
}

/* ── Worker deaktivieren / reaktivieren ─────────────────────────────────────── */

export async function setWorkerActive(pool, workerUserId, supplierOrgId, isActive) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE worker_profiles SET is_active=$1, updated_at=NOW()
       WHERE user_id=$2 AND supplier_org_id=$3`,
      [isActive, workerUserId, supplierOrgId]
    );
    if (!isActive) {
      await client.query(
        `UPDATE worker_assignment_links SET is_active=FALSE, updated_at=NOW()
         WHERE worker_user_id=$1 AND supplier_org_id=$2`,
        [workerUserId, supplierOrgId]
      );
    }
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/* ── Worker-Profil aktualisieren ────────────────────────────────────────────── */

export async function updateWorkerProfile(pool, workerUserId, supplierOrgId, data) {
  const normalized = {
    ...data,
    skill_tags: data.skill_tags !== undefined ? sanitizeSkillTags(data.skill_tags) : undefined,
    qualifications: data.qualifications !== undefined ? JSON.stringify(normalizeQualificationList(data.qualifications)) : undefined,
    public_profile_fields: data.public_profile_fields !== undefined
      ? sanitizePublicProfileFields(data.public_profile_fields)
      : undefined
  };
  const fields = [];
  const params = [];
  const allowed = ["first_name","last_name","personnel_number","phone",
                   "street","postal_code","city","country","notes","preferred_locale",
                   "date_of_birth","skill_tags","qualifications","profile_text",
                   "profile_public","public_profile_fields","availability_note"];
  for (const key of allowed) {
    if (normalized[key] !== undefined) {
      params.push(normalized[key]);
      fields.push(`${key} = $${params.length}`);
    }
  }
  if (!fields.length) return null;
  params.push(workerUserId, supplierOrgId);
  const { rows } = await pool.query(
    `UPDATE worker_profiles SET ${fields.join(", ")}, updated_at=NOW()
     WHERE user_id=$${params.length - 1} AND supplier_org_id=$${params.length}
     RETURNING *`,
    params
  );
  return normalizeWorkerProfileRecord(rows[0] || null);
}

/* ── Worker-Skills (Katalog-gebunden, Welle 1: Multi-Skill-Fundament) ────────── */

export async function getWorkerSkills(pool, workerProfileId) {
  const { rows } = await pool.query(
    `SELECT wps.id, wps.skill_id, ps.name, ps.category,
            wps.proficiency, wps.years_experience, wps.is_primary,
            wps.certified, wps.certificate_ref, wps.source
       FROM worker_profile_skills wps
       JOIN platform_skills ps ON ps.id = wps.skill_id
      WHERE wps.worker_profile_id = $1
      ORDER BY wps.is_primary DESC, ps.category NULLS LAST, ps.name`,
    [workerProfileId]
  );
  return rows.map((r) => ({
    id: r.id,
    skill_id: r.skill_id,
    name: r.name,
    category: r.category,
    proficiency: r.proficiency,
    years_experience: r.years_experience !== null && r.years_experience !== undefined
      ? Number(r.years_experience) : null,
    is_primary: r.is_primary === true,
    certified: r.certified === true,
    certificate_ref: r.certificate_ref,
    source: r.source
  }));
}

/**
 * Ersetzt die Skill-Zuordnung eines Arbeiters vollständig (replace-all) und hält
 * den denormalisierten worker_profiles.skill_tags[]-Spiegel synchron, damit die
 * bestehende GIN-Suche (cp.skill_tags && ...) unverändert weiterläuft.
 * Org-gebunden: der Spiegel-UPDATE greift nur, wenn worker_profile_id UND
 * supplier_org_id zusammenpassen (Datenisolation, Enterprise-Pfeiler #1).
 * Nur aktive Katalog-Skills werden akzeptiert; unbekannte IDs werden verworfen.
 */
export async function setWorkerSkills(pool, { workerProfileId, supplierOrgId, skills = [], source = "worker" }) {
  return withTransaction(pool, async (client) => {
    const requested = Array.isArray(skills) ? skills.filter((s) => s && s.skill_id) : [];
    const ids = [...new Set(requested.map((s) => s.skill_id))];

    let validRows = [];
    if (ids.length) {
      const res = await client.query(
        `SELECT id, name FROM platform_skills WHERE id = ANY($1::uuid[]) AND is_active = TRUE`,
        [ids]
      );
      validRows = res.rows;
    }
    const nameById = new Map(validRows.map((r) => [r.id, r.name]));

    // De-dupe auf skill_id (letzte Angabe gewinnt), nur gültige Katalog-IDs.
    const bySkill = new Map();
    for (const s of requested) {
      if (!nameById.has(s.skill_id)) continue;
      bySkill.set(s.skill_id, s);
    }
    const clean = [...bySkill.values()];

    // Replace-all: leeren, dann neu setzen.
    await client.query(`DELETE FROM worker_profile_skills WHERE worker_profile_id = $1`, [workerProfileId]);
    for (const s of clean) {
      await client.query(
        `INSERT INTO worker_profile_skills
           (worker_profile_id, skill_id, proficiency, years_experience, is_primary, certified, certificate_ref, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          workerProfileId,
          s.skill_id,
          s.proficiency || "intermediate",
          s.years_experience != null ? s.years_experience : null,
          s.is_primary === true,
          s.certified === true,
          s.certificate_ref || null,
          source
        ]
      );
    }

    // Denormalisierter Spiegel: skill_tags = Namen der zugewiesenen Skills.
    const tagNames = clean.map((s) => nameById.get(s.skill_id)).filter(Boolean);
    await client.query(
      `UPDATE worker_profiles
          SET skill_tags = $1::text[], updated_at = NOW()
        WHERE id = $2 AND supplier_org_id = $3`,
      [tagNames, workerProfileId, supplierOrgId]
    );

    return { count: clean.length, skill_ids: clean.map((s) => s.skill_id) };
  });
}

export async function getWorkerHub(pool, userId) {
  const profile = await getWorkerProfile(pool, userId);
  if (!profile) return null;
  const [assignmentResult, recentSubmissions, supplierOrgResult, recentDocuments] = await Promise.all([
    pool.query(
      `SELECT wal.id AS link_id, wal.assignment_id, wal.is_active,
              wal.worker_confirmation_status, wal.start_date, wal.end_date,
              wal.client_name, wal.location_address, wal.unavailable_from,
              wal.capacity_post_id, wal.deal_request_id,
              a.status AS assignment_status, a.worker_description,
              COALESCE(wal.client_name, o.name) AS client_display_name,
              ${workerAssignmentLifecycleSelectSql}
       FROM worker_assignment_links wal
       JOIN assignments a ON a.id = wal.assignment_id
       LEFT JOIN organizations o ON o.id = wal.org_id
       WHERE wal.worker_user_id = $1
       ORDER BY wal.start_date DESC, wal.created_at DESC
       LIMIT 6`,
      [userId]
    ),
    submissionSvc.listSubmissions(pool, { workerUserId: userId, limit: 6 }),
    pool.query(
      `SELECT o.name AS supplier_org_name
       FROM organizations o
       WHERE o.id = $1`,
      [profile.supplier_org_id]
    ),
    queryWorkerDocuments(pool, {
      workerUserId: userId,
      supplierOrgId: profile.supplier_org_id,
      limit: 25,
      includeArchived: true
    })
  ]);

  const recentAssignments = assignmentResult.rows || [];
  const submissionStatusCounts = (recentSubmissions || []).reduce((acc, item) => {
    const key = item.status || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const documentSummary = summarizeWorkerDocuments(recentDocuments);

  return {
    ...profile,
    supplier_org_name: supplierOrgResult.rows[0]?.supplier_org_name || null,
    profile_completion_percent: calculateProfileCompleteness(profile),
    linkage: {
      email: profile.email || null,
      is_verified: !!profile.is_verified,
      account_created_at: profile.account_created_at || null,
      org_membership_active: profile.org_membership_active !== false,
      worker_portal_path: "/public/einsatzportal-profil.html"
    },
    operational_context: {
      active_assignment_count: recentAssignments.filter((item) => item.assignment_is_current).length,
      pending_confirmation_count: recentAssignments.filter(
        (item) => item.assignment_is_current && item.worker_confirmation_status === "pending_confirmation"
      ).length,
      recent_assignments: recentAssignments,
      recent_submissions: recentSubmissions,
      submission_status_counts: submissionStatusCounts
    },
    document_hub: {
      summary: documentSummary,
      recent_documents: recentDocuments
    },
    public_profile_preview: buildWorkerPublicProfile(profile, { force: true })
  };
}

export async function getWorkerPublicProfileBySlug(pool, slug) {
  const { rows } = await pool.query(
    `SELECT wp.*
     FROM worker_profiles wp
     WHERE wp.public_profile_slug = $1
       AND wp.profile_public = TRUE`,
    [slug]
  );
  return buildWorkerPublicProfile(rows[0] || null);
}

export async function listWorkerDocuments(pool, { workerUserId, supplierOrgId, limit = 25, includeArchived = true } = {}) {
  const items = await queryWorkerDocuments(pool, { workerUserId, supplierOrgId, limit, includeArchived });
  return {
    items,
    summary: summarizeWorkerDocuments(items)
  };
}

export async function getWorkerDocumentById(pool, documentId) {
  const { rows } = await pool.query(
    `SELECT wpd.*, u_up.email AS uploaded_by_email, u_ver.email AS verified_by_email
     FROM worker_profile_documents wpd
     LEFT JOIN users u_up ON u_up.id = wpd.uploaded_by
     LEFT JOIN users u_ver ON u_ver.id = wpd.verified_by
     WHERE wpd.id = $1`,
    [documentId]
  );
  return normalizeWorkerDocumentRecord(rows[0] || null);
}

export async function markWorkerDocumentExpiryReminderSent(pool, documentId) {
  await pool.query(
    `UPDATE worker_profile_documents
     SET expiry_reminder_sent_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [documentId]
  );
}

export async function markWorkerDocumentExpiryNoticeSent(pool, documentId) {
  await pool.query(
    `UPDATE worker_profile_documents
     SET expiry_notice_sent_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [documentId]
  );
}

export async function scanWorkerDocumentDeadlines(
  pool,
  {
    daysAhead = WORKER_DOCUMENT_EXPIRY_WARNING_DAYS,
    limit = 100,
    onExpiring = null,
    onExpired = null
  } = {}
) {
  const { rows } = await pool.query(
    `SELECT wpd.*
     FROM worker_profile_documents wpd
     WHERE wpd.status = 'verified'
       AND wpd.valid_until IS NOT NULL
       AND (
         (wpd.valid_until < CURRENT_DATE AND wpd.expiry_notice_sent_at IS NULL)
         OR
         (wpd.valid_until >= CURRENT_DATE
           AND wpd.valid_until <= CURRENT_DATE + $1::int
           AND wpd.expiry_reminder_sent_at IS NULL)
       )
     ORDER BY
       CASE WHEN wpd.valid_until < CURRENT_DATE THEN 0 ELSE 1 END ASC,
       wpd.valid_until ASC,
       wpd.created_at ASC
     LIMIT $2`,
    [daysAhead, limit]
  );

  let expiring = 0;
  let expired = 0;
  let notified = 0;
  let failed = 0;

  for (const row of rows) {
    const document = normalizeWorkerDocumentRecord(row);
    const isExpired = document?.effective_status === "expired";
    try {
      if (isExpired) {
        if (onExpired) await onExpired(document);
        await markWorkerDocumentExpiryNoticeSent(pool, document.id);
        expired += 1;
      } else {
        if (onExpiring) await onExpiring(document);
        await markWorkerDocumentExpiryReminderSent(pool, document.id);
        expiring += 1;
      }
      notified += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    scanned: rows.length,
    expiring,
    expired,
    notified,
    failed
  };
}

export async function createWorkerDocument(pool, {
  workerUserId,
  supplierOrgId,
  category,
  title,
  qualificationName,
  issuer,
  fileRef,
  originalName,
  mimeType,
  fileSizeBytes,
  validFrom,
  validUntil,
  notes,
  uploadedBy
}) {
  const { rows } = await pool.query(
    `INSERT INTO worker_profile_documents
       (worker_user_id, supplier_org_id, category, title, qualification_name, issuer,
        file_ref, original_name, mime_type, file_size_bytes, valid_from, valid_until,
        notes, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id`,
    [
      workerUserId,
      supplierOrgId,
      category,
      title,
      qualificationName || null,
      issuer || null,
      fileRef || null,
      originalName || null,
      mimeType || null,
      fileSizeBytes || null,
      validFrom || null,
      validUntil || null,
      notes || null,
      uploadedBy || null
    ]
  );
  return getWorkerDocumentById(pool, rows[0]?.id);
}

export async function updateWorkerDocument(pool, documentId, workerUserId, supplierOrgId, data) {
  const allowed = [
    "category",
    "title",
    "qualification_name",
    "issuer",
    "valid_from",
    "valid_until",
    "notes",
    "review_note"
  ];
  const fields = [];
  const params = [];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      params.push(data[key]);
      fields.push(`${key} = $${params.length}`);
    }
  }
  if (!fields.length) return null;
  params.push(documentId, workerUserId, supplierOrgId);
  const { rows } = await pool.query(
    `UPDATE worker_profile_documents
     SET ${fields.join(", ")}, updated_at = NOW()
     WHERE id = $${params.length - 2}
       AND worker_user_id = $${params.length - 1}
       AND supplier_org_id = $${params.length}
     RETURNING id`,
    params
  );
  if (!rows[0]) return null;
  return getWorkerDocumentById(pool, rows[0].id);
}

export async function verifyWorkerDocument(pool, documentId, workerUserId, supplierOrgId, { verifiedBy, note = null } = {}) {
  const { rows } = await pool.query(
    `UPDATE worker_profile_documents
     SET status = 'verified',
         verified_by = $4,
         verified_at = NOW(),
         review_note = $5,
         updated_at = NOW()
     WHERE id = $1
       AND worker_user_id = $2
       AND supplier_org_id = $3
       AND status <> 'archived'
     RETURNING id`,
    [documentId, workerUserId, supplierOrgId, verifiedBy || null, note]
  );
  if (!rows[0]) return null;
  return getWorkerDocumentById(pool, rows[0].id);
}

export async function rejectWorkerDocument(pool, documentId, workerUserId, supplierOrgId, { verifiedBy, note = null } = {}) {
  const { rows } = await pool.query(
    `UPDATE worker_profile_documents
     SET status = 'rejected',
         verified_by = $4,
         verified_at = NOW(),
         review_note = $5,
         updated_at = NOW()
     WHERE id = $1
       AND worker_user_id = $2
       AND supplier_org_id = $3
       AND status <> 'archived'
     RETURNING id`,
    [documentId, workerUserId, supplierOrgId, verifiedBy || null, note]
  );
  if (!rows[0]) return null;
  return getWorkerDocumentById(pool, rows[0].id);
}

export async function deleteWorkerDocument(pool, documentId, workerUserId, supplierOrgId) {
  const { rows } = await pool.query(
    `DELETE FROM worker_profile_documents
     WHERE id = $1
       AND worker_user_id = $2
       AND supplier_org_id = $3
     RETURNING *`,
    [documentId, workerUserId, supplierOrgId]
  );
  return normalizeWorkerDocumentRecord(rows[0] || null);
}

/* ── Assignment-Links ───────────────────────────────────────────────────────── */

/**
 * Zentrale Überlappungs-/Kollisionsprüfung (P1.4-Fundament, EINZIGE Wahrheit für alle
 * Zuweisungs-Pfade): findet aktive Einsatz-Links des Arbeiters, deren Datumsfenster
 * [start_date, end_date|∞] sich mit dem angefragten Zeitraum [start,end] überschneidet.
 * worker_declined/worker_unavailable zählen NICHT als Konflikt (freigestellt/abgelehnt).
 * `excludeAssignmentId` schließt den Ziel-Auftrag aus (kein Selbst-Konflikt bei Re-Assign).
 * `db` kann pool ODER ein Transaktions-Client sein.
 */
export async function findWorkerScheduleConflicts(db, workerUserId, startDate, endDate, { excludeAssignmentId = null } = {}) {
  const { rows } = await db.query(
    `SELECT wal.id, wal.assignment_id, wal.start_date, wal.end_date,
            wal.worker_confirmation_status, wal.client_name
       FROM worker_assignment_links wal
      WHERE wal.worker_user_id = $1 AND wal.is_active = TRUE
        AND wal.worker_confirmation_status NOT IN ('worker_declined','worker_unavailable')
        AND wal.start_date <= $3 AND (wal.end_date IS NULL OR wal.end_date >= $2)
        AND ($4::uuid IS NULL OR wal.assignment_id <> $4)
      ORDER BY wal.start_date ASC`,
    [workerUserId, startDate, endDate || "9999-12-31", excludeAssignmentId]
  );
  return rows;
}

export async function createAssignmentLink(pool, {
  workerUserId, assignmentId, orgId, supplierOrgId,
  role = "primary", startDate, endDate,
  defaultHoursPerDay = 8.0, defaultShiftStart, defaultShiftEnd,
  defaultBreakMinutes = 30, notes, createdBy, allowOverlap = false
}) {
  // Assignment validieren
  const { rows: asgRows } = await pool.query(
    `SELECT id, org_id, supplier_org_id, status, start_date, planned_end_date,
            (planned_end_date IS NOT NULL AND planned_end_date < CURRENT_DATE) AS is_expired
     FROM assignments WHERE id=$1`,
    [assignmentId]
  );
  if (!asgRows[0]) return { error: "ASSIGNMENT_NOT_FOUND" };
  if (!["planned","active","extended"].includes(asgRows[0].status)) {
    return { error: "ASSIGNMENT_NOT_ACTIVE", status: asgRows[0].status };
  }
  if (asgRows[0].is_expired) {
    return { error: "ASSIGNMENT_NOT_ACTIVE", status: asgRows[0].status, lifecycle_state: "expired" };
  }

  // Doppelbuchung verhindern: überlappender aktiver Einsatz (außer demselben Auftrag = Re-Assign)
  if (!allowOverlap) {
    const conflicts = await findWorkerScheduleConflicts(pool, workerUserId, startDate, endDate, { excludeAssignmentId: assignmentId });
    if (conflicts.length > 0) {
      return { error: "SCHEDULE_CONFLICT", conflicts, conflicting_link_ids: conflicts.map(c => c.id) };
    }
  }

  // P3.3 Sperrliste: hat das einsetzende Unternehmen (Auftrags-Org) diese Kraft gesperrt?
  const cBlock = await isWorkerBlockedForCompany(pool, asgRows[0].org_id, workerUserId);
  if (cBlock) return { error: "BLOCKED_BY_COMPANY", blocked_until: cBlock.blocked_until, reason: cBlock.reason };

  const { rows } = await pool.query(
    `INSERT INTO worker_assignment_links
       (worker_user_id, assignment_id, org_id, supplier_org_id, role,
        default_hours_per_day, default_shift_start, default_shift_end,
        default_break_minutes, start_date, end_date, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (worker_user_id, assignment_id) DO UPDATE
       SET is_active=TRUE, role=EXCLUDED.role,
           default_hours_per_day=EXCLUDED.default_hours_per_day,
           default_shift_start=EXCLUDED.default_shift_start,
           default_shift_end=EXCLUDED.default_shift_end,
           default_break_minutes=EXCLUDED.default_break_minutes,
           start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date,
           notes=EXCLUDED.notes, updated_at=NOW()
     RETURNING *`,
    [workerUserId, assignmentId, orgId, supplierOrgId, role,
     defaultHoursPerDay, defaultShiftStart || null, defaultShiftEnd || null,
     defaultBreakMinutes, startDate, endDate || null, notes || null, createdBy || null]
  );
  return { link: rows[0] };
}

export async function removeAssignmentLink(pool, linkId, supplierOrgId) {
  const { rowCount } = await pool.query(
    `UPDATE worker_assignment_links SET is_active=FALSE, updated_at=NOW()
     WHERE id=$1 AND supplier_org_id=$2`,
    [linkId, supplierOrgId]
  );
  return rowCount > 0;
}

export async function getWorkerAssignments(pool, workerUserId, { includeInactive = false } = {}) {
  const where = ["wal.worker_user_id = $1"];
  if (!includeInactive) where.push("wal.is_active = TRUE");
  const { rows } = await pool.query(
    `SELECT
       wal.id,  wal.id AS link_id, wal.assignment_id, wal.is_active,
       wal.org_id, wal.supplier_org_id,
       wal.role AS worker_role, wal.start_date, wal.end_date,
       wal.default_hours_per_day,
       wal.default_shift_start::TEXT  AS default_shift_start,
       wal.default_shift_end::TEXT    AS default_shift_end,
       wal.default_break_minutes,
       -- Einsatzportal-Felder
       wal.client_name, wal.location_address, wal.meeting_point,
       wal.instructions, wal.dress_code,
       wal.contact_name, wal.contact_phone, wal.contact_email,
       wal.dispatcher_name, wal.dispatcher_phone, wal.dispatcher_email,
       wal.worker_confirmation_status, wal.worker_confirmed_at, wal.worker_declined_at,
       wal.worker_declined_reason, wal.capacity_post_id,
       -- Assignment-Stammdaten
       a.status AS assignment_status, a.worker_description, a.notes AS assignment_notes,
       a.start_date AS asg_start, a.planned_end_date AS asg_end,
       a.actual_end_date AS asg_actual_end,
       -- Org-Namen als Fallback
       COALESCE(wal.client_name, o.name) AS client_display_name,
       so.name AS supplier_name,
       ${workerAssignmentLifecycleSelectSql}
     FROM worker_assignment_links wal
     JOIN assignments a ON a.id = wal.assignment_id
     LEFT JOIN organizations o ON o.id = wal.org_id
     LEFT JOIN organizations so ON so.id = wal.supplier_org_id
     WHERE ${where.join(" AND ")}
     ORDER BY wal.start_date DESC`,
    [workerUserId]
  );
  return rows;
}

export async function getWorkerAssignmentDetail(pool, linkId, workerUserId) {
  const { rows } = await pool.query(
    `SELECT
       wal.id, wal.assignment_id, wal.is_active,
       wal.org_id, wal.supplier_org_id,
       wal.role AS worker_role, wal.start_date, wal.end_date,
       wal.default_hours_per_day,
       wal.default_shift_start::TEXT AS default_shift_start,
       wal.default_shift_end::TEXT   AS default_shift_end,
       wal.default_break_minutes, wal.notes,
       wal.client_name, wal.location_address, wal.location_lat, wal.location_lng,
       wal.meeting_point, wal.instructions, wal.dress_code,
       wal.contact_name, wal.contact_phone, wal.contact_email,
       wal.dispatcher_name, wal.dispatcher_phone, wal.dispatcher_email,
       wal.worker_confirmation_status, wal.worker_confirmed_at, wal.worker_declined_at,
       wal.worker_declined_reason, wal.capacity_post_id,
       a.status AS assignment_status, a.worker_description, a.notes AS assignment_notes,
       a.start_date AS asg_start, a.planned_end_date AS asg_end,
       a.actual_end_date AS asg_actual_end,
       COALESCE(wal.client_name, o.name) AS client_display_name,
       so.name AS supplier_name,
       ${workerAssignmentLifecycleSelectSql}
     FROM worker_assignment_links wal
     JOIN assignments a ON a.id = wal.assignment_id
     LEFT JOIN organizations o ON o.id = wal.org_id
     LEFT JOIN organizations so ON so.id = wal.supplier_org_id
     WHERE wal.id = $1 AND wal.worker_user_id = $2`,
    [linkId, workerUserId]
  );
  return rows[0] || null;
}

export async function getWorkerSchedule(pool, workerUserId) {
  // Gibt die Einsatz-Wochen fuer die naechsten 5 + aktuelle Woche zurueck
  const { rows } = await pool.query(
    `SELECT
       wal.id AS link_id, wal.assignment_id, wal.org_id, wal.supplier_org_id,
       wal.default_shift_start::TEXT AS shift_start,
       wal.default_shift_end::TEXT   AS shift_end,
       wal.default_hours_per_day, wal.default_break_minutes,
       wal.start_date, wal.end_date, wal.is_active,
       wal.client_name, wal.location_address, wal.meeting_point,
       wal.contact_name, wal.contact_phone,
       wal.worker_confirmation_status,
       COALESCE(wal.client_name, o.name) AS client_display_name,
       a.status AS assignment_status, a.worker_description, a.notes AS assignment_notes,
       a.start_date AS asg_start, a.planned_end_date AS asg_end,
       a.actual_end_date AS asg_actual_end,
       ${workerAssignmentLifecycleSelectSql}
     FROM worker_assignment_links wal
     JOIN assignments a ON a.id = wal.assignment_id
     LEFT JOIN organizations o ON o.id = wal.org_id
     WHERE wal.worker_user_id = $1
       AND wal.is_active = TRUE
       AND ${workerAssignmentIsCurrentSql}
       AND (
         wal.end_date IS NULL
         OR wal.end_date >= DATE_TRUNC('week', NOW())
       )
     ORDER BY wal.start_date ASC`,
    [workerUserId]
  );
  return rows;
}

export async function getAssignmentLinksForSupplier(pool, supplierOrgId, { assignmentId = null }) {
  const params = [supplierOrgId];
  let where = "wal.supplier_org_id = $1";
  if (assignmentId) {
    params.push(assignmentId);
    where += ` AND wal.assignment_id = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT wal.*, u.email AS worker_email,
            wp.first_name, wp.last_name, wp.personnel_number,
            a.status AS assignment_status,
            a.start_date AS asg_start,
            a.planned_end_date AS asg_end,
            a.actual_end_date AS asg_actual_end,
            ${workerAssignmentLifecycleSelectSql}
     FROM worker_assignment_links wal
     JOIN assignments a ON a.id = wal.assignment_id
     JOIN users u ON u.id = wal.worker_user_id
     LEFT JOIN worker_profiles wp ON wp.user_id = wal.worker_user_id
     WHERE ${where}
     ORDER BY CASE WHEN ${workerAssignmentIsCurrentSql} THEN 0 ELSE 1 END,
              wal.is_active DESC,
              wp.last_name ASC`,
    params
  );
  return rows;
}

/* ── Worker-Einsatzbestätigung ───────────────────────────────────────────────── */

/**
 * Worker bestätigt einen zugewiesenen Einsatz.
 * Nur möglich bei worker_confirmation_status = 'pending_confirmation'.
 */
export async function confirmAssignment(pool, linkId, workerUserId) {
  const context = await getWorkerAssignmentActionContext(pool, linkId, workerUserId);
  if (!context) return { error: "NOT_FOUND" };
  if (!context.assignment_is_current) {
    return { error: "ASSIGNMENT_NOT_CURRENT", lifecycle_state: context.assignment_lifecycle_state };
  }
  const { rows } = await pool.query(
    `UPDATE worker_assignment_links
     SET worker_confirmation_status = 'worker_confirmed',
         worker_confirmed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
       AND worker_user_id = $2
       AND worker_confirmation_status = 'pending_confirmation'
     RETURNING *`,
    [linkId, workerUserId]
  );
  if (!rows[0]) return { error: "INVALID_STATUS", current_status: context.worker_confirmation_status };
  await assignmentStaffingService.recalcAssignmentStaffing(pool, rows[0].assignment_id, { writeEvent: false });
  return { link: rows[0] };
}

/**
 * Worker lehnt einen zugewiesenen Einsatz ab.
 * Nur möglich bei worker_confirmation_status = 'pending_confirmation'.
 */
export async function declineAssignment(pool, linkId, workerUserId, reason) {
  const context = await getWorkerAssignmentActionContext(pool, linkId, workerUserId);
  if (!context) return { error: "NOT_FOUND" };
  if (!context.assignment_is_current) {
    return { error: "ASSIGNMENT_NOT_CURRENT", lifecycle_state: context.assignment_lifecycle_state };
  }
  const { rows } = await pool.query(
    `UPDATE worker_assignment_links
     SET worker_confirmation_status = 'worker_declined',
         worker_declined_reason = $3,
         worker_declined_at = NOW(),
         is_active = FALSE,
         updated_at = NOW()
     WHERE id = $1
       AND worker_user_id = $2
       AND worker_confirmation_status = 'pending_confirmation'
     RETURNING *`,
    [linkId, workerUserId, reason || null]
  );
  if (!rows[0]) return { error: "INVALID_STATUS", current_status: context.worker_confirmation_status };
  await assignmentStaffingService.recalcAssignmentStaffing(pool, rows[0].assignment_id, { writeEvent: false });
  return { link: rows[0] };
}

/**
 * Worker meldet sich krank / nicht verfügbar ab einem bestimmten Datum.
 * Nur möglich bei worker_confirmed oder auto_confirmed (aktiver Einsatz).
 * Setzt worker_confirmation_status = 'worker_unavailable', is_active = FALSE.
 * Bereits geleistete Tage vor unavailable_from bleiben abrechenbar.
 */
export async function reportUnavailable(pool, linkId, workerUserId, { unavailableFrom, reason }) {
  const context = await getWorkerAssignmentActionContext(pool, linkId, workerUserId);
  if (!context) return { error: "NOT_FOUND" };
  if (!context.assignment_is_current) {
    return { error: "ASSIGNMENT_NOT_CURRENT", lifecycle_state: context.assignment_lifecycle_state };
  }
  const { rows } = await pool.query(
    `UPDATE worker_assignment_links
     SET worker_confirmation_status = 'worker_unavailable',
         unavailable_from = $3,
         unavailable_reason = $4,
         unavailable_reported_at = NOW(),
         is_active = FALSE,
         updated_at = NOW()
     WHERE id = $1
       AND worker_user_id = $2
       AND worker_confirmation_status IN ('worker_confirmed', 'auto_confirmed')
     RETURNING *`,
    [linkId, workerUserId, unavailableFrom, reason || null]
  );
  if (!rows[0]) return { error: "INVALID_STATUS", current_status: context.worker_confirmation_status };
  await assignmentStaffingService.recalcAssignmentStaffing(pool, rows[0].assignment_id, { writeEvent: false });
  return { link: rows[0] };
}

/**
 * Chef-seitiger Ersatz bei Krankheit/Abbruch (P1.1): stellt den ausfallenden Arbeiter
 * ab Wirk-Datum X frei UND weist einen Ersatz-Arbeiter ab X demselben Einsatz zu — atomar.
 * Bereits geleistete Tage des Ausfallenden vor X bleiben abrechenbar; ab X ist der Ersatz
 * der Zettel-Owner (Link-Split trennt Stundenzettel nach Worker + Datum, keine Datenmigration).
 * Reservierungs-/Notification-Ripple erfolgt auf Route-Ebene (wie beim Zuweisen).
 */
export async function replaceAssignmentWorker(pool, {
  linkId, supplierOrgId, replacementWorkerUserId, effectiveDate, reason, createdBy
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Original-Link laden + Org-Boundary + Aktivität (Row-Lock gegen Race)
    const { rows: origRows } = await client.query(
      `SELECT wal.*
         FROM worker_assignment_links wal
        WHERE wal.id = $1 AND wal.supplier_org_id = $2
        FOR UPDATE`,
      [linkId, supplierOrgId]
    );
    const orig = origRows[0];
    if (!orig) { await client.query("ROLLBACK"); return { error: "NOT_FOUND" }; }
    if (orig.is_active !== true) {
      await client.query("ROLLBACK");
      return { error: "LINK_NOT_ACTIVE", current_status: orig.worker_confirmation_status };
    }
    if (orig.worker_user_id === replacementWorkerUserId) {
      await client.query("ROLLBACK"); return { error: "SAME_WORKER" };
    }

    // 2) Ersatz-Arbeiter validieren: gehört zur selben Supplier-Org und ist aktiv?
    const { rows: repRows } = await client.query(
      `SELECT wp.user_id, wp.is_active
         FROM worker_profiles wp
        WHERE wp.user_id = $1 AND wp.supplier_org_id = $2`,
      [replacementWorkerUserId, supplierOrgId]
    );
    if (!repRows[0]) { await client.query("ROLLBACK"); return { error: "REPLACEMENT_NOT_IN_ORG" }; }
    if (repRows[0].is_active === false) { await client.query("ROLLBACK"); return { error: "REPLACEMENT_INACTIVE" }; }

    // 2b) Doppelbuchung des Ersatzes verhindern: hat B im Zeitraum [X, Enddatum] schon einen
    // überlappenden Einsatz (außer diesem Auftrag)? Dann Ersatz nicht möglich.
    const bConflicts = await findWorkerScheduleConflicts(
      client, replacementWorkerUserId, effectiveDate, orig.end_date, { excludeAssignmentId: orig.assignment_id }
    );
    if (bConflicts.length > 0) {
      await client.query("ROLLBACK");
      return { error: "SCHEDULE_CONFLICT", conflicts: bConflicts, conflicting_link_ids: bConflicts.map(c => c.id) };
    }

    // 2c) Sperrliste (P3.3): hat das Unternehmen den Ersatz gesperrt? Dann kein Ersatz möglich.
    const bBlock = await isWorkerBlockedForCompany(client, orig.org_id, replacementWorkerUserId);
    if (bBlock) {
      await client.query("ROLLBACK");
      return { error: "BLOCKED_BY_COMPANY", blocked_until: bBlock.blocked_until, reason: bBlock.reason };
    }

    // 3) Ausfallenden ab X freistellen (spiegelt reportUnavailable, aber Chef-initiiert)
    const { rows: freedRows } = await client.query(
      `UPDATE worker_assignment_links
          SET worker_confirmation_status = 'worker_unavailable',
              unavailable_from = $2,
              unavailable_reason = $3,
              unavailable_reported_at = NOW(),
              is_active = FALSE,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [linkId, effectiveDate, reason || null]
    );

    // 4) Ersatz-Link ab X bis Original-Enddatum anlegen (Defaults/Enddatum/Rolle geerbt)
    const { rows: repLinkRows } = await client.query(
      `INSERT INTO worker_assignment_links
         (worker_user_id, assignment_id, org_id, supplier_org_id, role,
          default_hours_per_day, default_shift_start, default_shift_end,
          default_break_minutes, start_date, end_date, notes, created_by,
          worker_confirmation_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'auto_confirmed')
       ON CONFLICT (worker_user_id, assignment_id) DO UPDATE
         SET is_active=TRUE, role=EXCLUDED.role,
             default_hours_per_day=EXCLUDED.default_hours_per_day,
             default_shift_start=EXCLUDED.default_shift_start,
             default_shift_end=EXCLUDED.default_shift_end,
             default_break_minutes=EXCLUDED.default_break_minutes,
             start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date,
             notes=EXCLUDED.notes,
             worker_confirmation_status='auto_confirmed',
             unavailable_from=NULL, unavailable_reason=NULL, unavailable_reported_at=NULL,
             updated_at=NOW()
       RETURNING *`,
      [replacementWorkerUserId, orig.assignment_id, orig.org_id, supplierOrgId, orig.role,
       orig.default_hours_per_day, orig.default_shift_start, orig.default_shift_end,
       orig.default_break_minutes, effectiveDate, orig.end_date, orig.notes, createdBy || null]
    );

    await client.query("COMMIT");
    // Staffing-Neuberechnung nach dem Commit (identisch zu reportUnavailable)
    await assignmentStaffingService.recalcAssignmentStaffing(pool, orig.assignment_id, { writeEvent: false });
    return {
      original_link: freedRows[0],
      replacement_link: repLinkRows[0],
      ailing_worker_user_id: orig.worker_user_id
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Dispatcher weist eine Kapazität einem Worker zu.
 * Erstellt: Assignment → Assignment-Link (pending_confirmation) → Notification
 */
export async function assignCapacityToWorker(pool, {
  capacityPostId, workerUserId, supplierOrgId,
  orgId, startDate, endDate,
  defaultHoursPerDay, defaultShiftStart, defaultShiftEnd,
  defaultBreakMinutes, clientName, notes, createdBy
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Kapazitäts-Post validieren
    const { rows: cpRows } = await client.query(
      `SELECT id, title, role, status, supplier_company_id, headcount
       FROM capacity_posts WHERE id = $1`,
      [capacityPostId]
    );
    if (!cpRows[0]) { await client.query("ROLLBACK"); return { error: "CAPACITY_NOT_FOUND" }; }
    if (!['active','filled'].includes(cpRows[0].status)) {
      await client.query("ROLLBACK");
      return { error: "CAPACITY_NOT_ASSIGNABLE", status: cpRows[0].status };
    }

    // 2) Worker validieren
    const { rows: wpRows } = await client.query(
      `SELECT user_id, is_active FROM worker_profiles
       WHERE user_id = $1 AND supplier_org_id = $2`,
      [workerUserId, supplierOrgId]
    );
    if (!wpRows[0]) { await client.query("ROLLBACK"); return { error: "WORKER_NOT_FOUND" }; }
    if (!wpRows[0].is_active) { await client.query("ROLLBACK"); return { error: "WORKER_INACTIVE" }; }

    // 3) Zeitraum-Konflikt prüfen (zentrale Wahrheit)
    const conflicts = await findWorkerScheduleConflicts(client, workerUserId, startDate, endDate);
    if (conflicts.length > 0) {
      await client.query("ROLLBACK");
      return { error: "SCHEDULE_CONFLICT", conflicting_link_ids: conflicts.map(c => c.id) };
    }

    // 4) Assignment erstellen
    const { rows: [assignment] } = await client.query(
      `INSERT INTO assignments
         (org_id, supplier_org_id, worker_description, worker_count,
          requested_quantity, filled_quantity, reserved_quantity, open_quantity, staffing_status,
          start_date, planned_end_date, notes, created_by, status)
       VALUES ($1, $2, $3, 1, 1, 0, 0, 1, 'open', $4, $5, $6, $7, 'planned')
       RETURNING *`,
      [orgId, supplierOrgId, cpRows[0].role || cpRows[0].title,
       startDate, endDate || null, notes || null, createdBy]
    );

    // 5) Assignment-Link erstellen (pending_confirmation)
    const { rows: [link] } = await client.query(
      `INSERT INTO worker_assignment_links
         (worker_user_id, assignment_id, org_id, supplier_org_id,
          default_hours_per_day, default_shift_start, default_shift_end,
          default_break_minutes, start_date, end_date, client_name,
          notes, created_by, capacity_post_id,
          worker_confirmation_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
               'pending_confirmation')
       RETURNING *`,
      [workerUserId, assignment.id, orgId, supplierOrgId,
       defaultHoursPerDay || 8.0, defaultShiftStart || null, defaultShiftEnd || null,
       defaultBreakMinutes || 30, startDate, endDate || null,
       clientName || null, notes || null, createdBy, capacityPostId]
    );

    // 6) Kapazitaets-Post-Statusabgleich
    //
    // Welle 7 – Phase 2+5: Multi-Headcount-Kapazitaeten werden hier nur auf
    // 'filled' geschaltet, wenn die Headcount-Kapazitaet tatsaechlich
    // ausgeschoepft ist. Fuer Mehr-Headcount-Posten (z. B. "5 Lagermitarbeiter")
    // bleibt die Kapazitaet active + is_active = TRUE, damit weitere Zuweisungen
    // moeglich bleiben. Das beseitigt den Bug, dass bereits nach der ersten
    // manuellen Zuweisung die Kapazitaet aus den unassigned-capacity-Listen
    // verschwand (reserved != hidden, filled != nach-1-sofort-zu).
    const { rows: activeLinkCounts } = await client.query(
      `SELECT COUNT(*)::INT AS active_links
         FROM worker_assignment_links
         WHERE capacity_post_id = $1
           AND is_active = TRUE
           AND worker_confirmation_status NOT IN ('worker_declined','worker_unavailable')`,
      [capacityPostId]
    );
    const headcountTotal = Math.max(1, Number(cpRows[0].headcount || 1));
    const filledLinks = Number(activeLinkCounts[0]?.active_links || 0);
    const isFullyFilled = filledLinks >= headcountTotal;
    if (isFullyFilled) {
      await client.query(
        `UPDATE capacity_posts SET status = 'filled', is_active = FALSE, updated_at = NOW()
         WHERE id = $1 AND status = 'active'`,
        [capacityPostId]
      );
    } else {
      // Bei Teilbesetzung Kapazitaet explizit aktiv halten, damit weitere
      // Zuweisungen und Matching-Sichtbarkeit erhalten bleiben.
      await client.query(
        `UPDATE capacity_posts SET is_active = TRUE, updated_at = NOW()
         WHERE id = $1 AND status = 'active'`,
        [capacityPostId]
      );
    }

    await assignmentStaffingService.recalcAssignmentStaffing(client, assignment.id, { lock: true, writeEvent: false });

    await client.query("COMMIT");
    return { assignment, link };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Offene Kapazitäten ohne Worker-Zuweisung abrufen (Dispatcher-Sicht).
 *
 * Gegenseitenorientiert & inklusive: Zeitarbeitsfirmen legen historisch
 * capacity_posts nur mit `supplier_company_id` an; neuere Flows setzen
 * zusaetzlich `org_id`. Der Dispatcher-Drawer muss beide Auspraegungen
 * erreichen, sonst bleibt "+ Kapazitaet zuweisen" leer, obwohl aktive
 * Kapazitaeten existieren.
 */
export async function getUnassignedCapacityPosts(pool, supplierOrgId, { supplierUserId = null } = {}) {
  const { rows } = await pool.query(
    `SELECT cp.id, cp.title, cp.role, cp.headcount, cp.skill_tags,
            cp.availability_from, cp.availability_to,
            cp.location_city, cp.location_postal,
            cp.shift_model, cp.employment_type,
            cp.price_type, cp.price_min, cp.price_max, cp.price_hint,
            cp.status, cp.created_at,
            u.company_name AS supplier_company_name
     FROM capacity_posts cp
     JOIN users u ON u.id = cp.supplier_company_id
     WHERE cp.status IN ('active','reserved')
     AND cp.is_active IS DISTINCT FROM FALSE
     AND (
       ($1::uuid IS NOT NULL AND cp.org_id = $1::uuid)
       OR ($2::uuid IS NOT NULL AND cp.supplier_company_id = $2::uuid)
     )
     AND cp.id NOT IN (
       SELECT wal.capacity_post_id FROM worker_assignment_links wal
       WHERE wal.capacity_post_id IS NOT NULL
         AND wal.worker_confirmation_status != 'worker_declined'
     )
     ORDER BY cp.availability_from ASC, cp.created_at DESC`,
    [supplierOrgId || null, supplierUserId || null]
  );
  return rows;
}

/* ── Deal-basierte Einsätze (aus Kapazitätsbörse-Deals) ────────────────────── */

/**
 * Offene Assignments aus Deals laden, die noch keinen Worker haben.
 * Dispatcher-Sicht: Zeigt alle deal-basierten Einsätze der eigenen Agency.
 */
export function getOpenDealAssignments(pool, supplierOrgId, { limit = 50 } = {}) {
  return assignmentStaffingService.listOpenStaffingAssignments(pool, supplierOrgId, { limit });
}

/**
 * Welle 7 – Phase 3+4: Abgeschlossene Deals hart verfügbar.
 * Liefert Assignments aus vollständig besetzten, beendeten oder stornierten
 * Deals, damit Freigabe-, Stundenzettel- und Lifecycle-Aktionen nach
 * vollständiger Besetzung nicht aus dem Agency-Review verschwinden.
 */
export function getClosedDealAssignments(pool, supplierOrgId, { limit = 100 } = {}) {
  return assignmentStaffingService.listClosedDealAssignments(pool, supplierOrgId, { limit });
}

/**
 * Aggregator fuer den Dispatcher-Drawer "+ Kapazitaet zuweisen" (manuelle
 * Zuweisungsflaeche). Liefert in EINER Liste beide Quellen, aus denen ein
 * Dispatcher einen Worker manuell einem Einsatz zuordnen kann:
 *
 *  - source='capacity'         : eigene proaktive capacity_posts (Marktplatz-
 *                                Angebote der Agentur, noch nicht komplett
 *                                besetzt). Zuweisung laeuft anschliessend
 *                                ueber `POST /api/assign-capacity-to-worker`.
 *  - source='deal_assignment'  : aus Deals entstandene assignments mit
 *                                `open_quantity > 0`. Zuweisung laeuft
 *                                anschliessend ueber
 *                                `POST /api/assign-deal-to-worker`.
 *
 * Die Fast-Track-/One-Click-Sektion "Deal-Einsaetze (Worker zuweisen)" bleibt
 * davon unberuehrt und behaelt ihren direkten Zuweisungspfad; hier geht es um
 * die vollumfaengliche manuelle Zuweisung mit Schichtzeit/Client/Notes.
 */
export async function listAssignableSourcesForDispatcher(pool, supplierOrgId, { supplierUserId = null } = {}) {
  const [capacityRows, dealRows] = await Promise.all([
    getUnassignedCapacityPosts(pool, supplierOrgId, { supplierUserId }),
    supplierOrgId
      ? assignmentStaffingService.listOpenStaffingAssignments(pool, supplierOrgId, { limit: 100 })
      : Promise.resolve([])
  ]);

  const capacityIds = (capacityRows || []).map((row) => row.id).filter(Boolean);
  const dealAssignmentIds = (dealRows || []).map((row) => row.assignment_id).filter(Boolean);

  // Pro Kapazitaet / Deal-Assignment die bereits aktiven Worker-Verknuepfungen
  // ermitteln, damit der Dispatcher-Drawer sie aus dem Worker-Dropdown
  // filtern kann. Krankgemeldete / abgelehnte Verknuepfungen bleiben
  // ausgeschlossen, damit der frei gewordene Slot sauber erneut belegt werden kann.
  const assignedByCapacity = new Map();
  const assignedByAssignment = new Map();
  if (capacityIds.length) {
    const { rows } = await pool.query(
      `SELECT capacity_post_id, worker_user_id
         FROM worker_assignment_links
        WHERE capacity_post_id = ANY($1::uuid[])
          AND is_active = TRUE
          AND worker_confirmation_status NOT IN ('worker_declined','worker_unavailable')`,
      [capacityIds]
    );
    for (const row of rows) {
      if (!row.capacity_post_id) continue;
      const list = assignedByCapacity.get(row.capacity_post_id) || [];
      list.push(row.worker_user_id);
      assignedByCapacity.set(row.capacity_post_id, list);
    }
  }
  if (dealAssignmentIds.length) {
    const { rows } = await pool.query(
      `SELECT assignment_id, worker_user_id
         FROM worker_assignment_links
        WHERE assignment_id = ANY($1::uuid[])
          AND is_active = TRUE
          AND worker_confirmation_status NOT IN ('worker_declined','worker_unavailable')`,
      [dealAssignmentIds]
    );
    for (const row of rows) {
      if (!row.assignment_id) continue;
      const list = assignedByAssignment.get(row.assignment_id) || [];
      list.push(row.worker_user_id);
      assignedByAssignment.set(row.assignment_id, list);
    }
  }

  const capacityItems = (capacityRows || []).map((row) => ({
    source: "capacity",
    id: row.id,
    capacity_post_id: row.id,
    assignment_id: null,
    title: row.title || row.role || "Kapazitaet",
    role: row.role || null,
    location_city: row.location_city || null,
    headcount: Number(row.headcount || 1),
    remaining: Number(row.headcount || 1),
    availability_from: row.availability_from || null,
    availability_to: row.availability_to || null,
    shift_model: row.shift_model || null,
    client_org_name: null,
    supplier_company_name: row.supplier_company_name || null,
    status_label: "Proaktive Kapazitaet",
    assigned_worker_user_ids: assignedByCapacity.get(row.id) || []
  }));

  const dealItems = (dealRows || []).map((row) => {
    const requested = Number(row.requested_quantity || row.worker_count || 1);
    const filled = Number(row.filled_quantity || 0);
    const reserved = Number(row.reserved_quantity || 0);
    const open = Number(row.open_quantity != null
      ? row.open_quantity
      : Math.max(requested - filled - reserved, 0));
    return {
      source: "deal_assignment",
      id: row.assignment_id,
      capacity_post_id: null,
      assignment_id: row.assignment_id,
      title: row.worker_description || row.request_title || row.demand_title || row.request_role || "Deal-Einsatz",
      role: row.request_role || row.demand_role || null,
      location_city: row.demand_location_city || null,
      headcount: requested,
      remaining: open,
      filled,
      reserved,
      availability_from: row.start_date || null,
      availability_to: row.planned_end_date || null,
      shift_model: null,
      client_org_name: row.client_org_name || null,
      supplier_company_name: null,
      status_label: "Aus Deal",
      assigned_worker_user_ids: assignedByAssignment.get(row.assignment_id) || []
    };
  });

  // Proaktive Kapazitaeten zuerst (kurzfristige Dispatcher-Sicht), dann
  // Deal-Einsaetze. Bewusst keine Vermischung durch Sortierung – die UI soll
  // visuell getrennt gruppieren koennen.
  return [...capacityItems, ...dealItems];
}

/**
 * Dispatcher weist einen deal-basierten Einsatz einem Worker zu.
 * Erstellt Assignment-Link (pending_confirmation) für ein existierendes Assignment.
 */
export async function assignDealToWorker(pool, {
  assignmentId, workerUserId, supplierOrgId,
  startDate, endDate, defaultHoursPerDay, defaultShiftStart,
  defaultShiftEnd, defaultBreakMinutes, clientName, notes, createdBy
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // 1) Assignment validieren — slot-fähiger Staffing-Container der eigenen Org
    const { rows: aRows } = await client.query(
      `SELECT a.id, a.org_id, a.supplier_org_id, a.deal_request_id, a.demand_request_id, a.offer_id,
              o.capacity_post_id,
              a.status, a.start_date, a.planned_end_date,
              (a.planned_end_date IS NOT NULL AND a.planned_end_date < CURRENT_DATE) AS is_expired,
              a.requested_quantity, a.filled_quantity, a.reserved_quantity, a.open_quantity,
              buyer.name AS client_org_name
       FROM assignments a
       LEFT JOIN offers o ON o.id = a.offer_id
       LEFT JOIN organizations buyer ON buyer.id = a.org_id
       WHERE a.id = $1 AND a.supplier_org_id = $2`,
      [assignmentId, supplierOrgId]
    );
    if (!aRows[0]) { await client.query("ROLLBACK"); return { error: "ASSIGNMENT_NOT_FOUND" }; }
    if (!['planned','active','extended'].includes(aRows[0].status)) {
      await client.query("ROLLBACK");
      return { error: "ASSIGNMENT_NOT_ASSIGNABLE", status: aRows[0].status };
    }
    if (aRows[0].is_expired) {
      await client.query("ROLLBACK");
      return { error: "ASSIGNMENT_NOT_ASSIGNABLE", status: aRows[0].status, lifecycle_state: "expired" };
    }
    const asg = aRows[0];
    const staffing = await assignmentStaffingService.recalcAssignmentStaffing(client, assignmentId, { lock: true, writeEvent: false });
    if (!staffing || staffing.open_quantity <= 0) {
      await client.query("ROLLBACK");
      return { error: "ASSIGNMENT_FILLED" };
    }

    // 2) Pruefen ob derselbe Worker bereits aktiv an diesem Assignment haengt.
    // Krankgemeldete (`worker_unavailable`) oder abgelehnte (`worker_declined`)
    // Alt-Links sind bewusst ausgeschlossen, damit der gleiche Worker nach
    // Genesung bzw. nach neuerlicher Freigabe wieder demselben Einsatz
    // zugeordnet werden kann (ein neuer worker_assignment_links-Eintrag entsteht).
    const { rows: existingAssignmentLinks } = await client.query(
      `SELECT id FROM worker_assignment_links
       WHERE assignment_id = $1
         AND worker_user_id = $2
         AND is_active = TRUE
         AND worker_confirmation_status NOT IN ('worker_declined','worker_unavailable')`,
      [assignmentId, workerUserId]
    );
    if (existingAssignmentLinks.length > 0) {
      await client.query("ROLLBACK");
      return { error: "WORKER_ALREADY_LINKED", existing_link_id: existingAssignmentLinks[0].id };
    }

    // 3) Worker validieren
    const { rows: wpRows } = await client.query(
      `SELECT user_id, is_active FROM worker_profiles
       WHERE user_id = $1 AND supplier_org_id = $2`,
      [workerUserId, supplierOrgId]
    );
    if (!wpRows[0]) { await client.query("ROLLBACK"); return { error: "WORKER_NOT_FOUND" }; }
    if (!wpRows[0].is_active) { await client.query("ROLLBACK"); return { error: "WORKER_INACTIVE" }; }

    const effectiveStart = startDate || asg.start_date;
    const effectiveEnd   = endDate   || asg.planned_end_date;

    // 4) Zeitraum-Konflikt prüfen (zentrale Wahrheit)
    const conflicts = await findWorkerScheduleConflicts(client, workerUserId, effectiveStart, effectiveEnd);
    if (conflicts.length > 0) {
      await client.query("ROLLBACK");
      return { error: "SCHEDULE_CONFLICT", conflicting_link_ids: conflicts.map(c => c.id) };
    }

    // 5) Assignment-Link erstellen
    const { rows: [link] } = await client.query(
      `INSERT INTO worker_assignment_links
         (worker_user_id, assignment_id, org_id, supplier_org_id,
          deal_request_id, capacity_post_id,
          default_hours_per_day, default_shift_start, default_shift_end,
          default_break_minutes, start_date, end_date,
          client_name, notes, created_by,
          worker_confirmation_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pending_confirmation')
       RETURNING *`,
      [workerUserId, assignmentId, asg.org_id, supplierOrgId,
       asg.deal_request_id, asg.capacity_post_id || null,
       defaultHoursPerDay || 8.0, defaultShiftStart || null, defaultShiftEnd || null,
       defaultBreakMinutes || 30, effectiveStart, effectiveEnd || null,
       clientName || asg.client_org_name || null, notes || null, createdBy]
    );

    const updatedAssignment = await assignmentStaffingService.recalcAssignmentStaffing(client, assignmentId, { lock: true, writeEvent: false });
    await assignmentStaffingService.autoStopFilledAssignment(client, assignmentId, createdBy);
    await assignmentStaffingService.syncStaffingChoiceSetsForAssignmentLink(client, {
      assignmentId,
      workerUserId,
      linkId: link.id,
      actorId: createdBy,
      note: notes
    });

    await client.query("COMMIT");
    return { assignment: updatedAssignment || asg, link };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/* ── Bulk-Import (CSV) ──────────────────────────────────────────────────────── */

/**
 * Bulk-Import von Workern aus CSV-Daten.
 * Wiederverwendet createWorkerAccount() pro Datensatz.
 * @param {Object} pool - DB pool
 * @param {Object} opts
 * @param {string} opts.supplierOrgId - Organisation der Zeitarbeitsfirma
 * @param {Array}  opts.workers - Array von { email, first_name, last_name, personnel_number?, phone?, street?, postal_code?, city?, country?, date_of_birth?, notes? }
 * @param {string} opts.onDuplicate - 'skip' | 'update'
 * @param {string} opts.createdBy - User-ID des Importierenden
 * @returns {{ created: Array, updated: Array, skipped: Array, errors: Array }}
 */
export async function bulkImportWorkers(pool, { supplierOrgId, workers, onDuplicate = "skip", createdBy }) {
  const result = { created: [], updated: [], skipped: [], errors: [] };

  // 1) Lade existierende Emails in dieser Org (für Duplikat-Erkennung)
  const { rows: existingWorkers } = await pool.query(
    `SELECT u.email, u.id AS user_id, wp.first_name, wp.last_name
     FROM worker_profiles wp
     JOIN users u ON u.id = wp.user_id
     WHERE wp.supplier_org_id = $1`,
    [supplierOrgId]
  );
  const existingEmails = new Map(existingWorkers.map(w => [w.email.toLowerCase(), w]));

  // 2) Auch globale Email-Duplikate prüfen (andere Rollen)
  const allEmails = workers.map(w => w.email?.toLowerCase?.().trim()).filter(Boolean);
  const { rows: globalUsers } = allEmails.length > 0
    ? await pool.query(
        `SELECT id, email, role FROM users WHERE LOWER(email) = ANY($1::text[])`,
        [allEmails]
      )
    : { rows: [] };
  const globalEmailMap = new Map(globalUsers.map(u => [u.email.toLowerCase(), u]));

  // 3) Verarbeite jeden Datensatz
  for (let i = 0; i < workers.length; i++) {
    const w = workers[i];
    const rowNum = i + 1;
    const email = w.email?.toLowerCase?.().trim();

    // Basis-Validierung
    if (!email || !w.first_name?.trim() || !w.last_name?.trim()) {
      result.errors.push({ row: rowNum, email: email || null, error: "MISSING_REQUIRED_FIELDS",
        message: "Email, Vorname und Nachname sind Pflichtfelder." });
      continue;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      result.errors.push({ row: rowNum, email, error: "INVALID_EMAIL",
        message: "Ungültige E-Mail-Adresse." });
      continue;
    }

    // Duplikat in eigener Org?
    const existsInOrg = existingEmails.get(email);
    if (existsInOrg) {
      if (onDuplicate === "update") {
        // Update existierendes Profil
        try {
          const updateData = {};
          if (w.first_name?.trim()) updateData.first_name = w.first_name.trim();
          if (w.last_name?.trim()) updateData.last_name = w.last_name.trim();
          if (w.personnel_number !== undefined) updateData.personnel_number = w.personnel_number || null;
          if (w.phone !== undefined) updateData.phone = w.phone || null;
          if (w.street !== undefined) updateData.street = w.street || null;
          if (w.postal_code !== undefined) updateData.postal_code = w.postal_code || null;
          if (w.city !== undefined) updateData.city = w.city || null;
          if (w.notes !== undefined) updateData.notes = w.notes || null;
          const updated = await updateWorkerProfile(pool, existsInOrg.user_id, supplierOrgId, updateData);
          if (updated) {
            result.updated.push({ row: rowNum, email, user_id: existsInOrg.user_id, name: `${w.first_name} ${w.last_name}` });
          } else {
            result.skipped.push({ row: rowNum, email, reason: "UPDATE_NO_CHANGES" });
          }
        } catch (err) {
          result.errors.push({ row: rowNum, email, error: "UPDATE_FAILED", message: err.message });
        }
      } else {
        result.skipped.push({ row: rowNum, email, reason: "DUPLICATE_IN_ORG",
          message: `${existsInOrg.first_name} ${existsInOrg.last_name} existiert bereits.` });
      }
      continue;
    }

    // Email existiert global (aber nicht in dieser Org)?
    const globalUser = globalEmailMap.get(email);
    if (globalUser && globalUser.role !== "worker") {
      result.errors.push({ row: rowNum, email, error: "EMAIL_EXISTS_OTHER_ROLE",
        message: `E-Mail existiert bereits als ${globalUser.role}-Account.` });
      continue;
    }

    // Neuen Worker erstellen
    try {
      const passwordHash = (await import("bcryptjs")).default.hashSync(
        crypto.randomBytes(16).toString("hex"), 10
      );

      const { user, profile } = await createWorkerAccount(pool, {
        supplierOrgId,
        email,
        firstName: w.first_name.trim(),
        lastName: w.last_name.trim(),
        personnelNumber: w.personnel_number || null,
        phone: w.phone || null,
        street: w.street || null,
        postalCode: w.postal_code || null,
        city: w.city || null,
        country: w.country || "DE",
        passwordHash,
        createdBy
      });

      // date_of_birth separat updaten (nicht in createWorkerAccount)
      if (w.date_of_birth) {
        await pool.query(
          `UPDATE worker_profiles SET date_of_birth = $1, updated_at = NOW() WHERE user_id = $2`,
          [w.date_of_birth, user.id]
        );
      }
      if (w.notes) {
        await pool.query(
          `UPDATE worker_profiles SET notes = $1, updated_at = NOW() WHERE user_id = $2`,
          [w.notes, user.id]
        );
      }

      result.created.push({ row: rowNum, email, user_id: user.id, profile_id: profile.id,
        name: `${w.first_name.trim()} ${w.last_name.trim()}` });

      // Cache für weitere Duplikat-Erkennung im selben Batch
      existingEmails.set(email, { email, user_id: user.id, first_name: w.first_name.trim(), last_name: w.last_name.trim() });
    } catch (err) {
      if (err.code === "23505") {
        result.skipped.push({ row: rowNum, email, reason: "EMAIL_CONFLICT",
          message: "E-Mail-Adresse wurde zeitgleich von einem anderen Prozess angelegt." });
      } else {
        result.errors.push({ row: rowNum, email, error: "CREATE_FAILED", message: err.message });
      }
    }
  }

  return result;
}

/* ── Plan / Feature prüfen ──────────────────────────────────────────────────── */

export async function getSupplierPlan(pool, supplierOrgId) {
  // Plan der Zeitarbeitsfirma aus deren neuester Subscription
  // Zeitarbeitsfirmen sind agencies und haben user-accounts die der org gehören
  const { rows } = await pool.query(
    `SELECT s.plan FROM subscriptions s
     JOIN org_memberships om ON om.user_id = s.user_id
     WHERE om.org_id = $1 AND s.status = 'active'
     ORDER BY s.created_at DESC LIMIT 1`,
    [supplierOrgId]
  );
  return rows[0]?.plan || "FREE";
}
