/**
 * Unit tests for withTransaction utility.
 * No real database — uses mock pool/client.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withTransaction } from "../utils/transaction.js";

function mockClient() {
  const calls = [];
  return {
    calls,
    query(sql) { calls.push(sql); return Promise.resolve({ rows: [] }); },
    release() { calls.push("RELEASE"); }
  };
}

function mockPool(client) {
  return { connect: () => Promise.resolve(client) };
}

describe("withTransaction", () => {
  it("executes BEGIN, fn, COMMIT, release on success", async () => {
    const client = mockClient();
    const pool = mockPool(client);

    const result = await withTransaction(pool, async (c) => {
      await c.query("INSERT INTO foo VALUES (1)");
      return "ok";
    });

    assert.equal(result, "ok");
    assert.deepStrictEqual(client.calls, [
      "BEGIN",
      "INSERT INTO foo VALUES (1)",
      "COMMIT",
      "RELEASE"
    ]);
  });

  it("executes BEGIN, ROLLBACK, release on error", async () => {
    const client = mockClient();
    const pool = mockPool(client);

    await assert.rejects(
      () => withTransaction(pool, async () => { throw new Error("boom"); }),
      { message: "boom" }
    );

    assert.deepStrictEqual(client.calls, [
      "BEGIN",
      "ROLLBACK",
      "RELEASE"
    ]);
  });

  it("returns the value from fn", async () => {
    const client = mockClient();
    const pool = mockPool(client);

    const row = { id: "abc", name: "test" };
    const result = await withTransaction(pool, async () => row);
    assert.deepStrictEqual(result, row);
  });

  it("releases client even if ROLLBACK fails", async () => {
    const calls = [];
    const client = {
      query(sql) {
        calls.push(sql);
        if (sql === "ROLLBACK") return Promise.reject(new Error("rollback failed"));
        return Promise.resolve({ rows: [] });
      },
      release() { calls.push("RELEASE"); }
    };
    const pool = mockPool(client);

    await assert.rejects(
      () => withTransaction(pool, async () => { throw new Error("original"); }),
      { message: "original" }
    );

    // RELEASE must happen even though ROLLBACK threw
    assert.ok(calls.includes("RELEASE"), "client must be released");
    // Original error is propagated, not the ROLLBACK error
  });
});
