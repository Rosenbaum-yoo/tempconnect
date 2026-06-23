/**
 * Match Alert Service — comprehensive BEHAVIOR coverage suite.
 *
 * Covers every exported function in services/matchAlertService.js:
 *   - EVENT_CATEGORY_MAP (shape / mapping)
 *   - getUserPreferences (defaults, urgency override, stored prefs, emergency.*)
 *   - isDuplicateAlert (dup / no dup, SQL params)
 *   - createMatchAlertRecord (insert, dedup skip, severity, reasons cap, defaults)
 *   - triggerRequisitionMatchAlerts (no-match branch, error branch)
 *   - triggerCapacityMatchAlerts (no-match branch, error branch)
 *   - buildAlertMessage (all templates, urgency prefix, fallback)
 *   - buildMatchAlertEmailHtml (urgency banner, reasons, score color, CTA link)
 *   - getMatchAlerts (filters, ordering, limit clamp, unread count)
 *   - getMatchAlertUnreadCount
 *   - markMatchAlertRead
 *   - markAllMatchAlertsRead
 *
 * Asserts return values, thrown/caught errors, SQL shape + bound params, branches.
 * No DB — tracking / mock pools only.
 *
 * Run: node --test --test-force-exit test/matchAlertService.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EVENT_CATEGORY_MAP,
  getUserPreferences,
  isDuplicateAlert,
  createMatchAlertRecord,
  triggerRequisitionMatchAlerts,
  triggerCapacityMatchAlerts,
  buildAlertMessage,
  buildMatchAlertEmailHtml,
  getMatchAlerts,
  getMatchAlertUnreadCount,
  markMatchAlertRead,
  markAllMatchAlertsRead
} from "../services/matchAlertService.js";

const UUID = "00000000-0000-4000-8000-000000000001";
const UUID2 = "00000000-0000-4000-8000-000000000002";

/**
 * Tracking pool: records every {sql,params} and dispatches via a handler that
 * matches on SQL substrings. Returns {rows:[],rowCount:0} by default so any
 * (dynamically imported) downstream service running against this pool degrades
 * gracefully rather than throwing.
 */
function trackingPool(handler) {
  const calls = [];
  const query = async (sql, params) => {
    const s = String(sql);
    calls.push({ sql: s, params: params || [] });
    const out = handler ? handler(s, params || [], calls) : undefined;
    return out === undefined ? { rows: [], rowCount: 0 } : out;
  };
  const pool = { calls, query, connect: async () => ({ query, release() {} }) };
  return pool;
}

// ═══════════════════════════════════════════════════════════════
// EVENT_CATEGORY_MAP
// ═══════════════════════════════════════════════════════════════

describe("EVENT_CATEGORY_MAP", () => {
  it("maps known events to their preference category", () => {
    assert.equal(EVENT_CATEGORY_MAP["capacity.match_found"], "match_alerts");
    assert.equal(EVENT_CATEGORY_MAP["requisition.approved"], "requisition_updates");
    assert.equal(EVENT_CATEGORY_MAP["deal.completed"], "deals");
    assert.equal(EVENT_CATEGORY_MAP["compliance.expiring"], "compliance");
    assert.equal(EVENT_CATEGORY_MAP["timesheet.submitted"], "timesheet_updates");
  });

  it("has no mapping for an unknown event key", () => {
    assert.equal(EVENT_CATEGORY_MAP["does.not.exist"], undefined);
  });
});

// ═══════════════════════════════════════════════════════════════
// getUserPreferences
// ═══════════════════════════════════════════════════════════════

describe("getUserPreferences", () => {
  it("returns defaults (inApp=true, email=false) when no preference row exists", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const prefs = await getUserPreferences(pool, UUID, "capacity.match_found", "normal");
    assert.deepEqual(prefs, { inApp: true, email: false });
  });

  it("queries notification_preferences with the mapped category", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    await getUserPreferences(pool, UUID, "requisition.approved", "normal");
    const call = pool.calls[0];
    assert.match(call.sql, /FROM notification_preferences/);
    assert.deepEqual(call.params, [UUID, "requisition_updates"]);
  });

  it("falls back to 'match_alerts' category for an unknown event key", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    await getUserPreferences(pool, UUID, "totally.unknown", "normal");
    assert.deepEqual(pool.calls[0].params, [UUID, "match_alerts"]);
  });

  it("urgent urgency forces email=true even with no stored preference", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const prefs = await getUserPreferences(pool, UUID, "capacity.match_found", "urgent");
    assert.deepEqual(prefs, { inApp: true, email: true });
  });

  it("notdienst / critical urgency also forces email=true", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const nd = await getUserPreferences(pool, UUID, "capacity.match_found", "NOTDIENST");
    const cr = await getUserPreferences(pool, UUID, "capacity.match_found", "Critical");
    assert.equal(nd.email, true);
    assert.equal(cr.email, true);
  });

  it("emergency.* event key forces email even when urgency is normal", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const prefs = await getUserPreferences(pool, UUID, "emergency.request_created", "normal");
    assert.equal(prefs.email, true);
  });

  it("honors stored preferences for non-urgent events", async () => {
    const pool = trackingPool(() => ({
      rows: [{ channel_in_app: false, channel_email: true }], rowCount: 1
    }));
    const prefs = await getUserPreferences(pool, UUID, "capacity.match_found", "normal");
    assert.deepEqual(prefs, { inApp: false, email: true });
  });

  it("inApp is true unless channel_in_app is explicitly false", async () => {
    const pool = trackingPool(() => ({
      rows: [{ channel_in_app: null, channel_email: false }], rowCount: 1
    }));
    const prefs = await getUserPreferences(pool, UUID, "capacity.match_found", "normal");
    assert.equal(prefs.inApp, true);
    assert.equal(prefs.email, false);
  });

  it("urgent overrides a stored email=false preference", async () => {
    const pool = trackingPool(() => ({
      rows: [{ channel_in_app: true, channel_email: false }], rowCount: 1
    }));
    const prefs = await getUserPreferences(pool, UUID, "capacity.match_found", "urgent");
    assert.equal(prefs.email, true);
  });
});

// ═══════════════════════════════════════════════════════════════
// isDuplicateAlert
// ═══════════════════════════════════════════════════════════════

describe("isDuplicateAlert", () => {
  it("returns true when a matching alert exists in the dedup window", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: "alert-1" }], rowCount: 1 }));
    const dup = await isDuplicateAlert(pool, UUID, "requisition", UUID2);
    assert.equal(dup, true);
  });

  it("returns false when no matching alert exists", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const dup = await isDuplicateAlert(pool, UUID, "requisition", UUID2);
    assert.equal(dup, false);
  });

  it("binds user/source params and constrains by the dedup window", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    await isDuplicateAlert(pool, UUID, "capacity_post", UUID2);
    const call = pool.calls[0];
    assert.match(call.sql, /FROM match_alerts/);
    assert.match(call.sql, /INTERVAL '4 hours'/);
    assert.deepEqual(call.params, [UUID, "capacity_post", UUID2]);
  });
});

// ═══════════════════════════════════════════════════════════════
// createMatchAlertRecord
// ═══════════════════════════════════════════════════════════════

describe("createMatchAlertRecord", () => {
  it("skips creation when a duplicate exists", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("SELECT id FROM match_alerts")) return { rows: [{ id: "x" }], rowCount: 1 };
      return undefined;
    });
    const res = await createMatchAlertRecord(pool, {
      userId: UUID, sourceType: "requisition", sourceId: UUID2
    });
    assert.deepEqual(res, { created: false, alertId: null, skipped: "duplicate" });
    // No INSERT should have been issued
    assert.ok(!pool.calls.some((c) => c.sql.includes("INSERT INTO match_alerts")));
  });

  it("inserts and returns the new alert id (happy path)", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("SELECT id FROM match_alerts")) return { rows: [], rowCount: 0 };
      if (sql.includes("INSERT INTO match_alerts")) return { rows: [{ id: "alert-99" }], rowCount: 1 };
      return undefined;
    });
    const res = await createMatchAlertRecord(pool, {
      userId: UUID, sourceType: "requisition", sourceId: UUID2,
      matchScore: 88, matchReasons: [{ factor: "role" }], urgency: "normal"
    });
    assert.deepEqual(res, { created: true, alertId: "alert-99", skipped: null });
  });

  it("sets severity='urgent' for urgent/notdienst/critical urgency", async () => {
    for (const urgency of ["urgent", "notdienst", "CRITICAL"]) {
      let insertParams = null;
      const pool = trackingPool((sql, params) => {
        if (sql.includes("SELECT id FROM match_alerts")) return { rows: [], rowCount: 0 };
        if (sql.includes("INSERT INTO match_alerts")) {
          insertParams = params;
          return { rows: [{ id: "a" }], rowCount: 1 };
        }
        return undefined;
      });
      await createMatchAlertRecord(pool, {
        userId: UUID, sourceType: "requisition", sourceId: UUID2, urgency
      });
      // severity is the 8th INSERT param (index 7)
      assert.equal(insertParams[7], "urgent", `severity for urgency=${urgency}`);
    }
  });

  it("sets severity='info' for normal urgency and caps reasons to top 3", async () => {
    let insertParams = null;
    const pool = trackingPool((sql, params) => {
      if (sql.includes("SELECT id FROM match_alerts")) return { rows: [], rowCount: 0 };
      if (sql.includes("INSERT INTO match_alerts")) {
        insertParams = params;
        return { rows: [{ id: "a" }], rowCount: 1 };
      }
      return undefined;
    });
    await createMatchAlertRecord(pool, {
      userId: UUID, sourceType: "requisition", sourceId: UUID2,
      urgency: "normal",
      matchReasons: [{ factor: "1" }, { factor: "2" }, { factor: "3" }, { factor: "4" }]
    });
    assert.equal(insertParams[7], "info");
    // match_reasons is the 7th param (index 6) — JSON of top 3
    const reasons = JSON.parse(insertParams[6]);
    assert.equal(reasons.length, 3);
  });

  it("applies defaults: matchCount=1, jobId=null, score=null, reasons=null", async () => {
    let insertParams = null;
    const pool = trackingPool((sql, params) => {
      if (sql.includes("SELECT id FROM match_alerts")) return { rows: [], rowCount: 0 };
      if (sql.includes("INSERT INTO match_alerts")) {
        insertParams = params;
        return { rows: [{ id: "a" }], rowCount: 1 };
      }
      return undefined;
    });
    await createMatchAlertRecord(pool, {
      userId: UUID, sourceType: "search_job", sourceId: UUID2
    });
    // [userId, jobId, matchCount, sourceType, sourceId, matchScore, reasons, severity]
    assert.equal(insertParams[0], UUID);
    assert.equal(insertParams[1], null);   // jobId
    assert.equal(insertParams[2], 1);      // matchCount default
    assert.equal(insertParams[3], "search_job");
    assert.equal(insertParams[5], null);   // matchScore
    assert.equal(insertParams[6], null);   // reasons
  });

  it("returns alertId=null when INSERT returns no row", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("SELECT id FROM match_alerts")) return { rows: [], rowCount: 0 };
      if (sql.includes("INSERT INTO match_alerts")) return { rows: [], rowCount: 0 };
      return undefined;
    });
    const res = await createMatchAlertRecord(pool, {
      userId: UUID, sourceType: "requisition", sourceId: UUID2
    });
    assert.equal(res.created, true);
    assert.equal(res.alertId, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// triggerRequisitionMatchAlerts
// ═══════════════════════════════════════════════════════════════

describe("triggerRequisitionMatchAlerts", () => {
  it("returns { alerted: 0 } when matching engine finds no candidates", async () => {
    // autoMatchRequisition -> matchRequisition: with an empty/incomplete
    // requisitionData against an empty pool, no candidate rows are produced.
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const res = await triggerRequisitionMatchAlerts(pool, UUID, { org_id: UUID2 });
    assert.deepEqual(res, { alerted: 0 });
  });

  it("catches downstream errors and returns { alerted: 0, error }", async () => {
    // A pool whose query throws will surface inside autoMatchRequisition,
    // which the try/catch converts into an error result.
    const pool = {
      query: async () => { throw new Error("db exploded"); },
      connect: async () => ({ query: async () => { throw new Error("db exploded"); }, release() {} })
    };
    const res = await triggerRequisitionMatchAlerts(pool, UUID, { org_id: UUID2 });
    assert.equal(res.alerted, 0);
    assert.equal(res.error, "db exploded");
  });
});

// ═══════════════════════════════════════════════════════════════
// triggerCapacityMatchAlerts
// ═══════════════════════════════════════════════════════════════

describe("triggerCapacityMatchAlerts", () => {
  it("returns { alerted: 0 } when the capacity post has no matches", async () => {
    // matchCapacityToRequisitions returns [] when the capacity post is not found.
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const res = await triggerCapacityMatchAlerts(pool, UUID, { title: "Pflege" });
    assert.deepEqual(res, { alerted: 0 });
  });

  it("catches downstream errors and returns { alerted: 0, error }", async () => {
    const pool = {
      query: async () => { throw new Error("boom"); },
      connect: async () => ({ query: async () => { throw new Error("boom"); }, release() {} })
    };
    const res = await triggerCapacityMatchAlerts(pool, UUID, { title: "Pflege" });
    assert.equal(res.alerted, 0);
    assert.equal(res.error, "boom");
  });
});

// ═══════════════════════════════════════════════════════════════
// buildAlertMessage
// ═══════════════════════════════════════════════════════════════

describe("buildAlertMessage", () => {
  it("builds a requisition message with title, location and score", () => {
    const msg = buildAlertMessage("requisition", { title: "Pflegekraft", location_city: "Kiel" }, 75, "normal");
    assert.match(msg, /Neue passende Anforderung/);
    assert.match(msg, /Pflegekraft/);
    assert.match(msg, /Kiel/);
    assert.match(msg, /Score: 75%/);
  });

  it("prefixes urgent/notdienst messages with the DRINGEND marker", () => {
    const urgent = buildAlertMessage("requisition", { title: "X" }, 50, "urgent");
    const nd = buildAlertMessage("requisition", { title: "X" }, 50, "notdienst");
    assert.match(urgent, /DRINGEND/);
    assert.match(nd, /DRINGEND/);
  });

  it("uses role as title fallback and 'Unbekannt' when neither present", () => {
    const byRole = buildAlertMessage("capacity_post", { role: "Arzt" }, 0, "normal");
    assert.match(byRole, /Arzt/);
    const unknown = buildAlertMessage("capacity_post", {}, 0, "normal");
    assert.match(unknown, /Unbekannt/);
  });

  it("renders capacity_post, demand_request and search_job templates", () => {
    assert.match(buildAlertMessage("capacity_post", { title: "T" }, 10, "n"), /Kapazitaetsangebot/);
    assert.match(buildAlertMessage("demand_request", { title: "T" }, 10, "n"), /Nachfrage/);
    assert.match(buildAlertMessage("search_job", { title: "T" }, 10, "n"), /Suchauftrag/);
  });

  it("falls back to a generic message for an unknown source type", () => {
    const msg = buildAlertMessage("mystery", { title: "T" }, 33, "normal");
    assert.match(msg, /Neuer Match gefunden/);
    assert.match(msg, /Score: 33%/);
  });

  it("omits the score text when score is falsy", () => {
    const msg = buildAlertMessage("requisition", { title: "T" }, 0, "normal");
    assert.ok(!/Score:/.test(msg));
  });
});

// ═══════════════════════════════════════════════════════════════
// buildMatchAlertEmailHtml
// ═══════════════════════════════════════════════════════════════

describe("buildMatchAlertEmailHtml", () => {
  it("renders a valid HTML doc with title, score and the source-specific CTA", () => {
    const html = buildMatchAlertEmailHtml({
      sourceType: "requisition",
      sourceData: { title: "Pflegekraft", role: "Pflege", location_city: "Kiel" },
      matchScore: 82,
      matchReasons: [],
      urgency: "normal"
    });
    assert.match(html, /<!DOCTYPE html>/);
    assert.match(html, /Pflegekraft/);
    assert.match(html, /Match-Score: 82%/);
    assert.match(html, /\/public\/requisitions\.html/);
    // non-urgent → no urgency banner
    assert.ok(!/DRINGEND/.test(html));
  });

  it("includes the urgency banner for notdienst with NOTDIENST label", () => {
    const html = buildMatchAlertEmailHtml({
      sourceType: "capacity_post", sourceData: { title: "X" },
      matchScore: 10, matchReasons: [], urgency: "notdienst"
    });
    assert.match(html, /DRINGEND/);
    assert.match(html, /NOTDIENST/);
    assert.match(html, /capacity_exchange_feed\.html/);
  });

  it("renders up to 3 reason rows with factor/detail/points", () => {
    const html = buildMatchAlertEmailHtml({
      sourceType: "demand_request",
      sourceData: { title: "X" },
      matchScore: 60,
      matchReasons: [
        { factor: "Rolle", detail: "passt", points: 30, max: 40 },
        { factor: "Ort", detail: "nah", points: 20, max: 30 },
        { factor: "Skills", detail: "ok", points: 10, max: 20 },
        { factor: "Extra", detail: "ignored", points: 5, max: 5 }
      ],
      urgency: "normal"
    });
    assert.match(html, /Rolle/);
    assert.match(html, /30\/40/);
    assert.match(html, /marketplace\.html/);
    // 4th reason capped out
    assert.ok(!/ignored/.test(html));
  });

  it("uses the dashboard fallback CTA for an unknown source type", () => {
    const html = buildMatchAlertEmailHtml({
      sourceType: "weird", sourceData: { title: "X" }, matchScore: 0, matchReasons: [], urgency: "normal"
    });
    assert.match(html, /\/public\/dashboard\.html/);
    assert.match(html, /Match-Score: 0%/);
  });

  it("picks the green score color for high scores (>=70)", () => {
    const html = buildMatchAlertEmailHtml({
      sourceType: "search_job", sourceData: { title: "X" }, matchScore: 90, matchReasons: [], urgency: "normal"
    });
    assert.match(html, /#16a34a/);
    assert.match(html, /sla_search_jobs\.html/);
  });

  it("uses role as title fallback when no title is provided", () => {
    const html = buildMatchAlertEmailHtml({
      sourceType: "requisition", sourceData: { role: "Notarzt" }, matchScore: 5, matchReasons: [], urgency: "normal"
    });
    assert.match(html, /Notarzt/);
  });
});

// ═══════════════════════════════════════════════════════════════
// getMatchAlerts
// ═══════════════════════════════════════════════════════════════

describe("getMatchAlerts", () => {
  it("returns items + unread_count for a plain user query", async () => {
    const items = [{ id: "a1" }, { id: "a2" }];
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM match_alerts ma")) return { rows: items, rowCount: items.length };
      if (sql.includes("COUNT(*)")) return { rows: [{ count: 7 }], rowCount: 1 };
      return undefined;
    });
    const res = await getMatchAlerts(pool, UUID);
    assert.deepEqual(res.items, items);
    assert.equal(res.unread_count, 7);
  });

  it("binds the base user filter and default limit/offset", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM match_alerts ma")) return { rows: [], rowCount: 0 };
      if (sql.includes("COUNT(*)")) return { rows: [{ count: 0 }], rowCount: 1 };
      return undefined;
    });
    await getMatchAlerts(pool, UUID);
    const listCall = pool.calls.find((c) => c.sql.includes("FROM match_alerts ma"));
    assert.match(listCall.sql, /ma\.user_id = \$1/);
    // params: [userId, limit(50), offset(0)]
    assert.deepEqual(listCall.params, [UUID, 50, 0]);
  });

  it("adds unreadOnly, sourceType and severity filters with correct param order", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM match_alerts ma")) return { rows: [], rowCount: 0 };
      if (sql.includes("COUNT(*)")) return { rows: [{ count: 0 }], rowCount: 1 };
      return undefined;
    });
    await getMatchAlerts(pool, UUID, {
      unreadOnly: true, sourceType: "requisition", severity: "urgent", limit: 10, offset: 5
    });
    const listCall = pool.calls.find((c) => c.sql.includes("FROM match_alerts ma"));
    assert.match(listCall.sql, /ma\.is_read = FALSE/);
    assert.match(listCall.sql, /ma\.source_type = \$2/);
    assert.match(listCall.sql, /ma\.severity = \$3/);
    // [userId, sourceType, severity, limit, offset]
    assert.deepEqual(listCall.params, [UUID, "requisition", "urgent", 10, 5]);
  });

  it("clamps the limit to a maximum of 100", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM match_alerts ma")) return { rows: [], rowCount: 0 };
      if (sql.includes("COUNT(*)")) return { rows: [{ count: 0 }], rowCount: 1 };
      return undefined;
    });
    await getMatchAlerts(pool, UUID, { limit: 5000 });
    const listCall = pool.calls.find((c) => c.sql.includes("FROM match_alerts ma"));
    assert.equal(listCall.params[1], 100);
  });

  it("clamps a negative offset to 0", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM match_alerts ma")) return { rows: [], rowCount: 0 };
      if (sql.includes("COUNT(*)")) return { rows: [{ count: 0 }], rowCount: 1 };
      return undefined;
    });
    await getMatchAlerts(pool, UUID, { offset: -50 });
    const listCall = pool.calls.find((c) => c.sql.includes("FROM match_alerts ma"));
    assert.equal(listCall.params[2], 0);
  });

  it("orders urgent alerts first then by created_at desc", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM match_alerts ma")) return { rows: [], rowCount: 0 };
      if (sql.includes("COUNT(*)")) return { rows: [{ count: 0 }], rowCount: 1 };
      return undefined;
    });
    await getMatchAlerts(pool, UUID);
    const listCall = pool.calls.find((c) => c.sql.includes("FROM match_alerts ma"));
    assert.match(listCall.sql, /CASE WHEN ma\.severity = 'urgent' THEN 0 ELSE 1 END/);
    assert.match(listCall.sql, /ma\.created_at DESC/);
  });

  it("defaults unread_count to 0 when the count query returns nothing", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM match_alerts ma")) return { rows: [], rowCount: 0 };
      if (sql.includes("COUNT(*)")) return { rows: [], rowCount: 0 };
      return undefined;
    });
    const res = await getMatchAlerts(pool, UUID);
    assert.equal(res.unread_count, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// getMatchAlertUnreadCount
// ═══════════════════════════════════════════════════════════════

describe("getMatchAlertUnreadCount", () => {
  it("returns the unread count for the user", async () => {
    const pool = trackingPool(() => ({ rows: [{ count: 4 }], rowCount: 1 }));
    const count = await getMatchAlertUnreadCount(pool, UUID);
    assert.equal(count, 4);
    assert.match(pool.calls[0].sql, /COUNT\(\*\)::int/);
    assert.deepEqual(pool.calls[0].params, [UUID]);
  });

  it("returns 0 when no row is returned", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const count = await getMatchAlertUnreadCount(pool, UUID);
    assert.equal(count, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// markMatchAlertRead
// ═══════════════════════════════════════════════════════════════

describe("markMatchAlertRead", () => {
  it("updates the alert scoped to id + user and returns the row", async () => {
    const row = { id: "a1", is_read: true };
    const pool = trackingPool(() => ({ rows: [row], rowCount: 1 }));
    const res = await markMatchAlertRead(pool, "a1", UUID);
    assert.deepEqual(res, row);
    const call = pool.calls[0];
    assert.match(call.sql, /UPDATE match_alerts SET is_read = TRUE/);
    assert.match(call.sql, /WHERE id = \$1 AND user_id = \$2/);
    assert.deepEqual(call.params, ["a1", UUID]);
  });

  it("returns null when no matching alert is found (wrong owner)", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const res = await markMatchAlertRead(pool, "a1", UUID);
    assert.equal(res, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// markAllMatchAlertsRead
// ═══════════════════════════════════════════════════════════════

describe("markAllMatchAlertsRead", () => {
  it("marks all unread alerts read and returns the updated count", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 9 }));
    const res = await markAllMatchAlertsRead(pool, UUID);
    assert.deepEqual(res, { updated: 9 });
    const call = pool.calls[0];
    assert.match(call.sql, /UPDATE match_alerts SET is_read = TRUE/);
    assert.match(call.sql, /WHERE user_id = \$1 AND is_read = FALSE/);
    assert.deepEqual(call.params, [UUID]);
  });

  it("returns updated:0 when nothing was unread", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const res = await markAllMatchAlertsRead(pool, UUID);
    assert.deepEqual(res, { updated: 0 });
  });
});
