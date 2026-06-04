/**
 * Feature-Flag-Register unit tests — typed platform flag registry (Ebene B).
 * No DB needed.
 *
 * Run: node --test --test-force-exit test/featureFlags.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { z } from "zod";
import {
  FEATURE_FLAGS,
  featureFlagFields,
  applyProductionFlagConstraints,
  isFeatureFlagEnabled,
  listFeatureFlags
} from "../config/featureFlags.js";

/** Collect issues from a fake superRefine ctx */
function collectConstraints(data) {
  const issues = [];
  applyProductionFlagConstraints(data, { addIssue: (i) => issues.push(i) });
  return issues;
}

describe("featureFlags registry", () => {
  it("registry is frozen and holds the known platform flags", () => {
    assert.ok(Object.isFrozen(FEATURE_FLAGS));
    for (const key of ["FEATURE_GATE_BYPASS", "SUPPORT_OPS_ENABLED", "WARP_SSH_ENABLED", "INFRA_SNAPSHOT_INGEST_ENABLED"]) {
      assert.ok(key in FEATURE_FLAGS, `${key} should be registered`);
    }
  });

  it("featureFlagFields: each flag materializes its registered default (mirrors real consumer defaults)", () => {
    const schema = z.object(featureFlagFields());
    const parsed = schema.parse({});
    assert.equal(parsed.FEATURE_GATE_BYPASS, "false");
    assert.equal(parsed.SUPPORT_OPS_ENABLED, "true");
    assert.equal(parsed.WARP_SSH_ENABLED, "false");
    assert.equal(parsed.INFRA_SNAPSHOT_INGEST_ENABLED, "true");
  });

  it("featureFlagFields: rejects non-boolean flag values", () => {
    const schema = z.object(featureFlagFields());
    assert.throws(() => schema.parse({ FEATURE_GATE_BYPASS: "yes" }));
  });

  it("applyProductionFlagConstraints: forbids FEATURE_GATE_BYPASS=true in production", () => {
    const issues = collectConstraints({ NODE_ENV: "production", FEATURE_GATE_BYPASS: "true" });
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /FEATURE_GATE_BYPASS/);
    assert.deepEqual(issues[0].path, ["FEATURE_GATE_BYPASS"]);
  });

  it("applyProductionFlagConstraints: allows FEATURE_GATE_BYPASS=false in production", () => {
    const issues = collectConstraints({ NODE_ENV: "production", FEATURE_GATE_BYPASS: "false" });
    assert.equal(issues.length, 0);
  });

  it("applyProductionFlagConstraints: no-op outside production", () => {
    const issues = collectConstraints({ NODE_ENV: "development", FEATURE_GATE_BYPASS: "true" });
    assert.equal(issues.length, 0);
  });

  it("isFeatureFlagEnabled: explicit values win, empty/unset fall back to default", () => {
    assert.equal(isFeatureFlagEnabled({ WARP_SSH_ENABLED: "true" }, "WARP_SSH_ENABLED"), true);
    assert.equal(isFeatureFlagEnabled({ WARP_SSH_ENABLED: "false" }, "WARP_SSH_ENABLED"), false);
    // unset → registered default "false"
    assert.equal(isFeatureFlagEnabled({}, "WARP_SSH_ENABLED"), false);
    // unset FEATURE_GATE_BYPASS → registered default "false"
    assert.equal(isFeatureFlagEnabled({}, "FEATURE_GATE_BYPASS"), false);
    // empty string → default
    assert.equal(isFeatureFlagEnabled({ FEATURE_GATE_BYPASS: "" }, "FEATURE_GATE_BYPASS"), false);
  });

  it("listFeatureFlags: returns introspection shape without leaking values", () => {
    const flags = listFeatureFlags({ WARP_SSH_ENABLED: "true" });
    const warp = flags.find(f => f.key === "WARP_SSH_ENABLED");
    assert.equal(warp.enabled, true);
    assert.equal(typeof warp.description, "string");
    assert.ok("productionConstraint" in warp);
    const bypass = flags.find(f => f.key === "FEATURE_GATE_BYPASS");
    assert.equal(bypass.productionConstraint, "forbidden_when_true");
    // On-by-default Kill-Switches: ohne Env-Wert enabled=true (Spiegel der echten Consumer-Defaults)
    const support = flags.find(f => f.key === "SUPPORT_OPS_ENABLED");
    assert.equal(support.enabled, true);
    const infra = flags.find(f => f.key === "INFRA_SNAPSHOT_INGEST_ENABLED");
    assert.equal(infra.enabled, true);
  });
});
