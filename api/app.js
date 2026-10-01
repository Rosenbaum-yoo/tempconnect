/**
 * TempConnect API -- app factory for server.js and scripts/list-routes.js.
 *
 * Built by Claude (Anthropic) & Dennis Stegemann — 2024-2026
 * Architecture: Express 4 + PostgreSQL 16 + Redis 7 | 61 Routes, 78 Services
 * From zero to Enterprise SaaS — every line, every migration, every test.
 */
import express from "express";
import session from "express-session";
import { IDLE_TIMEOUT_MS, enforceAbsoluteLifetime } from "./services/sessionSecurityService.js";
import { createRequire } from "module";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import { createTransport } from "nodemailer";
import { mitRahmen } from "./services/emailHtmlTemplates.js";
/* M1.3 — der Riegel gegen den stillen Versand und das Protokoll je Zweck.
 * Beide Mailwege benutzen dieselbe Entscheidung: zwei Mechaniken fuer
 * dieselbe Zusage waeren genau der Zustand, den M1.3 abschafft. */
import { versandwegPflicht } from "./services/emailProviderService.js";
import {
  mailNotieren, KeinVersandweg, ZWECK_UNBENANNT
} from "./services/mailProtokollService.js";
import { sendMail as emailServiceSendMail } from "./services/emailService.js";
import Stripe from "stripe";
import { config, logger, runProductionValidation } from "./config/index.js";
import { captureException, setupSentryErrorHandler, sentryContextMiddleware } from "./utils/monitoring.js";
import { pool } from "./db/pool.js";
import { requireAuth, csrfProtect } from "./middleware/auth.js";
import { requireFeature } from "./middleware/featureGate.js";
import { createRateLimiters } from "./middleware/rateLimit.js";
import { idempotencyMiddleware } from "./middleware/idempotency.js";
import * as userService from "./services/userService.js";
import { simpleHealthHandler, createHealthRouter } from "./routes/health.js";
import crypto from "node:crypto";
import { createCsrfRouter } from "./routes/csrf.js";
import { createAuthRouter } from "./routes/auth.js";
import { createMeRouter } from "./routes/me.js";
import { createPlansRouter } from "./routes/plans.js";
import { createPublicPlansRouter } from "./routes/publicPlans.js";
import { createSchaufensterRouter } from "./routes/schaufenster.js";
import { createPilotPreregistrationRouter } from "./routes/pilotPreregistration.js";
import { createSubscriptionRequestsRouter } from "./routes/subscriptionRequests.js";
import { createSubscriptionDocumentsRouter } from "./routes/subscriptionDocuments.js";
import { createGeoRouter } from "./routes/geo.js";
import { createListingsRouter } from "./routes/listings.js";
import { createCapacitiesRouter } from "./routes/capacities.js";
import { createInternalRouter } from "./routes/internal.js";
import { createPaymentRouter } from "./routes/payment.js";
import { createProofsRouter } from "./routes/proofs.js";
import { createMarketplaceRouter } from "./routes/marketplace.js";
import { createRequestsRouter } from "./routes/requests.js";
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
import { createDocumentCenterRouter } from "./routes/documentCenter.js";
import { createCompanyProfileRouter } from "./routes/companyProfile.js";
import { createRatingsRouter } from "./routes/ratings.js";
import { createDealFeedbackRouter } from "./routes/dealFeedback.js";
import { createActivityFeedRouter } from "./routes/activityFeed.js";
import { createAdminRouter } from "./routes/admin.js";
import { createWorkersRouter } from "./routes/workers.js";
import { createWorkerPortalRouter } from "./routes/workerPortal.js";
import { createSkillCatalogRouter } from "./routes/skills.js";
import { createAgencyPortalRouter } from "./routes/agencyPortal.js";
import { createCompanyTimesheetsRouter } from "./routes/companyTimesheets.js";
import { createTimesheetsRouter } from "./routes/timesheets.js";
import { createInvoicesRouter } from "./routes/invoices.js";
import { createOfferAssetsRouter } from "./routes/offerAssets.js";
import { createDemoRouter } from "./routes/demo.js";
import { createIntegrationsRouter } from "./routes/integrations.js";
import { createMatchingRouter } from "./routes/matching.js";
import { createWorkforceRouter } from "./routes/workforce.js";
import { createEmergencyRouter } from "./routes/emergency.js";
import { createSmartPricingRouter } from "./routes/smartPricing.js";
import { createReputationRouter } from "./routes/reputation.js";
import { createPreferredVendorsRouter } from "./routes/preferredVendors.js";
import { createOnboardingRouter } from "./routes/onboarding.js";
import { createOrgControlCenterRouter } from "./routes/orgControlCenter.js";
import { createRateCardsRouter } from "./routes/rateCards.js";
import { createSpendAnalyticsRouter } from "./routes/spendAnalytics.js";
import { createDataGovernanceRouter } from "./routes/dataGovernance.js";
import { createBountyRouter } from "./routes/bounties.js";
import { createReferralProgramRouter } from "./routes/referralProgram.js";
import { createSSORouter } from "./routes/sso.js";
import { createMentoringRouter } from "./routes/mentoring.js";
import { createCreditsRouter } from "./routes/credits.js";
import { createMFARouter } from "./routes/mfa.js";
import { createProductReleasesRouter } from "./routes/productReleases.js";
import { createStrategicCollaborationRouter } from "./routes/strategicCollaboration.js";
import { createInternalControlCenterRouter } from "./routes/internalControlCenter.js";
import { createOwnerControlCenterRouter } from "./routes/ownerControlCenter.js";
import { createSupportRouter } from "./routes/support.js";
import { createSupportIntakeRouter } from "./routes/supportIntake.js";
import { createNotificationStreamRouter } from "./routes/notificationStream.js";
import { createStaffControlCenterRouter, createStaffControlAuthRouter } from "./routes/staffControlCenter.js";
import { staffApiCacheControl, staffSecurityHeaders, createStaffOriginGuard } from "./middleware/staffSecurity.js";
// Marketplace Visibility Center (Phase 4 Track A — M-04 2026-05-30)
import { createProfileVisibilityRouter } from "./routes/profileVisibility.js";
import { createProfileAnalyticsRouter } from "./routes/profileAnalytics.js";
import { createProfileRankingsRouter } from "./routes/profileRankings.js";
import { createProfileBountiesRouter } from "./routes/profileBounties.js";
import { apiKeyAuthMiddleware } from "./middleware/apiKeyAuth.js";
import { createOAuthRouter } from "./routes/oauth.js";
import { createScimRouter } from "./routes/scim.js";
import { correlationMiddleware } from "./utils/logger.js";
import { metricsMiddleware, metricsEndpoint, registerDbPoolMetrics, wrapPoolWithMetrics } from "./utils/metrics.js";
import { orgContextMiddleware } from "./middleware/orgContext.js";
import { arbeiterRiegel } from "./middleware/arbeiterRiegel.js";
import { auditWriteMiddleware } from "./middleware/auditWrite.js";
import { demoGuard } from "./middleware/demoGuard.js";

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
  /**
   * @param {string} to
   * @param {string} subject
   * @param {string} html
   * @param {{zweck?: string}} [opts] Wofuer die Mail geht — landet im
   *   Versandprotokoll (M1.3). Ohne Angabe zaehlt sie unter "unbenannt", und
   *   das ist im Staff CC sichtbar, nicht still.
   */
  async function sendMail(to, subject, html, opts = {}) {
    const zweck = opts?.zweck || ZWECK_UNBENANNT;

    // Demo-Mail-Adressen unterdrücken (kein Versand an Demo-Accounts)
    if (to && (/^demo[-.].*@tempconnect\.de$/i.test(to) || /@demo\.tempconnect\.de$/i.test(to))) {
      logger.debug({ to, subject }, "Demo-Mail unterdrückt");
      /* Bewusst NICHT protokolliert: eine unterdrueckte Demo-Mail ist kein
       * Versandversuch. Sie als "zugestellt" zu zaehlen waere dieselbe Luege
       * in klein — und als "fehlgeschlagen" ein Fehlalarm. */
      return true;
    }

    /*
     * ═════════════════════════════════════════════════════════════════════
     * DER RIEGEL (M1.3)
     * ═════════════════════════════════════════════════════════════════════
     * Vorher endete diese Funktion ohne Transport mit `return true`. Eine
     * Einladung meldete damit Zustellung, ohne dass je etwas das Haus
     * verliess — und 36 von 42 Aufrufern pruefen die Rueckgabe gar nicht.
     *
     * In Produktion wird das jetzt hart abgelehnt. In Entwicklung bleibt es
     * beim Loggen: Mailpit und `console` sind dort der Normalzustand.
     */
    const pflicht = versandwegPflicht(config);
    if (!pflicht.senden) {
      await mailNotieren(pool, { zweck, ergebnis: "ohne_versandweg", weg: pflicht.weg, fehler: pflicht.grund });
      if (pflicht.hart) {
        logger.error({ zweck, weg: pflicht.weg }, "E-Mail ohne Versandweg abgelehnt");
        throw new KeinVersandweg(pflicht.grund);
      }
      logger.info({ to, subject, zweck, weg: pflicht.weg }, "E-Mail nicht gesendet (kein Versandweg, Entwicklung)");
      return true;
    }

    if (mailTransport) {
      try {
        /*
         * JEDE Mail bekommt den Absender-Fuss — auch die, die ihr HTML am
         * Aufrufort zusammenbaut. Gemessen am 2026-08-24: von 40 Aufrufern
         * gingen nur 16 durch eine Vorlage; die anderen 24 trugen weder
         * Firmierung noch Kontakt. Fuer Geschaeftsbriefe sind das
         * Pflichtangaben (§ 37a HGB), und sie muessen der UG-Gruendung folgen
         * koennen — `COMPANY.name` ist bis dahin ein Platzhalter.
         *
         * `mitRahmen` packt NUR ein, was noch kein vollstaendiges Dokument ist;
         * die Vorlagen bleiben unberuehrt.
         */
        await mailTransport.sendMail({ from: SMTP_FROM, to, subject, html: mitRahmen(html, subject) });
        await mailNotieren(pool, { zweck, ergebnis: "zugestellt", weg: pflicht.weg });
        return true;
      } catch (e) {
        logger.error({ err: e.message, zweck }, "E-Mail-Fehler");
        await mailNotieren(pool, { zweck, ergebnis: "fehlgeschlagen", weg: pflicht.weg, fehler: e.message });
        return false;
      }
    }

    /*
     * Hierher kommt nur, wer einen Versandweg HAT, aber keinen Transport in
     * dieser Funktion — konkret: SendGrid. `emailService.sendMail` kennt den
     * Weg, diese Funktion hier baut ihren Transport nur aus SMTP_*.
     *
     * Vorher stand hier `return true`, was denselben Fehlschluss enthielt wie
     * oben. Jetzt wird der Versand an den Dienst gereicht, der den Weg
     * wirklich kennt, statt Erfolg zu behaupten.
     */
    try {
      await emailServiceSendMail({ to, subject, html, from: SMTP_FROM, zweck });
      return true;
    } catch (e) {
      logger.error({ err: e.message, zweck, weg: pflicht.weg }, "E-Mail-Fehler (Provider-Weg)");
      return false;
    }
  }
  const stripe = config.STRIPE_SECRET_KEY ? new Stripe(config.STRIPE_SECRET_KEY) : null;
  const app = express();
  // Stripe-Webhook braucht den ROH-Body fuer die HMAC-Signaturpruefung (constructEvent).
  // verify sichert den unveraenderten Buffer als req.rawBody, BEVOR express.json parst —
  // sonst konsumiert der globale Parser den Body und die Signaturpruefung schlaegt immer fehl.
  app.use(express.json({ limit: "1mb", verify: (req, _res, buf) => { if (buf && buf.length) req.rawBody = buf; } }));

  // Correlation-ID fuer Request-Tracing (X-Correlation-ID / X-Request-ID)
  app.use(correlationMiddleware);

  // Prometheus HTTP metrics (before routes, after correlation)
  app.use(metricsMiddleware);

  // ── Request-scoped logger + HTTP access logging ──────────────────────
  // Attaches req.log (child logger with correlationId + method + url)
  // so any route can do req.log.info({...}, 'msg') with automatic context.
  // On response finish, logs structured access entry with timing + userId.
  app.use((req, res, next) => {
    const start = Date.now();

    // Child logger scoped to this request — available in all downstream handlers
    req.log = logger.child({
      correlationId: req.correlationId,
      reqMethod: req.method,
      reqUrl: req.originalUrl
    });

    res.on("finish", () => {
      // Skip health-check noise
      if (req.path === "/health" || req.path === "/api/health") return;

      const duration = Date.now() - start;
      const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

      logger[level]({
        correlationId: req.correlationId,
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration_ms: duration,
        userId: req.session?.userId || undefined,
        ip: req.ip,
        contentLength: res.getHeader("content-length") || undefined
      }, "http");
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

  // SEC-005: Permissions-Policy — restrict browser features
  app.use((_req, res, next) => {
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    next();
  });

  // P7b: Worker-Profilfotos sind personenbezogen (DSGVO) — sie werden NIE
  // statisch ausgeliefert, sondern ausschliesslich ueber die session-gebundene
  // Route GET /api/worker/me/photo gestreamt. Muss VOR express.static stehen.
  app.use("/uploads/worker-photos", (_req, res) => res.status(404).end());

  // Statische Auslieferung von Uploads (Bilder, PDFs)
  // SEC-001: Nach helmet() gemountet — X-Content-Type-Options, X-Frame-Options,
  // CSP, Referrer-Policy etc. gelten auch fuer Upload-Downloads.
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads"), {
    dotfiles: "deny",           // Keine versteckten Dateien (.env, .htaccess)
    index: false,               // Kein Directory Listing
    setHeaders(res, filePath) {
      // Forciere Download fuer PDFs (verhindert XSS via eingebettete PDFs)
      if (filePath.endsWith(".pdf")) {
        res.setHeader("Content-Disposition", "attachment");
      }
    }
  }));
  app.set("trust proxy", 1);
  // SEC-004: Production CORS lockdown — no localhost origins in production
  const isProduction = config.NODE_ENV === "production";
  const allowedOrigins = isProduction ? [] : ["http://localhost:8080", "http://127.0.0.1:8080", "http://localhost:80", "http://127.0.0.1:80"];
  if (config.CORS_ORIGIN && !allowedOrigins.includes(config.CORS_ORIGIN)) allowedOrigins.push(config.CORS_ORIGIN);
  app.use(cors({ origin: (origin, cb) => { if (!origin || allowedOrigins.includes(origin)) cb(null, origin || allowedOrigins[0]); else cb(null, false); }, credentials: true }));
  const sessionStore = new PgSession({ pool, tableName: "session", createTableIfMissing: true, ttl: 60 * 60 * 24 * 14 });
  const cookieSecure = config.NODE_ENV === "production" || (config.BASE_URL || "").toLowerCase().startsWith("https://");

  // ── SCC (Staff Control Center): eigene, harte Session nur auf /staff ────
  // Laeuft VOR der Plattform-Session, aber die Plattform-Session ueberspringt
  // /staff-Pfade explizit, sodass req.session exklusiv der Staff-Session gehoert.
  const staffSessionStore = new PgSession({ pool, tableName: "staff_session", createTableIfMissing: true, ttl: 60 * 60 * 4 });
  // Fallback-Ableitung via HMAC-SHA256 (KDF) statt schwachem String-Concat (Audit F1.2):
  // selbst wer das Plattform-Secret kennt, kann das Staff-Secret nicht trivial herleiten.
  // Prod setzt STAFF_SESSION_SECRET ohnehin explizit (P1.0); Fallback ist Dev-Komfort.
  const staffSessionSecret = process.env.STAFF_SESSION_SECRET
    || crypto.createHmac("sha256", String(config.SESSION_SECRET || "")).update("tempconnect:staff-session:v1").digest("hex");
  app.use("/staff", session({
    name: "tc.staff.sid",
    secret: staffSessionSecret,
    store: staffSessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { path: "/staff", httpOnly: true, sameSite: "strict", secure: cookieSecure, maxAge: 1000 * 60 * 60 * 4 }
  }));

  // ── Plattform-Session (tc.sid) — ueberspringt /staff-Pfade komplett ───────
  // Verhindert dass req.session nach der Staff-Session ueberschrieben wird.
  const absoluteLifetimeGuard = enforceAbsoluteLifetime();

  // Leerlauf-Frist (P5.1, Owner-Entscheidung 2026-08-01): 8 Stunden statt 14 Tage.
  // `rolling: true` verlaengert sie bei jeder Anfrage — ein Arbeitstag am Stueck ist
  // gedeckt. Das HOECHSTALTER kann express-session nicht, das erledigt
  // enforceAbsoluteLifetime weiter unten.
  const platformSessionMiddleware = session({ name: "tc.sid", secret: config.SESSION_SECRET, store: sessionStore, resave: true, saveUninitialized: false, rolling: true, cookie: { path: "/", httpOnly: true, sameSite: "lax", secure: cookieSecure, maxAge: IDLE_TIMEOUT_MS } });
  app.use((req, res, next) => {
    if (req.path.startsWith("/staff")) return next();
    return platformSessionMiddleware(req, res, next);
  });
  // Hoechstalter (P5.1): eine einmal entwendete Sitzung soll auch dann ungueltig werden,
  // wenn sie durch regelmaessige Nutzung staendig verlaengert wird. Direkt hinter der
  // Sitzung, damit jeder nachfolgende Guard eine geprueft-frische Sitzung sieht.
  app.use((req, res, next) => {
    if (req.path.startsWith("/staff")) return next();
    return absoluteLifetimeGuard(req, res, next);
  });
  // OpenAPI-Spezifikation (auto-generiert aus den Zod-Schemas, openapi/registry.js).
  // Oeffentlich + VOR den /api-Guards: keine Auth/CSRF noetig, read-only statische Datei.
  app.get("/api/openapi/spec.json", (req, res) => {
    res.type("application/json").sendFile(path.join(process.cwd(), "openapi", "spec.json"));
  });

  // Swagger-UI fuer die OpenAPI-Spezifikation — der publizierte Integrationsvertrag fuer
  // SAP/HR/Lohn-Teams. Public + read-only. Laedt Swagger-UI von jsDelivr (keine neue npm-Dep)
  // → route-eigene CSP (ueberschreibt die globale helmet-CSP nur fuer diese Doku-Seite).
  app.get("/api/docs", (_req, res) => {
    res.set("Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https:; " +
      "connect-src 'self'; font-src 'self' https://cdn.jsdelivr.net");
    res.type("html").send(
      "<!doctype html><html lang=\"de\"><head><meta charset=\"utf-8\">" +
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
      "<title>TempConnect API — Dokumentation</title>" +
      "<link rel=\"stylesheet\" href=\"https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css\">" +
      "</head><body><div id=\"swagger-ui\"></div>" +
      "<script src=\"https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js\" crossorigin></script>" +
      "<script>window.onload=function(){SwaggerUIBundle({url:\"/api/openapi/spec.json\",dom_id:\"#swagger-ui\",deepLinking:true});};</script>" +
      "</body></html>"
    );
  });

  // CSRF + demoGuard apply to both /api/ and /api/v1/
  app.use("/api/", csrfProtect);
  app.use("/api/", demoGuard);
  app.use(idempotencyMiddleware(pool, { logger }));
  app.use(orgContextMiddleware(pool));

  // API-Key-Auth: vor Session-Enrichment, damit req.orgId gesetzt werden kann
  app.use("/api/", apiKeyAuthMiddleware(pool, { logger, config }));

  // ── Enrich req.log with session context (userId, orgId) ───────────────
  // Must be AFTER session + orgContext so the values are available.
  app.use((req, _res, next) => {
    if (req.log && (req.session?.userId || req.orgId)) {
      req.log = req.log.child({
        ...(req.session?.userId && { userId: req.session.userId }),
        ...(req.orgId && { orgId: req.orgId })
      });
    }
    next();
  });

  app.use(sentryContextMiddleware);
  app.use(auditWriteMiddleware(pool, { logger }));
  const limiters = await createRateLimiters(config, logger);
  app.use("/api/", limiters.apiLimiter);

  // ── API v1 Router ─────────────────────────────────────────────────────
  // All domain routes live on a versioned sub-router.
  // Mounted on /api/v1 (canonical) AND /api (backward-compat for frontend).
  const v1 = express.Router();
  const getUserAndPlan = (userId, opts) => userService.getUserAndPlan(pool, userId, opts);
  const requireFeatureGate = (featureKey) => requireFeature(featureKey, { getUserAndPlan, logger });
  const deps = { pool, logger, config, sendMail, requireAuth, getUserAndPlan, requireFeature: requireFeatureGate, stripe, ...limiters };
  /*
   * M1.9 — DERSELBE VERSANDWEG FUER DIE HINTERGRUNDTAKTE.
   *
   * `sendMail` ist eine Schliessung ueber `config`, `mailTransport` und
   * `mailNotieren`: sie unterdrueckt Demo-Adressen, haelt den M1.3-Riegel
   * (kein stiller Erfolg ohne Versandweg), setzt den HGB-Absenderfuss und
   * schreibt das Versandprotokoll. Der Mahnlauf laeuft ab jetzt auch als
   * eingeplanter Takt, und der startet in `server.js` — ausserhalb dieser
   * Schliessung.
   *
   * Er bekommt deshalb GENAU DIESE Funktion gereicht, nicht `emailService`
   * direkt. Ein zweiter Versandweg fuer Mahnungen waere ein Weg ohne Riegel,
   * ohne Protokoll und ohne Pflichtangaben — bei der einen Mailsorte, die
   * sicher an einen echten zahlenden Kunden geht.
   */
  app.locals.sendMail = sendMail;
  app.get("/health", simpleHealthHandler);

  // ── Prometheus metrics endpoint (Admin-Secret protected) ──────────────
  app.get("/metrics", (req, res) => {
    const secret = req.headers["x-admin-secret"] || req.query.secret;
    if (!config.ADMIN_SECRET || secret !== config.ADMIN_SECRET) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }
    return metricsEndpoint(req, res);
  });

  // Register DB pool gauges + query instrumentation for Prometheus
  registerDbPoolMetrics(pool);
  wrapPoolWithMetrics(pool);

  /*
   * ═══════════════════════════════════════════════════════════════════════
   * M2.6 — DER ARBEITERRIEGEL STEHT VOR ALLEM ANDEREN
   * ═══════════════════════════════════════════════════════════════════════
   * Owner-Entscheid 2026-09-03: fail-closed. Eine Arbeitersitzung erreicht nur
   * die Wege aus `config/arbeiterRiegel.js`; jede neue Route ist fuer sie zu,
   * bis jemand sie eintraegt.
   *
   * DIE ZEILE MUSS DIE ERSTE BLEIBEN. Jeder Router darunter ist damit gedeckt —
   * auch die, die es morgen gibt. Rutscht sie nach unten, sind genau die Router
   * darueber ungeschuetzt, und zwar lautlos: sie funktionieren ja weiter.
   * `arbeiterRiegel.test.js` haelt die Position fest.
   *
   * Und sie haengt am ROUTER, nicht am Mount: `v1` ist zweimal montiert
   * (`/api/v1` und `/api`). Am Mount haette man den Riegel mit dem Weglassen
   * von "/v1" umgangen.
   */
  v1.use(arbeiterRiegel({ logger }));

  v1.use(createCsrfRouter(deps));
  v1.use(createOAuthRouter(deps));
  v1.use(createScimRouter(deps));
  v1.use(createHealthRouter(deps));
  v1.use(createAuthRouter(deps));
  v1.use(createMeRouter(deps));
  v1.use(createPlansRouter(deps));
  v1.use(createPublicPlansRouter(deps));
  /* M1.6 — ohne Konto lesbar, bewusst NEBEN dem Tarifkatalog und nicht
   * darin: der eine beschreibt Preise, der andere den Markt. */
  v1.use(createSchaufensterRouter(deps));
  v1.use(createPilotPreregistrationRouter(deps));
  v1.use(createSubscriptionRequestsRouter(deps));
  v1.use(createSubscriptionDocumentsRouter(deps));
  v1.use(createGeoRouter(deps));
  v1.use(createListingsRouter(deps));
  v1.use(createCapacitiesRouter(deps));
  v1.use(createInternalRouter(deps));
  v1.use(createRateCardsRouter(deps));
  v1.use(createSpendAnalyticsRouter(deps));
  v1.use(createDataGovernanceRouter(deps));
  v1.use(createPaymentRouter(deps));
  v1.use(createProofsRouter(deps));
  v1.use(createMarketplaceRouter(deps));
  // Anfrage-Flow (/requests, /my/requests/*, …): in fc24b94 versehentlich mit-entfernt, als
  // createSubscriptionRequestsRouter (namensähnlich) hinzukam → live verlinkte Seiten liefen auf 404.
  // Wiederhergestellt (eigenes Feature, kein Duplikat zum Marketplace-Capacity-Exchange).
  v1.use(createRequestsRouter(deps));
  v1.use(createSlaSearchJobsRouter(deps));
  v1.use(createRequisitionsRouter(deps));
  v1.use(createVendorPoolRouter(deps));
  v1.use(createReportingRouter(deps));
  v1.use(createOrganizationsRouter(deps));
  v1.use(createApprovalsRouter(deps));
  v1.use(createSuppliersRouter(deps));
  v1.use(createContractsRouter(deps));
  v1.use(createAssignmentsRouter(deps));
  v1.use(createSettingsRouter(deps));
  v1.use(createNotificationsRouter(deps));
  v1.use(createNotificationStreamRouter(deps));
  v1.use(createCapacityExchangeRouter(deps));
  v1.use(createSupplierPoolsRouter(deps));
  v1.use(createAnalyticsRouter(deps));
  v1.use(createCapacityDiscoveryRouter(deps));
  v1.use(createSearchRouter(deps));
  v1.use(createComplianceDocsRouter(deps));
  v1.use(createDocumentCenterRouter(deps));
  v1.use(createCompanyProfileRouter(deps));
  v1.use(createRatingsRouter(deps));
  v1.use(createDealFeedbackRouter(deps));
  v1.use(createActivityFeedRouter(deps));
  v1.use(createAdminRouter(deps));
  v1.use(createWorkersRouter(deps));
  v1.use(createWorkerPortalRouter(deps));
  v1.use(createSkillCatalogRouter(deps));
  v1.use(createAgencyPortalRouter(deps));
  v1.use(createCompanyTimesheetsRouter(deps));
  v1.use(createTimesheetsRouter(deps));
  v1.use(createInvoicesRouter(deps));
  v1.use(createOfferAssetsRouter(deps));
  v1.use(createDemoRouter(deps));
  v1.use(createIntegrationsRouter(deps));
  v1.use(createMatchingRouter(deps));
  v1.use(createWorkforceRouter(deps));
  v1.use(createEmergencyRouter(deps));
  v1.use(createSmartPricingRouter(deps));
  v1.use(createReputationRouter(deps));
  v1.use(createPreferredVendorsRouter(deps));
  v1.use(createOnboardingRouter(deps));
  v1.use(createOrgControlCenterRouter(deps));
  v1.use(createBountyRouter(deps));
  v1.use(createReferralProgramRouter(deps));
  v1.use(createSSORouter(deps));
  v1.use(createMentoringRouter(deps));
  v1.use(createCreditsRouter(deps));
  v1.use(createMFARouter(deps));
  v1.use(createProductReleasesRouter(deps));
  v1.use(createStrategicCollaborationRouter(deps));
  v1.use(createInternalControlCenterRouter(deps));
  v1.use(createSupportRouter(deps));
  // Der Weg HINEIN (Plan I, Abschnitt 10). Bewusst NICHT unter dem Praefix
  // `/support` — dort steht das Staff-Tor `supportAuth`, und eine Kundenroute
  // darunter waere ein Loch, das ab da fuer alle Routen darunter gilt.
  v1.use(createSupportIntakeRouter(deps));
  // Marketplace Visibility Center (Phase 4 Track A — M-04 2026-05-30)
  v1.use(createProfileVisibilityRouter(deps));
  v1.use(createProfileAnalyticsRouter(deps));
  v1.use(createProfileRankingsRouter(deps));
  v1.use(createProfileBountiesRouter(deps));

  // 404 catch-all for unmatched API routes
  v1.use((req, res) => {
    res.status(404).json({ success: false, data: null, error: { code: "NOT_FOUND", message: "Endpoint nicht gefunden" } });
  });
  // OCC owner routes mounted ahead of the generic /api router fallback behavior.
  app.use("/api/v1", createOwnerControlCenterRouter(deps));
  app.use("/api", createOwnerControlCenterRouter(deps));

  // Mount v1 router: /api/v1 (canonical) + /api (backward-compat)
  // Mount v1 router: /api/v1 (canonical) + /api (backward-compat)
  app.use("/api/v1", v1);
  app.use("/api", v1);

  // ── Staff Control Center: strikt getrennter Mount auf /staff/api ─────
  // Keine Verbindung zu /api-Middleware (csrfProtect/demoGuard/orgContext/api-key),
  // damit normale Plattform-Mechanismen den Team-Zugang nicht aufweichen.
  // Abo-Kunden, Org-Owner und Plattform-Admins haben hier KEINEN Zugriff.
  // SCC WAVE 03: Security-Middlewares VOR allen SCC-Routen
  const sccIsLocalDev = !config.BASE_URL || /localhost|127\.0\.0\.1/.test(String(config.BASE_URL || "").toLowerCase());
  const staffOriginGuard = createStaffOriginGuard({ baseUrl: config.BASE_URL, isLocalDev: sccIsLocalDev, logger });
  app.use("/staff/api", staffApiCacheControl);
  app.use("/staff/api", staffSecurityHeaders);
  app.use("/staff/api", staffOriginGuard);
  app.use("/staff/api", limiters.staffMutationLimiter);
  // SCC WAVE 01: staffLoginLimiter aus createRateLimiters injizieren
  /*
   * `sendMail` und `getUserAndPlan` fehlten hier bis 2026-10-01 — der Router hat
   * `sendMail` immer erwartet (Benachrichtigungen bei Statuswechseln, Umwandlung
   * strategischer Anfragen), bekam aber `undefined`. Jede dieser Mails endete still
   * als "kein Versandweg". Seit W-E10 versendet das Staff CC auch Produkt-Updates.
   * Probe: test/staffMailVerdrahtung.test.js.
   */
  const sccDeps = { pool, logger, sendMail, getUserAndPlan, staffLoginLimiter: limiters.staffLoginLimiter };
  app.use("/staff/api", createStaffControlAuthRouter(sccDeps));
  app.use("/staff/api", createStaffControlCenterRouter(sccDeps));
  app.use("/staff/api", (req, res) => {
    res.status(404).json({ success: false, error: { code: "SCC_ENDPOINT_NOT_FOUND" } });
  });

  // Sentry error handler (Sentry v9: captures + forwards to custom handler)
  setupSentryErrorHandler(app);

  // ── Centralized error handler ──────────────────────────────────────────
  // Catches all next(err) from routes. Uses pino's err serializer for
  // proper structured error output (type, message, stack).
  // Sentry gets the error via captureException for alerting.
  app.use((err, req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    // SEC-006: Never leak system error codes (ECONNREFUSED, ENOENT etc.) in responses
    const code = status >= 500 ? "SERVER_ERROR" : (err.code || "CLIENT_ERROR");
    const message = status < 500 ? (err.message || "Unbekannter Fehler") : "Interner Serverfehler. Bitte spaeter erneut versuchen.";

    const logData = {
      err,               // pino err serializer extracts type + message + stack
      correlationId: req.correlationId,
      method: req.method,
      url: req.originalUrl,
      status,
      errorCode: code,
      userId: req.session?.userId || undefined,
      orgId: req.orgId || undefined
    };

    if (status >= 500) {
      logger.error(logData, "server_error");
    } else {
      logger.warn(logData, "client_error");
    }

    captureException(err, { method: req.method, path: req.originalUrl, correlationId: req.correlationId });
    if (!res.headersSent) {
      res.status(status).json({ success: false, data: null, error: { code, message } });
    }
  });

  return app;
}


