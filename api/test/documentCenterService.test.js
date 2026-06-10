import { test } from "node:test";
import assert from "node:assert/strict";
import {
  uploadDocument,
  listDocuments,
  purgeRetentionDue,
  centerStats,
} from "../services/documentCenterService.js";

function mockPool(rows = []) {
  const calls = [];
  return { calls, query: async (sql, params) => { calls.push({ sql, params }); return { rows }; } };
}

test("listDocuments: org_id-Filter + Limit-Clamp + DESC", async () => {
  const p = mockPool([]);
  await listDocuments(p, { org_id: "org1", limit: 999 });
  const { sql, params } = p.calls[0];
  assert.match(sql, /WHERE dc\.org_id = \$1/);
  assert.match(sql, /ORDER BY dc\.created_at DESC/);
  assert.equal(params[0], "org1");
  assert.equal(params[params.length - 1], 200, "Limit auf 200 geklemmt");
});

test("listDocuments: type/category/status-Filter fuegen Params hinzu", async () => {
  const p = mockPool([]);
  await listDocuments(p, { org_id: "o", document_type: "invoice", content_category: "financial", status: "active" });
  const { sql, params } = p.calls[0];
  assert.match(sql, /dc\.document_type = /);
  assert.match(sql, /dc\.content_category = /);
  assert.match(sql, /dc\.status = /);
  assert.ok(params.includes("invoice"));
  assert.ok(params.includes("financial"));
  assert.ok(params.includes("active"));
});

test("uploadDocument: INSERT mit org_id/title/type + RETURNING", async () => {
  const p = mockPool([{ id: "x" }]);
  const r = await uploadDocument(p, { org_id: "o", title: "Rechnung Mai", document_type: "invoice" });
  const { sql, params } = p.calls[0];
  assert.match(sql, /INSERT INTO document_center/);
  assert.match(sql, /RETURNING \*/);
  assert.equal(params[0], "o");
  assert.equal(params[2], "invoice");
  assert.equal(params[4], "Rechnung Mai");
  assert.equal(r.id, "x");
});

test("uploadDocument: sinnvolle Defaults (type=other, category=operational, source=upload)", async () => {
  const p = mockPool([{ id: "x" }]);
  await uploadDocument(p, { org_id: "o", title: "T" });
  const { params } = p.calls[0];
  assert.equal(params[2], "other");
  assert.equal(params[3], "operational");
  assert.equal(params[9], "upload");
});

test("purgeRetentionDue: atomares DELETE, liefert deleted + file_refs (nur non-null)", async () => {
  const p = mockPool([{ id: "1", file_ref: "/uploads/a.pdf" }, { id: "2", file_ref: null }]);
  const r = await purgeRetentionDue(p, { limit: 50 });
  const { sql, params } = p.calls[0];
  assert.match(sql, /DELETE FROM document_center/);
  assert.match(sql, /retention_delete_at < NOW\(\)/);
  assert.equal(params[0], 50);
  assert.equal(r.deleted, 2);
  assert.deepEqual(r.file_refs, ["/uploads/a.pdf"]);
});

test("centerStats: aggregiert active/archived/size/by_type", async () => {
  const p = mockPool([
    { document_type: "invoice", content_category: "financial", status: "active", sz: 100 },
    { document_type: "invoice", content_category: "financial", status: "archived", sz: 50 },
  ]);
  const s = await centerStats(p, "org");
  assert.equal(s.total, 2);
  assert.equal(s.active, 1);
  assert.equal(s.archived, 1);
  assert.equal(s.total_size_bytes, 150);
  assert.equal(s.by_type.invoice, 2);
});
