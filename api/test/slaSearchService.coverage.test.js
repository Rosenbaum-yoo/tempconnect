/**
 * slaSearchService — complementary coverage suite.
 *
 * The base suite (slaSearchService.test.js) only exercises searchSlaScan().
 * This file covers the rest of the exported surface: CRUD, SLA events,
 * matching (scoring), match alerts, and the batch runner — with behavior
 * assertions on return values, thrown errors, and SQL params/shape.
 *
 * Run: node --test --test-force-exit test/slaSearchService.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createSearchJob,
  listSearchJobsForOwner,
  getSearchJobById,
  updateSearchJob,
  deleteSearchJob,
  updateSearchJobStatus,
  writeSearchSlaEvent,
  recordSearchSlaStarted,
  recordSearchMatchingAttempt,
  recordSearchNotificationSent,
  markSearchSlaMet,
  getSearchSlaEvents,
  runSearchMatching,
  getSearchMatches,
  runSearchJobsBatch,
  createMatchAlert,
  getUnreadAlerts,
  getUnreadAlertCount,
  markAlertRead,
  markAllAlertsRead
} from "../services/slaSearchService.js";

const JOB = "00000000-0000-4000-8000-0000000000aa";
const OWNER = "00000000-0000-4000-8000-0000000000bb";
const USER = "00000000-0000-4000-8000-0000000000cc";

/**
 * Tracking pool: records every query (sql + params) and dispatches to a
 * user-supplied handler. The handler may return undefined → default empty.
 * connect() returns {query, release} so withTransaction-style flows work.
 */
function trackingPool(handler = () => undefined) {
  const calls = [];
  const query = async (sql, params) => {
    const s = String(sql);
    calls.push({ sql: s, params: params || [] });
    return handler(s, params || []) || { rows: [], rowCount: 0 };
  };
  return {
    calls,
    query,
    connect: async () => ({ query, release() {} })
  };
}

// ═══════════════════════════════════════════════════════════════
// createSearchJob — plan-gated SLA fields + payload mapping
// ═══════════════════════════════════════════════════════════════

describe("createSearchJob", () => {
  it("sets SLA fields for PLUS/PRO plans (notdienst → 30 min default)", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: JOB }], rowCount: 1 }));
    const row = await createSearchJob(pool, OWNER, "agency", "PRO", {
      target_type: "CAPACITY",
      title: "T",
      urgency: "NOTDIENST"
    });
    assert.strictEqual(row.id, JOB);
    const p = pool.calls[0].params;
    // sla_minutes is param index 14 (0-based) per INSERT column order
    assert.strictEqual(p[14], 30);
    // sla_started_at (idx 13) is a Date, sla_status (idx 16) is "RUNNING"
    assert.ok(p[13] instanceof Date);
    assert.strictEqual(p[16], "RUNNING");
    // sla_due_at (idx 15) = started + 30 min
    assert.ok(p[15] instanceof Date);
    assert.strictEqual(p[15].getTime() - p[13].getTime(), 30 * 60 * 1000);
  });

  it("uses 120-min default for non-notdienst urgency on PLUS", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: JOB }], rowCount: 1 }));
    await createSearchJob(pool, OWNER, "company", "PLUS", {
      target_type: "DEMAND",
      title: "T"
    });
    assert.strictEqual(pool.calls[0].params[14], 120);
  });

  it("honours an explicit sla_minutes override on a SLA plan", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: JOB }], rowCount: 1 }));
    await createSearchJob(pool, OWNER, "company", "PRO", {
      target_type: "CAPACITY",
      title: "T",
      sla_minutes: 45
    });
    assert.strictEqual(pool.calls[0].params[14], 45);
  });

  it("disables SLA fields for non-SLA plans (BASIS) → null sla, urgency lowercased", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: JOB }], rowCount: 1 }));
    await createSearchJob(pool, OWNER, "company", "BASIS", {
      target_type: "CAPACITY",
      title: "T",
      urgency: "Notdienst"
    });
    const p = pool.calls[0].params;
    assert.strictEqual(p[13], null);      // sla_started_at
    assert.strictEqual(p[14], null);      // sla_minutes
    assert.strictEqual(p[15], null);      // sla_due_at
    assert.strictEqual(p[16], null);      // sla_status
    assert.strictEqual(p[12], "notdienst"); // urgency lowercased
  });

  it("applies defaults for headcount (1) and radius_km (25)", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: JOB }], rowCount: 1 }));
    await createSearchJob(pool, OWNER, "company", "DEMO", {
      target_type: "DEMAND",
      title: "T"
    });
    const p = pool.calls[0].params;
    assert.strictEqual(p[6], 1);   // headcount
    assert.strictEqual(p[11], 25); // radius_km
    assert.strictEqual(p[12], "normal"); // urgency default
  });
});

// ═══════════════════════════════════════════════════════════════
// listSearchJobsForOwner / getSearchJobById
// ═══════════════════════════════════════════════════════════════

describe("listSearchJobsForOwner", () => {
  it("scopes by owner_company_id and returns rows", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: JOB }, { id: "x" }], rowCount: 2 }));
    const rows = await listSearchJobsForOwner(pool, OWNER);
    assert.strictEqual(rows.length, 2);
    assert.match(pool.calls[0].sql, /WHERE owner_company_id = \$1/);
    assert.deepStrictEqual(pool.calls[0].params, [OWNER]);
  });
});

describe("getSearchJobById", () => {
  it("returns the single matched row", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: JOB }], rowCount: 1 }));
    const row = await getSearchJobById(pool, JOB);
    assert.strictEqual(row.id, JOB);
    assert.deepStrictEqual(pool.calls[0].params, [JOB]);
  });

  it("returns null when not found", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const row = await getSearchJobById(pool, JOB);
    assert.strictEqual(row, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// updateSearchJob — dynamic SET building + owner guard
// ═══════════════════════════════════════════════════════════════

describe("updateSearchJob", () => {
  it("returns null without a query when no allowed field is present", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: JOB }], rowCount: 1 }));
    const res = await updateSearchJob(pool, JOB, OWNER, { not_allowed: "x", id: "y" });
    assert.strictEqual(res, null);
    assert.strictEqual(pool.calls.length, 0);
  });

  it("builds SET for allowed fields, appends updated_at, params = [id, owner, ...values]", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: JOB }], rowCount: 1 }));
    const res = await updateSearchJob(pool, JOB, OWNER, {
      title: "New",
      radius_km: 40,
      ignored: "nope"
    });
    assert.strictEqual(res.id, JOB);
    const { sql, params } = pool.calls[0];
    assert.match(sql, /SET title = \$3, radius_km = \$4, updated_at = NOW\(\)/);
    assert.match(sql, /WHERE id = \$1 AND owner_company_id = \$2/);
    assert.deepStrictEqual(params, [JOB, OWNER, "New", 40]);
  });

  it("treats explicit undefined as 'not provided' but allows null/falsey values", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: JOB }], rowCount: 1 }));
    await updateSearchJob(pool, JOB, OWNER, {
      title: undefined,
      headcount: 0,
      location_city: null
    });
    const { params } = pool.calls[0];
    // title skipped (undefined); headcount=0 and city=null included
    assert.deepStrictEqual(params, [JOB, OWNER, 0, null]);
  });

  it("returns null when the row does not belong to owner (no rows)", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const res = await updateSearchJob(pool, JOB, OWNER, { title: "x" });
    assert.strictEqual(res, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// deleteSearchJob — cascades then deletes, returns boolean
// ═══════════════════════════════════════════════════════════════

describe("deleteSearchJob", () => {
  /* GEAENDERT wegen Befund E-15 (2026-08-20) — und zwar der TEST, nicht der Code:
     Er hat die alte Reihenfolge festgeschrieben und damit den Defekt als Soll
     kodiert. Die drei Aufraeum-Loeschungen liefen OHNE Bindung und standen VOR
     der Besitzpruefung; ein DELETE auf eine fremde Kennung hat deren Treffer,
     Ereignisse und Meldungen geloescht und danach 404 gemeldet. Die Zusicherung
     ist jetzt staerker als vorher: sie haelt fest, dass GEKLAERT wird, BEVOR
     geloescht wird. */
  it("klaert den Besitz ZUERST, loescht dann Treffer, Ereignisse, Meldungen und den Auftrag", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("SELECT 1 FROM sla_search_jobs")) return { rows: [{ eins: 1 }], rowCount: 1 };
      if (sql.includes("DELETE FROM sla_search_jobs")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const ok = await deleteSearchJob(pool, JOB, OWNER);
    assert.strictEqual(ok, true);
    assert.strictEqual(pool.calls.length, 5);
    assert.match(pool.calls[0].sql, /SELECT 1 FROM sla_search_jobs WHERE id = \$1 AND owner_company_id = \$2/);
    assert.deepStrictEqual(pool.calls[0].params, [JOB, OWNER], "die Klaerung traegt Auftrag UND Besitzer");
    assert.match(pool.calls[1].sql, /DELETE FROM sla_search_matches WHERE search_job_id = \$1/);
    assert.match(pool.calls[2].sql, /DELETE FROM sla_search_events WHERE search_job_id = \$1/);
    assert.match(pool.calls[3].sql, /DELETE FROM match_alerts WHERE job_id = \$1/);
    assert.match(pool.calls[4].sql, /DELETE FROM sla_search_jobs WHERE id = \$1 AND owner_company_id = \$2/);
    assert.deepStrictEqual(pool.calls[4].params, [JOB, OWNER]);
  });

  it("loescht bei fremdem Besitzer GAR NICHTS (Befund E-15)", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const ok = await deleteSearchJob(pool, JOB, OWNER);
    assert.strictEqual(ok, false);
    assert.strictEqual(
      pool.calls.length, 1,
      "nach der erfolglosen Klaerung darf keine einzige Loeschung folgen — " +
      "genau das war der Defekt"
    );
  });

  it("returns false when the job row did not match owner (rowCount 0)", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const ok = await deleteSearchJob(pool, JOB, OWNER);
    assert.strictEqual(ok, false);
  });
});

// ═══════════════════════════════════════════════════════════════
// updateSearchJobStatus — whitelist + closed_at side effect
// ═══════════════════════════════════════════════════════════════

describe("updateSearchJobStatus", () => {
  it("rejects an invalid status with invalid_status (no query)", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: JOB }], rowCount: 1 }));
    await assert.rejects(
      () => updateSearchJobStatus(pool, JOB, OWNER, "deleted"),
      /invalid_status/
    );
    assert.strictEqual(pool.calls.length, 0);
  });

  it("sets status without closed_at for 'paused'", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: JOB, status: "paused" }], rowCount: 1 }));
    const row = await updateSearchJobStatus(pool, JOB, OWNER, "paused");
    assert.strictEqual(row.status, "paused");
    assert.doesNotMatch(pool.calls[0].sql, /closed_at/);
    assert.deepStrictEqual(pool.calls[0].params, [JOB, OWNER, "paused"]);
  });

  it("adds COALESCE closed_at when closing", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: JOB, status: "closed" }], rowCount: 1 }));
    await updateSearchJobStatus(pool, JOB, OWNER, "closed");
    assert.match(pool.calls[0].sql, /closed_at = COALESCE\(closed_at, NOW\(\)\)/);
  });

  it("returns null when no row matches owner", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const row = await updateSearchJobStatus(pool, JOB, OWNER, "open");
    assert.strictEqual(row, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// SLA events
// ═══════════════════════════════════════════════════════════════

describe("writeSearchSlaEvent", () => {
  it("serializes an object payload to JSON", async () => {
    const pool = trackingPool();
    await writeSearchSlaEvent(pool, JOB, "CUSTOM", { a: 1 });
    assert.match(pool.calls[0].sql, /INSERT INTO sla_search_events/);
    const p = pool.calls[0].params;
    assert.strictEqual(p[0], JOB);
    assert.strictEqual(p[1], "CUSTOM");
    assert.strictEqual(p[2], JSON.stringify({ a: 1 }));
  });

  it("passes a non-object payload through unchanged", async () => {
    const pool = trackingPool();
    await writeSearchSlaEvent(pool, JOB, "CUSTOM", "raw-string");
    assert.strictEqual(pool.calls[0].params[2], "raw-string");
  });

  it("defaults payload to {} (serialized) when omitted", async () => {
    const pool = trackingPool();
    await writeSearchSlaEvent(pool, JOB, "CUSTOM");
    assert.strictEqual(pool.calls[0].params[2], "{}");
  });
});

describe("recordSearchSlaStarted", () => {
  it("writes a SLA_STARTED event carrying an ISO timestamp", async () => {
    const pool = trackingPool();
    await recordSearchSlaStarted(pool, JOB);
    assert.strictEqual(pool.calls[0].params[1], "SLA_STARTED");
    const payload = JSON.parse(pool.calls[0].params[2]);
    assert.ok(!Number.isNaN(Date.parse(payload.at)));
  });
});

describe("recordSearchMatchingAttempt", () => {
  it("records the attempt + event on first call (rowCount 1)", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("UPDATE sla_search_jobs")) return { rows: [{ id: JOB }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const res = await recordSearchMatchingAttempt(pool, JOB, { candidateCount: 3 });
    assert.deepStrictEqual(res, { recorded: true });
    assert.strictEqual(pool.calls.length, 2);
    assert.match(pool.calls[0].sql, /first_matching_attempt_at = COALESCE/);
    assert.strictEqual(pool.calls[1].params[1], "MATCHING_ATTEMPT");
  });

  it("returns {recorded:false} and skips the event when already recorded (rowCount 0)", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const res = await recordSearchMatchingAttempt(pool, JOB);
    assert.deepStrictEqual(res, { recorded: false });
    assert.strictEqual(pool.calls.length, 1);
  });
});

describe("recordSearchNotificationSent", () => {
  it("records on first call and writes NOTIFICATION_SENT", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("UPDATE sla_search_jobs")) return { rows: [{ id: JOB }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const res = await recordSearchNotificationSent(pool, JOB, { notifiedCount: 2 });
    assert.deepStrictEqual(res, { recorded: true });
    assert.strictEqual(pool.calls[1].params[1], "NOTIFICATION_SENT");
  });

  it("returns {recorded:false} when already sent", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const res = await recordSearchNotificationSent(pool, JOB);
    assert.deepStrictEqual(res, { recorded: false });
    assert.strictEqual(pool.calls.length, 1);
  });
});

describe("markSearchSlaMet", () => {
  it("flips RUNNING→MET and writes SLA_MET event", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("sla_status = 'MET'")) return { rows: [{ id: JOB }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const res = await markSearchSlaMet(pool, JOB);
    assert.deepStrictEqual(res, { updated: true });
    assert.match(pool.calls[0].sql, /WHERE id = \$1 AND sla_status = 'RUNNING'/);
    assert.strictEqual(pool.calls[1].params[1], "SLA_MET");
  });

  it("returns {updated:false} and skips event when not RUNNING", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const res = await markSearchSlaMet(pool, JOB);
    assert.deepStrictEqual(res, { updated: false });
    assert.strictEqual(pool.calls.length, 1);
  });
});

describe("getSearchSlaEvents", () => {
  it("returns events ordered ASC for the job", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: "e1" }], rowCount: 1 }));
    const rows = await getSearchSlaEvents(pool, JOB);
    assert.strictEqual(rows.length, 1);
    assert.match(pool.calls[0].sql, /ORDER BY created_at ASC/);
    assert.deepStrictEqual(pool.calls[0].params, [JOB]);
  });
});

// ═══════════════════════════════════════════════════════════════
// runSearchMatching — scoring + persistence
// ═══════════════════════════════════════════════════════════════

describe("runSearchMatching", () => {
  it("returns empty result for a missing job", async () => {
    const pool = trackingPool();
    const res = await runSearchMatching(pool, null);
    assert.deepStrictEqual(res, { candidateCount: 0, matchCount: 0, matches: [] });
    assert.strictEqual(pool.calls.length, 0);
  });

  it("returns empty result when job is not open", async () => {
    const pool = trackingPool();
    const res = await runSearchMatching(pool, { status: "paused", target_type: "CAPACITY" });
    assert.deepStrictEqual(res, { candidateCount: 0, matchCount: 0, matches: [] });
    assert.strictEqual(pool.calls.length, 0);
  });

  it("returns empty for an unknown target_type", async () => {
    const pool = trackingPool();
    const res = await runSearchMatching(pool, { status: "open", target_type: "OTHER" });
    assert.deepStrictEqual(res, { candidateCount: 0, matchCount: 0, matches: [] });
  });

  it("CAPACITY: scores caps, skips zero-score, upserts top matches by score", async () => {
    const caps = [
      { id: "c-role", role: "pflege", skill_tags: ["wund"] },          // 30 + 5 = 35
      { id: "c-city", role: "x", location_city: "Kiel" },              // city match 15
      { id: "c-zero", role: "nope", location_city: "Hamburg" }         // 0 → skipped
    ];
    const upserts = [];
    const pool = trackingPool((sql, params) => {
      if (sql.includes("FROM capacity_posts")) return { rows: caps, rowCount: caps.length };
      if (sql.includes("INSERT INTO sla_search_matches")) {
        upserts.push(params);
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const job = {
      id: JOB, status: "open", target_type: "CAPACITY",
      role: "Pflege", skill_tags: ["Wund"], location_city: "kiel"
    };
    const res = await runSearchMatching(pool, job);
    assert.strictEqual(res.candidateCount, 3);
    assert.strictEqual(res.matchCount, 2);     // zero-score skipped
    // highest score first
    assert.strictEqual(res.matches[0].cap.id, "c-role");
    assert.strictEqual(res.matches[0].score, 35);
    assert.strictEqual(res.matches[1].cap.id, "c-city");
    // upsert query uses capacity_post_id + ON CONFLICT
    const insertSql = pool.calls.find((c) => c.sql.includes("INSERT INTO sla_search_matches")).sql;
    assert.match(insertSql, /capacity_post_id/);
    assert.match(insertSql, /ON CONFLICT \(search_job_id, capacity_post_id\)/);
    // reasons JSON carries the score
    assert.strictEqual(upserts[0][2], 35);
    assert.deepStrictEqual(JSON.parse(upserts[0][3]), [{ type: "score", value: 35 }]);
  });

  it("CAPACITY: caps the number of upserts at 25 (top slice)", async () => {
    const caps = Array.from({ length: 30 }, (_, i) => ({
      id: `c${i}`, role: "pflege" // all score 30
    }));
    let inserts = 0;
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM capacity_posts")) return { rows: caps, rowCount: caps.length };
      if (sql.includes("INSERT INTO sla_search_matches")) { inserts++; return { rows: [], rowCount: 1 }; }
      return { rows: [], rowCount: 0 };
    });
    const res = await runSearchMatching(pool, {
      id: JOB, status: "open", target_type: "CAPACITY", role: "Pflege"
    });
    assert.strictEqual(res.candidateCount, 30);
    assert.strictEqual(res.matchCount, 25);
    assert.strictEqual(inserts, 25);
  });

  it("CAPACITY: geo proximity adds distance bonus when within radius", async () => {
    // identical coords → dist 0 → +25; role match +30 = 55
    const caps = [{ id: "near", role: "pflege", location_lat: 54.0, location_lng: 9.0, radius_km: 25 }];
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM capacity_posts")) return { rows: caps, rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const res = await runSearchMatching(pool, {
      id: JOB, status: "open", target_type: "CAPACITY",
      role: "Pflege", location_lat: 54.0, location_lng: 9.0, radius_km: 25
    });
    assert.strictEqual(res.matches[0].score, 55);
  });

  it("DEMAND: scores demand_requests and upserts using demand_request_id", async () => {
    const demands = [{ id: "d1", role: "pflege" }];
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM demand_requests")) return { rows: demands, rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const res = await runSearchMatching(pool, {
      id: JOB, status: "open", target_type: "DEMAND", role: "Pflege"
    });
    assert.strictEqual(res.candidateCount, 1);
    assert.strictEqual(res.matchCount, 1);
    assert.strictEqual(res.matches[0].demand.id, "d1");
    const insertSql = pool.calls.find((c) => c.sql.includes("INSERT INTO sla_search_matches")).sql;
    assert.match(insertSql, /demand_request_id/);
    assert.match(insertSql, /ON CONFLICT \(search_job_id, demand_request_id\)/);
  });

  it("DEMAND: queries only open demands and skips zero-score", async () => {
    const demands = [{ id: "d1", role: "no-match", location_city: "Berlin" }];
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM demand_requests")) return { rows: demands, rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const res = await runSearchMatching(pool, {
      id: JOB, status: "open", target_type: "DEMAND", role: "Pflege", location_city: "Kiel"
    });
    assert.match(pool.calls[0].sql, /status = 'open'/);
    assert.strictEqual(res.matchCount, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// getSearchMatches
// ═══════════════════════════════════════════════════════════════

describe("getSearchMatches", () => {
  it("joins capacity/demand and orders by score DESC NULLS LAST", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: "m1" }], rowCount: 1 }));
    const rows = await getSearchMatches(pool, JOB);
    assert.strictEqual(rows.length, 1);
    assert.match(pool.calls[0].sql, /LEFT JOIN capacity_posts/);
    assert.match(pool.calls[0].sql, /LEFT JOIN demand_requests/);
    assert.match(pool.calls[0].sql, /ORDER BY m\.match_score DESC NULLS LAST/);
    assert.deepStrictEqual(pool.calls[0].params, [JOB]);
  });
});

// ═══════════════════════════════════════════════════════════════
// runSearchJobsBatch — orchestration over matching + mail + alerts
// ═══════════════════════════════════════════════════════════════

describe("runSearchJobsBatch", () => {
  it("returns processed:0 with no open jobs and caps batch size at 100", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM sla_search_jobs")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const res = await runSearchJobsBatch(pool, null, 9999);
    assert.deepStrictEqual(res, { processed: 0 });
    assert.strictEqual(pool.calls[0].params[0], 100);
  });

  it("defaults batch size to 50 when unset", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM sla_search_jobs")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    await runSearchJobsBatch(pool);
    assert.strictEqual(pool.calls[0].params[0], 50);
  });

  it("CAPACITY job: matches, records attempt, sends mail, records notification, creates alert, marks SLA met", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const job = {
      id: JOB, owner_company_id: OWNER, status: "open", target_type: "CAPACITY",
      role: "pflege", title: "T", sla_status: "RUNNING", sla_due_at: future
    };
    const cap = { id: "c1", role: "pflege", supplier_company_id: USER };
    const mailArgs = [];
    const sendMail = async (to, subject, html) => { mailArgs.push({ to, subject, html }); return true; };

    const pool = trackingPool((sql) => {
      if (sql.includes("FROM sla_search_jobs\n") || /SELECT \*\s+FROM sla_search_jobs/.test(sql)) {
        return { rows: [job], rowCount: 1 };
      }
      if (sql.includes("FROM capacity_posts")) return { rows: [cap], rowCount: 1 };
      if (sql.includes("INSERT INTO sla_search_matches")) return { rows: [], rowCount: 1 };
      if (sql.includes("first_matching_attempt_at")) return { rows: [{ id: JOB }], rowCount: 1 };
      if (sql.includes("SELECT email FROM users")) return { rows: [{ email: "x@y.de" }], rowCount: 1 };
      if (sql.includes("first_notification_sent_at")) return { rows: [{ id: JOB }], rowCount: 1 };
      if (sql.includes("INSERT INTO match_alerts")) return { rows: [], rowCount: 1 };
      if (sql.includes("sla_status = 'MET'")) return { rows: [{ id: JOB }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    const res = await runSearchJobsBatch(pool, sendMail, 50);
    assert.deepStrictEqual(res, { processed: 1 });
    assert.strictEqual(mailArgs.length, 1);
    assert.strictEqual(mailArgs[0].to, "x@y.de");
    assert.match(mailArgs[0].subject, /Personal passt/);
    // alert created with matchCount and owner
    const alert = pool.calls.find((c) => c.sql.includes("INSERT INTO match_alerts"));
    assert.deepStrictEqual(alert.params, [OWNER, JOB, 1]);
    // SLA marked met (within due window + matches)
    assert.ok(pool.calls.some((c) => c.sql.includes("sla_status = 'MET'")));
  });

  it("does not mark SLA met when due date already passed", async () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    const job = {
      id: JOB, owner_company_id: OWNER, status: "open", target_type: "CAPACITY",
      role: "pflege", title: "T", sla_status: "RUNNING", sla_due_at: past
    };
    const cap = { id: "c1", role: "pflege", supplier_company_id: USER };
    const pool = trackingPool((sql) => {
      if (/SELECT \*\s+FROM sla_search_jobs/.test(sql)) return { rows: [job], rowCount: 1 };
      if (sql.includes("FROM capacity_posts")) return { rows: [cap], rowCount: 1 };
      if (sql.includes("first_matching_attempt_at")) return { rows: [{ id: JOB }], rowCount: 1 };
      if (sql.includes("INSERT INTO match_alerts")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    await runSearchJobsBatch(pool, null, 50);
    assert.ok(!pool.calls.some((c) => c.sql.includes("sla_status = 'MET'")));
  });

  it("skips a recipient when no email is found, no notification recorded", async () => {
    const job = {
      id: JOB, owner_company_id: OWNER, status: "open", target_type: "DEMAND",
      role: "pflege", title: "T", sla_status: null, sla_due_at: null
    };
    const demand = { id: "d1", role: "pflege", requester_company_id: USER };
    let notifRecorded = false;
    const sendMail = async () => true;
    const pool = trackingPool((sql) => {
      if (/SELECT \*\s+FROM sla_search_jobs/.test(sql)) return { rows: [job], rowCount: 1 };
      if (sql.includes("FROM demand_requests")) return { rows: [demand], rowCount: 1 };
      if (sql.includes("first_matching_attempt_at")) return { rows: [{ id: JOB }], rowCount: 1 };
      if (sql.includes("SELECT email FROM users")) return { rows: [], rowCount: 0 }; // no email
      if (sql.includes("first_notification_sent_at")) { notifRecorded = true; return { rows: [{ id: JOB }], rowCount: 1 }; }
      if (sql.includes("INSERT INTO match_alerts")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const res = await runSearchJobsBatch(pool, sendMail, 50);
    assert.deepStrictEqual(res, { processed: 1 });
    assert.strictEqual(notifRecorded, false);
  });

  it("swallows mail send errors and still completes (no notification recorded)", async () => {
    const job = {
      id: JOB, owner_company_id: OWNER, status: "open", target_type: "CAPACITY",
      role: "pflege", title: "T", sla_status: null, sla_due_at: null
    };
    const cap = { id: "c1", role: "pflege", supplier_company_id: USER };
    const sendMail = async () => { throw new Error("smtp down"); };
    let notifRecorded = false;
    const pool = trackingPool((sql) => {
      if (/SELECT \*\s+FROM sla_search_jobs/.test(sql)) return { rows: [job], rowCount: 1 };
      if (sql.includes("FROM capacity_posts")) return { rows: [cap], rowCount: 1 };
      if (sql.includes("first_matching_attempt_at")) return { rows: [{ id: JOB }], rowCount: 1 };
      if (sql.includes("SELECT email FROM users")) return { rows: [{ email: "a@b.de" }], rowCount: 1 };
      if (sql.includes("first_notification_sent_at")) { notifRecorded = true; return { rows: [{ id: JOB }], rowCount: 1 }; }
      if (sql.includes("INSERT INTO match_alerts")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const res = await runSearchJobsBatch(pool, sendMail, 50);
    assert.deepStrictEqual(res, { processed: 1 });
    assert.strictEqual(notifRecorded, false);
  });

  it("does not send mail when sendMail is not a function", async () => {
    const job = {
      id: JOB, owner_company_id: OWNER, status: "open", target_type: "CAPACITY",
      role: "pflege", title: "T", sla_status: null, sla_due_at: null
    };
    const cap = { id: "c1", role: "pflege", supplier_company_id: USER };
    let emailLookup = false;
    const pool = trackingPool((sql) => {
      if (/SELECT \*\s+FROM sla_search_jobs/.test(sql)) return { rows: [job], rowCount: 1 };
      if (sql.includes("FROM capacity_posts")) return { rows: [cap], rowCount: 1 };
      if (sql.includes("first_matching_attempt_at")) return { rows: [{ id: JOB }], rowCount: 1 };
      if (sql.includes("SELECT email FROM users")) { emailLookup = true; return { rows: [{ email: "a@b.de" }], rowCount: 1 }; }
      if (sql.includes("INSERT INTO match_alerts")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const res = await runSearchJobsBatch(pool, "not-a-fn", 50);
    assert.deepStrictEqual(res, { processed: 1 });
    // mail block guarded by typeof sendMail === "function" → email lookup never happens
    assert.strictEqual(emailLookup, false);
    // alert still created because matchCount > 0
    assert.ok(pool.calls.some((c) => c.sql.includes("INSERT INTO match_alerts")));
  });
});

// ═══════════════════════════════════════════════════════════════
// Match alerts
// ═══════════════════════════════════════════════════════════════

describe("createMatchAlert", () => {
  it("inserts user_id, job_id, match_count", async () => {
    const pool = trackingPool();
    await createMatchAlert(pool, USER, JOB, 7);
    assert.match(pool.calls[0].sql, /INSERT INTO match_alerts/);
    assert.deepStrictEqual(pool.calls[0].params, [USER, JOB, 7]);
  });
});

describe("getUnreadAlerts", () => {
  it("returns unread alerts joined to jobs, scoped to user, LIMIT 50", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: "a1" }], rowCount: 1 }));
    const rows = await getUnreadAlerts(pool, USER);
    assert.strictEqual(rows.length, 1);
    assert.match(pool.calls[0].sql, /WHERE ma\.user_id = \$1 AND ma\.is_read = FALSE/);
    assert.match(pool.calls[0].sql, /LIMIT 50/);
    assert.deepStrictEqual(pool.calls[0].params, [USER]);
  });
});

describe("getUnreadAlertCount", () => {
  it("returns the integer count", async () => {
    const pool = trackingPool(() => ({ rows: [{ count: 4 }], rowCount: 1 }));
    const count = await getUnreadAlertCount(pool, USER);
    assert.strictEqual(count, 4);
  });

  it("returns 0 when no row is present", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const count = await getUnreadAlertCount(pool, USER);
    assert.strictEqual(count, 0);
  });
});

describe("markAlertRead", () => {
  it("marks one alert read and returns the row (owner-scoped)", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: "a1", is_read: true }], rowCount: 1 }));
    const row = await markAlertRead(pool, "a1", USER);
    assert.strictEqual(row.is_read, true);
    assert.match(pool.calls[0].sql, /WHERE id = \$1 AND user_id = \$2/);
    assert.deepStrictEqual(pool.calls[0].params, ["a1", USER]);
  });

  it("returns null when the alert does not belong to the user", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const row = await markAlertRead(pool, "a1", USER);
    assert.strictEqual(row, null);
  });
});

describe("markAllAlertsRead", () => {
  it("returns {updated:<rowCount>} for the user", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 3 }));
    const res = await markAllAlertsRead(pool, USER);
    assert.deepStrictEqual(res, { updated: 3 });
    assert.match(pool.calls[0].sql, /SET is_read = TRUE WHERE user_id = \$1 AND is_read = FALSE/);
    assert.deepStrictEqual(pool.calls[0].params, [USER]);
  });
});
