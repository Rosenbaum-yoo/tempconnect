/**
 * datevExport.test.js — DATEV Fibu-Buchungsstapel (EXTF 700) Generator + Endpunkt (Welle C1).
 * Format-Korrektheit (EXTF-Header, Spalten, Buchungssätze, Beträge/Datum), Config-Override,
 * SKR03-Defaults, Route-Smoke.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildFibuBuchungsstapel, centsToDatev, toBelegdatum, DATEV_DEFAULTS,
  buildLohnBewegungsdaten, monthKey, hoursToDatev, DATEV_LOHN_DEFAULTS
} from "../services/datevExportService.js";
import { createInvoicesRouter } from "../routes/invoices.js";

const NOW = new Date("2026-03-15T10:00:00Z");
const inv = (over = {}) => ({
  invoice_number: "TC-2026-000001", total_cents: 17850, amount_cents: 15000,
  tax_amount_cents: 2850, tax_rate_pct: 19, issued_at: "2026-03-10T00:00:00Z",
  billing_name: "Acme GmbH", ...over
});

describe("datevExportService — Formatierungs-Helfer", () => {
  it("centsToDatev: Komma-Dezimal, 2 Stellen, Rundung", () => {
    assert.equal(centsToDatev(17850), "178,50");
    assert.equal(centsToDatev(0), "0,00");
    assert.equal(centsToDatev(1), "0,01");
    assert.equal(centsToDatev(999999), "9999,99");
  });
  it("toBelegdatum: TTMM", () => {
    assert.equal(toBelegdatum("2026-03-10T00:00:00Z"), "1003");
    assert.equal(toBelegdatum("2026-12-01T00:00:00Z"), "0112");
    assert.equal(toBelegdatum("invalid"), "");
  });
});

describe("buildFibuBuchungsstapel — EXTF-Struktur", () => {
  it("EXTF-Header korrekt (Kennzeichen/Version/Kategorie/Format)", () => {
    const csv = buildFibuBuchungsstapel([inv()], {}, { now: NOW });
    const lines = csv.split("\r\n");
    assert.match(lines[0], /^"EXTF";700;21;"Buchungsstapel";7;/);
    assert.ok(csv.endsWith("\r\n"), "CRLF-terminiert");
  });

  it("Spalten-Header enthält die Buchungsstapel-Kernspalten", () => {
    const csv = buildFibuBuchungsstapel([inv()], {}, { now: NOW });
    const cols = csv.split("\r\n")[1];
    for (const h of ["Umsatz (ohne Soll/Haben-Kz)", "Soll/Haben-Kennzeichen", "Konto", "Gegenkonto (ohne BU-Schlüssel)", "Belegdatum", "Belegfeld 1", "Buchungstext"]) {
      assert.ok(cols.includes(h), "Spalte fehlt: " + h);
    }
  });

  it("Buchungssatz: Brutto, Soll, Debitor→Erlös(8400 SKR03), Belegdatum, Rechnungsnr", () => {
    const csv = buildFibuBuchungsstapel([inv()], {}, { now: NOW });
    const row = csv.split("\r\n")[2].split(";");
    assert.equal(row[0], "178,50");          // Umsatz brutto
    assert.equal(row[1], '"S"');             // Soll
    assert.equal(row[2], '"EUR"');           // WKZ
    assert.equal(row[3], "10000");           // Debitor-Sammelkonto (SKR03 default)
    assert.equal(row[4], "8400");            // Erlös 19% (SKR03 default)
    assert.equal(row[6], "1003");            // Belegdatum TTMM
    assert.equal(row[7], '"TC-2026-000001"');// Belegfeld 1
    assert.ok(row[8].includes("TC-2026-000001") && row[8].includes("Acme GmbH")); // Buchungstext
  });

  it("USt-Satz steuert Erlöskonto: 7% → 8300, 0% → 8200", () => {
    const csv7 = buildFibuBuchungsstapel([inv({ tax_rate_pct: 7, tax_amount_cents: 1050 })], {}, { now: NOW });
    assert.equal(csv7.split("\r\n")[2].split(";")[4], "8300");
    const csv0 = buildFibuBuchungsstapel([inv({ tax_rate_pct: 0, tax_amount_cents: 0 })], {}, { now: NOW });
    assert.equal(csv0.split("\r\n")[2].split(";")[4], "8200");
  });

  it("Config-Override: Berater/Mandant + eigene Konten aus sync_config", () => {
    const cfg = { berater_nr: "12345", mandant_nr: "678", debitor_konto: "1400", erloes_konto: { "19": "4400" } };
    const csv = buildFibuBuchungsstapel([inv()], cfg, { now: NOW });
    assert.ok(csv.split("\r\n")[0].includes(";12345;678;"), "Berater/Mandant im Header");
    const row = csv.split("\r\n")[2].split(";");
    assert.equal(row[3], "1400");  // eigenes Debitorkonto
    assert.equal(row[4], "4400");  // eigenes Erlöskonto
  });

  it("leere Rechnungsliste → nur Header + Spalten, keine Buchungssätze", () => {
    const csv = buildFibuBuchungsstapel([], {}, { now: NOW });
    const lines = csv.split("\r\n").filter(Boolean);
    assert.equal(lines.length, 2);
  });

  it("ein Buchungssatz pro Rechnung", () => {
    const csv = buildFibuBuchungsstapel([inv(), inv({ invoice_number: "TC-2" }), inv({ invoice_number: "TC-3" })], {}, { now: NOW });
    assert.equal(csv.split("\r\n").filter(Boolean).length, 2 + 3);
  });

  it("SKR03-Defaults sind exportiert (Sanity)", () => {
    assert.equal(DATEV_DEFAULTS.skr, "03");
    assert.equal(DATEV_DEFAULTS.erloes_konto["19"], "8400");
  });
});

describe("GET /invoices/export/datev — Route-Smoke", () => {
  function trackingPool(handler) {
    const calls = [];
    const query = async (sql, params = []) => { calls.push({ sql: String(sql), params }); return (handler && handler(String(sql), params)) || { rows: [], rowCount: 0 }; };
    return { calls, query, connect: async () => ({ query, release() {} }) };
  }
  it("liefert ISO-8859-1 EXTF-Buffer mit DATEV-Config aus dem ERP-Mapping", async () => {
    const pool = trackingPool((sql) => {
      if (/FROM invoices/.test(sql)) return { rows: [inv()] };
      if (/FROM org_erp_mappings/.test(sql)) return { rows: [{ system_type: "datev", status: "active", sync_config: { berater_nr: "999", debitor_konto: "1400" } }] };
      return { rows: [] };
    });
    const router = createInvoicesRouter({ pool, requireAuth: (_q, _s, n) => n(), logger: { info() {}, warn() {}, error() {} }, requestLimiter: (_q, _s, n) => n() });
    const layer = router.stack.find((l) => l.route && l.route.path === "/invoices/export/datev");
    assert.ok(layer, "Route registriert");
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;
    let sent = null; const headers = {};
    const res = { setHeader: (k, v) => { headers[k] = v; }, send: (b) => { sent = b; }, status() { return this; }, json() { return this; } };
    await handler({ orgId: "org-1", session: { userId: "u1" }, query: {} }, res, (e) => { if (e) throw e; });
    assert.ok(Buffer.isBuffer(sent), "Buffer gesendet");
    const text = sent.toString("latin1");
    assert.match(text, /^"EXTF";700;21/);
    assert.ok(text.includes(";999;"), "Berater aus sync_config");
    assert.match(headers["Content-Type"], /ISO-8859-1/);
  });
});

/* ── C2: DATEV-Lohn-Bewegungsdaten ─────────────────────────────── */
const ts = (over = {}) => ({
  worker_identifier: "P-001", worker_name: "Max Mustermann",
  total_hours: 40, overtime_hours: 5, week_start: "2026-03-09", status: "approved", ...over
});

describe("datevExportService — Lohn-Helfer", () => {
  it("monthKey: yyyyMM", () => {
    assert.equal(monthKey("2026-03-09"), "202603");
    assert.equal(monthKey("invalid"), "");
  });
  it("hoursToDatev: Komma-Dezimal", () => {
    assert.equal(hoursToDatev(40), "40,00");
    assert.equal(hoursToDatev(7.5), "7,50");
    assert.equal(hoursToDatev(0), "0,00");
  });
});

describe("buildLohnBewegungsdaten — Bewegungsdaten", () => {
  it("Regulär + Überstunden je eigene Lohnart-Zeile", () => {
    const { csv, rows } = buildLohnBewegungsdaten([ts()]);
    const lines = csv.split("\r\n").filter(Boolean);
    assert.equal(rows, 2);                       // regulär + überstunden
    assert.equal(lines.length, 1 + 2);           // header + 2 zeilen
    const reg = lines[1].split(";"), ot = lines[2].split(";");
    assert.equal(reg[0], '"P-001"');             // Personalnummer
    assert.equal(reg[2], "202603");              // Abrechnungsmonat
    assert.equal(reg[3], '"1"');                 // Lohnart regulär (default)
    assert.equal(reg[4], "35,00");               // 40 - 5 Überstunden
    assert.equal(ot[3], '"2"');                  // Lohnart Überstunden
    assert.equal(ot[4], "5,00");
  });

  it("aggregiert mehrere Wochen je (Personalnummer × Monat)", () => {
    const { csv, rows } = buildLohnBewegungsdaten([
      ts({ week_start: "2026-03-02", total_hours: 40, overtime_hours: 0 }),
      ts({ week_start: "2026-03-09", total_hours: 38, overtime_hours: 0 })
    ]);
    assert.equal(rows, 1);                        // ein Monat, keine Überstunden → 1 Zeile
    assert.equal(csv.split("\r\n")[1].split(";")[4], "78,00"); // 40 + 38
  });

  it("ohne overtime → nur 1 Zeile (keine leere Überstunden-Lohnart)", () => {
    const { rows } = buildLohnBewegungsdaten([ts({ overtime_hours: 0 })]);
    assert.equal(rows, 1);
  });

  it("Stundenzettel ohne Personalnummer/Periode werden übersprungen + gemeldet", () => {
    const { rows, skipped } = buildLohnBewegungsdaten([
      ts(), ts({ worker_identifier: "" }), ts({ week_start: "invalid" })
    ]);
    assert.equal(skipped, 2);
    assert.equal(rows, 2); // nur der valide → regulär+overtime
  });

  it("Config-Override: eigene Lohnarten + Berater/Mandant aus sync_config.lohn", () => {
    const { csv } = buildLohnBewegungsdaten([ts()], { lohnart_regular: "100", lohnart_overtime: "110", berater_nr: "7", mandant_nr: "9" });
    const reg = csv.split("\r\n")[1].split(";");
    assert.equal(reg[3], '"100"');
    assert.equal(reg[5], "7");   // Berater
    assert.equal(reg[6], "9");   // Mandant
  });

  it("Defaults exportiert (Sanity)", () => {
    assert.equal(DATEV_LOHN_DEFAULTS.lohnart_regular, "1");
    assert.equal(DATEV_LOHN_DEFAULTS.lohnart_overtime, "2");
  });
});
