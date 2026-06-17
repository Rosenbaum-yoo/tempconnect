/**
 * dealFeedback.routes.test.js — HTTP-Wrapper für Deal-Feedback v2 (P3a).
 * Prüft Org-Context-Guards, Validierung, Service-Fehler-Mapping (FORBIDDEN->403) + Happy-Path.
 * Service-Logik selbst ist in dealFeedbackService.test.js abgedeckt.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mockReq, mockRes, noop, baseDeps, findHandlerExact, USER_A, ORG_A, ORG_B
} from "./helpers/security-mocks.js";
import { createDealFeedbackRouter } from "../routes/dealFeedback.js";

const AID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const COMP_DIMS = { zuverlaessigkeit: 5, kommunikation: 5, qualitaet: 5, termintreue: 5 };

function asg(overrides = {}) {
  return { id: AID, org_id: ORG_A, supplier_org_id: ORG_B, status: "completed", completed_at: new Date().toISOString(), ...overrides };
}
function fbPool(assignmentRow, inserted) {
  return {
    query: async (sql) => {
      if (/FROM assignments WHERE id/i.test(sql)) return { rows: assignmentRow ? [assignmentRow] : [] };
      if (/INSERT INTO deal_feedback/i.test(sql)) return { rows: inserted ? [inserted] : [] };
      if (/SELECT 1 FROM deal_feedback/i.test(sql)) return { rows: [] };
      return { rows: [], rowCount: 0 };
    }
  };
}

describe("deal-feedback routes", () => {
  it("POST: ohne Org-Kontext -> 400 NO_ORG_CONTEXT", async () => {
    const h = findHandlerExact(createDealFeedbackRouter(baseDeps(fbPool(asg()))), "post", "/deal-feedback");
    const req = mockReq({ orgId: null, body: { assignment_id: AID, sentiment: "positive", dimensions: COMP_DIMS } });
    const res = mockRes(); await h(req, res, noop);
    assert.equal(res._status, 400);
    assert.equal(res._json.error, "NO_ORG_CONTEXT");
  });

  it("POST: Body-Validierung -> 400 VALIDATION", async () => {
    const h = findHandlerExact(createDealFeedbackRouter(baseDeps(fbPool(asg()))), "post", "/deal-feedback");
    const req = mockReq({ orgId: ORG_A, body: { sentiment: "positive" } });
    const res = mockRes(); await h(req, res, noop);
    assert.equal(res._status, 400);
    assert.equal(res._json.error, "VALIDATION");
  });

  it("POST: fremde Org -> 403 FORBIDDEN (Service-Mapping)", async () => {
    const h = findHandlerExact(createDealFeedbackRouter(baseDeps(fbPool(asg()))), "post", "/deal-feedback");
    const req = mockReq({ orgId: "org-outsider-999", session: { userId: USER_A }, body: { assignment_id: AID, sentiment: "positive", dimensions: COMP_DIMS } });
    const res = mockRes(); await h(req, res, noop);
    assert.equal(res._status, 403);
    assert.equal(res._json.error, "FORBIDDEN");
  });

  it("POST: gültig -> 200 + id/direction", async () => {
    const inserted = { id: "fb-1", direction: "company_to_supplier", status: "submitted" };
    const h = findHandlerExact(createDealFeedbackRouter(baseDeps(fbPool(asg(), inserted))), "post", "/deal-feedback");
    const req = mockReq({ orgId: ORG_A, session: { userId: USER_A }, body: { assignment_id: AID, sentiment: "positive", dimensions: COMP_DIMS, comment: "Top" } });
    const res = mockRes(); await h(req, res, noop);
    assert.equal(res._status, 200);
    assert.equal(res._json.direction, "company_to_supplier");
    assert.equal(res._json.id, "fb-1");
  });

  it("GET /deal-feedback/pending: ohne Org -> leer", async () => {
    const h = findHandlerExact(createDealFeedbackRouter(baseDeps(fbPool(null))), "get", "/deal-feedback/pending");
    const req = mockReq({ orgId: null });
    const res = mockRes(); await h(req, res, noop);
    assert.equal(res._json.total, 0);
  });

  it("GET /deal-feedback/org/:orgId: öffentliches Feedback", async () => {
    const pool = { query: async () => ({ rows: [{ id: "fb-1", sentiment: "positive" }] }) };
    const h = findHandlerExact(createDealFeedbackRouter(baseDeps(pool)), "get", "/deal-feedback/org/:orgId");
    const req = mockReq({ params: { orgId: ORG_B } });
    const res = mockRes(); await h(req, res, noop);
    assert.equal(res._json.total, 1);
  });
});
