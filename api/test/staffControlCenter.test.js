import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createStaffControlAccessMiddleware,
  createStaffStepUpMiddleware,
  requireConfirmAndReason,
  requireTypedConfirmation
} from "../middleware/staffControlAccess.js";
import * as hetzner from "../services/staffHetznerService.js";
import * as runbookService from "../services/staffRunbookService.js";
import * as customerRequests from "../services/staffCustomerRequestsService.js";

function makeReq(overrides = {}) {
  return { session: { staffUserId: null, ...overrides.session }, body: {}, headers: {}, ip: "127.0.0.1", ...overrides };
}
function makeRes() {
  return {
    statusCode: 200, jsonBody: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.jsonBody = b; return this; }
  };
}

describe("staffControlAccess — harte Staff-Allowlist", () => {
  it("denies request without Staff-Session (401)", async () => {
    const pool = { query: async () => ({ rows: [] }) };
    const mw = createStaffControlAccessMiddleware({ pool, logger: { warn() {} } });
    const req = makeReq();
    const res = makeRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.jsonBody.error.code, "SCC_NOT_AUTHENTICATED");
  });

  it("denies platform_admin/org-owner/admin — no RBAC bypass", async () => {
    const pool = { query: async () => ({ rows: [] }) };
    const mw = createStaffControlAccessMiddleware({ pool, logger: { warn() {} } });
    const req = makeReq({ session: { staffUserId: "x", userRole: "platform_admin" } });
    const res = makeRes();
    await mw(req, res, () => {});
    assert.equal(res.statusCode, 403);
    assert.equal(res.jsonBody.error.code, "SCC_NOT_AUTHORIZED");
  });

  it("allows user listed in tempconnect_staff", async () => {
    const row = { user_id: "u1", email: "elmira@tempconnect.de", display_name: "Elmira", is_active: true, requires_step_up: true };
    const pool = {
      query: async (sql) => {
        if (/tempconnect_staff WHERE user_id/i.test(sql)) return { rows: [row] };
        return { rows: [] };
      }
    };
    const mw = createStaffControlAccessMiddleware({ pool, logger: { warn() {} } });
    const req = makeReq({ session: { staffUserId: "u1" } });
    const res = makeRes();
    let ok = false;
    await mw(req, res, () => { ok = true; });
    assert.equal(ok, true);
    assert.equal(req.sccStaff.user_id, "u1");
  });
});

describe("staffStepUp + requireConfirmAndReason", () => {
  it("blocks without step-up timestamp (428)", () => {
    const mw = createStaffStepUpMiddleware({ maxAgeMs: 60_000 });
    const req = makeReq({ session: {}, sccStaff: { requires_step_up: true } });
    const res = makeRes();
    mw(req, res, () => {});
    assert.equal(res.statusCode, 428);
    assert.equal(res.jsonBody.error.code, "SCC_STEP_UP_REQUIRED");
  });

  it("passes through with fresh step-up", () => {
    const mw = createStaffStepUpMiddleware({ maxAgeMs: 60_000 });
    const req = makeReq({ session: { staffStepUpAt: Date.now() - 1000 }, sccStaff: { requires_step_up: true } });
    const res = makeRes();
    let ok = false;
    mw(req, res, () => { ok = true; });
    assert.equal(ok, true);
  });

  it("requireConfirmAndReason: blocks ohne confirmed oder kurzer Grund", () => {
    const noConfirmReq = makeReq({ body: { reason: "valid but no confirm" } });
    const res1 = makeRes();
    requireConfirmAndReason(noConfirmReq, res1, () => {});
    assert.equal(res1.statusCode, 400);
    assert.equal(res1.jsonBody.error.code, "SCC_CONFIRM_REQUIRED");

    const shortReasonReq = makeReq({ body: { confirmed: true, reason: "kurz" } });
    const res2 = makeRes();
    requireConfirmAndReason(shortReasonReq, res2, () => {});
    assert.equal(res2.statusCode, 400);
    assert.equal(res2.jsonBody.error.code, "SCC_REASON_REQUIRED");
  });

  it("requireConfirmAndReason: laesst valide Anfragen durch", () => {
    const req = makeReq({ body: { confirmed: true, reason: "Begruendung lang genug" } });
    const res = makeRes();
    let ok = false;
    requireConfirmAndReason(req, res, () => { ok = true; });
    assert.equal(ok, true);
    assert.equal(req.sccReason, "Begruendung lang genug");
  });
});

describe("WAVE 02 — risk-basierte Step-up TTLs", () => {
  it("createStaffStepUpMiddleware riskLevel=critical: TTL 5 Minuten", () => {
    const mw = createStaffStepUpMiddleware({ riskLevel: "critical" });
    // Step-up 6 Minuten alt → abgelaufen
    const req = makeReq({ session: { staffStepUpAt: Date.now() - 6 * 60 * 1000 }, sccStaff: { requires_step_up: true } });
    const res = makeRes();
    mw(req, res, () => {});
    assert.equal(res.statusCode, 428);
    assert.equal(res.jsonBody.error.code, "SCC_STEP_UP_EXPIRED");
    assert.equal(res.jsonBody.error.risk_level, "critical");
    assert.equal(res.jsonBody.error.max_age_min, 5);
  });

  it("createStaffStepUpMiddleware riskLevel=critical: frischer Step-up (3min) passiert", () => {
    const mw = createStaffStepUpMiddleware({ riskLevel: "critical" });
    const req = makeReq({ session: { staffStepUpAt: Date.now() - 3 * 60 * 1000 }, sccStaff: { requires_step_up: true } });
    const res = makeRes();
    let ok = false;
    mw(req, res, () => { ok = true; });
    assert.equal(ok, true);
  });

  it("createStaffStepUpMiddleware riskLevel=high: TTL 10 Minuten", () => {
    const mw = createStaffStepUpMiddleware({ riskLevel: "high" });
    // Step-up 11 Minuten alt → abgelaufen
    const req = makeReq({ session: { staffStepUpAt: Date.now() - 11 * 60 * 1000 }, sccStaff: { requires_step_up: true } });
    const res = makeRes();
    mw(req, res, () => {});
    assert.equal(res.statusCode, 428);
    assert.equal(res.jsonBody.error.max_age_min, 10);
  });

  it("createStaffStepUpMiddleware backward-compat: maxAgeMs direkt funktioniert noch", () => {
    const mw = createStaffStepUpMiddleware({ maxAgeMs: 60_000 });
    const req = makeReq({ session: { staffStepUpAt: Date.now() - 1000 }, sccStaff: { requires_step_up: true } });
    const res = makeRes();
    let ok = false;
    mw(req, res, () => { ok = true; });
    assert.equal(ok, true);
  });

  it("createStaffStepUpMiddleware: 428 mit risk_level im Error-Body", () => {
    const mw = createStaffStepUpMiddleware({ riskLevel: "high" });
    const req = makeReq({ session: {}, sccStaff: { requires_step_up: true } });
    const res = makeRes();
    mw(req, res, () => {});
    assert.equal(res.statusCode, 428);
    assert.equal(res.jsonBody.error.risk_level, "high");
  });
});

describe("WAVE 02 — requireTypedConfirmation", () => {
  it("blockt wenn typed_confirmation fehlt", () => {
    const mw = requireTypedConfirmation("READ ONLY ON");
    const req = makeReq({ body: { confirmed: true } });
    const res = makeRes();
    mw(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonBody.error.code, "SCC_TYPED_CONFIRMATION_REQUIRED");
    assert.equal(res.jsonBody.error.expected_hint, "READ ONLY ON");
  });

  it("blockt wenn typed_confirmation falsch", () => {
    const mw = requireTypedConfirmation("READ ONLY ON");
    const req = makeReq({ body: { typed_confirmation: "READ ONLY OFF" } });
    const res = makeRes();
    mw(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonBody.error.code, "SCC_TYPED_CONFIRMATION_REQUIRED");
  });

  it("lässt durch wenn typed_confirmation exakt stimmt", () => {
    const mw = requireTypedConfirmation("READ ONLY ON");
    const req = makeReq({ body: { typed_confirmation: "READ ONLY ON" } });
    const res = makeRes();
    let ok = false;
    mw(req, res, () => { ok = true; });
    assert.equal(ok, true);
    assert.equal(req.sccTypedConfirmation, "READ ONLY ON");
  });

  it("überspringt wenn computeExpected null zurückgibt", () => {
    const mw = requireTypedConfirmation(() => null);
    const req = makeReq({ body: {} });
    const res = makeRes();
    let ok = false;
    mw(req, res, () => { ok = true; });
    assert.equal(ok, true);
  });

  it("akzeptiert dynamische Berechnung via Funktion", () => {
    const mw = requireTypedConfirmation((r) => r.body?.action === "on" ? "ENABLE OFFERS" : "DISABLE OFFERS");
    const req = makeReq({ body: { action: "off", typed_confirmation: "DISABLE OFFERS" } });
    const res = makeRes();
    let ok = false;
    mw(req, res, () => { ok = true; });
    assert.equal(ok, true);
  });
});

describe("staffHetznerService — Whitelist + Stub", () => {
  it("runs in stub mode without token", () => {
    assert.equal(hetzner.HETZNER_MODE, "stub");
  });
  it("runSafeAction lehnt nicht-whitelisted actions ab", async () => {
    const res = await hetzner.runSafeAction("server.delete", { serverId: 1 });
    assert.equal(res.error, "HETZNER_ACTION_NOT_ALLOWED");
  });
  it("getInfraOverview liefert stubbed Server + LBs", async () => {
    const data = await hetzner.getInfraOverview();
    assert.equal(data.mode, "stub");
    assert.ok(Array.isArray(data.servers.servers));
  });
});

describe("staffRunbookService — Step-Type-Whitelist", () => {
  it("rejects unknown step types like shell", async () => {
    const pool = {
      query: async (sql) => {
        if (/FROM staff_control_runbooks WHERE key/i.test(sql)) {
          return { rows: [{ id: "r1", key: "x", version: 1, is_enabled: true, requires_confirm: true, steps: [{ type: "shell", cmd: "whoami" }] }] };
        }
        return { rows: [] };
      }
    };
    const res = await runbookService.executeRunbook(pool, { runbookKey: "x", actorId: "u1", reason: "valid reason", confirmed: true });
    assert.equal(res.error, "RUNBOOK_INVALID");
    assert.equal(res.details.reason, "INVALID_STEP_TYPE");
  });
});

describe("staffCustomerRequestsService — Transitions + Messages", () => {
  it("isValidTransition erlaubt nur whitelisted Uebergaenge", () => {
    assert.equal(customerRequests.isValidTransition("eingegangen", "angebot_erstellt"), true);
    assert.equal(customerRequests.isValidTransition("eingegangen", "aktiviert"), false);
    assert.equal(customerRequests.isValidTransition("abgeschlossen", "aktiviert"), false);
  });

  it("addMessage validiert Body (empty/long) und sucht Request", async () => {
    const empty = await customerRequests.addMessage({ query: async () => ({ rows: [] }) }, { requestId: "r1", staffId: "u1", body: "   " });
    assert.equal(empty.error, "EMPTY_BODY");
    const longBody = "x".repeat(10001);
    const tooLong = await customerRequests.addMessage({ query: async () => ({ rows: [] }) }, { requestId: "r1", staffId: "u1", body: longBody });
    assert.equal(tooLong.error, "BODY_TOO_LONG");
    const missing = await customerRequests.addMessage({ query: async () => ({ rows: [] }) }, { requestId: "r1", staffId: "u1", body: "Hallo Kunde!" });
    assert.equal(missing.error, "REQUEST_NOT_FOUND");
  });

  it("addMessage schreibt bei vorhandenem Request + touched updated_at", async () => {
    let inserted = null;
    let touched = false;
    const pool = {
      query: async (sql, params) => {
        if (/FROM strategic_collaboration_requests WHERE id/i.test(sql)) return { rows: [{ id: params[0] }] };
        if (/INSERT INTO staff_customer_request_messages/i.test(sql)) {
          inserted = { request_id: params[0], author_staff_id: params[1], is_internal: params[2], body: params[3] };
          return { rows: [{ id: "m1", created_at: new Date().toISOString(), is_internal: params[2] }] };
        }
        if (/UPDATE strategic_collaboration_requests SET updated_at/i.test(sql)) { touched = true; return { rows: [] }; }
        return { rows: [] };
      }
    };
    const result = await customerRequests.addMessage(pool, { requestId: "r1", staffId: "u1", body: "Antwort an Kunde", isInternal: false });
    assert.equal(result.id, "m1");
    assert.equal(inserted.is_internal, false);
    assert.equal(inserted.request_id, "r1");
    assert.equal(touched, true);
  });

  it("transitionStatus lehnt ungueltige Uebergaenge ab", async () => {
    const pool = {
      query: async (sql) => {
        if (/SELECT id, status FROM strategic_collaboration_requests/i.test(sql)) {
          return { rows: [{ id: "r1", status: "abgeschlossen" }] };
        }
        return { rows: [] };
      }
    };
    const res = await customerRequests.transitionStatus(pool, { requestId: "r1", staffId: "u1", nextStatus: "aktiviert" });
    assert.equal(res.error, "INVALID_TRANSITION");
    assert.equal(res.from, "abgeschlossen");
    assert.equal(res.to, "aktiviert");
  });

  it("transitionStatus schreibt neuen Status + Audit-Thread-Notiz", async () => {
    let updated = null;
    let noted = null;
    const pool = {
      query: async (sql, params) => {
        if (/SELECT id, status FROM strategic_collaboration_requests/i.test(sql)) {
          return { rows: [{ id: "r1", status: "eingegangen" }] };
        }
        if (/UPDATE strategic_collaboration_requests/i.test(sql)) {
          updated = { nextStatus: params[0], id: params[1] };
          return { rows: [{ id: params[1], status: params[0], updated_at: new Date().toISOString() }] };
        }
        if (/INSERT INTO staff_customer_request_messages/i.test(sql)) {
          noted = { body: params[2] };
          return { rows: [] };
        }
        return { rows: [] };
      }
    };
    const res = await customerRequests.transitionStatus(pool, { requestId: "r1", staffId: "u1", nextStatus: "angebot_erstellt", reason: "Grund" });
    assert.equal(res.status, "angebot_erstellt");
    assert.equal(updated.nextStatus, "angebot_erstellt");
    assert.match(noted.body, /\[status\] eingegangen -> angebot_erstellt/);
  });

  it("assign verweigert Nicht-Staff als Assignee", async () => {
    const pool = {
      query: async (sql) => {
        if (/FROM strategic_collaboration_requests WHERE id/i.test(sql)) return { rows: [{ id: "r1" }] };
        if (/FROM tempconnect_staff WHERE user_id/i.test(sql)) return { rows: [] };
        return { rows: [] };
      }
    };
    const res = await customerRequests.assign(pool, { requestId: "r1", staffId: "u1", assigneeId: "random-user" });
    assert.equal(res.error, "ASSIGNEE_NOT_STAFF");
  });
});
