import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ingestRecord, ingestContent, ingestAgreementDocs } from "../services/documentIngestService.js";

function mockPool(responder) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      return responder ? responder(sql, params, calls.length) : { rows: [{ id: "doc-1" }] };
    }
  };
}

function cleanup(fileRef) {
  if (!fileRef) return;
  try { fs.unlinkSync(path.join(process.cwd(), String(fileRef).replace(/^\//, ""))); } catch { /* weg ist weg */ }
}

test("ingestRecord: ohne org_id -> null, KEINE Query", async () => {
  const p = mockPool();
  const r = await ingestRecord(p, { title: "X" });
  assert.equal(r, null);
  assert.equal(p.calls.length, 0);
});

test("ingestRecord: default source=system, INSERT in document_center", async () => {
  const p = mockPool();
  const r = await ingestRecord(p, { org_id: "o1", title: "T", document_type: "report", content_category: "legal" });
  assert.equal(r.id, "doc-1");
  const { sql, params } = p.calls[0];
  assert.match(sql, /INSERT INTO document_center/);
  assert.ok(params.includes("system"), "source default 'system'");
});

test("ingestRecord: wirft NIE (pool-Fehler -> null)", async () => {
  const p = { query: async () => { throw new Error("DB down"); } };
  const r = await ingestRecord(p, { org_id: "o1", title: "T" });
  assert.equal(r, null);
});

test("ingestContent: schreibt Datei in system-Ordner + setzt file_ref/groesse", async () => {
  const p = mockPool();
  let fileRef = null;
  try {
    const r = await ingestContent(p, {
      content: "<html>doc</html>", filename: "test rechnung.html", mime_type: "text/html",
      org_id: "o1", document_type: "invoice", content_category: "financial", title: "T"
    });
    assert.equal(r.id, "doc-1");
    const params = p.calls[0].params;
    fileRef = params[5]; // file_ref Position in uploadDocument
    assert.match(String(fileRef), /^\/uploads\/document-center\/system\//);
    assert.match(String(fileRef), /test_rechnung\.html$/);
    const abs = path.join(process.cwd(), String(fileRef).replace(/^\//, ""));
    assert.ok(fs.existsSync(abs), "Datei physisch geschrieben");
    assert.equal(fs.readFileSync(abs, "utf8"), "<html>doc</html>");
    assert.equal(params[8], Buffer.byteLength("<html>doc</html>"), "file_size_bytes korrekt");
  } finally { cleanup(fileRef); }
});

test("ingestAgreementDocs: beide Dokumente fuer BEIDE Partei-Orgs (2x2 Eintraege)", async () => {
  const p = mockPool((sql, _params, n) =>
    n === 1 ? { rows: [{ org_id: "org-a" }, { org_id: "org-b" }] } : { rows: [{ id: "doc-" + n }] }
  );
  const refs = [];
  try {
    const r = await ingestAgreementDocs(p, {
      offerId: "off-1", agreementRef: "EV-2026-000001",
      condHtml: "<html>kond</html>", agrHtml: "<html>vereinbarung</html>"
    });
    assert.equal(r, true);
    assert.match(p.calls[0].sql, /supplier_company_id/);
    assert.match(p.calls[0].sql, /requester_company_id/);
    const inserts = p.calls.slice(1);
    assert.equal(inserts.length, 4, "2 Dokumente x 2 Orgs = 4 Tresor-Eintraege");
    for (const c of inserts) {
      assert.match(c.sql, /INSERT INTO document_center/);
      assert.ok(["org-a", "org-b"].includes(c.params[0]));
      assert.ok(c.params.includes("contract"));
      refs.push(c.params[5]);
    }
    // Datei wird je Dokument nur EINMAL geschrieben (2 unique file_refs)
    assert.equal(new Set(refs).size, 2);
  } finally { [...new Set(refs)].forEach(cleanup); }
});

test("ingestAgreementDocs: keine Org-Treffer -> null, keine Eintraege", async () => {
  const p = mockPool(() => ({ rows: [] }));
  const r = await ingestAgreementDocs(p, { offerId: "off-1", agreementRef: "EV-X", condHtml: "<p>x</p>", agrHtml: "<p>y</p>" });
  assert.equal(r, null);
  assert.equal(p.calls.length, 1);
});
