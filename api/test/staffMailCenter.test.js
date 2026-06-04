/**
 * staffMailCenterService tests (Phase E/F).
 * Read-only Aggregat über subscription_notification_log — fake pool, keine echte DB.
 *
 * Run: node --test --test-force-exit test/staffMailCenter.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getMailOverview,
  meta,
  MAIL_STATUSES,
  DISPATCH_CHANNELS
} from "../services/staffMailCenterService.js";

// Fake pool: liefert vorab gequeuete Antworten in Reihenfolge der Aufrufe.
function sequencePool(...responses) {
  let idx = 0;
  const calls = [];
  return {
    calls,
    query: (sql, params) => {
      calls.push({ sql, params });
      if (idx >= responses.length) throw new Error(`Unexpected query #${idx + 1}`);
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

const EMAIL_CAP_KEYS = ["outbound_delivery", "pooled_connections", "bounce_tracking", "dev_logging"];

describe("meta", () => {
  it("exposes mail statuses + dispatch channels for filter UI", () => {
    assert.deepStrictEqual(meta(), {
      mail_statuses: ["ok", "failed", "no_smtp", "skipped"],
      dispatch_channels: ["db", "email", "both", "skipped"]
    });
  });
  it("MAIL_STATUSES / DISPATCH_CHANNELS are the canonical sets", () => {
    assert.deepStrictEqual([...MAIL_STATUSES], ["ok", "failed", "no_smtp", "skipped"]);
    assert.deepStrictEqual([...DISPATCH_CHANNELS], ["db", "email", "both", "skipped"]);
  });
});

describe("getMailOverview — provider + shape", () => {
  it("always includes email provider self-report with capabilities and warnings", async () => {
    const pool = sequencePool({ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] });
    const out = await getMailOverview(pool);

    assert.strictEqual(out.available, true);
    assert.strictEqual(typeof out.email.provider, "string");
    assert.ok(["smtp", "sendgrid", "console", "disabled"].includes(out.email.provider));
    assert.ok(out.email.capabilities && typeof out.email.capabilities === "object");
    for (const k of EMAIL_CAP_KEYS) {
      assert.strictEqual(typeof out.email.capabilities[k], "boolean", `capability ${k}`);
    }
    assert.ok(Array.isArray(out.email.warnings));
    assert.strictEqual(out.scope.platform, true);
    assert.ok(typeof out.generated_at === "string" && out.generated_at.includes("T"));
  });

  it("zero-state: empty log → totals 0, all status/channel buckets present and 0", async () => {
    const pool = sequencePool({ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] });
    const out = await getMailOverview(pool);

    assert.strictEqual(out.totals.events, 0);
    assert.deepStrictEqual(out.recent, []);
    for (const s of MAIL_STATUSES) {
      assert.strictEqual(out.totals.by_status[s], 0, `status ${s}`);
    }
    assert.strictEqual(out.totals.by_status.none, 0, "none bucket present");
    for (const c of DISPATCH_CHANNELS) {
      assert.strictEqual(out.channels[c], 0, `channel ${c}`);
    }
  });
});

describe("getMailOverview — aggregation", () => {
  it("sums statuses (incl. NULL→none), channels, and maps recent with masked recipient", async () => {
    const pool = sequencePool(
      {
        rows: [
          { status: "ok", cnt: 7 },
          { status: "failed", cnt: 2 },
          { status: "none", cnt: 5 } // mail_status IS NULL → in-app-only
        ]
      },
      {
        rows: [
          { via: "both", cnt: 7 },
          { via: "db", cnt: 5 },
          { via: "email", cnt: 2 }
        ]
      },
      {
        rows: [
          {
            id: "log-1", created_at: "2026-06-01T10:00:00Z",
            context_type: "subscription_request", context_id: "ctx-1",
            event_key: "status_offered", recipient_role: "customer",
            recipient_email: "anna.mueller@acme.de", dispatched_via: "both",
            mail_status: "ok", mail_error: null
          },
          {
            id: "log-2", created_at: "2026-05-31T09:00:00Z",
            context_type: "enterprise_request", context_id: "ctx-2",
            event_key: "received", recipient_role: "staff",
            recipient_email: "ops@tempconnect.io", dispatched_via: "email",
            mail_status: "failed", mail_error: "550 5.1.1 user unknown"
          }
        ]
      },
      {
        rows: [
          { event_key: "status_offered", total: 7, failed: 0, no_smtp: 0 },
          { event_key: "received", total: 5, failed: 2, no_smtp: 0 },
          { event_key: "status_active", total: 2, failed: 0, no_smtp: 0 }
        ]
      }
    );
    const out = await getMailOverview(pool);

    assert.strictEqual(out.totals.events, 14);
    assert.strictEqual(out.totals.by_status.ok, 7);
    assert.strictEqual(out.totals.by_status.failed, 2);
    assert.strictEqual(out.totals.by_status.none, 5);
    assert.strictEqual(out.totals.by_status.no_smtp, 0);

    assert.strictEqual(out.channels.both, 7);
    assert.strictEqual(out.channels.db, 5);
    assert.strictEqual(out.channels.email, 2);
    assert.strictEqual(out.channels.skipped, 0);

    assert.strictEqual(out.recent.length, 2);
    const r0 = out.recent[0];
    assert.strictEqual(r0.id, "log-1");
    assert.strictEqual(r0.event_key, "status_offered");
    assert.strictEqual(r0.mail_status, "ok");
    // PII-Maskierung: erste Stelle + Domain, kein vollständiger Local-Part
    assert.strictEqual(r0.recipient, "a***@acme.de");
    assert.ok(!r0.recipient.includes("anna"), "local part not leaked");

    const r1 = out.recent[1];
    assert.strictEqual(r1.mail_status, "failed");
    assert.strictEqual(r1.recipient, "o***@tempconnect.io");
    assert.strictEqual(r1.mail_error, "550 5.1.1 user unknown");

    // Event-Breakdown: pro event_key total + failure/no_smtp-Quote (read-only Aggregat)
    assert.strictEqual(out.events_by_key.length, 3);
    const ev0 = out.events_by_key[0];
    assert.strictEqual(ev0.event_key, "status_offered");
    assert.strictEqual(ev0.total, 7);
    assert.strictEqual(ev0.failed, 0);
    assert.strictEqual(ev0.no_smtp, 0);
    const recv = out.events_by_key.find((e) => e.event_key === "received");
    assert.strictEqual(recv.failed, 2, "failing event surfaces its failure count");
  });

  it("null recipient_email maps to null (no crash)", async () => {
    const pool = sequencePool(
      { rows: [] }, { rows: [] },
      { rows: [{ id: "log-x", created_at: "2026-06-01T00:00:00Z", context_type: "subscription_request", context_id: "c", event_key: "status_active", recipient_role: "customer", recipient_email: null, dispatched_via: "db", mail_status: null, mail_error: null }] },
      { rows: [] }
    );
    const out = await getMailOverview(pool);
    assert.strictEqual(out.recent[0].recipient, null);
    assert.strictEqual(out.recent[0].mail_status, null);
  });
});

describe("getMailOverview — input sanitation", () => {
  it("rejects unknown status (→ null) and clamps oversized limit", async () => {
    const pool = sequencePool({ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] });
    const out = await getMailOverview(pool, { status: "bogus", limit: 9999 });
    assert.strictEqual(out.scope.status, null);
    assert.strictEqual(out.scope.limit, 100);
    assert.strictEqual(out.scope.platform, true);
  });

  it("passes a valid status through and defaults the limit", async () => {
    const pool = sequencePool({ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] });
    const out = await getMailOverview(pool, { status: "failed" });
    assert.strictEqual(out.scope.status, "failed");
    assert.strictEqual(out.scope.limit, 25);
  });

  it("forwards the sanitized status into the recent query as a bound param", async () => {
    const pool = sequencePool({ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] });
    await getMailOverview(pool, { status: "failed", limit: 10 });
    // 3. Query = loadRecent → muss 'failed' als Param enthalten + WHERE mail_status
    const recentCall = pool.calls[2];
    assert.ok(recentCall.params.includes("failed"), "recent query bound to status");
    assert.ok(/mail_status\s*=\s*\$1/.test(recentCall.sql), "parametrized WHERE, no inlined status");
    assert.ok(recentCall.params.includes(10), "limit forwarded as param");
  });

  it("garbage status with no WHERE clause leaves only the limit param", async () => {
    const pool = sequencePool({ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] });
    await getMailOverview(pool, { status: { weird: true } });
    const recentCall = pool.calls[2];
    assert.strictEqual(recentCall.params.length, 1, "only limit param when status rejected");
    assert.ok(!/WHERE/.test(recentCall.sql), "no WHERE clause when status null");
  });
});
