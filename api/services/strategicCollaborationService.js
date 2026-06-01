/**
 * Strategic Collaboration Service
 * Captures qualified B2B cooperation interest leads (no contract closure).
 */
import * as companyProfileService from "./companyProfileService.js";

const OPEN_STATUSES = new Set(["eingegangen", "rueckfrage_offen", "angebot_erstellt", "bestaetigt", "aktiviert"]);
export const ALLOWED_STATUSES = [
  "eingegangen",
  "rueckfrage_offen",
  "angebot_erstellt",
  "bestaetigt",
  "aktiviert",
  "abgelehnt",
  "abgeschlossen"
];

export async function computeEligibility(pool, user, orgId) {
  if (!user) return { allowed: false, code: "NOT_AUTHENTICATED", reasons: ["Anmeldung erforderlich."] };
  if (!orgId) return { allowed: false, code: "ORG_REQUIRED", reasons: ["Nur verknuepfte Organisationen koennen strategische Anfragen stellen."] };

  const plan = String(user.plan || "DEMO");
  const trustedPlan = plan === "PRO" || plan === "ENTERPRISE";
  const profile = await companyProfileService.computeCompleteness(pool, user.id).catch(() => ({ percentage: 0 }));
  const profileOk = Number(profile?.percentage || 0) >= 60;
  const verified = user.is_verified === true;

  if (verified || (trustedPlan && profileOk)) {
    return {
      allowed: true,
      code: "ALLOWED",
      reasons: [],
      trust_signals: { verified, trusted_plan: trustedPlan, profile_percentage: Number(profile?.percentage || 0), plan }
    };
  }

  return {
    allowed: false,
    code: "TRUST_THRESHOLD_NOT_MET",
    reasons: [
      "Freigabe ab verifiziertem Konto oder ab PRO/Individueller Tarif mit ausreichender Profilqualitaet (>= 60%)."
    ],
    trust_signals: { verified, trusted_plan: trustedPlan, profile_percentage: Number(profile?.percentage || 0), plan }
  };
}

export async function createInterest(pool, input) {
  const burst = await pool.query(
    `SELECT COUNT(*)::int AS cnt
       FROM strategic_collaboration_requests
      WHERE requester_user_id = $1
        AND created_at > NOW() - INTERVAL '10 minutes'`,
    [input.requester_user_id]
  );
  if (Number(burst.rows[0]?.cnt || 0) >= 3) {
    const err = new Error("RATE_LIMITED");
    err.code = "RATE_LIMITED";
    throw err;
  }

  const duplicate = await pool.query(
    `SELECT id
       FROM strategic_collaboration_requests
      WHERE requester_org_id = $1
        AND COALESCE(target_org_id::text, '') = COALESCE($2::text, '')
        AND source_context = $3
        AND status = ANY($4::text[])
        AND created_at > NOW() - INTERVAL '7 days'
      LIMIT 1`,
    [input.requester_org_id, input.target_org_id || null, input.source_context, Array.from(OPEN_STATUSES)]
  );
  if (duplicate.rows[0]?.id) {
    const err = new Error("DUPLICATE_OPEN_REQUEST");
    err.code = "DUPLICATE_OPEN_REQUEST";
    err.existing_id = duplicate.rows[0].id;
    throw err;
  }

  const { rows } = await pool.query(
    `INSERT INTO strategic_collaboration_requests (
      requester_user_id, requester_org_id, target_user_id, target_org_id, source_context,
      requester_company_name, contact_name, contact_email, contact_phone,
      region_scope, site_count, expected_volume, needs_enterprise_multi_site,
      interest_enterprise_support, interest_framework_conditions, interest_strategic_cooperation,
      message, requested_modules, status
    ) VALUES (
      $1,$2,$3,$4,$5,
      $6,$7,$8,$9,
      $10,$11,$12,$13,
      $14,$15,$16,
      $17,$18::jsonb,'eingegangen'
    )
    RETURNING *`,
    [
      input.requester_user_id,
      input.requester_org_id,
      input.target_user_id || null,
      input.target_org_id || null,
      input.source_context,
      input.requester_company_name,
      input.contact_name,
      input.contact_email,
      input.contact_phone || null,
      input.region_scope || null,
      input.site_count || null,
      input.expected_volume || null,
      input.needs_enterprise_multi_site === true,
      input.interest_enterprise_support === true,
      input.interest_framework_conditions === true,
      input.interest_strategic_cooperation === true,
      input.message || null,
      JSON.stringify(input.requested_modules || [])
    ]
  );
  return rows[0];
}

export async function listRequests(pool, opts) {
  const limit = Math.min(200, Math.max(1, Number(opts.limit || 50)));
  const offset = Math.max(0, Number(opts.offset || 0));
  const params = [opts.org_id, limit, offset];
  const where = `WHERE (requester_org_id = $1 OR target_org_id = $1)`;
  const { rows } = await pool.query(
    `SELECT id, requester_user_id, requester_org_id, target_user_id, target_org_id,
            source_context, requester_company_name, contact_name, contact_email, contact_phone,
            region_scope, site_count, expected_volume, needs_enterprise_multi_site,
            interest_enterprise_support, interest_framework_conditions, interest_strategic_cooperation,
            message, requested_modules, status, status_updated_at, status_updated_by, created_at, updated_at
       FROM strategic_collaboration_requests
       ${where}
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
    params
  );
  return rows;
}

export async function updateStatus(pool, id, orgId, status, actorUserId) {
  const { rows } = await pool.query(
    `UPDATE strategic_collaboration_requests
        SET status = $3,
            status_updated_at = NOW(),
            status_updated_by = $4,
            updated_at = NOW()
      WHERE id = $1
        AND (requester_org_id = $2 OR target_org_id = $2)
      RETURNING id, requester_user_id, requester_org_id, target_user_id, target_org_id,
                source_context, requester_company_name, contact_name, contact_email, contact_phone,
                region_scope, site_count, expected_volume, needs_enterprise_multi_site,
                interest_enterprise_support, interest_framework_conditions, interest_strategic_cooperation,
                message, requested_modules, status, status_updated_at, status_updated_by, created_at, updated_at`,
    [id, orgId, status, actorUserId]
  );
  return rows[0] || null;
}

export async function listAllRequestsAdmin(pool, opts = {}) {
  const limit = Math.min(200, Math.max(1, Number(opts.limit || 50)));
  const offset = Math.max(0, Number(opts.offset || 0));
  const status = opts.status ? String(opts.status).trim() : null;

  const params = [];
  let where = "";
  if (status) {
    params.push(status);
    where = `WHERE scr.status = $${params.length}`;
  }
  params.push(limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const { rows } = await pool.query(
    `SELECT scr.*,
            assignee.contact_person AS assigned_to_name,
            assignee.email AS assigned_to_email,
            assignee.company_name AS assigned_to_company,
            assignee.role AS assigned_to_role
       FROM strategic_collaboration_requests scr
       LEFT JOIN users assignee ON assignee.id = scr.assigned_to_user_id
       ${where}
      ORDER BY scr.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );
  return rows;
}

export async function updateStatusAsAdmin(pool, id, status, actorUserId) {
  const { rows } = await pool.query(
    `UPDATE strategic_collaboration_requests
        SET status = $2,
            status_updated_at = NOW(),
            status_updated_by = $3,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [id, status, actorUserId]
  );
  return rows[0] || null;
}

export async function assignRequestAsAdmin(pool, id, assignedToUserId, actorUserId) {
  const { rows } = await pool.query(
    `UPDATE strategic_collaboration_requests
        SET assigned_to_user_id = $2,
            assigned_at = CASE WHEN $2 IS NULL THEN NULL ELSE NOW() END,
            assigned_by = CASE WHEN $2 IS NULL THEN NULL ELSE $3 END,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [id, assignedToUserId || null, actorUserId || null]
  );
  return rows[0] || null;
}

export async function updateOpsNotesAsAdmin(pool, id, notes) {
  const { rows } = await pool.query(
    `UPDATE strategic_collaboration_requests
        SET ops_notes = $2,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [id, notes || null]
  );
  return rows[0] || null;
}

/**
 * Persist a Konfigurator-Submission aus `/public/enterprise_anfrage.html`.
 *
 * Unterschied zu `createInterest`:
 *   - Erlaubt Public-Submissions (requester_user_id/org_id NULL).
 *   - Schreibt komplette Konfiguration (Plan, Addons, Seats, Schaetzungen,
 *     Adresse, Start, Audit-Kontext).
 *   - Burst-Limit per E-Mail/IP statt per User-Id.
 *   - Duplikat-Check per E-Mail in den letzten 24h fuer den `enterprise_config`
 *     request_type.
 *
 * Erwartet bereits validierten `input`. Validation passiert im Router (zod).
 *
 * @param {import('pg').Pool|import('pg').PoolClient} pool
 * @param {Object} input
 * @returns {Promise<Object>} Inserted row
 */
export async function createEnterpriseRequest(pool, input) {
  const requestType = input.request_type || "enterprise_config";
  const sourceContext = input.source_context || "enterprise_config";
  const contactEmail = String(input.contact_email || "").trim().toLowerCase();
  if (!contactEmail) {
    const err = new Error("CONTACT_EMAIL_REQUIRED");
    err.code = "CONTACT_EMAIL_REQUIRED";
    throw err;
  }

  // Burst-Limit (10 Min) — kombiniert Email + IP, damit weder eine Spam-IP
  // noch ein Spam-Account die Inbox flutet. User-basiertes Burst bleibt in
  // `createInterest` (auth-pflichtiger Pfad).
  const burst = await pool.query(
    `SELECT COUNT(*)::int AS cnt
       FROM strategic_collaboration_requests
      WHERE created_at > NOW() - INTERVAL '10 minutes'
        AND (
          LOWER(contact_email) = $1
          OR ($2::text IS NOT NULL AND submitted_ip = $2)
        )`,
    [contactEmail, input.submitted_ip || null]
  );
  if (Number(burst.rows[0]?.cnt || 0) >= 3) {
    const err = new Error("RATE_LIMITED");
    err.code = "RATE_LIMITED";
    throw err;
  }

  // Duplikat (24h) — gleiche E-Mail + offener Status -> 409
  const duplicate = await pool.query(
    `SELECT id
       FROM strategic_collaboration_requests
      WHERE LOWER(contact_email) = $1
        AND request_type = $2
        AND status = ANY($3::text[])
        AND created_at > NOW() - INTERVAL '24 hours'
      LIMIT 1`,
    [contactEmail, requestType, Array.from(OPEN_STATUSES)]
  );
  if (duplicate.rows[0]?.id) {
    const err = new Error("DUPLICATE_OPEN_REQUEST");
    err.code = "DUPLICATE_OPEN_REQUEST";
    err.existing_id = duplicate.rows[0].id;
    throw err;
  }

  const { rows } = await pool.query(
    `INSERT INTO strategic_collaboration_requests (
       requester_user_id, requester_org_id, target_user_id, target_org_id,
       source_context, request_type,
       requester_company_name, contact_name, contact_email, contact_phone,
       region_scope, site_count, expected_volume,
       needs_enterprise_multi_site, interest_enterprise_support,
       interest_framework_conditions, interest_strategic_cooperation,
       message, requested_modules,
       plan_requested, base_price_cents, seats_requested, seats_included,
       seat_price_cents, selected_addons,
       monthly_estimate_cents, onetime_estimate_cents,
       street, city, vat_id, expected_start_date,
       submitted_ip, submitted_user_agent, status
     ) VALUES (
       $1,$2,$3,$4,
       $5,$6,
       $7,$8,$9,$10,
       $11,$12,$13,
       $14,$15,
       $16,$17,
       $18,$19::jsonb,
       $20,$21,$22,$23,
       $24,$25::jsonb,
       $26,$27,
       $28,$29,$30,$31,
       $32,$33,'eingegangen'
     )
     RETURNING *`,
    [
      input.requester_user_id || null,
      input.requester_org_id || null,
      input.target_user_id || null,
      input.target_org_id || null,
      sourceContext,
      requestType,
      input.requester_company_name,
      input.contact_name,
      contactEmail,
      input.contact_phone || null,
      input.region_scope || null,
      input.site_count || null,
      input.expected_volume || null,
      input.needs_enterprise_multi_site === true,
      input.interest_enterprise_support !== false,
      input.interest_framework_conditions !== false,
      input.interest_strategic_cooperation !== false,
      input.message || null,
      JSON.stringify(input.requested_modules || []),
      input.plan_requested || null,
      Number.isFinite(input.base_price_cents) ? input.base_price_cents : null,
      Number.isFinite(input.seats_requested) ? input.seats_requested : null,
      Number.isFinite(input.seats_included) ? input.seats_included : null,
      Number.isFinite(input.seat_price_cents) ? input.seat_price_cents : null,
      JSON.stringify(input.selected_addons || []),
      Number.isFinite(input.monthly_estimate_cents) ? input.monthly_estimate_cents : null,
      Number.isFinite(input.onetime_estimate_cents) ? input.onetime_estimate_cents : null,
      input.street || null,
      input.city || null,
      input.vat_id || null,
      input.expected_start_date || null,
      input.submitted_ip || null,
      input.submitted_user_agent || null
    ]
  );
  return rows[0];
}
