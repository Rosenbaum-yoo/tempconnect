/**
 * subscriptionRequestService tests.
 *
 * Verifiziert:
 *   - State-Machine: gueltige + ungueltige Uebergaenge je request_type
 *   - Terminal-/Open-Status-Set
 *   - canBypassStaffApproval() Regeln (Standard self-service vs Individuell-Pflicht)
 *   - createRequest mit Validation (request_type/email/org_or_user)
 *   - approve/reject/activate Pfade + Audit-History
 *   - hasOpenRequest Filter
 *
 * Run: node --test --test-force-exit api/test/subscriptionRequestService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  REQUEST_TYPES,
  STATUS,
  isValidTransition,
  isTerminalStatus,
  isOpenStatus,
  listAllowedNextStatuses,
  canBypassStaffApproval,
  createRequest,
  transitionStatus,
  approve,
  reject,
  activate,
  assignStaff,
  hasOpenRequest,
  listHistory
} from "../services/subscriptionRequestService.js";

// ── Helper ────────────────────────────────────────────────────

function sequencePool(...responses) {
  let idx = 0;
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (idx >= responses.length) {
        throw new Error(`Unexpected query #${idx + 1}: ${String(sql).slice(0, 80)}`);
      }
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

// ── State-Machine ─────────────────────────────────────────────

describe("State-Machine isValidTransition", () => {
  it("draft -> submitted", () => assert.equal(isValidTransition("draft", "submitted"), true));
  it("draft -> active (verboten)", () => assert.equal(isValidTransition("draft", "active"), false));
  it("submitted -> under_review", () => assert.equal(isValidTransition("submitted", "under_review"), true));
  it("submitted -> active direkt (verboten)", () => assert.equal(isValidTransition("submitted", "active"), false));
  it("under_review -> offered", () => assert.equal(isValidTransition("under_review", "offered"), true));
  it("offered -> accepted", () => assert.equal(isValidTransition("offered", "accepted"), true));
  it("accepted -> active", () => assert.equal(isValidTransition("accepted", "active"), true));
  it("active -> rejected (verboten)", () => assert.equal(isValidTransition("active", "rejected"), false));
  it("active -> expired (erlaubt)", () => assert.equal(isValidTransition("active", "expired"), true));
  it("rejected -> alles (verboten)", () => {
    for (const to of ["submitted", "active", "accepted", "draft"]) {
      assert.equal(isValidTransition("rejected", to), false, `rejected -> ${to}`);
    }
  });
  it("cancelled / expired sind terminal", () => {
    for (const to of ["submitted", "active", "draft"]) {
      assert.equal(isValidTransition("cancelled", to), false);
      assert.equal(isValidTransition("expired", to), false);
    }
  });
  it("cancellation darf NICHT in 'offered' (kein Counter-Vorschlag)", () => {
    assert.equal(isValidTransition("submitted", "offered", REQUEST_TYPES.CANCELLATION), false);
    assert.equal(isValidTransition("submitted", "offered", REQUEST_TYPES.UPGRADE), true);
  });
  it("unknown from-status -> false", () => {
    assert.equal(isValidTransition("xyz", "submitted"), false);
  });
});

describe("isTerminalStatus / isOpenStatus", () => {
  it("rejected/cancelled/expired/active sind terminal", () => {
    for (const s of ["rejected", "cancelled", "expired", "active"]) assert.equal(isTerminalStatus(s), true);
  });
  it("draft/submitted/under_review/offered/accepted sind open", () => {
    for (const s of ["draft", "submitted", "under_review", "needs_clarification", "offered", "accepted"]) {
      assert.equal(isOpenStatus(s), true);
    }
  });
});

describe("listAllowedNextStatuses", () => {
  it("submitted -> [under_review, needs_clarification, offered, accepted, rejected, cancelled]", () => {
    assert.deepEqual(
      listAllowedNextStatuses("submitted").sort(),
      ["accepted", "cancelled", "needs_clarification", "offered", "rejected", "under_review"]
    );
  });
  it("submitted bei cancellation -> ohne offered", () => {
    assert.ok(!listAllowedNextStatuses("submitted", REQUEST_TYPES.CANCELLATION).includes("offered"));
  });
});

// ── canBypassStaffApproval ────────────────────────────────────

describe("canBypassStaffApproval", () => {
  it("new_individual -> immer staff-pflichtig", () => {
    assert.equal(canBypassStaffApproval({ request_type: REQUEST_TYPES.NEW_INDIVIDUAL }), false);
  });
  it("pilot -> immer staff-pflichtig", () => {
    assert.equal(canBypassStaffApproval({ request_type: REQUEST_TYPES.PILOT }), false);
  });
  it("upgrade BASIS -> PLUS = self-service", () => {
    assert.equal(canBypassStaffApproval({
      request_type: REQUEST_TYPES.UPGRADE,
      current_plan: "BASIS",
      desired_plan: "PLUS"
    }), true);
  });
  it("upgrade PLUS -> INDIVIDUELL = staff-pflichtig", () => {
    assert.equal(canBypassStaffApproval({
      request_type: REQUEST_TYPES.UPGRADE,
      current_plan: "PLUS",
      desired_plan: "INDIVIDUELL"
    }), false);
  });
  it("downgrade INDIVIDUELL -> PRO = staff-pflichtig", () => {
    assert.equal(canBypassStaffApproval({
      request_type: REQUEST_TYPES.DOWNGRADE,
      current_plan: "INDIVIDUELL",
      desired_plan: "PRO"
    }), false);
  });
  it("cancellation BASIS = self-service", () => {
    assert.equal(canBypassStaffApproval({
      request_type: REQUEST_TYPES.CANCELLATION,
      current_plan: "BASIS"
    }), true);
  });
  it("cancellation INDIVIDUELL = staff-pflichtig", () => {
    assert.equal(canBypassStaffApproval({
      request_type: REQUEST_TYPES.CANCELLATION,
      current_plan: "INDIVIDUELL"
    }), false);
  });
});

// ── createRequest ─────────────────────────────────────────────

describe("createRequest", () => {
  const insertedRow = { id: "req-1", status: "submitted", request_type: "new_individual", is_self_service: false };

  it("public new_individual ohne org/user funktioniert", async () => {
    const pool = sequencePool(
      { rows: [insertedRow] }, // INSERT
      { rows: [] }              // history INSERT
    );
    const row = await createRequest(pool, {
      request_type: REQUEST_TYPES.NEW_INDIVIDUAL,
      contact_email: "Public@example.com"
    });
    assert.equal(row.id, "req-1");
    assert.equal(pool.calls.length, 2);
    assert.match(pool.calls[0].sql, /INSERT INTO subscription_requests/);
    assert.equal(pool.calls[0].params[4], "public@example.com"); // email lowercased
    assert.match(pool.calls[1].sql, /INSERT INTO subscription_request_status_history/);
  });

  it("upgrade ohne org/user wirft ORG_OR_USER_REQUIRED", async () => {
    const pool = sequencePool();
    await assert.rejects(
      () => createRequest(pool, {
        request_type: REQUEST_TYPES.UPGRADE,
        contact_email: "x@example.com",
        current_plan: "BASIS",
        desired_plan: "PLUS"
      }),
      (e) => { assert.equal(e.code, "ORG_OR_USER_REQUIRED"); return true; }
    );
    assert.equal(pool.calls.length, 0);
  });

  it("ohne contact_email -> CONTACT_EMAIL_REQUIRED", async () => {
    const pool = sequencePool();
    await assert.rejects(
      () => createRequest(pool, { request_type: REQUEST_TYPES.PILOT }),
      (e) => { assert.equal(e.code, "CONTACT_EMAIL_REQUIRED"); return true; }
    );
  });

  it("ungueltiger request_type -> INVALID_REQUEST_TYPE", async () => {
    const pool = sequencePool();
    await assert.rejects(
      () => createRequest(pool, { request_type: "magic", contact_email: "x@y.de" }),
      (e) => { assert.equal(e.code, "INVALID_REQUEST_TYPE"); return true; }
    );
  });

  it("self-service-bypass setzt is_self_service=true + requires_staff_approval=false", async () => {
    const ssRow = { id: "req-2", status: "submitted", request_type: "upgrade", is_self_service: true };
    const pool = sequencePool({ rows: [ssRow] }, { rows: [] });
    const row = await createRequest(pool, {
      request_type: REQUEST_TYPES.UPGRADE,
      contact_email: "owner@firma.de",
      org_id: "org-x",
      current_plan: "BASIS",
      desired_plan: "PLUS"
    });
    // params index: is_self_service ist Param 27 (1-basiert) = index 26
    assert.equal(pool.calls[0].params[26], true, "is_self_service muss true sein");
    assert.equal(pool.calls[0].params[27], false, "requires_staff_approval muss false sein");
    assert.equal(row.id, "req-2");
  });

  it("coming_soon Add-on (sso) wirft ADDON_NOT_AVAILABLE mit status 400", async () => {
    const pool = sequencePool(); // keine DB-Calls erwartet
    await assert.rejects(
      () => createRequest(pool, {
        request_type: REQUEST_TYPES.NEW_INDIVIDUAL,
        contact_email: "test@firma.de",
        desired_addons: [{ key: "sso" }]
      }),
      (e) => {
        assert.equal(e.code, "ADDON_NOT_AVAILABLE");
        assert.equal(e.status, 400);
        assert.ok(Array.isArray(e.details?.coming_soon), "details.coming_soon muss Array sein");
        assert.ok(e.details.coming_soon.includes("sso"), "sso muss in coming_soon-Liste stehen");
        return true;
      }
    );
    assert.equal(pool.calls.length, 0, "keine DB-Calls bei coming_soon-Guard");
  });

  it("coming_soon Add-on als String-Key wirft ADDON_NOT_AVAILABLE", async () => {
    const pool = sequencePool();
    await assert.rejects(
      () => createRequest(pool, {
        request_type: REQUEST_TYPES.NEW_INDIVIDUAL,
        contact_email: "test@firma.de",
        desired_addons: ["sso"]
      }),
      (e) => { assert.equal(e.code, "ADDON_NOT_AVAILABLE"); return true; }
    );
  });
});

// ── transitionStatus ──────────────────────────────────────────

describe("transitionStatus", () => {
  it("liefert REQUEST_NOT_FOUND wenn id unbekannt", async () => {
    const pool = sequencePool({ rows: [] });
    const r = await transitionStatus(pool, { requestId: "nope", toStatus: "under_review" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "REQUEST_NOT_FOUND");
  });

  it("blockiert ungueltige Transitions", async () => {
    const pool = sequencePool({ rows: [{ id: "r1", status: "rejected", request_type: "upgrade" }] });
    const r = await transitionStatus(pool, { requestId: "r1", toStatus: "submitted" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "INVALID_TRANSITION");
    assert.equal(r.from, "rejected");
    assert.deepEqual(r.allowed, []);
  });

  it("erlaubt submitted->under_review und schreibt Historie", async () => {
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "submitted", request_type: "upgrade" }] },
      { rows: [{ id: "r1", status: "under_review" }] },
      { rows: [] } // history insert
    );
    const r = await transitionStatus(pool, { requestId: "r1", toStatus: "under_review", actorUserId: "staff-1", reason: "review" });
    assert.equal(r.ok, true);
    assert.equal(r.row.status, "under_review");
    assert.equal(pool.calls.length, 3);
    assert.match(pool.calls[2].sql, /INSERT INTO subscription_request_status_history/);
    assert.equal(pool.calls[2].params[1], "submitted");
    assert.equal(pool.calls[2].params[2], "under_review");
  });

  it("blockiert NO_CHANGE bei Selbstuebergang", async () => {
    const pool = sequencePool({ rows: [{ id: "r1", status: "submitted", request_type: "upgrade" }] });
    const r = await transitionStatus(pool, { requestId: "r1", toStatus: "submitted" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "NO_CHANGE");
  });
});

// ── approve / reject / activate ──────────────────────────────

describe("approve", () => {
  it("setzt approved_by + approved_at auf valid transition", async () => {
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "offered", request_type: "upgrade" }] },
      { rows: [{ id: "r1", status: "accepted", approved_by: "staff-1" }] },
      { rows: [{ id: "r1", status: "accepted", request_type: "upgrade", desired_plan: "PRO", desired_addons: [] }] },
      { rows: [{ id: "r1", quote_snapshot: {}, quote_frozen_at: new Date().toISOString() }] },
      { rows: [] },
      { rows: [] }
    );
    const r = await approve(pool, { requestId: "r1", actorUserId: "staff-1", reason: "ok" });
    assert.equal(r.ok, true);
    assert.equal(r.row.status, "accepted");
    assert.match(pool.calls[1].sql, /approved_by = \$3/);
  });

  it("blockt approve wenn aktueller Status->accepted nicht erlaubt", async () => {
    const pool = sequencePool({ rows: [{ id: "r1", status: "rejected", request_type: "upgrade" }] });
    const r = await approve(pool, { requestId: "r1", actorUserId: "staff-1" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "INVALID_TRANSITION");
  });
});

describe("reject", () => {
  it("verlangt reason", async () => {
    const pool = sequencePool();
    const r = await reject(pool, { requestId: "r1", actorUserId: "staff-1", reason: "  " });
    assert.equal(r.ok, false);
    assert.equal(r.error, "REASON_REQUIRED");
  });

  it("schreibt rejection_reason und transitioned auf rejected", async () => {
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "submitted", request_type: "upgrade" }] },
      { rows: [{ id: "r1", status: "rejected", rejection_reason: "nicht passend" }] },
      { rows: [] }
    );
    const r = await reject(pool, { requestId: "r1", actorUserId: "staff-1", reason: "nicht passend" });
    assert.equal(r.ok, true);
    assert.equal(r.row.status, "rejected");
    assert.equal(pool.calls[1].params[3], "nicht passend");
  });
});

describe("activate", () => {
  it("erlaubt activate aus accepted", async () => {
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "accepted", request_type: "upgrade" }] },
      { rows: [{ id: "r1", status: "active", activated_at: new Date().toISOString() }] },
      { rows: [] }
    );
    const r = await activate(pool, { requestId: "r1", actorUserId: "staff-1" });
    assert.equal(r.ok, true);
    assert.equal(r.row.status, "active");
  });

  it("blockt activate aus submitted (muss erst durch accepted)", async () => {
    const pool = sequencePool({ rows: [{ id: "r1", status: "submitted", request_type: "upgrade" }] });
    const r = await activate(pool, { requestId: "r1", actorUserId: "staff-1" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "INVALID_TRANSITION");
  });
});

// ── assignStaff + Helper ──────────────────────────────────────

describe("assignStaff", () => {
  it("verlangt staffUserId", async () => {
    const pool = sequencePool();
    const r = await assignStaff(pool, { requestId: "r1", staffUserId: null });
    assert.equal(r.ok, false);
    assert.equal(r.error, "STAFF_USER_ID_REQUIRED");
  });

  it("setzt assigned_staff_id und schreibt Audit-Eintrag", async () => {
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "submitted", assigned_staff_id: "staff-2" }] },
      { rows: [] }
    );
    const r = await assignStaff(pool, { requestId: "r1", staffUserId: "staff-2", actorUserId: "owner-1" });
    assert.equal(r.ok, true);
    assert.equal(r.row.assigned_staff_id, "staff-2");
    assert.equal(pool.calls[1].params[4], "assign_staff");
  });
});

describe("hasOpenRequest", () => {
  it("true wenn offene Zeile existiert", async () => {
    const pool = sequencePool({ rows: [{}] });
    const has = await hasOpenRequest(pool, { orgId: "org-1", requestType: REQUEST_TYPES.UPGRADE });
    assert.equal(has, true);
  });
  it("false wenn keine Zeile", async () => {
    const pool = sequencePool({ rows: [] });
    const has = await hasOpenRequest(pool, { orgId: "org-1" });
    assert.equal(has, false);
  });
  it("false ohne org und user", async () => {
    const pool = sequencePool();
    const has = await hasOpenRequest(pool, {});
    assert.equal(has, false);
    assert.equal(pool.calls.length, 0);
  });
});

describe("listHistory", () => {
  it("gibt sortierte Audit-Zeilen zurueck", async () => {
    const pool = sequencePool({ rows: [{ id: "h1", from_status: null, to_status: "submitted" }] });
    const out = await listHistory(pool, "r1");
    assert.equal(out.length, 1);
    assert.match(pool.calls[0].sql, /ORDER BY created_at ASC/);
  });
});
