/**
 * Match Alerts unit tests.
 * Covers: preference-aware dispatch, deduplication, priority escalation,
 * match alert CRUD, email template rendering, message builder.
 *
 * Run: node --test --test-force-exit test/matchAlerts.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getUserPreferences,
  isDuplicateAlert,
  createMatchAlertRecord,
  buildAlertMessage,
  buildMatchAlertEmailHtml,
  getMatchAlerts,
  getMatchAlertUnreadCount,
  markMatchAlertRead,
  markAllMatchAlertsRead,
  EVENT_CATEGORY_MAP
} from "../services/matchAlertService.js";

// ── Mock helpers ──────────────────────────────────────

function mockPool(queryFn) {
  return { query: queryFn };
}

function returnPool(rows = [], rowCount = rows.length) {
  return mockPool(async () => ({ rows, rowCount }));
}

function sequencePool(...responses) {
  let idx = 0;
  return mockPool(async () => {
    if (idx >= responses.length) return { rows: [], rowCount: 0 };
    const resp = responses[idx++];
    if (resp instanceof Error) throw resp;
    return resp;
  });
}

// ═══════════════════════════════════════════════════════
// EVENT_CATEGORY_MAP
// ═══════════════════════════════════════════════════════

describe("matchAlertService — EVENT_CATEGORY_MAP", () => {
  it("maps match events to match_alerts category", () => {
    assert.strictEqual(EVENT_CATEGORY_MAP['capacity.match_found'], 'match_alerts');
    assert.strictEqual(EVENT_CATEGORY_MAP['demand.match_found'], 'match_alerts');
  });

  it("maps requisition events to requisition_updates category", () => {
    assert.strictEqual(EVENT_CATEGORY_MAP['requisition.approved'], 'requisition_updates');
    assert.strictEqual(EVENT_CATEGORY_MAP['requisition.filled'], 'requisition_updates');
  });

  it("maps compliance events to compliance category", () => {
    assert.strictEqual(EVENT_CATEGORY_MAP['compliance.expiring'], 'compliance');
    assert.strictEqual(EVENT_CATEGORY_MAP['compliance.verified'], 'compliance');
  });

  it("maps deal events to deals category", () => {
    assert.strictEqual(EVENT_CATEGORY_MAP['deal.completed'], 'deals');
    assert.strictEqual(EVENT_CATEGORY_MAP['offer.received'], 'deals');
  });
});

// ═══════════════════════════════════════════════════════
// getUserPreferences
// ═══════════════════════════════════════════════════════

describe("matchAlertService — getUserPreferences", () => {
  it("returns defaults when no preference set (in-app=true, email=false)", async () => {
    const pool = returnPool([]);
    const prefs = await getUserPreferences(pool, 'user-1', 'capacity.match_found');
    assert.strictEqual(prefs.inApp, true);
    assert.strictEqual(prefs.email, false);
  });

  it("returns defaults with email=true for urgent cases", async () => {
    const pool = returnPool([]);
    const prefs = await getUserPreferences(pool, 'user-1', 'capacity.match_found', 'urgent');
    assert.strictEqual(prefs.inApp, true);
    assert.strictEqual(prefs.email, true);
  });

  it("returns defaults with email=true for notdienst cases", async () => {
    const pool = returnPool([]);
    const prefs = await getUserPreferences(pool, 'user-1', 'capacity.match_found', 'notdienst');
    assert.strictEqual(prefs.email, true);
  });
  it("returns defaults with email=true for critical cases", async () => {
    const pool = returnPool([]);
    const prefs = await getUserPreferences(pool, 'user-1', 'capacity.match_found', 'critical');
    assert.strictEqual(prefs.email, true);
  });

  it("forces email for emergency event keys", async () => {
    const pool = returnPool([]);
    const prefs = await getUserPreferences(pool, 'user-1', 'emergency.request_created');
    assert.strictEqual(prefs.inApp, true);
    assert.strictEqual(prefs.email, true);
  });

  it("respects user preference when set", async () => {
    const pool = returnPool([{ channel_in_app: true, channel_email: true }]);
    const prefs = await getUserPreferences(pool, 'user-1', 'capacity.match_found');
    assert.strictEqual(prefs.inApp, true);
    assert.strictEqual(prefs.email, true);
  });

  it("respects user opting out of in-app", async () => {
    const pool = returnPool([{ channel_in_app: false, channel_email: false }]);
    const prefs = await getUserPreferences(pool, 'user-1', 'capacity.match_found');
    assert.strictEqual(prefs.inApp, false);
    assert.strictEqual(prefs.email, false);
  });

  it("overrides email preference for urgent even if user opted out", async () => {
    const pool = returnPool([{ channel_in_app: false, channel_email: false }]);
    const prefs = await getUserPreferences(pool, 'user-1', 'capacity.match_found', 'urgent');
    assert.strictEqual(prefs.email, true);
  });

  it("overrides email preference for critical even if user opted out", async () => {
    const pool = returnPool([{ channel_in_app: false, channel_email: false }]);
    const prefs = await getUserPreferences(pool, 'user-1', 'capacity.match_found', 'critical');
    assert.strictEqual(prefs.email, true);
  });

  it("maps unknown event to match_alerts category", async () => {
    let queriedCategory = null;
    const pool = mockPool(async (_sql, params) => {
      queriedCategory = params[1];
      return { rows: [] };
    });
    await getUserPreferences(pool, 'user-1', 'unknown.event');
    assert.strictEqual(queriedCategory, 'match_alerts');
  });
});

// ═══════════════════════════════════════════════════════
// isDuplicateAlert
// ═══════════════════════════════════════════════════════

describe("matchAlertService — isDuplicateAlert", () => {
  it("returns false when no duplicate exists", async () => {
    const pool = returnPool([]);
    const result = await isDuplicateAlert(pool, 'user-1', 'requisition', 'req-1');
    assert.strictEqual(result, false);
  });

  it("returns true when duplicate exists within window", async () => {
    const pool = returnPool([{ id: 'alert-1' }]);
    const result = await isDuplicateAlert(pool, 'user-1', 'requisition', 'req-1');
    assert.strictEqual(result, true);
  });
});

// ═══════════════════════════════════════════════════════
// createMatchAlertRecord
// ═══════════════════════════════════════════════════════

describe("matchAlertService — createMatchAlertRecord", () => {
  it("creates alert when no duplicate", async () => {
    const pool = sequencePool(
      { rows: [], rowCount: 0 },           // isDuplicateAlert → no dup
      { rows: [{ id: 'alert-new' }] }     // INSERT
    );
    const result = await createMatchAlertRecord(pool, {
      userId: 'user-1',
      sourceType: 'requisition',
      sourceId: 'req-1',
      matchScore: 75,
      matchReasons: [{ factor: 'role', points: 30, max: 30, detail: 'Match' }],
      urgency: 'normal',
      matchCount: 1
    });
    assert.strictEqual(result.created, true);
    assert.strictEqual(result.alertId, 'alert-new');
    assert.strictEqual(result.skipped, null);
  });

  it("skips when duplicate exists", async () => {
    const pool = sequencePool(
      { rows: [{ id: 'existing' }] }  // isDuplicateAlert → dup found
    );
    const result = await createMatchAlertRecord(pool, {
      userId: 'user-1',
      sourceType: 'requisition',
      sourceId: 'req-1'
    });
    assert.strictEqual(result.created, false);
    assert.strictEqual(result.skipped, 'duplicate');
  });

  it("sets severity to urgent for notdienst", async () => {
    let insertedSeverity = null;
    const pool = mockPool(async (sql, params) => {
      if (sql.includes('SELECT id FROM match_alerts')) return { rows: [] };
      if (sql.includes('INSERT INTO match_alerts')) {
        insertedSeverity = params[7]; // severity is 8th param (index 7)
        return { rows: [{ id: 'alert-urgent' }] };
      }
      return { rows: [] };
    });
    await createMatchAlertRecord(pool, {
      userId: 'user-1',
      sourceType: 'requisition',
      sourceId: 'req-1',
      urgency: 'notdienst'
    });
    assert.strictEqual(insertedSeverity, 'urgent');
  });

  it("sets severity to urgent for urgent urgency", async () => {
    let insertedSeverity = null;
    const pool = mockPool(async (sql, params) => {
      if (sql.includes('SELECT id FROM match_alerts')) return { rows: [] };
      if (sql.includes('INSERT INTO match_alerts')) {
        insertedSeverity = params[7];
        return { rows: [{ id: 'alert-u' }] };
      }
      return { rows: [] };
    });
    await createMatchAlertRecord(pool, {
      userId: 'user-1',
      sourceType: 'capacity_post',
      sourceId: 'cap-1',
      urgency: 'urgent'
    });
    assert.strictEqual(insertedSeverity, 'urgent');
  });

  it("sets severity to urgent for critical urgency", async () => {
    let insertedSeverity = null;
    const pool = mockPool(async (sql, params) => {
      if (sql.includes('SELECT id FROM match_alerts')) return { rows: [] };
      if (sql.includes('INSERT INTO match_alerts')) {
        insertedSeverity = params[7];
        return { rows: [{ id: 'alert-c' }] };
      }
      return { rows: [] };
    });
    await createMatchAlertRecord(pool, {
      userId: 'user-1',
      sourceType: 'capacity_post',
      sourceId: 'cap-1',
      urgency: 'critical'
    });
    assert.strictEqual(insertedSeverity, 'urgent');
  });

  it("truncates matchReasons to top 3", async () => {
    let insertedReasons = null;
    const pool = mockPool(async (sql, params) => {
      if (sql.includes('SELECT id FROM match_alerts')) return { rows: [] };
      if (sql.includes('INSERT INTO match_alerts')) {
        insertedReasons = params[6]; // match_reasons is 7th param
        return { rows: [{ id: 'a1' }] };
      }
      return { rows: [] };
    });
    await createMatchAlertRecord(pool, {
      userId: 'user-1',
      sourceType: 'requisition',
      sourceId: 'r1',
      matchReasons: [
        { factor: 'role', points: 30 },
        { factor: 'skills', points: 20 },
        { factor: 'location', points: 25 },
        { factor: 'verified', points: 5 },
        { factor: 'vendorPool', points: 5 }
      ]
    });
    const parsed = JSON.parse(insertedReasons);
    assert.strictEqual(parsed.length, 3);
    assert.strictEqual(parsed[0].factor, 'role');
  });
});

// ═══════════════════════════════════════════════════════
// buildAlertMessage
// ═══════════════════════════════════════════════════════

describe("matchAlertService — buildAlertMessage", () => {
  it("builds requisition match message", () => {
    const msg = buildAlertMessage('requisition', { title: 'Pflegekraft', location_city: 'Berlin' }, 85);
    assert.ok(msg.includes('Pflegekraft'));
    assert.ok(msg.includes('Berlin'));
    assert.ok(msg.includes('85%'));
    assert.ok(msg.includes('Anforderung'));
  });

  it("builds capacity post match message", () => {
    const msg = buildAlertMessage('capacity_post', { title: 'Fachkraft Logistik', location_city: 'Hamburg' }, 60);
    assert.ok(msg.includes('Kapazitaetsangebot'));
    assert.ok(msg.includes('Hamburg'));
  });

  it("prepends DRINGEND for urgent", () => {
    const msg = buildAlertMessage('requisition', { title: 'Test' }, 90, 'urgent');
    assert.ok(msg.startsWith('🔴 DRINGEND'));
  });

  it("prepends DRINGEND for notdienst", () => {
    const msg = buildAlertMessage('requisition', { title: 'Test' }, 90, 'notdienst');
    assert.ok(msg.includes('DRINGEND'));
  });

  it("handles missing data gracefully", () => {
    const msg = buildAlertMessage('requisition', {}, null);
    assert.ok(msg.includes('Unbekannt'));
    assert.ok(!msg.includes('Score'));
  });

  it("returns generic message for unknown source type", () => {
    const msg = buildAlertMessage('unknown_type', { title: 'X' }, 50);
    assert.ok(msg.includes('Neuer Match'));
  });

  it("builds search job message", () => {
    const msg = buildAlertMessage('search_job', { title: 'Mein Suchauftrag' }, 70);
    assert.ok(msg.includes('Suchauftrag'));
    assert.ok(msg.includes('Treffer'));
  });
});

// ═══════════════════════════════════════════════════════
// buildMatchAlertEmailHtml
// ═══════════════════════════════════════════════════════

describe("matchAlertService — buildMatchAlertEmailHtml", () => {
  it("renders professional HTML email", () => {
    const html = buildMatchAlertEmailHtml({
      sourceType: 'requisition',
      sourceData: { title: 'Pflegekraft gesucht', role: 'Pflegekraft', location_city: 'Berlin' },
      matchScore: 80,
      matchReasons: [
        { factor: 'role', detail: 'Rolle passt', points: 30, max: 30 },
        { factor: 'skills', detail: '3/5 Skills', points: 15, max: 25 }
      ],
      urgency: 'normal'
    });
    assert.ok(html.includes('TempConnect'));
    assert.ok(html.includes('Match Alert'));
    assert.ok(html.includes('Pflegekraft gesucht'));
    assert.ok(html.includes('Berlin'));
    assert.ok(html.includes('80%'));
    assert.ok(html.includes('role'));
    assert.ok(html.includes('30/30'));
    assert.ok(html.includes('/public/requisitions.html'));
    assert.ok(html.includes('Vermittlungserfolg'));
    assert.ok(!html.includes('DRINGEND'));
  });

  it("renders urgency banner for notdienst", () => {
    const html = buildMatchAlertEmailHtml({
      sourceType: 'capacity_post',
      sourceData: { title: 'Notfall', role: 'Pflege' },
      matchScore: 90,
      matchReasons: [],
      urgency: 'notdienst'
    });
    assert.ok(html.includes('DRINGEND'));
    assert.ok(html.includes('NOTDIENST'));
    assert.ok(html.includes('Schnelles Handeln'));
  });

  it("renders urgency banner for urgent", () => {
    const html = buildMatchAlertEmailHtml({
      sourceType: 'demand_request',
      sourceData: { title: 'Urgent request' },
      matchScore: 75,
      matchReasons: [],
      urgency: 'urgent'
    });
    assert.ok(html.includes('DRINGEND'));
    assert.ok(!html.includes('NOTDIENST'));
  });

  it("uses correct CTA link per source type", () => {
    const reqHtml = buildMatchAlertEmailHtml({ sourceType: 'requisition', sourceData: {}, matchScore: 50, urgency: 'normal' });
    assert.ok(reqHtml.includes('/public/requisitions.html'));

    const capHtml = buildMatchAlertEmailHtml({ sourceType: 'capacity_post', sourceData: {}, matchScore: 50, urgency: 'normal' });
    assert.ok(capHtml.includes('/public/capacity_exchange_feed.html'));

    const demHtml = buildMatchAlertEmailHtml({ sourceType: 'demand_request', sourceData: {}, matchScore: 50, urgency: 'normal' });
    assert.ok(demHtml.includes('/public/marketplace.html'));

    const jobHtml = buildMatchAlertEmailHtml({ sourceType: 'search_job', sourceData: {}, matchScore: 50, urgency: 'normal' });
    assert.ok(jobHtml.includes('/public/sla_search_jobs.html'));
  });

  it("uses green color for high score (>=70)", () => {
    const html = buildMatchAlertEmailHtml({ sourceType: 'requisition', sourceData: {}, matchScore: 85, urgency: 'normal' });
    assert.ok(html.includes('#16a34a'));
  });

  it("uses amber color for medium score (40-69)", () => {
    const html = buildMatchAlertEmailHtml({ sourceType: 'requisition', sourceData: {}, matchScore: 55, urgency: 'normal' });
    assert.ok(html.includes('#d97706'));
  });

  it("uses gray color for low score (<40)", () => {
    const html = buildMatchAlertEmailHtml({ sourceType: 'requisition', sourceData: {}, matchScore: 20, urgency: 'normal' });
    assert.ok(html.includes('#6b7280'));
  });

  it("handles empty match reasons gracefully", () => {
    const html = buildMatchAlertEmailHtml({ sourceType: 'requisition', sourceData: {}, matchScore: 50, matchReasons: [], urgency: 'normal' });
    assert.ok(html.includes('Match-Score'));
  });

  it("limits reasons to 3 in email", () => {
    const reasons = Array.from({ length: 6 }, (_, i) => ({
      factor: `factor_${i}`, detail: `detail_${i}`, points: i * 5, max: 30
    }));
    const html = buildMatchAlertEmailHtml({
      sourceType: 'requisition', sourceData: {}, matchScore: 70,
      matchReasons: reasons, urgency: 'normal'
    });
    // Should only contain first 3 factors
    assert.ok(html.includes('factor_0'));
    assert.ok(html.includes('factor_2'));
    assert.ok(!html.includes('factor_3'));
  });
});

// ═══════════════════════════════════════════════════════
// Match Alert CRUD
// ═══════════════════════════════════════════════════════

describe("matchAlertService — getMatchAlerts", () => {
  it("returns items and unread count", async () => {
    const pool = sequencePool(
      { rows: [{ id: 'a1', user_id: 'u1', severity: 'info', is_read: false }] },
      { rows: [{ count: 3 }] }
    );
    const result = await getMatchAlerts(pool, 'u1');
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.unread_count, 3);
  });

  it("supports unreadOnly filter", async () => {
    let queriedSql = '';
    const pool = mockPool(async (sql) => {
      queriedSql += sql;
      return { rows: [{ count: 0 }] };
    });
    await getMatchAlerts(pool, 'u1', { unreadOnly: true });
    assert.ok(queriedSql.includes('is_read = FALSE'));
  });

  it("supports sourceType filter", async () => {
    let allParams = [];
    const pool = mockPool(async (_sql, params) => {
      allParams.push(...(params || []));
      return { rows: [{ count: 0 }] };
    });
    await getMatchAlerts(pool, 'u1', { sourceType: 'requisition' });
    assert.ok(allParams.includes('requisition'));
  });

  it("orders urgent alerts first", async () => {
    let queriedSql = '';
    const pool = mockPool(async (sql) => {
      queriedSql += sql;
      return { rows: [{ count: 0 }] };
    });
    await getMatchAlerts(pool, 'u1');
    assert.ok(queriedSql.includes("CASE WHEN ma.severity = 'urgent' THEN 0 ELSE 1 END"));
  });
});

describe("matchAlertService — getMatchAlertUnreadCount", () => {
  it("returns count", async () => {
    const pool = returnPool([{ count: 7 }]);
    const count = await getMatchAlertUnreadCount(pool, 'u1');
    assert.strictEqual(count, 7);
  });

  it("returns 0 when no unread", async () => {
    const pool = returnPool([{ count: 0 }]);
    const count = await getMatchAlertUnreadCount(pool, 'u1');
    assert.strictEqual(count, 0);
  });
});

describe("matchAlertService — markMatchAlertRead", () => {
  it("marks alert as read and returns it", async () => {
    const pool = returnPool([{ id: 'a1', is_read: true }]);
    const result = await markMatchAlertRead(pool, 'a1', 'u1');
    assert.strictEqual(result.id, 'a1');
    assert.strictEqual(result.is_read, true);
  });

  it("returns null when alert not found", async () => {
    const pool = returnPool([]);
    const result = await markMatchAlertRead(pool, 'nonexistent', 'u1');
    assert.strictEqual(result, null);
  });
});

describe("matchAlertService — markAllMatchAlertsRead", () => {
  it("returns update count", async () => {
    const pool = returnPool([], 5);
    const result = await markAllMatchAlertsRead(pool, 'u1');
    assert.strictEqual(result.updated, 5);
  });

  it("returns 0 when nothing to update", async () => {
    const pool = returnPool([], 0);
    const result = await markAllMatchAlertsRead(pool, 'u1');
    assert.strictEqual(result.updated, 0);
  });
});

// ═══════════════════════════════════════════════════════
// Preference-aware dispatch integration
// ═══════════════════════════════════════════════════════

describe("matchAlertService — preference + priority integration", () => {
  it("urgent urgency forces email=true even when no preference set", async () => {
    const pool = returnPool([]);
    const prefs = await getUserPreferences(pool, 'u1', 'capacity.match_found', 'urgent');
    assert.strictEqual(prefs.email, true);
    assert.strictEqual(prefs.inApp, true);
  });

  it("urgent urgency forces email=true even when user disabled email", async () => {
    const pool = returnPool([{ channel_in_app: true, channel_email: false }]);
    const prefs = await getUserPreferences(pool, 'u1', 'capacity.match_found', 'urgent');
    assert.strictEqual(prefs.email, true);
  });

  it("normal urgency respects user email=false preference", async () => {
    const pool = returnPool([{ channel_in_app: true, channel_email: false }]);
    const prefs = await getUserPreferences(pool, 'u1', 'capacity.match_found', 'normal');
    assert.strictEqual(prefs.email, false);
  });

  it("normal urgency respects user email=true preference", async () => {
    const pool = returnPool([{ channel_in_app: true, channel_email: true }]);
    const prefs = await getUserPreferences(pool, 'u1', 'capacity.match_found', 'normal');
    assert.strictEqual(prefs.email, true);
  });
});
