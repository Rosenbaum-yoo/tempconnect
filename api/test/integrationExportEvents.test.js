/**
 * integrationExportEvents.test.js — HR-Outbound-Events (Integrations-Epic A.3b).
 * Prüft, dass die Export-Events im Katalog stehen UND an den Export-Endpunkten real
 * dispatcht werden (kein totes Config-Flag — §0 End-to-End).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as integrationService from "../services/integrationService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, ".."); // api/
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("HR-Outbound-Events (A.3b)", () => {
  it("SUPPORTED_EVENTS enthält die Export-Events", () => {
    assert.ok(integrationService.SUPPORTED_EVENTS.includes("invoice.exported"), "invoice.exported im Katalog");
    assert.ok(integrationService.SUPPORTED_EVENTS.includes("timesheet.exported"), "timesheet.exported im Katalog");
  });

  it("getSupportedEvents() liefert die Export-Events (für /integrations/events)", () => {
    // getSupportedEvents() liefert {key,label}-Objekte (nicht Strings).
    const keys = integrationService.getSupportedEvents().map((e) => e.key);
    assert.ok(keys.includes("invoice.exported"));
    assert.ok(keys.includes("timesheet.exported"));
  });

  it("invoice.exported wird im Rechnungs-Export-Endpunkt dispatcht (verdrahtet, kein totes Flag)", () => {
    const src = read("routes/invoices.js");
    assert.match(src, /dispatchToIntegrations\(pool,\s*"invoice\.exported"/, "invoices.js dispatcht invoice.exported");
    assert.match(src, /integrationService/, "invoices.js importiert integrationService");
  });

  it("timesheet.exported wird im Stundenzettel-Export-Endpunkt dispatcht (verdrahtet)", () => {
    const src = read("routes/timesheets.js");
    assert.match(src, /dispatchToIntegrations\(pool,\s*"timesheet\.exported"/, "timesheets.js dispatcht timesheet.exported");
    assert.match(src, /integrationService/, "timesheets.js importiert integrationService");
  });

  it("Dispatch ist fire-and-forget (kein await → CSV-Download wird nicht blockiert)", () => {
    const inv = read("routes/invoices.js");
    // dispatch direkt nach res.send(csv), mit .catch — nicht awaited.
    assert.match(inv, /res\.send\(csv\);\s*\n[\s\S]{0,400}dispatchToIntegrations\(pool,\s*"invoice\.exported"[\s\S]{0,200}\.catch\(/);
  });
});
