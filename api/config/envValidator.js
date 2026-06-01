/**
 * ENV Validator – zentrale Validierung aller Umgebungsvariablen beim Startup.
 * Fehlende Pflicht-Keys = sofortiger Crash mit klarer Meldung.
 */
import { z } from "zod";

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
  SMTP_HOST:       z.string().optional(),
  SMTP_PORT:       z.string().optional(),
  SMTP_USER:       z.string().optional(),
  SMTP_PASS:       z.string().optional(),
  SMTP_FROM:       z.string().optional(),

  // Payment
  PAYMENT_MODE:    z.enum(["demo", "live"]).default("demo"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Feature Gates — Default false; nur lokal explizit auf true setzen
  FEATURE_GATE_BYPASS: z.enum(["true", "false"]).default("false"),

  // Redis
  REDIS_URL:       z.string().optional(),
  RATE_LIMIT_STORE: z.string().optional(),
  RATE_LIMIT_OCC_WINDOW_MS: z.string().optional(),
  RATE_LIMIT_OCC_MAX: z.string().optional(),
  RATE_LIMIT_SUPPORT_WINDOW_MS: z.string().optional(),
  RATE_LIMIT_SUPPORT_MAX: z.string().optional(),
  RATE_LIMIT_WARP_EXEC_WINDOW_MS: z.string().optional(),
  RATE_LIMIT_WARP_EXEC_MAX: z.string().optional(),
  SUPPORT_OPS_ENABLED: z.enum(["true", "false"]).optional(),
  WARP_SSH_ENABLED: z.enum(["true", "false"]).optional(),
  WARP_SSH_USER: z.string().optional(),
  WARP_SSH_PORT: z.string().optional(),
  WARP_SSH_KEY_PATH: z.string().optional(),
  WARP_SSH_CONNECT_TIMEOUT_MS: z.string().optional(),
  WARP_SSH_COMMAND_TIMEOUT_MS: z.string().optional(),
  WARP_SSH_STRICT_HOST_KEY_CHECKING: z.string().optional(),
  WARP_REMOTE_APP_DIR: z.string().optional(),
  WARP_REMOTE_HEALTH_URL: z.string().optional(),
  INFRA_SNAPSHOT_INGEST_ENABLED: z.enum(["true", "false"]).optional(),
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
  if (data.NODE_ENV === "production") {
    if (data.FEATURE_GATE_BYPASS === "true") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "FEATURE_GATE_BYPASS=true ist in Produktion verboten — Feature Gates wuerde alle Plan-Beschraenkungen deaktivieren. Auf false setzen oder Variable entfernen.",
        path: ["FEATURE_GATE_BYPASS"]
      });
    }

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
