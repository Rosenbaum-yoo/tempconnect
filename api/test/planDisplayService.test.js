import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPlanDisplayLabel } from "../services/planDisplayService.js";

describe("planDisplayService", () => {
  it("maps enterprise key to visible label", () => {
    assert.equal(getPlanDisplayLabel("ENTERPRISE"), "Individueller Tarif");
  });

  it("keeps technical keys for other plans", () => {
    assert.equal(getPlanDisplayLabel("PRO"), "PRO");
    assert.equal(getPlanDisplayLabel("DEMO"), "DEMO");
  });
});
