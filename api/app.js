/**
 * TempConnect API – app factory for server.js and scripts/list-routes.js.
 */
import express from "express";
import session from "express-session";
import { createRequire } from "module";
import cors from "cors";
import helmet from "helmet";
import { createTransport } from "nodemailer";
import Stripe from "stripe";
import { config, logger, runProductionValidation } from "./config/index.js";
import { captureException, sentryErrorHandler } from "./utils/monitoring.js";
import { pool } from "./db/pool.js";
import { requireAuth, csrfProtect } from "./middleware/auth.js";
import { requireFeature } from "./middleware/featureGate.js";
import { createRateLimiters } from "./middleware/rateLimit.js";
import { idempotencyMiddleware } from "./middleware/idempotency.js";
import * as userService from "./services/userService.js";
import { simpleHealthHandler, createHealthRouter } from "./routes/health.js";
import { createCsrfRouter } from "./routes/csrf.js";
import { createAuthRouter } from "./routes/auth.js";
import { createMeRouter } from "./routes/me.js";
import { createPlansRouter } from "./routes/plans.js";
import { createGeoRouter } from "./routes/geo.js";
import { createListingsRouter } from "./routes/listings.js";
import { createCapacitiesRouter } from "./routes/capacities.js";
import { createInternalRouter } from "./routes/internal.js";
import { createRequestsRouter } from "./routes/requests.js";
import { createRatingsRouter } from "./routes/ratings.js";
import { createReportsRouter } from "./routes/reports.js";
import { createPaymentRouter } from "./routes/payment.js";
import { createProofsRouter } from "./routes/proofs.js";
import { createMarketplaceRouter } from "./routes/marketplace.js";
import { createSlaSearchJobsRouter } from "./routes/slaSearchJobs.js";
import { createRequisitionsRouter } from "./routes/requisitions.js";
import { createVendorPoolRouter } from "./routes/vendorPool.js";
import { createReportingRouter } from "./routes/reporting.js";
import { createOrganizationsRouter } from "./routes/organizations.js";
import { createApprovalsRouter } from "./routes/approvals.js";
import { createSuppliersRouter } from "./routes/suppliers.js";
import { createContractsRouter } from "./routes/contracts.js";
import { createAssignmentsRouter } from "./routes/assignments.js";
import { createSettingsRouter } from "./routes/settings.js";
import { createNotificationsRouter } from "./routes/notifications.js";
import { createCapacityExchangeRouter } from "./routes/capacityExchange.js";
import { createSupplierPoolsRouter } from "./routes/supplierPools.js";
import { createAnalyticsRouter } from "./routes/analytics.js";
import { createCapacityDiscoveryRouter } from "./routes/capacityDiscovery.js";
import { createSearchRouter } from "./routes/search.js";
import { createComplianceDocsRouter } from "./routes/complianceDocs.js";
import { createCompanyProfileRouter } from "./routes/companyProfile.js";
import { createActivityFeedRouter } from "./routes/activityFeed.js";
import { createAdminRouter } from "./routes/admin.js";
import { correlationMiddleware } from "./utils/logger.js";
import { orgContextMiddleware } from "./middleware/orgContext.js";
import { auditWriteMiddleware } from "./middleware/auditWrite.js";

const requireCjs = createRequire(import.meta.url);
const connectPgSimple = requireCjs("connect-pg-simple");
const PgSession = connectPgSimple(session);

export async function createApp() {
  runProductionValidation();
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = config;
  let mailTransport = null;
  if (SMTP_HOST) {
    const transportConfig = { host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465 };
    if (SMTP_USER && SMTP_PASS) transportConfig.auth = { user: SMTP_USER, pass: SMTP_PASS };
    mailTransport = createTransport(transportConfig);
  }
  async function sendMail(to, subject, html) {
    if (mailTransport) {
      try {
        await mailTransport.sendMail({ from: SMTP_FROM, to, subject, html });
        return true;
      } catch (e) {
        logger.error({ err: e.message }, "E-Mail-Fehler");
        return false;
      }
    }
    return true;
  }
  const stripe = config.STRIPE_SECRET_KEY ? new Stripe(config.STRIPE_SECRET_KEY) : null;
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Correlation-ID fuer Request-Tracing (X-Correlation-ID / X-Request-ID)
  app.use(correlationMiddleware);

  // Request Logging Middleware (strukturiert, pino-kompatibel)
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      const logLevel = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      if (req.path === "/health" || req.path === "/api/health") return; // Kein Logging fuer Health-Checks
      logger[logLevel]({
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration_ms: duration,
        ip: req.ip
      }, "request");
    });
    next();
  });

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"]
      }
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" }
  }));
  app.set("trust proxy", 1);
  const allowedOrigins = ["http://localhost:8080", "http://127.0.0.1:8080", "http://localhost:80", "http://127.0.0.1:80"];
  if (config.CORS_ORIGIN && !allowedOrigins.includes(config.CORS_ORIGIN)) allowedOrigins.push(config.CORS_ORIGIN);
  app.use(cors({ origin: (origin, cb) => { if (!origin || allowedOrigins.includes(origin)) cb(null, origin || allowedOrigins[0]); else cb(null, false); }, credentials: true }));
  const sessionStore = new PgSession({ pool, tableName: "session", createTableIfMissing: true, ttl: 60 * 60 * 24 * 14 });
  const cookieSecure = config.NODE_ENV === "production" || (config.BASE_URL || "").toLowerCase().startsWith("https://");
  app.use(session({ name: "tc.sid", secret: config.SESSION_SECRET, store: sessionStore, resave: true, saveUninitialized: false, rolling: true, cookie: { path: "/", httpOnly: true, sameSite: "lax", secure: cookieSecure, maxAge: 1000 * 60 * 60 * 24 * 14 } }));
  app.use("/api/", csrfProtect);
  app.use(idempotencyMiddleware(pool, { logger }));
  app.use(orgContextMiddleware(pool));
  app.use(auditWriteMiddleware(pool, { logger }));
  const limiters = await createRateLimiters(config, logger);
  app.use("/api/", limiters.apiLimiter);
  const getUserAndPlan = (userId) => userService.getUserAndPlan(pool, userId);
  const requireFeatureGate = (featureKey) => requireFeature(featureKey, { getUserAndPlan, logger });
  const deps = { pool, logger, config, sendMail, requireAuth, getUserAndPlan, requireFeature: requireFeatureGate, stripe, ...limiters };
  app.get("/health", simpleHealthHandler);
  app.use("/api", createCsrfRouter(deps));
  app.use("/api", createHealthRouter(deps));
  app.use("/api", createAuthRouter(deps));
  app.use("/api", createMeRouter(deps));
  app.use("/api", createPlansRouter(deps));
  app.use("/api", createGeoRouter(deps));
  app.use("/api", createListingsRouter(deps));
  app.use("/api", createCapacitiesRouter(deps));
  app.use("/api", createInternalRouter(deps));
  app.use("/api", createRequestsRouter(deps));
  app.use("/api", createRatingsRouter(deps));
  app.use("/api", createReportsRouter(deps));
  app.use("/api", createPaymentRouter(deps));
  app.use("/api", createProofsRouter(deps));
  app.use("/api", createMarketplaceRouter(deps));
  app.use("/api", createSlaSearchJobsRouter(deps));
  app.use("/api", createRequisitionsRouter(deps));
  app.use("/api", createVendorPoolRouter(deps));
  app.use("/api", createReportingRouter(deps));
  app.use("/api", createOrganizationsRouter(deps));
  app.use("/api", createApprovalsRouter(deps));
  app.use("/api", createSuppliersRouter(deps));
  app.use("/api", createContractsRouter(deps));
  app.use("/api", createAssignmentsRouter(deps));
  app.use("/api", createSettingsRouter(deps));
  app.use("/api", createNotificationsRouter(deps));
  app.use("/api", createCapacityExchangeRouter(deps));
  app.use("/api", createSupplierPoolsRouter(deps));
  app.use("/api", createAnalyticsRouter(deps));
  app.use("/api", createCapacityDiscoveryRouter(deps));
  app.use("/api", createSearchRouter(deps));
  app.use("/api", createComplianceDocsRouter(deps));
  app.use("/api", createCompanyProfileRouter(deps));
  app.use("/api", createActivityFeedRouter(deps));
  app.use("/api", createAdminRouter(deps));
  app.use("/api/", (req, res) => { res.status(404).json({ success: false, data: null, error: { code: "NOT_FOUND", message: "API-Route nicht gefunden." } }); });

  // Sentry error handler (reports to Sentry before our custom handler)
  app.use(sentryErrorHandler);

  // Centralized error handler – faengt alle next(err) und unbehandelte Fehler in Routes
  app.use((err, req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const code = err.code || "SERVER_ERROR";
    const message = status < 500 ? (err.message || "Unbekannter Fehler") : "Interner Serverfehler. Bitte spaeter erneut versuchen.";
    logger.error({ err: err.message, stack: err.stack, method: req.method, path: req.originalUrl }, "Unhandled error in route");
    captureException(err, { method: req.method, path: req.originalUrl });
    if (!res.headersSent) {
      res.status(status).json({ success: false, data: null, error: { code, message } });
    }
  });

  return app;
}
