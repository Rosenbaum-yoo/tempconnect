import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { sequencePool } from "./helpers/mockPool.js";
import {
  buildStaffingReadyLink,
  isStaffingFastTrackEnabled,
  resolveStaffingReadyRecipientUserIds
} from "../services/dealStaffingFastTrackService.js";
import { getSuggestionQuickAssignState } from "../services/assignmentStaffingService.js";

describe("Deal staffing fast-track helpers", () => {
  it("builds a deep link into the existing staffing surface", () => {
    const link = buildStaffingReadyLink({
      assignmentId: "assignment-123",
      offerId: "offer-456"
    });

    assert.strictEqual(
      link,
      "/public/worker-submissions-review.html?assignment_id=assignment-123&offer_id=offer-456&mode=staffing_ready#asgn"
    );
  });

  it("keeps the fast-track enabled when no override is configured", async () => {
    const pool = sequencePool({ rows: [], rowCount: 0 });

    const enabled = await isStaffingFastTrackEnabled(pool, "org-1");

    assert.strictEqual(enabled, true);
  });

  it("resolves only active org members with worker.edit permission and dedupes recipients", async () => {
    const pool = sequencePool({
      rows: [
        { user_id: "dispatcher-1", role_key: "dispatcher" },
        { user_id: "member-1", role_key: "member" },
        { user_id: "owner-1", role_key: "owner" },
        { user_id: "dispatcher-1", role_key: "dispatcher" }
      ],
      rowCount: 4
    });

    const recipients = await resolveStaffingReadyRecipientUserIds(pool, "supplier-org-1", {
      fallbackUserId: "fallback-user"
    });

    assert.deepStrictEqual(recipients, ["dispatcher-1", "owner-1"]);
  });

  it("falls back to the supplier user when no staffing-capable member is available", async () => {
    const pool = sequencePool({
      rows: [
        { user_id: "member-1", role_key: "member" },
        { user_id: "viewer-1", role_key: "viewer" }
      ],
      rowCount: 2
    });

    const recipients = await resolveStaffingReadyRecipientUserIds(pool, "supplier-org-1", {
      fallbackUserId: "fallback-user"
    });

    assert.deepStrictEqual(recipients, ["fallback-user"]);
  });
});

describe("Assignment staffing quick-assign state", () => {
  it("marks clean hard matches as quick-assign eligible", () => {
    const state = getSuggestionQuickAssignState({
      hard_failures: [],
      missing_requirements: [],
      already_contacted: false,
      has_open_invite: false
    });

    assert.strictEqual(state.quick_assign_eligible, true);
    assert.deepStrictEqual(state.quick_assign_blockers, []);
  });

  it("surfaces blockers from missing requirements and live invite collisions", () => {
    const state = getSuggestionQuickAssignState({
      hard_failures: [],
      missing_requirements: [
        { code: "missing_skill", label: "Pflicht-Skill fehlt" }
      ],
      already_contacted: false,
      has_open_invite: true
    });

    assert.strictEqual(state.quick_assign_eligible, false);
    assert.deepStrictEqual(state.quick_assign_blockers, [
      { code: "missing_skill", label: "Pflicht-Skill fehlt" },
      { code: "open_invite", label: "Offene Staffing-Anfrage läuft bereits" }
    ]);
  });
});
