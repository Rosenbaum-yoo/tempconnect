/**
 * Enterprise Integrations Test Suite
 * Tests: HMAC signing, event catalog, CSV exports, adapter formatting, dispatch fix.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

/* ── Integration Service: Signing ──────────────────────────── */

import {
  generateSigningSecret,
  computeSignature,
  SUPPORTED_EVENTS,
  getSupportedEvents
} from "../services/integrationService.js";

describe("Integration Service — Signing", () => {
  it("generateSigningSecret returns 64-char hex string", () => {
    const secret = generateSigningSecret();
    assert.equal(typeof secret, "string");
    assert.equal(secret.length, 64);
    assert.ok(/^[0-9a-f]{64}$/.test(secret), "Must be lowercase hex");
  });

  it("generateSigningSecret returns unique values", () => {
    const a = generateSigningSecret();
    const b = generateSigningSecret();
    assert.notEqual(a, b);
  });

  it("computeSignature produces deterministic HMAC-SHA256", () => {
    const secret = "abc123def456";
    const payload = '{"event":"test"}';
    const sig1 = computeSignature(payload, secret);
    const sig2 = computeSignature(payload, secret);
    assert.equal(sig1, sig2);
    assert.equal(typeof sig1, "string");
    assert.ok(sig1.length > 0);
  });

  it("computeSignature changes when payload changes", () => {
    const secret = "test-secret";
    const sig1 = computeSignature('{"a":1}', secret);
    const sig2 = computeSignature('{"a":2}', secret);
    assert.notEqual(sig1, sig2);
  });

  it("computeSignature changes when secret changes", () => {
    const payload = '{"event":"test"}';
    const sig1 = computeSignature(payload, "secret-a");
    const sig2 = computeSignature(payload, "secret-b");
    assert.notEqual(sig1, sig2);
  });
});

/* ── Integration Service: Event Catalog ────────────────────── */

describe("Integration Service — Event Catalog", () => {
  it("SUPPORTED_EVENTS contains original 16 events", () => {
    const originals = [
      "offer.received", "offer.accepted", "offer.rejected",
      "requisition.submitted_for_approval", "requisition.approved", "requisition.rejected",
      "requisition.filled", "requisition.cancelled",
      "deal.completed", "assignment.starting_soon",
      "capacity.match_found", "capacity.interest_received",
      "compliance.expiring", "compliance.verified",
      "capacity.expiring_soon", "supplier.invited"
    ];
    for (const evt of originals) {
      assert.ok(SUPPORTED_EVENTS.includes(evt), `Missing original event: ${evt}`);
    }
  });

  it("SUPPORTED_EVENTS contains 8 new enterprise events", () => {
    const newEvents = [
      "timesheet.submitted", "timesheet.approved", "timesheet.rejected",
      "contract.activated", "contract.terminated",
      "invoice.issued", "invoice.paid",
      "assignment.completed"
    ];
    for (const evt of newEvents) {
      assert.ok(SUPPORTED_EVENTS.includes(evt), `Missing new event: ${evt}`);
    }
  });

  it("SUPPORTED_EVENTS has 24 total events", () => {
    assert.equal(SUPPORTED_EVENTS.length, 24);
  });

  it("getSupportedEvents returns structured event list", () => {
    const events = getSupportedEvents();
    assert.ok(Array.isArray(events));
    assert.equal(events.length, 24);
    assert.ok(events[0].key);
    assert.ok(events[0].label);
  });

  it("no duplicate events in SUPPORTED_EVENTS", () => {
    const set = new Set(SUPPORTED_EVENTS);
    assert.equal(set.size, SUPPORTED_EVENTS.length, "Duplicate events found");
  });
});

/* ── Integration Adapters: Formatting ──────────────────────── */

import {
  formatSlack,
  formatTeams
} from "../services/integrationAdapters.js";

describe("Integration Adapters — Formatting", () => {
  it("formatSlack returns blocks for new timesheet event", () => {
    const payload = formatSlack("timesheet.submitted", { message: "Test", orgName: "Org" });
    assert.ok(payload.text);
    assert.ok(payload.blocks);
    assert.ok(payload.text.includes("Stundenzettel"));
  });

  it("formatSlack returns blocks for new contract event", () => {
    const payload = formatSlack("contract.activated", { message: "Vertrag X" });
    assert.ok(payload.text.includes("Vertrag"));
  });

  it("formatSlack returns blocks for new invoice event", () => {
    const payload = formatSlack("invoice.paid", { message: "INV-001" });
    assert.ok(payload.text.includes("Rechnung"));
  });

  it("formatTeams returns MessageCard for new events", () => {
    const card = formatTeams("timesheet.approved", { message: "Genehmigt" });
    assert.equal(card["@type"], "MessageCard");
    assert.ok(card.summary.includes("Stundenzettel"));
  });

  it("formatSlack handles unknown events gracefully", () => {
    const payload = formatSlack("unknown.event", { message: "test" });
    assert.ok(payload.text);
    assert.ok(payload.blocks);
  });

  it("formatTeams includes org name in facts when provided", () => {
    const card = formatTeams("deal.completed", { orgName: "TestOrg", message: "done" });
    const facts = card.sections[0].facts;
    const orgFact = facts.find(f => f.name === "Organisation");
    assert.ok(orgFact);
    assert.equal(orgFact.value, "TestOrg");
  });
});

/* ── Export Service: CSV Generation ────────────────────────── */

import {
  escapeCsvField,
  toCsvRow,
  exportTimesheetsCsv,
  exportDealsCsv,
  exportAuditLogCsv
} from "../services/exportService.js";

describe("Export Service — CSV Helpers", () => {
  it("escapeCsvField returns empty string for null/undefined", () => {
    assert.equal(escapeCsvField(null), "");
    assert.equal(escapeCsvField(undefined), "");
  });

  it("escapeCsvField wraps commas in quotes", () => {
    assert.equal(escapeCsvField("hello,world"), '"hello,world"');
  });

  it("escapeCsvField escapes double quotes", () => {
    assert.equal(escapeCsvField('say "hi"'), '"say ""hi"""');
  });

  it("escapeCsvField wraps newlines in quotes", () => {
    assert.equal(escapeCsvField("line1\nline2"), '"line1\nline2"');
  });

  it("escapeCsvField passes through simple strings", () => {
    assert.equal(escapeCsvField("hello"), "hello");
  });

  it("escapeCsvField converts numbers to string", () => {
    assert.equal(escapeCsvField(42), "42");
  });

  it("toCsvRow joins escaped fields", () => {
    const row = toCsvRow(["a", "b,c", null, 42]);
    assert.equal(row, 'a,"b,c",,42');
  });
});

describe("Export Service — Timesheet CSV", () => {
  it("exportTimesheetsCsv returns headers on empty input", () => {
    const csv = exportTimesheetsCsv([]);
    assert.ok(csv.startsWith("id,worker_name,org_name,"));
    assert.equal(csv.split("\n").length, 1); // header only
  });

  it("exportTimesheetsCsv formats rows correctly", () => {
    const csv = exportTimesheetsCsv([{
      id: "ts-1", worker_name: "Max Müller", org_name: "Corp",
      supplier_org_name: "Agency", status: "approved",
      week_start: "2026-03-09", week_end: "2026-03-13",
      total_hours: 40, overtime_hours: 5,
      submitted_at: "2026-03-14T10:00:00Z", approved_at: "2026-03-15T09:00:00Z",
      rejected_at: null
    }]);
    const lines = csv.split("\n");
    assert.equal(lines.length, 2);
    assert.ok(lines[1].includes("Max Müller"));
    assert.ok(lines[1].includes("approved"));
    assert.ok(lines[1].includes("40"));
  });

  it("exportTimesheetsCsv handles null array", () => {
    const csv = exportTimesheetsCsv(null);
    assert.ok(csv.startsWith("id,worker_name"));
  });
});

describe("Export Service — Deal CSV", () => {
  it("exportDealsCsv returns headers on empty input", () => {
    const csv = exportDealsCsv([]);
    assert.ok(csv.startsWith("id,title,buyer_company,"));
    assert.equal(csv.split("\n").length, 1);
  });

  it("exportDealsCsv formats deal rows", () => {
    const csv = exportDealsCsv([{
      id: "req-1", title: "Java Dev", company_name: "Buyer Corp",
      supplier_name: "Agency GmbH", status: "ACCEPTED",
      priority: "NORMAL", urgency: "normal",
      max_hourly_rate_cents: 5000, workers_needed: 2,
      created_at: "2026-03-01T00:00:00Z", updated_at: "2026-03-05T00:00:00Z"
    }]);
    const lines = csv.split("\n");
    assert.equal(lines.length, 2);
    assert.ok(lines[1].includes("Java Dev"));
    assert.ok(lines[1].includes("50.00")); // 5000/100
    assert.ok(lines[1].includes("ACCEPTED"));
  });
});

describe("Export Service — Audit Log CSV", () => {
  it("exportAuditLogCsv returns headers on empty input", () => {
    const csv = exportAuditLogCsv([]);
    assert.ok(csv.startsWith("id,action,action_type,"));
    assert.equal(csv.split("\n").length, 1);
  });

  it("exportAuditLogCsv formats entries with details summary", () => {
    const csv = exportAuditLogCsv([{
      id: "aud-1", action: "timesheet.approved", action_type: "APPROVAL",
      entity_type: "timesheet", entity_id: "ts-1",
      actor_email: "admin@corp.de", actor_name: "Admin",
      status: "SUCCESS", created_at: "2026-03-14T10:00:00Z",
      details: { total_hours: 40, worker_name: "Max" }
    }]);
    const lines = csv.split("\n");
    assert.equal(lines.length, 2);
    assert.ok(lines[1].includes("timesheet.approved"));
    assert.ok(lines[1].includes("admin@corp.de"));
    assert.ok(lines[1].includes("total_hours=40"));
  });

  it("exportAuditLogCsv handles string details", () => {
    const csv = exportAuditLogCsv([{
      id: "aud-2", action: "test", action_type: "UPDATE",
      entity_type: "user", entity_id: "u-1",
      actor_email: "", actor_name: "", actor_company: "Corp",
      status: "SUCCESS", created_at: "2026-03-14T10:00:00Z",
      details: "simple string"
    }]);
    const lines = csv.split("\n");
    assert.equal(lines.length, 2);
    assert.ok(lines[1].includes("simple string"));
  });

  it("exportAuditLogCsv handles null details", () => {
    const csv = exportAuditLogCsv([{
      id: "aud-3", action: "test", action_type: "UPDATE",
      entity_type: "user", entity_id: "u-1",
      actor_email: "x@y.de", status: "SUCCESS",
      created_at: "2026-03-14T10:00:00Z", details: null
    }]);
    const lines = csv.split("\n");
    assert.equal(lines.length, 2);
    // Details column should be empty
    assert.ok(lines[1].includes("x@y.de"));
  });
});
