/**
 * Product release notes / "What's New" — targeting by role, plan, optional feature key.
 * Kept separate from transactional notifications (notifications table).
 */

import crypto from "node:crypto";
import { hasFeature } from "../config/planFeatures.js";
import { normalizePlanKey } from "../config/planCatalog.js";
import { effektiverPlan, kuendigungFaellig } from "./userService.js";
import { ANONYM_DOMAIN } from "./dataGovernanceService.js";

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

const AUDIENCE_KEYS = new Set(["worker", "agency", "company", "admin", "supplier_user"]);

/**
 * @param {string} [plan]
 * @returns {number}
 */
export function planTier(plan) {
  return PLAN_RANK[normalizePlanKey(plan)] ?? 0;
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

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * WER BEKOMMT DIE MAIL — EINE ABFRAGE JE 1000 NUTZER, NICHT SIEBEN JE NUTZER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bis 2026-10-01 lud diese Stelle den Kontext Nutzer fuer Nutzer ueber
 * `getUserAndPlan` — gemessen etwa sieben Abfragen je Nutzer, darunter drei
 * Zaehlungen ueber `requests`, die fuer die Zielgruppe gar keine Rolle spielen,
 * und hoechstens 5000 Nutzer. Schlimmer: `getUserAndPlan` SCHREIBT (es schliesst
 * faellige Kuendigungen ab). Ein Blick auf die Empfaengerzahl veraenderte damit
 * Abos.
 *
 * Jetzt liest EINE Abfrage die Fakten fuer bis zu 1000 Nutzer, und dieselben
 * reinen Funktionen wie ueberall entscheiden:
 *   - `effektiverPlan`    — die Tarifregel aus `getUserAndPlan` (userService.js)
 *   - `kuendigungFaellig` — dieselbe Faelligkeit, nur ohne zu schreiben
 *   - `entryVisibleForUser` — dieselbe Zielgruppenregel wie in der App
 * Die Abfrage spiegelt die Lesewege von `getUserAndPlan` (Mitgliedschaft der
 * aktiven Organisation, sonst die aelteste; juengstes Abo). Gepinnt von
 * `api/test/produktUpdateVersand.test.js`, gegen die echte Datenbank verglichen
 * in `api/test/integration/produktUpdateEmpfaenger.flow.test.js`.
 *
 * NICHT angeschrieben wird, wer nichts empfangen kann oder soll: Demo-Konten
 * (ihre Mails unterdrueckt `sendMail` ohnehin — sie zaehlten bisher trotzdem als
 * Empfaenger), anonymisierte Konten (Platzhalter-Adresse unter
 * `ANONYM_DOMAIN`), inaktive Konten und Konten ohne Adresse.
 */
const EMPFAENGER_SEITE = 1000;

export const EMPFAENGER_SQL = `
  SELECT u.id, u.role, u.is_demo,
         m.role_key AS org_role, m.org_plan, m.pilot_status,
         s.plan AS abo_plan, s.status AS abo_status, s.cancel_at AS abo_cancel_at,
         (u.role = 'admin' OR EXISTS (
            SELECT 1 FROM org_memberships pa
             WHERE pa.user_id = u.id AND pa.is_active = TRUE AND pa.role_key = 'platform_admin'
         )) AS intern,
         (np.user_id IS NOT NULL) AS abgemeldet
    FROM users u
    LEFT JOIN LATERAL (
      SELECT om.role_key, o.plan AS org_plan, o.pilot_status
        FROM org_memberships om
        JOIN organizations o ON o.id = om.org_id
       WHERE om.user_id = u.id AND om.is_active = TRUE
         AND (u.org_id IS NULL OR om.org_id = u.org_id)
       ORDER BY om.created_at ASC
       LIMIT 1
    ) m ON TRUE
    LEFT JOIN LATERAL (
      SELECT sub.plan, sub.status, sub.cancel_at
        FROM subscriptions sub
       WHERE sub.user_id = u.id
       ORDER BY sub.created_at DESC
       LIMIT 1
    ) s ON TRUE
    LEFT JOIN notification_preferences np
      ON np.user_id = u.id AND np.event_category = $1 AND np.channel_email = FALSE
   WHERE u.email IS NOT NULL AND TRIM(u.email) <> ''
     AND u.email NOT ILIKE $2
     AND u.role NOT IN ('inactive')
     AND COALESCE(u.is_demo, FALSE) = FALSE
     AND ($3::uuid IS NULL OR u.id > $3::uuid)
   ORDER BY u.id
   LIMIT $4`;

/**
 * Der Kontext eines Nutzers aus einer Zeile von `EMPFAENGER_SQL` — dieselbe
 * Form, die `loadReleaseContext` liefert. REINE FUNKTION.
 */
export function kontextAusZeile(z, jetzt = new Date()) {
  const aboPlan = kuendigungFaellig({ status: z.abo_status, cancel_at: z.abo_cancel_at }, jetzt)
    ? "DEMO"
    : (z.abo_plan || "DEMO");
  const { plan } = effektiverPlan({
    orgPlan: z.org_plan || null,
    aboPlan,
    istDemo: z.is_demo,
    pilotStatus: z.pilot_status || null
  });
  return {
    userId: z.id,
    userRole: z.role || "company",
    orgRole: z.org_role || null,
    plan,
    isInternalViewer: z.intern === true
  };
}

/**
 * Wer eine Mitteilung per Mail bekaeme — fuer die Vorschau vor dem Klick UND fuer
 * den Versand, damit beide dieselbe Zahl meinen. Ein Entwurf wird bewertet, als
 * waere er veroeffentlicht (sonst saehe ihn nur das Team).
 *
 * Seitenweise ueber die Nutzerkennung (keyset), ohne Obergrenze: eine Seite
 * kostet EINE Abfrage, egal wie viele Nutzer darauf stehen.
 *
 * @returns {Promise<{empfaenger: string[], abgemeldet: number, nicht_in_zielgruppe: number}>}
 *   `empfaenger` sind Nutzerkennungen — die Adresse wird erst beim Versand gelesen.
 */
export async function ermittleEmpfaenger(pool, entry, { seite = EMPFAENGER_SEITE, jetzt = new Date() } = {}) {
  const alsVeroeffentlicht = {
    ...entry,
    status: "published",
    published_at: entry.status === "published" && entry.published_at ? entry.published_at : new Date(jetzt.getTime() - 1000)
  };
  const empfaenger = [];
  let abgemeldet = 0;
  let nichtInZielgruppe = 0;
  let nach = null;
  for (;;) {
    const { rows } = await pool.query(EMPFAENGER_SQL, [ABMELDE_KATEGORIE, `%@${ANONYM_DOMAIN}`, nach, seite]);
    for (const z of rows) {
      if (!entryVisibleForUser(alsVeroeffentlicht, kontextAusZeile(z, jetzt))) { nichtInZielgruppe++; continue; }
      if (z.abgemeldet) { abgemeldet++; continue; }
      empfaenger.push(String(z.id));
    }
    if (rows.length < seite) break;
    nach = rows[rows.length - 1].id;
  }
  return { empfaenger, abgemeldet, nicht_in_zielgruppe: nichtInZielgruppe };
}
