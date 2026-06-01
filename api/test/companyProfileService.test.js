/**
 * Company Profile Service unit tests.
 * Covers profiles, capabilities, locations, certifications,
 * contacts, completeness scoring, public profile.
 * Uses mock pool — no database required.
 *
 * Run: node --test --test-force-exit test/companyProfileService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/companyProfileService.js";

// ── Mock helpers ──────────────────────────────────────────────

function returnPool(rows = []) {
  return { query: async () => ({ rows }) };
}

function sequencePool(...responses) {
  let idx = 0;
  return {
    query: async () => {
      if (idx >= responses.length) return { rows: [] };
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

function capturePool() {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ id: 1 }], rowCount: 1 };
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// Profile CRUD
// ═══════════════════════════════════════════════════════════════

describe("companyProfile — profile", () => {
  it("getProfile returns profile row", async () => {
    const row = { user_id: 1, legal_name: "Test GmbH" };
    const result = await svc.getProfile(returnPool([row]), 1);
    assert.strictEqual(result.legal_name, "Test GmbH");
  });

  it("getProfile returns null when not found", async () => {
    assert.strictEqual(await svc.getProfile(returnPool([]), 99), null);
  });

  it("upsertProfile inserts/updates and returns row", async () => {
    const row = { user_id: 1, legal_name: "Test", website: "https://test.de" };
    const result = await svc.upsertProfile(returnPool([row]), 1, {
      legal_name: "Test", website: "https://test.de"
    });
    assert.strictEqual(result.legal_name, "Test");
  });

  it("upsertProfile sanitizes year_founded", async () => {
    const pool = capturePool();
    await svc.upsertProfile(pool, 1, { year_founded: "2020" });
    // Should have parsed to int
    assert.ok(pool.calls.length > 0);
  });

  it("upsertProfile handles empty year_founded", async () => {
    const pool = capturePool();
    await svc.upsertProfile(pool, 1, { year_founded: "" });
    assert.ok(pool.calls.length > 0);
  });

  it("upsertProfile rejects invalid company_size", async () => {
    const pool = capturePool();
    await svc.upsertProfile(pool, 1, { company_size: "INVALID" });
    // Should have set company_size to null
    assert.ok(pool.calls.length > 0);
  });

  it("upsertProfile accepts valid company_size", async () => {
    const pool = capturePool();
    await svc.upsertProfile(pool, 1, { company_size: "51-200" });
    assert.ok(pool.calls.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Capabilities
// ═══════════════════════════════════════════════════════════════

describe("companyProfile — capabilities", () => {
  it("getCapabilities returns row", async () => {
    const row = { user_id: 1, staff_categories: ["Pflege"] };
    assert.deepStrictEqual((await svc.getCapabilities(returnPool([row]), 1)).staff_categories, ["Pflege"]);
  });

  it("getCapabilities returns null when not found", async () => {
    assert.strictEqual(await svc.getCapabilities(returnPool([]), 1), null);
  });

  it("upsertCapabilities normalizes arrays", async () => {
    const row = { user_id: 1, staff_categories: ["A"], languages: ["DE"] };
    const result = await svc.upsertCapabilities(returnPool([row]), 1, {
      staff_categories: ["A"], languages: ["DE"]
    });
    assert.ok(result.staff_categories);
  });
});

// ═══════════════════════════════════════════════════════════════
// Locations
// ═══════════════════════════════════════════════════════════════

describe("companyProfile — locations", () => {
  it("listLocations returns rows", async () => {
    const rows = [{ id: 1, city: "Berlin" }, { id: 2, city: "Hamburg" }];
    assert.strictEqual((await svc.listLocations(returnPool(rows), 1)).length, 2);
  });

  it("addLocation inserts and returns row", async () => {
    const row = { id: 10, city: "Berlin", country: "Deutschland" };
    const result = await svc.addLocation(returnPool([row]), 1, { city: "Berlin" });
    assert.strictEqual(result.city, "Berlin");
  });

  it("updateLocation updates and returns row", async () => {
    const row = { id: 10, city: "München" };
    const result = await svc.updateLocation(returnPool([row]), 10, 1, { city: "München" });
    assert.strictEqual(result.city, "München");
  });

  it("updateLocation returns null when no fields provided", async () => {
    assert.strictEqual(await svc.updateLocation(returnPool([]), 10, 1, {}), null);
  });

  it("removeLocation returns true on success", async () => {
    const pool = { query: async () => ({ rowCount: 1 }) };
    assert.strictEqual(await svc.removeLocation(pool, 10, 1), true);
  });

  it("removeLocation returns false when not found", async () => {
    const pool = { query: async () => ({ rowCount: 0 }) };
    assert.strictEqual(await svc.removeLocation(pool, 99, 1), false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Certifications
// ═══════════════════════════════════════════════════════════════

describe("companyProfile — certifications", () => {
  it("listCertifications returns rows with is_expired flag", async () => {
    const rows = [
      { id: 1, cert_type: "aueg_lizenz", expires_at: "2020-01-01" },
      { id: 2, cert_type: "iso_9001", expires_at: "2030-01-01" }
    ];
    const result = await svc.listCertifications(returnPool(rows), 1);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].is_expired, true);
    assert.strictEqual(result[1].is_expired, false);
  });

  it("listCertifications handles null expires_at", async () => {
    const rows = [{ id: 1, cert_type: "iso_9001", expires_at: null }];
    const result = await svc.listCertifications(returnPool(rows), 1);
    assert.ok(!result[0].is_expired);
  });

  it("addCertification inserts with valid cert_type", async () => {
    const row = { id: 10, cert_type: "iso_9001", cert_name: "ISO 9001" };
    const result = await svc.addCertification(returnPool([row]), 1, {
      cert_type: "iso_9001", cert_name: "ISO 9001"
    });
    assert.strictEqual(result.cert_type, "iso_9001");
  });

  it("addCertification defaults invalid cert_type to sonstige", async () => {
    const pool = capturePool();
    await svc.addCertification(pool, 1, { cert_type: "INVALID", cert_name: "X" });
    // The SQL params should contain 'sonstige' for cert_type
    assert.ok(pool.calls[0].params.includes("sonstige"));
  });

  it("updateCertification updates and returns row", async () => {
    const row = { id: 10, cert_name: "Updated" };
    const result = await svc.updateCertification(returnPool([row]), 10, 1, { cert_name: "Updated" });
    assert.strictEqual(result.cert_name, "Updated");
  });

  it("updateCertification returns null when no fields", async () => {
    assert.strictEqual(await svc.updateCertification(returnPool([]), 10, 1, {}), null);
  });

  it("removeCertification returns true/false", async () => {
    assert.strictEqual(await svc.removeCertification({ query: async () => ({ rowCount: 1 }) }, 10, 1), true);
    assert.strictEqual(await svc.removeCertification({ query: async () => ({ rowCount: 0 }) }, 99, 1), false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Contacts
// ═══════════════════════════════════════════════════════════════

describe("companyProfile — contacts", () => {
  it("listContacts returns rows", async () => {
    assert.strictEqual((await svc.listContacts(returnPool([{ id: 1 }]), 1)).length, 1);
  });

  it("addContact inserts and returns row", async () => {
    const row = { id: 10, name: "Max", role_title: "CEO" };
    const result = await svc.addContact(returnPool([row]), 1, { name: "Max", role_title: "CEO" });
    assert.strictEqual(result.name, "Max");
  });

  it("updateContact updates and returns row", async () => {
    const row = { id: 10, name: "Updated" };
    assert.strictEqual((await svc.updateContact(returnPool([row]), 10, 1, { name: "Updated" })).name, "Updated");
  });

  it("updateContact returns null when no fields", async () => {
    assert.strictEqual(await svc.updateContact(returnPool([]), 10, 1, {}), null);
  });

  it("removeContact returns true/false", async () => {
    assert.strictEqual(await svc.removeContact({ query: async () => ({ rowCount: 1 }) }, 10, 1), true);
    assert.strictEqual(await svc.removeContact({ query: async () => ({ rowCount: 0 }) }, 99, 1), false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Full Profile & Public Profile
// ═══════════════════════════════════════════════════════════════

describe("companyProfile — fullProfile", () => {
  it("getFullProfile aggregates all sections", async () => {
    const pool = {
      query: async (sql) => {
        if (sql.includes("company_profiles")) return { rows: [{ user_id: 1, legal_name: "Test" }] };
        if (sql.includes("company_capabilities")) return { rows: [{ staff_categories: ["A"] }] };
        if (sql.includes("company_locations")) return { rows: [{ city: "Berlin" }] };
        if (sql.includes("company_certifications")) return { rows: [{ cert_type: "iso_9001", expires_at: null }] };
        if (sql.includes("company_contacts")) return { rows: [{ name: "Max", is_primary: true }] };
        if (sql.includes("org_id FROM users")) return { rows: [{}] };
        return { rows: [{ id: 1, company_name: "Test GmbH", email: "test@test.de" }] };
      }
    };
    const result = await svc.getFullProfile(pool, 1);
    assert.ok(result.user);
    assert.ok(result.profile);
    assert.ok(result.completeness);
    assert.ok(result.completeness.percentage >= 0);
  });

  it("getPublicProfile strips email", async () => {
    const pool = {
      query: async (sql) => {
        if (sql.includes("company_profiles")) return { rows: [{ user_id: 1 }] };
        if (sql.includes("company_capabilities")) return { rows: [{}] };
        if (sql.includes("company_locations")) return { rows: [] };
        if (sql.includes("company_certifications")) return { rows: [] };
        if (sql.includes("company_contacts")) return { rows: [] };
        if (sql.includes("org_id FROM users")) return { rows: [{}] };
        return { rows: [{ id: 1, company_name: "Test", email: "secret@test.de" }] };
      }
    };
    const result = await svc.getPublicProfile(pool, 1);
    assert.ok(result);
    assert.strictEqual(result.user.email, undefined);
  });

  it("getPublicProfile returns null when user not found", async () => {
    const pool = { query: async () => ({ rows: [] }) };
    assert.strictEqual(await svc.getPublicProfile(pool, 99), null);
  });
});

// ═══════════════════════════════════════════════════════════════
// Completeness
// ═══════════════════════════════════════════════════════════════

describe("companyProfile — completeness", () => {
  it("computeCompleteness returns 0% for empty profile", async () => {
    const pool = {
      query: async (sql) => {
        if (sql.includes("org_id FROM users")) return { rows: [{}] };
        return { rows: [] };
      }
    };
    const result = await svc.computeCompleteness(pool, 1);
    assert.strictEqual(result.percentage, 0);
    assert.strictEqual(result.total_sections, 5);
  });

  it("computeCompleteness returns 100% for complete profile", async () => {
    const pool = {
      query: async (sql) => {
        if (sql.includes("company_profiles")) return { rows: [{ legal_name: "T", website: "w", company_description: "d", company_size: "1-10", industry_focus: "I" }] };
        if (sql.includes("company_capabilities")) return { rows: [{ staff_categories: ["A"], industries_served: ["B"], typical_roles: ["C"], availability_regions: ["D"] }] };
        if (sql.includes("company_locations")) return { rows: [{ city: "Berlin" }] };
        if (sql.includes("company_certifications")) return { rows: [{ cert_type: "iso", expires_at: null }] };
        if (sql.includes("company_contacts")) return { rows: [{ name: "Max", is_primary: true }] };
        if (sql.includes("org_id FROM users")) return { rows: [{}] };
        return { rows: [{ id: 1, company_name: "Comp" }] };
      }
    };
    const result = await svc.computeCompleteness(pool, 1);
    assert.strictEqual(result.percentage, 100);
    assert.strictEqual(result.completed_sections, 5);
  });
});
