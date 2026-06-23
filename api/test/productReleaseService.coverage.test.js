/**
 * Comprehensive behavior coverage for services/productReleaseService.js
 *
 * Mock strategy:
 *  - Pure functions (planTier, entryVisibleForUser) tested directly.
 *  - DB-backed functions driven by a local trackingPool that records {sql, params}
 *    and dispatches via a handler keyed by SQL substrings (robust across the
 *    call graph, since several helpers call loadReleaseContext/getById internally).
 *
 * NOTE: hasFeature() short-circuits to true when FEATURE_GATE_BYPASS === "true".
 * We force it OFF at module load so the required_feature_key branch is real.
 */

process.env.FEATURE_GATE_BYPASS = "false";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as svc from "../services/productReleaseService.js";

/* ── trackingPool: SQL-substring routing ───────────────────────────────── */

function trackingPool(handlers = []) {
  const calls = [];
  const queryFn = async (sql, params) => {
    calls.push({ sql, params });
    for (const h of handlers) {
      if (sql.includes(h.match)) {
        const out = typeof h.respond === "function" ? h.respond(sql, params) : h.respond;
        if (out instanceof Error) throw out;
        return out;
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return {
    calls,
    query: queryFn,
    connect: async () => ({ query: queryFn, release: () => {} })
  };
}

// Standard context-loading handlers used by loadReleaseContext.
function contextHandlers({ userRole = "company", internal = false } = {}) {
  return [
    { match: "FROM users WHERE id =", respond: { rows: [{ id: "u1", role: userRole }] } },
    { match: "AS internal", respond: { rows: [{ internal }] } }
  ];
}

const getPlan = (plan, orgRole = null) => async () => ({ plan, org_role: orgRole });

/* ── planTier ──────────────────────────────────────────────────────────── */

describe("planTier", () => {
  it("maps known plans to their rank", () => {
    assert.equal(svc.planTier("PRO"), 3);
    assert.equal(svc.planTier("ENTERPRISE"), 4);
    assert.equal(svc.planTier("BASIS"), 1);
  });

  it("is case-insensitive", () => {
    assert.equal(svc.planTier("pro"), 3);
  });

  it("defaults to 0 for missing plan", () => {
    assert.equal(svc.planTier(undefined), 0);
    assert.equal(svc.planTier(null), 0);
  });

  it("returns 0 for unknown plan name", () => {
    assert.equal(svc.planTier("WAT"), 0);
  });
});

/* ── entryVisibleForUser ───────────────────────────────────────────────── */

const baseCtx = {
  userRole: "company",
  orgRole: null,
  plan: "PRO",
  isInternalViewer: false
};

const pubRow = (over = {}) => ({
  status: "published",
  visibility: "public",
  published_at: new Date(Date.now() - 1000).toISOString(),
  min_plan: null,
  required_feature_key: null,
  audiences: [],
  ...over
});

describe("entryVisibleForUser", () => {
  it("returns false for nullish row", () => {
    assert.equal(svc.entryVisibleForUser(null, baseCtx), false);
    assert.equal(svc.entryVisibleForUser(undefined, baseCtx), false);
  });

  it("hides draft entries from non-internal viewers", () => {
    assert.equal(svc.entryVisibleForUser(pubRow({ status: "draft" }), baseCtx), false);
  });

  it("shows draft entries to internal viewers", () => {
    const ctx = { ...baseCtx, isInternalViewer: true };
    assert.equal(svc.entryVisibleForUser(pubRow({ status: "draft" }), ctx), true);
  });

  it("hides internal-visibility entries from non-internal viewers", () => {
    assert.equal(svc.entryVisibleForUser(pubRow({ visibility: "internal" }), baseCtx), false);
  });

  it("shows internal-visibility entries to internal viewers", () => {
    const ctx = { ...baseCtx, isInternalViewer: true };
    assert.equal(svc.entryVisibleForUser(pubRow({ visibility: "internal" }), ctx), true);
  });

  it("hides published entry with no published_at", () => {
    assert.equal(svc.entryVisibleForUser(pubRow({ published_at: null }), baseCtx), false);
  });

  it("hides published entry scheduled in the future", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    assert.equal(svc.entryVisibleForUser(pubRow({ published_at: future }), baseCtx), false);
  });

  it("shows published entry whose published_at is in the past", () => {
    assert.equal(svc.entryVisibleForUser(pubRow(), baseCtx), true);
  });

  it("does not apply the future-publish gate to non-published statuses", () => {
    // archived (not draft/internal/published) with future date is still shown
    const future = new Date(Date.now() + 60_000).toISOString();
    assert.equal(
      svc.entryVisibleForUser(pubRow({ status: "archived", published_at: future }), baseCtx),
      true
    );
  });

  it("hides entry when user plan is below min_plan", () => {
    const ctx = { ...baseCtx, plan: "BASIS" };
    assert.equal(svc.entryVisibleForUser(pubRow({ min_plan: "PRO" }), ctx), false);
  });

  it("shows entry when user plan meets min_plan exactly", () => {
    const ctx = { ...baseCtx, plan: "PRO" };
    assert.equal(svc.entryVisibleForUser(pubRow({ min_plan: "PRO" }), ctx), true);
  });

  it("shows entry when user plan exceeds min_plan", () => {
    const ctx = { ...baseCtx, plan: "ENTERPRISE" };
    assert.equal(svc.entryVisibleForUser(pubRow({ min_plan: "PLUS" }), ctx), true);
  });

  it("hides entry when required feature not in plan", () => {
    // 'integrations' is INDIVIDUELL-only; PRO does not have it.
    const ctx = { ...baseCtx, plan: "PRO" };
    assert.equal(
      svc.entryVisibleForUser(pubRow({ required_feature_key: "integrations" }), ctx),
      false
    );
  });

  it("shows entry when required feature is in plan", () => {
    // 'advanced_matching' is granted to PRO.
    const ctx = { ...baseCtx, plan: "PRO" };
    assert.equal(
      svc.entryVisibleForUser(pubRow({ required_feature_key: "advanced_matching" }), ctx),
      true
    );
  });

  it("shows entry to everyone when audiences is empty", () => {
    assert.equal(svc.entryVisibleForUser(pubRow({ audiences: [] }), baseCtx), true);
  });

  it("treats non-array audiences as empty (visible to all)", () => {
    assert.equal(svc.entryVisibleForUser(pubRow({ audiences: null }), baseCtx), true);
  });

  it("matches worker audience to worker role", () => {
    const ctx = { ...baseCtx, userRole: "worker" };
    assert.equal(svc.entryVisibleForUser(pubRow({ audiences: ["worker"] }), ctx), true);
  });

  it("matches admin audience to admin role", () => {
    const ctx = { ...baseCtx, userRole: "admin" };
    assert.equal(svc.entryVisibleForUser(pubRow({ audiences: ["admin"] }), ctx), true);
  });

  it("matches supplier_user audience via orgRole, not userRole", () => {
    const ctx = { ...baseCtx, userRole: "company", orgRole: "supplier_user" };
    assert.equal(svc.entryVisibleForUser(pubRow({ audiences: ["supplier_user"] }), ctx), true);
  });

  it("is case-insensitive and ignores unknown audience keys", () => {
    const ctx = { ...baseCtx, userRole: "company" };
    assert.equal(
      svc.entryVisibleForUser(pubRow({ audiences: ["GARBAGE", "Company"] }), ctx),
      true
    );
  });

  it("hides entry when audiences listed but none match the user", () => {
    const ctx = { ...baseCtx, userRole: "company" };
    assert.equal(svc.entryVisibleForUser(pubRow({ audiences: ["worker", "agency"] }), ctx), false);
  });
});

/* ── loadReleaseContext ────────────────────────────────────────────────── */

describe("loadReleaseContext", () => {
  it("returns null when user does not exist", async () => {
    const pool = trackingPool([{ match: "FROM users WHERE id =", respond: { rows: [] } }]);
    const ctx = await svc.loadReleaseContext(pool, "missing", getPlan("PRO"));
    assert.equal(ctx, null);
  });

  it("builds context from user row + plan + internal flag", async () => {
    const pool = trackingPool(contextHandlers({ userRole: "agency", internal: true }));
    const ctx = await svc.loadReleaseContext(pool, "u1", getPlan("PLUS", "supplier_user"));
    assert.deepEqual(ctx, {
      userId: "u1",
      userRole: "agency",
      orgRole: "supplier_user",
      plan: "PLUS",
      isInternalViewer: true
    });
  });

  it("defaults plan to DEMO and role to company when getUserAndPlan is empty", async () => {
    const pool = trackingPool([
      { match: "FROM users WHERE id =", respond: { rows: [{ id: "u1", role: null }] } },
      { match: "AS internal", respond: { rows: [{ internal: false }] } }
    ]);
    const ctx = await svc.loadReleaseContext(pool, "u1", async () => null);
    assert.equal(ctx.plan, "DEMO");
    assert.equal(ctx.userRole, "company");
    assert.equal(ctx.orgRole, null);
    assert.equal(ctx.isInternalViewer, false);
  });

  it("passes the userId to both queries", async () => {
    const pool = trackingPool(contextHandlers());
    await svc.loadReleaseContext(pool, "abc", getPlan("PRO"));
    assert.ok(pool.calls.every((c) => c.params[0] === "abc"));
  });
});

/* ── listVisibleForUser ────────────────────────────────────────────────── */

function listHandlers(entries, ctxOpts = {}) {
  return [
    ...contextHandlers(ctxOpts),
    { match: "FROM product_release_entries e", respond: { rows: entries } }
  ];
}

describe("listVisibleForUser", () => {
  it("returns [] when context cannot be loaded", async () => {
    const pool = trackingPool([{ match: "FROM users WHERE id =", respond: { rows: [] } }]);
    const out = await svc.listVisibleForUser(pool, "x", getPlan("PRO"));
    assert.deepEqual(out, []);
  });

  it("filters out entries not visible to the user", async () => {
    const visible = pubRow({ id: "a", title: "Visible" });
    const hidden = pubRow({ id: "b", title: "Future", published_at: new Date(Date.now() + 99999).toISOString() });
    const pool = trackingPool(listHandlers([visible, hidden]));
    const out = await svc.listVisibleForUser(pool, "u1", getPlan("PRO"));
    assert.equal(out.length, 1);
    assert.equal(out[0].id, "a");
  });

  it("maps rows and computes is_unread from published + no seen_at", async () => {
    const row = pubRow({ id: "a", title: "T", seen_at: null });
    const pool = trackingPool(listHandlers([row]));
    const out = await svc.listVisibleForUser(pool, "u1", getPlan("PRO"));
    assert.equal(out[0].is_unread, true);
    assert.equal(out[0].title, "T");
    assert.equal(out[0].seen_at, null);
  });

  it("marks entry read (is_unread=false) once seen_at exists", async () => {
    const row = pubRow({ id: "a", seen_at: new Date().toISOString() });
    const pool = trackingPool(listHandlers([row]));
    const out = await svc.listVisibleForUser(pool, "u1", getPlan("PRO"));
    assert.equal(out[0].is_unread, false);
  });

  it("inAppOnly excludes entries with show_in_app === false", async () => {
    const shown = pubRow({ id: "a", show_in_app: true });
    const hiddenInApp = pubRow({ id: "b", show_in_app: false });
    const pool = trackingPool(listHandlers([shown, hiddenInApp]));
    const out = await svc.listVisibleForUser(pool, "u1", getPlan("PRO"), { inAppOnly: true });
    assert.deepEqual(out.map((o) => o.id), ["a"]);
  });

  it("inAppOnly keeps entries where show_in_app is undefined (default in-app)", async () => {
    const row = pubRow({ id: "a" }); // no show_in_app key
    const pool = trackingPool(listHandlers([row]));
    const out = await svc.listVisibleForUser(pool, "u1", getPlan("PRO"), { inAppOnly: true });
    assert.equal(out.length, 1);
  });
});

/* ── getInboxSummary ───────────────────────────────────────────────────── */

describe("getInboxSummary", () => {
  it("counts unseen published in-app entries and previews up to 5", async () => {
    const rows = [];
    for (let i = 0; i < 7; i++) {
      rows.push(pubRow({ id: `e${i}`, title: `t${i}`, seen_at: null, show_in_app: true }));
    }
    const pool = trackingPool(listHandlers(rows));
    const out = await svc.getInboxSummary(pool, "u1", getPlan("PRO"));
    assert.equal(out.unseen_count, 7);
    assert.equal(out.preview.length, 5);
    assert.ok(out.preview.every((p) => "id" in p && "title" in p));
  });

  it("excludes already-seen entries from unseen_count", async () => {
    const seen = pubRow({ id: "a", seen_at: new Date().toISOString() });
    const unseen = pubRow({ id: "b", seen_at: null });
    const pool = trackingPool(listHandlers([seen, unseen]));
    const out = await svc.getInboxSummary(pool, "u1", getPlan("PRO"));
    assert.equal(out.unseen_count, 1);
    assert.equal(out.preview[0].id, "b");
  });

  it("selects highest-priority modal candidate not yet dismissed", async () => {
    const low = pubRow({ id: "low", show_as_modal: true, modal_dismissed_at: null, priority: 1 });
    const high = pubRow({ id: "high", show_as_modal: true, modal_dismissed_at: null, priority: 9 });
    const dismissed = pubRow({ id: "dis", show_as_modal: true, modal_dismissed_at: new Date().toISOString(), priority: 99 });
    const pool = trackingPool(listHandlers([low, high, dismissed]));
    const out = await svc.getInboxSummary(pool, "u1", getPlan("PRO"));
    assert.equal(out.modal.id, "high");
  });

  it("returns modal=null when no modal candidates", async () => {
    const row = pubRow({ id: "a", show_as_modal: false });
    const pool = trackingPool(listHandlers([row]));
    const out = await svc.getInboxSummary(pool, "u1", getPlan("PRO"));
    assert.equal(out.modal, null);
  });
});

/* ── ackSeen / ackModalDismissed ───────────────────────────────────────── */

describe("ackSeen", () => {
  it("upserts with COALESCE on seen_at and passes user+release params", async () => {
    const pool = trackingPool();
    await svc.ackSeen(pool, "u1", "r1");
    const call = pool.calls[0];
    assert.ok(call.sql.includes("INSERT INTO user_product_release_ack"));
    assert.ok(call.sql.includes("seen_at = COALESCE"));
    assert.deepEqual(call.params, ["u1", "r1"]);
  });
});

describe("ackModalDismissed", () => {
  it("upserts modal_dismissed_at with NOW() and passes user+release params", async () => {
    const pool = trackingPool();
    await svc.ackModalDismissed(pool, "u1", "r1");
    const call = pool.calls[0];
    assert.ok(call.sql.includes("modal_dismissed_at = NOW()"));
    assert.deepEqual(call.params, ["u1", "r1"]);
  });
});

/* ── markAllSeenForUser ────────────────────────────────────────────────── */

describe("markAllSeenForUser", () => {
  it("returns 0 and skips write when no published entries visible", async () => {
    const draft = pubRow({ id: "d", status: "draft" }); // hidden from non-internal
    const pool = trackingPool(listHandlers([draft]));
    const n = await svc.markAllSeenForUser(pool, "u1", getPlan("PRO"));
    assert.equal(n, 0);
    assert.ok(!pool.calls.some((c) => c.sql.includes("UNNEST($2::uuid[])")));
  });

  it("bulk-inserts published ids and returns the count", async () => {
    const a = pubRow({ id: "a" });
    const b = pubRow({ id: "b" });
    const pool = trackingPool(listHandlers([a, b]));
    const n = await svc.markAllSeenForUser(pool, "u1", getPlan("PRO"));
    assert.equal(n, 2);
    const bulk = pool.calls.find((c) => c.sql.includes("UNNEST($2::uuid[])"));
    assert.ok(bulk);
    assert.equal(bulk.params[0], "u1");
    assert.deepEqual(bulk.params[1], ["a", "b"]);
  });
});

/* ── listAllAdmin ──────────────────────────────────────────────────────── */

describe("listAllAdmin", () => {
  it("returns mapped rows ordered query", async () => {
    const pool = trackingPool([
      { match: "FROM product_release_entries", respond: { rows: [{ id: "a", title: "X", extra: "drop" }] } }
    ]);
    const out = await svc.listAllAdmin(pool);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, "a");
    assert.equal(out[0].title, "X");
    // mapRow whitelists fields → 'extra' must not leak
    assert.equal("extra" in out[0], false);
    assert.ok(pool.calls[0].sql.includes("ORDER BY created_at DESC"));
  });

  it("returns [] for empty table", async () => {
    const pool = trackingPool();
    const out = await svc.listAllAdmin(pool);
    assert.deepEqual(out, []);
  });
});

/* ── getById ───────────────────────────────────────────────────────────── */

describe("getById", () => {
  it("returns mapped row when found", async () => {
    const pool = trackingPool([
      { match: "WHERE id = $1", respond: { rows: [{ id: "z", title: "Hi" }] } }
    ]);
    const out = await svc.getById(pool, "z");
    assert.equal(out.id, "z");
    assert.equal(out.title, "Hi");
    assert.equal(pool.calls[0].params[0], "z");
  });

  it("returns null when not found", async () => {
    const pool = trackingPool();
    const out = await svc.getById(pool, "nope");
    assert.equal(out, null);
  });
});

/* ── createEntry ───────────────────────────────────────────────────────── */

describe("createEntry", () => {
  it("auto-sets published_at when status published and none provided", async () => {
    let captured;
    const pool = trackingPool([
      { match: "INSERT INTO product_release_entries", respond: (sql, params) => {
        captured = params;
        return { rows: [{ id: "new", title: params[0] }] };
      } }
    ]);
    const out = await svc.createEntry(pool, "creator", { title: "T", status: "published", visibility: "public" });
    assert.equal(out.id, "new");
    // published_at param is index 9 (1-based $10)
    assert.ok(captured[9] instanceof Date);
    assert.equal(captured[14], "creator"); // created_by
  });

  it("keeps published_at null for draft status", async () => {
    let captured;
    const pool = trackingPool([
      { match: "INSERT INTO product_release_entries", respond: (sql, params) => {
        captured = params;
        return { rows: [{ id: "d" }] };
      } }
    ]);
    await svc.createEntry(pool, "c", { title: "T", status: "draft", visibility: "public" });
    assert.equal(captured[9], null);
  });

  it("applies defaults: show_in_app=true, send_email=false, priority=0, show_as_modal=false", async () => {
    let captured;
    const pool = trackingPool([
      { match: "INSERT INTO product_release_entries", respond: (sql, params) => {
        captured = params;
        return { rows: [{ id: "x" }] };
      } }
    ]);
    await svc.createEntry(pool, null, { title: "T", status: "draft", visibility: "public" });
    assert.equal(captured[10], true);  // show_in_app
    assert.equal(captured[11], false); // send_email_on_publish
    assert.equal(captured[12], 0);     // priority
    assert.equal(captured[13], false); // show_as_modal
    assert.equal(captured[14], null);  // created_by null when userId falsy
  });

  it("respects explicit show_in_app=false and email/modal flags", async () => {
    let captured;
    const pool = trackingPool([
      { match: "INSERT INTO product_release_entries", respond: (sql, params) => {
        captured = params;
        return { rows: [{ id: "x" }] };
      } }
    ]);
    await svc.createEntry(pool, "c", {
      title: "T", status: "draft", visibility: "public",
      show_in_app: false, send_email_on_publish: true, show_as_modal: true, priority: 5,
      audiences: ["worker"]
    });
    assert.equal(captured[10], false);
    assert.equal(captured[11], true);
    assert.equal(captured[12], 5);
    assert.equal(captured[13], true);
    assert.deepEqual(captured[4], ["worker"]); // audiences
  });
});

/* ── updateEntry ───────────────────────────────────────────────────────── */

describe("updateEntry", () => {
  it("returns null when entry does not exist", async () => {
    const pool = trackingPool(); // getById -> []
    const out = await svc.updateEntry(pool, "missing", { title: "X" });
    assert.equal(out, null);
  });

  it("merges payload over current values (undefined keeps current)", async () => {
    const current = {
      id: "e1", title: "Old", summary: "OldSum", body: "B", feature_key: "fk",
      audiences: ["worker"], min_plan: "PLUS", required_feature_key: null,
      visibility: "public", status: "draft", published_at: null,
      show_in_app: true, send_email_on_publish: false, priority: 0, show_as_modal: false
    };
    let captured;
    const pool = trackingPool([
      // UPDATE listed first; its match is more specific than the generic getById SELECT match.
      { match: "UPDATE product_release_entries", respond: (sql, params) => {
        captured = params;
        return { rows: [{ ...current, title: "New" }] };
      } },
      { match: "WHERE id = $1", respond: () => ({ rows: [current] }) } // getById (SELECT)
    ]);
    const out = await svc.updateEntry(pool, "e1", { title: "New" });
    assert.equal(out.title, "New");
    // params: $1 id, $2 title, $3 summary ...
    assert.equal(captured[0], "e1");
    assert.equal(captured[1], "New");        // updated
    assert.equal(captured[2], "OldSum");     // summary kept
    assert.deepEqual(captured[5], ["worker"]); // audiences kept
    assert.equal(captured[6], "PLUS");       // min_plan kept
  });

  it("returns null when UPDATE affects no rows", async () => {
    const current = { id: "e1", title: "Old", audiences: [] };
    const pool = trackingPool([
      // UPDATE listed first so its more-specific match wins over the generic SELECT match.
      { match: "UPDATE product_release_entries", respond: { rows: [] } },
      { match: "WHERE id = $1", respond: { rows: [current] } }
    ]);
    const out = await svc.updateEntry(pool, "e1", { title: "x" });
    assert.equal(out, null);
  });
});

/* ── publishEntry ──────────────────────────────────────────────────────── */

describe("publishEntry", () => {
  it("returns mapped row on success and uses COALESCE(published_at, NOW())", async () => {
    const pool = trackingPool([
      { match: "status = 'published'", respond: { rows: [{ id: "p", status: "published" }] } }
    ]);
    const out = await svc.publishEntry(pool, "p");
    assert.equal(out.id, "p");
    assert.equal(out.status, "published");
    assert.ok(pool.calls[0].sql.includes("COALESCE(published_at, NOW())"));
    assert.equal(pool.calls[0].params[0], "p");
  });

  it("returns null when id not found", async () => {
    const pool = trackingPool();
    const out = await svc.publishEntry(pool, "nope");
    assert.equal(out, null);
  });
});

/* ── dispatchReleaseEmails ─────────────────────────────────────────────── */

const noopLogger = { info: () => {} };

describe("dispatchReleaseEmails", () => {
  it("returns {0,0} when entry not found", async () => {
    const pool = trackingPool([
      { match: "FROM product_release_entries WHERE id =", respond: { rows: [] } }
    ]);
    const out = await svc.dispatchReleaseEmails(pool, "x", getPlan("PRO"), async () => true, noopLogger);
    assert.deepEqual(out, { sent: 0, skipped: 0 });
  });

  it("returns {0,0} when entry not published", async () => {
    const pool = trackingPool([
      { match: "FROM product_release_entries WHERE id =", respond: { rows: [{ id: "x", status: "draft" }] } }
    ]);
    const out = await svc.dispatchReleaseEmails(pool, "x", getPlan("PRO"), async () => true, noopLogger);
    assert.deepEqual(out, { sent: 0, skipped: 0 });
  });

  it("returns {0,0} when email already sent", async () => {
    const pool = trackingPool([
      { match: "FROM product_release_entries WHERE id =", respond: { rows: [{ id: "x", status: "published", email_sent_at: new Date().toISOString() }] } }
    ]);
    const out = await svc.dispatchReleaseEmails(pool, "x", getPlan("PRO"), async () => true, noopLogger);
    assert.deepEqual(out, { sent: 0, skipped: 0 });
  });

  it("sends to matching users and skips non-matching, then stamps email_sent_at", async () => {
    const entry = pubRow({
      id: "rel", title: "Big News", summary: "line1\nline2",
      status: "published", email_sent_at: null, audiences: ["company"]
    });
    const users = [
      { id: "u1", email: "a@x.de" },
      { id: "u2", email: "b@x.de" }
    ];
    // u1 = company (matches audience), u2 = worker (does not match)
    const roleByUser = { u1: "company", u2: "worker" };
    const sentTo = [];
    const pool = trackingPool([
      { match: "FROM product_release_entries WHERE id =", respond: { rows: [entry] } },
      { match: "SELECT id, email FROM users", respond: { rows: users } },
      { match: "FROM users WHERE id =", respond: (sql, params) => ({ rows: [{ id: params[0], role: roleByUser[params[0]] }] }) },
      { match: "AS internal", respond: { rows: [{ internal: false }] } },
      { match: "SET email_sent_at = NOW()", respond: { rows: [] } }
    ]);
    const sendMail = async (to, subject, html) => { sentTo.push({ to, subject, html }); return true; };
    const out = await svc.dispatchReleaseEmails(pool, "rel", getPlan("PRO"), sendMail, noopLogger, "https://app.test/");

    assert.equal(out.sent, 1);
    assert.equal(out.skipped, 1);
    assert.equal(sentTo.length, 1);
    assert.equal(sentTo[0].to, "a@x.de");
    assert.equal(sentTo[0].subject, "TempConnect: Big News");
    // newline in summary -> <br/>; baseUrl trailing slash stripped
    assert.ok(sentTo[0].html.includes("<br/>"));
    assert.ok(sentTo[0].html.includes("https://app.test/public/whats-new.html"));
    // email_sent_at stamped exactly once
    const stamp = pool.calls.filter((c) => c.sql.includes("SET email_sent_at = NOW()"));
    assert.equal(stamp.length, 1);
  });

  it("escapes '<' in title/summary to prevent injection into the email HTML", async () => {
    const entry = pubRow({
      id: "rel", title: "<script>x", summary: "<b>hi", status: "published",
      email_sent_at: null, audiences: []
    });
    let html;
    const pool = trackingPool([
      { match: "FROM product_release_entries WHERE id =", respond: { rows: [entry] } },
      { match: "SELECT id, email FROM users", respond: { rows: [{ id: "u1", email: "a@x.de" }] } },
      { match: "FROM users WHERE id =", respond: { rows: [{ id: "u1", role: "company" }] } },
      { match: "AS internal", respond: { rows: [{ internal: false }] } },
      { match: "SET email_sent_at = NOW()", respond: { rows: [] } }
    ]);
    const sendMail = async (to, subject, body) => { html = body; return true; };
    await svc.dispatchReleaseEmails(pool, "rel", getPlan("PRO"), sendMail, noopLogger);
    assert.equal(html.includes("<script>"), false);
    assert.ok(html.includes("script>x")); // '<' stripped, rest remains
  });

  it("counts only successfully delivered mails as sent", async () => {
    const entry = pubRow({ id: "rel", title: "T", status: "published", email_sent_at: null, audiences: [] });
    const pool = trackingPool([
      { match: "FROM product_release_entries WHERE id =", respond: { rows: [entry] } },
      { match: "SELECT id, email FROM users", respond: { rows: [{ id: "u1", email: "a@x.de" }] } },
      { match: "FROM users WHERE id =", respond: { rows: [{ id: "u1", role: "company" }] } },
      { match: "AS internal", respond: { rows: [{ internal: false }] } },
      { match: "SET email_sent_at = NOW()", respond: { rows: [] } }
    ]);
    const out = await svc.dispatchReleaseEmails(pool, "rel", getPlan("PRO"), async () => false, noopLogger);
    // sendMail returns false → not counted as sent, but user matched so not skipped either
    assert.equal(out.sent, 0);
    assert.equal(out.skipped, 0);
  });
});
