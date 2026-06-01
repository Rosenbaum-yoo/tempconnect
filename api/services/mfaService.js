/**
 * MFA/TOTP Service — Secret generieren, Token verifizieren, Backup-Codes.
 * Verwendet crypto fuer TOTP (kein externes Package noetig).
 */
import crypto from "crypto";

const TOTP_PERIOD = 30;
const TOTP_DIGITS = 6;
const TOTP_ALGO = "sha1";

/* ── TOTP Implementation ─────────────────────────── */

function base32Encode(buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0, output = "";
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(encoded) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0;
  const output = [];
  for (const c of encoded.toUpperCase().replace(/=+$/, "")) {
    const idx = alphabet.indexOf(c);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { output.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(output);
}

function generateTOTP(secret, time) {
  const counter = Math.floor((time || Date.now() / 1000) / TOTP_PERIOD);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(0, 0);
  buf.writeUInt32BE(counter, 4);
  const hmac = crypto.createHmac(TOTP_ALGO, base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % (10 ** TOTP_DIGITS);
  return String(code).padStart(TOTP_DIGITS, "0");
}

function verifyTOTP(secret, token, window) {
  window = window || 1;
  const now = Date.now() / 1000;
  for (let i = -window; i <= window; i++) {
    if (generateTOTP(secret, now + i * TOTP_PERIOD) === String(token).padStart(TOTP_DIGITS, "0")) return true;
  }
  return false;
}

/* ── Public API ───────────────────────────────────── */

export async function generateSecret(pool, userId) {
  const secret = base32Encode(crypto.randomBytes(20));
  // User-Email fuer QR-Code
  const { rows } = await pool.query("SELECT email FROM users WHERE id = $1", [userId]);
  const email = rows[0]?.email || "user";
  const otpauthUrl = `otpauth://totp/TempConnect:${encodeURIComponent(email)}?secret=${secret}&issuer=TempConnect&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
  // Secret temporaer speichern (noch nicht aktiviert)
  await pool.query("UPDATE users SET mfa_secret = $1 WHERE id = $2", [secret, userId]);
  return { secret, otpauth_url: otpauthUrl };
}

export async function enableMFA(pool, userId, token) {
  const { rows } = await pool.query("SELECT mfa_secret FROM users WHERE id = $1", [userId]);
  if (!rows[0]?.mfa_secret) return { error: "NO_SECRET_GENERATED" };
  if (!verifyTOTP(rows[0].mfa_secret, token)) return { error: "INVALID_TOKEN" };
  // Backup-Codes generieren
  const backupCodes = Array.from({ length: 10 }, () => crypto.randomBytes(4).toString("hex"));
  await pool.query(
    "UPDATE users SET mfa_enabled = TRUE, mfa_backup_codes = $1 WHERE id = $2",
    [backupCodes, userId]
  );
  return { ok: true, backup_codes: backupCodes };
}

export async function verifyToken(pool, userId, token) {
  const { rows } = await pool.query(
    "SELECT mfa_secret, mfa_enabled, mfa_backup_codes FROM users WHERE id = $1", [userId]
  );
  if (!rows[0]?.mfa_enabled) return { valid: true }; // MFA nicht aktiv
  // Normaler TOTP-Check
  if (verifyTOTP(rows[0].mfa_secret, token)) return { valid: true };
  // Backup-Code-Check
  const codes = rows[0].mfa_backup_codes || [];
  const idx = codes.indexOf(String(token));
  if (idx >= 0) {
    codes.splice(idx, 1);
    await pool.query("UPDATE users SET mfa_backup_codes = $1 WHERE id = $2", [codes, userId]);
    return { valid: true, backup_code_used: true, remaining_codes: codes.length };
  }
  return { valid: false };
}

export async function disableMFA(pool, userId, token) {
  const result = await verifyToken(pool, userId, token);
  if (!result.valid) return { error: "INVALID_TOKEN" };
  await pool.query(
    "UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL, mfa_backup_codes = NULL WHERE id = $1",
    [userId]
  );
  return { ok: true };
}

export async function getMFAStatus(pool, userId) {
  const { rows } = await pool.query(
    "SELECT mfa_enabled, mfa_backup_codes FROM users WHERE id = $1", [userId]
  );
  if (!rows[0]) return { enabled: false };
  return {
    enabled: rows[0].mfa_enabled || false,
    backup_codes_remaining: (rows[0].mfa_backup_codes || []).length
  };
}
