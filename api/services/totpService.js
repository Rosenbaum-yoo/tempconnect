/**
 * TOTP Service — Time-based One-Time Password (RFC 6238).
 *
 * Uses crypto-based TOTP without external dependency.
 * Compatible with Google Authenticator, Authy, 1Password, etc.
 *
 * Secret: 20 bytes base32-encoded.
 * Token: 6-digit, 30-second window, ±1 step tolerance.
 */

import crypto from "crypto";

const ISSUER = "TempConnect";
const DIGITS = 6;
const PERIOD = 30;
const ALGORITHM = "sha1";
const TOLERANCE = 1; // ±1 step = 90 second window

/* ── Base32 Encoding ──────────────────────────────── */

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer) {
  let bits = "";
  for (const b of buffer) bits += b.toString(2).padStart(8, "0");
  let result = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    result += BASE32_CHARS[parseInt(chunk, 2)];
  }
  return result;
}

function base32Decode(str) {
  let bits = "";
  for (const c of str.toUpperCase().replace(/=+$/, "")) {
    const idx = BASE32_CHARS.indexOf(c);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/* ── HOTP Core (RFC 4226) ─────────────────────────── */

function generateHOTP(secret, counter) {
  const buf = Buffer.alloc(8);
  let tmp = counter;
  for (let i = 7; i >= 0; i--) {
    buf[i] = tmp & 0xff;
    tmp = Math.floor(tmp / 256);
  }
  const hmac = crypto.createHmac(ALGORITHM, secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % Math.pow(10, DIGITS)).padStart(DIGITS, "0");
}

/* ── TOTP (RFC 6238) ──────────────────────────────── */

function getTOTP(secret, time) {
  const counter = Math.floor((time || Date.now() / 1000) / PERIOD);
  return generateHOTP(secret, counter);
}

/* ── Public API ───────────────────────────────────── */

/**
 * Generate a new TOTP secret.
 * @returns {{ secret: string, otpauthUrl: string }}
 */
export function generateSecret(email) {
  const raw = crypto.randomBytes(20);
  const secret = base32Encode(raw);
  const otpauthUrl = `otpauth://totp/${encodeURIComponent(ISSUER)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=${ALGORITHM.toUpperCase()}&digits=${DIGITS}&period=${PERIOD}`;
  return { secret, otpauthUrl };
}

/**
 * Verify a TOTP token against a secret.
 * Allows ±TOLERANCE steps for clock drift.
 * @param {string} secret - base32-encoded
 * @param {string} token - 6-digit string
 * @returns {boolean}
 */
export function verifyToken(secret, token) {
  if (!secret || !token || token.length !== DIGITS) return false;
  const key = base32Decode(secret);
  const now = Math.floor(Date.now() / 1000);
  for (let i = -TOLERANCE; i <= TOLERANCE; i++) {
    const t = now + i * PERIOD;
    if (getTOTP(key, t) === token) return true;
  }
  return false;
}

/* ── DB Operations ────────────────────────────────── */

/**
 * Start TOTP setup: generate secret, store (unverified) in DB.
 */
export async function setupTOTP(pool, userId, email) {
  const { secret, otpauthUrl } = generateSecret(email);
  await pool.query(
    "UPDATE users SET totp_secret = $1, totp_enabled = FALSE, updated_at = NOW() WHERE id = $2",
    [secret, userId]
  );
  return { secret, otpauthUrl };
}

/**
 * Verify and enable TOTP: user provides a token from their authenticator app.
 */
export async function verifyAndEnableTOTP(pool, userId, token) {
  const { rows } = await pool.query(
    "SELECT totp_secret FROM users WHERE id = $1",
    [userId]
  );
  if (!rows[0]?.totp_secret) return { ok: false, error: "TOTP_NOT_SETUP" };
  if (!verifyToken(rows[0].totp_secret, token)) return { ok: false, error: "INVALID_TOKEN" };

  await pool.query(
    "UPDATE users SET totp_enabled = TRUE, totp_verified_at = NOW(), updated_at = NOW() WHERE id = $1",
    [userId]
  );
  return { ok: true };
}

/**
 * Disable TOTP (requires current token for security).
 */
export async function disableTOTP(pool, userId, token) {
  const { rows } = await pool.query(
    "SELECT totp_secret, totp_enabled FROM users WHERE id = $1",
    [userId]
  );
  if (!rows[0]?.totp_enabled) return { ok: false, error: "TOTP_NOT_ENABLED" };
  if (!verifyToken(rows[0].totp_secret, token)) return { ok: false, error: "INVALID_TOKEN" };

  await pool.query(
    "UPDATE users SET totp_secret = NULL, totp_enabled = FALSE, totp_verified_at = NULL, updated_at = NOW() WHERE id = $1",
    [userId]
  );
  return { ok: true };
}

/**
 * Check if a user requires TOTP at login.
 */
export async function requiresTOTP(pool, userId) {
  const { rows } = await pool.query(
    "SELECT totp_enabled FROM users WHERE id = $1",
    [userId]
  );
  return rows[0]?.totp_enabled === true;
}

/**
 * Validate TOTP at login.
 */
export async function validateLoginTOTP(pool, userId, token) {
  const { rows } = await pool.query(
    "SELECT totp_secret FROM users WHERE id = $1 AND totp_enabled = TRUE",
    [userId]
  );
  if (!rows[0]?.totp_secret) return false;
  return verifyToken(rows[0].totp_secret, token);
}
