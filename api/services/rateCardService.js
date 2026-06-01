/**
 * Rate Card Service — VMS-Governance-Schicht für verbindliche Stundensätze.
 *
 * Kernlogik:
 *   - CRUD für Rate Cards (draft → active → expired/archived)
 *   - Spezifitäts-basierter Lookup (Location > Region > Global, Vendor > Wildcard)
 *   - Ist-vs-Soll Compliance-Check (compliant / warning / non_compliant)
 *   - Batch-Expiry für abgelaufene Cards
 */

import { assertLocationBelongsToOrg, assertDepartmentBelongsToOrg } from "../utils/orgBoundary.js";

function appendRateCardWindowFilters(where, params, filters = {}, alias = "rc") {
  if (filters.dateFrom && filters.dateTo) {
    params.push(filters.dateFrom);
    const fromIdx = params.length;
    params.push(filters.dateTo);
    const toIdx = params.length;
    where.push(`${alias}.valid_from <= $${toIdx}::date`);
    where.push(`COALESCE(${alias}.valid_to, $${toIdx}::date) >= $${fromIdx}::date`);
    return;
  }
  if (filters.dateFrom) {
    params.push(filters.dateFrom);
    const fromIdx = params.length;
    where.push(`COALESCE(${alias}.valid_to, $${fromIdx}::date) >= $${fromIdx}::date`);
    return;
  }
  if (filters.dateTo) {
    params.push(filters.dateTo);
    const toIdx = params.length;
    where.push(`${alias}.valid_from <= $${toIdx}::date`);
  }
}

function appendRateCardScopeFilters(where, params, filters = {}, alias = "rc") {
  if (filters.status) {
    params.push(filters.status);
    where.push(`${alias}.status = $${params.length}`);
  }
  if (filters.roleCategory) {
    params.push(`%${filters.roleCategory}%`);
    where.push(`${alias}.role_category ILIKE $${params.length}`);
  }
  if (filters.region) {
    params.push(`%${filters.region}%`);
    where.push(`${alias}.region ILIKE $${params.length}`);
  }
  if (filters.supplierOrgId) {
    params.push(filters.supplierOrgId);
    where.push(`${alias}.supplier_org_id = $${params.length}`);
  }
  appendRateCardWindowFilters(where, params, filters, alias);
}

function appendRateCardComplianceFilter(where, params, filters = {}, { cardAlias = "rc", checksAlias = "rcc", mode = "exists" } = {}) {
  if (!filters.complianceStatus) return;
  if (mode === "direct") {
    if (filters.complianceStatus === "at_risk") {
      where.push(`${checksAlias}.compliance_status IN ('warning', 'non_compliant')`);
      return;
    }
    params.push(filters.complianceStatus);
    where.push(`${checksAlias}.compliance_status = $${params.length}`);
    return;
  }
  if (filters.complianceStatus === "at_risk") {
    where.push(`EXISTS (
      SELECT 1
      FROM rate_card_checks ${checksAlias}
      WHERE ${checksAlias}.rate_card_id = ${cardAlias}.id
        AND ${checksAlias}.org_id = $1
        AND ${checksAlias}.checked_at >= NOW() - INTERVAL '30 days'
        AND ${checksAlias}.compliance_status IN ('warning', 'non_compliant')
    )`);
    return;
  }
  params.push(filters.complianceStatus);
  where.push(`EXISTS (
    SELECT 1
    FROM rate_card_checks ${checksAlias}
    WHERE ${checksAlias}.rate_card_id = ${cardAlias}.id
      AND ${checksAlias}.org_id = $1
      AND ${checksAlias}.checked_at >= NOW() - INTERVAL '30 days'
      AND ${checksAlias}.compliance_status = $${params.length}
  )`);
}

/* ── CRUD ──────────────────────────────────────────────────────────────────── */

/**
 * Create a new Rate Card (status: draft).
 * @param {import('pg').Pool} pool
 * @param {object} data
 * @returns {Promise<object>} Created rate card row
 */
export async function createRateCard(pool, data) {
  const {
    orgId, supplierOrgId = null, contractId = null,
    roleCategory, region = null, locationId = null, departmentId = null,
    minRateCents = null, targetRateCents, maxRateCents,
    currency = "EUR", overtimeSurchargePct = 25.0, emergencySurchargePct = 0,
    validFrom, validTo = null, notes = null, createdBy = null
  } = data;

  // Org-Boundary: Standort und Abteilung muessen zur eigenen Org gehoeren.
  await assertLocationBelongsToOrg(pool, locationId, orgId);
  await assertDepartmentBelongsToOrg(pool, departmentId, orgId);

  const { rows: [row] } = await pool.query(
    `INSERT INTO rate_cards (
       org_id, supplier_org_id, contract_id,
       role_category, region, location_id, department_id,
       min_rate_cents, target_rate_cents, max_rate_cents,
       currency, overtime_surcharge_pct, emergency_surcharge_pct,
       valid_from, valid_to, notes, created_by, updated_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
     RETURNING *`,
    [
      orgId, supplierOrgId, contractId,
      roleCategory, region, locationId, departmentId,
      minRateCents, targetRateCents, maxRateCents,
      currency, overtimeSurchargePct, emergencySurchargePct,
      validFrom, validTo, notes, createdBy
    ]
  );
  return row;
}

/**
 * Update an existing Rate Card (allowed fields only).
 */
export async function updateRateCard(pool, id, data, actorId) {
  const allowed = [
    "role_category", "region", "location_id", "department_id",
    "supplier_org_id", "contract_id",
    "min_rate_cents", "target_rate_cents", "max_rate_cents",
    "currency", "overtime_surcharge_pct", "emergency_surcharge_pct",
    "valid_from", "valid_to", "notes"
  ];
  const sets = [];
  const params = [];
  let idx = 1;

  for (const key of allowed) {
    if (data[key] !== undefined) {
      sets.push(`${key} = $${idx}`);
      params.push(data[key]);
      idx++;
    }
  }
  if (sets.length === 0) return getRateCard(pool, id);

  sets.push(`updated_by = $${idx}`);
  params.push(actorId);
  idx++;
  sets.push(`updated_at = NOW()`);

  params.push(id);
  const { rows: [row] } = await pool.query(
    `UPDATE rate_cards SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    params
  );
  return row || null;
}

/**
 * Get a single Rate Card by ID with joined metadata.
 */
export async function getRateCard(pool, id) {
  const { rows: [row] } = await pool.query(
    `SELECT rc.*,
            o.name  AS org_name,
            so.name AS supplier_name,
            ol.name AS location_name,
            ol.city AS location_city,
            od.name AS department_name,
            c.title AS contract_title
     FROM rate_cards rc
     LEFT JOIN organizations o  ON o.id  = rc.org_id
     LEFT JOIN organizations so ON so.id = rc.supplier_org_id
     LEFT JOIN org_locations ol ON ol.id = rc.location_id
     LEFT JOIN org_departments od ON od.id = rc.department_id
     LEFT JOIN contracts c      ON c.id  = rc.contract_id
     WHERE rc.id = $1`,
    [id]
  );
  return row || null;
}

/**
 * List Rate Cards for an org with optional filters.
 */
export async function listRateCards(pool, orgId, filters = {}) {
  const params = [orgId];
  const where = ["rc.org_id = $1"];
  appendRateCardScopeFilters(where, params, filters, "rc");
  appendRateCardComplianceFilter(where, params, filters, { cardAlias: "rc", checksAlias: "rcc", mode: "exists" });

  const countParams = params.slice();

  const limit = Math.min(filters.limit || 100, 500);
  const offset = filters.offset || 0;
  params.push(limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const { rows } = await pool.query(
    `SELECT rc.*,
            so.name AS supplier_name,
            ol.name AS location_name,
            od.name AS department_name
     FROM rate_cards rc
     LEFT JOIN organizations so ON so.id = rc.supplier_org_id
     LEFT JOIN org_locations ol ON ol.id = rc.location_id
     LEFT JOIN org_departments od ON od.id = rc.department_id
     WHERE ${where.join(" AND ")}
     ORDER BY rc.status = 'active' DESC, rc.role_category ASC, rc.valid_from DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  // Total count
  const { rows: [countRow] } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM rate_cards rc WHERE ${where.join(" AND ")}`,
    countParams
  );

  return { items: rows, total: countRow?.total || 0 };
}

/* ── Lifecycle ─────────────────────────────────────────────────────────────── */

/**
 * Activate a draft Rate Card.
 */
export async function activateRateCard(pool, id, actorId) {
  const { rows: [row] } = await pool.query(
    `UPDATE rate_cards
     SET status = 'active', updated_by = $2, updated_at = NOW()
     WHERE id = $1 AND status = 'draft'
     RETURNING *`,
    [id, actorId]
  );
  return row || null;
}

/**
 * Archive an active Rate Card.
 */
export async function archiveRateCard(pool, id, actorId) {
  const { rows: [row] } = await pool.query(
    `UPDATE rate_cards
     SET status = 'archived', updated_by = $2, updated_at = NOW()
     WHERE id = $1 AND status IN ('draft', 'active')
     RETURNING *`,
    [id, actorId]
  );
  return row || null;
}

/**
 * Batch-expire cards whose valid_to is in the past.
 * Designed for cron / scheduled job.
 * @returns {number} Count of expired cards
 */
export async function expireBatch(pool) {
  const { rowCount } = await pool.query(
    `UPDATE rate_cards
     SET status = 'expired', updated_at = NOW()
     WHERE status = 'active'
       AND valid_to IS NOT NULL
       AND valid_to < CURRENT_DATE`
  );
  return rowCount || 0;
}

/* ── Spezifitäts-Lookup ───────────────────────────────────────────────────── */

/**
 * Find the most specific active Rate Card for a given context.
 *
 * Priority (highest → lowest):
 *   1. Vendor-specific + Location-specific
 *   2. Vendor-specific + Region-match
 *   3. Vendor-specific + Global (no location/region)
 *   4. Wildcard-Vendor + Location-specific
 *   5. Wildcard-Vendor + Region-match
 *   6. Wildcard-Vendor + Global
 *
 * @param {import('pg').Pool} pool
 * @param {object} params
 * @returns {Promise<object|null>} Most specific rate card, or null
 */
export async function findApplicableRateCard(pool, {
  orgId, supplierOrgId = null, role, region = null, locationId = null, date = null
}) {
  const effectiveDate = date || new Date().toISOString().slice(0, 10);
  const params = [orgId, role, effectiveDate];
  let idx = 4;

  // Build optional clauses
  const supplierClause = supplierOrgId
    ? `CASE WHEN rc.supplier_org_id = $${idx} THEN 2 ELSE 1 END`
    : `1`;
  if (supplierOrgId) { params.push(supplierOrgId); idx++; }

  const locationClause = locationId
    ? `CASE WHEN rc.location_id = $${idx} THEN 3 WHEN rc.region IS NOT NULL THEN 2 ELSE 1 END`
    : `CASE WHEN rc.region IS NOT NULL THEN 2 ELSE 1 END`;
  if (locationId) { params.push(locationId); idx++; }

  // Region matching (ILIKE for flexible city/state matching)
  let regionWhere = "";
  if (region) {
    params.push(`%${region}%`);
    regionWhere = `AND (rc.region IS NULL OR rc.region ILIKE $${idx})`;
    idx++;
  }

  // Supplier filter: match specific vendor OR wildcard (NULL)
  let supplierWhere = "";
  if (supplierOrgId) {
    supplierWhere = `AND (rc.supplier_org_id IS NULL OR rc.supplier_org_id = $${params.indexOf(supplierOrgId) + 1})`;
  }

  // Location filter: match specific location OR no location constraint
  let locationWhere = "";
  if (locationId) {
    locationWhere = `AND (rc.location_id IS NULL OR rc.location_id = $${params.indexOf(locationId) + 1})`;
  }

  const { rows: [row] } = await pool.query(
    `SELECT rc.*
     FROM rate_cards rc
     WHERE rc.org_id = $1
       AND rc.role_category ILIKE $2
       AND rc.status = 'active'
       AND rc.valid_from <= $3::date
       AND (rc.valid_to IS NULL OR rc.valid_to >= $3::date)
       ${supplierWhere}
       ${locationWhere}
       ${regionWhere}
     ORDER BY
       ${supplierClause} DESC,
       ${locationClause} DESC,
       rc.valid_from DESC
     LIMIT 1`,
    params
  );
  return row || null;
}

/* ── Compliance Check ─────────────────────────────────────────────────────── */

/**
 * Check a rate against the applicable Rate Card.
 *
 * Classification:
 *   - compliant:     actual ≤ target
 *   - warning:       actual > target AND actual ≤ max
 *   - non_compliant: actual > max
 *   - no_card:       no applicable rate card found (not persisted)
 *
 * @returns {Promise<object>} Compliance result
 */
export async function checkRateCompliance(pool, {
  orgId, supplierOrgId = null, role, region = null, locationId = null,
  actualRateCents, entityType = null, entityId = null, checkedBy = null,
  persist = true
}) {
  const card = await findApplicableRateCard(pool, {
    orgId, supplierOrgId, role, region, locationId
  });

  if (!card) {
    return {
      compliance_status: "no_card",
      rate_card: null,
      actual_rate_cents: actualRateCents,
      message: "Keine Rate Card für diese Kombination gefunden."
    };
  }

  const target = card.target_rate_cents;
  const max = card.max_rate_cents;
  const deviationCents = actualRateCents - target;
  const deviationPct = target > 0
    ? Math.round((deviationCents / target) * 10000) / 100
    : 0;

  let complianceStatus;
  if (actualRateCents <= target) {
    complianceStatus = "compliant";
  } else if (actualRateCents <= max) {
    complianceStatus = "warning";
  } else {
    complianceStatus = "non_compliant";
  }

  const result = {
    compliance_status: complianceStatus,
    rate_card_id: card.id,
    rate_card: {
      id: card.id,
      role_category: card.role_category,
      region: card.region,
      target_rate_cents: target,
      max_rate_cents: max,
      min_rate_cents: card.min_rate_cents,
      supplier_org_id: card.supplier_org_id
    },
    actual_rate_cents: actualRateCents,
    target_rate_cents: target,
    max_rate_cents: max,
    deviation_cents: deviationCents,
    deviation_pct: deviationPct
  };

  // Persist check result if entity context provided
  if (persist && entityType && entityId) {
    try {
      const { rows: [check] } = await pool.query(
        `INSERT INTO rate_card_checks (
           rate_card_id, org_id, entity_type, entity_id,
           actual_rate_cents, target_rate_cents, max_rate_cents,
           compliance_status, deviation_cents, deviation_pct,
           role_category, supplier_org_id, checked_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
        [
          card.id, orgId, entityType, entityId,
          actualRateCents, target, max,
          complianceStatus, deviationCents, deviationPct,
          card.role_category, supplierOrgId, checkedBy
        ]
      );
      result.check_id = check?.id || null;
    } catch {
      // Non-critical: compliance check persistence failure should not block
    }
  }

  return result;
}

/* ── Dashboard KPIs ───────────────────────────────────────────────────────── */

/**
 * Rate Card statistics for an org.
 */
export async function getRateCardStats(pool, orgId, filters = {}) {
  const statsParams = [orgId];
  const statsWhere = ["rc.org_id = $1"];
  appendRateCardScopeFilters(statsWhere, statsParams, filters, "rc");
  appendRateCardComplianceFilter(statsWhere, statsParams, filters, { cardAlias: "rc", checksAlias: "rcc", mode: "exists" });
  const complianceParams = [orgId];
  const complianceWhere = ["rcc.org_id = $1", "rcc.checked_at >= NOW() - INTERVAL '30 days'"];
  appendRateCardScopeFilters(complianceWhere, complianceParams, filters, "rc");
  appendRateCardComplianceFilter(complianceWhere, complianceParams, filters, { cardAlias: "rc", checksAlias: "rcc", mode: "direct" });

  const { rows: [stats] } = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE rc.status = 'active')::int AS active,
       COUNT(*) FILTER (WHERE rc.status = 'draft')::int AS draft,
       COUNT(*) FILTER (WHERE rc.status = 'expired')::int AS expired,
       COUNT(*) FILTER (WHERE rc.status = 'archived')::int AS archived,
       COUNT(DISTINCT rc.role_category)::int AS role_categories,
       COUNT(DISTINCT rc.supplier_org_id) FILTER (WHERE rc.supplier_org_id IS NOT NULL)::int AS vendor_specific
     FROM rate_cards rc
     WHERE ${statsWhere.join(" AND ")}`,
    statsParams
  );

  // Recent compliance checks
  const { rows: [compliance] } = await pool.query(
    `SELECT
       COUNT(*)::int AS total_checks,
       COUNT(*) FILTER (WHERE compliance_status = 'compliant')::int AS compliant,
       COUNT(*) FILTER (WHERE compliance_status = 'warning')::int AS warnings,
       COUNT(*) FILTER (WHERE compliance_status = 'non_compliant')::int AS non_compliant
     FROM rate_card_checks rcc
     JOIN rate_cards rc ON rc.id = rcc.rate_card_id
     WHERE ${complianceWhere.join(" AND ")}`,
    complianceParams
  );

  return { cards: stats || {}, compliance_30d: compliance || {} };
}
