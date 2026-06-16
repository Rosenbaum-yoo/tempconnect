/**
 * dealFeedbackService.test.js — Deal-Feedback v2 (Phase 1) Fundament-Tests.
 * DB-frei (Mock-Pool): Richtungs-Auflösung, Dimensions-Validierung, submit-Guards
 * (participant-only, completed-only, Fenster, UNIQUE je Richtung).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveDirection, validateDimensions, submitFeedback, getPendingFeedback,
  DIMENSION_KEYS, FEEDBACK_WINDOW_DAYS
} from "../services/dealFeedbackService.js";

const ORG_COMPANY = "org-company-001";
const ORG_SUPPLIER = "org-supplier-002";
const ORG_OUTSIDER = "org-outsider-003";

function assignment(overrides = {}) {
  return {
    id: "asg-1", org_id: ORG_COMPANY, supplier_org_id: ORG_SUPPLIER,
    status: "completed", completed_at: new Date().toISOString(), ...overrides
  };
}

/** Mock-Pool: SELECT assignments -> asg; INSERT deal_feedback -> insertResult. */
function poolFor(asg, insertResult) {
  return {
    queries: [],
    query: async (sql, params) => {
      if (/FROM assignments WHERE id/i.test(sql)) return { rows: asg ? [asg] : [] };
      if (/INSERT INTO deal_feedback/i.test(sql)) return { rows: insertResult ? [insertResult] : [] };
      return { rows: [], rowCount: 0 };
    }
  };
}

const VALID_DIMS = { zuverlaessigkeit: 5, kommunikation: 4, qualitaet: 5, termintreue: 4 };

/* ── resolveDirection ─────────────────────────────────────── */

test("resolveDirection: Unternehmen -> company_to_supplier", () => {
  const d = resolveDirection(assignment(), ORG_COMPANY);
  assert.equal(d.direction, "company_to_supplier");
  assert.equal(d.ratedOrgId, ORG_SUPPLIER);
});

test("resolveDirection: Lieferant -> supplier_to_company", () => {
  const d = resolveDirection(assignment(), ORG_SUPPLIER);
  assert.equal(d.direction, "supplier_to_company");
  assert.equal(d.ratedOrgId, ORG_COMPANY);
});

test("resolveDirection: fremde Org -> null", () => {
  assert.equal(resolveDirection(assignment(), ORG_OUTSIDER), null);
});

/* ── validateDimensions ───────────────────────────────────── */

test("validateDimensions: gültige company->supplier Dimensionen", () => {
  assert.equal(validateDimensions("company_to_supplier", VALID_DIMS), true);
});

test("validateDimensions: falsche Richtungsschlüssel -> false", () => {
  // briefing_klarheit gehört zu supplier_to_company, nicht company_to_supplier
  assert.equal(validateDimensions("company_to_supplier", { briefing_klarheit: 5 }), false);
});

test("validateDimensions: Wert außerhalb 1–5 -> false", () => {
  assert.equal(validateDimensions("company_to_supplier", { zuverlaessigkeit: 6 }), false);
  assert.equal(validateDimensions("company_to_supplier", { zuverlaessigkeit: 0 }), false);
});

test("validateDimensions: leer -> false", () => {
  assert.equal(validateDimensions("company_to_supplier", {}), false);
});

/* ── submitFeedback Guards ────────────────────────────────── */

test("submit: nicht existentes Assignment -> NOT_FOUND", async () => {
  const r = await submitFeedback(poolFor(null), { assignmentId: "x", raterOrgId: ORG_COMPANY, sentiment: "positive", dimensions: VALID_DIMS });
  assert.equal(r.error, "NOT_FOUND");
});

test("submit: nicht abgeschlossen -> NOT_COMPLETED", async () => {
  const r = await submitFeedback(poolFor(assignment({ status: "active" })), { assignmentId: "asg-1", raterOrgId: ORG_COMPANY, sentiment: "positive", dimensions: VALID_DIMS });
  assert.equal(r.error, "NOT_COMPLETED");
});

test("submit: fremde Org -> FORBIDDEN", async () => {
  const r = await submitFeedback(poolFor(assignment()), { assignmentId: "asg-1", raterOrgId: ORG_OUTSIDER, sentiment: "positive", dimensions: VALID_DIMS });
  assert.equal(r.error, "FORBIDDEN");
});

test("submit: außerhalb Fenster -> WINDOW_CLOSED", async () => {
  const old = new Date(Date.now() - (FEEDBACK_WINDOW_DAYS + 5) * 86400000).toISOString();
  const r = await submitFeedback(poolFor(assignment({ completed_at: old })), { assignmentId: "asg-1", raterOrgId: ORG_COMPANY, sentiment: "positive", dimensions: VALID_DIMS });
  assert.equal(r.error, "WINDOW_CLOSED");
});

test("submit: ungültiges Sentiment -> INVALID_SENTIMENT", async () => {
  const r = await submitFeedback(poolFor(assignment()), { assignmentId: "asg-1", raterOrgId: ORG_COMPANY, sentiment: "super", dimensions: VALID_DIMS });
  assert.equal(r.error, "INVALID_SENTIMENT");
});

test("submit: ungültige Dimensionen -> INVALID_DIMENSIONS", async () => {
  const r = await submitFeedback(poolFor(assignment()), { assignmentId: "asg-1", raterOrgId: ORG_COMPANY, sentiment: "positive", dimensions: { foo: 5 } });
  assert.equal(r.error, "INVALID_DIMENSIONS");
});

test("submit: Doppelbewertung (ON CONFLICT, kein Row) -> ALREADY_RATED", async () => {
  const r = await submitFeedback(poolFor(assignment(), null), { assignmentId: "asg-1", raterOrgId: ORG_COMPANY, sentiment: "positive", dimensions: VALID_DIMS });
  assert.equal(r.error, "ALREADY_RATED");
});

test("submit: gültig -> ok + feedback (status submitted, moderation pending)", async () => {
  const inserted = { id: "fb-1", assignment_id: "asg-1", direction: "company_to_supplier", status: "submitted", moderation: "pending" };
  const r = await submitFeedback(poolFor(assignment(), inserted), { assignmentId: "asg-1", raterOrgId: ORG_COMPANY, actorUserId: "u-1", sentiment: "positive", dimensions: VALID_DIMS, comment: "Top Lieferant" });
  assert.equal(r.ok, true);
  assert.equal(r.feedback.direction, "company_to_supplier");
  assert.equal(r.feedback.status, "submitted");
});

/* ── getPendingFeedback ───────────────────────────────────── */

test("getPendingFeedback: leere orgIds -> []", async () => {
  const r = await getPendingFeedback(poolFor(null), { orgIds: [] });
  assert.deepEqual(r, []);
});

test("getPendingFeedback: Query ist completed + fenster + nicht-bereits-bewertet, gebunden an orgIds", async () => {
  let captured = null;
  const pool = { query: async (sql, params) => { captured = { sql, params }; return { rows: [] }; } };
  await getPendingFeedback(pool, { orgIds: [ORG_COMPANY] });
  assert.match(captured.sql, /status = 'completed'/);
  assert.match(captured.sql, /make_interval\(days => \$2\)/);
  assert.match(captured.sql, /NOT EXISTS/);
  assert.match(captured.sql, /deal_feedback/);
  assert.deepEqual(captured.params[0], [ORG_COMPANY]);
});

test("DIMENSION_KEYS: beide Richtungen definiert, je 4 Achsen", () => {
  assert.equal(DIMENSION_KEYS.company_to_supplier.length, 4);
  assert.equal(DIMENSION_KEYS.supplier_to_company.length, 4);
});
