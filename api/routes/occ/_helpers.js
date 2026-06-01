export function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function clampInt(value, min, max, fallback = min) {
  const n = toInt(value, fallback);
  return Math.min(max, Math.max(min, n));
}

export function parseBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if ([ "true", "1", "yes", "y", "on" ].includes(normalized)) return true;
  if ([ "false", "0", "no", "n", "off" ].includes(normalized)) return false;
  return fallback;
}

export function parseCsv(value) {
  if (value == null) return [];
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function toIsoOrNull(value) {
  if (!value) return null;
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}

export function maskEmail(email) {
  const raw = String(email || "").trim().toLowerCase();
  const at = raw.indexOf("@");
  if (at <= 0 || at === raw.length - 1) return null;
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  const first = local.slice(0, 1) || "x";
  return `${first}***@${domain}`;
}

export async function safeQuery(pool, sql, params = [], fallbackRows = []) {
  try {
    const { rows } = await pool.query(sql, params);
    return rows || fallbackRows;
  } catch {
    return fallbackRows;
  }
}

export async function safeScalar(pool, sql, params, key, fallback) {
  const rows = await safeQuery(pool, sql, params, []);
  return rows?.[0]?.[key] ?? fallback;
}

export async function tableExists(pool, tableName) {
  const rows = await safeQuery(
    pool,
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
      LIMIT 1`,
    [tableName],
    []
  );
  return rows.length > 0;
}

export async function columnExists(pool, tableName, columnName) {
  const rows = await safeQuery(
    pool,
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1`,
    [tableName, columnName],
    []
  );
  return rows.length > 0;
}
