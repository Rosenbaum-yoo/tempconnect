/**
 * Product release notes / "What's New" — targeting by role, plan, optional feature key.
 * Kept separate from transactional notifications (notifications table).
 */

import { hasFeature } from "../config/planFeatures.js";

const PLAN_RANK = {
  DEMO: 0,
  FREE: 0,
  BASIS: 1,
  PLUS: 2,
  PRO: 3,
  ENTERPRISE: 4
};

const AUDIENCE_KEYS = new Set(["worker", "agency", "company", "admin", "supplier_user"]);

/**
 * @param {string} [plan]
 * @returns {number}
 */
export function planTier(plan) {
  const p = String(plan || "DEMO").toUpperCase();
  return PLAN_RANK[p] ?? 0;
}

/**
 * @param {object} row — DB row
 * @param {{
 *   userRole: string,
 *   orgRole: string | null,
 *   plan: string,
 *   isInternalViewer: boolean
 * }} ctx
 * @returns {boolean}
 */
export function entryVisibleForUser(row, ctx) {
  if (!row) return false;

  if (row.status === "draft" && !ctx.isInternalViewer) return false;
  if (row.visibility === "internal" && !ctx.isInternalViewer) return false;

  if (row.status === "published") {
    if (!row.published_at) return false;
    const pub = new Date(row.published_at).getTime();
    if (Number.isFinite(pub) && pub > Date.now()) return false;
  }

  if (row.min_plan) {
    const need = planTier(row.min_plan);
    if (planTier(ctx.plan) < need) return false;
  }

  if (row.required_feature_key && !hasFeature(ctx.plan, row.required_feature_key)) {
    return false;
  }

  const audiences = Array.isArray(row.audiences) ? row.audiences : [];
  if (audiences.length === 0) return true;

  for (const raw of audiences) {
    const a = String(raw || "").toLowerCase();
    if (!AUDIENCE_KEYS.has(a)) continue;
    if (a === "worker" && ctx.userRole === "worker") return true;
    if (a === "agency" && ctx.userRole === "agency") return true;
    if (a === "company" && ctx.userRole === "company") return true;
    if (a === "admin" && ctx.userRole === "admin") return true;
    if (a === "supplier_user" && ctx.orgRole === "supplier_user") return true;
  }
  return false;
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} userId
 */
export async function loadReleaseContext(pool, userId, getUserAndPlan) {
  const { rows: urows } = await pool.query(
    "SELECT id, role FROM users WHERE id = $1",
    [userId]
  );
  if (!urows[0]) return null;

  const me = await getUserAndPlan(userId);
  const plan = me?.plan || "DEMO";
  const orgRole = me?.org_role || null;
  const userRole = urows[0].role || "company";

  const { rows: iv } = await pool.query(
    `SELECT (
       EXISTS (SELECT 1 FROM users u WHERE u.id = $1 AND u.role = 'admin')
       OR EXISTS (
         SELECT 1 FROM org_memberships om
         WHERE om.user_id = $1 AND om.is_active = TRUE AND om.role_key = 'platform_admin'
       )
     ) AS internal`,
    [userId]
  );

  return {
    userId,
    userRole,
    orgRole,
    plan,
    isInternalViewer: Boolean(iv[0]?.internal)
  };
}

function mapRow(r) {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    body: r.body,
    feature_key: r.feature_key,
    audiences: r.audiences || [],
    min_plan: r.min_plan,
    required_feature_key: r.required_feature_key,
    visibility: r.visibility,
    status: r.status,
    published_at: r.published_at,
    show_in_app: r.show_in_app,
    send_email_on_publish: r.send_email_on_publish,
    email_sent_at: r.email_sent_at,
    priority: r.priority,
    show_as_modal: r.show_as_modal,
    created_at: r.created_at,
    updated_at: r.updated_at
  };
}

/**
 * Published + draft (internal) entries visible to user — full changelog list.
 * @param {import('pg').Pool} pool
 */
export async function listVisibleForUser(pool, userId, getUserAndPlan, { inAppOnly = false } = {}) {
  const ctx = await loadReleaseContext(pool, userId, getUserAndPlan);
  if (!ctx) return [];

  const { rows } = await pool.query(
    `SELECT e.*, a.seen_at, a.modal_dismissed_at
     FROM product_release_entries e
     LEFT JOIN user_product_release_ack a
       ON a.release_id = e.id AND a.user_id = $1
     ORDER BY e.published_at DESC NULLS LAST, e.created_at DESC`,
    [userId]
  );

  return rows
    .filter((r) => entryVisibleForUser(r, ctx))
    .filter((r) => !inAppOnly || r.show_in_app !== false)
    .map((r) => ({
      ...mapRow(r),
      seen_at: r.seen_at,
      modal_dismissed_at: r.modal_dismissed_at,
      is_unread: r.status === "published" && r.published_at && !r.seen_at
    }));
}

/**
 * Badge + optional one-shot modal (highest priority modal candidate).
 */
export async function getInboxSummary(pool, userId, getUserAndPlan) {
  const items = await listVisibleForUser(pool, userId, getUserAndPlan, { inAppOnly: true });
  const published = items.filter((i) => i.status === "published" && i.published_at);

  const unseen = published.filter((i) => !i.seen_at);
  const unseenCount = unseen.length;

  const modalCandidates = published.filter(
    (i) =>
      i.show_as_modal &&
      !i.modal_dismissed_at &&
      i.show_in_app !== false
  );
  modalCandidates.sort((a, b) => (b.priority || 0) - (a.priority || 0) || new Date(b.published_at) - new Date(a.published_at));
  const modal = modalCandidates[0] || null;

  const preview = unseen.slice(0, 5).map((i) => ({
    id: i.id,
    title: i.title,
    summary: i.summary,
    published_at: i.published_at
  }));

  return { unseen_count: unseenCount, preview, modal };
}

export async function ackSeen(pool, userId, releaseId) {
  await pool.query(
    `INSERT INTO user_product_release_ack (user_id, release_id, seen_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id, release_id) DO UPDATE SET seen_at = COALESCE(user_product_release_ack.seen_at, NOW())`,
    [userId, releaseId]
  );
}

export async function ackModalDismissed(pool, userId, releaseId) {
  await pool.query(
    `INSERT INTO user_product_release_ack (user_id, release_id, modal_dismissed_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id, release_id) DO UPDATE SET modal_dismissed_at = NOW()`,
    [userId, releaseId]
  );
}

export async function markAllSeenForUser(pool, userId, getUserAndPlan) {
  const visible = await listVisibleForUser(pool, userId, getUserAndPlan, { inAppOnly: false });
  const publishedIds = visible.filter((i) => i.status === "published").map((i) => i.id);
  for (const id of publishedIds) {
    await ackSeen(pool, userId, id);
  }
  return publishedIds.length;
}

export async function listAllAdmin(pool) {
  const { rows } = await pool.query(
    `SELECT * FROM product_release_entries
     ORDER BY created_at DESC`
  );
  return rows.map(mapRow);
}

export async function getById(pool, id) {
  const { rows } = await pool.query(`SELECT * FROM product_release_entries WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createEntry(pool, userId, payload) {
  let publishedAt = payload.published_at || null;
  if (payload.status === "published" && !publishedAt) {
    publishedAt = new Date();
  }

  const { rows } = await pool.query(
    `INSERT INTO product_release_entries (
       title, summary, body, feature_key, audiences, min_plan, required_feature_key,
       visibility, status, published_at, show_in_app, send_email_on_publish,
       priority, show_as_modal, created_by
     ) VALUES ($1,$2,$3,$4,$5::text[],$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      payload.title,
      payload.summary || null,
      payload.body || null,
      payload.feature_key || null,
      payload.audiences || [],
      payload.min_plan || null,
      payload.required_feature_key || null,
      payload.visibility,
      payload.status,
      publishedAt,
      payload.show_in_app !== false,
      payload.send_email_on_publish === true,
      payload.priority ?? 0,
      payload.show_as_modal === true,
      userId || null
    ]
  );
  return mapRow(rows[0]);
}

export async function updateEntry(pool, id, payload) {
  const cur = await getById(pool, id);
  if (!cur) return null;

  const next = {
    title: payload.title !== undefined ? payload.title : cur.title,
    summary: payload.summary !== undefined ? payload.summary : cur.summary,
    body: payload.body !== undefined ? payload.body : cur.body,
    feature_key: payload.feature_key !== undefined ? payload.feature_key : cur.feature_key,
    audiences: payload.audiences !== undefined ? payload.audiences : cur.audiences,
    min_plan: payload.min_plan !== undefined ? payload.min_plan : cur.min_plan,
    required_feature_key:
      payload.required_feature_key !== undefined ? payload.required_feature_key : cur.required_feature_key,
    visibility: payload.visibility !== undefined ? payload.visibility : cur.visibility,
    status: payload.status !== undefined ? payload.status : cur.status,
    published_at: payload.published_at !== undefined ? payload.published_at : cur.published_at,
    show_in_app: payload.show_in_app !== undefined ? payload.show_in_app : cur.show_in_app,
    send_email_on_publish:
      payload.send_email_on_publish !== undefined ? payload.send_email_on_publish : cur.send_email_on_publish,
    priority: payload.priority !== undefined ? payload.priority : cur.priority,
    show_as_modal: payload.show_as_modal !== undefined ? payload.show_as_modal : cur.show_as_modal
  };

  const { rows } = await pool.query(
    `UPDATE product_release_entries SET
       title = $2, summary = $3, body = $4, feature_key = $5, audiences = $6::text[],
       min_plan = $7, required_feature_key = $8, visibility = $9, status = $10,
       published_at = $11, show_in_app = $12, send_email_on_publish = $13,
       priority = $14, show_as_modal = $15, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      next.title,
      next.summary,
      next.body,
      next.feature_key,
      next.audiences || [],
      next.min_plan,
      next.required_feature_key,
      next.visibility,
      next.status,
      next.published_at,
      next.show_in_app,
      next.send_email_on_publish,
      next.priority,
      next.show_as_modal
    ]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Publish draft: sets status + published_at if not set */
export async function publishEntry(pool, id) {
  const { rows } = await pool.query(
    `UPDATE product_release_entries SET
       status = 'published',
       published_at = COALESCE(published_at, NOW()),
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

const EMAIL_BATCH_CAP = 400;

/**
 * One-shot email blast to users matching entry targeting. Sets email_sent_at when done.
 * @returns {{ sent: number, skipped: number }}
 */
export async function dispatchReleaseEmails(pool, releaseId, getUserAndPlan, sendMail, logger, baseUrl = "") {
  const { rows: erows } = await pool.query(`SELECT * FROM product_release_entries WHERE id = $1`, [releaseId]);
  const entry = erows[0];
  if (!entry) return { sent: 0, skipped: 0 };
  if (entry.status !== "published") return { sent: 0, skipped: 0 };
  if (entry.email_sent_at) return { sent: 0, skipped: 0 };

  const { rows: users } = await pool.query(
    `SELECT id, email FROM users
     WHERE email IS NOT NULL AND TRIM(email) <> ''
       AND role NOT IN ('inactive')
     LIMIT 5000`
  );

  let sent = 0;
  let skipped = 0;

  for (const u of users) {
    if (sent >= EMAIL_BATCH_CAP) break;
    const ctx = await loadReleaseContext(pool, u.id, getUserAndPlan);
    if (!ctx || !entryVisibleForUser(entry, ctx)) {
      skipped++;
      continue;
    }
    const subject = `TempConnect: ${entry.title}`;
    const safeTitle = String(entry.title || "").replace(/</g, "");
    const summary = String(entry.summary || "").replace(/</g, "").replace(/\n/g, "<br/>");
    const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
      <h2 style="margin:0 0 12px">${safeTitle}</h2>
      <p style="margin:0 0 16px;color:#444">${summary}</p>
      <p style="margin:0"><a href="${baseUrl.replace(/\/$/, "")}/public/whats-new.html" style="color:#2563eb">Im Produkt ansehen</a></p>
      </body></html>`;
    const ok = await sendMail(u.email, subject, html);
    if (ok) sent++;
  }

  await pool.query(
    `UPDATE product_release_entries SET email_sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [releaseId]
  );

  logger.info({ releaseId, sent, skipped }, "product_release_email_dispatch");
  return { sent, skipped };
}
