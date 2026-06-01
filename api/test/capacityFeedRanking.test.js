import { describe, it } from "node:test";
import assert from "node:assert";
import { browseFeed } from "../services/capacityExchangeService.js";
import { canInteractWithCapacity, canInteractWithDemand } from "../services/capacityInteractionPolicy.js";
import { computePremiumBoost } from "../services/reputationService.js";

function buildMockPool({ supplyRows, demandRows, plans = [] }) {
  return {
    query: async (sql) => {
      if (sql.includes("SELECT COUNT(*)::int AS cnt FROM capacity_posts")) {
        return { rows: [{ cnt: supplyRows.length }] };
      }
      if (sql.includes("cp.id AS capacity_post_id")) {
        return {
          rows: supplyRows.map((row) => ({
            capacity_post_id: row.id,
            committed_headcount: row.committed_headcount ?? 0,
            active_offer_count: row.active_offer_count ?? 0,
            assigned_headcount: row.assigned_headcount ?? 0,
            staffing_reserved_headcount: row.staffing_reserved_headcount ?? 0,
            counterparty_user_ids: row.counterparty_user_ids ?? []
          }))
        };
      }
      if (sql.includes("FROM demand_requests") && sql.includes("COUNT(*)::int AS cnt")) {
        const companyOnly = sql.includes("u.role = 'company'");
        const count = companyOnly ? demandRows.filter(r => r.supplier_role === "company").length : demandRows.length;
        return { rows: [{ cnt: count }] };
      }
      if (sql.includes("FROM capacity_posts cp") && sql.includes("ORDER BY sort_date DESC")) {
        return {
          rows: supplyRows.map((row) => ({
            status: "active",
            visibility_status: "public",
            headcount: 1,
            ...row
          }))
        };
      }
      if (sql.includes("FROM demand_requests dr") && sql.includes("ORDER BY COALESCE(dr.updated_at, dr.created_at) DESC")) {
        const companyOnly = sql.includes("u.role = 'company'");
        return { rows: companyOnly ? demandRows.filter(r => r.supplier_role === "company") : demandRows };
      }
      if (sql.includes("FROM capacity_interactions")) {
        return { rows: [] };
      }
      if (sql.includes("FROM supplier_reputation")) {
        return { rows: [] };
      }
      if (sql.includes("FROM subscriptions")) {
        return { rows: plans };
      }
      return { rows: [] };
    }
  };
}

describe("capacity feed ranking hierarchy", () => {
  it("shows counterparty entries first for agency viewers", async () => {
    const now = new Date().toISOString();
    const pool = buildMockPool({
      supplyRows: [{
        id: "s1", feed_type: "supply", role: "Lagerhelfer", skill_tags: [], location_city: "Berlin",
        location_lat: null, location_lng: null, radius_km: 25, availability_from: "2026-03-20", availability_to: null,
        supplier_company_id: "sup-1", created_at: now, updated_at: now, priority_level: "normal"
      }],
      demandRows: [{
        id: "d1", feed_type: "demand", role: "Lagerhelfer", skill_tags: [], location_city: "Berlin",
        location_lat: null, location_lng: null, radius_km: 25, availability_from: "2026-03-20", availability_to: null,
        supplier_company_id: "cmp-1", supplier_role: "company", created_at: now, updated_at: now, priority_level: "normal"
      }]
    });

    const result = await browseFeed(pool, { viewer_role: "agency", limit: 25, page: 1 });
    assert.strictEqual(result.items[0].feed_type, "demand");
    assert.strictEqual(result.items[0].counterparty_priority, "preferred");
  });

  it("keeps agency-to-agency demand hidden in standard mode", async () => {
    const now = new Date().toISOString();
    const pool = buildMockPool({
      supplyRows: [],
      demandRows: [
        {
          id: "d-company", feed_type: "demand", role: "Lagerhelfer", skill_tags: [], location_city: "Berlin",
          location_lat: null, location_lng: null, radius_km: 25, availability_from: "2026-03-20", availability_to: null,
          supplier_company_id: "cmp-1", supplier_role: "company", created_at: now, updated_at: now, priority_level: "normal"
        },
        {
          id: "d-agency", feed_type: "demand", role: "Lagerhelfer", skill_tags: [], location_city: "Berlin",
          location_lat: null, location_lng: null, radius_km: 25, availability_from: "2026-03-20", availability_to: null,
          supplier_company_id: "ag-2", supplier_role: "agency", created_at: now, updated_at: now, priority_level: "normal"
        }
      ]
    });
    const result = await browseFeed(pool, { viewer_role: "agency", inter_agency_enabled: false, limit: 25, page: 1 });
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0].id, "d-company");
  });

  it("includes and labels agency-to-agency demand when enterprise mode is enabled", async () => {
    const now = new Date().toISOString();
    const pool = buildMockPool({
      supplyRows: [],
      demandRows: [{
        id: "d-agency", feed_type: "demand", role: "Lagerhelfer", skill_tags: [], location_city: "Berlin",
        location_lat: null, location_lng: null, radius_km: 25, availability_from: "2026-03-20", availability_to: null,
        supplier_company_id: "ag-2", supplier_role: "agency", created_at: now, updated_at: now, priority_level: "normal"
      }]
    });
    const result = await browseFeed(pool, {
      viewer_role: "agency",
      inter_agency_enabled: true,
      inter_agency_supply_visible: true,
      limit: 25,
      page: 1
    });
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0].is_inter_agency, true);
    assert.ok(Array.isArray(result.items[0].rank_labels));
    assert.ok(result.items[0].rank_labels.includes("Inter-Agency"));
  });

  it("does not let weak enterprise entries displace strong relevant matches", async () => {
    const now = new Date().toISOString();
    const pool = buildMockPool({
      supplyRows: [
        {
          id: "s-enterprise", feed_type: "supply", role: "Staplerfahrer", skill_tags: ["stapler"], location_city: "Koeln",
          location_lat: null, location_lng: null, radius_km: 25, availability_from: "2026-03-20", availability_to: null,
          supplier_company_id: "sup-enterprise", created_at: now, updated_at: now, priority_level: "normal"
        },
        {
          id: "s-relevant", feed_type: "supply", role: "Lagerhelfer", skill_tags: ["kommissionierung"], location_city: "Berlin",
          location_lat: null, location_lng: null, radius_km: 25, availability_from: "2026-03-20", availability_to: null,
          supplier_company_id: "sup-standard", created_at: now, updated_at: now, priority_level: "normal"
        }
      ],
      demandRows: [],
      plans: [{ user_id: "sup-enterprise", plan: "ENTERPRISE" }]
    });

    const result = await browseFeed(pool, {
      viewer_role: "company",
      role: "Lagerhelfer",
      location_city: "Berlin",
      limit: 25,
      page: 1
    });
    assert.strictEqual(result.items[0].id, "s-relevant");
  });

  it("company sees ONLY supply entries (strict counterparty filter)", async () => {
    const now = new Date().toISOString();
    const pool = buildMockPool({
      supplyRows: [{
        id: "s1", feed_type: "supply", role: "Helfer", skill_tags: [], location_city: "Berlin",
        location_lat: null, location_lng: null, radius_km: 25, availability_from: "2026-04-01", availability_to: null,
        supplier_company_id: "ag-1", created_at: now, updated_at: now, priority_level: "normal"
      }],
      demandRows: [{
        id: "d1", feed_type: "demand", role: "Helfer", skill_tags: [], location_city: "Berlin",
        location_lat: null, location_lng: null, radius_km: 25, availability_from: "2026-04-01", availability_to: null,
        supplier_company_id: "cmp-1", supplier_role: "company", created_at: now, updated_at: now, priority_level: "normal"
      }]
    });
    const result = await browseFeed(pool, { viewer_role: "company", limit: 25, page: 1 });
    assert.ok(result.items.every(it => it.feed_type === "supply"), "Company darf nur Supply sehen");
  });

  it("uses commercially open demand queries and excludes capacity-origin synthetic demand", async () => {
    const now = new Date().toISOString();
    let demandCountSql = "";
    let demandListSql = "";
    const pool = {
      query: async (sql) => {
        if (sql.includes("SELECT COUNT(*)::int AS cnt") && sql.includes("FROM capacity_posts")) {
          return { rows: [{ cnt: 0 }] };
        }
        if (sql.includes("FROM demand_requests") && sql.includes("COUNT(*)::int AS cnt")) {
          demandCountSql = sql;
          return { rows: [{ cnt: 1 }] };
        }
        if (sql.includes("FROM capacity_posts cp") && sql.includes("ORDER BY sort_date DESC")) {
          return { rows: [] };
        }
        if (sql.includes("FROM demand_requests dr") && sql.includes("ORDER BY COALESCE(dr.updated_at, dr.created_at) DESC")) {
          demandListSql = sql;
          return {
            rows: [{
              id: "d-partial",
              feed_type: "demand",
              status: "partially_covered",
              role: "Lagerhelfer",
              skill_tags: [],
              headcount: 4,
              required_total_count: 4,
              remaining_open_count: 2,
              currently_committed_count: 2,
              committed_headcount: 2,
              location_city: "Berlin",
              location_lat: null,
              location_lng: null,
              radius_km: 25,
              availability_from: "2026-03-20",
              availability_to: null,
              supplier_company_id: "cmp-1",
              supplier_role: "company",
              created_at: now,
              updated_at: now,
              priority_level: "normal"
            }]
          };
        }
        if (sql.includes("FROM capacity_interactions") || sql.includes("FROM supplier_reputation") || sql.includes("FROM subscriptions")) {
          return { rows: [] };
        }
        return { rows: [] };
      }
    };

    const result = await browseFeed(pool, { viewer_role: "agency", limit: 25, page: 1 });
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0].status, "partially_covered");
    assert.match(demandCountSql, /dr\.status IN \('open', 'partially_covered'\)/);
    assert.match(demandListSql, /dr\.status IN \('open', 'partially_covered'\)/);
    assert.match(demandListSql, /NOT EXISTS/);
    assert.match(demandListSql, /capacity_post_id IS NOT NULL/);
  });

  it("applies immediate availability window filters to feed queries", async () => {
    let supplyCountSql = "";
    let supplyListSql = "";
    let demandCountSql = "";
    let demandListSql = "";
    const pool = {
      query: async (sql) => {
        if (sql.includes("SELECT COUNT(*)::int AS cnt") && sql.includes("FROM capacity_posts")) {
          supplyCountSql = sql;
          return { rows: [{ cnt: 0 }] };
        }
        if (sql.includes("FROM capacity_posts cp") && sql.includes("ORDER BY sort_date DESC")) {
          supplyListSql = sql;
          return { rows: [] };
        }
        if (sql.includes("FROM demand_requests") && sql.includes("COUNT(*)::int AS cnt")) {
          demandCountSql = sql;
          return { rows: [{ cnt: 0 }] };
        }
        if (sql.includes("FROM demand_requests dr") && sql.includes("ORDER BY COALESCE(dr.updated_at, dr.created_at) DESC")) {
          demandListSql = sql;
          return { rows: [] };
        }
        if (sql.includes("FROM capacity_interactions") || sql.includes("FROM supplier_reputation") || sql.includes("FROM subscriptions")) {
          return { rows: [] };
        }
        return { rows: [] };
      }
    };

    await browseFeed(pool, { viewer_role: "agency", availability_window: "immediate", availability_from: "2026-04-15", limit: 25, page: 1 });
    assert.match(supplyCountSql, /cp\.availability_from <=/);
    assert.match(supplyCountSql, /cp\.availability_to/);
    assert.match(supplyListSql, /cp\.availability_from <=/);
    assert.match(supplyListSql, /cp\.availability_to/);
    assert.match(demandCountSql, /dr\.start_date <= '2026-04-16'/);
    assert.match(demandCountSql, /dr\.end_date IS NULL OR dr\.end_date >= '2026-04-15'/);
    assert.match(demandListSql, /dr\.start_date <= '2026-04-16'/);
  });
});

// ══ Gegenseitenlogik: Interaktionsrechte ══

describe("capacity interaction policy: strict counterparty rules", () => {
  it("company can interact with agency supply", () => {
    const r = canInteractWithCapacity({ viewerRole: "company", viewerUserId: "c1", supplierUserId: "a1", supplierRole: "agency", entryStatus: "active" });
    assert.strictEqual(r.allowed, true);
  });

  it("agency CANNOT interact with agency supply (same side)", () => {
    const r = canInteractWithCapacity({ viewerRole: "agency", viewerUserId: "a2", supplierUserId: "a1", supplierRole: "agency", entryStatus: "active" });
    assert.strictEqual(r.allowed, false);
    assert.strictEqual(r.code, "ACTION_NOT_ALLOWED_SAME_SIDE");
  });

  it("agency CAN interact with agency supply when inter-agency enabled", () => {
    const r = canInteractWithCapacity({ viewerRole: "agency", viewerUserId: "a2", supplierUserId: "a1", supplierRole: "agency", entryStatus: "active", interAgencyEnabled: true });
    assert.strictEqual(r.allowed, true);
  });

  it("company CANNOT interact with company supply", () => {
    const r = canInteractWithCapacity({ viewerRole: "company", viewerUserId: "c2", supplierUserId: "c1", supplierRole: "company", entryStatus: "active" });
    assert.strictEqual(r.allowed, false);
    assert.strictEqual(r.code, "ACTION_NOT_ALLOWED_SAME_SIDE");
  });

  it("only agency can interact with company demand", () => {
    const ok = canInteractWithDemand({ viewerRole: "agency", viewerUserId: "a1", requesterUserId: "c1", demandStatus: "open" });
    assert.strictEqual(ok.allowed, true);
    const nope = canInteractWithDemand({ viewerRole: "company", viewerUserId: "c2", requesterUserId: "c1", demandStatus: "open" });
    assert.strictEqual(nope.allowed, false);
    assert.strictEqual(nope.code, "AGENCY_CAN_ONLY_INTERACT_WITH_COMPANY_DEMAND");
  });
});

// ══ Placement-Boost: gedeckelt und fair ══

describe("placement boost: capped and fair", () => {
  it("premium boost is reputation-dampened", () => {
    const good = computePremiumBoost("ENTERPRISE", 80);
    const bad = computePremiumBoost("ENTERPRISE", 15);
    assert.ok(good > bad * 2, "Good rep should get much more boost");
  });

  it("free plan gets zero boost", () => {
    assert.strictEqual(computePremiumBoost("FREE", 100), 0);
  });
});

