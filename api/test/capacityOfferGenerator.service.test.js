/**
 * capacityOfferGeneratorService — Multi-Skill Angebotsgenerator (Welle 3).
 * DB-frei: Mock-Pool liefert Worker/Skills/Existing; createEntry wird injiziert.
 * Prueft Org-Boundary, N+1-Vorschlaege, Dedup-Markierung, Skip-Logik, Angebotsform.
 * Run: node --test test/capacityOfferGenerator.service.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as gen from "../services/capacityOfferGeneratorService.js";

const WP = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const OTHER_ORG = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const S3 = "33333333-3333-3333-3333-333333333333";
const BOGUS = "99999999-9999-9999-9999-999999999999";

function mockPool({ worker, skills = [], existing = [] }) {
  return {
    query: async (sql) => {
      if (sql.includes("FROM worker_profiles")) return { rows: worker ? [worker] : [] };
      if (sql.includes("FROM worker_profile_skills")) return { rows: skills };
      if (sql.includes("FROM capacity_posts")) return { rows: existing };
      return { rows: [] };
    }
  };
}

const worker = { id: WP, first_name: "Max", last_name: "Muster", city: "Berlin", postal_code: "10115", supplier_org_id: ORG };
const skills3 = [
  { skill_id: S1, name: "Altenpflege", category: "Pflege & Betreuung", is_primary: true },
  { skill_id: S2, name: "Grundpflege", category: "Pflege & Betreuung", is_primary: false },
  { skill_id: S3, name: "Staplerfahrer:in", category: "Logistik & Lager", is_primary: false }
];

describe("buildOfferSuggestions", () => {
  it("erzeugt N Einzel- + 1 Buendelvorschlag, markiert bestehende Angebote", async () => {
    const pool = mockPool({
      worker, skills: skills3,
      existing: [{ id: "e1", offer_kind: "single_skill", primary_skill_id: S1, status: "active" }]
    });
    const res = await gen.buildOfferSuggestions(pool, { orgId: ORG, workerProfileId: WP });
    assert.equal(res.skill_count, 3);
    assert.equal(res.single.length, 3);
    assert.equal(res.bundle.kind, "bundle");
    assert.equal(res.bundle.skill_ids.length, 3);
    // S1 existiert bereits -> markiert, nicht als neu gezaehlt
    const s1 = res.single.find((s) => s.skill_id === S1);
    assert.equal(s1.already_exists, true);
    assert.equal(s1.existing_offer_id, "e1");
    // 2 neue Einzel (S2,S3) + 1 Buendel = 3 neue Angebote
    assert.equal(res.suggested_new_offers, 3);
    assert.equal(res.location_ready, true);
  });

  it("kein Buendel bei nur 1 Skill", async () => {
    const pool = mockPool({ worker, skills: [skills3[0]], existing: [] });
    const res = await gen.buildOfferSuggestions(pool, { orgId: ORG, workerProfileId: WP });
    assert.equal(res.bundle, null);
    assert.equal(res.suggested_new_offers, 1);
  });

  it("Org-Boundary: fremde Org -> FORBIDDEN", async () => {
    const pool = mockPool({ worker, skills: skills3 });
    await assert.rejects(
      () => gen.buildOfferSuggestions(pool, { orgId: OTHER_ORG, workerProfileId: WP }),
      (e) => e.code === "FORBIDDEN"
    );
  });

  it("unbekannter Arbeiter -> WORKER_NOT_FOUND", async () => {
    const pool = mockPool({ worker: null });
    await assert.rejects(
      () => gen.buildOfferSuggestions(pool, { orgId: ORG, workerProfileId: WP }),
      (e) => e.code === "WORKER_NOT_FOUND"
    );
  });
});

describe("buildSingleSkillOfferData / buildBundleOfferData", () => {
  it("Einzelangebot: offer_kind, primary_skill_id, anonym, Entwurf, Ort aus Profil", () => {
    const data = gen.buildSingleSkillOfferData({ worker, skill: skills3[0], orgId: ORG });
    assert.equal(data.offer_kind, "single_skill");
    assert.equal(data.primary_skill_id, S1);
    assert.equal(data.worker_profile_id, WP);
    assert.equal(data.is_anonymous, true);
    assert.equal(data.status, "draft");
    assert.equal(data.location_city, "Berlin");
    assert.deepEqual(data.skill_tags, ["Altenpflege"]);
  });

  it("Buendel: alle Skills, primary aus is_primary", () => {
    const data = gen.buildBundleOfferData({ worker, skills: skills3, orgId: ORG });
    assert.equal(data.offer_kind, "bundle");
    assert.equal(data.primary_skill_id, S1); // is_primary
    assert.equal(data.skill_tags.length, 3);
    assert.equal(data.is_anonymous, true);
  });
});

describe("createOffersFromSelection", () => {
  it("erzeugt gewaehlte Einzel + Buendel, ueberspringt fremde Skills", async () => {
    const pool = mockPool({ worker, skills: skills3 });
    const calls = [];
    let n = 0;
    const createEntry = async (_pool, supplierUserId, plan, data) => {
      calls.push({ supplierUserId, plan, data });
      return { id: "new" + (++n) };
    };
    const res = await gen.createOffersFromSelection(
      pool,
      { supplierUserId: "u1", orgId: ORG, plan: "PRO", workerProfileId: WP, single_skill_ids: [S1, S2, BOGUS], include_bundle: true },
      { createEntry }
    );
    assert.equal(res.created_count, 3); // S1, S2, Buendel
    assert.equal(res.skipped_count, 1); // BOGUS
    assert.equal(res.skipped[0].reason, "not_a_worker_skill");
    // alle erzeugten Angebote sind org-gebunden + als Entwurf
    assert.ok(calls.every((c) => c.data.org_id === ORG && c.data.status === "draft"));
    assert.ok(calls.some((c) => c.data.offer_kind === "bundle"));
    assert.equal(calls.filter((c) => c.data.offer_kind === "single_skill").length, 2);
  });

  it("Dedup: 23505 -> already_exists (kein Fehler)", async () => {
    const pool = mockPool({ worker, skills: skills3 });
    const createEntry = async () => { throw Object.assign(new Error("dup"), { code: "23505" }); };
    const res = await gen.createOffersFromSelection(
      pool,
      { supplierUserId: "u1", orgId: ORG, plan: "PRO", workerProfileId: WP, single_skill_ids: [S1] },
      { createEntry }
    );
    assert.equal(res.created_count, 0);
    assert.equal(res.skipped[0].reason, "already_exists");
  });

  it("ohne Ort -> LOCATION_REQUIRED", async () => {
    const pool = mockPool({ worker: { ...worker, city: null }, skills: skills3 });
    await assert.rejects(
      () => gen.createOffersFromSelection(
        pool,
        { supplierUserId: "u1", orgId: ORG, plan: "PRO", workerProfileId: WP, single_skill_ids: [S1] },
        { createEntry: async () => ({ id: "x" }) }
      ),
      (e) => e.code === "LOCATION_REQUIRED"
    );
  });

  it("Notdienst-Stufe wird an alle erzeugten Angebote durchgereicht", async () => {
    const pool = mockPool({ worker, skills: skills3 });
    const calls = [];
    const createEntry = async (_p, _u, _plan, data) => { calls.push(data); return { id: "x" }; };
    await gen.createOffersFromSelection(
      pool,
      { supplierUserId: "u1", orgId: ORG, plan: "PRO", workerProfileId: WP, single_skill_ids: [S1, S2], include_bundle: true, priority_level: "notdienst" },
      { createEntry }
    );
    assert.equal(calls.length, 3);
    assert.ok(calls.every((d) => d.priority_level === "notdienst"));
    // Default bleibt normal, wenn nichts angegeben:
    const calls2 = [];
    await gen.createOffersFromSelection(
      pool,
      { supplierUserId: "u1", orgId: ORG, plan: "PRO", workerProfileId: WP, single_skill_ids: [S1] },
      { createEntry: async (_p, _u, _plan, data) => { calls2.push(data); return { id: "y" }; } }
    );
    assert.equal(calls2[0].priority_level, "normal");
  });

  it("Premium setzt placement_boost_level (>0) auf allen Angeboten, sonst 0", async () => {
    const pool = mockPool({ worker, skills: skills3 });
    const calls = [];
    const createEntry = async (_p, _u, _plan, data) => { calls.push(data); return { id: "x" }; };
    await gen.createOffersFromSelection(
      pool,
      { supplierUserId: "u1", orgId: ORG, plan: "PRO", workerProfileId: WP, single_skill_ids: [S1, S2], include_bundle: true, premium: true },
      { createEntry }
    );
    assert.equal(calls.length, 3);
    assert.ok(calls.every((d) => d.placement_boost_level === 2));
    const calls2 = [];
    await gen.createOffersFromSelection(
      pool,
      { supplierUserId: "u1", orgId: ORG, plan: "PRO", workerProfileId: WP, single_skill_ids: [S1] },
      { createEntry: async (_p, _u, _plan, data) => { calls2.push(data); return { id: "y" }; } }
    );
    assert.equal(calls2[0].placement_boost_level, 0);
  });
});

describe("buildPoolSuggestion / createPoolOffer (Sammelangebote)", () => {
  const skill = { id: S1, name: "Altenpflege", category: "Pflege & Betreuung" };
  const members = [
    { worker_profile_id: WP, id: WP, first_name: "Max", last_name: "M", city: "Hamburg", active_assignments: 0 },
    { worker_profile_id: "d1111111-1111-1111-1111-111111111111", id: "d1111111-1111-1111-1111-111111111111", first_name: "Anna", last_name: "K", city: "Hamburg", active_assignments: 0 },
    { worker_profile_id: "d2222222-2222-2222-2222-222222222222", id: "d2222222-2222-2222-2222-222222222222", first_name: "Ben", last_name: "B", city: "Kiel", active_assignments: 2 }
  ];
  function poolPool(pmCalls) {
    return {
      query: async (sql, params) => {
        if (sql.includes("FROM platform_skills")) return { rows: [skill] };
        if (sql.includes("active_assignments")) return { rows: members };              // buildPoolSuggestion
        if (sql.includes("JOIN worker_profile_skills wps ON")) return { rows: members }; // createPoolOffer valid
        if (sql.includes("capacity_post_pool_members")) { if (pmCalls) pmCalls.push(params); return { rows: [] }; }
        return { rows: [] };
      }
    };
  }

  it("buildPoolSuggestion: zählt Mitglieder + freie", async () => {
    const res = await gen.buildPoolSuggestion(poolPool(), { orgId: ORG, skillId: S1 });
    assert.equal(res.skill_name, "Altenpflege");
    assert.equal(res.total, 3);
    assert.equal(res.free_count, 2);
  });

  it("buildPoolSuggestion: unbekannter Skill -> SKILL_NOT_FOUND", async () => {
    const pool = { query: async () => ({ rows: [] }) };
    await assert.rejects(() => gen.buildPoolSuggestion(pool, { orgId: ORG, skillId: S1 }), (e) => e.code === "SKILL_NOT_FOUND");
  });

  it("createPoolOffer: EIN pool_single_skill mit headcount, dominanter Stadt, Mitgliedern", async () => {
    const pmCalls = [];
    const calls = [];
    const createEntry = async (_p, _u, _plan, data) => { calls.push(data); return { id: "pool1" }; };
    const res = await gen.createPoolOffer(
      poolPool(pmCalls),
      { supplierUserId: "u1", orgId: ORG, plan: "PRO", skillId: S1,
        workerProfileIds: members.map((m) => m.id), premium: true, priority_level: "notdienst" },
      { createEntry }
    );
    assert.equal(res.offer_kind, "pool_single_skill");
    assert.equal(res.member_count, 3);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].offer_kind, "pool_single_skill");
    assert.equal(calls[0].headcount, 3);
    assert.equal(calls[0].primary_skill_id, S1);
    assert.equal(calls[0].worker_profile_id, null);
    assert.equal(calls[0].priority_level, "notdienst");
    assert.equal(calls[0].placement_boost_level, 2);
    assert.equal(calls[0].location_city, "Hamburg"); // 2x Hamburg schlägt 1x Kiel
    assert.equal(pmCalls.length, 1);
    assert.equal(pmCalls[0][1].length, 3);
  });

  it("createPoolOffer: keine gültigen Mitglieder -> NO_VALID_MEMBERS", async () => {
    const pool = { query: async (sql) => (sql.includes("FROM platform_skills") ? { rows: [skill] } : { rows: [] }) };
    await assert.rejects(
      () => gen.createPoolOffer(pool, { supplierUserId: "u1", orgId: ORG, plan: "PRO", skillId: S1, workerProfileIds: [WP] }, { createEntry: async () => ({ id: "x" }) }),
      (e) => e.code === "NO_VALID_MEMBERS"
    );
  });
});
