/**
 * Formel-Schutz in JEDEM CSV-Export (OP-28, OP-54 — Owner 2026-10-01: „so soll es
 * gemacht werden“).
 *
 * Ein Name wie „=HYPERLINK(…)“ oder eine Rechnungsposition „=2+3“ läuft in Excel
 * als Formel los, sobald jemand die Datei öffnet (OWASP: CSV Injection). Der
 * Schutz ist `csvText` aus `services/exportService.js`: ein Hochkomma vor
 * = + - @ Tab CR — an jedem Feld, das ein MENSCH füllt, und an keinem, das das
 * System erzeugt. Eine Gutschrift von -5,00 € muss eine Zahl bleiben.
 *
 * Dazu der Befund beim Umbau: vier Exporte schrieben DATE-/Zeitspalten roh —
 * node-postgres liefert sie als Date, und `String(date)` ergibt „Thu Jan 01 2026
 * 00:00:00 GMT+0100 (Central European Standard Time)“. Am laufenden Postgres
 * belegt (Rechnungsliste, Abrechnungszeitraum). Jetzt Kalendertag bzw. Berliner
 * Zeitpunkt.
 *
 * Und der Wächter: jeder CSV-Weg ist hier mit Zahl und Art verbucht. Wer einen
 * neuen baut, bekommt ein rotes Tor mit der Frage, ob er den Schutz trägt —
 * eine Notiz „bitte csvText benutzen“ hätte niemand gelesen.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { exportInvoicesCsv } from "../services/invoiceService.js";
import { exportOperationalInvoiceCsv } from "../services/operationalInvoiceService.js";
import { exportEinreichungsBuendelCsv, exportDsgvoAnfragenCsv } from "../services/exportService.js";

const WURZEL = resolve(import.meta.dirname, "..", "..");
const zellen = (zeile) => zeile.split(",");
/** Wie node-postgres eine DATE-Spalte liefert: lokale Mitternacht. */
const datum = (iso) => { const [j, m, t] = iso.split("-").map(Number); return new Date(j, m - 1, t); };

describe("Rechnungsliste: Name geschützt, Zeitraum als Datum, Beträge unberührt", () => {
  it("Formel im Rechnungsnamen bekommt das Hochkomma; Gutschrift bleibt Zahl", () => {
    const [, zeile] = exportInvoicesCsv([{
      invoice_number: "TC-2026-000001", billing_name: "=Kunde", plan: "PRO",
      billing_period_start: datum("2026-01-01"), billing_period_end: datum("2026-01-31"),
      amount_cents: -500, tax_amount_cents: -95, total_cents: -595, status: "issued"
    }]).split("\n");
    assert.deepEqual(zellen(zeile).slice(0, 9),
      ["TC-2026-000001", "'=Kunde", "PRO", "2026-01-01", "2026-01-31", "-5.00", "-0.95", "-5.95", "issued"]);
  });

  it("ein Zeitraum als Text (Bestandstests) bleibt derselbe Tag", () => {
    const [, zeile] = exportInvoicesCsv([{ invoice_number: "TC-2", billing_name: "Kunde", billing_period_start: "2026-03-01", billing_period_end: "2026-03-31", status: "paid" }]).split("\n");
    assert.deepEqual(zellen(zeile).slice(3, 5), ["2026-03-01", "2026-03-31"]);
  });
});

describe("Einzelrechnung: Position und Name geschützt, Wochen als Datum", () => {
  it("„- Abzug“ wird „'- Abzug“ — Owner-Entscheid; Menge und Beträge bleiben Zahlen", () => {
    const csv = exportOperationalInvoiceCsv({
      amount_cents: -1000, tax_amount_cents: -190, total_cents: -1190, tax_rate_pct: 19,
      items: [{
        item_type: "adjustment", description: "- Abzug", worker_name: "+Max",
        week_start: datum("2026-09-28"), week_end: datum("2026-10-04"),
        quantity: -2, unit_amount_cents: 500, total_cents: -1000
      }]
    });
    const [, zeile] = csv.split("\n");
    assert.deepEqual(zellen(zeile), ["1", "adjustment", "'- Abzug", "'+Max", "2026-09-28", "2026-10-04", "-2", "5.00", "-10.00"]);
    assert.match(csv, /,,Gesamtbetrag,,,,,,-11\.90$/m, "Summenzeilen unberührt");
  });

  it("eine gewöhnliche Position bleibt, wie sie ist", () => {
    const [, zeile] = exportOperationalInvoiceCsv({ items: [{ item_type: "hours", description: "Arbeitszeit KW 40", worker_name: "Erika Einsatz", quantity: 38 }] }).split("\n");
    assert.deepEqual(zellen(zeile).slice(2, 4), ["Arbeitszeit KW 40", "Erika Einsatz"]);
  });
});

describe("Agenturportal: Einreichungs-Bündel", () => {
  it("Kunde, Name, E-Mail und Bündel-Angaben geschützt; Stunden und Status unberührt; Wochen als Datum", () => {
    const csv = exportEinreichungsBuendelCsv([{
      id: "s-1", client_name: "@Kunde", first_name: "=Max", last_name: "Muster", worker_email: "+x@y.de",
      week_start: datum("2026-09-28"), week_end: datum("2026-10-04"),
      total_hours: 38, overtime_hours: -1, status: "confirmed", timesheet_id: "ts-1",
      customer_bundle_key: "-B1", customer_bundle_ref: "=REF"
    }]);
    const [kopf, zeile] = csv.split("\n");
    assert.equal(kopf, "submission_id,client_name,worker_name,worker_email,week_start,week_end,total_hours,overtime_hours,status,timesheet_id,bundle_key,bundle_ref");
    assert.deepEqual(zellen(zeile), ["s-1", "'@Kunde", "'=Max Muster", "'+x@y.de", "2026-09-28", "2026-10-04", "38", "-1", "confirmed", "ts-1", "'-B1", "'=REF"]);
  });

  it("ohne Positionen nur der Kopf", () => {
    assert.equal(exportEinreichungsBuendelCsv([]).split("\n").length, 1);
  });
});

describe("Staff CC: Datenschutz-Anfragen", () => {
  it("Firma und E-Mail geschützt; Zeitpunkte in Berliner Zeit statt Date-Text", () => {
    const csv = exportDsgvoAnfragenCsv([{
      id: "dg-1", org_name: "=Firma", request_type: "export", subject_type: "user", status: "completed",
      requester_email: "@a.de", created_at: new Date("2026-10-01T07:50:00Z"), completed_at: null
    }]);
    const [kopf, zeile] = csv.split("\n");
    assert.equal(kopf, "id,org,typ,subjekt,status,anforderer,erstellt,abgeschlossen");
    assert.deepEqual(zellen(zeile), ["dg-1", "'=Firma", "export", "user", "completed", "'@a.de", "2026-10-01 09:50:00", ""]);
  });
});

/* ── Der Wächter: jeder CSV-Weg ist verbucht ─────────────────────────────── */

/**
 * Datei → Anzahl der CSV-Antworten, je mit Art. „geschützt“ heißt: der Export
 * läuft über einen Baustein mit `csvText`. „ausgenommen“ braucht einen Grund.
 */
const CSV_WEGE = {
  "api/routes/admin.js": { anzahl: 1, art: "geschützt — exportAuditLogCsv" },
  "api/routes/agencyPortal.js": { anzahl: 1, art: "geschützt — exportEinreichungsBuendelCsv" },
  "api/routes/invoices.js": { anzahl: 3, art: "geschützt — exportInvoicesCsv, exportOperationalInvoiceCsv; ausgenommen — DATEV-Buchungsstapel (Maschinenformat)" },
  "api/routes/orgControlCenter.js": { anzahl: 2, art: "geschützt — exportAuditLogCsv, exportEinsatzportalSitzungenCsv" },
  "api/routes/reporting.js": { anzahl: 1, art: "ausgenommen — Abrechnungsauszug trägt nur Systemwerte (Kennzahl, Zahl, Einheit)" },
  "api/routes/requests.js": { anzahl: 1, art: "geschützt — exportDealsCsv" },
  "api/routes/staffControlCenter.js": { anzahl: 1, art: "geschützt — exportDsgvoAnfragenCsv" },
  "api/routes/timesheets.js": { anzahl: 2, art: "geschützt — exportTimesheetsCsv; ausgenommen — DATEV-Lohn (Maschinenformat)" },
};

function jsDateien(unter) {
  const basis = join(WURZEL, unter);
  return readdirSync(basis, { recursive: true })
    .filter((f) => f.endsWith(".js"))
    .map((f) => `${unter}/${f.split("\\").join("/")}`);
}

describe("Wächter: jeder CSV-Weg trägt den Formel-Schutz oder einen Grund", () => {
  const funde = {};
  for (const datei of [...jsDateien("api/routes"), ...jsDateien("api/services")]) {
    const n = (readFileSync(join(WURZEL, datei), "utf8").match(/text\/csv/g) || []).length;
    if (n) funde[datei] = n;
  }

  it("Gegenprobe: die Sammlung findet bekannte CSV-Wege", () => {
    assert.equal(funde["api/routes/timesheets.js"], 2);
    assert.equal(funde["api/routes/invoices.js"], 3);
  });

  it("kein CSV-Weg ist neu oder verschwunden, ohne dass er hier verbucht ist", () => {
    const erwartet = Object.fromEntries(Object.entries(CSV_WEGE).map(([d, v]) => [d, v.anzahl]));
    assert.deepEqual(funde, erwartet,
      "Ein CSV-Export ist dazugekommen oder weggefallen. Trägt der neue Weg `csvText` an jedem Feld, " +
      "das ein Mensch füllt (Namen, Firmen, Titel, E-Mail, Freitext)? Dann hier mit Art verbuchen.");
  });

  it("die schützenden Bausteine tragen csvText wirklich", () => {
    const quelle = (rel) => readFileSync(join(WURZEL, rel), "utf8");
    const funktion = (text, name) => {
      const ab = text.indexOf(`export function ${name}(`);
      assert.ok(ab >= 0, `${name} fehlt`);
      const rest = text.slice(ab + 1);
      const ende = rest.search(/\nexport (async )?function /);
      return ende < 0 ? rest : rest.slice(0, ende);
    };
    const exportService = quelle("api/services/exportService.js");
    for (const name of ["exportTimesheetsCsv", "exportDealsCsv", "exportAuditLogCsv", "exportEinsatzportalSitzungenCsv", "exportEinreichungsBuendelCsv", "exportDsgvoAnfragenCsv"]) {
      assert.match(funktion(exportService, name), /csvText\(/, `${name} ohne csvText`);
    }
    assert.match(funktion(quelle("api/services/invoiceService.js"), "exportInvoicesCsv"), /csvText\(/);
    assert.match(funktion(quelle("api/services/operationalInvoiceService.js"), "exportOperationalInvoiceCsv"), /csvText\(/);
  });

  it("Routen bauen keine CSV mehr selbst — ein eigener Escaper in einer Route umginge den Schutz", () => {
    const eigene = jsDateien("api/routes").filter((d) => /function csvEscape|const esc = \(v\)/.test(readFileSync(join(WURZEL, d), "utf8")));
    assert.deepEqual(eigene, []);
  });
});
