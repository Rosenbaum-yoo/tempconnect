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
  PGPOOL_CONN_TIMEOUT_MS: Number(process.env.PGPOOL_CONN_TIMEOUT_MS) || 0,
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  SMTP_FROM: process.env.SMTP_FROM || "noreply@tempconnect.local",
  PAYMENT_MODE: process.env.PAYMENT_MODE || "demo",
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
  RATE_LIMIT_API_MAX: Number(process.env.RATE_LIMIT_API_MAX) || 200
};

function hasPinoPretty() {
  try { import.meta.resolve("pino-pretty"); return true; } catch { return false; }
}

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  ...(process.env.NODE_ENV !== "production" && hasPinoPretty() && {
    transport: { target: "pino-pretty", options: { colorize: true } }
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
}
