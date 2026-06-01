/**
 * Emergency Staffing Tests
 *
 * Covers:
 *  1. classifyUrgency — normalisierung verschiedener Eingaben
 *  2. isEmergency — emergency vs non-emergency
 *  3. getUrgencyConfig — Konfigurationsrueckgabe
 *  4. URGENCY_CONFIG — Vollstaendigkeit und Konsistenz
 *  5. recordSupplierResponse — idempotent response tracking
 *  6. escalateEmergency — level increment + max check
 *  7. getActiveEmergencies — Filterung + Enrichment
 *  8. getEmergencyDashboard — KPI-Berechnung
 *  9. getEmergencyHistory — Paginierung + Projektion
 *
 * Run: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyUrgency,
  isEmergency,
  getUrgencyConfig,
  URGENCY_CONFIG,
  getActiveEmergencies,
  getEmergencyDashboard,
  getEmergencyHistory,
  recordSupplierResponse,
  escalateEmergency
} from "../services/emergencyStaffingService.js";

// ── Mock pool helper ─────────────────────────────────────
function mockPool(queryMap = {}) {
  return {
    query(sql, params) {
      for (const [key, rows] of Object.entries(queryMap)) {
        if (sql.includes(key)) return Promise.resolve({ rows, rowCount: rows.length });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
  };
}

// ═════════════════════════════════════════════════════════════
// 1. classifyUrgency
// ═════════════════════════════════════════════════════════════

describe("classifyUrgency", () => {
  it("null/undefined => NORMAL", () => {
    assert.equal(classifyUrgency(null), "NORMAL");
    assert.equal(classifyUrgency(undefined), "NORMAL");
    assert.equal(classifyUrgency(""), "NORMAL");
  });

  it("notdienst => NOTDIENST (case-insensitive)", () => {
    assert.equal(classifyUrgency("notdienst"), "NOTDIENST");
    assert.equal(classifyUrgency("NOTDIENST"), "NOTDIENST");
    assert.equal(classifyUrgency("Notdienst"), "NOTDIENST");
  });

  it("critical => CRITICAL", () => {
    assert.equal(classifyUrgency("critical"), "CRITICAL");
    assert.equal(classifyUrgency("CRITICAL"), "CRITICAL");
  });

  it("urgent => URGENT", () => {
    assert.equal(classifyUrgency("urgent"), "URGENT");
    assert.equal(classifyUrgency("URGENT"), "URGENT");
  });

  it("high/plus => HIGH", () => {
    assert.equal(classifyUrgency("high"), "HIGH");
    assert.equal(classifyUrgency("HIGH"), "HIGH");
    assert.equal(classifyUrgency("plus"), "HIGH");
    assert.equal(classifyUrgency("PLUS"), "HIGH");
  });

  it("normal/unknown => NORMAL", () => {
    assert.equal(classifyUrgency("normal"), "NORMAL");
    assert.equal(classifyUrgency("NORMAL"), "NORMAL");
    assert.equal(classifyUrgency("something_else"), "NORMAL");
  });
});

// ═════════════════════════════════════════════════════════════
// 2. isEmergency
// ═════════════════════════════════════════════════════════════

describe("isEmergency", () => {
  it("notdienst is emergency", () => assert.equal(isEmergency("notdienst"), true));
  it("CRITICAL is emergency", () => assert.equal(isEmergency("CRITICAL"), true));
  it("urgent is emergency", () => assert.equal(isEmergency("urgent"), true));
  it("high is NOT emergency", () => assert.equal(isEmergency("high"), false));
  it("normal is NOT emergency", () => assert.equal(isEmergency("normal"), false));
  it("null is NOT emergency", () => assert.equal(isEmergency(null), false));
  it("plus is NOT emergency", () => assert.equal(isEmergency("plus"), false));
});

// ═════════════════════════════════════════════════════════════
// 3. getUrgencyConfig
// ═════════════════════════════════════════════════════════════

describe("getUrgencyConfig", () => {
  it("returns correct config for notdienst", () => {
    const cfg = getUrgencyConfig("notdienst");
    assert.equal(cfg.level, "NOTDIENST");
    assert.equal(cfg.slaMinutes, 30);
    assert.equal(cfg.responseWindow, 15);
    assert.equal(cfg.forceEmail, true);
    assert.equal(cfg.escalation, true);
    assert.equal(cfg.label, "Notdienst");
  });

  it("returns correct config for normal", () => {
    const cfg = getUrgencyConfig("normal");
    assert.equal(cfg.level, "NORMAL");
    assert.equal(cfg.slaMinutes, 120);
    assert.equal(cfg.responseWindow, null);
    assert.equal(cfg.forceEmail, false);
  });

  it("returns correct config for urgent", () => {
    const cfg = getUrgencyConfig("urgent");
    assert.equal(cfg.level, "URGENT");
    assert.equal(cfg.slaMinutes, 60);
    assert.equal(cfg.responseWindow, 30);
  });
});

// ═════════════════════════════════════════════════════════════
// 4. URGENCY_CONFIG completeness
// ═════════════════════════════════════════════════════════════

describe("URGENCY_CONFIG", () => {
  it("has all 5 levels", () => {
    const keys = Object.keys(URGENCY_CONFIG);
    assert.deepEqual(keys.sort(), ["CRITICAL", "HIGH", "NORMAL", "NOTDIENST", "URGENT"]);
  });

  it("each level has required fields", () => {
    for (const [key, cfg] of Object.entries(URGENCY_CONFIG)) {
      assert.ok(typeof cfg.slaMinutes === "number", `${key} missing slaMinutes`);
      assert.ok(typeof cfg.escalation === "boolean", `${key} missing escalation`);
      assert.ok(typeof cfg.forceEmail === "boolean", `${key} missing forceEmail`);
      assert.ok(typeof cfg.label === "string", `${key} missing label`);
    }
  });

  it("SLA decreases as urgency increases", () => {
    assert.ok(URGENCY_CONFIG.NORMAL.slaMinutes > URGENCY_CONFIG.HIGH.slaMinutes);
    assert.ok(URGENCY_CONFIG.HIGH.slaMinutes > URGENCY_CONFIG.URGENT.slaMinutes);
    assert.ok(URGENCY_CONFIG.URGENT.slaMinutes > URGENCY_CONFIG.CRITICAL.slaMinutes);
    assert.ok(URGENCY_CONFIG.CRITICAL.slaMinutes > URGENCY_CONFIG.NOTDIENST.slaMinutes);
  });
});

// ═════════════════════════════════════════════════════════════
// 5. recordSupplierResponse
// ═════════════════════════════════════════════════════════════

describe("recordSupplierResponse", () => {
  it("returns NOT_FOUND for nonexistent demand", async () => {
    const pool = mockPool({ demand_requests: [] });
    const result = await recordSupplierResponse(pool, "nonexistent", "s1");
    assert.equal(result.error, "NOT_FOUND");
  });

  it("returns NOT_EMERGENCY for non-emergency demand", async () => {
    const pool = mockPool({
      "demand_requests WHERE id": [{ id: "d1", urgency: "normal", status: "open" }]
    });
    const result = await recordSupplierResponse(pool, "d1", "s1");
    assert.equal(result.error, "NOT_EMERGENCY");
  });

  it("returns NOT_OPEN for closed demand", async () => {
    const pool = mockPool({
      "demand_requests WHERE id": [{ id: "d1", urgency: "notdienst", status: "closed" }]
    });
    const result = await recordSupplierResponse(pool, "d1", "s1");
    assert.equal(result.error, "NOT_OPEN");
  });

  it("records response for valid emergency", async () => {
    const pool = mockPool({
      "demand_requests WHERE id": [{ id: "d1", urgency: "notdienst", status: "open" }],
      "UPDATE demand_requests": [{ supplier_response_count: 1, first_supplier_response_at: new Date() }]
    });
    const result = await recordSupplierResponse(pool, "d1", "s1");
    assert.equal(result.recorded, true);
    assert.equal(result.response_count, 1);
  });
});

// ═════════════════════════════════════════════════════════════
// 6. escalateEmergency
// ═════════════════════════════════════════════════════════════

describe("escalateEmergency", () => {
  it("returns NOT_FOUND for nonexistent demand", async () => {
    const pool = mockPool({ "demand_requests WHERE id": [] });
    const result = await escalateEmergency(pool, "nonexistent", "u1");
    assert.equal(result.error, "NOT_FOUND");
  });

  it("returns NOT_OPEN for closed demand", async () => {
    const pool = mockPool({
      "demand_requests WHERE id": [{ id: "d1", urgency: "notdienst", status: "closed", escalation_level: 0 }]
    });
    const result = await escalateEmergency(pool, "d1", "u1");
    assert.equal(result.error, "NOT_OPEN");
  });

  it("returns NOT_EMERGENCY for normal demand", async () => {
    const pool = mockPool({
      "demand_requests WHERE id": [{ id: "d1", urgency: "normal", status: "open", escalation_level: 0 }]
    });
    const result = await escalateEmergency(pool, "d1", "u1");
    assert.equal(result.error, "NOT_EMERGENCY");
  });

  it("returns MAX_ESCALATION_REACHED at level 3", async () => {
    const pool = mockPool({
      "demand_requests WHERE id": [{ id: "d1", urgency: "notdienst", status: "open", escalation_level: 3 }]
    });
    const result = await escalateEmergency(pool, "d1", "u1");
    assert.equal(result.error, "MAX_ESCALATION_REACHED");
  });

  it("escalates from level 0 to 1", async () => {
    const pool = mockPool({
      "demand_requests WHERE id": [{ id: "d1", urgency: "notdienst", status: "open", escalation_level: 0, title: "Test", role: "Lager", location_city: "Berlin" }],
      "UPDATE demand_requests": [],
      "capacity_posts": []
    });
    const result = await escalateEmergency(pool, "d1", "u1");
    assert.equal(result.escalated, true);
    assert.equal(result.new_level, 1);
  });
});

// ═════════════════════════════════════════════════════════════
// 7. getActiveEmergencies
// ═════════════════════════════════════════════════════════════

describe("getActiveEmergencies", () => {
  it("returns enriched emergency items", async () => {
    const pool = mockPool({
      demand_requests: [{
        id: "d1", urgency: "notdienst", status: "open", title: "Test",
        requester_company_name: "Corp", age_minutes: 15, sla_overdue: false,
        sla_due_at: new Date(Date.now() + 60000).toISOString()
      }]
    });
    const items = await getActiveEmergencies(pool, null);
    assert.ok(Array.isArray(items));
    assert.equal(items.length, 1);
    assert.equal(items[0].urgency_level, "NOTDIENST");
    assert.equal(items[0].urgency_label, "Notdienst");
  });

  it("returns empty for no emergencies", async () => {
    const pool = mockPool({ demand_requests: [] });
    const items = await getActiveEmergencies(pool, "org1");
    assert.equal(items.length, 0);
  });
});

// ═════════════════════════════════════════════════════════════
// 8. getEmergencyDashboard
// ═════════════════════════════════════════════════════════════

describe("getEmergencyDashboard", () => {
  it("returns active + metrics structure", async () => {
    const pool = mockPool({
      "WHERE status = 'open'": [{
        total_active: 3, escalated: 1, sla_breached: 0, notdienst_count: 2, urgent_count: 1
      }],
      "30 days": [{
        total_emergencies_30d: 10, responded_count: 8, avg_response_minutes: 12,
        sla_met_count: 7, sla_breached_count: 2, filled_count: 6
      }]
    });
    const dash = await getEmergencyDashboard(pool, null);
    assert.ok(dash.active);
    assert.ok(dash.metrics_30d);
    assert.equal(dash.active.total, 3);
    assert.equal(dash.active.notdienst, 2);
    assert.equal(dash.metrics_30d.total, 10);
    assert.equal(dash.metrics_30d.response_rate, 80);
    assert.equal(dash.metrics_30d.fill_rate, 60);
  });

  it("handles zero emergencies gracefully", async () => {
    const pool = mockPool({});
    const dash = await getEmergencyDashboard(pool, "org1");
    assert.equal(dash.active.total, 0);
    assert.equal(dash.metrics_30d.total, 0);
    assert.equal(dash.metrics_30d.response_rate, 0);
    assert.equal(dash.metrics_30d.avg_response_minutes, null);
  });
});

// ═════════════════════════════════════════════════════════════
// 9. getEmergencyHistory
// ═════════════════════════════════════════════════════════════

describe("getEmergencyHistory", () => {
  it("returns projected history items", async () => {
    const pool = mockPool({
      demand_requests: [{
        id: "d1", title: "Notfall", role: "Pflege", location_city: "Berlin",
        urgency: "notdienst", status: "closed", sla_status: "MET",
        escalation_level: 1, supplier_response_count: 3,
        first_supplier_response_at: new Date(), response_minutes: 8,
        created_at: new Date(), requester_company_name: "Corp GmbH"
      }]
    });
    const items = await getEmergencyHistory(pool, null, { limit: 10 });
    assert.ok(Array.isArray(items));
    assert.equal(items.length, 1);
    assert.equal(items[0].urgency_level, "NOTDIENST");
    assert.equal(items[0].supplier_response_count, 3);
    assert.ok(items[0].response_minutes != null);
  });

  it("returns empty for no history", async () => {
    const pool = mockPool({ demand_requests: [] });
    const items = await getEmergencyHistory(pool, "org1");
    assert.equal(items.length, 0);
  });
});
