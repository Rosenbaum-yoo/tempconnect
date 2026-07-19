/**
 * workerService.getWorkerSkills / setWorkerSkills — Katalog-Integrität, replace-all,
 * org-gebundener skill_tags-Spiegel. DB-frei via Tracking-Pool (unterstützt connect()
 * für withTransaction). Geprüft werden Query-Anzahl + SQL-Parameter (Enterprise-Pfeiler #6).
 * Run: node --test test/workerSkills.service.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as workerService from "../services/workerService.js";

function trackingPool(routes = []) {
  const calls = [];
  const query = async (sql, params = []) => {
    const text = typeof sql === "string" ? sql : sql?.text ?? "";
    calls.push({ sql: text, params });
    for (const r of routes) {
      if (r.match(text)) {
        const out = typeof r.respond === "function" ? r.respond(text, params) : r.respond;
        return out ?? { rows: [], rowCount: 0 };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return {
    calls,
    query,
    connect: async () => ({ query, release() {} }),
    find(sub) { return calls.filter((c) => c.sql.includes(sub)); }
  };
}

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const BOGUS = "33333333-3333-3333-3333-333333333333";
const WP = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("workerService.setWorkerSkills", () => {
  it("nur aktive Katalog-Skills, replace-all, org-gebundener Spiegel mit Namen", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM platform_skills WHERE id = ANY"), respond: { rows: [
        { id: S1, name: "Altenpflege" }, { id: S2, name: "Grundpflege" }
      ] } }
    ]);
    const res = await workerService.setWorkerSkills(pool, {
      workerProfileId: WP,
      supplierOrgId: ORG,
      skills: [{ skill_id: S1 }, { skill_id: S2, proficiency: "expert" }, { skill_id: BOGUS }],
      source: "worker"
    });

    assert.equal(res.count, 2); // BOGUS (nicht im Katalog) verworfen
    assert.deepEqual([...res.skill_ids].sort(), [S1, S2].sort());
    assert.equal(pool.find("DELETE FROM worker_profile_skills").length, 1); // replace-all
    assert.equal(pool.find("INSERT INTO worker_profile_skills").length, 2);

    const upd = pool.find("UPDATE worker_profiles");
    assert.equal(upd.length, 1);
    assert.deepEqual([...upd[0].params[0]].sort(), ["Altenpflege", "Grundpflege"].sort());
    assert.equal(upd[0].params[1], WP);  // WHERE id = $2
    assert.equal(upd[0].params[2], ORG); // AND supplier_org_id = $3 (Org-Boundary)

    const s2Insert = pool.find("INSERT INTO worker_profile_skills").find((c) => c.params[1] === S2);
    assert.equal(s2Insert.params[2], "expert"); // proficiency durchgereicht
  });

  it("leere Auswahl: kein INSERT, Spiegel wird org-gebunden geleert", async () => {
    const pool = trackingPool();
    const res = await workerService.setWorkerSkills(pool, {
      workerProfileId: WP, supplierOrgId: ORG, skills: []
    });
    assert.equal(res.count, 0);
    assert.equal(pool.find("INSERT INTO worker_profile_skills").length, 0);
    assert.equal(pool.find("DELETE FROM worker_profile_skills").length, 1);
    const upd = pool.find("UPDATE worker_profiles");
    assert.equal(upd.length, 1);
    assert.deepEqual(upd[0].params[0], []); // leeres skill_tags
    assert.equal(upd[0].params[2], ORG);
  });
});

describe("workerService.getWorkerSkills", () => {
  it("joint platform_skills, org-scope über worker_profile_id, normalisiert Felder", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM worker_profile_skills"), respond: { rows: [
        { id: "row1", skill_id: S1, name: "Altenpflege", category: "Pflege & Betreuung",
          proficiency: "advanced", years_experience: "3.5", is_primary: true, certified: false,
          certificate_ref: null, source: "worker" }
      ] } }
    ]);
    const items = await workerService.getWorkerSkills(pool, WP);
    assert.equal(items.length, 1);
    assert.equal(items[0].name, "Altenpflege");
    assert.equal(items[0].years_experience, 3.5); // Number()-normalisiert
    assert.equal(items[0].is_primary, true);
    assert.deepEqual(pool.find("FROM worker_profile_skills")[0].params, [WP]);
  });
});
