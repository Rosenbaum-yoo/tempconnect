import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listGovernanceRequests,
  getGovernanceStatusCounts,
  listGovernanceRequestsForCsv,
} from "../services/staffDataGovernanceService.js";

function mockPool(rows = []) {
  const calls = [];
  return { calls, query: async (sql, params) => { calls.push({ sql, params }); return { rows }; } };
}

test("listGovernanceRequests: cross-org, kein Status-Filter, Limit geklemmt, DESC", async () => {
  const p = mockPool([]);
  await listGovernanceRequests(p, { limit: 999 });
  const { sql, params } = p.calls[0];
  assert.match(sql, /FROM data_governance_requests/);
  assert.match(sql, /ORDER BY dgr\.created_at DESC/);
  assert.doesNotMatch(sql, /WHERE dgr\.status/);
  assert.equal(params[params.length - 1], 200, "Limit auf 200 geklemmt");
});

test("listGovernanceRequests: Status-Filter setzt WHERE + Param", async () => {
  const p = mockPool([]);
  await listGovernanceRequests(p, { status: "pending", limit: 50 });
  const { sql, params } = p.calls[0];
  assert.match(sql, /WHERE dgr\.status = \$1/);
  assert.equal(params[0], "pending");
  assert.equal(params[1], 50);
});

test("listGovernanceRequests: Zero-State liefert leeres Array", async () => {
  const rows = await listGovernanceRequests(mockPool([]), {});
  assert.deepEqual(rows, []);
});

test("getGovernanceStatusCounts: gruppiert nach status", async () => {
  const counts = await getGovernanceStatusCounts(mockPool([
    { status: "pending", n: 3 }, { status: "completed", n: 5 },
  ]));
  assert.deepEqual(counts, { pending: 3, completed: 5 });
});

test("listGovernanceRequestsForCsv: Limit geklemmt, DESC, kein Org-Scope", async () => {
  const p = mockPool([]);
  await listGovernanceRequestsForCsv(p, { limit: 999999 });
  const { sql, params } = p.calls[0];
  assert.match(sql, /ORDER BY dgr\.created_at DESC/);
  assert.doesNotMatch(sql, /WHERE/);
  assert.equal(params[0], 10000, "CSV-Limit auf 10000 geklemmt");
});
