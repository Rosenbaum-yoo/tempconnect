/**
 * dealFeedbackService.test.js — Deal-Feedback v2 (Phase 1) Fundament-Tests.
 * DB-frei (Mock-Pool): Richtungs-Auflösung, Dimensions-Validierung, submit-Guards
 * (participant-only, completed-only, Fenster, UNIQUE je Richtung).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveDirection, validateDimensions, submitFeedback, getPendingFeedback,
  revealDueFeedback, computeGrade, getOrgReputationSummary,
  DIMENSION_KEYS, FEEDBACK_WINDOW_DAYS, REVEAL_DEADLINE_DAYS
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

/* ── P2: Mutual-blind Reveal + Auto-Moderation ────────────── */

/** Mock mit Counterparty-/Reveal-/Capture-Unterstützung. */
function poolP2(asg, inserted, counterpartyExists) {
  const calls = [];
  const pool = {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/FROM assignments WHERE id/i.test(sql)) return { rows: asg ? [asg] : [] };
      if (/INSERT INTO deal_feedback/i.test(sql)) return { rows: inserted ? [inserted] : [] };
      if (/SELECT 1 FROM deal_feedback/i.test(sql)) return { rows: counterpartyExists ? [{ ok: 1 }] : [] };
      if (/UPDATE deal_feedback SET status = 'revealed'/i.test(sql)) return { rowCount: 2 };
      return { rows: [], rowCount: 0 };
    }
  };
  return pool;
}

test("mutual-blind: Gegenrichtung liegt vor -> beide enthüllt (revealed=true)", async () => {
  const inserted = { id: "fb-2", direction: "supplier_to_company", status: "submitted" };
  const r = await submitFeedback(
    poolP2(assignment(), inserted, true),
    { assignmentId: "asg-1", raterOrgId: ORG_SUPPLIER, sentiment: "positive", dimensions: { briefing_klarheit: 5, kommunikation: 5, zahlungsmoral: 5, fairness: 5 } }
  );
  assert.equal(r.ok, true);
  assert.equal(r.revealed, true, "Bei beidseitiger Abgabe sofort enthüllen");
});

test("mutual-blind: keine Gegenrichtung -> verborgen (revealed=false)", async () => {
  const inserted = { id: "fb-3", direction: "company_to_supplier", status: "submitted" };
  const r = await submitFeedback(
    poolP2(assignment(), inserted, false),
    { assignmentId: "asg-1", raterOrgId: ORG_COMPANY, sentiment: "positive", dimensions: VALID_DIMS }
  );
  assert.equal(r.ok, true);
  assert.equal(r.revealed, false, "Einseitig bleibt verborgen bis Frist/Gegenseite");
});

test("auto-moderation: sauberer Kommentar -> moderation='approved', flagged=false", async () => {
  const pool = poolP2(assignment(), { id: "fb-4", status: "submitted" }, false);
  const r = await submitFeedback(pool, {
    assignmentId: "asg-1", raterOrgId: ORG_COMPANY, sentiment: "positive", dimensions: VALID_DIMS, comment: "Sehr zuverlaessig und puenktlich"
  });
  assert.equal(r.ok, true);
  assert.equal(r.flagged, false);
  const insert = pool.calls.find(c => /INSERT INTO deal_feedback/i.test(c.sql));
  assert.equal(insert.params[8], "approved", "moderation-Param muss 'approved' sein");
});

/* ── P2: revealDueFeedback Sweep ──────────────────────────── */

test("revealDueFeedback: enthüllt 'submitted' nach Frist, korrekte SQL-Form", async () => {
  let captured = null;
  const pool = { query: async (sql, params) => { captured = { sql, params }; return { rowCount: 3 }; } };
  const r = await revealDueFeedback(pool, { deadlineDays: REVEAL_DEADLINE_DAYS });
  assert.equal(r.revealed, 3);
  assert.match(captured.sql, /SET status = 'revealed'/);
  assert.match(captured.sql, /status = 'submitted'/);
  assert.match(captured.sql, /HAVING MIN\(created_at\)/);
  assert.match(captured.sql, /make_interval\(days => \$1\)/);
  assert.deepEqual(captured.params, [REVEAL_DEADLINE_DAYS]);
});

/* ── P5: Reputation-Grade + Summary ───────────────────────── */

test("computeGrade: Schwellen", () => {
  assert.equal(computeGrade(0, null), "unbewertet");
  assert.equal(computeGrade(12, 99), "top");          // >=98 + >=10
  assert.equal(computeGrade(5, 99), "sehr_gut");      // >=98 aber <10 -> nicht top
  assert.equal(computeGrade(20, 96), "sehr_gut");
  assert.equal(computeGrade(20, 92), "gut");
  assert.equal(computeGrade(20, 85), "solide");
  assert.equal(computeGrade(20, 70), "ausbaufaehig");
});

test("getOrgReputationSummary: % positiv + grade aus Zählern (revealed+approved)", async () => {
  let captured = null;
  const pool = { query: async (sql, params) => { captured = { sql, params }; return { rows: [{ total: 10, positive: 9, neutral: 1, negative: 0 }] }; } };
  const s = await getOrgReputationSummary(pool, "org-x");
  assert.equal(s.total, 10);
  assert.equal(s.percent_positive, 90);
  assert.equal(s.grade, "gut");
  assert.match(captured.sql, /status = 'revealed'/);
  assert.match(captured.sql, /moderation = 'approved'/);
  assert.deepEqual(captured.params, ["org-x"]);
});

test("getOrgReputationSummary: kein Feedback -> unbewertet, percent null", async () => {
  const pool = { query: async () => ({ rows: [{ total: 0, positive: 0, neutral: 0, negative: 0 }] }) };
  const s = await getOrgReputationSummary(pool, "org-y");
  assert.equal(s.total, 0);
  assert.equal(s.percent_positive, null);
  assert.equal(s.grade, "unbewertet");
});
