/**
 * Timesheet Template Service — comprehensive coverage suite.
 *
 * Exported functions under test:
 *   - getTemplate            (scoped / unscoped read + fields join)
 *   - listTemplates          (org-scoped list)
 *   - createTemplate         (default-reset, field insert, duplicate, throw, rollback)
 *   - updateTemplate         (NOT_FOUND, partial update, default-reset, field replace, throw)
 *   - deleteTemplate         (in-use guard, scoped delete, NOT_FOUND)
 *   - getTemplateForAssignment (3-tier priority: assignment → org → default → null)
 *   - assignTemplate         (TEMPLATE_NOT_FOUND, missing target, insert, conflict, throw)
 *   - removeAssignment       (scoped delete, NOT_FOUND)
 *
 * Asserts BEHAVIOR: return values, thrown errors, SQL shape, bound params,
 * branch selection, ordering. No DB — tracking pool only.
 *
 * Run: node --test --test-force-exit test/timesheetTemplateService.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getTemplate,
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplateForAssignment,
  assignTemplate,
  removeAssignment
} from "../services/timesheetTemplateService.js";

const TMPL = "00000000-0000-4000-8000-000000000001";
const ORG = "00000000-0000-4000-8000-000000000002";
const ASGN = "00000000-0000-4000-8000-000000000003";
const USER = "00000000-0000-4000-8000-000000000004";

/**
 * Tracking pool: records every query (sql + params) and dispatches to a
 * handler that matches on SQL substrings. Returns {rows:[],rowCount:0} by
 * default. connect() shares the same query fn (BEGIN/COMMIT/ROLLBACK fall
 * through the handler harmlessly → default empty result).
 */
function trackingPool(handler) {
  const calls = [];
  const query = async (sql, params) => {
    const s = String(sql);
    calls.push({ sql: s, params: params || [] });
    const out = handler ? handler(s, params || [], calls) : undefined;
    return out === undefined ? { rows: [], rowCount: 0 } : out;
  };
  const pool = {
    calls,
    query,
    connect: async () => ({ query, release() {} })
  };
  return pool;
}

const has = (sql, frag) => sql.includes(frag);

// ═══════════════════════════════════════════════════════════════
// getTemplate
// ═══════════════════════════════════════════════════════════════

describe("getTemplate", () => {
  it("returns template with fields when found (unscoped: no supplier_org_id param)", async () => {
    const tmpl = { id: TMPL, name: "Standard" };
    const fields = [{ id: "f1", field_key: "hours" }];
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM timesheet_templates tt")) return { rows: [tmpl], rowCount: 1 };
      if (has(sql, "FROM timesheet_template_fields")) return { rows: fields, rowCount: 1 };
      return undefined;
    });

    const result = await getTemplate(pool, TMPL);

    assert.equal(result.id, TMPL);
    assert.deepEqual(result.fields, fields);
    // unscoped → first query bound only with templateId
    const head = pool.calls.find((c) => has(c.sql, "FROM timesheet_templates tt"));
    assert.deepEqual(head.params, [TMPL]);
    assert.ok(!has(head.sql, "AND tt.supplier_org_id = $2"));
  });

  it("adds supplier_org_id scope clause + param when supplierOrgId given", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM timesheet_templates tt")) return { rows: [{ id: TMPL }], rowCount: 1 };
      if (has(sql, "FROM timesheet_template_fields")) return { rows: [], rowCount: 0 };
      return undefined;
    });

    await getTemplate(pool, TMPL, ORG);

    const head = pool.calls.find((c) => has(c.sql, "FROM timesheet_templates tt"));
    assert.ok(has(head.sql, "AND tt.supplier_org_id = $2"));
    assert.deepEqual(head.params, [TMPL, ORG]);
  });

  it("returns null and does NOT query fields when template missing", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM timesheet_templates tt")) return { rows: [], rowCount: 0 };
      return undefined;
    });

    const result = await getTemplate(pool, TMPL, ORG);

    assert.equal(result, null);
    assert.equal(pool.calls.filter((c) => has(c.sql, "timesheet_template_fields")).length, 0);
  });

  it("orders fields by sort_order then created_at", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM timesheet_templates tt")) return { rows: [{ id: TMPL }], rowCount: 1 };
      if (has(sql, "FROM timesheet_template_fields")) return { rows: [], rowCount: 0 };
      return undefined;
    });

    await getTemplate(pool, TMPL);

    const fq = pool.calls.find((c) => has(c.sql, "timesheet_template_fields"));
    assert.ok(has(fq.sql, "ORDER BY sort_order ASC, created_at ASC"));
    assert.deepEqual(fq.params, [TMPL]);
  });
});

// ═══════════════════════════════════════════════════════════════
// listTemplates
// ═══════════════════════════════════════════════════════════════

describe("listTemplates", () => {
  it("returns rows scoped to supplier org with assignment_count + default ordering", async () => {
    const rows = [{ id: TMPL, assignment_count: "2" }];
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM timesheet_templates tt")) return { rows, rowCount: 1 };
      return undefined;
    });

    const result = await listTemplates(pool, ORG);

    assert.deepEqual(result, rows);
    const q = pool.calls[0];
    assert.deepEqual(q.params, [ORG]);
    assert.ok(has(q.sql, "WHERE tt.supplier_org_id = $1"));
    assert.ok(has(q.sql, "COUNT(tta.id) AS assignment_count"));
    assert.ok(has(q.sql, "ORDER BY tt.is_default DESC, tt.name ASC"));
  });

  it("returns empty array when org has no templates", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const result = await listTemplates(pool, ORG);
    assert.deepEqual(result, []);
  });
});

// ═══════════════════════════════════════════════════════════════
// createTemplate
// ═══════════════════════════════════════════════════════════════

describe("createTemplate", () => {
  it("inserts template, trims name/description, applies isDefault=false (no reset)", async () => {
    const created = { id: TMPL, name: "Pflege" };
    const pool = trackingPool((sql) => {
      if (has(sql, "INSERT INTO timesheet_templates")) return { rows: [created], rowCount: 1 };
      return undefined;
    });

    const result = await createTemplate(pool, {
      supplierOrgId: ORG,
      name: "  Pflege  ",
      description: "  Beschreibung  ",
      isDefault: false,
      createdBy: USER,
      fields: []
    });

    assert.deepEqual(result, { template: created });
    // no default-reset UPDATE when isDefault falsy
    assert.equal(pool.calls.filter((c) => has(c.sql, "SET is_default = FALSE")).length, 0);
    const ins = pool.calls.find((c) => has(c.sql, "INSERT INTO timesheet_templates"));
    assert.deepEqual(ins.params, [ORG, "Pflege", "Beschreibung", false, USER]);
  });

  it("resets existing default when isDefault=true, then inserts fields", async () => {
    const created = { id: TMPL };
    const pool = trackingPool((sql) => {
      if (has(sql, "INSERT INTO timesheet_templates")) return { rows: [created], rowCount: 1 };
      return undefined;
    });

    const fields = [
      { field_key: "hours", label: "Stunden", field_type: "number", is_required: true, options: { a: 1 } },
      { field_key: "note", label: "Notiz" } // defaults branch
    ];
    const result = await createTemplate(pool, {
      supplierOrgId: ORG, name: "Default", description: null,
      isDefault: true, createdBy: USER, fields
    });

    assert.deepEqual(result, { template: created });

    const reset = pool.calls.find((c) => has(c.sql, "SET is_default = FALSE"));
    assert.ok(reset, "default-reset UPDATE must run");
    assert.deepEqual(reset.params, [ORG]);

    const fieldInserts = pool.calls.filter((c) => has(c.sql, "INSERT INTO timesheet_template_fields"));
    assert.equal(fieldInserts.length, 2);
    // field 0: explicit values + options serialized to JSON string
    assert.deepEqual(fieldInserts[0].params, [
      TMPL, "hours", "Stunden", "number", true, true, null, JSON.stringify({ a: 1 }), 0
    ]);
    // field 1: defaults — field_type "text", is_required false, is_visible true, options null, sort_order=index
    assert.deepEqual(fieldInserts[1].params, [
      TMPL, "note", "Notiz", "text", false, true, null, null, 1
    ]);
    // description null when null passed (no trim crash)
    const ins = pool.calls.find((c) => has(c.sql, "INSERT INTO timesheet_templates"));
    assert.equal(ins.params[2], null);
  });

  it("returns DUPLICATE_NAME on 23505 unique violation (and rolls back)", async () => {
    const err = new Error("dup");
    err.code = "23505";
    const pool = trackingPool((sql) => {
      if (has(sql, "INSERT INTO timesheet_templates")) throw err;
      return undefined;
    });

    const result = await createTemplate(pool, {
      supplierOrgId: ORG, name: "X", isDefault: false, createdBy: USER
    });

    assert.deepEqual(result, { error: "DUPLICATE_NAME" });
    assert.ok(pool.calls.some((c) => c.sql.trim().toUpperCase() === "ROLLBACK"));
  });

  it("re-throws non-23505 errors after rollback", async () => {
    const err = new Error("boom");
    err.code = "42P01";
    const pool = trackingPool((sql) => {
      if (has(sql, "INSERT INTO timesheet_templates")) throw err;
      return undefined;
    });

    await assert.rejects(
      () => createTemplate(pool, { supplierOrgId: ORG, name: "X", isDefault: false, createdBy: USER }),
      /boom/
    );
    assert.ok(pool.calls.some((c) => c.sql.trim().toUpperCase() === "ROLLBACK"));
  });
});

// ═══════════════════════════════════════════════════════════════
// updateTemplate
// ═══════════════════════════════════════════════════════════════

describe("updateTemplate", () => {
  it("returns NOT_FOUND when template missing (getTemplate pre-check)", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM timesheet_templates tt")) return { rows: [], rowCount: 0 };
      return undefined;
    });

    const result = await updateTemplate(pool, TMPL, ORG, { name: "New" });

    assert.deepEqual(result, { error: "NOT_FOUND" });
    // no UPDATE attempted
    assert.equal(pool.calls.filter((c) => has(c.sql, "UPDATE timesheet_templates SET")).length, 0);
  });

  it("applies partial update with trimmed name + updated_at, returns ok", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM timesheet_templates tt")) return { rows: [{ id: TMPL }], rowCount: 1 };
      if (has(sql, "FROM timesheet_template_fields")) return { rows: [], rowCount: 0 };
      return undefined;
    });

    const result = await updateTemplate(pool, TMPL, ORG, { name: "  Renamed  " });

    assert.deepEqual(result, { ok: true });
    const upd = pool.calls.find((c) => has(c.sql, "UPDATE timesheet_templates SET name"));
    assert.ok(upd, "field UPDATE must run");
    assert.ok(has(upd.sql, "updated_at = NOW()"));
    // params: [trimmedName, templateId]
    assert.deepEqual(upd.params, ["Renamed", TMPL]);
  });

  it("does NOT run column UPDATE when only updated_at would change (no fields supplied)", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM timesheet_templates tt")) return { rows: [{ id: TMPL }], rowCount: 1 };
      return undefined;
    });

    const result = await updateTemplate(pool, TMPL, ORG, {});

    assert.deepEqual(result, { ok: true });
    // updates array has only "updated_at = NOW()" → length 1 → skip
    assert.equal(pool.calls.filter((c) => has(c.sql, "UPDATE timesheet_templates SET")).length, 0);
  });

  it("resets other defaults (excluding self) when isDefault=true and updates flags", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM timesheet_templates tt")) return { rows: [{ id: TMPL }], rowCount: 1 };
      return undefined;
    });

    const result = await updateTemplate(pool, TMPL, ORG, { isDefault: true, isActive: false });

    assert.deepEqual(result, { ok: true });
    const reset = pool.calls.find((c) => has(c.sql, "AND id != $2"));
    assert.ok(reset, "default-reset excluding self must run");
    assert.deepEqual(reset.params, [ORG, TMPL]);
    const upd = pool.calls.find((c) => has(c.sql, "updated_at = NOW()"));
    assert.ok(upd);
    // params order: is_default(true), is_active(false), templateId
    assert.deepEqual(upd.params, [true, false, TMPL]);
  });

  it("replaces fields: DELETE then INSERT each, with defaults + options serialization", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM timesheet_templates tt")) return { rows: [{ id: TMPL }], rowCount: 1 };
      return undefined;
    });

    const fields = [
      { field_key: "a", label: "A", options: { x: 1 }, sort_order: 5 }
    ];
    const result = await updateTemplate(pool, TMPL, ORG, { fields });

    assert.deepEqual(result, { ok: true });
    const del = pool.calls.find((c) => has(c.sql, "DELETE FROM timesheet_template_fields"));
    assert.ok(del);
    assert.deepEqual(del.params, [TMPL]);
    const ins = pool.calls.find((c) => has(c.sql, "INSERT INTO timesheet_template_fields"));
    assert.ok(ins);
    // explicit sort_order=5 honored, options JSON-encoded, defaults for type/required/visible
    assert.deepEqual(ins.params, [
      TMPL, "a", "A", "text", false, true, null, JSON.stringify({ x: 1 }), 5
    ]);
  });

  it("does NOT touch fields when fields is not an array", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM timesheet_templates tt")) return { rows: [{ id: TMPL }], rowCount: 1 };
      return undefined;
    });

    await updateTemplate(pool, TMPL, ORG, { name: "X", fields: undefined });

    assert.equal(pool.calls.filter((c) => has(c.sql, "DELETE FROM timesheet_template_fields")).length, 0);
  });

  it("re-throws and rolls back when an UPDATE fails", async () => {
    const err = new Error("update failed");
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM timesheet_templates tt")) return { rows: [{ id: TMPL }], rowCount: 1 };
      if (has(sql, "UPDATE timesheet_templates SET name")) throw err;
      return undefined;
    });

    await assert.rejects(() => updateTemplate(pool, TMPL, ORG, { name: "X" }), /update failed/);
    assert.ok(pool.calls.some((c) => c.sql.trim().toUpperCase() === "ROLLBACK"));
  });
});

// ═══════════════════════════════════════════════════════════════
// deleteTemplate
// ═══════════════════════════════════════════════════════════════

describe("deleteTemplate", () => {
  it("returns TEMPLATE_IN_USE with count when assignments exist", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM timesheet_template_assignments")) return { rows: [{ cnt: "3" }], rowCount: 1 };
      return undefined;
    });

    const result = await deleteTemplate(pool, TMPL, ORG);

    assert.deepEqual(result, { error: "TEMPLATE_IN_USE", count: 3 });
    // must NOT attempt delete
    assert.equal(pool.calls.filter((c) => has(c.sql, "DELETE FROM timesheet_templates")).length, 0);
  });

  it("deletes scoped (id + supplier_org_id) and returns ok when row removed", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM timesheet_template_assignments")) return { rows: [{ cnt: "0" }], rowCount: 1 };
      if (has(sql, "DELETE FROM timesheet_templates")) return { rows: [], rowCount: 1 };
      return undefined;
    });

    const result = await deleteTemplate(pool, TMPL, ORG);

    assert.deepEqual(result, { ok: true });
    const del = pool.calls.find((c) => has(c.sql, "DELETE FROM timesheet_templates"));
    assert.ok(has(del.sql, "WHERE id = $1 AND supplier_org_id = $2"));
    assert.deepEqual(del.params, [TMPL, ORG]);
  });

  it("returns NOT_FOUND when delete affects 0 rows (wrong org / missing)", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM timesheet_template_assignments")) return { rows: [{ cnt: "0" }], rowCount: 1 };
      if (has(sql, "DELETE FROM timesheet_templates")) return { rows: [], rowCount: 0 };
      return undefined;
    });

    const result = await deleteTemplate(pool, TMPL, ORG);
    assert.deepEqual(result, { error: "NOT_FOUND" });
  });
});

// ═══════════════════════════════════════════════════════════════
// getTemplateForAssignment (3-tier priority)
// ═══════════════════════════════════════════════════════════════

describe("getTemplateForAssignment", () => {
  it("tier 1: returns assignment-specific template (loads full via getTemplate)", async () => {
    const pool = trackingPool((sql, params) => {
      if (has(sql, "WHERE tta.assignment_id = $1")) return { rows: [{ id: TMPL }], rowCount: 1 };
      // getTemplate scoped load
      if (has(sql, "FROM timesheet_templates tt") && has(sql, "AND tt.supplier_org_id = $2"))
        return { rows: [{ id: TMPL, name: "Assigned" }], rowCount: 1 };
      if (has(sql, "FROM timesheet_template_fields")) return { rows: [], rowCount: 0 };
      return undefined;
    });

    const result = await getTemplateForAssignment(pool, ASGN, ORG);

    assert.equal(result.name, "Assigned");
    assert.deepEqual(result.fields, []);
    // org-spec + default queries must NOT run
    assert.equal(pool.calls.filter((c) => has(c.sql, "tta.assignment_id IS NULL")).length, 0);
    assert.equal(pool.calls.filter((c) => has(c.sql, "is_default = TRUE")).length, 0);
  });

  it("tier 2: falls through to org-specific template when no assignment binding", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "WHERE tta.assignment_id = $1")) return { rows: [], rowCount: 0 };
      if (has(sql, "tta.assignment_id IS NULL")) return { rows: [{ id: TMPL }], rowCount: 1 };
      if (has(sql, "FROM timesheet_templates tt") && has(sql, "AND tt.supplier_org_id = $2"))
        return { rows: [{ id: TMPL, name: "OrgSpec" }], rowCount: 1 };
      if (has(sql, "FROM timesheet_template_fields")) return { rows: [], rowCount: 0 };
      return undefined;
    });

    const result = await getTemplateForAssignment(pool, ASGN, ORG);

    assert.equal(result.name, "OrgSpec");
    assert.equal(pool.calls.filter((c) => has(c.sql, "is_default = TRUE")).length, 0);
  });

  it("tier 3: falls through to default template of the agency", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "WHERE tta.assignment_id = $1")) return { rows: [], rowCount: 0 };
      if (has(sql, "tta.assignment_id IS NULL")) return { rows: [], rowCount: 0 };
      if (has(sql, "is_default = TRUE")) return { rows: [{ id: TMPL }], rowCount: 1 };
      if (has(sql, "FROM timesheet_templates tt") && has(sql, "AND tt.supplier_org_id = $2"))
        return { rows: [{ id: TMPL, name: "Default" }], rowCount: 1 };
      if (has(sql, "FROM timesheet_template_fields")) return { rows: [], rowCount: 0 };
      return undefined;
    });

    const result = await getTemplateForAssignment(pool, ASGN, ORG);
    assert.equal(result.name, "Default");
  });

  it("returns null when no template at any tier", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const result = await getTemplateForAssignment(pool, ASGN, ORG);
    assert.equal(result, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// assignTemplate
// ═══════════════════════════════════════════════════════════════

describe("assignTemplate", () => {
  it("returns TEMPLATE_NOT_FOUND when template not owned by agency", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM timesheet_templates tt")) return { rows: [], rowCount: 0 };
      return undefined;
    });

    const result = await assignTemplate(pool, {
      templateId: TMPL, supplierOrgId: ORG, assignmentId: ASGN, createdBy: USER
    });

    assert.deepEqual(result, { error: "TEMPLATE_NOT_FOUND" });
    assert.equal(pool.calls.filter((c) => has(c.sql, "INSERT INTO timesheet_template_assignments")).length, 0);
  });

  it("returns ASSIGNMENT_OR_ORG_REQUIRED when neither assignmentId nor orgId given", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM timesheet_templates tt")) return { rows: [{ id: TMPL }], rowCount: 1 };
      if (has(sql, "FROM timesheet_template_fields")) return { rows: [], rowCount: 0 };
      return undefined;
    });

    const result = await assignTemplate(pool, {
      templateId: TMPL, supplierOrgId: ORG, createdBy: USER
    });

    assert.deepEqual(result, { error: "ASSIGNMENT_OR_ORG_REQUIRED" });
  });

  it("inserts assignment (upsert) and returns ok + row, normalizing null targets", async () => {
    const asgnRow = { id: "a1", template_id: TMPL };
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM timesheet_templates tt")) return { rows: [{ id: TMPL }], rowCount: 1 };
      if (has(sql, "FROM timesheet_template_fields")) return { rows: [], rowCount: 0 };
      // Neu: assignTemplate verlangt eine nachweisbare Geschaeftsbeziehung,
      // bevor eine Vorlage einer fremden Org zugeordnet werden darf.
      if (has(sql, "FROM vendor_pool")) return { rows: [{ ok: 1 }], rowCount: 1 };
      if (has(sql, "INSERT INTO timesheet_template_assignments")) return { rows: [asgnRow], rowCount: 1 };
      return undefined;
    });

    const result = await assignTemplate(pool, {
      templateId: TMPL, supplierOrgId: ORG, orgId: ORG, createdBy: USER
    });

    assert.deepEqual(result, { ok: true, assignment: asgnRow });
    const ins = pool.calls.find((c) => has(c.sql, "INSERT INTO timesheet_template_assignments"));
    assert.ok(has(ins.sql, "ON CONFLICT"));
    // assignmentId omitted → null; orgId passed
    assert.deepEqual(ins.params, [TMPL, null, ORG, USER]);
  });

  it("returns ALREADY_ASSIGNED on 23505 unique violation", async () => {
    const err = new Error("dup");
    err.code = "23505";
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM timesheet_templates tt")) return { rows: [{ id: TMPL }], rowCount: 1 };
      if (has(sql, "FROM timesheet_template_fields")) return { rows: [], rowCount: 0 };
      // Neu: die Ziel-Org wird aus dem Einsatz ABGELEITET — der muss existieren
      // und der Agentur gehoeren.
      if (has(sql, "FROM assignments WHERE id")) return { rows: [{ id: ASGN, org_id: ORG, supplier_org_id: ORG }], rowCount: 1 };
      if (has(sql, "INSERT INTO timesheet_template_assignments")) throw err;
      return undefined;
    });

    const result = await assignTemplate(pool, {
      templateId: TMPL, supplierOrgId: ORG, assignmentId: ASGN, createdBy: USER
    });

    assert.deepEqual(result, { error: "ALREADY_ASSIGNED" });
  });

  it("re-throws non-23505 insert errors", async () => {
    const err = new Error("fk violation");
    err.code = "23503";
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM timesheet_templates tt")) return { rows: [{ id: TMPL }], rowCount: 1 };
      if (has(sql, "FROM timesheet_template_fields")) return { rows: [], rowCount: 0 };
      // Neu: die Ziel-Org wird aus dem Einsatz ABGELEITET — der muss existieren
      // und der Agentur gehoeren.
      if (has(sql, "FROM assignments WHERE id")) return { rows: [{ id: ASGN, org_id: ORG, supplier_org_id: ORG }], rowCount: 1 };
      if (has(sql, "INSERT INTO timesheet_template_assignments")) throw err;
      return undefined;
    });

    await assert.rejects(() => assignTemplate(pool, {
      templateId: TMPL, supplierOrgId: ORG, assignmentId: ASGN, createdBy: USER
    }), /fk violation/);
  });
});

// ═══════════════════════════════════════════════════════════════
// removeAssignment
// ═══════════════════════════════════════════════════════════════

describe("removeAssignment", () => {
  it("deletes scoped via supplier_org_id + assignment_id and returns ok when removed", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "DELETE FROM timesheet_template_assignments")) return { rows: [], rowCount: 1 };
      return undefined;
    });

    const result = await removeAssignment(pool, ASGN, ORG);

    assert.deepEqual(result, { ok: true });
    const del = pool.calls[0];
    assert.ok(has(del.sql, "USING timesheet_templates tt"));
    assert.ok(has(del.sql, "tt.supplier_org_id = $1"));
    assert.ok(has(del.sql, "tta.assignment_id = $2"));
    assert.deepEqual(del.params, [ORG, ASGN]);
  });

  it("returns NOT_FOUND when nothing matched (wrong org / missing)", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "DELETE FROM timesheet_template_assignments")) return { rows: [], rowCount: 0 };
      return undefined;
    });

    const result = await removeAssignment(pool, ASGN, ORG);
    assert.deepEqual(result, { error: "NOT_FOUND" });
  });
});
