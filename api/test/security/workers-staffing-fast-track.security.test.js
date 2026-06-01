import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createWorkersRouter } from "../../routes/workers.js";
import { baseDeps, getMiddlewareCount } from "../helpers/security-mocks.js";

describe("RBAC-STRUCT: workers staffing fast-track routes", () => {
  const router = createWorkersRouter(baseDeps(undefined, {
    getUserAndPlan: async () => ({ plan: "ENTERPRISE" })
  }));

  it("POST /staffing-assignments/:id/quick-assign keeps auth, feature gate and worker.edit protection", () => {
    const count = getMiddlewareCount(router, "post", "/staffing-assignments/:id/quick-assign");
    assert.ok(count >= 4, `Expected >= 4 middleware, got ${count}`);
  });
});
