import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canInteractWithCapacity, canInteractWithDemand } from "../services/capacityInteractionPolicy.js";

describe("capacityInteractionPolicy", () => {
  it("blocks self interaction on capacity entries", () => {
    const r = canInteractWithCapacity({
      viewerRole: "company",
      viewerUserId: "u1",
      supplierUserId: "u1",
      entryStatus: "active"
    });
    assert.equal(r.allowed, false);
    assert.equal(r.code, "SELF_INTERACTION_FORBIDDEN");
  });

  it("blocks non-active capacity entries", () => {
    const r = canInteractWithCapacity({
      viewerRole: "company",
      viewerUserId: "u2",
      supplierUserId: "u1",
      entryStatus: "paused"
    });
    assert.equal(r.allowed, false);
    assert.equal(r.code, "ENTRY_NOT_INTERACTABLE");
  });

  it("blocks non-agency demand interaction responders", () => {
    const r = canInteractWithDemand({
      viewerRole: "company",
      viewerUserId: "u2",
      requesterUserId: "u1",
      demandStatus: "open"
    });
    assert.equal(r.allowed, false);
    assert.equal(r.code, "AGENCY_CAN_ONLY_INTERACT_WITH_COMPANY_DEMAND");
  });

  it("allows agency demand responses on open demand", () => {
    const r = canInteractWithDemand({
      viewerRole: "agency",
      viewerUserId: "agency-1",
      requesterUserId: "company-1",
      demandStatus: "open"
    });
    assert.equal(r.allowed, true);
  });

  it("allows agency demand responses on partially covered demand", () => {
    const r = canInteractWithDemand({
      viewerRole: "agency",
      viewerUserId: "agency-1",
      requesterUserId: "company-1",
      demandStatus: "partially_covered"
    });
    assert.equal(r.allowed, true);
  });
});
