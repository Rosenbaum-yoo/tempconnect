/**
 * Audit Trail System Tests — Prueft alle neuen Funktionen des erweiterten Audit Trail.
 *
 * Run: node --test test/audit-trail.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { EventEmitter } from "node:events";
import { deriveActionType, sanitizeMetadata, diffValues } from "../services/auditLog.js";
import { auditWriteMiddleware } from "../middleware/auditWrite.js";

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function mockRes(statusCode = 200) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  res.locals = {};
  return res;
}

function mockReq(method = "POST", path = "/api/test") {
  return {
    method,
    path,
    originalUrl: path,
    ip: "127.0.0.1",
    headers: { "user-agent": "test-agent" },
    session: { userId: "user-123" },
    orgId: "org-456"
  };
}

function mockPool() {
  const written = [];
  return {
    written,
    query: async (sql, params) => {
      written.push({ sql, params });
      return { rows: [], rowCount: 1 };
    }
  };
}

function nextTick() {
  return new Promise(resolve => setTimeout(resolve, 20));
}

/* ── 1. deriveActionType Tests ─────────────────────────────────────────────── */

describe("deriveActionType", () => {
  it("leitet CREATE ab aus '.create' und '.add' Aktionen", () => {
    assert.strictEqual(deriveActionType("org.create"), "CREATE");
    assert.strictEqual(deriveActionType("org.member.add"), "CREATE");
    assert.strictEqual(deriveActionType("auth.register"), "CREATE");
  });

  it("leitet UPDATE ab aus '.update' und '.edit' Aktionen", () => {
    assert.strictEqual(deriveActionType("org.update"), "UPDATE");
    assert.strictEqual(deriveActionType("contract.edit"), "UPDATE");
  });

  it("leitet DELETE ab aus '.delete', '.remove', '.deactivate' Aktionen", () => {
    assert.strictEqual(deriveActionType("org.member.remove"), "DELETE");
    assert.strictEqual(deriveActionType("timesheet.delete_entry"), "DELETE");
    assert.strictEqual(deriveActionType("admin.user.deactivate"), "DELETE");
  });

  it("leitet APPROVAL ab aus '.approve' und '.reject' Aktionen", () => {
    assert.strictEqual(deriveActionType("timesheet.approve"), "APPROVAL");
    assert.strictEqual(deriveActionType("timesheet.reject"), "APPROVAL");
  });

  it("leitet SUBMISSION ab aus '.submit' Aktionen", () => {
    assert.strictEqual(deriveActionType("timesheet.submit"), "SUBMISSION");
  });

  it("leitet LOGIN ab aus 'login' und 'logout' Aktionen", () => {
    assert.strictEqual(deriveActionType("auth.login"), "LOGIN");
    assert.strictEqual(deriveActionType("auth.logout"), "LOGIN");
    assert.strictEqual(deriveActionType("auth.login_failed"), "LOGIN");
  });

  it("leitet SECURITY ab aus 'password', 'forgot', 'reset' Aktionen", () => {
    assert.strictEqual(deriveActionType("auth.password_reset"), "SECURITY");
    assert.strictEqual(deriveActionType("auth.forgot_password"), "SECURITY");
  });

  it("leitet STATUS_CHANGE ab aus '.accept', '.cancel', '.close', '.finalize'", () => {
    assert.strictEqual(deriveActionType("deal.accept"), "STATUS_CHANGE");
    assert.strictEqual(deriveActionType("timesheet.cancel"), "STATUS_CHANGE");
    assert.strictEqual(deriveActionType("request.finalize"), "STATUS_CHANGE");
    assert.strictEqual(deriveActionType("timesheet.return_to_draft"), "STATUS_CHANGE");
  });

  it("leitet ROLE_CHANGE ab fuer role-Aktionen", () => {
    assert.strictEqual(deriveActionType("org.role_change"), "ROLE_CHANGE");
  });

  it("leitet CONFIG_CHANGE ab fuer setting/config Aktionen", () => {
    assert.strictEqual(deriveActionType("org.settings.update"), "CONFIG_CHANGE");
  });

  it("gibt UPDATE als Fallback zurueck", () => {
    assert.strictEqual(deriveActionType("unknown.action"), "UPDATE");
    assert.strictEqual(deriveActionType(null), "UPDATE");
    assert.strictEqual(deriveActionType(""), "UPDATE");
  });
});

/* ── 2. sanitizeMetadata Tests ─────────────────────────────────────────────── */

describe("sanitizeMetadata", () => {
  it("redacted sensible Felder", () => {
    const result = sanitizeMetadata({
      email: "test@example.com",
      password: "geheim",
      password_hash: "abc123",
      token: "xyz",
      status: "active"
    });
    assert.strictEqual(result.email, "test@example.com");
    assert.strictEqual(result.password, "[REDACTED]");
    assert.strictEqual(result.password_hash, "[REDACTED]");
    assert.strictEqual(result.token, "[REDACTED]");
    assert.strictEqual(result.status, "active");
  });

  it("redacted sensible Felder in verschachtelten Objekten", () => {
    const result = sanitizeMetadata({
      user: { email: "a@b.de", session_id: "secret" },
      level: 1
    });
    assert.strictEqual(result.user.email, "a@b.de");
    assert.strictEqual(result.user.session_id, "[REDACTED]");
    assert.strictEqual(result.level, 1);
  });

  it("gibt null/undefined sauber zurueck", () => {
    assert.strictEqual(sanitizeMetadata(null), null);
    assert.strictEqual(sanitizeMetadata(undefined), undefined);
  });

  it("behaelt Arrays unveraendert", () => {
    const result = sanitizeMetadata({ tags: ["a", "b"], secret: "x" });
    assert.deepStrictEqual(result.tags, ["a", "b"]);
    assert.strictEqual(result.secret, "[REDACTED]");
  });

  it("redacted IBAN und credit_card", () => {
    const result = sanitizeMetadata({ iban: "DE123", credit_card: "1234" });
    assert.strictEqual(result.iban, "[REDACTED]");
    assert.strictEqual(result.credit_card, "[REDACTED]");
  });
});

/* ── 3. Middleware: action_type und status werden gesetzt ──────────────────── */

describe("auditWriteMiddleware — action_type + status", () => {
  it("setzt action_type automatisch via deriveActionType", async () => {
    const pool = mockPool();
    const mw = auditWriteMiddleware(pool, { logger: null });
    const req = mockReq("POST", "/api/timesheets");
    const res = mockRes(201);

    mw(req, res, () => {});
    res.locals.audit = {
      action: "timesheet.create",
      entity_type: "timesheet",
      entity_id: "ts-1"
    };

    res.emit("finish");
    await nextTick();

    assert.strictEqual(pool.written.length, 1);
    const params = pool.written[0].params;
    // action_type ist $14 (Index 13), status ist $15 (Index 14)
    assert.strictEqual(params[13], "CREATE", "action_type ist CREATE");
    assert.strictEqual(params[14], "SUCCESS", "status ist SUCCESS");
  });

  it("respektiert explizit gesetzten action_type", async () => {
    const pool = mockPool();
    const mw = auditWriteMiddleware(pool, { logger: null });
    const req = mockReq("POST", "/api/auth/login");
    const res = mockRes(200);

    mw(req, res, () => {});
    res.locals.audit = {
      action: "auth.login",
      entity_type: "user",
      entity_id: "u-1",
      action_type: "LOGIN"
    };

    res.emit("finish");
    await nextTick();

    assert.strictEqual(pool.written.length, 1);
    assert.strictEqual(pool.written[0].params[13], "LOGIN");
  });

  it("loggt DENIED bei 4xx Status wenn audit gesetzt", async () => {
    const pool = mockPool();
    const mw = auditWriteMiddleware(pool, { logger: null });
    const req = mockReq("POST", "/api/timesheets/1/approve");
    const res = mockRes(403);

    mw(req, res, () => {});
    res.locals.audit = {
      action: "timesheet.approve",
      entity_type: "timesheet",
      entity_id: "ts-1",
      status: "DENIED"
    };

    res.emit("finish");
    await nextTick();

    assert.strictEqual(pool.written.length, 1);
    assert.strictEqual(pool.written[0].params[14], "DENIED", "status ist DENIED");
  });

  it("leitet FAILED-Status bei 5xx ab wenn kein expliziter status gesetzt", async () => {
    const pool = mockPool();
    const mw = auditWriteMiddleware(pool, { logger: null });
    const req = mockReq("POST", "/api/test");
    const res = mockRes(500);

    mw(req, res, () => {});
    res.locals.audit = {
      action: "test.action",
      entity_type: "test",
      entity_id: "1"
    };

    res.emit("finish");
    await nextTick();

    assert.strictEqual(pool.written.length, 1);
    assert.strictEqual(pool.written[0].params[14], "FAILED", "status ist FAILED bei 500");
  });
});

/* ── 4. Middleware: Fehlerresilienz ────────────────────────────────────────── */

describe("auditWriteMiddleware — Fehlerresilienz", () => {
  it("blockiert Business-Logik NICHT bei Audit-DB-Fehler", async () => {
    const errors = [];
    const logger = { warn: () => {}, error: (data, msg) => errors.push({ data, msg }) };
    const failPool = {
      query: async () => { throw new Error("DB connection lost"); }
    };
    const mw = auditWriteMiddleware(failPool, { logger });
    const req = mockReq("POST", "/api/test");
    const res = mockRes(200);
    let nextCalled = false;

    mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, "next() wird sofort aufgerufen");

    res.locals.audit = { action: "test.create", entity_type: "test", entity_id: "1" };
    res.emit("finish");
    await nextTick();

    // Error wird geloggt, kein Crash
    assert.strictEqual(errors.length, 1, "Error wurde geloggt");
    assert.ok(errors[0].msg.includes("Audit-Write fehlgeschlagen"));
  });

  it("warnt nicht bei SKIP_WARNING_PATHS", async () => {
    const pool = mockPool();
    const warnings = [];
    const logger = { warn: (d, m) => warnings.push(m), error: () => {} };
    const mw = auditWriteMiddleware(pool, { logger });
    const req = mockReq("POST", "/api/csrf");
    const res = mockRes(200);

    mw(req, res, () => {});
    // Kein audit gesetzt
    res.emit("finish");
    await nextTick();

    assert.strictEqual(warnings.length, 0, "Keine Warnung fuer csrf-Pfad");
  });
});

/* ── 5. diffValues Tests (bestehende Funktion, erweiterte Abdeckung) ──────── */

describe("diffValues", () => {
  it("erkennt geaenderte Felder korrekt", () => {
    const result = diffValues(
      { status: "draft", worker_name: "Max" },
      { status: "submitted", worker_name: "Max" }
    );
    assert.deepStrictEqual(result.old_values, { status: "draft" });
    assert.deepStrictEqual(result.new_values, { status: "submitted" });
  });

  it("ignoriert created_at und updated_at", () => {
    const result = diffValues(
      { status: "a", created_at: "2024-01-01" },
      { status: "b", created_at: "2025-01-01" }
    );
    assert.deepStrictEqual(result.old_values, { status: "a" });
    assert.deepStrictEqual(result.new_values, { status: "b" });
  });

  it("gibt null zurueck wenn keine Aenderungen", () => {
    const result = diffValues(
      { status: "active" },
      { status: "active" }
    );
    assert.strictEqual(result.old_values, null);
    assert.strictEqual(result.new_values, null);
  });

  it("handhabt null-Eingaben sauber", () => {
    const result = diffValues(null, { status: "new" });
    assert.strictEqual(result.old_values, null);
    assert.deepStrictEqual(result.new_values, { status: "new" });
  });
});
