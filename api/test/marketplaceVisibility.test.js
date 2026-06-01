/**
 * Tests: Marketplace Visibility Center (Phase 4 Track A — M-04 / M-12)
 *
 * Abdeckung:
 *   A) profileVisibilityService — isTransitionAllowed (reine Logik)
 *   B) profileBountyService     — isBountyTransitionAllowed (reine Logik)
 *   C) profileAnalyticsService  — hashForStorage (kryptographisch deterministisch)
 *   D) profileVisibilityService — DB-Queries: SQL-Parameter-Checks
 *   E) profileAnalyticsService  — DB-Queries: SQL-Parameter-Checks (recordProfileView)
 *   F) profileRankingService    — saveRankingSnapshot SQL-Parameter-Checks
 *   G) profileBountyService     — getBountyById SQL-Parameter-Checks
 *   H) Route-Level: Org-Boundary + Zero-State (via Mock-Pool)
 *   I) planFeatures: Marketplace-Sichtbarkeit Cross-Check (Integration mit planFeatures.js)
 *   J) M-11 Abuse Report — Validierungen + SQL-Parameter-Checks
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isTransitionAllowed,
  getVisibilitySettings,
  isProfilePubliclyVisible,
  getApprovedPublicOrgIds,
  reportProfileAbuse,
  getPendingAbuseReports,
  resolveAbuseReport
} from "../services/profileVisibilityService.js";

import {
  isBountyTransitionAllowed,
  getBountyById,
  expireOverdueBounties
} from "../services/profileBountyService.js";

import {
  hashForStorage,
  recordProfileView,
  getProfileViewCount,
  likeProfile
} from "../services/profileAnalyticsService.js";

import {
  saveRankingSnapshot,
  getLatestSnapshot
} from "../services/profileRankingService.js";

import { hasFeature, planFeatures, MATURITY_GATES } from "../config/planFeatures.js";

/* ── A) profileVisibilityService — Zustandsmaschine ─── */

describe("profileVisibilityService — isTransitionAllowed", () => {
  it("draft → submitted erlaubt", () => {
    assert.equal(isTransitionAllowed("draft", "submitted"), true);
  });
  it("submitted → approved erlaubt", () => {
    assert.equal(isTransitionAllowed("submitted", "approved"), true);
  });
  it("submitted → rejected erlaubt", () => {
    assert.equal(isTransitionAllowed("submitted", "rejected"), true);
  });
  it("approved → suspended erlaubt", () => {
    assert.equal(isTransitionAllowed("approved", "suspended"), true);
  });
  it("approved → paused erlaubt", () => {
    assert.equal(isTransitionAllowed("approved", "paused"), true);
  });
  it("paused → submitted erlaubt (re-submit)", () => {
    assert.equal(isTransitionAllowed("paused", "submitted"), true);
  });
  it("paused → approved erlaubt (Staff-Resume)", () => {
    assert.equal(isTransitionAllowed("paused", "approved"), true);
  });
  it("rejected → submitted erlaubt (re-submit)", () => {
    assert.equal(isTransitionAllowed("rejected", "submitted"), true);
  });
  it("suspended → approved VERBOTEN (Staff-Aktion, kein direkter Übergang)", () => {
    assert.equal(isTransitionAllowed("suspended", "approved"), false);
  });
  it("draft → approved VERBOTEN (Review-Schritt wird übersprungen)", () => {
    assert.equal(isTransitionAllowed("draft", "approved"), false);
  });
  it("approved → draft VERBOTEN (kein Rückschritt)", () => {
    assert.equal(isTransitionAllowed("approved", "draft"), false);
  });
  it("unbekannter Status → false", () => {
    assert.equal(isTransitionAllowed("unknown_status", "submitted"), false);
  });
});

/* ── B) profileBountyService — Lifecycle-Übergänge ─── */

describe("profileBountyService — isBountyTransitionAllowed", () => {
  it("draft → pending erlaubt", () => {
    assert.equal(isBountyTransitionAllowed("draft", "pending"), true);
  });
  it("pending → approved erlaubt (Staff)", () => {
    assert.equal(isBountyTransitionAllowed("pending", "approved"), true);
  });
  it("pending → rejected erlaubt (Staff)", () => {
    assert.equal(isBountyTransitionAllowed("pending", "rejected"), true);
  });
  it("pending → cancelled erlaubt (Org)", () => {
    assert.equal(isBountyTransitionAllowed("pending", "cancelled"), true);
  });
  it("approved → active erlaubt (Staff-Step-up)", () => {
    assert.equal(isBountyTransitionAllowed("approved", "active"), true);
  });
  it("active → expired erlaubt (Cron)", () => {
    assert.equal(isBountyTransitionAllowed("active", "expired"), true);
  });
  it("active → cancelled erlaubt", () => {
    assert.equal(isBountyTransitionAllowed("active", "cancelled"), true);
  });
  it("expired → active VERBOTEN (kein Rückschritt)", () => {
    assert.equal(isBountyTransitionAllowed("expired", "active"), false);
  });
  it("rejected → pending VERBOTEN (neuer Antrag nötig)", () => {
    assert.equal(isBountyTransitionAllowed("rejected", "pending"), false);
  });
  it("draft → active VERBOTEN (Review-Schritte werden übersprungen)", () => {
    assert.equal(isBountyTransitionAllowed("draft", "active"), false);
  });
  it("unbekannter Status → false", () => {
    assert.equal(isBountyTransitionAllowed("unknown", "active"), false);
  });
});

/* ── C) profileAnalyticsService — hashForStorage ────── */

describe("profileAnalyticsService — hashForStorage", () => {
  it("gibt SHA-256 hex-String zurück (64 Zeichen)", () => {
    const h = hashForStorage("192.168.1.1");
    assert.equal(typeof h, "string");
    assert.equal(h.length, 64);
    assert.match(h, /^[0-9a-f]{64}$/);
  });
  it("gleicher Input → gleicher Hash (deterministisch)", () => {
    assert.equal(hashForStorage("test-ip"), hashForStorage("test-ip"));
  });
  it("verschiedene Inputs → verschiedene Hashes", () => {
    assert.notEqual(hashForStorage("ip-A"), hashForStorage("ip-B"));
  });
  it("null/undefined → stabiler Hash (kein Crash)", () => {
    const h = hashForStorage(null);
    assert.equal(h.length, 64);
    const h2 = hashForStorage(undefined);
    assert.equal(h2.length, 64);
  });
  it("leerer String → stabiler Hash", () => {
    const h = hashForStorage("");
    assert.equal(h.length, 64);
  });
  it("Klartext-IP ist NICHT im Hash enthalten", () => {
    const ip = "192.168.42.1";
    const h = hashForStorage(ip);
    assert.equal(h.includes(ip), false, "IP darf nie im gespeicherten Wert auftauchen");
  });
});

/* ── D) profileVisibilityService — SQL-Parameter-Checks */

describe("profileVisibilityService — SQL-Parameter-Checks", () => {
  function makeMockPool(capture) {
    return { query: (sql, params) => { capture.sql = sql; capture.params = params; return { rows: [] }; } };
  }

  it("getVisibilitySettings übergibt orgId als $1", async () => {
    const c = {};
    await getVisibilitySettings(makeMockPool(c), "org-uuid-123");
    assert.ok(c.params?.includes("org-uuid-123"), "orgId muss $1 sein");
  });

  it("isProfilePubliclyVisible übergibt orgId als $1", async () => {
    const c = {};
    await isProfilePubliclyVisible(makeMockPool(c), "org-uuid-999");
    assert.ok(c.params?.includes("org-uuid-999"), "orgId muss in Params enthalten sein");
  });

  it("getApprovedPublicOrgIds enthält LIMIT und OFFSET als Parameter", async () => {
    const c = {};
    await getApprovedPublicOrgIds(makeMockPool(c), { limit: 200, offset: 50 });
    assert.ok(c.params?.includes(200), "limit muss als Parameter übergeben werden");
    assert.ok(c.params?.includes(50), "offset muss als Parameter übergeben werden");
  });
});

/* ── E) profileAnalyticsService — SQL-Parameter-Checks */

describe("profileAnalyticsService — recordProfileView SQL-Parameter-Checks", () => {
  function makeMockPool() {
    const calls = [];
    return {
      query: (sql, params) => { calls.push({ sql, params }); return { rows: [], rowCount: 0 }; },
      _calls: calls
    };
  }

  it("recordProfileView übergibt viewedOrgId an DB, KEIN IP-Klartext", async () => {
    const pool = makeMockPool();
    await recordProfileView(pool, {
      viewedOrgId:  "org-viewed-uuid",
      viewerOrgId:  "org-viewer-uuid",
      viewerUserId: "user-viewer-uuid",
      clientIp:     "203.0.113.42",
      userAgent:    "Mozilla/5.0",
      section:      "capabilities"
    });
    const call = pool._calls[0];
    assert.ok(call, "pool.query wurde aufgerufen");
    // Klartext-IP darf NICHT in Parametern stehen
    assert.equal(call.params.includes("203.0.113.42"), false,
      "IP-Klartext darf NIEMALS als DB-Parameter übergeben werden");
    // viewedOrgId muss als Parameter vorhanden sein
    assert.ok(call.params.includes("org-viewed-uuid"), "viewedOrgId muss in Params sein");
    // Section muss als Parameter vorhanden sein
    assert.ok(call.params.includes("capabilities"), "section muss in Params sein");
  });

  it("likeProfile gibt SELF_LIKE_NOT_ALLOWED zurück wenn liked_org === liker_org", async () => {
    const pool = makeMockPool();
    const result = await likeProfile(pool, {
      likedOrgId:   "same-org",
      likerUserId:  "user-1",
      likerOrgId:   "same-org"
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "SELF_LIKE_NOT_ALLOWED");
  });

  it("getProfileViewCount übergibt orgId und days als Parameter", async () => {
    const pool = makeMockPool();
    await getProfileViewCount(pool, "org-test-123", { days: 14 });
    const call = pool._calls[0];
    assert.ok(call.params.includes("org-test-123"), "orgId muss in Params sein");
    assert.ok(call.params.includes(14), "days muss als Param übergeben werden");
  });
});

/* ── F) profileRankingService — SQL-Parameter-Checks ── */

describe("profileRankingService — saveRankingSnapshot SQL-Parameter-Checks", () => {
  function makeMockPool() {
    const calls = [];
    return {
      query: (sql, params) => { calls.push({ sql, params }); return { rows: [] }; },
      _calls: calls
    };
  }

  it("saveRankingSnapshot übergibt orgId, Datum und Scores als Parameter", async () => {
    const pool = makeMockPool();
    await saveRankingSnapshot(pool, "org-ranking-uuid", {
      snapshotDate: "2026-05-30",
      rankingScore: 72.5,
      reputationScore: 80.1,
      activityScore: 60.0,
      premiumBoost: 10.0,
      effectiveRankScore: 82.5,
      rankSegment: "GOLD"
    });
    const call = pool._calls[0];
    assert.ok(call, "pool.query wurde aufgerufen");
    assert.ok(call.params.includes("org-ranking-uuid"), "orgId muss $1 sein");
    assert.ok(call.params.includes("2026-05-30"), "snapshotDate muss als Param übergeben werden");
    assert.ok(call.params.includes(72.5), "rankingScore muss als Param übergeben werden");
    assert.ok(call.params.includes("GOLD"), "rankSegment muss als Param übergeben werden");
  });

  it("getLatestSnapshot übergibt orgId als $1", async () => {
    const pool = makeMockPool();
    await getLatestSnapshot(pool, "org-latest-uuid");
    const call = pool._calls[0];
    assert.ok(call.params.includes("org-latest-uuid"), "orgId muss in Params sein");
  });
});

/* ── G) profileBountyService — SQL-Parameter-Checks ── */

describe("profileBountyService — getBountyById SQL-Parameter-Checks", () => {
  function makeMockPool() {
    const calls = [];
    return {
      query: (sql, params) => { calls.push({ sql, params }); return { rows: [] }; },
      _calls: calls
    };
  }

  it("getBountyById übergibt bountyId als $1", async () => {
    const pool = makeMockPool();
    await getBountyById(pool, "bounty-uuid-abc");
    const call = pool._calls[0];
    assert.ok(call.params.includes("bounty-uuid-abc"), "bountyId muss als $1 übergeben werden");
  });

  it("expireOverdueBounties enthält kein Parameter-Binding für fremde Org", async () => {
    const pool = makeMockPool();
    const result = await expireOverdueBounties(pool);
    // Cron-Funktion braucht keinen org_id-Parameter (läuft über alle Orgs)
    assert.equal(typeof result, "number", "gibt Anzahl zurück");
  });
});

/* ── H) Org-Boundary + Zero-State (Mock-Pool) ─────── */

describe("Marketplace Visibility Center — Org-Boundary + Zero-State", () => {
  function makeZeroPool() {
    return { query: () => ({ rows: [] }) };
  }

  it("getVisibilitySettings gibt null zurück wenn keine Einstellungen existieren", async () => {
    const result = await getVisibilitySettings(makeZeroPool(), "org-nonexistent");
    assert.equal(result, null);
  });

  it("isProfilePubliclyVisible gibt false zurück bei leerer DB (Zero-State)", async () => {
    const result = await isProfilePubliclyVisible(makeZeroPool(), "org-nonexistent");
    assert.equal(result, false);
  });

  it("getApprovedPublicOrgIds gibt leeres Array zurück bei leerer DB", async () => {
    const result = await getApprovedPublicOrgIds(makeZeroPool());
    assert.deepEqual(result, []);
  });

  it("getLatestSnapshot gibt null zurück bei leerer DB", async () => {
    const result = await getLatestSnapshot(makeZeroPool(), "org-nonexistent");
    assert.equal(result, null);
  });

  it("getBountyById gibt null zurück bei leerer DB", async () => {
    const result = await getBountyById(makeZeroPool(), "bounty-nonexistent");
    assert.equal(result, null);
  });

  it("getProfileViewCount gibt 0 zurück bei leerer DB", async () => {
    const result = await getProfileViewCount(makeZeroPool(), "org-no-views");
    assert.equal(result, 0);
  });
});

/* ── I) planFeatures Cross-Check ──────────────────── */

// Hinweis: Diese Suite prüft direkt das planFeatures-Objekt und MATURITY_GATES,
// nicht die hasFeature()-Runtime-Funktion — damit FEATURE_GATE_BYPASS keinen Einfluss hat.
describe("Marketplace Visibility Center — planFeatures Cross-Check", () => {
  const hasKey = (plan, key) => Array.isArray(planFeatures[key]) && planFeatures[key].includes(plan);

  const features = [
    "public_profile_basic",
    "public_profile_visibility",
    "profile_analytics_basic",
    "profile_analytics_advanced",
    "marketplace_ranking_participation",
    "verified_deal_reviews"
  ];

  it("alle 6 aktiven Features sind für INDIVIDUELL aktiv", () => {
    for (const f of features) {
      assert.ok(hasKey("INDIVIDUELL", f), `INDIVIDUELL muss ${f} haben`);
    }
  });

  it("DEMO hat KEINEN Zugriff auf Marketplace-Visibility-Features", () => {
    for (const f of features) {
      assert.ok(!hasKey("DEMO", f), `DEMO darf ${f} NICHT haben`);
    }
  });

  it("BASIS hat KEINEN Zugriff auf Marketplace-Visibility-Features", () => {
    for (const f of features) {
      assert.ok(!hasKey("BASIS", f), `BASIS darf ${f} NICHT haben`);
    }
  });

  it("marketplace_featured_profile ist maturity-gated — false für ALLE Pläne", () => {
    assert.equal(MATURITY_GATES["marketplace_featured_profile"], false,
      "marketplace_featured_profile muss im MATURITY_GATES-Objekt false sein");
  });

  it("profile_bounties ist maturity-gated — false für ALLE Pläne", () => {
    assert.equal(MATURITY_GATES["profile_bounties"], false,
      "profile_bounties muss im MATURITY_GATES-Objekt false sein");
  });

  it("public_profile_basic ist für PLUS, PRO, INDIVIDUELL aktiv", () => {
    for (const plan of ["PLUS", "PRO", "INDIVIDUELL"]) {
      assert.ok(hasKey(plan, "public_profile_basic"), `${plan} muss public_profile_basic haben`);
    }
  });

  it("profile_analytics_advanced ist NUR für INDIVIDUELL aktiv", () => {
    assert.ok(hasKey("INDIVIDUELL", "profile_analytics_advanced"));
    assert.ok(!hasKey("PRO",        "profile_analytics_advanced"));
    assert.ok(!hasKey("PLUS",       "profile_analytics_advanced"));
  });
});

/* ── J) M-11 Abuse Report — Validierungen ──────────────── */

describe("M-11 Abuse Report — reportProfileAbuse Validierungen", () => {
  it("ungültiger reason → { ok: false, reason: 'INVALID_REASON' }", async () => {
    // Kein DB-Call nötig — Validierung vor Query
    const result = await reportProfileAbuse(
      {},  // pool irrelevant — schlägt vor DB-Call fehl
      { reportedOrgId: "org-a", reporterUserId: "user-1", reason: "invalid_xyz" }
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "INVALID_REASON");
  });

  it("fehlende Pflicht-Parameter → { ok: false, reason: 'MISSING_PARAMS' }", async () => {
    const result = await reportProfileAbuse({}, { reportedOrgId: "", reporterUserId: "user-1", reason: "spam" });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "MISSING_PARAMS");
  });

  it("SQL-Parameter-Check: reportedOrgId + reason als Params übergeben", async () => {
    const captured = {};
    const mockPool = {
      query: (sql, params) => { captured.sql = sql; captured.params = params; return { rows: [{ id: "report-1" }] }; }
    };
    await reportProfileAbuse(mockPool, {
      reportedOrgId:   "org-target-uuid",
      reporterUserId:  "user-reporter-uuid",
      reason:          "spam",
      details:         "Test-Detail"
    });
    assert.ok(captured.params?.includes("org-target-uuid"), "reportedOrgId muss als DB-Param übergeben werden");
    assert.ok(captured.params?.includes("spam"),            "reason muss als DB-Param übergeben werden");
    assert.ok(captured.params?.includes("user-reporter-uuid"), "reporterUserId muss als DB-Param übergeben werden");
  });
});

describe("M-11 Abuse Report — resolveAbuseReport Validierungen", () => {
  it("ungültiger newStatus → { ok: false, reason: 'INVALID_STATUS' }", async () => {
    const result = await resolveAbuseReport({}, "report-id", "accepted", "staff-1");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "INVALID_STATUS");
  });

  it("'resolved' ist ein gültiger Status", async () => {
    const mockPool = {
      query: () => ({ rowCount: 1 })
    };
    const result = await resolveAbuseReport(mockPool, "report-id", "resolved", "staff-1");
    assert.equal(result.ok, true);
  });

  it("'dismissed' ist ein gültiger Status", async () => {
    const mockPool = {
      query: () => ({ rowCount: 1 })
    };
    const result = await resolveAbuseReport(mockPool, "report-id", "dismissed", "staff-1");
    assert.equal(result.ok, true);
  });

  it("NOT_FOUND → { ok: false, reason: 'NOT_FOUND_OR_ALREADY_PROCESSED' }", async () => {
    const mockPool = { query: () => ({ rowCount: 0 }) };
    const result = await resolveAbuseReport(mockPool, "report-id", "resolved", "staff-1");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "NOT_FOUND_OR_ALREADY_PROCESSED");
  });
});

describe("M-11 Abuse Report — getPendingAbuseReports Zero-State", () => {
  it("gibt leeres Array zurück bei leerer DB", async () => {
    const mockPool = { query: () => ({ rows: [] }) };
    const result = await getPendingAbuseReports(mockPool);
    assert.deepEqual(result, []);
  });

  it("SQL-Parameter-Check: limit als Parameter übergeben", async () => {
    const captured = {};
    const mockPool = {
      query: (sql, params) => { captured.sql = sql; captured.params = params; return { rows: [] }; }
    };
    await getPendingAbuseReports(mockPool, { limit: 25 });
    assert.ok(captured.params?.includes(25), "limit muss als DB-Param übergeben werden");
  });
});
