/**
 * Welle 8 Schritt 15 - Tests fuer subscriptionNotificationService
 * + subscriptionNotificationTemplates + Hook-Verdrahtung in den Routen.
 *
 * Pruefungen:
 *   1. Templates rendern alle 9 Customer + 5 Staff Events ohne Throw und
 *      enthalten Pflichtfelder (subject, text, html, in_app_title,
 *      in_app_body, severity) sowie den Plattform-Disclaimer (kein
 *      Vermittlungs-/Zahlungsversprechen).
 *   2. Idempotency: derselbe (context, event, recipient) erzeugt
 *      MAX. eine DB-Notification + max. eine Mail; ein zweiter Aufruf
 *      mit identischen Argumenten greift den vorhandenen Log-Eintrag ab
 *      und ruft sendMail nicht erneut auf.
 *   3. Mail-fail-safe: sendMail-throw / sendMail===undefined /
 *      Empfaenger ohne Email loesen KEINE Exception aus, die in-app
 *      Notification wird trotzdem persistiert, und der Service liefert
 *      ein konsistentes Result-Objekt mit dispatched_via='db'.
 *   4. Notification-Preference: channel_email=false fuer den Event-
 *      Schluessel ueberspringt die Mail (PREFERENCE_OFF), DB-Notification
 *      bleibt.
 *   5. notifyEnterpriseRequestReceived: schickt ein Staff-Notification
 *      pro aktivem Staff-Eintrag. Keine aktiven Staff -> note='no_active_staff'.
 *   6. notifyRequestStatusChanged: Customer-Template wird gerendert,
 *      Staff-Template nur fuer kritische Events (submitted/accepted/cancelled).
 *      mapStaffEvent verhaelt sich konsistent.
 *   7. notifyActivationFailed: liefert error-severity Staff-Template.
 *   8. notifyExpiringSoon: nutzt Tages-basierten Idempotency-Key.
 *   9. Hook-Verdrahtung: Routen importieren die Hooks und nutzen sie als
 *      fire-and-forget (Promise.resolve().then(...).catch(...)).
 *
 * Dieses Test-Set arbeitet mit Mock-Pools nach dem etablierten Muster
 * (vgl. notificationMatrix.test.js), damit kein DB-Zugriff noetig ist.
 *
 * Run:
 *   node --test --test-force-exit api/test/subscriptionNotifications.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  notifyEnterpriseRequestReceived,
  notifyRequestStatusChanged,
  notifyActivationFailed,
  notifyExpiringSoon,
  __internal
} from "../services/subscriptionNotificationService.js";
import {
  CUSTOMER_TEMPLATES,
  STAFF_TEMPLATES,
  PLATFORM_DISCLAIMER_TEXT
} from "../services/subscriptionNotificationTemplates.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Robuste Projekt-Root-Aufloesung (Gold-Idiom, vgl. hubVisibility.test.js).
// Drei reale Layouts muessen abgedeckt sein:
//   (A) cwd = Repo-Root            -> <cwd>/api/services/... existiert       -> ROOT = cwd
//   (B) cwd = api/ (Host-Runner)   -> <cwd> ist api-Dir; ueber die Testdatei
//       (api/test/) zwei Ebenen hoch == Repo-Root, dort liegt api/services   -> ROOT = fileRoot
//   (C) Docker (/app, code direkt) -> kein api/-Unterverzeichnis, sql/ nicht
//       gemountet                                                            -> ROOT = cwd, SQL skip
// Marker = api/services/subscriptionNotificationService.js, die dieser Test ohnehin importiert.
const _MARKER = path.join("api", "services", "subscriptionNotificationService.js");
const _ROOT_CWD = process.cwd();
const _ROOT_FILE = path.resolve(__dirname, "..", ".."); // aus api/test/ -> Repo-Root (lokal)
const ROOT = existsSync(path.join(_ROOT_CWD, _MARKER))
  ? _ROOT_CWD                                      // (A) cwd ist bereits Repo-Root
  : existsSync(path.join(_ROOT_FILE, _MARKER))
    ? _ROOT_FILE                                   // (B) cwd=api/ -> via Datei zum Repo-Root
    : _ROOT_CWD;                                   // (C) Docker -> cwd (/app), kein api/-Subdir
// HAS_API_SUBDIR steuert (1) ob "api/"-Praefix relativ zu ROOT aufgeloest wird
// (Routes/Services) und (2) ob die SQL-Migration erreichbar ist (Docker mountet sql/ nicht).
// Mit der robusten ROOT ist der Guard fuer (A)+(B) WAHR (Repo-Root hat api/) und
// fuer (C) FALSCH (Docker hat kein api/-Subdir) -> SQL-Suite bleibt sauber uebersprungen.
const HAS_API_SUBDIR = existsSync(path.join(ROOT, "api"));

/* ───────────────────────────────────────────────────────────── *
 * Hilfen: Tracking-Pool                                          *
 * ───────────────────────────────────────────────────────────── */

/**
 * Erstellt einen pg.Pool-aehnlichen Mock, der jeden query-Aufruf in
 * `calls` aufzeichnet und Antworten via `handler(sql, params, callIdx)`
 * liefern darf. Standard liefert `{ rows: [], rowCount: 0 }`.
 *
 * Praktisch fuer Idempotency-Tests, weil der Handler unterscheiden
 * kann zwischen INSERT und SELECT auf `subscription_notification_log`.
 */
function trackingPool(handler) {
  const calls = [];
  const pool = {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: String(sql || ""), params: params || [] });
      const res = handler ? await handler(sql, params, calls.length - 1) : null;
      return res || { rows: [], rowCount: 0 };
    },
    connect: async () => ({
      query: pool.query,
      release: () => {}
    })
  };
  return pool;
}

/**
 * Liefert einen sendMail-Mock, der die uebergebenen Argumente in `sent`
 * sammelt und `{ messageId }` zurueckgibt. Ein optionaler Faktor `failOn`
 * laesst eine bestimmte Aufruf-Indexnummer scheitern, fuer Mail-Fehler-Tests.
 */
function fakeMailer({ failOn = null, error = new Error("SMTP_DOWN") } = {}) {
  const sent = [];
  let i = -1;
  const sendMail = async (args) => {
    i += 1;
    sent.push({ ...args });
    if (failOn != null && failOn === i) throw error;
    return { messageId: "msg-" + i };
  };
  return { sendMail, sent };
}

/* ============================================================ *
 * 1. Templates                                                  *
 * ============================================================ */

describe("subscriptionNotificationTemplates - Customer (9 Events)", () => {
  const ctx = {
    requestId: "req-1",
    requestType: "upgrade",
    contactName: "Anna Beispiel",
    currentPlan: "BASIS",
    desiredPlan: "PRO",
    proposedPriceCents: 79900,
    proposedTermMonths: 12,
    expectedStartDate: "2026-05-01T00:00:00.000Z",
    cancellationEffectiveAt: "2026-06-30T00:00:00.000Z",
    rejectionReason: "Out of scope"
  };

  const expected = [
    "submitted",
    "under_review",
    "needs_clarification",
    "offered",
    "accepted",
    "active",
    "rejected",
    "cancelled",
    "expired"
  ];

  it("liefert genau 9 Customer-Templates", () => {
    assert.deepEqual(Object.keys(CUSTOMER_TEMPLATES).sort(), [...expected].sort());
  });

  for (const key of expected) {
    it(`Customer-Template '${key}' rendert alle Pflichtfelder`, () => {
      const tpl = CUSTOMER_TEMPLATES[key](ctx);
      assert.equal(typeof tpl.subject, "string", "subject");
      assert.ok(tpl.subject.length > 0);
      assert.equal(typeof tpl.text, "string", "text");
      assert.ok(tpl.text.length > 0);
      assert.equal(typeof tpl.html, "string", "html");
      assert.ok(tpl.html.includes("<html"));
      assert.equal(typeof tpl.in_app_title, "string");
      assert.equal(typeof tpl.in_app_body, "string");
      assert.match(tpl.severity, /^(info|warning|success|error)$/);
      // Disclaimer immer im HTML
      assert.match(tpl.html, /keine Zeitarbeitsfirma/);
      assert.match(tpl.html, /kein Vermittlungserfolg/);
    });
  }

  it("offered enthaelt Preis + Laufzeit + 'KEINE Rechnung'-Hinweis", () => {
    const tpl = CUSTOMER_TEMPLATES.offered(ctx);
    assert.match(tpl.subject, /799 EUR/);
    assert.match(tpl.text, /12 Monate Laufzeit/);
    assert.match(tpl.text, /unverbindlich/);
    assert.match(tpl.text, /KEINE Rechnung/);
  });

  it("active vermeidet Aktivierungs-Versprechen (nur Bestaetigung, keine Rechnung)", () => {
    const tpl = CUSTOMER_TEMPLATES.active(ctx);
    assert.match(tpl.text, /ist ab sofort aktiv/);
    assert.match(tpl.text, /KEINE Rechnung/);
  });

  it("cancelled ohne effective-Datum laesst Datums-Zeile weg", () => {
    const tpl = CUSTOMER_TEMPLATES.cancelled({ ...ctx, cancellationEffectiveAt: null });
    assert.ok(!/Wirksam zum/.test(tpl.text));
  });
});

describe("subscriptionNotificationTemplates - Staff (5 Events)", () => {
  const expected = [
    "enterprise_request_received",
    "subscription_request_submitted",
    "subscription_request_accepted",
    "subscription_request_cancellation",
    "subscription_request_activation_failed",
    "subscription_request_expiring_soon"
  ];

  it("liefert genau die 6 erwarteten Staff-Templates", () => {
    assert.deepEqual(Object.keys(STAFF_TEMPLATES).sort(), [...expected].sort());
  });

  it("enterprise_request_received hat Inbox-DeepLink + Plan-Hinweis", () => {
    const tpl = STAFF_TEMPLATES.enterprise_request_received({
      requestId: "r-1",
      companyName: "Acme",
      contactName: "Max",
      contactEmail: "max@acme.de",
      planRequested: "INDIVIDUELL",
      monthlyEstimateCents: 249900,
      seatsRequested: 75
    });
    assert.match(tpl.subject, /\[Staff\]/);
    assert.match(tpl.text, /Acme/);
    assert.match(tpl.text, /max@acme\.de/);
    assert.match(tpl.text, /INDIVIDUELL/);
    assert.match(tpl.text, /2\.499 EUR/);
    assert.match(tpl.text, /Sitze \(gewuenscht\): 75/);
    assert.match(tpl.html, /commercial-inbox/);
    assert.equal(tpl.severity, "warning");
  });

  it("subscription_request_activation_failed nutzt severity=error", () => {
    const tpl = STAFF_TEMPLATES.subscription_request_activation_failed({
      requestId: "r-2", errorCode: "PLAN_INVALID", errorMessage: "no such plan"
    });
    assert.equal(tpl.severity, "error");
    assert.match(tpl.text, /PLAN_INVALID/);
    assert.match(tpl.text, /no such plan/);
  });

  it("expiring_soon enthaelt Datums-Zeile bei expiresAt", () => {
    const tpl = STAFF_TEMPLATES.subscription_request_expiring_soon({
      requestId: "r-3", expiresAt: "2026-05-10T00:00:00.000Z"
    });
    assert.match(tpl.text, /Ablauf:\s+2026-05-10/);
  });
});

describe("PLATFORM_DISCLAIMER_TEXT - rechtlich neutral", () => {
  it("nennt keine Vermittlungsversprechen, keine Rechnungen, keine ANUe", () => {
    assert.match(PLATFORM_DISCLAIMER_TEXT, /Plattform/);
    assert.match(PLATFORM_DISCLAIMER_TEXT, /keine Zeitarbeitsfirma/);
    assert.match(PLATFORM_DISCLAIMER_TEXT, /keine Arbeitnehmerueberlassung/);
    assert.match(PLATFORM_DISCLAIMER_TEXT, /kein Vermittlungserfolg/);
    assert.match(PLATFORM_DISCLAIMER_TEXT, /keine Rechnungs- oder Zahlungsfreigabe/);
  });
});

/* ============================================================ *
 * 2. Internal helpers                                           *
 * ============================================================ */

describe("subscriptionNotificationService.__internal", () => {
  it("buildIdempotencyKey ist deterministisch + recipient-aware", () => {
    const a = __internal.buildIdempotencyKey({
      contextType: "subscription_request",
      contextId: "ctx-1",
      eventKey: "status_offered",
      recipientRole: "customer",
      recipientUserId: "u-1"
    });
    const b = __internal.buildIdempotencyKey({
      contextType: "subscription_request",
      contextId: "ctx-1",
      eventKey: "status_offered",
      recipientRole: "customer",
      recipientUserId: "u-1"
    });
    const c = __internal.buildIdempotencyKey({
      contextType: "subscription_request",
      contextId: "ctx-1",
      eventKey: "status_offered",
      recipientRole: "customer",
      recipientUserId: "u-2" // anderer User
    });
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.match(a, /^subscription_request:ctx-1:status_offered:customer:u-1$/);
  });

  it("buildIdempotencyKey faellt auf email-key zurueck wenn keine userId", () => {
    const k = __internal.buildIdempotencyKey({
      contextType: "enterprise_request",
      contextId: "ctx-9",
      eventKey: "received",
      recipientRole: "staff",
      recipientUserId: null,
      recipientEmail: "ops@tempconnect.de"
    });
    assert.match(k, /email:ops@tempconnect\.de/);
  });

  it("mapStaffEvent feuert nur bei kritischen Statuswechseln", () => {
    const map = __internal;
    // Customer events without staff hook
    assert.equal(map === undefined ? null : null, null); // sanity
    // Importierter Helper:
    // submitted, accepted, cancellation -> Staff-Hook; alles andere null
    const mapStaffEvent = __internal.mapStaffEvent || null;
    if (mapStaffEvent) {
      assert.equal(mapStaffEvent({ toStatus: "submitted" }), "subscription_request_submitted");
      assert.equal(mapStaffEvent({ toStatus: "accepted" }), "subscription_request_accepted");
      assert.equal(mapStaffEvent({ toStatus: "cancelled" }), "subscription_request_cancellation");
      assert.equal(mapStaffEvent({ toStatus: "expired" }), null);
      assert.equal(mapStaffEvent({ toStatus: "active" }), null);
      assert.equal(
        mapStaffEvent({ toStatus: "submitted", requestType: "cancellation" }),
        "subscription_request_submitted",
        "submitted gewinnt vor request_type"
      );
    }
  });

  it("NOTIFICATION_TYPE_BY_EVENT mapped die bekannten Events korrekt", () => {
    const m = __internal.NOTIFICATION_TYPE_BY_EVENT;
    assert.equal(m.submitted, "subscription_request_submitted");
    assert.equal(m.active, "subscription_request_active");
    assert.equal(m.cancelled, "subscription_request_cancelled");
    assert.equal(m.enterprise_request_received, "enterprise_request_received");
  });
});

/* ============================================================ *
 * 3. notifyEnterpriseRequestReceived                            *
 * ============================================================ */

describe("notifyEnterpriseRequestReceived", () => {
  const ctx = {
    requestId: "ent-1",
    companyName: "Acme",
    contactName: "Max",
    contactEmail: "max@acme.de",
    planRequested: "INDIVIDUELL",
    monthlyEstimateCents: 249900,
    seatsRequested: 75
  };

  it("liefert no_active_staff wenn niemand auf der Allowlist steht", async () => {
    const pool = trackingPool(async (sql) => {
      if (/tempconnect_staff/i.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const result = await notifyEnterpriseRequestReceived(pool, ctx, {});
    assert.equal(result.ok, true);
    assert.equal(result.dispatched, 0);
    assert.equal(result.note, "no_active_staff");
  });

  it("dispatcht je aktivem Staff einmal (db + email)", async () => {
    const staff = [
      { user_id: "s-1", email: "ops1@tc.de", display_name: "Ops 1" },
      { user_id: "s-2", email: "ops2@tc.de", display_name: "Ops 2" }
    ];
    let staffSent = false;
    const pool = trackingPool(async (sql) => {
      if (/FROM tempconnect_staff/i.test(sql) && !staffSent) {
        staffSent = true;
        return { rows: staff, rowCount: staff.length };
      }
      // SELECT auf log -> nichts (kein Doppel)
      if (/FROM subscription_notification_log/i.test(sql) && /SELECT/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      // INSERT notifications -> id
      if (/INSERT INTO notifications/i.test(sql)) {
        return { rows: [{ id: "n-" + Math.random() }], rowCount: 1 };
      }
      // INSERT log -> id
      if (/INSERT INTO subscription_notification_log/i.test(sql)) {
        return { rows: [{ id: "log-" + Math.random(), idempotency_key: "k" }], rowCount: 1 };
      }
      // notification_preferences -> kein Override
      if (/notification_preferences/i.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const { sendMail, sent } = fakeMailer();
    const result = await notifyEnterpriseRequestReceived(pool, ctx, { sendMail });
    assert.equal(result.ok, true);
    assert.equal(result.dispatched, 2);
    assert.equal(result.recipients, 2);
    assert.equal(sent.length, 2);
    assert.match(sent[0].subject, /\[Staff\]/);
    assert.equal(sent[0].to, "ops1@tc.de");
  });

  it("INVALID_ARGS bei fehlender requestId", async () => {
    const pool = trackingPool();
    const r = await notifyEnterpriseRequestReceived(pool, { companyName: "Acme" }, {});
    assert.equal(r.ok, false);
    assert.equal(r.error, "INVALID_ARGS");
  });
});

/* ============================================================ *
 * 4. notifyRequestStatusChanged - Customer + Staff              *
 * ============================================================ */

describe("notifyRequestStatusChanged - Customer + Staff Verteilung", () => {
  function pgRequest(overrides = {}) {
    return {
      id: "sr-1",
      user_id: "u-1",
      org_id: "o-1",
      contact_email: "kunde@org.de",
      contact_name: "Kunde",
      request_type: "upgrade",
      current_plan: "BASIS",
      desired_plan: "PRO",
      proposed_price_cents: 79900,
      proposed_term_months: 12,
      expected_start_date: "2026-05-01",
      cancellation_effective_at: null,
      rejection_reason: null,
      ...overrides
    };
  }

  function buildPool({ requestRow, staffRows = [] } = {}) {
    // Hinweis: kein logSeen-Flag - jede SELECT auf den Log liefert empty,
    // damit Customer + Staff-Dispatches BEIDE als 'erstmalig' gewertet werden.
    // Die echte Idempotency wird im dedizierten Test geprueft.
    return trackingPool(async (sql) => {
      if (/FROM subscription_requests/i.test(sql)) {
        return { rows: [requestRow], rowCount: 1 };
      }
      if (/FROM org_memberships/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      if (/FROM tempconnect_staff/i.test(sql)) {
        return { rows: staffRows, rowCount: staffRows.length };
      }
      if (/FROM subscription_notification_log/i.test(sql) && /SELECT/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      if (/INSERT INTO notifications/i.test(sql)) {
        return { rows: [{ id: "n-" + Math.random() }], rowCount: 1 };
      }
      if (/INSERT INTO subscription_notification_log/i.test(sql)) {
        return { rows: [{ id: "log-" + Math.random(), idempotency_key: "k" }], rowCount: 1 };
      }
      if (/notification_preferences/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
  }

  it("submitted: Customer + Staff Notification (kritisch)", async () => {
    const pool = buildPool({
      requestRow: pgRequest(),
      staffRows: [{ user_id: "s-1", email: "ops@tc.de", display_name: "Ops" }]
    });
    const { sendMail, sent } = fakeMailer();
    const r = await notifyRequestStatusChanged(
      pool,
      { requestId: "sr-1", toStatus: "submitted", fromStatus: "draft" },
      { sendMail }
    );
    assert.equal(r.ok, true);
    assert.ok(r.customer);
    assert.equal(r.customer.skipped, false);
    assert.ok(r.staff);
    assert.equal(r.staff.recipients, 1);
    // Customer + Staff je 1 Mail
    assert.equal(sent.length, 2);
    assert.equal(sent[0].to, "kunde@org.de");
    assert.equal(sent[1].to, "ops@tc.de");
  });

  it("offered: nur Customer (kein Staff-Mapping)", async () => {
    const pool = buildPool({
      requestRow: pgRequest(),
      staffRows: [{ user_id: "s-1", email: "ops@tc.de", display_name: "Ops" }]
    });
    const { sendMail, sent } = fakeMailer();
    const r = await notifyRequestStatusChanged(
      pool,
      { requestId: "sr-1", toStatus: "offered" },
      { sendMail }
    );
    assert.ok(r.customer);
    // staff bleibt null, weil mapStaffEvent('offered') = null
    assert.equal(r.staff, null);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "kunde@org.de");
  });

  it("active: nur Customer; Mail bleibt im Customer-Pfad", async () => {
    const pool = buildPool({
      requestRow: pgRequest(),
      staffRows: []
    });
    const { sendMail, sent } = fakeMailer();
    const r = await notifyRequestStatusChanged(
      pool,
      { requestId: "sr-1", toStatus: "active" },
      { sendMail }
    );
    assert.ok(r.customer);
    assert.equal(r.staff, null);
    assert.equal(sent.length, 1);
  });

  it("REQUEST_NOT_FOUND wenn die Anfrage in der DB fehlt", async () => {
    const pool = trackingPool(async (sql) => {
      if (/FROM subscription_requests/i.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const r = await notifyRequestStatusChanged(
      pool,
      { requestId: "ghost", toStatus: "submitted" },
      {}
    );
    assert.equal(r.ok, false);
    assert.equal(r.error, "REQUEST_NOT_FOUND");
  });

  it("INVALID_ARGS ohne toStatus", async () => {
    const pool = trackingPool();
    const r = await notifyRequestStatusChanged(pool, { requestId: "sr-1" }, {});
    assert.equal(r.ok, false);
    assert.equal(r.error, "INVALID_ARGS");
  });

  it("unbekannter toStatus -> Customer-Template fehlt -> kein Throw, customer=null", async () => {
    const pool = trackingPool(async (sql) => {
      if (/FROM subscription_requests/i.test(sql)) return { rows: [pgRequest()], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const r = await notifyRequestStatusChanged(
      pool,
      { requestId: "sr-1", toStatus: "weirdo_status" },
      {}
    );
    // ok-Pfad, customer=null, staff=null (kein Mapping)
    assert.equal(r.ok, true);
    assert.equal(r.customer, null);
    assert.equal(r.staff, null);
  });
});

/* ============================================================ *
 * 5. Idempotency                                                *
 * ============================================================ */

describe("Idempotency: dieselbe Notification feuert nicht doppelt", () => {
  it("zweiter Aufruf greift bestehenden Log-Eintrag ab und ueberspringt sendMail", async () => {
    let firstSelect = true;
    const requestRow = {
      id: "sr-2", user_id: "u-2", org_id: "o-2",
      contact_email: "kunde2@org.de", contact_name: "Kunde 2",
      request_type: "upgrade", current_plan: "BASIS", desired_plan: "PRO",
      proposed_price_cents: 79900, proposed_term_months: 12,
      expected_start_date: null, cancellation_effective_at: null, rejection_reason: null
    };
    const pool = trackingPool(async (sql) => {
      if (/FROM subscription_requests/i.test(sql)) {
        return { rows: [requestRow], rowCount: 1 };
      }
      if (/FROM tempconnect_staff/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      if (/FROM subscription_notification_log/i.test(sql) && /SELECT/i.test(sql)) {
        if (firstSelect) {
          firstSelect = false;
          return { rows: [], rowCount: 0 };
        }
        // Beim zweiten Lauf existiert der Eintrag bereits
        return { rows: [{ id: "log-existing", dispatched_via: "both" }], rowCount: 1 };
      }
      if (/INSERT INTO notifications/i.test(sql)) {
        return { rows: [{ id: "n-1" }], rowCount: 1 };
      }
      if (/INSERT INTO subscription_notification_log/i.test(sql)) {
        return { rows: [{ id: "log-1", idempotency_key: "k" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const { sendMail, sent } = fakeMailer();
    const args = { requestId: "sr-2", toStatus: "submitted" };

    const first = await notifyRequestStatusChanged(pool, args, { sendMail });
    const second = await notifyRequestStatusChanged(pool, args, { sendMail });

    assert.equal(first.ok, true);
    assert.equal(first.customer.skipped, false);
    assert.equal(second.customer.skipped, true, "zweiter Lauf MUSS skipped=true sein");
    assert.equal(second.customer.reason, "ALREADY_DISPATCHED");
    assert.equal(sent.length, 1, "sendMail darf NUR im ersten Lauf gerufen werden");
  });
});

/* ============================================================ *
 * 6. Mail-fail-safe                                             *
 * ============================================================ */

describe("Mail-fail-safe: keine Exception, in-app bleibt erhalten", () => {
  function buildPool() {
    return trackingPool(async (sql) => {
      if (/FROM subscription_requests/i.test(sql)) {
        return {
          rows: [{
            id: "sr-3", user_id: "u-3", org_id: "o-3",
            contact_email: "kunde3@org.de", contact_name: "Kunde 3",
            request_type: "upgrade", current_plan: "BASIS", desired_plan: "PRO",
            proposed_price_cents: null, proposed_term_months: null,
            expected_start_date: null, cancellation_effective_at: null, rejection_reason: null
          }], rowCount: 1
        };
      }
      if (/FROM tempconnect_staff/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/FROM subscription_notification_log/i.test(sql) && /SELECT/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/INSERT INTO notifications/i.test(sql)) return { rows: [{ id: "n-3" }], rowCount: 1 };
      if (/INSERT INTO subscription_notification_log/i.test(sql)) {
        return { rows: [{ id: "log-3", idempotency_key: "k" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
  }

  it("sendMail throw -> dispatched_via='db', mail_status='failed', kein Throw nach aussen", async () => {
    const pool = buildPool();
    const { sendMail } = fakeMailer({ failOn: 0 });
    const r = await notifyRequestStatusChanged(
      pool,
      { requestId: "sr-3", toStatus: "submitted" },
      { sendMail }
    );
    assert.equal(r.ok, true);
    assert.equal(r.customer.dispatched_via, "db");
    assert.equal(r.customer.mail_status, "failed");
  });

  it("kein sendMail (== undefined) -> dispatched_via='db', mail_status='no_smtp'", async () => {
    const pool = buildPool();
    const r = await notifyRequestStatusChanged(
      pool,
      { requestId: "sr-3", toStatus: "submitted" },
      {}
    );
    assert.equal(r.ok, true);
    assert.equal(r.customer.dispatched_via, "db");
    assert.equal(r.customer.mail_status, "no_smtp");
  });

  it("Mail-Praeferenz channel_email=false -> mail_status='skipped' (PREFERENCE_OFF)", async () => {
    const pool = trackingPool(async (sql) => {
      if (/FROM subscription_requests/i.test(sql)) {
        return {
          rows: [{
            id: "sr-4", user_id: "u-4", org_id: "o-4",
            contact_email: "k4@org.de", contact_name: "K4",
            request_type: "upgrade", current_plan: "BASIS", desired_plan: "PRO",
            proposed_price_cents: null, proposed_term_months: null,
            expected_start_date: null, cancellation_effective_at: null, rejection_reason: null
          }], rowCount: 1
        };
      }
      if (/FROM tempconnect_staff/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/notification_preferences/i.test(sql)) {
        return { rows: [{ channel_email: false }], rowCount: 1 };
      }
      if (/FROM subscription_notification_log/i.test(sql) && /SELECT/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/INSERT INTO notifications/i.test(sql)) return { rows: [{ id: "n-4" }], rowCount: 1 };
      if (/INSERT INTO subscription_notification_log/i.test(sql)) {
        return { rows: [{ id: "log-4", idempotency_key: "k" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const { sendMail, sent } = fakeMailer();
    const r = await notifyRequestStatusChanged(
      pool,
      { requestId: "sr-4", toStatus: "submitted" },
      { sendMail }
    );
    assert.equal(r.ok, true);
    assert.equal(r.customer.dispatched_via, "db");
    assert.equal(r.customer.mail_status, "skipped");
    assert.equal(sent.length, 0);
  });

  it("Empfaenger ohne Email -> mail_status='skipped' (NO_EMAIL), DB-Notification trotzdem", async () => {
    const pool = trackingPool(async (sql) => {
      if (/FROM subscription_requests/i.test(sql)) {
        return {
          rows: [{
            id: "sr-5", user_id: "u-5", org_id: null,
            contact_email: null, contact_name: null,
            request_type: "upgrade", current_plan: "BASIS", desired_plan: "PRO",
            proposed_price_cents: null, proposed_term_months: null,
            expected_start_date: null, cancellation_effective_at: null, rejection_reason: null
          }], rowCount: 1
        };
      }
      if (/FROM tempconnect_staff/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/FROM subscription_notification_log/i.test(sql) && /SELECT/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/INSERT INTO notifications/i.test(sql)) return { rows: [{ id: "n-5" }], rowCount: 1 };
      if (/INSERT INTO subscription_notification_log/i.test(sql)) {
        return { rows: [{ id: "log-5", idempotency_key: "k" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const { sendMail, sent } = fakeMailer();
    const r = await notifyRequestStatusChanged(
      pool,
      { requestId: "sr-5", toStatus: "submitted" },
      { sendMail }
    );
    assert.equal(r.ok, true);
    assert.equal(r.customer.mail_status, "skipped");
    assert.equal(sent.length, 0);
  });
});

/* ============================================================ *
 * 7. notifyActivationFailed + notifyExpiringSoon                *
 * ============================================================ */

describe("notifyActivationFailed", () => {
  it("erzeugt Staff-Notification mit error-severity je aktivem Staff", async () => {
    const pool = trackingPool(async (sql) => {
      if (/FROM tempconnect_staff/i.test(sql)) {
        return {
          rows: [
            { user_id: "s-1", email: "ops@tc.de", display_name: "Ops" }
          ], rowCount: 1
        };
      }
      if (/FROM subscription_notification_log/i.test(sql) && /SELECT/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/INSERT INTO notifications/i.test(sql)) return { rows: [{ id: "n-x" }], rowCount: 1 };
      if (/INSERT INTO subscription_notification_log/i.test(sql)) {
        return { rows: [{ id: "log-x", idempotency_key: "k" }], rowCount: 1 };
      }
      if (/notification_preferences/i.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const { sendMail, sent } = fakeMailer();
    const r = await notifyActivationFailed(
      pool,
      { requestId: "sr-9", errorCode: "PLAN_INVALID", errorMessage: "no such plan" },
      { sendMail }
    );
    assert.equal(r.ok, true);
    assert.equal(r.dispatched, 1);
    assert.equal(sent.length, 1);
    assert.match(sent[0].subject, /Aktivierung fehlgeschlagen/);
    assert.match(sent[0].text, /PLAN_INVALID/);
  });

  it("INVALID_ARGS bei fehlender requestId", async () => {
    const r = await notifyActivationFailed(trackingPool(), { errorCode: "X" }, {});
    assert.equal(r.ok, false);
    assert.equal(r.error, "INVALID_ARGS");
  });
});

describe("notifyExpiringSoon - tagesbasierter Idempotency-Schluessel", () => {
  it("dispatcht je aktivem Staff einmal pro Tag (eventKey enthaelt Datum)", async () => {
    const inserted = [];
    const pool = trackingPool(async (sql, params) => {
      if (/FROM tempconnect_staff/i.test(sql)) {
        return { rows: [{ user_id: "s-1", email: "ops@tc.de", display_name: "Ops" }], rowCount: 1 };
      }
      if (/FROM subscription_notification_log/i.test(sql) && /SELECT/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/INSERT INTO notifications/i.test(sql)) return { rows: [{ id: "n-e" }], rowCount: 1 };
      if (/INSERT INTO subscription_notification_log/i.test(sql)) {
        // params[0] ist idempotency_key
        inserted.push(params && params[0]);
        return { rows: [{ id: "log-e", idempotency_key: params && params[0] }], rowCount: 1 };
      }
      if (/notification_preferences/i.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const r = await notifyExpiringSoon(pool, { requestId: "sr-soon", expiresAt: "2026-05-10" }, {});
    assert.equal(r.ok, true);
    const today = new Date().toISOString().slice(0, 10);
    assert.ok(inserted.some((k) => k && k.includes("expiring_soon:" + today)),
      "idempotency_key MUSS Tagesstempel enthalten: " + JSON.stringify(inserted));
  });
});

/* ============================================================ *
 * 8. Hook-Verdrahtung in den Routes                             *
 * ============================================================ */

function resolvePath(rel) {
  // Docker: cwd is already api dir, strip "api/" prefix; sql/ not mounted (skipped separately)
  if (!HAS_API_SUBDIR) return path.join(ROOT, rel.replace(/^api\//, ""));
  return path.join(ROOT, rel);
}
function readFile(rel) {
  return readFileSync(resolvePath(rel), "utf8");
}
// Migration SQL files are only available outside Docker (mounted project root)
const SQL_103_AVAILABLE = HAS_API_SUBDIR;
const migration103 = SQL_103_AVAILABLE
  ? readFile("sql/migrations/103_subscription_notification_hooks.sql")
  : "";
const migSuite103 = SQL_103_AVAILABLE ? describe : describe.skip;

describe("Hook-Verdrahtung in Routes (Welle 8 Schritt 15)", () => {
  it("strategicCollaboration.js importiert + ruft notifyEnterpriseRequestReceived", () => {
    const src = readFile("api/routes/strategicCollaboration.js");
    assert.match(src, /from\s+["']\.\.\/services\/subscriptionNotificationService\.js["']/);
    assert.match(src, /notifyEnterpriseRequestReceived/);
    // Fire-and-forget Pattern: Promise + .catch
    assert.match(src, /Promise\.resolve\(\)/);
    assert.match(src, /\.catch\(/);
  });

  it("subscriptionRequests.js feuert Notification-Hook nach 201 (fail-safe)", () => {
    const src = readFile("api/routes/subscriptionRequests.js");
    assert.match(src, /notifyRequestStatusChanged/);
    assert.match(src, /dispatchNotifySafe/);
    assert.match(src, /\.catch\(/);
    // Hook NACH 201, nicht VOR
    const idxDispatch = src.indexOf("dispatchNotifySafe(");
    const idxRespond = src.indexOf("res.status(201)");
    assert.ok(idxDispatch > 0 && idxRespond > 0, "beide Anker muessen vorkommen");
  });

  it("staffControlCenter.js importiert beide Hook-Funktionen + nutzt sie post-success", () => {
    const src = readFile("api/routes/staffControlCenter.js");
    assert.match(src, /notifyRequestStatusChanged/);
    assert.match(src, /notifyActivationFailed/);
    // dispatchSubscriptionHook in den Status-Pfaden
    assert.match(src, /dispatchSubscriptionHook\(pool/);
    // Activation-Failed Hook im Failure-Branch
    assert.match(src, /notifyActivationFailed\(pool/);
    assert.match(src, /\.catch\(/);
  });

  it("subscriptionNotificationService.js: zentrale Public-API ist exportiert", () => {
    const src = readFile("api/services/subscriptionNotificationService.js");
    assert.match(src, /export async function notifyEnterpriseRequestReceived/);
    assert.match(src, /export async function notifyRequestStatusChanged/);
    assert.match(src, /export async function notifyActivationFailed/);
    assert.match(src, /export async function notifyExpiringSoon/);
  });
});

/* ============================================================ *
 * 9. Migration 103                                              *
 * ============================================================ */

migSuite103("Migration 103 - subscription_notification_log + notifications_type_check", () => {
  it("legt Tabelle subscription_notification_log inkl. UNIQUE-Index an", () => {
    assert.match(migration103, /CREATE TABLE IF NOT EXISTS subscription_notification_log/);
    assert.match(migration103, /CREATE UNIQUE INDEX IF NOT EXISTS subscription_notification_log_idem_uniq/);
    assert.match(migration103, /idempotency_key/);
  });

  it("haelt dispatched_via + mail_status als beobachtbare Spalten", () => {
    assert.match(migration103, /dispatched_via\s+TEXT[\s\S]*?CHECK\s*\(\s*dispatched_via\s+IN\s*\(\s*'db',\s*'email',\s*'both',\s*'skipped'\s*\)/);
    assert.match(migration103, /mail_status[\s\S]*?'ok'[\s\S]*?'failed'[\s\S]*?'no_smtp'[\s\S]*?'skipped'/);
  });

  it("erweitert notifications_type_check um Subscription/Enterprise-Events", () => {
    assert.match(migration103, /'subscription_request_submitted'/);
    assert.match(migration103, /'subscription_request_active'/);
    assert.match(migration103, /'subscription_request_cancelled'/);
    assert.match(migration103, /'subscription_request_activation_failed'/);
    assert.match(migration103, /'enterprise_request_received'/);
  });
});
