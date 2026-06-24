/**
 * erpMappingService — CRUD für org_erp_mappings (Konnektor-Registry SAP/HR/Lohn).
 * Alle Operationen sind org-scoped (Isolation im Service-Layer, wie integrationService).
 * Spätere Konnektoren (Welle C: DATEV/SAP/zvoove) lesen hier, WOHIN + in WELCHEM Format
 * Daten gehen. Reiner Datenzugriff — keine externe IO hier.
 */

export const ERP_SYSTEM_TYPES = [
  "sap_successfactors",
  "sap_hcm",
  "datev",
  "zvoove",
  "personio",
  "generic"
];

export const ERP_STATUSES = ["active", "paused", "disabled"];

/** Listet alle ERP-Mappings einer Org (neueste zuerst). */
export async function listMappings(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT id, org_id, system_type, external_client_id, label, endpoint_url,
            sync_config, status, last_sync_at, last_error, created_at, updated_at
       FROM org_erp_mappings
      WHERE org_id = $1
      ORDER BY created_at DESC`,
    [orgId]
  );
  return rows;
}

/** Einzelnes Mapping (org-scoped) oder null. */
export async function getMapping(pool, id, orgId) {
  const { rows } = await pool.query(
    `SELECT * FROM org_erp_mappings WHERE id = $1 AND org_id = $2`,
    [id, orgId]
  );
  return rows[0] || null;
}

/**
 * Legt ein neues Mapping an. Eindeutig je (org, system_type) — bei Verstoß wirft
 * Postgres 23505 (Route mappt → 409). sync_config wird als JSONB gespeichert.
 */
export async function createMapping(pool, orgId, data) {
  const { rows } = await pool.query(
    `INSERT INTO org_erp_mappings (org_id, system_type, external_client_id, label, endpoint_url, sync_config, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, COALESCE($7,'active'), $8)
     RETURNING id, org_id, system_type, external_client_id, label, endpoint_url,
               sync_config, status, last_sync_at, last_error, created_at, updated_at`,
    [
      orgId,
      data.system_type,
      data.external_client_id || null,
      data.label || "",
      data.endpoint_url || null,
      JSON.stringify(data.sync_config || {}),
      data.status || null,
      data.created_by || null
    ]
  );
  return rows[0];
}

/**
 * Aktualisiert ein Mapping (org-scoped, partielles Update). Gibt die aktualisierte Zeile
 * oder null zurück (nicht gefunden / org-fremd). Nur erlaubte Felder werden gesetzt.
 */
export async function updateMapping(pool, id, orgId, data) {
  const sets = [];
  const params = [];
  let i = 1;
  const allow = {
    external_client_id: (v) => v,
    label: (v) => v,
    endpoint_url: (v) => v,
    status: (v) => v
  };
  for (const [key, fn] of Object.entries(allow)) {
    if (data[key] !== undefined) {
      sets.push(`${key} = $${i++}`);
      params.push(fn(data[key]));
    }
  }
  if (data.sync_config !== undefined) {
    sets.push(`sync_config = $${i++}::jsonb`);
    params.push(JSON.stringify(data.sync_config || {}));
  }
  if (sets.length === 0) {
    return getMapping(pool, id, orgId);
  }
  sets.push("updated_at = NOW()");
  params.push(id, orgId);
  const { rows } = await pool.query(
    `UPDATE org_erp_mappings SET ${sets.join(", ")}
      WHERE id = $${i++} AND org_id = $${i}
      RETURNING id, org_id, system_type, external_client_id, label, endpoint_url,
                sync_config, status, last_sync_at, last_error, created_at, updated_at`,
    params
  );
  return rows[0] || null;
}

/** Löscht ein Mapping (org-scoped). true wenn gelöscht. */
export async function deleteMapping(pool, id, orgId) {
  const { rowCount } = await pool.query(
    `DELETE FROM org_erp_mappings WHERE id = $1 AND org_id = $2`,
    [id, orgId]
  );
  return rowCount > 0;
}
