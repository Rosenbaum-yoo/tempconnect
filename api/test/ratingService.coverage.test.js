/**
 * Coverage suite for services/ratingService.js
 *
 * Behaviour-focused: asserts return values, SQL shape, bound params,
 * transaction sequencing and error-swallowing branches.
 *
 * Uses a local tracking pool that records every {sql, params} and routes
 * responses via a handler keyed on SQL substrings — more robust than ordered
 * sequencePool for the multi-statement moderated path and clearer for param
 * assertions across many helpers.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as svc from "../services/ratingService.js";

/**
 * Build a tracking pool.
 * @param {(sql:string, params:any[]) => object|Error} handler
 *   returns a pg-style result ({rows,rowCount}) or an Error (which is thrown).
 *   BEGIN/COMMIT/ROLLBACK are auto-consumed.
 */
function trackingPool(handler) {
  const calls = [];
  const queryFn = async (sql, params) => {
    const trimmed = typeof sql === "string" ? sql.trim().toUpperCase() : "";
    if (trimmed === "BEGIN" || trimmed === "COMMIT" || trimmed === "ROLLBACK") {
      calls.push({ sql: trimmed, params: params || null, tx: true });
      return { rows: [], rowCount: 0 };
    }
    calls.push({ sql, params: params || null });
    const res = handler ? handler(sql, params) : { rows: [], rowCount: 0 };
    if (res instanceof Error) throw res;
    return res || { rows: [], rowCount: 0 };
  };
  const pool = {
    calls,
    query: queryFn,
    connect: async () => ({ query: queryFn, release: () => {} }),
  };
  return pool;
}

/** Pool whose query() always throws — exercises catch branches. */
function throwingPool() {
  const queryFn = async () => {
    throw new Error("boom");
  };
  return {
    query: queryFn,
    connect: async () => ({ query: queryFn, release: () => {} }),
  };
}

const nonTxCalls = (pool) => pool.calls.filter((c) => !c.tx);

/* ───────────────────────── getRequestForRating ───────────────────────── */
describe("getRequestForRating", () => {
  it("returns the first row and binds the request id", async () => {
    const row = { id: "req-1", requester_id: "u-a", receiver_id: "u-b", status: "FINALIZED", created_at: "2026-01-01" };
    const pool = trackingPool(() => ({ rows: [row], rowCount: 1 }));
    const out = await svc.getRequestForRating(pool, "req-1");
    assert.deepEqual(out, row);
    assert.equal(pool.calls.length, 1);
    assert.match(pool.calls[0].sql, /FROM requests WHERE id=\$1/);
    assert.deepEqual(pool.calls[0].params, ["req-1"]);
  });

  it("returns null when no row exists", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const out = await svc.getRequestForRating(pool, "missing");
    assert.equal(out, null);
  });
});

/* ───────────────────────── checkExistingRating ───────────────────────── */
describe("checkExistingRating", () => {
  it("returns true when a rating row is present", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: "rt-1" }], rowCount: 1 }));
    const out = await svc.checkExistingRating(pool, "req-1", "rater-1");
    assert.equal(out, true);
    assert.match(pool.calls[0].sql, /FROM ratings WHERE request_id=\$1 AND rater_id=\$2/);
    assert.deepEqual(pool.calls[0].params, ["req-1", "rater-1"]);
  });

  it("returns false when no rating exists", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const out = await svc.checkExistingRating(pool, "req-1", "rater-1");
    assert.equal(out, false);
  });
});

/* ───────────────────────── submitRating ───────────────────────── */
describe("submitRating", () => {
  it("inserts with all params and returns the created row", async () => {
    const created = { id: "rt-9", request_id: "req-1" };
    const pool = trackingPool(() => ({ rows: [created], rowCount: 1 }));
    const out = await svc.submitRating(pool, {
      requestId: "req-1",
      raterId: "rater-1",
      ratedId: "rated-1",
      stars: 5,
      reliability: 4,
      communication: 5,
      quality: 4,
      comment: "great",
    });
    assert.deepEqual(out, created);
    assert.match(pool.calls[0].sql, /INSERT INTO ratings/);
    assert.deepEqual(pool.calls[0].params, ["req-1", "rater-1", "rated-1", 5, 4, 5, 4, "great"]);
  });

  it("coerces a missing comment to null", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: "rt-10" }], rowCount: 1 }));
    await svc.submitRating(pool, {
      requestId: "req-2",
      raterId: "r",
      ratedId: "rd",
      stars: 3,
      reliability: 3,
      communication: 3,
      quality: 3,
      // comment omitted
    });
    assert.equal(pool.calls[0].params[7], null);
  });
});

/* ───────────────────────── getUserRatings ───────────────────────── */
describe("getUserRatings", () => {
  it("returns rows and joins rater company, limited to 50", async () => {
    const rows = [{ stars: 5, rater_company: "ACME" }];
    const pool = trackingPool(() => ({ rows, rowCount: rows.length }));
    const out = await svc.getUserRatings(pool, "user-7");
    assert.deepEqual(out, rows);
    assert.match(pool.calls[0].sql, /JOIN users u ON u\.id = r\.rater_id/);
    assert.match(pool.calls[0].sql, /LIMIT 50/);
    assert.deepEqual(pool.calls[0].params, ["user-7"]);
  });

  it("returns empty array when user has no ratings", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const out = await svc.getUserRatings(pool, "user-x");
    assert.deepEqual(out, []);
  });
});

/* ───────────────────────── getRatingStats ───────────────────────── */
describe("getRatingStats", () => {
  it("returns the single aggregate row and filters to approved/legacy moderation", async () => {
    const agg = { count: "3", avg_stars: "4.7", avg_reliability: "4.5", avg_communication: "4.8", avg_quality: "4.6" };
    const pool = trackingPool(() => ({ rows: [agg], rowCount: 1 }));
    const out = await svc.getRatingStats(pool, "user-7");
    assert.deepEqual(out, agg);
    assert.match(pool.calls[0].sql, /LEFT JOIN profile_review_moderation/);
    assert.match(pool.calls[0].sql, /prm\.id IS NULL OR prm\.status = 'approved'/);
    assert.deepEqual(pool.calls[0].params, ["user-7"]);
  });

  it("returns undefined when aggregate produces no rows", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const out = await svc.getRatingStats(pool, "user-7");
    assert.equal(out, undefined);
  });
});

/* ───────────────────────── getPendingRatings ───────────────────────── */
describe("getPendingRatings", () => {
  it("returns finalized deals without a rating and binds user id once", async () => {
    const rows = [{ request_id: "req-1", partner_name: "Partner GmbH", partner_id: "p-1" }];
    const pool = trackingPool(() => ({ rows, rowCount: rows.length }));
    const out = await svc.getPendingRatings(pool, "user-7");
    assert.deepEqual(out, rows);
    assert.match(pool.calls[0].sql, /r\.status = 'FINALIZED'/);
    assert.match(pool.calls[0].sql, /rt\.id IS NULL/);
    assert.match(pool.calls[0].sql, /INTERVAL '30 days'/);
    assert.deepEqual(pool.calls[0].params, ["user-7"]);
  });

  it("returns empty array when nothing is pending", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const out = await svc.getPendingRatings(pool, "user-7");
    assert.deepEqual(out, []);
  });
});

/* ───────────────────────── submitRatingModerated ───────────────────────── */
describe("submitRatingModerated", () => {
  it("inserts rating + moderation entry atomically inside a transaction", async () => {
    const rating = { id: "rt-42", request_id: "req-1" };
    const pool = trackingPool((sql) => {
      if (/INSERT INTO ratings/.test(sql)) return { rows: [rating], rowCount: 1 };
      if (/INSERT INTO profile_review_moderation/.test(sql)) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const out = await svc.submitRatingModerated(pool, {
      requestId: "req-1",
      raterId: "rater-1",
      ratedId: "rated-1",
      stars: 5,
      reliability: 4,
      communication: 5,
      quality: 4,
      comment: "ok",
    });
    assert.deepEqual(out, rating);

    // BEGIN + 2 inserts + COMMIT, in order
    const order = pool.calls.map((c) => (c.tx ? c.sql : c.sql.match(/INSERT INTO \w+/)?.[0]));
    assert.deepEqual(order, ["BEGIN", "INSERT INTO ratings", "INSERT INTO profile_review_moderation", "COMMIT"]);

    const ins = nonTxCalls(pool);
    assert.deepEqual(ins[0].params, ["req-1", "rater-1", "rated-1", 5, 4, 5, 4, "ok"]);
    assert.deepEqual(ins[1].params, ["rt-42"]); // moderation keyed on new rating id
    assert.match(ins[1].sql, /ON CONFLICT \(rating_id\) DO NOTHING/);
  });

  it("coerces missing comment to null in the rating insert", async () => {
    const pool = trackingPool((sql) => {
      if (/INSERT INTO ratings/.test(sql)) return { rows: [{ id: "rt-1" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    await svc.submitRatingModerated(pool, {
      requestId: "req-1",
      raterId: "r",
      ratedId: "rd",
      stars: 3,
      reliability: 3,
      communication: 3,
      quality: 3,
    });
    assert.equal(nonTxCalls(pool)[0].params[7], null);
  });

  it("rolls back and rethrows when the moderation insert fails", async () => {
    const pool = trackingPool((sql) => {
      if (/INSERT INTO ratings/.test(sql)) return { rows: [{ id: "rt-7" }], rowCount: 1 };
      if (/INSERT INTO profile_review_moderation/.test(sql)) return new Error("dup");
      return { rows: [], rowCount: 0 };
    });
    await assert.rejects(
      () => svc.submitRatingModerated(pool, {
        requestId: "req-1",
        raterId: "r",
        ratedId: "rd",
        stars: 4,
        reliability: 4,
        communication: 4,
        quality: 4,
        comment: "x",
      }),
      /dup/
    );
    assert.ok(pool.calls.some((c) => c.tx && c.sql === "ROLLBACK"), "expected ROLLBACK");
    assert.ok(!pool.calls.some((c) => c.tx && c.sql === "COMMIT"), "must not COMMIT on failure");
  });
});

/* ───────────────────────── getPublicRatings ───────────────────────── */
describe("getPublicRatings", () => {
  it("returns only approved/legacy ratings with correct filter and params", async () => {
    const rows = [{ stars: 5, rater_company: "ACME" }];
    const pool = trackingPool(() => ({ rows, rowCount: rows.length }));
    const out = await svc.getPublicRatings(pool, "user-7");
    assert.deepEqual(out, rows);
    assert.match(pool.calls[0].sql, /prm\.id IS NULL OR prm\.status = 'approved'/);
    assert.match(pool.calls[0].sql, /LIMIT 50/);
    assert.deepEqual(pool.calls[0].params, ["user-7"]);
  });

  it("returns empty array (soft-fail) when the query throws", async () => {
    const out = await svc.getPublicRatings(throwingPool(), "user-7");
    assert.deepEqual(out, []);
  });
});

/* ───────────────────────── approveRating ───────────────────────── */
describe("approveRating", () => {
  it("returns ok:true and sets status=approved for pending/flagged rows", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 1 }));
    const out = await svc.approveRating(pool, "rt-1", "staff-1");
    assert.deepEqual(out, { ok: true });
    assert.match(pool.calls[0].sql, /SET status = 'approved'/);
    assert.match(pool.calls[0].sql, /status IN \('pending', 'flagged'\)/);
    assert.deepEqual(pool.calls[0].params, ["rt-1", "staff-1"]);
  });

  it("returns NOT_FOUND_OR_ALREADY_PROCESSED when no row matched", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const out = await svc.approveRating(pool, "rt-1", "staff-1");
    assert.deepEqual(out, { ok: false, reason: "NOT_FOUND_OR_ALREADY_PROCESSED" });
  });

  it("returns DB_ERROR when the query throws", async () => {
    const out = await svc.approveRating(throwingPool(), "rt-1", "staff-1");
    assert.deepEqual(out, { ok: false, reason: "DB_ERROR" });
  });
});

/* ───────────────────────── rejectRating ───────────────────────── */
describe("rejectRating", () => {
  it("returns ok:true and binds reason as the third param", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 1 }));
    const out = await svc.rejectRating(pool, "rt-1", "staff-1", "spam");
    assert.deepEqual(out, { ok: true });
    assert.match(pool.calls[0].sql, /SET status = 'rejected'/);
    assert.match(pool.calls[0].sql, /rejection_reason = \$3/);
    assert.deepEqual(pool.calls[0].params, ["rt-1", "staff-1", "spam"]);
  });

  it("coerces a missing reason to null", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 1 }));
    await svc.rejectRating(pool, "rt-1", "staff-1");
    assert.equal(pool.calls[0].params[2], null);
  });

  it("returns NOT_FOUND_OR_ALREADY_PROCESSED when no row matched", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const out = await svc.rejectRating(pool, "rt-1", "staff-1", "spam");
    assert.deepEqual(out, { ok: false, reason: "NOT_FOUND_OR_ALREADY_PROCESSED" });
  });

  it("returns DB_ERROR when the query throws", async () => {
    const out = await svc.rejectRating(throwingPool(), "rt-1", "staff-1", "spam");
    assert.deepEqual(out, { ok: false, reason: "DB_ERROR" });
  });
});

/* ───────────────────────── flagRating ───────────────────────── */
describe("flagRating", () => {
  it("returns ok:true and allows flagging pending/approved rows", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 1 }));
    const out = await svc.flagRating(pool, "rt-1", "staff-1", "needs-review");
    assert.deepEqual(out, { ok: true });
    assert.match(pool.calls[0].sql, /SET status = 'flagged'/);
    assert.match(pool.calls[0].sql, /status IN \('pending', 'approved'\)/);
    assert.match(pool.calls[0].sql, /flag_reason = \$3/);
    assert.deepEqual(pool.calls[0].params, ["rt-1", "staff-1", "needs-review"]);
  });

  it("coerces a missing flagReason to null", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 1 }));
    await svc.flagRating(pool, "rt-1", "staff-1");
    assert.equal(pool.calls[0].params[2], null);
  });

  it("returns NOT_FOUND_OR_ALREADY_PROCESSED when no row matched", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const out = await svc.flagRating(pool, "rt-1", "staff-1", "x");
    assert.deepEqual(out, { ok: false, reason: "NOT_FOUND_OR_ALREADY_PROCESSED" });
  });

  it("returns DB_ERROR when the query throws", async () => {
    const out = await svc.flagRating(throwingPool(), "rt-1", "staff-1", "x");
    assert.deepEqual(out, { ok: false, reason: "DB_ERROR" });
  });
});

/* ───────────────────────── getPendingModerationQueue ───────────────────────── */
describe("getPendingModerationQueue", () => {
  it("returns the queue and uses the default limit of 50", async () => {
    const rows = [{ moderation_id: "m-1", rating_id: "rt-1", status: "pending" }];
    const pool = trackingPool(() => ({ rows, rowCount: rows.length }));
    const out = await svc.getPendingModerationQueue(pool);
    assert.deepEqual(out, rows);
    assert.match(pool.calls[0].sql, /WHERE prm\.status IN \('pending', 'flagged'\)/);
    assert.match(pool.calls[0].sql, /ORDER BY prm\.created_at ASC/);
    assert.deepEqual(pool.calls[0].params, [50]);
  });

  it("honours a custom limit", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    await svc.getPendingModerationQueue(pool, { limit: 5 });
    assert.deepEqual(pool.calls[0].params, [5]);
  });

  it("returns empty array (soft-fail) when the query throws", async () => {
    const out = await svc.getPendingModerationQueue(throwingPool());
    assert.deepEqual(out, []);
  });
});
