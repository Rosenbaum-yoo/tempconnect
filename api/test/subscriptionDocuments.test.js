/**
 * subscriptionDocumentService + subscriptionDocuments Routen Tests
 * (Welle 8 Schritt 9).
 *
 * Verifiziert:
 *   - generateDocument legt Doc mit document_number + content_hash an
 *   - generateDocument liest subscription_request-Snapshot vor (frozen)
 *   - generateDocument verhindert leeres Dokument (EMPTY_DOCUMENT)
 *   - generateDocument lehnt unbekannten document_type ab
 *   - markDownloaded inkrementiert download_count
 *   - listForOrg filtert auf org_id
 *   - Customer-Route GET /:id 403 bei fremder Org
 *   - Customer-Route POST /cost-preview erzeugt Public-Doc ohne org_id
 *   - Customer-Route GET /:id/download liefert HTML-Body
 *
 * Run: node --test --test-force-exit api/test/subscriptionDocuments.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import * as docs from "../services/subscriptionDocumentService.js";
import { createSubscriptionDocumentsRouter } from "../routes/subscriptionDocuments.js";

// ── Helper ─────────────────────────────────────────────────────

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
      const r = responses[idx++];
      if (r instanceof Error) throw r;
      return r;
    }
  };
}

const requireAuth = (_req, _res, next) => next();

function findHandler(router, method, fragment) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (Object.keys(layer.route.methods)[0] === method && layer.route.path.includes(fragment)) {
      return layer.route.stack[layer.route.stack.length - 1].handle;
    }
  }
  throw new Error(`Route ${method} ${fragment} not found`);
}

function mockReq(extras = {}) {
  return {
    session: { userId: "u-1" },
    orgId: "org-1",
    body: {},
    query: {},
    params: {},
    ...extras
  };
}

function mockRes() {
  const headers = {};
  const res = {
    _status: 200, _json: null, _body: null, _ended: false,
    locals: {},
    headers,
    status(c) { this._status = c; return this; },
    json(d) { this._json = d; return this; },
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    send(d) { this._body = d; this._ended = true; return this; }
  };
  return res;
}

// ── generateDocument ──────────────────────────────────────────

describe("subscriptionDocumentService.generateDocument", () => {
  it("public cost_preview ohne subscriptionRequestId schreibt orgless Doc", async () => {
    const pool = sequencePool(
      { rows: [{ n: 42 }] },                       // nextval
      { rows: [{ id: "doc-1", document_type: "cost_preview", document_number: "KV-2026-000042" }] }, // INSERT
    );
    const r = await docs.generateDocument(pool, {
      documentType: "cost_preview",
      dataOverride: {
        desired_plan: "PLUS",
        contact_email: "vis@firma.de",
        total_cents: 49900
      }
    });
    assert.equal(r.ok, true);
    assert.equal(r.row.id, "doc-1");
    assert.match(r.row.document_number, /^KV-\d{4}-\d{6}$/);
  });

  it("EMPTY_DOCUMENT wenn weder Plan noch Addons", async () => {
    const pool = sequencePool();
    const r = await docs.generateDocument(pool, {
      documentType: "cost_preview",
      dataOverride: { contact_email: "x@y.de" }
    });
    assert.equal(r.ok, false);
    assert.equal(r.error, "EMPTY_DOCUMENT");
  });

  it("INVALID_DOCUMENT_TYPE bei unbekanntem Typ", async () => {
    const pool = sequencePool();
    const r = await docs.generateDocument(pool, { documentType: "rechnung" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "INVALID_DOCUMENT_TYPE");
  });

  it("plan_overview wird nicht mehr als neuer Dokumenttyp erzeugt", async () => {
    const pool = sequencePool();
    const r = await docs.generateDocument(pool, { documentType: "plan_overview" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "INVALID_DOCUMENT_TYPE");
  });

  it("DOCUMENT_TYPE_REQUIRED ohne type", async () => {
    const pool = sequencePool();
    const r = await docs.generateDocument(pool, {});
    assert.equal(r.ok, false);
    assert.equal(r.error, "DOCUMENT_TYPE_REQUIRED");
  });

  it("liest subscription_request-Snapshot + setzt org_id automatisch + supersedet aelteres Doc", async () => {
    const reqRow = {
      id: "req-1", request_type: "upgrade", status: "accepted",
      org_id: "org-99", contact_email: "owner@acme.de", contact_name: "Max",
      desired_plan: "PRO", current_plan: "PLUS",
      desired_features: [], desired_addons: [],
      proposed_price_cents: 79900,
      org_name: "ACME"
    };
    const pool = sequencePool(
      { rows: [reqRow] },                                 // SELECT subscription_request
      { rows: [{ n: 7 }] },                               // nextval
      { rows: [{ id: "doc-7", document_type: "order_confirmation", document_number: "AB-2026-000007", title: "AB" }] }, // INSERT
      { rows: [] }                                        // UPDATE supersede
    );
    const r = await docs.generateDocument(pool, {
      documentType: "order_confirmation",
      subscriptionRequestId: "req-1",
      actorUserId: "staff-1"
    });
    assert.equal(r.ok, true);
    assert.equal(r.row.id, "doc-7");
    // INSERT-Param org_id ist Position 3 (1-basiert) -> index 2
    const insertCall = pool.calls[2];
    assert.equal(insertCall.params[2], "org-99", "org_id wird aus request abgeleitet");
    // Supersede-UPDATE wurde ausgefuehrt
    const supersede = pool.calls[3];
    assert.match(supersede.sql, /SET status = 'superseded'/);
  });

  it("Cancellation-Doc nutzt cancellation_effective_at als effective_from-Hint", async () => {
    const cancelAt = "2026-12-31T00:00:00.000Z";
    const reqRow = {
      id: "req-c", request_type: "cancellation", status: "accepted",
      org_id: "org-99", contact_email: "owner@acme.de",
      desired_plan: null, current_plan: "PLUS",
      cancellation_effective_at: cancelAt,
      org_name: "ACME"
    };
    const pool = sequencePool(
      { rows: [reqRow] },
      { rows: [{ n: 9 }] },
      { rows: [{ id: "doc-9", document_type: "cancellation_confirmation", document_number: "KB-2026-000009" }] },
      { rows: [] }
    );
    const r = await docs.generateDocument(pool, {
      documentType: "cancellation_confirmation",
      subscriptionRequestId: "req-c"
    });
    assert.equal(r.ok, true);
    assert.match(r.row.document_number, /^KB-/);
  });

  it("ensureDocumentForRequest liefert vorhandenes issued-Dokument ohne Duplikat", async () => {
    const pool = sequencePool(
      { rows: [{ id: "doc-existing", document_type: "offer", document_number: "ANG-2026-000001", status: "issued" }] }
    );
    const r = await docs.ensureDocumentForRequest(pool, {
      documentType: "offer",
      subscriptionRequestId: "req-1",
      actorUserId: "staff-1"
    });
    assert.equal(r.ok, true);
    assert.equal(r.already_exists, true);
    assert.equal(r.created, false);
    assert.ok(!pool.calls.some((c) => /INSERT INTO subscription_documents/i.test(c.sql)));
  });

  it("liest Preis, Catalog-Version und Add-ons aus quote_snapshot statt aktuellem Request-Plan", async () => {
    const reqRow = {
      id: "req-snap", request_type: "upgrade", status: "accepted",
      org_id: "org-99", contact_email: "owner@acme.de",
      desired_plan: "PRO", current_plan: "BASIS",
      proposed_price_cents: 999999,
      quote_catalog_version: "snap-v1",
      quote_snapshot: {
        catalog_version: "snap-v1",
        plan: "PLUS",
        plan_display_label: "PLUS Snapshot",
        proposed_price_cents: 12345,
        proposed_term_months: 24,
        addons: [{ key: "snapshot_addon", name: "Snapshot Add-on", price_cents: 1111, interval: "monthly" }],
        feature_keys: ["snapshot_feature"],
        limits: { requests_send: 1, requests_receive: 2, listings: 3, max_workers_per_request: 4, notdienst: true, sla_level: "snapshot" }
      },
      org_name: "ACME"
    };
    const pool = sequencePool(
      { rows: [reqRow] },
      { rows: [{ n: 13 }] },
      { rows: [{ id: "doc-snap", document_type: "offer", document_number: "ANG-2026-000013" }] },
      { rows: [] }
    );
    const r = await docs.generateDocument(pool, {
      documentType: "offer",
      subscriptionRequestId: "req-snap"
    });
    assert.equal(r.ok, true);
    const insertCall = pool.calls.find((c) => /INSERT INTO subscription_documents/i.test(c.sql));
    const html = insertCall.params[5];
    const snapshot = JSON.parse(insertCall.params[7]);
    assert.equal(insertCall.params[10], 12345);
    assert.equal(snapshot.desired_plan, "PLUS");
    assert.equal(snapshot.quote_catalog_version, "snap-v1");
    assert.match(html, /PLUS Snapshot/);
    assert.match(html, /snap-v1/);
    assert.match(html, /Snapshot Add-on/);
  });

  it("speichert PDF-Content, wenn PDF-Renderer aktiv ist", async () => {
    const pdfBuffer = Buffer.from("%PDF-tempconnect-test");
    const pool = sequencePool(
      { rows: [{ n: 43 }] },
      { rows: [{ id: "doc-pdf", document_type: "cost_preview", document_number: "KV-2026-000043", format: "pdf" }] }
    );
    const r = await docs.generateDocument(pool, {
      documentType: "cost_preview",
      format: "pdf",
      dataOverride: { desired_plan: "PRO", total_cents: 79900 },
      pdfRenderer: async () => ({ ok: true, engine: "wkhtmltopdf", buffer: pdfBuffer })
    });
    assert.equal(r.ok, true);
    const insertCall = pool.calls.find((c) => /INSERT INTO subscription_documents/i.test(c.sql));
    assert.match(insertCall.sql, /'pdf'/);
    assert.equal(insertCall.params[5], pdfBuffer.toString("base64"));
    assert.equal(insertCall.params[6], docs.computeContentHash(pdfBuffer));
    const snapshot = JSON.parse(insertCall.params[7]);
    assert.equal(snapshot.document_output.requested_format, "pdf");
    assert.equal(snapshot.document_output.stored_format, "pdf");
    assert.equal(snapshot.document_output.pdf_fallback, false);
  });

  it("faellt bei fehlender PDF-Engine sicher auf HTML zurueck", async () => {
    const pool = sequencePool(
      { rows: [{ n: 44 }] },
      { rows: [{ id: "doc-fallback", document_type: "cost_preview", document_number: "KV-2026-000044", format: "html" }] }
    );
    const r = await docs.generateDocument(pool, {
      documentType: "cost_preview",
      format: "pdf",
      dataOverride: { desired_plan: "PLUS", total_cents: 49900 },
      pdfRenderer: async () => ({ ok: false, skipped: true, engine: "wkhtmltopdf", reason: "PDF_ENGINE_NOT_CONFIGURED" })
    });
    assert.equal(r.ok, true);
    const insertCall = pool.calls.find((c) => /INSERT INTO subscription_documents/i.test(c.sql));
    assert.match(insertCall.sql, /'html'/);
    assert.match(insertCall.params[5], /<!DOCTYPE html>/);
    const snapshot = JSON.parse(insertCall.params[7]);
    assert.equal(snapshot.document_output.requested_format, "pdf");
    assert.equal(snapshot.document_output.stored_format, "html");
    assert.equal(snapshot.document_output.pdf_fallback, true);
    assert.equal(snapshot.document_output.pdf_fallback_reason, "PDF_ENGINE_NOT_CONFIGURED");
  });

  it("nutzt Storage-Adapter-Abstraktion und behaelt stabilen Content Hash", async () => {
    let captured = null;
    const storageAdapter = {
      async storeDocument(record) {
        captured = record;
        return { id: "doc-storage", document_type: record.documentType, document_number: record.documentNumber, format: record.format };
      }
    };
    const pool = sequencePool({ rows: [{ n: 45 }] });
    const r = await docs.generateDocument(pool, {
      documentType: "cost_preview",
      dataOverride: { desired_plan: "BASIS", total_cents: 15000 },
      storageAdapter
    });
    assert.equal(r.ok, true);
    assert.equal(captured.format, "html");
    assert.equal(captured.contentHash, docs.computeContentHash(captured.content));
    assert.equal(docs.computeContentHash(captured.content), docs.computeContentHash(captured.content));
    assert.equal(captured.dataSnapshot.document_output.stored_format, "html");
  });
});

// ── markDownloaded / listForOrg ───────────────────────────────

describe("markDownloaded + listForOrg", () => {
  it("markDownloaded inkrementiert + setzt last_downloaded_at", async () => {
    const pool = sequencePool({ rows: [{ id: "d1", download_count: 1, last_downloaded_at: new Date() }] });
    const r = await docs.markDownloaded(pool, { id: "d1", actorUserId: "u-1" });
    assert.equal(r.id, "d1");
    assert.equal(r.download_count, 1);
  });

  it("listForOrg filtert auf org_id + optional document_type", async () => {
    const pool = sequencePool({ rows: [{ id: "d1", document_type: "offer" }] });
    const r = await docs.listForOrg(pool, "org-1", { documentType: "offer" });
    assert.equal(r.length, 1);
    // Letzter Param-Block hat documentType + limit + offset
    assert.ok(pool.calls[0].params.includes("offer"));
    assert.ok(pool.calls[0].sql.includes("document_type = $2"));
  });
});

// ── Customer-facing Routes ────────────────────────────────────

function deps(pool) {
  return { pool, requireAuth, logger: { warn() {}, info() {}, error() {} } };
}

describe("GET /subscription-documents/:id", () => {
  it("403 FORBIDDEN_CROSS_ORG bei fremder Org", async () => {
    const pool = sequencePool({ rows: [{ id: "d1", org_id: "other-org", document_type: "offer", content: "" }] });
    const router = createSubscriptionDocumentsRouter(deps(pool));
    const handler = findHandler(router, "get", "/subscription-documents/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "d1" } }), res, () => {});
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "FORBIDDEN_CROSS_ORG");
  });

  it("404 wenn Doc nicht existiert", async () => {
    const pool = sequencePool({ rows: [] });
    const router = createSubscriptionDocumentsRouter(deps(pool));
    const handler = findHandler(router, "get", "/subscription-documents/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "missing" } }), res, () => {});
    assert.equal(res._status, 404);
  });
});

describe("GET /subscription-documents/:id/download", () => {
  it("liefert HTML-Body + markiert download", async () => {
    const pool = sequencePool(
      { rows: [{ id: "d1", org_id: "org-1", document_type: "offer", document_number: "ANG-2026-000001", content: "<html/>" }] },
      { rows: [{ id: "d1", download_count: 1 }] }
    );
    const router = createSubscriptionDocumentsRouter(deps(pool));
    const handler = findHandler(router, "get", "/subscription-documents/:id/download");
    const res = mockRes();
    await handler(mockReq({ params: { id: "d1" } }), res, () => {});
    assert.equal(res._status, 200);
    assert.equal(res._body, "<html/>");
    assert.match(res.headers["content-disposition"], /ANG-2026-000001\.html/);
  });

  it("liefert PDF-Body fuer gespeicherte PDF-Dokumente", async () => {
    const pdfBuffer = Buffer.from("%PDF-download");
    const pool = sequencePool(
      { rows: [{ id: "d-pdf", org_id: "org-1", document_type: "offer", document_number: "ANG-2026-000002", format: "pdf", content: pdfBuffer.toString("base64") }] },
      { rows: [{ id: "d-pdf", download_count: 1 }] }
    );
    const router = createSubscriptionDocumentsRouter(deps(pool));
    const handler = findHandler(router, "get", "/subscription-documents/:id/download");
    const res = mockRes();
    await handler(mockReq({ params: { id: "d-pdf" } }), res, () => {});
    assert.equal(res._status, 200);
    assert.ok(Buffer.isBuffer(res._body));
    assert.equal(res._body.toString(), pdfBuffer.toString());
    assert.equal(res.headers["content-type"], "application/pdf");
    assert.match(res.headers["content-disposition"], /ANG-2026-000002\.pdf/);
  });

  it("403 bei fremder Org", async () => {
    const pool = sequencePool({ rows: [{ id: "d1", org_id: "other", content: "x" }] });
    const router = createSubscriptionDocumentsRouter(deps(pool));
    const handler = findHandler(router, "get", "/subscription-documents/:id/download");
    const res = mockRes();
    await handler(mockReq({ params: { id: "d1" } }), res, () => {});
    assert.equal(res._status, 403);
  });
});

describe("POST /subscription-documents/cost-preview (public)", () => {
  it("201 + download_url, schreibt Doc ohne org_id", async () => {
    const pool = sequencePool(
      { rows: [{ n: 1 }] },
      { rows: [{ id: "d-pub", document_type: "cost_preview", document_number: "KV-2026-000001" }] }
    );
    const router = createSubscriptionDocumentsRouter(deps(pool));
    const handler = findHandler(router, "post", "/subscription-documents/cost-preview");
    const res = mockRes();
    await handler({ body: { desired_plan: "PRO", total_cents: 79900 }, session: null }, res, () => {});
    assert.equal(res._status, 201);
    assert.equal(res._json.data.document_number, "KV-2026-000001");
    assert.match(res._json.data.download_url, /\/api\/subscription-documents\/d-pub\/public-download/);
  });

  it("400 VALIDATION ohne desired_plan", async () => {
    const pool = sequencePool();
    const router = createSubscriptionDocumentsRouter(deps(pool));
    const handler = findHandler(router, "post", "/subscription-documents/cost-preview");
    const res = mockRes();
    await handler({ body: {}, session: null }, res, () => {});
    assert.equal(res._status, 400);
    assert.equal(res._json.error.code, "VALIDATION");
  });
});

describe("GET /subscription-documents/:id/public-download", () => {
  it("liefert public cost_preview ohne org_id", async () => {
    const pool = sequencePool(
      { rows: [{ id: "d-pub", org_id: null, document_type: "cost_preview", document_number: "KV-2026-000001", data_snapshot: { public_preview: true, public_download_allowed: true }, content: "<pub/>" }] },
      { rows: [{ id: "d-pub", download_count: 1 }] }
    );
    const router = createSubscriptionDocumentsRouter(deps(pool));
    const handler = findHandler(router, "get", "/subscription-documents/:id/public-download");
    const res = mockRes();
    await handler({ params: { id: "d-pub" } }, res, () => {});
    assert.equal(res._status, 200);
    assert.equal(res._body, "<pub/>");
  });

  it("403 NOT_PUBLIC wenn cost_preview nicht explizit public markiert ist", async () => {
    const pool = sequencePool({ rows: [{ id: "d-private-preview", org_id: null, document_type: "cost_preview", data_snapshot: {}, content: "x" }] });
    const router = createSubscriptionDocumentsRouter(deps(pool));
    const handler = findHandler(router, "get", "/subscription-documents/:id/public-download");
    const res = mockRes();
    await handler({ params: { id: "d-private-preview" } }, res, () => {});
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "NOT_PUBLIC");
  });

  it("403 NOT_PUBLIC wenn org_id gesetzt", async () => {
    const pool = sequencePool({ rows: [{ id: "d1", org_id: "org-1", document_type: "offer", content: "x" }] });
    const router = createSubscriptionDocumentsRouter(deps(pool));
    const handler = findHandler(router, "get", "/subscription-documents/:id/public-download");
    const res = mockRes();
    await handler({ params: { id: "d1" } }, res, () => {});
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "NOT_PUBLIC");
  });

  it("403 NOT_PUBLIC wenn orgloses Dokument kein cost_preview ist", async () => {
    const pool = sequencePool({ rows: [{ id: "d-offer", org_id: null, document_type: "offer", content: "x" }] });
    const router = createSubscriptionDocumentsRouter(deps(pool));
    const handler = findHandler(router, "get", "/subscription-documents/:id/public-download");
    const res = mockRes();
    await handler({ params: { id: "d-offer" } }, res, () => {});
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "NOT_PUBLIC");
  });
});

// ── HTML-Render-Inhalt ────────────────────────────────────────

describe("renderHtml content", () => {
  it("enthaelt Plattform-Disclaimer und keine Arbeitnehmerueberlassungs-Zusage", () => {
    const html = docs.renderHtml("offer", {
      documentNumber: "ANG-2026-000001",
      title: "Angebot",
      snapshot: { desired_plan: "PRO", desired_features: [] },
      contactEmail: "x@y.de",
      contactName: "Max",
      totalCents: 79900,
      effectiveFrom: null,
      effectiveUntil: null
    });
    assert.match(html, /keine Zeitarbeitsfirma/);
    assert.match(html, /keine Arbeitnehmerueberlassung/);
    assert.match(html, /keine AUEG-Garantie/);
    assert.match(html, /TODO juristische Pruefung/);
    assert.match(html, /netto zzgl\. gesetzlicher MwSt/);
    assert.match(html, /ANG-2026-000001/);
    assert.match(html, /799,00 EUR/);
  });

  it("zeigt Cancellation-Datum in Tarif-Sektion", () => {
    const html = docs.renderHtml("cancellation_confirmation", {
      documentNumber: "KB-2026-000001",
      title: "Kuendigungsbestaetigung",
      snapshot: { current_plan: "PLUS", cancellation_effective_at: "2026-12-31T00:00:00.000Z" },
      contactEmail: "x@y.de",
      contactName: "Max"
    });
    assert.match(html, /Kuendigung wirksam zum/);
  });
});
