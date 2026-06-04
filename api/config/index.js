/**
 * Central config: env loading, validation, exported config object.
 */

import dotenv from "dotenv";
import pino from "pino";

dotenv.config();

const PLACEHOLDER_PATTERNS = [
  "dev_secret_change_me", "HIER_", "DEIN_", "PLACEHOLDER",
  "superlangundzufaellig", "sk_test_DEIN", "pk_test_DEIN", "whsec_DEIN", "xxxxxxxx"
];

function looksLikePlaceholder(val) {
  if (!val || String(val).trim() === "") return true;
  return PLACEHOLDER_PATTERNS.some((p) => String(val).trim().includes(p));
}

export function validateProductionSecrets(log) {
  if (process.env.NODE_ENV !== "production") return;
  const logFn = log || { fatal: () => {} };
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === "dev_secret_change_me" || looksLikePlaceholder(process.env.SESSION_SECRET)) {
    logFn.fatal("In Produktion muss SESSION_SECRET gesetzt und sicher sein.");
    process.exit(1);
  }
  if (!process.env.JWT_SECRET || looksLikePlaceholder(process.env.JWT_SECRET)) {
    logFn.fatal("In Produktion muss JWT_SECRET gesetzt sein.");
    process.exit(1);
  }
}

export const config = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 3000),
  SESSION_SECRET: process.env.SESSION_SECRET || "dev_secret_change_me",
  JWT_SECRET: process.env.JWT_SECRET || "",
  CORS_ORIGIN: process.env.CORS_ORIGIN || "http://localhost:8080",
  BASE_URL: process.env.BASE_URL || "http://localhost:8080",
  DATABASE_URL: process.env.DATABASE_URL,
  DB_HOST: process.env.DB_HOST || "db",
  DB_PORT: Number(process.env.DB_PORT) || 5432,
  POSTGRES_DB: process.env.POSTGRES_DB || "tempconnect",
  POSTGRES_USER: process.env.POSTGRES_USER || "tempconnect",
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
  PGSSLMODE: (process.env.PGSSLMODE || "").toLowerCase(),
  PGPOOL_MAX: Number(process.env.PGPOOL_MAX) || 20,
  PGPOOL_IDLE_TIMEOUT_MS: Number(process.env.PGPOOL_IDLE_TIMEOUT_MS) || 30000,
  PGPOOL_CONN_TIMEOUT_MS: Number(process.env.PGPOOL_CONN_TIMEOUT_MS) || 5000,
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  SMTP_FROM: process.env.SMTP_FROM || "noreply@tempconnect.local",
  /**
   * E-Mail-Provider (zukunftssichere Abstraktion über SMTP/SendGrid):
   *   "smtp"     – generischer SMTP-Server (SMTP_HOST/PORT/USER/PASS).
   *   "sendgrid" – SendGrid als SMTP-Relay (SENDGRID_API_KEY; nutzt nodemailer, KEINE neue Dependency).
   *   "console"  – Dev-Default: E-Mails werden nur geloggt, nicht gesendet.
   *   "disabled" – Versand bewusst aus (z. B. Demo-/Pilot-Instanz).
   * Leer = automatische Ableitung (SendGrid-Key → sendgrid, sonst SMTP_HOST → smtp, sonst console).
   */
  EMAIL_PROVIDER: (process.env.EMAIL_PROVIDER || "").toLowerCase().trim(),
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY || "",
  PAYMENT_MODE: process.env.PAYMENT_MODE || "demo",
  /**
   * Billing-Provider (zukunftssichere Abstraktion über PAYMENT_MODE/Stripe):
   *   "stripe"   – Self-Service-Checkout + Webhooks (erfordert STRIPE_SECRET_KEY).
   *   "manual"   – Rechnung/Vertrag (keine externen Keys nötig; DE-B2B-Default für INDIVIDUELL/PRO).
   *   "disabled" – Billing aus (z. B. reine Demo-/Pilot-Instanz).
   * Leer = automatische Ableitung aus PAYMENT_MODE + Stripe-Key-Präsenz (rückwärtskompatibel).
   */
  BILLING_PROVIDER: (process.env.BILLING_PROVIDER || "").toLowerCase().trim(),
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "",
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",
  /** Redirect nach erfolgreicher Stripe-Zahlung (z.B. https://example.com/public/sla_abo.html?payment=success&session_id={CHECKOUT_SESSION_ID}) */
  STRIPE_SUCCESS_URL: process.env.STRIPE_SUCCESS_URL || "",
  /** Redirect bei Abbruch (z.B. https://example.com/public/sla_abo.html?payment=cancelled) */
  STRIPE_CANCEL_URL: process.env.STRIPE_CANCEL_URL || "",
  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID || "",
  PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET || "",
  ADMIN_SECRET: process.env.ADMIN_SECRET || "",
  /**
   * Wenn true: jeder eingeloggte Nutzer darf Admin-API (/api/admin/*, /api/admin/product-releases/*) nutzen.
   * Nur fuer interne Tests / kurze Demos. In Produktion immer false lassen.
   */
  ADMIN_PANEL_OPEN: ["true", "1", "yes"].includes(String(process.env.ADMIN_PANEL_OPEN || "").toLowerCase().trim()),
  INTERNAL_CRON_SECRET: (process.env.INTERNAL_CRON_SECRET || "").trim(),
  INTERNAL_CRON_ALLOWED_IPS: (process.env.INTERNAL_CRON_ALLOWED_IPS || "").split(",").map((s) => s.trim()).filter(Boolean),
  RATE_LIMIT_STORE: (process.env.RATE_LIMIT_STORE || "memory").toLowerCase(),
  REDIS_URL: process.env.REDIS_URL || "",
  SENTRY_DSN: process.env.SENTRY_DSN || "",
  MEILISEARCH_URL: process.env.MEILISEARCH_URL || "",
  MEILISEARCH_API_KEY: process.env.MEILISEARCH_API_KEY || "",
  RATE_LIMIT_AUTH_WINDOW_MS: process.env.RATE_LIMIT_AUTH_WINDOW_MS,
  RATE_LIMIT_AUTH_MAX: process.env.RATE_LIMIT_AUTH_MAX,
  RATE_LIMIT_REQUEST_WINDOW_MS: Number(process.env.RATE_LIMIT_REQUEST_WINDOW_MS) || 10 * 60 * 1000,
  RATE_LIMIT_REQUEST_MAX: Number(process.env.RATE_LIMIT_REQUEST_MAX) || 30,
  RATE_LIMIT_API_WINDOW_MS: Number(process.env.RATE_LIMIT_API_WINDOW_MS) || 5 * 60 * 1000,
  RATE_LIMIT_API_MAX: Number(process.env.RATE_LIMIT_API_MAX) || 200,
  RATE_LIMIT_ANALYTICS_WINDOW_MS: Number(process.env.RATE_LIMIT_ANALYTICS_WINDOW_MS) || 60 * 1000,
  RATE_LIMIT_ANALYTICS_MAX: Number(process.env.RATE_LIMIT_ANALYTICS_MAX) || 120,
  RATE_LIMIT_OCC_WINDOW_MS: Number(process.env.RATE_LIMIT_OCC_WINDOW_MS) || 60 * 1000,
  RATE_LIMIT_OCC_MAX: Number(process.env.RATE_LIMIT_OCC_MAX) || 60,
  RATE_LIMIT_SUPPORT_WINDOW_MS: Number(process.env.RATE_LIMIT_SUPPORT_WINDOW_MS) || 60 * 1000,
  RATE_LIMIT_SUPPORT_MAX: Number(process.env.RATE_LIMIT_SUPPORT_MAX) || 90,
  RATE_LIMIT_WARP_EXEC_WINDOW_MS: Number(process.env.RATE_LIMIT_WARP_EXEC_WINDOW_MS) || 60 * 60 * 1000,
  RATE_LIMIT_WARP_EXEC_MAX: Number(process.env.RATE_LIMIT_WARP_EXEC_MAX) || 10,
  SUPPORT_OPS_ENABLED: process.env.SUPPORT_OPS_ENABLED || "true",
  WARP_SSH_ENABLED: ["true", "1", "yes", "on"].includes(String(process.env.WARP_SSH_ENABLED || "").toLowerCase().trim()),
  WARP_SSH_USER: process.env.WARP_SSH_USER || "deploy",
  WARP_SSH_PORT: Number(process.env.WARP_SSH_PORT) || 22,
  WARP_SSH_KEY_PATH: process.env.WARP_SSH_KEY_PATH || "",
  WARP_SSH_CONNECT_TIMEOUT_MS: Number(process.env.WARP_SSH_CONNECT_TIMEOUT_MS) || 15000,
  WARP_SSH_COMMAND_TIMEOUT_MS: Number(process.env.WARP_SSH_COMMAND_TIMEOUT_MS) || 120000,
  WARP_SSH_STRICT_HOST_KEY_CHECKING: process.env.WARP_SSH_STRICT_HOST_KEY_CHECKING || "accept-new",
  WARP_REMOTE_APP_DIR: process.env.WARP_REMOTE_APP_DIR || "/opt/tempconnect",
  WARP_REMOTE_HEALTH_URL: process.env.WARP_REMOTE_HEALTH_URL || "http://127.0.0.1:8080/health",
  INFRA_SNAPSHOT_INGEST_ENABLED: process.env.INFRA_SNAPSHOT_INGEST_ENABLED || "true",
  INFRA_SNAPSHOT_MAX_BATCH: Number(process.env.INFRA_SNAPSHOT_MAX_BATCH) || 50,
  // Theme-System (Phase J). Tier-2 Env-Kill-Switch: standardmäßig AN, nur explizit
  // "false/0/no/off" schaltet ab. THEME_SWITCHER_ENABLED steuert den Umschalter
  // insgesamt, ULTRA_PREMIUM_THEME_ENABLED die Verfügbarkeit des Ultra-Premium-Themes.
  THEME_SWITCHER_ENABLED: !["false", "0", "no", "off"].includes(String(process.env.THEME_SWITCHER_ENABLED || "").toLowerCase().trim()),
  ULTRA_PREMIUM_THEME_ENABLED: !["false", "0", "no", "off"].includes(String(process.env.ULTRA_PREMIUM_THEME_ENABLED || "").toLowerCase().trim())
};

function hasPinoPretty() {
  try { import.meta.resolve("pino-pretty"); return true; } catch { return false; }
}

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),

  /* ── Base context (appears in every log line) ──────────── */
  base: { service: "tempconnect-api", env: process.env.NODE_ENV || "development" },

  /* ── Timestamp as ISO string (aggregation-friendly) ────── */
  timestamp: pino.stdTimeFunctions.isoTime,

  /* ── Proper error serialization (type, message, stack) ─── */
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err
  },

  /* ── PII / Secret Redaction ────────────────────────────── */
  /* Paths matching these patterns are replaced with [REDACTED]
   * in log output. This is a safety net — callers should still
   * avoid logging sensitive data in the first place. */
  redact: {
    paths: [
      // HTTP headers
      "req.headers.authorization",
      "req.headers.cookie",
      'req.headers["x-csrf-token"]',
      'req.headers["x-admin-secret"]',
      'req.headers["x-internal-secret"]',
      // Auth / credential fields (any nesting depth)
      "*.password",
      "*.newPassword",
      "*.oldPassword",
      "*.token",
      "*.secret",
      "*.sessionSecret",
      "*.creditCard",
      "*.ssn",
      "*.apiKey"
    ],
    censor: "[REDACTED]"
  },

  /* ── Dev: human-readable output via pino-pretty ────────── */
  ...(isDev && hasPinoPretty() && {
    transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss.l" } }
  })
});

/**
 * In Produktion: erforderliche Secrets prüfen. Fehlt ein Wert oder ist Platzhalter → Fail-fast.
 * INTERNAL_CRON_SECRET ist für Cron-Jobs (expire-reservations, sla-scan, cleanup-idempotency) Pflicht.
 */
export function runProductionValidation() {
  if (process.env.NODE_ENV !== "production") return;
  const fatal = (msg) => { logger.fatal(msg); process.exit(1); };

  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === "dev_secret_change_me" || looksLikePlaceholder(process.env.SESSION_SECRET)) {
    fatal("In Produktion muss SESSION_SECRET gesetzt und sicher sein (kein Dev-Default, kein Platzhalter wie HIER_ oder DEIN_)");
  }
  if (!process.env.JWT_SECRET || looksLikePlaceholder(process.env.JWT_SECRET)) {
    fatal("In Produktion muss JWT_SECRET gesetzt sein (kein Platzhalter)");
  }
  const cronSecret = (process.env.INTERNAL_CRON_SECRET || "").trim();
  if (!cronSecret || looksLikePlaceholder(cronSecret)) {
    fatal("In Produktion muss INTERNAL_CRON_SECRET gesetzt sein (für /api/internal/* Cron-Endpunkte)");
  }
  if (!process.env.ADMIN_SECRET || looksLikePlaceholder(process.env.ADMIN_SECRET)) {
    fatal("In Produktion muss ADMIN_SECRET gesetzt sein (für /api/health/status)");
  }

  // Datenbank: mindestens DATABASE_URL oder (DB_HOST + POSTGRES_PASSWORD) erforderlich
  if (!process.env.DATABASE_URL && !(process.env.DB_HOST && process.env.POSTGRES_PASSWORD)) {
    fatal("In Produktion muss DATABASE_URL oder (DB_HOST + POSTGRES_PASSWORD) gesetzt sein");
  }

  // SMTP: Warnung wenn kein SMTP_HOST gesetzt (E-Mails werden nicht gesendet)
  if (!process.env.SMTP_HOST) {
    logger.warn("SMTP_HOST nicht gesetzt – E-Mails werden in Produktion NICHT gesendet!");
  }

  // Stripe: wenn PAYMENT_MODE != demo, muessen Stripe-Keys gesetzt sein
  const paymentMode = (process.env.PAYMENT_MODE || "demo").toLowerCase();
  if (paymentMode !== "demo") {
    if (!process.env.STRIPE_SECRET_KEY || looksLikePlaceholder(process.env.STRIPE_SECRET_KEY)) {
      fatal("PAYMENT_MODE=" + paymentMode + " erfordert STRIPE_SECRET_KEY");
    }
    if (!process.env.STRIPE_WEBHOOK_SECRET || looksLikePlaceholder(process.env.STRIPE_WEBHOOK_SECRET)) {
      fatal("PAYMENT_MODE=" + paymentMode + " erfordert STRIPE_WEBHOOK_SECRET");
    }
  }

  // SCC: STAFF_SESSION_SECRET in Production verpflichtend.
  // Fallback auf SESSION_SECRET+':staff' ist in Production VERBOTEN (SCC WAVE 01).
  if (!process.env.STAFF_SESSION_SECRET || looksLikePlaceholder(process.env.STAFF_SESSION_SECRET)) {
    fatal(
      "In Produktion muss STAFF_SESSION_SECRET gesetzt sein (>= 32 zufaellige Bytes). " +
      "Der Fallback auf SESSION_SECRET+':staff' ist in Production verboten. " +
      "Erzeuge ein sicheres Secret und setze es als Umgebungsvariable."
    );
  }
}
