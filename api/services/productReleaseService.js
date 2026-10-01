/**
 * Product release notes / "What's New" — targeting by role, plan, optional feature key.
 * Kept separate from transactional notifications (notifications table).
 */

import crypto from "node:crypto";
import { hasFeature } from "../config/planFeatures.js";
import { normalizePlanKey } from "../config/planCatalog.js";

/*
 * Rang je KANONISCHEM Plan. Bis 2026-10-01 stand hier ENTERPRISE als oberste
 * Stufe — aber `getUserAndPlan` liefert den kanonischen Schluessel INDIVIDUELL,
 * und den kannte diese Tabelle nicht: Rang 0. Eine Mitteilung "ab PLUS" erreichte
 * damit jeden Kunden AUSSER denen im hoechsten Tarif. Jetzt wird jeder Wert erst
 * ueber `normalizePlanKey` gefuehrt (ENTERPRISE -> INDIVIDUELL, FREE -> DEMO).
 */
const PLAN_RANK = {
  DEMO: 0,
  BASIS: 1,
  PLUS: 2,
  PRO: 3,
  INDIVIDUELL: 4
};

/** Hoechstzahl Mails je Mitteilung — siehe dispatchReleaseEmails. */
const EMAIL_BATCH_CAP = 400;

const AUDIENCE_KEYS = new Set(["worker", "agency", "company", "admin", "supplier_user"]);

/**
 * @param {string} [plan]
 * @returns {number}
 */
export function planTier(plan) {
  return PLAN_RANK[normalizePlanKey(plan)] ?? 0;
}

/** Wie viele Mails eine Mitteilung hoechstens verschickt (siehe dispatchReleaseEmails). */
export function mailObergrenze() {
  return EMAIL_BATCH_CAP;
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
  if (publishedIds.length === 0) return 0;
  await pool.query(
    `INSERT INTO user_product_release_ack (user_id, release_id, seen_at)
     SELECT $1, rid, NOW()
       FROM UNNEST($2::uuid[]) AS rid
     ON CONFLICT (user_id, release_id)
       DO UPDATE SET seen_at = COALESCE(user_product_release_ack.seen_at, NOW())`,
    [userId, publishedIds]
  );
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


/**
 * One-shot email blast to users matching entry targeting. Sets email_sent_at when done.
 * @returns {{ sent: number, skipped: number }}
 */
/* ── Abmeldung von Produkt-Mails (Owner-Entscheid 2026-10-01) ────────────────
 *
 * Produktneuheiten per E-Mail sind Werbung im Sinne von § 7 UWG. Bestandskunden
 * duerfen sie ohne gesonderte Einwilligung bekommen (§ 7 Abs. 3), aber nur, wenn
 * JEDE Mail deutlich sagt, wie man widerspricht — und der Widerspruch wirkt.
 *
 * Gespeichert wird in der vorhandenen `notification_preferences` (Kategorie
 * "product_updates", channel_email = FALSE); keine zweite Tabelle. Ohne Eintrag
 * gilt: angemeldet — so wie bisher jeder Nutzer der Zielgruppe die Mail bekam.
 *
 * Der Link traegt eine HMAC-Signatur ueber die Nutzerkennung, zweckgebunden
 * ("produkt-updates-abmelden:v1"), mit dem Schluessel aus der Umgebung. Ohne
 * Schluessel wird NICHT gemailt: eine Werbemail ohne funktionierenden Widerspruch
 * waere der Rechtsverstoss, gegen den diese Stelle gebaut ist.
 */
export const ABMELDE_KATEGORIE = "product_updates";
const ABMELDE_ZWECK = "produkt-updates-abmelden:v1";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function abmeldeSignatur(userId, schluessel) {
  if (!schluessel) throw new Error("abmeldeSignatur: kein Schluessel");
  return crypto.createHmac("sha256", String(schluessel))
    .update(`${ABMELDE_ZWECK}:${String(userId).toLowerCase()}`)
    .digest("base64url");
}

export function abmeldeLink(baseUrl, userId, schluessel) {
  const basis = String(baseUrl || "").replace(/\/$/, "");
  return `${basis}/public/abmelden.html?u=${encodeURIComponent(userId)}&t=${abmeldeSignatur(userId, schluessel)}`;
}

/** Zeitkonstanter Vergleich — eine Signatur darf sich nicht Zeichen fuer Zeichen erraten lassen. */
export function pruefeAbmeldung(userId, token, schluessel) {
  if (!schluessel || !UUID_RE.test(String(userId || "")) || typeof token !== "string" || !token) return false;
  const erwartet = Buffer.from(abmeldeSignatur(userId, schluessel));
  const gegeben = Buffer.from(token);
  return erwartet.length === gegeben.length && crypto.timingSafeEqual(erwartet, gegeben);
}

/** Abmelden. Laesst den In-App-Schalter, wie er ist — abbestellt wird nur die E-Mail. */
export async function abmelden(pool, userId) {
  const { rowCount } = await pool.query(
    `INSERT INTO notification_preferences (user_id, event_category, channel_in_app, channel_email)
     SELECT id, $2, TRUE, FALSE FROM users WHERE id = $1
     ON CONFLICT (user_id, event_category)
     DO UPDATE SET channel_email = FALSE, updated_at = NOW()`,
    [userId, ABMELDE_KATEGORIE]
  );
  return rowCount > 0;
}

function escHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (z) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[z]));
}

/**
 * Wer eine Mitteilung per Mail bekaeme — fuer die Vorschau vor dem Klick UND fuer
 * den Versand, damit beide dieselbe Zahl meinen. Ein Entwurf wird bewertet, als
 * waere er veroeffentlicht (sonst saehe ihn nur das Team).
 *
 * Laedt den Kontext je Nutzer (bis zu 5000 Abfragen) — bewusst so belassen, bis
 * der Versand in Paketen kommt (Owner-Entscheid 2026-10-01: vor etwa 50 Kunden).
 */
export async function ermittleEmpfaenger(pool, entry, getUserAndPlan) {
  const alsVeroeffentlicht = {
    ...entry,
    status: "published",
    published_at: entry.status === "published" && entry.published_at ? entry.published_at : new Date(Date.now() - 1000)
  };
  const { rows: users } = await pool.query(
    `SELECT id, email FROM users
     WHERE email IS NOT NULL AND TRIM(email) <> ''
       AND role NOT IN ('inactive')
     LIMIT 5000`
  );
  const { rows: ab } = await pool.query(
    `SELECT user_id FROM notification_preferences
      WHERE event_category = $1 AND channel_email = FALSE`,
    [ABMELDE_KATEGORIE]
  );
  const abgemeldet = new Set(ab.map((r) => String(r.user_id)));

  const empfaenger = [];
  let abgemeldetInZielgruppe = 0;
  let nichtInZielgruppe = 0;
  for (const u of users) {
    const ctx = await loadReleaseContext(pool, u.id, getUserAndPlan);
    if (!ctx || !entryVisibleForUser(alsVeroeffentlicht, ctx)) { nichtInZielgruppe++; continue; }
    if (abgemeldet.has(String(u.id))) { abgemeldetInZielgruppe++; continue; }
    empfaenger.push({ id: u.id, email: u.email });
  }
  return { empfaenger, abgemeldet: abgemeldetInZielgruppe, nicht_in_zielgruppe: nichtInZielgruppe };
}

/** Die Zahl vor dem Klick: wie viele Menschen, wie viele abgemeldet, wie viele gehen raus. */
export async function empfaengerVorschau(pool, releaseId, getUserAndPlan) {
  const entry = await getById(pool, releaseId);
  if (!entry) return null;
  const r = await ermittleEmpfaenger(pool, entry, getUserAndPlan);
  return {
    zielgruppe: r.empfaenger.length + r.abgemeldet,
    abgemeldet: r.abgemeldet,
    wuerden_gesendet: Math.min(r.empfaenger.length, EMAIL_BATCH_CAP),
    obergrenze: EMAIL_BATCH_CAP,
    ueber_obergrenze: Math.max(0, r.empfaenger.length - EMAIL_BATCH_CAP),
    schon_gemailt: Boolean(entry.email_sent_at)
  };
}

export async function dispatchReleaseEmails(pool, releaseId, getUserAndPlan, sendMail, logger, baseUrl = "", abmeldeSchluessel = null) {
  if (!abmeldeSchluessel) {
    // Keine Werbemail ohne funktionierenden Widerspruch (§ 7 Abs. 3 UWG).
    throw new Error("dispatchReleaseEmails: ohne Abmelde-Schluessel wird nicht gemailt");
  }
  const { rows: erows } = await pool.query(`SELECT * FROM product_release_entries WHERE id = $1`, [releaseId]);
  const entry = erows[0];
  if (!entry) return { sent: 0, skipped: 0, abgemeldet: 0 };
  if (entry.status !== "published") return { sent: 0, skipped: 0, abgemeldet: 0 };
  if (entry.email_sent_at) return { sent: 0, skipped: 0, abgemeldet: 0 };

  const { empfaenger, abgemeldet, nicht_in_zielgruppe } = await ermittleEmpfaenger(pool, entry, getUserAndPlan);
  const basis = String(baseUrl || "").replace(/\/$/, "");
  const subject = `TempConnect: ${entry.title}`;
  const titel = escHtml(entry.title);
  const kurz = escHtml(entry.summary).replace(/\n/g, "<br/>");

  let sent = 0;
  for (const u of empfaenger) {
    if (sent >= EMAIL_BATCH_CAP) break;
    const link = escHtml(abmeldeLink(basis, u.id, abmeldeSchluessel));
    const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
      <h2 style="margin:0 0 12px">${titel}</h2>
      <p style="margin:0 0 16px;color:#444">${kurz}</p>
      <p style="margin:0 0 24px"><a href="${basis}/public/whats-new.html" style="color:#2563eb">Im Produkt ansehen</a></p>
      <p style="margin:0;font-size:12px;color:#666">Sie erhalten diese Nachricht als Nutzer von TempConnect.
      Keine Produktneuheiten mehr per E-Mail? <a href="${link}" style="color:#666">Hier abbestellen</a> —
      in der App sehen Sie sie weiterhin.</p>
      </body></html>`;
    const ok = await sendMail(u.email, subject, html, { zweck: "produkt-update" });
    if (ok) sent++;
  }

  await pool.query(
    `UPDATE product_release_entries SET email_sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [releaseId]
  );

  logger.info({ releaseId, sent, abgemeldet, nicht_in_zielgruppe }, "product_release_email_dispatch");
  return { sent, skipped: nicht_in_zielgruppe, abgemeldet };
}
