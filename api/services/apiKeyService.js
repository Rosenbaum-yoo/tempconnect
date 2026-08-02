/**
 * API Key Service: Org-scoped API key management.
 * Keys werden als SHA-256 Hash gespeichert, Klartext nur einmalig bei Erstellung zurueckgegeben.
 * Pattern analog zu integrationService.js (signing_secret).
 */

import crypto from "crypto";

const KEY_PREFIX = "tc_live_";

/* ── Scope-Katalog ─────────────────────────────────────── */

/**
 * Definierte API-Key-Scopes.
 * Basis-Scopes: read, write, admin (admin impliziert alle).
 * Granulare Scopes: resource:action fuer feingranulare Kontrolle.
 */
export const VALID_SCOPES = [
  // Basis
  "read",
  "write",
  "admin",
  // Granulare Resource-Scopes
  "read:requisitions",
  "write:requisitions",
  "read:timesheets",
  "write:timesheets",
  "read:workers",
  "write:workers",
  "read:invoices",
  "write:invoices",
  "read:assignments",
  "write:assignments",
  "read:audit",
  "read:capacity",
  "write:capacity",
  "admin:scim"   // SCIM 2.0 Nutzer-Provisioning (HR → Org-Mitgliedschaft), nur bei SCIM_ENABLED
];

/**
 * Gibt den Scope-Katalog als strukturierte Liste zurueck (fuer Frontend/Docs).
 * @returns {Array<{ key: string, label: string, category: string }>}
 */
export function getValidScopes() {
  return VALID_SCOPES.map(s => ({
    key: s,
    label: s,
    category: s.includes(":") ? "granular" : "base"
  }));
}

/**
 * Validiert Scopes gegen den Katalog.
 * @param {string[]} scopes
 * @returns {{ valid: boolean, invalid: string[] }}
 */
export function validateScopes(scopes) {
  if (!Array.isArray(scopes)) return { valid: false, invalid: [] };
  const invalid = scopes.filter(s => !VALID_SCOPES.includes(s));
  return { valid: invalid.length === 0, invalid };
}

/**
 * Prueft ob ein gegebener Scope-Satz einen benoetigten Scope abdeckt.
 * admin impliziert alle Scopes. write impliziert read. Granulare Scopes ueberschreiben.
 * @param {string[]} granted - Zugewiesene Scopes
 * @param {string} required - Benoetigter Scope
 * @returns {boolean}
 */
export function hasScope(granted, required) {
  if (!granted || !granted.length) return false;
  // admin = Vollzugriff
  if (granted.includes("admin")) return true;
  // Exakter Match
  if (granted.includes(required)) return true;
  // write impliziert read (Basis-Level)
  if (required === "read" && granted.includes("write")) return true;
  // Granularer Check: write:X impliziert read:X
  if (required.startsWith("read:")) {
    const resource = required.slice(5);
    if (granted.includes(`write:${resource}`)) return true;
  }
  // Basis-Scope deckt granulare ab: "read" deckt "read:*" ab
  if (required.startsWith("read:") && granted.includes("read")) return true;
  if (required.startsWith("write:") && granted.includes("write")) return true;
  return false;
}

/* ── Key Generation ──────────────────────────────────────── */

/**
 * Erzeugt einen kryptographisch sicheren API-Key.
 * Format: tc_live_<64 hex chars> (32 bytes random)
 * @returns {{ key: string, prefix: string, hash: string }}
 */
export function generateApiKey() {
  const random = crypto.randomBytes(32).toString("hex");
  const key = `${KEY_PREFIX}${random}`;
  const prefix = key.slice(0, 16); // tc_live_ + 8 hex chars
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  return { key, prefix, hash };
}

/**
 * SHA-256 Hash eines Keys berechnen (fuer Lookup).
 * @param {string} key
 * @returns {string}
 */
export function hashKey(key) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/* ── CRUD ─────────────────────────────────────────────── */

/**
 * Erstellt einen neuen API-Key fuer eine Organisation.
 * Der Klartext-Key wird NUR in der Erstellungs-Response zurueckgegeben.
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @param {{ label?: string, scopes?: string[], expires_at?: string, created_by?: string }} data
 * @returns {Promise<Object>} Ergebnis mit einmaligem key-Feld
 */
export async function createApiKey(pool, orgId, data = {}) {
  const { key, prefix, hash } = generateApiKey();

  const { rows } = await pool.query(
    `INSERT INTO org_api_keys (org_id, label, key_prefix, key_hash, scopes, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, org_id, label, key_prefix, scopes, is_active, expires_at, created_by, created_at`,
    [
      orgId,
      data.label || "",
      prefix,
      hash,
      data.scopes || [],
      data.expires_at || null,
      data.created_by || null
    ]
  );

  // Key nur einmalig zurueckgeben — danach nie wieder abrufbar
  return { ...rows[0], key };
}

/**
 * Listet alle API-Keys einer Organisation (ohne Hash, ohne Klartext).
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @returns {Promise<Array>}
 */
export async function listApiKeys(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT ak.id, ak.org_id, ak.label, ak.key_prefix,
            ak.scopes, ak.is_active, ak.last_used_at, ak.expires_at,
            ak.created_at, ak.updated_at,
            u.email AS created_by_email
     FROM org_api_keys ak
     LEFT JOIN users u ON u.id = ak.created_by
     WHERE ak.org_id = $1
     ORDER BY ak.created_at DESC`,
    [orgId]
  );
  return rows;
}

/**
 * Einzelnen API-Key abrufen (Org-Boundary geprueft).
 * @param {import('pg').Pool} pool
 * @param {string} keyId
 * @param {string} orgId
 * @returns {Promise<Object|null>}
 */
export async function getApiKey(pool, keyId, orgId) {
  const { rows } = await pool.query(
    `SELECT id, org_id, label, key_prefix, scopes, is_active, last_used_at, expires_at, created_by, created_at
     FROM org_api_keys WHERE id = $1 AND org_id = $2`,
    [keyId, orgId]
  );
  return rows[0] || null;
}

/**
 * API-Key widerrufen (Soft-Delete).
 * @param {import('pg').Pool} pool
 * @param {string} keyId
 * @param {string} orgId
 * @returns {Promise<boolean>}
 */
export async function revokeApiKey(pool, keyId, orgId) {
  const { rowCount } = await pool.query(
    `UPDATE org_api_keys SET is_active = FALSE, updated_at = NOW()
     WHERE id = $1 AND org_id = $2 AND is_active = TRUE`,
    [keyId, orgId]
  );
  return rowCount > 0;
}

/**
 * Last-Used-Timestamp aktualisieren (fuer zukuenftige API-Key-Auth).
 * @param {import('pg').Pool} pool
 * @param {string} keyId
 */
export async function touchLastUsed(pool, keyId) {
  await pool.query(
    `UPDATE org_api_keys SET last_used_at = NOW() WHERE id = $1`,
    [keyId]
  );
}

/**
 * Zaehlt aktive API-Keys einer Organisation.
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @returns {Promise<number>}
 */
export async function countActiveKeys(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM org_api_keys WHERE org_id = $1 AND is_active = TRUE`,
    [orgId]
  );
  return rows[0]?.cnt || 0;
}

/* ── Rotation ──────────────────────────────────────── */

/**
 * Rotiert einen API-Key atomar in einer Transaktion:
 * 1. Alten Key verifizieren + revoken
 * 2. Neuen Key mit gleichen Scopes/Label erstellen
 * Der neue Klartext-Key wird einmalig zurueckgegeben.
 *
 * @param {import('pg').Pool} pool
 * @param {string} keyId - ID des zu rotierenden Keys
 * @param {string} orgId - Org-Boundary
 * @param {{ created_by?: string }} opts
 * @returns {Promise<{ old_key_id: string, new_key: Object } | null>}
 */
export async function rotateApiKey(pool, keyId, orgId, opts = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Alten Key laden + sperren
    const { rows: oldRows } = await client.query(
      `SELECT id, label, scopes, expires_at
       FROM org_api_keys WHERE id = $1 AND org_id = $2 AND is_active = TRUE
       FOR UPDATE`,
      [keyId, orgId]
    );
    if (!oldRows.length) {
      await client.query("ROLLBACK");
      return null;
    }
    const oldKey = oldRows[0];

    // 2. Alten Key revoken
    await client.query(
      `UPDATE org_api_keys SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
      [keyId]
    );

    // 3. Neuen Key erstellen (Label + Scopes uebernehmen)
    const { key, prefix, hash } = generateApiKey();
    const { rows: newRows } = await client.query(
      `INSERT INTO org_api_keys (org_id, label, key_prefix, key_hash, scopes, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, org_id, label, key_prefix, scopes, is_active, expires_at, created_by, created_at`,
      [orgId, oldKey.label, prefix, hash, oldKey.scopes, oldKey.expires_at, opts.created_by || null]
    );

    await client.query("COMMIT");
    return { old_key_id: keyId, new_key: { ...newRows[0], key } };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/* ── Key Lookup (fuer Auth-Middleware) ──────────────── */

/**
 * Sucht einen aktiven API-Key anhand seines SHA-256 Hashes.
 * Fuer die API-Key-Auth-Middleware.
 * @param {import('pg').Pool} pool
 * @param {string} keyHash
 * @returns {Promise<Object|null>}
 */
export async function lookupByHash(pool, keyHash) {
  const { rows } = await pool.query(
    `SELECT id, org_id, scopes, is_active, expires_at, created_by
     FROM org_api_keys
     WHERE key_hash = $1 AND is_active = TRUE`,
    [keyHash]
  );
  const row = rows[0] || null;
  if (!row) return null;
  // Ablauf-Check
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
  return row;
}

/**
 * Schlaegt einen aktiven, nicht abgelaufenen API-Key per ID nach (fuer die M2M-JWT-Re-Validierung:
 * ein ausgestelltes Token muss bei jedem Request gegen den aktuellen Key-Status geprueft werden,
 * damit Revoke/Rotation/Ablauf sofort greifen — nicht erst bei JWT-exp). → Row oder null.
 * @param {import('pg').Pool} pool
 * @param {string} keyId
 * @returns {Promise<Object|null>}
 */
export async function lookupById(pool, keyId) {
  if (!keyId) return null;
  const { rows } = await pool.query(
    `SELECT id, org_id, scopes, is_active, expires_at, created_by
     FROM org_api_keys
     WHERE id = $1 AND is_active = TRUE`,
    [keyId]
  );
  const row = rows[0] || null;
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
  return row;
}
