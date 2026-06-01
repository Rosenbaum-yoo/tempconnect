/**
 * Validation middleware unit tests — validate(), validateBody(), Schemas.
 * No DB.  Tests input validation, coercion, defaults, error formatting.
 *
 * Run: node --test --test-force-exit test/validate.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { validate, validateBody, validateQuery, validateParams, z, Schemas } from "../middleware/validate.js";

/* ── Test helpers ───────────────────────────────────────── */

function mockRes() {
  let _status, _json;
  return {
    status(code) { _status = code; return this; },
    json(body) { _json = body; return this; },
    get _status() { return _status; },
    get _json() { return _json; }
  };
}

// ─────────────────────────────────────────────────────────────
// validate() — body validation
// ─────────────────────────────────────────────────────────────

describe("validate — body schema", () => {
  const schema = z.object({ name: z.string().min(1), age: z.coerce.number().int().min(0) });

  it("calls next() on valid body", () => {
    const req = { body: { name: "Alice", age: 30 }, query: {}, params: {} };
    const res = mockRes();
    let nextCalled = false;
    validate({ body: schema })(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });

  it("writes coerced values back to req.body", () => {
    const req = { body: { name: "Bob", age: "25" }, query: {}, params: {} };
    const res = mockRes();
    validate({ body: schema })(req, res, () => {});
    assert.strictEqual(req.body.age, 25);
  });

  it("returns 400 with VALIDATION_ERROR on invalid body", () => {
    const req = { body: { name: "", age: -1 }, query: {}, params: {} };
    const res = mockRes();
    validate({ body: schema })(req, res, () => assert.fail("next() should not be called"));
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.success, false);
    assert.strictEqual(res._json.error.code, "VALIDATION_ERROR");
    assert.ok(Array.isArray(res._json.error.fields));
    assert.ok(res._json.error.fields.length >= 1);
  });

  it("returns structured field errors with field name, message, code", () => {
    const req = { body: { name: "" }, query: {}, params: {} };
    const res = mockRes();
    validate({ body: schema })(req, res, () => {});
    const fields = res._json.error.fields;
    assert.ok(fields.length >= 1);
    const nameField = fields.find(f => f.field === "name");
    assert.ok(nameField, "Should have a 'name' field error");
    assert.ok(nameField.message, "Should have an error message");
    assert.ok(nameField.code, "Should have an error code");
  });
});

// ─────────────────────────────────────────────────────────────
// validate() — query validation
// ─────────────────────────────────────────────────────────────

describe("validate — query schema", () => {
  it("coerces and defaults query params", () => {
    const req = { body: {}, query: {}, params: {} };
    const res = mockRes();
    validate({ query: Schemas.pagination })(req, res, () => {});
    assert.strictEqual(req.query.limit, 50);
    assert.strictEqual(req.query.offset, 0);
  });

  it("accepts valid pagination params", () => {
    const req = { body: {}, query: { limit: "10", offset: "20" }, params: {} };
    const res = mockRes();
    let nextCalled = false;
    validate({ query: Schemas.pagination })(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(req.query.limit, 10);
    assert.strictEqual(req.query.offset, 20);
  });

  it("rejects limit > 500", () => {
    const req = { body: {}, query: { limit: "1000" }, params: {} };
    const res = mockRes();
    validate({ query: Schemas.pagination })(req, res, () => {});
    assert.strictEqual(res._status, 400);
  });

  it("rejects negative offset", () => {
    const req = { body: {}, query: { offset: "-1" }, params: {} };
    const res = mockRes();
    validate({ query: Schemas.pagination })(req, res, () => {});
    assert.strictEqual(res._status, 400);
  });
});

// ─────────────────────────────────────────────────────────────
// validate() — params validation (UUID)
// ─────────────────────────────────────────────────────────────

describe("validate — params schema (UUID)", () => {
  it("accepts a valid UUID", () => {
    const req = { body: {}, query: {}, params: { id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" } };
    const res = mockRes();
    let nextCalled = false;
    validate({ params: Schemas.uuidParam })(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });

  it("rejects a non-UUID string", () => {
    const req = { body: {}, query: {}, params: { id: "not-a-uuid" } };
    const res = mockRes();
    validate({ params: Schemas.uuidParam })(req, res, () => {});
    assert.strictEqual(res._status, 400);
    const idErr = res._json.error.fields.find(f => f.field === "id");
    assert.ok(idErr, "Should flag the 'id' field");
  });

  it("rejects empty string as UUID", () => {
    const req = { body: {}, query: {}, params: { id: "" } };
    const res = mockRes();
    validate({ params: Schemas.uuidParam })(req, res, () => {});
    assert.strictEqual(res._status, 400);
  });
});

// ─────────────────────────────────────────────────────────────
// validate() — multi-target (body + query + params)
// ─────────────────────────────────────────────────────────────

describe("validate — multi-target", () => {
  it("validates body, query, and params simultaneously", () => {
    const req = {
      body: { name: "Test" },
      query: { limit: "10" },
      params: { id: "bad-uuid" }
    };
    const res = mockRes();
    validate({
      body: z.object({ name: z.string().min(1) }),
      query: Schemas.pagination,
      params: Schemas.uuidParam
    })(req, res, () => assert.fail("next() should not be called"));
    assert.strictEqual(res._status, 400);
    // Should have errors from params (bad UUID)
    assert.ok(res._json.error.fields.length >= 1);
  });

  it("collects errors from multiple targets", () => {
    const req = {
      body: { name: "" },
      query: { limit: "99999" },
      params: { id: "bad" }
    };
    const res = mockRes();
    validate({
      body: z.object({ name: z.string().min(1) }),
      query: Schemas.pagination,
      params: Schemas.uuidParam
    })(req, res, () => {});
    // Should collect errors from body, query, and params
    assert.ok(res._json.error.fields.length >= 2);
  });
});

// ─────────────────────────────────────────────────────────────
// validateBody / validateQuery / validateParams convenience fns
// ─────────────────────────────────────────────────────────────

describe("validateBody / validateQuery / validateParams", () => {
  it("validateBody validates only body", () => {
    const req = { body: { email: "bad" }, query: {}, params: {} };
    const res = mockRes();
    validateBody(Schemas.login)(req, res, () => {});
    assert.strictEqual(res._status, 400);
  });

  it("validateQuery validates only query", () => {
    const req = { body: {}, query: { limit: "-5" }, params: {} };
    const res = mockRes();
    validateQuery(Schemas.pagination)(req, res, () => {});
    assert.strictEqual(res._status, 400);
  });

  it("validateParams validates only params", () => {
    const req = { body: {}, query: {}, params: { id: "nope" } };
    const res = mockRes();
    validateParams(Schemas.uuidParam)(req, res, () => {});
    assert.strictEqual(res._status, 400);
  });
});

// ─────────────────────────────────────────────────────────────
// Schemas — business-critical schema validation
// ─────────────────────────────────────────────────────────────

describe("Schemas.register", () => {
  it("accepts valid registration", () => {
    const result = Schemas.register.safeParse({
      email: "user@example.com",
      password: "securePass1",
      name: "Test User",
      role: "EMPLOYER"
    });
    assert.strictEqual(result.success, true);
  });

  it("rejects invalid email", () => {
    const result = Schemas.register.safeParse({
      email: "not-email",
      password: "securePass1"
    });
    assert.strictEqual(result.success, false);
  });

  it("rejects password shorter than 8 chars", () => {
    const result = Schemas.register.safeParse({
      email: "user@example.com",
      password: "short"
    });
    assert.strictEqual(result.success, false);
  });

  it("rejects invalid role", () => {
    const result = Schemas.register.safeParse({
      email: "user@example.com",
      password: "securePass1",
      role: "HACKER"
    });
    assert.strictEqual(result.success, false);
  });

  it("allows valid roles: EMPLOYER, SUPPLIER, WORKER", () => {
    for (const role of ["EMPLOYER", "SUPPLIER", "WORKER"]) {
      const result = Schemas.register.safeParse({
        email: "u@x.com",
        password: "12345678",
        role
      });
      assert.strictEqual(result.success, true, `Role ${role} should be valid`);
    }
  });
});

describe("Schemas.login", () => {
  it("accepts valid login", () => {
    const result = Schemas.login.safeParse({ email: "u@x.com", password: "p" });
    assert.strictEqual(result.success, true);
  });

  it("rejects empty password", () => {
    const result = Schemas.login.safeParse({ email: "u@x.com", password: "" });
    assert.strictEqual(result.success, false);
  });
});

describe("Schemas.invoiceCreate", () => {
  it("accepts valid invoice with defaults", () => {
    const result = Schemas.invoiceCreate.safeParse({ amount: 100 });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.currency, "EUR");
    assert.strictEqual(result.data.due_days, 30);
  });

  it("rejects negative amount", () => {
    const result = Schemas.invoiceCreate.safeParse({ amount: -10 });
    assert.strictEqual(result.success, false);
  });

  it("rejects due_days > 365", () => {
    const result = Schemas.invoiceCreate.safeParse({ amount: 100, due_days: 999 });
    assert.strictEqual(result.success, false);
  });
});

describe("Schemas.timesheetSubmit", () => {
  it("accepts valid timesheet submit", () => {
    const result = Schemas.timesheetSubmit.safeParse({
      deal_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      week_start: "2026-01-05",
      hours: 40
    });
    assert.strictEqual(result.success, true);
  });

  it("rejects hours > 168 (7 days × 24h)", () => {
    const result = Schemas.timesheetSubmit.safeParse({
      deal_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      week_start: "2026-01-05",
      hours: 200
    });
    assert.strictEqual(result.success, false);
  });

  it("rejects invalid date format", () => {
    const result = Schemas.timesheetSubmit.safeParse({
      deal_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      week_start: "01/05/2026",
      hours: 40
    });
    assert.strictEqual(result.success, false);
  });
});

describe("Schemas.dealCreate", () => {
  it("accepts valid deal", () => {
    const result = Schemas.dealCreate.safeParse({
      requisition_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      start_date: "2026-03-01",
      end_date: "2026-06-30",
      workers_count: 5
    });
    assert.strictEqual(result.success, true);
  });

  it("rejects workers_count = 0", () => {
    const result = Schemas.dealCreate.safeParse({
      requisition_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      start_date: "2026-03-01",
      end_date: "2026-06-30",
      workers_count: 0
    });
    assert.strictEqual(result.success, false);
  });

  it("rejects workers_count > 10000", () => {
    const result = Schemas.dealCreate.safeParse({
      requisition_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      start_date: "2026-03-01",
      end_date: "2026-06-30",
      workers_count: 50000
    });
    assert.strictEqual(result.success, false);
  });
});

describe("Schemas.organizationCreate", () => {
  it("accepts valid org", () => {
    const result = Schemas.organizationCreate.safeParse({ name: "Acme GmbH" });
    assert.strictEqual(result.success, true);
  });

  it("rejects name shorter than 2 chars", () => {
    const result = Schemas.organizationCreate.safeParse({ name: "A" });
    assert.strictEqual(result.success, false);
  });

  it("rejects invalid slug characters", () => {
    const result = Schemas.organizationCreate.safeParse({ name: "Acme", slug: "INVALID SLUG!" });
    assert.strictEqual(result.success, false);
  });

  it("rejects invalid plan tier", () => {
    const result = Schemas.organizationCreate.safeParse({ name: "Acme", plan: "ULTRA" });
    assert.strictEqual(result.success, false);
  });

  it("accepts all valid plan tiers", () => {
    for (const plan of ["FREE", "BASIS", "PLUS", "PRO", "ENTERPRISE"]) {
      const result = Schemas.organizationCreate.safeParse({ name: "Acme", plan });
      assert.strictEqual(result.success, true, `Plan ${plan} should be valid`);
    }
  });
});

describe("Schemas.paymentCheckout", () => {
  it("accepts valid checkout", () => {
    const result = Schemas.paymentCheckout.safeParse({ plan: "PRO" });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.payment_method, "demo");
  });

  it("rejects FREE plan (not billable)", () => {
    const result = Schemas.paymentCheckout.safeParse({ plan: "FREE" });
    assert.strictEqual(result.success, false);
  });

  it("rejects ENTERPRISE plan (not self-service)", () => {
    const result = Schemas.paymentCheckout.safeParse({ plan: "ENTERPRISE" });
    assert.strictEqual(result.success, false);
  });
});
