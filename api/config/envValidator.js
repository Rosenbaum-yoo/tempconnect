/**
 * ENV Validator – zentrale Validierung aller Umgebungsvariablen beim Startup.
 * Fehlende Pflicht-Keys = sofortiger Crash mit klarer Meldung.
 */
import { z } from "zod";
import { BILLING_PROVIDERS } from "../services/billingProviderService.js";
import { EMAIL_PROVIDERS } from "../services/emailProviderService.js";
import { featureFlagFields, applyProductionFlagConstraints } from "./featureFlags.js";

const BILLING_PROVIDER_VALUES = Object.values(BILLING_PROVIDERS);
const EMAIL_PROVIDER_VALUES = Object.values(EMAIL_PROVIDERS);

// Theme-Flags (Phase J, Tier-2 Env-Kill-Switch): dieselbe Default-AN-Semantik wie
// config/index.js (nur false/0/no/off schaltet ab). Gegen bekannte Boolean-Tokens
// validiert, damit ein Tippfehler wie THEME_SWITCHER_ENABLED=nein nicht still auf AN aufloest.
const THEME_FLAG_KEYS = ["THEME_SWITCHER_ENABLED", "ULTRA_PREMIUM_THEME_ENABLED"];
const THEME_FLAG_TOKENS = ["true", "false", "1", "0", "yes", "no", "on", "off"];

const envSchema = z.object({
  // Required
  NODE_ENV:        z.string().default("development"),
  SESSION_SECRET:  z.string().min(16, "SESSION_SECRET muss mindestens 16 Zeichen lang sein"),

  // Database — entweder DATABASE_URL oder POSTGRES_*
  DATABASE_URL:    z.string().optional(),
  POSTGRES_DB:     z.string().optional(),
  POSTGRES_USER:   z.string().optional(),
  POSTGRES_PASSWORD: z.string().optional(),
  DB_HOST:         z.string().optional(),
  DB_PORT:         z.string().optional(),

  // API
  PORT:            z.string().optional(),
  API_PORT:        z.string().optional(),
  CORS_ORIGIN:     z.string().optional(),
  BASE_URL:        z.string().optional(),
  JWT_SECRET:      z.string().optional(),
  ADMIN_SECRET:    z.string().optional(),

  // Email
  EMAIL_PROVIDER:  z.string().optional(),
  SMTP_HOST:       z.string().optional(),
  SMTP_PORT:       z.string().optional(),
  SMTP_USER:       z.string().optional(),
  SMTP_PASS:       z.string().optional(),
  SMTP_FROM:       z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),

  // Payment
  BILLING_PROVIDER: z.string().optional(),
  PAYMENT_MODE:    z.enum(["demo", "live"]).default("demo"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Theme (Phase J, Tier-2 Env-Kill-Switch; leer = an, nur false/0/no/off schaltet ab)
  THEME_SWITCHER_ENABLED: z.string().optional(),
  ULTRA_PREMIUM_THEME_ENABLED: z.string().optional(),

  // Feature Flags (Ebene B: Plattform-Kill-Switch) — Registry: config/featureFlags.js
  ...featureFlagFields(),

  // Redis
  REDIS_URL:       z.string().optional(),
  RATE_LIMIT_STORE: z.string().optional(),
  RATE_LIMIT_OCC_WINDOW_MS: z.string().optional(),
  RATE_LIMIT_OCC_MAX: z.string().optional(),
  RATE_LIMIT_SUPPORT_WINDOW_MS: z.string().optional(),
  RATE_LIMIT_SUPPORT_MAX: z.string().optional(),
  RATE_LIMIT_WARP_EXEC_WINDOW_MS: z.string().optional(),
  RATE_LIMIT_WARP_EXEC_MAX: z.string().optional(),
  WARP_SSH_USER: z.string().optional(),
  WARP_SSH_PORT: z.string().optional(),
  WARP_SSH_KEY_PATH: z.string().optional(),
  WARP_SSH_CONNECT_TIMEOUT_MS: z.string().optional(),
  WARP_SSH_COMMAND_TIMEOUT_MS: z.string().optional(),
  WARP_SSH_STRICT_HOST_KEY_CHECKING: z.string().optional(),
  WARP_REMOTE_APP_DIR: z.string().optional(),
  WARP_REMOTE_HEALTH_URL: z.string().optional(),
  INFRA_SNAPSHOT_MAX_BATCH: z.string().optional(),

  // Monitoring
  SENTRY_DSN:      z.string().optional(),
  LOG_LEVEL:       z.string().optional(),

  // Internal
  INTERNAL_CRON_SECRET: z.string().optional()
}).superRefine((data, ctx) => {
  // Database: entweder DATABASE_URL oder POSTGRES_PASSWORD
  if (!data.DATABASE_URL && !data.POSTGRES_PASSWORD) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Entweder DATABASE_URL oder POSTGRES_PASSWORD muss gesetzt sein",
      path: ["DATABASE_URL"]
    });
  }
  // Provider-Auswahl: leer = Auto-Derive (smtp/manual). Gesetzter Wert muss bekannt sein.
  const emailProvider = (data.EMAIL_PROVIDER || "").trim().toLowerCase();
  if (emailProvider && !EMAIL_PROVIDER_VALUES.includes(emailProvider)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `EMAIL_PROVIDER='${data.EMAIL_PROVIDER}' ist unbekannt. Erlaubt: ${EMAIL_PROVIDER_VALUES.join(", ")} (oder leer fuer Auto-Derive).`,
      path: ["EMAIL_PROVIDER"]
    });
  }
  const billingProvider = (data.BILLING_PROVIDER || "").trim().toLowerCase();
  if (billingProvider && !BILLING_PROVIDER_VALUES.includes(billingProvider)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `BILLING_PROVIDER='${data.BILLING_PROVIDER}' ist unbekannt. Erlaubt: ${BILLING_PROVIDER_VALUES.join(", ")} (oder leer fuer Auto-Derive).`,
      path: ["BILLING_PROVIDER"]
    });
  }
  // Theme-Kill-Switches: gesetzter Wert muss ein bekannter Boolean-Token sein (leer = an).
  for (const key of THEME_FLAG_KEYS) {
    const raw = (data[key] || "").trim().toLowerCase();
    if (raw && !THEME_FLAG_TOKENS.includes(raw)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${key}='${data[key]}' ist kein gueltiger Boolean-Wert. Erlaubt: ${THEME_FLAG_TOKENS.join(", ")} (oder leer = an).`,
        path: [key]
      });
    }
  }
  // Stripe Live-Modus: Keys muessen gesetzt sein
  if (data.PAYMENT_MODE === "live") {
    if (!data.STRIPE_SECRET_KEY) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "STRIPE_SECRET_KEY ist Pflicht bei PAYMENT_MODE=live", path: ["STRIPE_SECRET_KEY"] });
    }
    if (!data.STRIPE_WEBHOOK_SECRET) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "STRIPE_WEBHOOK_SECRET ist Pflicht bei PAYMENT_MODE=live", path: ["STRIPE_WEBHOOK_SECRET"] });
    }
  }
  // Redis: wenn RATE_LIMIT_STORE=redis, dann REDIS_URL Pflicht
  if (data.RATE_LIMIT_STORE === "redis" && !data.REDIS_URL) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "REDIS_URL ist Pflicht wenn RATE_LIMIT_STORE=redis", path: ["REDIS_URL"] });
  }
  // Production-Safety: harte Fehler verhindern unsicheren Produktionsstart
  // Plattform-Flag-Constraints aus dem Register (z. B. FEATURE_GATE_BYPASS=true verboten)
  applyProductionFlagConstraints(data, ctx);
  if (data.NODE_ENV === "production") {
    // Bekannte schwache / Default-Werte fuer Secrets
    const KNOWN_WEAK_SECRETS = [
      "changeme", "secret", "password", "geheim", "test", "development",
      "your-secret-here", "enter-secret-here", "SESSION_SECRET", "JWT_SECRET",
      "HIER_SICHERES_PASSWORT", "HIER_EINSETZEN"
    ];
    const isWeak = (val) => !val || val.length < 32 ||
      KNOWN_WEAK_SECRETS.some(w => val.toLowerCase().includes(w.toLowerCase()));

    if (isWeak(data.SESSION_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SESSION_SECRET ist zu schwach oder ein bekannter Platzhalter (mind. 32 Zeichen, kein Default-Wert).",
        path: ["SESSION_SECRET"]
      });
    }
    if (data.JWT_SECRET && isWeak(data.JWT_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "JWT_SECRET ist zu schwach oder ein bekannter Platzhalter (mind. 32 Zeichen, kein Default-Wert).",
        path: ["JWT_SECRET"]
      });
    }
  }
});

/**
 * Validiert process.env und gibt die validierten Werte zurueck.
 * Bei Fehlern: wirft Error mit allen Validierungsfehlern.
 */
export function validateEnv(logger) {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.issues.map(i => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    const isWarningOnly = result.error.issues.every(i => i.message.startsWith("WARNUNG"));
    if (isWarningOnly) {
      if (logger) logger.warn({ issues: result.error.issues.length }, "ENV-Validierung: Warnungen\n" + errors);
      return result.data || process.env;
    }
    const msg = `ENV-Validierung fehlgeschlagen:\n${errors}`;
    if (logger) logger.fatal(msg);
    throw new Error(msg);
  }
  return result.data;
}
