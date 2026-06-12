/**
 * Enterprise Domain Event Logger.
 * Wraps den Pino-Logger aus config/index.js mit:
 *   - Domaenenspezifische Event-Methoden (user_login, offer_created, etc.)
 *   - Child-Logger-Factory fuer Services (automatischer Service-Kontext)
 *   - Request-Correlation-ID (X-Request-ID / X-Correlation-ID)
 *   - Structured context propagation
 *
 * Nutzung:
 *   import { domainLogger, createServiceLogger, correlationMiddleware } from '../utils/logger.js';
 *   domainLogger.userLogin({ userId, email, ip });
 *   const log = createServiceLogger('requisitionService');
 *   log.info({ requisitionId }, 'Requisition erstellt');
 */

import { randomUUID } from "node:crypto";
import { logger } from "../config/index.js";

/* ── Correlation-ID Middleware ────────────────────────────
 * Setzt req.correlationId und fuegt es in den Response-Header ein.
 * Muss VOR allen Routes eingebunden werden.
 */
export function correlationMiddleware(req, _res, next) {
  req.correlationId =
    req.headers["x-correlation-id"] ||
    req.headers["x-request-id"] ||
    randomUUID();
  _res.setHeader("X-Correlation-ID", req.correlationId);
  next();
}

/* ── Child-Logger Factory ────────────────────────────────
 * Erzeugt einen Pino-Child-Logger mit festem Service-Kontext.
 */
export function createServiceLogger(serviceName) {
  return logger.child({ service: serviceName });
}

/* ── Request-scoped Logger ───────────────────────────────
 * Erzeugt einen Logger mit Correlation-ID aus dem Request.
 */
export function createRequestLogger(req) {
  return logger.child({
    correlationId: req.correlationId || null,
    method: req.method,
    path: req.originalUrl
  });
}

/* ── Domain Event Logger ─────────────────────────────────
 * Strukturierte Domain-Events — fuer Audit, Analytics, Debugging.
 * Jede Methode loggt ein Event mit einheitlichem Format:
 *   { event, domain, ...context }
 */
class DomainEventLogger {
  constructor(baseLogger) {
    this._log = baseLogger.child({ component: "domain_events" });
  }

  /** Benutzer hat sich eingeloggt */
  userLogin({ userId, email, ip, method = "session" } = {}) {
    this._log.info({ event: "user_login", userId, email, ip, method }, "User login");
  }

  /** Benutzer hat sich ausgeloggt */
  userLogout({ userId, email } = {}) {
    this._log.info({ event: "user_logout", userId, email }, "User logout");
  }

  /** Benutzer hat sich registriert */
  userRegistered({ userId, email, role } = {}) {
    this._log.info({ event: "user_registered", userId, email, role }, "User registered");
  }

  /** Angebot erstellt */
  offerCreated({ offerId, requestId, actorId, orgId } = {}) {
    this._log.info(
      { event: "offer_created", offerId, requestId, actorId, orgId },
      "Offer created"
    );
  }

  /** Deal erstellt / abgeschlossen */
  dealCreated({ dealId, requestId, actorId, status } = {}) {
    this._log.info(
      { event: "deal_created", dealId, requestId, actorId, status },
      "Deal created"
    );
  }

  dealCompleted({ dealId, requestId, actorId } = {}) {
    this._log.info(
      { event: "deal_completed", dealId, requestId, actorId },
      "Deal completed"
    );
  }

  /** Capacity Post erstellt */
  capacityCreated({ capacityId, supplierId, role, locationCity } = {}) {
    this._log.info(
      { event: "capacity_created", capacityId, supplierId, role, locationCity },
      "Capacity post created"
    );
  }

  /** Capacity Post Status-Wechsel */
  capacityTransition({ capacityId, from, to, actorId } = {}) {
    this._log.info(
      { event: "capacity_transition", capacityId, from, to, actorId },
      `Capacity ${from} -> ${to}`
    );
  }

  /** Supplier eingeladen */
  supplierInvited({ buyerOrgId, supplierOrgId, actorId, tier } = {}) {
    this._log.info(
      { event: "supplier_invited", buyerOrgId, supplierOrgId, actorId, tier },
      "Supplier invited"
    );
  }

  /** Supplier genehmigt */
  supplierApproved({ entryId, actorId, tier } = {}) {
    this._log.info(
      { event: "supplier_approved", entryId, actorId, tier },
      "Supplier approved"
    );
  }

  /** Supplier gesperrt */
  supplierBlocked({ entryId, actorId, reason } = {}) {
    this._log.warn(
      { event: "supplier_blocked", entryId, actorId, reason },
      "Supplier blocked"
    );
  }

  /** Requisition erstellt */
  requisitionCreated({ requisitionId, orgId, role, actorId } = {}) {
    this._log.info(
      { event: "requisition_created", requisitionId, orgId, role, actorId },
      "Requisition created"
    );
  }

  /** Requisition Status-Wechsel */
  requisitionTransition({ requisitionId, from, to, actorId } = {}) {
    this._log.info(
      { event: "requisition_transition", requisitionId, from, to, actorId },
      `Requisition ${from} -> ${to}`
    );
  }

  /** Compliance-Dokument hochgeladen */
  complianceDocUploaded({ docId, orgId, docType, actorId } = {}) {
    this._log.info(
      { event: "compliance_doc_uploaded", docId, orgId, docType, actorId },
      "Compliance document uploaded"
    );
  }

  /** Compliance-Dokument verifiziert */
  complianceDocVerified({ docId, orgId, verifierId } = {}) {
    this._log.info(
      { event: "compliance_doc_verified", docId, orgId, verifierId },
      "Compliance document verified"
    );
  }

  /** Search-Query ausgefuehrt */
  searchPerformed({ query, type, resultCount, durationMs, source } = {}) {
    this._log.info(
      { event: "search_performed", query, type, resultCount, durationMs, source },
      "Search performed"
    );
  }

  /** Generisches Domain-Event (fuer alles andere) */
  custom(eventName, context = {}) {
    this._log.info({ event: eventName, ...context }, eventName);
  }
}

/* ── Fire-and-forget-Fehlersenke (F1.3) ───────────────────
 * Ersetzt stille `.catch(() => {})` an non-blocking Pfaden (Notifications,
 * Analytics, Audit-Spiegel, touchLastUsed, ROLLBACK): der Geschaeftsfluss
 * bleibt ungestoert, aber der Fehler ist im Log SICHTBAR statt verschluckt.
 * Nutzung: somePromise.catch(swallow("kontext-label"));
 */
export function swallow(label) {
  return (err) => {
    try {
      logger.warn({ err: err?.message || String(err) }, `${label}: non-blocking Fehler verschluckt`);
    } catch { /* Logging darf nie werfen */ }
  };
}

/** Singleton Domain Event Logger */
export const domainLogger = new DomainEventLogger(logger);

export default { domainLogger, createServiceLogger, createRequestLogger, correlationMiddleware };
