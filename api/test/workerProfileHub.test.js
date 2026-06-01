import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeSkillTags,
  normalizeQualificationList,
  buildWorkerPublicProfile,
  getWorkerDocumentEffectiveStatus,
  getWorkerDocumentDaysUntilExpiry,
  isWorkerDocumentExpiringSoon,
  scanWorkerDocumentDeadlines,
  summarizeWorkerDocuments
} from "../services/workerService.js";

describe("worker profile hub helpers", () => {
  it("sanitizeSkillTags trims, deduplicates and splits string input", () => {
    const result = sanitizeSkillTags(" Stapler , stapler ; Schweißen | Lager ");
    assert.deepStrictEqual(result, ["Stapler", "Schweißen", "Lager"]);
  });

  it("normalizeQualificationList normalizes strings and objects", () => {
    const result = normalizeQualificationList([
      "Staplerschein",
      {
        name: "Schweißschein",
        issuer: "DEKRA",
        expires_at: "2027-12-31",
        document_label: "Zertifikat",
        document_url: "https://internal.example/doc.pdf",
        note: "intern"
      }
    ]);
    assert.equal(result.length, 2);
    assert.deepStrictEqual(result[0], {
      name: "Staplerschein",
      issuer: null,
      expires_at: null,
      document_label: null,
      document_url: null,
      note: null
    });
    assert.equal(result[1].name, "Schweißschein");
    assert.equal(result[1].issuer, "DEKRA");
    assert.equal(result[1].document_url, "https://internal.example/doc.pdf");
  });

  it("buildWorkerPublicProfile only exposes explicitly released fields", () => {
    const result = buildWorkerPublicProfile({
      first_name: "Max",
      last_name: "Worker",
      city: "Berlin",
      email: "max@example.com",
      notes: "intern",
      profile_text: "Erfahrener Lagerlogistiker",
      availability_note: "Ab KW 20 verfügbar",
      skill_tags: ["Stapler"],
      qualifications: [
        {
          name: "Staplerschein",
          issuer: "DEKRA",
          expires_at: "2027-12-31",
          document_label: "Scan",
          document_url: "https://internal.example/doc.pdf",
          note: "intern"
        }
      ],
      profile_public: true,
      public_profile_fields: ["name", "skill_tags", "qualifications", "profile_text"],
      public_profile_slug: "11111111-1111-1111-1111-111111111111",
      updated_at: "2026-04-04T12:00:00Z"
    });

    assert.equal(result.name, "Max Worker");
    assert.deepStrictEqual(result.skill_tags, ["Stapler"]);
    assert.equal(result.profile_text, "Erfahrener Lagerlogistiker");
    assert.equal(result.city, undefined);
    assert.equal(result.email, undefined);
    assert.equal(result.notes, undefined);
    assert.equal(result.qualifications[0].document_label, "Scan");
    assert.equal(result.qualifications[0].document_url, undefined);
  });

  it("buildWorkerPublicProfile respects disabled visibility unless forced", () => {
    const hidden = {
      first_name: "Anna",
      last_name: "Talent",
      profile_public: false,
      public_profile_fields: ["name"],
      public_profile_slug: "22222222-2222-2222-2222-222222222222"
    };
    assert.equal(buildWorkerPublicProfile(hidden), null);
    assert.equal(buildWorkerPublicProfile(hidden, { force: true }).name, "Anna Talent");
  });

  it("getWorkerDocumentEffectiveStatus marks expired verified documents as expired", () => {
    const result = getWorkerDocumentEffectiveStatus({
      status: "verified",
      valid_until: "2000-01-01"
    });
    assert.equal(result, "expired");
  });
  it("getWorkerDocumentDaysUntilExpiry returns positive, zero and negative deltas", () => {
    assert.equal(
      getWorkerDocumentDaysUntilExpiry({ valid_until: "2026-04-10" }, "2026-04-05"),
      5
    );
    assert.equal(
      getWorkerDocumentDaysUntilExpiry({ valid_until: "2026-04-05" }, "2026-04-05"),
      0
    );
    assert.equal(
      getWorkerDocumentDaysUntilExpiry({ valid_until: "2026-04-01" }, "2026-04-05"),
      -4
    );
  });

  it("isWorkerDocumentExpiringSoon only flags verified documents inside the warning window", () => {
    const soon = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const later = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
    assert.equal(isWorkerDocumentExpiringSoon({ status: "verified", valid_until: soon }), true);
    assert.equal(isWorkerDocumentExpiringSoon({ status: "verified", valid_until: later }), false);
    assert.equal(isWorkerDocumentExpiringSoon({ status: "pending_review", valid_until: soon }), false);
  });

  it("summarizeWorkerDocuments counts linked, verified and expiring documents", () => {
    const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const result = summarizeWorkerDocuments([
      {
        status: "verified",
        valid_until: future,
        file_ref: "/uploads/worker-documents/test/a.pdf",
        qualification_name: "Staplerschein"
      },
      {
        status: "pending_review",
        file_ref: "/uploads/worker-documents/test/b.pdf"
      }
    ]);
    assert.equal(result.total, 2);
    assert.equal(result.verified, 1);
    assert.equal(result.pending_review, 1);
    assert.equal(result.expiring_soon, 1);
    assert.equal(result.expiring_within_7_days, 1);
    assert.equal(result.action_required, 1);
    assert.equal(result.with_files, 2);
    assert.equal(result.linked_qualifications, 1);
    assert.equal(result.next_expiry, future);
  });

  it("scanWorkerDocumentDeadlines triggers reminder and expiry callbacks and updates timestamps", async () => {
    const expiringDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const calls = [];
    const pool = {
      query: async (sql, params = []) => {
        calls.push({ sql, params });
        if (sql.includes("SELECT wpd.*")) {
          return {
            rows: [
              { id: "doc-expired", status: "verified", valid_until: "2000-01-01" },
              { id: "doc-expiring", status: "verified", valid_until: expiringDate }
            ]
          };
        }
        return { rowCount: 1, rows: [] };
      }
    };

    const expiredIds = [];
    const expiringIds = [];
    const result = await scanWorkerDocumentDeadlines(pool, {
      onExpired: async (document) => expiredIds.push(document.id),
      onExpiring: async (document) => expiringIds.push(document.id)
    });

    assert.deepStrictEqual(expiredIds, ["doc-expired"]);
    assert.deepStrictEqual(expiringIds, ["doc-expiring"]);
    assert.equal(result.scanned, 2);
    assert.equal(result.expired, 1);
    assert.equal(result.expiring, 1);
    assert.equal(result.notified, 2);
    assert.equal(result.failed, 0);
    assert.ok(calls.some((call) => call.sql.includes("expiry_notice_sent_at")));
    assert.ok(calls.some((call) => call.sql.includes("expiry_reminder_sent_at")));
  });
});
